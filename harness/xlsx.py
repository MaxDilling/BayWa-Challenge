"""Every .xlsx in a folder as CSV in its subfolder csv/, read by windgap.core.xlsx (SPEC.md S1), for people and tools that want
CSV files. One CSV per sheet: <file>.csv, or <file>_<sheet>.csv when the workbook has several.
Run: make csv [XLSX=data/data_hackathon_baywa_re]"""

import csv
import sys
from pathlib import Path

from windgap.core.xlsx import read_xlsx


def convert(folder: Path) -> list[Path]:
    written = []
    (folder / "csv").mkdir(exist_ok=True)
    for path in sorted(p for p in folder.glob("*.xlsx") if not p.name.startswith("~$")):  # ~$: Excel's lock file
        sheets = read_xlsx(path.read_bytes())
        for name, table in sheets.items():
            out = folder / "csv" / (f"{path.stem}.csv" if len(sheets) == 1 else f"{path.stem}_{name}.csv")
            with out.open("w", newline="") as f:
                csv.writer(f, lineterminator="\n").writerows(table)
            written.append(out)
    return written


if __name__ == "__main__":
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "data/data_hackathon_baywa_re")
    written = convert(folder)
    if not written:
        sys.exit(f"{folder}: no .xlsx files")
    print(*(f"wrote {p}" for p in written), sep="\n")
