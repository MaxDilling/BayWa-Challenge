# Turbinentypen und Standorte hinter T, H und O

Stand 24.10.2026. Grundlagen: die Challenge-Daten in `data/data_hackathon_baywa_re/`, die Parkliste von BayWa aus dem Team, das Marktstammdatenregister (MaStR) und DWD-Stationen. Ausgewertet mit Wegwerf-Skripten (pandas). Die Anlagen von BayWa mit MaStR-Nummer, Koordinaten und Geländehöhe stehen in [baywa_anlagen.csv](baywa_anlagen.csv).

## Ergebnis

| Daten | Park | Typ | Sicherheit |
| --- | --- | --- | --- |
| O1, O2 | Apelern/Lauenau WEA2 und WEA3 (Schaumburg) | Enercon E-40/6.44, Nabe 65 m | belegt |
| T1 | Sievern, SIEX 06 (Geestland, nördlich von Bremerhaven) | AN Bonus 1 MW/54, Nabe 60 m | wahrscheinlich |
| T2 | Sievern, SIE 03 | dto. | plausibel |
| T3 | Sievern, SIEX 02 | dto. | plausibel |
| H1–H5 | **nicht** Wittighausen (9× V47); ein Park in Norddeutschland, Typ unbekannt | – | Wittighausen ausgeschlossen |

## Parks von BayWa

Laut Team gibt es keine gemischten Parks. Alle Parks liegen mindestens 100 km voneinander entfernt, außer der TW 600 und Sievern (60 km). Die Anlagen hat das öffentliche MaStR, Betreiber „BayWa r.e Windparkportfolio 1 GmbH & Co. KG“ (Abfrage über die JSON-Schnittstelle der MaStR-Suche):

| Park | Anlagen | Typ | Nabe / Rotor | Gelände (Copernicus-DEM) |
| --- | --- | --- | --- | --- |
| Sievern, Geestland | 8: SIE 03, 04, 07, 09, 10, 12, SIEX 02, 06 | AN Bonus 1 MW/54, stallgeregelt | 60 / 54 m | 6–13 m |
| Wittighausen, Main-Tauber-Kreis | 9 | Vestas V47, 660 kW | 42 / 47 m | 312–332 m |
| Apelern/Lauenau, Schaumburg | 2 (WEA2, WEA3); WEA1 hat einen anderen Betreiber | Enercon E-40/6.44, 600 kW | 65 / 44 m | 136–138 m |
| Altebrücke, Wangerland | 1 | Tacke TW 600 | 50 / 42 m | Standort im MaStR anonymisiert |

Die E-40/6.44/E2 aus der Liste des Teams ist die **WEA Evendorf** (Egestorf, Landkreis Harburg; SEE973290653259; Nabe 78 m, Inbetriebnahme 02.12.2003). Laut windturbinemap.com ist sie in Betrieb, Betreiber „BayWa r.e. Wind II GmbH“, letzte Aktualisierung 18.05.2026. Die MaStR-Schnittstelle zeigt dagegen „Endgültig stillgelegt“ und keinen Betreibernamen, deshalb fehlte sie bei der Suche nach „BayWa“. Als Einzelanlage ist sie keiner der Parks in den Daten. Auf windturbinemap.com sind die Daten verschlüsselt und deshalb nicht ausgelesen; sie stammen ohnehin aus dem MaStR.

Alle Windenergieanlagen mit „BayWa“ im Betreibernamen (Filter `Name des Anlagenbetreibers (nur Org.)` enthält `BayWa`, 52 Einheiten; Töchter: Windparkportfolio 1, Energieprojekte, Clean Energy Sourcing): Außer den vier Parks oben gibt es nur Projekte „in Planung“, nämlich Sievern-Repowering (7× Nordex N149/5.X), Betzendorf (Lüneburg, 5× E-175 EP5, geplante Inbetriebnahme 30.09.2029), Vorbeck-Kambs (Rostock, 3× N149/5700) und Dirmstein (Pfalz, 17× N175). Der rote Punkt bei Rostock auf windturbinemap.com ist Vorbeck-Kambs, der gelbe südlich von Hamburg ist Evendorf. Auf der Karte mit nur laufenden Anlagen bleiben in Norddeutschland vier Punkte: Altebrücke, Sievern, Evendorf und Apelern. Ein laufender BayWa-Park mit 5 oder mehr Anlagen, der H sein könnte, ist dort nicht verzeichnet.

## Die Daten sind echt und tagesgenau

Der Wind der Parks korreliert mit DWD-Stationen am selben Tag (Stundenmittel ohne Tagesgang) zu 0,6–0,7 in Norddeutschland. Um 10 Tage verschoben fällt die Korrelation auf −0,1 bis 0. Die Zeitstempel sind also echte Zeiten im Juli bis September 2026.

