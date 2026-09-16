import type { Szenario, PersonId, EinkommenHeute } from '../model.js';

/**
 * EINZELBETRACHTUNG — „Wie stehe ich allein da?"
 *
 * WOZU: Die Aufteilung der Haushaltsrechnung auf zwei Personen (`jePerson`)
 * beantwortet, WOHER welcher Euro kommt. Sie beantwortet nicht, was von diesen
 * Euro bliebe, wenn der Partner nicht da waere — und genau das ist die Frage,
 * die gestellt wird, besonders von Frauen und Muettern: die eigenen Ansprueche,
 * losgeloest von dem, was der Partner aufgebaut hat.
 *
 * Der Unterschied ist erheblich und liegt nicht an den Betraegen, sondern am
 * Recht:
 *
 *   - Grundtarif statt Splitting (§ 32a EStG ohne Abs. 5),
 *   - Sonderausgaben- und Sparerpauschbetrag nur einfach,
 *   - und die beitragsfreie Mitversicherung des § 10 SGB V faellt weg, weil
 *     sie am Ehegatten haengt. Wer wenig eigene Rente hat, zahlt dann den
 *     Mindestbeitrag nach § 240 Abs. 4 SGB V.
 *
 * WIE: Gerechnet wird mit dem unveraenderten `projiziere()`. Dieselbe Machart
 * wie beim Vertrags-TUEV, beim KVdR-Hinweis und bei den Stellschrauben —
 * `projiziere` ist eine reine Funktion eines einfachen Objekts und laesst sich
 * auf einem Klon ein zweites Mal aufrufen. Neu ist nur, dass hier zum ersten
 * Mal etwas ENTFERNT wird, und das ist der heikle Teil (siehe unten).
 *
 * WAS DAS HIER NICHT IST: die Rechnung fuer den Todesfall. Dort kaeme die
 * Witwen- oder Witwerrente nach § 46 SGB VI hinzu, dazu die
 * Einkommensanrechnung. „Allein" heisst hier: ohne den Partner UND ohne das,
 * was sich von ihm ableitet.
 */

/**
 * DAS ZIEL WIRD NICHT UMGERECHNET.
 *
 * Hier stand eine Hochrechnung: Der eigene Anteil am Paarbudget wurde mit vier
 * Dritteln multipliziert, weil ein Einpersonenhaushalt nach der
 * OECD-Aequivalenzskala zwei Drittel des Paarbedarfs braucht — Miete und
 * Grundgebuehren fallen allein nicht mehr geteilt an.
 *
 * Fachlich ist das nicht falsch, in der Anzeige aber irrefuehrend: Oben in der
 * Karte „Ihr Ziel" traegt man 1.200 EUR ein, und die Einzelbetrachtung misst
 * sich unten an 1.600 EUR. Zwei Zahlen fuer dieselbe Sache, und die zweite
 * erklaert sich nur durch einen Satz, den man gelesen haben muss.
 *
 * Es gilt deshalb, was eingetragen wurde: Der Zielanteil einer Person IST ihr
 * Bedarf in der Einzelbetrachtung. Wer meint, allein mehr zu brauchen, traegt
 * oben mehr ein — das ist sichtbar und nachvollziehbar, eine stille
 * Multiplikation ist es nicht.
 */

/**
 * Das Szenario auf EINE Person zusammengestrichen.
 *
 * ACHTUNG, DAS IST KEIN FILTER. Drei Stellen der Zeitachse machen aus dem
 * naheliegenden `personen.filter(...)` stillschweigend falsche Zahlen:
 *
 *  1. `projiziere` filtert selbst auf `p.id === 'A' || verheiratet`. Bei
 *     `verheiratet: false` faellt Person B ganz heraus, und das Ergebnis ist
 *     leer — mit der sachlich falschen Meldung, es fehle ein Datum. Die
 *     gewaehlte Person wird deshalb auf `id: 'A'` umgeschrieben.
 *
 *  2. Vertraege mit fremdem Inhaber VERSCHWINDEN NICHT. Die Zeitachse loest
 *     den Inhaber an acht Stellen mit `?? personA` auf; ein Vertrag von B
 *     fiele also in die Rechnung von A zurueck — mit deren Rentenbeginn,
 *     Alter, Freibetrag und Mitgliedschaft. Sie werden deshalb gefiltert UND
 *     mitumgeschrieben.
 *
 *  3. Die Aufteilung des Erwerbseinkommens haengt an `personen.length > 1`.
 *     Bei einer Person greift der Zweig fuer getrennte Einkommen nicht mehr,
 *     und der Rueckfall rechnet `gesamt / 1` — die verbliebene Person bekaeme
 *     das GANZE Haushaltseinkommen, also womoeglich das Gehalt der anderen.
 *     Das eigene Einkommen wird deshalb hier bestimmt und nach
 *     `einkommenHeute` gelegt.
 */
