// Tricuspid regurgitation: one slider from no leak to torrential TR. The orifice widens; the vena
// contracta, the jet and the flow convergence grow, and the right heart and the veins follow. The
// peak velocity rises with the RV pressure to severe TR and falls as the RV and RA pressures
// approach each other. The text holds the calculations as a diagram (Zoghbi 2017 Figure 31; beyond
// severe, Lancellotti 2022 Table 16), with ▲▼ buttons on fifteen measurements and switches for the
// leaflets and the contour of the CW jet. The PISA method gives the EROA (flow ÷ peak velocity) and
// the regurgitant volume (EROA × VTI); the IVC gives the RA pressure, and with the peak velocity
// the RV systolic pressure. An edit stores the measurements in trx; the slider then marks a band
// of their result and does not change them. A move of the slider, Play, the tour or a heart's
// preset clears trx, and the values follow the slider again.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV, mitralV, cycleAt } from '../cyclemodel.js';
import { TR_MILD, TR_SEVERE, TR_QUANT_LABEL, trIntegrated, rapEstimate, trvGrade } from '../norms.js';
import { mono, tracks, lazyBands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit, waveLetter } from '../sev.js';
import { drawA4C, drawIVC, drawPSAXpm, cal, measures, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { rvGrowOf, raWeight, sepOf } from '../meshcal.js';
import { onPlane, hingesOf, closureOf, blood, cavity, area, middle, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';
import { numOf } from '../order.js';
import { JETS } from '../jets.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-tr .live', btn, fn);
/** The slider for result g (edits.js): where it is if that is in a band of g, else the middle of the nearest band of g. */
const slideTo = (x, g) => slideOf(x, g, BANDS);

const KEY = 'trS';
const EDITS = 'trx';
const VA = 28;             // cm/s, the aliasing velocity for PISA: a baseline shift to 28 cm/s (ASE 2017 Table 14)
const NYQ = 60;            // cm/s, the scanner format's scale for the jet (ASE 2017: 50-70)
const DUR = EV.mvo + 10 - EV.mvc;   // ms, the jet: tricuspid closure to tricuspid opening

// The model's tracks over the slider s. The EROA (cm²) follows the slider to 0.80 and rises faster
// after it, so the vena contracta (cm, at one decimal) and the EROA cross their cut-offs together at
// 0.2, 0.4, 0.6 and 0.8 (Table 14; Table 16), and the jet (% of the RA) crosses 20% and 50% with
// them. The peak velocity (m/s) rises with the RV pressure to 3.2 in severe TR and falls below 2 in
// torrential TR, and the CW contour turns triangular. The regurgitant volume is the EROA × the VTI
// of that envelope: it reaches 45 mL with an EROA of 0.40 cm², and lags the EROA beyond severe TR,
// where the jet is slow and its VTI short.
const eroaOf = mono([[0, 0], [0.2, 0.2], [0.4, 0.4], [0.6, 0.6], [0.8, 0.8], [0.9, 0.98], [1, 1.2]]);
const vOf = mono([[0, 2.3], [0.1, 2.4], [0.2, 2.6], [0.3, 2.9], [0.4, 3.2], [0.52, 3.2], [0.6, 3.0], [0.7, 2.6], [0.8, 2.2], [0.9, 1.95], [1, 1.8]]);
const triOf = mono([[0, 0], [0.48, 0], [0.56, 0.3], [0.64, 0.75], [0.7, 1], [1, 1]]);
const vcOf = mono([[0, 0], [0.2, 0.25], [0.4, 0.65], [0.6, 1.35], [0.8, 2.05], [1, 2.6]]);
const jetOf = mono([[0, 0], [0.2, 19.5], [0.4, 50.5], [0.6, 58], [0.8, 66], [1, 74]]);
// the veins, the inflow and the right heart. Hepatic vein S and D are forward flow (m/s): S is
// dominant to s 0.2, blunted after it, and reversed from s 0.5. The RV basal diameter (cm) passes
// 4.1 at s 0.33, the RA volume index (mL/m²) 30 at s 0.2, and the annulus (cm) 4.0 at s 0.4.
const TRK = tracks([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1], {
  hvS: [0.5, 0.45, 0.4, 0.25, 0.12, -0.02, -0.15, -0.35, -0.45],
  hvD: [0.3, 0.32, 0.35, 0.4, 0.45, 0.5, 0.52, 0.55, 0.55],
  E: [0.45, 0.5, 0.65, 0.85, 1.05, 1.1, 1.15, 1.25, 1.3],
  A: [0.55, 0.55, 0.5, 0.45, 0.4, 0.38, 0.35, 0.3, 0.3],
  rvb: [3.4, 3.5, 3.7, 3.95, 4.3, 4.55, 4.8, 5.2, 5.5],
  ravi: [22, 25, 29, 33, 38, 43, 48, 58, 66],
  ta: [2.9, 3.1, 3.4, 3.7, 4.0, 4.2, 4.4, 4.8, 5.1],
  tapse: [23, 23, 24, 24, 23, 22, 21, 18, 15],
  ivc: [1.6, 1.7, 1.8, 2.0, 2.3, 2.45, 2.6, 2.9, 3.1],
  coll: [60, 58, 55, 45, 35, 28, 20, 10, 5],
  gap: [0, 0, 0.05, 0.15, 0.3, 0.45, 0.6, 0.9, 1.1],
  ei: [1.0, 1.02, 1.05, 1.1, 1.15, 1.22, 1.3, 1.45, 1.55],
  rvL: [7.0, 7.05, 7.1, 7.25, 7.4, 7.6, 7.8, 8.1, 8.4],
});

// ---------------------------------------------------------------- the CW envelope
// The jet over systole: v = Vmax × g(w)^p, w from 0 to 1. g is round, and triangular with an early
// peak when the RA pressure wave rises (tri). The power p fits the envelope to the VTI: VTI = 100
// × Vmax × duration × mean(g^p); the model's own envelope has p = 1. The fullest and the most
// peaked envelopes (P_LO, P_HI) limit the VTI at a peak velocity, and the peak velocity at a VTI.
const P_LO = 0.25, P_HI = 24;
const q2 = (v) => Math.round(v * 50) / 50;
function shapeOf(tri) {
  return (u) => {
    if (u <= 0 || u >= 1) return 0;
    const rnd = Math.pow(Math.sin(Math.PI * u), 0.4);
    const pk = 0.3;
    const tr = u < pk ? Math.pow(u / pk, 0.5) : Math.pow((1 - u) / (1 - pk), 1.1);
    return rnd * (1 - tri) + tr * tri;
  };
}
const memo = new Map();
/** The mean of g^p over the jet (cached: the limits and the fit ask often). */
function envMean(tri, p) {
  const key = `${tri}|${p.toFixed(5)}`;
  let m = memo.get(key);
  if (m === undefined) {
    const g = shapeOf(tri);
    m = 0;
    for (let i = 0; i < 240; i++) m += Math.pow(g((i + 0.5) / 240), p);
    m /= 240;
    if (memo.size > 4000) memo.clear();
    memo.set(key, m);
  }
  return m;
}
/** The p for which the mean of g^p is f, within P_LO to P_HI. */
function fitP(tri, f) {
  if (f >= envMean(tri, P_LO)) return P_LO;
  if (f <= envMean(tri, P_HI)) return P_HI;
  let lo = Math.log(P_LO), hi = Math.log(P_HI);
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (envMean(tri, Math.exp(m)) > f) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

// ---------------------------------------------------------------- the model
/** The leaflets and the CW contour of the model: no coaptation from a gap of 0.3 cm; triangular from tri 0.5. */
const leafOf = (gap) => (gap >= 0.3 - 1e-9 ? 'gap' : 'coapt');
const cwOf = (tri) => (tri >= 0.5 ? 'triangular' : 'parabolic');

/** The model at slider position s: its measurements before rounding, and the rest of the heart. */
function modelAt(s) {
  const m = TRK(s);
  m.s = s;
  const eroa = round(eroaOf(s), 2), vmax = round(vOf(s), 1);
  m.vmax = vOf(s);
  m.tri = triOf(s);
  // the PISA radius that gives the model's EROA at the peak velocity as printed
  m.r = Math.sqrt((eroa * vmax * 100) / (2 * Math.PI * VA));
  // the VTI of the model's own envelope (p = 1)
  m.vti = 100 * vmax * (DUR / 1000) * envMean(q2(m.tri), 1);
  m.vc = vcOf(s);
  m.jet = jetOf(s);
  m.leaf = leafOf(m.gap);
  m.cw = cwOf(m.tri);
  return m;
}

/** The fifteen measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  vc: { d: 1, step: 0.1, min: 0, max: 2.8 },
  jet: { d: 0, step: 5, min: 0, max: 90 },
  r: { d: 2, step: 0.05, min: 0, max: 1.5 },
  vmax: { d: 1, step: 0.1, min: 1, max: 5 },
  vti: { d: 0, step: 5, min: 20, max: 160 },
  E: { d: 2, step: 0.05, min: 0.2, max: 1.6 },
  A: { d: 2, step: 0.05, min: 0.2, max: 1.2 },
  hvS: { d: 2, step: 0.05, min: -0.6, max: 0.8 },
  hvD: { d: 2, step: 0.05, min: 0.1, max: 0.8 },
  ta: { d: 1, step: 0.1, min: 2.5, max: 6 },
  rvb: { d: 1, step: 0.1, min: 2.5, max: 6.5 },
  ravi: { d: 0, step: 2, min: 10, max: 100 },
  tapse: { d: 0, step: 1, min: 5, max: 30 },
  ivc: { d: 1, step: 0.1, min: 1, max: 3.5 },
  coll: { d: 0, step: 5, min: 0, max: 100 },
};
const IN = Object.keys(INPUTS);
/** The switches: their values, in order. */
const SWITCH = { leaf: ['coapt', 'gap', 'flail'], cw: ['parabolic', 'triangular'] };
const SW = Object.keys(SWITCH);
const DEC = { flow: 0, eroa: 2, rvol: 0, grad: 0, rap: 0, rvsp: 0, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };

/**
 * The limits of measurement k at the values v. The jet lasts from tricuspid closure to tricuspid
 * opening, so its VTI lies between those of the most peaked and the fullest envelope at its peak
 * velocity, and the peak velocity follows from the VTI the same way.
 */
function limits(k, v) {
  const I = INPUTS[k];
  if (k !== 'vti' && k !== 'vmax') return I;
  const T = DUR / 1000, tri = q2(v.triD), full = envMean(tri, P_LO), peak = envMean(tri, P_HI);
  const up = (x, st) => Math.ceil(x / st - 1e-9) * st, down = (x, st) => Math.floor(x / st + 1e-9) * st;
  if (k === 'vti') return { ...I, min: Math.max(I.min, up(100 * v.vmax * T * peak, I.step)), max: Math.min(I.max, down(100 * v.vmax * T * full, I.step)) };
  return { ...I, min: Math.max(I.min, round(up(v.vti / (100 * T * full), I.step), 1)), max: Math.min(I.max, round(down(v.vti / (100 * T * peak), I.step), 1)) };
}

/**
 * Values as reported: the measurements at their decimals, and each calculation from the
 * rounded values before it, so that the numbers in a formula give its result. The grade reads
 * these numbers, so a value on screen never contradicts its grade.
 */
function measure(raw) {
  const v = { ...raw };
  for (const k of IN) v[k] = round(raw[k], INPUTS[k].d);
  v.flow = round(2 * Math.PI * v.r ** 2 * VA, 0);
  v.eroa = round(v.flow / (100 * v.vmax), 2);
  v.rvol = round(v.eroa * v.vti, 0);
  v.grad = round(4 * v.vmax ** 2, 0);
  v.ra = rapEstimate({ d: v.ivc, col: v.coll, mode: 'sniff', sec: 'unclear' });
  v.rap = v.ra.rap;
  v.rvsp = v.grad + v.rap;
  // the drawn contour: the model's while the switch shows the model's contour, else the switch's
  v.triD = v.cw === cwOf(raw.tri) ? raw.tri : v.cw === 'triangular' ? 1 : 0;
  v.p = fitP(q2(v.triD), v.vti / ((v.vmax * DUR) / 10));
  v.leak = v.flow > 0 || v.vc > 0 || v.jet > 0;    // a color signal: flow convergence, vena contracta or jet
  v.crit = trIntegrated(v);
  v.grade = v.crit.grade;
  return v;
}

/** The values on screen, from the store: the edited measurements (trx), or the model's at the slider. */
function shownOf(s) {
  if (!s[EDITS]) return measure(modelAt(s[KEY]));
  const v = modelAt(s[EDITS].base);
  for (const k of [...IN, ...SW]) v[k] = s[EDITS][k];
  return measure(v);
}
let lastEd = null, lastS = null, lastShown = null;
/** shownOf, kept for the last state: the figure asks every frame. */
function shown(s) {
  if (s[EDITS] !== lastEd || (!s[EDITS] && s[KEY] !== lastS) || !lastShown) {
    lastEd = s[EDITS]; lastS = s[KEY];
    lastShown = shownOf(s);
  }
  return lastShown;
}
export const gradeOf = (s) => measure(modelAt(s)).grade;

// the results: the bold lead of the live sentence, and the line under it in the diagram
const LEV = { ...LEVEL, indeterminate: 2 };
const LEAD = {
  none: 'No tricuspid regurgitation', mild: 'Mild tricuspid regurgitation', moderate: 'Moderate tricuspid regurgitation', severe: 'Severe tricuspid regurgitation',
  massive: 'Massive tricuspid regurgitation', torrential: 'Torrential tricuspid regurgitation', indeterminate: 'Tricuspid regurgitation of indeterminate grade',
};
const HEAD = {
  none: 'No regurgitation', mild: 'Mild regurgitation', moderate: 'Moderate regurgitation', severe: 'Severe regurgitation',
  massive: 'Massive regurgitation', torrential: 'Torrential regurgitation', indeterminate: 'Indeterminate grade',
};
const WHY = {
  none: 'no vena contracta, jet or flow convergence', mild: '≥4 specific criteria for mild TR', severe: '≥4 specific criteria for severe TR',
  both: '≥4 specific criteria for mild and for severe TR', q1: 'quantitation: mild', q2: 'quantitation: moderate', q3: 'quantitation: severe',
};
const GNAME = ['', 'mild', 'moderate', 'severe', 'massive', 'torrential'];
const SEVERE = new Set(['severe', 'massive', 'torrential']);
let BANDS = [];

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- the figure
/** Labels the figure adds for a leaflet switch set by hand. */
function tagsOf(v) {
  if (v.leaf === leafOf(v.gap)) return [];
  return [{ coapt: ['leaflets coapt', 'coapt'], gap: ['no coaptation', 'gap'], flail: ['flail leaflet', 'flail'] }[v.leaf]];
}

// The RV-focused four-chamber view and the short axis at the papillary muscles cut from the heart mesh
// (meshpanel.js): the heart the page shows, its RV at the printed RV basal diameter (rvGrow,
// meshcal.js rvGrowOf; the annulus widens with it), its RA at the printed RA volume index
// (raGrow, raWeight), the septum flattened to the printed eccentricity index (sep, sepOf), and
// the jet drawn on it as on the parametric view. The scanner format (jets.js) keeps the
// parametric views.
const redraw = () => { if (sheet) sheet.dirty = true; };
// RV focused (ASE 2015: the RV basal diameter is measured there): in the standard four-chamber
// sector a dilated RV's free wall falls outside the sector from an RV basal diameter of 4.5 cm
const MESH = new MeshPanel('a4c_rv', { diseases: ['rvGrow', 'raGrow'], redraw });
// the short axis with its sector turned toward the RV (views.js psax_pm_rv), so the dilated RV shows whole
const MESH_PM = new MeshPanel('psax_pm_rv', { diseases: ['rvGrow', 'sep'], redraw });

/**
 * The jet on the mesh view at systolic weight s: from where the tricuspid leaflets meet, into the
 * RA, which clips it (its blood reaches up between the shut leaflets); its length and width from
 * the jet area as a share of the RA's area on the plane, as the parametric view sizes them. ax:
 * into the RV, for the PISA radius.
 */
function trJet(ev, v, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  // into the RV: toward the apex (the RV anchor, 1.3 cm off the septum at the LV equator, lies
  // near the annulus in this view)
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle(h);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  const O = closureOf(ev, 'TricuspidValve', M, nrm) || M, side = perp(nrm);
  // leaflets tented into the RV: the RA is cut along them (hinge to where they meet), so that the
  // RV's blood beside them, open to the gap between their tips, is not the RA's; else parallel to
  // the hinge line through where they meet
  const cuts = dot(sub(O, M), nrm) > 0.05 ? [[h[0], O], [O, h[1]]] : [[add(O, side), sub(O, side)]];
  const RA = cavity(ev, blood(ev, onPlane(ev, an.ra)), cuts);
  if (RA.length < 12) return null;
  let lMax = 0, w0 = Infinity, w1 = -Infinity;
  for (const p of RA) {
    lMax = Math.max(lMax, -dot(sub(p, M), nrm));
    const x = dot(sub(p, M), side);
    w0 = Math.min(w0, x);
    w1 = Math.max(w1, x);
  }
  const raArea = area(RA), jA = Math.min((v.jet / 100) * raArea, raArea * 0.8);
  const jl = Math.min(lMax * 0.95, Math.sqrt((jA / 0.55) * 1.2));
  const jw = jl > 0 ? Math.min((w1 - w0) * 0.95, jA / (0.55 * jl)) : 0;
  const ax = nrm;
  // into the RA against the RV's long axis, leaning toward the RA's middle
  const dir = unit(add(mul(ax, -0.8), mul(unit(sub(middle(RA), O)), 0.2)));
  // the flow convergence: in the RV's blood within 65 degrees of the RV's axis from where the
  // leaflets meet (beside the orifice its flow runs along the leaflets, toward the probe on one
  // side, and drew a streak across them)
  const th = (65 * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
  const cone = [[nrm[0] * c - nrm[1] * sn, nrm[0] * sn + nrm[1] * c], [nrm[0] * c + nrm[1] * sn, -nrm[0] * sn + nrm[1] * c]];
  const RV = cavity(ev, blood(ev, add(O, mul(nrm, 0.8)), 0.4), cone.map((u) => [O, add(O, u)]));
  return { O, dir, clip: RA, pclip: RV.length >= 12 ? RV : null, ax, jl, jw };
}

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

/** Where the RV's name goes: its open blood 2.5 cm from the tricuspid annulus into the RV. */
function rvName(ev, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), apex = onPlane(ev, ev.anchors(s).apex);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  return blood(ev, add(M, mul(nrm, 2.5)));
}

function a4c(ctx, box, v, t, mode) {
  const sys = t >= EV.mvc && t <= EV.mvo + 10;
  // the sine at the closing instant can round below zero, and a fractional power of that is NaN
  const a = sys ? Math.pow(Math.max(0, Math.sin(Math.PI * (t - EV.mvc) / (EV.mvo + 10 - EV.mvc))), 0.3) : 0;
  // with no flow convergence the jet is drawn from the flow through its vena contracta
  const q = v.flow > 0 ? v.flow : Math.PI * (Math.max(v.vc, 0.2) / 2) ** 2 * v.vmax * 100;
  const tags = tagsOf(v);
  if (JETS === 'plume') {
    // one view at the aliasing velocity: the flow convergence with its radius, and the jet
    const heart = st.pheno || 'normal';
    MESH.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER, RV FOCUSED · COLOR ${VA} cm/s`, `A4C, RV FOCUSED · COLOR ${VA} cm/s`, `A4C RV · COLOR ${VA}`]), {
      tms: t, disease: { rvGrow: rvGrowOf(heart, v.rvb), raGrow: raWeight(v.ravi, heart) },
      // deeper as the RA grows (its length as the cube root of its volume, 5 cm at 25 mL/m²)
      deeper: Math.max(0, 5 * (Math.cbrt(v.ravi / 25) - 1)),
      names: [['lv', 'LV', 'apex', 0.45], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
      over: (c, F, ev) => {
        if (!v.leak) return;
        const J = trJet(ev, v, cycleAt(t).s);
        if (!J) return;
        jet(c, F, { q, va: VA, vc: v.vc, jl: J.jl, jw: J.jw, a, O: J.O, dir: J.dir, clip: J.clip, pclip: J.pclip });
        barFor(c, F, -VA, VA);
        // the PISA radius from the orifice into the RV
        if (v.r > 0 && a > 0.5) cal(c, F, J.O, add(J.O, mul(J.ax, v.r)), '', { solid: true });
      },
      lines: [`RV base ${v.rvb.toFixed(1)} cm`, [`annulus ${v.ta.toFixed(1)} cm`, `TA ${v.ta.toFixed(1)} cm`], `VC ${v.vc.toFixed(1)} cm`, [`jet ${v.jet}% of RA`, `jet ${v.jet}%`], ...tags],
    });
    return;
  }
  // the scanner format: the parametric view, its chambers from the measurements and its walls
  // from the model
  const raMax = v.ravi * BSA, raMin = raMax * 0.6;
  const dims = (vol, r) => { const L = Math.cbrt(vol / (0.524 * r * r)); return [r * L, L]; };
  const [rwMax, rlMax] = dims(raMax, 0.85 + 0.1 * v.s), [rwMin, rlMin] = dims(raMin, 0.85 + 0.1 * v.s);
  // the coaptation gap drawn: the model's, or one the leaflet switch asks for
  const gap = v.leaf === leafOf(v.gap) ? v.gap : v.leaf === 'coapt' ? Math.min(v.gap, 0.1) : Math.max(v.gap, 0.35);
  const g = {
    lvL: [8.4, 7.2], lvW: [4.6 - 0.3 * v.s, 3.0 - 0.2 * v.s], lvWall: [0.9, 1.35], ivs: [0.9, 1.35],
    rvW: [v.rvb, v.rvb * (0.85 + 0.08 * v.s)], rvWall: 0.4, laW: [3.3, 4.0], laL: [4.1, 4.9], raW: [rwMin, rwMax], raL: [rlMin, rlMax],
    ma: 3.1, ta: v.ta, tv: { gap, thick: 0.1 },
  };
  // the jet: its share of the RA area, at the color scale where the criterion is defined
  const raArea = (Math.PI / 4) * rwMax * rlMax;
  const jA = Math.min((v.jet / 100) * raArea, raArea * 0.8);
  const jl = Math.min(rlMax * 0.95, Math.sqrt((jA / 0.55) * 1.2));
  const jw = jl > 0 ? Math.min(rwMax * 0.95, jA / (0.55 * jl)) : 0;
  // Jet: the standard scale. PISA: zoomed on the valve, the baseline shifted toward the jet
  // (down: TR runs away from the probe) until the flow aliases at VA; variance off. The
  // torrential jet is slow and laminar.
  const pisa = mode === 'pisa';
  drawA4C(ctx, box, g, {
    t, depth: 16 + 1.4 * v.s,
    title: pisa ? fit(box.w, `APICAL FOUR-CHAMBER · ZOOM · Va ${VA} cm/s`, `A4C ZOOM · Va ${VA}`) : fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${NYQ} cm/s`, `A4C · COLOR ${NYQ}`),
    color: {
      roi: pisa ? 'tv' : 'ra', zoom: pisa ? { at: 'tv', span: 7 } : null,
      lo: pisa ? -VA : -NYQ, hi: pisa ? 2 * NYQ - VA : NYQ, variance: !pisa,
      // the hepatic veins: negative is forward flow here
      Et: v.E, At: v.A, hvS: -v.hvS, hvD: -v.hvD,
      tr: v.leak ? { q, u0: v.vmax * 100, vc: v.vc, jl, jw, area: jA, a, lam: v.s > 0.7 ? 1 : 0 } : null,
    },
    after: (c, F, geo) => {
      if (pisa && v.r > 0 && a > 0.85) {
        // the radius along the beam, from the orifice to the first aliasing boundary
        const O = geo.tv.gapMid, l = Math.hypot(O[0], O[1]), r = v.r * Math.sqrt(a);
        cal(c, F, O, [O[0] * (1 - r / l), O[1] * (1 - r / l)], '', { solid: true });
      }
      measures(c, F, pisa
        ? [`PISA r ${v.r.toFixed(2)} cm`, `Va ${VA} cm/s`, [`EROA ${v.eroa.toFixed(2)} cm²`, `EROA ${v.eroa.toFixed(2)}`]]
        : [`RV base ${v.rvb.toFixed(1)} cm`, [`annulus ${v.ta.toFixed(1)} cm`, `TA ${v.ta.toFixed(1)} cm`], `VC ${v.vc.toFixed(1)} cm`, [`jet ${v.jet}% of RA`, `jet ${v.jet}%`], ...tags]);
    },
  });
}

