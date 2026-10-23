from typing import Self

import numpy as np
import pandas as pd

from windgap.models.base import Explanation, calibrate, correlation, gaussian_prediction
from windgap.models.registry import register


@register("identity")
class Identity:
    """M0: lower bound and plumbing check. Uses the first reference only."""

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        x, y = refs.iloc[:, 0].to_numpy(dtype=float), target.to_numpy(dtype=float)
        self.r = correlation(x, y)
        self.n_train = int((~np.isnan(x) & ~np.isnan(y)).sum())
        self.errors = calibrate(x, y, lambda x, y: lambda v: v)
        return self

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.iloc[:, 0].to_numpy(dtype=float)
        return gaussian_prediction(x, self.errors.sigma(x), refs.index)

    def explain(self) -> Explanation:
        return Explanation(
            summary=(
                "The missing wind speed is taken to be the reference wind speed. "
                "It is the simplest possible assumption and the baseline every other method must beat."
            ),
            formula=r"\hat{v}_t = v_r",
            diagnostics={"r": self.r, "n_train": self.n_train, "sigma_0": self.errors.sigma_0,
                         "sigma_slope": self.errors.sigma_slope, "error_memory_h": self.errors.memory_h},
        )
