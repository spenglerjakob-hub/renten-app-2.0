import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type {
  BetriebAngaben, BetriebErgebnis, BetriebGruppe, BisherigeLeistungen, GehaltsVergleich, Umstieg,
} from '@renten/engine';
import { Logo } from '../components/Logo';
import { AuswahlFeld, ProzentFeld, ZahlFeld, euro, euroGenau, prozent } from '../components/Feld';

/**
 * Bausteine der beiden Arbeitgeber-Seiten (Matching-Modell und
 * Zuschussmodell). Gemeinsam, damit beide dieselbe Rechnung gleich zeigen —
 * zwei Fassungen desselben Vergleichs liefen auseinander.
 */

export function Kasten({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-[13px] print:text-xs font-bold uppercase tracking-wide text-slate-500">{titel}</h2>
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
    <details className="group rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] print:text-xs text-slate-700">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-indigo-800">
        <Info className="h-3.5 w-3.5" aria-hidden /> Was sind die Umlagen?
      </summary>
      <p className="mt-2 leading-relaxed">
        Drei Beiträge, die <strong>allein der Arbeitgeber</strong> trägt — berechnet auf das
        rentenversicherungspflichtige Entgelt. Entgeltumwandlung, die beitragsfrei ist, senkt auch diese
        Grundlage; deshalb spart der Arbeitgeber sie mit.
      </p>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className="font-bold">U1 — Entgeltfortzahlung bei Krankheit</dt>
          <dd className="leading-relaxed">
            Nur Betriebe mit bis zu 30 Beschäftigten. Dafür erstattet die Krankenkasse einen Teil des Lohns, den
            der Arbeitgeber im Krankheitsfall weiterzahlt. Der Satz hängt von Kasse und gewähltem
            Erstattungssatz ab, meist etwa <strong>1 bis 3,5 %</strong>.
          </dd>
        </div>
        <div>
          <dt className="font-bold">U2 — Mutterschaft</dt>
          <dd className="leading-relaxed">
            Alle Arbeitgeber, unabhängig von der Größe. Erstattet werden die Aufwendungen während Mutterschutz und
            Beschäftigungsverbot vollständig. Meist etwa <strong>0,2 bis 0,8 %</strong>, je nach Kasse.
          </dd>
        </div>
        <div>
          <dt className="font-bold">Insolvenzgeldumlage</dt>
          <dd className="leading-relaxed">
            Alle privaten Arbeitgeber. Sie finanziert das Insolvenzgeld der Bundesagentur für Arbeit, das
            Beschäftigte bei einer Pleite ihres Arbeitgebers bis zu drei Monate lang erhalten. Einheitlicher Satz,
            derzeit <strong>0,15 %</strong>.
          </dd>
        </div>
      </dl>
      <p className="mt-2 leading-relaxed">
        Die genauen Sätze stehen in der Lohnabrechnung bzw. bei der Krankenkasse des Mitarbeiters. Typische Summen:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onWaehlen(0.025)}
          className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-bold text-indigo-800 hover:bg-indigo-50">
          bis 30 Beschäftigte ≈ 2,5 %
        </button>
        <button type="button" onClick={() => onWaehlen(0.006)}
          className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-bold text-indigo-800 hover:bg-indigo-50">
          über 30 Beschäftigte ≈ 0,6 %
        </button>
      </div>
    </details>
  );
}

export function WechselSpalte({ titel, farbe, children }: { titel: string; farbe: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 print:p-2 ${farbe}`}>
      <h3 className="text-[13px] print:text-xs font-black text-slate-900">{titel}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
        {children}
      </ul>
    </div>
  );
}

export function Kachel(props: {
  symbol: ReactNode; farbe: string; titel: string; betrag: number; unten: string; gross?: boolean;
  /** Mit Cent — fuer Tarifbeitraege wie 21,88 EUR, die sonst gerundet neben dem genauen Wert stuenden */
  genau?: boolean;
}) {
  return (
    <div className={`rounded-2xl border-2 p-4 print:p-2 ${props.farbe}`}>
      <div className="flex items-center gap-1.5 text-[13px] print:text-xs font-bold">{props.symbol}{props.titel}</div>
      <p className={`mt-1 font-black tabular-nums ${props.gross ? 'text-3xl print:text-2xl' : 'text-2xl print:text-xl'}`}>
        {props.genau ? euroGenau(props.betrag) : euro(props.betrag)}
      </p>
      <p className="text-xs print:text-[11px] opacity-80">{props.unten}</p>
    </div>
  );
}

export function Bon({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
      <h2 className="text-sm font-black text-slate-900">{titel} im Monat</h2>
      <dl className="mt-1 space-y-0.5 text-[13px] print:text-xs">{children}</dl>
    </div>
  );
}

export function Zeile({ text, betrag, summe }: { text: string; betrag: number; summe?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${summe ? 'border-t border-slate-200 pt-1 font-black text-slate-900' : 'text-slate-600'}`}>
      <dt>{text}</dt>
      <dd className="tabular-nums">{euro(betrag)}</dd>
    </div>
  );
}

