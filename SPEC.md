# Wind-Outage Tool – Spezifikation

Oct 23, 2026 · @Max Dillinger

## Zweck dieses Dokuments

Dieses Dokument ist die einzige Quelle der Wahrheit für Menschen und KI-Agenten. Jeder Agent bekommt den Abschnitt „Leitprinzipien“, „Architekturentscheidungen“, „Schnittstellen“ und den Abschnitt seines Teilprodukts als Kontext.

- Änderungen an Schnittstellen nur nach Absprache im Team, dann zuerst hier, dann im Code.
- Mit **\[offen\]** markierte Punkte klären wir am Morgen des 24.10. mit den Organisatoren.

## Ziele und Leitprinzipien

Ziel ist, in allen vier Kriterien vorne zu liegen: Modellgenauigkeit 40 %, User Experience 30 %, Lösungskonzept 20 %, Präsentation 10 %. Bei Konflikten gilt laut Aufgabe: Erklärbarkeit vor Genauigkeit.

1. **Erklärbar in zwei Sätzen.** Jedes Modell, das wir in der GUI anbieten, muss sich mit einer Formel und zwei Sätzen erklären lassen. Schwer erklärbare Modelle (z. B. Gradient Boosting) dienen nur als Benchmark: „Was lassen wir liegen?“
2. **Energie ist das Endprodukt.** Bewertet werden Wind, Leistung und Energiesumme. Fehler im steilen Teil der Leistungskurve (ca. 4–12 m/s) zählen viel mehr als Fehler bei 2 oder 20 m/s.
3. **Bias ist der Hauptfeind der Energiesumme.** Zufällige Fehler mitteln sich über den Ausfall heraus, ein systematischer Versatz nicht.
4. **Unsicherheit wird immer mitgeliefert.** Jede Vorhersage hat ein Band, jede kWh-Zahl eine Spanne (P10/P50/P90). Das ist für Versicherungen der eigentliche Mehrwert.
5. **Schnelle Iteration.** Ein kompletter Harness-Lauf über alle Modelle dauert unter 30 Sekunden.
6. **Bewertung ist Konfiguration.** Metriken und Gewichtung stehen in einer Datei, nicht im Code, weil wir das Testformat noch nicht kennen.
7. **Kontrakt zuerst.** Schnittstellen stehen fest, bevor implementiert wird. Jeder kann gegen Mocks arbeiten.

## Architekturentscheidungen

Ausgeliefert wird eine statische Web-App ohne Server. Der Rechenkern ist das Python-Paket `windgap`, das im Browser über Pyodide (WebAssembly) läuft. Ein TypeScript-Zwilling der Produktmodelle ist das Sicherheitsnetz. Die GUI wechselt per Schalter zwischen beiden.

| # | Entscheidung | Begründung |
| --- | --- | --- |
| ADR-1 | Python 3.14 für Modelle, Energie und Harness (numpy, pandas, in der Harness dazu pyyaml; scipy, scikit-learn oder statsmodels nur für Benchmarks in der Harness, nach Rückfrage; Paketverwaltung mit `uv`). Im Engine-Pfad nur Pakete, die Pyodide bereitstellt; keine Dateizugriffe, keine Threads. Pyodide `314.0.7` (Python 3.14.2, numpy 2.4.6, pandas 3.0.2), exakt festgelegt in `web/package.json`. Das native venv nutzt dieselben numpy- und pandas-Versionen (`pyproject.toml`), damit Harness und Browser identisch rechnen; bei einem Pyodide-Update beide Stellen gemeinsam ändern. Abhängigkeiten von `windgap` heute: nur numpy und pandas; jedes weitere Paket verlängert den Kaltstart | Mathe-Studierende arbeiten direkt darin; derselbe Code läuft in Harness und Browser |
| ADR-2 | GUI mit React, Vite, TypeScript, shadcn/ui, Tailwind; Charts mit ECharts | UX zählt 30 %; ECharts kann Zoom, Brush und Unsicherheitsbänder |
| ADR-3 | Kein Server, keine Datenbank, kein Login. Alle Berechnungen im Browser | Aufgabe fordert lokalen Betrieb im Browser; Daten verlassen den Rechner nicht |
| ADR-4 | Zwei austauschbare Engines hinter dem Interface `Engine` (S5): `py` = Pyodide im Web Worker, führt `windgap` aus; `ts` = TypeScript-Port der Produktmodelle. Auswahl per URL-Parameter `?engine=py` bzw. `?engine=ts` und Schalter in der GUI. Scheitert `py` beim Laden, wechselt die App automatisch auf `ts` | Wechsel in Sekunden; Demo hängt nie an Pyodide |
| ADR-5 | CSV-Import, Raster und Ausfallerkennung laufen im Frontend (TS). Engines erhalten bereinigte Arrays. Die Harness hat einen eigenen Python-Import; beide werden gegen dieselben Fixture-Dateien getestet | GUI zeigt Daten und Ausfall sofort, ohne auf Pyodide zu warten |
| ADR-6 | Gleichheit der Engines per Golden Tests: Python erzeugt Fixtures (Eingabe und erwartete Ausgabe als JSON) in `fixtures/`, vitest prüft die TS-Engine dagegen (Toleranz 1e-6) | Zwei Implementierungen laufen sonst unbemerkt auseinander |
| ADR-7 | UI-State mit MobX State Tree | Vorhandene Erfahrung, wenig globaler Zustand |
| ADR-8 | Intern gilt: Zeit in UTC (Epoch-Millisekunden an der Engine-Grenze), festes 10-Minuten-Raster, fehlende Werte als `null`/NaN. Umrechnung von und nach Europe/Berlin nur beim Einlesen und Anzeigen | Sommerzeit-Wechsel (zuletzt 25.10.2026, davor 29.03.2026) erzeugt doppelte oder fehlende Stunden in lokaler Zeit |
| ADR-9 | Alle Python-Modelle implementieren dasselbe Interface (S3) und melden sich in einer Registry an. Harness und `py`-Engine nutzen dieselbe Registry; die `ts`-Engine verwendet dieselben Modellnamen | Ein neues Modell erscheint ohne Zusatzarbeit im Leaderboard und in der GUI |
| ADR-10 | Referenzdaten sind immer eine Liste mit 1..n Reihen, nicht eine einzelne Reihe | Mehrere Referenzen (Bonus 3) und Zusatzparameter (Bonus 2) ohne Umbau |
| ADR-11 | Eine Vorhersage ist eine Verteilung je Zeitschritt (Mittelwert, Standardabweichung, Quantile), kein einzelner Wert | Unsicherheit ist gefordert und verbessert die Energieschätzung (siehe Modellarchitektur) |
| ADR-12 | Harness-Läufe sind reproduzierbar: fester Zufallsseed, Konfiguration und Git-Commit werden mit jedem Ergebnis gespeichert | Vergleichbarkeit, wenn mehrere Leute und Agenten parallel Modelle bauen |
| ADR-13 | Zwei Build-Artefakte: `windgap.html` (eine Datei, nur `ts`-Engine, läuft per Doppelklick offline) und `windgap-web/` (Ordner mit beiden Engines und lokal mitgeliefertem Pyodide, kein CDN) | Pyodide und Web Worker laden in Chrome nicht über `file://`; die Einzeldatei ist das Sicherheitsnetz (siehe Auslieferung) |

## Teilprodukte

Sechs Teilprodukte, jedes mit genau einer verantwortlichen Person. Die beiden Mathe-Studierenden besitzen den Teil, der 40 % der Punkte bringt, und arbeiten nur in Python gegen festgelegte Interfaces.

&#91;embedded content: Teilprodukte und Datenfluss · 6 Teile\]

Durchgezogene Pfeile zeigen den Datenfluss eines Laufs. Die Harness (gestrichelt) nutzt Daten-, Modell- und Energiemodul nativ in Python. Die GUI erreicht denselben Kern über die Pyodide-Engine oder rechnet mit dem TypeScript-Zwilling.

| Teilprodukt | Inhalt | Verantwortlich | Nutzt |
| --- | --- | --- | --- |
| T1 Daten und Kontrakte | CSV-Import (TS für die GUI, Python für die Harness), Zeitzonen, Raster, Ausfallerkennung, Leistungskurve, Typen des Engine-Kontrakts, Fixture-Format | PM | – |
| T2 Modelle | Python-Modellbibliothek von Baseline bis Benchmark, Erklärtexte, Fixtures je Modell | Mathe A | T1 |
| T3 Harness | Szenario-Generator, Metriken, Leaderboard, Diagnose-Plots, synthetische Testdaten (nur nativ, nicht im Browser) | Mathe B | T1, T2, T4 |
| T4 Energie | Leistungskurve anwenden, Erwartungswert der Leistung über die Vorhersageverteilung, kWh mit P10/P50/P90 | Mathe B | T1 |
| T5 Engines | `py`: Pyodide-Worker, lädt `windgap` als Wheel und ruft `handle` auf. `ts`: Port der gewählten Modelle und der Energie. Golden Tests | PM | T2, T4 |
| T6 GUI | Fünf-Schritte-Oberfläche, Visualisierungen, Methodenerklärung, Bericht, Engine-Schalter | PM | T5 |

Die Präsentation und der Versicherungsbericht (Bonus 1) entstehen am Nachmittag gemeinsam. Als Übergang zwischen den Studierenden gilt: Mathe A liefert Modelle, Mathe B misst sie. Das schafft einen schnellen Kreislauf ohne gegenseitiges Warten.

## Schnittstellen

Drei Kontrakte entkoppeln das Team: das interne Datenformat (T1), das Modell-Interface (T2) und der Engine-Kontrakt (T5). Alles andere ist Implementierungsdetail.

### S1 Eingabedateien

Beide Importe (TS in `web/src/data/` für die GUI, Python in `windgap/core/io.py` für die Harness) folgen denselben Regeln und bestehen dieselben Fälle in `fixtures/csv/`. Im Zweifel bricht der Import mit einer Meldung samt Zeilennummer ab, statt zu raten.

