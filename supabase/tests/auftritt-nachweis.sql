-- Nachweis der Absicherung von „Ihr Auftritt im Gutachten“:
-- Tabelle berater_profil und Bucket branding, mit zwei Beratern und anon.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Die Dateien werden nur als Zeilen
-- in storage.objects angelegt (so prueft der Speicher seine Policies auch
-- beim echten Hochladen); Inhalte gibt es keine. Geloescht wird nichts, damit
-- der Nachweis auch ueber Werkzeuge laeuft, die jede Loeschanweisung erst
-- bestaetigen lassen.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-auftritt@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-0000000000e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-auftritt@test.invalid','x',now(),now());

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

-- ---------- Berater A: eigene Zeile ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

do $$
begin
  insert into public.berater_profil (firma, farbe) values ('Muster Finanz GmbH', '#1e3a8a');
  insert into ergebnis values (1,'A legt die eigene Zeile an (Besitzer per Vorgabe)','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (1,'A legt die eigene Zeile an (Besitzer per Vorgabe)','angenommen', sqlerrm, false);
end $$;

with u as (
  update public.berater_profil set berater = 'Max Mustermann', telefon = '0711 123456' returning 1
)
insert into ergebnis select 2, 'A aendert die eigene Zeile', '1', count(*)::text, count(*) = 1 from u;

do $$
begin
  insert into public.berater_profil (besitzer, firma) values ('bbbbbbbb-0000-4000-8000-0000000000e2', 'Fremd');
  insert into ergebnis values (3,'A legt eine Zeile fuer B an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (3,'A legt eine Zeile fuer B an','abgewiesen','abgewiesen',true);
end $$;

-- Der Trigger haelt den Besitzer fest: Die Zeile bleibt bei A. (Ein Fehler
-- waere ebenso recht — entscheidend ist, wem die Zeile danach gehoert.)
do $$
begin
  update public.berater_profil set besitzer = 'bbbbbbbb-0000-4000-8000-0000000000e2';
exception when others then
  null;
end $$;
insert into ergebnis
select 4, 'A schiebt die eigene Zeile B zu', 'bleibt bei A', coalesce(min(besitzer::text), '—'),
       count(*) = 1 and min(besitzer::text) = 'aaaaaaaa-0000-4000-8000-0000000000e1'
  from public.berater_profil;

do $$
begin
  update public.berater_profil set farbe = '#ABC';
  insert into ergebnis values (5,'Ungueltige Farbe','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (5,'Ungueltige Farbe','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.berater_profil set firma = repeat('x', 121);
  insert into ergebnis values (6,'Firmenname mit 121 Zeichen','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (6,'Firmenname mit 121 Zeichen','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.berater_profil set logo = 'bbbbbbbb-0000-4000-8000-0000000000e2/logo-0123456789abcdef01234567.png';
  insert into ergebnis values (7,'Logo-Pfad im Ordner von B','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (7,'Logo-Pfad im Ordner von B','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  update public.berater_profil set logo = 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef01234567.png';
  insert into ergebnis values (8,'Logo-Pfad im eigenen Ordner','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (8,'Logo-Pfad im eigenen Ordner','angenommen', sqlerrm, false);
end $$;

-- ---------- Berater A: Logo hochladen ----------
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef01234567.png');
  insert into ergebnis values (9,'A laedt ein Logo in den eigenen Ordner','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (9,'A laedt ein Logo in den eigenen Ordner','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'bbbbbbbb-0000-4000-8000-0000000000e2/logo-0123456789abcdef01234567.png');
  insert into ergebnis values (10,'A laedt in den Ordner von B','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (10,'A laedt in den Ordner von B','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef01234567.svg');
  insert into ergebnis values (11,'A laedt ein SVG hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (11,'A laedt ein SVG hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/unter/logo-0123456789abcdef01234567.png');
  insert into ergebnis values (12,'A legt einen Unterordner an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (12,'A legt einen Unterordner an','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/bild.png');
  insert into ergebnis values (13,'A laedt mit falschem Namensmuster hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (13,'A laedt mit falschem Namensmuster hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef01234568.webp'),
    ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef01234569.png');
  insert into ergebnis values (14,'A laedt eine 2. und 3. Datei hoch','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (14,'A laedt eine 2. und 3. Datei hoch','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef0123456a.png');
  insert into ergebnis values (15,'A laedt eine 4. Datei hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (15,'A laedt eine 4. Datei hoch','abgewiesen','abgewiesen',true);
end $$;

insert into ergebnis
select 16, 'A sieht die eigenen Dateien', '3', count(*)::text, count(*) = 3
  from storage.objects where bucket_id = 'branding';

-- ---------- Fremder Berater B ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e2"}';

insert into ergebnis
select 17, 'B sieht die Zeile von A', '0', count(*)::text, count(*) = 0 from public.berater_profil;

with u as (update public.berater_profil set firma = 'Uebernommen' returning 1)
insert into ergebnis select 18, 'B aendert die Zeile von A', '0', count(*)::text, count(*) = 0 from u;

insert into ergebnis
select 19, 'B sieht die Dateien von A', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'branding';

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef0123456b.png');
  insert into ergebnis values (20,'B laedt in den Ordner von A','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (20,'B laedt in den Ordner von A','abgewiesen','abgewiesen',true);
end $$;

-- ---------- Ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

do $$
begin
  perform * from public.berater_profil;
  insert into ergebnis values (21,'anon liest die Tabelle','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (21,'anon liest die Tabelle','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('branding', 'aaaaaaaa-0000-4000-8000-0000000000e1/logo-0123456789abcdef0123456c.png');
  insert into ergebnis values (22,'anon laedt ein Logo hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (22,'anon laedt ein Logo hoch','abgewiesen','abgewiesen',true);
end $$;

insert into ergebnis
select 23, 'anon sieht Logos', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'branding';

do $$
begin
  perform public.branding_pfad_erlaubt('x');
  insert into ergebnis values (24,'anon ruft die Pruefung auf','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (24,'anon ruft die Pruefung auf','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

-- ---------- Bucket ----------
reset role;
insert into ergebnis
select 25, 'Bucket privat, 1 MB, nur PNG und WebP', 'false 1048576 image/png,image/webp',
       public::text || ' ' || file_size_limit::text || ' ' || array_to_string(allowed_mime_types, ','),
       not public and file_size_limit = 1048576 and allowed_mime_types = array['image/png', 'image/webp']
  from storage.buckets where id = 'branding';

select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
