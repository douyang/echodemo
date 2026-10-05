// Shunts: a secundum atrial septal defect, a perimembranous ventricular septal defect, and a
// patent foramen ovale on the agitated saline study. One slider from no shunt to a large one; a
// switch for the defect, and for the PFO a switch for the maneuver (rest or Valsalva release).
// ASD: the defect in the subcostal view with its left-to-right jet, the RV and RA in the
// RV-focused four-chamber view, PW in the RVOT and the LVOT for Qp/Qs, and the TR jet. VSD: the
// defect in the short axis at the aortic valve with its jet into the RV, the LV in the long axis,
// CW through the defect, and Qp/Qs. PFO: the saline study in the four-chamber view, and the
// bubbles in the LA beat by beat at rest and with Valsalva. The defects are cut in the heart
// mesh (gl/shuntsmesh.js): each prints the diameter that the image shows.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { rvGrowOf, raAreaWeight, raAreaMin, lvSizeOf, laWeight, lveddLeast, laviLeast } from '../meshcal.js';
import { blood, cavity, area, onPlane, hingesOf, middle, plaxCalipers, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { septaOf, defectFrame, wallFrame, slide, planeOf, cutOf, axisOnPlane, throughWall } from '../gl/shuntsmesh.js';
import { DB } from '../bmode.js';
import { round } from '../edits.js';

const KEY = 'shS';
const TYPE = 'shType';
const MAN = 'shMan';
const TYPES = ['asd', 'vsd', 'pfo'];
const SBP = 125;       // mmHg, the systolic blood pressure of the model, for the RV pressure across a VSD
const RAP = 3;         // mmHg, the RA pressure of a normal IVC (chapter 07), for the RV pressure from the TR jet
const VA_ASD = 40;     // cm/s, the color scale for the low-velocity ASD flow (Silvestry 2015: 25-40)
const VA_VSD = 60;     // cm/s, as on the valve pages' high-velocity jets
const VSD_SHIFT = -0.7;   // cm the short axis at the aortic valve moves toward the apex: the LVOT under the valve
// The subcostal view moves 1 cm back from the aortic root, to the middle of the atrial septum.
// There the septum runs about 2 cm from its upper rim (a fold of the two atrial walls) to the
// atrioventricular valves. The ASD's centre lies 1.4 cm along it from that rim.
const ASD_SHIFT = -1.0, ASD_SLIDE = 1.4;

// ---------------------------------------------------------------- the model
// Tracks over the slider s for each defect. ASD: the diameter (mm) grows to 20 mm; Qp/Qs from the
// RVOT and LVOT diameters (cm) and VTIs (cm) rises past 1.5 near 10 mm, where the ESC guideline
// puts a relevant shunt; the RV basal diameter (cm) and the RA area (cm², end-systole) grow with
// the shunt; the TR velocity (m/s) rises a little. VSD: the diameter (mm) grows to 10 mm; the
// peak velocity across it (m/s) falls as the RV pressure rises; the LV (LVEDD, mm) and the LA
// (LA volume index, mL/m²) enlarge with the shunt. PFO: the bubbles in the LA at the peak frame
// after Valsalva release and at rest. Teaching values set inside the guideline bands.
const TRACKS = {
  asd: tracks([0, 0.08, 0.42, 0.7, 1], {
    d: [0, 0, 10, 15, 20],
    rvotD: [2.2, 2.2, 2.3, 2.45, 2.6],
    rvotVti: [17, 17, 23.5, 27.5, 31],
    lvotD: [2.0, 2.0, 2.0, 2.0, 2.0],
    lvotVti: [21, 21, 20.5, 20, 19.5],
    rvb: [3.4, 3.4, 4.05, 4.6, 5.1],
    ra: [16, 16, 18.4, 22, 25],
    trv: [2.3, 2.3, 2.4, 2.6, 2.8],
  }),
  vsd: tracks([0, 0.08, 0.35, 0.58, 0.82, 1], {
    d: [0, 0, 3, 5.5, 8, 10],
    vmax: [5.0, 5.0, 5.0, 4.8, 4.15, 3.6],
    rvotD: [2.2, 2.2, 2.2, 2.3, 2.35, 2.4],
    rvotVti: [17, 17, 18, 23.5, 27, 29],
    lvotD: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
    lvotVti: [21, 21, 21, 20.5, 20, 19.5],
    lvedd: [47, 47, 48, 58.5, 61.5, 63],
    lavi: [25, 25, 26, 34.5, 39, 42],
  }),
  pfo: tracks([0, 0.12, 0.45, 0.75, 1], {
    val: [0, 0, 8, 20, 32],
    rest: [0, 0, 0, 3, 10],
  }),
};

/** The model at slider position s for defect type: its values before rounding. */
function modelAt(s, type) {
  const m = TRACKS[type](s);
  m.s = s;
  m.type = type;
  return m;
}

// the grades along each defect's slider
const GRADES = {
  asd: ['none', 'small', 'significant'],
  vsd: ['none', 'restrictive', 'significant', 'raised'],
  pfo: ['none', 'valsalva', 'rest'],
};
const LEVEL = { none: 0, small: 1, restrictive: 1, valsalva: 1, significant: 2, rest: 2, raised: 3 };
// the bands' names under the slider, where a grade's own name would not read well, and short ones
const LABEL = { valsalva: 'Valsalva only', rest: 'at rest', raised: 'RVSP ≥50%' };
const SHORT = { significant: 'signif.', restrictive: 'restr.', valsalva: 'Valsalva', raised: '≥50%' };

// The RA area that the RV's growth adds on the RV-focused four-chamber view at end-systole: a + b w
// cm² per unit of rvGrow at raGrow w, measured on each heart as meshcal.js traces its RA_AREA (which
// holds raGrow alone). raGrow takes the printed area less that, so the image shows the printed area.
const RA_BY_RV = { normal: [2.28, 0.59], amyloid: [0.98, 0.51], icm: [1.74, 0.54], barlow: [2.59, 0.54], bav: [2.27, 0.57] };
/** The raGrow weight that shows an RA area of ra cm² on heart key with the RV at rvGrow weight g. */
function raGrowFor(heart, ra, g) {
  const [a, b] = RA_BY_RV[heart] || RA_BY_RV.normal;
  let w = raAreaWeight(heart, ra - g * a);
  for (let i = 0; i < 3; i++) w = raAreaWeight(heart, ra - g * (a + b * w));
  return w;
}
/** The smallest RA area (cm²) heart key shows with the RV at rvGrow weight g. */
function raLeast(heart, g) {
  const [a, b] = RA_BY_RV[heart] || RA_BY_RV.normal;
  return raAreaMin(heart) + g * (a - 0.3 * b);
}

/**
 * Values as reported, at the decimals of the ASE report (Taub 2025): the defect in mm, the
 * outflow diameters to 0.1 cm and their VTIs to 1 cm, Qp/Qs to 0.1, the peak velocity to 0.1 m/s
 * and its gradient to 1 mmHg. Each calculation takes the rounded values before it, and the grade
 * reads them, so no grade contradicts a number on screen.
 */
function measure(raw, type, heart = 'normal') {
  const v = { ...raw, type, heart };
  if (type === 'pfo') {
    v.val = round(raw.val, 0);
    v.rest = round(raw.rest, 0);
    v.grade = v.rest > 0 ? 'rest' : v.val > 0 ? 'valsalva' : 'none';
    v.shunt = v.grade === 'none' ? 'none' : 'right to left';
    return v;
  }
  v.d = round(raw.d, 0);
  for (const k of ['rvotD', 'lvotD']) v[k] = round(raw[k], 1);
  for (const k of ['rvotVti', 'lvotVti']) v[k] = round(raw[k], 0);
  v.svp = round(Math.PI * (v.rvotD / 2) ** 2 * v.rvotVti, 0);
  v.svs = round(Math.PI * (v.lvotD / 2) ** 2 * v.lvotVti, 0);
  v.qpqs = round((v.rvotD ** 2 * v.rvotVti) / (v.lvotD ** 2 * v.lvotVti), 1);
  v.shunt = v.d > 0 ? 'left to right' : 'none';
  if (type === 'asd') {
    v.rvb = round(raw.rvb, 1);
    v.ra = round(Math.max(raw.ra, raLeast(heart, rvGrowOf(heart, v.rvb))), 0);
    v.trv = round(raw.trv, 1);
    v.rap = RAP;
    v.grad = round(4 * v.trv ** 2, 0);
    v.rvsp = v.grad + v.rap;
    v.rvbG = v.rvb < 4.1 ? 0 : v.rvb <= 4.4 ? 1 : v.rvb <= 4.9 ? 2 : 3;
    v.raBig = v.ra >= 19;
    // significant: RV volume overload (the RV basal diameter above normal) or Qp/Qs of 1.5 or more.
    // The RA is printed but not graded: the amyloid heart's RA is never below 20 cm².
    v.big = v.qpqs >= 1.5 || v.rvbG > 0;
    v.grade = v.d === 0 ? 'none' : v.big ? 'significant' : 'small';
  } else {
    v.vmax = round(raw.vmax, 1);
    v.grad = round(4 * v.vmax ** 2, 0);
    v.sbp = SBP;
    v.rvsp = v.sbp - v.grad;
    // held to the sizes the heart shown can take: the ischemic heart's LV is never below 49 mm,
    // and the amyloid and Barlow hearts' LA never below 33 and 41 mL/m²
    v.lvedd = round(Math.max(raw.lvedd, lveddLeast(heart)), 0);
    v.lavi = round(Math.max(raw.lavi, laviLeast(heart)), 0);
    v.lvBig = v.lvedd > 58;
    v.laBig = v.lavi > 34;
    // significant: LV volume overload (LVEDD above normal) or Qp/Qs of 1.5 or more. The LA is
    // printed but not graded: the Barlow heart's LA is enlarged by its own mitral regurgitation.
    v.big = v.qpqs >= 1.5 || v.lvBig;
    v.half = v.rvsp >= v.sbp / 2;
    v.grade = v.d === 0 ? 'none' : v.half ? 'raised' : v.big ? 'significant' : 'restrictive';
  }
  return v;
}

const heartOf = (s) => s.pheno || 'normal';
const typeOf = (s) => (TYPES.includes(s[TYPE]) ? s[TYPE] : 'asd');
const manOf = (s) => (s[MAN] === 'rest' ? 'rest' : 'valsalva');
let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = `${s[KEY]}|${typeOf(s)}|${heartOf(s)}`;
  if (key !== lastKey || !lastShown) {
    lastKey = key;
    lastShown = measure(modelAt(s[KEY], typeOf(s)), typeOf(s), heartOf(s));
  }
  return lastShown;
}
export const gradeOf = (x, type = 'asd') => measure(modelAt(x, type), type).grade;
/** The values the page prints at slider position x for defect type on heart, for the checks. */
export const valuesAt = (x, type = 'asd', heart = 'normal') => measure(modelAt(x, type), type, heart);

