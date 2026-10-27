import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link2, MessageSquare } from 'lucide-react';
import { FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT, paketVon } from '@renten/schema/preise';
import { LinkFeld } from '../components/LinkFeld';
import { PaketBuchung } from '../components/PaketWahl';
import { Sicher } from '../components/Sicher';
import { FEHLER, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Marke, Vermerk } from '../components/stil';
import { preiseAbgleichen, zumPortal, zurKasse, useWeiterleitung, type Abgleich } from '../lib/abo';
import { einladungsLink } from '../lib/einladung';
import {
  bueroVerlassen, einladungErstellen, einladungenLaden, einladungZurueckziehen, mitgliedEntfernen,
  mitgliederLaden, type Mitglied, type OffeneEinladung,
} from '../lib/team';
import { useAuth } from '../store/auth';
import {
  aboAktiv, datum, deckt, fruehstartVorbei, tage, tageBis, useZugang, wirksam, type AboAngaben, type Vorschau, type Zugang,
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
      <div className="space-y-3 text-sm text-ui-schiefer">
        <p>Ihr Zugang konnte gerade nicht abgefragt werden.</p>
        <button type="button" onClick={() => { if (fuer !== null) void laden(fuer, true); }} className={KNOPF_ZWEIT}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  const aboLaeuft = z.abo !== null && aboAktiv(z.abo.status);
  return (
    <div className="divide-y divide-ui-linie">
      <Status z={z} />
      {z.fruehstart && <IhreRueckmeldungen z={z} />}
      {z.buero !== null && <Buero z={z} vorschau={vorschau} />}
      {z.rolle === 'inhaber' && aboLaeuft && z.abo && <AboVerwalten abo={z.abo} bereit={z.zahlungBereit} vorschau={vorschau} />}
      {z.rolle !== 'mitglied' && !aboLaeuft && <Buchen z={z} vorschau={vorschau} />}
      {echt?.betreiber && <Betreiber echt={echt} />}
    </div>
  );
}

/** Ein Abschnitt des Fensters — getrennt durch Haarlinien, die Ueberschrift ruhig statt in Versalien. */
function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <h3 className="mb-2 text-base font-medium text-ui-tinte">{titel}</h3>
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
      {/* Der Stand als Aussage in der Schrift der Titel — wie die Saetze der Beratung, nicht fett. */}
      <p className="ui-titel text-[22px] leading-snug text-ui-tinte">{titel}</p>
      <p className="mt-1 text-sm leading-relaxed text-ui-schiefer">{text}</p>
    </Abschnitt>
  );
}

/** Early Adopter: die Bitte um Rueckmeldungen und wann zuletzt eine kam. */
function IhreRueckmeldungen({ z }: { z: Zugang }) {
  const oeffneRueckmeldung = useZugang((s) => s.oeffneRueckmeldung);
  return (
    <Abschnitt titel="Ihre Rückmeldungen">
      <p className="text-sm leading-relaxed text-ui-schiefer">
        Als Early Adopter helfen Sie mit Ihren Rückmeldungen, den JS-Rentenplaner besser zu machen — wir bitten
        etwa alle vier Wochen darum.{' '}
        {z.letzteRueckmeldung
          ? <>Ihre letzte kam am <span className="font-medium text-ui-tinte">{datum(z.letzteRueckmeldung)}</span>.</>
          : 'Wir freuen uns auf Ihre erste.'}
      </p>
      <button type="button" onClick={oeffneRueckmeldung} className={`mt-3 ${KNOPF_ZWEIT}`}>
        <MessageSquare className="h-4 w-4" aria-hidden /> Feedback geben
      </button>
    </Abschnitt>
  );
}

