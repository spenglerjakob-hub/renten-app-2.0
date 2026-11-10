/**
 * KATALOG DER RECHENGROESSEN — was sich zum Jahreswechsel aendert und wo es steht.
 *
 * Drei Teile:
 *   GRUPPEN            wer die Werte festsetzt und wann sie erscheinen
 *   PARAMETER_KATALOG  jedes Feld des Rechtsstands (LegalParameters) mit Rhythmus
 *   FUNDSTELLEN        Werte AUSSERHALB von params/jahre.ts, die von Hand
 *                      gepflegt werden muessen (Listen, Texte, Vorgaben, Tabellen)
 *
 * Kommt ein neues Feld in LegalParameters hinzu, meldet der Scanner es als
 * „ohne Katalogeintrag" — dann hier ergaenzen. Ebenso neue Fundstellen.
 *
 * Rhythmus:
 *   jaehrlich    aendert sich praktisch jedes Jahr. Gleicher Wert wie im
 *                Vorjahr ist verdaechtig und wird gemeldet.
 *   bestaetigen  wird jedes Jahr festgesetzt, bleibt aber oft gleich.
 *   gesetz       aendert sich nur durch eine Gesetzesaenderung.
 */

export const GRUPPEN = {
  sv: {
    titel: 'Sozialversicherungs-Rechengrößen',
    wer: 'BMAS: Sozialversicherungs-Rechengrößenverordnung',
    wann: 'Entwurf September/Oktober, Kabinett Oktober, Bundesrat November',
  },
  zusatz: {
    titel: 'Zusatzbeitrag der Krankenkassen',
    wer: 'BMG: durchschnittlicher Zusatzbeitrag (§ 242a SGB V, Bundesanzeiger); die einzelnen Kassen: GKV-Spitzenverband',
    wann: 'Durchschnitt bis 1. November, Kassen bis Ende Dezember (einzelne auch unterjährig)',
  },
  tarif: {
    titel: 'Einkommensteuertarif und Solidaritätszuschlag',
    wer: 'Gesetzgeber: § 32a EStG, § 3 SolZG (Existenzminimum- und Progressionsbericht)',
    wann: 'Gesetz meist November/Dezember, oft schon im Vorjahr für zwei Jahre beschlossen',
  },
  pap: {
    titel: 'Lohnsteuer nach Steuerklasse',
    wer: 'BMF: Programmablaufplan (PAP) für die maschinelle Lohnsteuer, Werte W1STKL5 bis W3STKL5',
    wann: 'November; gelegentlich geänderter PAP im Januar',
  },
  satz: {
    titel: 'Beitragssätze der Sozialversicherung',
    wer: 'RV: Beitragssatzverordnung (BMAS); KV § 241 SGB V; PV § 55 SGB XI; AV § 341 SGB III',
    wann: 'Herbst, nur wenn geändert',
  },
  rente: {
    titel: 'Aktueller Rentenwert',
    wer: 'BMAS: Rentenwertbestimmungsverordnung',
    wann: 'Frühjahr; gilt ab 1. Juli (im Rechtsstand steht der Wert ab Juli des Jahres)',
  },
  basiszins: {
    titel: 'Basiszins der Vorabpauschale',
    wer: 'BMF-Schreiben (§ 18 Abs. 4 InvStG, § 203 Abs. 2 BewG)',
    wann: 'Anfang Januar des Jahres',
  },
  fest: {
    titel: 'Pauschbeträge, feste Steuersätze und Entlastungsbeträge',
    wer: 'Gesetzgeber: EStG',
    wann: 'nur bei Gesetzesänderung (Jahressteuergesetz, Steuerentlastungsgesetze)',
  },
  foerder: {
    titel: 'Riester und Altersvorsorgedepot',
    wer: 'Gesetzgeber: §§ 10a, 79 ff. EStG, Altersvorsorgedepot (Gesetz vom 08.05.2026)',
    wann: 'nur bei Gesetzesänderung',
  },
  besoldung: {
    titel: 'Beamtenbesoldung',
    wer: 'Besoldungsanpassungsgesetze von Bund und Ländern',
    wann: 'Termine verschieden, oft unterjährig',
  },
  arbeitgeber: {
    titel: 'Umlagen, Sachbezüge und Tarife der Arbeitgeberseiten',
    wer: 'U1/U2: jede Krankenkasse; Insolvenzgeldumlage: BMAS-Verordnung; Sachbezug § 8 EStG; bKV-Tarife: Versicherer',
    wann: 'Umlagen zum 1. Januar; Tarife jederzeit',
  },
  annahme: {
    titel: 'Vorgaben und Annahmen (keine Rechengrößen)',
    wer: 'eigene Festlegung',
    wann: 'einmal im Jahr überdenken, keine Pflicht',
  },
};

