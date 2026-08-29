import { BUNDESLAENDER, BESOLDUNGSGRUPPEN } from '@renten/engine';
import { RotateCcw } from 'lucide-react';
import { useSzenario, regelaltersgrenzeText } from '../store/szenario';
import { Rentenschaetzer } from './Rentenschaetzer';
import { EinkommenFelder } from './EinkommenFelder';
import { ZahlFeld, TextFeld, DatumFeld, AuswahlFeld, Schalter, Abschnitt, euro } from '../components/Feld';

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

export function Basisdaten({ onEhepartnerDialog }: { onEhepartnerDialog?: () => void } = {}) {
  const s = useSzenario((x) => x.szenario);
  const { setzeHaushalt, setzeEinkommen, setzePerson, partnerHinzufuegen } = useSzenario();
  const setzeEinkommenPartner = useSzenario((x) => x.setzeEinkommenPartner);
  const setzeEinkommenGetrennt = useSzenario((x) => x.setzeEinkommenGetrennt);
  const rentenbeginnZuruecksetzen = useSzenario((x) => x.rentenbeginnZuruecksetzen);

  return (
    <div className="space-y-4">
      <Abschnitt titel="Haushalt">
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
            onChange={(b) => {
              setzeHaushalt({ verheiratet: b });
              if (b) { partnerHinzufuegen(); onEhepartnerDialog?.(); }
            }} />
          <Schalter label="Kirchensteuerpflichtig" wert={s.haushalt.kirchensteuer}
            onChange={(b) => setzeHaushalt({ kirchensteuer: b })} />
        </div>
      </Abschnitt>

      <Abschnitt titel={s.einkommenGetrennt ? 'Einkommen — Person A' : 'Heutiges Einkommen'}>
        <EinkommenFelder wert={s.einkommenHeute} onChange={setzeEinkommen} />

        {s.haushalt.verheiratet && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <Schalter
              label="Einkommen je Partner getrennt erfassen"
              wert={s.einkommenGetrennt}
              onChange={setzeEinkommenGetrennt}
            />
            <p className="mt-1 text-xs text-slate-500">
              {s.einkommenGetrennt
                ? 'Die Sozialabgaben werden je Person mit eigener Beitragsbemessungsgrenze gerechnet.'
                : 'Der Haushaltsbetrag wird für die Sozialabgaben hälftig auf beide verteilt.'}
            </p>
          </div>
        )}
      </Abschnitt>

      {s.haushalt.verheiratet && s.einkommenGetrennt && (
        <Abschnitt titel="Einkommen — Person B">
          <EinkommenFelder wert={s.einkommenPartner} onChange={setzeEinkommenPartner} />
        </Abschnitt>
      )}

      {s.personen.map((p) => (
        <Abschnitt key={p.id} titel={`Person ${p.id}${p.name ? ` — ${p.name}` : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFeld label="Name" wert={p.name} onChange={(v) => setzePerson(p.id, { name: v })}
              platzhalter={`Person ${p.id}`} />
            <AuswahlFeld label="Versorgungsart" wert={p.art}
              onChange={(v) => setzePerson(p.id, { art: v })}
              optionen={[{ wert: 'grv', text: 'Gesetzliche Rente' }, { wert: 'pension', text: 'Beamtenpension' }]} />
            <DatumFeld label="Geburtsdatum" wert={p.geburtsdatum}
              onChange={(v) => setzePerson(p.id, { geburtsdatum: v })}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld." />
            <DatumFeld
              label="Rentenbeginn"
              wert={p.rentenbeginn}
              onChange={(v) => setzePerson(p.id, { rentenbeginn: v })}
              hilfe={
                p.rentenbeginnManuell
                  ? 'Von Hand gesetzt.'
                  : `Automatisch: Regelaltersgrenze ${regelaltersgrenzeText(p.geburtsdatum) ?? '67 Jahre'}.`
              }
              zusatz={p.rentenbeginnManuell ? (
                <button
                  type="button"
                  onClick={() => rentenbeginnZuruecksetzen(p.id)}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Auf Regelaltersgrenze zurücksetzen
                </button>
              ) : null}
            />
            {p.art === 'grv' ? (
              <>
                <ZahlFeld label="Heutiger Rentenanspruch monatlich" wert={p.grvBruttoHeute}
                  onChange={(n) => setzePerson(p.id, { grvBruttoHeute: n })} einheit="€"
                  hilfe="Wert aus der Renteninformation: bisher erreichter Anspruch." />
                <Rentenschaetzer personId={p.id} />
              </>
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
        </Abschnitt>
      ))}

      {!s.haushalt.verheiratet && s.personen.length === 1 && (
        <p className="text-xs text-slate-500">
          Für einen zweiten Haushaltspartner oben &bdquo;Verheiratet&ldquo; aktivieren.
        </p>
      )}
    </div>
  );
}
