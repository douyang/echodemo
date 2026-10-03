// Pulse: one scan line. A short pulse crosses the chest wall and the heart; echoes come
// back from each boundary; the scanner turns their arrival time into depth.
import { Sheet, rng, clamp, mix, MONO, SANS, HAND } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, SC } from '../scope.js';
import { PHYS } from '../physics.js';

const C = PHYS.c;                 // m/s
const ALPHA = PHYS.alpha;         // dB per cm per MHz, one way
const Z = PHYS.z;                 // MRayl
const NOISE = -80;                // dB, display noise floor of the model (illustrative)
const DMAX = 16;                  // cm shown

// A parasternal beam through the right ventricle, septum, left ventricle and posterior wall.
const LAYERS = [
  { from: 0, to: 0.7, name: 'skin and fat', kind: 'fat' },
  { from: 0.7, to: 2.4, name: 'chest wall muscle', kind: 'muscle' },
  { from: 2.4, to: 2.9, name: 'RV wall', kind: 'muscle' },
  { from: 2.9, to: 4.7, name: 'RV cavity', kind: 'blood' },
  { from: 4.7, to: 5.6, name: 'septum', kind: 'muscle' },
  { from: 5.6, to: 10.3, name: 'LV cavity', kind: 'blood' },
  { from: 10.3, to: 11.3, name: 'posterior wall', kind: 'muscle' },
  { from: 11.3, to: DMAX, name: 'lung (air)', kind: 'air' },
];
const PW_DEPTH = 10.3;            // cm: the blood-to-posterior-wall boundary

const refl = (z1, z2) => ((z2 - z1) / (z2 + z1)) ** 2;
const dB = (r) => 10 * Math.log10(Math.max(r, 1e-12));

/** Boundaries along the beam with their intensity reflection in dB. */
function boundaries() {
  const out = [];
  for (let i = 1; i < LAYERS.length; i++) {
    const a = LAYERS[i - 1].kind, b = LAYERS[i].kind;
    const za = Z[a === 'muscle' ? 'muscle' : a], zb = Z[b === 'muscle' ? 'muscle' : b];
    if (za === zb) continue;
    out.push({ d: LAYERS[i].from, level: dB(refl(za, zb)), name: `${LAYERS[i - 1].name} / ${LAYERS[i].name}` });
  }
  // weak scatter inside muscle: the speckle of the myocardium
  const r = rng(5);
  for (const L of LAYERS) {
    if (L.kind !== 'muscle') continue;
    for (let d = L.from + 0.12; d < L.to - 0.05; d += 0.1 + r() * 0.12) out.push({ d, level: -44 - 6 * r(), scatter: true });
  }
  return out.sort((a, b) => a.d - b.d);
}
const BOUNDS = boundaries();

/** One-way attenuation (dB at 1 MHz) from the skin to depth d, layer by layer. */
function pathLoss(d) {
  let sum = 0;
  for (const L of LAYERS) {
    if (d <= L.from) break;
    sum += (Math.min(d, L.to) - L.from) * PHYS.att[L.kind];
  }
  return sum;
}

export function physics(st) {
  const f = st.freq;
  const lambda = (C / (f * 1e6)) * 1000;          // mm
  const spl = st.cycles * lambda;                  // mm
  const axial = spl / 2;                           // mm
  const us = (dcm) => ((2 * dcm / 100) / C) * 1e6; // round trip, µs
  const loss = (dcm) => 2 * f * pathLoss(dcm);     // round trip, dB
  const blood = dB(refl(Z.muscle, Z.blood));
  // depth where a muscle/blood echo sinks under the noise floor, in average soft tissue
  const usable = (blood - NOISE) / (2 * ALPHA * f);
  return { f, lambda, spl, axial, us, loss, usable, blood };
}

// ---------------------------------------------------------------- drawing
let clock = 0;          // seconds of animation
const CYCLE_S = 3.2;    // one pulse-echo cycle to DMAX, slowed down for the eye

