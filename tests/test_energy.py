import math

import numpy as np
import pandas as pd
import pytest

from harness.synthetic import generic_power_curve
from windgap.core.energy import energy_loss, expected_power
from windgap.core.powercurve import park_power_kw
from windgap.core.schema import Z90, Outage, PowerCurve
from windgap.models.base import gaussian_prediction

CURVE = generic_power_curve(n_turbines=2)
INDEX = pd.date_range("2026-09-01", periods=6, freq="10min", tz="UTC")
OUTAGE = Outage(INDEX[0], INDEX[-1] + pd.Timedelta("10min"))


def _pred(mean: float, std: float) -> pd.DataFrame:
    return gaussian_prediction(np.full(len(INDEX), mean), np.full(len(INDEX), std), INDEX)


def test_power_curve_edges():
    assert park_power_kw(CURVE, [2.0, 3.0, 12.0, 25.0, 25.1]).tolist() == [0, 0, 6000, 6000, 0]
    assert np.isnan(park_power_kw(CURVE, [np.nan])[0])


def test_expected_power_without_spread_is_power_of_mean():
    power = expected_power(_pred(7.5, 1e-9), CURVE).iloc[0]
    assert power["p_mean_kw"] == pytest.approx(park_power_kw(CURVE, [7.5])[0])
    assert power["p_std_kw"] == pytest.approx(0, abs=1e-3)


def test_spread_lowers_expected_power_near_rated():
    assert expected_power(_pred(12.0, 2.0), CURVE)["p_mean_kw"].iloc[0] < 6000


def test_power_moments_on_a_linear_curve():
    linear = PowerCurve(wind_ms=np.array([0.0, 100.0]), power_kw=np.array([0.0, 300.0]))  # P(v) = 3 v
    power = expected_power(_pred(50.0, 2.0), linear).iloc[0]
    assert power["p_mean_kw"] == pytest.approx(150)
    assert power["p_std_kw"] == pytest.approx(6)


def _power(p_mean: float, p_std: float) -> pd.DataFrame:
    return pd.DataFrame({"p_mean_kw": p_mean, "p_std_kw": p_std}, index=INDEX)


def test_energy_is_power_times_one_sixth_hour():
    result = energy_loss(_power(600.0, 0.0), OUTAGE, np.array([1.0]))
    assert (result.kwh_p10, result.kwh_p50, result.kwh_p90) == (600.0, 600.0, 600.0)
    assert result.cumulative.iloc[-1] == 600.0


def test_fully_correlated_errors_add_up():
    result = energy_loss(_power(600.0, 60.0), OUTAGE, np.ones(6))  # SD = 6 · 60 kW · 1/6 h
    assert result.kwh_p90 == pytest.approx(600 + Z90 * 60)
    assert result.kwh_p10 == pytest.approx(600 - Z90 * 60)


def test_independent_errors_partly_cancel():
    result = energy_loss(_power(600.0, 60.0), OUTAGE, np.array([1.0]))  # SD = √6 · 10 kWh
    assert result.kwh_p90 == pytest.approx(600 + Z90 * 10 * math.sqrt(6))


def test_lower_bound_is_floored_at_zero():
    assert energy_loss(_power(6.0, 60.0), OUTAGE, np.ones(6)).kwh_p10 == 0.0
