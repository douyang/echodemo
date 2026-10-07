// Pericardial disease: one slider and a switch for the disease. The effusion, the chapter's main
// disease, runs from no effusion through mild, moderate and severe (large) effusion to tamponade.
// The fluid layer at end-diastole sets the size grade (ESC 2015 and 2025: <10, 10-20, >20 mm). As
// the sac fills, the pressure in it rises; when it reaches the right atrial pressure the right
// heart is compressed first: the RA folds in from late diastole, the RV free wall in early
// diastole, the IVC stops collapsing, and right and left filling swing in opposite directions
// with breathing (ASE 2013). The pressures and velocities are illustrative. Constriction, from a
// normal pericardium to all three Mayo Clinic criteria, and restrictive cardiomyopathy, for
// comparison, take the slider with the figure and the text of src/constriction.js.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { tracks, lazyBands, paintBands, playSeverity, cursor, rows, cols, inner, meters, LEVEL, gradeTable, note, fit, shown } from '../sev.js';
import { drawIVC } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { rapEstimate } from '../norms.js';
import { reducedMotion } from '../state.js';
import * as CP from '../constriction.js';

const KEY = 'periS';
const MODE = 'periMode';
// the switch: the effusion, constriction and restrictive cardiomyopathy
const MODES = ['eff', ...CP.MODES];
const modeOf = (s) => (s && MODES.includes(s[MODE]) ? s[MODE] : 'eff');
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
  // the values as the page prints them, so that the grade, the flags and the sentences agree
  // with the numbers on screen
  for (const k of ['eff', 'hr', 'sv', 'pp', 'mvVar', 'tvVar']) m[k] = shown(m[k]);
  m.ivc = shown(m.ivc, 1);
  m.collPct = shown(m.coll * 100);
  m.coll = m.collPct / 100;
  m.raColPct = shown(m.raCol * 100);
  m.rr = 60000 / m.hr;
  // the RA pressure as the IVC chapter estimates it from the IVC (Mukherjee 2025): a sniff, collapse ≥50%
  m.collapses = m.collPct >= 50;
  m.rapIvc = rapEstimate({ d: m.ivc, col: m.collPct, mode: 'sniff', sec: 'unclear' }).rap;
  m.tamp = clamp(m.tamp, 0, 1);
  m.co = (m.sv * m.hr) / 1000;
  m.rvIn = m.rvCol * 8;                                // mm the free wall moves in
  m.grade = gradeOf(s, m);
  return m;
}
// size by the echo-free space as printed (ESC: <10, 10-20, >20 mm); tamponade once the sac
// pressure, to the decimal the page can show, reaches the RA pressure
export function gradeOf(s, m = model(s)) {
  if (shown(m.ipp, 1) >= shown(m.rap, 1)) return 'tamponade';
  if (m.eff < 1) return 'none';
  if (m.eff < 10) return 'mild';
  if (m.eff <= 20) return 'moderate';
  return 'severe';
}
// the slider's bands for each disease (sev.js lazyBands, init), with their levels and short names
const BANDS = { eff: [], cp: [], rcm: [] };
const LEVELS_OF = { eff: { ...LEVEL, tamponade: 5 }, cp: CP.LEVELS, rcm: CP.LEVELS };
const SHORT_OF = { eff: { moderate: 'mod.', tamponade: 'tamp.' }, cp: CP.SHORT.cp, rcm: CP.SHORT.rcm };
/** The slider's label: the grade at x of the disease shown. */
const labelOf = (x, mode) => (mode === 'eff' ? gradeOf(x) : CP.LABEL[mode][CP.gradeOf(x, mode)]);

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

// The four-chamber and long-axis views cut from the heart mesh (meshpanel.js), with the fluid and
// the signs of tamponade as targets on it (phenomesh.js DISEASE): the heart the page shows.
const MOVES = ['eff', 'effAnt', 'under', 'raIn', 'rvIn', 'sep', 'swing', 'bob'];
const redraw = () => { if (sheet) sheet.dirty = true; };
const echoA4C = new MeshPanel('a4c', { diseases: MOVES, redraw });
const echoPLAX = new MeshPanel('plax', { diseases: MOVES, redraw });
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * The sac's targets (cm) from the effusion as printed. With no fluid the mesh's sac already lies
 * 1.7 mm from the heart, and the underfilled chambers of tamponade (under) widen the space by
 * 3.7 mm more, so the largest space at end-diastole is the printed one. Fluid in front of the
 * heart (effAnt) comes only in a larger effusion.
 */
function sacOf(m) {
  const e = m.eff / 10;
  return { eff: Math.max(0, e - 0.17 - 0.37 * m.tamp), effAnt: Math.max(0, e - 0.6) * 0.75, under: m.tamp };
}
/** The moves within the beat (cm): the RA and RV walls fold in, the septum shifts, the heart swings. */
function movesOf(m) {
  const d = dynamics(m);
  return { raIn: 1.2 * d.ra, rvIn: 0.8 * d.rv, sep: d.sep, swing: d.swing[0], bob: d.swing[1] };
}

