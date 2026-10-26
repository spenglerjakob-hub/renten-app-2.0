import { useState } from 'react';
import {
  Copy, Check, Mail, Download, Trash2, RefreshCw, Link2, Paperclip, ChevronDown, Eye, FileText,
  Image as BildSymbol,
} from 'lucide-react';
import { LinkFeld } from '../components/LinkFeld';
import { FEHLER, FELD, KNOPF, KNOPF_KLEIN, KNOPF_KLEIN_HAUPT, Stand } from '../components/stil';
import { useCheckAnfragen } from '../store/check-anfragen';
import { useSzenario } from '../store/szenario';
import { useAuth } from '../store/auth';
import { checkLink, dokumentLink, DOKUMENT_ART_TEXT, type DokumentArt } from '../lib/check';
import type { CheckAnfrage, BeraterDokument } from '../lib/check';

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

const groesse = (bytes: number | null) => (bytes === null ? ''
  : bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const ARTEN = Object.keys(DOKUMENT_ART_TEXT) as DokumentArt[];

/** Knoepfe nur mit Symbol, wie das Loeschen in der Liste der Beratungen. */
const SYMBOL_KNOPF = 'shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-ui-innen hover:text-ui-tinte';
const SYMBOL_LOESCHEN = 'shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-rose-50 hover:text-rose-700';

/**
 * „Vorsorge-Check anfordern" — die Seite des Beraters.
 *
 * Je Kunde ein eigener Link: einmal nutzbar, 30 Tage gueltig. Was der Kunde
 * einreicht, sieht nur das Konto, das den Link erzeugt hat — das regelt die
 * Datenbank, nicht diese Oberflaeche.
 */
/**
 * Die Unterlagen eines Eingangs: ansehen oder herunterladen.
 *
 * Die Links gelten fuenf Minuten und entstehen erst beim Klick — eine Liste
 * vorab signierter Links laege sonst laenger offen als noetig.
 */
function Unterlagen({ dokumente }: { dokumente: BeraterDokument[] }) {
  const [fehler, setFehler] = useState(false);

  const ansehen = async (d: BeraterDokument) => {
    setFehler(false);
    // Das Fenster SOFORT oeffnen: Nach dem Warten auf den Link sperrte der Browser es als Popup.
    const fenster = window.open('', '_blank');
    const url = await dokumentLink(d.pfad);
    if (url && fenster) {
      fenster.opener = null;
      fenster.location.href = url;
    } else {
      fenster?.close();
      setFehler(true);
    }
  };

  const herunterladen = async (d: BeraterDokument) => {
    setFehler(false);
    const url = await dokumentLink(d.pfad, d.name);
    if (!url) { setFehler(true); return; }
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.click();
  };

  return (
    <div className="ui-innen mt-2 space-y-3 p-3">
      {ARTEN.filter((art) => dokumente.some((d) => d.art === art)).map((art) => (
        <div key={art}>
          <p className="text-xs font-medium text-ui-schiefer">{DOKUMENT_ART_TEXT[art]}</p>
          <ul className="mt-1 space-y-1.5">
            {dokumente.filter((d) => d.art === art).map((d) => (
              <li key={d.pfad} className="flex items-center gap-2 text-sm">
                {/* Die Art der Datei zeigt das Symbol, nicht eine Farbe. */}
                {d.typ === 'application/pdf'
                  ? <FileText className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
                  : <BildSymbol className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-ui-tinte">{d.name}</span>
                <span className="hidden shrink-0 text-xs tabular-nums text-ui-schiefer sm:inline">{groesse(d.groesse)}</span>
                <button type="button" onClick={() => void ansehen(d)} aria-label={`${d.name} ansehen`} className={KNOPF_KLEIN}>
                  <Eye className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Ansehen</span>
                </button>
                <button type="button" onClick={() => void herunterladen(d)} aria-label={`${d.name} herunterladen`} className={KNOPF_KLEIN}>
                  <Download className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Laden</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {fehler && (
        <p role="alert" className="text-xs text-rose-700">Die Unterlage ließ sich gerade nicht öffnen — bitte noch einmal versuchen.</p>
      )}
    </div>
  );
}

export function CheckAnfragen({ onUebernommen, onKonto }: {
  /** Nach „In den Rechner uebernehmen" — etwa zur Etappe mit den Angaben */
  onUebernommen?: () => void;
  /** Das Konto oeffnen, um die uebernommenen Angaben dort zu sichern */
  onKonto?: () => void;
} = {}) {
  const { liste, dokumente, laedt, meldung, laden, anlegen, uebernehmen, loeschen, meldungLoeschen } = useCheckAnfragen();
  const [offeneUnterlagen, setOffeneUnterlagen] = useState<string | null>(null);
  const setze = useSzenario((s) => s.setze);
  const email = useAuth((s) => s.email);
  const [kunde, setKunde] = useState('');
  const [neu, setNeu] = useState<CheckAnfrage | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [uebernommen, setUebernommen] = useState<string | null>(null);

  const kopieren = async (code: string) => {
    try {
      await navigator.clipboard.writeText(checkLink(code));
      setKopiert(code);
      setTimeout(() => setKopiert((k) => (k === code ? null : k)), 2000);
    } catch { /* Zwischenablage gesperrt — der Link steht ja im Feld */ }
  };

  const mail = (a: CheckAnfrage) => {
    const betreff = 'Ihr Vorsorge-Check';
    const text = `Guten Tag${a.kunde ? ` ${a.kunde}` : ''},\n\n`
      + 'für unser Gespräch zu Ihrer Altersvorsorge bitte ich Sie, Ihre Angaben vorab über den '
      + 'folgenden Link zu erfassen. Die Seite sagt Ihnen bei jedem Schritt, welche Unterlage Sie '
      + 'dafür brauchen — statt abzutippen, können Sie auch ein Foto oder einen Scan hochladen. '
      + 'Ein Konto ist nicht nötig.\n\n'
      + `${checkLink(a.code)}\n\n`
      + `Der Link ist bis zum ${datum(a.gueltigBis)} gültig und lässt sich einmal absenden.\n\n`
      + 'Viele Grüße';
    return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  };

  /* Der Stand als Punkt und Wort wie bei den Beratungen: eingegangen voll, offen leise, abgelaufen als Ring. */
  const status = (a: CheckAnfrage) => {
    if (a.eingang) return { text: `Eingegangen am ${datum(a.eingang.eingegangenAm)}`, art: 'erledigt' as const };
    if (new Date(a.gueltigBis).getTime() < Date.now()) return { text: 'Abgelaufen', art: 'vorbei' as const };
    return { text: `Offen bis ${datum(a.gueltigBis)}`, art: 'offen' as const };
  };

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
        Schicken Sie Ihrem Kunden einen persönlichen Link. Er erfasst seine Angaben zu Hause,
        Schritt für Schritt und ohne Konto, und kann Unterlagen als Foto oder Scan hochladen statt
        abzutippen — alles landet nur bei Ihnen.
        {email && (
          <> Sobald ein Kunde absendet, bekommen Sie eine E-Mail an <strong>{email}</strong>.</>
        )}
        {' '}Eingegangene Angaben und Unterlagen werden nach <strong>90 Tagen</strong> automatisch gelöscht.
      </p>

      {meldung && (
        <div role="status" className={`flex items-start justify-between gap-3 ${
          meldung.art === 'ok' ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER
        }`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={meldungLoeschen} className="text-xs font-medium underline underline-offset-2">OK</button>
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const a = await anlegen(kunde);
          if (a) { setNeu(a); setKunde(''); }
        }}
      >
        <label className="sr-only" htmlFor="check-kunde">Name des Kunden</label>
        <input
          id="check-kunde"
          value={kunde}
          onChange={(e) => setKunde(e.target.value)}
          maxLength={120}
          placeholder="Name des Kunden (nur für Sie sichtbar)"
          className={`${FELD} min-w-0 flex-1`}
        />
        <button type="submit" className={KNOPF}>
          <Link2 className="h-4 w-4" aria-hidden /> Link erstellen
        </button>
      </form>

      {neu && (
        /* Der neue Link mit dem Rand in Cyan — der eine Akzent statt eines gruenen Kastens. */
        <div className="ui-innen p-4">
          <p className="text-sm font-medium text-ui-tinte">
            Link{neu.kunde ? ` für ${neu.kunde}` : ''} — gültig bis {datum(neu.gueltigBis)}, einmal nutzbar:
          </p>
          <div className="mt-2">
            <LinkFeld link={checkLink(neu.code)} neu beschriftung="Link für den Kunden" />
          </div>
          <a href={mail(neu)} className={`mt-2 ${KNOPF_KLEIN}`}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> Per E-Mail senden
          </a>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-medium text-ui-tinte">
            Angefordert <span className="font-normal text-ui-schiefer">({liste.length})</span>
          </h3>
          <button type="button" onClick={() => void laden()} aria-label="Liste aktualisieren" className={SYMBOL_KNOPF}>
            <RefreshCw className={`h-4 w-4 ${laedt ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>

        {liste.length === 0 ? (
          <p className="mt-2 rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-4 text-center text-sm text-ui-schiefer">
            Noch keine Anfragen.
          </p>
        ) : (
          /* Zeilen mit Haarlinien wie die Liste der Beratungen. */
          <ul className="mt-1 divide-y divide-ui-linie border-b border-ui-linie">
            {liste.map((a) => {
              const s = status(a);
              const offen = !a.eingang && new Date(a.gueltigBis).getTime() >= Date.now();
              const unterlagen = dokumente[a.code] ?? [];
              const zeigeUnterlagen = offeneUnterlagen === a.code;
              return (
                <li key={a.code} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-tinte">{a.kunde || 'ohne Namen'}</span>
                    <Stand art={s.art}>{s.text}</Stand>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {a.eingang && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Die aktuellen Eingaben im Rechner werden durch die Angaben des Kunden ersetzt. Fortfahren?')) return;
                          const sz = await uebernehmen(a.code);
                          if (sz) { setze(() => sz); setUebernommen(a.code); onUebernommen?.(); }
                        }}
                        className={KNOPF_KLEIN_HAUPT}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden /> In den Rechner übernehmen
                      </button>
                    )}
                    {offen && (
                      <>
                        <button type="button" onClick={() => void kopieren(a.code)} className={KNOPF_KLEIN}>
                          {kopiert === a.code ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                          {kopiert === a.code ? 'Kopiert' : 'Link kopieren'}
                        </button>
                        <a href={mail(a)} className={KNOPF_KLEIN}>
                          <Mail className="h-3.5 w-3.5" aria-hidden /> E-Mail
                        </a>
                      </>
                    )}
                    {unterlagen.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOffeneUnterlagen(zeigeUnterlagen ? null : a.code)}
                        aria-expanded={zeigeUnterlagen}
                        className={KNOPF_KLEIN}
                      >
                        <Paperclip className="h-3.5 w-3.5" aria-hidden />
                        {unterlagen.length} Unterlage{unterlagen.length > 1 ? 'n' : ''}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${zeigeUnterlagen ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                    )}
                    <span className="flex-1" />
                    <button type="button"
                      onClick={() => {
                        if (a.eingang && !window.confirm(unterlagen.length > 0
                          ? `Die eingereichten Angaben und ${unterlagen.length} Unterlage${unterlagen.length > 1 ? 'n' : ''} werden endgültig gelöscht. Fortfahren?`
                          : 'Die eingereichten Angaben werden endgültig gelöscht. Fortfahren?')) return;
                        void loeschen(a.code);
                      }}
                      aria-label={`Anfrage ${a.kunde || 'ohne Namen'} löschen`}
                      className={SYMBOL_LOESCHEN}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {/*
                    Nach der Uebernahme erinnern, dass die Kundendaten noch auf
                    dem Server liegen: Erst sichern, dann den Eingang loeschen.
                  */}
                  {zeigeUnterlagen && unterlagen.length > 0 && <Unterlagen dokumente={unterlagen} />}
                  {uebernommen === a.code && (
                    <p role="status" className="ui-innen mt-2 px-3 py-2 text-xs leading-relaxed text-ui-tinte">
                      Übernommen. Sichern Sie die Angaben im Konto unter „Als neues speichern“ und
                      löschen Sie danach diesen Eingang — er wird nicht mehr gebraucht.
                      {unterlagen.length > 0 && ' Unterlagen, die Sie behalten möchten, laden Sie vorher herunter — sie gehen mit dem Eingang.'}
                      {onKonto && (
                        <>
                          {' '}
                          <button type="button" onClick={onKonto} className="font-medium underline underline-offset-2">
                            Konto öffnen
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
