-- Nachweis: Agenturen mit ihren Firmenkunden (Migration 20261118120000_bav_agenturen).
-- B ist der Betreiber, V und W gehoeren zur Verwaltung, A1 und A2 zur Agentur
-- Nord, C zur Agentur Sued, N hat mit alledem nichts zu tun.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('b',   '10000000-0000-4000-8000-0000000a9001'),
  ('v',   '20000000-0000-4000-8000-0000000a9002'),
  ('w',   '30000000-0000-4000-8000-0000000a9003'),
  ('a1',  '40000000-0000-4000-8000-0000000a9004'),
  ('a2',  '50000000-0000-4000-8000-0000000a9005'),
  ('c',   '60000000-0000-4000-8000-0000000a9006'),
  ('n',   '70000000-0000-4000-8000-0000000a9007'),
  ('nord', 'a9a9a9a9-0000-4000-8000-0000000000a1'),
  ('sued', 'a9a9a9a9-0000-4000-8000-0000000000a2'),
  ('leer', 'a9a9a9a9-0000-4000-8000-0000000000a3'),
  ('f1',  'f1f1f1f1-0000-4000-8000-0000000a90f1'),
  ('f2',  'f2f2f2f2-0000-4000-8000-0000000a90f2'),
  ('f3',  'f3f3f3f3-0000-4000-8000-0000000a90f3'),
  ('f4',  'f4f4f4f4-0000-4000-8000-0000000a90f4'),
  ('fn',  'f5f5f5f5-0000-4000-8000-0000000a90f5'),
  ('fv',  'f6f6f6f6-0000-4000-8000-0000000a90f6'),
  ('fs',  'f7f7f7f7-0000-4000-8000-0000000a90f7'),
  ('b1',  'b1b1b1b1-0000-4000-8000-0000000a90b1'),
  ('b2',  'b2b2b2b2-0000-4000-8000-0000000a90b2'),
  ('b3',  'b3b3b3b3-0000-4000-8000-0000000a90b3'),
  ('kb',  'c1c1c1c1-0000-4000-8000-0000000a90c1'),
  ('fx',  'f8f8f8f8-0000-4000-8000-0000000a90f8'),
  ('bx',  'b4b4b4b4-0000-4000-8000-0000000a90b4'),
  ('by',  'b5b5b5b5-0000-4000-8000-0000000a90b5');

-- Alle Konten sind alt genug, dass keine Testphase mehr laeuft.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-agentur@test.invalid', 'x',
       now() - interval '90 days', now()
  from ids where name in ('b', 'v', 'w', 'a1', 'a2', 'c', 'n');
insert into privat.freizugaenge (nutzer, grund) values ((select id from ids where name = 'b'), 'betreiber');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;
create temp table merk(name text primary key, wert text) on commit drop;
grant all on merk to anon, authenticated, service_role;

-- ---------- Die Verwaltung benennen: nur der Betreiber ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into ergebnis
select 1, 'N benennt die Verwaltung nicht', 'kein_betreiber / 0 Zeilen',
       format('%s / %s Zeilen', public.bav_verwalter_benennen('v-agentur@test.invalid'), (select count(*) from public.bav_verwalter())),
       public.bav_verwalter_benennen('v-agentur@test.invalid') = 'kein_betreiber' and (select count(*) from public.bav_verwalter()) = 0;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000a9001"}';
-- Erst benennen, dann zaehlen: In derselben Abfrage saehe die Zaehlung noch den Stand davor.
insert into merk values
  ('v', public.bav_verwalter_benennen('  V-Agentur@test.invalid ')),
  ('w', public.bav_verwalter_benennen('w-agentur@test.invalid')),
  ('u', public.bav_verwalter_benennen('niemand@test.invalid'));
insert into ergebnis
select 2, 'Betreiber benennt V und W; unbekannte Adresse', 'ok / ok / unbekannt / 2',
       format('%s / %s / %s / %s', (select wert from merk where name = 'v'), (select wert from merk where name = 'w'),
              (select wert from merk where name = 'u'), (select count(*) from public.bav_verwalter())),
       (select wert from merk where name = 'v') = 'ok' and (select wert from merk where name = 'w') = 'ok'
       and (select wert from merk where name = 'u') = 'unbekannt' and (select count(*) from public.bav_verwalter()) = 2;

