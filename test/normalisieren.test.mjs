import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisiereName,
  normalisiereOrt,
  normalisiereBeruf,
  betriebsSchluessel,
} from '../src/normalisieren.mjs';

test('Schreibweisen desselben Betriebs laufen zusammen', () => {
  const erwartet = normalisiereName('Müller GmbH');
  assert.equal(normalisiereName('Mueller GmbH'), erwartet);
  assert.equal(normalisiereName('MÜLLER  GMBH'), erwartet);
  assert.equal(normalisiereName('Müller GmbH & Co. KG'), erwartet);
  assert.equal(normalisiereName('Müller e.K.'), erwartet);
});

test('Rechtsform wird nur am Wortende entfernt', () => {
  // "Agentur" darf nicht zu "entur" werden, nur weil "ag" darin vorkommt.
  assert.equal(normalisiereName('Agentur Schmidt'), 'agentur schmidt');
  assert.equal(normalisiereName('Kagel Bau GmbH'), 'kagel bau');
});

test('verschiedene Betriebe bleiben getrennt', () => {
  assert.notEqual(normalisiereName('Bäckerei Müller'), normalisiereName('Bäckerei Maier'));
});

test('Ortszusätze bleiben unterscheidbar', () => {
  assert.notEqual(normalisiereOrt('Waiblingen'), normalisiereOrt('Waiblingen-Hohenacker'));
  assert.equal(normalisiereOrt('Schwäbisch Gmünd'), normalisiereOrt('SCHWAEBISCH  GMUEND'));
});

test('Berufsschreibweisen der BA laufen zusammen', () => {
  const erwartet = normalisiereBeruf('Fachinformatiker/in - Anwendungsentwicklung');
  assert.equal(normalisiereBeruf('Fachinformatiker/-in Anwendungsentwicklung'), erwartet);
  assert.equal(normalisiereBeruf('Fachinformatiker (m/w/d) Anwendungsentwicklung'), erwartet);
});

test('Schlüssel ist Name plus Ort', () => {
  const a = betriebsSchluessel({ arbeitgeber: 'Müller GmbH', ort: 'Waiblingen' });
  const b = betriebsSchluessel({ arbeitgeber: 'Mueller GmbH', ort: 'Waiblingen' });
  const c = betriebsSchluessel({ arbeitgeber: 'Müller GmbH', ort: 'Stuttgart' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
