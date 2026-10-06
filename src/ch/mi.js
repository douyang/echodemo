// Complications of myocardial infarction: one slider from no complication to the end stage, and a
// switch for the complication. Ventricular septal rupture: an apical septal rupture after an
// anterior infarction, from none to 18 mm; the left-to-right shunt grows, the RV systolic pressure
// rises and the LV-RV gradient falls; Qp/Qs from the two outflow tracts. Papillary muscle rupture:
// the posteromedial muscle after an inferior infarction, intact, then one head torn, then the
// whole muscle; the medial anterior leaflet flails into the LA with the muscle's head, and the MR
// is severe and eccentric, with a low, early-peaking jet as the LA pressure rises. Free-wall
// rupture: a contained rupture of the inferolateral wall, a pseudoaneurysm with a narrow neck that
// grows, then bleeds into the pericardium: an effusion, then tamponade. Aneurysm: the apex after an
// anterior infarction, akinetic, then dyskinetic, then a true aneurysm with a wide mouth and a thin
// wall, then a mural thrombus in it. The lesions are targets on the heart mesh or shapes drawn on
// the views' planes (gl/mimesh.js), sized as the page prints them.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit, meters, shown as shownAt } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { rvGrowOf } from '../meshcal.js';
import { blood, cavity, onPlane, hingesOf, leafletsOf, middle, sub, add, mul, dot, len, unit, perp } from '../meshjet.js';
import { vsrShapes, vsrOf, widthOf, pseudoShapes, pseudoOf, sacCaliper, aneurysmCalipers } from '../gl/mimesh.js';
import { massItems, planeOf } from '../gl/massesmesh.js';
import { loadModel } from '../model3d.js';
import { segmentMap, periScale } from './segments.js';
import { DB } from '../bmode.js';
import { ANEU } from '../mical.js';

const KEY = 'micS';
const CASE = 'micCase';
const CASES = ['vsr', 'pmr', 'fwr', 'lva'];

// ---------------------------------------------------------------- the model
// Tracks over the slider s for each complication: teaching values, whose relations (4V², Qp/Qs,
// the LA pressure) follow the cited sources. VSR: the rupture's diameter d (mm; Chen 2022 measured
// 13.9 ± 4.4 mm by echocardiography), the
// systolic blood pressure sbp and the RV systolic pressure rvsp of the model (mmHg), the outflow
// diameters (cm) and VTIs (cm) for Qp/Qs, and the RV basal diameter rvb (cm) of its volume load.
// PMR: the motion of the flail leaflet (flail, 0 to 1), the drawn head's length (cm), the systolic
// blood pressure, the LA pressure's trough (lap0) and v wave above it (vw), and the pulmonary
// veins' S and D waves (m/s). FWR: the neck and the sac's diameter (cm), the effusion (mm, the
// largest space at end-diastole), the share of the cycle the RA stays folded in (raCol), the RV
// free wall's early-diastolic collapse (rvCol, 0 to 1) and the heart rate. LVA: the apex's own
// motion (k: 1 normal, 0 akinetic, -0.35 dyskinetic as chapter Regional wall motion moves it), the
// aneurysm's weight (miAneu), and the thrombus's thickness and base (mm).
const TRACKS = {
  // the blood pressure holds while the RV pressure crosses 50 mmHg, so the printed RV pressure
  // (the blood pressure less 4V², V to 0.1 m/s) only rises there
  vsr: tracks([0, 0.08, 0.3, 0.5, 0.62, 0.8, 1], {
    d: [0, 3, 6, 10, 12, 15, 18],
    sbp: [120, 120, 116, 108, 98, 98, 88],
    rvsp: [28, 30, 34, 42, 47, 54, 60],
    rvotD: [2.2, 2.2, 2.25, 2.3, 2.35, 2.4, 2.5],
    rvotVti: [17, 18, 21, 26, 28, 32, 35],
    lvotD: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
    lvotVti: [21, 20.5, 20, 18.5, 17.5, 16.5, 15.5],
    rvb: [3.4, 3.4, 3.5, 3.8, 4.0, 4.2, 4.4],
  }),
  pmr: tracks([0, 0.12, 0.3, 0.55, 0.62, 0.8, 1], {
    flail: [0, 0, 0.6, 0.8, 1, 1, 1],
    head: [0, 0, 0.6, 0.75, 1.0, 1.2, 1.3],
    sbp: [122, 122, 112, 104, 98, 90, 84],
    lap0: [8, 8, 14, 18, 21, 24, 26],
    vw: [4, 4, 16, 24, 30, 36, 40],
    pvS: [0.55, 0.55, 0.12, -0.15, -0.25, -0.35, -0.42],
    pvD: [0.45, 0.45, 0.6, 0.7, 0.75, 0.8, 0.85],
  }),
  fwr: tracks([0, 0.08, 0.3, 0.5, 0.65, 0.8, 1], {
    neck: [0, 0.5, 0.7, 0.9, 1.0, 1.05, 1.1],
    sac: [0, 1.6, 2.6, 3.6, 4.0, 4.2, 4.4],
    eff: [0, 0, 0, 0, 9, 16, 22],
    raCol: [0, 0, 0, 0, 0.12, 0.3, 0.5],
    rvCol: [0, 0, 0, 0, 0, 0.5, 1],
    hr: [76, 76, 78, 80, 88, 102, 116],
    sbp: [118, 118, 116, 112, 104, 92, 78],
  }),
  lva: tracks([0, 0.2, 0.35, 0.45, 0.7, 1], {
    k: [0, 0, -0.35, -0.35, -0.35, -0.35],
    w: [0, 0, 0, 0, 1, 1],
    T: [0, 0, 0, 0, 0, 5],
    L: [0, 0, 0, 0, 0, 30],
  }),
};
// the thrombus appears at this slider position, at its smallest size (mm); it stays mural, no
// thicker than 0.35 of its half-base (the rule of chapter Cardiac masses and thrombus)
const LVA_T0 = 0.8, LVA_T_MIN = 2, LVA_L_MIN = 16;

/** The model at slider position s for complication c on heart: its values before rounding. */
function modelAt(c, s, heart) {
  const m = TRACKS[c](s);
  if (c === 'vsr' && s < 0.08) m.d = 0;
  if (c === 'fwr' && s < 0.08) { m.neck = 0; m.sac = 0; }
  if (c === 'lva') {
    const f = clamp((s - LVA_T0) / (1 - LVA_T0), 0, 1);
    m.T = s < LVA_T0 ? 0 : LVA_T_MIN + (5 - LVA_T_MIN) * f;
    m.L = s < LVA_T0 ? 0 : LVA_L_MIN + (30 - LVA_L_MIN) * f;
  }
  m.s = s;
  m.c = c;
  m.heart = heart;
  return m;
}

// the LA pressure through the beat (mmHg): its trough, and a v wave that rises through systole to
// its peak just before the mitral valve opens (as chapter Shunts draws the atria)
const T_V = EV.mvo - 13;
const vWave = (t) => Math.exp(-(((t - T_V) / (t < T_V ? 170 : 45)) ** 2));
/** The LV pressure (mmHg) at t: the cycle model's, scaled to a peak of sbp in systole. */
const lvP = (t, sbp) => cycleAt(t).lv * (sbp / 122);
const MR_T0 = EV.mvc, MR_T1 = EV.mvo;
/** The MR velocity (m/s) at t, from LV − LA = 4V² (Zoghbi 2017). */
function mrVel(t, m) {
  if (t < MR_T0 || t > MR_T1) return 0;
  const g = lvP(t, m.sbp) - (m.lap0 + m.vw * vWave(t));
  return g > 0 ? Math.sqrt(g / 4) : 0;
}
/** The MR jet's peak velocity, its time, and the share of the jet's duration before it. */
function mrPeak(m) {
  let vp = 0, tp = 0;
  for (let t = MR_T0; t <= MR_T1; t += 1) { const v = mrVel(t, m); if (v > vp) { vp = v; tp = t; } }
  return { vp, tp, at: (tp - MR_T0) / (MR_T1 - MR_T0) };
}
// the site's rule for an early peak: before 40% of the jet's duration (a parabolic jet peaks near
// the middle of systole; Zoghbi 2017 gives no number)
const EARLY = 0.4;
// mmHg: a mean LA pressure above it is raised (Lababidi 2025, as chapter Shunts uses it)
const LAP_UP = 15;

/**
 * Values as reported: each measurement at the decimals the page prints, and the grade and the
 * values derived from the rounded ones, so that no grade or sentence contradicts a number.
 */
