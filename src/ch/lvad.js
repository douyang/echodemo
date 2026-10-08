// Left ventricular assist devices: the echocardiogram of a patient with a HeartMate 3 (HM3), the
// continuous-flow LVAD implanted today. One slider sets the pump speed, 4,600 to 6,200 rpm in
// 100-rpm steps: the range of the HM3 ramp studies (Uriel 2017; Najjar 2020). A switch sets the
// case: a working pump, RV failure, de novo aortic regurgitation (AR) or an obstruction of the
// outflow graft. As the speed of a working pump rises, the LV narrows by 0.15 cm per 100 rpm,
// the HM3 mean of Uriel 2017. The aortic valve opens less often, the septum moves from rightward
// through neutral to leftward, and the MR falls. At the top of the range comes a suction event
// (Stainback 2015). The LV is below 3 cm, the inflow is obstructed in some beats and the TR
// worsens.
//
// The parasternal long axis and the apical four-chamber view are cut from the heart mesh
// (meshpanel.js) of the heart the page shows. The LV takes the printed LVIDd (lvSize). The
// septum takes the shift of the printed septal position (sep). Both are measured on the mesh
// (lvadcal.js). The RV takes the printed basal diameter (rvGrow, lvadcal.js). The inflow cannula is a titanium
// tube in the LV apex, built in each frame (gl/lvadmesh.js). The aortic valve opens on the
// printed beats for the printed time, and the M-mode draws the same. The Doppler strips, the
// M-mode and the ramp plot are drawn from the printed values. The values are teaching values set
// inside the ranges the sources give, not patient data.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { lazyBands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit, shown as rnd } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { mmode } from '../bmode.js';
import { reducedMotion } from '../state.js';
import { MeshPanel } from '../meshpanel.js';
import { lvByEf } from '../meshcal.js';
import { vadWeights, rvGrowAt, avGapAt, avDriveFor } from '../lvadcal.js';
import { blood, cavity, onPlane, hingesOf, closureOf, middle, area, plaxCalipers, aorticJet, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { cannulaOf, cannulaCut, onG } from '../gl/lvadmesh.js';

const KEY = 'vadS';
const CASE = 'vadCase';
const CASES = ['pump', 'rvf', 'ar', 'obst'];

// ---------------------------------------------------------------- the model
// The speed: 4,600 to 6,200 rpm in 100-rpm steps (Uriel 2017; Najjar 2020). The HM3 runs at 3,000
// to 9,000 rpm, typically 4,800 to 5,600 rpm, and its speed changes in 100-rpm steps (Estep 2024).
const RPM0 = 4600, STEPS = 16;
const stepOf = (x) => Math.round(clamp(x, 0, 1) * STEPS);
const rpmOf = (x) => RPM0 + 100 * stepOf(x);

// The septum's position as the image draws it, in the four-chamber view at end-diastole. Its
// middle lies this far (mm) toward the LV from its place on the heart's own shape at that LV
// size (lvadcal.js SHIFT). Negative: toward the RV.
const SHIFT = { right: -4.5, neutral: 0, left: 5 };
const R = 'right', N = 'neutral', L = 'left';

// The tracks, one value for each speed from 4,600 to 6,200 rpm. lvidd: LVIDd (cm) in the
// parasternal long axis; sept: the septum's position; av: the beats of three in which the aortic
// valve opens, and for how long (ms); mr, tr, ar: the vena contracta (cm; 0 none); vin: the peak
// inflow-cannula velocity of the regular beats (m/s); rvot: the RVOT VTI (cm); rvb: the RV basal
// diameter (cm). r: the pump flow at end-diastole as a share of its systolic peak; kout: the
// outflow graft's velocity for the inflow's (the graft is narrower, and narrower still at an
// obstruction); obs: the inflow velocity of the obstructed beat in a suction event (m/s).
const T17 = (v) => Array(17).fill(v);
const TRACKS = {
  // a working pump: Uriel 2017 (LVEDD -0.15 cm per 100 rpm; cardiac output +0.08 L/min per 100 rpm),
  // Stainback 2015 (the minimum and maximum speeds; suction below 3 cm), Uriel 2019 (the RV grows at
  // the highest speeds)
  pump: {
    lvidd: [6.0, 5.9, 5.7, 5.6, 5.4, 5.3, 5.1, 5.0, 4.8, 4.7, 4.5, 4.4, 4.2, 4.0, 3.6, 2.9, 2.6],
    sept: [R, R, R, R, N, N, N, N, N, N, N, N, L, L, L, L, L],
    av: [[3, 200], [3, 180], [3, 160], [2, 140], [2, 130], [1, 120], [1, 110], [1, 110], [1, 100], [0], [0], [0], [0], [0], [0], [0], [0]],
    mr: [0.5, 0.45, 0.4, 0.32, 0.26, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0, 0, 0, 0, 0],
    tr: [...T17(0.2).slice(0, 12), 0.25, 0.3, 0.35, 0.45, 0.5],
    ar: T17(0),
    vin: [0.7, 0.72, 0.74, 0.76, 0.77, 0.79, 0.8, 0.82, 0.84, 0.86, 0.87, 0.89, 0.9, 0.92, 0.94, 0.95, 0.96],
    rvot: [13, 13, 14, 14, 15, 15, 16, 16, 16, 17, 17, 17, 18, 18, 17, 14, 12],
    rvb: [...T17(3.6).slice(0, 12), 3.8, 3.9, 4.0, 4.2, 4.3],
    r: 0.4, kout: 1.55, obs: [...T17(0).slice(0, 15), 1.8, 2.0],
  },
  // RV failure: the septum bowed left, the LV small ("suck-down"), the RV dilated and more TR
  // (Stainback 2015 Table 2; Estep 2024). The cannula velocities are low, below 0.5 m/s in severe
  // failure, and so is the RVOT stroke volume. A lower speed helps
  rvf: {
    lvidd: [4.4, 4.3, 4.1, 4.0, 3.8, 3.7, 3.5, 3.4, 3.2, 3.1, 2.8, 2.7, 2.6, 2.5, 2.5, 2.4, 2.4],
    sept: [N, N, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L],
    av: T17([0]),
    mr: T17(0),
    tr: [0.45, 0.47, 0.5, 0.52, 0.55, 0.57, 0.6, 0.62, 0.65, 0.67, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.8],
    ar: T17(0),
    vin: [0.44, 0.44, 0.43, 0.43, 0.42, 0.42, 0.41, 0.41, 0.4, 0.4, 0.38, 0.38, 0.37, 0.37, 0.36, 0.36, 0.35],
    rvot: [9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6],
    rvb: [5.0, 5.0, 5.1, 5.1, 5.2, 5.2, 5.2, 5.3, 5.3, 5.3, 5.4, 5.4, 5.5, 5.5, 5.5, 5.6, 5.6],
    r: 0.55, kout: 1.55, obs: [...T17(0).slice(0, 10), 1.6, 1.6, 1.7, 1.7, 1.8, 1.8, 1.9],
  },
  // de novo AR: a blind loop (Stainback 2015). The LV unloads less: it is larger than with a
  // working pump at each speed. The pump flow is normal or high while the RVOT output falls, and
  // the AR grows with the speed. The valve stays shut from 4,900 rpm, so the AR runs through
  // systole and diastole
  ar: {
    lvidd: [6.4, 6.3, 6.2, 6.2, 6.1, 6.0, 5.9, 5.8, 5.8, 5.7, 5.6, 5.5, 5.4, 5.4, 5.3, 5.2, 5.1],
    sept: [R, R, R, R, R, R, R, N, N, N, N, N, N, N, N, N, N],
    av: [[1, 100], [1, 100], [1, 100], [0], [0], [0], [0], [0], [0], [0], [0], [0], [0], [0], [0], [0], [0]],
    mr: [0.4, 0.38, 0.36, 0.34, 0.32, 0.31, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.19, 0.18, 0.17, 0.16, 0.15],
    tr: T17(0.2),
    ar: [0.3, 0.32, 0.34, 0.36, 0.38, 0.39, 0.41, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6],
    vin: [0.82, 0.84, 0.86, 0.88, 0.89, 0.91, 0.92, 0.94, 0.96, 0.98, 0.99, 1.01, 1.02, 1.04, 1.06, 1.07, 1.08],
    rvot: [12, 12, 12, 11, 11, 11, 11, 10, 10, 10, 10, 10, 9, 9, 9, 9, 9],
    rvb: T17(3.6),
    r: 0.65, kout: 1.55, obs: T17(0),
  },
  // an obstruction of the outflow graft: the LV, the aortic valve's opening and the RVOT output do
  // not change with the speed; the LV is dilated, the septum rightward and the MR moderate; low
  // inflow velocities with little diastolic flow; at the narrowing the graft velocity is 2 m/s or
  // more (Stainback 2015 Table 2 and Figures 15 and 25)
  obst: {
    lvidd: [6.5, 6.5, 6.5, 6.4, 6.4, 6.4, 6.4, 6.4, 6.4, 6.3, 6.3, 6.3, 6.3, 6.3, 6.2, 6.2, 6.2],
    sept: T17(R),
    av: T17([3, 230]),
    mr: T17(0.45),
    tr: T17(0.25),
    ar: T17(0),
    vin: [0.48, 0.48, 0.48, 0.49, 0.49, 0.49, 0.5, 0.5, 0.5, 0.51, 0.51, 0.51, 0.52, 0.52, 0.52, 0.53, 0.53],
    rvot: T17(8),
    rvb: T17(3.6),
    r: 0.15, kout: 5.0, obs: T17(0),
  },
};
// the RVOT diameter (cm) and the heart rate (/min): the RVOT output is VTI x area x rate (Stainback 2015)
const RVOT_D = 2.2, HR = Math.round(60000 / RR);
// the artificial pulse: every 2 s the speed falls 2,000 rpm for 0.15 s, then rises 4,000 rpm for
// 0.20 s (Estep 2024). Its peak adds this share of the systolic velocity; the working pump's
// inflow peaks at no more than 1.2 m/s with it (Estep 2024)
const PULSE_UP = 0.3, PULSE_MAX = 1.2;

const caseOf = (s) => (CASES.includes(s[CASE]) ? s[CASE] : 'pump');
const heartOf = (s) => s.pheno || 'normal';
const grade = (vc) => (vc <= 0 ? 'none' : vc < 0.3 ? 'mild' : vc < 0.7 ? 'moderate' : 'severe');
// RV basal diameter (Mukherjee 2025 Table 1): normal below 4.1 cm, mildly dilated to 4.4, moderately to 4.9
const rvWord = (x) => (x < 4.1 ? 'normal' : x <= 4.4 ? 'mildly dilated' : x <= 4.9 ? 'moderately dilated' : 'severely dilated');

/**
 * The values at slider position x for case k, as printed: each at its decimals, and each
 * calculation from the rounded values. The grades and the sentences read these numbers.
 */
function measure(x, k) {
  const T = TRACKS[k], n = stepOf(x);
  const v = { x, n, k, rpm: RPM0 + 100 * n };
  v.lvidd = rnd(T.lvidd[n], 1);
  v.sept = T.sept[n];
  v.suction = v.lvidd < 3;
  const [beats, dur] = T.av[n];
  v.avBeats = beats;
  v.avDur = beats ? dur : 0;
  v.av = beats === 3 ? 'every beat' : beats ? 'intermittent' : 'closed';
  v.mr = rnd(T.mr[n], 2);
  v.tr = rnd(T.tr[n], 2);
  v.ar = rnd(T.ar[n], 2);
  v.vin = rnd(T.vin[n], 1);
  v.vinS = T.vin[n];
  v.r = T.r;
  v.kout = T.kout;
  v.vout = rnd(T.vin[n] * T.kout, 1);
  // the artificial pulse's peak in systole: a share above the regular peak, at most 1.2 m/s in
  // the inflow of a working pump
  const up = k === 'pump' ? Math.min(T.vin[n] * (1 + PULSE_UP), PULSE_MAX) : T.vin[n] * (1 + (k === 'obst' ? 0.15 : PULSE_UP));
  v.pulseIn = rnd(up, 1);
  v.pulseInS = up;
  v.pulseOut = rnd(up * T.kout, 1);
  v.obs = rnd(T.obs[n], 1);
  v.vti = T.rvot[n];
  v.co = rnd((v.vti * Math.PI * (RVOT_D / 2) ** 2 * HR) / 1000, 1);
  v.rvb = rnd(T.rvb[n], 1);
  v.grade = v.suction ? 'suction' : v.sept;
  return v;
}
let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = `${stepOf(s[KEY])}|${caseOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(s[KEY], caseOf(s)); }
  return lastShown;
}
export const gradeOf = (x, k = 'pump') => measure(x, k).grade;
/** Every speed of case k, as printed (the ramp plot, and the checks). */
export const rampOf = (k) => Array.from({ length: STEPS + 1 }, (_, n) => measure(n / STEPS, k));
/**
 * The least-squares slope (cm per 100 rpm) of the printed LVIDd over the steps n0 to n1 of case
 * k. The working pump's line ends before its LV collapses; the obstruction's line takes every step.
 */
function slopeOf(k, n0, n1) {
  const P = rampOf(k).slice(n0, n1 + 1), m = P.length;
  const mx = P.reduce((a, p) => a + p.n, 0) / m, my = P.reduce((a, p) => a + p.lvidd, 0) / m;
  let sxy = 0, sxx = 0;
  for (const p of P) { sxy += (p.n - mx) * (p.lvidd - my); sxx += (p.n - mx) ** 2; }
  return { slope: sxy / sxx, at: (n) => my + (sxy / sxx) * (n - mx), n0, n1 };
}
const LINE = { pump: [0, 12], obst: [0, 16] };

// ---------------------------------------------------------------- the beat: three beats
// The figure runs three beats in a loop, as the strips show them: 3 x 857 ms = 2,571 ms. The
// aortic valve can open in one, two or three of them. Stainback 2015 records five to six beats,
// and Najjar 2020 at least three. Two artificial pulses, 2 s apart, fall in the three beats.
const NB = 3, LOOP = NB * RR;
class Beats extends Beat {
  tick(dt, run) { this.live = run && !reducedMotion; if (this.live) this.ms = (this.ms + dt * 1000) % LOOP; return this.live; }
  /** the cursor's place across the three-beat strips, 0..1 */
  get sweep() { return this.ms / LOOP; }
  /** the beat shown, 0 to 2 */
  get index() { return Math.floor(this.ms / RR) % NB; }
}
const beat = new Beats(RR);
// the pulses: the first starts at 20 ms, so that its rise peaks with the first beat's systole at
// 230 ms; the second starts 2 s later and peaks in the third beat's diastole
const PULSES = [20, 2020];
/** The time (ms) from a pulse's start to its peak: 150 ms down, then 30% of the 200 ms of its rise. */
const PULSE_PK = 150 + 0.3 * 200;
/** The artificial pulse at loop time tl (ms): { dip, rise } shares 0..1, or null between pulses. */
function pulseAt(tl) {
  for (const p of PULSES) {
    const u = tl - p;
    if (u < 0 || u > 400) continue;
    if (u < 150) return { dip: smooth(u / 35), rise: 0 };
    if (u < 350) { const w = (u - 150) / 200; return { dip: 1 - smooth(w / 0.25), rise: w < 0.3 ? smooth(w / 0.3) : 1 - smooth((w - 0.3) / 0.7) }; }
    return { dip: 0, rise: 0 };
  }
  return null;
}
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The beats of three in which the valve opens: one in the second, two in the second and third. */
const opensOn = (v, b) => (v.avBeats === 3 ? true : v.avBeats === 2 ? b !== 0 : v.avBeats === 1 ? b === 1 : false);
/**
 * How far the valve opens for an opening of dur ms, as the cycle model's drive (0 to 1). It is
 * 0.3 at 100 ms and 0.82 at 230 ms, and at least the drive at which the heart's cusps part by 2 mm.
 * The bicuspid heart's fused cusps need about 0.55.
 */
const excursion = (dur, heart) => Math.max(clamp(0.3 + (dur - 100) * 0.004, 0.3, 0.85), avDriveFor(heart, 2));
/**
 * How far (ms) the drive's 18-ms ramps start before the printed opening and end after it. Then
 * the cusps stand more than 0.6 mm apart (lvadcal.js) for the printed time from the cycle's
 * aortic opening.
 */
function avLead(v, heart) {
  const x = excursion(v.avDur, heart), xT = Math.min(avDriveFor(heart, 0.6, meshOf(v, heart).disease.lvSize), 0.99 * x);
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (smooth(m) < xT / x) lo = m; else hi = m; }
  return 18 * lo;
}
/** The aortic valve's drive at time t of beat b for the values v on heart. */
function avDrive(v, b, t, heart = 'normal') {
  if (!opensOn(v, b)) return 0;
  const e = avLead(v, heart), t0 = EV.avo - e, t1 = EV.avo + v.avDur + e;
  if (t < t0 || t > t1) return 0;
  return excursion(v.avDur, heart) * Math.min(smooth((t - t0) / 18), smooth((t1 - t) / 18));
}
/** The pump flow's shape at time t of a beat: its systolic peak 1, r at end-diastole. */
function flowShape(t, r) {
  const u = (t - 30) / 400;
  const sys = u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 1.3) : 0;
  return r + (1 - r) * sys;
}
/**
 * The inflow-cannula velocity (m/s, toward the cannula) at loop time tl for the values v. It
 * follows the pump flow's shape and the artificial pulse: the speed's dip, then its rise. In a
 * suction event the second beat is obstructed: a short high-velocity spike in systole.
 */
function vinAt(v, tl) {
  tl = ((tl % LOOP) + LOOP) % LOOP;
  const b = Math.floor(tl / RR), t = tl - b * RR;
  let x = v.vinS * flowShape(t, v.r);
  const P = pulseAt(tl);
  if (P) x = (x + (v.pulseInS - v.vinS) * P.rise) * (1 - 0.8 * P.dip);
  if (v.obs > 0 && b === 1 && t > 90 && t < 330) x = Math.max(x, v.obs * Math.pow(Math.sin((Math.PI * (t - 90)) / 240), 2));
  return x;
}
/**
 * The outflow-graft velocity (m/s) at loop time tl: the same pump flow through the graft; in the
 * obstructed beat of a suction event the pump moves less blood.
 */
function voutAt(v, tl) {
  tl = ((tl % LOOP) + LOOP) % LOOP;
  const b = Math.floor(tl / RR), t = tl - b * RR;
  let x = v.vinS * flowShape(t, v.r);
  const P = pulseAt(tl);
  if (P) x = (x + (v.pulseInS - v.vinS) * P.rise) * (1 - 0.8 * P.dip);
  if (v.obs > 0 && b === 1) x *= 1 - 0.4 * Math.pow(Math.sin(Math.PI * clamp((t - 60) / 330, 0, 1)), 1.5);
  return x * v.kout;
}
// The RVOT flow from the parasternal short axis, as chapter Shunts draws it. It runs away from
// the probe for 320 ms from pulmonic opening, and peaks at 40% of ejection
const RV0 = EV.avo - 5, RVET = 320, RVPK = 0.4;
const rvotShape = (t) => {
  const u = (t - RV0) / RVET;
  if (u <= 0 || u >= 1) return 0;
  return Math.pow(u < RVPK ? Math.sin((Math.PI / 2) * (u / RVPK)) : Math.cos((Math.PI / 2) * ((u - RVPK) / (1 - RVPK))), 0.85);
};
// the shape's integral (s): the VTI of a peak of 1 m/s is 100 x this (cm)
const RV_INT = (() => { let a = 0; for (let t = 0; t < RR; t += 0.5) a += rvotShape(t) * 0.0005; return a; })();
/** The RVOT's peak velocity (m/s) for VTI cm. */
const rvotPeak = (vti) => vti / (100 * RV_INT);

// ---------------------------------------------------------------- the figure
// The parasternal long axis and the apical four-chamber view, cut from the mesh of the heart the
// page shows. The LV is at the printed LVIDd, the septum at the printed position and the RV at
// the printed basal diameter. The aortic valve opens on the printed beats. Both views cut the
// cannula.
let sheet = null, st = null;
const redraw = () => { if (sheet) sheet.dirty = true; };
const MESH_LAX = new MeshPanel('plax', { diseases: ['lvSize', 'sep'], lv: true, redraw });
const MESH_A4C = new MeshPanel('a4c', { diseases: ['lvSize', 'sep', 'rvGrow'], lv: true, rv: true, redraw });

/** The mesh's weights for the values v on heart: { disease, lvK, rvK, rvT }. */
const weightCache = new Map();
function meshOf(v, heart) {
  const key = `${heart}|${v.k}|${v.n}`;
  if (weightCache.has(key)) return weightCache.get(key);
  const W8 = vadWeights(heart, v.lvidd * 10, SHIFT[v.sept]);
  // the RV: its basal diameter less what the LV's size and the septum's move add to it
  // (lvadcal.js rvGrowAt)
  const rv = rvGrowAt(heart, v.rvb, W8.size, W8.sep);
  // the LV's own contraction: an LVEF of 15%, a severely hypokinetic LV (meshcal.js lvByEf)
  const lvK = clamp(lvByEf(heart, clamp(W8.size, -0.8, 1.5), 15).k, 0, 1);
  // the RV's own contraction: the heart's own, a third of it in RV failure
  const fail = v.k === 'rvf';
  const out = { disease: { lvSize: W8.size, sep: W8.sep, rvGrow: rv }, lvK, rvK: fail ? 0.3 : 1, rvT: fail ? 0.45 : 1, W8 };
  weightCache.set(key, out);
  return out;
}

/** The valves' drive at time t of beat b: the cycle model's, with the aortic valve's own opening. */
const driveOf = (v, b, heart) => (d, t) => ({ ...d, av: avDrive(v, b, t, heart) });

/**
 * A jet from where a valve's leaflets meet into the chamber behind them (MR into the LA, TR into
 * the RA). lean: how far it turns from the LV's long axis toward the chamber's middle (0.2 in the
 * apical view, as chapter Mitral regurgitation draws it; more in the long axis, where the LA lies
 * behind the valve).
 */
function backJet(ev, valve, chamber, s, vc, lean = 0.2) {
  const h = hingesOf(ev, valve);
  if (!h) return null;
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle(h);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  const O = closureOf(ev, valve, M, nrm) || M;
  const side = perp(nrm);
  const C = cavity(ev, blood(ev, onPlane(ev, an[chamber])), [[add(O, side), sub(O, side)]]);
  if (C.length < 12) return null;
  let lMax = 0, w0 = Infinity, w1 = -Infinity;
  for (const p of C) {
    lMax = Math.max(lMax, -dot(sub(p, M), nrm));
    const x = dot(sub(p, M), side);
    w0 = Math.min(w0, x); w1 = Math.max(w1, x);
  }
  // a central jet: its area a share of the chamber's that grows with the vena contracta
  const jA = clamp(0.05 + 0.6 * vc, 0, 0.5) * area(C);
  const jl = Math.min(lMax * 0.92, Math.sqrt((jA / 0.55) * 1.3));
  const jw = jl > 0 ? Math.min((w1 - w0) * 0.9, jA / (0.55 * jl)) : 0;
  // away from the probe: a jet into a chamber behind the valve flows away from it (blue)
  let dir = unit(add(mul(nrm, lean - 1), mul(unit(sub(middle(C), O)), lean)));
  if (dot(dir, unit(O)) < 0.35) dir = unit(add(dir, mul(unit(O), 0.6)));
  return { O, dir, clip: C, jl, jw };
}
/** One color box round the extents of the jets drawn (as chapter Hypertrophic cardiomyopathy draws it). */
function colorBox(ctx, F, list) {
  const B = list.filter(Boolean);
  if (!B.length) return;
  const t0 = Math.min(...B.map((b) => b.t0)), t1 = Math.max(...B.map((b) => b.t1));
  const r0 = Math.min(...B.map((b) => b.r0)), r1 = Math.max(...B.map((b) => b.r1)), { sect } = F;
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sect.cx, sect.top, r0, Math.PI / 2 - t0, Math.PI / 2 - t1, true);
  ctx.arc(sect.cx, sect.top, r1, Math.PI / 2 - t1, Math.PI / 2 - t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
const VA = 60;   // cm/s, the color scale's aliasing velocity (Stainback 2015: 50-60 cm/s for AR)
const LVOT_D = 2.0;   // cm, the LVOT that the AR jet's width is drawn against
/** The systolic strength (0..1) of an AV-valve jet at time t: mitral closure to opening. */
const sysJet = (t) => (t > EV.mvc && t < EV.mvo ? Math.pow(Math.sin((Math.PI * (t - EV.mvc)) / (EV.mvo - EV.mvc)), 0.35) : 0);
/**
 * The AR jet's strength at time t of beat b. It is continuous while the valve is shut, and a
 * little weaker in systole as the LV pressure rises. While the valve opens it stops.
 */
function arStrength(v, b, t) {
  if (!(v.ar > 0)) return 0;
  if (avDrive(v, b, t, heartOf(st)) > 0.02) return 0;
  const sys = t > EV.mvc && t < EV.avc + 40 ? 1 : 0;
  return sys ? 0.8 : 1;
}

function lax(ctx, box, v, tt, b) {
  const heart = heartOf(st), M = meshOf(v, heart), sy = cycleAt(tt).s;
  const narrow = box.w < 260;
  const lines = [`LVIDd ${v.lvidd.toFixed(1)} cm`];
  if (v.ar > 0) lines.push(narrow ? `AR ${v.ar.toFixed(2)}` : `AR VC ${v.ar.toFixed(2)} cm`);
  if (v.mr > 0 && !narrow) lines.push(`MR VC ${v.mr.toFixed(2)} cm`);
  MESH_LAX.draw(ctx, box, fit(box.w, `PARASTERNAL LONG AXIS · COLOR ${VA} cm/s`, `PLAX · COLOR ${VA}`), {
    tms: tt, disease: M.disease, lvK: M.lvK, drive: driveOf(v, b, heart),
    deeper: Math.max(0, M.W8.size),
    extra: (ev, g, state) => cannulaCut(cannulaOf(ev, state.s), g).items,
    extraKey: `${heart}|${v.k}|${v.n}`,
    names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      // LVIDd where the calipers measure it, through the beat (at end-diastole they read the printed value)
      const K = plaxCalipers(ev, sy);
      if (K) {
        const side = [K.dir[1] * 0.1, -K.dir[0] * 0.1];
        cal(c, F, K.ivs[0], K.ivs[1], '');
        cal(c, F, add(K.lv[0], side), add(K.lv[1], side), '');
        cal(c, F, K.pw[0], K.pw[1], '');
      }
      const boxes = [];
      const a = arStrength(v, b, tt);
      if (a > 0) {
        const J = aorticJet(ev, sy);
        if (J) {
          const jw = Math.min(0.92, 0.25 + v.ar) * LVOT_D;
          boxes.push(jet(c, F, { q: Math.PI * (v.ar / 2) ** 2 * 400, va: VA, vmax: 1.8 * VA, keep: 0.6, vc: v.ar, jl: 2.0 + 5 * v.ar, jw, a, pisa: false, O: J.O, dir: J.dir, clip: J.clip, clipOr: J.also, pclip: J.aorta, box: false }));
          // the vena contracta, across the jet where it leaves the valve
          const n = J.n, P0 = add(J.O, mul(J.dir, 0.12));
          cal(c, F, add(P0, mul(n, v.ar / 2)), add(P0, mul(n, -v.ar / 2)), '', { solid: true });
        }
      }
      const am = v.mr > 0 ? sysJet(tt) : 0;
      if (am > 0) {
        const J = backJet(ev, 'MitralValve', 'la', sy, v.mr, 0.85);
        if (J) boxes.push(jet(c, F, { q: Math.PI * (v.mr / 2) ** 2 * 450, va: VA, vmax: 1.8 * VA, keep: 0.8, vc: v.mr, jl: J.jl, jw: J.jw, a: am, pisa: false, O: J.O, dir: J.dir, clip: J.clip, box: false }));
      }
      colorBox(c, F, boxes);
      if (v.ar > 0 || v.mr > 0) barFor(c, F, -VA, VA);
    },
    lines,
  });
}

function a4c(ctx, box, v, tt, b, tl) {
  const heart = heartOf(st), M = meshOf(v, heart), sy = cycleAt(tt).s;
  const narrow = box.w < 260;
  const lines = narrow ? [`RV ${v.rvb.toFixed(1)} cm`] : [`RV base ${v.rvb.toFixed(1)} cm`, `TR VC ${v.tr.toFixed(2)} cm`];
  let cut = null;
  MESH_A4C.draw(ctx, box, fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${VA} cm/s`, `A4C · COLOR ${VA}`), {
    tms: tt, disease: M.disease, lvK: M.lvK, rvK: M.rvK, rvT: M.rvT,
    deeper: Math.max(0, 1.5 * (v.rvb - 4.2)),
    extra: (ev, g, state) => { cut = cannulaCut(cannulaOf(ev, state.s), g); return cut.items; },
    extraKey: `${heart}|${v.k}|${v.n}`,
    names: [['lv', 'LV', 'apex', 0.55], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
    over: (c, F, ev) => {
      const boxes = [];
      // the flow into the cannula: it converges on the cannula's opening from the LV and runs into it
      const C = cannulaOf(ev, sy), g = ev.g;
      if (!cut) cut = cannulaCut(C, g);
      const T = onG(g, C.T), Bp = onG(g, C.B), into = unit(sub(Bp, T));
      const LV = cavity(ev, blood(ev, onPlane(ev, ev.anchors(sy).lv)), [[add(T, perp(into)), sub(T, perp(into))]]);
      const vNow = vinAt(v, tl);
      if (LV.length >= 12 && cut.lumen.length) {
        // laminar, low-velocity flow: the flow converges on a point 0.5 cm inside the opening, so
        // that it stays below the aliasing velocity in the LV; in the obstructed beat of a suction
        // event the inflow narrows and aliases
        const obstructed = v.obs > 0 && b === 1 && tt > 90 && tt < 330;
        const vc = obstructed ? 0.5 : 1.2;
        const O = add(T, mul(into, obstructed ? 0.1 : 0.5));
        boxes.push(jet(c, F, { q: vNow * 100 * (obstructed ? 0.4 : 0.9), va: VA, vmax: (obstructed ? 2.6 : 0.95) * VA, vc, jl: 0.6, jw: vc, a: clamp(0.5 + 0.5 * (vNow / Math.max(0.3, v.vinS)), 0.5, 1), pisa: true, O, dir: into, clip: cut.lumen[0], pclip: LV, box: false }));
      }
      const am = v.mr > 0 ? sysJet(tt) : 0;
      if (am > 0) {
        const J = backJet(ev, 'MitralValve', 'la', sy, v.mr);
        if (J) boxes.push(jet(c, F, { q: Math.PI * (v.mr / 2) ** 2 * 450, va: VA, vmax: 1.8 * VA, keep: 0.8, vc: v.mr, jl: J.jl, jw: J.jw, a: am, pisa: false, O: J.O, dir: J.dir, clip: J.clip, box: false }));
      }
      const at = v.tr > 0 ? sysJet(tt) : 0;
      if (at > 0) {
        const J = backJet(ev, 'TricuspidValve', 'ra', sy, v.tr);
        if (J) boxes.push(jet(c, F, { q: Math.PI * (v.tr / 2) ** 2 * 280, va: VA, vmax: 1.8 * VA, keep: 0.8, vc: v.tr, jl: J.jl, jw: J.jw, a: at, pisa: false, O: J.O, dir: J.dir, clip: J.clip, box: false }));
      }
      colorBox(c, F, boxes);
      barFor(c, F, -VA, VA);
    },
    lines,
  });
}

