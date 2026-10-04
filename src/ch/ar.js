// Aortic regurgitation: one slider from no leak to severe chronic AR with LV dilation and
// dysfunction. The leak drives the volume numbers; the pressure half-time shortens, flow
// reverses in the descending aorta, and the LV dilates. Illustrative values in ASE 2017 bands.
// The text holds the calculations as a diagram (Zoghbi 2017 Figure 25), with ▲▼ buttons on
// eleven measurements and switches for the flow convergence and a flail valve. The volumetric
// method gives the regurgitant volume (LVOT minus mitral stroke volume), the fraction and the
// EROA (volume ÷ AR VTI). An edit stores the measurements in arx; the slider then marks a band of
// their result and does not change them. A move of the slider, Play, the tour or a heart's preset
// clears arx, and the values follow the slider again.
import { Sheet, clamp } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { AR_MILD, AR_SEVERE, AR_QUANT_LABEL, arIntegrated } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit } from '../sev.js';
import { drawPLAX, plaxLV, cal, measures } from '../echo2d.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';
import { numOf } from '../order.js';
import { JETS } from '../jets.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-ar .live', btn, fn);
/** The slider for result g (edits.js): where it is if that is in a band of g, else the middle of the nearest band of g. */
const slideTo = (x, g) => slideOf(x, g, BANDS);

const KEY = 'arS';
const EDITS = 'arx';
const LVOT = 2.1;                          // cm, the model's LVOT diameter
const V0 = 4.4;                            // m/s, the model's AR velocity at aortic closure
const TD = RR + EV.avo - EV.avc;           // ms, the jet: aortic closure to the next aortic opening

// The model's severity x, the EROA of the earlier model (before the volumetric method), and its
// tracks: each parameter crosses its ASE 2017 cut-off where x crosses 0.10 and 0.30. The
// regurgitant volume (mL) meets 30 and 60 mL there, and the forward volume (mL) puts the
// regurgitant fraction at 30% and 50%. The EROA on screen is the volume ÷ the AR VTI of the CW
// envelope, so it reaches its own cut-offs a little before the volume does.
const xOf = mono([[0, 0], [0.08, 0.03], [0.3, 0.1], [0.52, 0.3], [0.8, 0.42], [1, 0.5]]);
const perX = mono([[0, 300], [0.1, 300], [0.3, 200], [0.5, 170]]);
const rvolOf = (x) => x * perX(x);
const fwdOf = mono([[0, 70], [0.1, 70], [0.3, 60], [0.5, 57]]);
// the vena contracta (cm: 0.3, >0.6) and the jet width in the LVOT (%: 25, 65) through the same cut pairs
const vcOf = mono([[0, 0], [0.1, 0.3], [0.3, 0.61], [0.5, 0.8]]);
const ratioOf = mono([[0, 0], [0.1, 25], [0.3, 65], [0.5, 80]]);
const phtOf = mono([[0, 700], [0.03, 640], [0.1, 500], [0.3, 199.4], [0.5, 140]]);
const edvOf = mono([[0, 0], [0.03, 3], [0.1, 10], [0.25, 15], [0.3, 20], [0.5, 30]]);
const TR = tracks([0, 0.3, 0.52, 0.8, 1], {
  lvedd: [4.8, 5.1, 6.0, 6.7, 7.1],
  lvesd: [3.0, 3.2, 3.9, 4.9, 5.4],
  ef: [62, 62, 60, 56, 50],
  sbp: [120, 126, 138, 148, 150],
  dbp: [78, 72, 60, 50, 45],
  wall: [0.9, 0.95, 1.0, 1.05, 1.05],
  la: [3.2, 3.3, 3.5, 3.8, 4.0],
});
/** The flow convergence of the model: small below x 0.10 and large from 0.30 (regurgitant volume 30 and 60 mL). */
const convOf = (x) => (x < 0.1 ? 'small' : x < 0.3 ? 'intermediate' : 'large');

