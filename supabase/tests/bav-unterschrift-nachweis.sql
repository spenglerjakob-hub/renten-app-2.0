-- Nachweis der Absicherung der Unterschrift am Bildschirm: Tabellen
-- bav_unterlagen und bav_unterschriften, Funktion bav_unterschreiben und die
-- Sperre auf bav_beratungen — mit zwei Beratern und anon.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck — es
-- bleibt nichts in der Datenbank zurueck. Geloescht wird nichts: Kaskaden und
-- fehlende Loeschrechte werden am Katalog abgelesen, damit der Nachweis auch
-- ueber Werkzeuge laeuft, die jede Loeschanweisung erst bestaetigen lassen.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-unterschrift@test.invalid','x',now(),now()),
  ('bbbbbbbb-0000-4000-8000-0000000000e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-unterschrift@test.invalid','x',now(),now());

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to anon, authenticated, service_role;

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids values
  ('firma_a',     'a1a1a1a1-0000-4000-8000-0000000000aa'),
  ('teilnahme_a', 'a3a3a3a3-0000-4000-8000-0000000000ab'),
  ('offen_a',     'a4a4a4a4-0000-4000-8000-0000000000ac'),
  ('verzicht_a',  'a5a5a5a5-0000-4000-8000-0000000000ad'),
  ('zweite_a',    'a6a6a6a6-0000-4000-8000-0000000000ae'),
  ('firma_b',     'b2b2b2b2-0000-4000-8000-0000000000ba'),
  ('teilnahme_b', 'b6b6b6b6-0000-4000-8000-0000000000bb');

-- Gross genug fuer die Mindestlaenge der Dokumente
create temp table html(name text primary key, inhalt text) on commit drop;
grant all on html to anon, authenticated, service_role;
insert into html values
  ('protokoll',    repeat('<p>Beratungsprotokoll</p>', 20)),
  ('vereinbarung', repeat('<p>Vereinbarung</p>', 20)),
  ('verzicht',     repeat('<p>Verzicht</p>', 20));

-- ---------- Aufbau: Berater A und B mit Firma und Beratungen ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

insert into public.bav_firmen (id, name) values ((select id from ids where name = 'firma_a'), 'Muster GmbH');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'teilnahme_a'), (select id from ids where name = 'firma_a'), 'Anna Beispiel', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Anna Beispiel"}}'),
  ((select id from ids where name = 'offen_a'), (select id from ids where name = 'firma_a'), 'Otto Offen', 'offen',
   '{"schritt":6,"angaben":{"name":"Otto Offen"}}'),
  ((select id from ids where name = 'verzicht_a'), (select id from ids where name = 'firma_a'), 'Vera Verzicht', 'verzicht',
   '{"schritt":6,"angaben":{"name":"Vera Verzicht"}}'),
  -- Entschieden und ohne Unterlagen — damit Pruefung 14 an der Besitzer-Regel scheitert, nicht an einer frueheren
  ((select id from ids where name = 'zweite_a'), (select id from ids where name = 'firma_a'), 'Zora Zweite', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Zora Zweite"}}');

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e2"}';
insert into public.bav_firmen (id, name) values ((select id from ids where name = 'firma_b'), 'Fremd AG');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'teilnahme_b'), (select id from ids where name = 'firma_b'), 'Bernd Fremd', 'teilnahme', '{}');

-- ---------- Berater A unterschreibt ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';

do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'teilnahme_a'), 'mitarbeiter', '  Anna Beispiel ',
         'M10 20Q30 40 50 20L80 60',
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (1, 'Mitarbeiter unterschreibt die eigene Beratung (Teilnahme)', 'protokoll+vereinbarung, Name getrimmt',
    concat_ws(', ', v->>'dokumente', v->>'name'),
    v->'dokumente' = '["protokoll", "vereinbarung"]'::jsonb and v->>'name' = 'Anna Beispiel');
exception when others then
  insert into ergebnis values (1, 'Mitarbeiter unterschreibt die eigene Beratung (Teilnahme)', 'angenommen', sqlerrm, false);
end $$;

