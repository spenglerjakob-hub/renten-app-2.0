-- Testphase 30 statt 14 Tage.
--
-- Die Laenge steht an zwei Stellen, die zusammenpassen muessen: hier
-- (`privat.einstellungen.testtage` — danach rechnet `mein_zugang`) und in
-- `packages/schema/src/preise.ts` (`TESTTAGE` — das nennen Preisseite und
-- Nutzungsbedingungen).
--
-- Gefahrlos vor dem Livegang der Seite: Wer noch "14 Tage" liest, bekommt
-- mehr als versprochen, nie weniger. Vor dem Start des Abos laeuft ohnehin
-- keine Testphase ab.

alter table privat.einstellungen alter column testtage set default 30;

-- Nur, wenn noch die alte Vorgabe steht — eine bewusst andere Zahl bleibt.
update privat.einstellungen set testtage = 30 where id and testtage = 14;
