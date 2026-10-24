"""identity: the harness baseline (score 1). Takes the reference that correlates best with the target, unchanged."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.models.base import calibrate, gaussian_prediction, pick_reference
from windgap.models.registry import register

NAMES = ["identity"]


@register("identity")
class Identity:
    label = "Reference as is (baseline)"
    tagline = "Takes the reference wind unchanged; every other method must beat it."

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        self.ref, _, _, _ = pick_reference(refs, y, 0)
        self.errors = calibrate(refs.iloc[:, self.ref].to_numpy(dtype=float), y, lambda x, y: lambda v: v)
        return self

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.iloc[:, self.ref].to_numpy(dtype=float)
        return gaussian_prediction(x, self.errors.sigma(x), refs.index)
