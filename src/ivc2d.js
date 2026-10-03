// Parametric views of the IVC for the IVC chapter, drawn to scale in cm as the views of echo2d.js are:
// the subcostal long axis of the IVC with the hepatic vein and the RA, its M-mode, hepatic vein
// PW Doppler, and the IVC and the abdominal aorta side by side. One breathing model (dAt) drives
// the 2D view, the M-mode and the IVC of the pair, so all three show the same diameter at the
// same moment. Echogenicity and speckle come from bmode.js.
import { SC, panel, caliper, tagBox, spectral, vscale } from './scope.js';
import { frame, finish, measures } from './echo2d.js';
import { bmode, mmode, DB } from './bmode.js';
import { EV } from './cyclemodel.js';
import { MONO, SANS, clamp } from './sketch.js';
import { note as stripNote } from './sev.js';

export const RR = 857;           // ms, one beat at 70 a minute
const BREATH = 4000;             // ms, one quiet breath (15 a minute): inspiration, expiration, pause
/** The length of each breathing program (ms): two breaths, and then a sniff in 'sniff'. */
export const SEQ = { sniff: 10000, quiet: 8000, ppv: 8000 };
const SNIFF = 8350;              // ms, the deepest point of the sniff
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Quiet inspiration, 0 at end-expiration to 1 at the end of inspiration (1.5 s in, 1.5 s out). */
function insp(t) {
  const u = (((t % BREATH) + BREATH) % BREATH) / 1000;
  if (u < 1.5) return smooth(u / 1.5);
  if (u < 3) return 1 - smooth((u - 1.5) / 1.5);
  return 0;
}
/** The sniff, 0 to 1: a fast inspiration (0.3 s) and a slower return (0.9 s). */
function sniffAt(t) {
  if (t < SNIFF - 300 || t > SNIFF + 900) return 0;
  return t < SNIFF ? smooth((t - (SNIFF - 300)) / 300) : 1 - smooth((t - SNIFF) / 900);
}

/**
 * The IVC diameter (cm) at time t (ms) of the program. p: { D: end-expiratory diameter (cm),
 * sniff, quiet: collapse (%), mode: 'sniff' | 'quiet' | 'ppv' }. In 'sniff', the quiet breaths
 * before the sniff narrow the IVC by the smaller of the two collapses. Under positive-pressure
 * ventilation the figure draws no collapse: the collapse does not estimate the RA pressure there
 * (Mukherjee 2025). A small ripple follows the heartbeat.
 */
export function dAt(p, t, ripple = true) {
  const T = SEQ[p.mode] || SEQ.sniff;
  const tm = ((t % T) + T) % T;
  let k = 1;
  if (p.mode === 'quiet') k = 1 - (p.quiet / 100) * insp(tm);
  else if (p.mode === 'sniff') k = tm < 8000 ? 1 - (Math.min(p.quiet, p.sniff) / 100) * insp(tm) : 1 - (p.sniff / 100) * sniffAt(tm);
  const r = ripple ? 1 + 0.012 * Math.sin((tm / RR) * Math.PI * 2) : 1;
  return Math.max(0.05, p.D * k * r);
}
/** The breathing trace, 0 to 1 (a sniff to 1.6), and the name of what it shows now. */
export function respAt(mode, t) {
  const T = SEQ[mode] || SEQ.sniff;
  const tm = ((t % T) + T) % T;
  if (mode === 'sniff' && tm >= 8000) return { v: 1.6 * sniffAt(tm), name: sniffAt(tm) > 0.25 ? 'sniff' : 'expiration' };
  const v = insp(tm), u = (tm % BREATH) / 1000;
  const name = mode === 'ppv' ? (u < 1.5 ? 'ventilator inspiration' : 'expiration') : (u < 1.5 ? 'inspiration' : 'expiration');
  return { v, name };
}
/** Where the M-mode calipers sit (ms): the end-expiratory maximum and the minimum. */
export function caliperTimes(mode) {
  if (mode === 'sniff') return { max: 7600, min: SNIFF };
  if (mode === 'quiet') return { max: 3600, min: 5500 };
  return { max: 3600, min: null };
}

