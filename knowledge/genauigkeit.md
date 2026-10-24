# Genauigkeit

Wie genau wir sind und wie wir das messen, für Präsentation und Rückfragen. Stand 24.10.2026, Commit `3cfbe5d`, Modell `sector_regression` (Standard der GUI), je Ziel alle sieben Referenzen aus H und O, eine Turbine mit 4.500 kW.

## Wie wir messen

Im echten Ausfall gibt es keine Messung. Deshalb verstecken wir echte Zielwerte, sagen sie aus den Referenzen vorher und vergleichen (`windgap.backtest.fold`). Das Modell lernt nur aus den Zieldaten außerhalb des Fensters, davor und danach; Zeitversatz, Gewichte und Unsicherheit entstehen nur dort. So arbeitet auch die Jury mit dem 01.–03.09.

- **Wind RMSE / MAE** (m/s): Fehler des 10-Minuten-Winds. RMSE gewichtet große Fehler stärker, deshalb immer RMSE ≥ MAE.
- **Power RMSE / MAE** (kW): Leistung als P(Wind) über die Leistungskurve. Die Wahrheit ist P(gemessener Wind), weil es keine gemessene Leistung gibt. Die Vorhersage ist E[P(v)] über die vorhergesagte Verteilung.
- **Energiefehler** (`energy_wape_pct`): Σ |P50 − echte Energie| / Σ echte Energie über alle Fenster. Gewichtet nach Energie, damit Flaute-Fenster mit fast keiner Energie die Zahl nicht beherrschen.
- **Abdeckung des 80-%-Bands** (`coverage_80`): Anteil der echten Windwerte im Band; Ziel 80 %.

## 1. Gezeigter Test 04.–09.09. (wie die Jury)

Die Jury versteckt 72 h (01.–03.09.). Wir verstecken die 72 h direkt danach, 04.–06.09., in denen die Messungen vorliegen (je Ziel 432 von 432 Werten).

| Ziel | Wind RMSE | Wind MAE | Power RMSE | Power MAE | Energie (Abweichung) |
| --- | --- | --- | --- | --- | --- |
| T1 | 1,38 m/s | 1,06 m/s | 820 kW | 614 kW | 130,0 MWh echt, +6,8 % |
| T2 | 1,04 m/s | 0,76 m/s | 555 kW | 381 kW | 188,0 MWh echt, −1,4 % |
| T3 | 1,22 m/s | 0,94 m/s | 744 kW | 547 kW | 159,3 MWh echt, −1,3 % |
| **T1–T3** | **1,21 m/s** | **0,92 m/s** | **706 kW** | **514 kW** | **Energiefehler 2,8 %** |

Zum Vergleich auf denselben 72 h (Mittel T1–T3):

| Methode | Wind RMSE | Power RMSE | Energiefehler |
| --- | --- | --- | --- |
| Referenzwind unverändert | 2,68 m/s | 1.116 kW | 27,7 % |
| Lineare Regression (Lehrbuch-MCP) | 1,47 m/s | 862 kW | 9,1 % |
| Mehrere Referenzen | 1,25 m/s | 737 kW | 3,3 % |
| **Mehrere Referenzen je Windrichtung** | **1,21 m/s** | **706 kW** | **2,8 %** |

Ein einzelnes Fenster streut: 07.–09.09. ergibt mit demselben Modell 1,44 m/s und 7,2 %, die ganzen 144 h 04.–09.09. 1,33 m/s und 4,5 %. Für eine belastbare Erwartung zählt deshalb Abschnitt 2.

## 2. Harness: 207 simulierte Ausfälle (Modellwahl)

Je Ziel rollierende Ausfälle über die 90 Tage, Längen 6 h, 24 h, 48 h, 72 h und 5 Tage. Score = Mittel aus Wind RMSE/MAE, Power RMSE/MAE und Energiefehler, je relativ zum Referenzwind unverändert (= 1), kleiner ist besser. Lauf `runs/20261024-181258_3cfbe5d`, identisch mit `BENCHMARK` in „How it works“.

| Methode | Score | Wind RMSE | Power RMSE | Energiefehler | 80-%-Band |
| --- | --- | --- | --- | --- | --- |
| Referenzwind unverändert | 1,00 | 1,69 m/s | 848 kW | 40,4 % | 79 % |
| Variance ratio (Vergleich) | 0,69 | 1,33 m/s | 683 kW | 12,5 % | 81 % |
| Lineare Regression | 0,67 | 1,23 m/s | 657 kW | 13,5 % | 82 % |
| Mehrere Referenzen | 0,59 | 1,12 m/s | 602 kW | 8,7 % | 80 % |
| **Mehrere Referenzen je Windrichtung** | **0,57** | **1,10 m/s** | **588 kW** | **7,6 %** | **80 %** |

Energiefehler nach Ausfalllänge (unser Modell): 6 h 23 %, 24 h 13 %, 48 h 8,6 %, 72 h 6,4 %, 5 Tage 6,0 %. Zufällige Fehler gleichen sich über lange Ausfälle aus. Kurze Ausfälle haben wenig Energie, dort zählt ein Prozent wenig kWh.

## 3. In der App

Results und Method wiederholen den Test von Abschnitt 1 auf den Daten des Nutzers: bis zu fünf simulierte Ausfälle gleicher Länge vor dem echten (`windgap.backtest.backtest`). Die Zahlen dort sind also die erwartete Genauigkeit dieses Ausfalls, nicht sein gemessener Fehler. Für T1 am 01.–03.09.: Energiefehler 11,9 %, Wind RMSE 1,34 m/s.

## Vorbehalte

- **Sicherheit: belegt** für die Zahlen (Skript und Harness auf den Challenge-Daten). Die Modellwahl fiel auf Harness-Szenarien, die auch den September berühren. Der gezeigte Test ist also kein unberührter Holdout für die Wahl der Methode, wohl aber für jede einzelne Vorhersage (kein Datenleck).
- Die Jury rechnet Leistung und Energie vermutlich ohne Luftdichte, wie wir hier. Die App korrigiert die Energie zusätzlich um die Luftdichte (S4), deshalb liegen ihre kWh rund 2–3 % unter den Zahlen dieser Tabellen.
- Tabelle 1: Wegwerf-Skript über `harness.datasets.load` und `windgap.backtest.fold`, Fenster 03.09. 22:00 UTC + 72 h bzw. 144 h.
