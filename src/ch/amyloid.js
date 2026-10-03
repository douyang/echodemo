// 17 Cardiac amyloidosis: one slider takes the model heart from normal to advanced amyloid
// cardiomyopathy. The burden (0 to 1) blends the heart mesh toward its amyloid shape, and the
// echo views are cut from that mesh, so the calipers measure the walls on the screen. Doppler,
// strain and filling follow an illustrative trajectory set inside the cited ranges (ASE 2025,
// ESC 2021, Phelan 2012). The ESC 2021 echo criteria and the multiparametric score run on the
// values. Not patient data.
import { Sheet, clamp, MONO } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, tagBox } from '../scope.js';
import { cycleAt, RR, EV } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, note, fit, shown } from '../sev.js';
import { glsBand } from '../norms.js';
import { loadModel } from '../model3d.js';
import { lapAlgorithm } from './fill.js';
import { BSA } from './pressure.js';

const KEY = 'amyS';
const ED = 31;   // ms: end-diastole of the cycle model, where the LV is largest

// ---------------------------------------------------------------- the model patient
// PLAX calipers at end-diastole, measured on the mesh at burdens 0 to 1 (mm); each is a
// straight line in the burden to within 0.05 mm
const ivsOf = (a) => 8.95 + 7.85 * a, lvidOf = (a) => 46.78 - 6.94 * a, pwOf = (a) => 8.91 + 6.09 * a;
// the mesh's normal and amyloid corners (assets/anatomy.json)
const lin = (a0, a1) => (a) => a0 + (a1 - a0) * a;
const EDV = lin(111.86, 71.65), ESV = lin(38.75, 32.7), LAMAX = lin(49.78, 115.52);
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

