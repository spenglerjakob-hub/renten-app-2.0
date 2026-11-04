import { ausweiseLaden, ausweisBild, type Antrag } from '../lib/antraege';
import { antragsbogenHtml, ANTRAGSBOGEN_WARTEN } from './antrag-daten';

/**
 * Den Antragsbogen drucken — in einem eigenen Fenster mit eigenem Dokument
 * (`antragsbogenHtml`), damit der Ausdruck des Gutachtens unberührt bleibt.
 *
 * Das Fenster öffnet SOFORT im Klick: Nach dem Warten auf die Ausweiskopien
 * sperrte der Browser es als Popup. Die Kopien kommen ganz geladen in das
 * Dokument — gedruckt wird erst, wenn alle da sind.
 */
export async function antragsbogenDrucken(a: Antrag, berater?: string): Promise<boolean> {
  const fenster = window.open('', '_blank');
  if (!fenster) return false;
  try {
    fenster.document.write(ANTRAGSBOGEN_WARTEN);
    const kopien = await ausweiseLaden(a);
    const ausweise = await Promise.all(kopien.map(async (k) => ({
      bild: await ausweisBild(k.pfad).catch(() => null), seite: k.seite, vomKunden: k.vomKunden,
    })));
    fenster.document.open();
    fenster.document.write(antragsbogenHtml({
      kunde: a.kunde, loesungen: a.loesungen, angaben: a.angaben, ausweise, berater, stand: new Date(),
    }));
    fenster.document.close();
    fenster.opener = null;
    // Die Kopien stehen schon im Dokument; das Entschlüsseln dauert nur einen Augenblick.
    const bilder = [...fenster.document.images];
    await Promise.race([
      Promise.all(bilder.map((b) => b.decode().catch(() => undefined))),
      new Promise((fertig) => window.setTimeout(fertig, 4000)),
    ]);
    fenster.focus();
    fenster.print();
    return true;
  } catch {
    fenster.close();
    return false;
  }
}
