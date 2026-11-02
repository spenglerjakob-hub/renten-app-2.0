-- Nachweis: Unterschrift per Link (Migration 20261102120000_bav_unterschrift_link).
-- Berater A fuehrt Buero K und hat seine Firma dafuer freigegeben; C ist Mitglied
-- in K. B ist fremd. Der Mitarbeiter ist anon.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Geloescht wird nur in den
-- Funktionen selbst; Loeschrechte werden am Katalog abgelesen.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('a',  'aaaaaaaa-0000-4000-8000-0000000000c1'),
  ('b',  'bbbbbbbb-0000-4000-8000-0000000000c2'),
  ('c',  'cccccccc-0000-4000-8000-0000000000c3'),
  ('k',  'b0b0b0b0-0000-4000-8000-0000000000c4'),
  ('f',  'f1f1f1f1-0000-4000-8000-0000000000c5'),
  ('fb', 'f2f2f2f2-0000-4000-8000-0000000000c6'),
  ('t1', 'a1a1a1a1-0000-4000-8000-0000000000c7'),
  ('t2', 'a2a2a2a2-0000-4000-8000-0000000000c8'),
  ('t3', 'a3a3a3a3-0000-4000-8000-0000000000c9'),
  ('t4', 'a4a4a4a4-0000-4000-8000-0000000000ca'),
  ('t5', 'a5a5a5a5-0000-4000-8000-0000000000cb'),
  ('t6', 'a6a6a6a6-0000-4000-8000-0000000000cc');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '-link@test.invalid', 'x', now(), now()
  from ids where name in ('a', 'b', 'c');

insert into privat.bueros (id, name, inhaber) values ((select id from ids where name = 'k'), 'Agentur K', (select id from ids where name = 'a'));
insert into privat.abos (buero, paket, intervall, plaetze, status) values ((select id from ids where name = 'k'), 'ag', 'monat', 10, 'active');
insert into privat.buero_mitglieder (buero, nutzer, rolle) values
  ((select id from ids where name = 'k'), (select id from ids where name = 'a'), 'inhaber'),
  ((select id from ids where name = 'k'), (select id from ids where name = 'c'), 'mitglied');
insert into public.berater_profil (besitzer, berater, telefon, email)
values ((select id from ids where name = 'a'), 'Anton Berater', '0761 123456', 'anton@test.invalid');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

create temp table html(name text primary key, inhalt text) on commit drop;
grant all on html to anon, authenticated, service_role;
insert into html values
  ('protokoll',    repeat('<p>Beratungsprotokoll</p>', 20) || '<div data-unterschrift="mitarbeiter"></div>'),
  ('vereinbarung', repeat('<p>Vereinbarung</p>', 20) || '<div data-unterschrift="mitarbeiter"></div>'),
  ('axa_verzicht', repeat('<p>Verzicht und AXA-Protokoll</p>', 20)
                   || '<div data-unterschrift="mitarbeiter"></div><div data-unterschrift="berater"></div>');

-- Was die Funktionen zurueckgeben: Token und Code je Beratung
create temp table link(beratung text primary key, token text, code text) on commit drop;
grant all on link to anon, authenticated, service_role;

-- Ein falscher Code, sicher verschieden vom richtigen
create function pg_temp.falsch(p text) returns text language sql as $$
  select case when p = '000000' then '111111' else '000000' end
$$;

-- ---------- A legt Firma und Beratungen an und gibt die Firma fuers Buero frei ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1"}';

insert into public.bav_firmen (id, name) values ((select id from ids where name = 'f'), 'Muster GmbH');
select public.bav_firma_freigeben((select id from ids where name = 'f'), true);
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten)
select (select id from ids where name = n), (select id from ids where name = 'f'), m, s, '{"schritt":6}'
  from (values ('t1', 'Anna Beispiel', 'teilnahme'), ('t2', '', 'teilnahme'), ('t3', 'Vito Verzicht', 'verzicht'),
               ('t4', 'Gerd Gesperrt', 'teilnahme'), ('t5', 'Alma Abgelaufen', 'teilnahme'),
               ('t6', 'Bert Bildschirm', 'teilnahme')) as x(n, m, s);

