-- Nachweis zu Migration …_stripe.sql: Buchung zuerst nur fuer den Betreiber,
-- und was `abo_kontext()` Kasse, Portal und Kontoloeschung meldet.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck; der
-- Schalter `zahlung_bereit` wird NUR hier eingeschaltet.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

-- s1 Betreiber, s2 gewoehnliches Konto, s3 Early Adopter mit laufendem Abo, s4 Mitglied bei s3
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('aa000000-0000-4000-8000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'stripe-' || k || '@test.invalid', 'x', now(), now()
  from (values ('c1'), ('c2'), ('c3'), ('c4')) v(k);
insert into privat.freizugaenge (nutzer, grund) values ('aa000000-0000-4000-8000-0000000000c1', 'betreiber');
insert into privat.fruehstarter (nutzer) values ('aa000000-0000-4000-8000-0000000000c3');
insert into privat.bueros (id, name, inhaber, stripe_kunde)
values ('aa000000-0000-4000-8000-0000000000f3', 'Muster', 'aa000000-0000-4000-8000-0000000000c3', 'cus_nachweis');
insert into privat.buero_mitglieder (buero, nutzer, rolle)
values ('aa000000-0000-4000-8000-0000000000f3', 'aa000000-0000-4000-8000-0000000000c3', 'inhaber');
insert into privat.abos (buero, stripe_abo, paket, intervall, plaetze, status, laeuft_bis)
values ('aa000000-0000-4000-8000-0000000000f3', 'sub_nachweis', 'rente', 'monat', 2, 'active', now() + interval '20 days');
insert into privat.buero_mitglieder (buero, nutzer, rolle)
values ('aa000000-0000-4000-8000-0000000000f3', 'aa000000-0000-4000-8000-0000000000c4', 'mitglied');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
grant all on ergebnis to authenticated, service_role;

-- ---------- Schalter aus: niemand bucht ----------
update privat.einstellungen set zahlung_bereit = false, zahlung_nur_betreiber = true where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000c1"}';
insert into ergebnis select 1, 'Schalter aus: auch der Betreiber nicht', 'false',
       (public.mein_zugang() ->> 'zahlung_bereit'), (public.mein_zugang() ->> 'zahlung_bereit') = 'false';

-- ---------- Schalter an, nur Betreiber ----------
reset role;
update privat.einstellungen set zahlung_bereit = true where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000c1"}';
insert into ergebnis select 2, 'Nur Betreiber: Betreiber bucht', 'true',
       (public.mein_zugang() ->> 'zahlung_bereit'), (public.mein_zugang() ->> 'zahlung_bereit') = 'true';
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000c2"}';
insert into ergebnis select 3, 'Nur Betreiber: andere nicht', 'false',
       (public.mein_zugang() ->> 'zahlung_bereit'), (public.mein_zugang() ->> 'zahlung_bereit') = 'false';

reset role;
set local role service_role;
insert into ergebnis select 4, 'Kontext: Betreiber bereit, ohne Buero', 'true/true/',
       concat_ws('/', k ->> 'betreiber', k ->> 'zahlung_bereit', coalesce(k ->> 'buero', '')),
       coalesce(k ->> 'betreiber' = 'true' and k ->> 'zahlung_bereit' = 'true' and k ->> 'buero' is null, false)
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000c1') k) s;
insert into ergebnis select 5, 'Kontext: anderes Konto nicht bereit', 'false/false',
       concat_ws('/', k ->> 'betreiber', k ->> 'zahlung_bereit'),
       coalesce(k ->> 'betreiber' = 'false' and k ->> 'zahlung_bereit' = 'false', false)
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000c2') k) s;
insert into ergebnis select 6, 'Kontext: Inhaber mit Abo, Early Adopter', 'inhaber/true/true/cus_nachweis/sub_nachweis',
       concat_ws('/', k ->> 'rolle', k ->> 'abo_aktiv', k ->> 'fruehstarter', k ->> 'stripe_kunde', k ->> 'stripe_abo'),
       coalesce(k ->> 'rolle' = 'inhaber' and k ->> 'abo_aktiv' = 'true' and k ->> 'fruehstarter' = 'true'
                and k ->> 'stripe_kunde' = 'cus_nachweis' and k ->> 'stripe_abo' = 'sub_nachweis'
                and k ->> 'kuendigung_zum' is null, false)
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000c3') k) s;
insert into ergebnis select 7, 'Kontext: Mitglied', 'mitglied',
       k ->> 'rolle', coalesce(k ->> 'rolle' = 'mitglied', false)
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000c4') k) s;
insert into ergebnis select 8, 'Kontext: unbekanntes Konto', 'null',
       coalesce(public.abo_kontext('aa000000-0000-4000-8000-0000000000ff')::text, 'null'),
       public.abo_kontext('aa000000-0000-4000-8000-0000000000ff') is null;

-- Der Webhook schreibt eine Kuendigung zum Laufzeitende.
select public.abo_schreiben('aa000000-0000-4000-8000-0000000000f3', 'sub_nachweis', 'rente', 'monat', 2,
                            'active', now() + interval '20 days', now() + interval '20 days');
insert into ergebnis select 9, 'Kontext: Kuendigung sichtbar', 'gesetzt',
       case when k ->> 'kuendigung_zum' is null then 'leer' else 'gesetzt' end, k ->> 'kuendigung_zum' is not null
  from (select public.abo_kontext('aa000000-0000-4000-8000-0000000000c3') k) s;

-- ---------- Rechte: Kunden rufen abo_kontext nicht auf ----------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000c3"}';
do $$
begin
  perform public.abo_kontext('aa000000-0000-4000-8000-0000000000c3');
  insert into ergebnis values (10, 'authenticated: abo_kontext gesperrt', 'abgewiesen', 'ausgefuehrt', false);
exception when insufficient_privilege then
  insert into ergebnis values (10, 'authenticated: abo_kontext gesperrt', 'abgewiesen', 'abgewiesen', true);
end $$;

-- ---------- Schalter fuer alle ----------
reset role;
update privat.einstellungen set zahlung_nur_betreiber = false where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000c2"}';
insert into ergebnis select 11, 'Fuer alle: anderes Konto bucht', 'true',
       (public.mein_zugang() ->> 'zahlung_bereit'), (public.mein_zugang() ->> 'zahlung_bereit') = 'true';

reset role;
select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
