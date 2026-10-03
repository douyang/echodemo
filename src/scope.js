// Scanner panels: the black screen of the echo machine, drawn the same way in both themes.
// Spectral Doppler (with aliasing), color flow, calipers, ECG. The B-mode image is in bmode.js.
import { rng } from './sketch.js';
import { MONO } from './sketch.js';

export const SC = {
  bg: '#101315',
  frame: '#3a4247',
  text: '#c7cdd0',
  dim: '#8d979c',
  cal: '#ffe89a',
  base: '#8d979c',
  ecg: '#7fd08a',
  red: [216, 65, 47],
  yellow: [255, 214, 90],
  blue: [47, 111, 216],
  cyan: [127, 227, 255],
};

// ---------------------------------------------------------------- panel
export function panel(ctx, x, y, w, h, title, o = {}) {
  ctx.save();
  ctx.fillStyle = o.bg || SC.bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = o.frame || SC.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (title) {
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.text;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 10, y + 17);
  }
  ctx.restore();
}

export function label(ctx, text, x, y, o = {}) {
  ctx.save();
  ctx.font = `${o.weight || 500} ${o.size || 11}px ${MONO}`;
  ctx.fillStyle = o.color || SC.cal;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A caption box of mono lines (like the scanner's measurement box). */
export function tagBox(ctx, x, y, lines, o = {}) {
  ctx.save();
  ctx.font = `500 ${o.size || 11}px ${MONO}`;
  const wmax = Math.max(...lines.map((s) => ctx.measureText(s).width));
  const lh = (o.size || 11) + 3;
  const bw = wmax + 12, bh = lines.length * lh + 8;
  let bx = o.align === 'right' ? x - bw : x;
  if (o.bounds) bx = Math.max(o.bounds.x + 4, Math.min(o.bounds.x + o.bounds.w - bw - 4, bx));
  let by = y - bh / 2;
  if (o.bounds) by = Math.max(o.bounds.y + 4, Math.min(o.bounds.y + o.bounds.h - bh - 4, by));
  ctx.fillStyle = 'rgba(8,10,12,0.78)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = o.color || SC.cal;
  lines.forEach((s, i) => ctx.fillText(s, bx + 6, by + 4 + (i + 1) * lh - 3));
  ctx.restore();
  return { x: bx, y: by, w: bw, h: bh };
}

export function caliper(ctx, x0, y0, x1, y1, o = {}) {
  ctx.save();
  ctx.strokeStyle = o.color || SC.cal;
  ctx.lineWidth = 1.2;
  ctx.setLineDash(o.solid ? [] : [3, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  const s = o.size || 4;
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  }
  ctx.restore();
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

// ---------------------------------------------------------------- ECG
/** One ECG lead across [x0, x1]; phase 0 = R wave. cursor: phase of the moving line, or null. */
export function ecg(ctx, x0, x1, y0, amp, beats, cursor = null, o = {}) {
  const shape = (ph) => {
    const g = (m, s) => Math.exp(-(((ph - m) / s) ** 2));
    // P, Q, R, S, T around the R wave at phase 0 (and 1)
    const w = (p) => g(p, 0.008);
    return 0.12 * g(0.87, 0.025) - 0.1 * g(0.985, 0.006) + w(0.0) + w(1.0) - 0.22 * g(0.018, 0.007) + 0.24 * g(0.33, 0.055);
  };
  ctx.save();
  ctx.strokeStyle = o.color || SC.ecg;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 1.2) {
    const ph = (((x - x0) / (x1 - x0)) * beats + (o.offset || 0)) % 1;
    const y = y0 - shape(ph) * amp;
    if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (cursor !== null) {
    const cx = x0 + (((cursor - (o.offset || 0)) % 1 + 1) % 1) / beats * (x1 - x0);
    ctx.strokeStyle = o.cursor || SC.cal;
    ctx.beginPath();
    ctx.moveTo(cx, y0 - amp * 1.1);
    ctx.lineTo(cx, y0 + amp * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- spectral Doppler
const specCache = new Map();
/**
 * A spectral Doppler strip in box {x, y, w, h}.
 * o.fn(u) -> signed velocity (m/s) of the envelope at time fraction u in [0, 1]
 *   (or an array of such functions for several signals, e.g. inflow and outflow);
 * o.scale: velocity at the top/bottom edge (m/s); o.base: baseline position, 0 top .. 1 bottom;
 * o.mode: 'pw' (narrow band, spectral window) or 'cw' (filled); o.nyq: PW Nyquist limit (m/s),
 * velocities beyond it wrap around; o.broad: 0..1 spectral broadening; o.gain: the brightness of
 * each signal (a list, 1 by default), for a faint jet over a dense signal; o.key: cache key.
 */
export function spectral(ctx, box, o) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(2, Math.round(box.w * dpr)), H = Math.max(2, Math.round(box.h * dpr));
  const key = o.key ? `${o.key}|${W}x${H}` : null;
  let cv = key ? specCache.get(key) : null;
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const d = img.data;
    const fns = Array.isArray(o.fn) ? o.fn : [o.fn];
    const r = rng(o.seed || 7);
    const base = (o.base ?? 0.5) * H;
    const vPerPx = o.scale / Math.max(base, H - base);   // m/s per device px
    const nyq = o.nyq ?? Infinity;
    const cw = o.mode === 'cw';
    const broad = o.broad ?? (cw ? 0.6 : 0.12);
    // per column: envelopes
    const env = new Float32Array(W * fns.length);
    for (let x = 0; x < W; x++) for (let k = 0; k < fns.length; k++) env[x * fns.length + k] = fns[k](x / (W - 1));
    const noise = new Float32Array(W * H);
    for (let i = 0; i < noise.length; i++) noise[i] = r();
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const u = (base - y) * vPerPx;   // displayed velocity, + toward (above baseline)
        let I = 0;
        for (let k = 0; k < fns.length; k++) {
          const e = env[x * fns.length + k];
          if (Math.abs(e) < 0.02) continue;
          // the true velocities that land on this row: u, u ± 2 Nyquist (aliasing)
          const cands = Number.isFinite(nyq) && Math.abs(e) > nyq ? [u, u + 2 * nyq, u - 2 * nyq] : [u];
          for (const v of cands) {
            if (Math.sign(v) !== Math.sign(e) && Math.abs(v) > 0.01) continue;
            const a = Math.abs(v), m = Math.abs(e);
            if (a > m * 1.02) continue;
            let s;
            if (cw) s = 0.28 + 0.72 * Math.pow(a / m, 1.6) * (1 - 0.35 * broad) + 0.3 * broad * (1 - a / m);
            else {
              const band = m * broad + 0.02;
              s = Math.exp(-(((m - a) / band) ** 2)) + 0.18 * broad * (a < m ? 1 : 0);
            }
            I = Math.max(I, Math.min(1, s * (o.gain?.[k] ?? 1)));
          }
        }
        const n = noise[y * W + x];
        I = I * (0.55 + 0.6 * n);
        I += 0.04 * n * n;   // background speckle
        const c = Math.max(0, Math.min(255, Math.round(255 * I)));
        const p = (y * W + x) * 4;
        d[p] = c; d[p + 1] = c; d[p + 2] = c; d[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    if (key) {
      if (specCache.size > 60) specCache.delete(specCache.keys().next().value);
      specCache.set(key, cv);
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(cv, box.x, box.y, box.w, box.h);
  ctx.restore();
  // baseline
  const by = box.y + (o.base ?? 0.5) * box.h;
  ctx.save();
  ctx.strokeStyle = SC.base;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(box.x, by);
  ctx.lineTo(box.x + box.w, by);
  ctx.stroke();
  ctx.restore();
  return { y0: by, pxPerV: (box.h * Math.max(o.base ?? 0.5, 1 - (o.base ?? 0.5))) / o.scale };
}

/** Velocity scale ticks on the right edge of a spectral box. */
export function vscale(ctx, box, scale, base, step, unit = 'm/s', o = {}) {
  const by = box.y + base * box.h;
  const k = (box.h * Math.max(base, 1 - base)) / scale;
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  ctx.textAlign = 'left';
  const x = box.x + box.w + 3;
  // the unit goes in the half without ticks: above a high baseline, below a low one
  const uy = base < 0.5 ? box.y + 10 : box.y + box.h - 2;
  // ticks on whole multiples of the step, both sides of the baseline; on a short strip only
  // every second or third tick has a number, and none sits on the unit
  const n = Math.floor(scale / step + 1e-9);
  const every = Math.max(1, Math.ceil(12 / (step * k)));
  for (let i = -n; i <= n; i++) {
    const v = i * step;
    const y = by - v * k;
    if (y < box.y + 4 || y > box.y + box.h - 4) continue;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + 1, y);
    ctx.stroke();
    if (i !== 0 && i % every === 0 && Math.abs(y + 3.5 - uy) > 10) ctx.fillText(`${o.cm ? Math.round(v * 100) : v.toFixed(step < 1 ? 1 : 0)}`, x + 3, y + 3.5);
  }
  ctx.fillText(unit, x + 3, uy);
  ctx.restore();
}

// ---------------------------------------------------------------- color flow
/** BART map: toward the probe red to yellow, away blue to cyan; aliasing wraps past the Nyquist limit. */
export function colorOf(v, nyq, variance = 0) {
  let u = v / nyq;
  if (Math.abs(u) > 1) u = ((((u + 1) % 2) + 2) % 2) - 1;   // wrap into [-1, 1)
  return flowColor(u, -1, 1, variance);
}

/**
 * The BART color of a velocity v already inside the displayed range [lo, hi) (any unit): toward
 * the probe dark red to yellow at hi, away dark blue to cyan at lo. With the baseline shifted the
 * two halves differ in length; each color keeps its place on the bar. variance 0..1 adds green.
 */
export function flowColor(v, lo, hi, variance = 0, out = [0, 0, 0]) {
  const pos = v >= 0;
  const a = Math.min(1, pos ? v / hi : v / lo);
  const c0 = pos ? SC.red : SC.blue, c1 = pos ? SC.yellow : SC.cyan;
  const t = Math.pow(a, 1.5), dim = 0.3 + 0.7 * Math.min(1, a * 1.8);
  for (let i = 0; i < 3; i++) out[i] = (c0[i] + (c1[i] - c0[i]) * t) * dim;
  if (variance > 0) { out[0] += 30 * variance; out[1] += 150 * variance; out[2] += 30 * variance; }
  for (let i = 0; i < 3; i++) out[i] = Math.max(0, Math.min(255, Math.round(out[i])));
  return out;
}

/**
 * A color bar with the Nyquist limits, as on the scanner. nyq (m/s) for a centred baseline; o.lo,
 * o.hi (m/s) for a shifted one, with a tick where the baseline sits.
 */
export function colorBar(ctx, x, y, h, nyq, o = {}) {
  ctx.save();
  const w = o.w || 8, lo = o.lo ?? -nyq, hi = o.hi ?? nyq;
  const c = [0, 0, 0];
  for (let i = 0; i < h; i++) {
    const v = hi - ((i + 0.5) / h) * (hi - lo);
    const [r, g, b] = flowColor(v, lo, hi, 0, c);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y + i, w, 1.2);
  }
  if (o.lo !== undefined && Math.abs(hi + lo) > 1e-6) {
    const yb = Math.round(y + (h * hi) / (hi - lo)) + 0.5;
    ctx.strokeStyle = SC.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, yb);
    ctx.lineTo(x, yb);
    ctx.stroke();
  }
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.text;
  ctx.textAlign = 'center';
  ctx.fillText(`+${Math.round(hi * 100)}`, x + w / 2, y - 4);
  ctx.fillText(`−${Math.round(-lo * 100)}`, x + w / 2, y + h + 11);
  ctx.fillText('cm/s', x + w / 2, y + h + 22);
  ctx.restore();
}

// ---------------------------------------------------------------- sector
/** Sector path with apex (cx, top), radius R px and full angle deg. */
export function sectorPath(cx, top, R, deg) {
  const half = (deg * Math.PI) / 360;
  const p = new Path2D();
  p.moveTo(cx, top);
  p.arc(cx, top, R, Math.PI / 2 + half, Math.PI / 2 - half, true);
  p.closePath();
  return p;
}


/** Depth ticks along the right edge of a sector (1 cm minor, 5 cm labeled). */
export function depthTicks(ctx, sect, depthCm, o = {}) {
  const half = (sect.deg * Math.PI) / 360;
  const pxPerCm = sect.R / depthCm;
  ctx.save();
  ctx.strokeStyle = o.color || '#8d979c';
  ctx.fillStyle = o.color || '#8d979c';
  ctx.font = `500 10px ${MONO}`;
  ctx.lineWidth = 1;
  for (let d = 1; d < depthCm; d++) {
    const x = sect.cx + Math.sin(half) * d * pxPerCm, y = sect.top + Math.cos(half) * d * pxPerCm;
    const len = d % 5 === 0 ? 7 : 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 2 + len, y);
    ctx.stroke();
    if (d % 5 === 0) ctx.fillText(String(d), x + 12, y + 3.5);
  }
  ctx.restore();
}