// ---------------------------------------------------------------- small geometry (cm)
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];
const ellipse = (c, rx, ry, n = 48) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]; });
/** A smooth open curve through points (Catmull-Rom), n points per span. */
function spline(pts, n = 8) {
  const out = [], N = pts.length, P = (i) => pts[clamp(i, 0, N - 1)];
  for (let i = 0; i < N - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[N - 1]);
  return out;
}
/** A tube of width w(u) (cm) along a center line; returns the two walls and the closed outline. */
function tube(line, w) {
  const n = line.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const nn = unit(perp(sub(line[Math.min(n - 1, i + 1)], line[Math.max(0, i - 1)])));
    const h = (typeof w === 'function' ? w(i / (n - 1)) : w) / 2;
    A.push(add(line[i], mul(nn, h)));
    B.push(add(line[i], mul(nn, -h)));
  }
  return { a: A, b: B, poly: [...A, ...B.slice().reverse()] };
}
const sliceX = (poly, x0, x1) => poly.filter((p) => p[0] >= x0 && p[0] <= x1);

/** A small white label on the image, kept inside it (as the tags of echo2d.js). */
function tag(ctx, F, text, p, o = {}) {
  const q = F.P(p), b = F.view.box;
  ctx.save();
  ctx.font = `600 ${o.size || 11}px ${SANS}`;
  const hw = ctx.measureText(text).width / 2 + 4;
  const x = clamp(q[0], b.x + hw, b.x + b.w - hw), y = clamp(q[1], b.y + 10, b.y + b.h - 10);
  ctx.fillStyle = o.color || 'rgba(214,222,226,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,10,12,0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  return { x0: x - hw, x1: x + hw, y0: y - 8, y1: y + 8 };
}
/** Scanner text in the calipers' yellow. */
function note(ctx, text, x, y, o = {}) {
  ctx.save();
  ctx.font = `500 ${o.size || 10.5}px ${MONO}`;
  ctx.fillStyle = o.color || SC.cal;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}
const textW = (ctx, text, size = 10.5) => { ctx.save(); ctx.font = `500 ${size}px ${MONO}`; const w = ctx.measureText(text).width; ctx.restore(); return w; };
/** The first of the forms that fits w px at the size given, else the last. */
const pick = (ctx, forms, w, size = 10.5) => forms.find((f) => textW(ctx, f, size) <= w) ?? forms[forms.length - 1];
/** The B-mode image of the items, clipped to the panel (as echo2d.js scan(); its own cache key). */
function image(ctx, F, items, key, t) {
  ctx.save();
  ctx.clip(F.clipBox);
  bmode(ctx, F.view, items, { t, live: true, key });
  ctx.restore();
}

// ---------------------------------------------------------------- the subcostal long axis
// The IVC runs through the liver, almost square to the beam, and opens into the RA at xJ; the
// hepatic vein joins it from the front, 0.9 cm from the RA; the diaphragm curves round the
// junction. The site of measurement is 1.8 cm from the RA (1 to 2 cm, Mitchell 2019), just
// below the hepatic vein (about 1 cm, Assavapokee 2024), and near the middle of the sector, so
// that the M-mode beam crosses the IVC at a right angle.
const SC_GEO = { depth: 15, deg: 76, near: 1.6, xJ: 1.3, site: 1.8, hvIn: 0.9 };
const axisY = (x) => 8.7 + 0.05 * x;

