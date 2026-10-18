// Constrictive pericarditis and, for comparison, restrictive cardiomyopathy: the model, the figure
// and the text of the constriction modes of Pericardial disease (ch/peri.js). In constriction a
// thick, stiff pericardium fixes the volume of the heart. The inspiratory fall in intrathoracic
// pressure does not reach the chambers, so LV filling falls and RV filling rises with inspiration.
// The septum shifts toward the LV, and the hepatic veins reverse in expiration. The mitral annulus
// keeps its early diastolic velocity, and the medial e′ exceeds the lateral e′ (annulus reversus).
// The Mayo Clinic criteria grade constriction (Welch 2014). Restrictive cardiomyopathy takes the
// diastolic grade of the 2025 ASE algorithm (Nagueh 2025, Figure 3; fill.js lapAlgorithm). That
// guideline does not apply its algorithm in constriction. The values are teaching values set
// inside the cited cut-offs, not patient data. The hidden chapter ch/constrict.js shows the same
// figure on a page of its own.
import { clamp, MONO } from './sketch.js';
import { panel, spectral, vscale, SC, caliper, tagBox } from './scope.js';
import { RR, EV, cycleAt, mitralV } from './cyclemodel.js';
import { tracks, cursor, rows, cols, inner, meters, note, fit, shown, waveLetter, gradeTable } from './sev.js';
import { drawIVC } from './echo2d.js';
import { mmode, DB } from './bmode.js';
import { MeshPanel } from './meshpanel.js';
import { laWeight, raWeight } from './meshcal.js';
import { onPlane, hingesOf, middle, sub, add, mul, dot, unit, perp } from './meshjet.js';
import { rapEstimate } from './norms.js';
import { lapAlgorithm } from './ch/fill.js';
import { reducedMotion } from './state.js';

/** The two diseases of the figure: constriction and restrictive cardiomyopathy. */
export const MODES = ['cp', 'rcm'];
const BREATH = 5 * RR;     // ms: 14 breaths a minute, five beats to a breath
const STRIP = 2 * BREATH;  // ms across each Doppler and M-mode strip: two breaths, ten beats
const SHIFT_CUT = 3;       // mm: the page calls the septum's respiratory shift present from here (the guidelines give no size)
const MM_DEPTH = 14;       // cm: the depth of the septal M-mode, deep enough that the breathing trace clears the pericardium

// ---------------------------------------------------------------- the model
// The tracks over the slider for each disease. The variations are (expiration − inspiration) ÷
// expiration. The hepatic vein's reversal ratio is the end-diastolic reversal velocity ÷ the
// diastolic forward velocity, both in expiration.
const TRACKS = {
  cp: tracks([0, 0.2, 0.4, 0.7, 1], {
    thick: [2, 2.3, 4.5, 7, 9],          // mm, the pericardium
    shift: [0, 0.3, 1.6, 6, 8],          // mm, the septum's excursion at end-diastole, inspiration against expiration
    bounce: [0, 0, 1.2, 3, 3.5],         // mm, its early diastolic notch toward the LV (drawn, not printed)
    mvVar: [5, 6, 18, 30, 38],           // %, the fall of mitral E with inspiration
    tvVar: [12, 14, 30, 50, 65],         // %, the rise of tricuspid E with inspiration
    eMed: [10, 10, 11, 12.5, 13],        // cm/s, the medial mitral annulus's e′
    eLat: [13, 12.5, 10.5, 9, 8.5],      // cm/s, the lateral e′
    sP: [8, 8, 8, 7.5, 7],               // cm/s, s′ (drawn only)
    aP: [9, 9, 7, 5, 4.5],               // cm/s, a′ (drawn only)
    E: [0.75, 0.78, 0.9, 1.0, 1.05],     // m/s, mitral E in expiration
    A: [0.55, 0.55, 0.45, 0.38, 0.35],   // m/s, mitral A in expiration
    DT: [190, 185, 160, 140, 130],       // ms, the deceleration time of E
    Et: [0.55, 0.55, 0.52, 0.5, 0.48],   // m/s, tricuspid E in expiration
    At: [0.4, 0.4, 0.32, 0.27, 0.25],    // m/s, tricuspid A in expiration
    hv: [0.3, 0.32, 0.5, 0.8, 1.0],      // the hepatic vein expiratory diastolic reversal ratio
    hS: [0.45, 0.45, 0.4, 0.36, 0.33],   // m/s, the hepatic vein's systolic forward velocity
    hDi: [0.3, 0.3, 0.33, 0.35, 0.36],   // m/s, its diastolic forward velocity in inspiration
    hDe: [0.28, 0.27, 0.24, 0.21, 0.19], // m/s, and in expiration
    hRi: [0.3, 0.3, 0.25, 0.2, 0.18],    // the end-diastolic reversal in inspiration, as a share of D
    ivc: [1.6, 1.7, 1.9, 2.4, 2.6],      // cm
    coll: [60, 58, 54, 25, 15],          // %, the IVC's collapse with a sniff
    lavi: [25, 26, 32, 38, 44],          // mL/m², the LA volume index
    tr: [2.3, 2.3, 2.5, 2.6, 2.7],       // m/s, the peak TR velocity
  }),
  rcm: tracks([0, 0.2, 0.45, 0.75, 1], {
    thick: [2, 2, 2, 2, 2],
    shift: [0, 0, 0, 0, 0],
    bounce: [0, 0, 0, 0, 0],
    mvVar: [5, 5, 6, 7, 8],
    tvVar: [12, 12, 13, 15, 16],
    eMed: [10, 6, 5, 4, 3.5],
    eLat: [13, 8, 6.5, 5, 4],
    sP: [8, 7, 6, 5, 4.5],
    aP: [9, 8, 7, 5, 4],
    E: [0.75, 0.55, 0.72, 1.0, 1.15],
    A: [0.55, 0.8, 0.76, 0.5, 0.4],
    DT: [190, 240, 200, 160, 130],
    Et: [0.55, 0.45, 0.5, 0.65, 0.75],
    At: [0.4, 0.5, 0.45, 0.3, 0.25],
    hv: [0.3, 0.3, 0.32, 0.35, 0.38],
    hS: [0.45, 0.42, 0.32, 0.22, 0.18],
    hDi: [0.3, 0.32, 0.38, 0.42, 0.45],
    hDe: [0.28, 0.3, 0.36, 0.4, 0.42],
    hRi: [0.3, 0.4, 0.55, 0.75, 0.9],
    ivc: [1.6, 1.7, 1.9, 2.3, 2.5],
    coll: [60, 58, 52, 30, 20],
    lavi: [25, 34, 40, 52, 60],
    tr: [2.3, 2.4, 2.6, 3.0, 3.3],
  }),
};

