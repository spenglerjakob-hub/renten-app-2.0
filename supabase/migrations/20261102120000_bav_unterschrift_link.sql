-- bAV-Mitarbeiterberatung: Unterschrift per Link.
--
-- WOZU. Der Mitarbeiter unterschreibt nicht am Bildschirm des Beraters,
-- sondern auf seinem eigenen Geraet. Der Berater schickt ihm einen Link und
-- nennt ihm getrennt davon einen Code (am Telefon, per SMS). Mit beidem liest
-- der Mitarbeiter die festgeschriebenen Unterlagen und unterschreibt sie —
-- ohne Konto. Der Berater unterschreibt weiter am Bildschirm, der Arbeitgeber
-- auf Papier.
--
-- ABLAUF.
--   1. bav_link_erstellen (Berater): schreibt die Unterlagen fest, falls das
--      noch nicht geschehen ist, und legt den Link an — einen offenen je
--      Beratung. Zurueck kommen Token und Code; gespeichert wird vom Token
--      nur seine Pruefsumme. Den Code sieht der Berater, solange der Link
--      offen ist.
--   2. bav_link_oeffnen (Mitarbeiter): Token und Code -> die Unterlagen.
--   3. bav_link_unterschreiben (Mitarbeiter): Token, Code und Linienzug ->
--      seine Unterschrift mit Nachweis. Danach ist der Link geloescht.
--   4. Ein Trigger meldet die Unterschrift der Edge Function
--      `unterschrift-benachrichtigung`; sie schreibt dem Berater eine E-Mail.
--
-- SCHUTZ.
--   * Token: 122 Bit Zufall (eine UUID). In der Datenbank steht nur seine
--     SHA-256-Pruefsumme — wer die Tabelle lesen darf (der Berater, Kollegen
--     im Buero), kann daraus keinen Link bauen.
--   * Code: 6 Ziffern, getrennt vom Link uebermittelt. Nach 5 Fehlversuchen
--     ist der Link gesperrt; der Berater legt einen neuen an.
--   * Frist: 14 Tage. Abgelaufene Links raeumt ein naechtlicher Job weg.
--   * anon liest keine Tabelle. Die beiden Funktionen fuer den Mitarbeiter
--     sind SECURITY DEFINER — bewusst, wie check_code_gueltig: Er hat kein
--     Konto. Sie geben nur heraus, was zu genau diesem Link gehoert, und nur
--     mit dem richtigen Code.
--   * Die Unterschrift per Link setzt allein die Datenbank. Wer selbst
--     einfuegt (Rolle authenticated, am Bildschirm), bekommt immer
--     kanal = 'bildschirm' und keinen Nachweis.
--
-- NACHWEIS. Zur Unterschrift per Link haelt die Datenbank fest: wann und von
-- wem der Link erstellt wurde, wann er mit dem Code geoeffnet und wann
-- unterschrieben wurde, IP-Adresse (mit der Kette der Weiterleitungen) und
-- Browser (User-Agent) beim Unterschreiben, die Pruefsummen der Unterlagen
-- und die Adresse der Seite.
-- Der Nachweis geht mit der Unterschrift (Unterschriften aufheben, Beratung
-- loeschen, Konto loeschen).
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Neu sind
-- eine Tabelle, drei Spalten mit Vorgabe, Funktionen, Trigger und ein Job.
-- bav_unterschreiben bleibt, wie es ist; bav_unterschrift_eintragen rechnet
-- wie bisher. Die Live-Seite liest die neuen Spalten nicht und sieht eine
-- Unterschrift per Link wie eine am Bildschirm.

-- ---------------------------------------------------------------------------
-- Die Unterschrift: auf welchem Weg, mit welchem Nachweis
-- ---------------------------------------------------------------------------
alter table public.bav_unterschriften
  add column if not exists kanal text not null default 'bildschirm',
  add column if not exists nachweis jsonb,
  add column if not exists benachrichtigt_am timestamptz;