function subcostalItems(d, hvW, G = SC_GEO) {
  const xJ = G.xJ, x0 = -10;
  const line = Array.from({ length: 41 }, (_, i) => { const x = x0 + ((xJ + 0.7 - x0) * i) / 40; return [x, axisY(x)]; });
  // the IVC widens into the RA over its last 6 mm
  const flare = (u) => { const x = x0 + (xJ + 0.7 - x0) * u; return d * (1 + 0.55 * smooth((x - (xJ - 0.6)) / 1.3)); };
  const ivc = tube(line, flare);
  const raC = [xJ + 2.4, axisY(xJ) + 0.5];
  const ra = ellipse(raC, 2.5, 2.15), raOut = ellipse(raC, 2.72, 2.36);
  // the diaphragm: a bright band round the junction, liver on its left (caudal) side
  const dia = spline([[-1.6, 1.7], [-0.2, 3.1], [0.8, 4.9], [1.25, 6.8], [1.45, 8.7], [1.45, 10.4], [1.1, 12.3], [0.3, 14.3], [-0.6, 16.2]], 10);
  const liver = [[-14, 1.75], [-1.7, 1.75], ...dia.slice(1), [-0.6, 17], [-14, 17]];
  const heartSide = [[-1.6, 1.7], [12, 1.7], [12, 17], [-0.6, 17], ...dia.slice().reverse()];
  // the hepatic vein: from the IVC's front wall up toward the probe and to the left
  const xh = xJ - G.hvIn;
  const hvLine = spline([[xh, axisY(xh) - d / 2 + 0.25], [xh - 0.8, axisY(xh) - d / 2 - 1.1], [xh - 2.2, 5.0], [xh - 4.0, 4.1], [xh - 6.2, 3.6]], 8);
  const hv = tube(hvLine, (u) => hvW * (1 - 0.45 * u));
  const gapA = xh - hvW / 2 - 0.05, gapB = xh + hvW / 2 + 0.15;
  const items = [
    { polys: [liver], e: DB.liver },
    { polys: [heartSide], e: -12 },
    { polys: [raOut], e: DB.myo - 4 },
    { lines: [dia], e: 7, w: 0.2 },
    { polys: [ra], e: DB.blood, blood: true },
    { polys: [ivc.poly, hv.poly], e: DB.blood, blood: true },
    // the walls of the IVC: thin, bright where the beam meets them square
    { borders: [sliceX(ivc.a, -20, xJ - 0.3), sliceX(ivc.b, -20, gapA), sliceX(ivc.b, gapB, xJ - 0.2)], e: 0, spec: 8, w: 0.07 },
    { borders: [ra], e: DB.myo, spec: 6 },
  ];
  return { items, ivc, ra, raC, dia, hv, hvLine, line };
}

/**
 * The subcostal long axis of the IVC at diameter p.d (cm) now, with the caliper at the site and
 * the M-mode line through it. p: { d, D (end-expiration), hvW (cm), mode, phase, t }.
 */
export function drawSubcostal(ctx, box, p, o = {}) {
  const narrow = box.w < 250;
  const F = frame(ctx, box, SC_GEO.depth, o.title ?? (narrow ? 'SC · IVC' : 'SUBCOSTAL · IVC LONG AXIS'), { deg: SC_GEO.deg, near: SC_GEO.near });
  const S = subcostalItems(p.d, p.hvW);
  image(ctx, F, S.items, 'ivc-sc', p.t);
  // the site: 1.8 cm from the junction along the axis, the caliper square to the axis
  const xs = SC_GEO.xJ - SC_GEO.site, c = [xs, axisY(xs)];
  const ax = unit([1, 0.05]), nn = perp(ax);
  const A = add(c, mul(nn, -p.d / 2)), B = add(c, mul(nn, p.d / 2));
  const PA = F.P(A), PB = F.P(B), apex = F.P([0, 0]);
  // the M-mode line: the beam from the probe through the site
  const dir = unit(sub(F.P(c), apex));
  ctx.save();
  ctx.beginPath();
  ctx.clip(F.fan);
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(apex[0] + dir[0] * F.k * 2.2, apex[1] + dir[1] * F.k * 2.2);
  ctx.lineTo(apex[0] + dir[0] * F.k * (SC_GEO.depth - 0.4), apex[1] + dir[1] * F.k * (SC_GEO.depth - 0.4));
  ctx.stroke();
  ctx.restore();
  caliper(ctx, PA[0], PA[1], PB[0], PB[1], { solid: true, size: 3.5 });
  // the distance to the RA, under the IVC
  const yb = (q) => add(q, mul(nn, p.D / 2 + 0.55));
  const J = [SC_GEO.xJ, axisY(SC_GEO.xJ)];
  const L0 = F.P(yb(c)), L1 = F.P(yb(J));
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.85;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(L0[0], L0[1]); ctx.lineTo(L1[0], L1[1]); ctx.stroke();
  ctx.setLineDash([]);
  for (const q of [L0, L1]) { ctx.beginPath(); ctx.moveTo(q[0], q[1] - 3); ctx.lineTo(q[0], q[1] + 3); ctx.stroke(); }
  ctx.restore();
  const lab = narrow ? '1–2 cm' : '1–2 cm to RA';
  note(ctx, lab, L0[0] + 5, L0[1] + 13, { size: narrow ? 9.5 : 10.5 });
  // the diameter now, beside the caliper on the side away from the hepatic vein
  if (narrow) note(ctx, `${p.d.toFixed(1)} cm`, PB[0] - 4, PB[1] + 13, { align: 'right', size: 9.5 });
  else note(ctx, `${p.d.toFixed(1)} cm`, PA[0] - 6, (PA[1] + PB[1]) / 2 + 4, { align: 'right', size: 10.5 });
  // structures
  const lab2 = narrow ? 9.5 : 11;
  tag(ctx, F, 'IVC', [-3.6, axisY(-3.6)], { size: lab2 });
  tag(ctx, F, 'RA', S.raC, { size: lab2 });
  tag(ctx, F, narrow ? 'HV' : 'hepatic vein', S.hvLine[Math.round(S.hvLine.length * 0.62)], { size: lab2 });
  tag(ctx, F, 'liver', [-3.2, 11.8], { size: lab2 });
  if (!narrow) tag(ctx, F, 'diaphragm', [2.9, 3.6], { size: lab2 });
  // what the breath is doing, as the scanner's respiration channel names it
  if (p.phase) note(ctx, p.phase, box.x + 10, box.y + 34, { size: narrow ? 9.5 : 10.5 });
  if (!o.noBox) measures(ctx, F, o.box || [`end-expiration ${p.D.toFixed(1)} cm`]);
  finish(ctx, F);
  return F;
}

