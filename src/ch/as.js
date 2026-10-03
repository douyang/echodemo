// 11 Aortic stenosis: one slider from a normal valve to severe stenosis, then to the late stage
// in which the LV fails, the stroke volume falls and the gradient falls with it. The valve area
// sets the jet by the continuity equation; the LV thickens, then fails. Illustrative values.
// The figure: an apical five-chamber view with the CW Doppler line through the valve, the CW
// trace with the LVOT and aortic jet envelopes, and the short-axis valve orifice to scale.
// The text holds the calculations as a diagram, with ▲▼ buttons on six measurements: the LVOT
// diameter, the LVOT VTI and peak velocity, the AV peak velocity and VTI, and the LVEF. An edit
// stores the six values in ax; the slider then marks a band of their result and does not change
// them. A move of the slider, Play, the tour or a heart's preset clears ax, and the values
// follow the slider again.
import { Sheet, clamp, mix, MONO } from '../sketch.js';
import { panel, spectral, vscale, caliper, tagBox } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { asGrade, asCriteria, AS_BANDS } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit } from '../sev.js';
import { drawA5C, drawPSAXav, measures, cal, heartShown } from '../echo2d.js';
import { reducedMotion } from '../state.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';
import { JETS } from '../jets.js';

const KEY = 'asS';
const ET = 0.292;                    // s, the model's ejection time (Alhakak 2025 mean)
const LVOT_D = 2.0;                  // cm, the model's LVOT diameter