let sheet = null, st = null;
const beat = new Beat(RR);
const BANDS_OF = { asd: [], vsd: [], pfo: [] };

// ---------------------------------------------------------------- the saline study
// The study runs over 11 beats, as the four-chamber view records it: beat -1 before the
// bubbles arrive, beat 0 as they fill the RA, beat 1 the first with the RA and the RV full (the
// count starts there, Mitchell 2019), then the washout. Bubbles through a PFO reach the LA in
// beat 2 (with Valsalva released as they arrive in the RA) or 3 (at rest), the peak a beat later,
// and the LV in the next diastole.
const BEATS = 11, B0 = -1;
const RA_OP = [0, 0.55, 1, 1, 0.95, 0.85, 0.72, 0.58, 0.45, 0.33, 0.22];
const LA_RUN = { valsalva: [0, 0, 0, 0.55, 1, 0.75, 0.45, 0.25, 0.12, 0.05, 0], rest: [0, 0, 0, 0, 0.6, 1, 0.7, 0.4, 0.2, 0.08, 0] };
/** Bubbles in the LA in beat b (B0..) of the run for maneuver man at peak count n. */
const laCount = (n, man, b) => Math.round(n * (LA_RUN[man][b - B0] || 0));
/** The first beat with bubbles in the LA (counted from full RA opacification), or null. */
function firstBeat(n, man) {
  for (let b = B0; b < B0 + BEATS; b++) if (laCount(n, man, b) > 0) return b;
  return null;
}
const study = { ms: 0 };
const studyBeat = () => B0 + Math.floor(study.ms / RR);