alter table public.bav_unterschriften drop constraint if exists kanal_bekannt;
alter table public.bav_unterschriften add constraint kanal_bekannt check (kanal in ('bildschirm', 'link'));
alter table public.bav_unterschriften drop constraint if exists nachweis_objekt;
alter table public.bav_unterschriften add constraint nachweis_objekt check (
  nachweis is null or (jsonb_typeof(nachweis) = 'object' and pg_column_size(nachweis) < 8192)
);
-- Einen Nachweis hat genau die Unterschrift per Link.
alter table public.bav_unterschriften drop constraint if exists nachweis_nur_link;
alter table public.bav_unterschriften add constraint nachweis_nur_link check ((kanal = 'link') = (nachweis is not null));

comment on column public.bav_unterschriften.kanal is
  'bildschirm: am Bildschirm des Beraters; link: per Link auf dem Geraet des Mitarbeiters (nur ueber bav_link_unterschreiben).';
comment on column public.bav_unterschriften.nachweis is
  'Nur bei kanal = link: Link erstellt am/von, geoeffnet, Code bestaetigt, IP-Adresse, Browser, Pruefsummen, Adresse.';
comment on column public.bav_unterschriften.benachrichtigt_am is
  'Wann der Berater per E-Mail benachrichtigt wurde; gesetzt von der Edge Function unterschrift-benachrichtigung.';

-- Nach der Unterschrift ist der Link geloescht; die Seite erkennt ihn am Nachweis wieder.
create index if not exists bav_unterschriften_link_idx
  on public.bav_unterschriften ((nachweis ->> 'link')) where kanal = 'link';

-- Wie bisher (20261027140000) — dazu: Kanal und Nachweis setzt nur die
-- Datenbank selbst. Am Bildschirm (authenticated) bleibt es beim Bildschirm.
create or replace function public.bav_unterschrift_eintragen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vereinbarung text;
  v_verzicht     text;
  v_feld         constant text := 'data-unterschrift="berater"';
begin
  select u.vereinbarung, u.verzicht into v_vereinbarung, v_verzicht
    from public.bav_unterlagen u where u.beratung = new.beratung;
  if not found then
    raise exception 'Zu dieser Beratung gibt es keine festgeschriebenen Unterlagen.'
      using errcode = 'foreign_key_violation';
  end if;
  new.name := btrim(new.name);
  new.unterschrieben_am := now();
  new.dokumente := case
    when new.person = 'berater' and position(v_feld in coalesce(v_vereinbarung, '')) > 0
      then array['protokoll', 'vereinbarung']
    when new.person = 'berater' and position(v_feld in coalesce(v_verzicht, '')) > 0
      then array['protokoll', 'verzicht']
    when new.person = 'berater' then array['protokoll']
    else array['protokoll', case when v_vereinbarung is not null then 'vereinbarung' else 'verzicht' end]
  end;
  if current_user in ('authenticated', 'anon') then
    new.kanal := 'bildschirm';
    new.nachweis := null;
    new.benachrichtigt_am := null;
  end if;
  return new;
end;
$$;

comment on function public.bav_unterschrift_eintragen() is
  'Setzt Zeitpunkt und abgedeckte Unterlagen: der Mitarbeiter alle, der Berater das Protokoll — '
  'und Vereinbarung oder Verzichtserklaerung, wenn sie ein Feld fuer ihn hat (AXA-Antrag, AXA-Gespraechsprotokoll). '
  'Kanal und Nachweis setzt nur die Datenbank (bav_link_unterschreiben).';

