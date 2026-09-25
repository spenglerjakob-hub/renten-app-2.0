import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { GehaltsVergleich } from '@renten/engine';
import { Logo } from '../components/Logo';
import { euro, prozent } from '../components/Feld';

/**
 * Bausteine der beiden Arbeitgeber-Seiten (Matching-Modell und
 * Zuschussmodell). Gemeinsam, damit beide dieselbe Rechnung gleich zeigen —
 * zwei Fassungen desselben Vergleichs liefen auseinander.
 */

export function Kasten({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{titel}</h2>
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
    <details className="group rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
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
      <h3 className="text-xs font-black text-slate-900">{titel}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
        {children}
      </ul>
    </div>
  );
}

export function Kachel(props: { symbol: ReactNode; farbe: string; titel: string; betrag: number; unten: string; gross?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 p-4 print:p-2 ${props.farbe}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold">{props.symbol}{props.titel}</div>
      <p className={`mt-1 font-black tabular-nums ${props.gross ? 'text-3xl print:text-2xl' : 'text-2xl print:text-xl'}`}>
        {euro(props.betrag)}
      </p>
      <p className="text-[11px] opacity-80">{props.unten}</p>
    </div>
  );
}

export function Bon({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
      <h2 className="text-sm font-black text-slate-900">{titel} im Monat</h2>
      <dl className="mt-1 space-y-0.5 text-xs">{children}</dl>
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
      <div className="flex justify-between gap-2 text-xs text-slate-700">
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
      <p className="mt-1 text-xs leading-relaxed text-slate-600 print:text-[10px]">
        Beide Wege kosten den Arbeitgeber gleich viel. So entsteht die Zahl, Monat für Monat:
      </p>
      <table className="mt-2 w-full text-xs print:mt-1 print:text-[10px]">
        <thead>
          <tr className="text-left text-[11px] text-slate-500">
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
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
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
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6 print:px-0 print:py-1">
        <Logo klasse="h-9 w-9 print:h-6 print:w-6" />
        <div>
          <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>
          <p className="text-[11px] text-slate-400 print:hidden">Ihre Zukunft. Smart geplant.</p>
        </div>
      </div>
    </header>
  );
}

/** Querverweis auf das jeweils andere Arbeitgeber-Modell. */
export function ModellWechsel({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline print:hidden">
      {text} →
    </a>
  );
}