// ---------------------------------------------------------------- the figure
// The views cut from the heart mesh (meshpanel.js), on the heart the page shows. ASD: the RV and
// the RA at the printed RV basal diameter and RA area (rvGrow, raGrow; meshcal.js rvGrowOf and
// raAreaWeight, as chapter 13). VSD: the LV at the printed LVEDD (lvSize, meshcal.js lvSizeOf)
// and the LA at the printed LA volume index (la, laWeight). The defect is a disc in the septum
// of the printed diameter (gl/shuntsmesh.js). Its middle and axis lie in the plane of the view
// that measures it, so that view's cut is the printed diameter wide. It is drawn as blood
// (echo.js setShapes).
const redraw = () => { if (sheet) sheet.dirty = true; };
/** A mesh panel that draws the chapter's shapes into the image, and keeps its depth marks inside it. */
class ShuntPanel extends MeshPanel {
  draw(ctx, P, title, o = {}) {
    if (this.ev) {
      this.ev.setShapes(o.shapes || null);
      if ((o.shapesKey || '') !== this.shapesKey) { this.shapesKey = o.shapesKey || ''; this.last = ''; }
    }
    return super.draw(ctx, P, title, o);
  }
  depthMarks(ctx, bx, barEnd = 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx.x, bx.y, bx.w + 30, bx.h);
    ctx.clip();
    super.depthMarks(ctx, bx, Math.max(barEnd, bx.y + 6));
    ctx.restore();
  }
}
const P_SUB = new ShuntPanel('sc4c_ias', { diseases: ['rvGrow', 'raGrow'], redraw });
const P_A4C = new ShuntPanel('a4c_rv', { diseases: ['rvGrow', 'raGrow'], redraw });
const P_SAX = new ShuntPanel('psax_av', { diseases: ['lvSize', 'la'], redraw });
const P_LAX = new ShuntPanel('plax', { diseases: ['lvSize', 'la'], redraw });
const P_BUB = new ShuntPanel('a4c', { redraw });
const PANELS = [P_SUB, P_A4C, P_SAX, P_LAX, P_BUB];

const DEF = new WeakMap();   // each view's cut of the defect in its last frame
/**
 * The shapes of defect type (asd, vsd) of diameter dMm on a view: the defect as blood. The disc's
 * middle and axis lie in the measuring plane (the subcostal four-chamber view moved to the middle
 * of the atrial septum, or the short axis at the aortic valve moved toward the LVOT), so that
 * plane cuts it dMm wide. Other views show it where their planes cross the disc. The defect opens
 * one chamber into the other through the wall each plane shows, and no further (throughWall).
 */
function defectShapes(type, dMm) {
  return (g, ev) => {
    DEF.delete(ev);
    if (!(dMm > 0)) return null;
    const site = septaOf(ev.model)[type === 'asd' ? 'ias' : 'vsd'];
    const P = type === 'asd' ? planeOf(ev, 'sc4c', ASD_SHIFT) : planeOf(ev, 'psax_av', VSD_SHIFT);
    if (!P) return null;
    const f = type === 'asd' ? slide(defectFrame(ev, site, P), P, ev.model.anat.normal().point('av', 0, 0), ASD_SLIDE) : wallFrame(ev, site, P);
    const axis = axisOnPlane(g, f.N);
    const cut = throughWall(ev, cutOf(g, f.C, f.N, dMm / 20, 1.2), axis);
    if (!cut) return null;
    DEF.set(ev, { cut, f, axis });
    return [{ polys: [cut.poly], e: DB.blood, blood: true }];
  };
}

/** The cut's width along the septum: the defect's caliper on the plane, [a, b] (cm), or null. */
function defectCaliper(D) {
  if (!D || !D.axis) return null;
  const t = perp(D.axis), c = D.cut.c, P = D.cut.poly;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    // where the line c + λ t crosses each edge of the outline
    const a = P[j], b = P[i], e = sub(b, a), den = t[0] * e[1] - t[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, c), lam = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * t[1] - w[1] * t[0]) / den;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    lo = Math.min(lo, lam); hi = Math.max(hi, lam);
  }
  return Number.isFinite(lo) ? [add(c, mul(t, lo)), add(c, mul(t, hi))] : null;
}

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

/** A cavity on the plane round the blood nearest p (cm), or null when it is too small. */
function chamber(ev, p, r = 1.2, cuts = []) {
  const P = cavity(ev, blood(ev, p, r), cuts);
  return P.length >= 12 ? P : null;
}

/** The ASD's flow through the cycle, 0 to 1: left to right through the whole beat, most in late systole and after the atrial wave. */
const asdFlow = (t) => 0.62 + 0.38 * Math.max(Math.exp(-(((t - 330) / 110) ** 2)), Math.exp(-(((t - 820) / 70) ** 2)), Math.exp(-(((t + RR - 820) / 70) ** 2)));
/** The VSD's flow (and its CW envelope) through the cycle, 0 to 1: holosystolic, from the onset of LV contraction. */
const VSD_T0 = 20, VSD_T1 = 395;
const vsdFlow = (t) => { const w = (t - VSD_T0) / (VSD_T1 - VSD_T0); return w > 0 && w < 1 ? Math.pow(Math.sin(Math.PI * w), 0.35) : 0; };

/** The outline P (cm) turned so that its signed area is positive. */
function turned(P) {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]);
  return a < 0 ? P.slice().reverse() : P;
}
/**
 * One outline round two outlines that overlap (cm): a, a bridge to b's nearest point, b, and the
 * bridge back. Both turn the same way, so a point inside either is inside it (the nonzero rule
 * of the jet's clip).
 */
function joined(a, b) {
  if (!a || !b) return a || b;
  a = turned(a); b = turned(b);
  let k = 0, best = Infinity;
  b.forEach((p, i) => { const d = Math.hypot(p[0] - a[0][0], p[1] - a[0][1]); if (d < best) { best = d; k = i; } });
  return [...a, a[0], ...b.slice(k), ...b.slice(0, k), b[k], a[0]];
}
/**
 * A shunt's color on a view with the defect's cut D (DEF): the jet from where the defect opens
 * on the side it leaves, through the defect (its cut joins the chamber's outline j.clip), into the
 * chamber it enters, with its convergence zone in the chamber it leaves (j.pclip).
 */
function shuntJet(c, F, D, j) {
  const [lo, hi] = D.cut.span || [0, 0];
  const o = { ...j, O: add(D.cut.p0, mul(D.axis, lo)), dir: D.axis, jl: j.jl + hi - lo, clip: joined(j.clip, D.cut.poly) };
  // jet() paints into one canvas that every jet on the page shares, and its edges can take the
  // last jet's pixels. An empty jet over a larger box, drawn nowhere, clears that canvas first.
  const none = [[0, 0], [0, 0], [0, 0]];
  jet(c, { ...F, clipBox: new Path2D() }, { ...o, jl: o.jl + 1, jw: o.jw + 1, a: 1, clip: none, pclip: none });
  jet(c, F, o);
}

/** The right heart's targets for the printed RV basal diameter and RA area on heart key. */
function rightHeart(heart, v) {
  const g = rvGrowOf(heart, v.rvb);
  return { rvGrow: g, raGrow: raGrowFor(heart, v.ra, g) };
}

