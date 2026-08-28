# JS-Rentenplaner

Rechnet die Rente in Deutschland vom Brutto ins Netto — nach den Regeln des
Einkommensteuergesetzes und der Sozialversicherung.

## Aufbau

```
packages/
  engine/    Rechenkern. Reines TypeScript, keine React- oder DOM-Abhaengigkeit.
  schema/    zod-Schemas fuer Szenarien. Von Browser und Datenbank gemeinsam genutzt.
apps/
  web/       React + Vite. Rechnet im Web Worker, spricht direkt mit Supabase.
supabase/
  migrations/  Tabelle und Row-Level-Security-Policies.
```

Es gibt **keinen eigenen Server**. Das Frontend ist ein statisches Bundle,
Anmeldung und Datenbank uebernimmt Supabase.

## Warum die Berechnung im Browser bleibt

Das war die zentrale Architekturfrage. Die Antwort ist nicht offensichtlich:

| Schicht                    | Last je Nutzer                 | Skalierung                     |
|----------------------------|--------------------------------|--------------------------------|
| Statisches Bundle (CDN)    | ein Download, danach Cache     | unabhaengig von der Nutzerzahl |
| Engine (Browser/Worker)    | **0 Server-CPU**               | skaliert mit den Endgeraeten   |
| Supabase (Konten/Szenarien)| ~20 Anfragen je Sitzung, ~2 KB | 10.000 DAU ≈ 2,3 Writes/s      |

Ein serverseitiger Rechenendpunkt wuerde bei Live-Eingabe rund zehn
Berechnungen pro Sekunde und Nutzer ausloesen — bei gleicher Nutzerzahl also
mehrere tausend Anfragen pro Sekunde statt heute null. Die Trennung von
Front- und Backend dient hier der Wartbarkeit und den Konten, nicht der
Rechenlast; die Rechenlast verschwindet dadurch, dass sie gar nicht erst auf
dem Server entsteht.

Die Engine ist trotzdem serverfaehig: Wird spaeter etwa serverseitiges
PDF-Rendering gebraucht, importiert eine Edge Function dasselbe Paket — kein
zweiter Rechenweg, keine Divergenz.

## Datenhaltung

Eine Tabelle, `public.szenarien`. Gespeichert werden ausschliesslich
**Eingaben**, niemals Rechenergebnisse — eine Aktualisierung des Rechtsstands
bewertet dadurch alle gespeicherten Szenarien automatisch neu.

Weil der Browser direkt mit der Datenbank spricht, ist **Row Level Security die
einzige Schutzschicht**. Vier Policies binden jede Zeile an `auth.uid()`; das
`with check` beim Update verhindert, dass jemand seine Zeile in ein fremdes
Konto verschiebt. Die Migration liegt in `supabase/migrations/`.

Anmeldung per Magic Link — es werden keine Passwoerter gespeichert.

Die Absicherung ist nachgewiesen, nicht nur behauptet:
`supabase/tests/rls-nachweis.sql` legt zwei Konten an und prueft in einer
zurueckgerollten Transaktion, dass Konto B die Daten von Konto A weder lesen
noch aendern noch loeschen kann, dass es seine eigene Zeile keinem fremden
Konto unterschieben kann und dass TRUNCATE abgewiesen wird. Neun Pruefungen,
alle bestanden.

Ein Hinweis fuer eigene Tabellen: Supabase vergibt im public-Schema
standardmaessig ALLE Tabellenrechte an `authenticated`, darunter TRUNCATE —
und TRUNCATE unterliegt keiner Row Level Security. Rechte muessen daher aktiv
entzogen werden, ein grant der gewuenschten Rechte genuegt nicht.

Ohne Anmeldung ist die Anwendung voll nutzbar: Die Eingaben bleiben dann im
localStorage und verlassen das Geraet nicht.

## Rechtsstand

