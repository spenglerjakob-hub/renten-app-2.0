-- Nachweis: Logo, Firmenname und Akzentfarbe des Bueros (Migration 20261028120000_buero_auftritt).
-- Buero K: Inhaberin I, Mitglied M (mit eigenem, abweichendem Auftritt). X gehoert keinem Buero an.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Dateien werden nur als Zeilen in
-- storage.objects angelegt. Geloescht wird nichts, damit der Nachweis auch
-- ueber Werkzeuge laeuft, die jede Loeschanweisung erst bestaetigen lassen;
-- gezaehlt wird nur, was zu den Testkonten gehoert.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id text) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('i',        'c1c1c1c1-0000-4000-8000-0000000000c1'),
  ('m',        'c2c2c2c2-0000-4000-8000-0000000000c2'),
  ('x',        'c3c3c3c3-0000-4000-8000-0000000000c3'),
  ('k',        'c0c0c0c0-0000-4000-8000-0000000000b1'),
  ('logo_i',   'c1c1c1c1-0000-4000-8000-0000000000c1/logo-0123456789abcdef01234567.png'),
  ('alt_i',    'c1c1c1c1-0000-4000-8000-0000000000c1/logo-89abcdef0123456789abcdef.png'),
  ('logo_m',   'c2c2c2c2-0000-4000-8000-0000000000c2/logo-fedcba9876543210fedcba98.webp'),
  ('fremd_i',  'c1c1c1c1-0000-4000-8000-0000000000c1/logo-aaaaaaaaaaaaaaaaaaaaaaaa.png');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-auftritt-buero@test.invalid', 'x', now(), now()
  from ids where name in ('i', 'm', 'x');

insert into privat.bueros (id, name, inhaber)
values ((select id::uuid from ids where name = 'k'), 'Agentur K', (select id::uuid from ids where name = 'i'));
insert into privat.abos (buero, paket, intervall, plaetze, status)
values ((select id::uuid from ids where name = 'k'), 'ag', 'monat', 10, 'active');
insert into privat.buero_mitglieder (buero, nutzer, rolle) values
  ((select id::uuid from ids where name = 'k'), (select id::uuid from ids where name = 'i'), 'inhaber'),
  ((select id::uuid from ids where name = 'k'), (select id::uuid from ids where name = 'm'), 'mitglied');

insert into public.berater_profil (besitzer, firma, berater, farbe, logo) values
  ((select id::uuid from ids where name = 'i'), 'Muster Finanz GmbH', 'Ingrid Inhaberin', '#0f766e', (select id from ids where name = 'logo_i')),
  ((select id::uuid from ids where name = 'm'), 'Eigene Firma M', 'Max Mitglied', '#7f1d1d', (select id from ids where name = 'logo_m')),
  ((select id::uuid from ids where name = 'x'), 'X AG', 'Xaver Extern', null, null);

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

do $$
begin
  insert into storage.objects (bucket_id, name)
  select 'branding', id from ids where name in ('logo_i', 'alt_i', 'logo_m');
exception when others then
  insert into ergebnis values (0, 'Logo-Eintraege fuer den Test anlegen', 'angelegt', sqlerrm, false);
end $$;

-- Was buero_auftritt() und die Leseregel des Logos fuer einen Nutzer ergeben
create or replace function pg_temp.auftritt_text() returns text language sql as $$
  select coalesce(
    (select format('%s/%s/%s/%s', b->>'firma', coalesce(b->>'farbe', 'null'),
                   case b->>'logo' when (select id from ids where name = 'logo_i') then 'logo_i' else coalesce(b->>'logo', 'null') end,
                   b->>'inhaber')
       from (select public.buero_auftritt() as b) x where b is not null),
    'null');
$$;
create or replace function pg_temp.sichtbar(p_name text) returns bigint language sql as $$
  select count(*) from storage.objects o
   where o.bucket_id = 'branding' and o.name = (select id from ids where name = p_name);
$$;
grant execute on function pg_temp.auftritt_text() to authenticated, anon;
grant execute on function pg_temp.sichtbar(text) to authenticated, anon;

-- ---------- Mitglied M ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c2c2c2c2-0000-4000-8000-0000000000c2"}';

insert into ergebnis
select 1, 'M bekommt Logo, Firmenname, Farbe und Namen der Inhaberin', 'Muster Finanz GmbH/#0f766e/logo_i/Ingrid Inhaberin',
       pg_temp.auftritt_text(), pg_temp.auftritt_text() = 'Muster Finanz GmbH/#0f766e/logo_i/Ingrid Inhaberin';

insert into ergebnis
select 2, 'M laedt das aktuelle Logo der Inhaberin', '1', pg_temp.sichtbar('logo_i')::text, pg_temp.sichtbar('logo_i') = 1;

insert into ergebnis
select 3, 'M sieht keine andere Datei im Ordner der Inhaberin', '0', pg_temp.sichtbar('alt_i')::text, pg_temp.sichtbar('alt_i') = 0;

insert into ergebnis
select 4, 'M laedt weiter das eigene Logo', '1', pg_temp.sichtbar('logo_m')::text, pg_temp.sichtbar('logo_m') = 1;

