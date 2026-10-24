"""Excel workbooks for the import (SPEC.md S1): every sheet as the text of a table that windgap.core.io reads like a
CSV. Date cells become wall-clock `YYYY-MM-DD HH:MM[:SS]` without a time zone, numbers their shortest form, empty
cells stay empty (missing); cells are tab-separated. Twin of web/src/data/xlsx.ts. Standard library only, no file
access, so it stays Pyodide-safe."""

import io
import re
import zipfile
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
EXCEL_EPOCH = datetime(1899, 12, 30)
BUILTIN_DATES = {*range(14, 23), 45, 46, 47}


def xlsx_texts(name: str, data: bytes) -> list[tuple[str, str]]:
    """(name, table text) per sheet: the file's name, or <name>_<sheet> when the workbook has several sheets."""
    sheets = read_xlsx(data)
    return [(name if len(sheets) == 1 else f"{name}_{sheet}", "\n".join("\t".join(row) for row in rows))
            for sheet, rows in sheets.items()]


def read_xlsx(data: bytes) -> dict[str, list[list[str]]]:
    """Rows of every sheet by sheet name, cells as text."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = lambda name: ET.fromstring(z.read(name))
        shared = ["".join(t.text or "" for t in si.iter(f"{M}t")) for si in xml("xl/sharedStrings.xml").iter(f"{M}si")] \
            if "xl/sharedStrings.xml" in z.namelist() else []
        dates = date_styles(xml("xl/styles.xml")) if "xl/styles.xml" in z.namelist() else set()
        targets = {r.get("Id"): r.get("Target") for r in xml("xl/_rels/workbook.xml.rels")}
        sheets = {}
        for s in xml("xl/workbook.xml").iter(f"{M}sheet"):
            target = targets[s.get(f"{R}id")].removeprefix("/xl/").removeprefix("/")
            sheets[s.get("name")] = rows(xml(target if target.startswith("xl/") else f"xl/{target}"), shared, dates)
        return sheets


def date_styles(styles: ET.Element) -> set[int]:
    """Indices of the cell styles whose number format shows a date or time."""
    custom = {int(f.get("numFmtId")) for f in styles.iter(f"{M}numFmt")
              if re.search(r"[ymdhs]", re.sub(r'"[^"]*"|\[[^]]*]|\\.', "", f.get("formatCode")), re.I)}
    xfs = styles.find(f"{M}cellXfs")
    return {i for i, xf in enumerate([] if xfs is None else xfs) if int(xf.get("numFmtId", 0)) in BUILTIN_DATES | custom}


def rows(sheet: ET.Element, shared: list[str], dates: set[int]) -> list[list[str]]:
    out = []
    for row in sheet.iter(f"{M}row"):
        cells = {}
        for c in row.iter(f"{M}c"):
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r")).group():
                col = col * 26 + ord(ch) - 64
            cells[col - 1] = cell(c, shared, dates)
        out.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
    while out and not any(out[-1]):
        out.pop()
    width = max(map(len, out), default=0)
    return [r + [""] * (width - len(r)) for r in out]


def cell(c: ET.Element, shared: list[str], dates: set[int]) -> str:
    kind, v = c.get("t"), c.find(f"{M}v")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in c.iter(f"{M}t"))
    if v is None or v.text is None:
        return ""
    if kind == "s":
        return shared[int(v.text)]
    if kind in ("b", "str", "e"):
        return v.text
    if int(c.get("s", 0)) in dates:
        t = EXCEL_EPOCH + timedelta(days=float(v.text))
        t = (t + timedelta(milliseconds=500)).replace(microsecond=0)
        return f"{t:%Y-%m-%d %H:%M}" if t.second == 0 else f"{t:%Y-%m-%d %H:%M:%S}"
    x = float(v.text)
    return str(int(x)) if x.is_integer() else repr(x)
