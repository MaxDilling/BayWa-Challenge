# CLAUDE.md

Anleitung für Claude Code und andere Agenten in diesem Repository.

## Worum es geht

Ein Werkzeug für die BayWa-r.e.-Challenge (`CHALLENGE.md`): Es schätzt fehlende Windgeschwindigkeiten eines ausgefallenen Windparks aus einem Referenzpark und berechnet daraus den Energieverlust in kWh mit Unsicherheitsspanne. **`SPEC.md` ist die einzige Quelle der Wahrheit**, dort stehen Schnittstellen (S1–S5), ADRs, Modellleiter und Harness. Bei Widerspruch gilt SPEC.md; erst SPEC.md ändern, dann den Code.

Ausgeliefert wird eine statische Web-App. Der Rechenkern ist das Python-Paket `windgap`, das nativ in der Harness und im Browser über Pyodide läuft. Ein TypeScript-Port der Produktmodelle ist das Sicherheitsnetz.

Sprache: Code, Bezeichner, Kommentare und Oberfläche auf **Englisch**; SPEC.md und CLAUDE.md auf Deutsch. JSON an der Engine-Grenze in **camelCase**, Schlüssel in `validation`, `params` und `diagnostics` in snake_case.

## Befehle

```bash
make install     # uv sync + npm ci
make test        # pytest + vitest (inkl. windgap in Pyodide gegen die Golden-Fixtures)
make fixtures    # Golden-Fixtures neu schreiben (nach jeder Änderung an Modell, Energie, Metrik, engine.py)
make demo        # data/synthetic/demo_*.csv neu schreiben (Demo-Daten der GUI)
make harness     # Leaderboard aller Modelle über alle Datensätze aus configs/eval.yaml → runs/
make dwd         # data/dwd/<paar>/ von opendata.dwd.de laden (echte Stationspaare, nicht eingecheckt)
make predict TURBINES=4   # Abgabe-CSV aus data/challenge/ (target.csv, reference.csv, power_curve.csv) → predictions.csv
make dev         # Wheel bauen, Pyodide holen, Vite-Dev-Server
make build       # dist/windgap.html (Einzeldatei, ts) + dist/windgap-web/ (beide Engines)
make serve       # build + dist/windgap-web/ auf http://localhost:8000
make screenshots # build + screenshots/: alle Schritte (Desktop, Handy, dunkel), Upload-Fehler, Warnungen, How it works, py-Engine
make robustness  # build + realistische Uploads auf beiden Engines mit Zeiten (braucht make dwd)
uv run pytest tests/test_models.py -k identity   # einzelner Test
```

## Nicht verhandelbar

Versicherungen zahlen nach unseren Zahlen. Diese Regeln gehen jeder Bequemlichkeit vor:

