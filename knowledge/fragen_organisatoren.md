# Fragen an die Organisatoren

Stand 24.10.2026. Zum Abschicken auf Englisch; in Klammern, warum wir fragen und was wir bis zur Antwort annehmen. Beantwortete Fragen hier abhaken und die Antwort in SPEC.md („Offene Fragen an die Organisatoren“) bzw. `turbinen.md` übernehmen.

## Abgabe und Bewertung

1. **How do we submit?** A link, a single HTML file or a folder? Do you also expect a prediction file, and in which format (columns, time zone, decimals)? One file per turbine (T1–T3) or one for all? *(Annahme: je Turbine `Timestamp,Wind speed (m/s),Predicted`, Europe/Berlin, 3 Nachkommastellen, E16.)*
2. **Which metrics does the jury compute, and how are they weighted?** Wind speed RMSE/MAE, power RMSE, energy deviation? Relative or absolute, over the hidden 72 h only? *(Bestimmt die Score-Gewichte in `configs/eval.yaml`.)*
3. **Is the energy loss scored per turbine or for the park, and with which power curve, air density and number of turbines?** *(Annahme: je Turbine, Kurve aus `T*_power_curve.xlsx`, 1 Turbine.)*
4. **Does an app that runs Python via WebAssembly in the browser count as "running locally"?** On which machines, browsers and network does the jury test? *(Wir liefern zusätzlich eine Einzeldatei mit TypeScript-Engine.)*
5. **Presentation:** language, length, live demo expected?

## Daten

6. **May we train on the target data after the outage (4–30 Sep)?** It is in the files, but a real outage would not have it. *(Annahme: nein, `fit` sieht nur Daten davor.)*
7. **Are external data allowed**, e.g. DWD weather stations or ERA5 reanalysis? *(Eingebaut als Option, Standard aus.)*
8. **Time zone of the timestamps:** we read them as local time (CEST, UTC+2); our check against DWD pressure data agrees. Is that right?
9. **Power curve:** the curve in `T*_power_curve.xlsx` (4.5 MW, cut-out 26 m/s) looks like a Nordex N149 in a 4.5 MW mode at 1.225 kg/m³. The turbines behind T appear to be smaller, older machines. Should we use the given curve as it is? Should we correct it for air density from the measured pressure and temperature? *(Annahme: Kurve wie gegeben, keine Dichtekorrektur; Team-Entscheidung „T = Nordex“.)*
10. **Wind speed source:** is `wind_speed` the nacelle anemometer? Then it contains the wake of neighbouring turbines (T1 sees about 9 % less wind from the west). Should the prediction reproduce that measured value including wakes, as we do now?
11. **Wind direction:** T3's direction is about 38° off the others and nearby DWD stations. Is a nacelle north offset known? *(Wir nutzen nur die Richtung der Referenzen.)*
12. **Park O:** how was the constant air pressure estimated (elevation and hub height)? Are there more measured channels for O?
13. **Park H:** which park and turbine type is it? We could not match it to BayWa's parks in the public register. *(Nur für die Präsentation wichtig.)*
14. **Gaps:** in all files 3–4 Aug (48 h) is missing, and `test_set` covers 9 days, not the 10 the README states. Both intended?
15. **Hidden test:** is 1–3 Sep the only hidden period, and are the hidden values raw measurements (with the random single gaps), or cleaned?
