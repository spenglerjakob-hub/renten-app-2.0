-- bAV-Mitarbeiterberatung: Unterschrift am Bildschirm.
--
-- WOZU. Am Ende der Beratung unterschreiben Mitarbeiter und Berater am
-- Bildschirm (einfache elektronische Signatur): der Mitarbeiter einmal fuer
-- Protokoll und Vereinbarung bzw. Verzicht, der Berater fuer das Protokoll.
-- Der Arbeitgeber unterschreibt weiter auf Papier.
--
-- FESTGESCHRIEBEN wird das fertige Dokument. Bei der ersten Unterschrift
-- legt der Browser die Unterlagen so ab, wie sie gedruckt wuerden (HTML, die
-- Logos eingebettet); gedruckt wird spaeter genau diese Fassung. Neue
-- Rechenwerte, Texte oder ein geaendertes Angebot der Firma aendern sie
-- nicht. Anders als sonst in dieser Datenbank stehen hier also auch
-- Ergebnisse: Was unterschrieben ist, muss so bleiben.
--
-- UNVERAENDERLICH. Zeitpunkte und Pruefsummen setzt die Datenbank. Aendern
-- laesst sich nichts, nur als Ganzes loeschen („Unterschriften aufheben“).
-- Solange es Unterlagen gibt, ist die Beratung gesperrt.
--
-- GESPEICHERT wird von der Unterschrift nur der Linienzug als SVG-Pfad —
-- keine Schreibdynamik wie Druck oder Tempo.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Es
-- entstehen zwei Tabellen, eine Funktion und ein Trigger, der nur
-- Beratungen mit Unterschrift betrifft.
--
-- LOESCHEN. Mit der Beratung, ihrer Firma und dem Konto (Kaskade) und beim
-- Aufheben der Unterschriften.

-- ---------------------------------------------------------------------------
-- Die festgeschriebenen Unterlagen: eine Zeile je Beratung
-- ---------------------------------------------------------------------------
create table if not exists public.bav_unterlagen (
  beratung     uuid primary key references public.bav_beratungen (id) on delete cascade,
  besitzer     uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  -- Die Dokumente als HTML, so wie sie gedruckt werden — ohne die Unterschriften selbst.
  protokoll    text not null,
  vereinbarung text,
  verzicht     text,
  -- SHA-256 je Dokument, von der Datenbank gerechnet: {"protokoll": "…", "vereinbarung": "…"}
  pruefsummen  jsonb not null default '{}'::jsonb,
  erstellt_am  timestamptz not null default now(),

  -- Zur Teilnahme gehoert die Vereinbarung, zum Verzicht die Erklaerung — genau eines.
  constraint ein_zweites_dokument check ((vereinbarung is null) <> (verzicht is null)),
  constraint protokoll_groesse    check (char_length(protokoll) between 200 and 2000000),
  constraint vereinbarung_groesse check (vereinbarung is null or char_length(vereinbarung) between 200 and 1000000),
  constraint verzicht_groesse     check (verzicht is null or char_length(verzicht) between 200 and 1000000)
);

comment on table public.bav_unterlagen is
  'bAV-Mitarbeiterberatung: die unterschriebenen Unterlagen, festgeschrieben bei der ersten Unterschrift. Nur fuer den Berater.';

create index if not exists bav_unterlagen_besitzer_idx on public.bav_unterlagen (besitzer);

-- ---------------------------------------------------------------------------
-- Die Unterschriften: eine Zeile je Person
-- ---------------------------------------------------------------------------
create table if not exists public.bav_unterschriften (
  id                uuid primary key default gen_random_uuid(),
  -- Wer die Unterlagen loescht, loescht ihre Unterschriften mit.
  beratung          uuid not null references public.bav_unterlagen (beratung) on delete cascade,
  besitzer          uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  person            text not null check (person in ('mitarbeiter', 'berater')),
  name              text not null check (char_length(btrim(name)) between 1 and 120),
  -- Der Linienzug als SVG-Pfad: nur M, L, Q und Zahlen.
  zug               text not null check (char_length(zug) between 10 and 60000 and zug ~ '^M[0-9MLQ. ]+$'),
  -- Welche Unterlagen die Unterschrift abdeckt — von der Datenbank gesetzt.
  dokumente         text[] not null default '{}',
  unterschrieben_am timestamptz not null default now(),

  constraint eine_je_person unique (beratung, person)
);

comment on table public.bav_unterschriften is
  'bAV-Mitarbeiterberatung: Unterschriften am Bildschirm (Linienzug, Name, Zeitpunkt). Nur fuer den Berater.';

create index if not exists bav_unterschriften_besitzer_idx on public.bav_unterschriften (besitzer);

-- ---------------------------------------------------------------------------
-- Festschreiben: Zeitpunkt und Pruefsummen von der Datenbank, und nur nach
-- einer Entscheidung, mit dem passenden zweiten Dokument. Ohne security
-- definer: Gelesen wird nur die eigene Beratung.
-- ---------------------------------------------------------------------------
create or replace function public.bav_unterlagen_festschreiben()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select b.status into v_status from public.bav_beratungen b where b.id = new.beratung;
  if v_status is null or v_status = 'offen' then
    raise exception 'Unterschrieben wird erst nach der Entscheidung (Teilnahme oder Verzicht).'
      using errcode = 'check_violation';
  end if;
  if (v_status = 'teilnahme') <> (new.vereinbarung is not null) then
    raise exception 'Das zweite Dokument passt nicht zur Entscheidung.'
      using errcode = 'check_violation';
  end if;
  new.erstellt_am := now();
  new.pruefsummen := jsonb_strip_nulls(jsonb_build_object(
    'protokoll',    encode(sha256(convert_to(new.protokoll, 'UTF8')), 'hex'),
    'vereinbarung', case when new.vereinbarung is not null
                      then encode(sha256(convert_to(new.vereinbarung, 'UTF8')), 'hex') end,
    'verzicht',     case when new.verzicht is not null
                      then encode(sha256(convert_to(new.verzicht, 'UTF8')), 'hex') end
  ));
  return new;
