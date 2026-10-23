import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { UnterlagenArt, Unterschrift } from '../lib/bav-beratung';
import { pruefsummeKurz, vermerkText, zeitpunktText, zugGueltig, zugRahmen } from './unterschrift-daten';

/*
 * FESTSCHREIBEN UND DRUCKEN der unterschriebenen Fassung.
 *
 * Bei der ersten Unterschrift rendert `unterlageErfassen` jedes Dokument so,
 * wie es gedruckt wuerde, in einen losgeloesten Container und nimmt sein HTML.
 * Die Logos sind Object-URLs, gueltig nur in dieser Sitzung — sie werden
 * verkleinert und eingebettet. Die Datenbank bewahrt das HTML auf; gedruckt
 * wird spaeter genau diese Fassung, mit den Unterschriften in ihren
 * Platzhaltern (`data-unterschrift`, `data-vermerk`, siehe druck.tsx).
 *
 * Bevor festgeschriebenes HTML in die Seite kommt, geht es durch
 * `bereinigen`: nur die Tags und Attribute, die die Unterlagen brauchen —
 * keine Skripte, keine Ereignis-Attribute, keine Links, Bilder nur als
 * eingebettete Daten. Geschrieben hat das HTML die App selbst; das ist die
 * zweite Sicherung.
 *
 * Die Klassen im HTML sind die von druck.tsx. Solange die Unterlagen dort
 * stehen, liefert das Stylesheet sie mit.
 */

/** So gross kommt ein Logo hoechstens in die Fassung — der Druck zeigt es kleiner. */
const LOGO_MAX = { breite: 600, hoehe: 240 };

