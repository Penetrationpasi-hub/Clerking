#!/usr/bin/env python3
"""Auswertung: Wie läuft der Ausbildungsmarkt in der Region gerade?

Liest daten/betriebe.json und daten/laeufe.jsonl und schreibt nach
auswertung/:

    markt-verlauf.png        aktive Betriebe und Angebote je Sammellauf
    zu-und-abgaenge.png      neue und verschwundene Angebote je Woche
    top-berufe.png           Berufe mit den meisten aktiven Betrieben
    trend-berufe.png         Berufe mit den meisten neuen Angeboten (28 Tage)
    ausbildungsbeginn.png    aktive Angebote nach Ausbildungsbeginn
    top-orte.png             Orte mit den meisten aktiven Betrieben
    README.md                Kurzbericht mit den Zahlen dazu

und zusätzlich daten/angebote.csv: eine Zeile je Betrieb x Beruf - flach,
ohne verschachtelte Listen, direkt für Excel-Pivot oder pandas.

    pip install matplotlib
    python3 scripts/auswertung.py
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

PROJEKT = Path(__file__).resolve().parent.parent
BESTAND = PROJEKT / "daten" / "betriebe.json"
LAEUFE = PROJEKT / "daten" / "laeufe.jsonl"
ANGEBOTE_CSV = PROJEKT / "daten" / "angebote.csv"
ZIEL = PROJEKT / "auswertung"

# Nur die Region Stuttgart. Mehrdeutige Ortsnamen ("Schorndorf" gibt es auch
# in der Oberpfalz) haben an einigen Tagen Treffer aus Bayern hereingespült.
REGION = "BADEN_WUERTTEMBERG"

# Der erste Lauf füllt den Bestand in einem Rutsch, und am 24.09. kamen drei
# weitere Kreise dazu. "Neu" heißt vor diesem Tag "neu für den Sammler", nicht
# "neu am Markt" - die Wochenzahlen beginnen deshalb erst mit der Woche danach.
ERWEITERUNG = date(2026, 9, 24)
AUSWERTUNG_AB = date(2026, 9, 28)

AKZENT = "#8a5a2b"
AKZENT_HELL = "#d8a76a"
GRAU = "#a3a096"
ROT = "#b5523b"

plt.rcParams.update(
    {
        "figure.dpi": 110,
        "savefig.dpi": 110,
        "font.size": 10,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#e2e1dc",
        "grid.linewidth": 0.8,
        "axes.axisbelow": True,
    }
)


def tag(text):
    return date.fromisoformat(text[:10])


def wochenbeginn(d):
    return d - timedelta(days=d.weekday())


def kurz(text, laenge=48):
    return text if len(text) <= laenge else text[: laenge - 1] + "…"


def lade():
    bestand = json.loads(BESTAND.read_text(encoding="utf-8"))
    laeufe = {}
    if LAEUFE.exists():
        for zeile in LAEUFE.read_text(encoding="utf-8").splitlines():
            if zeile.strip():
                lauf = json.loads(zeile)
                laeufe[lauf["datum"]] = lauf  # mehrere Läufe am Tag: der letzte zählt
    return bestand, [laeufe[d] for d in sorted(laeufe)]


def angebote_aus(bestand):
    """Eine Zeile je Betrieb x Beruf - die Einheit, in der der Markt zählt."""
    stand = bestand["aktualisiert"]
    for betrieb in bestand["betriebe"]:
        for beruf in betrieb.get("berufe", []):
            beginne = beruf.get("ausbildungsbeginne", [])
            yield {
                "Arbeitgeber": betrieb.get("arbeitgeber", ""),
                "Ort": betrieb.get("ort", ""),
                "PLZ": betrieb.get("plz", ""),
                "Region": betrieb.get("region", ""),
                "Beruf": beruf.get("beruf", ""),
                "ErstmalsGesehen": beruf.get("erstmalsGesehen", ""),
                "ZuletztGesehen": beruf.get("zuletztGesehen", ""),
                "Aktiv": "ja" if beruf.get("zuletztGesehen") == stand else "nein",
                "AnzahlAnzeigen": beruf.get("anzahlAnzeigen", 0),
                "Ausbildungsbeginn": beginne[-1] if beginne else "",
                "AlleAusbildungsbeginne": " ".join(beginne),
                "Schluessel": betrieb.get("schluessel", ""),
            }


def schreibe_angebote_csv(angebote):
    with ANGEBOTE_CSV.open("w", encoding="utf-8-sig", newline="") as datei:
        schreiber = csv.DictWriter(datei, fieldnames=list(angebote[0].keys()), delimiter=";")
        schreiber.writeheader()
        schreiber.writerows(angebote)


def speichere(fig, name):
    fig.tight_layout()
    fig.savefig(ZIEL / name)
    plt.close(fig)


def balken_horizontal(werte, titel, xlabel, name, farbe=AKZENT):
    namen = [kurz(n) for n, _ in werte][::-1]
    zahlen = [z for _, z in werte][::-1]
    fig, ax = plt.subplots(figsize=(10, 0.34 * len(werte) + 1.4))
    ax.barh(namen, zahlen, color=farbe)
    for i, z in enumerate(zahlen):
        ax.text(z, i, f" {z}", va="center", fontsize=8.5)
    # Titel über die ganze Breite, nicht nur über die Balken - sonst schneidet
    # ihn die Spalte mit den langen Berufsbezeichnungen ab.
    fig.suptitle(titel, x=0.01, ha="left", fontweight="bold")
    ax.set_xlabel(xlabel)
    ax.grid(axis="y", visible=False)
    ax.margins(x=0.08)
    speichere(fig, name)


def grafik_verlauf(laeufe):
    laeufe = [l for l in laeufe if "aktiveBetriebe" in l]
    if not laeufe:
        return
    tage = [tag(l["datum"]) for l in laeufe]
    fig, ax = plt.subplots(figsize=(10, 4.8))
    ax.plot(tage, [l["aktiveAngebote"] for l in laeufe], color=AKZENT_HELL, lw=2, label="aktive Angebote (Betrieb × Beruf)")
    ax.plot(tage, [l["aktiveBetriebe"] for l in laeufe], color=AKZENT, lw=2.4, label="Betriebe mit aktueller Anzeige")
    ax.plot(tage, [l["betriebeNachher"] for l in laeufe], color=GRAU, lw=1.5, ls="--", label="Betriebe im Bestand (wächst nur)")
    ax.axvline(ERWEITERUNG, color=GRAU, lw=0.8, ls=":")
    ax.annotate("ab hier alle 6 Kreise", (ERWEITERUNG, 0), xytext=(5, 14), textcoords="offset points",
                fontsize=8, color="#6b6960")
    ax.set_title("Ausbildungsmarkt Region Stuttgart - Verlauf je Sammellauf", loc="left", fontweight="bold")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d.%m."))
    ax.set_ylim(bottom=0)
    ax.legend(loc="lower right", frameon=False)
    speichere(fig, "markt-verlauf.png")


def grafik_zu_abgaenge(angebote, stand):
    zu, ab = Counter(), Counter()
    for a in angebote:
        erst = tag(a["ErstmalsGesehen"])
        if erst >= AUSWERTUNG_AB:
            zu[wochenbeginn(erst)] += 1
        if a["Aktiv"] == "nein":
            weg = tag(a["ZuletztGesehen"]) + timedelta(days=1)
            if weg >= AUSWERTUNG_AB:
                ab[wochenbeginn(weg)] += 1
    wochen = sorted(set(zu) | set(ab))
    x = range(len(wochen))
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.bar([i - 0.2 for i in x], [zu[w] for w in wochen], 0.4, color=AKZENT, label="neu ausgeschrieben")
    ax.bar([i + 0.2 for i in x], [ab[w] for w in wochen], 0.4, color=GRAU, label="verschwunden (besetzt/zurückgezogen)")
    ax.set_xticks(list(x), [f"KW {w.isocalendar()[1]}\n{w:%d.%m.}" for w in wochen], fontsize=8.5)
    ax.set_title("Zu- und Abgänge je Woche (Angebote = Betrieb × Beruf)", loc="left", fontweight="bold")
    if wochen and wochen[-1] + timedelta(days=6) > tag(stand):
        hoehe = max(zu[wochen[-1]], ab[wochen[-1]])
        ax.text(len(wochen) - 1, hoehe, "Woche\nnoch nicht zu Ende", ha="center", va="bottom",
                fontsize=7.5, color="#6b6960")
        ax.margins(y=0.12)
    ax.legend(frameon=False)
    ax.grid(axis="x", visible=False)
    speichere(fig, "zu-und-abgaenge.png")
    return zu, ab


def grafik_beginn(aktiv, stand):
    monate = Counter(a["Ausbildungsbeginn"][:7] for a in aktiv if a["Ausbildungsbeginn"])
    ohne = sum(1 for a in aktiv if not a["Ausbildungsbeginn"])
    # Einzelne Ausreißer nach hinten (Tippfehler in der Anzeige) würden die
    # Achse um Jahre strecken, ohne etwas zu zeigen.
    monate = {m: n for m, n in monate.items() if n >= 5}
    reihen = sorted(monate)
    farben = [ROT if m <= stand[:7] else AKZENT for m in reihen]
    fig, ax = plt.subplots(figsize=(10, 4.4))
    ax.bar([f"{m[5:]}/{m[2:4]}" for m in reihen], [monate[m] for m in reihen], color=farben)
    for i, m in enumerate(reihen):
        ax.text(i, monate[m], str(monate[m]), ha="center", va="bottom", fontsize=8.5)
    ax.set_title("Aktive Angebote nach Ausbildungsbeginn", loc="left", fontweight="bold")
    ax.set_xlabel(
        f"Monat/Jahr · rot = Beginn liegt in der Vergangenheit (Quereinstieg ins laufende Jahr / Restplätze)"
        f" · ohne Angabe in der Anzeige: {ohne}"
    )
    ax.grid(axis="x", visible=False)
    speichere(fig, "ausbildungsbeginn.png")
    return monate, ohne


def main():
    ZIEL.mkdir(exist_ok=True)
    bestand, laeufe = lade()
    stand = bestand["aktualisiert"]

    alle = list(angebote_aus(bestand))
    schreibe_angebote_csv(alle)
    angebote = [a for a in alle if a["Region"] == REGION]
    aktiv = [a for a in angebote if a["Aktiv"] == "ja"]

    betriebe = [b for b in bestand["betriebe"] if b.get("region") == REGION]
    aktive_betriebe = {a["Schluessel"] for a in aktiv}

    grafik_verlauf(laeufe)
    zu, ab = grafik_zu_abgaenge(angebote, stand)
    monate, ohne_beginn = grafik_beginn(aktiv, stand)

    top_berufe = Counter(a["Beruf"] for a in aktiv).most_common(20)
    balken_horizontal(top_berufe, f"Top 20 Berufe - Betriebe mit aktiver Anzeige (Stand {stand})",
                      "Betriebe", "top-berufe.png")

    grenze = (tag(stand) - timedelta(days=27)).isoformat()
    trend = Counter(a["Beruf"] for a in angebote if a["ErstmalsGesehen"] >= max(grenze, AUSWERTUNG_AB.isoformat()))
    balken_horizontal(trend.most_common(15), "Wo gerade neu ausgeschrieben wird - neue Angebote der letzten 28 Tage",
                      "neue Betrieb × Beruf-Angebote", "trend-berufe.png", farbe=AKZENT_HELL)

    orte = Counter()
    for b in betriebe:
        if b["schluessel"] in aktive_betriebe:
            orte[b.get("ort", "").split(",")[0]] += 1
    balken_horizontal(orte.most_common(15), "Orte mit den meisten ausbildenden Betrieben (aktive Anzeige)",
                      "Betriebe", "top-orte.png")

    # --- Kurzbericht --------------------------------------------------------
    letzte_wochen = sorted(set(zu) | set(ab))[-5:-1]  # ohne die laufende Woche
    sofort = sum(n for m, n in monate.items() if m <= stand[:7])
    naechstes_jahr = sum(n for m, n in monate.items() if m[:4] > stand[:4])
    ruhend = len(betriebe) - len(aktive_betriebe)
    erster = next((l for l in laeufe if tag(l["datum"]) >= AUSWERTUNG_AB), None)
    letzter = laeufe[-1] if laeufe else None

    zeilen = [
        "# Ausbildungsmarkt Region Stuttgart - Auswertung",
        "",
        f"Stand: **{stand}** · automatisch erzeugt von `scripts/auswertung.py` aus `daten/betriebe.json`",
        "und `daten/laeufe.jsonl`. Nur Betriebe in Baden-Württemberg (Region Stuttgart).",
        "",
        "## Auf einen Blick",
        "",
        "| Kennzahl | Wert |",
        "|---|---:|",
        f"| Betriebe im Bestand | {len(betriebe):,} |",
        f"| davon mit aktueller Anzeige | {len(aktive_betriebe):,} |",
        f"| davon **ohne aktuelle Anzeige** (Initiativbewerbung) | {ruhend:,} |",
        f"| aktive Angebote (Betrieb × Beruf) | {len(aktiv):,} |",
        f"| verschiedene Berufe mit aktiver Anzeige | {len({a['Beruf'] for a in aktiv}):,} |",
        f"| Angebote mit Beginn schon erreicht (sofort/Restplätze) | {sofort:,} |",
        f"| Angebote für Beginn {int(stand[:4]) + 1} | {naechstes_jahr:,} |",
    ]
    if erster and letzter:
        zeilen.append(
            f"| Betriebe mit Anzeige: {erster['datum']} → {letzter['datum']} | "
            f"{erster['aktiveBetriebe']:,} → {letzter['aktiveBetriebe']:,} "
            f"({letzter['aktiveBetriebe'] - erster['aktiveBetriebe']:+,}) |"
        )
    zeilen += [
        "",
        "## Zu- und Abgänge der letzten vollen Wochen",
        "",
        "| Woche ab | neu ausgeschrieben | verschwunden | Saldo |",
        "|---|---:|---:|---:|",
    ]
    for w in letzte_wochen:
        zeilen.append(f"| {w:%d.%m.%Y} (KW {w.isocalendar()[1]}) | {zu[w]} | {ab[w]} | {zu[w] - ab[w]:+} |")
    zeilen += [
        "",
        "## Grafiken",
        "",
        "![Verlauf](markt-verlauf.png)",
        "",
        "![Zu- und Abgänge](zu-und-abgaenge.png)",
        "",
        "![Top-Berufe](top-berufe.png)",
        "",
        "![Trend](trend-berufe.png)",
        "",
        "![Ausbildungsbeginn](ausbildungsbeginn.png)",
        "",
        "![Orte](top-orte.png)",
        "",
        "## Lesehilfe",
        "",
        "- **Angebot** = ein Betrieb mit einem Ausbildungsberuf. Mehrere Anzeigen desselben Betriebs",
        "  für denselben Beruf zählen einmal - das misst die Breite des Marktes, nicht die Zahl der Plätze.",
        "- **Aktiv** = beim letzten Sammellauf noch in der BA-Jobsuche zu finden.",
        "- **Verschwunden** heißt: seit dem Tag nicht mehr gesehen. Meist besetzt oder zurückgezogen -",
        "  die BA sagt nicht, welches von beiden.",
        f"- Wochenwerte beginnen am {AUSWERTUNG_AB:%d.%m.%Y}; davor hat sich der Bestand erst aufgebaut.",
        "- `gefundeneStellen` in `laeufe.jsonl` zählt Treffer je Ort - die Umkreise überlappen, eine",
        "  Anzeige kann also mehrfach darin stecken. Für Trends `aktiveBetriebe`/`aktiveAngebote` nehmen.",
        "",
    ]
    # Tausenderpunkt statt -komma, wie im Deutschen üblich
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", ".", "\n".join(zeilen))
    (ZIEL / "README.md").write_text(text, encoding="utf-8")
    print(f"Auswertung geschrieben nach {ZIEL} ({len(aktiv)} aktive Angebote, {len(alle)} Zeilen in {ANGEBOTE_CSV.name})")


if __name__ == "__main__":
    main()
