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
    note: 'Copenhagen City Heart Study: 1,969 adults, color tissue Doppler M-mode. IVRT lengthens with age.',
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
      ['Pulmonary artery wedge pressure, mean', '≤12 mmHg'],
      ['Cardiac output', '4–8 L/min'],
      ['Cardiac index', '2.5–4.0 L/min/m²'],
      ['Stroke volume', '60–100 mL'],
    ],
    note: 'Pulmonary hypertension is defined by a mean PA pressure above 20 mmHg at rest. The same guideline keeps a wedge pressure of 15 mmHg as the cut-off between pre-capillary and post-capillary pulmonary hypertension.',
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
    note: 'Adapted from Fowler (1980). These are textbook values, not guideline criteria.',
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
    note: 'Collapse is assessed with a sniff. A single value, not a range, should be reported.',
    ref: 'mukherjee2025',
  },
  {
    title: 'Left ventricle and left atrium (2D)',
    head: ['Measurement', 'Women', 'Men'],
    rows: [
      ['LVEF, biplane (%)', '54–74', '52–72'],
      ['LV end-diastolic volume index (mL/m²)', '29–61', '34–74'],
      ['LV end-systolic volume index (mL/m²)', '8–24', '11–31'],
      ['LV diameter, end-diastole (mm)', '38–52', '42–58'],
      ['LV diameter, end-systole (mm)', '22–35', '25–40'],
      ['Septum, end-diastole (mm)', '6–9', '6–10'],
      ['Inferolateral wall, end-diastole (mm)', '6–9', '6–10'],
      ['LV mass index, linear (g/m²)', '43–95', '49–115'],
      ['Relative wall thickness', '≤0.42', '≤0.42'],
      ['LA volume index (mL/m²)', '16–34', '16–34'],
    ],
    note: 'Values are the mean ± 2 SD of healthy adults. LVEF is mildly abnormal at 41–51% in men and 41–53% in women, moderately abnormal at 30–40% and severely abnormal below 30%. The LA volume index is mildly abnormal at 35–41, moderately at 42–48 and severely above 48 mL/m².',
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
    note: 'On serial studies, a relative change of 10–15% is likely to be significant; the same vendor and software should be used.',
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
    note: 'The diagnosis of HFmrEF or HFpEF also requires evidence of raised filling pressure at rest or during stress.',
    ref: 'heidenreich2022',
  },
  {
    title: 'Right heart',
    head: ['Measurement', 'Normal', 'Mild', 'Moderate', 'Severe'],
    rows: [
      ['TAPSE (mm)', '>17', '≤17 to >13', '≤13 to >10', '≤10'],
      ['RV S′ (cm/s)', '>9.5', '≤9.5 to >7.2', '≤7.2 to >5.0', '≤5.0'],
      ['Fractional area change (%)', '>35', '≤35 to >29', '≤29 to >22', '≤22'],
      ['RV free-wall strain, absolute (%)', '>20', '≤20 to ≥15', '<15 to ≥11', '<11'],
      ['RV basal diameter (cm)', '<4.1', '4.1–4.4', '>4.4 to 4.9', '>4.9'],
      ['RV mid diameter (cm)', '<3.5', '3.5–3.8', '>3.8 to 4.2', '>4.2'],
      ['RV wall thickness (mm)', '<5', '5–7', '>7 to 9', '>9'],
      ['RA area (cm²)', '<19', '19–22', '>22 to 24', '>24'],
      ['RA volume index (mL/m²)', '<30', '30–36', '>36 to 41', '>41'],
      ['Peak TR velocity (m/s)', '<2.8', '2.8–3.1', '3.2–3.5', '≥3.6'],
    ],
    note: 'Abnormal denotes mild or worse. A resting peak TR velocity ≥2.9 m/s, or ≥2.8 m/s with two other signs, suggests pulmonary hypertension.',
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
    note: 'The algorithm does not apply in atrial fibrillation, mitral stenosis, severe primary MR, moderate or severe annular calcification, mitral repair or replacement, heart transplantation, LVAD support, constriction or non-cardiac pulmonary hypertension.',
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
    note: 'Any one criterion suggests severe stenosis; concordance of all criteria is preferred. Very severe stenosis is defined by a Vmax ≥5 m/s or a mean gradient ≥60 mmHg.',
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
    note: 'The mean gradient applies at a heart rate of 60–80 bpm. ACC/AHA defines severe stenosis as an MVA ≤1.5 cm², which corresponds to a pressure half-time ≥150 ms.',
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
      ['PISA radius at Nyquist 30–40 cm/s (cm)', '<0.3', 'intermediate', '≥1.0'],
      ['Color jet (Nyquist 50–70 cm/s)', 'small, central', 'variable', '>50% of LA or wall-hugging'],
      ['CW signal', 'faint, partial', 'dense, partial', 'dense, triangular'],
      ['Pulmonary vein flow', 'systolic dominant', 'systolic blunting', 'systolic reversal'],
    ],
    note: 'In secondary MR (crescent-shaped orifice) and in low-flow states, the EROA and the regurgitant volume of severe regurgitation can be lower.',
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
    note: 'The pressure half-time shortens as LV diastolic pressure rises.',
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
      ['IVC diameter (cm)', '≤2.0', '2.1–2.5', '>2.5'],
    ],
    note: 'Grades beyond severe (EACVI): massive, with a vena contracta of 1.4–2.0 cm, and torrential, with a vena contracta ≥2.1 cm.',
    ref: 'zoghbi2017,lancellotti2022',
  },
];