// ---------------------------------------------------------------- the CW envelope
// The jet over diastole: v = V0 × 2^(-t / (2 PHT)), with an 18 ms rise. Its VTI is V0 × D(PHT),
// D the integral of the shape (s). So the VTI and the half-time set the peak velocity, and the
// buttons keep that within V_LO to V_HI.
const V_LO = 3.0, V_HI = 6.0;
const memo = new Map();
function decay(pht) {
  const key = pht.toFixed(3);
  let d = memo.get(key);
  if (d === undefined) {
    d = 0;
    const n = 400;
    for (let i = 0; i < n; i++) { const t = ((i + 0.5) * TD) / n; d += Math.pow(2, -t / (2 * pht)) * Math.min(1, t / 18); }
    d *= TD / n / 1000;
    if (memo.size > 4000) memo.clear();
    memo.set(key, d);
  }
  return d;
}
/** The half-time (ms) at which the shape integrates to d (s); the integral grows with the half-time. */
function phtFor(d) {
  let lo = 20, hi = 20000;
  for (let k = 0; k < 50; k++) { const m = Math.sqrt(lo * hi); if (decay(m) < d) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}

// ---------------------------------------------------------------- the model
/** The model at slider position s: its measurements before rounding, and the rest of the heart. */
function modelAt(s) {
  const m = TR(s);
  m.s = s;
  const x = round(xOf(s), 2);
  m.x = x;
  m.fwd = fwdOf(x);
  m.lvotD = LVOT;
  // the LVOT carries the forward and the regurgitant volume
  m.lvotVti = (round(m.fwd, 0) + round(rvolOf(x), 0)) / round(Math.PI * (LVOT / 2) ** 2, 2);
  m.pht = phtOf(x);
  m.vti = 100 * V0 * decay(round(m.pht, 0));
  m.vc = vcOf(x);
  m.jet = ratioOf(x);
  m.edv = edvOf(x);
  m.lvedd *= 10;    // mm, as the criteria
  m.lvesd *= 10;
  m.conv = convOf(x);
  m.flail = false;
  return m;
}

/** The eleven measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  vc: { d: 2, step: 0.05, min: 0, max: 1.2 },
  jet: { d: 0, step: 5, min: 0, max: 100 },
  lvotVti: { d: 1, step: 1, min: 10, max: 50 },
  fwd: { d: 0, step: 2, min: 30, max: 100 },
  vti: { d: 0, step: 10, min: 100, max: 300 },
  pht: { d: 0, step: 25, min: 100, max: 800 },
  edv: { d: 0, step: 2, min: 0, max: 40 },
  lvotD: { d: 1, step: 0.1, min: 1.6, max: 2.8 },
  lvedd: { d: 0, step: 1, min: 40, max: 80 },
  lvesd: { d: 0, step: 1, min: 25, max: 70 },
  ef: { d: 0, step: 5, min: 20, max: 75 },
};
const IN = Object.keys(INPUTS);
/** The switches: their values, in order. */
const SWITCH = { conv: ['small', 'intermediate', 'large'], flail: [false, true] };
const DEC = { area: 2, sv: 0, rvol: 0, rf: 0, eroa: 2, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };
const areaOf = (d) => round(Math.PI * (d / 2) ** 2, 2);
const svOf = (d, vti) => round(areaOf(d) * vti, 0);

/**
 * The limits of measurement k at the values v. The LV diameters stay 5 mm apart. The mitral
 * stroke volume stays at most the LVOT stroke volume, so the regurgitant volume is never below 0.
 * The AR VTI and the pressure half-time keep the peak velocity of the envelope within 3–6 m/s.
 */
function limits(k, v) {
  const I = INPUTS[k];
  const up = (x, st) => Math.ceil(x / st - 1e-9) * st, down = (x, st) => Math.floor(x / st + 1e-9) * st;
  switch (k) {
    case 'lvedd': return { ...I, min: Math.max(I.min, v.lvesd + 5) };
    case 'lvesd': return { ...I, max: Math.min(I.max, v.lvedd - 5) };
    case 'fwd': return { ...I, max: Math.min(I.max, down(svOf(v.lvotD, v.lvotVti), I.step)) };
    case 'lvotVti': {
      let lo = I.min;
      while (lo < I.max && svOf(v.lvotD, lo) < v.fwd) lo = round(lo + 0.1, 1);
      return { ...I, min: lo };
    }
    case 'lvotD': {
      let lo = I.min;
      while (lo < I.max && svOf(lo, v.lvotVti) < v.fwd) lo = round(lo + 0.1, 1);
      return { ...I, min: lo };
    }
    case 'vti': {
      const D = decay(v.pht);
      return { ...I, min: Math.max(I.min, up(100 * V_LO * D, I.step)), max: Math.min(I.max, down(100 * V_HI * D, I.step)) };
    }
    case 'pht':
      return { ...I, min: Math.max(I.min, up(phtFor(v.vti / (100 * V_HI)), I.step)), max: Math.min(I.max, down(phtFor(v.vti / (100 * V_LO)), I.step)) };
    default: return I;
  }
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
  v.area = areaOf(v.lvotD);
  v.sv = round(v.area * v.lvotVti, 0);
  v.rvol = Math.max(0, v.sv - v.fwd);
  v.rf = v.sv > 0 ? round((100 * v.rvol) / v.sv, 0) : 0;
  v.eroa = v.vti > 0 ? round(v.rvol / v.vti, 2) : 0;
  v.lvesdi = round(v.lvesd / BSA, 0);   // mm/m², as the ACC/AHA criterion
  v.v0 = v.vti / (100 * decay(v.pht));  // m/s, the peak of the CW envelope
  v.leak = v.vc > 0 || v.jet > 0 || v.rvol > 0;
  v.crit = arIntegrated(v);
  v.grade = v.crit.grade;
  return v;
}

/** The values on screen, from the store: the edited measurements (arx), or the model's at the slider. */
function shownOf(s) {
  if (!s[EDITS]) return measure(modelAt(s[KEY]));
  const v = modelAt(s[EDITS].base);
  for (const k of [...IN, ...Object.keys(SWITCH)]) v[k] = s[EDITS][k];
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

// the results: their level (the colour of their band), the bold lead of the live sentence, and
// the line under it in the diagram
const LEV = { ...LEVEL, 'severe, LV dysfunction': 4 };
const LEAD = {
  none: 'No aortic regurgitation', mild: 'Mild aortic regurgitation', moderate: 'Moderate aortic regurgitation', severe: 'Severe aortic regurgitation',
  'severe, LV dysfunction': 'Severe aortic regurgitation with LV dysfunction', indeterminate: 'Aortic regurgitation of indeterminate grade',
};
const HEAD = {
  none: 'No regurgitation', mild: 'Mild regurgitation', moderate: 'Moderate regurgitation', severe: 'Severe regurgitation',
  'severe, LV dysfunction': 'Severe regurgitation, LV dysfunction', indeterminate: 'Indeterminate grade',
};
const WHY = {
  none: 'no vena contracta, jet or regurgitant volume', mild: '≥4 specific criteria for mild AR', severe: '≥4 specific criteria for severe AR',
  both: '≥4 specific criteria for mild and for severe AR', q1: 'quantitative grade I', q2: 'quantitative grade II', q3: 'quantitative grade III',
  q3s: 'grade III and 3 specific criteria for severe AR', q4: 'quantitative grade IV',
};
const SEVERE = new Set(['severe', 'severe, LV dysfunction']);
let BANDS = [];

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;
// diastole for AR: aortic closure to the next aortic opening
const diaFrac = (t) => {
  const tt = t < EV.avo ? t + RR : t;
  return (tt - EV.avc) / TD;
};

// ---------------------------------------------------------------- the figure
/** Labels the figure adds for a switch: a flail valve, or a flow convergence set by hand. */
function tagsOf(v) {
  const out = [];
  if (v.flail) out.push(['flail valve', 'flail']);
  if (v.conv !== convOf(v.x)) out.push([`flow convergence: ${v.conv}`, `PISA: ${v.conv}`]);
  return out;
}

function plax(ctx, box, v, t) {
  const g = {
    ivs: [v.wall, v.wall * 1.5], pw: [v.wall, v.wall * 1.5], lvid: [v.lvedd / 10, v.lvesd / 10], rvd: 2.6,
    la: [v.la * 0.88, v.la], root: 3.3, lvot: v.lvotD, av: { thick: 0.12, open: v.lvotD - 0.1, gap: v.leak ? Math.min(0.3, v.vc * 0.45) : 0 },
  };
  const u = diaFrac(t);
  const a = u > 0.02 && u < 0.98 ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.25) : 0;
  // the jet slows through diastole as the CW trace does; it is widest where the jet/LVOT
  // caliper reads it, just below the valve
  const u0 = v.v0 * 100 * Math.pow(2, -(u * TD) / (2 * v.pht)), jl = 2.2 + 9 * v.eroa;
  const jw = (v.jet / 100) * v.lvotD;
  // with no regurgitant volume the jet is drawn from the flow through its vena contracta
  const pisa = v.eroa > 0, q = pisa ? v.eroa * v.v0 * 100 : Math.PI * (Math.max(v.vc, 0.24) / 2) ** 2 * v.v0 * 100;
  const after = (c, F, geo) => {
    plaxLV(c, geo);
    if (v.leak && a > 0.4) {
      const x = geo.xAnn - 0.7;
      cal(c, F, geo.R([x, geo.aoMid - jw / 2]), geo.R([x, geo.aoMid + jw / 2]), '', { solid: true });
    }
    measures(c, F, [`LVOT ${v.lvotD.toFixed(1)} cm`, `LVIDd ${v.lvedd} mm`, `LVIDs ${v.lvesd} mm`, `jet/LVOT ${v.jet}%`, ...tagsOf(v)]);
  };
  const title = fit(box.w, 'PARASTERNAL LONG AXIS · COLOR 60 cm/s', 'PLAX · COLOR 60');
  if (JETS === 'plume') {
    drawPLAX(ctx, box, g, { t, depth: 15 + 1.6 * v.s, title, jets: v.leak ? { ar: { q, va: 60, vc: v.vc, jl, jw, a, pisa } } : {}, after });
    return;
  }
  drawPLAX(ctx, box, g, {
    t, depth: 15 + 1.6 * v.s, title,
    color: {
      roi: 'lvot', lo: -60, hi: 60, variance: true,
      ar: v.leak ? { q: (q * u0) / (v.v0 * 100), u0, vc: v.vc, jl, jw, a, pk: clamp(0.8 / jl, 0.1, 0.4), open: 0.45, fit: 'width' } : null,
    },
    after,
  });
}

/** AR jet, CW from the apex: toward the probe through diastole, falling with the half-time. */
function arCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · AORTIC REGURGITATION', 'CW · AR'));
  const bx = inner(P);
  const dens = q2(clamp(v.rvol / 60, 0.06, 1)), vs = Math.max(6, Math.ceil(v.v0 + 0.6));
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    const since = t < EV.avo ? t + RR - EV.avc : t - EV.avc;
    if (since < 0 || since > TD || !v.leak) return 0;
    const rise = Math.min(1, since / 18);
    return v.v0 * Math.pow(2, -since / (2 * v.pht)) * rise;
  };
  spectral(ctx, bx, { fn, scale: vs, base: 0.94, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `arcw|${v.leak}|${v.v0.toFixed(3)}|${v.pht}|${dens}|${vs}`, seed: 31 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, vs, 0.94, 1);
  if (v.leak) {
    // the half-time: from the peak to the point where velocity is peak / sqrt 2
    const k = (bx.h * 0.94) / vs, y0 = bx.y + bx.h * 0.94;
    const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
    const t0 = EV.avc + 18;
    const x0 = X(t0), x1 = X(t0 + Math.min(v.pht, TD - 20));
    const v1 = v.v0 * Math.pow(2, -Math.min(v.pht, TD - 20) / (2 * v.pht));
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - v.v0 * k);
    ctx.lineTo(x1, y0 - v1 * k);
    ctx.stroke();
    ctx.restore();
    caliper(ctx, x0, y0 - v.v0 * k - 10, x1, y0 - v.v0 * k - 10, { solid: true });
  }
  const dn = v.rvol >= 30 ? 'dense' : 'faint';
  note(ctx, bx, v.leak ? [`peak ${v.v0.toFixed(1)} m/s · PHT ${v.pht} ms · VTI ${v.vti} cm · ${dn}`, `PHT ${v.pht} ms · VTI ${v.vti} cm`, `PHT ${v.pht} ms`] : 'no regurgitation', 'top');
  return bx;
}

