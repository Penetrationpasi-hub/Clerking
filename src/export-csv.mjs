#!/usr/bin/env node
// Erzeugt daten/betriebe.csv neu aus daten/betriebe.json.
// Nötig, wenn im JSON von Hand etwas ergänzt wurde (Notizen, Ansprechpartner).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ladeBestand } from './speicher.mjs';
import { bestandAlsCsv } from './csv.mjs';
import { PFADE } from './sammeln.mjs';

const bestand = await ladeBestand(PFADE.bestand);
await mkdir(dirname(PFADE.csv), { recursive: true });
await writeFile(PFADE.csv, bestandAlsCsv(bestand), 'utf8');
console.log(`${bestand.betriebe.length} Betriebe nach ${PFADE.csv} geschrieben.`);
