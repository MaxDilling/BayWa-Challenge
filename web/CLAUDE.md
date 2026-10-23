# Web (T5 Engines, T6 GUI)

Vite, React, TypeScript, shadcn/ui (Preset Nova, Radix), Tailwind v4, ECharts, MobX State Tree. Befehle im Projektordner per `make` (`dev`, `test`, `build`, `serve`), weil Wheel und Pyodide vorher bereitliegen müssen.

## Regeln

- **Die GUI kennt nur `Engine` aus `src/engine/contract.ts`.** Kein Modell- oder Energiewissen in Komponenten. CSV-Export und Berichtstext baut die GUI aus der `AnalyzeResponse`.
- **`ts`-Engine ist ein Port, keine eigene Methode.** Jede Formel entspricht 1:1 der Python-Funktion gleichen Namens, und die Golden-Fixtures müssen auf 1e-6 stimmen. Ohne Fixture gibt es kein TS-Modell.
- **Import (`src/data/`) liefert bereinigte Arrays.** Zeit intern in UTC (Epoch-Millisekunden); Europe/Berlin nur beim Einlesen und Anzeigen. Referenzlücken im Ausfall werden hier gefüllt und markiert, weil die Engine vollständige Referenzen verlangt. Die Regeln stehen in SPEC.md S1; `windgap/core/io.py` ist der Python-Zwilling. Jede Regeländerung an beiden Seiten und mit einem Fall in `fixtures/csv/`. `parseWindCsv` liefert eine Reihe je Windspalte; `assignFiles` ordnet mehrere Dateien auf einmal zu.
- **Der Build `--mode single` darf den `py`-Pfad nicht enthalten.** Pyodide nur per dynamischem Import hinter `import.meta.env.MODE !== 'single'` laden. Pyodide wird nie gebündelt: Der Worker lädt es zur Laufzeit aus `public/pyodide/` (relativ zur Seite, damit GitHub Pages unter einem Unterpfad funktioniert). Kein CDN.
- **Design über Tokens.** Jede Farbe, jeder Radius, Schatten und jede Schriftgröße ist eine CSS-Variable in `src/index.css` (Basis-Palette → semantische Tokens). Komponenten und ECharts-Optionen nutzen nur semantische Tokens, nie Hex-, rgb()- oder px-Werte. Fachliche Farben (gemessen, Referenz, Vorhersage, Band, Ausfall, Energie) bedeuten überall dasselbe.
- **UX:** Jeder Schritt erklärt sich in einem Satz. Zahlen immer mit Einheit. Läuft etwas länger als 3 s, gibt es eine Ladeanzeige mit Text. Fehler- und Leerzustände sind gestaltet, nie ein roher Stacktrace. Text der Oberfläche auf Englisch.
- shadcn-Komponenten mit `npx shadcn@latest add <name>` hinzufügen, nicht von Hand kopieren. Charts über einen gemeinsamen ECharts-Wrapper, nicht je Ansicht neu.