/** The subcostal view of the atrial septum: the ASD, its left-to-right jet, and its caliper. */
function asdSub(ctx, box, v, tt) {
  const heart = heartOf(st);
  P_SUB.draw(ctx, box, titleOf(ctx, box.w, [`SUBCOSTAL · ATRIAL SEPTUM · COLOR ${VA_ASD} cm/s`, `SUBCOSTAL · IAS · ${VA_ASD} cm/s`, 'SC · IAS']), {
    tms: tt, disease: rightHeart(heart, v), shift: ASD_SHIFT,
    shapes: defectShapes('asd', v.d), shapesKey: `asd|${v.d}`,
    names: [['ra', 'RA'], ['la', 'LA']],
    over: (c, F, ev) => {
      const D = DEF.get(ev);
      if (!D || !D.axis) return;
      const O = D.cut.c, dir = D.axis;
      const RA = chamber(ev, add(O, mul(dir, 1.6))), LA = chamber(ev, sub(O, mul(dir, 1.4)));
      const q = ((v.svp - v.svs) * 70) / 60;
      shuntJet(c, F, D, { q, va: VA_ASD, vc: v.d / 10, jl: 1.4 + 1.6 * clamp(v.qpqs - 1, 0, 1.6), jw: v.d / 10 + 0.3, a: asdFlow(cycleAt(tt).t), pisa: false, clip: RA, pclip: LA });
      barFor(c, F, -VA_ASD, VA_ASD);
      const K = defectCaliper(D);
      if (K) cal(c, F, K[0], K[1], '', { solid: true });
    },
    lines: v.d ? [`ASD ${v.d} mm`, 'L→R'] : ['septum intact'],
  });
}

/** Where the RV's name goes: its open blood 2.5 cm from the tricuspid annulus into the RV (as chapter 13). */
function rvName(ev, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), apex = onPlane(ev, ev.anchors(s).apex);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  return blood(ev, add(M, mul(nrm, 2.5)));
}

/** The RV-focused four-chamber view: the right heart's size. The defect shows where the plane cuts it. */
function asdA4c(ctx, box, v, tt) {
  const heart = heartOf(st);
  P_A4C.draw(ctx, box, titleOf(ctx, box.w, ['APICAL FOUR-CHAMBER, RV FOCUSED', 'A4C, RV FOCUSED', 'A4C RV']), {
    tms: tt, disease: rightHeart(heart, v),
    deeper: Math.max(0, 5 * (Math.sqrt(v.ra / 19.7) - 1)),
    shapes: defectShapes('asd', v.d), shapesKey: `asd|${v.d}`,
    names: [['lv', 'LV', 'apex', 0.45], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines: box.w < 260 ? [`RV ${v.rvb.toFixed(1)} cm`] : [`RV base ${v.rvb.toFixed(1)} cm`, [`RA area ${v.ra} cm²`, `RA ${v.ra} cm²`]],
  });
}

/** The short axis at the aortic valve, moved to the LVOT under it: the VSD at about 11 o'clock and its jet into the RV. */
function vsdSax(ctx, box, v, tt) {
  const heart = heartOf(st);
  P_SAX.draw(ctx, box, titleOf(ctx, box.w, [`PSAX · AORTIC VALVE · COLOR ${VA_VSD} cm/s`, `PSAX · AV · ${VA_VSD} cm/s`, 'PSAX · AV']), {
    tms: tt, disease: { lvSize: lvSizeOf(heart, v.lvedd), la: laWeight(v.lavi, heart) }, shift: VSD_SHIFT,
    shapes: defectShapes('vsd', v.d), shapesKey: `vsd|${v.d}`,
    names: [['ra', 'RA'], ['la', 'LA'], ['rvot', 'RVOT']],
    over: (c, F, ev) => {
      const D = DEF.get(ev);
      if (!D || !D.axis) return;
      const O = D.cut.c, dir = D.axis;
      const RV = chamber(ev, add(O, mul(dir, 1.2)), 0.8), LV = chamber(ev, sub(O, mul(dir, 1.0)), 0.8);
      const a = vsdFlow(cycleAt(tt).t);
      const q = Math.PI * (v.d / 20) ** 2 * v.vmax * 100;
      shuntJet(c, F, D, { q, va: VA_VSD, vc: v.d / 10, jl: 1.4 + 2.2 * (v.d / 10), jw: 0.3 + 0.7 * (v.d / 10), a, clip: RV, pclip: LV });
      barFor(c, F, -VA_VSD, VA_VSD);
      const K = defectCaliper(D);
      if (K) cal(c, F, K[0], K[1], '', { solid: true });
    },
    lines: v.d ? [`VSD ${v.d} mm`, 'L→R'] : ['septum intact'],
  });
}

/** The long axis: the LV at the printed LVEDD, with the calipers of chapter 15, and the LA. */
function vsdLax(ctx, box, v, tt) {
  const heart = heartOf(st), size = lvSizeOf(heart, v.lvedd), sy = cycleAt(tt).s;
  P_LAX.draw(ctx, box, titleOf(ctx, box.w, ['PARASTERNAL LONG AXIS', 'PLAX']), {
    tms: tt, disease: { lvSize: size, la: laWeight(v.lavi, heart) }, deeper: Math.max(0, size),
    shapes: defectShapes('vsd', v.d), shapesKey: `vsd|${v.d}`,
    names: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      const K = plaxCalipers(ev, sy);
      if (!K) return;
      const side = [K.dir[1] * 0.1, -K.dir[0] * 0.1];
      cal(c, F, add(K.lv[0], side), add(K.lv[1], side), '');
    },
    lines: [`LVIDd ${v.lvedd} mm`, [`LAVI ${v.lavi} mL/m²`, `LAVI ${v.lavi}`]],
  });
}