// ---------------------------------------------------------------- M-mode
/**
 * The IVC on M-mode through the breathing program of p.mode, with the calipers at the
 * end-expiratory maximum and at the minimum, and the breathing trace below. u: the sweep (0-1).
 */
export function drawMmode(ctx, box, p, u, o = {}) {
  const narrow = box.w < 250;
  const title = o.title ?? (narrow ? 'M-MODE · IVC' : 'M-MODE · IVC, SUBCOSTAL');
  panel(ctx, box.x, box.y, box.w, box.h, title);
  // the collapse on the title line, at the right, as a scanner shows a reading
  const col = p.mode === 'ppv' ? null : p.mode === 'quiet' ? p.quiet : p.sniff;
  const forms = col === null ? (narrow ? [] : ['collapse not used']) : narrow ? [`${col}%`] : [`collapse ${col}%`, `${col}%`];
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const room = box.w - 20 - ctx.measureText(title).width - 12;
  const reading = forms.find((f) => ctx.measureText(f).width <= room);
  if (reading) {
    ctx.fillStyle = SC.cal;
    ctx.textAlign = 'right';
    ctx.fillText(reading, box.x + box.w - 10, box.y + 17);
  }
  ctx.restore();
  const RESP = 26;
  const B = { x: box.x + 6, y: box.y + 24, w: box.w - 40, h: box.h - 30 - RESP };
  const T = SEQ[p.mode];
  const q = { D: Math.round(p.D * 20) / 20, sniff: p.sniff, quiet: p.quiet, mode: p.mode };
  const mid = 3, pxcm = B.h / 6;
  mmode(ctx, B, 0, 6, (uu) => {
    const h = dAt(q, uu * T) / 2, m = q.D / 2 - h;
    return [[0, 0.22, 3, 0], [0.22, mid - h - 0.09, DB.liver, m], [mid - h - 0.09, mid - h + 0.02, 9, m], [mid + h - 0.02, mid + h + 0.09, 9, -m], [mid + h + 0.09, 6, DB.liver - 2, -m]];
  }, `ivcm|${q.mode}|${q.D}|${q.sniff}|${q.quiet}`);
  // calipers
  const ct = caliperTimes(p.mode), X = (tm) => B.x + (tm / T) * B.w, Y = (cm) => B.y + cm * pxcm;
  const dmax = p.D, dmin = ct.min === null ? null : dAt(p, ct.min, false);
  const x1 = X(ct.max);
  caliper(ctx, x1, Y(mid - dmax / 2), x1, Y(mid + dmax / 2), { size: 3.5 });
  const t1 = `${dmax.toFixed(1)} cm`;
  if (dmin === null) tagBox(ctx, x1 - 6, Y(mid), [t1], { size: 10.5, align: 'right', bounds: B });
  else {
    const x2 = X(ct.min);
    caliper(ctx, x2, Y(mid - dmin / 2), x2, Y(mid + dmin / 2), { size: 3.5 });
    const t2 = `${dmin.toFixed(1)} cm`;
    // each reading beside its caliper; a short strip takes both in one box at its left
    const w1 = textW(ctx, t1) + 12, w2 = textW(ctx, t2) + 12;
    if (x1 - 6 - w1 > B.x + 2 && x2 + 6 + w2 < B.x + B.w - 2) {
      tagBox(ctx, x1 - 6, Y(mid), [t1], { size: 10.5, align: 'right', bounds: B });
      tagBox(ctx, x2 + 6, Y(mid), [t2], { size: 10.5, bounds: B });
    } else tagBox(ctx, B.x + 4, Y(mid), [`${dmax.toFixed(1)} → ${dmin.toFixed(1)} cm`], { size: 9.5, bounds: B });
  }
  // depth scale
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= 6; d += 1) {
    const y = B.y + d * pxcm;
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 2 === 0 && d > 0 && d < 6) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  ctx.fillText('cm', B.x + B.w + 9, B.y + B.h - 2);
  ctx.restore();
  // the breathing trace: up is inspiration; the sniff is the tall, short spike. Its names sit in
  // a band above the trace, so the two never meet.
  const R = { x: B.x, y: B.y + B.h + 13, w: B.w, h: RESP - 15 };
  ctx.save();
  ctx.strokeStyle = SC.ecg;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= R.w; x += 1.5) {
    const v = respAt(p.mode, (x / R.w) * T).v;
    const y = R.y + R.h - (v / 1.6) * R.h;
    if (x) ctx.lineTo(R.x + x, y); else ctx.moveTo(R.x, y);
  }
  ctx.stroke();
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = SC.ecg;
  ctx.textAlign = 'center';
  const nm = p.mode === 'ppv' ? 'vent' : 'insp';
  const marks = p.mode === 'sniff' ? [[750, nm], [4750, nm], [SNIFF, 'sniff']] : [[750, nm], [4750, nm]];
  for (const [tm, s2] of marks) {
    const x = R.x + (tm / T) * R.w, sw = textW(ctx, s2, 9) / 2;
    ctx.fillText(s2, clamp(x, R.x + sw + 1, R.x + R.w - sw - 1), R.y - 3);
  }
  ctx.restore();
  // the sweep
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(B.x + u * B.w, B.y);
  ctx.lineTo(B.x + u * B.w, B.y + B.h);
  ctx.stroke();
  ctx.restore();
  return { B, dmax, dmin };
}

