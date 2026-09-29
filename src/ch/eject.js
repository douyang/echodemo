// 09 Eject: systolic function. Left: LV volumes by the biplane method of disks in the apical
// four- and two-chamber views, and what foreshortening does to them. Right: three measures
// of RV systolic function (TAPSE, tissue Doppler S′, fractional area change).
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { cycleAt, RR, EV } from '../cyclemodel.js';
import { lvefBand, hfCategory, tapseGrade, sPrimeGrade, facGrade } from '../norms.js';
import { BSA } from './pressure.js';

const DISKS = 20;         // the method of disks (modified Simpson's rule)
const ELL = 3.3;          // LV length / basal radius (model)

/** LV cavity radius (cm) at fraction z of the length from base (0) to apex (1). */
const prof = (z, R) => R * Math.sqrt(Math.max(0, 1 - z * z)) * (1 - 0.1 * Math.pow(1 - z, 8));

/** Radius and length for a volume (mL): numeric volume of the profile. */
const UNIT = (() => {
  let v = 0;
  for (let i = 0; i < 2000; i++) { const z = (i + 0.5) / 2000; v += Math.PI * prof(z, 1) ** 2 / 2000; }
  return v * ELL;           // volume of R = 1, L = ELL
})();
function shapeFor(V, lengthScale = 1) {
  const R = Math.cbrt(V / (UNIT * lengthScale));
  return { R, L: ELL * R * lengthScale };
}

export function lvState(s) {
  const edv = s.edv, esv = s.edv * (1 - s.ef / 100);
  const ed = shapeFor(edv), es = shapeFor(esv, 0.92);   // the long axis shortens in systole
  const f = s.fore / 100;
  // A foreshortened view misses the true apex: the traced length, and with it each disk
  // volume, falls by the same fraction at end-diastole and end-systole.
  const EDm = edv * (1 - f), ESm = esv * (1 - f);
  return { edv, esv, ed, es, EDm, ESm, svm: EDm - ESm, ef: (EDm - ESm) / EDm, f };
}

let sheet = null, st = null, clock = 0;

function drawLV(sh, t, box, L, which, label) {
  const ctx = sh.ctx;
  const { x, y, w, h } = box;
  // echo convention: apex at the top. One scale for every volume, so a dilated LV looks larger.
  const Lmax = shapeFor(320).L;
  const s1 = Math.min(w / (2.4 * shapeFor(320).R + 1.5), (h - 70) / (Lmax + 1));
  const cx = x + w / 2, top = y + 18;
  const labelY = top + 8 + Lmax * s1 + 30;
  const phase = st.frame8 === 'es' ? 1 : st.frame8 === 'ed' ? 0 : clamp(cycleAt((clock * 1000) % RR).s, 0, 1);
  const R = mix(L.ed.R, L.es.R, phase), Ltrue = mix(L.ed.L, L.es.L, phase);
  const Lf = Ltrue * (1 - L.f);
  const wall = (st.wall / 10) * s1;
  const pts = (Lx, rad, shrink = 0) => {
    const out = [];
    for (let i = 0; i <= 60; i++) {
      const z = i / 60;
      const yy = top + 8 + (1 - z) * Lx * s1;
      out.push([cx + (prof(z, rad) * s1 + shrink), yy]);
    }
    for (let i = 60; i >= 0; i--) {
      const z = i / 60;
      const yy = top + 8 + (1 - z) * Lx * s1;
      out.push([cx - (prof(z, rad) * s1 + shrink), yy]);
    }
    return out;
  };
  const rad = which === 'a2c' ? R * 0.94 : R;
  // myocardium
  const outer = pts(Lf + st.wall / 10 * 0.6, rad, wall);
  const inner = pts(Lf, rad);
  const myo = new Path2D();
  outer.forEach(([px, py], i) => (i ? myo.lineTo(px, py - wall * 0.6) : myo.moveTo(px, py - wall * 0.6)));
  myo.closePath();
  inner.forEach(([px, py], i) => (i ? myo.lineTo(px, py) : myo.moveTo(px, py)));
  myo.closePath();
  ctx.save();
  ctx.clip(myo, 'evenodd');
  sh.hatch(new Path2D(`M0 0H${sh.w}V${sh.h}H0Z`), 0.6, 4.2, t.ink2, 0.8, which === 'a2c' ? 71 : 70, 0.55);
  ctx.restore();
  sh.poly(inner, { width: 1.6, rough: 0.5, seed: which === 'a2c' ? 72 : 73, stroke: t.ink });
  // disks
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < DISKS; i++) {
    const z = (i + 0.5) / DISKS;
    const yy = top + 8 + (1 - z) * Lf * s1;
    const r = prof(z, rad) * s1;
    ctx.beginPath();
    ctx.moveTo(cx - r, yy);
    ctx.lineTo(cx + r, yy);
    ctx.stroke();
  }
  ctx.restore();
  // long axis
  sh.line(cx, top + 8, cx, top + 8 + Lf * s1, { width: 1, rough: 0.2, seed: 74, stroke: t.flag, dash: [4, 3] });
  sh.text(`L ${Lf.toFixed(1)} cm`, cx + 6, top + 8 + Lf * s1 * 0.35, { family: MONO, weight: 500, size: 11, color: t.flag });
  // the true apex, lost when foreshortened
  if (L.f > 0.02) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = t.ink3;
    const tr = pts(Ltrue, rad);
    ctx.beginPath();
    tr.forEach(([px, py], i) => (i ? ctx.lineTo(px, py - (Ltrue - Lf) * s1) : ctx.moveTo(px, py - (Ltrue - Lf) * s1)));
    ctx.stroke();
    ctx.restore();
    sh.text('true apex', cx + 10, top + 8 - (Ltrue - Lf) * s1 + 4, { size: 15, color: t.ink3 });
  }
  sh.text(label, cx, labelY, { size: 20, align: 'center' });
  // the mitral annulus line
  sh.line(cx - prof(0, rad) * s1 - 4, top + 8 + Lf * s1, cx + prof(0, rad) * s1 + 4, top + 8 + Lf * s1, { width: 2, rough: 0.3, seed: 75 });
}

