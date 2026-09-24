import { ZUSCHLAG_QUOTE, ZUSCHLAG_BIS_ALTER, DAEMPFUNG_AB_ALTER } from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';

/**
 * Der Typ des SCHEMAS, nicht der des Rechenkerns: Das Schema fuehrt
 * zusaetzlich die Idempotenzmarke `praemieEnthaeltBet`, und ohne sie liesse
 * sich das Ergebnis nicht zurueck in den Speicher schreiben.
 */
export type PkvFelderWert = SzenarioParsed['haushalt']['pkv'];
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
/**
 * Die Felder der privaten Krankenversicherung.
 *
 * Wert und Rueckgabe kommen von aussen, seit es sie zweimal gibt: einmal fuer
 * den Haushalt und einmal je Person, die abweichend versichert ist. Vorher
 * griff die Komponente selbst auf `haushalt.pkv` zu und liess sich deshalb
 * nur an einer Stelle einsetzen.
 */
export function PkvFelder({ wert, onChange, titel, einfach = false }: {
  wert?: PkvFelderWert;
  onChange?: (p: PkvFelderWert) => void;
  titel?: string;
  /**
   * Ohne die beiden Steigerungssaetze und ohne den Schalter zum
   * gesetzlichen Zuschlag — fuer den Vorsorge-Check. Ein Endkunde soll dort
   * nicht ueber Beitragsentwicklungen nachdenken muessen; es gelten die
   * Vorgaben des Rechners, und der Berater passt sie nach der Uebernahme bei
   * Bedarf an.
   */
  einfach?: boolean;
}) {
  const haushaltsPkv = useSzenario((x) => x.szenario.haushalt.pkv);
  const setzeHaushalt = useSzenario((x) => x.setzeHaushalt);
  const pkv = wert ?? haushaltsPkv;
  const schreibe = (p: PkvFelderWert) =>
    (onChange ? onChange(p) : setzeHaushalt({ pkv: p }));

  const setze = (teil: Partial<typeof pkv>) => schreibe({ ...pkv, ...teil });
  const setzeBet = (teil: Partial<typeof pkv.bet>) =>
    schreibe({ ...pkv, bet: { ...pkv.bet, ...teil } });

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {titel ?? 'Ihre private Krankenversicherung'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/*
          EIN Betrag, so wie er auf der Rechnung steht — einschliesslich des
          Entlastungstarifs. Frueher gehoerte der hier NICHT hinein und stand
          unten noch einmal, beide Felder hiessen „Beitrag monatlich". Wer
          seine Rechnung abtippte, zaehlte den Entlastungstarif doppelt.
        */}
        <ZahlFeld
          label="Gesamtbeitrag monatlich"
          wert={pkv.praemieMonat}
          onChange={(n) => setze({ praemieMonat: n })}
          einheit="€"
          hilfe={pkv.bet.aktiv
            ? 'Alles zusammen, wie auf Ihrer Rechnung — Kranken-, Pflege- und Entlastungstarif.'
            : 'Kranken- und Pflegeversicherung zusammen, wie Sie ihn heute zahlen.'}
        />
        {!einfach && (
          <>
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
          </>
        )}
      </div>

      {/*
        Im einfachen Modus ohne diesen Schalter: Es gilt „ja". Das ist fuer
        Endkunden die richtige Annahme — der Rechenkern zieht den Zuschlag
        ohnehin nur ab, wenn jemand heute hoechstens 60 ist; fuer Aeltere
        wirkt die Vorgabe gar nicht.
      */}
      {!einfach && (
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
      )}

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
          <>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ZahlFeld
                label="Davon Entlastungstarif"
                wert={pkv.bet.beitragMonat}
                onChange={(n) => setzeBet({ beitragMonat: n })}
                einheit="€"
                hilfe="Welcher Teil des Gesamtbeitrags oben darauf entfällt."
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
              {/*
                Ohne dieses Jahr rechnete die Gegenueberstellung, als begaenne
                der Tarif heute — wer seit zehn Jahren einzahlt, sah zu wenig
                Eingezahltes und einen zu fruehen Break-even.
              */}
              <ZahlFeld
                label="Tarif läuft seit"
                wert={pkv.bet.beginnJahr ?? new Date().getFullYear()}
                onChange={(n) => setzeBet({ beginnJahr: n })}
                min={1900}
                max={new Date().getFullYear()}
                hilfe="Abschlussjahr — sonst zählt die Rechnung nur ab heute."
              />
              {/*
                Der Beitrag endet dort meist NICHT. Bei der AXA sinkt er auf
                ein Viertel und laeuft weiter — ihn auf null zu setzen, wie
                es die Rechnung frueher tat, zeigte den Ruhestand zu guenstig.
              */}
              <ProzentFeld
                label="Beitrag im Ruhestand"
                wert={pkv.bet.beitragImRuhestand}
                onChange={(n) => setzeBet({ beitragImRuhestand: n })}
                max={100}
                stellen={0}
                hilfe="Anteil, der ab diesem Alter weiterläuft. 0 % für Tarife, die dann beitragsfrei sind."
              />
            </div>
            {pkv.bet.beitragMonat > pkv.praemieMonat && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Der Entlastungstarif ist größer als der Gesamtbeitrag oben. Tragen Sie oben den
                <strong> vollen </strong> Beitrag ein — Kranken-, Pflege- und Entlastungstarif
                zusammen.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
