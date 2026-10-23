"""Synthetic site pairs with known truth: Weibull-distributed wind, target lagging the reference, diurnal cycle."""

import math

import numpy as np
import pandas as pd

from windgap.core.schema import STEP, PowerCurve

_norm_cdf = np.vectorize(lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2))))


def synthetic_pair(days: int = 30, seed: int = 0, r: float = 0.9, lag_steps: int = 2,
                   weibull_k: float = 2.0, weibull_c: float = 7.0, diurnal: float = 0.1,
                   start: str = "2026-09-01") -> pd.DataFrame:
    """Columns `ref` and `target` (m/s) on a UTC 10-minute grid. Both share an AR(1) weather signal (≈ 8 h memory);
    `r` sets the latent correlation (0.9 gives r ≈ 0.85 in m/s), `lag_steps` how much later the weather reaches the target."""
    rng = np.random.default_rng(seed)
    n = days * 144
    weather = _ar1(rng, n + lag_steps)
    z_ref = weather[lag_steps:]
    z_target = r * weather[:n] + math.sqrt(1 - r**2) * _ar1(rng, n, phi=0.9)
    index = pd.date_range(pd.Timestamp(start, tz="UTC"), periods=n, freq=STEP)
    hour = index.hour.to_numpy() + index.minute.to_numpy() / 60
    cycle = 1 + diurnal * np.sin(2 * np.pi * (hour - 9) / 24)
    return pd.DataFrame(
        {"ref": _weibull(z_ref, weibull_k, weibull_c), "target": _weibull(z_target, weibull_k, weibull_c) * cycle},
        index=index,
    )


def generic_power_curve(n_turbines: int = 1) -> PowerCurve:
    """3 MW class turbine: cut-in 3 m/s, rated 12 m/s, cut-out 25 m/s."""
    wind = np.arange(3.0, 26.0)
    power = np.minimum(3000.0, 3000.0 * ((wind - 3) / 9) ** 3)
    return PowerCurve(wind_ms=wind, power_kw=power, n_turbines=n_turbines)


def _ar1(rng: np.random.Generator, n: int, phi: float = 0.98) -> np.ndarray:
    """Stationary AR(1) with unit variance."""
    z = np.empty(n)
    z[0] = rng.standard_normal()
    eps = rng.standard_normal(n) * math.sqrt(1 - phi**2)
    for i in range(1, n):
        z[i] = phi * z[i - 1] + eps[i]
    return z


def _weibull(z: np.ndarray, k: float, c: float) -> np.ndarray:
    u = np.clip(_norm_cdf(z), 1e-12, 1 - 1e-12)
    return c * (-np.log1p(-u)) ** (1 / k)
