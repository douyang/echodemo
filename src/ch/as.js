// 11 Aortic stenosis: one slider from a normal valve to severe stenosis, then to the late stage
// in which the LV fails, the stroke volume falls and the gradient falls with it. The valve area
// sets the jet by the continuity equation; the LV thickens, then fails. Illustrative values.
import { Sheet, clamp, mix, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { mitralV, RR, EV } from '../cyclemodel.js';
import { asGrade } from '../norms.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit } from '../sev.js';
import { drawPLAX, drawPSAXav, plaxLV, measures } from '../echo2d.js';
import { BSA } from './pressure.js';
import { JETS } from '../jets.js';

const KEY = 'asS';
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
/** Continuity: area and stroke volume give the jet; mean gradient averages 4v² over ejection. */
export function aortic({ ava, sv }) {
  const sev = clamp((1.6 - ava) / 1.0, 0, 1);
  const g = avShape(sev);
  const f1 = mean(g), f2 = mean((u) => g(u) ** 2);
  const vtiL = sv / LVOT_CSA, vtiA = sv / ava;
  const vL = vtiL / (100 * ET * K_LVOT), vmax = vtiA / (100 * ET * f1);
  const mg = 4 * vmax * vmax * f2;
  return { sev, g, vtiL, vtiA, vL, vmax, mg, dvi: vtiL / vtiA, svi: sv / BSA };
}

// the valve area halves before a gradient appears, so the first stretch of the slider is short
const avaOf = mono([[0, 3.5], [0.1, 1.35], [0.22, 1.15], [0.34, 1.0], [0.48, 0.83], [0.62, 0.7], [0.74, 0.63], [0.84, 0.6], [1, 0.58]]);
const TRK = tracks([0, 0.2, 0.42, 0.56, 0.72, 0.84, 1], {
  sv: [72, 72, 72, 72, 72, 60, 44],
  ef: [62, 62, 62, 61, 60, 45, 32],
  wall: [0.9, 0.95, 1.05, 1.2, 1.3, 1.3, 1.25],
  lvidd: [4.8, 4.8, 4.7, 4.6, 4.6, 5.0, 5.6],
  ee: [8, 9, 11, 13, 15, 17, 19],
  lavi: [24, 26, 30, 34, 38, 44, 50],
  E: [0.72, 0.68, 0.72, 0.8, 0.9, 1.0, 1.1],
  A: [0.6, 0.72, 0.75, 0.72, 0.65, 0.5, 0.4],
  calc: [0, 0.3, 0.6, 0.8, 1, 1, 1],
  cusp: [0.1, 0.15, 0.2, 0.25, 0.28, 0.28, 0.28],
});

export function model(s) {
  const m = TRK(s);
  m.s = s;
  m.ava = avaOf(s);
  Object.assign(m, aortic({ ava: m.ava, sv: m.sv }));
  m.avai = m.ava / BSA;
  m.lvids = m.lvidd * Math.sqrt(Math.max(0.2, 1 - m.ef / 100) / 0.38) * 0.625;
  m.ePrime = (m.E * 100) / m.ee;
  const d = m.wall * 2 + m.lvidd;
  m.lvm = 0.8 * 1.04 * (d ** 3 - m.lvidd ** 3) + 0.6;
  m.lvmi = m.lvm / BSA;
  m.rwt = (2 * m.wall) / m.lvidd;
  m.grade = gradeOf(s, m);
  return m;
}
export function gradeOf(s, m = null) {
  if (!m) { const t = TRK(s); m = { ...t, ava: avaOf(s) }; Object.assign(m, aortic({ ava: m.ava, sv: m.sv })); }
  if (m.ava < 1.0 && m.svi < 35 && m.mg < 40 && m.ef < 50) return 'severe, low flow';
  const g = asGrade({ vmax: m.vmax, mean: m.mg, ava: m.ava });
  if ((g === 'severe' || g === 'very severe') && m.ef < 50) return 'severe, LV dysfunction';
  return g;
}
const LEV = { ...LEVEL, 'severe, LV dysfunction': 4, 'severe, low flow': 5 };
// the bold lead of the caption for each grade
const LEAD = { none: 'No aortic stenosis', 'severe (area only)': 'Severe stenosis by valve area only', 'severe, LV dysfunction': 'Severe aortic stenosis with LV dysfunction', 'severe, low flow': 'Classical low-flow, low-gradient aortic stenosis' };
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;

function plax(ctx, box, m, t) {
  const sysW = m.wall * (1 + 0.9 * (m.ef / 100 - 0.15));
  const g = {
    ivs: [m.wall, sysW], pw: [m.wall, sysW], lvid: [m.lvidd, m.lvids], rvd: 2.6, la: [3.1 + 0.02 * (m.lavi - 24), 3.6 + 0.025 * (m.lavi - 24)],
    root: 3.1, lvot: LVOT_D, av: { thick: m.cusp, open: Math.min(1.9, 2 * Math.sqrt(m.ava / Math.PI) * 0.9), calc: m.calc },
  };
  // the jet follows the CW trace through ejection; the outflow tract carries the LVOT velocity
  const a = m.g((t - EV.avo) / (ET * 1000));
  const title = fit(box.w, 'PARASTERNAL LONG AXIS · COLOR 60 cm/s', 'PLAX · COLOR 60');
  const after = (c, F, geo) => {
    plaxLV(c, geo);
    measures(c, F, [`IVS ${m.wall.toFixed(1)} cm`, `LVIDd ${m.lvidd.toFixed(1)} cm`, `PW ${m.wall.toFixed(1)} cm`]);
  };
  if (JETS === 'plume') {
    const jets = m.vmax > 2.2 ? { as: { q: m.sv / ET, va: 60, vc: Math.sqrt(m.ava), jl: 2 + m.vmax * 0.6, jw: 1.4 + m.vmax * 0.18, a } } : {};
    drawPLAX(ctx, box, g, { t, title, jets, after });
    return;
  }
  drawPLAX(ctx, box, g, {
    t, title,
    color: {
      roi: 'aorta', lo: -60, hi: 60, variance: true, lvot: m.vL,
      as: m.vmax > 2.2 ? { q: m.ava * m.vmax * 100, u0: m.vmax * 100, vc: 2 * Math.sqrt(m.ava / Math.PI), jl: 2 + m.vmax * 0.6, jw: 1.4 + m.vmax * 0.18, a } : null,
    },
    after,
  });
}

function avCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'CW · AORTIC VALVE');
  const bx = inner(P);
  const vmax = q2(m.vmax), sev = q2(m.sev);
  const g = avShape(sev);
  const vs = Math.max(4, Math.ceil(vmax + 0.6));
  spectral(ctx, bx, { fn: (u) => { const t = (u * 2 * RR) % RR; return -vmax * g((t - EV.avo) / (ET * 1000)); }, scale: vs, base: 0.07, mode: 'cw', broad: 0.45, key: `ascw|${vmax}|${sev}|${vs}`, seed: 3 });
  vscale(ctx, bx, vs, 0.07, 1);
  // peak marker
  let best = 0, bu = 0;
  for (let i = 0; i < 200; i++) { const u = i / 200; if (g(u) > best) { best = g(u); bu = u; } }
  const k = (bx.h * 0.93) / vs, yb = bx.y + bx.h * 0.07;
  const xpk = bx.x + ((EV.avo + bu * ET * 1000) / (2 * RR)) * bx.w;
  caliper(ctx, xpk - 12, yb + vmax * k, xpk + 12, yb + vmax * k, { solid: true });
  note(ctx, bx, [`Vmax ${m.vmax.toFixed(1)} m/s · mean ${Math.round(m.mg)} mmHg · peak at ${Math.round(bu * 100)}% of ejection`, `${m.vmax.toFixed(1)} m/s · ${Math.round(m.mg)} mmHg`], 'bottom');
  return bx;
}

function lvotPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · LVOT');
  const bx = inner(P);
  const vL = q2(m.vL);
  spectral(ctx, bx, { fn: (u) => { const t = (u * 2 * RR) % RR; return -vL * lvotShape((t - EV.avo) / (ET * 1000)); }, scale: 1.5, base: 0.12, mode: 'pw', broad: 0.08, key: `aslvot|${vL}`, seed: 2 });
  vscale(ctx, bx, 1.5, 0.12, 0.5);
  note(ctx, bx, [`VTI ${m.vtiL.toFixed(0)} cm · velocity ratio ${m.dvi.toFixed(2)} · SVi ${Math.round(m.svi)} mL/m²`, `ratio ${m.dvi.toFixed(2)}`], 'bottom');
  return bx;
}

function inflowPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · MITRAL INFLOW');
  const bx = inner(P);
  const E = q2(m.E), A = q2(m.A);
  spectral(ctx, bx, { fn: (u) => mitralV((u * 2 * RR) % RR, E, A, 200), scale: 1.4, base: 0.92, mode: 'pw', broad: 0.1, key: `asin|${E}|${A}`, seed: 22 });
  vscale(ctx, bx, 1.4, 0.92, 0.5);
  note(ctx, bx, [`E/A ${(m.E / m.A).toFixed(1)} · e′ ${m.ePrime.toFixed(1)} cm/s · E/e′ ${m.ee.toFixed(0)}`, `E/A ${(m.E / m.A).toFixed(1)} · E/e′ ${m.ee.toFixed(0)}`], 'top');
  return bx;
}

