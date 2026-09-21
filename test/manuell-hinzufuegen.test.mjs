import test from 'node:test';
import assert from 'node:assert/strict';
import { stelleAusArgumenten } from '../src/manuell-hinzufuegen.mjs';
import { fuegeStellenEin, leererBestand } from '../src/speicher.mjs';

test('Arbeitgeber und Ort sind Pflicht', () => {
  assert.throws(() => stelleAusArgumenten({ ort: 'Waiblingen' }), /Arbeitgeber/);
  assert.throws(() => stelleAusArgumenten({ arbeitgeber: 'Schreinerei Vogt' }), /Ort/);
});

test('ein Beruf ergibt einen Datensatz, mehrere ergeben mehrere', () => {
  const einer = stelleAusArgumenten({ arbeitgeber: 'Vogt', ort: 'Waiblingen', beruf: 'Schreiner/in' });
  assert.equal(einer.length, 1);

  const mehrere = stelleAusArgumenten({
    arbeitgeber: 'Vogt',
    ort: 'Waiblingen',
    beruf: 'Schreiner/in | Tischler/in',
  });
  assert.equal(mehrere.length, 2);
  assert.deepEqual(mehrere.map((s) => s.beruf), ['Schreiner/in', 'Tischler/in']);
});

test('ohne Beruf entsteht trotzdem ein Betrieb (nur mit leerem Beruf)', () => {
  const stellen = stelleAusArgumenten({ arbeitgeber: 'Vogt', ort: 'Waiblingen' });
  assert.equal(stellen.length, 1);
  assert.equal(stellen[0].beruf, '');
});

test('Webseite landet als externeUrl, leere Webseite wird null', () => {
  const mit = stelleAusArgumenten({ arbeitgeber: 'Vogt', ort: 'Waiblingen', webseite: 'https://vogt.de/jobs' });
  assert.equal(mit[0].externeUrl, 'https://vogt.de/jobs');

  const ohne = stelleAusArgumenten({ arbeitgeber: 'Vogt', ort: 'Waiblingen', webseite: '' });
  assert.equal(ohne[0].externeUrl, null);
});

test('per Formular eingetragener Betrieb landet im Bestand wie jeder andere', () => {
  // Simuliert, was der Workflow tut, ohne echte Dateien anzufassen.
  const stellen = stelleAusArgumenten({
    arbeitgeber: 'Schreinerei Vogt',
    ort: 'Waiblingen',
    beruf: 'Schreiner/in',
    webseite: 'https://schreinerei-vogt.de/jobs',
  });
  const { bestand } = fuegeStellenEin(leererBestand(), stellen, {
    datum: '2026-09-21',
    quelle: 'eigene-recherche',
  });

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].externeUrl, 'https://schreinerei-vogt.de/jobs');
  assert.deepEqual(bestand.betriebe[0].quellen, ['eigene-recherche']);
});
