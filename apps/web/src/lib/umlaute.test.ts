import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * WAECHTER FUER UMLAUTE. Kommentare stehen in diesem Projekt ohne Umlaute —
 * Texte, die jemand liest, nicht. Die Gewohnheit rutscht leicht in eine
 * Zeichenkette: „Ueber die gesamte Laufzeit …“ stand so im gedruckten
 * Vertrags-TUEV, die Erklaerung zum Rechtsstand im Gutachten ganz ohne
 * Umlaute. Dieser Test liest alle Texte der drei Pakete (Zeichenketten,
 * Vorlagen, JSX-Text) und die HTML-Seiten und meldet Woerter, die nach
 * Umschreibung aussehen: ae/oe/ue statt ä/ö/ü, ss statt ß.
 *
 * Geprueft werden nur SAETZE (mindestens zwei Woerter) — Bezeichner,
 * Schluessel und Klassen bleiben, wie sie sind. Nicht geprueft: Kommentare,
 * Importe, Klassenlisten, Meldungen an die Konsole und Texte, mit denen der
 * Code fremde Meldungen vergleicht (`.includes('hoechstens 500')` passt auf
 * den Wortlaut der Datenbank).
 *
 * Schlaegt der Test bei einem richtigen Wort an (ein Name, ein Fremdwort),
 * gehoert es in ERLAUBT — mit dem Grund.
 */

const WURZEL = fileURLToPath(new URL('../../../../', import.meta.url));
const ORDNER = ['packages/engine/src', 'packages/schema/src', 'apps/web/src'];

/** Mit Absicht ohne Umlaute — der ganze Text, wie er im Code steht. */
const AUSNAHMEN: readonly string[] = [
  // Dateiname der CSV-Datei: ohne Umlaute, damit jedes System ihn annimmt
  'bAV-Uebersicht-',
  // Text einer E-Mail im mailto-Link: nur ASCII, sonst zerlegen manche Mailprogramme die Umlaute
  'Mit freundlichen Gruessen',
];

/** Richtige Woerter, die wie eine Umschreibung aussehen. */
const ERLAUBT = /^(segoe|israel|michaela?|raphael|goethe|oboe|aloe)$/;

/** ß-Woerter, die oft mit ss geschrieben werden. */
const SS = /^(ausser\w*|aussen\w*|draussen|gross(e[rnms]?)?|groess\w+|\w*strasse\w*|\w*fuss(es|e|note\w*)?|gemaess|\w*maessig\w*|massgeb\w+|massnahm\w+|massstab\w*|\w*schliess\w+|\w*heiss\w*|weiss(t|e[rnms]?)?|\w*stoss\w*|\w*giess\w+|\w*fliess\w+|\w*geniess\w+|\w*gruess\w+|gruss|spass|suess\w*|bloss|aeusser\w*)$/;

/** Vorsilben auf -o und -a, nach denen ein e zum naechsten Wortteil gehoert: Brutto|einkommen, Extra|einkommen. */
const VOR_OE = /(brutto|netto|konto|euro|auto|foto|info|video|risiko|saldo|giro|kilo|mikro|makro|bio|geo|neo|büro|pro)$/;
const VOR_AE = /(extra|kamera|firma|thema|schema|prima|agenda|meta|data)$/;

