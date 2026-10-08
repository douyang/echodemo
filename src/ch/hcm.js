// Hypertrophic cardiomyopathy: one slider from a normal heart to severe obstructive HCM, a switch
// for rest or the strain phase of the Valsalva maneuver, and a switch for the frame. Along the
// slider the anterior septum thickens at the base and in the middle of the LV while the posterior
// wall stays normal; the anterior mitral leaflet moves toward the septum in systole (SAM), first
// without contact, then with contact for a longer share of systole; the LV outflow tract (LVOT)
// gradient rises, late-peaking on CW Doppler; the leaflets part, with a posteriorly directed MR
// jet; the LV is small and hyperdynamic, and the LA enlarges. Valsalva brings contact earlier and
// raises the gradient: latent obstruction lies between the two switch positions.
//
// The echo views are cut from the heart mesh (meshpanel.js) with the targets of gl/hcmmesh.js,
// set from the printed values by the tables of hcmcal.js, measured on each heart: the septum at
// the printed thickness (hcmSep), the leaflet at the printed SAM-septal gap through systole
// (hcmSam, a move within the beat), the LA at the printed volume index (la) and, on the normal
// heart, the LV smaller at end-systole for the printed LVEF (lvSize, a move). The M-mode and the
// Doppler strips are drawn from the same values. The gradient follows the contact as Pollick 1984
// found it; the tracks are illustrative values set inside the guideline grades, not patient data.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper, tagBox } from '../scope.js';
import { RR, EV, cycleAt, lvotV } from '../cyclemodel.js';
import { tracks, lazyBands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit, gradeTable, shown as rnd } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { mmode } from '../bmode.js';
import { MeshPanel } from '../meshpanel.js';
import { laWeight, LA_BASE } from '../meshcal.js';
import { blood, cavity, onPlane, middle, area, plaxCalipers, sub, add, mul, dot, unit, perp, len } from '../meshjet.js';
import { upOf, mvHinges, samGap, mvGapPoint, ownIvs, pwOf, sepWeight, lvidAt, efAt, esFor, samDrawn, natGap, samWeight, minGap } from '../hcmcal.js';
import { numOf } from '../order.js';

const KEY = 'hcmS';
const PROV = 'hcmProv';
const FRAME = 'hcmFrame';

// ---------------------------------------------------------------- the model
// Times (ms from the R wave, the cycle model's beat): ejection from aortic opening to closure;
// SAM starts at the start of ejection (Sherrid 2000 found it 71 ms after the Q wave, at a normal
// LVOT velocity); without contact it is largest from 230 to 290 ms; contact ends at 330 ms; the
// leaflet is back by 400 ms, before the mitral valve opens.
const ET = EV.avc - EV.avo;
const T_ON = 60, T_PK = 230, T_HOLD = 290, T_E = 330, T_OFF = 400;
// the SAM-septal gap without contact: the share of 24 mm (about the leaflet's own gap to the
// septum in the model) that SAM leaves; contact draws a gap of 0.4 mm
const GAP_REF = 24, TOUCH = 0.4;
// the SAM index: below 1 the leaflet nears the septum; from 1 it touches it, for a share of
// ejection that grows 0.75 per unit of the index
const F_PER = 0.75;
// the middle of the latent band on the normal heart, where the tour holds for Valsalva
const LATENT = 0.53;

// The tracks over the slider: the anterior septum (mm), the SAM index at rest and with Valsalva,
// the LA volume index (mL/m²), the LVEF (%; the normal heart's image shows it, the other hearts
// keep their own) and the LA pressure (mmHg; it sets the MR velocity).
const STOPS = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.86, 1];
const TRK = tracks(STOPS, {
  ivs: [9, 11, 13, 15, 17.5, 19.5, 21.5, 23.5, 25],
  sigR: [0, 0, 0, 0.3, 0.6, 1.25, 1.45, 1.68, 1.86],
  sigV: [0, 0, 0, 0.55, 1.24, 1.5, 1.68, 1.82, 1.95],
  lavi: [25, 25, 26, 28, 31, 34, 37, 41, 44],
  ef: [63, 63, 64, 66, 68, 70, 72, 75, 77],
  lap: [8, 8, 8, 9, 10, 11, 12, 14, 15],
});

/** SAM from its index: none; a gap (mm, the least in systole); or contact for a share f of ejection. */
function samOf(sig) {
  if (!(sig > 0.02)) return { kind: 'none', sig: 0, d: null, f: 0 };
  if (sig < 1) return { kind: 'gap', sig, d: rnd(GAP_REF * (1 - sig)), f: 0 };
  return { kind: 'contact', sig, d: 0, f: Math.max(1, rnd(100 * Math.min(0.75, (sig - 1) * F_PER))) / 100 };
}
/**
 * The LVOT gradient (mmHg) that goes with SAM (Pollick 1984): below 10 mmHg without contact; with
 * contact, 25 × (contact time ÷ time from SAM onset to contact) + 25, the study's regression.
 * The first 4% of contact rises from 9 mmHg to the regression's 25.
 */
function gradOf(sam) {
  if (sam.kind === 'none') return 4;
  if (sam.kind === 'gap') return 4 + 5 * sam.sig;
  const D = sam.f * ET, Tc = T_E - D - T_ON;
  return (sam.f < 0.04 ? 9 + 16 * (sam.f / 0.04) : 25) + (25 * D) / Tc;
}
/** The vena contracta of the SAM-related MR (cm): none without SAM; 0.30 cm at first contact. */
function vcOf(sam) {
  if (sam.kind === 'none') return 0;
  if (sam.kind === 'gap') return 0.1 + 0.2 * sam.sig;
  return 0.3 + 0.3 * (sam.f / 0.75);
}
// The image's reach: the least SAM-septal gap (mm) that a heart draws at septal weight w through
// the times ts, the largest of the least gaps (hcmcal.js minGap). Contact shows within 1 mm.
const REACH = 1.0;
const reachOf = (heart, w, ts) => Math.max(...ts.map((t) => minGap(heart, w, t)));
/**
 * SAM sm as heart's image draws it at septal weight w: none where the fold is not drawn (the
 * Barlow heart); a gap no wider than the leaflet's own and no narrower than the image's least;
 * contact only for the share of systole, ending at 330 ms, through which the image reaches the
 * septum, else the least gap.
 */
