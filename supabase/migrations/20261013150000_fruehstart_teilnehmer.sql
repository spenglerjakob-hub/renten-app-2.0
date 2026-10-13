-- Early Adopter, Nachtrag: Beginn der Teilnahme und die Teilnehmerliste.
--
-- `mein_zugang()` nennt zusaetzlich `fruehstart_seit` — die Oberflaeche bittet
-- erst vier Wochen nach dem Einloesen um die erste Rueckmeldung, nicht schon
-- am ersten Tag. Sonst unveraendert.
--
-- `fruehstart_teilnehmer()` zeigt dem Betreiber, wer dabei ist, bis wann und
-- wie viele Rueckmeldungen kamen — damit er nachfassen kann, wenn jemand
-- schweigt. Nur fuer den Betreiber; alle anderen bekommen eine leere Liste.

create or replace function public.mein_zugang()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nutzer    uuid := auth.uid();
  v_e         privat.einstellungen%rowtype;
  v_erstellt  timestamptz;
  v_frei      text;
  v_m         record;
  v_rang      bigint;
  v_belegt    integer;
  v_vorab     boolean;
  v_test_bis  timestamptz;
  v_fs_seit   timestamptz;
  v_fs_monate integer;
  v_fs_bis    timestamptz;
  v_paket     text;
  v_quelle    text;
  v_bis       timestamptz;
begin
  if v_nutzer is null then
    return null;
  end if;

  select * into v_e from privat.einstellungen where id;
  select u.created_at into v_erstellt from auth.users u where u.id = v_nutzer;
  select f.grund into v_frei from privat.freizugaenge f where f.nutzer = v_nutzer;
  select f.seit, f.monate into v_fs_seit, v_fs_monate from privat.fruehstarter f where f.nutzer = v_nutzer;

  select m.buero, m.rolle, b.name, a.paket, a.intervall, a.plaetze, a.status,
         a.laeuft_bis, a.kuendigung_zum
    into v_m
    from privat.buero_mitglieder m
    join privat.bueros b on b.id = m.buero
    left join privat.abos a on a.buero = m.buero
   where m.nutzer = v_nutzer;

  if v_m.buero is not null then
    select count(*) into v_belegt from privat.buero_mitglieder m where m.buero = v_m.buero;
    select r.rang into v_rang
      from (select m.nutzer,
                   row_number() over (order by (m.rolle = 'inhaber') desc, m.seit, m.nutzer) as rang
              from privat.buero_mitglieder m
             where m.buero = v_m.buero) r
     where r.nutzer = v_nutzer;
  end if;

  v_vorab := v_e.abo_pflicht_ab is null or now() < v_e.abo_pflicht_ab;
  if v_e.abo_pflicht_ab is not null then
    v_test_bis := greatest(v_erstellt, v_e.abo_pflicht_ab) + make_interval(days => v_e.testtage);
    if v_fs_seit is not null then
      v_fs_bis := greatest(v_fs_seit, v_e.abo_pflicht_ab) + make_interval(months => v_fs_monate);
    end if;
  end if;

  if v_vorab then
    v_paket := 'alles'; v_quelle := 'vorab';
  elsif v_frei is not null then
    v_paket := 'alles'; v_quelle := 'frei';
  elsif now() < v_fs_bis then
    v_paket := 'alles'; v_quelle := 'fruehstart'; v_bis := v_fs_bis;
  elsif v_m.paket is not null and privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze then
    v_paket := v_m.paket; v_quelle := 'abo'; v_bis := coalesce(v_m.kuendigung_zum, v_m.laeuft_bis);
  elsif now() < v_test_bis then
    v_paket := 'alles'; v_quelle := 'test'; v_bis := v_test_bis;
  end if;

  return jsonb_build_object(
    'paket',               v_paket,
    'quelle',              v_quelle,
    'bis',                 v_bis,
    'test_bis',            v_test_bis,
    'abo_pflicht_ab',      v_e.abo_pflicht_ab,
    'zahlung_bereit',      coalesce(v_e.zahlung_bereit, false),
    'freizugang',          v_frei,
    'betreiber',           coalesce(v_frei = 'betreiber', false),
    'fruehstart',          v_fs_seit is not null,
    'fruehstart_seit',     v_fs_seit,
    'fruehstart_bis',      v_fs_bis,
    'letzte_rueckmeldung', (select max(r.erstellt_am) from privat.rueckmeldungen r where r.nutzer = v_nutzer),
    'buero',               v_m.buero,
    'buero_name',          v_m.name,
    'rolle',               v_m.rolle,
    'hat_platz',           coalesce(privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze, false),
    'abo', case when v_m.paket is null then null else jsonb_build_object(
      'paket',          v_m.paket,
      'intervall',      v_m.intervall,
      'plaetze',        v_m.plaetze,
      'belegt',         v_belegt,
      'status',         v_m.status,
      'laeuft_bis',     v_m.laeuft_bis,
      'kuendigung_zum', v_m.kuendigung_zum
    ) end
  );
end;
$$;

-- Wer dabei ist: Notiz des Links, seit wann, kostenlos bis (null: Start noch
-- offen), Zahl und Zeitpunkt der letzten Rueckmeldung.
create or replace function public.fruehstart_teilnehmer()
returns table (email text, notiz text, seit timestamptz, monate integer, bis timestamptz,
               rueckmeldungen integer, letzte_rueckmeldung timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text,
         coalesce(l.notiz, ''),
         f.seit,
         f.monate,
         case when e.abo_pflicht_ab is null then null
              else greatest(f.seit, e.abo_pflicht_ab) + make_interval(months => f.monate) end,
         (select count(*)::integer from privat.rueckmeldungen r where r.nutzer = f.nutzer),
         (select max(r.erstellt_am) from privat.rueckmeldungen r where r.nutzer = f.nutzer)
    from privat.fruehstarter f
    join auth.users u on u.id = f.nutzer
    left join privat.fruehstart_links l on l.token = f.link
   cross join (select s.abo_pflicht_ab from privat.einstellungen s where s.id) e
   where privat.ist_betreiber()
   order by f.seit desc
   limit 500;
$$;

revoke all on function public.mein_zugang()           from public, anon;
revoke all on function public.fruehstart_teilnehmer() from public, anon;
grant execute on function public.mein_zugang()           to authenticated;
grant execute on function public.fruehstart_teilnehmer() to authenticated;
