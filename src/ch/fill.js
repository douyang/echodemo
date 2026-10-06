// Diastolic function and left atrial pressure. One slider walks the filling pattern
// from normal to restrictive and Play animates it; the 2025 ASE algorithm (sinus rhythm) runs
// on the values. The LA, the pulmonary veins and LA strain change with the grade.
// The text holds the algorithm as a diagram (Nagueh 2025, Figure 3) with ▲▼ buttons on its nine
// measurements. An edit stores the nine values in fx; the slider then marks the band of their
// grade and does not change them. A move of the slider, Play, the tour or a heart's preset clears
// fx, and the values follow the slider again.
import { Sheet, clamp, mix, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV } from '../cyclemodel.js';
import { bands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, note, LEVEL, fit } from '../sev.js';
import { MeshPanel } from '../meshpanel.js';
import { laWeight } from '../meshcal.js';
import { reducedMotion } from '../state.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { BSA } from './pressure.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-fill .live', btn, fn);
/** The slider for result g (edits.js): where it is if that is in a band of g, else the middle of the nearest band of g. */
const slideTo = (f, g) => slideOf(f, g, BANDS, 3, 100);

// Illustrative values at four points of the slider (not patient data).
const KEYS = [
  { E: 0.75, A: 0.55, DT: 190, sep: 9.0, lat: 12.0, tr: 2.3, lavi: 26, lars: 38, sd: 1.3, ivrt: 85, pvD: 0.42, ar: 0.25, lact: 14 },
  { E: 0.55, A: 0.80, DT: 260, sep: 5.0, lat: 6.5, tr: 2.4, lavi: 30, lars: 28, sd: 1.4, ivrt: 110, pvD: 0.34, ar: 0.3, lact: 14 },
  { E: 0.95, A: 0.65, DT: 170, sep: 5.0, lat: 6.5, tr: 3.0, lavi: 42, lars: 16, sd: 0.6, ivrt: 65, pvD: 0.6, ar: 0.38, lact: 6 },
  { E: 1.20, A: 0.40, DT: 130, sep: 4.0, lat: 5.0, tr: 3.3, lavi: 50, lars: 10, sd: 0.4, ivrt: 50, pvD: 0.68, ar: 0.4, lact: 2 },
];

/** The model's values at slider position f (0 to 3), before rounding. */
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

/** The nine measurements that the algorithm reads: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  sep: { d: 1, step: 0.5, min: 2, max: 16 },
  lat: { d: 1, step: 0.5, min: 3, max: 20 },
  tr: { d: 1, step: 0.1, min: 1.5, max: 4.5 },
  sd: { d: 2, step: 0.05, min: 0.2, max: 2 },
  lars: { d: 0, step: 1, min: 5, max: 50 },
  lavi: { d: 0, step: 1, min: 15, max: 80 },
  ivrt: { d: 0, step: 5, min: 30, max: 150 },
  E: { d: 2, step: 0.05, min: 0.3, max: 1.6 },
  A: { d: 2, step: 0.05, min: 0.2, max: 1.2 },
};
const IN = Object.keys(INPUTS);

/**
 * Values as reported: the nine at their decimals, and the ratios from them at theirs. The
 * algorithm judges these numbers, so a value on screen never contradicts its mark.
 */
function measure(raw) {
  const v = { ...raw };
  for (const k of IN) v[k] = round(raw[k], INPUTS[k].d);
  v.avg = round((v.sep + v.lat) / 2, 1);
  v.ea = round(v.E / v.A, 2);
  v.eeSep = round((v.E * 100) / v.sep, 1);
  v.eeLat = round((v.E * 100) / v.lat, 1);
  v.eeAvg = round((v.E * 200) / (v.sep + v.lat), 1);
  return v;
}

/** The values as printed at slider position f (chapter Automated measurements reads E, A and e′). */
export const valuesAt = (f) => measure(fillValues(f));

/** The values on screen: the edited nine (fx), or the model's at the slider. */
function shown(s) {
  if (!s.fx) return measure(fillValues(s.fstate));
  const v = { ...fillValues(s.fx.base) };
  for (const k of IN) v[k] = s.fx[k];
  return measure(v);
}

/** Abnormal by the cut-offs of Figure 3 (Nagueh 2025). */
const ABN = {
  sep: (v) => v.sep <= 6, lat: (v) => v.lat <= 7, avg: (v) => v.avg <= 6.5,
  eeSep: (v) => v.eeSep >= 15, eeLat: (v) => v.eeLat >= 13, eeAvg: (v) => v.eeAvg >= 14,
  tr: (v) => v.tr >= 2.8,
  sd: (v) => v.sd <= 0.67, lars: (v) => v.lars <= 18, lavi: (v) => v.lavi > 34,
  ivrt: (v) => v.ivrt <= 70,
};
const badOf = (v) => Object.fromEntries(Object.entries(ABN).map(([k, f]) => [k, f(v)]));

/**
 * Nagueh 2025, Figure 3: LA pressure and the grade of diastolic dysfunction. Step 1: three
 * variables. Step 2: the branch (a all normal; b reduced e′ only, E/A ≤0.8; c reduced e′ only,
 * E/A >0.8; d TR only, E/e′ only or any two; e all three). Step 3: S/D, LARS and LAVi. Step 4:
 * E/A gives the grade when the LA pressure is raised. Figure 3 lists IVRT as an alternative in
 * step 3; the model always has S/D, LARS and LAVi, so its result does not use IVRT.
 */
