// Bestandsführung: laden, zusammenführen, speichern.
//
// Kernidee des Projekts: nicht der aktuelle Stand zählt, sondern die
// Historie. Ein Betrieb, der im März eine Ausbildungsstelle ausgeschrieben
// hat, bleibt für immer im Bestand — auch wenn die Anzeige längst weg ist.
// Gelöscht wird hier nie, nur ergänzt.

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { betriebsSchluessel, normalisiereBeruf } from './normalisieren.mjs';

export const BESTAND_VERSION = 1;

/** Felder, die der automatische Abgleich verwaltet. Alles andere an einem
 *  Datensatz (eigene Notizen, Ansprechpartner, Telefonnummern) bleibt beim
 *  Zusammenführen unangetastet. */
const VERWALTETE_FELDER = new Set([
  'schluessel',
  'arbeitgeber',
  'schreibweisen',
  'ort',
  'plz',
  'region',
  'strasse',
  'koordinaten',
  'quellen',
  'erstmalsGesehen',
  'zuletztGesehen',
  'jahre',
  'anzahlAnzeigen',
  'berufe',
  'kundennummerHash',
  'externeUrl',
]);

/** @returns {{version: number, aktualisiert: string|null, anzahlBetriebe: number, betriebe: any[]}} */
export function leererBestand() {
  return { version: BESTAND_VERSION, aktualisiert: null, anzahlBetriebe: 0, betriebe: [] };
}

export async function ladeBestand(pfad) {
  try {
    const inhalt = await readFile(pfad, 'utf8');
    const daten = JSON.parse(inhalt);
    if (!Array.isArray(daten?.betriebe)) return leererBestand();
    return { ...leererBestand(), ...daten };
  } catch (fehler) {
    if (fehler.code === 'ENOENT') return leererBestand();
    throw fehler;
  }
}

function eindeutig(liste) {
  return [...new Set(liste.filter((wert) => wert !== null && wert !== undefined && wert !== ''))];
}

/**
 * Trägt eine einzelne Stelle in den Bestand ein.
 *
 * @param {Map<string, any>} index      Schlüssel -> Betrieb
 * @param {object} stelle               Ergebnis aus stelleAusRohdaten()
 * @param {{datum: string, quelle: string}} kontext
 * @returns {Array<{ereignis: string, schluessel: string, arbeitgeber: string, ort: string, beruf: string, refnr: string}>}
 */
