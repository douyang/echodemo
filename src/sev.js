// Severity pages (chapters 11–17): one slider walks a disease from normal to its end stage and
// Play animates it. Shared here: keyframe tracks, the grade bands under the slider, the Play
// motion, the beat clock, and the measurement strip drawn to scale.
import { clamp, mix, SANS, MONO } from './sketch.js';
import { reducedMotion } from './state.js';
import { SC } from './scope.js';

/** Monotone cubic through [[x, y], ...] (no overshoot between keyframes). */
export function mono(keys) {
  const n = keys.length;
  const x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], u = (t - x[i]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}

/** Tracks for many values at shared stops: tracks(stops, { key: [values...] }) -> s => {key: v}. */
export function tracks(stops, table) {
  const fns = Object.fromEntries(Object.entries(table).map(([k, ys]) => [k, mono(stops.map((x, i) => [x, ys[i]]))]));
  return (s) => Object.fromEntries(Object.entries(fns).map(([k, f]) => [k, f(s)]));
}

/** A long label for a wide panel, a short one for a narrow (phone) panel. */
export const fit = (w, long, short) => (w < 250 ? short : long);

/** Where the grade changes along the slider: [{a, b, g}] with a, b in [0, 1]. */
export function bands(gradeOf, n = 500) {
  const out = [];
  let cur = gradeOf(0), a = 0;
  for (let i = 1; i <= n; i++) {
    const s = i / n, g = gradeOf(s);
    if (g !== cur) { out.push({ a, b: s, g: cur }); cur = g; a = s; }
  }
  out.push({ a, b: 1, g: cur });
  return out;
}

/** Grade bands under a slider. levels: grade name -> 0 (normal) .. 4 (beyond severe). */
export function paintBands(host, list, levels, short = {}) {
  if (!host) return;
  host.innerHTML = list.map(({ a, b, g }) => {
    const w = b - a;
    const name = w < 0.2 && short[g] !== undefined ? short[g] : w < 0.1 ? '' : g;
    return `<i style="--a:${a.toFixed(4)};--w:${w.toFixed(4)}" data-l="${levels[g] ?? 0}"></i>${name ? `<span style="--a:${a.toFixed(4)};--w:${w.toFixed(4)}">${name}</span>` : ''}`;
  }).join('');
}

// ---------------------------------------------------------------- Play and the beat
const holds = new Map();
/**
 * Advance s[key] from its value to 1 while Play (state.anim) is on, hold at the end, restart
 * at 0. Reduced motion: step between the band middles instead of a smooth sweep.
 */
export function playSeverity(dt, s, set, key, list, o = {}) {
  if (!s.anim) { holds.delete(key); return; }
  const dur = o.dur ?? 16;
  const h = holds.get(key) || { t: 0 };
  holds.set(key, h);
  const v = s[key];
  if (reducedMotion) {
    h.t += dt;
    if (h.t < 2.6) return;
    h.t = 0;
    const mids = list.map((b) => (b.a + b.b) / 2);
    const next = mids.find((m) => m > v + 1e-3);
    set({ [key]: next === undefined ? mids[0] : Math.round(next * 1000) / 1000 });
    return;
  }
  if (v >= 1) {
    h.t += dt;
    if (h.t > 1.8) { h.t = 0; h.v = 0; set({ [key]: 0 }); }
    return;
  }
  h.t = 0;
  // keep the unrounded position; the store gets steps of 1/400
  if (h.v === undefined || Math.abs(h.v - v) > 0.01) h.v = v;
  h.v = Math.min(1, h.v + dt / dur);
  const q = Math.round(h.v * 400) / 400;
  if (q !== v) set({ [key]: q });
}

/** Whether the cine of the page being drawn runs: Beat.at() sets it, the echo views read it. */
export const cine = { live: false };

/** The beat: ms since the R wave, advanced while the cine runs. */
export class Beat {
  constructor(rr = 857) { this.rr = rr; this.ms = 150; }
  tick(dt, run) { if (run && !reducedMotion) this.ms = (this.ms + dt * 1000) % (2 * this.rr); return run && !reducedMotion; }
  /** ms within the current beat */
  get t() { return this.ms % this.rr; }
  /** the frame to draw: the running beat, or a fixed moment when the cine is off */
  at(run, still) { cine.live = run && !reducedMotion; return cine.live ? this.ms % this.rr : still; }
  /** position of the sweep across a two-beat strip, 0..1 */
  get sweep() { return this.ms / (2 * this.rr); }
}