function drawRV(sh, t, W, H, narrow) {
  const ctx = sh.ctx;
  const cols = narrow ? 1 : 3;
  const gap = 14;
  const bw = narrow ? W - 24 : (W - 48 - gap * 2) / 3;
  const bh = narrow ? (H - 40) / 3 - 10 : H * 0.55;
  const pos = (i) => (narrow ? { x: 12, y: 16 + i * (bh + 12) } : { x: 24 + i * (bw + gap), y: 70 });
  // TAPSE: M-mode of the lateral tricuspid annulus
  {
    const { x, y } = pos(0);
    panel(ctx, x, y, bw, bh, 'M-MODE · TAPSE');
    const bx = { x: x + 8, y: y + 26, w: bw - 16, h: bh - 34 };
    const pxmm = Math.min(bx.h / 40, 4);
    const y0 = bx.y + bx.h * 0.25;
    ctx.save();
    // tissue texture bands
    ctx.fillStyle = '#2a3034';
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.strokeStyle = '#d9dfe2';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const tt = (u * 2.2 * RR) % RR;
      const c = cycleAt(tt);
      const yy = y0 + c.s * st.tapse * pxmm;
      const xx = bx.x + u * bx.w;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    // caliper from end-diastole to peak systole in the first beat
    const xb = bx.x + (EV_ES / (2.2 * RR)) * bx.w;
    caliper(ctx, xb, y0, xb, y0 + st.tapse * pxmm, { solid: true });
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(`${st.tapse.toFixed(1)} mm`, xb + 8, y0 + st.tapse * pxmm / 2 + 4);
    ctx.restore();
  }
  // tissue Doppler S′
  {
    const { x, y } = pos(1);
    panel(ctx, x, y, bw, bh, 'PW TISSUE DOPPLER · TV ANNULUS');
    const bx = { x: x + 4, y: y + 24, w: bw - 32, h: bh - 28 };
    const sP = st.sPrime / 100, eP = 0.14, aP = 0.12;
    const fn = (u) => {
      const tt = (u * 2 * RR) % RR;
      if (tt > 70 && tt < 330) return sP * Math.sin(Math.PI * (tt - 70) / 260) ** 0.9;
      if (tt > 470 && tt < 600) return -eP * Math.sin(Math.PI * (tt - 470) / 130);
      if (tt > 770 && tt < 857) return -aP * Math.sin(Math.PI * (tt - 770) / 87);
      return 0;
    };
    spectral(ctx, bx, { fn, scale: 0.2, base: 0.5, mode: 'pw', broad: 0.25, key: `sprime|${st.sPrime}`, seed: 8 });
    vscale(ctx, bx, 0.2, 0.5, 0.1, 'cm/s', { cm: true });
    const k = (bx.h * 0.5) / 0.2, yb = bx.y + bx.h * 0.5;
    const xs = bx.x + (200 / (2 * RR)) * bx.w;
    caliper(ctx, xs - 16, yb - sP * k, xs + 16, yb - sP * k, { solid: true });
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(`S′ ${st.sPrime.toFixed(1)} cm/s`, xs + 20, yb - sP * k + 4);
    ctx.fillText('e′', bx.x + (535 / (2 * RR)) * bx.w - 4, yb + eP * k + 14);
    ctx.fillText('a′', bx.x + (815 / (2 * RR)) * bx.w - 4, yb + aP * k + 14);
    ctx.restore();
  }
  // FAC: RV area at end-diastole and end-systole
  {
    const { x, y } = pos(2);
    sh.rect(x, y, bw, bh, { width: 1, rough: 0.4, seed: 90, stroke: t.rule });
    sh.text('fractional area change', x + 8, y + 22, { size: 18 });
    const cx = x + bw * 0.52, cy = y + bh * 0.58, sc = Math.min(bw, bh) / 7.2;
    const rvPath = (k) => {
      // crescent-like RV in the four-chamber view: apex up, tricuspid annulus at the bottom
      const p = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * (i / 40);
        p.push([cx - Math.cos(a) * 1.4 * sc * k, cy + 1.6 * sc - Math.sin(a) * 3.8 * sc * Math.sqrt(k)]);
      }
      return p;
    };
    const kEs = Math.sqrt(1 - st.fac / 100);
    sh.poly(rvPath(1), { width: 1.6, rough: 0.5, seed: 91, stroke: t.ink });
    sh.poly(rvPath(kEs * kEs), { width: 1.6, rough: 0.5, seed: 92, stroke: t.flag, fill: t.flag2, fillStyle: 'hachure', gap: 5 });
    sh.text('end-diastole', cx + 1.6 * sc, cy - 2.2 * sc, { size: 15, color: t.ink });
    sh.text('end-systole', cx + 1.2 * sc, cy + 0.2 * sc, { size: 15, color: t.flag });
    sh.text(`FAC = (EDA − ESA) / EDA = ${st.fac}%`, x + 8, y + bh - 10, { family: MONO, weight: 500, size: 11, color: t.ink2 });
  }
  if (!narrow) sh.text('Right ventricle, apical four-chamber, RV focused', 24, 44, { size: 22 });
}

