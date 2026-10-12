-- Abo-Modell, Schritt 2: Bueros mit Nutzerplaetzen, Abos, Einladungen,
-- Freizugaenge — und wer was nutzen darf.
--
-- PAKETE (Preise in packages/schema/src/preise.ts): `alles`, `rente`
-- (Rechner, Gutachten, Vorsorge-Check, Speichern) und `ag` (Arbeitgeber-
-- Seiten). Ein Paket je Buero; der Mengenrabatt haengt an der Zahl der
-- Plaetze, die das Abo in Stripe hat.
--
-- WER WAS DARF entscheidet allein `public.mein_zugang()`, in dieser
-- Reihenfolge:
--   1. vor dem Start (privat.einstellungen.abo_pflicht_ab leer oder in der
--      Zukunft): alle alles — wie bisher;
--   2. Freizugang (Bestandskonten, Betreiber, Partner): alles;
--   3. Buero-Abo (active, trialing, past_due), sofern der Nutzer unter den
--      ersten <Plaetze> Mitgliedern ist (Inhaber zuerst, dann nach Beitritt);
--   4. Testphase: 14 Tage ab Registrierung, fruehestens ab dem Start;
--   5. sonst nichts.
--
-- SERVERSEITIG ERZWUNGEN wird es dort, wo Daten entstehen: Szenarien anlegen
-- und aendern, Kundenlinks anlegen. Lesen und Loeschen eigener Daten bleibt
-- immer moeglich. Die Rechner selbst laufen im Browser — dort sperrt die
-- Zugangsschranke (Schritt 3), mehr ist dort nicht moeglich.
--
-- ALLES IM SCHEMA `privat`: nicht ueber die Data API erreichbar. Gelesen und
-- geschrieben wird nur ueber die Funktionen unten (SECURITY DEFINER, jede
-- prueft auth.uid() bzw. ist der Service-Rolle vorbehalten).

