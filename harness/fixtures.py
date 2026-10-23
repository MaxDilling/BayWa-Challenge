"""Writes fixtures/golden/<model>/<case>.json: an AnalyzeRequest and windgap's response to it (minus `engine`), and
fixtures/models.json: the ModelInfo list. The ts engine must reproduce both for every model it ports. Run: make fixtures"""

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from harness.synthetic import generic_power_curve, synthetic_pair
from windgap.core.grid import series_to_grid, to_ms
from windgap.core.schema import STEP
from windgap.engine import analyze
from windgap.models import registry

GOLDEN = Path(__file__).resolve().parent.parent / "fixtures" / "golden"
MODELS = GOLDEN.parent / "models.json"


def _request(target: pd.Series, refs: dict[str, pd.Series], start: pd.Timestamp, steps: int, model: str) -> dict:
    curve = generic_power_curve(n_turbines=4)
    target = target.round(2)
    target[(target.index >= start) & (target.index < start + steps * STEP)] = np.nan
    return {
        "target": series_to_grid(target),
        "references": [{"id": rid, "grid": series_to_grid(s.round(2))} for rid, s in refs.items()],
        "powerCurve": {"windMs": curve.wind_ms.tolist(), "powerKw": curve.power_kw.tolist(), "nTurbines": 4},
        "outage": {"startMs": to_ms(start), "endMs": to_ms(start + steps * STEP)},
        "model": model,
    }


def cases(model: str) -> dict[str, dict]:
    basic = synthetic_pair(days=4, seed=1)

    multi = synthetic_pair(days=6, seed=2)
    noise = np.random.default_rng(3).normal(0, 0.5, len(multi))
    ref_b = (multi["ref"] * 1.1 + noise).clip(lower=0).iloc[144:]  # starts one day later than the target
    target = multi["target"].copy()
    target.iloc[300:302] = np.nan
    target.iloc[500:510] = np.nan

    return {
        "basic": _request(basic["target"], {"ref_a": basic["ref"]}, basic.index[3 * 144 + 72], 36, model),
        "two_refs_gaps": _request(target, {"ref_a": multi["ref"], "ref_b": ref_b}, multi.index[4 * 144], 144, model),
    }


def main() -> None:
    shutil.rmtree(GOLDEN, ignore_errors=True)
    for model in registry.names():
        for case, request in cases(model).items():
            response = analyze(request)
            del response["engine"]
            path = GOLDEN / model / f"{case}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"request": request, "response": response}, allow_nan=False))
            print(f"wrote {path.relative_to(GOLDEN.parent.parent)}")
    MODELS.write_text(json.dumps(registry.info(), indent=2) + "\n")
    print(f"wrote {MODELS.relative_to(GOLDEN.parent.parent)}")


if __name__ == "__main__":
    main()