/** einheit: euro | euro2 (mit Cent) | prozent | zahl */
export const PARAMETER_KATALOG = {
  'est.grundfreibetrag': { gruppe: 'tarif', rhythmus: 'jaehrlich', text: 'Grundfreibetrag', einheit: 'euro' },
  'est.zone2Ende': { gruppe: 'tarif', rhythmus: 'jaehrlich', text: 'Ende 1. Progressionszone', einheit: 'euro' },
  'est.zone3Ende': { gruppe: 'tarif', rhythmus: 'jaehrlich', text: 'Beginn 42 %', einheit: 'euro' },
  'est.zone4Ende': { gruppe: 'tarif', rhythmus: 'gesetz', text: 'Beginn 45 % („Reichensteuer“)', einheit: 'euro' },
  'soli.satz': { gruppe: 'tarif', rhythmus: 'gesetz', text: 'Soli-Satz', einheit: 'prozent' },
  'soli.freigrenze': { gruppe: 'tarif', rhythmus: 'jaehrlich', text: 'Soli-Freigrenze (Einkommensteuer, Grundtarif)', einheit: 'euro' },
  'soli.milderungszoneEnde': {
    gruppe: 'tarif', rhythmus: 'jaehrlich', text: 'Ende der Soli-Milderungszone', einheit: 'euro',
    hinweis: 'wird nicht gerechnet, nur mitgeführt; rechnerisch Freigrenze × 11,9 / 6,4',
  },
  'soli.milderungssatz': { gruppe: 'tarif', rhythmus: 'gesetz', text: 'Soli-Milderungssatz', einheit: 'prozent' },

  'kv.allgemeinerSatz': { gruppe: 'satz', rhythmus: 'gesetz', text: 'KV allgemeiner Beitragssatz', einheit: 'prozent' },
  'kv.zusatzbeitrag': { gruppe: 'zusatz', rhythmus: 'jaehrlich', text: 'durchschnittlicher Zusatzbeitrag', einheit: 'prozent' },
  'pv.satz': { gruppe: 'satz', rhythmus: 'bestaetigen', text: 'PV-Beitragssatz', einheit: 'prozent' },
  'pv.kinderloseZuschlag': { gruppe: 'satz', rhythmus: 'gesetz', text: 'PV-Zuschlag Kinderlose', einheit: 'prozent' },
  'pv.abschlagJeKind': { gruppe: 'satz', rhythmus: 'gesetz', text: 'PV-Abschlag je Kind (2. bis 5.)', einheit: 'prozent' },
  'pv.maxKinderAbschlaege': { gruppe: 'satz', rhythmus: 'gesetz', text: 'PV höchstens so viele Abschläge', einheit: 'zahl' },
  'pv.arbeitnehmerAnteilSachsenAufschlag': { gruppe: 'satz', rhythmus: 'gesetz', text: 'PV Sachsen: Mehranteil Arbeitnehmer', einheit: 'prozent' },
  rvSatzGesamt: { gruppe: 'satz', rhythmus: 'bestaetigen', text: 'RV-Beitragssatz', einheit: 'prozent' },
  avSatzGesamt: { gruppe: 'satz', rhythmus: 'bestaetigen', text: 'AV-Beitragssatz', einheit: 'prozent' },

  bbgKvJahr: { gruppe: 'sv', rhythmus: 'jaehrlich', text: 'Beitragsbemessungsgrenze KV/PV (Jahr)', einheit: 'euro' },
  bbgRvJahr: { gruppe: 'sv', rhythmus: 'jaehrlich', text: 'Beitragsbemessungsgrenze RV/AV (Jahr)', einheit: 'euro' },
  hoechstbetragAltersvorsorge: {
    gruppe: 'sv', rhythmus: 'jaehrlich', text: 'Höchstbetrag Altersvorsorgeaufwendungen § 10 Abs. 3 EStG', einheit: 'euro',
    hinweis: 'BBG knappschaftliche RV × 24,7 %, auf volle Euro aufgerundet',
  },
  bezugsgroesseMonat: { gruppe: 'sv', rhythmus: 'jaehrlich', text: 'Bezugsgröße (Monat)', einheit: 'euro' },
  durchschnittsentgelt: { gruppe: 'sv', rhythmus: 'jaehrlich', text: 'vorläufiges Durchschnittsentgelt (Anlage 1 SGB VI)', einheit: 'euro' },
  rentenwert: {
    gruppe: 'rente', rhythmus: 'jaehrlich', text: 'aktueller Rentenwert', einheit: 'euro2',
    hinweis: 'Wert ab 1. Juli; im Herbst noch unbekannt — dann Vorjahreswert, im Frühjahr nachtragen',
  },

  'pauschbetraege.arbeitnehmer': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Arbeitnehmer-Pauschbetrag', einheit: 'euro' },
  'pauschbetraege.versorgungsbezuege': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Werbungskosten Versorgungsbezüge', einheit: 'euro' },
  'pauschbetraege.renten': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Werbungskosten-Pauschbetrag Renten', einheit: 'euro' },
  'pauschbetraege.sonderausgaben': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Sonderausgaben-Pauschbetrag', einheit: 'euro' },
  'pauschbetraege.sparer': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Sparer-Pauschbetrag', einheit: 'euro' },
  'lohnsteuer.w1Stkl5': { gruppe: 'pap', rhythmus: 'jaehrlich', text: 'Steuerklasse V: W1STKL5', einheit: 'euro' },
  'lohnsteuer.w2Stkl5': { gruppe: 'pap', rhythmus: 'jaehrlich', text: 'Steuerklasse V: W2STKL5', einheit: 'euro' },
  'lohnsteuer.w3Stkl5': {
    gruppe: 'pap', rhythmus: 'gesetz', text: 'Steuerklasse V: W3STKL5', einheit: 'euro',
    hinweis: 'folgt dem Beginn des 45-%-Satzes (× 0,8)',
  },
  'lohnsteuer.entlastungAlleinerziehend': { gruppe: 'fest', rhythmus: 'gesetz', text: 'Entlastungsbetrag Alleinerziehende § 24b', einheit: 'euro' },
  abgeltungsteuersatz: { gruppe: 'fest', rhythmus: 'gesetz', text: 'Abgeltungsteuer', einheit: 'prozent' },
  basiszins: {
    gruppe: 'basiszins', rhythmus: 'jaehrlich', text: 'Basiszins Vorabpauschale', einheit: 'prozent',
    hinweis: 'erst im Januar bekannt — bis dahin Vorjahreswert',
  },

  'riester.grundzulage': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Grundzulage', einheit: 'euro' },
  'riester.kinderzulageAb2008': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Kinderzulage (ab 2008 geboren)', einheit: 'euro' },
  'riester.kinderzulageVor2008': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Kinderzulage (vor 2008 geboren)', einheit: 'euro' },
  'riester.hoechstbetrag': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Höchstbetrag § 10a', einheit: 'euro' },
  'riester.mindesteigenbeitragQuote': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Mindesteigenbeitrag (Anteil Vorjahresbrutto)', einheit: 'prozent' },
  'riester.sockelbetrag': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Riester-Sockelbetrag', einheit: 'euro' },
  'avd.abJahr': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'Altersvorsorgedepot ab', einheit: 'zahl' },
  'avd.mindesteigenbeitragJahr': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Mindesteigenbeitrag (Jahr)', einheit: 'euro' },
  'avd.stufe1Grenze': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Stufe 1 bis', einheit: 'euro' },
  'avd.stufe1Satz': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Stufe 1 Zulagensatz', einheit: 'prozent' },
  'avd.stufe2Grenze': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Stufe 2 bis', einheit: 'euro' },
  'avd.stufe2Satz': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Stufe 2 Zulagensatz', einheit: 'prozent' },
  'avd.kinderzulage': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Kinderzulage', einheit: 'euro' },
  'avd.kinderzulageBisAlter': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Kinderzulage bis Alter', einheit: 'zahl' },
  'avd.kinderzulageBisAlterAusbildung': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Kinderzulage bis Alter (Ausbildung)', einheit: 'zahl' },
  'avd.berufseinsteigerbonus': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Berufseinsteigerbonus', einheit: 'euro' },
  'avd.berufseinsteigerAlterMax': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Bonus bis Alter', einheit: 'zahl' },
  'avd.auszahlungAbAlter': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Auszahlung frühestens mit', einheit: 'zahl' },
  'avd.auszahlplanBisAlter': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Auszahlplan mindestens bis', einheit: 'zahl' },
  'avd.teilauszahlungMax': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Teilauszahlung höchstens', einheit: 'prozent' },
  'avd.hoechstbetragEigenbeitrag': { gruppe: 'foerder', rhythmus: 'gesetz', text: 'AVD Sonderausgaben-Höchstbetrag', einheit: 'euro' },
};