function a4c(ctx, box, m) {
  const S = sacOf(m);
  echoA4C.draw(ctx, box, fit(box.w, `APICAL FOUR-CHAMBER · HR ${Math.round(m.hr)}`, 'A4C'), {
    tms: (clock.beats % 1) * RR0, disease: S, motion: movesOf(m),
    // the probe sits on the chest wall, so fluid round the apex sets the heart back
    standoff: S.eff, deeper: S.eff, sac: true, still: smooth(S.eff / 0.5),
    names: [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
  });
}

function plax(ctx, box, m) {
  const S = sacOf(m), { raIn, ...mv } = movesOf(m);
  echoPLAX.draw(ctx, box, fit(box.w, 'PARASTERNAL LONG AXIS', 'PLAX'), {
    tms: (clock.beats % 1) * RR0, disease: S, motion: mv,
    standoff: S.effAnt, deeper: S.effAnt, sac: true, still: smooth(S.eff / 0.5),
    names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
  });
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
  note(ctx, bx, [`E ${mv ? 'falls' : 'rises'} ${Math.round(V)}% with inspiration`, `E ${mv ? '−' : '+'}${Math.round(V)}% inspiration`, `E ${mv ? '−' : '+'}${Math.round(V)}%`], 'top');
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
  note(ctx, bx, m.hvRev > 0.1 ? ['diastolic reversal in expiration', 'D reversal, expiration'] : m.tamp > 0.3 ? ['diastolic forward flow lost', 'D flow lost'] : ['systolic and diastolic forward flow', 'S and D forward'], 'top');
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
    { k: 'Pericardial pressure', v: m.ipp, u: 'mmHg', lo: 0, hi: 20, cuts: [[m.rap, 'RA']], bad: m.grade === 'tamponade' },
    { k: 'RA inversion', v: m.raColPct, u: '% of cycle', lo: 0, hi: 60, cuts: [[33.3, '⅓']], bad: m.raColPct > 33 },
    { k: 'RV wall, early diastole', v: m.rvIn, u: 'mm in', lo: 0, hi: 10, cuts: [], bad: m.rvCol > 0.2 },
    { k: 'IVC diameter', v: m.ivc, u: 'cm', d: 1, lo: 1, hi: 3, norm: [1.0, 2.1], cuts: [[2.1, '2.1']], bad: m.ivc > 2.1 },
    { k: 'IVC collapse on sniff', v: m.collPct, u: '%', lo: 0, hi: 80, cuts: [[50, '50']], bad: !m.collapses },
    { k: 'Mitral E variation', v: m.mvVar, u: '%', lo: 0, hi: 50, cuts: [[25, '25'], [30, '30']], bad: m.mvVar > 25 },
    { k: 'Tricuspid E variation', v: m.tvVar, u: '%', lo: 0, hi: 90, cuts: [[40, '40'], [60, '60']], bad: m.tvVar > 40 },
    { k: 'Heart rate', v: m.hr, u: '/min', lo: 40, hi: 140, norm: [60, 100], cuts: [[100, '100']], bad: m.hr > 100 },
    { k: 'Pulsus paradoxus', v: m.pp, u: 'mmHg', lo: 0, hi: 30, cuts: [[10, '10']], bad: m.pp > 10 },
  ];
}

