import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link2, MessageSquare } from 'lucide-react';
import { FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT, paketVon } from '@renten/schema/preise';
import { LinkFeld } from '../components/LinkFeld';
import { PaketBuchung } from '../components/PaketWahl';
import { Sicher } from '../components/Sicher';
import { zumPortal, zurKasse, useWeiterleitung } from '../lib/abo';
import { einladungsLink } from '../lib/einladung';
import {
  bueroVerlassen, einladungErstellen, einladungenLaden, einladungZurueckziehen, mitgliedEntfernen,
  mitgliederLaden, type Mitglied, type OffeneEinladung,
} from '../lib/team';
import { useAuth } from '../store/auth';
import {
  aboAktiv, datum, fruehstartVorbei, tage, tageBis, useZugang, wirksam, type AboAngaben, type Vorschau, type Zugang,
} from '../store/zugang';

// Nur der Betreiber braucht es — Kunden laden es nicht mit.
const BetreiberFruehstart = lazy(() => import('./BetreiberFruehstart').then((m) => ({ default: m.BetreiberFruehstart })));

/**
 * Das Fenster "Abo & Team": Stand des Zugangs, das Buero mit Kollegen und
 * Einladungen, das Abo verwalten oder buchen, fuer Early Adopter die
 * Rueckmeldungen — und fuer den Betreiber eine Vorschau, wie Kunden die Seite
 * sehen, die Early-Adopter-Links und alle Rueckmeldungen.
 *
 * Gebucht und verwaltet wird bei Stripe (Kasse und Kundenportal); hier
 * steht nur, was der Server ueber das Abo weiss.
 */
export function AboTeam() {
  const echt = useZugang((s) => s.zugang);
  const z = useZugang(wirksam);
  const vorschau = useZugang((s) => s.vorschau !== null && s.zugang?.betreiber === true);
  const fuer = useZugang((s) => s.fuer);
  const laden = useZugang((s) => s.laden);

  if (!z) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Ihr Zugang konnte gerade nicht abgefragt werden.</p>
        <button type="button" onClick={() => { if (fuer !== null) void laden(fuer, true); }}
          className="rounded-lg border border-slate-300 px-3 py-2 font-bold text-slate-700 hover:bg-slate-50">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const aboLaeuft = z.abo !== null && aboAktiv(z.abo.status);
  return (
    <div className="space-y-6">
      <Status z={z} />
      {z.fruehstart && <IhreRueckmeldungen z={z} />}
      {z.buero !== null && <Buero z={z} vorschau={vorschau} />}
      {z.rolle === 'inhaber' && aboLaeuft && z.abo && <AboVerwalten abo={z.abo} bereit={z.zahlungBereit} vorschau={vorschau} />}
      {z.rolle !== 'mitglied' && !aboLaeuft && <Buchen z={z} vorschau={vorschau} />}
      {echt?.betreiber && <Betreiber echt={echt} />}
    </div>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{titel}</h3>
      {children}
    </section>
  );
}

