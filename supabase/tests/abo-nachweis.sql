-- Nachweis des Abo-Modells (Migrationen …_abo.sql und …_abo_oberflaeche.sql):
-- wer was darf — vor, waehrend der Ankuendigung und nach dem Start, mit
-- Freizugang, Testphase, Buero-Abo, Plaetzen und Einladungen.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck. Die
-- Abo-Pflicht wird NUR in dieser Transaktion eingeschaltet. Ohne `delete` auf
-- oberster Ebene, damit der Nachweis auch ueber Werkzeuge laeuft, die
-- Loeschanweisungen erst bestaetigen lassen.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

-- Konten: b1 Bestand, b2 neu, b3 alt, b4 Inhaber, b5 Mitglied, b6 Dritter,
-- b7 Fremder, b8 kurz vor dem Start registriert.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('aa000000-0000-4000-8000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'abo-' || k || '@test.invalid', 'x', now() - t, now()
  from (values ('b1', interval '30 days'), ('b2', interval '0 days'), ('b3', interval '30 days'),
               ('b4', interval '30 days'), ('b5', interval '30 days'), ('b6', interval '30 days'),
               ('b7', interval '30 days'), ('b8', interval '25 days')) v(k, t);
insert into privat.freizugaenge (nutzer, grund) values ('aa000000-0000-4000-8000-0000000000b1', 'bestand');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
create temp table werte(k text primary key, v text) on commit drop;
grant all on ergebnis, werte to anon, authenticated, service_role;

-- Sicher vor dem Start: Abo-Pflicht aus.
update privat.einstellungen set abo_pflicht_ab = null where id;

-- ---------- Vor dem Start ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b3"}';

insert into ergebnis
select 1, 'Vor dem Start: Altkonto hat alles', 'vorab/alles',
       coalesce(z ->> 'quelle', '—') || '/' || coalesce(z ->> 'paket', '—'),
       coalesce(z ->> 'quelle' = 'vorab' and z ->> 'paket' = 'alles', false)
  from (select public.mein_zugang() z) s;

do $$
begin
  insert into public.szenarien (besitzer, name, daten)
  values ('aa000000-0000-4000-8000-0000000000b3', 'Vorher', '{}');
  insert into ergebnis values (2, 'Vor dem Start: Szenario speichern', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (2, 'Vor dem Start: Szenario speichern', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  insert into public.check_anfragen (berater, kunde) values ('aa000000-0000-4000-8000-0000000000b3', 'Vorher');
  insert into ergebnis values (3, 'Vor dem Start: Kundenlink anlegen', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (3, 'Vor dem Start: Kundenlink anlegen', 'angenommen', sqlerrm, false);
end $$;

-- ---------- Start angekuendigt (in 7 Tagen): noch alles wie bisher ----------
reset role;
update privat.einstellungen set abo_pflicht_ab = now() + interval '7 days' where id;
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b1"}';
insert into ergebnis
select 45, 'Angekuendigt: Bestandskonto erfaehrt, dass es frei bleibt', 'vorab, freizugang bestand',
       coalesce(z ->> 'quelle', '—') || ', freizugang ' || coalesce(z ->> 'freizugang', '—'),
       coalesce(z ->> 'quelle' = 'vorab' and z ->> 'freizugang' = 'bestand', false)
  from (select public.mein_zugang() z) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b2"}';
insert into ergebnis
select 46, 'Angekuendigt: neues Konto sieht das Ende seiner Testphase', 'vorab, test_bis Start + 14 Tage',
       coalesce(z ->> 'quelle', '—') || ', test_bis ' || coalesce(z ->> 'test_bis', '—'),
       coalesce(z ->> 'quelle' = 'vorab' and (z ->> 'test_bis')::timestamptz = now() + interval '21 days', false)
  from (select public.mein_zugang() z) s;

insert into ergebnis
select 47, 'Schalter fuer die Buchung wird mitgeliefert', 'boolean',
       coalesce(jsonb_typeof(z -> 'zahlung_bereit'), '—'),
       coalesce(jsonb_typeof(z -> 'zahlung_bereit') = 'boolean', false)
  from (select public.mein_zugang() z) s;

-- ---------- Start vor 5 Tagen: Testphase ab dem Start ----------
reset role;
update privat.einstellungen set abo_pflicht_ab = now() - interval '5 days' where id;
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b8"}';
insert into ergebnis
select 4, 'Vor dem Start registriert: Testphase bis Start + 14 Tage', 'test bis +9 Tage',
       coalesce(z ->> 'quelle', '—') || ' bis ' || coalesce(z ->> 'bis', '—'),
       coalesce(z ->> 'quelle' = 'test' and (z ->> 'bis')::timestamptz = now() + interval '9 days', false)
  from (select public.mein_zugang() z) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b2"}';
insert into ergebnis
select 5, 'Neues Konto: Testphase 14 Tage ab Registrierung', 'test bis +14 Tage',
       coalesce(z ->> 'quelle', '—') || ' bis ' || coalesce(z ->> 'bis', '—'),
       coalesce(z ->> 'quelle' = 'test' and z ->> 'paket' = 'alles'
                and (z ->> 'bis')::timestamptz = now() + interval '14 days', false)
  from (select public.mein_zugang() z) s;

-- ---------- Start vor 20 Tagen ----------
reset role;
update privat.einstellungen set abo_pflicht_ab = now() - interval '20 days' where id;
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b1"}';
insert into ergebnis
select 6, 'Bestandskonto: dauerhaft frei', 'frei/alles',
       coalesce(z ->> 'quelle', '—') || '/' || coalesce(z ->> 'paket', '—'),
       coalesce(z ->> 'quelle' = 'frei' and z ->> 'paket' = 'alles', false)
  from (select public.mein_zugang() z) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b3"}';
insert into ergebnis
select 7, 'Testphase vorbei, kein Abo: kein Paket', 'kein Paket',
       coalesce(z ->> 'quelle', '—') || '/' || coalesce(z ->> 'paket', '—'),
       z ->> 'paket' is null and z ->> 'quelle' is null
  from (select public.mein_zugang() z) s;

insert into ergebnis
select 8, 'Ohne Paket: hat_paket(rente) ist false', 'false', public.hat_paket('rente')::text,
       not public.hat_paket('rente');

do $$
begin
  insert into public.szenarien (besitzer, name, daten)
  values ('aa000000-0000-4000-8000-0000000000b3', 'Nachher', '{}');
  insert into ergebnis values (9, 'Ohne Paket: neues Szenario', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (9, 'Ohne Paket: neues Szenario', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  update public.szenarien set name = 'Geaendert' where besitzer = 'aa000000-0000-4000-8000-0000000000b3';
  insert into ergebnis values (10, 'Ohne Paket: Szenario aendern', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (10, 'Ohne Paket: Szenario aendern', 'abgewiesen', 'abgewiesen', true);
end $$;

insert into ergebnis
select 11, 'Ohne Paket: eigene Szenarien lesen', '1', count(*)::text, count(*) = 1
  from public.szenarien where besitzer = 'aa000000-0000-4000-8000-0000000000b3';

do $$
begin
  insert into public.check_anfragen (berater, kunde) values ('aa000000-0000-4000-8000-0000000000b3', 'Nachher');
  insert into ergebnis values (12, 'Ohne Paket: Kundenlink anlegen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (12, 'Ohne Paket: Kundenlink anlegen', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
declare n integer;
begin
  delete from public.szenarien where besitzer = 'aa000000-0000-4000-8000-0000000000b3';
  get diagnostics n = row_count;
  insert into ergebnis values (13, 'Ohne Paket: eigene Szenarien loeschen', '1', n::text, n = 1);
end $$;

-- ---------- Buero mit Abo "rente", 2 Plaetze (Service-Rolle) ----------
reset role;
set local role service_role;
insert into werte values ('buero', public.buero_sichern('aa000000-0000-4000-8000-0000000000b4', 'Testbuero')::text);
select public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'sub_test', 'rente', 'monat', 2,
                            'active', now() + interval '30 days', null);
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b4"}';
insert into ergebnis
select 14, 'Inhaber: Abo rente, 1 von 2 Plaetzen', 'abo/rente/inhaber/1 von 2',
       concat_ws('/', z ->> 'quelle', z ->> 'paket', z ->> 'rolle',
                 (z -> 'abo' ->> 'belegt') || ' von ' || (z -> 'abo' ->> 'plaetze')),
       coalesce(z ->> 'quelle' = 'abo' and z ->> 'paket' = 'rente' and z ->> 'rolle' = 'inhaber'
                and (z -> 'abo' ->> 'belegt')::int = 1 and (z -> 'abo' ->> 'plaetze')::int = 2, false)
  from (select public.mein_zugang() z) s;

insert into ergebnis
select 15, 'Paket rente: AG-Seiten nicht, Rente schon', 'ag false, rente true',
       'ag ' || public.hat_paket('ag') || ', rente ' || public.hat_paket('rente'),
       not public.hat_paket('ag') and public.hat_paket('rente');

insert into werte values ('t1', public.einladung_erstellen()::text);
insert into ergebnis
select 16, 'Inhaber erstellt eine Einladung', 'Token', coalesce(v, '—'), v is not null
  from werte where k = 't1';

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b5"}';
insert into ergebnis
select 17, 'Mitglied nimmt die Einladung an', 'ok', r, r = 'ok'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't1')) r) s;

insert into ergebnis
select 18, 'Mitglied: Abo rente als Mitglied', 'abo/rente/mitglied',
       concat_ws('/', z ->> 'quelle', z ->> 'paket', z ->> 'rolle'),
       coalesce(z ->> 'quelle' = 'abo' and z ->> 'paket' = 'rente' and z ->> 'rolle' = 'mitglied', false)
  from (select public.mein_zugang() z) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b6"}';
insert into ergebnis
select 19, 'Eingeloeste Einladung gilt nicht ein zweites Mal', 'ungueltig', r, r = 'ungueltig'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't1')) r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b4"}';
do $$
begin
  perform public.einladung_erstellen();
  insert into ergebnis values (20, 'Keine Einladung, wenn alle Plaetze belegt', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (20, 'Keine Einladung, wenn alle Plaetze belegt', 'abgewiesen', sqlerrm,
                               sqlerrm like 'Alle Plaetze%');
end $$;

reset role;
do $$
begin
  insert into privat.buero_mitglieder (buero, nutzer, rolle)
  values ((select v::uuid from werte where k = 'buero'), 'aa000000-0000-4000-8000-0000000000b6', 'mitglied');
  insert into ergebnis values (21, 'Trigger: drittes Mitglied bei 2 Plaetzen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when check_violation then
  insert into ergebnis values (21, 'Trigger: drittes Mitglied bei 2 Plaetzen', 'abgewiesen', sqlerrm, true);
end $$;
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b5"}';
do $$
begin
  perform public.einladung_erstellen();
  insert into ergebnis values (22, 'Mitglied darf nicht einladen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (22, 'Mitglied darf nicht einladen', 'abgewiesen', sqlerrm, true);
end $$;

insert into ergebnis
select 23, 'Mitglied sieht die Kollegen mit E-Mail', '2 mit E-Mail', count(*) || ' mit E-Mail',
       count(*) = 2 and bool_and(email like 'abo-b_@test.invalid')
  from public.buero_mitglieder();

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b7"}';
insert into ergebnis
select 24, 'Fremdes Konto sieht weder Mitglieder noch Einladungen', '0/0',
       (select count(*) from public.buero_mitglieder()) || '/' || (select count(*) from public.buero_einladungen()),
       (select count(*) from public.buero_mitglieder()) = 0 and (select count(*) from public.buero_einladungen()) = 0;

do $$
begin
  perform public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'x', 'alles', 'monat', 50,
                               'active', null, null);
  insert into ergebnis values (25, 'Angemeldet: Abo selbst schreiben', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (25, 'Angemeldet: Abo selbst schreiben', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform count(*) from privat.abos;
  insert into ergebnis values (26, 'Angemeldet: Tabellen in privat lesen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (26, 'Angemeldet: Tabellen in privat lesen', 'abgewiesen', 'abgewiesen', true);
end $$;

set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.mein_zugang();
  insert into ergebnis values (27, 'Ohne Anmeldung: mein_zugang', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (27, 'Ohne Anmeldung: mein_zugang', 'abgewiesen', 'abgewiesen', true);
end $$;

-- ---------- Plaetze verringert: Wer darueber liegt, verliert den Zugang ----------
reset role;
select public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'sub_test', 'rente', 'monat', 1,
                            'active', now() + interval '30 days', null);
set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b5"}';
insert into ergebnis
select 28, 'Plaetze auf 1: Mitglied ohne Platz hat kein Paket', 'kein Paket, hat_platz false',
       coalesce(z ->> 'paket', 'kein Paket') || ', hat_platz ' || (z ->> 'hat_platz'),
       z ->> 'paket' is null and (z ->> 'hat_platz')::boolean = false
  from (select public.mein_zugang() z) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b4"}';
insert into ergebnis
select 29, 'Plaetze auf 1: Inhaber behaelt den Zugang', 'rente', coalesce(z ->> 'paket', '—'),
       coalesce(z ->> 'paket' = 'rente', false)
  from (select public.mein_zugang() z) s;

-- ---------- Status ----------
reset role;
select public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'sub_test', 'rente', 'monat', 3,
                            'past_due', now() + interval '30 days', null);
set local role authenticated;
insert into ergebnis
select 30, 'Zahlung offen (past_due): Zugang bleibt', 'rente', coalesce(z ->> 'paket', '—'),
       coalesce(z ->> 'paket' = 'rente', false)
  from (select public.mein_zugang() z) s;

reset role;
select public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'sub_test', 'rente', 'monat', 3,
                            'canceled', now() - interval '1 day', null);
set local role authenticated;
insert into ergebnis
select 31, 'Abo beendet (canceled): kein Paket mehr', 'kein Paket', coalesce(z ->> 'paket', 'kein Paket'),
       z ->> 'paket' is null
  from (select public.mein_zugang() z) s;

reset role;
select public.abo_schreiben((select v::uuid from werte where k = 'buero'), 'sub_test', 'rente', 'monat', 3,
                            'active', now() + interval '30 days', now() + interval '30 days');
set local role authenticated;
insert into ergebnis
select 32, 'Gekuendigt zum Laufzeitende: Zugang bis dahin', 'rente bis Kuendigung',
       coalesce(z ->> 'paket', '—') || ' bis ' || coalesce(z ->> 'bis', '—'),
       coalesce(z ->> 'paket' = 'rente' and (z ->> 'bis')::timestamptz = now() + interval '30 days', false)
  from (select public.mein_zugang() z) s;

-- ---------- Einladungen: zurueckgezogen, abgelaufen, anderes Buero ----------
insert into werte values ('t2', public.einladung_erstellen()::text);
select public.einladung_zurueckziehen((select v::uuid from werte where k = 't2'));
insert into ergebnis
select 33, 'Inhaber sieht keine offene Einladung nach dem Zurueckziehen', '0', count(*)::text, count(*) = 0
  from public.buero_einladungen();

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b6"}';
insert into ergebnis
select 34, 'Zurueckgezogene Einladung', 'abgelaufen', r, r = 'abgelaufen'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't2')) r) s;

reset role;
insert into privat.einladungen (token, buero, gueltig_bis)
values ('aa000000-0000-4000-8000-0000000000e1', (select v::uuid from werte where k = 'buero'), now() - interval '1 day');
select public.buero_sichern('aa000000-0000-4000-8000-0000000000b7', 'Fremdbuero');
set local role authenticated;
insert into ergebnis
select 35, 'Abgelaufene Einladung', 'abgelaufen', r, r = 'abgelaufen'
  from (select public.einladung_annehmen('aa000000-0000-4000-8000-0000000000e1') r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b4"}';
insert into werte values ('t3', public.einladung_erstellen()::text);
insert into ergebnis
select 36, 'Inhaber nimmt die eigene Einladung an', 'schon_im_buero', r, r = 'schon_im_buero'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't3')) r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b7"}';
insert into ergebnis
select 37, 'Inhaber eines anderen Bueros', 'anderes_buero', r, r = 'anderes_buero'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't3')) r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b6"}';
insert into ergebnis
select 38, 'Dritter nimmt an (3 Plaetze)', 'ok', r, r = 'ok'
  from (select public.einladung_annehmen((select v::uuid from werte where k = 't3')) r) s;

