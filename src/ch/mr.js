// 14 Mitral regurgitation: one slider from no leak to severe primary MR with LV dysfunction.
// The orifice drives the numbers (PISA, volume, fraction); the chambers, the pulmonary veins and
// the mitral inflow follow. Values are illustrative, set inside the ASE 2017 bands.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { mitralV, RR, EV } from '../cyclemodel.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit } from '../sev.js';
import { drawA4C, cal, measures } from '../echo2d.js';
import { BSA } from './pressure.js';

const KEY = 'mrS';
const VMAX = 5.0;        // m/s, MR jet (LV-LA gradient about 100 mmHg)
const VTI = 150;         // cm, MR jet
const FWD = 60;          // mL, forward stroke volume
const VA = 30;           // cm/s, aliasing velocity for PISA (baseline shifted)

const eroaOf = mono([[0, 0], [0.06, 0.03], [0.3, 0.2], [0.4, 0.3], [0.5, 0.4], [0.78, 0.55], [1, 0.65]]);
const TR = tracks([0, 0.3, 0.5, 0.78, 1], {
  lvedd: [4.8, 5.1, 5.6, 6.2, 6.6],
  lvesd: [3.0, 3.2, 3.5, 3.95, 4.45],
  ef: [62, 64, 64, 61, 54],
  lavi: [24, 30, 40, 55, 68],
  E: [0.72, 0.85, 1.05, 1.3, 1.45],
  A: [0.62, 0.6, 0.55, 0.5, 0.45],
  pvS: [0.55, 0.45, 0.2, -0.2, -0.35],
  pvD: [0.4, 0.45, 0.55, 0.7, 0.8],
  trv: [2.3, 2.4, 2.6, 2.95, 3.3],
  jetF: [0, 0.15, 0.3, 0.5, 0.6],
  gap: [0, 0.04, 0.12, 0.3, 0.4],
  lvL: [8.4, 8.6, 9.0, 9.6, 10.0],
  ma: [3.1, 3.2, 3.4, 3.7, 3.9],
  tri: [0, 0, 0.2, 0.8, 1],
});

export function model(s) {
  const m = TR(s);
  m.s = s;
  m.eroa = eroaOf(s);
  m.rvol = m.eroa * VTI;
  m.rf = (m.rvol / (m.rvol + FWD)) * 100;
  m.vc = 2 * Math.sqrt(m.eroa / Math.PI);
  m.q = m.eroa * VMAX * 100;                        // mL/s peak flow
  m.r = m.q > 0 ? Math.sqrt(m.q / (2 * Math.PI * VA)) : 0;
  m.sv = FWD + m.rvol;
  m.edv = m.sv / (m.ef / 100);
  m.edvi = m.edv / BSA;
  m.sd = m.pvS / m.pvD;
  m.grade = gradeOf(s, m);
  return m;
}

export function gradeOf(s, m = null) {
  const eroa = m ? m.eroa : eroaOf(s);
  if (eroa <= 0.001) return 'none';
  if (eroa < 0.2) return 'mild';
  if (eroa < 0.4) return 'moderate';
  const t = m || TR(s);
  return t.ef <= 60 || t.lvesd >= 4.0 ? 'severe, LV dysfunction' : 'severe';
}
const LEV = { ...LEVEL, 'severe, LV dysfunction': 4 };
let BANDS = [];

// ---------------------------------------------------------------- figure
let sheet = null, st = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;

/** LA size (cm) from its volume: area-length with width = r x length. */
function laDims(vol, r) {
  const L = Math.cbrt(vol / (0.524 * r * r));
  return [r * L, L];
}

