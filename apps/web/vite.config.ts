import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const hier = fileURLToPath(new URL('.', import.meta.url));

const URHEBERHINWEIS = `/*! JS-Rentenplaner — (c) ${new Date().getFullYear()} Betreiber laut https://js-rentenplaner.de/impressum.
 * Alle Rechte vorbehalten. Urheberrechtlich geschuetzt (§§ 69a ff. UrhG). Kopieren, Bearbeiten,
 * Zurueckentwickeln und Weiterverwenden des Programmcodes und der Rechenlogik nur nach den
 * Nutzungsbedingungen: https://js-rentenplaner.de/nutzungsbedingungen */`;

export default defineConfig({
  plugins: [react()],
  // Der Web Worker (Projektion im Hintergrund) wird getrennt gebaut — er
  // traegt die ganze Engine und bekommt denselben Hinweis.
  worker: { rollupOptions: { output: { banner: URHEBERHINWEIS } } },
  build: {
    target: 'es2022',
    // Statisches Bundle, ausgeliefert ueber ein CDN. Die Berechnung laeuft im
    // Browser — die Serverlast ist damit unabhaengig von der Nutzerzahl.
    rollupOptions: {
      // Einstiegspunkte: der Rechner, die Landingpage zum
      // Altersvorsorgedepot, der Vorsorge-Check, die drei
      // Arbeitgeber-Seiten (Matching-Modell, Zuschussmodell, Festbetrag) sowie
      // Impressum, Datenschutz und Nutzungsbedingungen (ein Bundle, drei Seiten). Die Landingpages sollen
      // schnell laden und nicht das ganze Bundle des Rechners mitziehen;
      // Rollup trennt sie deshalb und teilt nur, was wirklich gemeinsam
      // gebraucht wird.
      input: {
        index: resolve(hier, 'index.html'),
        altersvorsorgedepot: resolve(hier, 'altersvorsorgedepot.html'),
        check: resolve(hier, 'vorsorge-check.html'),
        arbeitgeber: resolve(hier, 'arbeitgeber.html'),
        zuschuss: resolve(hier, 'zuschussmodell.html'),
        festbetrag: resolve(hier, 'festbetrag.html'),
        bkv: resolve(hier, 'bkv.html'),
        impressum: resolve(hier, 'impressum.html'),
        datenschutz: resolve(hier, 'datenschutz.html'),
        nutzungsbedingungen: resolve(hier, 'nutzungsbedingungen.html'),
      },
      output: {
        manualChunks: { engine: ['@renten/engine'] },
        // Urheberhinweis am Anfang jeder ausgelieferten JS-Datei. Wer die
        // Programmdateien herunterlaedt, sieht als Erstes, dass sie geschuetzt
        // sind und wo die Bedingungen stehen. `/*!` haelt der Minifier stehen.
        banner: URHEBERHINWEIS,
      },
    },
  },
});
