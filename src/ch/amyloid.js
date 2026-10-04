// Cardiac amyloidosis: one slider takes the model heart from normal to advanced amyloid
// cardiomyopathy. The burden (0 to 1) blends the heart mesh toward its amyloid shape, and the
// echo views are cut from that mesh, so the calipers measure the walls on the screen. Doppler,
// strain and filling follow an illustrative trajectory set inside the cited ranges (ASE 2025,
// ESC 2021, Phelan 2012). The ESC 2021 echo criteria and the multiparametric score run on the
// values. Not patient data.
// The text holds the criteria as a diagram, with ▲▼ buttons on the Doppler velocities, TAPSE and
// the longitudinal strain of each level. An edit stores these values in amx, with the burden at
// which the edits started (base). The walls, which the mesh shows, stay at that burden, and so
// does the slider: its label says that the values are edited, and its bands dim. A move of the
// slider, Play, the tour or a heart's preset clears amx, and the values follow the slider again.
import { Sheet, clamp, MONO } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, tagBox } from '../scope.js';
import { cycleAt, RR, EV } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit } from '../sev.js';
import { glsBand } from '../norms.js';
import { loadModel } from '../model3d.js';
import { round, stepOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { numOf } from '../order.js';
import { lapAlgorithm } from './fill.js';
import { BSA } from './pressure.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-amyloid .live', btn, fn);

const KEY = 'amyS';
const EDITS = 'amx';
const ED = 31;   // ms: end-diastole of the cycle model, where the LV is largest

// ---------------------------------------------------------------- the model patient
// PLAX calipers at end-diastole, measured on the mesh at burdens 0 to 1 (mm); each is a
// straight line in the burden to within 0.05 mm
const ivsOf = (a) => 8.8 + 7.53 * a, lvidOf = (a) => 46.8 - 6.89 * a, pwOf = (a) => 8.98 + 6.63 * a;
// the mesh's normal and amyloid corners (assets/anatomy.json)
const lin = (a0, a1) => (a) => a0 + (a1 - a0) * a;
const EDV = lin(111.86, 71.65), ESV = lin(38.75, 32.7), LAMAX = lin(49.78, 115.16);
const TAPSE = lin(20, 12), RVW = lin(3.4, 7.4), IAS = lin(5, 9), VALVE = lin(1.2, 3.2), EFF = lin(1.2, 6);
// filling, tissue Doppler and strain at normal, grade 1, grade 2 and grade 3 filling
const TRK = tracks([0, 0.35, 0.65, 1], {
  E: [0.75, 0.55, 0.8, 0.95], A: [0.6, 0.75, 0.6, 0.35], DT: [200, 250, 175, 140],
  sep: [9, 6, 5, 4], lat: [12, 8, 6, 5], sSep: [9, 7, 5.5, 4], aSep: [10, 9, 6, 3.5],
  tr: [2.2, 2.4, 2.9, 3.0], sd: [1.3, 1.4, 0.6, 0.4], lars: [38, 26, 16, 9],
  base: [-18, -14, -9, -5], mid: [-20, -17, -13, -9], apex: [-23, -21, -19, -17], cap: [-24, -23, -20, -18],
});
// small fixed offsets per segment, so that the bull's-eye does not look computed
const JIT = [0.6, -0.8, -0.4, 0.5, 0.3, -0.2, 0.4, -0.5, 0.2, 0.6, -0.3, -0.4, 0.3, -0.4, 0.5, -0.2, 0];
const mean = (l) => l.reduce((s, v) => s + v, 0) / l.length;
/** A number with a true minus sign. */
const sgn = (v, d = 0) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
/** The segments of each level: basal 1–6, mid 7–12, apical 13–16 (the apex cap, 17, moves with the apical level). */
const LEVELS = [[0, 6], [6, 12], [12, 16]];
/** Each segment's offset from the mean of its level at burden a: the jitter, larger as the disease advances. */
function offsets(a) {
  const k = 0.5 + 0.5 * a, out = [];
  for (const [i0, i1] of LEVELS) {
    const mj = mean(JIT.slice(i0, i1));
    for (let i = i0; i < i1; i++) out.push((JIT[i] - mj) * k);
  }
  return out;
}

/** The model's values at burden a, before rounding: the walls from the mesh, the rest from the tracks. */
function modelAt(a) {
  const m = TRK(a);
  m.a = a;
  m.ivs = ivsOf(a); m.pw = pwOf(a); m.lvid = lvidOf(a);
  m.edv = EDV(a); m.esv = ESV(a); m.lavi = LAMAX(a) / BSA;
  m.tapse = TAPSE(a); m.rvWall = RVW(a); m.ias = IAS(a); m.valve = VALVE(a); m.eff = EFF(a);
  // the mean longitudinal strain of each level; the apex cap keeps its distance from the apical level
  const k = 0.5 + 0.5 * a;
  const lev = (v, i0, i1) => v + mean(JIT.slice(i0, i1)) * k;
  m.lsB = lev(m.base, 0, 6); m.lsM = lev(m.mid, 6, 12); m.lsA = lev(m.apex, 12, 16);
  m.capOff = m.cap + JIT[16] * k - m.lsA;
  return m;
}

/** The measurements with ▲▼ buttons: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  tapse: { d: 0, step: 1, min: 5, max: 30 },
  E: { d: 2, step: 0.05, min: 0.3, max: 1.6 },
  A: { d: 2, step: 0.05, min: 0.2, max: 1.2 },
  sep: { d: 1, step: 0.5, min: 2, max: 16 },
  lat: { d: 1, step: 0.5, min: 3, max: 20 },
  sSep: { d: 1, step: 0.5, min: 2, max: 12 },
  aSep: { d: 1, step: 0.5, min: 2, max: 12 },
  tr: { d: 1, step: 0.1, min: 1.5, max: 4.5 },
  lsB: { d: 1, step: 1, min: -30, max: -2 },
  lsM: { d: 1, step: 1, min: -30, max: -2 },
  lsA: { d: 1, step: 1, min: -30, max: -2 },
};
const IN = Object.keys(INPUTS);

/**
 * Values as reported: the measurements at their decimals, and each value from the rounded ones
 * before it. The diastolic grade, the criteria and the score read these numbers, so a value on
 * screen never contradicts its mark.
 */