function drawable(sm, heart, w) {
  if (!samDrawn(heart)) return samOf(0);
  if (sm.kind === 'none') return sm;
  const PL = [T_PK, (T_PK + T_HOLD) / 2, T_HOLD];
  const plateau = Math.max(1, Math.ceil(reachOf(heart, w, PL)));
  if (sm.kind === 'gap') {
    const own = Math.floor(Math.min(...PL.map((t) => natGap(heart, w, t))));
    return sm.d > own ? samOf(1 - own / GAP_REF) : sm.d >= plateau ? sm : samOf(1 - plateau / GAP_REF);
  }
  let fMax = 0;
  for (let k = 1; k <= Math.round(sm.f * 100); k++) {
    const f = k / 100, ts = [T_E];
    for (let t = T_E - f * ET; t < T_E; t += 10) ts.push(t);
    if (reachOf(heart, w, ts) > REACH) break;
    fMax = f;
  }
  if (fMax >= sm.f - 1e-9) return sm;
  return fMax > 0 ? samOf(1 + fMax / F_PER) : samOf(1 - plateau / GAP_REF);
}
const MR_GRADE = (vc) => (vc <= 0 ? 'none' : vc < 0.3 ? 'mild' : vc < 0.7 ? 'moderate' : 'severe');
const SAM_GRADE = (sm) => (sm.kind === 'none' ? 'none' : sm.kind === 'gap' ? (sm.d > 10 ? 'mild' : 'moderate') : sm.f < 0.3 ? 'moderate' : 'severe');

const heartOf = (s) => s.pheno || 'normal';
const provOf = (s) => (s[PROV] === 'valsalva' ? 'valsalva' : 'rest');

/**
 * The values at slider position x on heart, as printed: the septum is the track's or the heart's
 * own, whichever is thicker; the posterior wall, the LV diameter and the LVEF are the image's;
 * the gradients are 4V² of the printed peak velocities. The grades read these numbers. withMr
 * false leaves out the MR's peak, which the grade does not need (the bands ask for many grades).
 */
function measure(x, heart, withMr = true) {
  const m = TRK(x);
  const v = { s: x, heart };
  v.ivs = Math.max(rnd(m.ivs), rnd(ownIvs(heart)));
  v.w = sepWeight(heart, v.ivs);
  v.pw = rnd(pwOf(heart));
  v.ratio = rnd(v.ivs / v.pw, 2);
  v.lvid = rnd(lvidAt(heart, v.w));
  v.es = esFor(heart, v.w, m.ef);
  v.ef = rnd(efAt(heart, v.w, v.es));
  v.lavi = Math.max(rnd(m.lavi), rnd(LA_BASE[heart] ?? LA_BASE.normal));
  v.lap = m.lap;
  for (const [k, sig] of [['rest', m.sigR], ['valsalva', m.sigV]]) {
    const sm = drawable(samOf(sig), heart, v.w);
    const vel = rnd(Math.sqrt(gradOf(sm) / 4), 1);
    const vc = rnd(vcOf(sm), 2);
    v[k] = { sam: sm, samGrade: SAM_GRADE(sm), vel, grad: rnd(4 * vel * vel), vc, mr: MR_GRADE(vc) };
  }
  if (withMr) for (const k of ['rest', 'valsalva']) Object.assign(v[k], peaksOf(v, v[k]));
  v.grade = gradeOfV(v);
  return v;
}
/** The page's grade from the printed values: the wall, then obstruction at rest or with Valsalva. */
function gradeOfV(v) {
  if (v.ivs < 13) return 'wall <13 mm';
  if (v.ivs < 15) return 'wall 13–14 mm';
  if (v.rest.grad >= 30) return 'obstruction at rest';
  if (v.valsalva.grad >= 30) return 'latent obstruction';
  return 'wall ≥15 mm';
}
const LEV = { 'wall <13 mm': 0, 'wall 13–14 mm': 1, 'wall ≥15 mm': 2, 'latent obstruction': 3, 'obstruction at rest': 4 };
const SHORT = { 'wall <13 mm': '<13 mm', 'wall 13–14 mm': '13–14', 'wall ≥15 mm': '≥15 mm', 'latent obstruction': 'latent', 'obstruction at rest': 'at rest' };

