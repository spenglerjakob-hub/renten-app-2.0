import { useState } from 'react';
import { Calculator, CheckCircle } from 'lucide-react';
import {
  schaetzeEntgeltpunkte, parameterFuer, parseDatum, alterExakt, heute,
} from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, euro } from '../components/Feld';

/**
 * KARRIERE-SCHAETZER
 *
 * Schaetzt den heutigen Rentenanspruch aus dem Bruttojahresgehalt, wie im
 * urspruenglichen Rechner: Berufsstart mit 22, Einstiegsgehalt 50 % des
 * heutigen, linearer Aufbau bis heute, danach konstant. Entgeltpunkte je Jahr
 * = Gehalt geteilt durch das Durchschnittsentgelt, gedeckelt an der
 * Beitragsbemessungsgrenze.
 *
 * WICHTIG — kein Doppelzaehlen: Der Wert kommt in HEUTIGER Kaufkraft und OHNE
 * Zu- oder Abschlaege. Beides gehoert hier nicht hinein, weil die Projektion
 * es anschliessend selbst anwendet: den Zugangsfaktor ueber `zugangsfaktor()`
 * und die Aufzinsung ueber die Rentendynamik. Lieferte der Schaetzer das mit,
 * zaehlte die Rechnung es zweimal.
 */
export function Rentenschaetzer({ personId }: { personId: 'A' | 'B' }) {
  const person = useSzenario((s) => s.szenario.personen.find((p) => p.id === personId));
  const tarifIndex = useSzenario((s) => s.szenario.annahmen.tarifIndex);
  const einkommen = useSzenario((s) => s.szenario.einkommenHeute);
  const setzePerson = useSzenario((s) => s.setzePerson);

  const [offen, setOffen] = useState(false);
  /*
    Bei einem Selbststaendigen ist das massgebliche "Entgelt" nicht sein
    Gewinn, sondern der Beitrag, den er zahlt — zurueckgerechnet in das
    Entgelt, das ihn ausgeloest haette. Wer den Mindestbeitrag zahlt, sammelt
    die Punkte eines Mindestbeitragszahlers und nicht die seines Gewinns.
  */
  const selbststaendig = einkommen.modus === 'selbststaendig';
  const p0 = parameterFuer(heute().jahr, { indexRate: tarifIndex });
  const [gehalt, setGehalt] = useState(() =>
    selbststaendig
      ? Math.round((einkommen.grvBeitragMonat * 12) / p0.rvSatzGesamt)
      : Math.round((einkommen.betrag || 4000) * (einkommen.auszahlungen || 12)),
  );

  if (!person) return null;

  /*
    Ohne Beitrag gibt es nichts zu schaetzen. Das stumm mit einem
    Gewinn-basierten Wert zu fuellen waere die schlimmere Variante: es saehe
    aus wie eine Auskunft.
  */
  if (selbststaendig && !einkommen.grvPflicht) {
    return (
      <div className="sm:col-span-2">
        <p className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-500">
          Sie zahlen nach Ihren Angaben nicht in die gesetzliche Rentenversicherung ein — es
          gibt hier also nichts zu schätzen. Ein Anspruch aus früheren Beitragsjahren steht in
          Ihrer Renteninformation und gehört in das Feld darüber.
        </p>
      </div>
    );
  }

  const geburt = parseDatum(person.geburtsdatum);
  const rentenbeginn = parseDatum(person.rentenbeginn);
  const jetzt = heute();

  const p = parameterFuer(jetzt.jahr, { indexRate: tarifIndex });
  const alterHeute = geburt ? alterExakt(geburt, jetzt) : 0;
  const alterBeiRente = geburt && rentenbeginn ? alterExakt(geburt, rentenbeginn) : 67;

  const schaetzung = schaetzeEntgeltpunkte(gehalt, alterHeute, alterBeiRente, p);
  const betrag = Math.round(schaetzung.monatsrenteHeutigeKaufkraft);

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Rentenanspruch unbekannt?
        </span>
        <button
          type="button"
          onClick={() => setOffen((v) => !v)}
          aria-expanded={offen}
          className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-200 print:hidden"
        >
          <Calculator className="h-3 w-3" aria-hidden /> {offen ? 'Schließen' : 'Schätzen'}
        </button>
      </div>

      {offen && (
        /*
          Weiss mit blauem Rand statt blauer Flaeche: die Eingabespalte liegt
          seit der Farbtrennung auf indigofarbenem Grund, und Blau darauf
          liegt so dicht daneben, dass der Kasten nur trueb wirkte statt
          eigenstaendig.
        */
        <div className="rounded-lg border-2 border-blue-200 bg-white p-2.5 shadow-sm sm:p-3 print:hidden">
          <h4 className="mb-2 text-[10px] font-bold uppercase text-blue-800">Karriere-Schätzer</h4>

          <ZahlFeld
            label={selbststaendig ? 'Beitragspflichtiges Entgelt im Jahr' : 'Heutiges Bruttojahresgehalt'}
            wert={gehalt}
            onChange={setGehalt}
            einheit="€"
            hilfe={selbststaendig
              ? `Aus Ihrem Beitrag zurückgerechnet (${euro(einkommen.grvBeitragMonat)} im Monat geteilt durch den Beitragssatz).`
              : undefined}
          />

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Entgeltpunkte
              </dt>
              <dd className="text-sm font-black tabular-nums text-slate-800">
                {schaetzung.entgeltpunkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Rente heutiger Wert
              </dt>
              <dd className="text-sm font-black tabular-nums text-blue-800">
                {euro(betrag)} <span className="text-xs font-normal">/ Monat</span>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={betrag <= 0}
            onClick={() => { setzePerson(personId, { grvBruttoHeute: betrag }); setOffen(false); }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-blue-600 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:py-2 sm:text-xs"
          >
            <CheckCircle className="h-3.5 w-3.5" aria-hidden /> ca. {euro(betrag)} übernehmen
          </button>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            {schaetzung.hinweis}
          </p>
        </div>
      )}
    </div>
  );
}