-- ---------- Entfernen und Austreten ----------
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b4"}';
select public.mitglied_entfernen('aa000000-0000-4000-8000-0000000000b6');
insert into ergebnis
select 39, 'Inhaber entfernt ein Mitglied', '2 Mitglieder', count(*) || ' Mitglieder', count(*) = 2
  from public.buero_mitglieder();

do $$
begin
  perform public.mitglied_entfernen('aa000000-0000-4000-8000-0000000000b4');
  insert into ergebnis values (40, 'Inhaber entfernt sich selbst', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (40, 'Inhaber entfernt sich selbst', 'abgewiesen', sqlerrm, true);
end $$;

do $$
begin
  perform public.buero_verlassen();
  insert into ergebnis values (41, 'Inhaber tritt aus', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (41, 'Inhaber tritt aus', 'abgewiesen', sqlerrm, true);
end $$;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000b5"}';
do $$
begin
  perform public.mitglied_entfernen('aa000000-0000-4000-8000-0000000000b4');
  insert into ergebnis values (42, 'Mitglied entfernt den Inhaber', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (42, 'Mitglied entfernt den Inhaber', 'abgewiesen', sqlerrm, true);
end $$;

select public.buero_verlassen();
insert into ergebnis
select 43, 'Mitglied tritt aus: kein Buero mehr', 'kein Buero', coalesce(z ->> 'buero', 'kein Buero'),
       z ->> 'buero' is null
  from (select public.mein_zugang() z) s;

-- ---------- Service-Rolle: Kontext fuer Kasse und Portal ----------
reset role;
set local role service_role;
insert into ergebnis
select 44, 'Service-Rolle: Kontext des Inhabers', 'inhaber/active/rente',
       concat_ws('/', k ->> 'rolle', k ->> 'status', k ->> 'paket'),
       coalesce(k ->> 'rolle' = 'inhaber' and k ->> 'status' = 'active' and k ->> 'paket' = 'rente', false)
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000b4') k) s;

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