// ---------------------------------------------------------------- the strips
/** The cursor of a three-beat strip, or a line at the still frame. */
const X3 = (bx, tl) => bx.x + (tl / LOOP) * bx.w;
/** The artificial pulses' marks above a strip: a small tick over each, and the 2 s between them. */
function pulseMarks(ctx, bx, yTop) {
  const xa = X3(bx, PULSES[0] + PULSE_PK), xb = X3(bx, PULSES[1] + PULSE_PK);
  caliper(ctx, xa, yTop, xb, yTop, { solid: false, size: 3 });
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('2 s', (xa + xb) / 2, yTop - 3);
  ctx.restore();
  return { x0: xa - 6, y0: yTop - 16, x1: xb + 6, y1: yTop + 5 };
}

function inflowPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · INFLOW CANNULA · APICAL', 'PW · INFLOW'));
  const bx = inner(P), base = 0.86, vs = v.obs > 0 ? 2.2 : 1.6;
  const fn = (u) => vinAt(v, u * LOOP);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.14, key: `vadin|${v.k}|${v.n}|${vs}`, seed: 71 });
  vscale(ctx, bx, vs, base, 0.5);
  const k = (bx.h * base) / vs, y0 = bx.y + base * bx.h;
  // the regular peak in the third beat's systole (the first beat's holds a pulse; in a suction
  // event the second is the obstructed beat), and the pulse's peak
  const xPk = X3(bx, 2 * RR + 230), yPk = y0 - v.vinS * k;
  const keep = [];
  if (v.obs > 0) {
    const xo = X3(bx, RR + 210), yo = y0 - v.obs * k;
    caliper(ctx, xo - 9, yo, xo + 9, yo, { solid: true, size: 3 });
    keep.push({ x0: xo - 12, y0: yo - 6, x1: xo + 12, y1: yo + 6 });
  } else {
    caliper(ctx, xPk - 9, yPk, xPk + 9, yPk, { solid: true, size: 3 });
    keep.push({ x0: xPk - 12, y0: yPk - 6, x1: xPk + 12, y1: yPk + 6 });
  }
  let pk = 0, tp = 0;
  for (let t = PULSES[0]; t < PULSES[0] + 400; t += 2) { const x = vinAt(v, t); if (x > pk) { pk = x; tp = t; } }
  const xq = X3(bx, tp), yq = y0 - pk * k;
  caliper(ctx, xq - 9, yq, xq + 9, yq, { solid: true, size: 3 });
  keep.push({ x0: xq - 12, y0: yq - 6, x1: xq + 12, y1: yq + 6 });
  keep.push(pulseMarks(ctx, bx, Math.max(bx.y + 26, yq - 10)));
  const txt = v.obs > 0
    ? [`peak ${v.vin.toFixed(1)} m/s · obstructed beat ${v.obs.toFixed(1)} m/s`, `${v.vin.toFixed(1)} · obstructed ${v.obs.toFixed(1)} m/s`, `obstr. ${v.obs.toFixed(1)} m/s`]
    : [`peak ${v.vin.toFixed(1)} m/s · pulse ${v.pulseIn.toFixed(1)} m/s`, `${v.vin.toFixed(1)} · pulse ${v.pulseIn.toFixed(1)} m/s`, `${v.vin.toFixed(1)} m/s`];
  note(ctx, bx, txt, 'auto', keep);
  return bx;
}

function outflowCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, v.k === 'obst' ? 'CW · OUTFLOW GRAFT · AT THE NARROWING' : 'CW · OUTFLOW GRAFT', 'CW · OUTFLOW'));
  const bx = inner(P), base = 0.86, vs = v.k === 'obst' ? 4 : 3;
  const fn = (u) => voutAt(v, u * LOOP);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.3, key: `vadout|${v.k}|${v.n}|${vs}`, seed: 72 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * base) / vs, y0 = bx.y + base * bx.h;
  const xPk = X3(bx, 2 * RR + 230), yPk = y0 - v.vinS * v.kout * k;
  caliper(ctx, xPk - 9, yPk, xPk + 9, yPk, { solid: true, size: 3 });
  const keep = [{ x0: xPk - 12, y0: yPk - 6, x1: xPk + 12, y1: yPk + 6 }];
  let pk = 0, tp = 0;
  for (let t = PULSES[0]; t < PULSES[0] + 400; t += 2) { const x = voutAt(v, t); if (x > pk) { pk = x; tp = t; } }
  const xq = X3(bx, tp), yq = y0 - pk * k;
  caliper(ctx, xq - 9, yq, xq + 9, yq, { solid: true, size: 3 });
  keep.push({ x0: xq - 12, y0: yq - 6, x1: xq + 12, y1: yq + 6 });
  // the 2 m/s line: a baseline peak above it is abnormal (Estep 2024; Stainback 2015)
  const y2 = y0 - 2 * k;
  ctx.save();
  ctx.strokeStyle = SC.dim;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(bx.x, y2); ctx.lineTo(bx.x + bx.w, y2); ctx.stroke();
  ctx.restore();
  note(ctx, bx, [`peak ${v.vout.toFixed(1)} m/s · pulse ${v.pulseOut.toFixed(1)} m/s`, `${v.vout.toFixed(1)} · pulse ${v.pulseOut.toFixed(1)} m/s`, `${v.vout.toFixed(1)} m/s`], 'auto', keep);
  return bx;
}

function rvotPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RVOT · SHORT AXIS', 'PW · RVOT'));
  const bx = inner(P), base = 0.14, vs = 1.2;
  const pkV = rvotPeak(v.vti);
  const fn = (u) => -pkV * rvotShape((u * LOOP) % RR);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.16, key: `vadrvot|${v.vti}|${vs}`, seed: 73 });
  vscale(ctx, bx, vs, base, 0.5);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h;
  // the VTI: the second beat's envelope traced
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let t = RV0; t <= RV0 + RVET; t += 4) {
    const x = X3(bx, RR + t), y = y0 + pkV * rvotShape(t) * k;
    t === RV0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  const keep = [{ x0: X3(bx, RR + RV0) - 4, y0, x1: X3(bx, RR + RV0 + RVET) + 4, y1: y0 + pkV * k + 4 }];
  note(ctx, bx, [`VTI ${v.vti} cm · CO ${v.co.toFixed(1)} L/min (RVOT ${RVOT_D.toFixed(1)} cm, ${HR}/min)`, `VTI ${v.vti} cm · CO ${v.co.toFixed(1)} L/min`, `VTI ${v.vti} cm`], 'auto', keep);
  return bx;
}

/**
 * M-mode through the aortic cusps, from the long axis: the RV's anterior wall, the RVOT, the
 * aortic root and the LA. The root moves forward in systole. The cusps part on the printed beats
 * for the printed time, as wide as the long axis draws them (lvadcal.js avGapAt).
 */