function transducer(sh, x, y, w, t) {
  const h = w * 0.62;
  sh.rect(x - w / 2, y - h, w, h, { fill: t.ink3, gap: 3.5, seed: 11, width: 1.3 });
  sh.line(x - w / 2 - 3, y, x + w / 2 + 3, y, { width: 2.2, seed: 12, rough: 0.4 });
  sh.curve([[x, y - h], [x + 4, y - h - 14], [x + 14, y - h - 26], [x + 30, y - h - 32]], { width: 1.4, seed: 13 });
}

function layerStyle(sh, t, kind, path, seed) {
  if (kind === 'blood') sh.hatch(path, -0.9, 7, t.flag, 0.7, seed, 0.28);
  else if (kind === 'muscle') { sh.hatch(path, 0.5, 4.2, t.ink2, 0.8, seed, 0.55); }
  else if (kind === 'fat') sh.stipple(path, 1.4, t.ink3, seed, 1.3);
  else if (kind === 'air') sh.stipple(path, 0.5, t.accent, seed, 1.6);
}

function burst(ctx, x, y, len, amp, cycles, color, alpha, vertical = true) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const env = Math.sin(Math.PI * u) ** 1.5;
    const w = Math.sin(u * cycles * Math.PI * 2) * amp * env;
    const px = vertical ? x + w : x + u * len, py = vertical ? y - len / 2 + u * len : y - w;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawPulse(sh, t, st) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  // the magnified pulse goes right of the scope only when there is room for it; else below
  const narrow = W < 860 || H < 480;
  const P = physics(st);
  const s = narrow ? 0.9 : Math.max(0.9, Math.min(1.1, W / 1000));

  // geometry: the tissue column and the A-mode share one depth axis
  const top = narrow ? 46 : 96, bottom = narrow ? H - 126 : H - 44;
  const Y = (d) => top + (d / DMAX) * (bottom - top);
  const colW = narrow ? Math.min(W * 0.34, 250) : Math.min(210, W * 0.2);
  const gutter = narrow ? 14 : 112;               // room for the layer names
  const aW = narrow ? Math.min(W - 34 - colW - gutter - 40, 340) : Math.min(230, W * 0.22);
  // a wide narrow-layout figure keeps its column and scope at a readable size, centred
  const ox = narrow ? Math.max(0, (W - 34 - colW - gutter - 40 - aW) / 2) : 0;
  const colX = (narrow ? 34 : 64) + ox;
  const aX = colX + colW + gutter;
  const bX = aX + aW + 8, bW = narrow ? 14 : 18;

  // above the probe cable
  if (!narrow) sh.text('one scan line', colX - 4, top - 74, { size: 22 * s });

  // depth ruler
  for (let d = 0; d <= DMAX; d++) {
    const y = Y(d);
    sh.line(colX - 8, y, colX - (d % 5 ? 3 : 0), y, { width: 1, rough: 0.3, seed: 40 + d, stroke: t.ink2 });
    if (d % 5 === 0) sh.text(`${d}`, colX - 12, y + 4, { family: MONO, weight: 400, size: 10, align: 'right', color: t.ink2 });
  }
  if (!narrow) sh.text('cm', colX - 12, Y(DMAX) + 18, { family: MONO, weight: 400, size: 10, align: 'right', color: t.ink2 });

  // tissue layers
  LAYERS.forEach((L, i) => {
    const y0 = Y(L.from), y1 = Y(Math.min(DMAX, L.to));
    const p = new Path2D();
    p.rect(colX, y0, colW, y1 - y0);
    layerStyle(sh, t, L.kind, p, 60 + i);
    sh.line(colX, y0, colX + colW, y0, { width: L.kind === 'air' ? 2.4 : 1, seed: 80 + i, rough: 0.8, stroke: L.kind === 'air' ? t.ink : t.ink2 });
    if (narrow) {
      if (y1 - y0 > 15) {
        ctx.save();
        ctx.font = `600 ${Math.round(13 * s)}px ${HAND}`;
        const tw = ctx.measureText(L.name).width;
        ctx.fillStyle = t.paper2;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(colX + 3, (y0 + y1) / 2 - 9, tw + 6, 15);
        ctx.restore();
        sh.text(L.name, colX + 6, (y0 + y1) / 2 + 3, { size: 13 * s, color: t.ink });
      }
    } else {
      const f = sh.fit(L.name, gutter - 14, { size: 16 * s });
      sh.text(f.str, colX + colW + 8, (y0 + y1) / 2 + 5, { size: f.size, color: t.ink2 });
    }
  });
  sh.rect(colX, Y(0), colW, Y(DMAX) - Y(0), { width: 1.2, seed: 99, rough: 0.7 });
  transducer(sh, colX + colW / 2, Y(0) - 2, Math.min(56, colW * 0.4), t);

  // the traveling pulse and its echoes
  const tMax = (2 * DMAX / 100) / C;           // s, real round trip to DMAX
  const u = reducedMotion ? 1 : (clock % CYCLE_S) / CYCLE_S;
  const tr = u * tMax;                           // real time since transmit
  const cx = colX + colW / 2;
  const dPulse = (C * tr) * 100;                 // cm reached by the transmit pulse
  if (!reducedMotion && dPulse < DMAX) burst(ctx, cx, Y(dPulse), 26, 9, st.cycles * 1.5, t.accent, 0.95);
  // echoes on their way back
  const gain = (d) => (st.tgc ? Math.min(2 * ALPHA * P.f * d, 60) : 0);
  const level = (b) => b.level - P.loss(b.d);
  for (const b of BOUNDS) {
    if (b.scatter) continue;
    const t0 = (b.d / 100) / C;                  // pulse reaches the boundary
    if (tr < t0 || reducedMotion) continue;
    const dBack = b.d - (C * (tr - t0)) * 100;
    if (dBack <= 0) continue;
    const lv = level(b);
    const a = clamp((lv - NOISE) / 60, 0, 1);
    if (a <= 0.02) continue;
    burst(ctx, cx + 16, Y(dBack), 18, 3 + 7 * a, st.cycles * 1.5, t.flag, 0.25 + 0.7 * a);
  }
  if (!reducedMotion && dPulse < DMAX) {
    // narrow: the layer names fill the left of the column, so the tag goes right of the echoes
    if (narrow) {
      const tw = sh.measure('pulse', { size: 15 * s });
      ctx.save();
      ctx.fillStyle = t.paper2;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx + 28, Y(dPulse) - 8, tw + 6, 15);
      ctx.restore();
      sh.text('pulse', cx + 31, Y(dPulse) + 4, { size: 15 * s, color: t.accent });
    } else sh.text('pulse', cx - 16, Y(dPulse) + 4, { size: 15 * s, align: 'right', color: t.accent });
  }

  // ---------------- A-mode (scanner panel), filled as echoes arrive
  panel(ctx, aX, Y(0) - 22, aW + bW + 8 + 8, Y(DMAX) - Y(0) + 30, narrow ? 'A-MODE' : 'A-MODE · dB');
  const ax0 = aX + 6, ax1 = aX + aW - 6;
  const XL = (lv) => ax0 + clamp((lv - NOISE + 10) / 90, 0, 1) * (ax1 - ax0);
  // noise floor (grows with TGC gain)
  const r = rng(3);
  ctx.save();
  ctx.strokeStyle = SC.dim;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let d = 0; d <= DMAX; d += 0.06) {
    const nz = NOISE + gain(d) + 4 * r();
    const x = XL(nz);
    d ? ctx.lineTo(x, Y(d)) : ctx.moveTo(x, Y(d));
  }
  ctx.stroke();
  ctx.restore();
  // echoes that have arrived are bright; the rest keep the faint trace of the last pulse
  const arrived = (b) => reducedMotion || tr >= 2 * (b.d / 100) / C;
  ctx.save();
  ctx.strokeStyle = SC.text;
  ctx.lineWidth = 1.2;
  for (const b of BOUNDS) {
    const lv = level(b) + gain(b.d);
    const nz = NOISE + gain(b.d);
    if (lv < nz + 2) continue;
    const y = Y(b.d);
    ctx.globalAlpha = (b.scatter ? 0.7 : 1) * (arrived(b) ? 1 : 0.28);
    ctx.beginPath();
    ctx.moveTo(ax0, y);
    ctx.lineTo(XL(lv), y);
    ctx.stroke();
  }
  ctx.restore();
  // B-mode line: brightness by level above noise
  for (const b of BOUNDS) {
    const lv = level(b) + gain(b.d);
    const k = clamp((lv - (NOISE + gain(b.d))) / 55, 0, 1);
    if (k <= 0) continue;
    const g = Math.round(90 + 165 * k);
    ctx.fillStyle = `rgba(${g},${g},${g},${(0.35 + 0.65 * k) * (arrived(b) ? 1 : 0.3)})`;
    ctx.fillRect(bX, Y(b.d) - (b.scatter ? 0.8 : 1.6), bW, b.scatter ? 1.6 : 3.2);
  }
  // time axis: 13 µs per cm
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.textAlign = 'right';
  for (let d = 5; d <= 15; d += 5) ctx.fillText(`${Math.round(P.us(d))} µs`, ax1, Y(d) - 3);
  ctx.restore();
  if (!narrow) sh.text('B-mode line', bX + bW / 2, Y(DMAX) + 26, { size: 15 * s, align: 'center', color: t.ink2 });

  // posterior-wall echo marker
  const pwLv = dB(refl(Z.blood, Z.muscle)) - P.loss(PW_DEPTH) + gain(PW_DEPTH);
  const lost = pwLv < NOISE + gain(PW_DEPTH) + 2;
  if (!narrow) sh.label(lost ? 'posterior wall: below noise' : 'posterior wall echo', ax1 - 20, Y(PW_DEPTH), aX + aW + bW + 40, Y(PW_DEPTH) + 44, { size: 15 * s, color: lost ? t.flag : t.ink });

  // ---------------- zoom: the pulse to scale
  if (narrow) drawZoomStrip(sh, t, st, P, { x: 16 + ox, y: bottom + 34, w: W - 32 - 2 * ox, h: H - bottom - 44 });
  else {
    const zx = bX + bW + 70, zw = W - zx - 24, zh = Math.min(420, (bottom - top) * 0.72);
    if (zw > 160) drawZoom(sh, t, st, P, { x: zx, y: top, w: zw, h: zh }, s);
  }
}

