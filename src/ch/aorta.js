// Diseases of the aorta: a switch for the disease and one slider for its severity, as the shunts
// page has (shType and shS).
// Dilation: the root and the ascending aorta on the long axis, zoomed, cut from the heart mesh and
// widened by the chapter's targets (gl/aortamesh.js) to the printed diameters (aortacal.js). The
// sinuses, the sinotubular junction and the ascending aorta are measured L-L at end-diastole, and
// the annulus I-I at midsystole (Lang 2015). The largest diameter takes the terms and thresholds of
// the 2022 ACC/AHA guideline; under the bicuspid heart, its recommendations for a bicuspid valve.
// Dissection: a reverberation that mimics a flap, then a flap in the root and the ascending aorta,
// with the true lumen expanding in systole, brisk forward flow in it, and slower, later, reversed
// flow in the false lumen. Then aortic regurgitation, whose mechanism follows the flap as it reaches
// nearer the valve: a central jet from the dilated root, an eccentric jet from a prolapsed cusp,
// and a jet beside the flap that prolapses through the valve. Then a pericardial effusion
// (Goldstein 2015; Movsowitz 2000, PMID 10987615).
// Coarctation: the suprasternal view of the arch with the narrowing just past the left subclavian
// artery and the color jet through it, continuous-wave Doppler with the diastolic tail, and pulsed-
// wave Doppler of the abdominal aorta; the criteria of the ACC/AHA (2022) and of the ESC (2020)
// side by side. The velocities, pressures and flows are teaching values set inside those criteria.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, meters, note, fit, gradeTable, shown as rnd } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { mmode } from '../bmode.js';
import { MeshPanel } from '../meshpanel.js';
import { onPlane, hingesOf, leafletsOf, blood, cavity, area, middle, sub, add, mul, dot, len, unit, perp } from '../meshjet.js';
import { rootCalipers, annulusCaliper, chords, coaCaliper, shiftOnto, diaphragmCaliper, rootFor, coaFor, COA } from '../aortacal.js';
import { annulusOf } from '../gl/prostheticmesh.js';
import { diseaseTargets } from '../model3d.js';

const KEY = 'aorS';
const TYPE = 'aorType';
const TYPES = ['dil', 'dis', 'coa'];
const typeOf = (s) => (s && TYPES.includes(s[TYPE]) ? s[TYPE] : 'dil');
const heartOf = (s) => (s && s.pheno) || 'normal';
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
/** A rise and fall over a..b with its peak at pk, 0 outside (as ch/peri.js). */
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
const MS_T = Math.round((EV.avo + EV.avc) / 2);   // ms, midsystole: the annulus's frame

// ---------------------------------------------------------------- dilation
// Stops: normal, the ascending aorta dilated (4.0 cm at 0.33), an aneurysm (4.5 cm at 0.50), the
// thresholds for surgery (5.0 cm at 0.67, 5.5 cm at 0.83), 6.0 cm. The sinuses widen behind it, to
// 6.0 cm too (5.8 cm on the Barlow heart, the most its image can show).
const DIL = tracks([0, 0.3, 0.55, 0.8, 1], { sin: [3.5, 3.65, 4.0, 4.75, 6.0], asc: [2.9, 3.85, 4.6, 5.35, 6.0] });
// Lang 2015, Table 14, men: mean and SD (cm). The normal range drawn is the mean ± 2 SD.
const NORM = { ann: [2.6, 0.3], sin: [3.4, 0.3], stj: [2.9, 0.3], asc: [3.0, 0.4] };
const range = (k) => [rnd(NORM[k][0] - 2 * NORM[k][1], 1), rnd(NORM[k][0] + 2 * NORM[k][1], 1)];
// The sinus Z score for a man aged 50-59 years with a BSA of 2.0 m²: Goldstein 2015, Table 1, mean
// 3.6 cm and upper limit of normal 4.0 cm, the upper limit 2 SD above the mean.
const ZPT = { mean: 3.6, uln: 4.0 };

/**
 * The dilation at slider position x on heart, as printed: the weights of the targets that give the
 * track's sinuses and ascending aorta to the millimetre (no smaller than the heart's own), and the
 * four diameters the image then measures (aortacal.js), rounded to the millimetre. The image is set
 * to the rounded values, so that its calipers round to them too. The grade reads the largest of the
 * sinuses and the ascending aorta.
 */
function dilAt(x, heart) {
  const m = DIL(x), R = rootFor(heart, rnd(m.sin, 1), rnd(m.asc, 1));
  const v = { type: 'dil', s: x, heart, wr: R.wr, wa: R.wa };
  v.sin = rnd(R.sin, 1);
  v.stj = rnd(R.stj, 1);
  v.asc = rnd(R.asc, 1);
  v.ann = rnd(R.ann, 1);
  v.max = Math.max(v.sin, v.asc);
  v.site = v.asc >= v.sin ? 'asc' : 'sin';
  v.z = rnd((v.sin - ZPT.mean) / ((ZPT.uln - ZPT.mean) / 2), 1);
  v.grade = v.max < 4 ? 'normal' : v.max < 4.5 ? 'dilated' : v.max < 5.5 ? 'aneurysm' : 'aneurysm ≥5.5 cm';
  return v;
}

// ---------------------------------------------------------------- dissection
// Stages along the slider: no flap; a reverberation that mimics one; the flap; the flap with aortic
// regurgitation (mild, then moderate by its vena contracta); and with a pericardial effusion.
// Along the AR stages the flap reaches nearer the valve, and the AR's mechanism follows it
// (Goldstein 2015, Table 8 and its text; Movsowitz 2000, PMID 10987615). From 0.48 the root
// dilates. From 0.56 the dilated root holds the cusps apart, and the jet is central. From 0.645 the
// flap runs down the anterior sinus to the annulus. The right coronary cusp loses its support and
// prolapses, and the jet is eccentric. From 0.78 the flap's lower part is free. It prolapses through
// the valve in diastole, and the jet runs beside it. Each change takes 0.05 of the slider.
const DIS = { art: 0.18, flap: 0.36, dil: 0.48, ar: 0.56, pro: 0.645, eff: 0.78 };
const DIS_GRADES = ['no flap', 'reverberation', 'flap', 'flap and AR', 'flap, AR and effusion'];
// the root fully dilated: the sinuses and the ascending aorta, L-L at end-diastole (cm)
const DIS_ROOT = { sin: 4.3, asc: 4.2 };
// where the flap joins the anterior wall (cm above the valve's centre): the upper sinus, then the annulus
const HP = { top: 1.4, low: 0.3 };
// the AR's mechanisms (Goldstein 2015, Table 8), by the flap's place
const MECH = { dil: 'dilated root', cusp: 'cusp prolapse', flap: 'flap prolapse' };
function disAt(x, heart) {
  const v = { type: 'dis', s: x, heart };
  const k = x < DIS.art ? 0 : x < DIS.flap ? 1 : x < DIS.ar ? 2 : x < DIS.eff ? 3 : 4;
  v.k = k;
  v.grade = DIS_GRADES[k];
  v.flap = k >= 2;
  v.artifact = k === 1;
  const u = clamp((x - DIS.ar) / (DIS.eff - DIS.ar), 0, 1), w = clamp((x - DIS.eff) / (1 - DIS.eff), 0, 1);
  v.vc = k >= 3 ? rnd(0.2 + 0.25 * u + 0.07 * w, 2) : 0;
  // AR by its vena contracta (Zoghbi 2017): <0.3 cm mild, >0.6 cm severe
  v.ar = v.vc <= 0 ? 'none' : v.vc < 0.3 ? 'mild' : v.vc <= 0.6 ? 'moderate' : 'severe';
  v.eff = k >= 4 ? rnd(4 + 5 * w) : 0;
  // the root's dilation, 0 to 1: the image is set to the printed diameters, as for the dilation
  // (aortacal.js rootFor). A heart's own larger size stays.
  v.dil = v.flap ? smooth((x - DIS.dil) / (DIS.pro - DIS.dil)) : 0;
  const R0 = rootFor(heart, 0, 0);
  const to = (own, full) => rnd(own + (Math.max(own, full) - own) * v.dil, 1);
  const R = v.dil > 0 ? rootFor(heart, to(R0.sin, DIS_ROOT.sin), to(R0.asc, DIS_ROOT.asc)) : R0;
  v.wr = R.wr;
  v.wa = R.wa;
  v.sin = rnd(R.sin, 1);
  v.stj = rnd(R.stj, 1);
  v.asc = rnd(R.asc, 1);
  // the mechanisms' shares, and the flap: where it joins the anterior wall, and its free part
  const toCusp = smooth((x - DIS.pro) / 0.05), toFlap = smooth((x - DIS.eff) / 0.05);
  v.mw = k >= 3 ? { dil: 1 - toCusp, cusp: toCusp * (1 - toFlap), flap: toFlap } : { dil: 0, cusp: 0, flap: 0 };
  v.mech = k < 3 ? null : x < DIS.pro ? 'dil' : x < DIS.eff ? 'cusp' : 'flap';
  v.hP = HP.top + (HP.low - HP.top) * toCusp;
  v.free = toFlap;
  return v;
}

// ---------------------------------------------------------------- coarctation
// From a mild narrowing (s = 0) to a severe coarctation (s = 1). At S0 every criterion turns at
// once, so that the ACC/AHA and the ESC criteria agree at every position: the mean Doppler gradient
// passes 20 mmHg, the diastolic tail and the abdominal aorta's diastolic forward flow appear, the
// arm-leg difference steps from 18 to 24 mmHg, and the narrowest lumen passes half the aorta's
// diameter at the diaphragm.
const S0 = 0.45;
// At S0 the peak velocity reaches 3.15 m/s, printed 3.2: with the tail the mean gradient passes 20
// mmHg there. The lumen passes 0.95 cm, half the aorta at the diaphragm, between S0 - 0.005 and S0.
const COA_T = tracks([0, S0, 1], { d: [1.8, 0.946, 0.6], v: [2.0, 3.15, 4.4] });
// the timing of the jet at the isthmus (ms after the R wave): the upstroke, the peak, the end
const T0 = EV.avo + 35, TP = EV.avo + 135, TE = EV.avc + 45;
const DIA = rnd(COA.diaphragm, 1);    // cm, the aorta below the diaphragm, as the image measures it

/** The CW velocity (m/s, away from the probe) across the coarctation at t ms: systole, and the diastolic tail. */
function coaV(t, vmax, tail) {
  const sys = vmax * bump(t, T0, TE, TP);
  if (!(tail > 0)) return sys;
  const dia = RR - TE + T0;
  let tl = 0;
  if (t >= TP && t <= TE) tl = tail;
  else if (t >= T0 && t < TP) tl = 0.6 * tail * (1 - (t - T0) / (TP - T0));
  else { const since = t > TE ? t - TE : t + RR - TE; tl = tail * (1 - (0.4 * since) / dia); }
  return Math.max(sys, tl);
}
/** The mean gradient (mmHg): 4V² averaged over the systolic envelope, upstroke to end. */
function meanGrad(vmax, tail) {
  let sum = 0, n = 0;
  for (let t = T0; t <= TE; t += 2) { const x = coaV(t, vmax, tail); sum += 4 * x * x; n++; }
  return sum / n;
}
/**
 * The abdominal aorta's pulsed-wave velocity (m/s, + forward) at t ms. sig 0: the normal pattern,
 * brisk systolic flow and early diastolic reversal. sig > 0, a significant coarctation: systolic
 * flow reduced and delayed as sig grows, and forward flow on through diastole.
 */
function abdV(t, sig) {
  if (!(sig > 0)) return 1.0 * bump(t, T0 + 25, T0 + 245, T0 + 85) - 0.2 * bump(t, T0 + 245, T0 + 420, T0 + 300);
  const pk = 0.78 - 0.3 * sig, tp = T0 + 150 + 70 * sig;
  const fwd = pk * bump(t, T0 + 40, TE + 120, tp);
  // the diastolic flow falls slowly from the systolic peak to the next upstroke
  const d0 = 0.16 + 0.12 * sig, since = t >= tp ? t - tp : t + RR - tp;
  return Math.max(fwd, d0 * (1 - (0.35 * since) / RR));
}

