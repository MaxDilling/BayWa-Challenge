Du baust die Weboberfläche (T6) des Wind-Outage-Tools für die BayWa-r.e.-Challenge.
Die Oberfläche bringt 30 % der Punkte, die Erklärbarkeit der Methode weitere 20 %.

## Zuerst lesen
- CLAUDE.md und web/CLAUDE.md: Regeln, vor allem kein toter Code, keine toten Kommentare, kleine Lösungen
- SPEC.md: „Ziele und Leitprinzipien“, „S5 Engine-Kontrakt“, „S4 Energie“ (P10/P90-Konvention), „GUI-Anforderungen“
- CHALLENGE.md: Pflichtinhalte der GUI
- web/src/engine/contract.ts (Engine, AnalyzeResponse) und web/src/data/index.ts (Import-API)

## Deine Dateien
Du arbeitest nur in web/src/steps/, web/src/components/, web/src/state/, web/src/App.tsx, web/src/main.tsx
und web/src/index.css. Nicht ändern: web/src/engine/ (Engines) und web/src/data/ (Import), alles außerhalb
von web/. Brauchst du dort etwas, schreib es als Wunsch auf, statt es selbst zu bauen.

## Daten: Import (`@/data`)
- `parseWindCsv(id, text)` liest eine Wind-CSV in jedem gängigen Format (Trennzeichen, Dezimalkomma,
  deutsches oder ISO-Datum, Europe/Berlin inkl. Zeitumstellung) und liefert `WindSeries` mit `grid`
  (UTC, 10 min, null = fehlt) und `report` (rows, measured, missing, negative, ignoredColumns).
- `parsePowerCurveCsv(text)` liefert die Leistungskurve je Turbine.
- `buildDataset(target, references, powerCurve, nTurbines)` liefert `Dataset` inkl. erkannter `outages`
  (längster zuerst, Typ `Span` mit startMs/endMs exklusiv) und kurzer Messlücken `gaps`.
- `toRequest(dataset, outage, model)` baut den `AnalyzeRequest`. Kurze Referenzlücken im Ausfall werden
  überbrückt; ist das nicht möglich, wirft es `ImportError`.
- Alle Import-Fehler sind `ImportError` mit einer Meldung für Menschen (mit Zeilennummer). Zeige sie
  gestaltet an der richtigen Drop-Zone an, nie als Stacktrace.
- `loadDemo()` liefert ein fertiges `Dataset` (Oktober 2026, ein 30-h-Ausfall) für „Load demo data“.
- Drag-and-drop: `await file.text()`, dann `parseWindCsv(file.name ohne Endung, text)`.

## Daten: Engine (`@/engine`)
- `createEngine(id?, onProgress?)` liefert `{ engine, fallback? }`. Ohne `id` gilt `?engine=py|ts` aus der URL,
  sonst `py`; die Einzeldatei (`--mode single`) kennt nur `ts`.
- `py` ist Python (windgap) in Pyodide in einem Web Worker. Der Kaltstart dauert ca. 3–4 s und meldet
  Fortschritt über `onProgress(msg, pct)`. Das braucht eine gestaltete Ladeanzeige; die Oberfläche bleibt
  währenddessen bedienbar (Upload, Outage).
- `ts` ist der TypeScript-Port, sofort bereit und rechnet identisch.
- Scheitert `py`, übernimmt `ts` automatisch, und `fallback` enthält den Grund. Das muss sichtbar sein
  (z. B. Hinweis an der Engine-Anzeige), nicht nur in der Konsole.
- Engine-Schalter (py/ts) in der Fußzeile: erneut `createEngine(id)` aufrufen und die Analyse neu laufen lassen.
  `py` wird nur einmal geladen, ein Zurückschalten ist sofort da.
- `engine.listModels()` liefert die Modelle; `identity` ist vorerst das einzige.
- Die GUI rechnet nichts Fachliches selbst: keine Modelle, keine Energie, keine Metriken. Erlaubt sind
  Anzeige-Ableitungen aus der Antwort, z. B. Stundenbalken aus Differenzen von cumulativeKwh.
- web/src/App.tsx ist im Moment eine Debug-Seite (Demo-Daten → ts/py-Engine); ersetze sie vollständig.

## Design: Tokens zuerst
Wir wollen das Design später in Minuten ändern können. Deshalb gilt: **jede Gestaltungsentscheidung ist ein
Token, keine Komponente enthält eigene Werte.**
- Alle Tokens als CSS-Variablen in web/src/index.css (Tailwind v4 `@theme` plus die shadcn-Variablen), in zwei
  Ebenen: Basis-Palette (z. B. `--brand-600`, `--neutral-100`) und semantische Tokens, die nur auf die Palette
  verweisen. Komponenten nutzen ausschließlich semantische Tokens.