function measure(raw) {
  const m = { ...raw };
  for (const k of IN) m[k] = round(raw[k], INPUTS[k].d);
  for (const [k, d] of [['DT', 0], ['sd', 2], ['lars', 0], ['ivs', 1], ['pw', 1], ['lvid', 1], ['lavi', 0]]) m[k] = round(raw[k], d);
  m.wall = Math.max(m.ivs, m.pw);
  m.ef = round((100 * (raw.edv - raw.esv)) / raw.edv, 0);
  m.rwt = round((m.ivs + m.pw) / m.lvid, 2);
  m.avg = round((m.sep + m.lat) / 2, 1);
  m.ea = round(m.E / m.A, 2);
  m.eeSep = round((m.E * 100) / m.sep, 1); m.eeLat = round((m.E * 100) / m.lat, 1); m.eeAvg = round((m.E * 200) / (m.sep + m.lat), 1);
  m.dd = lapAlgorithm(m);
  // the segments: the mean of each level as printed, and each segment's offset from it
  const lv = [m.lsB, m.lsM, m.lsA];
  m.segs = [...offsets(raw.a).map((o, i) => lv[i < 6 ? 0 : i < 12 ? 1 : 2] + o), m.lsA + raw.capOff];
  m.gls = round(mean(m.segs), 1);
  m.relaps = round(Math.abs(m.lsA) / (Math.abs(m.lsB) + Math.abs(m.lsM)), 2);
  // apical to basal septal strain: the apical septal segment (14) over the mean of the two basal
  // septal segments (2 and 3), each to a tenth
  m.sabA = round(Math.abs(m.segs[13]), 1); m.sabB = round(Math.abs((m.segs[1] + m.segs[2]) / 2), 1);
  m.sab = round(m.sabA / m.sabB, 1);
  m.efGls = round(m.ef / Math.abs(m.gls), 1);
  // ESC 2021: an unexplained wall of 12 mm or more, and two of three findings or 8 points
  m.thick = m.wall >= 12;
  m.find = { dd: (m.dd.grade ?? 0) >= 2, tdi: m.sSep < 5 && m.sep < 5 && m.aSep < 5, gls: Math.abs(m.gls) < 15 };
  m.nFind = Object.values(m.find).filter(Boolean).length;
  m.pts = { rwt: m.rwt > 0.6 ? 3 : 0, ee: m.eeAvg > 11 ? 1 : 0, tapse: m.tapse <= 19 ? 2 : 0, gls: Math.abs(m.gls) <= 13 ? 1 : 0, sab: m.sab > 2.9 ? 3 : 0 };
  m.score = Object.values(m.pts).reduce((s, v) => s + v, 0);
  m.met = m.thick && (m.nFind >= 2 || m.score >= 8);
  m.grade = m.met ? 'criteria met' : m.thick ? 'wall ≥12 mm' : 'wall <12 mm';
  return m;
}
/** The model's values at burden a, as reported. */
export const model = (a) => measure(modelAt(a));
export const gradeOf = (a) => model(a).grade;
const LEV = { ...LEVEL, 'wall <12 mm': 0, 'wall ≥12 mm': 2, 'criteria met': 3 };
let BANDS = [];

// the page works in steps of 2% burden (0.16 mm of septum): the mesh views are cut again at
// each step, not at every frame of Play
const q = (a) => Math.round(a * 50) / 50;

