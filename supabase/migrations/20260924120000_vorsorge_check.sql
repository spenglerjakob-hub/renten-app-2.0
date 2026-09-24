-- Vorsorge-Check: Ein Berater fordert Angaben an, der Kunde reicht sie ein.
--
-- ABLAUF. Der Berater legt im Rechner eine Anfrage an und bekommt einen
-- Link mit deren Code. Der Kunde oeffnet den Link OHNE Konto, fuellt den
-- Check aus und reicht ihn ein. Der Eingang landet ausschliesslich beim
-- Berater, dem der Code gehoert.
--
-- SCHUTZ. Wie bei den Szenarien ist Row Level Security die einzige
-- Schutzschicht (der oeffentliche Schluessel steckt im Bundle). Dazu gilt:
--   * Der Kunde (Rolle anon) darf NUR einreichen — nichts lesen, auch nicht
--     die eigene Einreichung, und keine Anfrage sehen.
--   * Eingereicht werden kann nur mit einem gueltigen, noch nicht genutzten
--     Code. Der Code ist eine zufaellige UUID (122 Bit) und nicht erratbar.
--   * Lesen und loeschen darf nur der Berater, dem die Anfrage gehoert.
--
-- Gespeichert werden wie bei den Szenarien nur EINGABEN, keine Ergebnisse.
-- Ein Eingang ist ein Zwischenlager: Der Berater uebernimmt ihn in den
-- Rechner, danach wird er geloescht.

create table if not exists public.check_anfragen (
  code        uuid primary key default gen_random_uuid(),
  berater     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  -- Nur fuer die Liste des Beraters („Familie Muster"). Der Kunde sieht ihn nie.
  kunde       text not null default '',
  erstellt_am timestamptz not null default now(),
  gueltig_bis timestamptz not null default now() + interval '30 days',

  constraint kunde_laenge check (char_length(kunde) <= 120),
  constraint gueltigkeit  check (gueltig_bis > erstellt_am
                                 and gueltig_bis <= erstellt_am + interval '180 days')
);

comment on table public.check_anfragen is
  'Vom Berater angeforderte Vorsorge-Checks. Der Code steht im Link an den Kunden.';

create index if not exists check_anfragen_berater_idx
  on public.check_anfragen (berater, erstellt_am desc);

create table if not exists public.check_eingaenge (
  id              uuid primary key default gen_random_uuid(),
  -- UNIQUE: Ein Link laesst sich genau einmal einreichen.
  code            uuid not null unique
                  references public.check_anfragen (code) on delete cascade,
  daten           jsonb not null,
  eingegangen_am  timestamptz not null default now(),

  constraint daten_objekt  check (jsonb_typeof(daten) = 'object'),
  constraint daten_groesse check (pg_column_size(daten) < 262144)
);

comment on table public.check_eingaenge is
  'Eingereichte Vorsorge-Checks (Szenario-JSON). Zwischenlager bis zur Uebernahme durch den Berater.';

-- Hoechstzahl offener Anfragen je Berater — gegen Missbrauch des Kontos als
-- Ablage. Ohne security definer: gezaehlt werden nur eigene Zeilen.
create or replace function public.check_anfragen_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  anzahl integer;
begin
  select count(*) into anzahl from public.check_anfragen where berater = new.berater;
  if anzahl >= 500 then
    raise exception 'Es sind hoechstens 500 offene Anfragen je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists check_anfragen_anzahl on public.check_anfragen;
create trigger check_anfragen_anzahl
  before insert on public.check_anfragen
  for each row execute function public.check_anfragen_anzahl_pruefen();

-- ---------------------------------------------------------------------------
-- Ist ein Code einreichbar?
--
-- SECURITY DEFINER, und zwar bewusst: Der Kunde ist nicht angemeldet und
-- darf die Anfragen-Tabelle nicht lesen — sonst koennte er alle Codes
-- auflisten. Die Funktion beantwortet fuer EINEN Code nur ja oder nein, gibt
-- keine Zeile heraus und prueft nichts, was man nicht ohnehin durch Einreichen
-- erfuehre. Sie dient zweimal:
--   * der Policy unten, damit nur gueltige Codes eingereicht werden koennen,
--   * der Seite, damit der Kunde einen abgelaufenen Link VOR dem Ausfuellen
--     erkennt und nicht erst beim Absenden.
-- search_path leer, alle Namen voll qualifiziert.
-- ---------------------------------------------------------------------------
create or replace function public.check_code_gueltig(p_code uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.check_anfragen a
    where a.code = p_code
      and a.gueltig_bis > now()
      and not exists (select 1 from public.check_eingaenge e where e.code = p_code)
  );
$$;

revoke all on function public.check_code_gueltig(uuid) from public;
grant execute on function public.check_code_gueltig(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- OHNE force row level security, anders als bei den Szenarien: Die
-- Pruefung oben laeuft mit den Rechten des Tabelleneigentuemers. Mit force
-- unterlaege auch er den Policies, faende keine Zeile und lehnte jeden Code
-- ab. Fuer anon und authenticated aendert das nichts — fuer sie gelten die
-- Policies so oder so.
alter table public.check_anfragen  enable row level security;
alter table public.check_eingaenge enable row level security;

drop policy if exists "eigene anfragen lesen"     on public.check_anfragen;
drop policy if exists "eigene anfragen anlegen"   on public.check_anfragen;
drop policy if exists "eigene anfragen loeschen"  on public.check_anfragen;

create policy "eigene anfragen lesen" on public.check_anfragen
  for select to authenticated
  using ((select auth.uid()) = berater);

create policy "eigene anfragen anlegen" on public.check_anfragen
  for insert to authenticated
  with check ((select auth.uid()) = berater);

create policy "eigene anfragen loeschen" on public.check_anfragen
  for delete to authenticated
  using ((select auth.uid()) = berater);

-- Kein Update: Code, Berater und Frist aendern sich nicht. Wer eine neue Frist
-- braucht, legt eine neue Anfrage an.

drop policy if exists "mit gueltigem code einreichen" on public.check_eingaenge;
drop policy if exists "eigene eingaenge lesen"         on public.check_eingaenge;
drop policy if exists "eigene eingaenge loeschen"      on public.check_eingaenge;

-- Einreichen duerfen Kunden ohne Konto — und angemeldete Nutzer, etwa ein
-- Berater, der seinen eigenen Link ausprobiert.
create policy "mit gueltigem code einreichen" on public.check_eingaenge
  for insert to anon, authenticated
  with check (public.check_code_gueltig(code));

create policy "eigene eingaenge lesen" on public.check_eingaenge
  for select to authenticated
  using (exists (
    select 1 from public.check_anfragen a
    where a.code = check_eingaenge.code and a.berater = (select auth.uid())
  ));

create policy "eigene eingaenge loeschen" on public.check_eingaenge
  for delete to authenticated
  using (exists (
    select 1 from public.check_anfragen a
    where a.code = check_eingaenge.code and a.berater = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Rechte. Dieselbe Falle wie bei den Szenarien: Supabase vergibt im
-- public-Schema standardmaessig ALLE Rechte, auch TRUNCATE, und TRUNCATE
-- unterliegt keiner Row Level Security. Deshalb erst alles entziehen, dann
-- genau das vergeben, was die Policies abdecken.
-- ---------------------------------------------------------------------------
revoke all on public.check_anfragen  from anon, authenticated;
revoke all on public.check_eingaenge from anon, authenticated;

grant select, insert, delete on public.check_anfragen  to authenticated;
grant insert                 on public.check_eingaenge to anon;
grant select, insert, delete on public.check_eingaenge to authenticated;
