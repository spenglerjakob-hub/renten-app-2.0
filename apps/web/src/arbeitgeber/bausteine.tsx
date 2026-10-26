import { useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Info } from 'lucide-react';
import type {
  BetriebAngaben, BetriebErgebnis, BetriebGruppe, GehaltsVergleich,
} from '@renten/engine';
import { SeitenKopf } from '../components/SeitenKopf';
import { AuswahlFeld, ProzentFeld, ZahlFeld, euro, euroGenau, prozent } from '../components/Feld';
import { AKZENT, Hervor, KNOPF_KLEIN, LINK } from '../components/stil';

/**
 * Bausteine der Arbeitgeber-Seiten (Zuschussmodell, Festbetrag, Matching,
 * bKV). Gemeinsam, damit alle dieselbe Rechnung gleich zeigen — zwei
 * Fassungen desselben Vergleichs liefen auseinander.
 *
 * IM STIL DER MITARBEITERBERATUNG (Etappe „Ihre Rechnung“): weisse Karten mit
 * Haarlinie, Kennzahlen als Wertkarten, die eine Akzentkarte fuer das, was in
 * den Vertrag fliesst, Aufstellungen mit der Summe unter einer Linie in Tinte,
 * Daten einfarbig. Anders als die Beratung druckt die Seite sich selbst — fuer
 * den Arbeitgeber auf zwei Seiten. Deshalb traegt jeder Baustein seine
 * kompakten Druckgroessen (`print:`) mit; sie stehen im Stylesheet hinter den
 * Bildschirmgroessen und gewinnen auf dem Papier.
 */

/** Eine Karte der Seite — im Druck eng und ohne Schatten. */
export const KARTE = 'ui-karte p-5 sm:p-6 print:p-2 print:shadow-none';
/** Titel einer Karte wie in der Beratung; im Druck klein. */
export const KARTE_TITEL = 'text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl print:text-sm';
/** Ein erklaerender Satz unter dem Titel. */
export const ERKLAERUNG = 'mt-1 text-sm leading-relaxed text-ui-schiefer print:text-[10px]';
/** Die Fussnote unter einer Rechnung. */
export const FUSSNOTE = 'mt-2 text-xs leading-relaxed text-ui-schiefer print:mt-1 print:text-[9px] print:leading-snug';
/** Kopfzeile einer Tabelle: leise, die Spalte des Modells in Tinte. */
export const TABELLE_KOPF = 'text-xs text-ui-schiefer print:text-[11px]';
/** Eine Zeile einer Tabelle mit Haarlinie; die gewaehlte bekommt die Innenflaeche. */
export const TABELLE_ZEILE = 'border-t border-ui-linie';
/** Zelle mit Luft am Bildschirm, eng im Druck. */
export const ZELLE = 'py-1.5 print:py-0.5';
export const KOPFZELLE = 'py-1 print:py-0.5';
/*
 * Schrift einer Tabelle im Druck: 10 Punkt mit der Zeilenhoehe des
 * Fliesstexts. `text-sm` am Bildschirm braechte sonst seine 20 Punkt
 * Zeilenhoehe mit aufs Papier — und Seite 1 liefe ueber.
 */
export const TABELLE_DRUCK = 'print:text-[10px] print:leading-normal';

/**
 * Punkte mit Gedankenstrich wie „Gut zu wissen“ in der Beratung — statt
 * Aufzaehlungszeichen. Das Wichtige darin steht in Tinte, ohne Fettdruck.
 */
export const STRICHE = "[&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-ui-asche [&>li]:before:content-['—'] [&_strong]:font-medium";

export function Punkte({ children, klasse = '' }: { children: ReactNode; klasse?: string }) {
  return (
    <ul className={`space-y-1.5 text-sm leading-relaxed text-ui-tinte print:space-y-0.5 print:text-[10px] print:leading-snug ${STRICHE} ${klasse}`}>
      {children}
    </ul>
  );
}

/**
 * NACHSCHLAGEN — Wissen zur Umsetzung (Arbeitgeberwechsel,
 * Versorgungsordnung), das der Berater braucht, aber nicht bei jeder
 * Rechnung liest. Am Bildschirm eingeklappt, damit Rechnung und Ergebnis die
 * Seite tragen und nicht drei Spalten Paragraphen; im DRUCK immer offen —
 * es ist Seite 2 fuer den Arbeitgeber. Der Kopf traegt `druck-kopf`, sonst
 * blendete das Druck-CSS mit allen Knoepfen auch die Ueberschrift aus.
 * Aufgebaut wie die einklappbaren Karten der Beratung (AkkordeonKarte).
 */
