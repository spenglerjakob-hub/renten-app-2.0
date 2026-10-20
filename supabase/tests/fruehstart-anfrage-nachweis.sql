-- Nachweis Early-Adopter-Anfragen (Migration …_fruehstart_anfragen.sql):
-- Anfrage ohne Konto, Pruefungen, Ratenbegrenzung, Rechte, Zusagen/Absagen,
-- Benachrichtigung (Beanspruchen) und Aufraeumen nach 180 Tagen.
--
-- Laeuft vollstaendig in einer Transaktion und rollt am Ende zurueck; auch die
-- Benachrichtigungen (pg_net) gehen dadurch nicht hinaus. Ohne `delete` auf
-- oberster Ebene.
--
-- Erwartung: Spalte "bestanden" ist in JEDER Zeile true.

begin;

-- Konten: a1 Betreiber, a2 gewoehnliches Konto
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ab000000-0000-4000-8000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'ea-' || k || '@test.invalid', 'x', now(), now()
  from (values ('a1'), ('a2')) v(k);
insert into privat.freizugaenge (nutzer, grund) values ('ab000000-0000-4000-8000-0000000000a1', 'betreiber');

create temp table ergebnis(nr int, pruefung text, erwartet text, tatsaechlich text, bestanden boolean) on commit drop;
create temp table werte(k text primary key, v text) on commit drop;
grant all on ergebnis, werte to anon, authenticated, service_role;

-- ---------- Ohne Konto ----------
set local role anon;
set local request.jwt.claims = '{}';

