// 02 Image: a sector frame is built one scan line at a time. Depth and line count set the
// frame rate; the focus sets where lateral detail is sharpest; strong reflectors make artifacts.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { scanner } from '../scanner.js';
import { PHYS } from '../physics.js';

const C = PHYS.c;
let sheet = null, st = null, setState = null, scan = null, ev = null, frameKey = '', clock = 0;

export function timing(s) {
  const lines = Math.max(8, Math.round(s.sector * s.density));
  const tLine = ((2 * s.depth / 100) / C) * 1e6;      // µs per line
  const frameMs = (lines * tLine) / 1000;
  return { lines, tLine, frameMs, fps: 1000 / frameMs };
}

function ensure() {
  if (scan) return;
  scanner().then((sc) => { scan = sc; if (sheet) sheet.dirty = true; }).catch(() => {});
}

/** The frame for the current depth and sector width, cut once and cached. */
function frame(w, h) {
  if (!scan) return null;
  const key = `${w}x${h}|${st.depth}|${st.sector}`;
  if (key === frameKey && ev) return ev;
  ev = scan.make(w, h, 'plax', { depth: st.depth, angle: st.sector, labels: false });
  ev.frame({ s: 0, v: 0, drive: null, phase: 0 });
  frameKey = key;
  return ev;
}

function wedge(cx, top, R, a0, a1) {
  const p = new Path2D();
  p.moveTo(cx, top);
  p.arc(cx, top, R, Math.PI / 2 - a1, Math.PI / 2 - a0, false);
  p.closePath();
  return p;
}

function draw(sh, t) {
  const ctx = sh.ctx, W = sh.w, H = sh.h;
  const narrow = W < 700;
  const T = timing(st);
  const sw = narrow ? W - 24 : Math.min(W * 0.6, (H - 70) * 1.35);
  const sh0 = narrow ? H * 0.64 : H - 70;
  const x0 = narrow ? 12 : 16, y0 = narrow ? 8 : 30;
  const E = frame(Math.round(sw), Math.round(sh0));
  if (!E) {
    sh.text('cutting the heart model…', x0 + 20, y0 + 40, { size: 18, color: t.ink3 });
    return;
  }
  const m = E.map;
  const cx = x0 + m.cx, top = y0 + m.top, R = m.spec.depth * m.scale, half = m.half;
  const Xp = (u) => x0 + m.X(u), Yp = (v) => y0 + m.Y(v);

  // the sweep: lines to the left of the current line belong to the new frame
  const period = 2.6;                 // s per frame on screen (the real frame takes T.frameMs)
  const u = reducedMotion ? 1 : (clock % period) / period;
  const aNow = -half + u * 2 * half;  // angle of the line being fired, from the beam axis
  // the rest of the sector still shows the previous frame, dimmed
  ctx.drawImage(E.canvas, x0, y0, sw, sh0);
  ctx.save();
  ctx.clip(wedge(cx, top, R + 2, aNow, half + 0.01));
  ctx.fillStyle = 'rgba(8,10,12,0.5)';
  ctx.fillRect(x0, y0, sw, sh0);
  ctx.restore();
  ctx.save();
  ctx.clip(wedge(cx, top, R + 2, -half, aNow));
  // lateral blur grows with distance from the focus (where the canvas supports filters)
  const bands = 8;
  const canBlur = 'filter' in ctx;
  for (let b = 0; b < bands; b++) {
    const r0 = (b / bands) * R, r1 = ((b + 1) / bands) * R;
    const z = ((b + 0.5) / bands) * m.spec.depth;
    const blur = canBlur ? clamp(Math.abs(z - st.focus) / m.spec.depth, 0, 1) * 3.2 : 0;
    ctx.save();
    const ring = new Path2D();
    ring.arc(cx, top, r1, 0, Math.PI * 2);
    ring.arc(cx, top, r0, 0, Math.PI * 2, true);
    ctx.clip(ring, 'evenodd');
    if (blur > 0.2) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.drawImage(E.canvas, x0, y0, sw, sh0);
    ctx.restore();
  }
  ctx.restore();

  // artifacts, drawn from the structures in this frame
  drawArtifact(ctx, t, E, x0, y0, cx, top, R, half, Xp, Yp, narrow);

  // scan lines
  ctx.save();
  ctx.strokeStyle = 'rgba(160,200,235,0.18)';
  ctx.lineWidth = 0.6;
  const step = T.lines > 160 ? 2 : 1;
  for (let i = 0; i < T.lines; i += step) {
    const a = -half + ((i + 0.5) / T.lines) * 2 * half;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + Math.sin(a) * R, top + Math.cos(a) * R);
    ctx.stroke();
  }
  if (!reducedMotion) {
    ctx.strokeStyle = t.accent;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + Math.sin(aNow) * R, top + Math.cos(aNow) * R);
    ctx.stroke();
  }
  ctx.restore();
  // focus marker and depth ticks
  ctx.save();
  ctx.fillStyle = t.ink2;
  ctx.strokeStyle = t.ink2;
  ctx.font = `500 10px ${MONO}`;
  for (let d = 1; d < m.spec.depth; d++) {
    const x = cx + Math.sin(half) * d * m.scale, y = top + Math.cos(half) * d * m.scale;
    ctx.beginPath();
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 2 + (d % 5 ? 3.5 : 7), y);
    ctx.stroke();
    if (d % 5 === 0) ctx.fillText(String(d), x + 12, y + 3.5);
  }
  const fy = top + Math.cos(half) * st.focus * m.scale, fx = cx + Math.sin(half) * st.focus * m.scale;
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.moveTo(fx + 12, fy);
  ctx.lineTo(fx + 21, fy - 5);
  ctx.lineTo(fx + 21, fy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ---------------- timing and beam width
  const px = narrow ? 16 : x0 + sw + 34, pw = narrow ? W - 32 : W - px - 20;
  const py = narrow ? y0 + sh0 + 26 : y0 + 30;
  drawTiming(sh, t, T, px, py, pw, narrow);
  if (!narrow) drawBeam(sh, t, px, py + 150, Math.min(pw, 260), Math.min(H - py - 190, 380));
}

