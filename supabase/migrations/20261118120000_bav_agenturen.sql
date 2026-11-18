-- bAV-Verwaltung: Agenturen mit ihren Firmenkunden.
--
-- WOZU. Agenturen haben Firmenkunden, deren bAV der Betreiber verwaltet. Ein
-- Mitarbeiter des Betreibers (die bAV-VERWALTUNG) fuehrt die Agenturen, legt
-- in ihnen Firmen an und sieht alles, was dort beraten wird. Jede AGENTUR
-- bekommt einen eigenen Zugang — ueber einen Einladungslink —, der nur die
-- Vorsorgemodelle und die bAV-Mitarbeiterberatung umfasst.
--
-- WER IST WAS.
--   * Verwaltung: Konten in privat.bav_verwalter (der Betreiber benennt sie)
--     und der Betreiber selbst. Jedes dieser Konten sieht ALLE Agenturen.
--   * Agentur: eine Zeile in public.bav_agenturen (Name und Daten, mit denen
--     neue Firmen vorbelegt werden).
--   * Mitglied einer Agentur: ein Konto in privat.bav_agentur_mitglieder —
--     hoechstens eine Agentur je Konto.
--   * Eine Firma gehoert zu einer Agentur ueber bav_firmen.agentur (oder zu
--     keiner, wie bisher).
--
-- WER SIEHT UND DARF WAS. Eine Firma einer Agentur sehen und aendern die
-- Verwaltung und die Mitglieder dieser Agentur — samt Beratungen, Unterlagen
-- und Unterschriften (die folgen wie bisher der sichtbaren Firma). Loeschen
-- darf eine Firma, wer sie angelegt hat, und die Verwaltung. Agenturen selbst
-- legt nur die Verwaltung an; Mitglieder lesen die Daten ihrer Agentur.
--
-- ZUGANG. Ein Mitglied einer Agentur hat das Paket `ag` — ohne Abo, und auch
-- vor dem Start der Abo-Pflicht nur dieses (ausser mit Freizugang oder
-- eigenem Abo). Die Verwaltung hat mindestens `ag`.
--
-- AUSSCHEIDEN. Wird ein Mitglied entfernt oder loescht es sein Konto, gehen
-- seine Firmen in der Agentur samt Beratungen an die Verwaltung (wer es
-- entfernt, sonst wer die Agentur angelegt hat, sonst ein anderes Konto der
-- Verwaltung). Ebenso, wenn ein Konto der Verwaltung geht. Eine Agentur laesst
-- sich erst loeschen, wenn sie keine Firmen mehr hat.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Ohne
-- Agentur und ohne Verwaltung sieht und darf jeder genau, was er bisher sah
-- und durfte; `mein_zugang()` bekommt nur zusaetzliche Felder.

-- ---------------------------------------------------------------------------
-- Verwaltung, Agenturen, Mitglieder, Einladungen
-- ---------------------------------------------------------------------------
create table if not exists privat.bav_verwalter (
  nutzer      uuid primary key references auth.users (id) on delete cascade,
  benannt_von uuid references auth.users (id) on delete set null,
  seit        timestamptz not null default now()
);

