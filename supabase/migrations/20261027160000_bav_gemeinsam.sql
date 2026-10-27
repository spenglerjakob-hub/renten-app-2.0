-- bAV-Mitarbeiterberatung: Firmen gemeinsam beraten — auch agenturuebergreifend.
--
-- WOZU. Bei manchen Arbeitgebern beraten mehrere Berater die Mitarbeiter,
-- auch aus verschiedenen Agenturen. Der Inhaber einer Firma laedt Kollegen
-- per Link ein (sieben Tage gueltig, einmal einloesbar). Alle Beteiligten
-- sehen und bearbeiten alle Beratungen der Firma; das Angebot aendert nur
-- der Inhaber.
--
-- WER SIEHT WAS. Eine Beratung sieht, wer ihre Firma sieht: der Inhaber und
-- die Beteiligten (bav_firma_teilnehmer). Loeschen duerfen sie, wer sie
-- angelegt hat, und der Inhaber. Unterlagen und Unterschriften folgen der
-- Beratung — damit greift die Sperre unterschriebener Beratungen auch fuer
-- Kollegen (bav_beratung_sperre_pruefen liest die Unterlagen mit den Rechten
-- des Aufrufers).
--
-- AUSSCHEIDEN. Verlaesst ein Kollege die Firma, wird er entfernt oder
-- loescht er sein Konto, bleiben seine Beratungen bei der Firma: Beratungen,
-- Unterlagen und Unterschriften gehen an den Inhaber ueber. Loescht der
-- Inhaber die Firma oder sein Konto, gehen alle Beratungen mit (Kaskade).
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Ohne
-- Beteiligte sieht und darf jeder genau, was er bisher sah und durfte.

-- ---------------------------------------------------------------------------
-- Beteiligte einer Firma — der Inhaber steht nicht darin, er ist `besitzer`
-- ---------------------------------------------------------------------------
create table if not exists public.bav_firma_teilnehmer (
  firma  uuid not null references public.bav_firmen (id) on delete cascade,
  nutzer uuid not null references auth.users (id) on delete cascade,
  seit   timestamptz not null default now(),
  primary key (firma, nutzer)
);

comment on table public.bav_firma_teilnehmer is
  'bAV-Mitarbeiterberatung: Kollegen, mit denen der Inhaber eine Firma gemeinsam beraet. Geschrieben nur ueber die Funktionen bav_firma_*.';

create index if not exists bav_firma_teilnehmer_nutzer_idx on public.bav_firma_teilnehmer (nutzer);

-- Lesen nur die eigenen Zeilen. Ein Verweis auf bav_firmen fehlt mit Absicht:
-- Deren Policy fragt diese Tabelle — andersherum liefe es im Kreis.
alter table public.bav_firma_teilnehmer enable row level security;
alter table public.bav_firma_teilnehmer force row level security;

create policy "eigene teilnahmen lesen" on public.bav_firma_teilnehmer
  for select to authenticated
  using ((select auth.uid()) = nutzer);

revoke all on public.bav_firma_teilnehmer from anon, authenticated;
grant select on public.bav_firma_teilnehmer to authenticated;

