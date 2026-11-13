import { firmenAngebotSchema } from '@renten/schema';
import {
  firmaAnlegen, firmaSpeichern, firmenLaden, firmenlogoHochladen, firmenlogoLaden, firmenlogosAufraeumen, type Firma,
} from '../lib/bav-beratung';
import { logoVorbereiten } from '../lib/bild';
import { DRUCKFARBEN_HINWEIS } from '../lib/druckfarben';
import type { FirmenWerte } from './firmenkunde';

/**
 * Der Firmenkunde der Arbeitgeber-Seiten — was das KONTO dazu braucht.
 *
 * Eigenes Modul, das die Seiten erst nach dem Aufbau nachladen
 * (`Firmenkunde.tsx`): Datenzugriff der Mitarbeiterberatung, Schema und
 * Bildaufbereitung bleiben aus dem Bundle der Rechnung heraus — wie schon das
 * Fenster „Für die Mitarbeiter-Beratung übernehmen“.
 *
 * Firmen und Logos liegen dort, wo die Mitarbeiterberatung sie fuehrt
 * (`bav_firmen`, Bucket `bav-firmenlogos`): Eine Firma, die hier angelegt
 * wird, ist dieselbe, mit der spaeter beraten wird — Name und Logo stehen
 * dann auch auf den Unterlagen der Mitarbeiter.
 */

export type { Firma };
export { firmenLaden, firmenlogoLaden, DRUCKFARBEN_HINWEIS };

const LOGO_MELDUNG = {
  typ: 'Bitte ein Bild als PNG, JPG oder WebP wählen.',
  'zu-gross': 'Das Bild ist zu groß. Bitte eine kleinere Datei wählen.',
  fehler: 'Das Logo konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.',
} as const;

export interface GelesenesLogo {
  blob: Blob;
  dataUrl: string;
  /** Eine Druckdatei (CMYK), deren Farben fuer den Bildschirm nachgerechnet wurden */
  druckfarben: boolean;
}

/** Eine Bilddatei zum Logo aufbereiten — oder sagen, warum es nicht geht. */
export async function logoLesen(datei: File): Promise<GelesenesLogo | { meldung: string }> {
  const r = await logoVorbereiten(datei);
  if (typeof r === 'string') return { meldung: r === 'fehler' ? 'Das Bild ließ sich nicht lesen. Bitte eine andere Datei wählen.' : LOGO_MELDUNG[r] };
  return { blob: r.blob, dataUrl: r.dataUrl, druckfarben: r.druckfarben };
}

/**
 * Eine neue Firma mit dem, was die Seite ueber das Unternehmen weiss. Das
 * Logo folgt in einem zweiten Schritt — die Regel des Speichers verlangt die
 * gespeicherte Firma. Klappt nur das Logo nicht, bleibt die Firma und die
 * Meldung sagt es.
 */
export async function firmaMitLogoAnlegen(
  name: string, werte: FirmenWerte, logo: Blob | null,
): Promise<{ firma: Firma; meldung: string | null } | { firma: null; meldung: string }> {
  const angebot = firmenAngebotSchema.safeParse({
    bundesland: werte.bundesland, unternehmensSteuersatz: werte.steuersatz, umlagenSatz: werte.umlagen,
  });
  if (!angebot.success) return { firma: null, meldung: 'Bitte die Angaben zum Unternehmen prüfen.' };
  const r = await firmaAnlegen(name, angebot.data);
  if (r === 'grenze') return { firma: null, meldung: 'Es sind höchstens 200 Firmen je Konto möglich.' };
  if (r === 'fehler') return { firma: null, meldung: 'Die Firma konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.' };
  if (!logo) return { firma: r, meldung: null };
  const mitLogo = await logoSpeichern(r, logo);
  return 'meldung' in mitLogo
    ? { firma: r, meldung: `Die Firma ist angelegt. ${mitLogo.meldung}` }
    : { firma: mitLogo.firma, meldung: null };
}

/** Das Logo einer eigenen Firma setzen oder ersetzen; das vorige raeumt der Hintergrund ab. */
export async function logoSpeichern(firma: Firma, logo: Blob): Promise<{ firma: Firma } | { meldung: string }> {
  const pfad = await firmenlogoHochladen(firma.id, logo);
  if (pfad === 'zu-gross' || pfad === 'typ' || pfad === 'fehler') return { meldung: LOGO_MELDUNG[pfad] };
  if (!(await firmaSpeichern({ id: firma.id, name: firma.name, angebot: firma.angebot, logoPfad: pfad }))) {
    return { meldung: LOGO_MELDUNG.fehler };
  }
  void firmenlogosAufraeumen(firma.id, pfad);
  return { firma: { ...firma, logoPfad: pfad } };
}
