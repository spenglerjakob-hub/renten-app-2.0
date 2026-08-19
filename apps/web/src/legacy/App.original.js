/*
 * BASELINE — Rechenkern des urspruenglichen Eindatei-Prototyps (App.jsx).
 *
 * Zweck: Referenz fuer Regressionsvergleiche. Die hier enthaltenen Funktionen sind
 * unveraendert uebernommen, damit die Characterization-Tests in
 * packages/engine/test/legacy-parity.test.ts das ALTE Verhalten festschreiben
 * koennen und jede Korrektur in Phase 2 als bewusste Abweichung sichtbar wird.
 *
 * Enthalten ist der Berechnungsteil. Der UI-Teil des Prototyps wurde nicht
 * uebernommen, sondern in apps/web/src/features/* neu strukturiert.
 *
 * Diese Datei wird NICHT gebaut und nicht importiert ausser von Tests.
 */



// Helper für Input-Zahlen
export const parseNum = (val) => val === '' ? '' : Number(val);

// --- STEUER-ENGINE (EStG Formel Approximation 2026) ---
export const calculateESt = (zve, isMarried) => {
  let x = isMarried ? zve / 2 : zve;
  x = Math.max(0, x - 744); 
  
  let tax = 0;
  if (x <= 11604) tax = 0;
  else if (x <= 17005) { const y = (x - 11604) / 10000; tax = (922.98 * y + 1400) * y; }
  else if (x <= 62809) { const z = (x - 17005) / 10000; tax = (208.91 * z + 2397) * z + 940.14; }
  else if (x <= 277825) tax = 0.42 * x - 9972.98;
  else tax = 0.45 * x - 18307.73;

  return isMarried ? tax * 2 : tax;
};

// --- FREIBETRAGS-ENGINE (Wachstumschancengesetz 2024 Anpassungen) ---
export const getVersorgungsfreibetrag = (retYear, annualGross) => {
    let pct = 0, maxAmt = 0, zuschlag = 0;
    if (retYear <= 2005) { pct = 0.40; maxAmt = 3000; zuschlag = 900; }
    else if (retYear <= 2020) {
        const steps = retYear - 2005;
        pct = 0.40 - steps * 0.016;
        maxAmt = 3000 - steps * 120;
        zuschlag = 900 - steps * 36;
    }
    else if (retYear <= 2022) {
        const steps = retYear - 2020;
        pct = 0.16 - steps * 0.008;
        maxAmt = 1200 - steps * 60;
        zuschlag = 360 - steps * 18;
    }
    else {
        // Ab 2023: Gestreckte Abschmelzung bis 2058 (0,4% Schritte)
        const steps = Math.max(0, retYear - 2022);
        pct = Math.max(0, 0.144 - steps * 0.004);
        maxAmt = Math.max(0, 1080 - steps * 30);
        zuschlag = Math.max(0, 324 - steps * 9);
    }
    
    const calcFreibetrag = Math.min(annualGross * pct, maxAmt);
    const actualAnnual = calcFreibetrag + zuschlag;
    
    return { 
        percent: pct * 100, 
        maxAmount: maxAmt, 
        zuschlag, 
        actualFreibetragAnnual: actualAnnual, 
        actualFreibetragMonthly: actualAnnual / 12 
    };
};

export const getRentenfreibetrag = (retYear, annualGross) => {
    const steps = Math.max(0, retYear - 2022);
    // WCG: Anstieg des steuerpflichtigen Teils um 0,5% pro Jahr ab 2023 (bis 100% in 2058)
    const taxablePercent = Math.min(1.0, 0.82 + steps * 0.005);
    const freePercent = 1 - taxablePercent;
    const actualAnnual = annualGross * freePercent;
    
    return { 
        percent: freePercent * 100, 
        taxablePercent: taxablePercent * 100, 
        actualFreibetragAnnual: actualAnnual, 
        actualFreibetragMonthly: actualAnnual / 12 
    };
};

