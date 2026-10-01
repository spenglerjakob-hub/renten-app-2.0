import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import { Zugangsschranke } from '../Zugangsschranke';
import { CHECK_CODE } from '../lib/check';
import '../index.css';

/*
  OHNE KONTO NUR MIT DEM LINK DES BERATERS. Der Kunde, der seinen
  persoenlichen Link (?a=<Code>) oeffnet, hat naturgemaess kein Konto — fuer
  ihn bleibt der Check offen. Ob der Code noch gilt, prueft die Seite selbst.
  Ohne Code fuehrt der Check in den eigenen Rechner; dafuer braucht es ohnehin
  ein Konto, also gilt die Schranke.
*/
const mitLink = CHECK_CODE.test(new URLSearchParams(window.location.search).get('a') ?? '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mitLink ? <Seite /> : <Zugangsschranke><Seite /></Zugangsschranke>}
  </StrictMode>,
);
