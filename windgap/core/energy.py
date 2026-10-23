from dataclasses import dataclass

import numpy as np
import pandas as pd

from windgap.core.powercurve import park_power_kw
from windgap.core.schema import STEP_H, Z90, Outage, PowerCurve

_NODES, _WEIGHTS = np.polynomial.hermite_e.hermegauss(20)
_WEIGHTS = _WEIGHTS / np.sqrt(2 * np.pi)


@dataclass
class EnergyResult:
    kwh_p10: float
    kwh_p50: float
    kwh_p90: float
    cumulative: pd.Series  # kWh, P50


def expected_power(pred: pd.DataFrame, curve: PowerCurve) -> pd.DataFrame:
    """p_mean_kw = E[P(v)] and p_std_kw = SD[P(v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature;
    p_mean_kw is not P(mean)."""
    mean = pred["mean"].to_numpy()[:, None]
    std = pred["std"].to_numpy()[:, None]
    p = park_power_kw(curve, mean + std * _NODES)
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
