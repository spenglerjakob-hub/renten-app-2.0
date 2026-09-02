import {
  BUNDESLAENDER, BESOLDUNGSGRUPPEN, besoldungstabelle,
  grvVollerBeitragJahr, parameterFuer,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { ZahlFeld, AuswahlFeld, Schalter, euro } from '../components/Feld';

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

/**
 * Vorschlag fuer den GRV-Beitrag: der volle Satz auf den Gewinn bis zur
 * Beitragsbemessungsgrenze — was ein Pflichtversicherter zahlt.
 *
 * Der Rechtsstand kommt aus der Registry, damit hier kein Satz und keine
 * Grenze abgeschrieben steht.
 */
function vorschlagBeitragMonat(gewinnMonat: number): number {
  const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });
  return grvVollerBeitragJahr(Math.max(0, gewinnMonat) * 12, p) / 12;
}

type Einkommen = SzenarioParsed['einkommenHeute'];

/**
 * Eingabefelder fuer ein Erwerbseinkommen.
 *
 * Ausgelagert, weil dieselben Felder an drei Stellen gebraucht werden: fuer
 * Person A in den Basisdaten, fuer den Partner ebendort und im Dialog, der
 * beim Umschalten auf "Verheiratet" erscheint.
 */
export function EinkommenFelder({
  wert, onChange, spalten = 3,
}: {
  wert: Einkommen;
  onChange: (p: Partial<Einkommen>) => void;
  spalten?: 2 | 3;
}) {
  const belegt = besoldungstabelle(wert.besoldungsland, new Date().getFullYear()).belegt;

  return (
    <>
      <div className={`grid gap-3 ${spalten === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <AuswahlFeld
          label="Art"
          wert={wert.modus}
          onChange={(v) => onChange({
            modus: v,
            // Ein Gewinn ist ein Jahresbetrag durch zwoelf — 13 Gehaelter aus
            // einer vorherigen Angestellten-Eingabe wuerden ihn sonst
            // stillschweigend um ein Dreizehntel erhoehen.
            ...(v === 'selbststaendig' ? { auszahlungen: 12 } : {}),
          })}
          optionen={[
            { wert: 'brutto', text: 'Angestellt (Brutto)' },
            { wert: 'netto', text: 'Angestellt (Netto)' },
            { wert: 'besoldung', text: 'Beamter (Besoldung)' },
            { wert: 'selbststaendig', text: 'Selbstständig (Gewinn)' },
          ]}
        />
        {wert.modus === 'selbststaendig' ? (
          <ZahlFeld
            label="Gewinn monatlich"
            wert={wert.betrag}
            onChange={(n) => onChange({ betrag: n })}
            einheit="€"
            hilfe="Gewinn vor Steuern und Sozialabgaben — Betriebsausgaben sind bereits ab."
          />
        ) : wert.modus !== 'besoldung' ? (
          <>
            <ZahlFeld label="Betrag monatlich" wert={wert.betrag}
              onChange={(n) => onChange({ betrag: n })} einheit="€" />
            <AuswahlFeld
              label="Auszahlungen pro Jahr"
              wert={String(wert.auszahlungen)}
              onChange={(v) => onChange({ auszahlungen: Number(v) })}
              optionen={[
                { wert: '12', text: '12 Gehälter' },
                { wert: '12.5', text: '12,5 (halbes 13.)' },
                { wert: '13', text: '13 Gehälter' },
                { wert: '14', text: '14 Gehälter' },
              ]}
            />
          </>
        ) : (
          <>
            <AuswahlFeld label="Besoldungsgruppe" wert={wert.besoldungsgruppe}
              onChange={(v) => onChange({ besoldungsgruppe: v })}
              optionen={BESOLDUNGSGRUPPEN.map((g) => ({ wert: g as string, text: g }))} />
            <AuswahlFeld label="Erfahrungsstufe" wert={String(wert.besoldungsstufe)}
              onChange={(v) => onChange({ besoldungsstufe: Number(v) })}
              optionen={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ wert: String(n), text: `Stufe ${n}` }))} />
            <AuswahlFeld label="Dienstherr" wert={wert.besoldungsland}
              onChange={(v) => onChange({ besoldungsland: v })} optionen={laenderOptionen} />
          </>
        )}
      </div>

      {/*
        Ein Schalter plus ein Beitragsfeld deckt beide Faelle: Pflichtversicherte
        (Handwerker, Kuenstlersozialkasse) lassen die Vorbelegung mit dem vollen
        Satz stehen, freiwillig Versicherte tragen ihren gewaehlten Betrag ein.
        Die Unterscheidung "pflicht oder freiwillig" koennen viele Nutzer selbst
        nicht sicher treffen — ihren Beitrag kennen sie.
      */}
      {wert.modus === 'selbststaendig' && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <Schalter
            label="Zahlt in die gesetzliche Rentenversicherung ein"
            wert={wert.grvPflicht}
            onChange={(b) => onChange({
              grvPflicht: b,
              // Beim Einschalten mit dem vollen Satz vorbelegen, sofern noch
              // nichts eingetragen ist — aber nie einen eigenen Wert
              // ueberschreiben.
              grvBeitragMonat: b && wert.grvBeitragMonat <= 0
                ? Math.round(vorschlagBeitragMonat(wert.betrag))
                : wert.grvBeitragMonat,
            })}
          />
          {wert.grvPflicht ? (
            <div className="mt-2">
              <ZahlFeld
                label="Eigener Beitrag monatlich"
                wert={wert.grvBeitragMonat}
                onChange={(n) => onChange({ grvBeitragMonat: n })}
                einheit="€"
                hilfe={`Sie tragen ihn allein — es gibt keinen Arbeitgeberanteil. Voller Satz auf Ihren Gewinn wären ${euro(vorschlagBeitragMonat(wert.betrag))}.`}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Die meisten Selbstständigen sind nicht pflichtversichert. Das hat einen
              steuerlichen Vorteil: Der Höchstbetrag für Altersvorsorgeaufwendungen ist dann
              nicht durch Rentenbeiträge belegt und steht einer Basisrente in voller Höhe
              zur Verfügung.
            </p>
          )}
        </div>
      )}

      {wert.modus === 'besoldung' && !belegt && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Näherung:</strong> Für {wert.besoldungsland} ist noch keine amtliche
          Besoldungstabelle hinterlegt. Der Wert wird aus einer linearen Näherung geschätzt und kann
          um mehrere hundert Euro im Monat abweichen.
        </p>
      )}
    </>
  );
}
