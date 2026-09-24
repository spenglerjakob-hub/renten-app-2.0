-- Nachweis der E-Mail-Benachrichtigung (Migration check_benachrichtigung).
--
-- Laeuft in EINEM Block, der am Ende absichtlich mit einem Fehler abbricht:
-- Die Datenbank rollt dadurch alles zurueck — Testkonto, Anfrage, Eingang
-- und den Aufruf in der pg_net-Warteschlange. Die Fehlermeldung enthaelt das
-- Ergebnis. Ausfuehren im SQL-Editor des Projekts.
--
-- Erwartung: jede Zeile beginnt mit OK.

do $$
declare
  ergebnis text := ''; neu uuid; eintrag text; vorher bigint; nachher bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
    ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now());
  insert into public.check_anfragen (code, berater, kunde) values
    ('c0de0000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Familie Muster'),
    ('c0de0000-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','Zweiter');
  select count(*) into vorher from net.http_request_queue;

  -- 1) Einreichen legt genau einen Aufruf der Edge Function an
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  insert into public.check_eingaenge (code, daten) values ('c0de0000-0000-4000-8000-000000000001', '{"schemaVersion":1}');
  perform set_config('role', 'postgres', true);
  select count(*) into nachher from net.http_request_queue;
  select id into neu from public.check_eingaenge where code = 'c0de0000-0000-4000-8000-000000000001';
  select url || ' ' || convert_from(body, 'utf8') into eintrag from net.http_request_queue order by id desc limit 1;
  ergebnis := ergebnis || E'\n' || case when nachher = vorher + 1
      and eintrag like '%/functions/v1/check-benachrichtigung%' and eintrag like '%' || neu::text || '%'
    then 'OK' else 'FEHLER' end || ' 1 Einreichen ruft die Funktion mit der Kennung des Eingangs auf';

  -- 2) Der Kunde kann den Zeitstempel nicht selbst setzen (und so die Mail unterdruecken)
  perform set_config('role', 'anon', true);
  begin
    insert into public.check_eingaenge (code, daten, benachrichtigt_am)
      values ('c0de0000-0000-4000-8000-000000000003', '{"schemaVersion":1}', now());
    ergebnis := ergebnis || E'\nFEHLER 2 Kunde konnte benachrichtigt_am setzen';
  exception when insufficient_privilege then
    ergebnis := ergebnis || E'\nOK 2 Kunde kann benachrichtigt_am nicht setzen';
  end;

  -- 3) Die Trigger-Funktion ist fuer den Kunden nicht aufrufbar
  begin
    perform privat.check_eingang_melden();
    ergebnis := ergebnis || E'\nFEHLER 3 privat-Schema erreichbar';
  exception when insufficient_privilege then
    ergebnis := ergebnis || E'\nOK 3 privat-Schema fuer den Kunden gesperrt';
  end;

  perform set_config('role', 'postgres', true);
  raise exception E'NACHWEIS (zurueckgerollt):%', ergebnis;
end $$;
