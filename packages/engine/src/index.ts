// Rechtsstand
export * from './params/types.js';
export { PARAMETER_2024, PARAMETER_2025, PARAMETER_2026, BELEGTE_JAHRE, BASISJAHR } from './params/jahre.js';
export { parameterFuer, rechtsstandInfo, type Fortschreibung, type RechtsstandInfo } from './params/registry.js';

// Steuer
export {
  grundtarif, einkommensteuer, grenzsteuersatz, durchschnittssteuersatz,
  solidaritaetszuschlag, kirchensteuersatz, koeffizienten,
} from './tax/estg.js';
export {
  haushaltssteuer, zusatzsteuer, abgeltungsteuer,
  type Einkunftsquelle, type HaushaltsSteuer, type SteuerAufteilung,
} from './tax/haushalt.js';

// Sozialversicherung
export {
  kvPvImAlter, kvPvArbeitnehmer, pvSatzMitglied, kvSatzVoll, bavFreibetragMonat,
  type KvStatus, type BeitragsArt, type Beitragspflichtig, type KinderStatus, type KvPvErgebnis,
} from './social/kv-pv.js';

// Erwerbsphase
export {
  bruttoZuNetto, nettoZuBrutto, erwerbHaushalt,
  type ErwerbsNetto, type ErwerbsOptionen, type HaushaltsPerson, type ErwerbHaushaltErgebnis,
} from './erwerb/netto.js';

// Altersversorgung
export {
  versorgungsfreibetrag, rentenfreibetrag, besteuerungsanteilRente,
  altersentlastungsbetrag, ertragsanteil, type EingefrorenerFreibetrag,
} from './pension/freibetraege.js';
export {
  regelaltersgrenze, regelaltersrentenbeginn, zugangsfaktor, renteAusEntgeltpunkten, entgeltpunkteJahr,
  schaetzeEntgeltpunkte, type KarriereSchaetzung,
} from './pension/grv.js';
export {
  besoldung, ruhegehaltssatz, versorgungsabschlag, mindestversorgung,
  RUHEGEHALT_PRO_JAHR, RUHEGEHALT_MAX, type BesoldungErgebnis, type Dienstzeitraum,
} from './pension/beamte.js';
export {
  besoldungstabelle, BESOLDUNGSGRUPPEN, BUNDESLAENDER, BELEGTE_TABELLEN,
  VERIFIZIERTE_ECKWERTE, type Besoldungstabelle, type Besoldungsgruppe,
} from './pension/besoldung-daten.js';

// Produkte
export {
  vorabpauschale, ansparphase, entnahmeplan, guenstigerpruefung,
  kapitalversicherungErtrag, type DepotVerlauf,
} from './products/kapitalanlage.js';
export {
  bavKapitalSteuer, bavKapitalMonatswert, riesterZulagen, riesterZulagenkuerzung,
} from './products/bav.js';
export {
  entnahmeRate, entnahmeplanBewerten, type EntnahmeErgebnis,
} from './products/entnahmeplaner.js';
export {
  avdZulagen, avdAnsparphase, avdAuszahlung, avdSteuervorteil, avdGegenFreiesDepot,
  avdProfitabilitaet, avdKinderzulageBis,
  type AvdKind, type AvdZulagen, type AvdAnsparErgebnis, type AvdJahr,
  type AvdSteuervorteil, type DepotSeite, type AvdProfitabilitaet,
} from './products/altersvorsorgedepot.js';

// Analyse
export {
  internerZins, kennzahlen,
  type Zahlungsreihe, type Kennzahlen,
} from './analyse/kennzahlen.js';
export { ruhestandsfenster } from './analyse/ruhestandsfenster.js';
export {
  vertragsTuev, renteOderKapital,
  type TuevAnnahmen, type TuevKontext, type TuevErgebnis, type RenteOderKapital,
} from './analyse/vertrags-tuev.js';

// Projektion
export {
  projiziere, istKapitalvertrag,
  type Jahreszeile, type JahresPosten, type ProjektionsErgebnis, type PlanerErgebnis,
  type AvdLauf, type KapitalVerrentung,
} from './projection/timeline.js';

// Datum
export {
  parseDatum, toIso, toDe, jahreZwischen, alterAm, alterExakt, heute, datumPlus, jahresanteilAb,
  type Datum,
} from './util/datum.js';

// Modell
export type {
  Szenario, Person, Vertrag, Haushalt, Annahmen, EinkommenHeute, Entnahmeplaner,
  PersonId, Versorgungsart, VertragsTyp, Auszahlungsstrategie, Teilzeitphase, GehaltsEingabe,
} from './model.js';
