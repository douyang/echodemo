// 17 Pericardium: one slider from no effusion through mild, moderate and severe (large)
// effusion to tamponade. The fluid layer at end-diastole sets the size grade (ESC 2015 and 2025:
// <10, 10-20, >20 mm). As the sac fills, the pressure in it rises; when it reaches the right
// atrial pressure the right heart is compressed first: the RA folds in from late diastole, the
// RV free wall in early diastole, the IVC stops collapsing, and right and left filling swing in
// opposite directions with breathing (ASE 2013). The pressures and velocities are illustrative.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { tracks, bands, paintBands, playSeverity, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit } from '../sev.js';
import { drawA4C, drawPLAX, drawIVC } from '../echo2d.js';
import { rapFromIvc } from '../norms.js';
import { reducedMotion } from '../state.js';

const KEY = 'periS';
const RR0 = 857;             // ms, the beat the drawn views are timed on (70 a minute)
const BREATH = 4000;         // ms, 15 breaths a minute
const STRIP = 6000;          // ms across each Doppler strip: one and a half breaths

// Stops: none, mild, moderate, severe (large), the start of tamponade, established tamponade,
// the end stage. At the start of tamponade (0.70) the sac pressure reaches the RA pressure and
// each sign sits on its cut-off; the tracks are monotone, so none crosses it before that point.
const TRK = tracks([0, 0.1, 0.32, 0.56, 0.7, 0.8, 1], {
  eff: [0, 1.5, 9.5, 19.5, 23, 25, 27],          // mm, largest echo-free space in diastole
  ipp: [0, 0, 1, 3, 8, 14, 18],                  // mmHg, pressure in the sac
  rap: [5, 5, 5, 6, 8, 13.5, 17],                // mmHg, right atrial pressure
  hr: [70, 70, 72, 76, 86, 100, 118],            // per minute
  ivc: [1.7, 1.7, 1.75, 1.9, 2.1, 2.35, 2.5],    // cm
  coll: [0.6, 0.6, 0.55, 0.45, 0.35, 0.15, 0.08],
  mvVar: [5, 5, 7, 12, 25, 34, 42],              // %, fall of mitral E with inspiration
  tvVar: [12, 12, 15, 22, 40, 62, 75],           // %, rise of tricuspid E with inspiration
  raCol: [0, 0, 0, 0.12, 0.3, 0.42, 0.5],        // fraction of the cycle the RA wall stays folded in
  rvCol: [0, 0, 0, 0, 0.15, 0.7, 1],             // RV free wall buckling in early diastole, 0..1
  swing: [0, 0, 0, 0.08, 0.4, 0.58, 0.7],        // cm, the heart's swing in a large effusion
  pp: [4, 4, 5, 7, 10, 15, 22],                  // mmHg, inspiratory fall of systolic pressure
  sv: [72, 72, 71, 66, 52, 40, 30],              // mL
  hvRev: [0, 0, 0, 0.04, 0.1, 0.3, 0.42],        // m/s, hepatic vein diastolic reversal in expiration
  tamp: [0, 0, 0, 0, 0.1, 0.75, 1],              // 0..1, how far the right heart is compressed
});

export function model(s) {
  const m = TRK(s);
  m.s = s;
  m.rr = 60000 / m.hr;
  m.collapses = m.coll > 0.5;
  m.rapIvc = rapFromIvc(m.ivc, m.collapses);
  m.tamp = clamp(m.tamp, 0, 1);
  m.co = (m.sv * m.hr) / 1000;
  m.rvIn = m.rvCol * 8;                                // mm the free wall moves in
  m.grade = gradeOf(s);
  return m;
}
export function gradeOf(s) {
  const m = TRK(s);
  if (m.ipp >= m.rap - 1e-9) return 'tamponade';
  if (m.eff < 1) return 'none';
  if (m.eff < 10) return 'mild';
  if (m.eff < 20) return 'moderate';
  return 'severe';
}
const LEV = { ...LEVEL, tamponade: 5 };
let BANDS = [];

let sheet = null, st = null;
// the page's own clock: beats at the page's heart rate, breaths at 15 a minute
const clock = { ms: 0, beats: 0.2 };
const q2 = (v) => Math.round(v * 50) / 50;
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
const breath = (ms) => Math.sin((2 * Math.PI * ms) / BREATH);      // + inspiration, - expiration

