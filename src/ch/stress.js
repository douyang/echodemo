// Stress echocardiography: dobutamine stress as the laboratory reads it (Pellikka 2020). One
// apical view at rest, at low dose, at peak and in recovery, side by side as the quad screen; each
// is cut from the heart mesh and beats at the heart rate of its stage. Beside it, the response of
// each segment on the 17-segment bull's-eye and the protocol, with the heart rate against its
// target. Wall motion is set by segment, as in Regional wall motion (ch/segments.js), over the
// hyperkinesis that dobutamine gives a normal segment. The cases: a normal response, ischemia in
// one territory or in two, a scar, and viable myocardium. The patient and the numbers are
// illustrative.
import { Sheet, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, EV } from '../cyclemodel.js';
import { MeshPanel } from '../meshpanel.js';
import { VIEWS } from '../views.js';
import { loadModel } from '../model3d.js';
import { meshTrace, biplane } from '../meshtrace.js';
import { lvSizeFor } from '../meshcal.js';
import { STRESS_VOLUMES } from '../stresscal.js';
import { TERRITORY } from '../aha.js';
import { segmentMap, segmentLabels, periScale, SEG_NAMES } from './segments.js';

// ---------------------------------------------------------------- the protocol
// 3-minute stages of 5, 10, 20, 30 and 40 µg/kg/min, and atropine when the heart rate falls short
// of the target, 85% of the age-predicted maximum (Pellikka 2020, Figure 7); the maximum taken as
// 220 − age, as is common (Tanaka 2001 found 208 − 0.7 × age better in older adults; the text
// gives both). The patient is 60 years old.
const DOSES = [5, 10, 20, 30, 40];
const AGE = 60, MAXHR = 220 - AGE, TARGET = Math.round(0.85 * MAXHR);

// Each run, minute by minute: the heart rate and the blood pressure, atropine (mg), the end of the
// infusion, the four moments that the quad screen shows, the hyperkinesis of a normal segment at
// each (a scale on its systolic motion) and the end-diastolic volume as a fraction of the rest
// (dobutamine lowers the preload: Pellikka 2020, Table 3).
const RUNS = {
  // to the target heart rate, with the peak dose and atropine
  full: {
    stop: 17,
    hr: [[0, 72], [3, 74], [6, 80], [9, 94], [12, 110], [15, 124], [16, 131], [17, 138], [19, 114], [21, 98]],
    sbp: [[0, 128], [6, 132], [12, 140], [15, 146], [17, 148], [21, 134]],
    dbp: [[0, 76], [6, 74], [12, 70], [17, 66], [21, 72]],
    atropine: [[15, 0.5], [16, 0.25]],
    at: { rest: 0, low: 6, peak: 17, rec: 21 },
    hyper: { rest: 1, low: 1.2, peak: 1.35, rec: 1.1 },
    edv: { rest: 1, low: 0.95, peak: 0.9, rec: 0.96 },
  },
  // stopped at the end of 30 µg/kg/min for wall motion that worsens
  mid: {
    stop: 12,
    hr: [[0, 70], [3, 72], [6, 78], [9, 92], [12, 106], [14, 94], [16, 84]],
    sbp: [[0, 118], [6, 122], [12, 128], [16, 120]],
    dbp: [[0, 72], [6, 70], [12, 66], [16, 70]],
    atropine: [],
    at: { rest: 0, low: 6, peak: 12, rec: 16 },
    hyper: { rest: 1, low: 1.2, peak: 1.3, rec: 1.05 },
    edv: { rest: 1, low: 0.95, peak: 0.92, rec: 0.97 },
  },
  // stopped at 20 µg/kg/min for new wall motion abnormalities in two territories
  early: {
    stop: 8,
    hr: [[0, 72], [3, 74], [6, 80], [8, 92], [10, 86], [12, 80]],
    sbp: [[0, 128], [6, 132], [8, 134], [12, 128]],
    dbp: [[0, 76], [6, 74], [8, 72], [12, 74]],
    atropine: [],
    at: { rest: 0, low: 6, peak: 8, rec: 12 },
    hyper: { rest: 1, low: 1.2, peak: 1.25, rec: 1.05 },
    edv: { rest: 1, low: 0.95, peak: 0.93, rec: 0.97 },
  },
};
const STAGES = [
  { key: 'rest', name: 'rest', up: 'REST', short: 'REST' },
  { key: 'low', name: 'low dose', up: 'LOW DOSE', short: 'LOW' },
  { key: 'peak', name: 'peak', up: 'PEAK', short: 'PEAK' },
  { key: 'rec', name: 'recovery', up: 'RECOVERY', short: 'REC' },
];

/** The value of keyframes [[t, v], ...] at t, linear between them. */
function interp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return keys[keys.length - 1][1];
}
const doseAt = (run, t) => (t < 0 || t >= run.stop ? 0 : DOSES[Math.min(4, Math.floor(t / 3))]);
const atropineBy = (run, t) => run.atropine.reduce((a, [m, d]) => (m <= t ? a + d : a), 0);
/** A stage's numbers: its dose (at peak, the last of the infusion), heart rate and pressure. */
function stageOf(run, key) {
  const t = run.at[key];
  return {
    t,
    dose: key === 'peak' ? doseAt(run, run.stop - 1e-6) : doseAt(run, t - 1e-6),
    hr: Math.round(interp(run.hr, t)),
    sbp: Math.round(interp(run.sbp, t)),
    dbp: Math.round(interp(run.dbp, t)),
    atropine: atropineBy(run, t),
    since: key === 'rec' ? t - run.stop : 0,
  };
}

