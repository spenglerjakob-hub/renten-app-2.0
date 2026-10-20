-- Abo-Modell, Schritt 4: Stripe — Kasse, Kundenportal, Webhook, Preisabgleich.
--
-- BUCHUNG ZUERST NUR FUER DEN BETREIBER. Test- und Live-Seite teilen sich
-- Datenbank und Edge Functions, also auch den Stripe-Schluessel. Solange
-- `zahlung_nur_betreiber` gesetzt ist, meldet `mein_zugang()` die Buchung
-- nur dem Betreiberkonto als bereit, und die Kasse lehnt alle anderen ab.
-- So kann niemand auf js-rentenplaner.de mit Testkarten "buchen". Fuer echte
-- Zahlungen: Live-Schluessel hinterlegen, dann den Schalter ausschalten.
--
-- `abo_kontext()` liefert jetzt immer ein Objekt (auch ohne Buero) und
-- zusaetzlich, was Kasse, Portal und Kontoloeschung entscheiden muessen:
-- Betreiber, Early Adopter, ob das Buero schon einmal ein Abo hatte (der
-- Early-Adopter-Rabatt gilt nur fuer das erste), die Kuendigung und ob die
-- Buchung fuer dieses Konto freigeschaltet ist.

alter table privat.einstellungen
  add column if not exists zahlung_nur_betreiber boolean not null default true;

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
    'zahlung_bereit',      coalesce(v_e.zahlung_bereit and (not v_e.zahlung_nur_betreiber or v_frei = 'betreiber'), false),
    'freizugang',          v_frei,
    'betreiber',           coalesce(v_frei = 'betreiber', false),
    'fruehstart',          v_fs_seit is not null,
    'fruehstart_seit',     v_fs_seit,
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

create or replace function public.abo_kontext(p_nutzer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e    privat.einstellungen%rowtype;
  v_frei text;
  v_m    record;
begin
  if not exists (select 1 from auth.users u where u.id = p_nutzer) then
    return null;
  end if;
  select * into v_e from privat.einstellungen where id;
  select f.grund into v_frei from privat.freizugaenge f where f.nutzer = p_nutzer;
  select b.id as buero, m.rolle, b.stripe_kunde, a.stripe_abo, a.status, a.paket, a.kuendigung_zum
    into v_m
    from privat.buero_mitglieder m
    join privat.bueros b on b.id = m.buero
    left join privat.abos a on a.buero = b.id
   where m.nutzer = p_nutzer;
  return jsonb_build_object(
    'buero',          v_m.buero,
    'rolle',          v_m.rolle,
    'stripe_kunde',   v_m.stripe_kunde,
    'stripe_abo',     v_m.stripe_abo,
    'status',         v_m.status,
    'paket',          v_m.paket,
    'kuendigung_zum', v_m.kuendigung_zum,
    'abo_aktiv',      privat.abo_aktiv(v_m.status),
    'betreiber',      coalesce(v_frei = 'betreiber', false),
    'fruehstarter',   exists (select 1 from privat.fruehstarter f where f.nutzer = p_nutzer),
    'zahlung_bereit', coalesce(v_e.zahlung_bereit and (not v_e.zahlung_nur_betreiber or v_frei = 'betreiber'), false)
  );
end;
$$;

-- CREATE OR REPLACE behaelt die Rechte. Zur Sicherheit trotzdem ausdruecklich.
revoke all on function public.mein_zugang() from public, anon;
grant execute on function public.mein_zugang() to authenticated;
revoke all on function public.abo_kontext(uuid) from public, anon, authenticated;
grant execute on function public.abo_kontext(uuid) to service_role;
