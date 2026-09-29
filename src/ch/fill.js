// 11 Fill: diastolic function and left atrial pressure. One slider walks the filling pattern
// from normal to restrictive; the 2025 ASE algorithm (sinus rhythm) runs on the values.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';

// Illustrative values at four points of the slider (not patient data).
const KEYS = [
  { E: 0.75, A: 0.55, DT: 190, sep: 9.0, lat: 12.0, tr: 2.3, lavi: 26, lars: 38, sd: 1.3, ivrt: 85 },
  { E: 0.55, A: 0.80, DT: 260, sep: 5.0, lat: 6.5, tr: 2.4, lavi: 30, lars: 28, sd: 1.4, ivrt: 110 },
  { E: 0.95, A: 0.65, DT: 170, sep: 5.0, lat: 6.5, tr: 3.0, lavi: 42, lars: 16, sd: 0.6, ivrt: 65 },
  { E: 1.20, A: 0.40, DT: 130, sep: 4.0, lat: 5.0, tr: 3.3, lavi: 50, lars: 10, sd: 0.4, ivrt: 50 },
];

export function fillValues(f) {
  const i = clamp(Math.floor(f), 0, 2), u = clamp(f - i, 0, 1);
  const a = KEYS[i], b = KEYS[i + 1];
  const v = {};
  for (const k of Object.keys(a)) v[k] = mix(a[k], b[k], u);
  v.avg = (v.sep + v.lat) / 2;
  v.ea = v.E / v.A;
  v.eeSep = (v.E * 100) / v.sep;
  v.eeLat = (v.E * 100) / v.lat;
  v.eeAvg = (v.E * 100) / v.avg;
  return v;
}

/** Nagueh 2025, Figure 3: LA pressure and the grade of diastolic dysfunction. */
export function lapAlgorithm(v) {
  const eRed = v.sep <= 6 || v.lat <= 7 || v.avg <= 6.5;
  const eeUp = v.eeSep >= 15 || v.eeLat >= 13 || v.eeAvg >= 14;
  const trUp = v.tr >= 2.8;
  const n = eRed + eeUp + trUp;
  const step1 = { eRed, eeUp, trUp, n };
  const graded = (why) => ({ step1, lap: 'raised', grade: v.ea >= 2 ? 3 : 2, why, node: v.ea >= 2 ? 'g3' : 'g2' });
  if (n === 0) return { step1, lap: 'normal', grade: 0, why: 'all three first-step values normal', node: 'normal' };
  if (n === 3) return { ...graded('all three first-step values abnormal'), via: 'step1' };
  if (n === 1 && eRed && v.ea <= 0.8) return { step1, lap: 'normal', grade: 1, why: 'reduced e′ is the only abnormal value and E/A ≤ 0.8', node: 'g1' };
  const step2 = { sd: v.sd <= 0.67, lars: v.lars <= 18, lavi: v.lavi > 34 };
  const any = step2.sd || step2.lars || step2.lavi;
  if (any) return { ...graded('one or two first-step values abnormal, and a second-step value abnormal'), step2, via: 'step2' };
  return { step1, step2, lap: 'normal', grade: null, why: 'one or two first-step values abnormal, second-step values normal', node: 'normal2' };
}

const GRADE = { 0: 'normal diastolic function', 1: 'grade 1 diastolic dysfunction', 2: 'grade 2 diastolic dysfunction', 3: 'grade 3 diastolic dysfunction' };

let sheet = null, st = null;

function inflow(v) {
  // E from mitral opening, linear deceleration over DT; A after the P wave
  const eUp = 70;
  return (tt) => {
    const t = ((tt % RR) + RR) % RR;
    let out = 0;
    if (t >= EV.mvo && t < EV.mvo + eUp) out = v.E * Math.sin(((t - EV.mvo) / eUp) * Math.PI / 2);
    else if (t >= EV.mvo + eUp && t < EV.mvo + eUp + v.DT) out = v.E * (1 - (t - EV.mvo - eUp) / v.DT);
    const aOn = 760, aPk = 800, aEnd = RR + 8;
    const tA = t < 20 ? t + RR : t;
    if (tA >= aOn && tA < aPk) out = Math.max(out, v.A * Math.sin(((tA - aOn) / (aPk - aOn)) * Math.PI / 2));
    else if (tA >= aPk && tA < aEnd) out = Math.max(out, v.A * (1 - (tA - aPk) / (aEnd - aPk)));
    return out;
  };
}
function tissue(v, eP) {
  return (tt) => {
    const t = ((tt % RR) + RR) % RR;
    if (t > 70 && t < 330) return 0.08 * Math.sin(Math.PI * (t - 70) / 260) ** 0.9;
    if (t > EV.mvo - 10 && t < EV.mvo + 140) return -(eP / 100) * Math.sin(Math.PI * (t - EV.mvo + 10) / 150);
    if (t > 770 && t < RR) return -0.08 * Math.sin(Math.PI * (t - 770) / (RR - 770));
    return 0;
  };
}