/**
 * Proximal descending aorta, PW from the suprasternal notch: diastolic flow reversal. The label
 * follows the EACVI bands (Lancellotti 2022): holodiastolic from an end-diastolic velocity of
 * 10 cm/s, prominent from 20 cm/s.
 */
function daoPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · DESCENDING AORTA', 'PW · DESC. AORTA'));
  const bx = inner(P);
  const edv = v.edv / 100;               // m/s
  const early = 0.16 + edv * 0.9;
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    if (t >= EV.avo && t < EV.avc + 10) {
      const w = (t - EV.avo) / (EV.avc + 10 - EV.avo);
      return -1.0 * Math.pow(Math.sin(Math.PI * Math.pow(w, 0.75)), 0.8);
    }
    const since = t >= EV.avc + 10 ? t - EV.avc - 10 : t + RR - EV.avc - 10;
    if (!v.leak) return since < 90 ? 0.12 * Math.sin((Math.PI * since) / 90) : 0;
    const decayV = edv > 0.005 ? edv + (early - edv) * Math.exp(-since / 110) : early * Math.exp(-since / 70);
    return decayV * Math.min(1, since / 25);
  };
  spectral(ctx, bx, { fn, scale: 1.4, base: 0.45, mode: 'pw', broad: 0.15, key: `dao|${v.edv}|${v.leak}`, seed: 32 });
  vscale(ctx, bx, 1.4, 0.45, 0.5, '');
  if (v.leak) {
    const k = (bx.h * 0.55) / 1.4, y0 = bx.y + bx.h * 0.45;
    const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
    if (edv > 0.02) caliper(ctx, X(RR - 6), y0, X(RR - 6), y0 - edv * k, { solid: true, size: 3 });
  }
  note(ctx, bx, !v.leak ? 'no diastolic reversal' : [v.edv >= 20 ? `prominent holodiastolic reversal · end-diastolic ${v.edv} cm/s` : v.edv >= 10 ? `holodiastolic reversal · end-diastolic ${v.edv} cm/s` : 'brief early diastolic reversal', `end-diastolic ${v.edv} cm/s`], 'top');
  return bx;
}

