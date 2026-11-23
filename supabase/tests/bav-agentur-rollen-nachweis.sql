-- Nachweis: Adminrechte und Auftritt der Agentur (Migration 20261119120000_bav_agentur_rollen).
-- B ist der Betreiber, V gehoert zur Verwaltung. A1 kommt mit einem
-- Admin-Link in die Agentur Nord, A2 mit einem gewoehnlichen. C ist Admin der
-- Agentur Sued, N hat mit alledem nichts zu tun.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('b',    '10000000-0000-4000-8000-0000000b9001'),
  ('v',    '20000000-0000-4000-8000-0000000b9002'),
  ('a1',   '40000000-0000-4000-8000-0000000b9004'),
  ('a2',   '50000000-0000-4000-8000-0000000b9005'),
  ('c',    '60000000-0000-4000-8000-0000000b9006'),
  ('n',    '70000000-0000-4000-8000-0000000b9007'),
  ('nord', 'b9b9b9b9-0000-4000-8000-0000000000a1'),
  ('sued', 'b9b9b9b9-0000-4000-8000-0000000000a2'),
  ('f1',   'f1f1f1f1-0000-4000-8000-0000000b90f1');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-rollen@test.invalid', 'x',
       now() - interval '90 days', now()
  from ids where name in ('b', 'v', 'a1', 'a2', 'c', 'n');
insert into privat.freizugaenge (nutzer, grund) values ((select id from ids where name = 'b'), 'betreiber');
insert into privat.bav_verwalter (nutzer) values ((select id from ids where name = 'v'));

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;
create temp table merk(name text primary key, wert text) on commit drop;
grant all on merk to anon, authenticated, service_role;

-- ---------- Einladungen mit Rolle: nur die Verwaltung ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000b9002"}';
insert into public.bav_agenturen (id, name, daten) values
  ((select id from ids where name = 'nord'), 'Agentur Nord', '{"organisationsnummer":"4711"}'),
  ((select id from ids where name = 'sued'), 'Agentur Sued', '{}');
insert into merk values
  ('admin',    public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'), 'admin')::text),
  ('mitglied', public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'))::text),
  ('sued',     public.bav_agentur_einladung_erstellen((select id from ids where name = 'sued'), 'admin')::text),
  ('unsinn',   coalesce(public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'), 'chef')::text, 'null'));
insert into ergebnis
select 1, 'V erstellt Einladungen mit Rolle; ohne Angabe ein Mitglied; eine unbekannte Rolle gibt es nicht',
       'admin, mitglied / null',
       format('%s / %s', (select string_agg(rolle, ', ' order by rolle) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))),
              (select wert from merk where name = 'unsinn')),
       (select string_agg(rolle, ', ' order by rolle) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))) = 'admin, mitglied'
       and (select wert from merk where name = 'unsinn') = 'null';

-- ---------- Einloesen: Der Zugang bekommt die Rolle der Einladung ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
insert into merk values ('a1', public.bav_agentur_einladung_annehmen((select wert from merk where name = 'admin')::uuid));
insert into ergebnis
select 2, 'A1 loest den Admin-Link ein: Admin der Agentur Nord', 'ok / admin / nord',
       format('%s / %s / %s', (select wert from merk where name = 'a1'), x.z ->> 'agentur_rolle',
              (select name from ids where id = public.bav_agentur_admin())),
       (select wert from merk where name = 'a1') = 'ok' and x.z ->> 'agentur_rolle' = 'admin'
       and x.z ->> 'paket' = 'ag' and public.bav_agentur_admin() = (select id from ids where name = 'nord')
  from (select public.mein_zugang() as z) x;

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
insert into merk values ('a2', public.bav_agentur_einladung_annehmen((select wert from merk where name = 'mitglied')::uuid));
insert into ergebnis
select 3, 'A2 loest den gewoehnlichen Link ein: Mitglied, kein Admin', 'ok / mitglied / null',
       format('%s / %s / %s', (select wert from merk where name = 'a2'), x.z ->> 'agentur_rolle', coalesce(public.bav_agentur_admin()::text, 'null')),
       (select wert from merk where name = 'a2') = 'ok' and x.z ->> 'agentur_rolle' = 'mitglied' and public.bav_agentur_admin() is null
  from (select public.mein_zugang() as z) x;

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000b9006"}';
insert into merk values ('c', public.bav_agentur_einladung_annehmen((select wert from merk where name = 'sued')::uuid));

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000b9007"}';
insert into ergebnis
select 4, 'N hat keine Rolle', 'null / null', format('%s / %s', coalesce(x.z ->> 'agentur_rolle', 'null'), coalesce(public.bav_agentur_admin()::text, 'null')),
       x.z ->> 'agentur_rolle' is null and public.bav_agentur_admin() is null
  from (select public.mein_zugang() as z) x;