/** Erlaeuterndes Wort hinter dem Betrag — auf schmalen Bildschirmen weggelassen. */
export function Zusatz({ children }: { children: ReactNode }) {
  return <span className="hidden font-normal text-slate-500 sm:inline">{children}</span>;
}

export function VergleichZeile(props: { text: string; links: ReactNode; rechts: ReactNode; summe?: boolean; hervor?: boolean }) {
  return (
    <tr className={`${props.summe ? 'border-t border-slate-200 font-bold text-slate-900' : ''} ${props.hervor ? 'bg-amber-50' : ''}`}>
      <td className="py-0.5 pr-2">{props.text}</td>
      <td className="whitespace-nowrap py-0.5 text-right tabular-nums">{props.links}</td>
      <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{props.rechts}</td>
    </tr>
  );
}

export function Balken({ text, betrag, max, farbe }: { text: string; betrag: number; max: number; farbe: string }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-[13px] print:text-xs text-slate-700">
        <span>{text}</span>
        <span className="font-bold tabular-nums">{euro(betrag)}</span>
      </div>
      <div className="mt-0.5 h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${farbe} print:[print-color-adjust:exact]`} style={{ width: `${Math.max(2, (betrag / max) * 100)}%` }} />
      </div>
    </div>
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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none">
      <h2 className="text-sm font-black text-slate-900">Dasselbe Geld als Gehaltserhöhung?</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600 print:text-[10px]">
        Beide Wege kosten den Arbeitgeber gleich viel. So entsteht die Zahl, Monat für Monat:
      </p>
      <table className="mt-2 w-full text-[13px] print:mt-1 print:text-[10px]">
        <thead>
          <tr className="text-left text-xs print:text-[11px] text-slate-500">
            <th className="py-0.5 font-medium" />
            <th className="py-0.5 text-right font-bold text-emerald-700">
              <span className="sm:hidden">Modell</span><span className="hidden sm:inline">{props.modell}</span>
            </th>
            <th className="py-0.5 pl-3 text-right font-bold text-slate-600">
              <span className="sm:hidden">Gehalt</span><span className="hidden sm:inline">Gehaltserhöhung</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
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
      <p className="mt-1 text-xs leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
        Von {euro(g.bruttoMonat)} Gehaltserhöhung gehen beim Mitarbeiter {euro(g.svMonat)} Sozialabgaben
        und {euro(g.steuerMonat)} Steuer ab. Im Modell kommt der Arbeitgeberbeitrag ungekürzt in der
        Altersvorsorge an — zusammen mit der eigenen Umwandlung {euro(props.gesamtVorsorge)}.
      </p>
      {/* Im Druck traegt die Tabelle die Zahlen; die Balken kosten nur Hoehe. */}
      <div className="mt-3 space-y-2 print:hidden">
        <Balken text="Gehaltserhöhung, netto beim Mitarbeiter" betrag={g.nettoMonat} max={max} farbe="bg-slate-400" />
        <Balken text="Arbeitgeberbeitrag in der Altersvorsorge" betrag={props.agZahlung} max={max} farbe="bg-emerald-400" />
        <Balken text="mit eigener Umwandlung insgesamt" betrag={props.gesamtVorsorge} max={max} farbe="bg-emerald-600" />
      </div>
    </section>
  );
}

/** Kopf mit Logo — beide Arbeitgeber-Seiten. */
export function Kopf() {
  return (
    <header className="bg-slate-900 text-white print:bg-white print:text-slate-900">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 print:px-0 print:py-1">
        <Logo klasse="h-9 w-9 print:h-6 print:w-6" />
        <div>
          <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>
          <p className="text-xs print:text-[11px] text-slate-400 print:hidden">Ihre Zukunft. Smart geplant.</p>
        </div>
      </div>
    </header>
  );
}

/** Die drei Arbeitgebermodelle — fuer die Querverweise zwischen den Seiten. */
const MODELLE = [
  { href: '/zuschussmodell', text: 'Zuschussmodell: 50 % obendrauf' },
  { href: '/festbetrag', text: 'Festbetrag: 50 € für jeden' },
  { href: '/arbeitgeber', text: 'Matching-Modell mit Unterstützungskasse' },
] as const;

