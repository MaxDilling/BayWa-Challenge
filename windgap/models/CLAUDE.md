# Modelle (T2)

Kontrakt S3 und Modellleiter M0–M7 stehen in `SPEC.md`. Hier steht nur, was beim Schreiben eines Modells zählt.

## Ein Modell hinzufügen

1. Eine Datei `windgap/models/<name>.py` mit einer Klasse mit `@register("<name>")`. Die Registry findet sie automatisch, sodass sie in Harness, Engine und GUI auftaucht.
2. Hyperparameter sind Konstruktor-Argumente mit Standardwert (`__init__(self, lag_max_min: int = 60)`). Die Engine reicht `params` aus der Anfrage als Keyword-Argumente durch. Varianten (LR mit und ohne Lag) sind Parameter, keine zweite Datei.
3. `predict` gibt `gaussian_prediction(mean, std)` zurück, außer das Modell hat eine eigene Verteilung. Spalten `mean, std, q10, q50, q90`, Index = `refs.index`, alles ≥ 0.
4. `explain()`: `summary` in zwei Sätzen ohne Fachjargon, `formula` in LaTeX, `params` = gelernte Koeffizienten, `diagnostics` = z. B. `r`, `lag_min`, `n_train`. Nur endliche Zahlen.
5. `make fixtures && make test`, dann Harness laufen lassen. Ein Modell ist erst fertig, wenn es im Leaderboard steht.

## Regeln

- `fit(target, refs)` bekommt Ziel und Referenzen auf demselben Index, beide mit möglichen Lücken (NaN). Lücken selbst behandeln (`dropna` auf Paaren), nie interpolieren. In `predict` sind die Referenzen lückenlos.
- `predict` darf nur `refs` und `extra` lesen. Alles, was das Modell aus den Daten lernt (Mittelwerte, Lag, σ), entsteht in `fit`.
- σ kommt aus Residuen auf ungesehenen Daten (z. B. interner Backtest auf dem Trainingszeitraum), nicht aus der Anpassungsgüte. Ziel: `coverage_80` ≈ 0,8.
- Nur numpy und pandas. scipy, statsmodels oder scikit-learn nur nach Rückfrage (Kaltstart in Pyodide). LightGBM und alles, was nur als Benchmark dient, gehört nach `harness/benchmarks/`, nie hierher.
- Mehrere Referenzen: Das Modell nimmt die erste Spalte, bis M7 die Kombination regelt.
