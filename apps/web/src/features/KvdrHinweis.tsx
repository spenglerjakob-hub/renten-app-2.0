import { useMemo } from 'react';
import { projiziere, versorgungsluecke, type Szenario } from '@renten/engine';
import { euro } from '../components/Feld';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Was die KVdR gegenüber freiwilliger Mitgliedschaft im Alter wert ist.
 *
 * Die Annahme "ich komme in die KVdR" ist bei einem Selbststaendigen die
 * folgenreichste Einzelangabe des ganzen Gutachtens — und zugleich die, bei
 * der er sich am ehesten irrt. In der KVdR ist nur die gesetzliche Rente zur
 * Haelfte beitragspflichtig, eine Ruerup- oder Privatrente gar nicht; bei
 * freiwilliger Mitgliedschaft dagegen alles.
 *
 * Deshalb wird die Alternative WIRKLICH GERECHNET und nicht beschrieben:
 * `projiziere` ist eine reine Funktion eines einfachen Objekts und laesst
 * sich auf einem Klon ein zweites Mal aufrufen — dasselbe Vorgehen wie auf
 * der Stellschrauben-Seite des Gutachtens.
 */
export function KvdrHinweis({ szenario }: { szenario: SzenarioParsed }) {
  const unterschied = useMemo(() => {
    const rechne = (kvStatus: 'kvdr' | 'freiwillig') => {
      const klon: Szenario = {
        ...szenario,
        haushalt: { ...szenario.haushalt, kvStatus },
      };
      const e = projiziere(klon);
      return e.zeilen.find((z) => z.jahr === e.ruhestandsjahr) ?? null;
    };

    const mit = rechne('kvdr');
    const ohne = rechne('freiwillig');
    if (!mit || !ohne) return null;

    return {
      kvPvMit: mit.kvPvGesamt / 12,
      kvPvOhne: ohne.kvPvGesamt / 12,
      mehr: (ohne.kvPvGesamt - mit.kvPvGesamt) / 12,
      lueckeMehr: versorgungsluecke(ohne) - versorgungsluecke(mit),
    };
  }, [szenario]);

  if (!unterschied || unterschied.mehr <= 1) return null;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
      <p className="text-xs leading-relaxed text-amber-900">
        <strong>Die KVdR ist eine Annahme, keine Selbstverständlichkeit.</strong> In sie kommt
        nur, wer in der zweiten Hälfte seines Erwerbslebens zu neun Zehnteln gesetzlich versichert
        war — eine freiwillige Mitgliedschaft zählt dabei mit. Wird die Zeit nicht erreicht,
        bleiben Sie im Alter freiwillig versichert, und dann sind{' '}
        <strong>alle</strong> Ihre Einkünfte beitragspflichtig, auch eine Rürup- oder Privatrente.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
        In Ihrem Fall wären das{' '}
        <strong>{euro(unterschied.kvPvOhne)} statt {euro(unterschied.kvPvMit)}</strong> im Monat —
        ein Unterschied von <strong>{euro(unterschied.mehr)}</strong>, um den Ihre
        Versorgungslücke wachsen würde.
      </p>
    </div>
  );
}
