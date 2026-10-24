"""variance_ratio (M2): a line that keeps the target's mean and spread, b = σ_target / σ_reference. Kept as the textbook
comparison: with the power averaged over the uncertainty it counts the spread twice and overestimates the energy."""

import numpy as np

from windgap.models.linear import _Linear
from windgap.models.registry import register

NAMES = ["variance_ratio"]


@register("variance_ratio")
class VarianceRatio(_Linear):
    label = "Variance ratio (MCP)"
    tagline = "Line that keeps the target's mean and spread, shifted by the delay between the farms."
    summary = ("The missing wind speed follows a straight line through the reference wind speed that keeps the "
               "target's average and spread from the training period: b is the ratio of their standard deviations.")

    @staticmethod
    def coefficients(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
        b = float(np.std(y) / np.std(x))
        return float(y.mean() - b * x.mean()), b
