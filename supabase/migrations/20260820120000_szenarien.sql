-- Gespeicherte Szenarien des Rentenplaners.
--
-- Entwurfsgrundsatz: Der Browser spricht direkt mit der Datenbank, es gibt
-- keine eigene API mehr dazwischen. Damit ist Row Level Security die EINZIGE
-- Schutzschicht. Der Anon-Key ist oeffentlich — das ist bei Supabase so
-- vorgesehen —, also muessen die Policies vollstaendig sein.
--
-- Gespeichert werden ausschliesslich EINGABEN, niemals Rechenergebnisse.
-- Eine Aktualisierung des Rechtsstands bewertet dadurch alle gespeicherten
-- Szenarien automatisch neu.

create table if not exists public.szenarien (
  id             uuid primary key default gen_random_uuid(),
  besitzer       uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  name           text not null,
  daten          jsonb not null,
  schema_version integer not null default 1,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now(),

  constraint name_laenge   check (char_length(name) between 1 and 120),
  constraint daten_objekt  check (jsonb_typeof(daten) = 'object'),
  -- Ein Szenario umfasst wenige Kilobyte. Die Grenze verhindert, dass das
  -- eigene Konto als Dateiablage zweckentfremdet wird.
  constraint daten_groesse check (pg_column_size(daten) < 262144)
);

comment on table  public.szenarien is 'Eingaben des Rentenplaners je Nutzer. Keine Ergebnisse.';
comment on column public.szenarien.daten is 'Szenario-JSON, validiert gegen @renten/schema.';

create index if not exists szenarien_besitzer_idx
  on public.szenarien (besitzer, geaendert_am desc);

-- geaendert_am fortschreiben
create or replace function public.szenarien_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  -- Der Besitzer darf sich nie aendern, auch nicht versehentlich.
  new.besitzer := old.besitzer;
  return new;
end;
$$;

drop trigger if exists szenarien_geaendert_am on public.szenarien;
create trigger szenarien_geaendert_am
  before update on public.szenarien
  for each row execute function public.szenarien_geaendert_am();

-- Hoechstzahl je Konto
create or replace function public.szenarien_anzahl_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anzahl integer;
begin
  select count(*) into anzahl from public.szenarien where besitzer = new.besitzer;
  if anzahl >= 50 then
    raise exception 'Es sind hoechstens 50 Szenarien je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists szenarien_anzahl on public.szenarien;
create trigger szenarien_anzahl
  before insert on public.szenarien
  for each row execute function public.szenarien_anzahl_pruefen();

-- Row Level Security
alter table public.szenarien enable row level security;

drop policy if exists "eigene lesen"    on public.szenarien;
drop policy if exists "eigene anlegen"  on public.szenarien;
drop policy if exists "eigene aendern"  on public.szenarien;
drop policy if exists "eigene loeschen" on public.szenarien;

create policy "eigene lesen" on public.szenarien
  for select to authenticated
  using (auth.uid() = besitzer);

create policy "eigene anlegen" on public.szenarien
  for insert to authenticated
  with check (auth.uid() = besitzer);

-- Das "with check" ist der Punkt, der gern fehlt: Ohne ihn koennte ein Nutzer
-- seine eigene Zeile auf einen fremden Besitzer umschreiben und sie damit in
-- ein anderes Konto verschieben.
create policy "eigene aendern" on public.szenarien
  for update to authenticated
  using (auth.uid() = besitzer)
  with check (auth.uid() = besitzer);

create policy "eigene loeschen" on public.szenarien
  for delete to authenticated
  using (auth.uid() = besitzer);

-- Anonyme Zugriffe sind nirgends erlaubt: Ohne Policy fuer die Rolle "anon"
-- gibt RLS grundsaetzlich nichts frei.
revoke all on public.szenarien from anon;
grant select, insert, update, delete on public.szenarien to authenticated;
