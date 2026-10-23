from dataclasses import dataclass

import numpy as np
import pandas as pd

STEP = pd.Timedelta("10min")
STEP_S = 600
STEP_H = 1 / 6


@dataclass
class Outage:
    start: pd.Timestamp  # UTC, inclusive
    end: pd.Timestamp  # UTC, exclusive


@dataclass
class PowerCurve:
    wind_ms: np.ndarray  # ascending
    power_kw: np.ndarray  # per turbine
    n_turbines: int = 1


@dataclass
class Site:
    site_id: str
    wind: pd.Series  # UTC DatetimeIndex, freq="10min", NaN = missing
    extra: pd.DataFrame | None = None
    lat: float | None = None
    lon: float | None = None


@dataclass
class Dataset:
    target: Site
    references: list[Site]  # 1..n
    power_curve: PowerCurve
    outages: list[Outage]
