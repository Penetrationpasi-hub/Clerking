import test from 'node:test';
import assert from 'node:assert/strict';
import { bestandAlsCsv, csvLesen, SPALTEN } from '../src/csv.mjs';
import { zeilenAlsStellen } from '../src/import-csv.mjs';
import { leererBestand, fuegeStellenEin } from '../src/speicher.mjs';

test('CSV hat BOM, Semikolon und alle Spalten', () => {
  const { bestand } = fuegeStellenEin(
    leererBestand(),
    [{ arbeitgeber: 'Müller GmbH', ort: 'Waiblingen', beruf: 'Bäcker/in', refnr: 'R1' }],
    { datum: '2026-09-18', quelle: 'ba-jobsuche' },
  );

  const csv = bestandAlsCsv(bestand);
  assert.ok(csv.startsWith('﻿'), 'BOM für Excel');
  assert.equal(csv.split('\n')[0].replace('﻿', ''), SPALTEN.join(';'));
  assert.ok(csv.includes('Müller GmbH;Waiblingen'));
});

test('Semikolon im Firmennamen zerlegt die Zeile nicht', () => {
  const { bestand } = fuegeStellenEin(
    leererBestand(),
    [{ arbeitgeber: 'Meier; Sohn & Co', ort: 'Stuttgart', beruf: 'Maler/in', refnr: 'R2' }],
    { datum: '2026-09-18', quelle: 'ba-jobsuche' },
  );

  const zeile = bestandAlsCsv(bestand).split('\n')[1];
  assert.ok(zeile.startsWith('"Meier; Sohn & Co"'));
  assert.equal(csvLesen(bestandAlsCsv(bestand))[0].Arbeitgeber, 'Meier; Sohn & Co');
});

test('Import erkennt Spaltennamen einer Kammer-Liste', () => {
  const stellen = zeilenAlsStellen(
    csvLesen('Firma;Stadt;Postleitzahl;Ausbildungsberufe\nZimmerei Zoll;Backnang;71522;Zimmerer | Bauzeichner\n'),
  );

  assert.equal(stellen.length, 2, 'zwei Berufe ergeben zwei Datensätze');
  assert.equal(stellen[0].arbeitgeber, 'Zimmerei Zoll');
  assert.equal(stellen[0].ort, 'Backnang');
  assert.equal(stellen[0].plz, '71522');
  assert.deepEqual(stellen.map((stelle) => stelle.beruf), ['Zimmerer', 'Bauzeichner']);
});

test('Webseite aus dem Import landet im Bestand und in der CSV', () => {
  // Für Betriebe, die telefonisch oder über die eigene Homepage gefunden
  // wurden, nicht über eine Kammer-Liste — ein Link statt eines Berufs reicht.
  const stellen = zeilenAlsStellen(
    csvLesen('Arbeitgeber;Ort;Beruf;Webseite\nSchreinerei Vogt;Waiblingen;Schreiner/in;https://schreinerei-vogt.de/jobs\n'),
  );
  assert.equal(stellen[0].externeUrl, 'https://schreinerei-vogt.de/jobs');

  const { bestand } = fuegeStellenEin(leererBestand(), stellen, { datum: '2026-09-18', quelle: 'eigene-recherche' });
  assert.equal(bestand.betriebe[0].externeUrl, 'https://schreinerei-vogt.de/jobs');
  assert.ok(bestandAlsCsv(bestand).includes('https://schreinerei-vogt.de/jobs'));
});

test('vorhandene Webseite wird durch einen späteren Import ohne Link nicht gelöscht', () => {
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(
    bestand,
    [{ arbeitgeber: 'Schreinerei Vogt', ort: 'Waiblingen', beruf: 'Schreiner/in', externeUrl: 'https://schreinerei-vogt.de/jobs' }],
    { datum: '2026-09-18', quelle: 'eigene-recherche' },
  ));
  ({ bestand } = fuegeStellenEin(
    bestand,
    [{ arbeitgeber: 'Schreinerei Vogt', ort: 'Waiblingen', beruf: 'Schreiner/in', refnr: 'R9' }],
    { datum: '2026-10-01', quelle: 'ba-jobsuche' },
  ));
  assert.equal(bestand.betriebe[0].externeUrl, 'https://schreinerei-vogt.de/jobs');
});

test('Import erkennt auch komma-getrennte Dateien', () => {
  const zeilen = csvLesen('Arbeitgeber,Ort\nAutohaus Abel,Waiblingen\n');
  assert.equal(zeilen[0].Arbeitgeber, 'Autohaus Abel');
  assert.equal(zeilen[0].Ort, 'Waiblingen');
});

test('Kammer-Import trifft denselben Betrieb wie die BA', () => {
  // Der eigentliche Zweck des Imports: die Liste von der HWK soll den
  // BA-Datensatz ergänzen, nicht daneben liegen.
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(
    bestand,
    [{ arbeitgeber: 'Bäckerei Müller GmbH', ort: 'Waiblingen', beruf: 'Bäcker/in', refnr: 'R1' }],
    { datum: '2026-09-18', quelle: 'ba-jobsuche' },
  ));

  const importiert = zeilenAlsStellen(csvLesen('Betrieb;Ort;Beruf\nBaeckerei Mueller e.K.;Waiblingen;Konditor\n'));
  ({ bestand } = fuegeStellenEin(bestand, importiert, { datum: '2026-10-05', quelle: 'hwk-stuttgart' }));

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].berufe.length, 2);
  assert.deepEqual(bestand.betriebe[0].quellen, ['ba-jobsuche', 'hwk-stuttgart']);
});

test('leere Zeilen am Dateiende werden ignoriert', () => {
  assert.equal(csvLesen('Arbeitgeber;Ort\nA;B\n\n').length, 1);
});