function a4c(ctx, box, m, t) {
  const laMax = m.lavi * BSA, laMin = laMax * 0.55;
  const [wMax, lMax] = laDims(laMax, 0.8 + 0.1 * m.s), [wMin, lMin] = laDims(laMin, 0.8 + 0.1 * m.s);
  const wall = 0.9 - 0.08 * m.s;
  const g = {
    lvL: [m.lvL, m.lvL - 1.15], lvW: [m.lvedd, m.lvesd], lvWall: [wall, wall * (1 + 0.9 * (m.ef / 100 - 0.2))], ivs: [wall, wall * 1.35],
    rvW: [3.4 + 0.3 * m.s, 2.8 + 0.3 * m.s], laW: [wMin, wMax], laL: [lMin, lMax], raW: [3.2, 3.8], raL: [3.9, 4.5],
    ma: m.ma, ta: 3.0, mv: { gap: m.gap, thick: 0.13 },
  };
  const sys = t >= EV.mvc && t <= EV.mvo;
  const a = sys ? Math.pow(Math.sin(Math.PI * (t - EV.mvc) / (EV.mvo - EV.mvc)), 0.35) : 0;
  const laArea = (Math.PI / 4) * wMax * lMax;
  const jA = m.jetF * laArea;
  const jl = Math.min(lMax * 0.92, Math.sqrt(jA / 0.55 * 1.3));
  const jw = jl > 0 ? Math.min(wMax * 0.9, jA / (0.55 * jl)) : 0;
  const jets = m.eroa > 0.005 ? { mr: { q: m.q, va: VA, vc: m.vc, jl, jw, a } } : {};
  drawA4C(ctx, box, g, {
    t, depth: 16 + 1.2 * m.s, jets,
    title: fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${VA} cm/s`, `A4C · COLOR ${VA}`),
    after: (c, F, geo) => {
      if (m.eroa > 0.005 && a > 0.5) {
        const O = geo.mv.gapMid;
        cal(c, F, O, [O[0] + geo.ax[0] * m.r, O[1] + geo.ax[1] * m.r], '', { solid: true });
      }
      measures(c, F, [`PISA r ${m.r.toFixed(2)} cm`, `VC ${m.vc.toFixed(2)} cm`, `jet ${Math.round(m.jetF * 100)}% of LA`]);
    },
  });
}

/** MR jet, CW: holosystolic; triangular and early peaking as the LA pressure rises. */
function mrCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · MITRAL REGURGITATION', 'CW · MR'));
  const bx = inner(P);
  const tri = q2(m.tri), dens = q2(clamp(m.rvol / 60, 0.06, 1));
  const shape = (u) => {
    if (u <= 0 || u >= 1) return 0;
    const round = Math.pow(Math.sin(Math.PI * u), 0.4);
    const pk = 0.32;
    const tr = u < pk ? Math.pow(u / pk, 0.45) : Math.pow((1 - u) / (1 - pk), 0.9);
    return round * (1 - tri) + tr * tri;
  };
  const fn = (u) => {
    const tt = (u * 2 * RR) % RR;
    const w = (tt - EV.mvc) / (EV.mvo - EV.mvc);
    return m.eroa > 0.005 ? -VMAX * shape(w) : 0;
  };
  spectral(ctx, bx, { fn, scale: 6, base: 0.06, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `mrcw|${q2(m.eroa)}|${tri}`, seed: 12 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, 6, 0.06, 2);
  const dn = m.rvol >= 60 ? 'dense' : m.rvol >= 30 ? 'dense, partial' : 'faint';
  note(ctx, bx, m.eroa > 0.005 ? fit(P.w, `peak ${VMAX.toFixed(1)} m/s · ${dn}${m.tri > 0.5 ? ', triangular' : ''}`, dn) : 'no regurgitation', 'bottom');
  return bx;
}

/** Pulmonary vein, PW: S and D toward the probe, atrial reversal Ar below the baseline. */
function pvPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RIGHT UPPER PULMONARY VEIN', 'PW · PULM. VEIN'));
  const bx = inner(P);
  const S = q2(m.pvS), D = q2(m.pvD), Ar = -0.25;
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
  };
  spectral(ctx, bx, { fn, scale: 1.0, base: 0.6, mode: 'pw', broad: 0.12, key: `mrpv|${S}|${D}`, seed: 21 });
  vscale(ctx, bx, 1.0, 0.6, 0.5, '');
  const y0 = bx.y + 0.6 * bx.h, k = (bx.h * 0.6) / 1.0;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  ctx.fillText('S', X(250), S >= 0 ? y0 - S * k - 5 : y0 - S * k + 13);
  ctx.fillText('D', X(540), y0 - D * k - 5);
  ctx.fillText('Ar', X(835), y0 - Ar * k + 13);
  ctx.restore();
  note(ctx, bx, S < -0.02 ? fit(P.w, 'systolic flow reversal', 'S reversed') : S < 0.05 ? fit(P.w, 'no systolic flow', 'no S') : fit(P.w, `S/D ${m.sd.toFixed(1)}${m.sd < 1 ? ' · systolic blunting' : ''}`, `S/D ${m.sd.toFixed(1)}`), 'top');
  return bx;
}

function inflowPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · MITRAL INFLOW');
  const bx = inner(P);
  const E = q2(m.E), A = q2(m.A);
  spectral(ctx, bx, { fn: (u) => mitralV((u * 2 * RR) % RR, E, A, 190 - 30 * m.s), scale: 1.8, base: 0.92, mode: 'pw', broad: 0.1, key: `mrin|${E}|${A}|${q2(m.s)}`, seed: 22 });
  vscale(ctx, bx, 1.8, 0.92, 0.5);
  note(ctx, bx, `E ${m.E.toFixed(2)} · A ${m.A.toFixed(2)} m/s${m.E >= 1.2 ? ' · E-wave dominant' : m.E < m.A ? ' · A-wave dominant' : ''}`, 'top');
  return bx;
}

function meterItems(m) {
  return [
    { k: 'EROA', v: m.eroa, u: 'cm²', d: 2, lo: 0, hi: 0.7, cuts: [[0.2, '0.20'], [0.4, '0.40']], bad: m.eroa >= 0.4 },
    { k: 'Regurgitant volume', v: m.rvol, u: 'mL', lo: 0, hi: 110, cuts: [[30, '30'], [60, '60']], bad: m.rvol >= 60 },
    { k: 'Regurgitant fraction', v: m.rf, u: '%', lo: 0, hi: 70, cuts: [[30, '30'], [50, '50']], bad: m.rf >= 50 },
    { k: 'Vena contracta', v: m.vc, u: 'cm', d: 2, lo: 0, hi: 1.0, cuts: [[0.3, '0.3'], [0.7, '0.7']], bad: m.vc >= 0.7 },
    { k: `PISA radius (${VA} cm/s)`, v: m.r, u: 'cm', d: 2, lo: 0, hi: 1.4, cuts: [[0.3, '0.3'], [1.0, '1.0']], bad: m.r >= 1.0 },
    { k: 'LV end-systolic diameter', v: m.lvesd, u: 'cm', d: 1, lo: 2, hi: 5, norm: [2.5, 4.0], cuts: [[4.0, '4.0']], bad: m.lvesd >= 4.0 },
    { k: 'LVEF', v: m.ef, u: '%', lo: 30, hi: 75, norm: [52, 72], cuts: [[60, '60']], bad: m.ef <= 60 && m.eroa >= 0.4 },
    { k: 'LA volume index', v: m.lavi, u: 'mL/m²', lo: 10, hi: 80, norm: [16, 34], cuts: [[34, '34']], bad: m.lavi > 34 },
    { k: 'Mitral E', v: m.E, u: 'm/s', d: 2, lo: 0.3, hi: 1.8, cuts: [[1.2, '1.2']], bad: m.E >= 1.2 },
    { k: 'TR velocity', v: m.trv, u: 'm/s', d: 1, lo: 1.5, hi: 4, norm: [1.5, 2.8], cuts: [[2.8, '2.8']], bad: m.trv > 2.8 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const tt = beat.at(st.mrCine, 220);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, m, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    const b1 = mrCW(ctx, p1, m), b2 = pvPW(ctx, p2, m);
    for (const bx of [b1, b2]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m));
  const [p1, p2, p3] = rows(colR, [1.1, 1, 1], 10);
  const bxs = [mrCW(ctx, p1, m), pvPW(ctx, p2, m), inflowPW(ctx, p3, m)];
  for (const bx of bxs) cursor(ctx, bx, beat.sweep);
}

// ---------------------------------------------------------------- text
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function tableRows(m) {
  const size = m.lavi <= 34 && m.lvedd <= 5.8 ? 0 : m.lavi <= 42 && m.lvedd <= 6.0 ? 1 : 2;
  const jet = m.jetF < 0.2 ? 0 : m.jetF < 0.5 ? 1 : 2;
  const conv = m.r < 0.3 ? 0 : m.r < 1.0 ? 1 : 2;
  const cw = m.rvol < 30 ? 0 : m.rvol < 60 ? 1 : 2;
  const vc = m.vc < 0.3 ? 0 : m.vc < 0.7 ? 1 : 2;
  const pv = m.pvS < 0.05 ? 2 : m.sd < 1 ? 1 : 0;
  const inflow = m.E >= 1.2 ? 2 : m.E < m.A ? 0 : 1;
  const q = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
  return [
    ['LV and LA size', ['Usually normal', 'Normal or mildly dilated', 'Dilated'], size],
    ['Color jet area', ['Small, central, narrow', 'Variable', '>50% of LA, or eccentric wall-impinging'], jet],
    ['Flow convergence', ['Not visible, transient or small', 'Intermediate', 'Large throughout systole'], conv],
    ['CW jet', ['Faint, partial or parabolic', 'Dense but partial or parabolic', 'Holosystolic, dense, triangular'], cw],
    ['Vena contracta (cm)', ['<0.3', 'Intermediate', '≥0.7'], vc],
    ['Pulmonary vein flow', ['Systolic dominance', 'Normal or systolic blunting', 'Minimal or no systolic flow, or reversal'], pv],
    ['Mitral inflow', ['A-wave dominant', 'Variable', 'E-wave dominant (>1.2 m/s)'], inflow],
    ['EROA (cm²)', ['<0.20', '0.20–0.39', '≥0.40'], q(m.eroa, 0.2, 0.4)],
    ['Regurgitant volume (mL)', ['<30', '30–59', '≥60'], q(m.rvol, 30, 60)],
    ['Regurgitant fraction (%)', ['<30', '30–49', '≥50'], q(m.rf, 30, 50)],
  ];
}
export default {
  key: 'mr',
  part: 'valves',
  title: 'Mitral regurgitation',
  nav: 'MR',
  dwell: 18,
  defaults: { mrS: 0.45, mrCine: true },
  format: { mrS: (v) => gradeOf(v) },
  watch: ['mrS', 'mrCine'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('mr-grades'), BANDS, LEV, { 'severe, LV dysfunction': 'LV dysf.' });
  },
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.mrCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ mrS: 0, mrCine: true }); },
  tourTick(tt, set) { set({ mrS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  text(s, { cite }) {
    const m = model(s[KEY]);
    const g = m.grade;
    const sev = g.startsWith('severe');
    const stage = !sev ? '' : g === 'severe' ? ` LVEF ${fmt(m.ef)}% and LV end-systolic diameter ${fmt(m.lvesd, 1)} cm: ACC/AHA stage C1 when there are no symptoms${cite('otto2020')}.` : ` <span class="k-red">LVEF ${fmt(m.ef)}% or LV end-systolic diameter ${fmt(m.lvesd, 1)} cm crosses the ACC/AHA stage C2 limits (LVEF ≤60%, diameter ≥4.0 cm)</span>${cite('otto2020')}.`;
    const pv = m.pvS < -0.02 ? 'systolic flow in the pulmonary veins reverses' : m.pvS < 0.05 ? 'systolic flow in the pulmonary veins stops' : m.sd < 1 ? 'pulmonary vein systolic flow is blunted' : 'pulmonary vein flow stays systolic-dominant';
    return {
      readouts: [
        { k: 'EROA', v: fmt(m.eroa, 2), u: 'cm²', flag: m.eroa >= 0.4 },
        { k: 'Regurgitant volume', v: fmt(m.rvol), u: 'mL', flag: m.rvol >= 60 },
        { k: 'Regurgitant fraction', v: fmt(m.rf), u: '%', flag: m.rf >= 50 },
        { k: 'LVESD', v: fmt(m.lvesd, 1), u: 'cm', flag: m.lvesd >= 4.0 },
        { k: 'LVEF', v: fmt(m.ef), u: '%', flag: sev && m.ef <= 60 },
        { k: 'Grade', v: g, text: true, flag: sev },
      ],
      live: m.eroa <= 0.001
        ? `No regurgitation. Press play to follow a leak from mild to severe.`
        : `<b>${g[0].toUpperCase()}${g.slice(1)} mitral regurgitation.</b> EROA ${fmt(m.eroa, 2)} cm², regurgitant volume ${fmt(m.rvol)} mL, regurgitant fraction ${fmt(m.rf)}%${cite('zoghbi2017')}. LA volume index ${fmt(m.lavi)} mL/m², mitral E ${fmt(m.E, 2)} m/s; ${pv}.${stage}`,
      extra: (art) => gradeTable(art.querySelector('#mr-table'), tableRows(m), 'ASE 2017 grading (Table 8, condensed)'),
    };
  },
};