/** The values on screen: the edited measurements (amx) at the burden where the edits started, or the model's at the slider. */
function shownOf(s) {
  const ed = s[EDITS];
  if (!ed) return model(q(s[KEY]));
  const raw = modelAt(ed.base);
  for (const k of IN) raw[k] = ed[k];
  return measure(raw);
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

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- echo views cut from the mesh
// PLAX: a still frame at end-diastole with the calipers; A4C: the beating heart. Both show the
// page's burden whatever heart the header shows.
let echo = null;
async function startEcho() {
  if (echo) return;
  echo = { loading: true };
  try {
    const [m, E] = await Promise.all([loadModel(), import('../echo.js')]);
    const make = (key) => {
      const canvas = document.createElement('canvas');
      const ev = new E.EchoView(m, canvas, { offscreen: true, width: 300, height: 240 });
      ev.setView(key, { animate: false });
      return { key, ev, canvas, fresh: false, a: -1, t: 0 };
    };
    const plax = make('plax'), a4c = make('a4c');
    plax.ev.calipers = true;
    echo = { plax, a4c };
    if (sheet) sheet.dirty = true;
  } catch {
    echo = { failed: true };
  }
}
function renderView(v, a, tms) {
  if (v.a !== q(a)) { v.ev.setBurden(q(a)); v.a = q(a); }
  const c = cycleAt(tms);
  v.ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  v.fresh = true;
  v.t = tms;
}

/** Depth marks on the right edge of a mesh view, every centimetre, numbered every five. */
function depthMarks(ctx, bx, ev) {
  const mp = ev.map, depth = ev.specOf(ev.view).depth;
  if (!mp) return;
  ctx.save();
  ctx.strokeStyle = SC.dim;
  ctx.fillStyle = SC.dim;
  ctx.font = `400 9px ${MONO}`;
  ctx.textAlign = 'right';
  const x = bx.x + bx.w - 2;
  for (let d = 1; d <= depth; d++) {
    const y = bx.y + mp.Y(d);
    if (y > bx.y + bx.h - 3) break;
    ctx.beginPath();
    ctx.moveTo(x - (d % 5 ? 3 : 6), y);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (d % 5 === 0) ctx.fillText(String(d), x - 8, y + 3);
  }
  ctx.restore();
}

/** Chamber names on a mesh view, from the heart's anchors on the plane; none on the box `avoid`. */
function tags(ctx, bx, ev, list, s, avoid = null) {
  const mp = ev.map, g = ev.g;
  if (!mp || !g) return;
  const an = ev.anchors(s);
  ctx.save();
  ctx.font = `600 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,10,12,0.85)';
  ctx.fillStyle = 'rgba(214,222,226,0.92)';
  for (const [k, name] of list) {
    if (!an[k]) continue;
    const [u, v] = ev.toPlane(an[k], g);
    const x = bx.x + mp.X(u), y = bx.y + mp.Y(v);
    if (x < bx.x + 12 || x > bx.x + bx.w - 12 || y < bx.y + 10 || y > bx.y + bx.h - 10) continue;
    const hw = ctx.measureText(name).width / 2 + 3;
    if (avoid && x + hw > avoid.x && x - hw < avoid.x + avoid.w && y + 9 > avoid.y && y - 9 < avoid.y + avoid.h) continue;
    ctx.strokeText(name, x, y);
    ctx.fillText(name, x, y);
  }
  ctx.restore();
}

/** One mesh view in a scanner panel; returns the image box. */
function meshPanel(ctx, P, title, v, m, draw) {
  panel(ctx, P.x, P.y, P.w, P.h, title);
  const bx = { x: P.x + 4, y: P.y + 22, w: P.w - 8, h: P.h - 26 };
  if (!v) {
    note(ctx, bx, echo && echo.failed ? 'no heart model' : 'loading the heart model', 'top');
    return bx;
  }
  const w = Math.max(60, Math.round(bx.w)), h = Math.max(60, Math.round(bx.h));
  if (v.ev.w !== w || v.ev.h !== h) { v.ev.setSize(w, h); v.fresh = false; }
  draw(w, h);
  ctx.drawImage(v.canvas, bx.x, bx.y, w, h);
  depthMarks(ctx, bx, v.ev);
  return bx;
}

function plaxView(ctx, P, m) {
  const v = echo && echo.plax;
  const bx = meshPanel(ctx, P, fit(P.w, 'PARASTERNAL LONG AXIS · END-DIASTOLE', 'PLAX · ED'), v, m, () => {
    // a still frame: drawn again when the burden or the size changes
    if (!v.fresh || v.a !== q(m.a)) renderView(v, m.a, ED);
  });
  if (!v) return;
  // the numbers are the page's: the calipers on the mesh read them to within 0.05 mm
  const M = { ivs: m.ivs, lvid: m.lvid, pw: m.pw };
  // a small panel keeps the two walls; a large one adds the cavity and the ratio
  const lines = bx.w < 250 || bx.h < 220 ? [`IVSd ${M.ivs.toFixed(1)} mm`, `PWd ${M.pw.toFixed(1)} mm`]
    : [`IVSd ${M.ivs.toFixed(1)} mm`, `LVIDd ${M.lvid.toFixed(1)} mm`, `PWd ${M.pw.toFixed(1)} mm`, `RWT ${((M.ivs + M.pw) / M.lvid).toFixed(2)}`];
  const box = corner(ctx, bx, lines);
  tags(ctx, bx, v.ev, [['prv', 'RV'], ['plv', 'LV'], ['la', 'LA'], ['ao', 'Ao']], 0, box);
}

/** A measurement box in the image's top-left corner, which the sector leaves empty; returns it. */
function corner(ctx, bx, lines) {
  const size = bx.w < 250 ? 9.5 : 10.5;
  return tagBox(ctx, bx.x + 4, bx.y + 4 + (lines.length * (size + 3) + 8) / 2, lines, { size, bounds: bx });
}

function a4cView(ctx, P, m, tt) {
  const v = echo && echo.a4c;
  const bx = meshPanel(ctx, P, fit(P.w, 'APICAL FOUR-CHAMBER', 'A4C'), v, m, () => {
    if (!v.fresh || v.a !== q(m.a) || v.t !== tt) renderView(v, m.a, tt);
  });
  if (!v) return;
  const lines = bx.w < 250 || bx.h < 220 ? [`LAVi ${Math.round(m.lavi)} mL/m²`]
    : [bx.w < 300 ? `LAVi ${Math.round(m.lavi)} mL/m²` : `LA volume index ${Math.round(m.lavi)} mL/m²`, `effusion ${m.eff.toFixed(0)} mm`];
  const box = corner(ctx, bx, lines);
  tags(ctx, bx, v.ev, [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']], cycleAt(tt).s, box);
}

// ---------------------------------------------------------------- Doppler
/** Mitral inflow (m/s): E from mitral opening, a linear fall over DT, A after the P wave. */
function inflow(m) {
  const up = 70;
  return (tms) => {
    const t = ((tms % RR) + RR) % RR;
    let out = 0;
    if (t >= EV.mvo && t < EV.mvo + up) out = m.E * Math.sin(((t - EV.mvo) / up) * Math.PI / 2);
    else if (t >= EV.mvo + up && t < EV.mvo + up + m.DT) out = m.E * (1 - (t - EV.mvo - up) / m.DT);
    const aOn = 760, aPk = 800, aEnd = RR + 8, tA = t < 20 ? t + RR : t;
    if (tA >= aOn && tA < aPk) out = Math.max(out, m.A * Math.sin(((tA - aOn) / (aPk - aOn)) * Math.PI / 2));
    else if (tA >= aPk && tA < aEnd) out = Math.max(out, m.A * (1 - (tA - aPk) / (aEnd - aPk)));
    return out;
  };
}
/** Septal annulus velocity (m/s): s′ toward the probe in systole, e′ and a′ away from it. */
function tissue(m) {
  return (tms) => {
    const t = ((tms % RR) + RR) % RR;
    if (t > 70 && t < 330) return (m.sSep / 100) * Math.sin(Math.PI * (t - 70) / 260) ** 0.9;
    if (t > EV.mvo - 10 && t < EV.mvo + 140) return -(m.sep / 100) * Math.sin(Math.PI * (t - EV.mvo + 10) / 150);
    if (t > 770 && t < RR) return -(m.aSep / 100) * Math.sin(Math.PI * (t - 770) / (RR - 770));
    return 0;
  };
}

function inflowPanel(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · MITRAL INFLOW', 'PW · MV'));
  const bx = inner(P);
  const f = inflow(m);
  spectral(ctx, bx, { fn: (u) => f(u * 2 * RR), scale: 1.2, base: 0.9, mode: 'pw', broad: 0.1, key: `amyin|${m.E.toFixed(3)}|${m.A.toFixed(3)}|${Math.round(m.DT)}`, seed: 3 });
  vscale(ctx, bx, 1.2, 0.9, 0.5);
  note(ctx, bx, [`E ${m.E.toFixed(2)} · A ${m.A.toFixed(2)} m/s · E/A ${m.ea.toFixed(2)} · DT ${Math.round(m.DT)} ms`, `E/A ${m.ea.toFixed(2)} · DT ${Math.round(m.DT)}`, `E/A ${m.ea.toFixed(2)}`], 'top');
  return bx;
}

function tdiPanel(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'TISSUE DOPPLER · SEPTAL ANNULUS', 'TDI · SEPTAL'));
  const bx = inner(P);
  const f = tissue(m), scale = 0.14, base = 0.45;
  spectral(ctx, bx, { fn: (u) => f(u * 2 * RR), scale, base, mode: 'pw', broad: 0.25, key: `amytdi|${m.sSep.toFixed(2)}|${m.sep.toFixed(2)}|${m.aSep.toFixed(2)}`, seed: 8 });
  vscale(ctx, bx, scale, base, 0.05, 'cm/s', { cm: true });
  // the 5 cm/s line on both sides of the baseline: s′, e′ and a′ all inside it is the 5-5-5 sign
  const k = (bx.h * Math.max(base, 1 - base)) / scale, y0 = bx.y + base * bx.h;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([2, 4]);
  for (const y of [y0 - 0.05 * k, y0 + 0.05 * k]) { ctx.beginPath(); ctx.moveTo(bx.x, y); ctx.lineTo(bx.x + bx.w, y); ctx.stroke(); }
  ctx.restore();
  const five = m.find.tdi ? ' · all <5' : '';
  note(ctx, bx, [`s′ ${m.sSep.toFixed(1)} · e′ ${m.sep.toFixed(1)} · a′ ${m.aSep.toFixed(1)} cm/s${five}`, `s′ ${m.sSep.toFixed(1)} e′ ${m.sep.toFixed(1)} a′ ${m.aSep.toFixed(1)}`, `e′ ${m.sep.toFixed(1)}`], 'bottom');
  return bx;
}

// ---------------------------------------------------------------- strain bull's-eye
// peak systolic longitudinal strain (%): the scanner's colors, from deep red (normal, -20% or
// less) through pink and white (reduced) to blue (lengthening)
const RAMP = [[-22, [150, 20, 28]], [-16, [214, 62, 52]], [-11, [240, 140, 128]], [-6, [248, 214, 206]], [0, [232, 236, 244]], [6, [110, 150, 220]]];
function strainColor(v) {
  if (v <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [a, ca] = RAMP[i], [b, cb] = RAMP[i + 1];
    if (v <= b) { const u = (v - a) / (b - a); return ca.map((c, j) => Math.round(c + (cb[j] - c) * u)); }
  }
  return RAMP[RAMP.length - 1][1];
}
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const light = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 150;

function strainPanel(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, P.w > 200 ? 'LONGITUDINAL STRAIN' : 'STRAIN');
  const bx = { x: P.x + 6, y: P.y + 24, w: P.w - 12, h: P.h - 30 };
  const legend = bx.w > 190;
  const foot = 30;
  const R = Math.max(20, Math.min((bx.w - (legend ? 44 : 8)) / 2, (bx.h - foot - 18) / 2));
  const cx = bx.x + (legend ? (bx.w - 40) / 2 : bx.w / 2), cy = bx.y + 12 + R;
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D();
    p.arc(cx, cy, r1 * R, (-a * Math.PI) / 180, (-b * Math.PI) / 180, true);
    p.arc(cx, cy, r0 * R, (-b * Math.PI) / 180, (-a * Math.PI) / 180, false);
    p.closePath();
    return p;
  };
  const rings = [{ r0: 0.66, r1: 1, n: 6, first: 0 }, { r0: 0.36, r1: 0.66, n: 6, first: 6 }, { r0: 0.14, r1: 0.36, n: 4, first: 12 }];
  const num = R < 60 ? 8.5 : 10;
  const labels = [];
  ctx.save();
  ctx.strokeStyle = SC.bg;
  ctx.lineWidth = 1.2;
  for (const ring of rings) {
    const step = 360 / ring.n;
    for (let i = 0; i < ring.n; i++) {
      // segment 1 (and 7, 13) centred at the top, then counterclockwise: septum on the left
      const mid = 90 + i * step, v = m.segs[ring.first + i], c = strainColor(v);
      const p = wedge(ring.r0, ring.r1, mid - step / 2, mid + step / 2);
      ctx.fillStyle = rgb(c);
      ctx.fill(p);
      ctx.stroke(p);
      const am = (mid * Math.PI) / 180, rm = ((ring.r0 + ring.r1) / 2) * R;
      labels.push([v, cx + Math.cos(am) * rm, cy - Math.sin(am) * rm, c]);
    }
  }
  const cap = new Path2D();
  cap.arc(cx, cy, 0.14 * R, 0, Math.PI * 2);
  const c17 = strainColor(m.segs[16]);
  ctx.fillStyle = rgb(c17);
  ctx.fill(cap);
  ctx.stroke(cap);
  labels.push([m.segs[16], cx, cy, c17]);
  if (R >= 34) {
    ctx.font = `600 ${num}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // the apical ring's numbers sit a quarter radius from the centre: they need a large map
    for (const [v, x, y, c] of labels.filter((l, i) => i < 12 || R >= 80)) {
      ctx.fillStyle = light(c) ? '#1b1d20' : '#f4f1ec';
      ctx.fillText(String(Math.round(v)), x, y + 0.5);
    }
  }
  // orientation
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('ANT', cx, cy - R - 3);
  ctx.textAlign = 'right';
  if (cx - R - 4 > bx.x + 22) ctx.fillText('SEPT', cx - R - 4, cy + 3);
  ctx.restore();
  if (legend) {
    // color scale: -25% at the top, +5% at the bottom
    const lx = bx.x + bx.w - 24, ly = cy - R, lh = 2 * R, lo = -25, hi = 5;
    for (let i = 0; i < lh; i++) {
      ctx.fillStyle = rgb(strainColor(lo + ((hi - lo) * i) / lh));
      ctx.fillRect(lx, ly + i, 8, 1.2);
    }
    ctx.save();
    ctx.font = `400 9px ${MONO}`;
    ctx.fillStyle = SC.dim;
    ctx.textAlign = 'left';
    for (const v of [-20, -10, 0]) ctx.fillText(String(v), lx + 11, ly + ((v - lo) / (hi - lo)) * lh + 3);
    ctx.fillText('%', lx + 11, ly + lh + 10);
    ctx.restore();
  }
  const fb = { x: bx.x, y: bx.y + bx.h - foot, w: bx.w, h: foot };
  note(ctx, fb, [`GLS ${sgn(m.gls, 1)}% · apex ÷ (base + mid) ${m.relaps.toFixed(2)}`, `GLS ${sgn(m.gls, 1)}% · RELAPS ${m.relaps.toFixed(2)}`, `GLS ${sgn(m.gls, 1)}%`], 'bottom');
}