// ---------------------------------------------------------------- the cases
// The score of each segment that is not normal, by stage (1 normal, 2 hypokinetic, 3 akinetic,
// 4 dyskinetic; Pellikka 2020). The LAD territory is that of the standard map (aha.js).
const of = (list, w) => Object.fromEntries(list.map((k) => [k, w]));
const SCAR = { 7: 3, 8: 3, 13: 3, 14: 3, 17: 3 };
const LAD3 = of(TERRITORY.lad, 3);
// an ischemic cardiomyopathy at rest: the LAD territory akinetic, the other segments hypokinetic
const ICM = { ...of([...Array(17).keys()].map((i) => i + 1).filter((k) => !TERRITORY.lad.includes(k)), 2), ...LAD3 };
export const CASES = {
  normal: { name: 'Normal response', result: 'Normal', view: 'a4c', run: 'full', wm: { rest: {}, low: {}, peak: {}, rec: {} } },
  lad: {
    name: 'Ischemia in the LAD territory', result: 'Ischemia, LAD territory', view: 'a2c', run: 'full', onset: 15, art: ['lad'],
    wm: { rest: {}, low: {}, peak: { 7: 2, 8: 2, 13: 3, 14: 3, 17: 3 }, rec: { 13: 2, 14: 2, 17: 2 } },
  },
  rca: {
    name: 'Ischemia in the right coronary territory', result: 'Ischemia, RCA territory', view: 'a2c', run: 'full', onset: 15, art: ['rca'],
    wm: { rest: {}, low: {}, peak: { 3: 2, 4: 3, 9: 2, 10: 3, 15: 2 }, rec: { 4: 2, 10: 2 } },
  },
  lcx: {
    name: 'Ischemia in the circumflex territory', result: 'Ischemia, circumflex territory', view: 'a4c', run: 'full', onset: 15, art: ['lcx'],
    wm: { rest: {}, low: {}, peak: { 5: 2, 6: 3, 11: 2, 12: 3, 16: 2 }, rec: { 6: 2, 12: 2 } },
  },
  multi: {
    name: 'Ischemia in two territories', result: 'Ischemia, LAD and RCA territories', view: 'a2c', run: 'early', onset: 4.5, art: ['lad', 'rca'],
    wm: {
      rest: {}, low: { 13: 2, 17: 2 },
      peak: { 7: 2, 8: 2, 13: 3, 14: 2, 17: 3, 4: 2, 10: 3, 15: 2 },
      rec: { 13: 2, 17: 2, 10: 2 },
    },
  },
  scar: {
    name: 'Scar', result: 'Fixed abnormality, LAD territory', view: 'a2c', run: 'full',
    wm: { rest: SCAR, low: SCAR, peak: { 7: 3, 8: 3, 13: 4, 14: 4, 17: 4 }, rec: SCAR },
  },
  // the LAD territory hibernating, with a severe stenosis, and an apical scar; the other segments
  // remodeled, supplied by arteries without severe stenosis: they may or may not improve with
  // dobutamine, and here they do not (Pellikka 2020, Table 9)
  viable: {
    name: 'Viable myocardium', result: 'Viable, biphasic response', view: 'a2c', run: 'mid', onset: 8,
    wm: { rest: ICM, low: { ...ICM, 1: 2, 2: 2, 7: 2, 8: 2, 14: 2 }, peak: ICM, rec: ICM },
  },
};
export const CASE_ORDER = ['normal', 'lad', 'rca', 'lcx', 'multi', 'scar', 'viable'];
const caseOf = (k) => CASES[k] || CASES.normal;

/** The 17 scores of a case at a stage, segment 1 first (index 0 unused). */
function scoresOf(key, stage) {
  const a = Array(18).fill(1);
  for (const [k, w] of Object.entries(caseOf(key).wm[stage] || {})) a[k] = w;
  return a;
}
/** The wall motion score index: the mean of the 16 scores (the apical cap is not scored). */
function wmsi(sc) { let s = 0; for (let k = 1; k <= 16; k++) s += sc[k]; return s / 16; }

/**
 * The response of each segment (Pellikka 2020): normal; ischemic, a new or worse abnormality with
 * stress; fixed, an akinetic or dyskinetic segment with no change (akinesis that turns dyskinetic
 * is the mechanics of a scar, not ischemia); hypokinetic with no change; viable, better at low
 * dose: biphasic when it worsens again at peak, sustained when not.
 */
function responses(key) {
  const r = scoresOf(key, 'rest'), l = scoresOf(key, 'low'), p = scoresOf(key, 'peak');
  const out = Array(18).fill('normal');
  for (let k = 1; k <= 17; k++) {
    if (r[k] === 1) out[k] = l[k] > 1 || p[k] > 1 ? 'isch' : 'normal';
    else if (l[k] < r[k]) out[k] = p[k] > l[k] ? 'biphasic' : 'sustained';
    else if (p[k] > r[k] && !(r[k] === 3 && p[k] === 4)) out[k] = 'isch';
    else out[k] = r[k] === 2 ? 'hypo' : 'fixed';
  }
  return out;
}

