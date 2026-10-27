import { useId, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import {
  DURCHFUEHRUNGSWEGE, firmenAngebotSchema, firmenModellSchema, type FirmenAngebot, type FirmenModellDaten,
} from '@renten/schema';
import {
  firmaLoeschen, firmaSpeichern, firmenlogoHochladen, firmenlogosAufraeumen, type Firma,
} from '../lib/bav-beratung';
import { logoVorbereiten } from '../lib/bild';
import { DRUCKFARBEN_HINWEIS } from '../lib/druckfarben';
import { AuswahlFeld, DatumFeld, ProzentFeld, Schalter, TextFeld, ZahlFeld } from '../components/Feld';
import { Dialog } from '../components/Dialog';
import { FELD_LABEL, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, TextBereich } from '../components/stil';
import { MODELL_NAME, WEG_NAME, regelText } from './texte';

const LAENDER = BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l }));
const ARTEN = (['zuschuss', 'festbetrag', 'matching'] as const).map((art) => ({ wert: art, text: MODELL_NAME[art] }));
const WEGE = DURCHFUEHRUNGSWEGE.map((w) => ({ wert: w, text: WEG_NAME[w] }));

const LOGO_MELDUNG = {
  typ: 'Bitte ein Bild als PNG, JPG oder WebP wählen.',
  'zu-gross': 'Das Bild ist zu groß. Bitte eine kleinere Datei wählen.',
  fehler: 'Das Logo konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.',
} as const;

/**
 * Das Angebot einer Firma: wer sie ist (Name, Anschrift, Logo, Texte) und
 * was sie bietet (Modell, Durchfuehrungsweg, Versicherer). Gespeichert wird
 * erst mit „Speichern“ — geprueft mit demselben Schema, mit dem gelesen wird.
 */
