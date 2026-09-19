import test from 'node:test';
import assert from 'node:assert/strict';
import { leererBestand, fuegeStellenEin } from '../src/speicher.mjs';

function stelle(felder = {}) {
  return {
    arbeitgeber: 'Bäckerei Müller GmbH',
    ort: 'Waiblingen',
    plz: '71332',
    region: 'Baden-Württemberg',
    strasse: 'Hauptstraße 1',
    beruf: 'Bäcker/in',
    titel: 'Ausbildung Bäcker/in 2027',
    refnr: 'REF-1',
    veroeffentlicht: '2026-09-18',
    koordinaten: { lat: 48.83, lon: 9.32 },
    kundennummerHash: null,
    externeUrl: null,
    ...felder,
  };
}

test('erster Lauf legt den Betrieb an', () => {
  const { bestand, ereignisse } = fuegeStellenEin(leererBestand(), [stelle()], {
    datum: '2026-09-18',
    quelle: 'ba-jobsuche',
  });

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].arbeitgeber, 'Bäckerei Müller GmbH');
  assert.equal(bestand.betriebe[0].berufe.length, 1);
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 1);
  assert.equal(ereignisse.filter((e) => e.ereignis === 'neuer_betrieb').length, 1);
});

test('derselbe Lauf an 60 Tagen bläht die Zahlen nicht auf', () => {
  // Das ist die Eigenschaft, an der die ganze Auswertung hängt: die Anzahl
  // soll zeigen, wie oft ein Betrieb ausgeschrieben hat — nicht, wie oft der
  // Sammler gelaufen ist.
  let bestand = leererBestand();
  for (let tag = 1; tag <= 60; tag += 1) {
    ({ bestand } = fuegeStellenEin(bestand, [stelle()], {
      datum: `2026-09-${String(tag).padStart(2, '0')}`.slice(0, 10),
      quelle: 'ba-jobsuche',
    }));
  }

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 1);
  assert.equal(bestand.betriebe[0].berufe[0].anzahlAnzeigen, 1);
});

test('ein neuer Betrieb bringt auch eine neue Anzeige mit', () => {
  // Der Tagesbericht zählt die Anzeigen über das Flag, nicht über den
  // Ereignistyp — sonst meldet ein Lauf mit lauter Neuzugängen "0 Anzeigen".
  const { ereignisse } = fuegeStellenEin(leererBestand(), [stelle()], {
    datum: '2026-09-18',
    quelle: 'ba-jobsuche',
  });

  assert.equal(ereignisse.length, 1, 'pro Stelle höchstens ein Ereignis');
  assert.equal(ereignisse[0].ereignis, 'neuer_betrieb');
  assert.equal(ereignisse[0].neueAnzeige, true);
});

test('neue Referenznummer zählt als weitere Anzeige', () => {
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(bestand, [stelle()], { datum: '2026-09-18', quelle: 'ba-jobsuche' }));
  ({ bestand } = fuegeStellenEin(bestand, [stelle({ refnr: 'REF-2' })], {
    datum: '2027-03-01',
    quelle: 'ba-jobsuche',
  }));

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 2);
  assert.deepEqual(bestand.betriebe[0].jahre, ['2026', '2027']);
  assert.equal(bestand.betriebe[0].erstmalsGesehen, '2026-09-18');
  assert.equal(bestand.betriebe[0].zuletztGesehen, '2027-03-01');
});

test('zweiter Beruf landet beim selben Betrieb', () => {
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(bestand, [stelle()], { datum: '2026-09-18', quelle: 'ba-jobsuche' }));
  const ergebnis = fuegeStellenEin(
    bestand,
    [stelle({ beruf: 'Konditor/in', refnr: 'REF-9' })],
    { datum: '2026-10-01', quelle: 'ba-jobsuche' },
  );

  assert.equal(ergebnis.bestand.betriebe.length, 1);
  assert.equal(ergebnis.bestand.betriebe[0].berufe.length, 2);
  assert.equal(ergebnis.ereignisse.filter((e) => e.ereignis === 'neuer_beruf').length, 1);
});

test('abweichende Schreibweise wird zusammengeführt und mitgeschrieben', () => {
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(bestand, [stelle()], { datum: '2026-09-18', quelle: 'ba-jobsuche' }));
  ({ bestand } = fuegeStellenEin(bestand, [stelle({ arbeitgeber: 'Baeckerei Mueller GmbH & Co. KG' })], {
    datum: '2026-09-19',
    quelle: 'ba-jobsuche',
  }));

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].schreibweisen.length, 2);
});

test('Betrieb verschwindet nie aus dem Bestand', () => {
  // Kern des Projekts: die Anzeige ist weg, der Betrieb bleibt.
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(bestand, [stelle()], { datum: '2026-09-18', quelle: 'ba-jobsuche' }));
  ({ bestand } = fuegeStellenEin(bestand, [], { datum: '2026-12-01', quelle: 'ba-jobsuche' }));

  assert.equal(bestand.betriebe.length, 1);
  assert.equal(bestand.betriebe[0].zuletztGesehen, '2026-09-18');
});

test('eigene Notizen überleben den nächsten Sammellauf', () => {
  let bestand = leererBestand();
  ({ bestand } = fuegeStellenEin(bestand, [stelle()], { datum: '2026-09-18', quelle: 'ba-jobsuche' }));
  bestand.betriebe[0].notiz = 'Chefin angerufen, nimmt 2027 zwei Azubis';
  bestand.betriebe[0].ansprechpartner = 'Frau Müller, 07151 12345';

  ({ bestand } = fuegeStellenEin(bestand, [stelle({ refnr: 'REF-77' })], {
    datum: '2026-11-02',
    quelle: 'ba-jobsuche',
  }));

  assert.equal(bestand.betriebe[0].notiz, 'Chefin angerufen, nimmt 2027 zwei Azubis');
  assert.equal(bestand.betriebe[0].ansprechpartner, 'Frau Müller, 07151 12345');
});

test('Stellen ohne Arbeitgebernamen werden verworfen', () => {
  const { bestand } = fuegeStellenEin(leererBestand(), [stelle({ arbeitgeber: '' })], {
    datum: '2026-09-18',
    quelle: 'ba-jobsuche',
  });
  assert.equal(bestand.betriebe.length, 0);
});

test('Kammer-Import ohne Referenznummer zählt als eine Anzeige', () => {
  const { bestand } = fuegeStellenEin(
    leererBestand(),
    [stelle({ refnr: '', kundennummerHash: null })],
    { datum: '2026-09-18', quelle: 'hwk-stuttgart' },
  );
  assert.equal(bestand.betriebe[0].anzahlAnzeigen, 1);
  assert.deepEqual(bestand.betriebe[0].quellen, ['hwk-stuttgart']);
});

test('Betriebe sind nach Ort und Name sortiert', () => {
  const { bestand } = fuegeStellenEin(
    leererBestand(),
    [
      stelle({ arbeitgeber: 'Zimmerei Zoll', ort: 'Waiblingen', refnr: 'A' }),
      stelle({ arbeitgeber: 'Autohaus Abel', ort: 'Waiblingen', refnr: 'B' }),
      stelle({ arbeitgeber: 'Bäcker Bopp', ort: 'Backnang', refnr: 'C' }),
    ],
    { datum: '2026-09-18', quelle: 'ba-jobsuche' },
  );

  assert.deepEqual(
    bestand.betriebe.map((betrieb) => `${betrieb.ort}/${betrieb.arbeitgeber}`),
    ['Backnang/Bäcker Bopp', 'Waiblingen/Autohaus Abel', 'Waiblingen/Zimmerei Zoll'],
  );
});
