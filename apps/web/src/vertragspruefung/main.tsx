import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seite, SPEICHER_VERTRAGSPRUEFUNG } from './Seite';
import { Zugangsschranke } from '../Zugangsschranke';
import { szenarioSpeicherWaehlen } from '../store/szenario';
import '../index.css';

/*
  EIN EIGENER FALL. Die Vertragspruefung rechnet mit demselben Speicher wie
  der Rechner, haelt ihren Fall aber unter eigenem Schluessel — der Fall im
  Rechner bleibt unberuehrt. Muss vor dem ersten Zeichnen stehen.
*/
szenarioSpeicherWaehlen(SPEICHER_VERTRAGSPRUEFUNG);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zugangsschranke bereich="rente"><Seite /></Zugangsschranke>
  </StrictMode>,
);
