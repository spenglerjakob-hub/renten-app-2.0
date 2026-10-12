import { useState, type ReactNode } from 'react';
import { Eye, X } from 'lucide-react';
import {
  aboAktiv, useZugang, wirksam, tageBis, tage, datum, type EinladungsAntwort, type Zugang,
} from '../store/zugang';

/**
 * Baender ueber der Seite: Testphase, offene Zahlung, Kuendigung, die
 * Ankuendigung des Abos, die Antwort auf eine Einladung und die Vorschau des
 * Betreibers.
 *
 * Bewusst schmal und wegklickbar (fuer diese Sitzung): Ein Berater mit dem
 * Kunden am Tisch soll nicht auf einen Kasten schauen, der ihn ans Bezahlen
 * erinnert. Ein neuer Stand (anderes Datum) zeigt das Band wieder.
 */

const TON = {
  info: 'border-indigo-200 bg-indigo-50 text-indigo-950',
  warnung: 'border-amber-200 bg-amber-100 text-amber-950',
  fehler: 'border-rose-200 bg-rose-100 text-rose-950',
  gut: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  neutral: 'border-slate-300 bg-slate-200 text-slate-900',
} as const;

function Band({ ton, children, onWeg, knopf }: {
  ton: keyof typeof TON;
  children: ReactNode;
  onWeg?: () => void;
  knopf?: { text: string; onKlick: () => void };
}) {
  return (
    <div role="status" className={`border-b print:hidden ${TON[ton]}`}>
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm leading-snug">
        {/* Der Knopf steht neben dem Text — wird es zu eng, rutscht er darunter. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="min-w-0 flex-[1_1_18rem]">{children}</p>
          {knopf && (
            <button
              type="button"
              onClick={knopf.onKlick}
              className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-bold shadow-sm ring-1 ring-black/10 hover:bg-slate-50"
            >
              {knopf.text}
            </button>
          )}
        </div>
        {onWeg && (
          <button type="button" onClick={onWeg} aria-label="Hinweis ausblenden"
            className="shrink-0 rounded p-1 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function gelesen(k: string): boolean {
  try { return sessionStorage.getItem(k) === '1' || localStorage.getItem(k) === '1'; } catch { return false; }
}

/** Weggeklickte Baender — fuer diese Sitzung oder (Ankuendigung) dauerhaft. */
function useWeggeklickt() {
  const [weg, setWeg] = useState<Record<string, true>>({});
  return {
    istWeg: (k: string) => weg[k] === true || gelesen(k),
    wegklicken: (k: string, dauerhaft = false) => {
      try { (dauerhaft ? localStorage : sessionStorage).setItem(k, '1'); } catch { /* egal */ }
      setWeg((w) => ({ ...w, [k]: true }));
    },
  };
}

/** Das Band zum Zugang: Zahlung, Kuendigung, Testphase, Ankuendigung. */
export function ZugangsBand() {
  const z = useZugang(wirksam);
  const oeffneFenster = useZugang((s) => s.oeffneFenster);
  const { istWeg, wegklicken } = useWeggeklickt();
  if (!z) return null;

  const b = bandFuer(z);
  if (!b || istWeg(b.schluessel)) return null;
  return (
    <Band
      ton={b.ton}
      onWeg={() => wegklicken(b.schluessel, b.dauerhaft)}
      knopf={b.knopf ? { text: b.knopf, onKlick: oeffneFenster } : undefined}
    >
      {b.text}
    </Band>
  );
}

interface BandInhalt {
  schluessel: string;
  ton: keyof typeof TON;
  text: ReactNode;
  knopf?: string;
  dauerhaft?: boolean;
}

function bandFuer(z: Zugang): BandInhalt | null {
  const inhaber = z.rolle === 'inhaber';
  // Zahlung und Kuendigung gehen den Inhaber immer an — auch wenn sein eigener
  // Zugang frei ist (Bestandskonto mit Team-Abo). Mitglieder nur, wenn ihr
  // Zugang am Abo haengt.
  const betrifft = inhaber || z.quelle === 'abo';
  if (betrifft && z.abo?.status === 'past_due') {
    return inhaber
      ? {
          schluessel: 'rentenplaner.band.zahlung', ton: 'fehler', knopf: 'Zahlungsdaten prüfen',
          text: <><strong>Die letzte Zahlung für Ihr Abo ist fehlgeschlagen.</strong> Bitte prüfen Sie Ihre Zahlungsdaten — sonst endet der Zugang für Ihr Büro.</>,
        }
      : {
          schluessel: 'rentenplaner.band.zahlung', ton: 'fehler',
          text: <><strong>Beim Abo Ihres Büros ist eine Zahlung offen.</strong> Bitte sagen Sie der Person Bescheid, die das Abo verwaltet.</>,
        };
  }
  if (betrifft && z.abo && aboAktiv(z.abo.status) && z.abo.kuendigungZum) {
    const am = datum(z.abo.kuendigungZum);
    return inhaber
      ? {
          schluessel: `rentenplaner.band.kuendigung.${z.abo.kuendigungZum}`, ton: 'neutral', knopf: 'Abo fortsetzen',
          text: <>Ihr Abo ist gekündigt und endet am <strong>{am}</strong>.</>,
        }
      : {
          schluessel: `rentenplaner.band.kuendigung.${z.abo.kuendigungZum}`, ton: 'neutral',
          text: <>Das Abo Ihres Büros endet am <strong>{am}</strong>.</>,
        };
  }
  if (z.quelle === 'test') {
    const n = tageBis(z.bis);
    return {
      schluessel: `rentenplaner.band.test.${z.bis}`, ton: n <= 3 ? 'warnung' : 'info', knopf: 'Paket wählen',
      text: <>Kostenlose Testphase: noch <strong>{tage(n)}</strong> (bis {datum(z.bis)}).</>,
    };
  }
  // Angekuendigt, aber noch nicht gestartet.
  if (z.quelle === 'vorab' && z.aboPflichtAb && Date.parse(z.aboPflichtAb) > Date.now() && !z.betreiber) {
    const ab = datum(z.aboPflichtAb);
    if (z.freizugang) {
      return {
        schluessel: `rentenplaner.band.ankuendigung.${z.aboPflichtAb}`, ton: 'gut', dauerhaft: true,
        text: <>Ab dem {ab} gibt es den JS-Rentenplaner im Abo. <strong>Ihr Konto bleibt kostenlos</strong> — Sie müssen nichts tun.</>,
      };
    }
    if (z.abo) return null;
    return {
      schluessel: `rentenplaner.band.ankuendigung.${z.aboPflichtAb}`, ton: 'info', knopf: 'Pakete ansehen',
      text: <>Ab dem <strong>{ab}</strong> braucht der JS-Rentenplaner ein Abo{z.testBis ? <> — bis zum {datum(z.testBis)} testen Sie kostenlos weiter</> : null}.</>,
    };
  }
  return null;
}

const EINLADUNG: Record<Exclude<EinladungsAntwort, 'ok' | 'anderes_buero'>, string> = {
  schon_im_buero: 'Sie gehören bereits zu diesem Büro.',
  ungueltig: 'Diese Einladung gilt nicht mehr — sie wurde schon verwendet oder zurückgezogen. Bitten Sie um einen neuen Link.',
  abgelaufen: 'Diese Einladung ist abgelaufen; Einladungslinks gelten 7 Tage. Bitten Sie um einen neuen Link.',
  kein_abo: 'Das Büro, das Sie eingeladen hat, hat gerade kein aktives Abo. Sobald es wieder läuft, öffnen Sie den Einladungslink einfach noch einmal.',
  voll: 'Im Büro, das Sie eingeladen hat, sind alle Plätze belegt. Sobald ein Platz dazugebucht ist, öffnen Sie den Einladungslink einfach noch einmal.',
};

/** Die Antwort auf eine eingeloeste Einladung. */
export function EinladungsBand() {
  const antwort = useZugang((s) => s.einladung);
  const gesehen = useZugang((s) => s.einladungGesehen);
  const z = useZugang((s) => s.zugang);
  if (!antwort) return null;

  if (antwort === 'ok') {
    return (
      <Band ton="gut" onWeg={gesehen}>
        <strong>Willkommen im Büro{z?.bueroName ? ` „${z.bueroName}“` : ''}.</strong> Ihr Zugang läuft ab jetzt über das Abo des Büros.
      </Band>
    );
  }
  const text = antwort === 'anderes_buero'
    ? z?.rolle === 'inhaber'
      ? 'Sie verwalten bereits ein eigenes Büro und können deshalb keinem anderen beitreten. Wenn Sie wechseln möchten, schreiben Sie uns — die Kontaktdaten stehen im Impressum.'
      : 'Sie gehören bereits zu einem anderen Büro. Um zu wechseln, treten Sie dort unter „Abo & Team“ aus und öffnen den Einladungslink noch einmal.'
    : EINLADUNG[antwort];
  return (
    <Band ton={antwort === 'schon_im_buero' ? 'neutral' : 'warnung'} onWeg={gesehen}>
      {text}
    </Band>
  );
}

/** Nur fuer den Betreiber: So sieht es ein Kunde. */
export function VorschauBand() {
  const vorschau = useZugang((s) => (s.zugang?.betreiber ? s.vorschau : null));
  const setzeVorschau = useZugang((s) => s.setzeVorschau);
  if (!vorschau) return null;
  return (
    <div role="status" className="bg-fuchsia-700 text-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong>Vorschau als Kunde:</strong> {vorschau.titel}.
          <span className="hidden sm:inline"> Buchen, Einladen und Löschen sind hier gesperrt.</span>
        </span>
        <button type="button" onClick={() => setzeVorschau(null)}
          className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-fuchsia-800 hover:bg-fuchsia-50">
          Vorschau beenden
        </button>
      </div>
    </div>
  );
}
