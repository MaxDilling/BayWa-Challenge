"""Datasets named in configs/eval.yaml: synthetic pairs, or folders of challenge-format CSVs read through
windgap.core.io (demo data, DWD pairs, the challenge data).

Folder layout: one CSV without timestamps is the power curve (per turbine); every wind column of the other CSVs is
a series. The series whose id contains "target" (file name, or column header in a multi-column file) is the
target, all others are references in file order. `files` (globs, default every CSV) limits which files are read and
`target` names the target's id, so one folder with several targets (the challenge's T1–T3) serves several entries.
`extra_refs` (globs relative to the repo) adds references from elsewhere, e.g. the DWD stations in data/dwd_refs/.
`wind_scale` in the entry multiplies every series (target and references alike), e.g. (100 m / 10 m)^0.14 ≈ 1.38 to
lift 10 m station wind towards hub height. `scenarios` overrides the config's scenario settings for the entry.
Workbooks (.xlsx) are read sheet by sheet like CSVs (windgap.core.xlsx); a reference's wind direction column becomes
the models' `extra` (SPEC.md S3)."""

from dataclasses import dataclass, field, replace
from functools import cache
from pathlib import Path

import pandas as pd

from harness.synthetic import generic_power_curve, synthetic_pair
from windgap.core import io
from windgap.core.grid import align, directions
from windgap.core.schema import PowerCurve, Site
from windgap.core.xlsx import xlsx_texts

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Pair:
    name: str
    target: pd.Series
    refs: pd.DataFrame  # same index as target
    curve: PowerCurve
    extra: pd.DataFrame | None = None  # the references' wind directions (S3)
    scenarios: dict = field(default_factory=dict)  # overrides of the config's `scenarios:` for this dataset


def load(spec: dict) -> list[Pair]:
    """All pairs of one dataset entry. A folder pattern that matches no folder with CSVs yields no pairs."""
    return [replace(p, scenarios=spec.get("scenarios", {})) for p in _pairs(spec)]


def _pairs(spec: dict) -> list[Pair]:
    if spec["kind"] == "synthetic":
        df = synthetic_pair(days=spec["days"], seed=spec["seed"])
        return [Pair(spec["name"], df["target"], df[["ref"]], generic_power_curve())]
    if spec["kind"] == "folder":
        folders = sorted(f for f in ROOT.glob(spec["path"]) if any(f.glob("*.csv")))
        many = "*" in spec["path"]
        scale = spec.get("wind_scale", 1.0)
        pairs = [read_folder(f"{spec['name']}/{f.name}" if many else spec["name"], f, spec.get("n_turbines", 1),
                             spec.get("files", ["*.csv"]), spec.get("target"), spec.get("extra_refs", [])) for f in folders]
        return [replace(p, target=p.target * scale, refs=p.refs * scale) for p in pairs]
    raise ValueError(f"unknown dataset kind {spec['kind']!r}")


def file_texts(path: Path) -> list[tuple[str, str]]:
    """(name, table text) of a CSV, or of every sheet of a workbook."""
    return xlsx_texts(path.stem, path.read_bytes()) if path.suffix == ".xlsx" else [(path.stem, path.read_text())]


@cache
def _read(path: Path) -> tuple[list[PowerCurve], list[Site]]:
    """Power curves and wind series of one file; cached, because several entries share files (T1–T3, DWD)."""
    curves, sites = [], []
    try:
        for name, text in file_texts(path):
            table = io.read_table(text)
            if io.time_columns(table.rows[0][1]) is None:
                curves.append(io.power_curve(table))
            else:
                sites += [site for site, _ in io.wind_sites(name, table)]
    except io.CsvError as e:
        raise io.CsvError(f"{path}: {e}") from e
    return curves, sites


def read_folder(name: str, folder: Path, n_turbines: int, files: list[str], target: str | None,
                extra_refs: list[str] = ()) -> Pair:
    paths = [*sorted({p for pattern in files for p in folder.glob(pattern)}),
             *(p for pattern in extra_refs for p in sorted(ROOT.glob(pattern)))]
    curves = [c for path in paths for c in _read(path)[0]]
    sites = [s for path in paths for s in _read(path)[1]]
    targets = [s for s in sites if (s.site_id == target if target else "target" in s.site_id.lower())]
    if len(curves) != 1 or len(targets) != 1 or len(sites) < 2:
        raise ValueError(f"{folder} {files} needs one power curve CSV, one series {target or '*target*'} and at least "
                         f"one reference; found {len(curves)} curves and series {[s.site_id for s in sites]}")
    refs = [s for s in sites if s is not targets[0]]
    df = align([targets[0].wind, *(s.wind for s in refs)])
    curve = curves[0]
    extra = directions([None if s.extra is None else s.extra["direction"] for s in refs], df.index)
    return Pair(name, df.iloc[:, 0], df.iloc[:, 1:], PowerCurve(curve.wind_ms, curve.power_kw, n_turbines), extra)