// the saline bubbles: random points in a cavity, the same points for the same frame
const hash = (i, f) => { const x = Math.sin(i * 127.1 + f * 311.7) * 43758.5453; return x - Math.floor(x); };
function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** n points inside polygon P (cm), from seed: rejection sampling in its box. */
function pointsIn(P, n, seed) {
  if (!P || n <= 0) return [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = [];
  for (let i = 0; out.length < n && i < n * 40; i++) {
    const x = x0 + hash(i, seed) * (x1 - x0), y = y0 + hash(i + 7919, seed) * (y1 - y0);
    if (inPoly(P, x, y)) out.push([x, y]);
  }
  return out;
}
/** A cavity shut at a valve's hinge line, so that the LA (or the RA) does not run into its ventricle while the valve is open. */
function atrium(ev, anchor, valve) {
  const an = ev.anchors(0), h = hingesOf(ev, valve);
  return chamber(ev, onPlane(ev, an[anchor]), 1.2, h ? [h] : []);
}
const BUB = new WeakMap();   // the bubbles each view drew in its last frame, by chamber
/**
 * The saline bubbles on the four-chamber view in beat b of the study, at fraction u of the beat:
 * the RA and the RV opacified, and n (the LA's count for this beat) bubbles in the LA, drawn
 * over the image as bright points.
 */
function bubbleShapes(b, u, nLA, nLV, frame) {
  return (g, ev) => {
    BUB.delete(ev);
    const op = RA_OP[b - B0] || 0;
    if (!(op > 0) && !(nLA > 0)) return null;
    const RA = atrium(ev, 'ra', 'TricuspidValve'), LA = atrium(ev, 'la', 'MitralValve');
    const an = ev.anchors(0), rvP = rvName(ev, 0);
    const RV = rvP ? chamber(ev, rvP) : null, LV = chamber(ev, onPlane(ev, an.lv));
    // the RV fills from the RA through the beat; it lags it by half a beat
    const opRV = b - B0 >= 1 ? (RA_OP[b - B0 - 1] || 0) * (1 - u) + op * u : op * u * 0.4;
    // the right heart: dense contrast, about 45 bubbles per cm² when full
    const dense = (P, k) => (P ? Math.round(Math.min(900, 45 * k * area(P))) : 0);
    const pts = [
      ...pointsIn(RA, dense(RA, op * (b === 0 ? Math.min(1, 0.3 + u) : 1)), frame),
      ...pointsIn(RV, dense(RV, opRV), frame + 101),
    ];
    const la = pointsIn(LA, nLA, frame + 202), lv = pointsIn(LV, nLV, frame + 303);
    BUB.set(ev, { la: la.length, lv: lv.length });
    const blip = (p) => [p, [p[0] + 0.015, p[1] + 0.01]];
    // the left heart's bubbles are few and counted: each brighter than the contrast in the right heart
    return [{ lines: pts.map(blip), e: 7, w: 0.06, top: true }, { lines: [...la, ...lv].map(blip), e: 12, w: 0.08, top: true }];
  };
}


/** The four-chamber view of the saline study, at the frame tt of beat b of the study. */
function pfoA4c(ctx, box, v, tt, b, man) {
  const n = man === 'rest' ? v.rest : v.val;
  const nLA = laCount(n, man, b);
  // the LV takes the LA's bubbles of the beat before, after the mitral valve opens
  const u = (tt % RR) / RR, filling = clamp((tt % RR - EV.mvo) / 250, 0, 1);
  const nLV = Math.round(laCount(n, man, b - 1) * 0.8 * (1 - filling) + nLA * 0.8 * filling);
  const frame = Math.floor(study.ms / 33);
  const label = b < 0 ? 'before contrast' : b === 0 ? 'contrast reaches the RA' : `beat ${b}`;
  P_BUB.draw(ctx, box, titleOf(ctx, box.w, [`APICAL FOUR-CHAMBER · SALINE · ${man === 'rest' ? 'REST' : 'VALSALVA RELEASE'}`, `A4C · SALINE · ${man === 'rest' ? 'REST' : 'VALSALVA'}`, `A4C · ${man === 'rest' ? 'REST' : 'VALSALVA'}`]), {
    tms: tt, shapes: bubbleShapes(b, u, nLA, nLV, frame), shapesKey: `pfo|${b}|${frame}|${nLA}|${nLV}`,
    names: [['lv', 'LV', 'apex', 0.45], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines: [label, [`LA bubbles ${nLA}`, `LA ${nLA}`]],
  });
}

/** An outflow tract's velocity (m/s) at time t, from its VTI (cm): ejection from t0 for et ms, peaking at fraction k. */
function outflowV(t, vti, t0, et, k) {
  const u = (t - t0) / et;
  if (u <= 0 || u >= 1) return 0;
  const shape = u < k ? Math.sin((u / k) * Math.PI / 2) : Math.cos(((u - k) / (1 - k)) * Math.PI / 2) ** 0.8;
  return (vti / 100) / ((et / 1000) * OUT_AREA[k]) * shape;
}
// the area under each shape over unit time, so that the envelope's integral is its VTI
const OUT_AREA = {};
for (const k of [0.3, 0.4]) {
  let a = 0;
  for (let i = 0; i < 2000; i++) { const u = (i + 0.5) / 2000; a += (u < k ? Math.sin((u / k) * Math.PI / 2) : Math.cos(((u - k) / (1 - k)) * Math.PI / 2) ** 0.8) / 2000; }
  OUT_AREA[k] = a;
}
const RVOT = { t0: EV.avo - 5, et: 320, k: 0.4 }, LVOT = { t0: EV.avo, et: EV.avc - EV.avo, k: 0.3 };

/** PW in an outflow tract: the flow away from the probe, its VTI traced on the first beat. */
function outflowPW(ctx, P, v, side) {
  const rv = side === 'rv', O = rv ? RVOT : LVOT, vti = rv ? v.rvotVti : v.lvotVti, d = rv ? v.rvotD : v.lvotD;
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, rv ? 'PW · RVOT · SHORT AXIS' : 'PW · LVOT · APICAL FIVE-CHAMBER', rv ? 'PW · RVOT' : 'PW · LVOT'));
  const bx = inner(P);
  const peak = outflowV(O.t0 + O.k * O.et, vti, O.t0, O.et, O.k);
  const base = 0.16, vs = Math.max(1, Math.ceil((peak + 0.25) * 5) / 5);
  const fn = (u) => -outflowV((u * 2 * RR) % RR, vti, O.t0, O.et, O.k);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.16, key: `sh${side}|${vti}|${vs}`, seed: rv ? 61 : 62 });
  vscale(ctx, bx, vs, base, 0.5);
  // the VTI traced along the envelope of the first beat
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = O.t0 + (i / 40) * O.et, y = y0 + outflowV(t, vti, O.t0, O.et, O.k) * k;
    i ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y);
  }
  ctx.stroke();
  ctx.restore();
  note(ctx, bx, [`VTI ${vti} cm · Ø ${d.toFixed(1)} cm · SV ${rv ? v.svp : v.svs} mL`, `VTI ${vti} cm · Ø ${d.toFixed(1)} cm`, `${vti} cm · ${d.toFixed(1)} cm`], 'bottom');
  return bx;
}

