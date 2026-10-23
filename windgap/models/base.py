from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol, Self

import numpy as np
import pandas as pd

from windgap.core.schema import STEP_H, Z90

PREDICTION_COLUMNS = ["mean", "std", "q10", "q50", "q90"]
N_BLOCKS = 5
MAX_MEMORY_STEPS = 432  # 3 days

Fit = Callable[[np.ndarray, np.ndarray], Callable[[np.ndarray], np.ndarray]]


@dataclass
class Explanation:
    summary: str  # 2–3 sentences, Markdown
    formula: str  # LaTeX
    params: dict[str, float] = field(default_factory=dict)
    diagnostics: dict[str, float] = field(default_factory=dict)


@dataclass
class Errors:
    """Out-of-sample errors in the training period: σ_t = sigma_0 + sigma_slope · v̂_t for the 80 % band, and
    the autocorrelation of err_t / σ_t for the energy band."""

    sigma_0: float  # m/s
    sigma_slope: float  # m/s per m/s of predicted wind, ≥ 0
    acf: np.ndarray  # at lags 0, 1, … steps, up to the last lag before it first drops to ≤ 0

    def sigma(self, mean: np.ndarray) -> np.ndarray:
        return self.sigma_0 + self.sigma_slope * np.clip(mean, 0, None)

    @property
    def memory_h(self) -> float:
        """Integral time scale (1 + 2 Σ_{k≥1} acf(k)) · 10 min: how long errors persist."""
        return float((2 * self.acf.sum() - 1) * STEP_H)


class WindModel(Protocol):
    """fit sees only data before the outage; predict uses refs/extra only, never the target.
    fit sets `errors`, whose autocorrelation the energy band (S4) needs."""

    name: str
    errors: Errors

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self: ...

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame: ...

    def explain(self) -> Explanation: ...


def calibrate(x: np.ndarray, y: np.ndarray, fit: Fit) -> Errors:
    """Leave-one-block-out on the training grid (NaN = missing): each of N_BLOCKS contiguous blocks is predicted by
    `fit` on the other blocks, so σ and the memory describe errors on unseen data, not the fit quality.
    The mean absolute error is a line in the prediction (least squares, both coefficients ≥ 0), scaled so that
    80 % of the errors lie within ±Z90 · σ_t."""
    ok = ~np.isnan(x) & ~np.isnan(y)
    pred = np.full(len(y), np.nan)
    for block in np.array_split(np.arange(len(y)), N_BLOCKS):
        train = ok.copy()
        train[block] = False
        pred[block] = fit(x[train], y[train])(x[block])
    err = pred - y
    valid = ~np.isnan(err)
    v, e = np.clip(pred[valid], 0, None), np.abs(err[valid])
    slope = max(0.0, float(np.cov(v, e)[0, 1] / np.var(v, ddof=1)))
    base = e.mean() - slope * v.mean()
    if base < 0:
        base, slope = 0.0, float(v @ e / (v @ v))
    scale = float(np.quantile(e / (base + slope * v), 0.8)) / Z90
    errors = Errors(scale * base, scale * slope, np.array([1.0]))
    errors.acf = _acf(err / errors.sigma(pred))
    return errors


def _acf(err: np.ndarray) -> np.ndarray:
    """Autocorrelation about 0, not about the mean, so a persistent bias counts as memory. Pairs with a missing
    value are skipped; stops before the first lag with acf ≤ 0 or without pairs, at most MAX_MEMORY_STEPS."""
    valid = ~np.isnan(err)
    z = np.where(valid, err, 0.0)
    v = valid.astype(float)
    var = (z @ z) / v.sum()
    acf = [1.0]
    for k in range(1, min(MAX_MEMORY_STEPS, len(z) - 1) + 1):
        n = v[:-k] @ v[k:]
        if not n or (c := (z[:-k] @ z[k:]) / n / var) <= 0:
            break
        acf.append(float(c))
    return np.array(acf)


def gaussian_prediction(mean: np.ndarray, std: np.ndarray, index: pd.Index) -> pd.DataFrame:
    """Prediction frame from a normal distribution per step, every column floored at 0 m/s."""
    floor = np.maximum(mean, 0)
    return pd.DataFrame(
        {
            "mean": floor,
            "std": std,
            "q10": np.maximum(mean - Z90 * std, 0),
            "q50": floor,
            "q90": np.maximum(mean + Z90 * std, 0),
        },
        index=index,
    )


def correlation(x: np.ndarray, y: np.ndarray) -> float:
    """Pearson r over the steps where both are measured."""
    ok = ~np.isnan(x) & ~np.isnan(y)
    return float(np.corrcoef(x[ok], y[ok])[0, 1]) if ok.sum() > 1 else float("nan")
