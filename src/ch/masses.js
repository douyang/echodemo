// Cardiac masses and thrombus: one slider from no mass to a large one, and a switch for the kind
// of mass. A left atrial myxoma hangs on a stalk from the atrial septum at the fossa ovalis; as it
// grows it prolapses through the mitral valve in diastole, and a large one obstructs LV inflow
// (a mean gradient across the mitral valve). An LV thrombus lies on the apex, which is akinetic:
// mural, then protruding, then with a part that moves on its own. A papillary fibroelastoma sits
// on the aortic side of an aortic cusp: small and sessile, then on a stalk and mobile. A second
// switch gives an ultrasound enhancing agent: the cavities fill, and each mass takes it up as its
// blood supply allows (Porter 2018). The masses are meshes on the heart the page shows
// (gl/massesmesh.js), cut by the views as the heart is.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit, shown as shownAt } from '../sev.js';
import { cal } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { massItems, planeOf, MYX_REF_MS } from '../gl/massesmesh.js';
import { loadModel } from '../model3d.js';
import { segmentMap, periScale } from './segments.js';

const KEY = 'maS';
const TYPE = 'maType';
const UEA = 'maUea';
const TYPES = ['myxoma', 'thrombus', 'pfe'];

// ---------------------------------------------------------------- the model
// Tracks over the slider s for each kind of mass (cm for the myxoma, mm for the others). Below
// S0 there is no mass; from S0 each mass starts at its smallest size. Myxoma: length L and
// width W. Thrombus: thickness T and the length of its base along the wall L. Fibroelastoma:
// its size D (its longest chord).
const S0 = 0.06;
const TRACKS = {
  myxoma: tracks([S0, 0.3, 0.55, 0.8, 1], { L: [1.0, 1.7, 2.5, 3.1, 3.6], W: [0.8, 1.25, 1.75, 2.2, 2.5] }),
  thrombus: tracks([S0, 0.3, 0.5, 0.7, 0.85, 1], { T: [2.5, 4.5, 9, 13, 15, 17], L: [22, 30, 28, 26, 26, 27] }),
  pfe: tracks([S0, 0.4, 0.7, 1], { D: [3, 6, 10, 14] }),
};
// A part that moves on its own appears at its smallest size and grows to the end of the slider:
// the thrombus's mobile part (mob, mm) and the fibroelastoma's stalk (mm)
const from = (s0, a, b) => (s) => (s < s0 ? 0 : a + ((b - a) * (s - s0)) / (1 - s0));
const MOB = from(0.72, 5, 10), STALK_MM = from(0.42, 1.0, 2.2);
// The myxoma's stalk (cm), and where the tumor on it reaches past the mitral annulus: the line
// from the attachment through the middle of the channel between the open leaflets reaches the
// annulus R cm from the attachment, and runs down (cm below the annulus for each cm along it).
// Measured on each heart's mesh in mid-diastole (gl/massesmesh.js MYX_REF_MS, the still frame),
// as myxomaGeom places the tumor.
const STALK = 0.4;
const MYX_GEO = {
  normal: { R: 2.401, down: 0.905 }, amyloid: { R: 3.263, down: 0.933 }, icm: { R: 2.574, down: 0.868 },
  barlow: { R: 3.553, down: 0.89 }, bav: { R: 2.603, down: 0.894 },
};
// The short axis at the apex lies this far (cm) up the LV from the thrombus's middle on each heart;
// the panel moves it toward the apex, into the thrombus (meshpanel.js shift). APEX_Z: how high
// (cm) up the LV the ends of a 29 mm base lie, where the apex is deep or flat. Both measured on
// each heart's mesh at end-diastole.
const PSAX_AP = { normal: 1.23, amyloid: 1.1, icm: 2.1, barlow: 1.64, bav: 1.16 };
const APEX_Z = { normal: 1.23, amyloid: 1.66, icm: 0.66, barlow: 0.78, bav: 1.44 };
/** Where the short axis crosses the thrombus (cm up the LV from its middle): halfway up a layer, or through a mound. */
const apexCut = (heart, T) => clamp(Math.max(0.5 * (APEX_Z[heart] ?? APEX_Z.normal), 0.75 * T + 0.1), 0.3, 1.45);

/**
 * Mitral inflow past the tumor: the normal E and A waves (cyclemodel.js mitralV: 0.8 and
 * 0.55 m/s, the E wave falling over 180 ms); a share f of the orifice filled in diastole slows
 * the fall of the E wave (by 1.2 f) and raises the whole envelope, so that the volume through the
 * residual area (1 - f) stays the same. The mean gradient is 4 v² averaged over diastole, from
 * mitral opening to closure.
 */