end;
$$;

create trigger bav_unterlagen_festschreiben
  before insert on public.bav_unterlagen
  for each row execute function public.bav_unterlagen_festschreiben();

-- Zeitpunkt und abgedeckte Unterlagen setzt die Datenbank: der Mitarbeiter
-- alle, der Berater das Protokoll.
create or replace function public.bav_unterschrift_eintragen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_teilnahme boolean;
begin
  select u.vereinbarung is not null into v_teilnahme from public.bav_unterlagen u where u.beratung = new.beratung;
  if not found then
    raise exception 'Zu dieser Beratung gibt es keine festgeschriebenen Unterlagen.'
      using errcode = 'foreign_key_violation';
  end if;
  new.name := btrim(new.name);
  new.unterschrieben_am := now();
  new.dokumente := case new.person
    when 'berater' then array['protokoll']
    else array['protokoll', case when v_teilnahme then 'vereinbarung' else 'verzicht' end]
  end;
  return new;
end;
$$;

create trigger bav_unterschrift_eintragen
  before insert on public.bav_unterschriften
  for each row execute function public.bav_unterschrift_eintragen();

-- ---------------------------------------------------------------------------
-- Die Sperre: Ist unterschrieben, bleibt die Beratung, wie sie ist — bis auf
-- den Schritt, an dem sie zuletzt offen war. Beratungen ohne Unterschrift
-- betrifft das nicht.
-- ---------------------------------------------------------------------------
create or replace function public.bav_beratung_sperre_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.bav_unterlagen u where u.beratung = old.id)
     and ((old.daten - 'schritt') is distinct from (new.daten - 'schritt')
          or new.status      is distinct from old.status
          or new.mitarbeiter is distinct from old.mitarbeiter
          or new.firma       is distinct from old.firma
          or new.beraten_am  is distinct from old.beraten_am) then
    raise exception 'Die Beratung ist unterschrieben und gesperrt. Zum Aendern erst die Unterschriften aufheben.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bav_beratungen_sperre
  before update on public.bav_beratungen
  for each row execute function public.bav_beratung_sperre_pruefen();

-- ---------------------------------------------------------------------------
-- Unterschreiben in einem Zug: Gibt es noch keine Unterlagen, werden sie mit
-- der ersten Unterschrift festgeschrieben — beides in einer Transaktion.
-- SECURITY INVOKER: Es gelten die Policies des Aufrufers.
-- ---------------------------------------------------------------------------
create or replace function public.bav_unterschreiben(
  p_beratung     uuid,
  p_person       text,
  p_name         text,
  p_zug          text,
  p_protokoll    text default null,
  p_vereinbarung text default null,
  p_verzicht     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not exists (select 1 from public.bav_unterlagen u where u.beratung = p_beratung) then
    insert into public.bav_unterlagen (beratung, protokoll, vereinbarung, verzicht)
    values (p_beratung, p_protokoll, p_vereinbarung, p_verzicht);
  end if;
  insert into public.bav_unterschriften (beratung, person, name, zug)
  values (p_beratung, p_person, p_name, p_zug)
  returning jsonb_build_object('person', person, 'name', name, 'zug', zug, 'dokumente', dokumente,
                               'unterschrieben_am', unterschrieben_am)
    into v;
  return v;
end;
$$;

revoke all on function public.bav_unterschreiben(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.bav_unterschreiben(uuid, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — nur die eigenen Zeilen. Kein UPDATE: Was
-- festgeschrieben ist, bleibt so. Unterschriften gehen nur mit ihren
-- Unterlagen (Kaskade).
-- ---------------------------------------------------------------------------
alter table public.bav_unterlagen     enable row level security;
alter table public.bav_unterlagen     force row level security;
alter table public.bav_unterschriften enable row level security;
alter table public.bav_unterschriften force row level security;

create policy "eigene unterlagen lesen" on public.bav_unterlagen
  for select to authenticated
  using ((select auth.uid()) = besitzer);

-- Nur zu einer EIGENEN Beratung — der Fremdschluessel allein prueft an der
-- Row Level Security vorbei.
create policy "eigene unterlagen anlegen" on public.bav_unterlagen
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_beratungen b
                 where b.id = bav_unterlagen.beratung and b.besitzer = (select auth.uid()))
  );

create policy "eigene unterlagen loeschen" on public.bav_unterlagen
  for delete to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigene unterschriften lesen" on public.bav_unterschriften
  for select to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigene unterschriften anlegen" on public.bav_unterschriften
  for insert to authenticated
  with check (
    (select auth.uid()) = besitzer
    and exists (select 1 from public.bav_unterlagen u
                 where u.beratung = bav_unterschriften.beratung and u.besitzer = (select auth.uid()))
  );

revoke all on public.bav_unterlagen     from anon, authenticated;
revoke all on public.bav_unterschriften from anon, authenticated;
grant select, insert, delete on public.bav_unterlagen     to authenticated;
grant select, insert         on public.bav_unterschriften to authenticated;