/** Querverweis auf die jeweils anderen Arbeitgebermodelle. */
export function AndereModelle({ aktuell }: { aktuell: (typeof MODELLE)[number]['href'] }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] print:text-xs print:hidden">
      <span className="text-slate-500">Andere Modelle:</span>
      {MODELLE.filter((m) => m.href !== aktuell).map((m, i) => (
        <span key={m.href} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-slate-300">·</span>}
          <a href={m.href} className="font-bold text-indigo-700 hover:underline">{m.text} →</a>
        </span>
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
 * Was der Betrieb heute leistet — der Zustand der Seite. Das neue Modell
 * ersetzt per Versorgungsordnung bzw. Gesamtzusage alle alten VL; bestehende
 * Betriebsrenten laufen weiter und werden auf das Modell aufgestockt.
 */
export interface BisherigeAngaben {
  vlMonat: number;
  vlUmgang: BisherigeLeistungen['vlUmgang'];
  vlBeiNeuen: number;
  vlBeiBestand: number;
  vlOhneBav: number;
  bestandAnzahl: number;
  bestandUmwandlungMonat: number;
  bestandQuote: number;
}

export const KEINE_BISHERIGEN: BisherigeAngaben = {
  vlMonat: 0, vlUmgang: 'anrechnen', vlBeiNeuen: 0, vlBeiBestand: 0, vlOhneBav: 0,
  bestandAnzahl: 0, bestandUmwandlungMonat: 100, bestandQuote: 0.15,
};

/** Gibt es ueberhaupt etwas Bisheriges? Dann erscheint der Vergleich. */
export const hatBisherige = (b: BisherigeAngaben) => b.vlMonat > 0 || b.bestandAnzahl > 0;

/**
 * Die Beispielrechnung je Kopf (Kacheln, Bons) zeigt einen NEUEN Teilnehmer —
 * mit VL nur, wenn unter den neuen Teilnehmern VL-Bezieher sind.
 */
export function bisherFuerKopf(b: BisherigeAngaben): BisherigeLeistungen | undefined {
  return b.vlMonat > 0 && b.vlBeiNeuen > 0
    ? { vlMonat: b.vlMonat, vlUmgang: b.vlUmgang, bavBestandMonat: 0 }
    : undefined;
}

export function betriebAngaben(b: BisherigeAngaben, neuTeilnehmer: number): BetriebAngaben {
  return {
    neuTeilnehmer,
    bestand: { anzahl: b.bestandAnzahl, umwandlungMonat: b.bestandUmwandlungMonat, zuschussQuote: b.bestandQuote },
    vl: {
      betragMonat: b.vlMonat, umgang: b.vlUmgang,
      beiNeuen: b.vlBeiNeuen, beiBestand: b.vlBeiBestand, ohneBav: b.vlOhneBav,
    },
  };
}

/** Kurzfassung fuer die Druckzeile „Annahmen“. */
export function bisherAnnahmen(b: BisherigeAngaben): string {
  const teile: string[] = [];
  if (b.bestandAnzahl > 0) {
    teile.push(`${b.bestandAnzahl} bestehende Verträge (Ø ${euro(b.bestandUmwandlungMonat)} Umwandlung, bisher ${prozent(b.bestandQuote, 0)} Zuschuss) werden aufgestockt.`);
  }
  if (b.vlMonat > 0) {
    teile.push(`VL ${euroGenau(b.vlMonat)} (${b.vlBeiNeuen} neue Teilnehmer, ${b.vlBeiBestand} mit Bestand, ${b.vlOhneBav} ohne bAV), `
      + `künftig ${b.vlUmgang === 'anrechnen' ? 'angerechnet' : 'zusätzlich in der Betriebsrente'}.`);
  }
  return teile.length ? ' ' + teile.join(' ') : '';
}

/**
 * Der Kasten fuer die linke Spalte. `vlZiel` sagt, wohin die VL bei
 * „zusaetzlich“ fliesst — in die Direktversicherung oder (Matching) in die
 * Unterstuetzungskasse.
 */
export function BisherigeLeistungenFelder(props: {
  wert: BisherigeAngaben;
  onChange: (b: BisherigeAngaben) => void;
  vlZiel: 'Direktversicherung' | 'Unterstützungskasse';
  /** Neue Teilnehmer — Obergrenze fuer die VL-Bezieher unter ihnen */
  neuTeilnehmer: number;
}) {
  const { wert: b, onChange } = props;
  const setze = (teil: Partial<BisherigeAngaben>) => onChange({ ...b, ...teil });
  return (
    <Kasten titel="Bisherige Leistungen">
      <p className="-mt-1 text-xs leading-snug text-slate-500">
        Das neue Modell ersetzt per Versorgungsordnung die bisherigen Leistungen. „Mitarbeiter im Modell“ unten
        sind die neuen Teilnehmer.
      </p>

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
        hilfe="Das Bruttogehalt oben versteht sich einschließlich VL."
      />
      {b.vlMonat > 0 && (
        <>
          <AuswahlFeld
            label="Die VL im neuen Modell" wert={b.vlUmgang}
            onChange={(v) => setze({ vlUmgang: v })}
            optionen={[
              { wert: 'anrechnen', text: 'wird angerechnet (entfällt)' },
              { wert: 'zusaetzlich', text: 'fließt zusätzlich in die Betriebsrente' },
            ]}
            hilfe={b.vlUmgang === 'anrechnen'
              ? 'Die VL entfällt — bei Teilnehmern ersetzt sie der Arbeitgeberbeitrag, sonst ersatzlos.'
              : `Die VL wird zum Arbeitgeberbeitrag in die ${props.vlZiel} — steuer- und beitragsfrei statt als Lohn, auch bei Mitarbeitern ohne eigene Umwandlung.`}
          />
          <p className="text-xs font-semibold text-slate-600">Wie viele bekommen heute VL?</p>
          <div className="grid grid-cols-3 items-end gap-2">
            <ZahlFeld label="neue Teilnehmer" wert={b.vlBeiNeuen} min={0} max={Math.max(0, props.neuTeilnehmer)} schritt={1}
              onChange={(v) => setze({ vlBeiNeuen: v })} />
            <ZahlFeld label="mit Bestand" wert={b.vlBeiBestand} min={0} max={Math.max(0, b.bestandAnzahl)} schritt={1}
              onChange={(v) => setze({ vlBeiBestand: v })} />
            <ZahlFeld label="ohne bAV" wert={b.vlOhneBav} min={0} schritt={1}
              onChange={(v) => setze({ vlOhneBav: v })} />
          </div>
        </>
      )}
    </Kasten>
  );
}

const GRUPPE: Record<BetriebGruppe, string> = {
  neu: 'Neue Teilnehmer',
  neuMitVl: 'Neue Teilnehmer mit VL',
  bestand: 'Bestehende Verträge, aufgestockt',
  bestandMitVl: 'Bestehende Verträge mit VL',
  vlOhneBav: 'VL ohne Betriebsrente',
};

/**
 * Bisher gegen neu: je Kopf (ein neuer Teilnehmer mit VL, falls es ihn gibt)
 * und fuer den ganzen Betrieb im Jahr.
 */
export function UmstiegVergleich({ u, betrieb, vlUmgang, steuersatz, mitUmlagen, druck = 'seite2', kopfImDruck = true }: {
  u: Umstieg | null;
  betrieb: BetriebErgebnis;
  vlUmgang: BisherigeLeistungen['vlUmgang'];
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
  const druckKlasse = druck === 'seite2' ? 'print:break-before-page'
    : druck === 'nurBildschirm' ? 'print:hidden' : 'hidden print:block';
  const vlOhne = betrieb.zeilen.find((z) => z.gruppe === 'vlOhneBav');
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none ${druckKlasse}`}>
      <h2 className="text-sm font-black text-slate-900">Was ändert sich gegenüber heute?</h2>

      <h3 className="mt-2 text-[13px] font-bold text-slate-800 print:mt-1 print:text-[10px]">Für den ganzen Betrieb, im Jahr nach Steuern</h3>
      <table className="mt-1 w-full text-[13px] print:text-[10px]">
        <thead>
          <tr className="text-left text-xs text-slate-500 print:text-[9px]">
            <th className="py-0.5 font-medium" />
            <th className="py-0.5 text-right font-medium">Anzahl</th>
            <th className="py-0.5 pl-3 text-right font-bold text-slate-600">Bisher</th>
            <th className="py-0.5 pl-3 text-right font-bold text-emerald-700">Neu</th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {betrieb.zeilen.map((z) => (
            <tr key={z.gruppe} className="border-t border-slate-100">
              <td className="py-0.5 pr-2">
                {GRUPPE[z.gruppe]}
                {z.gruppe === 'vlOhneBav' && <Zusatz>{vlUmgang === 'anrechnen' ? ' (VL entfällt)' : ' (VL als Arbeitgeber-bAV)'}</Zusatz>}
              </td>
              <td className="whitespace-nowrap py-0.5 text-right tabular-nums">{z.anzahl}</td>
              <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{euro(z.bisherNettoJahr)}</td>
              <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{euro(z.neuNettoJahr)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-300 bg-amber-50 font-bold text-slate-900">
            <td className="py-0.5 pr-2">Insgesamt</td>
            <td className="whitespace-nowrap py-0.5 text-right tabular-nums">{betrieb.zeilen.reduce((s, z) => s + z.anzahl, 0)}</td>
            <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{euro(betrieb.bisherNettoJahr)}</td>
            <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{euro(betrieb.neuNettoJahr)}</td>
          </tr>
        </tbody>
      </table>
      <p className={`mt-2 rounded-lg px-3 py-2 text-[13px] font-bold print:px-2 print:py-1 print:text-[10px] ${
        mehr > 6 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
      }`}>
        {mehr > 6
          ? <>Tatsächliche Mehrkosten des Umstiegs: {euro(mehr)} im Jahr ({euro(mehr / 12)} im Monat).</>
          : mehr < -6
            ? <>Der Umstieg kostet weniger als heute: {euro(-mehr)} im Jahr gespart ({euro(-mehr / 12)} im Monat).</>
            : <>Der Umstieg kostet praktisch dasselbe wie heute.</>}
      </p>

      {u && (
        <div className={kopfImDruck ? '' : 'print:hidden'}>
          <h3 className="mt-3 text-[13px] font-bold text-slate-800 print:mt-1.5 print:text-[10px]">
            Je neuem Teilnehmer mit VL, im Monat
          </h3>
          <table className="mt-1 w-full text-[13px] print:text-[10px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 print:text-[9px]">
                <th className="py-0.5 font-medium" />
                <th className="py-0.5 text-right font-bold text-slate-600">Bisher</th>
                <th className="py-0.5 pl-3 text-right font-bold text-emerald-700">Neu</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <VergleichZeile text="VL als Lohn" links={euroGenau(u.bisher.vlMonat)} rechts="—" />
              <VergleichZeile
                text={`Arbeitgeberanteil Sozialversicherung${mitUmlagen ? ' und Umlagen' : ''} auf die VL`}
                links={`+ ${euro(u.bisher.agAbgabenMonat)}`} rechts="—"
              />
              {u.neu.vlInBavMonat > 0 && (
                <VergleichZeile text="VL als Beitrag in die Betriebsrente (abgabenfrei)" links="—" rechts={euroGenau(u.neu.vlInBavMonat)} />
              )}
              <VergleichZeile
                text="Modell: Zuschuss abzüglich gesparter Abgaben" links="—"
                rechts={`${u.neu.modellKostenVorSteuerMonat < 0 ? '− ' : ''}${euro(Math.abs(u.neu.modellKostenVorSteuerMonat))}`}
              />
              <VergleichZeile
                text={`= netto nach Steuern (${prozent(steuersatz, 0)})`} summe hervor
                links={euro(u.bisher.nettoKostenMonat)} rechts={euro(u.neu.nettoKostenMonat)}
              />
            </tbody>
          </table>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
            Heute bringt ihm die VL {euro(u.vlNettoMitarbeiterMonat)} netto. Künftig fließen {euro(u.vorsorgeMitVlMonat)} im
            Monat in seine Betriebsrente{u.vlUmgang === 'anrechnen' ? ' — die VL selbst fällt weg; das gehört offen ins Gespräch.' : ', die VL darin ungekürzt statt netto.'}
          </p>
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-500 print:mt-1 print:text-[9px] print:leading-snug">
        {betrieb.zeilen.some((z) => z.gruppe === 'bestand' || z.gruppe === 'bestandMitVl')
          && <>Bestehende Verträge laufen weiter und werden auf das neue Modell aufgestockt — als Nachtrag zur Versorgungszusage. </>}
        {(u || vlOhne || betrieb.zeilen.some((z) => z.gruppe === 'bestandMitVl')) && <>
          VL beruhen meist auf Tarifvertrag, Betriebsvereinbarung oder Arbeitsvertrag: Die Ablösung durch die
          Versorgungsordnung braucht eine Vereinbarung bzw. eine tarifliche Öffnung. VL-Verträge können ruhen oder privat
          weiterlaufen; eine Arbeitnehmer-Sparzulage entfällt gegebenenfalls.</>}
      </p>
    </section>
  );
}