/** LVOT, PW from the apex: forward plus regurgitant volume, so the VTI rises. */
function lvotPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · LVOT');
  const bx = inner(P);
  const vti = v.lvotVti;
  const ET = EV.avc - EV.avo;
  const shape = (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.8) : 0);
  const f = 0.6;                                      // mean of the shape over ejection
  const vpk = vti / ((ET / 1000) * f);               // cm/s
  const vs = Math.max(3, Math.ceil(vpk / 100 + 0.4));
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    return -(vpk / 100) * shape((t - EV.avo) / ET);
  };
  spectral(ctx, bx, { fn, scale: vs, base: 0.1, mode: 'pw', broad: 0.1, key: `arlvot|${vti}|${vs}`, seed: 33 });
  vscale(ctx, bx, vs, 0.1, 1);
  note(ctx, bx, [`VTI ${vti.toFixed(1)} cm · peak ${(vpk / 100).toFixed(1)} m/s`, `VTI ${vti.toFixed(1)} cm`], 'bottom');
  return bx;
}

function meterItems(v) {
  return [
    { k: 'EROA', v: v.eroa, u: 'cm²', d: 2, lo: 0, hi: 0.6, cuts: [[0.1, '0.10'], [0.3, '0.30']], bad: v.eroa >= 0.3 },
    { k: 'Regurgitant volume', v: v.rvol, u: 'mL', lo: 0, hi: 110, cuts: [[30, '30'], [60, '60']], bad: v.rvol >= 60 },
    { k: 'Regurgitant fraction', v: v.rf, u: '%', lo: 0, hi: 70, cuts: [[30, '30'], [50, '50']], bad: v.rf >= 50 },
    { k: 'Vena contracta', v: v.vc, u: 'cm', d: 2, lo: 0, hi: 1.0, cuts: [[0.3, '0.3'], [0.6, '0.6']], bad: v.vc > 0.6 },
    { k: 'Jet width / LVOT', v: v.jet, u: '%', lo: 0, hi: 100, cuts: [[25, '25'], [65, '65']], bad: v.jet >= 65 },
    { k: 'Pressure half-time', v: v.pht, u: 'ms', lo: 100, hi: 800, cuts: [[200, '200'], [500, '500']], bad: v.pht < 200 },
    { k: 'Desc. aorta end-diastolic', v: v.edv, u: 'cm/s', lo: 0, hi: 40, cuts: [[20, '20']], bad: v.edv >= 20 },
    { k: 'LV end-diastolic diameter', v: v.lvedd, u: 'mm', lo: 40, hi: 75, norm: [42, 58], cuts: [[65, '65']], bad: v.lvedd > 58 },
    { k: 'LV end-systolic diameter', v: v.lvesd, u: 'mm', lo: 20, hi: 60, cuts: [[50, '50']], bad: v.lvesd > 50 },
    { k: 'LVEF', v: v.ef, u: '%', lo: 30, hi: 75, norm: [52, 72], cuts: [[55, '55']], bad: v.ef <= 55 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(st.arCine, 640);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    plax(ctx, a, v, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [arCW(ctx, p1, v), daoPW(ctx, p2, v)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  plax(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [p1, p2, p3] = rows(colR, [1.1, 1, 1], 10);
  for (const bx of [arCW(ctx, p1, v), daoPW(ctx, p2, v), lvotPW(ctx, p3, v)]) cursor(ctx, bx, beat.sweep);
}

// ---------------------------------------------------------------- the calculations in the text
// From the measurements (▲▼) through the volumetric method to the quantitative grades and the
// specific criteria of Figure 25, and to the result. Each change flashes where it acts.
const NAME = {
  vc: 'Vena contracta', jet: 'Jet width / LVOT', conv: 'Flow convergence', lvotVti: 'LVOT VTI', fwd: 'Mitral stroke volume', vti: 'AR VTI',
  pht: 'Pressure half-time', edv: 'Desc. aorta end-diastolic', lvotD: 'LVOT diameter', lvedd: 'LVEDD', lvesd: 'LVESD', ef: 'LVEF', flail: 'Flail valve',
  area: 'LVOT area', sv: 'LVOT stroke volume', rvol: 'Regurgitant volume', rf: 'Regurgitant fraction', eroa: 'EROA',
};
const UNIT = {
  vc: 'cm', jet: '%', lvotVti: 'cm', fwd: 'mL', vti: 'cm', pht: 'ms', edv: 'cm/s', lvotD: 'cm', lvedd: 'mm', lvesd: 'mm', ef: '%',
  area: 'cm²', sv: 'mL', rvol: 'mL', rf: '%', eroa: 'cm²',
};
const ARIA = {
  vc: 'vena contracta width', jet: 'jet width as a percentage of the LVOT diameter', lvotVti: 'LVOT velocity-time integral', fwd: 'mitral stroke volume',
  vti: 'AR velocity-time integral', pht: 'pressure half-time', edv: 'end-diastolic velocity in the descending aorta', lvotD: 'LVOT diameter',
  lvedd: 'LV end-diastolic diameter', lvesd: 'LV end-systolic diameter', ef: 'LVEF',
};
/** The labels of the switches' buttons. */
const SWITCH_LABEL = { conv: ['Small', 'Intermediate', 'Large'], flail: ['No', 'Yes'] };
/** The measurements in the groups of the diagram: color Doppler, spectral Doppler, 2D. */
const GROUPS = [
  ['color', 'Color Doppler', 'jet at 50–70 cm/s', ['vc', 'jet', 'conv']],
  ['spec', 'Spectral Doppler', 'PW in the LVOT and at the mitral annulus; CW through the jet; PW in the descending aorta', ['lvotVti', 'fwd', 'vti', 'pht', 'edv']],
  ['twod', '2D', 'LVOT, LV diameters, LVEF and the valve', ['lvotD', 'lvedd', 'lvesd', 'ef', 'flail']],
];
/** The names in the change line: the cause, and its effects. */
const EFFECT = { area: 'LVOT area', sv: 'LVOT stroke volume', rvol: 'regurgitant volume', rf: 'regurgitant fraction', eroa: 'EROA' };
/** What each measurement changes, first the values that grade the leak. */
const EFFECTS = { lvotD: ['rvol', 'rf', 'eroa', 'sv', 'area'], lvotVti: ['rvol', 'rf', 'eroa', 'sv'], fwd: ['rvol', 'rf', 'eroa'], vti: ['eroa'] };
/** Each formula, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  area: ['π × (LVOT diameter ÷ 2)²', ['π × (', { k: 'lvotD' }, ' ÷ 2)²']],
  sv: ['LVOT area × LVOT VTI', [{ k: 'area' }, ' × ', { k: 'lvotVti' }]],
  rvol: ['LVOT stroke volume − mitral stroke volume', [{ k: 'sv' }, ' − ', { k: 'fwd' }]],
  rf: ['RVol ÷ LVOT stroke volume', [{ k: 'rvol' }, ' ÷ ', { k: 'sv' }]],
  eroa: ['RVol ÷ AR VTI', [{ k: 'rvol' }, ' ÷ ', { k: 'vti' }]],
};
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { lvotD: 3, area: 4, lvotVti: 4, sv: 3, fwd: 3, rvol: 3, vti: 3 };
const QUANT = ['rvol', 'rf', 'eroa'];
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
const CRIT_NOTE = 'Figure 25 gives no number for five criteria. The flow convergence is the observer’s call; the model calls it small below a regurgitant volume of 30 mL and large from 60 mL, where its other signs cross their cut-offs. A soft CW jet is a jet that the figure draws faint, at a regurgitant volume below 30 mL. A normal LV size uses the upper limit for men<span class="cite" data-ref="lang2015"></span>. Normal LV function is an LVEF above 55%, because an LVEF ≤55% is LV dysfunction in AR<span class="cite" data-ref="otto2020"></span>. Prominent holodiastolic reversal has an end-diastolic velocity ≥20 cm/s<span class="cite" data-ref="lancellotti2022"></span>.';
const QUANT_NOTE = 'Figure 25 gives no rule when the three measures fall in different grades. The diagram uses the middle grade of the three.';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (k === 'flail' ? (x ? 'yes' : 'no') : k === 'conv' ? x : x.toFixed(DEC[k]));
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
      ${keys.map(input).join('')}${s === 'spec' ? '<p class="ase-note asx-note rgx-dur"></p>' : s === 'twod' ? '<p class="ase-note asx-note rgx-idx"></p>' : ''}
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k]}ch"></i>`)).join('');
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${AR_QUANT_LABEL[k].map((lab, i) => `<span class="asx-c" data-i="${i + 1}" data-l="${QLEV[i + 1]}">${ROMAN[i + 1]} ${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${QUANT.includes(k) ? '<span class="asx-st"></span>' : ''}</p>
      <p class="asx-f"><span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span></p>
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
    <div class="ase-step is-on asx-step" data-s="quant">
      <p class="ase-sh"><span class="ase-sn">Quantitation</span><span class="ase-sx">Volumetric method and the ASE grades I to IV<span class="cite" data-ref="zoghbi2017"></span></span><a class="asx-go" href="#pressure" data-go="pressure" aria-label="The stroke volume: chapter ${numOf('pressure')}, Doppler hemodynamics">${numOf('pressure')} Pressure →</a></p>
      ${['area', 'sv', ...QUANT].map(eq).join('')}
      <p class="asx-q rgx-qg"><span class="asx-qn">Quantitative grade</span><span class="asx-qr">the middle grade of the three</span><span class="asx-qs"></span></p>
      <p class="ase-note asx-note">${QUANT_NOTE}</p>
    </div>
    <div class="ase-step is-on asx-step" data-s="crit">
      <p class="ase-sh"><span class="ase-sn">Specific criteria</span><span class="ase-sx">ASE algorithm for chronic AR<span class="cite" data-ref="zoghbi2017"></span></span></p>
      ${set('mild', 'For mild AR', AR_MILD)}${set('severe', 'For severe AR', AR_SEVERE)}
      <p class="ase-note asx-note">${CRIT_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">ASE algorithm and ACC/AHA stage<span class="cite" data-ref="zoghbi2017,otto2020"></span></span></p>
      ${OUTS.map(([b, name, outs]) => `<div class="asx-br" data-b="${b}"><p class="asx-bl">${name}</p><p class="asx-os">${outs.map(([o, lab]) => `<span class="ase-o" data-o="${o}"${SEV_OUT.has(o) ? ' data-sev' : ''}>${lab}</span>`).join('')}</p></div>`).join('')}
      <p class="asx-q" data-q="lvd"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">LV dysfunction</span><span class="asx-qr">LVEF ≤55%, LVESD &gt;50 mm or &gt;25 mm/m²; in severe AR, stage C2</span><span class="asx-qs"></span></p>
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'), dur: q('.rgx-dur'), idx: q('.rgx-idx'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    sw: Object.fromEntries(Object.keys(SWITCH).map((k) => [k, { el: q(`[data-row="${k}"]`), bs: [...host.querySelectorAll(`[data-row="${k}"] button`)] }])),
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    qg: { el: q('.rgx-qg'), st: q('.rgx-qg .asx-qs') },
    sets: Object.fromEntries([...host.querySelectorAll('.rgx-set')].map((el) => [el.dataset.set, { el, n: el.querySelector('.ase-count'), of: Number(el.dataset.n) }])),
    crit: Object.fromEntries([...host.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, { el, st: el.querySelector('.asx-qs') }])),
    lvd: { el: q('[data-q="lvd"]'), st: q('[data-q="lvd"] .asx-qs') },
    br: Object.fromEntries([...host.querySelectorAll('.asx-br')].map((el) => [el.dataset.b, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, b.dataset.i !== undefined ? SWITCH[b.dataset.k][Number(b.dataset.i)] : Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements and the switches of the values v, as arx stores them. */
const valsOf = (v) => Object.fromEntries([...IN, ...Object.keys(SWITCH)].map((k) => [k, v[k]]));

/** The keys of arx that differ from the model's values where the edits started. */
function editedOf(ed) {
  const m = measure(modelAt(ed.base));
  return [...IN.filter((k) => Math.abs(ed[k] - m[k]) > 1e-9), ...Object.keys(SWITCH).filter((k) => ed[k] !== m[k])];
}

const freeLive = () => { const live = document.querySelector('#ch-ar .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

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
  txt(dg.dur, `The jet lasts ${Math.round(TD)} ms, from aortic closure to aortic opening. Its VTI and pressure half-time give its peak velocity, ${v.v0.toFixed(1)} m/s, which the buttons keep within ${V_LO.toFixed(1)}–${V_HI.toFixed(1)} m/s.`);
  txt(dg.idx, `LVESD index ${v.lvesdi} mm/m² (LVESD ÷ BSA ${BSA.toFixed(2)} m²).`);
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
    txt(R.n, `${n} of ${R.of}`);
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
  dg.reset.classList.toggle('is-off', !M.ed);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.ed && !pending) freeLive();
  // the slider's label: main.js writes it when arS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="arS"]');
  if (o) txt(o, arPage.format.arS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || Object.keys(SWITCH).some((k) => P.v[k] !== v[k]) || P.out !== M.out || P.ed !== M.ed;
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
const CROSS = { rvol: 'RVol', rf: 'RF', eroa: 'EROA' };
function crossed(P, M) {
  const a = P.v.crit, b = M.v.crit;
  const out = QUANT.filter((k) => a.q[k] !== b.q[k]).map((k) => withUnit(k, `${CROSS[k]} ${AR_QUANT_LABEL[k][b.q[k] - 1]}`));
  if (a.nMild !== b.nMild) out.push(`mild criteria ${b.nMild} of 6`);
  if (a.nSevere !== b.nSevere) out.push(`severe criteria ${b.nSevere} of 7`);
  if (a.lvd !== b.lvd) out.push(b.lvd ? 'LVEF ≤55%, LVESD >50 mm or >25 mm/m²' : 'LVEF >55%, LVESD ≤50 mm and ≤25 mm/m²');
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
  if (a.qg !== b.qg) flash(dg.qg.el);
  for (const [id, R] of Object.entries(dg.crit)) { const [set, k] = id.split(':'); if (a[set][k] !== b[set][k]) flash(R.el); }
  if (a.lvd !== b.lvd) flash(dg.lvd.el);
  if (P.br !== M.br && dg.br[M.br]) flash(dg.br[M.br]);
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
  const g = v.grade, c = v.crit, Z = cite('zoghbi2017'), O = cite('otto2020');
  if (c.path === 'none') return '<b>No aortic regurgitation.</b> The play control animates the progression of aortic regurgitation from mild to severe.';
  const nums = ` The regurgitant volume is ${fmt(v.rvol)} mL, the regurgitant fraction ${fmt(v.rf)}% and the EROA ${fmt(v.eroa, 2)} cm²; the jet width is ${fmt(v.jet)}% of the LVOT diameter, and the pressure half-time is ${fmt(v.pht)} ms.`;
  const why = {
    mild: ` Of the 6 specific criteria for mild AR, ${c.nMild} are present, so the regurgitation is mild without quantitation${Z}.`,
    severe: ` Of the 7 specific criteria for severe AR, ${c.nSevere} are present${Z}.`,
    both: ` Of the specific criteria, ${c.nMild} for mild AR and ${c.nSevere} for severe AR are present. The findings disagree; TEE or CMR can quantify the regurgitation${Z}.`,
    q3s: ` The quantitative grade is III, and 3 specific criteria for severe AR are present; this combination indicates severe regurgitation${Z}.`,
  }[c.path] ?? ` The specific criteria do not decide the grade (mild ${c.nMild} of 6, severe ${c.nSevere} of 7), so the quantitative grade ${ROMAN[c.qg]} decides${Z}.`;
  const lv = ` The LV receives and ejects the forward and the regurgitant volume (LVOT VTI ${fmt(v.lvotVti, 1)} cm, LV end-diastolic diameter ${fmt(v.lvedd)} mm); the blood pressure is ${fmt(v.sbp)}/${fmt(v.dbp)} mmHg.`;
  const stage = !SEVERE.has(g) ? '' : g === 'severe'
    ? ` With an LVEF of ${fmt(v.ef)}% and an LV end-systolic diameter of ${fmt(v.lvesd)} mm, severe aortic regurgitation is ACC/AHA stage C1 in the absence of symptoms${O}.`
    : ` <span class="k-red">An LVEF of ${fmt(v.ef)}% and an LV end-systolic diameter of ${fmt(v.lvesd)} mm (${fmt(v.lvesdi)} mm/m²) meet at least one ACC/AHA stage C2 criterion (LVEF ≤55%, end-systolic diameter >50 mm or >25 mm/m²)</span>${O}.`;
  const ed = s[EDITS] ? editedOf(s[EDITS]) : [];
  return `<b>${LEAD[g]}.</b>${nums}${why}${lv}${stage}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const arPage = {
  key: 'ar',
  part: 'valves',
  title: 'Aortic regurgitation',
  nav: 'AR',
  dwell: 18,
  defaults: { arS: 0.45, arCine: true, [EDITS]: null },
  format: { arS: (x, s) => (s?.[EDITS] ? shown(s).grade : gradeOf(x)) },
  watch: ['arS', 'arCine', EDITS],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = bands((x) => gradeOf(x));
    paintBands(document.getElementById('ar-grades'), BANDS, LEV, { 'severe, LV dysfunction': 'LV dysf.' });
    buildDiagram(document.getElementById('ar-calc'));
    // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
    // listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (s[EDITS] && !(EDITS in ch) && (KEY in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ [EDITS]: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); },
  leave() { fresh = true; freeLive(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.arCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ arS: 0, arCine: true, [EDITS]: null }); },
  tourTick(tt, set) { set({ arS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.arS * 15; },
  text(s, { cite }) {
    const v = shown(s);
    const sev = SEVERE.has(v.grade);
    return {
      readouts: [
        { k: 'EROA', v: fmt(v.eroa, 2), u: 'cm²', flag: v.eroa >= 0.3 },
        { k: 'Regurgitant volume', v: fmt(v.rvol), u: 'mL', flag: v.rvol >= 60 },
        { k: 'Pressure half-time', v: fmt(v.pht), u: 'ms', flag: v.pht < 200 },
        { k: 'LVESD', v: fmt(v.lvesd), u: 'mm', flag: v.lvesd > 50 },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.ef <= 55 },
        { k: 'Grade', v: v.grade, text: true, flag: sev },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default arPage;