/**
 * The values as the page prints them, and what follows from them. The Mayo Clinic criteria come
 * from these values (Welch 2014). For restrictive cardiomyopathy, so does the 2025 ASE algorithm.
 * So no grade or sentence contradicts a number on screen. e′ prints in whole cm/s, so the criteria
 * medial e′ ≥9 cm/s (Welch 2014) and >8 cm/s (ESC 2025) agree. The reversal ratio prints in
 * hundredths, so ≥0.79 and >0.78 agree.
 */
function measure(raw, mode) {
  const v = { ...raw, mode };
  for (const k of ['thick', 'shift', 'mvVar', 'tvVar', 'eMed', 'eLat', 'DT', 'coll', 'lavi']) v[k] = shown(raw[k]);
  for (const k of ['E', 'A', 'Et', 'At', 'hv']) v[k] = shown(raw[k], 2);
  v.ivc = shown(raw.ivc, 1);
  v.tr = shown(raw.tr, 1);
  v.ea = shown(v.E / v.A, 1);
  v.eAvg = (v.eMed + v.eLat) / 2;
  v.ee = shown((100 * v.E) / v.eAvg, 1);
  v.Ei = shown(v.E * (1 - v.mvVar / 100), 2);      // mitral E at the first beat of inspiration
  v.Eti = shown(v.Et * (1 + v.tvVar / 100), 2);    // tricuspid E in inspiration
  v.rapE = rapEstimate({ d: v.ivc, col: v.coll, mode: 'sniff', sec: 'unclear' });
  v.rap = v.rapE.rap;
  v.crit = { shift: v.shift >= SHIFT_CUT, e: v.eMed >= 9, hv: v.hv >= 0.79 };
  v.n = v.crit.shift + v.crit.e + v.crit.hv;
  v.mayo = v.crit.shift && (v.crit.e || v.crit.hv);
  v.reversus = v.eMed > v.eLat;
  // the average E/e′ is the one printed, so the algorithm reads it alone (not the septal or lateral ratio)
  v.lap = lapAlgorithm({ sep: v.eMed, lat: v.eLat, avg: v.eAvg, eeAvg: v.ee, tr: v.tr, ea: v.ea, lavi: v.lavi });
  v.grade = mode === 'cp' ? cpGrade(v) : rcmGrade(v.lap);
  return v;
}
/** Constriction by the Mayo Clinic criteria; before them, a pericardium thicker than the normal 1–2 mm. */
function cpGrade(v) {
  if (v.mayo) return v.n === 3 ? 'all three' : 'constriction';
  return v.thick > 2 ? 'thickened' : 'normal';
}
/** Restrictive cardiomyopathy by the diastolic grade of Nagueh 2025, Figure 3. */
const rcmGrade = (r) => (r.grade === null ? 'not graded' : r.grade === 0 ? 'normal' : `grade ${r.grade}`);

/** The values at slider position x of a disease (cp or rcm). */
export const valuesAt = (x, mode) => measure(TRACKS[mode](x), mode);
/** valuesAt, kept for the last position and disease: a figure asks every frame. One for each page. */
export function valuesCache() {
  let last = '', v = null;
  return (x, mode) => {
    const key = `${x}|${mode}`;
    if (key !== last || !v) { last = key; v = valuesAt(x, mode); }
    return v;
  };
}
export const gradeOf = (x, mode = 'cp') => valuesAt(x, mode).grade;