/**
 * Werte, die sich aus dem Rechtsstand ABLEITEN. Sie aendern sich automatisch
 * mit — der Bericht zeigt sie, damit Texte auffallen, die sie abschreiben
 * (z. B. „338 EUR“ fuer 4 % der Beitragsbemessungsgrenze im Monat).
 */
export const ABGELEITET = [
  { text: 'BBG RV im Monat', einheit: 'euro', wert: (p) => p.bbgRvJahr / 12 },
  { text: 'BBG KV im Monat', einheit: 'euro', wert: (p) => p.bbgKvJahr / 12 },
  { text: 'bAV beitragsfrei: 4 % BBG RV im Monat (§ 1 Abs. 1 Nr. 9 SvEV)', einheit: 'euro', wert: (p) => 0.04 * p.bbgRvJahr / 12 },
  { text: 'bAV beitragsfrei: 4 % BBG RV im Jahr', einheit: 'euro', wert: (p) => 0.04 * p.bbgRvJahr },
  { text: 'bAV steuerfrei: 8 % BBG RV im Monat (§ 3 Nr. 63 EStG)', einheit: 'euro', wert: (p) => 0.08 * p.bbgRvJahr / 12 },
  { text: 'bAV steuerfrei: 8 % BBG RV im Jahr', einheit: 'euro', wert: (p) => 0.08 * p.bbgRvJahr },
  { text: 'KV-Freibetrag Versorgungsbezüge: 1/20 Bezugsgröße (§ 226 Abs. 2 SGB V)', einheit: 'euro2', wert: (p) => p.bezugsgroesseMonat / 20 },
  { text: 'Mindestbemessung freiwillig Versicherte: 1/3 Bezugsgröße (§ 240 Abs. 4 SGB V)', einheit: 'euro2', wert: (p) => p.bezugsgroesseMonat / 3 },
  { text: 'Familienversicherung: 1/7 Bezugsgröße (§ 10 SGB V)', einheit: 'euro', wert: (p) => p.bezugsgroesseMonat / 7 },
  { text: 'KV-Satz voll (allgemein + Zusatzbeitrag)', einheit: 'prozent', wert: (p) => p.kv.allgemeinerSatz + p.kv.zusatzbeitrag },
  {
    text: 'PKV: höchster Arbeitgeberzuschuss im Monat',
    einheit: 'euro2',
    wert: (p) => (p.bbgKvJahr / 12) * (p.kv.allgemeinerSatz + p.kv.zusatzbeitrag + p.pv.satz) / 2,
  },
  { text: 'Höchstbetrag Altersvorsorge, zusammen veranlagt', einheit: 'euro', wert: (p) => p.hoechstbetragAltersvorsorge * 2 },
];

