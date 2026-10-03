// Systolic function. Left: LV volumes by the biplane method of disks in the apical
// four- and two-chamber views: each echo view with its traced border and disks, above the disk
// model of the same LV, and what foreshortening does to them. Right: three measures of RV
// systolic function (TAPSE, tissue Doppler S′, fractional area change).
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, caliper, tagBox } from '../scope.js';
import { cycleAt, RR, EV } from '../cyclemodel.js';
import { lvefBand, hfCategory, tapseGrade, sPrimeGrade, facGrade } from '../norms.js';
import { drawA4C, drawA2C, lvTrace, lvWidth, phase, measures } from '../echo2d.js';
import { cine, fit } from '../sev.js';
import { BSA } from './pressure.js';

const DISKS = 20;               // the method of disks (modified Simpson's rule)
const ELL = 3.5;                // LV length / widest radius at end-diastole (model)
const OVAL = Math.sqrt(0.94);   // the cross-section is an ellipse: A2C diameter / A4C diameter = 0.94,
                                // with the area of the circle that volume() integrates

/**
 * The model LV: widest radius R, mitral annulus radius a, length L (cm). Its radius at level z
 * (0 base .. 1 apex) is half the echo views' width profile (lvWidth), so the echo views and
 * the disk drawing show one LV.
 */
const radius = (z, S) => lvWidth(z, S.R, S.a);
/** Volume (mL): the integral of π r² along the length, exact for this profile. */
function volume(S) {
  const d = S.R - S.a;   // smoothstep moments over the basal 22%: 1/2 and 13/35
  return Math.PI * S.L * (0.22 * (S.a * S.a + S.a * d + (13 / 35) * d * d) + 0.78 * (2.3 / 3.3) * S.R * S.R);
}
/** The shape of volume V (mL) in a family R -> {R, a, L} whose volume rises with R. */
function solve(V, family) {
  let lo = 0.1, hi = 8;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (volume(family(m)) < V) lo = m; else hi = m; }
  return family((lo + hi) / 2);
}
/** End-diastole: 3.1 cm across the annulus at R 2.5 cm; the annulus dilates less than the LV. */
const edFamily = (R) => ({ R, a: 1.55 * Math.sqrt(R / 2.5), L: ELL * R });
const BIG = solve(320, edFamily);   // the largest LV on the page sets the drawing's scale

/** Wall thickness (cm) at end-systole: the muscle keeps its volume, as a shell round a sphere of the cavity's volume. */
function wallEs(edv, esv, w) {
  const r = (v) => Math.cbrt((3 * v) / (4 * Math.PI));
  return Math.cbrt(r(esv) ** 3 + (r(edv) + w) ** 3 - r(edv) ** 3) - r(esv);
}

export function lvState(s) {
  const edv = s.edv, esv = s.edv * (1 - s.ef / 100), e = s.ef / 100;
  const ed = solve(edv, edFamily);
  // in systole the long axis shortens less than the short axis (15% at an EF of 60%), and the
  // annulus narrows a little
  const aEs = ed.a * (1 - 0.2 * e), lEs = ed.L * (1 - 0.25 * e);
  const es = solve(esv, (R) => ({ R, a: aEs, L: lEs }));
  const wall = [s.wall / 10, wallEs(edv, esv, s.wall / 10)];
  const f = s.fore / 100;
  // A foreshortened view misses the true apex: the traced length, and with it each disk
  // volume, falls by the same fraction at end-diastole and end-systole.
  const EDm = edv * (1 - f), ESm = esv * (1 - f);
  return { edv, esv, ed, es, wall, EDm, ESm, svm: EDm - ESm, ef: (EDm - ESm) / EDm, f };
}

/** The shape at contraction c (0 end-diastole .. 1 end-systole), as the echo views interpolate it. */
const at = (L, c) => ({ R: mix(L.ed.R, L.es.R, c), a: mix(L.ed.a, L.es.a, c), L: mix(L.ed.L, L.es.L, c), w: mix(L.wall[0], L.wall[1], c) });

let sheet = null, st = null, clock = 0;

