// Strain, in two tabs. Strain: one slider runs from normal LV function to severe dysfunction. A
// switch sets the pattern: global (every segment loses function together, the shortening along the
// long axis first), regional (the LAD territory first) or apical sparing (the basal and mid
// segments lose their shortening along the axis while the apical segments keep theirs, the pattern
// of cardiac amyloidosis). The three apical views are cut from the heart mesh, with the region of
// interest of speckle tracking (src/straintrack.js). It is the myocardial midline from base to
// base, in the six segments of each view, each colored by its strain. Beside the views are the
// strain curves of the chosen view through one beat, the 18-segment bull's-eye with GLS, and the
// arithmetic of global strain. On the apical-sparing pattern the arithmetic adds the relative apical
// LS (Phelan 2012). A click on a view chooses it. Cardio-oncology, a subtopic: a baseline study and
// a follow-up study during cancer therapy, side by side. One slider runs from no change to severe
// dysfunction, and a switch adds a new rise in cardiac biomarkers. The result follows the ESC 2022
// definitions of cancer therapy-related cardiac dysfunction (Lyon 2022, Table 3).
//
// The LV's motion is the chapter's model (src/gl/strainmesh.js). Every number the page prints is
// measured on the mesh along the model's tracks (src/straincal.js). The tracking gives each
// segment's strain and each view's midline; chapter 09's biplane method of disks gives the LVEF.
// The relative apical LS comes from the segments as the bull's-eye prints them. The strain curves
// and the region of interest are found on the mesh as they are drawn. The patient and the numbers
// are illustrative.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, SC } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { bands, paintBands, playSeverity, Beat, cine, rows, cols, note, fit, gradeTable, shown as rnd } from '../sev.js';
import { MeshPanel } from '../meshpanel.js';
import { scanner } from '../scanner.js';
import { diseaseTargets } from '../model3d.js';
import { phenoWeights } from '../gl/heart.js';
import { roiOf, midlineAt, segLengths, placesOf, roiVertices } from '../straintrack.js';
import { weightsAt, measuredAt } from '../straincal.js';
import { strainColor, rgb, light } from './amyloid.js';
import { reducedMotion } from '../state.js';
import { numOf } from '../order.js';
import { glsBand as glsGrade, lvefBand } from '../norms.js';

const KEY = 'strS', TAB = 'strTab', PAT = 'strPat', BIO = 'strBio', VIEW = 'strView';
const VIEWS = ['a4c', 'a2c', 'a3c'];
const VNAME = { a4c: 'A4C', a2c: 'A2C', a3c: 'A3C' };
const VLONG = { a4c: 'four-chamber', a2c: 'two-chamber', a3c: 'three-chamber' };
// the walls of each view, screen-left first (Lang 2015; ch/segments.js), with their angle on the
// bull's-eye (deg; 90 anterior, 180 septal)
const WALLS = {
  a4c: [['inferoseptal', 210], ['anterolateral', 30]],
  a2c: [['inferior', 270], ['anterior', 90]],
  a3c: [['inferolateral', 330], ['anteroseptal', 150]],
};
/** Segment k (0 to 5) of a view, in the order of its midline from the left base to the right base. */
const segOf = (view, k) => {
  const side = k < 3 ? 0 : 1;
  return { wall: WALLS[view][side][0], th: WALLS[view][side][1], level: k < 3 ? k : 5 - k };
};
// the LAD territory of the 18-segment model (gl/strainmesh.js ladOf)
const isLad = (wall, level) => wall === 'anterior' || wall === 'anteroseptal' || (wall === 'inferoseptal' && level === 2);
const DIS = ['strA', 'strB', 'strD', 'strR', 'strZ', 'strP', 'strQ'];

// ---------------------------------------------------------------- the values
const heartOf = (s) => s.pheno || 'normal';
const tabOf = (s) => (s[TAB] === 'onco' ? 'onco' : 'strain');
const PATTERNS = ['global', 'regional', 'apical'];
const trackOf = (s) => (tabOf(s) === 'onco' ? 'onco' : PATTERNS.includes(s[PAT]) ? s[PAT] : 'global');
const bioOf = (s) => s[BIO] === true;

// GLS (Thomas 2025): normal more negative than -18%, borderline -16% to -18%, abnormal less
// negative than -16%. The LVEF of a woman (Lang 2015, Table 4): normal 54-74%, mildly abnormal
// 41-53%, moderately abnormal 30-40%, severely abnormal <30% (norms.js; above 74% the site
// calls it hyperdynamic, graded here with the normal band).
const GLS_WORD = ['normal', 'borderline', 'abnormal'];
const EF_WORD = ['normal', 'mildly abnormal', 'moderately abnormal', 'severely abnormal'];
const EF_RANGE = ['54–74%', '41–53%', '30–40%', 'below 30%'];
const glsBand = (g) => GLS_WORD.indexOf(glsGrade(g));
const efBand = (ef) => Math.max(0, EF_WORD.indexOf(lvefBand(ef, 'F')));
const efWord = (ef) => lvefBand(ef, 'F');

/**
 * A study as printed: heart on track at slider position x. The midline lengths at 2 decimals
 * (cm), each view's strain from them, GLS the mean of the three views, the volumes in whole mL
 * and the LVEF from them; the segments' strain in whole percent.
 */
function study(heart, track, x) {
  const m = measuredAt(heart, track, x);
  const len0 = m.len0.map((v) => rnd(v, 2)), len1 = m.len1.map((v) => rnd(v, 2));
  const views = len0.map((l0, k) => rnd((100 * (len1[k] - l0)) / l0, 1));
  const gls = rnd((views[0] + views[1] + views[2]) / 3, 1);
  const edv = rnd(m.edv), esv = rnd(m.esv), ef = rnd((100 * (edv - esv)) / edv);
  const segs = m.segs.map((v) => rnd(v));
  return { heart, track, x, segs, len0, len1, views, gls, edv, esv, ef, gb: glsBand(gls), eb: efBand(ef), ...apicalLs(segs) };
}

/**
 * The relative apical LS of the segments as the bull's-eye prints them (whole %): the mean apical
 * strain divided by the sum of the mean basal and mean mid strain, without the signs (Phelan 2012).
 * Each level has six segments, so the ratio is that of the levels' sums, and it equals the ratio
 * that the bull's-eye's numbers give. The means print to 0.01%: their arithmetic then gives the same
 * ratio at nearly every state.
 */
function apicalLs(segs) {
  const sum = [0, 0, 0];
  segs.forEach((x, i) => { sum[segOf('a4c', i % 6).level] += x; });
  const den = Math.abs(sum[0]) + Math.abs(sum[1]);
  return { lev: sum.map((x) => rnd(x / 6, 2)), relaps: den > 0 ? rnd(Math.abs(sum[2]) / den, 2) : NaN };
}
// Phelan 2012: a relative apical LS of 1.0 or more, relative apical sparing
const RELAPS_CUT = 1;
const GRADES = ['normal', 'GLS borderline', 'GLS abnormal', 'LVEF mildly abnormal', 'LVEF moderately abnormal', 'LVEF severely abnormal'];
const strainGrade = (v) => (v.eb ? GRADES[2 + v.eb] : GRADES[v.gb]);

/**
 * The follow-up against the baseline, by the ESC 2022 definitions of asymptomatic CTRCD (Lyon
 * 2022, Table 3), from the printed values: the relative decline in GLS (whole %), the fall in
 * LVEF (points) and the biomarkers.
 */
