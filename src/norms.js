// Normal values and cut-offs, each with its source. The Normal values dialog shows these tables;
// the chapters use the helper functions below, so a cut-off lives in one place.

export const NORM_TABLES = [
  {
    title: 'Cardiac time intervals (healthy adults)',
    head: ['Interval', 'Mean ± SD', '95% range'],
    rows: [
      ['Isovolumic contraction time', '40 ± 10 ms', '20–59 ms'],
      ['LV ejection time', '292 ± 23 ms', '248–336 ms'],
      ['Isovolumic relaxation time', '96 ± 19 ms', '59–134 ms'],
    ],
    note: 'Copenhagen City Heart Study, 1,969 adults, color tissue Doppler M-mode. IVRT becomes longer with age.',
    ref: 'alhakak2025',
  },
  {
    title: 'Resting pressures and flow (catheter)',
    head: ['Measure', 'Normal'],
    rows: [
      ['Right atrial pressure, mean', '2–6 mmHg'],
      ['Pulmonary artery pressure, systolic', '15–30 mmHg'],
      ['Pulmonary artery pressure, diastolic', '4–12 mmHg'],
      ['Pulmonary artery pressure, mean', '8–20 mmHg'],
      ['Pulmonary artery wedge pressure, mean', '≤15 mmHg'],
      ['Cardiac output', '4–8 L/min'],
      ['Cardiac index', '2.5–4.0 L/min/m²'],
      ['Stroke volume', '60–100 mL'],
    ],
    note: 'Pulmonary hypertension: mean PA pressure above 20 mmHg at rest. The same guideline gives 12 mmHg as the upper limit of normal wedge pressure.',
    ref: 'humbert2022',
  },
  {
    title: 'Left heart and right ventricle pressures (textbook)',
    head: ['Chamber', 'Typical (range)'],
    rows: [
      ['Left atrium, mean', '8 (2–12) mmHg'],
      ['Left ventricle, peak systolic', '130 (90–140) mmHg'],
      ['Left ventricle, end-diastolic', '9 (5–12) mmHg'],
      ['Right ventricle, peak systolic', '25 (15–30) mmHg'],
      ['Right ventricle, end-diastolic', '4 (0–8) mmHg'],
    ],
    note: 'Adapted from Fowler, 1980. A textbook table, not a guideline.',
    ref: 'merck_pressures',
  },
  {
    title: 'Right atrial pressure from the IVC',
    head: ['IVC diameter and collapse', 'RA pressure'],
    rows: [
      ['≤2.1 cm and ≥50% collapse', '3 (0–5) mmHg'],
      ['≤2.1 cm and <50%, or >2.1 cm and ≥50%', '8 (5–10) mmHg'],
      ['>2.1 cm and <50% collapse', '15 (10–20) mmHg'],
      ['>2.5 cm, <50%, dilated hepatic veins, echo contrast or reflux', '20 mmHg'],
    ],
    note: 'Collapse with a sniff. Report one value, not a range.',
    ref: 'mukherjee2025',
  },
  {
    title: 'Left ventricle and left atrium (2D)',
    head: ['Measurement', 'Women', 'Men'],
    rows: [
      ['LVEF, biplane (%)', '54–74', '52–72'],
      ['LV end-diastolic volume index (mL/m²)', '29–61', '34–74'],
      ['LV end-systolic volume index (mL/m²)', '8–24', '11–31'],
      ['LV diameter, end-diastole (cm)', '3.8–5.2', '4.2–5.8'],
      ['LV diameter, end-systole (cm)', '2.2–3.5', '2.5–4.0'],
      ['Septum, end-diastole (cm)', '0.6–0.9', '0.6–1.0'],
      ['Inferolateral wall, end-diastole (cm)', '0.6–0.9', '0.6–1.0'],
      ['LV mass index, linear (g/m²)', '43–95', '49–115'],
      ['Relative wall thickness', '≤0.42', '≤0.42'],
      ['LA volume index (mL/m²)', '16–34', '16–34'],
    ],
    note: 'Mean ± 2 SD of healthy adults. LVEF: mildly abnormal 41–51% (men) or 41–53% (women), moderately 30–40%, severely <30%. LA volume index: mildly 35–41, moderately 42–48, severely >48 mL/m².',
    ref: 'lang2015',
  },
  {
    title: 'LV global longitudinal strain',
    head: ['Band', 'GLS'],
    rows: [
      ['Normal', 'more negative than −18%'],
      ['Borderline', '−16% to −18%'],
      ['Abnormal', 'less negative than −16%'],
    ],
    note: 'On serial studies, a relative change of 10–15% is likely significant. Use the same vendor and software.',
    ref: 'thomas2025',
  },
  {
    title: 'Heart failure by LVEF',
    head: ['Category', 'LVEF'],
    rows: [
      ['HFrEF (reduced)', '≤40%'],
      ['HFmrEF (mildly reduced)', '41–49%'],
      ['HFpEF (preserved)', '≥50%'],
      ['HFimpEF (improved)', 'was ≤40%, now >40%'],
    ],
    note: 'HFmrEF and HFpEF also need evidence of raised filling pressure at rest or with stress.',
    ref: 'heidenreich2022',
  },
  {
    title: 'Right heart',
    head: ['Measurement', 'Normal', 'Mild', 'Moderate', 'Severe'],
    rows: [
      ['TAPSE (cm)', '>1.7', '≤1.7 to >1.3', '≤1.3 to >1.0', '≤1.0'],
      ['RV S′ (cm/s)', '>9.5', '≤9.5 to >7.2', '≤7.2 to >5.0', '≤5.0'],
      ['Fractional area change (%)', '>35', '≤35 to >29', '≤29 to >22', '≤22'],
      ['RV free-wall strain, absolute (%)', '>20', '≤20 to ≥15', '<15 to ≥11', '<11'],
      ['RV basal diameter (cm)', '<4.1', '4.1–4.4', '>4.4 to 4.9', '>4.9'],
      ['RV mid diameter (cm)', '<3.5', '3.5–3.8', '>3.8 to 4.2', '>4.2'],
      ['RV wall thickness (cm)', '<0.5', '0.5–0.7', '>0.7 to 0.9', '>0.9'],
      ['RA area (cm²)', '<19', '19–22', '>22 to 24', '>24'],
      ['RA volume index (mL/m²)', '<30', '30–36', '>36 to 41', '>41'],
      ['Peak TR velocity (m/s)', '<2.8', '2.8–3.1', '3.2–3.5', '≥3.6'],
    ],
    note: 'Abnormal = mild or worse. A resting TR velocity ≥2.9 m/s, or ≥2.8 m/s with two other signs, suggests pulmonary hypertension.',
    ref: 'mukherjee2025',
  },
  {
    title: 'LV diastolic function and filling pressure (sinus rhythm)',
    head: ['Variable', 'Abnormal if'],
    rows: [
      ['e′ septal / lateral / average', '≤6 / ≤7 / ≤6.5 cm/s'],
      ['E/e′ septal / lateral / average', '≥15 / ≥13 / ≥14'],
      ['Peak TR velocity (if no RA pressure)', '≥2.8 m/s'],
      ['PA systolic pressure (if RA pressure known)', '≥35 mmHg'],
      ['Pulmonary vein S/D', '≤0.67'],
      ['LA reservoir strain', '≤18%'],
      ['LA volume index', '>34 mL/m²'],
      ['IVRT', '≤70 ms'],
      ['E/A, once LA pressure is high', '<2 grade 2; ≥2 grade 3'],
      ['E/A, reduced e′ the only finding', '≤0.8 grade 1'],
    ],
    note: 'Not for atrial fibrillation, mitral stenosis, severe primary MR, moderate or severe annular calcification, mitral repair or replacement, transplant, LVAD, constriction or non-cardiac pulmonary hypertension.',
    ref: 'nagueh2025',
  },
  {
    title: 'Aortic stenosis',
    head: ['Grade', 'Vmax (m/s)', 'Mean gradient (mmHg)', 'AVA (cm²)', 'AVA index (cm²/m²)', 'Velocity ratio'],
    rows: [
      ['Sclerosis', '≤2.5', '–', '–', '–', '–'],
      ['Mild', '2.6–2.9', '<20', '>1.5', '>0.85', '>0.50'],
      ['Moderate', '3.0–4.0', '20–40', '1.0–1.5', '0.60–0.85', '0.25–0.50'],
      ['Severe', '≥4.0', '≥40', '<1.0', '<0.6', '<0.25'],
    ],
    note: 'Any one criterion suggests severe stenosis; ideally all agree. Very severe: Vmax ≥5 m/s or mean gradient ≥60 mmHg.',
    ref: 'baumgartner2017,otto2020',
  },
  {
    title: 'Mitral stenosis (rheumatic)',
    head: ['Grade', 'MVA (cm²)', 'Pressure half-time (ms)', 'Mean gradient (mmHg)', 'PA systolic (mmHg)'],
    rows: [
      ['Progressive, mild', '>2.5', '<100', '<5', '<30'],
      ['Progressive, moderate', '1.6–2.5', '100–149', '5–9', '30–49'],
      ['Severe', '≤1.5', '≥150', '≥10', '≥50'],
    ],
    note: 'Mean gradient at a heart rate of 60–80 bpm. The ACC/AHA definition of severe: MVA ≤1.5 cm², pressure half-time ≥150 ms.',
    ref: 'pandian2023,otto2020',
  },
  {
    title: 'Mitral regurgitation (chronic)',
    head: ['Measure', 'Mild', 'Moderate', 'Severe'],
    rows: [
      ['Vena contracta width (cm)', '<0.3', 'intermediate', '≥0.7'],
      ['EROA, PISA (cm²)', '<0.20', '0.20–0.39', '≥0.40'],
      ['Regurgitant volume (mL)', '<30', '30–59', '≥60'],
      ['Regurgitant fraction (%)', '<30', '30–49', '≥50'],
      ['PISA radius at Nyquist 30–40 cm/s (cm)', '≤0.3', 'intermediate', '≥1.0'],
      ['Color jet (Nyquist 50–70 cm/s)', 'small, central', 'variable', '>50% of LA or wall-hugging'],
      ['CW signal', 'faint, partial', 'dense, partial', 'dense, triangular'],
      ['Pulmonary vein flow', 'systolic dominant', 'systolic blunting', 'systolic reversal'],
    ],
    note: 'Severe EROA and volume can be lower in secondary MR (crescent-shaped orifice) and in low flow.',
    ref: 'zoghbi2017',
  },
  {
    title: 'Aortic regurgitation (chronic)',
    head: ['Measure', 'Mild', 'Moderate', 'Severe'],
    rows: [
      ['Vena contracta width (cm)', '<0.3', '0.3–0.6', '>0.6'],
      ['Jet width / LVOT width (%)', '<25', '25–64', '≥65'],
      ['EROA (cm²)', '<0.10', '0.10–0.29', '≥0.30'],
      ['Regurgitant volume (mL)', '<30', '30–59', '≥60'],
      ['Regurgitant fraction (%)', '<30', '30–49', '≥50'],
      ['Pressure half-time (ms)', '>500', '500–200', '<200'],
      ['Descending aorta reversal', 'brief, early', 'intermediate', 'holodiastolic'],
    ],
    note: 'Pressure half-time becomes shorter as LV diastolic pressure rises.',
    ref: 'zoghbi2017',
  },
  {
    title: 'Tricuspid regurgitation (chronic)',
    head: ['Measure', 'Mild', 'Moderate', 'Severe'],
    rows: [
      ['Vena contracta width (cm)', '<0.3', '0.3–0.69', '≥0.7'],
      ['EROA, PISA (cm²)', '<0.20', '0.20–0.39', '≥0.40'],
      ['Regurgitant volume, PISA (mL)', '<30', '30–44', '≥45'],
      ['PISA radius, baseline shift 28 cm/s (cm)', '≤0.5', '0.6–0.9', '>0.9'],
      ['Central jet area (cm²)', '–', '–', '>10'],
      ['Hepatic vein flow', 'systolic dominant', 'systolic blunting', 'systolic reversal'],
      ['IVC diameter (cm)', '<2.0', '2.1–2.5', '>2.5'],
    ],
    note: 'Beyond severe (EACVI): massive, vena contracta 14–20 mm; torrential, ≥21 mm.',
    ref: 'zoghbi2017,lancellotti2022',
  },
];