function measure(raw) {
  const v = { ...raw };
  const c = raw.c;
  if (c === 'vsr') {
    v.d = shownAt(raw.d, 0);
    for (const k of ['rvotD', 'lvotD']) v[k] = shownAt(raw[k], 1);
    for (const k of ['rvotVti', 'lvotVti']) v[k] = shownAt(raw[k], 0);
    v.qpqs = shownAt((v.rvotD ** 2 * v.rvotVti) / (v.lvotD ** 2 * v.lvotVti), 1);
    v.sbp = shownAt(raw.sbp, 0);
    // the peak velocity across the rupture from the pressures of the model, LV − RV = 4V²
    // (Konstantinides 1997), then the gradient and the RV pressure from the printed velocity
    v.vmax = v.d > 0 ? shownAt(Math.sqrt(Math.max(0, raw.sbp - raw.rvsp) / 4), 1) : 0;
    v.grad = shownAt(4 * v.vmax ** 2, 0);
    v.rvsp = v.sbp - v.grad;
    v.rvb = shownAt(raw.rvb, 1);
    // the RV systolic pressure moderately raised or more: 50 mmHg or more (Mukherjee 2025 Table 1)
    v.raised = v.d > 0 && v.rvsp >= 50;
    v.grade = v.d === 0 ? 'none' : v.raised ? 'raised' : v.qpqs >= 1.5 ? 'significant' : 'small';
  } else if (c === 'pmr') {
    v.sbp = shownAt(raw.sbp, 0);
    v.head = shownAt(raw.head, 1);
    v.torn = raw.flail <= 0 ? 'none' : raw.s < 0.6 ? 'head' : 'muscle';
    if (v.torn === 'none') {
      v.vmax = 0; v.lap = null; v.early = false;
    } else {
      const P = mrPeak(raw);
      v.vmax = shownAt(P.vp, 1);
      v.at = shownAt(P.at * 100, 0);
      v.early = v.at < EARLY * 100;
      v.grad = shownAt(4 * v.vmax ** 2, 0);
      // LA pressure = systolic blood pressure − the peak MR gradient (Gorcsan 1991)
      v.lap = v.sbp - v.grad;
    }
    v.pvS = shownAt(raw.pvS, 2);
    v.pvD = shownAt(raw.pvD, 2);
    v.reversal = v.pvS < 0;
    v.grade = v.torn === 'none' ? 'intact' : v.torn === 'head' ? 'partial' : 'complete';
  } else if (c === 'fwr') {
    v.neck = shownAt(raw.neck, 1);
    v.sac = shownAt(raw.sac, 1);
    v.ratio = v.sac > 0 ? shownAt(v.neck / v.sac, 2) : 0;
    v.eff = shownAt(raw.eff, 0);
    v.raColPct = shownAt(raw.raCol * 100, 0);
    v.rvCol = raw.rvCol > 0.05;
    v.hr = shownAt(raw.hr, 0);
    v.sbp = shownAt(raw.sbp, 0);
    v.effGrade = v.eff < 1 ? 'none' : v.eff < 10 ? 'small' : v.eff <= 20 ? 'moderate' : 'large';
    // tamponade: RA collapse for more than a third of the cycle, or RV diastolic collapse (Klein 2013)
    v.tamp = v.raColPct > 33 || v.rvCol;
    v.grade = v.sac <= 0 ? 'none' : v.tamp ? 'tamponade' : v.eff >= 1 ? 'effusion' : 'pseudo';
  } else {
    v.k = raw.k;
    // the aneurysm's weight in steps of 0.1, the steps that src/mical.js measured
    v.w = Math.round(clamp(raw.w, 0, 1) * 10) / 10;
    const A = aneurysmAt(raw.heart, v.w);
    v.mouth = shownAt(A.mouth, 1);
    v.width = shownAt(A.width, 1);
    v.ratio = shownAt(v.mouth / v.width, 2);
    v.T = shownAt(raw.T, 0);
    v.L = shownAt(raw.L, 0);
    v.motion = raw.k > -0.05 ? 'akinetic' : 'dyskinetic';
    // an aneurysm: a focal dilatation (Lang 2015), the cavity below the mouth wider than the mouth
    v.aneurysm = v.w > 0 && v.width > v.mouth;
    v.grade = v.aneurysm ? (v.T > 0 ? 'thrombus' : 'aneurysm') : v.motion;
  }
  return v;
}

/**
 * The aneurysm on the four-chamber view at end-diastole for heart at weight w (src/mical.js,
 * measured on the mesh as aneurysmCalipers measures it): the mouth and the largest width parallel
 * to it below (cm).
 */
function aneurysmAt(heart, w) {
  const T = ANEU[heart] || ANEU.normal;
  const row = T[Math.round(clamp(w, 0, 1) * (T.length - 1))];
  return { mouth: row[0], width: row[1] };
}