/** RA and RV wall positions, the septal shift and the swing for this moment. */
function dynamics(m) {
  const f = clock.beats % 1, r = breath(clock.ms);
  // the RA folds in near the peak of the R wave and stays in until filling in systole raises its
  // pressure: from late diastole into systole
  const w = m.raCol, a0 = 1 - 0.55 * w, a1 = 0.45 * w;
  let ra = 0;
  if (w > 0.01) {
    const x = f >= a0 ? (f - a0) / w : f <= a1 ? (f + 1 - a0) / w : -1;
    if (x >= 0 && x <= 1) ra = Math.sin(Math.PI * x) * Math.min(1, 0.4 + 1.6 * w);
  }
  // the RV free wall in early diastole, after the T wave. Sources differ on the breath it first
  // shows in; in established tamponade it shows in every beat, as here
  const rv = m.rvCol * bump(f, 0.5, 0.78, 0.6);
  // inspiration fills the RV and pushes the septum toward the LV; expiration does the reverse
  const sep = 0.45 * m.tamp * r;
  // a large effusion lets the heart swing, once every two beats
  const p = Math.PI * clock.beats;
  return { ra: clamp(ra, 0, 1), rv: clamp(rv, 0, 1), sep, swing: [m.swing * Math.sin(p), 0.35 * m.swing * Math.cos(p)] };
}

function a4c(ctx, box, m) {
  const k = m.tamp, sq = 1 - 0.12 * k;                 // tamponade: small, underfilled chambers
  const g = {
    lvL: [8.4, 7.3], lvW: [4.6 * sq, 3.0 * sq], lvWall: [0.9, 1.3], ivs: [0.9, 1.25],
    rvW: [3.3 * (1 - 0.18 * k), 2.7 * (1 - 0.18 * k)], rvWall: 0.4, laW: [3.3, 3.9], laL: [4.1, 4.8],
    raW: [3.1 * (1 - 0.1 * k), 3.6 * (1 - 0.1 * k)], raL: [3.8, 4.4], ma: 3.1, ta: 3.0,
    effusion: (m.eff / 10) * 0.85,
  };
  const t = clock.beats % 1 * RR0;
  drawA4C(ctx, box, g, {
    t, depth: 16 + 0.5 * (m.eff / 10), dyn: dynamics(m),
    title: fit(box.w, `APICAL FOUR-CHAMBER · HR ${Math.round(m.hr)}`, 'A4C'),
  });
}

function plax(ctx, box, m) {
  const e = m.eff / 10;
  const g = { ivs: [0.9, 1.3], lvid: [4.7 * (1 - 0.1 * m.tamp), 3.0], pw: [0.9, 1.3], la: [3.1, 3.5], root: 3.1, lvot: 2.1,
    effusion: e, effusionAnt: Math.max(0, e - 0.6) * 0.75 };
  drawPLAX(ctx, box, g, { t: clock.beats % 1 * RR0, depth: 16, title: fit(box.w, 'PARASTERNAL LONG AXIS', 'PLAX') });
}

/** Mitral or tricuspid inflow over a breath and a half: E and A for each beat. */
function inflowFn(m, side) {
  const rr = m.rr, mvo = 453 - 0.35 * (RR0 - rr), dia = rr - mvo;
  const dE = Math.min(230, 0.6 * dia + 40), dA = Math.min(150, 0.42 * dia + 30);
  const V = (side === 'mv' ? m.mvVar : m.tvVar) / 100, a = V / (2 - V);
  const E0 = side === 'mv' ? 0.8 - 0.15 * m.tamp : 0.55, A0 = side === 'mv' ? 0.55 : 0.4;
  const sgn = side === 'mv' ? -1 : 1;
  return (u) => {
    const t = u * STRIP;
    const b = Math.floor(t / rr), tb = t - b * rr;
    // the breath when this beat's E wave comes
    const r = breath(b * rr + mvo + dE * 0.4);
    const kE = 1 + sgn * a * r, kA = 1 + sgn * 0.5 * a * r;
    const e = E0 * kE * bump(tb, mvo, mvo + dE, mvo + dE * 0.4);
    const aw = (x) => bump(x, rr - dA + 15, rr + 15, rr - dA * 0.45 + 15);
    const A = A0 * kA * Math.max(aw(tb), aw(tb + rr));
    return Math.max(e, A);
  };
}

