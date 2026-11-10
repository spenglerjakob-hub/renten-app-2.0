#!/usr/bin/env node
/**
 * JAHRESWECHSEL-SCANNER: Welche Rechengroessen aendern sich zum Jahreswechsel,
 * und wo stehen sie im Code?
 *
 *   node .claude/skills/jahreswechsel/scripts/rechengroessen.mjs [--jahr 2027] [--aus bericht.md] [--probelauf]
 *
 *   --jahr       Zieljahr (Vorgabe: naechstes Kalenderjahr)
 *   --aus        Bericht zusaetzlich in diese Datei schreiben
 *   --probelauf  alle Tests mit einer Uhr im Januar des Zieljahres laufen lassen
 *
 * Liest den Rechtsstand aus dem GEBAUTEN Rechenkern (packages/engine/dist) und
 * baut ihn selbst, wenn die Quellen neuer sind. Aendert nichts am Code.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GRUPPEN, PARAMETER_KATALOG, ABGELEITET, FUNDSTELLEN, LAUFENDES_JAHR, JAHR_IM_TEXT, STICHWOERTER, UNBEDENKLICH,
} from './katalog.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '../../../..');

/* ------------------------------------------------------------------ Aufruf */

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--hilfe') || args.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(0);
}
const zielArg = option('--jahr');
const ausDatei = option('--aus');
const probelauf = args.includes('--probelauf');

/* ------------------------------------------------ Rechenkern laden (gebaut) */

const ENGINE = join(WURZEL, 'packages/engine');
const DIST = join(ENGINE, 'dist/index.js');

function neuesteQuelle(verz) {
  let max = 0;
  for (const e of readdirSync(verz, { withFileTypes: true })) {
    const p = join(verz, e.name);
    if (e.isDirectory()) max = Math.max(max, neuesteQuelle(p));
    else if (e.name.endsWith('.ts')) max = Math.max(max, statSync(p).mtimeMs);
  }
  return max;
}

if (!existsSync(DIST) || statSync(DIST).mtimeMs < neuesteQuelle(join(ENGINE, 'src'))) {
  process.stderr.write('Rechenkern nicht gebaut oder älter als die Quellen — baue packages/engine …\n');
  try {
    execSync('pnpm --filter @renten/engine build', { cwd: WURZEL, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    process.stderr.write('Bau fehlgeschlagen. Erst `pnpm install`, dann `pnpm --filter @renten/engine build`.\n');
    process.exit(1);
  }
}
const E = await import(pathToFileURL(DIST).href);

/* ------------------------------------------------------------- Formatieren */

const de = (v, stellen) => v.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const fastGanz = (v) => Math.abs(v - Math.round(v)) < 0.005;

function format(v, einheit) {
  if (typeof v !== 'number') return String(v);
  if (einheit === 'euro') return `${de(v, fastGanz(v) ? 0 : 2)} €`;
  if (einheit === 'euro2') return `${de(v, 2)} €`;
  if (einheit === 'prozent') return `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 3 })} %`;
  return String(v);
}

/** Alle Blaetter eines Parametersatzes als Pfad -> Wert */
function blaetter(obj, pfad = '') {
  const aus = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!pfad && (k === 'jahr' || k === 'extrapoliert' || k === 'quelle')) continue;
    const p = pfad ? `${pfad}.${k}` : k;
    if (v && typeof v === 'object') aus.push(...blaetter(v, p));
    else aus.push({ pfad: p, wert: v });
  }
  return aus;
}
const holen = (obj, pfad) => pfad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const gleich = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

/* ------------------------------------------------------------------- Jahre */

const belegte = E.BELEGTE_JAHRE.map((p) => p.jahr);
const B = E.BASISJAHR.jahr;
const Z = zielArg ? Number(zielArg) : new Date().getFullYear() + 1;
if (!Number.isInteger(Z) || Z < 2000 || Z > 2100) {
  console.error(`Zieljahr ungültig: ${zielArg}`);
  process.exit(1);
}
const zBelegt = belegte.includes(Z);
/* Verglichen wird das Zieljahr mit dem belegten Jahr davor — oder, solange
   es fehlt, der juengste Jahrgang mit seinem Vorgaenger. */