- **Tabelle:** Trennzeichen Tab, `;`, `,` oder `|`: gewählt wird das, bei dem die meisten der ersten 50 nichtleeren Zeilen so viele Spalten haben wie die letzte davon (bei Gleichstand in dieser Reihenfolge). Die erste Zeile mit dieser Spaltenzahl, die eine Zahl oder einen Zeitstempel enthält, ist die erste Datenzeile; alles davor ist Vorspann. Kopfzeile ist die erste Vorspann-Zeile mit voller Spaltenzahl (eine Einheitenzeile darunter wird übersprungen). Jede Datenzeile hat dieselbe Spaltenzahl, sonst Fehler. Zellen werden getrimmt, umschließende Anführungszeichen entfernt.
- **Zahlen:** Dezimalpunkt oder -komma; Tausendertrenner nur in eindeutiger Form (`1.234,5`, `1,234.5`). Fehlwerte: leer, `NaN`, `NA`, `n/a`, `#N/A`, `#NV`, `null`, `none`, `-`.
- **Winddaten:** CSV mit Zeitstempel (Europe/Berlin) und einer oder mehreren Spalten mit 10-Minuten-Mittelwerten der Windgeschwindigkeit (m/s).
  - *Zeitspalte:* die erste Spalte, deren Zelle in der ersten Datenzeile ein Zeitstempel ist; Datum und Uhrzeit dürfen in zwei benachbarten Spalten stehen (`01.10.2026;00:10`).
  - *Datumsformate:* Jahr zuerst ist immer Jahr-Monat-Tag (`2026-10-01`, `2026/10/01`, `2026.10.01`), mit `T` oder Leerzeichen vor der Uhrzeit, Sekunden und Sekundenbruchteile erlaubt. `01.10.2026` ist immer Tag.Monat. `01/10/2026` und `01-10-2026` entscheidet die Datei: Ist in einer Zeile der erste Teil > 12, steht der Tag vorn, ist der zweite Teil > 12, der Monat; entscheidet keine Zeile oder widersprechen sich Zeilen, ist das ein Fehler. Ungültige Daten (31.02.) sind kein Zeitstempel.
  - *Zeitzone:* Zeitstempel mit Offset (`Z`, `+02:00`) gelten wie angegeben. Ohne Offset gilt Europe/Berlin, außer der Kopf der Zeitspalte nennt `UTC` oder `GMT` ohne folgenden Offset (z. B. `Timestamp (UTC)`), dann UTC. Doppelte Stunde bei Zeitumstellung: Reihenfolge entscheidet (erste = Sommerzeit); Zeiten in der übersprungenen Frühlingsstunde sind ein Fehler.
  - *Raster:* Zeilen stehen chronologisch, sonst Fehler. Ein doppelter Zeitstempel (außer der doppelten Herbststunde) ist ein Fehler, auch bei gleichem Wert, weil er auf einen kaputten Export hinweist. Jeder Zeitstempel liegt auf dem 10-Minuten-Raster (`:00`, `:10` … mit Sekunde 0), und der Median der Abstände aufeinanderfolgender Zeilen ist 10 min; sonst Fehler „must be 10-minute values“ (z. B. bei `00:05` oder Stundenwerten). Fehlende Zeilen werden `null`.
  - *Windspalten:* Spalten, deren Kopf nach etwas anderem aussieht (Richtung, Temperatur, Druck, Feuchte, Niederschlag, Leistung, Drehzahl, Status, Qualität, Böe, Maximum, Standardabweichung; Muster in `wind.ts`/`io.py`), werden ignoriert und im Bericht genannt. Nennt ein übriger Kopf Wind (`wind`, `speed`, `geschw`, `m/s`, `ws`), sind genau diese Spalten Wind; sonst jede übrige Spalte mit mindestens einer Zahl (z. B. `WTG01;WTG02` oder `time,target,reference`). Jede Windspalte wird eine eigene Reihe. ID: bei einer Windspalte der Dateiname, sonst der Spaltenkopf (ohne Kopf `<Datei> column <n>`).
  - *Windrichtung:* Hat die Datei genau eine Windspalte und genau eine Spalte, deren Kopf `dir` oder `richt` enthält und nicht `std` oder `sigma`, ist diese die Windrichtung der Reihe in Grad (`direction`, gleiches Raster wie der Wind, nicht im Bericht der ignorierten Spalten). Werte außerhalb 0–360 gelten als fehlend, anderer Text ist ein Fehler. Sonst bleibt jede Richtungsspalte ignoriert.
  - *Werte:* Negative Werte (z. B. `-999`) gelten als fehlend und werden gezählt; anderer Text in einer Windspalte ist ein Fehler. Referenzlücken im Ausfall bis 6 Schritte (1 h) überbrückt der Import linear, längere sind ein Fehler.
- **Leistungskurve:** CSV ohne Zeitstempel mit Windgeschwindigkeit (m/s) und Leistung je Turbine. Windspalte: erster Kopf mit `wind`, `speed`, `geschw`, `m/s` oder beginnend mit `v`/`ws`, sonst Spalte 1. Leistungsspalten: Köpfe mit `power`, `leistung`, `kw`, `mw` oder beginnend mit `P`, außer Leistungs- und Schubbeiwert (`Cp`, `Ct`, `coefficient`, `thrust`, `Schub`); keine solche: die erste andere Spalte. **Mehrere Leistungsspalten** (z. B. je Luftdichte oder Turbinentyp) sind ein Fehler, der die Spalten nennt: Wir wählen nicht still eine Kurve. Nennt der Kopf der Leistungsspalte MW und nicht kW, wird mit 1000 multipliziert. Windgeschwindigkeiten streng steigend, jede Zeile vollständig, mindestens zwei Punkte. Lineare Interpolation, 0 kW unterhalb des ersten und oberhalb des letzten Punkts (Abschaltgeschwindigkeit). **Anzahl der Turbinen:** **Entscheidung (24.10.): Jedes Ziel ist genau eine Turbine**; die GUI rechnet mit 1 und fragt nicht (`ASK_TURBINES = false` in `store.ts`, auch die Demo). Mit `ASK_TURBINES = true` ist die Anzahl wieder eine ausdrückliche Entscheidung, weil sie jede kWh-Zahl multipliziert: Nach einer Leistungskurve aus Dateien ist sie unbestätigt und hervorgehoben (mit Nennleistung des Parks), und die Engine rechnet erst nach der Bestätigung. Nennt der Dateiname oder eine der ersten fünf Zeilen eine Anzahl (`4x3MW`, `12_turbines`, `Turbines: 4`; `turbineCount` in `powerCurve.ts`), ist sie vorausgefüllt, muss aber ebenfalls bestätigt werden. Die CLI verlangt `--n-turbines`. **Eingebaute Kurven** (vor den Daten vermutete Typen, nicht die der Challenge) liegen in `data/power_curves/` (Vestas V47, Enercon E-40/6.44, je Turbine, Quelle wind-turbine-models.com im Vorspann der Datei; Nordex N149/4.0-4.5: die 5-MW-Tabelle bei 1,100 kg/m³ aus `knowledge/nordex_5000kw_dichte.csv`, auf 4.500 kW gekappt) und sind in der GUI per Knopf wählbar (`KNOWN_CURVES` in `web/src/data/turbines.ts`), in der CLI über `--power-curve`. Eine Leistungskurve aus Dateien steht als erster Knopf daneben und ist nach dem Hochladen gewählt; entfernt man ihre Datei, bleibt eine gewählte eingebaute Kurve. Die Quelle der E-40/6.44 endet bei 13 m/s; der letzte Wert (613,2 kW) gilt ausdrücklich bis zur angegebenen Abschaltgeschwindigkeit 28 m/s, sonst rechnete die Kurve über 13 m/s mit 0 kW. Die Kurven der Challenge (xlsx, je Zielturbine, 4.500 kW) beschreibt „Challenge-Daten“.
- **Excel (`.xlsx`):** Jedes Blatt wird wie eine CSV gelesen (`windgap/core/xlsx.py`, Zwilling `web/src/data/xlsx.ts`, Fall `fixtures/csv/xlsx_*.xlsx`): Datumszellen als Wanduhrzeit `YYYY-MM-DD HH:MM[:SS]` ohne Zeitzone (es gilt die Zeitzonenregel oben), Zahlen in kürzester Form, leere Zellen fehlen, Zellen durch Tab getrennt. Name ist der Dateiname, bei mehreren Blättern `<Datei>_<Blatt>`. `make csv` schreibt dieselben Tabellen als CSV-Dateien.
- **Mehrere Dateien auf einmal** (`assignFiles` in `web/src/data/assign.ts`): Eine Datei, deren erste Datenzeile keinen Zeitstempel enthält, ist die Leistungskurve (mehr als eine: Fehler). Jede Windspalte jeder anderen Datei ist eine Reihe; doppelte IDs sind ein Fehler. Zielkandidaten sind Reihen mit einem Ausfall nach S2 gegenüber allen anderen Reihen, sortiert nach Länge des längsten Ausfalls. **Ziele** sind alle Kandidaten, deren längster Ausfall mehr als halb so lang ist wie der des ersten (eine einzelne Turbinenspalte mit kurzen Lücken soll den echten Ausfall nicht verdecken); die GUI zeigt die Wahl, und jede Reihe lässt sich zum Ziel machen oder zurück zur Referenz. Ein Ziel ist nie Referenz, auch nicht für ein anderes Ziel (Challenge: T1–T3 sind Ziele, H und O Referenzen). Fehler einzelner Dateien stehen in `errors`, die übrigen Dateien werden trotzdem zugeordnet. **Dateien sammeln sich:** Jede Ablage fügt hinzu (gleicher Dateiname ersetzt), jede Datei lässt sich wieder entfernen, und die Zuordnung wird über alle Dateien neu berechnet; von Hand gewählte Ziele bleiben, solange es ihre Reihe gibt, sonst gilt die Wahl der Zuordnung (erst die Zieldateien, dann die Referenzen ablegen ergibt dieselben Ziele wie alles auf einmal).

### S2 Internes Datenformat (T1)

```python
@dataclass
class Site:
    site_id: str
    wind: pd.Series          # UTC-DatetimeIndex, freq="10min", NaN = fehlt
    extra: pd.DataFrame | None = None   # Spalte direction: Windrichtung in Grad (S1)
    lat: float | None = None
    lon: float | None = None

@dataclass
class Dataset:
    target: Site
    references: list[Site]   # 1..n
    power_curve: PowerCurve
    outages: list[Outage]    # automatisch erkannt, manuell änderbar

@dataclass
class Outage:
    start: pd.Timestamp      # UTC, inklusiv
    end: pd.Timestamp        # UTC, exklusiv
```

Ausfallerkennung (`web/src/data/outage.ts`, Python-Zwilling `windgap/core/outage.py`, beide gegen `fixtures/outage/cases.json`): zusammenhängende NaN-Blöcke im Ziel von mindestens 3 Zeitschritten (30 min), in denen eine Referenz Werte hat. Gesucht wird auf dem gemeinsamen Zeitraum von Ziel und Referenzen: Endet die Zieldatei früher oder beginnt sie später als eine Referenz, ist der fehlende Rand ebenfalls ein Ausfall. Kürzere Lücken werden als Messlücken markiert, nicht als Ausfall. Sortiert wird nach Länge, längster zuerst, Ausfälle vor dem ersten Zielwert zuletzt (davor gibt es nichts zu lernen); die GUI wählt den ersten vor. Dieselbe Fixture-Datei prüft das Überbrücken kurzer Referenzlücken im Ausfall (S1, `toRequest` bzw. `fill_during_outage`).

### S3 Modell-Interface (T2)

```python
class WindModel(Protocol):
    name: str                # eindeutig, z. B. "variance_ratio"
    label: str               # für Menschen, z. B. "Variance ratio (MCP)"
    tagline: str             # eine Zeile, was das Modell tut
    errors: Errors           # setzt fit: σ und Fehlergedächtnis, siehe unten
    def fit(self, target: pd.Series, refs: pd.DataFrame,
            extra: pd.DataFrame | None = None) -> "WindModel": ...
    def predict(self, refs: pd.DataFrame,
                extra: pd.DataFrame | None = None) -> pd.DataFrame: ...
        # Spalten: mean, std, q10, q50, q90; Index = refs.index
    def explain(self) -> Explanation: ...

@dataclass
class Explanation:
    summary: str             # 2–3 Sätze, Markdown
    formula: str             # LaTeX, z. B. "v_t = a + b \\cdot v_r"
    params: dict[str, float] # gelernte Koeffizienten
    diagnostics: dict        # z. B. Korrelation r, Lag in Minuten

@register("variance_ratio")   # Registry in windgap/models/registry.py
class VarianceRatio: ...
```

Regeln: `fit` sieht nur Daten vor dem Ausfall (außer im Modus `train_on="both"`). `predict` darf nur `refs` und `extra` verwenden, nie das Ziel, und liefert eine Zeile je Zeile von `refs`. Vorhersagen sind nach unten auf 0 begrenzt.

**`extra` = Windrichtung der Referenzen:** ein DataFrame mit einer Spalte je Referenz (gleiche Reihenfolge und gleicher Index wie `refs`), Windrichtung in Grad an dieser Referenz, NaN = unbekannt; `None`, wenn keine Referenz eine Richtung hat. Engine (aus `references[i].direction`), Backtest, Harness und `predict_window` reichen es mit denselben Zeilen durch wie `refs`. Ein Modell ohne Richtungsbezug ignoriert es.