insert into ergebnis
select 2, 'Pruefsummen und Zeitpunkt setzt die Datenbank', 'sha256 und now()',
       concat_ws(', ', left(pruefsummen->>'protokoll', 12), erstellt_am::text),
       pruefsummen->>'protokoll' = encode(sha256(convert_to((select inhalt from html where name = 'protokoll'), 'UTF8')), 'hex')
       and pruefsummen->>'vereinbarung' = encode(sha256(convert_to((select inhalt from html where name = 'vereinbarung'), 'UTF8')), 'hex')
       and not (pruefsummen ? 'verzicht')
       and erstellt_am = now()
  from public.bav_unterlagen where beratung = (select id from ids where name = 'teilnahme_a');

do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'teilnahme_a'), 'berater', 'Max Berater', 'M5 5L100 50',
         repeat('<p>andere Fassung</p>', 20), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (3, 'Berater unterschreibt danach: nur das Protokoll', 'protokoll', v->>'dokumente',
    v->'dokumente' = '["protokoll"]'::jsonb);
exception when others then
  insert into ergebnis values (3, 'Berater unterschreibt danach: nur das Protokoll', 'angenommen', sqlerrm, false);
end $$;

insert into ergebnis
select 4, 'Die zweite Unterschrift aendert die festgeschriebene Fassung nicht', 'erste Fassung',
       left(protokoll, 25),
       protokoll = (select inhalt from html where name = 'protokoll')
  from public.bav_unterlagen where beratung = (select id from ids where name = 'teilnahme_a');

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'teilnahme_a'), 'mitarbeiter', 'Anna Beispiel', 'M10 10L90 90');
  insert into ergebnis values (5, 'Dieselbe Person unterschreibt zweimal', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (5, 'Dieselbe Person unterschreibt zweimal', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'offen_a'), 'mitarbeiter', 'Otto Offen', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (6, 'Unterschrift ohne Entscheidung (offen)', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (6, 'Unterschrift ohne Entscheidung (offen)', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'mitarbeiter', 'Vera Verzicht', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (7, 'Verzicht mit einer Vereinbarung', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (7, 'Verzicht mit einer Vereinbarung', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'mitarbeiter', 'Vera Verzicht', 'M10 10L90 90<script>',
            (select inhalt from html where name = 'protokoll'), null, (select inhalt from html where name = 'verzicht'));
  insert into ergebnis values (8, 'Linienzug mit fremden Zeichen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (8, 'Linienzug mit fremden Zeichen', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'mitarbeiter', '   ', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), null, (select inhalt from html where name = 'verzicht'));
  insert into ergebnis values (9, 'Unterschrift ohne Namen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (9, 'Unterschrift ohne Namen', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'mitarbeiter', 'Vera Verzicht', 'M10 10L90 90',
            '<p>kurz</p>', null, (select inhalt from html where name = 'verzicht'));
  insert into ergebnis values (10, 'Protokoll zu kurz', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (10, 'Protokoll zu kurz', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'chef', 'Vera Verzicht', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), null, (select inhalt from html where name = 'verzicht'));
  insert into ergebnis values (11, 'Unbekannte Person', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (11, 'Unbekannte Person', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- Wer an der Funktion vorbei einfuegt, bekommt dieselben Regeln: Zeit und Pruefsummen vom Server.
do $$
begin
  insert into public.bav_unterlagen (beratung, protokoll, verzicht, pruefsummen, erstellt_am)
  values ((select id from ids where name = 'verzicht_a'), (select inhalt from html where name = 'protokoll'),
          (select inhalt from html where name = 'verzicht'), '{"protokoll":"gefaelscht"}', '2000-01-01');
  insert into public.bav_unterschriften (beratung, person, name, zug, dokumente, unterschrieben_am)
  values ((select id from ids where name = 'verzicht_a'), 'mitarbeiter', 'Vera Verzicht', 'M10 10L90 90', '{alles}', '2000-01-01');
  insert into ergebnis values (12, 'Direkt eingefuegt (Verzicht)', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (12, 'Direkt eingefuegt (Verzicht)', 'angenommen', sqlerrm, false);
end $$;

insert into ergebnis
select 13, 'Mitgeschickte Zeiten und Pruefsummen gelten nicht', 'Server-Werte',
       concat_ws(', ', left(u.pruefsummen->>'protokoll', 12), u.erstellt_am::text, s.dokumente::text, s.unterschrieben_am::text),
       u.pruefsummen->>'protokoll' = encode(sha256(convert_to((select inhalt from html where name = 'protokoll'), 'UTF8')), 'hex')
       and u.erstellt_am = now() and s.unterschrieben_am = now() and s.dokumente = array['protokoll', 'verzicht']
  from public.bav_unterlagen u join public.bav_unterschriften s on s.beratung = u.beratung
 where u.beratung = (select id from ids where name = 'verzicht_a');

do $$
begin
  insert into public.bav_unterlagen (beratung, besitzer, protokoll, vereinbarung)
  values ((select id from ids where name = 'zweite_a'), 'bbbbbbbb-0000-4000-8000-0000000000e2',
          (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'));
  insert into ergebnis values (14, 'A legt Unterlagen im Namen von B an', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (14, 'A legt Unterlagen im Namen von B an', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- Unveraenderlich und gesperrt ----------
do $$
begin
  update public.bav_unterlagen set protokoll = repeat('<p>neu</p>', 30);
  insert into ergebnis values (15, 'Festgeschriebene Unterlagen aendern', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (15, 'Festgeschriebene Unterlagen aendern', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  update public.bav_unterschriften set name = 'Jemand anders';
  insert into ergebnis values (16, 'Unterschrift aendern', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (16, 'Unterschrift aendern', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  update public.bav_beratungen set daten = jsonb_set(daten, '{angaben,name}', '"Anna Anders"')
   where id = (select id from ids where name = 'teilnahme_a');
  insert into ergebnis values (17, 'Unterschriebene Beratung aendern (Angaben)', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (17, 'Unterschriebene Beratung aendern (Angaben)', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  update public.bav_beratungen set status = 'verzicht' where id = (select id from ids where name = 'teilnahme_a');
  insert into ergebnis values (18, 'Unterschriebene Beratung aendern (Status)', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (18, 'Unterschriebene Beratung aendern (Status)', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  update public.bav_beratungen set daten = jsonb_set(daten, '{schritt}', '2')
   where id = (select id from ids where name = 'teilnahme_a');
  insert into ergebnis values (19, 'Unterschriebene Beratung: nur der Schritt', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (19, 'Unterschriebene Beratung: nur der Schritt', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  update public.bav_beratungen set daten = jsonb_set(daten, '{angaben,name}', '"Otto Neu"'), mitarbeiter = 'Otto Neu'
   where id = (select id from ids where name = 'offen_a');
  insert into ergebnis values (20, 'Beratung ohne Unterschrift bleibt aenderbar', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (20, 'Beratung ohne Unterschrift bleibt aenderbar', 'angenommen', sqlerrm, false);
end $$;

-- ---------- Berater B ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e2"}';

insert into ergebnis
select 21, 'B sieht keine Unterlagen und Unterschriften von A', '0 und 0',
       format('%s und %s', (select count(*) from public.bav_unterlagen), (select count(*) from public.bav_unterschriften)),
       (select count(*) from public.bav_unterlagen) = 0 and (select count(*) from public.bav_unterschriften) = 0;

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'offen_a'), 'mitarbeiter', 'Otto', 'M10 10L90 90',
            (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (22, 'B unterschreibt eine Beratung von A', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (22, 'B unterschreibt eine Beratung von A', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  insert into public.bav_unterschriften (beratung, person, name, zug)
  values ((select id from ids where name = 'verzicht_a'), 'berater', 'Fremder Berater', 'M10 10L90 90');
  insert into ergebnis values (23, 'B unterschreibt unter Unterlagen von A', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (23, 'B unterschreibt unter Unterlagen von A', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
declare n int;
begin
  update public.bav_beratungen set daten = '{}' where id = (select id from ids where name = 'teilnahme_a');
  get diagnostics n = row_count;
  insert into ergebnis values (24, 'B aendert eine Beratung von A', '0 Zeilen', n || ' Zeilen', n = 0);
exception when others then
  insert into ergebnis values (24, 'B aendert eine Beratung von A', '0 Zeilen', 'abgewiesen', true);
end $$;

do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'teilnahme_b'), 'mitarbeiter', 'Bernd Fremd', 'M10 10L90 90',
         (select inhalt from html where name = 'protokoll'), (select inhalt from html where name = 'vereinbarung'), null);
  insert into ergebnis values (25, 'B unterschreibt die eigene Beratung', 'angenommen', 'angenommen', v ? 'unterschrieben_am');
exception when others then
  insert into ergebnis values (25, 'B unterschreibt die eigene Beratung', 'angenommen', sqlerrm, false);
end $$;

-- ---------- anon ----------
set local role anon;
set local request.jwt.claims = '{}';

do $$
begin
  perform public.bav_unterschreiben((select id from ids where name = 'teilnahme_b'), 'berater', 'Anon', 'M10 10L90 90');
  insert into ergebnis values (26, 'anon unterschreibt', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (26, 'anon unterschreibt', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

do $$
begin
  perform count(*) from public.bav_unterlagen;
  insert into ergebnis values (27, 'anon liest Unterlagen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (27, 'anon liest Unterlagen', 'abgewiesen', 'abgewiesen: ' || sqlerrm, true);
end $$;

-- ---------- Aufbau (als Eigentuemer der Datenbank) ----------
reset role;

insert into ergebnis
select 28, 'RLS erzwungen auf beiden Tabellen', 'ja', string_agg(relname || '=' || relforcerowsecurity::text, ', '),
       bool_and(relrowsecurity and relforcerowsecurity)
  from pg_class
 where oid in ('public.bav_unterlagen'::regclass, 'public.bav_unterschriften'::regclass);

insert into ergebnis
select 29, 'Kaskaden: Unterlagen mit der Beratung, Unterschriften mit den Unterlagen', 'c, c',
       string_agg(confdeltype::text, ', ' order by conrelid::regclass::text),
       count(*) = 2 and bool_and(confdeltype = 'c')
  from pg_constraint
 where contype = 'f'
   and ((conrelid = 'public.bav_unterlagen'::regclass and confrelid = 'public.bav_beratungen'::regclass)
     or (conrelid = 'public.bav_unterschriften'::regclass and confrelid = 'public.bav_unterlagen'::regclass));

insert into ergebnis
select 30, 'Rechte: kein UPDATE, Unterschriften ohne DELETE, anon nichts', 'so',
       concat_ws(', ',
         case when has_table_privilege('authenticated', 'public.bav_unterlagen', 'update') then 'unterlagen update' end,
         case when has_table_privilege('authenticated', 'public.bav_unterschriften', 'update') then 'unterschriften update' end,
         case when has_table_privilege('authenticated', 'public.bav_unterschriften', 'delete') then 'unterschriften delete' end,
         case when has_table_privilege('anon', 'public.bav_unterlagen', 'select') then 'anon unterlagen' end,
         case when has_table_privilege('anon', 'public.bav_unterschriften', 'select') then 'anon unterschriften' end,
         case when has_function_privilege('anon', 'public.bav_unterschreiben(uuid, text, text, text, text, text, text)', 'execute')
              then 'anon funktion' end),
       not (has_table_privilege('authenticated', 'public.bav_unterlagen', 'update')
            or has_table_privilege('authenticated', 'public.bav_unterschriften', 'update')
            or has_table_privilege('authenticated', 'public.bav_unterschriften', 'delete')
            or has_table_privilege('anon', 'public.bav_unterlagen', 'select')
            or has_table_privilege('anon', 'public.bav_unterschriften', 'select')
            or has_function_privilege('anon', 'public.bav_unterschreiben(uuid, text, text, text, text, text, text)', 'execute'))
       and has_table_privilege('authenticated', 'public.bav_unterlagen', 'delete');

insert into ergebnis
select 31, 'Funktionen ohne security definer, mit festem search_path', 'ja',
       string_agg(proname || '=' || prosecdef::text, ', ' order by proname),
       bool_and(not prosecdef and proconfig @> array['search_path=""'])
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('bav_unterschreiben', 'bav_unterlagen_festschreiben', 'bav_unterschrift_eintragen', 'bav_beratung_sperre_pruefen');

-- ---------- AXA-Antrag: der Berater unterschreibt in der Vereinbarung mit ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1"}';
insert into ids values ('axa_a', 'a7a7a7a7-0000-4000-8000-0000000000af');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'axa_a'), (select id from ids where name = 'firma_a'), 'Alex Axa', 'teilnahme',
   '{"schritt":6,"angaben":{"name":"Alex Axa"}}');

do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'axa_a'), 'mitarbeiter', 'Alex Axa', 'M10 20L80 60',
         (select inhalt from html where name = 'protokoll'),
         repeat('<p>AXA-Antrag</p>', 20) || '<div data-unterschrift="mitarbeiter"></div><div data-unterschrift="berater"></div>',
         null);
  insert into ergebnis values (32, 'AXA-Antrag: Mitarbeiter wie bisher', 'protokoll+vereinbarung', v->>'dokumente',
    v->'dokumente' = '["protokoll", "vereinbarung"]'::jsonb);
  v := public.bav_unterschreiben((select id from ids where name = 'axa_a'), 'berater', 'Max Berater', 'M5 5L100 50');
  insert into ergebnis values (33, 'AXA-Antrag mit Berater-Feld: Berater deckt die Vereinbarung mit ab', 'protokoll+vereinbarung',
    v->>'dokumente', v->'dokumente' = '["protokoll", "vereinbarung"]'::jsonb);
exception when others then
  insert into ergebnis values (33, 'AXA-Antrag mit Berater-Feld: Berater deckt die Vereinbarung mit ab', 'angenommen', sqlerrm, false);
end $$;
-- Ohne Berater-Feld (Mustervereinbarung) bleibt es beim Protokoll: Pruefung 3.

-- ---------- AXA bei Verzicht: der Berater unterschreibt im Gespraechsprotokoll hinter der Verzichtserklaerung ----------
insert into ids values ('axa_verzicht_a', 'a8a8a8a8-0000-4000-8000-0000000000b0');
insert into public.bav_beratungen (id, firma, mitarbeiter, status, daten) values
  ((select id from ids where name = 'axa_verzicht_a'), (select id from ids where name = 'firma_a'), 'Vito Verzicht', 'verzicht',
   '{"schritt":6,"angaben":{"name":"Vito Verzicht"}}');

do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'axa_verzicht_a'), 'mitarbeiter', 'Vito Verzicht', 'M10 20L80 60',
         (select inhalt from html where name = 'protokoll'), null,
         repeat('<p>Verzicht und AXA-Protokoll</p>', 20) || '<div data-unterschrift="mitarbeiter"></div><div data-unterschrift="berater"></div>');
  insert into ergebnis values (34, 'AXA bei Verzicht: Mitarbeiter wie bisher', 'protokoll+verzicht', v->>'dokumente',
    v->'dokumente' = '["protokoll", "verzicht"]'::jsonb);
  v := public.bav_unterschreiben((select id from ids where name = 'axa_verzicht_a'), 'berater', 'Max Berater', 'M5 5L100 50');
  insert into ergebnis values (35, 'AXA bei Verzicht mit Berater-Feld: Berater deckt die Verzichtserklaerung mit ab', 'protokoll+verzicht',
    v->>'dokumente', v->'dokumente' = '["protokoll", "verzicht"]'::jsonb);
exception when others then
  insert into ergebnis values (35, 'AXA bei Verzicht mit Berater-Feld: Berater deckt die Verzichtserklaerung mit ab', 'angenommen', sqlerrm, false);
end $$;

-- Die bisherige Verzichtserklaerung hat kein Berater-Feld: Der Berater deckt nur das Protokoll ab.
do $$
declare v jsonb;
begin
  v := public.bav_unterschreiben((select id from ids where name = 'verzicht_a'), 'berater', 'Max Berater', 'M5 5L100 50');
  insert into ergebnis values (36, 'Verzicht ohne Berater-Feld: Berater nur das Protokoll', 'protokoll', v->>'dokumente',
    v->'dokumente' = '["protokoll"]'::jsonb);
exception when others then
  insert into ergebnis values (36, 'Verzicht ohne Berater-Feld: Berater nur das Protokoll', 'angenommen', sqlerrm, false);
end $$;

reset role;

select * from ergebnis order by nr;

rollback;
