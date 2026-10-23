from typing import Self

import numpy as np
import pandas as pd

from windgap.models.base import Explanation, calibrate, choice_diagnostics, gaussian_prediction, pick_reference
from windgap.models.registry import register


@register("identity")
class Identity:
    """M0: lower bound and plumbing check. Uses the reference that correlates best with the target."""

    label = "Reference as is (baseline)"
    tagline = "Takes the reference wind unchanged; every other method must beat it."

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        self.ref, _, self.r, self.r_refs = pick_reference(refs, y, 0)
        x = refs.iloc[:, self.ref].to_numpy(dtype=float)
        self.n_train = int((~np.isnan(x) & ~np.isnan(y)).sum())
        self.errors = calibrate(x, y, lambda x, y: lambda v: v)
        return self

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.iloc[:, self.ref].to_numpy(dtype=float)
        return gaussian_prediction(x, self.errors.sigma(x), refs.index)

    def explain(self) -> Explanation:
        return Explanation(
            summary=(
                "The missing wind speed is taken to be the reference wind speed. "
                "It is the simplest possible assumption and the baseline every other method must beat."
            ),
            formula=r"\hat{v}_t = v_r",
            diagnostics={"r": self.r, "n_train": self.n_train, "sigma_0": self.errors.sigma_0,
                         "sigma_slope": self.errors.sigma_slope, "error_memory_h": self.errors.memory_h,
                         **choice_diagnostics(self.ref, self.r_refs)},
        )