export const LEVELS = { normal: 0, thickened: 1, constriction: 2, 'all three': 3, 'grade 1': 1, 'grade 2': 2, 'grade 3': 3, 'not graded': 1 };
export const SHORT = { cp: { thickened: 'thick', constriction: 'CP', 'all three': '3 of 3' }, rcm: { 'grade 1': 'G1', 'grade 2': 'G2', 'grade 3': 'G3' } };
/** The slider's label. */
export const LABEL = {
  cp: { normal: 'normal', thickened: 'thickened pericardium', constriction: 'constriction', 'all three': 'constriction, 3 of 3 criteria' },
  rcm: { normal: 'normal', 'grade 1': 'restriction, grade 1', 'grade 2': 'restriction, grade 2', 'grade 3': 'restriction, grade 3', 'not graded': 'not graded' },
};
// the figure's clock (ms, constrictionFigure): the beat and the breath run on it while the cine
// runs. It starts in end-diastole near the middle of inspiration, the frame a still image shows.
const CLOCK0 = BREATH * 0.25 - (BREATH * 0.25) % RR;
/** The breath at time t (ms): 0 at the end of expiration; inspiration from 0 to 0.5. */
const phaseAt = (t) => (((t % BREATH) + BREATH) % BREATH) / BREATH;
/** 1 in inspiration, 0 in expiration, with short ramps at the turns. */
const inspOf = (f) => clamp(Math.min(f - 0.005, 0.495 - f) / 0.015 + 0.5, 0, 1);
/** The septum toward the LV in inspiration and toward the RV in expiration, -1 to 1. */
const swingOf = (t) => Math.sin(2 * Math.PI * phaseAt(t));
// The beats' end-diastoles fall at fifths of the breath, so the most inspiratory and the most
// expiratory of them see the swing at ±sin(0.4π). The septum's swing is scaled so that the
// excursion between those two end-diastoles, where an M-mode measures it, is the printed shift.
const ED_SWING = Math.sin(0.4 * Math.PI);
/** The septum's respiratory displacement toward the LV at time t (cm). */
const sepShiftCm = (v, t) => (v.shift / 20 / ED_SWING) * swingOf(t);
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);

// ---------------------------------------------------------------- the four-chamber view
// The apical four-chamber view cut from the heart mesh (meshpanel.js), on the heart that the page
// shows. periThick moves the pericardium out from the heart by half its extra width. Its bright
// line takes the printed thickness and brightens as it thickens (echo.js periW, periE). The atria
// take the printed LA volume index (la, laWeight), the RA in proportion (raGrow, raWeight). The
// septum moves within the beat (sep): toward the LV in inspiration, back in expiration, with an
// early diastolic bounce. Its excursion between the most inspiratory and the most expiratory
// end-diastole is the printed shift.
const DISEASES = ['periThick', 'la', 'raGrow', 'sep'];
// cm the septum moves on the four-chamber plane per unit of sep weight, by heart. It was measured
// at the septum's middle, half way from the apex to the mitral valve, square to the LV axis. Each
// value is the mean of end-diastole and early diastole (520 ms), for weights -0.4 to 0.4.
const SEP_CM = { normal: 0.95, amyloid: 0.91, icm: 0.97, barlow: 0.96, bav: 0.94 };
const RA_PER_LA = 27.6 / 25.3;   // the normal heart's RA and LA volume indexes (meshcal.js)

/**
 * The time of the walls' motion for real time t (ms) in the beat. In a restrictive filling
 * pattern the ventricles fill fast in early diastole and then stop ("diastolic checking"). So
 * diastole runs ahead, more as the deceleration time shortens. The valves keep real time.
 */
function wallTime(t, v) {
  const k = clamp((190 - v.DT) / 60, 0, 1);
  if (!k || t <= EV.mvo || t >= EV.aOn) return t;
  const f = (t - EV.mvo) / (EV.aOn - EV.mvo);
  return EV.mvo + (1 - Math.pow(1 - f, 1 + 2 * k)) * (EV.aOn - EV.mvo);
}

/** The mesh weights for the values v at time t (ms of the page's clock). */
function meshOf(v, t, heart) {
  const tb = ((t % RR) + RR) % RR;
  const k = SEP_CM[heart] || SEP_CM.normal;
  // the septum: the breath's swing, and the early diastolic bounce, larger in inspiration (Klein 2013)
  const g = inspOf(phaseAt(t));
  const b = v.bounce * (0.6 + 0.4 * g) * bump(tb, EV.mvo + 15, EV.mvo + 175, EV.mvo + 65);
  const sep = (sepShiftCm(v, t) + b / 10) / k;
  return {
    disease: { periThick: Math.max(0, (v.thick / 10 - 0.15) / 2), la: laWeight(v.lavi, heart), raGrow: raWeight(v.lavi * RA_PER_LA, heart) },
    motion: { sep },
  };
}

