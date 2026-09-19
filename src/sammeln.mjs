#!/usr/bin/env node
// Sammellauf: BA-Jobsuche abfragen und den Bestand fortschreiben.
//
//   node src/sammeln.mjs
//   node src/sammeln.mjs --wo Waiblingen --umkreis 25
//   node src/sammeln.mjs --trocken            (nichts schreiben, nur zeigen)
//   node src/sammeln.mjs --aus-datei roh.json (ohne Netz, aus Rohdaten)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANGEBOTSART, holeAlleSeiten, ergebnisseAusAntwort } from './ba-quelle.mjs';
import { ladeBestand, fuegeStellenEin, speichereBestand, schreibeHistorie } from './speicher.mjs';
import { bestandAlsCsv } from './csv.mjs';

const PROJEKT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PFADE = {
  konfig: join(PROJEKT, 'konfig.json'),
  bestand: join(PROJEKT, 'daten', 'betriebe.json'),
  csv: join(PROJEKT, 'daten', 'betriebe.csv'),
  historie: join(PROJEKT, 'daten', 'historie.jsonl'),
  laufLog: join(PROJEKT, 'daten', 'letzter-lauf.json'),
};

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

function heute() {
  return new Date().toISOString().slice(0, 10);
}

async function ladeKonfig(pfad) {
  return JSON.parse(await readFile(pfad, 'utf8'));
}

export async function sammle({ argv = [], protokoll = console.log } = {}) {
  const argumente = argumenteLesen(argv);
  const konfig = await ladeKonfig(argumente.konfig ? resolve(argumente.konfig) : PFADE.konfig);
  const datum = typeof argumente.datum === 'string' ? argumente.datum : heute();
  const trocken = Boolean(argumente.trocken);

  const orte = argumente.wo
    ? [{ wo: String(argumente.wo), umkreis: Number(argumente.umkreis ?? konfig.standardUmkreis ?? 25) }]
    : konfig.orte ?? [];
  const suchbegriffe = konfig.suchbegriffe?.length ? konfig.suchbegriffe : [undefined];
  const maxSeiten = Number(argumente['max-seiten'] ?? konfig.maxSeiten ?? 40);

  /** @type {any[]} */
  const stellen = [];

  if (typeof argumente['aus-datei'] === 'string') {
    // Offline-Modus: eine gespeicherte BA-Antwort einlesen. Nützlich zum
    // Testen und um einen fehlgeschlagenen Lauf nachzuholen, ohne die API
    // noch einmal zu belasten.
    const roh = JSON.parse(await readFile(resolve(argumente['aus-datei']), 'utf8'));
    const antworten = Array.isArray(roh) ? roh : [roh];
    for (const antwort of antworten) stellen.push(...ergebnisseAusAntwort(antwort).stellen);
    protokoll(`Aus Datei gelesen: ${stellen.length} Stellen`);
  } else {
    for (const ort of orte) {
      for (const was of suchbegriffe) {
        protokoll(`  ${ort.wo} (+${ort.umkreis ?? konfig.standardUmkreis ?? 25} km)${was ? ` – „${was}“` : ''}`);
        try {
          const { stellen: gefunden } = await holeAlleSeiten({
            wo: ort.wo,
            umkreis: ort.umkreis ?? konfig.standardUmkreis ?? 25,
            was,
            angebotsart: konfig.angebotsart ?? ANGEBOTSART.AUSBILDUNG,
            groesse: konfig.seitengroesse ?? 100,
            maxSeiten,
            pauseMs: konfig.pauseMs ?? 400,
            protokoll,
          });
          stellen.push(...gefunden);
        } catch (fehler) {
          // Ein ausgefallener Ort darf den gesamten Lauf nicht kippen — der
          // Rest ist trotzdem wertvoll, und morgen läuft es wieder.
          protokoll(`    ! Fehlgeschlagen: ${fehler.message}`);
        }
      }
    }
  }

  const bestandVorher = await ladeBestand(PFADE.bestand);
  const betriebeVorher = bestandVorher.betriebe.length;

  const { bestand, ereignisse } = fuegeStellenEin(bestandVorher, stellen, {
    datum,
    quelle: typeof argumente.quelle === 'string' ? argumente.quelle : 'ba-jobsuche',
  });

  const bericht = {
    datum,
    gefundeneStellen: stellen.length,
    betriebeVorher,
    betriebeNachher: bestand.betriebe.length,
    neueBetriebe: ereignisse.filter((e) => e.ereignis === 'neuer_betrieb').length,
    neueBerufe: ereignisse.filter((e) => e.ereignis === 'neuer_beruf').length,
    neueAnzeigen: ereignisse.filter((e) => e.neueAnzeige).length,
  };

  if (!trocken) {
    await speichereBestand(PFADE.bestand, bestand);
    await mkdir(dirname(PFADE.csv), { recursive: true });
    await writeFile(PFADE.csv, bestandAlsCsv(bestand), 'utf8');
    await schreibeHistorie(PFADE.historie, ereignisse);
    await writeFile(PFADE.laufLog, `${JSON.stringify(bericht, null, 2)}\n`, 'utf8');
  }

  protokoll('');
  protokoll(`Stellen abgerufen : ${bericht.gefundeneStellen}`);
  protokoll(`Betriebe gesamt   : ${bericht.betriebeNachher} (vorher ${bericht.betriebeVorher})`);
  protokoll(`Neu dazugekommen  : ${bericht.neueBetriebe} Betriebe, ${bericht.neueBerufe} Berufe, ${bericht.neueAnzeigen} Anzeigen`);
  if (trocken) protokoll('(Trockenlauf – es wurde nichts geschrieben)');

  return { bestand, ereignisse, bericht };
}

const direktAufgerufen = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direktAufgerufen) {
  sammle({ argv: process.argv.slice(2) }).catch((fehler) => {
    console.error('Sammellauf fehlgeschlagen:', fehler);
    process.exit(1);
  });
}
