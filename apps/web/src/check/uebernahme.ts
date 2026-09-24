import { szenarioSchema, type SzenarioInput, type SzenarioParsed } from '@renten/schema';
import {
  parseDatum, toDe, regelaltersrentenbeginn, type AvdKind, type VertragsTyp,
} from '@renten/engine';
import { TYPEN } from '../features/vertragsarten';

/**
 * Was der Vorsorge-Check abfragt — und wie daraus ein Szenario wird.
 *
 * Bewusst OHNE Oberflaeche: Die Seite sammelt Antworten, diese Datei macht
 * daraus ein Szenario. Gerechnet wird hier nichts; das tut der Rechner, in
 * den das Szenario anschliessend wandert. Alles, was der Check nicht fragt,
 * bekommt ueber `szenarioSchema.parse` dieselben Vorgaben wie ein neues
 * Szenario im Rechner.
 */

export type Einkommen = SzenarioParsed['einkommenHeute'];
export type Pkv = SzenarioParsed['haushalt']['pkv'];

export interface PersonAntwort {
  name: string;
  /** TT.MM.JJJJ; leer, solange nichts eingetragen ist */
  geburtsdatum: string;
  /** Leer heisst: Regelaltersgrenze aus dem Geburtsdatum */
  rentenbeginn: string;
  einkommen: Einkommen;
  /** Gesetzliche Rente laut Renteninformation — künftige Regelaltersrente, monatlich */
  grvRente: number;
  /** Beamte: End-Besoldungsgruppe und Ruhegehaltssatz */
  endBesoldungsgruppe: string;
  ruhegehaltssatz: number;
  dienstbeginn: string;
}

export interface VertragAntwort {
  id: string;
  typ: VertragsTyp;
  inhaber: 'A' | 'B';
  /** Rente laut Standmitteilung bzw. Kaltmiete, monatlich */
  rente: number;
  /** Kapital heute — Depotwert oder vorhandenes Guthaben */
  kapital: number;
  beitrag: number;
  /** bAV: davon traegt der Arbeitgeber */
  agZuschuss: number;
  beginnJahr: number;
}

/**
 * Krankenversicherung der Partnerin bzw. des Partners.
 *
 * `gleich` ist der Regelfall und schreibt nichts an die Person — dann gilt
 * der Haushalt. Sonst stehen die Angaben als Ausnahme an Person B, genau wie
 * im Rechner; ein Paar aus Beamtem und Angestellter liesse sich anders nicht
 * abbilden.
 */
export interface KvPartner {
  art: 'gleich' | 'gesetzlich' | 'privat';
  krankenkasse: string;
  zusatzbeitrag: number;
  pkv: Pkv;
}

export interface Antworten {
  a: PersonAntwort;
  verheiratet: boolean;
  b: PersonAntwort;
  bundesland: string;
  kirchensteuer: boolean;
  kinder: AvdKind[];
  kv: 'gesetzlich' | 'privat';
  krankenkasse: string;
  zusatzbeitrag: number;
  pkv: Pkv;
  kvB: KvPartner;
  vertraege: VertragAntwort[];
  zielNettoHeute: number;
}

const JETZT = new Date().getFullYear();

function leereEinkommen(): Einkommen {
  return {
    modus: 'brutto', betrag: 0, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
  };
}

function leerePerson(): PersonAntwort {
  return {
    name: '', geburtsdatum: '', rentenbeginn: '',
    einkommen: leereEinkommen(),
    grvRente: 0,
    endBesoldungsgruppe: 'A13', ruhegehaltssatz: 71.75, dienstbeginn: '',
  };
}

export function leereAntworten(): Antworten {
  return {
    a: leerePerson(),
    verheiratet: false,
    b: leerePerson(),
    bundesland: 'Baden-Württemberg',
    kirchensteuer: false,
    kinder: [],
    kv: 'gesetzlich',
    krankenkasse: '',
    zusatzbeitrag: 0.029,
    pkv: szenarioSchema.shape.haushalt.parse({}).pkv,
    kvB: {
      art: 'gleich', krankenkasse: '', zusatzbeitrag: 0.029,
      pkv: szenarioSchema.shape.haushalt.parse({}).pkv,
    },
    vertraege: [],
    zielNettoHeute: 0,
  };
}

/** Regelaltersrentenbeginn als TT.MM.JJJJ — oder null ohne lesbares Geburtsdatum. */
export function regelRentenbeginn(geburtsdatum: string): string | null {
  const g = parseDatum(geburtsdatum);
  return g ? toDe(regelaltersrentenbeginn(g)) : null;
}

/** In welche Schicht gehoert eine Vertragsart? Aus derselben Liste wie im Rechner. */
export function schichtVon(typ: VertragsTyp): 1 | 2 | 3 {
  for (const s of [1, 2, 3] as const) if (TYPEN[s].some((t) => t.wert === typ)) return s;
  return 3;
}

/** Vertragsarten, deren Beitrag der Foerdercheck kennen muss. */
const GEFOERDERT: readonly VertragsTyp[] = ['bav', 'bavUkasse', 'basis', 'riester', 'avd'];

/**
 * Baut aus den Antworten ein Szenario.
 *
 * Fehlt ein Geburtsdatum, bleibt die Vorgabe des Rechners (01.01.1985) —
 * `personSchema` verlangt ein gueltiges Datum. Die Uebersicht des Checks
 * nennt diesen Schritt als offen; die Zahl wird also nicht stillschweigend
 * zur Auskunft.
 */