function Status({ z }: { z: Zugang }) {
  let titel: string;
  let text: string;
  if (z.quelle === 'vorab' && z.fruehstart && !z.freizugang) {
    titel = 'Early Adopter';
    text = z.aboPflichtAb
      ? `Ab dem ${datum(z.aboPflichtAb)} gibt es den JS-Rentenplaner im Abo — Sie nutzen ihn danach noch `
        + `${FRUEHSTART_MONATE} Monate kostenlos, bis zum ${datum(z.fruehstartBis)}.`
      : `Sobald das Abo startet, nutzen Sie alle Funktionen noch ${FRUEHSTART_MONATE} Monate kostenlos. `
        + 'Bis dahin bleibt alles wie bisher.';
  } else if (z.quelle === 'vorab') {
    titel = z.aboPflichtAb ? `Abo ab dem ${datum(z.aboPflichtAb)}` : 'Noch ohne Abo-Pflicht';
    text = !z.aboPflichtAb ? 'Alle Konten nutzen den JS-Rentenplaner wie bisher.'
      : z.freizugang ? 'Ihr Konto bleibt kostenlos — Sie müssen nichts tun.'
      : z.testBis ? `Danach testen Sie bis zum ${datum(z.testBis)} kostenlos weiter.`
      : 'Bis dahin bleibt alles wie bisher.';
  } else if (z.quelle === 'frei') {
    titel = z.betreiber ? 'Betreiberkonto' : 'Kostenlos freigeschaltet';
    text = z.freizugang === 'bestand' ? 'Ihr Konto bleibt dauerhaft kostenlos (Bestandsschutz).'
      : z.freizugang === 'partner' ? 'Partnerzugang mit allen Funktionen, kostenlos.'
      : 'Voller Zugang zu allen Funktionen.';
  } else if (z.quelle === 'test') {
    titel = `Testphase: noch ${tage(tageBis(z.bis))}`;
    text = `Bis zum ${datum(z.bis)} nutzen Sie alle Funktionen kostenlos. Danach brauchen Sie ein Paket.`;
  } else if (z.quelle === 'fruehstart') {
    titel = `Early Adopter: noch ${tage(tageBis(z.bis))}`;
    text = `Bis zum ${datum(z.bis)} nutzen Sie alle Funktionen kostenlos. Danach erhalten Sie als Dankeschön `
      + `${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr.`;
  } else if (z.quelle === 'abo' && z.paket) {
    titel = `Paket „${paketVon(z.paket).name}“`;
    text = z.rolle === 'mitglied' ? 'Über das Abo Ihres Büros.' : 'Über Ihr Abo.';
  } else if (fruehstartVorbei(z) && z.rolle !== 'mitglied') {
    titel = 'Ihre Early-Adopter-Zeit ist vorbei';
    text = `Danke, dass Sie dabei waren! Ihre kostenlose Zeit endete am ${datum(z.fruehstartBis)}. Als Dankeschön `
      + `erhalten Sie ${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr, wenn Sie ein Paket buchen.`;
  } else {
    titel = 'Kein Paket aktiv';
    text = z.rolle === 'mitglied'
      ? 'Im Abo Ihres Büros ist für Sie gerade kein Platz frei.'
      : 'Wählen Sie ein Paket, um weiterzuarbeiten.';
  }
  return (
    <Abschnitt titel="Ihr Zugang">
      <p className="text-base font-black text-slate-900">{titel}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{text}</p>
    </Abschnitt>
  );
}

/** Early Adopter: die Bitte um Rueckmeldungen und wann zuletzt eine kam. */
function IhreRueckmeldungen({ z }: { z: Zugang }) {
  const oeffneRueckmeldung = useZugang((s) => s.oeffneRueckmeldung);
  return (
    <Abschnitt titel="Ihre Rückmeldungen">
      <p className="text-sm leading-relaxed text-slate-600">
        Als Early Adopter helfen Sie mit Ihren Rückmeldungen, den JS-Rentenplaner besser zu machen — wir bitten
        etwa alle vier Wochen darum.{' '}
        {z.letzteRueckmeldung
          ? <>Ihre letzte kam am <strong className="text-slate-800">{datum(z.letzteRueckmeldung)}</strong>.</>
          : 'Wir freuen uns auf Ihre erste.'}
      </p>
      <button type="button" onClick={oeffneRueckmeldung}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
        <MessageSquare className="h-4 w-4" aria-hidden /> Feedback geben
      </button>
    </Abschnitt>
  );
}

function Hinweis({ fehler }: { fehler: string | null }) {
  if (!fehler) return null;
  return <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>;
}

const fehlgeschlagen = 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';

async function zugangNeuLaden() {
  const { fuer, laden } = useZugang.getState();
  if (fuer !== null) await laden(fuer, true);
}

