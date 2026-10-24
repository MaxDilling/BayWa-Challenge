# Turbinentypen und Standorte hinter T, H und O

Stand 24.10.2026. Grundlagen: die Challenge-Daten in `data/data_hackathon_baywa_re/`, die Parkliste von BayWa aus dem Team, das Marktstammdatenregister (MaStR) und DWD-Stationen. Ausgewertet mit Wegwerf-Skripten (pandas). Die Anlagen von BayWa mit MaStR-Nummer, Koordinaten und Geländehöhe stehen in [baywa_anlagen.csv](baywa_anlagen.csv).

## Ergebnis

| Daten | Park | Typ | Sicherheit |
| --- | --- | --- | --- |
| O1, O2 | Apelern/Lauenau WEA2 und WEA3 (Schaumburg) | Enercon E-40/6.44, Nabe 65 m | belegt |
| T1–T3 | Windpark Wilhelmshöhe, Uetze (Region Hannover), 8 Anlagen; BayWa-r.e.-Projekt, im MaStR unter „Windpark Wilhelmshöhe II/III GmbH & Co. KG“ | Nordex Delta4000 N149/4.0-4.5 (TS105), 4.500 kW, Nabe 105 m | Park wahrscheinlich (Organisatoren: Typ N149 richtig, Sievern falsch) |
| T1 | WEA24 (SEE972014138607) | dto. | plausibel |
| T2 | WEA26 (SEE913483592798), knapp dahinter WEA22 | dto. | Vermutung |
| T3 | WEA23 (SEE974579500110), dahinter WEA27 | dto. | Vermutung |
| H1–H5 | Windpark Hankensbüttel, Dedelstorf (Landkreis Gifhorn), 5 Anlagen; Betreiber „Windpark Hankensbüttel GmbH“ (DEW21), Bezug zu BayWa unbelegt | Nordex N149/5.X, 5.700 kW, Nabe 104,7 m (3) und 125,4 m (2) | Park wahrscheinlich, Zuordnung plausibel |

## Parks von BayWa

Laut Team gibt es keine gemischten Parks. Alle Parks liegen mindestens 100 km voneinander entfernt, außer der TW 600 und Sievern (60 km). Die Anlagen hat das öffentliche MaStR, Betreiber „BayWa r.e Windparkportfolio 1 GmbH & Co. KG“ (Abfrage über die JSON-Schnittstelle der MaStR-Suche):

| Park | Anlagen | Typ | Nabe / Rotor | Gelände (Copernicus-DEM) |
| --- | --- | --- | --- | --- |
| Wilhelmshöhe, Uetze (Region Hannover) | 8: WEA22–WEA29; Betreiber im MaStR ohne BayWa-Namen | Nordex Delta4000 N149/4.0-4.5, 4.500 kW | 105 / 149 m | 46–50 m |
| Sievern, Geestland | 8: SIE 03, 04, 07, 09, 10, 12, SIEX 02, 06 | AN Bonus 1 MW/54, stallgeregelt | 60 / 54 m | 6–13 m |
| Wittighausen, Main-Tauber-Kreis | 9 | Vestas V47, 660 kW | 42 / 47 m | 312–332 m |
| Apelern/Lauenau, Schaumburg | 2 (WEA2, WEA3); WEA1 hat einen anderen Betreiber | Enercon E-40/6.44, 600 kW | 65 / 44 m | 136–138 m |
| Altebrücke, Wangerland | 1 | Tacke TW 600 | 50 / 42 m | Standort im MaStR anonymisiert |

