# Ausbildungsbetriebe

Sammelt ausbildende Betriebe der Region Stuttgart / Rems-Murr und baut daraus
einen Bestand, der über die Saison wächst.

**Der Kern in einem Satz:** Die BA-Jobsuche zeigt immer nur den aktuellen
Stand — wer sie täglich abfragt und jeden Arbeitgeber mit Beruf und Ort
wegschreibt, hat nach einer Saison die Liste, die es nirgends zu kaufen gibt:
alle Betriebe der Region, die ausbilden, auch die, bei denen heute nichts
offen ist.

Genau diese Betriebe sind für Initiativbewerbungen die interessanten. Eine
offene Anzeige hat 40 Mitbewerber. Ein Betrieb, der letztes Jahr ausgebildet
hat und dieses Jahr noch nichts ausgeschrieben hat, hat null.

## Schnellstart

Keine Abhängigkeiten, kein `npm install` — nur Node 20 oder neuer.

```bash
node src/sammeln.mjs --trocken   # Probelauf, schreibt nichts
node src/sammeln.mjs             # echter Sammellauf
npm run web                      # Liste im Browser ansehen
npm test                         # 30 Tests
```

## Was wo liegt

```
konfig.json          Orte und Umkreise, die abgefragt werden
src/ba-quelle.mjs    BA-Jobsuche-API (angebotsart=4 = Ausbildung)
src/normalisieren.mjs Schreibweisen zusammenführen
src/speicher.mjs     Bestand fortschreiben
src/sammeln.mjs      Sammellauf (CLI)
src/import-csv.mjs   Kammer-Listen einlesen
daten/betriebe.json  der Bestand — die eigentliche Sache
daten/betriebe.csv   dasselbe für Excel (Semikolon + BOM)
daten/historie.jsonl Protokoll: was wurde wann zum ersten Mal gesehen
web/index.html       Ansicht zum Filtern und Exportieren
```

## Wie der Bestand wächst

Jeder Lauf fragt die BA für jeden Ort in `konfig.json` ab und trägt jeden
Treffer ein. **Gelöscht wird nie.** Verschwindet eine Anzeige, bleibt der
Betrieb mit `zuletztGesehen` stehen — und wird damit erst richtig wertvoll.

Zwei Dinge, an denen so eine Sammlung sonst scheitert, sind hier gelöst:

**Schreibweisen.** Die BA liefert Arbeitgebernamen frei getippt. „Müller
GmbH", „Mueller GmbH & Co. KG" und „Müller e.K." in Waiblingen laufen auf
einen Datensatz zusammen; alle gesehenen Schreibweisen werden mitgeführt.
Der Abgleich läuft über Name + Ort, nicht über die `kundennummerHash` der
BA — sonst läge eine Kammer-Liste ohne diesen Hash am Ende neben den
BA-Treffern statt in ihnen.

**Zählung.** `anzahlAnzeigen` zählt Referenznummern, nicht Sichtungen. Eine
Stelle, die 60 Tage offen steht, bleibt eine Anzeige. Sonst stünde nach
einem halben Jahr bei jedem Betrieb eine Zahl, die nur sagt, wie oft der
Sammler gelaufen ist.

Eigene Ergänzungen am Datensatz (`notiz`, Ansprechpartner, Telefonnummer)
überleben jeden weiteren Sammellauf — der Abgleich fasst nur seine eigenen
Felder an.

## Täglich laufen lassen

`.github/workflows/sammeln.yml` macht das ohne Server und ohne Kosten:
täglich 04:17 UTC, Tests, Sammellauf, Ergebnis wird zurück ins Repository
committet.

**Wichtig:** GitHub startet `schedule`-Workflows nur vom Standard-Branch aus
(hier: `main`). Solange die Änderung auf einem anderen Branch liegt, läuft
nur der manuelle Start über *Actions → Ausbildungsbetriebe sammeln → Run
workflow*.

## Kammer-Listen dazunehmen

Der schnellste Weg zu den kleinen Betrieben, die nie eine Anzeige schalten,
führt nicht über einen Crawler, sondern über ein Telefonat:

- **HWK Region Stuttgart** führt eine Betriebssuche, in der sich nach
  ausbildenden Betrieben filtern lässt.
- **IHK Region Stuttgart** führt nach § 34 BBiG ein Verzeichnis aller
  Ausbildungsverhältnisse. Das ist nicht öffentlich — aber die
  Ausbildungsberatung stellt auf Anfrage Kontakt zu Betrieben her, auch ohne
  ausgeschriebene Stelle.

Als Maßnahmeträger nach § 45 SGB III mit Vermittlungsauftrag anrufen und
sagen, wofür die Daten gebraucht werden. Was dabei herauskommt, kommt hier
in denselben Bestand:

```bash
node src/import-csv.mjs hwk-liste.csv --quelle hwk-stuttgart
```

Erkannt werden `Arbeitgeber`/`Firma`/`Betrieb`, `Ort`/`Stadt`, `PLZ`,
`Strasse`, `Beruf`/`Ausbildungsberufe` (mehrere mit `|` oder `,` getrennt),
Semikolon und Komma als Trennzeichen. Was über Name + Ort auf einen
vorhandenen Betrieb passt, wird zusammengeführt statt doppelt angelegt; die
Quelle steht danach am Datensatz.

## Grenzen — ehrlich

- **Anonyme Ausschreibungen** haben kein Arbeitgeberfeld und werden verworfen.
  Sie sind für Initiativbewerbungen ohnehin unbrauchbar.
- **Personaldienstleister** schreiben viele Ausbildungsstellen für Dritte aus.
  Die stehen dann als Betrieb im Bestand, obwohl sie nicht selbst ausbilden.
  Beim Durchgehen der Liste auffallen lassen und in `notiz` vermerken.
- **Trefferdeckel:** Die BA gibt pro Suche nur eine begrenzte Trefferzahl
  aus. Wenn ein Ort mit großem Umkreis an die Grenze stößt, die Suche über
  `suchbegriffe` in `konfig.json` in Berufsfelder zerlegen — dann läuft eine
  Abfrage je Begriff.
- **Die API ist nicht dokumentiert zugesichert.** Basis-URL und Key sind
  dieselben, die die BA-eigene App benutzt. Ändert die BA die Feldnamen, sind
  in `stelleAusRohdaten()` schon beide bekannten Schreibweisen hinterlegt;
  bei einer größeren Umstellung kann trotzdem ein Lauf leer bleiben. Der
  `letzter-lauf.json` zeigt, ob noch etwas ankommt.
- **Die Sammlung ersetzt keine Beratung.** Dass ein Betrieb 2026 ausgebildet
  hat, heißt nicht, dass er 2027 einen Platz hat. Es heißt nur: Anrufen
  lohnt sich.

## Datenschutz

Gesammelt werden ausschließlich Betriebsdaten aus öffentlich abrufbaren
Stellenanzeigen — Firmenname, Ort, Ausbildungsberuf. Keine Namen von
Ansprechpartnern, keine Bewerberdaten. Wer später Ansprechpartner in `notiz`
ergänzt, sollte das Repository nicht öffentlich stellen.
