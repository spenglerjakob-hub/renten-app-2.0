import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  parameterFuer, versorgungsluecke, foerdercheck, loesungsvergleich,
  type ProjektionsErgebnis, type Jahreszeile,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { Rechtsstand } from '../features/Rechtsstand';
import { akzentVariablen, fusszeileCss, type Auftritt } from '../features/auftritt';
import {
  tuevPositionen, foerderBasis, loesungsOptionen, angebotPositionen, type AngebotPosition, type MitAngenommenen,
} from '../features/tuev-berechnung';
import { vertragsBezeichnung } from '../features/vertragsarten';
import { sparzielRechnen, SPARZIEL_VORGABE } from '../features/sparziel-berechnung';
import { pkvRechnen } from '../features/pkv-berechnung';
import { personNameAus } from '../features/personen';
import { kaufkraft } from '../features/kaufkraft';
import { nettoHeuteMonat } from '../features/bezug';
import { Seite, GrosseZahl, Text, Untertitel } from './Bausteine';
import { DeckblattHeute, DeckblattKopf, DeckblattTitel, PAPIER } from './DeckblattKopf';
import { Angaben } from './Angaben';
import { Renteneinkuenfte } from './Renteneinkuenfte';
import { Vertragsliste } from './Vertragsliste';
import { JePersonSeite } from './JePerson';
import { Krankenversicherung } from './Krankenversicherung';
import { Sparziel } from './Sparziel';
import { Foerderung } from './Foerderung';
import { Merkblatt } from './Merkblatt';
import { TuevBogen } from './TuevBogen';
import { Loesungsvergleich } from './Loesungsvergleich';
import { MitLoesungen } from './MitLoesungen';
import type { ThemaId } from './druckauswahl';
import { useAnsprache } from '../components/Ansprache';
import { SIE, woerter, type AnspracheWoerter } from '../lib/ansprache';

/**
 * Eine Seite des Gutachtens (oder mehrere zu einem Thema) — mit dem Thema,
 * nach dem das Druckfenster waehlt (druckauswahl.ts).
 */
export interface GutachtenSeite {
  thema: ThemaId;
  /** Bei den Vertrags-Pruefungen: welcher Vertrag */
  vertragId?: string;
  /** Kurz fuers Druckfenster, etwa der Name des Vertrags — sonst der erste Titel */
  name?: string;
  /** Die Eintraege im Inhaltsverzeichnis */
  titel: string[];
  /**
   * Die Seite selbst. Als Funktion: Sie erfaehrt, was sonst noch gedruckt
   * wird — ein Verweis auf eine abgewaehlte Seite liefe ins Leere.
   */
  knoten: (gedruckt: (t: ThemaId) => boolean) => ReactNode;
}

export interface GutachtenDaten {
  szenario: SzenarioParsed;
  ergebnis: ProjektionsErgebnis | null;
  zeile: Jahreszeile;
  /** Gesetzt in der Einzelbetrachtung: der Name der Person, um die es geht */
  einzelperson?: string;
  /**
   * Die angenommenen Loesungen der Ansicht und das Ergebnis mit ihnen
   * (Etappe „Abschluss“). Mit beidem kommt die Seite „Ihr Ergebnis mit den
   * gewählten Lösungen“ dazu. Das Deckblatt bleibt beim heutigen Stand.
   */
  mit?: MitAngenommenen | null;
  ergebnisMit?: ProjektionsErgebnis | null;
  /** Was jede angenommene Loesung netto kostet (`angenommenePositionen`) */
  positionenMit?: AngebotPosition[];
  /**
   * Die Ansprache fuer die Seitentitel. Der Hook laeuft in App, ueber dem
   * Kontext — deshalb kommt sie als Wert; die Seiten selbst lesen den Kontext.
   */
  ansprache?: AnspracheWoerter;
}