Die E-40/6.44/E2 aus der Liste des Teams ist die **WEA Evendorf** (Egestorf, Landkreis Harburg; SEE973290653259; Nabe 78 m, Inbetriebnahme 02.12.2003). Laut windturbinemap.com ist sie in Betrieb, Betreiber „BayWa r.e. Wind II GmbH“, letzte Aktualisierung 18.05.2026. Die MaStR-Schnittstelle zeigt dagegen „Endgültig stillgelegt“ und keinen Betreibernamen, deshalb fehlte sie bei der Suche nach „BayWa“. Als Einzelanlage ist sie keiner der Parks in den Daten. Auf windturbinemap.com sind die Daten verschlüsselt und deshalb nicht ausgelesen; sie stammen ohnehin aus dem MaStR.

**Was die Suche nach „BayWa“ übersieht:** Parks, die BayWa r.e. gebaut hat und deren Betreibergesellschaft einen eigenen Namen trägt. Beispiel ist der Windpark Wilhelmshöhe in Uetze (8× N149, seit September 2022 in Betrieb, Repowering von 12 Südwind S70). BayWa r.e. führt ihn als eigenes Referenzprojekt, Antragstellerin war die BayWa r.e. Wind GmbH. Im MaStR stehen als Betreiber nur „Windpark Wilhelmshöhe II GmbH & Co. KG“ (WEA24, 27, 28, 29), „Windpark Wilhelmshöhe III GmbH & Co. KG“ (WEA23, 25, 26) und „Ackerstrom Wilhelmshöhe II GmbH & Co. KG“ (WEA22).

Alle Windenergieanlagen mit „BayWa“ im Betreibernamen (Filter `Name des Anlagenbetreibers (nur Org.)` enthält `BayWa`, 52 Einheiten; Töchter: Windparkportfolio 1, Energieprojekte, Clean Energy Sourcing): Außer den vier Parks oben gibt es nur Projekte „in Planung“, nämlich Sievern-Repowering (7× Nordex N149/5.X), Betzendorf (Lüneburg, 5× E-175 EP5, geplante Inbetriebnahme 30.09.2029), Vorbeck-Kambs (Rostock, 3× N149/5700) und Dirmstein (Pfalz, 17× N175). Der rote Punkt bei Rostock auf windturbinemap.com ist Vorbeck-Kambs, der gelbe südlich von Hamburg ist Evendorf. Auf der Karte mit nur laufenden Anlagen bleiben in Norddeutschland vier Punkte: Altebrücke, Sievern, Evendorf und Apelern. Ein laufender BayWa-Park mit 5 oder mehr Anlagen, der H sein könnte, ist dort nicht verzeichnet.

## Die Daten sind echt und tagesgenau

Der Wind der Parks korreliert mit DWD-Stationen am selben Tag (Stundenmittel ohne Tagesgang) zu 0,6–0,7 in Norddeutschland. Um 10 Tage verschoben fällt die Korrelation auf −0,1 bis 0. Die Zeitstempel sind also echte Zeiten im Juli bis September 2026.

- **Zeitzone: Sommerzeit (UTC + 2), so wie SPEC S1 die Daten liest.** Der gemessene Luftdruck von T1 passt am besten zum Druckfeld der DWD-Stationen (stündlicher Druck auf Meereshöhe, 214 Stationen, für Uetze interpoliert), wenn man die Zeitstempel um 2 h verschiebt. Streuung: 0,93 hPa bei 0 h, 0,76 bei 1 h, 0,73 bei 2 h, 0,82 bei 2,5 h, 0,87 bei 3 h. Druck hat keinen Tagesgang, der zwischen 10 m und Nabe verschieden wäre. Beim Wind ist das Maximum flach (UTC + 2,5 bis 3,5 h).
- **Windrichtung je Turbine gegen den DWD** (Median, Wind > 5 m/s): T1 +11°, T2 −4°, T3 −38° gegen Bremerhaven (gerechnet, als wir T noch in Sievern sahen); H1–H5 0 bis +7° und O1/O2 −2° bzw. −5° gegen Hannover. Bei T3 ist die Nordausrichtung der Gondel deutlich verstellt. Wichtig für jedes Modell, das `wind_direction` nutzt.
- **DWD als Referenz:** Für T sind Hannover (38 km, r = 0,79 ohne Tagesgang, Stundenwerte), Braunschweig (26 km, 0,75) und Wunstorf (0,75) die besten Stationen, nicht die Küstenstationen (Bremerhaven 0,61, Cuxhaven 0,55). Von den acht Stationen in `data/dwd_refs/` passen nur Hannover und Soltau zu T. Ob DWD-Daten erlaubt sind, wäre zu klären; laut README stammen Referenzen aus anderen Windparks.

