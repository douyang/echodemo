// 04 Pressure: two Doppler calculations that run every study. Flow: stroke volume from the
// LVOT area and the LVOT velocity-time integral. Pressure: RV systolic pressure from the peak
// tricuspid regurgitation velocity (simplified Bernoulli) plus the RA pressure from the IVC.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { rapFromIvc, trvGrade } from '../norms.js';

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
  const rap = rapFromIvc(s.ivcD, s.ivcCollapse === 'gt');
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

let sheet = null, st = null, clock = 0;

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
  const tph = narrow ? H * 0.22 : H * 0.42;
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

  // IVC with a sniff every four seconds
  const iy = ry + tph + (narrow ? 18 : 34);
  const ih = narrow ? H - iy - 10 : H - iy - 30;
  const ivx = rx + 40, ivw = rw - 80;
  const sniff = reducedMotion ? 0 : Math.max(0, Math.sin(((clock % 4) / 4) * Math.PI * 2 - 1.2));
  const collapse = st.ivcCollapse === 'gt' ? 0.62 : 0.28;
  const dNow = st.ivcD * (1 - collapse * sniff);
  const ipx = Math.min(ih / 4.2, 42);
  const icy = iy + ih * 0.45;
  sh.text('IVC, subcostal', ivx - 30, iy + 12, { size: 17 * s, color: t.ink2 });
  sh.line(ivx, icy - (dNow / 2) * ipx, ivx + ivw, icy - (dNow / 2) * ipx, { width: 1.5, rough: 0.5, seed: 30 });
  sh.line(ivx, icy + (dNow / 2) * ipx, ivx + ivw, icy + (dNow / 2) * ipx, { width: 1.5, rough: 0.5, seed: 31 });
  sh.text('RA', ivx + ivw + 8, icy + 5, { size: 16 * s, color: t.ink2 });
  const ix = ivx + ivw - 1.5 * ipx;
  caliper(ctx, ix, icy - (dNow / 2) * ipx, ix, icy + (dNow / 2) * ipx, { color: t.flag, solid: true });
  if (narrow) sh.text(`${dNow.toFixed(2)} cm${sniff > 0.3 ? ' · sniff' : ''}`, ix - 8, icy - (dNow / 2) * ipx - 5, { family: MONO, weight: 500, size: 11, color: t.flag, align: 'right' });
  else sh.text(`${dNow.toFixed(2)} cm${sniff > 0.3 ? ' · sniff' : ''}`, ix - 8, icy + (dNow / 2) * ipx + 18, { family: MONO, weight: 500, size: 12, color: t.flag, align: 'right' });
  const sum = sh.fit([
    `RA pressure ${F.rap} mmHg  ·  RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
    `RAP ${F.rap} · RVSP ${F.grad.toFixed(0)} + ${F.rap} = ${F.rvsp.toFixed(0)} mmHg`,
  ], W - 8 - (ivx - 30), { family: MONO, weight: 500, size: 12 }, 0.85);
  sh.text(sum.str, ivx - 30, iy + ih - 4, { family: MONO, weight: 500, size: sum.size, color: t.ink });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'pressure',
  part: 'physics',
  title: 'Pressure',
  dwell: 14,
  defaults: { sv: 70, lvotD: 2.0, calErr: 0, hr: 70, trV: 2.4, ivcD: 1.8, ivcCollapse: 'gt' },
  format: {
    sv: (v) => `${Math.round(v)} mL`,
    lvotD: (v) => `${v.toFixed(2)} cm`,
    calErr: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} mm`,
    hr: (v) => `${Math.round(v)} /min`,
    trV: (v) => `${v.toFixed(2)} m/s`,
    ivcD: (v) => `${v.toFixed(2)} cm`,
  },
  watch: ['sv', 'lvotD', 'calErr', 'hr', 'trV', 'ivcD', 'ivcCollapse'],
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
  tourEnter(set) { set({ sv: 70, lvotD: 2.0, calErr: 0, hr: 70, trV: 2.4, ivcD: 1.8, ivcCollapse: 'gt' }); },
  tourTick(tt, set) {
    if (tt < 6) set({ calErr: Math.round(clamp((tt - 1) / 4, 0, 1) * 2 * 2) / 2 });
    else if (tt < 12) set({ calErr: 0, trV: Math.round((2.4 + clamp((tt - 6.5) / 4, 0, 1) * 1.1) * 20) / 20, ivcD: 2.4, ivcCollapse: 'lt' });
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
      live: `The LVOT measures ${fmt(F.dm, 2)} cm${s.calErr ? ` (true ${fmt(F.d, 2)} cm)` : ''}, so the stroke volume reads ${fmt(F.svM)} mL${s.calErr ? `: <span class="k-red">${F.err > 0 ? '+' : ''}${fmt(F.err * 100)}% from a ${fmt(Math.abs(s.calErr), 1)} mm caliper error</span>, because the diameter is squared` : ''}${cite('zoghbi2017,baumgartner2017')}. A TR peak of ${fmt(s.trV, 2)} m/s is ${g}${cite('mukherjee2025')}: 4 × ${fmt(s.trV, 2)}² = ${fmt(F.grad)} mmHg, plus an RA pressure of ${F.rap} mmHg from the IVC, gives an RV systolic pressure of ${fmt(F.rvsp)} mmHg${cite('quinones2002')}.`,
    };
  },
};
