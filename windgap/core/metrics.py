"""The single definition of every accuracy metric; engine validation and harness both call `evaluate`."""

import numpy as np
import pandas as pd

from windgap.core.energy import expected_power
from windgap.core.powercurve import park_power_kw
from windgap.core.schema import PowerCurve


def evaluate(truth: pd.Series, pred: pd.DataFrame, curve: PowerCurve) -> dict[str, float]:
    """Metrics over steps with both truth and prediction. energy_dev_pct is signed; aggregate |·| across scenarios."""
    mask = (truth.notna() & pred["mean"].notna()).to_numpy()
    if not mask.any():
        return {}
    t = truth.to_numpy()[mask]
    p = pred[mask]
    err = p["mean"].to_numpy() - t
    p_true = park_power_kw(curve, t)
    p_err = expected_power(p, curve)["p_mean_kw"].to_numpy() - p_true
    true_energy = p_true.sum()
    return {
        "wind_rmse": float(np.sqrt(np.mean(err**2))),
        "wind_mae": float(np.mean(np.abs(err))),
        "bias": float(np.mean(err)),
        "power_rmse": float(np.sqrt(np.mean(p_err**2))),
        "power_mae": float(np.mean(np.abs(p_err))),
        "energy_dev_pct": float(100 * p_err.sum() / true_energy) if true_energy > 0 else float("nan"),
        "coverage_80": float(np.mean((t >= p["q10"].to_numpy()) & (t <= p["q90"].to_numpy()))),
    }