function drawTiming(sh, t, T, x, y, w, narrow) {
  const ctx = sh.ctx;
  sh.text('one frame', x, y, { size: narrow ? 17 : 21 });
  const by = y + 16, bh = 16;
  sh.rect(x, by, w, bh, { width: 1.1, seed: 4, rough: 0.6 });
  const n = T.lines, k = n > 90 ? Math.ceil(n / 90) : 1;
  ctx.save();
  ctx.strokeStyle = t.ink2;
  ctx.lineWidth = 0.7;
  for (let i = 1; i < n; i += k) {
    const xx = x + (i / n) * w;
    ctx.beginPath();
    ctx.moveTo(xx, by + 2);
    ctx.lineTo(xx, by + bh - 2);
    ctx.stroke();
  }
  // one line highlighted
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x, by, w / n, bh);
  ctx.restore();
  sh.text(`${n} lines × ${T.tLine.toFixed(0)} µs = ${T.frameMs.toFixed(1)} ms`, x, by + bh + 20, { family: MONO, weight: 500, size: narrow ? 11 : 12 });
  sh.text(`${T.fps.toFixed(0)} frames per second`, x, by + bh + (narrow ? 38 : 44), { size: narrow ? 16 : 20, color: T.fps < 30 ? t.flag : t.ink });
}