// ---------------------------------------------------------------- the Doppler envelopes
// Each envelope over ejection: v(t) = V g(t / ET), g(u) = sin(π u^q)^p. The aortic jet peaks
// later and rounder as the valve narrows (q from 0.78 to 1.18, Baumgartner 2017), with p = 0.6;
// the LVOT envelope is symmetric (q = 1), with p = 0.8.
const P_AV = 0.6, P_LVOT = 0.8;
const ET_LO = 0.2, ET_HI = 0.45, P_LO = 0.1, P_HI = 24;
const qOf = (ava) => mix(0.78, 1.18, clamp((1.6 - ava) / 1.0, 0, 1));
const shape = (q, p) => (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * Math.pow(u, q)), p) : 0);
const memo = new Map();
/** The mean of g over ejection (cached: the figure asks for it each frame). */
function gMean(q, p) {
  const key = `${q.toFixed(5)}|${p.toFixed(5)}`;
  let m = memo.get(key);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < 240; i++) m += Math.pow(Math.sin(Math.PI * Math.pow((i + 0.5) / 240, q)), p);
    m /= 240;
    if (memo.size > 4000) memo.clear();
    memo.set(key, m);
  }
  return m;
}
/** The p for which the mean of g is f, within P_LO to P_HI. */
function fitP(q, f) {
  if (f >= gMean(q, P_LO)) return P_LO;
  if (f <= gMean(q, P_HI)) return P_HI;
  let lo = Math.log(P_LO), hi = Math.log(P_HI);
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (gMean(q, Math.exp(m)) > f) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

/**
 * The envelopes of one ejection, fitted to the measurements, and the mean gradient. The AV VTI
 * is 100 × Vmax × ET × mean(g). The ejection time takes the ratio of the AV VTI to the AV peak
 * velocity at the model's p, within 0.20–0.45 s. Past those limits, p makes the envelope fuller
 * or more peaked, so the envelope keeps the measured peak and VTI. The LVOT envelope has the
 * same ejection time, and its p fits the LVOT VTI to the LVOT peak velocity. The mean gradient
 * is the mean of 4v² over the AV envelope: 4 Vmax² × mean(g²), in which the ejection time
 * cancels. It is not 4 × (mean velocity)².
 */
function envelopes(v) {
  const qA = qOf(v.ava);
  let et = v.vtiA / (100 * v.vmax * gMean(qA, P_AV)), pA = P_AV;
  if (et < ET_LO || et > ET_HI) {
    et = clamp(et, ET_LO, ET_HI);
    pA = fitP(qA, v.vtiA / (100 * v.vmax * et));
  }
  const pL = fitP(1, v.vtiL / (100 * v.vL * et));
  const f2 = gMean(qA, 2 * pA);
  return { et, qA, pA, pL, f2, mg: 4 * v.vmax * v.vmax * f2 };
}

// ---------------------------------------------------------------- the model
// The valve area halves before a gradient appears, so the first stretch of the slider is short.
// The area of a normal valve by the continuity equation stays below the LVOT area: 2.7 cm².
const avaOf = mono([[0, 2.7], [0.1, 1.35], [0.22, 1.15], [0.34, 1.0], [0.48, 0.83], [0.62, 0.7], [0.74, 0.63], [0.84, 0.6], [1, 0.58]]);
const TRK = tracks([0, 0.2, 0.42, 0.56, 0.72, 0.84, 1], {
  sv: [72, 72, 72, 72, 72, 60, 44],
  ef: [62, 62, 62, 61, 60, 45, 32],
  wall: [0.9, 0.95, 1.05, 1.2, 1.3, 1.3, 1.25],
  lvidd: [4.8, 4.8, 4.7, 4.6, 4.6, 5.0, 5.6],
  ee: [8, 9, 11, 13, 15, 17, 19],
  lavi: [24, 26, 30, 34, 38, 44, 50],
  calc: [0, 0.3, 0.6, 0.8, 1, 1, 1],
  cusp: [0.1, 0.15, 0.2, 0.25, 0.28, 0.28, 0.28],
});

/** The model at slider position s: its six measurements before rounding, and the rest of the heart. */
function modelAt(s) {
  const m = TRK(s);
  m.s = s;
  const ava = avaOf(s), csa = Math.PI * (LVOT_D / 2) ** 2;
  m.lvotD = LVOT_D;
  m.vtiL = m.sv / csa;
  m.vL = m.vtiL / (100 * ET * gMean(1, P_LVOT));
  m.vtiA = m.sv / ava;
  m.vmax = m.vtiA / (100 * ET * gMean(qOf(ava), P_AV));
  return m;
}

/** The six measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  lvotD: { d: 1, step: 0.1, min: 1.6, max: 2.6 },
  vtiL: { d: 0, step: 1, min: 8, max: 35 },
  vL: { d: 2, step: 0.05, min: 0.4, max: 1.6 },
  vmax: { d: 1, step: 0.1, min: 1.0, max: 6.0 },
  vtiA: { d: 0, step: 2, min: 20, max: 160 },
  ef: { d: 0, step: 5, min: 15, max: 75 },
};
const IN = Object.keys(INPUTS);
const DEC = { csa: 2, sv: 0, svi: 0, ava: 2, avai: 2, dvi: 2, vr: 2, pg: 0, mg: 0, f2: 2, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };
const round = (x, d) => Math.round(x * 10 ** d + 1e-7) / 10 ** d;

/**
 * Values as reported: the six measurements at their decimals, and each calculation from them at
 * its own. The grades read these numbers, so a value on screen never contradicts its grade.
 */
function measure(raw) {
  const v = { ...raw };
  for (const k of IN) v[k] = round(raw[k], INPUTS[k].d);
  const csa = Math.PI * (v.lvotD / 2) ** 2, sv = csa * v.vtiL, ava = sv / v.vtiA;
  const E = envelopes({ ...v, ava });
  Object.assign(v, E);
  const calc = { csa, sv, svi: sv / BSA, ava, avai: ava / BSA, dvi: v.vtiL / v.vtiA, vr: v.vL / v.vmax, pg: 4 * v.vmax ** 2, mg: E.mg };
  for (const [k, x] of Object.entries(calc)) v[k] = round(x, DEC[k]);
  v.crit = asCriteria({ vmax: v.vmax, mean: v.mg, ava: v.ava, svi: v.svi, ef: v.ef });
  v.grade = asGrade({ vmax: v.vmax, mean: v.mg, ava: v.ava, svi: v.svi, ef: v.ef });
  return v;
}

/** The values on screen, from the store: the edited six (ax), or the model's at the slider. */
function shownOf(s) {
  if (!s.ax) return measure(modelAt(s[KEY]));
  const v = modelAt(s.ax.base);
  for (const k of IN) v[k] = s.ax[k];
  return measure(v);
}
let lastKey = null, lastShown = null;
/** shownOf, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = s.ax || s[KEY];
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = shownOf(s); }
  return lastShown;
}
export const gradeOf = (s) => measure(modelAt(s)).grade;

// the results: their level (the colour of their band), the short name of the band, the bold
// lead of the live sentence, and the line under it in the diagram
const LEV = { ...LEVEL, 'NF-LG': 3, 'paradoxical LF-LG': 4, 'classical LF-LG': 5, 'severe, LV dysfunction': 4 };
const SHORT = { 'very severe': 'v. severe', 'severe, LV dysfunction': 'EF <50', 'classical LF-LG': 'LF-LG' };
const LEAD = {
  none: 'No aortic stenosis', mild: 'Mild aortic stenosis', moderate: 'Moderate aortic stenosis', severe: 'Severe aortic stenosis',
  'very severe': 'Very severe aortic stenosis', 'severe, LV dysfunction': 'Severe aortic stenosis with LV dysfunction',
  'NF-LG': 'Normal-flow, low-gradient aortic stenosis', 'paradoxical LF-LG': 'Paradoxical low-flow, low-gradient aortic stenosis',
  'classical LF-LG': 'Classical low-flow, low-gradient aortic stenosis',
};
const HEAD = {
  none: ['No stenosis', 'peak velocity ≤2.5 m/s'], mild: ['Mild stenosis', 'low gradient, AVA ≥1.0 cm²'], moderate: ['Moderate stenosis', 'low gradient, AVA ≥1.0 cm²'],
  severe: ['Severe stenosis', 'high gradient'], 'very severe': ['Very severe stenosis', 'high gradient'], 'severe, LV dysfunction': ['Severe stenosis', 'LV dysfunction'],
  'NF-LG': ['Normal-flow, low-gradient', 'AVA <1.0 cm², SVi ≥35'], 'paradoxical LF-LG': ['Paradoxical low-flow, low-gradient', 'LVEF ≥50%, SVi <35'],
  'classical LF-LG': ['Classical low-flow, low-gradient', 'LVEF <50%'],
};
const SEVERE = new Set(['severe', 'very severe', 'severe, LV dysfunction', 'NF-LG', 'paradoxical LF-LG', 'classical LF-LG']);
let BANDS = [];

/** The slider for result g: where it is if that is in a band of g, else the middle of the nearest band of g. */
function slideTo(x, g) {
  const of = BANDS.filter((b) => b.g === g);
  if (!of.length || of.some((b) => x >= b.a && (x < b.b || b.b === 1))) return x;
  const dist = (b) => (x < b.a ? b.a - x : x - b.b);
  const b = of.reduce((p, q) => (dist(q) < dist(p) ? q : p));
  return Math.round(((b.a + b.b) / 2) * 200) / 200;
}

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- the figure
/** The A5C at the values on screen: walls and LV size from the model, the LVOT, the valve and the LV's contraction from the measurements. */
function a5c(ctx, box, v, t) {
  const ef = v.ef / 100;
  const lvids = v.lvidd * Math.sqrt(Math.max(0.2, 1 - ef) / 0.38) * 0.625;
  const sysW = v.wall * (1 + 0.9 * (ef - 0.15));
  const lvL = 7.9 + 0.8 * (v.lvidd - 4.8);
  const laMax = v.lavi * BSA, laMin = laMax * 0.62;
  const dims = (vol) => { const L = Math.cbrt(vol / (0.524 * 0.8 * 0.8)); return [0.8 * L, L]; };
  const [wMax, lMax] = dims(laMax), [wMin, lMin] = dims(laMin);
  const g = {
    lvL: [lvL, lvL * (1 - 0.22 * ef)], lvW: [v.lvidd, lvids], lvWall: [v.wall, sysW], ivs: [v.wall, sysW],
    rvW: [3.3, 2.7], laW: [wMin, wMax], laL: [lMin, lMax], raW: [3.2, 3.8], raL: [3.9, 4.5],
    lvot: v.lvotD, root: 3.1,
    av: { thick: v.cusp, open: Math.min(v.lvotD - 0.1, 2 * Math.sqrt(v.ava / Math.PI) * 0.9), calc: v.calc },
  };
  // the jet follows the CW trace through ejection
  const a = shape(v.qA, v.pA)((t - EV.avo) / (v.et * 1000));
  const jl = 2 + v.vmax * 0.6, jw = 1.4 + v.vmax * 0.18;
  const flow = JETS === 'plume'
    ? { jets: v.vmax > 2.2 ? { as: { q: v.sv / v.et, va: 60, vc: Math.sqrt(v.ava), jl, jw, a } } : null }
    : { color: { lo: -60, hi: 60, variance: true, lvot: v.vL, as: v.vmax > 2.2 ? { q: v.ava * v.vmax * 100, u0: v.vmax * 100, vc: 2 * Math.sqrt(v.ava / Math.PI), jl, jw, a } : null } };
  drawA5C(ctx, box, g, {
    t, title: fit(box.w, 'APICAL FIVE-CHAMBER · COLOR 60 cm/s', 'A5C · COLOR 60'), ...flow, cw: true,
    after: (c, F, geo) => {
      cal(c, F, geo.Al, geo.Ar, '');
      measures(c, F, [`LVOT ${v.lvotD.toFixed(1)} cm`, ...(heartShown() === 'bav' ? [[`Ascending aorta ${geo.asc.toFixed(1)} cm`, `Asc Ao ${geo.asc.toFixed(1)} cm`]] : [])]);
    },
  });
}

/**
 * CW through the LVOT and the valve: the dense LVOT envelope inside the fainter aortic jet, with
 * both peaks marked. A narrow panel puts its line above a lower baseline, clear of the labels.
 */
function avCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · LVOT AND AORTIC VALVE', 'CW · LVOT, AV'));
  const bx = inner(P), narrow = bx.w < 300, base = narrow ? 0.15 : 0.07;
  const vs = Math.max(4, Math.ceil(v.vmax + 0.6));
  const gA = shape(v.qA, v.pA), gL = shape(1, v.pL), T = v.et * 1000;
  const at = (u) => ((u * 2 * RR) % RR - EV.avo) / T;
  spectral(ctx, bx, {
    fn: [(u) => -v.vmax * gA(at(u)), (u) => -v.vL * gL(at(u))], gain: [0.75, 1.35], scale: vs, base, mode: 'cw', broad: 0.45,
    key: `ascw|${v.vmax}|${v.vL}|${v.qA.toFixed(3)}|${v.pA.toFixed(3)}|${v.pL.toFixed(3)}|${T.toFixed(1)}|${vs}|${base}`, seed: 3,
  });
  vscale(ctx, bx, vs, base, 1);
  // the peaks: the jet's in the first beat, the LVOT's in the second
  const peak = (g) => { let best = 0, bu = 0; for (let i = 0; i <= 200; i++) { const y = g(i / 200); if (y > best) { best = y; bu = i / 200; } } return bu; };
  const k = (bx.h * (1 - base)) / vs, yb = bx.y + bx.h * base, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const labels = [];
  // the box tagBox() draws for a tag at (x, y). With no stenosis the two peaks are near the same
  // velocity, and on a narrow panel a tag beside its caliper then meets a caliper or the other tag.
  const boxAt = (x, y, text) => {
    ctx.save();
    ctx.font = `500 10.5px ${MONO}`;
    const w = ctx.measureText(text).width + 12, h = 10.5 + 3 + 8;
    ctx.restore();
    const x0 = Math.max(bx.x + 4, Math.min(bx.x + bx.w - w - 4, x)), y0 = Math.max(bx.y + 4, Math.min(bx.y + bx.h - h - 4, y - h / 2));
    return { x0, y0, x1: x0 + w, y1: y0 + h, h };
  };
  const meets = (a, b) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2 && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2;
  const peaks = [[EV.avo + peak(gA) * T, v.vmax, `AV ${v.vmax.toFixed(1)}`], [RR + EV.avo + peak(gL) * T, v.vL, `LVOT ${v.vL.toFixed(2)}`]]
    .map(([ms, vel, text]) => ({ x: X(ms), y: yb + vel * k, text: narrow ? text : `${text} m/s` }));
  const cals = peaks.map(({ x, y }) => ({ x0: x - 12, y0: y - 5, x1: x + 12, y1: y + 5 }));
  peaks.forEach(({ x, y }) => caliper(ctx, x - 10, y, x + 10, y, { solid: true }));
  peaks.forEach(({ x, y, text }, i) => {
    // beside the caliper, else below it (the AV tag) or above it (the LVOT tag), else the other
    const h = boxAt(x + 14, y, text).h, tries = i ? [y, y - h - 4, y + h + 4] : [y, y + h + 4, y - h - 4];
    const ty = tries.find((t) => { const b = boxAt(x + 14, t, text); return ![...cals, ...labels].some((o) => meets(b, o)); }) ?? y;
    const r = tagBox(ctx, x + 14, ty, [text], { size: 10.5, bounds: bx });
    labels.push({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
  });
  const vr = v.vr.toFixed(2);
  if (narrow) note(ctx, bx, `ratio ${vr}`, 'top');
  else {
    // a bottom corner clear of the two labels: the left one, or the right one when a fast jet's
    // label reaches the bottom
    const upper = { x0: bx.x, y0: bx.y, x1: bx.x + bx.w, y1: bx.y + bx.h * 0.5 };
    note(ctx, bx, [`VTI: AV ${v.vtiA} cm · LVOT ${v.vtiL} cm · velocity ratio ${vr}`, `VTI ${v.vtiA} / ${v.vtiL} cm · ratio ${vr}`, `ratio ${vr}`], 'auto', [...labels, upper]);
  }
  return bx;
}

const psaxOf = (v) => ({ ava: v.ava, thick: v.cusp, calc: v.calc, root: 3.1 });

/** LV mass index (g/m²) from the walls and the diastolic diameter (linear method). */
const lvmiOf = (v) => (0.8 * 1.04 * ((v.wall * 2 + v.lvidd) ** 3 - v.lvidd ** 3) + 0.6) / BSA;

function meterItems(v) {
  const lvmi = lvmiOf(v);
  return [
    { k: 'Aortic valve area', v: v.ava, u: 'cm²', d: 2, lo: 0.4, hi: 3.6, cuts: [[1.0, '1.0'], [1.5, '1.5']], bad: v.ava < 1.0 },
    { k: 'Peak velocity', v: v.vmax, u: 'm/s', d: 1, lo: 1, hi: 6, cuts: [[2.6, '2.6'], [3, '3'], [4, '4'], [5, '5']], bad: v.vmax >= 4 },
    { k: 'Mean gradient', v: v.mg, u: 'mmHg', lo: 0, hi: 80, cuts: [[20, '20'], [40, '40'], [60, '60']], bad: v.mg >= 40 },
    { k: 'Velocity ratio', v: v.vr, u: '', d: 2, lo: 0, hi: 1, cuts: [[0.25, '0.25'], [0.5, '0.50']], bad: v.vr < 0.25 },
    { k: 'Stroke volume index', v: v.svi, u: 'mL/m²', lo: 15, hi: 50, norm: [35, 50], cuts: [[35, '35']], bad: v.svi < 35 },
    { k: 'LVEF', v: v.ef, u: '%', lo: 20, hi: 75, norm: [52, 72], cuts: [[50, '50']], bad: v.ef < 50 },
    { k: 'Septal thickness', v: v.wall, u: 'cm', d: 1, lo: 0.6, hi: 1.7, norm: [0.6, 1.0], cuts: [[1.0, '1.0']], bad: v.wall > 1.0 },
    { k: 'LV mass index', v: lvmi, u: 'g/m²', lo: 50, hi: 180, norm: [49, 115], cuts: [[115, '115']], bad: lvmi > 115 },
    { k: 'Average E/e′', v: v.ee, u: '', lo: 4, hi: 22, cuts: [[14, '14']], bad: v.ee >= 14 },
    { k: 'LA volume index', v: v.lavi, u: 'mL/m²', lo: 10, hi: 70, norm: [16, 34], cuts: [[34, '34']], bad: v.lavi > 34 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(st.asCine, 220);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a5c(ctx, a, v, tt);
    const [p1, p2] = rows(b, [1.2, 1], 8);
    cursor(ctx, avCW(ctx, p1, v), beat.sweep);
    drawPSAXav(ctx, p2, psaxOf(v), { t: tt, title: 'PSAX · AV' });
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a5c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [p1, p2] = rows(colR, [1, 1.1], 10);
  cursor(ctx, avCW(ctx, p1, v), beat.sweep);
  drawPSAXav(ctx, p2, psaxOf(v), { t: tt, title: fit(p2.w, `PSAX · AORTIC VALVE · AVA ${v.ava.toFixed(2)} cm²`, `PSAX · AVA ${v.ava.toFixed(2)} cm²`) });
}

// ---------------------------------------------------------------- the calculations in the text
// From the six measurements (▲▼) through the formulas to each criterion's grade band
// (Baumgartner 2017 Table 3) and to the result. Each change flashes where it acts.
const NAME = {
  lvotD: 'LVOT diameter', vtiL: 'LVOT VTI', vL: 'LVOT peak velocity', vmax: 'AV peak velocity', vtiA: 'AV VTI', ef: 'LVEF',
  csa: 'LVOT area', sv: 'Stroke volume', svi: 'Stroke volume index', ava: 'AVA', avai: 'AVA index', dvi: 'Dimensionless index (DVI)', vr: 'Velocity ratio', pg: 'Peak gradient', mg: 'Mean gradient',
};
const UNIT = { lvotD: 'cm', vtiL: 'cm', vL: 'm/s', vmax: 'm/s', vtiA: 'cm', ef: '%', csa: 'cm²', sv: 'mL', svi: 'mL/m²', ava: 'cm²', avai: 'cm²/m²', pg: 'mmHg', mg: 'mmHg' };
const ARIA = { lvotD: 'LVOT diameter', vtiL: 'LVOT velocity-time integral', vL: 'LVOT peak velocity', vmax: 'aortic valve peak velocity', vtiA: 'aortic valve velocity-time integral', ef: 'LVEF' };
/** The names in the change line: the cause, and its effects. */
const EFFECT = { csa: 'LVOT area', sv: 'stroke volume', svi: 'SVi', ava: 'AVA', avai: 'AVA index', dvi: 'DVI', vr: 'velocity ratio', pg: 'peak gradient', mg: 'mean gradient' };
/** What each measurement changes, first the values that grade the valve. */
const EFFECTS = { lvotD: ['ava', 'svi', 'csa'], vtiL: ['ava', 'dvi', 'svi'], vL: ['vr'], vmax: ['mg', 'pg', 'vr'], vtiA: ['ava', 'dvi', 'mg'], ef: [] };
/** Each formula, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  csa: ['π × (LVOT diameter ÷ 2)²', ['π × (', { k: 'lvotD' }, ' ÷ 2)²']],
  sv: ['LVOT area × LVOT VTI', [{ k: 'csa' }, ' × ', { k: 'vtiL' }]],
  svi: ['stroke volume ÷ BSA', [{ k: 'sv' }, ` ÷ ${BSA.toFixed(2)}`]],
  ava: ['LVOT area × LVOT VTI ÷ AV VTI', [{ k: 'csa' }, ' × ', { k: 'vtiL' }, ' ÷ ', { k: 'vtiA' }]],
  avai: ['AVA ÷ BSA', [{ k: 'ava' }, ` ÷ ${BSA.toFixed(2)}`]],
  dvi: ['LVOT VTI ÷ AV VTI', [{ k: 'vtiL' }, ' ÷ ', { k: 'vtiA' }]],
  vr: ['LVOT peak velocity ÷ AV peak velocity', [{ k: 'vL' }, ' ÷ ', { k: 'vmax' }]],
  pg: ['4 × (AV peak velocity)²', ['4 × ', { k: 'vmax' }, '²']],
  mg: ['mean of 4v² over the AV envelope', ['4 × ', { k: 'vmax' }, '² × ', { k: 'f2' }]],
};
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { lvotD: 3, vtiL: 2, vL: 4, vmax: 3, vtiA: 3, csa: 4, sv: 3, ava: 4, f2: 4 };
/** The grade bands of a row: its criterion in AS_BANDS (the dimensionless index takes the velocity ratio's). */
const CRIT = { svi: 'svi', ava: 'ava', avai: 'avai', dvi: 'vr', vr: 'vr', vmax: 'vmax', mg: 'mg' };
const BAND_LEVEL = { sclerosis: 0, mild: 1, moderate: 2, severe: 3, 'very severe': 4, 'normal flow': 0, 'low flow': 3 };
const STEPS = [
  ['flow', 'Flow', 'Stroke volume', ['csa', 'sv', 'svi']],
  ['area', 'Valve area', 'Continuity equation', ['ava', 'avai', 'dvi', 'vr']],
  ['grad', 'Gradients', 'Simplified Bernoulli equation', ['vmax', 'pg', 'mg']],
];
const MARKS = [['high', 'High gradient', 'Vmax ≥4.0 m/s or mean ≥40 mmHg'], ['area', 'AVA <1.0 cm²', ''], ['ef', 'LVEF <50%', ''], ['flow', 'Low flow', 'SVi <35 mL/m²']];
const BRANCH = [
  ['high', 'High gradient', [['severe', 'severe'], ['very severe', 'very severe'], ['ef50', 'LV dysfunction', 'LVEF <50%']]],
  ['lg', 'AVA <1.0 cm², low gradient', [['classical LF-LG', 'classical', 'LVEF <50%'], ['paradoxical LF-LG', 'paradoxical', 'SVi <35'], ['NF-LG', 'normal flow', 'SVi ≥35']]],
  ['ok', 'AVA ≥1.0 cm², low gradient', [['none', 'none'], ['mild', 'mild'], ['moderate', 'moderate']]],
];
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const MG_NOTE = 'The mean gradient is the mean of 4v² over the AV envelope, not 4 × (mean velocity)². The last factor is the mean of (v ÷ Vmax)² over an envelope with the measured Vmax and VTI.';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (k === 'f2' ? x.toFixed(2) : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** The grade band of each graded row, as an index into its list. */
const bandsOf = (v) => Object.fromEntries(Object.entries(CRIT).map(([k, c]) => [k, AS_BANDS[c].findIndex(([, , test]) => test(v[k]))]));
/** The result chips that light: the result's own; with LV dysfunction, the gradient's grade and the LV dysfunction chip. */
const litOf = (v) => (v.grade === 'severe, LV dysfunction' ? [v.crit.vhigh ? 'very severe' : 'severe', 'ef50'] : [v.grade]);
const branchOf = (v) => (v.crit.high ? 'high' : v.crit.area ? 'lg' : 'ok');

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${btn(k, -1)}<span class="ase-v"><b></b><small>${UNIT[k]}</small></span>${btn(k, 1)}</span>
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k]}ch"></i>`)).join('');
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${AS_BANDS[CRIT[k]].map(([g, lab], i) => `<span class="asx-c" data-i="${i}" data-l="${BAND_LEVEL[g]}">${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b>${UNIT[k] ? `<small>${UNIT[k]}</small>` : ''}</span>${CRIT[k] ? '<span class="asx-st"></span>' : ''}</p>
      ${FORMULA[k] ? `<p class="asx-f"><span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span></p>` : ''}
      ${CRIT[k] ? chips(k) : ''}
    </div>`;
  const step = ([s, name, law, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">${law}<span class="cite" data-ref="baumgartner2017"></span></span><a class="asx-go" href="#pressure" data-go="pressure" aria-label="${law}: chapter 04, Pressure">04 Pressure →</a></p>
      ${keys.map(eq).join('')}${s === 'grad' ? `<p class="ase-note asx-note">${MG_NOTE}</p>` : ''}
    </div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Calculations and grades</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    <div class="ase-step is-on asx-step" data-s="in">
      <p class="ase-sh"><span class="ase-sn">Measurements</span></p>
      ${IN.map(input).join('')}
    </div>
    ${STEPS.map(step).join('')}
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">Table 3 and the integrated approach<span class="cite" data-ref="baumgartner2017,otto2020"></span></span></p>
      ${MARKS.map(([k, name, rule]) => `<p class="asx-q" data-q="${k}"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">${name}</span>${rule ? `<span class="asx-qr">${rule}</span>` : ''}<span class="asx-qs"></span></p>`).join('')}
      ${BRANCH.map(([b, name, outs]) => `<div class="asx-br" data-b="${b}"><p class="asx-bl">${name}</p><p class="asx-os">${outs.map(([o, lab, sub]) => `<span class="ase-o" data-o="${o}"${SEVERE.has(o) || o === 'ef50' ? ' data-sev' : ''}>${lab}${sub ? ` <small>${sub}</small>` : ''}</span>`).join('')}</p></div>`).join('')}
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    marks: Object.fromEntries([...host.querySelectorAll('.asx-q')].map((el) => [el.dataset.q, { el, st: el.querySelector('.asx-qs') }])),
    br: Object.fromEntries([...host.querySelectorAll('.asx-br')].map((el) => [el.dataset.b, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** One step up or down from x, on the step's grid, within the limits. */
function stepOf(x, I, dir) {
  const n = dir > 0 ? Math.floor(x / I.step + 1e-6) + 1 : Math.ceil(x / I.step - 1e-6) - 1;
  return round(clamp(n * I.step, I.min, I.max), I.d);
}

/** The keys of ax that differ from the model's values where the edits started. */
function editedOf(ax) {
  const m = measure(modelAt(ax.base));
  return IN.filter((k) => Math.abs(ax[k] - m[k]) > 1e-9);
}

const freeLive = () => { const live = document.querySelector('#ch-as .live'); if (live?.style.minHeight) live.style.minHeight = ''; };
/** The box that scrolls the text: the panel beside the figure, or the page on a phone. */
const scroller = (el) => { const p = el.closest('.panel'); return p && p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== 'visible' ? p : null; };

/**
 * Keep a clicked button under the pointer while the text above it changes: the live sentence
 * keeps its height until the values follow the slider again, and growth above the button
 * scrolls away.
 */
function steady(btn, fn) {
  const live = document.querySelector('#ch-as .live');
  if (live) live.style.minHeight = `${Math.max(live.offsetHeight, parseFloat(live.style.minHeight) || 0)}px`;
  const y0 = btn?.getBoundingClientRect().top;
  fn();
  if (!btn || !btn.isConnected) return;
  const dy = btn.getBoundingClientRect().top - y0;
  if (Math.abs(dy) < 0.5) return;
  const p = scroller(btn);
  if (p) p.scrollTop += dy; else window.scrollBy(0, dy);
}

/** A ▲▼ click: the edited values and the slider at their result, in one patch; Play and the tour stop. */
function edit(k, dir, btn = null) {
  const s = st, I = INPUTS[k];
  const base = s.ax ? s.ax.base : s[KEY];
  const cur = shown(s);
  const vals = Object.fromEntries(IN.map((q) => [q, cur[q]]));
  const from = vals[k], to = stepOf(from, I, dir);
  if (to === from) return;
  vals[k] = to;
  const next = shownOf({ ax: { ...vals, base } });
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf({ ...vals, base }).length) setState({ ax: null, [KEY]: base, anim: false, playing: false });   // back at the model's values
    else setState({ ax: Object.freeze({ ...vals, base }), [KEY]: slideTo(s[KEY], next.grade), anim: false, playing: false });
  });
  pending = null;
  if (next.grade !== cur.grade) cue('bell');
}

function resetEdits() {
  pending = { kind: 'reset' };
  setState({ ax: null, anim: false, playing: false });
  pending = null;
  dg?.result.focus({ preventScroll: true });
}

const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

/** The diagram at the values on screen: numbers, grades, the result; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const M = { ax: !!s.ax, v, out: v.grade, ed: s.ax ? editedOf(s.ax) : [], bands: bandsOf(v), lit: litOf(v), br: branchOf(v) };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  // the measurements and their buttons
  for (const k of IN) {
    const R = dg.rows[k], I = INPUTS[k];
    txt(R.v, num(k, v[k]));
    R.el.classList.toggle('is-ed', M.ed.includes(k));
    for (const [b, off, other] of [[R.dn, v[k] <= I.min + 1e-9, R.up], [R.up, v[k] >= I.max - 1e-9, R.dn]]) {
      if (off && document.activeElement === b) other.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  // the calculations, the numbers in their formulas, and their grade bands
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (!E.st) continue;
    const i = M.bands[k], g = AS_BANDS[CRIT[k]][i][0];
    E.cs.forEach((c, j) => c.classList.toggle('is-on', j === i));
    txt(E.st, g);
    E.el.dataset.l = BAND_LEVEL[g];
  }
  // the result
  for (const [q, R] of Object.entries(dg.marks)) {
    R.el.classList.toggle('is-on', v.crit[q]);
    txt(R.st, v.crit[q] ? 'yes' : 'no');
  }
  for (const [b, el] of Object.entries(dg.br)) el.classList.toggle('is-on', b === M.br);
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', M.lit.includes(o));
  const [head, sub] = M.out === 'severe, LV dysfunction' && v.crit.vhigh ? ['Very severe stenosis', HEAD[M.out][1]] : HEAD[M.out];
  txt(dg.head, head);
  txt(dg.sub, sub);
  dg.result.classList.toggle('is-raised', SEVERE.has(M.out));
  dg.reset.classList.toggle('is-off', !M.ax);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.ax && !pending) freeLive();
  // the slider's label: main.js writes it when asS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="asS"]');
  if (o) txt(o, asPage.format.asS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || P.out !== M.out || P.ax !== M.ax;
  if (!moved) return;
  const cause = pending || { kind: 'slider' };
  // a screen reader reads the line after an edit or Reset, not at each step of Play
  dg.change.setAttribute('aria-live', cause.kind === 'slider' ? 'off' : 'polite');
  const line = changeLine(P, M, cause);
  const now = performance.now();
  if (cause.kind !== 'slider' || line.crossed) {
    txt(dg.change, line.text);
    lineKind = cause.kind;
    if (cause.kind === 'slider') lastCross = now;
  } else if (lineKind !== 'slider' || now - lastCross > HOLD) {
    txt(dg.change, line.text);
    lineKind = 'slider-quiet';
  }
  flashChanges(P, M, cause);
}

/** The criteria whose grade band a change crossed, each named by its new band as Table 3 prints it. */
const CROSS = { ava: 'AVA', vmax: 'Vmax', mg: 'mean gradient', svi: 'SVi' };
function crossed(P, M) {
  const out = Object.keys(CROSS).filter((k) => P.bands[k] !== M.bands[k]).map((k) => withUnit(k, `${CROSS[k]} ${AS_BANDS[CRIT[k]][M.bands[k]][1]}`));
  if (P.v.crit.ef !== M.v.crit.ef) out.push(M.v.crit.ef ? 'LVEF <50%' : 'LVEF ≥50%');
  return out;
}

/** The cause and effect of a change, as one line. crossed: a cut-off or the result changed. */
function changeLine(P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}` : cause.kind === 'reset' ? 'Reset' : 'Severity';
  const cut = crossed(P, M);
  let what;
  if (cause.kind === 'edit' && cause.k === 'ef') what = cut.length ? cut.join(', ') : 'no calculation uses the LVEF';
  else if (cause.kind === 'edit') {
    // an edit names two values it changed: first those that crossed into another grade band
    const ks = EFFECTS[cause.k], moved = (k) => (CRIT[k] && P.bands[k] !== M.bands[k] ? 0 : 1);
    const ch = ks.filter((k) => P.v[k] !== M.v[k]).sort((a, b) => moved(a) - moved(b)).slice(0, 2);
    what = ch.length ? ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${num(k, P.v[k])} → ${num(k, M.v[k])}`)}`).join(', ') : `${EFFECT[ks[0]]} unchanged at ${withUnit(ks[0], num(ks[0], M.v[ks[0]]))}`;
  } else what = [...(P.ax && !M.ax ? ['edits cleared'] : []), ...cut].join(', ') || 'no cut-off crossed';
  const result = P.out === M.out ? `Result unchanged: ${M.out}` : `Result: ${P.out} → ${M.out}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

const FLASH = 1200;
const timers = new WeakMap();
/** A short flash on an element (none with reduced motion): the class goes after 1.4 s. */
function flash(el, cls = 'is-flash') {
  if (!el || reducedMotion) return;
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the animation
  el.classList.add(cls);
  const all = timers.get(el) || {};
  clearTimeout(all[cls]);
  all[cls] = setTimeout(() => el.classList.remove(cls), FLASH + 200);
  timers.set(el, all);
}

function flashChanges(P, M, cause) {
  for (const [k, E] of Object.entries(dg.eqs)) if (E.chips && P.bands[k] !== M.bands[k]) flash(E.chips);
  for (const [q, R] of Object.entries(dg.marks)) if (P.v.crit[q] !== M.v.crit[q]) flash(R.el);
  if (P.br !== M.br) flash(dg.br[M.br]);
  if (P.out !== M.out) { for (const o of M.lit) flash(dg.out[o]); flash(dg.result); }
  // an edit: the numbers it changed pulse, so each calculation shows that it follows its inputs
  if (cause.kind === 'edit') {
    flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (P.v[k] !== M.v[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (P.v[el.dataset.x] !== M.v[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentence: the result in bold, then its numbers and what defines it. */
function liveOf(v, s, cite) {
  const g = v.grade, B = cite('baumgartner2017'), O = cite('otto2020');
  const nums = `The AVA by the continuity equation is ${fmt(v.ava, 2)} cm², the peak velocity is ${fmt(v.vmax, 1)} m/s and the mean gradient is ${fmt(v.mg)} mmHg${B}.`;
  const lv = ` The LV wall thickens in response to the pressure load (septum ${fmt(v.wall, 1)} cm, LV mass index ${fmt(lvmiOf(v))} g/m²)${O}. The average E/e′ is ${fmt(v.ee)}.`;
  const why = {
    none: ` Table 3 grades a peak velocity of 2.5 m/s or less as aortic sclerosis, without stenosis${B}.`,
    mild: '',
    moderate: '',
    severe: lv,
    'very severe': ` A peak velocity ≥5 m/s or a mean gradient ≥60 mmHg defines very severe stenosis${O}.${lv}`,
    'severe, LV dysfunction': ` The LVEF is ${fmt(v.ef)}%. LV dysfunction in severe stenosis is defined by an LVEF below 50%${O}.`,
    'NF-LG': ` The AVA is below 1.0 cm², but the gradient is low at a normal flow (stroke volume index ${fmt(v.svi)} mL/m²). This pattern often reflects an error of measurement, most often an LVOT diameter that is measured too small${B}.`,
    'paradoxical LF-LG': ` The LVEF is ${fmt(v.ef)}%, and the stroke volume index of ${fmt(v.svi)} mL/m² indicates low flow${B}. Stage D3 also requires symptoms${O}.`,
    'classical LF-LG': ` <span class="k-red">The LVEF is ${fmt(v.ef)}% and the stroke volume index is ${fmt(v.svi)} mL/m². The gradient is low although the valve area is small.</span> Low-dose dobutamine echocardiography distinguishes true severe stenosis from pseudo-severe stenosis${B}. Stage D2 also requires symptoms and severe stenosis confirmed by dobutamine echocardiography${O}.`,
  }[g];
  const ed = s.ax ? editedOf(s.ax) : [];
  const lead = g === 'severe, LV dysfunction' && v.crit.vhigh ? 'Very severe aortic stenosis with LV dysfunction' : LEAD[g];
  return `<b>${lead}.</b> ${nums}${why}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const asPage = {
  key: 'as',
  part: 'valves',
  title: 'Aortic stenosis',
  nav: 'AS',
  dwell: 18,
  defaults: { asS: 0.62, asCine: true, ax: null },
  format: { asS: (x, s) => (s?.ax ? shown(s).grade : gradeOf(x)) },
  watch: ['asS', 'asCine', 'ax'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = bands((x) => gradeOf(x));
    paintBands(document.getElementById('as-grades'), BANDS, LEV, SHORT);
    buildDiagram(document.getElementById('as-calc'));
    // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
    // listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (s.ax && !('ax' in ch) && (KEY in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ ax: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); },
  leave() { fresh = true; freeLive(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.asCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ asS: 0, asCine: true, ax: null }); },
  tourTick(tt, set) { set({ asS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.asS * 15; },
  text(s, { cite }) {
    const v = shown(s);
    return {
      readouts: [
        { k: 'AVA (continuity)', v: fmt(v.ava, 2), u: 'cm²', flag: v.crit.area },
        { k: 'Peak velocity', v: fmt(v.vmax, 1), u: 'm/s', flag: v.vmax >= 4 },
        { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: v.mg >= 40 },
        { k: 'Stroke volume index', v: fmt(v.svi), u: 'mL/m²', flag: v.crit.flow },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.crit.ef },
        { k: 'Result', v: v.grade, text: true, flag: SEVERE.has(v.grade) },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default asPage;
