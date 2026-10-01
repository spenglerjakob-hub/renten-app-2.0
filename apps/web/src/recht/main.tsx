import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite, type RechtsSeite } from './Seite';
import '../index.css';

// Ein Bundle fuer alle Rechtsseiten: welche gezeigt wird, sagt das HTML.
const angefragt = document.body.dataset.seite;
const seite: RechtsSeite = angefragt === 'datenschutz' || angefragt === 'nutzungsbedingungen' ? angefragt : 'impressum';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite seite={seite} />
  </StrictMode>,
);