const NEU = zBelegt ? Z : B;
const ALT = belegte.filter((j) => j < NEU).at(-1) ?? null;
const pNeu = E.parameterFuer(NEU, { indexRate: 0 });
const pAlt = ALT ? E.parameterFuer(ALT, { indexRate: 0 }) : null;
const pZ = E.parameterFuer(Z, { indexRate: 0 });

/* --------------------------------------------------------- Dateien im Repo */

const dateien = execSync('git ls-files', { cwd: WURZEL, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|mjs|js|html|md|sql)$/.test(f))
  .filter((f) => /^(apps\/web\/src\/|apps\/web\/[^/]+\.html$|packages\/(engine|schema)\/(src|test)\/|supabase\/functions\/|README\.md$)/.test(f))
  .filter((f) => !f.startsWith('apps/web/src/legacy/'));
const QUELLE_RECHTSSTAND = 'packages/engine/src/params/jahre.ts';
const istTest = (f) => /\.test\.tsx?$/.test(f) || f.includes('/test/');

const inhalt = new Map();
const zeilenVon = (f) => {
  if (!inhalt.has(f)) {
    const text = readFileSync(join(WURZEL, f), 'utf8');
    const zeilen = text.split('\n');
    // Kommentarzeilen markieren (auch Bloecke ohne fuehrendes Sternchen)
    const kommentar = [];
    let imBlock = false;
    for (const z of zeilen) {
      const t = z.trim();
      const istK = imBlock || t.startsWith('//') || t.startsWith('/*') || t.startsWith('{/*') || t.startsWith('*') || t.startsWith('<!--');
      kommentar.push(istK);
      let rest = z;
      for (;;) {
        if (imBlock) {
          const ende = rest.indexOf('*/');
          if (ende < 0) break;
          imBlock = false;
          rest = rest.slice(ende + 2);
        } else {
          const ohneZeilenK = rest.replace(/\/\/.*$/, '');
          const anfang = ohneZeilenK.indexOf('/*');
          if (anfang < 0) break;
          imBlock = true;
          rest = ohneZeilenK.slice(anfang + 2);
        }
      }
    }
    inhalt.set(f, { text, zeilen, kommentar });
  }
  return inhalt.get(f);
};
const zeileVonIndex = (text, idx) => text.slice(0, idx).split('\n').length;
const auszug = (z, max = 110) => {
  const t = z.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/* ---------------------------------------------------------------- Bericht */

const out = [];
const z = (s = '') => out.push(s);
const befunde = { unveraendert: [], ohneKatalog: [], fundstelleAbweichung: [], fundstelleFehlt: [], veraltetJahr: [] };

z(`# Rechengrößen zum Jahreswechsel ${Z - 1} → ${Z}`);
z();
z(`Erstellt ${new Date().toLocaleDateString('de-DE')}. Belegte Rechtsstände: ${belegte.join(', ')} · Basisjahr der Fortschreibung: ${B} · Zieljahr: **${Z}** — ${zBelegt ? 'belegt.' : '**noch nicht angelegt.**'}`);
z();

// Grundgeruest des Rechtsstands
const juengster = Math.max(...belegte);
if (B !== juengster) z(`> **Fehler:** \`BASISJAHR\` zeigt auf ${B}, der jüngste Jahrgang ist ${juengster}. Fortgeschrieben wird immer vom Basisjahr aus.`);
const index = readFileSync(join(ENGINE, 'src/index.ts'), 'utf8');
for (const j of belegte) {
  if (!new RegExp(`PARAMETER_${j}\\b`).test(index)) {
    z(`> **Hinweis:** \`PARAMETER_${j}\` wird in packages/engine/src/index.ts nicht exportiert.`);
  }
}
if (!zBelegt) {
  z(`> Ohne Jahrgang ${Z} rechnet die App ab dem 1. Januar ${Z} mit einer **Fortschreibung von ${B}**. Seiten mit Index 0 % `
    + `(Arbeitgeberseiten, bKV, Mitarbeiterberatung) nehmen die Werte von ${B} unverändert, der Rechner schreibt Eurobeträge `
    + `mit dem eingestellten Index fort. Beschriftet wird trotzdem mit „Rechtsstand ${Z}“ (Teil 4).`);
}
z();

/* Teil 1 — Rechtsstand je Feld */

z(`## Teil 1 — Rechtsstand (packages/engine/src/params/jahre.ts), ${ALT ?? '—'} → ${NEU}`);
z();
const felder = blaetter(pNeu);
const nachGruppe = new Map();
for (const f of felder) {
  const k = PARAMETER_KATALOG[f.pfad];
  const g = k?.gruppe ?? '?';
  if (!nachGruppe.has(g)) nachGruppe.set(g, []);
  nachGruppe.get(g).push({ ...f, k });
}
for (const g of [...Object.keys(GRUPPEN), '?']) {
  const liste = nachGruppe.get(g);
  if (!liste) continue;
  const info = GRUPPEN[g];
  z(`### ${info ? info.titel : 'Ohne Katalogeintrag'}`);
  if (info) z(`Quelle: ${info.wer}. Erscheint: ${info.wann}.`);
  z();
  z(`| Feld | Bedeutung | ${ALT ?? '—'} | ${NEU} | Rhythmus | Befund |`);
  z('|---|---|---|---|---|---|');
  for (const f of liste) {
    const vorher = pAlt ? holen(pAlt, f.pfad) : undefined;
    const einheit = f.k?.einheit ?? 'zahl';
    const teile = [];
    if (!f.k) {
      teile.push('**ohne Katalogeintrag** — in katalog.mjs ergänzen');
      befunde.ohneKatalog.push(f.pfad);
    } else if (f.k.rhythmus === 'jaehrlich' && pAlt && gleich(vorher, f.wert)) {
      teile.push(`**unverändert seit ${ALT} — prüfen**`);
      befunde.unveraendert.push(`${f.pfad} (${format(f.wert, einheit)})`);
    }
    if (f.k?.hinweis) teile.push(f.k.hinweis);
    z(`| \`${f.pfad}\` | ${f.k?.text ?? ''} | ${vorher === undefined ? '—' : format(vorher, einheit)} | ${format(f.wert, einheit)} | ${f.k?.rhythmus ?? '?'} | ${teile.join('; ')} |`);
  }
  z();
}
for (const pfad of Object.keys(PARAMETER_KATALOG)) {
  if (!felder.some((f) => f.pfad === pfad)) z(`> Katalogeintrag \`${pfad}\` gibt es im Rechtsstand nicht mehr — aus katalog.mjs entfernen.`);
}

/* Teil 2 — abgeleitete Werte */

z(`## Teil 2 — Abgeleitete Werte (ändern sich automatisch mit)`);
z();
z(`| Wert | ${ALT ?? '—'} | ${NEU} |`);
z('|---|---|---|');
for (const a of ABGELEITET) {
  z(`| ${a.text} | ${pAlt ? format(a.wert(pAlt), a.einheit) : '—'} | ${format(a.wert(pNeu), a.einheit)} |`);
}
z();

/* Teil 3 — Fundstellen ausserhalb des Rechtsstands */

z(`## Teil 3 — Von Hand gepflegte Werte außerhalb des Rechtsstands`);
z();
z(`Verglichen wird mit dem Rechtsstand ${Z}${zBelegt ? '' : ` (noch nicht angelegt: Fortschreibung von ${B} ohne Index)`}.`);
z();
const fundZeilen = new Set();
const zahlAusText = (s) => Number(String(s).replace(/\s|€|%/g, '').replace(/\./g, '').replace(',', '.'));
for (const g of Object.keys(GRUPPEN)) {
  const liste = FUNDSTELLEN.filter((f) => f.gruppe === g);
  if (!liste.length) continue;
  z(`### ${GRUPPEN[g].titel}`);
  z(`Quelle: ${GRUPPEN[g].wer}. Erscheint: ${GRUPPEN[g].wann}.`);
  z();
  z('| Fundstelle | Was | Im Code | Befund |');
  z('|---|---|---|---|');
  for (const f of liste) {
    if (!existsSync(join(WURZEL, f.datei))) {
      z(`| ${f.datei} | ${f.was} | — | **Datei fehlt — Katalog prüfen** |`);
      befunde.fundstelleFehlt.push(f.datei);
      continue;
    }
    const { text } = zeilenVon(f.datei);
    // Jede Fundstelle des Musters — manche Werte stehen zweimal in einer Datei.
    const alle = [...text.matchAll(new RegExp(f.muster.source, f.muster.flags.replace('g', '') + 'g'))];
    if (!alle.length) {
      z(`| ${f.datei} | ${f.was} | — | **nicht gefunden — Code geändert? Muster in katalog.mjs prüfen** |`);
      befunde.fundstelleFehlt.push(`${f.datei}: ${f.was}`);
      continue;
    }
    // Eine Liste, die als Ganzes gepflegt wird: jede ihrer Zeilen gilt als erfasst
    if (f.ganzeDatei) zeilenVon(f.datei).zeilen.forEach((_, i) => fundZeilen.add(`${f.datei}:${i + 1}`));
    for (const m of alle) {
      const zeile = zeileVonIndex(text, m.index);
      fundZeilen.add(`${f.datei}:${zeile}`);
      const gefunden = m.slice(1).filter((x) => x !== undefined).join(' / ') || m[0];
      const teile = [];
      if (f.soll) {
        const ist = f.wert ? f.wert(m[1]) : zahlAusText(m[1]);
        const soll = f.soll(pZ, Z);
        if (gleich(Math.round(ist * 1e6) / 1e6, Math.round(soll * 1e6) / 1e6)) teile.push(`stimmt mit ${Z} (${format(soll, f.einheit)})`);
        else {
          teile.push(`**weicht ab: Rechtsstand ${Z} hat ${format(soll, f.einheit)}**`);
          befunde.fundstelleAbweichung.push(`${f.datei}:${zeile} ${f.was}`);
        }
      }
      if (f.jahr) {
        if (gefunden.includes(String(Z))) teile.push(`nennt ${Z}`);
        else {
          teile.push(`**Stand ${gefunden} — für ${Z} prüfen**`);
          befunde.veraltetJahr.push(`${f.datei}:${zeile} ${f.was}`);
        }
      }
      if (f.aktion) teile.push(f.aktion);
      z(`| ${f.datei}:${zeile} | ${f.was} | ${String(gefunden).replace(/\|/g, '\\|')} | ${teile.join('; ')} |`);
    }
  }
  z();
}

/* Teil 4 — wo die App das laufende Jahr zieht */

z(`## Teil 4 — Wo die App den Rechtsstand des laufenden Jahres zieht`);
z();
z(`Diese Stellen rechnen am 1. Januar ${Z} mit dem Jahrgang ${Z}${zBelegt ? '' : ` — solange er fehlt, mit den Werten von ${B}, aber beschriftet mit ${Z}`}.`);
z();
const laufend = [];
const beschriftet = [];
for (const f of dateien) {
  if (istTest(f) || !/\.(ts|tsx)$/.test(f)) continue;
  const { zeilen, kommentar } = zeilenVon(f);
  zeilen.forEach((zl, i) => {
    if (kommentar[i]) return;
    if (LAUFENDES_JAHR.some((r) => r.test(zl))) laufend.push(`${f}:${i + 1}`);
    if (JAHR_IM_TEXT.test(zl)) beschriftet.push(`${f}:${i + 1}`);
  });
}
z(`- Rechnen mit dem laufenden Jahr (${laufend.length}): ${laufend.map((x) => `\`${x}\``).join(', ')}`);
z(`- Nennen „Rechtsstand {Jahr}“ im Text (${beschriftet.length}): ${beschriftet.map((x) => `\`${x}\``).join(', ')}`);
z();

/* Teil 5 — Abschriften von Rechengroessen */

z(`## Teil 5 — Abschriften: Wo Werte des Rechtsstands als Zahl im Code stehen`);
z();
z(`Gesucht werden die jährlich wechselnden Werte von ${[ALT, NEU].filter(Boolean).join(' und ')} sowie die abgeleiteten Werte. `
  + `Treffer in Texten veralten zum Jahreswechsel; Treffer in Tests sind meist absichtlich an ein Jahr gebunden.`);
