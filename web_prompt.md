Du baust die Weboberfläche (T6) des Wind-Outage-Tools für die BayWa-r.e.-Challenge.
Die Oberfläche bringt 30 % der Punkte, die Erklärbarkeit der Methode weitere 20 %.

## Zuerst lesen
- CLAUDE.md und web/CLAUDE.md: Regeln, vor allem kein toter Code, keine toten Kommentare, kleine Lösungen
- SPEC.md: „Ziele und Leitprinzipien“, „S5 Engine-Kontrakt“, „S4 Energie“ (P10/P90-Konvention), „GUI-Anforderungen“
- CHALLENGE.md: Pflichtinhalte der GUI
- web/src/engine/contract.ts und fixtures/golden/identity/basic.json (so sieht eine echte Antwort aus)

## Deine Dateien
Du arbeitest nur in web/src/steps/, web/src/components/, web/src/state/, web/src/App.tsx, web/src/main.tsx
und web/src/index.css. Nicht ändern: web/src/engine/ (Engines, gehört PM), web/src/data/ (CSV-Import, parallel
in Arbeit), alles außerhalb von web/. Brauchst du dort etwas, schreib es als Wunsch auf, statt es selbst zu bauen.

## Datenquelle
`import { createEngine, requestedEngine, demoCase } from '@/engine'`.
- `createEngine(id?, onProgress?)` liefert `{ engine, fallback? }`. Ohne `id` gilt `?engine=py|ts` aus der URL,
  sonst `py`; die Einzeldatei (`--mode single`) kennt nur `ts`.
- `py` ist Python (windgap) in Pyodide in einem Web Worker. Der Kaltstart dauert ca. 3–4 s und meldet
  Fortschritt über `onProgress(msg, pct)`. Das braucht eine gestaltete Ladeanzeige; die Oberfläche bleibt
  währenddessen bedienbar (Upload, Outage).
- Scheitert `py`, übernimmt `ts` automatisch, und `fallback` enthält den Grund. Das muss sichtbar sein
  (z. B. Hinweis an der Engine-Anzeige), nicht nur in der Konsole.
- `ts` antwortet vorerst auf jede Anfrage mit dem Golden-Fixture; der echte TS-Port folgt, ohne dass sich
  deine Seite ändert.
- Engine-Schalter (py/ts) in der Fußzeile: erneut `createEngine(id)` aufrufen und die Analyse neu laufen lassen.
  `py` wird nur einmal geladen, ein Zurückschalten ist sofort da.
- `demoCase.request` ist der Datensatz für „Load demo data“, bis der CSV-Import fertig ist.
- web/src/App.tsx ist im Moment eine Debug-Seite des Python-Durchstichs; ersetze sie vollständig.
Die GUI rechnet nichts Fachliches selbst: keine Modelle, keine Energie, keine Metriken. Erlaubt sind
Anzeige-Ableitungen aus der Antwort, z. B. Stundenbalken aus Differenzen von cumulativeKwh.

## Bauen
1. MST-Root-Store in web/src/state/: Datensatz (AnalyzeRequest ohne model), Ausfall, gewähltes Modell, letzte
   AnalyzeResponse, Status (idle | running | error mit Meldung), aktiver Schritt. Aktionen: loadDataset,
   setOutage, selectModel, runAnalysis. Halte den Store klein; der CSV-Import wird später nur loadDataset aufrufen.
2. App-Shell: fünf Schritte als Stepper (Upload, Outage, Method, Results, Export); jeder Schritt erklärt in
   einem Satz, was er tut. Fußzeile mit aktiver Engine, Version und Rechenzeit (response.engine).
3. Gemeinsamer ECharts-Wrapper in components/charts/ (Resize, Theme, Dispose). Alle Charts nutzen ihn.
4. Schritte:
   - Upload: Drop-Zonen für Ziel, Referenz(en), Leistungskurve (vorerst nur Oberfläche) und „Load demo data“.
     Datenqualität: Zeitraum, Anzahl Werte, Lücken, Korrelation r (aus explanation.diagnostics, sobald da).
   - Outage: Zielpark und Referenzen übereinander, erkannter Ausfall farbig hinterlegt; Start und Ende per
     Ziehen (Brush) oder Datumsfeld änderbar.
   - Method: Modellauswahl (listModels), Formel per KaTeX, zwei Sätze Erklärung (summary), Streudiagramm
     Ziel gegen Referenz mit fitLine, gelernte Parameter, Korrelation r.
   - Results (wichtigster Schritt): vorhergesagter Wind mit 80-%-Band (q10–q90) im Ausfall plus echte Messungen
     davor und danach; Kennzahlenkarten aus `validation` (wind_rmse, wind_mae, power_rmse, energy_dev_pct,
     coverage_80, bias) mit Hinweis „backtest on your data, n_folds outages“; große kWh-Zahl P50 mit Spanne
     P10–P90 (Beschriftung „10 % / 90 % quantile“); kumulierte Verlustkurve und Energie je Stunde als Balken.
   - Export: CSV der Vorhersage (Zeit in Europe/Berlin und UTC, mean, q10, q90, Leistung, kWh) und Entwurf
     einer E-Mail an die Versicherung zum Kopieren (Zeitraum, Methode in einem Satz, kWh mit Spanne, Genauigkeit).

## Regeln
- Oberfläche auf Englisch. Zahlen immer mit Einheit (m/s, kW, kWh, %). Zeiten intern UTC (Epoch ms),
  angezeigt in Europe/Berlin über Intl.DateTimeFormat.
- Modern, kompakt, datendicht. shadcn-Komponenten per `npx shadcn@latest add <name>`, Tailwind-Tokens
  statt fester Werte.
- Leer-, Lade- und Fehlerzustände sind gestaltet; über 3 s Ladeanzeige mit Text; nie ein roher Stacktrace.
- Neue npm-Abhängigkeiten nur katex und shadcn-Komponenten, alles andere erst fragen. Kein CDN: windgap.html
  muss per Doppelklick offline laufen.

## Reihenfolge und Abnahme
Erst Store, Shell und ECharts-Wrapper, dann Results, Method, Outage, Upload, Export. Alle Befehle im
Projektordner. Nach jedem Schritt: `make test` und `make build` grün, Ansicht mit `make dev` im Browser prüfen
(beide Engines, `?engine=ts`), `dist/windgap.html` per Doppelklick öffnen und `make serve` für die Ordner-Variante
(http://localhost:8000). Nicht committen, bis wir es sagen.
 