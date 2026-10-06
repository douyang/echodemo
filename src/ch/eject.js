// Systolic function. LV volumes by the biplane method of disks in the apical four- and
// two-chamber views: each echo view with its traced border and disks, above the disk model of the
// same LV, and what foreshortening does to them. The RV side (three measures of RV systolic
// function: TAPSE, tissue Doppler S′, fractional area change) is hidden: rv.js shows
// the RV; the code stays and comes back with SHOW_RV.
// The text holds the measurements as a diagram, with ▲▼ buttons on the traced volumes (LV) and
// on TAPSE, S′ and the RV areas (RV), and a switch for the sex: the stroke volume, the LVEF and
// the volume indexes in the bands of Lang 2015 for that sex, the heart failure category
// (Heidenreich 2022), and the RV bands of Mukherjee 2025 Table 1. As in 07, a button moves the
// chapter's own values, so the sliders follow it: the EDV and ESV buttons set the true EDV and
// the EF (an EDV button holds the ESV, the EDV slider holds the EF), and the RV area buttons set
// the RV end-diastolic area and the FAC (an area button holds the other area, the FAC slider holds
// the end-diastolic area).
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, caliper, tagBox } from '../scope.js';
import { cycleAt, RR, EV } from '../cyclemodel.js';
import { lvefBand, hfCategory, tapseGrade, sPrimeGrade, facGrade, langGrade, LANG, LVEF_RANGE, RV_BANDS } from '../norms.js';
import { phase, measures } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { meshTrace } from '../meshtrace.js';
import { lvWeights, foreOffset } from '../meshcal.js';
import { cine, fit } from '../sev.js';
import { round, stepOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { presetsFor } from '../pheno.js';
import { BSA } from './pressure.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-eject .live', btn, fn);

// The RV side, hidden: rv.js shows the RV. With true, the Ventricle switch in index.html
// (hidden there) shows it again.
const SHOW_RV = false;
/** The side shown: the LV, or the RV when SHOW_RV allows it. */
const sideOf = (s) => (SHOW_RV && s.side === 'rv' ? 'rv' : 'lv');

const DISKS = 20;               // the method of disks (modified Simpson's rule)
const EF_MIN = 10, EF_MAX = 80; // %, the ejection fraction slider
const FAC_MIN = 10, FAC_MAX = 60; // %, the FAC slider
const RV_EDA = 20;              // cm², the RV end-diastolic area at the start (Mukherjee 2025 Table 1: normal <25)

/** Wall thickness (cm) at end-systole: the muscle keeps its volume, as a shell round a sphere of the cavity's volume. */
function wallEs(edv, esv, w) {
  const r = (v) => Math.cbrt((3 * v) / (4 * Math.PI));
  return Math.cbrt(r(esv) ** 3 + (r(edv) + w) ** 3 - r(edv) ** 3) - r(esv);
}

/** The model LV: its true volumes, its wall at end-diastole and end-systole (cm), and what the trace measures. */
export function lvState(s) {
  const edv = s.edv, esv = s.edv * (1 - s.ef / 100);
  const wall = [s.wall / 10, wallEs(edv, esv, s.wall / 10)];
  const f = s.fore / 100;
  // A foreshortened view misses the true apex: the traced length, and with it each disk
  // volume, falls by the same fraction at end-diastole and end-systole.
  const EDm = edv * (1 - f), ESm = esv * (1 - f);
  return { edv, esv, wall, EDm, ESm, svm: EDm - ESm, ef: (EDm - ESm) / EDm, f };
}

// ---------------------------------------------------------------- the values on screen
const BSA2 = round(BSA, 2);   // m², as printed
const SEXES = ['M', 'F'];
const sexOf = (s) => (s.ejSex === 'F' ? 'F' : 'M');
/** The level of each band word: the chips run from above (or below) the normal range to severe. */
const EF_LEVEL = { hyperdynamic: 0, normal: 1, 'mildly abnormal': 2, 'moderately abnormal': 3, 'severely abnormal': 4 };
const VOL_LEVEL = { below: 0, normal: 1, mildly: 2, moderately: 3, severely: 4 };
const RV_LEVEL = { normal: 1, 'mildly reduced': 2, 'moderately reduced': 3, 'severely reduced': 4 };

/**
 * The LV values on screen: the traced volumes as printed, and the stroke volume, LVEF and indexes
 * calculated from them, graded for the sex shown (Lang 2015) and by the heart failure categories.
 */
function lvShown(s) {
  const L = lvState(s);
  const v = { L, f: L.f, sex: sexOf(s), edvm: round(L.EDm, 0), esvm: round(L.ESm, 0), bsa: BSA2 };
  v.sv = v.edvm - v.esvm;
  v.ef = round((100 * v.sv) / v.edvm, 0);
  v.edvi = round(v.edvm / v.bsa, 0);
  v.esvi = round(v.esvm / v.bsa, 0);
  v.band = lvefBand(v.ef, v.sex);
  v.hf = hfCategory(v.ef);
  v.g = { ef: EF_LEVEL[v.band], edvi: VOL_LEVEL[langGrade('edvi', v.edvi, v.sex)], esvi: VOL_LEVEL[langGrade('esvi', v.esvi, v.sex)] };
  return v;
}

/** The RV values on screen: TAPSE, S′ and the two areas as printed, and the FAC from the areas. */
function rvShown(s) {
  const v = { tapse: round(s.tapse, 1), sPrime: round(s.sPrime, 1), eda: round(s.rvEda ?? RV_EDA, 1) };
  v.esa = round((s.rvEda ?? RV_EDA) * (1 - s.fac / 100), 1);
  v.fac = round((100 * (v.eda - v.esa)) / v.eda, 0);
  v.gr = { tapse: tapseGrade(v.tapse), sPrime: sPrimeGrade(v.sPrime), fac: facGrade(v.fac) };
  v.g = { tapse: RV_LEVEL[v.gr.tapse], sPrime: RV_LEVEL[v.gr.sPrime], fac: RV_LEVEL[v.gr.fac] };
  v.low = ['tapse', 'sPrime', 'fac'].filter((k) => v.g[k] > 1);
  v.out = !v.low.length ? 'normal' : v.low.length === 3 ? 'reduced' : 'mixed';
  return v;
}

// ---------------------------------------------------------------- the figure
/** The shape at contraction c (0 end-diastole .. 1 end-systole), as the echo views interpolate it. */

let sheet = null, st = null, setState = null, clock = 0;

