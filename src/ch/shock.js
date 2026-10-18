// Shock: a focused cardiac ultrasound of a hypotensive patient, from a normal heart to the severe
// form of one type of shock. A switch sets the case: hypovolemic, cardiogenic, obstructive by
// tamponade or by acute pulmonary embolism, or distributive (Vincent 2013). Five views cut from
// the one heart mesh (the parasternal long and short axes, the apical four-chamber view, the
// subcostal four-chamber view and the subcostal IVC) show the pattern of each, and PW Doppler in
// the LVOT gives the VTI, the stroke volume and the cardiac output.
//
// The views compose the targets of the chapters that teach each finding: the LV's size and
// contraction (eject.js: lvSize and the LV's own contraction, meshcal.js lvByEf), the right
// heart and the septum (rv.js and tr.js: rvGrow, raGrow, sep; McConnell's sign by
// gl/rvpemesh.js), the fluid and the signs of tamponade (peri.js: eff, effAnt, under, raIn,
// rvIn, swing, bob) and the IVC's caliber below the diaphragm (echo.js setIvc). The tracks below
// set these weights; shockcal.js holds what the image then measures, on each heart, and the page
// prints those measurements. The heart rate, the VTI and the IVC's collapse are model values,
// set inside their guideline grades.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, tagBox, SC } from '../scope.js';
import { EV, cycleAt, lvotV } from '../cyclemodel.js';
import { rapEstimate } from '../norms.js';
import { tracks, bands, paintBands, playSeverity, cine, cursor, rows, cols, inner, shown as rnd } from '../sev.js';
import { cal } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { lvByEf, sepOf, sepEsOf } from '../meshcal.js';
import { plaxCalipers, onPlane, blood, hingesOf, middle, sub, add, mul, unit, perp, dot } from '../meshjet.js';
import { rvLevels, rvShares, freeWall, wallLevels } from '../gl/rvpemesh.js';
import { basalDiameter, effusionGap, ivcAxis, ivcDiameter, lvotDiameter, measuredAt } from '../shockcal.js';
import { reducedMotion } from '../state.js';
import { numOf } from '../order.js';

const KEY = 'shkS';
const CASE = 'shkCase';
const FRAME = 'shkFrame';
export const CASES = ['hypo', 'cardio', 'tamp', 'pe', 'dist'];
const caseOf = (s) => (s && CASES.includes(s[CASE]) ? s[CASE] : 'hypo');
const heartOf = (s) => (s && s.pheno) || 'normal';
const frameOf = (s) => (s && ['cine', 'ed', 'ms'].includes(s[FRAME]) ? s[FRAME] : 'cine');

// ---------------------------------------------------------------- the model
// The tracks over the slider for each case, from the same normal heart at 0. Each is a teaching
// model set inside the grades of the guidelines, not patient data.
//   size: the LV's size weight at end-diastole (lvSize, 0 the heart's own); ef: the LVEF (%) its
//     contraction is set for (meshcal.js lvByEf; the image's biplane LVEF is measured, shockcal.js)
//   under: the chambers underfilled (peri.js's target: the LV walls 2.8 mm in, the RV free
//     wall 6 mm, the RA 3 mm at 1)
//   rvg, rag: the RV's and the RA's growth (rvGrow, raGrow); eiD, eiS: the LV eccentricity index
//     at end-diastole and end-systole that the septum takes (meshcal.js sepOf, sepEsOf)
//   gB, gM, gA: the RV free wall's motion at its base, middle and apex, a share of the heart's
//     own (gl/rvpemesh.js): the middle stops at the end of acute PE (McConnell's sign)
//   eff: the effusion (mm) the sac is set for, as peri.js sets it; raCol: the share of the
//     cycle the RA wall stays inverted; rvCol: the RV free wall's early-diastolic collapse (0-1);
//     swing: the heart's swing in the fluid (cm)
//   ivc: the IVC's caliber at end-expiration, a factor on the model's (echo.js setIvc); coll: its
//     collapse with a sniff (0-1). The IVC view's plane holds the vessel's axis, so the image shows
//     this collapse; it rises along the hypovolemic and distributive tracks
//   hr: the heart rate (/min); vti: the LVOT VTI (cm)
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const BASE = { size: 0, ef: 62, under: 0, rvg: 0, rag: 0, eiD: 1, eiS: 1, gB: 1, gM: 1, gA: 1, eff: 0, raCol: 0, rvCol: 0, swing: 0, ivc: 0.85, coll: 0.582, hr: 70, vti: 18 };
const at = (v) => STOPS.map(() => v);
function track(over) {
  const t = {};
  for (const k of Object.keys(BASE)) t[k] = over[k] || at(BASE[k]);
  return tracks(STOPS, t);
}
const TRACKS = {
  // Hypovolemic: small chambers with normal or high contractility (Vincent 2013); the LV small and
  // hyperdynamic; a small IVC that collapses. The RV shrinks with the LV (rvGrow below 0); the sac
  // follows both walls, so no space opens round the heart
  hypo: track({
    size: [0, -0.2, -0.4, -0.6, -0.75], rvg: [0, -0.15, -0.3, -0.45, -0.6], ef: [62, 66, 71, 75, 78],
    ivc: [0.85, 0.75, 0.62, 0.52, 0.45], coll: [0.582, 0.616, 0.663, 0.697, 0.719],
    hr: [70, 85, 100, 113, 130], vti: [18, 14, 11, 8.4, 6.5],
  }),
  // Cardiogenic: large ventricles and poor contractility (Vincent 2013); a large IVC that
  // collapses little
  cardio: track({
    size: [0, 0.25, 0.5, 0.75, 1.0], ef: [62, 48, 36, 27, 20],
    ivc: [0.85, 0.95, 1.05, 1.13, 1.2], coll: [0.582, 0.467, 0.331, 0.227, 0.155],
    hr: [70, 80, 93, 104, 115], vti: [18, 14, 11, 8.5, 6.5],
  }),
  // Obstructive, tamponade: the effusion grows, then the RA and RV collapse in their relaxation,
  // the chambers underfill and the IVC is plethoric (Klein 2013). The output has fallen by about
  // 20% where the RV starts to collapse (Klein 2013)
  tamp: track({
    eff: [0, 6, 13, 20, 25], under: [0, 0, 0.1, 0.6, 1], raCol: [0, 0, 0.12, 0.38, 0.5], rvCol: [0, 0, 0, 0.5, 1], swing: [0, 0, 0.1, 0.45, 0.7],
    size: [0, 0, 0, -0.1, -0.2], ef: [62, 63, 65, 68, 70],
    ivc: [0.85, 0.88, 0.98, 1.1, 1.2], coll: [0.582, 0.547, 0.434, 0.257, 0.123],
    hr: [70, 74, 85, 102, 120], vti: [18, 17, 12.5, 8.5, 6.5],
  }),
  // Obstructive, acute pulmonary embolism: the RV dilates past the LV, the septum flattens, the mid
  // free wall stops while the apex moves (McConnell's sign), the LV underfills and the IVC is
  // large (Vincent 2013; Labovitz 2010)
  pe: track({
    rvg: [0, 0.4, 0.8, 1.2, 1.5], rag: [0, 0.05, 0.1, 0.2, 0.3], eiD: [1, 1.03, 1.08, 1.15, 1.2], eiS: [1, 1.08, 1.2, 1.32, 1.4],
    gB: [1, 0.97, 0.82, 0.68, 0.6], gM: [1, 0.85, 0.55, 0.28, 0],
    size: [0, -0.1, -0.2, -0.3, -0.4], ef: [62, 64, 66, 68, 70],
    ivc: [0.85, 0.95, 1.05, 1.12, 1.18], coll: [0.582, 0.466, 0.361, 0.257, 0.206],
    hr: [70, 82, 95, 108, 120], vti: [18, 15.5, 12.5, 9.5, 7],
  }),
  // Distributive: normal chambers with preserved, here high, contractility, and a high cardiac
  // output (Vincent 2013); a normal or small IVC that collapses
  dist: track({
    size: [0, 0, -0.05, -0.1, -0.15], ef: [62, 66, 70, 74, 78],
    ivc: [0.85, 0.8, 0.75, 0.7, 0.65], coll: [0.582, 0.595, 0.626, 0.653, 0.687],
    hr: [70, 80, 90, 100, 110], vti: [18, 19, 20, 20.5, 21],
  }),
};