const heartOf = (s) => s.pheno || 'normal';
const caseOf = (s) => (CASES.includes(s[CASE]) ? s[CASE] : 'vsr');
let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = `${s[KEY]}|${caseOf(s)}|${heartOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(modelAt(caseOf(s), s[KEY], heartOf(s))); }
  return lastShown;
}
/** The values the page prints at slider position x for complication c on heart (for the checks). */
export const valuesAt = (c, x, heart = 'normal') => measure(modelAt(c, x, heart));
export const gradeOf = (x, c = 'vsr', heart = 'normal') => valuesAt(c, x, heart).grade;

// the grades of each complication, in order, their levels and short names under the slider
const LEVEL = { none: 0, small: 1, significant: 2, raised: 3, intact: 0, partial: 2, complete: 3, pseudo: 1, effusion: 2, tamponade: 3, akinetic: 1, dyskinetic: 1, aneurysm: 2, thrombus: 3 };
const LABEL = {
  vsr: { none: 'no rupture', small: 'small', significant: 'Qp/Qs ≥1.5', raised: 'RVSP ≥50' },
  pmr: { intact: 'intact', partial: 'one head', complete: 'whole muscle' },
  fwr: { none: 'no rupture', pseudo: 'pseudoaneurysm', effusion: 'effusion', tamponade: 'tamponade' },
  lva: { akinetic: 'akinetic', dyskinetic: 'dyskinetic', aneurysm: 'aneurysm', thrombus: 'thrombus' },
};
const SHORT = {
  vsr: { 'no rupture': 'none', 'Qp/Qs ≥1.5': '≥1.5', 'RVSP ≥50': 'RVSP' },
  pmr: { 'one head': 'head', 'whole muscle': 'muscle' },
  fwr: { 'no rupture': 'none', pseudoaneurysm: 'pseudo.', effusion: 'effus.', tamponade: 'tamp.' },
  lva: { akinetic: 'akin.', dyskinetic: 'dyskin.', aneurysm: 'aneur.', thrombus: 'thromb.' },
};
const BANDS_OF = new Map();
/** The grades along the slider for complication c on heart. */
function bandsOf(c, heart) {
  const k = `${c}|${heart}`;
  if (!BANDS_OF.has(k)) BANDS_OF.set(k, bands((x) => gradeOf(x, c, heart)));
  return BANDS_OF.get(k);
}

let sheet = null, st = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- the panels
// The views cut from the heart mesh (meshpanel.js), on the heart the page shows. A panel can draw
// the chapter's shapes into the image (echo.js setShapes), as chapter Shunts does.
const redraw = () => { if (sheet) sheet.dirty = true; };
class MiPanel extends MeshPanel {
  draw(ctx, P, title, o = {}) {
    if (this.ev) {
      this.ev.setShapes(o.shapes || null);
      if ((o.shapesKey || '') !== this.shapesKey) { this.shapesKey = o.shapesKey || ''; this.last = ''; }
    }
    return super.draw(ctx, P, title, o);
  }
}
// the effusion and the signs of tamponade (chapter Pericardial effusion's targets)
const PERI = ['eff', 'effAnt', 'under', 'raIn', 'rvIn', 'sep', 'swing', 'bob'];
const P_VSR = new MiPanel('a4c', { diseases: ['rvGrow'], redraw });
const P_PMR = new MiPanel('a3c', { diseases: ['miFlail'], lv: true, redraw });
const P_FW = new MiPanel('plax', { diseases: PERI, redraw });
const P_FW4 = new MiPanel('a4c', { diseases: PERI, redraw });
const P_LVA4 = new MiPanel('a4c', { diseases: ['miAneu'], redraw });
const P_LVA2 = new MiPanel('a2c', { diseases: ['miAneu'], redraw });
const PANELS = [P_VSR, P_PMR, P_FW, P_FW4, P_LVA4, P_LVA2];
/** The panels' views, for the checks that measure the image against the printed values. */
export const viewsOf = () => ({ vsr: P_VSR.ev, pmr: P_PMR.ev, fw: P_FW.ev, fw4: P_FW4.ev, lva4: P_LVA4.ev, lva2: P_LVA2.ev });

// The infarct's wall motion: the apical segments (13 to 17) take the share k of their own motion
// (0 akinetic; negative, outward: dyskinetic). On the ischemic heart the motion is the heart's own
// (its LAD territory akinetic, its apex dyskinetic).
let wm = null;   // { m, map } once the segment map is built (ch/segments.js)
const APICAL = new Set([13, 14, 15, 16, 17]);
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
    console.error('mi: segment map failed', err);
    wm = { failed: true };
  }
}
/**
 * The infarct's wall motion on heart: the segments segs (the apical ones by default) take the share
 * k of their own motion, the others the heart's own. { key, scale, peri }, or null (the heart's own).
 */
function apexMotion(heart, k, segs = APICAL) {
  if (heart === 'icm' || !wm || !wm.map) return null;
  const q = Math.round(k * 100) / 100, key = `mi|${heart}|${q}|${[...segs].join(',')}`;
  if (SCALES.has(key)) return SCALES.get(key);
  // the Barlow heart's LV moves 1.3 times the normal heart's (as chapter Cardiac masses and thrombus)
  const own = heart === 'barlow' ? 1.3 : 1, map = wm.map;
  const scale = new Float32Array(map.mem.length).fill(1);
  map.mem.forEach((mm, i) => {
    if (!mm) return;
    let a = 0, w = 0;
    for (const [seg, c] of mm) { a += c * (segs.has(seg) ? q : own); w += c; }
    scale[i] = a / w;
  });
  const out = { key, scale, peri: periScale(map, scale) };
  if (SCALES.size > 24) SCALES.delete(SCALES.keys().next().value);
  SCALES.set(key, out);
  return out;
}
// the inferior and inferolateral segments, basal and mid (chapter Regional wall motion's numbers)
const INFEROLATERAL = new Set([4, 5, 10, 11]);

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

/** A cavity on the plane round the blood nearest p (cm), or null when it is too small. */
function chamber(ev, p, r = 1.2, cuts = []) {
  const P = cavity(ev, blood(ev, p, r), cuts);
  return P.length >= 12 ? P : null;
}
/** The outline P (cm) turned so that its signed area is positive. */
function turned(P) {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]);
  return a < 0 ? P.slice().reverse() : P;
}
/** One outline round two outlines that overlap (cm), for the jet's clip (as chapter Shunts joins them). */
function joined(a, b) {
  if (!a || !b) return a || b;
  a = turned(a); b = turned(b);
  let k = 0, best = Infinity;
  b.forEach((p, i) => { const d = Math.hypot(p[0] - a[0][0], p[1] - a[0][1]); if (d < best) { best = d; k = i; } });
  return [...a, a[0], ...b.slice(k), ...b.slice(0, k), b[k], a[0]];
}
/**
 * A jet through a cut D ({ cut, axis }): from where the cut opens on the side it leaves, through it,
 * into the chamber it enters (j.clip), with its convergence zone in the chamber it leaves (j.pclip).
 */
function cutJet(c, F, D, j) {
  const [lo, hi] = D.cut.span || [0, 0];
  const o = { ...j, O: add(D.cut.p0, mul(D.axis, lo)), dir: D.axis, jl: j.jl + hi - lo, clip: joined(j.clip, D.cut.poly), box: false };
  // jet() paints into one canvas that every jet shares: an empty jet over a larger box first
  const none = [[0, 0], [0, 0], [0, 0]];
  jet(c, { ...F, clipBox: new Path2D() }, { ...o, jl: o.jl + 1, jw: o.jw + 1, a: 1, clip: none, pclip: none });
  return jet(c, F, o);
}
/**
 * One color box round the extents of the jets drawn (echo2d.js jet with box: false), as the
 * scanner outlines it (as chapter Hypertrophic cardiomyopathy draws it), kept inside the sector.
 */
function colorBox(ctx, F, list) {
  const B = list.filter(Boolean);
  if (!B.length) return;
  const half = ((F.sect.deg || 90) / 2) * (Math.PI / 180) - 0.01;
  const t0 = Math.max(-half, Math.min(...B.map((b) => b.t0))), t1 = Math.min(half, Math.max(...B.map((b) => b.t1)));
  const r0 = Math.min(...B.map((b) => b.r0)), r1 = Math.min(F.sect.R || Infinity, Math.max(...B.map((b) => b.r1))), { sect } = F;
  if (!(t1 > t0)) return;
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

/** A circle round C of radius r (cm) as a polygon, counterclockwise. */
function circle(C, r, n = 40) {
  return Array.from({ length: n }, (_, i) => add(C, [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]));
}
/** Polygon P clipped by the convex polygon K (Sutherland-Hodgman). */
function clipConvex(P, K) {
  K = turned(K);
  let out = P;
  for (let i = 0; i < K.length && out.length; i++) {
    const a = K[i], b = K[(i + 1) % K.length], e = sub(b, a);
    const inside = (p) => e[0] * (p[1] - a[1]) - e[1] * (p[0] - a[0]) >= 0;
    const cross = (p, q) => {
      const d = sub(q, p), den = e[0] * d[1] - e[1] * d[0];
      const t = Math.abs(den) < 1e-12 ? 0 : (e[1] * (p[0] - a[0]) - e[0] * (p[1] - a[1])) / den;
      return add(p, mul(d, t));
    };
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], pi = inside(p), qi = inside(q);
      if (pi) out.push(p);
      if (pi !== qi) out.push(cross(p, q));
    }
  }
  return out;
}

// ---------------------------------------------------------------- ventricular septal rupture
const VA = 60;   // cm/s, the color scale (as chapter Shunts draws a VSD)
/** The shunt's flow (and its CW envelope) through the cycle, 0 to 1: holosystolic, from the onset of LV contraction. */
const VSR_T0 = 20, VSR_T1 = 395;
const vsrFlow = (t) => { const w = (t - VSR_T0) / (VSR_T1 - VSR_T0); return w > 0 && w < 1 ? Math.pow(Math.sin(Math.PI * w), 0.35) : 0; };
/** Where the RV's name goes: its open blood 2.5 cm from the tricuspid annulus into the RV. */
function rvName(ev, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), apex = onPlane(ev, ev.anchors(s).apex);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  return blood(ev, add(M, mul(nrm, 2.5)));
}

/** The four-chamber view: the apical septal rupture, its left-to-right jet in systole and its caliper. */
function vsrView(ctx, box, v, tt) {
  const heart = heartOf(st), reg = apexMotion(heart, 0);
  const disease = v.rvb > 3.45 ? { rvGrow: rvGrowOf(heart, v.rvb) } : {};
  P_VSR.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER · COLOR ${VA} cm/s`, `A4C · COLOR ${VA} cm/s`, 'A4C']), {
    tms: tt, disease, ...(reg ? { regional: reg, noSys: heart === 'barlow' } : {}),
    shapes: vsrShapes(v.d, 'a4c'), shapesKey: `vsr|${v.d}`,
    names: [['lv', 'LV', 'mv', 0.35], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    over: (c, F, ev) => {
      const D = vsrOf(ev);
      if (!D || !D.axis) return;
      const O = D.cut.c, dir = D.axis;
      const RV = chamber(ev, add(O, mul(dir, 1.1)), 0.8), LV = chamber(ev, sub(O, mul(dir, 1.1)), 0.8);
      const a = vsrFlow(cycleAt(tt).t);
      const q = Math.PI * (v.d / 20) ** 2 * v.vmax * 100;
      // the convergence zone, in the LV within a radius that grows with the rupture
      const O1 = add(D.cut.p0, mul(dir, (D.cut.span || [0, 0])[0]));
      const near = LV ? clipConvex(LV, circle(O1, 0.6 + 0.05 * v.d)) : null;
      colorBox(c, F, [cutJet(c, F, D, { q, va: VA, vc: v.d / 10, jl: 1.4 + 2.2 * (v.d / 10), jw: 0.3 + 0.7 * (v.d / 10), a, clip: RV, pclip: near && near.length > 2 ? near : LV })]);
      barFor(c, F, -VA, VA);
      const K = widthOf(D);
      if (K) cal(c, F, K[0], K[1], '', { solid: true });
    },
    lines: v.d ? [`rupture ${v.d} mm`, ['apical septum · L→R', 'L→R']] : ['septum intact', ['apex akinetic', 'akinetic']],
  });
}

