import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Printer, RotateCcw, Save } from 'lucide-react';
import { istKinderpolice } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { useAuth } from '../store/auth';
import { useAuftritt } from '../store/auftritt';
import { supabaseKonfiguriert } from '../lib/supabase';
import { useProjektion } from '../worker/useProjektion';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { Dialog } from '../components/Dialog';
import { AnspracheGeben } from '../components/Ansprache';
import { vornamen, woerter, type Ansprache } from '../lib/ansprache';
import { namensTeile, mitName } from '../lib/namen';
import { musterfallMerken } from '../lib/musterfall';
import { NamenFelder } from '../components/Feld';
import { EINLEITUNG, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Karte, Titel } from '../components/stil';
import { Vertraege } from '../features/Vertraege';
import { VertragsTuev } from '../features/VertragsTuev';
import { Basisdaten } from '../features/Basisdaten';
import { Konto } from '../features/Konto';
import { tuevPositionen } from '../features/tuev-berechnung';
import { fallNameAus, personNameAus } from '../features/personen';
import { fehlendeAngaben } from '../features/vorbelegung';
import { VertragspruefungDruck } from '../druck/Vertragspruefung';

/** Der Fall der Vertragspruefung liegt getrennt vom Fall im Rechner. */
export const SPEICHER_VERTRAGSPRUEFUNG = 'rentenplaner.vertragspruefung.v1';

/**
 * DIE VERTRAGSPRUEFUNG — bestehende Vertraege pruefen, ohne Rentenluecke
 * und ohne Gutachten.
 *
 * Dieselben Bausteine wie im Rechner: die Vertragskarten, die Basisdaten fuer
 * Steuer und Abgaben, der Vertrags-TUEV. Jeder Vertrag steht automatisch in
 * der Pruefung. Der Fall liegt unter eigenem Schluessel im Browser (main.tsx),
 * laesst sich im Konto speichern und mit „Im Rechner weiterrechnen“ als
 * vorgemerkter Fall in den Rechner geben — dort fragt ein Band, bevor er
 * den dortigen Fall ersetzt.
 *
 * Die Ansprache wie im Rechner: per Du, ein Paar per ihr. Was der Berater
 * bedient (Speichern, Konto), bleibt beim Sie.
 */
