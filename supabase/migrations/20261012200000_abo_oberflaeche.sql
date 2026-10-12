-- Abo-Modell, Schritt 3: was die Oberflaeche zusaetzlich wissen muss.
--
-- `zahlung_bereit` — der Schalter fuer die Buchung. Eingeschaltet wird er
-- erst, wenn Kasse und Webhook (Schritt 4) laufen und die Preise in Stripe
-- angelegt sind. Bis dahin zeigt die Oberflaeche die Paketwahl, der Knopf
-- zur Zahlung bleibt aber gesperrt ("startet in Kuerze").
--
-- `mein_zugang()` liefert zusaetzlich:
--   - `zahlung_bereit`,
--   - `freizugang` (bestand | betreiber | partner) — auch vor dem Start,
--     damit Bestandskonten schon in der Ankuendigung lesen, dass sie
--     kostenlos bleiben,
--   - `test_bis`, sobald ein Starttermin feststeht, nicht erst ab dem Start.
--     Wer sich vorher registriert, sieht so, bis wann er testen kann.
-- Wer was darf, entscheidet die Funktion unveraendert in derselben
-- Reihenfolge: vorab, Freizugang, Buero-Abo, Testphase.

alter table privat.einstellungen
  add column if not exists zahlung_bereit boolean not null default false;

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
  if v_e.abo_pflicht_ab is not null then
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
    'zahlung_bereit', coalesce(v_e.zahlung_bereit, false),
    'freizugang',     v_frei,
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

-- CREATE OR REPLACE behaelt die Rechte. Zur Sicherheit trotzdem ausdruecklich.
revoke all on function public.mein_zugang() from public, anon;
grant execute on function public.mein_zugang() to authenticated;
