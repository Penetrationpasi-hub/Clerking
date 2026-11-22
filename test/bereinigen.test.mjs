import test from 'node:test';
import assert from 'node:assert/strict';
import { bereinige } from '../src/bereinigen.mjs';

function betrieb(arbeitgeber, berufe, quellen = ['ba-jobsuche']) {
  return {
    arbeitgeber,
    ort: 'Stuttgart',
    quellen,
    anzahlAnzeigen: berufe.length,
    berufe: berufe.map((beruf, index) => ({
      beruf,
      normalisiert: beruf.toLowerCase(),
      anzahlAnzeigen: 1,
      referenznummern: [`10000-${index}-S`],
    })),
  };
}

test('entfernt duale Studien aus den Berufen eines Betriebs', () => {
  const { bestand, entfernteBerufe } = bereinige({
    betriebe: [betrieb('Bäckerei Müller GmbH', ['Bäcker/in', 'Duales Studium BWL (m/w/d)'])],
  });

  assert.equal(entfernteBerufe, 1);
  assert.equal(bestand.betriebe.length, 1);
  assert.deepEqual(
    bestand.betriebe[0].berufe.map((beruf) => beruf.beruf),
    ['Bäcker/in'],
  );
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 1);
});

test('entfernt Betriebe, die nur duale Studien hatten', () => {
  const { bestand, entfernteBetriebe } = bereinige({
    betriebe: [
      betrieb('DHBW Stuttgart', ['Duales Studium BWL (m/w/d)']),
      betrieb('Bäckerei Müller GmbH', ['Bäcker/in']),
    ],
  });

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].arbeitgeber, 'Bäckerei Müller GmbH');
  assert.equal(entfernteBetriebe.length, 1);
  assert.match(entfernteBetriebe[0], /DHBW Stuttgart/);
});

test('behält Betriebe, die von Hand eingetragen wurden', () => {
  const { bestand, behalteneBetriebe } = bereinige({
    betriebe: [betrieb('Firma von Hand', ['Duales Studium BWL (m/w/d)'], ['hwk-stuttgart'])],
  });

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].berufe.length, 0);
  assert.equal(behalteneBetriebe.length, 1);
});

test('lässt reguläre Ausbildungsberufe unangetastet', () => {
  const berufe = [
    'Bäcker/in',
    'Konditor/in',
    'Kunststoff- und Kautschuktechnologe/-technologin - Compound- und Masterbatchherstellung',
  ];
  const { bestand, entfernteBerufe } = bereinige({ betriebe: [betrieb('Betrieb GmbH', berufe)] });

  assert.equal(entfernteBerufe, 0);
  assert.equal(bestand.betriebe[0].berufe.length, 3);
});
