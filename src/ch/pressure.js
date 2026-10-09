// Doppler hemodynamics, in two settings (pressMode). Flow and pressure, at the left: flow across a
// valve. The same flow passes the LV outflow tract, the aortic valve and the aorta, so the velocity
// at each level is the flow divided by the area there (continuity), and the pressure falls where
// the velocity rises (Bernoulli). From the LVOT to the vena contracta it falls by 4(V2² − V1²); in
// the aorta part of it returns as the jet slows (pressure recovery: 4V² × 2 EOA/AoA × (1 − EOA/AoA),
// Baumgartner 2017). PW Doppler before the valve and CW through it, on one scale. IVC, at the left:
// the subcostal long axis of the IVC and its M-mode, which give the RA pressure (src/ivcfig.js,
// ASE 2025). At the right in both settings, RV systolic pressure: the peak tricuspid regurgitation
// velocity (simplified Bernoulli) plus that RA pressure. The hidden chapter ch/ivc.js shows the IVC
// on a page of its own (SHOW_IVC in order.js).
import { Sheet, clamp, smooth, rng, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { Beat, cursor, rows, cols } from '../sev.js';
import { trvGrade } from '../norms.js';
import { drawSubcostal, drawMmode } from '../ivc2d.js';
import { defaultsOf, valuesOf, model as ivcModel, ivcClock, ivcDiagram, liveOf, readoutsOf, boxLines } from '../ivcfig.js';
import { reducedMotion } from '../state.js';

const ET = 0.292;            // s, LV ejection time (Alhakak 2025 mean); held constant here
const RRs = 0.857;
const P_AO = 120;            // mmHg, the aortic systolic pressure: the circulation holds it, the LV rises above it
// the outflow envelope over ejection, and the means of it (K) and of its square (K2) over ejection
const shape = (t) => {
  const u = (((t % RRs) + RRs) % RRs) / ET;
  return u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.8) : 0;
};
const [K, K2] = (() => {
  let a = 0, b = 0;
  for (let i = 0; i < 400; i++) { const s = Math.pow(Math.sin(Math.PI * ((i + 0.5) / 400)), 0.8); a += s; b += s * s; }
  return [a / 400, b / 400];
})();
export const BSA = Math.sqrt((175 * 80) / 3600);   // m², Mosteller, 175 cm and 80 kg
const areaOf = (d) => Math.PI * (d / 2) ** 2;

// the IVC setting's own keys for the estimate's inputs (ivcfig.js)
const CAVA = { D: 'cavaD', sniff: 'cavaSniff', quiet: 'cavaQuiet', breath: 'cavaBreath', sec: 'cavaSec' };
/**
 * The RA pressure that the RVSP adds: the IVC's estimate (3, 8 or 15 mmHg), or null where the IVC
 * gives no single value (ventilation, with secondary signs that say normal or raised).
 */
const rapOf = (s) => ivcModel(valuesOf(s, CAVA)).est.rap;
/**
 * The IVC that each RA pressure button sets: 1.8 cm with 60% collapse on a sniff (3 mmHg), 2.4 cm
 * with 60% (indeterminate; with unclear secondary signs, 8 mmHg), 2.4 cm with 30% (15 mmHg).
 */
const PRESET = {
  3: { cavaD: 1.8, cavaSniff: 60, cavaBreath: 'sniff', cavaSec: 'unclear' },
  8: { cavaD: 2.4, cavaSniff: 60, cavaBreath: 'sniff', cavaSec: 'unclear' },
  15: { cavaD: 2.4, cavaSniff: 30, cavaBreath: 'sniff', cavaSec: 'unclear' },
};

/** Flow across the valve at peak flow (areas cm², velocities m/s, pressures mmHg), and the RVSP (null with no single RA pressure). */
export function flow(s) {
  const a1 = areaOf(s.lvotD), a3 = areaOf(s.aoD);
  // the valve's effective orifice: a valve wider than the outflow tract does not narrow the flow
  const a2 = Math.min(s.valveA, a1);
  const q = s.sv / (ET * K);                           // mL/s at peak flow
  const v1 = q / a1 / 100, v2 = q / a2 / 100, v3 = q / a3 / 100;
  const dp = 4 * (v2 * v2 - v1 * v1);                  // LVOT to the vena contracta
  const x = a2 / a3;
  const pr = 4 * v2 * v2 * 2 * x * (1 - x);            // returns in the aorta
  const p3 = P_AO, p2 = p3 - pr, p1 = p2 + dp;
  const grad = 4 * s.trV ** 2, rap = rapOf(s);
  return {
    a1, a2, a3, q, v1, v2, v3, vti1: s.sv / a1, vti2: s.sv / a2, dp, mg: dp * K2, pr, p1, p2, p3,
    vr: v1 / v2, wide: s.valveA >= a1, rap, grad, rvsp: rap === null ? null : grad + rap,
  };
}