/**
 * ALLE SEITEN, DIE DER FALL HERGIBT — in der Reihenfolge des Gutachtens.
 * Daraus entstehen das Druckfenster (welche Themen es gibt) und, gefiltert
 * nach der Auswahl, die gedruckten Seiten samt Inhaltsverzeichnis. Eine
 * Liste fuer alles: Was hier keinen Eintrag hat, gibt es weder im Fenster
 * noch auf dem Papier.
 */
export function useGutachtenSeiten({
  szenario, ergebnis, zeile, einzelperson, mit = null, ergebnisMit = null, positionenMit = [], ansprache,
}: GutachtenDaten): GutachtenSeite[] {
  const an = ansprache ?? woerter(SIE);
  const jetzt = new Date().getFullYear();
  const avd = useMemo(
    () => parameterFuer(Math.max(jetzt, 2027), { indexRate: szenario.annahmen.tarifIndex }).avd,
    [jetzt, szenario.annahmen.tarifIndex],
  );

  const positionen = useMemo(
    () => tuevPositionen(szenario, ergebnis ? zeile : null, ergebnis?.kapitalauszahlungen ?? []),
    [szenario, ergebnis, zeile],
  );

  const h = szenario.haushalt;

  const luecke = versorgungsluecke(zeile);

  // Die Sparziel-Rechnung: null, wenn es nichts zu schliessen gibt — dann
  // entfallen beide Handlungsseiten, statt eine Null-Empfehlung zu drucken.
  const sparziel = useMemo(
    () => sparzielRechnen(szenario, zeile, SPARZIEL_VORGABE),
    [szenario, zeile],
  );
  // Nur bei privat Versicherten mit einem eingetragenen Beitrag; sonst null,
  // und die Seite entfaellt samt Eintrag im Inhaltsverzeichnis.
  const pkv = useMemo(
    () => pkvRechnen(szenario, zeile),
    [szenario, zeile],
  );

  /*
    Der Foerdercheck — dieselbe Rechnung wie am Bildschirm. Ohne Befund
    entfaellt die Seite samt Eintrag im Inhaltsverzeichnis.
  */
  const foerderung = useMemo(() => {
    const b = foerderBasis(szenario, ergebnis ? zeile : null);
    return { ...b, befunde: foerdercheck(b.kontext, b.steuerOpt, b.p) };
  }, [szenario, ergebnis, zeile]);

  /*
    Der Loesungsvergleich der letzten Etappe — nur, wenn es eine Luecke gibt
    oder Angebote erfasst sind. Sonst stuende eine Seite ueber Loesungen fuer
    ein Problem, das es nicht gibt.
  */
  const loesungen = useMemo(() => {
    if (luecke <= 0 && szenario.loesungen.angebote.length === 0) return null;
    const l = szenario.loesungen;
    const betrag = l.vorgabe === 'brutto' ? l.bruttoMonat : l.nettoMonat;
    return {
      liste: loesungsvergleich(foerderung.kontext, foerderung.steuerOpt, foerderung.p, betrag, loesungsOptionen(l)),
      betrag,
      angebote: angebotPositionen(szenario),
    };
  }, [luecke, szenario, foerderung]);

  // Das heutige Haushaltsnetto — Bezugsgroesse fuer Startbeitrag und Aufwand (nicht das Netto im Alter).
  const haushaltsNetto = nettoHeuteMonat(ergebnis);

  // Nur bei Ehepaaren: sonst stuende auf der Seite alles bei einer Person.
  const beidePartner = h.verheiratet && szenario.personen.length > 1;

  // Das Ergebnis mit den gewaehlten Loesungen — im selben Jahr wie die Renteneinkuenfte.
  const zeileMit = ergebnisMit
    ? ergebnisMit.zeilen.find((z) => z.jahr === zeile.jahr)
      ?? ergebnisMit.zeilen.find((z) => z.jahr === ergebnisMit.ruhestandsjahr)
      ?? null
    : null;

  /* Entscheidet ueber EINE oder ZWEI Grundlagenseiten — siehe unten. */
  const hatVertraege = szenario.vertraege.length > 0;

  /**
   * DIE SEITEN DES GUTACHTENS — EINE Liste, aus der BEIDES entsteht: das
   * Inhaltsverzeichnis auf dem Deckblatt und die Seiten selbst.
   *
   * BEFUND, der das ausgeloest hat: Hier standen ZWEI Listen nebeneinander —
   * eine Titelliste fuer das Verzeichnis und daneben das Seiten-JSX, jede mit
   * ihren eigenen Bedingungen von Hand gepflegt. Sie sind auseinandergelaufen.
   * In einem Gutachten vom 18.9.2026 fuehrte das Verzeichnis 32 Abschnitte,
   * darunter 23 Vertrags-Pruefungen; gedruckt wurden 12 Seiten mit EINER
   * Pruefung. Drei weitere Abweichungen steckten unbemerkt darin: Ohne
   * Rechenergebnis nannte das Verzeichnis „Ihre Renteneinkünfte", „Die
   * Versorgung beider Partner" und „Rechtsstand und Methodik", obwohl alle
   * drei Seiten dann entfallen.
   *
   * Aus einer Liste kann das nicht mehr passieren: Was keinen Eintrag hat,
   * wird nicht gedruckt, und was gedruckt wird, steht im Verzeichnis.
   *
   * `titel` ist ein ARRAY, damit ein Eintrag, der mehr als eine Seite
   * rendert, alle seine Titel ins Verzeichnis bringt. Zwei Titel an einem
   * Eintrag sind ehrlicher als zwei Eintraege, die dieselbe Bedingung doppelt
   * tragen muessten — genau so fing das Auseinanderlaufen an.
   *
   * DER TITEL TAUGT NICHT ALS REACT-KEY. Er war es, und bei mehreren
   * namenlosen Vertraegen hiessen alle Pruefungen gleich. Gezaehlt wird
   * deshalb der Index.
   */

  return [
    {
      thema: 'angaben',
      titel: [hatVertraege ? `${an.Dein('e')} Angaben` : `${an.Dein('e')} Angaben und Verträge`],
      knoten: () => (
        <Seite
          titel={hatVertraege ? `${an.Dein('e')} Angaben` : `${an.Dein('e')} Angaben und Verträge`}
          nummer="Grundlage der Berechnung"
        >
          <Angaben szenario={szenario} avd={avd} />
          {!hatVertraege && (
            <Vertragsliste szenario={szenario} hinweise={ergebnis?.vertragsHinweise ?? []} />
          )}
        </Seite>
      ),
    },

    /*
      ANGABEN UND VERTRAEGE GETRENNT, sobald es Vertraege gibt.

      Sie standen auf EINER Seite, weil einzeln keiner der beiden Bloecke
      die halbe Seite fuellte. Das galt einmal. Seither sind Kinderblock,
      Krankenversicherung je Person und die Zielanteile dazugekommen: Die
      Angaben allein messen im unguenstigen Fall (vier Kinder, private
      Krankenversicherung mit Entlastungstarif, Selbststaendigkeit, beide
      Partner abweichend versichert) 1.114 von 979 Punkten — die Seite lief
      also ueber, BEVOR ein einziger Vertrag erfasst war. Dazu kommen je
      Vertrag rund 50 Punkte.

      Der Browser brach das bisher selbst um, aber an beliebiger Stelle und
      ohne Kopfzeile auf dem zweiten Blatt. Jetzt ist der Schnitt gesetzt:
      Wer Vertraege hat, bekommt sie auf eigenem Blatt mit eigenem Titel.
      Wer keine hat, behaelt den einzeiligen Hinweis bei den Angaben — dafuer
      lohnt kein Blatt.
    */
    ...(hatVertraege ? [{
      thema: 'vertraege' as const,
      titel: [`${an.Dein('e')} Verträge`],
      knoten: () => (
        <Seite titel={`${an.Dein('e')} Verträge`} nummer="Grundlage der Berechnung">
          <Vertragsliste
            szenario={szenario}
            hinweise={ergebnis?.vertragsHinweise ?? []}
            eigeneSeite
          />
        </Seite>
      ),
    }] : []),

    ...(ergebnis ? [{
      thema: 'renteneinkuenfte' as const,
      titel: [`${an.Dein('e')} Renteneinkünfte im Jahr ${zeile.jahr}`],
      knoten: () => (
        <Renteneinkuenfte
          ergebnis={ergebnis}
          zeile={zeile}
          szenario={szenario}
          zielNettoHeute={h.zielNettoHeute}
          inflation={szenario.annahmen.inflation}
          einzelperson={einzelperson}
        />
      ),
    }] : []),

    /*
      Nur bei Ehepaaren, dafuer in BEIDEN Umfaengen: Die Aufteilung ist
      genau das, was im Gespraech gefragt wird, und die Kurzfassung ist die
      Gespraechsfassung. Ein Alleinstehender bekaeme eine Seite, auf der
      alles bei einer Person steht.
    */
    ...(ergebnis && beidePartner ? [{
      thema: 'partner' as const,
      titel: [`Die Versorgung beider Partner im Jahr ${zeile.jahr}`],
      knoten: () => <JePersonSeite zeile={zeile} szenario={szenario} />,
    }] : []),

    /*
      DIREKT NACH DEM HEUTIGEN STAND, in beiden Umfaengen: erst, wo der
      Kunde steht — dann, wo er mit den gewaehlten Loesungen steht. Der
      Vergleich der Angebote als Alternativen folgt in der Langfassung weiter
      hinten.
    */
    ...(ergebnis && mit && ergebnisMit && zeileMit ? [{
      thema: 'mitLoesungen' as const,
      titel: [`${an.Dein()} Ergebnis mit den gewählten Lösungen`],
      knoten: (gedruckt: (t: ThemaId) => boolean) => (
        <MitLoesungen
          mitRenteneinkuenften={gedruckt('renteneinkuenfte')}
          vorher={zeile}
          nachher={zeileMit}
          ergebnisMit={ergebnisMit}
          mit={mit}
          positionen={positionenMit}
          einzelperson={einzelperson}
          inhaberName={beidePartner ? (id) => personNameAus(szenario.personen, id) : undefined}
        />
      ),
    }] : []),

    /*
      „Ihre Einkünfte im Ruhestand" und „Was Ihr Geld dann noch wert ist"
      sind entfallen: Beide zeigten die Jahre nach Rentenbeginn als Tabelle,
      und was davon zaehlt — Bedarf, Netto, Luecke, heute und im Rentenjahr —
      steht schon auf dem Deckblatt und bei den Renteneinkuenften.
    */
    ...(pkv ? [{
        thema: 'krankenversicherung' as const,
        titel: [`Die Krankenversicherung von ${pkv.person} im Alter`],
        knoten: () => (
          <Krankenversicherung
            ergebnis={pkv}
            steigerung={pkv.steigerung}
            inflation={szenario.annahmen.inflation}
            zielNettoMonat={zeile.zielNettoMonat}
          />
        ),
      }] : []),
      ...(sparziel ? [{
        thema: 'sparziel' as const,
        titel: [`Was ${an.du} jetzt tun ${an.w('kannst', 'könnt', 'können')}`],
        knoten: () => (
          <Sparziel
            ergebnis={sparziel}
            eingaben={SPARZIEL_VORGABE}
            rentenjahr={zeile.jahr}
            inflation={szenario.annahmen.inflation}
            nettoHeute={haushaltsNetto}
          />
        ),
      }] : []),
      /*
        AN DER STELLE DER STELLSCHRAUBEN. Die drei Hebel dort waren
        Lehrbuch — hier steht, welche Foerderung konkret liegen bleibt, mit
        Rechenbeispiel und Hochrechnung bis zur Rente.
      */
      ...(foerderung.befunde.length > 0 ? [{
        thema: 'foerderung' as const,
        titel: [`Förderung, die ${an.du} nicht ${an.w('nutzt', 'nutzt', 'nutzen')}`],
        knoten: (gedruckt: (t: ThemaId) => boolean) => (
          <Foerderung
            mitSparziel={gedruckt('sparziel')}
            befunde={foerderung.befunde}
            kontext={foerderung.kontext}
            p={foerderung.p}
            zeile={zeile}
            rendite={SPARZIEL_VORGABE.rendite}
            ohneBeitrag={foerderung.ohneBeitrag}
          />
        ),
      }] : []),
      ...(loesungen ? [{
        thema: 'loesungen' as const,
        // Die Angebote stehen auf eigenem Blatt — und deshalb auch im Verzeichnis.
        titel: ['Lösungen im Vergleich',
          ...(loesungen.angebote.some((a) => a.rente || a.kapital) ? [`${an.Dein('e')} Angebote im Vergleich`] : [])],
        knoten: (gedruckt: (t: ThemaId) => boolean) => (
          <Loesungsvergleich
            mitRenteneinkuenften={gedruckt('renteneinkuenfte')}
            loesungen={loesungen.liste}
            vorgabe={szenario.loesungen.vorgabe}
            betragMonat={loesungen.betrag}
            angebote={loesungen.angebote}
            nettoHeute={haushaltsNetto}
          />
        ),
      }] : []),
      ...positionen.map((p) => ({
        thema: 'pruefung' as const,
        vertragId: p.vertrag.id,
        name: vertragsBezeichnung(p.vertrag),
        titel: [`Vertrags-Prüfung: ${vertragsBezeichnung(p.vertrag)}`],
        knoten: () => <TuevBogen position={p} szenario={szenario} />,
      })),
      {
        thema: 'merkblatt' as const,
        titel: ['Zum Mitnehmen'],
        knoten: () => <Merkblatt />,
      },

    /*
      Rechtsstand und Methodik stehen ans ENDE. Der vorhandene Abschnitt
      traegt bereits eine ausfuehrliche Druckfassung; sie wird uebernommen,
      statt sie ein zweites Mal zu schreiben.
    */
    ...(ergebnis ? [{
      thema: 'rechtsstand' as const,
      titel: ['Rechtsstand, Methodik und Vorbehalt'],
      knoten: () => (
        <Seite titel="Rechtsstand, Methodik und Vorbehalt" nummer="Wie die Zahlen zustande kommen">
          <Rechtsstand
            ergebnis={ergebnis}
            tarifIndex={szenario.annahmen.tarifIndex}
            rentendynamik={szenario.annahmen.rentendynamik}
            inflation={szenario.annahmen.inflation}
            imGutachten
          />
        </Seite>
      ),
    }] : []),
  ];
}

