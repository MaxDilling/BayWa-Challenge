"""mean_regression: the reference farms averaged instead of weighted by least squares as in multi_regression."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.models.base import calibrate, gaussian_prediction
from windgap.models.multi import MultiRegression, _least_squares, _sector_factors
from windgap.models.registry import register

NAMES = ["mean_regression"]


@register("mean_regression")
class MeanRegression(MultiRegression):
    """v̂ = f_s · (a + b · mean_i vᵢ(t − τᵢ)): one line through the average of all reference farms."""

    label = "Mean of references (MCP)"
    tagline = "A straight line through the average wind of all reference farms, each at its own delay."

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        m = self._delays(refs, y)[:, self.used].mean(axis=1)
        ok = ~np.isnan(m) & ~np.isnan(y)
        self.a, self.b = _least_squares(m[ok, None], y[ok])
        sector = self._sector(extra, len(y))
        self.factors, _ = _sector_factors(self.a + m * self.b[0], y, sector, self.sectors)
        self.errors = calibrate(np.column_stack([m, sector]), y, self._fit)
        return self

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.to_numpy(dtype=float)
        n = len(x)
        m = np.column_stack([x[np.clip(np.arange(n) - self.lags[i], 0, n - 1), i] for i in self.used]).mean(axis=1)
        mean = (self.a + m * self.b[0]) * self.factors[self._sector(extra, n)]
        return gaussian_prediction(mean, self.errors.sigma(mean), refs.index)