export function AngebotFormular({ firma, logo, beratungen, onGespeichert, onGeloescht }: {
  firma: Firma;
  /** Das gespeicherte Logo als Object-URL */
  logo: string | null;
  /** Fuer die Rueckfrage beim Loeschen */
  beratungen: number;
  onGespeichert: (f: Firma) => void;
  onGeloescht: () => void;
}) {
  const dateiId = useId();
  const [name, setName] = useState(firma.name);
  const [a, setA] = useState<FirmenAngebot>(firma.angebot);
  // null: Logo unveraendert — 'entfernen' oder ein neues
  const [neuesLogo, setNeuesLogo] = useState<{ blob: Blob; dataUrl: string; druckfarben: boolean } | 'entfernen' | null>(null);
  const [status, setStatus] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);

  const geaendert = name.trim() !== firma.name || JSON.stringify(a) !== JSON.stringify(firma.angebot) || neuesLogo !== null;
  const setze = <K extends keyof FirmenAngebot>(k: K, v: FirmenAngebot[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    setStatus('bereit');
  };
  const setzeModell = (m: Partial<FirmenModellDaten>) => setze('modell', { ...a.modell, ...m } as FirmenModellDaten);
  const m = a.modell;

  const logoWaehlen = async (datei: File | undefined) => {
    if (!datei) return;
    setMeldung(null);
    const r = await logoVorbereiten(datei);
    if (typeof r === 'string') { setMeldung(LOGO_MELDUNG[r]); return; }
    setNeuesLogo({ blob: r.blob, dataUrl: r.dataUrl, druckfarben: r.druckfarben });
    setStatus('bereit');
  };

  const speichern = async () => {
    const geprueft = firmenAngebotSchema.safeParse(a);
    if (!geprueft.success || name.trim() === '') {
      setStatus('fehler');
      setMeldung(name.trim() === '' ? 'Bitte einen Namen für die Firma eintragen.' : 'Bitte die Angaben prüfen.');
      return;
    }
    setStatus('speichert');
    setMeldung(null);
    let pfad = firma.logoPfad;
    if (neuesLogo === 'entfernen') pfad = null;
    else if (neuesLogo) {
      const r = await firmenlogoHochladen(firma.id, neuesLogo.blob);
      if (r === 'zu-gross' || r === 'typ' || r === 'fehler') { setStatus('fehler'); setMeldung(LOGO_MELDUNG[r]); return; }
      pfad = r;
    }
    if (!(await firmaSpeichern({ id: firma.id, name, angebot: geprueft.data, logoPfad: pfad }))) {
      setStatus('fehler');
      setMeldung('Das Angebot konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.');
      return;
    }
    setNeuesLogo(null);
    setStatus('gespeichert');
    onGespeichert({ ...firma, name: name.trim(), angebot: geprueft.data, logoPfad: pfad });
    // Das vorige Logo entfernen — im Hintergrund.
    void firmenlogosAufraeumen(firma.id, pfad);
  };

  const vorschau = neuesLogo === 'entfernen' ? null : neuesLogo ? neuesLogo.dataUrl : logo;
  const mitGeloescht = [
    beratungen === 1 ? 'einer Beratung' : beratungen > 1 ? `allen ${beratungen} Beratungen` : null,
    firma.logoPfad ? 'dem Logo' : null,
  ].filter(Boolean).join(' und ');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Karte titel="Die Firma">
          <div className="space-y-3">
            <TextFeld label="Name der Firma" wert={name} onChange={(v) => { setName(v); setStatus('bereit'); }} maxLaenge={120} autoComplete="organization" />
            <TextBereich label="Anschrift (für die Entgeltumwandlungsvereinbarung)" wert={a.anschrift} onChange={(v) => setze('anschrift', v)} maxLaenge={300} zeilen={3} />
            <div>
              <span className={FELD_LABEL}>Logo der Firma</span>
              <div className="flex flex-wrap items-center gap-3">
                {vorschau
                  ? <img src={vorschau} alt="Logo der Firma" className="h-14 max-w-[10rem] rounded-xl bg-white object-contain p-1.5" />
                  : <span className="text-sm text-ui-schiefer">Kein Logo</span>}
                <label htmlFor={dateiId} className={`${KNOPF_ZWEIT} cursor-pointer`}>
                  <ImagePlus className="h-4 w-4" aria-hidden /> {vorschau ? 'Anderes Logo' : 'Logo wählen'}
                </label>
                <input id={dateiId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  onChange={(e) => { void logoWaehlen(e.target.files?.[0]); e.target.value = ''; }} />
                {vorschau && (
                  <button type="button" onClick={() => { setNeuesLogo(firma.logoPfad ? 'entfernen' : null); setStatus('bereit'); }} className={KNOPF_ZWEIT}>
                    Entfernen
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-ui-schiefer">PNG, JPG oder WebP. Es erscheint im Gespräch und auf den Unterlagen.</p>
              {typeof neuesLogo === 'object' && neuesLogo?.druckfarben && (
                <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{DRUCKFARBEN_HINWEIS}</p>
              )}
            </div>
            <TextBereich label="Begrüßung" wert={a.begruessung} onChange={(v) => setze('begruessung', v)} maxLaenge={1500} zeilen={3}
              platzhalter="Liebe Kolleginnen und Kollegen, wir unterstützen Ihre Altersvorsorge …" />
            <TextBereich label="Hinweise aus der Versorgungsordnung" wert={a.hinweise} onChange={(v) => setze('hinweise', v)} maxLaenge={3000} zeilen={4}
              hilfe="Je Zeile ein Hinweis" />
          </div>
        </Karte>

        <Karte titel="Modell und Vertrag">
          <div className="space-y-3">
            <AuswahlFeld label="Modell" wert={m.art} optionen={ARTEN}
              onChange={(art) => setze('modell', firmenModellSchema.parse({ art }))} />
            {m.art === 'zuschuss' && (
              <>
                <ProzentFeld label="Zuschuss in % der Umwandlung" wert={m.quote} onChange={(quote) => setzeModell({ quote })} min={0} max={100} />
                <ZahlFeld label="Höchstens im Monat" wert={m.deckelMonat} onChange={(deckelMonat) => setzeModell({ deckelMonat })} einheit="€" schritt={10} hilfe="0: ohne Deckel" />
              </>
            )}
            {m.art === 'festbetrag' && (
              <>
                <ZahlFeld label="Festbetrag im Monat" wert={m.festbetragMonat} onChange={(festbetragMonat) => setzeModell({ festbetragMonat })} einheit="€" schritt={10} />
                <ZahlFeld label="Ab einer Umwandlung von" wert={m.mindestUmwandlungMonat} onChange={(mindestUmwandlungMonat) => setzeModell({ mindestUmwandlungMonat })} einheit="€" schritt={10} />
              </>
            )}
            {m.art === 'matching' && (
              <>
                <AuswahlFeld label="Der Mitarbeiter wandelt um in" wert={m.weg} onChange={(weg) => setzeModell({ weg })}
                  optionen={[
                    { wert: 'dv', text: 'Direktversicherung, Pensionskasse oder -fonds' },
                    { wert: 'ukasse', text: 'die Unterstützungskasse' },
                  ]} />
                <ZahlFeld label="Matching des Arbeitgebers im Monat" wert={m.matchingMonat} onChange={(matchingMonat) => setzeModell({ matchingMonat })} einheit="€" schritt={10}
                  hilfe="In die Unterstützungskasse, für jeden Teilnehmer gleich." />
                {m.weg === 'dv' && (
                  <Schalter label="Gesetzlicher Zuschuss ist im Matching enthalten" wert={m.zuschussImMatching} onChange={(zuschussImMatching) => setzeModell({ zuschussImMatching })} />
                )}
              </>
            )}
            <p className="ui-innen px-4 py-3 text-sm text-ui-tinte">{regelText(m)}</p>

            {(m.art !== 'matching' || m.weg === 'dv') && (
              <AuswahlFeld label="Durchführungsweg der Umwandlung" wert={a.durchfuehrungsweg} optionen={WEGE}
                onChange={(w) => setze('durchfuehrungsweg', w)} />
            )}
            <TextFeld label="Versicherer" wert={a.versicherer} onChange={(v) => setze('versicherer', v)} maxLaenge={120} />
            <TextFeld label="Tarif" wert={a.tarif} onChange={(v) => setze('tarif', v)} maxLaenge={120} />
            {/* Fuer den AXA-Antrag, der bei AXA an die Stelle der Mustervereinbarung tritt (axa-antrag.tsx). Leer: die Linie bleibt zum Ausfuellen. */}
            {/\baxa\b/i.test(a.versicherer) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextFeld label="Kollektivnummer (AXA)" wert={a.kollektivnummer} onChange={(v) => setze('kollektivnummer', v)} maxLaenge={40} />
                <TextFeld label="Organisationsnummer (AXA, Vorgabe)" wert={a.organisationsnummer} onChange={(v) => setze('organisationsnummer', v)} maxLaenge={40} />
              </div>
            )}
            {m.art === 'matching' && (
              <TextFeld label="Unterstützungskasse (Träger)" wert={a.ukasse} onChange={(v) => setze('ukasse', v)} maxLaenge={120} />
            )}
            <AuswahlFeld label="Sitz der Firma (Bundesland)" wert={a.bundesland} optionen={LAENDER} onChange={(v) => setze('bundesland', v)} />
            <DatumFeld label="Beginn der Umwandlung" wert={a.beginn} onChange={(v) => setze('beginn', v)}
              hilfe="Leer: jeweils der nächste Monatserste." />
          </div>
        </Karte>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void speichern()} disabled={status === 'speichert' || !geaendert} className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> {status === 'speichert' ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <span role="status" className="text-sm text-ui-schiefer">
          {status === 'gespeichert' && !geaendert ? 'Gespeichert.' : geaendert ? 'Nicht gespeichert.' : ''}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setLoeschen(true)} className={KNOPF_GEFAHR}>
          <Trash2 className="h-4 w-4" aria-hidden /> Firma löschen
        </button>
      </div>
      {beratungen > 0 && (
        <p className="text-xs leading-relaxed text-ui-schiefer">
          Änderungen am Angebot gelten für alle Beratungen, die noch nicht unterschrieben sind. Unterschriebene Unterlagen
          bleiben, wie sie unterschrieben wurden.
        </p>
      )}
      {meldung && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}

      <Dialog offen={loeschen} titel="Firma löschen?" onSchliessen={() => setLoeschen(false)}>
        <p className="text-sm leading-relaxed text-ui-tinte">
          „{firma.name}“ wird {mitGeloescht ? `mit ${mitGeloescht} ` : ''}gelöscht. Ausgedruckte Unterlagen bleiben davon unberührt.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setLoeschen(false)} className={KNOPF_ZWEIT}>Abbrechen</button>
          <button type="button" className={KNOPF_GEFAHR}
            onClick={() => void firmaLoeschen(firma.id).then((ok) => {
              if (ok) onGeloescht();
              else { setLoeschen(false); setMeldung('Die Firma konnte nicht gelöscht werden.'); }
            })}>
            Endgültig löschen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