function drawEffusion(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const m = model(st[KEY]);
  const u = (clock.ms % STRIP) / STRIP;
  if (W < 700) {
    // a phone: the four-chamber view and the IVC over the two inflow strips, in the grid of the
    // constriction figure, as tall
    const [r1, r2, r3] = rows({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.3, 0.7, 0.7], 8);
    const [a, b] = cols(r1, [1.25, 1], 8);
    a4c(ctx, a, m);
    drawIVC(ctx, b, { d: m.ivc, collapse: m.coll }, { title: fit(b.w, `IVC · RAP est. ${m.rapIvc} mmHg`, `IVC · RAP ${m.rapIvc}`) });
    for (const bx of [inflowPW(ctx, r2, m, 'mv'), inflowPW(ctx, r3, m, 'tv')]) cursor(ctx, bx, u);
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
  // the estimate from the IVC; the RA pressure readout is the pressure the model sets
  drawIVC(ctx, c2, { d: m.ivc, collapse: m.coll }, { title: fit(c2.w, `IVC · M-MODE · RAP estimate ${m.rapIvc} mmHg`, `IVC · RAP est. ${m.rapIvc}`) });
  for (const bx of bxs) cursor(ctx, bx, u);
}

// constriction and restrictive cardiomyopathy: the figure of src/constriction.js, with its own
// four-chamber view and clock
const conFig = CP.constrictionFigure(redraw);
const conValues = CP.valuesCache();
function draw(sh, t) {
  const mode = modeOf(st);
  if (mode === 'eff') drawEffusion(sh, t);
  else conFig.draw(sh, t, conValues(st[KEY], mode), st.pheno);
}

// The views of the disease shown load first; the others start when those are ready, at idle, so
// that the switch shows its views at once.
const PANELS = { eff: [echoA4C, echoPLAX], cp: [conFig.mesh], rcm: [conFig.mesh] };
const ALL = [echoA4C, echoPLAX, conFig.mesh];
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
function startPanels(mode) {
  const mine = PANELS[mode];
  for (const p of mine) p.start();
  const rest = () => {
    if (mine.every((p) => p.state === 'ready' || p.state === 'failed')) idle(() => { for (const p of ALL) p.start(); });
    else setTimeout(rest, 250);
  };
  rest();
}

let painted = '';
/** The slider's bands and its label for the disease shown: again when the switch changes it. */
function paintFor(s) {
  const mode = modeOf(s);
  if (mode !== painted) {
    painted = mode;
    paintBands(document.getElementById('peri-grades'), BANDS[mode], LEVELS_OF[mode], SHORT_OF[mode]);
  }
  // main.js writes the label when periS changes; the switch changes it alone
  const o = document.querySelector('output[data-for="periS"]'), lab = labelOf(s[KEY], mode);
  if (o && o.textContent !== lab) o.textContent = lab;
  const what = document.getElementById('peri-what'), w = mode === 'eff' ? 'Effusion' : 'Severity';
  if (what && what.textContent !== w) what.textContent = w;
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
    ['Right atrium', ['Brief or no inversion', 'Inversion for more than one third of the cycle'], on(m.raColPct > 33)],
    ['Right ventricle', ['Free wall moves outward in diastole', 'Free wall collapses in early diastole'], on(m.rvCol > 0.2)],
    ['IVC', ['≤2.1 cm, collapses 50% or more', '>2.1 cm, collapses less than 50%'], on(m.ivc > 2.1 && !m.collapses)],
    ['Mitral E with inspiration', ['Falls less than 25%', 'Falls more than 25–30%'], on(m.mvVar > 25)],
    ['Tricuspid E with inspiration', ['Rises less than 40%', 'Rises more than 40–60%'], on(m.tvVar > 40)],
    ['Hepatic veins', ['Forward flow in systole and diastole', 'Diastolic flow falls or reverses in expiration'], on(m.hvRev > 0.1)],
  ];
}

// the tour: the start (s) and the length (s) of each disease's sweep of the slider
const TOUR = { eff: [1, 14], cp: [17, 7], rcm: [26, 5] };

