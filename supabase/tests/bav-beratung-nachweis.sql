-- Nachweis der Absicherung der bAV-Mitarbeiterberatung: Tabellen bav_firmen
-- und bav_beratungen, Bucket bav-firmenlogos — mit zwei Beratern und anon.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Dateien werden nur als Zeilen in
-- storage.objects angelegt (so prueft der Speicher seine Policies auch beim
-- echten Hochladen). Geloescht wird nichts: Die Kaskade wird am Fremdschluessel
-- abgelesen, damit der Nachweis auch ueber Werkzeuge laeuft, die jede
-- Loeschanweisung erst bestaetigen lassen.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-bav@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-bav@test.invalid','x',now(),now());

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

-- Feste IDs, damit Pfade und Verweise im Test lesbar bleiben.
create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('firma_a', 'a1a1a1a1-0000-4000-8000-00000000000a'),
  ('firma_b', 'b2b2b2b2-0000-4000-8000-00000000000b'),
  ('beratung_a', 'a3a3a3a3-0000-4000-8000-00000000000c'),
  ('beratung_b', 'b4b4b4b4-0000-4000-8000-00000000000d');

-- ---------- Berater A: Firmen ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1"}';

do $$
begin
  insert into public.bav_firmen (id, name, angebot)
  values ((select id from ids where name = 'firma_a'), 'Muster GmbH', '{"modell":{"art":"zuschuss","quote":0.5,"deckelMonat":100}}');
  insert into ergebnis values (1,'A legt eine Firma an (Besitzer per Vorgabe)','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (1,'A legt eine Firma an (Besitzer per Vorgabe)','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into public.bav_firmen (name) values ('   ');
  insert into ergebnis values (2,'Firma ohne Namen','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (2,'Firma ohne Namen','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into public.bav_firmen (besitzer, name) values ('bbbbbbbb-0000-4000-8000-0000000000f2', 'Fremd');
  insert into ergebnis values (3,'A legt eine Firma fuer B an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (3,'A legt eine Firma fuer B an','abgewiesen','abgewiesen',true);
end $$;

-- Der Trigger haelt den Besitzer fest (ein Fehler waere ebenso recht).
do $$
begin
  update public.bav_firmen set besitzer = 'bbbbbbbb-0000-4000-8000-0000000000f2';
exception when others then
  null;
end $$;
insert into ergebnis
select 4, 'A schiebt die eigene Firma B zu', 'bleibt bei A', coalesce(min(besitzer::text), '—'),
       count(*) = 1 and min(besitzer::text) = 'aaaaaaaa-0000-4000-8000-0000000000f1'
  from public.bav_firmen;

do $$
begin
  update public.bav_firmen set angebot = '[1,2]';
  insert into ergebnis values (5,'Angebot ist kein Objekt','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (5,'Angebot ist kein Objekt','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.bav_firmen
     set logo = 'aaaaaaaa-0000-4000-8000-0000000000f1/b2b2b2b2-0000-4000-8000-00000000000b-0123456789abcdef01234567.png';
  insert into ergebnis values (6,'Logo-Pfad einer anderen Firma','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (6,'Logo-Pfad einer anderen Firma','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.bav_firmen
     set logo = 'aaaaaaaa-0000-4000-8000-0000000000f1/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234567.webp';
  insert into ergebnis values (7,'Logo-Pfad der eigenen Firma','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (7,'Logo-Pfad der eigenen Firma','angenommen', sqlerrm, false);
end $$;

-- ---------- Berater A: Beratungen ----------
do $$
begin
  insert into public.bav_beratungen (id, firma, mitarbeiter, daten)
  values ((select id from ids where name = 'beratung_a'), (select id from ids where name = 'firma_a'),
          'Anna Beispiel', '{"angaben":{"jahresbrutto":48000}}');
  insert into ergebnis values (8,'A legt eine Beratung zur eigenen Firma an','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (8,'A legt eine Beratung zur eigenen Firma an','angenommen', sqlerrm, false);
end $$;

do $$
begin
  update public.bav_beratungen set status = 'ja';
  insert into ergebnis values (9,'Unbekannter Status','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (9,'Unbekannter Status','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into public.bav_beratungen (besitzer, firma)
  values ('bbbbbbbb-0000-4000-8000-0000000000f2', (select id from ids where name = 'firma_a'));
  insert into ergebnis values (10,'A legt eine Beratung fuer B an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (10,'A legt eine Beratung fuer B an','abgewiesen','abgewiesen',true);
end $$;

with u as (
  update public.bav_beratungen set status = 'teilnahme', beraten_am = current_date returning 1
)
insert into ergebnis select 11, 'A aendert die eigene Beratung', '1', count(*)::text, count(*) = 1 from u;

-- ---------- Berater A: Logo hochladen ----------
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'aaaaaaaa-0000-4000-8000-0000000000f1/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234567.webp');
  insert into ergebnis values (12,'A laedt das Logo der eigenen Firma hoch','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (12,'A laedt das Logo der eigenen Firma hoch','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'aaaaaaaa-0000-4000-8000-0000000000f1/c5c5c5c5-0000-4000-8000-00000000000e-0123456789abcdef01234567.png');
  insert into ergebnis values (13,'A laedt ein Logo fuer eine unbekannte Firma hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (13,'A laedt ein Logo fuer eine unbekannte Firma hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'bbbbbbbb-0000-4000-8000-0000000000f2/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234567.png');
  insert into ergebnis values (14,'A laedt in den Ordner von B','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (14,'A laedt in den Ordner von B','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'aaaaaaaa-0000-4000-8000-0000000000f1/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234567.svg');
  insert into ergebnis values (15,'A laedt ein SVG hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (15,'A laedt ein SVG hoch','abgewiesen','abgewiesen',true);
end $$;

-- ---------- Berater A: Hoechstzahl Firmen ----------
do $$
begin
  insert into public.bav_firmen (name) select 'Firma ' || g from generate_series(2, 200) g;
  insert into ergebnis values (16,'A legt Firma 2 bis 200 an','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (16,'A legt Firma 2 bis 200 an','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into public.bav_firmen (name) values ('Firma 201');
  insert into ergebnis values (17,'A legt Firma 201 an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (17,'A legt Firma 201 an','abgewiesen','abgewiesen',true);
end $$;

-- ---------- Fremder Berater B ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000f2"}';

do $$
begin
  insert into public.bav_firmen (id, name) values ((select id from ids where name = 'firma_b'), 'Andere AG');
  insert into public.bav_beratungen (id, firma, mitarbeiter)
  values ((select id from ids where name = 'beratung_b'), (select id from ids where name = 'firma_b'), 'Ben Beispiel');
  insert into ergebnis values (18,'B legt eigene Firma und Beratung an','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (18,'B legt eigene Firma und Beratung an','angenommen', sqlerrm, false);
end $$;

insert into ergebnis
select 19, 'B sieht nur die eigene Firma', '1', count(*)::text, count(*) = 1 from public.bav_firmen;

insert into ergebnis
select 20, 'B sieht nur die eigene Beratung', '1', count(*)::text, count(*) = 1 from public.bav_beratungen;

with u as (update public.bav_firmen set name = 'Uebernommen' where id = (select id from ids where name = 'firma_a') returning 1)
insert into ergebnis select 21, 'B aendert die Firma von A', '0', count(*)::text, count(*) = 0 from u;

do $$
begin
  insert into public.bav_beratungen (firma, mitarbeiter)
  values ((select id from ids where name = 'firma_a'), 'Untergeschoben');
  insert into ergebnis values (22,'B haengt eine Beratung an die Firma von A','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (22,'B haengt eine Beratung an die Firma von A','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.bav_beratungen set firma = (select id from ids where name = 'firma_a')
   where id = (select id from ids where name = 'beratung_b');
  insert into ergebnis values (23,'B verschiebt die eigene Beratung zur Firma von A','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (23,'B verschiebt die eigene Beratung zur Firma von A','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'bbbbbbbb-0000-4000-8000-0000000000f2/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234568.png');
  insert into ergebnis values (24,'B laedt ein Logo fuer die Firma von A in den eigenen Ordner','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (24,'B laedt ein Logo fuer die Firma von A in den eigenen Ordner','abgewiesen','abgewiesen',true);
end $$;

insert into ergebnis
select 25, 'B sieht die Dateien von A', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'bav-firmenlogos';

-- ---------- Ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

do $$
begin
  perform * from public.bav_firmen;
  insert into ergebnis values (26,'anon liest die Firmen','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (26,'anon liest die Firmen','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

do $$
begin
  perform * from public.bav_beratungen;
  insert into ergebnis values (27,'anon liest die Beratungen','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (27,'anon liest die Beratungen','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('bav-firmenlogos', 'aaaaaaaa-0000-4000-8000-0000000000f1/a1a1a1a1-0000-4000-8000-00000000000a-0123456789abcdef01234569.png');
  insert into ergebnis values (28,'anon laedt ein Logo hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (28,'anon laedt ein Logo hoch','abgewiesen','abgewiesen',true);
end $$;

-- ---------- Aufbau (als Eigentuemer der Datenbank) ----------
reset role;

insert into ergebnis
select 29, 'RLS erzwungen auf beiden Tabellen', 'ja', string_agg(relname || '=' || relforcerowsecurity::text, ', '),
       bool_and(relrowsecurity and relforcerowsecurity)
  from pg_class
 where oid in ('public.bav_firmen'::regclass, 'public.bav_beratungen'::regclass);

insert into ergebnis
select 30, 'Beratungen gehen mit ihrer Firma (Kaskade)', 'c', coalesce(min(confdeltype::text), '—'),
       count(*) = 1 and min(confdeltype::text) = 'c'
  from pg_constraint
 where conrelid = 'public.bav_beratungen'::regclass and confrelid = 'public.bav_firmen'::regclass and contype = 'f';

insert into ergebnis
select 31, 'anon hat keine Rechte auf den Tabellen', 'keine',
       coalesce(nullif(concat_ws(', ',
         case when has_table_privilege('anon', 'public.bav_firmen', 'select') then 'firmen select' end,
         case when has_table_privilege('anon', 'public.bav_beratungen', 'select') then 'beratungen select' end,
         case when has_table_privilege('anon', 'public.bav_firmen', 'insert') then 'firmen insert' end,
         case when has_table_privilege('anon', 'public.bav_beratungen', 'insert') then 'beratungen insert' end), ''), 'keine'),
       not (has_table_privilege('anon', 'public.bav_firmen', 'select')
            or has_table_privilege('anon', 'public.bav_beratungen', 'select')
            or has_table_privilege('anon', 'public.bav_firmen', 'insert')
            or has_table_privilege('anon', 'public.bav_beratungen', 'insert'));

insert into ergebnis
select 32, 'Bucket privat, 1 MB, nur PNG und WebP', 'privat, 1048576, png+webp',
       format('%s, %s, %s', case when public then 'oeffentlich' else 'privat' end, file_size_limit, allowed_mime_types::text),
       not public and file_size_limit = 1048576 and allowed_mime_types = array['image/png', 'image/webp']
  from storage.buckets where id = 'bav-firmenlogos';

select * from ergebnis order by nr;

rollback;
