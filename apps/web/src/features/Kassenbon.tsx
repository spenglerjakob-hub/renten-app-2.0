import type { ProjektionsErgebnis, Jahreszeile } from '@renten/engine';
import { Karte, euro, prozent } from '../components/Feld';

function Zeile({ links, rechts, klein }: { links: string; rechts: string; klein?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${klein ? 'text-xs text-slate-500' : 'text-sm'}`}>
      <span className="truncate">{links}</span>
      <span className="shrink-0 font-semibold tabular-nums">{rechts}</span>
    </div>
  );
}

export function Kassenbon({
  ergebnis, kaufkraftHeute,
}: { ergebnis: ProjektionsErgebnis; kaufkraftHeute: boolean }) {
  const zeile: Jahreszeile | undefined =
    ergebnis.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr) ??
    ergebnis.zeilen.find((z) => z.vollstaendigImRuhestand);

  if (!zeile) {
    return <Karte titel="Ergebnis"><p className="text-sm text-slate-500">Noch keine auswertbaren Daten.</p></Karte>;
  }

  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const w = (n: number) => euro((n / 12) * f);

  const nachSchicht = [1, 2, 3].map((sch) => ({
    schicht: sch,
    posten: zeile.posten.filter((p) => p.schicht === sch && p.nettoJahr !== 0),
    netto: zeile.posten.filter((p) => p.schicht === sch).reduce((s, p) => s + p.nettoJahr, 0),
  }));

  const luecke = zeile.zielNettoMonat - zeile.nettoMonat;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Karte titel={`Bedarf ${zeile.jahr}`}>
          <p className="text-2xl font-bold tabular-nums">{euro(zeile.zielNettoMonat * f)}</p>
          <p className="mt-1 text-xs text-slate-500">pro Monat</p>
        </Karte>
        <Karte titel="Versorgungslücke" klasse={luecke > 0 ? 'border-rose-200' : 'border-emerald-200'}>
          <p className={`text-2xl font-bold tabular-nums ${luecke > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {luecke > 0 ? euro(luecke * f) : 'Gedeckt'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {luecke > 0 ? `${prozent(zeile.nettoMonat / zeile.zielNettoMonat, 0)} des Ziels erreicht` : 'Ziel erreicht'}
          </p>
        </Karte>
      </div>

      <Karte
        titel={`Haushaltsnetto im Jahr ${zeile.jahr}`}
        kopfzeile={<span className="text-xs text-slate-500">{kaufkraftHeute ? 'Kaufkraft heute' : 'nominal'}</span>}
      >
        <div className="space-y-4">
          {nachSchicht.map(({ schicht, posten, netto }) =>
            posten.length === 0 ? null : (
              <div key={schicht}>
                <div className="mb-2 flex items-baseline justify-between border-b border-slate-100 pb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Schicht {schicht}</h3>
                  <span className="text-sm font-bold tabular-nums">{w(netto)}</span>
                </div>
                <div className="space-y-2">
                  {posten.map((p) => (
                    <div key={p.id} className="rounded-md bg-slate-50 px-3 py-2">
                      <Zeile links={p.bezeichnung} rechts={w(p.nettoJahr)} />
                      <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-xs text-slate-500">
                        <span>Brutto {w(p.bruttoJahr)}</span>
                        <span className="text-rose-600">
                          KV/PV {w(p.kvPvJahr)} · Steuer {w(p.steuerJahr)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}

          <div className="flex items-baseline justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
            <span className="font-bold">Gesamt-Netto</span>
            <span className="text-xl font-bold tabular-nums">{w(zeile.nettoGesamt)}</span>
          </div>
        </div>
      </Karte>

      <Karte titel="Steuer und Abgaben">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Zu versteuerndes Einkommen</dt>
            <dd className="text-lg font-bold tabular-nums">{euro(zeile.zve * f)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Steuerfrei (Freibetrag)</dt>
            <dd className="text-lg font-bold tabular-nums text-emerald-600">
              {euro(ergebnis.freibetraege.reduce((s, x) => s + x.wert.jahresbetrag, 0) * f)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Durchschnittssatz</dt>
            <dd className="text-lg font-bold tabular-nums">{prozent(zeile.durchschnittssatz)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Grenzsteuersatz</dt>
            <dd className="text-lg font-bold tabular-nums text-indigo-600">{prozent(zeile.grenzsatz)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Der <strong>Durchschnittssatz</strong> beschreibt die Gesamtbelastung. Für die Frage, ob sich
          eine zusätzliche Einzahlung lohnt, ist allein der <strong>Grenzsteuersatz</strong> maßgeblich —
          er gilt für den nächsten verdienten Euro.
        </p>

        {ergebnis.freibetraege.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {ergebnis.freibetraege.map((fb) => (
              <p key={fb.personId} className="text-xs text-slate-600">
                <strong>Person {fb.personId}:</strong>{' '}
                {fb.art === 'rente'
                  ? `Rentenfreibetrag ${euro(fb.wert.jahresbetrag)} pro Jahr (Besteuerungsanteil ${prozent(fb.wert.besteuerungsanteil ?? 0, 1)}, Kohorte ${fb.wert.kohortenjahr}).`
                  : `Versorgungsfreibetrag ${euro(fb.wert.jahresbetrag)} pro Jahr inkl. Zuschlag (Kohorte ${fb.wert.kohortenjahr}).`}{' '}
                Dieser Betrag bleibt lebenslang unverändert, während die Bezüge steigen.
              </p>
            ))}
          </div>
        )}
      </Karte>
    </div>
  );
}
