# Wind-Outage Tool – Spezifikation

Oct 23, 2026 · @Max Dillinger

## Zweck dieses Dokuments

Dieses Dokument ist die einzige Quelle der Wahrheit für Menschen und KI-Agenten. Jeder Agent bekommt den Abschnitt „Leitprinzipien“, „Architekturentscheidungen“, „Schnittstellen“ und den Abschnitt seines Teilprodukts als Kontext.

- Änderungen an Schnittstellen nur nach Absprache im Team, dann zuerst hier, dann im Code.
- Mit **\[offen\]** markierte Punkte werden morgen früh mit den Organisatoren geklärt.

## Ziele und Leitprinzipien

Ziel ist, in allen vier Kriterien vorne zu liegen: Modellgenauigkeit 40 %, User Experience 30 %, Lösungskonzept 20 %, Präsentation 10 %. Bei Konflikten gilt laut Aufgabe: Erklärbarkeit vor Genauigkeit.

1. **Erklärbar in zwei Sätzen.** Jedes Modell, das wir in der GUI anbieten, muss sich mit einer Formel und zwei Sätzen erklären lassen. Schwer erklärbare Modelle (z. B. Gradient Boosting) dienen nur als Benchmark: „Was lassen wir liegen?“
2. **Energie ist das Endprodukt.** Bewertet werden Wind, Leistung und Energiesumme. Fehler im steilen Teil der Leistungskurve (ca. 4–12 m/s) zählen viel mehr als Fehler bei 2 oder 20 m/s.
3. **Bias ist der Hauptfeind der Energiesumme.** Zufällige Fehler mitteln sich über den Ausfall heraus, ein systematischer Versatz nicht.
4. **Unsicherheit wird immer mitgeliefert.** Jede Vorhersage hat ein Band, jede kWh-Zahl eine Spanne (P10/P50/P90). Das ist für Versicherungen der eigentliche Mehrwert.
5. **Schnelle Iteration.** Ein kompletter Harness-Lauf über alle Modelle dauert unter 30 Sekunden.
6. **Bewertung ist Konfiguration.** Metriken und Gewichtung stehen in einer Datei, nicht im Code, weil wir das Testformat erst morgen kennen.
7. **Kontrakt zuerst.** Schnittstellen stehen fest, bevor implementiert wird. Jeder kann gegen Mocks arbeiten.

## Architekturentscheidungen

Ausgeliefert wird eine statische Web-App ohne Server. Der Rechenkern ist das Python-Paket `windgap`, das im Browser über Pyodide (WebAssembly) läuft. Ein TypeScript-Zwilling der Produktmodelle ist das Sicherheitsnetz. Die GUI wechselt per Schalter zwischen beiden.

| # | Entscheidung | Begründung |
| --- | --- | --- |
| ADR-1 | Python 3.14 für Modelle, Energie und Harness (pandas, numpy, scipy, scikit-learn, statsmodels; Paketverwaltung mit `uv`). Im Engine-Pfad nur Pakete, die Pyodide bereitstellt; keine Dateizugriffe, keine Threads. Pyodide `314.0.7` (Python 3.14.2, numpy 2.4.6, pandas 3.0.2), exakt festgelegt in `web/package.json`. Das native venv nutzt dieselben numpy- und pandas-Versionen (`pyproject.toml`), damit Harness und Browser identisch rechnen; bei einem Pyodide-Update beide Stellen gemeinsam ändern. Abhängigkeiten von `windgap` heute: nur numpy und pandas; jedes weitere Paket verlängert den Kaltstart | Mathe-Studierende arbeiten direkt darin; derselbe Code läuft in Harness und Browser |
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

