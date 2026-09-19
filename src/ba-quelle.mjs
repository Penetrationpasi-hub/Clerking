// Anbindung an die Jobsuche-API der Bundesagentur für Arbeit.
//
// Dieselbe Basis-URL und derselbe API-Key wie in der bereits laufenden
// Netlify-Funktion der Hauptanwendung. Einziger inhaltlicher Unterschied:
// angebotsart=4 (Ausbildung / duales Studium) statt 1 (Arbeit).

export const BASIS = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
export const API_KEY = 'jobboerse-jobsuche';

/** angebotsart-Codes der BA-Jobsuche. */
export const ANGEBOTSART = {
  ARBEIT: 1,
  SELBSTSTAENDIGKEIT: 2,
  AUSBILDUNG: 4,
  PRAKTIKUM: 34,
};

/**
 * Erster nicht-leerer Wert aus einer Kandidatenliste.
 *
 * Die BA hat die Feldnamen zwischen den API-Versionen mehrfach umbenannt
 * (arbeitgeber/firma, arbeitsort/stellenlokationen). Statt sich auf eine
 * Version festzulegen, werden alle bekannten Schreibweisen abgeklopft — eine
 * Umbenennung kostet dann keinen ausgefallenen Sammellauf.
 */
function ersterWert(...kandidaten) {
  for (const kandidat of kandidaten) {
    if (kandidat === undefined || kandidat === null) continue;
    const wert = String(kandidat).trim();
    if (wert !== '') return wert;
  }
  return '';
}

/**
 * Übersetzt einen Rohdatensatz der BA in die Felder, die der Bestand führt.
 * @param {Record<string, any>} roh
 * @returns {{arbeitgeber: string, ort: string, plz: string, region: string,
 *   beruf: string, titel: string, refnr: string, veroeffentlicht: string|null,
 *   eintritt: string|null, koordinaten: {lat: number, lon: number}|null,
 *   kundennummerHash: string|null, externeUrl: string|null}}
 */
export function stelleAusRohdaten(roh) {
  const adresse = roh?.arbeitsort ?? roh?.stellenlokationen?.[0]?.adresse ?? roh?.stellenlokationen?.[0] ?? {};
  const koordinaten = adresse?.koordinaten ?? roh?.koordinaten ?? null;

  return {
    arbeitgeber: ersterWert(roh?.arbeitgeber, roh?.firma, roh?.arbeitgeberName),
    ort: ersterWert(adresse?.ort, adresse?.stadt),
    plz: ersterWert(adresse?.plz, adresse?.postleitzahl),
    region: ersterWert(adresse?.region, adresse?.bundesland),
    strasse: ersterWert(adresse?.strasse, adresse?.strasseHausnummer),
    beruf: ersterWert(roh?.beruf, roh?.hauptberuf, roh?.stellenangebotsTitel, roh?.titel),
    titel: ersterWert(roh?.titel, roh?.stellenangebotsTitel, roh?.beruf, roh?.hauptberuf),
    refnr: ersterWert(roh?.refnr, roh?.referenznummer, roh?.hashId),
    veroeffentlicht:
      ersterWert(
        roh?.aktuelleVeroeffentlichungsdatum,
        roh?.datumErsteVeroeffentlichung,
        roh?.veroeffentlichungszeitraum?.von,
        roh?.modifikationsTimestamp,
      ) || null,
    eintritt: ersterWert(roh?.eintrittsdatum) || null,
    koordinaten:
      koordinaten && Number.isFinite(Number(koordinaten.lat)) && Number.isFinite(Number(koordinaten.lon))
        ? { lat: Number(koordinaten.lat), lon: Number(koordinaten.lon) }
        : null,
    kundennummerHash: ersterWert(roh?.kundennummerHash) || null,
    externeUrl: ersterWert(roh?.externeUrl) || null,
  };
}

/**
 * Liest die Ergebnisliste aus einer BA-Antwort — unabhängig davon, unter
 * welchem Schlüssel sie steckt.
 */
