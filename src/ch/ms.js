// 13 Mitral stenosis: one slider from a normal mitral valve to severe rheumatic stenosis. The
// area sets the pressure half-time (220 / area) and, with the heart rate, the mean gradient;
// the LA enlarges, the pulmonary pressure rises, the RV follows. Illustrative values.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { msGrade } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit, shown } from '../sev.js';
import { drawA4C, drawPSAXmv, measures, shownMitralThick } from '../echo2d.js';
import { BSA } from './pressure.js';
import { JETS } from '../jets.js';

const KEY = 'msS';
const mean = (fn, n = 400) => { let a = 0; for (let i = 0; i < n; i++) a += fn((i + 0.5) / n); return a / n; };

/** Mitral inflow for a stenotic valve: PHT = 220 / MVA; the gradient rises with heart rate. */
export function mitral({ mva, sv, hr }) {
  const RRms = 60000 / hr;
  const qs2 = 541 - 2.2 * hr;                                // ms, Boudoulas 1981 (men)
  const ivrt = 96 * Math.sqrt(RRms / 857);
  const dfp = Math.max(80, RRms - qs2 - ivrt);                 // ms of filling
  const pht = 220 / mva;                                      // ms (MVA = 220 / PHT)
  const dt = pht / (1 - Math.SQRT1_2);                        // linear fall: time to zero flow
  const env = (t) => Math.max(0, 1 - t / dt) + 0.25 * (t > dfp - 120 ? Math.sin(Math.PI * (t - dfp + 120) / 120) : 0);
  const unit = mean((u) => env(u * dfp)) * dfp / 1000;       // s: VTI per 1 m/s of v0
  const v0 = (sv / mva) / 100 / unit;                         // m/s, so that area x VTI = SV
  const mg = 4 * v0 * v0 * mean((u) => env(u * dfp) ** 2);
  return { RRms, dfp, pht, dt, env, v0, mg };
}

const mvaOf = mono([[0, 4.5], [0.25, 2.5], [0.5, 1.5], [0.75, 1.0], [1, 0.75]]);
// Peak TR velocity (m/s) by the valve area as printed. The PA systolic pressure follows from it,
// 4v² + the RA pressure, as an echo study derives it, and meets the ASE bands (Pandian 2023): 30 mmHg
// from an area of 2.50 cm² and 50 mmHg from 1.50 cm². The keys sit half-way between printed areas.
const trvOf = mono([[0.75, 3.9], [1.0, 3.6], [1.505, 3.35], [2.505, 2.55], [4.5, 2.3]]);
const TRK = tracks([0, 0.25, 0.5, 0.75, 1], {
  lavi: [24, 32, 45, 58, 70],
  la: [3.2, 3.8, 4.6, 5.2, 5.8],
  rvb: [3.4, 3.5, 3.8, 4.2, 4.6],
  tapse: [23, 22, 21, 19, 17],
  thick: [0.12, 0.25, 0.35, 0.45, 0.5],
  dome: [0, 0.6, 0.85, 1, 1],
  lvid: [4.8, 4.7, 4.6, 4.5, 4.4],
});

export function model(s, hr = 70) {
  const m = TRK(s);
  m.s = s;
  m.mva = shown(mvaOf(s), 2);
  // the cardiac output is held at 4.9 L/min, so the stroke volume falls as the heart rate rises:
  // a fixed 70 mL through the shorter filling period gave about 5 times the gradient at 110/min
  Object.assign(m, mitral({ mva: m.mva, sv: (70 * 70) / hr, hr }));
  m.hr = hr;
  // the values as the page prints them, so that the flags and the sentences agree with them
  m.pht = shown(m.pht);
  m.mg = shown(m.mg, 1);
  for (const [k, d] of [['lavi', 0], ['rvb', 1], ['tapse', 0]]) m[k] = shown(m[k], d);
  m.rap = m.mva <= 1.5 ? 8 : 3;                      // the RA pressure the figure adds: 8 mmHg once severe
  m.trv = shown(trvOf(m.mva), 1);
  m.pasp = shown(4 * m.trv * m.trv + m.rap);
  m.tip = 2 * Math.sqrt(m.mva / Math.PI);
  m.grade = gradeOf(s);
  return m;
}
// graded by the valve area as printed (Pandian 2023 Table 1)
export function gradeOf(s) {
  const mva = shown(mvaOf(s), 2);
  if (mva >= 4.0) return 'none';
  const g = msGrade(mva);
  return g === 'progressive, mild' ? 'mild' : g === 'progressive, moderate' ? 'moderate' : g;
}
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;