/** CW through the VSD from the parasternal window: the holosystolic jet toward the probe. */
function vsdCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · VENTRICULAR SEPTAL DEFECT', 'CW · VSD'));
  const bx = inner(P);
  if (!v.d) {
    note(ctx, bx, ['no flow across the septum', 'no VSD flow'], 'top');
    return bx;
  }
  const base = 0.86, vs = Math.max(5, Math.ceil(v.vmax + 0.6));
  const fn = (u) => v.vmax * vsdFlow((u * 2 * RR) % RR);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.4, key: `shvsd|${v.vmax}|${vs}`, seed: 63 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * base) / vs, y0 = bx.y + base * bx.h, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X((VSD_T0 + VSD_T1) / 2), yp = y0 - v.vmax * k;
  caliper(ctx, xp - 14, yp, xp + 14, yp, { solid: true });
  note(ctx, bx, [`peak ${v.vmax.toFixed(1)} m/s · 4V² ${v.grad} mmHg · RVSP ${v.sbp} − ${v.grad} = ${v.rvsp} mmHg`, `${v.vmax.toFixed(1)} m/s · ${v.grad} mmHg · RVSP ${v.rvsp}`, `${v.vmax.toFixed(1)} m/s · RVSP ${v.rvsp}`], 'bottom');
  return bx;
}

/** CW through the tricuspid valve: the TR jet and the RV systolic pressure (as chapter 13). */
function trCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · TRICUSPID REGURGITATION', 'CW · TR'));
  const bx = inner(P);
  const base = 0.28, vs = Math.max(3, Math.ceil(v.trv + 0.6));
  const DUR = EV.mvo + 10 - EV.mvc;
  const fn = (u) => {
    const t = (u * 2 * RR) % RR, w = (t - EV.mvc) / DUR;
    return w > 0 && w < 1 ? -v.trv * Math.pow(Math.sin(Math.PI * w), 0.45) : 0;
  };
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.4, key: `shtr|${v.trv}|${vs}`, seed: 64 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X(EV.mvc + DUR / 2), yp = y0 + v.trv * k;
  caliper(ctx, xp - 14, yp, xp + 14, yp, { solid: true });
  note(ctx, bx, [`peak ${v.trv.toFixed(1)} m/s · 4V² ${v.grad} + RAP ${v.rap} = RVSP ${v.rvsp} mmHg`, `peak ${v.trv.toFixed(1)} m/s · RVSP ${v.rvsp} mmHg`, `${v.trv.toFixed(1)} m/s · RVSP ${v.rvsp}`], 'top');
  return bx;
}

/**
 * The bubbles in the LA beat by beat for one maneuver: bars for the LA's count and a band for the
 * RA's opacification, the window of 3 to 6 beats, and the beat the view shows (cur).
 */
function bubbleStrip(ctx, P, v, man, on, cur) {
  const rest = man === 'rest', n = rest ? v.rest : v.val;
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, rest ? 'SALINE · LA BUBBLES BY BEAT · REST' : 'SALINE · LA BUBBLES BY BEAT · VALSALVA', rest ? 'LA · REST' : 'LA · VALSALVA'));
  // the counts under the title, the beats along the foot, and the RA and the LA named in a gutter
  const fb = firstBeat(n, man);
  note(ctx, { x: P.x, y: P.y + 18, w: P.w, h: 20 }, n
    ? [`first LA bubbles in beat ${fb} · at most ${n} in one frame`, `first in beat ${fb} · at most ${n}`, `beat ${fb} · ${n}`]
    : ['no bubbles in the LA', 'none in the LA'], 'top');
  const g = 22, bx = { x: P.x + g, y: P.y + 42, w: P.w - g - 8, h: P.h - 42 - 20 };
  const cw = bx.w / BEATS, X = (b) => bx.x + (b - B0) * cw;
  const ra = 7, top = Math.max(10, Math.ceil(v.val / 10) * 10 + 5), yb = bx.y + bx.h, ky = (bx.h - ra - 8) / top;
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.55;
  // the window: bubbles from the septum within 3 to 6 beats of full RA opacification
  ctx.fillStyle = 'rgba(127,208,138,0.12)';
  ctx.fillRect(X(1), bx.y, X(4) - X(1), bx.h);
  ctx.fillStyle = 'rgba(127,208,138,0.06)';
  ctx.fillRect(X(4), bx.y, X(7) - X(4), bx.h);
  for (let b = B0; b < B0 + BEATS; b++) {
    // the RA's opacification as a grey band along the top
    const op = RA_OP[b - B0];
    ctx.fillStyle = `rgba(199,205,208,${0.1 + 0.6 * op})`;
    ctx.fillRect(X(b) + 1, bx.y, cw - 2, ra);
    const c = laCount(n, man, b);
    if (c > 0) {
      ctx.fillStyle = SC.cal;
      ctx.fillRect(X(b) + cw * 0.22, yb - c * ky, cw * 0.56, c * ky);
    }
  }
  ctx.strokeStyle = SC.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx.x, yb + 0.5);
  ctx.lineTo(bx.x + bx.w, yb + 0.5);
  ctx.stroke();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.textAlign = 'center';
  // the beats, every other one on a narrow strip
  const every = cw < 20 ? 2 : 1;
  for (let b = B0; b < B0 + BEATS; b++) if ((b - 1) % every === 0) ctx.fillText(String(b), X(b) + cw / 2, yb + 12);
  ctx.textAlign = 'left';
  ctx.fillText('RA', P.x + 4, bx.y + ra);
  ctx.fillText('LA', P.x + 4, yb - 2);
  if (on && cur !== null) {
    ctx.strokeStyle = SC.cal;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(X(cur) + 0.5, bx.y + 0.5, cw - 1, bx.h - 1);
  }
  ctx.restore();
  return bx;
}