insert into ergebnis
select 3, 'Betreiber gehoert selbst zur Verwaltung', 'true', public.bav_ist_verwalter()::text, public.bav_ist_verwalter();

-- ---------- Agenturen anlegen: nur die Verwaltung ----------
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
do $$
begin
  insert into public.bav_agenturen (name) values ('Von N');
  insert into ergebnis values (4, 'N legt keine Agentur an', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (4, 'N legt keine Agentur an', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into public.bav_agenturen (id, name, daten) values
  ((select id from ids where name = 'nord'), 'Agentur Nord', '{"organisationsnummer":"4711"}'),
  ((select id from ids where name = 'sued'), 'Agentur Sued', '{}'),
  ((select id from ids where name = 'leer'), 'Agentur Leer', '{}');
insert into ergebnis
select 5, 'V legt drei Agenturen an, als sich selbst', '3 / v', format('%s / %s', count(*), min((select name from ids where id = erstellt_von))),
       count(*) = 3 and bool_and(erstellt_von = (select id from ids where name = 'v'))
  from public.bav_agenturen;

-- ---------- Einladungen ----------
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into ergebnis
select 6, 'N sieht keine Agentur und erzeugt keinen Link', '0 / null',
       format('%s / %s', (select count(*) from public.bav_agenturen), coalesce(x.t::text, 'null')),
       (select count(*) from public.bav_agenturen) = 0 and x.t is null
  from (select public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord')) as t) x;

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into merk values
  ('link1', public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'))::text),
  ('link2', public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'))::text),
  ('link3', public.bav_agentur_einladung_erstellen((select id from ids where name = 'sued'))::text),
  ('link4', public.bav_agentur_einladung_erstellen((select id from ids where name = 'sued'))::text),
  ('alt',   public.bav_agentur_einladung_erstellen((select id from ids where name = 'sued'))::text),
  ('weg',   public.bav_agentur_einladung_erstellen((select id from ids where name = 'leer'))::text);
insert into ergebnis
select 7, 'V erzeugt Links; einer laesst sich zurueckziehen', '2 offen in Nord / zurueckgezogen',
       format('%s offen in Nord / %s', (select count(*) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))),
              case when x.ok then 'zurueckgezogen' else 'NICHT' end),
       (select count(*) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))) = 2 and x.ok
  from (select public.bav_agentur_einladung_zurueckziehen((select wert from merk where name = 'weg')::uuid) as ok) x;

reset role;
update privat.bav_agentur_einladungen set gueltig_bis = now() - interval '1 day'
 where token = (select wert from merk where name = 'alt')::uuid;
set local role authenticated;

set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000a9004"}';
insert into ergebnis
select 8, 'A1 sieht, wohin der Link fuehrt', 'offen / Agentur Nord', format('%s / %s', x.j ->> 'stand', x.j ->> 'agentur'),
       x.j ->> 'stand' = 'offen' and x.j ->> 'agentur' = 'Agentur Nord'
  from (select public.bav_agentur_einladung_ansehen((select wert from merk where name = 'link1')::uuid) as j) x;
insert into ergebnis
select 9, 'A1 nimmt an; ein zweites Mal aendert nichts', 'ok / ok',
       format('%s / %s', x.a, public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link1')::uuid)),
       x.a = 'ok' and public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link1')::uuid) = 'ok'
  from (select public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link1')::uuid) as a) x;
insert into ergebnis
select 10, 'A1 gehoert schon zu Nord: der Link nach Sued gilt nicht', 'andere_agentur',
       public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link3')::uuid),
       public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link3')::uuid) = 'andere_agentur';

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
insert into ergebnis
select 11, 'A2: eingeloester, abgelaufener, erfundener Link — dann der richtige', 'eingeloest / abgelaufen / ungueltig / ok',
       format('%s / %s / %s / %s', x.e, x.a, x.u, x.o),
       x.e = 'eingeloest' and x.a = 'abgelaufen' and x.u = 'ungueltig' and x.o = 'ok'
  from (select public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link1')::uuid) as e,
               public.bav_agentur_einladung_annehmen((select wert from merk where name = 'alt')::uuid) as a,
               public.bav_agentur_einladung_annehmen('00000000-0000-4000-8000-000000000000') as u,
               public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link2')::uuid) as o) x;

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 12, 'C nimmt den Link nach Sued an', 'ok', x.o, x.o = 'ok'
  from (select public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link3')::uuid) as o) x;

set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
insert into ergebnis
select 13, 'Die Verwaltung wird nicht Mitglied einer Agentur', 'verwaltung', x.o, x.o = 'verwaltung'
  from (select public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link4')::uuid) as o) x;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000a9001"}';
insert into ergebnis
select 14, 'Ein Konto einer Agentur wird nicht Verwaltung', 'agentur', x.o, x.o = 'agentur'
  from (select public.bav_verwalter_benennen('a1-agentur@test.invalid') as o) x;

-- ---------- Zugang vor dem Start der Abo-Pflicht ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000a9004"}';
insert into ergebnis
select 15, 'Vor dem Start: A1 hat nur die Arbeitgeber-Seiten', 'ag / agentur / Agentur Nord / rente=false / ag=true',
       format('%s / %s / %s / rente=%s / ag=%s', z ->> 'paket', z ->> 'quelle', z ->> 'agentur_name', public.hat_paket('rente'), public.hat_paket('ag')),
       z ->> 'paket' = 'ag' and z ->> 'quelle' = 'agentur' and z ->> 'agentur_name' = 'Agentur Nord'
       and (z ->> 'agentur')::uuid = (select id from ids where name = 'nord')
       and not public.hat_paket('rente') and public.hat_paket('ag') and (z ->> 'verwalter')::boolean = false
  from (select public.mein_zugang() as z) x;

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into ergebnis
select 16, 'Vor dem Start: N wie bisher', 'alles / vorab / keine Agentur / keine Verwaltung',
       format('%s / %s / %s / %s', z ->> 'paket', z ->> 'quelle', coalesce(z ->> 'agentur', 'keine Agentur'),
              case when (z ->> 'verwalter')::boolean then 'VERWALTUNG' else 'keine Verwaltung' end),
       z ->> 'paket' = 'alles' and z ->> 'quelle' = 'vorab' and z ->> 'agentur' is null and not (z ->> 'verwalter')::boolean
  from (select public.mein_zugang() as z) x;

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into ergebnis
select 17, 'Vor dem Start: V wie bisher, als Verwaltung gekennzeichnet', 'alles / vorab / true',
       format('%s / %s / %s', z ->> 'paket', z ->> 'quelle', z ->> 'verwalter'),
       z ->> 'paket' = 'alles' and z ->> 'quelle' = 'vorab' and (z ->> 'verwalter')::boolean
  from (select public.mein_zugang() as z) x;

-- ---------- Firmen ----------
-- N hat eine eigene Firma — wie bisher, ohne Agentur.
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'fn'), 'Privat von N');
do $$
begin
  insert into public.bav_firmen (name, agentur) values ('N in Nord', (select id from ids where name = 'nord'));
  insert into ergebnis values (18, 'N legt keine Firma in einer Agentur an', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (18, 'N legt keine Firma in einer Agentur an', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- V legt in Nord an; eine eigene Firma ohne Agentur hat V auch.
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into public.bav_firmen (id, name, agentur) values
  ((select id from ids where name = 'f1'), 'Nord Eins GmbH', (select id from ids where name = 'nord')),
  ((select id from ids where name = 'fs'), 'Sued Eins GmbH', (select id from ids where name = 'sued'));
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'fv'), 'Privat von V');

-- A1 legt an, ohne die Agentur zu nennen — und versucht es in der fremden.
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000a9004"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f2'), 'Nord Zwei KG');
insert into public.bav_firmen (id, name, agentur) values
  ((select id from ids where name = 'f4'), 'Nord Vier OHG', (select id from ids where name = 'sued'));
insert into ergebnis
select 19, 'Firmen eines Mitglieds liegen in seiner Agentur — auch wenn es eine andere nennt', 'nord / nord',
       format('%s / %s', (select name from ids where id = (select agentur from public.bav_firmen where id = (select id from ids where name = 'f2'))),
              (select name from ids where id = (select agentur from public.bav_firmen where id = (select id from ids where name = 'f4')))),
       (select agentur from public.bav_firmen where id = (select id from ids where name = 'f2')) = (select id from ids where name = 'nord')
       and (select agentur from public.bav_firmen where id = (select id from ids where name = 'f4')) = (select id from ids where name = 'nord');

insert into ergebnis
select 20, 'A1 sieht die Firmen von Nord — nicht Sued, nicht die privaten', 'Nord Eins GmbH, Nord Vier OHG, Nord Zwei KG',
       string_agg(name, ', ' order by name), string_agg(name, ', ' order by name) = 'Nord Eins GmbH, Nord Vier OHG, Nord Zwei KG'
  from public.bav_firmen;

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
insert into ergebnis
select 21, 'A2 (Kollege in Nord) sieht dieselben drei', '3', count(*)::text, count(*) = 3 from public.bav_firmen;

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 22, 'C (Agentur Sued) sieht nur Sued', 'Sued Eins GmbH', coalesce(string_agg(name, ', ' order by name), '—'),
       coalesce(string_agg(name, ', ' order by name), '') = 'Sued Eins GmbH'
  from public.bav_firmen;

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into ergebnis
select 23, 'N sieht nur die eigene Firma', 'Privat von N', coalesce(string_agg(name, ', ' order by name), '—'),
       coalesce(string_agg(name, ', ' order by name), '') = 'Privat von N'
  from public.bav_firmen;

set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
insert into ergebnis
select 24, 'W (Verwaltung) sieht alle Firmen der Agenturen — keine private', '4 Agentur-Firmen / 0 private',
       format('%s Agentur-Firmen / %s private', count(*) filter (where agentur is not null), count(*) filter (where agentur is null)),
       count(*) filter (where agentur is not null) = 4 and count(*) filter (where agentur is null) = 0
  from public.bav_firmen;

-- ---------- Aendern ----------
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
update public.bav_firmen set angebot = '{"versicherer":"AXA"}', agentur = (select id from ids where name = 'sued'),
       besitzer = (select id from ids where name = 'a2')
 where id = (select id from ids where name = 'f1');
insert into ergebnis
select 25, 'A2 aendert das Angebot der Firma von V; Besitzer und Agentur bleiben', 'AXA / v / nord',
       format('%s / %s / %s', angebot ->> 'versicherer', (select name from ids where id = besitzer), (select name from ids where id = agentur)),
       angebot ->> 'versicherer' = 'AXA' and besitzer = (select id from ids where name = 'v') and agentur = (select id from ids where name = 'nord')
  from public.bav_firmen where id = (select id from ids where name = 'f1');

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
with x as (update public.bav_firmen set name = 'gekapert' where id = (select id from ids where name = 'f1') returning 1)
insert into ergebnis select 26, 'C aendert in Nord nichts', '0 Zeilen', format('%s Zeilen', count(*)), count(*) = 0 from x;

-- Die Verwaltung ordnet eine eigene Firma einer Agentur zu.
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
update public.bav_firmen set agentur = (select id from ids where name = 'nord') where id = (select id from ids where name = 'fv');
insert into ergebnis
select 27, 'V ordnet die eigene Firma Nord zu', 'nord', coalesce((select name from ids where id = agentur), 'null'),
       agentur = (select id from ids where name = 'nord')
  from public.bav_firmen where id = (select id from ids where name = 'fv');

-- ---------- Beratungen folgen der Firma ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000a9004"}';
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'b1'), (select id from ids where name = 'f1'), 'Bea Eins', 'teilnahme', '{"schritt":3}'),
  ((select id from ids where name = 'b2'), (select id from ids where name = 'f2'), 'Ben Zwei', 'offen', '{"schritt":1}');

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
with x as (update public.bav_beratungen set status = 'verzicht' where id = (select id from ids where name = 'b1') returning 1),
     y as (delete from public.bav_beratungen where id = (select id from ids where name = 'b1') returning 1)
insert into ergebnis
select 28, 'A2 bearbeitet die Beratung des Kollegen, loescht sie aber nicht', '1 geaendert / 0 geloescht',
       format('%s geaendert / %s geloescht', (select count(*) from x), (select count(*) from y)),
       (select count(*) from x) = 1 and (select count(*) from y) = 0;

set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
insert into ergebnis
select 29, 'W (Verwaltung) sieht die Beratungen in Nord', '2', count(*)::text, count(*) = 2 from public.bav_beratungen;

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 30, 'C sieht keine Beratung aus Nord', '0', count(*)::text, count(*) = 0 from public.bav_beratungen;

-- ---------- Logo: hochladen darf, wer die Firma aendern darf ----------
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
insert into ergebnis
select 31, 'A2 darf ein Logo fuer die Firma von V hochladen', 'true',
       public.bav_logo_pfad_erlaubt('50000000-0000-4000-8000-0000000a9005/f1f1f1f1-0000-4000-8000-0000000a90f1-0123456789abcdef01234567.png')::text,
       public.bav_logo_pfad_erlaubt('50000000-0000-4000-8000-0000000a9005/f1f1f1f1-0000-4000-8000-0000000a90f1-0123456789abcdef01234567.png');
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 32, 'C darf es nicht', 'false',
       public.bav_logo_pfad_erlaubt('60000000-0000-4000-8000-0000000a9006/f1f1f1f1-0000-4000-8000-0000000a90f1-0123456789abcdef01234567.png')::text,
       not public.bav_logo_pfad_erlaubt('60000000-0000-4000-8000-0000000a9006/f1f1f1f1-0000-4000-8000-0000000a90f1-0123456789abcdef01234567.png');

-- ---------- Zugaenge einer Agentur ----------
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into ergebnis
select 33, 'V sieht die Zugaenge von Nord und den Stand', 'a1-agentur@test.invalid, a2-agentur@test.invalid / 2 Zugaenge, 0 Links',
       format('%s / %s Zugaenge, %s Links', (select string_agg(email, ', ' order by email) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))),
              s.zugaenge, s.einladungen),
       (select string_agg(email, ', ' order by email) from public.bav_agentur_mitglieder((select id from ids where name = 'nord')))
         = 'a1-agentur@test.invalid, a2-agentur@test.invalid'
       and s.zugaenge = 2 and s.einladungen = 0
  from public.bav_agenturen_stand() s where s.agentur = (select id from ids where name = 'nord');

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 34, 'C sieht die Zugaenge von Nord nicht, den Stand auch nicht — nur die eigene Agentur', '0 / 0 / Agentur Sued',
       format('%s / %s / %s', (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))),
              (select count(*) from public.bav_agenturen_stand()), (select string_agg(name, ', ') from public.bav_agenturen)),
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) = 0
       and (select count(*) from public.bav_agenturen_stand()) = 0
       and (select string_agg(name, ', ') from public.bav_agenturen) = 'Agentur Sued';
