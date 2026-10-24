"""Candidate models that run only in the harness, not in the engine or the GUI: imported by `python -m harness`,
run only when named in --models. A candidate moves to windgap/models/ (and the ts port) once the leaderboard
shows it earns its place."""

import importlib
import pkgutil

NAMES = []
for _mod in pkgutil.iter_modules(__path__):
    NAMES += importlib.import_module(f"{__name__}.{_mod.name}").NAMES
