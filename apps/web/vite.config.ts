import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const hier = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Statisches Bundle, ausgeliefert ueber ein CDN. Die Berechnung laeuft im
    // Browser — die Serverlast ist damit unabhaengig von der Nutzerzahl.
    rollupOptions: {
      // Zwei Einstiegspunkte: der Rechner und die Landingpage zum
      // Altersvorsorgedepot. Die Landingpage soll schnell laden und nicht das
      // ganze Bundle des Rechners mitziehen; Rollup trennt die beiden
      // deshalb und teilt nur, was wirklich gemeinsam gebraucht wird.
      input: {
        index: resolve(hier, 'index.html'),
        altersvorsorgedepot: resolve(hier, 'altersvorsorgedepot.html'),
      },
      output: {
        manualChunks: { engine: ['@renten/engine'] },
      },
    },
  },
});
