// 07 Shift: the Doppler equation. The beam meets moving blood at an angle; the scanner turns
// the frequency shift into velocity, assumes the angle is zero, and (in pulsed modes) can only
// measure up to the Nyquist limit set by the sample depth.
import { Sheet, clamp, mix, MONO, SANS, rng } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, colorOf, colorBar, SC } from '../scope.js';
import { PHYS } from '../physics.js';

const C = PHYS.c;
const RRs = 0.857;          // s, one beat at 70 per minute
const EJ = 0.3;             // s, ejection

/** Flow toward the probe over one beat, as a fraction of the peak (t in s). */
const shape = (t) => {
  const u = (((t % RRs) + RRs) % RRs) / EJ;
  return u < 1 ? Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.8) : 0;
};

export function doppler(s) {
  const f0 = s.f0 * 1e6, d = s.sdepth / 100, th = (s.angle * Math.PI) / 180;
  const vm = s.vtrue * Math.cos(th);                 // what the scanner reports
  const shift = (2 * f0 * vm) / C;                    // Hz
  const prf = C / (2 * d);                            // Hz, deepest sample sets the pulse rate
  const nyq = (C * prf) / (4 * f0);                   // m/s at zero angle: c^2 / (8 d f0)
  return { vm, shift, prf, nyq, under: 1 - Math.cos(th), alias: s.dmode !== 'cw' && vm > nyq };
}