- **Genauigkeit: Eine Variable hält genau den Wert, den ihr Name verspricht.** Nie einen plausiblen Ersatzwert unter falschem Namen schreiben. Beispiel hier: `p_mean_kw` ist E[P(v)] über die Vorhersageverteilung, nicht P(Mittelwert). Wer P(Mittelwert) braucht, legt eine eigene Spalte an. Fehlt ein Messwert, bleibt er NaN bzw. `null`. Eine Metrik, die sich nicht berechnen lässt, fehlt im Ergebnis, statt 0 oder NaN zu sein.
- **Ein Algorithmus, eine Stelle.** Metriken gibt es nur in `windgap/core/metrics.py`, Energie nur in `windgap/core/energy.py`, den Backtest-Fold nur in `windgap/backtest.py`. Harness, Engine und Notebook rufen dieselben Funktionen auf. Die einzige erlaubte zweite Implementierung ist die `ts`-Engine, und die muss die Golden-Fixtures exakt treffen.
- **Kein Datenleck.** `fit` sieht nur Daten vor dem Ausfall, `predict` nie das Ziel. Keine Normierung, Lag-Suche oder Parameterwahl über den ganzen Zeitraum oder auf dem Holdout.
- **Fallbacks brauchen ausdrückliche Freigabe.** Sie verstecken Fehler. Freigegeben ist nur der Engine-Wechsel `py` → `ts` (ADR-4). Kein `try/except`, das Fehler schluckt, kein stilles Auffüllen, kein altes Modell „zur Sicherheit“ neben dem neuen. Fehler sind laut; die GUI gestaltet den Fehlerzustand.
- **Kein Altcode, kein toter Code, keine toten Kommentare.** Kommentare beschreiben nur aktuelle Besonderheiten, nie frühere Versionen („früher…“, „jetzt nicht mehr…“). Nicht beschreiben, wo etwas steht, und nicht die nächste Zeile nacherzählen. **Ein behobener Bug ist keine Besonderheit:** Ist der Fehler unkritisch und kommt kaum wieder, ist die Erklärung nur Lärm, denn der Code enthält die Antwort schon. Ein Kommentar ist nur dann berechtigt, wenn er eine *plausible* falsche Änderung verhindert (z. B. „P10/P90 nehmen voll korrelierte Fehler an“ an `energy_loss`). Kein auskommentierter Code. Modellvarianten werden Parameter, keine kopierten Dateien. Ein Modell bleibt nur, solange es im Leaderboard eine Rolle hat (Baseline, Kandidat oder Benchmark).
- **Jede gesparte Zeile ist eine gute Zeile.** Kleine, gut geschnittene Lösungen; kein Boilerplate, kein ungefragter Umfang.
- **Bei jeder Änderung fragen: Was kostet sie an Laufzeit, was an Zeilen?** Grenzen: Harness-Lauf < 30 s, GUI-Lauf < 3 s, Pyodide-Kaltstart < 10 s. Neue Abhängigkeiten im Engine-Pfad (`windgap/`) nur nach Rückfrage: nur Pakete, die Pyodide mitliefert, und jedes kostet Kaltstartzeit. Versionen von numpy und pandas sind auf die von Pyodide 314.0.7 festgelegt; nie einzeln anheben.

Fehlen Daten oder würde eine Änderung den Datenfluss, eine Schnittstelle S1–S5 oder eine ADR berühren, **erst mit dem Team klären**. Dann zuerst SPEC.md ändern, dann beide Seiten.

## Tests

Getestet wird der algorithmische Kern, nicht die Oberfläche.

- `tests/` (pytest): Interface-Konformität jedes registrierten Modells, Energie, Raster, Engine. Erwartungswerte sind von Hand aus der Formel gerechnet und je Fall ein Assert.
- **Golden-Fixtures sind die Spezifikation der `ts`-Engine.** `fixtures/golden/<modell>/<fall>.json` enthält Anfrage und Antwort von `windgap`. `test_golden_fixtures_are_current` schlägt fehl, wenn sich ein Modell geändert hat, ohne dass jemand `make fixtures` laufen ließ. Fixtures im **selben Commit** neu schreiben und den Diff verstehen; nie nur neu schreiben, damit Tests grün werden.
- `web/` (vitest): `windgap` in Pyodide gegen `fixtures/golden/` (Toleranz 1e-12, wasm rechnet in den letzten Bits anders), `ts`-Engine gegen `fixtures/golden/` (Toleranz 1e-6), CSV-Import gegen `fixtures/csv/`. Hilfen in `web/src/test/golden.ts`.

## Architektur

> **Aktuell halten.** Wer Architektur oder Datenfluss ändert (Modul hinzu, Zuständigkeit verschoben, Schnittstelle geändert), aktualisiert diesen Index im **selben** Commit.

```
CSV ──web/src/data (Import, Raster, Ausfall)──▶ AnalyzeRequest ──Engine──▶ AnalyzeResponse ──▶ GUI-Schritte 1–5
                                                   │ py: Web Worker → Pyodide → windgap.engine.handle
                                                   │ ts: web/src/engine/ts (Port, Golden-Tests)
                                                   │ py scheitert beim Start → ts übernimmt (ADR-4)
harness (nativ) ──▶ windgap.backtest.fold ──▶ windgap.models.registry + windgap.core ──▶ runs/, Leaderboard
```

