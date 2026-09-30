// 06 Loop: the left ventricle as a pressure-volume loop. The end-systolic pressure-volume
// relation (slope Ees) and the arterial elastance line (slope Ea) meet at end-systole; the
// end-diastolic relation sets how much the ventricle fills at a given pressure.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { EV, RR } from '../cyclemodel.js';

// End-diastolic relation P = A (e^(beta V) - 1); stiffness sets beta. V0 of the end-systolic
// relation is taken as 0, so EF = Ees / (Ees + Ea).
const A_EDP = 0.25;
const beta = (stiff) => 0.012 + 0.06 * stiff;
const edpvr = (V, stiff) => A_EDP * (Math.exp(beta(stiff) * V) - 1);
const edvFrom = (edp, stiff) => Math.log(edp / A_EDP + 1) / beta(stiff);

export const PV_PRESETS = {
  normal: { edp: 9, ees: 2.4, ea: 1.6, stiff: 0.3 },
  hfref: { edp: 20, ees: 0.65, ea: 1.7, stiff: 0.13 },
  hfpef: { edp: 20, ees: 3.0, ea: 2.4, stiff: 0.55 },
  as: { edp: 16, ees: 3.5, ea: 3.5, stiff: 0.45 },
};
const PNAME = { normal: 'Normal', hfref: 'Weak ventricle (HFrEF)', hfpef: 'Stiff ventricle (HFpEF)', as: 'Pressure load', custom: 'Your settings' };

export function pvState(s) {
  const edv = edvFrom(s.edp, s.stiff);
  const esv = (s.ea * edv) / (s.ees + s.ea);
  const sv = edv - esv;
  const pes = s.ees * esv;
  const pao = 0.7 * pes;                  // pressure at aortic valve opening (model)
  const pmin = Math.max(2, edpvr(esv, s.stiff));
  return { edv, esv, sv, ef: sv / edv, pes, pao, pmin, ratio: s.ea / s.ees, stiff: s.stiff, edp: s.edp };
}

/** The loop as a list of [V, P] points, with the time fraction of each phase. */
function loopPath(L) {
  const pts = [];
  const n = 40;
  // isovolumic contraction
  for (let i = 0; i <= n / 4; i++) pts.push([L.edv, mix(L.edp, L.pao, i / (n / 4))]);
  // ejection: volume falls fastest early; pressure rises to a peak, then falls to Pes
  const k = 0.21 * L.pes;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    pts.push([L.edv - L.sv * Math.pow(u, 0.8), L.pao + (L.pes - L.pao) * u + k * Math.sin(Math.PI * Math.pow(u, 0.65))]);
  }
  // isovolumic relaxation
  for (let i = 1; i <= n / 4; i++) pts.push([L.esv, mix(L.pes, L.pmin, i / (n / 4))]);
  // filling along the end-diastolic relation
  for (let i = 1; i <= n; i++) {
    const w = i / n, V = mix(L.esv, L.edv, Math.pow(w, 0.7));
    pts.push([V, edpvr(V, L.stiff) + (L.pmin - edpvr(L.esv, L.stiff)) * (1 - w)]);
  }
  return pts;
}

/** Point on the loop at time t (ms from the R wave), for the moving dot. */
function loopAt(L, t) {
  const tt = ((t % RR) + RR) % RR;
  const ivc = EV.avo - EV.mvc, ej = EV.avc - EV.avo, ivr = EV.mvo - EV.avc;
  const since = (tt - EV.mvc + RR) % RR;
  const k = 0.21 * L.pes;
  if (since < ivc) return [L.edv, mix(L.edp, L.pao, since / ivc)];
  if (since < ivc + ej) {
    const u = (since - ivc) / ej;
    return [L.edv - L.sv * Math.pow(u, 0.8), L.pao + (L.pes - L.pao) * u + k * Math.sin(Math.PI * Math.pow(u, 0.65))];
  }
  if (since < ivc + ej + ivr) return [L.esv, mix(L.pes, L.pmin, (since - ivc - ej) / ivr)];
  const w = (since - ivc - ej - ivr) / (RR - ivc - ej - ivr);
  const f = 1 - Math.pow(1 - w, 2.2);   // early filling is fast
  const V = mix(L.esv, L.edv, Math.pow(f, 0.7));
  return [V, edpvr(V, L.stiff) + (L.pmin - edpvr(L.esv, L.stiff)) * (1 - f)];
}

