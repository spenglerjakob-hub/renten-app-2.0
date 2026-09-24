import { useState } from 'react';
import { Copy, Check, Mail, Download, Trash2, RefreshCw, Link2 } from 'lucide-react';
import { useCheckAnfragen } from '../store/check-anfragen';
import { useSzenario } from '../store/szenario';
import { useAuth } from '../store/auth';
import { checkLink } from '../lib/check';
import type { CheckAnfrage } from '../lib/check';

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/**
 * „Vorsorge-Check anfordern" — die Seite des Beraters.
 *
 * Je Kunde ein eigener Link: einmal nutzbar, 30 Tage gueltig. Was der Kunde
 * einreicht, sieht nur das Konto, das den Link erzeugt hat — das regelt die
 * Datenbank, nicht diese Oberflaeche.
 */
export function CheckAnfragen() {
  const { liste, laedt, meldung, laden, anlegen, uebernehmen, loeschen, meldungLoeschen } = useCheckAnfragen();
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
      + 'dafür brauchen; ein Konto ist nicht nötig.\n\n'
      + `${checkLink(a.code)}\n\n`
      + `Der Link ist bis zum ${datum(a.gueltigBis)} gültig und lässt sich einmal absenden.\n\n`
      + 'Viele Grüße';
    return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  };

  const status = (a: CheckAnfrage) => {
    if (a.eingang) return { text: `Eingegangen am ${datum(a.eingang.eingegangenAm)}`, farbe: 'bg-emerald-100 text-emerald-800' };
    if (new Date(a.gueltigBis).getTime() < Date.now()) return { text: 'Abgelaufen', farbe: 'bg-slate-100 text-slate-500' };
    return { text: `Offen bis ${datum(a.gueltigBis)}`, farbe: 'bg-amber-100 text-amber-800' };
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate-600">
        Schicken Sie Ihrem Kunden einen persönlichen Link. Er erfasst seine Angaben zu Hause,
        Schritt für Schritt und ohne Konto — und sie landen nur bei Ihnen.
        {email && (
          <> Sobald ein Kunde absendet, bekommen Sie eine E-Mail an <strong>{email}</strong>.</>
        )}
      </p>

      {meldung && (
        <div role="status" className={`flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${
          meldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
        }`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={meldungLoeschen} className="text-xs underline">OK</button>
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
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white p-2 text-sm"
        />
        <button type="submit"
          className="flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          <Link2 className="h-4 w-4" aria-hidden /> Link erstellen
        </button>
      </form>

      {neu && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">
            Link{neu.kunde ? ` für ${neu.kunde}` : ''} — gültig bis {datum(neu.gueltigBis)}, einmal nutzbar:
          </p>
          <input
            readOnly
            value={checkLink(neu.code)}
            onFocus={(e) => e.target.select()}
            aria-label="Link für den Kunden"
            className="mt-1.5 w-full rounded-md border border-emerald-300 bg-white p-2 font-mono text-xs"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void kopieren(neu.code)}
              className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
              {kopiert === neu.code ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {kopiert === neu.code ? 'Kopiert' : 'Link kopieren'}
            </button>
            <a href={mail(neu)}
              className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
              <Mail className="h-3.5 w-3.5" aria-hidden /> Per E-Mail senden
            </a>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Angefordert ({liste.length})
          </h3>
          <button type="button" onClick={() => void laden()} aria-label="Liste aktualisieren"
            className="rounded p-1 text-slate-400 hover:text-slate-700">
            <RefreshCw className={`h-3.5 w-3.5 ${laedt ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>

        {liste.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500">
            Noch keine Anfragen.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {liste.map((a) => {
              const s = status(a);
              const offen = !a.eingang && new Date(a.gueltigBis).getTime() >= Date.now();
              return (
                <li key={a.code} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{a.kunde || 'ohne Namen'}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.farbe}`}>{s.text}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {a.eingang && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Die aktuellen Eingaben im Rechner werden durch die Angaben des Kunden ersetzt. Fortfahren?')) return;
                          const sz = await uebernehmen(a.code);
                          if (sz) { setze(() => sz); setUebernommen(a.code); }
                        }}
                        className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden /> In den Rechner übernehmen
                      </button>
                    )}
                    {offen && (
                      <>
                        <button type="button" onClick={() => void kopieren(a.code)}
                          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                          {kopiert === a.code ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                          {kopiert === a.code ? 'Kopiert' : 'Link kopieren'}
                        </button>
                        <a href={mail(a)}
                          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                          <Mail className="h-3.5 w-3.5" aria-hidden /> E-Mail
                        </a>
                      </>
                    )}
                    <span className="flex-1" />
                    <button type="button"
                      onClick={() => {
                        if (a.eingang && !window.confirm('Die eingereichten Angaben werden endgültig gelöscht. Fortfahren?')) return;
                        void loeschen(a.code);
                      }}
                      aria-label={`Anfrage ${a.kunde || 'ohne Namen'} löschen`}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {/*
                    Nach der Uebernahme erinnern, dass die Kundendaten noch auf
                    dem Server liegen: Erst sichern, dann den Eingang loeschen.
                  */}
                  {uebernommen === a.code && (
                    <p className="mt-1.5 text-xs leading-relaxed text-emerald-800">
                      Übernommen. Sichern Sie die Angaben oben unter „Als neues speichern“ und
                      löschen Sie danach diesen Eingang — er wird nicht mehr gebraucht.
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