function avMmode(ctx, P, v) {
  const heart = heartOf(st), M = meshOf(v, heart);
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'M-MODE · AORTIC VALVE', 'M-MODE · AV'));
  const B = { x: P.x + 6, y: P.y + 24, w: P.w - 34, h: P.h - 30 };
  const d1 = 11, aw = 3.0, root = 3.0, la = 3.4;
  const gapOf = (x) => avGapAt(heart, M.disease.lvSize, x) / 10;
  const geomAt = (tl) => {
    const b = Math.floor(tl / RR) % NB, t = tl - b * RR, c = cycleAt(t), sy = clamp(c.s, 0, 1);
    const m = 0.25 * sy;   // the root moves forward in systole, little in a poorly contracting heart
    const a0 = aw - m, a1 = a0 + 0.3, p0 = a1 + root, p1 = p0 + 0.3, mid = (a1 + p0) / 2;
    const g = gapOf(avDrive(v, b, t, heart)) / 2;
    return { m, a0, a1, p0, p1, mid, g };
  };
  const layers = (u) => {
    const G = geomAt(u * LOOP);
    const L = [[0, 0.45, 8, 0], [1.0, 1.5, 0, -G.m * 0.4], [G.a0, G.a1, 7, -G.m], [G.p0, G.p1, 7, -G.m], [G.p1 + la, G.p1 + la + 0.4, 9, -G.m * 0.6]];
    if (G.g < 0.03) L.push([G.mid - 0.05, G.mid + 0.05, 15, -G.m]);
    else L.push([G.mid - G.g - 0.06, G.mid - G.g + 0.04, 15, -G.m], [G.mid + G.g - 0.04, G.mid + G.g + 0.06, 15, -G.m]);
    return L;
  };
  mmode(ctx, B, 0, d1, layers, `vadmm|${heart}|${v.k}|${v.n}`);
  // depth scale (cm)
  const pxcm = B.h / d1;
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= d1; d += 1) {
    const y = B.y + d * pxcm;
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 5 === 0 && d > 0) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  ctx.restore();
  // each opening's duration, under the first opening
  const avoid = [];
  for (let b = 0; b < NB; b++) {
    if (!opensOn(v, b)) continue;
    const xa = B.x + ((b * RR + EV.avo) / LOOP) * B.w, xb = B.x + ((b * RR + EV.avo + v.avDur) / LOOP) * B.w;
    const G = geomAt(b * RR + EV.avo + v.avDur / 2), y = B.y + (G.p1 + 0.35) * pxcm;
    caliper(ctx, xa, y, xb, y, { solid: true, size: 3 });
    avoid.push({ x0: xa - 4, y0: y - 5, x1: xb + 4, y1: y + 5 });
  }
  const txt = v.avBeats === 3 ? [`opens every beat · ${v.avDur} ms`, `every beat · ${v.avDur} ms`]
    : v.avBeats ? [`opens in ${v.avBeats} of 3 beats · ${v.avDur} ms`, `${v.avBeats} of 3 beats · ${v.avDur} ms`]
      : ['closed in every beat', 'closed'];
  note(ctx, B, txt, 'auto', avoid);
  return B;
}

