-- Ihr Auftritt im Gutachten: Vor- und Nachname des Beraters getrennt.
--
-- WOZU. Das Formular fragt Vor- und Nachname in zwei Feldern ab. `berater`
-- bleibt der ganze Name: Briefkopf, Fusszeile, Unterschrift des Beraters und
-- die Live-Seite lesen nur ihn; die App schreibt ihn bei jeder Aenderung mit.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Hier
-- kommen nur zwei Spalten mit Vorgabe dazu; die Rechte gelten fuer die ganze
-- Tabelle, die Zeilenregeln bleiben. Die Live-Seite kennt die Spalten nicht
-- und schreibt weiter nur `berater`. Passen beide danach nicht mehr zu ihm,
-- teilt die App `berater` neu (apps/web/src/lib/namen.ts).

alter table public.berater_profil
  add column if not exists vorname  text not null default '' check (char_length(vorname)  <= 60),
  add column if not exists nachname text not null default '' check (char_length(nachname) <= 60);

comment on column public.berater_profil.vorname is
  'Vorname des Beraters. berater ist der ganze Name und bleibt massgeblich.';
comment on column public.berater_profil.nachname is
  'Nachname des Beraters. berater ist der ganze Name und bleibt massgeblich.';
