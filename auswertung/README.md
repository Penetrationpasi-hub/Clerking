# Ausbildungsmarkt Region Stuttgart - Auswertung

Stand: **2026-11-23** · automatisch erzeugt von `scripts/auswertung.py` aus `daten/betriebe.json`
und `daten/laeufe.jsonl`. Nur Betriebe in Baden-Württemberg (Region Stuttgart).

## Auf einen Blick

| Kennzahl | Wert |
|---|---:|
| Betriebe im Bestand | 4.064 |
| davon mit aktueller Anzeige | 3.385 |
| davon **ohne aktuelle Anzeige** (Initiativbewerbung) | 679 |
| aktive Angebote (Betrieb × Beruf) | 5.434 |
| verschiedene Berufe mit aktiver Anzeige | 324 |
| Angebote mit Beginn schon erreicht (sofort/Restplätze) | 522 |
| Angebote für Beginn 2027 | 4.890 |
| Betriebe mit Anzeige: 2026-09-28 → 2026-11-23 | 2.771 → 3.385 (+614) |

## Zu- und Abgänge der letzten vollen Wochen

| Woche ab | neu ausgeschrieben | verschwunden | Saldo |
|---|---:|---:|---:|
| 26.10.2026 (KW 44) | 160 | 130 | +30 |
| 02.11.2026 (KW 45) | 259 | 121 | +138 |
| 09.11.2026 (KW 46) | 161 | 110 | +51 |
| 16.11.2026 (KW 47) | 948 | 731 | +217 |

## Grafiken

![Verlauf](markt-verlauf.png)

![Zu- und Abgänge](zu-und-abgaenge.png)

![Top-Berufe](top-berufe.png)

![Trend](trend-berufe.png)

![Ausbildungsbeginn](ausbildungsbeginn.png)

![Orte](top-orte.png)

## Lesehilfe

- **Angebot** = ein Betrieb mit einem Ausbildungsberuf. Mehrere Anzeigen desselben Betriebs
  für denselben Beruf zählen einmal - das misst die Breite des Marktes, nicht die Zahl der Plätze.
- **Aktiv** = beim letzten Sammellauf noch in der BA-Jobsuche zu finden.
- **Verschwunden** heißt: seit dem Tag nicht mehr gesehen. Meist besetzt oder zurückgezogen -
  die BA sagt nicht, welches von beiden.
- Wochenwerte beginnen am 28.09.2026; davor hat sich der Bestand erst aufgebaut.
- `gefundeneStellen` in `laeufe.jsonl` zählt Treffer je Ort - die Umkreise überlappen, eine
  Anzeige kann also mehrfach darin stecken. Für Trends `aktiveBetriebe`/`aktiveAngebote` nehmen.
