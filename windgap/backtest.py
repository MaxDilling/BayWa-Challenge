"""Simulated outages on data with known truth. The engine's validation and the harness scenarios both build on `fold`."""

import numpy as np
import pandas as pd

from windgap.core.metrics import evaluate
from windgap.core.schema import STEP, PowerCurve
from windgap.models import registry

MIN_TRAIN_STEPS = 144  # one day


def fold(model: str, params: dict, target: pd.Series, refs: pd.DataFrame, curve: PowerCurve,
         start: pd.Timestamp, end: pd.Timestamp) -> tuple[pd.DataFrame, dict[str, float]]:
    """Fit on everything before `start`, predict [start, end), score against the hidden target."""
    before = target.index < start
    window = (target.index >= start) & (target.index < end)
    fitted = registry.create(model, **params).fit(target[before], refs[before])
    pred = fitted.predict(refs[window])
    return pred, evaluate(target[window], pred, curve)


def backtest(model: str, params: dict, target: pd.Series, refs: pd.DataFrame, curve: PowerCurve,
             length: int, n_folds: int = 5) -> dict[str, float]:
    """Mean metrics over up to `n_folds` outages of `length` steps, tiled backwards from the end of `target`."""
    results = []
    for i in range(1, n_folds + 1):
        start_pos = len(target) - i * length
        if start_pos < MIN_TRAIN_STEPS:
            break
        start = target.index[start_pos]
        _, metrics = fold(model, params, target, refs, curve, start, start + length * STEP)
        if metrics:
            results.append(metrics)
    if not results:
        return {}
    table = pd.DataFrame(results)
    summary = table.mean().to_dict()
    summary["energy_dev_pct"] = float(np.nanmean(table["energy_dev_pct"].abs()))
    summary["n_folds"] = float(len(results))
    return summary
