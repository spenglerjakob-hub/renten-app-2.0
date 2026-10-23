import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import { Zugangsschranke } from '../Zugangsschranke';
import '../index.css';

// Nur mit Konto und dem Paket „Arbeitgeber-Vorsorgemodelle“ — wie die
// Arbeitgeber-Seiten. Gespeichert wird im Konto des Beraters.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zugangsschranke bereich="ag">
      <Seite />
    </Zugangsschranke>
  </StrictMode>,
);
