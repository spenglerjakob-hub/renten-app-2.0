-- Nachweis der Absicherung des Vorsorge-Checks: Kunde ohne Konto, zwei Berater.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Ausfuehren gegen die Zieldatenbank,
-- etwa ueber den SQL-Editor oder `psql -f`.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.invalid','x',now(),now());

-- Drei Anfragen von Berater A: offen, abgelaufen, und eine fuer den Doppelversuch.
insert into public.check_anfragen (code, berater, kunde, erstellt_am, gueltig_bis) values
  ('c0de0000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Familie Muster', now(), now() + interval '30 days'),
  ('c0de0000-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','Abgelaufen', now() - interval '40 days', now() - interval '10 days');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated;

-- ---------- Kunde ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

insert into ergebnis
select 1, 'Kunde prueft gueltigen Code', 'true',
       public.check_code_gueltig('c0de0000-0000-4000-8000-000000000001')::text,
       public.check_code_gueltig('c0de0000-0000-4000-8000-000000000001');

insert into ergebnis
select 2, 'Kunde prueft abgelaufenen Code', 'false',
       public.check_code_gueltig('c0de0000-0000-4000-8000-000000000002')::text,
       not public.check_code_gueltig('c0de0000-0000-4000-8000-000000000002');

do $$
begin
  insert into public.check_eingaenge (code, daten)
  values ('c0de0000-0000-4000-8000-000000000001', '{"schemaVersion":1}');
  insert into ergebnis values (3,'Kunde reicht mit gueltigem Code ein','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (3,'Kunde reicht mit gueltigem Code ein','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into public.check_eingaenge (code, daten)
  values ('c0de0000-0000-4000-8000-000000000001', '{"schemaVersion":1,"zweiter":true}');
  insert into ergebnis values (4,'Kunde reicht denselben Code ein zweites Mal ein','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (4,'Kunde reicht denselben Code ein zweites Mal ein','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into public.check_eingaenge (code, daten)
  values ('c0de0000-0000-4000-8000-000000000002', '{"schemaVersion":1}');
  insert into ergebnis values (5,'Kunde reicht mit abgelaufenem Code ein','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (5,'Kunde reicht mit abgelaufenem Code ein','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into public.check_eingaenge (code, daten)
  values ('deadbeef-0000-4000-8000-000000000009', '{"schemaVersion":1}');
  insert into ergebnis values (6,'Kunde reicht mit erfundenem Code ein','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (6,'Kunde reicht mit erfundenem Code ein','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  perform count(*) from public.check_eingaenge;
  insert into ergebnis values (7,'Kunde liest Eingaenge','abgewiesen','DURCHGEGANGEN — Luecke offen',false);
exception when insufficient_privilege then
  insert into ergebnis values (7,'Kunde liest Eingaenge','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

do $$
begin
  perform count(*) from public.check_anfragen;
  insert into ergebnis values (8,'Kunde listet Anfragen (alle Codes)','abgewiesen','DURCHGEGANGEN — Luecke offen',false);
exception when insufficient_privilege then
  insert into ergebnis values (8,'Kunde listet Anfragen (alle Codes)','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

insert into ergebnis
select 9, 'Code nach dem Einreichen verbraucht', 'false',
       public.check_code_gueltig('c0de0000-0000-4000-8000-000000000001')::text,
       not public.check_code_gueltig('c0de0000-0000-4000-8000-000000000001');

-- ---------- Fremder Berater B ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';

insert into ergebnis
select 10, 'B liest den Eingang von A', '0', count(*)::text, count(*) = 0 from public.check_eingaenge;

insert into ergebnis
select 11, 'B liest die Anfragen von A', '0', count(*)::text, count(*) = 0 from public.check_anfragen;

with versuch as (delete from public.check_eingaenge returning 1)
insert into ergebnis
select 12, 'B loescht den Eingang von A', '0 betroffen', count(*)::text, count(*) = 0 from versuch;

do $$
begin
  insert into public.check_anfragen (berater, kunde)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'untergeschoben');
  insert into ergebnis values (13,'B legt eine Anfrage im Namen von A an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (13,'B legt eine Anfrage im Namen von A an','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  execute 'truncate public.check_eingaenge';
  insert into ergebnis values (14,'B fuehrt TRUNCATE aus','abgewiesen','DURCHGEGANGEN — Luecke offen',false);
exception when insufficient_privilege then
  insert into ergebnis values (14,'B fuehrt TRUNCATE aus','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

-- B legt eine eigene Anfrage an: Das Konto und die Frist stehen von selbst.
with neu as (insert into public.check_anfragen (kunde) values ('Kunde von B') returning berater, gueltig_bis)
insert into ergebnis
select 15, 'B legt eine eigene Anfrage an', 'Berater B, 30 Tage',
       (select berater::text from neu),
       (select berater from neu) = 'bbbbbbbb-0000-4000-8000-000000000002'
         and (select gueltig_bis from neu) > now() + interval '29 days';

-- ---------- Berater A ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';

insert into ergebnis
select 16, 'A liest den eigenen Eingang', '1', count(*)::text, count(*) = 1 from public.check_eingaenge;

insert into ergebnis
select 17, 'A sieht nur die eigenen Anfragen', '2', count(*)::text, count(*) = 2 from public.check_anfragen;

with versuch as (
  delete from public.check_anfragen where code = 'c0de0000-0000-4000-8000-000000000001' returning 1)
insert into ergebnis
select 18, 'A loescht die Anfrage (samt Eingang)', '1 betroffen', count(*)::text, count(*) = 1 from versuch;

insert into ergebnis
select 19, 'Eingang ist mit der Anfrage weg', '0', count(*)::text, count(*) = 0 from public.check_eingaenge;

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