do $$
begin
  perform public.fruehstart_anfrage_senden('Max Muster', 'Max.Muster@Example.de', 'Muster Finanz GmbH', 3);
  insert into ergebnis values (1, 'Anfrage ohne Konto', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (1, 'Anfrage ohne Konto', 'angenommen', sqlerrm, false);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_senden('Max Muster', 'keine-adresse', '', null);
  insert into ergebnis values (2, 'Ungueltige E-Mail-Adresse', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (2, 'Ungueltige E-Mail-Adresse', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_senden('   ', 'leer@example.de', '', null);
  insert into ergebnis values (3, 'Name fehlt', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (3, 'Name fehlt', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_senden(repeat('x', 121), 'lang@example.de', '', null);
  insert into ergebnis values (4, 'Name mit 121 Zeichen', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (4, 'Name mit 121 Zeichen', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_senden('Max Muster', 'null@example.de', '', 0);
  insert into ergebnis values (5, 'Zahl der Berater 0', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (5, 'Zahl der Berater 0', 'abgewiesen', 'abgewiesen', true);
end $$;

do $$
begin
  -- Dieselbe Adresse noch einmal (andere Schreibweise): gilt als angekommen, keine zweite Zeile.
  perform public.fruehstart_anfrage_senden('Max Muster', '  max.muster@example.DE ', '', null);
  insert into ergebnis values (6, 'Zweite offene Anfrage derselben Adresse', 'ohne Fehler', 'ohne Fehler', true);
exception when others then
  insert into ergebnis values (6, 'Zweite offene Anfrage derselben Adresse', 'ohne Fehler', sqlerrm, false);
end $$;

do $$
begin
  perform * from privat.fruehstart_anfragen;
  insert into ergebnis values (7, 'anon liest die Tabelle', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (7, 'anon liest die Tabelle', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

do $$
begin
  perform * from public.fruehstart_anfragen();
  insert into ergebnis values (8, 'anon ruft die Liste ab', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (8, 'anon ruft die Liste ab', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_zusagen(gen_random_uuid());
  insert into ergebnis values (9, 'anon sagt zu', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (9, 'anon sagt zu', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_beanspruchen(gen_random_uuid());
  insert into ergebnis values (10, 'anon beansprucht die Benachrichtigung', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (10, 'anon beansprucht die Benachrichtigung', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

-- ---------- Gewoehnliches Konto ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-0000000000a2"}';

do $$
begin
  perform public.fruehstart_anfrage_senden('Erika Beispiel', 'erika@example.de', '', null);
  insert into ergebnis values (11, 'Anfrage mit Konto', 'angenommen', 'angenommen', true);
exception when others then
  insert into ergebnis values (11, 'Anfrage mit Konto', 'angenommen', sqlerrm, false);
end $$;

insert into ergebnis
select 12, 'Konto sieht keine Anfragen', '0', count(*)::text, count(*) = 0 from public.fruehstart_anfragen();

do $$
begin
  perform public.fruehstart_anfrage_zusagen(gen_random_uuid());
  insert into ergebnis values (13, 'Konto sagt zu', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (13, 'Konto sagt zu', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

do $$
begin
  perform public.fruehstart_anfrage_absagen(gen_random_uuid());
  insert into ergebnis values (14, 'Konto sagt ab', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when insufficient_privilege then
  insert into ergebnis values (14, 'Konto sagt ab', 'abgewiesen', 'abgewiesen (insufficient_privilege)', true);
end $$;

-- ---------- Betreiber ----------
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-0000000000a1"}';

insert into ergebnis
select 15, 'Betreiber sieht zwei Anfragen, Adresse klein geschrieben', '2 / max.muster@example.de',
       count(*)::text || ' / ' || coalesce(min(email) filter (where name = 'Max Muster'), '—'),
       count(*) = 2 and min(email) filter (where name = 'Max Muster') = 'max.muster@example.de'
  from public.fruehstart_anfragen();

insert into werte select 'max', id::text from public.fruehstart_anfragen() where name = 'Max Muster';
insert into werte select 'erika', id::text from public.fruehstart_anfragen() where name = 'Erika Beispiel';
insert into werte select 'token', public.fruehstart_anfrage_zusagen((select v from werte where k = 'max')::uuid)::text;

insert into ergebnis
select 16, 'Zusagen: Link mit Notiz, Status zugesagt',
       'Max Muster, Muster Finanz GmbH (Anfrage) / zugesagt',
       coalesce(l.notiz, '—') || ' / ' || a.status,
       l.notiz = 'Max Muster, Muster Finanz GmbH (Anfrage)' and a.status = 'zugesagt'
  from public.fruehstart_anfragen() a
  join public.fruehstart_links() l on l.token = a.link
 where a.name = 'Max Muster';

insert into ergebnis
select 17, 'Zweites Zusagen liefert denselben Link', (select v from werte where k = 'token'),
       public.fruehstart_anfrage_zusagen((select v from werte where k = 'max')::uuid)::text,
       public.fruehstart_anfrage_zusagen((select v from werte where k = 'max')::uuid)::text = (select v from werte where k = 'token');

select public.fruehstart_anfrage_absagen((select v from werte where k = 'erika')::uuid);
select public.fruehstart_anfrage_absagen((select v from werte where k = 'max')::uuid);
insert into ergebnis
select 18, 'Absagen wirkt nur auf offene Anfragen', 'Erika abgesagt, Max zugesagt',
       string_agg(name || ' ' || status, ', ' order by name),
       bool_and((name = 'Erika Beispiel' and status = 'abgesagt') or (name = 'Max Muster' and status = 'zugesagt'))
  from public.fruehstart_anfragen();

-- ---------- Ratenbegrenzung ----------
reset role;
insert into privat.fruehstart_anfragen (name, email)
select 'Flut ' || i, 'flut' || i || '@example.de' from generate_series(1, 30) i;

set local role anon;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.fruehstart_anfrage_senden('Noch einer', 'noch@example.de', '', null);
  insert into ergebnis values (19, 'Mehr als 30 Anfragen in der Stunde', 'abgewiesen', 'DURCHGEGANGEN', false);
exception when others then
  insert into ergebnis values (19, 'Mehr als 30 Anfragen in der Stunde', 'abgewiesen', 'abgewiesen: ' || sqlerrm, sqlerrm = 'Zu viele Anfragen');
end $$;

-- ---------- Benachrichtigung (Service-Rolle der Edge Function) ----------
set local role service_role;
insert into ergebnis
select 20, 'Beanspruchen liefert Inhalt und Betreiber-Adresse', 'Max Muster / ea-a1@test.invalid',
       -- Nur die Test-Adresse ausgeben — echte Betreiber-Adressen gehoeren nicht ins Protokoll.
       coalesce(j ->> 'name', '—') || ' / '
         || case when j -> 'betreiber' ? 'ea-a1@test.invalid' then 'ea-a1@test.invalid' else 'fehlt' end,
       j ->> 'name' = 'Max Muster' and j -> 'betreiber' ? 'ea-a1@test.invalid'
  from (select public.fruehstart_anfrage_beanspruchen((select v from werte where k = 'max')::uuid) as j) x;

insert into ergebnis
select 21, 'Zweites Beanspruchen: nichts zu tun', 'null', coalesce(j::text, 'null'), j is null
  from (select public.fruehstart_anfrage_beanspruchen((select v from werte where k = 'max')::uuid) as j) x;

select public.fruehstart_anfrage_freigeben((select v from werte where k = 'max')::uuid);
insert into ergebnis
select 22, 'Nach dem Freigeben erneut beanspruchbar', 'Max Muster', coalesce(j ->> 'name', '—'), j ->> 'name' = 'Max Muster'
  from (select public.fruehstart_anfrage_beanspruchen((select v from werte where k = 'max')::uuid) as j) x;

-- ---------- Aufraeumen nach 180 Tagen ----------
reset role;
insert into privat.fruehstart_anfragen (name, email, erstellt_am)
values ('Alt', 'alt@example.de', now() - interval '181 days');
-- Eigene Anweisung: Im selben SELECT saehe die Pruefung noch den Stand vor dem Loeschen.
insert into werte select 'geloescht', privat.fruehstart_anfragen_aufraeumen()::text;
insert into ergebnis
select 23, 'Aufraeumen loescht Anfragen aelter als 180 Tage', '1 geloescht, neue bleiben',
       (select v from werte where k = 'geloescht') || ' geloescht',
       (select v from werte where k = 'geloescht') = '1'
       and not exists (select 1 from privat.fruehstart_anfragen where email = 'alt@example.de')
       and exists (select 1 from privat.fruehstart_anfragen where email = 'max.muster@example.de');

insert into ergebnis
select 24, 'Nachts eingeplant', '27 3 * * *', coalesce(min(schedule), '—'), min(schedule) = '27 3 * * *'
  from cron.job where jobname = 'fruehstart-anfragen-aufraeumen';

select nr, pruefung, erwartet, tatsaechlich, bestanden from ergebnis order by nr;

rollback;