/** Sieht das Wort nach Umschreibung aus? */
export function umschrieben(wortRoh: string): boolean {
  // Abkuerzungen und Namen in Grossbuchstaben (E.C.A. LEUE) sind keine Umschreibung
  if (wortRoh.length < 4 || wortRoh === wortRoh.toUpperCase()) return false;
  const w = wortRoh.toLowerCase();
  if (ERLAUBT.test(w)) return false;
  if (SS.test(w)) return true;
  for (let i = w.indexOf('e', 1); i > 0; i = w.indexOf('e', i + 1)) {
    const davor = w[i - 1];
    if (davor !== 'a' && davor !== 'o' && davor !== 'u') continue;
    const vorher = w.slice(0, i);
    const danach = w.slice(i + 1);
    if (davor === 'u') {
      const zwei = w[i - 2];
      // Quelle, bequem, Frequenz · neue, Steuer, freuen · genaue, Dauer, bauen
      if (zwei === 'q' || zwei === 'e' || zwei === 'a') continue;
      // aktuell, manuell · kongruent, Influenz · Duett, Statuen, Individuen · true, value, Statue
      if (danach.startsWith('ll') || /^n[tz]/.test(danach) || danach.startsWith('tt') || danach === '' || danach === 'n') continue;
      // zuerst, zueinander, hinzuerwerben
      if (/(^|hin)zu$/.test(vorher) && /^(rst|inander|r[kw]|ig)/.test(danach)) continue;
      return true;
    }
    if (davor === 'o') {
      if (VOR_OE.test(vorher)) continue;
      // soeben, Koeffizient, Koexistenz, Poesie, Poet
      if (/^(so|ko|po)$/.test(vorher) && /^(ben|ff|xist|sie|t)/.test(danach)) continue;
      return true;
    }
    // davor === 'a'
    if (VOR_AE.test(vorher) || /^(a|m)$/.test(vorher) && /^(ro|stro)/.test(danach)) continue; // Aerosol, Maestro
    return true;
  }
  return false;
}

function* dateien(ordner: string): Generator<string> {
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) {
      if (name !== 'legacy' && name !== 'node_modules' && name !== 'dist') yield* dateien(pfad);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      yield pfad;
    }
  }
}

/** Attribute, deren Wert kein Text ist. */
const KEIN_TEXT = new Set(['className', 'class', 'd', 'viewBox', 'href', 'src', 'type', 'name', 'id', 'htmlFor', 'key', 'role', 'autoComplete', 'inputMode', 'style']);
/** Aufrufe, deren Zeichenketten niemand liest: Protokoll, Vergleich mit fremdem Wortlaut. */
const VERGLEICH = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'test', 'replace', 'split']);

interface Text { datei: string; zeile: number; text: string }

function texteVon(datei: string): Text[] {
  const quelle = readFileSync(datei, 'utf8');
  const sf = ts.createSourceFile(datei, quelle, ts.ScriptTarget.Latest, true, datei.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const texte: Text[] = [];
  const merke = (n: ts.Node, text: string) => texte.push({
    datei: datei.slice(WURZEL.length), zeile: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text,
  });
  const besuche = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n)) return;
    if (ts.isJsxAttribute(n) && KEIN_TEXT.has(n.name.getText(sf))) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const ziel = n.expression.expression.getText(sf);
      if (ziel === 'console' || VERGLEICH.has(n.expression.name.text)) { besuche(n.expression); return; }
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) merke(n, n.text);
    // Die Vorlage als Ganzes: „Höchstens ${max}“ ist ein Satz, auch wenn nur ein Wort feststeht
    else if (ts.isTemplateExpression(n)) merke(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … '));
    else if (ts.isJsxText(n)) merke(n, n.text);
    ts.forEachChild(n, besuche);
  };
  besuche(sf);
  return texte;
}