/**
 * CW through the tricuspid valve from the apex: the TR jet away from the probe in systole, its
 * envelope fitted to the VTI; the inflow toward it in diastole, E then A.
 */
function trCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · TRICUSPID REGURGITATION', 'CW · TR'));
  const bx = inner(P);
  const tri = q2(v.triD), dens = q2(clamp(v.rvol / 45, 0.06, 1)), E = q2(v.E), A = q2(v.A);
  const g = shapeOf(tri), p = v.p;
  // the jet below the baseline; above it, room for the inflow and its letters
  const base = 0.3, vs = Math.max(4, Math.ceil(v.vmax + 0.5), Math.ceil(((Math.max(E, A) + 0.25) * (1 - base)) / base));
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const w = (t - EV.mvc) / DUR;
    if (w > 0 && w < 1) return v.leak ? -v.vmax * Math.pow(g(w), p) : 0;
    return mitralV(t - 6, E, A, 200);
  };
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `trcw|${v.leak}|${v.vmax}|${tri}|${p.toFixed(4)}|${E}|${A}|${dens}|${vs}`, seed: 41 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y + base * bx.h, bx.w, bx.h * (1 - base));
    ctx.restore();
  }
  vscale(ctx, bx, vs, base, 1);
  // E and A over the inflow of the first beat
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const top = (y) => Math.max(bx.y + 12, y);
  const letters = [waveLetter(ctx, 'E', X(EV.mvo + 76), top(y0 - E * k - 4)), waveLetter(ctx, 'A', X(815 + 6), top(y0 - A * k - 4))];
  ctx.restore();
  const dn = v.rvol >= 30 ? 'dense' : 'faint';
  const shape = tri > 0.5 ? ', triangular' : '';
  note(ctx, bx, v.leak
    ? [`peak ${v.vmax.toFixed(1)} m/s · VTI ${v.vti} cm · RVSP ${v.rvsp} mmHg · ${dn}${shape}`, `peak ${v.vmax.toFixed(1)} m/s · VTI ${v.vti} cm · ${dn}`, `${v.vmax.toFixed(1)} m/s · VTI ${v.vti} cm`]
    : 'no regurgitation', 'bottom', letters);
  return bx;
}