// ---------------------------------------------------------------- the tube, in cm along its axis
// The LVOT, the cusps hinged at the annulus (XV of the length), the flow that converges to the
// vena contracta just past their tips, and the jet that widens until it meets the aortic wall.
// R: the radius of the stream at each step; V: the volume of the stream up to it (mL).
function tubeOf(F, L) {
  const r1 = Math.sqrt(F.a1 / Math.PI), r2 = Math.sqrt(F.a2 / Math.PI), r3 = Math.sqrt(F.a3 / Math.PI);
  const xv = 0.4 * L, cl = r1 * 1.15;
  const tip = Math.sqrt(Math.max(0, cl * cl - (r1 - r2) ** 2));
  const xvc = xv + tip + 0.35 * r2;
  const xc0 = xv - 1.2 * r1;
  const xre = Math.min(L * 0.96, xvc + Math.max(2.5, 5 * Math.abs(r3 - r2)));
  const N = 240, dx = L / N, R = new Float32Array(N + 1), V = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const x = i * dx;
    let r;
    if (x <= xc0) r = r1;
    else if (x <= xvc) r = r1 + (r2 - r1) * smooth((x - xc0) / (xvc - xc0));
    else if (x <= xre) r = r2 + (r3 - r2) * smooth((x - xvc) / (xre - xvc));
    else r = r3;
    R[i] = r;
    if (i) V[i] = V[i - 1] + Math.PI * ((R[i - 1] + r) / 2) ** 2 * dx;
  }
  return { L, r1, r2, r3, xv, cl, xvc, xc0, xre, N, dx, R, V };
}
const rAt = (T, x) => {
  const f = clamp(x / T.dx, 0, T.N), i = Math.min(T.N - 1, Math.floor(f));
  return T.R[i] + (T.R[i + 1] - T.R[i]) * (f - i);
};
/** The axial position (cm) of the volume coordinate xi (mL). */
const xOf = (T, xi) => {
  let lo = 0, hi = T.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T.V[m] <= xi) lo = m; else hi = m; }
  const dv = T.V[hi] - T.V[lo];
  return (lo + (dv > 0 ? (xi - T.V[lo]) / dv : 0)) * T.dx;
};
/** Velocity (m/s) along the axis at peak flow. */
const vAt = (T, F, x) => { const r = rAt(T, x); return F.q / (Math.PI * r * r) / 100; };
/** Static pressure (mmHg) along the axis at peak flow: Bernoulli to the vena contracta, then recovery. */
const pAt = (T, F, x) => {
  if (x <= T.xvc) { const v = vAt(T, F, x); return F.p1 - 4 * (v * v - F.v1 * F.v1); }
  return F.p2 + F.pr * smooth(clamp((x - T.xvc) / (T.xre - T.xvc), 0, 1));
};

// ---------------------------------------------------------------- the beat and the blood
// Each particle moves by the same volume as every other in the same time, so the flow is the same
// at every level and a particle's speed is the flow divided by the area of the stream where it is.
// LAMBDA slows the travel for the eye: cm drawn per cm of blood travel.
const LAMBDA = 0.06;
const beat = new Beat(RRs * 1000);
const NP = 240;
const parts = (() => {
  const r = rng(31), out = [];
  for (let i = 0; i < NP; i++) out.push({ f: (i + r()) / NP, s: r() * 2 - 1 });
  return out;
})();
let lastT = null;

function advance(dt, s) {
  if (!st) return;
  const F = flow(s), T = lastT;
  if (!T) return;
  const t = beat.t / 1000;
  const dv = LAMBDA * F.q * shape(t) * dt;            // mL that every level passes in this frame
  const vol = T.V[T.N];
  for (const p of parts) { p.f += dv / vol; if (p.f >= 1) p.f -= 1; }
}

let sheet = null, st = null, setState = null, dg = null;
const panels = ivcClock();   // the clock of the IVC's panels (ivcfig.js)

/** The valve's opening, 0 (shut) to 1 (open to its area), through the beat. */
const openAt = (t) => smooth(clamp(t / 0.035, 0, 1)) * smooth(clamp((ET - t) / 0.035, 0, 1));