// ---------------------------------------------------------------- wall motion on the mesh
// a segment's systolic motion as a fraction of its own at rest (ch/segments.js); a normal segment
// takes the stage's hyperkinesis, and so does a segment that is hypokinetic at rest and stays so
// (more motion with dobutamine, still hypokinetic)
const EXC = { 2: 0.45, 3: 0, 4: -0.35 };
// The scores set the motion on the normal heart's systolic change (echo.js noSys), so that a
// disease heart's own motion does not hide them. BASE scales the motion of the normal and the
// hypokinetic segments of each heart, so that the LVEF at rest, by the biplane method as below,
// is the heart's own (pheno.js): measured on the mesh in the normal response, and for the
// ischemic heart in the viable case, whose rest is that heart's own wall motion (25.1% at 1).
// The normal heart keeps its own, 62.6%. The total is held to KMAX: beyond about 1.8 the walls of
// the Barlow heart's LV fold at end-systole, and its LVEF falls as the factor grows.
const BASE = { normal: 1, amyloid: 1.1, icm: 1, barlow: 1.59, bav: 0.91 };
const KMAX = 1.75;
let geo = null;   // { m, E, map, labels, pv }: the segment map and the numbers' places
const SCALES = new Map();
/** Per-vertex scale on the systolic motion for a case at a stage, on the heart shown, and the pericardium's. */
function scaleOf(key, stage) {
  const heart = geo.m.pheno.key, id = `${heart}|${key}|${stage}`;
  if (SCALES.has(id)) return SCALES.get(id);
  const sc = scoresOf(key, stage), rest = scoresOf(key, 'rest'), hyper = RUNS[caseOf(key).run].hyper[stage], map = geo.map;
  const k0 = BASE[heart] ?? 1;
  const motion = (s) => {
    const w = sc[s];
    if (w === 1) return Math.min(KMAX, k0 * hyper);
    return w === 2 ? k0 * EXC[2] * (rest[s] === 2 ? hyper : 1) : EXC[w];
  };
  // the RV and the atria keep their own motion, with the stage's hyperkinesis
  const scale = new Float32Array(map.mem.length).fill(hyper);
  map.mem.forEach((mm, i) => {
    if (!mm) return;
    let a = 0, w = 0;
    for (const [s, c] of mm) { a += c * motion(s); w += c; }
    scale[i] = a / w;
  });
  const out = { key: id, scale, peri: periScale(map, scale) };
  SCALES.set(id, out);
  return out;
}

async function startMap() {
  if (geo) return;
  geo = { loading: true };
  try {
    const [m, E] = await Promise.all([loadModel(), import('../echo.js')]);
    const map = segmentMap(m, Object.fromEntries(['a4c', 'a2c', 'a3c'].map((k) => [k, E.viewGeometry(m.anat.normal(), k)])));
    geo = { m, E, map, labels: {}, pv: -1 };
    redraw();
  } catch (err) {
    console.error('stress: segment map failed', err);
    geo = { failed: true };
  }
}
/** The segment numbers' places on the walls of the heart shown. */
function syncLabels() {
  if (!geo || !geo.map || geo.pv === geo.m.pheno.version) return;
  geo.pv = geo.m.pheno.version;
  geo.labels = segmentLabels(geo.m, geo.map, Object.fromEntries(['a4c', 'a2c', 'a3c'].map((k) => [k, geo.E.viewGeometry(geo.m.anat, k)])));
}

// ---------------------------------------------------------------- the volumes, measured
// The LV volumes at each stage, as Systolic function (ch/eject.js) measures them: the LV traced
// on the four- and two-chamber views cut from the mesh at end-diastole and at end-systole
// (meshtrace.js), and the biplane method of disks. Two small views that are never shown do the
// cutting. The cuts take seconds, so the volumes of every heart that the header can show come
// from a table measured the same way (stresscal.js, tools/stress-volumes.mjs); the views measure
// only a heart that the table lacks.
const MEAS = { a4c: new MeshPanel('a4c', { diseases: ['lvSize'] }), a2c: new MeshPanel('a2c', { diseases: ['lvSize'] }) };
const VOL = new Map();          // `${heart version}|${case}` -> { rest: { edv, esv, ef }, ... }, measured here
function traced(ev, s) {
  if (!ev.last || !ev.g) return null;
  const q = ev.toPlane(ev.anchors(s).apex, ev.g);
  return meshTrace(ev, [q[0], q[1]], 20);
}
function measure(key) {
  const out = {};
  const ed = cycleAt(0), es = cycleAt(EV.avc);
  const run = RUNS[caseOf(key).run];
  for (const { key: stage } of STAGES) {
    const S = scaleOf(key, stage), T = {};
    for (const [view, p] of Object.entries(MEAS)) {
      const ev = p.ev;
      if (ev.w !== 120) ev.setSize(120, 96);
      ev.noSys = true;
      ev.setRegional(S.scale, S.peri);
      ev.setDisease({ lvSize: lvSizeFor(ev.model.pheno.key, run.edv[stage]) }, p.shifts);
      ev.frame(ed);
      const t0 = traced(ev, ed.s);
      ev.frame(es);
      T[view] = { ed: t0, es: traced(ev, es.s) };
    }
    if (T.a4c.ed && T.a4c.es && T.a2c.ed && T.a2c.es) {
      const edv = biplane(T.a4c.ed, T.a2c.ed), esv = biplane(T.a4c.es, T.a2c.es);
      out[stage] = { edv, esv, ef: (100 * (edv - esv)) / edv };
    }
  }
  return out;
}
const volKey = (key) => (geo && geo.m ? `${geo.m.pheno.version}|${key}` : '');
/** The volumes of case key on the heart shown: the table's, or those measured here; null until the model loads. */
function volumesOf(key) {
  if (!geo || !geo.m) return null;
  return STRESS_VOLUMES[geo.m.pheno.key]?.[key] || VOL.get(volKey(key)) || null;
}
/** One case at a time, the case shown first, while the chapter is open (or a video page waits). */
let measuring = false;
function measureNext() {
  if (measuring || !geo || !geo.map) return;
  if (CASE_ORDER.every((k) => volumesOf(k))) return;
  if (MEAS.a4c.state !== 'ready' || MEAS.a2c.state !== 'ready') {
    MEAS.a4c.start();
    MEAS.a2c.start();
    if (MEAS.a4c.state === 'failed' || MEAS.a2c.state === 'failed') return;
    measuring = true;
    setTimeout(() => { measuring = false; measureNext(); }, 120);
    return;
  }
  const todo = [st?.sxCase || 'normal', ...CASE_ORDER].filter((k) => !volumesOf(k));
  if (!todo.length) return;
  measuring = true;
  setTimeout(() => {
    const k = todo[0];
    try { VOL.set(volKey(k), measure(k)); } catch (err) { console.error('stress: volumes failed', err); VOL.set(volKey(k), {}); }
    measuring = false;
    redraw();
    if (open) measureNext();
  }, 0);
}

