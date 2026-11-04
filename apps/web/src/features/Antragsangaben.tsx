import { useEffect, useRef, useState } from 'react';
import { Eye, FileUp, Link2, Mail, Printer, Save, Trash2, Undo2, UserCheck } from 'lucide-react';
import {
  BEZUGSRECHTE, ANTRAG_FELDER, braucheBank, bezugsrechtText, eingangUebernehmen, ibanGueltig, offeneAngaben,
  type AntragAngaben, type AntragFeld, type AntragLoesung,
} from '@renten/schema';
import { AuswahlFeld, TextFeld } from '../components/Feld';
import { LinkFeld } from '../components/LinkFeld';
import { FEHLER, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Stand } from '../components/stil';
import { useSzenario } from '../store/szenario';
import { antragFehlertext, useAntraege } from '../store/antraege';
import { ausweisVorbereiten } from '../lib/bild';
import {
  antragEingangUebernehmen, antragLaden, antragLink, antragLinkErstellen, antragLinkZurueckziehen, antragSpeichern,
  antragStand, ausweisEntfernen, ausweisHochladen, ausweisLink, ausweiseLaden, AUSWEIS_HOECHSTENS, SEITE_TEXT,
  STAND_TEXT, type Antrag, type AusweisDatei, type AusweisSeite,
} from '../lib/antraege';
import { angabenBereinigt, angabenFuer, angabenGleich, antragMail, loesungenGleich } from './antrag-daten';
import { antragsbogenDrucken } from './antragsbogen';
import { LOESUNG_KURZ } from './tuev-berechnung';

/**
 * „Angaben für den Antrag“ — in der Etappe „Abschluss“ unter dem Ergebnis.
 *
 * Bezugsrecht im Todesfall je Lösung, Bankverbindung und die Kopie des
 * Personalausweises. Was der Berater nicht weiß, fragt er über einen Link
 * beim Kunden ab. Gespeichert wird im Konto (Tabelle `antraege`), nie im
 * Plan: Der Plan merkt sich nur die ID des Antrags.
 */

const FELD_TEXT: Record<AntragFeld, string> = {
  bezugsrecht: 'Bezugsrecht im Todesfall',
  bank: 'Bankverbindung',
  ausweis: 'Kopie des Personalausweises',
};

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE');
const name = (l: AntragLoesung) => (l.anbieter ? `${l.anbieter} (${LOESUNG_KURZ[l.art]})` : LOESUNG_KURZ[l.art]);

const FEHLER_HOCHLADEN: Record<string, string> = {
  ungueltig: `Höchstens ${AUSWEIS_HOECHSTENS} Kopien je Antrag — entfernen Sie zuerst eine.`,
  'zu-gross': 'Das Bild ist zu groß (höchstens 10 MB).',
  typ: 'Nur Bilder — ein Foto oder ein Scan als JPEG oder PNG.',
  fehler: 'Das Hochladen hat nicht geklappt — bitte noch einmal versuchen.',
};