/**
 * FUNDSTELLEN AUSSERHALB DES RECHTSSTANDS.
 *
 *   datei   Pfad ab Repo-Wurzel
 *   muster  regulaerer Ausdruck; die erste Klammer ist der Wert, der im Bericht
 *           erscheint (ohne Klammer die ganze Fundstelle)
 *   soll    optional: Funktion (p, Z) -> Zahl. Dann vergleicht der Bericht
 *           den Wert der Fundstelle mit dem Rechtsstand des Zieljahres.
 *   wert    optional: wie der gefundene Text in eine Zahl umzurechnen ist
 *           (Vorgabe: deutsche Schreibweise, „1.000“ -> 1000, „2,9“ -> 2.9)
 *   jahr    true: die Fundstelle nennt ein Jahr; steht dort nicht das
 *           Zieljahr, wird sie als veraltet gemeldet.
 *   ganzeDatei  true: die Datei wird als Ganzes gepflegt (z. B. eine Liste);
 *           ihre Zeilen tauchen in den Suchen von Teil 5 und 6 nicht mehr auf.
 */
export const FUNDSTELLEN = [
  {
    gruppe: 'zusatz',
    datei: 'apps/web/src/features/krankenkassen.ts',
    muster: /KASSEN_STAND = '([^']+)'/,
    was: 'Zusatzbeiträge der einzelnen Kassen (Auswahlliste im Rechner)',
    aktion: 'Liste der Zusatzbeitragssätze des GKV-Spitzenverbands neu übertragen; KASSEN_STAND auf das neue Jahr; Kommentar mit Spanne und Durchschnitt anpassen',
    jahr: true,
    ganzeDatei: true,
  },
  {
    gruppe: 'zusatz',
    datei: 'packages/schema/src/bav-beratung.ts',
    muster: /zusatzbeitrag: z\.number\(\)[^\n]*\.default\(([0-9.]+)\)/,
    was: 'Vorgabe Zusatzbeitrag in der Mitarbeiterberatung',
    aktion: 'auf den neuen Durchschnitt setzen (wirkt nur für neue Angaben; gespeicherte Beratungen behalten ihren Satz)',
    wert: (s) => Number(s),
    soll: (p) => p.kv.zusatzbeitrag,
    einheit: 'prozent',
  },
  {
    gruppe: 'zusatz',
    datei: 'apps/web/src/check/uebernahme.ts',
    muster: /zusatzbeitrag: ([0-9.]+),/,
    was: 'Vorgabe Zusatzbeitrag im Vorsorge-Check (leere Antworten, Person A und B)',
    aktion: 'auf den neuen Durchschnitt setzen — oder gleich aus durchschnittlicherZusatzbeitrag() lesen',
    wert: (s) => Number(s),
    soll: (p) => p.kv.zusatzbeitrag,
    einheit: 'prozent',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'apps/web/src/arbeitgeber/bausteine.tsx',
    muster: /derzeit <strong>([0-9,]+ %)<\/strong>/,
    was: 'Insolvenzgeldumlage im Erklärtext der Arbeitgeberseiten',
    aktion: 'Satz der Insolvenzgeldumlagesatzverordnung für das neue Jahr eintragen',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'apps/web/src/arbeitgeber/bausteine.tsx',
    muster: /meist etwa <strong>([0-9,]+ bis [0-9,]+ %)<\/strong>/,
    was: 'Spanne der Umlage U1 (Krankenkassen) im Erklärtext',
    aktion: 'Spanne grob bestätigen; die Knöpfe 2,5 % / 0,6 % sind Faustwerte',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'apps/web/src/arbeitgeber/bausteine.tsx',
    muster: /Meist etwa <strong>([0-9,]+ bis [0-9,]+ %)<\/strong>/,
    was: 'Spanne der Umlage U2 (Krankenkassen) im Erklärtext',
    aktion: 'Spanne grob bestätigen',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'apps/web/src/bkv/Seite.tsx',
    muster: /Stand (\d{2}\/\d{4})/,
    was: 'Beispielbeiträge des bKV-Budgettarifs (Knöpfe auf der bKV-Seite)',
    aktion: 'Beiträge beim Versicherer prüfen, „Stand MM/JJJJ“ in Kommentar und Text anpassen',
    jahr: true,
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'packages/engine/src/analyse/bkv.ts',
    muster: /SACHBEZUG_FREIGRENZE_MONAT = (\d+)/,
    was: 'Sachbezugsfreigrenze § 8 Abs. 2 S. 11 EStG (Monat)',
    aktion: 'nur bei Gesetzesänderung; dann auch die Texte „50 €“ der bKV-Seite',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'packages/engine/src/analyse/bkv.ts',
    muster: /PAUSCHAL_40_GRENZE_JAHR = (\d+)/,
    was: 'Grenze § 40 Abs. 1 S. 3 EStG (Jahr)',
    aktion: 'nur bei Gesetzesänderung; Text „1.000 € je Mitarbeiter und Jahr“ der bKV-Seite',
  },
  {
    gruppe: 'arbeitgeber',
    datei: 'apps/web/src/bkv/Seite.tsx',
    muster: /höchstens ([0-9.]+ €) je Empfänger und Jahr/,
    was: 'Höchstbetrag § 37b EStG im Text der bKV-Seite',
    aktion: 'nur bei Gesetzesänderung',
  },
  {
    gruppe: 'besoldung',
    datei: 'packages/engine/src/pension/besoldung-daten.ts',
    muster: /\{ land: 'Bund', jahr: (\d{4}), gruppe: 'A13', stufe: 1/,
    was: 'Besoldung: belegte Eckwerte (A13 Bund); sonst rechnet der Kern mit einer Näherung',
    aktion: 'nach einer Besoldungsanpassung Eckwerte prüfen; amtliche Tabellen in BELEGTE_TABELLEN eintragen',
    jahr: true,
  },
  {
    gruppe: 'fest',
    datei: 'apps/web/src/druck/Merkblatt.tsx',
    muster: /'([0-9.]+) € je Person im Jahr bleiben steuerfrei/,
    was: 'Sparer-Pauschbetrag im Merkblatt des Gutachtens',
    soll: (p) => p.pauschbetraege.sparer,
    einheit: 'euro',
  },
  {
    gruppe: 'fest',
    datei: 'apps/web/src/avd/Seite.tsx',
    muster: /Werbungskosten-Pauschbetrag von (\d+) €/,
    was: 'Werbungskosten-Pauschbetrag Renten im Text der Depot-Seite',
    soll: (p) => p.pauschbetraege.renten,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/avd/Seite.tsx',
    muster: /Ab (\d+) € im Monat gibt es Zulagen/,
    was: 'Depot-Seite: Mindestbeitrag im Monat',
    soll: (p) => p.avd.mindesteigenbeitragJahr / 12,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/avd/Seite.tsx',
    muster: /ab (\d+) € die volle Grundzulage/,
    was: 'Depot-Seite: Beitrag für die volle Grundzulage',
    soll: (p) => p.avd.stufe2Grenze / 12,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/features/Vertraege.tsx',
    muster: /Ab (\d+) € im Jahr \(\d+ € im Monat\) gibt es Zulagen/,
    was: 'Rechner, Vertrag Altersvorsorgedepot: Mindestbeitrag im Jahr',
    soll: (p) => p.avd.mindesteigenbeitragJahr,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/features/Vertraege.tsx',
    muster: /ab (\d+) € im Monat die volle Grundzulage/,
    was: 'Rechner, Vertrag Altersvorsorgedepot: Beitrag für die volle Grundzulage',
    soll: (p) => p.avd.stufe2Grenze / 12,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/features/Vertraege.tsx',
    muster: /höchstens (\d+) € im Jahr\./,
    was: 'Rechner, Vertrag Altersvorsorgedepot: Kinderzulage',
    soll: (p) => p.avd.kinderzulage,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/features/VertragsTuev.tsx',
    muster: /\? '(\d+) €' : '\d+ €'/,
    was: 'Vertrags-TÜV: Riester-Kinderzulage (ab 2008 geboren)',
    soll: (p) => p.riester.kinderzulageAb2008,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'apps/web/src/features/VertragsTuev.tsx',
    muster: /\? '\d+ €' : '(\d+) €'/,
    was: 'Vertrags-TÜV: Riester-Kinderzulage (vor 2008 geboren)',
    soll: (p) => p.riester.kinderzulageVor2008,
    einheit: 'euro',
  },
  {
    gruppe: 'foerder',
    datei: 'packages/engine/src/analyse/vertrags-tuev.ts',
    muster: /Sockelbetrag von (\d+) € im Jahr/,
    was: 'Vertrags-TÜV: Riester-Sockelbetrag im Hinweistext',
    soll: (p) => p.riester.sockelbetrag,
    einheit: 'euro',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/tax/estg.ts',
    muster: /'Baden-Württemberg' \? ([0-9.]+) : ([0-9.]+)/,
    was: 'Kirchensteuersatz (8 % in Bayern und Baden-Württemberg, sonst 9 %)',
    aktion: 'nur bei Änderung des Landesrechts',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/pension/freibetraege.ts',
    muster: /(rentenbeginnJahr - 2022\) \* 0\.005)/,
    was: 'Besteuerungsanteil, Versorgungsfreibetrag, Altersentlastungsbetrag (Abschmelzpfade als Formel)',
    aktion: 'nur bei Gesetzesänderung (zuletzt Wachstumschancengesetz 2024)',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/analyse/matching-modell.ts',
    muster: /BAV_PFLICHTZUSCHUSS_QUOTE = ([0-9.]+)/,
    was: 'Pflichtzuschuss des Arbeitgebers § 1a Abs. 1a BetrAVG',
    aktion: 'nur bei Gesetzesänderung',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/analyse/vertrags-tuev.ts',
    muster: /SV_FREI_QUOTE = ([0-9.]+)/,
    was: 'bAV beitragsfrei bis 4 % der BBG RV (Anteil)',
    aktion: 'nur bei Gesetzesänderung',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/analyse/vertrags-tuev.ts',
    muster: /STEUER_FREI_QUOTE = ([0-9.]+)/,
    was: 'bAV steuerfrei bis 8 % der BBG RV (Anteil)',
    aktion: 'nur bei Gesetzesänderung',
  },
  {
    gruppe: 'fest',
    datei: 'packages/engine/src/pension/beamte.ts',
    muster: /RUHEGEHALT_PRO_JAHR = ([0-9.]+)/,
    was: 'Ruhegehalt je Dienstjahr (§ 14 BeamtVG); Höchstsatz 71,75 %',
    aktion: 'nur bei Gesetzesänderung',
  },
  {
    gruppe: 'annahme',
    datei: 'apps/web/src/store/standard.ts',
    muster: /(inflation: [0-9.]+, rentendynamik: [0-9.]+, tarifIndex: [0-9.]+)/,
    was: 'Vorgaben für neue Fälle: Inflation, Rentenanpassung, Fortschreibung des Tarifs',
    aktion: 'keine Pflicht — einmal im Jahr überdenken (Renteninformation, Rentenversicherungsbericht)',
  },
];

