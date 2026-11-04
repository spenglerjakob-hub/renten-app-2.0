import {
  bezugsrechtText, braucheBank, ibanFormatiert, ibanGueltig,
  type AntragAngaben, type AntragLoesung,
} from '@renten/schema';
import { LOESUNG_KURZ, type MitAngenommenen } from './tuev-berechnung';
import type { AusweisSeite } from '../lib/antraege';

/**
 * Die Angaben für den Antrag — was sich ohne Browser und Datenbank rechnen
 * lässt: das Abbild der angenommenen Lösungen, der Text der E-Mail an den
 * Kunden und der Antragsbogen als HTML.
 */

/** Das Abbild der angenommenen Lösungen, wie es im Antrag gespeichert wird. */
export function antragLoesungenAus(
  loesungen: MitAngenommenen['loesungen'], nameVon: (id: 'A' | 'B') => string,
): AntragLoesung[] {
  return loesungen.map(({ angebot: a, vertrag }) => ({
    id: a.id,
    art: a.loesung,
    anbieter: a.name.slice(0, 120),
    inhaber: vertrag.inhaber,
    person: nameVon(vertrag.inhaber).slice(0, 120),
    beitragMonat: a.beitragMonat,
    agZuschussMonat: a.loesung === 'bav' ? a.agZuschussMonat : 0,
    renteMonat: a.renteMonat,
    kapital: a.kapital,
  }));
}

