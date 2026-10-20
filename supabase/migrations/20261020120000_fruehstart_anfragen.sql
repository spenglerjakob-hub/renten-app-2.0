-- Early Adopter: Anfrage auf der Preisseite statt nur persoenlicher Links.
--
-- WIE ES LAEUFT. Auf /preise steht das Early-Adopter-Angebot. Direkt
-- teilnehmen kann dort niemand — man schickt eine Anfrage (Name, E-Mail,
-- optional Buero und Zahl der Berater). Der Betreiber bekommt eine Mail und
-- sieht die Anfrage in „Abo & Team“. Sagt er zu, entsteht ein persoenlicher
-- Early-Adopter-Link wie bisher (privat.fruehstart_links); den schickt er
-- selbst per Mail. Einloesen, drei Monate ab dem Start und Rueckmeldungen
-- bleiben unveraendert (…_fruehstart.sql).
--
-- OHNE KONTO ERREICHBAR, deshalb abgesichert:
--   * nur ueber `fruehstart_anfrage_senden` (SECURITY DEFINER), Tabelle
--     selbst ohne Zugriff;
--   * Laengen und E-Mail-Form geprueft;
--   * hoechstens eine offene Anfrage je Adresse — eine zweite gilt als
--     angekommen, ohne neue Zeile und ohne Hinweis, dass es sie schon gab;
--   * hoechstens 30 Anfragen in der Stunde insgesamt.
--   * KEINE automatische Antwort an die eingetragene Adresse: Sonst liesse
--     sich das Formular nutzen, um Fremden Mails zu schicken.
--
-- LOESCHEN. Anfragen gehen nach 180 Tagen (Cron), unabhaengig vom Ausgang.
-- Ein daraus entstandener Link bleibt, bis er eingeloest oder abgelaufen ist.
--
-- ABWAERTSKOMPATIBEL: neue Tabelle und neue Funktionen; die Live-Seite kennt
-- beides nicht.

-- ---------------------------------------------------------------------------
-- Tabelle (privat: nicht ueber die Data API erreichbar)
-- ---------------------------------------------------------------------------
create table if not exists privat.fruehstart_anfragen (
  -- UUID statt laufender Nummer: Die Benachrichtigung ist ohne Schluessel
  -- aufrufbar; eine Kennung, die niemand erraten kann, ist ihr Schutz.
  id                uuid primary key default gen_random_uuid(),
  erstellt_am       timestamptz not null default now(),
  name              text not null check (char_length(name) between 1 and 120),
  email             text not null check (char_length(email) between 3 and 254),
  buero             text not null default '' check (char_length(buero) <= 200),
  berater           integer check (berater between 1 and 500),
  status            text not null default 'offen' check (status in ('offen', 'zugesagt', 'abgesagt')),
  entschieden_am    timestamptz,
  link              uuid references privat.fruehstart_links (token) on delete set null,
  benachrichtigt_am timestamptz
);
create index if not exists fruehstart_anfragen_email_idx on privat.fruehstart_anfragen (email, erstellt_am desc);
create index if not exists fruehstart_anfragen_zeit_idx on privat.fruehstart_anfragen (erstellt_am desc);

