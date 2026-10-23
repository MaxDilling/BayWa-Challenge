import json
from pathlib import Path

import pytest

from windgap.core.grid import from_ms, grid_to_series, nan_to_none, to_ms
from windgap.core.io import CsvError
from windgap.core.outage import detect_outages, fill_during_outage
from windgap.core.schema import Outage

CASES = json.loads((Path(__file__).resolve().parent.parent / "fixtures" / "outage" / "cases.json").read_text())


def spans(outages: list[Outage]) -> list[dict]:
    return [{"startMs": to_ms(o.start), "endMs": to_ms(o.end)} for o in outages]


@pytest.mark.parametrize("case", CASES["detect"], ids=lambda c: c["name"])
def test_detect(case):
    outages, gaps = detect_outages(grid_to_series(case["target"]), [grid_to_series(r) for r in case["references"]])
    assert (spans(outages), spans(gaps)) == (case["outages"], case["gaps"])


@pytest.mark.parametrize("case", CASES["fill"], ids=lambda c: c["name"])
def test_fill(case):
    ref = grid_to_series(case["reference"], name="ref")
    outage = Outage(from_ms(case["outage"]["startMs"]), from_ms(case["outage"]["endMs"]))
    if "error" in case:
        with pytest.raises(CsvError, match=case["error"]):
            fill_during_outage(ref, outage)
    else:
        assert nan_to_none(fill_during_outage(ref, outage)) == case["values"]