export function nurPerson<T extends Szenario>(s: T, id: PersonId): T {
  const person = s.personen.find((p) => p.id === id);
  if (!person) return s;

  /*
    Das eigene Einkommen — nach demselben Schluessel, den die Zeitachse
    ohnehin benutzt: bei getrennter Erfassung der echte Betrag, sonst der
    haelftige Haushaltsbetrag.
  */
  const beide = s.personen.filter((p) => p.id === 'A' || s.haushalt.verheiratet);
  const getrennt = s.einkommenGetrennt === true && beide.length > 1;
  const eigenes: EinkommenHeute = getrennt
    ? (id === 'A' ? s.einkommenHeute : (s.einkommenPartner ?? s.einkommenHeute))
    : { ...s.einkommenHeute, betrag: s.einkommenHeute.betrag / Math.max(1, beide.length) };

  /*
    GENERISCH und mit einer Zusicherung am Ende: Die Oberflaeche reicht ein
    Szenario herein, das MEHR Felder hat als das Modell des Rechenkerns — das
    Schema haengt noch die Vertrags-Pruefliste daran. Ohne `T` fielen die
    beim Durchreichen aus dem Typ heraus, und der Aufrufer bekaeme ein
    Szenario zurueck, das er nicht mehr dort einsetzen kann, wo er es her
    hatte. Zur Laufzeit traegt der Spread sie ohnehin mit; die Zusicherung
    sagt nur, was der Spread schon tut.
  */
  return {
    ...s,
    haushalt: {
      ...s.haushalt,
      /*
        Der eigentliche Schalter: Grundtarif statt Splitting, einfache
        Pauschbetraege, keine Familienversicherung. Alles Uebrige — Kinder,
        Kirchensteuer, Bundesland, Kassenstatus, Zusatzbeitrag — bleibt, denn
        daran aendert das Alleinsein nichts.
      */
      verheiratet: false,
      /*
        Der eigene Anteil, unveraendert — siehe oben. Ohne eigene Angabe ist
        er die Haelfte des Haushaltsziels, also genau der Wert, den die Karte
        „Ihr Ziel" dann auch anzeigt.
      */
      zielNettoHeute: person.zielAnteilHeute ?? s.haushalt.zielNettoHeute / 2,
      pkv: {
        ...s.haushalt.pkv,
        /*
          NAEHERUNG, und zwar eine bewusste: Die Praemie ist im Szenario ein
          Haushaltsbetrag, es gibt nur eine. Solange der Versicherungsstatus
          am Haushalt haengt, ist die Haelfte der beste verfuegbare Wert —
          voll waere sie zu hoch, null zu guenstig.
        */
        praemieMonat: s.haushalt.pkv.praemieMonat / 2,
        bet: { ...s.haushalt.pkv.bet, beitragMonat: s.haushalt.pkv.bet.beitragMonat / 2 },
      },
    },
    // Umgeschrieben auf 'A', sonst filtert die Zeitachse sie heraus.
    personen: [{ ...person, id: 'A' }],
    vertraege: s.vertraege
      .filter((v) => v.inhaber === id)
      .map((v) => ({ ...v, inhaber: 'A' as const })),
    einkommenHeute: eigenes,
    einkommenGetrennt: false,
    einkommenPartner: undefined,
    planer: {
      ...s.planer,
      /*
        Das Startkapital des Entnahmeplans hat keinen Inhaber und gehoert
        damit beiden. Es zu halbieren waere eine Erfindung, es voll
        anzusetzen eine doppelte. Vertraege mit Strategie „planer" zaehlen
        dagegen mit — die haben einen Inhaber und sind oben schon gefiltert.
      */
      startkapital: 0,
    },
  } as T;
}
