# Quellen, Termine und Fallstricke je Rechengröße

Für Schritt 2 des Skills: Woher jeder Wert kommt, wann er erscheint und wo er im Code steht. Die Gruppen entsprechen denen im Bericht (`scripts/katalog.mjs`, `GRUPPEN`).

## Inhalt

1. Kalender
2. Sozialversicherungs-Rechengrößen
3. Zusatzbeitrag und Kassenliste
4. Einkommensteuertarif und Solidaritätszuschlag
5. Lohnsteuer nach Steuerklasse (PAP)
6. Beitragssätze
7. Rentenwert
8. Basiszins
9. Pauschbeträge, feste Sätze und Entlastungsbeträge
10. Riester und Altersvorsorgedepot
11. Arbeitgeberseiten: Umlagen, Sachbezug, bKV-Tarife
12. Beamtenbesoldung
13. Vorgaben und Annahmen
14. Häufige Fehler

Nur amtliche Fundstellen gelten als Beleg:
- Bundesgesetzblatt (recht.bund.de), Bundesanzeiger
- bundesfinanzministerium.de, bmas.de, bundesgesundheitsministerium.de
- deutsche-rentenversicherung.de, gkv-spitzenverband.de

Fachportale nur zum Gegenprüfen.

## 1. Kalender

| Wann | Was | Felder |
|---|---|---|
| September/Oktober | Referentenentwurf und Kabinett: Sozialversicherungs-Rechengrößenverordnung | BBG, Bezugsgröße, Durchschnittsentgelt, Höchstbetrag Altersvorsorge |
| Herbst | Beitragssatzverordnung RV, Insolvenzgeldumlagesatz, ggf. PV- oder AV-Satz | `rvSatzGesamt`, `pv.*`, `avSatzGesamt`, Text Insolvenzgeldumlage |
| bis 1. November | BMG: durchschnittlicher Zusatzbeitrag | `kv.zusatzbeitrag`, Vorgaben in Formularen |
| November | BMF: Programmablaufplan Lohnsteuer; Bundesrat zu den Rechengrößen | `lohnsteuer.*` |
| November/Dezember | Tarifgesetze (Grundfreibetrag, Zonen, Soli-Freigrenze), falls nicht schon beschlossen | `est.*`, `soli.*` |
| Dezember | Zusatzbeiträge der einzelnen Kassen, U1/U2 der Kassen | `krankenkassen.ts`, Umlage-Texte |
| Anfang Januar | BMF: Basiszins der Vorabpauschale; ggf. geänderter PAP | `basiszins` |
| Frühjahr | Rentenanpassung zum 1. Juli | `rentenwert` |
| jederzeit | Besoldungsanpassungen, Kassen unterjährig, Gesetzesänderungen, Versicherertarife | Besoldung, Kassenliste, Pauschbeträge, bKV |

**Praktisch:**
- Bestandsaufnahme Ende Oktober.
- Umsetzen, sobald Rechengrößenverordnung, Zusatzbeitrag, PAP und Tarif amtlich sind; meist Ende November.
- Live vor dem 1. Januar.
- Steht bis dahin nur ein Teil fest, kommt dieser Teil als Vorabwerte in den Code (SKILL.md, Schritt 4a). Rundschreiben von Versicherern und Lohnbüros nennen die Rechengrößen früh und zuverlässig; sie taugen als Vorabwert mit dem Vermerk „vorläufig“, nicht als Beleg für den Jahrgang.

## 2. Sozialversicherungs-Rechengrößen

**Quelle:** Verordnung über maßgebende Rechengrößen der Sozialversicherung für das Jahr (BMAS, Bundesgesetzblatt).

