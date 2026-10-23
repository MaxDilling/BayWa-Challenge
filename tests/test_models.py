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