Alle steuer- und sozialversicherungsrechtlichen Groessen liegen in
`packages/engine/src/params`. Belegt sind 2024, 2025 und 2026; spaetere Jahre
werden ueber einen einstellbaren Index fortgeschrieben. Jedes Ergebnis weist
aus, welcher Stand verwendet wurde, und der PDF-Druck erlaeutert die
Fortschreibungsannahme ausfuehrlich.

Der Einkommensteuertarif wird **nicht** ueber die amtlichen Koeffizienten
gepflegt, sondern ueber vier Eckwerte je Jahrgang (Grundfreibetrag und drei
Zonengrenzen). Aus ihnen und den Ankern des Grenzsteuersatzes (14 % / 23,97 %
/ 42 % / 45 %) folgen alle Koeffizienten eindeutig. Die Herleitung
reproduziert die amtlichen Konstanten fuer 2024 auf 0,004 EUR genau und macht
den Tarif per Konstruktion stetig.

Jaehrliche Aktualisierung: vier Zahlen je Jahrgang plus Beitragssaetze und
Bemessungsgrenzen eintragen. Die Tests pruefen Stetigkeit, Monotonie und den
Verlauf des Grenzsteuersatzes automatisch.

## Entwicklung

```bash
pnpm install
pnpm -r build      # engine und schema nach dist, danach die Web-App
pnpm -r test
pnpm dev           # Web-App auf http://localhost:5173
```

Fuer Anmeldung und gespeicherte Szenarien in `apps/web/.env.local`:

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Vorlage: `apps/web/.env.example`. Beide Werte sind oeffentlich — sie stecken in
jedem ausgelieferten Bundle. Das ist bei Supabase so vorgesehen; die
Absicherung leistet allein Row Level Security. Der aeltere
`VITE_SUPABASE_ANON_KEY` wird als Rueckfallebene weiterhin gelesen.

Fehlen die Werte, startet die Anwendung trotzdem — der Konto-Bereich blendet
sich dann aus.

### Supabase-Werkzeuge fuer Claude Code

`.mcp.json` konfiguriert den Supabase-MCP-Server projektweit. Beim ersten
`claude` im Projektverzeichnis muss der Server einmal bestaetigt und ueber
`/mcp` authentifiziert werden — das laeuft ueber einen Browser-Login und
funktioniert nur in einem echten Terminal, nicht in einer Web-Sitzung.

Die begleitenden Agent-Skills sind nicht eingecheckt, sondern aus
`skills-lock.json` reproduzierbar:

```bash
npx skills add supabase/agent-skills
```

## Bekannte Luecken

- **Besoldungstabellen.** Fuer Beamte liegen noch keine amtlichen Tabellen
  vor; die Werte stammen aus einer linearen Naeherung und sind in der
  Oberflaeche als solche gekennzeichnet. Die Struktur ist vorbereitet:
  `packages/engine/src/pension/besoldung-daten.ts`, Eintragen ist ein reiner
  Daten-Commit.
- **Hinterbliebenenversorgung** ist nicht abgebildet.
- **Hosting des Frontends** ist noch nicht festgelegt. Als statisches Bundle
  passt jedes CDN; Build Command `pnpm -r build`, Output `apps/web/dist`.
- **Datenschutz:** Das Supabase-Projekt liegt in der EU (eu-west-3).
  Geburtsdatum, Einkommen und Anwartschaften sind personenbezogene
  Finanzdaten — fuer den Produktivbetrieb sind Auftragsverarbeitungsvertrag,
  Loeschkonzept und Datenschutzerklaerung erforderlich.
- **E-Mail-Versand** der Anmeldelinks laeuft ueber Supabase; dessen
  eingebauter Versand hat enge Limits, produktiv ist ein eigener SMTP-Anbieter
  zu hinterlegen.

## Rechtlicher Hinweis

Modellrechnung ohne Gewaehr. Keine Steuer-, Renten- oder Anlageberatung.
Massgeblich sind allein die Bescheide der Finanzverwaltung und der
Versorgungstraeger.
