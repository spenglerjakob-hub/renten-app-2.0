import { versorgungsluecke, type Jahreszeile } from '@renten/engine';
import { euro } from '../components/Feld';
import { KaufkraftSchalter } from '../components/KaufkraftSchalter';
import { useAnsprache } from '../components/Ansprache';
import { LueckenRing } from '../components/LueckenRing';
import { EINLEITUNG, Hervor, Kernsatz, SCHWEBEND, Titel, Zahl } from '../components/stil';

/*
 * DER KERN DER ETAPPE „ERGEBNIS“ — gebaut wie Schritt 3 der
 * Mitarbeiterberatung und das Ergebnis der Schnellrechnung: die Luecke als
 * Aussage im Titel, der Ring als das eine schwebende Stueck, darunter der
 * Kernsatz. Die Zeile kommt von aussen, damit Titel, Ring, Kassenbon und
 * Fussleiste garantiert dasselbe Jahr zeigen.
 */

/** Was gezeigt wird: nominal oder in heutiger Kaufkraft, je nach Schalter. */
function betraege(zeile: Jahreszeile, kaufkraftHeute: boolean) {
  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  // Die andere Lesart fuer die Fussnote: wer heute sieht, liest dort nominal, und umgekehrt.
  const g = kaufkraftHeute ? 1 : 1 / zeile.kaufkraftfaktor;
  const luecke = versorgungsluecke(zeile);
  const deckung = zeile.zielNettoMonat > 0 ? Math.round((zeile.nettoMonat / zeile.zielNettoMonat) * 100) : 0;
  return { f, g, luecke, deckung };
}

/**
 * Was die gewaehlten Loesungen dazubringen (Etappe „Abschluss“): der
 * Zuwachs im Netto, der Teil davon, der im Ring noch Platz hat — mehr als
 * das Ziel zeigt der Ring nicht —, und die Prozentpunkte des Ziels. Die
 * Prozente sind dieselben gerundeten wie beim Netto, damit Netto bisher,
 * neu und Luecke zusammen 100 ergeben. Nominal; die Anzeige rechnet in ihr
 * Geld um. `null`, wenn nichts dazukommt.
 */
export function neuerTeil(zeile: Jahreszeile, vorher: Jahreszeile): { betrag: number; imRing: number; prozent: number } | null {
  const betrag = zeile.nettoMonat - vorher.nettoMonat;
  if (!(betrag >= 0.5)) return null;
  const ziel = zeile.zielNettoMonat;
  const imRing = Math.max(0, Math.min(zeile.nettoMonat, ziel) - Math.min(vorher.nettoMonat, ziel));
  const prozent = ziel > 0 ? Math.round((zeile.nettoMonat / ziel) * 100) - Math.round((vorher.nettoMonat / ziel) * 100) : 0;
  return { betrag, imRing, prozent };
}

/** Titel und Einleitung der Etappe, mit dem Schalter „Nominal | Kaufkraft heute“. */
export function ErgebnisKopf({ zeile, kaufkraftHeute, onKaufkraftHeute }: {
  zeile: Jahreszeile;
  kaufkraftHeute: boolean;
  onKaufkraftHeute: (b: boolean) => void;
}) {
  const { f, luecke } = betraege(zeile, kaufkraftHeute);
  const t = useAnsprache();
  return (
    <div>
      {/* Der Kernsatz mit dem Vornamen vorn: „Max, dir fehlen …“ — ohne Namen „Dir fehlen …“. */}
      <Titel gross als="h2">
        {luecke > 0
          ? <>{t.anrede(t.dir)} fehlen im Ruhestand <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(luecke * f)}</Hervor></span> im Monat</>
          : <>{t.anrede(t.dein())} Ziel ist <Hervor>gedeckt</Hervor></>}
      </Titel>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className={`${EINLEITUNG} min-w-0 flex-1 basis-72`}>
          Was {t.dir} im Jahr {zeile.jahr} netto bleibt — nach Steuern und Kranken- und Pflegeversicherung —
          und wie groß die Lücke zu {t.dein('em')} Ziel ist{kaufkraftHeute ? ', in heutiger Kaufkraft.' : `, nominal im Geld des Jahres ${zeile.jahr}.`}
        </p>
        <KaufkraftSchalter wert={kaufkraftHeute} onChange={onKaufkraftHeute} />
      </div>
    </div>
  );
}