/** The frame shown: the running beat (cine) or a fixed end-diastolic or end-systolic frame. */
function frameNow() {
  if (st.frame8 === 'ed') return { t: 0, ph: { c: 0, mvShut: 1, tvShut: 1, avOpen: 0 } };
  if (st.frame8 === 'es') return { t: EV.avc, ph: { c: 1, mvShut: 1, tvShut: 1, avOpen: 0 } };
  const t = (clock * 1000) % RR;
  return { t, ph: phase(t) };
}

/** The echo geometry (see drawA4C) of the model LV in one view; the rest of the heart is normal. */
export function echoG(L, view) {
  const k = view === 'a2c' ? OVAL : 1 / OVAL, f = 1 - L.f;
  const ma = [2 * L.ed.a * k, 2 * L.es.a * k];
  return {
    lvL: [L.ed.L * f, L.es.L * f], lvW: [2 * L.ed.R * k, 2 * L.es.R * k], ma, lvWall: L.wall, ivs: L.wall,
    mvK: Math.max(1, ma[0] / 3.1), rvW: [3.3, 2.7], laW: [3.4, 4.1], laL: [4.1, 4.9], raW: [3.2, 3.8], raL: [3.9, 4.5], ta: 3.0,
  };
}

/** The traced border, its long axis and disks on an echo view, and the length in the corner. */
function traceOn(ctx, F, geo) {
  const T = lvTrace(geo, DISKS);
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

/** The disk model of one view at contraction c: hatched wall, disks, long axis; the true apex when foreshortened. */
function drawLV(sh, t, box, L, which, label, c) {
  const ctx = sh.ctx;
  const { x, y, w, h } = box;
  const k = which === 'a2c' ? OVAL : 1 / OVAL;
  // echo convention: the true apex at the top. One scale for every volume, so a dilated LV
  // looks larger; room above the apex for the wall.
  const s1 = Math.min(w / (2 * BIG.R / OVAL + 6), (h - 12) / (BIG.L + 1.8));
  const cx = x + w / 2, top = y + 6 + 1.8 * s1;
  const S = at(L, c);
  const Ltrue = S.L, Lf = Ltrue * (1 - L.f);
  const y0 = top + (Ltrue - Lf) * s1;   // the traced apex: a foreshortened view misses the true one
  const wall = S.w * s1;
  const pts = (Lx, shrink = 0, from = y0) => {
    const out = [];
    for (let i = 0; i <= 60; i++) { const z = i / 60; out.push([cx + (radius(z, S) * k * s1 + shrink), from + (1 - z) * Lx * s1]); }
    for (let i = 60; i >= 0; i--) { const z = i / 60; out.push([cx - (radius(z, S) * k * s1 + shrink), from + (1 - z) * Lx * s1]); }
    return out;
  };
  // myocardium
  const outer = pts(Lf + S.w * 0.6, wall);
  const inner = pts(Lf);
  const myo = new Path2D();
  outer.forEach(([px, py], i) => (i ? myo.lineTo(px, py - wall * 0.6) : myo.moveTo(px, py - wall * 0.6)));
  myo.closePath();
  inner.forEach(([px, py], i) => (i ? myo.lineTo(px, py) : myo.moveTo(px, py)));
  myo.closePath();
  ctx.save();
  ctx.clip(myo, 'evenodd');
  sh.hatch(new Path2D(`M0 0H${sh.w}V${sh.h}H0Z`), 0.6, 4.2, t.ink2, 0.8, which === 'a2c' ? 71 : 70, 0.55);
  ctx.restore();
  sh.poly(inner, { width: 1.6, rough: 0.5, seed: which === 'a2c' ? 72 : 73, stroke: t.ink });
  // disks
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < DISKS; i++) {
    const z = (i + 0.5) / DISKS;
    const yy = y0 + (1 - z) * Lf * s1;
    const r = radius(z, S) * k * s1;
    ctx.beginPath();
    ctx.moveTo(cx - r, yy);
    ctx.lineTo(cx + r, yy);
    ctx.stroke();
  }
  ctx.restore();
  // long axis
  const small = w < 250;
  sh.line(cx, y0, cx, y0 + Lf * s1, { width: 1, rough: 0.2, seed: 74, stroke: t.flag, dash: [4, 3] });
  // the length beside the drawing, clear of the wall and inside the column
  const lab = `L ${Lf.toFixed(1)} cm`, size = small ? 10 : 11;
  ctx.save();
  ctx.font = `500 ${size}px ${MONO}`;
  const xr = Math.min(cx + (S.R / OVAL + S.w) * s1 + 6, x + w - ctx.measureText(lab).width - 2);
  ctx.restore();
  sh.text(lab, xr, y0 + Lf * s1 * 0.4, { family: MONO, weight: 500, size, color: t.flag });
  // the true apex, lost when foreshortened
  if (L.f > 0.02) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = t.ink3;
    const tr = pts(Ltrue, 0, top);
    ctx.beginPath();
    tr.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.restore();
    sh.text('true apex', cx + 10, top + 4, { size: small ? 13 : 15, color: t.ink3 });
  }
  sh.text(label, x + 4, y + 18, { size: small ? 16 : 19 });
  // the mitral annulus line
  const ra = radius(0, S) * k * s1;
  sh.line(cx - ra - 4, y0 + Lf * s1, cx + ra + 4, y0 + Lf * s1, { width: 2, rough: 0.3, seed: 75 });
}