z();

function varianten(v, einheit) {
  const aus = new Set();
  if (einheit === 'prozent') {
    /* Nur unverwechselbare Saetze: „2,9 %“ ja, „3 %“ nein; im Code 0.029 ja,
       0.03 nein — runde Werte stehen ueberall (Inflation, Renditen, Quoten). */
    const s = (Math.round(v * 100 * 1000) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 3 });
    if (s.includes(',')) aus.add(`${s}\\s?%`);
    if (String(v).length >= 5) aus.add(String(v).replace('.', '\\.'));
    return [...aus];
  }
  if (fastGanz(v)) {
    const n = Math.round(v);
    /* Dreistellige Betraege nur mit Waehrung dahinter — sonst treffen sie
       CSS-Klassen (rose-700), Schriftstaerken und Millisekunden. */
    if (n < 1000) {
      aus.add(`${n}(?=\\s?(?:€|EUR\\b|Euro\\b))`);
      return [...aus];
    }
    aus.add(String(n)); // 101400
    aus.add(n.toLocaleString('de-DE').replace(/\./g, '\\.')); // 101.400
    aus.add(n.toLocaleString('en-US').replace(/,/g, '_')); // 101_400
    return [...aus];
  }
  aus.add(de(v, 2).replace(/\./g, '\\.')); // 1.318,33
  aus.add(v.toFixed(2).replace('.', '\\.')); // 1318.33
  if (v >= 1000) aus.add(de(v, 2).replace(/\./g, '')); // 1318,33
  return [...aus];
}