// ---------------------------------------------------------------- hepatic vein PW
/**
 * The hepatic vein waves (m/s; negative is forward flow, toward the RA and away from the probe
 * in the subcostal window, Quiñones 2002). Normal: S larger than D, a small A reversal and a
 * brief V reversal after S (Mitchell 2019); forward velocities about 50 cm/s (Klein 2013).
 * Raised RA pressure: S/D below 1 (Mukherjee 2025). Severe TR: S reverses (Zoghbi 2017).
 */
export const HV = {
  normal: { S: -0.5, D: -0.32, A: 0.15, V: 0.06 },
  blunted: { S: -0.25, D: -0.45, A: 0.18, V: 0.05 },
  reversal: { S: 0.3, D: -0.52, A: 0.12, V: 0 },
};
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
/** Velocity (m/s) at t ms after the R wave for a pattern's waves. */
export function hvAt(w, t) {
  const tt = t < 60 ? t + RR : t;
  return w.S * bump(t, 70, 400, 230) + w.V * bump(t, 400, 470, 432) + w.D * bump(t, EV.mvo + 10, 720, 540) + w.A * bump(tt, 760, 905, 835);
}
/** Systolic filling fraction S/(S + D) and S/D for forward S, else null. */
export function hvRatios(w) {
  if (w.S >= 0) return { sd: null, sff: null };
  const s = -w.S, d = -w.D;
  return { sd: s / d, sff: (100 * s) / (s + d) };
}

