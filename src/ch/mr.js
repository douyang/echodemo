// Mitral regurgitation: one slider from no leak to severe primary MR with LV dysfunction.
// The orifice drives the numbers (PISA, volume, fraction); the chambers, the pulmonary veins and
// the mitral inflow follow. Values are illustrative, set inside the ASE 2017 bands.
// The text holds the calculations as a diagram (Zoghbi 2017 Figure 18), with ▲▼ buttons on the
// thirteen measurements that the figure uses and a switch for a flail leaflet. An edit stores
// the measurements in mx; the slider then marks a band of their result and does not change
// them. A move of the slider, Play, the tour or a heart's preset clears mx, and the values
// follow the slider again.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { mitralV, RR, EV, cycleAt } from '../cyclemodel.js';
import { MR_MILD, MR_SEVERE, MR_QUANT_LABEL, mrIntegrated } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit, waveLetter } from '../sev.js';
import { drawA4C, cal, measures, heartShown, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { laWeight, lvSizeOf, lvByEf } from '../meshcal.js';
import { onPlane, hingesOf, closureOf, blood, cavity, area, middle, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';
import { numOf } from '../order.js';
import { JETS } from '../jets.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-mr .live', btn, fn);
/** The slider for result g (edits.js): where it is if that is in a band of g, else the middle of the nearest band of g. */
const slideTo = (x, g) => slideOf(x, g, BANDS);

const KEY = 'mrS';
const VMAX = 5.0;        // m/s, the model's MR jet (LV-LA gradient about 100 mmHg)
const VTI = 150;         // cm, the model's MR jet through all of systole
// cm/s, the aliasing velocity for PISA (ASE 2017: 30-40). At 5 m/s, 32 cm/s puts the radius of 1.0 cm
// at an EROA of 0.40 cm², where the grade turns severe. The plume format draws the view at it.
const VA = 32;
const NYQ = 60;          // cm/s, the scanner format's scale for the jet (ASE 2017: 50-70)

// By the EROA as printed, so that each parameter crosses its ASE 2017 cut-off where the EROA crosses
// its own (0.20 and 0.40 cm²): the forward volume (mL) puts the regurgitant fraction at 30% and 50%
// there, the vena contracta (cm) at 0.3 and 0.7, and the jet at 20% and more than 50% of the LA.
const fwdOf = mono([[0, 70], [0.2, 70], [0.4, 60.7], [0.65, 58]]);
const vcOf = mono([[0, 0], [0.2, 0.3], [0.4, 0.7], [0.65, 0.9]]);
const jetOf = mono([[0, 0], [0.2, 0.2], [0.4, 0.51], [0.65, 0.6]]);
const eroaOf = mono([[0, 0], [0.06, 0.03], [0.3, 0.2], [0.4, 0.3], [0.5, 0.4], [0.78, 0.55], [1, 0.65]]);
const TR = tracks([0, 0.3, 0.5, 0.78, 1], {
  lvedd: [4.8, 5.1, 5.6, 6.2, 6.6],
  lvesd: [3.0, 3.2, 3.5, 3.95, 4.45],
  ef: [62, 64, 64, 61, 54],
  lavi: [24, 30, 40, 55, 68],
  E: [0.72, 0.85, 1.05, 1.3, 1.45],
  A: [0.62, 0.6, 0.55, 0.5, 0.45],
  pvS: [0.55, 0.45, 0.2, -0.2, -0.35],
  pvD: [0.4, 0.45, 0.55, 0.7, 0.8],
  trv: [2.3, 2.4, 2.6, 2.95, 3.3],
  gap: [0, 0.04, 0.12, 0.3, 0.4],
  lvL: [8.4, 8.6, 9.0, 9.6, 10.0],
  ma: [3.1, 3.2, 3.4, 3.7, 3.9],
  tri: [0, 0, 0.2, 0.8, 1],
});

/**
 * The part of systole (0..1) before the leak starts. Prolapse (the Barlow heart): MR starts in
 * mid-systole, when the leaflets prolapse, and becomes holosystolic as it becomes severe; MR in
 * prolapse "is rarely severe when not holosystolic" (ASE 2017).
 */
function onsetOf(eroa) {
  return heartShown() === 'barlow' ? 0.45 * (1 - clamp((eroa - 0.15) / 0.25, 0, 1)) : 0;
}

// ---------------------------------------------------------------- the CW envelope
// The jet over the time it leaks: v = Vmax × g(w)^p, w from 0 to 1. g is round, and triangular
// with an early peak when the LA pressure rises (tri, from the model). The power p fits the
// envelope to the VTI: VTI = 100 × Vmax × duration × mean(g^p). The model's jet (5.0 m/s,
// 150 cm through all of systole) gives p near 1. The fullest and the most peaked envelopes
// (P_LO, P_HI) limit the VTI at a peak velocity, and the peak velocity at a VTI.
const P_LO = 0.25, P_HI = 24;
const DUR = EV.mvo - EV.mvc;                     // ms, mitral closure to mitral opening
const durOf = (onset) => DUR * (1 - onset);      // ms, the leak, from its onset
const q2 = (v) => Math.round(v * 50) / 50;
function shapeOf(tri) {
  return (u) => {
    if (u <= 0 || u >= 1) return 0;
    const rnd = Math.pow(Math.sin(Math.PI * u), 0.4);
    const pk = 0.32;
    const tr = u < pk ? Math.pow(u / pk, 0.45) : Math.pow((1 - u) / (1 - pk), 0.9);
    return rnd * (1 - tri) + tr * tri;
  };
}
const memo = new Map();
/** The mean of g^p over the leak (cached: the limits and the fit ask often). */
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
/** The model at slider position s: its measurements before rounding, and the rest of the heart. */
function modelAt(s) {
  const m = TR(s);
  m.s = s;
  // from the EROA as printed, so the measurements cross their cut-offs where it crosses its own
  const eroa = round(eroaOf(s), 2);
  m.onset = onsetOf(eroa);
  m.r = Math.sqrt((eroa * VMAX * 100) / (2 * Math.PI * VA));
  m.vmax = VMAX;
  // a leak through part of systole has a shorter jet VTI: less volume for the same EROA
  m.vti = VTI * (1 - m.onset);
  m.fwd = fwdOf(eroa);
  m.vc = vcOf(eroa);
  m.jet = jetOf(eroa) * 100;
  m.lvedd *= 10;    // mm, as the criteria
  m.lvesd *= 10;
  m.flail = false;
  return m;
}

/** The thirteen measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  r: { d: 2, step: 0.05, min: 0, max: 1.5 },
  vc: { d: 2, step: 0.05, min: 0, max: 1.2 },
  jet: { d: 0, step: 5, min: 0, max: 80 },
  vmax: { d: 1, step: 0.1, min: 3, max: 7 },
  vti: { d: 0, step: 5, min: 50, max: 250 },
  fwd: { d: 0, step: 2, min: 30, max: 100 },
  E: { d: 2, step: 0.05, min: 0.3, max: 2 },
  A: { d: 2, step: 0.05, min: 0.3, max: 2 },
  pvS: { d: 2, step: 0.05, min: -0.5, max: 0.8 },
  lvedd: { d: 0, step: 1, min: 40, max: 80 },
  lvesd: { d: 0, step: 1, min: 20, max: 65 },
  lavi: { d: 0, step: 2, min: 16, max: 100 },
  ef: { d: 0, step: 5, min: 20, max: 80 },
};
const IN = Object.keys(INPUTS);
const DEC = { flow: 0, eroa: 2, rvol: 0, rf: 0, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };

/**
 * The limits of measurement k at the values v. The LV diameters stay 5 mm apart. The jet lasts
 * from its onset to mitral opening, so its VTI lies between those of the most peaked and the
 * fullest envelope at its peak velocity, and the peak velocity follows from the VTI the same way.
 */
function limits(k, v) {
  const I = INPUTS[k];
  if (k === 'lvedd') return { ...I, min: Math.max(I.min, v.lvesd + 5) };
  if (k === 'lvesd') return { ...I, max: Math.min(I.max, v.lvedd - 5) };
  if (k !== 'vti' && k !== 'vmax') return I;
  const T = durOf(v.onset) / 1000, tri = q2(v.tri), full = envMean(tri, P_LO), peak = envMean(tri, P_HI);
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
  v.flail = !!raw.flail;
  v.trv = round(raw.trv, 1);
  v.flow = round(2 * Math.PI * v.r ** 2 * VA, 0);
  v.eroa = round(v.flow / (100 * v.vmax), 2);
  v.rvol = round(v.eroa * v.vti, 0);
  v.rf = v.rvol > 0 ? round((100 * v.rvol) / (v.rvol + v.fwd), 0) : 0;
  v.leak = v.flow > 0 || v.vc > 0 || v.jet > 0;    // a color signal: flow convergence, vena contracta or jet
  v.p = fitP(q2(v.tri), v.vti / ((v.vmax * durOf(v.onset)) / 10));
  v.sd = v.pvS / v.pvD;
  v.crit = mrIntegrated(v);
  v.grade = v.crit.grade;
  return v;
}

/** The values on screen, from the store: the edited measurements (mx), or the model's at the slider. */
function shownOf(s) {
  if (!s.mx) return measure(modelAt(s[KEY]));
  const v = modelAt(s.mx.base);
  for (const k of IN) v[k] = s.mx[k];
  v.flail = s.mx.flail;
  return measure(v);
}
let lastMx = null, lastS = null, lastHeart = null, lastShown = null;
/** shownOf, kept for the last state: the figure asks every frame. The heart sets the onset. */
function shown(s) {
  const heart = heartShown();
  if (s.mx !== lastMx || (!s.mx && s[KEY] !== lastS) || heart !== lastHeart || !lastShown) {
    lastMx = s.mx; lastS = s[KEY]; lastHeart = heart;
    lastShown = shownOf(s);
  }
  return lastShown;
}
export const gradeOf = (s) => measure(modelAt(s)).grade;

// the results: their level (the colour of their band), the bold lead of the live sentence, and
// the line under it in the diagram
const LEV = { ...LEVEL, 'severe, LV dysfunction': 4 };
const LEAD = {
  none: 'No mitral regurgitation', mild: 'Mild mitral regurgitation', moderate: 'Moderate mitral regurgitation', severe: 'Severe mitral regurgitation',
  'severe, LV dysfunction': 'Severe mitral regurgitation with LV dysfunction', indeterminate: 'Mitral regurgitation of indeterminate grade',
};
const HEAD = {
  none: 'No regurgitation', mild: 'Mild regurgitation', moderate: 'Moderate regurgitation', severe: 'Severe regurgitation',
  'severe, LV dysfunction': 'Severe regurgitation, LV dysfunction', indeterminate: 'Indeterminate grade',
};
const WHY = {
  none: 'no flow convergence, vena contracta or jet', mild: '≥4 specific criteria for mild MR', severe: '≥4 specific criteria for severe MR',
  both: '≥4 specific criteria for mild and for severe MR', q1: 'quantitative grade I', q2: 'quantitative grade II', q3: 'quantitative grade III',
  q3s: 'grade III and 3 specific criteria for severe MR', q4: 'quantitative grade IV',
};
const SEVERE = new Set(['severe', 'severe, LV dysfunction']);
let BANDS = [];
/** The grades along the slider, for the heart shown: a prolapse leak starts late and moves the bands. */
function paint() {
  BANDS = bands((x) => gradeOf(x));
  paintBands(document.getElementById('mr-grades'), BANDS, LEV, { 'severe, LV dysfunction': 'LV dysf.' });
}

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- the figure
/** LA size (cm) from its volume: area-length with width = r x length. */
function laDims(vol, r) {
  const L = Math.cbrt(vol / (0.524 * r * r));
  return [r * L, L];
}

// The four-chamber view cut from the heart mesh (meshpanel.js): the heart the page shows, its LA
// at the printed LA volume index (meshcal.js laWeight), its LV at the printed LVEDD and LVEF
// (lvSizeOf, lvByEf), and the jet drawn on it as on the parametric view. The scanner format
// (jets.js) keeps the parametric view.
const MESH = new MeshPanel('a4c', { diseases: ['la', 'lvSize'], lv: true, redraw: () => { if (sheet) sheet.dirty = true; } });

/**
 * The jet on the mesh view at systolic weight s: from where the mitral leaflets meet, into the
 * LA, which clips it; its length and width from the jet area as a share of the LA's area on the
 * plane, as the parametric view sizes them. ax: the LV's long axis, for the PISA radius.
 */
function mrJet(ev, v, s) {
  const h = hingesOf(ev, 'MitralValve');
  if (!h) return null;
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle(h);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  const O = closureOf(ev, 'MitralValve', M, nrm) || M;
  // the LA's blood reaches up between the shut leaflets to where they meet: the cavity is cut
  // there, parallel to the hinge line
  const side = perp(nrm);
  const LA = cavity(ev, blood(ev, onPlane(ev, an.la)), [[add(O, side), sub(O, side)]]);
  if (LA.length < 12) return null;
  let lMax = 0, w0 = Infinity, w1 = -Infinity;
  for (const p of LA) {
    lMax = Math.max(lMax, -dot(sub(p, M), nrm));
    const x = dot(sub(p, M), side);
    w0 = Math.min(w0, x);
    w1 = Math.max(w1, x);
  }
  const jA = (v.jet / 100) * area(LA);
  const jl = Math.min(lMax * 0.92, Math.sqrt((jA / 0.55) * 1.3));
  const jw = jl > 0 ? Math.min((w1 - w0) * 0.9, jA / (0.55 * jl)) : 0;
  const ax = unit(sub(apex, M));
  // into the LA against the LV's long axis, leaning toward the LA's middle
  const dir = unit(add(mul(ax, -0.8), mul(unit(sub(middle(LA), O)), 0.2)));
  return { O, dir, clip: LA, ax, jl, jw };
}

/** The A4C at the values on screen: the chambers and the jet from the measurements. */
function a4c(ctx, box, v, t, mode) {
  const t0 = EV.mvc + v.onset * (EV.mvo - EV.mvc);
  const sys = t >= t0 && t <= EV.mvo;
  const a = sys ? Math.pow(Math.max(0, Math.sin(Math.PI * (t - t0) / (EV.mvo - t0))), 0.35) : 0;
  // with no flow convergence, the jet is drawn from the flow through its vena contracta
  const pisa = v.flow > 0, q = pisa ? v.flow : Math.PI * (Math.max(v.vc, 0.24) / 2) ** 2 * v.vmax * 100;
  const tags = (list) => [...list, ...(v.flail ? [['flail leaflet', 'flail']] : [])];
  if (JETS === 'plume') {
    // one view at the aliasing velocity: the flow convergence with its radius, and the jet
    const heart = st.pheno || 'normal';
    const W8 = lvByEf(heart, lvSizeOf(heart, v.lvedd), v.ef), sy = cycleAt(t).s;
    MESH.draw(ctx, box, fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${VA} cm/s`, `A4C · COLOR ${VA}`), {
      tms: t, disease: { la: laWeight(v.lavi, heart), lvSize: W8.size + (W8.esSize - W8.size) * sy }, lvK: W8.k,
      // deeper as the LA grows (its length as the cube root of its volume, 5 cm at 25 mL/m²)
      deeper: Math.max(0, 5 * (Math.cbrt(v.lavi / 25) - 1)),
      names: [['lv', 'LV', 'apex', 0.45], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
      over: (c, F, ev) => {
        if (!v.leak) return;
        const J = mrJet(ev, v, sy);
        if (!J) return;
        jet(c, F, { q, va: VA, vc: v.vc, jl: J.jl, jw: J.jw, a, pisa, O: J.O, dir: J.dir, clip: J.clip });
        barFor(c, F, -VA, VA);
        // the PISA radius from the orifice into the LV, along its long axis
        if (pisa && a > 0.5) cal(c, F, J.O, add(J.O, mul(J.ax, v.r)), '', { solid: true });
      },
      lines: tags([`PISA r ${v.r.toFixed(2)} cm`, `VC ${v.vc.toFixed(2)} cm`, [`jet ${v.jet}% of LA`, `jet ${v.jet}% LA`]]),
    });
    return;
  }
  // the scanner format: the parametric view, its chambers from the measurements and its walls
  // from the model
  const laMax = v.lavi * BSA, laMin = laMax * 0.55;
  const [wMax, lMax] = laDims(laMax, 0.8 + 0.1 * v.s), [wMin, lMin] = laDims(laMin, 0.8 + 0.1 * v.s);
  const wall = 0.9 - 0.08 * v.s;
  const sysF = 1 + 1.25 * (v.ef / 100 - 0.2);   // 50% thicker in systole at an LVEF of 60%
  const g = {
    lvL: [v.lvL, v.lvL - 1.15], lvW: [v.lvedd / 10, v.lvesd / 10], lvWall: [wall, wall * sysF], ivs: [wall, wall * sysF],
    rvW: [3.4 + 0.3 * v.s, 2.8 + 0.3 * v.s], laW: [wMin, wMax], laL: [lMin, lMax], raW: [3.2, 3.8], raL: [3.9, 4.5],
    ma: v.ma, ta: 3.0, mv: { gap: v.gap, thick: 0.13 },
  };
  const laArea = (Math.PI / 4) * wMax * lMax;
  const jA = (v.jet / 100) * laArea;
  const jl = Math.min(lMax * 0.92, Math.sqrt(jA / 0.55 * 1.3));
  const jw = jl > 0 ? Math.min(wMax * 0.9, jA / (0.55 * jl)) : 0;
  // Jet: the standard scale. PISA: zoomed on the valve, the baseline shifted toward the jet
  // (down: MR runs away from the probe) until the flow aliases at VA; variance off
  const zoom = mode === 'pisa';
  drawA4C(ctx, box, g, {
    t, depth: 16 + 1.2 * v.s,
    title: zoom ? fit(box.w, `APICAL FOUR-CHAMBER · ZOOM · Va ${VA} cm/s`, `A4C ZOOM · Va ${VA}`) : fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${NYQ} cm/s`, `A4C · COLOR ${NYQ}`),
    color: {
      roi: zoom ? 'mv' : 'la', zoom: zoom ? { at: 'mv', span: 7 } : null,
      lo: zoom ? -VA : -NYQ, hi: zoom ? 2 * NYQ - VA : NYQ, variance: !zoom,
      E: v.E, A: v.A, pvS: v.pvS, pvD: v.pvD,
      mr: v.leak ? { q, u0: v.vmax * 100, vc: v.vc, jl, jw, frac: v.jet / 100, a } : null,
    },
    after: (c, F, geo) => {
      if (zoom && pisa && a > 0.85) {
        // the radius along the beam, from the orifice to the first aliasing boundary
        const O = geo.mv.gapMid, l = Math.hypot(O[0], O[1]), r = v.r * Math.sqrt(a);
        cal(c, F, O, [O[0] * (1 - r / l), O[1] * (1 - r / l)], '', { solid: true });
      }
      measures(c, F, tags(zoom
        ? [`PISA r ${v.r.toFixed(2)} cm`, `Va ${VA} cm/s`, [`EROA ${v.eroa.toFixed(2)} cm²`, `EROA ${v.eroa.toFixed(2)}`]]
        : [`VC ${v.vc.toFixed(2)} cm`, [`jet ${v.jet}% of LA`, `jet ${v.jet}% LA`]]));
    },
  });
}

