import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ImagePlus } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { TextFeld } from '../components/Feld';
import { FEHLER, FELD_LABEL, KNOPF_KLEIN, KNOPF_KLEIN_HAUPT, LINK } from '../components/stil';
import { Kasten, type KopfKunde } from './bausteine';
import {
  firmaMerken, firmenName, firmenWerte, gemerkteFirma, werteText, type FirmenWerte,
} from './firmenkunde';
import type { Firma, GelesenesLogo } from './firmenkunde-konto';

/**
 * DER FIRMENKUNDE AUF DEN ARBEITGEBER-SEITEN — Auswahl, Anlegen, Logo.
 *
 * Der Berater waehlt, fuer welche Firma er rechnet: eine aus der
 * Mitarbeiterberatung oder eine neue (Name, Logo). Name und Logo stehen dann
 * im Kopf der Seite und im Ausdruck; Sitz, Steuersatz und Umlagen kommen aus
 * dem Angebot der Firma. Gespeichert wird bei den Firmen der
 * Mitarbeiterberatung — es ist dieselbe Firma, mit der spaeter beraten wird.
 *
 * Was das Konto dazu braucht (Datenzugriff, Schema, Bildaufbereitung), laedt
 * erst nach dem Aufbau der Seite (`firmenkunde-konto.ts`): Die Rechnung steht
 * sofort, die Firmen einen Augenblick spaeter.
 */

const konto = () => import('./firmenkunde-konto');

const sitzung = (): Storage | null => {
  try { return window.sessionStorage; } catch { return null; }
};

const LAENDER: ReadonlySet<string> = new Set(BUNDESLAENDER.filter((l) => l !== 'Bund'));

/**
 * Die Werte der Firma in die Felder der Seite schreiben. Ein Sitz, den die
 * Auswahl der Seite nicht kennt, bleibt aussen vor — das Feld zeigte sonst
 * nichts an und rechnete doch damit.
 */
export function firmenWerteSetzer(setze: {
  bundesland: (land: string) => void; steuersatz: (satz: number) => void; umlagen: (satz: number) => void;
}) {
  return (w: FirmenWerte) => {
    if (LAENDER.has(w.bundesland)) setze.bundesland(w.bundesland);
    setze.steuersatz(w.steuersatz);
    setze.umlagen(w.umlagen);
  };
}

export interface Firmenkunde {
  firmen: Firma[] | 'laedt' | 'fehler';
  /** Die gewaehlte Firma — null: ohne Firma */
  firma: Firma | null;
  /** Fuer Kopf und Ausdruck — null ohne Firma */
  kunde: KopfKunde | null;
  waehlen: (id: string | null) => void;
  /** Liefert eine Meldung, wenn etwas nicht geklappt hat — sonst null */
  anlegen: (name: string, logo: GelesenesLogo | null) => Promise<{ angelegt: boolean; meldung: string | null }>;
  logoSetzen: (logo: GelesenesLogo) => Promise<string | null>;
}