export function drawHV(ctx, box, pat, u, o = {}) {
  const narrow = box.w < 250;
  panel(ctx, box.x, box.y, box.w, box.h, o.title ?? (narrow ? 'PW · HV' : 'PW · HEPATIC VEIN'));
  const bx = { x: box.x + 4, y: box.y + 22, w: box.w - 34, h: box.h - 26 };
  const w = HV[pat] || HV.normal;
  const base = 0.42, scale = 0.8;
  spectral(ctx, bx, { fn: (uu) => hvAt(w, (uu * 2 * RR) % RR), scale, base, mode: 'pw', broad: 0.14, key: `ivchv|${pat}`, seed: 52 });
  vscale(ctx, bx, scale, base, 0.5, '');
  const y0 = bx.y + base * bx.h, k = (bx.h * (1 - base)) / scale;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const boxes = [];
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letter = (s, x, y) => { ctx.fillText(s, x, y); const lw = ctx.measureText(s).width; boxes.push({ x0: x - lw / 2 - 2, x1: x + lw / 2 + 2, y0: y - 10, y1: y + 2 }); };
  // a narrow strip names the waves of the first beat only, so its note has a free corner; with a
  // reversed S, that corner is the top right, and A goes unnamed
  for (const off of narrow ? [0] : [0, RR]) {
    letter('S', X(off + 230), w.S <= 0 ? y0 - w.S * k + 13 : y0 - w.S * k - 5);
    letter('D', X(off + 540), y0 - w.D * k + 13);
    if (!(narrow && w.S > 0)) letter('A', X(off + 835), y0 - w.A * k - 5);
  }
  ctx.restore();
  // the measurements, in the corner clear of the letters
  const r = hvRatios(w);
  const forms = r.sd === null ? ['systolic flow reversal', 'S reversed']
    : [`S/D ${r.sd.toFixed(1)} · S/(S+D) ${Math.round(r.sff)}%`, `S/D ${r.sd.toFixed(1)} · ${Math.round(r.sff)}%`, `S/D ${r.sd.toFixed(1)}`];
  stripNote(ctx, bx, forms, 'auto', boxes);
  // the sweep
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(bx.x + u * bx.w, bx.y);
  ctx.lineTo(bx.x + u * bx.w, bx.y + bx.h);
  ctx.stroke();
  ctx.restore();
  return bx;
}