function draw(sh) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st), type = v.type;
  // with the cine still (reduced motion), the frame that shows the shunt: late systole across an
  // ASD, mid-systole across a VSD
  const still = type === 'vsd' ? 200 : 330;
  const tt = beat.at(true, still);
  const sweep = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : still / (2 * RR));
  const phone = W < 700;
  const L = phone ? cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8) : [{ x: 16, y: 14, w: W * 0.44 - 16, h: H - 26 }, { x: W * 0.455, y: 14, w: W * 0.545 - 16, h: H - 26 }];
  const [colL, colR] = L, gap = phone ? 8 : 10;
  if (type === 'pfo') {
    const man = manOf(st);
    // the study's clock: the view shows beat b, at the time of the beat the study has reached
    const b = cine.live ? studyBeat() : 4, ts = cine.live ? study.ms % RR : 600;
    pfoA4c(ctx, colL, v, ts, b, man);
    const [r1, r2] = rows(colR, [1, 1], gap);
    bubbleStrip(ctx, r1, v, 'rest', man === 'rest', b);
    bubbleStrip(ctx, r2, v, 'valsalva', man === 'valsalva', b);
    return;
  }
  const [a1, a2] = rows(colL, [1.35, 1], gap);
  if (type === 'asd') {
    asdSub(ctx, a1, v, tt);
    asdA4c(ctx, a2, v, tt);
    const [r1, r2, r3] = rows(colR, [1, 1, 1], gap);
    for (const bx of [outflowPW(ctx, r1, v, 'rv'), outflowPW(ctx, r2, v, 'lv'), trCW(ctx, r3, v)]) sweep(bx);
    return;
  }
  vsdSax(ctx, a1, v, tt);
  vsdLax(ctx, a2, v, tt);
  const [r1, r2, r3] = rows(colR, [1, 1, 1], gap);
  for (const bx of [vsdCW(ctx, r1, v), outflowPW(ctx, r2, v, 'rv'), outflowPW(ctx, r3, v, 'lv')]) sweep(bx);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LEAD = {
  asd: { none: 'No atrial septal defect', small: 'Small secundum ASD', significant: 'Hemodynamically significant secundum ASD' },
  vsd: { none: 'No ventricular septal defect', restrictive: 'Small, restrictive perimembranous VSD', significant: 'Hemodynamically significant perimembranous VSD', raised: 'Perimembranous VSD with an RV systolic pressure of half the systemic pressure or more' },
  pfo: { none: 'No right-to-left shunt on the saline study', valsalva: 'PFO: right-to-left shunt after Valsalva release only', rest: 'PFO: right-to-left shunt at rest and after Valsalva release' },
};
const RVB_WORD = ['normal', 'mildly dilated', 'moderately dilated', 'severely dilated'];
const RVSP_WORD = (p) => (p <= 34 ? 'normal' : p <= 49 ? 'mildly raised' : p <= 69 ? 'moderately raised' : 'severely raised');

function liveOf(v, s, cite) {
  const SV = cite('silvestry2015'), ST = cite('stout2018'), ES = cite('baumgartner2020'), MU = cite('mukherjee2025'), LG = cite('lang2015');
  const qp = `Qp/Qs is (${fmt(v.rvotD, 1)}² × ${v.rvotVti}) ÷ (${fmt(v.lvotD, 1)}² × ${v.lvotVti}) = ${fmt(v.qpqs, 1)}`;
  if (v.type === 'asd') {
    if (v.grade === 'none') return `<b>${LEAD.asd.none}.</b> The atrial septum is intact. The RV basal diameter is ${fmt(v.rvb, 1)} cm and the RA area ${v.ra} cm², both normal${MU}, and the RV and LV stroke volumes are equal (Qp/Qs ${fmt(v.qpqs, 1)}).`;
    const rv = ` The RV basal diameter is ${fmt(v.rvb, 1)} cm (${RVB_WORD[v.rvbG]}) and the RA area ${v.ra} cm² (${v.raBig ? 'enlarged' : 'normal'})${MU}.`;
    const pa = ` The peak TR velocity is ${fmt(v.trv, 1)} m/s, so the RV systolic pressure is ${v.grad} + ${v.rap} = ${v.rvsp} mmHg (${RVSP_WORD(v.rvsp)})${MU}.`;
    if (v.grade === 'small') return `<b>${LEAD.asd.small}.</b> The defect measures ${v.d} mm in the subcostal view, and the shunt is left to right. ${qp}, below 1.5.${rv} The shunt is small: the RV is not dilated${ST}.${pa}`;
    return `<b>${LEAD.asd.significant}.</b> The defect measures ${v.d} mm in the subcostal view, and the shunt is left to right. ${qp}${v.qpqs >= 1.5 ? ', 1.5 or more' : ''}.${rv} RV volume overload is the key finding of a relevant shunt${ES}.${pa}`;
  }
  if (v.type === 'vsd') {
    if (v.grade === 'none') return `<b>${LEAD.vsd.none}.</b> The ventricular septum is intact, and the LV and LA are normal in size: LVEDD ${v.lvedd} mm, LA volume index ${v.lavi} mL/m²${LG}. Qp/Qs is ${fmt(v.qpqs, 1)}.`;
    const cw = ` The peak velocity across the defect is ${fmt(v.vmax, 1)} m/s, a gradient of ${v.grad} mmHg from the LV to the RV; with a systolic blood pressure of ${v.sbp} mmHg, the RV systolic pressure is ${v.sbp} − ${v.grad} = ${v.rvsp} mmHg (${RVSP_WORD(v.rvsp)})${MU}.`;
    const lv = ` The LVEDD is ${v.lvedd} mm (${v.lvBig ? 'enlarged' : 'normal'}) and the LA volume index ${v.lavi} mL/m² (${v.laBig ? 'enlarged' : 'normal'})${LG}.`;
    const head = `The defect measures ${v.d} mm in the short axis, just below the aortic valve at about 11 o'clock, and the shunt is left to right.`;
    if (v.grade === 'restrictive') return `<b>${LEAD.vsd.restrictive}.</b> ${head}${cw} ${qp}.${lv} A small VSD with no LV volume overload and no pulmonary hypertension is restrictive${ES}.`;
    if (v.grade === 'significant') return `<b>${LEAD.vsd.significant}.</b> ${head} ${qp}.${lv}${cw} The LV volume overload and the Qp/Qs of 1.5 or more make the shunt hemodynamically significant${ST}.`;
    return `<b>${LEAD.vsd.raised}.</b> ${head}${cw} That is ${Math.round((100 * v.rvsp) / v.sbp)}% of the systolic blood pressure. ${qp}.${lv} With a systolic PA pressure of 50% of the systemic pressure or more, the pulmonary vascular resistance should be measured before closure is considered${ST}.`;
  }
  const fb = firstBeat(v.val, 'valsalva'), fr = firstBeat(v.rest, 'rest');
  if (v.grade === 'none') return `<b>${LEAD.pfo.none}.</b> The agitated saline fills the RA and the RV, and no bubbles reach the LA at rest or after Valsalva release. An adequate Valsalva maneuver moves the atrial septum toward the LA at its release${SV}.`;
  const val = `After Valsalva release, bubbles reach the LA in beat ${fb} after full RA opacification, at most ${v.val} in one frame`;
  if (v.grade === 'valsalva') return `<b>${LEAD.pfo.valsalva}.</b> At rest no bubbles reach the LA. ${val}: within 3–6 beats, an intracardiac shunt such as a PFO${SV}.`;
  return `<b>${LEAD.pfo.rest}.</b> At rest, bubbles reach the LA in beat ${fr}, at most ${v.rest} in one frame. ${val}: within 3–6 beats, an intracardiac shunt such as a PFO${SV}.`;
}