function a4c(ctx, box, v, t, mesh, heart) {
  const M = meshOf(v, t, heart), tb = ((t % RR) + RR) % RR;
  mesh.draw(ctx, box, fit(box.w, 'APICAL FOUR-CHAMBER', 'A4C'), {
    tms: wallTime(tb, v), drive: () => cycleAt(tb).drive,
    disease: M.disease, motion: M.motion,
    peri: { w: v.thick / 10, e: 8 + 10 * clamp((v.thick - 2) / 7, 0, 1) },
    // deeper as the atria grow (their length as the cube root of the LA volume, 5 cm at the normal heart's)
    deeper: Math.max(0, 5 * (Math.cbrt(v.lavi / 25.3) - 1)),
    names: [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
    lines: box.w < 260 ? [`peri ${v.thick} mm`, `LAVi ${v.lavi}`] : [`Pericardium ${v.thick} mm`, `LA volume index ${v.lavi} mL/m²`],
    over: (c, F, ev) => periCaliper(c, F, ev, v),
  });
}

/**
 * A caliper across the pericardium beside the LV lateral wall, 62% of the way from the apex to the
 * mitral valve. There the sector holds the whole line. The caliper runs square to the line, from
 * its inner to its outer edge.
 */
function periCaliper(c, F, ev, v) {
  if (v.thick < 3) return;
  const h = hingesOf(ev, 'MitralValve');
  if (!h || !ev.periDrawn) return;
  const s = 0, an = ev.anchors(s);
  const apex = onPlane(ev, an.apex), mv = middle(h), M = add(apex, mul(sub(mv, apex), 0.62));
  let d = perp(unit(sub(mv, apex)));
  if (dot(sub(onPlane(ev, an.rv), M), d) > 0) d = mul(d, -1);   // toward the lateral wall
  // where the ray square to the LV axis first crosses the pericardium's line, and the line's direction there
  let best = null;
  for (const P of ev.periDrawn) for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], e = sub(b, a), den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, M), tt = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (u >= 0 && u <= 1 && tt > 0.5 && (!best || tt < best.t)) best = { t: tt, e };
  }
  if (!best) return;
  const X = add(M, mul(d, best.t));
  let n = perp(unit(best.e));
  if (dot(n, d) < 0) n = mul(n, -1);
  const half = v.thick / 20;
  const [x0, y0] = F.P(add(X, mul(n, -half))), [x1, y1] = F.P(add(X, mul(n, half)));
  c.save();
  c.beginPath();
  c.rect(F.view.box.x, F.view.box.y, F.view.box.w, F.view.box.h);
  c.clip();
  caliper(c, x0, y0, x1, y1, { solid: true, size: 3 });
  c.restore();
}

// ---------------------------------------------------------------- Doppler with breathing
/** The breath's share of inspiration at time tb of beat b of a strip. */
const inspAt = (b, tb) => inspOf(phaseAt(b * RR + tb));

/** Mitral or tricuspid inflow over two breaths: E falls (mitral) or rises (tricuspid) in inspiration. */
function inflowFn(v, side) {
  const mv = side === 'mv';
  return (u) => {
    const t = u * STRIP, b = Math.floor(t / RR), tb = t - b * RR;
    const g = inspAt(b, EV.mvo + 70);
    const k = mv ? 1 - (v.mvVar / 100) * g : 1 + (v.tvVar / 100) * g;
    return mitralV(mv ? tb : tb + 6, (mv ? v.E : v.Et) * k, (mv ? v.A : v.At) * k, v.DT);
  };
}

/** The breathing trace along the foot of a strip, rising in inspiration, with its phases named. */
function resp(ctx, bx) {
  const y0 = bx.y + bx.h - 6, amp = 4;
  ctx.save();
  ctx.strokeStyle = SC.ecg;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= bx.w; x += 2) {
    const y = y0 + amp * Math.cos(2 * Math.PI * phaseAt((x / bx.w) * STRIP));
    if (x) ctx.lineTo(bx.x + x, y); else ctx.moveTo(bx.x, y);
  }
  ctx.stroke();
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = SC.ecg;
  ctx.textAlign = 'center';
  const out = [];
  for (let k = 0; k < STRIP / BREATH; k++) {
    for (const [f, name] of [[0.25, 'insp'], [0.75, 'exp']]) out.push(waveLetter(ctx, name, bx.x + ((k + f) * BREATH / STRIP) * bx.w, y0 - amp - 3));
  }
  ctx.restore();
  return out;
}

/** A small mark and its name at a peak: x (ms in the strip), the velocity (m/s), on box bx. */
function peakMark(ctx, bx, y0, k, ms, vel, name, below = false) {
  const x = bx.x + (ms / STRIP) * bx.w, y = y0 - vel * k;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.fillStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.stroke();
  ctx.font = `500 10px ${MONO}`;
  ctx.textAlign = 'center';
  const box = waveLetter(ctx, name, x, below ? y + 12 : y - 4);
  ctx.restore();
  return box;
}

function inflowPW(ctx, P, v, side) {
  const mv = side === 'mv';
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, mv ? 'PW · MITRAL INFLOW, WITH BREATHING' : 'PW · TRICUSPID INFLOW, WITH BREATHING', mv ? 'PW · MV' : 'PW · TV'));
  const bx = inner(P);
  const base = 0.8, scale = 1.4;
  spectral(ctx, bx, { fn: inflowFn(v, side), scale, base, mode: 'pw', broad: 0.1, key: `con${side}|${v.E}|${v.A}|${v.Et}|${v.At}|${v.DT}|${v.mvVar}|${v.tvVar}`, seed: mv ? 81 : 82 });
  vscale(ctx, bx, scale, base, 0.5);
  const labels = resp(ctx, bx);
  // the first beat of inspiration and the first of expiration of the second breath (beats 5 and 7)
  const y0 = bx.y + base * bx.h, k = (bx.h * base) / scale, pk = EV.mvo + 70;
  const ei = mv ? v.Ei : v.Eti, ee = mv ? v.E : v.Et;
  const marks = bx.w > 230 ? [peakMark(ctx, bx, y0, k, 5 * RR + pk, ei, 'Ei'), peakMark(ctx, bx, y0, k, 7 * RR + pk, ee, 'Ee')] : [];
  const V = mv ? v.mvVar : v.tvVar;
  note(ctx, bx, mv
    ? [`E ${v.E.toFixed(2)} exp · ${v.Ei.toFixed(2)} m/s insp: −${V}% · E/A ${v.ea.toFixed(1)}`, `E −${V}% with inspiration · E/A ${v.ea.toFixed(1)}`, `E −${V}% insp`, `−${V}%`]
    : [`E ${v.Et.toFixed(2)} exp · ${v.Eti.toFixed(2)} m/s insp: +${V}%`, `E +${V}% with inspiration`, `E +${V}% insp`, `+${V}%`], 'auto', [...marks, ...labels]);
  return bx;
}

