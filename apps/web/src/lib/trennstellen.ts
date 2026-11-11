/**
 * Weiche Trennstellen fuer die langen Namen der Loesungen.
 *
 * „Altersvorsorgedepot“ und „(Entgeltumwandlung)“ sind laenger als eine
 * schmale Spalte oder Karte. Die automatische Silbentrennung (`hyphens:
 * auto`) haengt am Woerterbuch des Browsers: Fehlt es, bricht das Wort ohne
 * Strich mitten durch („Entgeltumwandl|ung“). Das weiche Trennzeichen
 * (U+00AD) gilt in jedem Browser und im Druck — und ist unsichtbar, solange
 * nicht getrennt wird.
 */
export const mitTrennstellen = (text: string) => text
  .replace(/Altersvorsorgedepot/g, 'Alters­vorsorge­depot')
  .replace(/Entgeltumwandlung/g, 'Entgelt­umwandlung');