/** Hepatic vein, PW from below: forward flow runs away from the probe (below the baseline). */
function hvPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · HEPATIC VEIN');
  const bx = inner(P);
  // drawn with forward flow negative, below the baseline
  const S = -q2(v.hvS), D = -q2(v.hvD);
  // forward flow fills the 58% below the baseline, a reversed S the 42% above it
  const base = 0.42, vs = Math.max(0.8, Math.ceil((Math.max(-S, -D) + 0.1) * 10) / 10, Math.ceil(((Math.max(S, 0) + 0.1) * (1 - base) / base) * 10) / 10);
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 70, 400, 230) + D * bump(t, EV.mvo + 10, 720, 540) + 0.18 * bump(tt, 780, 900, 830) + 0.08 * bump(t, 400, 470, 430);
  };
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.14, key: `hv|${S}|${D}|${vs}`, seed: 42 });
  vscale(ctx, bx, vs, base, 0.5, '');
  const y0 = bx.y + base * bx.h, k = (bx.h * (1 - base)) / vs;
  const inside = (y) => Math.min(bx.y + bx.h - 3, Math.max(bx.y + 12, y));
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letters = [
    waveLetter(ctx, 'S', X(230), inside(S <= 0 ? y0 - S * k + 13 : y0 - S * k - 5)),
    waveLetter(ctx, 'D', X(540), inside(y0 - D * k + 13)),
  ];
  ctx.restore();
  note(ctx, bx, v.hvS < 0 ? ['systolic flow reversal', 'S reversed'] : v.hvS < v.hvD ? ['systolic blunting', 'S blunted'] : 'systolic dominance', 'auto', letters);
  return bx;
}