/** CW through the rupture: the holosystolic jet toward the probe, its peak and the RV systolic pressure. */
function vsrCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · SEPTAL RUPTURE', 'CW · VSR'));
  const bx = inner(P);
  if (!v.d) {
    note(ctx, bx, ['no flow across the septum', 'no shunt'], 'top');
    return bx;
  }
  const base = 0.86, vs = Math.max(5, Math.ceil(v.vmax + 0.6));
  const fn = (u) => v.vmax * vsrFlow((u * 2 * RR) % RR);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.4, key: `mivsr|${v.vmax}|${vs}`, seed: 63 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * base) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X((VSR_T0 + VSR_T1) / 2), yp = y0 - v.vmax * k;
  caliper(ctx, xp - 14, yp, xp + 14, yp, { solid: true });
  note(ctx, bx, [`peak ${v.vmax.toFixed(1)} m/s · 4V² ${v.grad} mmHg · RVSP ${v.sbp} − ${v.grad} = ${v.rvsp} mmHg`, `${v.vmax.toFixed(1)} m/s · RVSP ${v.sbp} − ${v.grad} = ${v.rvsp}`, `${v.vmax.toFixed(1)} m/s · RVSP ${v.rvsp}`], 'bottom');
  return bx;
}

/** An outflow tract's velocity (m/s) at time t, from its VTI (cm): ejection from t0 for et ms, peaking at fraction k. */
function outflowV(t, vti, t0, et, k) {
  const u = (t - t0) / et;
  if (u <= 0 || u >= 1) return 0;
  const shape = u < k ? Math.sin((u / k) * Math.PI / 2) : Math.cos(((u - k) / (1 - k)) * Math.PI / 2) ** 0.8;
  return (vti / 100) / ((et / 1000) * OUT_AREA[k]) * shape;
}
// the area under each shape over unit time, so that the envelope's integral is its VTI
const OUT_AREA = {};
for (const k of [0.3, 0.4]) {
  let a = 0;
  for (let i = 0; i < 2000; i++) { const u = (i + 0.5) / 2000; a += (u < k ? Math.sin((u / k) * Math.PI / 2) : Math.cos(((u - k) / (1 - k)) * Math.PI / 2) ** 0.8) / 2000; }
  OUT_AREA[k] = a;
}
const RVOT = { t0: EV.avo - 5, et: 320, k: 0.4 }, LVOT = { t0: EV.avo, et: EV.avc - EV.avo, k: 0.3 };
/** PW in an outflow tract: the flow away from the probe, its VTI traced on the first beat. */
function outflowPW(ctx, P, v, side) {
  const rv = side === 'rv', O = rv ? RVOT : LVOT, vti = rv ? v.rvotVti : v.lvotVti, d = rv ? v.rvotD : v.lvotD;
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, rv ? 'PW · RVOT · SHORT AXIS' : 'PW · LVOT · APICAL FIVE-CHAMBER', rv ? 'PW · RVOT' : 'PW · LVOT'));
  const bx = inner(P);
  const peak = outflowV(O.t0 + O.k * O.et, vti, O.t0, O.et, O.k);
  const base = 0.16, vs = Math.max(1, Math.ceil((peak + 0.25) * 5) / 5);
  const fn = (u) => -outflowV((u * 2 * RR) % RR, vti, O.t0, O.et, O.k);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.16, key: `mi${side}|${vti}|${vs}`, seed: rv ? 61 : 62 });
  vscale(ctx, bx, vs, base, 0.5);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = O.t0 + (i / 40) * O.et, y = y0 + outflowV(t, vti, O.t0, O.et, O.k) * k;
    i ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y);
  }
  ctx.stroke();
  ctx.restore();
  const sv = Math.round(Math.PI * (d / 2) ** 2 * vti);
  note(ctx, bx, [`VTI ${vti} cm · Ø ${d.toFixed(1)} cm · SV ${sv} mL`, `VTI ${vti} cm · Ø ${d.toFixed(1)} cm`, `${vti} cm · ${d.toFixed(1)} cm`], 'bottom');
  return bx;
}

// ---------------------------------------------------------------- papillary muscle rupture
// The flail's motion within the beat follows the mitral valve's closure (the cycle model's drive):
// all of it while the valve is shut, none while it is open.
const flailAt = (tt, v) => v.flail * clamp(cycleAt(tt).drive.mv, 0, 1);
/** The mitral leaflets on the plane: the anterior one (its hinge nearer the aortic valve) and the posterior one, each { hinge, pts, tip }. */
function leaflets(ev, s) {
  const h = hingesOf(ev, 'MitralValve');
  if (!h) return null;
  const av = onPlane(ev, ev.anchors(s).av);
  const [ha, hp] = len(sub(h[0], av)) < len(sub(h[1], av)) ? [h[0], h[1]] : [h[1], h[0]];
  const L = leafletsOf(ev, 'MitralValve');
  if (!L.length) return null;
  const near = (H) => {
    let best = null, bd = Infinity;
    for (const P of L) for (const q of P) { const d = len(sub(q, H)); if (d < bd) { bd = d; best = P; } }
    return best;
  };
  const one = (H) => {
    const P = near(H);
    if (!P) return null;
    let tip = P[0];
    for (const q of P) if (len(sub(q, H)) > len(sub(tip, H))) tip = q;
    return { hinge: H, pts: P, tip };
  };
  const a = one(ha), p = one(hp);
  return a && p && a.pts !== p.pts ? { a, p, ha, hp } : null;
}
/** The torn head of the papillary muscle on the plane: an oval past the anterior leaflet's tip, along the leaflet. */
function headItems(ev, v, tt) {
  if (!(v.head > 0)) return [];
  const s = cycleAt(tt).s, Lf = leaflets(ev, s);
  if (!Lf) return [];
  const A = Lf.a, dir = unit(sub(A.tip, A.hinge)), n = perp(dir);
  const Lh = v.head, Wh = 0.62 * v.head, C = add(A.tip, mul(dir, 0.18 + Lh / 2));
  // it swings a little on its chordae, out of step with the beat
  const wob = cine.live ? 0.12 * Math.sin((2 * Math.PI * beat.ms) / 600) : 0;
  const d2 = unit(add(dir, mul(n, wob))), n2 = perp(d2);
  const poly = [];
  for (let k = 0; k < 40; k++) {
    const th = (2 * Math.PI * k) / 40, r = 1 + 0.08 * Math.sin(3 * th + 1) + 0.05 * Math.sin(5 * th);
    poly.push(add(C, add(mul(d2, (Lh / 2) * Math.cos(th) * r), mul(n2, (Wh / 2) * Math.sin(th) * r))));
  }
  return [
    { lines: [[A.tip, add(A.tip, mul(dir, 0.2))]], e: DB.chord + 4, w: 0.05 },
    { polys: [poly], e: DB.myo + 2 },
    { borders: [poly], e: DB.myo + 8, spec: 6, w: 0.07, closed: true, all: true },
  ];
}
/** Whether point q lies inside polygon P (even-odd rule). */
function insidePoly(P, q) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > q[1]) !== (P[j][1] > q[1]) && q[0] < ((P[j][0] - P[i][0]) * (q[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}
/** Where the ray from O along dir leaves the polygon P (cm), and the edge it crosses: { t, a, b }, or null. */
function exitOf(P, O, dir) {
  let best = null;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], e = sub(b, a), den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, O), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, a, b };
  }
  return best;
}
/**
 * The eccentric MR jet, away from the flail anterior leaflet (Zoghbi 2017): from the gap between
 * the posterior leaflet's tip and the everted anterior leaflet toward the posterior wall of the
 * LA, then along that wall into the depth of the LA (a wall-hugging jet). Two straight parts:
 * [{ O, dir, jl }, ...], with the LA's outline as their clip, and the LV's for the convergence.
 */
