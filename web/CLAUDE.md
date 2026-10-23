# Web (T5 Engines, T6 GUI)

Vite, React, TypeScript, shadcn/ui (Preset Nova, Radix), Tailwind v4, ECharts, MobX State Tree. Befehle im Projektordner per `make` (`dev`, `test`, `build`, `serve`), weil Wheel und Pyodide vorher bereitliegen müssen.

## Regeln

- **Die GUI kennt nur `Engine` aus `src/engine/contract.ts`.** Kein Modell- oder Energiewissen in Komponenten. CSV-Export und Berichtstext baut die GUI aus der `AnalyzeResponse`.
- **`ts`-Engine ist ein Port, keine eigene Methode.** Jede Formel entspricht 1:1 der Python-Funktion gleichen Namens, und die Golden-Fixtures müssen auf 1e-6 stimmen. Ohne Fixture gibt es kein TS-Modell.
- **Import (`src/data/`) liefert bereinigte Arrays.** Zeit intern in UTC (Epoch-Millisekunden); Europe/Berlin nur beim Einlesen und Anzeigen. Referenzlücken im Ausfall werden hier gefüllt und markiert, weil die Engine vollständige Referenzen verlangt.
- **Der Build `--mode single` darf den `py`-Pfad nicht enthalten.** Pyodide nur per dynamischem Import hinter `import.meta.env.MODE !== 'single'` laden. Pyodide wird nie gebündelt: Der Worker lädt es zur Laufzeit aus `public/pyodide/` (relativ zur Seite, damit GitHub Pages unter einem Unterpfad funktioniert). Kein CDN.
- **UX:** Jeder Schritt erklärt sich in einem Satz. Zahlen immer mit Einheit. Läuft etwas länger als 3 s, gibt es eine Ladeanzeige mit Text. Fehler- und Leerzustände sind gestaltet, nie ein roher Stacktrace. Text der Oberfläche auf Englisch.
- shadcn-Komponenten mit `npx shadcn@latest add <name>` hinzufügen, nicht von Hand kopieren. Charts über einen gemeinsamen ECharts-Wrapper, nicht je Ansicht neu.
