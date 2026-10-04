// Mitral stenosis: one slider from a normal mitral valve to severe rheumatic stenosis. The
// area sets the pressure half-time (220 / area) and, with the heart rate, the mean gradient;
// the LA enlarges, the pulmonary pressure rises, the RV follows. Illustrative values.
// The text holds the measurements as a diagram (Pandian 2023 Table 1), with ▲▼ buttons on four
// measurements and a switch for the RA pressure: the area by planimetry, which gives the grade;
// the pressure half-time and the area it gives (220 ÷ PHT); the mean gradient at the heart rate
// of the slider; and the PA systolic pressure. An edit stores the measurements in msx; the slider
// then marks a band of their result and does not change them. A move of the severity slider,
// Play, the tour or a heart's preset clears msx. The heart-rate slider does not: the mean
// gradient follows it, with the cardiac output held unless the stroke volume was edited.
import { Sheet, clamp } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { MS_BANDS, msIntegrated } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit, shown as shownAt } from '../sev.js';
import { drawA4C, drawPSAXmv, measures, shownMitralThick, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { laWeight, rvGrowOf, msWeights, mvOwnThick } from '../meshcal.js';
import { onPlane, hingesOf, closureOf, blood, cavity, enFaceOrifice, middle, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';
import { numOf } from '../order.js';
import { JETS } from '../jets.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-ms .live', btn, fn);
/** The slider for result g (edits.js): where it is if that is in a band of g, else the middle of the nearest band of g. */
const slideTo = (x, g) => slideOf(x, g, BANDS);

const KEY = 'msS';
const EDITS = 'msx';
const CO = 70 * 70;   // mL/min, the model's cardiac output: 70 mL at 70/min, held as the heart rate changes
const mean = (fn, n = 400) => { let a = 0; for (let i = 0; i < n; i++) a += fn((i + 0.5) / n); return a / n; };

/**
 * Mitral inflow for a stenotic valve: the pressure half-time (220 / area unless given) sets the
 * deceleration, and the peak velocity carries the stroke volume through the area in the filling
 * period, so the gradient rises with heart rate.
 */
export function mitral({ mva, sv, hr, pht = 220 / mva }) {
  const RRms = 60000 / hr;
  const qs2 = 541 - 2.2 * hr;                                // ms, Boudoulas 1981 (men)
  const ivrt = 96 * Math.sqrt(RRms / 857);
  const dfp = Math.max(80, RRms - qs2 - ivrt);                 // ms of filling
  const dt = pht / (1 - Math.SQRT1_2);                        // linear fall: time to zero flow
  const env = (t) => Math.max(0, 1 - t / dt) + 0.25 * (t > dfp - 120 ? Math.sin(Math.PI * (t - dfp + 120) / 120) : 0);
  const unit = mean((u) => env(u * dfp)) * dfp / 1000;       // s: VTI per 1 m/s of v0
  const v0 = (sv / mva) / 100 / unit;                         // m/s, so that area x VTI = SV
  const mg = 4 * v0 * v0 * mean((u) => env(u * dfp) ** 2);
  return { RRms, dfp, pht, dt, env, v0, mg };
}

const mvaOf = mono([[0, 4.5], [0.25, 2.5], [0.5, 1.5], [0.75, 1.0], [1, 0.75]]);
// Peak TR velocity (m/s) by the valve area as printed. The PA systolic pressure follows from it,
// 4v² + the RA pressure, as an echo study derives it, and meets the ASE bands (Pandian 2023): 30 mmHg
// from an area of 2.50 cm² and 50 mmHg from 1.50 cm². The keys sit half-way between printed areas.
const trvOf = mono([[0.75, 3.9], [1.0, 3.6], [1.505, 3.35], [2.505, 2.55], [4.5, 2.3]]);
const TRK = tracks([0, 0.25, 0.5, 0.75, 1], {
  lavi: [24, 32, 45, 58, 70],
  la: [3.2, 3.8, 4.6, 5.2, 5.8],
  rvb: [3.4, 3.5, 3.8, 4.2, 4.6],
  tapse: [23, 22, 21, 19, 17],
  thick: [0.12, 0.25, 0.35, 0.45, 0.5],
  dome: [0, 0.6, 0.85, 1, 1],
  lvid: [4.8, 4.7, 4.6, 4.5, 4.4],
});

/** The model at slider position s and heart rate hr: its measurements before rounding, and the rest of the heart. */
function modelAt(s, hr) {
  const m = TRK(s);
  m.s = s;
  m.mva = round(mvaOf(s), 2);
  m.pht = 220 / m.mva;
  // the cardiac output is held at 4.9 L/min, so the stroke volume falls as the heart rate rises:
  // a fixed 70 mL through the shorter filling period gave about 5 times the gradient at 110/min
  m.sv = CO / hr;
  m.trv = trvOf(m.mva);
  m.rap = m.mva <= 1.5 ? 8 : 3;                      // the RA pressure the figure adds: 8 mmHg once severe
  return m;
}

/** The four measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  mva: { d: 2, step: 0.1, min: 0.5, max: 5 },
  pht: { d: 0, step: 10, min: 40, max: 400 },
  sv: { d: 0, step: 5, min: 40, max: 100 },
  trv: { d: 1, step: 0.1, min: 1.5, max: 5 },
};
const IN = Object.keys(INPUTS);
/** The switch: the RA pressure (mmHg) that the PA systolic pressure adds (chapter 07). */
const SWITCH = { rap: [3, 8, 15] };
const SW = Object.keys(SWITCH);
const DEC = { mvaPht: 2, mg: 1, pasp: 0, v0: 1, dfp: 0, hr: 0, rap: 0, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };

/**
 * Values as reported: the measurements at their decimals, and each calculation from the rounded
 * values before it. The grade reads these numbers, so a value on screen never contradicts it.
 */
function measure(raw, hr) {
  const v = { ...raw };
  for (const k of IN) v[k] = round(raw[k], INPUTS[k].d);
  v.hr = Math.round(hr);
  v.mvaPht = round(220 / v.pht, 2);
  Object.assign(v, mitral({ mva: v.mva, sv: v.sv, hr: v.hr, pht: v.pht }));
  v.mg = round(v.mg, 1);
  v.pasp = round(4 * v.trv ** 2 + v.rap, 0);
  v.tip = 2 * Math.sqrt(v.mva / Math.PI);
  for (const [k, d] of [['lavi', 0], ['rvb', 1], ['tapse', 0]]) v[k] = shownAt(raw[k], d);
  v.crit = msIntegrated(v);
  v.grade = v.crit.grade;
  return v;
}

/**
 * The values on screen, from the store: the edited measurements (msx), or the model's at the
 * slider. The stroke volume follows the heart rate, as the model's does, until it is edited.
 */
function shownOf(s) {
  const ed = s[EDITS];
  if (!ed) return measure(modelAt(s[KEY], s.hr), s.hr);
  const v = modelAt(ed.base, s.hr);
  for (const k of [...IN, ...SW]) if (k !== 'sv' || ed.svSet) v[k] = ed[k];
  return measure(v, s.hr);
}
let lastEd = null, lastS = null, lastHr = null, lastShown = null;
/** shownOf, kept for the last state: the figure asks every frame. */
function shown(s) {
  if (s[EDITS] !== lastEd || s.hr !== lastHr || (!s[EDITS] && s[KEY] !== lastS) || !lastShown) {
    lastEd = s[EDITS]; lastS = s[KEY]; lastHr = s.hr;
    lastShown = shownOf(s);
  }
  return lastShown;
}
// graded by the valve area as printed (Pandian 2023 Table 1); the heart rate does not change it
export const gradeOf = (s) => measure(modelAt(s, 70), 70).grade;

const LEAD = { none: 'No mitral stenosis', mild: 'Mild mitral stenosis', moderate: 'Moderate mitral stenosis', severe: 'Severe mitral stenosis' };
const HEAD = { none: 'No stenosis', mild: 'Mild stenosis', moderate: 'Moderate stenosis', severe: 'Severe stenosis' };
const GNAME = ['', 'mild', 'moderate', 'severe'];
let BANDS = [];

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;

// ---------------------------------------------------------------- the figure
/** LA width and length (cm) of an ellipsoid of volume vol (mL) and width/length ratio r. */
function laDims(vol, r) {
  const L = Math.cbrt(vol / (0.524 * r * r));
  return [r * L, L];
}

// The four-chamber view and the short axis at the mitral valve cut from the heart mesh
// (meshpanel.js): the heart the page shows, its LA at the printed LA volume index (la, meshcal.js
// laWeight), its RV at the printed RV basal diameter (rvGrow), and its mitral valve at the printed
// area and leaflet thickness (msValve and mvThick, msWeights): the tips held, the bodies domed
// into the LV, the leaflets thick. Through diastole the narrowed valve stays open, without the
// closure of diastasis. The short axis moves to the tips, where the area is traced. The scanner
// format (jets.js) keeps the parametric views.
const redraw = () => { if (sheet) sheet.dirty = true; };
const MESH = new MeshPanel('a4c', { diseases: ['la', 'rvGrow', 'msValve', 'mvThick'], redraw });
const MESH_SAX = new MeshPanel('psax_mv', { diseases: ['rvGrow', 'msValve', 'mvThick'], redraw });
// diastole from the opening to the atrial kick, where the normal valve drifts shut in diastasis
const held = (t) => {
  const u = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  return u(t, EV.mvo + 22, EV.mvo + 40) * (1 - u(t, 810, 850));
};
/** The mesh's settings for the values on screen, on the heart the page shows. */
function meshOf(v) {
  const heart = st.pheno || 'normal';
  const W = msWeights(heart, v.mva, v.thick * 10);
  return {
    W,
    disease: { la: laWeight(v.lavi, heart), rvGrow: rvGrowOf(heart, v.rvb), msValve: W.ms, mvThick: W.thick },
    // a stenotic valve stays open through diastole: its leaflets do not drift shut (M-mode: the E-F slope falls)
    drive: (d, t) => ({ ...d, mv: d.mv * (1 - v.dome * held(t)) }),
    // the leaflets as drawn: the printed thickness, or the heart's own where that is more
    thickMm: Math.max(v.thick * 10, mvOwnThick(heart)),
  };
}

/**
 * The inflow jet on the mesh view at systolic weight s: from where the mitral leaflet tips come
 * nearest each other, into the LV toward the apex; the LV below the tips clips it, and its flow
 * convergence keeps to the LA and the funnel of the leaflets above them.
 */
function msJet(ev, s) {
  const h = hingesOf(ev, 'MitralValve');
  if (!h) return null;
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle(h);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  const O = closureOf(ev, 'MitralValve', M, nrm) || M, side = perp(nrm);
  const cut = [[add(O, side), sub(O, side)]];
  const LV = cavity(ev, blood(ev, onPlane(ev, an.lv)), cut);
  const LA = cavity(ev, blood(ev, sub(O, mul(nrm, 0.6)), 0.3), cut);
  return { O, dir: nrm, clip: LV.length >= 12 ? LV : null, pclip: LA.length >= 12 ? LA : null };
}

function a4c(ctx, box, v, t) {
  if (JETS === 'plume') {
    const m = meshOf(v);
    const t0 = EV.mvo, fill = RR - t0 + EV.mvc;
    const since = t >= t0 ? t - t0 : t + RR - t0;
    const narrow = !v.crit.none;
    const a = since < fill && narrow ? Math.min(1, since / 40) * clamp(v.env((since / fill) * v.dfp), 0.3, 1) : 0;
    const jl = 2.5 + 2.5 * v.s;
    MESH.draw(ctx, box, fit(box.w, 'APICAL FOUR-CHAMBER · COLOR 40 cm/s', 'A4C · COLOR 40'), {
      tms: t, disease: m.disease, drive: m.drive,
      names: [['lv', 'LV', 'apex', 0.45], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
      over: (c, F, ev) => {
        if (!narrow || !(a > 0.02)) return;
        const J = msJet(ev, cycleAt(t).s);
        if (!J) return;
        jet(c, F, { q: (v.sv / (v.dfp / 1000)) * 1.1, va: 40, vc: v.tip * 0.6, jl, jw: 0.9 + v.tip * 0.4, a, O: J.O, dir: J.dir, clip: J.clip, pclip: J.pclip });
        barFor(c, F, -40, 40);
      },
      lines: [[`LA volume index ${Math.round(v.lavi)} mL/m²`, `LAVi ${Math.round(v.lavi)} mL/m²`], `leaflets ${m.thickMm.toFixed(0)} mm`],
    });
    return;
  }
  // the scanner format: the parametric view
  // the LA stays large through diastole: the narrow valve keeps it from emptying
  const laMax = v.lavi * BSA, laMin = laMax * (0.6 + 0.25 * v.s);
  const [wMax, lMax] = laDims(laMax, 0.8 + 0.1 * v.s), [wMin, lMin] = laDims(laMin, 0.8 + 0.1 * v.s);
  const g = {
    lvL: [8.2, 7.05], lvW: [v.lvid, v.lvid * 0.64], lvWall: [0.9, 1.35], ivs: [0.9, 1.35],
    rvW: [v.rvb, v.rvb - 0.6], laW: [wMin, wMax], laL: [lMin, lMax],
    raW: [3.2 + 0.7 * v.s, 3.8 + 0.8 * v.s], raL: [3.9 + 0.5 * v.s, 4.5 + 0.6 * v.s], ma: 3.1, ta: 3.0 + 0.4 * v.s,
    mv: { thick: v.thick, dome: v.dome, tip: Math.min(2.4, v.tip) },
  };
  // the jet runs from mitral opening to mitral closure and follows the inflow velocity: it
  // fades in diastasis through a mild stenosis and stays through a severe one
  const t0 = EV.mvo, fill = RR - t0 + EV.mvc;
  const since = t >= t0 ? t - t0 : t + RR - t0;
  const narrow = !v.crit.none;
  const a = since < fill && narrow ? Math.min(1, since / 40) * clamp(v.env((since / fill) * v.dfp), 0.3, 1) : 0;
  const jl = 2.5 + 2.5 * v.s;
  const inflow = narrow ? { q: (v.sv / (v.dfp / 1000)) * 1.1, vc: v.tip * 0.6, jl, jw: 0.9 + v.tip * 0.4, a } : null;
  drawA4C(ctx, box, g, {
    t, depth: 16 + v.s, title: fit(box.w, 'APICAL FOUR-CHAMBER · COLOR 40 cm/s', 'A4C · COLOR 40'),
    color: {
      roi: 'mvin', reach: 1.6 + jl, lo: -40, hi: 40, variance: true, pvS: 0.5, pvD: 0.4 - 0.15 * v.s,
      // the flow converges on the domed leaflets from the LA (a funnel, not a flat valve)
      ms: inflow ? { ...inflow, u0: v.v0 * 100, half: 0.9, soft: 0.35 } : null,
    },
    after: (c, F) => measures(c, F, [[`LA volume index ${Math.round(v.lavi)} mL/m²`, `LAVi ${Math.round(v.lavi)} mL/m²`], `leaflets ${(shownMitralThick(v.thick) * 10).toFixed(0)} mm`]),
  });
}

function inflowCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, `CW · MITRAL INFLOW · HR ${v.hr}`, `CW · MV · HR ${v.hr}`));
  const bx = inner(P);
  const span = 2 * v.RRms;
  const start = v.RRms - v.dfp;
  const fn = (u) => {
    const tt = (u * span) % v.RRms;
    const since = tt - start;
    return since >= 0 ? v.v0 * v.env(since) : 0;
  };
  const vs = Math.max(2, Math.ceil(v.v0 + 0.5));
  spectral(ctx, bx, { fn, scale: vs, base: 0.9, mode: 'cw', broad: 0.4, key: `msin|${v.mva.toFixed(2)}|${v.pht}|${v.sv}|${v.hr}|${vs}`, seed: 4 });
  vscale(ctx, bx, vs, 0.9, 1);
  const k = (bx.h * 0.9) / vs, yb = bx.y + bx.h * 0.9;
  const X = (ms) => bx.x + (ms / span) * bx.w;
  const x0 = X(start), x1 = X(start + Math.min(v.pht, v.dfp));
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.beginPath();
  ctx.moveTo(x0, yb - v.v0 * k);
  ctx.lineTo(X(start + Math.min(v.dt, v.dfp)), yb - v.v0 * Math.max(0, 1 - Math.min(v.dt, v.dfp) / v.dt) * k);
  ctx.stroke();
  ctx.restore();
  caliper(ctx, x0, yb - v.v0 * k - 10, x1, yb - v.v0 * k - 10, { solid: true });
  note(ctx, bx, [`PHT ${v.pht} ms · mean gradient ${v.mg.toFixed(1)} mmHg · peak ${v.v0.toFixed(1)} m/s`, `PHT ${v.pht} · MG ${v.mg.toFixed(1)}`], 'top');
  return { bx, span };
}

function trCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'CW · TRICUSPID REGURGITATION');
  const bx = inner(P);
  const tv = q2(v.trv), vs = Math.max(4.5, Math.ceil(tv + 0.5));
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const w = (t - EV.mvc) / (EV.mvo - EV.mvc);
    return w > 0 && w < 1 ? -tv * Math.pow(Math.sin(Math.PI * w), 0.45) : 0;
  };
  spectral(ctx, bx, { fn, scale: vs, base: 0.06, mode: 'cw', broad: 0.5, key: `mstr|${tv}|${vs}`, seed: 9 });
  vscale(ctx, bx, vs, 0.06, 1);
  note(ctx, bx, [`TR ${v.trv.toFixed(1)} m/s · PA systolic ${v.pasp} mmHg (RA ${v.rap})`, `TR ${v.trv.toFixed(1)} · PASP ${v.pasp}`], 'bottom');
  return bx;
}

function meterItems(v) {
  return [
    { k: 'Mitral valve area', v: v.mva, u: 'cm²', d: 2, lo: 0.5, hi: 5, cuts: [[1.5, '1.5'], [2.5, '2.5']], bad: v.mva <= 1.5 },
    { k: 'Pressure half-time', v: v.pht, u: 'ms', lo: 0, hi: 320, cuts: [[100, '100'], [150, '150']], bad: v.pht >= 150 },
    { k: `Mean gradient (HR ${v.hr})`, v: v.mg, u: 'mmHg', d: 1, lo: 0, hi: 25, cuts: [[5, '5'], [10, '10']], bad: v.mg >= 10 },
    { k: 'PA systolic pressure', v: v.pasp, u: 'mmHg', lo: 15, hi: 80, cuts: [[30, '30'], [50, '50']], bad: v.pasp >= 50 },
    { k: 'LA volume index', v: v.lavi, u: 'mL/m²', lo: 10, hi: 85, norm: [16, 34], cuts: [[34, '34'], [48, '48']], bad: v.lavi > 34 },
    { k: 'RV basal diameter', v: v.rvb, u: 'cm', d: 1, lo: 2.5, hi: 5.5, norm: [2.5, 4.1], cuts: [[4.1, '4.1']], bad: v.rvb >= 4.1 },
    { k: 'TAPSE', v: v.tapse, u: 'mm', lo: 8, hi: 30, norm: [17, 30], cuts: [[17, '17']], bad: v.tapse <= 17 },
  ];
}