/** The frame shown: the running beat (cine) or a fixed end-diastolic or end-systolic frame. */
function frameNow() {
  if (st.frame8 === 'ed') return { t: 0, ph: { c: 0, mvShut: 1, tvShut: 1, avOpen: 0 } };
  if (st.frame8 === 'es') return { t: EV.avc, ph: { c: 1, mvShut: 1, tvShut: 1, avOpen: 0 } };
  const t = (clock * 1000) % RR;
  return { t, ph: phase(t) };
}

// The four- and two-chamber views cut from the heart mesh (meshpanel.js): the heart the page
// shows, its LV sized, walled and contracting to the volumes, the wall and the EF on the sliders
// (meshcal.js lvWeights), and foreshortened by a probe off the plane (meshcal.js foreOffset).
const redraw = () => { if (sheet) sheet.dirty = true; };
const ECHO = {
  a4c: new MeshPanel('a4c', { diseases: ['lvSize', 'lvWall'], lv: true, redraw }),
  a2c: new MeshPanel('a2c', { diseases: ['lvSize', 'lvWall'], lv: true, redraw }),
};
// the largest LV on the page (320 mL) sets the scale of the disk drawings: traced length and width (cm)
const BIG_L = 11.4, BIG_D = 7.2;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

/** The traced LV (meshtrace.js) of a mesh view after its frame, at systole s. */
function traceOf(panel, s) {
  const ev = panel.ev;
  if (!ev || !ev.last || !ev.g) return null;
  const q = ev.toPlane(ev.anchors(s).apex, ev.g);
  return meshTrace(ev, [q[0], q[1]], DISKS);
}

/** The traced border, its long axis and disks on an echo view, and the length in the corner. */
function traceOn(ctx, F, T) {
  const P = F.P;
  const path = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); if (close) ctx.closePath(); ctx.stroke(); };
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (const dsk of T.disks) path(dsk);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1.4;
  path(T.border, true);     // closed by the straight line across the annulus
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  path([T.M, T.A]);
  ctx.restore();
  measures(ctx, F, [`L ${T.L.toFixed(1)} cm`]);
}

/**
 * The disk model of one view: the LV traced on the echo view above, turned apex up and drawn at
 * one scale for every volume, with its wall (the slider's, at contraction c), the disks and the
 * long axis; and when the view is foreshortened, the true LV's length, which the trace misses.
 */