do $$
begin
  insert into storage.objects (bucket_id, name) values ('branding', (select id from ids where name = 'fremd_i'));
  insert into ergebnis values (5, 'M laedt in den Ordner der Inhaberin hoch', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (5, 'M laedt in den Ordner der Inhaberin hoch', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

insert into ergebnis
select 6, 'Die eigene Zeile von M bleibt, wie sie ist', 'Eigene Firma M/#7f1d1d/logo_m',
       format('%s/%s/%s', firma, farbe, case logo when (select id from ids where name = 'logo_m') then 'logo_m' else logo end),
       firma = 'Eigene Firma M' and farbe = '#7f1d1d' and logo = (select id from ids where name = 'logo_m')
  from public.berater_profil;

insert into ergebnis
select 7, 'Kollegen: die Agentur ist fuer alle die der Inhaberin', '2 x Muster Finanz GmbH',
       count(*) || ' x ' || string_agg(distinct agentur, ','),
       count(*) = 2 and bool_and(agentur = 'Muster Finanz GmbH')
  from public.bav_kollegen();

-- ---------- Inhaberin I und X ohne Buero ----------
set local request.jwt.claims = '{"sub":"c1c1c1c1-0000-4000-8000-0000000000c1"}';
insert into ergebnis
select 8, 'Die Inhaberin bekommt nichts (sie pflegt ihren eigenen Auftritt)', 'null', pg_temp.auftritt_text(), pg_temp.auftritt_text() = 'null';

set local request.jwt.claims = '{"sub":"c3c3c3c3-0000-4000-8000-0000000000c3"}';
insert into ergebnis
select 9, 'X ohne Buero bekommt nichts', 'null', pg_temp.auftritt_text(), pg_temp.auftritt_text() = 'null';

insert into ergebnis
select 10, 'X laedt das Logo der Inhaberin nicht', '0', pg_temp.sichtbar('logo_i')::text, pg_temp.sichtbar('logo_i') = 0;

-- ---------- Die Inhaberin leert ihren Auftritt: fuer alle leer ----------
reset role;
update public.berater_profil set firma = '', farbe = null, logo = null
 where besitzer = (select id::uuid from ids where name = 'i');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c2c2c2c2-0000-4000-8000-0000000000c2"}';
insert into ergebnis
select 11, 'Hat die Inhaberin nichts eingetragen, bleibt es fuer M leer', '/null/null/Ingrid Inhaberin',
       pg_temp.auftritt_text(), pg_temp.auftritt_text() = '/null/null/Ingrid Inhaberin';

insert into ergebnis
select 12, 'Die fruehere Datei der Inhaberin ist fuer M nicht mehr lesbar', '0', pg_temp.sichtbar('logo_i')::text, pg_temp.sichtbar('logo_i') = 0;

reset role;
update public.berater_profil set firma = 'Muster Finanz GmbH', farbe = '#0f766e', logo = (select id from ids where name = 'logo_i')
 where besitzer = (select id::uuid from ids where name = 'i');

-- ---------- M tritt aus ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c2c2c2c2-0000-4000-8000-0000000000c2"}';
select public.buero_verlassen();

insert into ergebnis
select 13, 'Nach dem Austritt bekommt M nichts mehr', 'null', pg_temp.auftritt_text(), pg_temp.auftritt_text() = 'null';

insert into ergebnis
select 14, 'Nach dem Austritt laedt M das Logo der Inhaberin nicht mehr', '0', pg_temp.sichtbar('logo_i')::text, pg_temp.sichtbar('logo_i') = 0;

insert into ergebnis
select 15, 'Nach dem Austritt gilt wieder der eigene Auftritt von M', 'Eigene Firma M/#7f1d1d/logo_m',
       format('%s/%s/%s', firma, farbe, case logo when (select id from ids where name = 'logo_m') then 'logo_m' else logo end),
       firma = 'Eigene Firma M' and farbe = '#7f1d1d' and logo = (select id from ids where name = 'logo_m')
  from public.berater_profil;

-- ---------- Ohne Konto und Rechte ----------
set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.buero_auftritt();
  insert into ergebnis values (16, 'anon fragt den Auftritt des Bueros ab', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (16, 'anon fragt den Auftritt des Bueros ab', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

reset role;
insert into ergebnis
select 17, 'Rechte: nur authenticated, security definer mit festem search_path', 'so',
       concat_ws(', ',
         case when has_function_privilege('anon', 'public.buero_auftritt()', 'execute') then 'anon darf' end,
         case when not has_function_privilege('authenticated', 'public.buero_auftritt()', 'execute') then 'authenticated darf nicht' end,
         (select case when not p.prosecdef then 'kein definer' end from pg_proc p where p.oid = 'public.buero_auftritt()'::regprocedure),
         (select case when not coalesce(p.proconfig @> array['search_path=""'], false) then 'search_path offen' end
            from pg_proc p where p.oid = 'public.buero_auftritt()'::regprocedure)),
       not has_function_privilege('anon', 'public.buero_auftritt()', 'execute')
       and has_function_privilege('authenticated', 'public.buero_auftritt()', 'execute')
       and (select p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false)
              from pg_proc p where p.oid = 'public.buero_auftritt()'::regprocedure);

select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
