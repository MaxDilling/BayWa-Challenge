"""Engine contract S5 (SPEC.md). Pure JSON in, JSON out: the py engine calls this inside Pyodide,
the harness calls it natively to write the golden fixtures the ts engine is tested against."""

import json
import math
import time

import numpy as np
import pandas as pd

import windgap
from windgap.backtest import MIN_TRAIN_STEPS, backtest, predict_window
from windgap.core.energy import RHO_CURVE, air_density, energy_loss, expected_power, target_density
from windgap.core.grid import align, directions, from_ms, grid_to_series, to_ms
from windgap.core.schema import STEP, STEP_S, Outage, PowerCurve
from windgap.models import registry

MAX_SCATTER = 2000


def handle(request_json: str) -> str:
    return json.dumps(analyze(json.loads(request_json)), allow_nan=False)


def list_models() -> str:
    return json.dumps(registry.info())


def analyze(req: dict) -> dict:
    started = time.perf_counter()
    df = align([grid_to_series(req["target"]), *(grid_to_series(r["grid"]) for r in req["references"])])
    df.columns = ["target", *(r["id"] for r in req["references"])]
    target, refs = df.iloc[:, 0], df.iloc[:, 1:]
    extra = directions([grid_to_series(r["direction"]) if r.get("direction") else None for r in req["references"]],
                       df.index)
    curve = PowerCurve(
        wind_ms=np.asarray(req["powerCurve"]["windMs"], dtype=float),
        power_kw=np.asarray(req["powerCurve"]["powerKw"], dtype=float),
        n_turbines=int(req["powerCurve"]["nTurbines"]),
    )
    outage = Outage(from_ms(req["outage"]["startMs"]), from_ms(req["outage"]["endMs"]))
    outage_index = pd.date_range(outage.start, outage.end, freq=STEP, inclusive="left")
    refs_out = refs.reindex(outage_index)
    if refs_out.isna().any().any():
        raise ValueError("references must be complete during the outage; gap filling belongs to the import step")

    name, params = req["model"], req.get("params") or {}
    known = target.where((df.index < outage.start) | (df.index >= outage.end))
    if (n_train := int(known.notna().sum())) < MIN_TRAIN_STEPS:
        raise ValueError(f"The target has {n_train} values outside the outage; at least {MIN_TRAIN_STEPS} "
                         "(one day) are needed to learn from.")
    model = registry.create(name, **params).fit(known, refs, extra)
    pred = predict_window(model, refs, outage.start, outage.end, extra)
    density = _density(req, df.index, outage)
    factor = 1.0 if density is None else ((density.kg_m3 / RHO_CURVE) ** (1 / 3)).to_numpy()
    energy = energy_loss(expected_power(pred, curve, factor), outage, model.errors.acf)
    explanation = model.explain()

    return {
        "prediction": {
            "t0": to_ms(outage.start),
            "stepS": STEP_S,
            "mean": _floats(pred["mean"]),
            "q10": _floats(pred["q10"]),
            "q90": _floats(pred["q90"]),
        },
        "validation": _finite(backtest(name, params, known, refs, curve, outage.start, len(outage_index), extra)),
        "explanation": {
            "summary": explanation.summary,
            "formula": explanation.formula,
            "params": _finite(explanation.params),
            "diagnostics": _finite(explanation.diagnostics),
        },
        "energy": {
            "kwhP10": energy.kwh_p10,
            "kwhP50": energy.kwh_p50,
            "kwhP90": energy.kwh_p90,
            "cumulativeKwh": _floats(energy.cumulative),
            **({} if density is None else {"airDensity": {
                "kgM3": float(density.kg_m3.mean()),
                "ratio": density.ratio,
                "kwhP50AtCurveDensity": energy_loss(expected_power(pred, curve), outage, model.errors.acf).kwh_p50,
            }}),
        },
        "scatter": _scatter(known, refs, extra, model, explanation.diagnostics),
        "engine": {"id": "py", "version": windgap.__version__, "ms": (time.perf_counter() - started) * 1000},
    }


def _density(req: dict, index: pd.DatetimeIndex, outage: Outage):
    """Air density at the target in the outage (S4), from the temperature and pressure of target and references."""
    def rho(temperature, pressure) -> pd.Series:
        return air_density(grid_to_series(temperature), grid_to_series(pressure)).reindex(index)

    if not (req.get("targetTemperature") and req.get("targetPressure")):
        return None
    refs = [rho(r["temperature"], r["pressure"]) for r in req["references"] if r.get("temperature") and r.get("pressure")]
    return target_density(rho(req["targetTemperature"], req["targetPressure"]), pd.concat(refs, axis=1), outage) if refs else None


def _scatter(target: pd.Series, refs: pd.DataFrame, extra: pd.DataFrame | None, model, diagnostics: dict) -> dict:
    """Training pairs as the model sees them: target(t) against the chosen reference (`reference_index`, else the only
    one) at t − τ (τ = lag_min), evenly
    thinned to MAX_SCATTER. The fit line is the in-sample prediction averaged per 1 m/s bin of that shifted reference:
    exactly the model's line for a + b · v_r(t − τ), and still meaningful for models that depend on more."""
    ref = refs.iloc[:, int(diagnostics.get("reference_index", 0))].shift(round(diagnostics.get("lag_min", 0) * 60 / STEP_S))
    pairs = pd.DataFrame({"ref": ref, "target": target}).dropna()
    k = min(len(pairs), MAX_SCATTER)
    shown = pairs.iloc[(np.arange(k) * len(pairs)) // k] if k else pairs
    line = pd.DataFrame({"ref": ref, "pred": model.predict(refs, extra)["mean"]}).dropna()
    bins = line.groupby(np.floor(line["ref"])).mean()
    return {
        "ref": _floats(shown["ref"]),
        "target": _floats(shown["target"]),
        "fitLine": [[float(x), float(y)] for x, y in zip(bins["ref"], bins["pred"])],
    }


def _floats(values) -> list[float]:
    return [float(v) for v in values]


def _finite(d: dict) -> dict[str, float]:
    """A metric that cannot be computed is absent, never NaN."""
    return {k: float(v) for k, v in d.items() if math.isfinite(v)}