/** Tissue Doppler of the mitral annulus, one beat: s′ toward the probe, e′ and a′ away. */
function tissueFn(v, eP) {
  return (u) => {
    const t = u * RR;
    if (t > 70 && t < 330) return (v.sP / 100) * Math.sin((Math.PI * (t - 70)) / 260) ** 0.9;
    if (t > EV.mvo - 10 && t < EV.mvo + 140) return -(eP / 100) * Math.sin((Math.PI * (t - EV.mvo + 10)) / 150);
    if (t > 770 && t < RR) return -(v.aP / 100) * Math.sin((Math.PI * (t - 770)) / (RR - 770));
    return 0;
  };
}
function tdiPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'TISSUE DOPPLER · MEDIAL | LATERAL ANNULUS', 'TDI · MED | LAT'));
  const bx0 = inner(P);
  const hw = (bx0.w - 8) / 2, scale = 0.18, base = 0.4;
  const out = [];
  for (const [i, eP, name] of [[0, v.eMed, 'medial'], [1, v.eLat, 'lateral']]) {
    const bx = { x: bx0.x + i * (hw + 8), y: bx0.y, w: hw, h: bx0.h };
    spectral(ctx, bx, { fn: tissueFn(v, eP), scale, base, mode: 'pw', broad: 0.25, key: `contdi|${name}|${eP}|${v.sP}|${v.aP}`, seed: 83 + i });
    const k = (bx.h * (1 - base)) / scale, y0 = bx.y + base * bx.h;
    const x = bx.x + ((EV.mvo + 65) / RR) * bx.w, y = y0 + (eP / 100) * k;
    caliper(ctx, x - 9, y, x + 9, y, { solid: true, size: 2.5 });
    // the name clear of the caliper and of the s′ wave above the baseline
    const X = (ms) => bx.x + (ms / RR) * bx.w;
    const avoid = [{ x0: x - 12, x1: x + 12, y0: y - 6, y1: y + 6 }, { x0: X(60), x1: X(340), y0: y0 - (v.sP / 100) * k - 2, y1: y0 }];
    note(ctx, bx, [`${name} e′ ${eP} cm/s`, `e′ ${eP} cm/s`, `e′ ${eP}`], 'auto', avoid);
    out.push(bx);
  }
  vscale(ctx, out[1], scale, base, 0.1, 'cm/s', { cm: true });
  return out;
}

/** Hepatic vein flow over two breaths, PW from below: forward flow toward the heart below the baseline. */
function hvFn(v) {
  return (u) => {
    const t = u * STRIP, b = Math.floor(t / RR), tb = t - b * RR;
    const g = inspAt(b, EV.mvo + 110);
    const D = g * v.hDi + (1 - g) * v.hDe;
    // the reversal at end-diastole: in expiration the printed ratio of D; in inspiration a share of D
    const R = g * v.hRi * v.hDi + (1 - g) * v.hv * v.hDe;
    return -v.hS * bump(tb, 70, 400, 220) + 0.07 * bump(tb, 395, 470, 425) - D * bump(tb, EV.mvo + 15, 745, EV.mvo + 105) + R * bump(tb, 752, RR - 2, 812);
  };
}
function hvPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · HEPATIC VEIN, WITH BREATHING', 'PW · HV'));
  const bx = inner(P);
  const base = 0.42, scale = 0.8;
  spectral(ctx, bx, { fn: hvFn(v), scale, base, mode: 'pw', broad: 0.14, key: `conhv|${v.hv}|${v.hS}|${v.hDi}|${v.hDe}|${v.hRi}`, seed: 84 });
  vscale(ctx, bx, scale, base, 0.5, '');
  const labels = resp(ctx, bx);
  const y0 = bx.y + base * bx.h, k = (bx.h * (1 - base)) / scale;
  // the first beat of expiration of the second breath: its diastolic forward velocity and its end-diastolic reversal
  const marks = bx.w > 230 ? [peakMark(ctx, bx, y0, k, 7 * RR + EV.mvo + 105, -v.hDe, 'D', true), peakMark(ctx, bx, y0, k, 7 * RR + 812, v.hv * v.hDe, 'DR')] : [];
  const insp = v.mode === 'rcm' && v.hRi * v.hDi > v.hv * v.hDe;
  note(ctx, bx, [`expiration DR/D ${v.hv.toFixed(2)}${insp ? ' · reversal larger in inspiration' : ''}`, `exp DR/D ${v.hv.toFixed(2)}`, `${v.hv.toFixed(2)}`], 'auto', [...marks, ...labels]);
  return bx;
}