/** Haben sich die Lösungen seit dem Speichern geändert? */
export const loesungenGleich = (a: readonly AntragLoesung[], b: readonly AntragLoesung[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Ein Bezugsrecht je Lösung — vorbelegt der erste Punkt, Fremdes fällt weg. */
export function angabenFuer(angaben: AntragAngaben, loesungen: readonly AntragLoesung[]): AntragAngaben {
  const bezugsrecht: Record<string, number> = {};
  for (const l of loesungen) bezugsrecht[l.id] = angaben.bezugsrecht[l.id] ?? 1;
  return { bezugsrecht, ...(angaben.bank ? { bank: angaben.bank } : {}) };
}

const datum = (iso: string | Date) => new Date(iso).toLocaleDateString('de-DE');

/** Die E-Mail an den Kunden — ohne Angaben, nur mit dem Link. */
export function antragMail(kunde: string, link: string, bis: string): string {
  const betreff = 'Angaben für Ihren Antrag';
  const text = `Guten Tag${kunde ? ` ${kunde}` : ''},\n\n`
    + 'für Ihren Antrag fehlen mir noch einige Angaben. Bitte ergänzen Sie sie über den folgenden '
    + 'Link — ein Konto ist nicht nötig:\n\n'
    + `${link}\n\n`
    + `Der Link ist bis zum ${datum(bis)} gültig und lässt sich einmal absenden.\n\n`
    + 'Viele Grüße';
  return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Text sicher ins HTML: Jede Angabe kommt als Text, nie als Markup. */
export const htmlText = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const geld = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`;

/** Als Bildquelle nur ein JPEG als data-URL, so wie `ausweisBild` es liefert. */
const bildQuelle = (bild: string | null) => (bild && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(bild) ? bild : '');

/** Was das Druckfenster zeigt, solange die Ausweiskopien laden. */
export const ANTRAGSBOGEN_WARTEN = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Antragsbogen</title></head>'
  + '<body style="font: 15px system-ui, sans-serif; color: #57534e; margin: 3em;">Der Antragsbogen wird vorbereitet …</body></html>';

export interface AntragsbogenDaten {
  kunde: string;
  loesungen: AntragLoesung[];
  angaben: AntragAngaben;
  /** Die Kopien als data-URL; `null`, wenn eine sich nicht laden ließ */
  ausweise: { bild: string | null; seite: AusweisSeite; vomKunden: boolean }[];
  /** Der Auftritt des Beraters, falls hinterlegt */
  berater?: string;
  stand: Date;
}

/**
 * Der Antragsbogen: eine Seite mit den Lösungen, den Bezugsrechten, der
 * Bankverbindung und den Ausweiskopien — zum Drucken oder als PDF für den
 * Versicherer. Eigenes Dokument mit eigenen Stilen: Es öffnet sich in einem
 * neuen Fenster, ohne die Oberfläche des Rechners.
 */
export function antragsbogenHtml(d: AntragsbogenDaten): string {
  const t = htmlText;
  const name = (l: AntragLoesung) => (l.anbieter ? `${l.anbieter} (${LOESUNG_KURZ[l.art]})` : LOESUNG_KURZ[l.art]);
  const beitrag = (l: AntragLoesung) => (l.art === 'bav'
    ? (l.beitragMonat > 0 ? `${geld(l.beitragMonat)} + Arbeitgeber ${geld(l.agZuschussMonat)}` : `Arbeitgeber ${geld(l.agZuschussMonat)}`)
    : geld(l.beitragMonat));
  const leistung = (l: AntragLoesung) => (l.renteMonat > 0 ? `${geld(l.renteMonat)} Rente im Monat` : `${geld(l.kapital)} Kapital`);
  const mitPerson = d.loesungen.some((l) => l.person);

  const zeilen = d.loesungen.map((l) => `<tr><td>${t(name(l))}</td>${mitPerson ? `<td>${t(l.person)}</td>` : ''}`
    + `<td class="wert">${t(beitrag(l))}</td><td class="wert">${t(leistung(l))}</td></tr>`).join('');

  const bezug = d.loesungen.map((l) => {
    const wert = d.angaben.bezugsrecht[l.id];
    return `<div class="block"><strong>${t(name(l))}</strong>`
      + (wert ? `<p>${wert}. ${t(bezugsrechtText(wert))}</p>` : '<p class="leer">noch offen</p>')
      + '</div>';
  }).join('');

  const bank = d.angaben.bank;
  const bankHtml = !braucheBank(d.loesungen) ? ''
    : `<h2>Bankverbindung</h2>${bank && (bank.inhaber.trim() || bank.iban.trim())
      ? `<table><tbody><tr><th>Kontoinhaber</th><td>${t(bank.inhaber)}</td></tr>`
        + `<tr><th>IBAN</th><td class="wert">${t(ibanFormatiert(bank.iban))}`
        + `${ibanGueltig(bank.iban) ? '' : ' <span class="leer">(Prüfziffer stimmt nicht)</span>'}</td></tr></tbody></table>`
      : '<p class="leer">noch offen</p>'}`;

  // Eine Kopie, die sich nicht laden ließ, fehlt nicht still: Der Bogen sagt es.
  const ausweisHtml = d.ausweise.length === 0 ? '<p class="leer">noch keine Kopie</p>'
    : `<div class="bilder">${d.ausweise.map((a) => `<figure>${bildQuelle(a.bild)
      ? `<img src="${t(bildQuelle(a.bild))}" alt="">`
      : '<div class="fehlt">Diese Kopie ließ sich nicht laden — bitte den Antragsbogen noch einmal drucken.</div>'}`
      + `<figcaption>${a.seite === 'hinten' ? 'Rückseite' : 'Vorderseite'}${a.vomKunden ? ' · vom Kunden' : ''}</figcaption></figure>`).join('')}</div>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Angaben für den Antrag${d.kunde ? ` – ${t(d.kunde)}` : ''}</title>
<style>
@page { size: A4; margin: 16mm 16mm 18mm; }
body { font: 10.5pt/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1c1917; margin: 16mm; }
@media print { body { margin: 0; } }
h1 { font-size: 18pt; font-weight: 500; margin: 0 0 1.5mm; }
.unter { color: #57534e; font-size: 9.5pt; margin: 0 0 5mm; }
h2 { font-size: 11pt; font-weight: 600; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 0.4pt solid #a8a29e; break-after: avoid; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { text-align: left; vertical-align: top; padding: 1.5mm 3mm 1.5mm 0; border-bottom: 0.3pt solid #d6d3d1; }
th { font-weight: 600; color: #57534e; font-size: 8.5pt; }
tbody th { width: 30%; }
.wert { font-variant-numeric: tabular-nums; }
.block { break-inside: avoid; margin: 0 0 2.5mm; }
.block p { margin: 0.5mm 0 0; }
.bilder { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
figure { margin: 0; break-inside: avoid; }
img { width: 100%; border: 0.3pt solid #d6d3d1; }
.fehlt { border: 0.6pt dashed #a8a29e; padding: 8mm 4mm; text-align: center; color: #57534e; font-size: 9pt; }
figcaption { font-size: 8.5pt; color: #57534e; margin-top: 1mm; }
.leer { color: #a8a29e; }
.fuss { margin-top: 7mm; font-size: 8pt; color: #78716c; }
</style></head><body>
<h1>Angaben für den Antrag</h1>
<p class="unter">${t([d.kunde, `Stand ${datum(d.stand)}`, d.berater ?? ''].filter(Boolean).join(' · '))}</p>
<h2>Gewählte Lösungen</h2>
<table><thead><tr><th>Lösung</th>${mitPerson ? '<th>Für</th>' : ''}<th>Beitrag im Monat</th><th>Laut Angebot</th></tr></thead>
<tbody>${zeilen}</tbody></table>
<h2>Bezugsrecht im Todesfall</h2>
${bezug || '<p class="leer">keine Lösung</p>'}
${bankHtml}
<h2>Kopie des Personalausweises</h2>
${ausweisHtml}
<p class="fuss">Erstellt mit dem JS-Rentenplaner. Die Ausweiskopie trägt das Wasserzeichen „KOPIE“
(§ 20 Abs. 2 PAuswG) und wird spätestens 90 Tage nach dem Anlegen des Antrags gelöscht.</p>
</body></html>`;
}

/**
 * Dieselben Angaben? Die Reihenfolge der Schlüssel zählt nicht — die
 * Datenbank sortiert sie anders, als das Formular sie anlegt.
 */
export function angabenGleich(a: AntragAngaben, b: AntragAngaben): boolean {
  const ka = Object.keys(a.bezugsrecht);
  if (ka.length !== Object.keys(b.bezugsrecht).length) return false;
  if (ka.some((k) => a.bezugsrecht[k] !== b.bezugsrecht[k])) return false;
  const bank = (x: AntragAngaben) => (x.bank && (x.bank.inhaber || x.bank.iban) ? `${x.bank.inhaber}|${x.bank.iban}` : '');
  return bank(a) === bank(b);
}

/** Vor dem Speichern: IBAN ohne Leerzeichen, Inhaber ohne Rand, leere Bank weg. */
export function angabenBereinigt(a: AntragAngaben): AntragAngaben {
  const inhaber = a.bank?.inhaber.trim() ?? '';
  const iban = a.bank ? a.bank.iban.replace(/\s+/g, '').toUpperCase() : '';
  return { bezugsrecht: a.bezugsrecht, ...(inhaber || iban ? { bank: { inhaber, iban } } : {}) };
}