/** MR jet, CW: from its onset to mitral opening, fitted to the peak velocity and the VTI; triangular and early peaking as the LA pressure rises. */
function mrCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · MITRAL REGURGITATION', 'CW · MR'));
  const bx = inner(P);
  const tri = q2(v.tri), dens = q2(clamp(v.rvol / 60, 0.06, 1)), vs = Math.max(6, Math.ceil(v.vmax + 0.6));
  const g = shapeOf(tri), p = v.p;
  const t0 = EV.mvc + v.onset * (EV.mvo - EV.mvc);
  const fn = (u) => {
    const tt = (u * 2 * RR) % RR;
    const w = (tt - t0) / (EV.mvo - t0);
    return v.leak ? -v.vmax * Math.pow(g(w), p) : 0;
  };
  spectral(ctx, bx, { fn, scale: vs, base: 0.06, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `mrcw|${v.leak}|${v.vmax}|${tri}|${p.toFixed(4)}|${q2(v.onset)}|${dens}|${vs}`, seed: 12 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, vs, 0.06, 2);
  const dn = v.rvol >= 60 ? 'dense' : v.rvol >= 30 ? 'dense, partial' : 'faint';
  const late = v.onset > 0.05 ? ', mid-late systolic' : '';
  note(ctx, bx, v.leak ? [`peak ${v.vmax.toFixed(1)} m/s · ${dn}${v.tri > 0.5 ? ', triangular' : ''}${late}`, `${dn}${late}`, dn] : 'no regurgitation', 'bottom');
  return bx;
}