- **`windgap/core/`**: `schema.py` (S2-Datenklassen, Rasterkonstanten, `Z90`), `grid.py` (Grid ↔ pandas, `align`), `powercurve.py`, `energy.py` (S4: `expected_power` = E und SD der Leistung per Gauß-Hermite, `energy_loss` mit Band aus der Fehler-Autokorrelation des Modells), `metrics.py` (`evaluate` je Szenario inkl. Kalibrierung des Energiebands, `summarize` über Szenarien), `io.py` (CSV-Import für die Harness nach S1: `read_wind_csv(name, text)` → `[(Site, ImportReport)]`, `read_power_curve_csv(text)` → `PowerCurve`; Zwilling von `web/src/data/`, nimmt Text statt Pfad, Fehler sind `CsvError` mit Zeilennummer; `filled_target_csv` = Abgabeformat, Zwilling von `filled.ts`), `outage.py` (`detect_outages`, `fill_during_outage`; Zwilling von `outage.ts` und der Überbrückung in `toRequest`). Pyodide-sicher: keine Dateizugriffe, keine Threads.
- **`windgap/models/`**: `base.py` (`WindModel`-Protocol, `Explanation`, `Errors` + `calibrate` = σ und Fehlergedächtnis für jedes Modell, `pick_reference` = Wahl der Referenz bei mehreren (M7-light), `gaussian_prediction`), `registry.py` (`@register`; findet jedes Modul im Ordner automatisch; `info()` = ModelInfo, `RECOMMENDED` = Standardmodell der GUI), `identity.py` (Baseline), `linear.py` (`linear_regression`, `variance_ratio`, Lag als Parameter). Regeln: `windgap/models/CLAUDE.md`.
- **`windgap/backtest.py`**: `predict_window` (Vorhersage eines Fensters mit Referenz-Kontext davor und danach, für Engine und Folds), `fold` (ein simulierter Ausfall) und `backtest` (die Validierungsmetriken der Engine). Die Harness-Szenarien bauen auf `fold` auf.
- **`windgap/engine.py`**: `handle(json) -> json` und `list_models()`, Kontrakt S5. Erwartet vollständige Referenzen im Ausfall, weil Lücken beim Import gefüllt werden (ADR-5).
- **`harness/`**: nur nativ, nicht im Wheel. `__main__.py` (CLI, Ausgabe nach `runs/`), `run.py` (rollierende Szenarien über `fold`, Leaderboard und Score), `datasets.py` (Datensätze aus `configs/eval.yaml`: Synthetik oder Ordner mit Challenge-CSVs über `windgap.core.io`, optional `wind_scale`), `synthetic.py` (Paare mit bekannter Wahrheit, generische Leistungskurve), `fixtures.py` (schreibt die Golden-Fixtures und `fixtures/predict/demo.csv`), `demo.py` (schreibt die Demo-CSVs im Challenge-Format), `predict.py` (Abgabe-CLI, `make predict`: Dateien → `windgap.core.io`/`outage` → `windgap.engine.handle` je Ausfall → gefüllte Zielreihe), `dwd.py` (lädt fünf DWD-Stationspaare nach `data/dwd/`). Regeln: `harness/CLAUDE.md`.
- **`web/`**: Vite, React, TypeScript, shadcn/ui, Tailwind, ECharts, MobX State Tree. Regeln: `web/CLAUDE.md`.
  - `src/engine/contract.ts`: S5 auf TS-Seite. `src/engine/index.ts`: `createEngine(id?, onProgress?)` → `{ engine, fallback? }`, Auswahl über `?engine=`, `py` wird einmal geladen und gecacht, scheitert es, übernimmt `ts` und `fallback` nennt den Grund.
  - `src/engine/py/`: `worker.ts` lädt Pyodide aus `public/pyodide/`, numpy und pandas, entpackt `public/py/windgap.whl` und ruft `handle`/`list_models`; `pyEngine.ts` ist der Promise-Wrapper um den Worker.
  - `src/engine/ts/`: Port von `windgap`, eine Datei je Python-Modul (`frame.ts` ↔ grid/schema, `energy.ts`, `metrics.ts`, `backtest.ts`, `models/` mit `base.ts` (`calibrate`), `identity.ts`, `linear.ts`, `tsEngine.ts` ↔ engine.py). Modelle nur, wenn sie in `models/registry.ts` eingetragen sind; jedes braucht Golden-Fixtures.
  - `src/data/`: CSV-Import (T1, TS) nach S1, Zwilling von `windgap/core/io.py`: `csv.ts` (Tabelle mit Vorspann und Kopf, Zahlen, Datumsformate, Tag/Monat-Reihenfolge je Datei, Fehlwert-Tokens), `berlin.ts` (EU-Sommerzeitregel; doppelte Stunde nach Reihenfolge), `wind.ts` (`parseWindCsv` → eine `WindSeries` je Windspalte), `powerCurve.ts` (`turbineCount`: Anzahl aus Dateiname oder Kopf), `assign.ts` (`assignFiles(files)` → `{ series, targetCandidates, target?, powerCurve?, turbines?, errors }` für mehrere auf einmal abgelegte Dateien), `outage.ts` (Ausfälle ≥ 3 Schritte, sonst Messlücken; vor dem ersten Zielwert zuletzt), `filled.ts` (`filledTargetCsv`: Abgabeformat), `dataset.ts` (`buildDataset`, `toRequest` mit Überbrückung kurzer Referenzlücken im Ausfall), `checks.ts` (`plausibility`: Datenwarnungen), `demo.ts` (lädt `data/synthetic/demo_*.csv` über denselben Weg). Fehler sind `ImportError` mit Zeilennummer.
  - `src/state/store.ts`: MST-Store; rechnet erst nach bestätigter Turbinenzahl (`turbinesConfirmed`), dann bei neuen Daten, Ausfall oder Engine alle Modelle (gewähltes zuerst) für die Vergleichstabelle, ein Modellwechsel schaltet nur die Ansicht.
  - `src/components/`: `format.ts` (Zeit in Europe/Berlin, Zahlen; `fmtAmount` für jede kWh- und kW-Zahl), `metrics.ts` (Namen, Erklärungen und Sätze zu `validation` und Energie für Results, Method, Export), `Warnings.tsx` (Warnungen und das Banner oben in Results), `HowItWorks.tsx` (Sheet im Kopf: Methode in drei Schritten und `BENCHMARK`, das Harness-Ergebnis hinter der Empfehlung), `charts/` (ECharts-Wrapper), `ui/` (shadcn).
  - `scripts/screenshots.mjs`: Playwright klickt die Demo durch alle Schritte (auch per Ablagezone mit Turbinen-Entscheidung und mit Daten, die Warnungen auslösen) und legt Bilder in `screenshots/` (nicht eingecheckt); Konsolenfehler lassen es scheitern.
  - `scripts/robustness.mjs` (`make robustness`): realistische Uploads über die Ablagezone auf beiden Engines (DWD-Paar mit 24 h Lücke, deutsches Format, Park als eine Datei mit mehreren Turbinen, ein Jahr 10-Minuten-Daten), misst Import, Ergebnis und Methodenvergleich; Konsolenfehler, NaN oder Analysefehler lassen es scheitern.
  - `scripts/fetch-pyodide.mjs`: kopiert Pyodide aus `node_modules` und lädt die Wheels von numpy und pandas samt Abhängigkeiten (sha256 gegen die Lock-Datei) nach `public/pyodide/`. `PACKAGES` dort = Abhängigkeiten von `windgap`.
