// 15 Tricuspid regurgitation: one slider from no leak to torrential TR. The orifice area rises
// in step with the slider; the orifice turns elliptical as the annulus dilates, so the vena
// contracta grows faster than a round orifice would give. The right heart and the veins follow.
// Grades: ASE 2017 to severe; EACVI 2022 Table 16 for massive and torrential.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit, waveLetter } from '../sev.js';
import { drawA4C, drawIVC, drawPSAXpm, cal, measures } from '../echo2d.js';
import { rapFromIvc } from '../norms.js';
import { BSA } from './pressure.js';
import { JETS } from '../jets.js';

const KEY = 'trS';
const VA = 28;             // cm/s, aliasing velocity for PISA (ASE 2017); the plume format draws the view at it
const NYQ = 60;            // cm/s, the scanner format's scale for the jet (ASE 2017: 50-70)

const aspectOf = mono([[0, 1], [0.4, 1], [0.6, 2.57], [0.8, 4.33], [1, 5.5]]);
const vtiOf = mono([[0, 115], [0.4, 113], [0.6, 100], [0.8, 94], [1, 92]]);
const TRK = tracks([0, 0.2, 0.4, 0.6, 0.8, 1], {
  v: [2.3, 2.45, 2.6, 2.1, 1.85, 1.7],
  ivc: [1.6, 1.8, 2.3, 2.6, 2.9, 3.1],
  coll: [0.6, 0.55, 0.35, 0.2, 0.1, 0.05],
  hvS: [-0.45, -0.4, -0.15, 0.12, 0.35, 0.45],
  hvD: [-0.3, -0.35, -0.45, -0.5, -0.55, -0.55],
  E: [0.5, 0.7, 1.05, 1.15, 1.25, 1.3],
  rvb: [3.5, 3.7, 4.3, 4.8, 5.2, 5.5],
  ravi: [24, 30, 38, 48, 58, 66],
  ta: [3.0, 3.4, 4.0, 4.4, 4.8, 5.1],
  tapse: [23, 24, 23, 21, 18, 15],
  ei: [1.0, 1.05, 1.15, 1.3, 1.45, 1.55],
  gap: [0, 0.1, 0.3, 0.6, 0.9, 1.1],
  jetA: [0, 5, 11, 16, 22, 26],
  rvL: [7.0, 7.1, 7.4, 7.8, 8.1, 8.4],
});

export function model(s) {
  const m = TRK(s);
  m.s = s;
  m.eroa = s;                                        // cm², one to one with the slider
  const k = aspectOf(s);
  m.vc = 2 * Math.sqrt((k * m.eroa) / Math.PI);
  m.rvol = m.eroa * vtiOf(s);
  m.q = m.eroa * m.v * 100;                          // mL/s peak flow
  m.r = m.q > 0 ? Math.sqrt(m.q / (2 * Math.PI * VA)) : 0;
  m.collapses = m.coll > 0.5;
  m.rap = rapFromIvc(m.ivc, m.collapses);
  m.rvsp = 4 * m.v * m.v + m.rap;
  m.grade = gradeOf(s);
  return m;
}
export function gradeOf(s) {
  if (s <= 0.001) return 'none';
  if (s < 0.2) return 'mild';
  if (s < 0.4) return 'moderate';
  if (s < 0.6) return 'severe';
  if (s < 0.8) return 'massive';
  return 'torrential';
}
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;