/**
 * The ramp: LVIDd against the pump speed for the case shown, every 100 rpm, with the speed shown
 * marked. The working pump's line falls 0.15 cm per 100 rpm before its LV collapses. An
 * obstruction has a flat line. Below 3 cm the LV is sucked down (Stainback 2015).
 */
function rampPlot(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'RAMP · LVIDd (cm) BY SPEED (rpm)', 'RAMP · cm BY rpm'));
  const narrow = P.w < 250;
  const bx = { x: P.x + 34, y: P.y + 28, w: P.w - 46, h: P.h - 50 };
  const y0c = 2, y1c = 7, X = (n) => bx.x + (n / STEPS) * bx.w, Y = (cm) => bx.y + ((y1c - cm) / (y1c - y0c)) * bx.h;
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.frame;
  ctx.lineWidth = 1;
  // axes and ticks
  ctx.beginPath(); ctx.moveTo(bx.x, bx.y); ctx.lineTo(bx.x, bx.y + bx.h); ctx.lineTo(bx.x + bx.w, bx.y + bx.h); ctx.stroke();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let cm = y0c; cm <= y1c; cm++) { ctx.fillText(String(cm), bx.x - 5, Y(cm)); ctx.beginPath(); ctx.moveTo(bx.x - 3, Y(cm)); ctx.lineTo(bx.x, Y(cm)); ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const n of narrow ? [0, 8, 16] : [0, 4, 8, 12, 16]) ctx.fillText(String(RPM0 + 100 * n), X(n), bx.y + bx.h + 4);
  // the 3 cm line of a suction event
  ctx.strokeStyle = SC.dim;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(bx.x, Y(3)); ctx.lineTo(bx.x + bx.w, Y(3)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('3 cm', bx.x + 3, Y(3) - 2);
  const label3 = { x0: bx.x + 1, y0: Y(3) - 14, x1: bx.x + 5 + ctx.measureText('3 cm').width, y1: Y(3) };
  // the lines: the working pump's in every case (faint when another case shows), the obstruction's flat line
  const line = (k, alpha, dash) => {
    const S = slopeOf(k, ...LINE[k]);
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(X(S.n0), Y(S.at(S.n0))); ctx.lineTo(X(S.n1), Y(S.at(S.n1))); ctx.stroke();
    ctx.restore();
    return S;
  };
  const Sp = line('pump', v.k === 'pump' ? 0.9 : 0.35, [5, 3]);
  const So = v.k === 'obst' ? line('obst', 0.9, []) : null;
  // the points of the case shown, and the speed shown
  const pts = rampOf(v.k);
  ctx.fillStyle = SC.text;
  for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.n), Y(p.lvidd), 2.2, 0, 2 * Math.PI); ctx.fill(); }
  ctx.strokeStyle = SC.cal;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(X(v.n), bx.y); ctx.lineTo(X(v.n), bx.y + bx.h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = SC.cal;
  ctx.beginPath(); ctx.arc(X(v.n), Y(v.lvidd), 4, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  // the slopes, in the corner away from the points
  const fmtS = (x) => (x < 0 ? `−${Math.abs(x).toFixed(2)}` : x.toFixed(2));
  const txt = So
    ? [`flat: ${fmtS(So.slope)} cm/100 rpm · working pump ${fmtS(Sp.slope)}`, `flat ${fmtS(So.slope)} · pump ${fmtS(Sp.slope)}`, `flat ${fmtS(So.slope)}`]
    : [`working pump ${fmtS(Sp.slope)} cm per 100 rpm`, `${fmtS(Sp.slope)} cm/100 rpm`, `${fmtS(Sp.slope)}`];
  const avoid = [label3, ...pts.map((p) => ({ x0: X(p.n) - 4, y0: Y(p.lvidd) - 4, x1: X(p.n) + 4, y1: Y(p.lvidd) + 4 }))];
  note(ctx, { x: bx.x, y: bx.y - 2, w: bx.w, h: bx.h + 2 }, txt, 'auto', avoid);
  return bx;
}

function draw(sh) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(true, 0);
  const b = cine.live ? beat.index : 0;
  const tl = cine.live ? beat.ms : 0;
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : 0);
  if (W < 700) {
    const [a, c] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.15, 1], 8);
    const [a1, a2, a3] = rows(a, [1.25, 1.25, 0.9], 8);
    lax(ctx, a1, v, tt, b);
    a4c(ctx, a2, v, tt, b, tl);
    rampPlot(ctx, a3, v);
    const [c1, c2, c3, c4] = rows(c, [1, 1, 1, 1], 8);
    for (const bx of [inflowPW(ctx, c1, v), outflowCW(ctx, c2, v), rvotPW(ctx, c3, v), avMmode(ctx, c4, v)]) mark(bx);
    return;
  }
  const colL = { x: 16, y: 14, w: W * 0.42 - 16, h: H - 26 };
  const colR = { x: W * 0.435, y: 14, w: W * 0.565 - 16, h: H - 26 };
  const [a1, a2] = rows(colL, [1, 1.15], 10);
  lax(ctx, a1, v, tt, b);
  a4c(ctx, a2, v, tt, b, tl);
  const [r1, r2, r3, r4] = rows(colR, [1, 1, 1, 1.25], 10);
  const [c1, c2] = cols(r4, [1.1, 1], 10);
  for (const bx of [inflowPW(ctx, r1, v), outflowCW(ctx, r2, v), rvotPW(ctx, r3, v), avMmode(ctx, c1, v)]) mark(bx);
  rampPlot(ctx, c2, v);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const rpmText = (n) => n.toLocaleString('en-US');