/**
 * The volumes of every case on the heart shown, measured on the mesh as above, whatever the table
 * holds: tools/stress-volumes.mjs writes them to stresscal.js, and checks the table with them.
 */
export async function measureAll() {
  await startMap();
  while (geo && geo.loading) await new Promise((r) => setTimeout(r, 50));
  if (!geo || !geo.map) throw new Error('stress: no segment map');
  MEAS.a4c.start();
  MEAS.a2c.start();
  while (MEAS.a4c.state === 'loading' || MEAS.a2c.state === 'loading') await new Promise((r) => setTimeout(r, 50));
  if (MEAS.a4c.state !== 'ready' || MEAS.a2c.state !== 'ready') throw new Error('stress: the measuring views failed');
  return { heart: geo.m.pheno.key, volumes: Object.fromEntries(CASE_ORDER.map((k) => [k, measure(k)])) };
}

// ---------------------------------------------------------------- time
// Each view beats at its stage's heart rate. Systole shortens with the heart rate as total
// electromechanical systole does at rest, QS2 = 541 − 2.2 × HR ms in men (Boudoulas 1981): the
// cycle model's systole (70/min) is compressed by that ratio, and diastole takes the rest.
function warp(t, hr) {
  const k = (541 - 2.2 * hr) / (541 - 2.2 * 70), rr = 60000 / hr, sys = EV.avc * k;
  return t < sys ? t / k : EV.avc + ((t - sys) * (857 - EV.avc)) / (rr - sys);
}
let clock = 0, next = 0;
const shown = [0, 0, 0, 0];   // each view's time in the cycle model (ms)
const VIDEO = typeof location !== 'undefined' && location.pathname.includes('/video/');
function stageTime(i) {
  const hr = stageOf(RUNS[caseOf(st.sxCase).run], STAGES[i].key).hr;
  return warp((clock * 1000) % (60000 / hr), hr);
}

// ---------------------------------------------------------------- drawing
let sheet = null, st = null, setState = null, open = false, volShown = '';
const redraw = () => { if (sheet) sheet.dirty = true; };
const QUAD = STAGES.map(() => new MeshPanel('a4c', { diseases: ['lvSize'], redraw }));

function stageTitle(S, n, w) {
  const hr = `${n.hr}/min`;
  if (S.key === 'rest') return w < 200 ? `${S.short} ${hr}` : `${S.up} · ${hr}`;
  if (S.key === 'rec') return w < 250 ? `${S.short} ${hr}` : `${S.up} · ${n.since} MIN · ${hr}`;
  return w < 250 ? `${S.short} ${n.dose} · ${hr}` : `${S.up} · ${n.dose} µg/kg/min · ${hr}`;
}

