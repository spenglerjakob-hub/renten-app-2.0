import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { Beratung, Firma } from '../lib/bav-beratung';
import { euroGenau } from '../components/Feld';
import { KNOPF, KNOPF_ZWEIT, Karte, StatusChip, useBeraterAuftritt, useDrucken } from './bausteine';
import { UebersichtDruck } from './druck';
import { anzahlText, csvDateiname, uebersichtCsv, uebersichtSummen, uebersichtZeilen } from './uebersicht-daten';

/**
 * Die Uebersicht fuer den Arbeitgeber: am Bildschirm, gedruckt (als PDF)
 * und als CSV fuer die Lohnabrechnung. Sie entsteht beim Berater — der
 * Arbeitgeber bekommt nur, was der Berater ihm gibt.
 */
export function Uebersicht({ firma, logo, beratungen }: { firma: Firma; logo: string | null; beratungen: readonly Beratung[] }) {
  const zeilen = useMemo(() => uebersichtZeilen(firma, beratungen), [firma, beratungen]);
  const summen = useMemo(() => uebersichtSummen(zeilen), [zeilen]);
  const drucken = useDrucken();
  const auftritt = useBeraterAuftritt();
  const [geladen, setGeladen] = useState(false);

  const herunterladen = () => {
    const url = URL.createObjectURL(new Blob([uebersichtCsv(zeilen)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = csvDateiname(firma.name);
    a.click();
    URL.revokeObjectURL(url);
    setGeladen(true);
  };

  const zelle = 'border-b border-mb-linie px-2 py-2.5 align-top';
  const zahl = `${zelle} text-right tabular-nums`;

  return (
    <Karte
      titel="Übersicht für den Arbeitgeber"
      rechts={zeilen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KNOPF}
            onClick={() => drucken(<UebersichtDruck firma={firma} logo={logo} zeilen={zeilen} summen={summen} auftritt={auftritt} />)}>
            <Printer className="h-4 w-4" aria-hidden /> Drucken
          </button>
          <button type="button" className={KNOPF_ZWEIT} onClick={herunterladen}>
            <Download className="h-4 w-4" aria-hidden /> CSV
          </button>
        </div>
      )}
    >
      <p className="text-sm leading-relaxed text-mb-schiefer">
        Wer teilnimmt, mit welchem Betrag und ab wann — für die Lohnabrechnung. Gehälter und persönliche Angaben aus den
        Gesprächen stehen nicht darin.
      </p>

      {zeilen.length === 0 ? (
        <p className="mt-3 text-sm text-mb-schiefer">Noch keine Beratung — die Übersicht füllt sich mit den Gesprächen.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="mb-innen p-4">
              <dt className="text-sm text-mb-schiefer">Beratungen</dt>
              <dd className="mt-1 text-sm font-medium leading-snug text-mb-tinte">
                {anzahlText('teilnahme', summen.teilnahmen)}<br />{anzahlText('verzicht', summen.verzichte)}<br />{anzahlText('offen', summen.offen)}
              </dd>
            </div>
            {[
              { titel: 'Umwandlung', wert: summen.umwandlungMonat },
              { titel: 'Arbeitgeber', wert: summen.arbeitgeberMonat },
              { titel: 'In die Vorsorge', wert: summen.gesamtMonat },
            ].map((k) => (
              <div key={k.titel} className="mb-innen p-4">
                <dt className="text-sm text-mb-schiefer">{k.titel} im Monat</dt>
                <dd className="mt-1 text-xl font-medium tabular-nums text-mb-tinte">{euroGenau(k.wert)}</dd>
                <dd className="text-xs tabular-nums text-mb-schiefer">{euroGenau(k.wert * 12)} im Jahr</dd>
              </div>
            ))}
          </dl>

          {/* Auf dem Telefon je Mitarbeiter ein Eintrag — die Tabelle braucht mehr Breite. Die Summen stehen oben. */}
          <ul className="mt-4 divide-y divide-mb-linie sm:hidden" aria-label="Entscheidungen">
            {zeilen.map((z, i) => (
              <li key={`${z.name}-${i}`} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium text-mb-tinte">{z.name}</span>
                  <StatusChip status={z.status} />
                </div>
                {z.status === 'teilnahme' && (
                  <p className="mt-0.5 text-xs tabular-nums text-mb-schiefer">
                    {euroGenau(z.umwandlungMonat)} + {euroGenau(z.arbeitgeberMonat)} Arbeitgeber = {euroGenau(z.gesamtMonat)}
                    {z.beginn ? `, ab ${z.beginn}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-mb-schiefer">
                  <th className={zelle}>Name</th>
                  <th className={zelle}>Entscheidung</th>
                  <th className={`${zelle} text-right`}>Umwandlung</th>
                  <th className={`${zelle} text-right`}>Arbeitgeber</th>
                  <th className={`${zelle} text-right`}>Gesamt</th>
                  <th className={zelle}>Beginn</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => (
                  <tr key={`${z.name}-${i}`}>
                    <td className={`${zelle} break-words font-medium text-mb-tinte`}>{z.name}</td>
                    <td className={zelle}><StatusChip status={z.status} /></td>
                    <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.umwandlungMonat) : '—'}</td>
                    <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.arbeitgeberMonat) : '—'}</td>
                    <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.gesamtMonat) : '—'}</td>
                    <td className={`${zelle} tabular-nums`}>{z.beginn || (z.status === 'teilnahme' ? 'offen' : '')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium text-mb-tinte">
                  <td className={zelle} colSpan={2}>Summe im Monat</td>
                  <td className={zahl}>{euroGenau(summen.umwandlungMonat)}</td>
                  <td className={zahl}>{euroGenau(summen.arbeitgeberMonat)}</td>
                  <td className={zahl}>{euroGenau(summen.gesamtMonat)}</td>
                  <td className={zelle} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p role="status" className="mt-3 text-xs leading-relaxed text-mb-schiefer">
            {geladen
              ? 'Die CSV-Datei liegt in Ihrem Download-Ordner. Sie öffnet sich direkt in Excel.'
              : 'Die CSV-Datei öffnet sich direkt in Excel. Beträge laut Beratung — maßgeblich sind die unterschriebenen Vereinbarungen.'}
          </p>
        </>
      )}
    </Karte>
  );
}
