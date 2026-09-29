-- Vorsorge-Check: feste Loeschfrist.
--
-- WARUM. Eingereichte Angaben blieben bisher liegen, bis der Berater sie
-- loescht — also womoeglich fuer immer. Darunter koennen besondere
-- Kategorien nach Art. 9 DSGVO sein (Kirchensteuer, PKV-Zuschlag). Die
-- Einwilligung im Check und die Datenschutzerklaerung nennen deshalb eine
-- Hoechstdauer: 90 Tage ab Eingang. Diese Migration setzt sie durch.
--
-- WAS GELOESCHT WIRD, taeglich um 03:17 Uhr (UTC):
--   1. Anfragen, deren Eingang aelter als 90 Tage ist — der Eingang geht per
--      `on delete cascade` mit.
--   2. Abgelaufene Anfragen ohne Eingang. Das erledigt bisher die Oberflaeche
--      beim Laden der Liste; hier geschieht es auch dann, wenn der Berater
--      die Karte nie wieder oeffnet.

create extension if not exists pg_cron;

-- Im nicht veroeffentlichten Schema `privat` (siehe check_benachrichtigung):
-- nicht als /rest/v1/rpc/… aufrufbar.
create or replace function privat.check_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  geloescht integer := 0;
  n integer;
begin
  delete from public.check_anfragen a
   where exists (
     select 1 from public.check_eingaenge e
      where e.code = a.code
        and e.eingegangen_am < now() - interval '90 days'
   );
  get diagnostics n = row_count;
  geloescht := geloescht + n;

  delete from public.check_anfragen a
   where a.gueltig_bis < now()
     and not exists (select 1 from public.check_eingaenge e where e.code = a.code);
  get diagnostics n = row_count;
  geloescht := geloescht + n;

  return geloescht;
end;
$$;

revoke all on function privat.check_aufraeumen() from public, anon, authenticated;

-- Benannter Job: ein erneutes Einspielen ersetzt ihn, statt einen zweiten
-- anzulegen.
select cron.schedule('check-aufraeumen', '17 3 * * *', $$select privat.check_aufraeumen()$$);