function pmrJet(ev, s) {
  const Lf = leaflets(ev, s);
  if (!Lf) return null;
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle([Lf.ha, Lf.hp]);
  let up = perp(unit(sub(Lf.hp, Lf.ha)));
  if (dot(sub(apex, M), up) > 0) up = mul(up, -1);   // toward the LA
  let O = add(mul(add(Lf.p.tip, Lf.a.tip), 0.5), mul(up, 0.1));
  const post = unit(sub(Lf.hp, Lf.ha));
  const LA = cavity(ev, blood(ev, onPlane(ev, an.la)), [[Lf.ha, Lf.hp]]);
  if (LA.length < 12) return null;
  // tethered leaflets (the ischemic heart) meet below the annulus: the jet then starts where it enters the LA
  for (let k = 0; k < 30 && !insidePoly(LA, O); k++) O = add(O, mul(up, 0.1));
  const LV = chamber(ev, sub(M, mul(up, 1.5)), 0.8);
  // toward the posterior wall, then along it, away from the annulus
  const d1 = unit(add(mul(up, 0.6), mul(post, 0.8)));
  const hit = exitOf(LA, O, d1);
  if (!hit || hit.t < 0.6) {
    const far = exitOf(LA, O, up);
    return { parts: [{ O, dir: up, jl: Math.min(4.6, (far ? far.t : 3) * 0.95) }], clip: LA, LV };
  }
  let tg = unit(sub(hit.b, hit.a));
  if (dot(tg, up) < 0) tg = mul(tg, -1);
  const l1 = Math.max(0.4, hit.t - 0.35), H = add(O, mul(d1, l1));
  // the second part starts where the first nears the wall, 3 mm in from it, and runs along it
  const nIn = dot(perp(tg), sub(O, hit.a)) > 0 ? perp(tg) : mul(perp(tg), -1);
  const O2 = add(add(O, mul(d1, hit.t)), mul(nIn, 0.3));
  const along = exitOf(LA, O2, tg);
  const l2 = Math.min(4.2, (along ? along.t : 3) * 0.92);
  return { parts: [{ O, dir: d1, jl: l1 + 0.2 }, { O: add(O2, mul(tg, -0.25)), dir: tg, jl: l2 }], clip: LA, LV, H };
}
/** Where the LA's name goes beside the jet: 1.2 cm into the LA from its middle, toward its anterior side. */
function laName(ev, s) {
  const Lf = leaflets(ev, s);
  if (!Lf) return null;
  const an = ev.anchors(s), apex = onPlane(ev, an.apex), M = middle([Lf.ha, Lf.hp]);
  let up = perp(unit(sub(Lf.hp, Lf.ha)));
  if (dot(sub(apex, M), up) > 0) up = mul(up, -1);
  const ant = unit(sub(Lf.ha, Lf.hp));
  return blood(ev, add(add(onPlane(ev, an.la), mul(up, 1.2)), mul(ant, 0.5)), 0.6);
}
const VA_MR = 60;
// the LV's own contraction with acute severe MR: hyperdynamic (Zoghbi 2017)
const LV_HYPER = 1.25;
/** The apical three-chamber view: the flail anterior leaflet with the torn head in the LA in systole, and the eccentric jet. */
function pmrView(ctx, box, v, tt) {
  const sy = cycleAt(tt).s, f = flailAt(tt, v);
  P_PMR.draw(ctx, box, titleOf(ctx, box.w, [`APICAL THREE-CHAMBER · COLOR ${VA_MR} cm/s`, `A3C · COLOR ${VA_MR} cm/s`, 'A3C']), {
    tms: tt, motion: f > 0 ? { miFlail: Math.round(f * 100) / 100 } : {}, lvK: v.torn === 'none' ? 1 : LV_HYPER,
    underWalls: (ev) => headItems(ev, v, tt), underKey: `${v.head}|${cine.live ? Math.round(beat.ms / 40) : 0}`,
    names: [['lv', 'LV', 'mv', 0.3], [v.torn === 'none' ? 'la' : laName, 'LA'], ['ao', 'Ao']],
    over: (c, F, ev) => {
      if (v.torn === 'none') return;
      const t = cycleAt(tt).t, vm = mrVel(t, v);
      if (!(vm > 0.4)) return;
      const J = pmrJet(ev, sy);
      if (!J) return;
      const a = clamp(vm / Math.max(0.1, v.vmax), 0, 1);
      // the first part with its convergence zone in the LV, the second along the wall, wider
      const [p1, p2] = J.parts;
      colorBox(c, F, [
        jet(c, F, { q: 90 + 50 * v.flail, va: VA_MR, vmax: 1.8 * VA_MR, keep: 0.6, vc: 0.6, jl: p1.jl, jw: 0.9, a, O: p1.O, dir: p1.dir, clip: J.clip, pclip: J.LV, pisa: !!J.LV, box: false }),
        p2 ? jet(c, F, { q: 90 + 50 * v.flail, va: VA_MR, vmax: 1.5 * VA_MR, keep: 0.2, vc: 0.8, jl: p2.jl, jw: 1.3, a, O: p2.O, dir: p2.dir, clip: J.clip, pisa: false, box: false }) : null,
      ]);
      barFor(c, F, -VA_MR, VA_MR);
    },
    lines: v.torn === 'none' ? ['papillary muscle intact', ['leaflets coapt', 'coapt']] : [v.torn === 'head' ? ['one head torn', 'head torn'] : ['muscle torn', 'torn'], ['flail anterior leaflet', 'flail AML']],
  });
}

/** CW through the mitral valve from the apex: the MR jet away from the probe, triangular and early peaking as the v wave grows. */
function mrCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · MITRAL REGURGITATION', 'CW · MR'));
  const bx = inner(P);
  const base = 0.08, vs = 6;
  if (v.torn === 'none') {
    vscale(ctx, bx, vs, base, 2);
    note(ctx, bx, ['no regurgitation', 'no MR'], 'bottom');
    return bx;
  }
  const q = (x) => Math.round(x * 2) / 2;
  const m = { sbp: v.sbp, lap0: q(v.lap0), vw: q(v.vw) };
  const fn = (u) => -mrVel((u * 2 * RR) % RR, m);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.32, key: `mimr|${m.sbp}|${m.lap0}|${m.vw}|${vs}`, seed: 12 });
  vscale(ctx, bx, vs, base, 2);
  // the peak, with a caliper, in the first beat
  const P0 = mrPeak(m), k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X(P0.tp), yp = y0 + v.vmax * k;
  caliper(ctx, xp - 12, yp, xp + 12, yp, { solid: true });
  const shape = v.early ? 'triangular, early peak' : 'parabolic';
  note(ctx, bx, [`peak ${v.vmax.toFixed(1)} m/s at ${v.at}% of the jet · ${shape}`, `${v.vmax.toFixed(1)} m/s · ${shape}`, `${v.vmax.toFixed(1)} m/s`], 'bottom');
  return bx;
}
/** Pulmonary vein, PW: S and D toward the probe, atrial reversal Ar below the baseline; S reverses in severe MR. */
function pvPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RIGHT UPPER PULMONARY VEIN', 'PW · PULM. VEIN'));
  const bx = inner(P);
  const S = v.pvS, D = v.pvD, Ar = -0.25;
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR, tt = t < 60 ? t + RR : t;
    return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
  };
  // a short or narrow strip keeps the waves and their names under the note at its top
  const vs = bx.h < 170 || bx.w < 320 ? 1.5 : 1.0;
  spectral(ctx, bx, { fn, scale: vs, base: 0.55, mode: 'pw', broad: 0.12, key: `mipv|${S}|${D}|${vs}`, seed: 21 });
  vscale(ctx, bx, vs, 0.55, 0.5, '');
  const y0 = bx.y + 0.55 * bx.h, k = (bx.h * 0.55) / vs, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  ctx.fillText('S', X(RR + 250), S >= 0 ? y0 - S * k - 5 : y0 - S * k + 13);
  ctx.fillText('D', X(RR + 540), y0 - D * k - 5);
  ctx.restore();
  note(ctx, bx, v.reversal ? ['systolic flow reversal', 'S reversed'] : S < 0.4 ? ['systolic flow blunted', 'S blunted'] : ['systolic dominance', 'S > D'], 'top');
  return bx;
}

