-- Vorsorge-Check: E-Mail an den Berater, sobald ein Kunde einreicht.
--
-- ABLAUF. Ein Trigger auf check_eingaenge ruft nach dem Einfuegen die Edge
-- Function `check-benachrichtigung` auf (asynchron ueber pg_net — erst nach
-- dem Commit, das Einreichen des Kunden wartet also nicht auf den Versand).
-- Die Funktion liest Berater und Kundennamen nach und schickt die Mail ueber
-- das eigene Postfach per SMTP.
--
-- GENAU EINE MAIL JE EINGANG. `benachrichtigt_am` wird von der Funktion
-- atomar gesetzt, bevor sie verschickt. Das ist zugleich ihr Schutz: Sie ist
-- ohne Anmeldung erreichbar (pg_net sendet keinen Schluessel mit, und ein
-- Geheimnis im Klartext gehoert nicht in eine Migration). Wer sie von aussen
-- aufruft, braucht die UUID eines echten Eingangs — die niemand lesen kann —
-- und loest auch dann nur die Mail aus, die ohnehin verschickt wird.

create extension if not exists pg_net with schema extensions;

alter table public.check_eingaenge
  add column if not exists benachrichtigt_am timestamptz;

comment on column public.check_eingaenge.benachrichtigt_am is
  'Wann der Berater per E-Mail benachrichtigt wurde; gesetzt von der Edge Function check-benachrichtigung.';

-- Der Kunde darf beim Einreichen nur Code und Daten setzen — nicht den
-- Zeitstempel, sonst koennte er die Benachrichtigung seines Beraters
-- unterdruecken. Spaltenrechte statt Tabellenrecht.
revoke insert on public.check_eingaenge from anon, authenticated;
grant insert (code, daten) on public.check_eingaenge to anon, authenticated;

-- Eigenes Schema, das die Data API NICHT veroeffentlicht: Die Trigger-
-- Funktion soll nicht als /rest/v1/rpc/… aufrufbar sein.
create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;

-- SECURITY DEFINER, weil der Kunde (anon) kein Recht auf das Schema `net`
-- hat und haben soll. Die Funktion tut nichts ausser diesem einen Aufruf.
create or replace function privat.check_eingang_melden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/check-benachrichtigung',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('eingang', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function privat.check_eingang_melden() from public, anon, authenticated;

drop trigger if exists check_eingang_melden on public.check_eingaenge;
create trigger check_eingang_melden
  after insert on public.check_eingaenge
  for each row execute function privat.check_eingang_melden();
