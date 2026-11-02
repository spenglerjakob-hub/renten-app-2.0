import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite } from './Seite';
import '../index.css';

/*
  OHNE KONTO, NUR MIT LINK UND CODE. Der Mitarbeiter hat kein Konto beim
  JS-Rentenplaner — die Seite steht ohne Zugangsschranke. Was er sehen und
  unterschreiben darf, entscheidet allein die Datenbank anhand von Token und
  Code (bav_link_oeffnen, bav_link_unterschreiben).
*/
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