export function szenarioAusCheck(x: Antworten): SzenarioParsed {
  const person = (id: 'A' | 'B', p: PersonAntwort) => {
    const geburtsdatum = parseDatum(p.geburtsdatum) ? p.geburtsdatum : '01.01.1985';
    const regel = regelRentenbeginn(geburtsdatum)!;
    const eigenerBeginn = parseDatum(p.rentenbeginn) ? p.rentenbeginn : null;
    const beamter = p.einkommen.modus === 'besoldung';
    return {
      id,
      name: p.name.trim(),
      geburtsdatum,
      rentenbeginn: eigenerBeginn ?? regel,
      rentenbeginnManuell: eigenerBeginn !== null && eigenerBeginn !== regel,
      art: beamter ? 'pension' as const : 'grv' as const,
      grvBruttoHeute: Math.max(0, p.grvRente),
      besoldungsgruppe: beamter ? p.endBesoldungsgruppe : 'A13',
      // Am Ende der Laufbahn steht fast immer die letzte Erfahrungsstufe.
      besoldungsstufe: 8,
      ruhegehaltssatz: Math.min(71.75, Math.max(0, p.ruhegehaltssatz)),
      dienstbeginn: parseDatum(p.dienstbeginn) ? p.dienstbeginn : `01.01.${JETZT - 5}`,
      teilzeitphasen: [],
    };
  };

  const paar = x.verheiratet;
  /*
    Abweichende Krankenversicherung von B als Ausnahme an der Person — der
    Haushalt traegt weiter die Angaben von A.
  */
  const kvVonB = () => {
    const k = x.kvB;
    if (k.art === 'gleich') return {};
    if (k.art === 'privat') return { kvStatus: 'pkv' as const, kvErwerb: 'pkv' as const, pkv: k.pkv };
    return {
      kvStatus: 'kvdr' as const, kvErwerb: 'gesetzlich' as const,
      zusatzbeitrag: k.zusatzbeitrag,
      ...(k.krankenkasse ? { krankenkasse: k.krankenkasse } : {}),
    };
  };
  const personen = paar
    ? [person('A', x.a), { ...person('B', x.b), ...kvVonB() }]
    : [person('A', x.a)];

  const vertraege = x.vertraege.map((v, i) => {
    const typ = v.typ;
    const basis = {
      id: v.id || `v-check-${i}`,
      inhaber: paar ? v.inhaber : 'A' as const,
      schicht: schichtVon(typ),
      typ,
      name: '',
      strategie: 'rente' as const,
      altvertrag: false,
    };
    if (typ === 'etf') {
      return { ...basis, brutto: 0, kapitalHeute: v.kapital, sparrate: v.beitrag };
    }
    if (typ === 'avd') {
      return {
        ...basis, brutto: 0, kapitalHeute: v.kapital, monatsbeitrag: v.beitrag,
        beginnJahr: Math.max(v.beginnJahr, 2027),
      };
    }
    return {
      ...basis,
      brutto: v.rente,
      ...(typ !== 'immobilie' ? { monatsbeitrag: v.beitrag, beginnJahr: v.beginnJahr } : {}),
    };
  });

  /*
    Gefoerderte Vertraege mit Beitrag bekommen einen TUEV-Eintrag: Nur so
    kennt der Foerdercheck den schon genutzten Rahmen, und die Pruefung steht
    im Rechner sofort bereit — wie beim Hinzufuegen von Hand.
  */
  const tuev = x.vertraege
    .map((v, i) => ({ v, id: vertraege[i]!.id }))
    .filter(({ v }) => GEFOERDERT.includes(v.typ) && v.beitrag > 0)
    .map(({ v, id }) => ({
      id: `t-${id}`,
      vertragId: id,
      beitragMonat: v.beitrag,
      agZuschussMonat: v.typ.startsWith('bav') ? Math.min(v.agZuschuss, v.beitrag) : 0,
      beginnJahr: v.typ === 'avd' ? Math.max(v.beginnJahr, 2027) : v.beginnJahr,
      beginnDatum: `01.01.${v.typ === 'avd' ? Math.max(v.beginnJahr, 2027) : v.beginnJahr}`,
    }));

  const privat = x.kv === 'privat';
  const eingabe: SzenarioInput = {
    schemaVersion: 1,
    haushalt: {
      verheiratet: paar,
      bundesland: x.bundesland,
      kirchensteuer: x.kirchensteuer,
      hatKinder: x.kinder.length > 0,
      kinderUnter25: x.kinder.filter((k) => JETZT - k.geburtsjahr < 25).length,
      kinder: x.kinder,
      kvStatus: privat ? 'pkv' : 'kvdr',
      kvErwerb: privat ? 'pkv' : 'gesetzlich',
      ...(privat ? {} : {
        zusatzbeitrag: x.zusatzbeitrag,
        ...(x.krankenkasse ? { krankenkasse: x.krankenkasse } : {}),
      }),
      // Der Wert kommt aus `PkvFelder` und ist schon geparst — der Marker
      // `praemieEnthaeltBet` verhindert, dass das Schema den Entlastungstarif
      // ein zweites Mal aufaddiert.
      pkv: x.pkv,
      zielNettoHeute: x.zielNettoHeute > 0 ? x.zielNettoHeute : 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: x.a.einkommen,
    einkommenGetrennt: paar,
    einkommenPartner: paar ? x.b.einkommen : undefined,
    personen,
    vertraege,
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    tuev,
  };
  return szenarioSchema.parse(eingabe);
}
