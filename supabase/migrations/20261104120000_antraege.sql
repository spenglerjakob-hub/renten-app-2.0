-- Anträge: die Angaben für den Antrag nach „Lösungen annehmen“.
--
-- ABLAUF. Der Berater nimmt im Rechner Lösungen an und erfasst in der
-- Etappe „Abschluss“, was der Versicherer für den Antrag braucht:
-- Bezugsrecht im Todesfall je Lösung, Bankverbindung und eine Kopie des
-- Personalausweises. Was er nicht weiß, fragt er beim Kunden über einen
-- Link ab — wie beim Vorsorge-Check: ohne Konto, einmal absendbar, 30 Tage.
--
-- WARUM NICHT IM SZENARIO. Das Szenario liegt im Browser, geht in jeden
-- Export und in die gespeicherten Pläne. IBAN und Ausweiskopie gehören dort
-- nicht hin. Sie stehen hier, hinter Row Level Security, und gehen spätestens
-- 90 Tage nach dem Anlegen — samt Ausweiskopien.
--
-- SCHUTZ — dieselben Regeln wie beim Vorsorge-Check:
--   * Der Kunde (anon) liest nichts: weder den Antrag noch seine eigene
--     Einreichung noch die Ausweiskopie. Ein weitergeleiteter Link verrät
--     also keine Angaben. Er erfährt nur, WELCHE Angaben offen sind und für
--     welche Lösungen (Art und Anbieter, ohne Beträge und ohne Namen).
--   * Eingereicht wird mit einem gültigen, noch nicht genutzten Code. Der
--     Code ist eine zufällige UUID (122 Bit), erzeugt von der Datenbank.
--   * Lesen, ändern und löschen darf nur der Berater, dem der Antrag gehört.
--     Code, Frist, offene Felder und Eingang setzt nicht die Oberfläche,
--     sondern die Funktionen unten — der Berater kann keinen Code wählen.

-- ---------------------------------------------------------------------------
-- Prüfziffer der IBAN (ISO 13616, Modulo 97). Im nicht veröffentlichten
-- Schema `privat`: nicht als /rest/v1/rpc/… aufrufbar.
-- ---------------------------------------------------------------------------
create schema if not exists privat;
revoke all on schema privat from public, anon, authenticated;

create or replace function privat.iban_gueltig(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  r text;
  c text;
  rest integer := 0;
begin
  if v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return false;
  end if;
  -- Deutschland: immer 22 Stellen.
  if left(v, 2) = 'DE' and length(v) <> 22 then
    return false;
  end if;
  -- Die ersten vier Zeichen ans Ende, Buchstaben als Zahlen (A = 10 … Z = 35),
  -- dann Stelle für Stelle modulo 97 — ohne eine 30-stellige Zahl zu bilden.
  r := substr(v, 5) || substr(v, 1, 4);
  for i in 1 .. length(r) loop
    c := substr(r, i, 1);
    if c between '0' and '9' then
      rest := (rest * 10 + c::integer) % 97;
    else
      rest := (rest * 100 + (ascii(c) - 55)) % 97;
    end if;
  end loop;
  return rest = 1;
end;
$$;

revoke all on function privat.iban_gueltig(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------
create table if not exists public.antraege (
  id              uuid primary key default gen_random_uuid(),
  besitzer        uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  -- Nur für die Liste des Beraters („Familie Muster“). Der Kunde sieht ihn nie.
  kunde           text not null default '',
  -- Abbild der angenommenen Angebote: [{id, art, anbieter, inhaber, …}].
  loesungen       jsonb not null default '[]'::jsonb,
  -- Die Angaben des Beraters: {bezugsrecht: {<id>: 1–4}, bank: {inhaber, iban}}.
  angaben         jsonb not null default '{}'::jsonb,
  -- Der Link an den Kunden: Code, Frist und die Felder, nach denen er fragt.
  code            uuid unique,
  link_bis        timestamptz,
  offen           text[] not null default '{}',
  -- Was der Kunde eingereicht hat — bis der Berater es übernimmt.
  eingang         jsonb,
  eingegangen_am  timestamptz,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),

  constraint kunde_laenge       check (char_length(kunde) <= 120),
  constraint loesungen_liste    check (jsonb_typeof(loesungen) = 'array' and jsonb_array_length(loesungen) <= 12),
  constraint loesungen_groesse  check (pg_column_size(loesungen) < 32768),
  constraint angaben_objekt     check (jsonb_typeof(angaben) = 'object'),
  constraint angaben_groesse    check (pg_column_size(angaben) < 16384),
  constraint eingang_objekt     check (eingang is null or jsonb_typeof(eingang) = 'object'),
  constraint eingang_groesse    check (eingang is null or pg_column_size(eingang) < 16384),
  constraint offen_felder       check (offen <@ array['bezugsrecht', 'bank', 'ausweis']::text[]),
  constraint link_vollstaendig  check ((code is null) = (link_bis is null)),
  -- Der Link lebt nie länger als der Antrag selbst (90 Tage ab Anlegen).
  constraint link_frist         check (link_bis is null or link_bis <= erstellt_am + interval '90 days')
);

comment on table public.antraege is
  'Angaben für den Antrag (Bezugsrecht, Bankverbindung) zu angenommenen Lösungen. Höchstens 90 Tage.';

create index if not exists antraege_besitzer_idx on public.antraege (besitzer, erstellt_am desc);

-- Geändert am — die Oberfläche setzt es nicht selbst.
create or replace function public.antraege_geaendert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists antraege_geaendert on public.antraege;
create trigger antraege_geaendert
  before update on public.antraege
  for each row execute function public.antraege_geaendert();

-- Höchstzahl je Berater — gegen Missbrauch des Kontos als Ablage. Ohne
-- security definer: gezählt werden nur eigene Zeilen.
create or replace function public.antraege_anzahl_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.antraege where besitzer = new.besitzer) >= 500 then
    raise exception 'Es sind hoechstens 500 Antraege je Konto moeglich.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists antraege_anzahl on public.antraege;