export default {
  key: 'peri',
  part: 'pericardium',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Pericardial disease',
  nav: 'Peri',
  dwell: 32,
  defaults: { periS: 0.45, periMode: 'eff', periCine: true },
  format: { periS: (x, s) => labelOf(x, modeOf(s)) },
  watch: ['periS', 'periMode', 'periCine', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  // the views of the disease shown first; the heart model and the targets load at idle before the
  // chapter opens (main.js warmQueue)
  enter() { startPanels(modeOf(st)); },
  warm() { for (const p of ALL) p.start(); },
  init({ state }) {
    st = state;
    BANDS.eff = lazyBands((x) => gradeOf(x));
    for (const mode of CP.MODES) BANDS[mode] = lazyBands((x) => CP.gradeOf(x, mode));
    paintFor(state);
  },
  onState(s, ch) { if (MODE in ch) paintFor(s); },
  // the heart for the music: the effusion's own rate and beat, or the constriction figure's beat,
  // while the cine runs
  pulse: (s) => (modeOf(s) === 'eff' ? { rr: model(s[KEY]).rr, phase: s.periCine && !reducedMotion ? clock.beats % 1 : null } : conFig.pulse()),
  anim(dt, s, set) {
    const mode = modeOf(s);
    playSeverity(dt, s, set, KEY, BANDS[mode]);
    if (mode !== 'eff') {
      if (conFig.tick(dt) && sheet) sheet.dirty = true;
    } else if (s.periCine && !reducedMotion) {
      const m = model(s[KEY]);
      clock.ms = (clock.ms + dt * 1000) % (STRIP * BREATH);
      clock.beats += (dt * 1000) / m.rr;
      if (sheet) sheet.dirty = true;
    }
  },
  // the sequence: the effusion to tamponade, then, shorter, constriction and restrictive
  // cardiomyopathy, each from normal to its most severe grade
  tourEnter(set) { set({ periS: 0, periMode: 'eff', periCine: true }); },
  tourTick(tt, set) {
    const mode = tt < 16 ? 'eff' : tt < 25 ? 'cp' : 'rcm', [t0, len] = TOUR[mode];
    set({ periMode: mode, periS: Math.round(clamp((tt - t0) / len, 0, 1) * 200) / 200 });
  },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { const [t0, len] = TOUR[modeOf(s)]; return t0 + s.periS * len; },
  text(s, { cite }) {
    const mode = modeOf(s);
    // the tables of the disease shown
    const tables = (art) => { for (const el of art.querySelectorAll('[data-peri]')) el.hidden = !el.dataset.peri.split(' ').includes(mode); };
    if (mode !== 'eff') {
      const v = conValues(s[KEY], mode);
      return {
        readouts: CP.readoutsOf(v),
        live: CP.liveOf(v, cite),
        extra: (art) => {
          tables(art);
          CP.diffTable(art.querySelector('#peri-table3'), v, cite);
          paintFor(s);
        },
      };
    }
    const m = model(s[KEY]);
    const g = m.grade;
    const pd = Math.abs(m.rap - m.ipp) < 1 ? 1 : 0;      // a decimal when the two pressures are close
    const size = m.eff < 1 ? 'no effusion' : m.eff < 10 ? 'a mild (small) effusion' : m.eff <= 20 ? 'a moderate effusion' : 'a severe (large) effusion';
    let live;
    if (g === 'none') live = '<b>No pericardial effusion.</b> The visceral and parietal layers of the pericardium lie in contact. The normal pericardial sac contains 10–50 mL of fluid; a separation of the layers seen only in systole is a trivial effusion. The play control animates the progression from no effusion to tamponade.';
    else if (g !== 'tamponade') {
      live = `<b>${g[0].toUpperCase()}${g.slice(1)} pericardial effusion.</b> The echo-free space measures ${fmt(m.eff)} mm in diastole, consistent with ${size}. The pressure in the pericardial sac (${fmt(m.ipp, pd)} mmHg) remains below the RA pressure (${fmt(m.rap, pd)} mmHg), so the cardiac chambers fill normally; the IVC measures ${fmt(m.ivc, 1)} cm and collapses by ${fmt(m.collPct)}% with a sniff, and the mitral E velocity varies by ${fmt(m.mvVar)}% with respiration.${m.raCol > 0.05 ? ` The RA wall inverts briefly, for ${fmt(m.raColPct)}% of the cardiac cycle; a brief inversion alone does not indicate tamponade.` : ''}${m.swing > 0.2 ? ' The heart swings within the effusion.' : ''}`;
    } else {
      live = `<b>Tamponade.</b> The pressure in the pericardial sac (${fmt(m.ipp, pd)} mmHg) has reached the RA pressure (${fmt(m.rap, pd)} mmHg). The RA wall remains inverted for ${fmt(m.raColPct)}% of the cardiac cycle${m.raColPct > 33 ? ' (more than one third)' : ''}; ${m.rvCol > 0.2 ? 'the RV free wall collapses in early diastole' : 'the RV free wall does not yet collapse'}; the interventricular septum shifts toward the LV with each inspiration; the IVC measures ${fmt(m.ivc, 1)} cm and collapses by only ${fmt(m.collPct)}%; and with inspiration the mitral E velocity falls by ${fmt(m.mvVar)}% and the tricuspid E velocity rises by ${fmt(m.tvVar)}%. The heart rate is ${fmt(m.hr)}/min and the stroke volume ${fmt(m.sv)} mL; the inspiratory fall in systolic blood pressure is ${fmt(m.pp)} mmHg${m.pp > 10 ? ' (pulsus paradoxus)' : ''}. Tamponade is a clinical diagnosis, and these echocardiographic signs support it.`;
    }
    return {
      readouts: [
        { k: 'Effusion', v: fmt(m.eff), u: 'mm', flag: m.eff >= 10 },
        { k: 'Pericardial pressure', v: fmt(m.ipp, pd), u: 'mmHg', flag: g === 'tamponade' },
        { k: 'RA pressure', v: fmt(m.rap, pd), u: 'mmHg', flag: m.rap > 8 },
        { k: 'Heart rate', v: fmt(m.hr), u: '/min', flag: m.hr > 100 },
        { k: 'Stroke volume', v: fmt(m.sv), u: 'mL', flag: m.sv < 60 },
        { k: 'Grade', v: g, text: true, flag: g === 'tamponade' || g === 'severe' },
      ],
      live,
      extra: (art) => {
        tables(art);
        paintFor(s);
        gradeTable(art.querySelector('#peri-table'), sizeRows(m), 'Effusion size', ['Mild (small)', 'Moderate', 'Severe (large)']);
        gradeTable(art.querySelector('#peri-table2'), tampRows(m), 'Echocardiographic signs of tamponade', ['Without tamponade', 'Tamponade']);
      },
    };
  },
};