-- ---------------------------------------------------------------------------
-- Einladungen: ein Link je Einladung, einmal einloesbar, sieben Tage gueltig
-- ---------------------------------------------------------------------------
create table if not exists privat.bav_firma_einladungen (
  token          uuid primary key default gen_random_uuid(),
  firma          uuid not null references public.bav_firmen (id) on delete cascade,
  erstellt_von   uuid references auth.users (id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '7 days',
  angenommen_von uuid references auth.users (id) on delete set null,
  angenommen_am  timestamptz
);
create index if not exists bav_firma_einladungen_firma_idx on privat.bav_firma_einladungen (firma);

alter table privat.bav_firma_einladungen enable row level security;
revoke all on privat.bav_firma_einladungen from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Firmen: lesen duerfen Inhaber und Beteiligte. Anlegen, Aendern (das
-- Angebot) und Loeschen bleiben beim Inhaber — diese Policies bleiben.
-- ---------------------------------------------------------------------------
drop policy if exists "eigene firmen lesen" on public.bav_firmen;
create policy "firmen lesen" on public.bav_firmen
  for select to authenticated
  using (
    (select auth.uid()) = besitzer
    or exists (select 1 from public.bav_firma_teilnehmer t
                where t.firma = bav_firmen.id and t.nutzer = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Beratungen: alles ueber die sichtbare Firma — die Unterabfrage auf
-- bav_firmen unterliegt deren Policy. Loeschen: wer sie angelegt hat, und der
-- Inhaber.
-- ---------------------------------------------------------------------------
drop policy if exists "eigene beratungen lesen"   on public.bav_beratungen;
drop policy if exists "eigene beratungen anlegen" on public.bav_beratungen;
drop policy if exists "eigene beratungen aendern" on public.bav_beratungen;
drop policy if exists "eigene beratungen loeschen" on public.bav_beratungen;

create policy "beratungen lesen" on public.bav_beratungen
  for select to authenticated
  using (exists (select 1 from public.bav_firmen f where f.id = bav_beratungen.firma));

create policy "beratungen anlegen" on public.bav_beratungen
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_firmen f where f.id = bav_beratungen.firma)
  );

create policy "beratungen aendern" on public.bav_beratungen
  for update to authenticated
  using (exists (select 1 from public.bav_firmen f where f.id = bav_beratungen.firma))
  with check (exists (select 1 from public.bav_firmen f where f.id = bav_beratungen.firma));

create policy "beratungen loeschen" on public.bav_beratungen
  for delete to authenticated
  using (
    (select auth.uid()) = besitzer
    or exists (select 1 from public.bav_firmen f
                where f.id = bav_beratungen.firma and f.besitzer = (select auth.uid()))
  );

-- Besitzer und Firma einer Beratung bleiben, wie sie sind — ausser bei der
-- Uebergabe an den Inhaber (privat.bav_uebergeben, als Eigentuemer der
-- Datenbank). Bisher hielt szenarien_geaendert_am den Besitzer; die
-- Uebergabe braucht eine eigene Funktion.
create or replace function public.bav_beratung_geaendert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am := now();
  if current_user in ('authenticated', 'anon') then
    new.besitzer := old.besitzer;
    new.firma := old.firma;
  end if;
  return new;
end;
$$;

drop trigger if exists bav_beratungen_geaendert_am on public.bav_beratungen;
create trigger bav_beratungen_geaendert_am
  before update on public.bav_beratungen
  for each row execute function public.bav_beratung_geaendert_am();

-- ---------------------------------------------------------------------------
-- Unterlagen und Unterschriften folgen der sichtbaren Beratung. Angelegt wird
-- weiter mit sich selbst als Besitzer.
-- ---------------------------------------------------------------------------
drop policy if exists "eigene unterlagen lesen"   on public.bav_unterlagen;
drop policy if exists "eigene unterlagen anlegen" on public.bav_unterlagen;
drop policy if exists "eigene unterlagen loeschen" on public.bav_unterlagen;

create policy "unterlagen lesen" on public.bav_unterlagen
  for select to authenticated
  using (exists (select 1 from public.bav_beratungen b where b.id = bav_unterlagen.beratung));

create policy "unterlagen anlegen" on public.bav_unterlagen
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_beratungen b where b.id = bav_unterlagen.beratung)
  );

create policy "unterlagen loeschen" on public.bav_unterlagen
  for delete to authenticated
  using (exists (select 1 from public.bav_beratungen b where b.id = bav_unterlagen.beratung));

drop policy if exists "eigene unterschriften lesen"   on public.bav_unterschriften;
drop policy if exists "eigene unterschriften anlegen" on public.bav_unterschriften;

create policy "unterschriften lesen" on public.bav_unterschriften
  for select to authenticated
  using (exists (select 1 from public.bav_unterlagen u where u.beratung = bav_unterschriften.beratung));

create policy "unterschriften anlegen" on public.bav_unterschriften
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_unterlagen u where u.beratung = bav_unterschriften.beratung)
  );

-- ---------------------------------------------------------------------------
-- Firmenlogos: Beteiligte lesen das aktuelle Logo der Firma. Hochladen und
-- Loeschen bleiben beim Inhaber (eigener Ordner).
-- ---------------------------------------------------------------------------
create policy "firmenlogo beteiligte lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bav-firmenlogos'
    and exists (select 1 from public.bav_firma_teilnehmer t
                  join public.bav_firmen f on f.id = t.firma
                 where t.nutzer = (select auth.uid()) and f.logo = objects.name)
  );