// ------------------------------------------------------------------ cut-off helpers
// LVEF band and words (Lang 2015 Table 4 partitions).
export function lvefBand(ef, sex = 'M') {
  const lo = sex === 'F' ? 54 : 52;
  if (ef >= lo) return ef > 74 ? 'hyperdynamic' : 'normal';
  if (ef >= 41) return 'mildly abnormal';
  if (ef >= 30) return 'moderately abnormal';
  return 'severely abnormal';
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
/**
 * The RA pressure estimate of chapter 18 (Mukherjee 2025: Table 4, Figure 3 and p160).
 *   d: IVC diameter at end-expiration (cm); col: collapse (%), with a sniff, or with quiet
 *   breathing when the patient cannot sniff; mode: 'sniff' | 'quiet' | 'ppv' (positive-pressure
 *   ventilation); sec: secondary signs of a raised RA pressure, 'none' | 'present' | 'unclear';
 *   reflux: dilated hepatic veins and reflux of flow into the IVC (here, severe TR).
 * Sniff: ≤2.1 cm and ≥50% gives 3 mmHg; >2.1 cm and <50% gives 15; the two mixed patterns are
 * indeterminate, and the secondary signs take them to 3 (none), 15 (present) or 8 (unclear).
 * Quiet breathing (cut-off 20%): ≤2.1 cm gives 3 or 8, >2.1 cm gives 8 or 15. Ventilation: the
 * collapse is not used; the secondary signs show a normal or a raised RA pressure, and 8 mmHg is
 * used if uncertainty remains. >2.5 cm without collapse, with dilated hepatic veins and reflux:
 * 20 mmHg can be considered.
 */
export function rapEstimate({ d, col, mode = 'sniff', sec = 'unclear', reflux = false }) {
  const dilated = d > 2.1;
  if (mode === 'ppv') {
    const level = sec === 'none' ? 'normal' : sec === 'present' ? 'raised' : null;
    return { mode, dilated, cut: null, collapses: null, indeterminate: false, secUsed: true, rap: level ? null : 8, level, consider20: false };
  }
  const cut = mode === 'quiet' ? 20 : 50;
  const collapses = col >= cut;
  let rap, indeterminate = false;
  if (mode === 'quiet') rap = dilated ? (collapses ? 8 : 15) : (collapses ? 3 : 8);
  else if (!dilated && collapses) rap = 3;
  else if (dilated && !collapses) rap = 15;
  else { indeterminate = true; rap = sec === 'none' ? 3 : sec === 'present' ? 15 : 8; }
  const consider20 = d > 2.5 && !collapses && !!reflux;
  return { mode, dilated, cut, collapses, indeterminate, secUsed: indeterminate, rap, level: rap === 3 ? 'normal' : rap === 8 ? 'intermediate' : 'raised', consider20 };
}
/** The range of an RA pressure value (Mukherjee 2025 Table 4). */
export const RAP_RANGE = { 3: '0–5', 8: '5–10', 15: '10–20' };
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
// Aortic stenosis, Baumgartner 2017 Table 3: the grade bands of each criterion as printed, each
// with the test for its values. Very severe: Otto 2020 Table 13 (stage C1). Low flow: a stroke
// volume index <35 mL/m² (Baumgartner 2017). Each list runs from the mildest band.
export const AS_BANDS = {
  vmax: [['sclerosis', '≤2.5', (x) => x <= 2.5], ['mild', '2.6–2.9', (x) => x < 3], ['moderate', '3.0–4.0', (x) => x < 4], ['severe', '≥4.0', (x) => x < 5], ['very severe', '≥5', () => true]],
  mg: [['mild', '<20', (x) => x < 20], ['moderate', '20–40', (x) => x < 40], ['severe', '≥40', (x) => x < 60], ['very severe', '≥60', () => true]],
  ava: [['mild', '>1.5', (x) => x > 1.5], ['moderate', '1.0–1.5', (x) => x >= 1.0], ['severe', '<1.0', () => true]],
  avai: [['mild', '>0.85', (x) => x > 0.85], ['moderate', '0.60–0.85', (x) => x >= 0.6], ['severe', '<0.6', () => true]],
  vr: [['mild', '>0.50', (x) => x > 0.5], ['moderate', '0.25–0.50', (x) => x >= 0.25], ['severe', '<0.25', () => true]],
  svi: [['normal flow', '≥35', (x) => x >= 35], ['low flow', '<35', () => true]],
};
/**
 * The questions that name an aortic stenosis pattern (Baumgartner 2017): a high gradient (peak
 * velocity ≥4 m/s or mean gradient ≥40 mmHg), very severe (≥5 m/s or ≥60 mmHg, Otto 2020), an
 * AVA <1.0 cm², an LVEF <50% and low flow (stroke volume index <35 mL/m²).
 */
export function asCriteria({ vmax, mean, ava, svi, ef }) {
  return { high: vmax >= 4 || mean >= 40, vhigh: vmax >= 5 || mean >= 60, area: ava < 1.0, ef: ef < 50, flow: svi < 35 };
}
/**
 * The aortic stenosis pattern on the echo. A high gradient grades severe stenosis whatever the
 * area, with LV dysfunction at an LVEF <50% (Otto 2020). An AVA <1.0 cm² with a low gradient is
 * classical low-flow, low-gradient (LVEF <50%), paradoxical low-flow, low-gradient (LVEF ≥50%,
 * low flow) or normal-flow, low-gradient (LVEF ≥50%, normal flow). Else the gradient grades the
 * valve. The ACC/AHA stages C and D also need the symptoms, which an echo cannot give.
 */
export function asGrade(v) {
  const c = asCriteria(v);
  if (c.high) return c.ef ? 'severe, LV dysfunction' : c.vhigh ? 'very severe' : 'severe';
  if (c.area) return c.ef ? 'classical LF-LG' : c.flow ? 'paradoxical LF-LG' : 'NF-LG';
  if (v.vmax >= 3 || v.mean >= 20) return 'moderate';
  if (v.vmax > 2.5) return 'mild';
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
