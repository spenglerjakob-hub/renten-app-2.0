import { BUNDESLAENDER, BESOLDUNGSGRUPPEN, parameterFuer, type ProjektionsErgebnis } from '@renten/engine';
import { RotateCcw, Target } from 'lucide-react';
import { useSzenario, regelaltersgrenzeText } from '../store/szenario';
import { Rentenschaetzer } from './Rentenschaetzer';
import { EinkommenFelder } from './EinkommenFelder';
import { ZahlFeld, TextFeld, DatumFeld, AuswahlFeld, Schalter, Abschnitt, euro, prozent } from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import { personName, personNameAus } from './personen';

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

export function Basisdaten({ ergebnis, onEhepartnerDialog }: {
  ergebnis?: ProjektionsErgebnis | null;
  onEhepartnerDialog?: () => void;
} = {}) {
  const s = useSzenario((x) => x.szenario);
  const { setzeHaushalt, setzeEinkommen, setzePerson, partnerHinzufuegen } = useSzenario();
  const setzeEinkommenPartner = useSzenario((x) => x.setzeEinkommenPartner);
  const setzeEinkommenGetrennt = useSzenario((x) => x.setzeEinkommenGetrennt);
  const rentenbeginnZuruecksetzen = useSzenario((x) => x.rentenbeginnZuruecksetzen);
  const setzeKinderAnzahl = useSzenario((x) => x.setzeKinderAnzahl);
  const setzeKind = useSzenario((x) => x.setzeKind);

  // Die Altersgrenzen 18 und 25 stehen im Rechtsstand, nicht im Markup.
  const jetzt = new Date().getFullYear();
  const avdParam = parameterFuer(Math.max(jetzt, 2027), { indexRate: s.annahmen.tarifIndex }).avd;

  const nameVon = (id: string) => personNameAus(s.personen, id);

  /*
    Das heutige Haushaltsnetto als Bezugsgroesse fuer das Zielnetto.

    `zeilen[0]` ist immer das laufende Kalenderjahr (die Zeitachse beginnt
    in timeline.ts bei `jetzt.jahr`), also steht dort das Netto von heute —
    und `zielNettoHeute` ist ausdruecklich in heutiger Kaufkraft angegeben.
    Der Vergleich ist damit sauber, ohne Abzinsung.

    Er unterbleibt, sobald er etwas anderes behaupten wuerde, als er sagt:
    ohne Ergebnis, ohne Einkommen, und wenn der Ruhestand bereits begonnen
    hat — dann ist `zeilen[0]` kein Erwerbsjahr mehr.
  */
  const heute0 = ergebnis?.zeilen[0];
  const nettoHeuteMonat =
    heute0 && !heute0.vollstaendigImRuhestand ? heute0.nettoGesamt / 12 : 0;
  const zielAnteil =
    nettoHeuteMonat > 0 ? s.haushalt.zielNettoHeute / nettoHeuteMonat : null;

  return (
    <div className="space-y-4">
      {/*
        Das Zielnetto steht VOR dem Haushaltsraster und in einem eigenen
        Kasten. Es war bisher eines von fuenf gleichrangigen Feldern —
        dabei misst sich alles Weitere an dieser Zahl: der Bedarf, die
        Versorgungsluecke, die noetige Sparrate, das ganze Gutachten.
      */}
      <section className="rounded-xl border-2 border-indigo-300 bg-white p-3 shadow-sm sm:p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          <Target className="h-3.5 w-3.5" aria-hidden /> Ihr Ziel
        </h3>
        <ZahlFeld
          label="Zielnetto im Alter (Kaufkraft heute)"
          wert={s.haushalt.zielNettoHeute}
          onChange={(n) => setzeHaushalt({ zielNettoHeute: n })}
          einheit="€"
          gross
        />
        {zielAnteil !== null && (
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Das sind <strong className="text-indigo-800">{prozent(zielAnteil, 0)}</strong> Ihres
            heutigen Haushaltsnettos von {euro(nettoHeuteMonat)}.
          </p>
        )}
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          An dieser Zahl misst sich alles Weitere: Bedarf, Versorgungslücke und die Sparrate,
          die nötig wäre, um sie zu schließen.
        </p>
      </section>

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
            label="Kinder unter 25"
            wert={s.haushalt.kinderUnter25}
            onChange={setzeKinderAnzahl}
            max={15}
            hilfe="Ab dem 2. Kind sinkt der Pflegeversicherungsbeitrag."
          />
        </div>

        {s.haushalt.kinder.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Für die Kinderzulage des Altersvorsorgedepots
            </p>
            <KinderZeilen
              kinder={s.haushalt.kinder}
              onKind={setzeKind}
              a={avdParam}
              jetzt={jetzt}
            />
            <KinderHinweis a={avdParam} />
          </div>
        )}
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

      <Abschnitt titel={s.einkommenGetrennt ? `Einkommen — ${nameVon('A')}` : 'Heutiges Einkommen'}>
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
        <Abschnitt titel={`Einkommen — ${nameVon('B')}`}>
          <EinkommenFelder wert={s.einkommenPartner} onChange={setzeEinkommenPartner} />
        </Abschnitt>
      )}

      {/*
        Person B nur zeigen, solange sie auch gerechnet wird. Der Rechenkern
        filtert seit jeher genauso (timeline.ts, projiziere); die Karte blieb
        aber stehen, wenn man auf "Single" zurueckschaltete — mit Feldern, die
        nichts mehr bewirkten. Geloescht wird nichts: schaltet man wieder auf
        "Verheiratet", sind alle Eingaben von Person B noch da.
      */}
      {s.personen.filter((p) => p.id === 'A' || s.haushalt.verheiratet).map((p) => (
        <Abschnitt key={p.id} titel={personName(p)}>
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

      {!s.haushalt.verheiratet && (
        <p className="text-xs text-slate-500">
          Für einen zweiten Haushaltspartner oben &bdquo;Verheiratet&ldquo; aktivieren.
        </p>
      )}
    </div>
  );
}
