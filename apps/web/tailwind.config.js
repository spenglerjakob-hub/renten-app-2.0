/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
        Rollen der bAV-Mitarbeiterberatung (/mitarbeiterberatung). Die Werte
        setzt der gewaehlte Stil als CSS-Variablen (index.css: .mb-steep,
        .mb-seline). Nur auf dieser Seite verwendet.
      */
      colors: {
        mb: Object.fromEntries([
          'tinte', 'flaeche', 'karte', 'innen', 'linie', 'schiefer', 'asche', 'dunkel', 'hover',
          'luecke', 'daten-2', 'daten-3', 'knopf', 'knopf-rand', 'knopf-schrift', 'knopf-hover', 'zweit-rand',
        ].map((rolle) => [rolle, `rgb(var(--mb-${rolle}) / <alpha-value>)`])),
      },
    },
  },
  plugins: [],
};
