import test from 'node:test';
import assert from 'node:assert/strict';
import { stelleAusRohdaten, ergebnisseAusAntwort, holeSeite, holeAlleSeiten } from '../src/ba-quelle.mjs';

test('liest die v6-Feldnamen', () => {
  const stelle = stelleAusRohdaten({
    beruf: 'Bäcker/in',
    titel: 'Ausbildung Bäcker/in',
    arbeitgeber: 'Bäckerei Müller GmbH',
    refnr: '10000-1234567890-S',
    arbeitsort: {
      plz: '71332',
      ort: 'Waiblingen',
      region: 'Baden-Württemberg',
      koordinaten: { lat: 48.83, lon: 9.32 },
    },
    aktuelleVeroeffentlichungsdatum: '2026-09-01',
    kundennummerHash: 'abc123',
  });

  assert.equal(stelle.arbeitgeber, 'Bäckerei Müller GmbH');
  assert.equal(stelle.ort, 'Waiblingen');
  assert.equal(stelle.plz, '71332');
  assert.equal(stelle.beruf, 'Bäcker/in');
  assert.deepEqual(stelle.koordinaten, { lat: 48.83, lon: 9.32 });
  assert.equal(stelle.veroeffentlicht, '2026-09-01');
});

test('liest auch die alten Feldnamen (firma/stellenlokationen)', () => {
  // Die BA hat diese Felder zwischen API-Versionen umbenannt. Ein Sammler,
  // der nur eine Schreibweise kennt, liefert nach so einer Umstellung
  // wochenlang leere Arbeitgebernamen, ohne dass etwas auffällt.
  const stelle = stelleAusRohdaten({
    hauptberuf: 'Bäcker/in',
    firma: 'Bäckerei Müller GmbH',
    referenznummer: '10000-1234567890-S',
    stellenlokationen: [{ adresse: { ort: 'Waiblingen', region: 'Baden-Württemberg' } }],
    datumErsteVeroeffentlichung: '2026-09-01',
  });

  assert.equal(stelle.arbeitgeber, 'Bäckerei Müller GmbH');
  assert.equal(stelle.ort, 'Waiblingen');
  assert.equal(stelle.beruf, 'Bäcker/in');
  assert.equal(stelle.refnr, '10000-1234567890-S');
});

test('fehlende Felder ergeben leere Strings statt undefined', () => {
  const stelle = stelleAusRohdaten({});
  assert.equal(stelle.arbeitgeber, '');
  assert.equal(stelle.koordinaten, null);
  assert.equal(stelle.veroeffentlicht, null);
});

test('Ergebnisliste wird unter beiden Schlüsseln gefunden', () => {
  assert.equal(ergebnisseAusAntwort({ stellenangebote: [{ firma: 'A' }], maxErgebnisse: 7 }).gesamt, 7);
  assert.equal(ergebnisseAusAntwort({ ergebnisliste: [{ firma: 'A' }] }).stellen.length, 1);
  assert.equal(ergebnisseAusAntwort({}).stellen.length, 0);
});

test('setzt angebotsart=4 und die Suchparameter', async () => {
  let gerufeneUrl = '';
  await holeSeite({
    wo: 'Waiblingen',
    umkreis: 25,
    seite: 2,
    groesse: 50,
    fetchImpl: async (url) => {
      gerufeneUrl = url;
      return { ok: true, status: 200, json: async () => ({ stellenangebote: [] }) };
    },
  });

  const parameter = new URL(gerufeneUrl).searchParams;
  assert.equal(parameter.get('angebotsart'), '4');
  assert.equal(parameter.get('wo'), 'Waiblingen');
  assert.equal(parameter.get('umkreis'), '25');
  assert.equal(parameter.get('page'), '2');
  assert.equal(parameter.get('size'), '50');
});

test('wiederholt bei Serverfehlern, nicht bei 400', async () => {
  let aufrufe = 0;
  await assert.rejects(
    holeSeite({
      wo: 'Waiblingen',
      versuche: 3,
      fetchImpl: async () => {
        aufrufe += 1;
        return { ok: false, status: 400, json: async () => ({}) };
      },
    }),
  );
  assert.equal(aufrufe, 1, 'ein 400 wird durch Wiederholen nicht besser');
});

test('blättert, bis die letzte Seite unvollständig ist', async () => {
  const seiten = {
    1: Array.from({ length: 2 }, (_, i) => ({ firma: `A${i}` })),
    2: [{ firma: 'B0' }],
  };
  const { stellen } = await holeAlleSeiten({
    wo: 'Waiblingen',
    groesse: 2,
    pauseMs: 0,
    fetchImpl: async (url) => {
      const seite = new URL(url).searchParams.get('page');
      return {
        ok: true,
        status: 200,
        json: async () => ({ stellenangebote: seiten[seite] ?? [], maxErgebnisse: 3 }),
      };
    },
  });

  assert.equal(stellen.length, 3);
});
