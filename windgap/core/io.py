"""CSV import by the rules of SPEC.md S1, the twin of web/src/data/ (csv.ts, wind.ts, powerCurve.ts): same rules,
same messages, same fixtures/csv/. Text in, S2 structures out; no file access, so it stays Pyodide-safe."""

import math
import re
from calendar import timegm
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import cache
from time import gmtime, strftime

import numpy as np

from windgap.core.grid import grid_to_series
from windgap.core.schema import STEP_S, PowerCurve, Site

STEP_MS = STEP_S * 1000
HOUR_MS = 3_600_000


class CsvError(ValueError):
    """A problem the user can fix in the file; the message names the line where it can."""


@dataclass
class Table:
    header: list[str] | None
    rows: list[tuple[int, list[str]]]  # (line number, cells)


@dataclass
class ImportReport:
    rows: int
    measured: int
    missing: int
    negative: int  # negative values (e.g. -999 sentinels) are not wind speeds and count as missing
    ignored_columns: list[str]


MISSING = {"", "nan", "na", "n/a", "#n/a", "#nv", "null", "none", "-"}
DELIMITERS = ["\t", ";", ",", "|"]
NUMBER = re.compile(r"[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?", re.ASCII)
THOUSANDS_DOT = re.compile(r"[+-]?\d{1,3}(\.\d{3})+,\d*", re.ASCII)
THOUSANDS_COMMA = re.compile(r"[+-]?\d{1,3}(,\d{3})+\.\d*", re.ASCII)
TIME = r"(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?"
YEAR_FIRST = re.compile(rf"(\d{{4}})([-/.])(\d{{1,2}})\2(\d{{1,2}})(?:T|\s+){TIME}\s*(Z|[+-]\d{{2}}:?\d{{2}})?", re.ASCII)
YEAR_LAST = re.compile(rf"(\d{{1,2}})([./-])(\d{{1,2}})\2(\d{{4}})\s+{TIME}", re.ASCII)
DATE_ONLY = re.compile(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}", re.ASCII)
TIME_ONLY = re.compile(r"\d{1,2}:\d{2}(:\d{2})?", re.ASCII)
AMBIGUOUS = re.compile(r"(\d{1,2})([/-])(\d{1,2})\2\d{4}\b", re.ASCII)

WIND = re.compile(r"wind|speed|geschw|m/s|\bws\b", re.I)
NOT_WIND = re.compile(
    r"dir|richt|deg|°|temp|press|druck|hpa|mbar|humid|feucht|precip|nieder|power|leistung|rpm|status|flag|qual|gust|böe|max|std|sigma",
    re.I,
)
UTC_HEADER = re.compile(r"\b(utc|gmt)\b(?!\s*[+-])", re.I)
CURVE_WIND = re.compile(r"wind|speed|geschw|m/s|^v\b|^ws\b", re.I)
POWER = re.compile(r"power|leistung|kw|mw|^p\b", re.I)
COEFFICIENT = re.compile(r"coeff|\bc[pt]\b|thrust|schub", re.I)
EPOCH = datetime(1970, 1, 1)


def read_table(text: str) -> Table:
    lines = [(i + 1, s) for i, s in enumerate(re.split(r"\r?\n", text.removeprefix("﻿"))) if s.strip()]
    if not lines:
        raise CsvError("The file is empty.")
    sample = [s for _, s in lines[:50]]
    score, delimiter, width = 0, "", 0
    for d in DELIMITERS:
        w = len(sample[-1].split(d))
        s = sum(len(line.split(d)) == w for line in sample) if w > 1 else 0
        if s > score:
            score, delimiter, width = s, d, w
    if not delimiter:
        raise CsvError('Could not detect the column separator (expected ";", ",", "|" or tab).')
    cells = [[_unquote(c) for c in s.split(delimiter)] for _, s in lines]
    first = next((i for i, c in enumerate(cells) if len(c) == width and any(map(_looks_like_data, c))), None)
    if first is None:
        raise CsvError("The file has no data rows.")
    rows = []
    for (line, _), row in zip(lines[first:], cells[first:]):
        if len(row) != width:
            raise CsvError(f"Line {line}: expected {width} columns, found {len(row)}.")
        rows.append((line, row))
    return Table(header=next((c for c in cells[:first] if len(c) == width), None), rows=rows)


