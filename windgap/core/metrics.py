"""The single definition of every accuracy metric; engine validation and harness both call `evaluate` and `summarize`."""

import numpy as np
import pandas as pd

from windgap.core.energy import energy_loss, expected_power
from windgap.core.powercurve import park_power_kw
from windgap.core.schema import STEP, STEP_H, Outage, PowerCurve


def evaluate(truth: pd.Series, pred: pd.DataFrame, curve: PowerCurve) -> dict[str, float]:
    """Metrics of one scenario over steps with both truth and prediction. energy_dev_pct is signed."""
    mask = (truth.notna() & pred["mean"].notna()).to_numpy()
    if not mask.any():
        return {}
    t = truth.to_numpy()[mask]
    p = pred[mask]
    err = p["mean"].to_numpy() - t
    power = expected_power(p, curve)
    p_true = park_power_kw(curve, t)
    p_err = power["p_mean_kw"].to_numpy() - p_true
    energy = energy_loss(power, Outage(p.index[0], p.index[-1] + STEP))
    true_kwh = p_true.sum() * STEP_H
    metrics = {
        "wind_rmse": float(np.sqrt(np.mean(err**2))),
        "wind_mae": float(np.mean(np.abs(err))),
        "bias": float(np.mean(err)),
        "power_rmse": float(np.sqrt(np.mean(p_err**2))),
        "power_mae": float(np.mean(np.abs(p_err))),
        "coverage_80": float(np.mean((t >= p["q10"].to_numpy()) & (t <= p["q90"].to_numpy()))),
        "energy_coverage_80": float(energy.kwh_p10 <= true_kwh <= energy.kwh_p90),
    }
    if true_kwh > 0:
        metrics["energy_dev_pct"] = float(100 * (energy.kwh_p50 - true_kwh) / true_kwh)
        metrics["energy_band_pct"] = float(100 * (energy.kwh_p90 - energy.kwh_p10) / true_kwh)
    return metrics


def summarize(results: list[dict[str, float]]) -> dict[str, float]:
    """Mean of each metric over scenarios that have it; energy_dev_pct as mean of |·| so that errors of opposite
    sign do not cancel."""
    table = pd.DataFrame(results)
    if "energy_dev_pct" in table:
        table["energy_dev_pct"] = table["energy_dev_pct"].abs()
    return table.mean().to_dict()
