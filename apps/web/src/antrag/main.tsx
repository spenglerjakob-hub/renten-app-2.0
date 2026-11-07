import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

/*
  OHNE KONTO, NUR MIT LINK. Der Kunde hat kein Konto beim JS-Rentenplaner —
  die Seite steht ohne Zugangsschranke. Was er sehen und einreichen darf,
  entscheidet allein die Datenbank anhand des Codes (antrag_link_pruefen,
  antrag_einreichen): Er sieht nur, WONACH gefragt ist, keine Angaben.
*/
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
