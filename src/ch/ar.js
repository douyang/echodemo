// 13 Aortic regurgitation: one slider from no leak to severe chronic AR with LV dilation and
// dysfunction. The orifice drives the volume numbers; the pressure half-time shortens, flow
// reverses in the descending aorta, and the LV dilates. Illustrative values in ASE 2017 bands.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit } from '../sev.js';
import { drawPLAX, plaxLV, cal, measures } from '../echo2d.js';
import { BSA } from './pressure.js';

const KEY = 'arS';
const VTI = 200;          // cm, AR jet
const FWD = 60;           // mL, forward stroke volume
const LVOT = 2.1;         // cm
const V0 = 4.4;           // m/s, AR velocity at aortic closure

const eroaOf = mono([[0, 0], [0.08, 0.03], [0.3, 0.1], [0.52, 0.3], [0.8, 0.42], [1, 0.5]]);
const phtOf = mono([[0, 700], [0.03, 640], [0.1, 500], [0.3, 200], [0.5, 140]]);
const edvOf = mono([[0, 0], [0.03, 3], [0.1, 10], [0.3, 20], [0.5, 30]]);
const TR = tracks([0, 0.3, 0.52, 0.8, 1], {
  lvedd: [4.8, 5.1, 6.0, 6.7, 7.1],
  lvesd: [3.0, 3.2, 3.9, 4.9, 5.4],
  ef: [62, 62, 60, 56, 50],
  sbp: [120, 126, 138, 148, 150],
  dbp: [78, 72, 60, 50, 45],
  wall: [0.9, 0.95, 1.0, 1.05, 1.05],
  la: [3.2, 3.3, 3.5, 3.8, 4.0],
});

export function model(s) {
  const m = TR(s);
  m.s = s;
  m.eroa = eroaOf(s);
  m.rvol = m.eroa * VTI;
  m.rf = (m.rvol / (m.rvol + FWD)) * 100;
  m.vc = 2 * Math.sqrt(m.eroa / Math.PI);
  m.jw = m.vc * 2.2;
  m.ratio = (m.jw / LVOT) * 100;
  m.pht = phtOf(m.eroa);
  m.edv = edvOf(m.eroa);
  m.sv = FWD + m.rvol;
  m.lvotVti = m.sv / (Math.PI * (LVOT / 2) ** 2);
  m.lvesdi = (m.lvesd * 10) / BSA;
  m.grade = gradeOf(s, m);
  return m;
}
export function gradeOf(s, m = null) {
  const eroa = m ? m.eroa : eroaOf(s);
  if (eroa <= 0.001) return 'none';
  if (eroa < 0.1) return 'mild';
  if (eroa < 0.3) return 'moderate';
  const t = m || TR(s);
  return t.ef <= 55 || t.lvesd > 5.0 || (t.lvesd * 10) / BSA > 25 ? 'severe, LV dysfunction' : 'severe';
}
const LEV = { ...LEVEL, 'severe, LV dysfunction': 4 };
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
const q2 = (v) => Math.round(v * 50) / 50;
// diastole for AR: aortic closure to the next aortic opening
const diaFrac = (t) => {
  const tt = t < EV.avo ? t + RR : t;
  return (tt - EV.avc) / (RR + EV.avo - EV.avc);
};

function plax(ctx, box, m, t) {
  const g = {
    ivs: [m.wall, m.wall * 1.4], pw: [m.wall, m.wall * 1.4], lvid: [m.lvedd, m.lvesd], rvd: 2.6,
    la: [m.la * 0.88, m.la], root: 3.3, lvot: LVOT, av: { thick: 0.12, open: 2.0, gap: m.eroa > 0.005 ? Math.min(0.3, m.vc * 0.45) : 0 },
  };
  const u = diaFrac(t);
  const a = u > 0.02 && u < 0.98 ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.25) : 0;
  const jets = m.eroa > 0.005 ? { ar: { q: m.eroa * V0 * 100, va: 60, vc: m.vc, jl: 2.2 + 9 * m.eroa, jw: m.jw, a } } : {};
  drawPLAX(ctx, box, g, {
    t, depth: 15 + 1.6 * m.s, jets, title: fit(box.w, 'PARASTERNAL LONG AXIS · COLOR 60 cm/s', 'PLAX · COLOR 60'),
    after: (c, F, geo) => {
      plaxLV(c, geo);
      if (m.eroa > 0.005 && a > 0.4) {
        const x = geo.xAnn - 0.7;
        cal(c, F, geo.R([x, geo.aoMid - m.jw / 2]), geo.R([x, geo.aoMid + m.jw / 2]), '', { solid: true });
      }
      measures(c, F, [`LVIDd ${m.lvedd.toFixed(1)} cm`, `LVIDs ${m.lvesd.toFixed(1)} cm`, `jet/LVOT ${Math.round(m.ratio)}%`]);
    },
  });
}

