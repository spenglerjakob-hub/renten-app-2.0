import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Zugangsschranke } from './Zugangsschranke';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zugangsschranke>
      <App />
    </Zugangsschranke>
  </StrictMode>,
);