function box(sh, t, x, y, w, h, text, on, sub) {
  sh.rect(x, y, w, h, { width: on ? 1.8 : 1, rough: 0.5, seed: Math.round(x + y), stroke: on ? t.accent : t.rule, fill: on ? t.accent2 : undefined, fillStyle: 'solid' });
  sh.text(text, x + w / 2, y + (sub ? h / 2 - 1 : h / 2 + 5), { family: SANS, weight: on ? 600 : 500, size: 12, align: 'center', color: on ? t.ink : t.ink2 });
  if (sub) sh.text(sub, x + w / 2, y + h / 2 + 14, { family: SANS, weight: 400, size: 10.5, align: 'center', color: t.ink2 });
}
function arrow(sh, t, x1, y1, x2, y2, on) {
  sh.line(x1, y1, x2, y2, { width: on ? 1.8 : 1, rough: 0.3, seed: Math.round(x1 * 3 + y2), stroke: on ? t.accent : t.rule });
  const a = Math.atan2(y2 - y1, x2 - x1), k = 7;
  sh.line(x2, y2, x2 - k * Math.cos(a - 0.45), y2 - k * Math.sin(a - 0.45), { width: on ? 1.8 : 1, rough: 0.2, seed: 5, stroke: on ? t.accent : t.rule });
  sh.line(x2, y2, x2 - k * Math.cos(a + 0.45), y2 - k * Math.sin(a + 0.45), { width: on ? 1.8 : 1, rough: 0.2, seed: 6, stroke: on ? t.accent : t.rule });
}

