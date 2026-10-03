// 04 Pressure: two Doppler calculations that run every study. Flow: stroke volume from the
// LVOT area and the LVOT velocity-time integral. Pressure: RV systolic pressure from the peak
// tricuspid regurgitation velocity (simplified Bernoulli) plus the RA pressure, one of the three
// values that the IVC gives (3, 8 or 15 mmHg; chapter 18 shows how).
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { trvGrade } from '../norms.js';

const ET = 0.292;            // s, LV ejection time (Alhakak 2025 mean); held constant here
const RRs = 0.857;
const K_LVOT = (() => {      // mean of the LVOT envelope shape over ejection
  let a = 0;
  for (let i = 0; i < 400; i++) a += Math.pow(Math.sin(Math.PI * ((i + 0.5) / 400)), 0.8);
  return a / 400;
})();
export const BSA = Math.sqrt((175 * 80) / 3600);   // m², Mosteller, 175 cm and 80 kg

export function flow(s) {
  const d = s.lvotD, dm = s.lvotD + s.calErr / 10;        // cm
  const csa = Math.PI * (d / 2) ** 2, csaM = Math.PI * (dm / 2) ** 2;
  const vti = s.sv / csa;                                  // cm
  const vpk = vti / (ET * 100 * K_LVOT);                   // m/s
  const svM = csaM * vti;                                  // what the scanner reports
  const rap = s.rap;
  const grad = 4 * s.trV ** 2;
  return { d, dm, csa, csaM, vti, vpk, svM, err: svM / s.sv - 1, co: (svM * s.hr) / 1000, rap, grad, rvsp: grad + rap };
}

const lvotShape = (t) => {
  const u = (((t % RRs) + RRs) % RRs) / ET;
  return u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.8) : 0;
};
const trShape = (t) => {
  // holosystolic: from mitral closure to just past aortic closure; fast rise, rounded top
  const u = ((((t % RRs) + RRs) % RRs) - 0.02) / 0.4;
  return u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.45) : 0;
};