| Feld | Was genau | Hinweis |
|---|---|---|
| `bbgRvJahr` | Beitragsbemessungsgrenze der allgemeinen Rentenversicherung, **Jahr** | gilt auch für die Arbeitslosenversicherung; seit 2025 ohne Ost/West |
| `bbgKvJahr` | Beitragsbemessungsgrenze Kranken- und Pflegeversicherung, **Jahr** | **nicht** die Versicherungspflichtgrenze (JAEG), die höher liegt |
| `bezugsgroesseMonat` | Bezugsgröße § 18 SGB IV, **Monat** | Grundlage für KV-Freibetrag Versorgungsbezüge (1/20), Mindestbemessung (1/3), Familienversicherung (1/7) — alles abgeleitet |
| `durchschnittsentgelt` | vorläufiges Durchschnittsentgelt des Jahres (Anlage 1 SGB VI) | nicht das endgültige Durchschnittsentgelt eines Vorjahres |
| `hoechstbetragAltersvorsorge` | § 10 Abs. 3 EStG: Höchstbeitrag zur knappschaftlichen RV | **ausrechnen:** BBG knappschaftliche RV (Jahr) × 24,7 %, auf volle Euro aufgerundet. Probe 2026: 124.800 × 0,247 = 30.825,60 → 30.826 |

Der Beitragssatz der knappschaftlichen RV (24,7 %) hängt am allgemeinen RV-Satz. Ändert sich dieser, ändert sich auch der knappschaftliche, und damit der Höchstbetrag.

## 3. Zusatzbeitrag und Kassenliste

**Durchschnitt (`kv.zusatzbeitrag`):**
- Bekanntmachung des BMG nach § 242a SGB V im Bundesanzeiger, bis 1. November.
- Als Dezimalzahl eintragen, z. B. 0.029 für 2,9 %.

**Dieselbe Zahl steht als Vorgabe auch in:**
- `packages/schema/src/bav-beratung.ts` (`zusatzbeitrag … .default(…)`) — die Mitarbeiterberatung.
- `apps/web/src/check/uebernahme.ts` (`leereAntworten`, Person A und B) — der Vorsorge-Check.

Gespeicherte Angaben behalten ihren Satz. Die Vorgabe wirkt nur für neue Angaben.

**Kassenliste (`apps/web/src/features/krankenkassen.ts`):**
- Zusatzbeitragssätze aller Kassen aus der Übersicht des GKV-Spitzenverbands übernehmen.
- Prüfregel aus dem Kommentar der Datei: allgemeiner Satz 14,6 % + Zusatzbeitrag = Beitragssatz der Kasse; keine Kasse doppelt; Spanne plausibel.
- Fusionierte oder geschlossene Kassen entfernen.
- `KASSEN_STAND` auf das neue Jahr setzen; der Text erscheint in der Oberfläche.
- Kommentar mit Spanne und Durchschnitt anpassen; die Spanne steht auch im Kommentar von `features/Basisdaten.tsx`.

## 4. Einkommensteuertarif und Solidaritätszuschlag

**Tarif (§ 32a Abs. 1 EStG):**
- Gepflegt werden nur die vier Eckwerte: `grundfreibetrag`, `zone2Ende`, `zone3Ende`, `zone4Ende`.
- Die Koeffizienten leitet `tax/estg.ts` daraus ab.
- `packages/engine/test/estg-tarif.test.ts` prüft jeden belegten Jahrgang auf Stetigkeit, Monotonie und Grenzsteuersätze.
- Zur Probe die Koeffizienten aus dem Gesetzestext mit `koeffizienten()` vergleichen. Der Test „trifft die 2024er Koeffizienten“ zeigt, wie das geht. Ein solcher Test für den neuen Jahrgang ist ein guter Beleg.

**Soli (`soli.freigrenze`):**
- § 3 Abs. 3 SolZG: ein Betrag der **Einkommensteuer**, nicht des Einkommens. Grundtarif; bei Zusammenveranlagung doppelt, das rechnet der Kern selbst.
- `soli.milderungszoneEnde` wird nicht gerechnet, nur mitgeführt.
- Rechnerisch ergibt es sich als Freigrenze × 11,9 / 6,4. Eingetragen sind bisher abweichende Werte, etwa 37.400 statt 37.838 für 2026. Beim nächsten Jahrgang rechnerisch eintragen oder das Feld entfernen.

**Herkunft:** Die Werte kommen aus Steuergesetzen (Inflationsausgleich, Steuerfortentwicklung), oft schon im Vorjahr für zwei Jahre beschlossen. Gesetz und Verkündung im Bundesgesetzblatt prüfen.

## 5. Lohnsteuer nach Steuerklasse (PAP)