/** AR jet, CW from the apex: toward the probe through diastole, falling with the half-time. */
function arCW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · AORTIC REGURGITATION', 'CW · AR'));
  const bx = inner(P);
  const pht = Math.round(m.pht / 10) * 10, dens = q2(clamp(m.rvol / 60, 0.06, 1));
  const Td = RR + EV.avo - EV.avc;
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    const since = t < EV.avo ? t + RR - EV.avc : t - EV.avc;
    if (since < 0 || since > Td || m.eroa <= 0.005) return 0;
    const rise = Math.min(1, since / 18);
    return V0 * Math.pow(2, -since / (2 * pht)) * rise;
  };
  spectral(ctx, bx, { fn, scale: 6, base: 0.94, mode: 'cw', broad: 0.35 + 0.4 * (1 - dens), key: `arcw|${pht}|${dens}`, seed: 31 });
  if (dens < 0.95) {
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, 6, 0.94, 1);
  if (m.eroa > 0.005) {
    // the half-time: from the peak to the point where velocity is peak / sqrt 2
    const k = (bx.h * 0.94) / 6, y0 = bx.y + bx.h * 0.94;
    const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
    const t0 = EV.avc + 18;
    const x0 = X(t0), x1 = X(t0 + Math.min(pht, Td - 20));
    const v1 = V0 * Math.pow(2, -Math.min(pht, Td - 20) / (2 * pht));
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - V0 * k);
    ctx.lineTo(x1, y0 - v1 * k);
    ctx.stroke();
    ctx.restore();
    caliper(ctx, x0, y0 - V0 * k - 10, x1, y0 - V0 * k - 10, { solid: true });
  }
  note(ctx, bx, m.eroa > 0.005 ? `PHT ${pht} ms · ${m.rvol >= 30 ? 'dense' : 'faint'}` : 'no regurgitation', 'top');
  return bx;
}

/** Proximal descending aorta, PW from the suprasternal notch: diastolic flow reversal. */
function daoPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · DESCENDING AORTA', 'PW · DESC. AORTA'));
  const bx = inner(P);
  const edv = Math.round(m.edv) / 100;               // m/s
  const early = 0.16 + edv * 0.9;
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    if (t >= EV.avo && t < EV.avc + 10) {
      const w = (t - EV.avo) / (EV.avc + 10 - EV.avo);
      return -1.0 * Math.pow(Math.sin(Math.PI * Math.pow(w, 0.75)), 0.8);
    }
    const since = t >= EV.avc + 10 ? t - EV.avc - 10 : t + RR - EV.avc - 10;
    if (m.eroa <= 0.005) return since < 90 ? 0.12 * Math.sin((Math.PI * since) / 90) : 0;
    const decay = edv > 0.005 ? edv + (early - edv) * Math.exp(-since / 110) : early * Math.exp(-since / 70);
    return decay * Math.min(1, since / 25);
  };
  spectral(ctx, bx, { fn, scale: 1.4, base: 0.45, mode: 'pw', broad: 0.15, key: `dao|${Math.round(m.edv)}|${m.eroa > 0.005}`, seed: 32 });
  vscale(ctx, bx, 1.4, 0.45, 0.5, '');
  if (m.eroa > 0.005) {
    const k = (bx.h * 0.55) / 1.4, y0 = bx.y + bx.h * 0.45;
    const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
    if (edv > 0.02) caliper(ctx, X(RR - 6), y0, X(RR - 6), y0 - edv * k, { solid: true, size: 3 });
  }
  note(ctx, bx, m.eroa <= 0.005 ? 'no diastolic reversal' : fit(P.w, m.edv >= 20 ? `holodiastolic reversal · end-diastolic ${Math.round(m.edv)} cm/s` : m.edv >= 8 ? `diastolic reversal · end-diastolic ${Math.round(m.edv)} cm/s` : 'brief early diastolic reversal', `end-diastolic ${Math.round(m.edv)} cm/s`), 'top');
  return bx;
}