## O = Apelern/Lauenau

- Ohne gemischte Parks hat nur Apelern genau 2 Anlagen.
- Für O ist der Druck ein Schätzwert der Organisatoren, 990,27 hPa; das entspricht nach ISA 193 m. Gelände 136–138 m plus Nabe 65 m ergeben 201–203 m (ISA 989,2 hPa). Die Organisatoren haben den Druck also wohl aus Höhe und Nabe gerechnet.
- Das Datenformat passt zu Enercon-SCADA: Wind in 0,1 m/s, Temperatur meist in ganzen °C, keine Standardabweichung, kein Drucksensor.
- Hannover, 31 km entfernt, ist die DWD-Station mit der höchsten Korrelation (0,72).

## T = Windpark Wilhelmshöhe, Uetze

Die Organisatoren haben bestätigt, dass die Turbinen N149 sind und dass Sievern falsch ist. Gesucht wurde im ganzen MaStR (44.318 Windeinheiten, Abruf 24.10.): 566 N149 in Betrieb, davon 160 mit 4.500 kW. Die Kandidaten wurden mit drei voneinander unabhängigen Tests aus den Daten geprüft. Uetze gewinnt jeden davon.

| Test | Uetze | Stemwede (10× N149/4.5, Nabe 125 m) | Esperke (4× N149/5.X) | Sievern |
| --- | --- | --- | --- | --- |
| Ortung über die Korrelation mit DWD, relativ zu O (Fehler, kleiner = besser; an O selbst 0,042) | 0,053 | 0,060 | 0,051 | 0,106 |
| Nabe über NN aus dem Druck (T1–T3: 164 / 159 / 147 m) | 151–155 m | 169–171 m | 155–156 m | 66–73 m |
| Streuung Druck gegen DWD-Druckfeld am Ort | 0,73 hPa | – | – | 1,69 hPa |
| Nachläufe passen zur Aufstellung (Korrelation, beste Zuordnung) | 0,64 | 0,50 | 0,23 | 0,49 |
| Nennleistung wie die Kurve der Challenge | 4.500 kW | 4.500 kW | 5.700 kW | 1.000 kW |

- **Ortung:** T korreliert am stärksten mit Hannover (0,79), Braunschweig (0,75) und Wunstorf (0,75), also fast wie O. Die Güte der Stationen fällt heraus, wenn man je Station das Verhältnis r(T)/r(O) nimmt und mit den Abständen zu T und zu O erklärt (Abklinglänge 600 oder 1.200 km). Dann liegt T am besten bei 52,2° N, 9,5° E, also nahe O. Sievern ist bei jeder Abklinglänge schlechter als jeder Ort im Umkreis von 70 km um O. Ohne den Bezug auf O ist die Ortung nur auf etwa 60 km genau (Selbsttest an acht DWD-Stationen: Fehler 19–184 km). Uetze ist dabei der beste Park mit mindestens drei N149.
- **Druck:** Bei Gelände von 46–50 m und 105 m Nabe liegen die Naben in Uetze auf 151–155 m. Aus dem Druck folgen für T 147–164 m, mit Fehlern der Sensoren von einigen hPa (zum Vergleich: innerhalb von H streut der Druck um 40 m). Der „Versatz von 6–8 hPa“, den wir für Sievern sahen, ist also die Höhe der Nabe. Lügde (Nabe auf rund 470 m) und Bad Gandersheim (336 m) scheiden aus.
- **Nachläufe** (Richtung aus O, Wind > 4,5 m/s, Verhältnis zum Mittel von T und Turbulenz je 10°-Sektor). Die Zuordnung T1 = WEA24 steht in allen besten Lösungen.
  - T1 verliert 13 % bei Wind aus 250–280°. Dort steht in 456 m WEA34 von Wilhelmshöhe Ost (V126, 268°), dahinter WEA33 (759 m, 280°). Bei Ostwind ist die Turbulenz gering, und östlich von WEA24 steht keine Anlage.
  - T2 verliert bei 50–60° und 80–90°. Dort stehen WEA27 (582 m, 61°) und WEA28 (927 m, 95°). Nach Süden ist T2 frei, und die Turbulenz bei 140–180° ist die kleinste im Park.
  - T3 verliert 13 % bei 110–130°. Dort stehen WEA33 (392 m, 127°) und WEA34 (717 m, 122°). Bei 340° verliert T3 ebenfalls; dort steht Uetze Nord-West WEA19 (488 m, 332°).