create table if not exists public.bav_agenturen (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  -- Ansprechpartner, Organisationsnummer, Kontakt, Vorgaben — siehe bav-agentur.ts.
  daten        jsonb not null default '{}'::jsonb,
  erstellt_von uuid default auth.uid() references auth.users (id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint agentur_daten_objekt  check (jsonb_typeof(daten) = 'object'),
  constraint agentur_daten_groesse check (pg_column_size(daten) < 16384)
);

comment on table public.bav_agenturen is
  'bAV-Verwaltung: Agenturen, deren Firmenkunden der Betreiber verwaltet. Anlegen und aendern nur die Verwaltung; Mitglieder lesen ihre Agentur.';

create table if not exists privat.bav_agentur_mitglieder (
  agentur uuid not null references public.bav_agenturen (id) on delete cascade,
  -- Ein Konto gehoert hoechstens einer Agentur an.
  nutzer  uuid not null unique references auth.users (id) on delete cascade,
  seit    timestamptz not null default now(),
  primary key (agentur, nutzer)
);

-- Ein Link je Einladung, einmal einloesbar, vierzehn Tage gueltig.
create table if not exists privat.bav_agentur_einladungen (
  token          uuid primary key default gen_random_uuid(),
  agentur        uuid not null references public.bav_agenturen (id) on delete cascade,
  erstellt_von   uuid references auth.users (id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '14 days',
  angenommen_von uuid references auth.users (id) on delete set null,
  angenommen_am  timestamptz
);
create index if not exists bav_agentur_einladungen_agentur_idx on privat.bav_agentur_einladungen (agentur);

alter table privat.bav_verwalter           enable row level security;
alter table privat.bav_agentur_mitglieder  enable row level security;
alter table privat.bav_agentur_einladungen enable row level security;
revoke all on privat.bav_verwalter, privat.bav_agentur_mitglieder, privat.bav_agentur_einladungen
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fuer die Policies: Gehoert das Konto zur Verwaltung? Zu welcher Agentur?
-- `privat` ist fuer authenticated nicht lesbar; die Funktionen liefern nur
-- die eigene Zugehoerigkeit (wie bav_mein_buero).
-- ---------------------------------------------------------------------------
create or replace function public.bav_ist_verwalter()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privat.bav_verwalter v where v.nutzer = auth.uid())
      or exists (select 1 from privat.freizugaenge f where f.nutzer = auth.uid() and f.grund = 'betreiber');
$$;

create or replace function public.bav_meine_agentur()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.agentur from privat.bav_agentur_mitglieder m where m.nutzer = auth.uid();
$$;

revoke all on function public.bav_ist_verwalter() from public, anon;
revoke all on function public.bav_meine_agentur() from public, anon;
grant execute on function public.bav_ist_verwalter() to authenticated;
grant execute on function public.bav_meine_agentur() to authenticated;

-- ---------------------------------------------------------------------------
-- Agenturen: Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bav_agenturen enable row level security;
alter table public.bav_agenturen force row level security;

revoke all on public.bav_agenturen from anon, authenticated;
grant select, insert, update, delete on public.bav_agenturen to authenticated;

drop policy if exists "agenturen lesen"    on public.bav_agenturen;
drop policy if exists "agenturen anlegen"  on public.bav_agenturen;
drop policy if exists "agenturen aendern"  on public.bav_agenturen;
drop policy if exists "agenturen loeschen" on public.bav_agenturen;

create policy "agenturen lesen" on public.bav_agenturen
  for select to authenticated
  using ((select public.bav_ist_verwalter()) or id = (select public.bav_meine_agentur()));

create policy "agenturen anlegen" on public.bav_agenturen
  for insert to authenticated
  with check ((select public.bav_ist_verwalter()) and erstellt_von = (select auth.uid()));

create policy "agenturen aendern" on public.bav_agenturen
  for update to authenticated
  using ((select public.bav_ist_verwalter()))
  with check ((select public.bav_ist_verwalter()));

create policy "agenturen loeschen" on public.bav_agenturen
  for delete to authenticated
  using ((select public.bav_ist_verwalter()));

-- geaendert_am fortschreiben; wer sie angelegt hat, bleibt stehen.
create or replace function public.bav_agentur_geaendert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am := now();
  if current_user in ('authenticated', 'anon') then
    new.erstellt_von := old.erstellt_von;
    new.erstellt_am := old.erstellt_am;
  end if;
  return new;
end;
$$;

drop trigger if exists bav_agenturen_geaendert_am on public.bav_agenturen;
create trigger bav_agenturen_geaendert_am
  before update on public.bav_agenturen
  for each row execute function public.bav_agentur_geaendert_am();

-- Gegen Missbrauch als Ablage: hoechstens 500 Agenturen.
create or replace function public.bav_agenturen_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.bav_agenturen) >= 500 then
    raise exception 'Es sind hoechstens 500 Agenturen moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists bav_agenturen_anzahl on public.bav_agenturen;
