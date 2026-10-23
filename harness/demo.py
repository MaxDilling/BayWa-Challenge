"""Writes the demo files behind "Load demo data" in the GUI, in the challenge's CSV format (Europe/Berlin
timestamps, NaN for missing values). October 2026 includes the autumn clock change. Run: make demo"""

from pathlib import Path

import numpy as np
import pandas as pd

from harness.synthetic import generic_power_curve, synthetic_pair

OUT = Path(__file__).resolve().parent.parent / "data" / "synthetic"
OUTAGE = (pd.Timestamp("2026-10-27 08:00", tz="Europe/Berlin"), pd.Timedelta("30h"))


def write_wind(series: pd.Series, path: Path) -> None:
    local = series.index.tz_convert("Europe/Berlin").strftime("%Y-%m-%d %H:%M")
    values = ["NaN" if np.isnan(v) else f"{v:.2f}" for v in series]
    path.write_text("Timestamp,Wind speed (m/s)\n" + "".join(f"{t},{v}\n" for t, v in zip(local, values)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pair = synthetic_pair(days=31, seed=7, start="2026-09-30 22:00")
    target = pair["target"].copy()
    start, length = OUTAGE
    target[(target.index >= start) & (target.index < start + length)] = np.nan
    write_wind(target, OUT / "demo_target.csv")
    write_wind(pair["ref"], OUT / "demo_reference.csv")
    curve = generic_power_curve()
    (OUT / "demo_power_curve.csv").write_text(
        "wind_speed_ms,power_kw\n" + "".join(f"{v:g},{p:.1f}\n" for v, p in zip(curve.wind_ms, curve.power_kw))
    )
    print(f"wrote demo files to {OUT}")


if __name__ == "__main__":
    main()
