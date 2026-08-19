import { BUNDESLAENDER, BESOLDUNGSGRUPPEN, besoldungstabelle } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Schalter, Karte, euro } from '../components/Feld';

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

export function Basisdaten() {
  const s = useSzenario((x) => x.szenario);
  const { setzeHaushalt, setzeAnnahmen, setzeEinkommen, setzePerson, partnerHinzufuegen } = useSzenario();

  const besoldungBelegt = besoldungstabelle(s.einkommenHeute.besoldungsland, new Date().getFullYear()).belegt;

  return (
    <div className="space-y-4">
      <Karte titel="Haushalt">
        <div className="grid gap-3 sm:grid-cols-2">
          <AuswahlFeld
            label="Bundesland (Kirchensteuer, Besoldung)"
            wert={s.haushalt.bundesland}
            onChange={(v) => setzeHaushalt({ bundesland: v })}
            optionen={laenderOptionen}
          />
          <AuswahlFeld
            label="Krankenversicherung im Alter"
            wert={s.haushalt.kvStatus}
            onChange={(v) => setzeHaushalt({ kvStatus: v })}
            optionen={[
              { wert: 'kvdr', text: 'Gesetzlich pflichtversichert (KVdR)' },
              { wert: 'freiwillig', text: 'Gesetzlich freiwillig versichert' },
              { wert: 'pkv', text: 'Privat versichert' },
            ]}
          />
          {s.haushalt.kvStatus === 'pkv' && (
            <ZahlFeld
              label="PKV-Beitrag monatlich"
              wert={s.haushalt.pkvPraemieMonat}
              onChange={(n) => setzeHaushalt({ pkvPraemieMonat: n })}
              einheit="€"
            />
          )}
          <ZahlFeld
            label="Zielnetto im Alter (Kaufkraft heute)"
            wert={s.haushalt.zielNettoHeute}
            onChange={(n) => setzeHaushalt({ zielNettoHeute: n })}
            einheit="€"
          />
          <ZahlFeld
            label="Kinder unter 25"
            wert={s.haushalt.kinderUnter25}
            onChange={(n) => setzeHaushalt({ kinderUnter25: n, hatKinder: n > 0 })}
            max={15}
            hilfe="Ab dem 2. Kind sinkt der Pflegeversicherungsbeitrag."
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <Schalter label="Verheiratet (Splittingtarif)" wert={s.haushalt.verheiratet}
            onChange={(b) => { setzeHaushalt({ verheiratet: b }); if (b) partnerHinzufuegen(); }} />
          <Schalter label="Kirchensteuerpflichtig" wert={s.haushalt.kirchensteuer}
            onChange={(b) => setzeHaushalt({ kirchensteuer: b })} />
        </div>
      </Karte>

      <Karte titel="Heutiges Einkommen">
        <div className="grid gap-3 sm:grid-cols-3">
          <AuswahlFeld
            label="Art"
            wert={s.einkommenHeute.modus}
            onChange={(v) => setzeEinkommen({ modus: v })}
            optionen={[
              { wert: 'brutto', text: 'Angestellt (Brutto)' },
              { wert: 'netto', text: 'Angestellt (Netto)' },
              { wert: 'besoldung', text: 'Beamter (Besoldung)' },
            ]}
          />
          {s.einkommenHeute.modus !== 'besoldung' ? (
            <>
              <ZahlFeld label="Betrag monatlich" wert={s.einkommenHeute.betrag}
                onChange={(n) => setzeEinkommen({ betrag: n })} einheit="€" />
              <AuswahlFeld
                label="Auszahlungen pro Jahr"
                wert={String(s.einkommenHeute.auszahlungen)}
                onChange={(v) => setzeEinkommen({ auszahlungen: Number(v) })}
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
              <AuswahlFeld label="Besoldungsgruppe" wert={s.einkommenHeute.besoldungsgruppe}
                onChange={(v) => setzeEinkommen({ besoldungsgruppe: v })}
                optionen={BESOLDUNGSGRUPPEN.map((g) => ({ wert: g as string, text: g }))} />
              <AuswahlFeld label="Erfahrungsstufe" wert={String(s.einkommenHeute.besoldungsstufe)}
                onChange={(v) => setzeEinkommen({ besoldungsstufe: Number(v) })}
                optionen={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ wert: String(n), text: `Stufe ${n}` }))} />
              <AuswahlFeld label="Dienstherr" wert={s.einkommenHeute.besoldungsland}
                onChange={(v) => setzeEinkommen({ besoldungsland: v })} optionen={laenderOptionen} />
            </>
          )}
        </div>

        {s.einkommenHeute.modus === 'besoldung' && !besoldungBelegt && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Näherung:</strong> Für {s.einkommenHeute.besoldungsland} ist noch keine amtliche
            Besoldungstabelle hinterlegt. Der Wert wird aus einer linearen Näherung geschätzt und kann
            um mehrere hundert Euro im Monat abweichen.
          </p>
        )}
      </Karte>

      <Karte titel="Annahmen">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProzentFeld label="Inflation p. a." wert={s.annahmen.inflation}
            onChange={(n) => setzeAnnahmen({ inflation: n })}
            hilfe="Nur für die Umrechnung auf heutige Kaufkraft." />
          <ProzentFeld label="Rentendynamik p. a." wert={s.annahmen.rentendynamik}
            onChange={(n) => setzeAnnahmen({ rentendynamik: n })}
            hilfe="Jährliche Anpassung der Renten und Pensionen." />
          <ProzentFeld label="Steuertarif-Index p. a." wert={s.annahmen.tarifIndex}
            onChange={(n) => setzeAnnahmen({ tarifIndex: n })}
            hilfe="0 % = kalte Progression, gleich der Rentendynamik = voller Ausgleich." />
          <ProzentFeld label="Gehaltsdynamik p. a." wert={s.annahmen.gehaltsdynamik}
            onChange={(n) => setzeAnnahmen({ gehaltsdynamik: n })} />
        </div>
      </Karte>

      {s.personen.map((p) => (
        <Karte key={p.id} titel={`Person ${p.id}${p.name ? ` — ${p.name}` : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFeld label="Name" wert={p.name} onChange={(v) => setzePerson(p.id, { name: v })}
              platzhalter={`Person ${p.id}`} />
            <AuswahlFeld label="Versorgungsart" wert={p.art}
              onChange={(v) => setzePerson(p.id, { art: v })}
              optionen={[{ wert: 'grv', text: 'Gesetzliche Rente' }, { wert: 'pension', text: 'Beamtenpension' }]} />
            <TextFeld label="Geburtsdatum" wert={p.geburtsdatum}
              onChange={(v) => setzePerson(p.id, { geburtsdatum: v })} platzhalter="TT.MM.JJJJ" />
            <TextFeld label="Rentenbeginn" wert={p.rentenbeginn}
              onChange={(v) => setzePerson(p.id, { rentenbeginn: v })} platzhalter="TT.MM.JJJJ" />
            {p.art === 'grv' ? (
              <ZahlFeld label="Heutiger Rentenanspruch monatlich" wert={p.grvBruttoHeute}
                onChange={(n) => setzePerson(p.id, { grvBruttoHeute: n })} einheit="€"
                hilfe="Wert aus der Renteninformation: bisher erreichter Anspruch." />
            ) : (
              <>
                <AuswahlFeld label="End-Besoldungsgruppe" wert={p.besoldungsgruppe}
                  onChange={(v) => setzePerson(p.id, { besoldungsgruppe: v })}
                  optionen={BESOLDUNGSGRUPPEN.map((g) => ({ wert: g as string, text: g }))} />
                <ZahlFeld label="Ruhegehaltssatz" wert={p.ruhegehaltssatz}
                  onChange={(n) => setzePerson(p.id, { ruhegehaltssatz: n })} max={71.75} einheit="%"
                  hilfe="Maximal 71,75 % (§ 14 BeamtVG)." />
              </>
            )}
          </div>
        </Karte>
      ))}

      {!s.haushalt.verheiratet && s.personen.length === 1 && (
        <p className="text-xs text-slate-500">
          Für einen zweiten Haushaltspartner oben &bdquo;Verheiratet&ldquo; aktivieren.
        </p>
      )}
    </div>
  );
}