const shuntsPage = {
  key: 'shunts',
  part: 'congenital',
  title: 'Shunts: ASD, VSD and PFO',
  nav: 'Shunts',
  dwell: 30,
  defaults: { shS: 0.55, shType: 'asd', shMan: 'valsalva' },
  format: {
    shS: (x, s) => {
      const type = s ? typeOf(s) : 'asd', g = gradeOf(x, type);
      const name = { asd: 'ASD', vsd: 'VSD', pfo: 'PFO' }[type];
      if (type === 'pfo') return { none: 'no shunt', valsalva: 'Valsalva only', rest: 'at rest' }[g];
      return g === 'none' ? `no ${name}` : g === 'raised' ? `${name}, RVSP ≥50%` : `${g} ${name}`;
    },
  },
  watch: ['shS', 'shType', 'shMan', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    for (const type of TYPES) BANDS_OF[type] = bands((x) => gradeOf(x, type));
    paintFor(state);
  },
  onState(s, ch) {
    if (TYPE in ch) paintFor(s);
    // the saline study starts again from the injection when the PFO comes up or the maneuver changes
    if ((TYPE in ch && typeOf(s) === 'pfo') || MAN in ch) study.ms = 0;
  },
  // the heart model and the targets load at idle, before the chapter opens (main.js warms every chapter)
  enter() { for (const p of PANELS) p.start(); },
  warm() { for (const p of PANELS) p.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS_OF[typeOf(s)]);
    const live = beat.tick(dt, true);
    if (live) study.ms = (study.ms + dt * 1000) % (BEATS * RR);
    if (live && sheet) sheet.dirty = true;
  },
  // the sequence: a secundum ASD from none to large, a perimembranous VSD, then a PFO on the saline
  // study with Valsalva
  tourEnter(set) { set({ shS: 0, shType: 'asd', shMan: 'valsalva' }); },
  tourTick(tt, set) {
    const at = (t0) => Math.round(clamp((tt - t0) / 8.5, 0, 1) * 200) / 200;
    if (tt < 10) set({ shType: 'asd', shS: at(0.5) });
    else if (tt < 20) set({ shType: 'vsd', shS: at(10.5) });
    else set({ shType: 'pfo', shMan: 'valsalva', shS: at(20.5) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse): the sequence continues from it
  tourAt(s) { const t0 = { asd: 0.5, vsd: 10.5, pfo: 20.5 }[typeOf(s)]; return t0 + s.shS * 8.5; },
  text(s, { cite }) {
    const v = shown(s);
    if (typeof document !== 'undefined') {
      // the maneuver's switch shows only for the saline study
      const man = document.getElementById('sh-man');
      if (man) man.hidden = v.type !== 'pfo';
      // the slider's label and bands: main.js writes the label when shS changes, and the defect can change it alone
      const o = document.querySelector('output[data-for="shS"]'), t = shuntsPage.format.shS(s[KEY], s);
      if (o && o.textContent !== t) o.textContent = t;
      paintFor(s);
    }
    let readouts;
    if (v.type === 'asd') {
      readouts = [
        { k: 'ASD diameter', v: fmt(v.d), u: 'mm', flag: v.d > 0 },
        { k: 'Shunt', v: v.shunt, text: true, flag: v.d > 0 },
        { k: 'Qp/Qs', v: fmt(v.qpqs, 1), flag: v.qpqs >= 1.5 },
        { k: 'RV basal diameter', v: fmt(v.rvb, 1), u: 'cm', flag: v.rvbG > 0 },
        { k: 'RA area', v: fmt(v.ra), u: 'cm²', flag: v.raBig },
        { k: 'RV systolic pressure', v: fmt(v.rvsp), u: 'mmHg', flag: v.rvsp > 34 },
      ];
    } else if (v.type === 'vsd') {
      readouts = [
        { k: 'VSD diameter', v: fmt(v.d), u: 'mm', flag: v.d > 0 },
        { k: 'Shunt', v: v.shunt, text: true, flag: v.d > 0 },
        { k: 'Qp/Qs', v: fmt(v.qpqs, 1), flag: v.qpqs >= 1.5 },
        { k: 'VSD peak velocity', v: v.d ? fmt(v.vmax, 1) : '–', u: v.d ? 'm/s' : '', flag: false },
        { k: 'RV systolic pressure', v: v.d ? fmt(v.rvsp) : '–', u: v.d ? 'mmHg' : '', flag: v.d > 0 && v.rvsp > 34 },
        { k: 'LVEDD', v: fmt(v.lvedd), u: 'mm', flag: v.lvBig },
      ];
    } else {
      const man = manOf(s), n = man === 'rest' ? v.rest : v.val;
      readouts = [
        { k: 'Shunt', v: v.shunt, text: true, flag: v.grade !== 'none' },
        { k: 'LA bubbles, rest', v: fmt(v.rest), flag: v.rest > 0 },
        { k: 'LA bubbles, Valsalva', v: fmt(v.val), flag: v.val > 0 },
        { k: `First LA bubbles, ${man === 'rest' ? 'rest' : 'Valsalva'}`, v: n ? `beat ${firstBeat(n, man)}` : '–', text: true, flag: false },
      ];
    }
    return { readouts, live: liveOf(v, s, cite) };
  },
};

/**
 * For the checks: each view's EchoView, the defect's caliper (cm) each view drew in its last
 * frame (null where it drew none), and the bubbles the saline view drew in the LA and the LV.
 */
export function drawn() {
  const P = { sub: P_SUB, a4c: P_A4C, sax: P_SAX, lax: P_LAX, bub: P_BUB };
  const width = (p) => {
    const K = p.ev ? defectCaliper(DEF.get(p.ev)) : null;
    return K ? Math.hypot(K[1][0] - K[0][0], K[1][1] - K[0][1]) : null;
  };
  return {
    views: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.ev || null])),
    caliper: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, width(p)])),
    bubbles: P_BUB.ev ? BUB.get(P_BUB.ev) || null : null,
  };
}

let painted = '';
function paintFor(s) {
  const type = typeOf(s);
  if (type === painted || typeof document === 'undefined') return;
  painted = type;
  const named = (o) => Object.fromEntries(Object.entries(o).map(([g, x]) => [LABEL[g] || g, x]));
  paintBands(document.getElementById('sh-grades'), BANDS_OF[type].map((b) => ({ ...b, g: LABEL[b.g] || b.g })), named(LEVEL), named(SHORT));
}

export default shuntsPage;