/** LA width and length (cm) of an ellipsoid of volume vol (mL) and width/length ratio r. */
function laDims(vol, r) {
  const L = Math.cbrt(vol / (0.524 * r * r));
  return [r * L, L];
}

function a4c(ctx, box, m, t) {
  // the LA stays large through diastole: the narrow valve keeps it from emptying
  const laMax = m.lavi * BSA, laMin = laMax * (0.6 + 0.25 * m.s);
  const [wMax, lMax] = laDims(laMax, 0.8 + 0.1 * m.s), [wMin, lMin] = laDims(laMin, 0.8 + 0.1 * m.s);
  const g = {
    lvL: [8.2, 7.05], lvW: [m.lvid, m.lvid * 0.64], lvWall: [0.9, 1.25], ivs: [0.9, 1.2],
    rvW: [m.rvb, m.rvb - 0.6], laW: [wMin, wMax], laL: [lMin, lMax],
    raW: [3.2 + 0.7 * m.s, 3.8 + 0.8 * m.s], raL: [3.9 + 0.5 * m.s, 4.5 + 0.6 * m.s], ma: 3.1, ta: 3.0 + 0.4 * m.s,
    mv: { thick: m.thick, dome: m.dome, tip: Math.min(2.4, m.tip) },
  };
  // the jet runs from mitral opening to mitral closure and follows the inflow velocity: it
  // fades in diastasis through a mild stenosis and stays through a severe one
  const t0 = EV.mvo, fill = RR - t0 + EV.mvc;
  const since = t >= t0 ? t - t0 : t + RR - t0;
  const a = since < fill && m.s > 0.08 ? Math.min(1, since / 40) * clamp(m.env((since / fill) * m.dfp), 0.3, 1) : 0;
  const jl = 2.5 + 2.5 * m.s;
  const jet = m.s > 0.08 ? { q: (70 / (m.dfp / 1000)) * 1.1, vc: m.tip * 0.6, jl, jw: 0.9 + m.tip * 0.4, a } : null;
  drawA4C(ctx, box, g, {
    t, depth: 16 + m.s, title: fit(box.w, 'APICAL FOUR-CHAMBER · COLOR 40 cm/s', 'A4C · COLOR 40'),
    ...(JETS === 'plume'
      ? { jets: jet ? { ms: { ...jet, va: 40 } } : {} }
      : {
        color: {
          roi: 'mvin', reach: 1.6 + jl, lo: -40, hi: 40, variance: true, pvS: 0.5, pvD: 0.4 - 0.15 * m.s,
          // the flow converges on the domed leaflets from the LA (a funnel, not a flat valve)
          ms: jet ? { ...jet, u0: m.v0 * 100, half: 0.9, soft: 0.35 } : null,
        },
      }),
    after: (c, F) => measures(c, F, [[`LA volume index ${Math.round(m.lavi)} mL/m²`, `LAVi ${Math.round(m.lavi)} mL/m²`], `leaflets ${(shownMitralThick(m.thick) * 10).toFixed(0)} mm`]),
  });
}

function inflowCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, `CW · MITRAL INFLOW · HR ${Math.round(m.hr)}`, `CW · MV · HR ${Math.round(m.hr)}`));
  const bx = inner(P);
  const span = 2 * m.RRms;
  const start = m.RRms - m.dfp;
  const fn = (u) => {
    const tt = (u * span) % m.RRms;
    const since = tt - start;
    return since >= 0 ? m.v0 * m.env(since) : 0;
  };
  const vs = Math.max(2, Math.ceil(m.v0 + 0.5));
  spectral(ctx, bx, { fn, scale: vs, base: 0.9, mode: 'cw', broad: 0.4, key: `msin|${m.mva.toFixed(2)}|${Math.round(m.hr)}|${vs}`, seed: 4 });
  vscale(ctx, bx, vs, 0.9, 1);
  const k = (bx.h * 0.9) / vs, yb = bx.y + bx.h * 0.9;
  const X = (ms) => bx.x + (ms / span) * bx.w;
  const x0 = X(start), x1 = X(start + Math.min(m.pht, m.dfp));
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.beginPath();
  ctx.moveTo(x0, yb - m.v0 * k);
  ctx.lineTo(X(start + Math.min(m.dt, m.dfp)), yb - m.v0 * Math.max(0, 1 - Math.min(m.dt, m.dfp) / m.dt) * k);
  ctx.stroke();
  ctx.restore();
  caliper(ctx, x0, yb - m.v0 * k - 10, x1, yb - m.v0 * k - 10, { solid: true });
  note(ctx, bx, [`PHT ${Math.round(m.pht)} ms · mean gradient ${m.mg.toFixed(1)} mmHg · peak ${m.v0.toFixed(1)} m/s`, `PHT ${Math.round(m.pht)} · MG ${m.mg.toFixed(1)}`], 'top');
  return { bx, span };
}

function trCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'CW · TRICUSPID REGURGITATION');
  const bx = inner(P);
  const v = q2(m.trv);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const w = (t - EV.mvc) / (EV.mvo - EV.mvc);
    return w > 0 && w < 1 ? -v * Math.pow(Math.sin(Math.PI * w), 0.45) : 0;
  };
  spectral(ctx, bx, { fn, scale: 4.5, base: 0.06, mode: 'cw', broad: 0.5, key: `mstr|${v}`, seed: 9 });
  vscale(ctx, bx, 4.5, 0.06, 1);
  note(ctx, bx, [`TR ${m.trv.toFixed(1)} m/s · PA systolic ${Math.round(m.pasp)} mmHg (RA ${m.rap})`, `TR ${m.trv.toFixed(1)} · PASP ${Math.round(m.pasp)}`], 'bottom');
  return bx;
}

function meterItems(m) {
  return [
    { k: 'Mitral valve area', v: m.mva, u: 'cm²', d: 2, lo: 0.5, hi: 5, cuts: [[1.5, '1.5'], [2.5, '2.5']], bad: m.mva <= 1.5 },
    { k: 'Pressure half-time', v: m.pht, u: 'ms', lo: 0, hi: 320, cuts: [[100, '100'], [150, '150']], bad: m.pht >= 150 },
    { k: `Mean gradient (HR ${Math.round(m.hr)})`, v: m.mg, u: 'mmHg', d: 1, lo: 0, hi: 25, cuts: [[5, '5'], [10, '10']], bad: m.mg >= 10 },
    { k: 'PA systolic pressure', v: m.pasp, u: 'mmHg', lo: 15, hi: 80, cuts: [[30, '30'], [50, '50']], bad: m.pasp >= 50 },
    { k: 'LA volume index', v: m.lavi, u: 'mL/m²', lo: 10, hi: 85, norm: [16, 34], cuts: [[34, '34'], [48, '48']], bad: m.lavi > 34 },
    { k: 'RV basal diameter', v: m.rvb, u: 'cm', d: 1, lo: 2.5, hi: 5.5, norm: [2.5, 4.1], cuts: [[4.1, '4.1']], bad: m.rvb >= 4.1 },
    { k: 'TAPSE', v: m.tapse, u: 'mm', lo: 8, hi: 30, norm: [17, 30], cuts: [[17, '17']], bad: m.tapse <= 17 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY], st.hr);
  const tt = beat.at(st.msCine, 600);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, m, tt);
    const [p1, p2] = rows(b, [1.2, 1], 8);
    const r = inflowCW(ctx, p1, m);
    cursor(ctx, r.bx, beat.sweep);
    drawPSAXmv(ctx, p2, { mva: m.mva, lvid: [m.lvid, m.lvid * 0.64], thick: m.thick }, { t: tt, title: 'PSAX · MV' });
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.62);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m), { row: 32 });
  const [p1, p2, p3] = rows(colR, [1.2, 0.9, 1.05], 10);
  const r = inflowCW(ctx, p1, m);
  const b2 = trCW(ctx, p2, m);
  drawPSAXmv(ctx, p3, { mva: m.mva, lvid: [m.lvid, m.lvid * 0.64], thick: m.thick }, { t: tt, title: `PSAX · PLANIMETRY ${m.mva.toFixed(2)} cm²` });
  cursor(ctx, r.bx, beat.sweep);
  cursor(ctx, b2, beat.sweep);
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function tableRows(m) {
  return [
    ['Valve area (cm²)', ['>2.5', '2.5–1.6', '≤1.5'], m.mva > 2.5 ? 0 : m.mva > 1.5 ? 1 : 2],
    ['Pressure half-time (ms)', ['<100', '100–149', '≥150'], m.pht < 100 ? 0 : m.pht < 150 ? 1 : 2],
    ['Mean gradient (mmHg), HR 60–80', ['<5', '5–9', '≥10'], m.mg < 5 ? 0 : m.mg < 10 ? 1 : 2],
    ['PA systolic pressure (mmHg)', ['<30', '30–49', '≥50'], m.pasp < 30 ? 0 : m.pasp < 50 ? 1 : 2],
  ];
}

