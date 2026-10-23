import numpy as np
import pandas as pd
import pytest

from harness.synthetic import generic_power_curve
from windgap.core.energy import energy_loss, expected_power
from windgap.core.powercurve import park_power_kw
from windgap.core.schema import Outage
from windgap.models.base import gaussian_prediction

CURVE = generic_power_curve(n_turbines=2)
INDEX = pd.date_range("2026-09-01", periods=6, freq="10min", tz="UTC")


def test_power_curve_edges():
    assert park_power_kw(CURVE, [2.0, 3.0, 12.0, 25.0, 25.1]).tolist() == [0, 0, 6000, 6000, 0]
    assert np.isnan(park_power_kw(CURVE, [np.nan])[0])


def test_expected_power_without_spread_is_power_of_mean():
    pred = gaussian_prediction(pd.Series(7.5, index=INDEX), 1e-9)
    assert expected_power(pred, CURVE)["p_mean_kw"].iloc[0] == pytest.approx(park_power_kw(CURVE, [7.5])[0])


def test_spread_lowers_expected_power_near_rated():
    pred = gaussian_prediction(pd.Series(12.0, index=INDEX), 2.0)
    assert expected_power(pred, CURVE)["p_mean_kw"].iloc[0] < 6000


def test_energy_is_power_times_one_sixth_hour():
    power = pd.DataFrame({"p_mean_kw": 600.0, "p_q10_kw": 300.0, "p_q90_kw": 900.0}, index=INDEX)
    result = energy_loss(power, Outage(INDEX[0], INDEX[-1] + pd.Timedelta("10min")))
    assert (result.kwh_p10, result.kwh_p50, result.kwh_p90) == (300.0, 600.0, 900.0)
    assert result.cumulative.iloc[-1] == 600.0
