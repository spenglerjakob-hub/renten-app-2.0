import { useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Coins, Download, FolderOpen, List, Printer,
  RotateCcw, Settings, TrendingUp, User, Users, Wallet,
} from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from './store/szenario';
import { useProjektion } from './worker/useProjektion';
import { Basisdaten } from './features/Basisdaten';
import { Vertraege } from './features/Vertraege';
import { Planer } from './features/Planer';
import { Kassenbon } from './features/Kassenbon';
import { Verlauf } from './features/Verlauf';
import { Rechtsstand } from './features/Rechtsstand';
import { SteuerEngine } from './features/SteuerEngine';
import { Konto } from './features/Konto';
import { VertragsTuev } from './features/VertragsTuev';
import { Gutachten } from './druck/Gutachten';
import { EhepartnerDialog } from './features/EhepartnerDialog';
import { Logo } from './components/Logo';
import { Reiterleiste } from './components/Reiterleiste';
import { AkkordeonKarte, euro } from './components/Feld';

type Reiter = 's1' | 's2' | 's3' | 'planer';
type Ansicht = 'kassenbon' | 'verlauf';

const REITER: { id: Reiter; text: string }[] = [
  { id: 's1', text: 'Schicht 1' },
  { id: 's2', text: 'Schicht 2' },
  { id: 's3', text: 'Schicht 3' },
  { id: 'planer', text: 'Planer' },
];

const QUOTEN = [0, 0.01, 0.015, 0.02, 0.025];

/**
 * Rueckfallebene, wenn der Rechenkern keine Zeitachse liefern kann — etwa
 * weil ein Geburtsdatum unvollstaendig ist.
 *
 * Frueher hing die gesamte rechte Spalte an `ergebnis && zeile`. Fehlte die
 * Zeile, verschwanden Kennzahlen, Kassenbon und Fussleiste schlagartig, und es
 * stand nur noch "Berechnung laeuft ..." da. Mit dieser Zeile bleibt das
 * Geruest stehen und zeigt Nullwerte; der Grund steht als Hinweis darueber.
 */
const LEERE_ZEILE: Jahreszeile = {
  jahr: new Date().getFullYear(),
  alterA: 0, alterB: null,
  vollstaendigImRuhestand: false, gemischtePhase: false,
  bruttoGesamt: 0, kvPvGesamt: 0, steuerGesamt: 0, nettoGesamt: 0, nettoMonat: 0,
  zielNettoMonat: 0, kaufkraftfaktor: 1,
  zve: 0, durchschnittssatz: 0, grenzsatz: 0,
  posten: [], parameterFortgeschrieben: false,
};

