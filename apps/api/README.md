# @renten/api

Duenne API fuer Konten und gespeicherte Szenarien.

## Bewusste Entwurfsentscheidung: kein Rechenendpunkt

Die Berechnung laeuft ausschliesslich im Browser (`packages/engine`, ausgefuehrt
in einem Web Worker). Diese API kennt **keinen** `/calculate`-Endpunkt, und das
soll so bleiben.

Begruendung — Lastverhalten:

| Schicht                     | Last je Nutzer                | Skalierung                    |
|-----------------------------|-------------------------------|-------------------------------|
| Statisches Bundle (CDN)     | ein Download, danach Cache    | unabhaengig von der Nutzerzahl |
| Engine (Browser/Worker)     | **0 Server-CPU**              | skaliert mit den Endgeraeten   |
| Diese API                   | ~20 Requests je Sitzung, ~2 KB | 10.000 DAU ≈ 2,3 Writes/s     |

Wuerde die Engine serverseitig laufen, entstuenden bei Live-Eingabe rund zehn
Berechnungen pro Sekunde und Nutzer — bei gleicher Nutzerzahl also mehrere
tausend Requests pro Sekunde statt heute null. Genau diese Ueberlastung soll
die Trennung vermeiden, nicht erzeugen.

Wer den Rechenkern spaeter doch serverseitig braucht (etwa fuer PDF-Rendering),
importiert `@renten/engine` direkt — es ist dasselbe Paket, kein zweiter
Rechenweg.

## Gespeichert wird nur die Eingabe

Szenarien werden als Eingabe-JSON abgelegt, niemals als Ergebnis. Eine
Aktualisierung des Rechtsstands bewertet damit automatisch alle gespeicherten
Szenarien neu.

## Datenschutz

Geburtsdatum, Einkommen und Anwartschaften sind personenbezogene Finanzdaten.
Vor einem Produktivbetrieb erforderlich: Hosting in der EU, Verschluesselung at
rest, Auftragsverarbeitungsvertrag mit dem Hoster, Loeschkonzept und
Selbstbedienungs-Loeschung, Datenschutzerklaerung.

Die Anmeldung laeuft ueber Magic Link — es werden keine Passwoerter
gespeichert, also koennen auch keine verloren gehen.