function drawBeam(sh, t, x, y, w, h) {
  if (h < 120) return;
  const ctx = sh.ctx;
  sh.text('beam width', x, y, { size: 21 });
  const D = st.depth, F = st.focus;
  const Y = (z) => y + 20 + (z / D) * (h - 30);
  const cxb = x + w * 0.32, w0 = 3.5, zr = D * 0.2;
  const half = (z) => w0 * Math.sqrt(1 + ((z - F) / zr) ** 2) * 2.2;
  const L = [], Rr = [];
  for (let z = 0; z <= D + 1e-6; z += D / 40) { L.push([cxb - half(z), Y(z)]); Rr.push([cxb + half(z), Y(z)]); }
  const path = new Path2D();
  L.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
  for (let i = Rr.length - 1; i >= 0; i--) path.lineTo(Rr[i][0], Rr[i][1]);
  path.closePath();
  sh.hatch(path, -0.8, 4.5, t.accent, 0.8, 21, 0.5);
  sh.curve(L, { width: 1.3, seed: 22, rough: 0.5 });
  sh.curve(Rr, { width: 1.3, seed: 23, rough: 0.5 });
  sh.text('narrowest at the focus:', cxb + half(F) + 12, Y(F) - 4, { size: 16 });
  sh.text('sharpest side-to-side detail', cxb + half(F) + 12, Y(F) + 14, { size: 16, color: t.ink2 });
  if (D - F > D * 0.25) sh.text('wider beam, more blur', cxb + half(D) + 10, Y(D) - 4, { size: 16, color: t.ink2 });
  ctx.save();
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.moveTo(cxb - half(F) - 14, Y(F));
  ctx.lineTo(cxb - half(F) - 24, Y(F) - 5);
  ctx.lineTo(cxb - half(F) - 24, Y(F) + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  sh.text(`${F.toFixed(1)} cm`, cxb - half(F) - 28, Y(F) + 4, { family: MONO, weight: 400, size: 10, align: 'right', color: t.ink2 });
}

// ---------------------------------------------------------------- artifacts
function chip(ctx, t, text, x, y) {
  ctx.save();
  ctx.font = `600 12px ${SANS}`;
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(8,10,12,0.72)';
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = '#ffe89a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function drawArtifact(ctx, t, E, x0, y0, cx, top, R, half, Xp, Yp, narrow) {
  const kind = st.artifact;
  if (kind === 'none' || !E.last) return;
  const g = E.geoms.plax;
  const an = E.anchors(0);
  const fan = new Path2D();
  fan.moveTo(cx, top);
  fan.arc(cx, top, R, Math.PI / 2 + half, Math.PI / 2 - half, true);
  fan.closePath();
  ctx.save();
  ctx.clip(fan);
  const polar = (u, v) => [Math.hypot(u, v), Math.atan2(u, v)];   // r (cm), angle from the axis
  const pt = (r, a) => [cx + Math.sin(a) * r * E.map.scale, top + Math.cos(a) * r * E.map.scale];
  // a strong reflector: a mechanical mitral prosthesis at the mitral annulus
  const q = E.toPlane(an.mv, g);
  const [rv, av] = polar(q[0], q[1]);
  const span = 0.11;                         // radians of the ring across the beam
  const ring = (r, alpha, width) => {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = av - span + (2 * span * i) / n;
      const [x, y] = pt(r, a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };
  if (kind === 'shadow' || kind === 'reverb' || kind === 'lobe') {
    if (kind === 'shadow') {
      // nothing gets past the ring: a dark band along its scan lines
      const p = new Path2D();
      const [ax, ay] = pt(rv + 0.2, av - span), [bx, by] = pt(rv + 0.2, av + span);
      p.moveTo(ax, ay);
      p.lineTo(cx + Math.sin(av - span) * R * 1.05, top + Math.cos(av - span) * R * 1.05);
      p.lineTo(cx + Math.sin(av + span) * R * 1.05, top + Math.cos(av + span) * R * 1.05);
      p.lineTo(bx, by);
      p.closePath();
      ctx.fillStyle = 'rgba(10,12,14,0.93)';
      ctx.fill(p);
    }
    if (kind === 'reverb') {
      // the pulse bounces between the two faces of the ring: copies at equal spacing behind it
      for (let k = 1; k <= 5; k++) ring(rv + k * 0.75, 0.75 - k * 0.12, 2.2);
    }
    if (kind === 'lobe') {
      // energy off the main beam returns from the ring and is drawn along the main beam:
      // a faint arc at the ring's depth
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, top, rv * E.map.scale, Math.PI / 2 - (av + 0.55), Math.PI / 2 - (av - 0.55), false);
      ctx.stroke();
      ctx.restore();
    }
    ring(rv, 1, 4);
    ring(rv + 0.28, 0.9, 3);
  }
  if (kind === 'mirror') {
    // the pericardium behind the LV is a strong, smooth reflector: structures in front of it
    // reappear behind it at the same distance
    const peri = (E.last.peri || []).map((L) => L.pts).flat();
    const behind = peri.filter(([u, v]) => Math.abs(u) < 3 && v > 8);
    if (behind.length > 4) {
      const vm = behind.reduce((s, p) => s + p[1], 0) / behind.length;
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.4;
      for (const L of E.last.tissue) {
        if (!L.closed) continue;
        ctx.beginPath();
        let started = false;
        for (const [u, v] of L.pts) {
          if (v < vm - 4.5 || v > vm) { started = false; continue; }
          const vv = 2 * vm - v;           // reflected across the pericardial line
          const x = Xp(u), y = Yp(vv);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
      chip(ctx, t, 'mirror image', Xp(0), Yp(vm + 2.6));
      return;
    }
  }
  ctx.restore();
  const [lx, ly] = pt(rv + (kind === 'lobe' ? 0 : 2.4), kind === 'lobe' ? av - 0.5 : av);
  chip(ctx, t, { shadow: 'acoustic shadow', reverb: 'reverberations', lobe: 'side-lobe arc' }[kind], lx, ly);
  const [mx, my] = pt(rv - 0.9, av);
  chip(ctx, t, 'mechanical valve', mx, my);
}

export default {
  key: 'image',
  part: 'physics',
  title: 'Image',
  dwell: 16,
  defaults: { depth: 16, sector: 80, density: 1.2, focus: 10, artifact: 'none' },
  format: {
    depth: (v) => `${v} cm`,
    sector: (v) => `${v}°`,
    density: (v, s) => `${Math.round(s.sector * v)} lines`,
    focus: (v) => `${v.toFixed(1)} cm`,
  },
  watch: ['depth', 'sector', 'density', 'focus', 'artifact'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) { st = state; setState = set; },
  enter() { ensure(); },
  warm() { ensure(); },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt;
    if (sheet) sheet.dirty = true;
  },
  onState(s, ch) {
    // the focus cannot sit below the bottom of the image
    if (('focus' in ch || 'depth' in ch) && s.focus > s.depth - 1) setState({ focus: s.depth - 1 });
  },
  tourEnter(set) { set({ depth: 16, sector: 80, density: 1.2, focus: 10, artifact: 'none' }); },
  tourTick(tt, set) {
    if (tt < 5) set({ depth: 16 + Math.round(clamp((tt - 1) / 3, 0, 1) * 8) });
    else if (tt < 6) set({ depth: 16 });
    const arts = ['reverb', 'shadow', 'mirror', 'lobe'];
    if (tt >= 6) set({ artifact: arts[Math.min(3, Math.floor((tt - 6) / 2.5))] });
  },
  text(s) {
    const T = timing(s);
    const notes = {
      none: '',
      reverb: ' A mechanical valve returns so much energy that the pulse bounces between its faces: <b>reverberations</b> repeat behind it at equal spacing.',
      shadow: ' The same valve blocks the beam: nothing is drawn behind it, an <b>acoustic shadow</b>.',
      mirror: ' The pericardium behind the heart acts as a mirror: the scanner draws a <b>duplicate</b> of the structures in front of it, behind it.',
      lobe: ' Weak beams off the main axis still return from a strong reflector, and the scanner draws them on the main beam: a <b>side-lobe arc</b> at the reflector\'s depth.',
    };
    return {
      readouts: [
        { k: 'Scan lines', v: String(T.lines) },
        { k: 'Time per line', v: T.tLine.toFixed(0), u: 'µs' },
        { k: 'Frame rate', v: T.fps.toFixed(0), u: '/s', flag: T.fps < 30 },
      ],
      live: `At ${s.depth} cm each line waits ${T.tLine.toFixed(0)} µs for its deepest echo. ${T.lines} lines make one frame in ${T.frameMs.toFixed(1)} ms: <b>${T.fps.toFixed(0)} frames per second</b>.${notes[s.artifact]}`,
    };
  },
};
