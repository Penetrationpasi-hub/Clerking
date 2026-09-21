// CSV-Import/-Export.
//
// Semikolon als Trennzeichen und ein BOM am Anfang: so öffnet Excel in der
// deutschen Einstellung die Datei ohne Import-Dialog und mit korrekten
// Umlauten. Das ist keine Kosmetik — die Liste soll am Ende jemand in der
// Maßnahme benutzen können, nicht nur ein Skript.

export const SPALTEN = [
  'Arbeitgeber',
  'Ort',
  'PLZ',
  'Strasse',
  'Region',
  'Ausbildungsberufe',
  'AnzahlBerufe',
  'AnzahlAnzeigen',
  'ErstmalsGesehen',
  'ZuletztGesehen',
  'Jahre',
  'Quellen',
  'Webseite',
  'Notiz',
];

function feld(wert) {
  const text = String(wert ?? '');
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * @param {{betriebe: any[]}} bestand
 * @returns {string}
 */
export function bestandAlsCsv(bestand) {
  const zeilen = [SPALTEN.join(';')];

  for (const betrieb of bestand.betriebe) {
    zeilen.push(
      [
        betrieb.arbeitgeber,
        betrieb.ort,
        betrieb.plz,
        betrieb.strasse,
        betrieb.region,
        (betrieb.berufe ?? []).map((eintrag) => eintrag.beruf).join(' | '),
        (betrieb.berufe ?? []).length,
        betrieb.anzahlAnzeigen ?? 0,
        betrieb.erstmalsGesehen,
        betrieb.zuletztGesehen,
        (betrieb.jahre ?? []).join(' '),
        (betrieb.quellen ?? []).join(' '),
        betrieb.externeUrl ?? '',
        betrieb.notiz ?? '',
      ]
        .map(feld)
        .join(';'),
    );
  }

  return `﻿${zeilen.join('\n')}\n`;
}

/**
 * Minimaler CSV-Parser für Importe aus Kammer-Listen.
 * Erkennt Semikolon oder Komma als Trennzeichen, versteht Anführungszeichen.
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function csvLesen(text) {
  const inhalt = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const kopfzeile = inhalt.slice(0, inhalt.indexOf('\n') === -1 ? inhalt.length : inhalt.indexOf('\n'));
  const trenner = (kopfzeile.match(/;/g)?.length ?? 0) >= (kopfzeile.match(/,/g)?.length ?? 0) ? ';' : ',';

  const zeilen = [];
  let zelle = '';
  let zeile = [];
  let inAnfuehrung = false;

  for (let i = 0; i < inhalt.length; i += 1) {
    const zeichen = inhalt[i];

    if (inAnfuehrung) {
      if (zeichen === '"' && inhalt[i + 1] === '"') {
        zelle += '"';
        i += 1;
      } else if (zeichen === '"') {
        inAnfuehrung = false;
      } else {
        zelle += zeichen;
      }
      continue;
    }

    if (zeichen === '"') inAnfuehrung = true;
    else if (zeichen === trenner) {
      zeile.push(zelle);
      zelle = '';
    } else if (zeichen === '\n') {
      zeile.push(zelle);
      zeilen.push(zeile);
      zeile = [];
      zelle = '';
    } else zelle += zeichen;
  }
  if (zelle !== '' || zeile.length > 0) {
    zeile.push(zelle);
    zeilen.push(zeile);
  }

  if (zeilen.length === 0) return [];
  const kopf = zeilen[0].map((name) => name.trim());

  return zeilen
    .slice(1)
    .filter((werte) => werte.some((wert) => wert.trim() !== ''))
    .map((werte) => Object.fromEntries(kopf.map((name, index) => [name, (werte[index] ?? '').trim()])));
}
