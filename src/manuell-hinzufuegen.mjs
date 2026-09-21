#!/usr/bin/env node
// Einen einzelnen Betrieb ohne CSV-Datei eintragen.
//
// Gedacht als Ziel für den GitHub-Actions-Workflow „Betrieb manuell
// hinzufügen" — der bietet die Felder unten als Formular an (Reiter
// Actions → Betrieb manuell hinzufügen → Run workflow), ganz ohne
// Terminal, Git oder eine Datei anzulegen. Funktioniert genauso von der
// Kommandozeile aus, falls doch mal jemand am PC sitzt:
//
//   node src/manuell-hinzufuegen.mjs \
//     --arbeitgeber "Schreinerei Vogt" --ort Waiblingen \
//     --beruf "Schreiner/in" --webseite https://schreinerei-vogt.de/jobs \
//     --quelle eigene-recherche --notiz "Chef angerufen, nimmt 2027 einen Azubi"

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { betriebsSchluessel } from './normalisieren.mjs';
import { ladeBestand, fuegeStellenEin, speichereBestand, schreibeHistorie } from './speicher.mjs';
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

/**
 * Baut aus Formularfeldern die Stellen-Datensätze, die fuegeStellenEin()
 * erwartet — mehrere Berufe (mit `|`, `,` oder `;` getrennt) ergeben
 * mehrere Datensätze, die aber alle auf denselben Betrieb einzahlen.
 *
 * @param {Record<string, any>} argumente
 * @returns {object[]}
 */
export function stelleAusArgumenten(argumente) {
  const arbeitgeber = String(argumente.arbeitgeber ?? '').trim();
  if (!arbeitgeber) throw new Error('Arbeitgeber fehlt — ohne Namen kann kein Betrieb angelegt werden.');

  const ort = String(argumente.ort ?? '').trim();
  if (!ort) throw new Error('Ort fehlt — Name + Ort sind der Schlüssel, über den der Betrieb wiedererkannt wird.');

  const basis = {
    arbeitgeber,
    ort,
    plz: String(argumente.plz ?? '').trim(),
    strasse: String(argumente.strasse ?? '').trim(),
    region: String(argumente.region ?? '').trim(),
    refnr: '',
    koordinaten: null,
    kundennummerHash: null,
    externeUrl: String(argumente.webseite ?? '').trim() || null,
    veroeffentlicht: null,
  };

  const berufe = String(argumente.beruf ?? '')
    .split(/[|,;]/)
    .map((wert) => wert.trim())
    .filter(Boolean);

  return berufe.length === 0 ? [{ ...basis, beruf: '' }] : berufe.map((beruf) => ({ ...basis, beruf }));
}

/**
 * Trägt einen Betrieb in den echten Bestand ein und schreibt CSV +
 * Historie fort. Getrennt von main(), damit sich der Kern ohne
 * Dateisystem-Seiteneffekte testen lässt (stelleAusArgumenten reicht dafür
 * i. d. R. aus; diese Funktion ist der dünne I/O-Wrapper darum).
 */
export async function fuegeManuellHinzu(argumente) {
  const quelle = String(argumente.quelle ?? '').trim() || 'eigene-recherche';
  const datum = typeof argumente.datum === 'string' ? argumente.datum : new Date().toISOString().slice(0, 10);
  const stellen = stelleAusArgumenten(argumente);

  const vorher = await ladeBestand(PFADE.bestand);
  const { bestand, ereignisse } = fuegeStellenEin(vorher, stellen, { datum, quelle });

  const notiz = String(argumente.notiz ?? '').trim();
  if (notiz) {
    const schluessel = betriebsSchluessel({ arbeitgeber: stellen[0].arbeitgeber, ort: stellen[0].ort });
    const betrieb = bestand.betriebe.find((eintrag) => eintrag.schluessel === schluessel);
    if (betrieb) betrieb.notiz = notiz;
  }

  await speichereBestand(PFADE.bestand, bestand);
  await mkdir(dirname(PFADE.csv), { recursive: true });
  await writeFile(PFADE.csv, bestandAlsCsv(bestand), 'utf8');
  await schreibeHistorie(PFADE.historie, ereignisse);

  return { bestand, ereignisse, betriebeVorher: vorher.betriebe.length };
}

async function main() {
  const argumente = argumenteLesen(process.argv.slice(2));
  const { bestand, ereignisse, betriebeVorher } = await fuegeManuellHinzu(argumente);

  const istNeu = ereignisse.some((e) => e.ereignis === 'neuer_betrieb');
  console.log(
    istNeu
      ? `Neu angelegt: „${argumente.arbeitgeber}" in ${argumente.ort}.`
      : `Bereits bekannt: „${argumente.arbeitgeber}" in ${argumente.ort} — Angaben ergänzt.`,
  );
  console.log(`Betriebe gesamt: ${bestand.betriebe.length} (vorher ${betriebeVorher})`);
}

const direktAufgerufen = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direktAufgerufen) {
  main().catch((fehler) => {
    console.error('Eintragen fehlgeschlagen:', fehler.message);
    process.exit(1);
  });
}