- **Winddaten:** CSV mit Zeitstempel (Europe/Berlin) und Windgeschwindigkeit (m/s). Parser erkennt Trennzeichen (`,` oder `;`), Dezimalkomma, Spaltennamen und Datumsformat automatisch. Doppelte Stunde bei Zeitumstellung: Reihenfolge entscheidet (erste = Sommerzeit); Zeiten in der übersprungenen Frühlingsstunde sind ein Fehler. Zeitstempel mit Offset (`Z`, `+02:00`) gelten wie angegeben. Fehlwerte: leer, `NaN`, `NA`, `null`, `-`; negative Werte (z. B. `-999`) gelten als fehlend und werden gezählt. Referenzlücken im Ausfall bis 6 Schritte (1 h) überbrückt der Import linear, längere sind ein Fehler.
- **Leistungskurve:** CSV mit `wind_speed_ms` und `power_kw`. Lineare Interpolation, 0 kW unterhalb des ersten und oberhalb des letzten Punkts (Abschaltgeschwindigkeit). Optional `n_turbines` je Park. **\[offen\]** Format der echten Kurven.

### S2 Internes Datenformat (T1)

```python
@dataclass
class Site:
    site_id: str
    wind: pd.Series          # UTC-DatetimeIndex, freq="10min", NaN = fehlt
    extra: pd.DataFrame | None = None   # Temperatur, Druck ... (Bonus 2)
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

Ausfallerkennung: zusammenhängende NaN-Blöcke im Ziel von mindestens 3 Zeitschritten (30 min), in denen die Referenz Werte hat. Kürzere Lücken werden als Messlücken markiert, nicht als Ausfall.

### S3 Modell-Interface (T2)

```python
class WindModel(Protocol):
    name: str                # eindeutig, z. B. "variance_ratio"
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

Regeln: `fit` sieht nur Daten vor dem Ausfall (außer im Modus `train_on="both"`). `predict` darf nur `refs` und `extra` verwenden, nie das Ziel. Vorhersagen sind nach unten auf 0 begrenzt.

### S4 Energie (T4)

```python
def expected_power(pred: pd.DataFrame, curve: PowerCurve) -> pd.DataFrame
    # Spalten: p_mean_kw, p_q10_kw, p_q90_kw
def energy_loss(power: pd.DataFrame, outage: Outage) -> EnergyResult
    # kwh_p50, kwh_p10, kwh_p90, cumulative (Zeitreihe)
```

Energie je Zeitschritt = Leistung (kW) × 1/6 h.

- `p_mean_kw` ist E[P(v)] mit v ~ N(mean, std²), Gauß-Hermite mit 20 Stützstellen. `p_q10_kw`/`p_q90_kw` sind P(q10)/P(q90).
- **Konvention:** P10 = 10-%-Quantil (niedriger Wert), P90 = 90-%-Quantil (hoher Wert), wie `q10`/`q90`. In Windgutachten heißt der *konservative* Wert oft „P90“ (Überschreitungswahrscheinlichkeit); im Bericht deshalb immer „10 % / 90 % Quantil“ dazuschreiben.
- `kwh_p10`/`kwh_p90` summieren die Quantile je Zeitschritt, nehmen also voll korrelierte Fehler an (breites Band, passt zu „Bias ist der Hauptfeind“). Ob ein schmaleres Band aus den Backtest-Residuen besser kalibriert ist, prüft die Harness.
- Metriken gibt es nur einmal: `windgap/core/metrics.py` (`evaluate`). Engine-Validierung und Harness rufen dieselbe Funktion.

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

interface ModelInfo { name: string }

interface AnalyzeRequest {
  target: Grid;
  references: { id: string; grid: Grid }[];        // im Ausfall lückenlos (Import füllt), sonst Fehler
  powerCurve: { windMs: number[]; powerKw: number[]; nTurbines: number };
  outage: { startMs: number; endMs: number };      // endMs exklusiv
  model: string;                                   // Registry-Name, z. B. "variance_ratio"
  params?: Record<string, number | string>;
}