- Semantische Tokens mindestens für: Flächen, Text, Rahmen, Primär-/Akzentfarbe, Erfolg/Warnung/Fehler,
  Radius, Schatten, Abstände der Karten, Schriftgrößen für Kennzahl/Überschrift/Fließtext/Beschriftung.
- Fachliche Farbtokens, die in jeder Ansicht dasselbe bedeuten: Zielpark gemessen, Referenzpark, Vorhersage,
  Unsicherheitsband, Ausfallzeitraum, Energieverlust. Eine Farbe pro Bedeutung, in allen Charts gleich.
- ECharts bekommt sein Theme aus denselben Tokens (zur Laufzeit per `getComputedStyle` gelesen, im
  ECharts-Wrapper an einer Stelle). Ein geänderter Token ändert also auch alle Charts.
- Keine Hex-, rgb()- oder px-Werte in components/, steps/ oder Chart-Optionen. Prüfung:
  `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]px" web/src/components web/src/steps` ist leer
  (Ausnahme: die von shadcn generierten Dateien in components/ui/).
- Hell als Standard; Dunkelmodus nur über die Tokens (`.dark`), ohne Sonderfälle in Komponenten.

## Design: Anmutung
Orientiere dich an der Anmutung von BayWa r.e. als Energieunternehmen, ohne sie zu kopieren: sachlich und
vertrauenswürdig, viel Weißraum, ein kräftiges, frisches Grün als Primärfarbe, dunkle neutrale Schrift, ruhige
Flächen, klare Raster, wenige Akzente. Leite eine eigene Palette ab; kein Logo, keine Markenschrift, keine
exakt übernommenen Markenfarben, keine nachgebauten Seitenelemente. Zielgruppe sind Versicherungs- und
Asset-Manager: Die Kennzahlen müssen in Sekunden lesbar sein, die Methode in einem Satz verständlich.

## Bauen
1. MST-Root-Store in web/src/state/: `Dataset` (aus `@/data`), gewählter Ausfall (`Span`), gewähltes Modell,
   Engine-Handle, letzte AnalyzeResponse, Status (idle | running | error mit Meldung), aktiver Schritt.
   Aktionen: loadDataset, setOutage, selectModel, setEngine, runAnalysis. Halte den Store klein.
2. App-Shell: fünf Schritte als Stepper (Upload, Outage, Method, Results, Export); jeder Schritt erklärt in
   einem Satz, was er tut. Fußzeile mit aktiver Engine, Version, Rechenzeit (response.engine) und Schalter.
3. Gemeinsamer ECharts-Wrapper in components/charts/ (Resize, Theme aus Tokens, Dispose). Alle Charts nutzen ihn.
4. Schritte:
   - Upload: Drop-Zonen für Ziel, Referenz(en) und Leistungskurve, Eingabe Anzahl Turbinen, „Load demo data“.
     Je Datei der `report`: Zeitraum (Europe/Berlin), Anzahl Werte, fehlende, ignorierte Spalten; dazu die
     Korrelation r (aus explanation.diagnostics, sobald eine Analyse lief).
   - Outage: Zielpark und Referenzen übereinander, erkannte Ausfälle farbig hinterlegt (mehrere möglich,
     längster vorausgewählt), Messlücken dezent markiert; Start und Ende per Ziehen (Brush) oder Datumsfeld.
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
- Modern, kompakt, datendicht. shadcn-Komponenten per `npx shadcn@latest add <name>`.
- Leer-, Lade- und Fehlerzustände sind gestaltet; über 3 s Ladeanzeige mit Text; nie ein roher Stacktrace.
- Neue npm-Abhängigkeiten nur katex und shadcn-Komponenten, alles andere erst fragen. Kein CDN: windgap.html
  muss per Doppelklick offline laufen.

## Reihenfolge und Abnahme
Erst Tokens und ECharts-Wrapper, dann Store und Shell, dann Results, Method, Outage, Upload, Export. Alle
Befehle im Projektordner. Nach jedem Schritt: `make test` und `make build` grün, Token-Prüfung (grep oben) leer,
Ansicht mit `make dev` im Browser prüfen (beide Engines, `?engine=ts`), `dist/windgap.html` per Doppelklick
öffnen und `make serve` für die Ordner-Variante (http://localhost:8000). Danach `make screenshots` und jedes Bild in
`screenshots/` ansehen (Desktop, Handy, dunkel, Fehler, py): Überlauf, Kontrast und Lesbarkeit prüfen. Nicht committen, bis wir es sagen.
