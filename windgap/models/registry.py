"""Model registry shared by harness and py engine. Every module in windgap/models/ is imported on first use,
so a new model file with @register appears in the leaderboard and GUI without further wiring."""

import importlib
import pkgutil

import windgap.models
from windgap.models.base import WindModel

_MODELS: dict[str, type] = {}
# The GUI's default: lowest harness score over all 7 datasets (SPEC.md, Modellarchitektur).
RECOMMENDED = "linear_regression"


def register(name: str):
    def decorate(cls: type) -> type:
        if name in _MODELS:
            raise ValueError(f"model {name!r} registered twice")
        cls.name = name
        _MODELS[name] = cls
        return cls

    return decorate


def _discover() -> None:
    for mod in pkgutil.iter_modules(windgap.models.__path__):
        importlib.import_module(f"windgap.models.{mod.name}")


def names() -> list[str]:
    _discover()
    return sorted(_MODELS)


def info() -> list[dict]:
    """ModelInfo (S5) of every registered model."""
    _discover()
    return [{"name": n, "label": _MODELS[n].label, "tagline": _MODELS[n].tagline, "recommended": n == RECOMMENDED}
            for n in sorted(_MODELS)]


def create(name: str, **params) -> WindModel:
    _discover()
    if name not in _MODELS:
        raise KeyError(f"unknown model {name!r}, known: {sorted(_MODELS)}")
    return _MODELS[name](**params)