-- ---------- 1–4: Link erstellen ----------
do $$
declare v jsonb;
begin
  v := public.bav_link_erstellen((select id from ids where name = 't1'), 'https://test.js-rentenplaner.de',
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into link values ('t1', v ->> 'token', v ->> 'code');
  insert into ergebnis values (1, 'A erstellt einen Link: Token 32 hex, Code 6 Ziffern, 14 Tage', 'ok',
    concat_ws(', ', v ->> 'status', length(v ->> 'token'), v ->> 'code', v ->> 'gueltig_bis'),
    v ->> 'status' = 'ok' and v ->> 'token' ~ '^[0-9a-f]{32}$' and v ->> 'code' ~ '^[0-9]{6}$'
    and (v ->> 'gueltig_bis')::timestamptz = now() + interval '14 days');
exception when others then
  insert into ergebnis values (1, 'A erstellt einen Link', 'ok', sqlerrm, false);
end $$;

insert into ergebnis
select 2, 'Der Link schreibt die Unterlagen fest (mit Pruefsummen)', 'festgeschrieben',
       coalesce(left(pruefsummen ->> 'protokoll', 12), 'keine'),
       pruefsummen ->> 'protokoll' = encode(sha256(convert_to((select inhalt from html where name = 'protokoll'), 'UTF8')), 'hex')
  from public.bav_unterlagen where beratung = (select id from ids where name = 't1');

do $$
begin
  perform token_hash from public.bav_unterschrift_links;
  insert into ergebnis values (3, 'A liest die Pruefsumme des Tokens', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (3, 'A liest die Pruefsumme des Tokens', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

insert into ergebnis
select 4, 'A sieht Code, Ersteller und Frist seines Links', 'Code wie zurueckgegeben, Ersteller A',
       concat_ws(', ', l.code, l.erstellt_von, l.fehlversuche),
       l.code = (select code from link where beratung = 't1')
       and l.erstellt_von = (select id from ids where name = 'a') and l.fehlversuche = 0 and l.geoeffnet_am is null
  from public.bav_unterschrift_links l where l.beratung = (select id from ids where name = 't1');

do $$
declare v jsonb;
begin
  v := public.bav_link_erstellen((select id from ids where name = 't2'), null,
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (5, 'Ohne Namen des Mitarbeiters kein Link (und nichts festgeschrieben)', 'ohne_name',
    concat_ws(', ', v ->> 'status', (select count(*) from public.bav_unterlagen where beratung = (select id from ids where name = 't2'))),
    v ->> 'status' = 'ohne_name'
    and not exists (select 1 from public.bav_unterlagen where beratung = (select id from ids where name = 't2')));
exception when others then
  insert into ergebnis values (5, 'Ohne Namen des Mitarbeiters kein Link', 'ohne_name', sqlerrm, false);
end $$;

-- ---------- 6–7: Kollege C und Fremder B ----------
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c3"}';
insert into ergebnis
select 6, 'Kollege C sieht den Link der freigegebenen Firma', '1 Zeile mit Code', count(*)::text,
       count(*) = 1 and bool_and(code = (select code from link where beratung = 't1'))
  from public.bav_unterschrift_links where beratung = (select id from ids where name = 't1');

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000c2"}';
insert into ergebnis
select 7, 'Fremder B sieht keinen Link', '0', count(*)::text, count(*) = 0 from public.bav_unterschrift_links;

do $$
begin
  perform public.bav_link_erstellen((select id from ids where name = 't1'), null);
  insert into ergebnis values (8, 'Fremder B erstellt einen Link fuer A''s Beratung', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (8, 'Fremder B erstellt einen Link fuer A''s Beratung', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- 9–19: Der Mitarbeiter (anon) ----------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform count(*) from public.bav_unterschrift_links;
  insert into ergebnis values (9, 'anon liest Links', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (9, 'anon liest Links', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_link_erstellen((select id from ids where name = 't1'), null);
  insert into ergebnis values (10, 'anon erstellt einen Link', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (10, 'anon erstellt einen Link', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
declare v1 jsonb; v2 jsonb; v3 jsonb;
begin
  v1 := public.bav_link_oeffnen('kein-token', '123456');
  v2 := public.bav_link_oeffnen(replace(gen_random_uuid()::text, '-', ''), '123456');
  v3 := public.bav_link_oeffnen((select token from link where beratung = 't1'), pg_temp.falsch((select code from link where beratung = 't1')));
  insert into ergebnis values (11, 'Kaputter und unbekannter Token: ungueltig; falscher Code: code_falsch, noch 4', 'ungueltig, ungueltig, code_falsch 4',
    concat_ws(', ', v1 ->> 'status', v2 ->> 'status', v3 ->> 'status', v3 ->> 'rest'),
    v1 ->> 'status' = 'ungueltig' and v2 ->> 'status' = 'ungueltig' and v3 ->> 'status' = 'code_falsch'
    and (v3 ->> 'rest')::int = 4 and not v3 ? 'unterlagen');
exception when others then
  insert into ergebnis values (11, 'Kaputter und unbekannter Token, falscher Code', 'Antworten', sqlerrm, false);
end $$;

do $$
declare v jsonb;
begin
  v := public.bav_link_oeffnen((select token from link where beratung = 't1'), (select code from link where beratung = 't1'));
  insert into ergebnis values (12, 'Richtiger Code: Unterlagen, Namen, Berater, Pruefsummen', 'ok mit Inhalt',
    concat_ws(', ', v ->> 'status', v ->> 'mitarbeiter', v ->> 'firma', v -> 'berater' ->> 'name', v ->> 'entscheidung', v ->> 'axa'),
    v ->> 'status' = 'ok' and v ->> 'mitarbeiter' = 'Anna Beispiel' and v ->> 'firma' = 'Muster GmbH'
    and v -> 'berater' ->> 'name' = 'Anton Berater' and v -> 'berater' ->> 'telefon' = '0761 123456'
    and v ->> 'entscheidung' = 'teilnahme' and v ->> 'axa' = 'false'
    and v -> 'unterlagen' ->> 'protokoll' = (select inhalt from html where name = 'protokoll')
    and v -> 'unterlagen' ->> 'vereinbarung' = (select inhalt from html where name = 'vereinbarung')
    and not (v -> 'unterlagen' ? 'verzicht')
    and v -> 'pruefsummen' ->> 'protokoll' = encode(sha256(convert_to((select inhalt from html where name = 'protokoll'), 'UTF8')), 'hex')
    and v -> 'unterschriften' = '[]'::jsonb);
exception when others then
  insert into ergebnis values (12, 'Richtiger Code', 'ok', sqlerrm, false);
end $$;

do $$
declare v1 jsonb; v2 jsonb;
begin
  v1 := public.bav_link_unterschreiben((select token from link where beratung = 't1'), (select code from link where beratung = 't1'),
          'M10 20Q30 40 50 20L80 60', '{"protokoll": "falsch"}'::jsonb);
  v2 := public.bav_link_unterschreiben((select token from link where beratung = 't1'), (select code from link where beratung = 't1'),
          'M10 20<script>', null);
  insert into ergebnis values (13, 'Andere Pruefsummen: veraendert; fremder Linienzug: zug_ungueltig', 'veraendert, zug_ungueltig',
    concat_ws(', ', v1 ->> 'status', v2 ->> 'status'),
    v1 ->> 'status' = 'veraendert' and v2 ->> 'status' = 'zug_ungueltig');
exception when others then
  insert into ergebnis values (13, 'Andere Pruefsummen, fremder Linienzug', 'Antworten', sqlerrm, false);
end $$;

-- Die Kopfzeilen, wie die Data API sie durchreicht
set local request.headers = '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Testbrowser/1.0"}';

do $$
declare v jsonb;
begin
  v := public.bav_link_unterschreiben((select token from link where beratung = 't1'), (select code from link where beratung = 't1'),
         'M10 20Q30 40 50 20L80 60',
         jsonb_build_object(
           'protokoll', encode(sha256(convert_to((select inhalt from html where name = 'protokoll'), 'UTF8')), 'hex'),
           'vereinbarung', encode(sha256(convert_to((select inhalt from html where name = 'vereinbarung'), 'UTF8')), 'hex')));
  insert into ergebnis values (14, 'Unterschreiben per Link', 'ok, Protokoll und Vereinbarung',
    concat_ws(', ', v ->> 'status', v ->> 'name', v ->> 'dokumente'),
    v ->> 'status' = 'ok' and v ->> 'name' = 'Anna Beispiel' and v -> 'dokumente' = '["protokoll", "vereinbarung"]'::jsonb);
exception when others then
  insert into ergebnis values (14, 'Unterschreiben per Link', 'ok', sqlerrm, false);
end $$;

do $$
declare v jsonb;
begin
  v := public.bav_link_oeffnen((select token from link where beratung = 't1'), (select code from link where beratung = 't1'));
  insert into ergebnis values (15, 'Derselbe Link danach: unterschrieben, ohne Unterlagen', 'unterschrieben',
    v ->> 'status', v ->> 'status' = 'unterschrieben' and not v ? 'unterlagen');
exception when others then
  insert into ergebnis values (15, 'Derselbe Link danach', 'unterschrieben', sqlerrm, false);
end $$;

reset role;
set local request.headers = '{}';

insert into ergebnis
select 16, 'Die Unterschrift: Kanal link, Besitzer A, Nachweis mit IP, Browser, Pruefsummen, Ersteller', 'so',
       concat_ws(', ', s.kanal, s.name, s.nachweis ->> 'ip', s.nachweis ->> 'browser', s.nachweis ->> 'link_erstellt_von'),
       s.kanal = 'link' and s.person = 'mitarbeiter' and s.name = 'Anna Beispiel'
       and s.besitzer = (select id from ids where name = 'a')
       and s.unterschrieben_am = now()
       and s.nachweis ->> 'ip' = '203.0.113.7' and s.nachweis ->> 'browser' = 'Testbrowser/1.0'
       and s.nachweis ->> 'weiterleitung' = '203.0.113.7, 10.0.0.1'
       and s.nachweis ->> 'link' = encode(sha256(convert_to((select token from link where beratung = 't1'), 'UTF8')), 'hex')
       and s.nachweis ->> 'link_erstellt_von' = 'Anton Berater'
       and (s.nachweis ->> 'link_erstellt_von_id')::uuid = (select id from ids where name = 'a')
       and s.nachweis ->> 'adresse' = 'https://test.js-rentenplaner.de'
       and (s.nachweis ->> 'geoeffnet_am') is not null and (s.nachweis ->> 'code_bestaetigt_am') is not null
       and s.nachweis -> 'pruefsummen' = (select u.pruefsummen from public.bav_unterlagen u where u.beratung = s.beratung)
       and s.benachrichtigt_am is null
  from public.bav_unterschriften s where s.beratung = (select id from ids where name = 't1');

insert into ergebnis
select 17, 'Nach der Unterschrift ist der Link geloescht', '0', count(*)::text, count(*) = 0
  from public.bav_unterschrift_links where beratung = (select id from ids where name = 't1');

-- ---------- 18–20: Berater danach; Kanal faelschen ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1"}';

do $$
declare v jsonb;
begin
  v := public.bav_link_erstellen((select id from ids where name = 't1'), null);
  insert into ergebnis values (18, 'Neuer Link, wenn der Mitarbeiter schon unterschrieben hat', 'unterschrieben', v ->> 'status',
    v ->> 'status' = 'unterschrieben');
exception when others then
  insert into ergebnis values (18, 'Neuer Link nach der Unterschrift', 'unterschrieben', sqlerrm, false);
end $$;

insert into ergebnis
select 19, 'A liest Kanal und Nachweis der Unterschrift', 'link mit IP', concat_ws(', ', kanal, nachweis ->> 'ip'),
       kanal = 'link' and nachweis ->> 'ip' = '203.0.113.7'
  from public.bav_unterschriften where beratung = (select id from ids where name = 't1') and person = 'mitarbeiter';

-- t6: A schreibt fest und versucht, eine Unterschrift als „per Link“ einzutragen
do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 't6'), 'berater', 'Anton Berater', 'M5 5L100 50',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into public.bav_unterschriften (beratung, person, name, zug, kanal, nachweis, benachrichtigt_am)
  values ((select id from ids where name = 't6'), 'mitarbeiter', 'Bert Bildschirm', 'M10 10L90 90', 'link',
          '{"ip": "198.51.100.1"}'::jsonb, now());
  insert into ergebnis
  select 20, 'Am Bildschirm laesst sich keine Unterschrift per Link faelschen', 'bildschirm, ohne Nachweis',
         concat_ws(', ', kanal, coalesce(nachweis::text, 'kein Nachweis'), coalesce(benachrichtigt_am::text, 'nicht benachrichtigt')),
         kanal = 'bildschirm' and nachweis is null and benachrichtigt_am is null
    from public.bav_unterschriften where beratung = (select id from ids where name = 't6') and person = 'mitarbeiter';
exception when others then
  insert into ergebnis values (20, 'Am Bildschirm laesst sich keine Unterschrift per Link faelschen', 'bildschirm', sqlerrm, false);
end $$;

-- ---------- 21–23: AXA bei Verzicht, Kollege erstellt neu, inzwischen am Bildschirm ----------
do $$
declare v jsonb;
begin
  v := public.bav_link_erstellen((select id from ids where name = 't3'), 'https://boese.example',
         (select inhalt from html where name = 'protokoll'), null, (select inhalt from html where name = 'axa_verzicht'));
  insert into link values ('t3', v ->> 'token', v ->> 'code');
  insert into ergebnis
  select 21, 'Fremde Adresse wird nicht gespeichert', 'leer', coalesce(adresse, 'leer'), adresse is null
    from public.bav_unterschrift_links where beratung = (select id from ids where name = 't3');
exception when others then
  insert into ergebnis values (21, 'Fremde Adresse wird nicht gespeichert', 'leer', sqlerrm, false);
end $$;

-- Kollege C erstellt einen neuen Link — der alte gilt nicht mehr
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c3"}';
do $$
declare v jsonb; alt text;
begin
  alt := (select token from link where beratung = 't3');
  v := public.bav_link_erstellen((select id from ids where name = 't3'), null);
  update link set token = v ->> 'token', code = v ->> 'code' where beratung = 't3';
  insert into ergebnis
  select 22, 'Kollege C erstellt neu: ein Link, Ersteller C, der alte Token ist ein anderer', '1, C',
         concat_ws(', ', count(*), max(erstellt_von::text)),
         count(*) = 1 and max(erstellt_von::text) = (select id::text from ids where name = 'c') and alt <> (v ->> 'token')
    from public.bav_unterschrift_links where beratung = (select id from ids where name = 't3');
exception when others then
  insert into ergebnis values (22, 'Kollege C erstellt neu', '1, C', sqlerrm, false);
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  v := public.bav_link_oeffnen((select token from link where beratung = 't3'), (select code from link where beratung = 't3'));
  insert into ergebnis values (23, 'AXA bei Verzicht: axa, Verzicht, Kontakt aus dem Profil des Erstellers (C hat keins)', 'ok, verzicht, true',
    concat_ws(', ', v ->> 'status', v ->> 'entscheidung', v ->> 'axa', v -> 'berater' ->> 'name'),
    v ->> 'status' = 'ok' and v ->> 'entscheidung' = 'verzicht' and v ->> 'axa' = 'true'
    and v -> 'unterlagen' ? 'verzicht' and not (v -> 'unterlagen' ? 'vereinbarung') and v -> 'berater' ->> 'name' = '');
exception when others then
  insert into ergebnis values (23, 'AXA bei Verzicht', 'ok', sqlerrm, false);
end $$;

-- A laesst den Mitarbeiter inzwischen am Bildschirm unterschreiben
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1"}';
select public.bav_unterschreiben((select id from ids where name = 't3'), 'mitarbeiter', 'Vito Verzicht', 'M10 10L90 90');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v1 jsonb; v2 jsonb;
begin
  v1 := public.bav_link_oeffnen((select token from link where beratung = 't3'), (select code from link where beratung = 't3'));
  v2 := public.bav_link_unterschreiben((select token from link where beratung = 't3'), (select code from link where beratung = 't3'),
          'M10 20L80 60', '{}'::jsonb);
  insert into ergebnis values (24, 'Inzwischen am Bildschirm unterschrieben: oeffnen und unterschreiben sagen unterschrieben',
    'unterschrieben, unterschrieben', concat_ws(', ', v1 ->> 'status', v2 ->> 'status'),
    v1 ->> 'status' = 'unterschrieben' and v2 ->> 'status' = 'unterschrieben');
exception when others then
  insert into ergebnis values (24, 'Inzwischen am Bildschirm unterschrieben', 'unterschrieben', sqlerrm, false);
end $$;

-- ---------- 25–26: Sperre nach 5 Fehlversuchen, Frist ----------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1"}';
do $$
declare v jsonb;
begin
  v := public.bav_link_erstellen((select id from ids where name = 't4'), null,
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into link values ('t4', v ->> 'token', v ->> 'code');
  v := public.bav_link_erstellen((select id from ids where name = 't5'), null,
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into link values ('t5', v ->> 'token', v ->> 'code');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb; antworten text := '';
begin
  for i in 1..5 loop
    v := public.bav_link_oeffnen((select token from link where beratung = 't4'), pg_temp.falsch((select code from link where beratung = 't4')));
    antworten := antworten || (v ->> 'status') || coalesce('(' || (v ->> 'rest') || ')', '') || ' ';
  end loop;
  v := public.bav_link_oeffnen((select token from link where beratung = 't4'), (select code from link where beratung = 't4'));
  antworten := antworten || 'richtig: ' || (v ->> 'status');
  insert into ergebnis values (25, 'Fuenf falsche Codes sperren den Link, auch fuer den richtigen', '4 x code_falsch, dann gesperrt',
    antworten,
    antworten = 'code_falsch(4) code_falsch(3) code_falsch(2) code_falsch(1) gesperrt richtig: gesperrt');
exception when others then
  insert into ergebnis values (25, 'Fuenf falsche Codes sperren den Link', 'gesperrt', sqlerrm, false);
end $$;

-- Die Frist von t5 als Eigentuemer in die Vergangenheit legen
reset role;
update public.bav_unterschrift_links
   set erstellt_am = now() - interval '15 days', gueltig_bis = now() - interval '1 day'
 where beratung = (select id from ids where name = 't5');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  v := public.bav_link_oeffnen((select token from link where beratung = 't5'), (select code from link where beratung = 't5'));
  insert into ergebnis values (26, 'Abgelaufener Link', 'abgelaufen', v ->> 'status', v ->> 'status' = 'abgelaufen');
exception when others then
  insert into ergebnis values (26, 'Abgelaufener Link', 'abgelaufen', sqlerrm, false);
end $$;

-- ---------- 27–32: Katalog ----------
reset role;

-- In einem eigenen Block: Erst danach sieht die Abfrage, was geloescht ist.
do $$
declare n integer; rest text;
begin
  n := privat.bav_links_aufraeumen();
  select string_agg(i.name, ' ' order by i.name) into rest from public.bav_unterschrift_links l join ids i on i.id = l.beratung;
  insert into ergebnis values (27, 'Aufraeumen: abgelaufene Links und solche, die inzwischen unterschrieben sind',
    '2 weg (t3, t5), t4 bleibt', concat_ws(', ', n, rest), n = 2 and rest = 't4');
end $$;

insert into ergebnis
select 28, 'Links gehen mit den Unterlagen (Kaskade), Ersteller wird beim Loeschen des Kontos leer', 'c, n',
       string_agg(confdeltype::text, ', ' order by confrelid::regclass::text desc),
       bool_or(confrelid = 'public.bav_unterlagen'::regclass and confdeltype = 'c')
       and bool_or(confrelid = 'auth.users'::regclass and confdeltype = 'n')
  from pg_constraint where contype = 'f' and conrelid = 'public.bav_unterschrift_links'::regclass;

insert into ergebnis
select 29, 'Rechte: authenticated liest ohne Pruefsumme, kein Update; anon nichts', 'so',
       concat_ws(', ',
         case when has_column_privilege('authenticated', 'public.bav_unterschrift_links', 'token_hash', 'select') then 'hash lesbar' end,
         case when has_table_privilege('authenticated', 'public.bav_unterschrift_links', 'update') then 'update' end,
         case when not has_table_privilege('authenticated', 'public.bav_unterschrift_links', 'delete') then 'kein delete' end,
         case when has_table_privilege('anon', 'public.bav_unterschrift_links', 'select') then 'anon select' end,
         case when has_table_privilege('anon', 'public.bav_unterschrift_links', 'insert') then 'anon insert' end),
       not has_column_privilege('authenticated', 'public.bav_unterschrift_links', 'token_hash', 'select')
       and has_column_privilege('authenticated', 'public.bav_unterschrift_links', 'code', 'select')
       and not has_table_privilege('authenticated', 'public.bav_unterschrift_links', 'update')
       and has_table_privilege('authenticated', 'public.bav_unterschrift_links', 'delete')
       and not has_table_privilege('anon', 'public.bav_unterschrift_links', 'select')
       and not has_table_privilege('anon', 'public.bav_unterschrift_links', 'insert')
       and not has_table_privilege('anon', 'public.bav_unterschrift_links', 'delete');

insert into ergebnis
select 30, 'Funktionen: wer was ausfuehren darf', 'erstellen nur authenticated, oeffnen/unterschreiben auch anon, privat niemand',
       concat_ws(', ',
         has_function_privilege('anon', 'public.bav_link_erstellen(uuid, text, text, text, text)', 'execute'),
         has_function_privilege('authenticated', 'public.bav_link_erstellen(uuid, text, text, text, text)', 'execute'),
         has_function_privilege('anon', 'public.bav_link_oeffnen(text, text)', 'execute'),
         has_function_privilege('anon', 'public.bav_link_unterschreiben(text, text, text, jsonb)', 'execute'),
         has_function_privilege('anon', 'privat.bav_link_pruefen(text, text)', 'execute'),
         has_function_privilege('authenticated', 'privat.bav_link_pruefen(text, text)', 'execute')),
       not has_function_privilege('anon', 'public.bav_link_erstellen(uuid, text, text, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.bav_link_erstellen(uuid, text, text, text, text)', 'execute')
       and has_function_privilege('anon', 'public.bav_link_oeffnen(text, text)', 'execute')
       and has_function_privilege('anon', 'public.bav_link_unterschreiben(text, text, text, jsonb)', 'execute')
       and not has_function_privilege('anon', 'privat.bav_link_pruefen(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'privat.bav_link_pruefen(text, text)', 'execute');

insert into ergebnis
select 31, 'search_path fest; security definer nur, wo gewollt', 'so',
       string_agg(proname || '=' || prosecdef::text, ', ' order by proname),
       bool_and(proconfig @> array['search_path=""'])
       and bool_and(prosecdef = (proname in ('bav_link_oeffnen', 'bav_link_unterschreiben', 'bav_link_pruefen',
                                             'bav_unterschrift_link_melden', 'bav_links_aufraeumen')))
  from pg_proc
 where proname in ('bav_link_erstellen', 'bav_link_oeffnen', 'bav_link_unterschreiben', 'bav_link_pruefen',
                   'bav_link_anlegen', 'bav_unterschrift_eintragen', 'bav_unterschrift_link_melden', 'bav_links_aufraeumen');

insert into ergebnis
select 32, 'RLS erzwungen; Melde-Trigger nur fuer Unterschriften per Link; Job eingeplant', 'so',
       concat_ws(', ',
         (select relforcerowsecurity from pg_class where oid = 'public.bav_unterschrift_links'::regclass),
         (select pg_get_triggerdef(oid) like '%WHEN ((new.kanal = ''link''::text))%' from pg_trigger
           where tgname = 'bav_unterschrift_link_melden'),
         (select count(*) from cron.job where jobname = 'bav-links-aufraeumen')),
       (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.bav_unterschrift_links'::regclass)
       and (select pg_get_triggerdef(oid) like '%WHEN ((new.kanal = ''link''::text))%' from pg_trigger
             where tgname = 'bav_unterschrift_link_melden')
       and (select count(*) = 1 from cron.job where jobname = 'bav-links-aufraeumen');

select * from ergebnis order by nr;

rollback;
