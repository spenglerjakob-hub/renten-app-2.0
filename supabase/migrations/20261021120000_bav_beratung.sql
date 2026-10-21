-- bAV-Mitarbeiterberatung: Firmen mit ihrem Angebot und die Beratungen der
-- Mitarbeiter.
--
-- WOZU. Hat sich eine Firma mit dem Berater fuer ein Modell entschieden
-- (Matching, Zuschuss, Festbetrag), beraet der Berater jeden Mitarbeiter
-- einzeln — im Gespraech, auf der Seite /mitarbeiterberatung. Die Firma
-- traegt das Angebot (Modell, Versicherer, Texte, Logo), jede Beratung die
-- Angaben des Mitarbeiters und seine Entscheidung.
--
-- WER SIEHT WAS. Nur der Berater, dem die Zeilen gehoeren. Mitarbeiter und
-- Arbeitgeber haben kein Konto; der Arbeitgeber bekommt nur die Uebersicht,
-- die der Berater druckt. Row Level Security ist die einzige Schutzschicht
-- (der oeffentliche Schluessel steckt im Bundle) — wie bei den Szenarien.
--
-- GESPEICHERT werden nur EINGABEN, keine Ergebnisse: Gerechnet wird im
-- Browser mit dem Rechenkern. Das Angebot und die Daten einer Beratung sind
-- JSON, geprueft im Browser (packages/schema, bav-beratung.ts); hier stehen
-- nur Typ und Groesse fest.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Es
-- entstehen nur neue Tabellen, ein neuer Bucket und neue Policies.
--
-- LOESCHEN. Beratungen gehen mit ihrer Firma, beides mit dem Konto
-- (Kaskade). Die Logos nicht — Dateien lassen sich nur ueber die Storage-API
-- loeschen. Das uebernehmen der Browser (beim Ersetzen eines Logos und beim
-- Loeschen einer Firma) und die Edge Function `konto-loeschen`.

-- ---------------------------------------------------------------------------
-- Firmen: eine Zeile je Firma und Berater
-- ---------------------------------------------------------------------------
create table if not exists public.bav_firmen (
  id           uuid primary key default gen_random_uuid(),
  besitzer     uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  -- Modell, Durchfuehrungsweg, Versicherer, Texte — siehe bav-beratung.ts.
  angebot      jsonb not null default '{}'::jsonb,
  logo         text,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint angebot_objekt  check (jsonb_typeof(angebot) = 'object'),
  constraint angebot_groesse check (pg_column_size(angebot) < 32768),
  -- Das Logo gehoert zu genau dieser Firma: <besitzer>/<id>-<24 hex>.png|webp.
  constraint logo_eigene_firma check (
    logo is null
    or logo ~ ('^' || besitzer::text || '/' || id::text || '-[0-9a-f]{24}\.(png|webp)$')
  )
);

comment on table public.bav_firmen is
  'bAV-Mitarbeiterberatung: Firmen und ihr Angebot (Modell, Versicherer, Texte). Nur fuer den Berater.';
comment on column public.bav_firmen.logo is
  'Pfad im privaten Bucket bav-firmenlogos, oder null.';

create index if not exists bav_firmen_besitzer_idx on public.bav_firmen (besitzer, name);

-- ---------------------------------------------------------------------------
-- Beratungen: eine Zeile je Mitarbeiter und Gespraech
-- ---------------------------------------------------------------------------
create table if not exists public.bav_beratungen (
  id           uuid primary key default gen_random_uuid(),
  besitzer     uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  firma        uuid not null references public.bav_firmen (id) on delete cascade,
  -- Fuer Liste und Uebersicht; dieselbe Angabe steht auch in `daten`.
  mitarbeiter  text not null default '' check (char_length(mitarbeiter) <= 120),
  status       text not null default 'offen' check (status in ('offen', 'teilnahme', 'verzicht')),
  daten        jsonb not null default '{}'::jsonb,
  beraten_am   date,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint daten_objekt  check (jsonb_typeof(daten) = 'object'),
  constraint daten_groesse check (pg_column_size(daten) < 65536)
);

comment on table public.bav_beratungen is
  'bAV-Mitarbeiterberatung: Angaben und Entscheidung je Mitarbeiter (nur Eingaben). Nur fuer den Berater.';

create index if not exists bav_beratungen_firma_idx    on public.bav_beratungen (firma, erstellt_am);
create index if not exists bav_beratungen_besitzer_idx on public.bav_beratungen (besitzer);

-- geaendert_am fortschreiben und den Besitzer festhalten — genau das tut die
-- Triggerfunktion der Szenarien schon (Spalten gleichen Namens).
create trigger bav_firmen_geaendert_am
  before update on public.bav_firmen
  for each row execute function public.szenarien_geaendert_am();

create trigger bav_beratungen_geaendert_am
  before update on public.bav_beratungen
  for each row execute function public.szenarien_geaendert_am();

