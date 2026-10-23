"""The single definition of every accuracy metric; engine validation and harness both call `evaluate` and `summarize`."""

import numpy as np
import pandas as pd

from windgap.core.energy import energy_loss, expected_power
from windgap.core.powercurve import park_power_kw
from windgap.core.schema import STEP, STEP_H, Outage, PowerCurve


def evaluate(truth: pd.Series, pred: pd.DataFrame, curve: PowerCurve, acf: np.ndarray) -> dict[str, float]:
    """Metrics of one scenario over steps with both truth and prediction, the energy band with the model's error
    autocorrelation `acf` (S4). energy_dev_pct is signed."""
    mask = (truth.notna() & pred["mean"].notna()).to_numpy()
    if not mask.any():
        return {}
    t = truth.to_numpy()[mask]
    p = pred[mask]
    err = p["mean"].to_numpy() - t
    power = expected_power(p, curve)
    p_true = park_power_kw(curve, t)
    p_err = power["p_mean_kw"].to_numpy() - p_true
    energy = energy_loss(power, Outage(p.index[0], p.index[-1] + STEP), acf)
    true_kwh = p_true.sum() * STEP_H
    metrics = {
        "wind_rmse": float(np.sqrt(np.mean(err**2))),
        "wind_mae": float(np.mean(np.abs(err))),
        "bias": float(np.mean(err)),
        "power_rmse": float(np.sqrt(np.mean(p_err**2))),
        "power_mae": float(np.mean(np.abs(p_err))),
        "coverage_80": float(np.mean((t >= p["q10"].to_numpy()) & (t <= p["q90"].to_numpy()))),
        "energy_coverage_80": float(energy.kwh_p10 <= true_kwh <= energy.kwh_p90),
        "energy_true_kwh": float(true_kwh),
        "energy_err_kwh": float(energy.kwh_p50 - true_kwh),
        "energy_band_kwh": float(energy.kwh_p90 - energy.kwh_p10),
    }
    if true_kwh > 0:
        metrics["energy_dev_pct"] = float(100 * (energy.kwh_p50 - true_kwh) / true_kwh)
        metrics["energy_band_pct"] = float(100 * (energy.kwh_p90 - energy.kwh_p10) / true_kwh)
    return metrics


def summarize(results: list[dict[str, float]]) -> dict[str, float]:
    """Mean of each metric over scenarios that have it; energy_dev_pct as mean of |·| so that errors of opposite
    sign do not cancel. energy_wape_pct = Σ|energy_err_kwh| / Σ energy_true_kwh and energy_band_pct =
    Σ energy_band_kwh / Σ energy_true_kwh weight scenarios by their energy, so calm scenarios with a tiny true energy
    cannot dominate them the way they dominate the mean of per-scenario percentages."""
    table = pd.DataFrame(results)
    summary = table.mean().to_dict()
    if "energy_dev_pct" in table:
        summary["energy_dev_pct"] = float(table["energy_dev_pct"].abs().mean())
    if (true_kwh := table["energy_true_kwh"].sum()) > 0:
        summary["energy_wape_pct"] = float(100 * table["energy_err_kwh"].abs().sum() / true_kwh)
        summary["energy_band_pct"] = float(100 * table["energy_band_kwh"].sum() / true_kwh)
    return summary
