"""Simulated outages on data with known truth. The engine's validation and the harness scenarios both build on `fold`."""

import numpy as np
import pandas as pd

from windgap.core.metrics import evaluate, summarize
from windgap.core.schema import STEP, PowerCurve
from windgap.models import registry
from windgap.models.base import WindModel

MIN_TRAIN_STEPS = 144  # one day
CONTEXT_STEPS = 36  # 6 h of reference on either side of the window


def predict_window(model: WindModel, refs: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp,
                   extra: pd.DataFrame | None = None) -> pd.DataFrame:
    """Prediction for [start, end), made from the window plus the complete reference rows right before and after it
    (up to CONTEXT_STEPS each), so a model that shifts the reference by τ uses measured values, not the window's edge.
    `extra` (S3) goes along with the same rows."""
    i, j = refs.index.searchsorted([start, end])
    complete = refs.notna().all(axis=1).to_numpy()
    before = _leading(complete[max(0, i - CONTEXT_STEPS):i][::-1])
    after = _leading(complete[j:j + CONTEXT_STEPS])
    rows = slice(i - before, j + after)
    return model.predict(refs.iloc[rows], None if extra is None else extra.iloc[rows]).iloc[before:before + j - i]


def _leading(mask: np.ndarray) -> int:
    """Number of leading True values."""
    return len(mask) if mask.all() else int(np.argmin(mask))


def fold(model: str, params: dict, target: pd.Series, refs: pd.DataFrame, curve: PowerCurve,
         start: pd.Timestamp, end: pd.Timestamp, extra: pd.DataFrame | None = None
         ) -> tuple[pd.DataFrame, dict[str, float]]:
    """Fit on the target on both sides of [start, end), predict it, score against the hidden target."""
    window = (target.index >= start) & (target.index < end)
    fitted = registry.create(model, **params).fit(target.where(~window), refs, extra)
    pred = predict_window(fitted, refs, start, end, extra)
    return pred, evaluate(target[window], pred, curve, fitted.errors.acf)


def backtest(model: str, params: dict, target: pd.Series, refs: pd.DataFrame, curve: PowerCurve,
             before: pd.Timestamp, length: int, extra: pd.DataFrame | None = None, n_folds: int = 5
             ) -> dict[str, float]:
    """Summarized metrics over up to `n_folds` outages of `length` steps, tiled backwards from `before`."""
    results = []
    for i in range(1, n_folds + 1):
        start_pos = target.index.searchsorted(before) - i * length
        if start_pos < MIN_TRAIN_STEPS:
            break
        start = target.index[start_pos]
        _, metrics = fold(model, params, target, refs, curve, start, start + length * STEP, extra)
        if metrics:
            results.append(metrics)
    if not results:
        return {}
    return summarize(results) | {"n_folds": float(len(results))}