function coaAt(x) {
  const m = COA_T(x);
  const v = { type: 'coa', s: x };
  // the image set to the lumen as printed, to the millimetre
  const C = coaFor(rnd(m.d, 1));
  v.w = C.w;
  v.d = rnd(C.d, 1);
  v.dia = DIA;
  v.nar = rnd((1 - v.d / v.dia) * 100);
  v.sig = x >= S0;
  v.vmax = rnd(m.v, 1);
  v.pg = rnd(4 * v.vmax * v.vmax);
  v.tail = v.sig ? rnd(0.9 + 0.9 * (x - S0) / (1 - S0), 1) : 0;
  v.mg = rnd(meanGrad(v.vmax, v.tail));
  v.armLeg = rnd(v.sig ? 24 + 26 * (x - S0) / (1 - S0) : 4 + 14 * (x / S0));
  v.abd = v.sig ? 0.25 + 0.75 * (x - S0) / (1 - S0) : 0;
  // the criteria, each from the printed values; the figure's patient has upper-extremity
  // hypertension, normal LV function and no significant collateral flow
  v.aha = { armLeg: v.armLeg > 20, mg: v.mg > 20 };
  v.esc = { armLeg: v.armLeg >= 20, tail: v.tail > 0, abd: v.abd > 0, nar: v.nar >= 50 };
  const aha = v.aha.armLeg || v.aha.mg, esc = v.esc.armLeg || v.esc.tail;
  v.grade = aha && esc ? 'significant' : !aha && !esc ? 'not significant' : 'criteria differ';
  return v;
}

// ---------------------------------------------------------------- the values shown
function measure(x, type, heart) {
  if (type === 'dis') return disAt(x, heart);
  if (type === 'coa') return coaAt(x);
  return dilAt(x, heart);
}
let lastKey = '', lastShown = null;
/** The values on screen for state s (the figure asks every frame). */
export function shownOf(s) {
  const key = `${s[KEY]}|${typeOf(s)}|${heartOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(s[KEY], typeOf(s), heartOf(s)); }
  return lastShown;
}
export const gradeOf = (x, type = 'dil', heart = 'normal') => measure(x, type, heart).grade;

// the grades' levels for the bands, and their short names
const LEVELS = {
  normal: 0, dilated: 1, aneurysm: 3, 'aneurysm ≥5.5 cm': 4,
  'no flap': 0, reverberation: 1, flap: 3, 'flap and AR': 4, 'flap, AR and effusion': 5,
  'not significant': 1, significant: 3, 'criteria differ': 2,
};
const SHORT = {
  dilated: 'dil.', aneurysm: 'aneur.', 'aneurysm ≥5.5 cm': '≥5.5',
  'no flap': 'none', reverberation: 'artifact', 'flap and AR': '+AR', 'flap, AR and effusion': '+effusion',
  'not significant': 'not sig.', significant: 'sig.',
};
const BANDS = new Map();
function bandsFor(s) {
  const type = typeOf(s), heart = type === 'dil' ? heartOf(s) : 'any', k = `${type}|${heart}`;
  if (!BANDS.has(k)) BANDS.set(k, bands((x) => measure(x, type, heart === 'any' ? 'normal' : heart).grade));
  return BANDS.get(k);
}

let sheet = null, st = null;
const beat = new Beat(RR);

// ---------------------------------------------------------------- the views
// The zoomed long axis (plax_root) at end-diastole and at midsystole for the dilation, and as a
// cine for the dissection; the standard long axis with color for the dissection, and its effusion
// (the pericardial effusion's targets, as ch/peri.js); the suprasternal view of the arch with the
// coarctation; the subcostal view of the abdominal aorta.
const redraw = () => { if (sheet) sheet.dirty = true; };
const P_ED = new MeshPanel('plax_root', { diseases: ['aoRoot', 'aoAsc'], redraw });
const P_MS = new MeshPanel('plax_root', { diseases: ['aoRoot', 'aoAsc'], redraw });
const P_LAX = new MeshPanel('plax', { diseases: ['eff', 'effAnt', 'aoRoot', 'aoAsc'], redraw });
const P_SSN = new MeshPanel('ssn', { diseases: ['aoCoa'], redraw });
const P_SC = new MeshPanel('sc_aorta_z', { diseases: [], redraw });
const PANELS = [P_ED, P_MS, P_LAX, P_SSN, P_SC];
// the coarctation's isthmus and the left subclavian artery's stub (gl/aortamesh.js), once loaded
const ARCH = { ist: null, lsa: null, shift: new Map() };
function startAll() {
  for (const p of PANELS) p.start();
  if (!ARCH.loading) {
    ARCH.loading = diseaseTargets(['aoCoa']).then((T) => { ARCH.ist = T.aoCoa.isthmus; ARCH.lsa = T.aoCoa.lsa; redraw(); }).catch(() => {});
  }
}
// what the views drew last, for the checks (drawn())
const DRAWN = { ed: null, ms: null, coa: null, dia: null, lax: null };

/** The crossings (t > 0) of the ray from the probe along dir with the closed wall loops, sorted. */
function rayHits(loops, dir, len = 16) {
  const hits = [];
  for (const P of loops) {
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], den = dir[0] * ey - dir[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (a[0] * ey - a[1] * ex) / den, u = (a[0] * dir[1] - a[1] * dir[0]) / den;
      if (u >= 0 && u < 1 && t > 1e-6 && t < len) hits.push(t);
    }
  }
  return hits.sort((x, y) => x - y);
}

// ---------------------------------------------------------------- the dissection on the long axis
// The lumen of the root and the ascending aorta on a long-axis plane: chords square to the root's
// axis (aortacal.js chords), every 0.1 cm from 0.3 cm above the valve's centre, each from the inner
// face of the anterior wall to that of the posterior wall. A point of the lumen is at h cm along
// the axis and at the fraction u of its chord (0 at the anterior wall). The shut cusps meet about
// 1.2 cm above the valve's centre.
// The flap: the false lumen lies in front of it (the outer curve of the ascending aorta), the true
// lumen behind it. In the tubular aorta it lies at the fraction f of the lumen. In systole the true
// lumen expands and the flap moves toward the false lumen. In diastole it returns and flutters.
// Toward the root it bends to the anterior wall and joins it at hP, where the false lumen ends.
// With a free lower part (disAt), the flap leaves the lumen's fraction below FLAP.hJ. In systole
// the flow holds that part up in the root. In diastole it prolapses through the valve, just behind
// the anterior cusp's edge, into the LVOT.
// The color: in systole the true lumen has brisk forward flow, and the root below the flap too. The
// false lumen fills late and slowly from its entry tear, beyond the view, so that its flow runs
// back toward the root (Goldstein 2015, Table 7: reverse, delayed or absent). In diastole the
// lumens have no flow, and the AR jet shows. No color crosses the flap: each point takes the flow
// of its own lumen, and the jet and its convergence zone leave out the flap and its far side.
const FLAP = { dia: 0.58, sys: 0.45, uS: 0.08, turn: 1.4, hJ: 2.2, end: 1.6, w: 0.09 };
// the peak velocities along the aorta (cm/s): the true lumen's, and the false lumen's, slower and later
const V_TL = 80, V_FL = 30;
const tlFlow = (t) => bump(t, EV.avo + 10, EV.avc + 15, EV.avo + 90);           // 0..1, true lumen
const flFlow = (t) => bump(t, EV.avo + 70, EV.avc + 150, EV.avo + 190);         // 0..1, false lumen: later, slower
const flapF = (t) => FLAP.dia - (FLAP.dia - FLAP.sys) * tlFlow(t) + 0.012 * Math.sin((2 * Math.PI * t) / 95) * (1 - tlFlow(t));
const LUMEN = new WeakMap();   // ev -> the lumen's chords and the flap of its last frame

/**
 * The flap's fraction of the lumen at h (cm), where it joins the anterior wall at hP: NaN below
 * hP. Below FLAP.turn it runs down the anterior sinus, close to the wall; from there it turns
 * into the lumen, and it lies at f from 0.8 cm higher.
 */
function uFlap(h, hP, f) {
  if (h < hP) return NaN;
  const s0 = smooth((h - hP) / 0.3), s1 = smooth((h - Math.max(hP, FLAP.turn)) / 0.8);
  return FLAP.uS * s0 * (1 - s1) + f * s1;
}

/** The chord of M at h, linear between the two round it; below the first, the first moved along the axis. Null above the last. */
function chordAt(M, h, ax) {
  if (h <= M[0].h) return { ...M[0], h, C: add(M[0].C, mul(ax, h - M[0].h)) };
  if (h > M[M.length - 1].h + 1e-9) return null;
  // the chords lie every 0.1 cm from the first (aortacal.js chords)
  const i = clamp(Math.floor((h - M[0].h) / 0.1 + 1e-9) + 1, 1, M.length - 1);
  const A = M[i - 1], B = M[i], f = clamp((h - A.h) / (B.h - A.h || 1), 0, 1);
  return { h, C: add(A.C, mul(sub(B.C, A.C), f)), n: A.n, a: A.a + (B.a - A.a) * f, b: A.b + (B.b - A.b) * f };
}

/** The chord of M at h, as chordAt, with h no higher than the top chord. */
const chordIn = (M, h, ax) => chordAt(M, Math.min(h, M[M.length - 1].h), ax);

/**
 * The root's axis on the plane at systolic weight s, as aortacal.js finds it: P0 (the valve's
 * centre), ax (up the aorta) and n (across it, away from the probe). g: the frame's plane.
 */
function axisOf(ev, s, g = ev.g) {
  const A = ev.anat, q = ev.toPlane(A.point('av', 0, s), g), r = A.aorticRoot;
  const ax = unit([r.dot(g.r), r.dot(g.d)]), n = [-ax[1], ax[0]];
  return { P0: [q[0], q[1]], ax, n: n[1] < 0 ? mul(n, -1) : n };
}

/** The aortic cusps of the frame, each { pts, c }: c, the mean of its points across the root (cm, + deeper). */
function cuspsOf(valves, A) {
  return valves.filter((V) => V.valve === 'AorticValve' && V.pts.length > 2).map((V) => ({ V, pts: V.pts, c: V.pts.reduce((s, p) => s + dot(sub(p, A.P0), A.n), 0) / V.pts.length }));
}

/**
 * Where the flap passes the valve when it prolapses: just behind the edge of the anterior cusp
 * (the right coronary cusp), on its own frame. Falls back to 1.2 cm up the axis.
 */
function throughOf(ev, A) {
  const front = cuspsOf(ev.last.valves, A).filter((C) => C.c < -0.3);
  let tip = null;
  for (const C of front) for (const p of C.pts) if (!tip || dot(sub(p, A.P0), A.n) > dot(sub(tip, A.P0), A.n)) tip = p;
  return tip ? add(tip, mul(A.n, 0.07)) : add(A.P0, add(mul(A.ax, 1.2), mul(A.n, -0.1)));
}

/** The LVOT's axis on the plane at systolic weight s: unit, from the valve into the LVOT. */
function lvotAxis(ev, s) {
  const an = ev.anchors(s);
  return unit(sub(onPlane(ev, an.lvot), onPlane(ev, an.av)));
}

/**
 * The flap on the frame (plane cm), from the top of the lumen down: by its fraction of the
 * lumen to hP, where it meets the anterior wall; or, as its lower part frees (v.free), to its
 * free end: held up in the root while the valve is open, through the valve into the LVOT while
 * it is shut.
 */
function flapPath(ev, L, v, state) {
  const { M, at, f, A } = L;
  const hLow = v.free > 0 ? FLAP.hJ : v.hP, pts = [];
  for (let i = M.length - 1; i >= 0 && M[i].h > hLow + 1e-9; i--) pts.push(at(M[i], uFlap(M[i].h, v.hP, f)));
  const m0 = chordIn(M, hLow, A.ax);
  if (m0) pts.push(at(m0, uFlap(hLow, v.hP, f)));
  if (!(v.free > 0)) return pts;
  // the lower part: attached down the anterior sinus to hP, and free, blended by v.free
  const N = 12, att = [];
  for (let j = 1; j <= N; j++) {
    const h = hLow + (v.hP - hLow) * (j / N), m = chordIn(M, h, A.ax);
    if (m) att.push(at(m, uFlap(h, v.hP, f)));
  }
  const J = pts.length ? pts[pts.length - 1] : at(chordIn(M, FLAP.hJ, A.ax), f);
  const shut = clamp(1 - (state.drive ? state.drive.av : 0), 0, 1), pr = smooth((shut - 0.25) / 0.6);
  const Es = at(chordIn(M, FLAP.end, A.ax), 0.5), K = throughOf(ev, A), Ed = add(K, mul(unit(add(lvotAxis(ev, state.s), mul(A.n, 0.3))), 0.95));
  for (let j = 1; j <= N; j++) {
    const q = j / N;
    const up = add(J, mul(sub(Es, J), q));
    const down = q <= 0.55 ? add(J, mul(sub(K, J), q / 0.55)) : add(K, mul(sub(Ed, K), (q - 0.55) / 0.45));
    const fr = add(up, mul(sub(down, up), pr)), a = att[j - 1] || fr;
    pts.push(add(a, mul(sub(fr, a), v.free)));
  }
  return pts;
}

/** The chords of the root and the ascending aorta on ev's last frame, its axis, and the flap. */
function lumenOf(ev, state, v) {
  const M = chords(ev, state.s, 6);
  const at = (m, u) => add(m.C, mul(m.n, m.a + u * (m.b - m.a)));
  const L = { M, at, f: flapF(state.t ?? 0), A: M.length >= 2 ? axisOf(ev, state.s) : null, flap: [], hP: v.hP, hLow: v.free > 0 ? FLAP.hJ : v.hP };
  if (v.flap && M.length >= 3) L.flap = flapPath(ev, L, v, state);
  LUMEN.set(ev, L);
  return L;
}

/**
 * The flap seen from p (plane cm): d, the distance to it; side, < 0 on its anterior side (the false
 * lumen's); inner, false where the nearest point is one of its ends.
 */
function sideOf(L, p) {
  const P = L.flap;
  if (P.length < 2) return { d: Infinity, side: 0, inner: false };
  // where the flap keeps to its fraction of the lumen (0.3 cm above its turn, so that no part of the
  // turn lies nearer), a point far from it across its chord needs no search
  const h = dot(sub(p, L.A.P0), L.A.ax);
  if (h >= Math.max(L.hLow, Math.max(L.hP, FLAP.turn) + 0.8) + 0.3) {
    const m = chordAt(L.M, h, L.A.ax), uf = uFlap(h, L.hP, L.f);
    if (m && Number.isFinite(uf)) {
      const wd = m.b - m.a, u = (dot(sub(p, m.C), m.n) - m.a) / wd;
      if (Math.abs(u - uf) * wd > 0.3) return { d: Math.abs(u - uf) * wd, side: u - uf, inner: true };
    }
  }
  // the flap runs down the axis from its first point to its last: from the lowest segment up, stop
  // where a segment lies higher above p than the nearest point found
  const H = L.flapH || (L.flapH = P.map((q) => dot(sub(q, L.A.P0), L.A.ax)));
  let d = Infinity, q = null, inner = false;
  for (let i = P.length - 2; i >= 0; i--) {
    if (Math.min(H[i], H[i + 1]) - h > d) break;
    const a = P[i], e = sub(P[i + 1], a), l2 = dot(e, e) || 1e-12;
    const t = clamp(dot(sub(p, a), e) / l2, 0, 1), c = add(a, mul(e, t)), dc = len(sub(p, c));
    if (dc < d) { d = dc; q = c; inner = !((i === 0 && t <= 0) || (i === P.length - 2 && t >= 1)); }
  }
  return { d, side: dot(sub(p, q), L.A.n), inner };
}
/** True on the flap, within band (cm) of its centre line, and on its anterior side: no AR color goes there. */
const acrossFlap = (L, p, band) => { const S = sideOf(L, p); return S.d < band || (S.inner && S.side < 0); };

/** The crossings (t > 0) of the ray from the probe along dir with open lines (the pericardium), sorted. */
function lineHits(lines, dir, len = 16) {
  const hits = [];
  for (const L of lines) {
    const P = L.pts || L, n = P.length;
    for (let i = 0; i + 1 < n; i++) {
      const a = P[i], b = P[i + 1];
      const ex = b[0] - a[0], ey = b[1] - a[1], den = dir[0] * ey - dir[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (a[0] * ey - a[1] * ex) / den, u = (a[0] * dir[1] - a[1] * dir[0]) / den;
      if (u >= 0 && u <= 1 && t > 0.5 && t < len) hits.push(t);
    }
  }
  return hits.sort((x, y) => x - y);
}

/**
 * The reverberation: the pericardium in front of the ascending aorta is a strong reflector. On
 * each beam across the aorta, sound that returns between the probe and the pericardium draws a
 * copy of it at twice its depth, on the same beam. The copy is fainter than tissue, moves with the
 * pericardium at twice its excursion, and runs across the lumen and the aortic wall. Runs of
 * points (plane cm).
 */
function reverbLines(ev, s) {
  const loops = ev.last.tissue.filter((L) => L.closed && L.pts.length > 2).map((L) => L.pts);
  const peri = ev.last.peri || [];
  const M = chords(ev, s, 4.5).filter((m) => m.h >= 1.0);
  if (M.length < 3 || !peri.length) return [];
  const ang = (p) => Math.atan2(p[0], p[1]);
  const A = M.map((m) => ang(m.C)), a0 = Math.min(...A) - 0.05, a1 = Math.max(...A) + 0.1;
  const runs = [];
  let run = [];
  for (let a = a0; a <= a1; a += 0.004) {
    const dir = [Math.sin(a), Math.cos(a)];
    const tp = lineHits(peri, dir)[0], tw = rayHits(loops, dir)[0];
    // the pericardium in front of the first wall the beam meets, within 1.5 cm of it
    const ok = tp !== undefined && tw !== undefined && tp < tw && tw - tp < 1.5;
    if (ok) run.push(mul(dir, 2 * tp));
    else if (run.length) { if (run.length > 2) runs.push(run); run = []; }
  }
  if (run.length > 2) runs.push(run);
  return runs;
}

/** A line's name beside the longest of its runs (plane cm), in the image. */
function nameLine(c, F, runs, text) {
  const run = runs.slice().sort((a, b) => b.length - a.length)[0];
  if (!run) return;
  const [x, y] = F.P(run[Math.floor(run.length * 0.35)]);
  const vb = F.view.box;
  if (x < vb.x || x > vb.x + vb.w || y < vb.y || y > vb.y + vb.h) return;
  c.save();
  c.font = `500 10.5px ${MONO}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(8,10,12,0.85)';
  c.fillStyle = SC.cal;
  const tx = Math.min(x + 6, vb.x + vb.w - c.measureText(text).width - 4);
  c.strokeText(text, tx, y + 14);
  c.fillText(text, tx, y + 14);
  c.restore();
}

