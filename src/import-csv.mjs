#!/usr/bin/env node
// Import einer Betriebsliste aus einer anderen Quelle in denselben Bestand.
//
// Gedacht für genau den Fall, der schneller zum Ziel führt als jeder Crawler:
// Handwerkskammer oder IHK geben als Maßnahmeträger nach § 45 SGB III eine
// Liste ausbildender Betriebe heraus. Die landet hier im selben Bestand wie
// die BA-Treffer und wird über Name+Ort mit ihnen zusammengeführt.
//
//   node src/import-csv.mjs hwk-liste.csv --quelle hwk-stuttgart
//
// Erwartete Spalten (Groß-/Kleinschreibung egal, fehlende sind erlaubt):
//   Arbeitgeber | Firma | Betrieb   → Name
//   Ort | Stadt                     → Ort
//   PLZ | Postleitzahl              → PLZ
//   Strasse | Straße | Adresse      → Straße
//   Beruf | Ausbildungsberuf        → Beruf (mehrere mit | oder , trennen)
//   Webseite | Website | Link | Homepage | URL  → Link zur Karriere-/Job-Seite
//
// Auch für einen einzelnen Betrieb reicht eine Datei mit nur einer Zeile —
// z. B. wenn ein Betrieb telefonisch oder über die eigene Homepage gefunden
// wurde und keiner Kammer-Liste entstammt:
//
//   Arbeitgeber;Ort;Beruf;Webseite
//   Schreinerei Vogt;Waiblingen;Schreiner/in;https://schreinerei-vogt.de/jobs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { csvLesen, bestandAlsCsv } from './csv.mjs';
import { ladeBestand, fuegeStellenEin, speichereBestand, schreibeHistorie } from './speicher.mjs';
import { PFADE } from './sammeln.mjs';

const ALIASSE = {
  arbeitgeber: ['arbeitgeber', 'firma', 'betrieb', 'name', 'unternehmen'],
  ort: ['ort', 'stadt', 'gemeinde'],
  plz: ['plz', 'postleitzahl'],
  strasse: ['strasse', 'straße', 'adresse', 'anschrift'],
  region: ['region', 'bundesland', 'landkreis', 'kreis'],
  beruf: ['beruf', 'ausbildungsberuf', 'berufe', 'ausbildungsberufe'],
  webseite: ['webseite', 'website', 'homepage', 'link', 'url', 'jobseite'],
};

function hole(zeile, feld) {
  const schluessel = Object.keys(zeile);
  for (const alias of ALIASSE[feld]) {
    const treffer = schluessel.find((name) => name.toLowerCase().trim() === alias);
    if (treffer && zeile[treffer]) return zeile[treffer].trim();
  }
  return '';
}

/**
 * Wandelt CSV-Zeilen in Stellen-Datensätze um. Eine Zeile mit mehreren
 * Berufen wird zu mehreren Datensätzen — im Bestand wird daraus ein Betrieb
 * mit mehreren Berufen.
 */
export function zeilenAlsStellen(zeilen) {
  const stellen = [];
  for (const zeile of zeilen) {
    const arbeitgeber = hole(zeile, 'arbeitgeber');
    if (!arbeitgeber) continue;

    const basis = {
      arbeitgeber,
      ort: hole(zeile, 'ort'),
      plz: hole(zeile, 'plz'),
      strasse: hole(zeile, 'strasse'),
      region: hole(zeile, 'region'),
      refnr: '',
      koordinaten: null,
      kundennummerHash: null,
      externeUrl: hole(zeile, 'webseite') || null,
      veroeffentlicht: null,
    };

    const berufe = hole(zeile, 'beruf')
      .split(/[|,;]/)
      .map((wert) => wert.trim())
      .filter(Boolean);

    if (berufe.length === 0) stellen.push({ ...basis, beruf: '' });
    else for (const beruf of berufe) stellen.push({ ...basis, beruf });
  }
  return stellen;
}

async function main() {
  const [datei, ...rest] = process.argv.slice(2);
  if (!datei) {
    console.error('Aufruf: node src/import-csv.mjs <datei.csv> [--quelle name] [--datum JJJJ-MM-TT]');
    process.exit(1);
  }

  const argumente = Object.fromEntries(
    rest.flatMap((wert, index) =>
      wert.startsWith('--') ? [[wert.slice(2), rest[index + 1] ?? true]] : [],
    ),
  );

  const quelle = typeof argumente.quelle === 'string' ? argumente.quelle : 'csv-import';
  const datum = typeof argumente.datum === 'string' ? argumente.datum : new Date().toISOString().slice(0, 10);

  const stellen = zeilenAlsStellen(csvLesen(await readFile(resolve(datei), 'utf8')));
  const vorher = await ladeBestand(PFADE.bestand);
  const { bestand, ereignisse } = fuegeStellenEin(vorher, stellen, { datum, quelle });

  await speichereBestand(PFADE.bestand, bestand);
  await mkdir(dirname(PFADE.csv), { recursive: true });
  await writeFile(PFADE.csv, bestandAlsCsv(bestand), 'utf8');
  await schreibeHistorie(PFADE.historie, ereignisse);

  console.log(`Eingelesen: ${stellen.length} Zeilen aus Quelle „${quelle}“`);
  console.log(`Betriebe gesamt: ${bestand.betriebe.length} (vorher ${vorher.betriebe.length})`);
  console.log(`Neu: ${ereignisse.filter((e) => e.ereignis === 'neuer_betrieb').length} Betriebe`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('import-csv.mjs')) {
  main().catch((fehler) => {
    console.error('Import fehlgeschlagen:', fehler);
    process.exit(1);
  });
}