with x as (update public.bav_agenturen set name = 'umbenannt' returning 1)
insert into ergebnis select 35, 'C aendert die eigene Agentur nicht', '0 Zeilen', format('%s Zeilen', count(*)), count(*) = 0 from x;

-- ---------- Loeschen ----------
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
with x as (delete from public.bav_firmen where id = (select id from ids where name = 'f1') returning 1)
insert into ergebnis select 36, 'A2 loescht die Firma von V nicht', '0 Zeilen', format('%s Zeilen', count(*)), count(*) = 0 from x;

set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
with x as (delete from public.bav_firmen where id = (select id from ids where name = 'f4') returning 1)
insert into ergebnis select 37, 'W (Verwaltung) loescht eine Firma der Agentur', '1 Zeile', format('%s Zeile', count(*)), count(*) = 1 from x;
do $$
begin
  delete from public.bav_agenturen where id = (select id from ids where name = 'nord');
  insert into ergebnis values (38, 'Eine Agentur mit Firmen laesst sich nicht loeschen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (38, 'Eine Agentur mit Firmen laesst sich nicht loeschen', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;
with x as (delete from public.bav_agenturen where id = (select id from ids where name = 'leer') returning 1)
insert into ergebnis select 39, 'Eine leere Agentur schon', '1 Zeile', format('%s Zeile', count(*)), count(*) = 1 from x;

-- ---------- Ein Zugang wird entfernt: Firmen und Beratungen bleiben ----------
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into merk values ('a1weg', public.bav_agentur_mitglied_entfernen((select id from ids where name = 'a1'))::text);
insert into ergebnis
select 40, 'V entfernt A1: Firma und Beratungen gehen an V', 'true / f2 gehoert v / b1 und b2 gehoeren v',
       format('%s / f2 gehoert %s / b1 und b2 gehoeren %s', (select wert from merk where name = 'a1weg'),
              (select name from ids where id = (select besitzer from public.bav_firmen where id = (select id from ids where name = 'f2'))),
              (select string_agg(distinct (select name from ids where id = b.besitzer), ',') from public.bav_beratungen b)),
       (select wert from merk where name = 'a1weg') = 'true'
       and (select besitzer from public.bav_firmen where id = (select id from ids where name = 'f2')) = (select id from ids where name = 'v')
       and (select bool_and(b.besitzer = (select id from ids where name = 'v')) from public.bav_beratungen b);

set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000a9004"}';
insert into ergebnis
select 41, 'A1 sieht danach nichts mehr und ist ohne Agentur wie jeder andere', '0 Firmen / 0 Agenturen / alles / vorab',
       format('%s Firmen / %s Agenturen / %s / %s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_agenturen),
              z ->> 'paket', z ->> 'quelle'),
       (select count(*) from public.bav_firmen) = 0 and (select count(*) from public.bav_agenturen) = 0
       and z ->> 'paket' = 'alles' and z ->> 'quelle' = 'vorab' and z ->> 'agentur' is null
  from (select public.mein_zugang() as z) x;

-- Der alte Link bringt A1 nicht zurueck: Er ist verbraucht.
insert into merk values ('a1wieder', public.bav_agentur_einladung_annehmen((select wert from merk where name = 'link1')::uuid));
insert into ergebnis
select 55, 'A1 kommt mit dem alten Link nicht zurueck in die Agentur', 'eingeloest / keine Agentur',
       format('%s / %s', (select wert from merk where name = 'a1wieder'), coalesce(public.bav_meine_agentur()::text, 'keine Agentur')),
       (select wert from merk where name = 'a1wieder') = 'eingeloest' and public.bav_meine_agentur() is null;

-- ---------- Ein Konto der Agentur wird geloescht ----------
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000a9005"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f3'), 'Nord Drei AG');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'b3'), (select id from ids where name = 'f3'), 'Cem Drei', 'offen', '{"schritt":1}');
reset role;
delete from auth.users where id = (select id from ids where name = 'a2');
insert into ergebnis
select 42, 'A2 loescht sein Konto: Firma und Beratung bleiben und gehen an V (hat Nord angelegt)', 'v / v',
       format('%s / %s', coalesce((select name from ids where id = f.besitzer), 'WEG'),
              coalesce((select name from ids where id = (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'b3'))), 'WEG')),
       f.besitzer = (select id from ids where name = 'v')
       and (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'b3')) = (select id from ids where name = 'v')
  from (select 1) eins left join public.bav_firmen f on f.id = (select id from ids where name = 'f3');

