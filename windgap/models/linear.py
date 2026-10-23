"""M1–M3: v̂_t = a + b · v_r(t − τ). Linear regression and variance ratio differ only in how (a, b) are chosen;
the reference r and the delay τ are chosen on the training data alone, where target and reference correlate best."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.core.schema import STEP_S
from windgap.models.base import Explanation, calibrate, choice_diagnostics, gaussian_prediction, lagged_pairs, pick_reference
from windgap.models.registry import register


class _Linear:
    summary: str
    formula = r"\hat{v}_t = a + b \cdot v_r(t - \tau)"

    def __init__(self, lag_max_min: int = 60):
        self.lag_max = int(lag_max_min) * 60 // STEP_S

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        self.ref, self.lag, self.r, self.r_refs = pick_reference(refs, y, self.lag_max)
        x, y = lagged_pairs(refs.iloc[:, self.ref].to_numpy(dtype=float), y, self.lag)
        ok = ~np.isnan(x) & ~np.isnan(y)
        self.a, self.b = self.coefficients(x[ok], y[ok])
        self.n_train = int(ok.sum())
        self.errors = calibrate(x, y, self._line)
        return self

    def _line(self, x: np.ndarray, y: np.ndarray):
        a, b = self.coefficients(x, y)
        return lambda v: a + b * v

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.iloc[:, self.ref].to_numpy(dtype=float)
        # beyond the edges of `refs` the edge value stands in; callers pass context (backtest.predict_window)
        shifted = x[np.clip(np.arange(len(x)) - self.lag, 0, len(x) - 1)]
        mean = self.a + self.b * shifted
        return gaussian_prediction(mean, self.errors.sigma(mean), refs.index)

    def explain(self) -> Explanation:
        return Explanation(
            summary=self.summary,
            formula=self.formula,
            params={"a": self.a, "b": self.b},
            diagnostics={"r": self.r, "lag_min": self.lag * STEP_S / 60, "n_train": self.n_train,
                         "sigma_0": self.errors.sigma_0, "sigma_slope": self.errors.sigma_slope,
                         "error_memory_h": self.errors.memory_h, **choice_diagnostics(self.ref, self.r_refs)},
        )


@register("linear_regression")
class LinearRegression(_Linear):
    label = "Linear regression (MCP)"
    tagline = "Least-squares line through the reference wind, shifted by the delay between the farms."
    summary = ("The missing wind speed follows a straight line through the reference wind speed, fitted by least "
               "squares on the time both parks measured. The reference is shifted by the delay τ at which both parks "
               "agree best, because weather reaches them one after the other.")

    @staticmethod
    def coefficients(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
        b = float(np.cov(x, y)[0, 1] / np.var(x, ddof=1))
        return float(y.mean() - b * x.mean()), b


@register("variance_ratio")
class VarianceRatio(_Linear):
    label = "Variance ratio (MCP)"
    tagline = "Line that keeps the target's mean and spread, shifted by the delay between the farms."
    summary = ("The missing wind speed follows a straight line through the reference wind speed that keeps the "
               "target's average and spread from the training period: b is the ratio of their standard deviations. "
               "The reference is shifted by the delay τ at which both parks agree best.")

    @staticmethod
    def coefficients(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
        b = float(np.std(y) / np.std(x))
        return float(y.mean() - b * x.mean()), b