const E0 = 0.8, A0 = 0.55;
function inflowV(t, e, a, dt) {
  const eUp = 70, ePk = EV.mvo + eUp, eEnd = ePk + dt;
  let v = 0;
  if (t >= EV.mvo && t < ePk) v = e * Math.sin(((t - EV.mvo) / eUp) * Math.PI / 2);
  else if (t >= ePk && t < eEnd) v = e * (1 - (t - ePk) / dt);
  const aPk = 815, aEnd = RR + 10, tt = t < 20 ? t + RR : t;
  if (tt >= EV.aOn && tt < aPk) v = Math.max(v, a * Math.sin(((tt - EV.aOn) / (aPk - EV.aOn)) * Math.PI / 2));
  else if (tt >= aPk && tt < aEnd) v = Math.max(v, a * (1 - (tt - aPk) / (aEnd - aPk)));
  return v;
}
const FILL = RR + EV.mvc - EV.mvo;   // ms of diastole, opening to closure
function inflow(f) {
  const dt = 180 * (1 + 1.2 * f), n = 400;
  let vti0 = 0, vti = 0;
  for (let i = 0; i < n; i++) {
    const t = (EV.mvo + (FILL * (i + 0.5)) / n) % RR;
    vti0 += inflowV(t, E0, A0, 180);
    vti += inflowV(t, E0, A0, dt);
  }
  const c = vti0 / vti / (1 - f);
  let g = 0;
  for (let i = 0; i < n; i++) { const t = (EV.mvo + (FILL * (i + 0.5)) / n) % RR; g += (c * inflowV(t, E0, A0, dt)) ** 2; }
  return { c, dt, mg: (4 * g) / n, fn: (t) => c * inflowV(t, E0, A0, dt) };
}

/** The model at slider position s for kind type on heart: its values before rounding. */
function modelAt(type, s, heart) {
  const m = TRACKS[type](s);
  if (s < S0) for (const k of Object.keys(m)) m[k] = 0;
  if (type === 'thrombus') m.mob = MOB(s);
  if (type === 'pfe') m.stalk = STALK_MM(s);
  m.s = s;
  m.type = type;
  m.heart = heart;
  return m;
}

// the grades of each kind, in order: myxoma none, in the LA, prolapsing, obstructive; thrombus
// none, mural, protruding, mobile; fibroelastoma none, sessile, mobile
const SHORT ={ 'in the LA': 'in LA', prolapsing: 'prolapse', obstructive: 'obstr.', protruding: 'protr.' };
const LEVEL = { none: 0, 'in the LA': 1, prolapsing: 2, obstructive: 3, mural: 1, protruding: 2, mobile: 3, sessile: 1 };
// a thrombus is called protruding when its thickness is more than 0.35 of the half-length of its
// base (the site's rule for the guideline's words: a mural thrombus is flat and parallel to the
// endocardium; a protruding one stands into the cavity, Saric 2016)
const PROTRUDE = 0.35;

/**
 * Values as reported: each measurement at the decimals the page prints, and the grade and the
 * values derived from the rounded ones, so that no grade or sentence contradicts a number.
 */
function measure(raw) {
  const v = { ...raw };
  const heart = raw.heart;
  if (raw.type === 'myxoma') {
    v.L = shownAt(raw.L, 1);
    v.W = shownAt(raw.W, 1);
    const G = MYX_GEO[heart] || MYX_GEO.normal;
    // the tip on its stalk past the annulus, square to it
    v.d = v.L > 0 ? shownAt(Math.max(0, (v.L + STALK - G.R) * G.down), 1) : 0;
    // the share of the orifice it fills in diastole: by its width, once it lies in the orifice
    const into = clamp(v.d / 0.9, 0, 1), sm = into * into * (3 - 2 * into);
    v.f = v.L > 0 ? 0.8 * Math.pow(Math.min(v.W, 2.5) / 2.5, 1.2) * sm : 0;
    const fl = inflow(v.f);
    v.mg = shownAt(fl.mg, 1);
    v.flow = fl;
    v.grade = v.L <= 0 ? 'none' : v.mg >= 5 ? 'obstructive' : v.d > 0 ? 'prolapsing' : 'in the LA';
  } else if (raw.type === 'thrombus') {
    v.T = shownAt(raw.T, 0);
    v.L = shownAt(raw.L, 0);
    v.mob = shownAt(raw.mob, 0);
    v.ratio = v.L > 0 ? v.T / (v.L / 2) : 0;
    v.shape = clamp((v.ratio - 0.3) / 0.2, 0, 1);
    v.grade = v.T <= 0 ? 'none' : v.mob > 0 ? 'mobile' : v.ratio > PROTRUDE ? 'protruding' : 'mural';
  } else {
    v.D = shownAt(raw.D, 0);
    v.stalk = shownAt(raw.stalk, 1);
    v.grade = v.D <= 0 ? 'none' : v.stalk > 0 ? 'mobile' : 'sessile';
  }
  return v;
}