// ---------------------------------------------------------------- M-mode of the septum
// One beam across the RV, the septum, the LV and its posterior wall, over two breaths, as in a
// parasternal M-mode (depths in cm). The septum moves toward the LV in inspiration by the printed
// excursion. In early diastole it notches toward the LV (the bounce). The thick pericardium in
// front of the RV and behind the posterior wall moves with the wall next to it.
function septumLayers(v) {
  const T = v.thick / 10, eP = 8 + 10 * clamp((v.thick - 2) / 7, 0, 1);
  return (u) => {
    const t = u * STRIP, b = Math.floor(t / RR), tb = t - b * RR;
    const sy = cycleAt(wallTime(tb, v)).s;
    const g = inspOf(phaseAt(t));
    const bounce = (v.bounce / 10) * (0.6 + 0.4 * g) * bump(tb, EV.mvo + 15, EV.mvo + 175, EV.mvo + 65);
    const sc = 3.7 + sepShiftCm(v, t) + bounce + 0.45 * sy;               // the septum's middle
    const sh = 0.45 + 0.2 * sy;                                              // half its thickness
    const pw = 8.55 - 1.0 * sy, pwT = 0.9 + 0.45 * sy;                       // posterior wall: endocardium, thickness
    const rvw = 1.0 + T + 0.08 - 0.15 * sy;                                  // RV free wall's outer face
    return [
      [0, 0.85, 2, 0],
      [rvw - T - 0.08, rvw - 0.08, eP, -0.15 * sy],
      [rvw, rvw + 0.45, DB.myo - 2, -0.15 * sy],
      [sc - sh, sc + sh, DB.myo, sc - 3.7],
      [pw, pw + pwT, DB.myo, pw - 8.55],
      [pw + pwT + 0.08, pw + pwT + 0.08 + T, eP, pw - 8.55],
      [pw + pwT + 0.08 + T, MM_DEPTH, -14, 0],
    ];
  };
}
function septumMM(ctx, P, v) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const forms = [`M-MODE · SEPTUM · shift ${v.shift} mm`, `M-MODE · shift ${v.shift} mm`, `shift ${v.shift} mm`];
  const title = forms.find((f) => ctx.measureText(f).width <= P.w - 20) || forms[forms.length - 1];
  ctx.restore();
  panel(ctx, P.x, P.y, P.w, P.h, title);
  const B = { x: P.x + 6, y: P.y + 24, w: P.w - 34, h: P.h - 30 };
  const d1 = MM_DEPTH, pxcm = B.h / d1;
  mmode(ctx, B, 0, d1, septumLayers(v), `consep|${v.thick}|${v.shift}|${v.bounce.toFixed(2)}|${v.DT}`);
  const labels = resp(ctx, B);
  // the pericardium behind the posterior wall, at end-diastole of the first beat of expiration
  // of the second breath; its value on the side of the caliper clear of the breathing labels
  if (v.thick >= 3) {
    const T = v.thick / 10, x = B.x + ((7 * RR + 5) / STRIP) * B.w, y0 = B.y + (8.55 + 0.9 + 0.08) * pxcm;
    caliper(ctx, x, y0, x, y0 + T * pxcm, { solid: true, size: 3 });
    const text = `${v.thick} mm`;
    let yc = y0 + (T * pxcm) / 2;
    ctx.save();
    ctx.font = `500 10.5px ${MONO}`;
    const tw = ctx.measureText(text).width + 12, th = 10.5 + 3 + 8;
    ctx.restore();
    const clear = (x0) => !labels.some((b) => b.x0 < x0 + tw && b.x1 > x0 && b.y0 < yc + th / 2 && b.y1 > yc - th / 2);
    const right = clear(x + 6) || !clear(x - 6 - tw);
    // in a short strip both sides can meet a label: the value then goes up, above the labels
    if (!clear(right ? x + 6 : x - 6 - tw)) yc = Math.min(yc, Math.min(...labels.map((b) => b.y0)) - th / 2 - 2);
    tagBox(ctx, right ? x + 6 : x - 6, yc, [text], { size: 10.5, bounds: B, align: right ? 'left' : 'right' });
  }
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= d1; d += 1) {
    const y = B.y + d * pxcm;
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 5 === 0 && d > 0 && d < d1) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  ctx.restore();
  return B;
}

// ---------------------------------------------------------------- the figure
function meterItems(v) {
  return [
    { k: 'Pericardium', v: v.thick, u: 'mm', lo: 0, hi: 12, norm: [1, 2], cuts: [[4, '4']], bad: v.thick > 2 },
    { k: 'Septal shift', v: v.shift, u: 'mm', lo: 0, hi: 12, cuts: [[SHIFT_CUT, String(SHIFT_CUT)]], bad: v.crit.shift },
    { k: 'Mitral E variation', v: v.mvVar, u: '%', lo: 0, hi: 50, cuts: [[25, '25']], bad: v.mvVar > 25 },
    { k: 'Tricuspid E variation', v: v.tvVar, u: '%', lo: 0, hi: 80, cuts: [[40, '40']], bad: v.tvVar > 40 },
    { k: 'Medial e′', v: v.eMed, u: 'cm/s', lo: 0, hi: 16, cuts: [[6, '6'], [9, '9']], bad: v.eMed <= 6 },
    { k: 'Lateral e′', v: v.eLat, u: 'cm/s', lo: 0, hi: 16, cuts: [[7, '7']], bad: v.eLat <= 7 },
    { k: 'Average E/e′', v: v.ee, u: '', d: 1, lo: 0, hi: 30, cuts: [[14, '14']], bad: v.ee >= 14 },
    { k: 'HV reversal ratio', v: v.hv, u: '', d: 2, lo: 0, hi: 1.2, cuts: [[0.79, '0.79']], bad: v.crit.hv },
    { k: 'Peak TR velocity', v: v.tr, u: 'm/s', d: 1, lo: 1.5, hi: 4, cuts: [[2.8, '2.8']], bad: v.tr >= 2.8 },
    { k: 'LA volume index', v: v.lavi, u: 'mL/m²', lo: 15, hi: 70, norm: [16, 34], cuts: [[34, '34']], bad: v.lavi > 34 },
  ];
}

