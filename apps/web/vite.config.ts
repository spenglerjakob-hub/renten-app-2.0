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
      // Fuenf Einstiegspunkte: der Rechner, die Landingpage zum
      // Altersvorsorgedepot, der Vorsorge-Check und die beiden
      // Arbeitgeber-Seiten (Matching-Modell, Zuschussmodell). Die Landingpages sollen
      // schnell laden und nicht das ganze Bundle des Rechners mitziehen;
      // Rollup trennt sie deshalb und teilt nur, was wirklich gemeinsam
      // gebraucht wird.
      input: {
        index: resolve(hier, 'index.html'),
        altersvorsorgedepot: resolve(hier, 'altersvorsorgedepot.html'),
        check: resolve(hier, 'vorsorge-check.html'),
        arbeitgeber: resolve(hier, 'arbeitgeber.html'),
        zuschuss: resolve(hier, 'zuschussmodell.html'),
      },
      output: {
        manualChunks: { engine: ['@renten/engine'] },
      },
    },
  },
});
