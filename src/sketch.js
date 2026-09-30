// 2D drawing on canvas: rough.js strokes, handwriting, hatching.
// Two styles: 'pencil' (wobbly strokes, handwriting) and 'line' (crisp linework).
import rough from '../vendor/rough.esm.js';

export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    paper: v('--paper'), paper2: v('--paper-2'), paper3: v('--paper-3'),
    ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'),
    chalk: v('--chalk'), accent: v('--accent'), accent2: v('--accent-2'),
    flag: v('--flag'), flag2: v('--flag-2'), ok: v('--ok'), echo: v('--echo'),
    // the 3D pencil renderer reads congo for its (unused here) stipple color
    congo: v('--flag'),
    dark: cs.getPropertyValue('color-scheme').includes('dark'),
  };
}

const PENCIL_HAND = '"Caveat", "Bradley Hand", "Segoe Print", cursive';
const LINE_HAND = '"IBM Plex Sans Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
// Live binding: figures read HAND at draw time, so setStyle() switches all labels.
export let HAND = PENCIL_HAND;
let STYLE = 'pencil';
/** 'pencil' (default) or 'line'. Call before the first sheet draws. */
export function setStyle(s) {
  STYLE = s === 'line' ? 'line' : 'pencil';
  HAND = STYLE === 'line' ? LINE_HAND : PENCIL_HAND;
}
export const drawStyle = () => STYLE;
// condensed lettering at the handwriting's cap height
const LINE_SCALE = 0.84;
export let SANS = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
export let MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
/** Other faces for the lettering. */
export function setFonts({ hand, sans, mono } = {}) {
  if (hand) HAND = hand;
  if (sans) SANS = sans;
  if (mono) MONO = mono;
}