function flowchart(sh, t, X, Y, Wd, r) {
  const bw = Math.min(170, Wd * 0.3), bh = 40;
  const cx = X + Wd / 2;
  const s1 = r.step1;
  box(sh, t, cx - bw * 1.2, Y, bw * 2.4, bh + 16, 'Step 1: e′ reduced? E/e′ raised? TR ≥2.8 m/s?', true,
    `${s1.eRed ? '●' : '○'} e′   ${s1.eeUp ? '●' : '○'} E/e′   ${s1.trUp ? '●' : '○'} TR   (${s1.n} abnormal)`);
  const y2 = Y + bh + 60;
  const cols = [X + 4, X + Wd / 2 - bw / 2, X + Wd - bw - 4];
  box(sh, t, cols[0], y2, bw, bh, 'none abnormal', s1.n === 0);
  box(sh, t, cols[1], y2, bw, bh, 'one or two', s1.n === 1 || s1.n === 2);
  box(sh, t, cols[2], y2, bw, bh, 'all three', s1.n === 3);
  arrow(sh, t, cx, Y + bh + 16, cols[0] + bw / 2, y2, s1.n === 0);
  arrow(sh, t, cx, Y + bh + 16, cols[1] + bw / 2, y2, s1.n === 1 || s1.n === 2);
  arrow(sh, t, cx, Y + bh + 16, cols[2] + bw / 2, y2, s1.n === 3);
  const y3 = y2 + bh + 44;
  const g1 = r.node === 'g1';
  const w2 = Math.min(Wd - 24, bw * 1.75);
  box(sh, t, cols[1] + bw / 2 - w2 / 2, y3, w2, bh + 10, g1 ? 'e′ only, E/A ≤ 0.8' : 'Step 2', r.via === 'step2' || r.node === 'normal2' || g1, g1 ? 'no second step' : 'S/D ≤0.67 · LARS ≤18% · LAVi >34');
  arrow(sh, t, cols[1] + bw / 2, y2 + bh, cols[1] + bw / 2, y3, s1.n === 1 || s1.n === 2);
  const y4 = y3 + bh + 54;
  box(sh, t, cols[0], y4, bw, bh, 'normal LA pressure', r.lap === 'normal', r.grade === 1 ? 'grade 1' : r.grade === 0 ? 'normal function' : r.node === 'normal2' ? 'no grade drawn' : '');
  box(sh, t, cols[2], y4, bw, bh, 'raised LA pressure', r.lap === 'raised', r.grade ? `grade ${r.grade}: E/A ${r.grade === 3 ? '≥' : '<'} 2` : '');
  arrow(sh, t, cols[0] + bw / 2, y2 + bh, cols[0] + bw / 2, y4, s1.n === 0);
  arrow(sh, t, cols[2] + bw / 2, y2 + bh, cols[2] + bw / 2, y4, s1.n === 3);
  arrow(sh, t, cols[1] + bw * 0.2, y3 + bh + 10, cols[0] + bw * 0.7, y4, r.lap === 'normal' && (s1.n === 1 || s1.n === 2));
  arrow(sh, t, cols[1] + bw * 0.8, y3 + bh + 10, cols[2] + bw * 0.3, y4, r.via === 'step2');
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const v = fillValues(st.fstate);
  const r = lapAlgorithm(v);
  const lx = narrow ? 8 : 24, lw = narrow ? W - 16 : W * 0.46;
  const ph = narrow ? H * 0.2 : (H - 90) / 3;
  let y = narrow ? 8 : 40;
  // mitral inflow
  panel(ctx, lx, y, lw, ph, 'PW · MITRAL INFLOW');
  let bx = { x: lx + 4, y: y + 22, w: lw - 32, h: ph - 26 };
  spectral(ctx, bx, { fn: (u) => inflow(v)(u * 2 * RR), scale: 1.4, base: 0.92, mode: 'pw', broad: 0.1, key: `inflow|${st.fstate.toFixed(2)}`, seed: 2 });
  vscale(ctx, bx, 1.4, 0.92, 0.5);
  const k = (bx.h * 0.92) / 1.4, yb = bx.y + bx.h * 0.92;
  const xE = bx.x + ((EV.mvo + 70) / (2 * RR)) * bx.w, xA = bx.x + (800 / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.fillText(`E ${v.E.toFixed(2)}`, xE - 14, yb - v.E * k - 6);
  ctx.fillText(`A ${v.A.toFixed(2)}`, xA - 14, yb - v.A * k - 6);
  ctx.fillText(`E/A ${v.ea.toFixed(2)} · DT ${Math.round(v.DT)} ms`, bx.x + 8, bx.y + 12);
  ctx.restore();
  // tissue Doppler, septal and lateral side by side
  y += ph + 12;
  panel(ctx, lx, y, lw, ph, 'TISSUE DOPPLER · SEPTAL | LATERAL');
  const hw = (lw - 40) / 2;
  for (const [i, eP, name] of [[0, v.sep, 'septal'], [1, v.lat, 'lateral']]) {
    bx = { x: lx + 4 + i * (hw + 8), y: y + 22, w: hw, h: ph - 26 };
    spectral(ctx, bx, { fn: (u) => tissue(v, eP)(u * RR), scale: 0.18, base: 0.4, mode: 'pw', broad: 0.25, key: `tdi|${name}|${eP.toFixed(2)}`, seed: 6 + i });
    const kk = (bx.h * 0.6) / 0.18, yy = bx.y + bx.h * 0.4;
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(`e′ ${eP.toFixed(1)}`, bx.x + ((EV.mvo + 65) / RR) * bx.w - 10, yy + (eP / 100) * kk + 14);
    ctx.fillText(`E/e′ ${((v.E * 100) / eP).toFixed(1)}`, bx.x + 6, bx.y + bx.h - 6);
    ctx.restore();
  }
  // TR
  y += ph + 12;
  panel(ctx, lx, y, lw, ph, 'CW · TR JET');
  bx = { x: lx + 4, y: y + 22, w: lw - 32, h: ph - 26 };
  spectral(ctx, bx, {
    fn: (u) => { const tt = (u * 2 * RR) % RR; const w = (tt - 20) / 400; return w > 0 && w < 1 ? -v.tr * Math.sin(Math.PI * w) ** 0.45 : 0; },
    scale: 4, base: 0.1, mode: 'cw', broad: 0.5, key: `trfill|${v.tr.toFixed(2)}`, seed: 9,
  });
  vscale(ctx, bx, 4, 0.1, 1);
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.fillText(`TR ${v.tr.toFixed(2)} m/s`, bx.x + 8, bx.y + bx.h - 8);
  ctx.restore();
  // algorithm
  if (!narrow) {
    const fx = W * 0.52, fw = W * 0.46;
    sh.text('ASE 2025 algorithm, sinus rhythm', fx, 40, { size: 20 });
    flowchart(sh, t, fx, 60, fw, r);
  }
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

function fillTable(art, v, r) {
  const tb = art.querySelector('#fill-calc tbody');
  if (!tb) return;
  const rows = [
    ['Septal e′', `${fmt(v.sep)} cm/s`, '≤6', v.sep <= 6],
    ['Lateral e′', `${fmt(v.lat)} cm/s`, '≤7', v.lat <= 7],
    ['Average e′', `${fmt(v.avg)} cm/s`, '≤6.5', v.avg <= 6.5],
    ['Average E/e′', fmt(v.eeAvg), '≥14', v.eeAvg >= 14],
    ['Peak TR velocity', `${fmt(v.tr, 2)} m/s`, '≥2.8', v.tr >= 2.8],
    ['E/A (sets the grade)', fmt(v.ea, 2), '≤0.8 grade 1 · ≥2 grade 3', null],
    ['Pulmonary vein S/D', fmt(v.sd, 2), '≤0.67', v.sd <= 0.67],
    ['LA reservoir strain', `${fmt(v.lars, 0)}%`, '≤18%', v.lars <= 18],
    ['LA volume index', `${fmt(v.lavi, 0)} mL/m²`, '>34', v.lavi > 34],
    ['IVRT (alternative second step)', `${fmt(v.ivrt, 0)} ms`, '≤70', v.ivrt <= 70],
  ];
  tb.innerHTML = rows.map(([k, val, cut, hit]) => `<tr class="${hit ? 'hit' : ''}"><td>${k}</td><td class="num">${val}</td><td>${cut}</td><td class="num">${hit === null ? '–' : hit ? 'abnormal' : 'normal'}</td></tr>`).join('');
  void r;
}

export default {
  key: 'fill',
  part: 'function',
  title: 'Fill',
  dwell: 16,
  defaults: { fstate: 0 },
  format: { fstate: (v) => (v < 0.5 ? 'normal' : v < 1.5 ? 'slow relaxation' : v < 2.5 ? 'raised LA pressure' : 'restrictive') },
  watch: ['fstate'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  tourEnter(set) { set({ fstate: 0 }); },
  tourTick(tt, set) { set({ fstate: Math.round(clamp((tt - 1.5) / 12, 0, 1) * 3 * 20) / 20 }); },
  text(s, { cite }) {
    const v = fillValues(s.fstate);
    const r = lapAlgorithm(v);
    const verdict = r.grade === null ? 'normal LA pressure (Figure 3 draws no grade on this path)' : `${r.lap} LA pressure: ${GRADE[r.grade]}`;
    return {
      readouts: [
        { k: 'E/A', v: fmt(v.ea, 2) },
        { k: 'Average e′', v: fmt(v.avg), u: 'cm/s', flag: v.avg <= 6.5 },
        { k: 'Average E/e′', v: fmt(v.eeAvg), flag: v.eeAvg >= 14 },
        { k: 'TR velocity', v: fmt(v.tr, 2), u: 'm/s', flag: v.tr >= 2.8 },
        { k: 'LA volume index', v: fmt(v.lavi, 0), u: 'mL/m²', flag: v.lavi > 34 },
        { k: 'Result', v: r.grade === null ? 'normal LAP' : r.grade === 0 ? 'normal' : `grade ${r.grade}`, text: true, flag: r.lap === 'raised' },
      ],
      live: `<b>${verdict[0].toUpperCase()}${verdict.slice(1)}.</b> ${r.why[0].toUpperCase()}${r.why.slice(1)}${cite('nagueh2025')}. Values are illustrative, not from a patient.`,
      extra: (art) => fillTable(art, v, r),
    };
  },
};
