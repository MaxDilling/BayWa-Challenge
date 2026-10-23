from dataclasses import dataclass

import numpy as np
import pandas as pd

from windgap.core.powercurve import park_power_kw
from windgap.core.schema import STEP_H, Outage, PowerCurve

_NODES, _WEIGHTS = np.polynomial.hermite_e.hermegauss(20)
_WEIGHTS = _WEIGHTS / np.sqrt(2 * np.pi)


@dataclass
class EnergyResult:
    kwh_p10: float
    kwh_p50: float
    kwh_p90: float
    cumulative: pd.Series  # kWh, P50


def expected_power(pred: pd.DataFrame, curve: PowerCurve) -> pd.DataFrame:
    """p_mean_kw = E[P(v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature, not P(mean)."""
    mean = pred["mean"].to_numpy()[:, None]
    std = pred["std"].to_numpy()[:, None]
    p_mean = park_power_kw(curve, mean + std * _NODES) @ _WEIGHTS
    return pd.DataFrame(
        {
            "p_mean_kw": p_mean,
            "p_q10_kw": park_power_kw(curve, pred["q10"]),
            "p_q90_kw": park_power_kw(curve, pred["q90"]),
        },
        index=pred.index,
    )


def energy_loss(power: pd.DataFrame, outage: Outage) -> EnergyResult:
    """P10/P90 sum the per-step quantiles, i.e. assume fully correlated errors (a bias-dominated, wide band)."""
    window = power[(power.index >= outage.start) & (power.index < outage.end)]
    kwh = window * STEP_H
    return EnergyResult(
        kwh_p10=float(kwh["p_q10_kw"].sum(skipna=False)),
        kwh_p50=float(kwh["p_mean_kw"].sum(skipna=False)),
        kwh_p90=float(kwh["p_q90_kw"].sum(skipna=False)),
        cumulative=kwh["p_mean_kw"].cumsum(),
    )