def _unquote(cell: str) -> str:
    cell = cell.strip()
    m = re.fullmatch(r'"(.*)"', cell)
    return (m[1] if m else cell).strip()


def _looks_like_data(cell: str) -> bool:
    return _is_number(parse_number(cell)) or looks_like_timestamp(cell) or bool(DATE_ONLY.fullmatch(cell))


def parse_number(cell: str) -> float | None:
    """Number with decimal point or comma; NaN for a missing-value token; None if not a number at all."""
    if cell.lower() in MISSING:
        return math.nan
    if THOUSANDS_DOT.fullmatch(cell):
        return float(cell.replace(".", "").replace(",", "."))
    if THOUSANDS_COMMA.fullmatch(cell):
        return float(cell.replace(",", ""))
    if not NUMBER.fullmatch(cell):
        return None
    return float(cell.replace(",", ".", 1))


def _is_number(v: float | None) -> bool:
    return v is not None and not math.isnan(v)


def looks_like_timestamp(cell: str) -> bool:
    return bool(YEAR_FIRST.fullmatch(cell) or YEAR_LAST.fullmatch(cell))


def parse_timestamp(cell: str, day_first: bool = True) -> tuple[int, int | None] | None:
    """(wall-clock ms as if UTC, offset in minutes or None for Europe/Berlin). `day_first` only decides dates like
    01/10/2026; see `is_day_first`. Invalid dates (31.02.) are not timestamps."""
    if m := YEAR_FIRST.fullmatch(cell):
        y, mo, d, zone = m[1], m[3], m[4], m[9]
    elif m := YEAR_LAST.fullmatch(cell):
        y, mo, d, zone = m[4], m[3], m[1], None
        if m[2] != "." and not day_first:
            mo, d = d, mo
    else:
        return None
    try:
        wall = datetime(int(y), int(mo), int(d), int(m[5]), int(m[6]), int(m[7] or 0))
    except ValueError:
        return None
    ms = (wall - EPOCH) // timedelta(milliseconds=1) + math.floor(float("0" + (m[8] or "")) * 1000)
    if not zone:
        return ms, None
    if zone == "Z":
        return ms, 0
    digits = zone[1:].replace(":", "")
    return ms, (-1 if zone[0] == "-" else 1) * (int(digits[:2]) * 60 + int(digits[2:]))


def is_day_first(cells: list[str]) -> bool:
    """Day/month order of dates like 01/10/2026 for a whole file: a part above 12 must be the day."""
    ambiguous = day = month = False
    for cell in cells:
        if m := AMBIGUOUS.match(cell):
            ambiguous = True
            day = day or int(m[1]) > 12
            month = month or int(m[3]) > 12
    if day and month:
        raise CsvError("The dates mix day-first (31/10/2026) and month-first (10/31/2026) order.")
    if ambiguous and not day and not month:
        raise CsvError(
            "Dates like 01/10/2026 can mean 1 October or 10 January, and no day above 12 decides it. "
            "Please use 2026-10-01 or 01.10.2026."
        )
    return not month


@cache
def _summer_time(year: int) -> tuple[int, int]:
    """EU rule: UTC+2 from the last Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC."""

    def last_sunday(month: int) -> int:
        last = date(year, month + 1, 1) - timedelta(days=1)
        sunday = last - timedelta(days=(last.weekday() + 1) % 7)
        return timegm((sunday.year, sunday.month, sunday.day, 1, 0, 0)) * 1000

    return last_sunday(3), last_sunday(10)