const suchwerte = [];
const nimm = (wert, einheit, text, jahr) => {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return;
  if (einheit !== 'prozent' && Math.abs(wert) < 100) return; // zu unspezifisch
  if (suchwerte.some((s) => gleich(s.wert, wert) && s.einheit === einheit)) return;
  const v = varianten(wert, einheit);
  if (!v.length) return;
  suchwerte.push({ wert, einheit, text, jahr, muster: new RegExp(`(?<![0-9.,_-])(?:${v.join('|')})(?![0-9]|[.,_][0-9])`) });
};
for (const p of [pNeu, pAlt].filter(Boolean)) {
  for (const f of blaetter(p)) {
    const k = PARAMETER_KATALOG[f.pfad];
    if (!k || k.rhythmus !== 'jaehrlich') continue;
    if (p === pAlt && (k.einheit === 'prozent' || gleich(holen(pNeu, f.pfad), f.wert))) continue;
    nimm(f.wert, k.einheit, k.text, p.jahr);
  }
  for (const a of ABGELEITET) {
    if (p === pAlt && (a.einheit === 'prozent' || gleich(a.wert(pNeu), a.wert(p)))) continue;
    nimm(a.wert(p), a.einheit, a.text, p.jahr);
  }
}

const treffer = { text: [], kommentar: [] };
/** Tests: je Datei nur Werte und Zeilennummern — sie sind meist absichtlich an ein Jahr gebunden */
const testTrefferWerte = new Map();
let testTrefferAnzahl = 0;
for (const f of dateien) {
  if (f === QUELLE_RECHTSSTAND) continue;
  const { zeilen, kommentar } = zeilenVon(f);
  zeilen.forEach((zl, i) => {
    if (fundZeilen.has(`${f}:${i + 1}`)) return;
    for (const s of suchwerte) {
      if (!s.muster.test(zl)) continue;
      const wert = `${format(s.wert, s.einheit)} (${s.text}, ${s.jahr})`;
      if (istTest(f)) {
        const je = testTrefferWerte.get(f) ?? new Map();
        je.set(wert, [...(je.get(wert) ?? []), i + 1]);
        testTrefferWerte.set(f, je);
        testTrefferAnzahl += 1;
      } else {
        treffer[kommentar[i] ? 'kommentar' : 'text'].push(`| ${f}:${i + 1} | ${wert} | ${auszug(zl)} |`);
      }
      break;
    }
  });
}
for (const [art, titel] of [['text', 'In Code und Texten — prüfen'], ['kommentar', 'In Kommentaren — bei Gelegenheit']]) {
  z(`### ${titel} (${treffer[art].length})`);
  if (treffer[art].length) {
    z();
    z('| Fundstelle | Wert | Zeile |');
    z('|---|---|---|');
    treffer[art].forEach((t) => z(t));
  }
  z();
}
z(`### In Tests (${testTrefferAnzahl}) — meist absichtlich an ein Jahr gebunden`);
z();
for (const [f, je] of testTrefferWerte) {
  z(`- \`${f}\`: ${[...je].map(([w, nr]) => `${w} Z. ${nr.join(', ')}`).join('; ')}`);
}
z();