-- ---------- Ein Konto der Verwaltung geht ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000a9001"}';
insert into merk values ('vweg', public.bav_verwalter_entfernen((select id from ids where name = 'v'))::text);
insert into ergebnis
select 43, 'Betreiber entfernt V aus der Verwaltung: dessen Agentur-Firmen gehen an den Betreiber', 'true / b',
       format('%s / %s', (select wert from merk where name = 'vweg'),
              (select string_agg(distinct (select name from ids where id = f.besitzer), ',') from public.bav_firmen f where f.agentur is not null)),
       (select wert from merk where name = 'vweg') = 'true'
       and (select bool_and(f.besitzer = (select id from ids where name = 'b')) from public.bav_firmen f where f.agentur is not null);

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000a9002"}';
insert into ergebnis
select 44, 'V sieht danach keine Agentur und keine Firma mehr', '0 / 0',
       format('%s / %s', (select count(*) from public.bav_agenturen), (select count(*) from public.bav_firmen)),
       (select count(*) from public.bav_agenturen) = 0 and (select count(*) from public.bav_firmen) = 0;

reset role;
delete from auth.users where id = (select id from ids where name = 'b');
insert into ergebnis
select 45, 'Auch der Betreiber geht: die Firmen bleiben und gehen an W', '5 Firmen / w',
       format('%s Firmen / %s', count(*), string_agg(distinct (select name from ids where id = f.besitzer), ',')),
       count(*) = 5 and bool_and(f.besitzer = (select id from ids where name = 'w'))
  from public.bav_firmen f where f.agentur is not null;