-- ---------------------------------------------------------------------------
-- Hoechstzahlen je Konto — gegen Missbrauch des Kontos als Ablage. Ohne
-- security definer: gezaehlt werden nur eigene Zeilen.
-- ---------------------------------------------------------------------------
create or replace function public.bav_firmen_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.bav_firmen where besitzer = new.besitzer) >= 200 then
    raise exception 'Es sind hoechstens 200 Firmen je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bav_firmen_anzahl
  before insert on public.bav_firmen
  for each row execute function public.bav_firmen_anzahl_pruefen();

create or replace function public.bav_beratungen_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.bav_beratungen where besitzer = new.besitzer) >= 5000 then
    raise exception 'Es sind hoechstens 5000 Beratungen je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bav_beratungen_anzahl
  before insert on public.bav_beratungen
  for each row execute function public.bav_beratungen_anzahl_pruefen();

-- ---------------------------------------------------------------------------
-- Row Level Security — nur die eigenen Zeilen.
-- ---------------------------------------------------------------------------
alter table public.bav_firmen     enable row level security;
alter table public.bav_firmen     force row level security;
alter table public.bav_beratungen enable row level security;
alter table public.bav_beratungen force row level security;

create policy "eigene firmen lesen" on public.bav_firmen
  for select to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigene firmen anlegen" on public.bav_firmen
  for insert to authenticated
  with check ((select auth.uid()) = besitzer);

-- Mit "with check": sonst liesse sich die eigene Zeile einem fremden Konto zuschieben.
create policy "eigene firmen aendern" on public.bav_firmen
  for update to authenticated
  using ((select auth.uid()) = besitzer)
  with check ((select auth.uid()) = besitzer);

create policy "eigene firmen loeschen" on public.bav_firmen
  for delete to authenticated
  using ((select auth.uid()) = besitzer);

-- Eine Beratung zeigt nur auf eine EIGENE Firma. Der Fremdschluessel allein
-- reicht nicht: Er prueft an der Row Level Security vorbei, ob es die Firma
-- gibt — mit einer erratenen ID haenge die Beratung sonst an einer fremden.
create policy "eigene beratungen lesen" on public.bav_beratungen
  for select to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigene beratungen anlegen" on public.bav_beratungen
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_firmen f
                 where f.id = firma and f.besitzer = (select auth.uid()))
  );

create policy "eigene beratungen aendern" on public.bav_beratungen
  for update to authenticated
  using ((select auth.uid()) = besitzer)
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_firmen f
                 where f.id = firma and f.besitzer = (select auth.uid()))
  );

create policy "eigene beratungen loeschen" on public.bav_beratungen
  for delete to authenticated
  using ((select auth.uid()) = besitzer);

-- Die Vorgaben von Supabase (alle Rechte inkl. TRUNCATE) aktiv entziehen —
-- siehe die Begruendung bei den Szenarien.
revoke all on public.bav_firmen     from anon, authenticated;
revoke all on public.bav_beratungen from anon, authenticated;
grant select, insert, update, delete on public.bav_firmen     to authenticated;
grant select, insert, update, delete on public.bav_beratungen to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket fuer Firmenlogos: privat, hoechstens 1 MB, nur PNG und WebP.
--
-- Kein SVG: Es kann Skripte tragen. Der Browser zeichnet jedes Logo vor dem
-- Hochladen neu (kleiner, ohne EXIF-Daten) — wie beim Logo fuers Gutachten.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bav-firmenlogos', 'bav-firmenlogos', false, 1048576, array['image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Darf diese Datei hochgeladen werden?
--
-- SECURITY INVOKER: Der Nutzer sieht seine eigenen Firmen und Dateien
-- ohnehin — mehr braucht die Pruefung nicht. Geprueft wird:
--   * der Pfad: <eigene ID>/<Firma>-<24 hex>.png|webp — der eigene Ordner,
--     die ID einer EIGENEN Firma und ein Zufallsname;
--   * die Anzahl: hoechstens 400 Dateien im eigenen Ordner (200 Firmen, je
--     ein Logo und eines im Wechsel).
-- Ohne Anmeldung ist auth.uid() null, das Muster damit null — abgelehnt.
-- CASE statt AND: Die ID wird erst umgewandelt, wenn das Muster passt.
-- ---------------------------------------------------------------------------
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
                    and f.besitzer = (select auth.uid()))
         and (select count(*)
                from storage.objects o
               where o.bucket_id = 'bav-firmenlogos'
                 and o.name like (select auth.uid())::text || '/%') < 400
    else false
  end;
$$;

revoke all on function public.bav_logo_pfad_erlaubt(text) from public, anon;
grant execute on function public.bav_logo_pfad_erlaubt(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies auf storage.objects — nur fuer diesen Bucket.
--
-- Kein UPDATE: Ein neues Logo bekommt einen neuen Zufallsnamen. So zeigt
-- kein Zwischenspeicher ein altes Logo, und Ueberschreiben braucht es nicht.
-- ---------------------------------------------------------------------------
create policy "firmenlogo hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bav-firmenlogos' and public.bav_logo_pfad_erlaubt(name));

-- Lesen (Laden, Auflisten zum Aufraeumen) und Loeschen: nur im eigenen Ordner.
create policy "firmenlogo eigene lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'bav-firmenlogos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "firmenlogo eigene loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bav-firmenlogos' and split_part(name, '/', 1) = (select auth.uid())::text);
