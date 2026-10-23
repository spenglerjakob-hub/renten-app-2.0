/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
        Tokens der bAV-Mitarbeiterberatung (/mitarbeiterberatung), nach der
        Stilreferenz „Steep“: fast farblos, Tinte statt Indigo, ein warmer
        Pfirsich-Akzent mit Siena-Schrift. Nur auf dieser Seite verwendet.
      */
      colors: {
        mb: {
          tinte: '#17191c',     // Text, gefuellte Knoepfe — die einzige dunkle Flaeche
          nebel: '#f2f2f3',     // Karten
          dunst: '#fafafb',     // Flaechen eine Stufe ueber Weiss
          linie: '#e4e4e7',     // Haarlinien, Rahmen von Eingabefeldern
          schiefer: '#6e727c',  // Nebentext (Steep: #777b86, dunkler fuer 4,5:1 auf Weiss)
          asche: '#979799',     // Etiketten ohne Gewicht
          pfirsich: '#fbe1d1',  // Akzentkarte — hoechstens einmal je Ansicht
          siena: '#5d2a1a',     // Schrift und Linien auf Pfirsich, sonst nirgends
        },
      },
      fontFamily: {
        // Serifen fuer Ueberschriften, immer Gewicht 400 (Steep: Signifier)
        titel: ['"Source Serif 4 Variable"', 'Georgia', 'serif'],
      },
      boxShadow: {
        // Nur fuer schwebende Artefakte (Gehaltszettel, Luecken-Ring) — Inhaltskarten bleiben flach
        schwebend: '0 0 0 1px rgba(4,23,43,0.05), 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
};
