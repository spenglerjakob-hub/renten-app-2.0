import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import { Zugangsschranke } from '../Zugangsschranke';
import '../index.css';
// Schriften der beiden Stile — selbst ausgeliefert, keine Anfrage an Google. Geladen
// wird nur, was der gewaehlte Stil tatsaechlich verwendet (@font-face laedt erst bei Bedarf).
import '@fontsource-variable/source-serif-4/opsz.css'; // Steep: Ueberschriften
import '@fontsource-variable/inter-tight/wght.css'; // Seline: Ueberschriften (Ersatz fuer Roobert)
import '@fontsource-variable/inter/wght.css'; // Seline: Fliesstext

// Nur mit Konto und dem Paket „Arbeitgeber-Vorsorgemodelle“ — wie die
// Arbeitgeber-Seiten. Gespeichert wird im Konto des Beraters.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zugangsschranke bereich="ag">
      <Seite />
    </Zugangsschranke>
  </StrictMode>,
);