-- ---------- Zugang nach dem Start der Abo-Pflicht ----------
-- Mit 14 Testtagen, nur in dieser Transaktion: Die Testphase ist dann sicher vorbei.
update privat.einstellungen set abo_pflicht_ab = now() - interval '30 days', testtage = 14;
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 46, 'Nach dem Start: C (Agentur) hat weiter die Arbeitgeber-Seiten, ohne Abo', 'ag / agentur',
       format('%s / %s', z ->> 'paket', z ->> 'quelle'), z ->> 'paket' = 'ag' and z ->> 'quelle' = 'agentur'
  from (select public.mein_zugang() as z) x;
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
insert into ergebnis
select 47, 'Nach dem Start: W (Verwaltung) hat mindestens die Arbeitgeber-Seiten', 'ag / verwaltung',
       format('%s / %s', z ->> 'paket', z ->> 'quelle'), z ->> 'paket' = 'ag' and z ->> 'quelle' = 'verwaltung'
  from (select public.mein_zugang() as z) x;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000a9007"}';
insert into ergebnis
select 48, 'Nach dem Start: N ohne Paket — wie bisher', 'null', coalesce(z ->> 'paket', 'null'), z ->> 'paket' is null
  from (select public.mein_zugang() as z) x;

-- C bucht selbst das Paket Rente: dann beides.
reset role;
insert into privat.bueros (id, name, inhaber) values ((select id from ids where name = 'kb'), 'Buero C', (select id from ids where name = 'c'));
insert into privat.abos (buero, paket, intervall, plaetze, status) values ((select id from ids where name = 'kb'), 'rente', 'monat', 1, 'active');
insert into privat.buero_mitglieder (buero, nutzer, rolle) values ((select id from ids where name = 'kb'), (select id from ids where name = 'c'), 'inhaber');
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 49, 'C mit eigenem Abo Rente: Rechner und Arbeitgeber-Seiten', 'alles / abo',
       format('%s / %s', z ->> 'paket', z ->> 'quelle'), z ->> 'paket' = 'alles' and z ->> 'quelle' = 'abo'
  from (select public.mein_zugang() as z) x;