create trigger bav_agenturen_anzahl
  before insert on public.bav_agenturen
  for each row execute function public.bav_agenturen_anzahl_pruefen();

-- ---------------------------------------------------------------------------
-- Firmen: die Agentur, zu der eine Firma gehoert — oder null (wie bisher).
-- RESTRICT: Eine Agentur mit Firmen laesst sich nicht loeschen.
-- ---------------------------------------------------------------------------
alter table public.bav_firmen
  add column if not exists agentur uuid references public.bav_agenturen (id) on delete restrict;

comment on column public.bav_firmen.agentur is
  'Die Agentur, zu der die Firma gehoert (Verwaltung und Mitglieder der Agentur sehen und bearbeiten sie), oder null.';

create index if not exists bav_firmen_agentur_idx on public.bav_firmen (agentur) where agentur is not null;

-- Lesen: wie bisher der Besitzer und das Buero — dazu Verwaltung und Agentur.
drop policy if exists "firmen lesen" on public.bav_firmen;
create policy "firmen lesen" on public.bav_firmen
  for select to authenticated
  using (
    (select auth.uid()) = besitzer
    or (buero is not null and buero = (select public.bav_mein_buero()))
    or (agentur is not null
        and ((select public.bav_ist_verwalter()) or agentur = (select public.bav_meine_agentur())))
  );

-- Anlegen: als man selbst, nie gleich freigegeben; in eine Agentur nur die
-- Verwaltung (jede) und ein Mitglied (die eigene).
drop policy if exists "eigene firmen anlegen" on public.bav_firmen;
create policy "eigene firmen anlegen" on public.bav_firmen
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and buero is null
    and (agentur is null
         or (select public.bav_ist_verwalter())
         or agentur = (select public.bav_meine_agentur()))
  );

-- Aendern: der Besitzer — und in einer Agentur die Verwaltung und die
-- Mitglieder. Der Besitzer bleibt dabei (Trigger unten).
drop policy if exists "eigene firmen aendern" on public.bav_firmen;
drop policy if exists "firmen aendern" on public.bav_firmen;
create policy "firmen aendern" on public.bav_firmen
  for update to authenticated
  using (
    (select auth.uid()) = besitzer
    or (agentur is not null
        and ((select public.bav_ist_verwalter()) or agentur = (select public.bav_meine_agentur())))
  )
  with check (
    (select auth.uid()) = besitzer
    or (agentur is not null
        and ((select public.bav_ist_verwalter()) or agentur = (select public.bav_meine_agentur())))
  );

-- Loeschen nimmt alle Beratungen mit: der Besitzer und, in einer Agentur, die Verwaltung.
drop policy if exists "eigene firmen loeschen" on public.bav_firmen;
drop policy if exists "firmen loeschen" on public.bav_firmen;
create policy "firmen loeschen" on public.bav_firmen
  for delete to authenticated
  using (
    (select auth.uid()) = besitzer
    or (agentur is not null and (select public.bav_ist_verwalter()))
  );

-- Besitzer und Freigabe bleiben, wie sie sind (wie bisher). Die Agentur einer
-- Firma aendert nur die Verwaltung.
create or replace function public.bav_firma_geaendert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am := now();
  if current_user in ('authenticated', 'anon') then
    new.besitzer := old.besitzer;
    new.buero := old.buero;
    if new.agentur is distinct from old.agentur and not public.bav_ist_verwalter() then
      new.agentur := old.agentur;
    end if;
  end if;
  return new;
end;
$$;

