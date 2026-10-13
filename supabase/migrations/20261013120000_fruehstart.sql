-- Early Adopter („Fruehstart"): drei Monate alles kostenlos, dafuer Rueckmeldungen.
--
-- PERSOENLICHE LINKS: Der Betreiber erstellt je Teilnehmer einen Link
-- (`/?fruehstart=<Token>`), 30 Tage einloesbar, fuer genau ein Konto. Wer ihn
-- einloest, ist Fruehstarter. Dauerhaft freie Konten (Bestand, Betreiber)
-- loesen nicht ein — der Link bleibt fuer jemand anderen.
--
-- DREI MONATE AB DEM START: frei bis greatest(Einloesung, abo_pflicht_ab)
-- + 3 Monate. Vor dem Start ist ohnehin alles frei; die drei Monate zaehlen
-- danach, wie bei der Testphase. Danach endet der Zugang wie eine Testphase;
-- als Dank gibt es bei der Buchung einen Rabatt (Stripe, Schritt 4).
--
-- RUECKMELDUNGEN kann jedes angemeldete Konto geben; von Fruehstartern sind
-- sie erbeten (die Oberflaeche erinnert alle vier Wochen). Jede neue geht per
-- Mail an den Betreiber (Edge Function `rueckmeldung-benachrichtigung`).
--
-- Wer was darf, entscheidet weiter allein `mein_zugang()`. Fruehstart kommt
-- nach dem Freizugang und vor dem Buero-Abo.

-- ---------------------------------------------------------------------------
-- Tabellen (privat: nicht ueber die Data API erreichbar)
-- ---------------------------------------------------------------------------
create table if not exists privat.fruehstart_links (
  token          uuid primary key default gen_random_uuid(),
  -- Fuer wen der Link ist — nur fuer den Betreiber sichtbar.
  notiz          text not null default '' check (char_length(notiz) <= 200),
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '30 days',
  eingeloest_von uuid references auth.users (id) on delete set null,
  eingeloest_am  timestamptz
);

create table if not exists privat.fruehstarter (
  nutzer uuid primary key references auth.users (id) on delete cascade,
  seit   timestamptz not null default now(),
  monate integer not null default 3 check (monate between 1 and 24),
  link   uuid references privat.fruehstart_links (token) on delete set null
);

create table if not exists privat.rueckmeldungen (
  -- UUID statt laufender Nummer: Die Benachrichtigung ist ohne Schluessel
  -- aufrufbar; eine Kennung, die niemand erraten kann, ist ihr Schutz.
  id                uuid primary key default gen_random_uuid(),
  nutzer            uuid not null references auth.users (id) on delete cascade,
  erstellt_am       timestamptz not null default now(),
  bewertung         smallint check (bewertung between 1 and 5),
  text              text not null default '' check (char_length(text) <= 4000),
  kontakt_ok        boolean not null default false,
  seite             text not null default '' check (char_length(seite) <= 200),
  benachrichtigt_am timestamptz
);
create index if not exists rueckmeldungen_nutzer_idx on privat.rueckmeldungen (nutzer, erstellt_am desc);

alter table privat.fruehstart_links enable row level security;
alter table privat.fruehstarter     enable row level security;
alter table privat.rueckmeldungen   enable row level security;
revoke all on privat.fruehstart_links, privat.fruehstarter, privat.rueckmeldungen
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hilfe: Ist das angemeldete Konto der Betreiber?
-- ---------------------------------------------------------------------------
create or replace function privat.ist_betreiber()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privat.freizugaenge f where f.nutzer = auth.uid() and f.grund = 'betreiber')
$$;
revoke all on function privat.ist_betreiber() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Der Zugang — wie bisher, dazu der Fruehstart
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

  v_vorab := v_e.abo_pflicht_ab is null or now() < v_e.abo_pflicht_ab;
  if v_e.abo_pflicht_ab is not null then
    v_test_bis := greatest(v_erstellt, v_e.abo_pflicht_ab) + make_interval(days => v_e.testtage);
    if v_fs_seit is not null then
      v_fs_bis := greatest(v_fs_seit, v_e.abo_pflicht_ab) + make_interval(months => v_fs_monate);
    end if;
  end if;

  if v_vorab then
    v_paket := 'alles'; v_quelle := 'vorab';
  elsif v_frei is not null then
    v_paket := 'alles'; v_quelle := 'frei';
  elsif now() < v_fs_bis then
    v_paket := 'alles'; v_quelle := 'fruehstart'; v_bis := v_fs_bis;
  elsif v_m.paket is not null and privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze then
    v_paket := v_m.paket; v_quelle := 'abo'; v_bis := coalesce(v_m.kuendigung_zum, v_m.laeuft_bis);
  elsif now() < v_test_bis then
    v_paket := 'alles'; v_quelle := 'test'; v_bis := v_test_bis;
  end if;

  return jsonb_build_object(
    'paket',               v_paket,
    'quelle',              v_quelle,
    'bis',                 v_bis,
    'test_bis',            v_test_bis,
    'abo_pflicht_ab',      v_e.abo_pflicht_ab,
    'zahlung_bereit',      coalesce(v_e.zahlung_bereit, false),
    'freizugang',          v_frei,
    'betreiber',           coalesce(v_frei = 'betreiber', false),
    'fruehstart',          v_fs_seit is not null,
    'fruehstart_bis',      v_fs_bis,
    'letzte_rueckmeldung', (select max(r.erstellt_am) from privat.rueckmeldungen r where r.nutzer = v_nutzer),
    'buero',               v_m.buero,
    'buero_name',          v_m.name,
    'rolle',               v_m.rolle,
    'hat_platz',           coalesce(privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze, false),
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
-- Links: erstellen, auflisten, zurueckziehen (Betreiber), einloesen (jeder)
-- ---------------------------------------------------------------------------
create or replace function public.fruehstart_link_erstellen(p_notiz text default '')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not privat.ist_betreiber() then
    raise exception 'Nur fuer den Betreiber' using errcode = '42501';
  end if;
  insert into privat.fruehstart_links (notiz) values (left(coalesce(trim(p_notiz), ''), 200))
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.fruehstart_links()
returns table (token uuid, notiz text, erstellt_am timestamptz, gueltig_bis timestamptz,
               eingeloest_am timestamptz, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.token, l.notiz, l.erstellt_am, l.gueltig_bis, l.eingeloest_am, u.email::text
    from privat.fruehstart_links l
    left join auth.users u on u.id = l.eingeloest_von
   where privat.ist_betreiber()
   order by l.erstellt_am desc
   limit 200;
$$;

create or replace function public.fruehstart_link_zurueckziehen(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.fruehstart_links l
     set gueltig_bis = least(l.gueltig_bis, now())
   where l.token = p_token and l.eingeloest_am is null and privat.ist_betreiber();
$$;

-- Antwort statt Ausnahme: ok | ungueltig | abgelaufen | schon_dabei | frei
create or replace function public.fruehstart_einloesen(p_token uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_l privat.fruehstart_links%rowtype;
begin
  if auth.uid() is null then
    return 'ungueltig';
  end if;
  select * into v_l from privat.fruehstart_links l where l.token = p_token for update;
  if not found then
    return 'ungueltig';
  end if;
  if exists (select 1 from privat.fruehstarter f where f.nutzer = auth.uid()) then
    return 'schon_dabei';
  end if;
  if v_l.eingeloest_am is not null then
    return 'ungueltig';
  end if;
  if v_l.gueltig_bis <= now() then
    return 'abgelaufen';
  end if;
  if exists (select 1 from privat.freizugaenge f where f.nutzer = auth.uid()) then
    return 'frei';
  end if;
  insert into privat.fruehstarter (nutzer, link) values (auth.uid(), p_token);
  update privat.fruehstart_links set eingeloest_von = auth.uid(), eingeloest_am = now() where token = p_token;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Rueckmeldungen: senden (jeder), auflisten (Betreiber)
-- ---------------------------------------------------------------------------
create or replace function public.rueckmeldung_senden(
  p_bewertung integer, p_text text, p_kontakt_ok boolean default false, p_seite text default '')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_bewertung is not null and p_bewertung not between 1 and 5 then
    raise exception 'Bewertung von 1 bis 5' using errcode = '22023';
  end if;
  if p_bewertung is null and coalesce(trim(p_text), '') = '' then
    raise exception 'Leere Rueckmeldung' using errcode = '22023';
  end if;
  -- Gegen Versehen und Missbrauch: hoechstens zehn am Tag.
  if (select count(*) from privat.rueckmeldungen r
       where r.nutzer = auth.uid() and r.erstellt_am > now() - interval '1 day') >= 10 then
    raise exception 'Zu viele Rueckmeldungen an einem Tag' using errcode = 'P0001';
  end if;
  insert into privat.rueckmeldungen (nutzer, bewertung, text, kontakt_ok, seite)
  values (auth.uid(), p_bewertung, left(coalesce(trim(p_text), ''), 4000), coalesce(p_kontakt_ok, false),
          left(coalesce(p_seite, ''), 200));
end;
$$;

create or replace function public.rueckmeldungen()
returns table (id uuid, erstellt_am timestamptz, email text, bewertung smallint, text text,
               kontakt_ok boolean, seite text, fruehstarter boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.erstellt_am, u.email::text, r.bewertung, r.text, r.kontakt_ok, r.seite,
         exists (select 1 from privat.fruehstarter f where f.nutzer = r.nutzer)
    from privat.rueckmeldungen r
    join auth.users u on u.id = r.nutzer
   where privat.ist_betreiber()
   order by r.erstellt_am desc
   limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Benachrichtigung: Trigger → pg_net → Edge Function (nur Service-Rolle liest)
-- ---------------------------------------------------------------------------
-- Beansprucht die Mail zu einer Rueckmeldung — hoechstens einmal — und
-- liefert, was sie braucht: Inhalt, Absender, die Adressen des Betreibers.
create or replace function public.rueckmeldung_beanspruchen(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r privat.rueckmeldungen%rowtype;
begin
  update privat.rueckmeldungen set benachrichtigt_am = now()
   where id = p_id and benachrichtigt_am is null
  returning * into v_r;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id',           v_r.id,
    'erstellt_am',  v_r.erstellt_am,
    'bewertung',    v_r.bewertung,
    'text',         v_r.text,
    'kontakt_ok',   v_r.kontakt_ok,
    'seite',        v_r.seite,
    'autor',        (select u.email::text from auth.users u where u.id = v_r.nutzer),
    'fruehstarter', exists (select 1 from privat.fruehstarter f where f.nutzer = v_r.nutzer),
    'betreiber',    coalesce((select jsonb_agg(u.email::text)
                                from privat.freizugaenge f join auth.users u on u.id = f.nutzer
                               where f.grund = 'betreiber'), '[]'::jsonb)
  );
end;
$$;

-- Schlug der Versand fehl: freigeben, damit ein neuer Aufruf es noch einmal versucht.
create or replace function public.rueckmeldung_freigeben(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.rueckmeldungen set benachrichtigt_am = null where id = p_id;
$$;

create or replace function privat.rueckmeldung_melden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/rueckmeldung-benachrichtigung',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('rueckmeldung', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;
revoke all on function privat.rueckmeldung_melden() from public, anon, authenticated;

create or replace trigger rueckmeldung_melden
  after insert on privat.rueckmeldungen
  for each row execute function privat.rueckmeldung_melden();

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke all on function public.mein_zugang()                                         from public, anon;
revoke all on function public.fruehstart_link_erstellen(text)                       from public, anon;
revoke all on function public.fruehstart_links()                                    from public, anon;
revoke all on function public.fruehstart_link_zurueckziehen(uuid)                   from public, anon;
revoke all on function public.fruehstart_einloesen(uuid)                            from public, anon;
revoke all on function public.rueckmeldung_senden(integer, text, boolean, text)     from public, anon;
revoke all on function public.rueckmeldungen()                                      from public, anon;
grant execute on function public.mein_zugang()                                      to authenticated;
grant execute on function public.fruehstart_link_erstellen(text)                    to authenticated;
grant execute on function public.fruehstart_links()                                 to authenticated;
grant execute on function public.fruehstart_link_zurueckziehen(uuid)                to authenticated;
grant execute on function public.fruehstart_einloesen(uuid)                         to authenticated;
grant execute on function public.rueckmeldung_senden(integer, text, boolean, text)  to authenticated;
grant execute on function public.rueckmeldungen()                                   to authenticated;

revoke all on function public.rueckmeldung_beanspruchen(uuid) from public, anon, authenticated;
revoke all on function public.rueckmeldung_freigeben(uuid)    from public, anon, authenticated;
grant execute on function public.rueckmeldung_beanspruchen(uuid) to service_role;
grant execute on function public.rueckmeldung_freigeben(uuid)    to service_role;