- **Zeitzone: Sommerzeit (UTC + 2), so wie SPEC S1 die Daten liest.** Der gemessene Luftdruck von T1 passt am besten zum Druckfeld der DWD-Stationen (Stundenmittel, auf Meereshöhe reduziert, örtlich interpoliert), wenn man die Zeitstempel um 2 h verschiebt. Fehler: 0,90 hPa bei 0 h, 0,70 bei 1 h, 0,58 bei 2 h, 0,61 bei 3 h. Druck hat keinen Tagesgang, der zwischen 10 m und Nabe verschieden wäre. Beim Wind ist das Maximum flach (UTC + 2,5 bis 3,5 h).
- **Windrichtung je Turbine gegen den DWD** (Median, Wind > 5 m/s): T1 +11°, T2 −4°, T3 −38° gegen Bremerhaven; H1–H5 0 bis +7° und O1/O2 −2° bzw. −5° gegen Hannover. Bei T3 ist die Nordausrichtung der Gondel deutlich verstellt. Wichtig für jedes Modell, das `wind_direction` nutzt.
- **Idee fürs Team:** DWD-Stationen wären zusätzliche Referenzen mit echter Zeit (Bremerhaven 12 km von Sievern, r = 0,6 ohne Tagesgang). Ob das erlaubt ist, wäre zu klären; laut README stammen Referenzen aus anderen Windparks.

## O = Apelern/Lauenau

- Ohne gemischte Parks hat nur Apelern genau 2 Anlagen.
- Für O ist der Druck ein Schätzwert der Organisatoren, 990,27 hPa; das entspricht nach ISA 193 m. Gelände 136–138 m plus Nabe 65 m ergeben 201–203 m (ISA 989,2 hPa). Die Organisatoren haben den Druck also wohl aus Höhe und Nabe gerechnet.
- Das Datenformat passt zu Enercon-SCADA: Wind in 0,1 m/s, Temperatur meist in ganzen °C, keine Standardabweichung, kein Drucksensor.
- Hannover, 31 km entfernt, ist die DWD-Station mit der höchsten Korrelation (0,72).

## T = Sievern, T1–T3 einzeln

Die Zahl 3 lässt nur Sievern oder Wittighausen zu. Für Sievern sprechen:

- **Nachläufe:** Ein einfaches Nachlaufmodell (Jensen, Breite nach Abstand) über jede Wahl von drei Anlagen sagt das Windprofil je Richtung für Sievern deutlich besser vorher als ohne Nachlauf (Fehlerquadrate 0,17 statt 0,25). Für Wittighausen ist keine Wahl besser als ohne Nachlauf.
- **Zuordnung:** Die Richtung im Bezug von T1 ist am DWD geeicht (−20° bis +5°). Dann ist T1 = SIEX 06 in 39 der 40 besten Lösungen. Am besten passen T2 = SIE 03 und T3 = SIEX 02; nahe dahinter liegen SIE 04 und SIE 07.
- **Probe an der Karte:** SIE 03 liegt 510 m WSW von SIEX 06 (254°), SIEX 02 760 m W (277°): Das ist der Nachlauf, den T1 bei Wind aus 260–290° zeigt. SIE 04 liegt 270 m NO von SIE 03 (52°) und erklärt den Verlust von T2 bei Wind aus 50–60°. SIE 03 liegt 350 m SO von SIEX 02 (131°) und erklärt den Verlust von T3 bei Wind aus 120–130°.
- **Höhe:** Die Reihenfolge des Drucks (T1 am tiefsten, T3 am höchsten) entspricht dem Gelände: SIEX 06 13 m, SIE 03 9 m, SIEX 02 6 m. Absolut liegt der Druck von T rund 6–8 hPa unter dem erwarteten Wert (Nabe auf rund 70 m entspräche etwa 1006 hPa); vermutlich ein Versatz der Sensoren.

## H ist nicht Wittighausen

- **DWD:** Würzburg (20 km von Wittighausen) korreliert mit H zu 0,41, Walldürn (30 km) zu 0,37. Hannover und Soltau kommen auf 0,65, Schwerin auf 0,63. Zum Vergleich: O erreicht mit der nächsten Station 0,72. H liegt also in Norddeutschland. Genauer lässt sich H damit nicht orten: Am Muster der Korrelation geortet, lagen T und O 70–130 km daneben.
- **Druck:** In Wittighausen liegt die Nabe auf etwa 370 m (ISA ca. 970 hPa). Gemessen sind 985–990 hPa, rund 90 m höher als T.
- **Nachläufe:** Die 9 V47 stehen dicht (200–300 m, etwa 5 D). Das Modell sagt dort starke Nachläufe vorher; die Daten von H passen ohne Nachlauf besser.
- **Zeitversatz:** Bei Westwind läuft H rund 30 min hinter T und O; das passt zu einem Park östlich der Linie Sievern–Apelern.

Kein laufender Park mit BayWa als Betreiber im MaStR passt zu H (siehe „Parks von BayWa“). Am wahrscheinlichsten ist ein Park eines anderen Betreibers, für den BayWa nur die Betriebsführung macht und deshalb die SCADA-Daten hat. Im MaStR steht dann kein BayWa-Name. H hat dasselbe Datenformat wie T (Standardabweichung, Drucksensor, 6 Nachkommastellen).

