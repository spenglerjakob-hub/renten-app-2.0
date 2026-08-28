-- Nachtrag zur Tabelle public.szenarien.
--
-- TRUNCATE umgeht Row Level Security vollstaendig. Solange die Rolle
-- authenticated dieses Recht besitzt, koennte jeder angemeldete Nutzer die
-- Daten ALLER Nutzer auf einen Schlag loeschen — keine Policy greift dabei.
-- Das Recht stammt aus den Standardvergaben von Supabase im public-Schema,
-- nicht aus der Anwendungsmigration; ein blosses grant der gewuenschten
-- Rechte entfernt es nicht.
--
-- Der Sicherheitsberater von Supabase meldet diesen Fall nicht — aufgefallen
-- ist er nur durch eine Pruefung der tatsaechlich vergebenen Rechte.
--
-- Fuer Neuinstallationen ist die Korrektur bereits in der Hauptmigration
-- enthalten; diese Datei zieht bestehende Datenbanken nach.
revoke truncate, references, trigger on public.szenarien from authenticated;
revoke all on public.szenarien from anon;
