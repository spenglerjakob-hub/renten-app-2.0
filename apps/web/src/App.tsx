import { useRef, useState } from 'react';
import { Download, FolderOpen, Printer, RotateCcw, Coins } from 'lucide-react';
import { useSzenario } from './store/szenario';
import { useProjektion } from './worker/useProjektion';
import { Basisdaten } from './features/Basisdaten';
import { Vertraege } from './features/Vertraege';
import { Kassenbon } from './features/Kassenbon';
import { Verlauf } from './features/Verlauf';
import { Rechtsstand } from './features/Rechtsstand';
import { Konto } from './features/Konto';
import { euro } from './components/Feld';

type Reiter = 'basis' | 's1' | 's2' | 's3' | 'konto';

const REITER: { id: Reiter; text: string }[] = [
  { id: 'basis', text: 'Basisdaten' },
  { id: 's1', text: 'Schicht 1' },
  { id: 's2', text: 'Schicht 2' },
  { id: 's3', text: 'Schicht 3' },
  { id: 'konto', text: 'Konto' },
];

export default function App() {
  const szenario = useSzenario((s) => s.szenario);
  const importMeldung = useSzenario((s) => s.importMeldung);
  const { alsJsonExportieren, ausJsonImportieren, zuruecksetzen } = useSzenario();

  const [reiter, setReiter] = useState<Reiter>('basis');
  const [kaufkraftHeute, setKaufkraftHeute] = useState(false);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">JS-Rentenplaner</h1>
            <p className="text-xs text-slate-400">Brutto zu Netto nach deutschem Steuer- und Sozialrecht</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setKaufkraftHeute((v) => !v)}
              aria-pressed={kaufkraftHeute}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                kaufkraftHeute ? 'bg-emerald-600' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}>
              <Coins className="h-3.5 w-3.5" aria-hidden /> Kaufkraft heute
            </button>
            <input ref={dateiRef} type="file" accept=".json" onChange={importieren} className="hidden" />
            <button type="button" onClick={() => dateiRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Laden
            </button>
            <button type="button" onClick={exportieren}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
              <Download className="h-3.5 w-3.5" aria-hidden /> Speichern
            </button>
            <button type="button" onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500">
              <Printer className="h-3.5 w-3.5" aria-hidden /> Drucken
            </button>
            <button type="button" onClick={zuruecksetzen} aria-label="Alle Eingaben zurücksetzen"
              className="rounded-md bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {importMeldung && (
        <div role="status" className={`mx-auto mt-3 max-w-7xl rounded-lg px-4 py-3 text-sm ${
          importMeldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
        }`}>
          <strong>{importMeldung.art === 'ok' ? 'Geladen.' : 'Datei konnte nicht geladen werden.'}</strong>
          <ul className="mt-1 list-inside list-disc">
            {importMeldung.texte.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5 print:hidden">
          <nav className="flex gap-1 rounded-lg bg-slate-200/70 p-1" aria-label="Eingabebereiche">
            {REITER.map((r) => (
              <button key={r.id} type="button" onClick={() => setReiter(r.id)}
                aria-current={reiter === r.id ? 'page' : undefined}
                className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold ${
                  reiter === r.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}>
                {r.text}
              </button>
            ))}
          </nav>

          {reiter === 'basis' && <Basisdaten />}
          {reiter === 's1' && <Vertraege schicht={1} />}
          {reiter === 's2' && <Vertraege schicht={2} />}
          {reiter === 's3' && <Vertraege schicht={3} />}
          {reiter === 'konto' && <Konto />}
        </div>

        <div className="space-y-4 lg:col-span-7">
          {fehler && (
            <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
              Die Berechnung ist fehlgeschlagen: {fehler}
            </div>
          )}

          {ergebnis ? (
            <>
              <Kassenbon ergebnis={ergebnis} kaufkraftHeute={kaufkraftHeute} />
              <Verlauf ergebnis={ergebnis} kaufkraftHeute={kaufkraftHeute} />
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

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-slate-500">
        <p>
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Die Berechnung läuft
          vollständig in Ihrem Browser — ohne Anmeldung verlassen Ihre Eingaben dieses Gerät nicht.
        </p>
      </footer>
    </div>
  );
}
