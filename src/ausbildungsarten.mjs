// Ausbildungsarten der BA-Jobsuche.
//
// `angebotsart=4` liefert Ausbildungsplätze UND duale Studien zusammen.
// Getrennt werden die beiden über zwei Stellen:
//
//   1. dem Suchfilter `ausbildungsart` (0/1/2) — damit sortiert die BA die
//      dualen Studien schon beim Abruf weg, und
//   2. dem Feld `ausbildungsart` im Treffer selbst ("AUSBILDUNG" oder
//      "DUALES_STUDIUM"), ergänzt um `studienform`.
//
// Weil die API nicht dokumentiert zugesichert ist (siehe README), reicht
// keines von beidem allein: Der Filter ist die Normalfall-Lösung, die
// Textprüfung das Sicherheitsnetz für den Fall, dass die BA den Parameter
// ignoriert oder die Feldnamen umbenennt. Umgekehrt darf die Textprüfung
// keine echten Ausbildungsberufe fressen — deshalb die Wortmuster unten.
//
// Beide Regeln wurden gegen 1200 live geholte Treffer geprüft: kein duales
// Studium wurde übersehen, und kein regulärer Ausbildungsberuf wurde
// fälschlich aussortiert.

/** Codes der Facette „Ausbildungsart" der BA-Jobsuche. */
export const AUSBILDUNGSART = {
  /** klassische Berufsausbildung */
  AUSBILDUNG: 0,
  /** duales Studium mit Ausbildungsanteil (ausbildungsintegrierend) */
  DUALES_STUDIUM_MIT_AUSBILDUNG: 1,
  /** duales Studium (praxisintegrierend) */
  DUALES_STUDIUM: 2,
};

/**
 * Wortstämme, an denen ein Studium erkennbar ist: Studium, Studiengang,
 * Studierende, Student, Studienplatz. „StudiumPLUS" fällt mit drin, ein
 * zusammengeschriebenes „Werkstudent" dagegen nicht — das ist eine
 * Aushilfe, kein Studium.
 */
const STUDIUM_WORT = /\bstud(?:ium|engang|ierend\w*|ent\w*|ienplatz\w*)/i;

/**
 * Abschlussbezeichnungen, die im Titel eines Ausbildungsangebots nur im
 * Zusammenhang mit einem dualen Studium auftauchen.
 *
 * „Master" ist bewusst nicht als freies Wort enthalten: der Ausbildungsberuf
 * „Kunststoff- und Kautschuktechnologe/-technologin – Compound- und
 * Masterbatchherstellung" darf nicht daran hängen.
 */
const ABSOLUT_MUSTER = [
  /\bbachelor\w*/i,
  /\bmaster\s+of\b/i,
  /\bmasterstudium\b/i,
  /\bb\.\s?sc\./i,
  /\bb\.\s?a\./i,
  /\bm\.\s?sc\./i,
  /\bdhbw\b/i,
];

/**
 * Felder eines BA-Treffers, in denen der Titel des Berufs steht.
 *
 * Die BA benennt sie je nach Version unterschiedlich („stellenangebotsTitel"
 * in der Trefferliste, „titel" in älteren Antworten, „hauptberuf" für den
 * Beruf). Alle bekannten Schreibweisen werden abgeklopft.
 */
const TEXT_FELDER = [
  'stellenangebotsTitel',
  'titel',
  'hauptberuf',
  'beruf',
  'berufsbezeichnung',
  'studiengang',
  'alleBerufe',
];

/**
 * Sammelt die Textfelder eines Treffers in eine Zeile.
 * @param {Record<string, any>} roh
 * @returns {string}
 */
function texteAus(roh) {
  const werte = [];
  for (const feld of TEXT_FELDER) {
    const wert = roh?.[feld];
    if (typeof wert === 'string') werte.push(wert);
    else if (Array.isArray(wert)) {
      for (const eintrag of wert) if (typeof eintrag === 'string') werte.push(eintrag);
    }
  }
  return werte.join(' | ');
}

/**
 * Prüft einen Text auf Anhaltspunkte für ein duales Studium.
 * @param {string} text
 * @returns {boolean}
 */
export function textIstDualesStudium(text) {
  const wert = String(text ?? '');
  if (wert.trim() === '') return false;
  if (STUDIUM_WORT.test(wert)) return true;
  return ABSOLUT_MUSTER.some((muster) => muster.test(wert));
}

/**
 * Entscheidet an einem BA-Treffer, ob es ein duales Studium ist.
 *
 * Zuerst die strukturierten Felder der BA, dann der Titel. Der Titel
 * entscheidet auch dann, wenn die BA einen dualen Studiengang als
 * „AUSBILDUNG" führt — das kommt in der Praxis vor („Duales Studium
 * Rechtspfleger/-in", „Ausbildung / Duales Studium - Steinmetz/in").
 *
 * @param {Record<string, any>} roh Treffer der BA oder normalisierter Datensatz
 * @returns {boolean}
 */
export function istDualesStudium(roh) {
  if (!roh || typeof roh !== 'object') return false;

  const art = String(roh.ausbildungsart ?? '').trim().toUpperCase();
  if (art.includes('DUAL')) return true;

  const form = String(roh.studienform ?? '').trim().toUpperCase();
  if (form && form !== 'KEINE_ANGABE' && /DUAL|PRAXIS|INTEGRIEREND/.test(form)) return true;

  return textIstDualesStudium(texteAus(roh));
}

/**
 * Lässt nur echte Ausbildungsplätze durch.
 * @param {any[]} stellen
 * @returns {any[]}
 */
export function nurAusbildungsplaetze(stellen) {
  return (stellen ?? []).filter((stelle) => !istDualesStudium(stelle));
}
