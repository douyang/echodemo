// 12 Narrow: valve stenosis. Aortic: the continuity equation, peak velocity and mean gradient,
// and why flow matters. Mitral: the pressure half-time and a mean gradient that rises with
// heart rate.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { asGrade, msGrade } from '../norms.js';
import { BSA } from './pressure.js';

const ET = 0.292;                    // s, ejection time, held constant (Alhakak 2025 mean)
const LVOT_D = 2.0;                  // cm
const LVOT_CSA = Math.PI * (LVOT_D / 2) ** 2;
const mean = (fn, n = 400) => { let a = 0; for (let i = 0; i < n; i++) a += fn((i + 0.5) / n); return a / n; };
const lvotShape = (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.8) : 0);
const K_LVOT = mean(lvotShape);

/** Aortic jet envelope over ejection: later and rounder peak as the valve narrows. */
function avShape(sev) {
  const q = mix(0.78, 1.18, sev);
  return (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * Math.pow(u, q)), 0.6) : 0);
}

export function aortic(s) {
  const sev = clamp((1.6 - s.ava) / 1.0, 0, 1);
  const g = avShape(sev);
  const f1 = mean(g), f2 = mean((u) => g(u) ** 2);
  const vtiL = s.sv / LVOT_CSA, vtiA = s.sv / s.ava;         // cm
  const vL = vtiL / (100 * ET * K_LVOT), vmax = vtiA / (100 * ET * f1);
  const mg = 4 * vmax * vmax * f2;
  const svi = s.sv / BSA;
  return { sev, g, vtiL, vtiA, vL, vmax, mg, peak: 4 * vmax * vmax, dvi: vtiL / vtiA, svi, grade: asGrade({ vmax, mean: mg, ava: s.ava }) };
}

export function mitral(s) {
  const RRms = 60000 / s.hr;
  const qs2 = 541 - 2.2 * s.hr;                              // ms, Boudoulas 1981 (men)
  const ivrt = 96 * Math.sqrt(RRms / 857);
  const dfp = Math.max(80, RRms - qs2 - ivrt);                 // ms of filling
  const pht = 220 / s.mva;                                    // ms (MVA = 220 / PHT)
  const dt = pht / (1 - Math.SQRT1_2);                        // linear fall: time to zero flow
  const env = (t) => Math.max(0, 1 - t / dt) + 0.25 * (t > dfp - 120 ? Math.sin(Math.PI * (t - dfp + 120) / 120) : 0);
  const unit = mean((u) => env(u * dfp)) * dfp / 1000;       // s: VTI per 1 m/s of v0
  const v0 = (s.sv / s.mva) / 100 / unit;                     // m/s, so that area x VTI = SV
  const mg = 4 * v0 * v0 * mean((u) => env(u * dfp) ** 2);
  return { RRms, dfp, pht, dt, env, v0, mg, grade: msGrade(s.mva) };
}

let sheet = null, st = null;

function scaleBar(sh, t, x, y, w, lo, hi, bands, value, label, fmtv) {
  const X = (v) => x + ((clamp(v, lo, hi) - lo) / (hi - lo)) * w;
  bands.forEach(([a, b, name, strong], i) => {
    const ctx = sh.ctx;
    ctx.save();
    ctx.fillStyle = strong ? t.flag : t.accent2;
    ctx.globalAlpha = 0.25 + 0.15 * i;
    ctx.fillRect(X(a), y, X(b) - X(a), 10);
    ctx.restore();
    sh.text(name, (X(a) + X(b)) / 2, y + 26, { family: SANS, weight: 500, size: 10.5, align: 'center', color: t.ink2 });
  });
  const mx = X(value);
  sh.line(mx, y - 8, mx, y + 14, { width: 2.4, rough: 0.2, seed: 3, stroke: t.ink });
  sh.text(`${label} ${fmtv(value)}`, mx, y - 12, { family: MONO, weight: 500, size: 11.5, align: 'center' });
}

