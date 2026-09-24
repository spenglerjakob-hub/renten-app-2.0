import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
