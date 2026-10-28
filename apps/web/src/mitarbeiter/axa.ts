import type { MitarbeiterBav } from '@renten/engine';
import type { AxaAngaben, BeratungDaten, FirmenAngebot } from '@renten/schema';
import type { Auftritt } from '../features/auftritt';
import { namensTeile, vollerName, type NamensTeile } from '../lib/namen';

/*
 * DER AXA-ANTRAG — Antrag auf Entgeltumwandlung und zugleich Vereinbarung
 * zwischen Arbeitgeber und Arbeitnehmer ueber eine Direktversicherung bei
 * der AXA Lebensversicherung AG (axa-antrag.tsx). Er tritt an die Stelle der
 * Mustervereinbarung, wenn die Firma bei der AXA versichert und die
 * Umwandlung in eine Direktversicherung fliesst. Verzichtet der Mitarbeiter,
 * kommt das AXA-Gespraechsprotokoll mit „Nein“ zur Verzichtserklaerung.
 */

/** Gilt fuer diese Firma der AXA-Antrag statt der Mustervereinbarung — und bei Verzicht das AXA-Gespraechsprotokoll? */
export function istAxaAntrag(f: FirmenAngebot): boolean {
  const m = f.modell;
  return /\baxa\b/i.test(f.versicherer)
    && f.durchfuehrungsweg === 'direktversicherung'
    // Beim Matching kann die Umwandlung in die Unterstuetzungskasse gehen — dafuer passt der Antrag nicht.
    && !(m.art === 'matching' && m.weg === 'ukasse');
}

/** Die Betraege des Antrags im Monat: Umwandlung, Arbeitgeberbeitrag und was zusammen in die Direktversicherung fliesst. */
export function axaBetraege(r: MitarbeiterBav): { umwandlung: number; arbeitgeber: number; gesamt: number } {
  const direkt = r.vertraege.find((v) => v.weg === 'direkt');
  const arbeitgeber = direkt?.arbeitgeberMonat ?? 0;
  return { umwandlung: r.umwandlungMonat, arbeitgeber, gesamt: r.umwandlungMonat + arbeitgeber };
}

/** Die vier Besonderheiten des AXA-Gespraechsprotokolls, in seiner Reihenfolge. */
export const AXA_ERLAEUTERT: { feld: keyof AxaAngaben['erlaeutert']; text: string }[] = [
  { feld: 'versteuerung', text: 'Versteuerung und Verbeitragung der Leistungen' },
  { feld: 'funktionsweise', text: 'Entgeltumwandlung – Funktionsweise und Auswirkungen auf Ansprüche aus den sozialen '
    + 'Sicherungssystemen, z. B. auf Arbeitslosengeld, Grundrente und Krankentagegeld' },
  { feld: 'ausscheiden', text: 'Besonderheiten beim Ausscheiden aus dem Unternehmen und mögliche Auswirkungen auf Beitrags- und Leistungshöhe' },
  { feld: 'insolvenz', text: 'Absicherung bei Insolvenz des Arbeitgebers' },
];

/** Wer beraten hat: wie in der Beratung eingetragen, sonst der Name aus „Ihr Auftritt“. */
export function axaBerater(x: AxaAngaben, auftritt: Auftritt | null): NamensTeile {
  const eigen = { vorname: x.beraterVorname.trim(), nachname: x.beraterNachname.trim() };
  if (vollerName(eigen)) return eigen;
  return auftritt ? namensTeile(auftritt.berater, auftritt.vorname, auftritt.nachname) : { vorname: '', nachname: '' };
}

/** Die Organr. im Antrag: die der Beratung, sonst die Vorgabe der Firma. */
export function axaOrganr(x: AxaAngaben, f: FirmenAngebot): string {
  return x.organisationsnummer.trim() || f.organisationsnummer.trim();
}

/** Stehen Belehrung und Fragen zur Gesundheit im Antrag? Mit dem BU-Zusatz — und unbeantwortet, fuer Papier. */
export function mitGesundheitsfragen(x: AxaAngaben): boolean {
  return x.buBefreiung !== 'nein';
}

/** Die Baustein-Zeile des Protokolls: der Tarif und, wenn gewaehlt, der BU-Zusatz. */
export function axaBausteine(f: FirmenAngebot, x: AxaAngaben): string {
  return [f.tarif.trim(), x.buBefreiung === 'ja' ? 'Beitragsbefreiung bei Berufsunfähigkeit' : ''].filter(Boolean).join(', ');
}

/**
 * Worauf der Mitarbeiter beim „Nein“ im Protokoll verzichtet: „auf den
 * Arbeitgeberzuschuss in Höhe von … % des Entgeltumwandlungsbetrages bzw.
 * … EUR“. Prozent nur im Zuschussmodell; Euro, was der Arbeitgeber laut
 * Beratung im Monat dazugaebe — ohne berechnete Umwandlung der feste Betrag
 * des Modells.
 */
export function axaVerzichtZuschuss(f: FirmenAngebot, r: MitarbeiterBav): { prozent: number | null; euro: number | null } {
  const m = f.modell;
  const prozent = m.art === 'zuschuss' && m.quote > 0 ? Math.round(m.quote * 1000) / 10 : null;
  const fest = m.art === 'festbetrag' ? m.festbetragMonat : m.art === 'matching' ? m.matchingMonat : 0;
  return { prozent, euro: r.arbeitgeberMonat > 0.005 ? r.arbeitgeberMonat : fest > 0 ? fest : null };
}