// --- BEAMTEN-BESOLDUNG ---
export const besoldungsgruppen = ['A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'B1', 'B2', 'B3'];
export const besoldungsLaender = { 
  'Bund': 1.05, 'Baden-Württemberg': 1.04, 'Bayern': 1.05, 'Berlin': 0.98, 'Brandenburg': 0.99, 
  'Bremen': 1.0, 'Hamburg': 1.03, 'Hessen': 1.04, 'Mecklenburg-Vorpommern': 0.98, 'Niedersachsen': 1.0, 
  'Nordrhein-Westfalen': 1.0, 'Rheinland-Pfalz': 1.01, 'Saarland': 0.99, 'Sachsen': 1.02, 
  'Sachsen-Anhalt': 0.99, 'Schleswig-Holstein': 1.0, 'Thüringen': 0.99 
};

export const getBesoldung = (gruppe, stufe, land, isMarried, hasChildren) => {
  const baseData = {
    'A7': { b: 2700, s: 90 }, 'A8': { b: 2900, s: 100 }, 'A9': { b: 3200, s: 110 },
    'A10': { b: 3400, s: 130 }, 'A11': { b: 3800, s: 140 }, 'A12': { b: 4100, s: 160 },
    'A13': { b: 4700, s: 180 }, 'A14': { b: 4900, s: 210 }, 'A15': { b: 5800, s: 250 },
    'A16': { b: 6400, s: 280 }, 'B1': { b: 7200, s: 0 }, 'B2': { b: 8500, s: 0 }, 'B3': { b: 9000, s: 0 }
  };
  const d = baseData[gruppe] || baseData['A13'];
  let salary = d.b + (Math.max(1, stufe) - 1) * d.s;
  salary *= (besoldungsLaender[land] || 1.0);
  
  if (isMarried) salary += 150;
  if (hasChildren) salary += 300; 
  return salary;
};

// --- Ertragsanteil ---
export const getErtragsanteil = (age) => {
  const tabelle = { 60: 0.22, 61: 0.22, 62: 0.21, 63: 0.20, 64: 0.19, 65: 0.18, 66: 0.18, 67: 0.17, 68: 0.16, 69: 0.15, 70: 0.15, 71: 0.14, 72: 0.14, 73: 0.13, 74: 0.13, 75: 0.12 };
  if (age < 60) return 0.22; if (age > 75) return 0.11; return tabelle[age] || 0.17;
};

export const getGrvAbschlag = (retAgeExact) => {
  if (retAgeExact >= 67) return 0;
  const monthsEarly = Math.ceil((67 - retAgeExact) * 12);
  return Math.min(0.144, monthsEarly * 0.003);
};

export const parseDateValues = (str) => {
    if (!str) return null;
    if (str.includes('.')) {
        const parts = str.split('.');
        if (parts.length === 3 && parts[2].length === 4) {
            return { d: Number(parts[0]), m: Number(parts[1]), y: Number(parts[2]) };
        }
    } else if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length >= 2) {
             return { y: Number(parts[0]), m: Number(parts[1]), d: 1 };
        }
    }
    return null;
};

export const diffInYears = (startStr, endStr) => {
  const v1 = parseDateValues(startStr);
  const v2 = parseDateValues(endStr);
  if (!v1 || !v2) return 0;
  return (v2.y - v1.y) + (v2.m - v1.m) / 12 + (v2.d - v1.d) / 365.25;
};

export const getCurrentDateStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export const formatDateInput = (value) => {
  const cleaned = value.replace(/\D/g, '');
  let formatted = '';
  if (cleaned.length > 0) formatted += cleaned.substring(0, 2);
  if (cleaned.length > 2) formatted += '.' + cleaned.substring(2, 4);
  if (cleaned.length > 4) formatted += '.' + cleaned.substring(4, 8);
  return formatted;
};