function ctrcd(b, f, bio) {
  const decline = rnd((100 * (Math.abs(b.gls) - Math.abs(f.gls))) / Math.abs(b.gls));
  const fall = b.ef - f.ef;
  return { decline, fall, ...ctrcdGrade(decline, fall, f.ef, bio) };
}
/** The grade for a relative decline in GLS (%), a fall in the LVEF (points) to ef (%), and the biomarkers. */
function ctrcdGrade(decline, fall, ef, bio) {
  const gls = decline > 15;
  // a new reduction of the LVEF: below its baseline
  if (ef < 40 && fall > 0) return { g: 'severe', why: 'ef' };
  if (ef < 50 && ef >= 40 && fall > 0) {
    if (fall >= 10) return { g: 'moderate', why: 'fall' };
    if (gls || bio) return { g: 'moderate', why: 'small fall' };
    return { g: 'none', why: '' };
  }
  if (ef >= 50 && (gls || bio)) return { g: 'mild', why: gls && bio ? 'both' : gls ? 'gls' : 'bio' };
  return { g: 'none', why: '' };
}
const CT_NAME = { none: 'no CTRCD', mild: 'mild CTRCD', moderate: 'moderate CTRCD', severe: 'severe CTRCD' };

let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state. */
function shown(s) {
  const key = `${heartOf(s)}|${trackOf(s)}|${s[KEY]}|${bioOf(s)}`;
  if (key !== lastKey || !lastShown) {
    lastKey = key;
    const heart = heartOf(s), track = trackOf(s), x = s[KEY];
    const v = study(heart, track, x);
    v.tab = tabOf(s);
    v.grade = strainGrade(v);
    if (v.tab === 'onco') {
      v.base = study(heart, 'onco', 0);
      v.bio = bioOf(s);
      v.ct = ctrcd(v.base, v, v.bio);
      v.grade = CT_NAME[v.ct.g];
    }
    lastShown = v;
  }
  return lastShown;
}
/** The grade at slider position x for the state s's tab, pattern, biomarkers and heart. */
function gradeAt(x, s) {
  const heart = heartOf(s), track = trackOf(s), v = study(heart, track, x);
  if (track !== 'onco') return strainGrade(v);
  return CT_NAME[ctrcd(study(heart, 'onco', 0), v, bioOf(s)).g];
}

// ---------------------------------------------------------------- the mesh and the tracking
let sheet = null, st = null, setState = null;
const redraw = () => { if (sheet) sheet.dirty = true; };
const MESH = Object.fromEntries(VIEWS.map((k) => [k, new MeshPanel(k, { diseases: DIS, redraw })]));
const MESH_B = new MeshPanel('a4c', { diseases: DIS, redraw });
const MESH_F = new MeshPanel('a4c', { diseases: DIS, redraw });
const panelsOf = (tab) => (tab === 'onco' ? [MESH_B, MESH_F] : VIEWS.map((k) => MESH[k]));

/** The targets' weights at time tms of the beat, for the end-systolic weights w. */
const motionAt = (w, tms) => { const sy = cycleAt(tms).s; return Object.fromEntries(Object.entries(w).map(([k, x]) => [k, x * sy])); };
/** The weights of the myocardium's targets as echo.js frame() sets them (noSys: the model's own motion is the chapter's). */
function meshWeights(ev, w, sy) {
  const P = ev.heart, a = P ? P.a : 0;
  const out = { amyloid: a, systole: sy, amyloid_systole: a * sy, ...phenoWeights(Object.keys(ev.myo.dict), P, sy, null, true) };
  for (const [k, x] of Object.entries(w)) out[`dx_${k}`] = x * sy;
  return out;
}

// The tracking: an offscreen view of each apical plane, never drawn, finds the region of interest
// on the heart shown at end-diastole; the midline's tissue then gives its place at any moment.
const TRK = { state: 'idle', evs: null, rois: {}, verts: {}, pv: -1, model: null };
function startTracker() {
  if (TRK.state !== 'idle') return;
  TRK.state = 'loading';
  (async () => {
    const S = await scanner();
    await diseaseTargets(DIS);
    TRK.model = S.model;
    TRK.evs = Object.fromEntries(VIEWS.map((k) => {
      const ev = S.make(160, 140, k, { fill: true });
      ev.setView(k, { animate: false });
      ev.noSys = true;
      return [k, ev];
    }));
    TRK.state = 'ready';
    syncTracker();
    redraw();
  })().catch((err) => { console.error('strain: tracking failed', err); TRK.state = 'failed'; redraw(); });
}
/** The region of interest on each view of the heart shown: found again when the heart changes. */
function syncTracker() {
  if (TRK.state !== 'ready' || TRK.pv === TRK.model.pheno.version) return;
  TRK.pv = TRK.model.pheno.version;
  const ed = cycleAt(0);
  for (const k of VIEWS) {
    const ev = TRK.evs[k];
    ev.setMotion({});
    ev.frame({ s: ed.s, v: ed.v, drive: ed.drive, phase: ed.phase, t: ed.t });
    const roi = roiOf(ev, k);
    TRK.rois[k] = roi;
    TRK.verts[k] = roi ? roiVertices(roi) : null;
  }
  CURVES.clear();
}
const trackReady = () => TRK.state === 'ready' && TRK.pv === TRK.model.pheno.version;
/** The midline of view k at time tms for the end-systolic weights w: plane cm, or null. */
function midline(k, w, tms) {
  const roi = TRK.rois[k];
  if (!trackReady() || !roi) return null;
  const ev = TRK.evs[k], pos = placesOf(ev.myo, meshWeights(ev, w, cycleAt(tms).s), TRK.verts[k]);
  return midlineAt(roi, pos, ev.g);
}
// the strain curves of a view through one beat: the six segments and the whole midline (%)
const CURVES = new Map(), NT = 49;
function curvesOf(k, w, wkey) {
  const id = `${TRK.pv}|${k}|${wkey}`;
  if (CURVES.has(id)) return CURVES.get(id);
  const roi = TRK.rois[k];
  if (!trackReady() || !roi) return null;
  const L0 = roi.L0, l0 = L0.reduce((a, b) => a + b, 0), segs = L0.map(() => []), all = [];
  for (let i = 0; i < NT; i++) {
    const t = (i / (NT - 1)) * RR, L = segLengths(roi, midline(k, w, t));
    L.forEach((l, j) => segs[j].push(100 * (l / L0[j] - 1)));
    all.push(100 * (L.reduce((a, b) => a + b, 0) / l0 - 1));
  }
  const out = { segs, all };
  if (CURVES.size > 40) CURVES.clear();
  CURVES.set(id, out);
  return out;
}

// ---------------------------------------------------------------- drawing helpers
const beat = new Beat(RR);
// each view's moment in the beat: the views take turns to move on, so one mesh frame is cut a frame
const shownT = { a4c: 0, a2c: 0, a3c: 0, b: 0, f: 0 };
let turn = 0;
const sgn = (x, d = 0) => `${x < 0 ? '−' : x > 0 ? '+' : ''}${Math.abs(x).toFixed(d)}`;
const neg = (x, d = 1) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;
const font = (px, w = 500) => `${w} ${px}px ${MONO}`;
let layout = null;   // where the last frame put the views, for a click

/** The midline on a view, in its six segments, each in the color of its strain; ticks at the segment borders. */
function drawRoi(c, F, k, w, tms, v, small) {
  const P = midline(k, w, tms), roi = TRK.rois[k];
  if (!P || !roi) return;
  const B = roi.bounds, at = (x) => { const i = Math.min(P.length - 2, Math.floor(x)), f = x - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f]; };
  const run = (j) => { const pts = [at(B[j])]; for (let i = Math.ceil(B[j]); i < B[j + 1]; i++) pts.push(P[i]); pts.push(at(B[j + 1])); return pts.map(F.P); };
  const base = VIEWS.indexOf(k) * 6;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let j = 0; j < 6; j++) {
    const pts = run(j);
    const path = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    path();
    c.strokeStyle = 'rgba(8,10,12,0.8)';
    c.lineWidth = small ? 5 : 6.5;
    c.stroke();
    path();
    c.strokeStyle = rgb(strainColor(v.segs[base + j]));
    c.lineWidth = small ? 3 : 4;
    c.stroke();
  }
  for (let j = 0; j < 7; j++) {
    const [x, y] = F.P(at(B[j]));
    c.beginPath();
    c.arc(x, y, small ? 2 : 2.6, 0, Math.PI * 2);
    c.fillStyle = '#f4f1ec';
    c.fill();
  }
  c.restore();
}