export function useFirmenkunde(seite: {
  /** Was die Seite gerade ueber das Unternehmen weiss — geht in eine neue Firma */
  werte: FirmenWerte;
  /** Die Werte einer gewaehlten Firma uebernehmen */
  onWerte: (w: FirmenWerte) => void;
}): Firmenkunde {
  const [firmen, setFirmen] = useState<Firma[] | 'laedt' | 'fehler'>('laedt');
  const [wahl, setWahl] = useState<string | null>(() => gemerkteFirma(window.location.search, sitzung()));
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  // Ein eben gewaehltes Logo liegt schon als Bild vor — es muss nicht erst wieder aus dem Speicher kommen.
  const frisch = useRef(new Map<string, string>());
  const seiteRef = useRef(seite);
  seiteRef.current = seite;
  const wahlRef = useRef(wahl);
  wahlRef.current = wahl;

  useEffect(() => {
    let aktiv = true;
    void konto().then((k) => k.firmenLaden()).then((f) => {
      if (!aktiv) return;
      setFirmen(f);
      if (!Array.isArray(f) || !wahlRef.current) return;
      const gemerkt = f.find((x) => x.id === wahlRef.current);
      if (gemerkt) seiteRef.current.onWerte(firmenWerte(gemerkt.angebot));
      else { setWahl(null); firmaMerken(null, sitzung()); } // geloescht oder nicht mehr freigegeben
    }).catch(() => { if (aktiv) setFirmen('fehler'); });
    return () => { aktiv = false; };
  }, []);

  const firma = Array.isArray(firmen) ? firmen.find((f) => f.id === wahl) ?? null : null;
  const pfad = firma?.logoPfad ?? null;

  useEffect(() => {
    let aktiv = true;
    let geladen: string | null = null;
    const schonDa = pfad ? frisch.current.get(pfad) ?? null : null;
    setLogoUrl(schonDa);
    if (pfad && !schonDa) {
      void konto().then((k) => k.firmenlogoLaden(pfad)).then((u) => {
        if (aktiv) { geladen = u; setLogoUrl(u); } else if (u) URL.revokeObjectURL(u);
      }).catch(() => { /* ohne Logo weiter */ });
    }
    return () => {
      aktiv = false;
      if (geladen) URL.revokeObjectURL(geladen);
    };
  }, [pfad]);

  const waehlen = useCallback((id: string | null) => {
    setWahl(id);
    firmaMerken(id, sitzung());
    const f = id && Array.isArray(firmen) ? firmen.find((x) => x.id === id) : null;
    if (f) seiteRef.current.onWerte(firmenWerte(f.angebot));
  }, [firmen]);

  const anlegen = useCallback(async (name: string, logo: GelesenesLogo | null) => {
    try {
      const k = await konto();
      const r = await k.firmaMitLogoAnlegen(name, seiteRef.current.werte, logo?.blob ?? null);
      if (!r.firma) return { angelegt: false, meldung: r.meldung };
      const neu = r.firma;
      if (logo && neu.logoPfad) frisch.current.set(neu.logoPfad, logo.dataUrl);
      setFirmen((alt) => [...(Array.isArray(alt) ? alt : []), neu].sort((a, b) => a.name.localeCompare(b.name, 'de')));
      setWahl(neu.id);
      firmaMerken(neu.id, sitzung());
      return { angelegt: true, meldung: r.meldung };
    } catch {
      return { angelegt: false, meldung: 'Die Firma konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.' };
    }
  }, []);

  const logoSetzen = useCallback(async (logo: GelesenesLogo) => {
    if (!firma) return 'Bitte zuerst eine Firma wählen.';
    try {
      const k = await konto();
      const r = await k.logoSpeichern(firma, logo.blob);
      if ('meldung' in r) return r.meldung;
      const mitLogo = r.firma;
      if (mitLogo.logoPfad) frisch.current.set(mitLogo.logoPfad, logo.dataUrl);
      setFirmen((alt) => (Array.isArray(alt) ? alt.map((f) => (f.id === mitLogo.id ? mitLogo : f)) : alt));
      return null;
    } catch {
      return 'Das Logo konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.';
    }
  }, [firma]);

  return {
    firmen, firma, waehlen, anlegen, logoSetzen,
    kunde: firma ? { name: firmenName(firma.name), logo: logoUrl } : null,
  };
}

const OHNE = '';
const NEU = 'neu';

/** Das Logo mit dem Knopf, es zu waehlen — fuer die neue wie fuer die gewaehlte Firma. */
function LogoZeile({ bild, onDatei, aenderbar, laeuft, hinweis }: {
  bild: string | null;
  onDatei: (datei: File) => void;
  aenderbar: boolean;
  laeuft: boolean;
  hinweis?: string | null;
}) {
  const id = `l${useId()}`;
  return (
    <div>
      <span className={FELD_LABEL}>Logo der Firma</span>
      <div className="flex flex-wrap items-center gap-3">
        {bild
          ? <img src={bild} alt="Logo der Firma" className="h-12 max-w-[9rem] rounded-xl bg-white object-contain p-1.5" />
          : <span className="text-sm text-ui-schiefer">Kein Logo</span>}
        {aenderbar && (
          <>
            <label htmlFor={id} className={`${KNOPF_KLEIN} cursor-pointer ${laeuft ? 'pointer-events-none opacity-40' : ''}`}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {laeuft ? 'Wird gespeichert …' : bild ? 'Anderes Logo' : 'Logo wählen'}
            </label>
            <input
              id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={laeuft}
              onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) onDatei(d); }}
            />
          </>
        )}
      </div>
      {hinweis && <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{hinweis}</p>}
    </div>
  );
}

/**
 * Der Kasten ganz oben in der Eingabespalte: fuer welche Firma gerechnet
 * wird. Steht nicht im Druck — dort traegt der Briefkopf Name und Logo.
 */
