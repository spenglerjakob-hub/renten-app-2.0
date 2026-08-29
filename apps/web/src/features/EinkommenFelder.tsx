import { BUNDESLAENDER, BESOLDUNGSGRUPPEN, besoldungstabelle } from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { ZahlFeld, AuswahlFeld } from '../components/Feld';

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

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
          onChange={(v) => onChange({ modus: v })}
          optionen={[
            { wert: 'brutto', text: 'Angestellt (Brutto)' },
            { wert: 'netto', text: 'Angestellt (Netto)' },
            { wert: 'besoldung', text: 'Beamter (Besoldung)' },
          ]}
        />
        {wert.modus !== 'besoldung' ? (
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