/** The model's values at slider position s for case k, before the image is measured. */
export function modelAt(s, k) {
  const m = TRACKS[k](clamp(s, 0, 1));
  m.s = s;
  m.kase = k;
  return m;
}

// ---------------------------------------------------------------- time
// The heart beats at the page's heart rate. Systole shortens with the rate as total
// electromechanical systole does at rest, QS2 = 541 − 2.2 × HR ms in men (Boudoulas 1981): the
// cycle model's systole (70/min) is compressed by that ratio, and diastole takes the rest, as in
// stress.js. Breathing runs at 15 breaths a minute, each with a sniff.
export const BREATH = 4000;
/** The share of the cycle model's systole that a beat at hr keeps. */
export const sysK = (hr) => (541 - 2.2 * hr) / (541 - 2.2 * 70);
/** The cycle model's time (ms) at t ms into a beat at hr. */
export function warp(t, hr) {
  const k = sysK(hr), rr = 60000 / hr, sys = EV.avc * k;
  return t < sys ? t / k : EV.avc + ((t - sys) * (857 - EV.avc)) / (rr - sys);
}
/** The breath at ms: -1 at end-expiration, 1 at the peak of the sniff. */
export const breathAt = (ms) => -Math.cos((2 * Math.PI * ms) / BREATH);
// the frozen frames, in the cycle model's time: midsystole (the LVOT's frame) and end-systole
export const MS_T = Math.round((EV.avo + EV.avc) / 2);
export const ES_T = (() => {
  let tm = EV.avc, best = -1;
  for (let t = 250; t <= 450; t++) { const s = cycleAt(t).s; if (s > best) { best = s; tm = t; } }
  return tm;
})();
/**
 * A frozen moment: 'ed' end-diastole, 'ms' midsystole or 'es' end-systole, in a beat at hr, at
 * end-expiration (insp 0) or at the peak of the sniff (insp 1). tc: the cycle model's time; f:
 * the phase of the beat; t: ms into the beat; beats: the beats counted, for the swing; r: the breath.
 */
export function momentOf(kind, hr, insp = 0) {
  const tc = kind === 'ms' ? MS_T : kind === 'es' ? ES_T : 0;
  return { tc, f: (tc * sysK(hr)) / (60000 / hr), beats: 0, r: 2 * insp - 1, insp, t: tc * sysK(hr) };
}

// ---------------------------------------------------------------- the mesh
// The targets every view weights (phenomesh.js DISEASE), with the LV's and the RV's own
// contraction and the IVC's caliber
export const DIS = ['lvSize', 'rvGrow', 'raGrow', 'sep', 'eff', 'effAnt', 'under', 'raIn', 'rvIn', 'swing', 'bob'];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
// the ischemic heart starts from its own LVEF (25%, f08774a:README.md "The heart shown"): its
// tracks take the same share of it as the normal heart's take of 62%
const EF0 = { icm: 25 };
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);

/**
 * The sac's targets (cm) for an effusion of eff mm, as peri.js sets them: with no fluid the
 * mesh's sac already lies 1.7 mm from the heart, and underfilled chambers widen the space by
 * 3.7 mm more at full tamponade; fluid in front of the heart comes only in a larger effusion.
 */
export function sacOf(eff, under) {
  const e = eff / 10;
  return { eff: Math.max(0, e - 0.17 - 0.37 * under), effAnt: Math.max(0, e - 0.6) * 0.75 };
}

