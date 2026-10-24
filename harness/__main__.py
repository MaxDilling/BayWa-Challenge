"""Leaderboard CLI: uv run python -m harness --config configs/eval.yaml --models all [--datasets ...] [--holdout]"""

import argparse
import subprocess
import time
from pathlib import Path

import pandas as pd
import yaml

from harness import benchmarks
from harness.datasets import ROOT, load
from harness.run import COLUMNS, leaderboard, run
from windgap.models import registry

SHORT = ["wind_rmse", "power_rmse", "energy_wape_pct", "energy_dev_pct", "bias", "coverage_80", "energy_coverage_80", "energy_band_pct",
         "score", "n"]


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m harness")
    ap.add_argument("--config", default="configs/eval.yaml")
    ap.add_argument("--models", default="all", help="'all' or comma-separated registry names and variants; variants "
                    "marked on_demand only by name")
    ap.add_argument("--datasets", default="all", help="'all' or comma-separated names from the config, e.g. demo,dwd; "
                    "entries marked on_demand only by name")
    ap.add_argument("--holdout", action="store_true", help="score on the locked last days; only for final decisions")
    args = ap.parse_args()
    started = time.perf_counter()
    cfg = yaml.safe_load(Path(args.config).read_text())

    variants = {name: (name, {}) for name in registry.names()}
    variants |= {label: (v["model"], v.get("params", {})) for label, v in (cfg["variants"] or {}).items()}
    on_demand = {label for label, v in (cfg["variants"] or {}).items() if v.get("on_demand")} | set(benchmarks.NAMES)
    labels = [v for v in variants if v not in on_demand] if args.models == "all" else args.models.split(",")
    models = {label: variants[label] for label in dict.fromkeys([cfg["baseline"], *labels])}

    pairs = []
    for spec in cfg["datasets"]:
        if (args.datasets == "all" and not spec.get("on_demand")) or spec["name"] in args.datasets.split(","):
            loaded = load(spec)
            pairs += loaded
            if not loaded:
                print(f"{spec['name']}: no CSV files at {spec['path']}, skipped")
    results, skipped = run(pairs, models, cfg["scenarios"], args.holdout)
    board = leaderboard(results, cfg["score"], cfg["baseline"])

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout
    dirty = subprocess.run(["git", "diff", "--quiet", "HEAD"], cwd=ROOT).returncode
    out = ROOT / "runs" / f"{time.strftime('%Y%m%d-%H%M%S')}_{commit.strip()}{'-dirty' if dirty else ''}"
    out.mkdir(parents=True)
    (out / "config.yaml").write_text(yaml.safe_dump(cfg | {"args": vars(args)}, sort_keys=False))
    results.assign(t0=results["t0"].astype(str)).to_csv(out / "results.csv", index=False)
    board.to_csv(out / "leaderboard.csv", index=False)

    pd.set_option("display.width", 200)
    for pair in pairs:
        days = (pair.target.last_valid_index() - pair.target.first_valid_index()).days
        n = len(results[(results["dataset"] == pair.name) & (results["model"] == cfg["baseline"])])
        print(f"{pair.name}: {days} days, {n} scenarios, {skipped[pair.name]} skipped for reference gaps")
    split = "HOLDOUT" if args.holdout else "scenarios before the holdout"
    _show(f"All datasets, all lengths ({split})", board[(board["dataset"] == "all") & (board["length_h"] == "all")],
          ["model"], COLUMNS)
    _show("By dataset", board[(board["dataset"] != "all") & (board["length_h"] == "all")], ["dataset", "model"], SHORT)
    _show("By outage length (h), all datasets", board[(board["dataset"] == "all") & (board["length_h"] != "all")],
          ["length_h", "model"], SHORT)
    print(f"\n{out.relative_to(ROOT)}  ({time.perf_counter() - started:.1f} s)")


def _show(title: str, rows: pd.DataFrame, index: list[str], columns: list[str]) -> None:
    print(f"\n{title}\n{rows.set_index(index)[columns].to_string(float_format=lambda v: f'{v:.3g}')}")


main()
