-- Nachweis: Firmen gemeinsam beraten (Migration 20261027160000_bav_gemeinsam).
-- A ist Inhaber, B wird eingeladen, C ist fremd.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-00000000c0a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-gemeinsam@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-00000000c0b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-gemeinsam@test.invalid','x',now(),now()),
  ('cccccccc-0000-4000-8000-00000000c0c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c-gemeinsam@test.invalid','x',now(),now());

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('a',      'aaaaaaaa-0000-4000-8000-00000000c0a1'),
  ('b',      'bbbbbbbb-0000-4000-8000-00000000c0b2'),
  ('c',      'cccccccc-0000-4000-8000-00000000c0c3'),
  ('firma',  'f1f1f1f1-0000-4000-8000-00000000c0f1'),
  ('a1',     'a1a1a1a1-0000-4000-8000-00000000c0a1'),
  ('b1',     'b1b1b1b1-0000-4000-8000-00000000c0b1'),
  ('b2',     'b2b2b2b2-0000-4000-8000-00000000c0b2'),
  ('b3',     'b3b3b3b3-0000-4000-8000-00000000c0b3');

create temp table tokens(name text primary key, token uuid) on commit drop;
grant all on tokens to anon, authenticated, service_role;

create temp table html(name text primary key, inhalt text) on commit drop;
grant all on html to anon, authenticated, service_role;
insert into html values
  ('protokoll',    repeat('<p>Beratungsprotokoll</p>', 20)),
  ('vereinbarung', repeat('<p>Vereinbarung</p>', 20));

-- Das Logo der Firma als Datei im Bucket (nur der Eintrag, ohne Inhalt)
create temp table logo(name text primary key) on commit drop;
grant all on logo to anon, authenticated, service_role;
insert into logo values ('aaaaaaaa-0000-4000-8000-00000000c0a1/f1f1f1f1-0000-4000-8000-00000000c0f1-0123456789abcdef01234567.png');

-- ---------- A legt Firma, Logo und eine Beratung an und laedt ein ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000c0a1"}';

insert into public.bav_firmen (id, name, logo)
values ((select id from ids where name = 'firma'), 'Gemeinsam GmbH', (select name from logo));
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'a1'), (select id from ids where name = 'firma'), 'Anna Inhaber', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Anna Inhaber"}}');

insert into tokens values ('erste', public.bav_firma_einladung_erstellen((select id from ids where name = 'firma')));
insert into tokens values ('zweite', public.bav_firma_einladung_erstellen((select id from ids where name = 'firma')));

insert into ergebnis
select 1, 'Inhaber sieht seine offenen Einladungen', '2', count(*)::text, count(*) = 2
  from public.bav_firma_einladungen((select id from ids where name = 'firma'));

reset role;
do $$
begin
  insert into storage.objects (bucket_id, name) values ('bav-firmenlogos', (select name from logo));
exception when others then
  insert into ergebnis values (0, 'Logo-Eintrag fuer den Test anlegen', 'angelegt', sqlerrm, false);
end $$;

-- ---------- C: fremd ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-00000000c0c3"}';

insert into ergebnis
select 2, 'C sieht weder Firma noch Beratungen noch Beteiligte', '0/0/0',
       format('%s/%s/%s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_beratungen),
              (select count(*) from public.bav_firma_beteiligte((select id from ids where name = 'firma')))),
       (select count(*) from public.bav_firmen) = 0 and (select count(*) from public.bav_beratungen) = 0
       and (select count(*) from public.bav_firma_beteiligte((select id from ids where name = 'firma'))) = 0;