- **`.github/workflows/pages.yml`**: bei Push auf `main` `make install test build`, dann `dist/windgap-web/` auf GitHub Pages.
- **`fixtures/`**: eingecheckt. `golden/` und `models.json` (ModelInfo-Liste) von Python erzeugt; `csv/` sind Import-Fälle für beide Importe (vitest und `tests/test_io.py`): `<fall>.expected.json` ist eine Liste von Reihen `{id, grid, report}`, bei `curve_*` eine Leistungskurve `{windMs, powerKw}`, oder `{error}` mit einem Teil der Meldung. Erwartungen sind unabhängig mit pandas (`read_csv`, `tz_localize(..., ambiguous="infer")`) berechnet, nie mit dem Import selbst. `outage/cases.json` (von Hand) prüft Ausfallerkennung und Überbrückung in TS und Python; `predict/demo.csv` schreibt `make fixtures` über `harness.predict`, der GUI-Export der Demo muss es Byte für Byte treffen.
- **`data/challenge/`** ist nicht eingecheckt, solange nicht geklärt ist, ob die Challenge-Daten öffentlich sein dürfen. `data/dwd/` ist nicht eingecheckt; `make dwd` lädt es reproduzierbar.

## Arbeiten im Team

Drei Menschen und mehrere Agenten arbeiten parallel. Jedes Teilprodukt (T1–T6 in SPEC.md) hat eine verantwortliche Person. Ein Agent arbeitet in den Dateien seines Teilprodukts und ändert fremde Dateien nur nach Rückfrage. Kleine Commits, `make test` vor jedem Push.