alter table privat.fruehstart_anfragen enable row level security;
revoke all on privat.fruehstart_anfragen from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anfrage senden — ohne Konto
-- ---------------------------------------------------------------------------
create or replace function public.fruehstart_anfrage_senden(
  p_name text, p_email text, p_buero text default '', p_berater integer default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_buero text := trim(coalesce(p_buero, ''));
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Name fehlt oder ist zu lang' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ungueltige E-Mail-Adresse' using errcode = '22023';
  end if;
  if char_length(v_buero) > 200 then
    raise exception 'Buero zu lang' using errcode = '22023';
  end if;
  if p_berater is not null and p_berater not between 1 and 500 then
    raise exception 'Zahl der Berater von 1 bis 500' using errcode = '22023';
  end if;

  -- Schon eine offene Anfrage mit dieser Adresse: gilt als angekommen.
  if exists (select 1 from privat.fruehstart_anfragen a where a.email = v_email and a.status = 'offen') then
    return;
  end if;
  -- Gegen Massenversand: hoechstens 30 in der Stunde, insgesamt.
  if (select count(*) from privat.fruehstart_anfragen a where a.erstellt_am > now() - interval '1 hour') >= 30 then
    raise exception 'Zu viele Anfragen' using errcode = 'P0001';
  end if;

  insert into privat.fruehstart_anfragen (name, email, buero, berater)
  values (v_name, v_email, v_buero, p_berater);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fuer den Betreiber: auflisten, zusagen, absagen
-- ---------------------------------------------------------------------------
create or replace function public.fruehstart_anfragen()
returns table (id uuid, erstellt_am timestamptz, name text, email text, buero text, berater integer,
               status text, entschieden_am timestamptz, link uuid, link_gueltig_bis timestamptz,
               eingeloest_am timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.erstellt_am, a.name, a.email, a.buero, a.berater, a.status, a.entschieden_am,
         a.link, l.gueltig_bis, l.eingeloest_am
    from privat.fruehstart_anfragen a
    left join privat.fruehstart_links l on l.token = a.link
   where privat.ist_betreiber()
   order by (a.status = 'offen') desc, a.erstellt_am desc
   limit 200;
$$;

-- Zusagen: legt den persoenlichen Link an und gibt ihn zurueck. Ein zweiter
-- Aufruf liefert denselben Link, solange er noch einloesbar ist.
create or replace function public.fruehstart_anfrage_zusagen(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a     privat.fruehstart_anfragen%rowtype;
  v_token uuid;
begin
  if not privat.ist_betreiber() then
    raise exception 'Nur fuer den Betreiber' using errcode = '42501';
  end if;
  select * into v_a from privat.fruehstart_anfragen a where a.id = p_id for update;
  if not found then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if v_a.link is not null and exists (
       select 1 from privat.fruehstart_links l
        where l.token = v_a.link and l.eingeloest_am is null and l.gueltig_bis > now()) then
    return v_a.link;
  end if;
  insert into privat.fruehstart_links (notiz)
  values (left(v_a.name || case when v_a.buero <> '' then ', ' || v_a.buero else '' end || ' (Anfrage)', 200))
  returning token into v_token;
  update privat.fruehstart_anfragen
     set status = 'zugesagt', entschieden_am = now(), link = v_token
   where id = p_id;
  return v_token;
end;
$$;

create or replace function public.fruehstart_anfrage_absagen(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privat.ist_betreiber() then
    raise exception 'Nur fuer den Betreiber' using errcode = '42501';
  end if;
  update privat.fruehstart_anfragen
     set status = 'abgesagt', entschieden_am = now()
   where id = p_id and status = 'offen';
end;
$$;

-- ---------------------------------------------------------------------------
-- Benachrichtigung: Trigger → pg_net → Edge Function (nur Service-Rolle liest)
-- Dasselbe Muster wie bei den Rueckmeldungen.
-- ---------------------------------------------------------------------------
create or replace function public.fruehstart_anfrage_beanspruchen(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a privat.fruehstart_anfragen%rowtype;
begin
  update privat.fruehstart_anfragen set benachrichtigt_am = now()
   where id = p_id and benachrichtigt_am is null
  returning * into v_a;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id',          v_a.id,
    'erstellt_am', v_a.erstellt_am,
    'name',        v_a.name,
    'email',       v_a.email,
    'buero',       v_a.buero,
    'berater',     v_a.berater,
    'betreiber',   coalesce((select jsonb_agg(u.email::text)
                               from privat.freizugaenge f join auth.users u on u.id = f.nutzer
                              where f.grund = 'betreiber'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fruehstart_anfrage_freigeben(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.fruehstart_anfragen set benachrichtigt_am = null where id = p_id;
$$;

create or replace function privat.fruehstart_anfrage_melden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/fruehstart-anfrage-benachrichtigung',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('anfrage', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;
revoke all on function privat.fruehstart_anfrage_melden() from public, anon, authenticated;

create or replace trigger fruehstart_anfrage_melden
  after insert on privat.fruehstart_anfragen
  for each row execute function privat.fruehstart_anfrage_melden();

-- ---------------------------------------------------------------------------
-- Nach 180 Tagen loeschen — nachts, zehn Minuten nach dem Aufraeumen der Checks.
-- ---------------------------------------------------------------------------
create or replace function privat.fruehstart_anfragen_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from privat.fruehstart_anfragen a where a.erstellt_am < now() - interval '180 days';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
revoke all on function privat.fruehstart_anfragen_aufraeumen() from public, anon, authenticated;

select cron.schedule('fruehstart-anfragen-aufraeumen', '27 3 * * *', $$select privat.fruehstart_anfragen_aufraeumen()$$);

-- ---------------------------------------------------------------------------
-- Rechte. Supabase vergibt Execute auf neue Funktionen im public-Schema
-- standardmaessig an alle — deshalb ausdruecklich entziehen und gezielt geben.
-- ---------------------------------------------------------------------------
revoke all on function public.fruehstart_anfrage_senden(text, text, text, integer) from public;
grant execute on function public.fruehstart_anfrage_senden(text, text, text, integer) to anon, authenticated;

revoke all on function public.fruehstart_anfragen()               from public, anon;
revoke all on function public.fruehstart_anfrage_zusagen(uuid)    from public, anon;
revoke all on function public.fruehstart_anfrage_absagen(uuid)    from public, anon;
grant execute on function public.fruehstart_anfragen()            to authenticated;
grant execute on function public.fruehstart_anfrage_zusagen(uuid) to authenticated;
grant execute on function public.fruehstart_anfrage_absagen(uuid) to authenticated;

revoke all on function public.fruehstart_anfrage_beanspruchen(uuid) from public, anon, authenticated;
revoke all on function public.fruehstart_anfrage_freigeben(uuid)    from public, anon, authenticated;
grant execute on function public.fruehstart_anfrage_beanspruchen(uuid) to service_role;
grant execute on function public.fruehstart_anfrage_freigeben(uuid)    to service_role;