/**
 * The weights on the mesh for the model m on heart at the moment c: tc, ms of the cycle model's
 * beat; f, the phase of the beat (0-1); beats, the beats counted, for the swing; r, the breath
 * (-1 end-expiration to 1 the peak of inspiration), for the septum's respiratory shift; insp
 * (0-1), for the IVC's collapse; levels, gl/rvpemesh.js's levels or null. Returns the MeshPanel
 * options shared by the five views, and the sac's targets (sacS).
 */
export function meshOf(m, heart, c) {
  const { tc = 0, f = 0, beats = 0, r = 0, insp = 0, levels = null } = c;
  const sy = cycleAt(tc).s;
  const L = lvByEf(heart, m.size, (m.ef * (EF0[heart] || 62)) / 62);
  const S = sacOf(m.eff, m.under);
  const disease = { lvSize: L.size + (L.esSize - L.size) * sy, under: m.under, rvGrow: m.rvg, raGrow: m.rag, eff: S.eff, effAnt: S.effAnt };
  const motion = {};
  // the septum: flattened by the RV's pressure load (end-diastole to end-systole), or shifted with
  // each breath in tamponade (toward the LV in inspiration), as peri.js moves it
  if (m.eiD > 1 || m.eiS > 1) {
    const wD = sepOf(heart, m.eiD), wS = sepEsOf(heart, m.eiS);
    motion.sep = wD + (wS - wD) * sy;
  } else if (m.under > 0 && m.eff > 0) motion.sep = 0.45 * m.under * r;
  // tamponade: the RA wall folds in from late diastole into systole, for its share of the cycle;
  // the RV free wall in early diastole; the heart swings once every two beats
  if (m.raCol > 0.01) {
    const w = m.raCol, a0 = 1 - 0.55 * w, a1 = 0.45 * w, x = f >= a0 ? (f - a0) / w : f <= a1 ? (f + 1 - a0) / w : -1;
    if (x >= 0 && x <= 1) motion.raIn = 1.2 * Math.sin(Math.PI * x) * Math.min(1, 0.4 + 1.6 * w);
  }
  if (m.rvCol > 0) motion.rvIn = 0.8 * m.rvCol * bump(f, 0.5, 0.78, 0.6);
  if (m.swing > 0) { const p = Math.PI * beats; motion.swing = m.swing * Math.sin(p); motion.bob = 0.35 * m.swing * Math.cos(p); }
  return {
    disease, motion, lvK: L.k, ivc: m.ivc * (1 - m.coll * insp),
    // the RV free wall by level in acute PE; the tricuspid valve's travel falls with the base
    rvK: 1, rvT: m.gB, rvReg: m.gM < 1 && levels ? rvShares(levels, m.gB, m.gM, m.gA) : null,
    sac: true, still: smooth(S.eff / 0.5), sacS: S,
  };
}

// the five views (views.js keys)
export const VIEW = { plax: 'plax', psax: 'psax_pm', a4c: 'a4c', sc4c: 'sc4c', ivc: 'sc_ivc' };
/**
 * The MeshPanel options of view k for the shared options o (meshOf). The probe of the apical
 * and parasternal views sits on the chest wall, so fluid in front of the heart sets the heart
 * back, as peri.js draws it; the subcostal probe looks up through the liver.
 */
export function viewOpts(k, o) {
  const S = o.sacS;
  if (k === 'a4c') return { ...o, standoff: S.eff, deeper: S.eff };
  if (k === 'plax' || k === 'psax') return { ...o, standoff: S.effAnt, deeper: S.effAnt };
  return o;
}

// ---------------------------------------------------------------- the values shown
// The page prints what the image measures (shockcal.js tables, by heart and case), rounded as
// printed, and the model's heart rate and VTI; every derived value, grade and sentence comes
// from the printed values.
const AKINETIC = 1;   // mm: the mid free wall's inward motion below which it is called akinetic (as rv.js)
// before the tables load: no measurement
const NONE = { lvid: NaN, ef: NaN, lvb: NaN, rvb: NaN, eff: NaN, ivcE: NaN, ivcI: NaN, lvot: NaN, wb: NaN, wm: NaN, wa: NaN };
function printed(s, k, heart) {
  const m = modelAt(s, k), T = measuredAt(heart, k, s) || NONE, T0 = measuredAt(heart, k, 0) || NONE;
  const v = { s, kase: k, heart, m };
  v.hr = rnd(m.hr);
  v.vti = rnd(m.vti, 1);
  v.lvid = rnd(T.lvid * 10);
  v.ef = rnd(T.ef);
  v.lvb = rnd(T.lvb, 1);
  v.rvb = rnd(T.rvb, 1);
  v.rvlv = rnd(v.rvb / v.lvb, 2);
  // the echo-free space at end-diastole; the mesh's own space round a heart with no fluid
  // (about 1 mm) is no effusion; the amyloid heart has its own small effusion
  const e = rnd(T.eff * 10);
  v.eff = e >= 2 ? e : null;
  v.ivc = rnd(T.ivcE, 1);
  v.coll = rnd(100 * (1 - T.ivcI / T.ivcE));
  v.rapR = rapEstimate({ d: v.ivc, col: v.coll, mode: 'sniff', sec: 'unclear' });
  v.rap = v.rapR.rap;
  v.lvot = rnd(T.lvot, 1);
  v.sv = rnd(0.785 * v.lvot ** 2 * v.vti);
  v.co = rnd((v.sv * v.hr) / 1000, 1);
  v.md = rnd((v.vti * v.hr) / 100, 1);
  // the RV free wall at end-systole (mm), and McConnell's sign: the middle akinetic, the apex at
  // its own motion
  v.wb = rnd(T.wb * 10, 1);
  v.wm = rnd(T.wm * 10, 1);
  v.wa = rnd(T.wa * 10, 1);
  v.mcc = v.wm < AKINETIC && v.wa >= 0.9 * rnd(T0.wa * 10, 1) && v.wa >= AKINETIC;
  // tamponade: the share of the cycle the RA wall stays in (%), and the RV's diastolic collapse
  v.ra = v.eff !== null && m.raCol > 0.005 ? rnd(100 * m.raCol) : 0;
  v.rvc = v.eff !== null && m.rvCol >= 0.15;
  v.tamp = v.eff !== null && (v.ra > 33 || v.rvc);
  return v;
}
/** The values shown at slider position s of case k on heart, with the stage and the pattern. */
function measure(s, k, heart) {
  const v = printed(s, k, heart);
  v.stage = stageOf(v);
  v.pattern = patternOf(v, s > 0 ? printed(0, k, heart) : v);
  return v;
}