export function FirmenkundeWahl({ kunde }: { kunde: Firmenkunde }) {
  const wahlId = `f${useId()}`;
  const [neu, setNeu] = useState(false);
  const [name, setName] = useState('');
  const [neuesLogo, setNeuesLogo] = useState<GelesenesLogo | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [druckfarben, setDruckfarben] = useState<string | null>(null);
  const { firmen, firma } = kunde;
  const liste = Array.isArray(firmen) ? firmen : [];

  const waehlen = (wert: string) => {
    setMeldung(null);
    setDruckfarben(null);
    if (wert === NEU) { setNeu(true); return; }
    setNeu(false);
    kunde.waehlen(wert === OHNE ? null : wert);
  };

  const dateiLesen = async (datei: File): Promise<GelesenesLogo | null> => {
    setMeldung(null);
    setDruckfarben(null);
    try {
      const k = await konto();
      const r = await k.logoLesen(datei);
      if ('meldung' in r) { setMeldung(r.meldung); return null; }
      if (r.druckfarben) setDruckfarben(k.DRUCKFARBEN_HINWEIS);
      return r;
    } catch {
      setMeldung('Das Bild ließ sich nicht lesen. Bitte eine andere Datei wählen.');
      return null;
    }
  };

  const logoFuerNeue = async (datei: File) => {
    const r = await dateiLesen(datei);
    if (r) setNeuesLogo(r);
  };

  const logoFuerGewaehlte = async (datei: File) => {
    const r = await dateiLesen(datei);
    if (!r) return;
    setLaeuft(true);
    const fehler = await kunde.logoSetzen(r);
    setLaeuft(false);
    if (fehler) setMeldung(fehler);
  };

  const anlegen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft) return;
    if (firmenName(name) === '') { setMeldung('Bitte geben Sie den Namen der Firma ein.'); return; }
    setLaeuft(true);
    setMeldung(null);
    const r = await kunde.anlegen(name, neuesLogo);
    setLaeuft(false);
    setMeldung(r.meldung);
    if (r.angelegt) {
      setNeu(false);
      setName('');
      setNeuesLogo(null);
    }
  };

  return (
    <Kasten titel="Für welche Firma?">
      <div>
        <label htmlFor={wahlId} className={FELD_LABEL}>Firma</label>
        <select
          id={wahlId}
          value={neu ? NEU : firma?.id ?? OHNE}
          onChange={(e) => waehlen(e.target.value)}
          disabled={firmen === 'laedt'}
          className="ui-feld w-full p-2 text-sm"
        >
          <option value={OHNE}>{firmen === 'laedt' ? 'Ihre Firmen werden geladen …' : 'Ohne Firma'}</option>
          {liste.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          <option value={NEU}>Neue Firma anlegen …</option>
        </select>
        {!neu && !firma && firmen !== 'fehler' && (
          <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
            Mit einer Firma tragen Seite und Ausdruck ihren Namen und ihr Logo.
          </p>
        )}
        {firmen === 'fehler' && (
          <p className="mt-1 text-xs leading-relaxed text-rose-800">
            Ihre Firmen konnten nicht geladen werden — eine neue geht trotzdem.
          </p>
        )}
      </div>

      {neu && (
        <form onSubmit={(e) => void anlegen(e)} className="space-y-3">
          <TextFeld label="Name der Firma" wert={name} onChange={setName} maxLaenge={120} platzhalter="z. B. Muster GmbH" autoComplete="organization" />
          <LogoZeile
            bild={neuesLogo?.dataUrl ?? null} onDatei={(d) => void logoFuerNeue(d)} aenderbar laeuft={false}
            hinweis={druckfarben ?? 'PNG, JPG oder WebP — freiwillig, lässt sich später ergänzen.'}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={laeuft} className={KNOPF_KLEIN_HAUPT}>
              {laeuft ? 'Wird angelegt …' : 'Firma anlegen'}
            </button>
            <button type="button" onClick={() => { setNeu(false); setMeldung(null); setDruckfarben(null); }} className={KNOPF_KLEIN}>
              Abbrechen
            </button>
          </div>
          <p className="text-xs leading-relaxed text-ui-schiefer">
            Die Firma wird in Ihrem Konto gespeichert — dieselbe, mit der Sie später Mitarbeiter beraten.
          </p>
        </form>
      )}

      {!neu && firma && (
        <>
          <LogoZeile
            bild={kunde.kunde?.logo ?? null} onDatei={(d) => void logoFuerGewaehlte(d)} aenderbar={firma.eigene} laeuft={laeuft}
            hinweis={druckfarben ?? (firma.eigene ? null : 'Das Logo pflegt, wer die Firma angelegt hat.')}
          />
          <p className="text-xs leading-relaxed text-ui-schiefer">
            Aus dem Angebot der Firma übernommen: {werteText(firmenWerte(firma.angebot))}.
          </p>
          <a href={`/mitarbeiterberatung?firma=${firma.id}&reiter=angebot`} className={LINK}>
            Angebot der Firma öffnen <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </>
      )}

      {meldung && <p role="alert" className={FEHLER}>{meldung}</p>}
    </Kasten>
  );
}