- Ähnlich passend, aber schwächer: Stemwede (enercity Tiefenriede, 52,40° N 8,35° E, Nabe 125 m). Die Nabe liegt rund 15 m zu hoch, und die Nachläufe passen schlechter.
- **Laufzeit gegen DWD Hannover:** Bei Westwind läuft T 27 min hinter Hannover. Für Uetze erwartet man rund 40 min, für Sievern −75 min. Die Methode streut um ±20 min (geprüft an Bremen, Hameln, Soltau). O läuft mit +22 min ebenfalls hinter Hannover, obwohl es westlich davon liegt. Ob O einen anderen Zeitstempel hat, ist offen.

Ausgewertet mit Wegwerf-Skripten: MaStR-JSON (`GetErweiterteOeffentlicheEinheitStromerzeugung`, Energieträger Wind), DWD-Stundenwerte Wind und Druck `recent` für alle Stationen, Geländehöhe von Open-Meteo.

## H = Windpark Hankensbüttel (Dedelstorf, Landkreis Gifhorn)

Gesucht wurde ohne Annahme zum Typ: alle laufenden Anlagen jedes Herstellers im Umkreis von 80 km, zu Parks gruppiert (Abstand unter 1,2 km), mindestens 5 Anlagen. Die Tests nutzen nur Ort, Gelände plus Nabe und die Aufstellung, nie den Typ.

| Test | Ergebnis |
| --- | --- |
| Ortung über das Druckfeld (an T geprüft: 27 km daneben) | 52,65° N, 10,55° E; Hankensbüttel liegt 12 km entfernt |
| Ortung über die Korrelation | absolut 52,7–52,9° N, 10,25–10,4° E; relativ zu O 53,2° N, 10,45° E (schwächer) |
| Nabe über NN aus dem Druck | H1 226, H4 231, H2 244, H3 268, H5 271 m. Nur neue, hohe Anlagen kommen in Frage |
| Nachläufe passen zur Aufstellung (beste Zuordnung, über 40 Parks) | Hankensbüttel 0,60, danach Rosche 0,55, Schnega 0,55, Jembke 0,51 |
| Zeitversatz bei Westwind | H läuft 20–30 min hinter T; Hankensbüttel liegt 22 km östlich von Uetze |

**Anlagen:** „Windpark Hankensbüttel GmbH“, 5× Nordex N149/5.X mit 5.700 kW, in Betrieb seit September 2024, Gelände 109–114 m. WEA 01, 03 und 04 haben 104,7 m Nabe, WEA 02 und 05 haben 125,4 m. Nördlich stehen 13 ältere Anlagen (8× FL 2500, 5× GE 2.85, „WeBo I/II“). Laut energate (02/2023) hat DEW21 (Dortmund) den Park mit fünf Anlagen und 28,5 MW gebaut. Eine Rolle von BayWa (etwa Betriebsführung) ist nicht belegt.