**Kontext um das Fenster (`windgap.backtest.predict_window`):** Engine und Backtest übergeben `predict` das Fenster samt bis zu `CONTEXT_STEPS` = 36 Schritten (6 h) lückenloser Referenz davor und danach und behalten nur die Zeilen des Fensters. So nutzt ein Modell mit Zeitversatz τ am Anfang des Ausfalls die gemessene Referenz vor dem Ausfall (bei τ < 0 am Ende die danach). Der Kontext endet an der ersten Referenzlücke oder am Rand der Daten; erst jenseits davon nimmt das Modell den Randwert.

**Unsicherheit (`windgap.models.base.calibrate`, für jedes Modell dieselbe Routine):** Die gemessenen Paare des Trainingszeitraums werden in 5 zusammenhängende Blöcke gleicher Anzahl geteilt (nicht gleicher Dauer: Beginnt die Zieldatei später als die Referenz, blieben sonst Blöcke leer und σ wäre NaN); jeder Block wird von einer Anpassung auf den anderen vier vorhergesagt (Leave-one-block-out). Aus diesen Fehlern auf ungesehenen Daten entsteht `Errors`:

- `sigma_0`, `sigma_slope`: σ_t = `sigma_0` + `sigma_slope` · v̂_t. Der mittlere Betrag des Fehlers wird als Gerade in der Vorhersage v̂ angepasst (kleinste Quadrate, beide Koeffizienten ≥ 0), dann so skaliert, dass 80 % der Fehler in ±Z₉₀ · σ_t liegen. Der Fehler wächst mit dem Wind; ein konstantes σ wäre bei Flaute zu breit (E[P(v)] zu hoch) und im steilen Teil der Kurve zu schmal.
- `acf`: Autokorrelation der standardisierten Fehler err_t / σ_t um 0 (nicht um ihren Mittelwert, damit ein anhaltender Versatz als Gedächtnis zählt), Lag 0, 1, … bis vor den ersten Lag mit acf ≤ 0, höchstens 3 Tage. `memory_h` = (1 + 2 Σ acf(k)) · 10 min ist die integrale Zeitskala, in der GUI „error memory“.

Lag-Suche, Koeffizienten und `Errors` entstehen nur aus den Trainingsdaten (in der Harness: vor t₀).

### S4 Energie (T4)

```python
def expected_power(pred: pd.DataFrame, curve: PowerCurve) -> pd.DataFrame
    # Spalten: p_mean_kw, p_std_kw
def energy_loss(power: pd.DataFrame, outage: Outage, acf: np.ndarray) -> EnergyResult
    # kwh_p50, kwh_p10, kwh_p90, cumulative (Zeitreihe); acf = model.errors.acf
```

Energie je Zeitschritt = Leistung (kW) × 1/6 h.

- `p_mean_kw` ist E[P(v)], `p_std_kw` die Standardabweichung SD[P(v)], beide mit v ~ N(mean, std²), Gauß-Hermite mit 20 Stützstellen.
- **Konvention:** P10 = 10-%-Quantil (niedriger Wert), P90 = 90-%-Quantil (hoher Wert), wie `q10`/`q90`. In Windgutachten heißt der *konservative* Wert oft „P90“ (Überschreitungswahrscheinlichkeit); im Bericht deshalb immer „10 % / 90 % Quantil“ dazuschreiben.
- **Energieband:** `kwh_p50` = Σ E[P]·h; `kwh_p10`/`kwh_p90` = P50 ∓ Z₉₀ · SD(Summe), P10 nach unten auf 0 begrenzt. Var(Summe) = Σᵢ Σⱼ sᵢ sⱼ acf(|i − j|) mit sᵢ = `p_std_kw` · h und acf aus `model.errors` (0 jenseits ihres Endes). Für die Versicherung in einem Satz: *„Die Spanne nimmt an, dass die Fehler des Modells so lange anhalten wie im Backtest auf euren eigenen Daten: Bei kurzen Ausfällen addieren sie sich fast voll, bei langen gleicht sich ein Teil aus.“*
- Warum so (Harness, 1793 Szenarien, LR): Die Summe der Quantile je Schritt (voll korreliert) war für lange Ausfälle zu breit und nach Kalibrierung von σ systematisch zu breit; unabhängige Fehler wären für kurze zu schmal. AR(1) mit ρ aus Lag 1 unterschätzt das Gedächtnis (echte Fehler fallen erst schnell, dann langsam ab: acf ≈ 0,8 bei 10 min, 0,2–0,4 bei 6 h auf DWD), deshalb die gemessene acf. Ergebnis `energy_coverage_80` je Länge 1 h … 120 h: 0,91 / 0,91 / 0,88 / 0,85 / 0,77 / 0,80 / 0,78. Kurze Ausfälle bleiben überdeckt, weil die Energie je Schritt beschränkt und schief verteilt ist (Flaute, Nennleistung) und P50 ± Z₉₀·SD dann mehr als 80 % abdeckt; ein Band aus P(q10)/P(q90) statt SD deckte nur 0,63–0,73 ab.
- Ob das Band kalibriert ist, misst `energy_coverage_80` (Anteil der Szenarien, deren echte Energie in \[`kwh_p10`, `kwh_p90`\] liegt; Ziel ca. 0,8), wie scharf es ist, `energy_band_pct`. Beide rechnen über `energy_loss`, messen also immer das Band, das die GUI zeigt.
- Metriken gibt es nur einmal: `windgap/core/metrics.py` (`evaluate` je Szenario, `summarize` über Szenarien). Engine-Validierung und Harness rufen dieselben Funktionen.

### S5 Engine-Kontrakt (T5)

Die GUI kennt nur dieses Interface. Beide Engines implementieren es, ein Wechsel ist ein Konfigurationswert.

```typescript
interface Engine {
  id: "py" | "ts";
  init(onProgress?: (msg: string, pct: number) => void): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  analyze(req: AnalyzeRequest): Promise<AnalyzeResponse>;
}

type Grid = { t0: number; stepS: 600; values: (number | null)[] }; // t0 = UTC epoch ms

interface ModelInfo { name: string; label: string; tagline: string; recommended: boolean }

interface AnalyzeRequest {
  target: Grid;
  references: { id: string; grid: Grid; direction?: Grid }[]; // grid im Ausfall lückenlos (Import füllt), sonst Fehler; direction in Grad, Lücken erlaubt
  powerCurve: { windMs: number[]; powerKw: number[]; nTurbines: number };
  outage: { startMs: number; endMs: number };      // endMs exklusiv
  model: string;                                   // Registry-Name, z. B. "variance_ratio"
  params?: Record<string, number | string>;
}

interface AnalyzeResponse {
  prediction: { t0: number; stepS: 600; mean: number[]; q10: number[]; q90: number[] };
  validation: Record<string, number>;              // Schlüssel wie in der Harness-Metriktabelle, dazu n_folds
  explanation: { summary: string; formula: string;
                 params: Record<string, number>; diagnostics: Record<string, number> };
  energy: { kwhP10: number; kwhP50: number; kwhP90: number; cumulativeKwh: number[] };
  scatter: { ref: number[]; target: number[]; fitLine: [number, number][] }; // max. 2000 Punkte
  engine: { id: "py" | "ts"; version: string; ms: number };
}
```

**Python-Seite:** eine reine Funktion `windgap.engine.handle(request_json: str) -> str` mit genau diesem JSON (Feldnamen in camelCase an der Grenze). Der Worker lädt Pyodide, installiert `windgap` als Wheel und ruft `handle` auf. Nativ ruft dieselbe Funktion die Fixtures-Erzeugung auf.

**Aus der Antwort abgeleitet, unabhängig von der Engine:** CSV-Export der Vorhersage und Berichtstext (Bonus 1) baut die GUI selbst.

**Regeln an der Grenze:** Hat das Ziel vor dem Ausfall weniger als `MIN_TRAIN_STEPS` = 144 Werte (ein Tag), bricht `analyze` mit einer Meldung ab, statt NaN zu liefern. JSON kennt kein NaN. Fehlende Messwerte sind `null`; eine nicht berechenbare Kennzahl fehlt in `validation`/`params`/`diagnostics`, statt NaN oder 0 zu sein. `validation` ist der Backtest von `windgap.backtest.backtest`: bis zu 5 simulierte Ausfälle in Länge des echten Ausfalls, rückwärts vom Trainingsende, zusammengefasst mit `metrics.summarize` (Mittelwert je Metrik, `energy_dev_pct` als Betrag, `energy_wape_pct`), dazu `n_folds`. `scatter` zeigt die Trainingspaare so, wie das Modell sie sieht: Ziel(t) gegen die gewählte Referenz (`diagnostics.reference_index`, ohne Wahl die einzige)(t − τ) mit τ = `diagnostics.lag_min` (0 ohne Versatz). `scatter.fitLine` ist die In-Sample-Vorhersage, gemittelt je 1-m/s-Klasse dieser verschobenen Referenz; für LR und VR also genau die Gerade a + b · v (unten auf 0 begrenzt), für Tageszeitmodelle weiterhin sinnvoll. Ausdünnung auf 2000 Punkte deterministisch über Index `floor(i · n / k)`.

**Modelle in beiden Engines:** `identity` (Ziel = Referenz, Baseline), `linear_regression` (Standard der GUI) und `variance_ratio`, alle mit kalibriertem σ (S3). `ModelInfo` kommt aus der Registry (`registry.info()`): `label` und `tagline` je Modellklasse, `recommended` für genau das Modell in `registry.RECOMMENDED` (bestes Harness-Ergebnis, Standard der GUI). `fixtures/models.json` hält die Liste fest; die `ts`-Engine muss sie gleich liefern.

## Modellarchitektur

Wir bauen eine Modellleiter aus Measure-Correlate-Predict-Verfahren (MCP), dem Standard der Windbranche für genau dieses Problem, und steigen nur so weit, wie die Harness echten Gewinn zeigt. Das ist zugleich unser Erklärbarkeits-Argument in der Präsentation: „Wir nutzen, was Windgutachter nutzen, und messen jeden Zusatz.“

| Stufe | Modell | Idee | Rolle |
| --- | --- | --- | --- |
| M0 | Identität | Zielwind = Referenzwind | Untergrenze, Plausibilitätstest |
| M1 | Lineare Regression (LR) | v\_t = a + b · v\_r, kleinste Quadrate | Optimal für Wind-RMSE, staucht aber die Streuung |
| M2 | Variance Ratio (VR) | b = σ\_t / σ\_r, a = μ\_t − b · μ\_r | Erhält Mittelwert und Streuung, gut für Energiesumme |
| M3 | M1/M2 + Zeitversatz | Referenz um den Lag verschoben, der die Kreuzkorrelation maximiert | Wetterfronten erreichen die Parks nacheinander |
| M4 | M3 + Tageszeit | Koeffizienten je Tagesabschnitt (z. B. 4 Blöcke à 6 h) | Atmosphärische Stabilität ändert das Windprofil zwischen Tag und Nacht |
| M5 | Bin-Modell | Verhältnis v\_t / v\_r je Geschwindigkeitsklasse (1 m/s) oder Quantile Mapping | Nichtlinearer Zusammenhang, weiterhin als Tabelle erklärbar |
| M6 | Gradient Boosting | LightGBM auf Referenz, Lags, Gleitmitteln, Uhrzeit | Nur Benchmark in der Harness, nicht im Browser: zeigt, was ein schwer erklärbares Modell zusätzlich holt |
| M7 | Mehrere Referenzen | Auswahl der Referenz mit der höchsten Korrelation (bei ihrem besten τ) in allen Modellen; als eigenes Modell `multi_regression` die Kombination aller Referenzen, v̂ = a + Σ bᵢ · vᵢ(t − τᵢ) mit Gewichten nach kleinsten Quadraten | Bonus 3, automatische Turbinenauswahl |

