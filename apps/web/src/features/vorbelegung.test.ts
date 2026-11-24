import { beforeEach, describe, expect, it } from 'vitest';
import { annahmenSchema } from '@renten/schema';
import { STANDARD_ANNAHMEN, STANDARD_OFFEN, standardSzenario } from '../store/standard';
import { useSzenario } from '../store/szenario';
import { leereAntworten, szenarioAusCheck } from '../check/uebernahme';
import {
  BEKANNTE_PFADE, SCHRITTE, eintragVon, fehlendeAngaben, fehlt, fehltSatz, offenePfade, rechenbar, relevant,
} from './vorbelegung';

const offen = () => offenePfade(useSzenario.getState().szenario);

describe('Vorbelegung', () => {
  beforeEach(() => useSzenario.getState().zuruecksetzen());

  it('jeder offene Pfad eines neuen Falls hat einen Eintrag oder ist ein Schritt', () => {
    for (const pfad of STANDARD_OFFEN) {
      expect(eintragVon(pfad) !== undefined || (SCHRITTE as readonly string[]).includes(pfad), pfad).toBe(true);
    }
    // Und umgekehrt: kein Eintrag, den es nirgends gibt.
    expect(BEKANNTE_PFADE.length).toBeGreaterThan(10);
  });

  it('ein neuer Fall gibt nichts vor: vier Angaben fehlen, alles Uebrige ist Standard', () => {
    const s = standardSzenario();
    expect(fehlendeAngaben(s)).toEqual(['Geburtsdatum', 'Rentenanspruch', 'Einkommen', 'Zielnetto']);
    expect(offen()).toEqual(expect.arrayContaining(['annahmen.inflation', 'haushalt.kvStatus', 'vertraege', 'auswertung']));
    // Unter den fehlenden Angaben liegen Platzhalter, keine Beispiele: kein Gehalt, keine Rente, kein Ziel.
    expect(s.einkommenHeute.betrag).toBe(0);
    expect(s.personen[0]!.grvBruttoHeute).toBe(0);
    expect(s.haushalt.zielNettoHeute).toBe(0);
    expect(s.haushalt.pkv.praemieMonat).toBe(0);
    expect(fehlt(s, 'personen.A.geburtsdatum')).toBe(true);
    // Eine Standardannahme fehlt nie — sie ist nur offen.
    expect(fehlt(s, 'annahmen.inflation')).toBe(false);
    expect(rechenbar(s)).toBe(false);
  });

  it('gerechnet wird ab Geburtsdatum und Einkommen — ein Ergebnis gibt es erst, wenn nichts mehr fehlt', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { geburtsdatum: '12.05.1980' });
    expect(rechenbar(useSzenario.getState().szenario)).toBe(false);
    st.setzeEinkommen({ betrag: 4200 });
    // Das heutige Netto steht damit fest: Der Vorschlag fuer das Ziel kann rechnen.
    expect(rechenbar(useSzenario.getState().szenario)).toBe(true);
    expect(fehlendeAngaben(useSzenario.getState().szenario)).toEqual(['Rentenanspruch', 'Zielnetto']);
    st.setzePerson('A', { grvBruttoHeute: 0 });
    st.setzeHaushalt({ zielNettoHeute: 2400 });
    // Eine eingetragene 0 ist eine Angabe: kein Anspruch aus der gesetzlichen Rente.
    expect(fehlendeAngaben(useSzenario.getState().szenario)).toEqual([]);
  });

  it('ein privat Versicherter: ohne Beitrag kein heutiges Netto', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { geburtsdatum: '12.05.1980' });
    st.setzeEinkommen({ betrag: 6200 });
    st.setzeHaushalt({ kvStatus: 'pkv' });
    const s = () => useSzenario.getState().szenario;
    expect(fehlendeAngaben(s())).toContain('PKV-Beitrag');
    expect(rechenbar(s())).toBe(false);
    st.setzeHaushalt({ pkv: { ...s().haushalt.pkv, praemieMonat: 640 } });
    expect(rechenbar(s())).toBe(true);
  });

  it('„fehlt“ in einem Satz, und nur fuer die Pfade eines Schritts', () => {
    expect(fehltSatz([])).toBe('');
    expect(fehltSatz(['Geburtsdatum'])).toBe('Geburtsdatum fehlt');
    expect(fehltSatz(['Geburtsdatum', 'Einkommen'])).toBe('Geburtsdatum und Einkommen fehlen');
    expect(fehltSatz(['Geburtsdatum', 'Rentenanspruch', 'Einkommen'])).toBe('Geburtsdatum, Rentenanspruch und Einkommen fehlen');
    expect(fehlendeAngaben(standardSzenario(), undefined, (p) => p.startsWith('einkommen'))).toEqual(['Einkommen']);
  });

  it('Setter streichen, was sie beruehren — auch bei gleichem Wert', () => {
    const st = useSzenario.getState();
    st.setzeEinkommen({ betrag: 4000 });
    expect(offen()).not.toContain('einkommenHeute.betrag');

    st.setzePerson('A', { geburtsdatum: '12.05.1980' });
    expect(offen()).not.toContain('personen.A.geburtsdatum');
    // Der automatisch nachgezogene Rentenbeginn bleibt ein Standardwert.
    expect(offen()).toContain('personen.A.rentenbeginn');

    st.setzeAnnahmen({ inflation: 0.025 });
    expect(offen()).not.toContain('annahmen.inflation');
    expect(offen()).toContain('annahmen.rentendynamik');

    st.setzeHaushalt({ bundesland: 'Bayern' });
    st.setzeKinderAnzahl(2);
    expect(offen()).not.toContain('haushalt.bundesland');
    expect(offen()).not.toContain('haushalt.kinderUnter25');

    st.vertragHinzufuegen('bav');
    expect(offen()).not.toContain('vertraege');
  });

  it('ein geleertes Feld ist wieder eine fehlende Angabe — keine 0', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { grvBruttoHeute: 1830 });
    expect(fehlt(useSzenario.getState().szenario, 'personen.A.grvBruttoHeute')).toBe(false);
    st.leeren('personen.A.grvBruttoHeute');
    expect(fehlt(useSzenario.getState().szenario, 'personen.A.grvBruttoHeute')).toBe(true);
    // Zweimal leeren traegt den Pfad nicht doppelt ein.
    st.leeren('personen.A.grvBruttoHeute');
    expect(offen().filter((p) => p === 'personen.A.grvBruttoHeute')).toHaveLength(1);
  });

  it('ein von Hand gesetzter Rentenbeginn ist geprueft, das Zuruecksetzen macht ihn wieder zum Standard', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { rentenbeginn: '01.01.2049' });
    expect(offen()).not.toContain('personen.A.rentenbeginn');
    st.rentenbeginnZuruecksetzen('A');
    expect(offen()).toContain('personen.A.rentenbeginn');
  });

  it('Zuruecksetzen: wieder ein Fall ohne Angaben', () => {
    const st = useSzenario.getState();
    st.setzeEinkommen({ betrag: 5200 });
    st.pruefen('haushalt.zielNettoHeute');
    st.zuruecksetzen();
    expect(offen()).toEqual([...STANDARD_OFFEN]);
  });

  it('der neue Partner: Geburtsdatum und Rentenanspruch fehlen', () => {
    const st = useSzenario.getState();
    st.setzeHaushalt({ verheiratet: true });
    st.partnerHinzufuegen();
    const s = useSzenario.getState().szenario;
    expect(offenePfade(s)).toEqual(expect.arrayContaining(['personen.B.geburtsdatum', 'personen.B.grvBruttoHeute']));
    expect(fehlendeAngaben(s, (id) => (id === 'A' ? 'Anna' : 'Ben'))).toContain('Geburtsdatum (Ben)');
  });

  it('der Rentenbeginn des Partners folgt seinem eigenen Geburtsdatum — nicht dem von A von Hand gesetzten', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { geburtsdatum: '12.05.1980' });
    st.setzePerson('A', { rentenbeginn: '01.01.2043' });
    st.setzeHaushalt({ verheiratet: true });
    st.partnerHinzufuegen();
    const b = () => useSzenario.getState().szenario.personen.find((p) => p.id === 'B')!;
    expect(b().rentenbeginnManuell).toBe(false);
    // Dasselbe Datum wie A: Der Platzhalter darunter ist gleich — gezogen wird der Rentenbeginn trotzdem.
    st.setzePerson('B', { geburtsdatum: '12.05.1980' });
    expect(b().rentenbeginn).toBe('01.06.2047');
    expect(fehlt(useSzenario.getState().szenario, 'personen.B.geburtsdatum')).toBe(false);
  });

  it('getrennte Einkommen: das Einkommen des Partners fehlt, bis es eingetragen ist', () => {
    const st = useSzenario.getState();
    st.setzeHaushalt({ verheiratet: true });
    st.partnerHinzufuegen();
    // Solange pauschal gerechnet wird, fragt niemand danach.
    expect(fehlt(useSzenario.getState().szenario, 'einkommenPartner.betrag')).toBe(false);
    st.setzeEinkommenGetrennt(true);
    expect(fehlt(useSzenario.getState().szenario, 'einkommenPartner.betrag')).toBe(true);
    st.setzeEinkommenPartner({ betrag: 3100 });
    expect(offen()).not.toContain('einkommenPartner.betrag');
    // Aus- und wieder einschalten nimmt ein eingetragenes Einkommen nicht zurueck.
    st.setzeEinkommenGetrennt(false);
    st.setzeEinkommenGetrennt(true);
    expect(offen()).not.toContain('einkommenPartner.betrag');
  });

  it('alte Faelle ohne `offen`: abgeleitet aus dem Vergleich mit den Standardwerten', () => {
    const neu = standardSzenario();
    const alt = { ...neu, offen: undefined };
    expect(offenePfade(alt)).toEqual(expect.arrayContaining(['personen.A.geburtsdatum', 'vertraege', 'auswertung']));

    const echt = {
      ...alt,
      haushalt: { ...alt.haushalt, zielNettoHeute: 2600 },
      einkommenHeute: { ...alt.einkommenHeute, betrag: 5200 },
      personen: [{ ...alt.personen[0]!, geburtsdatum: '12.05.1980', grvBruttoHeute: 1830 }],
    };
    expect(fehlendeAngaben(echt)).toEqual([]);
    // Ein Fall mit echten Angaben gilt als ausgewertet; die Standardannahmen bleiben gekennzeichnet.
    expect(offenePfade(echt)).not.toContain('auswertung');
    expect(offenePfade(echt)).toContain('annahmen.inflation');
  });

  it('eine leere Liste heisst: alles geprueft', () => {
    expect(offenePfade({ ...standardSzenario(), offen: [] })).toEqual([]);
  });

  it('Vorsorge-Check: was der Kunde offen laesst, fehlt im Rechner — statt einer stillen Vorgabe', () => {
    const leer = szenarioAusCheck(leereAntworten());
    expect(fehlendeAngaben(leer)).toEqual(expect.arrayContaining(['Geburtsdatum', 'Rentenanspruch', 'Einkommen', 'Zielnetto']));
    expect(leer.haushalt.zielNettoHeute).toBe(0);

    const a = leereAntworten();
    const beantwortet = szenarioAusCheck({
      ...a,
      zielNettoHeute: 2500,
      a: { ...a.a, geburtsdatum: '12.05.1980', grvRente: 1700, einkommen: { ...a.a.einkommen, betrag: 4200 } },
    });
    expect(fehlendeAngaben(beantwortet)).toEqual([]);
    // Die Annahmen fragt der Check nicht ab — sie bleiben Standardwerte.
    expect(offenePfade(beantwortet)).toEqual(expect.arrayContaining(['annahmen.inflation', 'annahmen.rentendynamik']));
  });

  it('nicht jede offene Angabe zaehlt', () => {
    const s = standardSzenario();
    const beamter = { ...s, personen: [{ ...s.personen[0]!, art: 'pension' as const }] };
    expect(relevant(beamter, 'personen.A.grvBruttoHeute')).toBe(false);
    expect(fehlendeAngaben(beamter)).not.toContain('Rentenanspruch');
    expect(relevant(s, 'haushalt.pkv')).toBe(false);
    expect(relevant({ ...s, haushalt: { ...s.haushalt, kvStatus: 'pkv' } }, 'haushalt.pkv')).toBe(true);
    expect(relevant(s, 'personen.B.geburtsdatum')).toBe(false);
  });
});

