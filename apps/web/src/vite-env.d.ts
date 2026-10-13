/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Rueckfallebene fuer bestehende Konfigurationen. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 'test' auf der Testseite, 'live' auf js-rentenplaner.de (Deploy-Lauf) */
  readonly VITE_UMGEBUNG?: 'test' | 'live';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
