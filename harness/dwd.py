"""Real station pairs for the harness: 10-minute mean wind (FF_10, about 10 m above ground, not hub height) of
nearby DWD stations in flat northern Germany, cut to the same window and written in the challenge format to
data/dwd/<pair>/ with the generic power curve. Source: Deutscher Wetterdienst, opendata.dwd.de (CC BY 4.0).
Run: make dwd

`refs` (make dwd-refs) writes the reference stations around the challenge farms with wind speed and direction over
the challenge period to data/dwd_refs/, checked in, because the app runs offline and the DWD server allows no browser
access (SPEC.md, "Externe Daten")."""

import io
import math
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

from harness.demo import write_power_curve, write_wind
from harness.synthetic import generic_power_curve
from windgap.core.schema import STEP

URL = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/wind/recent/"
OUT = Path(__file__).resolve().parent.parent / "data" / "dwd"
REFS = OUT.with_name("dwd_refs")
START, DAYS = pd.Timestamp("2026-09-15", tz="Europe/Berlin"), 30
# (folder, target station id, reference station id), 29–41 km apart
PAIRS = [
    ("bremen-brake", "00691", "00642"),
    ("hamburg-ruthenstrom", "01975", "06108"),
    ("buesum-stpeter", "00788", "04393"),
    ("schleswig-flensburg", "04466", "01379"),
    ("doerpen-friesoythe", "06159", "01503"),
]
# Stations around the challenge farms (knowledge/turbinen.md), complete during the hidden test 1–3 Sep 2026
REF_STATIONS = {"00701": "Bremerhaven", "00891": "Cuxhaven", "00691": "Bremen", "06091": "Spiekeroog",
                "01975": "Hamburg", "04745": "Soltau", "02014": "Hannover", "01993": "Hameln"}
REF_START, REF_DAYS = pd.Timestamp("2026-06-30", tz="UTC"), 93


def stations() -> pd.DataFrame:
    text = urllib.request.urlopen(URL + "zehn_min_ff_Beschreibung_Stationen.txt").read().decode("latin-1")
    # columns: id, from, to, height, lat, lon, name (several words), state, licence
    rows = [(*p[:6], " ".join(p[6:-2])) for p in map(str.split, text.splitlines()[2:]) if p]
    df = pd.DataFrame(rows, columns=["id", "from", "to", "height", "lat", "lon", "name"]).set_index("id")
    return df.astype({"lat": float, "lon": float})


def observations(station: str, start: pd.Timestamp, days: int) -> pd.DataFrame:
    """FF_10 (m/s) and DD_10 (degrees) on the UTC 10-minute grid of the window (DWD stamps 10-minute data in UTC);
    -999 becomes NaN."""
    raw = urllib.request.urlopen(f"{URL}10minutenwerte_wind_{station}_akt.zip").read()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.startswith("produkt"))
        df = pd.read_csv(z.open(name), sep=";", skipinitialspace=True, na_values=[-999])
    index = pd.to_datetime(df["MESS_DATUM"].astype(str), format="%Y%m%d%H%M").dt.tz_localize("UTC")
    start = start.tz_convert("UTC")
    grid = pd.date_range(start, start + pd.Timedelta(days=days), freq=STEP, inclusive="left")
    return df[["FF_10", "DD_10"]].set_axis(index).reindex(grid)


def wind(station: str) -> pd.Series:
    return observations(station, START, DAYS)["FF_10"]


def refs() -> None:
    shutil.rmtree(REFS, ignore_errors=True)
    REFS.mkdir(parents=True)
    for station, name in REF_STATIONS.items():
        obs = observations(station, REF_START, REF_DAYS)
        path = REFS / f"DWD_{name}.csv"
        with path.open("w") as f:
            f.write(f"# Deutscher Wetterdienst (DWD) station {station} {name}: 10-minute mean wind FF_10 (m/s) and "
                    f"direction DD_10 (degrees) at about 10 m height. Licence CC BY 4.0.\n")
            obs.to_csv(f, header=["wind_speed", "wind_direction"], index_label="Timestamp (UTC)",
                       date_format="%Y-%m-%d %H:%M", na_rep="", float_format="%g", lineterminator="\n")
        print(f"{path.name}: missing {int(obs['FF_10'].isna().sum())} of {len(obs)} wind values")


def distance_km(a: pd.Series, b: pd.Series) -> float:
    lat = math.radians((a["lat"] + b["lat"]) / 2)
    return 111.2 * math.hypot(a["lat"] - b["lat"], (a["lon"] - b["lon"]) * math.cos(lat))


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    meta = stations()
    for folder, target_id, ref_id in PAIRS:
        target, ref = wind(target_id), wind(ref_id)
        out = OUT / folder
        out.mkdir(parents=True)
        write_wind(target, out / "target.csv")
        write_wind(ref, out / "reference.csv")
        write_power_curve(generic_power_curve(), out / "power_curve.csv")
        t, r = meta.loc[target_id], meta.loc[ref_id]
        print(f"{folder}: {t['name']} ← {r['name']}, {distance_km(t, r):.0f} km, r = {target.corr(ref):.2f}, "
              f"mean {target.mean():.2f} / {ref.mean():.2f} m/s, missing {target.isna().sum()} / {ref.isna().sum()}")


if __name__ == "__main__":
    refs() if sys.argv[1:] == ["refs"] else main()
