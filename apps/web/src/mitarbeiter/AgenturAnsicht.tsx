import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Link2, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { agenturDatenSchema, neuesAngebot, type AgenturDaten, type AgenturRolle } from '@renten/schema';
import { firmenLaden, staendeLaden, type Firma, type Stand } from '../lib/bav-beratung';
import {
  agenturLaden, agenturLoeschen, agenturLogoHochladen, agenturLogosAufraeumen, agenturSpeichern, einladungErstellen,
  einladungZurueckziehen, einladungenLaden, rolleSetzen, zugaengeLaden, zugangEntfernen,
  type Agentur, type AgenturEinladung, type AgenturZugang,
} from '../lib/bav-agenturen';
import { agenturEinladungsLink } from '../lib/einladung';
import { datum } from '../store/zugang';
import { farbeNormal } from '../features/auftritt';
import { FarbWahl, LogoWahl } from '../features/AuftrittTeile';
import { AuswahlFeld, Schalter, TextFeld } from '../components/Feld';
import { Dialog } from '../components/Dialog';
import { LinkFeld } from '../components/LinkFeld';
import { Sicher } from '../components/Sicher';
import {
  ETIKETT, FEHLER, Hinweis, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, LINK, Pillen, TIPPFLAECHE, TextBereich, Titel,
} from '../components/stil';
import { agenturKurz, rolleText, zugaengeText, zugangName } from './agentur-texte';
import { agenturMerken, agenturVergessen, useAgenturLogo } from './agentur-hook';
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

/** Wer die Agentur ansieht: die bAV-Verwaltung — oder ein Admin der Agentur, der sie selbst einrichtet. */
export type AgenturSicht = 'verwaltung' | 'admin';

/**
 * Eine Agentur: ihre Firmenkunden, ihre Angaben (die Vorgaben fuer jede
 * Firma, die in ihr angelegt wird), ihr Auftritt auf den Unterlagen und ihre
 * Zugaenge.
 *
 * Fuer die bAV-VERWALTUNG und fuer die ADMINS der Agentur (`rolle`). Admins
 * aendern Angaben und Auftritt und sehen, wer dabei ist. Einladen, Zugaenge
 * entfernen, Adminrechte vergeben und die Agentur loeschen kann nur die
 * Verwaltung. Was erlaubt ist, prueft die Datenbank.
 */
export function AgenturAnsicht({ agenturId, rolle, gehe }: { agenturId: string; rolle: AgenturSicht; gehe: (o: Ort) => void }) {
  const verwaltung = rolle === 'verwaltung';
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
      <ArrowLeft className="h-4 w-4" aria-hidden /> {verwaltung ? 'Alle Agenturen' : 'Zur Mitarbeiterberatung'}
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
    { id: 'daten', text: 'Angaben & Auftritt', kurz: 'Angaben' },
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
              hinweis={verwaltung
                ? `Die Firma gehört zur Agentur ${agentur.name} und beginnt mit deren Vorgaben. Die Zugänge der Agentur sehen und bearbeiten sie.`
                : `Die Firma gehört zu Ihrer Agentur ${agentur.name} und beginnt mit deren Vorgaben. Alle Zugänge der Agentur und die bAV-Verwaltung sehen und bearbeiten sie.`}
              gehe={gehe}
            />
            {firmen.length === 0 ? (
              <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
                {verwaltung
                  ? 'Noch kein Firmenkunde. Legen Sie eine Firma an — oder ordnen Sie eine bestehende Firma in ihrem Reiter „Angebot“ dieser Agentur zu.'
                  : 'Noch kein Firmenkunde. Legen Sie die erste Firma an.'}
              </p>
            ) : (
              <FirmenKarten firmen={firmen} staende={staende} gehe={gehe} beschriftung={`Firmenkunden der Agentur ${agentur.name}`} />
            )}
          </div>
        )}

        {reiter === 'daten' && (
          <AgenturFormular
            agentur={agentur}
            verwaltung={verwaltung}
            firmen={firmen.length}
            zugaenge={zugaenge ?? 0}
            onGespeichert={(a) => { agenturMerken(a); setAgentur(a); }}
            onGeloescht={() => { agenturVergessen(agentur.id); gehe(FIRMEN); }}
          />
        )}

        {reiter === 'zugaenge' && <Zugaenge agentur={agentur} verwaltung={verwaltung} onAnzahl={setZugaenge} />}
      </div>
    </div>
  );
}

