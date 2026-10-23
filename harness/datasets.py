"""Datasets named in configs/eval.yaml: synthetic pairs, or folders of challenge-format CSVs read through
windgap.core.io (demo data, DWD pairs, the challenge data).

Folder layout: one CSV without timestamps is the power curve (per turbine); every wind column of the other CSVs is
a series. The series whose id contains "target" (file name, or column header in a multi-column file) is the
target, all others are references in file order."""

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from harness.synthetic import generic_power_curve, synthetic_pair
from windgap.core import io
from windgap.core.grid import align
from windgap.core.schema import PowerCurve

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Pair:
    name: str
    target: pd.Series
    refs: pd.DataFrame  # same index as target
    curve: PowerCurve


def load(spec: dict) -> list[Pair]:
    """All pairs of one dataset entry. A folder pattern that matches no folder with CSVs yields no pairs."""
    if spec["kind"] == "synthetic":
        df = synthetic_pair(days=spec["days"], seed=spec["seed"])
        return [Pair(spec["name"], df["target"], df[["ref"]], generic_power_curve())]
    if spec["kind"] == "folder":
        folders = sorted(f for f in ROOT.glob(spec["path"]) if any(f.glob("*.csv")))
        many = "*" in spec["path"]
        return [read_folder(f"{spec['name']}/{f.name}" if many else spec["name"], f, spec.get("n_turbines", 1))
                for f in folders]
    raise ValueError(f"unknown dataset kind {spec['kind']!r}")


def read_folder(name: str, folder: Path, n_turbines: int) -> Pair:
    curves, series = [], []
    for path in sorted(folder.glob("*.csv")):
        try:
            table = io.read_table(path.read_text())
            if io.time_columns(table.rows[0][1]) is None:
                curves.append(io.power_curve(table))
            else:
                series += [site.wind for site, _ in io.wind_sites(path.stem, table)]
        except io.CsvError as e:
            raise io.CsvError(f"{path}: {e}") from e
    targets = [s for s in series if "target" in s.name.lower()]
    if len(curves) != 1 or len(targets) != 1 or len(series) < 2:
        raise ValueError(f"{folder} needs one power curve CSV, one series named *target* and at least one reference; "
                         f"found {len(curves)} curves and series {[s.name for s in series]}")
    df = align([targets[0], *(s for s in series if s is not targets[0])])
    curve = curves[0]
    return Pair(name, df.iloc[:, 0], df.iloc[:, 1:], PowerCurve(curve.wind_ms, curve.power_kw, n_turbines))