// ------------------------------------------------------------------ cut-off helpers
// LVEF band and words (Lang 2015 Table 4 partitions).
export function lvefBand(ef, sex = 'M') {
  const lo = sex === 'F' ? 54 : 52;
  if (ef >= lo) return ef > 74 ? 'hyperdynamic' : 'normal';
  if (ef >= 41) return 'mildly reduced';
  if (ef >= 30) return 'moderately reduced';
  return 'severely reduced';
}
// HF category by LVEF (Heidenreich 2022).
export function hfCategory(ef) {
  if (ef <= 40) return 'HFrEF range';
  if (ef < 50) return 'HFmrEF range';
  return 'HFpEF range';
}
// GLS band (Thomas 2025). gls is negative.
export function glsBand(gls) {
  if (gls < -18) return 'normal';
  if (gls <= -16) return 'borderline';
  return 'abnormal';
}
// Right atrial pressure from the IVC (Mukherjee 2025 Table 4).
export function rapFromIvc(d, collapses) {
  if (d <= 2.1) return collapses ? 3 : 8;
  return collapses ? 8 : 15;
}
// Right-heart grades (Mukherjee 2025 Table 1).
export function tapseGrade(mm) {
  const cm = mm / 10;
  if (cm > 1.7) return 'normal';
  if (cm > 1.3) return 'mildly reduced';
  if (cm > 1.0) return 'moderately reduced';
  return 'severely reduced';
}
export function sPrimeGrade(v) {
  if (v > 9.5) return 'normal';
  if (v > 7.2) return 'mildly reduced';
  if (v > 5.0) return 'moderately reduced';
  return 'severely reduced';
}
export function facGrade(v) {
  if (v > 35) return 'normal';
  if (v > 29) return 'mildly reduced';
  if (v > 22) return 'moderately reduced';
  return 'severely reduced';
}
export function trvGrade(v) {
  if (v < 2.8) return 'normal';
  if (v <= 3.1) return 'mildly raised';
  if (v < 3.6) return 'moderately raised';
  return 'severely raised';
}
// Aortic stenosis grade from any one criterion (Baumgartner 2017 Table 3; very severe Otto 2020).
export function asGrade({ vmax, mean, ava }) {
  if (vmax >= 5 || mean >= 60) return 'very severe';
  if (vmax >= 4 || mean >= 40) return 'severe';
  if (ava !== undefined && ava < 1.0) return 'severe (area only)';
  if (vmax >= 3 || mean >= 20) return 'moderate';
  if (vmax > 2.5) return 'mild';
  return 'none';
}
// Mitral stenosis (Pandian 2023 Table 1).
export function msGrade(mva) {
  if (mva <= 1.5) return 'severe';
  if (mva <= 2.5) return 'progressive, moderate';
  return 'progressive, mild';
}
// Regurgitation grade by EROA (Zoghbi 2017 Tables 8, 11, 14).
export function regGrade(valve, eroa) {
  const cut = { mr: [0.2, 0.4], ar: [0.1, 0.3], tr: [0.2, 0.4] }[valve];
  if (eroa <= 0) return 'none';
  if (eroa < cut[0]) return 'mild';
  if (eroa < cut[1]) return 'moderate';
  return 'severe';
}

