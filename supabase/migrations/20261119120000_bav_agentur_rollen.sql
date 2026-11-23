-- Agenturen: Adminrechte und der Auftritt der Agentur.
--
-- WOZU. Die Agentur soll sich selbst einrichten koennen. Bisher fuehrt allein
-- die bAV-Verwaltung ihre Daten; die Zugaenge der Agentur lesen sie nur.
-- Neu:
--   * ROLLEN. Ein Zugang einer Agentur ist `mitglied` oder `admin`. Admins
--     sehen die Uebersicht ihrer Agentur und aendern deren Angaben und
--     Auftritt. Die Rolle vergibt die Verwaltung — schon mit dem
--     Einladungslink oder spaeter in der Liste der Zugaenge.
--   * AUFTRITT. Die Agentur bekommt ein eigenes Logo (Spalte `logo`, Datei im
--     Bucket bav-firmenlogos); Akzentfarbe, Internetadresse und Zusatzzeile
--     stehen in `daten`. Sie gelten auf den Unterlagen aller Firmenkunden der
--     Agentur.
--   * WER DABEI IST. Die Liste der Zugaenge nennt Rolle und Namen — den Namen
--     traegt jeder Zugang beim ersten Aufruf der Mitarbeiterberatung selbst
--     ein (`berater_profil`, wie „Ihr Auftritt“).
--
-- WAS ADMINS NICHT DUERFEN: Agenturen anlegen oder loeschen, Einladungen
-- erstellen, Zugaenge entfernen, Rollen vergeben. Das bleibt bei der
-- Verwaltung.
--
-- Baut auf 20261118120000_bav_agenturen auf und laesst sich wiederholt
-- einspielen. ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank.
-- Wer bisher Mitglied war, bleibt Mitglied; `mein_zugang()` bekommt ein
-- zusaetzliches Feld; die Funktionen behalten ihre Namen, und ein Aufruf ohne
-- Rolle erstellt wie bisher eine Einladung fuer ein Mitglied.

-- ---------------------------------------------------------------------------
-- Rollen: an den Zugaengen und an den Einladungen
-- ---------------------------------------------------------------------------
alter table privat.bav_agentur_mitglieder
  add column if not exists rolle text not null default 'mitglied';
alter table privat.bav_agentur_mitglieder drop constraint if exists bav_agentur_mitglieder_rolle;
alter table privat.bav_agentur_mitglieder
  add constraint bav_agentur_mitglieder_rolle check (rolle in ('mitglied', 'admin'));

alter table privat.bav_agentur_einladungen
  add column if not exists rolle text not null default 'mitglied';
alter table privat.bav_agentur_einladungen drop constraint if exists bav_agentur_einladungen_rolle;
alter table privat.bav_agentur_einladungen
  add constraint bav_agentur_einladungen_rolle check (rolle in ('mitglied', 'admin'));

-- Die Agentur, deren Admin das Konto ist — sonst null. Fuer die Policies:
-- `privat` ist fuer authenticated nicht lesbar; die Funktion liefert nur die
-- eigene Zugehoerigkeit (wie bav_meine_agentur).
create or replace function public.bav_agentur_admin()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.agentur
    from privat.bav_agentur_mitglieder m
   where m.nutzer = auth.uid() and m.rolle = 'admin';
$$;

revoke all on function public.bav_agentur_admin() from public, anon;
grant execute on function public.bav_agentur_admin() to authenticated;

-- Aendern: die Verwaltung jede Agentur, ein Admin die eigene. Anlegen und
-- Loeschen bleiben bei der Verwaltung (Policies aus 20261118120000).
drop policy if exists "agenturen aendern" on public.bav_agenturen;
create policy "agenturen aendern" on public.bav_agenturen
  for update to authenticated
  using ((select public.bav_ist_verwalter()) or id = (select public.bav_agentur_admin()))
  with check ((select public.bav_ist_verwalter()) or id = (select public.bav_agentur_admin()));

