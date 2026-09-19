// Namens-Normalisierung und Schlüsselbildung.
//
// Der Bestand lebt davon, dass derselbe Betrieb über Monate hinweg immer
// wieder auf denselben Datensatz zusammenläuft. Die BA liefert Arbeitgeber-
// namen aber frei getippt: mal "Müller GmbH & Co. KG", mal "Mueller GmbH",
// mal "Müller  GmbH  " mit doppelten Leerzeichen. Deshalb wird für den
// Abgleich eine reduzierte Form gebildet; angezeigt wird weiterhin die
// erste gesehene Schreibweise.

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', á: 'a', à: 'a' };

// Rechtsformen und Zusätze, die für die Identität des Betriebs nichts
// beitragen. Reihenfolge ist wichtig: längere Formen zuerst, sonst bleibt
// von "gmbh & co kg" nach dem Entfernen von "gmbh" ein "& co kg" übrig.
const RECHTSFORMEN = [
  'gmbh & co kg',
  'gmbh & co ohg',
  'gmbh & co kgaa',
  'ag & co kg',
  'gmbh und co kg',
  'ggmbh',
  'gmbh',
  'mbh',
  'kgaa',
  'gbr',
  'ohg',
  'kg',
  'ag',
  'se',
  'ug haftungsbeschraenkt',
  'ug',
  'ev',
  'ek',
  'eg',
  'partg mbb',
  'partg',
];

/**
 * Reduziert einen Arbeitgebernamen auf seine Vergleichsform.
 * @param {string} name
 * @returns {string}
 */
export function normalisiereName(name) {
  let wert = String(name ?? '').toLowerCase();

  for (const [zeichen, ersatz] of Object.entries(UMLAUTE)) {
    wert = wert.split(zeichen).join(ersatz);
  }

  // Punkte, Kommas, Bindestriche usw. zu Leerzeichen — "e.K." und "e K"
  // sollen dieselbe Form ergeben.
  wert = wert.replace(/[^a-z0-9&]+/g, ' ').trim();

  // "e. K." / "e. V." / "e. G." sind nach dem vorigen Schritt in zwei Token
  // zerfallen und würden sonst nicht mehr als Rechtsform erkannt.
  wert = wert.replace(/\be\s+(k|v|g)\b/g, 'e$1');

  for (const form of RECHTSFORMEN) {
    // Rechtsform nur am Wortende entfernen, damit "AG" in "Agentur"
    // unangetastet bleibt.
    const muster = new RegExp(`(^|\\s)${form.replace(/ /g, '\\s+').replace(/&/g, '&')}\\s*$`);
    if (muster.test(wert)) {
      wert = wert.replace(muster, '').trim();
      break;
    }
  }

  return wert.replace(/\s+/g, ' ').trim();
}

/**
 * Reduziert einen Ortsnamen. Ortszusätze wie "Waiblingen-Hohenacker" oder
 * "Stuttgart, Bad Cannstatt" laufen bewusst NICHT zusammen — ein Betrieb im
 * Teilort ist für eine Initiativbewerbung eine andere Adresse.
 * @param {string} ort
 * @returns {string}
 */
export function normalisiereOrt(ort) {
  let wert = String(ort ?? '').toLowerCase();
  for (const [zeichen, ersatz] of Object.entries(UMLAUTE)) {
    wert = wert.split(zeichen).join(ersatz);
  }
  return wert.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Normalisiert eine Berufsbezeichnung für den Abgleich. Die BA schreibt
 * denselben Beruf mal als "Fachinformatiker/in - Anwendungsentwicklung",
 * mal als "Fachinformatiker/-in Anwendungsentwicklung".
 * @param {string} beruf
 * @returns {string}
 */
export function normalisiereBeruf(beruf) {
  let wert = String(beruf ?? '').toLowerCase();
  for (const [zeichen, ersatz] of Object.entries(UMLAUTE)) {
    wert = wert.split(zeichen).join(ersatz);
  }
  return (
    wert
      .replace(/\(\s*m\s*[/|]\s*w\s*[/|]\s*[dxi]\s*\)/g, ' ')
      // Geschlechtsendungen vereinheitlichen: "Bäcker/in", "Bäcker/-in" und
      // "Bäcker (m/w/d)" sind derselbe Ausbildungsberuf. Bliebe das "in" bei
      // der einen Schreibweise stehen, stünde derselbe Beruf zweimal beim
      // Betrieb.
      .replace(/\/\s*-?\s*(innen|in|frau|mann|r|e)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Bildet den Schlüssel, unter dem ein Betrieb im Bestand geführt wird.
 *
 * Bewusst Name+Ort und nicht die kundennummerHash der BA: der Hash ist nicht
 * in jeder Antwort enthalten und fehlt bei Kammer-Importen komplett. Ein
 * Schlüssel, den nur eine Quelle liefern kann, würde denselben Betrieb je
 * nach Quelle doppelt anlegen.
 *
 * @param {{arbeitgeber: string, ort: string}} betrieb
 * @returns {string}
 */
export function betriebsSchluessel({ arbeitgeber, ort }) {
  return `${normalisiereName(arbeitgeber)}|${normalisiereOrt(ort)}`;
}