-- ---------------------------------------------------------------------------
-- Uebergabe an den Inhaber: Beratungen, Unterlagen und Unterschriften eines
-- Kollegen in einer Firma. Nur fuer die Funktionen unten.
-- ---------------------------------------------------------------------------
create or replace function privat.bav_uebergeben(p_firma uuid, p_nutzer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inhaber uuid;
begin
  select f.besitzer into v_inhaber from public.bav_firmen f where f.id = p_firma;
  if v_inhaber is null or v_inhaber = p_nutzer then
    return;
  end if;
  update public.bav_beratungen b set besitzer = v_inhaber
   where b.firma = p_firma and b.besitzer = p_nutzer;
  update public.bav_unterlagen u set besitzer = v_inhaber
   where u.besitzer = p_nutzer
     and exists (select 1 from public.bav_beratungen b where b.id = u.beratung and b.firma = p_firma);
  update public.bav_unterschriften s set besitzer = v_inhaber
   where s.besitzer = p_nutzer
     and exists (select 1 from public.bav_beratungen b where b.id = s.beratung and b.firma = p_firma);
end;
$$;

revoke all on function privat.bav_uebergeben(uuid, uuid) from public;

-- Wer sein Konto loescht, verlaesst damit alle fremden Firmen — seine
-- Beratungen bleiben dort. Sonst loeschte die Kaskade sie mit dem Konto.
create or replace function privat.bav_beim_kontoloeschen_uebergeben()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firma uuid;
begin
  for v_firma in
    select b.firma from public.bav_beratungen b where b.besitzer = old.id
    union
    select b.firma from public.bav_unterlagen u join public.bav_beratungen b on b.id = u.beratung where u.besitzer = old.id
    union
    select b.firma from public.bav_unterschriften s join public.bav_beratungen b on b.id = s.beratung where s.besitzer = old.id
  loop
    perform privat.bav_uebergeben(v_firma, old.id);
  end loop;
  return old;
end;
$$;

revoke all on function privat.bav_beim_kontoloeschen_uebergeben() from public;

drop trigger if exists bav_beteiligungen_uebergeben on auth.users;
create trigger bav_beteiligungen_uebergeben
  before delete on auth.users
  for each row execute function privat.bav_beim_kontoloeschen_uebergeben();

-- ---------------------------------------------------------------------------
-- Einladen, annehmen, zurueckziehen, auflisten, entfernen, verlassen.
-- SECURITY DEFINER wie beim Buero: Einladungen liegen in `privat`, und die
-- Beteiligten schreibt nur der Server. Jede Funktion prueft auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.bav_firma_einladung_erstellen(p_firma uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_offen integer;
  v_token uuid;
begin
  if not exists (select 1 from public.bav_firmen f where f.id = p_firma and f.besitzer = auth.uid()) then
    raise exception 'Nur der Inhaber der Firma kann einladen' using errcode = '42501';
  end if;
  select count(*) into v_offen
    from privat.bav_firma_einladungen e
   where e.firma = p_firma and e.angenommen_von is null and e.gueltig_bis > now();
  if v_offen >= 10 then
    raise exception 'Zu viele offene Einladungen' using errcode = 'P0001';
  end if;
  insert into privat.bav_firma_einladungen (firma, erstellt_von)
  values (p_firma, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;

-- Offene Einladungen einer Firma — nur fuer den Inhaber.
create or replace function public.bav_firma_einladungen(p_firma uuid)
returns table (token uuid, erstellt_am timestamptz, gueltig_bis timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.token, e.erstellt_am, e.gueltig_bis
    from privat.bav_firma_einladungen e
    join public.bav_firmen f on f.id = e.firma and f.besitzer = auth.uid()
   where e.firma = p_firma and e.angenommen_von is null and e.gueltig_bis > now()
   order by e.erstellt_am;
$$;

-- Macht eine offene Einladung ungueltig. Sie bleibt als Spur stehen.
create or replace function public.bav_firma_einladung_zurueckziehen(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.bav_firma_einladungen e
     set gueltig_bis = least(e.gueltig_bis, now())
   where e.token = p_token
     and e.angenommen_von is null
     and exists (select 1 from public.bav_firmen f where f.id = e.firma and f.besitzer = auth.uid());
$$;

-- Antwort statt Ausnahme: {"antwort": ok | ungueltig | abgelaufen | eigene |
-- schon | voll, "firma", "name"} — die Oberflaeche erklaert jeden Fall.
-- Hoechstens 20 Kollegen je Firma.
create or replace function public.bav_firma_einladung_annehmen(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       privat.bav_firma_einladungen%rowtype;
  v_inhaber uuid;
  v_name    text;
  v_anzahl  integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('antwort', 'ungueltig');
  end if;
  select * into v_e from privat.bav_firma_einladungen e where e.token = p_token for update;
  if not found or v_e.angenommen_von is not null then
    return jsonb_build_object('antwort', 'ungueltig');
  end if;
  if v_e.gueltig_bis <= now() then
    return jsonb_build_object('antwort', 'abgelaufen');
  end if;
  select f.besitzer, f.name into v_inhaber, v_name from public.bav_firmen f where f.id = v_e.firma for update;
  if v_inhaber is null then
    return jsonb_build_object('antwort', 'ungueltig');
  end if;
  if v_inhaber = auth.uid() then
    return jsonb_build_object('antwort', 'eigene', 'firma', v_e.firma, 'name', v_name);
  end if;
  if exists (select 1 from public.bav_firma_teilnehmer t where t.firma = v_e.firma and t.nutzer = auth.uid()) then
    return jsonb_build_object('antwort', 'schon', 'firma', v_e.firma, 'name', v_name);
  end if;
  select count(*) into v_anzahl from public.bav_firma_teilnehmer t where t.firma = v_e.firma;
  if v_anzahl >= 20 then
    return jsonb_build_object('antwort', 'voll');
  end if;
  insert into public.bav_firma_teilnehmer (firma, nutzer) values (v_e.firma, auth.uid());
  update privat.bav_firma_einladungen set angenommen_von = auth.uid(), angenommen_am = now() where token = p_token;
  return jsonb_build_object('antwort', 'ok', 'firma', v_e.firma, 'name', v_name);
end;
$$;

-- Inhaber und Beteiligte einer Firma — fuer alle, die sie sehen. Der Name aus
-- „Ihr Auftritt“, sonst die E-Mail (wie buero_mitglieder); dazu die Agentur.
create or replace function public.bav_firma_beteiligte(p_firma uuid)
returns table (nutzer uuid, name text, agentur text, rolle text, seit timestamptz, ich boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with firma as (
    select f.id, f.besitzer, f.erstellt_am
      from public.bav_firmen f
     where f.id = p_firma
       and (f.besitzer = auth.uid()
            or exists (select 1 from public.bav_firma_teilnehmer t where t.firma = f.id and t.nutzer = auth.uid()))
  ),
  alle as (
    select firma.besitzer as nutzer, 'inhaber'::text as rolle, firma.erstellt_am as seit from firma
    union all
    select t.nutzer, 'beteiligt'::text, t.seit from public.bav_firma_teilnehmer t join firma on firma.id = t.firma
  )
  select a.nutzer,
         coalesce(nullif(btrim(p.berater), ''), u.email::text, '') as name,
         coalesce(btrim(p.firma), '') as agentur,
         a.rolle, a.seit, a.nutzer = auth.uid() as ich
    from alle a
    left join public.berater_profil p on p.besitzer = a.nutzer
    left join auth.users u on u.id = a.nutzer
   order by (a.rolle = 'inhaber') desc, a.seit, a.nutzer;
$$;

create or replace function public.bav_firma_teilnehmer_entfernen(p_firma uuid, p_nutzer uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.bav_firmen f where f.id = p_firma and f.besitzer = auth.uid()) then
    raise exception 'Nur der Inhaber der Firma kann Kollegen entfernen' using errcode = '42501';
  end if;
  delete from public.bav_firma_teilnehmer t where t.firma = p_firma and t.nutzer = p_nutzer;
  if not found then
    raise exception 'Kein Beteiligter dieser Firma' using errcode = 'P0002';
  end if;
  perform privat.bav_uebergeben(p_firma, p_nutzer);
end;
$$;

-- Ein Kollege geht. Der Inhaber kann das nicht — er loescht die Firma.
create or replace function public.bav_firma_verlassen(p_firma uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.bav_firma_teilnehmer t where t.firma = p_firma and t.nutzer = auth.uid();
  if not found then
    raise exception 'Sie sind an dieser Firma nicht beteiligt' using errcode = 'P0002';
  end if;
  perform privat.bav_uebergeben(p_firma, auth.uid());
end;
$$;

revoke all on function public.bav_firma_einladung_erstellen(uuid)          from public, anon;
revoke all on function public.bav_firma_einladungen(uuid)                  from public, anon;
revoke all on function public.bav_firma_einladung_zurueckziehen(uuid)      from public, anon;
revoke all on function public.bav_firma_einladung_annehmen(uuid)           from public, anon;
revoke all on function public.bav_firma_beteiligte(uuid)                   from public, anon;
revoke all on function public.bav_firma_teilnehmer_entfernen(uuid, uuid)   from public, anon;
revoke all on function public.bav_firma_verlassen(uuid)                    from public, anon;
grant execute on function public.bav_firma_einladung_erstellen(uuid)        to authenticated;
grant execute on function public.bav_firma_einladungen(uuid)                to authenticated;
grant execute on function public.bav_firma_einladung_zurueckziehen(uuid)    to authenticated;
grant execute on function public.bav_firma_einladung_annehmen(uuid)         to authenticated;
grant execute on function public.bav_firma_beteiligte(uuid)                 to authenticated;
grant execute on function public.bav_firma_teilnehmer_entfernen(uuid, uuid) to authenticated;
grant execute on function public.bav_firma_verlassen(uuid)                  to authenticated;