// Deterministic pseudo-random numbers (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas that tracks its box, device pixel ratio and theme. */
export class Sheet {
  constructor(canvas, draw) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rc = rough.canvas(canvas);
    this.draw = draw;
    this.w = 0;
    this.h = 0;
    this.t = tokens();
    this.dirty = true;
    // zoom > 1 lays the figure out for a smaller box and draws it larger
    this.zoom = 1;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const z = this.zoom || 1;
    const w = Math.max(1, Math.round(r.width / z));
    const h = Math.max(1, Math.round(r.height / z));
    if (w === this.w && h === this.h && dpr === this.dpr && z === this.z) return;
    this.w = w; this.h = h; this.dpr = dpr; this.z = z;
    this.canvas.width = Math.round(w * dpr * z);
    this.canvas.height = Math.round(h * dpr * z);
    this.dirty = true;
  }
  retheme() { this.t = tokens(); this.dirty = true; }
  render(force) {
    if (!force && !this.dirty) return;
    this.dirty = false;
    const { ctx } = this;
    const k = this.dpr * (this.z || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.w > 2 && this.h > 2) this.draw(this, this.t);
  }

  // ---- drawing helpers (all in CSS pixels) -------------------------------
  line(x1, y1, x2, y2, o = {}) {
    this.rc.line(x1, y1, x2, y2, this.opts(o));
  }
  path(d, o = {}) { this.rc.path(d, this.opts(o)); }
  poly(pts, o = {}) { this.rc.polygon(pts, this.opts(o)); }
  curve(pts, o = {}) { this.rc.curve(pts, this.opts(o)); }
  ellipse(x, y, w, h, o = {}) { this.rc.ellipse(x, y, w, h, this.opts(o)); }
  rect(x, y, w, h, o = {}) { this.rc.rectangle(x, y, w, h, this.opts(o)); }
  opts(o) {
    const line = STYLE === 'line';
    return {
      stroke: o.stroke ?? this.t.ink,
      strokeWidth: (o.width ?? 1.15) * (line ? 0.85 : 1),
      roughness: line ? 0 : (o.rough ?? 1.1),
      bowing: line ? 0 : (o.bowing ?? 0.8),
      seed: o.seed ?? 7,
      fill: o.fill,
      fillStyle: o.fillStyle ?? 'hachure',
      fillWeight: o.fillWeight ?? 0.7,
      hachureGap: o.gap ?? 5,
      hachureAngle: o.angle ?? -41,
      disableMultiStroke: line ? true : (o.single ?? false),
      disableMultiStrokeFill: line,
      preserveVertices: line ? true : (o.preserve ?? false),
      strokeLineDash: o.dash,
    };
  }
  text(str, x, y, o = {}) {
    const { ctx } = this;
    const family = o.family ?? HAND;
    let size = o.size ?? 20, weight = o.weight ?? 600;
    if (STYLE === 'line' && family === HAND) { size *= LINE_SCALE; weight = Math.min(weight, 500); }
    ctx.save();
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = o.color ?? this.t.ink;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'alphabetic';
    if (o.rotate) { ctx.translate(x, y); ctx.rotate(o.rotate); ctx.fillText(str, 0, 0); } else ctx.fillText(str, x, y);
    ctx.restore();
  }
  /** Width of str as text() would draw it. */
  measure(str, o = {}) {
    const { ctx } = this;
    const family = o.family ?? HAND;
    let size = o.size ?? 20, weight = o.weight ?? 600;
    if (STYLE === 'line' && family === HAND) { size *= LINE_SCALE; weight = Math.min(weight, 500); }
    ctx.save();
    ctx.font = `${weight} ${size}px ${family}`;
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }
  /** The first form that fits maxW at a size from o.size down to min × o.size: { str, size }. */
  fit(forms, maxW, o = {}, min = 0.75) {
    const { ctx } = this, list = [].concat(forms);
    const family = o.family ?? HAND, base = o.size ?? 20;
    let size = base, weight = o.weight ?? 600;
    if (STYLE === 'line' && family === HAND) { size *= LINE_SCALE; weight = Math.min(weight, 500); }
    ctx.save();
    try {
      for (const str of list) {
        for (let k = 1; k >= min - 1e-6; k -= 0.05) {
          ctx.font = `${weight} ${size * k}px ${family}`;
          if (ctx.measureText(str).width <= maxW) return { str, size: base * k };
        }
      }
    } finally { ctx.restore(); }
    return { str: list[list.length - 1], size: base * min };
  }
  label(str, x, y, tx, ty, o = {}) {
    // leader line from (x,y) to the text anchor (tx,ty)
    this.line(x, y, tx, ty, { width: 0.9, rough: 0.6, stroke: o.color ?? this.t.ink2, single: true, seed: o.seed ?? 3 });
    this.ctx.fillStyle = o.color ?? this.t.ink;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    this.ctx.fill();
    this.text(str, tx + (tx >= x ? 5 : -5), ty + 5, { align: tx >= x ? 'left' : 'right', size: o.size ?? 19, color: o.color });
  }
  /** Pencil stipple inside a Path2D. */
  stipple(path, density, color, seed = 1, size = 1.2) {
    const { ctx } = this;
    const r = rng(seed);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = color;
    const n = Math.round(this.w * this.h * density / 1000);
    for (let i = 0; i < n; i++) {
      const x = r() * this.w;
      const y = r() * this.h;
      const s = size * (0.5 + r());
      ctx.globalAlpha = 0.45 + 0.5 * r();
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();
  }
  /** Straight hatching clipped to a path. */
  hatch(path, angle, gap, color, width = 0.8, seed = 1, alpha = 0.85) {
    const { ctx } = this;
    const r = rng(seed);
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    const L = Math.hypot(this.w, this.h);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    ctx.beginPath();
    for (let d = -L; d < L; d += gap) {
      const j = STYLE === 'line' ? 0 : (r() - 0.5) * gap * 0.35;
      const x0 = this.w / 2 + (d + j) * -sa, y0 = this.h / 2 + (d + j) * ca;
      ctx.moveTo(x0 - ca * L, y0 - sa * L);
      ctx.lineTo(x0 + ca * L, y0 + sa * L);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function smooth(t) { return t * t * (3 - 2 * t); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function mix(a, b, t) { return a + (b - a) * t; }
