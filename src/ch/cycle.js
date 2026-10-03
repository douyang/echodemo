// Cycle: one heartbeat as a Wiggers diagram, with the Doppler and the echo frame that
// belong to each moment. One cursor runs through pressures, volume, ECG, sounds and images.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, RR, EV, mitralV, lvotV } from '../cyclemodel.js';
import { spectral, panel, SC, ecg as ecgStrip } from '../scope.js';
import { scanner } from '../scanner.js';

let sheet = null, st = null, scan = null, ev = null, evKey = '', lastT = -1, frameTick = 0, pv = -1;

const PHASES = [
  { a: EV.mvc, b: EV.avo, name: 'isovolumic contraction', short: 'IVCT' },
  { a: EV.avo, b: EV.avc, name: 'ejection', short: 'ejection' },
  { a: EV.avc, b: EV.mvo, name: 'isovolumic relaxation', short: 'IVRT' },
  { a: EV.mvo, b: EV.eEnd, name: 'rapid filling', short: 'rapid filling' },
  { a: EV.eEnd, b: EV.aOn, name: 'diastasis', short: 'diastasis' },
  { a: EV.aOn, b: RR, name: 'atrial contraction', short: 'atrial' },
];

function ensure() {
  if (scan) return;
  scanner().then((sc) => { scan = sc; if (sheet) sheet.dirty = true; }).catch(() => {});
}

function a4cFrame(w, h, c) {
  if (!scan) return null;
  const key = `${w}x${h}`;
  if (!ev || evKey !== key) { ev = scan.make(w, h, 'a4c'); evKey = key; lastT = -1; }
  if (pv !== scan.model.pheno.version) { pv = scan.model.pheno.version; lastT = -1; }   // a new heart: cut again
  // cut a new frame only when the time moved (and on every other animation frame)
  if (Math.abs(c.t - lastT) > 0.5 && (frameTick++ % 2 === 0 || lastT < 0)) {
    ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase });
    lastT = c.t;
  }
  return ev;
}