function meterItems(v) {
  return [
    { k: 'EROA', v: v.eroa, u: 'cm²', d: 2, lo: 0, hi: 1.25, cuts: [[0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6'], [0.8, '0.8']], bad: v.eroa >= 0.4 },
    { k: 'Vena contracta', v: v.vc, u: 'cm', d: 1, lo: 0, hi: 2.8, cuts: [[0.7, '0.7'], [1.4, '1.4'], [2.1, '2.1']], bad: v.vc >= 0.7 },
    { k: 'Regurgitant volume', v: v.rvol, u: 'mL', lo: 0, hi: 100, cuts: [[30, '30'], [45, '45'], [60, '60'], [75, '75']], bad: v.rvol >= 45 },
    { k: 'Jet / RA area', v: v.jet, u: '%', lo: 0, hi: 90, cuts: [[20, '20'], [50, '50']], bad: v.jet > 50 },
    { k: 'RV basal diameter', v: v.rvb, u: 'cm', d: 1, lo: 2, hi: 6, norm: [2.5, 4.0], cuts: [[4.1, '4.1']], bad: v.rvb >= 4.1 },
    { k: 'Tricuspid annulus', v: v.ta, u: 'cm', d: 1, lo: 2, hi: 5.5, cuts: [[4.0, '4.0']], bad: v.ta > 4.0 },
    { k: 'RA volume index', v: v.ravi, u: 'mL/m²', lo: 10, hi: 75, norm: [10, 29], cuts: [[30, '30']], bad: v.ravi >= 30 },
    { k: 'IVC diameter', v: v.ivc, u: 'cm', d: 1, lo: 1, hi: 3.5, norm: [1.0, 2.1], cuts: [[2.1, '2.1'], [2.5, '2.5']], bad: v.ivc > 2.5 },
    { k: 'Peak TR velocity', v: v.vmax, u: 'm/s', d: 1, lo: 1, hi: 4, cuts: [[2.0, '2.0'], [2.8, '2.8']], bad: v.vmax < 2.0 && v.eroa >= 0.4 },
    { k: 'TAPSE', v: v.tapse, u: 'mm', lo: 8, hi: 30, norm: [18, 30], cuts: [[17, '17']], bad: v.tapse <= 17 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(st.trCine, 220);
  const mode = st.trColor;
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, v, tt, mode);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [trCW(ctx, p1, v), hvPW(ctx, p2, v)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt, mode);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [p1, p2, p3] = rows(colR, [1.15, 0.9, 1.1], 10);
  const bxs = [trCW(ctx, p1, v), hvPW(ctx, p2, v)];
  const [c1, c2] = cols(p3, [1.3, 1], 10);
  drawIVC(ctx, c1, { d: v.ivc, collapse: v.coll / 100 }, { title: `IVC · M-MODE · RAP ${v.rap} mmHg` });
  if (JETS === 'plume') {
    // the septum flattens most at end-diastole: the eccentricity index there is the printed one,
    // and at end-systole it falls 60% of the way back to 1, as the parametric view draws it
    const heart = st.pheno || 'normal', sy = cycleAt(tt).s;
    const sep = sepOf(heart, v.ei) + (sepOf(heart, 1 + (v.ei - 1) * 0.4) - sepOf(heart, v.ei)) * sy;
    MESH_PM.draw(ctx, c2, `PSAX · EI ${v.ei.toFixed(1)}`, { tms: tt, disease: { rvGrow: rvGrowOf(heart, v.rvb) }, motion: { sep }, names: [['rv', 'RV'], ['lv', 'LV']] });
  } else {
    drawPSAXpm(ctx, c2, { lvid: [4.6 - 0.3 * v.s, 3.0], wall: [0.9, 1.35], ei: [v.ei, 1 + (v.ei - 1) * 0.4], rvw: [v.rvb * 0.84, v.rvb * 0.75] }, { t: tt, title: `PSAX · EI ${v.ei.toFixed(1)}` });
  }
  for (const bx of bxs) cursor(ctx, bx, beat.sweep);
}

// ---------------------------------------------------------------- the calculations in the text
// From the measurements (▲▼) through the pressures and the PISA method to the grades of Table 14
// and Table 16 and the specific criteria of Figure 31, and to the result. Each change flashes
// where it acts.
const NAME = {
  vc: 'Vena contracta', jet: 'Jet area / RA area', r: 'PISA radius', vmax: 'Peak velocity', vti: 'TR VTI', cw: 'CW contour',
  E: 'Tricuspid E', A: 'Tricuspid A', hvS: 'Hepatic vein S', hvD: 'Hepatic vein D',
  leaf: 'Leaflets', ta: 'Tricuspid annulus', rvb: 'RV basal diameter', ravi: 'RA volume index', tapse: 'TAPSE', ivc: 'IVC diameter', coll: 'IVC collapse, sniff',
  grad: 'RV–RA gradient', rap: 'RA pressure', rvsp: 'RV systolic pressure', flow: 'Flow rate', eroa: 'EROA', rvol: 'Regurgitant volume',
};
const UNIT = {
  vc: 'cm', jet: '%', r: 'cm', vmax: 'm/s', vti: 'cm', E: 'm/s', A: 'm/s', hvS: 'm/s', hvD: 'm/s', ta: 'cm', rvb: 'cm', ravi: 'mL/m²', tapse: 'mm', ivc: 'cm', coll: '%',
  grad: 'mmHg', rap: 'mmHg', rvsp: 'mmHg', flow: 'mL/s', eroa: 'cm²', rvol: 'mL',
};
const ARIA = {
  vc: 'vena contracta width', jet: 'jet area as a percentage of the RA area', r: 'PISA radius', vmax: 'peak TR velocity', vti: 'TR velocity-time integral',
  E: 'tricuspid E velocity', A: 'tricuspid A velocity', hvS: 'hepatic vein systolic velocity', hvD: 'hepatic vein diastolic velocity',
  ta: 'tricuspid annulus diameter', rvb: 'RV basal diameter', ravi: 'RA volume index', tapse: 'TAPSE', ivc: 'IVC diameter', coll: 'IVC collapse with a sniff',
};
/** The labels of the switches' buttons. */
const SWITCH_LABEL = { leaf: ['Coapt', 'No coaptation', 'Flail'], cw: ['Parabolic', 'Triangular'] };
/** The measurements in the groups of the diagram: color Doppler, spectral Doppler, 2D and M-mode. */
const GROUPS = [
  ['color', 'Color Doppler', 'jet at 50–70 cm/s; PISA at a baseline shift to 28 cm/s', ['vc', 'jet', 'r']],
  ['spec', 'Spectral Doppler', 'CW through the jet and the inflow; PW in a hepatic vein', ['vmax', 'vti', 'cw', 'E', 'A', 'hvS', 'hvD']],
  ['twod', '2D and M-mode', 'the valve, the right heart and the IVC', ['leaf', 'ta', 'rvb', 'ravi', 'tapse', 'ivc', 'coll']],
];
/** The names in the change line: the cause, and its effects. */
const EFFECT = { flow: 'flow rate', eroa: 'EROA', rvol: 'regurgitant volume', grad: 'RV–RA gradient', rap: 'RA pressure', rvsp: 'RV systolic pressure' };
/** What each measurement changes, first the values that grade the leak. */
const EFFECTS = { r: ['eroa', 'rvol', 'flow'], vmax: ['eroa', 'rvol', 'rvsp', 'grad'], vti: ['rvol'], ivc: ['rap', 'rvsp'], coll: ['rap', 'rvsp'] };
/** Each formula, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  grad: ['4 × peak velocity²', ['4 × ', { k: 'vmax' }, '²']],
  rvsp: ['RV–RA gradient + RA pressure', [{ k: 'grad' }, ' + ', { k: 'rap' }]],
  flow: ['2π × r² × Va', ['2π × ', { k: 'r' }, `² × ${VA}`]],
  eroa: ['flow rate ÷ (100 × peak velocity)', [{ k: 'flow' }, ' ÷ (100 × ', { k: 'vmax' }, ')']],
  rvol: ['EROA × TR VTI', [{ k: 'eroa' }, ' × ', { k: 'vti' }]],
};
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { vmax: 3, grad: 3, rap: 2, r: 4, flow: 3, eroa: 4, vti: 3 };
const QUANT = ['vc', 'eroa', 'rvol'];
/** The colour level of a grade: moderate, then severe and beyond in the flag colour. */
const QLEV = [0, 1, 2, 3, 4, 4];
const OUTS = [
  ['spec', 'Most specific criteria: 4 of 7', [['mild', 'mild'], ['severe', 'severe'], ['both', 'both sets: indeterminate']]],
  ['quant', 'Otherwise probably moderate: quantitation', [['q1', 'mild'], ['q2', 'moderate'], ['q3', 'severe']]],
  ['beyond', 'Severe TR: beyond severe (EACVI)', [['b3', 'severe'], ['b4', 'massive'], ['b5', 'torrential']]],
];
const SEV_OUT = new Set(['severe', 'q3', 'b3', 'b4', 'b5']);
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const CRIT_NOTE = 'Most criteria: the ASE text asks for a majority of the specific signs, so four of the seven. Figure 31 gives no number for five criteria. This site uses a jet below 20% of the RA area; a normal RV basal diameter (<4.1 cm) and RA volume index (<30 mL/m²) and a TAPSE >17 mm for preserved RV function<span class="cite" data-ref="mukherjee2025"></span>; an annulus >4.0 cm as dilated<span class="cite" data-ref="otto2020"></span>; and a CW jet that the figure draws faint, at a regurgitant volume below 30 mL. Figure 31 gives the PISA radius at a Nyquist limit of 30–40 cm/s (mild <0.4 cm); the page measures it at a baseline shift to 28 cm/s, where Table 14 gives ≤0.5 cm and >0.9 cm<span class="cite" data-ref="zoghbi2017"></span>.';
const QUANT_NOTE = 'Figure 31 and Table 16 give no rule when the three measures fall in different grades. The diagram uses the middle grade of the three. The regurgitant volume is the EROA × the VTI of the jet, so a slow jet with a short VTI gives a small volume for its EROA.';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (SWITCH[k] ? SWITCH_LABEL[k][SWITCH[k].indexOf(x)].toLowerCase() : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k].startsWith('%') ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** The result chips that light: the path of the grade, and its grade beyond severe; none for no regurgitation. */
const litOf = (v) => (v.crit.path === 'none' ? [] : [v.crit.path, ...(v.crit.beyond ? [`b${v.crit.beyond}`] : [])]);
const branchOf = (v) => (v.crit.path.startsWith('q') ? 'quant' : v.crit.path === 'none' ? '' : 'spec');
/** The RA pressure rule at the values v, as a short line. */
const rapRule = (v) => `IVC ${v.ivc.toFixed(1)} cm ${v.ra.dilated ? '>' : '≤'}2.1, collapse ${v.coll}% ${v.ra.collapses ? '≥' : '<'}50%`;

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => (SWITCH[k]
    ? `<div class="ase-row asx-in${SWITCH[k].length > 2 ? ' rgx-row3' : ''}" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="seg rgx-tg">${SWITCH[k].map((x, i) => `<button type="button" data-k="${k}" data-i="${i}" aria-pressed="false">${SWITCH_LABEL[k][i]}</button>`).join('')}</span>
    </div>`
    : `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${btn(k, -1)}<span class="ase-v"><b></b><small>${UNIT[k]}</small></span>${btn(k, 1)}</span>
    </div>`);
  const group = ([s, name, sub, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">${sub}</span></p>
      ${keys.map(input).join('')}${s === 'spec' ? '<p class="ase-note asx-note rgx-dur"></p>' : ''}
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k]}ch"></i>`)).join('');
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${TR_QUANT_LABEL[k].map((lab, i) => `<span class="asx-c" data-i="${i + 1}" data-l="${QLEV[i + 1]}">${GNAME[i + 1]} ${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${QUANT.includes(k) ? '<span class="asx-st"></span>' : ''}</p>
      ${FORMULA[k] ? `<p class="asx-f"><span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span></p>` : `<p class="asx-f"><span class="asx-fx">${k === 'rap' ? '' : 'as measured, at 50–70 cm/s'}</span></p>`}
      ${QUANT.includes(k) ? chips(k) : ''}
    </div>`;
  const crit = (set) => ([k, name, rule]) => `<p class="asx-q" data-c="${set}:${k}"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">${name}</span>${rule ? `<span class="asx-qr">${rule}</span>` : ''}<span class="asx-qs"></span></p>`;
  const set = (s, name, list) => `<div class="rgx-set" data-set="${s}" data-n="${list.length}"><p class="rgx-sh"><span>${name}</span><span class="ase-count"></span></p>${list.map(crit(s)).join('')}</div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Calculations and grades</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${GROUPS.map(group).join('')}
    <div class="ase-step is-on asx-step" data-s="press">
      <p class="ase-sh"><span class="ase-sn">Pressures</span><span class="ase-sx">RV systolic pressure from the jet and the IVC<span class="cite" data-ref="mukherjee2025"></span></span><a class="asx-go" href="#pressure" data-go="pressure" aria-label="The RV systolic pressure: chapter ${numOf('pressure')}, Doppler hemodynamics">${numOf('pressure')} Pressure →</a></p>
      ${['grad', 'rap', 'rvsp'].map(eq).join('')}
    </div>
    <div class="ase-step is-on asx-step" data-s="quant">
      <p class="ase-sh"><span class="ase-sn">Quantitation</span><span class="ase-sx">PISA method; ASE grades, then EACVI beyond severe<span class="cite" data-ref="zoghbi2017,lancellotti2022"></span></span><a class="asx-go" href="#mr" data-go="mr" aria-label="The PISA method: chapter ${numOf('mr')}, Mitral regurgitation">${numOf('mr')} MR →</a></p>
      ${['vc', 'flow', 'eroa', 'rvol'].map(eq).join('')}
      <p class="asx-q rgx-qg"><span class="asx-qn">Quantitative grade</span><span class="asx-qr">the middle grade of the three</span><span class="asx-qs"></span></p>
      <p class="ase-note asx-note">${QUANT_NOTE}</p>
    </div>
    <div class="ase-step is-on asx-step" data-s="crit">
      <p class="ase-sh"><span class="ase-sn">Specific criteria</span><span class="ase-sx">ASE algorithm for chronic TR<span class="cite" data-ref="zoghbi2017"></span></span></p>
      ${set('mild', 'For mild TR', TR_MILD)}${set('severe', 'For severe TR', TR_SEVERE)}
      <p class="ase-note asx-note">${CRIT_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">ASE algorithm; EACVI grades beyond severe<span class="cite" data-ref="zoghbi2017,lancellotti2022"></span></span></p>
      ${OUTS.map(([b, name, outs]) => `<div class="asx-br" data-b="${b}"><p class="asx-bl">${name}</p><p class="asx-os">${outs.map(([o, lab]) => `<span class="ase-o" data-o="${o}"${SEV_OUT.has(o) ? ' data-sev' : ''}>${lab}</span>`).join('')}</p></div>`).join('')}
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'), dur: q('.rgx-dur'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    sw: Object.fromEntries(SW.map((k) => [k, { el: q(`[data-row="${k}"]`), bs: [...host.querySelectorAll(`[data-row="${k}"] button`)] }])),
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'), fx: el.querySelector('.asx-fx'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    qg: { el: q('.rgx-qg'), st: q('.rgx-qg .asx-qs') },
    sets: Object.fromEntries([...host.querySelectorAll('.rgx-set')].map((el) => [el.dataset.set, { el, n: el.querySelector('.ase-count'), of: Number(el.dataset.n) }])),
    crit: Object.fromEntries([...host.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, { el, st: el.querySelector('.asx-qs') }])),
    br: Object.fromEntries([...host.querySelectorAll('.asx-br')].map((el) => [el.dataset.b, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, b.dataset.i !== undefined ? SWITCH[b.dataset.k][Number(b.dataset.i)] : Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements and the switches of the values v, as trx stores them. */
const valsOf = (v) => Object.fromEntries([...IN, ...SW].map((k) => [k, v[k]]));

/** The keys of trx that differ from the model's values where the edits started. */
function editedOf(ed) {
  const m = measure(modelAt(ed.base));
  return [...IN.filter((k) => Math.abs(ed[k] - m[k]) > 1e-9), ...SW.filter((k) => ed[k] !== m[k])];
}

const freeLive = () => { const live = document.querySelector('#ch-tr .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click (dir) or a switch (its value): the edited values and the slider at their result, in one patch; Play and the tour stop. */
function edit(k, x, btn = null) {
  const s = st;
  const base = s[EDITS] ? s[EDITS].base : s[KEY];
  const cur = shown(s);
  const vals = valsOf(cur);
  const from = vals[k], to = SWITCH[k] ? x : stepOf(from, limits(k, cur), x);
  if (to === from) return;
  vals[k] = to;
  const next = shownOf({ [EDITS]: { ...vals, base } });
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf({ ...vals, base }).length) setState({ [EDITS]: null, [KEY]: base, anim: false, playing: false });   // back at the model's values
    else setState({ [EDITS]: Object.freeze({ ...vals, base }), [KEY]: slideTo(s[KEY], next.grade), anim: false, playing: false });
  });
  pending = null;
  if (next.grade !== cur.grade) cue('bell');
}

function resetEdits() {
  pending = { kind: 'reset' };
  setState({ [EDITS]: null, anim: false, playing: false });
  pending = null;
  dg?.result.focus({ preventScroll: true });
}

const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

/** The diagram at the values on screen: numbers, grades, criteria, the result; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const M = { ed: !!s[EDITS], v, out: v.grade, eds: s[EDITS] ? editedOf(s[EDITS]) : [], lit: litOf(v), br: branchOf(v) };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  // the measurements and their buttons
  for (const k of IN) {
    const R = dg.rows[k], L = limits(k, v);
    txt(R.v, num(k, v[k]));
    R.el.classList.toggle('is-ed', M.eds.includes(k));
    for (const [b, off, other] of [[R.dn, v[k] <= L.min + 1e-9, R.up], [R.up, v[k] >= L.max - 1e-9, R.dn]]) {
      if (off && document.activeElement === b) other.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  for (const [k, S] of Object.entries(dg.sw)) {
    S.bs.forEach((b, i) => b.setAttribute('aria-pressed', String(SWITCH[k][i] === v[k])));
    S.el.classList.toggle('is-ed', M.eds.includes(k));
  }
  txt(dg.dur, `The jet lasts ${Math.round(DUR)} ms, from tricuspid closure to tricuspid opening, so the VTI and the peak velocity limit each other.`);
  // the pressures and the calculations, the numbers in their formulas, and the grades
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (k === 'rap') txt(E.fx, `${rapRule(v)}${v.ra.indeterminate ? ': indeterminate' : ''}`);
    if (!E.st) continue;
    const g = v.crit.q[k];
    E.cs.forEach((c) => c.classList.toggle('is-on', Number(c.dataset.i) === g));
    txt(E.st, GNAME[g]);
    E.el.dataset.l = QLEV[g];
  }
  txt(dg.qg.st, GNAME[v.crit.q5]);
  dg.qg.el.classList.toggle('is-on', v.crit.q5 >= 3);
  // the specific criteria
  for (const [id, R] of Object.entries(dg.crit)) {
    const [set, k] = id.split(':'), on = v.crit[set][k];
    R.el.classList.toggle('is-on', on);
    txt(R.st, on ? 'yes' : 'no');
  }
  for (const [set, R] of Object.entries(dg.sets)) {
    const n = set === 'mild' ? v.crit.nMild : v.crit.nSevere;
    txt(R.n, `${n} of ${R.of}`);
    R.el.classList.toggle('is-on', n >= 4);
  }
  // the result
  for (const [b, el] of Object.entries(dg.br)) el.classList.toggle('is-on', b === M.br || (b === 'beyond' && v.crit.beyond > 0));
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', M.lit.includes(o));
  txt(dg.head, HEAD[M.out]);
  txt(dg.sub, `${WHY[v.crit.path]}${v.crit.beyond > 3 ? ` · Table 16: ${GNAME[v.crit.beyond]}` : ''}`);
  dg.result.classList.toggle('is-raised', SEVERE.has(M.out));
  dg.reset.classList.toggle('is-off', !M.ed);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.ed && !pending) freeLive();
  // the slider's label: main.js writes it when trS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="trS"]');
  if (o) txt(o, trPage.format.trS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || SW.some((k) => P.v[k] !== v[k]) || P.out !== M.out || P.ed !== M.ed;
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

/** What a change crossed: the grades of the three measures and the counts of specific criteria. */
const CROSS = { vc: 'VC', eroa: 'EROA', rvol: 'RVol' };
function crossed(P, M) {
  const a = P.v.crit, b = M.v.crit;
  const out = QUANT.filter((k) => a.q[k] !== b.q[k]).map((k) => withUnit(k, `${CROSS[k]} ${TR_QUANT_LABEL[k][b.q[k] - 1]}`));
  if (a.nMild !== b.nMild) out.push(`mild criteria ${b.nMild} of 7`);
  if (a.nSevere !== b.nSevere) out.push(`severe criteria ${b.nSevere} of 7`);
  return out;
}

/** The cause and effect of a change, as one line. crossed: a cut-off, a criterion or the result changed. */
function changeLine(P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}` : cause.kind === 'reset' ? 'Reset' : 'Severity';
  const cut = crossed(P, M);
  let what;
  if (cause.kind === 'edit' && EFFECTS[cause.k]) {
    // an edit names two values it changed, first those that crossed into another grade, then
    // the criteria it changed
    const ks = EFFECTS[cause.k], moved = (k) => (QUANT.includes(k) && P.v.crit.q[k] !== M.v.crit.q[k] ? 0 : 1);
    const ch = ks.filter((k) => P.v[k] !== M.v[k]).sort((a, b) => moved(a) - moved(b)).slice(0, 2);
    const crit = cut.filter((c) => !QUANT.some((k) => c.startsWith(CROSS[k])));
    what = [...(ch.length ? ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${num(k, P.v[k])} → ${num(k, M.v[k])}`)}`) : [`${EFFECT[ks[0]]} unchanged at ${withUnit(ks[0], num(ks[0], M.v[ks[0]]))}`]), ...crit].join(', ');
  } else if (cause.kind === 'edit') what = cut.length ? cut.join(', ') : 'no criterion changed';
  else what = [...(P.ed && !M.ed ? ['edits cleared'] : []), ...cut].join(', ') || 'no cut-off crossed';
  const result = P.out === M.out ? `Result unchanged: ${M.out}` : `Result: ${P.out} → ${M.out}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(P, M, cause) {
  const a = P.v.crit, b = M.v.crit;
  for (const k of QUANT) if (a.q[k] !== b.q[k]) flash(dg.eqs[k].chips);
  if (a.q5 !== b.q5) flash(dg.qg.el);
  for (const [id, R] of Object.entries(dg.crit)) { const [set, k] = id.split(':'); if (a[set][k] !== b[set][k]) flash(R.el); }
  if (P.br !== M.br && dg.br[M.br]) flash(dg.br[M.br]);
  if (a.beyond !== b.beyond && b.beyond) flash(dg.br.beyond);
  if (P.out !== M.out || a.path !== b.path) { for (const o of M.lit) flash(dg.out[o]); flash(dg.result); }
  // an edit: the numbers it changed pulse, so each calculation shows that it follows its inputs
  if (cause.kind === 'edit' && !SWITCH[cause.k]) {
    flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (P.v[k] !== M.v[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (P.v[el.dataset.x] !== M.v[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentence: the result in bold, then its numbers and what defines it. */
function liveOf(v, s, cite) {
  const g = v.grade, c = v.crit, Z = cite('zoghbi2017'), L = cite('lancellotti2022'), M = cite('mukherjee2025');
  if (c.path === 'none') return '<b>No tricuspid regurgitation.</b> The play control animates the progression of tricuspid regurgitation from mild to torrential.';
  const nums = ` The vena contracta is ${fmt(v.vc, 1)} cm, the EROA ${fmt(v.eroa, 2)} cm² and the regurgitant volume ${fmt(v.rvol)} mL.`;
  const why = {
    mild: ` Of the 7 specific criteria for mild TR, ${c.nMild} are present, a majority, so the regurgitation is mild without quantitation${Z}.`,
    severe: ` Of the 7 specific criteria for severe TR, ${c.nSevere} are present, a majority${Z}.`,
    both: ` Of the specific criteria, ${c.nMild} for mild TR and ${c.nSevere} for severe TR are present. The findings disagree; TEE or CMR can quantify the regurgitation${Z}.`,
  }[c.path] ?? ` Neither set of specific criteria has a majority (mild ${c.nMild} of 7, severe ${c.nSevere} of 7), so the vena contracta, the EROA and the regurgitant volume decide${Z}.`;
  const hv = v.hvS < 0 ? 'hepatic vein systolic flow reverses' : v.hvS < v.hvD ? 'hepatic vein systolic flow is blunted' : 'hepatic vein flow remains systolic-dominant';
  const heart = ` The RV basal diameter is ${fmt(v.rvb, 1)} cm and the tricuspid annulus ${fmt(v.ta, 1)} cm; the IVC measures ${fmt(v.ivc, 1)} cm and ${v.ra.collapses ? 'collapses' : 'collapses by less than 50%'} with a sniff, which corresponds to an estimated RA pressure of ${v.rap} mmHg (<a href="#ivc" data-go="ivc">chapter ${numOf('ivc')}</a>); ${hv}.`;
  const press = c.beyond > 3
    ? ` The EACVI defines ${g} TR, a grade beyond severe, by the vena contracta, the EROA and the regurgitant volume${L}. As the RV and RA pressures approach each other, the peak TR velocity falls to ${fmt(v.vmax, 1)} m/s${v.cw === 'triangular' ? `, and the gradient of ${v.grad} mmHg from the triangular jet underestimates the true RV–RA gradient${M}` : ''}.`
    : ` The peak TR velocity of ${fmt(v.vmax, 1)} m/s gives an RV systolic pressure of ${v.rvsp} mmHg.`;
  const ed = s[EDITS] ? editedOf(s[EDITS]) : [];
  return `<b>${LEAD[g]}.</b>${nums}${why}${heart}${press}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const trPage = {
  key: 'tr',
  part: 'valves',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Tricuspid regurgitation',
  nav: 'TR',
  dwell: 18,
  defaults: { trS: 0.5, trCine: true, trColor: 'jet', [EDITS]: null },
  format: { trS: (x, s) => (s?.[EDITS] ? shown(s).grade : gradeOf(x)) },
  watch: ['trS', 'trCine', 'trColor', EDITS],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = lazyBands((x) => gradeOf(x));
    paintBands(document.getElementById('tr-grades'), BANDS, LEV, { moderate: 'mod.', torrential: 'torr.' });
    buildDiagram(document.getElementById('tr-calc'));
    // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
    // listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (s[EDITS] && !(EDITS in ch) && (KEY in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ [EDITS]: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); MESH.start(); MESH_PM.start(); },
  leave() { fresh = true; freeLive(); },
  // the heart model and the right heart's targets load at idle, before the chapter opens (main.js warms every chapter)
  warm() { MESH.start(); MESH_PM.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.trCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ trS: 0, trCine: true, trColor: 'jet', [EDITS]: null }); },
  tourTick(tt, set) { set({ trS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.trS * 15; },
  text(s, { cite }) {
    const v = shown(s);
    const sev = SEVERE.has(v.grade);
    return {
      readouts: [
        { k: 'EROA', v: fmt(v.eroa, 2), u: 'cm²', flag: v.eroa >= 0.4 },
        { k: 'Vena contracta', v: fmt(v.vc, 1), u: 'cm', flag: v.vc >= 0.7 },
        { k: 'Regurgitant volume', v: fmt(v.rvol), u: 'mL', flag: v.rvol >= 45 },
        { k: 'RV basal diameter', v: fmt(v.rvb, 1), u: 'cm', flag: v.rvb >= 4.1 },
        { k: 'RV systolic pressure', v: fmt(v.rvsp), u: 'mmHg', flag: trvGrade(v.vmax) !== 'normal' },
        { k: 'Grade', v: v.grade, text: true, flag: sev },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default trPage;
