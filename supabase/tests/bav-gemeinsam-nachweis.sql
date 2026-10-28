-- Nachweis: Firmen im Buero gemeinsam beraten (Migration 20261027160000_bav_gemeinsam).
-- Buero K: Inhaber I, Mitglieder M1 bis M4. X fuehrt ein anderes Buero (L), N hat keins.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('i',   '11111111-0000-4000-8000-0000000b0001'),
  ('m1',  '22222222-0000-4000-8000-0000000b0002'),
  ('m2',  '33333333-0000-4000-8000-0000000b0003'),
  ('m3',  '44444444-0000-4000-8000-0000000b0004'),
  ('m4',  '55555555-0000-4000-8000-0000000b0005'),
  ('x',   '66666666-0000-4000-8000-0000000b0006'),
  ('n',   '77777777-0000-4000-8000-0000000b0007'),
  ('k',   'b0b0b0b0-0000-4000-8000-0000000000b1'),
  ('l',   'b0b0b0b0-0000-4000-8000-0000000000b2'),
  ('f1',  'f1f1f1f1-0000-4000-8000-0000000000f1'),
  ('f2',  'f2f2f2f2-0000-4000-8000-0000000000f2'),
  ('f3',  'f3f3f3f3-0000-4000-8000-0000000000f3'),
  ('f4',  'f4f4f4f4-0000-4000-8000-0000000000f4'),
  ('f5',  'f5f5f5f5-0000-4000-8000-0000000000f5'),
  ('f6',  'f6f6f6f6-0000-4000-8000-0000000000f6'),
  ('fx',  'f7f7f7f7-0000-4000-8000-0000000000f7'),
  ('fn',  'f8f8f8f8-0000-4000-8000-0000000000f8'),
  ('b11', 'b1b1b1b1-0000-4000-8000-000000000b11'),
  ('m2a', 'b2b2b2b2-0000-4000-8000-000000000b2a'),
  ('m2b', 'b2b2b2b2-0000-4000-8000-000000000b2b'),
  ('m2c', 'b2b2b2b2-0000-4000-8000-000000000b2c'),
  ('m2d', 'b2b2b2b2-0000-4000-8000-000000000b2d'),
  ('b21', 'b3b3b3b3-0000-4000-8000-000000000b21'),
  ('m3a', 'b4b4b4b4-0000-4000-8000-000000000b3a'),
  ('i6',  'b5b5b5b5-0000-4000-8000-000000000b16');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-buero@test.invalid', 'x', now(), now()
  from ids where name in ('i', 'm1', 'm2', 'm3', 'm4', 'x', 'n');

-- Zwei Bueros mit laufendem Abo; ohne Abo nimmt ein Buero keine Mitglieder auf.
insert into privat.bueros (id, name, inhaber) values
  ((select id from ids where name = 'k'), 'Agentur K', (select id from ids where name = 'i')),
  ((select id from ids where name = 'l'), 'Agentur L', (select id from ids where name = 'x'));
insert into privat.abos (buero, paket, intervall, plaetze, status) values
  ((select id from ids where name = 'k'), 'ag', 'monat', 10, 'active'),
  ((select id from ids where name = 'l'), 'ag', 'monat', 10, 'active');
insert into privat.buero_mitglieder (buero, nutzer, rolle)
select (select id from ids where name = 'k'), id, case name when 'i' then 'inhaber' else 'mitglied' end
  from ids where name in ('i', 'm1', 'm2', 'm3', 'm4')
union all
select (select id from ids where name = 'l'), (select id from ids where name = 'x'), 'inhaber';
insert into public.berater_profil (besitzer, berater, firma)
values ((select id from ids where name = 'i'), 'Ingrid Inhaberin', 'Agentur K');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

create temp table html(name text primary key, inhalt text) on commit drop;
grant all on html to anon, authenticated, service_role;
insert into html values
  ('protokoll',    repeat('<p>Beratungsprotokoll</p>', 20)),
  ('vereinbarung', repeat('<p>Vereinbarung</p>', 20));