async function bildEinbetten(src: string): Promise<string | null> {
  if (!src) return null;
  try {
    const bild = await createImageBitmap(await (await fetch(src)).blob());
    const massstab = Math.min(1, LOGO_MAX.breite / bild.width, LOGO_MAX.hoehe / bild.height);
    const leinwand = document.createElement('canvas');
    leinwand.width = Math.max(1, Math.round(bild.width * massstab));
    leinwand.height = Math.max(1, Math.round(bild.height * massstab));
    leinwand.getContext('2d')?.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
    bild.close();
    // WebP ist kleiner; wer es nicht schreiben kann (Safari), liefert PNG.
    const webp = leinwand.toDataURL('image/webp', 0.92);
    return webp.startsWith('data:image/webp') ? webp : leinwand.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Das HTML eines Dokuments, so wie es gedruckt wuerde — die Logos eingebettet, ohne Logo, wo das nicht klappt. */
export async function unterlageErfassen(dokument: ReactElement): Promise<string> {
  const huelle = document.createElement('div');
  const wurzel = createRoot(huelle);
  let kopie: HTMLElement;
  try {
    flushSync(() => wurzel.render(dokument));
    kopie = huelle.cloneNode(true) as HTMLElement;
  } finally {
    wurzel.unmount();
  }
  for (const bild of Array.from(kopie.querySelectorAll('img'))) {
    const daten = await bildEinbetten(bild.getAttribute('src') ?? '');
    if (daten) bild.setAttribute('src', daten);
    else bild.remove();
  }
  return kopie.innerHTML;
}

const TAGS = new Set([
  'article', 'section', 'div', 'p', 'span', 'strong', 'em', 'b', 'i', 'small', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'style',
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'text',
]);
const ATTRIBUTE = new Set([
  'class', 'style', 'alt', 'role', 'aria-label', 'aria-hidden', 'colspan', 'rowspan', 'src',
  'data-unterschrift', 'data-vermerk', 'data-auftritt-logo',
  'xmlns', 'viewbox', 'preserveaspectratio', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'vector-effect', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'width', 'height', 'text-anchor', 'font-size', 'font-weight',
]);
const BILD = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const GEFAEHRLICH = /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:/i;

function attributErlaubt(tag: string, name: string, wert: string): boolean {
  if (!ATTRIBUTE.has(name)) return false;
  if (name === 'src') return tag === 'img' && BILD.test(wert);
  return !GEFAEHRLICH.test(wert);
}

function bereinigen(knoten: Element): void {
  for (const kind of Array.from(knoten.childNodes)) {
    if (kind.nodeType === Node.TEXT_NODE) continue;
    if (kind.nodeType !== Node.ELEMENT_NODE) { kind.remove(); continue; }
    const el = kind as Element;
    const tag = el.localName.toLowerCase();
    if (!TAGS.has(tag)) { el.remove(); continue; }
    if (tag === 'style') {
      // Nur die Fusszeile des Beraters (@page) — reiner Text, nichts, was nachlaedt.
      if (el.children.length > 0 || GEFAEHRLICH.test(el.textContent ?? '')) el.remove();
      continue;
    }
    for (const a of Array.from(el.attributes)) {
      if (!attributErlaubt(tag, a.name.toLowerCase(), a.value)) el.removeAttribute(a.name);
    }
    if (tag === 'img' && !el.hasAttribute('src')) { el.remove(); continue; }
    bereinigen(el);
  }
}

/** Festgeschriebenes HTML, bereinigt — exportiert fuer den Test im Browser. */
export function unterlageBereinigen(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  bereinigen(doc.body);
  return doc.body.innerHTML;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Die festgeschriebene Fassung mit den Unterschriften darin, bereinigt. Jede
 * Unterschrift kommt nur in die Unterlagen, die sie abdeckt.
 */
export function mitUnterschriften(html: string, unterschriften: readonly Unterschrift[], art: UnterlagenArt): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  bereinigen(doc.body);
  for (const u of unterschriften) {
    if (!u.dokumente.includes(art)) continue;
    const rahmen = zugGueltig(u.zug) ? zugRahmen(u.zug) : null;
    const feld = doc.body.querySelector(`[data-unterschrift="${u.person}"]`);
    if (feld && rahmen) {
      const bild = doc.createElementNS(SVG, 'svg');
      bild.setAttribute('viewBox', `${rahmen.x} ${rahmen.y} ${rahmen.breite} ${rahmen.hoehe}`);
      bild.setAttribute('preserveAspectRatio', 'xMaxYMax meet');
      bild.setAttribute('class', 'block h-full w-auto max-w-full');
      bild.setAttribute('role', 'img');
      bild.setAttribute('aria-label', `Unterschrift ${u.name}`);
      const linie = doc.createElementNS(SVG, 'path');
      linie.setAttribute('d', u.zug);
      linie.setAttribute('fill', 'none');
      linie.setAttribute('stroke', '#0f172a');
      linie.setAttribute('stroke-width', '1.6');
      linie.setAttribute('stroke-linecap', 'round');
      linie.setAttribute('stroke-linejoin', 'round');
      // Die Linie bleibt gleich stark, gleich wie gross die Unterschrift gezeichnet wurde.
      linie.setAttribute('vector-effect', 'non-scaling-stroke');
      bild.append(linie);
      feld.replaceChildren(bild);
    }
    const vermerk = doc.body.querySelector(`[data-vermerk="${u.person}"]`);
    if (vermerk) vermerk.textContent = vermerkText(u.name, u.unterschriebenAm);
  }
  return doc.body.innerHTML;
}

/** SHA-256 wie in der Datenbank — null, wo der Browser nicht rechnen kann (ohne sichere Verbindung). */
export async function pruefsummeVon(text: string): Promise<string | null> {
  try {
    const puffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(puffer), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Die unterschriebene Fassung fuer den Druck. `html` kommt aus
 * `mitUnterschriften` und ist damit bereinigt. Darunter steht, wann sie
 * festgeschrieben wurde, mit der Pruefsumme — oder die Warnung, dass der
 * Inhalt nicht mehr zur Pruefsumme passt.
 */
export function UnterschriebeneUnterlage({ html, erstelltAm, pruefsumme, stimmt }: {
  html: string; erstelltAm: string; pruefsumme: string; stimmt: boolean;
}) {
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <p className={`mt-4 border-t border-slate-300 pt-1 text-[7.5pt] ${stimmt ? 'text-slate-500' : 'font-bold text-rose-700'}`}>
        {stimmt
          ? `Elektronisch unterschriebene Fassung, festgeschrieben am ${zeitpunktText(erstelltAm)} · Prüfsumme ${pruefsummeKurz(pruefsumme)}`
          : 'Achtung: Der Inhalt passt nicht zur Prüfsumme der festgeschriebenen Fassung.'}
      </p>
    </div>
  );
}