// ---------------------------------------------------------------- measurement strip
function meterItems(m) {
  // in order of weight: a short strip keeps the first ones that fit
  return [
    { k: 'IVSd', v: m.ivs, u: 'mm', d: 1, lo: 6, hi: 20, cuts: [[12, '12']], bad: m.ivs >= 12 },
    { k: '(IVS + PW) ÷ LVIDd', v: m.rwt, d: 2, lo: 0.3, hi: 0.9, cuts: [[0.6, '0.6']], bad: m.rwt > 0.6 },
    { k: 'E/e′ average', v: m.eeAvg, d: 1, lo: 4, hi: 24, cuts: [[11, '11'], [14, '']], bad: m.eeAvg > 11 },
    { k: 'Septal e′', v: m.sep, u: 'cm/s', d: 1, lo: 2, hi: 12, cuts: [[5, '5']], bad: m.sep < 5 },
    { k: 'GLS, absolute', v: Math.abs(m.gls), u: '%', d: 1, lo: 6, hi: 24, cuts: [[13, ''], [15, '15']], bad: Math.abs(m.gls) < 15 },
    { k: 'Relative apical LS', v: m.relaps, d: 2, lo: 0.3, hi: 1.5, cuts: [[1, '1.0']], bad: m.relaps >= 1 },
    { k: 'LA volume index', v: m.lavi, u: 'mL/m²', lo: 15, hi: 70, norm: [16, 34], cuts: [[34, '34']], bad: m.lavi > 34 },
    { k: 'TAPSE', v: m.tapse, u: 'mm', lo: 8, hi: 28, cuts: [[17, ''], [19, '19']], bad: m.tapse <= 19 },
    { k: 'EF ÷ |GLS|', v: m.efGls, d: 1, lo: 2, hi: 7, cuts: [[4.1, '4.1']], bad: m.efGls > 4.1 },
  ];
}