/* Teil 6 — Jahreszahlen in Texten und Stichwoerter */

z(`## Teil 6 — Jahreszahlen ${NEU === Z ? `${Z - 1}/${Z}` : `${B}/${Z}`} und Stichwörter außerhalb des Rechtsstands`);
z();
const jahrMuster = new RegExp(`\\b(${[B, Z].join('|')})\\b`);
const jahresTexte = [];
const kommentarMitWert = [];
const stichwortZeilen = [];
let unbedenklich = 0;
const istUnbedenklich = (f, zl) => UNBEDENKLICH.some((u) => (!u.datei || u.datei.test(f)) && (!u.muster || u.muster.test(zl)));
for (const f of dateien) {
  if (f === QUELLE_RECHTSSTAND || istTest(f)) continue;
  const { zeilen, kommentar } = zeilenVon(f);
  zeilen.forEach((zl, i) => {
    if (fundZeilen.has(`${f}:${i + 1}`)) return;
    const hatJahr = jahrMuster.test(zl);
    // Ein Betrag als Zahl im Text — nicht `${euro(x)}`, der wird gerechnet
    const hatBetrag = /(?<![{$])\b[0-9][0-9.,]*\s?(€|EUR\b|%)/.test(zl);
    const eintrag = `| ${f}:${i + 1} | ${auszug(zl)} |`;
    if (hatJahr && !kommentar[i]) {
      if (istUnbedenklich(f, zl)) unbedenklich += 1;
      else jahresTexte.push(eintrag);
    } else if (hatJahr && kommentar[i] && hatBetrag) kommentarMitWert.push(eintrag);
    else if (!kommentar[i] && hatBetrag && STICHWOERTER.test(zl)) {
      if (istUnbedenklich(f, zl)) unbedenklich += 1;
      else stichwortZeilen.push(eintrag);
    }
  });
}
const liste = (titel, eintraege) => {
  z(`### ${titel}`);
  z();
  if (!eintraege.length) {
    z('Keine.');
  } else {
    z('| Fundstelle | Zeile |');
    z('|---|---|');
    eintraege.forEach((t) => z(t));
  }
  z();
};
liste(`Jahreszahl in Code oder Text (${jahresTexte.length}) — nach dem Wechsel noch richtig?`, jahresTexte);
liste(`Kommentar mit Jahr und Betrag (${kommentarMitWert.length}) — veraltet nach dem Wechsel`, kommentarMitWert);
liste(`Stichwort mit Betrag, noch nicht katalogisiert (${stichwortZeilen.length}) — neue Fundstelle?`, stichwortZeilen);
z(`${unbedenklich} weitere Zeilen sind geprüft und in katalog.mjs als unbedenklich eingetragen (UNBEDENKLICH, jeweils mit Grund).`);
z();

/* Teil 7 — Tests mit Jahresbezug */

z(`## Teil 7 — Tests mit Jahresbezug`);
z();
z(`\`packages/engine/test/estg-tarif.test.ts\` prüft jeden belegten Jahrgang automatisch (Stetigkeit, Monotonie, Grenzsteuersätze). `
  + `Diese Tests greifen ausdrücklich auf ein Jahr zu und ändern ihr Ergebnis, sobald der Jahrgang ${Z} angelegt ist:`);
z();
const testMuster = new RegExp(`parameterFuer\\(\\s*(${Z}|${Z + 1})\\b|PARAMETER_(${B}|${Z})\\b`);
const testTreffer = new Map();
for (const f of dateien.filter(istTest)) {
  const { zeilen } = zeilenVon(f);
  zeilen.forEach((zl, i) => {
    if (testMuster.test(zl)) testTreffer.set(f, [...(testTreffer.get(f) ?? []), i + 1]);
  });
}
for (const [f, nr] of testTreffer) z(`- \`${f}\`: Zeilen ${nr.join(', ')}`);
z();

/* Teil 8 — Probelauf im neuen Jahr */

z(`## Teil 8 — Probelauf mit einer Uhr im Januar ${Z}`);
z();
if (!probelauf) {
  z(`Nicht ausgeführt. Mit \`--probelauf\` laufen alle Tests so, als wäre schon der 15. Januar ${Z} — `
    + `das zeigt Tests und Rechnungen, die am Jahreswechsel kippen.`);
} else {
  const env = {
    ...process.env,
    JW_HEUTE: `${Z}-01-15`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(join(HIER, 'zeitreise.mjs')).href}`.trim(),
  };
  for (const paket of ['@renten/schema', '@renten/engine', '@renten/web']) {
    const lauf = spawnSync('pnpm', ['--filter', paket, 'test'], { cwd: WURZEL, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const ausgabe = `${lauf.stdout}\n${lauf.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
    // Die Schlusszeile von vitest: „      Tests  1 failed | 596 passed (597)“
    const summe = ausgabe.match(/^\s+Tests\s+\d[^\n]*$/gm)?.at(-1)?.trim().replace(/\s+/g, ' ') ?? 'keine Zusammenfassung gefunden';
    z(`- **${paket}**: ${lauf.status === 0 ? 'grün' : 'ROT'} — ${summe}`);
    // vitest nennt jeden Fehlschlag zweimal (× im Lauf, FAIL in der Zusammenfassung)
    const zeilenMit = (r) => [...new Set(ausgabe.split('\n').filter((l) => r.test(l)).map((l) => l.trim()))];
    const fail = zeilenMit(/^\s*FAIL\s/);
    const fehler = fail.length ? fail : zeilenMit(/^\s*×\s/);
    fehler.slice(0, 25).forEach((l) => z(`  - ${auszug(l, 160)}`));
    if (fehler.length > 25) z(`  - … ${fehler.length - 25} weitere`);
  }
}
z();

/* Kurzfassung oben einsetzen */

const kurz = [
  '## Kurzfassung',
  '',
  `- Jahrgang ${Z}: ${zBelegt ? 'angelegt' : '**fehlt** — Teil 1 zeigt den Stand von ' + B}`,
  `- Jährliche Werte unverändert gegenüber dem Vorjahr: ${befunde.unveraendert.length ? befunde.unveraendert.join(', ') : 'keine'}`,
  `- Felder ohne Katalogeintrag: ${befunde.ohneKatalog.length ? befunde.ohneKatalog.join(', ') : 'keine'}`,
  `- Fundstellen, die vom Rechtsstand ${Z} abweichen: ${befunde.fundstelleAbweichung.length ? befunde.fundstelleAbweichung.join('; ') : 'keine'}`,
  `- Fundstellen mit altem Jahr: ${befunde.veraltetJahr.length ? befunde.veraltetJahr.join('; ') : 'keine'}`,
  `- Fundstellen nicht gefunden: ${befunde.fundstelleFehlt.length ? befunde.fundstelleFehlt.join('; ') : 'keine'}`,
  `- Abschriften in Code/Text: ${treffer.text.length}, in Kommentaren: ${treffer.kommentar.length}, in Tests: ${testTrefferAnzahl}`,
  `- Neue Kandidaten (Stichwort mit Betrag): ${stichwortZeilen.length}`,
  '',
];
out.splice(out.findIndex((l) => l.startsWith('## Teil 1')), 0, ...kurz);

const bericht = `${out.join('\n')}\n`;
process.stdout.write(bericht);
if (ausDatei) writeFileSync(resolve(process.cwd(), ausDatei), bericht);