function Fehler({ fehler }: { fehler: string | null }) {
  if (!fehler) return null;
  return <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>;
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
  // Nur wer die Mitarbeiterberatung nutzen kann, braucht den Hinweis auf freigegebene Firmen.
  const mitarbeiterberatung = deckt(z, 'ag');
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
        <p className="text-sm text-ui-schiefer">
          {z.abo.belegt} von {z.abo.plaetze} {z.abo.plaetze === 1 ? 'Platz' : 'Plätzen'} belegt
        </p>
      )}
      {vorschau ? (
        <p className="ui-innen mt-2 px-3 py-2 text-sm text-ui-schiefer">In der Vorschau ohne echte Mitglieder.</p>
      ) : mitglieder === null ? (
        <p className="mt-2 text-sm text-ui-schiefer">Wird geladen …</p>
      ) : (
        /* Zeilen mit Haarlinien wie die Liste der Beratungen. „ohne Platz“ verlangt etwas und traegt die
           Marke; wer das Abo verwaltet, ist nur ein Vermerk. */
        <ul className="mt-2 divide-y divide-ui-linie border-y border-ui-linie">
          {mitglieder.map((m) => (
            <li key={m.nutzer} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ui-tinte">
                {m.email}{m.email === ich && <span className="text-ui-schiefer"> (Sie)</span>}
              </span>
              {m.rolle === 'inhaber' && <Vermerk>verwaltet das Abo</Vermerk>}
              {!m.hatPlatz && <Marke>ohne Platz</Marke>}
              {inhaber && m.rolle === 'mitglied' && (
                <Sicher text="Entfernen" frage="Entfernen?" ja="Ja"
                  onJa={() => tun(() => mitgliedEntfernen(m.nutzer), () => Promise.all([neuLaden(), zugangNeuLaden()]))} />
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Was beim Ausscheiden mit den Firmen der Mitarbeiterberatung geschieht (Migration …_bav_gemeinsam) */}
      {inhaber && mitarbeiterberatung && mitglieder?.some((m) => m.rolle === 'mitglied') && (
        <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
          Entfernen Sie einen Kollegen, übernehmen Sie in der Mitarbeiterberatung die Firmen, die er fürs Büro freigegeben
          hat, mit allen Beratungen. Seine Beratungen in Firmen anderer Kollegen bleiben dort.
        </p>
      )}

      {inhaber ? (
        <div className="ui-innen mt-4 p-4">
          <p className="text-sm font-medium text-ui-tinte">Kollegen einladen</p>
          <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
            Jeder Link gilt 7 Tage und für eine Person. Wer ihn öffnet, legt ein Konto an oder meldet sich an —
            und gehört danach zu Ihrem Büro.
          </p>
          <button type="button" onClick={() => void einladen()} disabled={vorschau || !aboLaeuft || voll}
            className={`mt-3 ${KNOPF_ZWEIT} disabled:cursor-not-allowed`}>
            <Link2 className="h-4 w-4" aria-hidden /> Einladungslink erstellen
          </button>
          {aboLaeuft && voll && (
            <p className="mt-2 text-xs text-ui-schiefer">Alle Plätze sind belegt. Weitere buchen Sie unter „Abo verwalten“ dazu.</p>
          )}
          {!aboLaeuft && <p className="mt-2 text-xs text-ui-schiefer">Einladen geht, solange das Abo läuft.</p>}
          {einladungen.length > 0 && (
            <ul className="mt-3 space-y-2">
              {einladungen.map((e) => (
                <li key={e.token} className="rounded-[8px] border border-ui-linie bg-ui-karte p-3">
                  <LinkFeld link={einladungsLink(e.token)} neu={e.token === neu} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-ui-schiefer">Offen, gültig bis {datum(e.gueltigBis)}</span>
                    <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja"
                      onJa={() => tun(() => einladungZurueckziehen(e.token), neuLaden)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ui-schiefer">
          <span className="flex-1">
            Sie sind Mitglied. Das Abo verwaltet die Person mit dem Vermerk oben.
            {mitarbeiterberatung && ' Treten Sie aus, gehen die Firmen, die Sie in der Mitarbeiterberatung fürs Büro freigegeben haben, mit allen Beratungen an diese Person.'}
          </span>
          <Sicher text="Büro verlassen" frage="Wirklich austreten?" ja="Ja, austreten" deaktiviert={vorschau}
            onJa={() => tun(bueroVerlassen, zugangNeuLaden)} />
        </div>
      )}
      <Fehler fehler={fehler} />
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
      {/* Rot nur, wenn die Zahlung offen ist — das ist ein Fehler, kein Stand. */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {zeilen.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ui-schiefer">{k}</dt>
            <dd className={`font-medium ${k === 'Stand' && abo.status === 'past_due' ? 'text-rose-700' : 'text-ui-tinte'}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => void los(zumPortal)} disabled={!bereit || vorschau || laedt}
        className={`mt-4 ${KNOPF} disabled:cursor-not-allowed`}>
        {laedt ? 'Einen Moment …' : 'Abo verwalten'}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
        Plätze ändern, Paket wechseln, Zahlungsdaten, Rechnungen und Kündigung — im Kundenportal unseres
        Zahlungsdienstleisters Stripe.
        {!bereit && !vorschau && ' Das Kundenportal wird gerade eingerichtet.'}
      </p>
      <Fehler fehler={fehler} />
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
      {hinweis && <p className="mb-4 text-sm leading-relaxed text-ui-schiefer">{hinweis}</p>}
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
      titel: 'Paket nur Arbeitgeber-Vorsorgemodelle',
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
    /*
      Der Bereich des Betreibers hebt sich durch den gestrichelten Rand ab,
      nicht durch eine eigene Farbe — wie der Hinweis auf Beispielwerte im
      Rechner: Er gehoert nicht zu dem, was Kunden sehen.
    */
    <section className="py-5 last:pb-0">
      <div className="rounded-[10px] border border-dashed border-ui-schiefer/60 p-4 sm:p-5">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-medium text-ui-tinte">
          Betreiber <Vermerk>nur für Sie sichtbar</Vermerk>
        </h3>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-ui-schiefer">Abo-Pflicht</dt>
          <dd className="font-medium text-ui-tinte">
            {echt.aboPflichtAb ? `ab ${datum(echt.aboPflichtAb)}` : 'noch nicht festgelegt — alle Konten wie bisher'}
          </dd>
          <dt className="text-ui-schiefer">Buchung</dt>
          <dd className="font-medium text-ui-tinte">
            {echt.zahlungBereit ? 'freigeschaltet' : 'gesperrt, bis die Zahlung eingerichtet ist'}
          </dd>
        </dl>
        <p className="mt-4 text-sm text-ui-tinte">
          <span className="font-medium">Vorschau:</span> So sehen es Kunden — nur in diesem Tab, mit erfundenen Angaben.
        </p>
        {/* Gewaehlt wie ein Reiter: gefuellt in Soot, die anderen mit Kontur. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vorschauen(echt).map((v) => (
            <button key={v.titel} type="button" aria-pressed={aktiv === v.titel} onClick={() => setzeVorschau(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                aktiv === v.titel
                  ? 'border-ui-dunkel bg-ui-dunkel text-white'
                  : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
              }`}>
              {v.titel}
            </button>
          ))}
          {aktiv && (
            <button type="button" onClick={() => setzeVorschau(null)} className={KNOPF_KLEIN}>
              Vorschau beenden
            </button>
          )}
        </div>
        <PreiseAbgleichen />
        <Suspense fallback={<p className="mt-4 text-xs text-ui-schiefer">Einen Moment …</p>}>
          <BetreiberFruehstart />
        </Suspense>
      </div>
    </section>
  );
}

const ABGLEICH_STAND: Record<string, string> = {
  neu: 'neu angelegt', ersetzt: 'neuer Preis, alter archiviert', aktualisiert: 'aktualisiert',
  unveraendert: 'unverändert', entfernt: 'entfernt', stripe_tax: 'über Stripe Tax',
};

/**
 * Stripe auf den Stand der Preisliste bringen. Nach jeder Preisaenderung in
 * `packages/schema/src/preise.ts` einmal ausfuehren; was schon stimmt, bleibt.
 */
function PreiseAbgleichen() {
  const [laedt, setLaedt] = useState(false);
  const [ergebnis, setErgebnis] = useState<Abgleich | null>(null);
  const los = async () => {
    setLaedt(true);
    setErgebnis(await preiseAbgleichen());
    setLaedt(false);
  };
  return (
    <div className="mt-5 border-t border-ui-linie pt-4">
      <p className="text-sm text-ui-tinte">
        <span className="font-medium">Stripe:</span> Produkte, Staffelpreise, Early-Adopter-Gutschein, Steuersatz und Kundenportal
        aus der Preisliste anlegen bzw. nachziehen.
      </p>
      <button type="button" onClick={() => void los()} disabled={laedt} className={`mt-2 ${KNOPF_KLEIN}`}>
        {laedt ? 'Gleiche ab …' : 'Preise in Stripe abgleichen'}
      </button>
      {ergebnis && 'fehler' in ergebnis && <Fehler fehler={ergebnis.fehler} />}
      {ergebnis && 'bericht' in ergebnis && (
        <div className="ui-innen mt-3 p-3 text-xs text-ui-tinte">
          <p className="font-medium">
            Abgeglichen im {ergebnis.modus === 'live' ? 'Live-Modus (echte Zahlungen)' : 'Testmodus'}:
          </p>
          <ul className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {Object.entries(ergebnis.bericht).map(([k, v]) => (
              <li key={k} className="contents"><span className="text-ui-schiefer">{k}</span><span>{ABGLEICH_STAND[v] ?? v}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
