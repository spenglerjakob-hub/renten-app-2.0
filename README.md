# JS-Rentenplaner

Rechnet die Rente in Deutschland vom Brutto ins Netto — nach den Regeln des
Einkommensteuergesetzes und der Sozialversicherung.

## Aufbau

```
packages/
  engine/    Rechenkern. Reines TypeScript, keine React- oder DOM-Abhaengigkeit.
  schema/    zod-Schemas fuer Szenarien. Von Browser und Backend gemeinsam genutzt.
apps/
  web/       React + Vite. Ruft die Engine in einem Web Worker.
  api/       Hono. Konten und gespeicherte Szenarien — kein Rechenendpunkt.
```

## Warum die Berechnung im Browser bleibt

Das war die zentrale Architekturfrage. Die Antwort ist nicht offensichtlich:

| Schicht                 | Last je Nutzer                 | Skalierung                     |
|-------------------------|--------------------------------|--------------------------------|
| Statisches Bundle (CDN) | ein Download, danach Cache     | unabhaengig von der Nutzerzahl |
| Engine (Browser/Worker) | **0 Server-CPU**               | skaliert mit den Endgeraeten   |
| API (Konten/Szenarien)  | ~20 Anfragen je Sitzung, ~2 KB | 10.000 DAU ≈ 2,3 Writes/s      |

Ein serverseitiger Rechenendpunkt wuerde bei Live-Eingabe rund zehn
Berechnungen pro Sekunde und Nutzer ausloesen — bei gleicher Nutzerzahl also
mehrere tausend Anfragen pro Sekunde statt heute null. Die Trennung von
Front- und Backend dient hier der Wartbarkeit und den Konten, nicht der
Rechenlast; die Rechenlast verschwindet dadurch, dass sie gar nicht erst auf
dem Server entsteht.

Die Engine ist trotzdem serverfaehig: Wird spaeter etwa serverseitiges
PDF-Rendering gebraucht, importiert die API dasselbe Paket — kein zweiter
Rechenweg, keine Divergenz.

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
pnpm -r test       # 79 Tests
pnpm dev           # Web-App auf http://localhost:5173
```

Die API separat:

```bash
pnpm --filter @renten/api build
pnpm --filter @renten/api start   # http://localhost:8787
```

## Bekannte Luecken

- **Besoldungstabellen.** Fuer Beamte liegen noch keine amtlichen Tabellen
  vor; die Werte stammen aus einer linearen Naeherung und sind in der
  Oberflaeche als solche gekennzeichnet. Die Struktur ist vorbereitet:
  `packages/engine/src/pension/besoldung-daten.ts`, Eintragen ist ein reiner
  Daten-Commit.
- **Hinterbliebenenversorgung** ist nicht abgebildet.
- **Hosting** ist noch nicht festgelegt; die API laeuft lokal gegen SQLite.
  Fuer den Produktivbetrieb sind Hosting in der EU, Verschluesselung at rest,
  Auftragsverarbeitungsvertrag, Loeschkonzept und Datenschutzerklaerung
  erforderlich — Geburtsdatum, Einkommen und Anwartschaften sind
  personenbezogene Finanzdaten.

## Rechtlicher Hinweis

Modellrechnung ohne Gewaehr. Keine Steuer-, Renten- oder Anlageberatung.
Massgeblich sind allein die Bescheide der Finanzverwaltung und der
Versorgungstraeger.
