// Chapter Left ventricular assist devices (ch/lvad.js): sizes of the heart mesh against the
// weights of the chapter's targets. Each table was measured on the mesh of each heart that the
// header can show. The chapter sets a weight from the value it prints, so the image shows it.
//
// LVIDd: the parasternal long axis at end-diastole, measured as the calipers measure it
// (meshjet.js plaxCalipers). The line runs square to the LV's long axis, from the septum to the
// posterior wall. It lies 30% of the way from the LV's middle to the mitral valve. d0: LVIDd
// (mm) by lvSize weight W with the septum at its own place (sep 0); d1: the same with sep 1. The
// septum's move narrows the LV on this line, so the LVIDd is d0 + sep × (d1 − d0). null: the
// LV folds there.
const W = [-2.4, -2.2, -2.0, -1.8, -1.6, -1.4, -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6];
const LVIDD = {
  normal: { d0: [5.9, 9.3, 12.7, 16.2, 19.6, 23, 26.4, 29.8, 33.2, 36.6, 40, 43.4, 46.8, 50.2, 53.6, 57, 60.4, 63.8, 67.2, 70.6, 74], d1: [2.7, 4.5, 6.4, 10.7, 14.4, 18, 21.4, 24.9, 28.4, 31.8, 35.2, 38.6, 42.1, 45.5, 48.9, 52.3, 55.7, 59.1, 62.5, 66, 69.4] },
  amyloid: { d0: [null, null, 6.1, 9.5, 12.9, 16.2, 19.6, 23, 26.4, 29.8, 33.1, 36.5, 39.9, 43.3, 46.7, 50.1, 53.4, 56.8, 60.2, 63.6, 67], d1: [null, null, 3, 5, 6.8, 10.6, 14.5, 18.2, 21.6, 25.1, 28.5, 31.9, 35.4, 38.8, 42.2, 45.6, 49, 52.4, 55.8, 59.2, 62.6] },
  icm: { d0: [21.8, 25.2, 28.6, 32, 35.4, 38.8, 42.2, 45.6, 49, 52.4, 55.8, 59.2, 62.6, 66, 69.5, 72.8, 76.3, 79.7, 83.1, 86.5, 89.9], d1: [16.9, 20.4, 23.8, 27.2, 30.7, 34.1, 37.5, 40.9, 44.3, 47.7, 51.1, 54.6, 58, 61.4, 64.8, 68.2, 71.6, 75, 78.4, 81.8, 85.2] },
  barlow: { d0: [15.9, 19.4, 22.8, 26.2, 29.6, 33, 36.4, 39.8, 43.2, 46.6, 50, 53.4, 56.8, 60.2, 63.6, 67, 70.4, 73.8, 77.2, 80.6, 84], d1: [10.3, 14.1, 17.7, 21.2, 24.7, 28.1, 31.6, 35, 38.4, 41.8, 45.2, 48.7, 52.1, 55.5, 58.9, 62.3, 65.7, 69.1, 72.5, 76, 79.4] },
  bav: { d0: [null, 5.5, 9, 12.4, 15.8, 19.2, 22.6, 26, 29.4, 32.8, 36.2, 39.6, 43, 46.4, 49.8, 53.2, 56.6, 60, 63.4, 66.8, 70.2], d1: [null, 2.6, 4.5, 6.4, 9.9, 14.1, 17.6, 21.1, 24.6, 28.1, 31.5, 34.9, 38.4, 41.8, 45.2, 48.6, 52, 55.4, 58.8, 62.2, 65.6] },
};