function drawLV(sh, t, box, L, which, label, T, c) {
  const ctx = sh.ctx;
  const { x, y, w, h } = box;
  const small = w < 250;
  sh.text(label, x + 4, y + 18, { size: small ? 16 : 19 });
  if (!T) return;
  const s1 = Math.min(w / (BIG_D + 3), (h - 12) / (BIG_L + 1.8));
  const Lf = T.L, Ltrue = Lf / (1 - L.f);
  const cx = x + w / 2, top = y + 6 + 1.8 * s1, base = top + Ltrue * s1;
  // the trace's own frame: u from the middle of the annulus line to the apex, q across it
  const u = [(T.A[0] - T.M[0]) / Lf, (T.A[1] - T.M[1]) / Lf], q = [-u[1], u[0]];
  const at = (p, k = 1) => { const d = sub(p, T.M); return [cx + dot(d, q) * s1, base - dot(d, u) * k * s1]; };
  const wall = mix(L.wall[0], L.wall[1], c);
  // the wall: the border pushed out by its thickness, square to it (the border is convex)
  const B = T.border.slice(0, -1), n = B.length;
  const outer = B.map((p, i) => {
    const a = B[(i + n - 1) % n], b = B[(i + 1) % n], e = sub(b, a), l = Math.hypot(e[0], e[1]) || 1;
    let nx = e[1] / l, ny = -e[0] / l;
    const C = B.reduce((acc, r) => [acc[0] + r[0] / n, acc[1] + r[1] / n], [0, 0]);
    if (nx * (p[0] - C[0]) + ny * (p[1] - C[1]) < 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * wall, p[1] + ny * wall];
  });
  const myo = new Path2D();
  outer.forEach((p, i) => { const [px, py] = at(p); i ? myo.lineTo(px, py) : myo.moveTo(px, py); });
  myo.closePath();
  B.forEach((p, i) => { const [px, py] = at(p); i ? myo.lineTo(px, py) : myo.moveTo(px, py); });
  myo.closePath();
  ctx.save();
  ctx.clip(myo, 'evenodd');
  sh.hatch(new Path2D(`M0 0H${sh.w}V${sh.h}H0Z`), 0.6, 4.2, t.ink2, 0.8, which === 'a2c' ? 71 : 70, 0.55);
  ctx.restore();
  sh.poly(T.border.map((p) => at(p)), { width: 1.6, rough: 0.5, seed: which === 'a2c' ? 72 : 73, stroke: t.ink });
  // disks
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  for (const [a, b] of T.disks) {
    const [ax, ay] = at(a), [bx, by] = at(b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
  // long axis
  const [mx, my] = at(T.M), [axp, ayp] = at(T.A);
  sh.line(mx, my, axp, ayp, { width: 1, rough: 0.2, seed: 74, stroke: t.flag, dash: [4, 3] });
  // the length beside the drawing, clear of the wall and inside the column
  const lab = `L ${Lf.toFixed(1)} cm`, size = small ? 10 : 11;
  const right = Math.max(...outer.map((p) => at(p)[0]));
  ctx.save();
  ctx.font = `500 ${size}px ${MONO}`;
  const xr = Math.min(right + 6, x + w - ctx.measureText(lab).width - 2);
  ctx.restore();
  sh.text(lab, xr, base - Lf * s1 * 0.6, { family: MONO, weight: 500, size, color: t.flag });
  // the true LV, its apex beyond the traced one, when foreshortened: the trace drawn to the true length
  if (L.f > 0.02) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = t.ink3;
    ctx.beginPath();
    B.forEach((p, i) => { const [px, py] = at(p, 1 / (1 - L.f)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    sh.text('true apex', cx + 10, top + 4, { size: small ? 13 : 15, color: t.ink3 });
  }
  // the mitral annulus line
  const [h1x, h1y] = at(T.hinges[0]), [h2x, h2y] = at(T.hinges[1]);
  sh.line(h1x - 4 * Math.sign(h2x - h1x), h1y, h2x + 4 * Math.sign(h2x - h1x), h2y, { width: 2, rough: 0.3, seed: 75 });
}

function drawRV(sh, t, W, H, narrow) {
  const ctx = sh.ctx;
  const v = rvShown(st);
  const gap = 14;
  const bw = narrow ? W - 24 : (W - 48 - gap * 2) / 3;
  const bh = narrow ? (H - 40) / 3 - 10 : H * 0.55;
  const pos = (i) => (narrow ? { x: 12, y: 16 + i * (bh + 12) } : { x: 24 + i * (bw + gap), y: 70 });
  // TAPSE: M-mode of the lateral tricuspid annulus
  {
    const { x, y } = pos(0);
    panel(ctx, x, y, bw, bh, 'M-MODE · TAPSE');
    const bx = { x: x + 8, y: y + 26, w: bw - 16, h: bh - 34 };
    const pxmm = Math.min(bx.h / 40, 4);
    // End-diastole sits low. In systole the annulus moves toward the apex, which is toward the
    // probe, so the trace rises.
    const y0 = bx.y + bx.h * 0.75;
    ctx.save();
    // tissue texture bands
    ctx.fillStyle = '#2a3034';
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.strokeStyle = '#d9dfe2';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const tt = (u * 2.2 * RR) % RR;
      const c = cycleAt(tt);
      const yy = y0 - c.s * v.tapse * pxmm;
      const xx = bx.x + u * bx.w;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    // caliper from end-diastole to peak systole in the first beat
    const xb = bx.x + (EV_ES / (2.2 * RR)) * bx.w;
    caliper(ctx, xb, y0, xb, y0 - v.tapse * pxmm, { solid: true });
    ctx.restore();
    // on a dark box, as on the scanner: the trace runs behind it
    tagBox(ctx, xb + 6, y0 - v.tapse * pxmm / 2, [`${v.tapse.toFixed(1)} mm`], { size: 11 });
  }
  // tissue Doppler S′
  {
    const { x, y } = pos(1);
    panel(ctx, x, y, bw, bh, 'PW TISSUE DOPPLER · TV ANNULUS');
    const bx = { x: x + 4, y: y + 24, w: bw - 32, h: bh - 28 };
    const sP = v.sPrime / 100, eP = 0.14, aP = 0.12;
    const fn = (u) => {
      const tt = (u * 2 * RR) % RR;
      if (tt > 70 && tt < 330) return sP * Math.sin(Math.PI * (tt - 70) / 260) ** 0.9;
      if (tt > 470 && tt < 600) return -eP * Math.sin(Math.PI * (tt - 470) / 130);
      if (tt > 770 && tt < 857) return -aP * Math.sin(Math.PI * (tt - 770) / 87);
      return 0;
    };
    spectral(ctx, bx, { fn, scale: 0.2, base: 0.5, mode: 'pw', broad: 0.25, key: `sprime|${v.sPrime}`, seed: 8 });
    vscale(ctx, bx, 0.2, 0.5, 0.1, 'cm/s', { cm: true });
    const k = (bx.h * 0.5) / 0.2, yb = bx.y + bx.h * 0.5;
    const xs = bx.x + (200 / (2 * RR)) * bx.w;
    caliper(ctx, xs - 16, yb - sP * k, xs + 16, yb - sP * k, { solid: true });
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(`S′ ${v.sPrime.toFixed(1)} cm/s`, xs + 23, yb - sP * k + 4);
    ctx.fillText('e′', bx.x + (535 / (2 * RR)) * bx.w - 4, yb + eP * k + 14);
    ctx.fillText('a′', bx.x + (815 / (2 * RR)) * bx.w - 4, yb + aP * k + 14);
    ctx.restore();
  }
  // FAC: the RV area at end-diastole and end-systole, each outline to the scale of its area
  {
    const { x, y } = pos(2);
    sh.rect(x, y, bw, bh, { width: 1, rough: 0.4, seed: 90, stroke: t.rule });
    sh.text('fractional area change', x + 8, y + 22, { size: 18 });
    const cx = x + bw * 0.4, cy = y + bh * 0.6, sc = Math.min(bw, bh) / 7.2;
    // crescent-like RV in the four-chamber view: apex up, tricuspid annulus at the bottom. Area
    // A (cm²) against 20 cm²: the free wall moves in more than the length shortens.
    const rvPath = (A) => {
      const k = A / RV_EDA, kw = k ** 0.6, kh = k ** 0.4;
      const p = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * (i / 40);
        p.push([cx - Math.cos(a) * 1.4 * sc * kw, cy + 1.6 * sc - Math.sin(a) * 3.8 * sc * kh]);
      }
      return { p, half: 1.4 * sc * kw, top: cy + 1.6 * sc - 3.8 * sc * kh };
    };
    const ed = rvPath(v.eda), es = rvPath(v.esa);
    sh.poly(ed.p, { width: 1.6, rough: 0.5, seed: 91, stroke: t.ink });
    sh.poly(es.p, { width: 1.6, rough: 0.5, seed: 92, stroke: t.flag, fill: t.flag2, fillStyle: 'hachure', gap: 5 });
    // right of both outlines; the color ties each name to its shape
    const lx = Math.min(cx + ed.half + 0.25 * sc, x + bw - 92);
    sh.text(`ED ${v.eda.toFixed(1)} cm²`, lx, Math.max(ed.top + 0.6 * sc, y + 44), { family: MONO, weight: 500, size: 11, color: t.ink });
    sh.text(`ES ${v.esa.toFixed(1)} cm²`, lx, cy + 0.4 * sc, { family: MONO, weight: 500, size: 11, color: t.flag });
    sh.text(fit(bw - 16, `FAC = (EDA − ESA) / EDA = ${v.fac}%`, `FAC ${v.fac}%`), x + 8, y + bh - 10, { family: MONO, weight: 500, size: 11, color: t.ink2 });
  }
  if (!narrow) sh.text('Right ventricle, apical four-chamber, RV focused', 24, 44, { size: 22 });
}

const EV_ES = EV.avc;   // end-systole: aortic valve closure

function draw(sh, t) {
  const W = sh.w, H = sh.h;
  const narrow = W < 700;
  if (sideOf(st) === 'rv') { cine.live = false; drawRV(sh, t, W, H, narrow); return; }
  const v = lvShown(st), L = v.L;
  const { t: tt, ph } = frameNow();
  cine.live = st.frame8 === 'cine' && !reducedMotion;
  // one column per view: the echo view above, the disk model of the same LV below
  const pad = narrow ? 6 : 16, gap = narrow ? 8 : 20, textH = narrow ? 36 : 68;
  const rows = H - pad - textH;
  const eh = Math.round(rows * (narrow ? 0.6 : 0.57)), dh = rows - eh - (narrow ? 4 : 10);
  const colW = Math.min((W - 2 * pad - gap) / 2, eh * 1.35);
  const x0 = (W - 2 * colW - gap) / 2;
  // the LV the sliders set, on the heart the page shows
  const W8 = lvWeights(st.pheno || 'normal', L.edv, L.esv, st.wall);
  const sy = cycleAt(tt).s;
  for (const [i, view] of [[0, 'a4c'], [1, 'a2c']]) {
    const x = x0 + i * (colW + gap);
    const box = { x, y: pad, w: colW, h: eh };
    const title = view === 'a4c' ? fit(colW, 'APICAL FOUR-CHAMBER', 'A4C') : fit(colW, 'APICAL TWO-CHAMBER', 'A2C');
    const names = view === 'a4c' ? (colW < 250 ? [['rv', 'RV'], ['la', 'LA']] : [['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']]) : [['la', 'LA']];
    const F = ECHO[view].draw(sh.ctx, box, title, { tms: tt, disease: { lvSize: W8.size + (W8.esSize - W8.size) * sy, lvWall: W8.wall }, lvK: W8.k, fore: foreOffset(view, L.f, W8.size), names });
    const T = F ? traceOf(ECHO[view], sy) : null;
    if (T) traceOn(sh.ctx, F, T);
    drawLV(sh, t, { x, y: pad + eh + (narrow ? 4 : 10), w: colW, h: dh }, L, view, view === 'a2c' ? 'A2C' : 'A4C', T, ph.c);
  }
  const ty = H - textH + (narrow ? 12 : 16);
  sh.text('V = π/4 × Σ aᵢ × bᵢ × L / 20', x0, ty, { family: MONO, weight: 500, size: narrow ? 11 : 13 });
  // the volumes and the EF, in a shorter form where the long one runs past the figure's edge
  const fs = narrow ? 11 : 12.5, trueEdv = L.f > 0.02 ? L.edv.toFixed(0) : null;
  const volL = `EDV ${v.edvm} mL · ESV ${v.esvm} mL · EF ${v.ef}%${trueEdv ? `  (true EDV ${trueEdv} mL)` : ''}`;
  const volS = `EDV ${v.edvm} · ESV ${v.esvm} mL · EF ${v.ef}%${trueEdv ? ` (true EDV ${trueEdv})` : ''}`;
  sh.ctx.save();
  sh.ctx.font = `400 ${fs}px ${MONO}`;
  const vol = sh.ctx.measureText(volL).width <= W - x0 - 6 ? volL : volS;
  sh.ctx.restore();
  sh.text(vol, x0, ty + (narrow ? 17 : 22), { family: MONO, weight: 400, size: fs, color: trueEdv ? t.flag : t.ink2 });
  if (!narrow) sh.text('a: diameter in A4C · b: diameter in A2C · L: the longer length · 20 disks', x0, ty + 43, { family: SANS, weight: 400, size: 11, color: t.ink3 });
}

// ---------------------------------------------------------------- the measurements in the text
// LV: the traced volumes (▲▼) and the sex, to the stroke volume, the LVEF and the indexes in the
// bands of Lang 2015, and the heart failure category. RV: TAPSE, S′ and the two areas (▲▼), to
// the FAC and the bands of Mukherjee 2025 Table 1. Each change flashes where it acts.
const NAME = {
  edvm: 'End-diastolic volume', esvm: 'End-systolic volume', sex: 'Sex', sv: 'Stroke volume', ef: 'LVEF', edvi: 'EDV index', esvi: 'ESV index',
  tapse: 'TAPSE', sPrime: 'S′', eda: 'RV end-diastolic area', esa: 'RV end-systolic area', fac: 'Fractional area change',
};
const UNIT = { edvm: 'mL', esvm: 'mL', sv: 'mL', ef: '%', edvi: 'mL/m²', esvi: 'mL/m²', bsa: 'm²', tapse: 'mm', sPrime: 'cm/s', eda: 'cm²', esa: 'cm²', fac: '%' };
const DEC = { edvm: 0, esvm: 0, sv: 0, ef: 0, edvi: 0, esvi: 0, bsa: 2, tapse: 1, sPrime: 1, eda: 1, esa: 1, fac: 0 };
const ARIA = { edvm: 'end-diastolic volume', esvm: 'end-systolic volume', tapse: 'TAPSE', sPrime: 'RV S′', eda: 'RV end-diastolic area', esa: 'RV end-systolic area' };
const LV_IN = ['edvm', 'esvm'];
const RV_IN = ['tapse', 'sPrime', 'eda', 'esa'];
/** The steps and the fixed limits of each measurement; the volumes and areas also stop where the EF or the FAC leaves its slider's range. */
const INPUTS = {
  edvm: { step: 5, d: 0 }, esvm: { step: 5, d: 0 },
  tapse: { step: 1, min: 5, max: 30, d: 1 }, sPrime: { step: 0.5, min: 4, max: 18, d: 1 },
  eda: { step: 1, d: 1 }, esa: { step: 1, d: 1 },
};
const SEX_LABEL = { M: 'Man', F: 'Woman' };
const LV_GROUPS = [['twod', '2D', 'biplane method of disks, apical four- and two-chamber views', LV_IN]];
const RV_GROUPS = [
  ['mmode', 'M-mode and tissue Doppler', 'lateral tricuspid annulus, RV-focused view', ['tapse', 'sPrime']],
  ['twod', '2D', 'RV area traced in the RV-focused four-chamber view', ['eda', 'esa']],
];
/** The names in the change line, after its cause. */
const EFFECT = { edvm: 'EDV', esvm: 'ESV', sv: 'stroke volume', ef: 'LVEF', edvi: 'EDV index', esvi: 'ESV index', tapse: 'TAPSE', sPrime: 'S′', eda: 'EDA', esa: 'ESA', fac: 'FAC' };
/** What each measurement changes. */
const EFFECTS = { edvm: ['sv', 'ef', 'edvi'], esvm: ['sv', 'ef', 'esvi'], eda: ['fac'], esa: ['fac'], tapse: [], sPrime: [] };
const LV_SHOW = ['edvm', 'esvm', 'sv', 'ef', 'edvi', 'esvi'];
const RV_SHOW = ['tapse', 'sPrime', 'eda', 'esa', 'fac'];
/** Each formula, and its numbers: text, and the keys whose values show. Rows without one are measured. */
const FORMULA = {
  sv: ['EDV − ESV', [{ k: 'edvm' }, ' − ', { k: 'esvm' }]],
  ef: ['stroke volume ÷ EDV', [{ k: 'sv' }, ' ÷ ', { k: 'edvm' }]],
  edvi: ['EDV ÷ body surface area', [{ k: 'edvm' }, ' ÷ ', { k: 'bsa' }]],
  esvi: ['ESV ÷ body surface area', [{ k: 'esvm' }, ' ÷ ', { k: 'bsa' }]],
  fac: ['(EDA − ESA) ÷ EDA', ['(', { k: 'eda' }, ' − ', { k: 'esa' }, ') ÷ ', { k: 'eda' }]],
};
const MEASURED = { tapse: 'the M-mode excursion of the annulus toward the apex', sPrime: 'the peak systolic tissue velocity of the annulus' };
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { edvm: 3, esvm: 3, sv: 3, bsa: 4, eda: 4, esa: 4 };
/** The bands of each graded value for sex x: [short name, label], from the first chip. */
function chipsOf(k, x) {
  if (k === 'ef') {
    const [lo, hi] = LVEF_RANGE[x];
    return [['above', `>${hi}`], ['normal', `${lo}–${hi}`], ['mild', `41–${lo - 1}`], ['moderate', '30–40'], ['severe', '<30']];
  }
  if (k === 'edvi' || k === 'esvi') {
    const [lo, hi, m1, m2] = LANG[k][x];
    return [['below', `<${lo}`], ['normal', `${lo}–${hi}`], ['mild', `${hi + 1}–${m1}`], ['moderate', `${m1 + 1}–${m2}`], ['severe', `>${m2}`]];
  }
  return RV_BANDS[k].map((lab, i) => [['normal', 'mild', 'moderate', 'severe'][i], lab]);
}
const LV_GRADED = ['ef', 'edvi', 'esvi'];
const RV_GRADED = ['tapse', 'sPrime', 'fac'];
const EF_LEAD = { hyperdynamic: 'Hyperdynamic LVEF', normal: 'Normal LVEF', 'mildly abnormal': 'Mildly abnormal LVEF', 'moderately abnormal': 'Moderately abnormal LVEF', 'severely abnormal': 'Severely abnormal LVEF' };
const RV_LEAD = { normal: 'Normal RV systolic function', reduced: 'Reduced RV systolic function', mixed: 'RV measures disagree' };
const RV_OUT = { normal: 'all three normal', mixed: 'the measures disagree', reduced: 'all three reduced' };
const HF = [['HFrEF range', '≤40%'], ['HFmrEF range', '41–49%'], ['HFpEF range', '≥50%']];
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const LV_BANDS_NOTE = 'Lang 2015 gives the normal ranges and the severity bands by sex<span class="cite" data-ref="lang2015"></span>. Above the normal range the diagram calls the LVEF hyperdynamic, a term of the ASE reporting guideline<span class="cite" data-ref="taub2025"></span>, which gives no number for it. The body surface area is 1.97 m² (175 cm, 80 kg).';
const LV_RES_NOTE = 'The heart failure categories apply to a patient with heart failure<span class="cite" data-ref="heidenreich2022"></span>. At an LVEF of 50–51% in a man and 50–53% in a woman, Lang 2015 calls the LVEF mildly abnormal, and the heart failure guideline counts it as preserved.';
const RV_BANDS_NOTE = 'The bands are those of Table 1 as corrected in May 2025<span class="cite" data-ref="mukherjee2025"></span>: TAPSE is mildly reduced at 14–17 mm and S′ at 7.3–9.5 cm/s.';
const RV_RES_NOTE = 'TAPSE and S′ measure the motion of one point of the tricuspid annulus; FAC comes from the whole RV area in one plane. When TAPSE can underestimate RV function, as after cardiac surgery, an abnormal TAPSE should be reported only if adjunctive findings such as FAC or 3D RVEF support it<span class="cite" data-ref="mukherjee2025"></span>.';
const DEFAULTS = { side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, tapse: 22, sPrime: 12, fac: 45, rvEda: RV_EDA, ejSex: 'M', frame8: 'cine' };
/** The values that Reset gives back on each side: the chapter's start under the heart shown. */
const RESET = { lv: ['edv', 'ef'], rv: ['tapse', 'sPrime', 'fac', 'rvEda'] };
const baseOf = (s) => ({ ...DEFAULTS, ...presetsFor(s.pheno || 'normal') });
const SLIDER = { edv: 'End-diastolic volume slider', ef: 'Ejection fraction slider', fore: 'Foreshortening slider', tapse: 'TAPSE slider', sPrime: 'RV S′ slider', fac: 'FAC slider' };
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (k === 'sex' ? SEX_LABEL[x].toLowerCase() : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

const D = { lv: null, rv: null };                // each side's diagram
const prev = { lv: null, rv: null };             // what each showed last
const fresh = { lv: true, rv: true };            // the next drawing sets the baseline: no change line, no flash
const line = { lv: { kind: '', at: -1e9 }, rv: { kind: '', at: -1e9 } };
let pending = null;                              // the cause of the change being drawn: an edit, the sex or Reset

function buildSide(side, host) {
  const IN = side === 'lv' ? LV_IN : RV_IN;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${btn(k, -1)}<span class="ase-v"><b></b><small>${UNIT[k]}</small></span>${btn(k, 1)}</span>
    </div>`;
  const sex = `<div class="ase-row asx-in" data-row="sex" role="group" aria-label="Sex">
      <span class="ase-nm">Sex, for the bands</span>
      <span class="seg rgx-tg">${SEXES.map((x) => `<button type="button" data-k="sex" data-x="${x}" aria-pressed="false">${SEX_LABEL[x]}</button>`).join('')}</span>
    </div>`;
  const group = ([s, name, sub, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">${sub}</span></p>
      ${keys.map(input).join('')}${side === 'lv' ? sex : ''}<p class="ase-note asx-note rgx-dur"></p>
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k]}ch"></i>`)).join('');
  const GR = side === 'lv' ? LV_GRADED : RV_GRADED;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${GR.includes(k) ? '<span class="asx-st"></span>' : ''}</p>
      <p class="asx-f">${FORMULA[k] ? `<span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span>` : `<span class="asx-fx">${MEASURED[k]}</span>`}</p>
      ${GR.includes(k) ? '<span class="asx-chips" aria-hidden="true"></span>' : ''}
    </div>`;
  const lv = side === 'lv';
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">${lv ? 'LV volumes and LVEF' : 'RV systolic function'}</h3><button type="button" class="ase-reset is-off" aria-label="Reset the ${lv ? 'LV volumes' : 'RV measurements'}">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${(lv ? LV_GROUPS : RV_GROUPS).map(group).join('')}
    <div class="ase-step is-on asx-step" data-s="bands">
      <p class="ase-sh"><span class="ase-sn">Bands</span><span class="ase-sx">${lv ? 'Lang 2015, by sex<span class="cite" data-ref="lang2015"></span>' : 'ASE 2025, Table 1<span class="cite" data-ref="mukherjee2025"></span>'}</span></p>
      ${(lv ? ['sv', 'ef', 'edvi', 'esvi'] : ['tapse', 'sPrime', 'fac']).map(eq).join('')}
      <p class="ase-note asx-note">${lv ? LV_BANDS_NOTE : RV_BANDS_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">${lv ? 'the LVEF band, and the heart failure category' : 'the three measures together'}</span></p>
      ${lv
    ? `<div class="asx-br is-on" data-b="ef"><p class="asx-bl">LVEF band<span class="cite" data-ref="lang2015"></span></p><p class="asx-os">${Object.keys(EF_LEVEL).map((o) => `<span class="ase-o" data-o="${o}"${EF_LEVEL[o] >= 3 ? ' data-sev' : ''}>${o}</span>`).join('')}</p></div>
      <div class="asx-br is-on" data-b="hf"><p class="asx-bl">In a patient with heart failure<span class="cite" data-ref="heidenreich2022"></span></p><p class="asx-os">${HF.map(([o, r]) => `<span class="ase-o" data-o="${o}">${o.replace(' range', '')} <small>${r}</small></span>`).join('')}</p></div>`
    : `<div class="asx-br is-on" data-b="rv"><p class="asx-bl">TAPSE, S′ and FAC</p><p class="asx-os">${Object.keys(RV_OUT).map((o) => `<span class="ase-o" data-o="${o}"${o === 'reduced' ? ' data-sev' : ''}>${RV_OUT[o]}</span>`).join('')}</p></div>`}
      <p class="ase-note asx-note">${lv ? LV_RES_NOTE : RV_RES_NOTE}</p>
    </div>`;
  const q = (s) => host.querySelector(s);
  const d = {
    host, side, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'), dur: q('.rgx-dur'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    sex: lv ? [...host.querySelectorAll('[data-row="sex"] button')] : [],
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'), xs: [...el.querySelectorAll('[data-x]')], sex: null,
    }])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(side, b.dataset.k, b.dataset.k === 'sex' ? b.dataset.x : Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetSide(side);
  });
  return d;
}