export function lapAlgorithm(v) {
  const eRed = ABN.sep(v) || ABN.lat(v) || ABN.avg(v);
  const eeUp = ABN.eeSep(v) || ABN.eeLat(v) || ABN.eeAvg(v);
  const trUp = ABN.tr(v);
  const n = eRed + eeUp + trUp;
  const step1 = { eRed, eeUp, trUp, n };
  const grade = v.ea >= 2 ? 3 : 2;
  if (n === 0) return { step1, branch: 'a', lap: 'normal', grade: 0, why: 'all three step 1 variables, e′, E/e′ and peak TR velocity, are normal' };
  if (n === 3) return { step1, branch: 'e', lap: 'raised', grade, why: 'all three step 1 variables, e′, E/e′ and peak TR velocity, are abnormal' };
  if (n === 1 && eRed && v.ea <= 0.8) return { step1, branch: 'b', lap: 'normal', grade: 1, why: 'reduced e′ is the only abnormal step 1 variable, and E/A is ≤0.8' };
  const branch = n === 1 && eRed ? 'c' : 'd';
  const step3 = { sd: ABN.sd(v), lars: ABN.lars(v), lavi: ABN.lavi(v) };
  if (step3.sd || step3.lars || step3.lavi) return { step1, step3, branch, lap: 'raised', grade, why: 'one or two step 1 variables are abnormal, and at least one step 3 variable is abnormal' };
  return { step1, step3, branch, lap: 'normal', grade: null, why: 'one or two step 1 variables are abnormal, and all step 3 variables are normal. The algorithm assigns no grade on this path' };
}

const GRADE = { 0: 'normal diastolic function', 1: 'grade 1 diastolic dysfunction', 2: 'grade 2 diastolic dysfunction', 3: 'grade 3 diastolic dysfunction' };
/** The outcome of Figure 3: normal function, grade 1, not graded, grade 2, grade 3. */
const outOf = (r) => (r.grade === null ? 'ng' : r.grade === 0 ? 'normal' : `g${r.grade}`);
/** The outcome's name on the slider's bands and in the readouts. */
const STAGE = { normal: 'normal', g1: 'grade 1', ng: 'not graded', g2: 'grade 2', g3: 'grade 3' };
/** The outcome as a filling pattern, for the slider's label. */
const PATTERN = { normal: 'normal', g1: 'slow relaxation', ng: 'normal LA pressure', g2: 'raised LA pressure', g3: 'restrictive' };
const gradeLabel = (f) => STAGE[outOf(lapAlgorithm(measure(fillValues(f))))];
let BANDS = [];

let sheet = null, st = null, setState = null;

/** Mitral inflow (m/s, toward the probe) for the values v: E from mitral opening, A after the P wave. */
export function inflow(v) {
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
/** Annular tissue velocity (m/s, + toward the probe) for e′ of eP cm/s: s′ in systole, e′ and a′ away from the probe. */
export function tissue(v, eP) {
  return (tt) => {
    const t = ((tt % RR) + RR) % RR;
    if (t > 70 && t < 330) return 0.08 * Math.sin(Math.PI * (t - 70) / 260) ** 0.9;
    if (t > EV.mvo - 10 && t < EV.mvo + 140) return -(eP / 100) * Math.sin(Math.PI * (t - EV.mvo + 10) / 150);
    if (t > 770 && t < RR) return -0.08 * Math.sin(Math.PI * (t - 770) / (RR - 770));
    return 0;
  };
}

// ---------------------------------------------------------------- the path in the figure
// Figure 3 in five rows and five columns: step 1; the five branches of step 2; step 3; the LA
// pressure (normal, or raised with step 4); the five outcomes. The path is lit. A box whose state
// changes flashes for FLASH ms (the sheet draws every frame while one does).
const FLASH = 1200;
let fcPrev = null, lastFlash = -1e9;
const fcFlash = {};

function arrow(sh, t, x1, y1, x2, y2, on) {
  sh.line(x1, y1, x2, y2, { width: on ? 1.8 : 1, rough: 0.3, seed: Math.round(x1 * 3 + y2), stroke: on ? t.accent : t.rule });
  const a = Math.atan2(y2 - y1, x2 - x1), k = 6;
  sh.line(x2, y2, x2 - k * Math.cos(a - 0.45), y2 - k * Math.sin(a - 0.45), { width: on ? 1.8 : 1, rough: 0.2, seed: 5, stroke: on ? t.accent : t.rule });
  sh.line(x2, y2, x2 - k * Math.cos(a + 0.45), y2 - k * Math.sin(a + 0.45), { width: on ? 1.8 : 1, rough: 0.2, seed: 6, stroke: on ? t.accent : t.rule });
}

/**
 * Lines of text centered in a box: the first form (a list of lines) that fits at size, or at
 * down to 80% of it; else the last form at 80%.
 */
function boxText(sh, t, b, forms, on, size) {
  const weight = on ? 600 : 500, room = b.w - 8;
  for (const [i, lines] of forms.entries()) {
    for (const k of [1, 0.9, 0.8]) {
      const px = size * k, lh = px * 1.18;
      const last = i === forms.length - 1 && k === 0.8;
      if (!last && (lines.length * lh > b.h - 4 || lines.some((s) => sh.measure(s, { family: SANS, size: px, weight }) > room))) continue;
      const top = b.y + b.h / 2 - (lines.length * lh) / 2 + px * 0.86;
      lines.forEach((s, j) => sh.text(s, b.x + b.w / 2, top + j * lh, { family: SANS, size: px, weight, align: 'center', color: on ? t.ink : t.ink2 }));
      return;
    }
  }
}

/**
 * A box's name, its marks (○ normal, ● abnormal, each before its variable) and a count, centered
 * on one line. The count goes first and the name next when the line does not fit.
 */
function marks(sh, t, b, pre, items, post, on, size) {
  const ctx = sh.ctx, weight = on ? 600 : 500, r = 3.3;
  const tries = [[pre, post, 1], [pre, post, 0.9], [pre, '', 1], [pre, '', 0.9], ['', '', 1], ['', '', 0.9], ['', '', 0.8]];
  for (const [i, [a, z, k]] of tries.entries()) {
    const px = size * k, gap = px * 0.75;
    const w = (s) => sh.measure(s, { family: SANS, size: px, weight });
    const parts = [...(a ? [{ s: a }] : []), ...items.map(([s, bad]) => ({ s, bad, m: true })), ...(z ? [{ s: z }] : [])];
    for (const p of parts) p.w = (p.m ? 2 * r + 3 : 0) + w(p.s);
    const total = parts.reduce((sum, p) => sum + p.w, 0) + gap * (parts.length - 1);
    if (total > b.w - 8 && i < tries.length - 1) continue;
    let x = b.x + (b.w - total) / 2;
    const y = b.y + b.h / 2;
    for (const p of parts) {
      if (p.m) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + r, y, r, 0, Math.PI * 2);
        if (p.bad) { ctx.fillStyle = t.flag; ctx.fill(); } else { ctx.strokeStyle = on ? t.ink2 : t.ink3; ctx.lineWidth = 1.2; ctx.stroke(); }
        ctx.restore();
      }
      sh.text(p.s, x + (p.m ? 2 * r + 3 : 0), y + px * 0.36, { family: SANS, size: px, weight, color: on ? t.ink : t.ink2 });
      x += p.w + gap;
    }
    return;
  }
}