// The septum's shift: the apical four-chamber view at end-diastole, on the line square to the
// LV's long axis at the middle of the LV. That middle lies half way from the middle of the mitral
// hinges to the apex. The table gives how far (mm) the septum's LV face lies toward the LV from
// its place at sep 0. Rows: lvSize weight WS; columns: sep weight SS; negative: toward the RV.
// null: the LV is too small there to measure. The septum moves about 9.3 mm toward the LV per
// unit of sep. It moves less in a small LV, where it meets the cavity's other side.
const WS = [-2.2, -1.8, -1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4];
const SS = [-0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2];
const SHIFT = {
  normal: [null, [-5.4, -2.7, 0, 2.2, 3.5, 4.2, 4.5], [-5.5, -2.7, 0, 2.5, 4.7, 6.1, 6.9], [-5.6, -2.8, 0, 2.7, 5.1, 7.2, 8.6], [-5.6, -2.8, 0, 2.7, 5.4, 7.8, 9.8], [-5.6, -2.8, 0, 2.8, 5.5, 8.1, 10.4], [-5.7, -2.8, 0, 2.8, 5.6, 8.3, 10.8], [-5.7, -2.8, 0, 2.8, 5.6, 8.4, 11.1], [-5.8, -2.9, 0, 2.9, 5.7, 8.5, 11.2], [-5.8, -2.9, 0, 2.9, 5.7, 8.5, 11.3]],
  amyloid: [null, null, [-5.2, -2.5, 0, 1.7, 2.2, 2.4, 2.4], [-5.3, -2.6, 0, 2.3, 4, 5, 5.4], [-5.4, -2.6, 0, 2.5, 4.7, 6.4, 7.6], [-5.5, -2.7, 0, 2.6, 5.1, 7.3, 9], [-5.5, -2.8, 0, 2.7, 5.3, 7.7, 9.9], [-5.6, -2.8, 0, 2.7, 5.4, 8, 10.4], [-5.6, -2.8, 0, 2.8, 5.5, 8.2, 10.8], [-5.7, -2.8, 0, 2.8, 5.6, 8.3, 11]],
  icm: [[-5.6, -2.8, 0, 2.6, 4.7, 6.1, 6.9], [-5.6, -2.8, 0, 2.7, 5.2, 7.3, 8.7], [-5.7, -2.8, 0, 2.8, 5.4, 7.9, 9.9], [-5.7, -2.8, 0, 2.8, 5.6, 8.2, 10.6], [-5.7, -2.9, 0, 2.8, 5.7, 8.4, 10.9], [-5.8, -2.9, 0, 2.8, 5.7, 8.5, 11.2], [-5.8, -2.9, 0, 2.9, 5.7, 8.5, 11.3], [-5.8, -2.9, 0, 2.9, 5.8, 8.6, 11.4], [-5.9, -2.9, 0, 2.9, 5.8, 8.6, 11.5], [-5.9, -2.9, 0, 2.9, 5.8, 8.7, 11.6]],
  barlow: [[-5.5, -2.7, 0, 2.4, 4, 4.8, 5.3], [-5.6, -2.7, 0, 2.6, 4.8, 6.5, 7.5], [-5.6, -2.8, 0, 2.7, 5.2, 7.4, 9], [-5.6, -2.8, 0, 2.8, 5.4, 7.9, 10], [-5.7, -2.8, 0, 2.8, 5.5, 8.2, 10.6], [-5.7, -2.9, 0, 2.8, 5.6, 8.3, 10.9], [-5.7, -2.9, 0, 2.8, 5.7, 8.4, 11.1], [-5.8, -2.9, 0, 2.9, 5.7, 8.5, 11.3], [-5.8, -2.9, 0, 2.9, 5.8, 8.6, 11.4], [-5.9, -2.9, 0, 2.9, 5.8, 8.6, 11.5]],
  bav: [null, null, [-5.4, -2.6, 0, 2.2, 3.8, 4.4, 4.8], [-5.5, -2.7, 0, 2.5, 4.7, 6.2, 7.2], [-5.5, -2.8, 0, 2.6, 5.1, 7.2, 8.8], [-5.6, -2.8, 0, 2.7, 5.3, 7.8, 9.8], [-5.6, -2.8, 0, 2.8, 5.5, 8.1, 10.4], [-5.7, -2.8, 0, 2.8, 5.6, 8.2, 10.8], [-5.7, -2.8, 0, 2.8, 5.6, 8.4, 11], [-5.8, -2.9, 0, 2.8, 5.7, 8.4, 11.2]],
};

