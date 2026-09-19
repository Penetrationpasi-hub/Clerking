#!/usr/bin/env node
// Winziger statischer Server, damit web/index.html die Bestandsdatei per
// fetch() laden kann (aus file:// heraus blockiert der Browser das).
//
//   npm run web   →   http://localhost:4173

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJEKT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4173);

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (anfrage, antwort) => {
  const pfad = decodeURIComponent(new URL(anfrage.url, 'http://localhost').pathname);
  const ziel = pfad === '/' ? 'web/index.html' : normalize(pfad).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
  const datei = join(PROJEKT, ziel);

  // Kein Ausbruch aus dem Projektverzeichnis.
  if (!datei.startsWith(PROJEKT)) {
    antwort.writeHead(403).end('Verboten');
    return;
  }

  try {
    const inhalt = await readFile(datei);
    antwort.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] ?? 'application/octet-stream' });
    antwort.end(inhalt);
  } catch {
    antwort.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    antwort.end('Nicht gefunden');
  }
}).listen(PORT, () => {
  console.log(`Betriebsliste läuft auf http://localhost:${PORT}`);
});