/** The dissection's own B-mode items on a long-axis frame: the flap, or the reverberation. */
function dissectionItems(ev, state, v) {
  const L = lumenOf(ev, state, v);
  const out = [];
  if (L.flap.length > 2) out.push({ lines: [L.flap], e: 9, w: FLAP.w });
  if (v.artifact) {
    const R = reverbLines(ev, state.s);
    if (R.length) out.push({ lines: R, e: -2, w: 0.08 });
  }
  return out;
}

/**
 * The cusps in diastole (EchoView.extraUnder), as the AR's mechanism sets them (v.mw). The
 * dilated root holds them apart: the anterior cusp and the posterior pieces part across the root
 * until a central gap of the vena contracta's width stays between them. The anterior (right
 * coronary) cusp prolapses below the others. Or the prolapsed flap passes just behind the
 * anterior cusp's edge, and the posterior pieces stand back from it by the gap. The edges' overlap
 * across the root is measured on the frame (the third cusp's cut piece lies at the coaptation).
 * Each cusp moves most at its free edge and not at its hinge; a piece cut away from its hinge
 * moves whole. The loops change on the plane; no items are added.
 */
function cuspHook(v) {
  return (ev, g, state, valves) => {
    const shut = clamp(1 - (state.drive ? state.drive.av : 0), 0, 1);
    if (!(shut > 0) || !(v.vc > 0)) return [];
    const A = axisOf(ev, state.s, g), W = v.mw, C = cuspsOf(valves, A);
    const cOf = (p) => dot(sub(p, A.P0), A.n), hOf = (p) => dot(sub(p, A.P0), A.ax);
    const front = C.filter((x) => x.c < -0.3), back = C.filter((x) => x.c >= -0.3);
    const edge = (L, f) => L.flatMap((x) => x.pts).filter((p) => hOf(p) > 0.6).map(cOf).reduce((m, c) => f(m, c), f === Math.max ? -Infinity : Infinity);
    const fMax = edge(front, Math.max), bMin = edge(back, Math.min);
    if (!Number.isFinite(fMax) || !Number.isFinite(bMin)) return [];
    const lap = fMax - bMin;
    // how far each side moves across at its free edge (cm, + deeper), and how far the anterior cusp drops
    const apart = Math.max(0, v.vc + lap) / 2;
    const fShift = (-apart * W.dil - 0.04 * W.flap) * shut;
    const bShift = (apart * W.dil + Math.max(0, lap + 0.04 + FLAP.w / 2 + v.vc) * W.flap) * shut;
    const drop = (v.vc + 0.15) * W.cusp * shut;
    for (const x of C) {
      const isFront = x.c < -0.3, side = isFront || x.c > 0.3;
      // across the root on the cusp's own side: largest at its hinge, smallest at its free edge
      const cs = x.pts.map((p) => (isFront ? -cOf(p) : cOf(p))), hi = Math.max(...cs), lo = Math.min(...cs);
      x.V.pts = x.pts.map((p, i) => {
        const w = side && hi - lo > 0.05 ? clamp((hi - cs[i]) / (hi - lo), 0, 1) : 1;
        if (!isFront) return add(p, mul(A.n, bShift * w));
        return add(p, add(mul(A.ax, -drop * w * w), mul(A.n, fShift * w + 0.25 * drop * w * w)));
      });
    }
    return [];
  };
}

/** The AR jet's strength through diastole, 0..1 (aortic closure to the next opening). */
function arStrength(t) {
  const TD = RR + EV.avo - EV.avc, u = (t >= EV.avc ? t - EV.avc : t + RR - EV.avc) / TD;
  return u > 0.02 && u < 0.98 ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.25) : 0;
}

/**
 * The AR jet on a shut frame, as the mechanism places it (v.mw): from the central gap between the
 * cusps, along the LVOT; from under the prolapsed cusp's edge, away from it, back toward the
 * anterior mitral leaflet (Zoghbi 2017: the cusp at fault lies opposite the jet's direction); or
 * from the gap behind the prolapsed flap, beside it. Each direction leans a little away from the
 * probe, so that its color holds through diastole. The jet stays in the LVOT, in front of the
 * anterior mitral leaflet, and in the LV. { O, dir }, and with poly also { clip, also, aml }: the
 * polygons it stays in and the leaflet's line. Null when the plane shows no cusps.
 */