function drawRV(sh, t, W, H, narrow) {
  const ctx = sh.ctx;
  const cols = narrow ? 1 : 3;
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
    const y0 = bx.y + bx.h * 0.25;
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
      const yy = y0 + c.s * st.tapse * pxmm;
      const xx = bx.x + u * bx.w;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    // caliper from end-diastole to peak systole in the first beat
    const xb = bx.x + (EV_ES / (2.2 * RR)) * bx.w;
    caliper(ctx, xb, y0, xb, y0 + st.tapse * pxmm, { solid: true });
    ctx.restore();
    // on a dark box, as on the scanner: the trace runs behind it
    tagBox(ctx, xb + 6, y0 + st.tapse * pxmm / 2, [`${st.tapse.toFixed(1)} mm`], { size: 11 });
  }
  // tissue Doppler S′
  {
    const { x, y } = pos(1);
    panel(ctx, x, y, bw, bh, 'PW TISSUE DOPPLER · TV ANNULUS');
    const bx = { x: x + 4, y: y + 24, w: bw - 32, h: bh - 28 };
    const sP = st.sPrime / 100, eP = 0.14, aP = 0.12;
    const fn = (u) => {
      const tt = (u * 2 * RR) % RR;
      if (tt > 70 && tt < 330) return sP * Math.sin(Math.PI * (tt - 70) / 260) ** 0.9;
      if (tt > 470 && tt < 600) return -eP * Math.sin(Math.PI * (tt - 470) / 130);
      if (tt > 770 && tt < 857) return -aP * Math.sin(Math.PI * (tt - 770) / 87);
      return 0;
    };
    spectral(ctx, bx, { fn, scale: 0.2, base: 0.5, mode: 'pw', broad: 0.25, key: `sprime|${st.sPrime}`, seed: 8 });
    vscale(ctx, bx, 0.2, 0.5, 0.1, 'cm/s', { cm: true });
    const k = (bx.h * 0.5) / 0.2, yb = bx.y + bx.h * 0.5;
    const xs = bx.x + (200 / (2 * RR)) * bx.w;
    caliper(ctx, xs - 16, yb - sP * k, xs + 16, yb - sP * k, { solid: true });
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(`S′ ${st.sPrime.toFixed(1)} cm/s`, xs + 23, yb - sP * k + 4);
    ctx.fillText('e′', bx.x + (535 / (2 * RR)) * bx.w - 4, yb + eP * k + 14);
    ctx.fillText('a′', bx.x + (815 / (2 * RR)) * bx.w - 4, yb + aP * k + 14);
    ctx.restore();
  }
  // FAC: RV area at end-diastole and end-systole
  {
    const { x, y } = pos(2);
    sh.rect(x, y, bw, bh, { width: 1, rough: 0.4, seed: 90, stroke: t.rule });
    sh.text('fractional area change', x + 8, y + 22, { size: 18 });
    const cx = x + bw * 0.52, cy = y + bh * 0.58, sc = Math.min(bw, bh) / 7.2;
    const rvPath = (k) => {
      // crescent-like RV in the four-chamber view: apex up, tricuspid annulus at the bottom
      const p = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * (i / 40);
        p.push([cx - Math.cos(a) * 1.4 * sc * k, cy + 1.6 * sc - Math.sin(a) * 3.8 * sc * Math.sqrt(k)]);
      }
      return p;
    };
    const kEs = Math.sqrt(1 - st.fac / 100);
    sh.poly(rvPath(1), { width: 1.6, rough: 0.5, seed: 91, stroke: t.ink });
    sh.poly(rvPath(kEs * kEs), { width: 1.6, rough: 0.5, seed: 92, stroke: t.flag, fill: t.flag2, fillStyle: 'hachure', gap: 5 });
    sh.text('end-diastole', cx + 1.6 * sc, cy - 2.2 * sc, { size: 15, color: t.ink });
    // right of both outlines; the color ties it to its shape
    sh.text('end-systole', cx + 1.6 * sc, cy + 0.2 * sc, { size: 15, color: t.flag });
    sh.text(`FAC = (EDA − ESA) / EDA = ${st.fac}%`, x + 8, y + bh - 10, { family: MONO, weight: 500, size: 11, color: t.ink2 });
  }
  if (!narrow) sh.text('Right ventricle, apical four-chamber, RV focused', 24, 44, { size: 22 });
}