-- ---------- Eine Firma wechselt die Agentur ----------
-- C (Agentur Sued) legt eine Firma mit einer Beratung an und beraet in einer Firma der Verwaltung mit.
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'fx'), 'Sued Zwei GmbH');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'bx'), (select id from ids where name = 'fx'), 'Dora Zwei', 'offen', '{"schritt":1}'),
  ((select id from ids where name = 'by'), (select id from ids where name = 'fs'), 'Emil Eins', 'offen', '{"schritt":1}');
-- C selbst verschiebt nichts.
update public.bav_firmen set agentur = (select id from ids where name = 'nord') where id = (select id from ids where name = 'fx');
insert into ergebnis
select 51, 'C verschiebt die eigene Firma nicht in eine andere Agentur', 'sued / c',
       format('%s / %s', (select name from ids where id = f.agentur), (select name from ids where id = f.besitzer)),
       f.agentur = (select id from ids where name = 'sued') and f.besitzer = (select id from ids where name = 'c')
  from public.bav_firmen f where f.id = (select id from ids where name = 'fx');

-- W (Verwaltung) verschiebt beide Firmen nach Nord.
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
update public.bav_firmen set agentur = (select id from ids where name = 'nord')
 where id in ((select id from ids where name = 'fx'), (select id from ids where name = 'fs'));
