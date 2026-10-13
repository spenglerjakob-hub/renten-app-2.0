-- Nachweis Early Adopter (Migrationen …_fruehstart.sql und
-- …_fruehstart_teilnehmer.sql): persoenliche Links, Einloesen, drei Monate ab
-- dem Start, Rueckmeldungen, Teilnehmerliste und Rechte.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck; auch die
-- Benachrichtigungen (pg_net) gehen dadurch nicht hinaus. Ohne `delete` auf
-- oberster Ebene.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

-- Konten: f1 Betreiber, f2 neu (Teilnehmer), f3 Bestand, f4 neu
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('aa000000-0000-4000-8000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'fs-' || k || '@test.invalid', 'x', now() - interval '60 days', now()
  from (values ('f1'), ('f2'), ('f3'), ('f4')) v(k);
insert into privat.freizugaenge (nutzer, grund) values
  ('aa000000-0000-4000-8000-0000000000f1', 'betreiber'),
  ('aa000000-0000-4000-8000-0000000000f3', 'bestand');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
create temp table werte(k text primary key, v text) on commit drop;
grant all on ergebnis, werte to anon, authenticated, service_role;

update privat.einstellungen set abo_pflicht_ab = null where id;

-- ---------- Links ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f2"}';
do $$
begin
  perform public.fruehstart_link_erstellen('Versuch');
  insert into ergebnis values (1, 'Kunde erstellt einen Early-Adopter-Link', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (1, 'Kunde erstellt einen Early-Adopter-Link', 'abgewiesen', 'abgewiesen', true);
end $$;
insert into ergebnis
select 2, 'Kunde sieht keine Links', '0', count(*)::text, count(*) = 0 from public.fruehstart_links();

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f1"}';
insert into werte values ('l1', public.fruehstart_link_erstellen('Max Muster')::text);
insert into werte values ('l2', public.fruehstart_link_erstellen('Zweiter Link')::text);
insert into werte values ('l3', public.fruehstart_link_erstellen('Zurueckgezogen')::text);
insert into ergebnis
select 3, 'Betreiber erstellt und sieht seine Links', '3 offen', count(*) || ' offen',
       count(*) = 3 and bool_and(email is null and eingeloest_am is null)
  from public.fruehstart_links()
 where token in (select v::uuid from werte where k like 'l%');
select public.fruehstart_link_zurueckziehen((select v::uuid from werte where k = 'l3'));

-- ---------- Einloesen ----------
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f2"}';
insert into ergebnis
select 4, 'Neues Konto loest ein', 'ok', r, r = 'ok'
  from (select public.fruehstart_einloesen((select v::uuid from werte where k = 'l1')) r) s;
insert into ergebnis
select 5, 'Noch einmal (auch mit anderem Link)', 'schon_dabei', r, r = 'schon_dabei'
  from (select public.fruehstart_einloesen((select v::uuid from werte where k = 'l2')) r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f4"}';
insert into ergebnis
select 6, 'Eingeloester Link fuer ein zweites Konto', 'ungueltig', r, r = 'ungueltig'
  from (select public.fruehstart_einloesen((select v::uuid from werte where k = 'l1')) r) s;
insert into ergebnis
select 7, 'Zurueckgezogener Link', 'abgelaufen', r, r = 'abgelaufen'
  from (select public.fruehstart_einloesen((select v::uuid from werte where k = 'l3')) r) s;
insert into ergebnis
select 8, 'Erfundener Link', 'ungueltig', r, r = 'ungueltig'
  from (select public.fruehstart_einloesen('aa000000-0000-4000-8000-0000000000ff') r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f3"}';
insert into ergebnis
select 9, 'Bestandskonto braucht keinen Link', 'frei', r, r = 'frei'
  from (select public.fruehstart_einloesen((select v::uuid from werte where k = 'l2')) r) s;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f1"}';
insert into ergebnis
select 10, 'Betreiber sieht, wer eingeloest hat; der andere Link bleibt offen', 'fs-f2, zweiter offen',
       coalesce((select email from public.fruehstart_links() where token = (select v::uuid from werte where k = 'l1')), '—')
         || ', zweiter '
         || case when (select eingeloest_am from public.fruehstart_links()
                        where token = (select v::uuid from werte where k = 'l2')) is null then 'offen' else 'eingeloest' end,
       coalesce((select email from public.fruehstart_links() where token = (select v::uuid from werte where k = 'l1'))
                  = 'fs-f2@test.invalid', false)
         and (select eingeloest_am from public.fruehstart_links() where token = (select v::uuid from werte where k = 'l2')) is null;

-- ---------- Drei Monate ab dem Start ----------
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f2"}';
insert into ergebnis
select 11, 'Vor dem Start: alles frei, Fruehstart vermerkt, noch ohne Ende', 'vorab, fruehstart, ohne Ende',
       concat_ws(', ', z ->> 'quelle', case when (z ->> 'fruehstart')::boolean then 'fruehstart' end,
                 coalesce(z ->> 'fruehstart_bis', 'ohne Ende')),
       coalesce(z ->> 'quelle' = 'vorab' and (z ->> 'fruehstart')::boolean and z ->> 'fruehstart_bis' is null, false)
  from (select public.mein_zugang() z) s;

reset role;
update privat.einstellungen set abo_pflicht_ab = now() + interval '7 days' where id;
set local role authenticated;
insert into ergebnis
select 12, 'Start angekuendigt: drei Monate ab dem Start', 'Start + 3 Monate', coalesce(z ->> 'fruehstart_bis', '—'),
       coalesce((z ->> 'fruehstart_bis')::timestamptz = now() + interval '7 days' + interval '3 months', false)
  from (select public.mein_zugang() z) s;

reset role;
update privat.einstellungen set abo_pflicht_ab = now() - interval '5 days' where id;
set local role authenticated;
insert into ergebnis
select 13, 'Nach dem Start eingeloest: Fruehstart bis Einloesung + 3 Monate', 'fruehstart/alles',
       concat_ws('/', z ->> 'quelle', z ->> 'paket'),
       coalesce(z ->> 'quelle' = 'fruehstart' and z ->> 'paket' = 'alles'
                and (z ->> 'bis')::timestamptz = now() + interval '3 months', false)
  from (select public.mein_zugang() z) s;
insert into ergebnis
select 14, 'Fruehstarter darf speichern (Paket Rente)', 'true', public.hat_paket('rente')::text, public.hat_paket('rente');

reset role;
update privat.einstellungen set abo_pflicht_ab = now() - interval '4 months' where id;
update privat.fruehstarter set seit = now() - interval '5 months' where nutzer = 'aa000000-0000-4000-8000-0000000000f2';
set local role authenticated;
insert into ergebnis
select 15, 'Nach den drei Monaten: kein Paket mehr', 'kein Paket', coalesce(z ->> 'paket', 'kein Paket'),
       z ->> 'paket' is null and coalesce((z ->> 'fruehstart')::boolean, false)
  from (select public.mein_zugang() z) s;
insert into ergebnis
select 29, 'Der Zugang nennt den Beginn der Teilnahme', 'vor 5 Monaten', coalesce(z ->> 'fruehstart_seit', '—'),
       coalesce((z ->> 'fruehstart_seit')::timestamptz = now() - interval '5 months', false)
  from (select public.mein_zugang() z) s;

-- ---------- Rueckmeldungen ----------
do $$
begin
  perform public.rueckmeldung_senden(4, 'Sehr hilfreich, bitte mehr Grafiken.', true, 'Ergebnis');
  insert into ergebnis values (16, 'Rueckmeldung senden', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (16, 'Rueckmeldung senden', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  perform public.rueckmeldung_senden(null, '   ', false, '');
  insert into ergebnis values (17, 'Leere Rueckmeldung', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (17, 'Leere Rueckmeldung', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform public.rueckmeldung_senden(7, 'x', false, '');
  insert into ergebnis values (18, 'Bewertung 7 von 5', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (18, 'Bewertung 7 von 5', 'abgewiesen', 'abgewiesen', true);
end $$;

insert into ergebnis
select 19, 'Der Zugang kennt die letzte Rueckmeldung', 'jetzt', coalesce(z ->> 'letzte_rueckmeldung', '—'),
       coalesce((z ->> 'letzte_rueckmeldung')::timestamptz = now(), false)
  from (select public.mein_zugang() z) s;

-- Eine ist schon da: neun weitere gehen, die elfte am selben Tag nicht.
do $$
declare
  i integer;
begin
  for i in 1..9 loop
    perform public.rueckmeldung_senden(5, 'Nr. ' || i, false, '');
  end loop;
  begin
    perform public.rueckmeldung_senden(5, 'Nr. 10', false, '');
    insert into ergebnis values (20, 'Elfte Rueckmeldung an einem Tag', 'abgewiesen', 'DURCHGEGANGEN', false);
  exception when others then
    insert into ergebnis values (20, 'Elfte Rueckmeldung an einem Tag', 'abgewiesen', sqlerrm, sqlerrm like 'Zu viele%');
  end;
end $$;

insert into ergebnis
select 21, 'Kunde liest die Rueckmeldungsliste', '0', count(*)::text, count(*) = 0 from public.rueckmeldungen();
insert into ergebnis
select 30, 'Kunde sieht keine Teilnehmer', '0', count(*)::text, count(*) = 0 from public.fruehstart_teilnehmer();

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000f1"}';
insert into ergebnis
select 22, 'Betreiber sieht die Rueckmeldungen mit Absender', '10 von fs-f2, Fruehstarter',
       count(*) || ' von ' || coalesce(min(email), '—') || case when bool_and(fruehstarter) then ', Fruehstarter' else '' end,
       count(*) = 10 and min(email) = 'fs-f2@test.invalid' and bool_and(fruehstarter)
  from public.rueckmeldungen()
 where email like 'fs-%@test.invalid';

-- Seit vor 5 Monaten, Start vor 4 Monaten: kostenlos bis Start + 3 Monate.
insert into ergebnis
select 31, 'Betreiber sieht Teilnehmer mit Notiz, Ende und Rueckmeldungen', 'Max Muster, Start + 3 Monate, 10',
       coalesce(t.notiz || ', ' || coalesce(t.bis::text, 'ohne Ende') || ', ' || t.rueckmeldungen, 'keine Zeile'),
       coalesce(t.notiz = 'Max Muster' and t.bis = now() - interval '4 months' + interval '3 months'
                and t.rueckmeldungen = 10 and t.letzte_rueckmeldung = now(), false)
  from (select 1) eins
  left join public.fruehstart_teilnehmer() t on t.email = 'fs-f2@test.invalid';

do $$
begin
  perform count(*) from privat.rueckmeldungen;
  insert into ergebnis values (23, 'Angemeldet: Tabelle der Rueckmeldungen lesen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (23, 'Angemeldet: Tabelle der Rueckmeldungen lesen', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform public.rueckmeldung_beanspruchen(gen_random_uuid());
  insert into ergebnis values (24, 'Angemeldet: Benachrichtigung beanspruchen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (24, 'Angemeldet: Benachrichtigung beanspruchen', 'abgewiesen', 'abgewiesen', true);
end $$;

set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.fruehstart_einloesen(gen_random_uuid());
  insert into ergebnis values (25, 'Ohne Anmeldung: Link einloesen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (25, 'Ohne Anmeldung: Link einloesen', 'abgewiesen', 'abgewiesen', true);
end $$;
do $$
begin
  perform public.rueckmeldung_senden(5, 'x', false, '');
  insert into ergebnis values (26, 'Ohne Anmeldung: Rueckmeldung senden', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (26, 'Ohne Anmeldung: Rueckmeldung senden', 'abgewiesen', 'abgewiesen', true);
end $$;
do $$
begin
  perform public.fruehstart_teilnehmer();
  insert into ergebnis values (32, 'Ohne Anmeldung: Teilnehmerliste', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (32, 'Ohne Anmeldung: Teilnehmerliste', 'abgewiesen', 'abgewiesen', true);
end $$;

-- ---------- Benachrichtigung: Service-Rolle, genau einmal ----------
reset role;
insert into werte
select 'r1', r.id::text from privat.rueckmeldungen r
 where r.nutzer = 'aa000000-0000-4000-8000-0000000000f2' and r.bewertung = 4;
set local role service_role;
insert into ergebnis
select 27, 'Service-Rolle beansprucht: Inhalt, Absender, Betreiber', 'Text, fs-f2, Betreiber dabei',
       coalesce(left(b ->> 'text', 20), '—') || ', ' || coalesce(b ->> 'autor', '—') || ', '
         || jsonb_array_length(coalesce(b -> 'betreiber', '[]'::jsonb)) || ' Betreiber',
       coalesce(b ->> 'autor' = 'fs-f2@test.invalid' and (b -> 'betreiber') ? 'fs-f1@test.invalid'
                and (b ->> 'kontakt_ok')::boolean, false)
  from (select public.rueckmeldung_beanspruchen((select v::uuid from werte where k = 'r1')) b) s;
insert into ergebnis
select 28, 'Zweites Beanspruchen: nichts mehr zu tun', 'leer', coalesce(b::text, 'leer'), b is null
  from (select public.rueckmeldung_beanspruchen((select v::uuid from werte where k = 'r1')) b) s;

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