do $$
begin
  perform public.bav_firma_einladung_erstellen((select id from ids where name = 'firma'));
  insert into ergebnis values (3, 'C laedt zu einer fremden Firma ein', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (3, 'C laedt zu einer fremden Firma ein', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

insert into ergebnis
select 4, 'C liest das Logo nicht', '0', count(*)::text, count(*) = 0
  from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo);

-- ---------- B nimmt an ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000c0b2"}';

insert into ergebnis
select 5, 'B nimmt die Einladung an', 'ok', a->>'antwort',
       a->>'antwort' = 'ok' and a->>'firma' = (select id from ids where name = 'firma')::text and a->>'name' = 'Gemeinsam GmbH'
  from (select public.bav_firma_einladung_annehmen((select token from tokens where name = 'erste')) as a) x;

insert into ergebnis
select 6, 'Dieselbe Einladung ein zweites Mal', 'ungueltig', a->>'antwort', a->>'antwort' = 'ungueltig'
  from (select public.bav_firma_einladung_annehmen((select token from tokens where name = 'erste')) as a) x;

insert into ergebnis
select 7, 'B ist schon dabei', 'schon', a->>'antwort', a->>'antwort' = 'schon'
  from (select public.bav_firma_einladung_annehmen((select token from tokens where name = 'zweite')) as a) x;

insert into ergebnis
select 8, 'B sieht Firma, Beratung von A und das Logo', '1/1/1',
       format('%s/%s/%s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_beratungen),
              (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo))),
       (select count(*) from public.bav_firmen) = 1 and (select count(*) from public.bav_beratungen) = 1
       and (select count(*) from storage.objects o where o.bucket_id = 'bav-firmenlogos' and o.name = (select name from logo)) = 1;

insert into ergebnis
select 9, 'Beteiligte: A Inhaber, B beteiligt (ich)', 'inhaber,beteiligt*',
       string_agg(rolle || case when ich then '*' else '' end, ',' order by rolle desc),
       string_agg(rolle || case when ich then '*' else '' end, ',' order by rolle desc) = 'inhaber,beteiligt*'
  from public.bav_firma_beteiligte((select id from ids where name = 'firma'));

insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'b1'), (select id from ids where name = 'firma'), 'Bernd Beteiligt', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Bernd Beteiligt"}}'),
  ((select id from ids where name = 'b2'), (select id from ids where name = 'firma'), 'Berta Zwei', 'offen', '{}');
insert into ergebnis
select 10, 'B legt Beratungen an — mit sich als Besitzer', 'b,b',
       string_agg(case besitzer when (select id from ids where name = 'b') then 'b' else '?' end, ',' order by id),
       bool_and(besitzer = (select id from ids where name = 'b'))
  from public.bav_beratungen where id in ((select id from ids where name = 'b1'), (select id from ids where name = 'b2'));

do $$
declare n int;
begin
  update public.bav_beratungen set daten = '{"schritt":3,"angaben":{"name":"Anna Inhaber","jahresbrutto":50000}}'
   where id = (select id from ids where name = 'a1');
  get diagnostics n = row_count;
  insert into ergebnis values (11, 'B aendert die Beratung von A', '1 Zeile', n || ' Zeilen', n = 1);
exception when others then
  insert into ergebnis values (11, 'B aendert die Beratung von A', '1 Zeile', sqlerrm, false);
end $$;

do $$
declare n int;
begin
  update public.bav_firmen set angebot = '{"tarif":"geaendert"}' where id = (select id from ids where name = 'firma');
  get diagnostics n = row_count;
  insert into ergebnis values (12, 'B aendert das Angebot nicht', '0 Zeilen', n || ' Zeilen', n = 0);
exception when others then
  insert into ergebnis values (12, 'B aendert das Angebot nicht', '0 Zeilen', 'abgewiesen', true);
end $$;

update public.bav_beratungen set besitzer = (select id from ids where name = 'b'), firma = gen_random_uuid()
 where id = (select id from ids where name = 'a1');
insert into ergebnis
select 13, 'Besitzer und Firma einer Beratung bleiben', 'a, Firma',
       case besitzer when (select id from ids where name = 'a') then 'a' else besitzer::text end,
       besitzer = (select id from ids where name = 'a') and firma = (select id from ids where name = 'firma')
  from public.bav_beratungen where id = (select id from ids where name = 'a1');