const EV_ES = EV.avc;   // end-systole: aortic valve closure

function draw(sh, t) {
  const W = sh.w, H = sh.h;
  const narrow = W < 700;
  if (st.side === 'rv') { drawRV(sh, t, W, H, narrow); return; }
  const L = lvState(st);
  const bw = narrow ? W / 2 - 6 : Math.min(360, W * 0.36), bh = narrow ? H * 0.7 : H * 0.72;
  const gx = narrow ? 4 : W / 2 - bw - 20;
  drawLV(sh, t, { x: gx, y: narrow ? 6 : 40, w: bw, h: bh }, L, 'a4c', 'A4C');
  drawLV(sh, t, { x: gx + bw + (narrow ? 4 : 40), y: narrow ? 6 : 40, w: bw, h: bh }, L, 'a2c', 'A2C');
  const ty = (narrow ? 6 : 40) + bh + (narrow ? 14 : 20);
  sh.text('V = π/4 × Σ aᵢ × bᵢ × L / 20', narrow ? 10 : gx, ty, { family: MONO, weight: 500, size: narrow ? 11 : 13 });
  sh.text(`EDV ${L.EDm.toFixed(0)} mL · ESV ${L.ESm.toFixed(0)} mL · EF ${(L.ef * 100).toFixed(0)}%${L.f > 0.02 ? `  (true EDV ${L.edv.toFixed(0)} mL)` : ''}`, narrow ? 10 : gx, ty + 22, { family: MONO, weight: 400, size: narrow ? 11 : 12.5, color: L.f > 0.02 ? t.flag : t.ink2 });
  if (!narrow) sh.text('a: diameter in A4C · b: diameter in A2C · 20 disks here', gx, ty + 44, { family: SANS, weight: 400, size: 11, color: t.ink3 });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'eject',
  part: 'function',
  title: 'Eject',
  dwell: 16,
  defaults: { side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, tapse: 22, sPrime: 12, fac: 45, frame8: 'cine' },
  format: {
    edv: (v) => `${Math.round(v)} mL`,
    ef: (v) => `${Math.round(v)}%`,
    wall: (v) => `${v.toFixed(1)} mm`,
    fore: (v) => (v ? `${v}% short` : 'none'),
    tapse: (v) => `${v.toFixed(1)} mm`,
    sPrime: (v) => `${v.toFixed(1)} cm/s`,
    fac: (v) => `${Math.round(v)}%`,
  },
  watch: ['side', 'edv', 'ef', 'wall', 'fore', 'tapse', 'sPrime', 'fac', 'frame8'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  anim(dt, s) {
    if (reducedMotion || s.frame8 !== 'cine' || s.side !== 'lv') return;
    clock += dt / 1.5;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, frame8: 'cine' }); },
  tourTick(tt, set) {
    if (tt < 5) set({ ef: Math.round(60 - clamp((tt - 1) / 3.5, 0, 1) * 30), edv: Math.round(120 + clamp((tt - 1) / 3.5, 0, 1) * 80) });
    else if (tt < 9) set({ ef: 60, edv: 120, fore: Math.round(clamp((tt - 5.5) / 3, 0, 1) * 20) });
    else if (tt < 10) set({ fore: 0, side: 'rv', tapse: 22, sPrime: 12, fac: 45 });
    else set({ tapse: Math.round((22 - clamp((tt - 10.5) / 4, 0, 1) * 10) * 2) / 2, sPrime: Math.round((12 - clamp((tt - 10.5) / 4, 0, 1) * 5) * 2) / 2, fac: Math.round(45 - clamp((tt - 10.5) / 4, 0, 1) * 18) });
  },
  text(s, { cite }) {
    if (s.side === 'rv') {
      const gT = tapseGrade(s.tapse), gS = sPrimeGrade(s.sPrime), gF = facGrade(s.fac);
      return {
        readouts: [
          { k: 'TAPSE', v: fmt(s.tapse, 1), u: 'mm', flag: gT !== 'normal' },
          { k: 'RV S′', v: fmt(s.sPrime, 1), u: 'cm/s', flag: gS !== 'normal' },
          { k: 'FAC', v: fmt(s.fac), u: '%', flag: gF !== 'normal' },
          { k: 'TAPSE grade', v: gT, text: true },
          { k: 'S′ grade', v: gS, text: true },
          { k: 'FAC grade', v: gF, text: true },
        ],
        live: `TAPSE ${fmt(s.tapse, 1)} mm is ${gT}; S′ ${fmt(s.sPrime, 1)} cm/s is ${gS}; FAC ${fmt(s.fac)}% is ${gF}${cite('mukherjee2025')}. TAPSE and S′ follow one point of the annulus along one line; FAC uses the whole RV area in one plane.`,
      };
    }
    const L = lvState(s);
    const band = lvefBand(L.ef * 100, 'M'), bandF = lvefBand(L.ef * 100, 'F');
    const edvi = L.EDm / BSA;
    return {
      readouts: [
        { k: 'EDV', v: fmt(L.EDm), u: 'mL', flag: L.f > 0.02 },
        { k: 'ESV', v: fmt(L.ESm), u: 'mL', flag: L.f > 0.02 },
        { k: 'Stroke volume', v: fmt(L.svm), u: 'mL' },
        { k: 'LVEF', v: fmt(L.ef * 100), u: '%', flag: L.ef * 100 < 52 },
        { k: 'EDV index', v: fmt(edvi), u: 'mL/m²', flag: edvi > 74 },
      ],
      live: `Biplane disks give an EF of ${fmt(L.ef * 100)}%: ${band === bandF ? band : `${band} for a man, ${bandF} for a woman`}${cite('lang2015')}. In a patient with heart failure, this EF falls in the ${hfCategory(L.ef * 100)}${cite('heidenreich2022')}. ${L.f > 0.02 ? `<span class="k-red">The views are ${s.fore}% foreshortened: EDV reads ${fmt(L.EDm)} mL, not ${fmt(L.edv)} mL.</span> EF barely moves, because both volumes shrink together.` : `EDV index ${fmt(edvi)} mL/m² for a body surface area of ${BSA.toFixed(2)} m².`}`,
    };
  },
};