/** Waveform of an n-cycle pulse with wavelength lam (mm) in box coordinates. */
function pulsePath(ctx, X, y, lam, n, amp, x0, extra = null) {
  const L = n * lam;
  const e = (x) => (x >= 0 && x <= L ? Math.sin((2 * Math.PI * x) / lam) * Math.sin((Math.PI * x) / L) ** 0.8 : 0);
  ctx.beginPath();
  const span = L + (extra ? extra.sep + 0.1 : 0);
  for (let i = 0; i <= 200; i++) {
    const x = (i / 200) * span;
    const v = e(x) + (extra ? 0.8 * e(x - extra.sep) : 0);
    const px = X(x0 + x), py = y - v * amp;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function drawZoomStrip(sh, t, st, P, B) {
  const ctx = sh.ctx;
  const mm = 3.2;
  const half = B.w / 2 - 8;
  const X1 = (x) => B.x + (x / mm) * half, X2 = (x) => B.x + half + 16 + (x / mm) * half;
  const y = B.y + B.h * 0.45, amp = Math.min(16, B.h * 0.2);
  sh.text('pulse, magnified', B.x, B.y - 10, { size: 15 });
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = t.accent;
  pulsePath(ctx, X1, y, P.lambda, st.cycles, amp, 0.1);
  const gap = 0.5, ok = gap >= P.axial;
  ctx.strokeStyle = ok ? t.ink : t.flag;
  pulsePath(ctx, X2, y, P.lambda, st.cycles, amp * 0.8, 0.1, { sep: 2 * gap });
  ctx.restore();
  sh.text(`λ ${P.lambda.toFixed(2)} mm`, B.x, B.y + B.h - 6, { size: 14 });
  const rt = sh.fit(['reflectors 0.5 mm apart', '0.5 mm apart'], B.x + B.w + 8 - (B.x + half + 16), { size: 15 });
  sh.text(rt.str, B.x + half + 16, B.y - 10, { size: rt.size, color: t.ink2 });
  sh.text(ok ? 'resolved' : 'one echo', B.x + half + 16, B.y + B.h - 6, { size: 14, color: ok ? t.ink : t.flag });
}

function drawZoom(sh, t, st, P, B, s) {
  const ctx = sh.ctx;
  const room = B.w + 16;                          // text may run into the right margin
  const put = (forms, x, y, o, max = room) => { const f = sh.fit(forms, max, o, 0.8); sh.text(f.str, x, y, { ...o, size: f.size }); };
  put('the pulse, magnified', B.x, B.y - 8, { size: 20 * s });
  const mm = 4;                                   // mm across the box
  const X = (x) => B.x + (x / mm) * B.w;
  // rows: fixed gaps for the text, the waves take what height is left
  const amp = clamp((B.h - 178) / 4, 12, 34);
  const extra = Math.max(0, B.h - (4 * amp + 178));
  const y1 = B.y + amp + 31 + extra * 0.3;
  const y2 = y1 + 2 * amp + 78 + extra * 0.4;
  // scale bar
  sh.line(X(0), B.y + B.h - 6, X(1), B.y + B.h - 6, { width: 1.6, seed: 31, rough: 0.3 });
  sh.text('1 mm', X(0.5), B.y + B.h - 12, { family: MONO, weight: 400, size: 10, align: 'center', color: t.ink2 });
  // the transmitted pulse
  const wave = (x0, lam, n, a, col, alpha) => {
    const pts = [];
    const L = n * lam;
    for (let i = 0; i <= 160; i++) {
      const x = (i / 160) * L;
      const env = Math.sin((Math.PI * x) / L) ** 0.8;
      pts.push([X(x0 + x), y1 - Math.sin((2 * Math.PI * x) / lam) * a * env]);
    }
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  };
  const x0 = 0.3;
  wave(x0, P.lambda, st.cycles, amp, t.accent, 1);
  // wavelength bracket: crest to crest
  const c1 = x0 + P.lambda * 0.25, c2 = c1 + P.lambda;
  if (st.cycles >= 2) {
    sh.line(X(c1), y1 - amp - 10, X(c2), y1 - amp - 10, { width: 1, seed: 32, rough: 0.3, stroke: t.ink2 });
    const lx = Math.max(B.x + 20, (X(c1) + X(c2)) / 2);
    put(`λ ${P.lambda.toFixed(2)} mm`, lx, y1 - amp - 16, { size: 16 * s, align: 'center' });
  } else {
    put(`λ ${P.lambda.toFixed(2)} mm`, X(x0), y1 - amp - 16, { size: 16 * s });
  }
  sh.line(X(x0), y1 + amp + 12, X(x0 + P.spl), y1 + amp + 12, { width: 1, seed: 33, rough: 0.3, stroke: t.ink2 });
  put(`pulse length ${P.spl.toFixed(2)} mm`, X(x0), y1 + amp + 30, { size: 16 * s }, B.x + room - X(x0));

  // two reflectors 0.5 mm apart and their echoes
  const gap = 0.5;
  put([`two reflectors ${gap} mm apart`, `reflectors ${gap} mm apart`], B.x, y2 - amp - 26, { size: 17 * s, color: t.ink2 });
  // echoes are spaced by twice the gap in the round-trip path
  const sep = 2 * gap;
  const ok = gap >= P.axial;
  const pts = [];
  const L = P.spl, lam = P.lambda;
  const e = (x) => (x >= 0 && x <= L ? Math.sin((2 * Math.PI * x) / lam) * Math.sin((Math.PI * x) / L) ** 0.8 : 0);
  for (let i = 0; i <= 240; i++) {
    const x = (i / 240) * (L + sep + 0.2);
    pts.push([X(x0 + x), y2 - (e(x) + 0.8 * e(x - sep)) * amp * 0.8]);
  }
  ctx.save();
  ctx.strokeStyle = ok ? t.ink : t.flag;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
  put(ok ? ['two separate echoes', 'two echoes'] : ['the echoes overlap: one echo', 'overlap: one echo'], X(x0), y2 + amp + 20, { size: 17 * s, color: ok ? t.ink : t.flag }, B.x + room - X(x0));
  const ax = P.axial.toFixed(2);
  put([`axial resolution = pulse length ÷ 2 = ${ax} mm`, `axial resolution = ${ax} mm`], B.x, y2 + amp + 44, { family: SANS, weight: 400, size: 12, color: t.ink2 });
}

// ---------------------------------------------------------------- chapter
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
let sheet = null;

export default {
  key: 'pulse',
  part: 'physics',
  title: 'Pulse',
  dwell: 12,
  defaults: { freq: 2.5, cycles: 2, tgc: false },
  format: {
    freq: (v) => `${v.toFixed(1)} MHz`,
  },
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => drawPulse(sh, t, this.st));
    return sheet;
  },
  init({ state }) { this.st = state; },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ freq: 2, cycles: 2, tgc: false }); },
  tourTick(tt, set) {
    // 2 -> 7 MHz over the first 8 s, then TGC on
    set({ freq: Math.round(mix(2, 7, clamp((tt - 1.5) / 7, 0, 1)) * 10) / 10 });
    if (tt > 9.5) set({ tgc: true });
  },
  // the time of the tour at which tourTick shows this frequency (2 to 7 MHz from 1.5 to 8.5 s)
  tourAt(s) { return 1.5 + ((clamp(s.freq, 2, 7) - 2) / 5) * 7; },
  text(st) {
    const P = physics(st);
    const pw = dB(refl(Z.blood, Z.muscle)) - P.loss(PW_DEPTH);
    const lost = pw < NOISE;
    return {
      readouts: [
        { k: 'Wavelength', v: fmt(P.lambda, 2), u: 'mm' },
        { k: 'Pulse length', v: fmt(P.spl, 2), u: 'mm' },
        { k: 'Axial resolution', v: fmt(P.axial, 2), u: 'mm' },
        { k: 'Wall echo time', v: fmt(P.us(PW_DEPTH), 0), u: 'µs' },
        { k: 'Round-trip loss', v: fmt(P.loss(PW_DEPTH), 0), u: 'dB', flag: lost },
        { k: 'Usable depth', v: fmt(P.usable, 1), u: 'cm', flag: P.usable < 12 },
      ],
      live: `At ${fmt(P.f, 1)} MHz the wavelength is ${fmt(P.lambda, 2)} mm. A ${st.cycles}-cycle pulse has a spatial pulse length of ${fmt(P.spl, 2)} mm, which gives an axial resolution of <b>${fmt(P.axial, 2)} mm</b>. The echo from the posterior wall at 10.3 cm returns after ${fmt(P.us(PW_DEPTH), 0)} µs and is attenuated by ${fmt(P.loss(PW_DEPTH), 0)} dB over the round trip${lost ? '; <span class="k-red">its level is below the noise floor</span>' : ''}.${st.tgc ? ' Time gain compensation amplifies the deep echoes and also amplifies the noise at the same depths.' : ''}`,
    };
  },
};