describe('Annahmen eines neuen Falls', () => {
  beforeEach(() => useSzenario.getState().zuruecksetzen());

  it('Rentenanpassung 1,5 %, der Steuertarif waechst mit — ueberall dieselben', () => {
    expect(STANDARD_ANNAHMEN.rentendynamik).toBe(0.015);
    expect(STANDARD_ANNAHMEN.tarifIndex).toBe(STANDARD_ANNAHMEN.rentendynamik);
    expect(standardSzenario().annahmen).toEqual(STANDARD_ANNAHMEN);
    expect(szenarioAusCheck(leereAntworten()).annahmen).toEqual(STANDARD_ANNAHMEN);
    // Fehlt eine Angabe, faellt das Schema auf dieselben Werte zurueck.
    expect(annahmenSchema.parse({})).toEqual(STANDARD_ANNAHMEN);
  });

  it('Umstellen der Inflation laesst Rentenanpassung und Steuertarif gekoppelt', () => {
    useSzenario.getState().setzeAnnahmen({ inflation: 0.025 });
    const a = useSzenario.getState().szenario.annahmen;
    expect(a.rentendynamik).toBe(0.015);
    expect(a.tarifIndex).toBe(0.015);
  });

  it('ein gespeicherter Fall behaelt seine Rentenanpassung', () => {
    const alt = { ...standardSzenario(), annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 } };
    useSzenario.getState().ausJsonImportieren(JSON.stringify(alt));
    expect(useSzenario.getState().szenario.annahmen).toMatchObject({ rentendynamik: 0.01, tarifIndex: 0.01 });
  });
});
