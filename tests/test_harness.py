import pandas as pd

from harness.datasets import load
from harness.run import leaderboard, run, scenarios

CFG = {"lengths_h": [6, 48], "t0_step_h": 24, "holdout_days": 5}
TARGET = pd.Series(1.0, index=pd.date_range("2026-09-01", periods=20 * 144, freq="10min", tz="UTC"))
HOLDOUT_START = pd.Timestamp("2026-09-16", tz="UTC")


def test_scenarios_stay_out_of_the_holdout():
    found = scenarios(TARGET, CFG, holdout=False)
    assert found[0] == (pd.Timestamp("2026-09-01", tz="UTC"), 6)
    assert max(t0 + pd.Timedelta(hours=h) for t0, h in found) == HOLDOUT_START
    assert len(found) == 15 + 14  # t₀ on days 1..15; 48 h windows only up to day 14


def test_holdout_scenarios_start_inside_it():
    assert min(t0 for t0, _ in scenarios(TARGET, CFG, holdout=True)) == HOLDOUT_START


def test_baseline_scores_one():
    pairs = load({"name": "syn", "kind": "synthetic", "days": 12, "seed": 0})
    results, skipped = run(pairs, {"identity": ("identity", {})}, CFG, holdout=False)
    board = leaderboard(results, {"wind_rmse": 1, "energy_wape_pct": 2}, "identity")
    assert skipped == {"syn": 0}
    assert set(board["dataset"]) == {"syn", "all"} and set(board["length_h"]) == {6, 48, "all"}
    assert (board["score"] == 1).all()