/** A vertical sweep line over a spectral box. */
export function cursor(ctx, box, u) {
  const x = box.x + u * box.w;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, box.y);
  ctx.lineTo(x, box.y + box.h);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- layout
/** Split a box into rows by weights, with a gap. */
export function rows(box, weights, gap = 10) {
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = box.h - gap * (weights.length - 1);
  let y = box.y;
  return weights.map((w) => {
    const r = { x: box.x, y, w: box.w, h: (avail * w) / total };
    y += r.h + gap;
    return r;
  });
}
/** Split a box into columns by weights, with a gap. */
export function cols(box, weights, gap = 10) {
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = box.w - gap * (weights.length - 1);
  let x = box.x;
  return weights.map((w) => {
    const r = { x, y: box.y, w: (avail * w) / total, h: box.h };
    x += r.w + gap;
    return r;
  });
}
/** The inner plotting box of a scanner panel (below its title, room for the scale). */
export const inner = (p, right = 30) => ({ x: p.x + 4, y: p.y + 22, w: p.w - right - 4, h: p.h - 26 });

// ---------------------------------------------------------------- measurement strip
/**
 * Measurements drawn to scale on the paper. Each item:
 *   { k: label, v: value, u: unit, lo, hi: track range, norm: [a, b] normal range or null,
 *     cuts: [[value, label]], d: decimals, bad: true when abnormal }
 */
export function meters(sh, t, box, items, o = {}) {
  const ctx = sh.ctx;
  const n = items.length;
  const rh = Math.min(o.row ?? 30, box.h / n);
  const narrowLabels = box.w < 420;
  const lw = o.labelW ?? (narrowLabels ? 104 : 142);
  const vw = o.valueW ?? (narrowLabels ? 64 : 84);
  const x0 = box.x + lw, x1 = box.x + box.w - vw;
  items.forEach((it, i) => {
    const y = box.y + i * rh + rh * 0.58;
    const X = (v) => x0 + ((clamp(v, it.lo, it.hi) - it.lo) / (it.hi - it.lo)) * (x1 - x0);
    ctx.save();
    ctx.font = `500 ${narrowLabels ? 10 : 11}px ${SANS}`;
    ctx.fillStyle = t.ink2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.k, box.x, y);
    // track and normal range
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    if (it.norm) {
      ctx.fillStyle = t.accent2;
      ctx.globalAlpha = 0.85;
      const a = X(it.norm[0]), b = X(it.norm[1]);
      ctx.fillRect(a, y - 3, Math.max(2, b - a), 6);
      ctx.globalAlpha = 1;
    }
    // cut-offs
    ctx.font = `400 9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const [cv, cl] of it.cuts || []) {
      const cx = X(cv);
      ctx.strokeStyle = t.flag;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(cx, y - 6);
      ctx.lineTo(cx, y + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (cl && rh >= 22) { ctx.fillStyle = t.ink3; ctx.fillText(cl, cx, y + 15); }
    }
    // value
    const vx = X(it.v);
    ctx.fillStyle = it.bad ? t.flag : t.ink;
    ctx.beginPath();
    ctx.arc(vx, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.paper;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.font = `${it.bad ? 600 : 500} ${narrowLabels ? 11 : 12}px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Number.isFinite(it.v) ? it.v.toFixed(it.d ?? 0) : '–'}${it.u ? ` ${it.u}` : ''}`, box.x + box.w, y);
    ctx.restore();
  });
}

/** Level of a grade word, for colors and bands. */
export const LEVEL = {
  none: 0, normal: 0, trace: 0, sclerosis: 1, mild: 1, 'progressive, mild': 1,
  moderate: 2, 'progressive, moderate': 2, 'severe (area only)': 3, severe: 3,
  'very severe': 4, 'severe, low flow': 4, massive: 4, torrential: 5,
  'grade 1': 1, 'grade 2': 2, 'grade 3': 3,
};

/** A grading table: rows of [name, [cells...], index of the current cell]. */
export function gradeTable(host, rowsIn, cap, colsIn = ['Mild', 'Moderate', 'Severe']) {
  if (!host) return;
  host.innerHTML = `<caption>${cap}</caption>
    <thead><tr><th>Parameter</th>${colsIn.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rowsIn.map(([name, cells, cur]) => `<tr><td>${name}</td>${cells.map((c, i) => `<td class="${i === cur ? 'cur' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

/** A line of scanner text at the top or bottom of a spectral box. */
export function note(ctx, bx, text, where = 'bottom') {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, bx.x + 8, where === 'top' ? bx.y + 14 : bx.y + bx.h - 8);
  ctx.restore();
}

export { clamp, mix };