let sheet = null, st = null;

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const F = flow(st);
  const s = narrow ? 0.85 : 1;
  const colW = narrow ? W : W / 2;

  // ================= left: flow =================
  const lx = narrow ? 12 : 26, lw = colW - (narrow ? 24 : 44);
  let y = narrow ? 26 : 44;
  sh.text('Flow', lx, y, { size: 26 * s });
  sh.text('SV = 0.785 × d² × VTI', lx + (narrow ? 70 : 90), y - 2, { family: MONO, weight: 500, size: 12 });
  y += narrow ? 14 : 24;
  // LVOT, zoomed parasternal long axis: septum above, anterior mitral leaflet below
  const pxcm = narrow ? 22 : 48;
  const tubeX0 = lx + 10, tubeX1 = lx + lw - (narrow ? 120 : 60);
  const yc = y + (narrow ? 38 : 80);
  const half = (F.d / 2) * pxcm;
  const wall = new Path2D();
  wall.rect(tubeX0, yc - half - 26, tubeX1 - tubeX0, 26);
  sh.hatch(wall, 0.5, 4.2, t.ink2, 0.8, 11, 0.5);
  const wall2 = new Path2D();
  wall2.rect(tubeX0, yc + half, tubeX1 - tubeX0, 10);
  sh.hatch(wall2, 0.5, 4.2, t.ink2, 0.8, 12, 0.5);
  sh.line(tubeX0, yc - half, tubeX1, yc - half, { width: 1.4, rough: 0.5, seed: 13 });
  sh.line(tubeX0, yc + half, tubeX1, yc + half, { width: 1.4, rough: 0.5, seed: 14 });
  if (!narrow) {
    sh.text('septum', tubeX0 + 4, yc - half - 30, { size: 15 * s, color: t.ink2 });
    sh.text('anterior mitral leaflet', tubeX0 + 4, yc + half + 26, { size: 15 * s, color: t.ink2 });
  }
  // aortic cusps at the right end
  sh.curve([[tubeX1, yc - half], [tubeX1 + 18, yc - half * 0.4], [tubeX1 + 30, yc - half * 0.15]], { width: 1.6, rough: 0.4, seed: 15 });
  sh.curve([[tubeX1, yc + half], [tubeX1 + 18, yc + half * 0.4], [tubeX1 + 30, yc + half * 0.15]], { width: 1.6, rough: 0.4, seed: 16 });
  sh.text('AV', tubeX1 + 34, yc + 5, { size: 15 * s, color: t.ink2 });
  // the caliper, where the PW sample sits
  const cx = tubeX1 - 0.8 * pxcm;
  const hm = (F.dm / 2) * pxcm;
  caliper(ctx, cx, yc - hm, cx, yc + hm, { color: t.flag, solid: true, size: 5 });
  sh.text(`${F.dm.toFixed(2)} cm`, cx - 8, yc + 5, { family: MONO, weight: 500, size: 12, color: t.flag, align: 'right' });
  // under the measured value, inside the tract: to the right it would run into the valve
  if (Math.abs(st.calErr) > 0.01) sh.text(`true ${F.d.toFixed(2)} cm`, cx - 8, yc + 19, { family: MONO, weight: 400, size: 11, color: t.ink2, align: 'right' });
  // the two areas
  const ay = narrow ? yc : yc + half + 70;
  const ar = (dd) => (dd / 2) * (narrow ? 26 : 34);
  const acx = narrow ? tubeX1 + 64 : lx + 40;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = t.ink2;
  ctx.beginPath(); ctx.arc(acx, ay, ar(F.d), 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = t.flag;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(acx, ay, ar(F.dm), 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (narrow) {
    sh.text(`${F.csaM.toFixed(2)} cm²`, acx, ay + ar(2.6) + 14, { family: MONO, weight: 500, size: 11, color: t.flag, align: 'center' });
  } else {
    sh.text(`area ${F.csaM.toFixed(2)} cm²`, acx + ar(2.6) + 10, ay - 4, { family: MONO, weight: 500, size: 12, color: t.flag });
    sh.text(`true ${F.csa.toFixed(2)} cm² · error ${(F.err * 100).toFixed(0)}%`, acx + ar(2.6) + 10, ay + 14, { family: MONO, weight: 400, size: 11, color: Math.abs(F.err) > 0.1 ? t.flag : t.ink2 });
  }
  // PW LVOT with the VTI shaded
  const py = narrow ? yc + half + 40 : ay + ar(2.6) + 26;
  const ph = narrow ? H * 0.5 - py - 6 : Math.max(90, H - py - 30);
  if (ph > 50) {
    panel(ctx, lx, py, lw, ph, 'PW · LVOT');
    const box = { x: lx + 4, y: py + 22, w: lw - 34, h: ph - 26 };
    const scale = Math.max(1.5, Math.ceil(F.vpk * 1.3 * 2) / 2);
    const beats = 2;
    spectral(ctx, box, { fn: (u) => -F.vpk * lvotShape(u * beats * RRs), scale, base: 0.2, mode: 'pw', broad: 0.08, key: `lvot|${F.vpk.toFixed(3)}|${scale}`, seed: 3 });
    vscale(ctx, box, scale, 0.2, 0.5);
    const k = (box.h * 0.8) / scale, yb = box.y + box.h * 0.2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,232,154,0.28)';
    ctx.strokeStyle = SC.cal;
    ctx.beginPath();
    const x0 = box.x, span = box.w / beats;
    ctx.moveTo(x0, yb);
    for (let i = 0; i <= 80; i++) {
      const tt = (i / 80) * ET;
      ctx.lineTo(x0 + (tt / RRs) * span, yb + F.vpk * lvotShape(tt) * k);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    // a short strip takes the two readings on one line, beside the envelope
    if (box.h < 60) ctx.fillText(`VTI ${F.vti.toFixed(1)} cm · peak ${F.vpk.toFixed(2)} m/s`, x0 + span * 0.42, box.y + box.h * 0.55 + 4);
    else {
      ctx.fillText(`VTI ${F.vti.toFixed(1)} cm`, x0 + span * 0.42, yb + F.vpk * k * 0.6);
      ctx.fillText(`peak ${F.vpk.toFixed(2)} m/s`, x0 + span * 0.42, yb + F.vpk * k * 0.6 + 15);
    }
    ctx.restore();
  }

  // ================= right: pressure =================
  const rx = narrow ? 12 : colW + 18, rw = colW - (narrow ? 24 : 44);
  let ry = narrow ? H * 0.52 : 44;
  sh.text('Pressure', rx, ry, { size: 26 * s });
  sh.text('RVSP = 4 V² + RAP', rx + (narrow ? 104 : 130), ry - 2, { family: MONO, weight: 500, size: 12 });
  ry += narrow ? 10 : 22;
  // a phone lays the bar out from the bottom up (the sum on the last line, the scale and the bar
  // above it), and the CW panel takes the height that is left
  const yS = H - 6, bhN = 13, byN = yS - 15 - 13 - bhN;
  // a wide figure keeps the CW panel at 46% of its height while the bar block (title, bar,
  // scale, note: 180 px above the sum at H - 34) fits under it; a short one gives the panel less
  const tph = narrow ? Math.max(40, byN - 15 - 14 - ry) : Math.max(60, Math.min(H * 0.46, H - 214 - ry));
  panel(ctx, rx, ry, rw, tph, 'CW · TR JET');
  const tbox = { x: rx + 4, y: ry + 22, w: rw - 34, h: tph - 26 };
  const tscale = 5;
  spectral(ctx, tbox, { fn: (u) => -st.trV * trShape(u * 2 * RRs), scale: tscale, base: 0.12, mode: 'cw', broad: 0.5, key: `tr|${st.trV.toFixed(3)}`, seed: 5 });
  vscale(ctx, tbox, tscale, 0.12, 1);
  const tk = (tbox.h * 0.88) / tscale, tyb = tbox.y + tbox.h * 0.12;
  const pkx = tbox.x + (tbox.w / 2) * ((0.02 + 0.2) / RRs);
  caliper(ctx, pkx, tyb + st.trV * tk, pkx + 40, tyb + st.trV * tk, { solid: true });
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  // the reading on the panel's title line, clear of both beats' spectra
  ctx.textAlign = 'right';
  ctx.fillText(`${st.trV.toFixed(2)} m/s → 4V² = ${F.grad.toFixed(0)} mmHg`, rx + rw - 10, ry + 17);
  ctx.restore();

  // the RA pressure (chapter 18 gives it from the IVC) under the RV-RA gradient: one bar that
  // reads the RV systolic pressure on a mmHg scale. A phone keeps the bar, its scale and the sum.
  const iy = ry + tph + (narrow ? 14 : 34);
  const ih = H - iy - 30;   // the desktop layout: the height under the CW panel
  const bx0 = rx + (narrow ? 8 : 14), bx1 = rx + rw - (narrow ? 34 : 24);
  if (!narrow) sh.text('RV systolic pressure', bx0, iy + 12, { size: 17 * s, color: t.ink2 });
  const top = Math.max(60, Math.ceil((F.rvsp + 6) / 20) * 20);
  const X = (mm) => bx0 + (mm / top) * (bx1 - bx0);
  const fs = narrow ? 10.5 : 12;
  const bh = narrow ? bhN : 24, by = narrow ? byN : iy + 54;
  const seg = (a, b, seed, color, fill) => {
    const r = new Path2D();
    r.rect(X(a), by, Math.max(1, X(b) - X(a)), bh);
    if (fill) sh.hatch(r, 0.8, 3.6, fill, 0.8, seed, 0.6);
    sh.rect(X(a), by, Math.max(1, X(b) - X(a)), bh, { width: 1.3, rough: 0.5, seed, stroke: color });
  };
  seg(0, F.rap, 33, t.ink2, t.ink2);
  seg(F.rap, F.rvsp, 34, t.flag, null);
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
  const lr = `RAP ${F.rap}`, lg = `4V² ${F.grad.toFixed(0)}`;
  const wr = sh.measure(lr, { family: MONO, weight: 500, size: fs });
  const wg = sh.measure(lg, { family: MONO, weight: 500, size: fs });
  sh.text(lr, X(0), by - 5, { family: MONO, weight: 500, size: fs, color: t.ink2 });
  const gx = Math.max(X(0) + wr + 10 + wg / 2, (X(F.rap) + X(F.rvsp)) / 2);
  sh.text(lg, Math.min(gx, bx1 - wg / 2), by - 5, { family: MONO, weight: 500, size: fs, color: t.flag, align: 'center' });
  if (!narrow) sh.text('RA pressure from the IVC: chapter 18', bx0, by + bh + 46, { size: 15 * s, color: t.ink3 });
  const sum = sh.fit([
    `RA pressure ${F.rap} mmHg  ·  RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
    `RAP ${F.rap} · RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
  ], W - 8 - bx0, { family: MONO, weight: 500, size: 12 }, 0.85);
  const ys = narrow ? yS : iy + ih - 4;
  sh.text(sum.str, bx0, ys, { family: MONO, weight: 500, size: sum.size, color: t.ink });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'pressure',
  part: 'physics',
  title: 'Pressure',
  dwell: 14,
  defaults: { sv: 70, lvotD: 2.0, calErr: 0, hr: 70, trV: 2.4, rap: 3 },
  format: {
    sv: (v) => `${Math.round(v)} mL`,
    lvotD: (v) => `${v.toFixed(2)} cm`,
    calErr: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} mm`,
    hr: (v) => `${Math.round(v)} /min`,
    trV: (v) => `${v.toFixed(2)} m/s`,
  },
  watch: ['sv', 'lvotD', 'calErr', 'hr', 'trV', 'rap'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  tourEnter(set) { set({ sv: 70, lvotD: 2.0, calErr: 0, hr: 70, trV: 2.4, rap: 3 }); },
  tourTick(tt, set) {
    if (tt < 6) set({ calErr: Math.round(clamp((tt - 1) / 4, 0, 1) * 2 * 2) / 2 });
    else if (tt < 12) set({ calErr: 0, trV: Math.round((2.4 + clamp((tt - 6.5) / 4, 0, 1) * 1.1) * 20) / 20, rap: 15 });
  },
  text(s, { cite }) {
    const F = flow(s);
    const g = trvGrade(s.trV);
    return {
      readouts: [
        { k: 'LVOT area', v: fmt(F.csaM, 2), u: 'cm²' },
        { k: 'LVOT VTI', v: fmt(F.vti, 1), u: 'cm' },
        { k: 'Stroke volume', v: fmt(F.svM), u: 'mL', flag: Math.abs(F.err) > 0.1 },
        { k: 'Cardiac output', v: fmt(F.co, 1), u: 'L/min' },
        { k: 'RA pressure', v: fmt(F.rap), u: 'mmHg', flag: F.rap > 3 },
        { k: 'RV systolic pressure', v: fmt(F.rvsp), u: 'mmHg', flag: s.trV >= 2.8 },
      ],
      live: `The measured LVOT diameter is ${fmt(F.dm, 2)} cm${s.calErr ? ` (true diameter ${fmt(F.d, 2)} cm)` : ''}, so the calculated stroke volume is ${fmt(F.svM)} mL${s.calErr ? `; <span class="k-red">the ${fmt(Math.abs(s.calErr), 1)} mm caliper error produces a stroke volume error of ${F.err > 0 ? '+' : ''}${fmt(F.err * 100)}%</span>, because the diameter is squared` : ''}${cite('zoghbi2017,baumgartner2017')}. A peak TR velocity of ${fmt(s.trV, 2)} m/s is ${g}${cite('mukherjee2025')}; the RV–RA pressure gradient is 4 × ${fmt(s.trV, 2)}² = ${fmt(F.grad)} mmHg, and with an RA pressure of ${F.rap} mmHg, estimated from the IVC (<a href="#ivc" data-go="ivc">chapter 18</a>), the RV systolic pressure is ${fmt(F.rvsp)} mmHg${cite('quinones2002')}.`,
    };
  },
};