interface AnalyzeResponse {
  prediction: { t0: number; stepS: 600; mean: number[]; q10: number[]; q90: number[] };
  validation: Record<string, number>;              // wind_rmse, power_rmse, energy_dev_pct, coverage_80 ...
  explanation: { summary: string; formula: string;
                 params: Record<string, number>; diagnostics: Record<string, number> };
  energy: { kwhP10: number; kwhP50: number; kwhP90: number; cumulativeKwh: number[] };
  scatter: { ref: number[]; target: number[]; fitLine: [number, number][] }; // max. 2000 Punkte
  engine: { id: "py" | "ts"; version: string; ms: number };
}
```

**Python-Seite:** eine reine Funktion `windgap.engine.handle(request_json: str) -> str` mit genau diesem JSON (Feldnamen in camelCase an der Grenze). Der Worker lädt Pyodide, installiert `windgap` als Wheel und ruft `handle` auf. Nativ ruft dieselbe Funktion die Fixtures-Erzeugung auf.

**Aus der Antwort abgeleitet, unabhängig von der Engine:** CSV-Export der Vorhersage und Berichtstext (Bonus 1) baut die GUI selbst.

**Regeln an der Grenze:** JSON kennt kein NaN. Fehlende Messwerte sind `null`; eine nicht berechenbare Kennzahl fehlt in `validation`/`params`/`diagnostics`, statt NaN oder 0 zu sein. `validation` ist der Backtest von `windgap.backtest.backtest`: bis zu 5 simulierte Ausfälle in Länge des echten Ausfalls, rückwärts vom Trainingsende, Mittelwert je Metrik (`energy_dev_pct` als Betrag), dazu `n_folds`. `scatter.fitLine` ist die In-Sample-Vorhersage, gemittelt je 1-m/s-Klasse der Referenz; das funktioniert auch für Lag- und Tageszeitmodelle. Ausdünnung auf 2000 Punkte deterministisch über Index `floor(i · n / k)`.

**Dummy-Modell für den ersten Durchstich:** `identity` (Ziel = Referenz, σ konstant 1 m/s). Es existiert in beiden Engines und liefert eine vollständige `AnalyzeResponse`, damit jede Ansicht der GUI ab heute Abend mit echten Strukturen gefüllt ist.

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
| M7 | Mehrere Referenzen | Gewichtete Kombination der Einzelmodelle, Gewicht ∝ 1/Validierungsfehler² | Bonus 3, automatische Turbinenauswahl |

**Kernfrage für die Harness: LR oder VR?** LR liefert den bedingten Erwartungswert und minimiert damit den Wind-RMSE. Weil sie die Streuung verringert, unterschätzt sie aber Spitzen. Die Leistungskurve ist im Teillastbereich konvex, deshalb kann das die Energie verzerren. VR erhält die Verteilung, hat dafür einen höheren Punktfehler. In der Literatur gilt VR als robusteste Standardmethode bei Korrelation r > 0,8, und LR und VR zeigen gegenläufige systematische Fehler ([Sheppard 2009](https://digitalcommons.humboldt.edu/etd/1023), [Basse et al. 2021](https://doaj.org/article/bc7775ee1e2d4c98927c8d47be5b4fe8)).

**Hypothese, die beides verbindet:** Wind mit LR vorhersagen (bester Wind-RMSE), Leistung aber als Erwartungswert über die Vorhersageverteilung berechnen, nicht als P(Mittelwert):

```latex
\hat{P}_t = \mathbb{E}\left[P(v)\right], \quad v \sim \mathcal{N}(\hat{\mu}_t, \hat{\sigma}_t^2)
```

Das holt die von LR weggenommene Streuung zurück und minimiert zugleich den Leistungs-RMSE. Numerisch mit Gauß-Hermite-Quadratur (ca. 20 Stützstellen), in einer Zeile erklärbar. Die Harness vergleicht beide Varianten.

**Unsicherheit:** σ kommt aus den Residuen der Backtests, nicht aus der Trainingsanpassung. Erste Version konstant, zweite Version abhängig von v\_r (Residuen-Streuung je Geschwindigkeitsklasse). Ziel: das 80-%-Band enthält in den Backtests ca. 80 % der echten Werte; die Harness misst diese Abdeckung.

**Trainingsfenster:** Standard sind alle Daten vor dem Ausfall. Als Parameter testen: nur die letzten N Tage, oder exponentiell abklingende Gewichte, weil jüngere Wetterlagen ähnlicher sind.

## Harness

Die Harness simuliert hunderte künstliche Ausfälle im Trainingszeitraum und bewertet jedes Modell darauf genau so, wie die Jury es morgen tut. Ein Befehl, unter 30 Sekunden, Ergebnis als Leaderboard.

```bash
uv run python -m harness --config configs/eval.yaml --models all
```

**Szenarien (rollierender Ursprung):**

1. Ausfallbeginn t₀ wandert in Schritten von z. B. 6 h durch die Daten, frühestens nach 5 Tagen Trainingsdaten.
2. Je t₀ mehrere Ausfalllängen: 1 h, 6 h, 12 h, 24 h, 48 h, 72 h, 5 Tage (konfigurierbar).
3. Das Modell trainiert nur auf Daten vor t₀ und sagt den Zeitraum \[t₀, t₀ + L) vorher.
4. Die letzten ca. 5 Tage sind ein gesperrter Holdout, der nur für finale Entscheidungen läuft, damit wir nicht auf die Szenarien überanpassen.

**Fallen, die die Harness verhindern muss:** keine Normierung oder Lag-Suche über den gesamten Zeitraum; keine Parameterwahl auf dem Holdout; Gleitmittel der Referenz nur rückwärts gerichtet, außer wir entscheiden bewusst, dass die ganze Referenzreihe während des Ausfalls verfügbar ist (sie ist es, deshalb erlaubt, aber dokumentiert).

**Metriken** (Definition in `windgap/core/metrics.py`, Auswahl und Gewichte in `configs/eval.yaml`). Jedes Szenario läuft über `windgap.backtest.fold`, damit Harness und GUI dasselbe messen:

| Metrik | Definition |
| --- | --- |
| `wind_rmse`, `wind_mae` | m/s, über alle Zeitschritte im Ausfall |
| `power_rmse`, `power_mae` | kW, nach Anwendung der Leistungskurve |
| `energy_dev_pct` | (Summe vorhergesagt − Summe echt) / Summe echt, je Szenario, dann Betrag gemittelt |
| `bias` | mittlerer Windfehler, m/s |
| `coverage_80` | Anteil echter Werte im 80-%-Band |
| `score` | gewichtete Summe normierter Metriken, Gewichte in der Konfiguration |

**Ausgabe:** `runs/<zeit>_<commit>/results.parquet` (ein Datensatz je Modell × Szenario), `leaderboard.csv`, und eine Zusammenfassung im Terminal. Ergebnisse lassen sich nach Ausfalllänge und Windklasse aufschlüsseln.

**Diagnose-Notebook `notebooks/diagnose.ipynb`** für menschliches Debugging: Überlagerung echt/vorhergesagt für ein wählbares Szenario; Streudiagramm Ziel gegen Referenz mit Modellgeraden; Residuen gegen Referenzwind, gegen Uhrzeit und gegen Ausfalllänge; Fehlerbeitrag zur Energie je Windklasse. Diese Ansichten zeigen, warum ein Modell an einem Tag versagt, und sind wichtiger als eine Karte.

**Testdaten für heute Abend:** ein Generator für synthetische Paare (Weibull-verteilter Wind, Korrelation ca. 0,85, Lag 20 min, Tagesgang, Rauschen) mit bekannter Wahrheit, plus 2–3 echte Stationspaare vom DWD (siehe Externe Daten). Damit läuft die ganze Kette, bevor die echten Daten da sind.

## GUI-Anforderungen

Die GUI führt in fünf Schritten von den Dateien zur kWh-Zahl. Jede Pflichtanforderung der Aufgabe hat einen festen Platz. Sprache der Oberfläche: Englisch, weil die Challenge auf Englisch gestellt ist. **\[offen\]** Sprache der Jury.

1. **Upload:** Drag-and-drop für Ziel, Referenz(en) und Leistungskurve; Button „Load demo data“. Sofortige Prüfung mit Datenqualität (Zeitraum, Anzahl Werte, Lücken, Korrelation).
2. **Outage:** Zeitreihen beider Parks übereinander, erkannter Ausfall farbig hinterlegt. Start und Ende per Ziehen oder Datumsfeld anpassen.
3. **Method:** Modellauswahl mit Empfehlung, Formel, zwei Sätzen Erklärung, Streudiagramm Ziel gegen Referenz mit Modellgerade, gelernte Parameter, Korrelation r.
4. **Results:** vorhergesagter Wind mit 80-%-Band im Ausfall, angrenzende echte Messungen davor und danach; Kennzahlenkarten mit Genauigkeit aus dem Backtest; Energieverlust in kWh mit P10/P50/P90; kumulierte Verlustkurve und Leistung je Zeitschritt.
5. **Export:** CSV der Vorhersage, Bericht als E-Mail-Entwurf zum Kopieren (Bonus 1).

| Pflicht laut Aufgabe | Wo in der GUI |
| --- | --- |
| Accuracy metrics | Schritt 4, Kennzahlenkarten (RMSE, MAE, Energieabweichung, Abdeckung) mit Hinweis „aus Backtest auf euren Daten“ |
| Wind speed visualization | Schritt 4, Zeitreihe mit Band |
| Prediction method | Schritt 3, Formel, Erklärung, Streudiagramm, Vergleich mit Alternativmodellen aus der Harness |
| Energy loss calculation | Schritt 4, große kWh-Zahl mit Spanne |
| Energy loss visualization | Schritt 4, kumulierte Kurve und Balken je Stunde |

**UX-Regeln:** Jeder Schritt zeigt in einem Satz, was er tut. Ein Lauf darf höchstens 3 Sekunden dauern, sonst Ladeanzeige mit Text. Zahlen immer mit Einheit. Leere und Fehlerzustände sind gestaltet, nicht rohe Stacktraces.

**Karte:** nur als optionales Modul, falls morgen Koordinaten vorliegen. Die Debugging-Ansichten für die Modellarbeit liegen im Diagnose-Notebook, nicht in der Produkt-GUI.

## Externe Daten und Vortraining

Empfehlung: externe Daten heute als realistische Testpaare für die Harness nutzen, nicht für ein Vortraining des Modells. Der Zusammenhang zwischen zwei Windparks ist ortsspezifisch, und 30 Tage à 144 Werte (ca. 4300 Paare) reichen für Modelle mit 2–10 Parametern völlig aus. Vortraining lohnt sich nur für datenhungrige ML-Modelle, die wir aus Erklärbarkeitsgründen ohnehin nicht einsetzen.

| Quelle | Was | Auflösung | Nutzen für uns |
| --- | --- | --- | --- |
| [DWD Open Data, 10-Minuten-Wind](https://wetterdienst.readthedocs.io/en/latest/data/provider/dwd/observation/10_minutes.html) | Mittlere Windgeschwindigkeit (m/s) und Richtung je 10 min, viele Stationen in Deutschland, frei nutzbar mit Quellenangabe | 10 min, Messhöhe meist ca. 10 m statt Nabenhöhe | Hoch: viele echte Stationspaare als Testfälle; Python-Paket `wetterdienst` lädt sie direkt |
| [Open-Meteo Historical API (ERA5)](https://open-meteo.com/en/docs/historical-weather-api) | Wind in 10 m und 100 m, Temperatur, Druck, Richtung; ohne Schlüssel für nicht-kommerzielle Nutzung | stündlich, ca. 25 km Raster, ca. 5 Tage Verzögerung | Mittel: Zusatzparameter für Bonus 2, aber nur mit Koordinaten der Parks |

**Abgestufter Nutzen:**

1. **Testbett (hoch, heute):** 3–5 DWD-Stationspaare mit 20–60 km Abstand laden. Damit prüfen wir, ob unsere Modellrangfolge stabil ist oder nur auf einem Datensatz gut aussieht.
2. **Vorwissen (mittel):** typische Lags, Tagesgang, ob VR oder LR besser abschneidet. Liefert gute Startwerte und Argumente für die Präsentation.
3. **Zusatzregressoren (Bonus 2):** Temperatur und Druck aus ERA5 am Standort, als Proxy für Stabilität. Nur wenn morgen Koordinaten vorliegen, und nur wenn die Harness einen Gewinn zeigt.
4. **Vortraining eines Modells (niedrig):** nicht empfohlen.

**\[offen\]** Sind externe Daten laut Regeln erlaubt? Liegen Koordinaten, Nabenhöhen oder Turbinentypen vor?

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

**Testplan heute Abend:**

- [ ] `windgap.html` per Doppelklick, WLAN aus: Windows und macOS; Chrome, Firefox, Edge bzw. Safari
- [ ] `windgap-web/` über GitHub Pages: gleiche Browser, Kaltstart- und Warmstartzeit von Pyodide messen
- [ ] Engine-Schalter: identische Ergebnisse in `py` und `ts` für das Dummy-Modell
- [ ] Rückfall: Pyodide-Dateien absichtlich entfernen, App muss auf `ts` wechseln und das anzeigen

**Entscheidungsregel:** Standard-Engine ist `py`, wenn der Kaltstart unter 10 Sekunden liegt und alle Tests grün sind. Sonst ist `ts` Standard, und `py` bleibt als Nachweis „der Browser rechnet mit demselben Kern wie unsere Harness“.

## Repo, heute Abend, morgen früh

Heute Abend steht die komplette Kette einmal durch, mit synthetischen Daten und einfachen Modellen. Morgen tauschen wir nur noch Daten und verbessern Modelle.

### Repo-Struktur

```
CLAUDE.md  SPEC.md  CHALLENGE.md  Makefile  pyproject.toml  uv.lock
windgap/                    Python-Kern, Pyodide-kompatibel, einziger Inhalt des Wheels
  core/      schema.py  grid.py  powercurve.py  energy.py  metrics.py  (io.py  outage.py)
  models/    CLAUDE.md  base.py  registry.py  identity.py  (linear.py  variance_ratio.py ...)
  backtest.py               fold() + backtest(), gemeinsam für Engine-Validierung und Harness
  engine.py                 handle(request_json) -> response_json, list_models()