// ---------------------------------------------------------------- IVC or aorta
// Two long-axis views side by side. The IVC: within the liver, a thin wall, the hepatic vein
// joining it, its opening into the RA, and its change with breathing. The aorta: behind the
// liver, separate from it, a thick wall, the celiac trunk and the SMA from its front wall, a
// course more vertical than the IVC's (Mitchell 2019), and a pulse with each beat but no change
// with breathing.
function pairIVC(d, hvW) {
  const xJ = 1.7, x0 = -9, ay = (x) => 6.4 + 0.04 * x;
  const line = Array.from({ length: 31 }, (_, i) => { const x = x0 + ((xJ + 0.6 - x0) * i) / 30; return [x, ay(x)]; });
  const ivc = tube(line, (u) => { const x = x0 + (xJ + 0.6 - x0) * u; return d * (1 + 0.5 * smooth((x - (xJ - 0.5)) / 1.1)); });
  const raC = [xJ + 2.1, ay(xJ) + 0.4];
  const ra = ellipse(raC, 2.1, 1.8), raOut = ellipse(raC, 2.35, 2.05);
  const dia = spline([[-0.6, 1.4], [0.6, 2.9], [1.5, 4.6], [1.85, 6.4], [1.75, 8.3], [1.2, 10.2], [0.3, 12.5]], 10);
  const liver = [[-12, 1.45], [-0.7, 1.45], ...dia.slice(1), [0.3, 13], [-12, 13]];
  const heartSide = [[-0.6, 1.4], [10, 1.4], [10, 13], [0.3, 13], ...dia.slice().reverse()];
  const xh = xJ - 0.8;
  const hvLine = spline([[xh, ay(xh) - d / 2 + 0.2], [xh - 0.7, ay(xh) - d / 2 - 0.9], [xh - 2.0, 3.6], [xh - 4.2, 2.8]], 8);
  const hv = tube(hvLine, (u) => hvW * (1 - 0.4 * u));
  return {
    raC, xJ, ay, hvLine,
    items: [
      { polys: [liver], e: DB.liver },
      { polys: [heartSide], e: -12 },
      { polys: [raOut], e: DB.myo - 2 },
      { lines: [dia], e: 7, w: 0.18 },
      { polys: [ra], e: DB.blood, blood: true },
      { polys: [ivc.poly, hv.poly], e: DB.blood, blood: true },
      { borders: [sliceX(ivc.a, -20, xJ - 0.2), sliceX(ivc.b, -20, xh - hvW / 2 - 0.05), sliceX(ivc.b, xh + hvW / 2 + 0.15, xJ - 0.2)], e: 0, spec: 7, w: 0.06 },
    ],
  };
}
function pairAorta(d) {
  // from the caudal end near the top left to the cranial end deep at the bottom right
  const a0 = [-4.4, 4.9], a1 = [2.8, 11.2];
  const line = Array.from({ length: 25 }, (_, i) => add(a0, mul(sub(a1, a0), i / 24)));
  const ax = unit(sub(a1, a0)), front = perp(ax);   // front: the side toward the probe (up and right)
  const fr = front[1] < 0 ? front : mul(front, -1);
  const lumen = tube(line, d);
  const wallO = tube(line, d + 0.42);
  // the left lobe of the liver in front, apart from the aorta by a band of tissue
  const edge = spline([[-9, 4.4], [-5.5, 3.2], [-2.2, 3.0], [0.6, 3.7], [3.2, 5.3], [6.5, 7.4], [9, 8.6]], 8);
  const liver = [[-10, 1.45], [10, 1.45], [10, 8.6], ...edge.slice().reverse()];
  // celiac trunk and SMA from the front wall; the SMA about 1 cm caudal to the celiac trunk
  const at = (f) => add(add(a0, mul(sub(a1, a0), f)), mul(fr, (d + 0.42) / 2 - 0.05));
  const cel0 = at(0.47), sma0 = at(0.33);
  const celLine = spline([cel0, add(cel0, mul(fr, 0.8)), add(cel0, add(mul(fr, 1.45), mul(ax, 0.15)))], 6);
  const smaLine = spline([sma0, add(sma0, add(mul(fr, 0.6), mul(ax, -0.5))), add(sma0, add(mul(fr, 0.85), mul(ax, -1.7))), add(sma0, add(mul(fr, 0.9), mul(ax, -2.6)))], 6);
  const cel = tube(celLine, 0.55), sma = tube(smaLine, 0.5);
  const celW = tube(celLine, 0.75), smaW = tube(smaLine, 0.7);
  return {
    ax, fr, a0, a1, line, cel0, sma0, celLine, smaLine,
    items: [
      { polys: [[[-10, 1.45], [10, 1.45], [10, 13], [-10, 13]]], e: -15 },
      { polys: [liver], e: DB.liver },
      { borders: [edge], e: 0, spec: 6, w: 0.08 },
      { polys: [wallO.poly, celW.poly, smaW.poly], e: DB.fibrous + 3 },
      { polys: [lumen.poly, cel.poly, sma.poly], e: DB.blood, blood: true },
      { borders: [lumen.a, lumen.b], e: DB.fibrous + 2, spec: 9, w: 0.12 },
    ],
  };
}
/**
 * A label at a spot (px) with a leader to a point of the image (cm), in the calipers' yellow. The
 * leader meets the end of the label that faces the image, so it crosses no other label.
 */
