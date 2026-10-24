"""Writes fixtures/golden/<model>/<case>.json: an AnalyzeRequest and windgap's response to it (minus `engine`),
fixtures/models.json: the ModelInfo list, and fixtures/predict/demo.csv: the demo target filled by harness.predict.
The ts engine must reproduce all of them (the GUI's "Filled target series" export must equal demo.csv). Run: make fixtures"""

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from harness.predict import predict
from harness.synthetic import generic_power_curve, synthetic_pair
from windgap.core.grid import series_to_grid, to_ms
from windgap.core.schema import STEP
from windgap.engine import analyze
from windgap.models import registry

GOLDEN = Path(__file__).resolve().parent.parent / "fixtures" / "golden"
MODELS = GOLDEN.parent / "models.json"
DEMO = GOLDEN.parent.parent / "data" / "synthetic"
PREDICT = GOLDEN.parent / "predict" / "demo.csv"


def demo_prediction() -> str:
    """harness.predict on the demo files with the GUI's demo settings (4 turbines, recommended model)."""
    csv, _, _ = predict(DEMO / "demo_target.csv", [DEMO / "demo_reference.csv"], DEMO / "demo_power_curve.csv", 4,
                        registry.RECOMMENDED)
    return csv


def _request(target: pd.Series, refs: dict[str, pd.Series], start: pd.Timestamp, steps: int, model: str,
             directions: dict[str, pd.Series] | None = None) -> dict:
    curve = generic_power_curve(n_turbines=4)
    target = target.round(2)
    target[(target.index >= start) & (target.index < start + steps * STEP)] = np.nan
    return {
        "target": series_to_grid(target),
        "references": [{"id": rid, "grid": series_to_grid(s.round(2)),
                        **({"direction": series_to_grid(directions[rid])} if rid in (directions or {}) else {})}
                       for rid, s in refs.items()],
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

    # The target loses 15 % of its wind when ref_a's direction is within 30° of west (the wake of a neighbour);
    # directions end in .x5 so that no value falls on a sector edge, where the two engines might round apart
    walk = np.cumsum(np.random.default_rng(4).normal(0, 8, len(multi)))
    direction = pd.Series((200 + walk) % 360, index=multi.index).round(1) + 0.05
    direction.iloc[100:110] = np.nan
    shaded = ((direction - 270 + 180) % 360 - 180).abs() < 30
    waked = target.where(~shaded, target * 0.85)

    return {
        "directions": _request(waked, {"ref_a": multi["ref"], "ref_b": ref_b}, multi.index[4 * 144], 144, model,
                               {"ref_a": direction}),
        "basic": _request(basic["target"], {"ref_a": basic["ref"]}, basic.index[3 * 144 + 72], 36, model),
        "decoy_first": _request(basic["target"], {"far_away": synthetic_pair(days=4, seed=9)["ref"], "ref_a": basic["ref"]},
                                basic.index[3 * 144 + 72], 36, model),
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
    PREDICT.parent.mkdir(exist_ok=True)
    PREDICT.write_text(demo_prediction())
    print(f"wrote {PREDICT.relative_to(GOLDEN.parent.parent)}")


if __name__ == "__main__":
    main()
