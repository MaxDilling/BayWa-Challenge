# Harness (T3)

Läuft nur nativ und kommt nicht ins Wheel. Szenarien, Metriken und Ausgabeformat stehen in `SPEC.md` im Abschnitt „Harness“.

## Regeln

- **Keine eigene Metrik, kein eigener Fold.** Jedes Szenario geht über `windgap.backtest.fold`, jede Kennzahl über `windgap.core.metrics.evaluate`. Fehlt eine Metrik, wird sie dort ergänzt (und in `configs/eval.yaml`), damit GUI und Leaderboard dasselbe messen.
- **Kein Datenleck.** Training nur vor t₀; Normierung, Lag-Suche und Parameterwahl nur auf Trainingsdaten des jeweiligen Szenarios. Der Holdout (letzte ca. 5 Tage) läuft nur mit `--holdout` für finale Entscheidungen.
- **Reproduzierbar.** Jeder Zufall über `np.random.default_rng(seed)`, Seed aus der Konfiguration. Jeder Lauf schreibt Konfiguration und Git-Commit nach `runs/<zeit>_<commit>/`.
- **Unter 30 Sekunden** für alle Modelle. Wird es langsamer, zuerst Szenarien ausdünnen, nicht parallelisieren.
- `demo.py` schreibt die Demo-Daten der GUI (`make demo`) im Challenge-Format; die GUI liest sie über den normalen CSV-Import.
- `synthetic.py` liefert Paare mit bekannter Wahrheit. Ändert sich der Generator, ändern sich Golden-Fixtures und Leaderboard; danach `make fixtures`.