/** The figure on sheet sh: the values v at time ms of the figure's clock, the heart shown. */
function drawFigure(sh, t, v, ms, mesh, heart) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const u = (((ms % STRIP) + STRIP) % STRIP) / STRIP, ub = (((ms % RR) + RR) % RR) / RR;
  if (W < 700) {
    const box = { x: 6, y: 6, w: W - 12, h: H - 12 };
    const [r1, r2, r3] = rows(box, [1.3, 0.7, 0.7], 8);
    const [a, b] = cols(r1, [1.25, 1], 8);
    a4c(ctx, a, v, ms, mesh, heart);
    for (const bx of tdiPW(ctx, b, v)) cursor(ctx, bx, ub);
    cursor(ctx, inflowPW(ctx, r2, v, 'mv'), u);
    cursor(ctx, hvPW(ctx, r3, v), u);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.12, colL.h * 0.6);
  a4c(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, ms, mesh, heart);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [p1, p2, p3, p4, p5] = rows(colR, [1, 1, 0.8, 1, 1.25], 10);
  cursor(ctx, inflowPW(ctx, p1, v, 'mv'), u);
  cursor(ctx, inflowPW(ctx, p2, v, 'tv'), u);
  for (const bx of tdiPW(ctx, p3, v)) cursor(ctx, bx, ub);
  cursor(ctx, hvPW(ctx, p4, v), u);
  const [c1, c2] = cols(p5, [1.15, 1], 10);
  cursor(ctx, septumMM(ctx, c1, v), u);
  drawIVC(ctx, c2, { d: v.ivc, collapse: v.coll / 100 }, { title: fit(c2.w, `IVC · M-MODE · RAP est. ${v.rap} mmHg`, `IVC · RAP ${v.rap}`) });
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LEAD = {
  cp: { normal: 'Normal pericardium', thickened: 'Thickened pericardium, no constrictive physiology', constriction: 'Constrictive pericarditis', 'all three': 'Constrictive pericarditis, all three Mayo Clinic criteria' },
  rcm: { normal: 'Normal diastolic function', 'grade 1': 'Restrictive cardiomyopathy, grade 1 diastolic dysfunction', 'grade 2': 'Restrictive cardiomyopathy, grade 2 diastolic dysfunction', 'grade 3': 'Restrictive cardiomyopathy, grade 3 diastolic dysfunction', 'not graded': 'Restrictive cardiomyopathy, not graded' },
};

/** The live sentences: the result in bold, then the findings that make it. */
export function liveOf(v, cite) {
  const W = cite('welch2014'), K = cite('klein2013'), N = cite('nagueh2025');
  const resp = `With inspiration the mitral E velocity falls by ${v.mvVar}% and the tricuspid E velocity rises by ${v.tvVar}%`;
  const ivc = `the IVC measures ${fmt(v.ivc, 1)} cm and collapses by ${v.coll}% with a sniff, an estimated RA pressure of ${v.rap} mmHg`;
  const crit = `septal shift ${v.crit.shift ? 'present' : 'absent'}, medial e′ ${v.eMed} cm/s (${v.crit.e ? '≥9' : '<9'}), hepatic vein expiratory diastolic reversal ratio ${fmt(v.hv, 2)} (${v.crit.hv ? '≥0.79' : '<0.79'})`;
  const lead = `<b>${LEAD[v.mode][v.grade]}.</b>`;
  if (v.mode === 'cp') {
    if (v.grade === 'normal') return `${lead} The pericardium measures ${v.thick} mm, and ${v.shift ? `the septum shifts only ${v.shift} mm` : 'the septum does not shift'} with respiration. ${resp}. The medial e′ (${v.eMed} cm/s) is below the lateral e′ (${v.eLat} cm/s); ${ivc}${K}.`;
    if (v.grade === 'thickened') return `${lead} The pericardium measures ${v.thick} mm, thicker than the normal 1–2 mm, but the septum shifts only ${v.shift} mm with respiration. A thick pericardium alone does not establish constriction: the diagnosis requires the constrictive hemodynamics${K}. ${resp}; ${ivc}.`;
    const both = v.n === 3
      ? `All three criteria are present: specificity 97%, sensitivity 64%${W}.`
      : `Septal shift with a medial e′ of 9 cm/s or more or a ratio of 0.79 or more has a sensitivity of 87% and a specificity of 91% for constriction${W}.`;
    return `${lead} Mayo Clinic criteria: ${crit}. ${both} The septum shifts ${v.shift} mm toward the LV with inspiration${v.bounce >= 1 ? ' and bounces in early diastole' : ''}, and the pericardium measures ${v.thick} mm${K}. ${resp}${v.mvVar > 25 && v.tvVar > 40 ? ', beyond the cut-offs of 25% and 40%' : ''}. The lateral e′ (${v.eLat} cm/s) is ${v.reversus ? 'below' : 'not below'} the medial e′${v.reversus ? ' (annulus reversus)' : ''}, and the average E/e′ is ${fmt(v.ee, 1)}${v.ee < 14 ? ', below 14 although the filling pressures are raised: in constriction E/e′ does not follow the LA pressure (annulus paradoxus)' : ''}${K}. ${ivc[0].toUpperCase()}${ivc.slice(1)}.`;
  }
  if (v.grade === 'normal') return `${lead} The septal e′ is ${v.eMed} cm/s and the lateral e′ ${v.eLat} cm/s; the average E/e′ is ${fmt(v.ee, 1)}, the peak TR velocity ${fmt(v.tr, 1)} m/s and the LA volume index ${v.lavi} mL/m²${N}. The pericardium measures ${v.thick} mm, and the septum does not shift with respiration.`;
  const path = v.lap.grade === 1
    ? `a reduced e′ is the only abnormal finding of step 1 and E/A is ${fmt(v.ea, 1)}, 0.8 or less: grade 1, with a normal LA pressure`
    : `${v.lap.step1.n === 3 ? 'e′, E/e′ and the TR velocity are all abnormal' : 'an LA volume index above 34 mL/m² shows'}${v.lap.step1.n === 3 ? ', so the LA pressure is raised' : ' a raised LA pressure'}; E/A of ${fmt(v.ea, 1)} gives grade ${v.lap.grade}`;
  return `${lead} The septal e′ is ${v.eMed} cm/s and the lateral e′ ${v.eLat} cm/s; the average E/e′ is ${fmt(v.ee, 1)}, the peak TR velocity ${fmt(v.tr, 1)} m/s, the LA volume index ${v.lavi} mL/m² and the deceleration time ${v.DT} ms. By the 2025 ASE algorithm, ${path}${N}. The septum does not shift with respiration, the mitral E velocity varies by only ${v.mvVar}%, and the hepatic vein diastolic flow reverses more in inspiration than in expiration${K}. Mayo Clinic criteria: ${crit}; not met${W}.`;
}

