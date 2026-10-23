import pytest

from harness.synthetic import synthetic_pair
from windgap.models import registry
from windgap.models.base import PREDICTION_COLUMNS


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

    explanation = model.explain()
    assert explanation.summary and explanation.formula
    assert all(isinstance(v, float | int) for v in explanation.params.values())
