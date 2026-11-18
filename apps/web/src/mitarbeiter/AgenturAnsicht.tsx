import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Link2, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { agenturDatenSchema, neuesAngebot, type AgenturDaten } from '@renten/schema';
import { firmenLaden, staendeLaden, type Firma, type Stand } from '../lib/bav-beratung';
import {
  agenturLaden, agenturLoeschen, agenturSpeichern, einladungErstellen, einladungZurueckziehen, einladungenLaden,
  zugaengeLaden, zugangEntfernen, type Agentur, type AgenturEinladung, type AgenturZugang,
} from '../lib/bav-agenturen';
import { agenturEinladungsLink } from '../lib/einladung';
import { datum } from '../store/zugang';
import { AuswahlFeld, TextFeld } from '../components/Feld';
import { Dialog } from '../components/Dialog';
import { LinkFeld } from '../components/LinkFeld';
import { Sicher } from '../components/Sicher';
import {
  ETIKETT, FEHLER, Hinweis, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, LINK, Pillen, TIPPFLAECHE, TextBereich, Titel,
} from '../components/stil';
import { agenturKurz } from './agentur-texte';
import { agenturMerken, agenturVergessen } from './agentur-hook';
import { FirmenKarten, NeueFirma } from './firmen-karten';
import { FIRMEN, type Ort } from './ort';

type Reiter = 'firmen' | 'daten' | 'zugaenge';

const LAENDER = [
  { wert: '', text: 'Keine Vorgabe' },
  ...BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l })),
];
const FEHLGESCHLAGEN = 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
const LISTE = 'mt-2 divide-y divide-ui-linie border-y border-ui-linie';

/** Ist an der Agentur noch nichts eingetragen? Dann beginnt die Ansicht bei ihren Daten. */
const unausgefuellt = (d: AgenturDaten) =>
  [d.vorname, d.nachname, d.organisationsnummer, d.anschrift, d.telefon, d.email].every((s) => s.trim() === '');

/**
 * Eine Agentur — nur fuer die bAV-Verwaltung: ihre Firmenkunden, ihre Daten
 * (die Vorgaben fuer jede Firma, die in ihr angelegt wird) und ihre Zugaenge
 * (Einladungslinks, wer dabei ist). Was erlaubt ist, prueft die Datenbank.
 */
