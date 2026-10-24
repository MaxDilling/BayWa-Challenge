from dataclasses import dataclass

import numpy as np
import pandas as pd

from windgap.core.powercurve import park_power_kw
from windgap.core.schema import STEP_H, Z90, Outage, PowerCurve

_NODES, _WEIGHTS = np.polynomial.hermite_e.hermegauss(20)
_WEIGHTS = _WEIGHTS / np.sqrt(2 * np.pi)
RHO_CURVE = 1.225  # kg/m³, the standard air power curves are stated for (IEC 61400-12-1)
R_DRY_AIR = 287.05  # J/(kg·K)
MIN_DENSITY_STEPS = 144  # one day of target density outside the outage to learn the ratio from


@dataclass
class EnergyResult:
    kwh_p10: float
    kwh_p50: float
    kwh_p90: float
    cumulative: pd.Series  # kWh, P50


@dataclass
class TargetDensity:
    kg_m3: pd.Series  # at the target, every step of the outage
    ratio: float  # mean target / reference density outside the outage


def air_density(temperature_c: pd.Series, pressure_hpa: pd.Series) -> pd.Series:
    """kg/m³ of dry air."""
    return pressure_hpa * 100 / (R_DRY_AIR * (temperature_c + 273.15))


def target_density(target_rho: pd.Series, refs_rho: pd.DataFrame, outage: Outage) -> TargetDensity | None:
    """ρ at the target in the outage = ratio · the mean density of the references with one at that step; the ratio is
    the mean of target / reference density over the steps outside the outage where both are known. None (no
    correction) with fewer than MIN_DENSITY_STEPS such steps or a step in the outage without any reference density."""
    ref = refs_rho.mean(axis=1)
    inside = (ref.index >= outage.start) & (ref.index < outage.end)
    pairs = (target_rho / ref)[~inside].dropna()
    if len(pairs) < MIN_DENSITY_STEPS or ref[inside].isna().any():
        return None
    ratio = float(pairs.mean())
    return TargetDensity(ref[inside] * ratio, ratio)


def expected_power(pred: pd.DataFrame, curve: PowerCurve, wind_factor: float | np.ndarray = 1.0) -> pd.DataFrame:
    """p_mean_kw = E[P(f · v)] and p_std_kw = SD[P(f · v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature;
    p_mean_kw is not P(mean). f = (ρ / RHO_CURVE)^⅓ per step moves the wind to the density of the curve."""
    mean = pred["mean"].to_numpy()[:, None]
    std = pred["std"].to_numpy()[:, None]
    p = park_power_kw(curve, np.reshape(wind_factor, (-1, 1)) * (mean + std * _NODES))
    p_mean = p @ _WEIGHTS
    return pd.DataFrame(
        {"p_mean_kw": p_mean, "p_std_kw": np.sqrt(np.maximum((p**2) @ _WEIGHTS - p_mean**2, 0))},
        index=pred.index,
    )


def energy_loss(power: pd.DataFrame, outage: Outage, acf: np.ndarray) -> EnergyResult:
    """P50 = Σ E[P]·h. The band is P50 ± Z90·SD of the sum, where the power errors of steps k apart correlate like the
    model's out-of-sample wind errors did in training (acf[k], 0 beyond its end): it neither assumes fully
    correlated errors (too wide for long outages) nor independent ones (too narrow for short ones)."""
    window = power[(power.index >= outage.start) & (power.index < outage.end)]
    kwh = window["p_mean_kw"] * STEP_H
    s = window["p_std_kw"].to_numpy() * STEP_H
    var = s @ s + 2 * sum(acf[k] * (s[:-k] @ s[k:]) for k in range(1, min(len(acf), len(s))))
    p50 = float(kwh.sum(skipna=False))
    half = Z90 * np.sqrt(var)
    return EnergyResult(kwh_p10=max(p50 - half, 0.0), kwh_p50=p50, kwh_p90=p50 + half, cumulative=kwh.cumsum())