- **Quelle:** BMF, Programmablaufplan für die maschinelle Berechnung der Lohnsteuer des Jahres. Erscheint im November, manchmal mit geänderter Fassung im Januar.
- **`lohnsteuer.w1Stkl5`, `w2Stkl5`:** die Konstanten W1STKL5 und W2STKL5 aus dem PAP. Datum des PAP in den Kommentar.
- **`w3Stkl5`:** folgt dem Beginn des 45-%-Satzes, `zone4Ende` × 0,8. Ändert sich nur mit diesem.
- **`entlastungAlleinerziehend`:** § 24b EStG, ändert sich nur per Gesetz.
- **Gegenprobe:** der Lohnsteuerrechner des BMF (bmf-steuerrechner.de) mit einem Beispiel in Steuerklasse V.

## 6. Beitragssätze

| Feld | Grundlage | Hinweis |
|---|---|---|
| `rvSatzGesamt` | Beitragssatzverordnung RV (BMAS), jedes Jahr festgesetzt | seit Jahren 18,6 %; jedes Jahr bestätigen |
| `avSatzGesamt` | § 341 SGB III | |
| `kv.allgemeinerSatz` | § 241 SGB V | |
| `pv.*` | § 55 SGB XI | Satz, Zuschlag Kinderlose, Abschlag je Kind ab dem 2. bis zum 5. Kind unter 25, Mehranteil Sachsen |

## 7. Rentenwert

- **Quelle:** Rentenwertbestimmungsverordnung (BMAS), Frühjahr; gilt ab 1. Juli.
- **Konvention im Code:** `rentenwert` eines Jahres ist der Wert **ab 1. Juli** dieses Jahres.
- **Im Herbst** ist der Juli-Wert des Folgejahres unbekannt: Vorjahreswert eintragen, als vorläufig kommentieren, im Frühjahr nachtragen.

## 8. Basiszins

- **Quelle:** BMF-Schreiben zum Basiszins für die Vorabpauschale (§ 18 Abs. 4 InvStG), Anfang Januar. Abgeleitet aus der Rendite nach § 203 Abs. 2 BewG.
- **Bis dahin** den Vorjahreswert eintragen, als vorläufig kommentieren und im Januar nachtragen.
- **Gleicher Wert wie im Vorjahr** ist beim Basiszins fast immer ein vergessener Nachtrag: Der Zins folgt der Marktrendite und war seit Einführung der Vorabpauschale nie zwei Jahre gleich. Belegte Jahrgänge dann berichtigen.

## 9. Pauschbeträge, feste Sätze und Entlastungsbeträge

Ändern sich nur per Gesetz. Trotzdem jedes Jahr prüfen, ob ein Jahressteuergesetz sie berührt.

| Feld | Grundlage |
|---|---|
| `pauschbetraege.arbeitnehmer` | § 9a Satz 1 Nr. 1a EStG |
| `pauschbetraege.versorgungsbezuege` | § 9a Satz 1 Nr. 1b EStG |
| `pauschbetraege.renten` | § 9a Satz 1 Nr. 3 EStG |
| `pauschbetraege.sonderausgaben` | § 10c EStG |
| `pauschbetraege.sparer` | § 20 Abs. 9 EStG |
| `abgeltungsteuersatz` | § 32d EStG |

**Diese Werte stehen auch als Text:**
- Sparer-Pauschbetrag im Merkblatt des Gutachtens (`druck/Merkblatt.tsx`).
- Werbungskosten-Pauschbetrag für Renten auf der Depot-Seite (`avd/Seite.tsx`).

Teil 3 des Berichts vergleicht beide automatisch.

**Formeln für Besteuerungsanteil, Versorgungsfreibetrag und Altersentlastungsbetrag** stehen in `pension/freibetraege.ts`. Es sind gesetzliche Abschmelzpfade (§ 22, § 19 Abs. 2, § 24a EStG; zuletzt Wachstumschancengesetz 2024). Sie ändern sich nur per Gesetz.

## 10. Riester und Altersvorsorgedepot

**Riester (`riester.*`):**
- Grundzulage § 84, Kinderzulage § 85, Höchstbetrag § 10a, Mindesteigenbeitrag und Sockelbetrag § 86 EStG.
- Beim ersten Jahrgang 2027 prüfen, ob die Reform der privaten Altersvorsorge Riester-Werte für Neu- oder Bestandsverträge ändert.

