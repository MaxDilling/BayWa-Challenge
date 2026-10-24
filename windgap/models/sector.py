"""Sector-wise MCP: v̂_t = a_s + Σᵢ b_{s,i} · vᵢ(t − τᵢ), multi_regression's weights fitted separately in each wind
direction sector s of the references' mean direction. Where a neighbour's wake or the terrain changes how the target
follows a reference, that direction gets its own weights; a sector with few values keeps the weights of all directions."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.core.schema import STEP_S
from windgap.models.base import Explanation, calibrate, correlation, gaussian_prediction
from windgap.models.multi import MultiRegression, _nonnegative
from windgap.models.registry import register

MIN_SECTOR_STEPS = 288  # two days of measured values before a sector gets its own weights


@register("sector_regression")
class SectorRegression(MultiRegression):
    label = "Multiple regression by wind direction (MCP)"
    tagline = "Least-squares weights over all reference farms, fitted separately for each wind direction sector."
    summary = ("The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay "
               "τ. The weights are fitted by least squares outside the outage, separately for each wind direction "
               "sector: where a neighbour's wake or the terrain changes how the target follows a reference, that "
               "direction gets its own weights. A sector with less than two days of values uses the weights of all "
               "directions; a reference that would get a negative weight is left out.")
    formula = r"\hat{v}_t = a_{s(t)} + \sum_i b_{s(t),i} \cdot v_i(t - \tau_i)"

    def __init__(self, lag_max_min: int = 60, direction_sectors: int = 8):
        super().__init__(lag_max_min, direction_sectors)

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        x = self._delays(refs, y)[:, self.used]
        sector = self._sector(extra, len(y))
        self.coefs, self.sector_steps, self.n_train = _coefs(x, y, sector, self.sectors)
        self.r = correlation(_apply(self.coefs, x, sector), y)
        self.errors = calibrate(np.column_stack([x, sector]), y, self._fit)
        return self

    def _fit(self, x: np.ndarray, y: np.ndarray):
        """Weights per sector on the rows given; the last column of x is the sector."""
        coefs, _, _ = _coefs(x[:, :-1], y, x[:, -1].astype(int), self.sectors)
        return lambda v: _apply(coefs, v[:, :-1], v[:, -1].astype(int))

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.to_numpy(dtype=float)
        n = len(x)
        # beyond the edges of `refs` the edge value stands in; callers pass context (backtest.predict_window)
        inputs = np.column_stack([x[np.clip(np.arange(n) - self.lags[i], 0, n - 1), i] for i in self.used])
        mean = _apply(self.coefs, inputs, self._sector(extra, n))
        return gaussian_prediction(mean, self.errors.sigma(mean), refs.index)

    def explain(self) -> Explanation:
        refs = range(len(self.r_refs))
        own = [s for s in range(self.sectors) if self.sector_steps[s] >= MIN_SECTOR_STEPS]
        deg = {s: f"{s * 360 / self.sectors:g}" for s in range(self.sectors)}

        def weights(row: np.ndarray, prefix: str) -> dict[str, float]:
            b = dict(zip(self.used, row[1:]))
            return {f"{prefix}ref_{i}": float(b.get(i, 0.0)) for i in refs}

        return Explanation(
            summary=self.summary,
            formula=self.formula,
            params={"a": float(self.coefs[self.sectors, 0]), **weights(self.coefs[self.sectors], "b_"),
                    **{k: v for s in own for k, v in
                       {f"a_{deg[s]}": float(self.coefs[s, 0]), **weights(self.coefs[s], f"b_{deg[s]}_")}.items()}},
            diagnostics={"r": self.r, "n_train": self.n_train, "sigma_0": self.errors.sigma_0,
                         "sigma_slope": self.errors.sigma_slope, "error_memory_h": self.errors.memory_h,
                         **{f"lag_min_ref_{i}": self.lags[i] * STEP_S / 60 for i in refs},
                         **({f"r_ref_{i}": self.r_refs[i] for i in refs} if len(refs) > 1 else {}),
                         **{f"sector_steps_{deg[s]}": int(self.sector_steps[s]) for s in range(self.sectors)
                            if self.sector_steps[s]}},
        )


def _coefs(x: np.ndarray, y: np.ndarray, sector: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray, int]:
    """(a, b…) per sector with "all directions" at index n, measured steps per sector, measured steps in all.
    The weights of all directions decide which columns are used; a sector refits them on its own rows once it has
    MIN_SECTOR_STEPS of them."""
    a, b, cols, rows = _nonnegative(x, y)
    overall = np.zeros(x.shape[1] + 1)
    overall[0], overall[1 + np.array(cols)] = a, b
    coefs = np.tile(overall, (n + 1, 1))
    steps = np.bincount(sector[rows], minlength=n + 1)[:n]
    for s in np.flatnonzero(steps >= MIN_SECTOR_STEPS):
        mine = sector == s
        a_s, b_s, cols_s, _ = _nonnegative(x[mine][:, cols], y[mine])
        coefs[s] = 0
        coefs[s, 0], coefs[s, 1 + np.array(cols)[cols_s]] = a_s, b_s
    return coefs, steps, int(rows.sum())


def _apply(coefs: np.ndarray, x: np.ndarray, sector: np.ndarray) -> np.ndarray:
    """a_s + Σᵢ b_{s,i} · xᵢ per row; NaN where an input with a weight is missing, and only there."""
    c = coefs[sector]
    return c[:, 0] + np.where(c[:, 1:] == 0, 0, c[:, 1:] * x).sum(axis=1)