function drawAS(sh, t, W, H, narrow) {
  const ctx = sh.ctx;
  const A = aortic(st);
  const s = narrow ? 0.85 : 1;
  // ---- the valve, flow from the left
  const vx = narrow ? 14 : 24, vw = narrow ? W - 28 : W * 0.42, vy = narrow ? 18 : 60, vh = narrow ? H * 0.26 : H * 0.36;
  const cy = vy + vh / 2, half = vh * 0.28;
  const valveX = vx + vw * 0.48;
  sh.line(vx, cy - half, valveX, cy - half, { width: 1.5, rough: 0.5, seed: 11 });
  sh.line(vx, cy + half, valveX, cy + half, { width: 1.5, rough: 0.5, seed: 12 });
  const aoHalf = half * 1.2;
  sh.curve([[valveX, cy - half], [valveX + 20, cy - aoHalf - 8], [vx + vw, cy - aoHalf]], { width: 1.5, rough: 0.5, seed: 13 });
  sh.curve([[valveX, cy + half], [valveX + 20, cy + aoHalf + 8], [vx + vw, cy + aoHalf]], { width: 1.5, rough: 0.5, seed: 14 });
  const open = half * Math.sqrt(st.ava / 3.5);
  // cusps: thick and calcified as the orifice narrows
  const cw = 1.6 + 3 * A.sev;
  sh.line(valveX, cy - half, valveX + 22, cy - open, { width: cw, rough: 0.6, seed: 15 });
  sh.line(valveX, cy + half, valveX + 22, cy + open, { width: cw, rough: 0.6, seed: 16 });
  // jet
  const jet = new Path2D();
  jet.moveTo(valveX + 22, cy - open);
  jet.quadraticCurveTo(valveX + 90, cy - open * 0.8, vx + vw, cy - open * 1.6);
  jet.lineTo(vx + vw, cy + open * 1.6);
  jet.quadraticCurveTo(valveX + 90, cy + open * 0.8, valveX + 22, cy + open);
  jet.closePath();
  sh.hatch(jet, 0, 3.5, t.flag, 0.9, 17, 0.55);
  sh.text('LVOT', vx + 6, cy - half - 10, { size: 16 * s, color: t.ink2 });
  sh.text('aorta', vx + vw - 44, cy - aoHalf - 12, { size: 16 * s, color: t.ink2 });
  // PW in the LVOT, CW through the valve
  const pwx = valveX - vh * 0.35;
  sh.line(pwx - 6, cy, pwx + 6, cy, { width: 2, rough: 0.2, seed: 18 });
  sh.text('PW', pwx - 10, cy + half - 8, { family: MONO, weight: 500, size: 11, color: t.accent, align: 'center' });
  sh.line(vx + 4, cy + 2, vx + vw - 4, cy + 2, { width: 1, rough: 0.2, seed: 19, stroke: t.accent, dash: [6, 4] });
  sh.text('CW', vx + vw - 30, cy + 18, { family: MONO, weight: 500, size: 11, color: t.accent });
  sh.text(`AVA = ${LVOT_CSA.toFixed(2)} cm² × ${A.vtiL.toFixed(1)} / ${A.vtiA.toFixed(1)} = ${st.ava.toFixed(2)} cm²`, vx, vy + vh + (narrow ? 10 : 18), { family: MONO, weight: 500, size: narrow ? 11 : 12.5 });
  // ---- spectra
  const sx = narrow ? 10 : W * 0.48, sw = narrow ? W - 20 : W * 0.5;
  const ph = narrow ? H * 0.2 : H * 0.27;
  let py = narrow ? vy + vh + 26 : 40;
  panel(ctx, sx, py, sw, ph, 'PW · LVOT');
  let bx = { x: sx + 4, y: py + 22, w: sw - 32, h: ph - 26 };
  spectral(ctx, bx, { fn: (u) => -A.vL * lvotShape(((u * 2) % 1) * 857 / (ET * 1000)), scale: 1.5, base: 0.15, mode: 'pw', broad: 0.08, key: `aslv|${A.vL.toFixed(3)}`, seed: 2 });
  vscale(ctx, bx, 1.5, 0.15, 0.5);
  ctx.save(); ctx.font = `500 11px ${MONO}`; ctx.fillStyle = SC.cal;
  ctx.fillText(`peak ${A.vL.toFixed(2)} m/s · VTI ${A.vtiL.toFixed(1)} cm`, bx.x + 8, bx.y + bx.h - 8); ctx.restore();
  py += ph + 10;
  const ph2 = narrow ? H * 0.22 : H * 0.36;
  panel(ctx, sx, py, sw, ph2, 'CW · AORTIC VALVE');
  bx = { x: sx + 4, y: py + 22, w: sw - 32, h: ph2 - 26 };
  const vs = Math.max(4, Math.ceil(A.vmax + 0.6));
  spectral(ctx, bx, { fn: (u) => -A.vmax * A.g(((u * 2) % 1) * 857 / (ET * 1000)), scale: vs, base: 0.08, mode: 'cw', broad: 0.45, key: `asav|${A.vmax.toFixed(3)}|${A.sev.toFixed(2)}|${vs}`, seed: 3 });
  vscale(ctx, bx, vs, 0.08, 1);
  const k = (bx.h * 0.92) / vs, yb = bx.y + bx.h * 0.08;
  const pk = (() => { let best = 0, bu = 0; for (let i = 0; i < 200; i++) { const u = i / 200; if (A.g(u) > best) { best = A.g(u); bu = u; } } return bu; })();
  const xpk = bx.x + ((pk * ET * 1000) / 857 / 2) * bx.w;
  caliper(ctx, xpk - 14, yb + A.vmax * k, xpk + 14, yb + A.vmax * k, { solid: true });
  ctx.save(); ctx.font = `500 11px ${MONO}`; ctx.fillStyle = SC.cal;
  ctx.fillText(`Vmax ${A.vmax.toFixed(2)} m/s · mean ${A.mg.toFixed(0)} mmHg · VTI ${A.vtiA.toFixed(0)} cm`, bx.x + 8, bx.y + bx.h - 8); ctx.restore();
  // ---- severity scale
  if (!narrow) {
    const by = py + ph2 + 42;
    scaleBar(sh, t, sx + 10, by, sw - 30, 1, 6, [[1, 2.5, 'sclerosis'], [2.5, 3, 'mild'], [3, 4, 'moderate'], [4, 5, 'severe', true], [5, 6, 'very severe', true]], A.vmax, 'Vmax', (v) => `${v.toFixed(1)} m/s`);
  }
}