harness/                    nur nativ: CLAUDE.md  synthetic.py  fixtures.py  demo.py  (scenarios.py  run.py  dwd.py  benchmarks/)
tests/                      pytest
fixtures/
  golden/<modell>/<fall>.json   AnalyzeRequest + Antwort von windgap, Spezifikation der ts-Engine
  csv/                          Parser-Fälle für TS- und Python-Import, je mit *.expected.json
configs/     eval.yaml
data/        synthetic/  dwd/  challenge/ (nicht eingecheckt, bis geklärt ist, ob öffentlich erlaubt)
notebooks/   diagnose.ipynb
runs/        Harness-Ergebnisse, nicht eingecheckt
web/                        Vite + React + shadcn (Nova/Radix) + Tailwind v4 + ECharts + MST, CLAUDE.md
  src/engine/  contract.ts (S5)  index.ts (createEngine)  py/ (Worker)  ts/ (Port)
  src/data/    CSV-Import, Zeitumstellung, Ausfallerkennung, Request-Bau, Demo-Daten (TS)
  scripts/     fetch-pyodide.mjs
  src/state/   MST-Stores
  src/steps/   Upload, Outage, Method, Results, Export
  src/components/  charts/ (ECharts-Wrapper)  ui/ (shadcn)
  public/pyodide/  Pyodide-Dateien, nicht eingecheckt, per Skript geholt
  public/py/       Wheel von `make wheel`, nicht eingecheckt