// The aortic cusps in the parasternal long axis in mid-ejection (200 ms): the widest gap (mm)
// between the cusps' sections, across the aortic root. Columns: the aortic valve's drive AVX
// (0 shut, 1 fully open; cyclemodel.js). Rows: lvSize weight -1.0 and 0.4. The bicuspid heart's
// fused cusps open as a slit, at most 5 mm.
const AVX = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const AV_GAP = {
  normal: [[0, 0.7, 6, 8.3, 9.9, 11, 12.3, 13.6, 14.9, 16.2, 17.5], [0, 0.3, 6, 8.5, 10.2, 11.4, 12.8, 14.2, 15.5, 16.8, 18.1]],
  amyloid: [[0, 0, 0, 2.3, 7.5, 9, 10.5, 11.9, 13.3, 14.7, 15.8], [0, 0, 0, 2.4, 7.5, 9.4, 10.9, 12.4, 13.8, 15.2, 16.5]],
  icm: [[0, 0.5, 6, 8.4, 10.1, 11.3, 12.6, 13.9, 15.3, 16.6, 17.3], [0, 0, 5.8, 8.5, 10.3, 11.6, 13, 14.4, 15.8, 17.1, 18.5]],
  barlow: [[0, 0.4, 6, 8.4, 10.1, 11.3, 12.7, 14, 15.3, 16.6, 17.9], [0, 0, 5.7, 8.4, 10.3, 11.7, 13.1, 14.4, 15.8, 17.2, 18.5]],
  bav: [[0, 0, 0, 0, 0.6, 1.8, 2.5, 3.1, 3.8, 4.5, 4.9], [0, 0, 0, 0, 0, 1.6, 2.4, 3.1, 3.7, 4.4, 5.1]],
};