**Kernfrage für die Harness: LR oder VR?** LR liefert den bedingten Erwartungswert und minimiert damit den Wind-RMSE. Weil sie die Streuung verringert, unterschätzt sie aber Spitzen. Die Leistungskurve ist im Teillastbereich konvex, deshalb kann das die Energie verzerren. VR erhält die Verteilung, hat dafür einen höheren Punktfehler. In der Literatur gilt VR als robusteste Standardmethode bei Korrelation r > 0,8, und LR und VR zeigen gegenläufige systematische Fehler ([Sheppard 2009](https://digitalcommons.humboldt.edu/etd/1023), [Basse et al. 2021](https://doaj.org/article/bc7775ee1e2d4c98927c8d47be5b4fe8)).

**Hypothese, die beides verbindet:** Wind mit LR vorhersagen (bester Wind-RMSE), Leistung aber als Erwartungswert über die Vorhersageverteilung berechnen, nicht als P(Mittelwert):

```latex
\hat{P}_t = \mathbb{E}\left[P(v)\right], \quad v \sim \mathcal{N}(\hat{\mu}_t, \hat{\sigma}_t^2)
```

Das holt die von LR weggenommene Streuung zurück und minimiert zugleich den Leistungs-RMSE. Numerisch mit Gauß-Hermite-Quadratur (ca. 20 Stützstellen), in einer Zeile erklärbar. Die Harness hat das bestätigt (siehe „Umgesetzt“).

**Unsicherheit:** σ kommt aus Fehlern auf ungesehenen Trainingsdaten (Leave-one-block-out, S3), nicht aus der Trainingsanpassung, und wächst linear mit der vorhergesagten Windgeschwindigkeit. Ergebnis: `coverage_80` 0,78–0,83 je Datensatz; ein festes σ = 1 m/s ergäbe 0,37–0,64. Ein konstantes σ (80-%-Quantil) gab ähnliche Abdeckung, aber schlechtere Leistungsfehler und ein zu schmales Energieband bei langen Ausfällen.

**Umgesetzt (`windgap/models/linear.py`):** M1 `linear_regression` und M2 `variance_ratio` sind eine Klasse, die sich nur in (a, b) unterscheidet; M3 ist der Parameter `lag_max_min` (Standard 60): τ ∈ \[−60, 60\] min maximiert die Korrelation auf den Trainingsdaten. Die ersten τ Schritte des Ausfalls nehmen die gemessene Referenz davor (Kontext, S3). Harness (Score, kleiner besser; identity = 1): LR 0,71, LR ohne Lag 0,75, VR 0,79 (mit Referenz-Kontext um das Fenster). τ hilft auf Synthetik (+20 min), Demo und Hamburg, ±180 min bringt nichts zusätzlich. **LR schlägt VR auch bei der Energie** (`energy_wape_pct` 40 % gegen 50 %): E[P(v)] über die kalibrierte Verteilung holt die Streuung zurück, die LR im Mittelwert verliert (Hypothese oben bestätigt). LR ist deshalb Standard in der GUI.

**Umgesetzt M7-light (`pick_reference` in `windgap/models/base.py`, alle Modelle):** Bei mehreren Referenzen wählt `fit` die Spalte, deren Korrelation mit dem Ziel bei ihrem besten Zeitversatz am höchsten ist (`identity`: ohne Versatz), nur auf Trainingsdaten, also im Backtest je Fold neu und ohne Datenleck. Erklärbar in einem Satz: „We use reference X because it tracked the target best before the outage: r = …“. `diagnostics` enthält dann `reference_index` (Position in `references`) und `r_ref_<i>` je Referenz; bei nur einer Referenz fehlen diese Schlüssel. Die GUI zeigt die Rangfolge in Schritt 3 und nennt die Wahl in der E-Mail. Harness-Beleg (DWD, je Ziel ein Pool aus der eigenen und den vier anderen Stationsreferenzen, 20 Folds, LR): Wind-RMSE 1,87 / 1,56 m/s bei 6 / 24 h gegen 2,02 / 1,64 nur mit der eigenen Referenz und 2,15 / 2,08 mit der ersten Spalte; `energy_wape_pct` 51 / 49 % gegen 60 / 59 % und 90 / 71 %. Bremen wählt dabei Dörpen-Friesoythe (r = 0,88) statt Brake (0,80), sonst die eigene Referenz.

**Umgesetzt M7 (`windgap/models/multi.py`, `multi_regression`):** v̂_t = a + Σᵢ bᵢ · vᵢ(t − τᵢ). Jede Referenz bekommt ihren eigenen Versatz τᵢ (wie M3, `best_lag` in `base.py`, nur auf Trainingsdaten), die Gewichte kommen aus den Normalgleichungen der zentrierten Daten (kleinste Quadrate auf den Zeitschritten, an denen alle genutzten Referenzen und das Ziel gemessen haben). Bekäme eine Referenz ein negatives Gewicht, fällt die mit dem kleinsten heraus und der Rest wird neu angepasst, bis alle Gewichte ≥ 0 sind: Jedes Gewicht sagt dann, wie stark eine Referenz zählt, und ein Gewicht 0 heißt „nicht genutzt“. Mit einer Referenz ist das Modell exakt `linear_regression` (gleiche Lag-Suche, gleiche Koeffizienten, gleiche Kalibrierung); auf allen Datensätzen mit einer Referenz liefert die Harness deshalb identische Zahlen. `params`: `a` und `b_ref_<i>` (0 für weggelassene Referenzen), `diagnostics`: `r` (Korrelation der kombinierten Vorhersage mit dem Ziel), `lag_min_ref_<i>`, `r_ref_<i>`; kein `reference_index`, weil keine einzelne Referenz gewählt ist. Erklärbar als „gewichtetes Mittel der Nachbarn, das Gewicht kommt aus der Übereinstimmung vor dem Ausfall; unabhängige Fehler der Nachbarn heben sich teilweise auf“. Wirkung auf den Challenge-Daten (`make harness`, je Ziel mit allen sieben Referenzen): Score 0,57 / 0,68 / 0,54 gegen 0,62 / 0,86 / 0,63 mit `linear_regression` für T1 / T2 / T3, Wind-RMSE 1,28 / 1,07 / 1,10 gegen 1,38 / 1,34 / 1,27 m/s, `energy_wape_pct` 15,7 / 9,9 / 10,3 gegen 17,8 / 14,0 / 13,3 %; bei 72 h über alle Datensätze 30,0 gegen 30,9 % und Score 0,68 gegen 0,71. Gewichte vor dem 01.09., z. B. T2: v̂ = 0,64 + 0,19 · O1 + 0,23 · O2 + 0,17 · H3 + 0,15 · H5 + 0,05 · H4 + 0,03 · H2; die H-Turbinen laufen 30 min hinter T (τ = −30 min). Empfohlen bleibt bis zur Entscheidung im Team `linear_regression` (E15).

**Umgesetzt Windschatten-Faktor (`multi_regression`, Parameter `direction_sectors` = 12, 0 schaltet ab):** v̂_t = (a + Σᵢ bᵢ · vᵢ(t − τᵢ)) · f_s(t). s(t) ist der 30°-Sektor (mittig um 0°, 30°, …) der zirkulär gemittelten Windrichtung aller Referenzen mit Richtung zur Zeit t. f_s = (Σ_s y + n₀ · m) / (Σ_s ŷ + n₀ · m) über die Trainingsschritte im Sektor s, mit ŷ der Regression ohne Faktor, m dem Mittel von ŷ und n₀ = 144 Schritten (ein Tag) als Zug zu 1, damit ein Sektor mit wenigen Werten nichts behauptet. Ohne Richtung ist f = 1. `calibrate` passt Regression und Faktoren in jedem Block neu an, σ enthält also den Faktor. Physik: Steht das Ziel bei einer Windrichtung im Nachlauf eines Nachbarn (oder hinter Gelände), misst es dort systematisch weniger, als die Referenzen sagen; T1 verliert bei Westwind bis 18 % durch SIE 03 (`knowledge/turbinen.md`). `params`: `wake_factor_<Grad>` je Sektor mit Trainingswerten, `diagnostics`: `wake_steps_<Grad>` (Anzahl Trainingsschritte). Die GUI zeigt die Faktoren in Schritt 3.

**Trainingsfenster:** Standard sind alle Daten vor dem Ausfall. Als Parameter testen: nur die letzten N Tage, oder exponentiell abklingende Gewichte, weil jüngere Wetterlagen ähnlicher sind.

## Harness

Die Harness simuliert hunderte künstliche Ausfälle im Trainingszeitraum und bewertet jedes Modell darauf genau so, wie die Jury es tut. Ein Befehl, unter 30 Sekunden, Ergebnis als Leaderboard.

```bash
uv run python -m harness --config configs/eval.yaml --models all
```

**Szenarien (rollierender Ursprung):**

1. Ausfallbeginn t₀ wandert in Schritten von `t0_step_h` (Standard 12 h) durch die Daten, frühestens nach `min_train_days` (5) Tagen Zieldaten.
2. Je t₀ mehrere Ausfalllängen `lengths_h`: 1 h, 6 h, 12 h, 24 h, 48 h, 72 h, 5 Tage.
3. Das Modell trainiert nur auf Daten vor t₀ und sagt den Zeitraum \[t₀, t₀ + L) vorher (`windgap.backtest.fold`).
4. Die letzten `holdout_days` (5) Tage der Zielreihe sind ein gesperrter Holdout: Ohne `--holdout` endet jedes Fenster davor; mit `--holdout` liegen nur t₀ im Holdout (Training auf allem davor). Nur für finale Entscheidungen, damit wir nicht auf die Szenarien überanpassen.
5. Referenzlücken im Fenster überbrückt die Harness wie GUI und CLI (`fill_during_outage`, bis 6 Schritte linear); eine längere Lücke lässt das Szenario entfallen (gezählt und angezeigt). Training sieht nur die Messwerte.
6. Ein Datensatz kann die Einstellungen unter `scenarios:` mit einem eigenen `scenarios:`-Eintrag überschreiben, z. B. einen größeren `t0_step_h` für lange Datensätze, damit der ganze Lauf unter 30 s bleibt (DWD 24 h, T1–T3 144 h).

Bei 30 Tagen Daten sind das ca. 260 Szenarien je Datensatz und Modell, `identity` braucht dafür ca. 0,6 s.

**Fallen, die die Harness verhindern muss:** keine Normierung oder Lag-Suche über den gesamten Zeitraum; keine Parameterwahl auf dem Holdout; Gleitmittel der Referenz nur rückwärts gerichtet, außer wir entscheiden bewusst, dass die ganze Referenzreihe während des Ausfalls verfügbar ist (sie ist es, deshalb erlaubt, aber dokumentiert).

**Metriken** (Definition in `windgap/core/metrics.py`, Auswahl und Gewichte in `configs/eval.yaml`). Jedes Szenario läuft über `windgap.backtest.fold`, damit Harness und GUI dasselbe messen:

| Metrik | Definition |
| --- | --- |
| `wind_rmse`, `wind_mae` | m/s, über alle Zeitschritte im Ausfall |
| `power_rmse`, `power_mae` | kW, nach Anwendung der Leistungskurve |
| `energy_dev_pct` | (Summe vorhergesagt − Summe echt) / Summe echt, je Szenario, dann Betrag gemittelt |
| `bias` | mittlerer Windfehler, m/s |
| `coverage_80` | Anteil echter Werte im 80-%-Band, je Zeitschritt |
| `energy_coverage_80` | Anteil der Szenarien, deren echte Energie in \[`kwh_p10`, `kwh_p90`\] liegt (je Szenario 0 oder 1); Ziel ca. 0,8 |
| `energy_band_pct` | (`kwh_p90` − `kwh_p10`) / echte Energie, Breite des Energiebands; zusammengefasst energiegewichtet wie `energy_wape_pct`: Σ `energy_band_kwh` / Σ `energy_true_kwh` |
| `energy_true_kwh`, `energy_err_kwh`, `energy_band_kwh` | echte Energie, Fehler `kwh_p50` − echt und Bandbreite `kwh_p90` − `kwh_p10` je Szenario, kWh |
| `energy_wape_pct` | nur zusammengefasst: Σ \|`energy_err_kwh`\| / Σ `energy_true_kwh` über Szenarien. Gewichtet Szenarien nach Energie; der Mittelwert von \|`energy_dev_pct`\| wird dagegen von Flaute-Szenarien mit winziger echter Energie beherrscht (Baseline: über 1000 % bei 6 h) |
| `score` | nur Harness: gewichtetes Mittel der Jury-Metriken im Verhältnis zur Baseline (siehe unten) |

Prozentwerte fehlen in Szenarien ohne echte Energie (Flaute). Über Szenarien fasst `summarize` zusammen: Mittelwert je Metrik, `energy_dev_pct` als Mittel der Beträge, `energy_wape_pct` und `energy_band_pct` energiegewichtet.

**Score:** `score` = Σ wᵢ · metricᵢ / metricᵢ(Baseline) / Σ wᵢ über die Metriken und Gewichte unter `score:` in `configs/eval.yaml` (Standard: `wind_rmse`, `wind_mae`, `power_rmse`, `power_mae`, `energy_wape_pct`, je 1). Die Baseline (`baseline:`, Standard `identity`) läuft immer mit und hat Score 1; kleiner ist besser. Berechnet je Datensatz × Ausfalllänge und je Datensatz über alle Längen; die Zeilen `dataset = all` mitteln die Datensätze gleichgewichtet (Score eingeschlossen). Kalibrierung (`coverage_80`, `energy_coverage_80`) steht daneben, zählt aber nicht in den Score, weil die Jury sie nicht bewertet.

**Datensätze** stehen in `configs/eval.yaml`: `kind: synthetic` (Generator) oder `kind: folder` mit Glob relativ zum Repo (`data/synthetic`, `data/dwd/*`, `data/challenge`). Ein Ordner enthält genau eine Leistungskurve (CSV ohne Zeitstempel) und Wind-CSVs nach S1; die Reihe, deren ID `target` enthält (Dateiname bzw. Spaltenkopf), ist das Ziel, alle anderen sind Referenzen. Für die Challenge also z. B. `data/challenge/target.csv`, `reference.csv`, `power_curve.csv`; `n_turbines` im Eintrag, optional `wind_scale` (multipliziert alle Reihen, siehe DWD unter „Externe Daten“). Optional `files` (Liste von Globs, Standard alle CSVs) und `target` (ID der Zielreihe): So liest ein Ordner mit mehreren Zielen mehrere Einträge, wie T1–T3 aus `data/data_hackathon_baywa_re/` nach `make csv`, je mit den Referenzen aus H und O. Ein Muster ohne CSVs wird gemeldet und übersprungen.

**Aufruf:** `make harness`, oder `uv run python -m harness --models identity,lr --datasets demo,dwd [--holdout]`. Varianten (`variants:` in der Konfiguration) sind weitere Leaderboard-Zeilen aus einem registrierten Modell mit festen Parametern.

**Ausgabe:** `runs/<zeit>_<commit>/` mit `config.yaml` (Konfiguration und Aufruf), `results.csv` (eine Zeile je Modell × Szenario; CSV statt Parquet, weil pyarrow eine neue Abhängigkeit wäre) und `leaderboard.csv` (Modell × Datensatz × Länge, inkl. `all`), dazu im Terminal drei Tabellen: gesamt, je Datensatz, je Ausfalllänge. Ein Commit mit lokalen Änderungen heißt `<commit>-dirty`. Aufschlüsselung nach Windklasse folgt im Diagnose-Notebook.

**Diagnose-Notebook `notebooks/diagnose.ipynb`** (geplant, noch nicht angelegt) für menschliches Debugging: Überlagerung echt/vorhergesagt für ein wählbares Szenario; Streudiagramm Ziel gegen Referenz mit Modellgeraden; Residuen gegen Referenzwind, gegen Uhrzeit und gegen Ausfalllänge; Fehlerbeitrag zur Energie je Windklasse. Diese Ansichten zeigen, warum ein Modell an einem Tag versagt, und sind wichtiger als eine Karte.

**Testdaten ohne Challenge-Daten:** ein Generator für synthetische Paare (Weibull-verteilter Wind, Korrelation ca. 0,85, Lag 20 min, Tagesgang, Rauschen) mit bekannter Wahrheit, plus fünf echte Stationspaare vom DWD (siehe Externe Daten). Damit läuft die ganze Kette, bevor die echten Daten da sind.

## GUI-Anforderungen

Die GUI führt in fünf Schritten von den Dateien zur kWh-Zahl. Jede Pflichtanforderung der Aufgabe hat einen festen Platz. Sprache der Oberfläche: Englisch, weil die Challenge auf Englisch gestellt ist. **\[offen\]** Sprache der Jury.

1. **Upload:** eine Ablagezone für alle Dateien, CSV und xlsx (`assignFiles`, Zuordnung sichtbar und korrigierbar mit Zeitraum und Fehlanteil je Reihe, Ziele per Knopf je Reihe, mehrere Ziele erlaubt; Dateiliste mit Entfernen je Datei, weitere Ablagen fügen hinzu) und Button „Load demo data“; darunter optional DWD-Stationen als zusätzliche Referenzen (siehe Externe Daten, Standard aus, nur Stationen, die den Zeitraum der Daten abdecken); darunter die Turbinenzahl als Entscheidung (S1). Die Zonen je Rolle (Ziel, Referenz(en), Leistungskurve) liegen in einer Aufklappzeile: zu, solange nichts geladen ist oder die Ablagezone zugeordnet hat („Correct the assignment one role at a time“), offen, wenn Dateien je Rolle geladen wurden. Sofortige Prüfung mit Datenqualität (Zeitraum, Anzahl Werte, Lücken, Korrelation).
2. **Outage:** Zeitreihen beider Parks übereinander, erkannter Ausfall farbig hinterlegt. Start und Ende per Ziehen oder Datumsfeld anpassen.
3. **Method:** bei mehreren Referenzen die Rangfolge nach r mit der gewählten Referenz und einem Satz Begründung; Vergleichstabelle aller Modelle auf den Daten des Nutzers (je Modell ein `analyze`: Energiefehler `energy_wape_pct`, Wind-RMSE, Abdeckung des 80-%-Bands, kWh mit Spanne), Empfehlung aus `ModelInfo.recommended`, Auswahl per Zeile; Formel, zwei Sätze Erklärung, Streudiagramm Ziel gegen Referenz (um τ verschoben) mit Modellgerade, gelernte Parameter mit verständlichen Namen und Erklärung, Korrelation r; liefert das Modell `wake_factor_<Grad>`, eine Karte „Wake and terrain by wind direction“ mit dem Faktor je Sektor, der Zahl der Trainingswerte und einem Satz zum stärksten Sektor.

**Mehrere Ziele:** Schritte 2–5 zeigen ein Ziel; ein Umschalter über den Schritten wählt es. Jedes Ziel hat seinen eigenen Ausfall und eigene Ergebnisse, Leistungskurve und Turbinenzahl gelten für alle. Die Engine rechnet je Ziel alle Modelle, das angezeigte Ziel zuerst.
4. **Results:** oben ein Banner, wenn Plausibilitätswarnungen vorliegen („2 data checks need attention“ mit den Titeln und Sprung zu den Details), der Schritt ist dann im Stepper markiert; Karte „Lost energy“ in Lesereihenfolge: große P50-Zahl, Satz zum 80-%-Band mit Erklärung (S4), Balken P10–P90 mit der Lage von P50; vorhergesagter Wind mit 80-%-Band im Ausfall, angrenzende echte Messungen davor und danach; Kennzahlenkarten mit Genauigkeit aus dem Backtest und einem Satz, der nur aus `validation` gebildet wird; Energieverlust in kWh mit P10/P50/P90; kumulierte Verlustkurve und Leistung je Zeitschritt; Liste der Plausibilitätswarnungen.
5. **Export:** „Filled target series“ (Abgabeformat, siehe unten; bei mehreren Zielen je Ziel eine Datei, auch als „Download all“), CSV der Vorhersage mit Band, Leistung und Energie, Bericht als E-Mail-Entwurf zum Kopieren (Bonus 1) mit Modellname, Parkgröße („4 turbines × 3,000 kW“), Kopfsatz, Warnungen und Version.

**Abgabeformat (für den versteckten Test, solange offene Frage 1 ungeklärt ist):** die Zielreihe im Challenge-Format, `Timestamp,Wind speed (m/s),Predicted`, eine Zeile je 10 min über Ziel und Vorhersage, Zeit `YYYY-MM-DD HH:MM` in Europe/Berlin (doppelte Herbststunde in zeitlicher Reihenfolge), Messwerte unverändert (kürzeste Darstellung), im Ausfall fehlende Werte mit dem vorhergesagten Mittelwert auf 3 Nachkommastellen und `Predicted` = 1, sonst noch fehlende Werte `NaN`. Zwillinge: `filledTargetCsv` (`web/src/data/filled.ts`, GUI-Export für den gewählten Ausfall) und `filled_target_csv` (`windgap/core/io.py`). Die CLI `python -m harness.predict` (`make predict TURBINES=n`) liest die Dateien über `windgap.core.io`, füllt jeden erkannten Ausfall über `windgap.engine.handle` und schreibt dieselbe Datei; Ausfälle, die die Engine ablehnt, bleiben `NaN`, werden gemeldet, und der Exit-Status ist 1. `fixtures/predict/demo.csv` (von `make fixtures`) muss der GUI-Export der Demo Byte für Byte treffen.

**Plausibilitätswarnungen** (`plausibility` in `web/src/data/checks.ts`, angezeigt im Schritt, in dem sie zählen, in Results als Banner oben und ausführlich unten, in der E-Mail): Korrelation r < 0,7 (aus `diagnostics.r`), überbrückte Referenzlücken im Ausfall (Anzahl), weniger als 5 Tage Zieldaten vor dem Ausfall, Ausfall bis zum Ende der Zieldaten, Nennleistung je Turbine < 100 kW oder > 20 MW bzw. nie > 0, Ziel und Referenz identisch. Warnungen sind Hinweise, keine Fehler.

| Pflicht laut Aufgabe | Wo in der GUI |
| --- | --- |
| Accuracy metrics | Schritt 4, Kennzahlenkarten (Energiefehler `energy_wape_pct`, RMSE, MAE, Leistungs-RMSE auch in % der Parknennleistung, Abdeckung, Bias) mit Hinweis „aus Backtest auf euren Daten“ |
| Wind speed visualization | Schritt 4, Zeitreihe mit Band |
| Prediction method | Schritt 3, Formel, Erklärung, Streudiagramm, Vergleich mit Alternativmodellen aus der Harness |
| Energy loss calculation | Schritt 4, große kWh-Zahl mit Spanne |
| Energy loss visualization | Schritt 4, kumulierte Kurve und Balken je Stunde |

**„How it works“** (Knopf im Kopf, Sheet, `web/src/components/HowItWorks.tsx`): die drei Schritte der Aufgabe (Analyze → Predict → Calculate) in unseren Worten und „How we chose the method“ mit dem Harness-Ergebnis. Die Zahlen stehen dort einmal als `BENCHMARK` mit Datum und Commit des Laufs; ändert sich das Leaderboard oder `RECOMMENDED`, dort und in „Modellarchitektur“ nachziehen.

**UX-Regeln:** Jeder Schritt zeigt in einem Satz, was er tut. Ein Lauf darf höchstens 3 Sekunden dauern, sonst Ladeanzeige mit Text. Zahlen immer mit Einheit; Energie und Leistung über `fmtAmount` (ab 100 ganzzahlig, darunter 3 signifikante Stellen, nie „0 kW“ für kleine Werte). Leere und Fehlerzustände sind gestaltet, nicht rohe Stacktraces.

**Karte:** nur als optionales Modul, falls Koordinaten vorliegen. Die Debugging-Ansichten für die Modellarbeit liegen im Diagnose-Notebook, nicht in der Produkt-GUI.

## Challenge-Daten (Stand 24.10.)

Die Dateien liegen lokal in `data/data_hackathon_baywa_re/` und sind nicht eingecheckt (`.gitignore`). Die Beschreibung der Organisatoren (`README.docx`) steht in CHALLENGE.md, Abschnitt 5. Die Zahlen unten stammen aus einer einmaligen Prüfung mit einem Wegwerf-Skript (xlsx über `zipfile`, dann über `windgap.core.io`, Engine und Harness).

**Aufbau**

- 13 Dateien im Format **xlsx**, keine CSV: zehn Zeitreihen `<Turbine>_data.xlsx` und drei Leistungskurven `<Turbine>_power_curve.xlsx`, je ein Blatt, das nach der Turbine heißt.
- **Turbinen statt Parks.** Der Buchstabe nennt den Park, die Ziffer die Turbine. Zielpark T mit T1–T3, jede Turbine mit eigenem Ausfall; Referenzparks H (H1–H5) und O (O1, O2). Laut README müssen Referenzen außerhalb des Zielparks liegen, T2 und T3 sind also keine Referenz für T1. Die Turbinenzahl je Ziel ist 1.
- Spalten der Zeitreihen: `turbine_name, timestamp, wind_speed, wind_direction, ambient_temperature, air_pressure, wind_speed_stddev, test_set`. Der Zeitstempel ist eine Excel-Seriennummer mit Zellformat `yyyy-mm-dd hh:mm:ss`, ohne Zeitzone; `test_set` ist ein Wahrheitswert; Fehlwerte sind leere Zellen. Bei O1 und O2 ist `wind_speed_stddev` ganz leer und `air_pressure` eine Konstante (Schätzwert, keine Messung).
- Zeitraum 01.07.2026 00:00 bis 30.09.2026 23:50 im 10-Minuten-Raster, 12.960 Zeilen je Datei. In allen Dateien fehlen die Zeilen vom 03.08. 00:00 bis 04.08. 23:50 ganz (48 h), daher 90 statt 92 Tage. Im Zeitraum gibt es keine Zeitumstellung, die Zeitzone ändert die Wanduhrzeiten der Abgabe also nicht.
- `test_set` = 1 vom 01.09. 00:00 bis 09.09. 23:50 (9 Tage, README nennt 10). **Versteckt:** 01.–03.09. (72 h), T1–T3 durchgehend NaN, alle Referenzen vollständig. **Gezeigt:** 04.–09.09. für die Validierung. Danach folgen bis 30.09. weitere Daten mit `test_set` = 0.
- Lücken: zufällige einzelne NaN in jeder Reihe (0,8–1,1 %, bei T1–T3 mit Ausfall 4,2–4,5 %), Kommunikationslücken bei H1 am 13./14.07. (10 h und 16 h) und bei T1 am 07.08. (5 h). Wind von genau 0,00 m/s kommt bei T und O vor (2–6 Werte je Reihe), negative Werte nicht.
- **Leistungskurven:** Spalten `turbine_name, wind_speed, power`, 0,5 bis 26 m/s in Schritten von 0,5 m/s, Leistung in kW (ohne Einheit im Kopf). Alle drei Kurven sind identisch: Einschalten bei 3 m/s, 4.500 kW ab 11,5 m/s, ab ca. 20 m/s abgeregelt bis 2.529 kW bei 26 m/s, darüber 0 kW nach S1. Die Zielturbinen sind also keine V47 oder E-40; die eingebauten Kurven in `data/power_curves/` treffen die Challenge nicht. **Entscheidung (24.10.): Für T gilt die Nordex-Kurve der Challenge** (4,5-MW-Modus bei 1,225 kg/m³; Herkunft, Standorte der Parks und die echten Turbinen in Sievern in `knowledge/turbinen.md`). Die Zeitstempel sind Sommerzeit (UTC + 2), wie S1 sie liest; geprüft am Luftdruck gegen DWD-Stationen.
- Korrelation des 10-Minuten-Winds vor dem 01.09.: T1–T3 mit O 0,69–0,77, mit H 0,61–0,72, innerhalb von T 0,82–0,88 (nicht erlaubt), innerhalb von H 0,81–0,91, O1 mit O2 0,97. Mittlerer Wind T 5,2–5,5 m/s, Referenzen 5,5–6,2 m/s.

**Was heute schon geht** (nach `make csv`): Beide Importe lesen die Dateien ohne Änderung. Ignoriert werden Richtung, Temperatur, Druck, Standardabweichung und `test_set`, bei der Kurve `turbine_name`. Die Ausfallerkennung findet den 01.–03.09. (72 h) und bei T1 zusätzlich den 07.08. (5 h). `make predict` je Ziel mit allen sieben Referenzen und `--n-turbines 1` wählt per M7-light für T1 und T3 O1, für T2 O2 (τ = 10 min). P50-Verlust mit `linear_regression`: T1 102 MWh, T2 122 MWh, T3 99 MWh; mit `variance_ratio` 122, 139 und 117 MWh. Ein Engine-Aufruf dauert unter 0,1 s. Harness mit rollierenden Szenarien bis 09.09. (je Ziel mit O, H und allen Referenzen): Score `linear_regression` 0,74, `variance_ratio` 0,75, `identity` 1. Auf dem gezeigten Test (Fit vor dem 04.09. bzw. 07.09., 72 h) liegt der Wind-RMSE von `linear_regression` bei 1,3–1,8 m/s. **Erster eigener Algorithmus:** `multi_regression` (M7, siehe Modellarchitektur) kombiniert alle sieben Referenzen und schlägt `linear_regression` auf allen drei Zielen (Score 0,57 / 0,68 / 0,54 gegen 0,62 / 0,86 / 0,63). P50-Verlust 01.–03.09.: T1 102 MWh (87–116), T2 120 MWh (108–133), T3 98 MWh (87–109); die Bänder sind schmaler als mit `linear_regression`.

**Windschatten-Faktor und DWD (24.10.):** Harness T1–T3 (je 93 Szenarien), `multi_regression` mit gegen ohne Faktor (`multi_regression_nowake`): Wind-RMSE 1,224 / 1,054 / 1,092 gegen 1,283 / 1,070 / 1,096 m/s, `energy_wape_pct` 13,0 / 9,3 / 10,0 gegen 15,7 / 9,9 / 10,3 %. Der stärkste Sektor von T1 ist West (−9 %), genau die Richtung von SIE 03. Mit den acht DWD-Stationen zusätzlich (`T1+dwd` …, gleiche 180 Szenarien): Wind-RMSE 1,143 statt 1,156 m/s, `energy_wape_pct` 10,3 statt 9,2 %, also kein klarer Gewinn; die Modelle mit einer Referenz wählen nie eine Station, und DWD-Lücken über 1 h kosten 37 von 97 Szenarien. GUI mit allen zehn xlsx und `multi_regression` (beide Engines gleich): P50-Verlust 01.–03.09. T1 94,7 MWh, T2 125,0 MWh, T3 100,5 MWh. `RECOMMENDED` bleibt bis zur Entscheidung im Team `linear_regression` (E15); der Faktor ist nur in `multi_regression` sichtbar.

**Was die Anwendung noch braucht**, nach Dringlichkeit; jede Änderung an S1, S2 oder einer ADR erst im Team klären:

1. ~~xlsx-Import~~ *Erledigt:* beide Importe lesen xlsx (S1, „Excel“); `make csv` bleibt für die Harness.
2. ~~Referenzen aus dem Zielpark ausschließen~~ *Erledigt über mehrere Ziele:* Alle zehn Dateien ablegen macht T1–T3 zu Zielen (gleich lange Ausfälle), und ein Ziel ist nie Referenz (S1, E8).
3. ~~Drei Ziele~~ *In der GUI erledigt* (mehrere Ziele, Export je Ziel). CLI und Harness rechnen weiter ein Ziel je Lauf (`make predict` je Turbine).
4. ~~Harness überspringt die meisten Szenarien.~~ *Erledigt:* Die Harness überbrückt Referenzlücken wie GUI und CLI (Harness, Schritt 5); T1–T3 stehen als Datensätze in `configs/eval.yaml`.
5. **Validierung auf dem gezeigten Test.** `holdout_days` meint die letzten Tage des Zeitraums (26.–30.09.). Der gezeigte Test ist der 04.–09.09.; als Holdout-Fenster in `configs/eval.yaml` einstellbar machen.
6. **Daten nach dem Ausfall.** Vom 04. bis 30.09. gibt es Zieldaten; `fit` sieht heute nur Daten vor dem Ausfall. Ob wir sie für die Abgabe nutzen, ist eine ADR-Frage (offene Frage 4): Ein Leck des versteckten Ziels wäre es nicht, aber der Backtest bildet es dann nicht mehr ab.
7. **`calibrate` teilt durch null**, wenn σ₀ = 0 und die Vorhersage genau 0 m/s ist (`identity` mit einer Referenz bei 0,00 m/s). Die Autokorrelation wird dann NaN. Betroffen sind zwei Harness-Fenster, nicht die Fits für die Abgabe. Zuständig: T2/T3.
8. **Texte.** Die GUI spricht von „farm“ und fragt nach der Turbinenzahl des Parks; das Ziel ist hier eine einzelne Turbine (Antwort 1).

## Externe Daten und Vortraining

Empfehlung: externe Daten heute als realistische Testpaare für die Harness nutzen, nicht für ein Vortraining des Modells. Der Zusammenhang zwischen zwei Windparks ist ortsspezifisch, und 30 Tage à 144 Werte (ca. 4300 Paare) reichen für Modelle mit 2–10 Parametern völlig aus. Vortraining lohnt sich nur für datenhungrige ML-Modelle, die wir aus Erklärbarkeitsgründen ohnehin nicht einsetzen.

| Quelle | Was | Auflösung | Nutzen für uns |
| --- | --- | --- | --- |
| [DWD Open Data, 10-Minuten-Wind](https://wetterdienst.readthedocs.io/en/latest/data/provider/dwd/observation/10_minutes.html) | Mittlere Windgeschwindigkeit (m/s) und Richtung je 10 min, viele Stationen in Deutschland, frei nutzbar mit Quellenangabe | 10 min, Messhöhe meist ca. 10 m statt Nabenhöhe | Hoch: viele echte Stationspaare als Testfälle; Python-Paket `wetterdienst` lädt sie direkt |
| [Open-Meteo Historical API (ERA5)](https://open-meteo.com/en/docs/historical-weather-api) | Wind in 10 m und 100 m, Temperatur, Druck, Richtung; ohne Schlüssel für nicht-kommerzielle Nutzung | stündlich, ca. 25 km Raster, ca. 5 Tage Verzögerung | Mittel: Zusatzparameter für Bonus 2, aber nur mit Koordinaten der Parks |

**Abgestufter Nutzen:**

1. **Testbett (hoch, heute):** 3–5 DWD-Stationspaare mit 20–60 km Abstand laden. Damit prüfen wir, ob unsere Modellrangfolge stabil ist oder nur auf einem Datensatz gut aussieht.
2. **Vorwissen (mittel):** typische Lags, Tagesgang, ob VR oder LR besser abschneidet. Liefert gute Startwerte und Argumente für die Präsentation.
3. **Zusatzregressoren (Bonus 2):** Temperatur und Druck aus ERA5 am Standort, als Proxy für Stabilität. Nur wenn Koordinaten vorliegen, und nur wenn die Harness einen Gewinn zeigt.
4. **Vortraining eines Modells (niedrig):** nicht empfohlen.

**Umgesetzt (`make dwd`, `harness/dwd.py`):** fünf Paare aus `recent/` (FF_10, 10-Minuten-Mittel in UTC, ca. 10 m Höhe), 15.09.–15.10.2026 (30 Tage wie die Challenge), im Challenge-Format nach `data/dwd/<paar>/` mit der generischen Leistungskurve. Nur stdlib und pandas, keine erfundenen Werte; Lücken bleiben NaN.

| Paar (Ziel ← Referenz) | Abstand | r | Mittel Ziel / Referenz |
| --- | --- | --- | --- |
| Bremen ← Brake | 40 km | 0,79 | 3,5 / 3,3 m/s |
| Hamburg-Fuhlsbüttel ← Ruthenstrom | 39 km | 0,85 | 3,5 / 4,3 m/s |
| Büsum ← Sankt Peter-Ording | 29 km | 0,83 | 7,7 / 6,2 m/s |
| Schleswig ← Flensburg | 30 km | 0,81 | 2,8 / 3,6 m/s |
| Dörpen ← Friesoythe | 41 km | 0,83 | 2,4 / 3,1 m/s |

Vorbehalt: In 10 m Höhe liegt der Wind meist unter der Einschaltgeschwindigkeit der Nabenhöhen-Kurve (3 m/s). Deshalb skaliert die Harness die DWD-Paare mit `wind_scale: 1.38` in `configs/eval.yaml` (Potenzgesetz (100 m / 10 m)^0,14, auf Ziel und Referenz gleich), damit sie den steilen Teil der Leistungskurve treffen. Das ist ein Prüf-Proxy, kein Höhenprofil der Standorte; Energiemetriken der Binnenpaare bleiben relativ groß. Die Mittelwerte unterscheiden sich je Paar um bis zu 25 %, ein Test dafür, ob Modelle den Versatz lernen.

**Umgesetzt DWD-Referenzen (`make dwd-refs`, `harness/dwd.py`):** acht Stationen um die Parks der Challenge (Bremerhaven, Cuxhaven, Bremen, Spiekeroog, Hamburg-Fuhlsbüttel, Soltau, Hannover, Hameln; Standorte in `knowledge/turbinen.md`), FF_10 und DD_10 vom 01.07. bis 30.09.2026 (UTC), eingecheckt als `data/dwd_refs/dwd_<Station>.csv` im Challenge-Format (Kopf `Timestamp (UTC)`, Quelle im Vorspann, CC BY 4.0). Vorab geladen, weil die App offline läuft und der DWD-Server keinen Browserzugriff (CORS) erlaubt. Die GUI bietet sie in Schritt 1 als zusätzliche Referenzen an (Standard aus; nur wenn sie den Zeitraum der Daten abdecken); sie gehen wie jede Referenz in die Engine. Die Harness rechnet T1–T3 zusätzlich mit ihnen (`T1+dwd` … in `configs/eval.yaml`). Ergebnis siehe Challenge-Daten: Neben H und O bringen sie keinen Gewinn; allein sind sie deutlich schlechter als Turbinen-Referenzen. Ihr Nutzen ist der Fall ohne Referenzpark.

**\[offen\]** Sind externe Daten laut Regeln erlaubt?

## Auslieferung und Test auf fremden Rechnern

Wir liefern zwei Varianten aus demselben Build, damit eine unbekannte Umgebung bei der Jury uns nicht die Demo kostet. Beide sind statisch und brauchen keinen Server von uns.

| Variante | Inhalt | Start | Schwäche |
| --- | --- | --- | --- |
| `windgap.html` | Eine Datei, `ts`-Engine, alles eingebettet (`vite-plugin-singlefile`) | Doppelklick, auch offline | Nicht derselbe Code wie die Harness; abgesichert durch Golden Tests |
| `windgap-web/` | Ordner mit beiden Engines, Pyodide liegt im Ordner (kein CDN) | GitHub-Pages-Link, oder lokal über einen statischen Webserver | Braucht `http://`, nicht `file://`; Kaltstart lädt einige zehn MB |

**Risiken und Gegenmaßnahmen:**

- *Python per WebAssembly zählt nicht als „lokal im Browser“:* `windgap.html` erfüllt die Anforderung in jedem Fall. Morgen früh nachfragen.
- *Abgabe muss eine HTML-Datei oder ein Ordner sein:* beide Varianten sind genau das. Der Ordner enthält zusätzlich `windgap.html` als Einstieg ohne Webserver.
- *Wir können nicht auf den Rechnern der Jury testen:* wir testen auf allen drei Team-Laptops in mehreren Browsern und ohne Internet (Testplan unten). Die GUI zeigt in der Fußzeile die aktive Engine und Version.

**Testplan auf den Team-Laptops:**

- [ ] `windgap.html` per Doppelklick, WLAN aus: Windows und macOS; Chrome, Firefox, Edge bzw. Safari
- [ ] `windgap-web/` über GitHub Pages: gleiche Browser, Kaltstart- und Warmstartzeit von Pyodide messen
- [ ] Engine-Schalter: gleiche Ergebnisse in `py` und `ts` für alle Modelle (vitest prüft beide gegen die Golden-Fixtures; hier der Blick in die GUI)
- [ ] Rückfall: Pyodide-Dateien absichtlich entfernen, App muss auf `ts` wechseln und das anzeigen

**Entscheidungsregel:** Standard-Engine ist `py`, wenn der Kaltstart unter 10 Sekunden liegt und alle Tests grün sind. Sonst ist `ts` Standard, und `py` bleibt als Nachweis „der Browser rechnet mit demselben Kern wie unsere Harness“.

## Repo, Stand der Nacht, erste Stunde

Die komplette Kette steht mit synthetischen Daten, Demo-Daten und fünf DWD-Paaren. Am Challenge-Tag tauschen wir nur noch Daten und verbessern Modelle.

### Repo-Struktur

```
CLAUDE.md  SPEC.md  CHALLENGE.md  Makefile  pyproject.toml  uv.lock
windgap/                    Python-Kern, Pyodide-kompatibel, einziger Inhalt des Wheels
  core/      schema.py  grid.py  powercurve.py  energy.py  metrics.py  io.py  outage.py
  models/    CLAUDE.md  base.py  registry.py  identity.py  linear.py
  backtest.py               fold() + backtest(), gemeinsam für Engine-Validierung und Harness
  engine.py                 handle(request_json) -> response_json, list_models()
harness/                    nur nativ: CLAUDE.md  __main__.py (CLI)  run.py (Szenarien, Leaderboard)  datasets.py  synthetic.py  fixtures.py  demo.py  dwd.py  predict.py (Abgabe-CLI)  (benchmarks/)
tests/                      pytest
fixtures/
  golden/<modell>/<fall>.json   AnalyzeRequest + Antwort von windgap, Spezifikation der ts-Engine
  csv/                          Parser-Fälle für TS- und Python-Import, je mit *.expected.json
  outage/cases.json             Ausfallerkennung und Überbrückung, TS und Python
  predict/demo.csv              Demo-Ziel gefüllt von harness.predict, Spezifikation des GUI-Exports
configs/     eval.yaml
data/        synthetic/  dwd/ (`make dwd`, nicht eingecheckt)  challenge/ (nicht eingecheckt, bis geklärt ist, ob öffentlich erlaubt)
(notebooks/   diagnose.ipynb)
runs/        Harness-Ergebnisse, nicht eingecheckt
web/                        Vite + React + shadcn (Nova/Radix) + Tailwind v4 + ECharts + MST, CLAUDE.md
  src/engine/  contract.ts (S5)  index.ts (createEngine)  py/ (Worker)  ts/ (Port)
  src/data/    CSV-Import, Zeitumstellung, Ausfallerkennung, Dateizuordnung, Request-Bau, Demo-Daten (TS)
  scripts/     fetch-pyodide.mjs  screenshots.mjs (make screenshots)  robustness.mjs (make robustness)
  src/state/   MST-Stores
  src/steps/   Upload, Outage, Method, Results, Export
  src/components/  format.ts  metrics.ts  Warnings.tsx  HowItWorks.tsx  charts/ (ECharts-Wrapper)  ui/ (shadcn)
  public/pyodide/  Pyodide-Dateien, nicht eingecheckt, per Skript geholt
  public/py/       Wheel von `make wheel`, nicht eingecheckt
dist/        windgap.html  windgap-web/   (von `make build`)
```

In Klammern: geplant, noch nicht angelegt. Leere Platzhalterdateien gibt es nicht.

### Aufgaben der Nacht (Stand 24.10., ca. 02:00)

- [x] PM: Repo, `uv`-Projekt, Makefile, `SPEC.md` + `CLAUDE.md`; Engine-Kontrakt S5 in TS und Python; `ts`-Engine gegen Golden-Fixtures (1e-6, Pyodide 1e-12)
- [x] PM: **Python im Browser:** Pyodide im Worker, `windgap` als Wheel. Kaltstart 3,3–3,4 s, `analyze` 40–80 ms (headless Chromium, lokal); Rückfall auf `ts` bei fehlendem Pyodide oder Wheel getestet
- [x] PM: GUI mit fünf Schritten, Engine-Schalter, Rückfall, Ablagezone für alle Dateien, Turbinenzahl als Entscheidung, Methodenvergleich mit Empfehlung, Plausibilitätswarnungen (Banner in Results), „How it works“, E-Mail-Entwurf, Export „Filled target series“
- [x] PM: Build beider Varianten; GitHub-Action für Pages (deployt erst nach dem nächsten Push, siehe unten)
- [x] CSV-Import TS und Python gehärtet (S1), gleiche Fälle in `fixtures/csv/`; 1 Jahr 10-Minuten-Daten in < 0,2 s (TS) bzw. 0,3 s (Python); `make robustness` (DWD-Paar mit Lücke, deutsches Format, Park mit mehreren Turbinenspalten, 1 Jahr) auf beiden Engines grün
- [x] Ausfallerkennung in TS und Python (`fixtures/outage/`), Abgabe-CLI `make predict`, GUI-Export bytegleich (`fixtures/predict/demo.csv`)
- [x] M0–M3 (`identity`, `linear_regression`, `variance_ratio`, Lag als Parameter) mit kalibriertem σ und korreliertem Energieband, `ts`-Port; M7-light (Referenzwahl nach r)
- [x] Harness (`make harness`, 7 Datensätze, 1793 Szenarien, 16 s), Synthetik, fünf DWD-Paare (`make dwd`), Score mit `energy_wape_pct`
- [x] Frischer Klon geprüft: `make install test build harness dwd` und `make predict` laufen ohne lokalen Zustand
- [ ] **Push:** Die Commits der Nacht liegen nur lokal auf dem PM-Rechner (`origin/main` steht auf `2dcc9d7`). Vor allem anderen pushen, sonst klonen die anderen Laptops den Stand von 23 Uhr
- [ ] M4 (Tageszeit), M5 (Bin-Modell), gewichtete Kombination mehrerer Referenzen, Diagnose-Notebook: nur, wenn die Harness Gewinn zeigt
- [ ] Alle: Testplan aus „Auslieferung“ auf allen drei Laptops

### Erste Stunde (60 Minuten)

| Minute | Wer | Was |
| --- | --- | --- |
| 0–5 | PM | Vom Rechner mit den Nacht-Commits `git push`; prüfen, dass die Pages-Action grün ist |
| 0–15 | alle | `git clone` bzw. `git pull`, dann `make install test build` (ca. 20 s, beim ersten Mal plus Downloads von Python 3.14, npm-Paketen und Pyodide) und `make dwd` (wenige Sekunden); `make serve` → http://localhost:8000, „Load demo data“, alle fünf Schritte und „How it works“ ansehen |
| 0–15 | PM | Offene Fragen an die Organisatoren (unten), vor allem 1, 6, 7 und 10 |
| 15–25 | Mathe B | Echte Daten nach `data/challenge/`: Zieldatei `target.csv` (Name muss `target` enthalten), Referenz(en) `reference.csv` bzw. `reference_<name>.csv`, Leistungskurve `power_curve.csv` (einzige CSV ohne Zeitstempel, eine Leistungsspalte je Turbine in kW oder MW). In `configs/eval.yaml` beim Eintrag `challenge` `n_turbines` setzen. Dann `uv run python -m harness --datasets challenge` und `make harness` (alle Datensätze). Importfehler nennen Datei und Zeile: Regel in S1 nachschlagen, nicht die Datei von Hand „reparieren“, ohne es zu notieren |
| 15–25 | PM | Dieselben Dateien in der GUI ablegen (eine Ablagezone), Zuordnung, Ausfall und Turbinenzahl prüfen, Warnungen lesen |
| 25–35 | Mathe B + PM | `make predict TURBINES=n` → `predictions.csv` (mehrere Referenzen: `REFERENCES="data/challenge/reference_a.csv data/challenge/reference_b.csv"`); muss mit dem GUI-Export „Filled target series“ übereinstimmen (gleicher Weg, gleiche Datei). Abweichung = Fehler, sofort melden |
| 35–60 | alle | Parallel nach Zuständigkeit (unten). Jede Modelländerung: `make fixtures test`, dann Harness; erst bei klarem Score-Gewinn auf `challenge` **und** den anderen Datensätzen `RECOMMENDED` (Python und `ts`), `BENCHMARK` und die Zahlen in „Modellarchitektur“ ändern |

**Womit jede Person beginnt:**

- **Mathe A (Modelle, T2):** Ideen mit Beleg aus der Harness:
  1. *LR gegen VR:* LR ist überall vorn (Score 0,71 gegen 0,79, `energy_wape_pct` 40 % gegen 50 %), VR hat aber den kleineren Bias (0,07 gegen 0,17 m/s) und deckt das Energieband bei langen Ausfällen schlechter ab (`energy_coverage_80` 0,54 bei 120 h auf Synthetik + Demo). Prüfen, ob der LR-Bias aus dem Clip bei 0 m/s oder aus der Tageszeit kommt.
  2. *σ je Windklasse:* σ ist eine Gerade in v̂. `coverage_80` je Windklasse (0–4, 4–12, > 12 m/s) messen; liegt sie im steilen Teil der Kurve unter 0,8, σ stückweise schätzen.
  3. *Tageszeit (M4):* Koeffizienten je 6-h-Block als Parameter von `_Linear`, nicht als neue Datei. Die Synthetik hat einen Tagesgang, die DWD-Binnenpaare eine Stabilitätsänderung; Gewinn nur, wenn auch `challenge` besser wird.
  4. *Gewichtete Referenzen (M7):* Die Wahl nach r brachte auf DWD 1,87 statt 2,02 m/s Wind-RMSE bei 6 h. Gewicht ∝ 1/Validierungsfehler² über `calibrate`-Fehler ist der nächste Schritt, erklärbar als „Mittel der Referenzen, die bessere zählt mehr“.
- **Mathe B (Harness, Energie, T3/T4):** Harness auf den echten Daten, Leaderboard je Ausfalllänge lesen; erst danach einmal `--holdout` für die finale Modellwahl. Kalibrierung prüfen: `coverage_80` ≈ 0,8 und `energy_coverage_80` je Länge; bei Abweichung zuerst in `calibrate` (S3) suchen, nicht im Modell. Score-Gewichte in `configs/eval.yaml` anpassen, sobald die Jury-Metrik bekannt ist (offene Frage 7).
- **PM (GUI, Präsentation, T1/T5/T6):** Push und Pages; GUI mit den echten Dateien durchklicken (Upload-Meldungen, Warnungen, Zahlen mit Einheit); Testplan auf allen Laptops; Präsentation entlang „How it works“ (Analyze → Predict → Calculate, dann „How we chose the method“) mit Live-Demo auf den echten Daten.

### Entscheidungen aus der Nacht (bitte bestätigen)

Getroffen ohne Rücksprache, alle in S1–S5 bzw. „Harness“ beschrieben. Was nicht passt, zuerst hier ändern, dann in beiden Importen bzw. im Code.

| # | Entscheidung | Wo |
| --- | --- | --- |
| E1 | Datumsreihenfolge: Jahr zuerst = J-M-T; `01.10.2026` = Tag.Monat; bei `/` und `-` entscheidet die Datei (ein Teil > 12), sonst Fehler | S1 |
| E2 | Ohne Offset gilt Europe/Berlin, außer der Kopf der Zeitspalte nennt `UTC`/`GMT`; doppelte Herbststunde nach Reihenfolge | S1 |
| E3 | Doppelter Zeitstempel (außer Herbststunde) ist ein Fehler, auch bei gleichem Wert | S1 |
| E4 | Nur 10-Minuten-Raster: Zeit auf `:00`, `:10` …, Median-Abstand 10 min, sonst Fehler (keine Stundenwerte, kein Resampling) | S1 |
| E5 | Windspalten nach Kopf: Richtung, Temperatur, Leistung, Status … ignoriert; nennt ein Kopf Wind, zählen nur diese; jede Windspalte ist eine Reihe. Negative Werte gelten als fehlend | S1 |
| E6 | Leistungskurve mit mehreren Leistungsspalten ist ein Fehler (keine stille Wahl); MW im Kopf → × 1000; 0 kW außerhalb der Kurve | S1 |
| E7 | Turbinenzahl muss in der GUI bestätigt werden (auch wenn aus dem Dateinamen gelesen); die CLI verlangt `--n-turbines` | S1 |
| E8 | Ziele bei mehreren Dateien: alle Reihen, deren längster Ausfall mehr als halb so lang ist wie der längste; jede Reihe in der GUI umschaltbar; ein Ziel ist nie Referenz | S1 |
| E9 | Ausfall ≥ 3 Schritte (30 min), kürzere Lücken sind Messlücken; Referenzlücken im Ausfall bis 1 h linear überbrückt, längere sind ein Fehler | S1, S2 |
| E10 | Referenzwahl: die Referenz mit der höchsten Korrelation bei ihrem besten Versatz, nur auf Trainingsdaten (M7-light) | Modellarchitektur |
| E11 | Referenz-Kontext ±6 h (`CONTEXT_STEPS` = 36) um jedes Vorhersagefenster, damit der Versatz τ gemessene Werte liest | S3 |
| E12 | σ aus Leave-one-block-out (5 Blöcke gleicher Paarzahl), linear in v̂, skaliert auf 80 % Abdeckung; Energieband P50 ± Z₉₀ · SD der Summe mit gemessener Fehler-Autokorrelation | S3, S4 |
| E13 | Score = Mittel von Wind-RMSE/MAE, Leistungs-RMSE/MAE und `energy_wape_pct`, je relativ zu `identity` (= 1); `energy_wape_pct` statt Mittel von \|`energy_dev_pct`\|, weil Flaute-Szenarien diesen beherrschen | Harness |
| E14 | DWD-Paare mit `wind_scale: 1.38` (Potenzgesetz 10 m → 100 m), nur als Prüf-Proxy | Externe Daten |
| E15 | Empfohlenes Modell `linear_regression` als Konstante `RECOMMENDED` (Python und `ts`-Registry), Text dazu in `BENCHMARK` (`HowItWorks.tsx`) | S5 |
| E16 | Abgabe-CSV: `Timestamp,Wind speed (m/s),Predicted`, Berlin-Zeit `YYYY-MM-DD HH:MM`, Messwerte unverändert, Vorhersage mit 3 Nachkommastellen, `Predicted` = 1 | GUI, Abgabeformat |
| E17 | Mindestens 1 Tag Zieldaten vor dem Ausfall (`MIN_TRAIN_STEPS`), sonst bricht die Analyse ab; unter 5 Tagen nur eine Warnung | S5, Plausibilitätswarnungen |

### Offene Fragen an die Organisatoren

1. Wie wird abgegeben: Link, HTML-Datei oder Ordner? Wird zusätzlich eine Vorhersage-CSV erwartet, und in welchem Format (Spalten, Zeitzone, Nachkommastellen; reicht E16)?
2. Zählt eine Web-App, die Python per WebAssembly im Browser ausführt, als „lokal im Browser“?
3. Auf welchen Rechnern prüft die Jury: Betriebssystem, Browser, Internetzugang?
4. Enthält die Testdatei auch Daten nach dem Ausfall, und dürfen wir sie zum Training nutzen? *Daten: ja, 04.–30.09.; ob wir sie nutzen dürfen, ist offen.*
5. Gibt es Koordinaten, Nabenhöhen, Turbinentypen, mehrere Referenzparks? *Daten: zwei Referenzparks (H, O) mit sieben Turbinen; keine Koordinaten, Nabenhöhen oder Typen.*
6. ~~Format der Leistungskurven~~ *Beantwortet durch die Daten: je Zielturbine eine xlsx-Datei, eine Kurve, kW.*
7. Mit welcher Leistungskurve und Turbinenzahl rechnet die Jury Leistungs-RMSE und Energieabweichung? Relativ oder absolut, über welchen Zeitraum?
8. Sind externe Daten erlaubt?
9. In welcher Sprache präsentieren wir?
10. Wie sehen die Zeitstempel der echten Dateien aus (Format, Zeitzone, Zeitumstellung am 25.10.), und können Messwerte negativ oder Platzhalter wie `-999` sein? *Daten: Excel-Datum ohne Zeitzone, Juli bis September ohne Zeitumstellung, keine negativen Werte. Offen: UTC oder Ortszeit?*
11. ~~Ist das Ziel im Test ein ganzer Park oder einzelne Turbinen?~~ *Beantwortet: drei einzelne Turbinen T1–T3, je eine Datei.*
12. Abgabe für drei Turbinen: eine Datei je Turbine oder eine gemeinsame, und im xlsx- oder CSV-Format? Wird der Energieverlust je Turbine oder für den Park bewertet?

### Quellen

- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
- [wetterdienst: DWD 10-Minuten-Beobachtungen](https://wetterdienst.readthedocs.io/en/latest/data/provider/dwd/observation/10_minutes.html)
- [Basse et al. 2021, Seasonal effects in the long-term correction of short-term wind measurements](https://doaj.org/article/bc7775ee1e2d4c98927c8d47be5b4fe8)
- [Sheppard 2009, Analysis of the measure-correlate-predict methodology](https://digitalcommons.humboldt.edu/etd/1023)