const LOGO_MELDUNG = {
  typ: 'Dieses Bildformat nimmt der Speicher nicht an. Bitte PNG, JPG oder WebP wählen.',
  'zu-gross': 'Das Logo ist zu groß. Bitte eine kleinere Datei wählen.',
  fehler: 'Das Logo konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.',
} as const;

/**
 * Angaben und Auftritt der Agentur. Gespeichert wird erst mit „Speichern“.
 * Die Angaben sind die VORGABE fuer neue Firmen — bestehende Firmen aendern
 * sich nicht. Der Auftritt (Logo, Akzentfarbe, Internetadresse, Zusatzzeile)
 * gilt sofort auf den Unterlagen aller Firmenkunden der Agentur.
 */
function AgenturFormular({ agentur, verwaltung, firmen, zugaenge, onGespeichert, onGeloescht }: {
  agentur: Agentur; verwaltung: boolean; firmen: number; zugaenge: number;
  onGespeichert: (a: Agentur) => void; onGeloescht: () => void;
}) {
  const [name, setName] = useState(agentur.name);
  const [d, setD] = useState<AgenturDaten>(agentur.daten);
  const [status, setStatus] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);
  // Das Logo: weggelassen = unveraendert, 'entfernen', oder ein neues (vorbereitet, noch nicht hochgeladen)
  const [neuesLogo, setNeuesLogo] = useState<{ blob: Blob; dataUrl: string } | 'entfernen' | null>(null);
  const gespeichertesLogo = useAgenturLogo(agentur.logoPfad);
  // Gerade gespeichert: Die Vorschau bleibt stehen, bis das Logo aus dem Speicher geladen ist.
  const [ebenGespeichert, setEbenGespeichert] = useState<string | null>(null);
  const logoVorschau = neuesLogo === 'entfernen' ? null
    : neuesLogo ? neuesLogo.dataUrl
    : gespeichertesLogo ?? (agentur.logoPfad ? ebenGespeichert : null);

  const geaendert = name.trim() !== agentur.name || JSON.stringify(d) !== JSON.stringify(agentur.daten) || neuesLogo !== null;
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
    // Erst das Logo hochladen, dann die Zeile: Sie nennt seinen Pfad.
    let logoPfad: string | null | undefined;
    if (neuesLogo === 'entfernen') logoPfad = null;
    else if (neuesLogo) {
      const r = await agenturLogoHochladen(agentur.id, neuesLogo.blob);
      if (r === 'typ' || r === 'zu-gross' || r === 'fehler') {
        setStatus('fehler');
        setMeldung(LOGO_MELDUNG[r]);
        return;
      }
      logoPfad = r;
    }
    if (!(await agenturSpeichern({ id: agentur.id, name, daten: geprueft.data, ...(logoPfad !== undefined ? { logoPfad } : {}) }))) {
      setStatus('fehler');
      setMeldung('Die Agentur konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.');
      return;
    }
    setStatus('gespeichert');
    setEbenGespeichert(neuesLogo && neuesLogo !== 'entfernen' ? neuesLogo.dataUrl : null);
    setNeuesLogo(null);
    const pfad = logoPfad !== undefined ? logoPfad : agentur.logoPfad;
    onGespeichert({ ...agentur, name: name.trim(), daten: geprueft.data, logoPfad: pfad, geaendertAm: new Date().toISOString() });
    // Das vorige Logo entfernen — im Hintergrund, soweit es im eigenen Ordner liegt.
    if (logoPfad !== undefined) void agenturLogosAufraeumen(agentur.id, pfad);
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
            Der Name steht im Briefkopf aller Unterlagen für Firmenkunden {verwaltung ? 'dieser' : 'Ihrer'} Agentur. Ansprechpartner
            und Kontakt gelten, wo ein Zugang nichts Eigenes eingetragen hat — und für Unterlagen, die die bAV-Verwaltung
            erstellt.
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
            Jede Firma, die in {verwaltung ? 'dieser' : 'Ihrer'} Agentur angelegt wird, beginnt mit diesen Angaben. Mit der AXA als
            Versicherer und dem Durchführungsweg Direktversicherung gelten der AXA-Antrag und das AXA-Gesprächsprotokoll
            von Anfang an. Bestehende Firmen ändern sich nicht.
          </p>
        </Karte>

        <div className="lg:col-span-2">
          <Karte titel="Auftritt auf den Unterlagen">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
              <LogoWahl
                logo={logoVorschau}
                alt={`Logo ${name.trim() || 'der Agentur'}`}
                onLogo={(l) => {
                  setNeuesLogo(l ? { blob: l.blob, dataUrl: l.dataUrl } : agentur.logoPfad ? 'entfernen' : null);
                  setStatus('bereit');
                }}
              />
              <FarbWahl farbe={farbeNormal(d.farbe)} onFarbe={(f) => setze('farbe', f ?? '')} wofuer="auf den Unterlagen" />
              <TextFeld label="Internetadresse" wert={d.web} onChange={(s) => setze('web', s)} maxLaenge={200} autoComplete="off"
                platzhalter="z. B. www.agentur-muster.de" />
              <TextFeld label="Zusatzzeile (optional)" wert={d.zusatz} onChange={(s) => setze('zusatz', s)} maxLaenge={300} autoComplete="off"
                platzhalter="z. B. Versicherungsvertreter nach § 34d Abs. 1 GewO, Reg.-Nr. D-…" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ui-schiefer">
              Logo, Farbe, Internetadresse und Zusatzzeile gelten für alle Zugänge der Agentur: Sie stehen im Briefkopf und in
              der Fußzeile der Unterlagen ihrer Firmenkunden — und auf den Ausdrucken der Vorsorgemodelle. Wer berät,
              steht mit seinem eigenen Namen und Kontakt daneben.
            </p>
          </Karte>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void speichern()} disabled={status === 'speichert' || !geaendert} className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> {status === 'speichert' ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <span role="status" className="text-sm text-ui-schiefer">
          {status === 'gespeichert' && !geaendert ? 'Gespeichert.' : geaendert ? 'Nicht gespeichert.' : ''}
        </span>
        {verwaltung && (
          <>
            <span className="flex-1" />
            <button type="button" onClick={() => setLoeschen(true)} disabled={firmen > 0} className={KNOPF_GEFAHR}>
              <Trash2 className="h-4 w-4" aria-hidden /> Agentur löschen
            </button>
          </>
        )}
      </div>
      {verwaltung && firmen > 0 && (
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
 * Die Zugaenge der Agentur. Die VERWALTUNG erstellt Einladungslinks (auf
 * Wunsch mit Adminrechten), zieht sie zurueck, vergibt und nimmt Adminrechte
 * und entfernt Zugaenge. Ein ADMIN der Agentur sieht, wer dabei ist. Jeder
 * Link gilt einmal.
 */
function Zugaenge({ agentur, verwaltung, onAnzahl }: { agentur: Agentur; verwaltung: boolean; onAnzahl: (n: number) => void }) {
  const [einladungen, setEinladungen] = useState<AgenturEinladung[] | null>(null);
  const [mitglieder, setMitglieder] = useState<AgenturZugang[] | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [mitAdmin, setMitAdmin] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [e, m] = await Promise.all([verwaltung ? einladungenLaden(agentur.id) : Promise.resolve([]), zugaengeLaden(agentur.id)]);
    if (e === 'fehler' || m === 'fehler') setFehler('Die Zugänge konnten nicht geladen werden. Bitte laden Sie die Seite neu.');
    setEinladungen(e === 'fehler' ? [] : e);
    setMitglieder(m === 'fehler' ? [] : m);
    if (m !== 'fehler') onAnzahl(m.length);
  }, [agentur.id, verwaltung, onAnzahl]);
  useEffect(() => { void laden(); }, [laden]);

  const erstellen = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setFehler(null);
    const token = await einladungErstellen(agentur.id, mitAdmin ? 'admin' : 'mitglied');
    setLaeuft(false);
    if (token === 'ohne-rollen') {
      setFehler('Adminrechte gibt es in dieser Datenbank noch nicht — die Migration der Rollen fehlt. Ein Link ohne Adminrechte geht.');
      return;
    }
    if (!token) { setFehler('Der Link konnte nicht erstellt werden. Je Agentur sind höchstens 20 offene Einladungen möglich.'); return; }
    setNeu(token);
    setMitAdmin(false);
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

  const rolle = async (nutzer: string, r: AgenturRolle) => {
    setFehler(null);
    if (!(await rolleSetzen(nutzer, r))) setFehler('Die Adminrechte konnten nicht geändert werden. Bitte versuchen Sie es noch einmal.');
    await laden();
  };

  const liste = (
    <Karte titel={`Zugänge${mitglieder && mitglieder.length > 0 ? ` (${mitglieder.length})` : ''}`}>
      {mitglieder === null ? (
        <p className="text-sm text-ui-schiefer">Wird geladen …</p>
      ) : mitglieder.length === 0 ? (
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Noch kein Zugang. Erstellen Sie einen Einladungslink und geben Sie ihn der Agentur.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-ui-schiefer" data-zugaenge-stand="">{zugaengeText(mitglieder)}</p>
          <ul className="divide-y divide-ui-linie border-y border-ui-linie" aria-label="Zugänge der Agentur">
            {mitglieder.map((m) => {
              const n = zugangName(m);
              return (
                <li key={m.nutzer} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-ui-tinte [overflow-wrap:anywhere]">{n.haupt}{m.ich ? ' (Sie)' : ''}</span>
                      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${
                        m.rolle === 'admin' ? 'border-ui-tinte bg-ui-karte font-medium text-ui-tinte' : 'border-ui-linie bg-ui-karte text-ui-schiefer'
                      }`}>
                        {m.rolle === 'admin' && <ShieldCheck className="h-3 w-3" aria-hidden />}{rolleText(m.rolle)}
                      </span>
                    </span>
                    <span className="block text-xs text-ui-schiefer [overflow-wrap:anywhere]">{n.neben} · dabei seit {datum(m.seit)}</span>
                  </span>
                  {verwaltung && (
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {m.rolle === 'admin'
                        ? <Sicher text="Adminrechte entziehen" frage="Adminrechte entziehen?" ja="Ja" onJa={() => rolle(m.nutzer, 'mitglied')} />
                        : <Sicher text="Zum Admin machen" frage="Adminrechte geben?" ja="Ja" onJa={() => rolle(m.nutzer, 'admin')} />}
                      <Sicher text="Entfernen" frage="Zugang entfernen?" ja="Ja" onJa={() => entfernen(m.nutzer)} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {verwaltung && mitglieder !== null && mitglieder.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
          Admins richten ihre Agentur selbst ein: Angaben, Logo und Farbe. Entfernen Sie einen Zugang, bleiben seine Firmen
          in der Agentur; sie gehen mit ihren Beratungen an Sie über. Das Konto selbst bleibt bestehen.
        </p>
      )}
      {!verwaltung && (
        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
          Neue Zugänge lädt die bAV-Verwaltung ein; sie vergibt auch die Adminrechte und entfernt Zugänge. Sprechen Sie
          sie an, wenn jemand dazukommen oder gehen soll.
        </p>
      )}
      {!verwaltung && fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
      <Hinweis symbol={ShieldCheck} klasse="mt-4">
        Die Zugänge der Agentur sehen die Angaben aller Mitarbeiter ihrer Firmenkunden — auch Gehalt, Steuer- und
        Gesundheitsangaben. Dasselbe sieht die bAV-Verwaltung.
      </Hinweis>
    </Karte>
  );

  if (!verwaltung) return <div className="max-w-3xl">{liste}</div>;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <Karte titel="Einladen">
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Jede Person der Agentur bekommt einen eigenen Link; er gilt einmal und 14 Tage. Wer ihn öffnet, legt ein Konto
          an oder meldet sich an, trägt seine Angaben als Berater ein und sieht dann die Firmenkunden von {agentur.name} —
          mit den Vorsorgemodellen und der bAV-Mitarbeiterberatung, ohne Abo.
        </p>
        <div className="mt-4 space-y-3">
          <Schalter label="Mit Adminrechten — darf Angaben und Auftritt der Agentur einrichten" wert={mitAdmin} onChange={setMitAdmin} />
          <button type="button" onClick={() => void erstellen()} disabled={laeuft} className={`${KNOPF} w-full sm:w-auto`}>
            <Link2 className="h-4 w-4" aria-hidden /> {laeuft ? 'Einen Moment …' : 'Einladungslink erstellen'}
          </button>
        </div>
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
                <LinkFeld link={agenturEinladungsLink(e.token)} neu={e.token === neu}
                  beschriftung={`Einladungslink für ${agentur.name}${e.rolle === 'admin' ? ' (mit Adminrechten)' : ''}`} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ui-schiefer">
                    {e.rolle === 'admin' && <span className="font-medium text-ui-tinte">Mit Adminrechten · </span>}
                    Gültig bis {datum(e.gueltigBis)}
                  </span>
                  <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja" onJa={() => zurueckziehen(e.token)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
      </Karte>

      {liste}
    </div>
  );
}