function meterItems(m) {
  return [
    { k: 'Aortic valve area', v: m.ava, u: 'cm²', d: 2, lo: 0.4, hi: 3.6, cuts: [[1.0, '1.0'], [1.5, '1.5']], bad: m.ava < 1.0 },
    { k: 'Peak velocity', v: m.vmax, u: 'm/s', d: 1, lo: 1, hi: 6, cuts: [[2.6, '2.6'], [3, '3'], [4, '4'], [5, '5']], bad: m.vmax >= 4 },
    { k: 'Mean gradient', v: m.mg, u: 'mmHg', lo: 0, hi: 80, cuts: [[20, '20'], [40, '40'], [60, '60']], bad: m.mg >= 40 },
    { k: 'Velocity ratio', v: m.dvi, u: '', d: 2, lo: 0, hi: 1, cuts: [[0.25, '0.25'], [0.5, '0.50']], bad: m.dvi < 0.25 },
    { k: 'Stroke volume index', v: m.svi, u: 'mL/m²', lo: 15, hi: 50, norm: [35, 50], cuts: [[35, '35']], bad: m.svi < 35 },
    { k: 'LVEF', v: m.ef, u: '%', lo: 20, hi: 75, norm: [52, 72], cuts: [[50, '50']], bad: m.ef < 50 },
    { k: 'Septal thickness', v: m.wall, u: 'cm', d: 1, lo: 0.6, hi: 1.7, norm: [0.6, 1.0], cuts: [[1.0, '1.0']], bad: m.wall > 1.0 },
    { k: 'LV mass index', v: m.lvmi, u: 'g/m²', lo: 50, hi: 180, norm: [49, 115], cuts: [[115, '115']], bad: m.lvmi > 115 },
    { k: 'Average E/e′', v: m.ee, u: '', lo: 4, hi: 22, cuts: [[14, '14']], bad: m.ee >= 14 },
    { k: 'LA volume index', v: m.lavi, u: 'mL/m²', lo: 10, hi: 70, norm: [16, 34], cuts: [[34, '34']], bad: m.lavi > 34 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const tt = beat.at(st.asCine, 220);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    plax(ctx, a, m, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [avCW(ctx, p1, m), lvotPW(ctx, p2, m)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  plax(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m));
  const [p1, p2, p3] = rows(colR, [1.15, 0.85, 1.05], 10);
  const bxs = [avCW(ctx, p1, m), lvotPW(ctx, p2, m)];
  const [c1, c2] = cols(p3, [0.8, 1.2], 10);
  drawPSAXav(ctx, c1, { ava: m.ava, thick: m.cusp, calc: m.calc, root: 3.1 }, { t: tt, title: `PSAX · AVA ${m.ava.toFixed(2)} cm²` });
  bxs.push(inflowPW(ctx, c2, m));
  for (const bx of bxs) cursor(ctx, bx, beat.sweep);
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function tableRows(m) {
  return [
    ['Peak velocity (m/s)', ['≤2.5', '2.6–2.9', '3.0–4.0', '≥4.0'], m.vmax <= 2.5 ? 0 : m.vmax < 3 ? 1 : m.vmax < 4 ? 2 : 3],
    ['Mean gradient (mmHg)', ['–', '<20', '20–40', '≥40'], m.vmax <= 2.5 ? 0 : m.mg < 20 ? 1 : m.mg < 40 ? 2 : 3],
    ['AVA (cm²)', ['–', '>1.5', '1.0–1.5', '<1.0'], m.vmax <= 2.5 ? 0 : m.ava > 1.5 ? 1 : m.ava >= 1.0 ? 2 : 3],
    ['Indexed AVA (cm²/m²)', ['–', '>0.85', '0.60–0.85', '<0.6'], m.vmax <= 2.5 ? 0 : m.avai > 0.85 ? 1 : m.avai >= 0.6 ? 2 : 3],
    ['Velocity ratio', ['–', '>0.50', '0.25–0.50', '<0.25'], m.vmax <= 2.5 ? 0 : m.dvi > 0.5 ? 1 : m.dvi >= 0.25 ? 2 : 3],
  ];
}

export default {
  key: 'as',
  part: 'valves',
  title: 'Aortic stenosis',
  nav: 'AS',
  dwell: 18,
  defaults: { asS: 0.62, asCine: true },
  format: { asS: (v) => gradeOf(v) },
  watch: ['asS', 'asCine'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('as-grades'), BANDS, LEV, { 'severe (area only)': 'area', 'very severe': 'v. severe', 'severe, LV dysfunction': 'EF <50', 'severe, low flow': 'low flow' });
  },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.asCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ asS: 0, asCine: true }); },
  tourTick(tt, set) { set({ asS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.asS * 15; },
  text(s, { cite }) {
    const m = model(s[KEY]);
    const g = m.grade;
    const sevr = /severe/.test(g);
    let why = '';
    if (g === 'severe (area only)') why = ` <span class="k-red">The valve area meets the criterion for severe stenosis; the peak velocity and the mean gradient do not.</span> At normal flow, a mean gradient of 40 mmHg corresponds to an area nearer 0.8 than 1.0 cm²${cite('baumgartner2017')}.`;
    else if (g === 'severe, low flow') why = ` <span class="k-red">The failing LV has an LVEF of ${fmt(m.ef)}% and a stroke volume index of ${fmt(m.svi)} mL/m². The transvalvular gradient falls although the valve area is smaller.</span> These findings define classical low-flow, low-gradient stenosis; low-dose dobutamine echocardiography distinguishes true severe stenosis from pseudo-severe stenosis${cite('baumgartner2017')}.`;
    else if (sevr) why = ` The LV wall thickens in response to the pressure load (septum ${fmt(m.wall, 1)} cm, LV mass index ${fmt(m.lvmi)} g/m²); the average E/e′ is ${fmt(m.ee)}${cite('otto2020')}.`;
    return {
      readouts: [
        { k: 'AVA (continuity)', v: fmt(m.ava, 2), u: 'cm²', flag: m.ava < 1 },
        { k: 'Peak velocity', v: fmt(m.vmax, 1), u: 'm/s', flag: m.vmax >= 4 },
        { k: 'Mean gradient', v: fmt(m.mg), u: 'mmHg', flag: m.mg >= 40 },
        { k: 'Stroke volume index', v: fmt(m.svi), u: 'mL/m²', flag: m.svi < 35 },
        { k: 'LVEF', v: fmt(m.ef), u: '%', flag: m.ef < 50 },
        { k: 'Grade', v: g, text: true, flag: sevr },
      ],
      live: `<b>${LEAD[g] || `${g[0].toUpperCase()}${g.slice(1)} aortic stenosis`}.</b> The aortic valve area by the continuity equation is ${fmt(m.ava, 2)} cm², the peak velocity is ${fmt(m.vmax, 1)} m/s and the mean gradient is ${fmt(m.mg)} mmHg${cite('baumgartner2017')}.${why}`,
      extra: (art) => gradeTable(art.querySelector('#as-table'), tableRows(m), 'Baumgartner 2017 grading (Table 3)', ['Sclerosis', 'Mild', 'Moderate', 'Severe']),
    };
  },
};
