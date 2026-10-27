import type { MitarbeiterBav } from '@renten/engine';
import type { AxaAngaben, BeratungDaten, FirmenAngebot } from '@renten/schema';

/*
 * DER AXA-ANTRAG — Antrag auf Entgeltumwandlung und zugleich Vereinbarung
 * zwischen Arbeitgeber und Arbeitnehmer ueber eine Direktversicherung bei
 * der AXA Lebensversicherung AG (axa-antrag.tsx). Er tritt an die Stelle der
 * Mustervereinbarung, wenn die Firma bei der AXA versichert und die
 * Umwandlung in eine Direktversicherung fliesst.
 */

/** Gilt fuer diese Firma der AXA-Antrag statt der Mustervereinbarung? */
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
  { feld: 'funktionsweise', text: 'Entgeltumwandlung – Funktionsweise und Auswirkungen auf die Ansprüche an die gRV' },
  { feld: 'ausscheiden', text: 'Besonderheiten beim Ausscheiden aus dem Unternehmen und mögliche Auswirkungen auf Beitrags- und Leistungshöhe' },
  { feld: 'insolvenz', text: 'Absicherung bei Insolvenz des Arbeitgebers' },
];

/**
 * Was fuer die Unterschrift am Bildschirm noch fehlt. Die festgeschriebene
 * Fassung soll vollstaendig sein — auf Papier bleiben die Kaestchen leer
 * und werden von Hand angekreuzt.
 */
export function axaFehlt(d: BeratungDaten): string[] {
  const x = d.entscheidung.axa;
  const fehlt: string[] = [];
  if (!x.arbeitsunfaehig || !x.einschraenkung || !x.buRente) fehlt.push('die drei Fragen zur Gesundheit');
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