function inflowPW(ctx, P, m, side) {
  const mv = side === 'mv';
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, mv ? 'PW · MITRAL INFLOW, WITH BREATHING' : 'PW · TRICUSPID INFLOW, WITH BREATHING', mv ? 'PW · MV' : 'PW · TV'));
  const bx = inner(P);
  const V = mv ? m.mvVar : m.tvVar;
  const hr = Math.round(m.hr / 2) * 2;
  spectral(ctx, bx, { fn: inflowFn({ ...m, hr, rr: 60000 / hr, mvVar: Math.round(m.mvVar), tvVar: Math.round(m.tvVar) }, side), scale: 1.2, base: 0.82, mode: 'pw', broad: 0.1, key: `peri${side}|${hr}|${Math.round(V)}|${q2(m.tamp)}`, seed: mv ? 71 : 72 });
  vscale(ctx, bx, 1.2, 0.82, 0.5);
  resp(ctx, bx);
  note(ctx, bx, `E ${mv ? 'falls' : 'rises'} ${Math.round(V)}% with inspiration`, 'top');
  return bx;
}

/** Hepatic vein, PW from below: forward flow runs away from the probe (below the baseline). */
function hvFn(m) {
  const rr = m.rr, sys = 0.47 * rr;
  return (u) => {
    const t = u * STRIP;
    const b = Math.floor(t / rr), tb = t - b * rr;
    const r = breath(b * rr + sys);
    const S = -0.42 * (1 + 0.15 * r);
    // in tamponade diastolic forward flow is lost, and reverses in expiration
    const Df = -0.3 * (1 - 0.95 * m.tamp) * (1 + 0.25 * r);
    const Dr = r < 0 ? m.hvRev * -r : 0;
    const D = Df + Dr;
    return S * bump(tb, 60, sys + 40, sys * 0.55) + D * bump(tb, sys + 60, rr - 60, sys + 0.4 * (rr - sys)) + 0.16 * bump(tb, rr - 110, rr, rr - 55);
  };
}
function hvPW(ctx, P, m) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · HEPATIC VEIN, WITH BREATHING', 'PW · HV'));
  const bx = inner(P);
  const hr = Math.round(m.hr / 2) * 2;
  spectral(ctx, bx, { fn: hvFn({ ...m, rr: 60000 / hr }), scale: 0.8, base: 0.42, mode: 'pw', broad: 0.14, key: `perihv|${hr}|${q2(m.tamp)}|${q2(m.hvRev)}`, seed: 73 });
  vscale(ctx, bx, 0.8, 0.42, 0.5, '');
  resp(ctx, bx);
  note(ctx, bx, m.hvRev > 0.1 ? 'diastolic reversal in expiration' : m.tamp > 0.3 ? 'diastolic forward flow lost' : 'systolic and diastolic forward flow', 'top');
  return bx;
}

/** The breathing trace along the foot of a strip: up is inspiration. */
function resp(ctx, bx) {
  const y0 = bx.y + bx.h - 9, amp = 5;
  ctx.save();
  ctx.strokeStyle = SC.ecg;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= bx.w; x += 2) {
    const y = y0 - amp * breath((x / bx.w) * STRIP);
    if (x) ctx.lineTo(bx.x + x, y); else ctx.moveTo(bx.x, y);
  }
  ctx.stroke();
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = SC.ecg;
  ctx.textAlign = 'center';
  for (const ms of [BREATH / 4, BREATH / 4 + BREATH]) if (ms < STRIP) ctx.fillText('insp', bx.x + (ms / STRIP) * bx.w, y0 - amp - 3);
  ctx.restore();
}