// The stages of each case along its slider, from the printed values: the LV's size (below the
// 42 mm of men, Lang 2015), a hyperdynamic LV (LVEF above 70%, Paonessa 2015), the LVEF grades
// (Lang 2015), the size of the effusion (Klein 2013) and tamponade (RA collapse for more than a
// third of the cycle, or RV collapse in diastole: Klein 2013), the RV/LV ratio above 1
// (Labovitz 2010), McConnell's sign (McConnell 1996), and the output by the minute distance,
// VTI × heart rate, against its normal 9.7-20.5 m/min (Goldman 2001)
export const STAGES = {
  hypo: ['normal', 'small LV', 'hyperdynamic LV', 'low output'],
  cardio: ['normal', 'LVEF mildly reduced', 'LVEF moderately reduced', 'LVEF severely reduced'],
  tamp: ['no effusion', 'small effusion', 'moderate effusion', 'large effusion', 'tamponade'],
  pe: ['normal', 'RV/LV above 1', "McConnell's sign"],
  dist: ['normal', 'hyperdynamic LV', 'high output'],
};
const SHORT = {
  'small LV': 'small', 'hyperdynamic LV': 'hyperdynamic', 'low output': 'low output', 'LVEF mildly reduced': 'mild', 'LVEF moderately reduced': 'moderate',
  'LVEF severely reduced': 'severe', 'no effusion': 'none', 'small effusion': 'small', 'moderate effusion': 'moderate', 'large effusion': 'large', 'RV/LV above 1': 'RV/LV >1',
  "McConnell's sign": 'McConnell', 'high output': 'high output',
};
function stageOf(v) {
  switch (v.kase) {
    case 'hypo': return v.md < 9.7 ? 3 : v.ef > 70 ? 2 : v.lvid < 42 ? 1 : 0;
    case 'cardio': return v.ef < 30 ? 3 : v.ef < 41 ? 2 : v.ef < 52 ? 1 : 0;
    case 'tamp': return v.tamp ? 4 : v.eff === null ? 0 : v.eff < 10 ? 1 : v.eff <= 20 ? 2 : 3;
    case 'pe': return v.mcc ? 2 : v.rvlv > 1 ? 1 : 0;
    default: return v.md > 20.5 ? 2 : v.ef > 70 ? 1 : 0;
  }
}
/**
 * The pattern the printed findings show (Vincent 2013 Figure 1A): tamponade (an effusion with
 * the right heart's collapse), an obstruction with a dilated RV and a small LV (pulmonary
 * embolism), cardiogenic (poor contractility), hypovolemic (small chambers with normal or high
 * contractility, a collapsing IVC and no high output), distributive (a hyperdynamic LV that keeps
 * its size, without a low output), normal, or other abnormal findings. v0: the values at the
 * start of the case on the same heart. A size that is the heart's own (the amyloid heart's small
 * LV) is not a sign of the case: the LV has shrunk when it lies more than 3 mm below its size at
 * the start, and it is small when it has shrunk and lies below the 42 mm of men (Lang 2015).
 */
function patternOf(v, v0) {
  const shrunk = v.lvid < v0.lvid - 3, small = v.lvid < 42 && shrunk, reduced = v.ef < 52;
  if (v.tamp) return 'tamp';
  if (v.rvlv > 1) return 'pe';
  if (v.ef < 41) return 'cardio';
  if (small && v.rvb <= v0.rvb && !reduced && v.rap === 3 && v.md <= 20.5) return 'hypo';
  if (v.ef > 70 && !shrunk && v.md >= 9.7) return 'dist';
  return reduced || v.ef > 70 || v.lvid < 42 || v.lvid > 58 || v.eff !== null || v.rap > 3 || v.md < 9.7 || v.md > 20.5 ? 'other' : 'normal';
}

const memo = new Map();
/** The values shown for the slider, the case and the heart of state s. */
function shown(s) {
  const k = caseOf(s), heart = heartOf(s), x = clamp(Number(s && s[KEY]) || 0, 0, 1), key = `${x}|${k}|${heart}`;
  if (!memo.has(key)) {
    if (memo.size > 400) memo.clear();
    memo.set(key, measure(x, k, heart));
  }
  return memo.get(key);
}
/** The stage at slider position x of case k on heart: its name. */
export const gradeOf = (x, k = 'hypo', heart = 'normal') => STAGES[k][measure(x, k, heart).stage];

// ---------------------------------------------------------------- the figure
let sheet = null, st = null;
const redraw = () => { if (sheet) sheet.dirty = true; };
const PANELS = Object.fromEntries(Object.entries(VIEW).map(([k, view]) => [k, new MeshPanel(view, { diseases: DIS, lv: true, rv: true, redraw })]));
// Acute PE: each myocardium vertex's level along the RV (gl/rvpemesh.js), loaded with the views
let levels = null;
const loadLevels = () => rvLevels().then((L) => { if (!levels) { levels = L; redraw(); } }).catch(() => {});
const startAll = () => { for (const p of Object.values(PANELS)) p.start(); loadLevels(); };
// the page's own clock: beats at the page's heart rate, breaths at 15 a minute
const clock = { ms: 150, live: false };
// what the calipers measured on the last frame drawn (cm), for the checks
const DRAWN = {};

