"""Predictions for a submission without the GUI: every outage of the target goes through the same path as the GUI
(windgap.core.io → windgap.core.outage → windgap.engine.handle), and the target is written in the challenge format
with the predicted mean in the outages (windgap.core.io.filled_target_csv, the same file as the GUI's export).
An outage the engine refuses (e.g. no target data before it) stays NaN, is reported, and the exit status is 1.

uv run python -m harness.predict --target t.csv --reference r.csv [--reference r2.csv ...] --power-curve c.csv \
    --n-turbines 4 [--model NAME] [--out predictions.csv]"""

import argparse
import json
import sys
from pathlib import Path

from harness.datasets import file_texts
from windgap.core import io
from windgap.core.grid import series_to_grid, to_ms
from windgap.core.outage import detect_outages, fill_during_outage
from windgap.engine import handle
from windgap.models import registry


def predict(target: Path, references: list[Path], power_curve: Path, n_turbines: int, model: str
            ) -> tuple[str, list[str], list[str]]:
    """(filled target CSV, one line per filled outage, one line per outage that could not be filled)."""
    sites = [site for name, text in file_texts(target) for site, _ in io.read_wind_csv(name, text)]
    if len(sites) != 1:
        raise io.CsvError(f"{target}: expected one wind column, found {', '.join(s.site_id for s in sites)}.")
    tgt = sites[0].wind
    ref_sites = [site for path in references for name, text in file_texts(path) for site, _ in io.read_wind_csv(name, text)]
    refs = [site.wind for site in ref_sites]
    [(_, curve_text)] = file_texts(power_curve)
    curve = io.read_power_curve_csv(curve_text)
    predictions, filled, failed = [], [], []
    for outage in detect_outages(tgt, refs)[0]:
        span = f"{outage.start:%Y-%m-%d %H:%M} – {outage.end:%Y-%m-%d %H:%M} UTC"
        request = {
            "target": series_to_grid(tgt),
            "references": [{"id": s.site_id, "grid": series_to_grid(fill_during_outage(s.wind, outage)),
                            **({"direction": series_to_grid(s.extra["direction"])} if s.extra is not None else {})}
                           for s in ref_sites],
            "powerCurve": {"windMs": curve.wind_ms.tolist(), "powerKw": curve.power_kw.tolist(), "nTurbines": n_turbines},
            "outage": {"startMs": to_ms(outage.start), "endMs": to_ms(outage.end)},
            "model": model,
        }
        try:
            response = json.loads(handle(json.dumps(request)))
        except ValueError as e:
            failed.append(f"{span}: {e}")
            continue
        predictions.append(response["prediction"])
        e = response["energy"]
        filled.append(f"{span}: {len(response['prediction']['mean'])} values, lost energy {e['kwhP50']:,.0f} kWh "
                      f"(10–90 %: {e['kwhP10']:,.0f}–{e['kwhP90']:,.0f} kWh, {n_turbines} turbines)")
    return io.filled_target_csv(series_to_grid(tgt), predictions), filled, failed


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m harness.predict", description=__doc__.split("\n\n")[0])
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--reference", type=Path, action="append", required=True)
    parser.add_argument("--power-curve", type=Path, required=True)
    parser.add_argument("--n-turbines", type=int, required=True, help="turbines in the target farm (energy only)")
    parser.add_argument("--model", choices=registry.names(), default=registry.RECOMMENDED)
    parser.add_argument("--out", type=Path, default=Path("predictions.csv"))
    args = parser.parse_args()
    csv, filled, failed = predict(args.target, args.reference, args.power_curve, args.n_turbines, args.model)
    args.out.write_text(csv)
    print(f"{args.model}: wrote {args.out}", *filled, sep="\n")
    if failed:
        print("Not filled:", *failed, sep="\n", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