-- ---------------------------------------------------------------------------
-- Das Logo der Agentur
--
-- Der Pfad nennt die Agentur: <wer es hochgeladen hat>/agentur-<Agentur>-<24
-- hex>.png|webp. Die Regel an der Spalte bindet ihn an genau diese Agentur —
-- sonst liesse sich `logo` auf eine fremde Datei richten, die dann jeder
-- Zugang der Agentur lesen duerfte.
-- ---------------------------------------------------------------------------
alter table public.bav_agenturen add column if not exists logo text;

comment on column public.bav_agenturen.logo is
  'Logo der Agentur: Pfad im privaten Bucket bav-firmenlogos, oder null.';

alter table public.bav_agenturen drop constraint if exists agentur_logo_dieser_agentur;
alter table public.bav_agenturen add constraint agentur_logo_dieser_agentur check (
  logo is null
  or logo ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/agentur-' || id::text || '-[0-9a-f]{24}\.(png|webp)$')
);

-- Darf diese Datei hochgeladen werden? In den eigenen Ordner, fuer eine
-- Agentur, die man einrichten darf: die Verwaltung jede, ein Admin die eigene.
-- Hoechstens 1.100 Dateien je Ordner — 500 Agenturen, je ein Logo und eines im
-- Wechsel. CASE statt AND: Die ID wird erst umgewandelt, wenn das Muster passt.
create or replace function public.bav_agentur_logo_pfad_erlaubt(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when coalesce(p_name ~ ('^' || (select auth.uid())::text
                    || '/agentur-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{24}\.(png|webp)$'),
                  false)
    then exists (select 1 from public.bav_agenturen a
                  where a.id = substr(split_part(p_name, '/', 2), 9, 36)::uuid
                    and ((select public.bav_ist_verwalter()) or a.id = (select public.bav_agentur_admin())))
         and (select count(*)
                from storage.objects o
               where o.bucket_id = 'bav-firmenlogos'
                 and o.name like (select auth.uid())::text || '/agentur-%') < 1100
    else false
  end;
$$;

revoke all on function public.bav_agentur_logo_pfad_erlaubt(text) from public, anon;
grant execute on function public.bav_agentur_logo_pfad_erlaubt(text) to authenticated;

drop policy if exists "agenturlogo hochladen" on storage.objects;
create policy "agenturlogo hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bav-firmenlogos' and public.bav_agentur_logo_pfad_erlaubt(name));

-- Lesen darf, wer die Agentur sieht: die Verwaltung und ihre Zugaenge.
-- Aufraeumen im eigenen Ordner regeln die Policies der Firmenlogos
-- (20261021120000) — sie gelten fuer den ganzen Ordner.
drop policy if exists "agenturlogo der agentur lesen" on storage.objects;
create policy "agenturlogo der agentur lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bav-firmenlogos'
    and exists (select 1 from public.bav_agenturen a where a.logo = objects.name)
  );