reset role;
insert into ergebnis
select 52, 'W verschiebt nach Nord: die Firma von C und seine Beratungen gehen an W', 'nord / w / bx w / by w',
       format('%s / %s / bx %s / by %s', (select name from ids where id = f.agentur), (select name from ids where id = f.besitzer),
              (select name from ids where id = (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'bx'))),
              (select name from ids where id = (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'by')))),
       f.agentur = (select id from ids where name = 'nord') and f.besitzer = (select id from ids where name = 'w')
       and (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'bx')) = (select id from ids where name = 'w')
       and (select b.besitzer from public.bav_beratungen b where b.id = (select id from ids where name = 'by')) = (select id from ids where name = 'w')
  from public.bav_firmen f where f.id = (select id from ids where name = 'fx');

set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000a9006"}';
insert into ergebnis
select 53, 'C sieht die verschobenen Firmen und ihre Beratungen nicht mehr', '0 / 0',
       format('%s / %s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_beratungen)),
       (select count(*) from public.bav_firmen) = 0 and (select count(*) from public.bav_beratungen) = 0;

-- W nimmt eine Firma aus der Agentur: Sie bleibt bei W, ohne Agentur.
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-0000000a9003"}';
update public.bav_firmen set agentur = null where id = (select id from ids where name = 'fx');
insert into ergebnis
select 54, 'W nimmt die Firma aus der Agentur: ohne Agentur, weiter bei W', 'null / w',
       format('%s / %s', coalesce((select name from ids where id = f.agentur), 'null'), (select name from ids where id = f.besitzer)),
       f.agentur is null and f.besitzer = (select id from ids where name = 'w')
  from public.bav_firmen f where f.id = (select id from ids where name = 'fx');

-- ---------- Rechte an den Funktionen ----------
reset role;
insert into ergebnis
select 50, 'Funktionen: nichts fuer anon, die internen fuer niemanden', 'keine Luecke',
       coalesce(nullif(concat_ws(', ',
         case when has_function_privilege('anon', 'public.bav_ist_verwalter()', 'execute') then 'anon ist_verwalter' end,
         case when has_function_privilege('anon', 'public.bav_agentur_einladung_annehmen(uuid)', 'execute') then 'anon annehmen' end,
         case when has_function_privilege('anon', 'public.bav_verwalter_benennen(text)', 'execute') then 'anon benennen' end,
         case when has_function_privilege('anon', 'public.bav_agenturen_stand()', 'execute') then 'anon stand' end,
         case when has_table_privilege('anon', 'public.bav_agenturen', 'select') then 'anon agenturen' end,
         case when has_table_privilege('authenticated', 'privat.bav_verwalter', 'select') then 'authenticated verwalter' end,
         case when has_table_privilege('authenticated', 'privat.bav_agentur_mitglieder', 'select') then 'authenticated mitglieder' end,
         case when has_function_privilege('authenticated', 'privat.bav_agentur_firmen_abgeben(uuid, uuid)', 'execute') then 'authenticated abgeben' end,
         case when has_function_privilege('authenticated', 'privat.bav_agentur_empfaenger(uuid, uuid)', 'execute') then 'authenticated empfaenger' end,
         case when has_function_privilege('authenticated', 'privat.bav_firma_agentur_gewechselt()', 'execute') then 'authenticated gewechselt' end,
         case when not has_function_privilege('authenticated', 'public.bav_agentur_einladung_annehmen(uuid)', 'execute') then 'authenticated OHNE annehmen' end), ''), 'keine Luecke'),
       not has_function_privilege('anon', 'public.bav_ist_verwalter()', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_einladung_annehmen(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.bav_verwalter_benennen(text)', 'execute')
       and not has_function_privilege('anon', 'public.bav_agenturen_stand()', 'execute')
       and not has_table_privilege('anon', 'public.bav_agenturen', 'select')
       and not has_table_privilege('authenticated', 'privat.bav_verwalter', 'select')
       and not has_table_privilege('authenticated', 'privat.bav_agentur_mitglieder', 'select')
       and not has_function_privilege('authenticated', 'privat.bav_agentur_firmen_abgeben(uuid, uuid)', 'execute')
       and not has_function_privilege('authenticated', 'privat.bav_agentur_empfaenger(uuid, uuid)', 'execute')
       and not has_function_privilege('authenticated', 'privat.bav_firma_agentur_gewechselt()', 'execute')
       and has_function_privilege('authenticated', 'public.bav_agentur_einladung_annehmen(uuid)', 'execute');

select nr, bestanden, pruefung, tatsaechlich from ergebnis order by nr;

rollback;
