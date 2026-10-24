import numpy as np
import pandas as pd
import pytest

from harness.synthetic import synthetic_pair
from windgap.backtest import predict_window
from windgap.core.schema import Z90
from windgap.models import registry
from windgap.models.base import MAX_MEMORY_STEPS, PREDICTION_COLUMNS, calibrate

INDEX = pd.date_range("2026-09-01", periods=600, freq="10min", tz="UTC")
REF = pd.Series(6 + 3 * np.sin(np.arange(600) / 20), index=INDEX)


@pytest.fixture(scope="module")
def pair():
    return synthetic_pair(days=6, seed=0)


@pytest.mark.parametrize("name", registry.names())
def test_model_contract(name, pair):
    train, test = pair.iloc[:-144], pair.iloc[-144:]
    model = registry.create(name).fit(train["target"], train[["ref"]])
    pred = model.predict(test[["ref"]])

    assert model.name == name
    assert list(pred.columns) == PREDICTION_COLUMNS
    assert pred.index.equals(test.index)
    assert (pred >= 0).all().all()
    assert (pred["q10"] <= pred["q50"]).all() and (pred["q50"] <= pred["q90"]).all()
    assert model.errors.acf[0] == 1.0

    explanation = model.explain()
    assert explanation.summary and explanation.formula
    assert all(isinstance(v, float | int) for v in explanation.params.values())


def _identity(x: np.ndarray, y: np.ndarray):
    return lambda v: v


def test_sigma_puts_80_percent_of_constant_errors_in_the_band():
    errors = calibrate(REF.to_numpy(), REF.to_numpy() + 0.5 * (-1) ** np.arange(600), _identity)
    assert errors.sigma_0 == pytest.approx(0.5 / Z90)
    assert errors.sigma_slope == pytest.approx(0, abs=1e-12)
    assert errors.acf.tolist() == [1.0]  # alternating errors cancel at once


def test_persistent_errors_have_long_memory():
    errors = calibrate(REF.to_numpy(), REF.to_numpy() + 0.5, _identity)
    assert len(errors.acf) == MAX_MEMORY_STEPS + 1
    assert errors.memory_h == pytest.approx((2 * MAX_MEMORY_STEPS + 1) / 6)


def test_sigma_grows_with_the_predicted_wind():
    errors = calibrate(REF.to_numpy(), REF.to_numpy() * (1 + 0.1 * (-1) ** np.arange(600)), _identity)
    assert errors.sigma_0 == pytest.approx(0, abs=1e-9)
    assert errors.sigma_slope == pytest.approx(0.1 / Z90)


@pytest.mark.parametrize("name", ["linear_regression", "variance_ratio"])
def test_linear_models_recover_line_and_delay(name):
    target = 2 + 0.5 * REF.shift(2)  # reaches the target 20 minutes later
    model = registry.create(name).fit(target, REF.to_frame())
    explanation = model.explain()
    assert explanation.params == pytest.approx({"a": 2.0, "b": 0.5})
    assert explanation.diagnostics["lag_min"] == 20
    assert explanation.diagnostics["r"] == pytest.approx(1)
    pred = predict_window(model, REF.to_frame(), INDEX[100], INDEX[110])
    assert pred.index.equals(INDEX[100:110])
    assert pred["mean"].to_numpy() == pytest.approx(target.iloc[100:110].to_numpy())


def test_context_stops_at_a_reference_gap():
    target = 2 + 0.5 * REF.shift(2)
    model = registry.create("linear_regression").fit(target, REF.to_frame())
    refs = REF.to_frame()
    refs.iloc[98] = np.nan
    pred = predict_window(model, refs, INDEX[100], INDEX[110])
    assert pred["mean"].iloc[1:].to_numpy() == pytest.approx(target.iloc[101:110].to_numpy())
    assert pred["mean"].iloc[0] == pytest.approx(2 + 0.5 * REF.iloc[99])  # nearest measured value