const SEPT = { right: 'rightward', neutral: 'neutral', left: 'leftward' };
const LEAD = {
  pump: { right: 'Partial LV unloading: the speed is below the minimum', neutral: 'A working pump: the LV is unloaded', left: 'Excessive LV unloading: the speed is above the maximum', suction: 'Suction event' },
  rvf: { right: 'RV failure', neutral: 'RV failure at a low speed', left: 'RV failure: the septum bows into the LV', suction: 'RV failure with a suction event' },
  ar: { right: 'De novo aortic regurgitation with partial LV unloading', neutral: 'De novo aortic regurgitation', left: 'De novo aortic regurgitation', suction: 'De novo aortic regurgitation' },
  obst: { right: 'Obstruction of the outflow graft', neutral: 'Obstruction of the outflow graft', left: 'Obstruction of the outflow graft', suction: 'Obstruction of the outflow graft' },
};
const avText = (v) => (v.avBeats === 3 ? `opens with every beat, for ${v.avDur} ms` : v.avBeats ? `opens in ${v.avBeats} of 3 beats, for ${v.avDur} ms` : 'stays closed');

function liveOf(v, cite) {
  const S = cite('stainback2015'), E = cite('estep2024'), U17 = cite('uriel2017'), Z = cite('zoghbi2017'), Mk = cite('mukherjee2025');
  const head = `<b>${LEAD[v.k][v.grade]}.</b>`;
  const s0 = ` At ${rpmText(v.rpm)} rpm the LV internal diameter at end-diastole is ${fmt(v.lvidd, 1)} cm${v.suction ? `, below the 3 cm of a suction event${S}` : ''}.`;
  const s1 = ` The aortic valve ${avText(v)}, and the septum is ${SEPT[v.sept]}${S}.`;
  const mr = v.mr > 0 ? `MR is ${grade(v.mr)} (vena contracta ${fmt(v.mr, 2)} cm)` : 'There is no MR';
  const ar = v.ar > 0 ? `; the AR vena contracta is ${fmt(v.ar, 2)} cm, at least moderate AR${S}` : '';
  const s2 = ` ${mr}${v.mr > 0 ? Z : ''}${ar}.`;
  const tr = ` TR is ${grade(v.tr)} (vena contracta ${fmt(v.tr, 2)} cm)${Z}, and the RV basal diameter is ${fmt(v.rvb, 1)} cm (${rvWord(v.rvb)})${Mk}.`;
  const inflow = v.obs > 0
    ? ` The inflow cannula's PW peak is ${fmt(v.vin, 1)} m/s, and ${fmt(v.obs, 1)} m/s in the obstructed beat${S}.`
    : ` The inflow cannula's PW peak is ${fmt(v.vin, 1)} m/s, and ${fmt(v.pulseIn, 1)} m/s with the artificial pulse${E}.`;
  const outflow = ` The outflow graft's CW peak is ${fmt(v.vout, 1)} m/s${v.vout >= 2 ? `, 2 m/s or more at the narrowing${S}` : `, below 2 m/s${E}`}.`;
  const co = ` The RVOT VTI is ${v.vti} cm, a total cardiac output of ${fmt(v.co, 1)} L/min${S}.`;
  const ramp = v.k === 'pump' && !v.suction ? ` The LV narrows by 0.15 cm per 100 rpm${U17}.` : v.k === 'obst' ? ` The LV, the aortic valve and the RVOT output do not change with the speed${S}.` : '';
  return `${head}${s0}${s1}${s2}${tr}${inflow}${outflow}${co}${ramp}`;
}