const EV_ES = EV.avc;   // end-systole: aortic valve closure

function draw(sh, t) {
  const W = sh.w, H = sh.h;
  const narrow = W < 700;
  if (st.side === 'rv') { cine.live = false; drawRV(sh, t, W, H, narrow); return; }
  const L = lvState(st);
  const { t: tt, ph } = frameNow();
  cine.live = st.frame8 === 'cine' && !reducedMotion;
  // one column per view: the echo view above, the disk model of the same LV below
  const pad = narrow ? 6 : 16, gap = narrow ? 8 : 20, textH = narrow ? 36 : 68;
  const rows = H - pad - textH;
  const eh = Math.round(rows * (narrow ? 0.6 : 0.57)), dh = rows - eh - (narrow ? 4 : 10);
  const colW = Math.min((W - 2 * pad - gap) / 2, eh * 1.35);
  const x0 = (W - 2 * colW - gap) / 2;
  // LV focused: the depth takes the LV, the mitral valve and part of the LA
  const depth = clamp(Math.ceil((1.9 + 0.65 * L.wall[0] + L.ed.L + 3.5) * 2) / 2, 12, 22);
  for (const [i, view] of [[0, 'a4c'], [1, 'a2c']]) {
    const x = x0 + i * (colW + gap);
    const box = { x, y: pad, w: colW, h: eh };
    const o = { t: tt, ph, depth, after: traceOn };
    if (view === 'a4c') drawA4C(sh.ctx, box, echoG(L, view), { ...o, title: fit(colW, 'APICAL FOUR-CHAMBER', 'A4C'), labels: colW < 250 ? ['RV', 'LA'] : ['RV', 'LA', 'RA'] });
    else drawA2C(sh.ctx, box, echoG(L, view), { ...o, title: fit(colW, 'APICAL TWO-CHAMBER', 'A2C'), labels: ['LA'] });
    drawLV(sh, t, { x, y: pad + eh + (narrow ? 4 : 10), w: colW, h: dh }, L, view, view === 'a2c' ? 'A2C' : 'A4C', ph.c);
  }
  const ty = H - textH + (narrow ? 12 : 16);
  sh.text('V = π/4 × Σ aᵢ × bᵢ × L / 20', x0, ty, { family: MONO, weight: 500, size: narrow ? 11 : 13 });
  sh.text(`EDV ${L.EDm.toFixed(0)} mL · ESV ${L.ESm.toFixed(0)} mL · EF ${(L.ef * 100).toFixed(0)}%${L.f > 0.02 ? `  (true EDV ${L.edv.toFixed(0)} mL)` : ''}`, x0, ty + (narrow ? 17 : 22), { family: MONO, weight: 400, size: narrow ? 11 : 12.5, color: L.f > 0.02 ? t.flag : t.ink2 });
  if (!narrow) sh.text('a: diameter in A4C · b: diameter in A2C · L: the longer length · 20 disks', x0, ty + 43, { family: SANS, weight: 400, size: 11, color: t.ink3 });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'eject',
  part: 'function',
  title: 'Systolic function',
  nav: 'Systolic',
  dwell: 16,
  defaults: { side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, tapse: 22, sPrime: 12, fac: 45, frame8: 'cine' },
  format: {
    edv: (v) => `${Math.round(v)} mL`,
    ef: (v) => `${Math.round(v)}%`,
    wall: (v) => `${v.toFixed(1)} mm`,
    fore: (v) => (v ? `${v}% short` : 'none'),
    tapse: (v) => `${v.toFixed(1)} mm`,
    sPrime: (v) => `${v.toFixed(1)} cm/s`,
    fac: (v) => `${Math.round(v)}%`,
  },
  watch: ['side', 'edv', 'ef', 'wall', 'fore', 'tapse', 'sPrime', 'fac', 'frame8'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  anim(dt, s) {
    if (reducedMotion || s.frame8 !== 'cine' || s.side !== 'lv') return;
    clock += dt / 1.5;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, frame8: 'cine' }); },
  tourTick(tt, set) {
    if (tt < 5) set({ ef: Math.round(60 - clamp((tt - 1) / 3.5, 0, 1) * 30), edv: Math.round(120 + clamp((tt - 1) / 3.5, 0, 1) * 80) });
    else if (tt < 9) set({ ef: 60, edv: 120, fore: Math.round(clamp((tt - 5.5) / 3, 0, 1) * 20) });
    else if (tt < 10) set({ fore: 0, side: 'rv', tapse: 22, sPrime: 12, fac: 45 });
    else set({ tapse: Math.round((22 - clamp((tt - 10.5) / 4, 0, 1) * 10) * 2) / 2, sPrime: Math.round((12 - clamp((tt - 10.5) / 4, 0, 1) * 5) * 2) / 2, fac: Math.round(45 - clamp((tt - 10.5) / 4, 0, 1) * 18) });
  },
  text(s, { cite }) {
    if (s.side === 'rv') {
      const gT = tapseGrade(s.tapse), gS = sPrimeGrade(s.sPrime), gF = facGrade(s.fac);
      return {
        readouts: [
          { k: 'TAPSE', v: fmt(s.tapse, 1), u: 'mm', flag: gT !== 'normal' },
          { k: 'RV S′', v: fmt(s.sPrime, 1), u: 'cm/s', flag: gS !== 'normal' },
          { k: 'FAC', v: fmt(s.fac), u: '%', flag: gF !== 'normal' },
          { k: 'TAPSE grade', v: gT, text: true },
          { k: 'S′ grade', v: gS, text: true },
          { k: 'FAC grade', v: gF, text: true },
        ],
        live: `TAPSE is ${fmt(s.tapse, 1)} mm (${gT}), S′ is ${fmt(s.sPrime, 1)} cm/s (${gS}) and FAC is ${fmt(s.fac)}% (${gF})${cite('mukherjee2025')}. TAPSE and S′ measure the motion of a single point of the tricuspid annulus along one line; FAC is derived from the whole RV area in one plane.`,
      };
    }
    const L = lvState(s);
    const band = lvefBand(L.ef * 100, 'M'), bandF = lvefBand(L.ef * 100, 'F');
    const edvi = L.EDm / BSA;
    return {
      readouts: [
        { k: 'EDV', v: fmt(L.EDm), u: 'mL', flag: L.f > 0.02 },
        { k: 'ESV', v: fmt(L.ESm), u: 'mL', flag: L.f > 0.02 },
        { k: 'Stroke volume', v: fmt(L.svm), u: 'mL' },
        { k: 'LVEF', v: fmt(L.ef * 100), u: '%', flag: L.ef * 100 < 52 },
        { k: 'EDV index', v: fmt(edvi), u: 'mL/m²', flag: edvi > 74 },
      ],
      live: `By the biplane method of disks, the LVEF is ${fmt(L.ef * 100)}%, which is ${band === bandF ? band : `${band} in men and ${bandF} in women`}${cite('lang2015')}. In a patient with heart failure, this LVEF lies in the ${hfCategory(L.ef * 100)}${cite('heidenreich2022')}. ${L.f > 0.02 ? `<span class="k-red">With ${s.fore}% foreshortening of the apical views, the measured EDV is ${fmt(L.EDm)} mL, whereas the true EDV is ${fmt(L.edv)} mL.</span> The LVEF changes little, because the EDV and ESV decrease by the same fraction.` : `The EDV index is ${fmt(edvi)} mL/m² for a body surface area of ${BSA.toFixed(2)} m².`}`,
    };
  },
};