export function model(a) {
  const m = TRK(a);
  m.a = a;
  // values as printed, each derived value from the printed ones: the grade, the criteria and the
  // score read these numbers, so a value on screen never contradicts its mark
  for (const [k, d] of [['E', 2], ['A', 2], ['DT', 0], ['sep', 1], ['lat', 1], ['sSep', 1], ['aSep', 1], ['tr', 1], ['sd', 2], ['lars', 0]]) m[k] = shown(m[k], d);
  m.ivs = shown(ivsOf(a), 1); m.pw = shown(pwOf(a), 1); m.lvid = shown(lvidOf(a), 1); m.wall = Math.max(m.ivs, m.pw);
  m.edv = EDV(a); m.esv = ESV(a); m.ef = shown((100 * (m.edv - m.esv)) / m.edv);
  m.lavi = shown(LAMAX(a) / BSA);
  m.tapse = shown(TAPSE(a)); m.rvWall = RVW(a); m.ias = IAS(a); m.valve = VALVE(a); m.eff = EFF(a);
  m.rwt = shown((m.ivs + m.pw) / m.lvid, 2);
  m.avg = shown((m.sep + m.lat) / 2, 1);
  m.ea = shown(m.E / m.A, 2);
  m.eeSep = shown((m.E * 100) / m.sep, 1); m.eeLat = shown((m.E * 100) / m.lat, 1); m.eeAvg = shown((m.E * 200) / (m.sep + m.lat), 1);
  m.dd = lapAlgorithm(m);
  m.segs = [...Array(6).fill(m.base), ...Array(6).fill(m.mid), ...Array(4).fill(m.apex), m.cap].map((v, i) => v + JIT[i] * (0.5 + 0.5 * a));
  m.lsBase = mean(m.segs.slice(0, 6)); m.lsMid = mean(m.segs.slice(6, 12)); m.lsApex = mean(m.segs.slice(12, 16));
  m.gls = shown(mean(m.segs), 1);
  m.relaps = shown(Math.abs(m.lsApex) / (Math.abs(m.lsBase) + Math.abs(m.lsMid)), 2);
  // apical to basal septal strain: the apical septal segment over the two basal septal segments
  m.sab = shown(Math.abs(m.segs[13]) / Math.abs((m.segs[1] + m.segs[2]) / 2), 1);
  m.efGls = shown(m.ef / Math.abs(m.gls), 1);
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
export const gradeOf = (a) => model(a).grade;
const LEV = { ...LEVEL, 'wall <12 mm': 0, 'wall ≥12 mm': 2, 'criteria met': 3 };
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
// the page works in steps of 2% burden (0.16 mm of septum): the mesh views are cut again at
// each step, not at every frame of Play
const q = (a) => Math.round(a * 50) / 50;

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
  tags(ctx, bx, v.ev, [['rvant', 'RV'], ['lv', 'LV'], ['la', 'LA'], ['ao', 'Ao']], 0, box);
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
  const m = model(q(st[KEY]));
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

// ---------------------------------------------------------------- tables
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const GRADE = { 0: 'normal', 1: 'grade 1', 2: 'grade 2', 3: 'grade 3' };
function table(host, cap, head, body) {
  if (!host) return;
  host.innerHTML = `<caption>${cap}</caption>
    <thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${body.map(([cells, hit]) => `<tr${hit ? ' class="hit"' : ''}>${cells.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function criteriaTable(art, m) {
  const yes = (b) => (b ? 'yes' : 'no');
  table(art.querySelector('#amy-table'), 'ESC 2021 echocardiographic criteria', ['Finding', 'Cut-off', 'Value', 'Present'], [
    [['LV wall at end-diastole, no other cause', '≥12 mm', `${fmt(m.wall, 1)} mm`, yes(m.thick)], m.thick],
    [['Diastolic dysfunction', 'grade 2 or worse', m.dd.grade === null ? 'not graded' : GRADE[m.dd.grade], yes(m.find.dd)], m.find.dd],
    [['Septal s′, e′ and a′', 'all <5 cm/s', `${fmt(m.sSep, 1)} · ${fmt(m.sep, 1)} · ${fmt(m.aSep, 1)}`, yes(m.find.tdi)], m.find.tdi],
    [['GLS, absolute', '<15%', `${fmt(Math.abs(m.gls), 1)}%`, yes(m.find.gls)], m.find.gls],
  ]);
  table(art.querySelector('#amy-table2'), 'Multiparametric score (Boldrini 2020)', ['Item', 'Cut-off', 'Value', 'Points'], [
    [['(IVS + PW) ÷ LVIDd', '>0.6', fmt(m.rwt, 2), `${m.pts.rwt} of 3`], m.pts.rwt > 0],
    [['E/e′ average', '>11', fmt(m.eeAvg, 1), `${m.pts.ee} of 1`], m.pts.ee > 0],
    [['TAPSE', '≤19 mm', `${fmt(m.tapse)} mm`, `${m.pts.tapse} of 2`], m.pts.tapse > 0],
    [['GLS, absolute', '≤13%', `${fmt(Math.abs(m.gls), 1)}%`, `${m.pts.gls} of 1`], m.pts.gls > 0],
    [['Apical ÷ basal septal strain', '>2.9', fmt(m.sab, 1), `${m.pts.sab} of 3`], m.pts.sab > 0],
    [['Total', '≥8', '', `${m.score} of 10`], m.score >= 8],
  ]);
}

// ---------------------------------------------------------------- the chapter
export default {
  key: 'amyloid',
  part: 'cardiomyopathy',
  title: 'Cardiac amyloidosis',
  nav: 'Amyloid',
  dwell: 18,
  defaults: { amyS: 0.6 },
  format: { amyS: (v) => `${Math.round(q(v) * 100)}%` },
  watch: ['amyS'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(q(s)), 400);
    paintBands(document.getElementById('amy-grades'), BANDS, LEV, { 'wall <12 mm': '<12 mm', 'wall ≥12 mm': '≥12 mm', 'criteria met': 'met' });
  },
  enter() { startEcho(); },
  warm() { startEcho(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
    if (reducedMotion && sheet && echo && echo.a4c && !echo.a4c.fresh) sheet.dirty = true;
  },
  tourEnter(set) { set({ amyS: 0 }); },
  tourTick(tt, set) { set({ amyS: Math.round(clamp((tt - 1) / 14, 0, 1) * 400) / 400 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.amyS * 14; },
  text(s, { cite }) {
    const m = model(q(s[KEY]));
    const dd = m.dd.grade === null ? 'a filling pattern that is not graded' : m.dd.grade === 0 ? 'normal diastolic function' : `${GRADE[m.dd.grade]} diastolic dysfunction`;
    const found = [m.find.dd && 'grade 2 or worse diastolic dysfunction', m.find.tdi && 'septal s′, e′ and a′ all below 5 cm/s', m.find.gls && 'GLS below 15% in absolute value'].filter(Boolean);
    const list = found.length ? `${['', 'one of the three findings', 'two of the three findings', 'all three findings'][found.length]} (${found.join('; ')})` : 'none of the three findings';
    let head;
    if (m.met) head = `<b>ESC echocardiographic criteria met.</b> An LV wall thickness of ${fmt(m.wall, 1)} mm is accompanied by ${list}${m.score >= 8 ? `, and the score is ${m.score}` : ''}${cite('esc2021')}.`;
    else if (m.thick) head = `<b>LV wall thickness ${fmt(m.wall, 1)} mm, criteria not met.</b> ${list[0].toUpperCase()}${list.slice(1)} is present, and the score is ${m.score}; the criteria require two of the three findings or a score of 8 or more${cite('esc2021')}.`;
    else head = `<b>LV wall thickness ${fmt(m.wall, 1)} mm.</b> The ESC echocardiographic criteria require an unexplained LV wall thickness of 12 mm or more${cite('esc2021')}.`;
    const live = `${head} The Doppler findings indicate ${dd}, with an E/A ratio of ${fmt(m.ea, 2)}, a deceleration time of ${fmt(m.DT)} ms and an average E/e′ of ${fmt(m.eeAvg, 1)}${cite('nagueh2025')}. GLS is ${sgn(m.gls, 1)}% and the relative apical LS is ${fmt(m.relaps, 2)}${m.relaps >= 1 ? ', which indicates relative apical sparing' : ''}${cite('phelan2012')}.`;
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
      extra: (art) => criteriaTable(art, m),
    };
  },
};