/**
 * Wo die App das laufende Jahr zieht. Liegt fuer dieses Jahr kein belegter
 * Rechtsstand vor, rechnet sie mit einer Fortschreibung — und beschriftet
 * das Ergebnis trotzdem mit dem neuen Jahr.
 */
export const LAUFENDES_JAHR = [
  /parameterFuer\(\s*new Date\(\)\.getFullYear\(\)/,
  /parameterFuer\(\s*(jetzt|JETZT|jahr)\s*,/,
  /parameterFuer\(\s*Math\.max\(\s*(jetzt|JETZT)/,
];

/** Texte, die das Jahr des Rechtsstands nennen */
export const JAHR_IM_TEXT = /Rechtsstand \{(p|P|basis\.p)\.jahr\}/;

/** Wonach in Texten gesucht wird, um neue, noch nicht katalogisierte Fundstellen zu finden */
export const STICHWOERTER = /Beitragsbemessungsgrenze|\bBBG\b|Bezugsgr(ö|oe)(ß|ss)e|Grundfreibetrag|Freigrenze|Freibetrag|Pauschbetrag|Zusatzbeitrag|Rentenwert|Durchschnittsentgelt|H(ö|oe)chstbetrag|Mindestbeitrag|Umlage|Sachbezug|Basiszins|Kindergeld|Kinderfreibetrag|Mindestlohn|Minijob|Midijob|Insolvenzgeld|Beitragssatz|Zulage/i;

/**
 * Zeilen, die die Stichwort- oder Jahreszahlsuche treffen, aber geprueft und
 * unbedenklich sind. Jede mit Grund — sonst waechst die Liste unbemerkt.
 */
export const UNBEDENKLICH = [
  {
    muster: /Math\.max\([^)]*\b2027\)|AVD_AB_JAHR = 2027/,
    grund: 'Startjahr des Altersvorsorgedepots (avd.abJahr) als Untergrenze — bleibt richtig',
  },
  {
    muster: /Fassung vom|NUTZUNGSBEDINGUNGEN_FASSUNG/,
    grund: 'Fassung der Rechtstexte, keine Rechengröße',
  },
  {
    muster: /\b[48] % der (jeweiligen )?Beitragsbemessungsgrenze/,
    grund: '4 % und 8 % der BBG sind gesetzliche Quoten (SV_FREI_QUOTE, STEUER_FREI_QUOTE); der Euro-Betrag wird gerechnet',
  },
  {
    muster: /Grundzulage Stufe [12] — \d+ %/,
    grund: 'Zulagensätze des Altersvorsorgedepots; die Beträge kommen aus dem Rechtsstand',
  },
  {
    datei: /mitarbeiter\/axa-antrag\.tsx$/,
    grund: 'Wortlaut des Versicherer-Formulars, bleibt wie gedruckt',
  },
  {
    datei: /(apps\/web\/src\/bkv\/|analyse\/bkv\.ts$)/,
    muster: /\b50 €/,
    grund: 'Sachbezugsfreigrenze — hängt an SACHBEZUG_FREIGRENZE_MONAT (Teil 3)',
  },
];