/**
 * Das gedruckte Gutachten.
 *
 * WARUM EIN EIGENES DOKUMENT UND KEIN DRUCK-CSS: Der Ausdruck war ein Abzug
 * der Bedienoberflaeche. Die besteht aus Formularfeldern, Reitern und
 * Scrollbereichen — auf Papier ergibt das leere Eingabekaesten, fehlende
 * Vertraege (immer nur EIN Reiter ist im Dokument) und abgeschnittene
 * Tabellen (Scrollbereiche werden nicht umbrochen, sondern gekappt).
 *
 * Gerechnet wird hier NICHTS neu. Alle Zahlen stammen aus demselben
 * `ProjektionsErgebnis` und derselben TUEV-Funktion, die auch der Bildschirm
 * benutzt.
 *
 * Gedruckt werden das Deckblatt mit dem Inhalt und die Seiten, die das
 * Druckfenster gewaehlt hat — in der Reihenfolge von `useGutachtenSeiten`,
 * schon gefiltert (`gewaehlt` in druckauswahl.ts).
 *
 * Eingehaengt wird es in App.tsx als `hidden print:block`; der Bildschirmpfad
 * ist im Gegenzug durchgehend `print:hidden`. So gibt es genau eine Quelle
 * fuer das Papier, und eine Aenderung an der Oberflaeche kann den Ausdruck
 * nicht mehr versehentlich zerlegen.
 */
