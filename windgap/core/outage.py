"""Outage detection (SPEC.md S2) and bridging of short reference gaps during an outage (S1), the twin of
web/src/data/outage.ts and dataset.ts: same rules, same fixtures/outage/cases.json."""

import numpy as np
import pandas as pd

from windgap.core.grid import align
from windgap.core.io import CsvError
from windgap.core.schema import STEP, Outage

MIN_OUTAGE_STEPS = 3
MAX_REFERENCE_FILL_STEPS = 6


def detect_outages(target: pd.Series, refs: list[pd.Series]) -> tuple[list[Outage], list[Outage]]:
    """Runs of missing target values while a reference is measuring: (outages of ≥ 3 steps, shorter gaps). Outages are
    sorted longest first, those before the first target value last, because there is nothing to learn from."""
    df = align([target, *refs])
    missing = df.iloc[:, 0].isna().to_numpy()
    measuring = df.iloc[:, 1:].notna().any(axis=1).to_numpy()
    edges = np.diff(np.concatenate([[0], missing.astype(int), [0]]))
    runs = [(i, j) for i, j in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)) if measuring[i:j].any()]
    first = int(np.argmin(missing))
    outages = sorted((r for r in runs if r[1] - r[0] >= MIN_OUTAGE_STEPS), key=lambda r: (bool(r[0] < first), r[0] - r[1]))

    def spans(rs):
        return [Outage(df.index[0] + i * STEP, df.index[0] + j * STEP) for i, j in rs]

    return spans(outages), spans(r for r in runs if r[1] - r[0] < MIN_OUTAGE_STEPS)


def fill_during_outage(ref: pd.Series, outage: Outage) -> pd.Series:
    """The engines need complete references during the outage: bridge gaps of up to 6 steps linearly, refuse longer
    ones. `ref.name` is the reference's id."""
    values = ref.to_numpy(dtype=float).copy()
    first = (outage.start - ref.index[0]) // STEP
    last = (outage.end - ref.index[0]) // STEP - 1
    if first < 0 or last >= len(values):
        raise CsvError(f'Reference "{ref.name}" does not cover the whole outage.')
    i = first
    while i <= last:
        if not np.isnan(values[i]):
            i += 1
            continue
        j = i
        while j <= last and np.isnan(values[j]):
            j += 1
        before = values[i - 1] if i > 0 else np.nan
        after = values[j] if j < len(values) else np.nan
        if j - i > MAX_REFERENCE_FILL_STEPS or np.isnan(before) or np.isnan(after):
            raise CsvError(f'Reference "{ref.name}" misses {j - i} steps in a row during the outage; '
                           f"at most {MAX_REFERENCE_FILL_STEPS} are bridged.")
        values[i:j] = before + (after - before) * np.arange(1, j - i + 1) / (j - i + 1)
        i = j
    return pd.Series(values, index=ref.index, name=ref.name)
