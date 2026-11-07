-- Nachweis: Anträge mit Kundenlink und Ausweiskopien (Migration 20261104120000_antraege).
-- Berater A und B, beide mit Paket Rentenplanung. Der Kunde ist anon.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Dateien werden nur als Zeilen in
-- storage.objects angelegt (so prueft der Speicher seine Policies auch beim
-- echten Hochladen). Geloescht wird nur in den Funktionen selbst;
-- Loeschrechte werden am Katalog abgelesen (storage.protect_delete).
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('a',  'aaaaaaaa-0000-4000-8000-0000000000e1'),
  ('b',  'bbbbbbbb-0000-4000-8000-0000000000e2'),
  ('ka', 'a0a0a0a0-0000-4000-8000-0000000000e3'),
  ('kb', 'b0b0b0b0-0000-4000-8000-0000000000e4'),
  ('x',  'e1e1e1e1-0000-4000-8000-0000000000e5'),
  ('y',  'e2e2e2e2-0000-4000-8000-0000000000e6'),
  ('z',  'e3e3e3e3-0000-4000-8000-0000000000e7'),
  ('w',  'e4e4e4e4-0000-4000-8000-0000000000e8'),
  ('zc', 'e5e5e5e5-0000-4000-8000-0000000000e9');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-antrag@test.invalid', 'x', now(), now()
  from ids where name in ('a', 'b');

insert into privat.bueros (id, name, inhaber) values
  ((select id from ids where name = 'ka'), 'Buero A', (select id from ids where name = 'a')),
  ((select id from ids where name = 'kb'), 'Buero B', (select id from ids where name = 'b'));
insert into privat.abos (buero, paket, intervall, plaetze, status) values
  ((select id from ids where name = 'ka'), 'rente', 'monat', 1, 'active'),
  ((select id from ids where name = 'kb'), 'rente', 'monat', 1, 'active');
insert into privat.buero_mitglieder (buero, nutzer, rolle) values
  ((select id from ids where name = 'ka'), (select id from ids where name = 'a'), 'inhaber'),
  ((select id from ids where name = 'kb'), (select id from ids where name = 'b'), 'inhaber');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;
-- Was die Funktionen zurueckgeben: Code und Frist je Antrag
create temp table link(antrag text primary key, code uuid, bis timestamptz) on commit drop;
grant all on link to anon, authenticated, service_role;

-- Wiederkehrend: eine Datei als Zeile anlegen; true, wenn die Policy sie annimmt.
create function pg_temp.hochladen(p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values ('antrag-dokumente', p_name);
  return true;
exception when others then
  return false;
end $$;
grant execute on function pg_temp.hochladen(text) to anon, authenticated;

-- ---------- Berater A legt Anträge an ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

insert into public.antraege (kunde, loesungen, angaben)
values ('Familie Muster',
        '[{"id":"p","art":"privat","anbieter":"Musterleben","inhaber":"A","beitragMonat":100,"renteMonat":250},
          {"id":"g","art":"bav","anbieter":"GGF-Versorgung","inhaber":"A","agZuschussMonat":300,"renteMonat":400}]',
        '{}');

