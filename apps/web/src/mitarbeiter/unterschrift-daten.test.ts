import { describe, expect, it } from 'vitest';
import {
  DOKUMENT_NAME, dokumenteFuer, dokumenteText, pruefsummeKurz, tinte, tinteGenug, vermerkText, zeitpunktText,
  zugAusStrichen, zugGueltig, zugRahmen, type Strich,
} from './unterschrift-daten';

const nbsp = (s: string) => s.replace(/\s/g, ' ');

describe('Der Linienzug aus den Strichen', () => {
  it('normiert auf die Breite 1000, glaettet mit Q-Kurven, rundet auf eine Stelle', () => {
    // Feld 500 px breit → Faktor 2
    const s: Strich = [[10, 10], [20, 15], [30.04, 10], [40, 20]];
    const zug = zugAusStrichen([s], 500, 150);
    expect(zug).toBe('M20 20Q40 30 50.1 25Q60.1 20 70.1 30L80 40');
    expect(zugGueltig(zug)).toBe(true);
  });

  it('laesst dicht liegende Punkte weg und haelt die Grenzen des Feldes', () => {
    const s: Strich = [[0, 0], [0.4, 0.4], [-50, 400], [600, -5]];
    // [0.4, 0.4] liegt zu dicht am ersten Punkt; die anderen werden auf das Feld begrenzt
    expect(zugAusStrichen([s], 500, 150)).toBe('M0 0Q0 300 500 150L1000 0');
  });

  it('ein Punkt bekommt ein winziges Stueck Linie; leere Striche entfallen', () => {
    expect(zugAusStrichen([[[100, 50]], []], 1000, 300)).toBe('M100 50L101 50');
    expect(zugAusStrichen([], 1000, 300)).toBe('');
    expect(zugAusStrichen([[[1, 1], [9, 9]]], 0, 300)).toBe('');
  });

  it('mehrere Striche haengen aneinander, jeder mit eigenem M', () => {
    const zug = zugAusStrichen([[[0, 0], [10, 10]], [[50, 50], [60, 40]]], 1000, 300);
    expect(zug).toBe('M0 0L10 10M50 50L60 40');
  });
});

describe('Pruefung wie in der Datenbank', () => {
  it('nur M, L, Q, Zahlen, Punkt und Leerzeichen; Laenge 10 bis 60000', () => {
    expect(zugGueltig('M10 10L90 90')).toBe(true);
    expect(zugGueltig('M1 1L9 9')).toBe(false);
    expect(zugGueltig('M10 10L90 90<script>')).toBe(false);
    expect(zugGueltig('M10 10L-90 90')).toBe(false);
    expect(zugGueltig('L10 10M90 90')).toBe(false);
    expect(zugGueltig(`M${'1 '.repeat(30001)}`)).toBe(false);
  });

  it('ein Tupfer ist keine Unterschrift', () => {
    expect(tinteGenug([[[10, 10], [12, 11]]], 500)).toBe(false);
    expect(tinteGenug([[[10, 10], [80, 10]]], 500)).toBe(true);
    expect(tinte([[[0, 0], [30, 40]]], 1000)).toBe(50);
  });
});

describe('Der Rahmen fuer den Druck', () => {
  it('umschliesst alle Punkte mit Rand', () => {
    expect(zugRahmen('M100 50Q200 80 300 60L400 120')).toEqual({ x: 92, y: 42, breite: 316, hoehe: 86 });
  });

  it('eine fast gerade Linie bekommt eine Mindesthoehe; Ungueltiges keinen Rahmen', () => {
    expect(zugRahmen('M100 50L400 50')?.hoehe).toBe(46);
    expect(zugRahmen('M1 1')).toBeNull();
  });
});

describe('Welche Unterlagen eine Unterschrift abdeckt', () => {
  it('Mitarbeiter: Protokoll und Vereinbarung bzw. Verzicht; Berater: das Protokoll; offen: nichts', () => {
    expect(dokumenteFuer('teilnahme', 'mitarbeiter')).toEqual(['protokoll', 'vereinbarung']);
    expect(dokumenteFuer('verzicht', 'mitarbeiter')).toEqual(['protokoll', 'verzicht']);
    expect(dokumenteFuer('teilnahme', 'berater')).toEqual(['protokoll']);
    expect(dokumenteFuer('offen', 'mitarbeiter')).toEqual([]);
    // AXA-Antrag: Der Berater unterschreibt auch dort (Einwilligung, Gespraechsprotokoll)
    expect(dokumenteFuer('teilnahme', 'berater', true)).toEqual(['protokoll', 'vereinbarung']);
    // Bei Verzicht unterschreibt er im AXA-Gespraechsprotokoll hinter der Verzichtserklaerung.
    expect(dokumenteFuer('verzicht', 'berater', true)).toEqual(['protokoll', 'verzicht']);
    expect(dokumenteFuer('verzicht', 'berater')).toEqual(['protokoll']);
    expect(dokumenteFuer('offen', 'berater', true)).toEqual([]);
    expect(dokumenteFuer('teilnahme', 'mitarbeiter', true)).toEqual(['protokoll', 'vereinbarung']);
  });

  it('in Worten', () => {
    expect(dokumenteText(['protokoll', 'vereinbarung'])).toBe('Beratungsprotokoll und Vereinbarung über Entgeltumwandlung');
    expect(dokumenteText(['protokoll'])).toBe(DOKUMENT_NAME.protokoll);
    expect(dokumenteText([])).toBe('');
    expect(dokumenteText(['protokoll', 'vereinbarung'], true)).toBe('Beratungsprotokoll und AXA-Antrag auf Entgeltumwandlung');
    expect(dokumenteText(['protokoll', 'verzicht'], true))
      .toBe('Beratungsprotokoll und Erklärung zum Verzicht auf die Entgeltumwandlung mit AXA-Gesprächsprotokoll');
    expect(dokumenteText(['protokoll', 'verzicht'])).toBe('Beratungsprotokoll und Erklärung zum Verzicht auf die Entgeltumwandlung');
  });
});

describe('Vermerk und Pruefsumme', () => {
  it('Zeit in Europe/Berlin — Sommer- und Winterzeit', () => {
    expect(nbsp(zeitpunktText('2026-10-23T12:32:00Z'))).toBe('23.10.2026 um 14:32 Uhr');
    expect(nbsp(zeitpunktText('2026-12-01T23:30:00Z'))).toBe('02.12.2026 um 00:30 Uhr');
    expect(zeitpunktText('kein Datum')).toBe('');
  });

  it('Vermerk mit Name und Zeitpunkt', () => {
    expect(nbsp(vermerkText(' Anna Beispiel ', '2026-10-23T12:32:00Z')))
      .toBe('Elektronisch unterschrieben von Anna Beispiel am 23.10.2026 um 14:32 Uhr');
  });

  it('Pruefsumme kurz in Vierergruppen', () => {
    expect(pruefsummeKurz('012b4315c906aa77ffee00112233')).toBe('012b 4315 c906 aa77');
  });
});