function arJetOf(ev, L, v, s, poly = true) {
  const A = L.A, cusps = cuspsOf(ev.last.valves, A);
  const front = cusps.filter((C) => C.c < -0.3).flatMap((C) => C.pts), back = cusps.filter((C) => C.c >= -0.3).flatMap((C) => C.pts);
  if (!front.length || !back.length) return null;
  const an = ev.anchors(s), uL = lvotAxis(ev, s);
  const nearest = (P, q) => P.reduce((b, p) => (len(sub(p, q)) < len(sub(b, q)) ? p : b));
  // the gap between the cusps: the nearest pair of points across it
  let gA = front[0], gB = back[0], best = Infinity;
  for (const p of front) for (const q of back) { const d = len(sub(p, q)); if (d < best) { best = d; gA = p; gB = q; } }
  const mid = mul(add(gA, gB), 0.5);
  // behind the prolapsed flap: from its posterior face to the posterior pieces
  const K = add(throughOf(ev, A), mul(A.n, FLAP.w / 2));
  const midF = mul(add(K, nearest(back, K)), 0.5);
  const W = v.mw, away = (d, O) => unit(add(d, mul(unit(O), 0.25)));
  const dirs = { dil: away(uL, mid), cusp: away(unit(add(uL, mul(A.n, 0.5))), mid), flap: away(unit(add(uL, mul(A.n, 0.3))), midF) };
  const dir = unit(add(add(mul(dirs.dil, W.dil), mul(dirs.cusp, W.cusp)), mul(dirs.flap, W.flap)));
  const O = add(mul(mid, W.dil + W.cusp), mul(midF, W.flap));
  if (!poly) return { O: add(O, mul(dir, 0.04)), dir };
  const cuts = [[add(O, perp(uL)), sub(O, perp(uL))]];
  const h = hingesOf(ev, 'MitralValve');
  if (h) cuts.push(h);
  // the blood below the orifice, in front of the anterior mitral leaflet, as a point on the jet's
  // course sees it: the largest of three, as a prolapsed cusp may close a pocket round the nearest;
  // and the LV, as its middle sees it
  const aml = amlOf(ev, L), cutsA = aml ? [...cuts, [aml[1], aml[2]]] : cuts;
  let clip = [];
  for (const t of [0.5, 0.85, 1.2]) {
    const sd = seedAt(ev, add(O, mul(dir, t)), 0.3);
    if (aml && behind([aml[1], aml[2]], O, sd)) continue;
    const P = cavity(ev, sd, cutsA, 9, 96);
    if (area(P) > area(clip)) clip = P;
    if (area(clip) > 2) break;
  }
  const also = [cavity(ev, seedAt(ev, middle([onPlane(ev, an.lvot), onPlane(ev, an.lv)]), 1.2), cuts, 9, 96)];
  return { O: add(O, mul(dir, 0.04)), dir, clip, also, aml };
}

/** p itself where it lies in blood (inside no wall), else the deepest blood near it (meshjet.js blood). */
function seedAt(ev, p, r) {
  const k = ev.last.tissue.filter((W) => W.closed && W.pts.length > 2).reduce((n, W) => (inside(W.pts, p) ? n + 1 : n), 0);
  return k % 2 ? blood(ev, p, r) : p;
}

/**
 * The anterior mitral leaflet as a line on the frame: from the aorto-mitral junction (the root's
 * posterior wall at the annulus), to the leaflet's end nearest it, to its far end. Null when the
 * plane shows no mitral leaflet.
 */
function amlOf(ev, L) {
  const leaves = leafletsOf(ev, 'MitralValve');
  if (!leaves.length || !L.M.length) return null;
  const J = L.at(L.M[0], 1);
  let P = null, bd = Infinity;
  for (const Q of leaves) for (const p of Q) { const d = len(sub(p, J)); if (d < bd) { bd = d; P = Q; } }
  const a = P.reduce((b, p) => (len(sub(p, J)) < len(sub(b, J)) ? p : b));
  const b = P.reduce((m, p) => (len(sub(p, a)) > len(sub(m, a)) ? p : m));
  return [J, a, b];
}

/** True where p lies behind the line Q (beside it, on the side away from the point ref). */
function behind(Q, ref, p) {
  let d = Infinity, k = -1, t0 = 0;
  for (let i = 0; i + 1 < Q.length; i++) {
    const e = sub(Q[i + 1], Q[i]), t = clamp(dot(sub(p, Q[i]), e) / (dot(e, e) || 1e-12), 0, 1), dc = len(sub(p, add(Q[i], mul(e, t))));
    if (dc < d) { d = dc; k = i; t0 = t; }
  }
  if (k < 0 || (k === 0 && t0 <= 0) || (k === Q.length - 2 && t0 >= 1)) return false;
  const e = sub(Q[k + 1], Q[k]), cr = (q) => e[0] * (q[1] - Q[k][1]) - e[1] * (q[0] - Q[k][0]);
  return cr(p) * cr(ref) < 0;
}

/** The aortic cusps' segments on ev's frame, and a test: is p (cm) within r of one? */
function cuspNear(ev) {
  const S = leafletsOf(ev, 'AorticValve').flatMap((P) => P.map((p, i) => [p, P[(i + 1) % P.length]]));
  const xs = S.flatMap(([a]) => [a[0]]), ys = S.flatMap(([a]) => [a[1]]);
  const box = S.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : null;
  return (p, r) => {
    if (!box || p[0] < box[0] - r || p[0] > box[1] + r || p[1] < box[2] - r || p[1] > box[3] + r) return false;
    for (const [a, b] of S) {
      const e = sub(b, a), t = clamp(dot(sub(p, a), e) / (dot(e, e) || 1e-12), 0, 1);
      if (len(sub(p, add(a, mul(e, t)))) < r) return true;
    }
    return false;
  };
}

let CF = null;
/** The color of velocity vb along the beam (cm/s) at aliasing velocity nyq, wrapped past it, as echo2d.js colors its jets. */
function flowColor(vb, nyq) {
  let u = vb / nyq;
  if (Math.abs(u) > 1) u = ((((u + 1) % 2) + 2) % 2) - 1;
  const a = Math.abs(u), lo = u >= 0 ? SC.red : SC.blue, hi = u >= 0 ? SC.yellow : SC.cyan, t = Math.pow(a, 1.4);
  const dim = 0.35 + 0.65 * Math.min(1, a * 1.6);
  return lo.map((q, i) => Math.round((q + (hi[i] - q) * t) * dim));
}

/**
 * The lumens' color inside the color box e ({ t0, t1, r0, r1 }: radians from the vertical, px
 * from the apex): in each cell of about 0.8 mm, the flow of the lumen the cell lies in (flowAt,
 * cm/s on the plane, or null for none), along the beam, at the aliasing velocity NYQ.
 */
function paintLumens(ctx, F, e, flowAt) {
  const { k, sect } = F, vb0 = F.view.box;
  const corners = [];
  for (const t of [e.t0, (e.t0 + e.t1) / 2, e.t1]) for (const r of [e.r0, e.r1]) corners.push([sect.cx + r * Math.sin(t), sect.top + r * Math.cos(t)]);
  const x0 = Math.max(vb0.x, Math.min(...corners.map((p) => p[0]))), x1 = Math.min(vb0.x + vb0.w, Math.max(...corners.map((p) => p[0])));
  const y0 = Math.max(vb0.y, Math.min(...corners.map((p) => p[1]))), y1 = Math.min(vb0.y + vb0.h, Math.max(...corners.map((p) => p[1])));
  if (!(x1 > x0 && y1 > y0)) return;
  const cell = Math.max(2, k * 0.08);
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (!CF) CF = document.createElement('canvas');
  if (CF.width < W || CF.height < H) { CF.width = Math.max(CF.width, W); CF.height = Math.max(CF.height, H); }
  const g = CF.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, CF.width, CF.height);
  const img = g.createImageData(W, H), data = img.data;
  const fr = cine.live ? Math.floor(performance.now() / 45) : 0;
  let any = false;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const X = x0 + (i + 0.5) * cell, Y = y0 + (j + 0.5) * cell, dx = X - sect.cx, dy = Y - sect.top;
      const th = Math.atan2(dx, dy), r = Math.hypot(dx, dy);
      if (th < e.t0 || th > e.t1 || r < e.r0 || r > e.r1) continue;
      const p = [dx / k, dy / k], V = flowAt(p);
      if (!V) continue;
      const nz = Math.sin(i * 12.9898 + j * 78.233 + fr * 37.719) * 43758.5453;
      const vb = dot(V, unit(mul(p, -1))) * (0.9 + 0.2 * (nz - Math.floor(nz)));
      const a = Math.abs(vb) / NYQ;
      if (a < 0.1) continue;
      const col = flowColor(vb, NYQ), o = 4 * (j * W + i);
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2];
      data[o + 3] = Math.round(255 * smooth((a - 0.1) / 0.1));
      any = true;
    }
  }
  if (!any) return;
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  // cells of more than 2.5 px are smoothed. Smaller ones are drawn as they are, so that no color runs onto a thin flap.
  ctx.imageSmoothingEnabled = cell > 2.5;
  ctx.drawImage(CF, 0, 0, W, H, x0, y0, W * cell, H * cell);
  ctx.restore();
}

/**
 * The flow at p (plane cm) at t ms, a vector on the plane (cm/s), or null: up the aorta in the root
 * and the true lumen, back toward the root in the false lumen, each slowing to none at its walls
 * and at the flap; in the LVOT up to 1.2 cm below the valve, toward the valve. None on the cusps.
 * near: cuspNear(ev); lvot: the LVOT's polygon below the annulus and its axis, { P, uL }; band:
 * no color within this distance of the flap (cm).
 */
function flowOf(L, v, t, near, lvot, band) {
  const { M, A } = L, VT = V_TL * tlFlow(t), VF = V_FL * flFlow(t);
  if (VT < 1 && VF < 1) return () => null;
  const blunt = (x) => clamp(1 - Math.pow(2 * x - 1, 4), 0, 1);
  // the false lumen ends at hP, or at the flap's joint when its lower part is free
  const hEnd = v.hP + (FLAP.hJ - v.hP) * v.free;
  // the LVOT's walls and leaflets, not the line across it at the annulus
  const hOf = (p) => dot(sub(p, A.P0), A.ax);
  const edges = lvot ? lvot.P.map((p, i) => [p, lvot.P[(i + 1) % lvot.P.length]]).filter(([a, b]) => hOf(a) < M[0].h - 0.05 || hOf(b) < M[0].h - 0.05) : [];
  // the forward flow turns from the LVOT's axis to the aorta's through the valve
  const up = (h) => (lvot ? unit(add(mul(lvot.uL, -(1 - smooth((h + 0.3) / 0.9))), mul(A.ax, smooth((h + 0.3) / 0.9)))) : A.ax);
  return (p) => {
    const h = dot(sub(p, A.P0), A.ax);
    if (near(p, 0.06)) return null;
    if (h < M[0].h) {
      if (!lvot || h < -1.2 || !inside(lvot.P, p)) return null;
      let d = Infinity;
      for (const [a, b] of edges) { const e = sub(b, a), tt = clamp(dot(sub(p, a), e) / (dot(e, e) || 1e-12), 0, 1); d = Math.min(d, len(sub(p, add(a, mul(e, tt))))); }
      return mul(up(h), 0.8 * VT * smooth(d / 0.35) * smooth((h + 1.2) / 0.5));
    }
    const m = chordAt(M, h, A.ax);
    if (!m) return null;
    const wd = m.b - m.a, u = (dot(sub(p, m.C), m.n) - m.a) / wd;
    if (!(u > 0.015 && u < 0.985)) return null;
    if (!v.flap) return mul(up(h), VT * blunt(u));
    const S = sideOf(L, p);
    if (S.d < band) return null;
    if (!S.inner || S.side > 0) return mul(up(h), 0.85 * VT * blunt(u) * smooth(S.d / 0.25));
    // in front of a free lower part, the false lumen opens into the root: the root's flow fades into it
    if (h < hEnd) return mul(A.ax, 0.85 * VT * blunt(u) * smooth((hEnd - h) / 0.6));
    const dw = u * wd;
    return mul(A.ax, -VF * blunt(dw / (dw + S.d)) * smooth((h - hEnd) / 0.8));
  };
}
/** Whether p lies inside polygon P (even-odd). */
function inside(P, p) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The color box's outline, as the scanner draws it: angles t0..t1 from the vertical, radii r0..r1 px. */
function colorBox(ctx, F, e0) {
  const { sect } = F, half = (sect.deg * Math.PI) / 360;
  const e = { t0: Math.max(-half, e0.t0), t1: Math.min(half, e0.t1), r0: Math.max(4, e0.r0), r1: Math.min(sect.R, e0.r1) };
  if (!(e.t1 > e.t0 && e.r1 > e.r0)) return;
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sect.cx, sect.top, e.r0, Math.PI / 2 - e.t0, Math.PI / 2 - e.t1, true);
  ctx.arc(sect.cx, sect.top, e.r1, Math.PI / 2 - e.t1, Math.PI / 2 - e.t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
/** The extent of points P (plane cm) as a color box: angles from the vertical and radii in px, with margins. */
function extentOf(F, P, da = 0.04, dr = 0.3) {
  const q = P.map((p) => [Math.atan2(p[0], p[1]), Math.hypot(p[0], p[1])]);
  return { t0: Math.min(...q.map((x) => x[0])) - da, t1: Math.max(...q.map((x) => x[0])) + da, r0: (Math.min(...q.map((x) => x[1])) - dr) * F.k, r1: (Math.max(...q.map((x) => x[1])) + dr) * F.k };
}
const merge = (a, b) => (!a ? b : !b ? a : { t0: Math.min(a.t0, b.t0), t1: Math.max(a.t1, b.t1), r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1) });

