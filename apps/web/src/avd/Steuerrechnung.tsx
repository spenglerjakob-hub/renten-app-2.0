import type { ReactNode } from 'react';
import { Calculator, ChevronRight } from 'lucide-react';
import type { AvdSteuerrechnung, LegalParameters, ZveAufschluesselung } from '@renten/engine';
import { euro, euroGenau } from '../components/Feld';

/** Ein Steuersatz mit einer Nachkommastelle: „29,4 %“ */
export const satz = (x: number) =>
  `${(x * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/**
 * DAS INFO-KAESTCHEN unter der Steuerersparnis: der Grenzsteuersatz auf einen
 * Blick, und ein Klick oeffnet die Rechnung dahinter.
 */
export function RechnungKnopf({ r, onOeffnen }: { r: AvdSteuerrechnung; onOeffnen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      aria-haspopup="dialog"
      className="ui-karte mt-3 flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-ui-hover sm:gap-4 sm:p-5"
    >
      <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">
        <Calculator className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ui-tinte">So rechnen wir deine Steuerersparnis</span>
        <span className="mt-0.5 block text-sm text-ui-schiefer">
          Dein Grenzsteuersatz:{' '}
          <span className="whitespace-nowrap font-medium tabular-nums text-ui-tinte">{satz(r.grenzsteuersatz)}</span>
          <span className="hidden sm:inline"> · die Rechnung Schritt für Schritt</span>
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ui-schiefer" aria-hidden />
    </button>
  );
}

/**
 * DIE RECHNUNG HINTER DER STEUERERSPARNIS, Schritt fuer Schritt — der Inhalt
 * der Schublade.
 *
 * Gerechnet wird hier nichts: Alle Zahlen kommen aus `avdSteuerrechnung`,
 * dieselbe Rechnung, aus der die Steuerersparnis auf der Seite stammt. So
 * kann die Aufstellung nicht von dem Betrag abweichen, den sie erklaert.
 */
export function SteuerrechnungInhalt({ r, p, bonus }: {
  r: AvdSteuerrechnung;
  p: LegalParameters;
  /** Einmaliger Berufseinsteigerbonus — gerechnet ist ein laufendes Jahr ohne ihn */
  bonus: number;
}) {
  const partnerOhneEinkommen = r.partner !== null && r.partner.brutto <= 0;
  const etwasWeniger = r.ersparnis > 0 && r.satzAufAbzug < r.grenzsteuersatz - 0.0005;

  return (
    <div className="space-y-7 text-sm leading-relaxed text-ui-tinte">
      {/* 1 — vom Brutto zum zu versteuernden Einkommen */}
      <Abschnitt nr={1} titel={r.splitting ? 'Euer zu versteuerndes Einkommen' : 'Dein zu versteuerndes Einkommen'}>
        {r.splitting && <Unterzeile>Du</Unterzeile>}
        <Einkommen z={r.person} />
        {r.partner && (
          <>
            <Unterzeile>Dein Partner</Unterzeile>
            {partnerOhneEinkommen ? (
              <p className="text-ui-schiefer">Kein eigenes Einkommen angegeben.</p>
            ) : (
              <Einkommen z={r.partner} knapp />
            )}
            <dl className="mt-2">
              <Posten summe text="Gemeinsam" wert={euro(r.zve)} />
            </dl>
          </>
        )}
      </Abschnitt>

      {/* 2 — der Grenzsteuersatz */}
      <Abschnitt nr={2} titel="Dein Grenzsteuersatz">
        <p className="ui-titel text-[32px] font-normal leading-none tabular-nums text-ui-tinte">{satz(r.grenzsteuersatz)}</p>
        <Tarifskala satzEst={r.grenzsteuersatzEst} />
        <p className="mt-3 text-ui-schiefer">
          {r.grenzsteuersatzEst <= 0 ? (
            <>Dein Einkommen liegt unter dem Grundfreibetrag von {euro(p.est.grundfreibetrag)}. Es fällt keine
              Einkommensteuer an — also spart ein Abzug auch keine.</>
          ) : r.splitting ? (
            <>So viel Steuer kostet der nächste Euro eures gemeinsamen Einkommens. Im Splittingtarif gilt der
              Satz der Hälfte davon, {euro(r.zve / 2)}. Umgekehrt spart jeder Euro, den du absetzt, ungefähr so viel.</>
          ) : (
            <>So viel Steuer kostet der nächste Euro deines Einkommens. Umgekehrt spart jeder Euro, den du
              absetzt, ungefähr so viel.</>
          )}
          {r.mitSoli && (
            <> Darin {satz(r.grenzsteuersatzEst)} Einkommensteuer und der Solidaritätszuschlag darauf.</>
          )}
        </p>
      </Abschnitt>

      {/* 3 — der Abzug */}
      <Abschnitt nr={3} titel="Was du absetzen kannst">
        <dl>
          <Posten text={`Dein Beitrag, höchstens ${euro(r.hoechstbetrag)}`} wert={euro(r.eigenbeitragAbziehbar)} />
          <Posten text="Zulagen" wert={euro(r.zulagen)} plus />
          <Posten summe text="Sonderausgabenabzug (§ 10a EStG)" wert={euro(r.abzug)} />
        </dl>
      </Abschnitt>

      {/* 4 — Steuer mit und ohne Abzug */}
      <Abschnitt nr={4} titel="Steuer ohne und mit Abzug">
        <dl>
          <Posten text="Steuer ohne Abzug" wert={euro(r.steuerOhneAbzug.gesamt)} />
          <Posten text="Steuer mit Abzug" wert={euro(r.steuerMitAbzug.gesamt)} minus />
          <Posten summe text="Ersparnis durch den Abzug" wert={euro(r.ersparnis)} />
        </dl>
        {r.ersparnis > 0 && (
          <p className="mt-2 text-xs text-ui-schiefer">
            Das sind im Schnitt {satz(r.satzAufAbzug)} der abgesetzten {euro(r.abzug)}
            {etwasWeniger && <> — etwas weniger als dein Grenzsteuersatz: Der Abzug senkt das Einkommen, und mit ihm sinkt der Satz</>}.
            {(r.steuerOhneAbzug.soli > 0 || r.steuerOhneAbzug.kirchensteuer > 0) && <> Steuer einschließlich Solidaritätszuschlag.</>}
          </p>
        )}
      </Abschnitt>

      {/* 5 — Guenstigerpruefung */}
      <Abschnitt nr={5} titel="Die Günstigerprüfung">
        <dl>
          <Posten text="Ersparnis durch den Abzug" wert={euro(r.ersparnis)} />
          <Posten text="Zulagen, die du ohnehin bekommst" wert={euro(r.zulagen)} minus />
          <Posten
            summe
            text="Dein Steuervorteil über die Zulagen hinaus"
            wert={euro(r.ueberZulagen)}
          />
        </dl>
        <p className="mt-2 text-ui-schiefer">
          {r.abzug <= 0 ? (
            <>Ohne Beitrag gibt es weder Zulagen noch etwas abzusetzen.</>
          ) : r.guenstigerAlsZulage ? (
            <>Im Monat sind das {euroGenau(r.ueberZulagen / 12)}. Das Finanzamt prüft mit deiner
              Steuererklärung von selbst, ob der Abzug mehr bringt als die Zulage. Weil er das tut, bekommst
              du den Unterschied als Erstattung — die Zulage bleibt im Depot.</>
          ) : (
            <>Bei {r.splitting ? 'eurem' : 'deinem'} Einkommen ist die Zulage der günstigere Weg. Das Finanzamt
              bleibt dann bei der Zulage — einen zusätzlichen Steuervorteil gibt es nicht.</>
          )}
        </p>
      </Abschnitt>

      {/* Annahmen */}
      <div className="ui-innen space-y-1.5 px-3 py-3 text-xs leading-relaxed text-ui-schiefer">
        <p>
          Steuerjahr {p.jahr}{p.extrapoliert ? ` — die amtlichen Werte stehen noch aus (${p.quelle})` : ''}.
          Gerechnet für ein laufendes Beitragsjahr mit {r.splitting ? 'eurem' : 'deinem'} Einkommen von heute.
          {bonus > 0 && <> Im ersten Jahr kommt der Berufseinsteigerbonus von {euro(bonus)} zu den Zulagen dazu.</>}
        </p>
        {r.splitting && (
          <p>
            Verheiratete werden zusammen veranlagt. Welche Steuerklassen auf euren Lohnabrechnungen stehen,
            spielt dafür keine Rolle — sie regeln nur den monatlichen Lohnsteuerabzug.
          </p>
        )}
        <p>
          Ohne Kirchensteuer, gesetzlich krankenversichert mit dem durchschnittlichen Zusatzbeitrag. Keine
          Steuerberatung.
        </p>
      </div>
    </div>
  );
}

function Abschnitt({ nr, titel, children }: { nr: number; titel: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-base font-medium text-ui-tinte">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-innen text-xs tabular-nums text-ui-schiefer"
        >
          {nr}
        </span>
        {titel}
      </h3>
      {children}
    </section>
  );
}

function Unterzeile({ children }: { children: ReactNode }) {
  return <p className="mb-0.5 mt-3 text-xs font-medium uppercase tracking-wide text-ui-schiefer first:mt-0">{children}</p>;
}

/** Vom Brutto zum zvE; `knapp` fasst die Abzuege zu einer Zeile zusammen. */
function Einkommen({ z, knapp = false }: { z: ZveAufschluesselung; knapp?: boolean }) {
  const abzuege = z.arbeitnehmerPauschbetrag + z.vorsorgeaufwand + z.sonderausgabenPauschbetrag;
  return (
    <dl>
      <Posten text="Bruttojahresgehalt" wert={euro(z.brutto)} />
      {knapp ? (
        <Posten text="Pauschbeträge und Sozialversicherung" wert={euro(abzuege)} minus />
      ) : (
        <>
          <Posten text="Arbeitnehmer-Pauschbetrag" wert={euro(z.arbeitnehmerPauschbetrag)} minus />
          <Posten text="Renten-, Kranken- und Pflegeversicherung" wert={euro(z.vorsorgeaufwand)} minus />
          <Posten text="Sonderausgaben-Pauschbetrag" wert={euro(z.sonderausgabenPauschbetrag)} minus />
        </>
      )}
      <Posten summe text="Zu versteuerndes Einkommen" wert={euro(z.zve)} />
    </dl>
  );
}

function Posten({ text, wert, minus = false, plus = false, summe = false }: {
  text: string; wert: string; minus?: boolean; plus?: boolean; summe?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        summe ? 'mt-1 border-t border-ui-tinte/25 pt-1.5 font-medium' : 'py-0.5'
      }`}
    >
      <dt className={summe ? 'text-ui-tinte' : 'text-ui-tinte/80'}>{text}</dt>
      <dd className="shrink-0 whitespace-nowrap tabular-nums text-ui-tinte">
        {minus ? '− ' : plus ? '+ ' : ''}{wert}
      </dd>
    </div>
  );
}

/**
 * Wo der Satz im Tarif liegt — von 0 bis 45 %, mit dem Eingangssatz (14 %)
 * und dem Spitzensatz (42 %) als Marken. Nur zum Sehen; die Zahl steht als
 * Text darueber.
 */
function Tarifskala({ satzEst }: { satzEst: number }) {
  const lage = (s: number) => `${Math.min(100, Math.max(0, (s / 0.45) * 100))}%`;
  return (
    <div aria-hidden className="mt-4">
      <div className="relative h-2 rounded-full bg-ui-innen">
        <div className="absolute inset-y-0 left-0 rounded-full bg-ui-knopf/50" style={{ width: lage(satzEst) }} />
        <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-ui-tinte" style={{ left: lage(satzEst) }} />
      </div>
      <div className="relative mt-1.5 h-4 whitespace-nowrap text-[11px] tabular-nums text-ui-schiefer">
        <span className="absolute left-0">0&nbsp;%</span>
        <span className="absolute -translate-x-1/2" style={{ left: lage(0.14) }}>14&nbsp;%</span>
        <span className="absolute -translate-x-1/2" style={{ left: lage(0.42) }}>42&nbsp;%</span>
      </div>
    </div>
  );
}