/** The moment drawn: the running beat and breath, or a frozen frame. */
function momentNow(v) {
  const f = frameOf(st);
  if (f === 'cine' && clock.live) {
    const rr = 60000 / v.hr, t = clock.ms % rr, r = breathAt(clock.ms);
    return { tc: warp(t, v.hr), f: t / rr, beats: (clock.ms / rr) % 2, r, insp: (1 + r) / 2, t, frame: 'cine' };
  }
  return { ...momentOf(f === 'ms' ? 'ms' : 'ed', v.hr), frame: f };
}

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((x) => ctx.measureText(x).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}
const FRAME_NAME = { cine: '', ed: ' · END-DIASTOLE', ms: ' · MIDSYSTOLE' };
const FRAME_SHORT = { cine: '', ed: ' · ED', ms: ' · MID-SYS' };
const titles = (c, long, short) => [`${long}${FRAME_NAME[c.frame]}`, `${short}${FRAME_NAME[c.frame]}`, `${short}${FRAME_SHORT[c.frame]}`, short];
const len2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A name in the open blood near the heart's anchor key. */
const inBlood = (key, r = 0.8) => (ev, s) => blood(ev, onPlane(ev, ev.anchors(s)[key]), r);
/** The RV's name on the four-chamber view: its open blood 2.5 cm from the tricuspid annulus into the RV (as rv.js). */
function rvName(ev, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), apex = onPlane(ev, ev.anchors(s).apex);
  let n = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), n) < 0) n = mul(n, -1);
  return blood(ev, add(M, mul(n, 2.5)));
}
/** The IVC's name, 1.6 cm along the vessel past its measuring site. */
function ivcName(ev) {
  const X = ivcAxis(ev);
  return X ? add(X.S, mul(X.t, 1.6)) : null;
}

function plax(ctx, box, v, c, o) {
  const sy = cycleAt(c.tc).s;
  PANELS.plax.draw(ctx, box, titleOf(ctx, box.w, titles(c, 'PARASTERNAL LONG AXIS', 'PLAX')), {
    tms: c.tc, ...viewOpts('plax', o),
    names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    lines: [[`LVIDd ${v.lvid} mm`, `LVIDd ${v.lvid}`], [`LVOT ${v.lvot.toFixed(1)} cm`, `LVOT ${v.lvot.toFixed(1)}`]],
    over: (cx, F, ev) => {
      if (c.frame === 'ed') {
        const K = plaxCalipers(ev, sy);
        DRAWN.lvid = K ? len2(K.lv[0], K.lv[1]) : null;
        if (K) cal(cx, F, K.lv[0], K.lv[1], '');
      } else if (c.frame === 'ms') {
        const L = lvotDiameter(ev, sy);
        DRAWN.lvot = L ? L.d : null;
        if (L) cal(cx, F, L.ends[0], L.ends[1], '');
      }
    },
  });
}

function psax(ctx, box, v, c, o) {
  // in acute PE the sector turns toward the dilated RV (views.js psax_pm_rv), so its crescent
  // shows whole; the other cases keep the short axis centred on the LV
  PANELS.psax.setView(st[CASE] === 'pe' ? 'psax_pm_rv' : VIEW.psax);
  PANELS.psax.draw(ctx, box, titleOf(ctx, box.w, titles(c, 'PARASTERNAL SHORT AXIS', 'PSAX')), {
    tms: c.tc, ...viewOpts('psax', o),
    names: [['rv', 'RV'], [inBlood('lv'), 'LV']],
    lines: v.eff === null ? [] : [[`Effusion ${v.eff} mm`, `Eff ${v.eff} mm`]],
    over: (cx, F, ev) => {
      if (c.frame !== 'ed') return;
      const E = effusionGap(ev, 0);
      DRAWN.eff = E ? E.d : null;
      if (E && v.eff !== null) cal(cx, F, E.ends[0], E.ends[1], '');
    },
  });
}

