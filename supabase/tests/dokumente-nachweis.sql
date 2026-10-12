-- Nachweis der Absicherung der Unterlagen im Vorsorge-Check:
-- Kunde ohne Konto, zwei Berater, die Service-Rolle der Edge Function.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Die Dateien werden dabei nur als
-- Zeilen in storage.objects angelegt (so prueft der Speicher seine Policies
-- auch beim echten Hochladen); Inhalte gibt es keine. Ausfuehren gegen die
-- Zieldatenbank, etwa ueber den SQL-Editor oder `psql -f`.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-dok@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-dok@test.invalid','x',now(),now());

-- Drei Anfragen von Berater A: offen, abgelaufen, und eine fuer die Obergrenze.
insert into public.check_anfragen (code, berater, kunde, erstellt_am, gueltig_bis) values
  ('d0c00000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-0000000000d1','Familie Muster', now(), now() + interval '30 days'),
  ('d0c00000-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-0000000000d1','Abgelaufen', now() - interval '40 days', now() - interval '10 days'),
  ('d0c00000-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-0000000000d1','Viele Dateien', now(), now() + interval '30 days');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

-- ---------- Kunde ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

do $$
begin
  insert into storage.objects (bucket_id, name, user_metadata)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000001/a1b2c3.jpg',
          '{"name":"Gehaltsabrechnung.jpg","art":"einkommen"}');
  insert into ergebnis values (1,'Kunde laedt mit gueltigem Code hoch','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (1,'Kunde laedt mit gueltigem Code hoch','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000002/a1b2c3.jpg');
  insert into ergebnis values (2,'Kunde laedt mit abgelaufenem Code hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (2,'Kunde laedt mit abgelaufenem Code hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'deadbeef-0000-4000-8000-000000000009/a1b2c3.jpg');
  insert into ergebnis values (3,'Kunde laedt mit erfundenem Code hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (3,'Kunde laedt mit erfundenem Code hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000001/programm.exe');
  insert into ergebnis values (4,'Kunde laedt eine unerlaubte Dateiart hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (4,'Kunde laedt eine unerlaubte Dateiart hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000001/unter/a1b2c3.pdf');
  insert into ergebnis values (5,'Kunde legt einen Unterordner an','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (5,'Kunde legt einen Unterordner an','abgewiesen','abgewiesen',true);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'a1b2c3.pdf');
  insert into ergebnis values (6,'Kunde laedt ohne Code-Ordner hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (6,'Kunde laedt ohne Code-Ordner hoch','abgewiesen','abgewiesen',true);
end $$;

do $$
declare i integer;
begin
  for i in 1..20 loop
    insert into storage.objects (bucket_id, name)
    values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000003/datei-' || i || '.pdf');
  end loop;
  insert into ergebnis values (7,'Kunde laedt 20 Dateien hoch','angenommen','angenommen',true);
exception when others then
  insert into ergebnis values (7,'Kunde laedt 20 Dateien hoch','angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000003/datei-21.pdf');
  insert into ergebnis values (8,'Kunde laedt eine 21. Datei hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (8,'Kunde laedt eine 21. Datei hoch','abgewiesen','abgewiesen',true);
end $$;

insert into ergebnis
select 9, 'Kunde liest Dateien', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'check-dokumente';

do $$
begin
  perform * from public.check_dokumente_liste();
  insert into ergebnis values (10,'Kunde ruft die Liste des Beraters ab','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (10,'Kunde ruft die Liste des Beraters ab','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

do $$
begin
  perform * from public.check_dokumente_verwaist(10);
  insert into ergebnis values (11,'Kunde ruft die Aufraeumliste ab','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (11,'Kunde ruft die Aufraeumliste ab','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

-- ---------- Berater A, bevor der Kunde absendet ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1"}';

insert into ergebnis
select 12, 'A sieht vor dem Eingang keine Datei', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'check-dokumente';

insert into ergebnis
select 13, 'A: Liste vor dem Eingang leer', '0', count(*)::text, count(*) = 0
  from public.check_dokumente_liste();

-- ---------- Kunde sendet ab ----------
set local role anon;
set local request.jwt.claims = '{}';

insert into public.check_eingaenge (code, daten)
values ('d0c00000-0000-4000-8000-000000000001', '{"schemaVersion":1}');

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('check-dokumente', 'd0c00000-0000-4000-8000-000000000001/nachzuegler.pdf');
  insert into ergebnis values (14,'Kunde laedt nach dem Absenden hoch','abgewiesen','DURCHGEGANGEN',false);
exception when others then
  insert into ergebnis values (14,'Kunde laedt nach dem Absenden hoch','abgewiesen','abgewiesen',true);
end $$;

-- ---------- Fremder Berater B ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000d2"}';

insert into ergebnis
select 15, 'B sieht die Dateien von A', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'check-dokumente';

insert into ergebnis
select 16, 'B: Liste leer', '0', count(*)::text, count(*) = 0 from public.check_dokumente_liste();

do $$
begin
  perform * from public.check_dokumente_verwaist(10);
  insert into ergebnis values (17,'Berater ruft die Aufraeumliste ab','abgewiesen','DURCHGEGANGEN',false);
exception when insufficient_privilege then
  insert into ergebnis values (17,'Berater ruft die Aufraeumliste ab','abgewiesen','abgewiesen (insufficient_privilege)',true);
end $$;

-- ---------- Berater A nach dem Eingang ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1"}';

-- Genau die eine Datei der eingegangenen Anfrage — nicht die 20 der offenen.
insert into ergebnis
select 18, 'A sieht nach dem Eingang die eine Datei', '1', count(*)::text, count(*) = 1
  from storage.objects where bucket_id = 'check-dokumente';

insert into ergebnis
select 19, 'A: Liste mit Name und Art aus den Metadaten', 'Gehaltsabrechnung.jpg / einkommen',
       coalesce(min(name || ' / ' || art), '—'),
       count(*) = 1 and min(name) = 'Gehaltsabrechnung.jpg' and min(art) = 'einkommen'
  from public.check_dokumente_liste();

-- Verwaiste Dateien: ein Code ohne Anfrage, so wie nach dem Loeschen einer
-- Anfrage. Als Eigentuemer an den Policies vorbei angelegt — der Nachweis
-- loescht nichts, damit er auch ueber Werkzeuge laeuft, die jede
-- Loeschanweisung erst bestaetigen lassen.
reset role;
insert into storage.objects (bucket_id, name)
select 'check-dokumente', 'd0c00000-0000-4000-8000-000000000004/datei-' || i || '.pdf'
  from generate_series(1, 20) i;

-- ---------- Edge Function (Service-Rolle) ----------
set local role service_role;

insert into ergebnis
select 20, 'Aufraeumliste: alle Dateien ohne Anfrage', '20', count(*)::text, count(*) = 20
  from public.check_dokumente_verwaist(1000) n
 where n like 'd0c00000-0000-4000-8000-000000000004/%';

insert into ergebnis
select 21, 'Aufraeumliste: keine Datei einer bestehenden Anfrage', '0', count(*)::text, count(*) = 0
  from public.check_dokumente_verwaist(1000) n
 where n like 'd0c00000-0000-4000-8000-000000000001/%'
    or n like 'd0c00000-0000-4000-8000-000000000003/%';

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