-- Das Logo von F1 als Datei im Bucket (nur der Eintrag), im Ordner von M1
create temp table logo(name text primary key) on commit drop;
grant all on logo to anon, authenticated, service_role;
insert into logo values ('22222222-0000-4000-8000-0000000b0002/f1f1f1f1-0000-4000-8000-0000000000f1-0123456789abcdef01234567.png');
do $$
begin
  insert into storage.objects (bucket_id, name) values ('bav-firmenlogos', (select name from logo));
exception when others then
  insert into ergebnis values (0, 'Logo-Eintrag fuer den Test anlegen', 'angelegt', sqlerrm, false);
end $$;

-- ---------- M1 legt Firmen an ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';

insert into public.bav_firmen (id, name, logo) values
  ((select id from ids where name = 'f1'), 'Gemeinsam GmbH', (select name from logo)),
  ((select id from ids where name = 'f3'), 'Nur M1 KG', null);
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'b11'), (select id from ids where name = 'f1'), 'Bea Eins', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Bea Eins"}}');

do $$
begin
  insert into public.bav_firmen (name, buero) values ('Gleich geteilt', (select id from ids where name = 'k'));
  insert into ergebnis values (1, 'Firma gleich freigegeben anlegen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (1, 'Firma gleich freigegeben anlegen', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

update public.bav_firmen set buero = (select id from ids where name = 'k') where id = (select id from ids where name = 'f3');
insert into ergebnis
select 2, 'Freigabe per Update setzen bleibt wirkungslos', 'null', coalesce(buero::text, 'null'), buero is null
  from public.bav_firmen where id = (select id from ids where name = 'f3');

-- ---------- Vor der Freigabe ----------
set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 3, 'Vor der Freigabe: M2 sieht F1 nicht (Firma/Beratung/Logo)', '0/0/0',
       format('%s/%s/%s', (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')),
              (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo))),
       (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')) = 0
       and (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')) = 0
       and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 0;

do $$
begin
  perform public.bav_firma_freigeben((select id from ids where name = 'f1'), true);
  insert into ergebnis values (4, 'M2 gibt die Firma von M1 frei', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (4, 'M2 gibt die Firma von M1 frei', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- M1 gibt F1 frei ----------
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
-- In zwei Schritten: Dieselbe Anweisung saehe die Freigabe noch nicht.
do $$
declare r text;
begin
  r := public.bav_firma_freigeben((select id from ids where name = 'f1'), true);
  insert into ergebnis
  select 5, 'M1 gibt F1 fuers Buero frei', 'ok/K',
         r || '/' || coalesce((select case when buero = (select id from ids where name = 'k') then 'K' else buero::text end
                                 from public.bav_firmen where id = (select id from ids where name = 'f1')), 'null'),
         r = 'ok' and (select buero from public.bav_firmen where id = (select id from ids where name = 'f1')) = (select id from ids where name = 'k');
end $$;

set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 6, 'Nach der Freigabe: M2 sieht F1, Beratung und Logo — nicht F3', '1/1/1/0',
       format('%s/%s/%s/%s', (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')),
              (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)),
              (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f3'))),
       (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')) = 1
       and (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')) = 1
       and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 1
       and (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f3')) = 0;

insert into ergebnis
select 7, 'Kollegen: Inhaberin mit Name und Agentur zuerst, M2 ist ich, Kollegen ohne Auftritt per E-Mail', '5: Ingrid Inhaberin, Agentur K …',
       count(*) || ': ' || string_agg(name || case when agentur <> '' then ', ' || agentur else '' end || case when ich then ' (ich)' else '' end, ' | '),
       count(*) = 5
       and (array_agg(name order by (rolle = 'inhaber') desc, nutzer))[1] = 'Ingrid Inhaberin'
       and (array_agg(agentur order by (rolle = 'inhaber') desc, nutzer))[1] = 'Agentur K'
       and count(*) filter (where ich) = 1
       and bool_or(ich and nutzer = (select id from ids where name = 'm2'))
       and bool_or(nutzer = (select id from ids where name = 'm1') and name = 'm1-buero@test.invalid')
  from public.bav_kollegen();

-- ---------- I sieht F1, aber nicht die eigene Firma von M1 ----------
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-0000000b0001"}';
insert into ergebnis
select 8, 'Inhaberin sieht F1 und die Beratung, nicht F3', '1/1/0',
       format('%s/%s/%s', (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f3'))),
       (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')) = 1
       and (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')) = 1
       and (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f3')) = 0;

-- ---------- X: anderes Buero ----------
set local request.jwt.claims = '{"sub":"66666666-0000-4000-8000-0000000b0006"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'fx'), 'Fremd AG');
select public.bav_firma_freigeben((select id from ids where name = 'fx'), true);
insert into ergebnis
select 9, 'X (anderes Buero) sieht nichts von K: Firmen/Beratungen/Logo/Kollegen', '1/0/0/1',
       format('%s/%s/%s/%s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_beratungen),
              (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)),
              (select count(*) from public.bav_kollegen())),
       (select count(*) from public.bav_firmen) = 1 and (select count(*) from public.bav_beratungen) = 0
       and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 0
       and (select count(*) from public.bav_kollegen()) = 1;

set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 10, 'M2 sieht die freigegebene Firma eines anderen Bueros nicht', '0', count(*)::text, count(*) = 0
  from public.bav_firmen where id = (select id from ids where name = 'fx');

-- ---------- M2 beraet mit ----------
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'm2a'), (select id from ids where name = 'f1'), 'Max Zwei', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Max Zwei"}}'),
  ((select id from ids where name = 'm2b'), (select id from ids where name = 'f1'), 'Mia Zwei', 'offen', '{}');
insert into ergebnis
select 11, 'M2 legt Beratungen in F1 an — mit sich als Besitzer', 'm2,m2',
       string_agg(case besitzer when (select id from ids where name = 'm2') then 'm2' else '?' end, ',' order by id),
       count(*) = 2 and bool_and(besitzer = (select id from ids where name = 'm2'))
  from public.bav_beratungen where id in ((select id from ids where name = 'm2a'), (select id from ids where name = 'm2b'));

do $$
declare n int;
begin
  update public.bav_beratungen set daten = '{"schritt":3,"angaben":{"name":"Bea Eins","jahresbrutto":50000}}'
   where id = (select id from ids where name = 'b11');
  get diagnostics n = row_count;
  insert into ergebnis values (12, 'M2 aendert die Beratung von M1', '1 Zeile', n || ' Zeilen', n = 1);
exception when others then
  insert into ergebnis values (12, 'M2 aendert die Beratung von M1', '1 Zeile', sqlerrm, false);
end $$;

do $$
declare n int;
begin
  update public.bav_firmen set angebot = '{"tarif":"geaendert"}' where id = (select id from ids where name = 'f1');
  get diagnostics n = row_count;
  insert into ergebnis values (13, 'M2 aendert das Angebot von F1 nicht', '0 Zeilen', n || ' Zeilen', n = 0);
exception when others then
  insert into ergebnis values (13, 'M2 aendert das Angebot von F1 nicht', '0 Zeilen', 'abgewiesen', true);
end $$;

insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f4'), 'Nur M2 GmbH');
do $$
begin
  update public.bav_beratungen set firma = (select id from ids where name = 'f4')
   where id = (select id from ids where name = 'b11');
  insert into ergebnis values (14, 'M2 verschiebt die Beratung von M1 in die eigene Firma', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (14, 'M2 verschiebt die Beratung von M1 in die eigene Firma', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

update public.bav_beratungen set besitzer = (select id from ids where name = 'm2') where id = (select id from ids where name = 'b11');
insert into ergebnis
select 15, 'Der Besitzer einer Beratung bleibt', 'm1', case besitzer when (select id from ids where name = 'm1') then 'm1' else besitzer::text end,
       besitzer = (select id from ids where name = 'm1')
  from public.bav_beratungen where id = (select id from ids where name = 'b11');

do $$
declare n int;
begin
  delete from public.bav_beratungen where id = (select id from ids where name = 'b11');
  get diagnostics n = row_count;
  insert into ergebnis values (16, 'M2 loescht keine Beratung von M1', '0 Zeilen', n || ' Zeilen', n = 0);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'b11'), 'mitarbeiter', 'Bea Eins', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (17, 'M2 laesst die Beratung von M1 unterschreiben', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (17, 'M2 laesst die Beratung von M1 unterschreiben', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  update public.bav_beratungen set daten = '{"schritt":3,"angaben":{"name":"Bea Anders"}}'
   where id = (select id from ids where name = 'b11');
  insert into ergebnis values (18, 'Sperre gilt fuer M2', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (18, 'Sperre gilt fuer M2', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'm2a'), 'berater', 'Max Berater', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (19, 'M2 unterschreibt die eigene Beratung in F1', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (19, 'M2 unterschreibt die eigene Beratung in F1', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  perform privat.bav_buero_austritt((select id from ids where name = 'k'), (select id from ids where name = 'm1'));
  insert into ergebnis values (20, 'M2 ruft die Uebergabe direkt auf', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (20, 'M2 ruft die Uebergabe direkt auf', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- M1 loescht eine Beratung von M2 ----------
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
do $$
declare n int;
begin
  delete from public.bav_beratungen where id = (select id from ids where name = 'm2b');
  get diagnostics n = row_count;
  insert into ergebnis values (21, 'M1 (Firma) loescht eine Beratung von M2', '1 Zeile', n || ' Zeilen', n = 1);
end $$;

-- ---------- N hat kein Buero ----------
set local request.jwt.claims = '{"sub":"77777777-0000-4000-8000-0000000b0007"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'fn'), 'Ohne Buero GmbH');
insert into ergebnis
select 22, 'Ohne Buero keine Freigabe', 'kein_buero', r, r = 'kein_buero'
  from (select public.bav_firma_freigeben((select id from ids where name = 'fn'), true) as r) x;

-- ---------- M1 beendet die Freigabe ----------
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
select public.bav_firma_freigeben((select id from ids where name = 'f1'), false);
set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 23, 'Freigabe beendet: M2 sieht F1 nicht mehr (Firma/Beratungen/Unterlagen)', '0/0/0',
       format('%s/%s/%s', (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')),
              (select count(*) from public.bav_unterlagen)),
       (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')) = 0
       and (select count(*) from public.bav_beratungen where firma = (select id from ids where name = 'f1')) = 0
       and (select count(*) from public.bav_unterlagen) = 0;
reset role;
insert into ergebnis
select 24, 'Freigabe beendet: Beratung, Unterlagen und Unterschriften von M2 in F1 gehen an M1', 'm1',
       string_agg(distinct case b when (select id from ids where name = 'm1') then 'm1' else b::text end, ','),
       bool_and(b = (select id from ids where name = 'm1'))
  from (
    select besitzer as b from public.bav_beratungen where firma = (select id from ids where name = 'f1')
    union all
    select u.besitzer from public.bav_unterlagen u join public.bav_beratungen x on x.id = u.beratung where x.firma = (select id from ids where name = 'f1')
    union all
    select s.besitzer from public.bav_unterschriften s join public.bav_beratungen x on x.id = s.beratung where x.firma = (select id from ids where name = 'f1')
  ) alle;

-- ---------- Wieder freigegeben; dazu F2 (I), F5 (M3) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
select public.bav_firma_freigeben((select id from ids where name = 'f1'), true);
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-0000000b0001"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f2'), 'Inhaberin GmbH');
select public.bav_firma_freigeben((select id from ids where name = 'f2'), true);
insert into public.bav_beratungen (id, firma, mitarbeiter) values
  ((select id from ids where name = 'b21'), (select id from ids where name = 'f2'), 'Ida Zwei');
set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into public.bav_beratungen (id, firma, mitarbeiter) values
  ((select id from ids where name = 'm2c'), (select id from ids where name = 'f1'), 'Max Drei'),
  ((select id from ids where name = 'm2d'), (select id from ids where name = 'f2'), 'Max Vier');
set local request.jwt.claims = '{"sub":"44444444-0000-4000-8000-0000000b0004"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f5'), 'Drei GmbH');
select public.bav_firma_freigeben((select id from ids where name = 'f5'), true);
insert into public.bav_beratungen (id, firma, mitarbeiter) values
  ((select id from ids where name = 'm3a'), (select id from ids where name = 'f2'), 'Mara Drei');

-- ---------- M1 tritt aus: F1 geht mit allen Beratungen an I ----------
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
select public.buero_verlassen();
reset role;
insert into ergebnis
select 25, 'M1 tritt aus: F1 an I und freigegeben, Beratungen von M1 an I, F3 bleibt bei M1, Beratung von M2 bleibt bei M2', 'i/K/i/m1/m2',
       format('%s/%s/%s/%s/%s',
         (select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_firmen where id = (select id from ids where name = 'f1')),
         (select case buero when (select id from ids where name = 'k') then 'K' else coalesce(buero::text, 'null') end from public.bav_firmen where id = (select id from ids where name = 'f1')),
         (select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'b11')),
         (select case besitzer when (select id from ids where name = 'm1') then 'm1' else besitzer::text end from public.bav_firmen where id = (select id from ids where name = 'f3')),
         (select case besitzer when (select id from ids where name = 'm2') then 'm2' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'm2c'))),
       (select besitzer = (select id from ids where name = 'i') and buero = (select id from ids where name = 'k') from public.bav_firmen where id = (select id from ids where name = 'f1'))
       and (select besitzer = (select id from ids where name = 'i') from public.bav_beratungen where id = (select id from ids where name = 'b11'))
       and (select besitzer = (select id from ids where name = 'i') from public.bav_beratungen where id = (select id from ids where name = 'm2a'))
       and (select besitzer = (select id from ids where name = 'm1') and buero is null from public.bav_firmen where id = (select id from ids where name = 'f3'))
       and (select besitzer = (select id from ids where name = 'm2') from public.bav_beratungen where id = (select id from ids where name = 'm2c'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-4000-8000-0000000b0002"}';
insert into ergebnis
select 26, 'M1 sieht nach dem Austritt nur noch die eigene Firma F3', 'f3',
       string_agg(case id when (select id from ids where name = 'f3') then 'f3' else name end, ','),
       count(*) = 1 and bool_and(id = (select id from ids where name = 'f3'))
  from public.bav_firmen;

set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-0000000b0001"}';
do $$
declare n int;
begin
  update public.bav_firmen set angebot = '{"tarif":"vom Inhaber"}' where id = (select id from ids where name = 'f1');
  get diagnostics n = row_count;
  insert into ergebnis
  select 27, 'I pflegt jetzt das Angebot von F1 und liest das Logo (Ordner von M1)', '1/1',
         n || '/' || (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)),
         n = 1 and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 1;
exception when others then
  insert into ergebnis values (27, 'I pflegt jetzt das Angebot von F1 und liest das Logo (Ordner von M1)', '1/1', sqlerrm, false);
end $$;

set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 28, 'M2 beraet in F1 weiter (Firma/Logo)', '1/1',
       format('%s/%s', (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')),
              (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo))),
       (select count(*) from public.bav_firmen where id = (select id from ids where name = 'f1')) = 1
       and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 1;

-- ---------- I entfernt M2: dessen Beratungen bleiben bei den Firmen ----------
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-0000000b0001"}';
select public.mitglied_entfernen((select id from ids where name = 'm2'));
reset role;
-- Als postgres ohne RLS: nur die Unterlagen der Test-Beratungen zaehlen, nicht die echter Konten.
insert into ergebnis
select 29, 'M2 entfernt: Beratungen in F1 und F2 und alle Unterlagen an I, F4 bleibt bei M2', 'i/i/i/m2',
       format('%s/%s/%s/%s',
         (select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'm2c')),
         (select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'm2d')),
         (select string_agg(distinct case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end, ',') from public.bav_unterlagen where beratung in (select id from ids)),
         (select case besitzer when (select id from ids where name = 'm2') then 'm2' else besitzer::text end from public.bav_firmen where id = (select id from ids where name = 'f4'))),
       (select besitzer = (select id from ids where name = 'i') from public.bav_beratungen where id = (select id from ids where name = 'm2c'))
       and (select besitzer = (select id from ids where name = 'i') from public.bav_beratungen where id = (select id from ids where name = 'm2d'))
       and (select bool_and(besitzer = (select id from ids where name = 'i')) from public.bav_unterlagen where beratung in (select id from ids))
       and (select bool_and(besitzer = (select id from ids where name = 'i')) from public.bav_unterschriften where beratung in (select id from ids))
       and (select besitzer = (select id from ids where name = 'm2') from public.bav_firmen where id = (select id from ids where name = 'f4'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-0000-4000-8000-0000000b0003"}';
insert into ergebnis
select 30, 'M2 sieht nach dem Entfernen nur die eigene Firma, keine Kollegen', 'f4/0',
       format('%s/%s', (select string_agg(case id when (select id from ids where name = 'f4') then 'f4' else name end, ',') from public.bav_firmen),
              (select count(*) from public.bav_kollegen())),
       (select count(*) from public.bav_firmen) = 1
       and (select bool_and(id = (select id from ids where name = 'f4')) from public.bav_firmen)
       and (select count(*) from public.bav_kollegen()) = 0;

-- ---------- M3 loescht sein Konto ----------
reset role;
do $$
begin
  delete from auth.users where id = (select id from ids where name = 'm3');
exception when others then
  insert into ergebnis values (31, 'Konto von M3 loeschen', 'geloescht', sqlerrm, false);
end $$;
insert into ergebnis
select 31, 'M3 loescht sein Konto: F5 an I und freigegeben, seine Beratung in F2 an I', 'i/K/i',
       format('%s/%s/%s',
         coalesce((select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_firmen where id = (select id from ids where name = 'f5')), 'GELOESCHT'),
         coalesce((select case buero when (select id from ids where name = 'k') then 'K' else coalesce(buero::text, 'null') end from public.bav_firmen where id = (select id from ids where name = 'f5')), '-'),
         coalesce((select case besitzer when (select id from ids where name = 'i') then 'i' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'm3a')), 'GELOESCHT')),
       coalesce((select besitzer = (select id from ids where name = 'i') and buero = (select id from ids where name = 'k') from public.bav_firmen where id = (select id from ids where name = 'f5')), false)
       and coalesce((select besitzer = (select id from ids where name = 'i') from public.bav_beratungen where id = (select id from ids where name = 'm3a')), false)
       and not exists (select 1 from privat.buero_mitglieder where nutzer = (select id from ids where name = 'm3'));

-- ---------- Die Inhaberin loescht ihr Konto: das Buero endet ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-0000-4000-8000-0000000b0005"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f6'), 'Vier GmbH');
select public.bav_firma_freigeben((select id from ids where name = 'f6'), true);
set local request.jwt.claims = '{"sub":"11111111-0000-4000-8000-0000000b0001"}';
insert into public.bav_beratungen (id, firma, mitarbeiter) values
  ((select id from ids where name = 'i6'), (select id from ids where name = 'f6'), 'Ina Sechs');
reset role;
do $$
begin
  delete from auth.users where id = (select id from ids where name = 'i');
exception when others then
  insert into ergebnis values (32, 'Konto der Inhaberin loeschen', 'geloescht', sqlerrm, false);
end $$;
insert into ergebnis
select 32, 'Inhaberin weg: F6 bleibt bei M4 ohne Freigabe, ihre Beratung darin an M4, ihre Firmen und das Buero weg', 'm4/null/m4/0/0',
       format('%s/%s/%s/%s/%s',
         coalesce((select case besitzer when (select id from ids where name = 'm4') then 'm4' else besitzer::text end from public.bav_firmen where id = (select id from ids where name = 'f6')), 'GELOESCHT'),
         coalesce((select coalesce(buero::text, 'null') from public.bav_firmen where id = (select id from ids where name = 'f6')), '-'),
         coalesce((select case besitzer when (select id from ids where name = 'm4') then 'm4' else besitzer::text end from public.bav_beratungen where id = (select id from ids where name = 'i6')), 'GELOESCHT'),
         (select count(*) from public.bav_firmen where id in ((select id from ids where name = 'f1'), (select id from ids where name = 'f2'), (select id from ids where name = 'f5'))),
         (select count(*) from privat.bueros where id = (select id from ids where name = 'k'))),
       coalesce((select besitzer = (select id from ids where name = 'm4') and buero is null from public.bav_firmen where id = (select id from ids where name = 'f6')), false)
       and coalesce((select besitzer = (select id from ids where name = 'm4') from public.bav_beratungen where id = (select id from ids where name = 'i6')), false)
       and (select count(*) from public.bav_firmen where id in ((select id from ids where name = 'f1'), (select id from ids where name = 'f2'), (select id from ids where name = 'f5'))) = 0
       and (select count(*) from privat.bueros where id = (select id from ids where name = 'k')) = 0;

-- ---------- anon und Rechte ----------
set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.bav_kollegen();
  insert into ergebnis values (33, 'anon fragt die Kollegen ab', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (33, 'anon fragt die Kollegen ab', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;
do $$
begin
  perform public.bav_firma_freigeben(gen_random_uuid(), true);
  insert into ergebnis values (34, 'anon gibt frei', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (34, 'anon gibt frei', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

reset role;
insert into ergebnis
select 35, 'Rechte: nur authenticated ruft die neuen Funktionen auf, privat bleibt zu', 'so',
       concat_ws(', ',
         case when has_function_privilege('anon', 'public.bav_mein_buero()', 'execute') then 'anon mein_buero' end,
         case when has_function_privilege('anon', 'public.bav_kollegen()', 'execute') then 'anon kollegen' end,
         case when has_function_privilege('anon', 'public.bav_firma_freigeben(uuid, boolean)', 'execute') then 'anon freigeben' end,
         case when not has_function_privilege('authenticated', 'public.bav_firma_freigeben(uuid, boolean)', 'execute') then 'authenticated ohne freigeben' end,
         case when has_function_privilege('authenticated', 'privat.bav_buero_austritt(uuid, uuid)', 'execute') then 'authenticated austritt' end,
         case when has_function_privilege('authenticated', 'privat.bav_freigabe_beenden(uuid)', 'execute') then 'authenticated beenden' end),
       not has_function_privilege('anon', 'public.bav_mein_buero()', 'execute')
       and not has_function_privilege('anon', 'public.bav_kollegen()', 'execute')
       and not has_function_privilege('anon', 'public.bav_firma_freigeben(uuid, boolean)', 'execute')
       and has_function_privilege('authenticated', 'public.bav_firma_freigeben(uuid, boolean)', 'execute')
       and not has_function_privilege('authenticated', 'privat.bav_buero_austritt(uuid, uuid)', 'execute')
       and not has_function_privilege('authenticated', 'privat.bav_freigabe_beenden(uuid)', 'execute');

select nr, bestanden, pruefung, tatsaechlich from ergebnis order by nr;

rollback;