-- ---------- Die Agentur aendern: Verwaltung und Admins ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
with x as (
  update public.bav_agenturen
     set name = 'Agentur Nord GmbH', daten = daten || '{"telefon":"040 123","farbe":"#1e3a8a","web":"www.nord.example"}'::jsonb
   where id = (select id from ids where name = 'nord') returning name, daten)
insert into ergebnis
select 5, 'A1 aendert Angaben und Auftritt der eigenen Agentur', '1 Zeile / Agentur Nord GmbH / #1e3a8a / 4711',
       format('%s Zeile / %s / %s / %s', count(*), min(name), min(daten ->> 'farbe'), min(daten ->> 'organisationsnummer')),
       count(*) = 1 and min(name) = 'Agentur Nord GmbH' and min(daten ->> 'farbe') = '#1e3a8a' and min(daten ->> 'organisationsnummer') = '4711'
  from x;

with x as (update public.bav_agenturen set name = 'gekapert' where id = (select id from ids where name = 'sued') returning 1)
insert into ergebnis select 6, 'A1 aendert eine fremde Agentur nicht', '0 Zeilen', format('%s Zeilen', count(*)), count(*) = 0 from x;

with x as (delete from public.bav_agenturen where id = (select id from ids where name = 'nord') returning 1)
insert into ergebnis select 7, 'A1 loescht die eigene Agentur nicht', '0 Zeilen', format('%s Zeilen', count(*)), count(*) = 0 from x;

do $$
begin
  insert into public.bav_agenturen (name) values ('Von A1');
  insert into ergebnis values (8, 'A1 legt keine Agentur an', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (8, 'A1 legt keine Agentur an', 'abgewiesen', 'abgewiesen', true);
end $$;

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
with x as (update public.bav_agenturen set name = 'vom Mitglied' where id = (select id from ids where name = 'nord') returning 1)
insert into ergebnis select 9, 'A2 (Mitglied) aendert die Agentur nicht, liest sie aber', '0 Zeilen / Agentur Nord GmbH',
       format('%s Zeilen / %s', count(*), (select string_agg(name, ', ') from public.bav_agenturen)),
       count(*) = 0 and (select string_agg(name, ', ') from public.bav_agenturen) = 'Agentur Nord GmbH' from x;

-- ---------- Was bei der Verwaltung bleibt ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
insert into ergebnis
select 10, 'A1 erstellt keine Einladung, sieht keine, entfernt niemanden und vergibt keine Rolle', 'null / 0 / false / false',
       format('%s / %s / %s / %s', coalesce(x.t::text, 'null'),
              (select count(*) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))),
              public.bav_agentur_mitglied_entfernen((select id from ids where name = 'a2')),
              public.bav_agentur_rolle_setzen((select id from ids where name = 'a2'), 'admin')),
       x.t is null
       and (select count(*) from public.bav_agentur_einladungen((select id from ids where name = 'nord'))) = 0
       and not public.bav_agentur_mitglied_entfernen((select id from ids where name = 'a2'))
       and not public.bav_agentur_rolle_setzen((select id from ids where name = 'a2'), 'admin')
  from (select public.bav_agentur_einladung_erstellen((select id from ids where name = 'nord'), 'admin') as t) x;

-- ---------- Die Zugaenge: mit Rolle und Namen — fuer Verwaltung und Admins ----------
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
insert into public.berater_profil (berater, vorname, nachname, telefon, email)
values ('Anna Zwei', 'Anna', 'Zwei', '040 222', 'anna@nord.example');
insert into ergebnis
select 11, 'A2 (Mitglied) bekommt die Liste der Zugaenge nicht', '0',
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord')))::text,
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) = 0;