-- Wer zu einer Agentur gehoert, legt seine Firmen in ihr an — auch von den
-- Arbeitgeber-Seiten aus, die von Agenturen nichts wissen.
create or replace function public.bav_firma_agentur_setzen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agentur uuid;
begin
  if current_user in ('authenticated', 'anon') then
    v_agentur := public.bav_meine_agentur();
    if v_agentur is not null then
      new.agentur := v_agentur;
    end if;
  end if;
  return new;
end;
$$;

-- Der Name sortiert vor bav_firmen_anzahl: erst die Agentur, dann die Hoechstzahl.
drop trigger if exists bav_firmen_agentur on public.bav_firmen;
create trigger bav_firmen_agentur
  before insert on public.bav_firmen
  for each row execute function public.bav_firma_agentur_setzen();

-- Hoechstzahlen: ohne Agentur wie bisher 200 je Konto; in einer Agentur 500
-- je Agentur — die Verwaltung legt fuer viele Agenturen an. Gezaehlt wird,
-- was der Anlegende sieht: die eigenen Firmen bzw. die der Agentur.
create or replace function public.bav_firmen_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agentur is not null then
    if (select count(*) from public.bav_firmen where agentur = new.agentur) >= 500 then
      raise exception 'Es sind hoechstens 500 Firmen je Agentur moeglich.'
        using errcode = 'check_violation';
    end if;
  elsif (select count(*) from public.bav_firmen where besitzer = new.besitzer and agentur is null) >= 200 then
    raise exception 'Es sind hoechstens 200 Firmen je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Beratungen loeschen: wer sie angelegt hat, der Besitzer der Firma — und in
-- einer Agentur die Verwaltung.
drop policy if exists "beratungen loeschen" on public.bav_beratungen;
create policy "beratungen loeschen" on public.bav_beratungen
  for delete to authenticated
  using (
    (select auth.uid()) = besitzer
    or exists (select 1 from public.bav_firmen f
                where f.id = bav_beratungen.firma
                  and (f.besitzer = (select auth.uid())
                       or (f.agentur is not null and (select public.bav_ist_verwalter()))))
  );

