-- Ihr Auftritt im Buero: Logo, Firmenname und Akzentfarbe legt der Inhaber fest.
--
-- WOZU. In einer Agentur tragen alle Gutachten und Unterlagen dasselbe Logo,
-- denselben Firmennamen und dieselbe Akzentfarbe. Fest legt sie, wer das
-- Buero verwaltet (der Inhaber) — in seinem eigenen „Ihr Auftritt“. Fuer die
-- Mitglieder gelten diese drei Werte; aendern koennen sie sie nicht. Name,
-- Telefon, E-Mail, Website und Zusatzzeile bleiben persoenlich.
--
-- DIE EIGENEN WERTE eines Mitglieds bleiben in seiner Zeile von
-- berater_profil stehen, gelten aber nicht, solange es dem Buero angehoert:
-- Die App setzt die Werte des Bueros ein. Tritt es aus, gelten sie wieder;
-- kopiert wird nichts, und das Logo des Inhabers laedt es dann nicht mehr.
-- Hat der Inhaber etwas nicht eingetragen, bleibt es fuer alle leer.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Neu sind
-- eine Funktion und eine Leseregel fuer das Logo; bav_kollegen behaelt seine
-- Spalten. Wer die Funktion nicht aufruft, sieht alles wie bisher.

-- ---------------------------------------------------------------------------
-- Logo, Firmenname und Akzentfarbe des Bueros — nur fuer Mitglieder.
--
-- `privat` ist fuer authenticated nicht lesbar, berater_profil nur die
-- eigene Zeile. Die Funktion liefert genau diese drei Werte des Inhabers und
-- seinen Namen (sonst die E-Mail, wie bav_kollegen) fuer den Hinweis im
-- Formular. Inhaber und Nutzer ohne Buero bekommen null.
-- ---------------------------------------------------------------------------
create or replace function public.buero_auftritt()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'firma',   coalesce(btrim(p.firma), ''),
           'farbe',   p.farbe,
           'logo',    p.logo,
           'inhaber', coalesce(nullif(btrim(p.berater), ''), u.email::text, ''))
    from privat.buero_mitglieder m
    join privat.bueros b on b.id = m.buero
    left join public.berater_profil p on p.besitzer = b.inhaber
    left join auth.users u on u.id = b.inhaber
   where m.nutzer = auth.uid()
     and m.rolle = 'mitglied';
$$;

revoke all on function public.buero_auftritt() from public, anon;
grant execute on function public.buero_auftritt() to authenticated;

-- ---------------------------------------------------------------------------
-- Das Logo des Bueros laden: genau die aktuelle Datei des Inhabers, sonst
-- nichts aus seinem Ordner. Hochladen und Loeschen bleiben beim eigenen
-- Ordner (Migration 20261017120000).
-- ---------------------------------------------------------------------------
create policy "branding logo des bueros lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and name = (select public.buero_auftritt() ->> 'logo'));

-- ---------------------------------------------------------------------------
-- Die Kollegen: Agentur ist jetzt die des Bueros, also der Firmenname des
-- Inhabers. Die eigenen Werte der Mitglieder gelten im Buero nicht — sie
-- stuenden hier sonst veraltet und unveraenderbar.
-- ---------------------------------------------------------------------------
create or replace function public.bav_kollegen()
returns table (nutzer uuid, name text, agentur text, rolle text, ich boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.nutzer,
         coalesce(nullif(btrim(p.berater), ''), u.email::text, '') as name,
         coalesce(btrim(ip.firma), '') as agentur,
         m.rolle,
         m.nutzer = auth.uid() as ich
    from privat.buero_mitglieder m
    join privat.buero_mitglieder selbst on selbst.buero = m.buero and selbst.nutzer = auth.uid()
    join privat.bueros b on b.id = m.buero
    left join public.berater_profil p on p.besitzer = m.nutzer
    left join public.berater_profil ip on ip.besitzer = b.inhaber
    left join auth.users u on u.id = m.nutzer
   order by (m.rolle = 'inhaber') desc, m.seit, m.nutzer;
$$;