export function Seite() {
  const szenario = useSzenario((x) => x.szenario);
  const setzePerson = useSzenario((x) => x.setzePerson);
  const tuevHinzufuegen = useSzenario((x) => x.tuevHinzufuegen);
  const zuruecksetzen = useSzenario((x) => x.zuruecksetzen);

  // Jeder Vertrag steht in der Pruefung — ohne Auswahl. Auch geladene Faelle.
  useEffect(() => {
    for (const v of szenario.vertraege) {
      if (!szenario.tuev.some((t) => t.vertragId === v.id)) tuevHinzufuegen(v.id);
    }
  }, [szenario.vertraege, szenario.tuev, tuevHinzufuegen]);

  // Steuer und Abgaben zaehlen nur fuer eigene Vertraege — eine Kinderpolice versteuert das Kind.
  const hatEigene = szenario.vertraege.some((v) => !istKinderpolice(v));
  /*
    EIN NEUER FALL GIBT NICHTS VOR (`features/vorbelegung.ts`): Geburtsdatum,
    Rentenanspruch und Einkommen fehlen zuerst. Geprueft wird ein eigener
    Vertrag erst, wenn sie da sind — an ihnen haengen Steuerersparnis und
    Steuer im Alter. Das Ziel fragt diese Seite nicht; fuer eine Kinderpolice
    braucht es keine der Angaben.
  */
  const fehlend = useMemo(
    () => (hatEigene
      ? fehlendeAngaben(szenario, (id) => personNameAus(szenario.personen, id), (p) => p !== 'haushalt.zielNettoHeute')
      : []),
    [szenario, hatEigene],
  );
  const { ergebnis } = useProjektion(fehlend.length > 0 ? null : szenario);
  const zeile = ergebnis?.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr) ?? null;
  const positionen = useMemo(
    () => tuevPositionen(szenario, zeile, ergebnis?.kapitalauszahlungen ?? []),
    [szenario, zeile, ergebnis],
  );

  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;
  const ansprache = useMemo<Ansprache>(() => ({
    form: 'du',
    mehrere: paar,
    name: vornamen(szenario.personen.filter((p) => p.id === 'A' || paar)),
  }), [szenario.personen, paar]);
  const t = useMemo(() => woerter(ansprache), [ansprache]);

  // Logo, Firma und Kontakt des Beraters fuer das Deckblatt — wie im Rechner.
  const angemeldet = useAuth((s) => s.email);
  const auftritt = useAuftritt((s) => s.auftritt);
  const auftrittLaden = useAuftritt((s) => s.laden);
  useEffect(() => {
    if (supabaseKonfiguriert && angemeldet) void auftrittLaden();
  }, [angemeldet, auftrittLaden]);

  const [kontoOffen, setKontoOffen] = useState(false);
  const [neuOffen, setNeuOffen] = useState(false);

  /*
    Gedruckt wird erst, wenn ein Logo dekodiert ist — sonst fehlte es beim
    ersten Druck. Hoechstens 1,5 s; ohne Bild sofort. Wie im Rechner.
  */
  const drucken = () => {
    const bilder = [...document.querySelectorAll<HTMLImageElement>('#vertragspruefung-druck img')];
    if (bilder.length === 0) { window.print(); return; }
    void Promise.race([
      Promise.all(bilder.map((b) => b.decode().catch(() => undefined))),
      new Promise((fertig) => window.setTimeout(fertig, 1500)),
    ]).then(() => window.print());
  };

  /** Den Fall vormerken und in den Rechner wechseln — dort fragt ein Band, bevor er ersetzt wird. */
  const imRechner = () => {
    const name = fallNameAus(szenario.personen, szenario.haushalt.verheiratet);
    const n = szenario.vertraege.length;
    const kurz = [name, `${n} ${n === 1 ? 'Vertrag' : 'Verträge'}`].filter(Boolean).join(' · ');
    musterfallMerken(szenario, kurz, 'vertragspruefung');
    window.location.href = '/';
  };

  const a = szenario.personen.find((p) => p.id === 'A');
  const b = szenario.personen.find((p) => p.id === 'B');

  return (
    <AnspracheGeben wert={ansprache}>
      <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
        <SeitenKopf
          verlinkt
          klasse="print:hidden"
          rechts={(
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setKontoOffen(true)} className={KNOPF_KLEIN} aria-label="Speichern und öffnen">
                <Save className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Speichern</span>
              </button>
              <button type="button" onClick={drucken} disabled={fehlend.length > 0}
                title={fehlend.length > 0 ? 'Erst die fehlenden Angaben eintragen' : undefined}
                className={`${KNOPF_KLEIN} disabled:cursor-not-allowed disabled:opacity-40`} aria-label="Drucken">
                <Printer className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Drucken</span>
              </button>
            </div>
          )}
        />

        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-10 print:hidden">
          <div>
            <Titel gross>Vertragsprüfung</Titel>
            <p className={`mt-3 ${EINLEITUNG}`}>
              Was kostet {t.dich} ein Vertrag wirklich, und was kommt am Ende netto an? Hier{' '}
              {t.w('prüfst du', 'prüft ihr')} bestehende Verträge einzeln — ohne Rentenlücke und ohne Gutachten.
              Auch Kinderpolicen für Kinder und Enkel.
            </p>
          </div>

          {/*
            Nur die Namen: Geburtsdatum und Rentenbeginn stehen unter „Für Steuer
            und Abgaben“ — gebraucht werden sie nur fuer eigene Vertraege. Bei
            einer Kinderpolice zaehlt das Geburtsdatum des Kindes.
          */}
          <Karte titel="Kunde">
            <div className="grid gap-3 sm:grid-cols-2">
              {a && (
                <NamenFelder {...namensTeile(a.name, a.vorname, a.nachname)}
                  onChange={(teile) => setzePerson('A', mitName(teile))} />
              )}
              {paar && b && (
                <NamenFelder {...namensTeile(b.name, b.vorname, b.nachname)}
                  beschriftung={['Vorname Partner/in', 'Nachname Partner/in']}
                  onChange={(teile) => setzePerson('B', mitName(teile))} />
              )}
            </div>
          </Karte>

          {/* Dieselbe Liste wie im Rechner — hier mit der Kinderpolice als eigener Antwort. */}
          <Karte titel="Verträge">
            {szenario.vertraege.length === 0 && (
              <p className="mb-3 text-sm text-ui-schiefer">
                Noch kein Vertrag. Sobald einer angelegt ist, steht er in der Prüfung.
              </p>
            )}
            <Vertraege
              depots={ergebnis?.depots ?? []}
              auszahlungen={ergebnis?.kapitalauszahlungen ?? []}
              avdLaeufe={ergebnis?.avd ?? []}
              verrentungen={ergebnis?.verrentungen ?? []}
              mitKinderpolice
            />
          </Karte>

          {/*
            STEUER UND ABGABEN — nur, wenn ein eigener Vertrag dabei ist: Er
            spart heute Steuer und Abgaben (bAV, Riester, Rürup) und wird im
            Alter versteuert. Eine Kinderpolice zahlt aus versteuertem Geld,
            und versteuert wird beim Kind. Dieselben Felder wie im Rechner, ohne
            die Namen — die stehen oben.
          */}
          {hatEigene && (
            <Karte titel="Für Steuer und Abgaben">
              <p className="mb-4 text-sm leading-relaxed text-ui-schiefer">
                Was ein Vertrag heute an Steuer und Abgaben spart und wie er im Alter versteuert wird, hängt an
                diesen Angaben. Das Einkommen steht unten im Vertrags-TÜV.
              </p>
              <div className="space-y-6">
                <Basisdaten teil="haushalt" ergebnis={ergebnis} />
                <Basisdaten teil="personen" ergebnis={ergebnis} ohneNamen />
              </div>
            </Karte>
          )}

          <VertragsTuev
            ergebnis={ergebnis}
            szenario={szenario}
            automatischGeprueft
            einkommen={hatEigene ? 'feld' : 'ohne'}
            fehlend={fehlend}
          />

          {/* Weiter in den Rechner — oder von vorn mit dem naechsten Kunden. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-ui-linie pt-6">
            <button type="button" onClick={imRechner} className={KNOPF}>
              Im Rechner weiterrechnen <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setNeuOffen(true)} className={KNOPF_ZWEIT}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Neu beginnen
            </button>
          </div>
          <p className="text-xs leading-relaxed text-ui-schiefer">
            Im Rechner kommen Rentenlücke, Sparrechner und Gutachten dazu — mit den Angaben und Verträgen von
            hier. Der Fall dort wird erst nach Rückfrage ersetzt.
          </p>

          <RechtsLinks klasse="mt-4" />
        </main>

        <VertragspruefungDruck szenario={szenario} ergebnis={ergebnis} positionen={positionen} auftritt={auftritt} />

        <Dialog offen={kontoOffen} titel="Speichern und öffnen" onSchliessen={() => setKontoOffen(false)}>
          <Konto namensZusatz="Vertragsprüfung" />
        </Dialog>

        <Dialog offen={neuOffen} titel="Neu beginnen?" onSchliessen={() => setNeuOffen(false)}>
          <p className="text-sm leading-relaxed text-ui-tinte">
            Kunde, Verträge und Angaben auf dieser Seite werden geleert. Im Konto gespeicherte Fälle und der Fall
            im Rechner bleiben, wie sie sind.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => { zuruecksetzen(); setNeuOffen(false); }} className={KNOPF}>
              Neu beginnen
            </button>
            <button type="button" onClick={() => setNeuOffen(false)} className={KNOPF_ZWEIT}>Abbrechen</button>
          </div>
        </Dialog>
      </div>
    </AnspracheGeben>
  );
}
