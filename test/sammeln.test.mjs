import test from 'node:test';
import assert from 'node:assert/strict';
import { marktKennzahlen } from '../src/sammeln.mjs';
import { leererBestand, fuegeStellenEin } from '../src/speicher.mjs';

test('Marktkennzahlen zählen Überschneidungen der Umkreise nur einmal', () => {
  const kontext = { datum: '2026-11-22', quelle: 'ba-jobsuche' };
  // Dieselbe Anzeige kommt über zwei Orte herein (Umkreise überlappen).
  const doppelt = { arbeitgeber: 'Müller GmbH', ort: 'Fellbach', beruf: 'Bäcker/in', refnr: 'R1' };
  const stellen = [doppelt, { ...doppelt }, { arbeitgeber: 'Abel e.K.', ort: 'Backnang', beruf: 'Maler/in', refnr: 'R2' }];

  const alt = fuegeStellenEin(
    leererBestand(),
    [{ arbeitgeber: 'Alt AG', ort: 'Stuttgart', beruf: 'Koch/Köchin', refnr: 'R0' }],
    { datum: '2026-10-01', quelle: 'ba-jobsuche' },
  ).bestand;
  const { bestand } = fuegeStellenEin(alt, stellen, kontext);

  assert.deepEqual(marktKennzahlen(bestand, stellen, kontext.datum), {
    eindeutigeStellen: 2,
    aktiveBetriebe: 2, // "Alt AG" hat heute nichts ausgeschrieben
    aktiveAngebote: 2,
  });
});
