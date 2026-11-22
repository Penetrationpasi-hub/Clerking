import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUSBILDUNGSART,
  ART_DUALES_STUDIUM,
  istDualesStudium,
  markiereDualeStudien,
  nurAusbildungsplaetze,
  textIstDualesStudium,
} from '../src/ausbildungsarten.mjs';

test('erkennt duales Studium am strukturierten Feld der BA', () => {
  const dual = {
    stellenangebotsart: 'AUSBILDUNG',
    ausbildungsart: 'DUALES_STUDIUM',
    studienform: 'PRAXISINTEGRIEREND',
    stellenangebotsTitel: 'Duales Studium (m/w/d)',
    hauptberuf: 'Finanzassistent/in',
  };
  assert.equal(istDualesStudium(dual), true);

  const ausbildung = {
    stellenangebotsart: 'AUSBILDUNG',
    ausbildungsart: 'AUSBILDUNG',
    stellenangebotsTitel: 'IT-Systemelektroniker w/m/d - Ausbildung',
    hauptberuf: 'IT-System-Elektroniker/in',
  };
  assert.equal(istDualesStudium(ausbildung), false);
});

test('erkennt duales Studium auch dann, wenn die BA es als Ausbildung führt', () => {
  // Die BA stuft manche dualen Studiengänge als "AUSBILDUNG" ein. Der Titel
  // verrät sie trotzdem — solche Anzeigen dürfen nicht in den Bestand.
  const faelle = [
    'Duales Studium Rechtspfleger/ -in (m/w/d)',
    'Ausbildung / Duales Studium - Steinmetz/in und Steinbildhauer/in - Stein (m/w/d)',
    'Bachelor of Engineering (m/w/d)',
    '2027 Studium Duale Hochschule Baden-Württemberg: BWL-Bank (Bachelor of Arts)',
    'Ausbildung 2027 - Primary Care Management (B. Sc.) (m/w/d)',
    'Duale:r Student:in im Bauingenieurwesen (m/w/d)',
    'DH-Student Elektrotechnik/Automation (m/w/d)',
    // Der Stamm "stud" steht hier nicht am Wortanfang bzw. der Abschluss
    // heißt B.Eng. — beides muss trotzdem erkannt werden.
    'Studiengang Public Financial Management',
    'Studiengang zum B.Eng.* im Maschinenbau in 2027',
    'Duales Hochschulstudium BWL-Industrial Business Management',
    'Maschinenbau mit Studienrichtung Konstruktion und Entwicklung (B.Eng.)',
    'Angehende Pflegefachperson (m/w/d) im Studiengang Pflege',
  ];
  for (const titel of faelle) {
    assert.equal(
      istDualesStudium({ ausbildungsart: 'AUSBILDUNG', stellenangebotsTitel: titel }),
      true,
      `sollte als duales Studium erkannt werden: ${titel}`,
    );
  }
});

test('lässt reguläre Ausbildungsberufe in Ruhe', () => {
  const faelle = [
    'Ausbildung zum Bäcker (m/w/d) 2027',
    'Ausbildung Konditor/-in',
    'Ausbildung Kfz-Mechatroniker/in',
    // "Masterbatchherstellung" ist ein Ausbildungsberuf und darf nicht an
    // "Master" hängen.
    'Ausbildung Kunststoff- und Kautschuktechnologe/-technologin - Compound- und Masterbatchherstellung',
    'Ausbildung zum/zur Elektroniker/in - Informations- und Systemtechnik',
    'Werkstudent (m/w/d) im Maschinenbau',
    // Studierendenwerk und Studentenwerk bilden regulär aus.
    'Ausbildung beim Studierendenwerk Stuttgart (m/w/d)',
    'Ausbildung Koch/Köchin im Studentenwerk',
  ];
  for (const titel of faelle) {
    assert.equal(
      textIstDualesStudium(titel),
      false,
      `sollte als Ausbildungsplatz durchgehen: ${titel}`,
    );
  }
});

test('liest den Text aus den Feldern, die die BA je nach Version benutzt', () => {
  assert.equal(istDualesStudium({ titel: 'Duales Studium BWL (m/w/d)' }), true);
  assert.equal(istDualesStudium({ hauptberuf: 'Duales Studium BWL (m/w/d)' }), true);
  assert.equal(istDualesStudium({ beruf: 'Duales Studium BWL (m/w/d)' }), true);
  assert.equal(istDualesStudium({ alleBerufe: ['Duales Studium BWL (m/w/d)'] }), true);
  assert.equal(istDualesStudium({}), false);
  assert.equal(istDualesStudium(null), false);
});

test('filtert eine Liste auf Ausbildungsplätze', () => {
  const stellen = [
    { titel: 'Ausbildung Bäcker/in', ausbildungsart: 'AUSBILDUNG' },
    { titel: 'Duales Studium BWL (m/w/d)', ausbildungsart: 'DUALES_STUDIUM' },
    { titel: 'Ausbildung Kfz-Mechatroniker/in', ausbildungsart: 'AUSBILDUNG' },
  ];
  const uebrig = nurAusbildungsplaetze(stellen);
  assert.equal(uebrig.length, 2);
  assert.deepEqual(
    uebrig.map((stelle) => stelle.titel),
    ['Ausbildung Bäcker/in', 'Ausbildung Kfz-Mechatroniker/in'],
  );
});

test('markiert duale Studien, statt sie zu verwerfen', () => {
  const stellen = markiereDualeStudien([
    { titel: 'Ausbildung Bäcker/in', ausbildungsart: 'AUSBILDUNG' },
    { titel: 'Studiengang Public Financial Management', ausbildungsart: 'AUSBILDUNG' },
    { titel: 'Ausbildung Koch/Köchin im Studentenwerk', ausbildungsart: 'AUSBILDUNG' },
  ]);

  assert.equal(stellen.length, 3);
  assert.equal(stellen[0].art, undefined);
  assert.equal(stellen[1].art, ART_DUALES_STUDIUM);
  assert.equal(stellen[2].art, undefined);
});

test('die Codes der Ausbildungsarten passen zur BA', () => {
  assert.equal(AUSBILDUNGSART.AUSBILDUNG, 0);
  assert.equal(AUSBILDUNGSART.DUALES_STUDIUM_MIT_AUSBILDUNG, 1);
  assert.equal(AUSBILDUNGSART.DUALES_STUDIUM, 2);
});
