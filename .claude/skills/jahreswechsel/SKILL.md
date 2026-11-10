---
name: jahreswechsel
description: >-
  Prüft den JS-Rentenplaner auf Rechengrößen, die sich zum Jahreswechsel ändern oder ändern können,
  und führt durch das Anlegen des neuen Rechtsstands. Dazu gehören Beitragsbemessungsgrenzen,
  Bezugsgröße, Grundfreibetrag und Steuertarif, Soli-Freigrenze, Zusatzbeitrag und Kassenliste,
  Lohnsteuer-PAP, Rentenwert, Basiszins, Pauschbeträge, Riester und Altersvorsorgedepot, Umlagen,
  bKV-Tarife und Besoldung. Der Skill listet jede Fundstelle im Code auf, meldet veraltete Werte und
  lässt die Tests mit einer Uhr im neuen Jahr laufen. Verwende ihn immer, wenn es um Jahreswechsel,
  das neue Jahr, Rechengrößen, BBG, Freibeträge, Freigrenzen, Pauschbeträge, den Zusatzbeitrag, den
  Rechtsstand oder „die Werte für 2027“ geht. Das gilt auch, wenn nur eine einzelne Größe genannt
  wird oder jemand fragt, ob die App fürs neue Jahr bereit ist.
---

# Rechengrößen zum Jahreswechsel

Die App rechnet mit einem **Rechtsstand je Kalenderjahr**:
- Die Jahrgänge stehen in `packages/engine/src/params/jahre.ts`.
- Die Fortschreibung für spätere Jahre steht in `registry.ts`.

Daneben gibt es Werte, die **außerhalb** dieses Rechtsstands von Hand gepflegt werden: die Kassenliste, Vorgaben in Formularen, Texte mit Beträgen, Umlagen, bKV-Tarife und Besoldung.

Viele Seiten ziehen den Rechtsstand des **laufenden** Jahres (`new Date().getFullYear()`). Fehlt der neue Jahrgang am 1. Januar, rechnen sie still mit einer Fortschreibung des Vorjahres und schreiben trotzdem „Rechtsstand 2027“ darunter. Der Skill soll genau das verhindern.

## Schritt 1 — Bestandsaufnahme

Aus dem Repo-Wurzelverzeichnis:

```bash
node .claude/skills/jahreswechsel/scripts/rechengroessen.mjs --jahr 2027 --probelauf --aus <scratchpad>/jahreswechsel-2027.md
```

- Ohne `--jahr` gilt das nächste Kalenderjahr.
- Das Skript baut den Rechenkern selbst, wenn `dist/` älter als die Quellen ist.
- `--probelauf` dauert etwa 15 Sekunden. Dabei laufen alle Tests mit einer Uhr am 15. Januar des Zieljahres (`scripts/zeitreise.mjs`).
- Das Skript ändert nichts am Code.

Den Bericht ganz lesen. Er hat eine Kurzfassung und acht Teile:

| Teil | Inhalt | Was tun |
|---|---|---|
| 1 | Jedes Feld des Rechtsstands, Vorjahr gegen jüngsten Jahrgang, mit Rhythmus | „unverändert seit … — prüfen“ heißt: Ein jährlicher Wert wurde nicht fortgeschrieben, entweder vergessen oder zu Recht gleich. „ohne Katalogeintrag“: katalog.mjs ergänzen |
| 2 | Abgeleitete Werte, etwa 4 % der BBG oder 1/20 der Bezugsgröße | nichts — sie ändern sich mit. Dienen zum Wiedererkennen in Texten |
| 3 | Von Hand gepflegte Werte außerhalb des Rechtsstands | jede Zeile mit **fett** gedrucktem Befund bearbeiten |
| 4 | Stellen, die das laufende Jahr ziehen, und Texte „Rechtsstand {Jahr}“ | zeigt die Folgen, wenn der Jahrgang fehlt |
| 5 | Abschriften: Werte des Rechtsstands als feste Zahl im Code | in Code und Texten anpassen, in Kommentaren bei Gelegenheit. Tests sind meist absichtlich an ein Jahr gebunden |
| 6 | Jahreszahlen in Texten, Kommentare mit Jahr und Betrag, neue Kandidaten | prüfen, ob der Text nach dem Wechsel noch stimmt; neue Kandidaten in katalog.mjs aufnehmen |
| 7 | Tests, die ausdrücklich ein Jahr abfragen | ändern ihr Ergebnis, sobald der neue Jahrgang da ist |
| 8 | Probelauf im neuen Jahr | jeder rote Test ist ein Fehler, der am 1. Januar in CI auftritt |

## Schritt 2 — Neue Werte beschaffen

Welche Quelle für welchen Wert gilt und wann sie erscheint, steht in `references/quellen.md`. Diese Datei vor der Recherche lesen.

**Nur amtliche Quellen:**
- Bundesgesetzblatt, Bundesanzeiger
- BMF, BMAS, BMG
- Deutsche Rentenversicherung, GKV-Spitzenverband

Fachportale und Lohnbüros taugen zum Gegenprüfen, nicht als Beleg. Zu jedem Wert gehören Quelle und Datum. **Nie raten, nie selbst hochrechnen.**

**Ist ein Wert noch nicht veröffentlicht**, wird er als offen geführt. Für Rentenwert und Basiszins ist das im Herbst der Normalfall, siehe Schritt 4. Ist das Netz gesperrt, den Nutzer um die Werte oder die Dokumente bitten, statt sie aus dem Gedächtnis einzusetzen.

