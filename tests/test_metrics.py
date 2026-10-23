import math

import pandas as pd
import pytest

from harness.synthetic import generic_power_curve
from windgap.core.metrics import evaluate, summarize
from windgap.models.base import gaussian_prediction

CURVE = generic_power_curve()  # P(v) = 3000 · ((v − 3) / 9)³ kW between 3 and 12 m/s
INDEX = pd.date_range("2026-09-01", periods=2, freq="10min", tz="UTC")
TRUTH = pd.Series([6.0, 12.0], index=INDEX)  # 111.1 kW and 3000 kW


def _metrics(mean: list[float], std: float) -> dict[str, float]:
    return evaluate(TRUTH, gaussian_prediction(pd.Series(mean, index=INDEX), std), CURVE)


def test_point_forecast():
    m = _metrics([6.0, 9.0], 1e-9)  # 9 m/s gives 888.9 kW
    assert m["wind_rmse"] == pytest.approx(math.sqrt(4.5))
    assert m["bias"] == pytest.approx(-1.5)
    assert m["power_mae"] == pytest.approx((3000 - 2000 / 2.25) / 2)
    assert m["coverage_80"] == 0.5
    assert m["energy_dev_pct"] == pytest.approx(100 * (1000 / (3000 + 1000 / 9) - 1))
    assert m["energy_coverage_80"] == 0.0
    assert m["energy_band_pct"] == pytest.approx(0, abs=1e-6)
    assert m["energy_err_kwh"] == pytest.approx((1000 - 3000 - 1000 / 9) / 6)


def test_true_energy_inside_band():
    # q90 = mean + 1.28 · 3: P(12.8) = 3000 kW and P(9.8) > P(6), so the summed q90 power exceeds the truth
    assert _metrics([6.0, 9.0], 3.0)["energy_coverage_80"] == 1.0


def test_percentages_absent_without_true_energy():
    m = evaluate(pd.Series(2.0, index=INDEX), gaussian_prediction(pd.Series(2.0, index=INDEX), 0.5), CURVE)
    assert "energy_dev_pct" not in m and "energy_band_pct" not in m
    assert m["energy_coverage_80"] == 1.0


def test_summarize_weights_energy_errors_by_energy():
    summary = summarize([
        {"energy_dev_pct": -10.0, "energy_true_kwh": 100.0, "energy_err_kwh": -10.0},
        {"energy_dev_pct": 20.0, "energy_true_kwh": 50.0, "energy_err_kwh": 10.0},
        {"energy_true_kwh": 0.0, "energy_err_kwh": 5.0},
    ])
    assert summary["energy_dev_pct"] == 15.0
    assert summary["energy_wape_pct"] == pytest.approx(100 * 25 / 150)
    assert summary["energy_err_kwh"] == pytest.approx(5 / 3)