function a4c(ctx, box, v, c, o) {
  const sy = cycleAt(c.tc).s;
  PANELS.a4c.draw(ctx, box, titleOf(ctx, box.w, titles(c, 'APICAL FOUR-CHAMBER', 'A4C')), {
    tms: c.tc, ...viewOpts('a4c', o),
    names: [[inBlood('lv'), 'LV'], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines: [[`RV/LV ${v.rvlv.toFixed(2)}`, `RV/LV ${v.rvlv.toFixed(2)}`], [`LVEF ${v.ef}%`, `EF ${v.ef}%`], ...(v.mcc ? [["McConnell's sign", 'McConnell']] : [])],
    over: (cx, F, ev) => {
      if (c.frame === 'ed') {
        const L = basalDiameter(ev, 'MitralValve', 0), R = basalDiameter(ev, 'TricuspidValve', 0);
        DRAWN.lvb = L ? L.d : null;
        DRAWN.rvb = R ? R.d : null;
        for (const B of [L, R]) if (B) cal(cx, F, B.ends[0], B.ends[1], '');
      } else if (v.kase === 'pe' && v.m.gM < 1) peWall(cx, F, ev, sy);
    },
  });
}

/**
 * The RV free wall's motion by third under acute PE (gl/rvpemesh.js freeWall), as rv.js
 * marks it: a ring at the wall's place at end-diastole, a dot at its place now, and a line
 * between them. The mid wall's dot stays on its ring when it is akinetic.
 */
function peWall(c, F, ev, sy) {
  const fw = freeWall(ev, sy);
  if (!fw) return;
  c.save();
  c.fillStyle = SC.cal;
  c.strokeStyle = SC.cal;
  c.lineWidth = 1.2;
  for (const w of wallLevels(fw)) {
    if (!w) continue;
    const [x0, y0] = F.P(w.P0), [x1, y1] = F.P(w.P);
    c.beginPath();
    c.arc(x0, y0, 3.4, 0, 2 * Math.PI);
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.beginPath();
    c.arc(x1, y1, 2, 0, 2 * Math.PI);
    c.fill();
  }
  c.restore();
}

function sc4c(ctx, box, v, c, o) {
  const lines = [];
  if (v.ra) lines.push([`RA collapse ${v.ra}% of cycle`, `RA in ${v.ra}%`]);
  if (v.rvc) lines.push(['RV collapse in diastole', 'RV collapse']);
  PANELS.sc4c.draw(ctx, box, titleOf(ctx, box.w, titles(c, 'SUBCOSTAL FOUR-CHAMBER', 'SC 4C')), {
    tms: c.tc, ...viewOpts('sc4c', o),
    names: [[inBlood('lv'), 'LV'], [inBlood('rv'), 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines,
  });
}

function ivc(ctx, box, v, c, o) {
  PANELS.ivc.draw(ctx, box, titleOf(ctx, box.w, titles(c, 'SUBCOSTAL IVC', 'IVC')), {
    tms: c.tc, ...viewOpts('ivc', o),
    names: [[ivcName, 'IVC'], ['ra', 'RA']],
    lines: [[`IVC ${v.ivc.toFixed(1)} cm`, `IVC ${v.ivc.toFixed(1)}`], [`collapse ${v.coll}%`, `${v.coll}%`], [`RAP ${v.rap} mmHg`, `RAP ${v.rap}`]],
    over: (cx, F, ev) => {
      if (c.frame === 'cine') return;
      const D = ivcDiameter(ev);
      DRAWN.ivc = D ? D.d : null;
      if (D) cal(cx, F, D.ends[0], D.ends[1], '');
    },
  });
}

/**
 * The LVOT's velocity at hr for the printed VTI: the cycle model's LVOT shape (cyclemodel.js
 * lvotV) on the warped beat, scaled so that its integral over ejection is the VTI. Returns the
 * velocity at t ms into a beat (m/s, flow away from the apical probe as positive), the peak and
 * the ejection's start and end (ms).
 */
export function lvotFlow(vti, hr) {
  const k = sysK(hr), t0 = EV.avo * k, t1 = EV.avc * k, N = 600;
  let I = 0;
  for (let i = 0; i < N; i++) I += lvotV(warp(t0 + ((i + 0.5) * (t1 - t0)) / N, hr), 1) * ((t1 - t0) / N);
  // m/s × ms = mm: the peak that gives vti cm
  const peak = (vti * 10) / I;
  return { peak, t0, t1, at: (t) => peak * lvotV(warp(t, hr), 1) };
}
/** The strip's beats at hr: as many as fill about 2.4 s, at least two. */
export const stripBeats = (hr) => Math.max(2, Math.round(2400 / (60000 / hr)));

/**
 * PW Doppler in the LVOT from the apical five-chamber view, at the page's heart rate: the
 * envelope below the baseline (flow away from the probe), the second beat's VTI traced along
 * its envelope, the VTI on the title line, and the stroke volume and cardiac output from it.
 */
function pwLvot(ctx, P, v, c) {
  const narrow = P.w < 250;
  const title = titleOf(ctx, P.w - 96, ['PW · LVOT · APICAL FIVE-CHAMBER', 'PW · LVOT · A5C', 'PW · LVOT']);
  panel(ctx, P.x, P.y, P.w, P.h, title);
  const bx = inner(P);
  const rr = 60000 / v.hr, n = stripBeats(v.hr), span = n * rr, Q = lvotFlow(v.vti, v.hr);
  // the envelope's peak 2/3 of the way down the strip, clear of the box of values at its foot
  const scale = Math.max(1, Math.ceil(Q.peak * 1.45 * 2) / 2), base = 0.1;
  const S = spectral(ctx, bx, { fn: (u) => -Q.at((u * span) % rr), scale, base, mode: 'pw', broad: 0.09, key: `shk|${v.hr}|${v.vti}|${scale}|${n}`, seed: 61 });
  vscale(ctx, bx, scale, base, 0.5);
  // the trace of the second beat's envelope, closed on the baseline
  const X = (t) => bx.x + ((rr + t) / span) * bx.w, Y = (vel) => S.y0 + vel * S.pxPerV;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(X(Q.t0), S.y0);
  for (let i = 0; i <= 60; i++) { const t = Q.t0 + ((Q.t1 - Q.t0) * i) / 60; ctx.lineTo(X(t), Y(Q.at(t))); }
  ctx.lineTo(X(Q.t1), S.y0);
  ctx.stroke();
  ctx.setLineDash([]);
  // the VTI on the title line, at the right
  ctx.font = `500 ${narrow ? 10 : 11}px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'right';
  ctx.fillText(`VTI ${v.vti.toFixed(1)} cm`, P.x + P.w - 10, P.y + 17);
  ctx.restore();
  // the traced envelope's integral (cm), on the strip's own pixel columns
  {
    const cw = Math.round(bx.w), dt = span / cw;
    let I = 0;
    for (let i = 0; i < cw; i++) { const t = (i + 0.5) * dt; if (t >= rr && t < 2 * rr) I += Q.at(t - rr) * dt; }
    DRAWN.vti = I / 10;
  }
  const d = v.lvot.toFixed(1), co = v.co.toFixed(1);
  const lines = narrow ? [`SV ${v.sv} mL`, `CO ${co} L/min`] : [`SV 0.785 × ${d}² × ${v.vti.toFixed(1)} = ${v.sv} mL`, `CO ${v.sv} mL × ${v.hr}/min = ${co} L/min`];
  ctx.save();
  ctx.font = `500 10.5px ${MONO}`;
  const fits = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20 <= bx.w;
  ctx.restore();
  const L = fits ? lines : [`SV ${v.sv} mL`, `CO ${co} L/min`];
  tagBox(ctx, bx.x + 4, bx.y + bx.h - 6 - (L.length * 13.5 + 8) / 2, L, { size: 10.5 });
  // the sweep, or a line at the frozen frame
  cursor(ctx, bx, c.frame === 'cine' && clock.live ? (clock.ms % span) / span : (rr + c.t) / span);
}

function draw(sh) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const c = momentNow(v);
  cine.live = c.frame === 'cine' && clock.live;
  const o = meshOf(v.m, v.heart, { ...c, levels });
  let boxes;
  if (W < 700) {
    const [r1, r2, r3] = rows({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1, 1, 1], 8);
    boxes = [r1, r2, r3].flatMap((r) => cols(r, [1, 1], 8));
  } else {
    const [r1, r2] = rows({ x: 16, y: 14, w: W - 32, h: H - 26 }, [1, 1], 10);
    boxes = [r1, r2].flatMap((r) => cols(r, [1, 1, 1], 10));
  }
  [plax, psax, a4c, sc4c, ivc].forEach((fn, i) => fn(ctx, boxes[i], v, c, o));
  pwLvot(ctx, boxes[5], v, c);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
// LVEF (Lang 2015, men: normal 52-72%, mildly abnormal 41-51%, moderately 30-40%, severely
// <30%) and above 70%, hyperdynamic (the ACC's definition, Paonessa 2015)
const efWord = (ef) => (ef > 70 ? 'hyperdynamic' : ef >= 52 ? 'normal' : ef >= 41 ? 'mildly reduced' : ef >= 30 ? 'moderately reduced' : 'severely reduced');
// pericardial effusion at end-diastole (Klein 2013): small <10 mm, moderate 10-20, large >20, very large >25
const effWord = (e) => (e < 10 ? 'small' : e <= 20 ? 'moderate' : e <= 25 ? 'large' : 'very large');
const LEAD = {
  tamp: 'Obstructive pattern: cardiac tamponade',
  pe: 'Obstructive pattern: a dilated RV and a small LV, as in pulmonary embolism',
  cardio: 'Cardiogenic pattern: a large, poorly contracting LV',
  hypo: 'Hypovolemic pattern: a small LV with normal or high contractility',
  dist: 'Distributive pattern: a normal-sized, hyperdynamic LV',
  normal: 'Normal findings',
};
/** The lead for other abnormal findings: the first that applies. */
function otherLead(v) {
  if (v.ef < 52) return `LVEF ${efWord(v.ef)}`;
  if (v.eff !== null) return `${effWord(v.eff)[0].toUpperCase()}${effWord(v.eff).slice(1)} pericardial effusion`;
  if (v.lvid > 58) return 'Dilated LV';
  if (v.lvid < 42) return 'Small LV';
  if (v.ef > 70) return 'Hyperdynamic LV';
  if (v.md < 9.7) return 'Low output';
  if (v.md > 20.5) return 'High output';
  return 'Raised RA pressure';
}
// the hearts of the header menu with a disease of their own: the page starts from it
const HEART_NOTE = {
  amyloid: () => ` The heart shown is the amyloid heart (chapter ${numOf('amyloid')}): before the case starts, its walls are thick, its atria large and a small effusion surrounds it.`,
  icm: () => ` The heart shown is the ischemic heart: before the case starts, its LV is dilated after an LAD infarct and its LVEF is 25% (chapter ${numOf('segments')}).`,
  barlow: () => ` The heart shown is the Barlow heart: its LV is large from the severe MR of chapter ${numOf('mr')}, which this figure does not draw.`,
  bav: () => ` The heart shown has a bicuspid aortic valve with severe stenosis (chapter ${numOf('as')}): its LV walls are thick, and the PW strip is the model's flow below the valve.`,
};

function liveOf(v, cite) {
  const L = cite('lang2015'), Pn = cite('paonessa2015'), K = cite('klein2013'), M = cite('mukherjee2025'), Lb = cite('labovitz2010');
  const G = cite('goldman2001'), V = cite('vincent2013'), Z = cite('zoghbi2017');
  const lead = v.pattern === 'other' ? otherLead(v) : LEAD[v.pattern];
  // the LV: its size and its function
  const size = v.lvid < 42 ? ', below the 42–58 mm of men' : v.lvid > 58 ? ', above the 42–58 mm of men' : '';
  const ef = v.ef > 70 ? `, above 70%: a hyperdynamic LV${Pn}` : `, ${efWord(v.ef)}${L}`;
  const s0 = ` The LV measures ${v.lvid} mm at end-diastole${size}${size ? L : ''}, and its LVEF is ${v.ef}%${ef}.`;
  // the RV
  let s1 = '';
  if (v.rvlv > 1) {
    s1 = ` At its base the RV measures ${fmt(v.rvb, 1)} cm, more than the LV's ${fmt(v.lvb, 1)} cm (RV/LV ${v.rvlv.toFixed(2)}): RV dilatation${Lb}.`;
    if (v.kase === 'pe' && v.m.eiS > 1.1) s1 += ' The septum flattens toward the LV.';
    if (v.mcc) s1 += ` The mid free wall moves ${fmt(v.wm, 1)} mm inward while the apex keeps its ${fmt(v.wa, 1)} mm: McConnell's sign${cite('mcconnell1996')}.`;
  }
  // the pericardium
  let s2 = '';
  if (v.eff !== null) {
    s2 = ` The pericardial effusion measures ${v.eff} mm at end-diastole, ${effWord(v.eff)}${K}.`;
    if (v.ra) s2 += ` RA collapse lasts ${v.ra}% of the cycle${v.ra > 33 ? ', more than a third: nearly 100% sensitive and specific for tamponade' : ''}${K}.`;
    if (v.rvc) s2 += ` The RV free wall collapses in early diastole; this comes when the output has fallen by about 20%, before the blood pressure falls${K}.`;
  }
  // the IVC and the RA pressure
  const ivcTxt = v.rap === 15 ? ', dilated with less than 50% collapse' : v.rap === 8 ? ', an indeterminate pattern' : '';
  let s3 = ` The IVC measures ${fmt(v.ivc, 1)} cm and collapses ${v.coll}% with a sniff${ivcTxt}: the RA pressure is estimated at ${v.rap} mmHg${M}.`;
  if (v.pattern === 'hypo') s3 += ` A small IVC that collapses suggests an RA pressure below 3 mmHg and hypovolemia${M}.`;
  if (v.pattern === 'tamp' && v.rap === 15) s3 += ` IVC plethora is expected in more than 90% of patients with tamponade${K}.`;
  // the flow
  const out = v.md < 9.7 ? 'below' : v.md > 20.5 ? 'above' : 'within';
  let s4 = ` The LVOT VTI is ${fmt(v.vti, 1)} cm at ${v.hr}/min: the stroke volume is ${v.sv} mL and the cardiac output ${fmt(v.co, 1)} L/min${Z}. The minute distance, VTI × heart rate, is ${fmt(v.md, 1)} m/min, ${out} the normal 9.7–20.5 m/min${G}.`;
  if (v.kase === 'cardio' && v.vti < 16) s4 += ` In 6957 patients in a cardiac ICU, an LVOT VTI below 16 cm was the most important echo predictor of death in hospital${cite('jentzer2022')}.`;
  if (v.kase === 'pe' && v.vti <= 15) s4 += ` In acute PE, a VTI of 15 cm or less went with death or cardiac arrest in hospital${cite('yuriditsky2020')}.`;
  // the bedside reading (Vincent 2013's algorithm: the output, then the venous pressure)
  let s5 = '';
  if (v.md < 9.7) s5 = v.rap === 3 ? ` A low output with a low RA pressure points to hypovolemia${V}.` : v.rap === 15 ? ` A low output with a high RA pressure points to a cardiogenic or an obstructive cause${V}.` : '';
  else if (v.pattern === 'dist' || v.md > 20.5) s5 = ` A normal or high output points to distributive shock${V}.`;
  if (v.pattern === 'hypo' && v.md < 9.7) s5 += ` In a patient in shock, a collapsed IVC should prompt a search for abdominal hemorrhage${Lb}.`;
  const heart = HEART_NOTE[v.heart] ? HEART_NOTE[v.heart]() : '';
  return `<b>${lead}.</b>${s0}${s1}${s2}${s3}${s4}${s5}${heart}`;
}

// ---------------------------------------------------------------- the page
const BANDS = new Map();
/** The stage bands of case k on heart (computed once). */
function bandsOf(k, heart) {
  const key = `${k}|${heart}`;
  if (!BANDS.has(key)) BANDS.set(key, bands((x) => gradeOf(x, k, heart), 400));
  return BANDS.get(key);
}

const page = {
  key: 'shock',
  part: 'acute',
  title: 'Shock',
  nav: 'Shock',
  dwell: 65,
  defaults: { shkS: 0.6, shkCase: 'hypo', shkFrame: 'cine' },
  format: { shkS: (x, s) => gradeOf(x, caseOf(s), heartOf(s)) },
  watch: ['shkS', 'shkCase', 'shkFrame', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    const host = document.getElementById('shk-grades');
    let painted = '';
    const paint = (s) => {
      const k = caseOf(s), heart = heartOf(s), key = `${k}|${heart}`;
      if (key === painted) return;
      painted = key;
      paintBands(host, bandsOf(k, heart), Object.fromEntries(STAGES[k].map((g, i) => [g, i])), SHORT);
    };
    paint(state);
    subscribe?.((s, ch) => { if (CASE in ch || 'pheno' in ch) paint(s); });
  },
  // the heart model, the targets and the RV's levels load at idle, before the chapter opens (main.js warms every chapter)
  enter() { startAll(); },
  warm() { startAll(); },
  pulse: () => {
    const rr = 60000 / shown(st).hr;
    return { rr, phase: clock.live ? (clock.ms % rr) / rr : null };
  },
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, bandsOf(caseOf(s), heartOf(s)));
    clock.live = frameOf(s) === 'cine' && !reducedMotion;
    if (clock.live) {
      clock.ms += dt * 1000;
      if (sheet) sheet.dirty = true;
    }
  },
  // the sequence: each case from a normal heart to its severe form, in the order of the switch
  tourEnter(set) { set({ shkS: 0, shkCase: 'hypo', shkFrame: 'cine' }); },
  tourTick(tt, set) {
    const i = clamp(Math.floor(tt / 13), 0, CASES.length - 1);
    set({ shkCase: CASES[i], shkS: Math.round(clamp((tt - 13 * i - 1) / 11, 0, 1) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse): the sequence continues from it
  tourAt(s) { return 13 * CASES.indexOf(caseOf(s)) + 1 + clamp(Number(s.shkS) || 0, 0, 1) * 11; },
  text(s, { cite }) {
    const v = shown(s);
    return {
      readouts: [
        { k: 'LVIDd', v: fmt(v.lvid), u: 'mm', flag: v.lvid < 42 || v.lvid > 58 },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.ef > 70 || v.ef < 52 },
        { k: 'RV/LV', v: v.rvlv.toFixed(2), flag: v.rvlv > 1 },
        v.eff === null ? { k: 'Effusion', v: 'none', text: true, flag: false } : { k: 'Effusion', v: fmt(v.eff), u: 'mm', flag: true },
        { k: 'IVC, collapse', v: fmt(v.ivc, 1), u: `cm · ${v.coll}%`, flag: v.ivc > 2.1 || v.coll < 50 },
        { k: 'RA pressure', v: fmt(v.rap), u: 'mmHg', flag: v.rap > 3 },
        { k: 'LVOT VTI', v: fmt(v.vti, 1), u: 'cm', flag: false },
        { k: 'Stroke volume', v: fmt(v.sv), u: 'mL', flag: false },
        { k: 'Heart rate', v: fmt(v.hr), u: '/min', flag: false },
        { k: 'Cardiac output', v: fmt(v.co, 1), u: 'L/min', flag: false },
        { k: 'VTI × HR', v: fmt(v.md, 1), u: 'm/min', flag: v.md < 9.7 || v.md > 20.5 },
      ],
      live: liveOf(v, cite),
    };
  },
};
export default page;

/** The figure's state for the checks: the values shown and what the calipers measured on the last frame. */
export function figureState() { return { shown: st ? shown(st) : null, drawn: { ...DRAWN } }; }