// ---------------------------------------------------------------- free-wall rupture
// The effusion and the signs of tamponade, as chapter Pericardial effusion moves them: the sac out
// from the heart, the RA and RV free walls folding in, the septum's shift with breathing and the
// heart's swing. The breath runs at 15 a minute on the beat's clock.
const BREATH = 4000;
const clock = { ms: 0 };
const breath = (ms) => Math.sin((2 * Math.PI * ms) / BREATH);
const bumpIn = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
/** The sac's targets (cm) from the effusion as printed: the mesh's own 1.7 mm, and the underfilled chambers' 3.7 mm, taken off (as chapter Pericardial effusion). */
function sacOf(v) {
  const e = v.eff / 10, tamp = v.tamp ? clamp(v.raColPct / 50, 0.3, 1) : 0;
  return { eff: Math.max(0, e - 0.17 - 0.37 * tamp), effAnt: Math.max(0, e - 0.6) * 0.75, under: tamp };
}
/** The moves within the beat (cm) at phase f of the beat: the RA and RV walls fold in, the septum shifts, the heart swings. */
function movesOf(v, f) {
  const w = v.raColPct / 100, a0 = 1 - 0.55 * w, a1 = 0.45 * w;
  let ra = 0;
  if (w > 0.01) {
    const x = f >= a0 ? (f - a0) / w : f <= a1 ? (f + 1 - a0) / w : -1;
    if (x >= 0 && x <= 1) ra = Math.sin(Math.PI * x) * Math.min(1, 0.4 + 1.6 * w);
  }
  const rv = (v.rvCol ? 1 : 0) * bumpIn(f, 0.5, 0.78, 0.6);
  const tamp = v.tamp ? 1 : 0, sw = 0.6 * clamp(v.eff / 22, 0, 1) * tamp, p = Math.PI * (clock.ms / RR);
  return { raIn: 1.2 * ra, rvIn: 0.8 * rv, sep: 0.45 * tamp * breath(clock.ms), swing: sw * Math.sin(p), bob: 0.35 * sw * Math.cos(p) };
}
const VA_FW = 60;
/** The parasternal long axis: the pseudoaneurysm behind the inferolateral wall, its neck and sac with calipers, and flow into it in systole. */
function fwView(ctx, box, v, tt) {
  const S = sacOf(v), f = (tt % RR) / RR, { raIn, ...mv } = movesOf(v, f), heart = heartOf(st), reg = apexMotion(heart, 0, INFEROLATERAL);
  P_FW.draw(ctx, box, titleOf(ctx, box.w, [`PARASTERNAL LONG AXIS · COLOR ${VA_FW} cm/s`, `PLAX · COLOR ${VA_FW} cm/s`, 'PLAX']), {
    tms: tt, disease: S, motion: mv, standoff: S.effAnt, deeper: S.effAnt + 1, sac: true, still: clamp(S.eff / 0.5, 0, 1),
    ...(reg ? { regional: reg, noSys: heart === 'barlow' } : {}),
    shapes: pseudoShapes(v.neck, v.sac, 'plax'), shapesKey: `fw|${v.neck}|${v.sac}`,
    names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      const Q = pseudoOf(ev);
      if (!Q) return;
      const t = cycleAt(tt).t, a = t > EV.avo && t < EV.avc ? Math.pow(Math.sin((Math.PI * (t - EV.avo)) / (EV.avc - EV.avo)), 0.5) : 0;
      const LV = chamber(ev, sub(Q.neck.p0, mul(Q.axis, 1.0)), 0.8);
      colorBox(c, F, [cutJet(c, F, { cut: Q.neck, axis: Q.axis }, { q: 20 + 30 * v.neck, va: VA_FW, vc: v.neck * 0.8, jl: 0.6 + 0.4 * Q.R, jw: Math.min(2 * Q.R * 0.6, 0.5 + v.neck), a, clip: Q.poly, pclip: LV })]);
      barFor(c, F, -VA_FW, VA_FW);
      const N = widthOf({ cut: Q.neck, axis: Q.axis }), K = sacCaliper(Q);
      if (N) cal(c, F, N[0], N[1], '', { solid: true });
      if (K) cal(c, F, K[0], K[1], '');
    },
    lines: v.sac > 0 ? [`neck ${v.neck.toFixed(1)} cm`, `sac ${v.sac.toFixed(1)} cm`, [`neck/sac ${v.ratio.toFixed(2)}`, `${v.ratio.toFixed(2)}`]] : ['inferolateral wall intact', ['akinetic', 'akinetic']],
  });
}
/** The four-chamber view: the effusion round the heart and the signs of tamponade. */
function fw4View(ctx, box, v, tt) {
  const S = sacOf(v), f = (tt % RR) / RR, heart = heartOf(st), reg = apexMotion(heart, 0, INFEROLATERAL);
  P_FW4.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER · HR ${v.hr}`, 'A4C']), {
    tms: tt, disease: S, motion: movesOf(v, f), ...(reg ? { regional: reg, noSys: heart === 'barlow' } : {}),
    standoff: S.eff, deeper: S.eff, sac: true, still: clamp(S.eff / 0.5, 0, 1),
    names: [['lv', 'LV'], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines: v.eff ? [`effusion ${v.eff} mm`, ...(v.tamp ? [[`RA collapse ${v.raColPct}%`, `RA ${v.raColPct}%`]] : [])] : ['no effusion'],
  });
}
/** The measurements against their cut-offs: the neck-to-sac ratio (Gatewood 1980) and the effusion (Klein 2013). */
function fwMeters(sh, t, P, v) {
  const ctx = sh.ctx;
  sh.text('MEASUREMENTS', P.x + 4, P.y + 12, { family: MONO, weight: 500, size: 11, color: t.ink2 });
  const box = { x: P.x + 4, y: P.y + 22, w: P.w - 8, h: P.h - 26 };
  meters(sh, t, box, [
    { k: 'Neck/sac', v: v.ratio, lo: 0, hi: 1.1, norm: null, cuts: [[0.5, '0.5'], [0.9, '0.9']], d: 2, bad: v.sac > 0 && v.ratio <= 0.5 },
    { k: 'Sac (cm)', v: v.sac, lo: 0, hi: 6, norm: null, cuts: [], d: 1, bad: v.sac > 0 },
    { k: 'Effusion (mm)', v: v.eff, lo: 0, hi: 30, norm: [0, 0], cuts: [[10, '10'], [20, '20']], d: 0, bad: v.eff >= 10 },
    { k: 'RA collapse (%)', v: v.raColPct, lo: 0, hi: 60, norm: null, cuts: [[33, '⅓']], d: 0, bad: v.raColPct > 33 },
  ], { row: Math.min(34, box.h / 4) });
}

// ---------------------------------------------------------------- true aneurysm
/** The aneurysm's panel: the mesh view with the aneurysm, the apex's motion, the thrombus and the calipers. */
function lvaView(panelObj, view, ctx, box, v, tt, title) {
  const heart = heartOf(st), reg = apexMotion(heart, v.k);
  const thr = v.T > 0 ? { kind: 'thrombus', T: v.T / 10, L: v.L / 10, shape: 0, mob: 0, uea: false, wag: 0 } : null;
  const o = { tms: tt, disease: v.w > 0 ? { miAneu: v.w } : {}, ...(reg ? { regional: reg, noSys: heart === 'barlow' } : {}) };
  if (thr) { o.underWalls = (ev, c) => massItems(ev, thr, c); o.underKey = JSON.stringify(thr); }
  panelObj.draw(ctx, box, title, {
    ...o,
    names: view === 'a4c' ? [['lv', 'LV', 'mv', 0.25], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']] : [['lv', 'LV', 'mv', 0.25], ['la', 'LA']],
    over: (c, F, ev) => {
      if (view !== 'a4c') return;
      // the mouth and the width, placed on the end-diastolic frame: they stay while the cine runs
      const K = v.aneurysm ? aneurysmCalipers(ev) : null;
      if (K) {
        cal(c, F, K.mouth[0], K.mouth[1], '', { solid: true });
        cal(c, F, K.width[0], K.width[1], '');
      }
      const ax = ev.massAxis;
      if (thr && ax && ax.base) {
        cal(c, F, planeOf(ev.g, ax.base), planeOf(ev.g, ax.top), '');
        if (ax.ends) cal(c, F, planeOf(ev.g, ax.ends[0]), planeOf(ev.g, ax.ends[1]), '');
      }
    },
    lines: view !== 'a4c' ? [] : v.aneurysm ? [`mouth ${v.mouth.toFixed(1)} cm`, `width ${v.width.toFixed(1)} cm`, ...(v.T > 0 ? [[`thrombus ${v.T} × ${v.L} mm`, `${v.T} × ${v.L} mm`]] : [])] : [[`apex ${v.motion}`, v.motion]],
  });
}

/** The 17 segments' wall motion as a bull's-eye: anterior at the top, septal on the left (as chapter Cardiac masses and thrombus). */
function wallMotion(sh, t, P, v) {
  const ctx = sh.ctx, heart = heartOf(st);
  const sc = Array(18).fill(1);
  if (heart === 'icm') {
    const lad = [1, 2, 7, 8, 13, 14];
    for (let k = 1; k <= 16; k++) sc[k] = lad.includes(k) ? 3 : 2;
    sc[17] = 4;
  } else for (const k of APICAL) sc[k] = v.k <= -0.05 ? 4 : 3;
  sh.text('WALL MOTION', P.x + 4, P.y + 12, { family: MONO, weight: 500, size: 11, color: t.ink2 });
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
  const ringsOf = [{ r0: 0.66, r1: 1, segs: [1, 2, 3, 4, 5, 6] }, { r0: 0.36, r1: 0.66, segs: [7, 8, 9, 10, 11, 12] }, { r0: 0.14, r1: 0.36, segs: [13, 14, 15, 16] }];
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D(), A = (-a * Math.PI) / 180, B = (-b * Math.PI) / 180;
    p.arc(cx, cy, r1 * R, A, B, true);
    p.arc(cx, cy, r0 * R, B, A, false);
    p.closePath();
    return p;
  };
  for (const ring of ringsOf) {
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
  const items = [[1, 'normal'], ...(heart === 'icm' ? [[2, 'hypokinetic']] : []), [3, 'akinetic'], [4, 'dyskinetic']].filter(([s]) => s === 1 || sc.includes(s));
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

// ---------------------------------------------------------------- the figure
/** The still frame of each complication when the cine does not run: mid-systole, or end-diastole for the aneurysm. */
const STILL = { vsr: 200, pmr: 250, fwr: 200, lva: 0 };
function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st), c = v.c;
  const tt = beat.at(true, STILL[c]);
  const sweep = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : STILL[c] / (2 * RR));
  const phone = W < 700, gap = phone ? 8 : 10;
  const [colL, colR] = phone ? cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.15, 1], 8) : [{ x: 16, y: 14, w: W * 0.5 - 16, h: H - 26 }, { x: W * 0.515, y: 14, w: W * 0.485 - 16, h: H - 26 }];
  if (c === 'vsr') {
    vsrView(ctx, colL, v, tt);
    const [r1, r2, r3] = rows(colR, [1.2, 1, 1], gap);
    for (const bx of [vsrCW(ctx, r1, v), outflowPW(ctx, r2, v, 'rv'), outflowPW(ctx, r3, v, 'lv')]) sweep(bx);
    return;
  }
  if (c === 'pmr') {
    pmrView(ctx, colL, v, tt);
    const [r1, r2] = rows(colR, [1.2, 1], gap);
    for (const bx of [mrCW(ctx, r1, v), pvPW(ctx, r2, v)]) sweep(bx);
    return;
  }
  if (c === 'fwr') {
    // on a phone the long axis takes the whole width, so the inferolateral wall stays in view; the
    // readouts under the figure carry the measurements
    if (phone) {
      const [r1, r2] = rows({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.3, 1], gap);
      fwView(ctx, r1, v, tt);
      fw4View(ctx, r2, v, tt);
      return;
    }
    fwView(ctx, colL, v, tt);
    const [r1, r2] = rows(colR, [1.45, 1], gap);
    fw4View(ctx, r1, v, tt);
    fwMeters(sh, t, r2, v);
    return;
  }
  lvaView(P_LVA4, 'a4c', ctx, colL, v, tt, titleOf(ctx, colL.w, ['APICAL FOUR-CHAMBER', 'A4C']));
  const [r1, r2] = rows(colR, [1.45, 1], gap);
  lvaView(P_LVA2, 'a2c', ctx, r1, v, tt, titleOf(ctx, r1.w, ['APICAL TWO-CHAMBER', 'A2C']));
  wallMotion(sh, t, r2, v);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** 'A' or 'An' before a number as it is read: 8, 11, 18 and 80 to 89 begin with a vowel sound. */
const aN = (s) => (/^(8|11|18|8\d)(\D|$)/.test(String(s)) ? 'An' : 'A');
const LEAD = {
  vsr: { none: 'Anterior infarction without septal rupture', small: 'Small ventricular septal rupture', significant: 'Ventricular septal rupture with a significant shunt' },
  pmr: { intact: 'Inferior infarction with an intact papillary muscle', partial: 'Partial papillary muscle rupture with a flail anterior leaflet', complete: 'Complete papillary muscle rupture with a flail anterior leaflet' },
  fwr: { none: 'Inferolateral infarction without rupture', pseudo: 'LV pseudoaneurysm: a contained free-wall rupture', effusion: 'LV pseudoaneurysm with a pericardial effusion', tamponade: 'LV pseudoaneurysm with tamponade' },
  lva: { akinetic: 'Akinetic apex after an anterior infarction', dyskinetic: 'Dyskinetic apex', aneurysm: 'True LV aneurysm at the apex', thrombus: 'Apical aneurysm with a mural thrombus' },
};
const RVSP_WORD = (p) => (p <= 34 ? 'normal' : p <= 49 ? 'mildly raised' : p <= 69 ? 'moderately raised' : 'severely raised');

/** The live sentences: the result in bold, then what the image and the Doppler show, with their sources. */
function liveOf(v, s, cite) {
  const D = cite('damluji2021');
  if (v.c === 'vsr') {
    if (v.grade === 'none') return `<b>${LEAD.vsr.none}.</b> The apex and the apical septum are akinetic, and the septum is intact: no flow crosses it on color Doppler. Anterior and apical ruptures follow infarcts in the LAD territory${D}.`;
    const qp = `Qp/Qs is (${fmt(v.rvotD, 1)}² × ${v.rvotVti}) ÷ (${fmt(v.lvotD, 1)}² × ${v.lvotVti}) = ${fmt(v.qpqs, 1)}`;
    const cw = ` CW Doppler across the rupture peaks at ${fmt(v.vmax, 1)} m/s, an LV–RV gradient of ${v.grad} mmHg. With a systolic blood pressure of ${v.sbp} mmHg, the RV systolic pressure is ${v.sbp} − ${v.grad} = ${v.rvsp} mmHg (${RVSP_WORD(v.rvsp)})${cite('konstantinides1997,mukherjee2025')}.`;
    const head = ` ${aN(v.d)} ${v.d}-mm defect in the akinetic apical septum carries left-to-right flow in systole${cite('fortin1991')}.`;
    if (v.grade === 'small') return `<b>${LEAD.vsr.small}.</b>${head}${cw} ${qp}, below 1.5: a small shunt by its size${cite('stout2018')}.`;
    if (v.grade === 'significant') return `<b>${LEAD.vsr.significant}.</b>${head} ${qp}, 1.5 or more: a hemodynamically significant shunt${cite('stout2018')}.${cw} The RV takes a volume load${cite('olsthoorn2020')}.`;
    return `<b>Ventricular septal rupture with a ${RVSP_WORD(v.rvsp)} RV systolic pressure.</b>${head}${cw} As the RV pressure rises toward the LV pressure, the jet slows. ${qp}. The RV takes a volume load${cite('olsthoorn2020')}.`;
  }
  if (v.c === 'pmr') {
    const Z = cite('zoghbi2017');
    if (v.grade === 'intact') return `<b>${LEAD.pmr.intact}.</b> The posteromedial papillary muscle holds the medial half of both leaflets${cite('karagodin2020')}, and the leaflets coapt. That muscle has a single blood supply, from the right or the circumflex coronary artery, so it ruptures after an inferior or lateral infarction${D}.`;
    const what = v.grade === 'partial'
      ? ` One head of the posteromedial papillary muscle is torn. The medial part of the anterior leaflet loses its chordae, and its tip points into the LA in systole, with the torn head on its chordae${cite('karagodin2020,li2023')}.`
      : ` The posteromedial papillary muscle is torn through. The medial anterior leaflet is flail, and the torn muscle head prolapses into the LA in systole and returns to the LV in diastole${D}.`;
    const mr = ` A flail leaflet or a ruptured papillary muscle is specific for severe MR${Z}. The jet runs along the posterior wall of the LA, away from the flail leaflet; an eccentric, wall-hugging jet looks smaller than a central jet of the same severity${Z}.`;
    const cw = ` The CW jet peaks at ${fmt(v.vmax, 1)} m/s, ${v.at}% of the way through it${v.early ? ': a triangular contour with an early peak, from the large v wave in the LA' : ''}${Z}. With a systolic blood pressure of ${v.sbp} mmHg, the LA pressure is about ${v.sbp} − ${v.grad} = ${v.lap} mmHg${cite('gorcsan1991')}${v.lap > LAP_UP ? `, above ${LAP_UP} mmHg: raised${cite('lababidi2025')}` : ''}.`;
    const pv = v.reversal ? ` Systolic flow in the pulmonary vein is reversed${Z}.` : v.pvS < 0.4 ? ' Systolic flow in the pulmonary vein is blunted.' : '';
    return `<b>${LEAD.pmr[v.grade]}.</b>${what}${mr}${cw}${pv}`;
  }
  if (v.c === 'fwr') {
    const G = cite('gatewood1980');
    if (v.grade === 'none') return `<b>${LEAD.fwr.none}.</b> The inferolateral wall is akinetic and intact, with no effusion. Free-wall rupture usually presents as sudden death; a rupture contained by pericardial adhesions forms a pseudoaneurysm, more often in the inferior or lateral wall${D}.`;
    const sac = ` The wall is broken at a ${fmt(v.neck, 1)}-cm neck that opens into a ${fmt(v.sac, 1)}-cm sac. The sac runs on behind the intact wall${G}, and its wall is pericardium with thrombus in it${cite('afshar2026')}. The neck-to-sac ratio is ${fmt(v.ratio, 2)}: in pseudoaneurysms it did not exceed 0.5, and in true aneurysms it was 0.9 to 1.0${G}. Color shows flow from the LV across the neck in systole${D}.`;
    if (v.grade === 'pseudo') return `<b>${LEAD.fwr.pseudo}.</b>${sac}`;
    const eff = ` Blood in the pericardium forms ${v.effGrade === 'small' ? 'a small' : v.effGrade === 'moderate' ? 'a moderate' : 'a large'} effusion of ${v.eff} mm at end-diastole${cite('klein2013')}.`;
    if (v.grade === 'effusion') return `<b>${LEAD.fwr.effusion}.</b>${sac}${eff} A pseudoaneurysm is prone to rupture${cite('frances1998')}.`;
    return `<b>${LEAD.fwr.tamponade}.</b>${eff} The RA folds in for ${v.raColPct}% of the cycle${v.raColPct > 33 ? ', more than a third' : ''}${v.rvCol ? ', and the RV free wall collapses in early diastole' : ''}: signs of tamponade${cite('klein2013')}. ${`The heart rate is ${v.hr}/min and the systolic blood pressure ${v.sbp} mmHg.`}${sac}`;
  }
  const L = cite('lang2015');
  if (v.grade === 'akinetic') return `<b>${LEAD.lva.akinetic}.</b> The apical segments do not thicken or move in systole${L}. An aneurysm forms most often at the anterior wall and the apex, after an occlusion of the LAD${D}.`;
  if (v.grade === 'dyskinetic') return `<b>${LEAD.lva.dyskinetic}.</b> The apical segments thin and stretch in systole, and bulge outward: dyskinesis${L}. The diastolic contour of the apex is still the heart's own.`;
  const an = ` The apex bulges past the mouth of the aneurysm at end-diastole, and its wall is thin. The mouth is ${fmt(v.mouth, 1)} cm and the largest width parallel to it is ${fmt(v.width, 1)} cm: a ratio of ${fmt(v.ratio, 2)}${v.ratio >= 0.9 ? ', as in true aneurysms (0.9 to 1.0)' : ''}${cite('gatewood1980')}. An aneurysm is a focal dilatation with thinning and akinetic or dyskinetic motion${L}.`;
  if (v.grade === 'aneurysm') return `<b>${LEAD.lva.aneurysm}.</b>${an}`;
  return `<b>${LEAD.lva.thrombus}.</b> ${aN(v.T)} ${v.T} × ${v.L} mm mural thrombus lines the aneurysm: flat and parallel to the endocardium, with one surface facing the blood. A thrombus lies in up to 50% of chronic LV aneurysms${cite('saric2016')}.${an}`;
}