def _is_summer_time(utc_ms: int) -> bool:
    start, end = _summer_time(gmtime(utc_ms // 1000).tm_year)
    return start <= utc_ms < end


def _berlin_candidates(local_ms: int) -> list[int]:
    summer, winter = local_ms - 2 * HOUR_MS, local_ms - HOUR_MS
    return [summer] * _is_summer_time(summer) + [winter] * (not _is_summer_time(winter))


def to_utc(stamps: list[tuple[int, tuple[int, int | None]]]) -> list[int]:
    """UTC instants for a column of (line, timestamp). Berlin times in the doubled hour of the autumn change are
    resolved by order: the first pass is summer time, the repeat winter time."""
    out: list[int] = []
    previous, previous_line = -math.inf, 0
    for line, (ms, offset) in stamps:
        if offset is not None:
            utc = ms - offset * 60_000
        else:
            candidates = _berlin_candidates(ms)
            if not candidates:
                raise CsvError(f"Line {line}: this time does not exist in Europe/Berlin (spring clock change).")
            utc = next((c for c in candidates if c > previous), candidates[-1])
        if utc == previous:
            raise CsvError(f"Line {line}: duplicate timestamp, the same time as line {previous_line}.")
        if utc < previous:
            raise CsvError(f"Line {line}: timestamps must be in chronological order.")
        previous, previous_line = utc, line
        out.append(utc)
    return out


def time_columns(cells: list[str]) -> list[int] | None:
    """The column holding the timestamp in a data row, or a date and a time column side by side."""
    for i, c in enumerate(cells):
        if looks_like_timestamp(c):
            return [i]
        if DATE_ONLY.fullmatch(c) and i + 1 < len(cells) and TIME_ONLY.fullmatch(cells[i + 1]):
            return [i, i + 1]
    return None


def read_wind_csv(name: str, text: str) -> list[tuple[Site, ImportReport]]:
    """Every wind column of a CSV as its own Site on the UTC 10-minute grid; missing values are NaN."""
    return wind_sites(name, read_table(text))


def wind_sites(name: str, table: Table) -> list[tuple[Site, ImportReport]]:
    header, rows = table.header, table.rows
    first = rows[0][1]
    time_cols = time_columns(first)
    if time_cols is None:
        raise CsvError("No timestamp column found (expected e.g. 2026-10-01 00:10 or 01.10.2026 00:10).")

    def stamp(cells: list[str]) -> str:
        return " ".join(cells[i] for i in time_cols)

    others = [i for i in range(len(first)) if i not in time_cols]
    candidates = [i for i in others if not header or not NOT_WIND.search(header[i])]
    named = [i for i in candidates if header and WIND.search(header[i])]
    wind_cols = named or [i for i in candidates if any(_is_number(parse_number(cells[i])) for _, cells in rows)]
    if not wind_cols:
        raise CsvError("No wind speed column found.")

    day_first = is_day_first([stamp(cells) for _, cells in rows])
    utc_header = bool(header and UTC_HEADER.search(header[time_cols[0]]))
    stamps = []
    for line, cells in rows:
        ts = parse_timestamp(stamp(cells), day_first)
        if ts is None:
            raise CsvError(f'Line {line}: "{stamp(cells)}" is not a timestamp.')
        stamps.append((line, (ts[0], 0) if utc_header and ts[1] is None else ts))
    utc = to_utc(stamps)
    for t, (line, cells) in zip(utc, rows):
        if t % STEP_MS:
            raise CsvError(
                f'Line {line}: "{stamp(cells)}" is not on the 10-minute grid; the data must be 10-minute values.'
            )
    steps = sorted(b - a for a, b in zip(utc, utc[1:]))
    if steps and steps[len(steps) // 2] > STEP_MS:
        raise CsvError(
            f"Most rows are {steps[len(steps) // 2] // 60_000} minutes apart; the data must be 10-minute values."
        )

    t0 = utc[0]
    n = (utc[-1] - t0) // STEP_MS + 1
    ignored = [header[i] for i in others if i not in wind_cols] if header else []
    out = []
    for col in wind_cols:
        values: list[float | None] = [None] * n
        negative = 0
        for t, (line, cells) in zip(utc, rows):
            v = parse_number(cells[col])
            if v is None:
                raise CsvError(f'Line {line}: "{cells[col]}" is not a wind speed.')
            negative += v < 0
            values[(t - t0) // STEP_MS] = v if v >= 0 else None
        site_id = name if len(wind_cols) == 1 else (header[col] if header and header[col] else f"{name} column {col + 1}")
        measured = sum(v is not None for v in values)
        wind = grid_to_series({"t0": t0, "stepS": STEP_S, "values": values}, name=site_id)
        out.append((Site(site_id, wind), ImportReport(len(rows), measured, n - measured, negative, ignored)))
    return out


def read_power_curve_csv(text: str) -> PowerCurve:
    """Per-turbine power curve: wind speed (m/s) and power (kW, or MW when the header says so)."""
    return power_curve(read_table(text))


def power_curve(table: Table) -> PowerCurve:
    header, rows = table.header, table.rows
    columns = range(len(rows[0][1]))
    wind_col = next((i for i in columns if header and CURVE_WIND.search(header[i])), 0)
    power_cols = [
        i for i in columns if header and i != wind_col and POWER.search(header[i]) and not COEFFICIENT.search(header[i])
    ]
    if len(power_cols) > 1:
        names = ", ".join(header[i] for i in power_cols)
        raise CsvError(f"The power curve has several power columns ({names}); keep only the one to use.")
    power_col = power_cols[0] if power_cols else next((i for i in columns if i != wind_col), None)
    if power_col is None:
        raise CsvError("A power curve needs a wind speed and a power column.")
    mw = header and re.search("mw", header[power_col], re.I) and not re.search("kw", header[power_col], re.I)
    scale = 1000 if mw else 1
    wind_ms: list[float] = []
    power_kw: list[float] = []
    for line, cells in rows:
        v, p = parse_number(cells[wind_col]), parse_number(cells[power_col])
        if not _is_number(v) or not _is_number(p):
            raise CsvError(f"Line {line}: power curve rows need a wind speed and a power value.")
        if wind_ms and v <= wind_ms[-1]:
            raise CsvError(f"Line {line}: wind speeds must increase.")
        wind_ms.append(v)
        power_kw.append(p * scale)
    if len(wind_ms) < 2:
        raise CsvError("A power curve needs at least two points.")
    return PowerCurve(wind_ms=np.array(wind_ms), power_kw=np.array(power_kw))


FILLED_HEADER = "Timestamp,Wind speed (m/s),Predicted"


def filled_target_csv(target: dict, predictions: list[dict]) -> str:
    """The target grid in the challenge format, with the predicted mean (3 decimals) where the target is missing
    during a prediction; `Predicted` is 1 on those rows. Rows span the target and every prediction, times are Europe/
    Berlin as in the input, measured values unchanged, still missing values NaN. Twin of web/src/data/filled.ts."""
    spans = [(target["t0"], len(target["values"])), *((p["t0"], len(p["mean"])) for p in predictions)]
    t0 = min(start for start, _ in spans)
    values: list[float | None] = [None] * ((max(start + n * STEP_MS for start, n in spans) - t0) // STEP_MS)
    predicted = [False] * len(values)
    offset = (target["t0"] - t0) // STEP_MS
    values[offset:offset + len(target["values"])] = target["values"]
    for p in predictions:
        offset = (p["t0"] - t0) // STEP_MS
        for k, mean in enumerate(p["mean"], offset):
            if values[k] is None:
                values[k], predicted[k] = mean, True
    lines = [FILLED_HEADER]
    for k, (v, filled) in enumerate(zip(values, predicted)):
        utc = t0 + k * STEP_MS
        local = strftime("%Y-%m-%d %H:%M", gmtime((utc + (2 if _is_summer_time(utc) else 1) * HOUR_MS) // 1000))
        text = "NaN" if v is None else f"{v:.3f}" if filled else _shortest(v)
        lines.append(f"{local},{text},{int(filled)}")
    return "\n".join(lines) + "\n"


def _shortest(v: float) -> str:
    """Shortest text that reads back as v, as JavaScript's String(v) writes it."""
    return repr(float(v)).removesuffix(".0")