-- Logo hochladen: in den eigenen Ordner, fuer eine Firma, die man aendern
-- darf — die eigene oder eine der Agentur.
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
                 and o.name like (select auth.uid())::text || '/%') < 400
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Uebergeben, wenn jemand geht — nur fuer die Funktionen und Trigger unten.
-- ---------------------------------------------------------------------------
-- An wen die Firmen einer Agentur gehen: wer sie angelegt hat (wenn er noch
-- zur Verwaltung gehoert), sonst das aelteste Konto der Verwaltung, sonst der
-- Betreiber. Nie an den, der geht.
create or replace function privat.bav_agentur_empfaenger(p_agentur uuid, p_ausser uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x.nutzer
    from (
      select a.erstellt_von as nutzer, 0 as rang, a.erstellt_am as seit
        from public.bav_agenturen a
       where a.id = p_agentur
         and a.erstellt_von is not null
         and (exists (select 1 from privat.bav_verwalter v where v.nutzer = a.erstellt_von)
              or exists (select 1 from privat.freizugaenge f where f.nutzer = a.erstellt_von and f.grund = 'betreiber'))
      union all
      select v.nutzer, 1, v.seit from privat.bav_verwalter v
      union all
      select f.nutzer, 2, f.seit from privat.freizugaenge f where f.grund = 'betreiber'
    ) x
   where x.nutzer is distinct from p_ausser
   order by x.rang, x.seit, x.nutzer
   limit 1;
$$;

revoke all on function privat.bav_agentur_empfaenger(uuid, uuid) from public;

-- Ein Konto gibt ab, was ihm in Agenturen gehoert: seine Firmen gehen an
-- p_an (sonst an den Empfaenger der Agentur), was es in Firmen anderer
-- angelegt oder unterschrieben hat, an deren Besitzer. Gibt es niemanden,
-- bleibt alles, wie es ist.
create or replace function privat.bav_agentur_firmen_abgeben(p_nutzer uuid, p_an uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f  record;
  v_an uuid;
begin
  for v_f in
    select f.id, f.agentur from public.bav_firmen f where f.agentur is not null and f.besitzer = p_nutzer
  loop
    v_an := coalesce(nullif(p_an, p_nutzer), privat.bav_agentur_empfaenger(v_f.agentur, p_nutzer));
    if v_an is not null then
      update public.bav_firmen f set besitzer = v_an where f.id = v_f.id;
      perform privat.bav_uebergeben(v_f.id, p_nutzer);
    end if;
  end loop;
  for v_f in
    select b.firma as id from public.bav_beratungen b
      join public.bav_firmen f on f.id = b.firma
     where b.besitzer = p_nutzer and f.agentur is not null
    union
    select b.firma from public.bav_unterlagen u
      join public.bav_beratungen b on b.id = u.beratung
      join public.bav_firmen f on f.id = b.firma
     where u.besitzer = p_nutzer and f.agentur is not null
    union
    select b.firma from public.bav_unterschriften s
      join public.bav_beratungen b on b.id = s.beratung
      join public.bav_firmen f on f.id = b.firma
     where s.besitzer = p_nutzer and f.agentur is not null
  loop
    perform privat.bav_uebergeben(v_f.id, p_nutzer);
  end loop;
end;
$$;

revoke all on function privat.bav_agentur_firmen_abgeben(uuid, uuid) from public;

-- Die Verwaltung verschiebt eine Firma in eine andere Agentur oder nimmt sie
-- heraus. Wer sie angelegt hat und zu einer ANDEREN Agentur gehoert, saehe
-- sie als Besitzer weiter — mit allen Beratungen. Deshalb geht sie dann an
-- den, der sie verschiebt, und eine Freigabe fuers Buero endet. Was Zugaenge
-- anderer Agenturen in ihr angelegt oder unterschrieben haben, geht an den
-- Besitzer: Sie sehen die Firma danach nicht mehr.
create or replace function privat.bav_firma_agentur_gewechselt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ich    uuid := (select auth.uid());
  v_nutzer uuid;
begin
  if v_ich is not null and new.besitzer <> v_ich
     and exists (select 1 from privat.bav_agentur_mitglieder m
                  where m.nutzer = new.besitzer and m.agentur is distinct from new.agentur) then
    update public.bav_firmen f set besitzer = v_ich where f.id = new.id;
    if new.buero is not null then
      perform privat.bav_freigabe_beenden(new.id);
    end if;
  end if;
  for v_nutzer in
    select x.besitzer from (
      select b.besitzer from public.bav_beratungen b where b.firma = new.id
      union
      select u.besitzer from public.bav_unterlagen u
        join public.bav_beratungen b on b.id = u.beratung where b.firma = new.id
      union
      select s.besitzer from public.bav_unterschriften s
        join public.bav_beratungen b on b.id = s.beratung where b.firma = new.id
    ) x
    where exists (select 1 from privat.bav_agentur_mitglieder m
                   where m.nutzer = x.besitzer and m.agentur is distinct from new.agentur)
  loop
    perform privat.bav_uebergeben(new.id, v_nutzer);
  end loop;
  return null;
end;
$$;

revoke all on function privat.bav_firma_agentur_gewechselt() from public;

drop trigger if exists bav_firmen_agentur_gewechselt on public.bav_firmen;
create trigger bav_firmen_agentur_gewechselt
  after update on public.bav_firmen
  for each row when (old.agentur is distinct from new.agentur)
  execute function privat.bav_firma_agentur_gewechselt();

-- Wer sein Konto loescht, gibt vorher ab — sonst loeschte die Kaskade die
-- Firmen der Agentur mit dem Konto. Der Name sortiert vor
-- bav_beteiligungen_uebergeben: erst die Firmen, dann der Rest.
create or replace function privat.bav_agentur_beim_kontoloeschen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privat.bav_agentur_firmen_abgeben(old.id);
  return old;
end;
$$;

revoke all on function privat.bav_agentur_beim_kontoloeschen() from public;

drop trigger if exists bav_agentur_firmen_abgeben on auth.users;
create trigger bav_agentur_firmen_abgeben
  before delete on auth.users
  for each row execute function privat.bav_agentur_beim_kontoloeschen();

-- ---------------------------------------------------------------------------
-- Der Zugang — wie bisher, dazu Agentur und Verwaltung
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

  select am.agentur, ag.name into v_agentur, v_agentur_n
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
-- Die Verwaltung benennen — nur der Betreiber. Antwort statt Ausnahme, wo es
-- die Oberflaeche erklaert.
-- ---------------------------------------------------------------------------
create or replace function public.bav_verwalter()
returns table (nutzer uuid, email text, seit timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.nutzer, u.email::text, v.seit
    from privat.bav_verwalter v
    join auth.users u on u.id = v.nutzer
   where privat.ist_betreiber()
   order by v.seit, u.email;
$$;

-- ok | kein_betreiber | unbekannt | agentur (das Konto gehoert zu einer Agentur)
create or replace function public.bav_verwalter_benennen(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nutzer uuid;
begin
  if not privat.ist_betreiber() then
    return 'kein_betreiber';
  end if;
  select u.id into v_nutzer from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_nutzer is null then
    return 'unbekannt';
  end if;
  if exists (select 1 from privat.bav_agentur_mitglieder m where m.nutzer = v_nutzer) then
    return 'agentur';
  end if;
  insert into privat.bav_verwalter (nutzer, benannt_von) values (v_nutzer, auth.uid())
  on conflict (nutzer) do nothing;
  return 'ok';
end;
$$;

create or replace function public.bav_verwalter_entfernen(p_nutzer uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privat.ist_betreiber() then
    return false;
  end if;
  if not exists (select 1 from privat.bav_verwalter v where v.nutzer = p_nutzer) then
    return false;
  end if;
  -- Erst austragen, dann abgeben: so geht nichts an den, der geht.
  delete from privat.bav_verwalter v where v.nutzer = p_nutzer;
  if not exists (select 1 from privat.freizugaenge f where f.nutzer = p_nutzer and f.grund = 'betreiber') then
    perform privat.bav_agentur_firmen_abgeben(p_nutzer, auth.uid());
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Einladungen in eine Agentur — die Verwaltung erzeugt Links, ein Konto
-- loest einen ein.
-- ---------------------------------------------------------------------------
create or replace function public.bav_agentur_einladung_erstellen(p_agentur uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not public.bav_ist_verwalter()
     or not exists (select 1 from public.bav_agenturen a where a.id = p_agentur) then
    return null;
  end if;
  if (select count(*) from privat.bav_agentur_einladungen e
       where e.agentur = p_agentur and e.angenommen_von is null and e.gueltig_bis > now()) >= 20 then
    raise exception 'Es sind hoechstens 20 offene Einladungen je Agentur moeglich.'
      using errcode = 'check_violation';
  end if;
  insert into privat.bav_agentur_einladungen (agentur, erstellt_von)
  values (p_agentur, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;

-- Die offenen Einladungen einer Agentur.
create or replace function public.bav_agentur_einladungen(p_agentur uuid)
returns table (token uuid, erstellt_am timestamptz, gueltig_bis timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.token, e.erstellt_am, e.gueltig_bis
    from privat.bav_agentur_einladungen e
   where e.agentur = p_agentur
     and e.angenommen_von is null
     and e.gueltig_bis > now()
     and public.bav_ist_verwalter()
   order by e.erstellt_am;
$$;

create or replace function public.bav_agentur_einladung_zurueckziehen(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.bav_ist_verwalter() then
    return false;
  end if;
  delete from privat.bav_agentur_einladungen e where e.token = p_token and e.angenommen_von is null;
  return found;
end;
$$;

-- Was hinter einem Link steht — fuer die Frage „annehmen?“. Nur der Name der
-- Agentur; wer den Link hat, soll ihn einloesen koennen.
-- stand: offen | abgelaufen | eingeloest | ungueltig
create or replace function public.bav_agentur_einladung_ansehen(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e    privat.bav_agentur_einladungen%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_e from privat.bav_agentur_einladungen e where e.token = p_token;
  if not found then
    return jsonb_build_object('stand', 'ungueltig');
  end if;
  select a.name into v_name from public.bav_agenturen a where a.id = v_e.agentur;
  return jsonb_build_object(
    'stand', case
      when v_e.angenommen_von is not null then 'eingeloest'
      when v_e.gueltig_bis <= now() then 'abgelaufen'
      else 'offen' end,
    'agentur', v_name);
end;
$$;

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
  insert into privat.bav_agentur_mitglieder (agentur, nutzer) values (v_e.agentur, v_nutzer);
  update privat.bav_agentur_einladungen e
     set angenommen_von = v_nutzer, angenommen_am = now()
   where e.token = p_token;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Die Zugaenge einer Agentur — fuer die Verwaltung und die Agentur selbst
-- ---------------------------------------------------------------------------
create or replace function public.bav_agentur_mitglieder(p_agentur uuid)
returns table (nutzer uuid, email text, seit timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.nutzer, u.email::text, m.seit
    from privat.bav_agentur_mitglieder m
    join auth.users u on u.id = m.nutzer
   where m.agentur = p_agentur
     and (public.bav_ist_verwalter() or p_agentur = public.bav_meine_agentur())
   order by m.seit, u.email;
$$;

-- Einen Zugang entfernen: Seine Firmen in der Agentur gehen samt Beratungen
-- an den, der ihn entfernt.
create or replace function public.bav_agentur_mitglied_entfernen(p_nutzer uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.bav_ist_verwalter() then
    return false;
  end if;
  if not exists (select 1 from privat.bav_agentur_mitglieder m where m.nutzer = p_nutzer) then
    return false;
  end if;
  perform privat.bav_agentur_firmen_abgeben(p_nutzer, auth.uid());
  delete from privat.bav_agentur_mitglieder m where m.nutzer = p_nutzer;
  return true;
end;
$$;

-- Fuer die Uebersicht: Zugaenge und offene Einladungen je Agentur.
create or replace function public.bav_agenturen_stand()
returns table (agentur uuid, zugaenge integer, einladungen integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id,
         (select count(*)::integer from privat.bav_agentur_mitglieder m where m.agentur = a.id),
         (select count(*)::integer from privat.bav_agentur_einladungen e
           where e.agentur = a.id and e.angenommen_von is null and e.gueltig_bis > now())
    from public.bav_agenturen a
   where public.bav_ist_verwalter();
$$;

revoke all on function public.bav_verwalter() from public, anon;
revoke all on function public.bav_verwalter_benennen(text) from public, anon;
revoke all on function public.bav_verwalter_entfernen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladung_erstellen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladungen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladung_zurueckziehen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladung_ansehen(uuid) from public, anon;
revoke all on function public.bav_agentur_einladung_annehmen(uuid) from public, anon;
revoke all on function public.bav_agentur_mitglieder(uuid) from public, anon;
revoke all on function public.bav_agentur_mitglied_entfernen(uuid) from public, anon;
revoke all on function public.bav_agenturen_stand() from public, anon;
grant execute on function public.bav_verwalter() to authenticated;
grant execute on function public.bav_verwalter_benennen(text) to authenticated;
grant execute on function public.bav_verwalter_entfernen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladung_erstellen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladungen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladung_zurueckziehen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladung_ansehen(uuid) to authenticated;
grant execute on function public.bav_agentur_einladung_annehmen(uuid) to authenticated;
grant execute on function public.bav_agentur_mitglieder(uuid) to authenticated;
grant execute on function public.bav_agentur_mitglied_entfernen(uuid) to authenticated;
grant execute on function public.bav_agenturen_stand() to authenticated;
