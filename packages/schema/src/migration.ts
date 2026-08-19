import { szenarioSchema, type SzenarioParsed } from './szenario.js';

/**
 * Import beliebiger gespeicherter Staende — inklusive der flachen
 * JSON-Struktur des urspruenglichen Prototyps.
 *
 * Der Prototyp verlor beim Laden 32 von 45 Feldern und meldete Fehler nur auf
 * der Konsole (Befund A5). Hier gilt: Entweder das Szenario laesst sich
 * vollstaendig herstellen, oder der Aufrufer bekommt eine verwertbare
 * Fehlermeldung.
 */

export type ImportErgebnis =
  | { ok: true; szenario: SzenarioParsed; migriertVon: string; warnungen: string[] }
  | { ok: false; fehler: string[] };

interface LegacyExport {
  [k: string]: unknown;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/** Wandelt das flache Prototyp-Format in die Szenario-Struktur. */
export function ausLegacyFormat(d: LegacyExport): unknown {
  const prozent = (v: unknown, fb: number) => num(v, fb) / 100;

  const person = (suffix: 'A' | 'B') => ({
    id: suffix,
    name: str(d[`name${suffix}`], ''),
    geburtsdatum: str(d[`birthDate${suffix}`], suffix === 'A' ? '01.01.1995' : '01.01.1991'),
    rentenbeginn: str(d[`retDate${suffix}`], suffix === 'A' ? '01.01.2062' : '01.01.2058'),
    art: str(d[`pensionType${suffix}`], 'grv') === 'pension' ? 'pension' : 'grv',
    grvBruttoHeute: num(d[`grvGross${suffix}`], 0),
    besoldungsgruppe: str(d[`pensionEndGruppe${suffix}`], 'A13'),
    besoldungsstufe: num(d[`pensionEndStufe${suffix}`], 8),
    ruhegehaltssatz: Math.min(71.75, num(d[`pensionSatz${suffix}`], 71.75)),
    dienstbeginn: str(d[`serviceStartDate${suffix}`], '01.01.2020'),
    teilzeitphasen: Array.isArray(d[`pensionPeriods${suffix}`])
      ? (d[`pensionPeriods${suffix}`] as unknown[]).map((p, i) => {
          const o = p as LegacyExport;
          const jahr = (s: unknown) => {
            const m = /(\d{4})/.exec(String(s ?? ''));
            return m ? Number(m[1]) : new Date().getFullYear();
          };
          return {
            id: String(o.id ?? `tz-${i}`),
            bezeichnung: str(o.name, 'Teilzeit'),
            vonJahr: jahr(o.start),
            bisJahr: jahr(o.end),
            beschaeftigungsgrad: num(o.percentage, 0),
          };
        })
      : [],
  });

  const vertraege = Array.isArray(d.contracts)
    ? (d.contracts as unknown[]).map((c, i) => {
        const o = c as LegacyExport;
        return {
          id: String(o.id ?? `v-${i}`),
          inhaber: o.owner === 'B' ? 'B' : 'A',
          schicht: (num(o.layer, 3) as 1 | 2 | 3),
          typ: str(o.type, 'prvRente'),
          name: str(o.name, ''),
          brutto: num(o.gross, 0),
          strategie:
            o.payoutStrategy === 'planer' ? 'planer'
            : o.payoutStrategy === 'ignore' || o.includeInNet === false ? 'ignorieren'
            : 'rente',
          altvertrag: bool(o.isOldContract, false),
          beginnJahr: o.startYear !== undefined ? num(o.startYear, 2010) : undefined,
          monatsbeitrag: o.monthlyPremium !== undefined ? num(o.monthlyPremium, 0) : undefined,
          dynamik: o.dynamic !== undefined ? prozent(o.dynamic, 0) : undefined,
          bewirtschaftungskostenProzent: o.costs !== undefined ? num(o.costs, 20) : undefined,
          kapitalHeute: o.capital !== undefined ? num(o.capital, 0) : undefined,
          sparrate: o.monthly !== undefined ? num(o.monthly, 0) : undefined,
          renditeAnsparphase: o.returnAcc !== undefined ? prozent(o.returnAcc, 6) : undefined,
          renditeEntnahme: o.returnWith !== undefined ? prozent(o.returnWith, 2) : undefined,
          ter: o.ter !== undefined ? prozent(o.ter, 0.2) : undefined,
          ausgabeaufschlag: o.issueSurcharge !== undefined ? prozent(o.issueSurcharge, 0) : undefined,
          depotgebuehrJahr: o.depotFee !== undefined ? num(o.depotFee, 0) : undefined,
          entnahmedauer: o.duration !== undefined ? num(o.duration, 25) : undefined,
          sonderzahlung: o.specialPayment !== undefined ? num(o.specialPayment, 0) : undefined,
          sonderzahlungJahr: o.specialPaymentYear !== undefined ? num(o.specialPaymentYear, 2035) : undefined,
        };
      })
    : [];

  const verheiratet = bool(d.isMarried, false);

  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet,
      bundesland: str(d.besoldungLand, 'Nordrhein-Westfalen'),
      kirchensteuer: bool(d.hasChurchTax, false),
      hatKinder: bool(d.hasChildren, false),
      kinderUnter25: bool(d.hasChildren, false) ? 1 : 0,
      kvStatus: str(d.kvStatus, 'kvdr'),
      pkvPraemieMonat: num(d.pkvPremium, 0),
      zielNettoHeute: num(d.targetIncomeToday, 2000),
    },
    annahmen: {
      inflation: prozent(d.inflationRate, 2),
      rentendynamik: prozent(d.grvIncreaseRate, 1),
      tarifIndex: prozent(d.taxIndexRate, 1),
      gehaltsdynamik: prozent(d.wageGrowthRate, 2),
    },
    einkommenHeute: {
      modus: str(d.salaryInputMode, 'netto'),
      betrag: num(d.salaryInputValue, 2500),
      auszahlungen: num(d.salaryMultiplier, 12),
      besoldungsgruppe: str(d.besoldungGruppe, 'A13'),
      besoldungsstufe: num(d.besoldungStufe, 4),
      besoldungsland: str(d.besoldungLand, 'Bund'),
    },
    personen: verheiratet ? [person('A'), person('B')] : [person('A')],
    vertraege,
    planer: {
      startkapital: num(d.planerCapital, 0),
      dauerJahre: num(d.planerDuration, 25),
      rendite: prozent(d.planerReturn, 2),
      dynamik: prozent(d.planerDynamic, 0),
      insNettoEinrechnen: bool(d.includePlanerInNet, false),
    },
  };
}

export function importiere(rohJson: string): ImportErgebnis {
  let daten: unknown;
  try {
    daten = JSON.parse(rohJson);
  } catch {
    return { ok: false, fehler: ['Die Datei enthaelt kein gueltiges JSON.'] };
  }

  const warnungen: string[] = [];
  const obj = daten as LegacyExport;

  // Prototyp-Format erkennen: flache Struktur ohne schemaVersion
  const istLegacy = obj && typeof obj === 'object' && obj.schemaVersion === undefined;
  const kandidat = istLegacy ? ausLegacyFormat(obj) : daten;
  if (istLegacy) warnungen.push('Datei im Format des Vorgaengers erkannt und uebernommen.');

  const r = szenarioSchema.safeParse(kandidat);
  if (!r.success) {
    return {
      ok: false,
      fehler: r.error.issues.map((i) => `${i.path.join('.') || 'Datei'}: ${i.message}`),
    };
  }
  return { ok: true, szenario: r.data, migriertVon: istLegacy ? 'prototyp' : 'v1', warnungen };
}

export function exportiere(s: SzenarioParsed): string {
  return JSON.stringify(s, null, 2);
}