function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

let sheet = null, st = null, setState = null, clock = 0;

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const L = pvState(st), N = pvState(PV_PRESETS.normal);
  const x0 = narrow ? 50 : 88, x1 = narrow ? W - 18 : W - 60;
  const y0 = narrow ? 30 : 60, y1 = narrow ? H - 58 : H - 70;
  const VMAX = 300, PMAX = 220;
  const X = (v) => x0 + (v / VMAX) * (x1 - x0);
  const Y = (p) => y1 - (p / PMAX) * (y1 - y0);
  const s = narrow ? 0.85 : 1;

  // axes
  sh.line(x0, y1, x1, y1, { width: 1.2, rough: 0.4, seed: 1 });
  sh.line(x0, y1, x0, y0, { width: 1.2, rough: 0.4, seed: 2 });
  for (let v = 0; v <= VMAX; v += 50) {
    sh.line(X(v), y1, X(v), y1 + 4, { width: 1, rough: 0.2, seed: 10 + v, stroke: t.ink2 });
    sh.text(String(v), X(v), y1 + 17, { family: MONO, weight: 400, size: 10, align: 'center', color: t.ink2 });
  }
  for (let p = 0; p <= PMAX; p += 40) {
    sh.line(x0 - 4, Y(p), x0, Y(p), { width: 1, rough: 0.2, seed: 40 + p, stroke: t.ink2 });
    sh.text(String(p), x0 - 7, Y(p) + 4, { family: MONO, weight: 400, size: 10, align: 'right', color: t.ink2 });
  }
  sh.text('LV volume, mL', x1, y1 + 36, { family: SANS, weight: 500, size: 11, align: 'right', color: t.ink2 });
  sh.text('LV pressure, mmHg', x0 - 7, y0 - 14, { family: SANS, weight: 500, size: 11, align: 'left', color: t.ink2 });

  // end-systolic relation: slope Ees from V0 = 0
  const vTop = Math.min(VMAX, PMAX / st.ees);
  sh.line(X(0), Y(0), X(vTop), Y(st.ees * vTop), { width: 1.6, rough: 0.5, seed: 21, stroke: t.accent });
  // the equation card, top right on a desktop: the labels keep off it
  const cardX = x1 - 250, cardY = y0 + 4;
  const card = narrow ? null : { x0: cardX - 2, y0: cardY - 2, x1: cardX + 250, y1: cardY + 58 };
  const hit = (a, b) => b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // the ESPVR label by the line's end, or lower along the line where it has room: left of the
  // line on a phone, right of it on a desktop; never across the axis, the edge or the card
  const esT = `ESPVR · Ees ${st.ees.toFixed(2)}`, esW = sh.measure(esT, { size: 17 * s });
  let es = null;
  for (const f of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    const px = X(vTop * f), py = Y(st.ees * vTop * f);
    const right = { x: px + 6, y: py + 4, align: 'left', box: { x0: px + 6, y0: py - 10, x1: px + 6 + esW, y1: py + 6 } };
    const left = { x: px - 4, y: py + 14, align: 'right', box: { x0: px - 4 - esW, y0: py, x1: px - 4, y1: py + 16 } };
    es = (narrow ? [left, right] : [right, left]).find((c) => c.box.x0 >= x0 + 4 && c.box.x1 <= W - 8 && c.box.y0 >= 2 && !hit(c.box, card));
    if (es) break;
  }
  if (!es) es = { x: Math.max(X(vTop) - 4, x0 + 4 + esW), y: Y(st.ees * vTop) + 14, align: 'right' };
  sh.text(esT, es.x, es.y, { size: 17 * s, color: t.accent, align: es.align });
  // end-diastolic relation
  const ed = [];
  for (let v = 0; v <= VMAX; v += 4) { const p = edpvr(v, st.stiff); if (p > 70) break; ed.push([X(v), Y(p)]); }
  if (ed.length > 2) sh.curve(ed, { width: 1.5, rough: 0.4, seed: 22, stroke: t.ink2 });
  const lastEd = ed[ed.length - 1];
  if (lastEd) {
    // at the curve's end; pulled back inside the figure, and up off the curve, when the curve
    // runs to the right edge
    const edW = sh.measure('EDPVR', { size: 17 * s }), edX = Math.min(lastEd[0] + 4, W - 8 - edW);
    sh.text('EDPVR', edX, lastEd[1] - (edX < lastEd[0] + 4 ? 12 : 2), { size: 17 * s, color: t.ink2 });
  }
  // arterial elastance line: from EDV on the volume axis through the end-systolic point
  const vEa = Math.max(0, L.edv - PMAX / st.ea);
  sh.line(X(L.edv), Y(0), X(vEa), Y(st.ea * (L.edv - vEa)), { width: 1.3, rough: 0.4, seed: 23, stroke: t.flag, dash: [6, 5] });
  // the stroke volume label: its short name on a small loop, left of the EDV corner
  const by = y1 - 18, sv = Math.round(L.sv);
  const svT = sh.fit([`stroke volume ${sv} mL`, `SV ${sv} mL`], X(L.edv) - X(L.esv) + 40, { size: 16 * s }, 1).str;
  const svW = sh.measure(svT, { size: 16 * s });
  const svX = Math.max(x0 + 4 + svW / 2, Math.min((X(L.esv) + X(L.edv)) / 2, X(L.edv) - 2 - svW / 2));
  // Ea beside the EDV corner, clear of the stroke volume label and, on a desktop, of the
  // end-diastole label there: low on the corner, else right of that label, else above the
  // stroke volume label
  const eaT = `Ea ${st.ea.toFixed(2)}`, eaW = sh.measure(eaT, { size: 17 * s });
  const svBox = { x0: svX - svW / 2, y0: by - 7 - 13, x1: svX + svW / 2, y1: by - 3 };
  let edBox = null;
  if (!narrow) {
    ctx.save();
    ctx.font = `500 11px ${SANS}`;
    const w = ctx.measureText('end-diastole').width;
    ctx.restore();
    edBox = { x0: X(L.edv) + 8, y0: Y(L.edp) + 14 - 9, x1: X(L.edv) + 8 + w, y1: Y(L.edp) + 14 + 3 };
  }
  const eaAt = (x, y) => ({ x, y, box: { x0: x, y0: y - 13, x1: x + eaW, y1: y + 4 } });
  const eaTries = [eaAt(X(L.edv) + 6, Y(14))];
  if (edBox) eaTries.push(eaAt(edBox.x1 + 8, Y(L.edp) + 14));
  eaTries.push(eaAt(X(L.edv) + 6, Math.min(Y(14), by - 7 - 16 * s - 4)));
  const ea = eaTries.find((c) => c.box.x1 <= W - 8 && !hit(c.box, svBox) && !hit(c.box, edBox)) || eaTries[eaTries.length - 1];
  sh.text(eaT, ea.x, ea.y, { size: 17 * s, color: t.flag });

  // the normal loop, faint
  const ghost = loopPath(N).map(([v, p]) => [X(v), Y(p)]);
  ctx.save();
  ctx.globalAlpha = 0.35;
  sh.poly(ghost, { width: 1.1, rough: 0.5, seed: 30, stroke: t.ink3 });
  ctx.restore();
  // this loop
  const pts = loopPath(L);
  sh.poly(pts.map(([v, p]) => [X(v), Y(p)]), { width: 2.2, rough: 0.6, seed: 31, stroke: t.ink, fill: t.accent2, fillStyle: 'hachure', gap: 6 });
  // corners
  const dot = (v, p, label, dx, dy, align = 'left') => {
    ctx.fillStyle = t.ink;
    ctx.beginPath();
    ctx.arc(X(v), Y(p), 3.2, 0, Math.PI * 2);
    ctx.fill();
    if (label && !narrow) sh.text(label, X(v) + dx, Y(p) + dy, { family: SANS, weight: 500, size: 11, color: t.ink2, align });
  };
  dot(L.edv, L.edp, 'end-diastole', 8, 14);
  dot(L.esv, L.pes, 'end-systole', -8, -8, 'right');
  dot(L.edv, L.pao, 'aortic valve opens', 8, 4);
  dot(L.esv, L.pmin, 'mitral valve opens', -8, -8, 'right');
  // stroke volume bracket
  sh.line(X(L.esv), by, X(L.edv), by, { width: 1.2, rough: 0.3, seed: 40, stroke: t.ink });
  sh.line(X(L.esv), by - 4, X(L.esv), by + 4, { width: 1.2, rough: 0.2, seed: 41 });
  sh.line(X(L.edv), by - 4, X(L.edv), by + 4, { width: 1.2, rough: 0.2, seed: 42 });
  sh.text(svT, svX, by - 7, { size: 16 * s, align: 'center' });

  // the moving point, one beat at a time
  const [v, p] = loopAt(L, reducedMotion ? EV.avc : (clock * 1000) / 2.2);
  ctx.save();
  ctx.fillStyle = t.flag;
  ctx.beginPath();
  ctx.arc(X(v), Y(p), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // equation card
  if (!narrow) {
    const cx = cardX, cy = cardY;
    sh.text('EF = SV / EDV = Ees / (Ees + Ea)', cx, cy + 12, { family: MONO, weight: 500, size: 12, color: t.ink });
    sh.text(`${Math.round(L.ef * 100)}% = ${st.ees.toFixed(2)} / (${st.ees.toFixed(2)} + ${st.ea.toFixed(2)})`, cx, cy + 30, { family: MONO, weight: 400, size: 12, color: t.ink2 });
    sh.text('grey loop: normal', cx, cy + 52, { family: SANS, weight: 400, size: 11, color: t.ink3 });
  }
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export default {
  key: 'loop',
  part: 'physiology',
  title: 'Loop',
  dwell: 16,
  defaults: { pv: 'normal', ...PV_PRESETS.normal },
  format: {
    edp: (v) => `${v.toFixed(1)} mmHg`,
    ea: (v) => v.toFixed(2),
    ees: (v) => v.toFixed(2),
    stiff: (v) => (v < 0.2 ? 'compliant' : v < 0.4 ? 'normal' : v < 0.65 ? 'stiff' : 'very stiff'),
  },
  watch: ['pv', 'edp', 'ea', 'ees', 'stiff'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) { st = state; setState = set; },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt;
    if (sheet) sheet.dirty = true;
  },
  onState(s, ch) {
    const p = PV_PRESETS[s.pv];
    if ('pv' in ch && p) {
      if (Object.keys(p).some((k) => s[k] !== p[k])) setState({ ...p });
      return;
    }
    // a slider moved away from the preset: no preset button stays pressed
    if (p && ['edp', 'ea', 'ees', 'stiff'].some((k) => k in ch) && Object.keys(p).some((k) => Math.abs(s[k] - p[k]) > 1e-9)) setState({ pv: 'custom' });
  },
  tourEnter(set) { set({ pv: 'normal', ...PV_PRESETS.normal }); },
  tourTick(tt, set, s) {
    const want = tt < 4 ? 'normal' : tt < 8 ? 'hfref' : tt < 12 ? 'hfpef' : 'as';
    if (s.pv !== want) set({ pv: want, ...PV_PRESETS[want] });
  },
  text(s, { cite }) {
    const L = pvState(s);
    const lo = L.ef < 0.52;
    return {
      readouts: [
        { k: 'EDV', v: fmt(L.edv), u: 'mL' },
        { k: 'ESV', v: fmt(L.esv), u: 'mL' },
        { k: 'Stroke volume', v: fmt(L.sv), u: 'mL' },
        { k: 'EF', v: fmt(L.ef * 100), u: '%', flag: lo },
        { k: 'End-systolic pressure', v: fmt(L.pes), u: 'mmHg' },
        { k: 'Ea / Ees', v: fmt(L.ratio, 2), flag: L.ratio > 1.2 },
      ],
      live: `<b>${PNAME[s.pv] || PNAME.custom}.</b> At an end-diastolic pressure of ${fmt(s.edp, 1)} mmHg the ventricle fills to ${fmt(L.edv)} mL. It ejects ${fmt(L.sv)} mL against an end-systolic pressure of ${fmt(L.pes)} mmHg: EF ${fmt(L.ef * 100)}%, Ea/Ees ${fmt(L.ratio, 2)}${cite('mongegarcia2020')}. Stroke work, the area of the loop, is ${fmt(area(loopPath(L)) * 1.333e-4, 2)} J.`,
    };
  },
};
