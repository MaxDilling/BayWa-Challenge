import pandas as pd

from windgap.models.base import Explanation, correlation, gaussian_prediction
from windgap.models.registry import register


@register("identity")
class Identity:
    """M0: lower bound and plumbing check. Uses the first reference only."""

    def __init__(self, sigma: float = 1.0):
        self.sigma = float(sigma)

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> "Identity":
        self.r = correlation(target, refs.iloc[:, 0])
        self.n_train = int(pd.concat([target, refs.iloc[:, 0]], axis=1).dropna().shape[0])
        return self

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        return gaussian_prediction(refs.iloc[:, 0], self.sigma)

    def explain(self) -> Explanation:
        return Explanation(
            summary=(
                "The missing wind speed is taken to be the reference wind speed. "
                "It is the simplest possible assumption and the baseline every other method must beat."
            ),
            formula=r"\hat{v}_t = v_r",
            params={"sigma": self.sigma},
            diagnostics={"r": self.r, "n_train": self.n_train},
        )
