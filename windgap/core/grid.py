"""Conversion between the engine-boundary Grid (epoch ms + value list) and pandas."""

import numpy as np
import pandas as pd

from windgap.core.schema import STEP, STEP_S


def grid_to_series(grid: dict, name: str | None = None) -> pd.Series:
    if grid["stepS"] != STEP_S:
        raise ValueError(f"stepS must be {STEP_S}, got {grid['stepS']}")
    if grid["t0"] % (STEP_S * 1000):
        raise ValueError(f"t0 {grid['t0']} is not on the 10-minute grid")
    values = np.array([np.nan if v is None else v for v in grid["values"]], dtype=float)
    index = pd.date_range(pd.Timestamp(grid["t0"], unit="ms", tz="UTC"), periods=len(values), freq=STEP)
    return pd.Series(values, index=index, name=name)


def series_to_grid(s: pd.Series) -> dict:
    return {"t0": to_ms(s.index[0]), "stepS": STEP_S, "values": nan_to_none(s.to_numpy())}


def to_ms(ts: pd.Timestamp) -> int:
    return int(ts.value // 1_000_000)


def from_ms(ms: int) -> pd.Timestamp:
    return pd.Timestamp(ms, unit="ms", tz="UTC")


def nan_to_none(values) -> list[float | None]:
    """JSON has no NaN; missing values cross the engine boundary as null."""
    return [None if np.isnan(v) else float(v) for v in np.asarray(values, dtype=float)]


def align(series: list[pd.Series]) -> pd.DataFrame:
    """Join series on one gap-free 10-minute grid spanning all of them."""
    df = pd.concat(series, axis=1, sort=True)
    return df.reindex(pd.date_range(df.index[0], df.index[-1], freq=STEP))