**Zuordnung aus den Nachläufen:** H1 = WEA 04, H2 = WEA 03, H3 = WEA 02, H4 = WEA 01, H5 = WEA 05 (Vermutung). Zwei Merkmale gehen in die Zuordnung nicht ein und bestätigen sie trotzdem:

- **Druck:** H3 und H5 sind die beiden Anlagen mit 125,4 m Nabe. Sie messen 4,5 hPa weniger Druck als H1 und H4, also rund 40 m höher. Der echte Unterschied ist 21 m; den Rest erklären Fehler der Sensoren, wie bei T.
- **Wind:** H3 und H5 haben den meisten Wind (6,28 und 6,42 m/s), H1, H2 und H4 5,72–5,83 m/s.

Dass gerade die beiden hohen Naben auf H3 und H5 fallen, hat bei zufälliger Zuordnung eine Wahrscheinlichkeit von 1 zu 10. Wahrscheinlich ist der Park also richtig, die Zuordnung der Turbinen plausibel.

**Jembke** ist das BayWa-Projekt in der Nähe (BayWa r.e. hat es gebaut und 2024 an ENOVA verkauft), passt aber nicht. Die Betreibergesellschaft „ENOVA Windpark Jembke Betriebs GmbH & Co. KG“ hat nur 3 Anlagen: WEA 2 und 3 (N149, 125,4 m Nabe, September 2025) und WEA1 (N131, 134 m, Oktober 2025). Daneben stehen 11 V80 von 2003 (100 m Nabe, ENOVA Boldecker Land und Momentum); 10 N163 sind in Planung. H hat 5 Anlagen, also müssten 2 V80 dazukommen. Auch dann passt es schlecht:
- Die Nachläufe passen mit 0,42 deutlich schlechter als in Hankensbüttel (0,60).
- Die Höhen der Naben passen nicht zum Druck (Korrelation −0,13; Hankensbüttel +0,98).
- In Jembke wären 3 der 5 Anlagen hoch; H zeigt aber nur 2 Anlagen mit viel Wind und tiefem Druck.
- Die Naben liegen 57 m unter dem Druckwert.

**Andere Kandidaten:** Dedelstorf (14× V90, 125 m Nabe) liegt 1 km vom Optimum des Druckfelds entfernt, passt aber bei den Nachläufen schlechter (0,50), und die Naben streuen dort nicht. H hat dasselbe Datenformat wie T (Standardabweichung, Drucksensor, 6 Nachkommastellen); das passt zu zwei Nordex-Parks.

**Nicht Wittighausen** (9× V47, Main-Tauber-Kreis): Würzburg korreliert mit H nur zu 0,41, die Naben lägen dort bei rund 370 m über NN, und die dichten V47 müssten starke Nachläufe zeigen.

## Die Leistungskurve der Challenge ist die Nordex N149 im 4,5-MW-Modus

**Entscheidung im Team (24.10.): Für T gilt die Kurve der Challenge.** Die Organisatoren bestätigen den Typ N149, und in Uetze stehen genau diese Anlagen mit 4.500 kW (Delta4000 TS105).

Die drei identischen Kurven `T*_power_curve.xlsx` beschreiben eine moderne 4,5-MW-Anlage: Einschalten bei 3 m/s, 4.500 kW ab 11,5 m/s, ab 20,5 m/s abgeregelt bis 2.529 kW bei 26 m/s.

**Treffer:** die Nordex-Tabelle mit 5.000 kW je Luftdichte, die das Team gefunden hat ([nordex_5000kw_dichte.csv](nordex_5000kw_dichte.csv); Typ und Dokument noch zu benennen).