/** LVOT, PW from the apex: forward plus regurgitant volume, so the VTI rises. */
function lvotPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · LVOT');
  const bx = inner(P);
  const vti = Math.round(m.lvotVti);
  const ET = EV.avc - EV.avo;
  const shape = (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.8) : 0);
  const f = 0.6;                                      // mean of the shape over ejection
  const vpk = vti / ((ET / 1000) * f);               // cm/s
  const fn = (uu) => {
    const t = (uu * 2 * RR) % RR;
    return -(vpk / 100) * shape((t - EV.avo) / ET);
  };
  spectral(ctx, bx, { fn, scale: 3, base: 0.1, mode: 'pw', broad: 0.1, key: `arlvot|${vti}`, seed: 33 });
  vscale(ctx, bx, 3, 0.1, 1);
  note(ctx, bx, `VTI ${vti} cm · peak ${(vpk / 100).toFixed(1)} m/s`, 'bottom');
  return bx;
}

function meterItems(m) {
  return [
    { k: 'EROA', v: m.eroa, u: 'cm²', d: 2, lo: 0, hi: 0.6, cuts: [[0.1, '0.10'], [0.3, '0.30']], bad: m.eroa >= 0.3 },
    { k: 'Regurgitant volume', v: m.rvol, u: 'mL', lo: 0, hi: 110, cuts: [[30, '30'], [60, '60']], bad: m.rvol >= 60 },
    { k: 'Regurgitant fraction', v: m.rf, u: '%', lo: 0, hi: 70, cuts: [[30, '30'], [50, '50']], bad: m.rf >= 50 },
    { k: 'Vena contracta', v: m.vc, u: 'cm', d: 2, lo: 0, hi: 1.0, cuts: [[0.3, '0.3'], [0.6, '0.6']], bad: m.vc > 0.6 },
    { k: 'Jet width / LVOT', v: m.ratio, u: '%', lo: 0, hi: 100, cuts: [[25, '25'], [65, '65']], bad: m.ratio >= 65 },
    { k: 'Pressure half-time', v: m.pht, u: 'ms', lo: 100, hi: 800, cuts: [[200, '200'], [500, '500']], bad: m.pht < 200 },
    { k: 'Desc. aorta end-diastolic', v: m.edv, u: 'cm/s', lo: 0, hi: 40, cuts: [[20, '20']], bad: m.edv >= 20 },
    { k: 'LV end-diastolic diameter', v: m.lvedd, u: 'cm', d: 1, lo: 4, hi: 7.5, norm: [4.2, 5.8], cuts: [[6.5, '6.5']], bad: m.lvedd > 5.8 },
    { k: 'LV end-systolic diameter', v: m.lvesd, u: 'cm', d: 1, lo: 2, hi: 6, cuts: [[5.0, '5.0']], bad: m.lvesd > 5.0 },
    { k: 'LVEF', v: m.ef, u: '%', lo: 30, hi: 75, norm: [52, 72], cuts: [[55, '55']], bad: m.ef <= 55 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const tt = beat.at(st.arCine, 640);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    plax(ctx, a, m, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [arCW(ctx, p1, m), daoPW(ctx, p2, m)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  plax(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m));
  const [p1, p2, p3] = rows(colR, [1.1, 1, 1], 10);
  for (const bx of [arCW(ctx, p1, m), daoPW(ctx, p2, m), lvotPW(ctx, p3, m)]) cursor(ctx, bx, beat.sweep);
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function tableRows(m) {
  const q = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
  const size = m.lvedd <= 5.8 ? 0 : m.lvedd <= 6.3 ? 1 : 2;
  return [
    ['LV size', ['Normal', 'Normal or dilated', 'Usually dilated'], size],
    ['Jet width in LVOT', ['Small (central jets)', 'Intermediate', 'Large (central jets)'], q(m.ratio, 25, 65)],
    ['CW jet density', ['Incomplete or faint', 'Dense', 'Dense'], q(m.rvol, 30, 60)],
    ['Pressure half-time (ms)', ['Slow, >500', 'Medium, 500–200', 'Steep, <200'], m.pht > 500 ? 0 : m.pht >= 200 ? 1 : 2],
    ['Descending aorta reversal', ['Brief, early diastolic', 'Intermediate', 'Prominent, holodiastolic'], m.edv < 8 ? 0 : m.edv < 20 ? 1 : 2],
    ['Vena contracta (cm)', ['<0.3', '0.3–0.6', '>0.6'], m.vc < 0.3 ? 0 : m.vc <= 0.6 ? 1 : 2],
    ['Jet width / LVOT (%)', ['<25', '25–64', '≥65'], q(m.ratio, 25, 65)],
    ['Regurgitant volume (mL)', ['<30', '30–59', '≥60'], q(m.rvol, 30, 60)],
    ['Regurgitant fraction (%)', ['<30', '30–49', '≥50'], q(m.rf, 30, 50)],
    ['EROA (cm²)', ['<0.10', '0.10–0.29', '≥0.30'], q(m.eroa, 0.1, 0.3)],
  ];
}

export default {
  key: 'ar',
  part: 'valves',
  title: 'Aortic regurgitation',
  nav: 'AR',
  dwell: 18,
  defaults: { arS: 0.45, arCine: true },
  format: { arS: (v) => gradeOf(v) },
  watch: ['arS', 'arCine'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('ar-grades'), BANDS, LEV, { 'severe, LV dysfunction': 'LV dysf.' });
  },
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, s.arCine) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ arS: 0, arCine: true }); },
  tourTick(tt, set) { set({ arS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  text(s, { cite }) {
    const m = model(s[KEY]);
    const g = m.grade;
    const sev = g.startsWith('severe');
    const stage = !sev ? '' : g === 'severe'
      ? ` LVEF ${fmt(m.ef)}% and LV end-systolic diameter ${fmt(m.lvesd, 1)} cm: ACC/AHA stage C1 when there are no symptoms${cite('otto2020')}.`
      : ` <span class="k-red">LVEF ${fmt(m.ef)}%, LV end-systolic diameter ${fmt(m.lvesd, 1)} cm (${fmt(m.lvesdi)} mm/m²): past an ACC/AHA stage C2 limit (LVEF ≤55%, diameter >5.0 cm or >25 mm/m²)</span>${cite('otto2020')}.`;
    return {
      readouts: [
        { k: 'EROA', v: fmt(m.eroa, 2), u: 'cm²', flag: m.eroa >= 0.3 },
        { k: 'Regurgitant volume', v: fmt(m.rvol), u: 'mL', flag: m.rvol >= 60 },
        { k: 'Pressure half-time', v: fmt(m.pht), u: 'ms', flag: m.pht < 200 },
        { k: 'LVESD', v: fmt(m.lvesd, 1), u: 'cm', flag: m.lvesd > 5.0 },
        { k: 'LVEF', v: fmt(m.ef), u: '%', flag: m.ef <= 55 },
        { k: 'Grade', v: g, text: true, flag: sev },
      ],
      live: m.eroa <= 0.001
        ? 'No regurgitation. Press play to follow a leak from mild to severe.'
        : `<b>${g[0].toUpperCase()}${g.slice(1)} aortic regurgitation.</b> EROA ${fmt(m.eroa, 2)} cm², regurgitant volume ${fmt(m.rvol)} mL, jet ${fmt(m.ratio)}% of the LVOT; pressure half-time ${fmt(m.pht)} ms${cite('zoghbi2017')}. The LV takes forward plus regurgitant volume: LVOT VTI ${fmt(m.lvotVti)} cm, LV end-diastolic diameter ${fmt(m.lvedd, 1)} cm; blood pressure ${fmt(m.sbp)}/${fmt(m.dbp)} mmHg.${stage}`,
      extra: (art) => gradeTable(art.querySelector('#ar-table'), tableRows(m), 'ASE 2017 grading (Table 11, condensed)'),
    };
  },
};
