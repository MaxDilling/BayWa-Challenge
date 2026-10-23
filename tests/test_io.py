import json
import re
from pathlib import Path

import pytest

from windgap.core.grid import series_to_grid
from windgap.core.io import CsvError, read_power_curve_csv, read_wind_csv

CASES = sorted((Path(__file__).resolve().parent.parent / "fixtures" / "csv").glob("*.csv"))


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_csv_fixture(path: Path):
    text = path.read_text(encoding="utf-8")
    expected = json.loads(path.with_name(f"{path.stem}.expected.json").read_text(encoding="utf-8"))
    curve = path.stem.startswith("curve_")
    if isinstance(expected, dict) and "error" in expected:
        with pytest.raises(CsvError, match=re.escape(expected["error"])):
            read_power_curve_csv(text) if curve else read_wind_csv(path.stem, text)
    elif curve:
        c = read_power_curve_csv(text)
        assert {"windMs": c.wind_ms.tolist(), "powerKw": c.power_kw.tolist()} == expected
    else:
        assert [
            {
                "id": site.site_id,
                "grid": series_to_grid(site.wind),
                "report": {
                    "rows": r.rows,
                    "measured": r.measured,
                    "missing": r.missing,
                    "negative": r.negative,
                    "ignoredColumns": r.ignored_columns,
                },
            }
            for site, r in read_wind_csv(path.stem, text)
        ] == expected