function buildDiagram(host) {
  if (!host) return;
  host.innerHTML = '<div class="asx-side" data-side="lv"></div><div class="asx-side" data-side="rv" hidden></div>';
  D.lv = buildSide('lv', host.querySelector('[data-side="lv"]'));
  D.rv = buildSide('rv', host.querySelector('[data-side="rv"]'));
}

/** The lower and upper limit of measurement k at the values v: the fixed ones, and where the EF or the FAC would leave its slider's range. */
function limitsOf(k, v) {
  const up = (x, d) => Math.ceil(x * 10 ** d - 1e-6) / 10 ** d, dn = (x, d) => Math.floor(x * 10 ** d + 1e-6) / 10 ** d;
  const lo = 1 - EF_MAX / 100, hi = 1 - EF_MIN / 100, flo = 1 - FAC_MAX / 100, fhi = 1 - FAC_MIN / 100;
  if (k === 'edvm') return [up(Math.max(50 * (1 - v.f), v.esvm / hi), 0), dn(Math.min(320 * (1 - v.f), v.esvm / lo), 0)];
  if (k === 'esvm') return [up(Math.max(5, v.edvm * lo), 0), dn(v.edvm * hi, 0)];
  if (k === 'eda') return [up(Math.max(10, v.esa / fhi), 1), dn(Math.min(40, v.esa / flo), 1)];
  if (k === 'esa') return [up(Math.max(3, v.eda * flo), 1), dn(v.eda * fhi, 1)];
  return [INPUTS[k].min, INPUTS[k].max];
}