/** The readouts of each complication. */
function readoutsOf(v) {
  if (v.c === 'vsr') return [
    { k: 'Rupture', v: v.d ? fmt(v.d) : 'none', u: v.d ? 'mm' : '', text: !v.d, flag: v.d > 0 },
    { k: 'Qp/Qs', v: fmt(v.qpqs, 1), flag: v.qpqs >= 1.5 },
    { k: 'Peak velocity', v: v.d ? fmt(v.vmax, 1) : '–', u: v.d ? 'm/s' : '' },
    { k: 'LV–RV gradient', v: v.d ? fmt(v.grad) : '–', u: v.d ? 'mmHg' : '' },
    { k: 'Systolic BP', v: fmt(v.sbp), u: 'mmHg' },
    { k: 'RV systolic pressure', v: v.d ? fmt(v.rvsp) : '–', u: v.d ? 'mmHg' : '', flag: v.d > 0 && v.rvsp > 34 },
  ];
  if (v.c === 'pmr') return [
    { k: 'Papillary muscle', v: v.torn === 'none' ? 'intact' : v.torn === 'head' ? 'one head torn' : 'torn', text: true, flag: v.torn !== 'none' },
    { k: 'Anterior leaflet', v: v.torn === 'none' ? 'normal' : 'flail', text: true, flag: v.torn !== 'none' },
    { k: 'MR', v: v.torn === 'none' ? 'none' : 'severe', text: true, flag: v.torn !== 'none' },
    { k: 'Peak MR velocity', v: v.vmax ? fmt(v.vmax, 1) : '–', u: v.vmax ? 'm/s' : '' },
    { k: 'Systolic BP', v: fmt(v.sbp), u: 'mmHg' },
    { k: 'LA pressure', v: v.lap === null ? '–' : fmt(v.lap), u: v.lap === null ? '' : 'mmHg', flag: v.lap !== null && v.lap > LAP_UP },
  ];
  if (v.c === 'fwr') return [
    { k: 'Neck', v: v.sac ? fmt(v.neck, 1) : 'none', u: v.sac ? 'cm' : '', text: !v.sac, flag: v.sac > 0 },
    { k: 'Sac', v: v.sac ? fmt(v.sac, 1) : '–', u: v.sac ? 'cm' : '' },
    { k: 'Neck/sac', v: v.sac ? fmt(v.ratio, 2) : '–', flag: v.sac > 0 && v.ratio <= 0.5 },
    { k: 'Effusion', v: fmt(v.eff), u: 'mm', flag: v.eff >= 10 },
    { k: 'RA collapse', v: fmt(v.raColPct), u: '% of cycle', flag: v.raColPct > 33 },
    { k: 'RV diastolic collapse', v: v.rvCol ? 'yes' : 'no', text: true, flag: v.rvCol },
  ];
  return [
    { k: 'Apex', v: v.aneurysm ? 'aneurysm' : v.motion, text: true, flag: true },
    { k: 'Mouth', v: v.aneurysm ? fmt(v.mouth, 1) : '–', u: v.aneurysm ? 'cm' : '' },
    { k: 'Width', v: v.aneurysm ? fmt(v.width, 1) : '–', u: v.aneurysm ? 'cm' : '' },
    { k: 'Mouth/width', v: v.aneurysm ? fmt(v.ratio, 2) : '–' },
    { k: 'Thrombus', v: v.T > 0 ? `${v.T} × ${v.L}` : 'none', u: v.T > 0 ? 'mm' : '', text: !(v.T > 0), flag: v.T > 0 },
  ];
}