/** Kleine Auswahl in der dunklen Kopfleiste. */
function KopfAuswahl({
  titel, wert, onChange, farbe,
}: { titel: string; wert: number; onChange: (n: number) => void; farbe: string }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-white shadow sm:text-xs ${farbe}`}>
      <span>{titel}</span>
      <select
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={titel}
        className="cursor-pointer bg-transparent font-bold outline-none"
      >
        {QUOTEN.map((q) => (
          <option key={q} value={q} className="text-slate-900">
            {(q * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
          </option>
        ))}
      </select>
    </span>
  );
}

export default function App() {
  const szenario = useSzenario((s) => s.szenario);
  const importMeldung = useSzenario((s) => s.importMeldung);
  const alsJsonExportieren = useSzenario((s) => s.alsJsonExportieren);
  const ausJsonImportieren = useSzenario((s) => s.ausJsonImportieren);
  const zuruecksetzen = useSzenario((s) => s.zuruecksetzen);
  const setzeAnnahmen = useSzenario((s) => s.setzeAnnahmen);
  const setzeHaushalt = useSzenario((s) => s.setzeHaushalt);
  const partnerHinzufuegen = useSzenario((s) => s.partnerHinzufuegen);

  const [reiter, setReiter] = useState<Reiter>('s1');
  const [ansicht, setAnsicht] = useState<Ansicht>('kassenbon');
  const [kaufkraftHeute, setKaufkraftHeute] = useState(false);
  const [kopfEingeklappt, setKopfEingeklappt] = useState(false);
  const [menueOffen, setMenueOffen] = useState(false);
  const [basisOffen, setBasisOffen] = useState(true);
  const [kontoOffen, setKontoOffen] = useState(false);
  const [ehepartnerDialog, setEhepartnerDialog] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  const { ergebnis, rechnet, fehler, dauerMs } = useProjektion(szenario);

  const exportieren = () => {
    const blob = new Blob([alsJsonExportieren()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentenplaner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importieren = (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    if (!datei) return;
    datei.text().then(ausJsonImportieren);
    e.target.value = '';
  };

  const echteZeile =
    ergebnis?.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr) ??
    ergebnis?.zeilen.find((z) => z.vollstaendigImRuhestand);
  const zeile = echteZeile ?? LEERE_ZEILE;
  const faktor = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const luecke = Math.max(0, zeile.zielNettoMonat - zeile.nettoMonat);
  // Hinweise des Rechenkerns lagen bisher ungenutzt im Ergebnis.
  const hinweise = ergebnis && !echteZeile ? ergebnis.hinweise : [];

  const verheiratet = szenario.haushalt.verheiratet;

  return (
    <div className="min-h-screen bg-slate-50 pb-40 text-slate-800 sm:pb-36 print:pb-0">
      {/* KOPFZEILE */}
      <header
        className={`sticky top-0 z-50 bg-slate-900 text-white shadow-md transition-all print:hidden ${
          kopfEingeklappt ? 'py-2 sm:py-3' : 'p-2 sm:p-4'
        }`}
      >
        <div
          className={`relative mx-auto flex min-h-[40px] max-w-6xl px-1 sm:px-0 ${
            kopfEingeklappt ? 'items-center justify-center' : 'flex-col justify-between md:flex-row md:items-center'
          }`}
        >
          {/*
            md:shrink-0 ist noetig: sonst staucht die breite Bedienleiste
            diesen Block, das Logo haelt als shrink-0 dagegen und der
            Einklapp-Knopf rutscht unter die Leiste — er waere sichtbar,
            aber nicht mehr anklickbar.
          */}
          <div className={`flex items-center md:shrink-0 ${kopfEingeklappt ? 'w-full justify-center' : 'w-full justify-between md:w-auto md:gap-3'}`}>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <Logo klasse={kopfEingeklappt ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-10 w-10 sm:h-14 sm:w-14'} />
              <div className="text-left">
                <h1 className={`font-extrabold leading-tight tracking-tight ${kopfEingeklappt ? 'text-base sm:text-xl' : 'text-lg sm:text-2xl'}`}>
                  JS-Rentenplaner
                </h1>
                <p className={`mt-0.5 font-medium text-slate-400 ${kopfEingeklappt ? 'text-[8px] sm:text-[10px]' : 'text-[10px] sm:text-xs'}`}>
                  Ihre Zukunft. Smart geplant.
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-2 ${kopfEingeklappt ? 'absolute right-1 sm:right-0' : ''}`}>
              {!kopfEingeklappt && (
                <button
                  type="button"
                  onClick={() => setMenueOffen((v) => !v)}
                  aria-expanded={menueOffen}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs font-bold text-slate-300 hover:bg-slate-700 md:hidden"
                >
                  <Settings className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Menü</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setKopfEingeklappt((v) => !v)}
                aria-expanded={!kopfEingeklappt}
                title={kopfEingeklappt ? 'Kopfzeile ausklappen' : 'Kopfzeile einklappen'}
                className="rounded-full border border-slate-700 bg-slate-800 p-2 text-slate-300 shadow-sm hover:bg-slate-700 hover:text-white"
              >
                {kopfEingeklappt
                  ? <ChevronDown className="h-4 w-4" aria-hidden />
                  : <ChevronUp className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>

          {!kopfEingeklappt && (
            <div className={`${menueOffen ? 'flex' : 'hidden'} mt-3 w-full flex-col items-stretch gap-2 md:mt-0 md:flex md:w-auto md:flex-row md:items-center`}>
              <div className="flex flex-wrap justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5">
                <button
                  type="button"
                  onClick={() => setKaufkraftHeute((v) => !v)}
                  aria-pressed={kaufkraftHeute}
                  className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-medium transition-all sm:flex-none sm:text-xs ${
                    kaufkraftHeute ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Coins className="h-3 w-3 shrink-0" aria-hidden /> Kaufkraft heute
                </button>
                <KopfAuswahl
                  titel="Infl.:"
                  wert={szenario.annahmen.inflation}
                  onChange={(n) => setzeAnnahmen({ inflation: n })}
                  farbe="bg-emerald-600"
                />
                <KopfAuswahl
                  titel="Rente:"
                  wert={szenario.annahmen.rentendynamik}
                  onChange={(n) => setzeAnnahmen({ rentendynamik: n })}
                  farbe="bg-indigo-600"
                />
                <span className="my-1 h-px w-full bg-slate-700 sm:mx-0.5 sm:my-0 sm:h-5 sm:w-px" />
                <button
                  type="button"
                  onClick={() => setzeHaushalt({ verheiratet: false })}
                  aria-pressed={!verheiratet}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all sm:flex-none sm:text-xs ${
                    !verheiratet ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="h-3 w-3 shrink-0" aria-hidden /> Single
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setzeHaushalt({ verheiratet: true });
                    partnerHinzufuegen();
                    setEhepartnerDialog(true);
                  }}
                  aria-pressed={verheiratet}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all sm:flex-none sm:text-xs ${
                    verheiratet ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="h-3 w-3 shrink-0" aria-hidden /> Verheiratet
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5">
                <input ref={dateiRef} type="file" accept=".json" onChange={importieren} className="hidden" />
                <button
                  type="button"
                  onClick={() => dateiRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white sm:flex-none sm:text-xs"
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> Laden
                </button>
                <button
                  type="button"
                  onClick={exportieren}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white sm:flex-none sm:text-xs"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden /> Speichern
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-rose-500 sm:flex-none sm:text-xs"
                >
                  <Printer className="h-3 w-3 shrink-0" aria-hidden /> Drucken
                </button>
                <button
                  type="button"
                  onClick={zuruecksetzen}
                  aria-label="Alle Eingaben zurücksetzen"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/*
        DAS GEDRUCKTE GUTACHTEN.
        Eigenes Dokument statt Druck-CSS auf der Bedienoberflaeche: die
        besteht aus Formularfeldern, Reitern und Scrollbereichen und ergibt
        auf Papier leere Eingabekaesten, fehlende Vertraege und
        abgeschnittene Tabellen. Alles darunter ist deshalb print:hidden.
      */}
      <Gutachten szenario={szenario} ergebnis={ergebnis ?? null} zeile={zeile} />

      {importMeldung && (
        <div
          role="status"
          className={`mx-auto mt-3 max-w-6xl rounded-lg px-4 py-3 text-sm print:hidden ${
            importMeldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
          }`}
        >
          <strong>{importMeldung.art === 'ok' ? 'Geladen.' : 'Datei konnte nicht geladen werden.'}</strong>
          <ul className="mt-1 list-inside list-disc">
            {importMeldung.texte.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-2 sm:gap-8 sm:p-6 lg:grid-cols-12 print:hidden">
        {/* LINKE SPALTE: EINGABEN */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-6 xl:col-span-5 print:hidden">
          <AkkordeonKarte
            titel="Allgemeine Daten & Ziel"
            offen={basisOffen}
            onUmschalten={() => setBasisOffen((v) => !v)}
            symbol={<User className="h-4 w-4 text-slate-400" aria-hidden />}
          >
            <Basisdaten onEhepartnerDialog={() => setEhepartnerDialog(true)} />
          </AkkordeonKarte>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Reiterleiste
              reiter={REITER}
              aktiv={reiter}
              onWechsel={setReiter}
              beschriftung="Versorgungsschichten"
            />
            <div className="min-h-[300px] bg-slate-50/50 p-3 sm:min-h-[400px] sm:p-4">
              {reiter === 's1' && <Vertraege schicht={1} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} />}
              {reiter === 's2' && <Vertraege schicht={2} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} />}
              {reiter === 's3' && <Vertraege schicht={3} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} />}
              {reiter === 'planer' && <Planer ergebnis={ergebnis?.planer ?? null} />}
            </div>
          </section>

          <AkkordeonKarte
            titel="Konto"
            offen={kontoOffen}
            onUmschalten={() => setKontoOffen((v) => !v)}
            symbol={<Wallet className="h-4 w-4 text-slate-400" aria-hidden />}
          >
            <Konto />
          </AkkordeonKarte>
        </div>

        {/* RECHTE SPALTE: ERGEBNIS */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-6 xl:col-span-7 print:col-span-12">
          {fehler && (
            <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
              Die Berechnung ist fehlgeschlagen: {fehler}
            </div>
          )}

          {hinweise.length > 0 && (
            <div role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <ul className="list-inside list-disc space-y-1">
                {hinweise.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </div>
          )}

          {ergebnis ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
                  <h3 className="mb-0.5 text-[10px] font-semibold leading-tight text-slate-500 sm:mb-1 sm:text-sm">
                    Bedarf im Jahr {zeile.jahr}
                  </h3>
                  <p className="text-lg font-bold tabular-nums sm:text-3xl">
                    {euro(zeile.zielNettoMonat * faktor)}
                  </p>
                </div>
                <div
                  className={`flex flex-col justify-center rounded-xl border bg-white p-3 shadow-sm sm:p-6 ${
                    luecke > 0 ? 'border-rose-200 text-rose-600' : 'border-emerald-200 text-emerald-600'
                  }`}
                >
                  <h3 className="mb-0.5 text-[10px] font-semibold leading-tight sm:mb-1 sm:text-sm">
                    Versorgungslücke
                  </h3>
                  <p className="text-lg font-bold tabular-nums sm:text-3xl">
                    {luecke > 0 ? euro(luecke * faktor) : 'Gedeckt'}
                  </p>
                </div>
              </div>

              <SteuerEngine ergebnis={ergebnis} zeile={zeile} faktor={faktor} />

              <div className="flex rounded border border-slate-200 bg-slate-200/50 p-1 print:hidden">
                <button
                  type="button"
                  onClick={() => setAnsicht('kassenbon')}
                  aria-pressed={ansicht === 'kassenbon'}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-bold sm:gap-2 sm:py-2 sm:text-xs ${
                    ansicht === 'kassenbon' ? 'bg-white shadow' : 'text-slate-500'
                  }`}
                >
                  <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden /> Kassenbon
                </button>
                <button
                  type="button"
                  onClick={() => setAnsicht('verlauf')}
                  aria-pressed={ansicht === 'verlauf'}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-bold sm:gap-2 sm:py-2 sm:text-xs ${
                    ansicht === 'verlauf' ? 'bg-white shadow' : 'text-slate-500'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden /> Verlauf
                </button>
              </div>

              <div className={ansicht === 'kassenbon' ? 'block' : 'hidden'}>
                <Kassenbon ergebnis={ergebnis} zeile={zeile} kaufkraftHeute={kaufkraftHeute} />
              </div>
              <div className={ansicht === 'verlauf' ? 'block' : 'hidden'}>
                <Verlauf ergebnis={ergebnis} kaufkraftHeute={kaufkraftHeute} />
              </div>

              <Rechtsstand
                ergebnis={ergebnis}
                tarifIndex={szenario.annahmen.tarifIndex}
                rentendynamik={szenario.annahmen.rentendynamik}
                inflation={szenario.annahmen.inflation}
              />
            </>
          ) : (
            <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-slate-500">
              Berechnung läuft …
            </p>
          )}

          <p className="text-right text-[11px] text-slate-400 print:hidden" aria-live="polite">
            {rechnet ? 'rechnet …' : `berechnet in ${dauerMs.toFixed(0)} ms im Hintergrund`}
          </p>
        </div>
      </main>

      <EhepartnerDialog offen={ehepartnerDialog} onSchliessen={() => setEhepartnerDialog(false)} />

      <div className="print:hidden">
        <VertragsTuev ergebnis={ergebnis ?? null} szenario={szenario} />
      </div>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500 print:hidden">
        <p>
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Die Berechnung läuft
          vollständig in Ihrem Browser — ohne Anmeldung verlassen Ihre Eingaben dieses Gerät nicht.
        </p>
      </footer>

      {/* FESTE FUSSLEISTE */}
      {zeile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)] print:hidden">
          <div className="mx-auto max-w-6xl px-2 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-1.5 sm:gap-4">
              <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-center sm:p-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:mb-1 sm:text-xs">
                  Zielbedarf
                </div>
                <div className="text-base font-bold tabular-nums text-white sm:text-xl">
                  {euro(zeile.zielNettoMonat * faktor)}
                </div>
              </div>

              <div className="text-[10px] font-black text-slate-500 sm:text-sm">−</div>

              <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-center sm:p-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:mb-1 sm:text-xs">
                  Gesamt-Netto
                </div>
                <div className="text-base font-bold tabular-nums text-indigo-400 sm:text-xl">
                  {euro(zeile.nettoMonat * faktor)}
                </div>
              </div>

              <div className="text-[11px] font-black text-slate-500 sm:text-sm">=</div>

              <div
                className={`flex-1 rounded-lg border p-1.5 text-center shadow-inner sm:p-2.5 ${
                  luecke > 0
                    ? 'border-rose-700/50 bg-rose-900/30 text-rose-400'
                    : 'border-emerald-700/50 bg-emerald-900/30 text-emerald-400'
                }`}
              >
                <div className={`mb-0.5 text-[10px] font-bold uppercase tracking-wider sm:mb-1 sm:text-xs ${luecke > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  Versorgungslücke
                </div>
                <div className="text-base font-black tabular-nums sm:text-xl">
                  {luecke > 0 ? euro(luecke * faktor) : 'Gedeckt'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