export function Nachschlagen({ titel, kurz, klasse = 'print:p-2', children }: {
  titel: ReactNode;
  /** Ein Satz, der auch eingeklappt stehen bleibt */
  kurz?: ReactNode;
  klasse?: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <section className={`ui-karte overflow-hidden print:break-inside-avoid print:overflow-visible print:shadow-none ${klasse}`}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="druck-kopf flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ui-innen sm:px-6 sm:py-5 print:p-0"
      >
        <h2 className={KARTE_TITEL}>{titel}</h2>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ui-schiefer print:hidden">
          {offen ? 'Einklappen' : 'Anzeigen'}
          <ChevronDown className={`h-4 w-4 transition-transform ${offen ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      <div className={`${kurz || offen ? 'px-5 pb-5 sm:px-6 sm:pb-6' : 'hidden'} print:block print:p-0`}>
        {kurz && <p className="text-sm leading-relaxed text-ui-schiefer print:mt-1 print:text-xs">{kurz}</p>}
        <div className={offen ? 'block' : 'hidden print:block'}>{children}</div>
      </div>
    </section>
  );
}

/** Ein Kasten der Eingabespalte — eine Karte wie in der Beratung. */
export function Kasten({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="ui-karte space-y-4 p-5 sm:p-6 print:space-y-2 print:p-2 print:shadow-none">
      <h2 className="text-lg font-medium tracking-[-0.01em] text-ui-tinte print:text-xs">{titel}</h2>
      {children}
    </section>
  );
}

/**
 * Was hinter den Umlagen steckt — aufklappbar unter dem Feld, damit die
 * Eingabe nicht zum Ratespiel wird. Die Saetze fuer U1 und U2 legt jede
 * Krankenkasse selbst fest; genannt sind deshalb Spannen, und die beiden
 * Knoepfe setzen typische Summen, keine Werte einer bestimmten Kasse.
 */
export function UmlagenErklaerung({ onWaehlen }: { onWaehlen: (satz: number) => void }) {
  return (
    <details className="ui-innen px-3 py-2.5 text-sm text-ui-tinte print:text-xs [&_strong]:font-medium [&_strong]:text-ui-tinte">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5 text-ui-schiefer" aria-hidden /> Was sind die Umlagen?
      </summary>
      <p className="mt-2 leading-relaxed text-ui-schiefer">
        Drei Beiträge, die <strong>allein der Arbeitgeber</strong> trägt — berechnet auf das
        rentenversicherungspflichtige Entgelt. Entgeltumwandlung, die beitragsfrei ist, senkt auch diese
        Grundlage; deshalb spart der Arbeitgeber sie mit.
      </p>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className="font-medium">U1 — Entgeltfortzahlung bei Krankheit</dt>
          <dd className="leading-relaxed text-ui-schiefer">
            Nur Betriebe mit bis zu 30 Beschäftigten. Dafür erstattet die Krankenkasse einen Teil des Lohns, den
            der Arbeitgeber im Krankheitsfall weiterzahlt. Der Satz hängt von Kasse und gewähltem
            Erstattungssatz ab, meist etwa <strong>1 bis 3,5 %</strong>.
          </dd>
        </div>
        <div>
          <dt className="font-medium">U2 — Mutterschaft</dt>
          <dd className="leading-relaxed text-ui-schiefer">
            Alle Arbeitgeber, unabhängig von der Größe. Erstattet werden die Aufwendungen während Mutterschutz und
            Beschäftigungsverbot vollständig. Meist etwa <strong>0,2 bis 0,8 %</strong>, je nach Kasse.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Insolvenzgeldumlage</dt>
          <dd className="leading-relaxed text-ui-schiefer">
            Alle privaten Arbeitgeber. Sie finanziert das Insolvenzgeld der Bundesagentur für Arbeit, das
            Beschäftigte bei einer Pleite ihres Arbeitgebers bis zu drei Monate lang erhalten. Einheitlicher Satz,
            derzeit <strong>0,15 %</strong>.
          </dd>
        </div>
      </dl>
      <p className="mt-2 leading-relaxed text-ui-schiefer">
        Die genauen Sätze stehen in der Lohnabrechnung bzw. bei der Krankenkasse des Mitarbeiters. Typische Summen:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onWaehlen(0.025)} className={KNOPF_KLEIN}>
          bis 30 Beschäftigte ≈ 2,5 %
        </button>
        <button type="button" onClick={() => onWaehlen(0.006)} className={KNOPF_KLEIN}>
          über 30 Beschäftigte ≈ 0,6 %
        </button>
      </div>
    </details>
  );
}

/** Eine Spalte „Wenn ein Mitarbeiter wechselt“ — Innenflaeche statt eigener Farbe je Topf. */
export function WechselSpalte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="ui-innen p-4 print:p-2">
      <h3 className="text-sm font-medium text-ui-tinte print:text-xs">{titel}</h3>
      <ul className={`mt-2 space-y-1.5 text-xs leading-relaxed text-ui-tinte print:mt-1 print:space-y-0.5 print:text-[10px] print:leading-snug ${STRICHE}`}>
        {children}
      </ul>
    </div>
  );
}

/**
 * Eine Kennzahl wie die Wertkarten der Beratung: das Etikett leise, die Zahl
 * gross. Die Akzentkarte (`akzent`) zeigt, was in die Vorsorge fliesst — die
 * Zahl in Inter Tight und hervorgehoben, wie „In Ihre Vorsorge“.
 */
export function Kachel(props: {
  titel: string; betrag: number; unten: string; akzent?: boolean;
  /** Mit Cent — fuer Tarifbeitraege wie 21,88 EUR, die sonst gerundet neben dem genauen Wert stuenden */
  genau?: boolean;
}) {
  const wert = props.genau ? euroGenau(props.betrag) : euro(props.betrag);
  return (
    <div className={`p-5 sm:p-6 print:p-2 print:shadow-none ${props.akzent ? AKZENT : 'ui-karte text-ui-tinte'}`}>
      <p className={`text-sm print:text-xs ${props.akzent ? '' : 'text-ui-schiefer'}`}>{props.titel}</p>
      <p className={`mt-1 tabular-nums ${props.akzent
        ? 'ui-titel text-[40px] leading-none print:text-2xl'
        : 'text-[28px] font-medium leading-tight print:text-xl'}`}>
        {props.akzent ? <Hervor>{wert}</Hervor> : wert}
      </p>
      <p className={`mt-2 text-xs print:mt-1 print:text-[11px] ${props.akzent ? '' : 'text-ui-schiefer'}`}>{props.unten}</p>
    </div>
  );
}

/** Die Rechnung einer Seite im Monat — wie „Was in Ihre Vorsorge fließt“ in der Beratung. */
export function Bon({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className={KARTE}>
      <h2 className={KARTE_TITEL}>{titel} im Monat</h2>
      <dl className="mt-3 text-sm print:mt-1 print:text-xs">{children}</dl>
    </div>
  );
}

/**
 * Eine Zeile einer Aufstellung (wie `Posten`): Text leise, Betrag in Tinte;
 * die Summe unter einer Linie in Tinte. `stark` hebt eine Zeile ohne Linie
 * hervor — fuer Ergebnisse, die keine Summe der Zeilen darueber sind.
 */
export function Zeile({ text, betrag, summe, stark }: { text: string; betrag: number; summe?: boolean; stark?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 print:py-0 ${
      summe ? 'mt-1 border-t border-ui-tinte pt-2 font-medium text-ui-tinte print:mt-0.5 print:pt-0.5'
        : stark ? 'font-medium text-ui-tinte' : 'text-ui-schiefer'
    }`}>
      <dt>{text}</dt>
      <dd className="text-right tabular-nums text-ui-tinte">{euro(betrag)}</dd>
    </div>
  );
}