function drawFlow(sh, t, F, B, narrow) {
  const { ctx } = sh;
  const s = narrow ? 0.85 : 1;
  let y = B.y + (narrow ? 22 : 44);
  sh.text('Flow', B.x, y, { size: 26 * s });
  const eqs = narrow
    ? [`A × V = ${F.q.toFixed(0)} mL/s at every level`, `A × V = ${F.q.toFixed(0)} mL/s everywhere`, `${F.q.toFixed(0)} mL/s everywhere`]
    : ['A × V: the same at every level', 'A × V the same everywhere', 'A × V constant'];
  const eq = sh.fit(eqs, B.w - (narrow ? 70 : 90), { family: MONO, weight: 500, size: 12 }, 0.8);
  sh.text(eq.str, B.x + (narrow ? 70 : 90), y - 2, { family: MONO, weight: 500, size: eq.size });
  y += narrow ? 10 : 18;

  // ---- the tube: labels above, the stream, the areas and velocities below
  const tubeH = narrow ? clamp(B.h * 0.27, 66, 104) : clamp(B.h * 0.24, 112, 184);
  const xs0 = B.x + 6, xs1 = B.x + B.w - 6;
  const inner = tubeH - (narrow ? 30 : 40);            // height for the widest root, 5 cm (4.5 cm and its sinuses)
  const k = Math.min(inner / 5, (xs1 - xs0) / 9);      // px per cm, the same along and across
  const L = (xs1 - xs0) / k;
  const T = tubeOf(F, L);
  lastT = T;
  // the levels' names on a row above the tube, their area and velocity on a row below it
  const top = y + (narrow ? 12 : 16);
  const yc = top + 6 + inner / 2;
  const X = (x) => xs0 + x * k;
  const tb = beat.t / 1000, open = beat.live ? openAt(tb) : 1;
  // walls: the LVOT, then the aortic root with a slight bulge of the sinuses past the annulus
  const wall = (sign, seed) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * L;
      let r = x < T.xv ? T.r1 : T.r3 * (1 + 0.1 * Math.exp(-(((x - T.xv - 0.9 * T.r3) / (0.8 * T.r3)) ** 2)));
      if (x >= T.xv && x < T.xv + 0.25) r = T.r1 + (r - T.r1) * smooth((x - T.xv) / 0.25);
      pts.push([X(x), yc + sign * r * k]);
    }
    sh.curve(pts, { width: 1.4, rough: 0.4, seed });
    const band = new Path2D();
    band.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) band.lineTo(p[0], p[1]);
    for (let i = pts.length - 1; i >= 0; i--) band.lineTo(pts[i][0], pts[i][1] + sign * 8);
    band.closePath();
    sh.hatch(band, 0.5, 4.2, t.ink2, 0.7, seed + 5, 0.45);
  };
  wall(-1, 13);
  wall(1, 14);
  // the cusps: hinged at the annulus, their tips open to the orifice and meet on the axis when shut
  const rt = T.r2 * open;
  const tdx = Math.sqrt(Math.max(0, T.cl * T.cl - (T.r1 - rt) ** 2));
  for (const sign of [-1, 1]) {
    const hx = X(T.xv), hy = yc + sign * T.r1 * k, tx = X(T.xv + tdx), ty = yc + sign * rt * k;
    const mx = (hx + tx) / 2 + 2, my = (hy + ty) / 2 + sign * Math.min(6, 0.18 * T.cl * k);
    sh.curve([[hx, hy], [mx, my], [tx, ty]], { width: 2, rough: 0.35, seed: sign > 0 ? 17 : 18 });
  }
  // the blood: a short streak along the flow, as long as the speed
  const flowNow = beat.live ? shape(tb) : 1;
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  const vol = T.V[T.N];
  for (const p of parts) {
    const x = xOf(T, p.f * vol), r = rAt(T, x);
    const px = X(x), py = yc + p.s * r * k * 0.9;
    const len = Math.min(narrow ? 16 : 26, 1.5 + vAt(T, F, x) * flowNow * (narrow ? 3 : 5));
    ctx.beginPath();
    ctx.moveTo(px - len, py);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.restore();
  // the three levels: their names above, area and velocity below
  const lv = [
    { x: X(Math.max(T.xc0 * 0.5, 0.6)), name: 'LVOT', a: F.a1, v: F.v1 },
    { x: X(T.xvc), name: F.wide ? 'valve (open wide)' : 'valve', a: F.a2, v: F.v2 },
    { x: X((T.xre + L) / 2), name: 'aorta', a: F.a3, v: F.v3 },
  ];
  const rMax = Math.max(T.r1, T.r3 * 1.1) * k;
  const bot = yc + inner / 2 + (narrow ? 14 : 18);
  const nameY = Math.max(top, yc - rMax - (narrow ? 8 : 10));
  const valY = Math.min(bot, yc + rMax + (narrow ? 14 : 18));
  const fsz = narrow ? 10 : 11.5;
  const valveInk = F.v2 >= 4 ? t.flag : t.accent;
  // area and velocity under each level: in full where the three fit side by side, else as two
  // numbers with the units once at the right
  const lo = { family: MONO, weight: 500, size: fsz };
  const forms = [
    (l) => `${l.a.toFixed(2)} cm² · ${l.v.toFixed(2)} m/s`,
    (l) => `${l.a.toFixed(2)} · ${l.v.toFixed(2)}`,
    (l) => `${l.a.toFixed(1)} · ${l.v.toFixed(1)}`,
  ];
  const fits = (form) => {
    const w = lv.map((l) => sh.measure(form(l), lo));
    const c0 = lv[1].x - w[1] / 2, c1 = lv[1].x + w[1] / 2;
    return xs0 + w[0] + 10 < c0 && c1 + 10 < xs1 - w[2];
  };
  const fi = narrow ? 2 : forms.findIndex(fits);
  const form = forms[fi < 0 ? 2 : fi];
  for (const [i, l] of lv.entries()) {
    const align = i === 0 ? 'left' : i === 2 ? 'right' : 'center';
    const ax = i === 0 ? xs0 : i === 2 ? xs1 : l.x;
    sh.text(narrow && i === 1 ? 'valve' : l.name, ax, nameY, { size: (narrow ? 14 : 16) * s, color: t.ink2, align });
    sh.text(form(l), ax, valY, { ...lo, color: i === 1 ? valveInk : t.ink, align });
  }
  const units = fi !== 0;
  if (units) sh.text('cm² · m/s', xs1, valY + 12, { family: MONO, weight: 400, size: 9, color: t.ink3, align: 'right' });
  y = bot + (units ? 16 : narrow ? 16 : 10);

  // ---- three strips under the tube, on its axis: flow, velocity, pressure at peak flow
  const sH = narrow ? clamp(B.h * 0.07, 22, 30) : clamp(B.h * 0.075, 34, 56);
  const rowH = narrow ? 11 : 13;
  const xs = lv.map((l) => l.x);
  const vTop = Math.max(2, Math.ceil(F.v2 * 1.15));
  const pTop = Math.max(160, Math.ceil((F.p1 + 10) / 40) * 40);
  const strips = [
    { j: 0, name: 'flow, mL/s', lo: 0, hi: 600, f: () => F.q, vals: [F.q, F.q, F.q].map((v) => v.toFixed(0)) },
    { j: 1, name: 'velocity, m/s', lo: 0, hi: vTop, f: (x) => vAt(T, F, x), vals: [F.v1, F.v2, F.v3].map((v) => v.toFixed(v < 10 ? 2 : 1)) },
    { j: 2, name: 'pressure, mmHg', lo: 0, hi: pTop, f: (x) => pAt(T, F, x), vals: [F.p1, F.p2, F.p3].map((v) => v.toFixed(0)) },
  ].slice(narrow ? 1 : 0);
  for (const S of strips) {
    const j = S.j;
    const y0 = y + rowH, y1 = y0 + sH;
    sh.text(S.name, xs0, y + rowH - 3, { family: MONO, weight: 400, size: narrow ? 9 : 10, color: t.ink3 });
    for (const [i, v] of S.vals.entries()) {
      if (i === 0) continue;   // the first value sits at the strip's left, after its name
      sh.text(v, xs[i], y + rowH - 3, { family: MONO, weight: 500, size: narrow ? 9.5 : 11, color: S.j > 0 && i === 1 ? valveInk : t.ink, align: i === 2 ? 'right' : 'center' });
    }
    const nameW = sh.measure(S.name, { family: MONO, weight: 400, size: narrow ? 9 : 10 });
    sh.text(S.vals[0], xs0 + nameW + 8, y + rowH - 3, { family: MONO, weight: 500, size: narrow ? 9.5 : 11, color: t.ink });
    ctx.save();
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xs0, y1); ctx.lineTo(xs1, y1); ctx.stroke();
    ctx.strokeStyle = j === 0 ? t.ink2 : j === 1 ? t.accent : t.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * L, v = S.f(x);
      const py = y1 - clamp((v - S.lo) / (S.hi - S.lo), 0, 1) * (sH - 2);
      if (i) ctx.lineTo(X(x), py); else ctx.moveTo(X(x), py);
    }
    ctx.stroke();
    ctx.restore();
    y = y1 + (narrow ? 4 : 8);
  }

  // ---- Doppler: PW before the valve and CW through it, side by side on one scale
  const foot = narrow ? 0 : 22;
  const dy = y + (narrow ? 2 : 6), dh = B.y + B.h - dy - foot - (narrow ? 2 : 10);
  if (dh < 50) return;
  const gap = 10, pw = (B.w - gap) / 2;
  const scale = Math.max(1.5, Math.ceil(F.v2 * 1.15 * 2) / 2);
  const step = scale > 6 ? 2 : scale > 3 ? 1 : 0.5;
  const beats = 2;
  const sig = [
    { title: 'PW · LVOT', fn: (u) => -F.v1 * shape(u * beats * RRs), v: F.v1, vti: F.vti1, mode: 'pw', key: `p8lvot|${F.v1.toFixed(3)}|${scale}`, seed: 3 },
    { title: 'CW · valve', fn: [(u) => -F.v2 * shape(u * beats * RRs), (u) => -F.v1 * shape(u * beats * RRs)], v: F.v2, vti: F.vti2, mode: 'cw', key: `p8av|${F.v2.toFixed(3)}|${F.v1.toFixed(3)}|${scale}`, seed: 5 },
  ];
  for (const [i, S] of sig.entries()) {
    const px = B.x + i * (pw + gap);
    panel(ctx, px, dy, pw, dh, S.title);
    const box = { x: px + 4, y: dy + 22, w: pw - 38, h: dh - 26 };
    spectral(ctx, box, { fn: S.fn, scale, base: 0.1, mode: S.mode, broad: S.mode === 'pw' ? 0.08 : 0.35, gain: S.mode === 'cw' ? [1, 0.9] : undefined, key: S.key, seed: S.seed });
    vscale(ctx, box, scale, 0.1, step);
    const kk = (box.h * 0.9) / scale, yb = box.y + box.h * 0.1;
    const yp = yb + S.v * kk;
    const span = box.w / beats;
    caliper(ctx, box.x + span * 0.18, yp, box.x + span * 0.18 + 26, yp, { solid: true });
    // the reading on the panel's title line, clear of both beats' spectra
    ctx.save();
    ctx.font = `500 ${narrow ? 10 : 11}px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.textAlign = 'right';
    const vti = `VTI ${S.vti.toFixed(S.vti < 100 ? 1 : 0)} cm`;
    const titleW = ctx.measureText(S.title).width + 24;
    const full = `${S.v.toFixed(2)} m/s · ${vti}`;
    ctx.fillText(ctx.measureText(full).width + titleW < pw - 8 ? full : `${S.v.toFixed(2)} m/s`, px + pw - 8, dy + 15);
    ctx.restore();
    if (beat.live) cursor(ctx, box, beat.sweep);
  }
  if (!narrow) {
    const sv = sh.fit([
      `stroke volume = ${F.a1.toFixed(2)} cm² × ${F.vti1.toFixed(1)} cm = ${F.a2.toFixed(2)} cm² × ${F.vti2.toFixed(1)} cm = ${st.sv.toFixed(0)} mL`,
      `${F.a1.toFixed(2)} × ${F.vti1.toFixed(1)} = ${F.a2.toFixed(2)} × ${F.vti2.toFixed(1)} = ${st.sv.toFixed(0)} mL`,
    ], B.w, { family: MONO, weight: 500, size: 12 }, 0.8);
    sh.text(sv.str, B.x, B.y + B.h - 10, { family: MONO, weight: 500, size: sv.size, color: t.ink2 });
  }
}

function drawPressure(sh, t, F, R, narrow) {
  const { ctx } = sh;
  const H = R.y + R.h, s = narrow ? 0.85 : 1;
  const rx = R.x, rw = R.w;
  let ry = R.y + (narrow ? 22 : 44);
  sh.text('Pressure', rx, ry, { size: 26 * s });
  sh.text('RVSP = 4 V² + RAP', rx + (narrow ? 104 : 130), ry - 2, { family: MONO, weight: 500, size: 12 });
  ry += narrow ? 10 : 22;
  // a phone lays the bar out from the bottom up (the sum on the last line, the scale and the bar
  // above it), and the CW panel takes the height that is left
  const yS = H - 6, bhN = 13, byN = yS - 15 - 13 - bhN;
  // a wide figure keeps the CW panel at 46% of its height while the bar block (title, bar,
  // scale, note: 180 px above the sum at H - 34) fits under it; a short one gives the panel less
  const tph = narrow ? Math.max(40, byN - 15 - 14 - ry) : Math.max(60, Math.min(R.h * 0.46, H - 214 - ry));
  panel(ctx, rx, ry, rw, tph, 'CW · TR JET');
  const trShape = (tt) => {
    // holosystolic: from mitral closure to just past aortic closure; fast rise, rounded top
    const u = ((((tt % RRs) + RRs) % RRs) - 0.02) / 0.4;
    return u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.45) : 0;
  };
  const tbox = { x: rx + 4, y: ry + 22, w: rw - 34, h: tph - 26 };
  const tscale = 5;
  spectral(ctx, tbox, { fn: (u) => -st.trV * trShape(u * 2 * RRs), scale: tscale, base: 0.12, mode: 'cw', broad: 0.5, key: `tr|${st.trV.toFixed(3)}`, seed: 5 });
  vscale(ctx, tbox, tscale, 0.12, 1);
  const tk = (tbox.h * 0.88) / tscale, tyb = tbox.y + tbox.h * 0.12;
  const pkx = tbox.x + (tbox.w / 2) * ((0.02 + 0.2) / RRs);
  caliper(ctx, pkx, tyb + st.trV * tk, pkx + 40, tyb + st.trV * tk, { solid: true });
  if (beat.live) cursor(ctx, tbox, beat.sweep);
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  // the reading on the panel's title line, clear of both beats' spectra
  ctx.textAlign = 'right';
  ctx.fillText(`${st.trV.toFixed(2)} m/s → 4V² = ${F.grad.toFixed(0)} mmHg`, rx + rw - 10, ry + 17);
  ctx.restore();

  // the RA pressure (the IVC gives it) under the RV-RA gradient: one bar that reads the RV systolic
  // pressure on a mmHg scale. A phone keeps the bar, its scale and the sum. Where the IVC gives no
  // single RA pressure, the bar holds the gradient alone.
  const rap = F.rap ?? 0;
  const iy = ry + tph + (narrow ? 14 : 34);
  const ih = H - iy - 30;   // the desktop layout: the height under the CW panel
  const bx0 = rx + (narrow ? 8 : 14), bx1 = rx + rw - (narrow ? 34 : 24);
  if (!narrow) sh.text('RV systolic pressure', bx0, iy + 12, { size: 17 * s, color: t.ink2 });
  const top = Math.max(60, Math.ceil((rap + F.grad + 6) / 20) * 20);
  const X = (mm) => bx0 + (mm / top) * (bx1 - bx0);
  const fs = narrow ? 10.5 : 12;
  const bh = narrow ? bhN : 24, by = narrow ? byN : iy + 54;
  const seg = (a, b, seed, color, fill) => {
    const r = new Path2D();
    r.rect(X(a), by, Math.max(1, X(b) - X(a)), bh);
    if (fill) sh.hatch(r, 0.8, 3.6, fill, 0.8, seed, 0.6);
    sh.rect(X(a), by, Math.max(1, X(b) - X(a)), bh, { width: 1.3, rough: 0.5, seed, stroke: color });
  };
  if (F.rap !== null) seg(0, rap, 33, t.ink2, t.ink2);
  seg(rap, rap + F.grad, 34, t.flag, null);
  // the scale under the bar, its unit at the right end
  ctx.save();
  ctx.strokeStyle = t.ink3;
  ctx.fillStyle = t.ink3;
  ctx.font = `400 ${narrow ? 9 : 10}px ${MONO}`;
  ctx.textAlign = 'center';
  const yn = by + bh + (narrow ? 13 : 18);
  for (let mm = 0; mm <= top; mm += 20) {
    ctx.beginPath(); ctx.moveTo(X(mm), by + bh + 2); ctx.lineTo(X(mm), by + bh + (narrow ? 4 : 7)); ctx.stroke();
    ctx.fillText(String(mm), X(mm), yn);
  }
  ctx.textAlign = 'left';
  ctx.fillText('mmHg', bx1 + (narrow ? 12 : 6), narrow ? yn : by + bh / 2 + 4);
  ctx.restore();
  // the two parts named above the bar: RAP at its left end, the gradient at the middle of its part
  const lr = F.rap === null ? 'RAP –' : `RAP ${F.rap}`, lg = `4V² ${F.grad.toFixed(0)}`;
  const wr = sh.measure(lr, { family: MONO, weight: 500, size: fs });
  const wg = sh.measure(lg, { family: MONO, weight: 500, size: fs });
  sh.text(lr, X(0), by - 5, { family: MONO, weight: 500, size: fs, color: t.ink2 });
  const gx = Math.max(X(0) + wr + 10 + wg / 2, (X(rap) + X(rap + F.grad)) / 2);
  sh.text(lg, Math.min(gx, bx1 - wg / 2), by - 5, { family: MONO, weight: 500, size: fs, color: t.flag, align: 'center' });
  if (!narrow) sh.text(st.pressMode === 'ivc' ? 'RA pressure from the IVC at the left' : 'RA pressure from the IVC (IVC setting)', bx0, by + bh + 46, { size: 15 * s, color: t.ink3 });
  const sum = sh.fit(F.rap === null ? [
    `ventilation: no single RA pressure  ·  RVSP ${F.grad.toFixed(0)} + RAP`,
    `RVSP ${F.grad.toFixed(0)} + RAP (no single value)`,
  ] : [
    `RA pressure ${F.rap} mmHg  ·  RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
    `RAP ${F.rap} · RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
  ], R.x + R.w + (narrow ? 4 : 10) - bx0, { family: MONO, weight: 500, size: 12 }, 0.85);
  const ys = narrow ? yS : iy + ih - 4;
  sh.text(sum.str, bx0, ys, { family: MONO, weight: 500, size: sum.size, color: t.ink });
}

/** The IVC setting's left half: the subcostal long axis with its caliper, and the IVC on M-mode. */
function drawIvc(sh, t, F, B, narrow) {
  const { ctx } = sh;
  const v = valuesOf(st, CAVA), m = ivcModel(v), P = panels.frame(v, m), e = m.est;
  const s = narrow ? 0.85 : 1;
  let y = B.y + (narrow ? 22 : 44);
  sh.text('IVC', B.x, y, { size: 26 * s });
  const res = e.rap === null ? `${e.level} RA pressure` : `RA pressure ${e.rap} mmHg`;
  const eq = sh.fit([`${res}, from the diameter and the collapse`, res], B.w - (narrow ? 56 : 70), { family: MONO, weight: 500, size: 12 }, 0.8);
  sh.text(eq.str, B.x + (narrow ? 56 : 70), y - 2, { family: MONO, weight: 500, size: eq.size });
  y += narrow ? 10 : 18;
  const box = { x: B.x, y, w: B.w, h: B.y + B.h - y };
  // a phone puts the two side by side; a wider figure stacks them, the long axis on top
  const [a, b] = narrow ? cols(box, [1.15, 1], 8) : rows(box, [1.5, 1], 12);
  drawSubcostal(ctx, a, P.sc, { box: boxLines(v, m, !narrow) });
  drawMmode(ctx, b, P.p, P.u);
}

function draw(sh, t) {
  const W = sh.w, H = sh.h;
  const narrow = W < 700;
  const F = flow(st);
  const left = st.pressMode === 'ivc' ? drawIvc : drawFlow;
  if (narrow) {
    // a phone stacks the two: the flow or the IVC takes the upper 60%, the pressure the rest
    const split = Math.round(H * 0.6);
    left(sh, t, F, { x: 12, y: 0, w: W - 24, h: split - 6 }, true);
    drawPressure(sh, t, F, { x: 12, y: split, w: W - 24, h: H - split }, true);
  } else {
    const colW = W / 2;
    left(sh, t, F, { x: 26, y: 0, w: colW - 44, h: H - 10 }, false);
    drawPressure(sh, t, F, { x: colW + 18, y: 0, w: colW - 44, h: H }, false);
  }
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const DEF = { sv: 70, lvotD: 2.0, valveA: 2.5, aoD: 3.0, trV: 2.4, rap: 3, pressMode: 'flow', ...defaultsOf(CAVA) };

// ---------------------------------------------------------------- the tour
// Flow and pressure: the valve narrows to 0.7 cm² (0.5-6 s), then the aorta to 2.2 cm (7.2-9.5 s),
// then the peak TR velocity rises to 3.0 m/s (10.2-12.5 s). The IVC from 13.5 s: the IVC widens to
// 2.4 cm (15-17.5 s; indeterminate past 2.1 cm, 8 mmHg), then its collapse falls to 30% (18.5-21 s;
// 15 mmHg below 50%), and the RVSP rises with the RA pressure. The tour does not set rap: the RA
// pressure follows the IVC (onState).
const ramp = (tt, t0, len, a, b, q) => Math.round((a + (b - a) * clamp((tt - t0) / len, 0, 1)) / q) * q;
const IVC_AT = 13.5;
function tourState(tt) {
  return {
    sv: 70, lvotD: 2.0,
    valveA: Math.round(ramp(tt, 0.5, 5.5, 2.5, 0.7, 0.05) * 100) / 100,
    aoD: Math.round(ramp(tt, 7.2, 2.3, 3.0, 2.2, 0.1) * 10) / 10,
    trV: Math.round(ramp(tt, 10.2, 2.3, 2.4, 3.0, 0.05) * 100) / 100,
    pressMode: tt >= IVC_AT ? 'ivc' : 'flow',
    ...defaultsOf(CAVA),
    cavaD: Math.round(ramp(tt, 15, 2.5, 1.8, 2.4, 0.1) * 10) / 10,
    cavaSniff: ramp(tt, 18.5, 2.5, 60, 30, 5),
  };
}

export default {
  key: 'pressure',
  part: 'hemodynamics',
  title: 'Doppler hemodynamics',
  nav: 'Pressure',
  dwell: 23,
  defaults: { ...DEF },
  format: {
    sv: (v) => `${Math.round(v)} mL`,
    lvotD: (v) => `${v.toFixed(2)} cm`,
    valveA: (v) => `${v.toFixed(2)} cm²`,
    aoD: (v) => `${v.toFixed(1)} cm`,
    trV: (v) => `${v.toFixed(2)} m/s`,
  },
  watch: Object.keys(DEF),
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) {
    st = state;
    setState = set;
    dg = ivcDiagram({ host: document.getElementById('ivc-ase'), K: CAVA, get: () => st, set: (p) => setState(p), live: '#ch-pressure .live', hv: false });
  },
  // on the way in and out, the IVC diagram's next drawing sets the baseline: no flash for changes made elsewhere
  enter() { dg?.reset(); },
  leave() { dg?.reset(); },
  // One RA pressure in the chapter. An IVC that gives 3, 8 or 15 mmHg lights its button (none when
  // the IVC gives no single value); a button sets an IVC that gives its value (PRESET).
  onState(s, ch) {
    const rap = rapOf(s);
    if (Object.values(CAVA).some((k) => k in ch)) { if (s.rap !== rap) setState({ rap }); }
    else if ('rap' in ch && s.rap !== rap && PRESET[s.rap]) setState({ ...PRESET[s.rap] });
  },
  pulse: (s) => (s.pressMode === 'ivc' ? panels.pulse() : beat.pulse()),
  // the blood moves and the Doppler cursors sweep on the beat; the IVC breathes on its own clock
  anim(dt, s) {
    if (beat.tick(dt, true)) { advance(dt, s); if (sheet) sheet.dirty = true; }
    if (s.pressMode === 'ivc' && panels.tick(dt) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set(tourState(0)); },
  tourTick(tt, set) { set(tourState(tt)); },
  /** The tour time at which tourTick gives state s (the first such time); else the start of its setting. */
  tourAt(s) {
    const dwell = 23;
    for (let tt = 0; tt <= dwell; tt += 0.05) {
      const p = tourState(tt);
      if (Object.keys(p).every((k) => s[k] === p[k])) return Math.round(tt * 100) / 100;
    }
    return s.pressMode === 'ivc' ? IVC_AT : 0;
  },
  text(s, { cite }) {
    const F = flow(s);
    const mode = s.pressMode === 'ivc' ? 'ivc' : 'flow';
    // the controls and the diagram of the setting shown
    const shown = (art) => { for (const el of art.querySelectorAll('[data-press]')) el.hidden = el.dataset.press !== mode; };
    const g = trvGrade(s.trV);
    const rvspIs = F.rap === null
      ? `the RV–RA pressure gradient is 4 × ${fmt(s.trV, 2)}² = ${fmt(F.grad)} mmHg. Under ventilation with secondary signs, the IVC gives no single RA pressure to add${cite('mukherjee2025')}.`
      : `the RV–RA pressure gradient is 4 × ${fmt(s.trV, 2)}² = ${fmt(F.grad)} mmHg, and with an RA pressure of ${F.rap} mmHg, estimated from the IVC, the RV systolic pressure is ${fmt(F.rvsp)} mmHg${cite('quinones2002')}.`;
    const rvspRead = { k: 'RV systolic pressure', v: F.rvsp === null ? '–' : fmt(F.rvsp), u: F.rvsp === null ? '' : 'mmHg', flag: s.trV >= 2.8 };
    if (mode === 'ivc') {
      const v = valuesOf(s, CAVA), m = ivcModel(v);
      return {
        readouts: [...readoutsOf(v, m), { k: 'Peak TR velocity', v: fmt(s.trV, 2), u: 'm/s', flag: s.trV >= 2.8 }, rvspRead],
        live: `${liveOf(v, m, cite, { hv: false })} With a peak TR velocity of ${fmt(s.trV, 2)} m/s, ${rvspIs}`,
        extra: (art) => { shown(art); dg?.render(v, m); },
      };
    }
    const prox = F.v1 > 1.5;
    return {
      readouts: [
        { k: 'LVOT velocity', v: fmt(F.v1, 2), u: 'm/s', flag: prox },
        { k: 'Valve velocity', v: fmt(F.v2, 2), u: 'm/s', flag: F.v2 >= 4 },
        { k: 'Velocity ratio', v: fmt(F.vr, 2), u: '', flag: F.vr <= 0.25 },
        { k: 'Peak gradient', v: fmt(F.dp), u: 'mmHg', flag: F.dp >= 64 },
        { k: 'Pressure recovery', v: fmt(F.pr), u: 'mmHg', flag: s.aoD < 3 && F.pr >= 5 },
        rvspRead,
      ],
      live: `${F.wide
        ? `The valve opens as wide as the LVOT, so the flow of ${fmt(F.q)} mL/s at its peak keeps its velocity of ${fmt(F.v1, 2)} m/s through the valve.`
        : `The same flow, ${fmt(F.q)} mL/s at its peak, passes the LVOT (${fmt(F.a1, 2)} cm²) and the valve (${fmt(F.a2, 2)} cm²), so the velocity rises ${fmt(F.v2 / F.v1, 1)} times, from ${fmt(F.v1, 2)} to ${fmt(F.v2, 2)} m/s, as the area falls${cite('baumgartner2017')}.`
      } From the LVOT to the narrowest part of the jet the pressure falls by 4 × (${fmt(F.v2, 2)}² − ${fmt(F.v1, 2)}²) = ${fmt(F.dp)} mmHg; in the ${fmt(s.aoD, 1)} cm aorta the jet slows and the pressure rises again by ${fmt(F.pr)} mmHg (pressure recovery)${s.aoD < 3 ? ', so in an aorta under 3.0 cm the Doppler gradient can exceed the drop from the LV to the aorta' : ''}${cite('baumgartner2017')}.${prox ? ` <span class="k-red">The LVOT velocity is above 1.5 m/s, so the gradient must include it</span>${cite('baumgartner2017')}.` : ''} A peak TR velocity of ${fmt(s.trV, 2)} m/s is ${g}${cite('mukherjee2025')}; ${rvspIs}`,
      extra: (art) => shown(art),
    };
  },
};
