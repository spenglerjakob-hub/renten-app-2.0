import {
  BUNDESLAENDER, BESOLDUNGSGRUPPEN, besoldungstabelle,
  grvVollerBeitragJahr, parameterFuer,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { ZahlFeld, AuswahlFeld, Schalter, euro } from '../components/Feld';
import { Wahl } from '../components/Frage';
import { Hinweis } from '../components/stil';
import { useAnsprache } from '../components/Ansprache';

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
const ARTEN = [
  { wert: 'brutto', text: 'Angestellt (Brutto)' },
  { wert: 'netto', text: 'Angestellt (Netto)' },
  { wert: 'besoldung', text: 'Beamter (Besoldung)' },
  { wert: 'selbststaendig', text: 'Selbstständig (Gewinn)' },
] as const;

export function EinkommenFelder({
  wert, onChange, spalten = 3, betrag, artAlsKnoepfe = false,
}: {
  wert: Einkommen;
  onChange: (p: Partial<Einkommen>) => void;
  spalten?: 2 | 3;
  /**
   * Die Art des Einkommens als vier Knoepfe ueber den Feldern statt als
   * Auswahlliste daneben — wo Platz ist und die Frage „Was verdienst du?“
   * im Mittelpunkt steht (Angaben im Rechner, Vorsorge-Check). Im
   * Vertrags-TÜV und im Fenster des Ehepartners bleibt die kompakte Liste.
   */
  artAlsKnoepfe?: boolean;
  /**
   * Der Betrag FEHLT noch (nur im Rechner, siehe `features/vorbelegung.ts`):
   * Das Feld steht leer; wird es geleert, fehlt die Angabe wieder.
   */
  betrag?: { leer: boolean; onLeeren: () => void };
}) {
  const belegt = besoldungstabelle(wert.besoldungsland, new Date().getFullYear()).belegt;
  // Das Einkommen einer Person: auch beim Paar „du“. Ohne Ansprache (Vorsorge-Check) wie bisher per Sie.
  const t = useAnsprache().einzeln;

  const setzeArt = (v: Einkommen['modus']) => onChange({
    modus: v,
    // Ein Gewinn ist ein Jahresbetrag durch zwoelf — 13 Gehaelter aus
    // einer vorherigen Angestellten-Eingabe wuerden ihn sonst
    // stillschweigend um ein Dreizehntel erhoehen.
    ...(v === 'selbststaendig' ? { auszahlungen: 12 } : {}),
  });
  // Mit den Knoepfen darueber stehen daneben nur noch die Betraege: zwei Felder, bei Beamten drei.
  const raster = artAlsKnoepfe
    ? (wert.modus === 'besoldung' && spalten === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')
    : (spalten === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2');

  return (
    <>
      {artAlsKnoepfe && (
        <div className="mb-4">
          <Wahl label="Art des Einkommens" wert={wert.modus} onChange={setzeArt} optionen={ARTEN} reihe />
        </div>
      )}
      <div className={`grid gap-3 ${raster}`}>
        {!artAlsKnoepfe && (
          <AuswahlFeld
            label="Art"
            wert={wert.modus}
            onChange={setzeArt}
            optionen={ARTEN}
          />
        )}
        {wert.modus === 'selbststaendig' ? (
          <ZahlFeld
            label="Gewinn monatlich"
            wert={wert.betrag}
            onChange={(n) => onChange({ betrag: n })}
            einheit="€"
            info="Der Gewinn vor Steuern und Sozialabgaben — die Betriebsausgaben sind bereits abgezogen."
            {...betrag}
          />
        ) : wert.modus !== 'besoldung' ? (
          <>
            {/*
              Im Netto-Modus rechnet der Rechner das Netto ueber die
              Jahressteuer auf das Brutto zurueck. Das Netto der
              Gehaltsabrechnung haengt aber an der Steuerklasse — bei III/V
              liegt der Monatsabzug neben der Jahressteuer.
            */}
            <ZahlFeld label="Betrag monatlich" wert={wert.betrag}
              onChange={(n) => onChange({ betrag: n })} einheit="€"
              {...betrag}
              // Ein Warnhinweis, keine Erklaerung: Er bleibt sichtbar, in einer Zeile. Die Begruendung steht im Info-Kaestchen.
              hilfe={wert.modus === 'netto' ? 'Bei Steuerklasse III/V besser das Brutto eintragen.' : undefined}
              info={wert.modus === 'netto'
                ? 'Gerechnet wird über die Jahressteuer. Das Netto der Gehaltsabrechnung hängt aber von der Steuerklasse ab — bei III/V oder Faktorverfahren liegt der monatliche Abzug neben der Jahressteuer.'
                : undefined} />
            <AuswahlFeld
              label="Auszahlungen pro Jahr"
              wert={String(wert.auszahlungen)}
              onChange={(v) => onChange({ auszahlungen: Number(v) })}
              info="Weihnachts- und Urlaubsgeld stecken in der Anzahl der Gehälter: Der Betrag daneben ist ein normaler Monat."
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
        <div className="ui-innen mt-3 p-3 sm:p-4">
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
            info="Die meisten Selbstständigen sind nicht pflichtversichert. Das hat einen steuerlichen Vorteil: Der Höchstbetrag für Altersvorsorgeaufwendungen ist dann nicht durch Rentenbeiträge belegt und steht einer Basisrente in voller Höhe zur Verfügung."
          />
          {wert.grvPflicht && (
            <div className="mt-2">
              <ZahlFeld
                label="Eigener Beitrag monatlich"
                wert={wert.grvBeitragMonat}
                onChange={(n) => onChange({ grvBeitragMonat: n })}
                einheit="€"
                info={`${t.w('Du trägst', undefined, 'Sie tragen')} ihn allein — es gibt keinen Arbeitgeberanteil. Voller Satz auf ${t.dein('en')} Gewinn wären ${euro(vorschlagBeitragMonat(wert.betrag))}.`}
              />
            </div>
          )}
        </div>
      )}

      {wert.modus === 'besoldung' && !belegt && (
        <Hinweis klasse="mt-3">
          <strong className="font-medium">Näherung:</strong> Für {wert.besoldungsland} ist noch keine amtliche
          Besoldungstabelle hinterlegt. Der Wert wird aus einer linearen Näherung geschätzt und kann
          um mehrere hundert Euro im Monat abweichen.
        </Hinweis>
      )}
    </>
  );
}
