import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

// Oeffentlich, ohne Anmeldung: eine echte Rechnung, bevor jemand ein Konto
// anlegt. Vorerst fuer Suchmaschinen gesperrt (noindex im HTML und in der
// .htaccess) — wie die Preisseite bis zum Start des Abos.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
