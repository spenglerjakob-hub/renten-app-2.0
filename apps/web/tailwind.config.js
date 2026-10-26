/** @type {import('tailwindcss').Config} */
export default {
  // fassung-klassen.txt haelt die Klassen unterschriebener Unterlagen im Stylesheet (siehe dort).
  content: ['./index.html', './src/**/*.{ts,tsx}', './src/mitarbeiter/fassung-klassen.txt'],
  theme: {
    extend: {
      /*
        Die Rollen des Stils „Seline“ fuer die ganze App (Flaeche, Karte,
        Innenflaeche, Tinte, Linie, Knopf …). Die Werte stehen als
        CSS-Variablen in index.css (:root) — als RGB-Kanaele, damit
        Deckkraft geht (bg-ui-tinte/30).
      */
      colors: {
        ui: Object.fromEntries([
          'tinte', 'flaeche', 'karte', 'innen', 'linie', 'schiefer', 'asche', 'dunkel', 'hover',
          'luecke', 'daten-2', 'daten-3', 'knopf', 'knopf-rand', 'knopf-schrift', 'knopf-hover', 'zweit-rand',
          'regler', 'feld-rand',
        ].map((rolle) => [rolle, `rgb(var(--ui-${rolle}) / <alpha-value>)`])),
      },
      // Fliesstext Inter, Ueberschriften Inter Tight — beide selbst ausgeliefert (index.css).
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        titel: ['"Inter Tight Variable"', '"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