export function AgenturAnsicht({ agenturId, gehe }: { agenturId: string; gehe: (o: Ort) => void }) {
  const [agentur, setAgentur] = useState<Agentur | null | 'laedt' | 'fehler'>('laedt');
  const [firmen, setFirmen] = useState<Firma[]>([]);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [reiter, setReiter] = useState<Reiter>('firmen');
  const [zugaenge, setZugaenge] = useState<number | null>(null);

  useEffect(() => {
    let aktiv = true;
    void Promise.all([agenturLaden(agenturId), firmenLaden(), staendeLaden(), zugaengeLaden(agenturId)]).then(([a, f, s, z]) => {
      if (!aktiv) return;
      setAgentur(a);
      const eigene = Array.isArray(f) ? f.filter((x) => x.agentur === agenturId) : [];
      setFirmen(eigene);
      if (s !== 'fehler') setStaende(s);
      if (z !== 'fehler') setZugaenge(z.length);
      if (a && a !== 'fehler') {
        agenturMerken(a);
        // Frisch angelegt: zuerst die Daten — sie belegen die Firmen vor.
        if (eigene.length === 0 && unausgefuellt(a.daten)) setReiter('daten');
      }
    });
    return () => { aktiv = false; };
  }, [agenturId]);

  const zurueck = (
    <button type="button" onClick={() => gehe(FIRMEN)} className={`${LINK} ${TIPPFLAECHE}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden /> Alle Agenturen
    </button>
  );
  if (agentur === 'laedt') return <p className="text-sm text-ui-schiefer">Die Agentur wird geladen …</p>;
  if (agentur === 'fehler' || agentur === null) {
    return (
      <div className="space-y-3">
        {zurueck}
        <p role="alert" className={FEHLER}>
          {agentur === null ? 'Diese Agentur gibt es nicht (mehr).' : 'Die Agentur konnte nicht geladen werden. Bitte laden Sie die Seite neu.'}
        </p>
      </div>
    );
  }

  const kurz = agenturKurz(agentur.daten);
  const REITER: { id: Reiter; text: string; kurz: string }[] = [
    { id: 'firmen', text: `Firmenkunden${firmen.length > 0 ? ` (${firmen.length})` : ''}`, kurz: `Firmen${firmen.length > 0 ? ` (${firmen.length})` : ''}` },
    { id: 'daten', text: 'Daten der Agentur', kurz: 'Daten' },
    { id: 'zugaenge', text: `Zugänge${zugaenge ? ` (${zugaenge})` : ''}`, kurz: `Zugänge${zugaenge ? ` (${zugaenge})` : ''}` },
  ];

  return (
    <div className="space-y-8">
      {zurueck}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className={`mb-1 flex items-center gap-1.5 ${ETIKETT}`}>
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Agentur
          </p>
          <Titel gross klasse="break-words">{agentur.name}</Titel>
        </div>
        {kurz && <p className="max-w-md break-words text-sm leading-relaxed text-ui-tinte">{kurz}</p>}
      </div>

      <Pillen
        beschriftung="Bereiche der Agentur"
        aktiv={reiter}
        onWechsel={setReiter}
        kennung={(id) => ({ reiter: `agentur-reiter-${id}`, bereich: `agentur-bereich-${id}` })}
        reiter={REITER.map((r) => ({
          id: r.id,
          inhalt: <><span className="sm:hidden">{r.kurz}</span><span className="hidden sm:inline">{r.text}</span></>,
        }))}
      />

      <div role="tabpanel" id={`agentur-bereich-${reiter}`} aria-labelledby={`agentur-reiter-${reiter}`}>
        {reiter === 'firmen' && (
          <div className="space-y-8">
            <NeueFirma
              angebot={() => neuesAngebot(agentur.daten)}
              agentur={agentur.id}
              hinweis={`Die Firma gehört zur Agentur ${agentur.name} und beginnt mit deren Vorgaben. Die Zugänge der Agentur sehen und bearbeiten sie.`}
              gehe={gehe}
            />
            {firmen.length === 0 ? (
              <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
                Noch kein Firmenkunde. Legen Sie eine Firma an — oder ordnen Sie eine bestehende Firma in ihrem Reiter
                „Angebot“ dieser Agentur zu.
              </p>
            ) : (
              <FirmenKarten firmen={firmen} staende={staende} gehe={gehe} beschriftung={`Firmenkunden der Agentur ${agentur.name}`} />
            )}
          </div>
        )}

        {reiter === 'daten' && (
          <AgenturFormular
            agentur={agentur}
            firmen={firmen.length}
            zugaenge={zugaenge ?? 0}
            onGespeichert={(a) => { agenturMerken(a); setAgentur(a); }}
            onGeloescht={() => { agenturVergessen(agentur.id); gehe(FIRMEN); }}
          />
        )}

        {reiter === 'zugaenge' && <Zugaenge agentur={agentur} onAnzahl={setZugaenge} />}
      </div>
    </div>
  );
}

/**
 * Die Daten der Agentur. Gespeichert wird erst mit „Speichern“. Sie sind die
 * VORGABE fuer neue Firmen — bestehende Firmen aendern sich nicht.
 */
function AgenturFormular({ agentur, firmen, zugaenge, onGespeichert, onGeloescht }: {
  agentur: Agentur; firmen: number; zugaenge: number;
  onGespeichert: (a: Agentur) => void; onGeloescht: () => void;
}) {
  const [name, setName] = useState(agentur.name);
  const [d, setD] = useState<AgenturDaten>(agentur.daten);
  const [status, setStatus] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);

  const geaendert = name.trim() !== agentur.name || JSON.stringify(d) !== JSON.stringify(agentur.daten);
  const setze = <K extends keyof AgenturDaten>(k: K, v: AgenturDaten[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setStatus('bereit');
  };

  const speichern = async () => {
    const geprueft = agenturDatenSchema.safeParse(d);
    if (!geprueft.success || name.trim() === '') {
      setStatus('fehler');
      setMeldung(name.trim() === '' ? 'Bitte einen Namen für die Agentur eintragen.' : 'Bitte die Angaben prüfen.');
      return;
    }
    setStatus('speichert');
    setMeldung(null);
    if (!(await agenturSpeichern({ id: agentur.id, name, daten: geprueft.data }))) {
      setStatus('fehler');
      setMeldung('Die Agentur konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.');
      return;
    }
    setStatus('gespeichert');
    onGespeichert({ ...agentur, name: name.trim(), daten: geprueft.data, geaendertAm: new Date().toISOString() });
  };

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        <Karte titel="Die Agentur">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextFeld label="Name der Agentur" wert={name} onChange={(s) => { setName(s); setStatus('bereit'); }} maxLaenge={120} autoComplete="off" />
            </div>
            <TextFeld label="Ansprechpartner: Vorname" wert={d.vorname} onChange={(s) => setze('vorname', s)} maxLaenge={60} autoComplete="off" />
            <TextFeld label="Ansprechpartner: Nachname" wert={d.nachname} onChange={(s) => setze('nachname', s)} maxLaenge={60} autoComplete="off" />
            <div className="sm:col-span-2">
              <TextBereich label="Anschrift" wert={d.anschrift} onChange={(s) => setze('anschrift', s)} maxLaenge={300} zeilen={2} />
            </div>
            <TextFeld label="Telefon" typ="tel" wert={d.telefon} onChange={(s) => setze('telefon', s)} maxLaenge={60} autoComplete="off" />
            <TextFeld label="E-Mail" typ="email" wert={d.email} onChange={(s) => setze('email', s)} maxLaenge={120} autoComplete="off" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ui-schiefer">
            Name, Ansprechpartner und Kontakt stehen im Briefkopf der Unterlagen, die Sie für Firmenkunden dieser
            Agentur erstellen — und der Ansprechpartner als Berater im AXA-Antrag.
          </p>
        </Karte>

        <Karte titel="Vorgaben für neue Firmen">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextFeld label="Versicherer" wert={d.versicherer} onChange={(s) => setze('versicherer', s)} maxLaenge={120} autoComplete="off" />
            <TextFeld label="Tarif" wert={d.tarif} onChange={(s) => setze('tarif', s)} maxLaenge={120} autoComplete="off" />
            <TextFeld label="Organisationsnummer (AXA)" wert={d.organisationsnummer} onChange={(s) => setze('organisationsnummer', s)}
              maxLaenge={40} autoComplete="off" />
            <AuswahlFeld label="Bundesland" wert={d.bundesland} onChange={(s) => setze('bundesland', s)} optionen={LAENDER} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ui-schiefer">
            Jede Firma, die in dieser Agentur angelegt wird, beginnt mit diesen Angaben — von Ihnen oder von einem Zugang
            der Agentur. Mit der AXA als Versicherer und dem Durchführungsweg Direktversicherung gelten der AXA-Antrag
            und das AXA-Gesprächsprotokoll von Anfang an. Bestehende Firmen ändern sich nicht.
          </p>
        </Karte>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void speichern()} disabled={status === 'speichert' || !geaendert} className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> {status === 'speichert' ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <span role="status" className="text-sm text-ui-schiefer">
          {status === 'gespeichert' && !geaendert ? 'Gespeichert.' : geaendert ? 'Nicht gespeichert.' : ''}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setLoeschen(true)} disabled={firmen > 0} className={KNOPF_GEFAHR}>
          <Trash2 className="h-4 w-4" aria-hidden /> Agentur löschen
        </button>
      </div>
      {firmen > 0 && (
        <p className="text-xs leading-relaxed text-ui-schiefer">
          Löschen lässt sich die Agentur erst, wenn sie keine Firmen mehr hat: Löschen Sie die Firmen oder ordnen Sie sie
          einer anderen Agentur zu.
        </p>
      )}
      {meldung && <p role="alert" className={FEHLER}>{meldung}</p>}

      <Dialog offen={loeschen} titel="Agentur löschen?" onSchliessen={() => setLoeschen(false)}>
        <p className="text-sm leading-relaxed text-ui-tinte">
          „{agentur.name}“ wird gelöscht.
          {zugaenge > 0 && ` ${zugaenge === 1 ? 'Der Zugang' : `Die ${zugaenge} Zugänge`} der Agentur ${zugaenge === 1 ? 'endet' : 'enden'} damit; die Konten bleiben bestehen.`}
          {' '}Offene Einladungslinks gelten nicht mehr.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setLoeschen(false)} className={KNOPF_ZWEIT}>Abbrechen</button>
          <button type="button" className={KNOPF_GEFAHR}
            onClick={() => void agenturLoeschen(agentur.id).then((r) => {
              if (r === 'ok') { onGeloescht(); return; }
              setLoeschen(false);
              setMeldung(r === 'firmen' ? 'Die Agentur hat noch Firmen und lässt sich deshalb nicht löschen.' : 'Die Agentur konnte nicht gelöscht werden.');
            })}>
            Endgültig löschen
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/**
 * Die Zugaenge der Agentur: Einladungslinks erstellen und zurueckziehen, sehen,
 * wer dabei ist, und einen Zugang entfernen. Jeder Link gilt einmal.
 */
function Zugaenge({ agentur, onAnzahl }: { agentur: Agentur; onAnzahl: (n: number) => void }) {
  const [einladungen, setEinladungen] = useState<AgenturEinladung[] | null>(null);
  const [mitglieder, setMitglieder] = useState<AgenturZugang[] | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [e, m] = await Promise.all([einladungenLaden(agentur.id), zugaengeLaden(agentur.id)]);
    if (e === 'fehler' || m === 'fehler') setFehler('Die Zugänge konnten nicht geladen werden. Bitte laden Sie die Seite neu.');
    setEinladungen(e === 'fehler' ? [] : e);
    setMitglieder(m === 'fehler' ? [] : m);
    if (m !== 'fehler') onAnzahl(m.length);
  }, [agentur.id, onAnzahl]);
  useEffect(() => { void laden(); }, [laden]);

  const erstellen = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setFehler(null);
    const token = await einladungErstellen(agentur.id);
    setLaeuft(false);
    if (!token) { setFehler('Der Link konnte nicht erstellt werden. Je Agentur sind höchstens 20 offene Einladungen möglich.'); return; }
    setNeu(token);
    await laden();
  };

  const zurueckziehen = async (token: string) => {
    setFehler(null);
    if (!(await einladungZurueckziehen(token))) setFehler(FEHLGESCHLAGEN);
    await laden();
  };

  const entfernen = async (nutzer: string) => {
    setFehler(null);
    if (!(await zugangEntfernen(nutzer))) setFehler(FEHLGESCHLAGEN);
    await laden();
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <Karte
        titel="Einladen"
        rechts={(
          <button type="button" onClick={() => void erstellen()} disabled={laeuft} className={KNOPF}>
            <Link2 className="h-4 w-4" aria-hidden /> {laeuft ? 'Einen Moment …' : 'Einladungslink erstellen'}
          </button>
        )}
      >
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Jede Person der Agentur bekommt einen eigenen Link; er gilt einmal und 14 Tage. Wer ihn öffnet, legt ein Konto
          an oder meldet sich an und sieht dann die Firmenkunden von {agentur.name} — mit den Vorsorgemodellen und der
          bAV-Mitarbeiterberatung, ohne Abo.
        </p>
        {import.meta.env.VITE_UMGEBUNG === 'test' && (
          <Hinweis klasse="mt-4">
            Sie sind auf der Testseite: Links von hier führen auf die Testseite. Echte Einladungen erstellen Sie auf
            js-rentenplaner.de, sobald diese Funktion dort live ist.
          </Hinweis>
        )}
        <h3 className="mt-5 text-sm font-medium text-ui-tinte">Offene Einladungen</h3>
        {einladungen === null ? (
          <p className="mt-1 text-sm text-ui-schiefer">Wird geladen …</p>
        ) : einladungen.length === 0 ? (
          <p className="mt-1 text-sm text-ui-schiefer">Keine offene Einladung.</p>
        ) : (
          <ul className={LISTE} aria-label="Offene Einladungen">
            {einladungen.map((e) => (
              <li key={e.token} className="py-3">
                <LinkFeld link={agenturEinladungsLink(e.token)} neu={e.token === neu} beschriftung={`Einladungslink für ${agentur.name}`} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ui-schiefer">Gültig bis {datum(e.gueltigBis)}</span>
                  <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja" onJa={() => zurueckziehen(e.token)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
      </Karte>

      <Karte titel={`Zugänge${mitglieder && mitglieder.length > 0 ? ` (${mitglieder.length})` : ''}`}>
        {mitglieder === null ? (
          <p className="text-sm text-ui-schiefer">Wird geladen …</p>
        ) : mitglieder.length === 0 ? (
          <p className="text-sm leading-relaxed text-ui-schiefer">
            Noch kein Zugang. Erstellen Sie einen Einladungslink und geben Sie ihn der Agentur.
          </p>
        ) : (
          <ul className="divide-y divide-ui-linie border-y border-ui-linie" aria-label="Zugänge der Agentur">
            {mitglieder.map((m) => (
              <li key={m.nutzer} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block break-all text-ui-tinte">{m.email || 'Ohne E-Mail-Adresse'}</span>
                  <span className="block text-xs text-ui-schiefer">dabei seit {datum(m.seit)}</span>
                </span>
                <Sicher text="Entfernen" frage="Zugang entfernen?" ja="Ja" onJa={() => entfernen(m.nutzer)} />
              </li>
            ))}
          </ul>
        )}
        {mitglieder !== null && mitglieder.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
            Entfernen Sie einen Zugang, bleiben seine Firmen in der Agentur; sie gehen mit ihren Beratungen an Sie über.
            Das Konto selbst bleibt bestehen.
          </p>
        )}
        <Hinweis symbol={ShieldCheck} klasse="mt-4">
          Die Zugänge der Agentur sehen die Angaben aller Mitarbeiter ihrer Firmenkunden — auch Gehalt, Steuer- und
          Gesundheitsangaben. Dasselbe sehen Sie als bAV-Verwaltung.
        </Hinweis>
      </Karte>
    </div>
  );
}
