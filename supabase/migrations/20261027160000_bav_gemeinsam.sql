-- bAV-Mitarbeiterberatung: Firmen im Buero gemeinsam beraten.
--
-- WOZU. In einer Agentur fuehren bei manchen Arbeitgebern mehrere Kollegen
-- die Gespraeche. Die Agentur ist in der App das Buero („Abo & Team“:
-- Inhaber, Mitglieder, Plaetze). Wer eine Firma angelegt hat, kann sie fuer
-- sein Buero freigeben (bav_firma_freigeben). Dann sehen und bearbeiten alle
-- Mitglieder des Bueros alle Beratungen der Firma; das Angebot aendert weiter
-- nur, wer die Firma angelegt hat.
--
-- WER SIEHT WAS. Eine Firma sieht ihr Besitzer und — ist sie freigegeben —
-- jedes Mitglied ihres Bueros. Eine Beratung sieht, wer ihre Firma sieht.
-- Loeschen duerfen sie, wer sie angelegt hat, und der Besitzer der Firma.
-- Unterlagen und Unterschriften folgen der Beratung — damit greift die
-- Sperre unterschriebener Beratungen auch fuer Kollegen
-- (bav_beratung_sperre_pruefen liest die Unterlagen mit den Rechten des
-- Aufrufers).
--
-- AUSSCHEIDEN. Tritt ein Mitglied aus, wird es entfernt oder loescht es sein
-- Konto: Firmen, die es fuers Buero freigegeben hat, gehen samt aller
-- Beratungen an den Inhaber des Bueros und bleiben freigegeben; seine
-- Beratungen in Firmen der Kollegen gehen an deren Besitzer. Endet eine
-- Freigabe, gehen die Beratungen der Kollegen an den Besitzer der Firma.
-- Loescht der Inhaber sein Konto, endet das Buero und mit ihm alle
-- Freigaben; seine eigenen Firmen gehen mit allen Beratungen (Kaskade).
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Ohne
-- Freigabe sieht und darf jeder genau, was er bisher sah und durfte.

-- ---------------------------------------------------------------------------
-- Freigabe: das Buero, fuer das eine Firma freigegeben ist — oder null
-- ---------------------------------------------------------------------------
alter table public.bav_firmen
  add column if not exists buero uuid references privat.bueros (id) on delete set null;

comment on column public.bav_firmen.buero is
  'Das Buero, fuer das die Firma freigegeben ist (alle Mitglieder beraten mit), oder null. Gesetzt nur ueber bav_firma_freigeben.';

create index if not exists bav_firmen_buero_idx on public.bav_firmen (buero) where buero is not null;

-- Das Logo gehoert zu genau dieser Firma; der Ordner ist der dessen, der es
-- hochgeladen hat. Uebernimmt der Inhaber des Bueros eine Firma, bleibt es
-- dort liegen — die alte Regel (Ordner = Besitzer) liesse die Uebernahme
-- scheitern. Hochladen geht weiter nur in den eigenen Ordner
-- (bav_logo_pfad_erlaubt).
alter table public.bav_firmen drop constraint if exists logo_eigene_firma;
alter table public.bav_firmen drop constraint if exists logo_dieser_firma;
alter table public.bav_firmen add constraint logo_dieser_firma check (
  logo is null
  or logo ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || id::text || '-[0-9a-f]{24}\.(png|webp)$')
);

-- ---------------------------------------------------------------------------
-- Das eigene Buero — fuer die Policies. `privat` ist fuer authenticated nicht
-- lesbar; die Funktion liefert nur die eigene Mitgliedschaft (wie hat_paket).
-- ---------------------------------------------------------------------------
create or replace function public.bav_mein_buero()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.buero from privat.buero_mitglieder m where m.nutzer = auth.uid();
$$;

revoke all on function public.bav_mein_buero() from public, anon;
grant execute on function public.bav_mein_buero() to authenticated;