let BANDS_OF = {};
const BAND_NAME = { right: 'rightward', neutral: 'neutral', left: 'leftward', suction: 'suction' };

/**
 * The model, for tools and checks. measure: the printed values at slider position x for case k.
 * meshOf: the mesh's weights for them on a heart. avDrive: the aortic valve's drive at time t of
 * beat b. vinAt, voutAt: the cannula and graft velocities at loop time tl.
 */
export const lvadModel = { measure, meshOf, avDrive, opensOn, vinAt, voutAt, rvotPeak, LOOP, PULSES };

const lvadPage = {
  key: 'lvad',
  part: 'function',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Left ventricular assist devices',
  nav: 'LVAD',
  dwell: 30,
  defaults: { vadS: 0.4375, vadCase: 'pump' },
  format: { vadS: (x) => `${rpmText(rpmOf(x))} rpm` },
  watch: ['vadS', 'vadCase', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    for (const k of CASES) BANDS_OF[k] = lazyBands((x) => gradeOf(x, k));
    const host = document.getElementById('lvad-grades');
    let painted = '';
    const paint = (s) => {
      const k = caseOf(s);
      if (k === painted) return;
      painted = k;
      paintBands(host, () => BANDS_OF[k]().map((bd) => ({ ...bd, g: BAND_NAME[bd.g] })), { neutral: 0, rightward: 2, leftward: 2, suction: 3 }, { rightward: 'right', leftward: 'left' });
    };
    paint(state);
    subscribe?.((s, ch) => { if (CASE in ch) paint(s); });
  },
  // the heart model and the targets load at idle, before the chapter opens (main.js warms every chapter)
  enter() { MESH_LAX.start(); MESH_A4C.start(); },
  warm() { MESH_LAX.start(); MESH_A4C.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS_OF[caseOf(s)] || []);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: a working pump from 4,600 to 6,200 rpm, to suction; RV failure from 6,200 rpm
  // down to 4,600 rpm, as the speed is lowered; de novo AR, then an obstruction, each up the range
  tourEnter(set) { set({ vadS: 0, vadCase: 'pump' }); },
  tourTick(tt, set) {
    const q = (x) => Math.round(clamp(x, 0, 1) * 200) / 200;
    if (tt < 12) set({ vadCase: 'pump', vadS: q((tt - 1) / 10) });
    else if (tt < 18) set({ vadCase: 'rvf', vadS: q(1 - (tt - 12) / 5) });
    else if (tt < 24) set({ vadCase: 'ar', vadS: q((tt - 18) / 5) });
    else set({ vadCase: 'obst', vadS: q((tt - 24) / 5) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    const k = caseOf(s), x = s.vadS;
    if (k === 'rvf') return 12 + (1 - x) * 5;
    if (k === 'ar') return 18 + x * 5;
    if (k === 'obst') return 24 + x * 5;
    return 1 + x * 10;
  },
  text(s, { cite }) {
    const v = shown(s);
    return {
      readouts: [
        { k: 'Pump speed', v: rpmText(v.rpm), u: 'rpm' },
        { k: 'LVIDd', v: fmt(v.lvidd, 1), u: 'cm', flag: v.suction },
        { k: 'Aortic valve', v: v.av, u: v.avBeats ? `${v.avBeats} of 3 · ${v.avDur} ms` : '', text: true, flag: v.avBeats === 0 },
        { k: 'Septum', v: SEPT[v.sept], text: true, flag: v.sept !== 'neutral' },
        { k: 'MR', v: grade(v.mr), u: v.mr > 0 ? `VC ${fmt(v.mr, 2)} cm` : '', text: true, flag: v.mr >= 0.3 },
        { k: 'AR', v: v.ar > 0 ? '≥ moderate' : 'none', u: v.ar > 0 ? `VC ${fmt(v.ar, 2)} cm` : '', text: true, flag: v.ar >= 0.3 },
        { k: 'Inflow cannula', v: fmt(v.vin, 1), u: 'm/s', flag: v.vin > 1.5 || v.vin < 0.5 || v.obs > 0 },
        { k: 'Outflow graft', v: fmt(v.vout, 1), u: 'm/s', flag: v.vout >= 2 },
        { k: 'RVOT VTI', v: String(v.vti), u: 'cm' },
        { k: 'Cardiac output', v: fmt(v.co, 1), u: 'L/min' },
      ],
      live: liveOf(v, cite),
    };
  },
};
export default lvadPage;