def test_lag_search_respects_its_limit():
    model = registry.create("linear_regression", lag_max_min=0).fit(2 + 0.5 * REF.shift(2), REF.to_frame())
    assert model.explain().diagnostics["lag_min"] == 0


_NOISE = np.random.default_rng(0).normal(0, 1, (2, 600))  # wind-like: a delay must stand out against its neighbours
REF_A = REF + _NOISE[0]
REF_B = pd.Series(5 + 2 * np.cos(np.arange(600) / 33) + _NOISE[1], index=INDEX)


def test_multi_regression_recovers_weights_and_delays():
    target = 1 + 0.6 * REF_A.shift(2) + 0.3 * REF_B
    explanation = registry.create("multi_regression").fit(target, pd.DataFrame({"a": REF_A, "b": REF_B})).explain()
    assert explanation.params == pytest.approx({"a": 1.0, "b_ref_0": 0.6, "b_ref_1": 0.3})
    assert (explanation.diagnostics["lag_min_ref_0"], explanation.diagnostics["lag_min_ref_1"]) == (20, 0)
    assert explanation.diagnostics["r"] == pytest.approx(1)


def test_multi_regression_leaves_out_a_reference_with_negative_weight():
    target = 1 + 0.6 * REF - 0.3 * REF_B
    explanation = registry.create("multi_regression", lag_max_min=0).fit(target, pd.DataFrame({"a": REF, "b": REF_B})).explain()
    assert explanation.params["b_ref_1"] == 0
    assert explanation.params["b_ref_0"] > 0


def test_multi_regression_with_one_reference_is_linear_regression(pair):
    train, test = pair.iloc[:-144], pair.iloc[-144:]
    lr = registry.create("linear_regression").fit(train["target"], train[["ref"]])
    multi = registry.create("multi_regression").fit(train["target"], train[["ref"]])
    assert multi.explain().params == pytest.approx({"a": lr.a, "b_ref_0": lr.b})
    assert multi.predict(test[["ref"]]).to_numpy() == pytest.approx(lr.predict(test[["ref"]]).to_numpy())


def test_sector_factor_is_measured_over_predicted_wind_pulled_towards_one():
    from windgap.models.multi import WAKE_PRIOR_STEPS, _sector_factors

    pred, y, sector = np.array([1.0, 1.0, 2.0, 2.0, 5.0]), np.array([1.0, 1.0, 1.0, 1.0, 9.0]), np.array([0, 0, 1, 1, 2])
    prior = WAKE_PRIOR_STEPS * 1.5  # mean prediction over the steps with a direction
    factors, steps = _sector_factors(pred, y, sector, 2)
    assert factors.tolist() == pytest.approx([1.0, (2 + prior) / (4 + prior), 1.0])
    assert steps.tolist() == [2, 2]


def test_multi_regression_learns_less_wind_from_the_shaded_direction():
    west = pd.Series(np.where(np.arange(600) % 2, 270.0, 0.0), index=INDEX)
    target = REF_A * np.where(west == 270, 0.8, 1.0)
    model = registry.create("multi_regression").fit(target, REF_A.to_frame(), west.to_frame())
    params = model.explain().params
    assert params["wake_factor_270"] < 0.95 < 1.05 < params["wake_factor_0"]
    shaded = model.predict(REF_A.to_frame(), pd.DataFrame({0: 270.0}, index=INDEX))["mean"]
    north = model.predict(REF_A.to_frame(), pd.DataFrame({0: 0.0}, index=INDEX))["mean"]
    assert shaded.to_numpy() == pytest.approx(north.to_numpy() * params["wake_factor_270"] / params["wake_factor_0"])


def test_without_directions_there_is_no_wake_factor():
    params = registry.create("multi_regression").fit(REF_A, REF_A.to_frame()).explain().params
    assert not any(k.startswith("wake_factor") for k in params)
