"""M7: v̂_t = a + Σᵢ bᵢ · vᵢ(t − τᵢ). Every reference at the delay τᵢ where it tracks the target best, weights by least
squares on the training data. A reference whose weight would be negative is left out and the rest refitted, so every
weight says how much that reference counts; with one reference this is linear regression.
A factor per wind direction sector f_s corrects what the references cannot see from where they stand, above all the
wake of a neighbouring turbine: v̂_t = (a + Σᵢ bᵢ · vᵢ(t − τᵢ)) · f_s(t), s(t) from the references' mean direction."""

from typing import Self

import numpy as np
import pandas as pd

from windgap.core.schema import STEP_S
from windgap.models.base import Explanation, best_lag, calibrate, correlation, gaussian_prediction
from windgap.models.registry import register

WAKE_PRIOR_STEPS = 144  # f_s is pulled towards 1 as if the sector had one more day of perfectly predicted values


@register("multi_regression")
class MultiRegression:
    label = "Multiple regression (MCP)"
    tagline = "Least-squares weights over all reference farms, each shifted by its own delay."
    summary = ("The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay τ; "
               "the weights are fitted by least squares on the time all farms measured, so references that agree with "
               "the target count more and their independent errors partly cancel. A reference that would get a "
               "negative weight is left out.")
    formula = r"\hat{v}_t = a + \sum_i b_i \cdot v_i(t - \tau_i)"
    wake_summary = (" A factor per wind direction sector then corrects what the references cannot see, such as the "
                    "wake of a neighbouring turbine: it is the measured over the predicted wind in that sector outside "
                    "the outage, pulled towards 1 where the sector has few values.")
    wake_formula = r"\hat{v}_t = f_{s(t)} \cdot \Big(a + \sum_i b_i \cdot v_i(t - \tau_i)\Big)"

    def __init__(self, lag_max_min: int = 60, direction_sectors: int = 12):
        self.lag_max = int(lag_max_min) * 60 // STEP_S
        self.sectors = int(direction_sectors)

    def fit(self, target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> Self:
        y = target.to_numpy(dtype=float)
        x = self._delays(refs, y)
        self.a, self.b, cols, ok = _nonnegative(x[:, self.used], y)
        self.used = [self.used[c] for c in cols]
        self.n_train = int(ok.sum())
        plain = self.a + x[:, self.used] @ self.b
        sector = self._sector(extra, len(y))
        self.factors, self.sector_steps = _sector_factors(plain, y, sector, self.sectors)
        self.r = correlation(plain * self.factors[sector], y)
        self.errors = calibrate(np.column_stack([x[:, self.used], sector]), y, self._fit)
        return self

    def _delays(self, refs: pd.DataFrame, y: np.ndarray) -> np.ndarray:
        """Every reference at the delay τᵢ where it tracks the target best (sets r_refs, lags and used = the references
        with a correlation); one column per reference, NaN where the shift leaves the grid."""
        best = [best_lag(refs.iloc[:, i].to_numpy(dtype=float), y, self.lag_max) for i in range(refs.shape[1])]
        self.r_refs = [r for r, _ in best]
        self.lags = [lag for _, lag in best]
        self.used = [i for i, r in enumerate(self.r_refs) if np.isfinite(r)]
        return np.column_stack([_shifted(refs.iloc[:, i].to_numpy(dtype=float), lag) for i, lag in enumerate(self.lags)])

    def _fit(self, x: np.ndarray, y: np.ndarray):
        """Regression and sector factors on the rows given; the last column of x is the sector."""
        sector = x[:, -1].astype(int)
        a, b = _least_squares(x[:, :-1], y)
        factors, _ = _sector_factors(a + x[:, :-1] @ b, y, sector, self.sectors)
        return lambda v: (a + v[:, :-1] @ b) * factors[v[:, -1].astype(int)]

    def _sector(self, extra: pd.DataFrame | None, n: int) -> np.ndarray:
        """Direction sector per step (0 = centred on north), from the circular mean of the references' directions;
        `self.sectors` where no reference has a direction."""
        if extra is None or not self.sectors:
            return np.full(n, self.sectors)
        rad = np.deg2rad(extra.to_numpy(dtype=float))
        mean = np.rad2deg(np.arctan2(np.nansum(np.sin(rad), axis=1), np.nansum(np.cos(rad), axis=1))) % 360
        width = 360 / self.sectors
        sector = np.floor((mean + width / 2) / width).astype(int) % self.sectors
        return np.where(np.isnan(rad).all(axis=1), self.sectors, sector)

    def predict(self, refs: pd.DataFrame, extra: pd.DataFrame | None = None) -> pd.DataFrame:
        x = refs.to_numpy(dtype=float)
        n = len(x)
        # beyond the edges of `refs` the edge value stands in; callers pass context (backtest.predict_window)
        plain = self.a + sum(b * x[np.clip(np.arange(n) - self.lags[i], 0, n - 1), i] for i, b in zip(self.used, self.b))
        mean = plain * self.factors[self._sector(extra, n)]
        return gaussian_prediction(mean, self.errors.sigma(mean), refs.index)

    def explain(self) -> Explanation:
        weights = dict(zip(self.used, self.b))
        refs = range(len(self.r_refs))
        sectors = [(f"{s * 360 / self.sectors:g}", s) for s in range(self.sectors) if self.sector_steps[s]]
        return Explanation(
            summary=self.summary + (self.wake_summary if sectors else ""),
            formula=self.wake_formula if sectors else self.formula,
            params={"a": self.a, **{f"b_ref_{i}": float(weights.get(i, 0.0)) for i in refs},
                    **{f"wake_factor_{deg}": float(self.factors[s]) for deg, s in sectors}},
            diagnostics={"r": self.r, "n_train": self.n_train, "sigma_0": self.errors.sigma_0,
                         "sigma_slope": self.errors.sigma_slope, "error_memory_h": self.errors.memory_h,
                         **{f"lag_min_ref_{i}": self.lags[i] * STEP_S / 60 for i in refs},
                         **({f"r_ref_{i}": self.r_refs[i] for i in refs} if len(refs) > 1 else {}),
                         **{f"wake_steps_{deg}": int(self.sector_steps[s]) for deg, s in sectors}},
        )


def _sector_factors(pred: np.ndarray, y: np.ndarray, sector: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    """(f per sector plus 1 for "no direction" at index n, measured steps per sector):
    f_s = (Σ_s y + k · m) / (Σ_s ŷ + k · m) with k = WAKE_PRIOR_STEPS and m the mean prediction."""
    ok = ~np.isnan(pred) & ~np.isnan(y) & (sector < n)
    factors = np.ones(n + 1)
    if not ok.any():
        return factors, np.zeros(n, dtype=int)
    prior = WAKE_PRIOR_STEPS * pred[ok].mean()
    sums_y = np.bincount(sector[ok], weights=y[ok], minlength=n)
    sums_pred = np.bincount(sector[ok], weights=pred[ok], minlength=n)
    factors[:n] = (sums_y + prior) / (sums_pred + prior)
    return factors, np.bincount(sector[ok], minlength=n)


def _nonnegative(x: np.ndarray, y: np.ndarray) -> tuple[float, np.ndarray, list[int], np.ndarray]:
    """(a, b, cols, rows): least squares of y on the columns `cols` of x over the rows where all of them and y are
    measured; while a weight is negative, the column with the smallest one leaves and the rest is refitted."""
    cols = list(range(x.shape[1]))
    while True:
        rows = ~np.isnan(x[:, cols]).any(axis=1) & ~np.isnan(y)
        a, b = _least_squares(x[rows][:, cols], y[rows])
        if len(cols) == 1 or (b >= 0).all():
            return a, b, cols, rows
        del cols[int(np.argmin(b))]


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