export function ergebnisseAusAntwort(antwort) {
  const liste = antwort?.stellenangebote ?? antwort?.ergebnisliste ?? antwort?.jobs ?? [];
  const gesamt = Number(
    antwort?.maxErgebnisse ?? antwort?.maxErgebnisAnzahl ?? antwort?.gesamtErgebnisse ?? liste.length,
  );
  return {
    stellen: Array.isArray(liste) ? liste.map(stelleAusRohdaten) : [],
    gesamt: Number.isFinite(gesamt) ? gesamt : liste.length,
  };
}

async function warte(ms) {
  await new Promise((aufloesen) => setTimeout(aufloesen, ms));
}

/**
 * Ruft eine einzelne Ergebnisseite ab.
 *
 * @param {object} optionen
 * @param {string} optionen.wo            Ort, z. B. "Waiblingen"
 * @param {number} [optionen.umkreis]     Radius in km
 * @param {string} [optionen.was]         Optionaler Suchbegriff/Beruf
 * @param {number} [optionen.angebotsart] Default: Ausbildung
 * @param {number} [optionen.seite]
 * @param {number} [optionen.groesse]
 * @param {typeof fetch} [optionen.fetchImpl] Für Tests injizierbar
 * @param {number} [optionen.versuche]    Wiederholungen bei Netzfehlern
 */
export async function holeSeite({
  wo,
  umkreis,
  was,
  angebotsart = ANGEBOTSART.AUSBILDUNG,
  seite = 1,
  groesse = 100,
  fetchImpl = fetch,
  versuche = 4,
}) {
  const query = new URLSearchParams();
  if (was) query.set('was', was);
  if (wo) query.set('wo', wo);
  if (umkreis) query.set('umkreis', String(umkreis));
  query.set('angebotsart', String(angebotsart));
  query.set('size', String(groesse));
  query.set('page', String(seite));

  const url = `${BASIS}/pc/v6/jobs?${query.toString()}`;

  let letzterFehler;
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    try {
      const antwort = await fetchImpl(url, {
        headers: { 'X-API-Key': API_KEY, Accept: 'application/json' },
      });
      if (antwort.status === 429 || antwort.status >= 500) {
        throw new Error(`BA HTTP ${antwort.status}`);
      }
      if (!antwort.ok) {
        // 400er sind Anfragefehler — die werden durch Wiederholen nicht besser.
        throw Object.assign(new Error(`BA HTTP ${antwort.status}`), { endgueltig: true });
      }
      return ergebnisseAusAntwort(await antwort.json());
    } catch (fehler) {
      letzterFehler = fehler;
      if (fehler.endgueltig || versuch === versuche) break;
      await warte(2 ** versuch * 500);
    }
  }
  throw letzterFehler;
}

/**
 * Blättert eine Suche komplett durch und liefert alle Stellen.
 *
 * Die BA deckelt die Trefferausgabe. Wer an die Obergrenze stößt, schneidet
 * die Suche über `suchbegriffe` in der Konfiguration in kleinere Scheiben —
 * pro Berufsfeld eine Abfrage.
 */
export async function holeAlleSeiten(optionen) {
  const { maxSeiten = 40, pauseMs = 400, groesse = 100, protokoll = () => {} } = optionen;
  const alle = [];
  let gesamt = 0;

  for (let seite = 1; seite <= maxSeiten; seite += 1) {
    const { stellen, gesamt: summe } = await holeSeite({ ...optionen, seite, groesse });
    gesamt = summe;
    alle.push(...stellen);
    protokoll(
      `    Seite ${seite}: ${stellen.length} Stellen (insgesamt gemeldet: ${summe})`,
    );

    if (stellen.length < groesse) break;
    if (alle.length >= summe) break;
    if (seite < maxSeiten) await warte(pauseMs);
  }

  return { stellen: alle, gesamt };
}