/** Pulmonary vein, PW: S and D toward the probe, atrial reversal Ar below the baseline. */
function pvPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RIGHT UPPER PULMONARY VEIN', 'PW · PULM. VEIN'));
  const bx = inner(P);
  // S as measured (the criterion reads it), D as drawn
  const S = v.pvS, D = q2(v.pvD), Ar = -0.25;
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
  };
  spectral(ctx, bx, { fn, scale: 1.0, base: 0.6, mode: 'pw', broad: 0.12, key: `mrpv|${S}|${D}`, seed: 21 });
  vscale(ctx, bx, 1.0, 0.6, 0.5, '');
  const y0 = bx.y + 0.6 * bx.h, k = (bx.h * 0.6) / 1.0;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letters = [
    waveLetter(ctx, 'S', X(250), S >= 0 ? y0 - S * k - 5 : y0 - S * k + 13),
    waveLetter(ctx, 'D', X(540), y0 - D * k - 5),
    waveLetter(ctx, 'Ar', X(835), y0 - Ar * k + 13),
  ];
  ctx.restore();
  note(ctx, bx, S < 0 ? ['systolic flow reversal', 'S reversed'] : S === 0 ? ['no systolic flow', 'no S'] : S < 0.05 ? ['minimal systolic flow', 'minimal S'] : [`S/D ${v.sd.toFixed(1)}${v.sd < 1 ? ' · systolic blunting' : ''}`, `S/D ${v.sd.toFixed(1)}`], 'auto', letters);
  return bx;
}

