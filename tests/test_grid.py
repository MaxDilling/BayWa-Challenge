import math

from windgap.core.grid import align, grid_to_series, series_to_grid

T0 = 1_788_220_800_000  # 2026-09-01T00:00Z


def test_grid_roundtrip_keeps_missing_values():
    grid = {"t0": T0, "stepS": 600, "values": [1.5, None, 3.0]}
    s = grid_to_series(grid)
    assert math.isnan(s.iloc[1]) and str(s.index.tz) == "UTC"
    assert series_to_grid(s) == grid


def test_align_spans_all_series_on_one_grid():
    a = grid_to_series({"t0": T0, "stepS": 600, "values": [1.0, 2.0]})
    b = grid_to_series({"t0": T0 + 1_800_000, "stepS": 600, "values": [5.0]})
    df = align([a, b])
    assert len(df) == 4 and math.isnan(df.iloc[2, 0]) and df.iloc[3, 1] == 5.0