-- Firmenlogos: wie in 20261118120000 — nur zaehlen die Logos der Agenturen
-- nicht mehr mit. Die Verwaltung braucht beide Kontingente.
create or replace function public.bav_logo_pfad_erlaubt(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when coalesce(p_name ~ ('^' || (select auth.uid())::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{24}\.(png|webp)$'),
                  false)
    then exists (select 1 from public.bav_firmen f
                  where f.id = left(split_part(p_name, '/', 2), 36)::uuid
                    and (f.besitzer = (select auth.uid())
                         or (f.agentur is not null
                             and ((select public.bav_ist_verwalter())
                                  or f.agentur = (select public.bav_meine_agentur())))))
         and (select count(*)
                from storage.objects o
               where o.bucket_id = 'bav-firmenlogos'
                 and o.name like (select auth.uid())::text || '/%'
                 and o.name not like (select auth.uid())::text || '/agentur-%') < 400
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Der Zugang — wie bisher, dazu die Rolle in der Agentur
-- ---------------------------------------------------------------------------
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
  v_abo       boolean;
  v_agentur   uuid;
  v_agentur_n text;
  v_agentur_r text;
  v_verwalter boolean;
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

  select am.agentur, ag.name, am.rolle into v_agentur, v_agentur_n, v_agentur_r
    from privat.bav_agentur_mitglieder am
    join public.bav_agenturen ag on ag.id = am.agentur
   where am.nutzer = v_nutzer;
  v_verwalter := coalesce(v_frei = 'betreiber', false)
                 or exists (select 1 from privat.bav_verwalter v where v.nutzer = v_nutzer);

  v_vorab := v_e.abo_pflicht_ab is null or now() < v_e.abo_pflicht_ab;
  if v_e.abo_pflicht_ab is not null then
    v_test_bis := greatest(v_erstellt, v_e.abo_pflicht_ab) + make_interval(days => v_e.testtage);
    if v_fs_seit is not null then
      v_fs_bis := greatest(v_fs_seit, v_e.abo_pflicht_ab) + make_interval(months => v_fs_monate);
    end if;
  end if;

  v_abo := coalesce(v_m.paket is not null and privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze, false);

  if v_vorab then
    v_paket := 'alles'; v_quelle := 'vorab';
  elsif v_frei is not null then
    v_paket := 'alles'; v_quelle := 'frei';
  elsif now() < v_fs_bis then
    v_paket := 'alles'; v_quelle := 'fruehstart'; v_bis := v_fs_bis;
  elsif v_abo then
    v_paket := v_m.paket; v_quelle := 'abo'; v_bis := coalesce(v_m.kuendigung_zum, v_m.laeuft_bis);
  elsif now() < v_test_bis then
    v_paket := 'alles'; v_quelle := 'test'; v_bis := v_test_bis;
  end if;

  -- Der Zugang einer Agentur umfasst die Vorsorgemodelle und die
  -- Mitarbeiterberatung — nicht mehr, auch nicht vor dem Start, in der
  -- Testphase oder im Fruehstart. Mehr gibt nur ein Freizugang oder ein
  -- eigenes Abo (dann mindestens mit den Arbeitgeber-Seiten).
  if v_agentur is not null and v_frei is null then
    if v_abo then
      v_paket := case when v_m.paket = 'rente' then 'alles' else v_m.paket end;
      v_quelle := 'abo'; v_bis := coalesce(v_m.kuendigung_zum, v_m.laeuft_bis);
    else
      v_paket := 'ag'; v_quelle := 'agentur'; v_bis := null;
    end if;
  elsif v_verwalter and v_paket is null then
    v_paket := 'ag'; v_quelle := 'verwaltung';
  elsif v_verwalter and v_paket = 'rente' then
    v_paket := 'alles';
  end if;

  return jsonb_build_object(
    'paket',               v_paket,
    'quelle',              v_quelle,
    'bis',                 v_bis,
    'test_bis',            v_test_bis,
    'abo_pflicht_ab',      v_e.abo_pflicht_ab,
    'zahlung_bereit',      coalesce(v_e.zahlung_bereit and (not v_e.zahlung_nur_betreiber or v_frei = 'betreiber'), false),
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
    'agentur',             v_agentur,
    'agentur_name',        v_agentur_n,
    'agentur_rolle',       v_agentur_r,
    'verwalter',           v_verwalter,
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

-- ---------------------------------------------------------------------------
-- Einladungen: mit Rolle. Die alte Fassung (ohne Rolle) weicht — ein Aufruf
-- nur mit der Agentur trifft die neue und laedt wie bisher ein Mitglied ein.
-- ---------------------------------------------------------------------------
drop function if exists public.bav_agentur_einladung_erstellen(uuid);

create or replace function public.bav_agentur_einladung_erstellen(p_agentur uuid, p_rolle text default 'mitglied')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not public.bav_ist_verwalter()
     or coalesce(p_rolle, '') not in ('mitglied', 'admin')
     or not exists (select 1 from public.bav_agenturen a where a.id = p_agentur) then
    return null;
  end if;
  if (select count(*) from privat.bav_agentur_einladungen e
       where e.agentur = p_agentur and e.angenommen_von is null and e.gueltig_bis > now()) >= 20 then
    raise exception 'Es sind hoechstens 20 offene Einladungen je Agentur moeglich.'
      using errcode = 'check_violation';
  end if;
  insert into privat.bav_agentur_einladungen (agentur, erstellt_von, rolle)
  values (p_agentur, auth.uid(), p_rolle)
  returning token into v_token;
  return v_token;
end;
$$;

-- Die offenen Einladungen einer Agentur — jetzt mit der Rolle (neue Spalte:
-- deshalb erst weg, dann neu).
drop function if exists public.bav_agentur_einladungen(uuid);

create function public.bav_agentur_einladungen(p_agentur uuid)
returns table (token uuid, erstellt_am timestamptz, gueltig_bis timestamptz, rolle text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.token, e.erstellt_am, e.gueltig_bis, e.rolle
    from privat.bav_agentur_einladungen e
   where e.agentur = p_agentur
     and e.angenommen_von is null
     and e.gueltig_bis > now()
     and public.bav_ist_verwalter()
   order by e.erstellt_am;
$$;

-- Einloesen: Der Zugang bekommt die Rolle der Einladung.
-- ok | ungueltig | abgelaufen | eingeloest | andere_agentur | verwaltung
create or replace function public.bav_agentur_einladung_annehmen(p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nutzer uuid := auth.uid();
  v_e      privat.bav_agentur_einladungen%rowtype;
  v_schon  uuid;
begin
  if v_nutzer is null then
    return 'ungueltig';
  end if;
  select * into v_e from privat.bav_agentur_einladungen e where e.token = p_token for update;
  if not found then
    return 'ungueltig';
  end if;
  select m.agentur into v_schon from privat.bav_agentur_mitglieder m where m.nutzer = v_nutzer;
  if v_schon = v_e.agentur then
    return 'ok';
  end if;
  if v_e.angenommen_von is not null then
    return 'eingeloest';
  end if;
  if v_e.gueltig_bis <= now() then
    return 'abgelaufen';
  end if;
  if v_schon is not null then
    return 'andere_agentur';
  end if;
  if public.bav_ist_verwalter() then
    return 'verwaltung';
  end if;
  insert into privat.bav_agentur_mitglieder (agentur, nutzer, rolle) values (v_e.agentur, v_nutzer, v_e.rolle);
  update privat.bav_agentur_einladungen e
     set angenommen_von = v_nutzer, angenommen_am = now()
   where e.token = p_token;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Die Zugaenge einer Agentur — fuer die Verwaltung und die Admins der
-- Agentur: mit Rolle und dem Namen, den der Zugang als Berater eingetragen
-- hat. Einfache Mitglieder bekommen die Liste nicht mehr; angezeigt wurde sie
-- ihnen nie.
-- ---------------------------------------------------------------------------
drop function if exists public.bav_agentur_mitglieder(uuid);

create function public.bav_agentur_mitglieder(p_agentur uuid)
returns table (nutzer uuid, email text, seit timestamptz, rolle text, name text, ich boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.nutzer, u.email::text, m.seit, m.rolle,
         coalesce(nullif(btrim(p.berater), ''), '') as name,
         m.nutzer = auth.uid() as ich
    from privat.bav_agentur_mitglieder m
    join auth.users u on u.id = m.nutzer
    left join public.berater_profil p on p.besitzer = m.nutzer
   where m.agentur = p_agentur
     and (public.bav_ist_verwalter() or p_agentur = public.bav_agentur_admin())
   order by (m.rolle = 'admin') desc, m.seit, u.email;
$$;

-- Adminrechte geben oder nehmen — nur die Verwaltung.
create or replace function public.bav_agentur_rolle_setzen(p_nutzer uuid, p_rolle text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.bav_ist_verwalter() or coalesce(p_rolle, '') not in ('mitglied', 'admin') then
    return false;
  end if;
  update privat.bav_agentur_mitglieder m set rolle = p_rolle where m.nutzer = p_nutzer;
  return found;
end;
$$;

revoke all on function public.bav_agentur_einladung_erstellen(uuid, text) from public, anon;
revoke all on function public.bav_agentur_einladungen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladung_annehmen(uuid) from public, anon;
revoke all on function public.bav_agentur_mitglieder(uuid) from public, anon;
revoke all on function public.bav_agentur_rolle_setzen(uuid, text) from public, anon;
grant execute on function public.bav_agentur_einladung_erstellen(uuid, text) to authenticated;
grant execute on function public.bav_agentur_einladungen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladung_annehmen(uuid) to authenticated;
grant execute on function public.bav_agentur_mitglieder(uuid) to authenticated;
grant execute on function public.bav_agentur_rolle_setzen(uuid, text) to authenticated;