// ---------------------------------------------------------------- the figure
function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = shown(st);
  const tt = beat.at(true, ED);
  if (W < 700) {
    // two rows of two: the long axis and the four chambers, then strain and tissue Doppler
    const [r1, r2] = rows({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.05, 1], 8);
    const [a, b] = cols(r1, [1, 1], 8), [c, d] = cols(r2, [1, 1], 8);
    plaxView(ctx, a, m);
    a4cView(ctx, b, m, tt);
    strainPanel(ctx, c, m);
    cursor(ctx, tdiPanel(ctx, d, m), beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const [v1, v2] = rows(colL, [1, 1.04], 10);
  plaxView(ctx, v1, m);
  a4cView(ctx, v2, m, tt);
  const [p1, p2, p3] = rows(colR, [0.85, 0.85, 2.1], 10);
  cursor(ctx, inflowPanel(ctx, p1, m), beat.sweep);
  cursor(ctx, tdiPanel(ctx, p2, m), beat.sweep);
  const [c1, c2] = cols(p3, [1, 1.12], 14);
  strainPanel(ctx, c1, m);
  const items = meterItems(m), fits = clamp(Math.floor((c2.h - 4) / 26), 5, items.length);
  meters(sh, t, { x: c2.x, y: c2.y + 4, w: c2.w, h: c2.h - 4 }, items.slice(0, fits), { row: 34 });
}

// ---------------------------------------------------------------- the diagram in the text
// The ESC 2021 criteria top to bottom: the measurements, with ▲▼ buttons on eleven of them; the
// calculations from them; the wall, the three findings and the score of Boldrini 2020; the result.
// A part whose state changes flashes, and the change line gives its cause and effect (edits.js).
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const GRADE = { 0: 'normal', 1: 'grade 1', 2: 'grade 2', 3: 'grade 3' };
const NAME = {
  ivs: 'IVSd', pw: 'PWd', lvid: 'LVIDd', tapse: 'TAPSE',
  E: 'E velocity', A: 'A velocity', sep: 'Septal e′', lat: 'Lateral e′', sSep: 'Septal s′', aSep: 'Septal a′', tr: 'Peak TR velocity',
  lsB: 'Basal LS', lsM: 'Mid LS', lsA: 'Apical LS',
  rwt: '(IVS + PW) ÷ LVIDd', ea: 'E/A', eeAvg: 'E/e′ average', dd: 'Diastolic function', gls: 'GLS', relaps: 'Relative apical LS', sab: 'Apical ÷ basal septal LS',
};
const UNIT = { ivs: 'mm', pw: 'mm', lvid: 'mm', tapse: 'mm', E: 'm/s', A: 'm/s', sep: 'cm/s', lat: 'cm/s', sSep: 'cm/s', aSep: 'cm/s', tr: 'm/s', lsB: '%', lsM: '%', lsA: '%', gls: '%' };
const ARIA = {
  tapse: 'TAPSE', E: 'the mitral E velocity', A: 'the mitral A velocity', sep: 'the septal e′ velocity', lat: 'the lateral e′ velocity',
  sSep: 'the septal s′ velocity', aSep: 'the septal a′ velocity', tr: 'the peak TR velocity',
  lsB: 'the basal longitudinal strain', lsM: 'the mid longitudinal strain', lsA: 'the apical longitudinal strain',
};
/** The walls, which the image shows, come from the slider: values without buttons. */
const RO = ['ivs', 'pw', 'lvid'];
const GROUPS = [
  ['twod', '2D and M-mode', 'the walls at end-diastole in the parasternal long axis; TAPSE by M-mode', ['ivs', 'pw', 'lvid', 'tapse']],
  ['dop', 'Doppler', 'PW of the mitral inflow, tissue Doppler at the mitral annulus, CW of the TR jet', ['E', 'A', 'sep', 'lat', 'sSep', 'aSep', 'tr']],
  ['strain', 'Strain', 'speckle tracking: the mean peak longitudinal strain of each level', ['lsB', 'lsM', 'lsA']],
];
/** Each calculation, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  rwt: ['(IVS + PW) ÷ LVIDd', ['(', { k: 'ivs' }, ' + ', { k: 'pw' }, ') ÷ ', { k: 'lvid' }]],
  ea: ['E ÷ A', [{ k: 'E' }, ' ÷ ', { k: 'A' }]],
  eeAvg: ['E ÷ the mean of septal and lateral e′, in cm/s', [{ k: 'Ecm' }, ' ÷ ', { k: 'eMean' }]],
  relaps: ['apical ÷ (basal + mid), without the signs', [{ k: 'aA' }, ' ÷ (', { k: 'aB' }, ' + ', { k: 'aM' }, ')']],
  sab: ['segment 14 ÷ the mean of segments 2 and 3, without the signs', [{ k: 'sabA' }, ' ÷ ', { k: 'sabB' }]],
};
const MEASURED = { gls: 'the mean of the 17 segments' };
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { ivs: 4, pw: 4, lvid: 4, E: 4, A: 4, Ecm: 3, eMean: 4, aA: 4, aB: 4, aM: 4, sabA: 4, sabB: 4 };
const CALC = ['rwt', 'ea', 'eeAvg', 'dd', 'gls', 'relaps', 'sab'];
const DEC = { ivs: 1, pw: 1, lvid: 1, rwt: 2, ea: 2, eeAvg: 1, relaps: 2, sab: 1, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };
/** The three findings and the five items of the score: key, name, cut-off (and points). */
const FINDINGS = [['dd', 'Diastolic dysfunction', 'grade 2 or worse'], ['tdi', 'Septal s′, e′ and a′', 'each <5 cm/s'], ['gls', 'GLS, absolute', '<15%']];
const POINTS = [['rwt', '(IVS + PW) ÷ LVIDd', '>0.6', 3], ['ee', 'E/e′ average', '>11', 1], ['tapse', 'TAPSE', '≤19 mm', 2], ['gls', 'GLS, absolute', '≤13%', 1], ['sab', 'Apical ÷ basal septal LS', '>2.9', 3]];
const OUTS = [['wall <12 mm', 'wall <12 mm'], ['wall ≥12 mm', 'criteria not met'], ['criteria met', 'criteria met']];
const HEAD = { 'wall <12 mm': 'Wall below 12 mm', 'wall ≥12 mm': 'Criteria not met', 'criteria met': 'Criteria met' };
const OUT_LINE = Object.fromEntries(OUTS);
/** The names in the change line: the calculations that each measurement changes, and the cut-offs crossed. */
const EFFECTS = { tapse: [], E: ['ea', 'eeAvg'], A: ['ea'], sep: ['eeAvg'], lat: ['eeAvg'], sSep: [], aSep: [], tr: [], lsB: ['gls'], lsM: ['gls'], lsA: ['gls'] };
const EFFECT = { ea: 'E/A', eeAvg: 'E/e′ average', gls: 'GLS' };
const FIND_LINE = { tdi: ['s′, e′ and a′ not all <5 cm/s', 's′, e′ and a′ all <5 cm/s'], gls: ['absolute GLS ≥15%', 'absolute GLS <15%'] };
const POINT_LINE = {
  rwt: ['(IVS + PW) ÷ LVIDd ≤0.6', '(IVS + PW) ÷ LVIDd >0.6'], ee: ['E/e′ average ≤11', 'E/e′ average >11'], tapse: ['TAPSE >19 mm', 'TAPSE ≤19 mm'],
  gls: ['absolute GLS >13%', 'absolute GLS ≤13%'], sab: ['apical ÷ basal septal LS ≤2.9', 'apical ÷ basal septal LS >2.9'],
};
const WALL_NOTE = 'The walls follow the slider. While values are edited, the walls and the slider stay at the burden where the edits started; a move of the slider clears the edits.';
const CALC_NOTE = `The diastolic grade comes from the 2025 ASE algorithm of chapter ${numOf('fill')}; the LA volume index, LA strain and the pulmonary vein S/D that it also reads follow the slider<span class="cite" data-ref="nagueh2025"></span>.`;
const CRIT_NOTE = 'The criteria need an unexplained LV wall thickness of 12 mm or more, and either two of the three findings or a score of 8 or more<span class="cite" data-ref="esc2021"></span>.';
const RES_NOTE = 'The criteria raise the suspicion of cardiac amyloidosis. In the ESC diagnostic pathways, they are used together with other tests<span class="cite" data-ref="esc2021"></span>.';
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const isLS = (k) => k === 'lsB' || k === 'lsM' || k === 'lsA';
const num = (k, x) => (isLS(k) ? sgn(x, 1) : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : s);
const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const pct = (a) => `${Math.round(a * 100)}%`;
const ddName = (dd) => (dd.grade === null ? 'not graded' : GRADE[dd.grade]);
/** A calculation as the diagram prints it. */
const calcText = (k, v) => (k === 'dd' ? ddName(v.dd) : k === 'gls' ? sgn(v.gls, 1) : v[k].toFixed(DEC[k]));
/** A number in a formula. */
function xnum(x, v) {
  if (x === 'Ecm') return String(Math.round(v.E * 100));
  if (x === 'eMean') { const e = (v.sep + v.lat) / 2; return e.toFixed(Math.abs(e * 10 - Math.round(e * 10)) < 1e-6 ? 1 : 2); }
  if (x === 'aA' || x === 'aB' || x === 'aM') return Math.abs(v[`ls${x[1]}`]).toFixed(1);
  if (x === 'sabA' || x === 'sabB') return v[x].toFixed(1);
  return v[x].toFixed(DEC[x]);
}
/** The path through the diastolic algorithm, in one line. */
const STEP1 = { eRed: 'e′ reduced', eeUp: 'E/e′ raised', trUp: 'TR velocity ≥2.8 m/s' };
const STEP3 = { lavi: 'LAVi >34 mL/m²', lars: 'LA strain ≤18%', sd: 'S/D ≤0.67' };
function ddLine(v) {
  const r = v.dd, ab = Object.keys(STEP1).filter((k) => r.step1[k]).map((k) => STEP1[k]);
  if (r.grade === 0) return 'e′, E/e′ and TR velocity normal';
  if (r.grade === 1) return 'e′ reduced alone, with E/A ≤0.8';
  if (r.grade === null) return `${listOf(ab)}; LAVi, LA strain and S/D normal`;
  const s3 = r.step3 ? Object.keys(STEP3).filter((k) => r.step3[k]).map((k) => STEP3[k]) : [];
  return `${listOf(ab)}${s3.length ? `; ${listOf(s3)}` : ''}; E/A ${fmt(v.ea, 2)}, ${v.ea >= 2 ? '≥2' : '<2'}`;
}

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}${isLS(k) ? (dir > 0 ? ', toward zero' : ', more negative') : ''}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => (RO.includes(k)
    ? `<div class="ase-row asx-in is-calc" data-ro="${k}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl"><span></span><span class="ase-v"><b></b><small>${UNIT[k]}</small></span><span></span></span>
    </div>`
    : `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${btn(k, -1)}<span class="ase-v"><b></b><small>${UNIT[k]}</small></span>${btn(k, 1)}</span>
    </div>`);
  const group = ([s, name, sub, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">${sub}</span></p>
      ${keys.map(input).join('')}${s === 'twod' ? `<p class="ase-note asx-note amy-wn">${WALL_NOTE}</p>` : ''}
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k]}ch"></i>`)).join('');
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b>${UNIT[k] ? `<small>${UNIT[k]}</small>` : ''}</span></p>
      <p class="asx-f">${FORMULA[k] ? `<span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span>` : k === 'dd' ? '<span class="asx-fx" data-dd></span>' : `<span class="asx-fx">${MEASURED[k]}</span>`}</p>
    </div>`;
  const crit = (set, k, name, rule) => `<p class="asx-q" data-c="${set}:${k}"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">${name}</span><span class="asx-qr">${rule}</span><span class="asx-qs"></span></p>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Measurements and criteria</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${GROUPS.map(group).join('')}
    <div class="ase-step is-on asx-step" data-s="calc">
      <p class="ase-sh"><span class="ase-sn">Calculations</span><span class="ase-sx">from the measurements as printed</span><a class="asx-go" href="#fill" data-go="fill" aria-label="The diastolic algorithm: chapter ${numOf('fill')}, Diastolic function">${numOf('fill')} Diastolic →</a></p>
      ${CALC.map(eq).join('')}
      <p class="ase-note asx-note">${CALC_NOTE}</p>
    </div>
    <div class="ase-step is-on asx-step" data-s="crit">
      <p class="ase-sh"><span class="ase-sn">Criteria</span><span class="ase-sx">ESC echocardiographic criteria<span class="cite" data-ref="esc2021"></span></span></p>
      <p class="asx-q" data-q="wall"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">LV wall</span><span class="asx-qr">≥12 mm, with no other cause</span><span class="asx-qs"></span></p>
      <div class="rgx-set amy-set" data-set="find"><p class="rgx-sh"><span>Two of three findings</span><span class="ase-count"></span></p>${FINDINGS.map(([k, n, r]) => crit('find', k, n, r)).join('')}</div>
      <div class="rgx-set amy-set" data-set="score"><p class="rgx-sh"><span>Or a score of 8 or more<span class="cite" data-ref="boldrini2020"></span></span><span class="ase-count"></span></p>${POINTS.map(([k, n, r, p]) => crit('score', k, n, `${r}, ${p} point${p > 1 ? 's' : ''}`)).join('')}</div>
      <p class="ase-note asx-note">${CRIT_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">the wall, and either path<span class="cite" data-ref="esc2021"></span></span></p>
      <div class="asx-br is-on"><p class="asx-os">${OUTS.map(([o, lab]) => `<span class="ase-o" data-o="${o}"${o === 'criteria met' ? ' data-sev' : ''}>${lab}</span>`).join('')}</p></div>
      <p class="ase-note asx-note">${RES_NOTE}</p>
    </div>`;
  const $ = (sel) => host.querySelector(sel);
  dg = {
    host, result: $('.ase-result'), head: $('.ase-result b'), sub: $('.ase-result span'), change: $('.ase-change'), reset: $('.ase-reset'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = $(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    ro: Object.fromEntries(RO.map((k) => [k, $(`[data-ro="${k}"] .ase-v b`)])),
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, { el, v: el.querySelector('.asx-v b'), xs: [...el.querySelectorAll('[data-x]')] }])),
    dd: $('[data-dd]'),
    wall: { el: $('[data-q="wall"]'), st: $('[data-q="wall"] .asx-qs') },
    sets: Object.fromEntries([...host.querySelectorAll('.amy-set')].map((el) => [el.dataset.set, { el, n: el.querySelector('.ase-count') }])),
    crit: Object.fromEntries([...host.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, { el, st: el.querySelector('.asx-qs') }])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements of the values v, as amx stores them. */
const valsOf = (v) => Object.fromEntries(IN.map((k) => [k, v[k]]));
/** The keys of amx that differ from the model's values at the burden where the edits started. */
function editedOf(ed) {
  const m = model(ed.base);
  return IN.filter((k) => Math.abs(ed[k] - m[k]) > 1e-9);
}

const freeLive = () => { const live = document.querySelector('#ch-amyloid .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click: the edited values, at the burden where the edits started; the slider stays, and Play and the tour stop. */
function edit(k, dir, btn = null) {
  const s = st;
  const base = s[EDITS] ? s[EDITS].base : q(s[KEY]);
  const cur = shown(s);
  const vals = valsOf(cur);
  const from = vals[k], to = stepOf(from, INPUTS[k], dir);
  if (to === from) return;
  vals[k] = to;
  const ed = { ...vals, base };
  const next = shownOf({ ...s, [EDITS]: ed });
  pending = { kind: 'edit', k, from, to };
  // back at the model's values, the edits clear
  steady(btn, () => setState({ [EDITS]: editedOf(ed).length ? Object.freeze(ed) : null, anim: false, playing: false }));
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

/** The diagram at the values on screen: the measurements, the calculations, the criteria and the result; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const M = { ed: !!s[EDITS], v, out: v.grade, eds: s[EDITS] ? editedOf(s[EDITS]) : [] };
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
  for (const k of RO) txt(dg.ro[k], num(k, v[k]));
  // the calculations
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, calcText(k, v));
    for (const el of E.xs) txt(el, xnum(el.dataset.x, v));
  }
  txt(dg.dd, ddLine(v));
  // the criteria
  dg.wall.el.classList.toggle('is-on', v.thick);
  txt(dg.wall.st, `${fmt(v.wall, 1)} mm`);
  const fst = { dd: ddName(v.dd), tdi: v.find.tdi ? 'yes' : 'no', gls: `${fmt(Math.abs(v.gls), 1)}%` };
  for (const [k] of FINDINGS) { const C = dg.crit[`find:${k}`]; C.el.classList.toggle('is-on', v.find[k]); txt(C.st, fst[k]); }
  for (const [k] of POINTS) { const C = dg.crit[`score:${k}`]; C.el.classList.toggle('is-on', v.pts[k] > 0); txt(C.st, String(v.pts[k])); }
  txt(dg.sets.find.n, `${v.nFind} of 3`);
  dg.sets.find.el.classList.toggle('is-on', v.nFind >= 2);
  txt(dg.sets.score.n, `${v.score} of 10`);
  dg.sets.score.el.classList.toggle('is-on', v.score >= 8);
  // the result
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', o === M.out);
  txt(dg.head, HEAD[M.out]);
  txt(dg.sub, `wall ${fmt(v.wall, 1)} mm · ${v.nFind} of 3 findings · score ${v.score} of 10`);
  dg.result.classList.toggle('is-raised', v.met);
  dg.reset.classList.toggle('is-off', !M.ed);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.ed && !pending) freeLive();
  // the slider: main.js writes its label when amyS changes, and an edit changes it alone; its
  // bands are the model's results, so they dim while the values are edited
  const o = document.querySelector('output[data-for="amyS"]');
  if (o) txt(o, amyPage.format.amyS(s[KEY], s));
  document.getElementById('amy-grades')?.classList.toggle('is-ed', M.ed);
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || P.v.a !== v.a || P.out !== M.out || P.ed !== M.ed;
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

/** The cut-offs that a change crossed: the wall, the diastolic grade, the findings and the points. */
function crossed(P, M) {
  const a = P.v, b = M.v, out = [];
  if (a.thick !== b.thick) out.push(b.thick ? 'wall ≥12 mm' : 'wall <12 mm');
  if (a.dd.grade !== b.dd.grade) out.push(`diastolic function ${ddName(a.dd)} → ${ddName(b.dd)}`);
  for (const k of ['tdi', 'gls']) if (a.find[k] !== b.find[k]) out.push(FIND_LINE[k][+b.find[k]]);
  if (a.nFind !== b.nFind) out.push(`findings ${a.nFind} → ${b.nFind} of 3`);
  for (const [k] of POINTS) if (a.pts[k] !== b.pts[k]) out.push(POINT_LINE[k][+(b.pts[k] > 0)]);
  if (a.score !== b.score) out.push(`score ${a.score} → ${b.score}`);
  return out;
}

/** The cause and effect of a change, as one line. crossed: a cut-off or the result changed. */
function changeLine(P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}` : cause.kind === 'reset' ? 'Reset' : 'Amyloid burden';
  const cut = crossed(P, M);
  let what;
  if (cause.kind === 'edit') {
    const ch = EFFECTS[cause.k].filter((k) => P.v[k] !== M.v[k]);
    what = [...ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${calcText(k, P.v)} → ${calcText(k, M.v)}`)}`), ...cut].join(', ') || 'no finding or point changed';
  } else what = [...(P.ed && !M.ed ? ['edits cleared'] : []), ...cut].join(', ') || 'no cut-off crossed';
  const result = P.out === M.out ? `Result unchanged: ${OUT_LINE[M.out]}` : `Result: ${OUT_LINE[P.out]} → ${OUT_LINE[M.out]}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(P, M, cause) {
  const a = P.v, b = M.v;
  if (a.thick !== b.thick) flash(dg.wall.el);
  for (const [k] of FINDINGS) if (a.find[k] !== b.find[k] || (k === 'dd' && a.dd.grade !== b.dd.grade)) flash(dg.crit[`find:${k}`].el);
  for (const [k] of POINTS) if (a.pts[k] !== b.pts[k]) flash(dg.crit[`score:${k}`].el);
  if (a.nFind !== b.nFind) flash(dg.sets.find.n);
  if (a.score !== b.score) flash(dg.sets.score.n);
  if (P.out !== M.out) { flash(dg.out[M.out]); flash(dg.result); }
  // an edit: the numbers it changed pulse
  if (cause.kind === 'edit') {
    flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (calcText(k, a) !== calcText(k, b)) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (xnum(el.dataset.x, a) !== xnum(el.dataset.x, b)) flash(el, 'is-tick');
    }
  }
}

// ---------------------------------------------------------------- the chapter
const amyPage = {
  key: 'amyloid',
  part: 'cardiomyopathy',
  title: 'Cardiac amyloidosis',
  nav: 'Amyloid',
  dwell: 18,
  defaults: { amyS: 0.6, [EDITS]: null },
  format: { amyS: (v, s) => `${pct(q(v))}${s?.[EDITS] ? ' · edited' : ''}` },
  watch: ['amyS', EDITS],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = bands((s) => gradeOf(q(s)), 400);
    paintBands(document.getElementById('amy-grades'), BANDS, LEV, { 'wall <12 mm': '<12 mm', 'wall ≥12 mm': '≥12 mm', 'criteria met': 'met' });
    buildDiagram(document.getElementById('amy-calc'));
    // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
    // listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (s[EDITS] && !(EDITS in ch) && (KEY in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ [EDITS]: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); startEcho(); },
  leave() { fresh = true; freeLive(); },
  warm() { startEcho(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
    if (reducedMotion && sheet && echo && echo.a4c && !echo.a4c.fresh) sheet.dirty = true;
  },
  tourEnter(set) { set({ amyS: 0, [EDITS]: null }); },
  tourTick(tt, set) { set({ amyS: Math.round(clamp((tt - 1) / 14, 0, 1) * 400) / 400 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.amyS * 14; },
  text(s, { cite }) {
    const m = shown(s);
    const dd = m.dd.grade === null ? 'a filling pattern that is not graded' : m.dd.grade === 0 ? 'normal diastolic function' : `${GRADE[m.dd.grade]} diastolic dysfunction`;
    const found = [m.find.dd && 'grade 2 or worse diastolic dysfunction', m.find.tdi && 'septal s′, e′ and a′ all below 5 cm/s', m.find.gls && 'GLS below 15% in absolute value'].filter(Boolean);
    const list = found.length ? `${['', 'one of the three findings', 'two of the three findings', 'all three findings'][found.length]} (${found.join('; ')})` : 'none of the three findings';
    let head;
    if (m.met) head = `<b>ESC echocardiographic criteria met.</b> An LV wall thickness of ${fmt(m.wall, 1)} mm is accompanied by ${list}${m.score >= 8 ? `, and the score is ${m.score}` : ''}${cite('esc2021')}.`;
    else if (m.thick) head = `<b>LV wall thickness ${fmt(m.wall, 1)} mm, criteria not met.</b> ${list[0].toUpperCase()}${list.slice(1)} is present, and the score is ${m.score}; the criteria require two of the three findings or a score of 8 or more${cite('esc2021')}.`;
    else head = `<b>LV wall thickness ${fmt(m.wall, 1)} mm.</b> The ESC echocardiographic criteria require an unexplained LV wall thickness of 12 mm or more${cite('esc2021')}.`;
    const ed = s[EDITS] ? editedOf(s[EDITS]) : [];
    const live = `${head} The Doppler findings indicate ${dd}, with an E/A ratio of ${fmt(m.ea, 2)}, a deceleration time of ${fmt(m.DT)} ms and an average E/e′ of ${fmt(m.eeAvg, 1)}${cite('nagueh2025')}. GLS is ${sgn(m.gls, 1)}% and the relative apical LS is ${fmt(m.relaps, 2)}${m.relaps >= 1 ? ', which indicates relative apical sparing' : ''}${cite('phelan2012')}.${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
    return {
      readouts: [
        { k: 'IVSd', v: fmt(m.ivs, 1), u: 'mm', flag: m.ivs >= 12 },
        { k: 'LVEF', v: fmt(m.ef), u: '%', flag: m.ef < 50 },
        { k: 'E/e′ average', v: fmt(m.eeAvg, 1), flag: m.eeAvg >= 14 },
        { k: 'GLS', v: sgn(m.gls, 1), u: '%', flag: glsBand(m.gls) === 'abnormal' },
        { k: 'Relative apical LS', v: fmt(m.relaps, 2), flag: m.relaps >= 1 },
        { k: 'Score', v: `${m.score}`, u: 'of 10', flag: m.score >= 8 },
        { k: 'ESC criteria', v: m.met ? 'met' : 'not met', text: true, flag: m.met },
      ],
      live,
      extra: () => renderDiagram(s, m),
    };
  },
};
export default amyPage;
