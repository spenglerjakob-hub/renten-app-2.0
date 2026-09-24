// Rechtsstand
export * from './params/types.js';
export { PARAMETER_2024, PARAMETER_2025, PARAMETER_2026, BELEGTE_JAHRE, BASISJAHR } from './params/jahre.js';
export {
  parameterFuer, rechtsstandInfo, durchschnittlicherZusatzbeitrag,
  type Fortschreibung, type RechtsstandInfo,
} from './params/registry.js';

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
  mindestbemessungMonat, kinderImJahr,
  type KvStatus, type BeitragsArt, type Beitragspflichtig, type KinderStatus, type KvPvErgebnis,
} from './social/kv-pv.js';
export {
  pkvImJahr, pkvVerlauf, arbeitgeberzuschuss, betVergleich, betNetto,
  PKV_VORGABE, PKV_BASISANTEIL, ZUSCHLAG_QUOTE, ZUSCHLAG_BIS_ALTER, DAEMPFUNG_AB_ALTER,
  type PkvAnnahmen, type BetAnnahmen, type PkvJahr, type BetVergleich,
  type BetNetto, type BetNettoSaetze,
} from './social/pkv.js';

// Erwerbsphase
export {
  bruttoZuNetto, nettoZuBrutto, erwerbHaushalt,
  type ErwerbsNetto, type ErwerbsOptionen, type HaushaltsPerson, type ErwerbHaushaltErgebnis,
} from './erwerb/netto.js';
export {
  erwerbsBasisHeute, personenHeute, kvJePersonHeute, einkommenJePersonHeute,
  bruttoAusEinkommen,
  type ErwerbsBasisHeute, type ErwerbsPersonHeute, type PersonHeute, type KvHeute,
} from './erwerb/heute.js';

// Altersversorgung
export {
  versorgungsfreibetrag, rentenfreibetrag, besteuerungsanteilRente,
  altersentlastungsbetrag, ertragsanteil, type EingefrorenerFreibetrag,
} from './pension/freibetraege.js';
export {
  regelaltersgrenze, regelaltersrentenbeginn, zugangsfaktor, renteAusEntgeltpunkten, entgeltpunkteJahr,
  schaetzeEntgeltpunkte, grvVollerBeitragJahr, entgeltpunkteAusBeitrag,
  type KarriereSchaetzung,
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
  versorgungsluecke, benoetigtesKapital, benoetigteSparrate, sparrateZuRente,
  type Sparziel,
} from './analyse/sparziel.js';
export { jePerson, type PersonenBlock } from './analyse/je-person.js';
export { nurPerson } from './analyse/allein.js';
export {
  kvProfil, kvProfilVon, irgendwerPrivat, type KvProfil,
} from './social/kv-profil.js';
export {
  vertragsTuev, renteOderKapital, svWirkung, SV_FREI_QUOTE, STEUER_FREI_QUOTE,
  type TuevAnnahmen, type TuevBeitragsstufe, type TuevKontext, type TuevErgebnis, type RenteOderKapital,
  type SvKontext, type SvWirkung,
} from './analyse/vertrags-tuev.js';
export {
  foerdercheck, basisrahmenJahr, BAV_AG_PFLICHTZUSCHUSS,
  type FoerderKontext, type FoerderBefund,
} from './analyse/foerdercheck.js';

// Projektion
export {
  projiziere, istKapitalauszahlung, kenntKapitalwahl, kapitalBetrag,
  type Jahreszeile, type JahresPosten, type ProjektionsErgebnis, type PlanerErgebnis,
  type AvdLauf, type KapitalVerrentung,
} from './projection/timeline.js';

// Datum
export {
  parseDatum, toIso, toDe, jahreZwischen, alterAm, alterExakt, heute, datumPlus, jahresanteilAb,
  type Datum,
} from './util/datum.js';

/*
  Das Betragsformat der Hinweistexte. Exportiert, weil auch die Oberflaeche
  Saetze baut, die eine Zahl im Text tragen (die Erklaerungen am Vertrags-TUEV)
  — mit einem zweiten Formatierer stuenden dort andere Betraege als in den
  Hinweisen, die derselbe Bildschirm daneben zeigt.
*/
export { euroText } from './util/text.js';

// Modell
export type {
  Szenario, Person, Vertrag, Haushalt, Annahmen, EinkommenHeute, Entnahmeplaner,
  PersonId, Versorgungsart, VertragsTyp, Auszahlungsstrategie, Teilzeitphase, GehaltsEingabe,
} from './model.js';