const freeLive = () => { const live = document.querySelector('#ch-eject .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click (dir) or the sex: the chapter's values in one patch, which the sliders follow; Play and the tour stop. */
function edit(side, k, x, btn = null) {
  const s = st;
  if (k === 'sex') {
    if (x === sexOf(s)) return;
    const was = lvShown(s).band;
    pending = { kind: 'sex', from: sexOf(s), to: x };
    steady(btn, () => setState({ ejSex: x, playing: false }));
    pending = null;
    if (lvShown(st).band !== was) cue('bell');
    return;
  }
  const v = side === 'lv' ? lvShown(s) : rvShown(s);
  const [lo, hi] = limitsOf(k, v);
  const from = v[k], to = stepOf(from, { ...INPUTS[k], min: lo, max: hi }, x);
  if (to === from || lo > hi) return;
  let patch;
  if (side === 'lv') {
    const edvm = k === 'edvm' ? to : v.edvm, esvm = k === 'esvm' ? to : v.esvm;
    patch = { edv: edvm / (1 - v.f), ef: (100 * (edvm - esvm)) / edvm };
  } else if (k === 'eda' || k === 'esa') {
    const eda = k === 'eda' ? to : v.eda, esa = k === 'esa' ? to : v.esa;
    patch = { rvEda: eda, fac: (100 * (eda - esa)) / eda };
  } else patch = { [k]: to };
  const was = side === 'lv' ? v.band : v.out;
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => setState({ ...patch, playing: false }));
  pending = null;
  const now = side === 'lv' ? lvShown(st).band : rvShown(st).out;
  if (now !== was) cue('bell');
}

function resetSide(side) {
  const b = baseOf(st);
  pending = { kind: 'reset' };
  setState({ ...Object.fromEntries(RESET[side].map((k) => [k, b[k]])), playing: false });
  pending = null;
  freeLive();
  D[side]?.result.focus({ preventScroll: true });
}

/** The values each side's diagram follows, with the slider positions that a change line names. */
function sideState(s, side) {
  const v = side === 'lv' ? lvShown(s) : rvShown(s);
  const b = baseOf(s);
  return { v, raw: Object.fromEntries(Object.keys(SLIDER).map((k) => [k, s[k]])), edited: RESET[side].some((k) => Math.abs((s[k] ?? b[k]) - b[k]) > 1e-9), out: side === 'lv' ? v.band : v.out };
}

/** The diagram of the side shown: numbers, bands and result; then what changed. */
function renderDiagram(s) {
  if (!D.lv) return;
  const side = sideOf(s), other = side === 'lv' ? 'rv' : 'lv';
  D[side].host.hidden = false;
  D[other].host.hidden = true;
  fresh[other] = true;
  const d = D[side], M = sideState(s, side), v = M.v;
  const P = fresh[side] ? null : prev[side];
  fresh[side] = false;
  prev[side] = M;
  // the measurements and their buttons
  for (const [k, R] of Object.entries(d.rows)) {
    txt(R.v, num(k, v[k]));
    const [lo, hi] = limitsOf(k, v);
    for (const [b, off, oth] of [[R.dn, v[k] <= lo + 1e-9 || lo > hi, R.up], [R.up, v[k] >= hi - 1e-9 || lo > hi, R.dn]]) {
      if (off && document.activeElement === b) oth.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  d.sex.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.x === v.sex)));
  if (side === 'lv') {
    const b = baseOf(s);
    txt(d.dur, v.f > 0.02
      ? `With ${s.fore}% foreshortening, both traced volumes are ${s.fore}% below the true ones: the true EDV is ${fmt(v.L.edv)} mL. The sliders follow the buttons.`
      : `The volumes set the EDV and ejection fraction sliders; at the start of the chapter they are ${b.edv} and ${fmt(b.edv * (1 - b.ef / 100))} mL.`);
  } else txt(d.dur, 'TAPSE and S′ set their sliders; the areas set the FAC slider.');
  // the bands
  for (const [k, E] of Object.entries(d.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (!E.st) continue;
    // the chips depend on the sex: drawn again when it changes
    const key = side === 'lv' ? v.sex : 'rv';
    if (E.sex !== key) {
      E.sex = key;
      E.chips.innerHTML = chipsOf(k, v.sex).map(([nm, lab], i) => `<span class="asx-c" data-i="${side === 'lv' ? i : i + 1}" data-l="${side === 'lv' ? i : i + 1}">${nm} ${lab}</span>`).join('');
      E.cs = [...E.chips.querySelectorAll('.asx-c')];
    }
    const g = v.g[k];
    E.cs.forEach((ch) => ch.classList.toggle('is-on', Number(ch.dataset.i) === g));
    txt(E.st, side === 'lv' ? chipsOf(k, v.sex)[g][0] : ['', 'normal', 'mild', 'moderate', 'severe'][g]);
    E.el.dataset.l = g;
  }
  // the result
  if (side === 'lv') {
    for (const [o, el] of Object.entries(d.out)) el.classList.toggle('is-on', o === v.band || o === v.hf);
    txt(d.head, EF_LEAD[v.band]);
    txt(d.sub, `${v.ef}% by the biplane method, ${SEX_LABEL[v.sex].toLowerCase()} · ${v.hf}`);
    d.result.classList.toggle('is-raised', EF_LEVEL[v.band] >= 3);
  } else {
    for (const [o, el] of Object.entries(d.out)) el.classList.toggle('is-on', o === v.out);
    const names = (ks) => listOf(ks.map((k) => (k === 'fac' ? 'FAC' : NAME[k])));
    const ok = ['tapse', 'sPrime', 'fac'].filter((k) => !v.low.includes(k));
    txt(d.head, RV_LEAD[v.out]);
    txt(d.sub, v.out === 'mixed' ? `${names(v.low)} reduced; ${names(ok)} normal` : `TAPSE, S′ and FAC ${v.out}`);
    d.result.classList.toggle('is-raised', v.out === 'reduced');
  }
  d.reset.classList.toggle('is-off', !M.edited);   // its room stays, so nothing moves when it shows
  // the EF slider's label: main.js writes it when the EF changes, and the EDV can change it alone
  if (side === 'lv') { const o = document.querySelector('output[data-for="ef"]'); if (o) txt(o, `${v.ef}%`); }
  if (!pending) freeLive();
  if (!P) { txt(d.change, ''); line[side].kind = ''; return; }
  const SHOW = side === 'lv' ? LV_SHOW : RV_SHOW;
  const moved = SHOW.some((k) => P.v[k] !== v[k]) || P.v.sex !== v.sex || P.out !== M.out;
  if (!moved) return;
  const cause = pending || sliderCause(P, M);
  // a screen reader reads the line after an edit, the sex or Reset, not at each step of a slider
  d.change.setAttribute('aria-live', cause.kind === 'slider' ? 'off' : 'polite');
  const L = changeLine(side, P, M, cause);
  const now = performance.now(), Ln = line[side];
  if (cause.kind !== 'slider' || L.crossed) {
    txt(d.change, L.text);
    Ln.kind = cause.kind;
    if (cause.kind === 'slider') Ln.at = now;
  } else if (Ln.kind !== 'slider' || now - Ln.at > HOLD) {
    txt(d.change, L.text);
    Ln.kind = 'slider-quiet';
  }
  flashChanges(side, P, M, cause);
}

/** The slider that moved, if one did alone; else the sliders together (a heart's preset, the tour). */
function sliderCause(P, M) {
  const ks = Object.keys(SLIDER).filter((k) => P.raw[k] !== M.raw[k]);
  return ks.length === 1 ? { kind: 'slider', k: ks[0], from: P.raw[ks[0]], to: M.raw[ks[0]] } : { kind: 'slider' };
}
const sliderText = (k, x) => (k === 'fore' ? `${Math.round(x)}%` : k === 'edv' ? `${Math.round(x)} mL` : k === 'tapse' ? `${x.toFixed(1)} mm` : k === 'sPrime' ? `${x.toFixed(1)} cm/s` : `${Math.round(x)}%`);

/** What a change crossed: the bands of the graded values, and the heart failure category. */
function crossed(side, P, M) {
  const a = P.v, b = M.v;
  const out = (side === 'lv' ? LV_GRADED : RV_GRADED).filter((k) => a.g[k] !== b.g[k])
    .map((k) => { const [nm, lab] = chipsOf(k, b.sex)[side === 'lv' ? b.g[k] : b.g[k] - 1]; return `${EFFECT[k]} ${nm} ${lab}${UNIT[k] === '%' ? '%' : ` ${UNIT[k]}`}`; });
  if (side === 'lv' && a.hf !== b.hf) out.push(b.hf);
  return out;
}

/** The cause and effect of a change, as one line. crossed: a band or the result changed. */
function changeLine(side, P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}`
    : cause.kind === 'sex' ? `Sex ${num('sex', cause.from)} → ${num('sex', cause.to)}`
      : cause.kind === 'reset' ? 'Reset' : cause.k ? `${SLIDER[cause.k]} ${sliderText(cause.k, cause.from)} → ${sliderText(cause.k, cause.to)}` : 'Sliders';
  const cut = crossed(side, P, M);
  const SHOW = side === 'lv' ? LV_SHOW : RV_SHOW;
  const ks = cause.kind === 'edit' ? EFFECTS[cause.k] : cause.kind === 'sex' ? [] : SHOW;
  const ch = ks.filter((k) => P.v[k] !== M.v[k] && !(cause.kind === 'edit' && k === cause.k));
  const what = [...ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${num(k, P.v[k])} → ${num(k, M.v[k])}`)}`), ...cut].join(', ') || 'no band changed';
  const word = (o) => (side === 'lv' ? o : RV_OUT[o]);
  const result = P.out === M.out ? `Result unchanged: ${word(M.out)}` : `Result: ${word(P.out)} → ${word(M.out)}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(side, P, M, cause) {
  const d = D[side], a = P.v, b = M.v;
  for (const k of side === 'lv' ? LV_GRADED : RV_GRADED) if (a.g[k] !== b.g[k] || a.sex !== b.sex) flash(d.eqs[k].chips);
  if (P.out !== M.out) { flash(d.out[M.out]); flash(d.result); }
  if (side === 'lv' && a.hf !== b.hf) flash(d.out[b.hf]);
  if (cause.kind === 'edit') {
    flash(d.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(d.eqs)) {
      if (a[k] !== b[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (a[el.dataset.x] !== b[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentence of the LV: the band in bold, then the numbers and what they mean. */
function lvLive(v, s, cite) {
  const L = cite('lang2015');
  const sex = v.sex === 'F' ? 'a woman' : 'a man';
  const range = (k) => { const [lo, hi] = LANG[k][v.sex]; return `${lo}–${hi}`; };
  const vol = (k, x) => { const g = langGrade(k, x, v.sex); return g === 'normal' ? `normal for ${sex} (${range(k)} mL/m²)` : g === 'below' ? `below the normal range for ${sex} (${range(k)} mL/m²)` : `${g} abnormal for ${sex}`; };
  const s0 = ` By the biplane method of disks, the EDV is ${v.edvm} mL and the ESV is ${v.esvm} mL, so the LVEF is ${v.ef}%, ${v.band === 'hyperdynamic' ? `above the normal range for ${sex} (${LVEF_RANGE[v.sex].join('–')}%)` : `${v.band} for ${sex}`}${L}.`;
  const s1 = ` In a patient with heart failure, this LVEF lies in the ${v.hf}${cite('heidenreich2022')}.`;
  const s2 = v.f > 0.02
    ? ` <span class="k-red">With ${s.fore}% foreshortening of the apical views, the measured EDV is ${v.edvm} mL, whereas the true EDV is ${fmt(v.L.edv)} mL.</span> The LVEF changes little, because the EDV and ESV decrease by the same fraction.`
    : ` The EDV index is ${v.edvi} mL/m², ${vol('edvi', v.edvi)}, for a body surface area of ${v.bsa.toFixed(2)} m².`;
  return `<b>${EF_LEAD[v.band]}.</b>${s0}${s1}${s2}`;
}

/** The live sentence of the RV: the result in bold, then the three measures. */
function rvLive(v, cite) {
  const tail = v.gr.tapse !== 'normal' && v.gr.fac === 'normal'
    ? ` When TAPSE can underestimate RV function, as after cardiac surgery, an abnormal TAPSE should be reported only if adjunctive findings such as FAC support it${cite('mukherjee2025')}.`
    : '';
  return `<b>${RV_LEAD[v.out]}.</b> TAPSE is ${fmt(v.tapse, 1)} mm (${v.gr.tapse}), S′ is ${fmt(v.sPrime, 1)} cm/s (${v.gr.sPrime}) and FAC is ${fmt(v.fac)}% (${v.gr.fac})${cite('mukherjee2025')}. TAPSE and S′ measure the motion of a single point of the tricuspid annulus along one line; FAC is derived from the whole RV area in one plane.${tail}`;
}

export default {
  key: 'eject',
  part: 'function',
  title: 'Systolic function',
  nav: 'Systolic',
  dwell: 11,
  defaults: { ...DEFAULTS },
  format: {
    edv: (v) => `${Math.round(v)} mL`,
    // the EF on screen: from the traced volumes as printed (it can differ by 1 from the model's)
    ef: (v, s) => `${s ? lvShown(s).ef : Math.round(v)}%`,
    wall: (v) => `${v.toFixed(1)} mm`,
    fore: (v) => (v ? `${v}% short` : 'none'),
    tapse: (v) => `${v.toFixed(1)} mm`,
    sPrime: (v) => `${v.toFixed(1)} cm/s`,
    fac: (v) => `${Math.round(v)}%`,
  },
  watch: ['side', 'edv', 'ef', 'wall', 'fore', 'tapse', 'sPrime', 'fac', 'rvEda', 'ejSex', 'frame8'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) {
    st = state;
    setState = set;
    buildDiagram(document.getElementById('eject-calc'));
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh.lv = fresh.rv = true; freeLive(); ECHO.a4c.start(); ECHO.a2c.start(); },
  // the heart model and the LV targets load at idle, before the chapter opens (main.js warms every chapter)
  warm() { ECHO.a4c.start(); ECHO.a2c.start(); },
  leave() { fresh.lv = fresh.rv = true; freeLive(); },
  anim(dt, s) {
    if (reducedMotion || s.frame8 !== 'cine' || sideOf(s) !== 'lv') return;
    clock += dt / 1.5;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, ejSex: 'M', frame8: 'cine' }); },
  // the LV only: a dilated LV with a reduced EF, then foreshortened views, then back (the RV
  // steps went with the RV side to rv.js)
  tourTick(tt, set) {
    if (tt < 5) set({ ef: Math.round(60 - clamp((tt - 1) / 3.5, 0, 1) * 30), edv: Math.round(120 + clamp((tt - 1) / 3.5, 0, 1) * 80) });
    else if (tt < 9.5) set({ ef: 60, edv: 120, fore: Math.round(clamp((tt - 5.5) / 3, 0, 1) * 20) });
    else set({ fore: 0 });
  },
  text(s, { cite }) {
    if (sideOf(s) === 'rv') {
      const v = rvShown(s);
      return {
        readouts: [
          { k: 'TAPSE', v: fmt(v.tapse, 1), u: 'mm', flag: v.gr.tapse !== 'normal' },
          { k: 'RV S′', v: fmt(v.sPrime, 1), u: 'cm/s', flag: v.gr.sPrime !== 'normal' },
          { k: 'FAC', v: fmt(v.fac), u: '%', flag: v.gr.fac !== 'normal' },
          { k: 'TAPSE grade', v: v.gr.tapse, text: true },
          { k: 'S′ grade', v: v.gr.sPrime, text: true },
          { k: 'FAC grade', v: v.gr.fac, text: true },
        ],
        live: rvLive(v, cite),
        extra: () => renderDiagram(s),
      };
    }
    const v = lvShown(s);
    return {
      readouts: [
        { k: 'EDV', v: fmt(v.edvm), u: 'mL', flag: v.f > 0.02 },
        { k: 'ESV', v: fmt(v.esvm), u: 'mL', flag: v.f > 0.02 },
        { k: 'Stroke volume', v: fmt(v.sv), u: 'mL' },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.band !== 'normal' },
        { k: 'EDV index', v: fmt(v.edvi), u: 'mL/m²', flag: v.g.edvi !== 1 },
      ],
      live: lvLive(v, s, cite),
      extra: () => renderDiagram(s),
    };
  },
};