set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
insert into ergebnis
select 12, 'A1 sieht die Zugaenge der eigenen Agentur: Admin zuerst, mit Namen und „ich“',
       'a1-rollen@test.invalid admin ich | a2-rollen@test.invalid mitglied Anna Zwei',
       (select string_agg(concat_ws(' ', email, rolle, nullif(name, ''), case when ich then 'ich' end), ' | ' order by n)
          from (select *, row_number() over () as n from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) m),
       (select string_agg(concat_ws(' ', email, rolle, nullif(name, ''), case when ich then 'ich' end), ' | ' order by n)
          from (select *, row_number() over () as n from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) m)
         = 'a1-rollen@test.invalid admin ich | a2-rollen@test.invalid mitglied Anna Zwei';
insert into ergebnis
select 13, 'A1 sieht die Zugaenge einer fremden Agentur nicht', '0',
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'sued')))::text,
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'sued'))) = 0;

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000b9002"}';
insert into ergebnis
select 14, 'V sieht die Zugaenge jeder Agentur', '2 in Nord / 1 in Sued (admin)',
       format('%s in Nord / %s in Sued (%s)', (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))),
              count(*), min(rolle)),
       (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) = 2 and count(*) = 1 and min(rolle) = 'admin'
  from public.bav_agentur_mitglieder((select id from ids where name = 'sued'));