/**
 * The short axis at the mitral valve: on the mesh, moved to the leaflet tips, with the orifice
 * traced through diastole as planimetry traces it; else the parametric view.
 */
function sax(ctx, P, v, t, title) {
  if (JETS !== 'plume') {
    drawPSAXmv(ctx, P, { mva: v.mva, lvid: [v.lvid, v.lvid * 0.64], thick: v.thick }, { t, title });
    return;
  }
  const m = meshOf(v);
  const open = (t >= EV.mvo + 30 && t <= 800) && v.dome > 0;
  MESH_SAX.draw(ctx, P, title, {
    tms: t, disease: { rvGrow: m.disease.rvGrow, msValve: m.W.ms, mvThick: m.W.thick }, drive: m.drive, shift: m.W.shift,
    // the LV's name off the orifice, toward the inferior wall
    names: [['rv', 'RV'], ['lv', 'LV', 'infw', 0.8]],
    over: (c, F, ev) => {
      if (!open) return;
      // the trace: the leaflet tips that bound the orifice seen along the valve's axis
      const o = enFaceOrifice(ev, 'MitralValve');
      if (!o || o.P.length < 12) return;
      c.save();
      c.beginPath();
      c.rect(F.view.box.x, F.view.box.y, F.view.box.w, F.view.box.h);
      c.clip();
      c.strokeStyle = SC.cal;
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      o.P.forEach((p, i) => { const q = F.P(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      c.closePath();
      c.stroke();
      c.restore();
    },
  });
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const tt = beat.at(st.msCine, 600);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, v, tt);
    const [p1, p2] = rows(b, [1.2, 1], 8);
    const r = inflowCW(ctx, p1, v);
    cursor(ctx, r.bx, beat.sweep);
    sax(ctx, p2, v, tt, 'PSAX · MV');
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.62);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v), { row: 32 });
  const [p1, p2, p3] = rows(colR, [1.2, 0.9, 1.05], 10);
  const r = inflowCW(ctx, p1, v);
  const b2 = trCW(ctx, p2, v);
  sax(ctx, p3, v, tt, `PSAX · PLANIMETRY ${v.mva.toFixed(2)} cm²`);
  cursor(ctx, r.bx, beat.sweep);
  cursor(ctx, b2, beat.sweep);
}

