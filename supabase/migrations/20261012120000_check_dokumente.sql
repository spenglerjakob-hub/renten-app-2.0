-- Vorsorge-Check: Unterlagen hochladen.
--
-- WOZU. Statt Zahlen von der Gehaltsabrechnung, der Renteninformation oder
-- einer Standmitteilung abzutippen, laedt der Kunde ein Foto oder einen Scan
-- hoch. Der Berater liest die Zahlen beim Eingang selbst ab.
--
-- SCHUTZ — dieselben Regeln wie beim Einreichen (…_vorsorge_check.sql):
--   * Der Kunde (anon) darf NUR hochladen, und nur mit einem gueltigen,
--     noch nicht genutzten Code. Lesen darf er nichts, auch nicht die eigenen
--     Dateien — so verraet ein weitergeleiteter Link keine Unterlagen.
--   * Lesen darf nur der Berater, dem der Code gehoert, und erst, wenn der
--     Check EINGEGANGEN ist. Vorher sind die Dateien ein Zwischenstand des
--     Kunden, nicht schon seine Uebermittlung.
--   * Der Bucket ist privat; Groesse und Dateiarten begrenzt er selbst.
--
-- LOESCHEN. Unterlagen haben keine eigene Frist: Sie gehen, wenn ihre
-- Anfrage geht — der Berater loescht, 90 Tage nach Eingang, abgelaufener
-- Link ohne Eingang (privat.check_aufraeumen), Konto geloescht. Dateien
-- lassen sich aber NICHT per SQL loeschen (Trigger storage.protect_delete;
-- es blieben verwaiste Dateien im Speicher). Deshalb raeumt die Edge
-- Function `check-dokumente` ueber die Storage-API auf: nachts per Cron und
-- sofort, wenn ein Berater eine Anfrage oder sein Konto loescht.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'check-dokumente', 'check-dokumente', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Darf diese Datei hochgeladen werden?
--
-- SECURITY DEFINER aus demselben Grund wie check_code_gueltig: Der Kunde
-- darf weder Anfragen noch Dateien lesen, die Policy braucht aber beides.
-- Geprueft wird:
--   * der Pfad: <code>/<zufallsname>.<endung> — genau ein Ordner, keine
--     Unterordner, nur Kleinbuchstaben, Ziffern und Bindestrich. Der
--     Originalname steht in den Metadaten, nicht im Pfad;
--   * der Code: offen, nicht abgelaufen, noch nicht eingereicht;
--   * die Anzahl: hoechstens 20 Dateien je Anfrage.
-- ---------------------------------------------------------------------------
create or replace function public.check_dokument_erlaubt(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ordner text;
  v_anzahl integer;
begin
  if p_name is null or p_name !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,80}\.(jpg|jpeg|png|webp|heic|heif|pdf)$'
  then
    return false;
  end if;

  v_ordner := split_part(p_name, '/', 1);
  if not public.check_code_gueltig(v_ordner::uuid) then
    return false;
  end if;

  select count(*) into v_anzahl
    from storage.objects o
   where o.bucket_id = 'check-dokumente'
     and o.name like v_ordner || '/%';
  return v_anzahl < 20;
end;
$$;

revoke all on function public.check_dokument_erlaubt(text) from public;
grant execute on function public.check_dokument_erlaubt(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies auf storage.objects — nur fuer diesen Bucket.
-- ---------------------------------------------------------------------------
-- Hochladen: Kunde ohne Konto, und angemeldet (ein Berater probiert seinen
-- eigenen Link aus). Kein SELECT, kein UPDATE, kein DELETE fuer den Kunden —
-- eine falsche Datei nimmt er ueber die Edge Function zurueck.
create policy "check dokumente hochladen" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'check-dokumente' and public.check_dokument_erlaubt(name));

-- Lesen (Liste, signierte URL, Download): nur der Berater, dem die Anfrage
-- gehoert, und erst nach dem Eingang. Ohne SECURITY DEFINER — die
-- Row Level Security von check_anfragen und check_eingaenge laesst ohnehin
-- nur die eigenen Zeilen sehen. `name` ist die Spalte von storage.objects.
create policy "check dokumente des beraters lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'check-dokumente'
    and exists (
      select 1
        from public.check_eingaenge e
        join public.check_anfragen a on a.code = e.code
       where a.code::text = split_part(name, '/', 1)
    )
  );

-- ---------------------------------------------------------------------------
-- Die Unterlagen des Beraters fuer seine Liste.
--
-- SECURITY INVOKER: Es gelten die Policies oben und die der Anfragen — wer
-- nicht Berater der Anfrage ist oder vor dem Eingang fragt, bekommt nichts.
-- ---------------------------------------------------------------------------
create or replace function public.check_dokumente_liste()
returns table (
  code uuid, pfad text, name text, art text, groesse bigint, typ text, hochgeladen_am timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.code,
         o.name,
         coalesce(nullif(o.user_metadata ->> 'name', ''), storage.filename(o.name)),
         coalesce(nullif(o.user_metadata ->> 'art', ''), 'sonstiges'),
         nullif(o.metadata ->> 'size', '')::bigint,
         o.metadata ->> 'mimetype',
         o.created_at
    from storage.objects o
    join public.check_anfragen a on a.code::text = split_part(o.name, '/', 1)
   where o.bucket_id = 'check-dokumente'
   order by a.code, o.created_at;
$$;

revoke all on function public.check_dokumente_liste() from public, anon;
grant execute on function public.check_dokumente_liste() to authenticated;

-- ---------------------------------------------------------------------------
-- Verwaiste Dateien: ihr Code hat keine Anfrage mehr.
--
-- NUR fuer die Service-Rolle (Edge Function). Supabase vergibt Execute auf
-- neue Funktionen im public-Schema standardmaessig auch an anon und
-- authenticated — deshalb ausdruecklich entziehen.
-- ---------------------------------------------------------------------------
create or replace function public.check_dokumente_verwaist(p_grenze integer default 1000)
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'check-dokumente'
     and not exists (
       select 1 from public.check_anfragen a
        where a.code::text = split_part(o.name, '/', 1)
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_grenze, 1000), 1000));
$$;

revoke all on function public.check_dokumente_verwaist(integer) from public, anon, authenticated;
grant execute on function public.check_dokumente_verwaist(integer) to service_role;

-- Die Edge Function prueft vor dem Entfernen, ob der Link noch offen ist.
grant execute on function public.check_code_gueltig(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Nachts aufraeumen — zehn Minuten nach privat.check_aufraeumen, das die
-- abgelaufenen Anfragen loescht. Benannter Job: erneutes Einspielen ersetzt
-- ihn. Ohne Schluessel, wie die Benachrichtigung: Die Funktion loescht nur,
-- was keine Anfrage mehr hat — ein Aufruf von aussen raeumt hoechstens
-- frueher auf.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'check-dokumente-aufraeumen',
  '27 3 * * *',
  $$select net.http_post(
      url := 'https://ardzirxpurlkaishhuqv.supabase.co/functions/v1/check-dokumente',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"aktion": "aufraeumen"}'::jsonb,
      timeout_milliseconds := 30000
    )$$
);
