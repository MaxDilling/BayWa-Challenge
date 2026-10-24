"""M7: v̂_t = a + Σᵢ bᵢ · vᵢ(t − τᵢ). Every reference at the delay τᵢ where it tracks the target best, weights by least
squares on the training data. A reference whose weight would be negative is left out and the rest refitted, so every
weight says how much that reference counts; with one reference this is linear regression."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.core.schema import STEP_S
from windgap.models.base import Explanation, best_lag, calibrate, correlation, gaussian_prediction
from windgap.models.registry import register


@register("multi_regression")
class MultiRegression:
    label = "Multiple regression (MCP)"
    tagline = "Least-squares weights over all reference farms, each shifted by its own delay."
    summary = ("The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay τ; "
               "the weights are fitted by least squares on the time all farms measured, so references that agree with "
               "the target count more and their independent errors partly cancel. A reference that would get a "
               "negative weight is left out.")
    formula = r"\hat{v}_t = a + \sum_i b_i \cdot v_i(t - \tau_i)"

    def __init__(self, lag_max_min: int = 60):
        self.lag_max = int(lag_max_min) * 60 // STEP_S

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        best = [best_lag(refs.iloc[:, i].to_numpy(dtype=float), y, self.lag_max) for i in range(refs.shape[1])]
        self.r_refs = [r for r, _ in best]
        self.lags = [lag for _, lag in best]
        x = np.column_stack([_shifted(refs.iloc[:, i].to_numpy(dtype=float), lag) for i, lag in enumerate(self.lags)])
        self.used = [i for i, r in enumerate(self.r_refs) if np.isfinite(r)]
        while True:
            ok = ~np.isnan(x[:, self.used]).any(axis=1) & ~np.isnan(y)
            self.a, self.b = _least_squares(x[ok][:, self.used], y[ok])
            if len(self.used) == 1 or (self.b >= 0).all():
                break
            del self.used[int(np.argmin(self.b))]
        self.n_train = int(ok.sum())
        self.r = correlation(self.a + x[:, self.used] @ self.b, y)
        self.errors = calibrate(x[:, self.used], y, self._fit)
        return self

    @staticmethod
    def _fit(x: np.ndarray, y: np.ndarray):
        a, b = _least_squares(x, y)
        return lambda v: a + v @ b

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.to_numpy(dtype=float)
        n = len(x)
        # beyond the edges of `refs` the edge value stands in; callers pass context (backtest.predict_window)
        mean = self.a + sum(b * x[np.clip(np.arange(n) - self.lags[i], 0, n - 1), i] for i, b in zip(self.used, self.b))
        return gaussian_prediction(mean, self.errors.sigma(mean), refs.index)

    def explain(self) -> Explanation:
        weights = dict(zip(self.used, self.b))
        refs = range(len(self.r_refs))
        return Explanation(
            summary=self.summary,
            formula=self.formula,
            params={"a": self.a, **{f"b_ref_{i}": float(weights.get(i, 0.0)) for i in refs}},
            diagnostics={"r": self.r, "n_train": self.n_train, "sigma_0": self.errors.sigma_0,
                         "sigma_slope": self.errors.sigma_slope, "error_memory_h": self.errors.memory_h,
                         **{f"lag_min_ref_{i}": self.lags[i] * STEP_S / 60 for i in refs},
                         **({f"r_ref_{i}": self.r_refs[i] for i in refs} if len(refs) > 1 else {})},
        )


def _least_squares(x: np.ndarray, y: np.ndarray) -> tuple[float, np.ndarray]:
    """(a, b) of y ≈ a + x @ b, from the normal equations of the centered data (the ts port solves the same system)."""
    mx, my = x.mean(axis=0), y.mean()
    xc = x - mx
    b = np.linalg.solve(xc.T @ xc, xc.T @ (y - my))
    return float(my - b @ mx), b


def _shifted(x: np.ndarray, lag: int) -> np.ndarray:
    """x(t − lag) on the same grid, NaN where it lies outside."""
    out = np.full(len(x), np.nan)
    n = len(x)
    out[max(0, lag):n - max(0, -lag)] = x[max(0, -lag):n - max(0, lag)]
    return out
