#!/usr/bin/env node
// Bereinigt den Bestand von dualen Studien.
//
//   node src/bereinigen.mjs --trocken   (nur zeigen, nichts schreiben)
//   node src/bereinigen.mjs             (Bestand und CSV neu schreiben)
//
// Der Filter im Sammellauf (src/ausbildungsarten.mjs) gilt erst für
// künftige Läufe — der Bestand enthält bereits duale Studien. Dieses Skript
// holt sie nach: es entfernt die Berufe, die nach einem dualen Studium
// aussehen, und die Betriebe, die danach nichts mehr zu bieten haben.
//
// Bewusst wird NICHHT der ganze Betrieb gelöscht, wenn er auch aus einer
// anderen Quelle stammt (Kammer-Import, Handeingabe): das sind Einträge, die
// jemand mit Absicht gepflegt hat.
//
// Nach dem Lauf muss die Excel-Übersicht neu gebaut werden:
//   python3 scripts/export-xlsx.py

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textIstDualesStudium } from './ausbildungsarten.mjs';
import { ladeBestand, speichereBestand } from './speicher.mjs';
import { bestandAlsCsv } from './csv.mjs';
import { PFADE } from './sammeln.mjs';

/** Quellen, die von Hand gepflegt wurden — die bleiben erhalten. */
const BA_QUELLE = 'ba-jobsuche';

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

/**
 * Entfernt die dualen Studien aus einem Bestand.
 * @param {{betriebe: any[]}} bestand
 * @returns {{bestand: any, entfernteBerufe: number, entfernteBetriebe: string[], behalteneBetriebe: string[]}}
 */
export function bereinige(bestand) {
  const betriebe = [];
  const entfernteBetriebe = [];
  const behalteneBetriebe = [];
  let entfernteBerufe = 0;

  for (const betrieb of bestand.betriebe ?? []) {
    const berufe = betrieb.berufe ?? [];
    const behalten = berufe.filter((beruf) => !textIstDualesStudium(beruf.beruf));
    entfernteBerufe += berufe.length - behalten.length;

    if (behalten.length === berufe.length) {
      betriebe.push(betrieb);
      continue;
    }

    betrieb.berufe = behalten;
    betrieb.anzahlAnzeigen = behalten.reduce(
      (summe, beruf) => summe + (beruf.anzahlAnzeigen ?? 0),
      0,
    );

    if (behalten.length > 0) {
      betriebe.push(betrieb);
      continue;
    }

    // Nur noch duale Studies da — für den Bestand ist der Betrieb dann
    // kein Ausbildungsbetrieb. Aus anderen Quellen stammende Betriebe
    // bleiben aber erhalten: die hat jemand von Hand eingetragen.
    const quellen = betrieb.quellen ?? [];
    if (quellen.length > 0 && quellen.every((quelle) => quelle === BA_QUELLE)) {
      entfernteBetriebe.push(`${betrieb.arbeitgeber} (${betrieb.ort})`);
    } else {
      behalteneBetriebe.push(`${betrieb.arbeitgeber} (${betrieb.ort})`);
      betriebe.push(betrieb);
    }
  }

  return {
    bestand: { ...bestand, anzahlBetriebe: betriebe.length, betriebe },
    entfernteBerufe,
    entfernteBetriebe,
    behalteneBetriebe,
  };
}

export async function bereinigeBestand({ argv = [], protokoll = console.log } = {}) {
  const argumente = argumenteLesen(argv);
  const trocken = Boolean(argumente.trocken);
  const bestand = await ladeBestand(PFADE.bestand);
  const ergebnis = bereinige(bestand);

  protokoll(`Berufe gesamt      : ${(bestand.betriebe ?? []).reduce((s, b) => s + (b.berufe ?? []).length, 0)}`);
  protokoll(`Duale Studien weg : ${ergebnis.entfernteBerufe}`);
  protokoll(`Betriebe vorher   : ${(bestand.betriebe ?? []).length}`);
  protokoll(`Betriebe nachher  : ${ergebnis.bestand.betriebe.length}`);

  if (ergebnis.entfernteBetriebe.length > 0) {
    protokoll(`Betriebe ohne Ausbildung entfernt (${ergebnis.entfernteBetriebe.length}):`);
    for (const eintrag of ergebnis.entfernteBetriebe) protokoll(`  - ${eintrag}`);
  }
  if (ergebnis.behalteneBetriebe.length > 0) {
    protokoll(`Betriebe behalten, aber ohne Ausbildungsberuf (${ergebnis.behalteneBetriebe.length}):`);
    for (const eintrag of ergebnis.behalteneBetriebe) protokoll(`  - ${eintrag}`);
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