export default {
  key: 'ms',
  part: 'valves',
  title: 'Mitral stenosis',
  nav: 'MS',
  dwell: 18,
  defaults: { msS: 0.55, msCine: true },
  format: { msS: (v) => gradeOf(v) },
  watch: ['msS', 'msCine', 'hr'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('ms-grades'), BANDS, LEVEL);
  },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.msCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ msS: 0, msCine: true, hr: 70 }); },
  tourTick(tt, set) {
    if (tt < 12) set({ msS: Math.round(clamp((tt - 1) / 10, 0, 1) * 0.85 * 200) / 200 });
    else set({ hr: Math.round(70 + clamp((tt - 12.5) / 4, 0, 1) * 40) });
  },
  // the time of the tour at which tourTick shows this state: the valve area up to 0.85 before 12 s,
  // then the heart rate from 70 to 110 /min
  tourAt(s) {
    if (s.hr > 70) return 12.5 + Math.min(1, (s.hr - 70) / 40) * 4;
    return s.msS > 0.85 ? 12 : 1 + (s.msS / 0.85) * 10;
  },
  text(s, { cite }) {
    const m = model(s[KEY], s.hr);
    const g = m.grade;
    return {
      readouts: [
        { k: 'Mitral valve area', v: fmt(m.mva, 2), u: 'cm²', flag: m.mva <= 1.5 },
        { k: 'Pressure half-time', v: fmt(m.pht), u: 'ms', flag: m.pht >= 150 },
        { k: 'Mean gradient', v: fmt(m.mg, 1), u: 'mmHg', flag: m.mg >= 10 },
        { k: 'PA systolic pressure', v: fmt(m.pasp), u: 'mmHg', flag: m.pasp >= 50 },
        { k: 'LA volume index', v: fmt(m.lavi), u: 'mL/m²', flag: m.lavi > 34 },
        { k: 'Grade', v: g, text: true, flag: g === 'severe' },
      ],
      live: g === 'none'
        ? `<b>No mitral stenosis.</b> The mitral valve is normal, with an area of ${fmt(m.mva, 1)} cm² and a pressure half-time of ${fmt(m.pht)} ms. The play control animates the progression of rheumatic mitral stenosis.`
        : `<b>${g[0].toUpperCase()}${g.slice(1)} mitral stenosis.</b> The mitral valve area is ${fmt(m.mva, 2)} cm² and the pressure half-time is ${fmt(m.pht)} ms; at a heart rate of ${Math.round(m.hr)} beats per minute, the mean gradient is ${fmt(m.mg, 1)} mmHg${cite('pandian2023')}. The LA volume index increases to ${fmt(m.lavi)} mL/m² and the PA systolic pressure to ${fmt(m.pasp)} mmHg${m.pasp > 50 ? `; the ACC/AHA guideline lists a PA systolic pressure above 50 mmHg as a consequence of severe stenosis${cite('otto2020')}` : ''}.`,
      extra: (art) => gradeTable(art.querySelector('#ms-table'), tableRows(m), 'ASE 2023 grading (Pandian, Table 1)', ['Progressive, mild', 'Progressive, moderate', 'Severe']),
    };
  },
};
