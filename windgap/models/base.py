from dataclasses import dataclass, field
from typing import Protocol, Self

import numpy as np
import pandas as pd

PREDICTION_COLUMNS = ["mean", "std", "q10", "q50", "q90"]
Z90 = 1.2815515655446004  # standard normal 90 % quantile


@dataclass
class Explanation:
    summary: str  # 2–3 sentences, Markdown
    formula: str  # LaTeX
    params: dict[str, float] = field(default_factory=dict)
    diagnostics: dict[str, float] = field(default_factory=dict)


class WindModel(Protocol):
    """fit sees only data before the outage; predict uses refs/extra only, never the target."""

    name: str

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self: ...

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame: ...

    def explain(self) -> Explanation: ...


def gaussian_prediction(mean: pd.Series, std: pd.Series | float) -> pd.DataFrame:
    """Prediction frame from a normal distribution per step, every column floored at 0 m/s."""
    std = pd.Series(std, index=mean.index, dtype=float)
    return pd.DataFrame(
        {
            "mean": mean.clip(lower=0),
            "std": std,
            "q10": (mean - Z90 * std).clip(lower=0),
            "q50": mean.clip(lower=0),
            "q90": (mean + Z90 * std).clip(lower=0),
        },
        index=mean.index,
    )


def correlation(a: pd.Series, b: pd.Series) -> float:
    pairs = pd.concat([a, b], axis=1).dropna()
    return float(np.corrcoef(pairs.iloc[:, 0], pairs.iloc[:, 1])[0, 1]) if len(pairs) > 1 else float("nan")