function flowchart(sh, t, X, Y, Wd, Hd, v, r, now) {
  const g = Wd < 400 ? 5 : 8, cw = (Wd - 4 * g) / 5;
  const cx = (i) => X + i * (cw + g), mid = (i) => cx(i) + cw / 2;
  const vg = clamp(Hd * 0.055, 6, 24), rh = Math.min(46, (Hd - 4 * vg) / 5);
  const y0 = Y + Math.max(0, (Hd - 5 * rh - 4 * vg) / 2), ry = (i) => y0 + i * (rh + vg);
  const out = outOf(r), br = r.branch, on3 = !!r.step3, up3 = on3 && r.lap === 'raised';
  const bad = badOf(v), size = Wd < 400 ? 10 : 11, two = rh >= 2 * size * 1.18 + 4;
  const B = {
    s1: { x: X, y: ry(0), w: Wd, h: rh, on: true },
    s3: { x: cx(2) - 0.3 * cw, y: ry(2), w: 2.6 * cw + g, h: rh, on: on3 },
    lapN: { x: cx(0), y: ry(3), w: 3 * cw + 2 * g, h: rh, on: r.lap === 'normal' },
    lapR: { x: cx(3), y: ry(3), w: 2 * cw + g, h: rh, on: r.lap === 'raised' },
  };
  'abcde'.split('').forEach((k, i) => { B[`b${k}`] = { x: cx(i), y: ry(1), w: cw, h: rh, on: br === k }; });
  ['normal', 'g1', 'ng', 'g2', 'g3'].forEach((k, i) => { B[`o${k}`] = { x: cx(i), y: ry(4), w: cw, h: rh, on: out === k }; });
  // a box flashes when it lights up, or when a mark in it changes
  const sig = {
    s1: `${+r.step1.eRed}${+r.step1.eeUp}${+r.step1.trUp}`,
    s3: `${+on3}${+bad.sd}${+bad.lars}${+bad.lavi}`,
    lapR: `${+B.lapR.on}${+(v.ea >= 2)}`,
  };
  for (const [k, b] of Object.entries(B)) if (!(k in sig)) sig[k] = b.on;
  if (fcPrev && !reducedMotion) {
    for (const k of Object.keys(sig)) {
      if (sig[k] === fcPrev[k]) continue;
      if (typeof sig[k] === 'string' || sig[k]) { fcFlash[k] = now; lastFlash = now; }
    }
  }
  fcPrev = sig;
  const A = [
    ...'abcde'.split('').map((k, i) => [mid(i), ry(0) + rh, mid(i), ry(1), br === k]),
    [mid(0), ry(1) + rh, mid(0), ry(3), br === 'a'],
    [mid(1), ry(1) + rh, mid(1), ry(3), br === 'b'],
    [mid(2), ry(1) + rh, mid(2), ry(2), br === 'c'],
    [mid(3), ry(1) + rh, mid(3), ry(2), br === 'd'],
    [mid(4), ry(1) + rh, mid(4), ry(3), br === 'e'],
    [mid(2), ry(2) + rh, mid(2), ry(3), on3 && !up3],
    [mid(3), ry(2) + rh, mid(3), ry(3), up3],
    ...['normal', 'g1', 'ng', 'g2', 'g3'].map((k, i) => [mid(i), ry(3) + rh, mid(i), ry(4), out === k]),
  ];
  for (const a of A) if (!a[4]) arrow(sh, t, ...a);
  for (const a of A) if (a[4]) arrow(sh, t, ...a);
  // step 3's two ways out, named when the gap allows
  if (vg >= 13) {
    const y = ry(2) + rh + vg / 2 + 3;
    sh.text('none', mid(2) - 4, y, { family: SANS, size: 9, weight: 500, align: 'right', color: on3 && !up3 ? t.accent : t.ink3 });
    sh.text('≥1', mid(3) + 4, y, { family: SANS, size: 9, weight: 500, align: 'left', color: up3 ? t.accent : t.ink3 });
  }
  const ctx = sh.ctx;
  for (const [k, b] of Object.entries(B)) {
    sh.rect(b.x, b.y, b.w, b.h, { width: b.on ? 1.8 : 1, rough: 0.5, seed: Math.round(b.x + b.y), stroke: b.on ? t.accent : t.rule, fill: b.on ? t.accent2 : undefined, fillStyle: 'solid' });
    const age = now - (fcFlash[k] ?? -1e9);
    if (age >= 0 && age < FLASH) {
      const a = 1 - age / FLASH;
      ctx.save();
      ctx.globalAlpha = 0.9 * a;
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.globalAlpha = 0.2 * a;
      ctx.fillStyle = t.accent;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }
  const s1 = r.step1;
  marks(sh, t, B.s1, 'Step 1', [['e′', s1.eRed], ['E/e′', s1.eeUp], ['TR', s1.trUp]], `${s1.n} of 3 abnormal`, true, size + 0.5);
  marks(sh, t, B.s3, 'Step 3', [['S/D', bad.sd], ['LARS', bad.lars], ['LAVi', bad.lavi]], '', on3, size);
  const ea = v.ea.toFixed(2);
  // each box's label: forms on two lines when the row is tall enough, else on one; long to short
  const L = {
    ba: [[['All normal']], [['All normal'], ['normal']]],
    bb: [[['e′ only', 'E/A ≤0.8']], [['e′, E/A ≤0.8'], ['≤0.8']]],
    bc: [[['e′ only', 'E/A >0.8']], [['e′, E/A >0.8'], ['>0.8']]],
    bd: [[['TR or E/e′ only,', 'or any two'], ['TR, E/e′', 'or any 2']], [['TR, E/e′ or 2'], ['other']]],
    be: [[['All three']], [['All three'], ['all 3']]],
    lapN: [[['normal LA pressure'], ['normal LAP']], [['normal LA pressure'], ['normal LAP']]],
    lapR: [[['raised LA pressure', `Step 4 · E/A ${ea}`], ['raised LAP', `E/A ${ea}`]], [['raised LA pressure'], ['raised LAP']]],
    onormal: [[['normal', 'function'], ['normal']], [['normal function'], ['normal']]],
    og1: [[['grade 1']], [['grade 1']]],
    ong: [[['not graded'], ['not', 'graded']], [['not graded']]],
    og2: [[['grade 2', 'E/A <2'], ['grade 2']], [['grade 2']]],
    og3: [[['grade 3', 'E/A ≥2'], ['grade 3']], [['grade 3']]],
  };
  for (const [k, [f2, f1]] of Object.entries(L)) boxText(sh, t, B[k], two ? f2 : f1, B[k].on, size);
}

const beat = new Beat(RR);
const q2 = (x) => Math.round(x * 50) / 50;

// The four-chamber view cut from the heart mesh (meshpanel.js): the heart the page shows, with
// its left atrium scaled to the LA volume index on screen (meshcal.js).
const echo = new MeshPanel('a4c', { diseases: ['la'], redraw: () => { if (sheet) sheet.dirty = true; } });
function a4c(ctx, box, v, tt) {
  echo.draw(ctx, box, fit(box.w, 'APICAL FOUR-CHAMBER', 'A4C'), {
    tms: tt,
    disease: (heart) => ({ la: laWeight(v.lavi, heart) }),
    lines: [[`LA volume index ${Math.round(v.lavi)} mL/m²`, `LAVi ${Math.round(v.lavi)} mL/m²`]],
    names: [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
  });
}

// An edited value above a panel's range takes a larger scale; the model's values keep the first one.
function inflowPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'PW · MITRAL INFLOW');
  const bx = inner(P), scale = v.E > 1.2 ? 2 : 1.4;
  spectral(ctx, bx, { fn: (u) => inflow(v)(u * 2 * RR), scale, base: 0.92, mode: 'pw', broad: 0.1, key: `inflow|${v.E}|${v.A}|${v.DT.toFixed(1)}|${scale}`, seed: 2 });
  vscale(ctx, bx, scale, 0.92, 0.5);
  note(ctx, bx, [`E ${v.E.toFixed(2)} · A ${v.A.toFixed(2)} m/s · E/A ${v.ea.toFixed(2)} · DT ${Math.round(v.DT)} ms`, `E/A ${v.ea.toFixed(2)}`], 'top');
  return bx;
}

function tdiPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'TISSUE DOPPLER · SEPTAL | LATERAL', 'TDI · SEPT | LAT'));
  const bx0 = inner(P);
  const hw = (bx0.w - 8) / 2, scale = Math.max(v.sep, v.lat) > 16 ? 0.24 : 0.18;
  const out = [];
  for (const [i, eP, ee, name] of [[0, v.sep, v.eeSep, 'septal'], [1, v.lat, v.eeLat, 'lateral']]) {
    const bx = { x: bx0.x + i * (hw + 8), y: bx0.y, w: hw, h: bx0.h };
    spectral(ctx, bx, { fn: (u) => tissue(v, eP)(u * RR), scale, base: 0.4, mode: 'pw', broad: 0.25, key: `tdi|${name}|${eP.toFixed(2)}|${scale}`, seed: 6 + i });
    note(ctx, bx, [`e′ ${eP.toFixed(1)} · E/e′ ${ee.toFixed(1)}`, `e′ ${eP.toFixed(1)}`], 'bottom');
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
  const scale = S > 1.2 ? 2 : S > 0.9 ? 1.5 : 1;
  spectral(ctx, bx, { fn, scale, base: 0.62, mode: 'pw', broad: 0.12, key: `fpv|${S}|${D}|${Ar}|${scale}`, seed: 21 });
  vscale(ctx, bx, scale, 0.62, 0.5, '');
  note(ctx, bx, [`S/D ${v.sd.toFixed(2)} · Ar ${Math.round(v.ar * 100)} cm/s`, `S/D ${v.sd.toFixed(2)}`], 'top');
  return bx;
}

function strainPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, 'LA STRAIN');
  const bx = inner(P, 26);
  // conduit strain stays at or below half the reservoir strain, so an edited low LARS keeps the
  // curve's shape; an edited high LARS raises the top of the scale
  const L = v.lars, C = Math.min(v.lact, 0.5 * v.lars);
  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const eps = (tt) => {
    const t = ((tt % RR) + RR) % RR;
    if (t < 400) return L * smooth(t / 400);
    if (t < 650) return L - (L - C) * smooth((t - 400) / 250);
    if (t < 780) return C;
    return C * (1 - smooth((t - 780) / (RR - 780)));
  };
  const top = Math.max(45, L + 6);
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
  vscale(ctx, { x: bx.x, y: bx.y + 8, w: bx.w, h: bx.h - 14 }, (40 * top) / 45, 1, 20, '%');
  note(ctx, bx, `reservoir ${Math.round(L)}%`, 'top');
  return bx;
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const narrow = W < 700;
  const v = shown(st);
  const r = lapAlgorithm(v);
  const tt = beat.at(st.fCine, 250);
  if (narrow) {
    fcPrev = null;   // no path drawn: no change to flash when it shows again
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    a4c(ctx, a, v, tt);
    const [p1, p2] = rows(b, [1, 1], 8);
    cursor(ctx, inflowPanel(ctx, p1, v), beat.sweep);
    for (const bx of tdiPanel(ctx, p2, v)) cursor(ctx, bx, (beat.sweep * 2) % 1);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  // the path needs about 210 px; a short figure takes it from the echo view
  const vh = Math.min(colL.w * 1.05, colL.h * 0.54, colL.h - 212);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  flowchart(sh, t, colL.x, colL.y + vh + 18, colL.w, colL.h - vh - 22, v, r, performance.now());
  const [p1, p2, p3, p4] = rows(colR, [1, 0.95, 1, 0.95], 10);
  cursor(ctx, inflowPanel(ctx, p1, v), beat.sweep);
  for (const bx of tdiPanel(ctx, p2, v)) cursor(ctx, bx, (beat.sweep * 2) % 1);
  const [c1, c2] = cols(p3, [1, 1], 10);
  cursor(ctx, pvPanel(ctx, c1, v), beat.sweep);
  cursor(ctx, strainPanel(ctx, c2, v), beat.sweep);
  // TR
  panel(ctx, p4.x, p4.y, p4.w, p4.h, 'CW · TR JET');
  const bx = inner(p4), trScale = v.tr > 3.6 ? 5 : 4;
  spectral(ctx, bx, {
    fn: (u) => { const t2 = (u * 2 * RR) % RR; const w = (t2 - 20) / 400; return w > 0 && w < 1 ? -v.tr * Math.sin(Math.PI * w) ** 0.45 : 0; },
    scale: trScale, base: 0.1, mode: 'cw', broad: 0.5, key: `trfill|${v.tr.toFixed(2)}|${trScale}`, seed: 9,
  });
  vscale(ctx, bx, trScale, 0.1, 1);
  note(ctx, bx, `TR ${v.tr.toFixed(1)} m/s`, 'bottom');
  cursor(ctx, bx, beat.sweep);
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// ---------------------------------------------------------------- the algorithm in the text
const NAME = {
  sep: 'Septal e′', lat: 'Lateral e′', avg: 'Average e′', eeSep: 'Septal E/e′', eeLat: 'Lateral E/e′', eeAvg: 'Average E/e′',
  tr: 'Peak TR velocity', sd: 'PV S/D', lars: 'LARS', lavi: 'LAVi', ivrt: 'IVRT', E: 'E', A: 'A', ea: 'E/A',
};
/** Names in the change line: the cause, and an effect. */
const CAUSE = { sep: 'Septal e′', lat: 'Lateral e′', tr: 'TR', sd: 'S/D', lars: 'LARS', lavi: 'LAVi', ivrt: 'IVRT', E: 'E', A: 'A' };
const EFFECT = { sep: 'septal e′', lat: 'lateral e′', avg: 'average e′', eeSep: 'septal E/e′', eeLat: 'lateral E/e′', eeAvg: 'average E/e′', tr: 'TR', sd: 'S/D', lars: 'LARS', lavi: 'LAVi', ivrt: 'IVRT' };
const UNIT = { sep: 'cm/s', lat: 'cm/s', avg: 'cm/s', tr: 'm/s', lars: '%', lavi: 'mL/m²', ivrt: 'ms', E: 'm/s', A: 'm/s' };
const DEC = { avg: 1, eeSep: 1, eeLat: 1, eeAvg: 1, ea: 2, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };
const CUT = { sep: '≤6', lat: '≤7', avg: '≤6.5', eeSep: '≥15', eeLat: '≥13', eeAvg: '≥14', tr: '≥2.8', sd: '≤0.67', lars: '≤18%', lavi: '>34', ivrt: '≤70' };
const ARIA = { sep: 'septal e′ velocity', lat: 'lateral e′ velocity', tr: 'peak TR velocity', sd: 'pulmonary vein S/D ratio', lars: 'LA reservoir strain', lavi: 'LA volume index', ivrt: 'IVRT', E: 'mitral E velocity', A: 'mitral A velocity' };
const CRIT = { eRed: 'e′', eeUp: 'E/e′', trUp: 'TR' };
const ROWS = [...Object.keys(ABN), 'E', 'A', 'ea'];
const BRANCH = [
  ['a', 'All normal', 'normal function'],
  ['b', 'Reduced e′ only, E/A ≤0.8', 'grade 1'],
  ['c', 'Reduced e′ only, E/A >0.8', 'step 3'],
  ['d', 'TR only, E/e′ only, or any two', 'step 3'],
  ['e', 'All three', 'step 4'],
];
const RESULT = { normal: ['Normal LA pressure', 'normal function'], g1: ['Normal LA pressure', 'grade 1'], ng: ['Normal LA pressure', 'not graded'], g2: ['Raised LA pressure', 'grade 2'], g3: ['Raised LA pressure', 'grade 3'] };
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const IVRT_NOTE = 'Figure 3 lists IVRT as an alternative to S/D, LARS and LAVi. This model has all three, so IVRT does not change the result.';
const IVRT_LINE = 'IVRT does not change the result: the model has S/D, LARS and LAVi';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => x.toFixed(DEC[k]);
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : s);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const row = (k) => {
    const step = k in INPUTS;
    const btn = (dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
    return `<div class="ase-row${step ? '' : ' is-calc'}" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${step ? btn(-1) : '<i></i>'}<span class="ase-v"><b></b>${UNIT[k] ? `<small>${UNIT[k]}</small>` : ''}</span>${step ? btn(1) : '<i></i>'}</span>
      <span class="ase-cut">${CUT[k] ?? ''}</span>${k in ABN ? '<i class="ase-mk" aria-hidden="true"></i><span class="sr-only ase-st"></span>' : '<i></i>'}
    </div>`;
  };
  const crit = (c, name, keys, extra = '') => `<div class="ase-crit" data-c="${c}">
      <p class="ase-ch"><i class="ase-mk" aria-hidden="true"></i><span class="ase-cn">${name}</span>${extra}<span class="ase-cs"></span></p>
      ${keys.map(row).join('')}
    </div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">2025 ASE algorithm · sinus rhythm</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    <div class="ase-step" data-s="1">
      <p class="ase-sh"><span class="ase-sn">Step 1</span><span class="ase-sx">Three variables</span><span class="ase-count"></span></p>
      ${crit('eRed', 'Reduced e′', ['sep', 'lat', 'avg'])}
      ${crit('eeUp', 'Raised E/e′', ['eeSep', 'eeLat', 'eeAvg'], '<span class="ase-cx">E <b></b> m/s ÷ e′</span>')}
      ${crit('trUp', 'Raised peak TR velocity', ['tr'])}
    </div>
    <div class="ase-step" data-s="2">
      <p class="ase-sh"><span class="ase-sn">Step 2</span><span class="ase-sx">Abnormal variables</span></p>
      <ol class="ase-br">${BRANCH.map(([k, name, to]) => `<li data-b="${k}"><span class="ase-bn">${name}</span><span class="ase-bt">→ ${to}</span></li>`).join('')}</ol>
    </div>
    <div class="ase-step" data-s="3">
      <p class="ase-sh"><span class="ase-sn">Step 3</span><span class="ase-sx">≥1 abnormal: raised LA pressure</span></p>
      ${row('sd')}${row('lars')}${row('lavi')}
      <div class="ase-alt">${row('ivrt')}<p class="ase-note">${IVRT_NOTE}</p></div>
      <p class="ase-s3"></p>
    </div>
    <div class="ase-step" data-s="4">
      <p class="ase-sh"><span class="ase-sn">Step 4</span><span class="ase-sx">Raised LA pressure: E/A</span></p>
      ${row('E')}${row('A')}${row('ea')}
      <p class="ase-ea"><span data-g="g2">E/A &lt;2 → grade 2</span><span data-g="g3">E/A ≥2 → grade 3</span></p>
    </div>
    <div class="ase-step ase-res" data-s="5">
      <p class="ase-sh"><span class="ase-sn">Result</span></p>
      <p class="ase-og"><span class="ase-ol">Normal LA pressure</span><span class="ase-o" data-o="normal">normal function</span><span class="ase-o" data-o="g1">grade 1</span><span class="ase-o" data-o="ng">not graded</span></p>
      <p class="ase-og"><span class="ase-ol">Raised LA pressure</span><span class="ase-o" data-o="g2">grade 2</span><span class="ase-o" data-o="g3">grade 3</span></p>
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), lap: q('.ase-result b'), grade: q('.ase-result span'), change: q('.ase-change'),
    reset: q('.ase-reset'), count: q('.ase-count'), e: q('.ase-cx b'), s3: q('.ase-s3'),
    steps: Object.fromEntries([...host.querySelectorAll('.ase-step')].map((el) => [el.dataset.s, el])),
    rows: Object.fromEntries(ROWS.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), st: el.querySelector('.ase-st'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    crit: Object.fromEntries(Object.keys(CRIT).map((c) => { const el = q(`[data-c="${c}"] .ase-ch`); return [c, { el, st: el.querySelector('.ase-cs') }]; })),
    br: Object.fromEntries([...host.querySelectorAll('.ase-br li')].map((el) => [el.dataset.b, el])),
    ea: Object.fromEntries([...host.querySelectorAll('.ase-ea span')].map((el) => [el.dataset.g, el])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
    ogs: [...host.querySelectorAll('.ase-og')],
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The keys of fx that differ from the model's values where the edits started. */
function editedOf(fx) {
  const m = measure(fillValues(fx.base));
  return IN.filter((k) => Math.abs(fx[k] - m[k]) > 1e-9);
}

const freeLive = () => { const live = document.querySelector('#ch-fill .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click: the edited values and the slider at their grade, in one patch; Play and the tour stop. */
function edit(k, dir, btn = null) {
  const s = st, I = INPUTS[k];
  const base = s.fx ? s.fx.base : s.fstate;
  const cur = shown(s);
  const vals = Object.fromEntries(IN.map((q) => [q, cur[q]]));
  const from = vals[k], to = stepOf(from, I, dir);
  if (to === from) return;
  vals[k] = to;
  const was = outOf(lapAlgorithm(cur));
  const out = outOf(lapAlgorithm(shown({ fx: { ...vals, base } })));
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf({ ...vals, base }).length) setState({ fx: null, fstate: base, anim: false, playing: false });   // back at the model's values
    else setState({ fx: Object.freeze({ ...vals, base }), fstate: slideTo(s.fstate, STAGE[out]), anim: false, playing: false });
  });
  pending = null;
  if (out !== was) cue('bell');
}

function resetEdits() {
  pending = { kind: 'reset' };
  setState({ fx: null, anim: false, playing: false });
  pending = null;
  dg?.result.focus({ preventScroll: true });
}

const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };

/** The diagram at the values on screen: numbers, marks, the lit path; then what changed. */
function renderDiagram(s, v, r) {
  if (!dg) return;
  const M = { fx: !!s.fx, v, r, out: outOf(r), bad: badOf(v), ed: s.fx ? editedOf(s.fx) : [] };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  // numbers, marks, buttons
  for (const k of ROWS) {
    const R = dg.rows[k];
    txt(R.v, num(k, v[k]));
    if (k in ABN) { R.el.classList.toggle('is-bad', M.bad[k]); txt(R.st, M.bad[k] ? 'abnormal' : 'normal'); }
    if (!(k in INPUTS)) continue;
    R.el.classList.toggle('is-ed', M.ed.includes(k));
    const I = INPUTS[k];
    for (const [b, off, other] of [[R.dn, v[k] <= I.min + 1e-9, R.up], [R.up, v[k] >= I.max - 1e-9, R.dn]]) {
      if (off && document.activeElement === b) other.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  txt(dg.e, num('E', v.E));
  for (const [c, C] of Object.entries(dg.crit)) {
    C.el.classList.toggle('is-bad', r.step1[c]);
    txt(C.st, r.step1[c] ? 'abnormal' : 'normal');
  }
  txt(dg.count, `${r.step1.n} of 3 abnormal`);
  for (const [k, el] of Object.entries(dg.br)) el.classList.toggle('is-on', r.branch === k);
  const on = { 1: true, 2: true, 3: !!r.step3, 4: r.lap === 'raised', 5: true };
  for (const [k, el] of Object.entries(dg.steps)) el.classList.toggle('is-on', on[k]);
  const n3 = ['sd', 'lars', 'lavi'].filter((k) => M.bad[k]);
  txt(dg.s3, !r.step3 ? 'Not on the path.' : n3.length ? `${n3.map((k) => EFFECT[k]).join(', ')} abnormal: raised LA pressure → step 4.` : 'None abnormal: normal LA pressure, not graded.');
  for (const [g, el] of Object.entries(dg.ea)) el.classList.toggle('is-on', (v.ea >= 2) === (g === 'g3'));
  for (const [o, el] of Object.entries(dg.out)) el.classList.toggle('is-on', M.out === o);
  dg.ogs.forEach((el, i) => el.classList.toggle('is-on', (i === 0) === (r.lap === 'normal')));
  const [lap, grade] = RESULT[M.out];
  txt(dg.lap, lap);
  txt(dg.grade, grade);
  dg.result.classList.toggle('is-raised', r.lap === 'raised');
  dg.reset.classList.toggle('is-off', !M.fx);   // its room stays, so nothing moves when it shows
  // the values follow the slider: the live sentence takes its own height again
  if (!M.fx && !pending) freeLive();
  // the slider's label: main.js writes it when fstate changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="fstate"]');
  if (o) txt(o, fillPage.format.fstate(s.fstate, s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || P.out !== M.out || P.fx !== M.fx;
  if (!moved) return;
  const cause = pending || { kind: 'slider' };
  // a screen reader reads the line after an edit or Reset, not at each step of Play
  dg.change.setAttribute('aria-live', cause.kind === 'slider' ? 'off' : 'polite');
  const line = changeLine(P, M, cause);
  const now = performance.now();
  if (cause.kind !== 'slider' || line.crossed) {
    txt(dg.change, line.text);
    lineKind = cause.kind;
    if (cause.kind === 'slider') lastCross = now;
  } else if (lineKind !== 'slider' || now - lastCross > HOLD) {
    txt(dg.change, line.text);
    lineKind = 'slider-quiet';
  }
  flashChanges(P, M, cause);
}

/** The cause and effect of a change, as one line. crossed: a cut-off or the result changed. */
function changeLine(P, M, cause) {
  const flips = [];
  const head = cause.kind === 'edit' ? `${CAUSE[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}` : cause.kind === 'reset' ? 'Reset' : 'Filling pattern';
  if (P.fx && !M.fx) flips.push('edits cleared');
  if (cause.kind === 'edit') {
    // an edit names each measurement whose mark changed
    for (const k of Object.keys(ABN)) if (P.bad[k] !== M.bad[k]) flips.push(`${EFFECT[k]} ${M.bad[k] ? 'abnormal' : 'normal'}`);
  } else {
    // the slider names the step 1 variables and the step 3 variables whose marks changed
    for (const c of Object.keys(CRIT)) if (P.r.step1[c] !== M.r.step1[c]) flips.push(`${CRIT[c]} ${M.r.step1[c] ? 'abnormal' : 'normal'}`);
    for (const k of ['sd', 'lars', 'lavi']) if (P.bad[k] !== M.bad[k]) flips.push(`${EFFECT[k]} ${M.bad[k] ? 'abnormal' : 'normal'}`);
  }
  if ((P.v.ea <= 0.8) !== (M.v.ea <= 0.8)) flips.push(`E/A ${M.v.ea <= 0.8 ? '≤0.8' : '>0.8'}`);
  if ((P.v.ea >= 2) !== (M.v.ea >= 2)) flips.push(`E/A ${M.v.ea >= 2 ? '≥2' : '<2'}`);
  const crossed = flips.length > 0 || P.out !== M.out;
  const parts = [flips.length ? flips.join(', ') : 'no cut-off crossed'];
  if (P.r.step1.n !== M.r.step1.n) parts.push(`Step 1: ${M.r.step1.n} of 3 abnormal`);
  if (cause.kind === 'edit' && ['sd', 'lars', 'lavi'].includes(cause.k) && P.bad[cause.k] !== M.bad[cause.k] && !M.r.step3) parts.push('Step 3 is not on the path');
  if (cause.kind === 'edit' && cause.k === 'ivrt') parts.push(IVRT_LINE);
  parts.push(P.out === M.out ? `Result: ${STAGE[M.out]}, no change` : `Result: ${STAGE[P.out]} → ${STAGE[M.out]}`);
  return { text: `${head}: ${parts.join('. ')}.`, crossed };
}

function flashChanges(P, M, cause) {
  for (const k of Object.keys(ABN)) if (P.bad[k] !== M.bad[k]) flash(dg.rows[k].el);
  for (const c of Object.keys(CRIT)) if (P.r.step1[c] !== M.r.step1[c]) flash(dg.crit[c].el);
  if (P.r.step1.n !== M.r.step1.n) flash(dg.count);
  if (P.r.branch !== M.r.branch) flash(dg.br[M.r.branch]);
  if (!!P.r.step3 !== !!M.r.step3 || P.r.lap !== M.r.lap) flash(dg.s3);
  if ((P.v.ea >= 2) !== (M.v.ea >= 2)) flash(dg.ea[M.v.ea >= 2 ? 'g3' : 'g2']);
  if (P.out !== M.out) { flash(dg.out[M.out]); flash(dg.result); }
  // an edit: the numbers it changed pulse, so E/e′ and E/A show that they follow E and A
  if (cause.kind === 'edit') {
    for (const k of ROWS) if (P.v[k] !== M.v[k]) flash(dg.rows[k].v.parentElement, 'is-tick');
    if (P.v.E !== M.v.E) flash(dg.e.parentElement, 'is-tick');
  }
}

const fillPage = {
  key: 'fill',
  part: 'function',
  title: 'Diastolic function',
  nav: 'Diastolic',
  dwell: 16,
  defaults: { fstate: 0, fCine: true, fx: null },
  format: {
    // the algorithm's result, so the label never contradicts the result beside it
    fstate: (v, s) => PATTERN[outOf(lapAlgorithm(shown(s?.fx ? s : { fstate: v })))],
  },
  watch: ['fstate', 'fCine', 'fx'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    BANDS = bands((x) => gradeLabel(x * 3));
    paintBands(document.getElementById('fill-grades'), BANDS, LEVEL, { 'not graded': '' });
    buildDiagram(document.getElementById('fill-ase'));
    // The slider, Play, the tour or a heart's preset: the values follow the slider again. A store
    // listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (s.fx && !('fx' in ch) && ('fstate' in ch || 'pheno' in ch || ('anim' in ch && s.anim))) set({ fx: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; fcPrev = null; freeLive(); echo.start(); },
  // the heart model and the LA target load at idle, before the chapter opens (main.js warms every chapter)
  warm() { echo.start(); },
  leave() { fresh = true; fcPrev = null; freeLive(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    // the grade bell while the page plays its own sequence (main.js); the bands run 0 to 1, the slider 0 to 3
    playSeverity(dt, { anim: s.anim, f01: s.fstate / 3 }, set, 'f01', BANDS);
    // the beat, or a box of the path that is still flashing
    if ((beat.tick(dt, s.fCine) || performance.now() - lastFlash < FLASH + 100) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ fstate: 0, fx: null }); },
  tourTick(tt, set) { set({ fstate: Math.round(clamp((tt - 1.5) / 12, 0, 1) * 3 * 20) / 20, fx: null }); },
  // the time of the tour at which tourTick shows this state (its inverse): the tour continues from it
  tourAt(s) { return 1.5 + (s.fstate / 3) * 12; },
  text(s, { cite }) {
    const v = shown(s);
    const r = lapAlgorithm(v);
    const out = outOf(r);
    const verdict = r.grade === null ? 'normal LA pressure, not graded' : `${r.lap} LA pressure, ${GRADE[r.grade]}`;
    const ed = s.fx ? editedOf(s.fx) : [];
    return {
      readouts: [
        { k: 'E/A', v: fmt(v.ea, 2) },
        { k: 'Average e′', v: fmt(v.avg), u: 'cm/s', flag: ABN.avg(v) },
        { k: 'Average E/e′', v: fmt(v.eeAvg), flag: ABN.eeAvg(v) },
        { k: 'Peak TR velocity', v: fmt(v.tr, 1), u: 'm/s', flag: ABN.tr(v) },
        { k: 'LA volume index', v: fmt(v.lavi, 0), u: 'mL/m²', flag: ABN.lavi(v) },
        { k: 'Result', v: STAGE[out], text: true, flag: r.lap === 'raised' },
      ],
      live: `<b>${cap(verdict)}.</b> ${cap(r.why)}${cite('nagueh2025')}. ${ed.length ? `Edited values: ${ed.map((k) => NAME[k]).join(', ')}. ` : ''}The values are illustrative and do not come from a patient.`,
      extra: () => renderDiagram(s, v, r),
    };
  },
};
export default fillPage;