/**
 * Was fuer die Unterschrift am Bildschirm noch fehlt — bei Teilnahme fuer den
 * Antrag, bei Verzicht fuer das Protokoll. Die festgeschriebene Fassung soll
 * vollstaendig sein; auf Papier bleiben die Kaestchen leer und werden von
 * Hand angekreuzt.
 */
export function axaFehlt(d: BeratungDaten, beraterName: string): string[] {
  const x = d.entscheidung.axa;
  const antrag = d.entscheidung.status === 'teilnahme';
  const fehlt: string[] = [];
  if (!beraterName.trim()) fehlt.push('der Name des Beraters');
  if (antrag && !x.buBefreiung) fehlt.push('ob die Beitragsbefreiung bei Berufsunfähigkeit eingeschlossen ist');
  if (antrag && x.buBefreiung === 'ja' && (!x.arbeitsunfaehig || !x.einschraenkung || !x.buRente)) {
    fehlt.push('die drei Fragen zur Gesundheit');
  }
  if (!x.kanal) fehlt.push('wie die Beratung erfolgte');
  if (AXA_ERLAEUTERT.some(({ feld }) => !x.erlaeutert[feld])) fehlt.push('die erläuterten Besonderheiten');
  return fehlt;
}

/** Die Belehrung vor den Fragen zur Gesundheit — im Antrag und in der Beratung (§ 19 Abs. 5 VVG). */
export const AXA_BELEHRUNG: { titel?: string; text: string }[] = [
  { text: 'Sie sind verpflichtet, die von uns nachfolgend gestellte Fragen wahrheitsgemäß zu beantworten. Kommen Sie dieser '
    + 'Anzeigepflicht nicht nach, kann dies schwerwiegende Folgen haben:' },
  { titel: '1. Rücktrittsrecht wegen Verletzung der vorvertraglichen Anzeigepflicht:',
    text: 'Das kann für Sie den vollständigen und rückwirkenden Verlust des Versicherungsschutzes und die Verpflichtung zur '
      + 'Rückzahlung bereits erhaltener Leistungen bedeuten.' },
  { titel: '2. Kündigungsrecht:',
    text: 'Bei einer Verletzung der vorvertraglichen Anzeigepflicht können wir auch zur Kündigung berechtigt sein. Diese '
      + 'Kündigung erfolgt mit einer Frist von einem Monat.' },
  { titel: '3. Vertragsanpassung:',
    text: 'Eine solche kann darin bestehen, dass wir entweder einen Mehrbetrag erheben oder aber einen Leistungsausschuss für '
      + 'einen nicht mitgeteilten erheblichen Umstand geltend machen.' },
];

/** Die drei Fragen der Erklaerung des Arbeitnehmers, mit den Sternen der Fussnoten — Wortlaut der Vorlage. */
export const AXA_FRAGEN: { feld: 'arbeitsunfaehig' | 'einschraenkung' | 'buRente'; text: string; sterne: string }[] = [
  { feld: 'arbeitsunfaehig', sterne: '**',
    text: 'Versehen Sie Ihren Dienst zurzeit eingeschränkt oder waren in den letzten 12 Monaten länger als 2 Wochen '
      + '(10 Arbeitstage*) ununterbrochen arbeitsunfähig?' },
  { feld: 'einschraenkung', sterne: '**',
    text: 'Liegt bei Ihnen eine Einschränkung der Erwerbs- oder Berufsfähigkeit oder eine andere unfall- oder '
      + 'krankheitsbedingte Behinderung vor, die von einem Versorgungs- oder Versicherungsträger festgestellt wurde, oder '
      + 'wurde ein Antrag bei einem Versorgungs- oder Versicherungsträger wegen Berufs- oder Erwerbsunfähigkeit gestellt?' },
  { feld: 'buRente', sterne: '*****',
    text: 'Übersteigt die jährliche zu versichernde BU-/EU-Rente (Gesamtrente inkl. Überschussbeteiligung) – einschließlich '
      + 'bereits bestehender oder beantragter Versicherungen für den Fall der Berufs-, Dienst- oder Erwerbsunfähigkeit*** - '
      + '60% Ihres zum Zeitpunkt der Antragstellung aktuellen jährlichen Brutto-Arbeitseinkommens****?' },
];

export const AXA_FUSSNOTEN: string[] = [
  '* ausgenommen hiervon sind grippale Infekte',
  '** Wird die Frage mit „Ja“ beantwortet, so ist eine normale Gesundheitsprüfung mit Beantwortung der Gesundheitsfragen '
    + 'durch die zu versichernde Person erforderlich.',
  '*** Aus privater Vorsorge, Beamtenversorgung, berufsständischer Versorgung, betrieblicher Altersversorgung und '
    + 'Zusatzversorgung im Öffentlichen Dienst.',
  '**** Als Arbeitseinkommen gelten regelmäßige Einkünfte aus Arbeitstätigkeit inklusive Weihnachts- und Urlaubsgeld, '
    + 'Tantiemen, Bonus-, Sonderzahlungen. Bei Selbständigen/Freiberuflern gilt der Gewinn aus Gewerbebetrieb bzw. aus '
    + 'selbständiger Tätigkeit als Einkommen.',
  '***** Wird die Frage mit "ja" beantwortet ist eine individuelle Prüfung notwendig.',
];