/**
 * The findings that separate the two diseases (Welch 2014; Klein 2013; Nagueh 2025): in each row
 * the column of the disease on screen is marked where the values show its finding.
 */
export function diffRows(v) {
  const sick = v.mode === 'cp' ? v.mayo : v.grade !== 'normal';
  const mark = (cp, rcm) => (!sick ? -1 : v.mode === 'cp' ? (cp ? 0 : -1) : rcm ? 1 : -1);
  const inspRev = v.hRi * v.hDi > v.hv * v.hDe;
  return [
    ['Respiratory septal shift', ['Present', 'Absent'], mark(v.crit.shift, !v.crit.shift)],
    ['Medial e′', ['Normal or high: 9 cm/s or more', 'Reduced: usually 5 cm/s or less'], mark(v.crit.e, v.eMed <= 5)],
    ['Lateral e′', ['Below the medial e′: annulus reversus', 'Not below the medial e′'], mark(v.reversus, !v.reversus)],
    ['Hepatic vein diastolic reversal', ['In expiration: ratio 0.79 or more', 'In inspiration'], mark(v.crit.hv, inspRev)],
    ['Mitral E with inspiration', ['Falls by more than 25%', 'Little change'], mark(v.mvVar > 25, v.mvVar <= 25)],
    ['Atria', ['Moderately enlarged', 'Often severely enlarged'], mark(v.lavi >= 42 && v.lavi <= 48, v.lavi > 48)],
    ['Pericardium', ['Often thick: more than 4 mm on CT or CMR', 'Normal'], mark(v.thick > 4, v.thick <= 2)],
  ];
}

/** The readouts for the values v. */
export function readoutsOf(v) {
  return [
    { k: 'Pericardium', v: fmt(v.thick), u: 'mm', flag: v.thick > 2 },
    { k: 'Septal shift', v: fmt(v.shift), u: 'mm', flag: v.crit.shift },
    { k: 'Medial e′', v: fmt(v.eMed), u: 'cm/s', flag: v.eMed <= 6 },
    { k: 'HV reversal ratio', v: fmt(v.hv, 2), flag: v.crit.hv },
    { k: 'Mitral E variation', v: fmt(v.mvVar), u: '%', flag: v.mvVar > 25 },
    { k: 'Mayo criteria', v: `${v.n} of 3, ${v.mayo ? 'met' : 'not met'}`, text: true, flag: v.mayo },
  ];
}
/** The table that compares the two diseases, with its title, on the values v. */
export function diffTable(table, v, cite) {
  gradeTable(table, diffRows(v), `Constriction or restrictive cardiomyopathy${cite('welch2014,klein2013,nagueh2025')}`, ['Constriction', 'Restrictive cardiomyopathy']);
}

/**
 * The figure, with its own four-chamber view cut from the mesh and its own clock: one for each
 * page that shows it. redraw: called when the view's model and targets arrive.
 */
export function constrictionFigure(redraw) {
  const mesh = new MeshPanel('a4c', { diseases: DISEASES, redraw });
  const clock = { ms: CLOCK0 };
  return {
    mesh,
    /** The figure for the values v, on the heart shown (its key). */
    draw(sh, t, v, heart) { drawFigure(sh, t, v, clock.ms, mesh, heart || 'normal'); },
    /** The clock runs while the cine runs: true when it moved. */
    tick(dt) {
      if (reducedMotion) return false;
      clock.ms = (clock.ms + dt * 1000) % (STRIP * 100);
      return true;
    },
    /** The heart for the music: the figure's beat while the cine runs. */
    pulse() { return { rr: RR, phase: reducedMotion ? null : (((clock.ms % RR) + RR) % RR) / RR }; },
  };
}

/**
 * The figure's own functions, for the checks of the image against the printed values
 * (f08774a:README.md).
 */
export const checks = { meshOf, inflowFn, hvFn, tissueFn, septumLayers, sepShiftCm, BREATH, STRIP };
