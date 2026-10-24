import json
import re
from pathlib import Path

import pytest

from windgap.core.grid import series_to_grid
from windgap.core.io import CsvError, read_power_curve_csv, read_wind_csv
from windgap.core.xlsx import xlsx_texts

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "csv"
CASES = sorted([*FIXTURES.glob("*.csv"), *FIXTURES.glob("*.xlsx")])


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.name)
def test_csv_fixture(path: Path):
    if path.suffix == ".xlsx":
        [(_, text)] = xlsx_texts(path.stem, path.read_bytes())
    else:
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
                **({"direction": series_to_grid(site.extra["direction"])} if site.extra is not None else {}),
            }
            for site, r in read_wind_csv(path.stem, text)
        ] == expected