// ---------------------------------------------------------------- the measurements in the text
// From the measurements (▲▼) to the bands of Table 1 and the grade by the planimetered area, and
// whether the other measures support it. Each change flashes where it acts.
const NAME = {
  mva: 'Valve area, planimetry', pht: 'Pressure half-time', sv: 'Stroke volume', trv: 'Peak TR velocity', rap: 'RA pressure',
  mvaPht: 'Valve area by PHT', mg: 'Mean gradient', pasp: 'PA systolic pressure', hr: 'Heart rate',
};
const UNIT = { mva: 'cm²', pht: 'ms', sv: 'mL', trv: 'm/s', rap: 'mmHg', mvaPht: 'cm²', mg: 'mmHg', pasp: 'mmHg', v0: 'm/s', dfp: 'ms', hr: '/min' };
const ARIA = { mva: 'mitral valve area by planimetry', pht: 'pressure half-time', sv: 'stroke volume', trv: 'peak TR velocity' };
const SWITCH_LABEL = { rap: ['3', '8', '15'] };
const GROUPS = [
  ['twod', '2D', 'planimetry in the parasternal short axis, at the leaflet tips', ['mva']],
  ['spec', 'Doppler', 'CW through the mitral inflow and the TR jet', ['pht', 'sv', 'trv', 'rap']],
];
/** The names in the change line: the cause, and its effects. */
const EFFECT = { mvaPht: 'area by PHT', mg: 'mean gradient', pasp: 'PA systolic pressure' };
/** What each measurement changes. */
const EFFECTS = { mva: ['mg'], pht: ['mvaPht', 'mg'], sv: ['mg'], trv: ['pasp'], rap: ['pasp'] };
/** Each formula, and its numbers: text, and the keys whose values show. Rows without one are measured. */
const FORMULA = {
  mvaPht: ['220 ÷ PHT', ['220 ÷ ', { k: 'pht' }]],
  mg: ['mean of 4v² over the filling period', ['peak ', { k: 'v0' }, ' m/s, filling ', { k: 'dfp' }, ' ms at ', { k: 'hr' }, '/min']],
  pasp: ['4 × TR velocity² + RA pressure', ['4 × ', { k: 'trv' }, '² + ', { k: 'rap' }]],
};
const MEASURED = { mva: 'traced at the leaflet tips', pht: 'the slope of the CW envelope' };
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { pht: 3, v0: 3, dfp: 3, hr: 3, trv: 3, rap: 2 };
const GRADED = ['mva', 'pht', 'mg', 'pasp'];
const SUPPORT_NAME = { pht: 'pressure half-time', mg: 'mean gradient', pasp: 'PA systolic pressure' };
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const BANDS_NOTE = 'Planimetry is the preferred method for the valve area<span class="cite" data-ref="pandian2023"></span>, so the area gives the grade here. A normal area is 4.0–5.0 cm²<span class="cite" data-ref="baumgartner2009"></span>; from 4.0 cm² the diagram calls the valve normal. The bands of the mean gradient hold at a heart rate of 60–80/min<span class="cite" data-ref="pandian2023"></span>.';
const RES_NOTE = 'Agreement among the measures makes the grade more reliable. When they disagree, stress echocardiography can assess the hemodynamic severity<span class="cite" data-ref="pandian2023"></span>.';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (k === 'rap' ? String(x) : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k].startsWith('/') ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => (SWITCH[k]
    ? `<div class="ase-row asx-in rgx-row3" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}, mmHg</span>
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
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${MS_BANDS[k].map(([lab], i) => `<span class="asx-c" data-i="${i + 1}" data-l="${i + 1}">${GNAME[i + 1]} ${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${GRADED.includes(k) ? '<span class="asx-st"></span>' : ''}</p>
      <p class="asx-f">${FORMULA[k] ? `<span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span>` : `<span class="asx-fx">${MEASURED[k]}</span>`}</p>
      ${GRADED.includes(k) ? chips(k) : ''}
    </div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Measurements and grade</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${GROUPS.map(group).join('')}
    <div class="ase-step is-on asx-step" data-s="bands">
      <p class="ase-sh"><span class="ase-sn">Bands</span><span class="ase-sx">ASE classification of mitral stenosis<span class="cite" data-ref="pandian2023"></span></span><a class="asx-go" href="#pressure" data-go="pressure" aria-label="The PA systolic pressure: chapter ${numOf('pressure')}, Doppler hemodynamics">${numOf('pressure')} Pressure →</a></p>
      ${['mva', 'pht', 'mvaPht', 'mg', 'pasp'].map(eq).join('')}
      <p class="ase-note asx-note">${BANDS_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">the grade by the area, and its support<span class="cite" data-ref="pandian2023"></span></span></p>
      <div class="asx-br" data-b="area"><p class="asx-bl">Grade by the planimetered area</p><p class="asx-os">${['none', 'mild', 'moderate', 'severe'].map((o) => `<span class="ase-o" data-o="${o}"${o === 'severe' ? ' data-sev' : ''}>${o}</span>`).join('')}</p></div>
      <p class="asx-q" data-q="agree"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">Other measures in the band of the area</span><span class="asx-qr"></span><span class="asx-qs"></span></p>
      <p class="ase-note asx-note">${RES_NOTE}</p>
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
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    agree: { el: q('[data-q="agree"]'), r: q('[data-q="agree"] .asx-qr'), st: q('[data-q="agree"] .asx-qs') },
    br: q('[data-b="area"]'),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, b.dataset.i !== undefined ? SWITCH[b.dataset.k][Number(b.dataset.i)] : Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements and the switch of the values v, as msx stores them. */
const valsOf = (v) => Object.fromEntries([...IN, ...SW].map((k) => [k, v[k]]));

/** The keys of msx that differ from the model's values where the edits started, at heart rate hr. */
function editedOf(ed, hr) {
  const m = measure(modelAt(ed.base, hr), hr);
  return [...IN.filter((k) => (k !== 'sv' || ed.svSet) && Math.abs(ed[k] - m[k]) > 1e-9), ...SW.filter((k) => ed[k] !== m[k])];
}

const freeLive = () => { const live = document.querySelector('#ch-ms .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click (dir) or a switch (its value): the edited values and the slider at their result, in one patch; Play and the tour stop. */
function edit(k, x, btn = null) {
  const s = st;
  const base = s[EDITS] ? s[EDITS].base : s[KEY];
  const cur = shown(s);
  const vals = valsOf(cur);
  const from = vals[k], to = SWITCH[k] ? x : stepOf(from, INPUTS[k], x);
  if (to === from) return;
  vals[k] = to;
  const ed = { ...vals, base, svSet: !!s[EDITS]?.svSet || k === 'sv' };
  const next = shownOf({ ...s, [EDITS]: ed });
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf(ed, s.hr).length) setState({ [EDITS]: null, [KEY]: base, anim: false, playing: false });   // back at the model's values
    else setState({ [EDITS]: Object.freeze(ed), [KEY]: slideTo(s[KEY], next.grade), anim: false, playing: false });
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

/** The diagram at the values on screen: numbers, bands, the grade and its support; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const c = v.crit;
  const M = { ed: !!s[EDITS], v, out: v.grade, eds: s[EDITS] ? editedOf(s[EDITS], s.hr) : [] };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  // the measurements and their buttons
  for (const k of IN) {
    const R = dg.rows[k], L = INPUTS[k];
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
  txt(dg.dur, `The heart rate, ${v.hr}/min, comes from its slider. ${M.eds.includes('sv') ? 'The stroke volume stays as edited.' : `The stroke volume is ${(CO / 1000).toFixed(1)} L/min ÷ the heart rate.`}`);
  // the bands
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (!E.st) continue;
    const g = c.g[k], off = k === 'mg' && !c.hrOk;
    E.cs.forEach((ch) => ch.classList.toggle('is-on', !off && Number(ch.dataset.i) === g));
    txt(E.st, off ? `${v.hr}/min` : GNAME[g]);
    E.el.dataset.l = off ? 0 : g;
  }
  // the grade and its support
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', o === M.out);
  dg.br.classList.toggle('is-on', true);
  const of = c.support.length, ok = of - c.disagree.length;
  txt(dg.agree.r, c.none ? 'no stenosis' : c.disagree.length ? `not the ${listOf(c.disagree.map((k) => SUPPORT_NAME[k]))}` : `${listOf(c.support.map((k) => SUPPORT_NAME[k]))}`);
  txt(dg.agree.st, c.none ? '–' : `${ok} of ${of}`);
  dg.agree.el.classList.toggle('is-on', !c.none && c.disagree.length > 0);
  txt(dg.head, HEAD[M.out]);
  txt(dg.sub, c.none ? `area ${num('mva', v.mva)} cm² by planimetry` : `area ${num('mva', v.mva)} cm² by planimetry · ${ok} of ${of} other measures agree`);
  dg.result.classList.toggle('is-raised', M.out === 'severe');
  dg.reset.classList.toggle('is-off', !M.ed);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.ed && !pending) freeLive();
  // the slider's label: main.js writes it when msS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="msS"]');
  if (o) txt(o, msPage.format.msS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || SW.some((k) => P.v[k] !== v[k]) || P.v.hr !== v.hr || P.out !== M.out || P.ed !== M.ed;
  if (!moved) return;
  const cause = pending || (P.v.hr !== v.hr ? { kind: 'hr', from: P.v.hr, to: v.hr } : { kind: 'slider' });
  // a screen reader reads the line after an edit or Reset, not at each step of Play
  dg.change.setAttribute('aria-live', cause.kind === 'slider' || cause.kind === 'hr' ? 'off' : 'polite');
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

/** What a change crossed: the bands of the measures, and their agreement with the area. */
const CROSS = { mva: 'area', pht: 'PHT', mg: 'MG', pasp: 'PASP' };
function crossed(P, M) {
  const a = P.v.crit, b = M.v.crit;
  const out = GRADED.filter((k) => a.g[k] !== b.g[k] && (k !== 'mg' || b.hrOk)).map((k) => withUnit(k, `${CROSS[k]} ${MS_BANDS[k][b.g[k] - 1][0]}`));
  if (a.hrOk !== b.hrOk) out.push(b.hrOk ? 'heart rate within 60–80/min' : 'heart rate outside 60–80/min');
  return out;
}

/** The cause and effect of a change, as one line. crossed: a band or the result changed. */
function changeLine(P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}`
    : cause.kind === 'hr' ? `Heart rate ${cause.from} → ${cause.to}/min` : cause.kind === 'reset' ? 'Reset' : 'Severity';
  const cut = crossed(P, M);
  let what;
  const ks = cause.kind === 'edit' ? EFFECTS[cause.k] : cause.kind === 'hr' ? ['mg'] : null;
  if (ks) {
    const ch = ks.filter((k) => P.v[k] !== M.v[k]);
    what = [...ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${num(k, P.v[k])} → ${num(k, M.v[k])}`)}`), ...cut].join(', ') || 'no band changed';
  } else what = [...(P.ed && !M.ed ? ['edits cleared'] : []), ...cut].join(', ') || 'no cut-off crossed';
  const result = P.out === M.out ? `Result unchanged: ${M.out}` : `Result: ${P.out} → ${M.out}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(P, M, cause) {
  const a = P.v.crit, b = M.v.crit;
  for (const k of GRADED) if (a.g[k] !== b.g[k]) flash(dg.eqs[k].chips);
  if (a.disagree.length !== b.disagree.length) flash(dg.agree.el);
  if (P.out !== M.out) { flash(dg.out[M.out]); flash(dg.result); }
  // an edit or the heart rate: the numbers it changed pulse
  if (cause.kind === 'edit' || cause.kind === 'hr') {
    if (cause.kind === 'edit' && !SWITCH[cause.k]) flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (P.v[k] !== M.v[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (P.v[el.dataset.x] !== M.v[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentence: the grade in bold, then its numbers and their agreement. */
function liveOf(v, s, cite) {
  const c = v.crit, P = cite('pandian2023');
  if (c.none) return `<b>No mitral stenosis.</b> The mitral valve is normal, with an area of ${fmt(v.mva, 1)} cm² and a pressure half-time of ${fmt(v.pht)} ms. The play control animates the progression of rheumatic mitral stenosis.`;
  const nums = ` The valve area by planimetry is ${fmt(v.mva, 2)} cm²${P}. The pressure half-time is ${fmt(v.pht)} ms (an area of ${fmt(v.mvaPht, 2)} cm² by 220 ÷ PHT), and at a heart rate of ${v.hr} beats per minute the mean gradient is ${fmt(v.mg, 1)} mmHg.`;
  const heart = ` The LA volume index increases to ${fmt(v.lavi)} mL/m² and the PA systolic pressure to ${fmt(v.pasp)} mmHg${v.pasp > 50 ? `; the ACC/AHA guideline lists a PA systolic pressure above 50 mmHg as a consequence of severe stenosis${cite('otto2020')}` : ''}.`;
  const names = (ks) => listOf(ks.map((k) => SUPPORT_NAME[k]));
  const agree = !c.disagree.length
    ? ` The ${names(c.support)} lie in the band of the area${c.hrOk ? '' : `; at ${v.hr} beats per minute the bands of the mean gradient do not apply`}${P}.`
    : ` The ${names(c.disagree)} ${c.disagree.length > 1 ? 'lie in other bands' : `lies in the ${GNAME[c.g[c.disagree[0]]]} band`}; when the measures disagree, stress echocardiography can assess the hemodynamic severity${P}.`;
  const ed = s[EDITS] ? editedOf(s[EDITS], s.hr) : [];
  return `<b>${LEAD[v.grade]}.</b>${nums}${heart}${agree}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const msPage = {
  key: 'ms',
  part: 'valves',
  title: 'Mitral stenosis',
  nav: 'MS',
  dwell: 18,
  defaults: { msS: 0.55, msCine: true, [EDITS]: null },
  format: { msS: (x, s) => (s?.[EDITS] ? shown(s).grade : gradeOf(x)) },
  watch: ['msS', 'msCine', 'hr', EDITS],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = bands((x) => gradeOf(x));
    paintBands(document.getElementById('ms-grades'), BANDS, LEVEL);
    buildDiagram(document.getElementById('ms-calc'));
    // The severity slider, Play, the tour or a heart's preset: the values follow the slider again.
    // The heart rate does not clear them: the mean gradient follows it. A store listener, not
    // onState, so that a heart chosen on another chapter clears the edits too.
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
    if (beat.tick(dt, s.msCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ msS: 0, msCine: true, hr: 70, [EDITS]: null }); },
  tourTick(tt, set) {
    if (tt < 12) set({ msS: Math.round(clamp((tt - 1) / 10, 0, 1) * 0.85 * 200) / 200 });
    else set({ hr: Math.round(70 + clamp((tt - 12.5) / 4, 0, 1) * 40) });
  },
  // the time of the tour at which tourTick shows this state: the valve area up to 0.85 before 12 s,
  // then the heart rate from 70 to 110 /min
  tourAt(s) {
    if (s.hr > 70) return 12.5 + Math.min(1, (s.hr - 70) / 40) * 4;
    return s.msS > 0.85 ? 12 : 1 + (s.msS / 0.85) * 10;
  },
  text(s, { cite }) {
    const v = shown(s);
    return {
      readouts: [
        { k: 'Mitral valve area', v: fmt(v.mva, 2), u: 'cm²', flag: v.mva <= 1.5 },
        { k: 'Pressure half-time', v: fmt(v.pht), u: 'ms', flag: v.pht >= 150 },
        { k: 'Mean gradient', v: fmt(v.mg, 1), u: 'mmHg', flag: v.mg >= 10 },
        { k: 'PA systolic pressure', v: fmt(v.pasp), u: 'mmHg', flag: v.pasp >= 50 },
        { k: 'LA volume index', v: fmt(v.lavi), u: 'mL/m²', flag: v.lavi > 34 },
        { k: 'Grade', v: v.grade, text: true, flag: v.grade === 'severe' },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default msPage;