// The RV basal diameter in the apical four-chamber view at end-diastole, as meshcal.js measures
// it. It is the widest the RV cavity is in its basal third, parallel to the tricuspid annulus.
// b: the diameter (cm) by rvGrow weight G7, with lvSize and sep at 0. a0 and a1: what lvSize (rows, WS)
// and sep (columns, SS) add to it (mm), at rvGrow 0.5 and 2.5. The septum's move toward the LV
// widens the RV; a small LV pulls the septum toward it and widens the RV a little more. null: the
// LV folds there.
const G7 = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const RVB = {
  normal: { b: [3.07, 3.55, 4.03, 4.52, 5, 5.49, 5.98], a0: [[-2.3, -0.8, 0.8, 2.3, 4, 5.7, 7.3], [-2.4, -0.9, 0.6, 2.1, 3.9, 5.7, 7.6], [-2.5, -1.1, 0.5, 2, 3.8, 5.7, 7.8], [-2.6, -1.2, 0.4, 1.9, 3.6, 5.6, 7.7], [-2.7, -1.3, 0.2, 1.8, 3.5, 5.6, 7.7], [-2.8, -1.4, 0.1, 1.6, 3.4, 5.5, 7.7], [-3, -1.6, -0.1, 1.5, 3.3, 5.4, 7.7], [-3, -1.7, -0.3, 1.4, 3.1, 5.2, 7.6], [-3.1, -1.9, -0.4, 1.3, 3, 5.1, 7.5], [-3.2, -2, -0.5, 1.2, 2.9, 4.9, 7.4]], a1: [[-2.2, -0.7, 0.9, 2.4, 4, 5.8, 7.4], [-2.4, -0.8, 0.8, 2.3, 4, 6, 7.8], [-2.5, -1, 0.6, 2.2, 3.9, 6, 8.1], [-2.6, -1.1, 0.4, 2, 3.8, 5.9, 8.1], [-2.7, -1.3, 0.3, 1.9, 3.7, 5.8, 8.1], [-2.9, -1.5, 0.1, 1.8, 3.5, 5.7, 8], [-3.1, -1.7, -0.1, 1.7, 3.4, 5.6, 8], [-3.3, -1.9, -0.2, 1.5, 3.3, 5.5, 7.9], [-3.4, -2.1, -0.4, 1.4, 3.2, 5.4, 7.8], [-3.6, -2.2, -0.5, 1.3, 3.1, 5.2, 7.7]] },
  amyloid: { b: [3.03, 3.51, 4, 4.48, 4.97, 5.46, 5.94], a0: [null, [-2.3, -0.8, 0.8, 2.3, 4, 6.2, 8.3], [-2.4, -0.9, 0.6, 2.1, 3.9, 6.1, 8.3], [-2.6, -1.1, 0.4, 2, 3.8, 6, 8.2], [-2.7, -1.3, 0.2, 1.8, 3.6, 5.8, 8.1], [-2.8, -1.4, 0.1, 1.7, 3.5, 5.7, 8], [-2.9, -1.6, -0.1, 1.6, 3.3, 5.6, 7.9], [-3.2, -1.8, -0.3, 1.4, 3.2, 5.4, 7.8], [-3.3, -1.9, -0.4, 1.3, 3.1, 5.3, 7.7], [-3.6, -2.2, -0.6, 1.1, 2.9, 5.1, 7.6]], a1: [null, [-2.3, -0.7, 0.8, 2.3, 4, 6.2, 8.4], [-2.4, -0.9, 0.6, 2.2, 4, 6.2, 8.4], [-2.6, -1.1, 0.4, 2.1, 3.9, 6.1, 8.4], [-2.7, -1.4, 0.3, 1.9, 3.7, 6, 8.4], [-2.9, -1.5, 0.1, 1.8, 3.6, 5.9, 8.3], [-3.1, -1.7, -0.1, 1.7, 3.5, 5.7, 8.1], [-3.4, -2, -0.2, 1.6, 3.3, 5.6, 8], [-3.6, -2.2, -0.4, 1.4, 3.2, 5.5, 7.9], [-4, -2.4, -0.6, 1.2, 3.1, 5.3, 7.8]] },
  icm: { b: [3.04, 3.51, 4, 4.49, 4.97, 5.46, 5.95], a0: [[-2.2, -0.7, 0.8, 2.4, 4.1, 6, 8.1], [-2.3, -0.8, 0.7, 2.3, 4, 6, 8.1], [-2.4, -1, 0.5, 2.1, 3.8, 5.9, 8.1], [-2.4, -1.1, 0.4, 2, 3.7, 5.8, 8.1], [-2.6, -1.3, 0.2, 1.9, 3.6, 5.7, 8.1], [-2.7, -1.4, 0.1, 1.7, 3.5, 5.6, 8], [-2.8, -1.5, -0.1, 1.6, 3.4, 5.4, 7.9], [-2.8, -1.6, -0.2, 1.5, 3.3, 5.3, 7.7], [-2.9, -1.7, -0.3, 1.4, 3.1, 5.2, 7.6], [-3, -1.8, -0.4, 1.3, 3, 5, 7.5]], a1: [[-2.2, -0.7, 0.9, 2.5, 4.2, 6.3, 8.4], [-2.3, -0.8, 0.7, 2.3, 4.1, 6.2, 8.4], [-2.4, -1, 0.6, 2.2, 4, 6.1, 8.4], [-2.6, -1.2, 0.4, 2.1, 3.8, 6, 8.3], [-2.9, -1.5, 0.2, 1.9, 3.7, 5.9, 8.3], [-3, -1.6, 0.1, 1.8, 3.6, 5.8, 8.2], [-3.2, -1.8, -0.1, 1.7, 3.5, 5.6, 8.1], [-3.3, -2, -0.2, 1.6, 3.3, 5.5, 8], [-3.5, -2.1, -0.3, 1.4, 3.2, 5.4, 7.8], [-3.7, -2.3, -0.5, 1.3, 3.1, 5.3, 7.7]] },
  barlow: { b: [3.05, 3.53, 4.01, 4.5, 4.99, 5.47, 5.96], a0: [[-2.2, -0.7, 0.9, 2.4, 4.2, 6, 7.9], [-2.3, -0.8, 0.8, 2.3, 4, 6.1, 8.1], [-2.4, -1, 0.6, 2.2, 3.9, 5.9, 8.1], [-2.5, -1.1, 0.4, 2, 3.7, 5.8, 8.1], [-2.6, -1.2, 0.3, 1.9, 3.6, 5.7, 8], [-2.7, -1.3, 0.1, 1.8, 3.5, 5.6, 7.9], [-2.9, -1.6, -0.1, 1.6, 3.4, 5.5, 7.9], [-3, -1.7, -0.2, 1.5, 3.2, 5.3, 7.7], [-3, -1.8, -0.3, 1.4, 3.1, 5.1, 7.6], [-3.1, -1.9, -0.4, 1.3, 3, 5, 7.5]], a1: [[-2.1, -0.5, 1, 2.6, 4.3, 6.2, 8.2], [-2.2, -0.7, 0.9, 2.4, 4.2, 6.2, 8.4], [-2.4, -0.9, 0.7, 2.3, 4, 6.1, 8.4], [-2.5, -1.1, 0.5, 2.1, 3.9, 6, 8.3], [-2.7, -1.3, 0.3, 2, 3.7, 5.9, 8.3], [-2.8, -1.4, 0.1, 1.9, 3.6, 5.8, 8.2], [-3.1, -1.7, -0.1, 1.7, 3.5, 5.7, 8.1], [-3.3, -1.9, -0.2, 1.6, 3.3, 5.6, 8], [-3.4, -2.1, -0.3, 1.4, 3.2, 5.4, 7.9], [-3.6, -2.2, -0.5, 1.3, 3.1, 5.3, 7.7]] },
  bav: { b: [2.88, 3.36, 3.84, 4.33, 4.8, 5.29, 5.78], a0: [[-1.9, -0.7, 0.7, 2.2, 3.9, 5.8, 7.6], [-2, -0.8, 0.6, 2, 3.8, 5.8, 7.8], [-2, -0.9, 0.4, 1.9, 3.6, 5.7, 7.8], [-2.1, -1, 0.3, 1.8, 3.5, 5.6, 7.8], [-2.2, -1.1, 0.2, 1.6, 3.4, 5.5, 7.8], [-2.3, -1.2, 0, 1.5, 3.2, 5.4, 7.7], [-2.6, -1.4, -0.2, 1.3, 3.1, 5.3, 7.7], [-2.7, -1.5, -0.3, 1.2, 3, 5.2, 7.6], [-2.7, -1.6, -0.4, 1.1, 2.9, 5, 7.5], [-2.8, -1.7, -0.6, 1, 2.7, 4.9, 7.3]], a1: [[-1.8, -0.5, 0.9, 2.4, 4, 6, 7.8], [-1.9, -0.6, 0.7, 2.3, 4, 6.1, 8.1], [-2, -0.7, 0.6, 2.1, 3.9, 6.1, 8.2], [-2.1, -0.9, 0.4, 2, 3.8, 6, 8.2], [-2.2, -1, 0.3, 1.9, 3.7, 5.9, 8.2], [-2.4, -1.2, 0.1, 1.8, 3.5, 5.8, 8.1], [-2.7, -1.5, -0.2, 1.6, 3.4, 5.7, 8.1], [-2.9, -1.7, -0.3, 1.5, 3.3, 5.6, 8], [-3.1, -1.9, -0.4, 1.3, 3.1, 5.4, 7.9], [-3.3, -2.1, -0.6, 1.2, 3, 5.3, 7.7]] },
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** The row below x in xs and the fraction to the next: [i, t], held to the table. */
function cell(xs, x) {
  if (x <= xs[0]) return [0, 0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return [i - 1, (x - xs[i - 1]) / (xs[i] - xs[i - 1])];
  return [xs.length - 2, 1];
}

/** The rows of heart key's LVIDd table where the LV holds its shape (no null). */
function lvRows(heart) {
  const T = LVIDD[heart] || LVIDD.normal, i0 = T.d0.findIndex((x) => x !== null);
  return { T, i0 };
}
/** LVIDd (mm) at lvSize weight w and sep weight s on heart key. */
export function lviddAt(heart, w, s) {
  const { T, i0 } = lvRows(heart), xs = W.slice(i0);
  const [i, t] = cell(xs, w), d0 = lerp(T.d0[i0 + i], T.d0[i0 + i + 1], t), d1 = lerp(T.d1[i0 + i], T.d1[i0 + i + 1], t);
  return d0 + s * (d1 - d0);
}
/** The lvSize weight whose LVIDd is mm with the septum at sep weight s on heart key; held to the table. */
export function lvSizeAt(heart, mm, s) {
  const { i0 } = lvRows(heart);
  let lo = W[i0], hi = W[W.length - 1];
  if (lviddAt(heart, lo, s) >= mm) return lo;
  if (lviddAt(heart, hi, s) <= mm) return hi;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (lviddAt(heart, m, s) < mm) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** The smallest LVIDd (mm) heart key draws with its LV in shape. */
export const lviddLeast = (heart) => { const { T, i0 } = lvRows(heart); return T.d0[i0]; };

/** The septum's shift (mm toward the LV) at lvSize weight w and sep weight s on heart key. */
export function shiftAt(heart, w, s) {
  const T = SHIFT[heart] || SHIFT.normal, j0 = T.findIndex((r) => r !== null), ws = WS.slice(j0), rows = T.slice(j0);
  const [i, t] = cell(ws, w), [k, u] = cell(SS, s);
  const at = (r) => lerp(r[k], r[k + 1], u);
  return lerp(at(rows[i]), at(rows[i + 1]), t);
}
/** The sep weight whose shift is mm (toward the LV; negative toward the RV) at lvSize weight w on heart key; held to the table. */
export function sepAt(heart, mm, w) {
  let lo = SS[0], hi = SS[SS.length - 1];
  if (shiftAt(heart, w, lo) >= mm) return lo;
  if (shiftAt(heart, w, hi) <= mm) return hi;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (shiftAt(heart, w, m) < mm) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * The lvSize and sep weights that show LVIDd lviddMm with the septum shifted shiftMm toward the
 * LV on heart key: { size, sep }. The two act on each other. The septum's move narrows the LV on
 * the caliper line, and the LV's size sets how far the septum moves. So each is found again from
 * the other until both hold.
 */
export function vadWeights(heart, lviddMm, shiftMm) {
  let sep = shiftMm / 9.3, size = 0;
  for (let k = 0; k < 6; k++) {
    size = lvSizeAt(heart, lviddMm, sep);
    sep = sepAt(heart, shiftMm, size);
  }
  return { size, sep };
}

/** The aortic cusps' gap (mm) at drive x (0 shut to 1 open) with lvSize weight w on heart key. */
export function avGapAt(heart, w, x) {
  const T = AV_GAP[heart] || AV_GAP.normal, t = clamp((w + 1.0) / 1.4, 0, 1);
  const [i, u] = cell(AVX, clamp(x, 0, 1));
  return lerp(lerp(T[0][i], T[0][i + 1], u), lerp(T[1][i], T[1][i + 1], u), t);
}
/** The least drive (0 to 1) at which heart key's cusps part by mm, at lvSize weight w. */
export function avDriveFor(heart, mm, w = 0.4) {
  if (avGapAt(heart, w, 1) < mm) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (avGapAt(heart, w, m) < mm) lo = m; else hi = m; }
  return hi;
}

/** What lvSize weight w and sep weight s add (cm) to the RV basal diameter at rvGrow g on heart key. */
function rvAdd(heart, w, s, g) {
  const T = RVB[heart] || RVB.normal, j0 = T.a0.findIndex((r) => r !== null), ws = WS.slice(j0);
  const [i, t] = cell(ws, w), [k, u] = cell(SS, s);
  const at = (R) => { const r0 = R[j0 + i], r1 = R[j0 + i + 1]; return lerp(lerp(r0[k], r0[k + 1], u), lerp(r1[k], r1[k + 1], u), t); };
  return lerp(at(T.a0), at(T.a1), clamp((g - 0.5) / 2, -0.25, 1.25)) / 10;
}
/** The rvGrow weight whose RV basal diameter is cm at lvSize weight w and sep weight s on heart key; held to the table. */
export function rvGrowAt(heart, cm, w, s) {
  const b = (RVB[heart] || RVB.normal).b;
  const inv = (y) => {
    if (y <= b[0]) return G7[0];
    for (let i = 1; i < b.length; i++) if (y <= b[i]) return lerp(G7[i - 1], G7[i], (y - b[i - 1]) / (b[i] - b[i - 1]));
    return G7[G7.length - 1];
  };
  let g = inv(cm - rvAdd(heart, w, s, 1.5));
  for (let k = 0; k < 3; k++) g = inv(cm - rvAdd(heart, w, s, g));
  return g;
}