function drawMS(sh, t, W, H, narrow) {
  const ctx = sh.ctx;
  const M = mitral(st);
  const s = narrow ? 0.85 : 1;
  // ---- the valve seen from the left heart: doming leaflets
  const vx = narrow ? 14 : 30, vw = narrow ? W - 28 : W * 0.4, vy = narrow ? 16 : 60, vh = narrow ? H * 0.28 : H * 0.42;
  const cx = vx + vw / 2, top = vy + 20;
  sh.text('LA', cx - vw * 0.3, top + 14, { size: 18 * s, color: t.ink2 });
  sh.text('LV', cx - vw * 0.3, vy + vh - 6, { size: 18 * s, color: t.ink2 });
  const annY = top + vh * 0.32, ann = vw * 0.38;
  const tip = Math.max(4, ann * 0.55 * Math.sqrt(st.mva / 4.5));
  const dome = (sign, seed) => sh.curve([[cx + sign * ann, annY], [cx + sign * ann * 0.7, annY + vh * 0.22], [cx + sign * tip, annY + vh * 0.34]], { width: 2.4 + 2 * (1 - st.mva / 4.5), rough: 0.6, seed });
  dome(-1, 21);
  dome(1, 22);
  sh.line(cx - ann - 20, annY, cx - ann, annY, { width: 1.5, rough: 0.4, seed: 23 });
  sh.line(cx + ann, annY, cx + ann + 20, annY, { width: 1.5, rough: 0.4, seed: 24 });
  const jet = new Path2D();
  jet.moveTo(cx - tip, annY + vh * 0.34);
  jet.quadraticCurveTo(cx - tip * 0.8, annY + vh * 0.5, cx - tip * 2.2, vy + vh - 20);
  jet.lineTo(cx + tip * 2.2, vy + vh - 20);
  jet.quadraticCurveTo(cx + tip * 0.8, annY + vh * 0.5, cx + tip, annY + vh * 0.34);
  jet.closePath();
  sh.hatch(jet, Math.PI / 2, 3.5, t.flag, 0.9, 25, 0.55);
  sh.text(`MVA ${st.mva.toFixed(2)} cm²`, cx + tip + 12, annY + vh * 0.36, { family: MONO, weight: 500, size: 12 });
  sh.text(`MVA = 220 / PHT = 220 / ${M.pht.toFixed(0)} ms`, vx, vy + vh + (narrow ? 12 : 22), { family: MONO, weight: 500, size: narrow ? 11 : 12.5 });
  // ---- CW mitral inflow over two beats
  const sx = narrow ? 10 : W * 0.46, sw = narrow ? W - 20 : W * 0.52;
  const py = narrow ? vy + vh + 30 : 60, ph = narrow ? H - vy - vh - 40 : H * 0.62;
  panel(ctx, sx, py, sw, ph, `CW · MITRAL INFLOW · HR ${Math.round(st.hr)}`);
  const bx = { x: sx + 4, y: py + 22, w: sw - 32, h: ph - 30 };
  const beats = 2, span = beats * M.RRms;
  const start = M.RRms - M.dfp;                       // filling ends at the next R wave
  const fn = (u) => {
    const tt = (u * span) % M.RRms;
    const since = tt - start;
    return since >= 0 ? M.v0 * M.env(since) : 0;
  };
  const vs = Math.max(2, Math.ceil(M.v0 + 0.5));
  spectral(ctx, bx, { fn, scale: vs, base: 0.9, mode: 'cw', broad: 0.4, key: `ms|${st.mva.toFixed(2)}|${st.hr}|${st.sv}|${vs}`, seed: 4 });
  vscale(ctx, bx, vs, 0.9, 1);
  const k = (bx.h * 0.9) / vs, yb = bx.y + bx.h * 0.9;
  const X = (ms) => bx.x + (ms / span) * bx.w;
  // pressure half-time: peak to peak / √2
  const x0 = X(start), x1 = X(start + Math.min(M.pht, M.dfp));
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.beginPath();
  ctx.moveTo(x0, yb - M.v0 * k);
  ctx.lineTo(X(start + Math.min(M.dt, M.dfp)), yb - M.v0 * Math.max(0, 1 - Math.min(M.dt, M.dfp) / M.dt) * k);
  ctx.stroke();
  caliper(ctx, x0, yb - M.v0 * k - 10, x1, yb - M.v0 * k - 10, { solid: true });
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.fillText(`PHT ${M.pht.toFixed(0)} ms`, x0, yb - M.v0 * k - 16);
  ctx.fillText(`peak ${M.v0.toFixed(2)} m/s · mean gradient ${M.mg.toFixed(1)} mmHg · filling ${M.dfp.toFixed(0)} ms`, bx.x + 8, bx.y + 14);
  ctx.restore();
}

