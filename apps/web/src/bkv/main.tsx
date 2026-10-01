import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import { Zugangsschranke } from '../Zugangsschranke';
import '../index.css';

// Nur mit Konto — wie der Rechner. Die Sitzung teilen sich alle Seiten
// derselben Adresse; wer im Rechner angemeldet ist, kommt direkt durch.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zugangsschranke>
      <Seite />
    </Zugangsschranke>
  </StrictMode>,
);