/** One apical view, cut from the mesh, with its region of interest; the chosen view is framed. */
function viewPanel(sh, t, P, k, w, v, tms, chosen, mesh = MESH[k], title = null) {
  const ctx = sh.ctx, small = P.w < 200;
  const i = VIEWS.indexOf(k);
  const name = title || (P.w < 150 ? `${VNAME[k]} ${neg(v.views[i])}` : `${VNAME[k]} · ${neg(v.views[i])}%`);
  mesh.draw(ctx, P, name, {
    tms, motion: motionAt(w, tms), noSys: true,
    over: (c, F) => drawRoi(c, F, k, w, tms, v, small),
    names: small ? [] : k === 'a4c' ? [['la', 'LA'], ['ra', 'RA']] : [['la', 'LA']],
  });
  if (TRK.state === 'loading' || (TRK.state === 'ready' && !trackReady())) note(ctx, { x: P.x + 4, y: P.y + 22, w: P.w - 30, h: P.h - 26 }, small ? 'tracking…' : 'finding the region of interest', 'bottom');
  if (chosen) {
    ctx.save();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(P.x - 1.5, P.y - 1.5, P.w + 3, P.h + 3);
    ctx.restore();
  }
}

/** The strain curves of view k through one beat: the six segments in their colors, the whole midline in white. */
function curvesPanel(sh, P, k, w, wkey, v, tms) {
  const ctx = sh.ctx;
  // the title names the white curve where the panel is wide enough
  panel(ctx, P.x, P.y, P.w, P.h, P.w >= 340 ? `LONGITUDINAL STRAIN · ${VNAME[k]} · WHITE: WHOLE MIDLINE` : fit(P.w, `LONGITUDINAL STRAIN · ${VNAME[k]} · ONE BEAT`, `STRAIN · ${VNAME[k]}`));
  const bx = { x: P.x + 36, y: P.y + 28, w: P.w - 46, h: P.h - 50 };
  const C = curvesOf(k, w, wkey);
  if (!C) { note(ctx, bx, 'loading the heart model', 'top'); return; }
  const i0 = VIEWS.indexOf(k);
  const lo = Math.min(-25, Math.floor((Math.min(...C.all, ...C.segs.flat()) - 2) / 5) * 5), hi = Math.max(5, Math.ceil((Math.max(...C.segs.flat()) + 1) / 5) * 5);
  const X = (ms) => bx.x + (ms / RR) * bx.w, Y = (x) => bx.y + ((hi - x) / (hi - lo)) * bx.h;
  ctx.save();
  // the scale: every 5%, labeled every 10%
  ctx.font = font(10, 400);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  // the unit on the lowest label
  const last = Math.ceil(lo / 10) * 10;
  for (let x = hi; x >= lo; x -= 5) {
    ctx.strokeStyle = x === 0 ? 'rgba(199,205,208,0.55)' : 'rgba(141,151,156,0.18)';
    ctx.beginPath(); ctx.moveTo(bx.x, Y(x)); ctx.lineTo(bx.x + bx.w, Y(x)); ctx.stroke();
    if (x % 10 === 0) { ctx.fillStyle = SC.dim; ctx.fillText(`${x === 0 ? '0' : neg(x, 0)}${x === last ? '%' : ''}`, bx.x - 4, Y(x)); }
  }
  // end-diastole and aortic valve closure
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(255,232,154,0.75)';
  ctx.beginPath(); ctx.moveTo(X(EV.avc), bx.y); ctx.lineTo(X(EV.avc), bx.y + bx.h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = font(10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = SC.cal;
  ctx.fillText('AVC', X(EV.avc), bx.y + bx.h + 13);
  ctx.fillStyle = SC.dim;
  ctx.textAlign = 'left';
  ctx.fillText('ED', bx.x, bx.y + bx.h + 13);
  ctx.textAlign = 'right';
  ctx.fillText(`${RR} ms`, bx.x + bx.w, bx.y + bx.h + 13);
  // the curves
  const line = (ys, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ys.forEach((y, i) => { const px = X((i / (NT - 1)) * RR), py = Y(y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  C.segs.forEach((ys, j) => line(ys, rgb(strainColor(v.segs[i0 * 6 + j])), 1.6));
  line(C.all, '#ffffff', 2.6);
  // the peak of the whole midline, at aortic valve closure: the view's printed strain
  const yp = Y(v.views[i0]);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(X(EV.avc), yp, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // the moment shown
  if (cine.live) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(X(tms), bx.y); ctx.lineTo(X(tms), bx.y + bx.h); ctx.stroke();
    ctx.restore();
  }
}

/** The bull's-eye of the 18 segments (Voigt 2015): basal outside, apical inside, anterior at the top, septum left; GLS in the middle. */
function bullsEye(sh, P, segs, gls, title, o = {}) {
  const ctx = sh.ctx;
  panel(ctx, P.x, P.y, P.w, P.h, title);
  const bar = o.bar !== false && P.w >= 170;
  const room = { x: P.x + 8, y: P.y + 26, w: P.w - 16 - (bar ? 34 : 0), h: P.h - 34 };
  // the septal and lateral labels beside the rings where the panel is wide enough
  const side = room.w >= 200;
  // and the anterior and inferior labels above and below them where it is tall enough
  const tall = room.h >= 120;
  const R = Math.max(20, Math.min(room.w / 2 - (side ? 34 : 6), room.h / 2 - (tall ? 14 : 2)));
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
  const rings = [[0.74, 1], [0.48, 0.74], [0.24, 0.48]];
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D();
    p.arc(cx, cy, r1 * R, (-a * Math.PI) / 180, (-b * Math.PI) / 180, true);
    p.arc(cx, cy, r0 * R, (-b * Math.PI) / 180, (-a * Math.PI) / 180, false);
    p.closePath();
    return p;
  };
  // the value of each wall and level, from the view that shows it
  const val = {};
  VIEWS.forEach((k, i) => { for (let j = 0; j < 6; j++) { const g = segOf(k, j); val[`${g.th}|${g.level}`] = segs[i * 6 + j]; } });
  const labels = [];
  ctx.save();
  ctx.strokeStyle = SC.bg;
  ctx.lineWidth = 1.2;
  rings.forEach(([r0, r1], level) => {
    for (const th of [90, 150, 210, 270, 330, 30]) {
      const x = val[`${th}|${level}`], col = strainColor(x), p = wedge(r0, r1, th - 30, th + 30);
      ctx.fillStyle = rgb(col);
      ctx.fill(p);
      ctx.stroke(p);
      const am = (th * Math.PI) / 180, rm = ((r0 + r1) / 2) * R;
      labels.push([sgn(x), cx + Math.cos(am) * rm, cy - Math.sin(am) * rm, col]);
    }
  });
  const cap = new Path2D();
  cap.arc(cx, cy, 0.24 * R, 0, Math.PI * 2);
  ctx.fillStyle = '#16191b';
  ctx.fill(cap);
  ctx.strokeStyle = SC.frame;
  ctx.stroke(cap);
  // the segments' values, where the ring is wide enough for them
  const num = clamp(R * 0.12, 8, 11);
  ctx.font = font(num, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // every segment's value, where the narrowest ring holds the widest of them
  const arcRoom = (2 * Math.PI * 0.36 * R) / 6, widest = Math.max(...labels.map(([s]) => ctx.measureText(s).width));
  if (widest <= arcRoom - 4 && num >= 8) {
    for (const [s, x, y, col] of labels) {
      ctx.fillStyle = light(col) ? '#1b1d20' : '#f4f1ec';
      ctx.fillText(s, x, y + 0.5);
    }
  }
  // GLS in the middle
  const g = `${neg(gls)}`;
  let gs = clamp(R * 0.16, 8.5, 13);
  ctx.font = font(gs, 600);
  while (gs > 7.5 && ctx.measureText(g).width > 0.46 * R) { gs -= 0.5; ctx.font = font(gs, 600); }
  ctx.fillStyle = '#ffffff';
  ctx.fillText(g, cx, cy + 1);
  ctx.font = font(Math.max(7.5, gs - 3), 500);
  ctx.fillStyle = SC.dim;
  if (R >= 50) ctx.fillText('GLS', cx, cy - gs * 0.95);
  // orientation
  ctx.font = font(9.5, 500);
  ctx.fillStyle = SC.dim;
  if (tall) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ANT', cx, cy - R - 4);
    ctx.textBaseline = 'top';
    ctx.fillText('INF', cx, cy + R + 3);
  }
  ctx.textBaseline = 'middle';
  if (side) {
    ctx.textAlign = 'right';
    ctx.fillText('SEPT', cx - R - 4, cy);
    ctx.textAlign = 'left';
    ctx.fillText('LAT', cx + R + 4, cy);
  }
  ctx.restore();
  if (bar) {
    // the color scale: -25% at the bottom, +5% at the top
    const lx = P.x + P.w - 30, ly = cy - R, lh = 2 * R, lo = -25, hi = 5;
    for (let i = 0; i < lh; i++) { ctx.fillStyle = rgb(strainColor(hi - ((hi - lo) * i) / lh)); ctx.fillRect(lx, ly + i, 8, 1.2); }
    ctx.save();
    ctx.font = font(9, 400);
    ctx.fillStyle = SC.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const x of [0, -10, -20]) ctx.fillText(x ? neg(x, 0) : '0', lx + 11, ly + ((hi - x) / (hi - lo)) * lh);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('%', lx + 11, ly - 4);
    ctx.restore();
  }
}

/**
 * The arithmetic of global strain: the chosen view's midline at end-diastole (L0) and at aortic
 * valve closure (L), its strain (L − L0) ÷ L0, the three views, and GLS, their mean, with its grade.
 * Lines in blocks; the longest layout that fits the panel wins.
 */
function arithmetic(sh, P, k, v) {
  const ctx = sh.ctx, i = VIEWS.indexOf(k), L0 = v.len0[i].toFixed(2), L1 = v.len1[i].toFixed(2), vs = v.views.map((x) => neg(x));
  panel(ctx, P.x, P.y, P.w, P.h, v.track === 'apical' ? fit(P.w, 'GLS · RELATIVE APICAL LS', 'GLS · APICAL LS') : fit(P.w, 'GLOBAL STRAIN · WHOLE MIDLINE', 'GLOBAL STRAIN'));
  const crit = ['more negative than −18%', '−16% to −18%', 'less negative than −16%'][v.gb];
  // a line: [text, color, weight]; a gap: null
  const A = [[`${VNAME[k]} midline`, t0(), 600], [`L0 = ${L0} cm  end-diastole`, SC.cal], [`L  = ${L1} cm  AVC`, SC.cal], [`(L − L0) ÷ L0 = (${L1} − ${L0}) ÷ ${L0}`, SC.cal], [`= ${vs[i]}%`, '#ffffff', 600]];
  const A2 = [[`${VNAME[k]} midline`, t0(), 600], [`L0 = ${L0} cm · L = ${L1} cm`, SC.cal], [`(L − L0) ÷ L0 = ${vs[i]}%`, '#ffffff', 600]];
  const A1 = [[`${VNAME[k]}: (${L1} − ${L0}) ÷ ${L0} = ${vs[i]}%`, SC.cal]];
  const pad = (s, n) => s.padStart(n);
  const B = [[`      L0 cm   L cm  strain`, SC.dim], ...VIEWS.map((key, j) => [`${key === k ? '›' : ' '}${VNAME[key]} ${pad(v.len0[j].toFixed(2), 6)} ${pad(v.len1[j].toFixed(2), 6)} ${pad(`${vs[j]}%`, 7)}`, key === k ? '#ffffff' : SC.text])];
  const C = [[`GLS = (${vs.join(' ')}) ÷ 3`, SC.cal], [`    = ${neg(v.gls)}%`, '#ffffff', 600], [`${GLS_WORD[v.gb]}: ${crit}`, v.gb ? '#ff8f7a' : SC.dim]];
  const C2 = [[`GLS = mean of 3 = ${neg(v.gls)}%`, '#ffffff', 600], [`${GLS_WORD[v.gb]}: ${crit}`, v.gb ? '#ff8f7a' : SC.dim]];
  const C1 = [[`GLS = mean of 3 views = ${neg(v.gls)}% · ${GLS_WORD[v.gb]}`, '#ffffff', 600]];
  let layouts = [[...A, null, ...B, null, ...C], [...A2, null, ...B, null, ...C2], [...A2, null, ...C2], [...A1, ...C1]];
  if (v.track === 'apical') {
    // the relative apical LS from the bull's-eye's levels, and the cut-off of Phelan 2012
    const [b, m, a] = v.lev.map((x) => Math.abs(x).toFixed(2)), r = fmt(v.relaps, 2), over = v.relaps >= RELAPS_CUT;
    const cut = [over ? '≥1.0: relative apical sparing' : '<1.0: below the cut-off', over ? '#ff8f7a' : SC.dim];
    const D = [['Relative apical LS', t0(), 600], ['apical ÷ (basal + mid)', SC.cal], [`= ${a} ÷ (${b} + ${m})`, SC.cal], [`= ${r}`, '#ffffff', 600], cut];
    const D2 = [['Relative apical LS', t0(), 600], [`${a} ÷ (${b} + ${m}) = ${r}`, '#ffffff', 600], cut];
    const D1 = [[`Apical LS ${a} ÷ (${b} + ${m}) = ${r} · ${over ? '≥1.0' : '<1.0'}`, over ? '#ff8f7a' : '#ffffff', 600]];
    const D0 = [[`Apical LS ${a} ÷ (${b} + ${m}) = ${r}`, '#ffffff', 600]];
    // a low panel (a phone) keeps GLS and the ratio, without the chosen view's arithmetic
    layouts = [[...A2, null, ...C2, null, ...D], [...A2, null, ...C2, null, ...D2], [...A1, ...C1, null, ...D], [...A1, ...C1, null, ...D2], [...A1, ...C1, ...D1], [...C1, ...D1], [...C1, ...D0]];
  }
  const top = P.y + 26, room = P.w - 20;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const height = (lines, px) => lines.reduce((h, l) => h + (l ? px + 5 : 7), 0);
  const fits = (lines, px) => lines.every((l) => { if (!l) return true; ctx.font = font(px, l[2] || 500); return ctx.measureText(l[0]).width <= room; }) && top + height(lines, px) <= P.y + P.h - 6;
  let pick = null;
  for (const lines of layouts) for (const px of [11.5, 11, 10, 9.5]) if (!pick && fits(lines, px)) pick = { lines, px };
  if (!pick) pick = { lines: layouts[layouts.length - 1], px: 9 };
  let y = top;
  for (const l of pick.lines) {
    if (!l) { y += 7; continue; }
    y += pick.px + 5;
    ctx.font = font(pick.px, l[2] || 500);
    ctx.fillStyle = l[1];
    ctx.fillText(l[0], P.x + 10, y - 3);
  }
  ctx.restore();
}
// the chosen view's name on the dark panel
const t0 = () => '#9cc6ff';

/** The result of the follow-up against the baseline (Lyon 2022, Table 3). */
function resultPanel(sh, P, v) {
  const ctx = sh.ctx, b = v.base, c = v.ct;
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'FOLLOW-UP AGAINST BASELINE', 'CHANGE'));
  const head = { none: 'NO CTRCD', mild: 'MILD CTRCD', moderate: 'MODERATE CTRCD', severe: 'SEVERE CTRCD' }[c.g];
  const forms = [
    [`GLS ${neg(b.gls)}% → ${neg(v.gls)}%`, `relative decline ${c.decline}% (ESC: >15%)`, `LVEF ${b.ef}% → ${v.ef}% (${sgn(-c.fall)} points)`, `biomarkers: ${v.bio ? 'new rise' : 'no new rise'}`, `${head} · ESC 2022 Table 3`],
    [`GLS ${neg(b.gls)} → ${neg(v.gls)}%`, `decline ${c.decline}% (ESC >15%)`, `LVEF ${b.ef} → ${v.ef}%`, `biomarkers: ${v.bio ? 'new rise' : 'none'}`, head],
  ];
  const top = P.y + 24;
  ctx.save();
  // the longer form at a smaller size before the shorter one
  const fits = (lines, px, lh) => { ctx.font = font(px); return lines.every((s) => ctx.measureText(s).width <= P.w - 20) && top + lines.length * lh <= P.y + P.h - 4; };
  let pick = null;
  for (const [px, lh] of [[12, 18], [11, 16], [10, 15], [10, 14]]) for (const lines of forms) if (!pick && fits(lines, px, lh)) pick = { lines, px, lh };
  if (!pick) pick = { lines: forms[1], px: 9.5, lh: 13 };
  pick.lines.forEach((s, j) => {
    const last = j === pick.lines.length - 1;
    ctx.font = font(pick.px, last ? 600 : 500);
    ctx.fillStyle = last ? (c.g === 'none' ? '#ffffff' : '#ff8f7a') : j === 1 && c.decline > 15 ? '#ff8f7a' : SC.cal;
    ctx.fillText(s, P.x + 10, top + (j + 1) * pick.lh - 2);
  });
  ctx.restore();
}

/**
 * The grades of asymptomatic CTRCD (Lyon 2022, Table 3) as a map of the follow-up study: the
 * relative decline in GLS across, the LVEF up, the zones for this baseline and for the biomarkers
 * shown; the follow-up's path from the baseline along the slider, and where it is now.
 */
const ZONE = { mild: 'rgba(255,214,90,0.20)', moderate: 'rgba(255,150,80,0.30)', severe: 'rgba(216,65,47,0.45)' };
function ctrcdMap(sh, P, v) {
  const ctx = sh.ctx, b = v.base, small = P.w < 230;
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'LVEF AGAINST THE DECLINE IN GLS', 'CTRCD GRADES'));
  const bx = { x: P.x + 34, y: P.y + 44, w: P.w - 46, h: P.h - 44 - (small ? 22 : 36) };
  if (bx.w < 70 || bx.h < 60) return;
  const D1 = 60, E0 = 20, E1 = Math.max(70, Math.ceil((b.ef + 6) / 10) * 10);
  const X = (d) => bx.x + (d / D1) * bx.w, Y = (ef) => bx.y + ((E1 - ef) / (E1 - E0)) * bx.h;
  const at = (d, ef) => ctrcdGrade(d, b.ef - ef, ef, v.bio).g;
  ctx.save();
  // the zones, a cell for each 1% of decline and each point of LVEF, graded at its middle: the runs
  // of each row, and rows with the same runs as one rectangle
  const runsOf = (ef) => {
    const out = [];
    let d0 = 0, g0 = at(0.5, ef + 0.5);
    for (let d = 1; d <= D1; d++) {
      const g = d < D1 ? at(d + 0.5, ef + 0.5) : null;
      if (g === g0) continue;
      out.push([d0, d, g0]);
      d0 = d; g0 = g;
    }
    return out;
  };
  const rects = [];
  let open = null;
  for (let ef = E0; ef <= E1; ef++) {
    const runs = ef < E1 ? runsOf(ef) : null, key = runs && JSON.stringify(runs);
    if (open && key === open.key) continue;
    if (open) for (const [d0, d1, g] of open.runs) rects.push([d0, d1, open.ef, ef, g]);
    open = runs ? { key, runs, ef } : null;
  }
  for (const [d0, d1, e0, e1, g] of rects) {
    if (!ZONE[g]) continue;
    ctx.fillStyle = ZONE[g];
    ctx.fillRect(X(d0), Y(e1), X(d1) - X(d0), Y(e0) - Y(e1));
  }
  // the thresholds: LVEF 50% and 40%, a relative decline of 15%
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(199,205,208,0.55)';
  ctx.lineWidth = 1;
  for (const ef of [50, 40]) { ctx.beginPath(); ctx.moveTo(bx.x, Y(ef)); ctx.lineTo(bx.x + bx.w, Y(ef)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(X(15), Y(50)); ctx.lineTo(X(15), bx.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = SC.frame;
  ctx.strokeRect(bx.x + 0.5, bx.y + 0.5, bx.w - 1, bx.h - 1);
  // the scales
  ctx.font = font(9.5, 400);
  ctx.fillStyle = SC.dim;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let ef = E0; ef <= E1; ef += 10) ctx.fillText(String(ef), bx.x - 5, Y(ef));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const d of [0, 15, 30, 45, 60]) ctx.fillText(small && d === 60 ? '60%' : String(d), X(d) - (small && d === 60 ? 6 : 0), bx.y + bx.h + 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('LVEF %', P.x + 10, P.y + 34);
  if (!small) { ctx.textAlign = 'center'; ctx.fillText('relative decline in GLS %', bx.x + bx.w / 2, P.y + P.h - 8); }
  // the zones' names, where the zone is
  ctx.font = font(small ? 9.5 : 10.5, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const names = [['none', 7.5, (E1 + 50) / 2], ['mild', (15 + D1) / 2, (E1 + 50) / 2], ['moderate', D1 / 2, 45], ['severe', D1 / 2, (E0 + 40) / 2]];
  for (const [g, d, ef] of names) {
    if (at(d, ef) !== g) continue;
    ctx.fillStyle = g === 'none' ? SC.dim : '#f4f1ec';
    ctx.fillText(g, X(d), Y(ef));
  }
  // the follow-up along the slider, from the baseline to the study shown
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = (st[KEY] * i) / 40, f = study(v.heart, 'onco', u);
    pts.push([X(clamp(ctrcd(b, f, v.bio).decline, 0, D1)), Y(clamp(f.ef, E0, E1))]);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(X(0), Y(b.ef), 4, 0, Math.PI * 2); ctx.stroke();
  const [px, py] = pts[pts.length - 1];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the figure
function drawStrain(sh, t, v, tt) {
  const W = sh.w, H = sh.h, narrow = W < 700, track = trackOf(st), x = st[KEY];
  const w = weightsAt(track, x, TRK.model?.pheno?.a || (heartOf(st) === 'amyloid' ? 1 : 0));
  const wkey = `${track}|${x}|${heartOf(st)}`;
  const k = VIEWS.includes(st[VIEW]) ? st[VIEW] : 'a4c';
  const pad = narrow ? 6 : 14, gap = narrow ? 6 : 12;
  const box = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
  const [top, bottom] = rows(box, narrow ? [1, 1.08] : [1.25, 1], gap);
  const vp = cols(top, [1, 1, 1], gap);
  layout = { views: VIEWS.map((key, i) => ({ key, ...vp[i] })) };
  VIEWS.forEach((key, i) => viewPanel(sh, t, vp[i], key, w, v, reducedMotion ? EV.avc : shownT[key], key === k));
  if (narrow) {
    const [mid, low] = rows(bottom, [1.75, 1], gap);
    const [c1, c2] = cols(mid, [1.15, 1], gap);
    curvesPanel(sh, c1, k, w, wkey, v, tt);
    bullsEye(sh, c2, v.segs, v.gls, 'BULL’S-EYE · 18', { bar: false });
    arithmetic(sh, low, k, v);
    return;
  }
  const [c1, c2, c3] = cols(bottom, [1.35, 1.05, 1], gap);
  curvesPanel(sh, c1, k, w, wkey, v, tt);
  bullsEye(sh, c2, v.segs, v.gls, fit(c2.w, 'BULL’S-EYE · 18 SEGMENTS · %', 'BULL’S-EYE · 18'));
  arithmetic(sh, c3, k, v);
}

function drawOnco(sh, t, v) {
  const W = sh.w, H = sh.h, narrow = W < 700, a = TRK.model?.pheno?.a || (heartOf(st) === 'amyloid' ? 1 : 0);
  const wb = weightsAt('onco', 0, a), wf = weightsAt('onco', st[KEY], a);
  const pad = narrow ? 6 : 14, gap = narrow ? 6 : 12;
  const box = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
  layout = { views: [] };
  const tb = reducedMotion ? EV.avc : shownT.b, tf = reducedMotion ? EV.avc : shownT.f;
  const col = (P, which) => {
    const base = which === 'b', u = base ? v.base : v, [p1, p2] = rows(P, narrow ? [1.25, 1] : [1.35, 1], gap);
    const label = base ? 'BASELINE' : 'FOLLOW-UP';
    viewPanel(sh, t, p1, 'a4c', base ? wb : wf, u, base ? tb : tf, false, base ? MESH_B : MESH_F, fit(p1.w, `${label} · A4C · LVEF ${u.ef}%`, `${label} · LVEF ${u.ef}%`));
    bullsEye(sh, p2, u.segs, u.gls, fit(p2.w, `${label} · GLS ${neg(u.gls)}%`, `GLS ${neg(u.gls)}%`), { bar: !narrow && !base });
  };
  if (narrow) {
    const [up, low] = rows(box, [2.6, 1], gap);
    const [l, r] = cols(up, [1, 1], gap);
    col(l, 'b');
    col(r, 'f');
    resultPanel(sh, low, v);
    return;
  }
  const [l, m, r] = cols(box, [1, 1, 0.84], gap);
  col(l, 'b');
  col(m, 'f');
  const hr = Math.min(170, r.h * 0.4);
  resultPanel(sh, { x: r.x, y: r.y, w: r.w, h: hr }, v);
  ctrcdMap(sh, { x: r.x, y: r.y + hr + gap, w: r.w, h: r.h - hr - gap }, v);
}

function draw(sh, t) {
  const v = shown(st);
  syncTracker();
  const tt = beat.at(true, EV.avc);
  if (v.tab === 'onco') drawOnco(sh, t, v);
  else drawStrain(sh, t, v, tt);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LEAD_STRAIN = {
  normal: 'Normal GLS', 'GLS borderline': 'Borderline GLS', 'GLS abnormal': 'Abnormal GLS with a normal LVEF',
  'LVEF mildly abnormal': 'Abnormal GLS, mildly abnormal LVEF', 'LVEF moderately abnormal': 'Abnormal GLS, moderately abnormal LVEF',
  'LVEF severely abnormal': 'Abnormal GLS, severely abnormal LVEF',
};
const LEAD_ONCO = { none: 'No CTRCD', mild: 'Mild asymptomatic CTRCD', moderate: 'Moderate asymptomatic CTRCD', severe: 'Severe asymptomatic CTRCD' };
const others = (k) => VIEWS.filter((x) => x !== k);
const range = (xs) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? `${sgn(lo)}%` : `${sgn(lo)}% to ${sgn(hi)}%`; };
// a disease heart moves its LV walls by the chapter's model, not by its own disease
const HEART_NAME = { amyloid: 'amyloid', icm: 'ischemic', barlow: 'Barlow', bav: 'bicuspid' };
// the amyloid chapter, named as main.js names a link: "chapter 25", or "bonus chapter B3"
const AMYLOID = () => { const n = numOf('amyloid'); return `<a href="#amyloid" data-go="amyloid">${n.startsWith('B') ? 'bonus chapter' : 'chapter'} ${n}</a>`; };
function heartNote(v) {
  if (!HEART_NAME[v.heart]) return '';
  if (v.heart === 'icm' && v.track === 'regional') return ' The heart shown is the ischemic heart, with its old LAD infarct: at the end of the regional pattern, its LAD territory is akinetic and the other segments are hypokinetic, as in its own disease.';
  if (v.heart === 'amyloid' && v.track === 'apical') return ' The heart shown is the amyloid heart: the figure moves its LV walls by the chapter\'s model of strain, here in the apical-sparing pattern of its own disease.';
  const own = v.heart === 'amyloid' && v.tab !== 'onco' ? ` Its own pattern, relative apical sparing, shows under Apical sparing, and its diagnosis is in ${AMYLOID()}.` : '';
  // a heart whose apex reads clearly less than the normal heart's at normal function: the ratio rises less
  let apex = '';
  if (v.track === 'apical') {
    const a0 = study(v.heart, 'apical', 0).lev[2], n0 = study('normal', 'apical', 0).lev[2];
    if (a0 - n0 > 3) apex = ` On this heart the apical segments average ${neg(a0)}% at normal function, against ${neg(n0)}% on the normal heart, so the relative apical LS rises less.`;
  }
  return ` The heart shown is the ${HEART_NAME[v.heart]} heart: the figure moves its LV walls by the chapter's model of strain, not by its own disease.${own}${apex}`;
}

/** A lead in the middle of a sentence: its first letter in lower case. */
const lower = (s) => `${s[0].toLowerCase()}${s.slice(1)}`;

function liveStrain(v, s, cite) {
  const T = cite('thomas2025'), L = cite('lang2015'), V = cite('voigt2015');
  const k = VIEWS.includes(s[VIEW]) ? s[VIEW] : 'a4c', i = VIEWS.indexOf(k), [o1, o2] = others(k);
  const regional = v.track === 'regional', apical = v.track === 'apical';
  const lad = [], rest = [];
  VIEWS.forEach((key, vi) => { for (let j = 0; j < 6; j++) { const g = segOf(key, j); (isLad(g.wall, g.level) ? lad : rest).push(v.segs[vi * 6 + j]); } });
  const ladLow = regional && Math.max(...lad) > Math.min(...rest) + 6;
  const spared = apical && v.relaps >= RELAPS_CUT;
  const lead = ladLow ? `Reduced strain in the LAD territory; ${lower(LEAD_STRAIN[v.grade])}` : spared ? `Relative apical sparing, ${lower(LEAD_STRAIN[v.grade])}` : LEAD_STRAIN[v.grade];
  const s0 = ` The midline of the ${VLONG[k]} view measures ${v.len0[i].toFixed(2)} cm at end-diastole and ${v.len1[i].toFixed(2)} cm at end-systole, a global strain of ${neg(v.views[i])}% for that view${V}.`;
  const s1 = ` The ${VLONG[o1]} and ${VLONG[o2]} views give ${neg(v.views[VIEWS.indexOf(o1)])}% and ${neg(v.views[VIEWS.indexOf(o2)])}%, and GLS, the mean of the three, is ${neg(v.gls)}%: ${GLS_WORD[v.gb]}${v.gb === 0 ? ', more negative than −18%' : v.gb === 1 ? ', from −16% to −18%' : ', less negative than −16%'}${T}.`;
  let s2 = ladLow
    ? ` The seven segments of the LAD territory read ${range(lad)}, and the other eleven ${range(rest)}.`
    : ` The 18 segments read ${range(v.segs)}.`;
  if (apical) {
    // the relative apical LS from the levels as the bull's-eye prints them (Phelan 2012)
    const [b, m, a] = v.lev, P = cite('phelan2012');
    s2 = ` The six basal segments average ${neg(b, 2)}%, the six mid segments ${neg(m, 2)}% and the six apical segments ${neg(a, 2)}%.`
      + ` The relative apical LS, apical ÷ (basal + mid) without the signs, is ${Math.abs(a).toFixed(2)} ÷ (${Math.abs(b).toFixed(2)} + ${Math.abs(m).toFixed(2)}) = ${fmt(v.relaps, 2)}, ${spared ? 'at or above' : 'below'} the cut-off of 1.0${P}.`
      + (spared ? ` In the original study, a value of 1.0 or more distinguished cardiac amyloidosis from hypertrophic cardiomyopathy and aortic stenosis${P}.` : '');
  }
  const s3 = ` The LVEF by the biplane method is ${v.ef}%, ${efWord(v.ef)} for a woman (${v.ef > 74 ? 'above 74%' : EF_RANGE[v.eb]})${L}.`;
  const early = !apical && v.gb > 0 && v.eb === 0 ? ` GLS can fall while the LVEF stays normal, as it does early in cancer therapy${T}.` : '';
  // the diagnosis, and the caveat that the amyloid chapter states
  const amy = spared ? ` The diagnosis of cardiac amyloidosis is in ${AMYLOID()}. Apical sparing also occurs without amyloidosis: a multicenter study found it in 32% of patients in whom amyloidosis was suspected and then excluded, and in 6% of healthy individuals${cite('cotella2024')}.` : '';
  const pos = Math.max(...(regional ? lad : apical ? v.segs : [-1])) > 0 ? ' A segment with positive strain lengthens in systole.' : '';
  const note = heartNote(v);
  // the apical-sparing pattern: the LVEF before the levels, so that the levels, the ratio, the study
  // and the diagnosis read in order
  return apical ? `<b>${lead}.</b>${s0}${s1}${s3}${s2}${amy}${pos}${note}` : `<b>${lead}.</b>${s0}${s1}${s2}${s3}${early}${amy}${pos}${note}`;
}

function liveOnco(v, s, cite) {
  const Ly = cite('lyon2022'), P = cite('plana2014'), T = cite('thomas2025');
  const b = v.base, c = v.ct;
  const s0 = ` GLS is ${neg(b.gls)}% at baseline and ${neg(v.gls)}% at follow-up, a relative decline of ${c.decline}%; the LVEF is ${b.ef}% and ${v.ef}%${c.fall ? `, ${Math.abs(c.fall)} point${Math.abs(c.fall) === 1 ? '' : 's'} ${c.fall > 0 ? 'lower' : 'higher'}` : ''}.`;
  let s1;
  if (c.g === 'severe') s1 = ` A new fall of the LVEF to below 40% is severe asymptomatic CTRCD${Ly}.`;
  else if (c.g === 'moderate') s1 = c.why === 'fall'
    ? ` A new fall of the LVEF by 10 points or more, to 40–49%, is moderate asymptomatic CTRCD${Ly}.`
    : ` A new fall of the LVEF by less than 10 points to 40–49%, with a relative decline in GLS of more than 15% or a new rise in cardiac biomarkers, is moderate asymptomatic CTRCD${Ly}.`;
  else if (c.g === 'mild') s1 = ` With an LVEF of 50% or more, ${c.why === 'gls' ? 'a new relative decline in GLS of more than 15%' : c.why === 'bio' ? 'a new rise in cardiac biomarkers' : 'a new relative decline in GLS of more than 15% and a new rise in cardiac biomarkers'} is mild asymptomatic CTRCD${Ly}.`;
  else if (v.ef >= 50 || c.fall <= 0) s1 = ` The LVEF is ${v.ef >= 50 ? '50% or more' : 'not below its baseline'}, GLS has not fallen by more than 15%, and the cardiac biomarkers show no new rise: no CTRCD by the ESC definitions${Ly}.`;
  else s1 = ` The LVEF fell by less than 10 points, to 40–49%, with no relative decline in GLS of more than 15% and no new rise in cardiac biomarkers: no grade of the ESC definitions applies${Ly}.`;
  let s2 = '';
  if (c.decline > 15) s2 = ` A relative decline of more than 15% is very likely abnormal; a repeat study 2 to 3 weeks later, on the same vendor's machine, should confirm it${P}.`;
  else if (c.decline >= 10) s2 = ` On serial studies a relative change of 10% to 15% is likely to be significant${T}; the ESC threshold of 15% gives a higher specificity${Ly}.`;
  else if (c.decline >= 8) s2 = ` A relative decline of 8% to 15% lies between a change that appears not to be meaningful, below 8%, and one that is very likely abnormal, above 15%${P}.`;
  else if (c.decline > 0) s2 = ` A relative decline of less than 8% from baseline appears not to be meaningful${P}.`;
  const bio = v.bio ? ` A new rise in cardiac biomarkers is a troponin I or T above the 99th percentile, a BNP of 35 pg/mL or more, an NT-proBNP of 125 pg/mL or more, or a new significant rise from baseline${Ly}.` : '';
  const note = heartNote(v);
  return `<b>${LEAD_ONCO[c.g]}.</b>${s0}${s1}${s2}${bio}${note}`;
}

/** The two guideline tables of the strain tab, and the CTRCD table of the cardio-oncology tab, with the current column marked. */
function tables(art, v) {
  const t1 = art.querySelector('#strain-table'), t2 = art.querySelector('#strain-table2');
  if (!t1 || !t2) return;
  if (v.tab === 'onco') {
    const c = { mild: 0, moderate: 1, severe: 2 }[v.ct.g] ?? -1;
    gradeTable(t1, [['Asymptomatic CTRCD', ['LVEF ≥50% and a new relative decline in GLS >15% and/or a new rise in cardiac biomarkers', 'A new LVEF fall ≥10 points to 40–49%; or <10 points to 40–49% with a new GLS decline >15% or a new biomarker rise', 'A new LVEF fall to <40%'], c]], 'Cancer therapy-related cardiac dysfunction (ESC 2022, Table 3)', ['Mild', 'Moderate', 'Severe']);
    t2.closest('.table-wrap').hidden = true;
    return;
  }
  t2.closest('.table-wrap').hidden = false;
  gradeTable(t1, [['Global longitudinal strain', ['More negative than −18%', '−16% to −18%', 'Less negative than −16%'], v.gb]], 'GLS (ASE/EACVI 2025)', ['Normal', 'Borderline', 'Abnormal']);
  gradeTable(t2, [['LVEF, women', ['54–74%', '41–53%', '30–40%', '<30%'], v.eb]], 'LVEF by the biplane method (ASE/EACVI 2015)', ['Normal', 'Mildly abnormal', 'Moderately abnormal', 'Severely abnormal']);
}

// ---------------------------------------------------------------- the chapter
let BANDS = [], painted = '';
const LEVEL = { normal: 0, 'GLS borderline': 1, 'GLS abnormal': 2, 'LVEF mildly abnormal': 3, 'LVEF moderately abnormal': 4, 'LVEF severely abnormal': 5, 'no CTRCD': 0, 'mild CTRCD': 2, 'moderate CTRCD': 4, 'severe CTRCD': 5 };
const SHORT = { normal: 'normal', 'GLS borderline': 'border.', 'GLS abnormal': 'GLS abn.', 'LVEF mildly abnormal': 'LVEF mild', 'LVEF moderately abnormal': 'mod.', 'LVEF severely abnormal': 'sev.', 'no CTRCD': 'none', 'mild CTRCD': 'mild', 'moderate CTRCD': 'mod.', 'severe CTRCD': 'severe' };
const LABEL = { 'GLS borderline': 'borderline', 'GLS abnormal': 'GLS abnormal', 'LVEF mildly abnormal': 'LVEF mild', 'LVEF moderately abnormal': 'LVEF moderate', 'LVEF severely abnormal': 'LVEF severe' };
function paint(s) {
  const key = `${heartOf(s)}|${trackOf(s)}|${bioOf(s)}`;
  if (key === painted) return;
  painted = key;
  BANDS = bands((x) => gradeAt(x, s), 200).map((b) => ({ ...b, g: b.g }));
  paintBands(document.getElementById('strain-grades'), BANDS.map((b) => ({ ...b, g: LABEL[b.g] || b.g })), Object.fromEntries(Object.entries(LEVEL).map(([g, l]) => [LABEL[g] || g, l])), Object.fromEntries(Object.entries(SHORT).map(([g, l]) => [LABEL[g] || g, l])));
}

/** The view under a pointer event on the figure, or null. */
function viewAt(e) {
  if (!layout || !sheet) return null;
  const r = sheet.canvas.getBoundingClientRect(), z = sheet.z || 1;
  const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z;
  return layout.views.find((P) => x >= P.x && x <= P.x + P.w && y >= P.y && y <= P.y + P.h)?.key ?? null;
}

const strainPage = {
  key: 'strain',
  part: 'function',
  title: 'Strain',
  nav: 'Strain',
  dwell: 33,
  defaults: { strS: 0.35, strTab: 'strain', strPat: 'global', strBio: false, strView: 'a4c' },
  format: {
    strS: (x, s) => { if (!s) return ''; const g = gradeAt(x, s); return LABEL[g] || g; },
  },
  watch: [KEY, TAB, PAT, BIO, VIEW, 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    const cv = sheet.canvas;
    cv.addEventListener('click', (e) => { const k = viewAt(e); if (k && k !== st[VIEW]) setState({ [VIEW]: k, playing: false, anim: false }); });
    cv.addEventListener('pointermove', (e) => { const k = e.pointerType === 'mouse' ? viewAt(e) : null; cv.style.cursor = k && k !== st[VIEW] ? 'pointer' : ''; });
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    paint(state);
    subscribe?.((s, ch) => { if ('pheno' in ch || TAB in ch || PAT in ch || BIO in ch) paint(s); });
  },
  onState(s, ch) { if (TAB in ch) for (const p of panelsOf(tabOf(s))) p.start(); },
  // the heart model, the targets and the tracking load at idle (main.js warms every chapter)
  // both tabs' panels, so that a switch of the tab (in the tour, in a video) finds them ready
  enter() { for (const p of [...panelsOf(tabOf(st)), ...panelsOf(tabOf(st) === 'onco' ? 'strain' : 'onco')]) p.start(); startTracker(); },
  warm() { for (const p of [...panelsOf('strain'), ...panelsOf('onco')]) p.start(); startTracker(); },
  // the tour and a video wait for the region of interest of the heart shown
  ready() { if (TRK.state === 'idle') startTracker(); syncTracker(); return TRK.state === 'failed' || trackReady(); },
  pulse: () => beat.pulse(),
  key_(key, set) { const k = { 4: 'a4c', 2: 'a2c', 3: 'a3c' }[key]; if (k && tabOf(st) === 'strain') set({ [VIEW]: k }); },
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, true)) {
      // the views take turns to move on: one mesh frame is cut a frame
      const order = tabOf(s) === 'onco' ? ['b', 'f'] : VIEWS;
      for (const k of order) if (!(k in shownT)) shownT[k] = 0;
      const k = order[turn++ % order.length];
      shownT[k] = beat.t;
      if (sheet) sheet.dirty = true;
    }
  },
  // the sequence: the global pattern from normal to severe dysfunction (four-chamber view); the
  // regional pattern (two-chamber view, the anterior wall); apical sparing (four-chamber view);
  // then cardio-oncology to severe CTRCD
  tourEnter(set) { set({ strTab: 'strain', strPat: 'global', strS: 0, strView: 'a4c', strBio: false }); },
  tourTick(tt, set) {
    if (tt < 10) set({ strTab: 'strain', strPat: 'global', strView: 'a4c', strS: Math.round(clamp((tt - 1) / 8, 0, 1) * 200) / 200 });
    else if (tt < 17) set({ strTab: 'strain', strPat: 'regional', strView: 'a2c', strS: Math.round(clamp((tt - 10) / 6.5, 0, 1) * 200) / 200 });
    else if (tt < 24) set({ strTab: 'strain', strPat: 'apical', strView: 'a4c', strS: Math.round(clamp((tt - 17) / 6.5, 0, 1) * 200) / 200 });
    else set({ strTab: 'onco', strBio: false, strS: Math.round(clamp((tt - 24) / 8, 0, 1) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    if (tabOf(s) === 'onco') return 24 + s.strS * 8;
    if (s.strPat === 'regional') return 10 + s.strS * 6.5;
    if (s.strPat === 'apical') return 17 + s.strS * 6.5;
    return 1 + s.strS * 8;
  },
  text(s, { cite }) {
    const v = shown(s);
    const readouts = v.tab === 'onco'
      ? [
        { k: 'GLS, baseline → follow-up', v: `${neg(v.base.gls)} → ${neg(v.gls)}`, u: '%', text: true, flag: v.ct.decline > 15 },
        { k: 'Relative decline in GLS', v: fmt(v.ct.decline), u: '%', flag: v.ct.decline > 15 },
        { k: 'LVEF, baseline → follow-up', v: `${v.base.ef} → ${v.ef}`, u: '%', text: true, flag: v.ef < 50 },
        { k: 'Cardiac biomarkers', v: v.bio ? 'new rise' : 'no new rise', text: true, flag: v.bio },
        { k: 'Result', v: CT_NAME[v.ct.g], text: true, flag: v.ct.g !== 'none' },
      ]
      : [
        { k: 'GLS', v: neg(v.gls), u: '%', flag: v.gb > 0 },
        { k: 'A4C · A2C · A3C', v: v.views.map((x) => neg(x)).join(' · '), u: '%', text: true },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.eb > 0 },
        ...(v.track === 'apical' ? [{ k: 'Relative apical LS', v: fmt(v.relaps, 2), flag: v.relaps >= RELAPS_CUT }] : []),
      ];
    return {
      readouts,
      live: v.tab === 'onco' ? liveOnco(v, s, cite) : liveStrain(v, s, cite),
      extra: (art) => {
        tables(art, v);
        const pat = art.querySelector('#str-pat-ctl'), bio = art.querySelector('#str-bio-ctl');
        if (pat) pat.hidden = v.tab === 'onco';
        if (bio) bio.hidden = v.tab !== 'onco';
        // the slider's label: main.js writes it when strS changes, and a switch changes it alone
        const o = document.querySelector('output[data-for="strS"]'), lab = strainPage.format.strS(s[KEY], s);
        if (o && o.textContent !== lab) o.textContent = lab;
      },
    };
  },
};
export default strainPage;
