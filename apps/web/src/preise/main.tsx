import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

// Oeffentlich, ohne Anmeldung — wie die Rechtsseiten. Vorerst unverlinkt und
// fuer Suchmaschinen gesperrt (noindex in preise.html und .htaccess).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