**Altersvorsorgedepot (`avd.*`):**
- Feste Beträge aus dem Gesetz von 2026 (Bundestag 27.03.2026, Bundesrat 08.05.2026), ohne Indexierung.

**Dieselben Werte stehen als Text** im Rechner (`features/Vertraege.tsx`), auf der Depot-Seite (`avd/Seite.tsx`), im Vertrags-TÜV (`features/VertragsTuev.tsx`, `analyse/vertrags-tuev.ts`). Teil 3 vergleicht sie automatisch.

## 11. Arbeitgeberseiten: Umlagen, Sachbezug, bKV-Tarife

Datei der Erklärtexte: `arbeitgeber/bausteine.tsx`, Funktion `UmlagenErklaerung`.

**Umlagen:**
- **Insolvenzgeldumlage:** Satz der Insolvenzgeldumlagesatzverordnung (BMAS) für das neue Jahr; im Erklärtext „derzeit …“.
- **U1/U2:** setzt jede Krankenkasse selbst zum 1. Januar. Im Text stehen nur grobe Spannen und zwei Faustwerte; grob bestätigen.

**Sachbezug und Pauschalierung** (`analyse/bkv.ts`):
- Sachbezugsfreigrenze 50 € (§ 8 Abs. 2 Satz 11 EStG), `SACHBEZUG_FREIGRENZE_MONAT`.
- § 37b EStG: 10.000 € je Empfänger und Jahr, 30 %.
- § 40 Abs. 1 Satz 3 EStG: 1.000 € je Arbeitnehmer und Jahr.

Diese Grenzen ändern sich nur per Gesetz. Die Texte der bKV-Seite nennen sie mit.

**bKV-Beispieltarife** (`bkv/Seite.tsx`, `BEISPIELE`): Beiträge eines Budgettarifs mit „Stand MM/JJJJ“ in Kommentar und Text. Beim Versicherer prüfen; ändern sich unabhängig vom Jahreswechsel.

## 12. Beamtenbesoldung

`pension/besoldung-daten.ts`:
- `BELEGTE_TABELLEN` ist leer. Gerechnet wird mit einer gekennzeichneten Näherung (`belegt: false`).
- `VERIFIZIERTE_ECKWERTE` hält zwei amtliche Werte (A13 Bund 2026).
- Nach einer Besoldungsanpassung die Eckwerte prüfen.
- Amtliche Tabellen als reinen Daten-Commit eintragen: Bund über das Bundesbesoldungsgesetz und die Bekanntmachungen des BMI, Länder über die Landesbesoldungsgesetze.

## 13. Vorgaben und Annahmen

Keine Rechengrößen, sondern eigene Festlegungen:
- `store/standard.ts`: Inflation, Rentenanpassung, Fortschreibung des Tarifs, Gehaltsdynamik.
- Begründungen in `features/vorbelegung.ts` und im Kommentar von `packages/schema/src/szenario.ts`.

Einmal im Jahr überdenken, etwa nach dem Rentenversicherungsbericht im November. Ändern nur auf Wunsch des Nutzers.

## 14. Häufige Fehler

**Falscher Wert:**
- Versicherungspflichtgrenze statt BBG KV eintragen.
- Monat und Jahr verwechseln: BBG im Code als **Jahr**, Bezugsgröße als **Monat**.
- Prozent als Prozentzahl statt als Dezimalzahl eintragen (2.9 statt 0.029).
- Soli-Freigrenze als Einkommensgrenze lesen; sie ist ein Steuerbetrag.
- Rentenwert vom 1. Januar statt vom 1. Juli nehmen.

**Vergessen:**
- `BASISJAHR` nicht umsetzen: Die Fortschreibung startet dann weiter vom alten Jahr.
- `PARAMETER_<Jahr>` nicht in `packages/engine/src/index.ts` exportieren.
- Kassenliste ohne neuen `KASSEN_STAND`: Die Oberfläche nennt dann das alte Jahr über neuen Sätzen.

**Tests:**
- Testerwartungen an neue Ausgaben anpassen, ohne die Differenz zu erklären.