/** Erlaeuterndes Wort hinter dem Betrag — auf schmalen Bildschirmen weggelassen. */
export function Zusatz({ children }: { children: ReactNode }) {
  return <span className="hidden font-normal text-ui-schiefer sm:inline">{children}</span>;
}

/**
 * Eine Zeile der Vergleichstabellen, wie die Probeabrechnung der Beratung:
 * Haarlinien zwischen den Zeilen, Summen unter einer Linie in Tinte. Die
 * Zeile, auf die es ankommt (`hervor`), liegt auf der Innenflaeche — statt
 * gelb.
 */
export function VergleichZeile(props: { text: string; links: ReactNode; rechts: ReactNode; summe?: boolean; hervor?: boolean }) {
  return (
    <tr className={`border-t ${props.summe ? 'border-ui-tinte font-medium text-ui-tinte' : 'border-ui-linie'} ${props.hervor ? 'bg-ui-innen' : ''}`}>
      <td className={`${ZELLE} pr-2`}>{props.text}</td>
      <td className={`${ZELLE} whitespace-nowrap text-right tabular-nums`}>{props.links}</td>
      <td className={`${ZELLE} whitespace-nowrap pl-3 text-right tabular-nums`}>{props.rechts}</td>
    </tr>
  );
}

/** Ein Balken mit Betrag — einfarbig abgestuft wie die Anteile der Beratung (`farbe`: bg-ui-…). */
export function Balken({ text, betrag, max, farbe }: { text: string; betrag: number; max: number; farbe: string }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm text-ui-schiefer print:text-xs">
        <span>{text}</span>
        <span className="font-medium tabular-nums text-ui-tinte">{euro(betrag)}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-ui-linie">
        <div className={`h-2.5 rounded-full ${farbe} print:[print-color-adjust:exact]`} style={{ width: `${Math.max(2, (betrag / max) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Die Hinweise der Rechnung (Grenzen, Sonderfaelle) — auf der Innenflaeche, mit Symbol. */
export function Hinweiszeilen({ hinweise }: { hinweise: readonly string[] }) {
  if (hinweise.length === 0) return null;
  return (
    <section className="space-y-1.5">
      {hinweise.map((h, i) => (
        <p key={i} className="ui-innen flex gap-2 px-3 py-2 text-xs leading-relaxed text-ui-tinte print:px-2 print:py-1 print:text-[9px]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ui-schiefer print:hidden" aria-hidden />
          <span>{h}</span>
        </p>
      ))}
    </section>
  );
}

/**
 * „Dasselbe Geld als Gehaltserhoehung?" — beide Wege Zeile fuer Zeile.
 *
 * HERLEITUNG STATT NUR ERGEBNIS. Die Karten oben nennen die Nettokosten, der
 * Vergleich rechnet mit den Personalkosten VOR Steuern — ohne die
 * Zwischenschritte stehen zwei Zahlen da, deren Zusammenhang niemand sieht.
 */
export function GehaltVergleich(props: {
  modell: string;
  g: GehaltsVergleich;
  steuersatz: number;
  mitUmlagen: boolean;
  agZahlung: number;
  agAbgabenGespart: number;
  agKostenVorSteuer: number;
  agSteuer: number;
  agNetto: number;
  gesamtVorsorge: number;
}) {
  const { g } = props;
  const max = Math.max(props.gesamtVorsorge, g.nettoMonat, 1);
  return (
    <section className={`${KARTE} print:break-inside-avoid`}>
      <h2 className={KARTE_TITEL}>Dasselbe Geld als Gehaltserhöhung?</h2>
      <p className={ERKLAERUNG}>
        Beide Wege kosten den Arbeitgeber gleich viel. So entsteht die Zahl, Monat für Monat:
      </p>
      <table className={`mt-3 w-full text-sm print:mt-1 ${TABELLE_DRUCK}`}>
        <thead>
          <tr className={`text-left ${TABELLE_KOPF}`}>
            <th className={`${KOPFZELLE} font-normal`} />
            <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>
              <span className="sm:hidden">Modell</span><span className="hidden sm:inline">{props.modell}</span>
            </th>
            <th className={`${KOPFZELLE} pl-3 text-right font-normal`}>
              <span className="sm:hidden">Gehalt</span><span className="hidden sm:inline">Gehaltserhöhung</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-ui-tinte">
          <VergleichZeile
            text="Zahlung des Arbeitgebers"
            links={euro(props.agZahlung)} rechts={<>{euro(g.bruttoMonat)}<Zusatz> brutto</Zusatz></>}
          />
          <VergleichZeile
            text={`Arbeitgeberanteil Sozialversicherung${props.mitUmlagen ? ' + Umlagen' : ''}`}
            links={<>− {euro(props.agAbgabenGespart)}<Zusatz> gespart</Zusatz></>}
            rechts={<>+ {euro(g.agAbgabenMonat)}<Zusatz> fällig</Zusatz></>}
          />
          <VergleichZeile
            text="= Personalkosten vor Steuern" summe
            links={euro(props.agKostenVorSteuer)} rechts={euro(g.kostenVorSteuerMonat)}
          />
          <VergleichZeile
            text={`− Steuerersparnis (${prozent(props.steuersatz, 0)} Betriebsausgabe)`}
            links={`− ${euro(props.agSteuer)}`} rechts={`− ${euro(g.steuerersparnisMonat)}`}
          />
          <VergleichZeile
            text="= kostet den Arbeitgeber netto" summe hervor
            links={euro(props.agNetto)} rechts={euro(g.nettoKostenMonat)}
          />
          <VergleichZeile
            text="Beim Mitarbeiter kommt an" summe
            links={<>{euro(props.agZahlung)}<Zusatz> Vorsorge</Zusatz></>}
            rechts={<>{euro(g.nettoMonat)}<Zusatz> netto</Zusatz></>}
          />
        </tbody>
      </table>
      <p className={FUSSNOTE}>
        Von {euro(g.bruttoMonat)} Gehaltserhöhung gehen beim Mitarbeiter {euro(g.svMonat)} Sozialabgaben
        und {euro(g.steuerMonat)} Steuer ab. Im Modell kommt der Arbeitgeberbeitrag ungekürzt in der
        Altersvorsorge an — zusammen mit der eigenen Umwandlung {euro(props.gesamtVorsorge)}.
      </p>
      {/* Im Druck traegt die Tabelle die Zahlen; die Balken kosten nur Hoehe. Einfarbig abgestuft: das Gehalt hell, die Vorsorge in Tinte. */}
      <div className="mt-4 space-y-3 print:hidden">
        <Balken text="Gehaltserhöhung, netto beim Mitarbeiter" betrag={g.nettoMonat} max={max} farbe="bg-ui-daten-3" />
        <Balken text="Arbeitgeberbeitrag in der Altersvorsorge" betrag={props.agZahlung} max={max} farbe="bg-ui-daten-2" />
        <Balken text="mit eigener Umwandlung insgesamt" betrag={props.gesamtVorsorge} max={max} farbe="bg-ui-tinte" />
      </div>
    </section>
  );
}

/** Kopf mit Logo — beide Arbeitgeber-Seiten. */
export function Kopf() {
  return (
    <SeitenKopf innen="print:max-w-none print:px-0 print:py-1" />
  );
}

/** Die drei Arbeitgebermodelle — fuer die Querverweise zwischen den Seiten. */
const MODELLE = [
  { href: '/zuschussmodell', text: 'Zuschussmodell: 50 % obendrauf' },
  { href: '/festbetrag', text: 'Festbetrag: 50 € für jeden' },
  { href: '/arbeitgeber', text: 'Matching-Modell mit Unterstützungskasse' },
] as const;

/** Querverweis auf die jeweils anderen Arbeitgebermodelle — als Textlinks, die leiseste Aktion. */
export function AndereModelle({ aktuell }: { aktuell: (typeof MODELLE)[number]['href'] }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm print:hidden">
      <span className="text-ui-schiefer">Andere Modelle:</span>
      {MODELLE.filter((m) => m.href !== aktuell).map((m) => (
        <a key={m.href} href={m.href} className={LINK}>
          {m.text} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      ))}
    </p>
  );
}

/* ==========================================================================
 * BISHERIGE LEISTUNGEN — was der Arbeitgeber heute schon zahlt (VL) und was
 * an bAV schon laeuft. Damit zeigt die Seite die TATSAECHLICHEN Mehrkosten
 * des Umstiegs, nicht nur die Kosten des Modells.
 * ======================================================================== */

/**
 * Was der Betrieb heute leistet — der Zustand der Seite. Bestehende
 * Betriebsrenten laufen weiter und werden auf das Modell aufgestockt. Wer VL
 * bekommt, behaelt sie oder wandelt sie in Altersvorsorge um — als
 * Entgeltumwandlung, mit dem Zuschuss des Modells obendrauf.
 */
export interface BisherigeAngaben {
  vlMonat: number;
  /** Wie viele bekamen bislang VL */
  vlAnzahl: number;
  /** Davon wandeln die VL in Altersvorsorge um */
  vlUmwandler: number;
  /** Davon wandeln zusaetzlich Gehalt um */
  vlMitGehalt: number;
  /** Von den uebrigen entfaellt die VL ersatzlos (nur per Betriebsvereinbarung oder mit Zustimmung) */
  vlEntfaellt: number;
  /** Was aus dem VL-Vertrag der Umsteiger wird — nur Information, kostet den Arbeitgeber nichts */
  vlVertrag: 'ruht' | 'privat';
  bestandAnzahl: number;
  bestandUmwandlungMonat: number;
  bestandQuote: number;
}

export const KEINE_BISHERIGEN: BisherigeAngaben = {
  vlMonat: 0, vlAnzahl: 0, vlUmwandler: 0, vlMitGehalt: 0, vlEntfaellt: 0, vlVertrag: 'ruht',
  bestandAnzahl: 0, bestandUmwandlungMonat: 100, bestandQuote: 0.15,
};

/** Gibt es ueberhaupt etwas Bisheriges? Dann erscheint der Vergleich. */
export const hatBisherige = (b: BisherigeAngaben) => (b.vlMonat > 0 && b.vlAnzahl > 0) || b.bestandAnzahl > 0;

export function betriebAngaben(b: BisherigeAngaben, neuTeilnehmer: number): BetriebAngaben {
  return {
    neuTeilnehmer,
    bestand: { anzahl: b.bestandAnzahl, umwandlungMonat: b.bestandUmwandlungMonat, zuschussQuote: b.bestandQuote },
    vl: { betragMonat: b.vlMonat, anzahl: b.vlAnzahl, umwandler: b.vlUmwandler, davonMitGehalt: b.vlMitGehalt, entfaellt: b.vlEntfaellt },
  };
}

/** Kurzfassung fuer die Druckzeile „Annahmen“. */
export function bisherAnnahmen(b: BisherigeAngaben): string {
  const teile: string[] = [];
  if (b.bestandAnzahl > 0) {
    teile.push(`${b.bestandAnzahl} bestehende Verträge (Ø ${euro(b.bestandUmwandlungMonat)} Umwandlung, bisher ${prozent(b.bestandQuote, 0)} Zuschuss) werden aufgestockt.`);
  }
  if (b.vlMonat > 0 && b.vlAnzahl > 0) {
    const umw = Math.min(b.vlUmwandler, b.vlAnzahl);
    const weg = Math.min(b.vlEntfaellt, b.vlAnzahl - umw);
    teile.push(`${b.vlAnzahl} bekamen bislang ${euroGenau(b.vlMonat)} VL: ${umw} wandeln sie in Altersvorsorge um`
      + `${b.vlMitGehalt > 0 ? ` (davon ${Math.min(b.vlMitGehalt, umw)} auch Gehalt)` : ''}`
      + `${weg > 0 ? `, bei ${weg} entfällt sie` : ''}, ${b.vlAnzahl - umw - weg} behalten sie.`
      + (umw > 0 ? ` Bisheriger VL-Vertrag: ${b.vlVertrag === 'ruht' ? 'ruht' : 'läuft privat weiter'}.` : ''));
  }
  return teile.length ? ' ' + teile.join(' ') : '';
}

/** Hinweis unter einem Anzahlfeld, wenn es mehr sind, als die Rechnung zulaesst. */
function Obergrenze({ wert, max, text }: { wert: number; max: number; text: string }) {
  if (wert <= max) return null;
  return <p className="-mt-2 text-xs font-medium text-ui-tinte">Gerechnet mit {max} — {text}.</p>;
}

/** Der Kasten fuer die linke Spalte. */
export function BisherigeLeistungenFelder(props: {
  wert: BisherigeAngaben;
  onChange: (b: BisherigeAngaben) => void;
}) {
  const { wert: b, onChange } = props;
  const setze = (teil: Partial<BisherigeAngaben>) => onChange({ ...b, ...teil });
  const umwandler = Math.min(b.vlUmwandler, b.vlAnzahl);
  const rest = Math.max(0, b.vlAnzahl - umwandler);
  const entfaellt = Math.min(b.vlEntfaellt, rest);
  return (
    <Kasten titel="Bisherige Leistungen">
      <ZahlFeld
        label="Mitarbeiter mit bestehender Betriebsrente" wert={b.bestandAnzahl} min={0} schritt={1} stufen
        onChange={(v) => setze({ bestandAnzahl: v })}
        hilfe="Die Verträge laufen weiter und werden auf das neue Modell aufgestockt."
      />
      {b.bestandAnzahl > 0 && (
        <>
          <ZahlFeld
            label="Ø Entgeltumwandlung je bestehendem Vertrag" wert={b.bestandUmwandlungMonat} einheit="€" schritt={10} min={0}
            onChange={(v) => setze({ bestandUmwandlungMonat: v })}
          />
          <ProzentFeld
            label="Bisheriger Arbeitgeberzuschuss" wert={b.bestandQuote} min={0} max={100}
            onChange={(v) => setze({ bestandQuote: v })}
            hilfe="Meist der gesetzliche Pflichtzuschuss von 15 %."
          />
        </>
      )}

      <ZahlFeld
        label="VL des Arbeitgebers je Mitarbeiter im Monat" wert={b.vlMonat} einheit="€" schritt={5} min={0}
        onChange={(v) => setze({ vlMonat: v })}
      />
      {b.vlMonat > 0 && (
        <>
          <ZahlFeld
            label="Wie viele bekamen bislang VL?" wert={b.vlAnzahl} min={0} schritt={1} stufen
            onChange={(v) => setze({ vlAnzahl: v })}
          />
          {b.vlAnzahl > 0 && (
            <div className="space-y-4 border-l-2 border-ui-linie pl-3">
              <ZahlFeld
                label="davon wandeln die VL in Altersvorsorge um" wert={b.vlUmwandler} min={0} schritt={1} stufen
                onChange={(v) => setze({ vlUmwandler: v })}
                hilfe="Die VL wird zum Arbeitgeberbeitrag in die Betriebsrente — steuer- und beitragsfrei."
              />
              <Obergrenze wert={b.vlUmwandler} max={b.vlAnzahl} text="mehr bekommen keine VL" />
              {umwandler > 0 && (
                <>
                  <ZahlFeld
                    label="davon wandeln zusätzlich Gehalt um" wert={b.vlMitGehalt} min={0} schritt={1} stufen
                    onChange={(v) => setze({ vlMitGehalt: v })}
                    hilfe="Sie wandeln zusätzlich den Betrag oben um und kommen zu den „Mitarbeitern im Modell“ dazu. Ihr Arbeitgeberbeitrag steigt um den Zuschuss des Modells — höchstens bis zu dessen Höchstbetrag, die VL eingerechnet."
                  />
                  <Obergrenze wert={b.vlMitGehalt} max={umwandler} text="mehr wandeln die VL nicht um" />
                  <AuswahlFeld
                    label="Der bisherige VL-Vertrag" wert={b.vlVertrag}
                    onChange={(v) => setze({ vlVertrag: v })}
                    optionen={[
                      { wert: 'ruht', text: 'ruht (beitragsfrei gestellt)' },
                      { wert: 'privat', text: 'läuft privat weiter' },
                    ]}
                    hilfe={b.vlVertrag === 'ruht'
                      ? 'Das Guthaben bleibt stehen und wird weiter verzinst; es fließen keine Beiträge mehr.'
                      : `Der Mitarbeiter zahlt die ${euroGenau(b.vlMonat)} künftig selbst aus dem Netto. Für Sie ändert sich nichts.`}
                  />
                </>
              )}
              {rest > 0 && (
                <>
                  <ZahlFeld
                    label="davon entfällt die VL (keine Teilnahme)" wert={b.vlEntfaellt} min={0} schritt={1} stufen
                    onChange={(v) => setze({ vlEntfaellt: v })}
                    hilfe="Nur, wenn die VL auf einer Betriebsvereinbarung oder betriebsvereinbarungsoffenen Gesamtzusage beruht — abgelöst durch eine neue Betriebsvereinbarung mit dem Betriebsrat. Bei Tarifvertrag, Arbeitsvertrag oder betrieblicher Übung nur mit Zustimmung des Mitarbeiters."
                  />
                  <Obergrenze wert={b.vlEntfaellt} max={rest} text="die übrigen wandeln ihre VL um" />
                </>
              )}
              <p className="text-sm text-ui-tinte">
                → <span className="font-medium">{rest - entfaellt}</span> behalten ihre VL wie bisher.
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Das Bruttogehalt oben versteht sich einschließlich VL. „Mitarbeiter im Modell“ sind die neuen Teilnehmer, die
        Gehalt umwandeln — ohne die VL-Bezieher oben.
      </p>
    </Kasten>
  );
}

const GRUPPE: Record<BetriebGruppe, string> = {
  neu: 'Neue Teilnehmer (Gehaltsumwandlung)',
  vlGehalt: 'VL + eigene Umwandlung',
  vlUmwandlung: 'VL als Arbeitgeberbeitrag in die bAV',
  vlBehalten: 'VL bleibt',
  vlEntfaellt: 'VL entfällt',
  bestand: 'Bestehende Verträge, aufgestockt',
};

/**
 * Bisher gegen neu: fuer den ganzen Betrieb im Jahr und — falls es
 * VL-Umwandler gibt — je VL-Umwandler im Monat.
 */
export function UmstiegVergleich({ betrieb, vlVertrag, steuersatz, mitUmlagen, druck = 'seite2', kopfImDruck = true }: {
  betrieb: BetriebErgebnis;
  vlVertrag: BisherigeAngaben['vlVertrag'];
  steuersatz: number;
  mitUmlagen: boolean;
  /**
   * Wie der Abschnitt im Druck steht: 'seite2' beginnt Seite 2 (Zuschuss,
   * Festbetrag — Seite 1 ist voll, die Umsetzung folgt ohne eigenen
   * Umbruch). 'nurBildschirm' / 'nurDruck': die Matching-Seite zeigt ihn am
   * Bildschirm beim Gehaltsvergleich, im Druck am Ende von Seite 2.
   */
  druck?: 'seite2' | 'nurBildschirm' | 'nurDruck';
  /** Die Rechnung je Kopf im Druck zeigen — auf der Matching-Seite fehlt dafuer der Platz. */
  kopfImDruck?: boolean;
}) {
  const mehr = betrieb.mehrkostenNettoJahr;
  const k = betrieb.kopfVl;
  const druckKlasse = druck === 'seite2' ? 'print:break-before-page'
    : druck === 'nurBildschirm' ? 'print:hidden' : 'hidden print:block';
  const hat = (g: BetriebGruppe) => betrieb.zeilen.some((z) => z.gruppe === g);
  return (
    <section className={`${KARTE} print:break-inside-avoid ${druckKlasse}`}>
      <h2 className={KARTE_TITEL}>Was ändert sich gegenüber heute?</h2>

      <h3 className="mt-3 text-sm font-medium text-ui-tinte print:mt-1 print:text-[10px]">Für den ganzen Betrieb, im Jahr nach Steuern</h3>
      <table className={`mt-1 w-full text-xs sm:text-sm ${TABELLE_DRUCK}`}>
        <thead>
          <tr className={`text-left ${TABELLE_KOPF} print:text-[9px]`}>
            <th className={`${KOPFZELLE} font-normal`} />
            <th className={`${KOPFZELLE} text-right font-normal`}><span className="sm:hidden">Anz.</span><span className="hidden sm:inline">Anzahl</span></th>
            <th className={`${KOPFZELLE} pl-2 text-right font-normal sm:pl-3`}>Bisher</th>
            <th className={`${KOPFZELLE} pl-2 text-right font-medium text-ui-tinte sm:pl-3`}>Neu</th>
          </tr>
        </thead>
        <tbody className="text-ui-tinte">
          {betrieb.zeilen.map((z) => (
            <tr key={z.gruppe} className={TABELLE_ZEILE}>
              <td className={`${ZELLE} pr-2`}>{GRUPPE[z.gruppe]}</td>
              <td className={`${ZELLE} whitespace-nowrap text-right tabular-nums`}>{z.anzahl}</td>
              <td className={`${ZELLE} whitespace-nowrap pl-2 text-right tabular-nums sm:pl-3`}>{euro(z.bisherNettoJahr)}</td>
              <td className={`${ZELLE} whitespace-nowrap pl-2 text-right tabular-nums sm:pl-3`}>{euro(z.neuNettoJahr)}</td>
            </tr>
          ))}
          <tr className="border-t border-ui-tinte bg-ui-innen font-medium">
            <td className={`${ZELLE} pr-2`}>Insgesamt</td>
            <td className={`${ZELLE} whitespace-nowrap text-right tabular-nums`}>{betrieb.zeilen.reduce((s, z) => s + z.anzahl, 0)}</td>
            <td className={`${ZELLE} whitespace-nowrap pl-2 text-right tabular-nums sm:pl-3`}>{euro(betrieb.bisherNettoJahr)}</td>
            <td className={`${ZELLE} whitespace-nowrap pl-2 text-right tabular-nums sm:pl-3`}>{euro(betrieb.neuNettoJahr)}</td>
          </tr>
        </tbody>
      </table>
      {/* Das Ergebnis als Satz in Tinte — ob Mehrkosten oder Ersparnis, ohne Ampelfarbe. */}
      <p className="ui-innen mt-3 px-3 py-2 text-sm font-medium text-ui-tinte print:mt-2 print:px-2 print:py-1 print:text-[10px]">
        {mehr > 6
          ? <>Tatsächliche Mehrkosten des Umstiegs: {euro(mehr)} im Jahr ({euro(mehr / 12)} im Monat).</>
          : mehr < -6
            ? <>Der Umstieg kostet weniger als heute: {euro(-mehr)} im Jahr gespart ({euro(-mehr / 12)} im Monat).</>
            : <>Der Umstieg kostet praktisch dasselbe wie heute.</>}
      </p>

      {k && (
        <div className={kopfImDruck ? '' : 'print:hidden'}>
          <h3 className="mt-4 text-sm font-medium text-ui-tinte print:mt-1.5 print:text-[10px]">
            Je Mitarbeiter, der seine VL in die Betriebsrente gibt, im Monat
          </h3>
          <table className={`mt-1 w-full text-sm ${TABELLE_DRUCK}`}>
            <thead>
              <tr className={`text-left ${TABELLE_KOPF} print:text-[9px]`}>
                <th className={`${KOPFZELLE} font-normal`} />
                <th className={`${KOPFZELLE} text-right font-normal`}>Bisher</th>
                <th className={`${KOPFZELLE} pl-3 text-right font-medium text-ui-tinte`}>Neu</th>
              </tr>
            </thead>
            <tbody className="text-ui-tinte">
              <VergleichZeile
                text="VL" links={<>{euroGenau(k.vlMonat)}<Zusatz> als Lohn</Zusatz></>}
                rechts={<>{euroGenau(k.vlMonat)}<Zusatz> in die bAV</Zusatz></>}
              />
              <VergleichZeile
                text={`Arbeitgeberanteil Sozialversicherung${mitUmlagen ? ' und Umlagen' : ''}`}
                links={`+ ${euro(k.vlAbgabenMonat)}`} rechts={<>0 €<Zusatz> frei</Zusatz></>}
              />
              <VergleichZeile
                text="= Personalkosten vor Steuern" summe
                links={euro(k.bisherVorSteuerMonat)} rechts={euro(k.neuVorSteuerMonat)}
              />
              <VergleichZeile
                text={`= netto nach Steuern (${prozent(steuersatz, 0)})`} summe hervor
                links={euro(k.bisherNettoMonat)} rechts={euro(k.neuNettoMonat)}
              />
            </tbody>
          </table>
          <p className={FUSSNOTE}>
            Heute bringt ihm die VL {euro(k.vlNettoMitarbeiterMonat)} netto — künftig fließen die vollen {euroGenau(k.vlMonat)} in
            seine Betriebsrente, und Sie sparen die Abgaben. Wandelt er zusätzlich Gehalt um, steigt Ihr Beitrag um den
            Zuschuss des Modells, höchstens auf {euro(k.mitUmwandlungBisMonat)} im Monat (VL eingerechnet).
            {vlVertrag === 'ruht'
              ? ' Sein bisheriger VL-Vertrag ruht: Das Guthaben bleibt stehen, Beiträge fließen keine mehr.'
              : ` Sein bisheriger VL-Vertrag läuft privat weiter — die ${euroGenau(k.vlMonat)} zahlt er dann selbst aus dem Netto.`}
          </p>
        </div>
      )}

      <p className={FUSSNOTE}>
        {hat('bestand') && <>Bestehende Verträge laufen weiter und werden auf das neue Modell aufgestockt — als Nachtrag zur Versorgungszusage. </>}
        {(hat('vlUmwandlung') || hat('vlGehalt')) && <>
          Die Umstellung der VL auf einen Arbeitgeberbeitrag wird mit dem Mitarbeiter vereinbart; beruhen die VL auf einem
          Tarifvertrag, muss er das zulassen. Ob die bisherige VL auf den gesetzlichen Pflichtzuschuss angerechnet werden
          darf, in der Versorgungsordnung ausdrücklich regeln. Eine Arbeitnehmer-Sparzulage gibt es nur auf
          VL-Verträge, in die weiter eingezahlt wird. </>}
        {hat('vlEntfaellt') && <>
          Die VL ersatzlos zu streichen, geht nur, wenn sie auf einer Betriebsvereinbarung oder
          betriebsvereinbarungsoffenen Gesamtzusage beruht — durch eine neue Betriebsvereinbarung mit dem Betriebsrat;
          sonst nur mit Zustimmung des Mitarbeiters.</>}
      </p>
    </section>
  );
}

/**
 * „Im Jahr, ganzer Betrieb“ — ersetzt auf den Seiten die Box „Bei n
 * Mitarbeitern im Jahr“, sobald es bisherige Leistungen gibt: Was das Neue
 * kostet, was an VL und altem Zuschuss wegfaellt, und was in die
 * Altersvorsorge fliesst.
 */
export function BetriebJahr({ betrieb }: { betrieb: BetriebErgebnis }) {
  const summe = (gruppen: BetriebGruppe[], feld: 'bisherNettoJahr' | 'neuNettoJahr') =>
    betrieb.zeilen.filter((z) => gruppen.includes(z.gruppe)).reduce((s, z) => s + z[feld], 0);
  // Wer seine VL behaelt, steht bisher wie neu gleich in der Rechnung — hier ohne Belang.
  const neu = summe(['neu', 'vlGehalt', 'vlUmwandlung', 'bestand'], 'neuNettoJahr');
  const vlWeg = summe(['vlGehalt', 'vlUmwandlung', 'vlEntfaellt'], 'bisherNettoJahr');
  const bestandWeg = summe(['bestand'], 'bisherNettoJahr');
  const hatBestand = betrieb.zeilen.some((z) => z.gruppe === 'bestand');
  const anzahl = betrieb.zeilen.reduce((s, z) => s + z.anzahl, 0);
  /* Wie die Zeilen einer Aufstellung (Zeile): Text leise, Betrag in Tinte. */
  const zeile = (text: string, wert: string, klasse = 'text-ui-schiefer') => (
    <div className={`flex justify-between gap-3 py-1 print:py-0 ${klasse}`}><dt>{text}</dt><dd className="text-right tabular-nums text-ui-tinte">{wert}</dd></div>
  );
  const mehr = betrieb.mehrkostenNettoJahr;
  return (
    <div className={KARTE}>
      <h2 className={KARTE_TITEL}>Im Jahr, {anzahl} Mitarbeiter</h2>
      <dl className="mt-3 text-sm print:mt-1 print:text-xs">
        {zeile('Kosten des neuen Modells, netto', euro(neu))}
        {vlWeg > 0.5 && zeile('− entfallene Kosten für VL, netto', `− ${euro(vlWeg)}`)}
        {/* Der alte 15-%-Zuschuss kostet oft weniger, als die Umwandlung an Abgaben spart — dann
            war der Bestand bisher ein kleiner Gewinn, der nun in der Aufstockung aufgeht. */}
        {hatBestand && (bestandWeg >= 0
          ? zeile('− Bestandsverträge bisher', `− ${euro(bestandWeg)}`)
          : zeile('+ Bestandsverträge bisher (Ersparnis)', `+ ${euro(-bestandWeg)}`))}
        {zeile(mehr >= 0 ? '= Mehrkosten, netto' : '= Ersparnis, netto', euro(Math.abs(mehr)),
          'mt-1 border-t border-ui-tinte pt-2 font-medium text-ui-tinte print:mt-0.5 print:pt-0.5')}
        {zeile('Beiträge in die Altersvorsorge', euro(betrieb.agBeitragJahr), 'mt-2 text-ui-schiefer print:mt-1')}
        {zeile('Altersvorsorge insgesamt', euro(betrieb.vorsorgeJahr), 'font-medium text-ui-tinte')}
      </dl>
    </div>
  );
}