-- ---------------------------------------------------------------------------
-- Firmen: lesen duerfen der Besitzer und, ist sie freigegeben, das Buero.
-- Aendern und Loeschen bleiben beim Besitzer — diese Policies bleiben. Neu
-- angelegt wird nie freigegeben.
-- ---------------------------------------------------------------------------
drop policy if exists "eigene firmen lesen" on public.bav_firmen;
drop policy if exists "firmen lesen" on public.bav_firmen;
create policy "firmen lesen" on public.bav_firmen
  for select to authenticated
  using (
    (select auth.uid()) = besitzer
    or (buero is not null and buero = (select public.bav_mein_buero()))
  );

drop policy if exists "eigene firmen anlegen" on public.bav_firmen;
create policy "eigene firmen anlegen" on public.bav_firmen
  for insert to authenticated
  with check ((select auth.uid()) = besitzer and buero is null);

-- Besitzer und Freigabe bleiben, wie sie sind — ausser ueber die Funktionen
-- unten (als Eigentuemer der Datenbank). Bisher hielt szenarien_geaendert_am
-- den Besitzer; die Uebernahme durch den Inhaber des Bueros braucht eine
-- eigene Funktion.
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
  end if;
  return new;
end;
$$;

drop trigger if exists bav_firmen_geaendert_am on public.bav_firmen;
create trigger bav_firmen_geaendert_am
  before update on public.bav_firmen
  for each row execute function public.bav_firma_geaendert_am();

-- ---------------------------------------------------------------------------
-- Beratungen: alles ueber die sichtbare Firma — die Unterabfrage auf
-- bav_firmen unterliegt deren Policy. Loeschen: wer sie angelegt hat, und der
-- Besitzer der Firma.
-- ---------------------------------------------------------------------------
drop policy if exists "eigene beratungen lesen"   on public.bav_beratungen;
drop policy if exists "eigene beratungen anlegen" on public.bav_beratungen;
drop policy if exists "eigene beratungen aendern" on public.bav_beratungen;
drop policy if exists "eigene beratungen loeschen" on public.bav_beratungen;
drop policy if exists "beratungen lesen"   on public.bav_beratungen;
drop policy if exists "beratungen anlegen" on public.bav_beratungen;
drop policy if exists "beratungen aendern" on public.bav_beratungen;
drop policy if exists "beratungen loeschen" on public.bav_beratungen;

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

-- Eine Beratung bleibt bei ihrer Firma: Der Versuch, sie zu verschieben, wird
-- abgewiesen (wie bisher ueber die Policy). Der Besitzer bleibt stillschweigend,
-- wie bisher bei szenarien_geaendert_am — ausser bei der Uebergabe
-- (privat.bav_uebergeben, als Eigentuemer der Datenbank).
create or replace function public.bav_beratung_geaendert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am := now();
  if current_user in ('authenticated', 'anon') then
    if new.firma is distinct from old.firma then
      raise exception 'Eine Beratung bleibt bei ihrer Firma.'
        using errcode = 'check_violation';
    end if;
    new.besitzer := old.besitzer;
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
drop policy if exists "unterlagen lesen"   on public.bav_unterlagen;
drop policy if exists "unterlagen anlegen" on public.bav_unterlagen;
drop policy if exists "unterlagen loeschen" on public.bav_unterlagen;

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
drop policy if exists "unterschriften lesen"   on public.bav_unterschriften;
drop policy if exists "unterschriften anlegen" on public.bav_unterschriften;

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
-- Firmenlogos: lesen darf, wer die Firma sieht — Kollegen im Buero und nach
-- einer Uebernahme der neue Besitzer. Hochladen und Loeschen bleiben im
-- eigenen Ordner.
-- ---------------------------------------------------------------------------
drop policy if exists "firmenlogo der firma lesen" on storage.objects;
create policy "firmenlogo der firma lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bav-firmenlogos'
    and exists (select 1 from public.bav_firmen f where f.logo = objects.name)
  );

