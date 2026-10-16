import { beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_OFFEN, standardSzenario } from '../store/standard';
import { useSzenario } from '../store/szenario';
import { leereAntworten, szenarioAusCheck } from '../check/uebernahme';
import { BEKANNTE_PFADE, SCHRITTE, eintragVon, offeneBeispiele, offenePfade, relevant } from './vorbelegung';

const offen = () => offenePfade(useSzenario.getState().szenario);

describe('Vorbelegung', () => {
  beforeEach(() => useSzenario.getState().zuruecksetzen());

  it('jeder offene Pfad eines neuen Falls hat eine Marke oder ist ein Schritt', () => {
    for (const pfad of STANDARD_OFFEN) {
      expect(eintragVon(pfad) !== undefined || (SCHRITTE as readonly string[]).includes(pfad), pfad).toBe(true);
    }
    // Und umgekehrt: keine Marke, die es nirgends gibt.
    expect(BEKANNTE_PFADE.length).toBeGreaterThan(10);
  });

  it('ein neuer Fall: vier Beispielwerte, alles Uebrige Standard', () => {
    expect(offeneBeispiele(standardSzenario())).toEqual(['Geburtsdatum', 'Rentenanspruch', 'Einkommen', 'Zielnetto']);
    expect(offen()).toEqual(expect.arrayContaining(['annahmen.inflation', 'haushalt.kvStatus', 'vertraege', 'auswertung']));
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

    st.vertragHinzufuegen(2);
    expect(offen()).not.toContain('vertraege');
  });

  it('„Stimmt so“ bestaetigt einen Beispielwert, ohne ihn zu aendern', () => {
    const vorher = useSzenario.getState().szenario.personen[0]!.grvBruttoHeute;
    useSzenario.getState().pruefen('personen.A.grvBruttoHeute');
    expect(offen()).not.toContain('personen.A.grvBruttoHeute');
    expect(useSzenario.getState().szenario.personen[0]!.grvBruttoHeute).toBe(vorher);
  });

  it('ein von Hand gesetzter Rentenbeginn ist geprueft, das Zuruecksetzen macht ihn wieder zum Standard', () => {
    const st = useSzenario.getState();
    st.setzePerson('A', { rentenbeginn: '01.01.2049' });
    expect(offen()).not.toContain('personen.A.rentenbeginn');
    st.rentenbeginnZuruecksetzen('A');
    expect(offen()).toContain('personen.A.rentenbeginn');
  });

  it('Zuruecksetzen bringt alle Marken zurueck', () => {
    const st = useSzenario.getState();
    st.setzeEinkommen({ betrag: 5200 });
    st.pruefen('haushalt.zielNettoHeute');
    st.zuruecksetzen();
    expect(offen()).toEqual([...STANDARD_OFFEN]);
  });

  it('der neue Partner beginnt als Kopie — seine Angaben sind Beispiele', () => {
    const st = useSzenario.getState();
    st.setzeHaushalt({ verheiratet: true });
    st.partnerHinzufuegen();
    const s = useSzenario.getState().szenario;
    expect(offenePfade(s)).toEqual(expect.arrayContaining(['personen.B.geburtsdatum', 'personen.B.grvBruttoHeute']));
    expect(offeneBeispiele(s, (id) => (id === 'A' ? 'Anna' : 'Ben'))).toContain('Geburtsdatum (Ben)');
  });

  it('getrennte Einkommen: das unberuehrte Partnereinkommen ist ein Beispielwert', () => {
    const st = useSzenario.getState();
    st.setzeHaushalt({ verheiratet: true });
    st.partnerHinzufuegen();
    st.setzeEinkommenGetrennt(true);
    expect(offen()).toContain('einkommenPartner.betrag');
    st.setzeEinkommenPartner({ betrag: 3100 });
    expect(offen()).not.toContain('einkommenPartner.betrag');
    // Aus- und wieder einschalten markiert ein eingetragenes Einkommen nicht neu.
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
    expect(offeneBeispiele(echt)).toEqual([]);
    // Ein Fall mit echten Angaben gilt als ausgewertet; die Standardannahmen bleiben gekennzeichnet.
    expect(offenePfade(echt)).not.toContain('auswertung');
    expect(offenePfade(echt)).toContain('annahmen.inflation');
  });

  it('eine leere Liste heisst: alles geprueft', () => {
    expect(offenePfade({ ...standardSzenario(), offen: [] })).toEqual([]);
  });

  it('Vorsorge-Check: was der Kunde offen laesst, wird Beispielwert statt stiller Vorgabe', () => {
    const leer = szenarioAusCheck(leereAntworten());
    expect(offeneBeispiele(leer)).toEqual(expect.arrayContaining(['Geburtsdatum', 'Rentenanspruch', 'Einkommen', 'Zielnetto']));

    const a = leereAntworten();
    const beantwortet = szenarioAusCheck({
      ...a,
      zielNettoHeute: 2500,
      a: { ...a.a, geburtsdatum: '12.05.1980', grvRente: 1700, einkommen: { ...a.a.einkommen, betrag: 4200 } },
    });
    expect(offeneBeispiele(beantwortet)).toEqual([]);
    // Die Annahmen fragt der Check nicht ab — sie bleiben Standardwerte.
    expect(offenePfade(beantwortet)).toEqual(expect.arrayContaining(['annahmen.inflation', 'annahmen.rentendynamik']));
  });

  it('nicht jede offene Angabe zaehlt', () => {
    const s = standardSzenario();
    const beamter = { ...s, personen: [{ ...s.personen[0]!, art: 'pension' as const }] };
    expect(relevant(beamter, 'personen.A.grvBruttoHeute')).toBe(false);
    expect(offeneBeispiele(beamter)).not.toContain('Rentenanspruch');
    expect(relevant(s, 'haushalt.pkv')).toBe(false);
    expect(relevant({ ...s, haushalt: { ...s.haushalt, kvStatus: 'pkv' } }, 'haushalt.pkv')).toBe(true);
    expect(relevant(s, 'personen.B.geburtsdatum')).toBe(false);
  });
});
