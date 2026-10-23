import numpy as np

from windgap.core.schema import PowerCurve


def park_power_kw(curve: PowerCurve, wind_ms) -> np.ndarray:
    """Linear interpolation; 0 kW below the first and above the last point (cut-out). NaN stays NaN."""
    per_turbine = np.interp(np.asarray(wind_ms, dtype=float), curve.wind_ms, curve.power_kw, left=0.0, right=0.0)
    return per_turbine * curve.n_turbines
