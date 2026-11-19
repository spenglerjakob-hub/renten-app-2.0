import { Users } from 'lucide-react';
import { NamenFelder, TextFeld } from '../components/Feld';
import { namensTeile, vollerName } from '../lib/namen';
import { Hinweis } from '../components/stil';
import type { VorbereitetesLogo } from '../lib/bild';
import { GRENZEN, type Auftritt } from './auftritt';
import { FarbWahl, LogoWahl } from './AuftrittTeile';

/** Im Buero („Abo & Team“): Logo, Firmenname und Akzentfarbe legt der Inhaber fest. */
export interface BueroVorgabe {
  rolle: 'inhaber' | 'mitglied';
  /** Name des Bueros, falls vergeben */
  buero: string | null;
  /** Fuer Mitglieder: wer festlegt */
  inhaber: string;
}

/**
 * Die Eingaben fuer „Ihr Auftritt im Gutachten“ — in der Schnellrechnung
 * (Logo, Firma, Farbe) und im Fenster des Rechners (`voll`: dazu Name und
 * Kontakt). Gespeichert wird beim Aufrufer.
 *
 * Das Logo wird hier vorbereitet (`logoVorbereiten`): neu gezeichnet,
 * hoechstens 800 Pixel, ohne Metadaten. Hinaus geht nur das Ergebnis.
 *
 * IM BUERO (`buero`) sehen Mitglieder Logo, Firmenname und Akzentfarbe des
 * Inhabers gesperrt; der Inhaber erfaehrt, dass sie fuer alle gelten.
 */
export function AuftrittFormular({ wert, onAendern, onLogo, voll = false, anmeldeAdresse = null, buero = null }: {
  wert: Auftritt;
  onAendern: (teil: Partial<Auftritt>) => void;
  /** Ein neues, vorbereitetes Logo — null: entfernt */
  onLogo: (logo: VorbereitetesLogo | null) => void;
  voll?: boolean;
  /** Fuer „Anmelde-Adresse übernehmen“ — vorbelegt wird die E-Mail bewusst nicht */
  anmeldeAdresse?: string | null;
  buero?: BueroVorgabe | null;
}) {
  const gesperrt = buero?.rolle === 'mitglied';
  const bueroName = buero?.buero ? ` „${buero.buero}“` : '';

  return (
    <div className="space-y-4">
      {buero && (
        <Hinweis symbol={Users}>
          {/* text-pretty: kein einzelnes Wort des Bueronamens allein in der letzten Zeile */}
          <p className="text-pretty">
            {gesperrt
              ? <>Logo, Firmenname und Akzentfarbe legt {buero.inhaber || 'der Inhaber Ihres Büros'} für Ihr Büro{bueroName} fest.</>
              : <>Logo, Firmenname und Akzentfarbe gelten für alle Kollegen in Ihrem Büro{bueroName}.</>}
          </p>
        </Hinweis>
      )}

      {/* Im Buero legt diese Felder der Inhaber fest — fuer Mitglieder gesperrt */}
      <fieldset disabled={gesperrt} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* ---------- Logo ---------- */}
        <LogoWahl
          logo={wert.logo} onLogo={onLogo} gesperrt={gesperrt}
          alt={gesperrt ? 'Logo Ihres Büros' : 'Ihr Logo'}
        />

        {/* ---------- Firma, Name, Kontakt ---------- */}
        <TextFeld
          label="Firmenname" wert={wert.firma} onChange={(s) => onAendern({ firma: s })}
          maxLaenge={GRENZEN.firma} autoComplete="organization" platzhalter={gesperrt ? undefined : 'z. B. Muster Finanz GmbH'}
        />
      </fieldset>
      {voll && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Vor- und Nachname getrennt; der ganze Name (`berater`) steht im Briefkopf und wird mitgeschrieben. */}
            <NamenFelder {...namensTeile(wert.berater, wert.vorname, wert.nachname)} beschriftung={['Ihr Vorname', 'Ihr Nachname']}
              onChange={(teile) => onAendern({ ...teile, berater: vollerName(teile) })} eigener />
            <TextFeld
              label="Telefon" typ="tel" wert={wert.telefon} onChange={(s) => onAendern({ telefon: s })}
              maxLaenge={GRENZEN.telefon} autoComplete="tel"
            />
            <div>
              <TextFeld
                label="E-Mail" typ="email" wert={wert.email} onChange={(s) => onAendern({ email: s })}
                maxLaenge={GRENZEN.email} autoComplete="email"
              />
              {anmeldeAdresse && wert.email.trim() !== anmeldeAdresse && (
                <button
                  type="button"
                  onClick={() => onAendern({ email: anmeldeAdresse })}
                  className="mt-1 text-xs font-medium text-ui-tinte underline-offset-4 hover:underline"
                >
                  Anmelde-Adresse übernehmen
                </button>
              )}
            </div>
            <TextFeld
              label="Website" wert={wert.web} onChange={(s) => onAendern({ web: s })}
              maxLaenge={GRENZEN.web} autoComplete="url" platzhalter="z. B. www.muster-finanz.de"
            />
          </div>
          <TextFeld
            label="Zusatzzeile (optional)" wert={wert.zusatz} onChange={(s) => onAendern({ zusatz: s })}
            maxLaenge={GRENZEN.zusatz}
            platzhalter="z. B. Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO, Reg.-Nr. D-…"
          />
        </>
      )}

      {/* ---------- Akzentfarbe ---------- */}
      <FarbWahl farbe={wert.farbe} onFarbe={(farbe) => onAendern({ farbe })} gesperrt={gesperrt} />
    </div>
  );
}