const NYQ = 60;   // cm/s, the color scale of the dissection's long axis
/** The B-mode items, the cusps and the target weights that the long axis and the zoomed root share. */
const disOpts = (v) => ({
  disease: { aoRoot: v.wr, aoAsc: v.wa },
  extra: (ev, g, state) => dissectionItems(ev, state, v),
  under: cuspHook(v),
  extraKey: `dis|${v.s}|${v.heart}`,
});
function laxDissection(ctx, box, v, tms) {
  const e = v.eff / 10, S = v.eff > 0 ? { eff: Math.max(0, e - 0.17), effAnt: Math.max(0, e - 0.6) * 0.75 } : { eff: 0, effAnt: 0 };
  const sy = cycleAt(tms).s, o = disOpts(v);
  P_LAX.draw(ctx, box, fit(box.w, `PARASTERNAL LONG AXIS · COLOR ${NYQ} cm/s`, `PLAX · COLOR ${NYQ}`), {
    ...o, tms, disease: { ...S, ...o.disease }, sac: v.eff > 0, still: v.eff > 0 ? smooth(S.eff / 0.5) : 0, standoff: S.effAnt, deeper: S.effAnt,
    over: (c, F, ev) => {
      const L = LUMEN.get(ev);
      if (!L || !L.A || L.M.length < 3) return;
      const near = cuspNear(ev), uL = lvotAxis(ev, sy), a = arStrength(tms);
      // the LVOT below the annulus, as the blood just below the valve sees it, while it carries flow
      const lv = V_TL * tlFlow(tms) >= 1 ? cavity(ev, seedAt(ev, sub(L.A.P0, mul(L.A.ax, 0.5)), 0.3), [[L.at(L.M[0], 0), L.at(L.M[0], 1)]]) : [];
      const lvot = lv.length > 2 ? { P: lv, uL } : null;
      // the color box: the root, the ascending aorta, the top 1 cm of the LVOT, and the AR jet's whole course
      const down = mul(L.A.ax, -1.0);
      let ext = extentOf(F, [...L.M.flatMap((m) => [L.at(m, 0), L.at(m, 1)]), add(L.at(L.M[0], 0), down), add(L.at(L.M[0], 1), down)]);
      const J = v.vc > 0 ? arJetOf(ev, L, v, sy, a > 0.02) : null;
      const jl = 2.6 + 4 * v.vc;
      if (J) ext = merge(ext, extentOf(F, [J.O, add(J.O, mul(J.dir, jl)), add(J.O, mul(perp(J.dir), 0.8 * v.vc)), sub(J.O, mul(perp(J.dir), 0.8 * v.vc))], 0.06, 0.2));
      // no color within this of the flap's centre line: its half-width and a margin, at least 1.2
      // color cells, and 2.2 px past its half-width, so that no color runs onto a thin flap
      const band = Math.max(FLAP.w / 2 + 0.035, (1.2 * Math.max(2, F.k * 0.09)) / F.k, FLAP.w / 2 + 2.2 / F.k);
      paintLumens(c, F, ext, flowOf(L, v, tms, near, lvot, band));
      if (J && J.clip) {
        const q = Math.PI * (Math.max(v.vc, 0.24) / 2) ** 2 * 400, Rc = 0.35 + 0.6 * v.vc;
        // no color on the cusps, on the flap or across it, and the convergence zone only near the orifice
        const skip = (p) => near(p, 0.05) || (v.flap && acrossFlap(L, p, band)) || (dot(sub(p, J.O), J.dir) < 0 && len(sub(p, J.O)) > Rc) || (J.aml && behind(J.aml, J.O, p));
        jet(c, F, { q, va: NYQ, vc: v.vc, jl, jw: 1.5 * v.vc, a, pisa: true, O: J.O, dir: J.dir, clip: J.clip, clipOr: J.also, box: false, skip });
      }
      colorBox(c, F, ext);
      barFor(c, F, -NYQ, NYQ);
      DRAWN.lax = { t: tms, flap: L.flap.slice(), hEnd: v.hP + (FLAP.hJ - v.hP) * v.free, axis: L.A, jet: J ? { O: J.O, dir: J.dir, clip: J.clip, also: J.also, aml: J.aml } : null, map: { cx: F.sect.cx, top: F.sect.top, k: F.k, deg: F.sect.deg, depth: F.depth } };
      if (v.artifact) nameLine(c, F, reverbLines(ev, sy), 'reverberation');
    },
    names: [['prv', 'RV'], ['plv', 'LV'], ['la', 'LA']],
  });
}

