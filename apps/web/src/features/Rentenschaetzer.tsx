import { useState } from 'react';
import { Calculator, CheckCircle } from 'lucide-react';
import {
  schaetzeEntgeltpunkte, parameterFuer, parseDatum, alterExakt, heute,
} from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, euro } from '../components/Feld';
import { KNOPF_ZWEIT } from '../components/stil';

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
        <p className="ui-innen p-3 text-xs leading-relaxed text-ui-schiefer">
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
        <span className="text-xs text-ui-schiefer">
          Rentenanspruch unbekannt?
        </span>
        <button
          type="button"
          onClick={() => setOffen((v) => !v)}
          aria-expanded={offen}
          className="inline-flex items-center gap-1.5 rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover print:hidden"
        >
          <Calculator className="h-3 w-3" aria-hidden /> {offen ? 'Schließen' : 'Schätzen'}
        </button>
      </div>

      {offen && (
        /* In der Innenflaeche wie die Ergebnisse in einer Vertragskarte — ohne eigene Farbe. */
        <div className="ui-innen p-3 sm:p-4 print:hidden">
          <h4 className="mb-3 text-sm font-medium text-ui-tinte">Karriere-Schätzer</h4>

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
              <dt className="text-xs text-ui-schiefer">Entgeltpunkte</dt>
              <dd className="text-lg font-medium tabular-nums text-ui-tinte">
                {schaetzung.entgeltpunkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ui-schiefer">Rente heutiger Wert</dt>
              <dd className="text-lg font-medium tabular-nums text-ui-tinte">
                {euro(betrag)} <span className="text-xs font-normal text-ui-schiefer">/ Monat</span>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={betrag <= 0}
            onClick={() => { setzePerson(personId, { grvBruttoHeute: betrag }); setOffen(false); }}
            className={`mt-4 w-full ${KNOPF_ZWEIT}`}
          >
            <CheckCircle className="h-4 w-4" aria-hidden /> ca. {euro(betrag)} übernehmen
          </button>

          <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
            {schaetzung.hinweis}
          </p>
        </div>
      )}
    </div>
  );
}