dist/        windgap.html  windgap-web/   (von `make build`)
```

In Klammern: geplant, noch nicht angelegt. Leere Platzhalterdateien gibt es nicht.

### Aufgaben heute Abend

- [x] PM: Repo, `uv`-Projekt, Makefile (`make dev`, `make test`, `make build`), `SPEC.md` + `CLAUDE.md` aus diesem Dokument
- [x] PM: Engine-Interface und Typen (S5) in TS und Python, `identity` in Python, Golden-Fixtures
- [x] PM: `ts`-Engine mit Dummy-Modell `identity`, Golden-Test gegen `fixtures/golden/` (trifft auf 1e-12)
- [x] PM: **Durchstich Python im Browser:** Pyodide im Worker, `windgap` als Wheel laden, `identity` auf Demo-Daten. Gemessen (headless Chromium, lokal): Kaltstart 3,3–3,4 s, `analyze` 40–80 ms; Ergebnis gleich dem nativen bis 1e-12 (vitest). Rückfall auf `ts` getestet bei fehlendem Pyodide und fehlendem Wheel. Diagramm folgt mit der GUI
- [ ] PM: GUI-Gerüst mit fünf Schritten, Engine-Schalter und automatischem Rückfall
- [x] PM: CSV-Import (TS) mit Zeitumstellung und Ausfallerkennung, mit Tests gegen `fixtures/csv/`; Demo-Daten `data/synthetic/` (`make demo`)
- [ ] Python-Import `windgap/core/io.py` für die Harness, besteht dieselben `fixtures/csv/`
- [ ] PM: Build beider Varianten, GitHub-Pages-Deploy per GitHub Action
- [ ] Mathe A: MCP-Grundlagen lesen (LR vs. VR), M0–M2 gegen das Interface S3, Erklärtexte, Fixture je Modell
- [x] Synthetik-Generator (`harness/synthetic.py`), Metriken (`windgap/core/metrics.py`), Backtest-Fold (`windgap/backtest.py`)
- [ ] Mathe B: Szenarien, `configs/eval.yaml`, Leaderboard-CLI
- [x] Leistungskurve und Erwartungswert der Leistung (S4), erste Version
- [ ] Mathe B: 3–5 DWD-Stationspaare laden
- [ ] Alle: Testplan aus „Auslieferung“ auf allen drei Laptops

### Erste Stunde morgen

1. Fragen an die Organisatoren klären (unten).
2. Echte Daten in `data/challenge/`, Harness laufen lassen, Leaderboard anschauen.
3. Danach gemeinsam entscheiden, welche Modellstufen sich lohnen.

### Offene Fragen an die Organisatoren

1. Wie wird abgegeben: Link, HTML-Datei oder Ordner? Oder nur eine Vorhersage-CSV? Welches Format, welche Zeitstempel?
2. Zählt eine Web-App, die Python per WebAssembly im Browser ausführt, als „lokal im Browser“?
3. Auf welchen Rechnern prüft die Jury: Betriebssystem, Browser, Internetzugang?
4. Enthält die Testdatei auch Daten nach dem Ausfall, und dürfen wir sie zum Training nutzen?
5. Gibt es Koordinaten, Nabenhöhen, Turbinentypen, mehrere Referenzparks?
6. Format der Leistungskurven: je Turbine oder je Park, wie viele Turbinen?
7. Mit welcher Leistungskurve rechnet die Jury Leistungs-RMSE und Energieabweichung? Relativ oder absolut?
8. Sind externe Daten erlaubt?
9. In welcher Sprache präsentieren wir?

### Quellen

- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
- [wetterdienst: DWD 10-Minuten-Beobachtungen](https://wetterdienst.readthedocs.io/en/latest/data/provider/dwd/observation/10_minutes.html)
- [Basse et al. 2021, Seasonal effects in the long-term correction of short-term wind measurements](https://doaj.org/article/bc7775ee1e2d4c98927c8d47be5b4fe8)
- [Sheppard 2009, Analysis of the measure-correlate-predict methodology](https://digitalcommons.humboldt.edu/etd/1023)