- **Ab 21 m/s** stimmen beide Kurven auf das kW überein (4.307 … 2.529 kW). Bei 20,5 m/s hat die Challenge 4.455 kW, Nordex 4.482 kW.
- **3–8,5 m/s:** Die Tabelle endet bei 1,100 kg/m³. Linear in der Dichte fortgeschrieben, trifft sie die Challenge bei 1,21–1,22 kg/m³ auf unter 1 % (8 m/s: 2.536 statt 2.527 kW). Die Challenge-Kurve gilt also für etwa die Normdichte 1,225 kg/m³.
- **9–11,5 m/s** geht die Challenge-Kurve weicher auf 4.500 kW zu, als eine bei 4.500 kW abgeschnittene 5-MW-Kurve es täte. Das passt zu einem eigenen 4,5-MW-Betriebsmodus desselben Typs, nicht zu einer nachträglichen Kappung.
- Das Abregeln ab 19–20 m/s bis zur Abschaltung bei 26 m/s ist typisch für Nordex Delta4000 (N149). Die Anlagen in Uetze sind als N149/4.0-4.5 mit 4.500 kW gemeldet; die Kurve der Challenge ist also die echte Kurve von T bei Normdichte.
- **Luftdichte vor Ort:** Aus Druck und Temperatur der Daten folgen bei T im Mittel 1,190 kg/m³ (5–95 %: 1,154–1,220), bei H 1,183. Die Challenge-Kurve unterstellt etwa 1,225. Im Teillastbereich liefert die Anlage bei 1,19 rund 3 % weniger. Für Bonus 2 (Zusatzparameter) ließe sich die Kurve mit der Dichtetabelle je Zeitschritt korrigieren; das berührt S4 und wäre im Team zu klären.
- **Folge:** Über den gemessenen Wind von Juli bis September liefert die Kurve im Mittel 1.011–1.210 kW je Turbine (Kapazitätsfaktor 22–27 %). Die kWh-Zahlen für T sind damit echte Größenordnungen; die Frage nach einer Verfremdung der Kurve entfällt.

## Quellen

- Marktstammdatenregister der Bundesnetzagentur, öffentliche Einheitensuche: https://www.marktstammdatenregister.de/MaStR/Einheit/Einheiten/ErweiterteOeffentlicheEinheitenuebersicht (Datenlizenz Deutschland – Namensnennung 2.0)
- Geländehöhe: Open-Meteo Elevation API (Copernicus DEM GLO-90): https://open-meteo.com/en/docs/elevation-api
- DWD, 10-Minuten-Wind und -Lufttemperatur/-druck `recent`: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/ (CC BY 4.0)
- BayWa r.e., Referenzprojekt Windpark Wilhelmshöhe: https://www.baywa-re.de/en/references/selected-completed-projects/wilhelmshoehe
- Genehmigungsunterlagen Windpark Wilhelmshöhe II (UVP-Portal Niedersachsen): https://uvp-verbund.de/documents-ige-ng/igc_ni/F8B94492-1525-4ED7-A82E-30C234CD40C1/1.2-WHII-Kurzbeschreibung.pdf
- energate messenger, „DEW21 builds wind farm in Lower Saxony“ (21.02.2023): https://www.energate-messenger.com/news/230761/dew21-builds-wind-farm-in-lower-saxony
- BayWa r.e., Verkauf Jembke, Beckum, Reichenbach (10/2024): https://www.baywa-re.de/en/news/baywa-r-e-sells-three-german-wind-projects-with-a-capacity-of-56-mw
- DWD, Stundenwerte Wind und Luftdruck `recent`: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/ (CC BY 4.0)
- AN Bonus 1000/54, technische Dokumentation: https://media.mwps.world/static/2020/10/an-bonus-1000_54-technical-documentation.pdf
- windpowerlib, OEDB-Leistungskurven: https://github.com/wind-python/windpowerlib/tree/master/windpowerlib/oedb
- Challenge-Daten und README der Organisatoren (CHALLENGE.md, Abschnitt 5; SPEC.md, „Challenge-Daten“)