export function Gutachten({ szenario, ergebnis, zeile, einzelperson, auftritt = null, seiten }: {
  szenario: SzenarioParsed;
  ergebnis: ProjektionsErgebnis | null;
  zeile: Jahreszeile;
  /**
   * Gesetzt in der Einzelbetrachtung: der Name der Person, um die es geht.
   *
   * Das Szenario ist dann zusammengestrichen und sieht aus wie das eines
   * Alleinstehenden — ohne diese Angabe gaebe das Deckblatt ein Gutachten
   * ueber einen Haushalt aus, den es so nicht gibt.
   */
  einzelperson?: string;
  /**
   * „Ihr Auftritt im Gutachten“: Logo, Firma und Kontakt auf dem Deckblatt,
   * eine Fusszeile auf jeder Seite, die Akzentfarbe an Linien und
   * Ueberschriften. Ohne Auftritt bleibt der Ausdruck wie bisher.
   */
  auftritt?: Auftritt | null;
  /** Die Seiten, die gedruckt werden */
  seiten: GutachtenSeite[];
}) {
  const h = szenario.haushalt;
  // Das Gutachten spricht wie der Rechner: per Du, ein Paar per ihr — der Vorname im ersten Satz
  const an = useAnsprache();
  const name = h.verheiratet
    ? `${personNameAus(szenario.personen, 'A')} und ${personNameAus(szenario.personen, 'B')}`
    : personNameAus(szenario.personen, 'A');
  const luecke = versorgungsluecke(zeile);
  const gedeckt = zeile.zielNettoMonat > 0
    ? Math.min(100, (zeile.nettoMonat / zeile.zielNettoMonat) * 100)
    : 100;

  // Dieselben drei Groessen in heutiger Kaufkraft. Der Kaufkraftfaktor der
  // Zeile rechnet einen Betrag des Rentenjahres auf das heutige Preisniveau
  // zurueck; gerechnet wird also nichts Neues.
  const heute = (n: number) => n / zeile.kaufkraftfaktor;
  // Dieselbe Umrechnung als Kaufkraftverlust in Euro — wie die Karte am Bildschirm.
  const kk = ergebnis ? kaufkraft(zeile) : null;
  const bedarfHeute = h.zielNettoHeute;
  const nettoHeute = heute(zeile.nettoMonat);

  /** Was sonst noch gedruckt wird — fuer Verweise von Seite zu Seite. */
  const gedruckt = (t: ThemaId) => seiten.some((s) => s.thema === t);

  const abschnitte = seiten.flatMap((s) => s.titel);
  // Die Fusszeile jeder Seite (`@page`-Randfelder) — nur mit Auftritt.
  const fussCss = fusszeileCss(auftritt);

  return (
    <div
      id="gutachten"
      className={`hidden ${PAPIER} print:block`}
      style={akzentVariablen(auftritt) as CSSProperties}
    >
      {fussCss && <style>{fussCss}</style>}

      {/* DECKBLATT — Kopf, Titel und Kaufkraft-Kacheln teilt es mit den Vorschauen (DeckblattKopf.tsx). */}
      <Seite erste>
        <DeckblattKopf auftritt={auftritt} />

        <DeckblattTitel
          titel={einzelperson ? 'Altersvorsorge-Analyse — Einzelbetrachtung' : 'Altersvorsorge-Analyse'}
          fuer={name}
        >
          {einzelperson && (
            <p className="mt-1 text-xs font-medium text-ui-schiefer">
              Nur die eigenen Verträge und Einkünfte von {einzelperson} — allein veranlagt.
            </p>
          )}
        </DeckblattTitel>

        <DeckblattHeute bedarf={bedarfHeute} netto={nettoHeute} />

        <Text>
          {an.anrede('bis')} zu {an.dein('em')} Rentenbeginn im Jahr {zeile.jahr} steigen die Preise — bei angenommenen{' '}
          <strong>{prozent(szenario.annahmen.inflation)}</strong> Inflation im Jahr. Deshalb stehen
          in den Kacheln darunter größere Zahlen: Es ist dieselbe Rechnung, nur im Geld des
          Rentenjahres statt im Geld von heute.
          {gedruckt('renteneinkuenfte') && ` Die Seite „${an.Dein('e')} Renteneinkünfte“ nennt beide Maßstäbe nebeneinander.`}
          {/* Der Kaufkraftverlust in Euro — dieselbe Umrechnung wie die Kacheln. */}
          {kk && kk.verlustMonat > 0 && (
            <>
              {' '}{an.Dein()} erwartetes Netto von <strong>{euro(kk.nettoNominal)}</strong> im Jahr {kk.jahr} entspricht
              heute {euro(kk.nettoHeute)} — ein Kaufkraftverlust von{' '}
              <strong>{euro(kk.verlustMonat)} im Monat ({prozent(kk.verlustQuote, 0)})</strong>.
            </>
          )}
        </Text>

        <Untertitel>Im Jahr {zeile.jahr} — mit Inflation gerechnet</Untertitel>
        <div className="grid grid-cols-3 gap-4">
          <GrosseZahl
            titel="Bedarf"
            wert={euro(zeile.zielNettoMonat)}
            hinweis={`monatlich, Betrag des Jahres ${zeile.jahr}`}
          />
          <GrosseZahl
            titel="Erwartetes Netto"
            wert={euro(zeile.nettoMonat)}
            hinweis={`entspricht ${gedeckt.toFixed(0)} % des Bedarfs`}
          />
          <GrosseZahl
            titel="Versorgungslücke"
            wert={luecke > 0 ? euro(luecke) : 'Gedeckt'}
            ton={luecke > 0 ? 'schlecht' : 'gut'}
            hinweis={luecke > 0 ? 'monatlich fehlend' : 'kein Fehlbetrag'}
          />
        </div>

        {/*
          Der Balken misst den Fortschritt und bewertet ihn nicht: ob eine
          Luecke bleibt, sagt schon die Kachel darueber mit der hervorgehobenen
          Zahl. Tinte auf Stein wie der Ring der Luecke am Bildschirm.
        */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ui-luecke">
            <div className="h-full bg-ui-tinte" style={{ width: `${gedeckt}%` }} />
          </div>
          <span className="text-[11px] text-ui-schiefer">
            {gedeckt.toFixed(0)} % erreicht
          </span>
        </div>

        <div className="mt-6">
          <Untertitel>Inhalt</Untertitel>
          <ol className="list-inside list-decimal space-y-0.5 text-[12px] text-ui-tinte">
            {abschnitte.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
        </div>

        <div className="mt-4 rounded-[10px] border border-ui-linie bg-ui-innen p-3">
          <Text>
            <strong>Was dieses Dokument ist.</strong> Eine Modellrechnung auf Grundlage der von
            {' '}{an.dir} gemachten Angaben und der {gedruckt('angaben') ? `auf Seite „${an.Dein('e')} Angaben“` : 'am Ende des Dokuments'} genannten
            Annahmen. Es ist
            keine Steuer-, Renten- oder Anlageberatung und keine Zusage über künftige Leistungen.
            Rechtslage und Rechenwege sind am Ende des Dokuments beschrieben.
          </Text>
        </div>
      </Seite>

      {/*
        Die Seiten in derselben Reihenfolge, in der das Verzeichnis sie
        nennt — weil es dieselbe Liste ist. Der Index ist der Key: Der Titel
        war es einmal, und bei gleichnamigen Vertrags-Pruefungen ist er nicht
        eindeutig.
      */}
      {seiten.map((s, i) => <Fragment key={i}>{s.knoten(gedruckt)}</Fragment>)}
    </div>
  );
}