do $$
begin
  insert into public.antraege (id, kunde) values ((select id from ids where name = 'y'), 'Eigene ID');
  insert into ergebnis values (1, 'A waehlt die ID nicht selbst (Spaltenrechte)', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (1, 'A waehlt die ID nicht selbst (Spaltenrechte)', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  insert into public.antraege (kunde, code, link_bis) values ('Eigener Code', gen_random_uuid(), now() + interval '1 day');
  insert into ergebnis values (2, 'A setzt keinen Code beim Anlegen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (2, 'A setzt keinen Code beim Anlegen', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  update public.antraege set code = gen_random_uuid(), link_bis = now() + interval '1 day' where kunde = 'Familie Muster';
  insert into ergebnis values (3, 'A setzt keinen Code beim Aendern', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (3, 'A setzt keinen Code beim Aendern', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  update public.antraege set eingang = '{"bank":{}}', eingegangen_am = now() where kunde = 'Familie Muster';
  insert into ergebnis values (4, 'A schreibt keinen Eingang selbst', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (4, 'A schreibt keinen Eingang selbst', 'abgewiesen', 'abgewiesen', true);
end $$;

-- Die IDs merken (als postgres, das ueber RLS hinweg liest)
reset role;
update ids set id = (select id from public.antraege where kunde = 'Familie Muster') where name = 'x';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

insert into public.antraege (kunde, loesungen) values ('Nur Ausweis', '[{"id":"b1","art":"basis","anbieter":"Basis AG","inhaber":"A"}]');
reset role;
update ids set id = (select id from public.antraege where kunde = 'Nur Ausweis') where name = 'y';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

insert into ergebnis
select 5, 'A legt an und aendert die eigenen Angaben', 'ja',
       (select count(*) from public.antraege)::text,
       (select count(*) = 2 from public.antraege);
update public.antraege set angaben = '{"bezugsrecht":{"p":1}}' where id = (select id from ids where name = 'x');

-- ---------- 6–9: Link erstellen ----------
insert into link
select 'x', l.code, l.link_bis
  from public.antrag_link_erstellen((select id from ids where name = 'x'), array['bezugsrecht', 'bank', 'ausweis', 'bank']) l;
insert into link
select 'y', l.code, l.link_bis
  from public.antrag_link_erstellen((select id from ids where name = 'y'), array['ausweis']) l;

insert into ergebnis
select 6, 'Link: Code von der Datenbank, 30 Tage, Felder ohne Doppel', 'so',
       concat_ws(', ', (select bis::date - now()::date from link where antrag = 'x'),
                 (select array_to_string(offen, '/') from public.antraege where id = (select id from ids where name = 'x'))),
       (select code is not null and bis between now() + interval '29 days' and now() + interval '31 days' from link where antrag = 'x')
       and (select offen = array['ausweis', 'bank', 'bezugsrecht'] from public.antraege where id = (select id from ids where name = 'x'));

do $$
begin
  perform public.antrag_link_erstellen((select id from ids where name = 'x'), array['geburtsdatum']);
  insert into ergebnis values (7, 'Unbekanntes Feld wird abgewiesen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (7, 'Unbekanntes Feld wird abgewiesen', 'abgewiesen', 'abgewiesen', true);
end $$;

-- B: sieht A nicht, aendert nichts, erstellt keinen Link fuer A
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e2"}';
insert into ergebnis
select 8, 'B sieht die Antraege von A nicht und aendert nichts', '0 / 0 / 0',
       concat_ws(' / ', (select count(*) from public.antraege),
                 (select count(*) from (select 1 from public.antrag_link_erstellen((select id from ids where name = 'x'), array['bank'])) q),
                 (select count(*) from public.antraege where kunde = 'Familie Muster')),
       (select count(*) = 0 from public.antraege)
       and (select count(*) = 0 from public.antrag_link_erstellen((select id from ids where name = 'x'), array['bank']));
update public.antraege set kunde = 'Uebernommen' where id = (select id from ids where name = 'x');
insert into ergebnis
select 9, 'B kann weder zurueckziehen noch uebernehmen', 'false / false',
       concat_ws(' / ', public.antrag_link_zurueckziehen((select id from ids where name = 'x')),
                 public.antrag_eingang_uebernehmen((select id from ids where name = 'x'), '{}')),
       not public.antrag_link_zurueckziehen((select id from ids where name = 'x'))
       and not public.antrag_eingang_uebernehmen((select id from ids where name = 'x'), '{}');

-- ---------- Kunde ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

insert into ergebnis
select 10, 'Kunde prueft den Link: offen, Felder, Loesungen nur mit Art und Anbieter', 'offen',
       public.antrag_link_pruefen((select code from link where antrag = 'x'))::text,
       (select (v ->> 'status') = 'offen'
               and v -> 'offen' = '["ausweis","bank","bezugsrecht"]'::jsonb
               and v -> 'loesungen' = '[{"id":"p","art":"privat","anbieter":"Musterleben"},{"id":"g","art":"bav","anbieter":"GGF-Versorgung"}]'::jsonb
               and not (v::text like '%Familie%') and not (v::text like '%250%')
          from (select public.antrag_link_pruefen((select code from link where antrag = 'x')) v) q);

insert into ergebnis
select 11, 'Erfundener Code: ungueltig', 'ungueltig',
       public.antrag_link_pruefen(gen_random_uuid()) ->> 'status',
       public.antrag_link_pruefen(gen_random_uuid()) ->> 'status' = 'ungueltig';

do $$
begin
  perform count(*) from public.antraege;
  insert into ergebnis values (12, 'Kunde liest die Tabelle nicht', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (12, 'Kunde liest die Tabelle nicht', 'abgewiesen', 'abgewiesen', true);
end $$;

insert into ergebnis
select 13, 'Kunde laedt unter seinem Code hoch, sonst nirgends', 't / f / f / f / f',
       concat_ws(' / ',
         pg_temp.hochladen((select code from link where antrag = 'x') || '/vorne-1.jpg'),
         pg_temp.hochladen(gen_random_uuid() || '/vorne-2.jpg'),
         pg_temp.hochladen((select code from link where antrag = 'x') || '/vorne-3.png'),
         pg_temp.hochladen((select code from link where antrag = 'x') || '/unter/vorne-4.jpg'),
         pg_temp.hochladen((select id from ids where name = 'x') || '/vorne-5.jpg')),
       false;
-- Was herauskam, steht in "tatsaechlich"; gewertet wird es hier:
update ergebnis set bestanden = (tatsaechlich = 't / f / f / f / f') where nr = 13;

insert into ergebnis
select 14, 'Hoechstens vier Dateien je Ordner', 't / t / t / f',
       concat_ws(' / ',
         pg_temp.hochladen((select code from link where antrag = 'x') || '/hinten-1.jpg'),
         pg_temp.hochladen((select code from link where antrag = 'x') || '/hinten-2.jpg'),
         pg_temp.hochladen((select code from link where antrag = 'x') || '/hinten-3.jpg'),
         pg_temp.hochladen((select code from link where antrag = 'x') || '/hinten-4.jpg')),
       false;
update ergebnis set bestanden = (tatsaechlich = 't / t / t / f') where nr = 14;

insert into ergebnis
select 15, 'Kunde sieht keine Datei, auch nicht die eigene', '0',
       (select count(*) from storage.objects where bucket_id = 'antrag-dokumente')::text,
       (select count(*) = 0 from storage.objects where bucket_id = 'antrag-dokumente');

-- ---------- 16–18: Einreichen, falsch ----------
insert into ergebnis
select 16, 'Feld, nach dem nicht gefragt ist: abgewiesen', 'angaben',
       public.antrag_einreichen((select code from link where antrag = 'x'),
         '{"bezugsrecht":{"p":1,"g":2},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013000"},"geburtsdatum":"1980-01-01"}'),
       false;
update ergebnis set bestanden = (tatsaechlich = 'angaben') where nr = 16;

insert into ergebnis
select 17, 'IBAN mit falscher Pruefziffer: abgewiesen', 'angaben',
       public.antrag_einreichen((select code from link where antrag = 'x'),
         '{"bezugsrecht":{"p":1,"g":2},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013001"}}'),
       false;
update ergebnis set bestanden = (tatsaechlich = 'angaben') where nr = 17;

insert into ergebnis
select 18, 'Bezugsrecht fehlt fuer eine Loesung oder ist 5: abgewiesen', 'angaben / angaben',
       concat_ws(' / ',
         public.antrag_einreichen((select code from link where antrag = 'x'),
           '{"bezugsrecht":{"p":1},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013000"}}'),
         public.antrag_einreichen((select code from link where antrag = 'x'),
           '{"bezugsrecht":{"p":1,"g":5},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013000"}}')),
       false;
update ergebnis set bestanden = (tatsaechlich = 'angaben / angaben') where nr = 18;

-- ---------- 19–21: Einreichen, richtig ----------
insert into ergebnis
select 19, 'Kunde reicht ein: Bezugsrecht je Loesung, Bank mit gueltiger IBAN', 'ok',
       public.antrag_einreichen((select code from link where antrag = 'x'),
         '{"bezugsrecht":{"p":2,"g":1},"bank":{"inhaber":" Max Muster ","iban":"de89 3704 0044 0532 0130 00"}}'),
       false;
update ergebnis set bestanden = (tatsaechlich = 'ok') where nr = 19;

insert into ergebnis
select 20, 'Nur einmal: danach eingereicht, auch beim Pruefen', 'eingereicht / eingereicht',
       concat_ws(' / ',
         public.antrag_einreichen((select code from link where antrag = 'x'), '{"bezugsrecht":{"p":1,"g":1}}'),
         public.antrag_link_pruefen((select code from link where antrag = 'x')) ->> 'status'),
       false;
update ergebnis set bestanden = (tatsaechlich = 'eingereicht / eingereicht') where nr = 20;

insert into ergebnis
select 21, 'Nach dem Einreichen laedt der Kunde nichts mehr hoch', 'nein',
       pg_temp.hochladen((select code from link where antrag = 'x') || '/spaet-1.jpg')::text,
       not pg_temp.hochladen((select code from link where antrag = 'x') || '/spaet-2.jpg');

-- Ausweis gefragt, aber nichts hochgeladen
insert into ergebnis
select 22, 'Ausweis gefragt, nichts hochgeladen: ausweis', 'ausweis',
       public.antrag_einreichen((select code from link where antrag = 'y'), '{}'),
       false;
update ergebnis set bestanden = (tatsaechlich = 'ausweis') where nr = 22;
insert into ergebnis
select 23, 'Kunde laedt unter Y hoch (danach zieht A den Link zurueck)', 'ja',
       pg_temp.hochladen((select code from link where antrag = 'y') || '/vorne-y.jpg')::text, false;
update ergebnis set bestanden = (tatsaechlich = 'true') where nr = 23;

-- ---------- Berater A nach dem Eingang ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

insert into ergebnis
select 24, 'A sieht den Eingang — IBAN bereinigt, Inhaber ohne Leerzeichen', 'so',
       (select eingang::text from public.antraege where id = (select id from ids where name = 'x')),
       (select eingang = '{"bezugsrecht":{"p":2,"g":1},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013000"}}'::jsonb
               and eingegangen_am is not null
          from public.antraege where id = (select id from ids where name = 'x'));

-- A laedt in den eigenen Ordner hoch
insert into ergebnis
select 25, 'A laedt unter seinem Antrag hoch', 'ja',
       pg_temp.hochladen((select id from ids where name = 'x') || '/berater-1.jpg')::text, false;
update ergebnis set bestanden = (tatsaechlich = 'true') where nr = 25;

insert into ergebnis
select 26, 'A liest die eigenen und nach dem Eingang die Dateien des Kunden — nicht die von Y', '5',
       (select count(*) from storage.objects where bucket_id = 'antrag-dokumente')::text,
       (select count(*) = 5 from storage.objects where bucket_id = 'antrag-dokumente');

insert into ergebnis
select 27, 'Nach dem Eingang kein neuer Link', '0',
       (select count(*) from public.antrag_link_erstellen((select id from ids where name = 'x'), array['bank']))::text,
       (select count(*) = 0 from public.antrag_link_erstellen((select id from ids where name = 'x'), array['bank']));

insert into ergebnis
select 28, 'A uebernimmt den Eingang: Angaben gesetzt, Eingang geloescht', 'true',
       public.antrag_eingang_uebernehmen((select id from ids where name = 'x'),
         '{"bezugsrecht":{"p":2,"g":1},"bank":{"inhaber":"Max Muster","iban":"DE89370400440532013000"}}')::text,
       false;
update ergebnis set bestanden = (tatsaechlich = 'true')
                                and (select eingang is null and angaben -> 'bank' ->> 'iban' = 'DE89370400440532013000'
                                       from public.antraege where id = (select id from ids where name = 'x'))
 where nr = 28;

-- Zwei Anweisungen: Eine STABLE-Funktion saehe in derselben Anweisung noch den alten Stand.
insert into ergebnis
select 29, 'A zieht den Link von Y zurueck: Code danach ungueltig', 'true / ungueltig',
       public.antrag_link_zurueckziehen((select id from ids where name = 'y'))::text, false;
update ergebnis
   set tatsaechlich = tatsaechlich || ' / ' || (public.antrag_link_pruefen((select code from link where antrag = 'y')) ->> 'status')
 where nr = 29;
update ergebnis set bestanden = (tatsaechlich = 'true / ungueltig') where nr = 29;

-- B liest keine Datei von A
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e2"}';
insert into ergebnis
select 30, 'B liest keine Datei von A und laedt nicht in seinen Ordner', '0 / nein',
       concat_ws(' / ', (select count(*) from storage.objects where bucket_id = 'antrag-dokumente'),
                 pg_temp.hochladen((select id from ids where name = 'x') || '/fremd-1.jpg')),
       (select count(*) = 0 from storage.objects where bucket_id = 'antrag-dokumente')
       and not pg_temp.hochladen((select id from ids where name = 'x') || '/fremd-2.jpg');

-- ---------- Abgelaufen, verwaist, Loeschfrist (als postgres eingerichtet) ----------
reset role;
insert into public.antraege (id, besitzer, kunde, code, link_bis, offen, erstellt_am)
values ((select id from ids where name = 'z'), (select id from ids where name = 'a'), 'Abgelaufen',
        (select id from ids where name = 'zc'), now() - interval '1 day', array['ausweis', 'bank'], now() - interval '40 days'),
       ((select id from ids where name = 'w'), (select id from ids where name = 'a'), 'Alt', null, null, '{}',
        now() - interval '91 days');

set local role anon;
set local request.jwt.claims = '{}';
insert into ergebnis
select 31, 'Abgelaufener Link: pruefen, einreichen, hochladen', 'abgelaufen / abgelaufen / f',
       concat_ws(' / ',
         public.antrag_link_pruefen((select id from ids where name = 'zc')) ->> 'status',
         public.antrag_einreichen((select id from ids where name = 'zc'), '{}'),
         pg_temp.hochladen((select id from ids where name = 'zc') || '/vorne-z.jpg')),
       false;
update ergebnis set bestanden = (tatsaechlich = 'abgelaufen / abgelaufen / f') where nr = 31;

set local role service_role;
insert into ergebnis
select 32, 'Verwaist: nur die Datei unter dem zurueckgezogenen Code von Y', '1',
       (select string_agg(n, ', ') from public.antrag_dokumente_verwaist(1000) n),
       (select count(*) = 1 and bool_and(n like (select code from link where antrag = 'y') || '/%')
          from public.antrag_dokumente_verwaist(1000) n);

reset role;
insert into ergebnis
select 33, 'Loeschfrist: nach 90 Tagen weg, der Rest bleibt', '1 / 3', privat.antraege_aufraeumen()::text, false;
update ergebnis
   set tatsaechlich = tatsaechlich || ' / ' || (select count(*) from public.antraege
                                                  where besitzer = (select id from ids where name = 'a'))
 where nr = 33;
update ergebnis set bestanden = (tatsaechlich = '1 / 3') where nr = 33;

-- ---------- Katalog ----------
insert into ergebnis
select 34, 'Pruefziffer der IBAN', 't f t f f',
       concat_ws(' ', privat.iban_gueltig('DE89370400440532013000'), privat.iban_gueltig('DE89370400440532013001'),
                 privat.iban_gueltig('GB82 WEST 1234 5698 7654 32'), privat.iban_gueltig('DE8937040044053201300'),
                 privat.iban_gueltig('')),
       privat.iban_gueltig('DE89370400440532013000') and not privat.iban_gueltig('DE89370400440532013001')
       and privat.iban_gueltig('GB82 WEST 1234 5698 7654 32') and not privat.iban_gueltig('DE8937040044053201300')
       and not privat.iban_gueltig('');

insert into ergebnis
select 35, 'Rechte: Kunde nur pruefen, einreichen, hochladen; Berater keine privaten Funktionen', 'so', '—',
       has_function_privilege('anon', 'public.antrag_link_pruefen(uuid)', 'execute')
       and has_function_privilege('anon', 'public.antrag_einreichen(uuid, jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.antrag_link_erstellen(uuid, text[])', 'execute')
       and not has_function_privilege('anon', 'public.antrag_link_zurueckziehen(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.antrag_eingang_uebernehmen(uuid, jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'privat.antraege_aufraeumen()', 'execute')
       and not has_function_privilege('authenticated', 'privat.iban_gueltig(text)', 'execute')
       and not has_function_privilege('authenticated', 'public.antrag_dokumente_verwaist(integer)', 'execute')
       and has_function_privilege('service_role', 'public.antrag_dokumente_verwaist(integer)', 'execute')
       and not has_table_privilege('anon', 'public.antraege', 'select')
       and not has_table_privilege('authenticated', 'public.antraege', 'truncate')
       and not has_column_privilege('authenticated', 'public.antraege', 'code', 'update')
       and not has_column_privilege('authenticated', 'public.antraege', 'eingang', 'update')
       and has_column_privilege('authenticated', 'public.antraege', 'angaben', 'update');

insert into ergebnis
select 36, 'Loeschen nur fuer den Besitzer (Policy), RLS erzwungen, zwei Jobs, Bucket nur JPEG', 'so',
       concat_ws(', ',
         (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'antrag dokumente%'),
         (select relforcerowsecurity from pg_class where oid = 'public.antraege'::regclass),
         (select count(*) from cron.job where jobname in ('antraege-aufraeumen', 'antrag-dokumente-aufraeumen')),
         (select array_to_string(allowed_mime_types, '/') from storage.buckets where id = 'antrag-dokumente')),
       (select count(*) = 3 from pg_policies where schemaname = 'storage' and policyname like 'antrag dokumente%')
       and (select cmd = 'DELETE' and roles = '{authenticated}' and qual like '%auth.uid()%'
              from pg_policies where schemaname = 'storage' and policyname = 'antrag dokumente loeschen')
       and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.antraege'::regclass)
       and (select count(*) = 2 from cron.job where jobname in ('antraege-aufraeumen', 'antrag-dokumente-aufraeumen'))
       and (select allowed_mime_types = array['image/jpeg'] and not public from storage.buckets where id = 'antrag-dokumente');

insert into ergebnis
select 37, 'search_path fest; security definer nur, wo gewollt', 'so',
       string_agg(proname || '=' || prosecdef::text, ', ' order by proname),
       bool_and(proconfig @> array['search_path=""'])
       and bool_and(prosecdef = (proname not in ('antrag_dokumente_verwaist', 'antraege_geaendert',
                                                 'antraege_anzahl_pruefen', 'iban_gueltig')))
  from pg_proc
 where proname in ('iban_gueltig', 'antraege_geaendert', 'antraege_anzahl_pruefen', 'antrag_link_erstellen',
                   'antrag_link_zurueckziehen', 'antrag_eingang_uebernehmen', 'antrag_link_pruefen',
                   'antrag_einreichen', 'antrag_dokument_erlaubt', 'antrag_dokumente_verwaist', 'antraege_aufraeumen');

select * from ergebnis order by nr;

rollback;
