#!/usr/bin/env python3
"""Baut daten/laeufe.jsonl einmalig aus der Git-Historie nach.

Bis zur Einführung von daten/laeufe.jsonl hat jeder Sammellauf seinen Bericht
nur in daten/letzter-lauf.json geschrieben - und damit den vom Vortag
überschrieben. Die Zeitreihe steckt deshalb nur in den Commits. Dieses Skript
holt sie dort heraus und ergänzt aus dem Bestand desselben Commits, wie viele
Betriebe an dem Tag tatsächlich eine Anzeige draußen hatten.

Danach hängt src/sammeln.mjs jeden Lauf selbst an; das Skript wird nur noch
gebraucht, wenn die Datei verloren geht.

    python3 scripts/laeufe-nachtragen.py
"""
import json
import subprocess
from pathlib import Path

PROJEKT = Path(__file__).resolve().parent.parent
ZIEL = PROJEKT / "daten" / "laeufe.jsonl"
BERICHT = "daten/letzter-lauf.json"
BESTAND = "daten/betriebe.json"


def git(*argumente):
    return subprocess.run(
        ["git", *argumente], cwd=PROJEKT, capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout


def aktive_am(commit, datum):
    """Wie src/sammeln.mjs#marktKennzahlen - nur ohne die Rohstellen."""
    try:
        betriebe = json.loads(git("show", f"{commit}:{BESTAND}"))["betriebe"]
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
        return {}
    return {
        "aktiveBetriebe": sum(1 for b in betriebe if b.get("zuletztGesehen") == datum),
        "aktiveAngebote": sum(
            1 for b in betriebe for e in b.get("berufe", []) if e.get("zuletztGesehen") == datum
        ),
    }


def main():
    commits = git("log", "--reverse", "--format=%H", "--", BERICHT).split()
    zeilen = []
    for commit in commits:
        try:
            bericht = json.loads(git("show", f"{commit}:{BERICHT}"))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue  # Commit, in dem die Datei gelöscht oder kaputt war
        bericht = {
            "datum": bericht["datum"],
            "gefundeneStellen": bericht.get("gefundeneStellen"),
            **aktive_am(commit, bericht["datum"]),
            **{k: v for k, v in bericht.items() if k not in ("datum", "gefundeneStellen")},
            "nachgetragen": True,
        }
        zeilen.append(json.dumps(bericht, ensure_ascii=False, separators=(",", ":")))
        print(bericht["datum"], bericht.get("aktiveBetriebe"))

    ZIEL.write_text("\n".join(zeilen) + "\n", encoding="utf-8")
    print(f"Geschrieben: {ZIEL} ({len(zeilen)} Läufe)")


if __name__ == "__main__":
    main()