let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = `${s[KEY]}|${heartOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(s[KEY], heartOf(s)); }
  return lastShown;
}
export const gradeOf = (x, heart = 'normal') => measure(x, heart, false).grade;
/**
 * The Doppler model at slider position x on heart, with maneuver prov: the printed values (v),
 * the maneuver's state (P) and, as functions of the time in ms from the R wave, the LVOT and MR
 * velocities (m/s) and the LV and aortic pressures (mmHg). The figure draws the same; tools and
 * checks read it.
 */
export function dopplerAt(x, heart = 'normal', prov = 'rest') {
  const v = measure(x, heart), P = v[prov];
  return { v, P, lvot: (t) => lvotAt(P, t), mr: (t) => mrAt(v, P, t), lvp: (t) => lvpAt(P, t), aop: (t) => aopAt(P, t) };
}

// ---------------------------------------------------------------- SAM through the beat
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The contact's start and end (ms), or null without contact. */
const contactOf = (sm) => (sm.kind === 'contact' ? [T_E - sm.f * ET, T_E] : null);
/**
 * The SAM-septal gap (mm) at time tms for SAM sm, from the leaflet's own gap g0 (no SAM): it
 * narrows from the start of ejection, to the printed gap at 230-290 ms, or to contact from the
 * contact's start to 330 ms; then the leaflet goes back by 400 ms. Null: no SAM at that time.
 */
function gapAt(sm, g0, tms) {
  const t = ((tms % RR) + RR) % RR;
  if (sm.kind === 'none' || t <= T_ON || t >= T_OFF) return null;
  if (sm.kind === 'gap') {
    const d = Math.min(sm.d, g0);
    const r = t < T_PK ? smooth((t - T_ON) / (T_PK - T_ON)) : t <= T_HOLD ? 1 : 1 - smooth((t - T_HOLD) / (T_OFF - T_HOLD));
    return g0 - (g0 - d) * r;
  }
  const [tc] = contactOf(sm);
  if (t < tc) return Math.max(TOUCH, g0 * (1 - smooth((t - T_ON) / (tc - T_ON))));
  if (t <= T_E) return TOUCH;
  return Math.max(TOUCH, g0 * smooth((t - T_E) / (T_OFF - T_E)));
}

// ---------------------------------------------------------------- the Doppler envelopes
/**
 * LVOT velocity (m/s, toward the aorta) at time t for the state P (rest or Valsalva): the normal
 * outflow, peak 1.0 m/s early in ejection; with contact, a dagger: a slow rise in early systole, an
 * abrupt rise from about the contact's start and a peak in mid-to-late systole, 55% of the way
 * through contact, then a fast fall to the end of ejection (Nagueh 2022). Without contact, a
 * low, rounded peak in mid-systole.
 */
function lvotAt(P, t) {
  t = ((t % RR) + RR) % RR;
  const base = lvotV(t, 1.0), V = P.vel, sm = P.sam;
  if (t < EV.avo || t > EV.avc + 8) return 0;
  if (V <= 1.0) return base * V;
  if (sm.kind !== 'contact') {
    const u = (t - EV.avo) / (EV.avc + 8 - EV.avo);
    return Math.max(base, V * Math.pow(Math.sin(Math.PI * u), 1.4));
  }
  const [tc] = contactOf(sm), tp = tc + 0.55 * (T_E - tc), ta = Math.max(EV.avo, tc - 40), tend = EV.avc + 8;
  let g = 0;
  if (t >= ta && t <= tp) g = Math.pow((t - ta) / (tp - ta), 2.4);
  else if (t > tp && t < tend) g = Math.pow(Math.cos((Math.PI / 2) * ((t - tp) / (tend - tp))), 0.7);
  return Math.max(base, V * g);
}
// The SAM-related MR starts when SAM parts the leaflets: halfway from the SAM's onset to the
// contact (at least 100 ms), or to the SAM's peak without contact; it lasts to 430 ms, in
// isovolumic relaxation. MR often begins in isovolumic contraction, but in HCM it may begin only
// as SAM parts the leaflets, in mid-to-late systole (Nagueh 2022). SAM-related MR is typically
// mid-to-late systolic (Ommen 2024).
const MR_OFF = 430;
const mrOn = (sm) => (sm.kind === 'contact' ? Math.max(100, (T_ON + contactOf(sm)[0]) / 2) : (T_ON + T_PK) / 2);

// ---------------------------------------------------------------- the pressures
// With SAM the LV systolic pressure is a rounded curve that peaks in mid-systole, and the aortic
// pressure is the LV pressure less the LVOT gradient (4v², Bernoulli). So the aortic pressure
// rises early (the spike), falls below the cycle model's as the gradient peaks, when the flow
// ebbs and the aortic valve notches (Nagueh 2022), and recovers as the gradient falls (the dome).
// The MR velocity comes from the LV pressure, so it peaks with it, before the LVOT velocity.
// The curve: the cycle model's LV pressure plus a bump over ejection, A × b(t), with b(tb) = 1,
// held by a soft minimum under the spike limit: the cycle model's aortic pressure plus AO_SWING
// plus the gradient, at its running maximum up to the gradient's peak. On the five hearts the
// aortic pressure so rises at most 22.5 mmHg above the cycle model's. A is the least that keeps
// it at most AO_SWING below. tb starts at 190 ms, and at least 35 ms after the MR starts, so the
// MR rises to its peak; the chapter takes the tb whose curve has one peak, earliest.
const T_MID = 190, AO_SWING = 20, SOFT = 2.5;
const B0 = EV.avo, B1 = EV.avc + 30, E_END = EV.avc + 8, DT = 2;
/** The bump: 0 at aortic opening, 1 at tb, 0 at 30 ms after aortic closure. */
function bumpAt(t, tb) {
  if (t <= B0 || t >= B1) return 0;
  const g = Math.log(0.5) / Math.log((tb - B0) / (B1 - B0));
  return Math.sin(Math.PI * Math.pow((t - B0) / (B1 - B0), g));
}
/** A smooth minimum of a and b, within SOFT × ln 2 of the smaller. */
function softMin(a, b) {
  const m = Math.min(a, b);
  return m - SOFT * Math.log(Math.exp((m - a) / SOFT) + Math.exp((m - b) / SOFT));
}
/** The number of peaks of the sequence y that stand more than 0.5 mmHg above their sides. */
function peaksIn(y) {
  let n = 0;
  for (let i = 1; i < y.length - 1; i++) {
    if (!(y[i] > y[i - 1] && y[i] >= y[i + 1])) continue;
    let l = y[i], j = i - 1;
    while (j >= 0 && y[j] <= y[i]) l = Math.min(l, y[j--]);
    let r = y[i], k = i + 1;
    while (k < y.length && y[k] <= y[i]) r = Math.min(r, y[k++]);
    if (y[i] - Math.max(l, r) > 0.5 || (j < 0 && k >= y.length)) n++;
  }
  return n;
}
/**
 * The LV pressure in ejection for state P, every DT ms from aortic opening to 8 ms after
 * aortic closure: { y (mmHg), tb, A }, kept on P. Without SAM, the cycle model's.
 */
function lvShape(P) {
  if (P.lvb) return P.lvb;
  const ts = [];
  for (let t = B0; t <= E_END; t += DT) {
    const c = cycleAt(t), u = lvotAt(P, t);
    ts.push({ t, lv: c.lv, ao: c.ao, gr: 4 * u * u });
  }
  if (P.sam.kind === 'none') return (P.lvb = { y: ts.map((q) => q.lv), tb: null, A: 0 });
  const ip = ts.reduce((a, q, i) => (q.gr > ts[a].gr ? i : a), 0), tp = ts[ip].t;
  // the spike limit, held at its running maximum up to the gradient's peak, so that it does not
  // fall where the cycle model's aortic pressure passes its own peak while the gradient is low
  let run = -Infinity;
  const hi = ts.map((q, i) => { const h = q.ao + q.gr + AO_SWING; if (i > ip) return h; run = Math.max(run, h); return run; });
  const first = Math.max(T_MID, mrOn(P.sam) + 35);
  let best = null;
  for (let tb = first; tb === first || tb <= tp; tb += 4) {
    const b = ts.map((q) => bumpAt(q.t, tb));
    let A = 0;
    for (let i = 0; i < ts.length; i++) if (ts[i].t <= EV.avc && b[i] > 0.02) A = Math.max(A, (ts[i].ao + ts[i].gr - AO_SWING - ts[i].lv) / b[i]);
    const y = ts.map((q, i) => softMin(q.lv + A * b[i], hi[i]));
    if (peaksIn(y) !== 1) continue;
    const pt = ts[y.reduce((a, q, i) => (q > y[a] ? i : a), 0)].t;
    if (!best || pt < best.pt) best = { y, tb, A, pt };
  }
  // no curve with one peak: the cycle model's aortic pressure plus the gradient, as before
  return (P.lvb = best || { y: ts.map((q) => Math.max(q.lv, q.ao + q.gr)), tb: null, A: 0 });
}
/**
 * LV pressure (mmHg) at t for state P: lvShape's curve in ejection; after it, the curve's excess
 * over the cycle model's LV pressure fades out over 25 ms; else the cycle model's.
 */
function lvpAt(P, t) {
  t = ((t % RR) + RR) % RR;
  const S = lvShape(P), lv = cycleAt(t).lv;
  if (t < B0) return lv;
  const n = S.y.length - 1, x = (t - B0) / DT;
  if (x <= n) { const i = Math.min(n - 1, Math.floor(x)), u = x - i; return S.y[i] + (S.y[i + 1] - S.y[i]) * u; }
  const tE = B0 + n * DT, over = S.y[n] - cycleAt(tE).lv;
  return lv + over * (1 - smooth((t - tE) / 25));
}
/** Aortic pressure (mmHg) at t while the LVOT carries flow: the LV pressure less the LVOT gradient. */
const aopAt = (P, t) => lvpAt(P, t) - 4 * lvotAt(P, t) ** 2;
/**
 * MR velocity (m/s) at t: √((LV pressure − LA pressure) ÷ 4) while the leaflets are apart. It
 * starts at its full velocity, as the leaflets part, so it is faster than the LVOT velocity at
 * every instant: the two differ by the aortic pressure less the LA pressure.
 */
function mrAt(v, P, t) {
  t = ((t % RR) + RR) % RR;
  if (P.sam.kind === 'none') return 0;
  if (t < mrOn(P.sam) || t > MR_OFF) return 0;
  const off = 1 - smooth((t - (MR_OFF - 20)) / 20);
  return Math.sqrt(Math.max(0, lvpAt(P, t) - v.lap) / 4) * off;
}
/** The printed MR peak (m/s) and the times (ms) at which the MR and the LVOT velocities peak. */
function peaksOf(v, P) {
  let m = 0, mrT = null, l = 0, lvotT = null;
  for (let t = 0; t <= MR_OFF; t += 1) {
    const a = mrAt(v, P, t), b = lvotAt(P, t);
    if (a > m) { m = a; mrT = t; }
    if (b > l) { l = b; lvotT = t; }
  }
  return { mrVel: rnd(m, 1), mrT, lvotT };
}

let sheet = null, st = null;
const beat = new Beat(RR);
let BANDS = [], painted = '';

// ---------------------------------------------------------------- the figure
// The long axis and the apical three-chamber view, cut from the heart mesh: the heart the page
// shows, with the septum, the SAM, the LA and (normal heart) the LV's end-systolic size set from
// the printed values. The two views share one plane in this model, so the leaflet that touches
// the septum in one touches it in the other.
const redraw = () => { if (sheet) sheet.dirty = true; };
const DIS = ['hcmSep', 'hcmSam', 'la', 'lvSize'];
const MESH_LAX = new MeshPanel('plax', { diseases: DIS, redraw });
const MESH_A3C = new MeshPanel('a3c', { diseases: DIS, redraw });

/** The state shown: rest or Valsalva. */
const stateOf = (v) => v[provOf(st)];
/** The frame's time (ms): the beat, end-diastole, or the middle of contact (else the SAM's peak). */
function frameTime(v, tt) {
  const f = st[FRAME] || 'cine';
  if (f === 'ed') return 0;
  if (f === 'sam') { const c = contactOf(stateOf(v).sam); return c ? Math.round((c[0] + c[1]) / 2) : T_PK + 30; }
  return tt;
}
/** The mesh's weights at time tms for the values v. */
function meshOf(v, tms) {
  const heart = heartOf(st), c = cycleAt(tms), P = stateOf(v);
  let sam = 0;
  if (samDrawn(heart)) {
    const g = gapAt(P.sam, natGap(heart, v.w, tms), tms);
    if (g !== null) sam = samWeight(heart, v.w, tms, g);
  }
  return { disease: { hcmSep: v.w, la: laWeight(v.lavi, heart) }, motion: { hcmSam: sam, lvSize: v.es * c.s } };
}

/** The LV's name: its open blood 2.2 cm toward the apex from the middle of the mitral annulus. */
function lvName(ev, s) {
  const H = mvHinges(ev, s), an = ev.anchors(s), apex = onPlane(ev, an.apex);
  const M = H ? middle([H.ant, H.post]) : onPlane(ev, an.mv);
  return blood(ev, add(M, mul(unit(sub(apex, M)), 2.2)), 0.8);
}

/** The RV's name: its open blood within 0.8 cm of the RV anchor, clear of a thick septum. */
const rvName = (ev, s) => blood(ev, onPlane(ev, ev.anchors(s).prv), 0.8);

function lax(ctx, box, v, tms) {
  const P = stateOf(v), f = st[FRAME] || 'cine', M = meshOf(v, tms), sy = cycleAt(tms).s;
  const narrow = box.w < 260;
  const lines = f === 'sam' && P.sam.kind !== 'none'
    ? [P.sam.kind === 'contact' ? [`SAM: contact ${rnd(P.sam.f * 100)}% of systole`, `contact ${rnd(P.sam.f * 100)}%`] : [`SAM–septum ${P.sam.d} mm`, `SAM ${P.sam.d} mm`]]
    : narrow ? [`IVSd ${v.ivs} mm`, `PWd ${v.pw} mm`] : [`IVSd ${v.ivs} mm`, `LVIDd ${v.lvid} mm`, `PWd ${v.pw} mm`, `IVS/PW ${v.ratio.toFixed(2)}`];
  MESH_LAX.draw(ctx, box, fit(box.w, f === 'ed' ? 'PARASTERNAL LONG AXIS · END-DIASTOLE' : 'PARASTERNAL LONG AXIS', f === 'ed' ? 'PLAX · ED' : 'PLAX'), {
    tms, disease: M.disease, motion: M.motion,
    names: [[rvName, 'RV'], [lvName, 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      if (f === 'ed') {
        // the septum, the LV and the posterior wall where the calipers measure them; the LV's caliper 1 mm toward the base
        const K = plaxCalipers(ev, sy);
        if (K) {
          const side = [K.dir[1] * 0.1, -K.dir[0] * 0.1];
          cal(c, F, K.ivs[0], K.ivs[1], '');
          cal(c, F, add(K.lv[0], side), add(K.lv[1], side), '');
          cal(c, F, K.pw[0], K.pw[1], '');
        }
      } else if (f === 'sam' && P.sam.kind !== 'none') {
        const G = samGap(ev, sy);
        if (G && P.sam.kind === 'gap') cal(c, F, G.p, G.q, '', { solid: true });
        else if (G) {
          // contact: a mark beside the point where the leaflet meets the septum
          const q = F.P(G.q), back = unit(perp(G.up));
          caliper(c, q[0] - back[0] * 9, q[1] - back[1] * 9, q[0] + back[0] * 9, q[1] + back[1] * 9, { solid: true, size: 3 });
        }
      }
    },
    lines,
  });
}

/**
 * The jet through the outflow tract: from the narrowest point between the leaflet and the septum
 * (the outflow tract's landmark where the leaflet does not fold) toward the aortic valve, inside
 * the outflow tract and the aorta.
 */
function outflowJet(ev, sy) {
  const an = ev.anchors(sy), AV = onPlane(ev, an.av), G = samDrawn(heartOf(st)) ? samGap(ev, sy) : null;
  const O = G ? mul(add(G.p, G.q), 0.5) : onPlane(ev, an.lvot);
  if (len(sub(AV, O)) < 0.5) return null;
  const dir = unit(sub(AV, O)), side = perp(dir), cut = [[add(O, side), sub(O, side)]];
  const clip = cavity(ev, blood(ev, add(O, mul(sub(AV, O), 0.75)), 0.4), cut);
  return clip.length >= 12 ? { O, dir, clip, L: len(sub(AV, O)) } : null;
}
/**
 * The MR jet: from where the leaflets part, into the LA and toward its posterior wall, which clips
 * it. tent: the blood between the gap and the annulus (the gap and the two hinges), which the jet
 * crosses before it enters the LA, so the jet starts at the gap.
 */
function mrJet(ev, sy, vc) {
  const H = mvHinges(ev, sy);
  if (!H) return null;
  const O = mvGapPoint(ev, sy, H);
  if (!O) return null;
  const an = ev.anchors(sy), up = upOf(ev, sy), apex = onPlane(ev, an.apex), M = middle([H.ant, H.post]);
  const toApex = unit(sub(apex, M));
  const dir = unit(add(mul(toApex, -0.75), mul(up, -0.65)));
  const LA = cavity(ev, blood(ev, onPlane(ev, an.la)), [[H.ant, H.post]]);
  if (LA.length < 12) return null;
  let lMax = 0, w0 = Infinity, w1 = -Infinity;
  const across = perp(dir);
  for (const p of LA) {
    lMax = Math.max(lMax, dot(sub(p, O), dir));
    const x = dot(sub(p, O), across);
    w0 = Math.min(w0, x); w1 = Math.max(w1, x);
  }
  // an eccentric jet: its area 6% of the LA plus 40% per cm of vena contracta
  const jA = ((6 + 40 * vc) / 100) * area(LA);
  const jl = Math.min(lMax * 0.9, Math.sqrt((jA / 0.55) * 1.6));
  const jw = jl > 0 ? Math.min((w1 - w0) * 0.8, jA / (0.55 * jl)) : 0;
  return { O, dir, clip: LA, tent: [O, H.ant, H.post], jl, jw };
}

const VA = 60;   // cm/s, the color scale's aliasing velocity
// cm/s: the fastest color drawn in the outflow and MR jets. Each core aliases once over its first
// centimetre (KEEP_MR, KEEP_LVOT), from where the flow is fastest (the leaflet gap, the SAM
// contact), and stays under twice the aliasing velocity, where a second wrap would start; the CW
// strips carry the true velocity
const V_COLOR = 1.8 * VA, KEEP_MR = 1.0, KEEP_LVOT = 0.8;
/** One color box round the extents of the jets drawn (echo2d.js jet with box: false), as the scanner outlines it. */
function colorBox(ctx, F, list) {
  const B = list.filter(Boolean);
  if (!B.length) return;
  const t0 = Math.min(...B.map((b) => b.t0)), t1 = Math.max(...B.map((b) => b.t1));
  const r0 = Math.min(...B.map((b) => b.r0)), r1 = Math.max(...B.map((b) => b.r1)), { sect } = F;
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sect.cx, sect.top, r0, Math.PI / 2 - t0, Math.PI / 2 - t1, true);
  ctx.arc(sect.cx, sect.top, r1, Math.PI / 2 - t1, Math.PI / 2 - t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
function a3c(ctx, box, v, tms) {
  const P = stateOf(v), M = meshOf(v, tms), heart = heartOf(st), sy = cycleAt(tms).s;
  MESH_A3C.draw(ctx, box, fit(box.w, `APICAL THREE-CHAMBER · COLOR ${VA} cm/s`, `A3C · COLOR ${VA}`), {
    tms, disease: M.disease, motion: M.motion,
    // deeper as the LA grows (its length as the cube root of its volume, 5 cm at 25 mL/m²)
    deeper: Math.max(0, 5 * (Math.cbrt(v.lavi / (LA_BASE[heart] ?? 25)) - 1)),
    names: [[lvName, 'LV'], ['la', 'LA'], [(ev, s) => { const J = outflowJet(ev, s); return J ? add(J.O, mul(J.dir, J.L + 1.4)) : null; }, 'Ao']],
    over: (c, F, ev) => {
      // the jets in one color box
      const boxes = [];
      // the outflow jet with obstruction: its strength follows the CW envelope above 1 m/s
      const vo = lvotAt(P, tms);
      if (P.sam.kind === 'contact' && vo > 1.05) {
        const J = outflowJet(ev, sy);
        const a = clamp((vo - 1.0) / (P.vel - 1.0), 0, 1);
        // the jet starts at the contact, with no convergence zone in the LV
        if (J && a > 0.04) boxes.push(jet(c, F, { q: 60 + 40 * P.vel, va: VA, vmax: V_COLOR, keep: KEEP_LVOT, vc: 0.35, jl: Math.min(J.L + 2.2, 1.6 + 0.9 * P.vel), jw: 1.0 + 0.12 * P.vel, a, O: J.O, dir: J.dir, clip: J.clip, pisa: false, box: false }));
      }
      const vm = mrAt(v, P, tms);
      if (P.vc > 0 && vm > 0.5) {
        const J = mrJet(ev, sy, P.vc), pk = P.mrVel || 1;
        if (J) boxes.push(jet(c, F, { q: Math.PI * (P.vc / 2) ** 2 * vm * 100, va: VA, vmax: V_COLOR, keep: KEEP_MR, vc: P.vc, jl: J.jl, jw: J.jw, a: clamp(vm / pk, 0, 1), pisa: false, O: J.O, dir: J.dir, clip: J.clip, clipOr: [J.tent], box: false }));
      }
      colorBox(c, F, boxes);
      // the color bar through the beat whenever the state has jets, as mr.js draws it
      if (P.sam.kind !== 'none') barFor(c, F, -VA, VA);
    },
    lines: box.w < 260 ? [`LAVi ${v.lavi} mL/m²`] : [`LAVi ${v.lavi} mL/m²`, ...(P.vc > 0 ? [`MR VC ${P.vc.toFixed(2)} cm`] : [])],
  });
}

/** One velocity scale for both CW strips, so the MR jet's higher velocity shows against the LVOT's. */
const cwScale = (v) => Math.max(3, Math.ceil(Math.max(v.rest.mrVel, v.valsalva.mrVel, v.valsalva.vel) + 0.6));

function cwLvot(ctx, Pn, v) {
  const P = stateOf(v), prov = provOf(st);
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, `CW · LVOT · ${prov === 'rest' ? 'REST' : 'VALSALVA'}`, `CW · LVOT · ${prov === 'rest' ? 'REST' : 'VALS.'}`));
  const bx = inner(Pn), base = 0.12, vs = cwScale(v);
  const fn = (u) => -lvotAt(P, (u * 2 * RR) % RR);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.35, key: `hcmlvot|${P.vel}|${P.sam.kind}|${P.sam.f}|${vs}`, seed: 61 });
  vscale(ctx, bx, vs, base, vs > 5 ? 2 : 1);
  // the peak, in the first beat
  let bu = 0, best = 0;
  for (let i = 0; i <= 300; i++) { const y = -fn(i / 600); if (y > best) { best = y; bu = i / 600; } }
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, xp = bx.x + bu * bx.w, yp = y0 + best * k;
  caliper(ctx, xp - 12, yp, xp + 12, yp, { solid: true });
  const pk = { x0: xp - 14, y0: yp - 6, x1: xp + 14, y1: yp + 6 };
  note(ctx, bx, [`peak ${P.vel.toFixed(1)} m/s · 4V² ${P.grad} mmHg${P.sam.kind === 'contact' ? ' · late-peaking' : ''}`, `${P.vel.toFixed(1)} m/s · ${P.grad} mmHg`, `${P.grad} mmHg`], 'auto', [pk]);
  return bx;
}

function cwMr(ctx, Pn, v) {
  const P = stateOf(v);
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, 'CW · MITRAL REGURGITATION', 'CW · MR'));
  const bx = inner(Pn), base = 0.12, vs = cwScale(v), narrow = bx.w < 300;
  if (P.sam.kind === 'none') {
    vscale(ctx, bx, vs, base, vs > 5 ? 2 : 1);
    // the Barlow heart's own MR, of the prolapse, is chapter mr's; this figure does not draw it
    const ch = numOf('mr');
    note(ctx, bx, heartOf(st) === 'barlow' ? [`MR of the prolapse: chapter ${ch}`, `prolapse MR: ch. ${ch}`] : ['no mitral regurgitation', 'no MR'], 'top');
    return bx;
  }
  // the MR jet lies beside the LVOT, and a beam between the two records both: the MR envelope,
  // and inside it the LVOT's, brighter where the two add (as.js draws the LVOT inside the
  // aortic jet in the same way). The LVOT strip above holds its beam on the LVOT alone.
  const at = (u) => (u * 2 * RR) % RR;
  spectral(ctx, bx, {
    fn: [(u) => -mrAt(v, P, at(u)), (u) => -lvotAt(P, at(u))], gain: [0.8, 1.3], scale: vs, base, mode: 'cw', broad: 0.35,
    key: `hcmmr|${P.mrVel}|${v.lap.toFixed(1)}|${P.vel}|${P.sam.kind}|${P.sam.f}|${vs}`, seed: 62,
  });
  vscale(ctx, bx, vs, base, vs > 5 ? 2 : 1);
  // the peaks, each with its caliper and tag: the MR's in the first beat, the LVOT's in the second
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const peaks = [[P.mrT, P.mrVel, 'MR'], [RR + P.lvotT, P.vel, 'LVOT']]
    .map(([ms, vel, name]) => ({ x: X(ms), y: y0 + vel * k, text: narrow ? `${name} ${vel.toFixed(1)}` : `${name} ${vel.toFixed(1)} m/s` }));
  const keep = peaks.map(({ x, y }) => ({ x0: x - 12, y0: y - 5, x1: x + 12, y1: y + 5 }));
  peaks.forEach(({ x, y }) => caliper(ctx, x - 10, y, x + 10, y, { solid: true }));
  // a tag beside its caliper, else above or below it, else a row further down
  const boxAt = (x, y, text) => {
    ctx.save();
    ctx.font = `500 10.5px ${MONO}`;
    const w = ctx.measureText(text).width + 12, h = 10.5 + 3 + 8;
    ctx.restore();
    const x0 = Math.max(bx.x + 4, Math.min(bx.x + bx.w - w - 4, x)), y0b = Math.max(bx.y + 4, Math.min(bx.y + bx.h - h - 4, y - h / 2));
    return { x0, y0: y0b, x1: x0 + w, y1: y0b + h, h };
  };
  const meets = (a, b) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2 && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2;
  const tags = [];
  for (const { x, y, text } of peaks) {
    const h = boxAt(x + 14, y, text).h;
    const ty = [y, y - h - 4, y + h + 4, y + 2 * h + 8].find((t) => { const b = boxAt(x + 14, t, text); return ![...keep, ...tags].some((o) => meets(b, o)); }) ?? y;
    const r = tagBox(ctx, x + 14, ty, [text], { size: 10.5, bounds: bx });
    tags.push({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
  }
  // how the two differ (Nagueh 2022): the MR envelope is rounder, peaks earlier and lasts past the
  // aortic valve's closure; with contact the LVOT envelope is a late-peaking dagger. An earlier peak
  // shows where the MR leads by 30 ms or more (about 9 px on a desktop strip).
  const mrWords = [P.sam.kind === 'contact' ? 'rounder' : null, P.lvotT - P.mrT >= 30 ? 'earlier peak' : null, MR_OFF > EV.avc + 30 ? 'ends later' : null].filter(Boolean);
  const lvotWord = P.sam.kind === 'contact' ? 'late-peaking dagger' : 'mid-systolic peak';
  note(ctx, bx, [`MR ${mrWords.join(', ')} · LVOT ${lvotWord}`, `MR ${mrWords[0] || 'faster'} · LVOT ${P.sam.kind === 'contact' ? 'dagger' : 'mid-systolic'}`], 'auto', [...keep, ...tags]);
  return bx;
}

/**
 * M-mode through the mitral leaflet tips, from the long axis: the RV, the septum, the anterior
 * and posterior leaflets and the posterior wall at the printed sizes, two beats. In systole the
 * anterior leaflet moves toward the septum by the same gap as the 2D views; its contact shows as
 * the leaflet's echo on the septum.
 */
function mmodeMV(ctx, Pn, v) {
  const P = stateOf(v), heart = heartOf(st);
  panel(ctx, Pn.x, Pn.y, Pn.w, Pn.h, fit(Pn.w, 'M-MODE · MITRAL VALVE · SAM', 'M-MODE · MV'));
  const B = { x: Pn.x + 6, y: Pn.y + 24, w: Pn.w - 40, h: Pn.h - 30 };
  const ivs = v.ivs / 10, pw = v.pw / 10, lvid = v.lvid / 10;
  // the LV's diameter at end-systole: a sphere's for the LVEF
  const fs = 1 - Math.cbrt(1 - v.ef / 100);
  const s0 = 2.9, d1 = s0 + ivs + lvid + pw + 1.2;
  const g0 = natGap(heart, v.w, T_PK) ?? 0.55 * v.lvid;
  /** The beam's layers (cm) at time t: the septum, the leaflets and the posterior wall. */
  const geomAt = (t) => {
    const c = cycleAt(t), sy = clamp(c.s, 0, 1);
    const sepTop = s0 + 0.08 * sy, sepLv = sepTop + ivs * (1 + 0.12 * sy);
    const pwEndo = sepLv + lvid * (1 - fs * sy) - 0.08 * sy, pwEpi = pwEndo + pw * (1 + 0.45 * sy);
    // the leaflets: shut at their own gap from the septum, short of the posterior wall; open in
    // early and late diastole toward the septum (E, A) and the posterior wall; the anterior one
    // moved by SAM to the same gap as the 2D views
    const gn = (natGap(heart, v.w, t) ?? g0) / 10, shut = Math.min(sepLv + gn, pwEndo - 0.3);
    const g = gapAt(P.sam, gn * 10, t), amlSys = g === null ? shut : Math.min(shut, sepLv + g / 10);
    const open = 1 - c.drive.mv;
    return { sy, sepTop, sepLv, pwEndo, pwEpi, aml: amlSys - (amlSys - (sepLv + 0.45)) * open, pml: shut + (pwEndo - 0.3 - shut) * 0.55 * open, g };
  };
  const layers = (u) => {
    const G = geomAt((u * 2 * RR) % RR);
    return [
      [0, 0.5, 8, 0], [0.9, 1.3, 0, 0.05 * G.sy], [G.sepTop, G.sepLv, 0, 0.1 * G.sy],
      [Math.max(G.sepLv, G.aml - 0.08), G.aml + 0.08, 15, 0], [G.pml - 0.07, G.pml + 0.07, 13, 0],
      [G.pwEndo, G.pwEpi, 0, -0.3 * G.sy], [G.pwEpi, G.pwEpi + 0.15, 16, -0.3 * G.sy],
    ];
  };
  mmode(ctx, B, 0, d1, layers, `hcmmm|${heart}|${v.ivs}|${v.pw}|${v.lvid}|${v.ef}|${provOf(st)}|${P.sam.kind}|${P.sam.d}|${P.sam.f}|${v.w.toFixed(3)}`);
  // depth scale (cm)
  const pxcm = B.h / d1;
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= d1; d += 1) {
    const y = B.y + d * pxcm;
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 5 === 0 && d > 0) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  ctx.restore();
  // the contact's span, or the least gap, in the first beat
  const X = (ms) => B.x + (ms / (2 * RR)) * B.w;
  const yOf = (cm) => B.y + cm * pxcm;
  const avoid = [];
  if (P.sam.kind === 'contact') {
    const [tc, te] = contactOf(P.sam), y = yOf(geomAt((tc + te) / 2).sepLv) - 7;
    caliper(ctx, X(tc), y, X(te), y, { solid: true, size: 3 });
    avoid.push({ x0: X(tc) - 4, y0: y - 6, x1: X(te) + 4, y1: y + 6 });
  } else if (P.sam.kind === 'gap') {
    const t = (T_PK + T_HOLD) / 2, G = geomAt(t), y1 = yOf(G.sepLv), y2 = yOf(G.aml);
    caliper(ctx, X(t), y1, X(t), y2, { solid: true, size: 3 });
    avoid.push({ x0: X(t) - 6, y0: y1 - 4, x1: X(t) + 6, y1: y2 + 4 });
  }
  const txt = P.sam.kind === 'contact' ? [`contact ${rnd(P.sam.f * 100)}% of systole · ${SAM_GRADE(P.sam)} SAM`, `contact ${rnd(P.sam.f * 100)}% of systole`, `contact ${rnd(P.sam.f * 100)}%`]
    : P.sam.kind === 'gap' ? [`SAM–septum ${P.sam.d} mm · ${SAM_GRADE(P.sam)} SAM`, `SAM–septum ${P.sam.d} mm`, `${P.sam.d} mm`] : ['no SAM', 'no SAM'];
  note(ctx, B, txt, 'auto', avoid);
  return B;
}

function draw(sh) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const f = st[FRAME] || 'cine';
  const tt = beat.at(f === 'cine', frameTime(v, 0));
  const tms = frameTime(v, tt);
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : tms / (2 * RR));
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    const [a1, a2] = rows(a, [1, 1.15], 8);
    lax(ctx, a1, v, tms);
    a3c(ctx, a2, v, tms);
    const [b1, b2, b3] = rows(b, [1, 1, 1], 8);
    for (const bx of [cwLvot(ctx, b1, v), cwMr(ctx, b2, v), mmodeMV(ctx, b3, v)]) mark(bx);
    return;
  }
  const colL = { x: 16, y: 14, w: W * 0.44 - 16, h: H - 26 };
  const colR = { x: W * 0.455, y: 14, w: W * 0.545 - 16, h: H - 26 };
  const [a1, a2] = rows(colL, [1, 1.2], 10);
  lax(ctx, a1, v, tms);
  a3c(ctx, a2, v, tms);
  const [r1, r2, r3] = rows(colR, [1, 1, 1.1], 10);
  for (const bx of [cwLvot(ctx, r1, v), cwMr(ctx, r2, v), mmodeMV(ctx, r3, v)]) mark(bx);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
// LA volume index (Lang 2015): normal ≤34, mildly 35–41, moderately 42–48, severely >48 mL/m²
const laWord = (x) => (x <= 34 ? 'normal' : x <= 41 ? 'mildly enlarged' : x <= 48 ? 'moderately enlarged' : 'severely enlarged');
// the hearts whose own walls or LV have another cause; the page then names the wall, not HCM
const PHENO_NOTE = {
  amyloid: 'The heart shown is the amyloid heart: its walls are thick from amyloid, a phenocopy of HCM, and a wall of 15 mm or more with another cause does not define HCM',
  bav: 'The heart shown has a bicuspid aortic valve with severe stenosis: its walls are thick from the pressure load, a cause of hypertrophy that the definition of HCM excludes',
  icm: 'The heart shown is the ischemic heart: its LV is dilated by an old infarct, and a thick wall defines HCM in a non-dilated LV',
};
// the Barlow heart: its leaflets prolapse into the LA with severe MR (chapter mr); the figure draws
// neither SAM on them nor that MR
const BARLOW = () => ` The heart shown is the Barlow heart: both leaflets prolapse into the LA, with severe MR, which chapter ${numOf('mr')} grades. This figure shows neither SAM nor that MR.`;
const nameOf = (v) => (PHENO_NOTE[v.heart] ? `LV wall thickness of ${v.ivs} mm` : 'Hypertrophic cardiomyopathy');
const LEAD = {
  'wall <13 mm': (v) => (v.ivs <= 10 ? 'Normal LV wall thickness' : 'LV wall thickness below the HCM threshold'),
  'wall 13–14 mm': () => 'Septal thickness of 13–14 mm',
  'wall ≥15 mm': (v) => `${nameOf(v)} without obstruction`,
  'latent obstruction': (v) => `${nameOf(v)} with latent obstruction`,
  'obstruction at rest': (v) => (PHENO_NOTE[v.heart] ? `${nameOf(v)} with obstruction at rest` : 'Obstructive hypertrophic cardiomyopathy'),
};

function liveOf(v, s, cite) {
  const N = cite('nagueh2022'), O = cite('ommen2024'), L = cite('lang2015'), Pc = cite('pollick1984');
  const prov = provOf(s), P = v[prov], R = v.rest, V = v.valsalva;
  const s0 = ` The anterior septum measures ${v.ivs} mm at end-diastole and the posterior wall ${v.pw} mm, a ratio of ${v.ratio.toFixed(2)}${v.ratio > 1.3 ? `, above the 1.3 of asymmetric septal hypertrophy in a normotensive patient${N}` : ''}.`;
  const def = v.ivs >= 15 ? '' : v.ivs >= 13
    ? ` A wall of 13–14 mm can be diagnostic of HCM in a family member of a patient with HCM or with a positive genetic test; otherwise the threshold is 15 mm${O}.`
    : ` HCM is defined by a maximal end-diastolic wall thickness of 15 mm or more without another cause${O}.`;
  const obs = v.grade === 'obstruction at rest' ? 'obstruction at rest (30 mmHg or more)'
    : v.grade === 'latent obstruction' ? 'latent obstruction: below 30 mmHg at rest and 30 mmHg or more with provocation'
      : 'no obstruction at rest or with provocation';
  const s1 = ` The peak LVOT velocity is ${R.vel.toFixed(1)} m/s at rest, a gradient of ${R.grad} mmHg, and ${V.vel.toFixed(1)} m/s with Valsalva (${V.grad} mmHg): ${obs}${O}.`;
  const samTxt = (Q) => (Q.sam.kind === 'contact' ? `meets the septum for ${rnd(Q.sam.f * 100)}% of systole` : `comes within ${Q.sam.d} mm of the septum in systole`);
  const s2 = P.sam.kind === 'none' ? (v.heart === 'barlow' ? '' : ' The mitral leaflets close normally, with no SAM and no MR.')
    : ` ${prov === 'rest' ? 'At rest' : 'With Valsalva'}, the anterior mitral leaflet ${samTxt(P)} (${P.samGrade} SAM)${N}.`;
  const s3 = P.sam.kind === 'none' ? ''
    : ` The leaflets part, with a posteriorly directed MR jet; its vena contracta is ${P.vc.toFixed(2)} cm (${P.mr})${cite('zoghbi2017')}. The MR jet reaches ${P.mrVel.toFixed(1)} m/s, faster than the LVOT jet${N}.`;
  const efTxt = v.ef > 74 ? ', above the normal range (52–72% in men, 54–74% in women)' : v.ef < 50 ? `, below the 50% that defines systolic dysfunction in HCM${O}` : '';
  const s4 = ` The LVEF is ${v.ef}%${efTxt}, the LV end-diastolic diameter ${v.lvid} mm and the LA volume index ${v.lavi} mL/m² (${laWord(v.lavi)})${L}.`;
  const s5 = Math.max(R.grad, V.grad) >= 50 ? ` A gradient of 50 mmHg or more, at rest or with provocation, is the threshold for advanced drug or invasive therapy when symptoms persist despite standard therapy${O}.` : '';
  const ph = PHENO_NOTE[v.heart] ? ` ${PHENO_NOTE[v.heart]}${N}.` : v.heart === 'barlow' ? BARLOW() : '';
  const pol = P.sam.kind === 'contact' ? ` The longer the contact, the higher the gradient${Pc}.` : '';
  return `<b>${LEAD[v.grade](v)}.</b>${s0}${def}${s1}${s2}${s3}${s4}${s5}${pol}${ph}`;
}

/** The two guideline tables, with the current column marked. */
function obsRows(v) {
  const c = v.grade === 'obstruction at rest' ? 2 : v.grade === 'latent obstruction' ? 1 : v.ivs >= 15 ? 0 : -1;
  return [
    ['Peak LVOT gradient at rest', ['<30 mmHg', '<30 mmHg', '≥30 mmHg'], c],
    ['With provocation (Valsalva, standing, exercise)', ['<30 mmHg', '≥30 mmHg', '—'], c],
  ];
}
function samRows(v) {
  const g = stateOf(v).samGrade, c = { mild: 0, moderate: 1, severe: 2 }[g] ?? -1;
  return [['SAM on M-mode', ['SAM–septal distance >10 mm', '≤10 mm, or contact <30% of systole', 'Contact ≥30% of systole'], c]];
}

const hcmPage = {
  key: 'hcm',
  part: 'cardiomyopathy',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Hypertrophic cardiomyopathy',
  nav: 'HCM',
  dwell: 26,
  defaults: { hcmS: 0.6, hcmProv: 'rest', hcmFrame: 'cine' },
  format: { hcmS: (x, s) => gradeOf(x, s ? heartOf(s) : 'normal') },
  watch: ['hcmS', 'hcmProv', 'hcmFrame', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    const paint = (s) => {
      const heart = heartOf(s);
      if (heart === painted) return;
      painted = heart;
      BANDS = lazyBands((x) => gradeOf(x, heart));
      paintBands(document.getElementById('hcm-grades'), BANDS, LEV, SHORT);
    };
    paint(state);
    subscribe?.((s, ch) => { if ('pheno' in ch) paint(s); });
  },
  // the heart model and the targets load at idle, before the chapter opens (main.js warms every chapter)
  enter() { MESH_LAX.start(); MESH_A3C.start(); },
  warm() { MESH_LAX.start(); MESH_A3C.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, (s[FRAME] || 'cine') === 'cine') && sheet) sheet.dirty = true;
  },
  // the sequence: rest from a normal heart to severe obstruction; back to latent obstruction at
  // rest; the same heart with Valsalva; then to the end with Valsalva
  tourEnter(set) { set({ hcmS: 0, hcmProv: 'rest', hcmFrame: 'cine' }); },
  tourTick(tt, set) {
    if (tt < 13) set({ hcmProv: 'rest', hcmS: Math.round(clamp((tt - 1) / 11, 0, 1) * 200) / 200 });
    else if (tt < 16) set({ hcmProv: 'rest', hcmS: LATENT });
    else if (tt < 20) set({ hcmProv: 'valsalva', hcmS: LATENT });
    else set({ hcmProv: 'valsalva', hcmS: Math.round((LATENT + (1 - LATENT) * clamp((tt - 20) / 5, 0, 1)) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    if (provOf(s) === 'valsalva') return s.hcmS <= LATENT ? 16 : 20 + ((s.hcmS - LATENT) / (1 - LATENT)) * 5;
    return 1 + s.hcmS * 11;
  },
  text(s, { cite }) {
    const v = shown(s), P = v[provOf(s)], prov = provOf(s);
    return {
      readouts: [
        { k: 'Maximal wall', v: fmt(v.ivs), u: 'mm', flag: v.ivs >= 15 },
        { k: 'Septum ÷ posterior wall', v: v.ratio.toFixed(2), flag: v.ratio > 1.3 },
        { k: prov === 'rest' ? 'LVOT gradient, rest' : 'LVOT gradient, Valsalva', v: P.grad, u: `mmHg · ${P.vel.toFixed(1)} m/s`, flag: P.grad >= 30 },
        { k: 'SAM', v: P.samGrade, u: P.sam.kind === 'contact' ? `contact ${rnd(P.sam.f * 100)}%` : P.sam.kind === 'gap' ? `${P.sam.d} mm` : '', text: true, flag: P.samGrade === 'moderate' || P.samGrade === 'severe' },
        v.heart === 'barlow' && P.sam.kind === 'none'
          ? { k: 'MR', v: 'prolapse', u: `chapter ${numOf('mr')}`, text: true, flag: true }
          : { k: 'MR', v: P.mr, u: P.vc > 0 ? `VC ${P.vc.toFixed(2)} cm` : '', text: true, flag: P.mr === 'moderate' || P.mr === 'severe' },
        { k: 'LVEF', v: fmt(v.ef), u: '%', flag: v.ef > 74 || v.ef < 50 },
      ],
      live: liveOf(v, s, cite),
      extra: (art) => {
        gradeTable(art.querySelector('#hcm-table'), obsRows(v), 'LVOT obstruction (ASE 2022, AHA/ACC 2024)', ['Non-obstructive', 'Latent', 'At rest']);
        gradeTable(art.querySelector('#hcm-table2'), samRows(v), 'Severity of SAM (ASE 2022)', ['Mild', 'Moderate', 'Severe']);
      },
    };
  },
};
export default hcmPage;
