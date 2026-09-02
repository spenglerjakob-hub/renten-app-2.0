import { ZUSCHLAG_QUOTE, ZUSCHLAG_BIS_ALTER, DAEMPFUNG_AB_ALTER } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, Schalter } from '../components/Feld';

/**
 * Die Eingaben zur privaten Krankenversicherung.
 *
 * WAS HIER RECHTSSTAND IST UND WAS ANNAHME — die Trennung steht bewusst auch
 * in der Oberflaeche, nicht nur im Rechenkern:
 *
 *   Der Wegfall des gesetzlichen Zuschlags mit 61 ist Rechtsstand (§ 149 VAG)
 *   und deshalb KEINE Stellschraube. Einstellbar ist nur, ob er in der
 *   eingetragenen Praemie ueberhaupt steckt — das weiss nur der Nutzer.
 *
 *   Die beiden Steigerungssaetze sind Annahmen: § 150 Abs. 3 VAG schreibt
 *   vor, dass die angesparten Mittel ab 65 Erhoehungen daempfen, nicht um wie
 *   viel. Also gehoeren sie dem Nutzer.
 */
export function PkvFelder() {
  const pkv = useSzenario((x) => x.szenario.haushalt.pkv);
  const setzeHaushalt = useSzenario((x) => x.setzeHaushalt);

  const setze = (teil: Partial<typeof pkv>) => setzeHaushalt({ pkv: { ...pkv, ...teil } });
  const setzeBet = (teil: Partial<typeof pkv.bet>) =>
    setzeHaushalt({ pkv: { ...pkv, bet: { ...pkv.bet, ...teil } } });

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Ihre private Krankenversicherung
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <ZahlFeld
          label="Beitrag monatlich"
          wert={pkv.praemieMonat}
          onChange={(n) => setze({ praemieMonat: n })}
          einheit="€"
          hilfe="Kranken- und Pflegeversicherung zusammen, wie Sie ihn heute zahlen."
        />
        <ProzentFeld
          label="Steigerung p. a."
          wert={pkv.steigerung}
          onChange={(n) => setze({ steigerung: n })}
          max={15}
          hilfe="Bis 64. Historisch lagen PKV-Beiträge über der allgemeinen Inflation."
        />
        <ProzentFeld
          label={`Steigerung ab ${DAEMPFUNG_AB_ALTER}`}
          wert={pkv.steigerungAb65}
          onChange={(n) => setze({ steigerungAb65: n })}
          max={15}
          hilfe={`Gedämpft: ab ${DAEMPFUNG_AB_ALTER} finanzieren die angesparten Mittel die Erhöhungen mit (§ 150 Abs. 3 VAG).`}
        />
      </div>

      <div className="mt-3">
        <Schalter
          label={`Der gesetzliche Zuschlag von ${Math.round(ZUSCHLAG_QUOTE * 100)} % steckt im Beitrag`}
          wert={pkv.zuschlagEnthalten}
          onChange={(b) => setze({ zuschlagEnthalten: b })}
        />
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Er wird bis zum Kalenderjahr Ihres {ZUSCHLAG_BIS_ALTER}. Geburtstags erhoben und entfällt
          danach (§ 149 VAG) — der Beitrag sinkt dann einmalig um gut 9 %. Wer die Grenze schon
          überschritten hat, lässt den Haken weg.
        </p>
      </div>

      {/*
        Der Entlastungstarif steht bewusst HIER und nicht in Schicht 3: er
        zahlt keine Rente, er senkt eine Ausgabe. Im Vertrags-TUEV haetten
        Netto-Hebel und Nettorendite bei ihm eine andere Bedeutung als bei
        jedem anderen Vertrag.
      */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Schalter
          label="Beitragsentlastungstarif vorhanden"
          wert={pkv.bet.aktiv}
          onChange={(b) => setzeBet({ aktiv: b })}
        />
        {pkv.bet.aktiv && (
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <ZahlFeld
              label="Beitrag monatlich"
              wert={pkv.bet.beitragMonat}
              onChange={(n) => setzeBet({ beitragMonat: n })}
              einheit="€"
            />
            <ZahlFeld
              label="Entlastung monatlich"
              wert={pkv.bet.entlastungMonat}
              onChange={(n) => setzeBet({ entlastungMonat: n })}
              einheit="€"
              hilfe="Fester Betrag, er wächst nicht mit."
            />
            <ZahlFeld
              label="Ab Alter"
              wert={pkv.bet.abAlter}
              onChange={(n) => setzeBet({ abAlter: n })}
              min={50}
              max={90}
              einheit="J."
            />
          </div>
        )}
      </div>
    </div>
  );
}
