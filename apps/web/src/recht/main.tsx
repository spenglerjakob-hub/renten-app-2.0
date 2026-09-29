import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

// Ein Bundle fuer beide Seiten: welche gezeigt wird, sagt das HTML.
const seite = document.body.dataset.seite === 'datenschutz' ? 'datenschutz' : 'impressum';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite seite={seite} />
  </StrictMode>,
);
