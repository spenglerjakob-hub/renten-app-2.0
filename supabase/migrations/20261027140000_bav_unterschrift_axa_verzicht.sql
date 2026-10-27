-- Mitarbeiterberatung, AXA bei Verzicht: Der Berater unterschreibt im AXA-Gespraechsprotokoll.
--
-- WOZU. Verzichtet ein Mitarbeiter einer AXA-Firma, kommt hinter die
-- Verzichtserklaerung das AXA-Gespraechsprotokoll mit „Nein“ (apps/web
-- mitarbeiter/axa-antrag.tsx, AxaVerzicht). Darin unterschreibt auch der
-- Berater (Vermittler/in). Seine Unterschrift deckt deshalb die
-- Verzichtserklaerung mit ab, wenn diese ein Feld fuer ihn hat
-- (data-unterschrift="berater") — wie seit 20261027120000 die Vereinbarung.
--
-- ABWAERTSKOMPATIBEL: Test- und Live-Seite teilen diese Datenbank. Die
-- bisherige Verzichtserklaerung hat kein Feld fuer den Berater — fuer sie,
-- fuer die bisherigen Unterschriften und fuer die Live-Seite aendert sich
-- nichts. Tabellen, Rechte und Zeilenregeln bleiben, wie sie sind.

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
  return new;
end;
$$;

comment on function public.bav_unterschrift_eintragen() is
  'Setzt Zeitpunkt und abgedeckte Unterlagen: der Mitarbeiter alle, der Berater das Protokoll — '
  'und Vereinbarung oder Verzichtserklaerung, wenn sie ein Feld fuer ihn hat (AXA-Antrag, AXA-Gespraechsprotokoll).';