/** Sichtbarer Text einer HTML-Seite: Titel, Beschreibung, Inhalt — ohne Skripte, Stile und Kommentare. */
function texteAusHtml(datei: string): Text[] {
  const roh = readFileSync(datei, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ');
  const attribute = [...roh.matchAll(/\b(?:content|alt|title|placeholder|aria-label)="([^"]*)"/g)].map((m) => m[1] ?? '');
  const inhalt = roh.replace(/<[^>]+>/g, ' ');
  return [...attribute, inhalt].map((text) => ({ datei: datei.slice(WURZEL.length), zeile: 1, text }));
}

const WORT = /[A-Za-zÄÖÜäöüß]+/g;
/** Ein Satz: mindestens zwei Woerter mit Leerraum dazwischen. */
const SATZ = /[A-Za-zÄÖÜäöüß…]{2,}\s+[A-Za-zÄÖÜäöüß…]{1,}|…\s+[A-Za-zÄÖÜäöüß]{2,}|[A-Za-zÄÖÜäöüß]{2,}\s+…/;

/** Die Woerter eines Textes, die nach Umschreibung aussehen. */
export function funde(text: string): string[] {
  if (!SATZ.test(text) || AUSNAHMEN.some((a) => text.includes(a))) return [];
  const treffer: string[] = [];
  for (const stueck of text.split(/\s+/)) {
    // Bezeichner, Schluessel, Pfade, Klassen und CSS: schluessel.mit.punkten, spalte_name, text-ui-tinte, .fuss{…}
    if (/[_$={}<>\\/@#;:]/.test(stueck) || /^\./.test(stueck) || /[a-z0-9]\.[a-z]/i.test(stueck)) continue;
    if (stueck.includes('-') && stueck === stueck.toLowerCase() && !/-$/.test(stueck)) continue;
    for (const wort of stueck.match(WORT) ?? []) if (umschrieben(wort)) treffer.push(wort);
  }
  return treffer;
}

describe('Texte mit Umlauten', () => {
  it('erkennt Umschreibungen, lässt richtige Wörter stehen', () => {
    for (const w of ['Ueber', 'fuer', 'Beruecksichtigung', 'zurueckgeflossen', 'Naeherung', 'gueltiges', 'enthaelt', 'Betraege',
      'aendern', 'wuerde', 'Hoechstens', 'einschliesslich', 'Massgeblich', 'aussergewoehnliche', 'regelmaessig', 'waechst',
      'Bezugsgroesse', 'koennen', 'moeglich', 'Loesung', 'Fuenftelregelung', 'Unterstuetzungskasse', 'persoenlichem', 'Gruessen']) {
      expect(umschrieben(w), w).toBe(true);
    }
    for (const w of ['Steuer', 'Steuererklärung', 'neue', 'neuer', 'aktuell', 'aktuelle', 'Quelle', 'bequem', 'Dauer', 'genaue', 'bauen',
      'freuen', 'Frauen', 'teuer', 'Treue', 'zuerst', 'manuell', 'individuell', 'Kongruent', 'Frequenz', 'Statue', 'Bruttoeinkommen',
      'Nettoeinkommen', 'soeben', 'Koeffizient', 'Poesie', 'Preisseite', 'Preissteigerung', 'Geschäftssteuerung', 'dass', 'muss',
      'Adresse', 'Zuschuss', 'lässt', 'groß', 'Maßnahme', 'LEUE', 'Segoe', 'Israel', 'Michael', 'true', 'value']) {
      expect(umschrieben(w), w).toBe(false);
    }
  });

  it('prüft Sätze, keine Bezeichner', () => {
    expect(funde('Die Datei enthaelt kein gueltiges JSON.')).toEqual(['enthaelt', 'gueltiges']);
    expect(funde('Hoechstens … ')).toEqual(['Hoechstens']);
    expect(funde('selbststaendig')).toEqual([]);
    expect(funde('code, erstellt_am, gueltig_bis, fehlversuche')).toEqual([]);
    expect(funde('min-h-screen bg-ui-flaeche text-ui-tinte')).toEqual([]);
    expect(funde('rentenplaner.band.kuendigung. … ')).toEqual([]);
    expect(funde('Mit freundlichen Gruessen')).toEqual([]);
  });

  it('kein Text der App schreibt ae, oe, ue oder ss statt Umlaut und ß', () => {
    const texte = [
      ...ORDNER.flatMap((o) => [...dateien(join(WURZEL, o))].flatMap(texteVon)),
      ...readdirSync(join(WURZEL, 'apps/web')).filter((n) => n.endsWith('.html')).flatMap((n) => texteAusHtml(join(WURZEL, 'apps/web', n))),
    ];
    // Der Test soll nicht still an leerem Stoff bestehen
    expect(texte.length).toBeGreaterThan(5000);
    const auffaellig = texte.flatMap((t) => {
      const w = funde(t.text);
      return w.length ? [`${t.datei}:${t.zeile}  ${[...new Set(w)].join(', ')}  «${t.text.trim().replace(/\s+/g, ' ').slice(0, 80)}»`] : [];
    });
    expect(auffaellig).toEqual([]);
  }, 30000);
});