let sheet = null, st = null, clock = 0;
const R = rng(21);
const CELLS = Array.from({ length: 70 }, () => ({ x: R(), r: R() * 2 - 1, k: 0.6 + 0.4 * R() }));

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const D = doppler(st);
  const s = narrow ? 0.85 : 1;
  const th = (st.angle * Math.PI) / 180;

  // ---------------- the beam and the vessel
  // The probe sits at the top and sends its beam straight down; the vessel crosses the beam
  // at the sample point, tilted so that flow meets the beam at the chosen angle.
  const topH = narrow ? H * 0.46 : H * 0.5;
  const Sx = narrow ? W * 0.5 : W * 0.6, Sy = topH * (narrow ? 0.66 : 0.64);
  const Tx = Sx, Ty = narrow ? 30 : 70;
  const vr = narrow ? 15 : 20;
  const fx = -Math.sin(th), fy = -Math.cos(th);           // flow direction: toward the probe side
  const nx = -fy, ny = fx;                                 // across the vessel
  const Lv = Math.hypot(W, topH);
  const clip = new Path2D();
  clip.rect(0, Ty + 34, W, topH - Ty - 34);
  ctx.save();
  ctx.clip(clip);
  const tube = new Path2D();
  tube.moveTo(Sx - fx * Lv + nx * vr, Sy - fy * Lv + ny * vr);
  tube.lineTo(Sx + fx * Lv + nx * vr, Sy + fy * Lv + ny * vr);
  tube.lineTo(Sx + fx * Lv - nx * vr, Sy + fy * Lv - ny * vr);
  tube.lineTo(Sx - fx * Lv - nx * vr, Sy - fy * Lv - ny * vr);
  tube.closePath();
  sh.hatch(tube, Math.atan2(fy, fx) + 0.7, 7, t.flag, 0.7, 5, 0.22);
  for (const k of [1, -1]) sh.line(Sx - fx * Lv + k * nx * vr, Sy - fy * Lv + k * ny * vr, Sx + fx * Lv + k * nx * vr, Sy + fy * Lv + k * ny * vr, { width: 1.4, rough: 0.6, seed: 2 + k });
  // cells move downstream, faster in the middle (parabolic profile)
  const vNow = st.vtrue * shape(clock);
  ctx.fillStyle = t.flag;
  for (const c of CELLS) {
    const prof = 1 - c.r * c.r;
    const along = (((c.x * 2 - 1) * Lv + clock * 60 * prof * c.k * (0.2 + st.vtrue)) % (2 * Lv) + 2 * Lv) % (2 * Lv) - Lv;
    const x = Sx + fx * along + nx * c.r * (vr - 4), y = Sy + fy * along + ny * c.r * (vr - 4);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(x, y, 3.2, 2.2, Math.atan2(fy, fx), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // color box over the vessel
  if (st.dmode === 'color') {
    const half = narrow ? 70 : 110;
    for (let x = Sx - half; x < Sx + half; x += 3) {
      for (let y = Sy - half * 0.6; y < Sy + half * 0.6; y += 3) {
        const r = ((x - Sx) * nx + (y - Sy) * ny) / vr;
        if (Math.abs(r) >= 1) continue;
        const v = vNow * (1 - r * r) * Math.cos(th);
        if (v < 0.03) continue;
        const [cr, cg, cb] = colorOf(v, D.nyq);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(x, y, 3, 3);
      }
    }
    ctx.strokeStyle = t.ink2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(Sx - half, Sy - half * 0.6, 2 * half, 1.2 * half);
    ctx.setLineDash([]);
  }
  ctx.restore();
  // flow arrow, downstream
  const ax = Sx - fx * (narrow ? 90 : 150) + nx * (vr + 18), ay = Sy - fy * (narrow ? 90 : 150) + ny * (vr + 18);
  sh.line(ax, ay, ax + fx * 44, ay + fy * 44, { width: 1.3, rough: 0.3, seed: 4, stroke: t.flag });
  sh.line(ax + fx * 44, ay + fy * 44, ax + fx * 36 + nx * 5, ay + fy * 36 + ny * 5, { width: 1.3, rough: 0.2, seed: 5, stroke: t.flag });
  sh.line(ax + fx * 44, ay + fy * 44, ax + fx * 36 - nx * 5, ay + fy * 36 - ny * 5, { width: 1.3, rough: 0.2, seed: 6, stroke: t.flag });
  sh.text('flow', ax + nx * 16, ay + ny * 16 + 4, { size: 17 * s, color: t.flag, align: 'center' });
  // beam
  const end = st.dmode === 'cw' ? topH - Ty - 6 : Sy - Ty;
  sh.line(Tx, Ty, Tx, Ty + end, { width: st.dmode === 'cw' ? 2 : 1.4, rough: 0.3, seed: 7, stroke: t.accent, dash: st.dmode === 'cw' ? undefined : [7, 5] });
  // transducer
  ctx.fillStyle = t.ink3;
  ctx.fillRect(Tx - 14, Ty - 26, 28, 22);
  ctx.fillStyle = t.ink;
  ctx.fillRect(Tx - 16, Ty - 5, 32, 4);
  // sample volume
  if (st.dmode === 'pw') {
    for (const k of [-5, 5]) sh.line(Sx - 9, Sy + k, Sx + 9, Sy + k, { width: 2, rough: 0.2, seed: 8 + k, stroke: t.ink });
    sh.text('sample volume', Sx + 16, Sy + 4, { size: 16 * s });
  } else if (st.dmode === 'cw') {
    sh.text('CW: every depth along the line', Sx + 12, Ty + 60, { size: 16 * s });
  } else {
    sh.text('color box', Sx + (narrow ? 72 : 112), Sy - (narrow ? 44 : 70), { size: 15 * s, color: t.ink2 });
  }
  // angle between beam and flow
  if (st.angle > 2) {
    ctx.save();
    ctx.strokeStyle = t.ink2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Sx, Sy, 52, -Math.PI / 2 - th, -Math.PI / 2);
    ctx.stroke();
    ctx.restore();
    const am = -Math.PI / 2 - th / 2;
    sh.text(`θ ${st.angle}°`, Sx + 70 * Math.cos(am), Sy + 70 * Math.sin(am) + 5, { size: 18 * s, align: 'center' });
  }

  // equation card
  if (!narrow) {
    const ex = 24, ey = 34;
    sh.text('Doppler shift  Δf = 2 · f0 · v · cos θ / c', ex, ey, { family: MONO, weight: 500, size: 12.5 });
    sh.text(`= 2 · ${st.f0.toFixed(1)} MHz · ${st.vtrue.toFixed(2)} m/s · ${Math.cos(th).toFixed(2)} / 1540 m/s = ${(D.shift / 1000).toFixed(2)} kHz`, ex, ey + 20, { family: MONO, weight: 400, size: 12, color: t.ink2 });
    if (st.dmode !== 'cw') sh.text(`Nyquist limit = c² / (8 · depth · f0) = ${D.nyq.toFixed(2)} m/s at ${st.sdepth} cm`, ex, ey + 40, { family: MONO, weight: 400, size: 12, color: t.ink2 });
  }

  // ---------------- the scanner display
  const px = narrow ? 10 : 24, py = topH + (narrow ? 8 : 16), pw = W - px * 2 - (narrow ? 26 : 40), ph = H - py - (narrow ? 12 : 26);
  if (st.dmode === 'color') {
    panel(ctx, px, py, pw + (narrow ? 26 : 40), ph, 'COLOR · VELOCITY SCALE');
    colorBar(ctx, px + 24, py + 34, ph - 70, D.nyq);
    // a profile across the vessel at the peak of systole, as the display would color it
    const gx = px + 90, gw = pw - 120, gy = py + 40, gh = ph - 80;
    ctx.save();
    for (let i = 0; i < gh; i++) {
      const r = (i / gh) * 2 - 1;
      const v = st.vtrue * (1 - r * r) * Math.cos(th);
      const [cr, cg, cb] = v < 0.03 ? [16, 19, 21] : colorOf(v, D.nyq);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(gx, gy + i, gw, 1.2);
    }
    ctx.restore();
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.text;
    ctx.fillText('vessel at peak systole: center fastest', gx, gy - 8);
    if (D.alias) { ctx.fillStyle = SC.cal; ctx.fillText('aliasing: the center wraps to the other color', gx, gy + gh + 18); }
    ctx.restore();
  } else {
    const nyq = D.nyq;
    const scale = st.dmode === 'cw' ? Math.max(1.5, Math.ceil(D.vm * 1.25 * 2) / 2) : nyq;
    panel(ctx, px, py, pw + (narrow ? 26 : 40), ph, st.dmode === 'cw' ? 'CW DOPPLER' : 'PW DOPPLER');
    const box = { x: px + 6, y: py + 24, w: pw - 8, h: ph - 30 };
    const beats = narrow ? 2 : 3;
    spectral(ctx, box, {
      fn: (u) => D.vm * shape(u * beats * RRs),
      scale, base: 0.62, mode: st.dmode, nyq: st.dmode === 'cw' ? Infinity : nyq, broad: st.dmode === 'cw' ? 0.6 : 0.1,
      key: `shift|${st.dmode}|${D.vm.toFixed(3)}|${scale.toFixed(3)}|${beats}`, seed: 9,
    });
    vscale(ctx, box, scale, 0.62, scale > 2 ? 1 : 0.5);
    // measured peak and the Nyquist line
    const k = (box.h * 0.62) / scale;
    const yb = box.y + box.h * 0.62;
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    if (!D.alias) {
      ctx.strokeStyle = SC.cal;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(box.x, yb - D.vm * k);
      ctx.lineTo(box.x + box.w, yb - D.vm * k);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = SC.cal;
      ctx.fillText(`${D.vm.toFixed(2)} m/s`, box.x + 8, yb - D.vm * k - 5);
    } else {
      ctx.fillStyle = SC.cal;
      ctx.fillText('aliasing: the peak wraps below the baseline', box.x + 8, box.y + 16);
    }
    ctx.restore();
  }
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'shift',
  part: 'doppler',
  title: 'Shift',
  dwell: 16,
  defaults: { dmode: 'pw', angle: 0, vtrue: 1.0, sdepth: 10, f0: 2.5 },
  format: {
    angle: (v) => `${v}°`,
    vtrue: (v) => `${v.toFixed(2)} m/s`,
    sdepth: (v) => `${v.toFixed(1)} cm`,
    f0: (v) => `${v.toFixed(1)} MHz`,
  },
  watch: ['dmode', 'angle', 'vtrue', 'sdepth', 'f0'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ dmode: 'pw', angle: 0, vtrue: 1.0, sdepth: 10, f0: 2.5 }); },
  tourTick(tt, set) {
    if (tt < 5) set({ angle: Math.round(clamp((tt - 1) / 3.5, 0, 1) * 60) });
    else if (tt < 10) set({ angle: 0, vtrue: Math.round(mix(1.0, 2.0, clamp((tt - 5.5) / 3.5, 0, 1)) * 20) / 20 });
    else if (tt < 13) set({ dmode: 'cw' });
    else set({ dmode: 'color', vtrue: 1.0 });
  },
  text(s, { cite }) {
    const D = doppler(s);
    const readouts = [
      { k: 'Doppler shift', v: fmt(D.shift / 1000, 2), u: 'kHz' },
      { k: 'Measured', v: fmt(D.vm, 2), u: 'm/s', flag: D.alias },
      { k: 'Underestimate', v: fmt(D.under * 100, 0), u: '%', flag: D.under > 0.06 },
    ];
    if (s.dmode !== 'cw') {
      readouts.push({ k: 'Pulse rate (PRF)', v: fmt(D.prf / 1000, 1), u: 'kHz' });
      readouts.push({ k: 'Nyquist limit', v: fmt(D.nyq, 2), u: 'm/s', flag: D.alias });
    } else readouts.push({ k: 'Nyquist limit', v: 'none', text: true });
    readouts.push({ k: 'Signal', v: D.alias ? 'aliased' : 'clean', text: true, flag: D.alias });
    let live = `The blood moves at ${fmt(s.vtrue, 2)} m/s. At ${s.angle}° the scanner reports ${fmt(D.vm, 2)} m/s, ${fmt(D.under * 100, 0)}% low: it assumes the beam runs parallel to the flow${cite('quinones2002')}. `;
    if (s.dmode === 'cw') live += 'Continuous wave listens at every depth along the line: no aliasing, and no way to know which depth the fastest signal came from.';
    else if (s.dmode === 'color') live += `Color shows the mean velocity in each small sample of the box: red toward the probe, blue away${cite('mitchell2019')}. ${D.alias ? `<span class="k-red">The center of the vessel passes ${fmt(D.nyq, 2)} m/s and wraps to the other color.</span>` : `Nothing passes the ${fmt(D.nyq, 2)} m/s limit, so nothing wraps.`}`;
    else if (D.alias) live += `<span class="k-red">The velocity passes the Nyquist limit of ${fmt(D.nyq, 2)} m/s and aliases.</span> Move the sample closer, lower the Doppler frequency, or change to continuous wave.`;
    else live += `The sample at ${fmt(s.sdepth, 1)} cm allows ${fmt(D.prf / 1000, 1)} thousand pulses a second: velocities to ${fmt(D.nyq, 2)} m/s measure without aliasing.`;
    return { readouts, live };
  },
};