// Lang 2015 ranges by sex for the report: [normal lo, normal hi, mild hi, moderate hi]; above
// moderate hi is severe. Supplemental Table 3 and Table 4 (EF, LA volume).
export const LANG = {
  lvidd: { M: [4.2, 5.8, 6.3, 6.8], F: [3.8, 5.2, 5.6, 6.1], unit: 'cm' },
  ivs: { M: [0.6, 1.0, 1.3, 1.6], F: [0.6, 0.9, 1.2, 1.5], unit: 'cm' },
  pw: { M: [0.6, 1.0, 1.3, 1.6], F: [0.6, 0.9, 1.2, 1.5], unit: 'cm' },
  lvmi: { M: [49, 115, 131, 148], F: [43, 95, 108, 121], unit: 'g/m²' },
  edvi: { M: [34, 74, 89, 100], F: [29, 61, 70, 80], unit: 'mL/m²' },
  esvi: { M: [11, 31, 38, 45], F: [8, 24, 32, 40], unit: 'mL/m²' },
  lavi: { M: [16, 34, 41, 48], F: [16, 34, 41, 48], unit: 'mL/m²' },
};
/** 'normal', 'mildly', 'moderately', 'severely' (above range) or 'below' for a Lang 2015 range. */
export function langGrade(key, v, sex) {
  const [lo, hi, m1, m2] = LANG[key][sex];
  if (v < lo) return 'below';
  if (v <= hi) return 'normal';
  if (v <= m1) return 'mildly';
  if (v <= m2) return 'moderately';
  return 'severely';
}
/** LV geometry from mass index and relative wall thickness (Lang 2015, Figure 6). */
export function lvGeometry(lvmi, rwt, sex) {
  const big = lvmi > LANG.lvmi[sex][1];
  if (big) return rwt > 0.42 ? 'concentric hypertrophy' : 'eccentric hypertrophy';
  return rwt > 0.42 ? 'concentric remodeling' : 'normal geometry';
}