function callout(ctx, F, text, from, to, o = {}) {
  const P = F.P(from), size = o.size || 10.5;
  const w = textW(ctx, text, size), right = o.align === 'right';
  const ex = right ? to[0] - w - 3 : to[0] + w + 3, ey = to[1] - size * 0.35;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(P[0], P[1]);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = SC.cal;
  ctx.beginPath();
  ctx.arc(P[0], P[1], 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return note(ctx, text, to[0], to[1], { align: right ? 'right' : 'left', size });
}

/**
 * The pair. p: { d (IVC now, cm), hvW, beat (ms after the R wave), t }. The aorta pulses: a
 * little wider in systole. Each panel names its features with leaders from the black corners
 * of the image, and one line at its foot names the motion.
 */
export function drawPair(ctx, box, p) {
  const gap = 8, w = (box.w - gap) / 2;
  const L = { x: box.x, y: box.y, w, h: box.h }, Rb = { x: box.x + w + gap, y: box.y, w, h: box.h };
  const small = w < 230, tiny = w < 175;
  const fs = tiny ? 9 : small ? 9.5 : 10.5;
  const cue = (F, text, from, row, side) => {
    const y = F.box.y + 40 + row * (fs + 7);
    const x = side === 'left' ? F.box.x + 8 : F.box.x + F.box.w - 32;
    return callout(ctx, F, text, from, [x, y], { align: side === 'left' ? 'left' : 'right', size: fs });
  };
  const foot = (F, forms) => {
    const t = pick(ctx, forms, F.box.w - 42, fs);
    note(ctx, t, F.box.x + 8, F.box.y + F.box.h - 8, { size: fs });
  };
  // the IVC
  const F1 = frame(ctx, L, 12, small ? 'IVC · LONG AXIS' : 'IVC · LONG AXIS, SUBCOSTAL', { deg: 70, near: 1.3 });
  const A1 = pairIVC(p.d, p.hvW);
  image(ctx, F1, A1.items, 'ivc-pair1', p.t);
  tag(ctx, F1, 'IVC', [-2.6, A1.ay(-2.6)], { size: fs });
  tag(ctx, F1, 'RA', A1.raC, { size: fs });
  tag(ctx, F1, 'liver', [-2.2, 9.6], { size: fs });
  // the upper label points higher in the image, so the two leaders do not cross
  if (!tiny) cue(F1, 'hepatic vein', A1.hvLine[Math.round(A1.hvLine.length * 0.55)], 0, 'left');
  cue(F1, 'thin wall', [-1.2, A1.ay(-1.2) - p.d / 2], tiny ? 0 : 1, 'left');
  foot(F1, ['narrows on a sniff', 'sniff: narrows']);
  // the aorta
  const sys = Math.pow(Math.max(0, Math.sin(Math.PI * clamp((p.beat - 40) / 330, 0, 1))), 1.5);
  const F2 = frame(ctx, Rb, 12, small ? 'AORTA · LONG AXIS' : 'AORTA · LONG AXIS, SUBCOSTAL', { deg: 70, near: 1.3 });
  const d2 = 1.9 * (1 + 0.06 * sys);
  const A2 = pairAorta(d2);
  image(ctx, F2, A2.items, 'ivc-pair2', p.t);
  const on = (f, k) => add(add(A2.a0, mul(sub(A2.a1, A2.a0), f)), mul(A2.fr, k));
  tag(ctx, F2, 'aorta', on(0.66, -0.05), { size: fs });
  tag(ctx, F2, 'liver', [2.0, 4.0], { size: fs });
  // the longer label on top: its leader leaves from its left end, left of the label below
  if (!tiny) cue(F2, 'outside the liver', on(0.55, (d2 + 0.42) / 2 + 0.25), 0, 'right');
  cue(F2, 'thick wall', on(0.8, (d2 + 0.42) / 2 - 0.1), tiny ? 0 : 1, 'right');
  foot(F2, ['pulsates; no change on a sniff', 'pulsates; no sniff change', 'pulsates']);
  // the branches, named at their ends
  const tip = (line) => F2.P(line[line.length - 1]);
  const c = tip(A2.celLine), sm = tip(A2.smaLine);
  const white = 'rgba(214,222,226,0.92)';
  note(ctx, 'celiac', c[0] + 4, c[1] - 4, { size: fs, color: white });
  note(ctx, 'SMA', sm[0] - 4, sm[1] - 5, { size: fs, align: 'right', color: white });
  finish(ctx, F1);
  finish(ctx, F2);
  return { F1, F2 };
}