/**
 * Der Ring mit Netto und Luecke, darunter der Kernsatz — das schwebende Stueck der Etappe.
 * Mit `vorher` (Etappe „Abschluss“) ist der Teil blau, den die gewaehlten Loesungen
 * dazubringen, und unter dem Netto steht „davon … neu durch die Lösungen“.
 */
export function ErgebnisRing({ zeile, kaufkraftHeute, vorher, breit = false }: {
  zeile: Jahreszeile;
  kaufkraftHeute: boolean;
  /** Dieselbe Zeile ohne die gewaehlten Loesungen — im selben Jahr */
  vorher?: Jahreszeile;
  /** Als eigenes Stueck ueber die Spalte des Ablaufs: ab mittlerer Breite der Ring links, die Zahlen daneben */
  breit?: boolean;
}) {
  const { f, g, luecke, deckung } = betraege(zeile, kaufkraftHeute);
  const ziel = zeile.zielNettoMonat * f;
  const netto = zeile.nettoMonat * f;
  const teil = vorher ? neuerTeil(zeile, vorher) : null;
  const t = useAnsprache();
  // Im Ring hoechstens bis zum Ziel: Betrag und Anteil des blauen Bogens am Ganzen.
  const deckungVorher = vorher && zeile.zielNettoMonat > 0 ? Math.round((vorher.nettoMonat / zeile.zielNettoMonat) * 100) : 0;
  const neuImRing = teil && teil.imRing > 0
    ? { wert: teil.imRing * f, prozent: Math.max(0, Math.min(100, deckung) - Math.min(100, deckungVorher)) }
    : undefined;
  return (
    <section aria-label="Ziel, Netto und Lücke" className={`${SCHWEBEND} p-5 sm:p-7`}>
      {/* Der Ring oben, die Zahlen darunter nebeneinander: In einer schmalen Spalte
          braechen sie neben dem Ring um. Als breites Stueck steht der Ring links. */}
      <div className={`flex flex-col items-center gap-6 ${breit ? 'md:flex-row md:gap-10' : ''}`}>
        <LueckenRing
          ganz={ziel} gedeckt={Math.min(netto, ziel)} luecke={luecke * f}
          gedecktProzent={Math.min(100, deckung)} lueckeProzent={Math.max(0, 100 - deckung)} texte={{ ganz: 'Ziel', mitte: `${t.Dein()} Ziel`, gedeckt: 'Netto im Ruhestand' }}
          neu={neuImRing}
        />
        <dl className="grid w-full gap-4 sm:grid-cols-2">
          <Zahl
            etikett="Netto im Ruhestand" punkt="bg-ui-tinte" wert={euro(netto)} zusatz={`${deckung}\u00a0%`}
            unter={teil && (
              <span className="flex items-start gap-2">
                <span aria-hidden className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full bg-ui-neu" />
                <span>
                  davon <strong className="font-medium text-ui-tinte">{euro(teil.betrag * f)}</strong> neu durch die
                  Lösungen{teil.prozent > 0 && <span className="whitespace-nowrap"> · {teil.prozent}{'\u00a0'}%</span>}
                </span>
              </span>
            )}
          />
          {luecke > 0 && (
            <Zahl etikett="Versorgungslücke" punkt="bg-ui-luecke ring-1 ring-ui-tinte/20" wert={euro(luecke * f)}
              zusatz={`${100 - deckung}\u00a0%`} />
          )}
        </dl>
      </div>
      <Kernsatz klasse="mt-6">
        {deckung < 100
          ? <>{t.Dein()} Netto deckt <Hervor>{deckung} %</Hervor> {t.dein('es')} Ziels.</>
          : <>{t.Dein()} Netto erreicht <Hervor>{deckung} %</Hervor> {t.dein('es')} Ziels.</>}
      </Kernsatz>
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        {kaufkraftHeute ? `Im Geld des Jahres ${zeile.jahr}` : 'In heutiger Kaufkraft'}: Netto {euro(zeile.nettoMonat * g)} und
        Ziel {euro(zeile.zielNettoMonat * g)} im Monat{luecke > 0 ? `, Lücke ${euro(luecke * g)}` : ''}.
      </p>
    </section>
  );
}
