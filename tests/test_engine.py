import json

import pytest

from harness import fixtures
from windgap.engine import handle, list_models

CASES = [(m["name"], c) for m in json.loads(list_models()) for c in fixtures.cases(m["name"])]


def assert_close(actual, expected, path="response"):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), path
        for k in expected:
            assert_close(actual[k], expected[k], f"{path}.{k}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for i, (a, e) in enumerate(zip(actual, expected)):
            assert_close(a, e, f"{path}[{i}]")
    elif isinstance(expected, float):
        assert actual == pytest.approx(expected, rel=1e-9, abs=1e-9), path
    else:
        assert actual == expected, path


@pytest.mark.parametrize("model,case", CASES, ids=[f"{m}-{c}" for m, c in CASES])
def test_golden_fixtures_are_current(model, case):
    """Fails when a model or the energy chain changed without `make fixtures`."""
    request = fixtures.cases(model)[case]
    stored = json.loads((fixtures.GOLDEN / model / f"{case}.json").read_text())
    response = json.loads(handle(json.dumps(request)))
    del response["engine"]
    assert stored["request"] == request
    assert_close(response, stored["response"])


def test_model_list_is_current():
    assert json.loads(list_models()) == json.loads(fixtures.MODELS.read_text())


def test_prediction_spans_outage():
    request = fixtures.cases("identity")["basic"]
    response = json.loads(handle(json.dumps(request)))
    steps = (request["outage"]["endMs"] - request["outage"]["startMs"]) // 600_000
    assert len(response["prediction"]["mean"]) == len(response["energy"]["cumulativeKwh"]) == steps
    assert response["energy"]["kwhP10"] <= response["energy"]["kwhP50"] <= response["energy"]["kwhP90"]
    assert len(response["scatter"]["ref"]) <= 2000
    assert response["validation"]["n_folds"] >= 1


def test_refuses_an_outage_without_a_day_of_target_data_outside_it():
    request = fixtures.cases("identity")["basic"]
    request["outage"]["startMs"] = request["target"]["t0"] + 143 * 600_000
    request["outage"]["endMs"] = request["target"]["t0"] + len(request["target"]["values"]) * 600_000
    with pytest.raises(ValueError, match="143 values outside the outage"):
        handle(json.dumps(request))


def test_demo_prediction_is_current():
    """harness.predict fills the demo outage; the GUI's filled-series export is tested against the same file."""
    assert fixtures.demo_prediction() == fixtures.PREDICT.read_text()


@pytest.mark.parametrize("model,changes", [("linear_regression", False), ("multi_regression", True)])
def test_loss_without_direction_differs_only_for_a_model_that_uses_directions(model, changes):
    energy = json.loads(handle(json.dumps(fixtures.cases(model)["directions"])))["energy"]
    assert (energy["kwhP50WithoutDirection"] != pytest.approx(energy["kwhP50"], rel=1e-12)) == changes
    assert "kwhP50WithoutDirection" not in json.loads(handle(json.dumps(fixtures.cases(model)["basic"])))["energy"]