function Buero({ z, vorschau }: { z: Zugang; vorschau: boolean }) {
  const ich = useAuth((s) => s.email);
  const inhaber = z.rolle === 'inhaber';
  const aboLaeuft = z.abo !== null && aboAktiv(z.abo.status);
  const voll = z.abo !== null && z.abo.belegt >= z.abo.plaetze;
  const [mitglieder, setMitglieder] = useState<Mitglied[] | null>(null);
  const [einladungen, setEinladungen] = useState<OffeneEinladung[]>([]);
  const [neu, setNeu] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const neuLaden = useCallback(async () => {
    if (vorschau) return;
    const [m, e] = await Promise.all([mitgliederLaden(), inhaber ? einladungenLaden() : Promise.resolve([])]);
    setMitglieder(m ?? []);
    setEinladungen(e ?? []);
  }, [vorschau, inhaber]);
  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const einladen = async () => {
    setFehler(null);
    const r = await einladungErstellen();
    if ('fehler' in r) { setFehler(r.fehler); return; }
    setNeu(r.token);
    await neuLaden();
  };

  const tun = async (aufruf: () => Promise<boolean>, danach: () => Promise<unknown>) => {
    setFehler(null);
    if (await aufruf()) await danach();
    else setFehler(fehlgeschlagen);
  };

  return (
    <Abschnitt titel={z.bueroName ? `Büro „${z.bueroName}“` : 'Ihr Büro'}>
      {z.abo && (
        <p className="mb-2 text-sm text-slate-600">
          {z.abo.belegt} von {z.abo.plaetze} {z.abo.plaetze === 1 ? 'Platz' : 'Plätzen'} belegt
        </p>
      )}
      {vorschau ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">In der Vorschau ohne echte Mitglieder.</p>
      ) : mitglieder === null ? (
        <p className="text-sm text-slate-500">Wird geladen …</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {mitglieder.map((m) => (
            <li key={m.nutzer} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-800">
                {m.email}{m.email === ich && <span className="text-slate-500"> (Sie)</span>}
              </span>
              {m.rolle === 'inhaber' && (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-800">verwaltet das Abo</span>
              )}
              {!m.hatPlatz && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">ohne Platz</span>
              )}
              {inhaber && m.rolle === 'mitglied' && (
                <Sicher text="Entfernen" frage="Entfernen?" ja="Ja"
                  onJa={() => tun(() => mitgliedEntfernen(m.nutzer), () => Promise.all([neuLaden(), zugangNeuLaden()]))} />
              )}
            </li>
          ))}
        </ul>
      )}

      {inhaber ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-bold text-slate-800">Kollegen einladen</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Jeder Link gilt 7 Tage und für eine Person. Wer ihn öffnet, legt ein Konto an oder meldet sich an —
            und gehört danach zu Ihrem Büro.
          </p>
          <button type="button" onClick={() => void einladen()} disabled={vorschau || !aboLaeuft || voll}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Link2 className="h-4 w-4" aria-hidden /> Einladungslink erstellen
          </button>
          {aboLaeuft && voll && (
            <p className="mt-2 text-xs text-slate-600">Alle Plätze sind belegt. Weitere buchen Sie unter „Abo verwalten“ dazu.</p>
          )}
          {!aboLaeuft && <p className="mt-2 text-xs text-slate-600">Einladen geht, solange das Abo läuft.</p>}
          {einladungen.length > 0 && (
            <ul className="mt-3 space-y-2">
              {einladungen.map((e) => (
                <li key={e.token} className="rounded-lg border border-slate-200 bg-white p-2">
                  <LinkFeld link={einladungsLink(e.token)} neu={e.token === neu} />
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Offen, gültig bis {datum(e.gueltigBis)}</span>
                    <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja"
                      onJa={() => tun(() => einladungZurueckziehen(e.token), neuLaden)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="flex-1">Sie sind Mitglied. Das Abo verwaltet die Person mit dem Vermerk oben.</span>
          <Sicher text="Büro verlassen" frage="Wirklich austreten?" ja="Ja, austreten" deaktiviert={vorschau}
            onJa={() => tun(bueroVerlassen, zugangNeuLaden)} />
        </div>
      )}
      <Hinweis fehler={fehler} />
    </Abschnitt>
  );
}

function AboVerwalten({ abo, bereit, vorschau }: { abo: AboAngaben; bereit: boolean; vorschau: boolean }) {
  const { laedt, fehler, los } = useWeiterleitung();
  const status = abo.status === 'past_due' ? 'Zahlung offen'
    : abo.kuendigungZum ? `gekündigt zum ${datum(abo.kuendigungZum)}`
    : 'läuft';
  const zeilen: [string, string][] = [
    ['Paket', paketVon(abo.paket).name],
    ['Plätze', String(abo.plaetze)],
    ['Zahlweise', abo.intervall === 'jahr' ? 'jährlich' : 'monatlich'],
    ['Stand', status],
  ];
  if (abo.laeuftBis && !abo.kuendigungZum) zeilen.push(['Nächste Abrechnung', datum(abo.laeuftBis)]);
  return (
    <Abschnitt titel="Abo">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {zeilen.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className={`font-semibold ${k === 'Stand' && abo.status === 'past_due' ? 'text-rose-700' : 'text-slate-800'}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => void los(zumPortal)} disabled={!bereit || vorschau || laedt}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
        {laedt ? 'Einen Moment …' : 'Abo verwalten'}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Plätze ändern, Paket wechseln, Zahlungsdaten, Rechnungen und Kündigung — im Kundenportal unseres
        Zahlungsdienstleisters Stripe.
        {!bereit && !vorschau && ' Das Kundenportal wird gerade eingerichtet.'}
      </p>
      <Hinweis fehler={fehler} />
    </Abschnitt>
  );
}

function Buchen({ z, vorschau }: { z: Zugang; vorschau: boolean }) {
  const { laedt, fehler, los } = useWeiterleitung();
  const dank = `Wenn Sie danach buchen, erhalten Sie als Dankeschön ${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr.`;
  const hinweis = z.freizugang
    ? 'Ihr eigenes Konto bleibt kostenlos. Ein Abo brauchen Sie nur, um Kolleginnen und Kollegen in Ihr Büro '
      + 'zu holen — Ihr eigener Platz zählt dabei mit.'
    : z.quelle === 'fruehstart' || (z.quelle === 'vorab' && z.fruehstart)
      ? `Als Early Adopter brauchen Sie ${z.fruehstartBis ? `bis zum ${datum(z.fruehstartBis)}` : 'bis zum Ende Ihrer kostenlosen Monate'} kein Paket. ${dank}`
    : fruehstartVorbei(z)
      ? `Als Dankeschön für Ihre Zeit als Early Adopter erhalten Sie ${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr.`
    : z.quelle === 'vorab' ? 'Sie können schon jetzt buchen; berechnet wird ab der Buchung.'
    : null;
  return (
    <Abschnitt titel={z.abo ? 'Abo erneuern' : 'Paket buchen'}>
      {hinweis && <p className="mb-3 text-sm leading-relaxed text-slate-600">{hinweis}</p>}
      <PaketBuchung
        bereit={z.zahlungBereit && !vorschau}
        gesperrtText={vorschau ? 'In der Vorschau wird nichts gebucht.' : undefined}
        vorauswahl={z.abo?.paket ?? 'alles'}
        nutzerVorschlag={z.abo?.belegt ?? 1}
        laedt={laedt}
        fehler={fehler}
        onBuchen={(paket, intervall, nutzer) => void los(() => zurKasse(paket, intervall, nutzer))}
      />
    </Abschnitt>
  );
}

const TAG = 86_400_000;
const inTagen = (n: number) => new Date(Date.now() + n * TAG).toISOString();

/** Typische Lagen von Kunden — erfunden, nur fuer die Ansicht. */
function vorschauen(echt: Zugang): Vorschau[] {
  const basis: Zugang = {
    ...echt,
    paket: null, quelle: null, bis: null, testBis: null, aboPflichtAb: inTagen(-30), freizugang: null,
    betreiber: false, buero: null, bueroName: null, rolle: null, hatPlatz: false, abo: null,
    fruehstart: false, fruehstartSeit: null, fruehstartBis: null, letzteRueckmeldung: null,
  };
  const fruehstart = (seit: number, bis: number, letzte: number | null): Partial<Zugang> => ({
    fruehstart: true, fruehstartSeit: inTagen(seit), fruehstartBis: inTagen(bis),
    letzteRueckmeldung: letzte === null ? null : inTagen(letzte),
  });
  const buero = { buero: 'vorschau', bueroName: 'Muster Finanz GmbH' };
  const abo = (x: Partial<AboAngaben> = {}): AboAngaben => ({
    paket: 'alles', intervall: 'monat', plaetze: 3, belegt: 2, status: 'active',
    laeuftBis: inTagen(18), kuendigungZum: null, ...x,
  });
  return [
    { titel: 'Testphase, noch 9 Tage', zugang: { ...basis, paket: 'alles', quelle: 'test', bis: inTagen(9), testBis: inTagen(9) } },
    { titel: 'Testphase abgelaufen', zugang: { ...basis, testBis: inTagen(-2) } },
    {
      titel: 'Paket nur AG-Verkaufshilfen',
      zugang: { ...basis, ...buero, paket: 'ag', quelle: 'abo', rolle: 'inhaber', hatPlatz: true, abo: abo({ paket: 'ag' }), bis: inTagen(18) },
    },
    {
      titel: 'Mitglied ohne Platz',
      zugang: { ...basis, ...buero, rolle: 'mitglied', abo: abo({ plaetze: 2, belegt: 3 }) },
    },
    {
      titel: 'Zahlung fehlgeschlagen',
      zugang: { ...basis, ...buero, paket: 'alles', quelle: 'abo', rolle: 'inhaber', hatPlatz: true, abo: abo({ status: 'past_due' }), bis: inTagen(18) },
    },
    {
      titel: 'Abo gekündigt',
      zugang: { ...basis, ...buero, paket: 'alles', quelle: 'abo', rolle: 'inhaber', hatPlatz: true, abo: abo({ kuendigungZum: inTagen(18) }), bis: inTagen(18) },
    },
    {
      titel: 'Early Adopter, Feedback fällig',
      zugang: { ...basis, paket: 'alles', quelle: 'fruehstart', bis: inTagen(60), ...fruehstart(-30, 60, null) },
    },
    {
      titel: 'Early Adopter, noch 10 Tage',
      zugang: { ...basis, aboPflichtAb: inTagen(-80), paket: 'alles', quelle: 'fruehstart', bis: inTagen(10), ...fruehstart(-100, 10, -5) },
    },
    {
      titel: 'Early Adopter, Zeit vorbei',
      zugang: { ...basis, aboPflichtAb: inTagen(-93), testBis: inTagen(-79), ...fruehstart(-120, -3, -20) },
    },
  ];
}

function Betreiber({ echt }: { echt: Zugang }) {
  const aktiv = useZugang((s) => s.vorschau?.titel ?? null);
  const setzeVorschau = useZugang((s) => s.setzeVorschau);
  return (
    <section className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-fuchsia-800">Betreiber</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-fuchsia-900/70">Abo-Pflicht</dt>
        <dd className="font-semibold text-fuchsia-950">
          {echt.aboPflichtAb ? `ab ${datum(echt.aboPflichtAb)}` : 'noch nicht festgelegt — alle Konten wie bisher'}
        </dd>
        <dt className="text-fuchsia-900/70">Buchung</dt>
        <dd className="font-semibold text-fuchsia-950">
          {echt.zahlungBereit ? 'freigeschaltet' : 'gesperrt, bis die Zahlung eingerichtet ist'}
        </dd>
      </dl>
      <p className="mt-3 text-sm text-fuchsia-950">
        <strong>Vorschau:</strong> So sehen es Kunden — nur in diesem Tab, mit erfundenen Angaben.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {vorschauen(echt).map((v) => (
          <button key={v.titel} type="button" aria-pressed={aktiv === v.titel} onClick={() => setzeVorschau(v)}
            className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
              aktiv === v.titel
                ? 'border-fuchsia-700 bg-fuchsia-700 text-white'
                : 'border-fuchsia-300 bg-white text-fuchsia-900 hover:bg-fuchsia-100'
            }`}>
            {v.titel}
          </button>
        ))}
        {aktiv && (
          <button type="button" onClick={() => setzeVorschau(null)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
            Vorschau beenden
          </button>
        )}
      </div>
      <Suspense fallback={<p className="mt-4 text-xs text-fuchsia-900/70">Einen Moment …</p>}>
        <BetreiberFruehstart />
      </Suspense>
    </section>
  );
}
