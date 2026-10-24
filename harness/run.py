"""Rolling-origin scenarios over windgap.backtest.fold and the leaderboard built from them (SPEC.md, "Harness")."""

import pandas as pd

from harness.datasets import Pair
from windgap.backtest import fold
from windgap.core.io import CsvError
from windgap.core.metrics import summarize
from windgap.core.outage import fill_during_outage
from windgap.core.schema import STEP, Outage

COLUMNS = ["wind_rmse", "wind_mae", "power_rmse", "power_mae", "energy_wape_pct", "energy_dev_pct", "energy_err_kwh",
           "bias", "coverage_80", "energy_coverage_80", "energy_band_pct", "score", "n"]


def scenarios(target: pd.Series, cfg: dict, holdout: bool) -> list[tuple[pd.Timestamp, float]]:
    """(t₀, length in hours) pairs. Without `holdout`, every window ends before the locked last `holdout_days`
    and t₀ leaves at least `min_train_days`; with it, t₀ lies inside the holdout."""
    first, end = target.first_valid_index(), target.last_valid_index() + STEP
    holdout_start = end - pd.Timedelta(days=cfg["holdout_days"])
    t0 = holdout_start if holdout else first + pd.Timedelta(days=cfg["min_train_days"])
    stop = end if holdout else holdout_start
    out = []
    while t0 < stop:
        out += [(t0, h) for h in cfg["lengths_h"] if t0 + pd.Timedelta(hours=h) <= stop]
        t0 += pd.Timedelta(hours=cfg["t0_step_h"])
    return out


def run(pairs: list[Pair], models: dict[str, tuple[str, dict]], cfg: dict, holdout: bool) -> tuple[pd.DataFrame, dict]:
    """One row per model × scenario, and per dataset the number of scenarios skipped because a reference has a gap
    in the window that the import would not bridge either (fill_during_outage, as in the GUI and harness.predict)."""
    rows, skipped = [], {}
    for pair in pairs:
        skipped[pair.name] = 0
        for t0, hours in scenarios(pair.target, cfg | pair.scenarios, holdout):
            end = t0 + pd.Timedelta(hours=hours)
            try:
                refs = pd.concat([fill_during_outage(pair.refs[c], Outage(t0, end)) for c in pair.refs], axis=1)
            except CsvError:
                skipped[pair.name] += 1
                continue
            for label, (model, params) in models.items():
                _, metrics = fold(model, params, pair.target, refs, pair.curve, t0, end, pair.extra)
                if metrics:
                    rows.append({"model": label, "dataset": pair.name, "length_h": hours, "t0": t0, **metrics})
    return pd.DataFrame(rows), skipped


def leaderboard(results: pd.DataFrame, weights: dict[str, float], baseline: str) -> pd.DataFrame:
    """Summarized metrics per model × dataset × outage length, plus "all" rows over lengths and over datasets.
    score = Σ wᵢ · metricᵢ / metricᵢ(baseline) / Σ wᵢ over the weighted metrics, so the baseline scores 1 and lower is
    better. The "all" dataset rows average the per-dataset rows (score included), weighting every dataset equally."""
    metrics = results.columns.difference(["model", "dataset", "length_h", "t0"])

    def table(keys: list[str]) -> pd.DataFrame:
        return results.groupby(keys)[metrics].apply(
            lambda g: pd.Series(summarize(g.to_dict("records")) | {"n": len(g)}))

    per_dataset = pd.concat([
        table(["model", "dataset", "length_h"]).reset_index(),
        table(["model", "dataset"]).reset_index().assign(length_h="all"),
    ])
    keyed = per_dataset.set_index(["dataset", "length_h"])
    base = keyed[per_dataset["model"].to_numpy() == baseline]
    keyed["score"] = sum(w * keyed[m] / base[m].reindex(keyed.index) for m, w in weights.items()) / sum(weights.values())
    per_dataset = keyed.reset_index().reindex(columns=["model", "dataset", "length_h", *COLUMNS])
    groups = per_dataset.groupby(["model", "length_h"], sort=False)
    overall = groups[COLUMNS].mean().reset_index().assign(dataset="all", n=groups["n"].sum().to_numpy())
    board = pd.concat([per_dataset, overall])[["model", "dataset", "length_h", *COLUMNS]].astype({"n": int})
    return board.sort_values(["dataset", "length_h", "score"], key=_length_order, ignore_index=True)


def _length_order(col: pd.Series) -> pd.Series:
    return col.map(lambda v: float("inf") if v == "all" else v) if col.name == "length_h" else col
