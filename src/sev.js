// Severity pages (chapters 10–17): one slider walks a disease from normal to its end stage, and
// Play runs the page's own sequence (main.js). Shared here: keyframe tracks, the grade bands
// under the slider, the grade bell of Play, the beat clock, and the measurement strip to scale.
import { clamp, mix, SANS, MONO } from './sketch.js';
import { reducedMotion } from './state.js';
import { SC } from './scope.js';
import { cue } from './music.js';

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

/**
 * Grade bands under a slider. levels: grade name -> 0 (normal) .. 4 (beyond severe); short:
 * a shorter name for a narrow band ('' for none).
 */
export function paintBands(host, list, levels, short = {}) {
  if (!host) return;
  host.innerHTML = list.map(({ a, b, g }) => {
    const pos = `--a:${a.toFixed(4)};--w:${(b - a).toFixed(4)}`;
    return `<i style="${pos}" data-l="${levels[g] ?? 0}"></i><span style="${pos}" title="${g}" data-full="${g}" data-short="${short[g] ?? g}"></span>`;
  }).join('');
  fitBands(host);
  if (!host.fitting) {
    host.fitting = new ResizeObserver(() => fitBands(host));
    host.fitting.observe(host);
  }
}
/** Each band's label as long as its band allows: the grade, its short name, or none. */
function fitBands(host) {
  for (const s of host.querySelectorAll('span')) {
    s.textContent = '';
    for (const t of new Set([s.dataset.full, s.dataset.short])) {
      if (!t) continue;
      s.textContent = t;
      if (s.scrollWidth <= s.clientWidth + 0.5) break;
      s.textContent = '';
    }
  }
}

// ---------------------------------------------------------------- Play and the beat
const grades = new Map();
/**
 * The grade bell of Play. The page's own sequence moves the slider (its tourTick, run by main.js
 * while state.anim is on). Here, a soft bell (music.js) sounds each time s[key] enters another
 * grade. dt, set and the options are not used: the slider does not move here.
 */
export function playSeverity(dt, s, set, key, list) {
  if (!s.anim) { grades.delete(key); return; }
  const g = list.findIndex((b) => s[key] < b.b || b === list[list.length - 1]);
  if (grades.has(key) && grades.get(key) !== g) cue('bell');
  grades.set(key, g);
}

/** Whether the cine of the page being drawn runs: Beat.at() sets it, the echo views read it. */
export const cine = { live: false };

/** The beat: ms since the R wave, advanced while the cine runs. */
export class Beat {
  constructor(rr = 857) { this.rr = rr; this.ms = 150; this.live = false; }
  tick(dt, run) { this.live = run && !reducedMotion; if (this.live) this.ms = (this.ms + dt * 1000) % (2 * this.rr); return this.live; }
  /** The heart for the music (music.js): its beat, and its phase while the cine runs. */
  pulse() { return { rr: this.rr, phase: this.live ? (this.ms % this.rr) / this.rr : null }; }
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

/**
 * A line of scanner text at the top or bottom of a spectral box. text: a string, or its forms
 * from long to short, the first that fits the box winning; the type shrinks to 9 px before
 * anything is cut. where: 'top', 'bottom', or 'auto': the first corner that covers none of the
 * boxes in avoid ({x0, y0, x1, y1}, px), in the order top left, bottom left, top right, bottom
 * right, trying smaller type and then shorter forms; when every corner covers a box, the
 * shortest form in the corner where it covers least.
 */
export function note(ctx, bx, text, where = 'bottom', avoid = []) {
  const forms = Array.isArray(text) ? text : [text];
  const room = bx.w - 14, yTop = bx.y + 14, yBot = bx.y + bx.h - 8;
  ctx.save();
  // every form at every size that fits the box (11, 10, 9 px), longest and largest first
  const tries = [];
  for (const f of forms) {
    for (const px of [11, 10, 9]) {
      ctx.font = `500 ${px}px ${MONO}`;
      const w = ctx.measureText(f).width;
      if (w <= room) tries.push({ f, px, w });
    }
  }
  if (!tries.length) { ctx.font = `500 9px ${MONO}`; const f = forms[forms.length - 1]; tries.push({ f, px: 9, w: Math.min(room, ctx.measureText(f).width) }); }
  const spots = ({ w }) => {
    const xl = bx.x + 8, xr = bx.x + bx.w - 6 - w;
    return where === 'auto' ? [[xl, yTop], [xl, yBot], [xr, yTop], [xr, yBot]] : [[xl, where === 'top' ? yTop : yBot]];
  };
  const cover = ({ w, px }, [x, y]) => avoid.reduce((sum, a) => sum + Math.max(0, Math.min(a.x1, x + w) - Math.max(a.x0, x)) * Math.max(0, Math.min(a.y1, y + 3) - Math.max(a.y0, y - px)), 0);
  // the first try that covers nothing; else the smallest try where it covers least
  let pick = null;
  for (const t of where === 'auto' ? tries : tries.slice(0, 1)) {
    const at = spots(t).find((p) => cover(t, p) === 0);
    if (at) { pick = { ...t, at }; break; }
  }
  if (!pick) {
    const t = tries[tries.length - 1];
    pick = { ...t, at: spots(t).reduce((b, p) => (cover(t, p) < cover(t, b) ? p : b)) };
  }
  ctx.font = `500 ${pick.px}px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(pick.f, pick.at[0], pick.at[1], room);
  ctx.restore();
}

/** A wave's letter (S, D, Ar) centred at x, baseline y; returns its box, for note(…, 'auto'). */
export function waveLetter(ctx, text, x, y) {
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  return { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - 10, y1: y + 2 };
}

export { clamp, mix };
