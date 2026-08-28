-- Nachweis der Row-Level-Security-Absicherung mit zwei Konten.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Ausfuehren gegen die Zieldatenbank,
-- etwa ueber den SQL-Editor oder `supabase db execute`.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.invalid','x',now(),now());

insert into public.szenarien (id, besitzer, name, daten)
values ('11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Plan von A','{"schemaVersion":1}'::jsonb);

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to authenticated;

-- ---------- Konto B greift auf fremde Daten zu ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';

insert into ergebnis
select 1, 'B liest die Zeile von A', '0', count(*)::text, count(*) = 0
from public.szenarien where id = '11111111-0000-4000-8000-000000000001';

with versuch as (
  update public.szenarien set name = 'GEKAPERT'
  where id = '11111111-0000-4000-8000-000000000001' returning 1)
insert into ergebnis
select 2, 'B aendert die Zeile von A', '0 betroffen', count(*)::text, count(*) = 0 from versuch;

with versuch as (
  delete from public.szenarien
  where id = '11111111-0000-4000-8000-000000000001' returning 1)
insert into ergebnis
select 3, 'B loescht die Zeile von A', '0 betroffen', count(*)::text, count(*) = 0 from versuch;

insert into public.szenarien (id, besitzer, name, daten)
values ('22222222-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','Plan von B','{"schemaVersion":1}'::jsonb);

-- Der klassische Fehler: Ohne "with check" beim Update koennte B seine eigene
-- Zeile einem fremden Konto unterschieben.
with versuch as (
  update public.szenarien set besitzer = 'aaaaaaaa-0000-4000-8000-000000000001'
  where id = '22222222-0000-4000-8000-000000000002' returning besitzer)
insert into ergebnis
select 4, 'B schreibt eigene Zeile auf Besitzer A um', 'Besitzer bleibt B',
       coalesce((select besitzer::text from versuch), 'abgewiesen'),
       coalesce((select besitzer from versuch), 'bbbbbbbb-0000-4000-8000-000000000002')
         = 'bbbbbbbb-0000-4000-8000-000000000002';

insert into ergebnis
select 5, 'B sieht nur die eigene Zeile', '1', count(*)::text, count(*) = 1 from public.szenarien;

-- TRUNCATE umgeht RLS. Ohne den revoke in der Hauptmigration ginge das durch.
do $$
begin
  execute 'truncate public.szenarien';
  insert into ergebnis values (6,'B fuehrt TRUNCATE aus','abgewiesen','DURCHGEGANGEN — Luecke offen',false);
exception when insufficient_privilege then
  insert into ergebnis values (6,'B fuehrt TRUNCATE aus','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

-- ---------- Konto A nutzt die eigenen Daten ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';

insert into ergebnis
select 7, 'A liest die eigene Zeile', '1', count(*)::text, count(*) = 1
from public.szenarien where id = '11111111-0000-4000-8000-000000000001';

with versuch as (
  update public.szenarien set name = 'Umbenannt durch A'
  where id = '11111111-0000-4000-8000-000000000001' returning name)
insert into ergebnis
select 8, 'A aendert die eigene Zeile', 'Umbenannt durch A',
       coalesce((select name from versuch),'nicht betroffen'),
       (select name from versuch) = 'Umbenannt durch A';

with versuch as (
  delete from public.szenarien
  where id = '11111111-0000-4000-8000-000000000001' returning 1)
insert into ergebnis
select 9, 'A loescht die eigene Zeile', '1 betroffen', count(*)::text, count(*) = 1 from versuch;

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