-- ---------- Das Logo der Agentur ----------
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
insert into ergebnis
select 15, 'A1 darf ein Logo fuer die eigene Agentur hochladen — nicht fuer eine fremde, nicht in einen fremden Ordner', 'true / false / false',
       format('%s / %s / %s',
         public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png'),
         public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a2-0123456789abcdef01234567.png'),
         public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png')),
       public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png')
       and not public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a2-0123456789abcdef01234567.png')
       and not public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png');

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', '40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png');
  insert into ergebnis values (16, 'A1 laedt das Logo hoch', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (16, 'A1 laedt das Logo hoch', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', '40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.svg');
  insert into ergebnis values (17, 'Ein SVG oder ein anderer Name geht nicht', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (17, 'Ein SVG oder ein anderer Name geht nicht', 'abgewiesen', 'abgewiesen', true);
end $$;

with x as (
  update public.bav_agenturen
     set logo = '40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png'
   where id = (select id from ids where name = 'nord') returning 1)
insert into ergebnis select 18, 'A1 traegt das Logo an der Agentur ein', '1 Zeile', format('%s Zeile', count(*)), count(*) = 1 from x;

do $$
begin
  update public.bav_agenturen
     set logo = '60000000-0000-4000-8000-0000000b9006/agentur-b9b9b9b9-0000-4000-8000-0000000000a2-0123456789abcdef01234567.png'
   where id = 'b9b9b9b9-0000-4000-8000-0000000000a1';
  insert into ergebnis values (19, 'Das Logo einer anderen Agentur laesst sich nicht eintragen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (19, 'Das Logo einer anderen Agentur laesst sich nicht eintragen', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  update public.bav_agenturen
     set logo = '40000000-0000-4000-8000-0000000b9004/f1f1f1f1-0000-4000-8000-0000000b90f1-0123456789abcdef01234567.png'
   where id = 'b9b9b9b9-0000-4000-8000-0000000000a1';
  insert into ergebnis values (20, 'Auch nicht das Logo einer Firma', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (20, 'Auch nicht das Logo einer Firma', 'abgewiesen', 'abgewiesen', true);
end $$;

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
insert into ergebnis
select 21, 'A2 (Mitglied) liest das Logo der eigenen Agentur, laedt aber keines hoch', '1 / false',
       format('%s / %s', (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%'),
              public.bav_agentur_logo_pfad_erlaubt('50000000-0000-4000-8000-0000000b9005/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png')),
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%') = 1
       and not public.bav_agentur_logo_pfad_erlaubt('50000000-0000-4000-8000-0000000b9005/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.png');

set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-0000000b9006"}';
insert into ergebnis
select 22, 'C (andere Agentur) liest es nicht', '0',
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%')::text,
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%') = 0;

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000b9007"}';
insert into ergebnis
select 23, 'N liest es nicht', '0',
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%')::text,
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%') = 0;

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000b9002"}';
insert into ergebnis
select 24, 'V liest es und darf fuer jede Agentur hochladen', '1 / true / true',
       format('%s / %s / %s', (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%'),
         public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.webp'),
         public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a2-0123456789abcdef01234567.png')),
       (select count(*) from storage.objects where bucket_id = 'bav-firmenlogos' and name like '%/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-%') = 1
       and public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-0123456789abcdef01234567.webp')
       and public.bav_agentur_logo_pfad_erlaubt('20000000-0000-4000-8000-0000000b9002/agentur-b9b9b9b9-0000-4000-8000-0000000000a2-0123456789abcdef01234567.png');

-- Firmenlogos gehen weiter wie bisher — auch mit einem Logo der Agentur im selben Ordner.
set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f1'), 'Firma in Nord');
insert into ergebnis
select 25, 'A1 legt eine Firma in der Agentur an und darf ihr Logo hochladen', 'nord / true',
       format('%s / %s', (select name from ids where id = (select agentur from public.bav_firmen where id = (select id from ids where name = 'f1'))),
         public.bav_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/f1f1f1f1-0000-4000-8000-0000000b90f1-0123456789abcdef01234567.png')),
       (select agentur from public.bav_firmen where id = (select id from ids where name = 'f1')) = (select id from ids where name = 'nord')
       and public.bav_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/f1f1f1f1-0000-4000-8000-0000000b90f1-0123456789abcdef01234567.png');

-- ---------- Rollen vergeben: nur die Verwaltung ----------
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000b9002"}';
insert into merk values
  ('hoch',     public.bav_agentur_rolle_setzen((select id from ids where name = 'a2'), 'admin')::text),
  ('runter',   public.bav_agentur_rolle_setzen((select id from ids where name = 'a1'), 'mitglied')::text),
  ('fremd',    public.bav_agentur_rolle_setzen((select id from ids where name = 'n'), 'admin')::text),
  ('quatsch',  public.bav_agentur_rolle_setzen((select id from ids where name = 'a2'), 'chef')::text);
insert into ergebnis
select 26, 'V macht A2 zum Admin und A1 zum Mitglied; wer kein Zugang ist oder eine unbekannte Rolle bekommt, bleibt', 'true / true / false / false',
       format('%s / %s / %s / %s', (select wert from merk where name = 'hoch'), (select wert from merk where name = 'runter'),
              (select wert from merk where name = 'fremd'), (select wert from merk where name = 'quatsch')),
       (select wert from merk where name = 'hoch') = 'true' and (select wert from merk where name = 'runter') = 'true'
       and (select wert from merk where name = 'fremd') = 'false' and (select wert from merk where name = 'quatsch') = 'false';

set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
with x as (update public.bav_agenturen set name = 'Agentur Nord AG' where id = (select id from ids where name = 'nord') returning 1)
insert into ergebnis
select 27, 'A2 ist jetzt Admin und aendert die Agentur', 'admin / 1 Zeile', format('%s / %s Zeile', (public.mein_zugang()) ->> 'agentur_rolle', count(*)),
       (public.mein_zugang()) ->> 'agentur_rolle' = 'admin' and count(*) = 1 from x;

set local request.jwt.claims = '{"sub":"40000000-0000-4000-8000-0000000b9004"}';
with x as (update public.bav_agenturen set name = 'nochmal A1' where id = (select id from ids where name = 'nord') returning 1)
insert into ergebnis
select 28, 'A1 ist nur noch Mitglied: aendert nichts mehr, sieht die Zugaenge nicht mehr, laedt kein Logo mehr hoch',
       'mitglied / 0 Zeilen / 0 / false',
       format('%s / %s Zeilen / %s / %s', (public.mein_zugang()) ->> 'agentur_rolle', count(*),
              (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))),
              public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-aaaaaaaaaaaaaaaaaaaaaaaa.png')),
       (public.mein_zugang()) ->> 'agentur_rolle' = 'mitglied' and count(*) = 0
       and (select count(*) from public.bav_agentur_mitglieder((select id from ids where name = 'nord'))) = 0
       and not public.bav_agentur_logo_pfad_erlaubt('40000000-0000-4000-8000-0000000b9004/agentur-b9b9b9b9-0000-4000-8000-0000000000a1-aaaaaaaaaaaaaaaaaaaaaaaa.png')
  from x;

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-0000000b9007"}';
insert into ergebnis
select 29, 'N vergibt keine Rolle', 'false', public.bav_agentur_rolle_setzen((select id from ids where name = 'a1'), 'admin')::text,
       not public.bav_agentur_rolle_setzen((select id from ids where name = 'a1'), 'admin');

-- ---------- Entfernt: Die Rolle endet mit dem Zugang ----------
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-0000000b9002"}';
insert into merk values ('entfernt', public.bav_agentur_mitglied_entfernen((select id from ids where name = 'a2'))::text);
set local request.jwt.claims = '{"sub":"50000000-0000-4000-8000-0000000b9005"}';
with x as (update public.bav_agenturen set name = 'nach dem Ende' returning 1)
insert into ergebnis
select 30, 'V entfernt A2: keine Agentur, keine Rolle, nichts mehr zu aendern', 'true / null / null / 0 Zeilen',
       format('%s / %s / %s / %s Zeilen', (select wert from merk where name = 'entfernt'), coalesce((public.mein_zugang()) ->> 'agentur', 'null'),
              coalesce((public.mein_zugang()) ->> 'agentur_rolle', 'null'), count(*)),
       (select wert from merk where name = 'entfernt') = 'true' and (public.mein_zugang()) ->> 'agentur' is null
       and (public.mein_zugang()) ->> 'agentur_rolle' is null and count(*) = 0 from x;

-- ---------- Rechte ----------
reset role;
insert into ergebnis
select 31, 'Rollen stehen an Zugaengen und Einladungen; andere Werte nimmt die Tabelle nicht', 'admin: 1, mitglied: 1 / abgewiesen',
       format('%s / %s', (select string_agg(format('%s: %s', rolle, n), ', ' order by rolle) from (select rolle, count(*) as n from privat.bav_agentur_mitglieder group by rolle) r), x.t),
       (select string_agg(format('%s: %s', rolle, n), ', ' order by rolle) from (select rolle, count(*) as n from privat.bav_agentur_mitglieder group by rolle) r) = 'admin: 1, mitglied: 1'
       and x.t = 'abgewiesen'
  from (select case when exists (
          select 1 from pg_constraint c where c.conname = 'bav_agentur_mitglieder_rolle' and c.conrelid = 'privat.bav_agentur_mitglieder'::regclass)
          and exists (select 1 from pg_constraint c where c.conname = 'bav_agentur_einladungen_rolle' and c.conrelid = 'privat.bav_agentur_einladungen'::regclass)
        then 'abgewiesen' else 'FEHLT' end as t) x;

insert into ergebnis
select 32, 'Funktionen: nichts fuer anon, alles Noetige fuer angemeldete Konten; die alte Einladung ohne Rolle gibt es nicht mehr doppelt', 'keine Luecke',
       coalesce(nullif(concat_ws(', ',
         case when has_function_privilege('anon', 'public.bav_agentur_admin()', 'execute') then 'anon admin' end,
         case when has_function_privilege('anon', 'public.bav_agentur_rolle_setzen(uuid, text)', 'execute') then 'anon rolle_setzen' end,
         case when has_function_privilege('anon', 'public.bav_agentur_einladung_erstellen(uuid, text)', 'execute') then 'anon erstellen' end,
         case when has_function_privilege('anon', 'public.bav_agentur_einladungen(uuid)', 'execute') then 'anon einladungen' end,
         case when has_function_privilege('anon', 'public.bav_agentur_mitglieder(uuid)', 'execute') then 'anon mitglieder' end,
         case when has_function_privilege('anon', 'public.bav_agentur_logo_pfad_erlaubt(text)', 'execute') then 'anon logo' end,
         case when not has_function_privilege('authenticated', 'public.bav_agentur_admin()', 'execute') then 'authenticated OHNE admin' end,
         case when not has_function_privilege('authenticated', 'public.bav_agentur_rolle_setzen(uuid, text)', 'execute') then 'authenticated OHNE rolle_setzen' end,
         case when not has_function_privilege('authenticated', 'public.bav_agentur_einladung_erstellen(uuid, text)', 'execute') then 'authenticated OHNE erstellen' end,
         case when not has_function_privilege('authenticated', 'public.bav_agentur_mitglieder(uuid)', 'execute') then 'authenticated OHNE mitglieder' end,
         case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'bav_agentur_einladung_erstellen') <> 1 then 'erstellen doppelt' end), ''), 'keine Luecke'),
       not has_function_privilege('anon', 'public.bav_agentur_admin()', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_rolle_setzen(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_einladung_erstellen(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_einladungen(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_mitglieder(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.bav_agentur_logo_pfad_erlaubt(text)', 'execute')
       and has_function_privilege('authenticated', 'public.bav_agentur_admin()', 'execute')
       and has_function_privilege('authenticated', 'public.bav_agentur_rolle_setzen(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.bav_agentur_einladung_erstellen(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.bav_agentur_mitglieder(uuid)', 'execute')
       and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'bav_agentur_einladung_erstellen') = 1;

select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
