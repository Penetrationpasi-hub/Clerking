#!/usr/bin/env node
// Markiert duale Studien im Bestand, statt sie zu löschen.
//
//   node src/bereinigen.mjs --trocken   (nur zeigen, nichts schreiben)
//   node src/bereinigen.mjs             (Bestand und CSV neu schreiben)
//
// Der Filter im Sammellauf (src/ausbildungsarten.mjs) gilt erst für
// künftige Läufe — der Bestand enthält bereits duale Studien. Dieses Skript
// holt sie nach: es setzt an den betroffenen Berufen `art: "duales_studium"`.
// CSV und Excel blenden diese Berufe aus. Betriebe, die danach keine
// Ausbildung mehr haben, bleiben trotzdem im JSON — der Kontakt ist für
// Initiativbewerbungen wertvoll, und eine falsche Markierung lässt sich
// zurücknehmen.
//
// Nach dem Lauf muss die Excel-Übersicht neu gebaut werden:
//   python3 scripts/export-xlsx.py

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_DUALES_STUDIUM, textIstDualesStudium } from './ausbildungsarten.mjs';
import { ladeBestand, speichereBestand } from './speicher.mjs';
import { bestandAlsCsv } from './csv.mjs';
import { PFADE } from './sammeln.mjs';

function argumenteLesen(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const naechstes = argv[i + 1];
    if (naechstes === undefined || naechstes.startsWith('--')) werte[name] = true;
    else {
      werte[name] = naechstes;
      i += 1;
    }
  }
  return werte;
}

function istDualerBeruf(beruf) {
  return beruf?.art === ART_DUALES_STUDIUM || textIstDualesStudium(beruf?.beruf);
}

/**
 * Markiert duale Studien in einem Bestand. Es wird nichts gelöscht.
 * @param {{betriebe: any[]}} bestand
 * @returns {{bestand: any, markierteBerufe: number, nurDualeBetriebe: string[]}}
 */
export function bereinige(bestand) {
  const betriebe = [];
  const nurDualeBetriebe = [];
  let markierteBerufe = 0;

  for (const betrieb of bestand.betriebe ?? []) {
    const kopie = {
      ...betrieb,
      berufe: (betrieb.berufe ?? []).map((beruf) => ({ ...beruf })),
    };

    for (const beruf of kopie.berufe) {
      if (!istDualerBeruf(beruf) || beruf.art === ART_DUALES_STUDIUM) continue;
      beruf.art = ART_DUALES_STUDIUM;
      markierteBerufe += 1;
    }

    const ausbildung = kopie.berufe.filter((beruf) => beruf.art !== ART_DUALES_STUDIUM);
    if (kopie.berufe.length > 0 && ausbildung.length === 0) {
      nurDualeBetriebe.push(`${kopie.arbeitgeber} (${kopie.ort})`);
    }

    betriebe.push(kopie);
  }

  return {
    bestand: { ...bestand, anzahlBetriebe: betriebe.length, betriebe },
    markierteBerufe,
    nurDualeBetriebe,
  };
}

export async function bereinigeBestand({ argv = [], protokoll = console.log } = {}) {
  const argumente = argumenteLesen(argv);
  const trocken = Boolean(argumente.trocken);
  const bestand = await ladeBestand(PFADE.bestand);
  const ergebnis = bereinige(bestand);

  protokoll(`Berufe gesamt             : ${(bestand.betriebe ?? []).reduce((s, b) => s + (b.berufe ?? []).length, 0)}`);
  protokoll(`Duale Studien markiert    : ${ergebnis.markierteBerufe}`);
  protokoll(`Betriebe                  : ${(bestand.betriebe ?? []).length}`);
  protokoll(`davon nur duales Studium  : ${ergebnis.nurDualeBetriebe.length} (bleiben im Bestand, nicht in CSV/Excel)`);

  if (ergebnis.nurDualeBetriebe.length > 0) {
    for (const eintrag of ergebnis.nurDualeBetriebe) protokoll(`  - ${eintrag}`);
  }

  if (!trocken) {
    await speichereBestand(PFADE.bestand, ergebnis.bestand);
    await mkdir(dirname(PFADE.csv), { recursive: true });
    await writeFile(PFADE.csv, bestandAlsCsv(ergebnis.bestand), 'utf8');
    protokoll('');
    protokoll(`Geschrieben: ${PFADE.bestand}`);
    protokoll(`Geschrieben: ${PFADE.csv}`);
    protokoll('Excel-Übersicht neu bauen: python3 scripts/export-xlsx.py');
  } else {
    protokoll('');
    protokoll('(Trockenlauf – es wurde nichts geschrieben)');
  }

  return ergebnis;
}

const direktAufgerufen = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direktAufgerufen) {
  bereinigeBestand({ argv: process.argv.slice(2) }).catch((fehler) => {
    console.error('Bereinigung fehlgeschlagen:', fehler);
    process.exit(1);
  });
}
