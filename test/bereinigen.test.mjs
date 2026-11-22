import test from 'node:test';
import assert from 'node:assert/strict';
import { bereinige } from '../src/bereinigen.mjs';
import { ART_DUALES_STUDIUM } from '../src/ausbildungsarten.mjs';

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

test('markiert duale Studien, ohne den Ausbildungsberuf anzufassen', () => {
  const { bestand, markierteBerufe } = bereinige({
    betriebe: [betrieb('Bäckerei Müller GmbH', ['Bäcker/in', 'Duales Studium BWL (m/w/d)'])],
  });

  assert.equal(markierteBerufe, 1);
  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].berufe[0].art, undefined);
  assert.equal(bestand.betriebe[0].berufe[1].art, ART_DUALES_STUDIUM);
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 2);
});

test('behält Betriebe, die nur duale Studien hatten', () => {
  const { bestand, nurDualeBetriebe } = bereinige({
    betriebe: [
      betrieb('Mercedes-Benz AG', ['Studiengang Public Financial Management']),
      betrieb('Bäckerei Müller GmbH', ['Bäcker/in']),
    ],
  });

  assert.equal(bestand.betriebe.length, 2);
  assert.equal(bestand.betriebe[0].berufe[0].art, ART_DUALES_STUDIUM);
  assert.equal(nurDualeBetriebe.length, 1);
  assert.match(nurDualeBetriebe[0], /Mercedes-Benz AG/);
});

test('lässt von Hand eingetragene Betriebe stehen und markiert nur das Studium', () => {
  const { bestand, nurDualeBetriebe } = bereinige({
    betriebe: [betrieb('Firma von Hand', ['Duales Studium BWL (m/w/d)'], ['hwk-stuttgart'])],
  });

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].berufe[0].art, ART_DUALES_STUDIUM);
  assert.equal(nurDualeBetriebe.length, 1);
});

test('lässt reguläre Ausbildungsberufe unangetastet', () => {
  const berufe = [
    'Bäcker/in',
    'Konditor/in',
    'Kunststoff- und Kautschuktechnologe/-technologin - Compound- und Masterbatchherstellung',
    'Ausbildung beim Studierendenwerk Stuttgart (m/w/d)',
  ];
  const { bestand, markierteBerufe } = bereinige({ betriebe: [betrieb('Betrieb GmbH', berufe)] });

  assert.equal(markierteBerufe, 0);
  assert.equal(bestand.betriebe[0].berufe.length, 4);
  assert.ok(bestand.betriebe[0].berufe.every((beruf) => beruf.art === undefined));
});

test('markiert einen Beruf nicht ein zweites Mal', () => {
  const vorhanden = betrieb('Bosch', ['Duales Hochschulstudium BWL']);
  vorhanden.berufe[0].art = ART_DUALES_STUDIUM;

  const { markierteBerufe } = bereinige({ betriebe: [vorhanden] });

  assert.equal(markierteBerufe, 0);
});