-- ---------------------------------------------------------------------------
-- Einstellungen: genau eine Zeile
-- ---------------------------------------------------------------------------
create table if not exists privat.einstellungen (
  id             boolean primary key default true check (id),
  -- Ab wann ein Paket noetig ist. Leer: noch nicht — alle Konten wie bisher.
  abo_pflicht_ab timestamptz,
  -- Muss zu TESTTAGE in packages/schema/src/preise.ts passen.
  testtage       integer not null default 14 check (testtage between 0 and 90)
);
insert into privat.einstellungen (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Bueros, Mitglieder, Abos, Einladungen, Freizugaenge
-- ---------------------------------------------------------------------------
create table if not exists privat.bueros (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '' check (char_length(name) <= 200),
  -- Ein Konto fuehrt hoechstens ein Buero. Geht das Konto, geht das Buero.
  inhaber      uuid not null unique references auth.users (id) on delete cascade,
  stripe_kunde text unique,
  erstellt_am  timestamptz not null default now()
);

create table if not exists privat.buero_mitglieder (
  buero  uuid not null references privat.bueros (id) on delete cascade,
  -- Ein Konto gehoert hoechstens einem Buero an.
  nutzer uuid not null unique references auth.users (id) on delete cascade,
  rolle  text not null check (rolle in ('inhaber', 'mitglied')),
  seit   timestamptz not null default now(),
  primary key (buero, nutzer)
);

-- Spiegel des Stripe-Abos. Geschrieben nur vom Webhook (Service-Rolle).
create table if not exists privat.abos (
  buero          uuid primary key references privat.bueros (id) on delete cascade,
  stripe_abo     text unique,
  paket          text not null check (paket in ('alles', 'rente', 'ag')),
  intervall      text not null check (intervall in ('monat', 'jahr')),
  plaetze        integer not null check (plaetze between 1 and 500),
  status         text not null,
  laeuft_bis     timestamptz,
  kuendigung_zum timestamptz,
  aktualisiert_am timestamptz not null default now()
);

-- Ein Link je Einladung, einmal einloesbar, sieben Tage gueltig.
create table if not exists privat.einladungen (
  token          uuid primary key default gen_random_uuid(),
  buero          uuid not null references privat.bueros (id) on delete cascade,
  erstellt_von   uuid references auth.users (id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '7 days',
  angenommen_von uuid references auth.users (id) on delete set null,
  angenommen_am  timestamptz
);
create index if not exists einladungen_buero_idx on privat.einladungen (buero);

create table if not exists privat.freizugaenge (
  nutzer uuid primary key references auth.users (id) on delete cascade,
  grund  text not null check (grund in ('bestand', 'betreiber', 'partner')),
  seit   timestamptz not null default now()
);

-- Verteidigung in der Tiefe: RLS an, keine Policies. Die Funktionen laufen
-- als Eigentuemer (BYPASSRLS); anon und authenticated haben auf `privat`
-- ohnehin kein Nutzungsrecht.
alter table privat.einstellungen    enable row level security;
alter table privat.bueros           enable row level security;
alter table privat.buero_mitglieder enable row level security;
alter table privat.abos             enable row level security;
alter table privat.einladungen      enable row level security;
alter table privat.freizugaenge     enable row level security;
revoke all on privat.einstellungen, privat.bueros, privat.buero_mitglieder,
              privat.abos, privat.einladungen, privat.freizugaenge
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
-- Abo-Status, die Zugang geben. past_due: Stripe versucht noch einzuziehen —
-- so lange bleibt der Zugang, sonst sperrte eine abgelaufene Karte sofort.
create or replace function privat.abo_aktiv(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_status in ('active', 'trialing', 'past_due'), false)
$$;

-- Hoechstens so viele Mitglieder, wie das Abo Plaetze hat. Der Inhaber kommt
-- immer hinein (ohne ihn gaebe es das Buero nicht). `for update` sperrt die
-- Abo-Zeile: Zwei gleichzeitig angenommene Einladungen koennen den letzten
-- Platz nicht doppelt vergeben.
create or replace function privat.mitglied_platz_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plaetze integer;
  v_belegt  integer;
begin
  if new.rolle = 'inhaber' then
    return new;
  end if;
  select a.plaetze into v_plaetze
    from privat.abos a
   where a.buero = new.buero and privat.abo_aktiv(a.status)
   for update;
  if v_plaetze is null then
    raise exception 'Dieses Buero hat kein aktives Abo' using errcode = 'check_violation';
  end if;
  select count(*) into v_belegt from privat.buero_mitglieder m where m.buero = new.buero;
  if v_belegt >= v_plaetze then
    raise exception 'Alle % Plaetze sind belegt', v_plaetze using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger mitglied_platz
  before insert on privat.buero_mitglieder
  for each row execute function privat.mitglied_platz_pruefen();

-- ---------------------------------------------------------------------------
-- Der Zugang des angemeldeten Kontos
-- ---------------------------------------------------------------------------
create or replace function public.mein_zugang()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nutzer   uuid := auth.uid();
  v_e        privat.einstellungen%rowtype;
  v_erstellt timestamptz;
  v_frei     text;
  v_m        record;
  v_rang     bigint;
  v_belegt   integer;
  v_vorab    boolean;
  v_test_bis timestamptz;
  v_paket    text;
  v_quelle   text;
  v_bis      timestamptz;
begin
  if v_nutzer is null then
    return null;
  end if;

  select * into v_e from privat.einstellungen where id;
  select u.created_at into v_erstellt from auth.users u where u.id = v_nutzer;
  select f.grund into v_frei from privat.freizugaenge f where f.nutzer = v_nutzer;

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
  if not v_vorab then
    v_test_bis := greatest(v_erstellt, v_e.abo_pflicht_ab) + make_interval(days => v_e.testtage);
  end if;

  if v_vorab then
    v_paket := 'alles'; v_quelle := 'vorab';
  elsif v_frei is not null then
    v_paket := 'alles'; v_quelle := 'frei';
  elsif v_m.paket is not null and privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze then
    v_paket := v_m.paket; v_quelle := 'abo'; v_bis := coalesce(v_m.kuendigung_zum, v_m.laeuft_bis);
  elsif now() < v_test_bis then
    v_paket := 'alles'; v_quelle := 'test'; v_bis := v_test_bis;
  end if;

  return jsonb_build_object(
    'paket',          v_paket,
    'quelle',         v_quelle,
    'bis',            v_bis,
    'test_bis',       v_test_bis,
    'abo_pflicht_ab', v_e.abo_pflicht_ab,
    'betreiber',      coalesce(v_frei = 'betreiber', false),
    'buero',          v_m.buero,
    'buero_name',     v_m.name,
    'rolle',          v_m.rolle,
    'hat_platz',      coalesce(privat.abo_aktiv(v_m.status) and v_rang <= v_m.plaetze, false),
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

-- Fuer die Policies: Deckt der Zugang diesen Teil der Anwendung ab?
create or replace function public.hat_paket(p_bereich text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case public.mein_zugang() ->> 'paket'
      when 'alles' then p_bereich in ('rente', 'ag')
      when 'rente' then p_bereich = 'rente'
      when 'ag'    then p_bereich = 'ag'
      else false
    end,
    false)
$$;

-- ---------------------------------------------------------------------------
-- Team: einladen, annehmen, zurueckziehen, entfernen, austreten, auflisten
-- ---------------------------------------------------------------------------
create or replace function public.einladung_erstellen()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_buero   uuid;
  v_plaetze integer;
  v_belegt  integer;
  v_offen   integer;
  v_token   uuid;
begin
  select m.buero into v_buero
    from privat.buero_mitglieder m
   where m.nutzer = auth.uid() and m.rolle = 'inhaber';
  if v_buero is null then
    raise exception 'Nur der Inhaber eines Bueros kann einladen' using errcode = '42501';
  end if;
  select a.plaetze into v_plaetze
    from privat.abos a where a.buero = v_buero and privat.abo_aktiv(a.status);
  if v_plaetze is null then
    raise exception 'Kein aktives Abo' using errcode = 'P0001';
  end if;
  select count(*) into v_belegt from privat.buero_mitglieder m where m.buero = v_buero;
  if v_belegt >= v_plaetze then
    raise exception 'Alle Plaetze sind belegt' using errcode = 'P0001';
  end if;
  select count(*) into v_offen
    from privat.einladungen e
   where e.buero = v_buero and e.angenommen_von is null and e.gueltig_bis > now();
  if v_offen >= 20 then
    raise exception 'Zu viele offene Einladungen' using errcode = 'P0001';
  end if;
  insert into privat.einladungen (buero, erstellt_von)
  values (v_buero, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;

-- Antwort statt Ausnahme: ok | ungueltig | abgelaufen | schon_im_buero |
-- anderes_buero | kein_abo | voll — die Oberflaeche erklaert jeden Fall.
create or replace function public.einladung_annehmen(p_token uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       privat.einladungen%rowtype;
  v_eigenes uuid;
  v_plaetze integer;
  v_belegt  integer;
begin
  if auth.uid() is null then
    return 'ungueltig';
  end if;
  select * into v_e from privat.einladungen e where e.token = p_token for update;
  if not found or v_e.angenommen_von is not null then
    return 'ungueltig';
  end if;
  if v_e.gueltig_bis <= now() then
    return 'abgelaufen';
  end if;
  select m.buero into v_eigenes from privat.buero_mitglieder m where m.nutzer = auth.uid();
  if v_eigenes is not null then
    return case when v_eigenes = v_e.buero then 'schon_im_buero' else 'anderes_buero' end;
  end if;
  select a.plaetze into v_plaetze
    from privat.abos a where a.buero = v_e.buero and privat.abo_aktiv(a.status)
   for update;
  if v_plaetze is null then
    return 'kein_abo';
  end if;
  select count(*) into v_belegt from privat.buero_mitglieder m where m.buero = v_e.buero;
  if v_belegt >= v_plaetze then
    return 'voll';
  end if;
  insert into privat.buero_mitglieder (buero, nutzer, rolle) values (v_e.buero, auth.uid(), 'mitglied');
  update privat.einladungen set angenommen_von = auth.uid(), angenommen_am = now() where token = p_token;
  return 'ok';
end;
$$;

-- Macht eine offene Einladung ungueltig. Sie bleibt als Spur stehen.
create or replace function public.einladung_zurueckziehen(p_token uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.einladungen e
     set gueltig_bis = least(e.gueltig_bis, now())
   where e.token = p_token
     and e.angenommen_von is null
     and exists (select 1 from privat.buero_mitglieder m
                  where m.buero = e.buero and m.nutzer = auth.uid() and m.rolle = 'inhaber');
$$;

create or replace function public.mitglied_entfernen(p_nutzer uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from privat.buero_mitglieder m
   where m.nutzer = p_nutzer
     and m.rolle = 'mitglied'
     and m.buero = (select i.buero from privat.buero_mitglieder i
                     where i.nutzer = auth.uid() and i.rolle = 'inhaber');
  if not found then
    raise exception 'Kein Mitglied Ihres Bueros' using errcode = 'P0002';
  end if;
end;
$$;

-- Ein Mitglied tritt aus. Der Inhaber kann das nicht — sein Buero endet mit
-- dem Abo bzw. mit seinem Konto.
create or replace function public.buero_verlassen()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from privat.buero_mitglieder m where m.nutzer = auth.uid() and m.rolle = 'mitglied';
  if not found then
    raise exception 'Sie sind kein Mitglied eines Bueros' using errcode = 'P0002';
  end if;
end;
$$;

-- Die Mitglieder des eigenen Bueros, mit E-Mail — fuer Kollegen sichtbar.
create or replace function public.buero_mitglieder()
returns table (nutzer uuid, email text, rolle text, seit timestamptz, hat_platz boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ich as (
    select m.buero from privat.buero_mitglieder m where m.nutzer = auth.uid()
  ),
  liste as (
    select m.nutzer, m.rolle, m.seit,
           row_number() over (order by (m.rolle = 'inhaber') desc, m.seit, m.nutzer) as rang
      from privat.buero_mitglieder m
      join ich on ich.buero = m.buero
  )
  select l.nutzer, u.email::text, l.rolle, l.seit,
         coalesce(l.rang <= (select a.plaetze from privat.abos a join ich on ich.buero = a.buero
                              where privat.abo_aktiv(a.status)), false)
    from liste l
    join auth.users u on u.id = l.nutzer
   order by l.rang;
$$;

-- Offene Einladungen — nur fuer den Inhaber.
create or replace function public.buero_einladungen()
returns table (token uuid, erstellt_am timestamptz, gueltig_bis timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.token, e.erstellt_am, e.gueltig_bis
    from privat.einladungen e
    join privat.buero_mitglieder m
      on m.buero = e.buero and m.nutzer = auth.uid() and m.rolle = 'inhaber'
   where e.angenommen_von is null and e.gueltig_bis > now()
   order by e.erstellt_am;
$$;

-- ---------------------------------------------------------------------------
-- Nur fuer die Service-Rolle: Kasse und Stripe-Webhook (Schritt 4)
-- ---------------------------------------------------------------------------
-- Das Buero eines Kontos, als Inhaber angelegt, falls es noch keins gibt.
create or replace function public.buero_sichern(p_nutzer uuid, p_name text default '')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_buero uuid;
begin
  select m.buero into v_buero from privat.buero_mitglieder m where m.nutzer = p_nutzer;
  if v_buero is not null then
    if not exists (select 1 from privat.bueros b where b.id = v_buero and b.inhaber = p_nutzer) then
      raise exception 'Mitglied eines anderen Bueros' using errcode = 'P0001';
    end if;
    return v_buero;
  end if;
  insert into privat.bueros (name, inhaber) values (coalesce(p_name, ''), p_nutzer) returning id into v_buero;
  insert into privat.buero_mitglieder (buero, nutzer, rolle) values (v_buero, p_nutzer, 'inhaber');
  return v_buero;
end;
$$;

-- Was Kasse und Portal ueber ein Konto wissen muessen.
create or replace function public.abo_kontext(p_nutzer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'buero', b.id, 'rolle', m.rolle, 'stripe_kunde', b.stripe_kunde,
    'stripe_abo', a.stripe_abo, 'status', a.status, 'paket', a.paket)
    from privat.buero_mitglieder m
    join privat.bueros b on b.id = m.buero
    left join privat.abos a on a.buero = b.id
   where m.nutzer = p_nutzer
$$;

create or replace function public.buero_stripe_kunde(p_buero uuid, p_kunde text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privat.bueros set stripe_kunde = p_kunde where id = p_buero;
$$;

create or replace function public.buero_zu_kunde(p_kunde text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from privat.bueros b where b.stripe_kunde = p_kunde
$$;

-- Der Webhook holt das Abo frisch von Stripe und schreibt es hierher — die
-- Reihenfolge der Ereignisse spielt so keine Rolle.
create or replace function public.abo_schreiben(
  p_buero uuid, p_stripe_abo text, p_paket text, p_intervall text, p_plaetze integer,
  p_status text, p_laeuft_bis timestamptz, p_kuendigung_zum timestamptz)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privat.abos
    (buero, stripe_abo, paket, intervall, plaetze, status, laeuft_bis, kuendigung_zum, aktualisiert_am)
  values
    (p_buero, p_stripe_abo, p_paket, p_intervall, p_plaetze, p_status, p_laeuft_bis, p_kuendigung_zum, now())
  on conflict (buero) do update
    set stripe_abo      = excluded.stripe_abo,
        paket           = excluded.paket,
        intervall       = excluded.intervall,
        plaetze         = excluded.plaetze,
        status          = excluded.status,
        laeuft_bis      = excluded.laeuft_bis,
        kuendigung_zum  = excluded.kuendigung_zum,
        aktualisiert_am = now();
$$;

-- ---------------------------------------------------------------------------
-- Rechte: Supabase vergibt Execute auf neue Funktionen im public-Schema auch
-- an anon (und PUBLIC). Deshalb ausdruecklich entziehen und gezielt vergeben.
-- ---------------------------------------------------------------------------
revoke all on function privat.abo_aktiv(text)            from public, anon, authenticated;
revoke all on function privat.mitglied_platz_pruefen()   from public, anon, authenticated;

revoke all on function public.mein_zugang()                 from public, anon;
revoke all on function public.hat_paket(text)               from public, anon;
revoke all on function public.einladung_erstellen()         from public, anon;
revoke all on function public.einladung_annehmen(uuid)      from public, anon;
revoke all on function public.einladung_zurueckziehen(uuid) from public, anon;
revoke all on function public.mitglied_entfernen(uuid)      from public, anon;
revoke all on function public.buero_verlassen()             from public, anon;
revoke all on function public.buero_mitglieder()            from public, anon;
revoke all on function public.buero_einladungen()           from public, anon;
grant execute on function public.mein_zugang()                 to authenticated;
grant execute on function public.hat_paket(text)               to authenticated;
grant execute on function public.einladung_erstellen()         to authenticated;
grant execute on function public.einladung_annehmen(uuid)      to authenticated;
grant execute on function public.einladung_zurueckziehen(uuid) to authenticated;
grant execute on function public.mitglied_entfernen(uuid)      to authenticated;
grant execute on function public.buero_verlassen()             to authenticated;
grant execute on function public.buero_mitglieder()            to authenticated;
grant execute on function public.buero_einladungen()           to authenticated;

revoke all on function public.buero_sichern(uuid, text)     from public, anon, authenticated;
revoke all on function public.abo_kontext(uuid)             from public, anon, authenticated;
revoke all on function public.buero_stripe_kunde(uuid, text) from public, anon, authenticated;
revoke all on function public.buero_zu_kunde(text)          from public, anon, authenticated;
revoke all on function public.abo_schreiben(uuid, text, text, text, integer, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.buero_sichern(uuid, text)     to service_role;
grant execute on function public.abo_kontext(uuid)             to service_role;
grant execute on function public.buero_stripe_kunde(uuid, text) to service_role;
grant execute on function public.buero_zu_kunde(text)          to service_role;
grant execute on function public.abo_schreiben(uuid, text, text, text, integer, text, timestamptz, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Policies: Neues entsteht nur mit dem Paket Rentenplanung (oder alles).
-- Vor dem Start gilt fuer alle `vorab` — es aendert sich also noch nichts.
-- ---------------------------------------------------------------------------
alter policy "eigene anlegen" on public.szenarien
  with check ((select auth.uid()) = besitzer and (select public.hat_paket('rente')));

alter policy "eigene aendern" on public.szenarien
  using ((select auth.uid()) = besitzer)
  with check ((select auth.uid()) = besitzer and (select public.hat_paket('rente')));

alter policy "eigene anfragen anlegen" on public.check_anfragen
  with check ((select auth.uid()) = berater and (select public.hat_paket('rente')));

-- ---------------------------------------------------------------------------
-- Bestandsschutz: Wer heute ein Konto hat, behaelt dauerhaft vollen Zugang.
-- ---------------------------------------------------------------------------
insert into privat.freizugaenge (nutzer, grund)
select u.id, 'bestand' from auth.users u
on conflict (nutzer) do nothing;