Was bei der Suche nicht hilft: Die Ortung über das Druckfeld der DWD-Stationen setzt T 200 km neben Sievern (bei 52,4° N, 10,8° E) und taugt deshalb auch für H nicht. Vermutlich ist der Gradient zu flach gegen Sensorfehler und den Staudruck an der Gondel.

Was H eingrenzt: Norddeutschland, eher östlich der Linie Sievern–Apelern; mindestens 5 Anlagen; Nabe nach Druck rund 90 m höher über dem Meer als bei T, innerhalb von H rund 40 m Streuung; schwache Nachläufe, also weite Abstände oder große Rotoren mit wenigen Nachbarn; mittlerer Wind 5,7–6,4 m/s im Sommer. Am schnellsten klären es die Organisatoren.

## Die Leistungskurve der Challenge ist eine Nordex-Kurve, nicht die Bonus

Die drei identischen Kurven `T*_power_curve.xlsx` beschreiben eine moderne 4,5-MW-Anlage: Einschalten bei 3 m/s, 4.500 kW ab 11,5 m/s, ab 20,5 m/s abgeregelt bis 2.529 kW bei 26 m/s. Die AN Bonus 1 MW/54 in Sievern hat 1.000 kW, stallgeregelt; ihre Kurve liegt in `data/power_curves/an_bonus_1000_54.csv` (Herstellerdokumentation über mwps.world).

**Treffer:** die Nordex-Tabelle mit 5.000 kW je Luftdichte, die das Team gefunden hat ([nordex_5000kw_dichte.csv](nordex_5000kw_dichte.csv); Typ und Dokument noch zu benennen).

- **Ab 21 m/s** stimmen beide Kurven auf das kW überein (4.307 … 2.529 kW). Bei 20,5 m/s hat die Challenge 4.455 kW, Nordex 4.482 kW.
- **3–8,5 m/s:** Die Tabelle endet bei 1,100 kg/m³. Linear in der Dichte fortgeschrieben, trifft sie die Challenge bei 1,21–1,22 kg/m³ auf unter 1 % (8 m/s: 2.536 statt 2.527 kW). Die Challenge-Kurve gilt also für etwa die Normdichte 1,225 kg/m³.
- **9–11,5 m/s** geht die Challenge-Kurve weicher auf 4.500 kW zu, als eine bei 4.500 kW abgeschnittene 5-MW-Kurve es täte. Das passt zu einem eigenen 4,5-MW-Betriebsmodus desselben Typs, nicht zu einer nachträglichen Kappung.
- Das Abregeln ab 19–20 m/s bis zur Abschaltung bei 26 m/s ist typisch für Nordex Delta4000 (N149). Für Sievern plant BayWa ein Repowering mit N149/5.X. Wahrscheinlich haben die Organisatoren die Kurve des Nachfolgetyps im 4,5-MW-Modus genommen.
- **Luftdichte vor Ort:** Aus Druck und Temperatur der Daten folgen bei T im Mittel 1,190 kg/m³ (5–95 %: 1,154–1,220), bei H 1,183. Die Challenge-Kurve unterstellt etwa 1,225. Im Teillastbereich liefert die Anlage bei 1,19 rund 3 % weniger. Für Bonus 2 (Zusatzparameter) ließe sich die Kurve mit der Dichtetabelle je Zeitschritt korrigieren; das berührt S4 und wäre im Team zu klären.
- **Folge:** Über den gemessenen Wind von Juli bis September liefert die Kurve der Challenge im Mittel 1.011–1.210 kW, die Bonus-Kurve 130–158 kW (Kapazitätsfaktor 13–16 %). Mit der Kurve der Challenge ist jede kWh-Zahl für T also etwa 7,7-mal so hoch wie mit der echten Bonus-Kurve. Bewertet wird zwar mit der Kurve der Organisatoren. Ob sie eine absichtliche Verfremdung ist, sollten wir trotzdem fragen, bevor wir in der Präsentation von „echten“ Verlusten sprechen.

## Quellen

- Marktstammdatenregister der Bundesnetzagentur, öffentliche Einheitensuche: https://www.marktstammdatenregister.de/MaStR/Einheit/Einheiten/ErweiterteOeffentlicheEinheitenuebersicht (Datenlizenz Deutschland – Namensnennung 2.0)
- Geländehöhe: Open-Meteo Elevation API (Copernicus DEM GLO-90): https://open-meteo.com/en/docs/elevation-api
- DWD, 10-Minuten-Wind und -Lufttemperatur/-druck `recent`: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/ (CC BY 4.0)
- AN Bonus 1000/54, technische Dokumentation: https://media.mwps.world/static/2020/10/an-bonus-1000_54-technical-documentation.pdf
- windpowerlib, OEDB-Leistungskurven: https://github.com/wind-python/windpowerlib/tree/master/windpowerlib/oedb
- Challenge-Daten und README der Organisatoren (CHALLENGE.md, Abschnitt 5; SPEC.md, „Challenge-Daten“)
