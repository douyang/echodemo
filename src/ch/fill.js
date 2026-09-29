// 11 Fill: diastolic function and left atrial pressure. One slider walks the filling pattern
// from normal to restrictive and Play animates it; the 2025 ASE algorithm (sinus rhythm) runs
// on the values. The LA, the pulmonary veins and LA strain change with the grade.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, note, LEVEL, fit } from '../sev.js';
import { drawA4C, measures } from '../echo2d.js';
import { BSA } from './pressure.js';

// Illustrative values at four points of the slider (not patient data).
const KEYS = [
  { E: 0.75, A: 0.55, DT: 190, sep: 9.0, lat: 12.0, tr: 2.3, lavi: 26, lars: 38, sd: 1.3, ivrt: 85, pvD: 0.42, ar: 0.25, lact: 14, wall: 0.9 },
  { E: 0.55, A: 0.80, DT: 260, sep: 5.0, lat: 6.5, tr: 2.4, lavi: 30, lars: 28, sd: 1.4, ivrt: 110, pvD: 0.34, ar: 0.3, lact: 14, wall: 1.05 },
  { E: 0.95, A: 0.65, DT: 170, sep: 5.0, lat: 6.5, tr: 3.0, lavi: 42, lars: 16, sd: 0.6, ivrt: 65, pvD: 0.6, ar: 0.38, lact: 6, wall: 1.1 },
  { E: 1.20, A: 0.40, DT: 130, sep: 4.0, lat: 5.0, tr: 3.3, lavi: 50, lars: 10, sd: 0.4, ivrt: 50, pvD: 0.68, ar: 0.4, lact: 2, wall: 1.1 },
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
/** Short label for the bands under the slider. */
function gradeLabel(f) {
  const r = lapAlgorithm(fillValues(f));
  return r.grade === null ? 'normal LAP' : r.grade === 0 ? 'normal' : `grade ${r.grade}`;
}
let BANDS = [];

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

function flowchart(sh, t, X, Y, Wd, Hd, r) {
  const bw = Math.min(150, Wd * 0.31), bh = 30;
  const gap = Math.max(14, (Hd - (bh + 12) - bh - (bh + 8) - bh) / 3);
  const cx = X + Wd / 2;
  const s1 = r.step1;
  box(sh, t, cx - bw * 1.25, Y, bw * 2.5, bh + 12, 'Step 1: e′ reduced? E/e′ raised? TR ≥2.8?', true,
    `${s1.eRed ? '●' : '○'} e′   ${s1.eeUp ? '●' : '○'} E/e′   ${s1.trUp ? '●' : '○'} TR   (${s1.n} abnormal)`);
  const y2 = Y + bh + 12 + gap;
  const colsX = [X + 2, X + Wd / 2 - bw / 2, X + Wd - bw - 2];
  box(sh, t, colsX[0], y2, bw, bh, 'none abnormal', s1.n === 0);
  box(sh, t, colsX[1], y2, bw, bh, 'one or two', s1.n === 1 || s1.n === 2);
  box(sh, t, colsX[2], y2, bw, bh, 'all three', s1.n === 3);
  arrow(sh, t, cx, Y + bh + 12, colsX[0] + bw / 2, y2, s1.n === 0);
  arrow(sh, t, cx, Y + bh + 12, colsX[1] + bw / 2, y2, s1.n === 1 || s1.n === 2);
  arrow(sh, t, cx, Y + bh + 12, colsX[2] + bw / 2, y2, s1.n === 3);
  const y3 = y2 + bh + gap;
  const g1 = r.node === 'g1';
  const w2 = Math.min(Wd - 20, bw * 1.8);
  box(sh, t, colsX[1] + bw / 2 - w2 / 2, y3, w2, bh + 8, g1 ? 'e′ only, E/A ≤ 0.8' : 'Step 2', r.via === 'step2' || r.node === 'normal2' || g1, g1 ? 'no second step' : 'S/D ≤0.67 · LARS ≤18% · LAVi >34');
  arrow(sh, t, colsX[1] + bw / 2, y2 + bh, colsX[1] + bw / 2, y3, s1.n === 1 || s1.n === 2);
  const y4 = y3 + bh + 8 + gap;
  box(sh, t, colsX[0], y4, bw, bh + 6, 'normal LA pressure', r.lap === 'normal', r.grade === 1 ? 'grade 1' : r.grade === 0 ? 'normal function' : r.node === 'normal2' ? 'no grade drawn' : '');
  box(sh, t, colsX[2], y4, bw, bh + 6, 'raised LA pressure', r.lap === 'raised', r.grade ? `grade ${r.grade}: E/A ${r.grade === 3 ? '≥' : '<'} 2` : '');
  arrow(sh, t, colsX[0] + bw / 2, y2 + bh, colsX[0] + bw / 2, y4, s1.n === 0);
  arrow(sh, t, colsX[2] + bw / 2, y2 + bh, colsX[2] + bw / 2, y4, s1.n === 3);
  arrow(sh, t, colsX[1] + bw * 0.2, y3 + bh + 8, colsX[0] + bw * 0.7, y4, r.lap === 'normal' && (s1.n === 1 || s1.n === 2));
  arrow(sh, t, colsX[1] + bw * 0.8, y3 + bh + 8, colsX[2] + bw * 0.3, y4, r.via === 'step2');
}

const beat = new Beat(RR);
const q2 = (x) => Math.round(x * 50) / 50;

function a4c(ctx, box, v, tt) {
  const laMax = v.lavi * BSA, laMin = laMax * (1 - 0.5 * v.lars / 38);
  const dims = (vol, r) => { const L = Math.cbrt(vol / (0.524 * r * r)); return [r * L, L]; };
  const [wMax, lMax] = dims(laMax, 0.8), [wMin, lMin] = dims(laMin, 0.8);
  const g = {
    lvL: [8.2, 7.0], lvW: [4.6, 2.95], lvWall: [v.wall, v.wall * 1.4], ivs: [v.wall, v.wall * 1.35],
    rvW: [3.3, 2.7], laW: [wMin, wMax], laL: [lMin, lMax], raW: [3.2, 3.8], raL: [3.9, 4.5], ma: 3.1, ta: 3.0,
  };
  drawA4C(ctx, box, g, {
    t: tt, depth: 16, title: fit(box.w, 'APICAL FOUR-CHAMBER', 'A4C'),
    after: (c, F) => measures(c, F, [`LA volume index ${Math.round(v.lavi)} mL/m²`]),
  });
}

function inflowPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · MITRAL INFLOW');
  const bx = inner(P);
  spectral(ctx, bx, { fn: (u) => inflow(v)(u * 2 * RR), scale: 1.4, base: 0.92, mode: 'pw', broad: 0.1, key: `inflow|${st.fstate.toFixed(2)}`, seed: 2 });
  vscale(ctx, bx, 1.4, 0.92, 0.5);
  note(ctx, bx, fit(P.w, `E ${v.E.toFixed(2)} · A ${v.A.toFixed(2)} m/s · E/A ${v.ea.toFixed(2)} · DT ${Math.round(v.DT)} ms`, `E/A ${v.ea.toFixed(2)}`), 'top');
  return bx;
}

function tdiPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'TISSUE DOPPLER · SEPTAL | LATERAL', 'TDI · SEPT | LAT'));
  const bx0 = inner(P);
  const hw = (bx0.w - 8) / 2;
  const out = [];
  for (const [i, eP, name] of [[0, v.sep, 'septal'], [1, v.lat, 'lateral']]) {
    const bx = { x: bx0.x + i * (hw + 8), y: bx0.y, w: hw, h: bx0.h };
    spectral(ctx, bx, { fn: (u) => tissue(v, eP)(u * RR), scale: 0.18, base: 0.4, mode: 'pw', broad: 0.25, key: `tdi|${name}|${eP.toFixed(2)}`, seed: 6 + i });
    note(ctx, bx, fit(P.w, `e′ ${eP.toFixed(1)} · E/e′ ${((v.E * 100) / eP).toFixed(1)}`, `e′ ${eP.toFixed(1)}`), 'bottom');
    out.push(bx);
  }
  return out;
}

function pvPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · PULMONARY VEIN');
  const bx = inner(P, 26);
  const D = q2(v.pvD), S = q2(v.sd * v.pvD), Ar = -q2(v.ar);
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
  };
  spectral(ctx, bx, { fn, scale: 1.0, base: 0.62, mode: 'pw', broad: 0.12, key: `fpv|${S}|${D}|${Ar}`, seed: 21 });
  vscale(ctx, bx, 1.0, 0.62, 0.5, '');
  note(ctx, bx, `S/D ${v.sd.toFixed(2)} · Ar ${Math.round(v.ar * 100)} cm/s`, 'top');
  return bx;
}

function strainPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'LA STRAIN');
  const bx = inner(P, 26);
  const L = v.lars, C = v.lact;
  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const eps = (tt) => {
    const t = ((tt % RR) + RR) % RR;
    if (t < 400) return L * smooth(t / 400);
    if (t < 650) return L - (L - C) * smooth((t - 400) / 250);
    if (t < 780) return C;
    return C * (1 - smooth((t - 780) / (RR - 780)));
  };
  const top = 45;
  const y0 = bx.y + bx.h - 6, k = (bx.h - 14) / top;
  ctx.save();
  ctx.strokeStyle = SC.frame;
  ctx.beginPath();
  ctx.moveTo(bx.x, y0);
  ctx.lineTo(bx.x + bx.w, y0);
  ctx.stroke();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const y = y0 - eps(u * 2 * RR) * k;
    if (i) ctx.lineTo(bx.x + u * bx.w, y); else ctx.moveTo(bx.x + u * bx.w, y);
  }
  ctx.stroke();
  ctx.restore();
  vscale(ctx, { x: bx.x, y: bx.y + 8, w: bx.w, h: bx.h - 14 }, 40, 1, 20, '%');
  note(ctx, bx, `reservoir ${Math.round(L)}%`, 'top');
  return bx;
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const v = fillValues(st.fstate);
  const r = lapAlgorithm(v);
  const tt = beat.at(st.fCine, 250);
  if (narrow) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    a4c(ctx, a, v, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    cursor(ctx, inflowPanel(ctx, p1, v), beat.sweep);
    for (const bx of tdiPanel(ctx, p2, v)) cursor(ctx, bx, (beat.sweep * 2) % 1);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.05, colL.h * 0.54);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  flowchart(sh, t, colL.x, colL.y + vh + 18, colL.w, colL.h - vh - 22, r);
  const [p1, p2, p3, p4] = rows(colR, [1, 0.95, 1, 0.95], 10);
  cursor(ctx, inflowPanel(ctx, p1, v), beat.sweep);
  for (const bx of tdiPanel(ctx, p2, v)) cursor(ctx, bx, (beat.sweep * 2) % 1);
  const [c1, c2] = cols(p3, [1, 1], 10);
  cursor(ctx, pvPanel(ctx, c1, v), beat.sweep);
  cursor(ctx, strainPanel(ctx, c2, v), beat.sweep);
  // TR
  panel(ctx, p4.x, p4.y, p4.w, p4.h, 'CW · TR JET');
  const bx = inner(p4);
  spectral(ctx, bx, {
    fn: (u) => { const t2 = (u * 2 * RR) % RR; const w = (t2 - 20) / 400; return w > 0 && w < 1 ? -v.tr * Math.sin(Math.PI * w) ** 0.45 : 0; },
    scale: 4, base: 0.1, mode: 'cw', broad: 0.5, key: `trfill|${v.tr.toFixed(2)}`, seed: 9,
  });
  vscale(ctx, bx, 4, 0.1, 1);
  note(ctx, bx, `TR ${v.tr.toFixed(2)} m/s`, 'bottom');
  cursor(ctx, bx, beat.sweep);
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
  defaults: { fstate: 0, fCine: true },
  format: { fstate: (v) => (v < 0.5 ? 'normal' : v < 1.5 ? 'slow relaxation' : v < 2.5 ? 'raised LA pressure' : 'restrictive') },
  watch: ['fstate', 'fCine'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeLabel(s * 3));
    paintBands(document.getElementById('fill-grades'), BANDS, LEVEL, { 'normal LAP': '' });
  },
  anim(dt, s, set) {
    // Play walks the pattern from normal to restrictive (the slider runs 0 to 3)
    if (s.anim) {
      const scaled = { anim: true, f01: s.fstate / 3 };
      playSeverity(dt, scaled, (p) => set({ fstate: Math.round(p.f01 * 3 * 100) / 100 }), 'f01', BANDS, { dur: 16 });
    }
    if (beat.tick(dt, s.fCine) && sheet) sheet.dirty = true;
  },
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