-- ---------------------------------------------------------------------------
-- Uebergeben — nur fuer die Funktionen und Trigger unten.
-- ---------------------------------------------------------------------------
-- Was ein Nutzer in einer Firma angelegt oder unterschrieben hat, geht an den
-- Besitzer der Firma. Die Beratungen bleiben so bei der Firma.
create or replace function privat.bav_uebergeben(p_firma uuid, p_nutzer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_besitzer uuid;
begin
  select f.besitzer into v_besitzer from public.bav_firmen f where f.id = p_firma;
  if v_besitzer is null or v_besitzer = p_nutzer then
    return;
  end if;
  update public.bav_beratungen b set besitzer = v_besitzer
   where b.firma = p_firma and b.besitzer = p_nutzer;
  update public.bav_unterlagen u set besitzer = v_besitzer
   where u.besitzer = p_nutzer
     and exists (select 1 from public.bav_beratungen b where b.id = u.beratung and b.firma = p_firma);
  update public.bav_unterschriften s set besitzer = v_besitzer
   where s.besitzer = p_nutzer
     and exists (select 1 from public.bav_beratungen b where b.id = s.beratung and b.firma = p_firma);
end;
$$;

revoke all on function privat.bav_uebergeben(uuid, uuid) from public;

-- Eine Freigabe endet: Was Kollegen in der Firma angelegt oder unterschrieben
-- haben, geht an ihren Besitzer — sie sehen die Firma danach nicht mehr.
create or replace function privat.bav_freigabe_beenden(p_firma uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_besitzer uuid;
begin
  update public.bav_firmen f set buero = null where f.id = p_firma returning f.besitzer into v_besitzer;
  if v_besitzer is null then
    return;
  end if;
  update public.bav_beratungen b set besitzer = v_besitzer
   where b.firma = p_firma and b.besitzer <> v_besitzer;
  update public.bav_unterlagen u set besitzer = v_besitzer
   where u.besitzer <> v_besitzer
     and exists (select 1 from public.bav_beratungen b where b.id = u.beratung and b.firma = p_firma);
  update public.bav_unterschriften s set besitzer = v_besitzer
   where s.besitzer <> v_besitzer
     and exists (select 1 from public.bav_beratungen b where b.id = s.beratung and b.firma = p_firma);
end;
$$;

revoke all on function privat.bav_freigabe_beenden(uuid) from public;

-- Ein Mitglied verlaesst das Buero (austreten, entfernt, Konto geloescht):
-- Firmen, die es fuers Buero freigegeben hat, gehen samt aller Beratungen an
-- den Inhaber und bleiben freigegeben; seine Beratungen in Firmen der
-- Kollegen gehen an deren Besitzer. Gibt es das Buero nicht mehr oder ist es
-- der Inhaber selbst, bleibt alles, wie es ist.
create or replace function privat.bav_buero_austritt(p_buero uuid, p_nutzer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inhaber uuid;
  v_firma   uuid;
begin
  select b.inhaber into v_inhaber from privat.bueros b where b.id = p_buero;
  if v_inhaber is null or v_inhaber = p_nutzer then
    return;
  end if;
  for v_firma in
    select f.id from public.bav_firmen f where f.buero = p_buero and f.besitzer = p_nutzer
  loop
    update public.bav_firmen f set besitzer = v_inhaber where f.id = v_firma;
    perform privat.bav_uebergeben(v_firma, p_nutzer);
  end loop;
  for v_firma in
    select b.firma from public.bav_beratungen b
      join public.bav_firmen f on f.id = b.firma
     where b.besitzer = p_nutzer and f.buero = p_buero
    union
    select b.firma from public.bav_unterlagen u
      join public.bav_beratungen b on b.id = u.beratung
      join public.bav_firmen f on f.id = b.firma
     where u.besitzer = p_nutzer and f.buero = p_buero
    union
    select b.firma from public.bav_unterschriften s
      join public.bav_beratungen b on b.id = s.beratung
      join public.bav_firmen f on f.id = b.firma
     where s.besitzer = p_nutzer and f.buero = p_buero
  loop
    perform privat.bav_uebergeben(v_firma, p_nutzer);
  end loop;
end;
$$;

revoke all on function privat.bav_buero_austritt(uuid, uuid) from public;

-- Austreten und Entfernen (buero_verlassen, mitglied_entfernen) — und die
-- Kaskade, wenn ein Konto geht. Endet das Buero selbst, gibt es seinen
-- Inhaber nicht mehr: bav_buero_austritt tut dann nichts.
create or replace function privat.bav_mitglied_ausgetreten()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rolle = 'mitglied' then
    perform privat.bav_buero_austritt(old.buero, old.nutzer);
  end if;
  return old;
end;
$$;

revoke all on function privat.bav_mitglied_ausgetreten() from public;

drop trigger if exists bav_mitglied_ausgetreten on privat.buero_mitglieder;
create trigger bav_mitglied_ausgetreten
  after delete on privat.buero_mitglieder
  for each row execute function privat.bav_mitglied_ausgetreten();

-- Wer sein Konto loescht: als Mitglied wie Austreten; als Inhaber enden die
-- Freigaben seines Bueros. Was ihm danach noch in Firmen anderer gehoert,
-- bleibt dort. Sonst loeschte die Kaskade es mit dem Konto.
create or replace function privat.bav_beim_kontoloeschen_uebergeben()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     privat.buero_mitglieder%rowtype;
  v_firma uuid;
begin
  select * into v_m from privat.buero_mitglieder m where m.nutzer = old.id;
  if found and v_m.rolle = 'mitglied' then
    perform privat.bav_buero_austritt(v_m.buero, old.id);
  elsif found then
    for v_firma in
      select f.id from public.bav_firmen f where f.buero = v_m.buero and f.besitzer <> old.id
    loop
      perform privat.bav_freigabe_beenden(v_firma);
    end loop;
  end if;
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
-- Freigeben und die Kollegen — SECURITY DEFINER wie beim Buero: Mitglieder
-- stehen in `privat`. Jede Funktion prueft auth.uid().
-- ---------------------------------------------------------------------------
-- Antwort statt Ausnahme, wo es die Oberflaeche erklaert: ok | kein_buero.
create or replace function public.bav_firma_freigeben(p_firma uuid, p_freigeben boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_buero uuid;
begin
  if not exists (select 1 from public.bav_firmen f where f.id = p_firma and f.besitzer = auth.uid()) then
    raise exception 'Freigeben kann nur, wer die Firma angelegt hat' using errcode = '42501';
  end if;
  if p_freigeben is not true then
    perform privat.bav_freigabe_beenden(p_firma);
    return 'ok';
  end if;
  select m.buero into v_buero from privat.buero_mitglieder m where m.nutzer = auth.uid();
  if v_buero is null then
    return 'kein_buero';
  end if;
  update public.bav_firmen f set buero = v_buero where f.id = p_firma;
  return 'ok';
end;
$$;

-- Die Mitglieder des eigenen Bueros: der Name aus „Ihr Auftritt“, sonst die
-- E-Mail (wie buero_mitglieder), dazu die Agentur — fuer „Freigegeben von …“
-- und „betreut von …“.
create or replace function public.bav_kollegen()
returns table (nutzer uuid, name text, agentur text, rolle text, ich boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.nutzer,
         coalesce(nullif(btrim(p.berater), ''), u.email::text, '') as name,
         coalesce(btrim(p.firma), '') as agentur,
         m.rolle,
         m.nutzer = auth.uid() as ich
    from privat.buero_mitglieder m
    join privat.buero_mitglieder selbst on selbst.buero = m.buero and selbst.nutzer = auth.uid()
    left join public.berater_profil p on p.besitzer = m.nutzer
    left join auth.users u on u.id = m.nutzer
   order by (m.rolle = 'inhaber') desc, m.seit, m.nutzer;
$$;

revoke all on function public.bav_firma_freigeben(uuid, boolean) from public, anon;
revoke all on function public.bav_kollegen()                     from public, anon;
grant execute on function public.bav_firma_freigeben(uuid, boolean) to authenticated;
grant execute on function public.bav_kollegen()                     to authenticated;