/** The zoomed long axis of the root as a cine, in B-mode: the flap, or the reverberation, and the two lumens named. */
function rootDissection(ctx, box, v, tms) {
  P_MS.draw(ctx, box, fit(box.w, 'PLAX · AORTIC ROOT · ZOOM', 'PLAX · ROOT'), {
    ...disOpts(v), tms,
    over: (c, F, ev) => {
      const L = LUMEN.get(ev);
      if (!L || L.M.length < 3) return;
      // the lumens named above the flap's joint, where it keeps to its fraction of the lumen
      const m = L.M.reduce((b, x) => (Math.abs(x.h - 3.0) < Math.abs(b.h - 3.0) ? x : b));
      const u = v.flap ? uFlap(m.h, v.hP, L.f) : NaN;
      c.save();
      c.font = `600 11px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(8,10,12,0.85)';
      c.fillStyle = 'rgba(214,222,226,0.92)';
      const put = (p, s) => { const [x, y] = F.P(p); c.strokeText(s, x, y); c.fillText(s, x, y); };
      if (Number.isFinite(u)) {
        put(L.at(m, u / 2), 'FL');
        put(L.at(m, (1 + u) / 2), 'TL');
      } else put(L.at(m, 0.5), 'Ao');
      // from this window, one space higher, the pericardium's copy falls elsewhere
      if (v.artifact) nameLine(c, F, reverbLines(ev, cycleAt(tms).s), 'reverberation');
      c.restore();
    },
  });
}

// The M-mode through the ascending aorta on the long axis, about 2 cm above the valve's centre
// (the beam 34 degrees right of the sector's axis): the pericardium in front of the aorta, the
// aorta, and the pericardium behind it, at the depths of the normal heart's mesh on that beam at
// end-diastole, each moving to its end-systolic depth (cm; the aorta moves toward the probe in
// systole, the anterior pericardium hardly at all). The beam crosses the root's axis 2.3 cm above
// the valve's centre at end-diastole and 2.9 cm at end-systole. The flap lies there as the long
// axis draws it, and moves with the aorta and on its own: toward the anterior wall as the true
// lumen expands, and back, fluttering, in diastole. The reverberation lies at twice the
// pericardium's depth and moves with it, at twice its excursion. With the dilated root (disAt),
// each layer moves on the beam as the targets move it (cm per unit of weight of aoRoot, r, and of
// aoAsc, a, at end-diastole and at end-systole, measured on the normal heart's mesh).
const MM = { peri: [2.59, -0.04], ant: [3.52, 3.76, -0.43], post: [6.63, 6.88, -0.54], back: [7.08, -0.6], depth: 9 };
const MMD = { peri: { a: [-0.37, -0.57] }, ant: { a: [-1.01, -1.01] }, post: { r: [0.76, 0.37], a: [0.04, 0.12] }, back: { r: [0.92, 0.59], a: [0, 0.13] } };
function mmGeom(t, v) {
  const sy = clamp(cycleAt(t).s, 0, 1);
  const dd = (key) => {
    const D = MMD[key], at = (j) => (D.r ? D.r[j] * v.wr : 0) + (D.a ? D.a[j] * v.wa : 0);
    return at(0) + (at(1) - at(0)) * sy;
  };
  const peri = MM.peri[0] + MM.peri[1] * sy + dd('peri'), back = MM.back[0] + MM.back[1] * sy + dd('back');
  const da = MM.ant[2] * sy + dd('ant'), dp = MM.post[2] * sy + dd('post');
  const a0 = MM.ant[0] + da, a1 = MM.ant[1] + da, p0 = MM.post[0] + dp, p1 = MM.post[1] + dp;
  // the flap where the beam crosses the axis
  const f = flapF(t), uB = v.free >= 0.5 ? f : uFlap(2.32 + 0.55 * sy, v.hP, f);
  return { sy, peri, back, da, dp, a0, a1, p0, p1, flap: a1 + (Number.isFinite(uB) ? uB : f) * (p0 - a1), rev: 2 * peri };
}
function mmodeRoot(ctx, Pn, v) {
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, 'M-MODE · ASCENDING AORTA', 'M-MODE · ASC AO'));
  const B = { x: Pn.x + 6, y: Pn.y + 24, w: Pn.w - 40, h: Pn.h - 30 };
  const d1 = MM.depth;
  const layers = (u) => {
    const G = mmGeom((u * 2 * RR) % RR, v);
    const L = [
      [0, 0.5, 8, 0], [0.9, 1.3, 0, 0],
      [G.peri - 0.06, G.peri + 0.06, 12, MM.peri[1] * G.sy], [G.a0, G.a1, 6, G.da], [G.p0, G.p1, 6, G.dp], [G.back - 0.06, G.back + 0.06, 12, MM.back[1] * G.sy],
    ];
    if (v.flap) L.push([G.flap - 0.045, G.flap + 0.045, 8, G.da]);
    if (v.artifact) L.push([G.rev - 0.04, G.rev + 0.04, -2, 2 * MM.peri[1] * G.sy]);
    return L;
  };
  mmode(ctx, B, 0, d1, layers, `aormm|${v.s}|${v.heart}`);
  const pxcm = B.h / d1, yOf = (cm) => B.y + cm * pxcm;
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= d1; d += 1) {
    const y = yOf(d);
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 5 === 0 && d > 0) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  // the structures named at the strip's left edge, at their depths at end-diastole
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = 'rgba(214,222,226,0.85)';
  const G0 = mmGeom(0, v), names = [[G0.peri - 0.5, 'pericardium'], [(G0.a1 + G0.p0) / 2 - (v.flap || v.artifact ? 0.9 : 0), 'Ao']];
  for (const [d, s] of names) ctx.fillText(s, B.x + 6, yOf(d) + 3.5);
  ctx.restore();
  const avoid = [];
  if (v.flap || v.artifact) {
    // the line named in diastole, where it is still
    const t = 640, G = mmGeom(t, v), x = B.x + (t / (2 * RR)) * B.w, y = yOf(v.flap ? G.flap : G.rev);
    const text = v.flap ? 'flap' : 'reverberation';
    ctx.save();
    ctx.font = `500 10.5px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.fillText(text, x, y - 6);
    const w = ctx.measureText(text).width;
    ctx.restore();
    avoid.push({ x0: x - 2, y0: y - 18, x1: x + w + 2, y1: y - 2 });
  }
  const txt = v.flap ? ['flap moves on its own: toward the false lumen in systole', 'flap: own motion', 'flap']
    : v.artifact ? ['line at twice the pericardium depth, moves with it', 'line at 2 × pericardium depth', '2 × depth']
      : ['anterior and posterior walls move together', 'walls move together'];
  // clear of the bright near field at the top
  avoid.push({ x0: B.x, y0: B.y, x1: B.x + B.w, y1: yOf(1.5) });
  note(ctx, B, txt, 'auto', avoid);
  return B;
}

// ---------------------------------------------------------------- the dilation
function rootStill(ctx, box, v, phase) {
  const ed = phase === 'ed', P = ed ? P_ED : P_MS, tms = ed ? 0 : MS_T, sy = cycleAt(tms).s;
  const narrow = box.w < 300;
  const title = ed ? fit(box.w, 'PLAX · AORTIC ROOT · END-DIASTOLE · L-L', 'PLAX · ED · L-L') : fit(box.w, 'PLAX · AORTIC ROOT · MIDSYSTOLE · I-I', 'PLAX · MID-SYS · I-I');
  const lines = ed ? (narrow ? [`SoV ${f1(v.sin)}`, `STJ ${f1(v.stj)}`, `Asc ${f1(v.asc)}`] : [`SoV ${f1(v.sin)} cm`, `STJ ${f1(v.stj)} cm`, `Asc ${f1(v.asc)} cm`])
    : [narrow ? `Ann ${f1(v.ann)}` : `Annulus ${f1(v.ann)} cm`];
  P.draw(ctx, box, title, {
    tms, disease: { aoRoot: v.wr, aoAsc: v.wa },
    over: (c, F, ev) => {
      if (ed) {
        const K = rootCalipers(ev, sy);
        DRAWN.ed = K;
        for (const [k, x] of [['sinus', v.sin], ['stj', v.stj], ['asc', v.asc]]) if (K[k]) calLabel(c, F, K[k].ll0, K[k].ll1, f1(x));
      } else {
        const A = annulusCaliper(ev, sy, annulusOf);
        DRAWN.ms = A;
        if (A) calLabel(c, F, A.ii0, A.ii1, f1(v.ann));
      }
    },
    lines,
  });
}

/** A caliper with its value beside its middle, outlined so that it reads over the leaflets and walls. */
function calLabel(c, F, a, b, text) {
  cal(c, F, a, b, '');
  const A = F.P(a), B = F.P(b);
  c.save();
  c.font = `500 10.5px ${MONO}`;
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(8,10,12,0.85)';
  c.fillStyle = SC.cal;
  const x = (A[0] + B[0]) / 2 + 7, y = (A[1] + B[1]) / 2;
  c.strokeText(text, x, y);
  c.fillText(text, x, y);
  c.restore();
}

/** The thresholds of the 2022 ACC/AHA guideline for the largest diameter, the current one marked. */
function ladder(sh, t, box, v) {
  const ctx = sh.ctx, bav = v.heart === 'bav';
  const list = bav ? [
    [4.0, '≥4.0 cm', 'bicuspid valve: lifelong surveillance (1)'],
    [4.5, '≥4.5 cm', 'replacement at aortic valve surgery (2a)'],
    [5.0, '5.0–5.4 cm', 'surgery with a risk factor (2a)'],
    [5.5, '≥5.5 cm', 'surgery (1)'],
  ] : [
    [4.0, '4.0–4.4 cm', 'dilated'],
    [4.5, '≥4.5 cm', 'aneurysm; replacement at aortic valve surgery (2a)'],
    [5.0, '≥5.0 cm', 'surgery, experienced team (2a)'],
    [5.5, '≥5.5 cm', 'surgery (1)'],
  ];
  const cur = list.reduce((k, r, i) => (v.max >= r[0] ? i : k), -1);
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = t.ink3;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(bav ? 'ACC/AHA 2022 · BICUSPID AORTIC VALVE' : 'ACC/AHA 2022 · ROOT OR ASCENDING AORTA', box.x, box.y + 10);
  const rh = Math.min(26, (box.h - 18) / list.length), lw = box.w < 380 ? 78 : 92;
  list.forEach(([, a, b], i) => {
    const y = box.y + 18 + i * rh + rh * 0.62, on = i === cur;
    ctx.fillStyle = on ? t.flag : i < cur ? t.ink2 : t.ink3;
    ctx.font = `${on ? 600 : 500} 11px ${MONO}`;
    ctx.fillText(a, box.x, y);
    ctx.font = `${on ? 600 : 400} 12px ${SANS}`;
    ctx.fillText(b, box.x + lw, y, box.w - lw);
  });
  ctx.restore();
}

function dilMeters(sh, t, box, v) {
  const cuts = [[4.0, '4.0'], [4.5, '4.5'], [5.0, '5.0'], [5.5, '5.5']];
  meters(sh, t, box, [
    { k: 'Sinuses of Valsalva', v: v.sin, u: 'cm', d: 1, lo: 2, hi: 6.5, norm: range('sin'), cuts, bad: v.sin >= 4 },
    { k: 'Sinotubular junction', v: v.stj, u: 'cm', d: 1, lo: 2, hi: 6.5, norm: range('stj'), cuts: [], bad: v.stj > range('stj')[1] },
    { k: 'Ascending aorta', v: v.asc, u: 'cm', d: 1, lo: 2, hi: 6.5, norm: range('asc'), cuts, bad: v.asc >= 4 },
    { k: 'Annulus', v: v.ann, u: 'cm', d: 1, lo: 2, hi: 6.5, norm: range('ann'), cuts: [], bad: v.ann > range('ann')[1] },
    { k: 'Sinus Z score', v: v.z, u: '', d: 1, lo: -3, hi: 12, norm: [-2, 2], cuts: [[2, '2']], bad: v.z >= 2 },
  ], { row: 30 });
}

/**
 * The aorta's profile: the four diameters from the annulus up, over the normal range of each (Lang
 * 2015, men, mean ± 2 SD), with the thresholds of the 2022 ACC/AHA guideline for the sinuses and
 * the ascending aorta.
 */
function profile(sh, t, box, v) {
  if (box.h < 90) return;
  const ctx = sh.ctx;
  const L = [['ann', 'Annulus', v.ann], ['sin', 'Sinuses', v.sin], ['stj', 'STJ', v.stj], ['asc', 'Ascending', v.asc]];
  const lo = 1.5, hi = 6.5;
  const x0 = box.x + 30, x1 = box.x + box.w - 96, y0 = box.y + 22, y1 = box.y + box.h - 24;
  const X = (i) => x0 + (i / 3) * (x1 - x0), Y = (d) => y1 - ((clamp(d, lo, hi) - lo) / (hi - lo)) * (y1 - y0);
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = t.ink3;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PROFILE · ANNULUS I-I AT MIDSYSTOLE, THE REST L-L AT END-DIASTOLE', box.x, box.y + 10);
  // the scale, every centimetre
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (let d = 2; d <= 6; d++) {
    ctx.beginPath(); ctx.moveTo(x0 - 6, Y(d)); ctx.lineTo(x1 + 6, Y(d)); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(String(d), x0 - 10, Y(d) + 3.5);
  }
  // the normal range of each site
  ctx.fillStyle = t.accent2;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  L.forEach(([k], i) => { const y = Y(range(k)[1]); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); });
  L.slice().reverse().forEach(([k], j) => ctx.lineTo(X(3 - j), Y(range(k)[0])));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // the thresholds, across the sinuses and the ascending aorta
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = t.flag;
  ctx.fillStyle = t.flag;
  ctx.textAlign = 'left';
  for (const [d, name] of [[4.0, 'dilated'], [4.5, 'aneurysm'], [5.5, 'surgery']]) {
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(X(1) - 14, Y(d)); ctx.lineTo(x1 + 6, Y(d)); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(`${d.toFixed(1)} ${name}`, x1 + 10, Y(d) + 3.5);
  }
  ctx.setLineDash([]);
  // the measured diameters
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  L.forEach(([, , d], i) => { if (i) ctx.lineTo(X(i), Y(d)); else ctx.moveTo(X(i), Y(d)); });
  ctx.stroke();
  ctx.textAlign = 'center';
  L.forEach(([k, name, d], i) => {
    const bad = (k === 'sin' || k === 'asc') ? d >= 4 : d > range(k)[1];
    ctx.fillStyle = bad ? t.flag : t.ink;
    ctx.beginPath(); ctx.arc(X(i), Y(d), 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.paper; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = `${bad ? 600 : 500} 11px ${MONO}`;
    ctx.fillText(d.toFixed(1), X(i), Y(d) - 9);
    ctx.font = `500 11px ${SANS}`;
    ctx.fillStyle = t.ink2;
    ctx.fillText(name, X(i), y1 + 16);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- the coarctation
/** The suprasternal plane's shift onto the isthmus (cm), found from a frame of the heart shown. */
function ssnShift(ev) {
  if (!ev || !ARCH.ist) return 0;
  const k = ev.model.pheno.version;
  if (!ARCH.shift.has(k) && ev.g && ev.last) ARCH.shift.set(k, rnd((ev.shift || 0) + shiftOnto(ev.g, ARCH.ist.C), 3));
  return ARCH.shift.get(k) ?? 0;
}
function ssnView(ctx, box, v, tms) {
  const ev = P_SSN.ev, sh = ssnShift(ev);
  const pending = ev && ARCH.ist && !ARCH.shift.has(ev.model.pheno.version);
  P_SSN.draw(ctx, box, fit(box.w, 'SUPRASTERNAL · AORTIC ARCH · COLOR 60 cm/s', 'SSN · COLOR 60'), {
    tms, disease: { aoCoa: v.w }, shift: sh,
    over: (c, F, e) => {
      if (pending) { redraw(); return; }
      if (!ARCH.ist) return;
      const K = coaCaliper(e, ARCH.ist);
      DRAWN.coa = K;
      if (!K) return;
      const O = mul(add(K.p0, K.p1), 0.5), down = mul(K.ax, -1);
      // the jet through the narrowing in systole, aliasing at 60 cm/s; the flow converges above it
      const a = clamp(coaV(tms, v.vmax, v.tail) / v.vmax, 0, 1);
      const cut = [[add(K.p0, mul(K.n, -0.6)), add(K.p1, mul(K.n, 0.6))]];
      const clip = cavity(e, blood(e, add(O, mul(down, 1.4)), 0.5), cut);
      const pclip = cavity(e, blood(e, add(O, mul(down, -1.4)), 0.5), cut);
      jet(c, F, { q: Math.PI * (v.d / 2) ** 2 * v.vmax * 100, va: 60, vc: v.d, jl: 2.2 + 2 * (1 - v.d / 2.4), jw: Math.min(1.8, v.d * 1.4), a: Math.max(a, 0.03), O, dir: down, clip, pclip });
      barFor(c, F, -60, 60);
      // the continuous-wave beam from the probe through the narrowing
      const far = add(O, mul(unit(O), 3)), A = F.P([0, 0]), Bq = F.P(far);
      c.save();
      c.clip(F.clipBox);
      c.strokeStyle = SC.cal;
      c.globalAlpha = 0.7;
      c.setLineDash([2, 4]);
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); c.stroke();
      c.restore();
      // the caliper, its value beyond its outer end, clear of the jet
      cal(c, F, K.p0, K.p1, '', { solid: true });
      const ends = [F.P(K.p0), F.P(K.p1)], E = ends[0][0] > ends[1][0] ? ends[0] : ends[1];
      c.save();
      c.font = `500 10.5px ${MONO}`;
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(8,10,12,0.85)';
      c.fillStyle = SC.cal;
      const label = `${f1(v.d)} cm`, lx = Math.min(E[0] + 8, F.view.box.x + F.view.box.w - c.measureText(label).width - 4);
      c.strokeText(label, lx, E[1]);
      c.fillText(label, lx, E[1]);
      c.restore();
    },
    names: [['asc', 'Asc Ao'], ['desc', 'Desc Ao'], [(e) => (ARCH.lsa ? onPlane(e, ARCH.lsa) : null), 'LSA']],
  });
}

/** Where the pulsed-wave gate sits on the subcostal view: 1.2 cm toward the feet from the caliper. */
const gateOf = (D) => add(D.C, mul(D.dir, -1.2));
function scView(ctx, box, v, tms) {
  P_SC.draw(ctx, box, fit(box.w, 'SUBCOSTAL · ABDOMINAL AORTA', 'SC · ABD AO'), {
    tms,
    over: (c, F, ev) => {
      const D = diaphragmCaliper(ev);
      DRAWN.dia = D;
      if (!D) return;
      cal(c, F, D.p0, D.p1, `${f1(v.dia)} cm`);
      // the pulsed-wave gate: two short bars across the beam
      const G = gateOf(D), b = unit(G), n = perp(b);
      c.save();
      c.strokeStyle = SC.cal;
      c.lineWidth = 1.4;
      for (const k of [-0.12, 0.12]) {
        const p = F.P(add(G, add(mul(b, k), mul(n, -0.22)))), q = F.P(add(G, add(mul(b, k), mul(n, 0.22))));
        c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
      }
      c.restore();
    },
    names: [['liver', 'liver'], ['abdao', 'Abd Ao']],
  });
}

function cwCoa(ctx, Pn, v) {
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, 'CW · DESCENDING AORTA · FROM THE SUPRASTERNAL NOTCH', 'CW · DESC AO'));
  const bx = inner(Pn), base = 0.1, vs = 5;
  const fn = (u) => -coaV((u * 2 * RR) % RR, v.vmax, v.tail);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.35, key: `aorcw|${v.vmax}|${v.tail}`, seed: 91 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X(TP), yp = y0 + v.vmax * k;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(xp - 12, yp); ctx.lineTo(xp + 12, yp); ctx.stroke();
  ctx.restore();
  const avoid = [{ x0: xp - 14, y0: yp - 6, x1: xp + 14, y1: yp + 6 }];
  if (v.tail > 0) {
    // the diastolic tail named under the envelope in the first beat's diastole
    const t = 640, x = X(t), y = y0 + coaV(t, v.vmax, v.tail) * k + 14;
    ctx.save();
    ctx.font = `500 10.5px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.textAlign = 'center';
    ctx.fillText('diastolic tail', x, y);
    const w = ctx.measureText('diastolic tail').width;
    ctx.restore();
    avoid.push({ x0: x - w / 2 - 2, y0: y - 11, x1: x + w / 2 + 2, y1: y + 3 });
  }
  note(ctx, bx, [`peak ${f1(v.vmax)} m/s · ${v.pg} mmHg · mean ${v.mg} mmHg`, `${f1(v.vmax)} m/s · mean ${v.mg} mmHg`, `mean ${v.mg} mmHg`], 'auto', avoid);
  return bx;
}

function pwAbd(ctx, Pn, v) {
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, 'PW · ABDOMINAL AORTA', 'PW · ABD AO'));
  const bx = inner(Pn), vs = 1.5;
  // forward flow toward the feet: its sign on the beam from the subcostal view's geometry
  const D = DRAWN.dia, sgn = D ? (dot(D.dir, gateOf(D)) >= 0 ? 1 : -1) : 1;
  const base = sgn > 0 ? 0.7 : 0.3;
  const fn = (u) => sgn * abdV((u * 2 * RR) % RR, v.abd);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.12, key: `aorabd|${rnd(v.abd, 2)}|${sgn}`, seed: 92 });
  vscale(ctx, bx, vs, base, 0.5);
  note(ctx, bx, v.abd > 0
    ? ['reduced, delayed systolic flow · forward flow in diastole', 'delayed systole · diastolic forward flow', 'diastolic forward flow']
    : ['brisk systolic flow · early diastolic reversal', 'brisk systole · early reversal', 'normal pattern'], sgn > 0 ? 'bottom' : 'top');
  return bx;
}

function coaMeters(sh, t, box, v) {
  meters(sh, t, box, [
    { k: 'Narrowest lumen', v: v.d, u: 'cm', d: 1, lo: 0, hi: 2.5, cuts: [[v.dia / 2, '½ diaphragm']], bad: v.nar >= 50 },
    { k: 'Mean gradient, Doppler', v: v.mg, u: 'mmHg', lo: 0, hi: 50, cuts: [[20, '20']], bad: v.mg > 20 },
    { k: 'Arm–leg difference', v: v.armLeg, u: 'mmHg', lo: 0, hi: 60, cuts: [[20, '20']], bad: v.armLeg >= 20 },
    { k: 'Peak velocity', v: v.vmax, u: 'm/s', d: 1, lo: 0, hi: 5, cuts: [], bad: false },
  ], { row: 34 });
}

// ---------------------------------------------------------------- the figure
function head(sh, t, x, y, text) {
  const ctx = sh.ctx;
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = t.ink3;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shownOf(st);
  const narrow = W < 700;
  const all = { x: 6, y: 6, w: W - 12, h: H - 12 };
  const colL = { x: 16, y: 14, w: W * 0.5 - 16, h: H - 26 };
  const colR = { x: W * 0.515, y: 14, w: W * 0.485 - 16, h: H - 26 };
  if (v.type === 'dil') {
    if (narrow) {
      const [a, b] = rows(all, [1, 1], 8);
      rootStill(ctx, a, v, 'ed');
      rootStill(ctx, b, v, 'ms');
      return;
    }
    const [a, b] = rows(colL, [1, 1], 10);
    rootStill(ctx, a, v, 'ed');
    rootStill(ctx, b, v, 'ms');
    // the diameters to scale, the thresholds, and the aorta's profile from the annulus up
    const mh = 18 + 5 * 30, lh = 18 + 4 * 22;
    let y = colR.y + 4;
    head(sh, t, colR.x, y + 10, 'DIAMETERS · NORMAL RANGE: LANG 2015, MEN, MEAN ± 2 SD');
    dilMeters(sh, t, { x: colR.x, y: y + 18, w: colR.w, h: mh - 18 }, v);
    y += mh + 22;
    ladder(sh, t, { x: colR.x, y, w: colR.w, h: lh }, v);
    y += lh + 24;
    profile(sh, t, { x: colR.x, y, w: colR.w, h: colR.y + colR.h - y }, v);
    return;
  }
  if (v.type === 'dis') {
    // the still frame: diastole for the reverberation and the AR, systole for the lumens' flow
    const tms = beat.at(true, v.artifact ? 600 : v.vc > 0 ? 560 : 190);
    const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : tms / (2 * RR));
    if (narrow) {
      const [a, b] = rows(all, [1.7, 1], 8);
      laxDissection(ctx, a, v, tms);
      mark(mmodeRoot(ctx, b, v));
      return;
    }
    laxDissection(ctx, { ...colL, h: colL.h }, v, tms);
    const [r1, r2] = rows(colR, [1, 1.1], 10);
    mark(mmodeRoot(ctx, r1, v));
    rootDissection(ctx, r2, v, tms);
    return;
  }
  const tms = beat.at(true, 230);
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : tms / (2 * RR));
  if (narrow) {
    const [a, b] = cols(all, [1.15, 1], 8);
    const [a1, a2] = rows(a, [1.2, 1], 8);
    ssnView(ctx, a1, v, tms);
    scView(ctx, a2, v, tms);
    const [b1, b2] = rows(b, [1, 1], 8);
    for (const bx of [cwCoa(ctx, b1, v), pwAbd(ctx, b2, v)]) mark(bx);
    return;
  }
  const [a1, a2] = rows(colL, [1.25, 1], 10);
  ssnView(ctx, a1, v, tms);
  scView(ctx, a2, v, tms);
  const [r1, r2, r3] = rows(colR, [1.1, 1, 0.85], 12);
  for (const bx of [cwCoa(ctx, r1, v), pwAbd(ctx, r2, v)]) mark(bx);
  head(sh, t, r3.x, r3.y + 14, 'MEASUREMENTS');
  coaMeters(sh, t, { x: r3.x, y: r3.y + 20, w: r3.w, h: r3.h - 20 }, v);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** A Z score as printed, with a minus sign. */
const zOf = (z) => (Number.isFinite(z) ? `${z < 0 ? '−' : ''}${Math.abs(z).toFixed(1)}` : '–');
const SITE = { sin: 'aortic root', asc: 'ascending aorta' };

function liveDil(v, cite) {
  // the sites at the grade's lower limit: the sinuses, the ascending aorta, or both
  const lim = v.grade === 'dilated' ? 4.0 : 4.5, both = v.sin >= lim && v.asc >= lim;
  const where = both ? 'aortic root and ascending aorta' : SITE[v.site];
  const lead = v.grade === 'normal' ? 'Normal aortic root and ascending aorta'
    : v.grade === 'dilated' ? `Dilated ${where}, ${f1(v.max)} cm`
      : `Aneurysm of the ${where}, ${f1(v.max)} cm`;
  const g = cite('isselbacher2022');
  let s = `<b>${lead}.</b> At end-diastole, L-L, the sinuses measure ${f1(v.sin)} cm, the STJ ${f1(v.stj)} cm and the ascending aorta ${f1(v.asc)} cm. The annulus measures ${f1(v.ann)} cm, I-I at midsystole.`;
  s += ` For a man aged 50–59 years with a BSA of 2.0 m², the sinus Z score is ${zOf(v.z)}; a Z score of 2 or more is dilated${cite('goldstein2015')}.`;
  if (v.heart === 'bav') {
    // the bicuspid heart: the recommendations for a bicuspid aortic valve alone
    s += ' This heart has a bicuspid aortic valve.';
    if (v.max >= 5.5) s += ` Surgery is indicated at 5.5 cm or more, as with a tricuspid valve (class 1)${g}.`;
    else if (v.max >= 5.0) s += ` At 5.0–5.4 cm, surgery is reasonable with a risk factor for dissection (2a), and may be reasonable without one at low surgical risk (2b)${g}.`;
    else if (v.max >= 4.5) s += ` At aortic valve surgery, replacement of a root or ascending aorta of 4.5 cm or more is reasonable with experienced surgeons (2a)${g}.`;
    else if (v.max >= 4.0) s += ` From 4.0 cm, lifelong surveillance imaging is recommended (class 1)${g}.`;
    else s += ` Lifelong surveillance imaging is recommended from 4.0 cm (class 1)${g}.`;
    return s;
  }
  if (v.grade === 'dilated') s += ` A diameter of 4.0–4.4 cm is dilated; an aneurysm starts at 4.5 cm${g}.`;
  else if (v.max >= 5.5) s += ` In an asymptomatic patient, surgery is indicated at 5.5 cm or more (class 1)${g}.`;
  else if (v.max >= 5.0) s += ` Surgery is reasonable at 5.0 cm or more when performed by experienced surgeons in a Multidisciplinary Aortic Team (2a); it is indicated at 5.5 cm (class 1)${g}.`;
  else if (v.grade === 'aneurysm') s += ` An aneurysm starts at 4.5 cm. At surgery on a tricuspid aortic valve, replacement of an ascending aorta of 4.5 cm or more is reasonable with experienced surgeons (2a)${g}.`;
  return s;
}

function liveDis(v, cite) {
  if (v.k === 0) return `<b>No dissection flap.</b> One lumen runs from the root up the ascending aorta. In systole, color fills it from wall to wall.`;
  if (v.k === 1) return `<b>Reverberation, not a flap.</b> The line lies at twice the depth of the pericardium in front of the aorta. It moves with the pericardium, not on its own, and it runs across the lumen into the posterior wall. In systole, color fills the lumen on both sides of it. Reverberations, especially in the ascending aorta, can mimic a flap${cite('goldstein2015')}.`;
  const g = cite('goldstein2015'), z = cite('zoghbi2017');
  let s = `<b>Dissection flap${v.k >= 3 ? ` with ${v.ar} AR` : ''}${v.k >= 4 ? ' and a pericardial effusion' : ''}.</b> A mobile flap divides the lumen. The true lumen, behind it here, expands in systole, and the flap moves toward the false lumen. In systole the true lumen has brisk forward flow (red). Flow in the false lumen is slower and later, and here it runs back toward the root (blue)${g}. No color crosses the flap.`;
  const size = `L-L at end-diastole, the sinuses measure ${f1(v.sin)} cm, the STJ ${f1(v.stj)} cm and the ascending aorta ${f1(v.asc)} cm`;
  if (v.k === 2 && v.dil > 0) s += ` The root is dilating: ${size}. The cusps still close.`;
  if (v.mech === 'dil') s += ` The root has dilated: ${size}. The flap stays above the cusps, but the wider root holds them apart, and they do not close in the centre. The AR jet is central, down the LVOT${g}.`;
  if (v.mech === 'cusp') s += ` The flap now runs down the anterior sinus to the annulus. The right coronary cusp loses its support and prolapses below the other cusps in diastole${g}. The AR jet is eccentric. It starts under the posterior cusp's edge and runs back onto the anterior mitral leaflet, away from the prolapsed cusp${z}.`;
  if (v.mech === 'flap') s += ` The flap's lower part is now free. In diastole it prolapses through the valve into the LVOT and keeps the cusps apart. The AR jet passes behind the flap and runs beside it, not through it${g}. In systole the flow pushes the flap back into the root.`;
  if (v.k >= 3) s += ` The jet's vena contracta is ${fmt(v.vc, 2)} cm: ${v.ar}${z}. AR occurs in about 50% of type A dissections${g}.`;
  if (v.k >= 4) s += ` The effusion measures ${fmt(v.eff)} mm. In ascending dissection, an effusion indicates a poor prognosis and suggests rupture of the false lumen into the pericardium${g}.`;
  return s;
}

function liveCoa(v, cite) {
  const where = 'just distal to the left subclavian artery';
  if (!v.sig) {
    return `<b>Coarctation, not significant.</b> The isthmus narrows to ${f1(v.d)} cm, ${where}. CW Doppler: peak ${f1(v.vmax)} m/s, peak gradient ${v.pg} mmHg, mean gradient ${v.mg} mmHg; the velocity returns to the baseline in diastole. The abdominal aorta shows brisk systolic flow and early diastolic reversal. The arm–leg difference is ${v.armLeg} mmHg. Neither the ACC/AHA nor the ESC criteria are met${cite('isselbacher2022,baumgartner2020')}.`;
  }
  return `<b>Significant coarctation.</b> The isthmus narrows to ${f1(v.d)} cm, ${where}: ${v.nar}% narrower than the aorta at the diaphragm. CW Doppler: peak ${f1(v.vmax)} m/s, mean gradient ${v.mg} mmHg, and the gradient persists into diastole, the diastolic tail${cite('goldstein2015')}. The abdominal aorta shows reduced, delayed systolic flow and forward flow in diastole${cite('goldstein2015')}. The arm–leg difference is ${v.armLeg} mmHg. The ACC/AHA criteria are met by the arm–leg difference and the mean gradient${cite('isselbacher2022')}; the ESC criteria by the arm–leg difference and the diastolic tail${cite('baumgartner2020')}.`;
}

function tablesFor(art, v) {
  const t1 = art.querySelector('#aor-table'), t2 = art.querySelector('#aor-table2');
  const show = (el, on) => { const w = el && el.closest('.table-wrap'); if (w) w.hidden = !on; };
  if (v.type === 'dil') {
    const c = v.max < 4 ? -1 : v.max < 4.5 ? 0 : v.max < 5 ? 1 : v.max < 5.5 ? 2 : 3;
    gradeTable(t1, [
      ['Term', ['Dilated', 'Aneurysm', 'Aneurysm', 'Aneurysm'], c],
      ['Tricuspid aortic valve', ['–', 'Replacement reasonable at aortic valve surgery, experienced team (2a)', 'Surgery reasonable, experienced team (2a)', 'Surgery indicated (1)'], c],
      ['Bicuspid aortic valve', ['Lifelong surveillance imaging (1)', 'Replacement reasonable at aortic valve surgery, experienced team (2a)', 'Surgery reasonable with a risk factor (2a); may be reasonable without one, at low surgical risk (2b)', 'Surgery indicated (1)'], c],
    ], 'The largest diameter of the root or the ascending aorta (ACC/AHA 2022), in an asymptomatic patient', ['4.0–4.4 cm', '4.5–4.9 cm', '5.0–5.4 cm', '≥5.5 cm']);
    show(t1, true);
    show(t2, false);
  } else if (v.type === 'dis') {
    gradeTable(t1, [
      ['Size and motion', ['Expands in systole, collapses in diastole', 'Larger in diastole'], -1],
      ['Flow', ['Forward in systole; a systolic jet directed away from it', 'Reversed, delayed or absent'], -1],
      ['Contents', ['No spontaneous contrast', 'Spontaneous contrast or thrombus'], -1],
      ['Color Doppler', ['Brighter', 'Duller: slower flow'], -1],
    ], 'True and false lumen (Goldstein 2015, Table 7 and text)', ['True lumen', 'False lumen']);
    gradeTable(t2, [
      ['Vena contracta', ['<0.3 cm', '0.3–0.6 cm', '>0.6 cm'], v.vc <= 0 ? -1 : v.vc < 0.3 ? 0 : v.vc <= 0.6 ? 1 : 2],
    ], 'Aortic regurgitation (Zoghbi 2017)');
    show(t1, true);
    show(t2, true);
  } else {
    const on = (x) => (x ? 1 : 0);
    gradeTable(t1, [
      ['Arm–leg systolic pressure difference', ['≤20 mmHg', '>20 mmHg'], on(v.aha.armLeg)],
      ['Mean gradient, Doppler', ['≤20 mmHg', '>20 mmHg; >10 mmHg with reduced LV function or significant collateral flow'], on(v.aha.mg)],
      ['Peak-to-peak gradient, catheter', ['≤20 mmHg', '>20 mmHg; >10 mmHg with reduced LV function or significant collateral flow'], -1],
    ], 'ACC/AHA 2022, Table 37: significant coarctation, with upper-extremity hypertension or LVH and one of these', ['Not met', 'Met']);
    gradeTable(t2, [
      ['Arm–leg systolic pressure difference', ['<20 mmHg', '≥20 mmHg'], on(v.esc.armLeg)],
      ['Descending aorta, CW Doppler', ['No diastolic tail', 'Diastolic tail'], on(v.esc.tail)],
      ['Abdominal aorta, PW Doppler', ['No diastolic forward flow', 'Diastolic forward flow'], on(v.esc.abd)],
      ['Peak-to-peak gradient, catheter, without well-developed collaterals', ['<20 mmHg', '≥20 mmHg'], -1],
    ], 'ESC 2020: significant coarctation. Doppler gradients are not used to quantify it', ['Not met', 'Met']);
    show(t1, true);
    show(t2, true);
  }
}

const aortaPage = {
  key: 'aorta',
  part: 'aorta',
  title: 'Diseases of the aorta',
  nav: 'Aorta',
  dwell: 30,
  defaults: { aorS: 0.6, aorType: 'dil' },
  format: {
    aorS: (x, s) => {
      const type = s ? typeOf(s) : 'dil';
      const v = measure(x, type, type === 'dil' ? heartOf(s) : 'normal');
      if (type === 'dil') return v.grade === 'normal' ? `normal, ${f1(v.max)} cm` : `${v.grade === 'aneurysm ≥5.5 cm' ? 'aneurysm' : v.grade}, ${f1(v.max)} cm`;
      return v.grade;
    },
  },
  watch: ['aorS', 'aorType', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    paintFor(state);
  },
  onState(s, ch) {
    if (TYPE in ch || 'pheno' in ch) paintFor(s);
  },
  // the heart model and the targets load at idle, before the chapter opens (main.js warms every chapter)
  enter() { startAll(); },
  warm() { startAll(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, bandsFor(s));
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: the dilation from normal to 6.0 cm, the dissection from no flap through the
  // reverberation to the flap with AR and an effusion, the coarctation from mild to severe
  tourEnter(set) { set({ aorS: 0, aorType: 'dil' }); },
  tourTick(tt, set) {
    const at = (t0) => Math.round(clamp((tt - t0) / 9, 0, 1) * 200) / 200;
    if (tt < 10) set({ aorType: 'dil', aorS: at(0.5) });
    else if (tt < 20) set({ aorType: 'dis', aorS: at(10.5) });
    else set({ aorType: 'coa', aorS: at(20.5) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse): the sequence continues from it
  tourAt(s) { const t0 = { dil: 0.5, dis: 10.5, coa: 20.5 }[typeOf(s)]; return t0 + s.aorS * 9; },
  text(s, { cite }) {
    const v = shownOf(s);
    if (typeof document !== 'undefined') {
      // the slider's label and bands: main.js writes the label when aorS changes; the switch and the heart can change it alone
      const o = document.querySelector('output[data-for="aorS"]'), t = aortaPage.format.aorS(s[KEY], s);
      if (o && o.textContent !== t) o.textContent = t;
      paintFor(s);
    }
    let readouts, live;
    if (v.type === 'dil') {
      readouts = [
        { k: 'Sinuses of Valsalva', v: f1(v.sin), u: 'cm', flag: v.sin >= 4 },
        { k: 'Sinotubular junction', v: f1(v.stj), u: 'cm', flag: v.stj > range('stj')[1] },
        { k: 'Ascending aorta', v: f1(v.asc), u: 'cm', flag: v.asc >= 4 },
        { k: 'Annulus', v: f1(v.ann), u: 'cm', flag: v.ann > range('ann')[1] },
        { k: 'Sinus Z score', v: zOf(v.z), flag: v.z >= 2 },
        { k: 'Grade', v: v.grade === 'aneurysm ≥5.5 cm' ? 'aneurysm, ≥5.5 cm' : v.grade, text: true, flag: v.max >= 4 },
      ];
      live = liveDil(v, cite);
    } else if (v.type === 'dis') {
      readouts = [
        { k: 'Flap', v: !v.flap ? (v.artifact ? 'reverberation' : 'none') : v.free >= 0.5 ? 'prolapses' : v.hP <= HP.low + 0.05 ? 'to the annulus' : 'mobile flap', text: true, flag: v.flap },
        { k: 'AR mechanism', v: v.mech ? MECH[v.mech] : '–', text: true, flag: v.vc > 0 },
        { k: 'AR vena contracta', v: v.vc > 0 ? fmt(v.vc, 2) : '–', u: v.vc > 0 ? 'cm' : '', flag: v.vc > 0 },
        { k: 'AR grade', v: v.ar, text: true, flag: v.vc > 0 },
        { k: 'Pericardial effusion', v: v.eff > 0 ? fmt(v.eff) : '–', u: v.eff > 0 ? 'mm' : '', flag: v.eff > 0 },
        { k: 'Stage', v: v.grade, text: true, flag: v.flap },
      ];
      live = liveDis(v, cite);
    } else {
      readouts = [
        { k: 'Narrowest lumen', v: f1(v.d), u: 'cm', flag: v.nar >= 50 },
        { k: 'Peak velocity', v: f1(v.vmax), u: 'm/s', flag: false },
        { k: 'Peak gradient', v: fmt(v.pg), u: 'mmHg', flag: false },
        { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: v.mg > 20 },
        { k: 'Diastolic tail', v: v.tail > 0 ? 'present' : 'none', text: true, flag: v.tail > 0 },
        { k: 'Arm–leg difference', v: fmt(v.armLeg), u: 'mmHg', flag: v.armLeg >= 20 },
        { k: 'Grade', v: v.grade, text: true, flag: v.sig },
      ];
      live = liveCoa(v, cite);
    }
    return { readouts, live, extra: (art) => tablesFor(art, v) };
  },
};

let painted = '';
function paintFor(s) {
  if (typeof document === 'undefined') return;
  const type = typeOf(s), k = `${type}|${type === 'dil' ? heartOf(s) : ''}`;
  if (k === painted) return;
  painted = k;
  paintBands(document.getElementById('aor-grades'), bandsFor(s), LEVELS, SHORT);
}

/**
 * For the checks: each view's EchoView, and what it drew last: the root's three L-L calipers at
 * end-diastole, the annulus at midsystole, the coarctation's narrowest lumen and the aorta below
 * the diaphragm; and on the dissection's long axis, the flap, the root's axis, the AR jet's
 * orifice and direction, and the plane's mapping to the figure (cm to px).
 */
export function drawn() {
  return { views: { ed: P_ED.ev, ms: P_MS.ev, lax: P_LAX.ev, ssn: P_SSN.ev, sc: P_SC.ev }, ...DRAWN };
}

export default aortaPage;