/** Mitral inflow, PW. The scale grows past 1.8 m/s only for an edited E or A. */
function inflowPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · MITRAL INFLOW');
  const bx = inner(P);
  const E = q2(v.E), A = q2(v.A), vs = Math.max(1.8, Math.ceil((Math.max(E, A) + 0.2) * 5) / 5);
  spectral(ctx, bx, { fn: (u) => mitralV((u * 2 * RR) % RR, E, A, 190 - 30 * v.s), scale: vs, base: 0.92, mode: 'pw', broad: 0.1, key: `mrin|${E}|${A}|${q2(v.s)}|${vs}`, seed: 22 });
  vscale(ctx, bx, vs, 0.92, 0.5);
  note(ctx, bx, [`E ${v.E.toFixed(2)} · A ${v.A.toFixed(2)} m/s${v.E > 1.2 ? ' · E-wave dominant' : v.E < v.A ? ' · A-wave dominant' : ''}`, `E ${v.E.toFixed(2)} · A ${v.A.toFixed(2)} m/s`, `E ${v.E.toFixed(2)} · A ${v.A.toFixed(2)}`], 'top');
  return bx;
}

function meterItems(v) {
  return [
    { k: 'EROA', v: v.eroa, u: 'cm²', d: 2, lo: 0, hi: 0.7, cuts: [[0.2, '0.20'], [0.4, '0.40']], bad: v.eroa >= 0.4 },
    { k: 'Regurgitant volume', v: v.rvol, u: 'mL', lo: 0, hi: 110, cuts: [[30, '30'], [60, '60']], bad: v.rvol >= 60 },
    { k: 'Regurgitant fraction', v: v.rf, u: '%', lo: 0, hi: 70, cuts: [[30, '30'], [50, '50']], bad: v.rf >= 50 },
    { k: 'Vena contracta', v: v.vc, u: 'cm', d: 2, lo: 0, hi: 1.0, cuts: [[0.3, '0.3'], [0.7, '0.7']], bad: v.vc >= 0.7 },
    { k: `PISA radius (${VA} cm/s)`, v: v.r, u: 'cm', d: 2, lo: 0, hi: 1.4, cuts: [[0.3, '0.3'], [1.0, '1.0']], bad: v.r >= 1.0 },
    { k: 'LV end-systolic diameter', v: v.lvesd, u: 'mm', lo: 20, hi: 50, norm: [25, 40], cuts: [[40, '40']], bad: v.lvesd >= 40 },
    { k: 'LVEF', v: v.ef, u: '%', lo: 30, hi: 75, norm: [52, 72], cuts: [[60, '60']], bad: v.ef <= 60 && SEVERE.has(v.grade) },
    { k: 'LA volume index', v: v.lavi, u: 'mL/m²', lo: 10, hi: 80, norm: [16, 34], cuts: [[34, '34']], bad: v.lavi > 34 },
    { k: 'Mitral E', v: v.E, u: 'm/s', d: 2, lo: 0.3, hi: 1.8, cuts: [[1.2, '1.2']], bad: v.E > 1.2 },
    { k: 'Peak TR velocity', v: v.trv, u: 'm/s', d: 1, lo: 1.5, hi: 4, norm: [1.5, 2.8], cuts: [[2.8, '2.8']], bad: v.trv >= 2.8 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(st.mrCine, 220);
  const mode = st.mrColor;
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, v, tt, mode);
    const [p1, p2] = rows(b, [1, 1], 8);
    const b1 = mrCW(ctx, p1, v), b2 = pvPW(ctx, p2, v);
    for (const bx of [b1, b2]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt, mode);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [p1, p2, p3] = rows(colR, [1.1, 1, 1], 10);
  const bxs = [mrCW(ctx, p1, v), pvPW(ctx, p2, v), inflowPW(ctx, p3, v)];
  for (const bx of bxs) cursor(ctx, bx, beat.sweep);
}

// ---------------------------------------------------------------- the calculations in the text
// From the measurements (▲▼) through the PISA formulas to the quantitative grades and the
// specific criteria of Figure 18, and to the result. Each change flashes where it acts.
const NAME = {
  r: 'PISA radius', vc: 'Vena contracta', jet: 'Jet area', vmax: 'MR peak velocity', vti: 'MR VTI', fwd: 'LVOT stroke volume',
  E: 'Mitral E', A: 'Mitral A', pvS: 'Pulmonary vein S', lvedd: 'LVEDD', lvesd: 'LVESD', lavi: 'LA volume index', ef: 'LVEF', flail: 'Flail leaflet',
  flow: 'Flow rate', eroa: 'EROA', rvol: 'Regurgitant volume', rf: 'Regurgitant fraction',
};
const UNIT = {
  r: 'cm', vc: 'cm', jet: '% LA', vmax: 'm/s', vti: 'cm', fwd: 'mL', E: 'm/s', A: 'm/s', pvS: 'm/s', lvedd: 'mm', lvesd: 'mm', lavi: 'mL/m²', ef: '%',
  flow: 'mL/s', eroa: 'cm²', rvol: 'mL', rf: '%',
};
const ARIA = {
  r: 'PISA radius', vc: 'vena contracta width', jet: 'jet area as a percentage of the LA area', vmax: 'MR peak velocity', vti: 'MR velocity-time integral',
  fwd: 'LVOT stroke volume', E: 'mitral E velocity', A: 'mitral A velocity', pvS: 'pulmonary vein systolic velocity', lvedd: 'LV end-diastolic diameter',
  lvesd: 'LV end-systolic diameter', lavi: 'LA volume index', ef: 'LVEF',
};
/** The measurements in the groups of the diagram: color Doppler, spectral Doppler, 2D. */
const GROUPS = [
  ['color', 'Color Doppler', `PISA at an aliasing velocity of ${VA} cm/s; jet area at 50–70 cm/s`, ['r', 'vc', 'jet']],
  ['spec', 'Spectral Doppler', 'CW through the jet; PW in the LVOT, the mitral inflow and a pulmonary vein', ['vmax', 'vti', 'fwd', 'E', 'A', 'pvS']],
  ['twod', '2D', 'LV diameters, LA volume index, LVEF and the leaflets', ['lvedd', 'lvesd', 'lavi', 'ef', 'flail']],
];
/** The names in the change line: the cause, and its effects. */
const EFFECT = { flow: 'flow rate', eroa: 'EROA', rvol: 'regurgitant volume', rf: 'regurgitant fraction' };
/** What each measurement changes, first the values that grade the leak. */
const EFFECTS = { r: ['eroa', 'rvol', 'rf', 'flow'], vmax: ['eroa', 'rvol', 'rf'], vti: ['rvol', 'rf'], fwd: ['rf'] };
/** Each formula, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  flow: ['2π × r² × Va', ['2π × ', { k: 'r' }, `² × ${VA}`]],
  eroa: ['flow rate ÷ (100 × peak velocity)', [{ k: 'flow' }, ' ÷ (100 × ', { k: 'vmax' }, ')']],
  rvol: ['EROA × VTI', [{ k: 'eroa' }, ' × ', { k: 'vti' }]],
  rf: ['RVol ÷ (RVol + LVOT stroke volume)', [{ k: 'rvol' }, ' ÷ (', { k: 'rvol' }, ' + ', { k: 'fwd' }, ')']],
};
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { r: 4, flow: 3, vmax: 3, eroa: 4, vti: 3, rvol: 3, fwd: 3 };
const QUANT = ['eroa', 'rvol', 'rf'];
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
/** The colour level of a quantitative grade: II and III are moderate, IV severe. */
const QLEV = [0, 1, 2, 2, 3];
const OUTS = [
  ['spec', '≥4 specific criteria', [['mild', 'definitely mild'], ['severe', 'definitely severe'], ['both', 'both sets: indeterminate']]],
  ['quant', 'Otherwise, the quantitative grade', [['q1', 'I · mild'], ['q2', 'II · moderate'], ['q3', 'III · moderate'], ['q3s', 'III and 3 severe criteria · severe'], ['q4', 'IV · severe']]],
];
const SEV_OUT = new Set(['severe', 'q3s', 'q4']);
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const CRIT_NOTE = 'Figure 18 gives no number for four criteria. This site uses a jet below 20% of the LA area and the upper limits of normal for men<span class="cite" data-ref="lang2015"></span>. Normal LV function is an LVEF above 60%, because an LVEF ≤60% is LV dysfunction in MR<span class="cite" data-ref="otto2020"></span>. A soft CW jet is a jet that the figure draws faint, at a regurgitant volume below 30 mL.';
const QUANT_NOTE = 'Figure 18 gives no rule when the three measures fall in different grades. The diagram uses the middle grade of the three.';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (k === 'flail' ? (x ? 'yes' : 'no') : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k].startsWith('%') ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** The result chips that light: the path of the grade; none for no regurgitation. */
const litOf = (v) => (v.crit.path === 'none' ? [] : [v.crit.path]);
const branchOf = (v) => (v.crit.path.startsWith('q') ? 'quant' : v.crit.path === 'none' ? '' : 'spec');

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => (k === 'flail'
    ? `<div class="ase-row asx-in" data-row="flail" role="group" aria-label="${NAME.flail}">
      <span class="ase-nm">${NAME.flail}</span>
      <span class="seg rgx-tg"><button type="button" data-k="flail" data-dir="-1" aria-pressed="true">No</button><button type="button" data-k="flail" data-dir="1" aria-pressed="false">Yes</button></span>
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
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${MR_QUANT_LABEL[k].map((lab, i) => `<span class="asx-c" data-i="${i + 1}" data-l="${QLEV[i + 1]}">${ROMAN[i + 1]} ${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${QUANT.includes(k) ? '<span class="asx-st"></span>' : ''}</p>
      <p class="asx-f"><span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span></p>
      ${QUANT.includes(k) ? chips(k) : ''}
    </div>`;
  const crit = (set) => ([k, name, rule]) => `<p class="asx-q" data-c="${set}:${k}"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">${name}</span>${rule ? `<span class="asx-qr">${rule}</span>` : ''}<span class="asx-qs"></span></p>`;
  const set = (s, name, list) => `<div class="rgx-set" data-set="${s}"><p class="rgx-sh"><span>${name}</span><span class="ase-count"></span></p>${list.map(crit(s)).join('')}</div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Calculations and grades</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${GROUPS.map(group).join('')}
    <div class="ase-step is-on asx-step" data-s="quant">
      <p class="ase-sh"><span class="ase-sn">Quantitation</span><span class="ase-sx">PISA method and the ASE grades I to IV<span class="cite" data-ref="zoghbi2017"></span></span><a class="asx-go" href="#pressure" data-go="pressure" aria-label="The flow rate: chapter ${numOf('pressure')}, Doppler hemodynamics">${numOf('pressure')} Pressure →</a></p>
      ${['flow', ...QUANT].map(eq).join('')}
      <p class="asx-q rgx-qg"><span class="asx-qn">Quantitative grade</span><span class="asx-qr">the middle grade of the three</span><span class="asx-qs"></span></p>
      <p class="ase-note asx-note">${QUANT_NOTE}</p>
    </div>
    <div class="ase-step is-on asx-step" data-s="crit">
      <p class="ase-sh"><span class="ase-sn">Specific criteria</span><span class="ase-sx">ASE algorithm for chronic MR<span class="cite" data-ref="zoghbi2017"></span></span></p>
      ${set('mild', 'For mild MR', MR_MILD)}${set('severe', 'For severe MR', MR_SEVERE)}
      <p class="ase-note asx-note">${CRIT_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">ASE algorithm and ACC/AHA stage<span class="cite" data-ref="zoghbi2017,otto2020"></span></span></p>
      ${OUTS.map(([b, name, outs]) => `<div class="asx-br" data-b="${b}"><p class="asx-bl">${name}</p><p class="asx-os">${outs.map(([o, lab]) => `<span class="ase-o" data-o="${o}"${SEV_OUT.has(o) ? ' data-sev' : ''}>${lab}</span>`).join('')}</p></div>`).join('')}
      <p class="asx-q" data-q="lvd"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">LV dysfunction</span><span class="asx-qr">LVEF ≤60% or LVESD ≥40 mm; in severe MR, stage C2</span><span class="asx-qs"></span></p>
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'), dur: q('.rgx-dur'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    flail: { el: q('[data-row="flail"]'), no: q('[data-k="flail"][data-dir="-1"]'), yes: q('[data-k="flail"][data-dir="1"]') },
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    qg: { el: q('.rgx-qg'), st: q('.rgx-qg .asx-qs') },
    sets: Object.fromEntries([...host.querySelectorAll('.rgx-set')].map((el) => [el.dataset.set, { el, n: el.querySelector('.ase-count') }])),
    crit: Object.fromEntries([...host.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, { el, st: el.querySelector('.asx-qs') }])),
    lvd: { el: q('[data-q="lvd"]'), st: q('[data-q="lvd"] .asx-qs') },
    br: Object.fromEntries([...host.querySelectorAll('.asx-br')].map((el) => [el.dataset.b, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements and the flail switch of the values v, as mx stores them. */
const valsOf = (v) => ({ ...Object.fromEntries(IN.map((k) => [k, v[k]])), flail: v.flail });

/** The keys of mx that differ from the model's values where the edits started. */
function editedOf(mx) {
  const m = measure(modelAt(mx.base));
  return [...IN.filter((k) => Math.abs(mx[k] - m[k]) > 1e-9), ...(mx.flail !== m.flail ? ['flail'] : [])];
}

const freeLive = () => { const live = document.querySelector('#ch-mr .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click or the flail switch: the edited values and the slider at their result, in one patch; Play and the tour stop. */
function edit(k, dir, btn = null) {
  const s = st;
  const base = s.mx ? s.mx.base : s[KEY];
  const cur = shown(s);
  const vals = valsOf(cur);
  const from = vals[k], to = k === 'flail' ? dir > 0 : stepOf(from, limits(k, cur), dir);
  if (to === from) return;
  vals[k] = to;
  const next = shownOf({ mx: { ...vals, base } });
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf({ ...vals, base }).length) setState({ mx: null, [KEY]: base, anim: false, playing: false });   // back at the model's values
    else setState({ mx: Object.freeze({ ...vals, base }), [KEY]: slideTo(s[KEY], next.grade), anim: false, playing: false });
  });
  pending = null;
  if (next.grade !== cur.grade) cue('bell');
}

function resetEdits() {
  pending = { kind: 'reset' };
  setState({ mx: null, anim: false, playing: false });
  pending = null;
  dg?.result.focus({ preventScroll: true });
}

const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

/** The diagram at the values on screen: numbers, grades, criteria, the result; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const M = { mx: !!s.mx, v, out: v.grade, ed: s.mx ? editedOf(s.mx) : [], lit: litOf(v), br: branchOf(v) };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  // the measurements and their buttons
  for (const k of IN) {
    const R = dg.rows[k], L = limits(k, v);
    txt(R.v, num(k, v[k]));
    R.el.classList.toggle('is-ed', M.ed.includes(k));
    for (const [b, off, other] of [[R.dn, v[k] <= L.min + 1e-9, R.up], [R.up, v[k] >= L.max - 1e-9, R.dn]]) {
      if (off && document.activeElement === b) other.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  dg.flail.no.setAttribute('aria-pressed', String(!v.flail));
  dg.flail.yes.setAttribute('aria-pressed', String(v.flail));
  dg.flail.el.classList.toggle('is-ed', M.ed.includes('flail'));
  txt(dg.dur, `The jet lasts ${Math.round(durOf(v.onset))} ms, from ${v.onset > 0.05 ? 'mid-systole' : 'mitral closure'} to mitral opening, so the VTI and the peak velocity limit each other.`);
  // the calculations, the numbers in their formulas, and their quantitative grades
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (!E.st) continue;
    const g = v.crit.q[k];
    E.cs.forEach((c) => c.classList.toggle('is-on', Number(c.dataset.i) === g));
    txt(E.st, `grade ${ROMAN[g]}`);
    E.el.dataset.l = QLEV[g];
  }
  txt(dg.qg.st, ROMAN[v.crit.qg]);
  dg.qg.el.classList.toggle('is-on', v.crit.qg === 4);
  // the specific criteria
  for (const [id, R] of Object.entries(dg.crit)) {
    const [set, k] = id.split(':'), on = v.crit[set][k];
    R.el.classList.toggle('is-on', on);
    txt(R.st, on ? 'yes' : 'no');
  }
  for (const [set, R] of Object.entries(dg.sets)) {
    const n = set === 'mild' ? v.crit.nMild : v.crit.nSevere;
    txt(R.n, `${n} of 6`);
    R.el.classList.toggle('is-on', n >= 4);
  }
  // the result
  dg.lvd.el.classList.toggle('is-on', v.crit.lvd);
  txt(dg.lvd.st, v.crit.lvd ? 'yes' : 'no');
  for (const [b, el] of Object.entries(dg.br)) el.classList.toggle('is-on', b === M.br);
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', M.lit.includes(o));
  txt(dg.head, HEAD[M.out]);
  txt(dg.sub, `${WHY[v.crit.path]}${M.out === 'severe, LV dysfunction' ? ' · stage C2' : ''}`);
  dg.result.classList.toggle('is-raised', SEVERE.has(M.out));
  dg.reset.classList.toggle('is-off', !M.mx);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.mx && !pending) freeLive();
  // the slider's label: main.js writes it when mrS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="mrS"]');
  if (o) txt(o, mrPage.format.mrS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || P.v.flail !== v.flail || P.out !== M.out || P.mx !== M.mx;
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

/** What a change crossed: the quantitative grades, the counts of specific criteria and LV dysfunction. */
const CROSS = { eroa: 'EROA', rvol: 'RVol', rf: 'RF' };
function crossed(P, M) {
  const a = P.v.crit, b = M.v.crit;
  const out = QUANT.filter((k) => a.q[k] !== b.q[k]).map((k) => withUnit(k, `${CROSS[k]} ${MR_QUANT_LABEL[k][b.q[k] - 1]}`));
  if (a.nMild !== b.nMild) out.push(`mild criteria ${b.nMild} of 6`);
  if (a.nSevere !== b.nSevere) out.push(`severe criteria ${b.nSevere} of 6`);
  if (a.lvd !== b.lvd) out.push(b.lvd ? 'LVEF ≤60% or LVESD ≥40 mm' : 'LVEF >60% and LVESD <40 mm');
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
  else what = [...(P.mx && !M.mx ? ['edits cleared'] : []), ...cut].join(', ') || 'no cut-off crossed';
  const result = P.out === M.out ? `Result unchanged: ${M.out}` : `Result: ${P.out} → ${M.out}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(P, M, cause) {
  const a = P.v.crit, b = M.v.crit;
  for (const k of QUANT) if (a.q[k] !== b.q[k]) flash(dg.eqs[k].chips);
  if (a.qg !== b.qg) flash(dg.qg.el);
  for (const [id, R] of Object.entries(dg.crit)) { const [set, k] = id.split(':'); if (a[set][k] !== b[set][k]) flash(R.el); }
  if (a.lvd !== b.lvd) flash(dg.lvd.el);
  if (P.br !== M.br && dg.br[M.br]) flash(dg.br[M.br]);
  if (P.out !== M.out || a.path !== b.path) { for (const o of M.lit) flash(dg.out[o]); flash(dg.result); }
  // an edit: the numbers it changed pulse, so each calculation shows that it follows its inputs
  if (cause.kind === 'edit' && cause.k !== 'flail') {
    flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (P.v[k] !== M.v[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (P.v[el.dataset.x] !== M.v[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentence: the result in bold, then its numbers and what defines it. */
function liveOf(v, s, cite) {
  const g = v.grade, c = v.crit, Z = cite('zoghbi2017'), O = cite('otto2020');
  if (c.path === 'none') return '<b>No mitral regurgitation.</b> The play control animates the progression of mitral regurgitation from mild to severe.';
  const nums = ` The EROA is ${fmt(v.eroa, 2)} cm², the regurgitant volume ${fmt(v.rvol)} mL and the regurgitant fraction ${fmt(v.rf)}%.`;
  const why = {
    mild: ` Of the 6 specific criteria for mild MR, ${c.nMild} are present, so the regurgitation is mild without quantitation${Z}.`,
    severe: ` Of the 6 specific criteria for severe MR, ${c.nSevere} are present${Z}.`,
    both: ` Of the specific criteria, ${c.nMild} for mild MR and ${c.nSevere} for severe MR are present. The findings disagree; TEE or CMR can quantify the regurgitation${Z}.`,
    q3s: ` The quantitative grade is III, and 3 specific criteria for severe MR are present; this combination indicates severe regurgitation${Z}.`,
  }[c.path] ?? ` The specific criteria do not decide the grade (mild ${c.nMild} of 6, severe ${c.nSevere} of 6), so the quantitative grade ${ROMAN[c.qg]} decides${Z}.`;
  // as the pulmonary vein panel and the criterion read the measured S
  const pv = v.pvS < 0 ? 'systolic flow in the pulmonary veins reverses' : v.pvS === 0 ? 'systolic flow in the pulmonary veins stops' : v.pvS < 0.05 ? 'systolic flow in the pulmonary veins is minimal' : v.sd < 1 ? 'pulmonary vein systolic flow is blunted' : 'pulmonary vein flow remains systolic-dominant';
  const stage = !SEVERE.has(g) ? '' : g === 'severe' ? ` The LVEF is ${fmt(v.ef)}% and the LV end-systolic diameter is ${fmt(v.lvesd)} mm, which corresponds to ACC/AHA stage C1 in the absence of symptoms${O}.` : ` <span class="k-red">An LVEF of ${fmt(v.ef)}% and an LV end-systolic diameter of ${fmt(v.lvesd)} mm meet at least one ACC/AHA stage C2 criterion (LVEF ≤60% or LV end-systolic diameter ≥40 mm)</span>${O}.`;
  const late = v.onset > 0.05 ? ` Because the leaflets prolapse, regurgitation begins in mid-systole, and the regurgitant volume is smaller than the EROA would predict${Z}.` : '';
  const ed = s.mx ? editedOf(s.mx) : [];
  return `<b>${LEAD[g]}.</b>${nums}${why} The LA volume index is ${fmt(v.lavi)} mL/m² and the mitral E velocity ${fmt(v.E, 2)} m/s; ${pv}.${stage}${late}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const mrPage = {
  key: 'mr',
  part: 'valves',
  title: 'Mitral regurgitation',
  nav: 'MR',
  dwell: 18,
  defaults: { mrS: 0.45, mrCine: true, mrColor: 'jet', mx: null },
  format: { mrS: (x, s) => (s?.mx ? shown(s).grade : gradeOf(x)) },
  watch: ['mrS', 'mrCine', 'mrColor', 'mx', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    paint();
    buildDiagram(document.getElementById('mr-calc'));
    subscribe?.((s, ch) => {
      // the heart sets the onset of the leak (main.js sets it first), so the grades along the slider
      if ('pheno' in ch) paint();
      // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
      // listener, not onState, so that a heart chosen on another chapter clears the edits too.
      if (s.mx && !('mx' in ch) && (KEY in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ mx: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); },
  leave() { fresh = true; freeLive(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.mrCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ mrS: 0, mrCine: true, mrColor: 'jet', mx: null }); },
  tourTick(tt, set) { set({ mrS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.mrS * 15; },
  text(s, { cite }) {
    const v = shown(s);
    const sev = SEVERE.has(v.grade);
    return {
      readouts: [
        { k: 'EROA', v: fmt(v.eroa, 2), u: 'cm²', flag: v.eroa >= 0.4 },
        { k: 'Regurgitant volume', v: fmt(v.rvol), u: 'mL', flag: v.rvol >= 60 },
        { k: 'Regurgitant fraction', v: fmt(v.rf), u: '%', flag: v.rf >= 50 },
        { k: 'LVESD', v: fmt(v.lvesd), u: 'mm', flag: v.lvesd >= 40 },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: sev && v.ef <= 60 },
        { k: 'Grade', v: v.grade, text: true, flag: sev },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default mrPage;