function a4c(ctx, box, m, t, mode) {
  const raMax = m.ravi * BSA, raMin = raMax * 0.6;
  const dims = (vol, r) => { const L = Math.cbrt(vol / (0.524 * r * r)); return [r * L, L]; };
  const [rwMax, rlMax] = dims(raMax, 0.85 + 0.1 * m.s), [rwMin, rlMin] = dims(raMin, 0.85 + 0.1 * m.s);
  const g = {
    lvL: [8.4, 7.2], lvW: [4.6 - 0.3 * m.s, 3.0 - 0.2 * m.s], lvWall: [0.9, 1.3], ivs: [0.9, 1.25],
    rvW: [m.rvb, m.rvb * (0.85 + 0.08 * m.s)], rvWall: 0.4, laW: [3.3, 4.0], laL: [4.1, 4.9], raW: [rwMin, rwMax], raL: [rlMin, rlMax],
    ma: 3.1, ta: m.ta, tv: { gap: m.gap, thick: 0.1 },
  };
  const sys = t >= EV.mvc && t <= EV.mvo + 10;
  // the sine at the closing instant can round below zero, and a fractional power of that is NaN
  const a = sys ? Math.pow(Math.max(0, Math.sin(Math.PI * (t - EV.mvc) / (EV.mvo + 10 - EV.mvc))), 0.3) : 0;
  const raArea = (Math.PI / 4) * rwMax * rlMax;
  const jA = Math.min(m.jetA, raArea * 0.8);
  const jl = Math.min(rlMax * 0.95, Math.sqrt((jA / 0.55) * 1.2));
  const jw = jl > 0 ? Math.min(rwMax * 0.95, jA / (0.55 * jl)) : 0;
  if (JETS === 'plume') {
    // one view at the aliasing velocity: the flow convergence with its radius, and the jet
    drawA4C(ctx, box, g, {
      t, depth: 16 + 1.4 * m.s, title: fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${VA} cm/s`, `A4C · COLOR ${VA}`),
      jets: m.eroa > 0.005 ? { tr: { q: m.q, va: VA, vc: m.vc, jl, jw, a } } : {},
      after: (c, F, geo) => {
        if (m.eroa > 0.005 && a > 0.5) {
          // from the orifice into the RV, toward its apex
          const O = geo.tv.gapMid, ax = [geo.Ra[0] - O[0], geo.Ra[1] - O[1]], l = Math.hypot(ax[0], ax[1]) || 1;
          cal(c, F, O, [O[0] + (ax[0] / l) * m.r, O[1] + (ax[1] / l) * m.r], '', { solid: true });
        }
        measures(c, F, [`RV base ${m.rvb.toFixed(1)} cm`, [`annulus ${m.ta.toFixed(1)} cm`, `TA ${m.ta.toFixed(1)} cm`], `VC ${m.vc.toFixed(2)} cm`]);
      },
    });
    return;
  }
  // Jet: the standard scale. PISA: zoomed on the valve, the baseline shifted toward the jet
  // (down: TR runs away from the probe) until the flow aliases at VA; variance off. The
  // torrential jet is slow and laminar.
  const pisa = mode === 'pisa';
  drawA4C(ctx, box, g, {
    t, depth: 16 + 1.4 * m.s,
    title: pisa ? fit(box.w, `APICAL FOUR-CHAMBER · ZOOM · Va ${VA} cm/s`, `A4C ZOOM · Va ${VA}`) : fit(box.w, `APICAL FOUR-CHAMBER · COLOR ${NYQ} cm/s`, `A4C · COLOR ${NYQ}`),
    color: {
      roi: pisa ? 'tv' : 'ra', zoom: pisa ? { at: 'tv', span: 7 } : null,
      lo: pisa ? -VA : -NYQ, hi: pisa ? 2 * NYQ - VA : NYQ, variance: !pisa,
      Et: m.E, At: 0.4, hvS: m.hvS, hvD: m.hvD,
      tr: m.eroa > 0.005 ? { q: m.q, u0: m.v * 100, vc: m.vc, jl, jw, area: jA, a, lam: m.s > 0.7 ? 1 : 0 } : null,
    },
    after: (c, F, geo) => {
      if (pisa && m.eroa > 0.005 && a > 0.85) {
        // the radius along the beam, from the orifice to the first aliasing boundary
        const O = geo.tv.gapMid, l = Math.hypot(O[0], O[1]), r = m.r * Math.sqrt(a);
        cal(c, F, O, [O[0] * (1 - r / l), O[1] * (1 - r / l)], '', { solid: true });
      }
      measures(c, F, pisa
        ? [`PISA r ${m.r.toFixed(2)} cm`, `Va ${VA} cm/s`, [`EROA ${m.eroa.toFixed(2)} cm²`, `EROA ${m.eroa.toFixed(2)}`]]
        : [`RV base ${m.rvb.toFixed(1)} cm`, [`annulus ${m.ta.toFixed(1)} cm`, `TA ${m.ta.toFixed(1)} cm`], `VC ${m.vc.toFixed(2)} cm`]);
    },
  });
}

/** TR jet, CW: dense and early peaking as RA pressure rises; velocity falls when torrential. */
function trCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · TRICUSPID REGURGITATION', 'CW · TR'));
  const bx = inner(P);
  const v = q2(m.v), tri = q2(clamp((m.s - 0.35) / 0.4, 0, 1)), dens = q2(clamp(m.rvol / 45, 0.06, 1));
  const shape = (u) => {
    if (u <= 0 || u >= 1) return 0;
    const round = Math.pow(Math.sin(Math.PI * u), 0.45);
    const pk = 0.3;
    const tr = u < pk ? Math.pow(u / pk, 0.5) : Math.pow((1 - u) / (1 - pk), 1.1);
    return round * (1 - tri) + tr * tri;
  };
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    const w = (t - EV.mvc) / (EV.mvo + 10 - EV.mvc);
    return m.eroa > 0.005 ? -v * shape(w) : 0;
  };
  spectral(ctx, bx, { fn, scale: 3.5, base: 0.06, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `trcw|${v}|${tri}|${dens}`, seed: 41 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, 3.5, 0.06, 1);
  note(ctx, bx, m.eroa > 0.005 ? [`peak ${m.v.toFixed(1)} m/s · RVSP ${Math.round(m.rvsp)} mmHg${tri > 0.5 ? ' · triangular' : ''}`, `${m.v.toFixed(1)} m/s`] : 'no regurgitation', 'bottom');
  return bx;
}

/** Hepatic vein, PW from below: forward flow runs away from the probe (below the baseline). */
function hvPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · HEPATIC VEIN');
  const bx = inner(P);
  const S = q2(m.hvS), D = q2(m.hvD);
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 70, 400, 230) + D * bump(t, EV.mvo + 10, 720, 540) + 0.18 * bump(tt, 780, 900, 830) + 0.08 * bump(t, 400, 470, 430);
  };
  spectral(ctx, bx, { fn, scale: 0.8, base: 0.42, mode: 'pw', broad: 0.14, key: `hv|${S}|${D}`, seed: 42 });
  vscale(ctx, bx, 0.8, 0.42, 0.5, '');
  const y0 = bx.y + 0.42 * bx.h, k = (bx.h * 0.58) / 0.8;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letters = [
    waveLetter(ctx, 'S', X(230), S <= 0 ? y0 - S * k + 13 : y0 - S * k - 5),
    waveLetter(ctx, 'D', X(540), y0 - D * k + 13),
  ];
  ctx.restore();
  note(ctx, bx, S > 0.02 ? ['systolic flow reversal', 'S reversed'] : Math.abs(S) < Math.abs(D) ? ['systolic blunting', 'S blunted'] : 'systolic dominance', 'auto', letters);
  return bx;
}

function meterItems(m) {
  return [
    { k: 'EROA', v: m.eroa, u: 'cm²', d: 2, lo: 0, hi: 1.1, cuts: [[0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6'], [0.8, '0.8']], bad: m.eroa >= 0.4 },
    { k: 'Vena contracta', v: m.vc, u: 'cm', d: 2, lo: 0, hi: 2.8, cuts: [[0.7, '0.7'], [1.4, '1.4'], [2.1, '2.1']], bad: m.vc >= 0.7 },
    { k: 'Regurgitant volume', v: m.rvol, u: 'mL', lo: 0, hi: 100, cuts: [[30, '30'], [45, '45'], [60, '60'], [75, '75']], bad: m.rvol >= 45 },
    { k: 'Color jet area', v: m.jetA, u: 'cm²', lo: 0, hi: 30, cuts: [[10, '10']], bad: m.jetA > 10 },
    { k: 'RV basal diameter', v: m.rvb, u: 'cm', d: 1, lo: 2, hi: 6, norm: [2.5, 4.1], cuts: [[4.1, '4.1']], bad: m.rvb > 4.1 },
    { k: 'Tricuspid annulus', v: m.ta, u: 'cm', d: 1, lo: 2, hi: 5.5, cuts: [[4.0, '4.0']], bad: m.ta > 4.0 },
    { k: 'RA volume index', v: m.ravi, u: 'mL/m²', lo: 10, hi: 75, norm: [10, 33], cuts: [[33, '33']], bad: m.ravi > 33 },
    { k: 'IVC diameter', v: m.ivc, u: 'cm', d: 1, lo: 1, hi: 3.5, norm: [1.0, 2.1], cuts: [[2.1, '2.1'], [2.5, '2.5']], bad: m.ivc > 2.5 },
    { k: 'TR peak velocity', v: m.v, u: 'm/s', d: 1, lo: 1, hi: 3.5, cuts: [[2.0, '2.0'], [2.8, '2.8']], bad: m.v < 2.0 && m.s > 0.4 },
    { k: 'TAPSE', v: m.tapse, u: 'mm', lo: 8, hi: 30, norm: [17, 30], cuts: [[17, '17']], bad: m.tapse <= 17 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const tt = beat.at(st.trCine, 220);
  const mode = st.trColor;
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, m, tt, mode);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [trCW(ctx, p1, m), hvPW(ctx, p2, m)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m, tt, mode);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m));
  const [p1, p2, p3] = rows(colR, [1.05, 0.95, 1.1], 10);
  const bxs = [trCW(ctx, p1, m), hvPW(ctx, p2, m)];
  const [c1, c2] = cols(p3, [1.3, 1], 10);
  drawIVC(ctx, c1, { d: m.ivc, collapse: m.coll }, { title: `IVC · M-MODE · RAP ${m.rap} mmHg` });
  drawPSAXpm(ctx, c2, { lvid: [4.6 - 0.3 * m.s, 3.0], wall: [0.9, 1.3], ei: [m.ei, 1 + (m.ei - 1) * 0.4], rvw: [m.rvb * 0.62, m.rvb * 0.55] }, { t: tt, title: `PSAX · EI ${m.ei.toFixed(1)}` });
  for (const bx of bxs) cursor(ctx, bx, beat.sweep);
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function tableRows(m) {
  const q = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
  return [
    ['RV and RA size', ['Usually normal', 'Normal or mildly dilated', 'Usually dilated'], m.rvb <= 4.1 && m.ravi <= 33 ? 0 : m.rvb <= 4.5 ? 1 : 2],
    ['IVC diameter (cm)', ['Normal, <2', '2.1–2.5', '>2.5'], m.ivc < 2.1 ? 0 : m.ivc <= 2.5 ? 1 : 2],
    ['Color jet', ['Small, narrow, central', 'Moderate, central', 'Large central, or eccentric wall-impinging'], m.jetA < 5 ? 0 : m.jetA <= 10 ? 1 : 2],
    ['Flow convergence', ['Not visible, transient or small', 'Intermediate', 'Large throughout systole'], m.r <= 0.5 ? 0 : m.r <= 0.9 ? 1 : 2],
    ['CW jet', ['Faint, partial or parabolic', 'Dense, parabolic or triangular', 'Dense, often triangular'], q(m.rvol, 30, 45)],
    ['Vena contracta (cm)', ['<0.3', '0.3–0.69', '≥0.7'], m.vc < 0.3 ? 0 : m.vc < 0.7 ? 1 : 2],
    ['PISA radius (cm, 28 cm/s)', ['≤0.5', '0.6–0.9', '>0.9'], m.r <= 0.5 ? 0 : m.r <= 0.9 ? 1 : 2],
    ['Hepatic vein flow', ['Systolic dominance', 'Systolic blunting', 'Systolic flow reversal'], m.hvS > 0.02 ? 2 : Math.abs(m.hvS) < Math.abs(m.hvD) ? 1 : 0],
    ['Tricuspid inflow', ['A-wave dominant', 'Variable', 'E-wave >1.0 m/s'], m.E > 1.0 ? 2 : m.E < 0.6 ? 0 : 1],
    ['EROA (cm²)', ['<0.20', '0.20–0.39', '≥0.40'], q(m.eroa, 0.2, 0.4)],
    ['Regurgitant volume (mL)', ['<30', '30–44', '≥45'], q(m.rvol, 30, 45)],
  ];
}
function beyondRows(m) {
  const c = m.s < 0.4 ? -1 : m.s < 0.6 ? 0 : m.s < 0.8 ? 1 : 2;
  return [
    ['Vena contracta (mm)', ['7–13', '14–20', '≥21'], c],
    ['EROA by PISA (mm²)', ['40–59', '60–79', '≥80'], c],
    ['Regurgitant volume (mL)', ['45–59', '60–74', '≥75'], c],
  ];
}

export default {
  key: 'tr',
  part: 'valves',
  title: 'Tricuspid regurgitation',
  nav: 'TR',
  dwell: 18,
  defaults: { trS: 0.5, trCine: true, trColor: 'jet' },
  format: { trS: (v) => gradeOf(v) },
  watch: ['trS', 'trCine', 'trColor'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('tr-grades'), BANDS, LEVEL, { moderate: 'mod.', torrential: 'torr.' });
  },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.trCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ trS: 0, trCine: true, trColor: 'jet' }); },
  tourTick(tt, set) { set({ trS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1 + s.trS * 15; },
  text(s, { cite }) {
    const m = model(s[KEY]);
    const g = m.grade;
    const sev = m.s >= 0.4;
    const hvS = q2(m.hvS), hvD = q2(m.hvD);   // as the hepatic vein panel rounds them, so the two agree
    const hv = hvS > 0.02 ? 'hepatic vein systolic flow reverses' : Math.abs(hvS) < Math.abs(hvD) ? 'hepatic vein systolic flow is blunted' : 'hepatic vein flow remains systolic-dominant';
    const beyond = m.s >= 0.6 ? ` The EACVI defines ${g} TR, a grade beyond severe, by the vena contracta and the EROA${cite('lancellotti2022')}. As the RV and RA pressures approach each other, the peak TR velocity falls to ${fmt(m.v, 1)} m/s and no longer reflects the PA systolic pressure${cite('zoghbi2017')}.` : '';
    return {
      readouts: [
        { k: 'EROA', v: fmt(m.eroa, 2), u: 'cm²', flag: sev },
        { k: 'Vena contracta', v: fmt(m.vc, 2), u: 'cm', flag: m.vc >= 0.7 },
        { k: 'Regurgitant volume', v: fmt(m.rvol), u: 'mL', flag: m.rvol >= 45 },
        { k: 'RV basal diameter', v: fmt(m.rvb, 1), u: 'cm', flag: m.rvb > 4.1 },
        { k: 'RA pressure', v: fmt(m.rap), u: 'mmHg', flag: m.rap >= 8 },
        { k: 'Grade', v: g, text: true, flag: sev },
      ],
      live: m.eroa <= 0.001
        ? '<b>No tricuspid regurgitation.</b> The play control animates the progression of tricuspid regurgitation from mild to torrential.'
        : `<b>${g[0].toUpperCase()}${g.slice(1)} tricuspid regurgitation.</b> The EROA is ${fmt(m.eroa, 2)} cm², the vena contracta ${fmt(m.vc, 2)} cm and the regurgitant volume ${fmt(m.rvol)} mL${cite('zoghbi2017')}. The RV basal diameter is ${fmt(m.rvb, 1)} cm and the tricuspid annulus ${fmt(m.ta, 1)} cm; the IVC measures ${fmt(m.ivc, 1)} cm and ${m.collapses ? 'collapses' : 'collapses by less than 50%'} with a sniff, which corresponds to an estimated RA pressure of ${m.rap} mmHg; ${hv}.${beyond}`,
      extra: (art) => {
        gradeTable(art.querySelector('#tr-table'), tableRows(m), 'ASE 2017 grading (Table 14, condensed)');
        gradeTable(art.querySelector('#tr-table2'), beyondRows(m), 'Beyond severe: EACVI 2022 (Table 16)', ['Severe', 'Massive', 'Torrential']);
      },
    };
  },
};