## Schritt 3 — Vorschlag an den Nutzer

Vor jeder Änderung dem Nutzer vorlegen:

1. Eine Tabelle `Feld | bisher | neu | Quelle mit Datum`, mit allen jährlichen Feldern, auch den unveränderten.
2. Die Fundstellen aus Teil 3, 5 und 6, die angepasst werden, jeweils mit dem neuen Text.
3. Was offen bleibt und wann es nachgetragen wird.
4. Was der Probelauf gefunden hat.

**Erst nach Zustimmung umsetzen.** Mit dem Nutzer auf Deutsch sprechen.

## Schritt 4 — Umsetzen

1. **`jahre.ts`:**
   - Neuen Jahrgang `PARAMETER_<Jahr>` anlegen, als Kopie des Vorjahres.
   - Werte ersetzen; `quelle` und Kommentare (etwa „Programmablaufplan 2027 (BMF, TT.MM.JJJJ)“) anpassen.
   - In `BELEGTE_JAHRE` aufnehmen und `BASISJAHR` auf den neuen Jahrgang setzen, denn fortgeschrieben wird immer vom Basisjahr aus.
2. **`packages/engine/src/index.ts`:** `PARAMETER_<Jahr>` exportieren.
3. **Rentenwert und Basiszins** sind im Herbst unbekannt:
   - Den Vorjahreswert übernehmen.
   - Im Kommentar „vorläufig, Vorjahreswert; amtlich ab …“ vermerken.
   - Nachgetragen werden sie in Schritt 5.

   Für alle anderen jährlichen Werte gilt: Einen Jahrgang mit `extrapoliert: false` legt man erst an, wenn sie amtlich sind. Bis dahin ist die Fortschreibung ehrlicher als ein halb geratener Jahrgang.
4. **Fundstellen aus Teil 3:**
   - Kassenliste `krankenkassen.ts` samt `KASSEN_STAND`.
   - Vorgaben des Zusatzbeitrags in `bav-beratung.ts` und `check/uebernahme.ts`.
   - Insolvenzgeldumlage, bKV-Tarife.
   - Texte, die Pauschbeträge oder Zulagen nennen, falls sich diese geändert haben.

   Gespeicherte Szenarien und Beratungen tragen ihren Zusatzbeitrag selbst; unterschriebene Mitarbeiterberatungen sind eingefrorenes HTML. Beides bleibt unberührt, eine Migration ist nicht nötig.
5. **Texte aus Teil 5 und 6** anpassen, wo sie nach dem Wechsel falsch wären. Kommentare nur, wenn man ohnehin dort ist.
6. **Tests:**
   - Tests, die an das alte Jahr gebunden sind (`PARAMETER_2026`), bleiben so.
   - Tests, die `parameterFuer(<neues Jahr>)` oder die Fortschreibung prüfen, neu durchdenken. Erwartungen nur ändern, wenn die neue Zahl sich aus den neuen Werten erklärt. Nie die Ausgabe ungeprüft übernehmen.
   - Ein Test, der erst im Probelauf rot wird, hängt am heutigen Datum. Dann den Test robust machen und das Erwartete aus dem laufenden Jahr ableiten. Nicht die Uhr festnageln.
7. **`scripts/katalog.mjs` pflegen:**
   - neue Felder des Rechtsstands
   - neue Fundstellen außerhalb
   - entfernte Stellen
   - geprüfte unbedenkliche Zeilen, jeweils mit Grund

   So bleibt der Skill im nächsten Jahr genau.
8. Skript erneut mit `--probelauf` laufen lassen:
   - Die Kurzfassung ist sauber, bis auf die bekannten offenen Werte.
   - Der Probelauf ist grün.
9. `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build`.
10. **Ausliefern:**
    - Commit auf den Arbeitszweig der Sitzung. Live geht es erst auf ausdrückliche Anweisung („live schalten“).
    - Rechtzeitig vor dem 1. Januar fertig werden, damit live und Testseite ab Neujahr mit dem neuen Jahrgang rechnen.

## Schritt 5 — Nachträge im Lauf des Jahres

- **Januar:** Basiszins (BMF-Schreiben); gegebenenfalls geänderter PAP.
- **Frühjahr:** Rentenanpassung zum 1. Juli. Der Rechtsstand führt den Wert ab Juli des Jahres.
- **Jederzeit:**
  - Kassen ändern ihren Zusatzbeitrag unterjährig.
  - Besoldungsanpassungen kommen zu eigenen Terminen.
  - Gesetzesänderungen betreffen Pauschbeträge, Riester und das Altersvorsorgedepot.

Für jeden Nachtrag genügt derselbe Ablauf im Kleinen: Skript laufen lassen, Wert mit Quelle vorlegen, eintragen, testen.

## Grenzen des Skripts

Das Skript findet Werte über Katalog, Zahlenabgleich und Stichwörter. Ein Betrag, der weder im Katalog steht noch als Wert des Rechtsstands noch neben einem Stichwort, fällt durch.

Deshalb bei jeder Änderung an Rechnungen oder Texten fragen: Hängt hier eine Zahl am Jahr? Wenn ja, gehört sie in den Rechtsstand oder wenigstens in `katalog.mjs`.