function meterItems(m) {
  return [
    { k: 'Effusion (diastole)', v: m.eff, u: 'mm', lo: 0, hi: 30, cuts: [[10, '10'], [20, '20']], bad: m.eff >= 10 },
    { k: 'Pressure in the sac', v: m.ipp, u: 'mmHg', lo: 0, hi: 20, cuts: [[m.rap, 'RA']], bad: m.grade === 'tamponade' },
    { k: 'RA folded in', v: m.raCol * 100, u: '% of cycle', lo: 0, hi: 60, cuts: [[33.3, '⅓']], bad: m.raCol >= 1 / 3 },
    { k: 'RV wall, early diastole', v: m.rvIn, u: 'mm in', lo: 0, hi: 10, cuts: [], bad: m.rvCol > 0.2 },
    { k: 'IVC diameter', v: m.ivc, u: 'cm', d: 1, lo: 1, hi: 3, norm: [1.0, 2.1], cuts: [[2.1, '2.1']], bad: m.ivc > 2.1 },
    { k: 'IVC collapse, sniff', v: m.coll * 100, u: '%', lo: 0, hi: 80, cuts: [[50, '50']], bad: m.coll < 0.5 },
    { k: 'Mitral E, breathing', v: m.mvVar, u: '%', lo: 0, hi: 50, cuts: [[25, '25'], [30, '30']], bad: m.mvVar > 25 },
    { k: 'Tricuspid E, breathing', v: m.tvVar, u: '%', lo: 0, hi: 90, cuts: [[40, '40'], [60, '60']], bad: m.tvVar > 40 },
    { k: 'Heart rate', v: m.hr, u: '/min', lo: 40, hi: 140, norm: [60, 100], cuts: [[100, '100']], bad: m.hr > 100 },
    { k: 'Pulsus paradoxus', v: m.pp, u: 'mmHg', lo: 0, hi: 30, cuts: [[10, '10']], bad: m.pp > 10 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const u = (clock.ms % STRIP) / STRIP;
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    a4c(ctx, a, m);
    const [p1, p2] = rows(b, [1, 1], 8);
    for (const bx of [inflowPW(ctx, p1, m, 'mv'), inflowPW(ctx, p2, m, 'tv')]) cursor(ctx, bx, u);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, m);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(m));
  const [p1, p2, p3, p4] = rows(colR, [1, 1, 0.95, 1.45], 10);
  const bxs = [inflowPW(ctx, p1, m, 'mv'), inflowPW(ctx, p2, m, 'tv'), hvPW(ctx, p3, m)];
  const [c1, c2] = cols(p4, [1.25, 1], 10);
  plax(ctx, c1, m);
  drawIVC(ctx, c2, { d: m.ivc, collapse: m.coll }, { title: fit(c2.w, `IVC · M-MODE · RAP ${m.rapIvc} mmHg`, 'IVC') });
  for (const bx of bxs) cursor(ctx, bx, u);
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');
function sizeRows(m) {
  const c = m.eff < 1 ? -1 : m.eff < 10 ? 0 : m.eff < 20 ? 1 : 2;
  return [
    ['Echo-free space at end-diastole', ['<10 mm', '10–20 mm', '>20 mm'], c],
    ['Volume, approximate (ASE)', ['50–100 mL', '100–500 mL', '>500 mL'], c],
  ];
}
function tampRows(m) {
  const on = (x) => (x ? 1 : 0);
  return [
    ['Right atrium', ['Brief or no inversion', 'Folds in for more than a third of the cycle'], on(m.raCol >= 1 / 3)],
    ['Right ventricle', ['Free wall moves out in diastole', 'Free wall collapses in early diastole'], on(m.rvCol > 0.2)],
    ['IVC', ['≤2.1 cm, collapses more than 50%', '>2.1 cm, collapses less than 50%'], on(m.ivc > 2.1 && m.coll < 0.5)],
    ['Mitral E with inspiration', ['Falls less than 25%', 'Falls more than 25–30%'], on(m.mvVar > 25)],
    ['Tricuspid E with inspiration', ['Rises less than 40%', 'Rises more than 40–60%'], on(m.tvVar > 40)],
    ['Hepatic veins', ['Forward flow in systole and diastole', 'Diastolic flow falls or reverses in expiration'], on(m.hvRev > 0.1)],
  ];
}

export default {
  key: 'peri',
  part: 'pericardium',
  title: 'Pericardium',
  nav: 'Peri',
  dwell: 18,
  defaults: { periS: 0.45, periCine: true },
  format: { periS: (v) => gradeOf(v) },
  watch: ['periS', 'periCine'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((s) => gradeOf(s));
    paintBands(document.getElementById('peri-grades'), BANDS, LEV, { moderate: 'mod.', tamponade: 'tamp.' });
  },
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (s.periCine && !reducedMotion) {
      const m = model(s[KEY]);
      clock.ms = (clock.ms + dt * 1000) % (STRIP * BREATH);
      clock.beats += (dt * 1000) / m.rr;
      if (sheet) sheet.dirty = true;
    }
  },
  tourEnter(set) { set({ periS: 0, periCine: true }); },
  tourTick(tt, set) { set({ periS: Math.round(clamp((tt - 1) / 15, 0, 1) * 200) / 200 }); },
  text(s, { cite }) {
    const m = model(s[KEY]);
    const g = m.grade;
    const pd = Math.abs(m.rap - m.ipp) < 1 ? 1 : 0;      // a decimal when the two pressures are close
    const size = m.eff < 1 ? 'no effusion' : m.eff < 10 ? 'a mild (small) effusion' : m.eff < 20 ? 'a moderate effusion' : 'a severe (large) effusion';
    let live;
    if (g === 'none') live = 'No effusion: the two layers of the pericardium lie together. The normal sac holds 10–50 mL of fluid; a separation seen only in systole is trivial. Press play to follow an effusion to tamponade.';
    else if (g !== 'tamponade') {
      live = `<b>${g[0].toUpperCase()}${g.slice(1)} effusion.</b> Echo-free space ${fmt(m.eff)} mm in diastole: ${size}. The pressure in the sac, ${fmt(m.ipp, pd)} mmHg, stays below the RA pressure (${fmt(m.rap, pd)} mmHg), so the chambers fill normally: IVC ${fmt(m.ivc, 1)} cm, ${m.collapses ? 'collapsing more than 50%' : 'collapsing less than 50%'} with a sniff; mitral E varies ${fmt(m.mvVar)}% with breathing.${m.raCol > 0.05 ? ` The RA wall folds in briefly (${fmt(m.raCol * 100)}% of the cycle): short inversion alone is not tamponade.` : ''}${m.swing > 0.2 ? ' The heart swings in the fluid.' : ''}`;
    } else {
      live = `<b>Tamponade.</b> The pressure in the sac (${fmt(m.ipp, pd)} mmHg) has reached the RA pressure (${fmt(m.rap, pd)} mmHg). The RA folds in for ${fmt(m.raCol * 100)}% of the cycle${m.raCol >= 1 / 3 ? ', more than a third' : ''}; the RV free wall collapses in early diastole; the septum moves toward the LV with each inspiration; the IVC is ${fmt(m.ivc, 1)} cm and collapses only ${fmt(m.coll * 100)}%; mitral E falls ${fmt(m.mvVar)}% and tricuspid E rises ${fmt(m.tvVar)}% with inspiration. Heart rate ${fmt(m.hr)}, stroke volume ${fmt(m.sv)} mL; pulsus paradoxus ${fmt(m.pp)} mmHg. Tamponade is a clinical diagnosis: the echo signs support it.`;
    }
    return {
      readouts: [
        { k: 'Effusion', v: fmt(m.eff), u: 'mm', flag: m.eff >= 10 },
        { k: 'Sac pressure', v: fmt(m.ipp, pd), u: 'mmHg', flag: g === 'tamponade' },
        { k: 'RA pressure', v: fmt(m.rap, pd), u: 'mmHg', flag: m.rap > 8 },
        { k: 'Heart rate', v: fmt(m.hr), u: '/min', flag: m.hr > 100 },
        { k: 'Stroke volume', v: fmt(m.sv), u: 'mL', flag: m.sv < 60 },
        { k: 'Grade', v: g, text: true, flag: g === 'tamponade' || g === 'severe' },
      ],
      live,
      extra: (art) => {
        gradeTable(art.querySelector('#peri-table'), sizeRows(m), 'Effusion size', ['Mild (small)', 'Moderate', 'Severe (large)']);
        gradeTable(art.querySelector('#peri-table2'), tampRows(m), 'Echo signs of tamponade', ['Without tamponade', 'Tamponade']);
      },
    };
  },
};