-- ---------------------------------------------------------------------------
-- Der Link: hoechstens einer je Beratung
-- ---------------------------------------------------------------------------
create table if not exists public.bav_unterschrift_links (
  beratung     uuid primary key references public.bav_unterlagen (beratung) on delete cascade,
  -- SHA-256 des Tokens; der Token selbst steht nur im Link.
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code         text not null check (code ~ '^[0-9]{6}$'),
  erstellt_von uuid references auth.users (id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  gueltig_bis  timestamptz not null default now() + interval '14 days',
  fehlversuche integer not null default 0 check (fehlversuche between 0 and 5),
  -- Wann der Code zum ersten Mal stimmte
  geoeffnet_am timestamptz,
  -- Die Seite, auf der der Link erstellt wurde — fuer den Link in der E-Mail an den Berater.
  adresse      text check (adresse is null or adresse in ('https://js-rentenplaner.de', 'https://test.js-rentenplaner.de')),

  constraint frist check (gueltig_bis > erstellt_am and gueltig_bis <= erstellt_am + interval '14 days')
);

comment on table public.bav_unterschrift_links is
  'bAV-Mitarbeiterberatung: offene Links zur Unterschrift per Link — nur die Pruefsumme des Tokens, der Code fuer den Berater.';

-- Zeiten, Frist, Zaehler und Ersteller setzt die Datenbank — gleich, was der Aufrufer schickt.
create or replace function public.bav_link_anlegen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.erstellt_von := auth.uid();
  new.erstellt_am := now();
  new.gueltig_bis := now() + interval '14 days';
  new.fehlversuche := 0;
  new.geoeffnet_am := null;
  return new;
end;
$$;

drop trigger if exists bav_link_anlegen on public.bav_unterschrift_links;
create trigger bav_link_anlegen
  before insert on public.bav_unterschrift_links
  for each row execute function public.bav_link_anlegen();

-- Row Level Security: Wer die Unterlagen sieht, sieht den Link und kann ihn
-- zurueckziehen — auch Kollegen im Buero. Anlegen geht ueber
-- bav_link_erstellen (mit den Rechten des Aufrufers). Kein Update: Fehlversuche
-- und Oeffnen zaehlt nur die Datenbank.
alter table public.bav_unterschrift_links enable row level security;
alter table public.bav_unterschrift_links force row level security;

drop policy if exists "links lesen"    on public.bav_unterschrift_links;
drop policy if exists "links anlegen"  on public.bav_unterschrift_links;
drop policy if exists "links loeschen" on public.bav_unterschrift_links;

create policy "links lesen" on public.bav_unterschrift_links
  for select to authenticated
  using (exists (select 1 from public.bav_unterlagen u where u.beratung = bav_unterschrift_links.beratung));

create policy "links anlegen" on public.bav_unterschrift_links
  for insert to authenticated
  with check (exists (select 1 from public.bav_unterlagen u where u.beratung = bav_unterschrift_links.beratung));

create policy "links loeschen" on public.bav_unterschrift_links
  for delete to authenticated
  using (exists (select 1 from public.bav_unterlagen u where u.beratung = bav_unterschrift_links.beratung));

-- Spaltenrechte: die Pruefsumme des Tokens liest niemand.
revoke all on public.bav_unterschrift_links from anon, authenticated;
grant select (beratung, code, erstellt_von, erstellt_am, gueltig_bis, fehlversuche, geoeffnet_am, adresse)
  on public.bav_unterschrift_links to authenticated;
grant insert (beratung, token_hash, code, adresse) on public.bav_unterschrift_links to authenticated;
grant delete on public.bav_unterschrift_links to authenticated;

-- ---------------------------------------------------------------------------
-- Link erstellen (Berater). SECURITY INVOKER: Es gelten seine Policies —
-- festschreiben, Link loeschen und anlegen nur bei Beratungen, die er sieht.
-- Antwort statt Ausnahme, wo es die Oberflaeche erklaert:
--   ok | ohne_name | unterschrieben
-- ---------------------------------------------------------------------------
create or replace function public.bav_link_erstellen(
  p_beratung     uuid,
  p_adresse      text default null,
  p_protokoll    text default null,
  p_vereinbarung text default null,
  p_verzicht     text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_name   text;
  v_token  text;
  v_code   text;
  v_bis    timestamptz;
  v_am     timestamptz;
begin
  select btrim(b.mitarbeiter) into v_name from public.bav_beratungen b where b.id = p_beratung;
  if not found then
    raise exception 'Diese Beratung gibt es nicht.' using errcode = '42501';
  end if;
  if v_name = '' then
    return jsonb_build_object('status', 'ohne_name');
  end if;
  if not exists (select 1 from public.bav_unterlagen u where u.beratung = p_beratung) then
    insert into public.bav_unterlagen (beratung, protokoll, vereinbarung, verzicht)
    values (p_beratung, p_protokoll, p_vereinbarung, p_verzicht);
  end if;
  if exists (select 1 from public.bav_unterschriften s where s.beratung = p_beratung and s.person = 'mitarbeiter') then
    return jsonb_build_object('status', 'unterschrieben');
  end if;

  -- Ein neuer Link ersetzt den alten.
  delete from public.bav_unterschrift_links l where l.beratung = p_beratung;

  -- gen_random_uuid nutzt den starken Zufall der Datenbank. Die ersten acht
  -- Hex-Ziffern einer UUID sind reiner Zufall (32 Bit); der Rest der Division
  -- verzerrt die Codes um weniger als ein Promille.
  v_token := replace(gen_random_uuid()::text, '-', '');
  v_code := lpad(((('x' || left(replace(gen_random_uuid()::text, '-', ''), 8))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into public.bav_unterschrift_links (beratung, token_hash, code, adresse)
  values (p_beratung, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_code,
          case when p_adresse in ('https://js-rentenplaner.de', 'https://test.js-rentenplaner.de') then p_adresse end)
  returning erstellt_am, gueltig_bis into v_am, v_bis;

  return jsonb_build_object('status', 'ok', 'token', v_token, 'code', v_code, 'erstellt_am', v_am, 'gueltig_bis', v_bis);
end;
$$;

revoke all on function public.bav_link_erstellen(uuid, text, text, text, text) from public, anon;
grant execute on function public.bav_link_erstellen(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Link pruefen — nur fuer die beiden Funktionen unten. Sperrt die Zeile,
-- zaehlt Fehlversuche und antwortet mit dem Stand:
--   ungueltig | abgelaufen | gesperrt | code_falsch (rest) | unterschrieben | ok (beratung)
-- Im nicht veroeffentlichten Schema `privat`: nicht als /rest/v1/rpc/… aufrufbar.
-- ---------------------------------------------------------------------------
create or replace function privat.bav_link_pruefen(p_token text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_link public.bav_unterschrift_links;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'ungueltig');
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  select * into v_link from public.bav_unterschrift_links l where l.token_hash = v_hash for update;
  if not found then
    if exists (select 1 from public.bav_unterschriften s where s.kanal = 'link' and s.nachweis ->> 'link' = v_hash) then
      return jsonb_build_object('status', 'unterschrieben');
    end if;
    return jsonb_build_object('status', 'ungueltig');
  end if;
  if v_link.gueltig_bis <= now() then
    return jsonb_build_object('status', 'abgelaufen');
  end if;
  if v_link.fehlversuche >= 5 then
    return jsonb_build_object('status', 'gesperrt');
  end if;
  if p_code is distinct from v_link.code then
    update public.bav_unterschrift_links l set fehlversuche = l.fehlversuche + 1 where l.beratung = v_link.beratung;
    if v_link.fehlversuche + 1 >= 5 then
      return jsonb_build_object('status', 'gesperrt');
    end if;
    return jsonb_build_object('status', 'code_falsch', 'rest', 5 - (v_link.fehlversuche + 1));
  end if;
  -- Inzwischen am Bildschirm unterschrieben
  if exists (select 1 from public.bav_unterschriften s where s.beratung = v_link.beratung and s.person = 'mitarbeiter') then
    return jsonb_build_object('status', 'unterschrieben');
  end if;
  return jsonb_build_object('status', 'ok', 'beratung', v_link.beratung);
end;
$$;

revoke all on function privat.bav_link_pruefen(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link oeffnen (Mitarbeiter, ohne Konto). SECURITY DEFINER, siehe oben. Mit
-- dem richtigen Code: die festgeschriebenen Unterlagen, die Unterschriften
-- darin, Name und Kontakt des Beraters. Antwort statt Ausnahme — sonst ginge
-- der gezaehlte Fehlversuch mit der Ausnahme verloren.
-- ---------------------------------------------------------------------------
create or replace function public.bav_link_oeffnen(p_token text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v        jsonb;
  v_berat  uuid;
begin
  v := privat.bav_link_pruefen(p_token, p_code);
  if v ->> 'status' <> 'ok' then
    return v;
  end if;
  v_berat := (v ->> 'beratung')::uuid;

  update public.bav_unterschrift_links l set geoeffnet_am = coalesce(l.geoeffnet_am, now()) where l.beratung = v_berat;

  select jsonb_build_object(
           'status', 'ok',
           'mitarbeiter', btrim(b.mitarbeiter),
           'firma', btrim(f.name),
           'entscheidung', b.status,
           'axa', position('data-unterschrift="berater"' in coalesce(u.vereinbarung, u.verzicht, '')) > 0,
           'gueltig_bis', l.gueltig_bis,
           'festgeschrieben_am', u.erstellt_am,
           'pruefsummen', u.pruefsummen,
           'unterlagen', jsonb_strip_nulls(jsonb_build_object(
             'protokoll', u.protokoll, 'vereinbarung', u.vereinbarung, 'verzicht', u.verzicht)),
           'berater', jsonb_build_object(
             'name', coalesce(btrim(p.berater), ''), 'telefon', coalesce(btrim(p.telefon), ''),
             'email', coalesce(btrim(p.email), '')),
           'unterschriften', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'person', s.person, 'name', s.name, 'zug', s.zug, 'dokumente', to_jsonb(s.dokumente),
                      'unterschrieben_am', s.unterschrieben_am, 'kanal', s.kanal) order by s.person)
               from public.bav_unterschriften s where s.beratung = v_berat), '[]'::jsonb))
    into v
    from public.bav_unterschrift_links l
    join public.bav_unterlagen u on u.beratung = l.beratung
    join public.bav_beratungen b on b.id = l.beratung
    join public.bav_firmen f on f.id = b.firma
    left join public.berater_profil p on p.besitzer = coalesce(l.erstellt_von, u.besitzer)
   where l.beratung = v_berat;
  return v;
end;
$$;

revoke all on function public.bav_link_oeffnen(text, text) from public;
grant execute on function public.bav_link_oeffnen(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Unterschreiben per Link (Mitarbeiter, ohne Konto). SECURITY DEFINER. Die
-- Pruefsummen muessen die der festgeschriebenen Fassung sein — die Seite
-- rechnet sie aus dem HTML nach, das sie angezeigt hat. Antworten wie oben,
-- dazu: zug_ungueltig | veraendert.
-- ---------------------------------------------------------------------------
create or replace function public.bav_link_unterschreiben(p_token text, p_code text, p_zug text, p_pruefsummen jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v             jsonb;
  v_berat       uuid;
  v_link        public.bav_unterschrift_links;
  v_pruefsummen jsonb;
  v_besitzer    uuid;
  v_name        text;
  v_von         text;
  v_kopf        jsonb;
  v_ip          text;
  v_am          timestamptz;
  v_dokumente   text[];
begin
  v := privat.bav_link_pruefen(p_token, p_code);
  if v ->> 'status' <> 'ok' then
    return v;
  end if;
  v_berat := (v ->> 'beratung')::uuid;

  if p_zug is null or char_length(p_zug) not between 10 and 60000 or p_zug !~ '^M[0-9MLQ. ]+$' then
    return jsonb_build_object('status', 'zug_ungueltig');
  end if;
  select u.pruefsummen, u.besitzer into v_pruefsummen, v_besitzer from public.bav_unterlagen u where u.beratung = v_berat;
  if p_pruefsummen is distinct from v_pruefsummen then
    return jsonb_build_object('status', 'veraendert');
  end if;
  select btrim(b.mitarbeiter) into v_name from public.bav_beratungen b where b.id = v_berat;
  select * into v_link from public.bav_unterschrift_links l where l.beratung = v_berat;
  select coalesce(nullif(btrim(p.berater), ''), au.email::text) into v_von
    from auth.users au left join public.berater_profil p on p.besitzer = au.id
   where au.id = v_link.erstellt_von;

  -- Die Kopfzeilen der Anfrage reicht die Data API durch. cf-connecting-ip
  -- setzt der vorgelagerte Proxy selbst; sonst die erste Adresse in
  -- x-forwarded-for. Die ganze Kette steht zusaetzlich im Nachweis.
  v_kopf := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip := coalesce(nullif(btrim(v_kopf ->> 'cf-connecting-ip'), ''),
                   nullif(btrim(split_part(coalesce(v_kopf ->> 'x-forwarded-for', ''), ',', 1)), ''),
                   nullif(btrim(v_kopf ->> 'x-real-ip'), ''));

  begin
    insert into public.bav_unterschriften (beratung, besitzer, person, name, zug, kanal, nachweis)
    values (v_berat, v_besitzer, 'mitarbeiter', v_name, p_zug, 'link', jsonb_strip_nulls(jsonb_build_object(
              'link', v_link.token_hash,
              'link_erstellt_am', v_link.erstellt_am,
              'link_erstellt_von', v_von,
              'link_erstellt_von_id', v_link.erstellt_von,
              'geoeffnet_am', v_link.geoeffnet_am,
              'code_bestaetigt_am', now(),
              'ip', left(v_ip, 64),
              'weiterleitung', left(v_kopf ->> 'x-forwarded-for', 200),
              'browser', left(v_kopf ->> 'user-agent', 300),
              'pruefsummen', v_pruefsummen,
              'adresse', v_link.adresse)))
    returning unterschrieben_am, dokumente into v_am, v_dokumente;
  exception when unique_violation then
    -- Gerade eben am Bildschirm unterschrieben
    return jsonb_build_object('status', 'unterschrieben');
  end;

  delete from public.bav_unterschrift_links l where l.beratung = v_berat;

  return jsonb_build_object('status', 'ok', 'name', v_name, 'unterschrieben_am', v_am, 'dokumente', to_jsonb(v_dokumente));
end;
$$;

revoke all on function public.bav_link_unterschreiben(text, text, text, jsonb) from public;
grant execute on function public.bav_link_unterschreiben(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- E-Mail an den Berater: Nach dem Einfuegen einer Unterschrift per Link ruft
-- der Trigger die Edge Function auf (pg_net, erst nach dem Commit) — wie
-- check_eingang_melden. Die Funktion setzt `benachrichtigt_am` atomar,
-- bevor sie verschickt; je Unterschrift geht hoechstens eine Mail hinaus.
-- ---------------------------------------------------------------------------
create or replace function privat.bav_unterschrift_link_melden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/unterschrift-benachrichtigung',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('unterschrift', new.id),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function privat.bav_unterschrift_link_melden() from public, anon, authenticated;

drop trigger if exists bav_unterschrift_link_melden on public.bav_unterschriften;
create trigger bav_unterschrift_link_melden
  after insert on public.bav_unterschriften
  for each row when (new.kanal = 'link')
  execute function privat.bav_unterschrift_link_melden();

-- ---------------------------------------------------------------------------
-- Aufraeumen, taeglich um 03:23 Uhr (UTC): abgelaufene Links und solche, zu
-- denen der Mitarbeiter inzwischen am Bildschirm unterschrieben hat.
-- ---------------------------------------------------------------------------
create or replace function privat.bav_links_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.bav_unterschrift_links l
   where l.gueltig_bis < now()
      or exists (select 1 from public.bav_unterschriften s where s.beratung = l.beratung and s.person = 'mitarbeiter');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function privat.bav_links_aufraeumen() from public, anon, authenticated;

select cron.schedule('bav-links-aufraeumen', '23 3 * * *', $$select privat.bav_links_aufraeumen()$$);