create trigger antraege_anzahl
  before insert on public.antraege
  for each row execute function public.antraege_anzahl_pruefen();

-- ---------------------------------------------------------------------------
-- Row Level Security — nur der Besitzer. FORCE wie bei den Beratungen: Die
-- Funktionen unten gehören `postgres`, das die Policies umgeht (BYPASSRLS).
-- `set row_security = off` an ihnen heisst: Gilt das je nicht mehr, scheitern
-- sie laut, statt still keine Zeile zu finden.
-- ---------------------------------------------------------------------------
alter table public.antraege enable row level security;
alter table public.antraege force row level security;

drop policy if exists "eigene antraege lesen"    on public.antraege;
drop policy if exists "eigene antraege anlegen"  on public.antraege;
drop policy if exists "eigene antraege aendern"  on public.antraege;
drop policy if exists "eigene antraege loeschen" on public.antraege;

create policy "eigene antraege lesen" on public.antraege
  for select to authenticated
  using ((select auth.uid()) = besitzer);

create policy "eigene antraege anlegen" on public.antraege
  for insert to authenticated
  with check ((select auth.uid()) = besitzer and (select public.hat_paket('rente')));

create policy "eigene antraege aendern" on public.antraege
  for update to authenticated
  using ((select auth.uid()) = besitzer)
  with check ((select auth.uid()) = besitzer);

create policy "eigene antraege loeschen" on public.antraege
  for delete to authenticated
  using ((select auth.uid()) = besitzer);

-- Rechte: erst alles entziehen (Supabase vergibt im public-Schema auch
-- TRUNCATE, und das unterliegt keiner Row Level Security), dann genau das,
-- was die Oberfläche braucht. Code, Frist, offene Felder und Eingang sind
-- NICHT dabei — die setzen nur die Funktionen unten.
revoke all on public.antraege from anon, authenticated;
grant select on public.antraege to authenticated;
grant insert (kunde, loesungen, angaben) on public.antraege to authenticated;
grant update (kunde, loesungen, angaben) on public.antraege to authenticated;
grant delete on public.antraege to authenticated;