export function Antragsangaben({ antragId, loesungen, kundeVorschlag, angemeldet, onKonto, berater }: {
  /** Die ID aus dem Plan (`loesungen.antrag`) — fehlt sie, entsteht beim Speichern ein neuer Antrag */
  antragId: string | undefined;
  /** Das Abbild der angenommenen Lösungen (`antragLoesungenAus`) — stabil, aus `useMemo` */
  loesungen: AntragLoesung[];
  kundeVorschlag: string;
  /** Angemeldet und mit Datenbank — sonst lässt sich nichts speichern */
  angemeldet: boolean;
  onKonto: () => void;
  /** Für den Kopf des Antragsbogens */
  berater?: string;
}) {
  const setzeLoesungen = useSzenario((s) => s.setzeLoesungen);
  const merken = useAntraege((s) => s.merken);
  const [antrag, setAntrag] = useState<Antrag | null>(null);
  const [kunde, setKunde] = useState(kundeVorschlag);
  const [angaben, setAngaben] = useState<AntragAngaben>(() => angabenFuer({ bezugsrecht: {} }, loesungen));
  const [ausweise, setAusweise] = useState<AusweisDatei[]>([]);
  // Die Felder für den Link: null heißt „wie vorgeschlagen“ — bis der Berater selbst wählt.
  const [felder, setFelder] = useState<Set<AntragFeld> | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);
  const [neuerLink, setNeuerLink] = useState(false);
  const datei = useRef<HTMLInputElement>(null);
  const [seite, setSeite] = useState<AusweisSeite>('vorne');

  const uebernimm = (a: Antrag) => {
    setAntrag(a);
    setKunde(a.kunde || kundeVorschlag);
    setAngaben(angabenFuer(a.angaben, loesungen));
  };

  /* Laden, sobald der Plan einen Antrag kennt — und nach dem Wechsel des Plans. */
  useEffect(() => {
    if (!angemeldet || !antragId) {
      setAntrag(null);
      setAusweise([]);
      return;
    }
    let aktiv = true;
    void (async () => {
      try {
        const a = await antragLaden(antragId);
        if (!aktiv) return;
        // Gelöscht (Frist, anderes Gerät): Der Plan vergisst die ID, beim Speichern entsteht ein neuer.
        if (!a) { setAntrag(null); setzeLoesungen({ antrag: undefined }); return; }
        uebernimm(a);
        const kopien = await ausweiseLaden(a);
        if (aktiv) setAusweise(kopien);
      } catch (e) {
        if (aktiv) setMeldung({ art: 'fehler', text: antragFehlertext(e) });
      }
    })();
    return () => { aktiv = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei neuem Antrag oder neuer Anmeldung
  }, [angemeldet, antragId]);

  // Ändern sich die angenommenen Lösungen, folgt das Bezugsrecht: neue vorbelegt, entfallene weg.
  useEffect(() => { setAngaben((x) => angabenFuer(x, loesungen)); }, [loesungen]);

  if (!angemeldet) {
    return (
      <section aria-labelledby="antrag-titel" className="ui-karte p-5 sm:p-7">
        <h3 id="antrag-titel" className="text-lg font-medium text-ui-tinte">Angaben für den Antrag</h3>
        <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
          Bezugsrecht, Bankverbindung und die Kopie des Personalausweises speichern Sie in Ihrem Konto —
          nicht im Plan. Melden Sie sich dafür an.
        </p>
        <button type="button" onClick={onKonto} className={`mt-4 ${KNOPF_ZWEIT}`}>Anmelden</button>
      </section>
    );
  }

  const stand = antrag ? antragStand(antrag) : 'entwurf';
  const geaendert = !antrag
    || antrag.kunde !== kunde.trim()
    || !angabenGleich(antrag.angaben, angabenBereinigt(angaben))
    || !loesungenGleich(antrag.loesungen, loesungen);
  const bank = braucheBank(loesungen);
  const eigeneKopien = ausweise.filter((k) => !k.vomKunden).length;
  const vorschlag = offeneAngaben(angaben, loesungen, ausweise.length > 0);
  const gewaehlt = felder ?? new Set(vorschlag);
  const angebotene = ANTRAG_FELDER.filter((f) => f !== 'bank' || bank);

  /** Etwas tun — mit Sperre der Knöpfe und der Meldung im Fehlerfall. */
  const mitArbeit = async (tun: () => Promise<void>) => {
    setArbeitet(true);
    setMeldung(null);
    try {
      await tun();
    } catch (e) {
      setMeldung({ art: 'fehler', text: antragFehlertext(e) });
    } finally {
      setArbeitet(false);
    }
  };

  /** Speichern, falls nötig — liefert den gespeicherten Antrag. */
  const gesichert = async (): Promise<Antrag> => {
    if (antrag && !geaendert) return antrag;
    const a = await antragSpeichern({ id: antrag?.id ?? antragId, kunde, loesungen, angaben: angabenBereinigt(angaben) });
    uebernimm(a);
    merken(a);
    if (antragId !== a.id) setzeLoesungen({ antrag: a.id });
    return a;
  };

  const neuLaden = async (id: string) => {
    const a = await antragLaden(id);
    if (!a) return;
    uebernimm(a);
    merken(a);
    setAusweise(await ausweiseLaden(a));
  };

  const hochladen = (d: File) => mitArbeit(async () => {
    const bild = await ausweisVorbereiten(d);
    if (bild === 'unlesbar') {
      setMeldung({ art: 'fehler', text: 'Dieses Bild kann der Browser nicht lesen — bitte ein Foto als JPEG oder PNG wählen.' });
      return;
    }
    const a = await gesichert();
    const r = await ausweisHochladen(a.id, bild, seite);
    if (r in FEHLER_HOCHLADEN) {
      setMeldung({ art: 'fehler', text: FEHLER_HOCHLADEN[r]! });
      return;
    }
    setAusweise(await ausweiseLaden(a));
  });

  const ansehen = async (k: AusweisDatei) => {
    // Das Fenster SOFORT öffnen: Nach dem Warten auf den Link sperrte der Browser es als Popup.
    const fenster = window.open('', '_blank');
    const url = await ausweisLink(k.pfad);
    if (url && fenster) {
      fenster.opener = null;
      fenster.location.href = url;
    } else {
      fenster?.close();
      setMeldung({ art: 'fehler', text: 'Die Kopie ließ sich gerade nicht öffnen — bitte noch einmal versuchen.' });
    }
  };

  const entfernen = (k: AusweisDatei) => mitArbeit(async () => {
    if (!(await ausweisEntfernen(k.pfad))) {
      setMeldung({ art: 'fehler', text: 'Die Kopie ließ sich nicht entfernen.' });
      return;
    }
    if (antrag) setAusweise(await ausweiseLaden(antrag));
  });

  const linkErstellen = () => mitArbeit(async () => {
    const a = await gesichert();
    const l = await antragLinkErstellen(a.id, [...gewaehlt].filter((f) => angebotene.includes(f)));
    if (!l) {
      setMeldung({
        art: 'fehler',
        text: 'Ein neuer Link geht nicht mehr — der Kunde hat schon geantwortet, oder der Antrag ist fast 90 Tage alt.',
      });
      return;
    }
    await neuLaden(a.id);
    setNeuerLink(true);
  });

  const zurueckziehen = () => mitArbeit(async () => {
    if (!antrag) return;
    await antragLinkZurueckziehen(antrag.id);
    setNeuerLink(false);
    await neuLaden(antrag.id);
  });

  const uebernehmen = () => mitArbeit(async () => {
    if (!antrag?.eingang) return;
    const neu = angabenBereinigt(angabenFuer(eingangUebernehmen(angaben, antrag.eingang), loesungen));
    await antragEingangUebernehmen(antrag.id, neu);
    await neuLaden(antrag.id);
    setMeldung({ art: 'ok', text: 'Die Angaben des Kunden sind übernommen.' });
  });

  const drucken = () => {
    // Das Fenster öffnet `antragsbogenDrucken` sofort — ungespeichert wird erst gesichert.
    if (antrag && !geaendert) {
      void antragsbogenDrucken(antrag, berater).then((ok) => {
        if (!ok) setMeldung({ art: 'fehler', text: 'Der Antragsbogen ließ sich nicht öffnen — erlaubt der Browser neue Fenster?' });
      });
      return;
    }
    void mitArbeit(async () => {
      const a = await gesichert();
      if (!(await antragsbogenDrucken(a, berater))) {
        setMeldung({ art: 'fehler', text: 'Gespeichert. Der Antragsbogen ließ sich nicht öffnen — bitte noch einmal drucken.' });
      }
    });
  };

  const setzeBank = (p: Partial<NonNullable<AntragAngaben['bank']>>) =>
    setAngaben((x) => ({ ...x, bank: { inhaber: x.bank?.inhaber ?? '', iban: x.bank?.iban ?? '', ...p } }));
  const iban = angaben.bank?.iban ?? '';
  const ibanFehler = iban.trim() && !ibanGueltig(iban) ? 'Die Prüfziffer stimmt nicht — bitte die IBAN vergleichen.' : null;

  return (
    <section aria-labelledby="antrag-titel" className="ui-karte p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="antrag-titel" className="text-lg font-medium text-ui-tinte">Angaben für den Antrag</h3>
        {antrag && (
          <Stand art={stand === 'uebernommen' ? 'erledigt' : stand === 'abgelaufen' ? 'vorbei' : 'offen'}>
            {STAND_TEXT[stand]}
          </Stand>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
        Was der Versicherer für den Antrag braucht. Bankverbindung und Ausweiskopie liegen nur in Ihrem
        Konto, nicht im Plan, und werden spätestens 90 Tage nach dem Anlegen gelöscht.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <TextFeld label="Kunde (nur für Ihre Liste)" wert={kunde} onChange={setKunde} maxLaenge={120} />

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ui-tinte">Bezugsrecht im Todesfall</legend>
            {loesungen.map((l) => {
              const wert = angaben.bezugsrecht[l.id] ?? 1;
              return (
                <div key={l.id}>
                  <AuswahlFeld
                    label={l.person ? `${name(l)} — für ${l.person}` : name(l)}
                    wert={String(wert)}
                    optionen={BEZUGSRECHTE.map((b) => ({ wert: String(b.wert), text: `${b.wert} – ${b.kurz}` }))}
                    onChange={(v) => setAngaben((x) => ({ ...x, bezugsrecht: { ...x.bezugsrecht, [l.id]: Number(v) } }))}
                  />
                  <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{bezugsrechtText(wert)}</p>
                </div>
              );
            })}
          </fieldset>

          {bank ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-ui-tinte">Bankverbindung</legend>
              <TextFeld label="Kontoinhaber" wert={angaben.bank?.inhaber ?? ''} onChange={(v) => setzeBank({ inhaber: v })} maxLaenge={120} />
              <div>
                <TextFeld label="IBAN" wert={iban} onChange={(v) => setzeBank({ iban: v })} maxLaenge={42} fehler={ibanFehler} />
                {iban.trim() && !ibanFehler && <p className="mt-1 text-xs text-ui-schiefer">Prüfziffer stimmt.</p>}
              </div>
            </fieldset>
          ) : (
            <p className="text-xs leading-relaxed text-ui-schiefer">
              Eine Bankverbindung braucht es nicht: Bei der Betriebsrente zahlt der Arbeitgeber den Beitrag.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-ui-tinte">Kopie des Personalausweises</legend>
            <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
              Vorder- und Rückseite, als Foto oder Datei. Jede Kopie wird im Browser verkleinert und mit dem
              Wasserzeichen „KOPIE“ versehen — so bleibt sie als Kopie erkennbar (§ 20 Abs. 2 PAuswG).
            </p>
            {ausweise.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {ausweise.map((k) => (
                  <li key={k.pfad} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ui-tinte">
                      {SEITE_TEXT[k.seite]}
                      <span className="text-ui-schiefer">{k.vomKunden ? ' · vom Kunden' : ''}{k.hochgeladenAm ? ` · ${datum(k.hochgeladenAm)}` : ''}</span>
                    </span>
                    <button type="button" onClick={() => void ansehen(k)} className={KNOPF_KLEIN} aria-label={`${SEITE_TEXT[k.seite]} ansehen`}>
                      <Eye className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Ansehen</span>
                    </button>
                    <button
                      type="button" onClick={() => void entfernen(k)} disabled={arbeitet}
                      className="shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`${SEITE_TEXT[k.seite]} entfernen`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={datei} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
              onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void hochladen(d); }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(['vorne', 'hinten'] as const).map((s) => (
                <button
                  key={s} type="button" className={KNOPF_KLEIN}
                  disabled={arbeitet || eigeneKopien >= AUSWEIS_HOECHSTENS}
                  onClick={() => { setSeite(s); datei.current?.click(); }}
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden /> {SEITE_TEXT[s]} hinzufügen
                </button>
              ))}
            </div>
          </fieldset>

          <div className="ui-innen p-4">
            <p className="text-sm font-medium text-ui-tinte">Offene Fragen an den Kunden</p>
            {stand === 'beim-kunden' && antrag?.code && antrag.linkBis ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                  Gefragt: {antrag.offen.map((f) => FELD_TEXT[f]).join(', ')}. Gültig bis {datum(antrag.linkBis)}, einmal absendbar.
                </p>
                <div className="mt-2"><LinkFeld link={antragLink(antrag.code)} neu={neuerLink} beschriftung="Link für den Kunden" /></div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={antragMail(kunde.trim(), antragLink(antrag.code), antrag.linkBis)} className={KNOPF_KLEIN}>
                    <Mail className="h-3.5 w-3.5" aria-hidden /> Per E-Mail senden
                  </a>
                  <button type="button" onClick={() => void zurueckziehen()} disabled={arbeitet} className={KNOPF_KLEIN}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Link zurückziehen
                  </button>
                </div>
              </>
            ) : stand === 'eingegangen' && antrag?.eingegangenAm ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                  Der Kunde hat am {datum(antrag.eingegangenAm)} geantwortet. Seine Angaben ergänzen das Formular;
                  wo er etwas angibt, gilt seine Angabe.
                </p>
                <button type="button" onClick={() => void uebernehmen()} disabled={arbeitet} className={`mt-2 ${KNOPF_KLEIN}`}>
                  <UserCheck className="h-3.5 w-3.5" aria-hidden /> Angaben des Kunden übernehmen
                </button>
              </>
            ) : stand === 'uebernommen' && antrag?.eingegangenAm ? (
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                Die Angaben des Kunden vom {datum(antrag.eingegangenAm)} sind übernommen.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                  {stand === 'abgelaufen' ? 'Der letzte Link ist abgelaufen. ' : ''}
                  Was Ihnen fehlt, beantwortet der Kunde selbst — über einen Link, ohne Konto, 30 Tage gültig
                  und einmal absendbar. Er sieht nur die Fragen, keine Ihrer Angaben.
                </p>
                <div className="mt-2 space-y-1.5">
                  {angebotene.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm text-ui-tinte">
                      <input
                        type="checkbox" className="h-4 w-4 shrink-0" checked={gewaehlt.has(f)}
                        onChange={(e) => {
                          const neu = new Set(gewaehlt);
                          if (e.target.checked) neu.add(f); else neu.delete(f);
                          setFelder(neu);
                        }}
                      />
                      {FELD_TEXT[f]}
                    </label>
                  ))}
                </div>
                <button
                  type="button" onClick={() => void linkErstellen()}
                  disabled={arbeitet || ![...gewaehlt].some((f) => angebotene.includes(f))}
                  className={`mt-3 ${KNOPF_KLEIN}`}
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden /> Link für den Kunden erstellen
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {meldung && (
        <p role="status" className={`mt-5 ${meldung.art === 'ok' ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER}`}>
          {meldung.text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ui-linie pt-5">
        <button type="button" onClick={() => void mitArbeit(async () => { await gesichert(); })} disabled={arbeitet || !geaendert} className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> {geaendert ? 'Antrag speichern' : 'Gespeichert'}
        </button>
        <button type="button" onClick={drucken} disabled={arbeitet} className={KNOPF_ZWEIT}>
          <Printer className="h-4 w-4" aria-hidden /> Antragsbogen drucken
        </button>
        {geaendert && antrag && <span className="text-xs text-ui-schiefer">Änderungen noch nicht gespeichert</span>}
      </div>
    </section>
  );
}