do $$
declare n int;
begin
  delete from public.bav_beratungen where id = (select id from ids where name = 'a1');
  get diagnostics n = row_count;
  insert into ergebnis values (14, 'B loescht keine Beratung von A', '0 Zeilen', n || ' Zeilen', n = 0);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'a1'), 'mitarbeiter', 'Anna Inhaber', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (15, 'B laesst die Beratung von A unterschreiben', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (15, 'B laesst die Beratung von A unterschreiben', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  update public.bav_beratungen set daten = '{"schritt":3,"angaben":{"name":"Anna Anders"}}'
   where id = (select id from ids where name = 'a1');
  insert into ergebnis values (16, 'Sperre gilt fuer B', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (16, 'Sperre gilt fuer B', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'b1'), 'berater', 'Bernd Berater', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (17, 'B unterschreibt die eigene Beratung', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (17, 'B unterschreibt die eigene Beratung', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  perform privat.bav_uebergeben((select id from ids where name = 'firma'), (select id from ids where name = 'b'));
  insert into ergebnis values (18, 'B ruft die Uebergabe direkt auf', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (18, 'B ruft die Uebergabe direkt auf', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- A: sieht alles, loescht eine Beratung von B ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000c0a1"}';

insert into ergebnis
select 19, 'A sieht die Beratungen von B und die Unterlagen', '3/2',
       format('%s/%s', (select count(*) from public.bav_beratungen), (select count(*) from public.bav_unterlagen)),
       (select count(*) from public.bav_beratungen) = 3 and (select count(*) from public.bav_unterlagen) = 2;

do $$
declare n int;
begin
  delete from public.bav_beratungen where id = (select id from ids where name = 'b2');
  get diagnostics n = row_count;
  insert into ergebnis values (20, 'Inhaber loescht eine Beratung von B', '1 Zeile', n || ' Zeilen', n = 1);
end $$;

insert into ergebnis
select 21, 'Offene Einladungen: die angenommene zaehlt nicht mehr', '1', count(*)::text, count(*) = 1
  from public.bav_firma_einladungen((select id from ids where name = 'firma'));

select public.bav_firma_einladung_zurueckziehen((select token from tokens where name = 'zweite'));
insert into ergebnis
select 22, 'Zurueckgezogen: keine offene Einladung mehr', '0', count(*)::text, count(*) = 0
  from public.bav_firma_einladungen((select id from ids where name = 'firma'));

insert into ergebnis
select 23, 'A nimmt die eigene Einladung an', 'eigene', a->>'antwort', a->>'antwort' = 'eigene'
  from (select public.bav_firma_einladung_annehmen(public.bav_firma_einladung_erstellen((select id from ids where name = 'firma'))) as a) x;

-- Eine abgelaufene Einladung
insert into tokens values ('alt', public.bav_firma_einladung_erstellen((select id from ids where name = 'firma')));
reset role;
update privat.bav_firma_einladungen set gueltig_bis = now() - interval '1 minute' where token = (select token from tokens where name = 'alt');
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-00000000c0c3"}';
insert into ergebnis
select 24, 'Abgelaufene Einladung', 'abgelaufen', a->>'antwort', a->>'antwort' = 'abgelaufen'
  from (select public.bav_firma_einladung_annehmen((select token from tokens where name = 'alt')) as a) x;

-- ---------- B verlaesst die Firma: seine Beratungen bleiben, beim Inhaber ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000c0b2"}';
select public.bav_firma_verlassen((select id from ids where name = 'firma'));

insert into ergebnis
select 25, 'B sieht nach dem Verlassen nichts mehr', '0/0/0',
       format('%s/%s/%s', (select count(*) from public.bav_firmen), (select count(*) from public.bav_beratungen), (select count(*) from public.bav_unterlagen)),
       (select count(*) from public.bav_firmen) = 0 and (select count(*) from public.bav_beratungen) = 0
       and (select count(*) from public.bav_unterlagen) = 0;

reset role;
insert into ergebnis
select 26, 'Beratung, Unterlagen und Unterschrift von B gehen an A', 'a/a/a',
       format('%s/%s/%s',
         (select besitzer = (select id from ids where name = 'a') from public.bav_beratungen where id = (select id from ids where name = 'b1')),
         (select besitzer = (select id from ids where name = 'a') from public.bav_unterlagen where beratung = (select id from ids where name = 'b1')),
         (select bool_and(besitzer = (select id from ids where name = 'a')) from public.bav_unterschriften where beratung = (select id from ids where name = 'b1'))),
       (select besitzer = (select id from ids where name = 'a') from public.bav_beratungen where id = (select id from ids where name = 'b1'))
       and (select besitzer = (select id from ids where name = 'a') from public.bav_unterlagen where beratung = (select id from ids where name = 'b1'))
       and (select bool_and(besitzer = (select id from ids where name = 'a')) from public.bav_unterschriften where beratung = (select id from ids where name = 'b1'));

-- ---------- B kommt wieder, A entfernt ihn; dann kommt er noch einmal und loescht sein Konto ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000c0a1"}';
insert into tokens values ('dritte', public.bav_firma_einladung_erstellen((select id from ids where name = 'firma')));
insert into tokens values ('vierte', public.bav_firma_einladung_erstellen((select id from ids where name = 'firma')));
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000c0b2"}';
select public.bav_firma_einladung_annehmen((select token from tokens where name = 'dritte'));
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000c0a1"}';
select public.bav_firma_teilnehmer_entfernen((select id from ids where name = 'firma'), (select id from ids where name = 'b'));
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000c0b2"}';
insert into ergebnis
select 27, 'Entfernt: B sieht die Firma nicht mehr', '0', count(*)::text, count(*) = 0 from public.bav_firmen;

do $$
begin
  perform public.bav_firma_verlassen((select id from ids where name = 'firma'));
  insert into ergebnis values (28, 'Verlassen ohne Beteiligung', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (28, 'Verlassen ohne Beteiligung', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

select public.bav_firma_einladung_annehmen((select token from tokens where name = 'vierte'));
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'b3'), (select id from ids where name = 'firma'), 'Bea Drei', 'offen', '{}');

reset role;
do $$
begin
  delete from auth.users where id = (select id from ids where name = 'b');
exception when others then
  insert into ergebnis values (29, 'Konto von B loeschen', 'geloescht', sqlerrm, false);
end $$;
insert into ergebnis
select 29, 'B loescht sein Konto: seine Beratung bleibt, beim Inhaber', 'a',
       coalesce((select case when besitzer = (select id from ids where name = 'a') then 'a' else besitzer::text end
                   from public.bav_beratungen where id = (select id from ids where name = 'b3')), 'GELOESCHT'),
       coalesce((select besitzer = (select id from ids where name = 'a') from public.bav_beratungen where id = (select id from ids where name = 'b3')), false)
       and not exists (select 1 from public.bav_firma_teilnehmer where nutzer = (select id from ids where name = 'b'));

-- ---------- anon und Rechte ----------
set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.bav_firma_einladung_annehmen(gen_random_uuid());
  insert into ergebnis values (30, 'anon nimmt an', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (30, 'anon nimmt an', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

reset role;
insert into ergebnis
select 31, 'Beteiligte nur ueber Funktionen schreibbar; RLS erzwungen', 'so',
       concat_ws(', ',
         case when has_table_privilege('authenticated', 'public.bav_firma_teilnehmer', 'insert') then 'insert' end,
         case when has_table_privilege('authenticated', 'public.bav_firma_teilnehmer', 'delete') then 'delete' end,
         case when has_table_privilege('anon', 'public.bav_firma_teilnehmer', 'select') then 'anon' end),
       not has_table_privilege('authenticated', 'public.bav_firma_teilnehmer', 'insert')
       and not has_table_privilege('authenticated', 'public.bav_firma_teilnehmer', 'delete')
       and not has_table_privilege('anon', 'public.bav_firma_teilnehmer', 'select')
       and (select relforcerowsecurity from pg_class where oid = 'public.bav_firma_teilnehmer'::regclass);

select nr, bestanden, pruefung, tatsaechlich from ergebnis order by nr;

rollback;