-- ---------------------------------------------------------------------------
-- Für den Berater: Link erstellen, zurückziehen, Eingang übernehmen.
--
-- SECURITY DEFINER, weil Code, Frist, offene Felder und Eingang für die
-- Oberfläche gesperrt sind. Jede Funktion prüft selbst, dass der Antrag dem
-- Aufrufer gehört — `besitzer = auth.uid()` steht in jeder WHERE-Klausel.
-- ---------------------------------------------------------------------------
create or replace function public.antrag_link_erstellen(p_antrag uuid, p_offen text[])
returns table (code uuid, link_bis timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
#variable_conflict use_column
declare
  v_offen text[];
begin
  select coalesce(array_agg(distinct x order by x), '{}') into v_offen
    from unnest(coalesce(p_offen, '{}')) as x;
  if cardinality(v_offen) = 0 or not (v_offen <@ array['bezugsrecht', 'bank', 'ausweis']::text[]) then
    raise exception 'Unbekannte oder keine offenen Felder' using errcode = 'check_violation';
  end if;
  if not (select public.hat_paket('rente')) then
    raise exception 'Kein Zugang' using errcode = 'insufficient_privilege';
  end if;

  -- Ein neuer Code ersetzt einen alten, solange noch nichts eingegangen ist.
  -- Unterlagen unter dem alten Code werden damit verwaist und nachts
  -- entfernt (Edge Function `antrag-dokumente`).
  return query
  update public.antraege a
     set code = gen_random_uuid(),
         link_bis = least(now() + interval '30 days', a.erstellt_am + interval '90 days'),
         offen = v_offen
   where a.id = p_antrag
     and a.besitzer = (select auth.uid())
     and a.eingegangen_am is null
     and a.erstellt_am + interval '90 days' > now() + interval '1 day'
  returning a.code, a.link_bis;
end;
$$;

create or replace function public.antrag_link_zurueckziehen(p_antrag uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  n integer;
begin
  update public.antraege a
     set code = null, link_bis = null, offen = '{}'
   where a.id = p_antrag
     and a.besitzer = (select auth.uid())
     and a.eingegangen_am is null
     and a.code is not null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Übernimmt die Angaben (vom Berater zusammengeführt) und löscht den Eingang:
-- Die Angaben des Kunden stehen danach nur noch an einer Stelle.
create or replace function public.antrag_eingang_uebernehmen(p_antrag uuid, p_angaben jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  n integer;
begin
  if p_angaben is null or jsonb_typeof(p_angaben) <> 'object' then
    raise exception 'Angaben muessen ein Objekt sein' using errcode = 'check_violation';
  end if;
  update public.antraege a
     set angaben = p_angaben, eingang = null
   where a.id = p_antrag
     and a.besitzer = (select auth.uid())
     and a.eingang is not null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.antrag_link_erstellen(uuid, text[])      from public, anon;
revoke all on function public.antrag_link_zurueckziehen(uuid)          from public, anon;
revoke all on function public.antrag_eingang_uebernehmen(uuid, jsonb)  from public, anon;
grant execute on function public.antrag_link_erstellen(uuid, text[])     to authenticated;
grant execute on function public.antrag_link_zurueckziehen(uuid)         to authenticated;
grant execute on function public.antrag_eingang_uebernehmen(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Für den Kunden: Link prüfen und einreichen.
--
-- SECURITY DEFINER, und zwar bewusst: Der Kunde ist nicht angemeldet und
-- darf die Tabelle nicht lesen. Beide Funktionen nehmen EINEN Code und geben
-- nur heraus, was die Seite braucht. Sie antworten mit einem Status statt
-- mit einer Ausnahme — die Seite zeigt dann den passenden Satz.
-- ---------------------------------------------------------------------------
create or replace function public.antrag_link_pruefen(p_code uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select coalesce(
    (select case
              when a.eingegangen_am is not null then jsonb_build_object('status', 'eingereicht')
              when a.link_bis <= now() then jsonb_build_object('status', 'abgelaufen')
              else jsonb_build_object(
                'status', 'offen',
                'offen', to_jsonb(a.offen),
                'bis', a.link_bis,
                -- Nur Art und Anbieter: keine Beträge, keine Namen.
                'loesungen', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', l ->> 'id', 'art', l ->> 'art', 'anbieter', coalesce(l ->> 'anbieter', ''))
                         order by o)
                    from jsonb_array_elements(a.loesungen) with ordinality as e(l, o)
                ), '[]'::jsonb)
              )
            end
       from public.antraege a
      where a.code = p_code),
    jsonb_build_object('status', 'ungueltig')
  );
$$;

create or replace function public.antrag_einreichen(p_code uuid, p_angaben jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  a public.antraege;
  v_ids text[];
  v_eingang jsonb := '{}'::jsonb;
  v_bezug jsonb;
  v_bank jsonb;
  v_inhaber text;
  v_iban text;
  v_schluessel text;
begin
  select * into a from public.antraege where code = p_code for update;
  if not found then return 'ungueltig'; end if;
  if a.eingegangen_am is not null then return 'eingereicht'; end if;
  if a.link_bis <= now() then return 'abgelaufen'; end if;
  if p_angaben is null or jsonb_typeof(p_angaben) <> 'object' or pg_column_size(p_angaben) >= 16384 then
    return 'angaben';
  end if;

  -- Nur, wonach gefragt ist: ein Feld ausserhalb von `offen` lehnt die Funktion ab.
  for v_schluessel in select jsonb_object_keys(p_angaben) loop
    if not (v_schluessel = any (a.offen)) or v_schluessel = 'ausweis' then
      return 'angaben';
    end if;
  end loop;

  if 'bezugsrecht' = any (a.offen) then
    v_bezug := p_angaben -> 'bezugsrecht';
    select coalesce(array_agg(l ->> 'id'), '{}') into v_ids from jsonb_array_elements(a.loesungen) l;
    if v_bezug is null or jsonb_typeof(v_bezug) <> 'object' then return 'angaben'; end if;
    -- Genau die Lösungen des Antrags, je eine Wahl 1–4.
    if (select count(*) from jsonb_object_keys(v_bezug)) <> cardinality(v_ids) then return 'angaben'; end if;
    for v_schluessel in select jsonb_object_keys(v_bezug) loop
      if not (v_schluessel = any (v_ids))
         or jsonb_typeof(v_bezug -> v_schluessel) <> 'number'
         or (v_bezug ->> v_schluessel) not in ('1', '2', '3', '4') then
        return 'angaben';
      end if;
    end loop;
    v_eingang := v_eingang || jsonb_build_object('bezugsrecht', v_bezug);
  end if;

  if 'bank' = any (a.offen) then
    v_bank := p_angaben -> 'bank';
    if v_bank is null or jsonb_typeof(v_bank) <> 'object' then return 'angaben'; end if;
    v_inhaber := btrim(coalesce(v_bank ->> 'inhaber', ''));
    v_iban := upper(regexp_replace(coalesce(v_bank ->> 'iban', ''), '\s', '', 'g'));
    if char_length(v_inhaber) not between 2 and 120 or not privat.iban_gueltig(v_iban) then
      return 'angaben';
    end if;
    v_eingang := v_eingang || jsonb_build_object('bank', jsonb_build_object('inhaber', v_inhaber, 'iban', v_iban));
  end if;

  -- Die Ausweiskopie liegt schon im Speicher (hochgeladen unter dem Code).
  if 'ausweis' = any (a.offen) and not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'antrag-dokumente' and o.name like p_code::text || '/%'
  ) then
    return 'ausweis';
  end if;

  update public.antraege
     set eingang = v_eingang, eingegangen_am = now()
   where id = a.id;
  return 'ok';
end;
$$;

revoke all on function public.antrag_link_pruefen(uuid)       from public;
revoke all on function public.antrag_einreichen(uuid, jsonb)  from public;
grant execute on function public.antrag_link_pruefen(uuid)      to anon, authenticated, service_role;
grant execute on function public.antrag_einreichen(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ausweiskopien: Bucket und Policies.
--
-- Pfade: der Berater `<antrag-id>/<zufall>.jpg`, der Kunde `<code>/<zufall>.jpg`.
-- Nur JPEG — die Seite verkleinert jedes Bild, kodiert es neu (ohne
-- Metadaten) und legt das Wasserzeichen „KOPIE“ darüber. Höchstens vier
-- Dateien je Ordner (Vorder- und Rückseite, ein zweiter Versuch).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('antrag-dokumente', 'antrag-dokumente', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SECURITY DEFINER aus demselben Grund wie oben: Der Kunde darf weder Anträge
-- noch Dateien lesen, die Policy braucht aber beides.
create or replace function public.antrag_dokument_erlaubt(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_ordner uuid;
  v_erlaubt boolean;
begin
  if p_name is null or p_name !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,80}\.jpg$'
  then
    return false;
  end if;
  v_ordner := split_part(p_name, '/', 1)::uuid;

  select exists (
    -- Der Berater: sein eigener Antrag.
    select 1 from public.antraege a
     where a.id = v_ordner and a.besitzer = (select auth.uid())
    union all
    -- Der Kunde: ein offener Link, der nach der Ausweiskopie fragt.
    select 1 from public.antraege a
     where a.code = v_ordner
       and a.link_bis > now()
       and a.eingegangen_am is null
       and 'ausweis' = any (a.offen)
  ) into v_erlaubt;
  if not v_erlaubt then return false; end if;

  return (select count(*) from storage.objects o
           where o.bucket_id = 'antrag-dokumente' and o.name like v_ordner::text || '/%') < 4;
end;
$$;

revoke all on function public.antrag_dokument_erlaubt(text) from public;
grant execute on function public.antrag_dokument_erlaubt(text) to anon, authenticated;

drop policy if exists "antrag dokumente hochladen" on storage.objects;
drop policy if exists "antrag dokumente lesen"     on storage.objects;
drop policy if exists "antrag dokumente loeschen"  on storage.objects;

create policy "antrag dokumente hochladen" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'antrag-dokumente' and public.antrag_dokument_erlaubt(name));

-- Lesen: nur der Besitzer — den Ordner seines Antrags immer, den des Kunden
-- erst nach dem Eingang. Die Row Level Security der Anträge laesst ohnehin
-- nur eigene Zeilen sehen; `name` ist die Spalte von storage.objects.
create policy "antrag dokumente lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'antrag-dokumente'
    and exists (
      select 1 from public.antraege a
       where a.besitzer = (select auth.uid())
         and (a.id::text = split_part(name, '/', 1)
              or (a.code::text = split_part(name, '/', 1) and a.eingegangen_am is not null))
    )
  );

-- Löschen (über die Storage-API): dieselben Dateien, die der Besitzer lesen darf.
create policy "antrag dokumente loeschen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'antrag-dokumente'
    and exists (
      select 1 from public.antraege a
       where a.besitzer = (select auth.uid())
         and (a.id::text = split_part(name, '/', 1)
              or (a.code::text = split_part(name, '/', 1) and a.eingegangen_am is not null))
    )
  );

-- Verwaiste Dateien: ihr Ordner ist weder ein Antrag noch dessen Code.
-- NUR fuer die Service-Rolle (Edge Function).
create or replace function public.antrag_dokumente_verwaist(p_grenze integer default 1000)
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'antrag-dokumente'
     and not exists (
       select 1 from public.antraege a
        where a.id::text = split_part(o.name, '/', 1)
           or a.code::text = split_part(o.name, '/', 1)
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_grenze, 1000), 1000));
$$;

revoke all on function public.antrag_dokumente_verwaist(integer) from public, anon, authenticated;
grant execute on function public.antrag_dokumente_verwaist(integer) to service_role;

-- Die Edge Function darf auch über FORCE hinweg lesen, was sie aufräumt.
grant select on public.antraege to service_role;

-- ---------------------------------------------------------------------------
-- Löschfrist: spätestens 90 Tage nach dem Anlegen, täglich um 03:37 Uhr (UTC).
-- Die Ausweiskopien werden damit verwaist und zehn Minuten später von der
-- Edge Function entfernt. Benannte Jobs: erneutes Einspielen ersetzt sie.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function privat.antraege_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  n integer;
begin
  delete from public.antraege where erstellt_am < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function privat.antraege_aufraeumen() from public, anon, authenticated;

select cron.schedule('antraege-aufraeumen', '37 3 * * *', $$select privat.antraege_aufraeumen()$$);

select cron.schedule(
  'antrag-dokumente-aufraeumen',
  '47 3 * * *',
  $$select net.http_post(
      url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/antrag-dokumente',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"aktion": "aufraeumen"}'::jsonb,
      timeout_milliseconds := 30000
    )$$
);