const heartOf = (s) => s.pheno || 'normal';
const typeOf = (s) => (TYPES.includes(s[TYPE]) ? s[TYPE] : 'myxoma');
let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = `${s[KEY]}|${typeOf(s)}|${heartOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(modelAt(typeOf(s), s[KEY], heartOf(s))); }
  return lastShown;
}
/** The values as reported for kind type at slider position x on heart (the page prints these). */
export const valuesAt = (type, x, heart = 'normal') => measure(modelAt(type, x, heart));
export const gradeOf = (x, type = 'myxoma') => valuesAt(type, x).grade;

let sheet = null, st = null;
const beat = new Beat(RR);
const BANDS_OF = new Map();
/** The grades along the slider for kind type on heart: a larger LA keeps the myxoma in it longer. */
function bandsOf(type, heart) {
  const k = `${type}|${heart}`;
  if (!BANDS_OF.has(k)) BANDS_OF.set(k, bands((x) => valuesAt(type, x, heart).grade));
  return BANDS_OF.get(k);
}

// ---------------------------------------------------------------- the figure
// Two echo views cut from the heart mesh (meshpanel.js), each with the mass on the heart the page
// shows: the myxoma in the four-chamber view and the long axis; the thrombus in the four-chamber
// view and the short axis at the apex; the fibroelastoma in the long axis and the apical long
// axis, both zoomed on the aortic valve. The third panel: mitral inflow on CW Doppler (myxoma),
// or the wall motion of the 17 segments (thrombus).
const redraw = () => { if (sheet) sheet.dirty = true; };
const MAIN = new MeshPanel('a4c', { diseases: [], redraw });
const SECOND = new MeshPanel('plax', { diseases: [], redraw });
const VIEWS_OF = { myxoma: ['a4c', 'plax'], thrombus: ['a4c', 'psax_ap'], pfe: ['plax_av', 'a3c_av'] };

// The thrombus lies in an akinetic apex: the apical segments (13 to 17) do not move. On the
// ischemic heart the apex is its own (the LAD territory akinetic, the apex dyskinetic).
let wm = null;   // { m, map } once the segment map is built (ch/segments.js)
const APICAL = new Set([13, 14, 15, 16, 17]);
// the LV's own motion, by heart, outside the apex: the Barlow heart's LV moves 1.3 times the
// normal heart's (gl/phenomesh.js MESH.barlow.sys), and its own change is replaced by it (noSys)
const LV_SYS = { barlow: 1.3 };
const SCALES = new Map();
async function startWallMotion() {
  if (wm) return;
  wm = { loading: true };
  try {
    const [m, E] = await Promise.all([loadModel(), import('../echo.js')]);
    const map = segmentMap(m, Object.fromEntries(['a4c', 'a2c', 'a3c'].map((k) => [k, E.viewGeometry(m.anat.normal(), k)])));
    wm = { m, map };
    redraw();
  } catch (err) {
    console.error('masses: segment map failed', err);
    wm = { failed: true };
  }
}
/** The regional wall motion of the thrombus's apex on heart: { key, scale, peri }, or null (the heart's own). */
function apexMotion(heart) {
  if (heart === 'icm' || !wm || !wm.map) return null;
  if (SCALES.has(heart)) return SCALES.get(heart);
  const k = LV_SYS[heart] || 1, map = wm.map;
  const scale = new Float32Array(map.mem.length).fill(1);
  map.mem.forEach((mm, i) => {
    if (!mm) return;
    let a = 0, w = 0;
    for (const [seg, c] of mm) { a += c * (APICAL.has(seg) ? 0 : k); w += c; }
    scale[i] = a / w;
  });
  const out = { key: `masses|${heart}`, scale, peri: periScale(map, scale) };
  SCALES.set(heart, out);
  return out;
}
/** Each segment's wall motion in the figure: 1 normal, 2 hypokinetic, 3 akinetic, 4 dyskinetic. */
function wallScores(heart) {
  const sc = Array(18).fill(1);
  if (heart === 'icm') {
    // the ischemic heart (gl/phenomesh.js MESH.icm): the LAD territory akinetic, the apex
    // dyskinetic, the remote segments hypokinetic
    const lad = [1, 2, 7, 8, 13, 14];
    for (let k = 1; k <= 16; k++) sc[k] = lad.includes(k) ? 3 : 2;
    sc[17] = 4;
    return sc;
  }
  for (const k of APICAL) sc[k] = 3;
  return sc;
}

/** The mass's own motion (rad), from the beat's clock: a mobile part moves on its own, out of step with the heart. */
function ownMotion(v) {
  const u = beat.ms / (2 * RR);
  if (v.type === 'myxoma') return { wob: v.L > 0 ? 0.06 * Math.sin(2 * Math.PI * 3 * u) : 0 };
  if (v.type === 'thrombus') return { wag: v.mob > 0 ? 0.45 * Math.sin(2 * Math.PI * 5 * u + 1) : 0 };
  return { wag: v.stalk > 0 ? 0.45 * Math.sin(2 * Math.PI * 4 * u + 0.6) : 0 };
}

/** The mesh's mass: the values in cm, the kind, the agent, and the own motion. */
function massOf(v, uea) {
  const o = ownMotion(v), q = (x) => Math.round(x * 1000) / 1000;
  if (v.type === 'myxoma') return { kind: 'myxoma', L: v.L, W: v.W, d: v.d, uea, wob: q(o.wob) };
  if (v.type === 'thrombus') return { kind: 'thrombus', T: v.T / 10, L: v.L / 10, shape: v.shape, mob: v.mob / 10, uea, wag: q(o.wag) };
  return { kind: 'pfe', D: v.D / 10, stalk: v.stalk / 10, uea, wag: q(o.wag) };
}

/** The panel's options for the mass, the agent and the wall motion. */
function meshOpts(v, tt, uea) {
  const P = massOf(v, uea), heart = heartOf(st);
  const o = { tms: tt, underWalls: (ev, c) => massItems(ev, P, c), underKey: JSON.stringify(P) };
  if (v.type === 'thrombus') {
    const reg = apexMotion(heart);
    if (reg) { o.regional = reg; o.noSys = !!LV_SYS[heart]; }
  }
  return o;
}

// ---- calipers on the mass, from its loops on the plane (ev.massLoops)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
/** The mass's points on the plane, in the frame of axis u from point O: [along, across]. */
const inFrame = (pts, O, u) => pts.map((p) => { const q = sub(p, O); return [dot(q, u), q[0] * -u[1] + q[1] * u[0]]; });
/** The widest part across axis u: its position along the axis and its two sides; the points from along a0 on. */
function widest(pts, O, u, a0 = -Infinity) {
  const F = inFrame(pts, O, u).filter((q) => q[0] >= a0);
  if (F.length < 4) return null;
  const lo = Math.min(...F.map((q) => q[0])), hi = Math.max(...F.map((q) => q[0]));
  const NB = 40, bins = Array.from({ length: NB }, () => [Infinity, -Infinity]);
  for (const [a, c] of F) { const b = Math.min(NB - 1, Math.floor(((a - lo) / (hi - lo || 1)) * NB)); bins[b][0] = Math.min(bins[b][0], c); bins[b][1] = Math.max(bins[b][1], c); }
  let best = -1, bi = 0;
  bins.forEach(([a, b], i) => { if (b - a > best && Number.isFinite(a)) { best = b - a; bi = i; } });
  const at = lo + ((bi + 0.5) / NB) * (hi - lo);
  return { lo, hi, at, c0: bins[bi][0], c1: bins[bi][1] };
}
const fromFrame = (O, u, a, c) => [O[0] + u[0] * a - u[1] * c, O[1] + u[1] * a + u[0] * c];
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/** The myxoma's calipers: its length along its axis, from the stalk's end to the tip, and its width across. */
function myxCalipers(c, F, ev) {
  const ax = ev.massAxis;
  if (!ax || !ax.rear || !ev.massLoops || !ev.massLoops.length) return;
  const O = planeOf(ev.g, ax.rear), T = planeOf(ev.g, ax.tip);
  const u = unit2(sub(T, O));
  const w = widest(ev.massLoops.flat(), O, u, 0);
  if (!w) return;
  cal(c, F, fromFrame(O, u, 0, 0), fromFrame(O, u, w.hi, 0), '');
  cal(c, F, fromFrame(O, u, w.at, w.c0), fromFrame(O, u, w.at, w.c1), '');
}
/** The thrombus's calipers: its thickness from the endocardium at its middle, and its base from end to end along the wall. */
function thrCalipers(c, F, ev) {
  const ax = ev.massAxis;
  if (!ax || !ax.base) return;
  cal(c, F, planeOf(ev.g, ax.base), planeOf(ev.g, ax.top), '');
  if (ax.ends) cal(c, F, planeOf(ev.g, ax.ends[0]), planeOf(ev.g, ax.ends[1]), '');
}
/** The fibroelastoma's caliper: its longest chord, the stalk left out. */
function pfeCalipers(c, F, ev) {
  const ax = ev.massAxis, L = ev.massLoops;
  if (!ax || !ax.C || !L || !L.length) return;
  const A = planeOf(ev.g, ax.att), C = planeOf(ev.g, ax.C), u = unit2(sub(C, A));
  // the body: the outline from the end of the stalk on
  const P = L.flat().filter((q) => dot(sub(q, A), u) >= ax.from - 0.005);
  if (P.length < 3) return;
  let a = P[0], b = P[0], best = -1;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = (P[i][0] - P[j][0]) ** 2 + (P[i][1] - P[j][1]) ** 2;
    if (d > best) { best = d; a = P[i]; b = P[j]; }
  }
  cal(c, F, a, b, '');
}

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

/** The main view: the mass with its calipers and its measurements. */
function mainView(ctx, box, v, tt, uea) {
  const o = meshOpts(v, tt, uea);
  const ue = uea ? ' · UEA' : '';
  if (v.type === 'myxoma') {
    MAIN.setView('a4c');
    MAIN.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER${ue}`, `A4C${ue}`]), {
      ...o,
      names: [['lv', 'LV', 'apex', 0.45], ['rv', 'RV'], ['la', 'LA', 'mv', -0.7], ['ra', 'RA']],
      over: (c, F, ev) => { if (v.L > 0) myxCalipers(c, F, ev); },
      lines: v.L > 0 ? [[`mass ${v.L.toFixed(1)} × ${v.W.toFixed(1)} cm`, `${v.L.toFixed(1)} × ${v.W.toFixed(1)} cm`], ...(v.d > 0 ? [[`prolapse ${v.d.toFixed(1)} cm`, `into LV ${v.d.toFixed(1)}`]] : [])] : [],
    });
    return;
  }
  if (v.type === 'thrombus') {
    MAIN.setView('a4c');
    MAIN.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER${ue}`, `A4C${ue}`]), {
      ...o, deeper: -3,
      names: [['lv', 'LV', 'mv', 0.25], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
      over: (c, F, ev) => { if (v.T > 0) thrCalipers(c, F, ev); },
      lines: v.T > 0 ? [[`thrombus ${v.T} × ${v.L} mm`, `${v.T} × ${v.L} mm`], ...(v.mob > 0 ? [[`mobile part ${v.mob} mm`, `mobile ${v.mob} mm`]] : [])] : [],
    });
    return;
  }
  MAIN.setView('plax_av');
  MAIN.draw(ctx, box, titleOf(ctx, box.w, [`PARASTERNAL LONG AXIS · AORTIC VALVE${ue}`, `PLAX · AV ZOOM${ue}`, `PLAX AV${ue}`]), {
    ...o,
    names: [['ao', 'Ao', 'asc', 0.6], ['lvot', 'LVOT']],
    over: (c, F, ev) => { if (v.D > 0) pfeCalipers(c, F, ev); },
    lines: v.D > 0 ? [[`mass ${v.D} mm`, `${v.D} mm`]] : [],
  });
}

/** The second view: the same mass from another window. */
function secondView(ctx, box, v, tt, uea) {
  const o = meshOpts(v, tt, uea);
  const ue = uea ? ' · UEA' : '';
  if (v.type === 'myxoma') {
    SECOND.setView('plax');
    SECOND.draw(ctx, box, titleOf(ctx, box.w, [`PARASTERNAL LONG AXIS${ue}`, `PLAX${ue}`]), { ...o, names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA', 'mv', -0.8]] });
    return;
  }
  if (v.type === 'thrombus') {
    // the short axis at the apex, moved toward the apex so that it crosses the thrombus
    const heart = heartOf(st), h = apexCut(heart, v.T / 10);
    SECOND.setView('psax_ap');
    SECOND.draw(ctx, box, titleOf(ctx, box.w, [`PARASTERNAL SHORT AXIS · APEX${ue}`, `PSAX · APEX${ue}`, `PSAX AP${ue}`]), { ...o, deeper: -4, shift: -((PSAX_AP[heart] ?? PSAX_AP.normal) - h) });
    return;
  }
  SECOND.setView('a3c_av');
  SECOND.draw(ctx, box, titleOf(ctx, box.w, [`APICAL LONG AXIS · AORTIC VALVE${ue}`, `A3C · AV ZOOM${ue}`, `A3C AV${ue}`]), { ...o, names: [['ao', 'Ao', 'asc', 0.6], ['lvot', 'LVOT']] });
}

/** CW through the mitral valve from the apex: inflow toward the probe, with its mean gradient. */
function mitralCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · MITRAL INFLOW · HR 70', 'CW · MV'));
  const bx = inner(P);
  const fl = v.flow;
  const pk = fl.c * E0, vs = Math.max(1.5, Math.ceil((pk + 0.3) * 2) / 2);
  const fn = (u) => fl.fn((u * 2 * RR) % RR);
  spectral(ctx, bx, { fn, scale: vs, base: 0.92, mode: 'cw', broad: 0.35, key: `mamv|${v.f.toFixed(3)}|${vs}`, seed: 31 });
  vscale(ctx, bx, vs, 0.92, 0.5);
  note(ctx, bx, [`mean gradient ${v.mg.toFixed(1)} mmHg · E ${pk.toFixed(1)} m/s`, `MG ${v.mg.toFixed(1)} mmHg`, `${v.mg.toFixed(1)} mmHg`], 'top');
  return bx;
}

/** The 17 segments' wall motion as a bull's-eye: anterior at the top, septal on the left. */
function wallMotion(sh, t, P, v) {
  const ctx = sh.ctx, heart = heartOf(st), sc = wallScores(heart);
  sh.text('WALL MOTION', P.x + 4, P.y + 12, { family: MONO, weight: 500, size: 11, color: t.ink2 });
  // the map's radius, with room for its side labels inside the panel
  const fs = 10.5, lab = { family: SANS, weight: 400, size: fs };
  const sw = sh.measure('sept', lab), lw = sh.measure('lat', lab);
  const R = Math.max(24, Math.min(P.w * 0.3, (P.w - sw - lw - 24) / 2, (P.h - 46) / 2 - 10));
  const cx = P.x + Math.max(sw + 10 + R, Math.min(P.w * 0.36, R + 30)), cy = P.y + 24 + R + 12;
  const fill = (path, s) => {
    if (s === 1) return;
    ctx.save();
    ctx.fillStyle = s === 2 ? t.ink3 : t.flag;
    ctx.globalAlpha = s === 2 ? 0.28 : s === 3 ? 0.42 : 0.78;
    ctx.fill(path);
    ctx.restore();
  };
  const rings = [{ r0: 0.66, r1: 1, segs: [1, 2, 3, 4, 5, 6] }, { r0: 0.36, r1: 0.66, segs: [7, 8, 9, 10, 11, 12] }, { r0: 0.14, r1: 0.36, segs: [13, 14, 15, 16] }];
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D(), A = (-a * Math.PI) / 180, B = (-b * Math.PI) / 180;
    p.arc(cx, cy, r1 * R, A, B, true);
    p.arc(cx, cy, r0 * R, B, A, false);
    p.closePath();
    return p;
  };
  for (const ring of rings) {
    const step = 360 / ring.segs.length;
    ring.segs.forEach((seg, i) => {
      const mid = 90 + i * step, p = wedge(ring.r0, ring.r1, mid - step / 2, mid + step / 2);
      fill(p, sc[seg]);
      ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(p); ctx.restore();
    });
  }
  const cap = new Path2D();
  cap.arc(cx, cy, 0.14 * R, 0, Math.PI * 2);
  fill(cap, sc[17]);
  ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(cap); ctx.restore();
  sh.text('ant', cx, cy - R - 5, { family: SANS, weight: 400, size: fs, align: 'center', color: t.ink2 });
  sh.text('inf', cx, cy + R + 13, { family: SANS, weight: 400, size: fs, align: 'center', color: t.ink2 });
  sh.text('sept', cx - R - 4, cy + 4, { family: SANS, weight: 400, size: fs, align: 'right', color: t.ink2 });
  sh.text('lat', cx + R + 4, cy + 4, { family: SANS, weight: 400, size: fs, color: t.ink2 });
  // the key, beside the map or under it
  const items = [[1, 'normal'], ...(heart === 'icm' ? [[2, 'hypokinetic']] : []), [3, 'akinetic'], ...(heart === 'icm' ? [[4, 'dyskinetic']] : [])];
  const beside = P.w - (cx + R + 34 - P.x) > 96;
  let kx = beside ? cx + R + 34 : P.x + 6, ky = beside ? cy - (items.length * 18) / 2 + 8 : cy + R + 30;
  for (const [s, name] of items) {
    if (!beside && kx + 22 + sh.measure(name, { family: SANS, weight: 400, size: 11 }) > P.x + P.w) { kx = P.x + 6; ky += 17; }
    const p = new Path2D();
    p.rect(kx, ky - 10, 15, 11);
    ctx.save(); ctx.fillStyle = t.paper2; ctx.fill(p); ctx.restore();
    fill(p, s);
    ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(p); ctx.restore();
    sh.text(name, kx + 21, ky, { family: SANS, weight: 400, size: 11, color: t.ink2 });
    if (beside) ky += 18; else kx += 30 + sh.measure(name, { family: SANS, weight: 400, size: 11 });
  }
}

/** The still frame for each mass when the cine does not run: the myxoma in diastole, in the orifice. */
const STILL = { myxoma: MYX_REF_MS, thrombus: 0, pfe: 560 };

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st), uea = !!st[UEA];
  const tt = beat.at(true, STILL[v.type]);
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : STILL[v.type] / (2 * RR));
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.15, 1], 8);
    mainView(ctx, a, v, tt, uea);
    if (v.type === 'pfe') { secondView(ctx, b, v, tt, uea); return; }
    const [b1, b2] = rows(b, [1.25, 1], 8);
    secondView(ctx, b1, v, tt, uea);
    if (v.type === 'myxoma') mark(mitralCW(ctx, b2, v));
    else wallMotion(sh, t, b2, v);
    return;
  }
  const colL = { x: 16, y: 14, w: W * 0.5 - 16, h: H - 26 };
  const colR = { x: W * 0.515, y: 14, w: W * 0.485 - 16, h: H - 26 };
  mainView(ctx, colL, v, tt, uea);
  if (v.type === 'pfe') { secondView(ctx, colR, v, tt, uea); return; }
  const [r1, r2] = rows(colR, [1.45, 1], 10);
  secondView(ctx, r1, v, tt, uea);
  if (v.type === 'myxoma') mark(mitralCW(ctx, r2, v));
  else wallMotion(sh, t, r2, v);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** 'A' or 'An' before a number as it is read: 8, 11, 18 and 80 to 89 begin with a vowel sound. */
const aN = (s) => (/^(8|11|18|8\d)(\D|$)/.test(String(s)) ? 'An' : 'A');
const an = (s) => aN(s).toLowerCase();
const LEAD = {
  myxoma: { none: 'No left atrial mass', 'in the LA': 'Left atrial myxoma', prolapsing: 'Left atrial myxoma prolapsing into the LV', obstructive: 'Obstructive left atrial myxoma' },
  thrombus: { mural: 'Mural LV thrombus', protruding: 'Protruding LV thrombus', mobile: 'Mobile LV thrombus' },
  pfe: { none: 'No mass on the aortic valve', sessile: 'Sessile papillary fibroelastoma', mobile: 'Mobile papillary fibroelastoma' },
};
/** The cusp that carries the fibroelastoma: the anterior cusp of the long axis. */
const cuspName = (heart) => (heart === 'bav' ? 'the fused right and left cusp' : 'the right coronary cusp');
const apexWord = (heart) => (heart === 'icm' ? 'dyskinetic' : 'akinetic');

/** The live sentences: the result in bold, then the mass's place, size and motion, then the agent. */
function liveOf(v, s, cite) {
  const S = cite('saric2016'), P = cite('porter2018'), uea = !!s[UEA], heart = heartOf(s);
  if (v.type === 'myxoma') {
    if (v.grade === 'none') return `<b>${LEAD.myxoma.none}.</b> No mass lies in the LA or on the atrial septum. A cardiac myxoma lies in the LA in more than 75% of cases, attached by a stalk to the fossa ovalis in more than 90%${S}.${uea ? ` The enhancing agent fills the cavities${P}.` : ''}`;
    const where = ` ${aN(fmt(v.L, 1))} ${fmt(v.L, 1)} × ${fmt(v.W, 1)} cm mass in the LA is attached by a stalk to the atrial septum at the fossa ovalis${S}.`;
    const move = v.d > 0
      ? ` In diastole it prolapses ${fmt(v.d, 1)} cm past the mitral annulus into the LV, and in systole it returns to the LA.`
      : ' It moves with each beat and stays in the LA.';
    const grad = v.grade === 'obstructive'
      ? ` It fills most of the mitral orifice in diastole: the mean gradient is ${fmt(v.mg, 1)} mmHg at 70/min, a value that the ASE places in ${v.mg >= 10 ? 'the severe band of rheumatic mitral stenosis (10 mmHg or more' : 'the moderate band of rheumatic mitral stenosis (5–9 mmHg'} at 60–80/min)${cite('pandian2023')}. A large myxoma can obstruct the mitral orifice and cause mitral stenosis${S}.`
      : ` The mean gradient across the mitral valve is ${fmt(v.mg, 1)} mmHg at 70/min.`;
    const ag = uea ? ` With the enhancing agent the myxoma enhances in part, less than the myocardium: a myxoma has a poor blood supply${P}.` : '';
    return `<b>${LEAD.myxoma[v.grade]}.</b>${where}${move}${grad}${ag}`;
  }
  if (v.type === 'thrombus') {
    // the ischemic heart's own wall motion (wallScores): the apex dyskinetic, the rest of the LAD
    // territory akinetic, the other segments hypokinetic
    const wall = heart === 'icm' ? ' The LV is dilated: the rest of the LAD territory is akinetic, and the other segments are hypokinetic.' : '';
    if (v.grade === 'none') return `<b>${heart === 'icm' ? 'Dyskinetic' : 'Akinetic'} apex without thrombus.</b>${wall} The apex is clear. An LV thrombus forms where the wall motion is abnormal, most often in the apex after an anterior infarction${S}.${uea ? ` The enhancing agent fills the cavity to the endocardium${P}.` : ''}`;
    const kind = v.grade === 'mural'
      ? ' it is flat and parallel to the endocardium, with one surface toward the cavity: a mural thrombus'
      : v.grade === 'protruding'
        ? ' it stands into the cavity, with more than one surface toward the blood: a protruding thrombus'
        : ` it stands into the cavity, and ${an(fmt(v.mob))} ${fmt(v.mob)} mm part of it moves on its own: a mobile thrombus`;
    const risk = v.grade === 'mural'
      ? ` A mural thrombus has the lowest rate of embolism of the three types${S}.`
      : ` Mobile and protruding thrombi embolize more often than mural ones; 40% of embolic events occur with thrombi that are neither${S}.`;
    const ag = uea ? ` With the enhancing agent the cavity fills and the thrombus shows as a filling defect: a thrombus is generally avascular and does not enhance${P}.` : '';
    return `<b>${LEAD.thrombus[v.grade]}.</b> ${aN(fmt(v.T))} ${fmt(v.T)} × ${fmt(v.L)} mm mass lies on the ${apexWord(heart)} apex;${kind}${S}.${wall}${risk}${ag}`;
  }
  if (v.grade === 'none') return `<b>${LEAD.pfe.none}.</b> No mass lies on the aortic cusps. A papillary fibroelastoma on the aortic valve lies typically on the aortic side of a cusp${S}.${uea ? ` The enhancing agent fills the aortic root${P}.` : ''}`;
  const body = v.grade === 'sessile'
    ? ` ${aN(fmt(v.D))} ${fmt(v.D)} mm mass sits on the aortic side of ${cuspName(heart)}, on a broad base; it moves with the cusp.`
    : ` ${aN(fmt(v.D))} ${fmt(v.D)} mm mass with frond-like edges hangs on a short stalk from the aortic side of ${cuspName(heart)} and moves on its own.`;
  const risk = v.grade === 'mobile'
    ? ` Mobility was the only independent predictor of death or embolism from a fibroelastoma${cite('gowda2003')}.`
    : ` A fibroelastoma rarely causes significant valve dysfunction${S}.`;
  const ag = uea ? ` With the enhancing agent the root fills and the fibroelastoma stays dark: a fibroelastoma is generally avascular and does not enhance${P}.` : '';
  return `<b>${LEAD.pfe[v.grade]}.</b>${body}${risk}${ag}`;
}

const massesPage = {
  key: 'masses',
  part: 'masses',
  title: 'Cardiac masses and thrombus',
  nav: 'Masses',
  dwell: 30,
  defaults: { maS: 0.62, maType: 'myxoma', maUea: false },
  format: {
    maS: (x, s) => {
      const type = s ? typeOf(s) : 'myxoma';
      return s ? shown(s).grade : gradeOf(x, type);
    },
  },
  watch: ['maS', 'maType', 'maUea', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    const host = document.getElementById('masses-grades');
    let painted = '';
    const paint = (s) => {
      const type = typeOf(s), heart = heartOf(s);
      if (`${type}|${heart}` === painted) return;
      painted = `${type}|${heart}`;
      paintBands(host, bandsOf(type, heart), LEVEL, SHORT);
    };
    paint(state);
    subscribe?.((s, ch) => { if (TYPE in ch || 'pheno' in ch) paint(s); });
  },
  enter() { MAIN.start(); SECOND.start(); startWallMotion(); },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter)
  warm() { MAIN.start(); SECOND.start(); startWallMotion(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, bandsOf(typeOf(s), heartOf(s)));
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: the myxoma from none to large, the thrombus from none to mobile and then with
  // the enhancing agent, the fibroelastoma from none to mobile
  tourEnter(set) { set({ maS: 0, maType: 'myxoma', maUea: false }); },
  tourTick(tt, set) {
    const ramp = (a, b) => Math.round(clamp((tt - a) / (b - a), 0, 1) * 200) / 200;
    if (tt < 9.5) set({ maType: 'myxoma', maUea: false, maS: ramp(0.5, 8.5) });
    else if (tt < 20) set({ maType: 'thrombus', maUea: tt >= 17.5, maS: ramp(10, 17) });
    else set({ maType: 'pfe', maUea: false, maS: ramp(20.5, 28.5) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    const type = typeOf(s);
    if (type === 'myxoma') return 0.5 + s.maS * 8;
    if (type === 'thrombus') return s.maUea ? 17.5 : 10 + s.maS * 7;
    return 20.5 + s.maS * 8;
  },
  text(s, { cite }) {
    const v = shown(s), uea = !!s[UEA], heart = heartOf(s);
    const items = [];
    if (v.type === 'myxoma') {
      items.push({ k: 'Mass', v: v.L > 0 ? `${fmt(v.L, 1)} × ${fmt(v.W, 1)}` : 'none', u: v.L > 0 ? 'cm' : '', text: !(v.L > 0), flag: v.L > 0 });
      if (v.L > 0) items.push({ k: 'Attachment', v: 'fossa ovalis, stalk', text: true });
      if (v.L > 0) items.push({ k: 'Prolapse into LV', v: fmt(v.d, 1), u: 'cm', flag: v.d > 0 });
      items.push({ k: 'Mean MV gradient', v: fmt(v.mg, 1), u: 'mmHg', flag: v.mg >= 5 });
      if (uea && v.L > 0) items.push({ k: 'Enhancement', v: 'partial', text: true });
    } else if (v.type === 'thrombus') {
      items.push({ k: 'Thrombus', v: v.T > 0 ? `${fmt(v.T)} × ${fmt(v.L)}` : 'none', u: v.T > 0 ? 'mm' : '', text: !(v.T > 0), flag: v.T > 0 });
      if (v.T > 0) items.push({ k: 'Type', v: v.grade, text: true, flag: v.grade !== 'mural' });
      if (v.mob > 0) items.push({ k: 'Mobile part', v: fmt(v.mob), u: 'mm', flag: true });
      items.push({ k: 'Apex', v: apexWord(heart), text: true, flag: true });
      if (uea && v.T > 0) items.push({ k: 'Enhancement', v: 'none', text: true });
    } else {
      items.push({ k: 'Mass', v: v.D > 0 ? fmt(v.D) : 'none', u: v.D > 0 ? 'mm' : '', text: !(v.D > 0), flag: v.D > 0 });
      if (v.D > 0) items.push({ k: 'Attachment', v: v.stalk > 0 ? 'stalk, aortic side' : 'broad base, aortic side', text: true });
      if (v.D > 0) items.push({ k: 'Mobility', v: v.stalk > 0 ? 'mobile' : 'moves with the cusp', text: true, flag: v.stalk > 0 });
      if (uea && v.D > 0) items.push({ k: 'Enhancement', v: 'none', text: true });
    }
    return { readouts: items, live: liveOf(v, s, cite) };
  },
};
export default massesPage;
