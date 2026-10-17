-- Ihr Auftritt im Gutachten: Logo, Firma, Name und Kontakt des Beraters.
--
-- WOZU. Das Gutachten geht an den Mandanten. Mit eingerichtetem Auftritt
-- traegt das Deckblatt das Logo und die Angaben des Beraters, jede Seite eine
-- Fusszeile mit Namen und Seitenzahl. Ohne Auftritt bleibt alles wie bisher.
--
-- JE NUTZER, NICHT JE BUERO: Das funktioniert schon im Test, wenn es noch
-- kein Buero gibt, und die Zugriffsregeln bleiben einfach. Im Team laedt
-- jeder das Firmenlogo einmal selbst hoch.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Hier
-- entstehen nur eine neue Tabelle, ein neuer Bucket und neue Policies; die
-- Live-Seite kennt beides nicht und ignoriert es.
--
-- LOESCHEN. Die Zeile geht mit dem Konto (Kaskade). Das Logo nicht —
-- Dateien lassen sich nur ueber die Storage-API loeschen (Trigger
-- storage.protect_delete). Deshalb leert die Edge Function `konto-loeschen`
-- den Ordner des Nutzers, und der Browser entfernt alte Logos selbst.

-- ---------------------------------------------------------------------------
-- Tabelle: eine Zeile je Nutzer
-- ---------------------------------------------------------------------------
create table if not exists public.berater_profil (
  besitzer     uuid primary key default auth.uid()
               references auth.users (id) on delete cascade,
  firma        text not null default '' check (char_length(firma)   <= 120),
  berater      text not null default '' check (char_length(berater) <= 120),
  telefon      text not null default '' check (char_length(telefon) <= 40),
  email        text not null default '' check (char_length(email)   <= 254),
  web          text not null default '' check (char_length(web)     <= 200),
  zusatz       text not null default '' check (char_length(zusatz)  <= 300),
  farbe        text check (farbe ~ '^#[0-9a-f]{6}$'),
  logo         text,
  geaendert_am timestamptz not null default now(),

  -- Das Logo liegt nur im eigenen Ordner: <besitzer>/logo-<24 hex>.png|webp.
  -- Ein fremder Pfad liesse sich ohnehin nicht laden (Policy unten), stuende
  -- dann aber als kaputter Verweis in der Zeile.
  constraint logo_eigener_ordner check (
    logo is null or logo ~ ('^' || besitzer::text || '/logo-[0-9a-f]{24}\.(png|webp)$')
  )
);

comment on table public.berater_profil is
  'Auftritt des Beraters im Gutachten (Logo, Firma, Kontakt). Eine Zeile je Nutzer.';
comment on column public.berater_profil.logo is
  'Pfad im privaten Bucket branding, oder null.';

-- geaendert_am fortschreiben und den Besitzer festhalten — genau das tut die
-- Triggerfunktion der Szenarien schon (Spalten gleichen Namens).
create trigger berater_profil_geaendert_am
  before update on public.berater_profil
  for each row execute function public.szenarien_geaendert_am();

-- ---------------------------------------------------------------------------
-- Row Level Security — wie bei den Szenarien: nur die eigene Zeile.
-- ---------------------------------------------------------------------------
alter table public.berater_profil enable row level security;
alter table public.berater_profil force row level security;

create policy "eigenes profil lesen" on public.berater_profil
  for select to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigenes profil anlegen" on public.berater_profil
  for insert to authenticated
  with check ((select auth.uid()) = besitzer);

-- Mit "with check": sonst liesse sich die eigene Zeile einem fremden Konto zuschieben.
create policy "eigenes profil aendern" on public.berater_profil
  for update to authenticated
  using ((select auth.uid()) = besitzer)
  with check ((select auth.uid()) = besitzer);

create policy "eigenes profil loeschen" on public.berater_profil
  for delete to authenticated
  using ((select auth.uid()) = besitzer);

-- Die Vorgaben von Supabase (alle Rechte inkl. TRUNCATE) aktiv entziehen —
-- siehe die Begruendung bei den Szenarien.
revoke all on public.berater_profil from anon, authenticated;
grant select, insert, update, delete on public.berater_profil to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket: privat, hoechstens 1 MB, nur PNG und WebP.
--
-- Kein SVG: Es kann Skripte tragen. Der Browser zeichnet jedes Logo vor dem
-- Hochladen neu (kleiner, ohne EXIF-Daten) und speichert es als PNG oder
-- WebP — beides mit Transparenz.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 1048576, array['image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Darf diese Datei hochgeladen werden?
--
-- SECURITY INVOKER: Der Nutzer sieht seine eigenen Dateien ohnehin (Policy
-- unten) — mehr braucht die Zaehlung nicht. Geprueft wird:
--   * der Pfad: <eigene ID>/logo-<24 hex>.png|webp — genau ein Ordner, der
--     eigene, und ein Zufallsname;
--   * die Anzahl: hoechstens 3 Dateien im eigenen Ordner. Der Browser haelt
--     es bei hoechstens zwei (neues Logo, bevor das alte entfernt ist).
-- Ohne Anmeldung ist auth.uid() null, das Muster damit null — abgelehnt.
-- ---------------------------------------------------------------------------
create or replace function public.branding_pfad_erlaubt(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_name ~ ('^' || (select auth.uid())::text || '/logo-[0-9a-f]{24}\.(png|webp)$')
    and (select count(*)
           from storage.objects o
          where o.bucket_id = 'branding'
            and o.name like (select auth.uid())::text || '/%') < 3,
    false);
$$;

revoke all on function public.branding_pfad_erlaubt(text) from public, anon;
grant execute on function public.branding_pfad_erlaubt(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies auf storage.objects — nur fuer diesen Bucket.
--
-- Kein UPDATE: Ein neues Logo bekommt einen neuen Zufallsnamen. So zeigt
-- kein Zwischenspeicher ein altes Logo, und Ueberschreiben braucht es nicht.
-- ---------------------------------------------------------------------------
create policy "branding hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.branding_pfad_erlaubt(name));

-- Lesen (Laden, Auflisten zum Aufraeumen) und Loeschen: nur im eigenen Ordner.
create policy "branding eigene lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "branding eigene loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and split_part(name, '/', 1) = (select auth.uid())::text);