let painted = '';
function paintFor(s) {
  const c = caseOf(s), heart = heartOf(s);
  if (`${c}|${heart}` === painted || typeof document === 'undefined') return;
  painted = `${c}|${heart}`;
  const L = LABEL[c], named = (o) => Object.fromEntries(Object.entries(o).map(([g, x]) => [L[g] || g, x]));
  paintBands(document.getElementById('mic-grades'), bandsOf(c, heart).map((b) => ({ ...b, g: L[b.g] || b.g })), named(LEVEL), SHORT[c]);
}

const miPage = {
  key: 'mi',
  part: 'acute',
  title: 'Complications of myocardial infarction',
  nav: 'MI complications',
  dwell: 40,
  defaults: { micS: 0.55, micCase: 'vsr' },
  format: {
    micS: (x, s) => {
      const c = s ? caseOf(s) : 'vsr', g = s ? shown(s).grade : gradeOf(x, c);
      return LABEL[c][g] || g;
    },
  },
  watch: ['micS', 'micCase', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    paintFor(state);
  },
  onState(s, ch) { if (CASE in ch || 'pheno' in ch) paintFor(s); },
  enter() { for (const p of PANELS) p.start(); startWallMotion(); },
  // the heart model and the targets load at idle, before the chapter opens (main.js warms every chapter)
  warm() { for (const p of PANELS) p.start(); startWallMotion(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, bandsOf(caseOf(s), heartOf(s)));
    if (beat.tick(dt, true)) { clock.ms = (clock.ms + dt * 1000) % (BREATH * 6); if (sheet) sheet.dirty = true; }
  },
  // the sequence: each complication from none to its end stage, in the order of the text
  tourEnter(set) { set({ micS: 0, micCase: 'vsr' }); },
  tourTick(tt, set) {
    const at = (t0) => Math.round(clamp((tt - t0) / 8.5, 0, 1) * 200) / 200;
    if (tt < 10) set({ micCase: 'vsr', micS: at(0.5) });
    else if (tt < 20) set({ micCase: 'pmr', micS: at(10.5) });
    else if (tt < 30) set({ micCase: 'fwr', micS: at(20.5) });
    else set({ micCase: 'lva', micS: at(30.5) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) { const t0 = { vsr: 0.5, pmr: 10.5, fwr: 20.5, lva: 30.5 }[caseOf(s)]; return t0 + s.micS * 8.5; },
  text(s, { cite }) {
    const v = shown(s);
    if (typeof document !== 'undefined') {
      // the slider's label: main.js writes it when micS changes, and the switch can change it alone
      const o = document.querySelector('output[data-for="micS"]'), t = miPage.format.micS(s[KEY], s);
      if (o && o.textContent !== t) o.textContent = t;
      paintFor(s);
    }
    return { readouts: readoutsOf(v), live: liveOf(v, s, cite) };
  },
};
export default miPage;
