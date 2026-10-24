# Harness (T3)

Läuft nur nativ und kommt nicht ins Wheel. Szenarien, Metriken und Ausgabeformat stehen in `SPEC.md` im Abschnitt „Harness“.

## Regeln

- **Keine eigene Metrik, kein eigener Fold.** Jedes Szenario geht über `windgap.backtest.fold`, jede Kennzahl über `windgap.core.metrics` (`evaluate` je Szenario, `summarize` über Szenarien). Fehlt eine Metrik, wird sie dort ergänzt (und in `configs/eval.yaml`), damit GUI und Leaderboard dasselbe messen.
- **Kein Datenleck.** Training nur außerhalb des Fensters, ohne `--holdout` nie im Holdout; Normierung, Lag-Suche und Parameterwahl nur auf Trainingsdaten des jeweiligen Szenarios. Der Holdout (letzte ca. 5 Tage) läuft nur mit `--holdout` für finale Entscheidungen.
- **Reproduzierbar.** Jeder Zufall über `np.random.default_rng(seed)`, Seed aus der Konfiguration. Jeder Lauf schreibt Konfiguration und Git-Commit nach `runs/<zeit>_<commit>/`.
- **Unter 30 Sekunden** für alle Modelle. Wird es langsamer, zuerst Szenarien ausdünnen (`scenarios:` je Datensatz in `configs/eval.yaml`), nicht parallelisieren.
- **Referenzlücken wie im Produkt:** Im Fenster überbrückt `run.py` sie mit `windgap.core.outage.fill_during_outage`, derselben Funktion wie GUI und CLI; was die nicht überbrückt, entfällt als Szenario. Nie eine eigene Füllregel.
- **Neue Daten brauchen keinen Code:** Ordner nach dem Layout in `datasets.py` anlegen und in `configs/eval.yaml` eintragen (optional `wind_scale` für Messhöhen weit unter Nabenhöhe). Score-Gewichte und Szenarien stehen nur dort.
- `benchmarks/`: Kandidaten-Modelle, die nur die Harness kennt (`@register` wie in `windgap/models/`, je Modul eine Liste `NAMES`). Sie laufen nur, wenn `--models` sie nennt, und kommen erst nach `windgap/models/` (und in den `ts`-Port), wenn das Leaderboard es rechtfertigt.
- `demo.py` schreibt die Demo-Daten der GUI (`make demo`) im Challenge-Format; die GUI liest sie über den normalen CSV-Import.
- `predict.py` ist die Abgabe-CLI (`make predict TURBINES=n`): derselbe Weg wie die GUI (`windgap.core.io` → `windgap.core.outage` → `windgap.engine.handle`), keine eigene Modell- oder Formatlogik.
- `synthetic.py` liefert Paare mit bekannter Wahrheit. Ändert sich der Generator, ändern sich Golden-Fixtures und Leaderboard; danach `make fixtures`.
- `xlsx.py` (`make csv`) schreibt jede xlsx eines Ordners als CSV daneben, ohne Werte zu verändern: Datumszellen als Wanduhrzeit ohne Zeitzone, Zahlen exakt (kürzeste Darstellung des gespeicherten Werts), leere Zellen bleiben leer. Excel-Sperrdateien `~$…` werden übersprungen.
- `dwd.py` lädt echte Stationspaare (`make dwd`) nach `data/dwd/`. Paare und Zeitfenster stehen fest im Code, damit jeder Download dieselben Daten liefert; nie Werte ergänzen oder glätten.
