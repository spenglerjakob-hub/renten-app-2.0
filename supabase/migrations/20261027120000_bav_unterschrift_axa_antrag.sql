-- Mitarbeiterberatung, AXA-Antrag: Der Berater unterschreibt darin mit.
--
-- WOZU. Bei Firmen mit Versicherer AXA und Direktversicherung tritt der
-- AXA-Antrag an die Stelle der Mustervereinbarung (apps/web
-- mitarbeiter/axa-antrag.tsx). Darin unterschreibt auch der Berater — unter
-- der Einwilligungserklaerung und im AXA-Gespraechsprotokoll. Seine
-- Unterschrift deckt deshalb die Vereinbarung mit ab, wenn diese ein Feld fuer
-- ihn hat (data-unterschrift="berater"); die App setzt sie nur dort ein, wo
-- die Datenbank sie abgedeckt sieht.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Die
-- Mustervereinbarung hat kein Feld fuer den Berater — fuer sie, fuer die
-- bisherigen Unterschriften und fuer die Live-Seite aendert sich nichts.
-- Tabellen, Rechte und Zeilenregeln bleiben, wie sie sind.

create or replace function public.bav_unterschrift_eintragen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vereinbarung text;
begin
  select u.vereinbarung into v_vereinbarung from public.bav_unterlagen u where u.beratung = new.beratung;
  if not found then
    raise exception 'Zu dieser Beratung gibt es keine festgeschriebenen Unterlagen.'
      using errcode = 'foreign_key_violation';
  end if;
  new.name := btrim(new.name);
  new.unterschrieben_am := now();
  new.dokumente := case
    when new.person = 'berater' and position('data-unterschrift="berater"' in coalesce(v_vereinbarung, '')) > 0
      then array['protokoll', 'vereinbarung']
    when new.person = 'berater' then array['protokoll']
    else array['protokoll', case when v_vereinbarung is not null then 'vereinbarung' else 'verzicht' end]
  end;
  return new;
end;
$$;

comment on function public.bav_unterschrift_eintragen() is
  'Setzt Zeitpunkt und abgedeckte Unterlagen: der Mitarbeiter alle, der Berater das Protokoll — '
  'und die Vereinbarung, wenn sie ein Feld fuer ihn hat (AXA-Antrag).';