function draw(sh, t) {
  const narrow = sh.w < 700;
  if (st.sten === 'ms') drawMS(sh, t, sh.w, sh.h, narrow);
  else drawAS(sh, t, sh.w, sh.h, narrow);
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'narrow',
  part: 'valves',
  title: 'Narrow',
  dwell: 16,
  defaults: { sten: 'as', ava: 0.8, mva: 1.2 },
  format: {
    ava: (v) => `${v.toFixed(2)} cm²`,
    mva: (v) => `${v.toFixed(2)} cm²`,
  },
  watch: ['sten', 'ava', 'mva', 'sv', 'hr'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  tourEnter(set) { set({ sten: 'as', ava: 1.6, sv: 70, hr: 70 }); },
  tourTick(tt, set) {
    if (tt < 5) set({ ava: Math.round((1.6 - clamp((tt - 1) / 3.5, 0, 1) * 0.9) * 20) / 20 });
    else if (tt < 8.5) set({ ava: 0.7, sv: Math.round(70 - clamp((tt - 5) / 3, 0, 1) * 30) });
    else if (tt < 9.5) set({ sten: 'ms', mva: 1.2, sv: 70, hr: 70 });
    else set({ hr: Math.round(70 + clamp((tt - 10) / 4, 0, 1) * 40) });
  },
  text(s, { cite }) {
    if (s.sten === 'ms') {
      const M = mitral(s);
      return {
        readouts: [
          { k: 'MVA (220 / PHT)', v: fmt(s.mva, 2), u: 'cm²', flag: s.mva <= 1.5 },
          { k: 'Pressure half-time', v: fmt(M.pht, 0), u: 'ms', flag: M.pht >= 150 },
          { k: 'Mean gradient', v: fmt(M.mg, 1), u: 'mmHg', flag: M.mg >= 10 },
          { k: 'Heart rate', v: fmt(s.hr, 0), u: '/min' },
          { k: 'Filling time per beat', v: fmt(M.dfp, 0), u: 'ms' },
          { k: 'Grade', v: M.grade, text: true, flag: M.grade === 'severe' },
        ],
        live: `An area of ${fmt(s.mva, 2)} cm² gives a pressure half-time of ${fmt(M.pht, 0)} ms: <b>${M.grade}</b> mitral stenosis${cite('pandian2023,otto2020')}. At ${Math.round(s.hr)} beats a minute each beat has ${fmt(M.dfp, 0)} ms to fill, so the mean gradient is ${fmt(M.mg, 1)} mmHg. The same valve gives a higher gradient at a faster rate: report the gradient with the heart rate${cite('otto2020')}.`,
      };
    }
    const A = aortic(s);
    const low = A.svi < 35;
    const discord = s.ava < 1 && A.vmax < 4 && A.mg < 40;
    return {
      readouts: [
        { k: 'Peak velocity', v: fmt(A.vmax, 2), u: 'm/s', flag: A.vmax >= 4 },
        { k: 'Mean gradient', v: fmt(A.mg, 0), u: 'mmHg', flag: A.mg >= 40 },
        { k: 'AVA (continuity)', v: fmt(s.ava, 2), u: 'cm²', flag: s.ava < 1 },
        { k: 'Velocity ratio', v: fmt(A.dvi, 2), flag: A.dvi < 0.25 },
        { k: 'Stroke volume index', v: fmt(A.svi, 0), u: 'mL/m²', flag: low },
        { k: 'Grade', v: A.grade, text: true, flag: /severe/.test(A.grade) },
      ],
      live: `The continuity equation gives ${fmt(s.ava, 2)} cm²; peak velocity ${fmt(A.vmax, 2)} m/s, mean gradient ${fmt(A.mg, 0)} mmHg${cite('baumgartner2017')}. ${discord ? `<span class="k-red">The area says severe, the gradient does not.</span> ${low ? `The stroke volume index is ${fmt(A.svi, 0)} mL/m², below 35: low flow. With a normal EF this is paradoxical low-flow, low-gradient aortic stenosis.` : 'Flow is normal: this behaves like moderate stenosis. Recheck the LVOT diameter.'}${cite('baumgartner2017')}` : `Grade: <b>${A.grade}</b>${cite('baumgartner2017,otto2020')}.`}`,
    };
  },
};