export function trageStelleEin(index, stelle, { datum, quelle }) {
  const arbeitgeber = String(stelle.arbeitgeber ?? '').trim();
  const ort = String(stelle.ort ?? '').trim();

  // Ohne Arbeitgebernamen ist der Datensatz für Initiativbewerbungen wertlos.
  // Die BA liefert das Feld leer, wenn ein Betrieb anonym ausschreibt.
  if (arbeitgeber === '') return [];

  const schluessel = betriebsSchluessel({ arbeitgeber, ort });
  let betrieb = index.get(schluessel);

  // Pro Stelle entsteht höchstens ein Ereignis; welcher Typ, entscheidet sich
  // erst am Ende. Die Flags werden getrennt geführt, weil ein neuer Betrieb
  // immer auch eine neue Anzeige mitbringt — würde der Ereignistyp allein
  // gezählt, meldete der Tagesbericht bei lauter Neuzugängen "0 neue
  // Anzeigen".
  let istNeuerBetrieb = false;
  let istNeuerBeruf = false;
  let istNeueAnzeige = false;

  if (!betrieb) {
    betrieb = {
      schluessel,
      arbeitgeber,
      schreibweisen: [arbeitgeber],
      ort,
      plz: stelle.plz ?? '',
      region: stelle.region ?? '',
      strasse: stelle.strasse ?? '',
      koordinaten: stelle.koordinaten ?? null,
      quellen: [quelle],
      erstmalsGesehen: datum,
      zuletztGesehen: datum,
      jahre: [datum.slice(0, 4)],
      anzahlAnzeigen: 0,
      berufe: [],
      kundennummerHash: stelle.kundennummerHash ?? null,
      externeUrl: stelle.externeUrl ?? null,
    };
    index.set(schluessel, betrieb);
    istNeuerBetrieb = true;
  }

  betrieb.zuletztGesehen = datum > (betrieb.zuletztGesehen ?? '') ? datum : betrieb.zuletztGesehen;
  betrieb.jahre = eindeutig([...(betrieb.jahre ?? []), datum.slice(0, 4)]).sort();
  betrieb.quellen = eindeutig([...(betrieb.quellen ?? []), quelle]);
  betrieb.schreibweisen = eindeutig([...(betrieb.schreibweisen ?? []), arbeitgeber]);

  // Lücken auffüllen, aber nie einen vorhandenen Wert überschreiben: die
  // erste Meldung ist erfahrungsgemäß die vollständigste.
  for (const feld of ['plz', 'region', 'strasse']) {
    if (!betrieb[feld] && stelle[feld]) betrieb[feld] = stelle[feld];
  }
  if (!betrieb.koordinaten && stelle.koordinaten) betrieb.koordinaten = stelle.koordinaten;
  if (!betrieb.kundennummerHash && stelle.kundennummerHash) {
    betrieb.kundennummerHash = stelle.kundennummerHash;
  }
  if (!betrieb.externeUrl && stelle.externeUrl) betrieb.externeUrl = stelle.externeUrl;

  /** Baut das eine Ereignis dieser Stelle — oder keines, wenn nichts neu war. */
  const ereignisse = () => {
    if (!istNeuerBetrieb && !istNeuerBeruf && !istNeueAnzeige) return [];
    return [
      {
        ereignis: istNeuerBetrieb ? 'neuer_betrieb' : istNeuerBeruf ? 'neuer_beruf' : 'neue_anzeige',
        neueAnzeige: istNeueAnzeige,
        schluessel,
        arbeitgeber,
        ort,
        beruf: String(stelle.beruf ?? '').trim(),
        refnr: String(stelle.refnr ?? '').trim(),
        datum,
        quelle,
      },
    ];
  };

  const berufName = String(stelle.beruf ?? '').trim();
  if (berufName === '') return ereignisse();

  const berufSchluessel = normalisiereBeruf(berufName);
  let beruf = betrieb.berufe.find((eintrag) => eintrag.normalisiert === berufSchluessel);

  if (!beruf) {
    beruf = {
      beruf: berufName,
      normalisiert: berufSchluessel,
      erstmalsGesehen: datum,
      zuletztGesehen: datum,
      anzahlAnzeigen: 0,
      referenznummern: [],
    };
    betrieb.berufe.push(beruf);
    istNeuerBeruf = true;
  }

  beruf.zuletztGesehen = datum > (beruf.zuletztGesehen ?? '') ? datum : beruf.zuletztGesehen;

  // Anzeigen werden über die Referenznummer gezählt, nicht über Sichtungen.
  // Sonst stünde nach 60 Sammelläufen bei einer einzigen offenen Stelle
  // "60 Anzeigen" — und die Zahl, die zeigt, wie regelmäßig ein Betrieb
  // ausbildet, wäre wertlos.
  const refnr = String(stelle.refnr ?? '').trim();
  if (refnr !== '' && !beruf.referenznummern.includes(refnr)) {
    beruf.referenznummern.push(refnr);
    beruf.anzahlAnzeigen = beruf.referenznummern.length;
    istNeueAnzeige = true;
  } else if (beruf.anzahlAnzeigen === 0) {
    // Quelle ohne Referenznummern (z. B. Kammer-Import): mindestens 1.
    beruf.anzahlAnzeigen = 1;
  }

  betrieb.anzahlAnzeigen = betrieb.berufe.reduce(
    (summe, eintrag) => summe + (eintrag.anzahlAnzeigen ?? 0),
    0,
  );

  return ereignisse();
}

/**
 * Führt eine Liste von Stellen in einen Bestand ein und liefert den neuen
 * Bestand samt der Ereignisse, die dabei entstanden sind.
 *
 * @param {object} bestand
 * @param {object[]} stellen
 * @param {{datum: string, quelle: string}} kontext
 */
export function fuegeStellenEin(bestand, stellen, kontext) {
  const index = new Map(bestand.betriebe.map((betrieb) => [betrieb.schluessel, betrieb]));
  const ereignisse = [];

  for (const stelle of stellen) {
    ereignisse.push(...trageStelleEin(index, stelle, kontext));
  }

  const betriebe = [...index.values()].sort(
    (a, b) =>
      (a.ort ?? '').localeCompare(b.ort ?? '', 'de') ||
      (a.arbeitgeber ?? '').localeCompare(b.arbeitgeber ?? '', 'de'),
  );

  for (const betrieb of betriebe) {
    betrieb.berufe.sort((a, b) => a.beruf.localeCompare(b.beruf, 'de'));
  }

  return {
    bestand: {
      ...bestand,
      version: BESTAND_VERSION,
      aktualisiert: kontext.datum,
      anzahlBetriebe: betriebe.length,
      betriebe,
    },
    ereignisse,
  };
}

export async function speichereBestand(pfad, bestand) {
  await mkdir(dirname(pfad), { recursive: true });
  await writeFile(pfad, `${JSON.stringify(bestand, null, 2)}\n`, 'utf8');
}

/** Hängt Ereignisse an das Historien-Log an (eine JSON-Zeile je Ereignis). */
export async function schreibeHistorie(pfad, ereignisse) {
  if (ereignisse.length === 0) return;
  await mkdir(dirname(pfad), { recursive: true });
  const zeilen = ereignisse.map((ereignis) => JSON.stringify(ereignis)).join('\n');
  await appendFile(pfad, `${zeilen}\n`, 'utf8');
}

/** Nur zur Vollständigkeit exportiert — hält VERWALTETE_FELDER testbar. */
export { VERWALTETE_FELDER };