function draw(sh, t) {
  const ctx = sh.ctx, W = sh.w, H = sh.h;
  const narrow = W < 700;
  const c = cycleAt(st.tcycle);
  // left: the diagram; right: the echo frame (below on phones)
  const dx = narrow ? 44 : 56, dw = narrow ? W - dx - 14 : W * 0.62 - dx;
  const top = narrow ? 36 : 54, bottom = narrow ? H * 0.64 : H - 36;
  const X = (ms) => dx + (ms / RR) * dw;
  const hP = (bottom - top) * 0.42, hV = (bottom - top) * 0.16, hE = (bottom - top) * 0.1, hS = (bottom - top) * 0.07, hD = (bottom - top) * 0.2;
  const gap = (bottom - top - hP - hV - hE - hS - hD) / 4;
  const yP = top, yV = yP + hP + gap, yE = yV + hV + gap, yS = yE + hE + gap, yD = yS + hS + gap;
  const s = narrow ? 0.85 : 1;

  // phase bands
  PHASES.forEach((p, i) => {
    if (i % 2) {
      ctx.save();
      ctx.fillStyle = t.ink3;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(X(p.a), top - 16, X(p.b) - X(p.a), bottom - top + 16);
      ctx.restore();
    }
    const mid = (X(p.a) + X(p.b)) / 2;
    if (!narrow || X(p.b) - X(p.a) > 40) sh.text(narrow ? p.short.split(' ')[0] : p.short, mid, top - 22, { family: SANS, weight: 500, size: narrow ? 9 : 11, align: 'center', color: t.ink2 });
  });
  // valve events
  const evs = [[EV.mvc, 'MV closes'], [EV.avo, 'AV opens'], [EV.avc, 'AV closes'], [EV.mvo, 'MV opens']];
  for (const [ms, label] of evs) {
    sh.line(X(ms), top - 8, X(ms), bottom, { width: 0.8, rough: 0.3, seed: ms, stroke: t.ink3, dash: [3, 4] });
    if (!narrow) sh.text(label, X(ms) + 3, yP + hP - 4, { family: SANS, weight: 400, size: 10, color: t.ink3, rotate: -Math.PI / 2 });
  }

  // pressures
  const PY = (p) => yP + hP - (p / 130) * hP;
  sh.line(dx, yP + hP, dx + dw, yP + hP, { width: 1, rough: 0.3, seed: 3, stroke: t.ink2 });
  // a narrow diagram leaves out the 0: the volume scale starts just under it
  for (const p of narrow ? [40, 80, 120] : [0, 40, 80, 120]) {
    sh.text(String(p), dx - 6, PY(p) + 4, { family: MONO, weight: 400, size: 9, align: 'right', color: t.ink2 });
  }
  sh.text('mmHg', dx - 6, yP - 4, { family: MONO, weight: 400, size: 9, align: 'right', color: t.ink2 });
  const curve = (fn, step = 6) => { const pts = []; for (let ms = 0; ms <= RR; ms += step) pts.push([X(ms), fn(ms)]); return pts; };
  sh.curve(curve((ms) => PY(cycleAt(ms).ao)), { width: 1.6, stroke: t.ink2, seed: 5, rough: 0.4 });
  sh.curve(curve((ms) => PY(cycleAt(ms).la), 5), { width: 1.4, stroke: t.flag, seed: 6, rough: 0.4 });
  sh.curve(curve((ms) => PY(cycleAt(ms).lv), 4), { width: 2.1, stroke: t.accent, seed: 7, rough: 0.4 });
  const fs = 16 * s;
  sh.text('aorta', X(250), PY(cycleAt(250).ao) - 10, { size: fs, color: t.ink2 });
  sh.text('LV', X(145), PY(cycleAt(145).lv) + 2, { size: fs, color: t.accent, align: 'right' });
  sh.text('LA', X(560), PY(14) - 4, { size: fs, color: t.flag });

  // volume
  const VY = (v) => yV + hV - ((v - 40) / 90) * hV;
  sh.curve(curve((ms) => VY(cycleAt(ms).vol)), { width: 1.8, stroke: t.ink, seed: 8, rough: 0.4 });
  // the label sits over the ejection, where the volume is low
  sh.text('LV volume, mL', X(330), yV + 12, { size: fs * 0.95, color: t.ink2, align: 'center' });
  for (const v of [50, 120]) sh.text(String(v), dx - 6, VY(v) + 4, { family: MONO, weight: 400, size: 9, align: 'right', color: t.ink2 });

  // ECG, one beat from the R wave
  ecgStrip(ctx, dx, dx + dw, yE + hE * 0.72, hE * 0.62, 1, null, { color: t.ink, offset: 0 });
  sh.text('ECG', dx - 6, yE + hE * 0.5, { family: MONO, weight: 400, size: 9, align: 'right', color: t.ink2 });

  // heart sounds
  const snd = (ms, name) => {
    ctx.save();
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 14; k++) {
      const x = X(ms) + k * 1.6, a = (hS * 0.45) * Math.exp(-k / 5) * (k % 2 ? 1 : -1);
      k ? ctx.lineTo(x, yS + hS / 2 + a) : ctx.moveTo(x, yS + hS / 2);
    }
    ctx.stroke();
    ctx.restore();
    sh.text(name, X(ms) + 26, yS + hS / 2 + 5, { size: fs * 0.9 });
  };
  snd(EV.mvc + 6, 'S1');
  snd(EV.avc + 4, 'S2');
  sh.text('sounds', dx - 6, yS + hS / 2 + 3, { family: MONO, weight: 400, size: 9, align: 'right', color: t.ink2 });

  // Doppler: mitral inflow above the baseline, LVOT outflow below (sample between the two)
  const box = { x: dx, y: yD, w: dw, h: hD };
  panel(ctx, box.x, box.y, box.w, box.h, narrow ? '' : 'PW · MITRAL INFLOW AND LVOT');
  spectral(ctx, { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 }, {
    fn: [(u) => mitralV(u * RR), (u) => -lvotV(u * RR)], scale: 1.4, base: 0.52, mode: 'pw', broad: 0.1, key: 'cycle-dopp', seed: 4,
  });
  const dY = (v) => box.y + 2 + 0.52 * (box.h - 4) - v * ((box.h - 4) * 0.52 / 1.4);
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  ctx.fillText('E', X(EV.mvo + 70), dY(0.8) - 4);
  ctx.fillText('A', X(815), dY(0.55) - 4);
  // under the outflow envelope; in a short strip, beside its tail where no flow is drawn
  if (dY(-1.1) + 12 <= box.y + box.h - 3) ctx.fillText('LVOT', X(170), dY(-1.1) + 12);
  else { ctx.textAlign = 'left'; ctx.fillText('LVOT', X(EV.avc) + 4, Math.min(dY(-0.5) + 4, box.y + box.h - 4)); ctx.textAlign = 'center'; }
  // IVRT: end of outflow to start of inflow
  ctx.strokeStyle = SC.cal;
  ctx.setLineDash([2, 3]);
  const iy = dY(0.25);
  ctx.beginPath();
  ctx.moveTo(X(EV.avc), iy); ctx.lineTo(X(EV.mvo), iy);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!narrow) ctx.fillText(`IVRT ${EV.mvo - EV.avc} ms`, (X(EV.avc) + X(EV.mvo)) / 2, iy - 6);
  ctx.restore();

  // time axis
  for (let ms = 0; ms <= RR; ms += 100) {
    sh.line(X(ms), bottom + 2, X(ms), bottom + 6, { width: 1, rough: 0.2, seed: 90 + ms, stroke: t.ink2 });
    if (!narrow || ms % 200 === 0) sh.text(String(ms), X(ms), bottom + 17, { family: MONO, weight: 400, size: 9, align: 'center', color: t.ink2 });
  }
  if (!narrow) sh.text('ms after the R wave', dx + dw, bottom + 30, { family: SANS, weight: 400, size: 10, align: 'right', color: t.ink2 });

  // cursor
  const cxr = X(c.t);
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(cxr, top - 12);
  ctx.lineTo(cxr, bottom);
  ctx.stroke();
  ctx.fillStyle = t.accent;
  for (const y of [PY(c.lv), PY(c.ao), VY(c.vol)]) { ctx.beginPath(); ctx.arc(cxr, y, 3.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // ---------------- the echo frame at this moment
  const fx = narrow ? 14 : W * 0.66, fw = narrow ? W - 28 : W * 0.32;
  const fy = narrow ? bottom + 30 : top, fh = narrow ? H - bottom - 38 : Math.min(fw * 1.05, H * 0.62);
  const E = a4cFrame(Math.round(fw), Math.round(fh), c);
  if (E) {
    ctx.drawImage(E.canvas, fx, fy, fw, fh);
    if (!narrow) {
      sh.text('apical four-chamber at the cursor', fx, fy + fh + 22, { size: 17 });
      const mv = c.mvOpen ? 'open' : 'closed', av = c.avOpen ? 'open' : 'closed';
      sh.text(`mitral ${mv} · aortic ${av}`, fx, fy + fh + 44, { family: MONO, weight: 500, size: 12, color: t.ink2 });
    }
  } else {
    sh.text('cutting the heart model…', fx + 10, fy + 30, { size: 16, color: t.ink3 });
  }
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const NOTE = {
  'Isovolumic contraction': 'The mitral and aortic valves are closed. LV pressure rises at constant volume until it exceeds aortic pressure and the aortic valve opens. Mitral valve closure at the onset of this phase coincides with S1.',
  'Rapid ejection': 'The aortic valve is open, and LV volume decreases rapidly. LVOT flow is displayed below the baseline and reaches its peak velocity early in ejection.',
  'Reduced ejection': 'LVOT flow velocity decreases. LV pressure falls below aortic pressure, and aortic valve closure at the dicrotic notch coincides with S2.',
  'Isovolumic relaxation': 'The aortic and mitral valves are again closed. LV pressure falls at constant volume. On Doppler recordings, this phase corresponds to the IVRT, which extends from the end of LVOT flow to the onset of the E wave.',
  'Rapid filling': 'LV pressure falls below LA pressure, and the mitral valve opens. The pressure difference between the LA and the LV drives early mitral inflow, recorded as the E wave.',
  Diastasis: 'LA and LV pressures are almost equal, and mitral inflow nearly ceases.',
  'Atrial contraction': 'After the P wave, the LA contracts and produces the A wave of mitral inflow, the final part of LV filling before the next beat.',
};

export default {
  key: 'cycle',
  part: 'physiology',
  title: 'Cycle',
  dwell: 14,
  defaults: { tcycle: 250, crun: true },
  format: { tcycle: (v) => `${Math.round(v)} ms` },
  watch: ['tcycle', 'crun'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  enter() { ensure(); },
  warm() { ensure(); },
  anim(dt, s, set) {
    if (!s.crun || reducedMotion) return;
    set({ tcycle: (s.tcycle + (dt * 1000) / 3) % RR });   // one beat slowed three times
  },
  tourEnter(set) { set({ tcycle: 0, crun: true }); },
  text(s) {
    const c = cycleAt(s.tcycle);
    return {
      readouts: [
        { k: 'Phase', v: c.name, text: true },
        { k: 'LV pressure', v: fmt(c.lv), u: 'mmHg' },
        { k: 'Aorta', v: fmt(c.ao), u: 'mmHg' },
        { k: 'LA pressure', v: fmt(c.la), u: 'mmHg' },
        { k: 'LV volume', v: fmt(c.vol), u: 'mL' },
        { k: 'Valves', v: `MV ${c.mvOpen ? 'open' : 'closed'} · AV ${c.avOpen ? 'open' : 'closed'}`, text: true },
      ],
      live: `<b>${c.name}.</b> The cursor is at ${Math.round(c.t)} ms after the R wave. ${NOTE[c.name]}${s.crun ? ' <span class="note">The animation is slowed threefold.</span>' : ''}`,
    };
  },
};