/** The segment numbers on a view's walls, colored by their score at that stage (as in segments.js). */
function dots(ctx, F, list, sc, small) {
  const bx = F.view.box;
  ctx.save();
  ctx.font = `600 ${small ? 9.5 : 11}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { k, p } of list || []) {
    const [x, y] = F.P(F.cm(p));
    if (x < bx.x + 6 || x > bx.x + bx.w - 6 || y < bx.y + 6 || y > bx.y + bx.h - 6) continue;
    const s = sc[k], r = small ? 7 : 8.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = s === 1 ? 'rgba(16,19,21,0.55)' : s === 2 ? '#f0b27a' : '#ff6b5b';
    ctx.fill();
    if (s === 4) { ctx.lineWidth = 2; ctx.strokeStyle = '#ffe89a'; ctx.stroke(); }
    ctx.fillStyle = s === 1 ? '#ffe89a' : '#101315';
    ctx.fillText(String(k), x, y + 0.5);
  }
  ctx.restore();
}

function stagePanel(sh, P, i, run, small) {
  const S = STAGES[i], p = QUAD[i], n = stageOf(run, S.key);
  p.setView(st.sxView);
  const live = geo && geo.map;
  const F = p.draw(sh.ctx, P, stageTitle(S, n, P.w), {
    tms: reducedMotion ? EV.avc : shown[i],
    disease: (heart) => ({ lvSize: lvSizeFor(heart, run.edv[S.key]) }),
    regional: live ? scaleOf(st.sxCase, S.key) : null,
    noSys: true,
  });
  if (F && live) dots(sh.ctx, F, geo.labels[st.sxView], scoresOf(st.sxCase, S.key), small);
}

const CAT = {
  isch: 'ischemic',
  fixed: 'scar (fixed)',
  hypo: 'hypokinetic, no change',
  sustained: 'viable',
  biphasic: 'viable, ischemic at peak',
};
// A grid of dots 5 px apart, made once for the canvas's scale and color: one fill per segment
// (sh.stipple scatters its dots over the whole canvas, every frame).
let dotPat = { key: '', pat: null };
function dotFill(sh, color) {
  const k = sh.dpr * (sh.z || 1), key = `${color}|${k}`;
  if (dotPat.key !== key) {
    const n = Math.max(2, Math.round(5 * k)), c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath(); g.arc(n / 2, n / 2, 0.85 * k, 0, Math.PI * 2); g.fill();
    const pat = sh.ctx.createPattern(c, 'repeat');
    pat.setTransform(new DOMMatrix().scale(1 / k));
    dotPat = { key, pat };
  }
  return dotPat.pat;
}
// ischemic: red; scar: grey, hatched; hypokinetic with no change: dotted; viable: green, with red
// stripes when ischemic at peak
function catFill(sh, t, path, cat, seed) {
  if (cat === 'normal') return;
  const ctx = sh.ctx;
  if (cat === 'hypo') { ctx.save(); ctx.fillStyle = dotFill(sh, t.ink2); ctx.globalAlpha = 0.75; ctx.fill(path); ctx.restore(); return; }
  ctx.save();
  ctx.fillStyle = cat === 'isch' ? t.flag : cat === 'fixed' ? t.ink3 : t.ok;
  ctx.globalAlpha = cat === 'isch' ? 0.75 : cat === 'fixed' ? 0.3 : cat === 'biphasic' ? 0.5 : 0.6;
  ctx.fill(path);
  ctx.restore();
  if (cat === 'fixed') sh.hatch(path, 0.8, 4, t.ink, 0.8, seed, 0.6);
  if (cat === 'biphasic') sh.hatch(path, -0.8, 7, t.flag, 1.8, seed, 1);
}

/** The response of each segment on the bull's-eye: anterior at the top, septal on the left. */
function bull(sh, t, cx, cy, R, cats, small) {
  const ctx = sh.ctx, num = small ? 8 : 10.5;
  const rings = [
    { r0: 0.66, r1: 1, segs: [1, 2, 3, 4, 5, 6] },
    { r0: 0.36, r1: 0.66, segs: [7, 8, 9, 10, 11, 12] },
    { r0: 0.14, r1: 0.36, segs: [13, 14, 15, 16] },
  ];
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D(), A = (-a * Math.PI) / 180, B = (-b * Math.PI) / 180;
    p.arc(cx, cy, r1 * R, A, B, true);
    p.arc(cx, cy, r0 * R, B, A, false);
    p.closePath();
    return p;
  };
  const names = [];
  for (const ring of rings) {
    const step = 360 / ring.segs.length;
    ring.segs.forEach((seg, i) => {
      const mid = 90 + i * step, p = wedge(ring.r0, ring.r1, mid - step / 2, mid + step / 2);
      catFill(sh, t, p, cats[seg], seg);
      ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(p); ctx.restore();
      const am = (mid * Math.PI) / 180, rm = ((ring.r0 + ring.r1) / 2) * R;
      names.push([String(seg), cx + Math.cos(am) * rm, cy - Math.sin(am) * rm + num * 0.36]);
    });
  }
  const cap = new Path2D();
  cap.arc(cx, cy, 0.14 * R, 0, Math.PI * 2);
  catFill(sh, t, cap, cats[17], 17);
  ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(cap); ctx.restore();
  names.push(['17', cx, cy + num * 0.36]);
  // a small map leaves the numbers to the views: its apical ring is too narrow for them
  if (R >= 56) for (const [s, x, y] of names) sh.text(s, x, y, { family: MONO, weight: 500, size: num, align: 'center', color: t.ink });
  const fs = small ? 10.5 : 12.5;
  sh.text(small ? 'ant' : 'anterior', cx, cy - R - (small ? 4 : 8), { family: SANS, weight: 400, size: fs, align: 'center', color: t.ink2 });
  sh.text(small ? 'inf' : 'inferior', cx, cy + R + (small ? 12 : 18), { family: SANS, weight: 400, size: fs, align: 'center', color: t.ink2 });
  sh.text(small ? 'sept' : 'septal', cx - R - (small ? 3 : 6), cy + 4, { family: SANS, weight: 400, size: fs, align: 'right', color: t.ink2 });
  sh.text(small ? 'lat' : 'lateral', cx + R + (small ? 3 : 6), cy + 4, { family: SANS, weight: 400, size: fs, color: t.ink2 });
}

/** The key to the bull's-eye: the responses the case shows, in rows that fit w. */
function legend(sh, t, x, y, w, cats) {
  const ctx = sh.ctx, present = ['isch', 'fixed', 'hypo', 'sustained', 'biphasic'].filter((c) => cats.includes(c));
  const items = [['normal', 'normal'], ...present.map((c) => [c, CAT[c]])];
  let cx = x, cy = y;
  for (const [c, name] of items) {
    const iw = 22 + sh.measure(name, { family: SANS, weight: 400, size: 11.5 });
    if (cx > x && cx + iw > x + w) { cx = x; cy += 18; }
    const p = new Path2D();
    p.rect(cx, cy - 10, 16, 12);
    ctx.save(); ctx.fillStyle = t.paper2; ctx.fill(p); ctx.restore();
    catFill(sh, t, p, c, 9);
    ctx.save(); ctx.strokeStyle = t.ink; ctx.lineWidth = 1; ctx.stroke(p); ctx.restore();
    sh.text(name, cx + 22, cy, { family: SANS, weight: 400, size: 11.5, color: t.ink2 });
    cx += iw + 14;
  }
  return cy;
}

/** Text with a band of paper round its letters: a label that the heart rate line may cross. */
function haloText(sh, t, str, x, y, o) {
  const ctx = sh.ctx;
  ctx.save();
  ctx.font = `${o.weight} ${o.size}px ${o.family}`;
  ctx.textAlign = o.align || 'left';
  ctx.strokeStyle = t.paper;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y);
  ctx.restore();
  sh.text(str, x, y, o);
}

/** The protocol: the dose in steps, the heart rate against its target, and the four moments. */
function protocol(sh, t, box, C, run) {
  const ctx = sh.ctx, small = box.w < 330;
  const tmax = run.at.rec + 1;
  const L = box.x + (small ? 4 : 8), R = box.x + box.w - (small ? 34 : 44), T = box.y + (small ? 22 : 28), B = box.y + box.h - 16;
  const X = (m) => L + (m / tmax) * (R - L);
  const Yd = (d) => B - (d / 40) * (B - T) * 0.5;
  const Yh = (hr) => B - ((hr - 50) / (MAXHR - 50)) * (B - T);
  sh.text(small ? 'Dobutamine · heart rate' : 'Dobutamine, µg/kg/min · heart rate, /min', box.x, box.y + 12, { family: SANS, weight: 600, size: small ? 11 : 12.5, color: t.ink2 });
  // the infusion in its stages
  for (let i = 0; i < DOSES.length && 3 * i < run.stop; i++) {
    const t0 = 3 * i, t1 = Math.min(3 * (i + 1), run.stop), d = DOSES[i];
    ctx.save();
    ctx.fillStyle = t.accent;
    ctx.globalAlpha = 0.1 + 0.04 * i;
    ctx.fillRect(X(t0), Yd(d), X(t1) - X(t0), B - Yd(d));
    ctx.restore();
    if (X(t1) - X(t0) >= 14) sh.text(String(d), (X(t0) + X(t1)) / 2, B - 3, { family: MONO, weight: 500, size: small ? 9 : 10, align: 'center', color: t.ink2 });
  }
  // the target heart rate
  ctx.save();
  ctx.strokeStyle = t.ink3;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(L, Yh(TARGET)); ctx.lineTo(R, Yh(TARGET)); ctx.stroke();
  ctx.restore();
  sh.text(`${TARGET}`, R + 4, Yh(TARGET) + 4, { family: MONO, weight: 500, size: 10, color: t.ink2 });
  if (!small) sh.text('target', R + 4, Yh(TARGET) - 8, { family: SANS, weight: 400, size: 10, color: t.ink3 });
  // the heart rate
  ctx.save();
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let m = 0; m <= run.at.rec + 1e-6; m += 0.25) { const x = X(m), y = Yh(interp(run.hr, m)); m ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.restore();
  // atropine, and the end of the infusion
  // atropine: a mark under the heart rate at each dose, and one label
  run.atropine.forEach(([m], j) => {
    const x = X(m), y = Yh(interp(run.hr, m)) + 8;
    ctx.save(); ctx.fillStyle = t.ink2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 6); ctx.lineTo(x + 4, y + 6); ctx.closePath(); ctx.fill(); ctx.restore();
    if (j === 0) haloText(sh, t, small ? 'atr' : `atropine ${run.atropine.reduce((a, [, d]) => a + d, 0)} mg`, x - 6, y + 6, { family: MONO, weight: 500, size: small ? 8.5 : 9, align: 'right', color: t.ink2 });
  });
  ctx.save(); ctx.strokeStyle = t.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(run.stop), T - 4); ctx.lineTo(X(run.stop), B); ctx.stroke(); ctx.restore();
  // at the foot of its line, where the infusion has ended: the peak's label takes its top
  sh.text('stop', X(run.stop) + 3, B - 4, { family: SANS, weight: 400, size: 10, color: t.ink3 });
  // the first abnormal wall motion: the ischemic threshold
  if (C.onset !== undefined) {
    const x = X(C.onset), y = Yh(interp(run.hr, C.onset));
    ctx.save(); ctx.fillStyle = t.flag; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (!small) haloText(sh, t, 'WMA', x - 7, y - 4, { family: MONO, weight: 600, size: 9.5, align: 'right', color: t.flag });
  }
  // the four moments of the quad screen
  for (const S of STAGES) {
    const m = run.at[S.key], x = X(m), y = Yh(interp(run.hr, m));
    ctx.save(); ctx.fillStyle = t.paper; ctx.strokeStyle = t.ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    sh.text(S.short.toLowerCase(), x, y - 7, { family: MONO, weight: 500, size: small ? 8.5 : 9.5, align: S.key === 'rest' ? 'left' : 'center', color: t.ink });
  }
  // minutes
  for (let m = 0; m <= tmax; m += 3) sh.text(String(m), X(m), B + 12, { family: MONO, weight: 400, size: 9, align: 'center', color: t.ink3 });
  sh.text('min', R + 4, B + 12, { family: MONO, weight: 400, size: 9, color: t.ink3 });
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, narrow = W < 700;
  const C = caseOf(st.sxCase), run = RUNS[C.run], cats = responses(st.sxCase);
  syncLabels();
  const pad = narrow ? 6 : 14, gap = narrow ? 6 : 12;
  // the view buttons sit over the top of the figure; a page without them (a video) names the view there
  const bar = sh.canvas.closest('figure')?.querySelector('.occl');
  let top;
  if (bar) {
    const ob = bar.offsetParent ? (bar.getBoundingClientRect().bottom - sh.canvas.getBoundingClientRect().top) / (sh.z || 1) : 0;
    top = Math.max(narrow ? 44 : 58, Math.ceil(ob) + 8);
  } else {
    sh.text(`${VIEWS[st.sxView].name.replace(/\s*\(.*\)$/, '')} view`, pad, pad + 13, { family: SANS, weight: 600, size: 13, color: t.ink2 });
    top = pad + 26;
  }
  let quad, side = null;
  if (!narrow) {
    // the quad screen on the left, as square as the height allows; the bull's-eye and the protocol beside it
    const qw = Math.min((W - 2 * pad - gap) * 0.64, (H - top - pad) * 1.15);
    quad = { x: pad, y: top, w: qw, h: H - top - pad };
    side = { x: pad + qw + gap + 10, y: top, w: W - 2 * pad - qw - gap - 10, h: H - top - pad };
  } else {
    // a phone: the quad screen, and under it a row with the bull's-eye and the protocol when there is room
    const row = H - top - pad >= 430 ? 120 : 0;
    quad = { x: pad, y: top, w: W - 2 * pad, h: H - top - pad - (row ? row + gap : 0) };
    if (row) side = { x: pad, y: H - pad - row, w: W - 2 * pad, h: row, row: true };
  }
  const cw = (quad.w - gap) / 2, chh = (quad.h - gap) / 2, small = cw < 220;
  STAGES.forEach((S, i) => stagePanel(sh, { x: quad.x + (i % 2) * (cw + gap), y: quad.y + Math.floor(i / 2) * (chh + gap), w: cw, h: chh }, i, run, small));
  if (!side) return;
  if (side.row) {
    const R = Math.min(side.h / 2 - 16, 50), bx = side.x + R + 30;
    bull(sh, t, bx, side.y + side.h / 2, R, cats, true);
    protocol(sh, t, { x: bx + R + 34, y: side.y, w: side.x + side.w - (bx + R + 34), h: side.h }, C, run);
    return;
  }
  sh.text('Response by segment', side.x, side.y + 14, { family: SANS, weight: 600, size: 13, color: t.ink2 });
  const R = Math.max(40, Math.min(side.w / 2 - 50, side.h * 0.22));
  const cy = side.y + 40 + R;
  bull(sh, t, side.x + side.w / 2, cy, R, cats, R < 70);
  const ly = legend(sh, t, side.x, cy + R + 44, side.w, cats);
  const py = ly + 20, ph = side.y + side.h - py;
  if (ph >= 120) protocol(sh, t, { x: side.x, y: py, w: side.w, h: Math.min(ph, 240) }, C, run);
}

// ---------------------------------------------------------------- text
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const and = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const WM = { 2: 'hypokinetic', 3: 'akinetic', 4: 'dyskinetic' };
/** Segments in words: 'the mid anterior and mid anteroseptal segments and the apex'. */
function segWords(ks) {
  const names = ks.filter((k) => k !== 17).map((k) => SEG_NAMES[k - 1]);
  let s = names.length ? `the ${and(names)} segment${names.length > 1 ? 's' : ''}` : '';
  if (ks.includes(17)) s = s ? `${s} and the apex` : 'the apex';
  return s;
}
/** The segments that differ from normal at a stage, by score: 'the … become hypokinetic, and …'. */
function changes(sc, verb) {
  const parts = [2, 3, 4].map((w) => ({ w, ks: [...Array(17).keys()].map((i) => i + 1).filter((k) => sc[k] === w) })).filter((x) => x.ks.length);
  return and(parts.map((x) => `${segWords(x.ks)} ${verb} ${WM[x.w]}`));
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const mg = (x) => (x ? `${x} mg` : '');

function textOf(s, cite) {
  const key = CASES[s.sxCase] ? s.sxCase : 'normal', C = CASES[key], run = RUNS[C.run];
  const N = Object.fromEntries(STAGES.map((S) => [S.key, stageOf(run, S.key)]));
  const P = N.peak, pct = Math.round((100 * P.hr) / MAXHR);
  const sc = Object.fromEntries(STAGES.map((S) => [S.key, scoresOf(key, S.key)]));
  const w0 = wmsi(sc.rest), wl = wmsi(sc.low), w1 = wmsi(sc.peak);
  const vol = volumesOf(key) || {};
  const v0 = vol.rest, vl = vol.low, v1 = vol.peak;
  const peakWhat = `${P.dose} µg/kg/min${P.atropine ? ` and atropine ${mg(P.atropine)}` : ''}`;
  const reached = P.hr >= TARGET;
  const hrLine = `The heart rate reaches ${P.hr}/min with ${peakWhat}, ${pct}% of the age-predicted maximum of ${MAXHR}/min`;
  // 'the end-systolic volume falls from 40 to 24 mL, and the LVEF rises from 63% to 75%'
  const change = (name, a, b, u) => (Math.round(a) === Math.round(b) ? `${name} stays at ${fmt(a)}${u}` : `${name} ${b < a ? 'falls' : 'rises'} from ${fmt(a)}${u === '%' ? '%' : ''} to ${fmt(b)}${u}`);
  const volLine = v0 && v1 ? `${change('the end-systolic volume', v0.esv, v1.esv, ' mL')}, and ${change('the LVEF', v0.ef, v1.ef, '%')}` : '';
  let live;
  if (key === 'normal') {
    live = `<b>Normal response.</b> Every segment is normal at rest and becomes hyperkinetic with dobutamine, and the LV cavity becomes smaller${volLine ? `: ${volLine}` : ''}${cite('pellikka2020')}. ${hrLine} (target ${TARGET}/min), so the stress is adequate${cite('pellikka2020')}.`;
  } else if (key === 'multi') {
    // the abnormal segments at peak, by territory: '6 of 7 in the LAD territory (3 akinetic)'
    const by = C.art.map((a) => {
      const ks = TERRITORY[a].filter((k) => sc.peak[k] > 1);
      return `${ks.length} of ${TERRITORY[a].length} segments in the ${a === 'lad' ? 'LAD' : 'right coronary'} territory (${ks.filter((k) => sc.peak[k] === 3).length} akinetic)`;
    });
    live = `<b>Ischemia in two territories, a high-risk result.</b> At ${N.low.dose} µg/kg/min (heart rate ${N.low.hr}/min), ${changes(sc.low, 'are already')}. The infusion stops at ${P.dose} µg/kg/min for new wall motion abnormalities in ${and(by)}. Abnormal wall motion in more than one coronary territory, and abnormal wall motion at a low heart rate, indicate severe stenosis or multivessel disease${cite('pellikka2020')}. In recovery, abnormal wall motion persists in ${Object.keys(caseOf(key).wm.rec).length} segments; persistence into recovery indicates more severe ischemia${cite('pellikka2020')}. ${volLine ? `${cap(volLine)}. With dobutamine, a fall in LVEF and a larger end-systolic cavity are less frequent than with exercise, even in left main or multivessel disease${cite('pellikka2020')}.` : ''}`;
  } else if (C.art) {
    const terr = { lad: 'LAD', rca: 'right coronary', lcx: 'circumflex' }[C.art[0]];
    const onsetHr = Math.round(interp(run.hr, C.onset));
    live = `<b>Ischemia in the ${terr} territory.</b> At rest and at low dose every segment is normal. At peak stress ${changes(sc.peak, 'become')}; the wall motion first became abnormal at ${doseAt(run, C.onset)} µg/kg/min, at a heart rate of ${onsetHr}/min, ${Math.round((100 * onsetHr) / MAXHR)}% of the maximum${cite('pellikka2020')}. In early recovery, ${changes(sc.rec, 'remain')}. The wall motion score index rises from ${fmt(w0, 2)} at rest to ${fmt(w1, 2)} at peak${cite('pellikka2020')}. ${hrLine}.`;
  } else if (key === 'scar') {
    live = `<b>A fixed wall motion abnormality: scar.</b> ${cap(segWords(Object.keys(SCAR).map(Number)))} are akinetic at rest and do not improve at any dose: a transmural infarct, or one with a thin rim of viable myocardium${cite('pellikka2020')}. At peak, ${segWords([...Array(17).keys()].map((i) => i + 1).filter((k) => sc.peak[k] === 4))} turn dyskinetic; akinesis that turns into dyskinesis is a mechanical response of infarcted myocardium, not ischemia${cite('pellikka2020')}. The other segments become hyperkinetic. ${hrLine}.`;
  } else {
    const viable = [1, 2, 7, 8, 14];
    live = `<b>Viable myocardium: a biphasic response.</b> At rest the LAD territory is akinetic and the other segments are hypokinetic${v0 ? `; the LVEF is ${fmt(v0.ef)}%` : ''}. At ${N.low.dose} µg/kg/min, ${segWords(viable)} improve to hypokinesis, a sign of contractile reserve${vl ? `, and the LVEF rises to ${fmt(vl.ef)}%` : ''}. At ${P.dose} µg/kg/min they are akinetic again${v1 ? `, and the LVEF is ${fmt(v1.ef)}%` : ''}. Of all the responses, this biphasic response has the highest positive predictive value for recovery of function after revascularization${cite('pellikka2020')}. Contractile reserve in 4 to 5 dysfunctional segments is the minimum that predicts an increase in LVEF of 5% or more with revascularization${cite('pellikka2020')}; here ${viable.length} segments show it. The apical anterior segment and the apex do not improve: scar. The other segments stay hypokinetic; remodeled myocardium may or may not improve with dobutamine${cite('pellikka2020')}.`;
  }
  const flagHr = !reached && key !== 'multi' && key !== 'viable';
  // a viability study reads the low dose too: the biphasic response shows only with it
  const three = key === 'viable';
  // a line breaks before an arrow, not after it
  const seq = (xs) => xs.join(' →\u00a0');
  const efs = three ? [v0, vl, v1] : [v0, v1];
  const efOk = efs.every(Boolean);
  return {
    readouts: [
      { k: 'Peak stage', v: peakWhat, text: true },
      { k: 'Peak heart rate', v: `${P.hr}`, u: `/min · ${pct}%`, flag: flagHr },
      { k: 'Peak blood pressure', v: `${P.sbp}/${P.dbp}`, u: 'mmHg' },
      // the sequences wrap in their boxes (text), as a phone's boxes are narrow
      three
        ? { k: 'WMSI, rest → low → peak', v: seq([w0, wl, w1].map((w) => fmt(w, 2))), text: true, flag: true }
        : { k: 'WMSI, rest → peak', v: seq([w0, w1].map((w) => fmt(w, 2))), text: true, flag: w1 > w0 || w0 > 1 },
      {
        k: three ? 'LVEF, rest → low → peak' : 'LVEF, rest → peak',
        v: efOk ? seq(efs.map((x) => fmt(x.ef))) : '–',
        u: efOk ? '%' : '',
        text: true,
        flag: efOk && efs[efs.length - 1].ef < efs[efs.length - 2].ef,
      },
      { k: 'Result', v: C.result, text: true, flag: key !== 'normal' },
    ],
    live,
  };
}

// ---------------------------------------------------------------- the chapter
export default {
  key: 'stress',
  part: 'function',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Stress echocardiography',
  nav: 'Stress',
  dwell: 21,
  defaults: { sxCase: 'normal', sxView: 'a4c', sxVol: 0 },
  watch: ['sxCase', 'sxView', 'sxVol'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) {
    st = state;
    setState = set;
  },
  onState(s, ch) {
    // a case opens on the view that shows its territory best
    if ('sxCase' in ch && !('sxView' in ch) && CASES[s.sxCase] && s.sxView !== CASES[s.sxCase].view) setState({ sxView: CASES[s.sxCase].view });
    if ('sxCase' in ch || 'pheno' in ch) measureNext();
  },
  enter() { open = true; for (const p of QUAD) p.start(); startMap().then(measureNext); },
  leave() { open = false; },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter)
  warm() { for (const p of QUAD) p.start(); startMap(); },
  // a video page waits for the views and every case's volumes
  ready() {
    if (!geo || !geo.map) { startMap(); return false; }
    if (!open) { open = true; measureNext(); }
    return QUAD.every((p) => p.state === 'ready') && CASE_ORDER.every((k) => volumesOf(k));
  },
  anim(dt, s, set) {
    if (!reducedMotion) {
      clock += dt;
      // two of the four views a frame, in turn; all four on a video page
      for (let j = 0; j < (VIDEO ? 4 : 2); j++) { const i = next++ % 4; shown[i] = stageTime(i); }
      redraw();
    }
    // the volumes of the case shown arrived: its text again
    const k = volKey(s.sxCase);
    if (k && volumesOf(s.sxCase) && volShown !== k) { volShown = k; set({ sxVol: (s.sxVol || 0) + 1 }); }
    if (geo && geo.map && open && !measuring) measureNext();
  },
  pulse() {
    const hr = stageOf(RUNS[caseOf(st.sxCase).run], 'rest').hr, rr = 60000 / hr;
    return { rr, phase: reducedMotion ? null : ((clock * 1000) % rr) / rr };
  },
  tourEnter(set) { set({ sxCase: 'normal', sxView: CASES.normal.view }); },
  tourTick(tt, set) {
    const k = CASE_ORDER[Math.min(CASE_ORDER.length - 1, Math.floor(tt / 3))];
    set({ sxCase: k, sxView: CASES[k].view });
  },
  tourAt(s) { const i = CASE_ORDER.indexOf(s.sxCase); return i < 0 ? 0 : i * 3; },
  text(s, { cite }) { return textOf(s, cite); },
};
