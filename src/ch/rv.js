// The right ventricle: one slider from a normal RV to severe overload, and a switch for the kind
// of load. Pressure overload (pulmonary hypertension): the peak TR velocity and the RV systolic
// pressure rise, the RVOT acceleration time shortens and the RVOT flow notches in mid-systole; the
// RV free wall thickens first, then the RV dilates and its function falls, and the septum
// flattens most at end-systole. Volume overload (an atrial septal defect, severe TR or PR): the
// RV and the RA dilate at a near-normal pressure, the RV's function holds, and the septum flattens
// at end-diastole only. The text holds the measurements as a diagram: the bands of Mukherjee 2025
// Table 1, the septum at both times, and the echocardiographic probability of PH (Humbert 2022
// Table 10 and Figure 5), with ▲▼ buttons on fifteen measurements and a switch for the notch. An
// edit stores the measurements in rvx; the slider then marks a band of their result and does not
// change them. A move of the slider or of the load, Play, the tour or a heart's preset clears
// rvx, and the values follow the slider again.
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC, caliper } from '../scope.js';
import { RR, EV, mitralV, cycleAt } from '../cyclemodel.js';
import { rapEstimate } from '../norms.js';
import { tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, note, fit, waveLetter } from '../sev.js';
import { cal } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { rvGrowOf, raAreaWeight, raAreaMin, sepOf, sepEsOf, rvThickOf, rvWallOwn, rvSepAdd, lvBasalAt, rvFacAt, rvTapseOwn, RV_TAPSE } from '../meshcal.js';
import { blood, cavity, onPlane, hingesOf, middle, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { round, stepOf, slideTo as slideOf, steady as holdPlace, flash } from '../edits.js';
import { cue } from '../music.js';
import { numOf } from '../order.js';

/** A ▲▼ edit renders again and keeps its button under the pointer (edits.js). */
const steady = (btn, fn) => holdPlace('#ch-rv .live', btn, fn);

const KEY = 'rvS';
const LOAD = 'rvLoad';
const FRAME = 'rvFrame';
const EDITS = 'rvx';
const AR = 3.1;      // cm, the model's aortic root, for the sign "PA diameter > aortic root"
const FLAT = 1.1;    // the eccentricity index above which the septum is called flat (Humbert 2022 Table 10)
const LOADS = ['pressure', 'volume'];

// ---------------------------------------------------------------- the model
// The tracks over the slider s for each load. Pressure: the peak TR velocity (m/s) rises to 4.4,
// the IVC dilates and collapses less, the RVOT acceleration time (ms) falls to 58 and the RVOT
// flow notches from s 0.45 (nd, the notch's depth on the drawing); the RV free wall (mm)
// thickens before the RV basal diameter (cm) grows; the RV's systolic function falls: the
// tricuspid annulus's travel (kT, a share of the heart's own) to 0.6 and the free wall's own motion
// (kr) to 0.2, so FAC falls faster than TAPSE and S′. The eccentricity index at end-systole (eiS)
// rises more than at end-diastole (eiD): Ryan 1985 found 1.44 ± 0.16 and 1.26 ± 0.11 in pressure
// overload. Volume: the RV and RA dilate at a TR velocity below 2.8 m/s; the annulus's travel
// rises by up to 15% and falls back; eiD rises to 1.42 and eiS stays near 1 (Ryan 1985: 1.26 ±
// 0.12 at end-diastole), so the septum moves toward the RV in systole and the FAC rises. rvotV:
// the peak RVOT velocity (m/s), drawn and not graded; pa: the main PA (cm); prv: the
// early-diastolic PR velocity (m/s). TAPSE, S′ and FAC are not on the tracks: modelAt takes them
// from the heart mesh (meshcal.js RV_TAPSE and rvFacAt), as the image shows them.
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const TRACKS = {
  pressure: tracks(STOPS, {
    trv: [2.3, 3.0, 3.5, 4.1, 4.4],
    ivc: [1.6, 1.7, 2.0, 2.3, 2.6],
    coll: [60, 55, 45, 35, 20],
    acct: [130, 100, 82, 68, 58],
    nd: [0, 0, 0.6, 1, 1],
    rvb: [3.4, 3.6, 4.1, 4.6, 5.1],
    wall: [4.0, 6.0, 7.5, 8.5, 9.5],
    kT: [1, 0.975, 0.9, 0.75, 0.6],
    kr: [1, 1, 0.5, 0.3, 0.2],
    sPrime: [13, 12.5, 11, 9, 7.5],
    eda: [18, 20, 25, 30, 35],
    ra: [16, 17, 19, 23, 27],
    eiD: [1.0, 1.04, 1.1, 1.18, 1.24],
    eiS: [1.0, 1.15, 1.3, 1.4, 1.46],
    pa: [2.2, 2.6, 2.9, 3.2, 3.5],
    prv: [1.5, 2.0, 2.4, 2.8, 3.0],
    rvotV: [0.95, 0.9, 0.8, 0.65, 0.55],
  }),
  volume: tracks(STOPS, {
    trv: [2.3, 2.4, 2.5, 2.6, 2.7],
    ivc: [1.6, 1.7, 1.8, 2.0, 2.2],
    coll: [60, 58, 56, 54, 52],
    acct: [130, 128, 125, 120, 115],
    nd: [0, 0, 0, 0, 0],
    rvb: [3.4, 4.0, 4.6, 5.1, 5.6],
    wall: [4.0, 4.0, 4.2, 4.4, 4.6],
    kT: [1, 1.1, 1.15, 1.1, 1.0],
    kr: [1, 1, 1, 1, 1],
    sPrime: [13, 14.5, 15, 14, 12],
    eda: [18, 24, 30, 36, 42],
    ra: [16, 18, 21, 24, 27],
    eiD: [1.0, 1.1, 1.22, 1.33, 1.42],
    eiS: [1.0, 1.0, 1.02, 1.04, 1.06],
    pa: [2.2, 2.6, 2.9, 3.2, 3.4],
    prv: [1.5, 1.5, 1.6, 1.7, 1.8],
    rvotV: [0.95, 1.15, 1.3, 1.4, 1.45],
  }),
};

/**
 * The annulus's travel on heart under load, as a share of the heart's own, for the track's kT. A
 * pressure load does not shorten a travel below the normal heart's at that pressure: a heart whose
 * own travel is shorter (amyloid 12 mm, ischemic 15 mm, against 20 mm) keeps it until the normal
 * heart's falls below it.
 */
const annulusOf = (heart, load, kT) => (load === 'pressure' ? Math.min(1, kT * Math.max(1, RV_TAPSE.normal / rvTapseOwn(heart))) : kT);
/** The FAC (%) along a track: under a pressure load it does not rise again (the mesh's rises by up to 0.7). */
function facOf(heart, load, s) {
  let f = rvFacAt(heart, load, s).fac;
  if (load === 'pressure') for (let x = 0; x < s; x += 0.1) f = Math.min(f, rvFacAt(heart, load, x).fac);
  return f;
}

/**
 * The model at slider position s under load on heart: its measurements before rounding. The RV
 * free wall and the RA are at least the heart's own (the amyloid heart's wall is 7.5 mm thick).
 * TAPSE is the image's annulus travel (kTe of the heart's own) and FAC the image's; S′ follows
 * TAPSE from the normal heart's track.
 */
function modelAt(s, load, heart) {
  const m = TRACKS[load](s);
  m.s = s;
  m.load = load;
  m.wall = Math.max(m.wall, rvWallOwn(heart));
  m.ra = Math.max(m.ra, raAreaMin(heart));
  m.kTe = annulusOf(heart, load, m.kT);
  m.tapse = rvTapseOwn(heart) * m.kTe;
  m.sPrime *= m.tapse / (RV_TAPSE.normal * m.kT);
  m.fac = facOf(heart, load, s);
  m.esa = m.eda * (1 - m.fac / 100);
  m.notch = m.nd >= 0.5 ? 'yes' : 'no';
  return m;
}

/** The fifteen measurements: decimals as reported, and the step and limits of their buttons. */
const INPUTS = {
  rvb: { d: 1, step: 0.1, min: 2.5, max: 6.5 },
  wall: { d: 1, step: 0.5, min: 2, max: 14 },
  eda: { d: 1, step: 1, min: 8, max: 50 },
  esa: { d: 1, step: 1, min: 3, max: 45 },
  ra: { d: 0, step: 1, min: 8, max: 45 },
  tapse: { d: 0, step: 1, min: 5, max: 32 },
  eiD: { d: 2, step: 0.05, min: 0.85, max: 1.6 },
  eiS: { d: 2, step: 0.05, min: 0.85, max: 1.6 },
  pa: { d: 1, step: 0.1, min: 1.5, max: 5 },
  trv: { d: 1, step: 0.1, min: 1, max: 5.5 },
  acct: { d: 0, step: 5, min: 40, max: 170 },
  prv: { d: 1, step: 0.1, min: 0.5, max: 4 },
  sPrime: { d: 1, step: 0.5, min: 3, max: 20 },
  ivc: { d: 1, step: 0.1, min: 1, max: 3.5 },
  coll: { d: 0, step: 5, min: 0, max: 100 },
};
const IN = Object.keys(INPUTS);
const SWITCH = { notch: ['no', 'yes'] };
const SW = Object.keys(SWITCH);
const DEC = { fac: 0, grad: 0, rap: 0, rvsp: 0, lvb: 1, rvlv: 2, tsp: 2, ...Object.fromEntries(IN.map((k) => [k, INPUTS[k].d])) };

/** The limits of measurement k at the values v: the end-systolic area stays below the end-diastolic. */
function limits(k, v) {
  const I = INPUTS[k];
  if (k === 'esa') return { ...I, max: Math.min(I.max, v.eda - 1) };
  if (k === 'eda') return { ...I, min: Math.max(I.min, v.esa + 1) };
  return I;
}

// The bands of Mukherjee 2025 Table 1 (the corrected version), normal to severe, at the decimals
// the page prints: [label, test of the value]. The wall in mm (Table 1: cm).
const BANDS = {
  rvb: [['<4.1', (x) => x < 4.1], ['4.1–4.4', (x) => x <= 4.4], ['4.5–4.9', (x) => x <= 4.9], ['>4.9', () => true]],
  wall: [['<5.0', (x) => x < 5], ['5.0–7.0', (x) => x <= 7], ['7.1–9.0', (x) => x <= 9], ['>9.0', () => true]],
  eda: [['<25.0', (x) => x < 25], ['25.0–28.0', (x) => x <= 28], ['28.1–32.0', (x) => x <= 32], ['>32.0', () => true]],
  esa: [['<14.0', (x) => x < 14], ['14.0–16.0', (x) => x <= 16], ['16.1–19.0', (x) => x <= 19], ['>19.0', () => true]],
  fac: [['>35', (x) => x > 35], ['30–35', (x) => x > 29], ['23–29', (x) => x > 22], ['≤22', () => true]],
  ra: [['<19', (x) => x < 19], ['19–22', (x) => x <= 22], ['23–24', (x) => x <= 24], ['>24', () => true]],
  tapse: [['>17', (x) => x > 17], ['14–17', (x) => x > 13], ['11–13', (x) => x > 10], ['≤10', () => true]],
  sPrime: [['>9.5', (x) => x > 9.5], ['7.3–9.5', (x) => x > 7.2], ['5.1–7.2', (x) => x > 5], ['≤5.0', () => true]],
  trv: [['<2.8', (x) => x < 2.8], ['2.8–3.1', (x) => x <= 3.1], ['3.2–3.5', (x) => x < 3.6], ['≥3.6', () => true]],
  rvsp: [['≤34', (x) => x <= 34], ['35–49', (x) => x <= 49], ['50–69', (x) => x <= 69], ['≥70', () => true]],
  acct: [['>105', (x) => x > 105], ['80–105', (x) => x >= 80], ['60–79', (x) => x >= 60], ['<60', () => true]],
  pa: [['≤2.5', (x) => x <= 2.5], ['2.6–3.0', (x) => x <= 3], ['3.1–3.5', (x) => x <= 3.5], ['>3.5', () => true]],
};
const GRADED = Object.keys(BANDS);
const levelOf = (k, x) => BANDS[k].findIndex(([, f]) => f(x));
const GNAME = ['normal', 'mild', 'moderate', 'severe'];
/** What a band means for each measurement, normal to severe. */
const WORDS = {
  rvb: 'dilated', wall: 'thick', eda: 'enlarged', esa: 'enlarged', fac: 'reduced', ra: 'enlarged', tapse: 'reduced', sPrime: 'reduced',
  trv: 'raised', rvsp: 'raised', acct: 'short', pa: 'dilated',
};
const wordOf = (k, g) => (g ? `${['', 'mildly', 'moderately', 'severely'][g]} ${WORDS[k]}` : 'normal');

// The echocardiographic probability of PH (Humbert 2022 Figure 5): the peak TR velocity's band,
// and the other signs (Table 10), which count when they come from at least two of the three
// categories.
const SIGNS = [
  ['A', 'The ventricles', 'the ventricles', [
    ['rvlv', 'RV/LV basal diameter ratio', '>1.0', (v) => v.rvlv > 1],
    ['ei', 'Flat septum: LVEI in systole and/or diastole', '>1.1', (v) => v.eiD > FLAT || v.eiS > FLAT],
    ['tsp', 'TAPSE/sPAP', '<0.55 mm/mmHg', (v) => v.tsp < 0.55],
  ]],
  ['B', 'The pulmonary artery', 'the pulmonary artery', [
    ['acct', 'RVOT acceleration time, and/or mid-systolic notching', '<105 ms', (v) => v.acct < 105 || v.notch === 'yes'],
    ['prv', 'Early-diastolic PR velocity', '>2.2 m/s', (v) => v.prv > 2.2],
    ['paAr', 'PA diameter > aortic root', `${AR.toFixed(1)} cm`, (v) => v.pa > AR],
    ['pa', 'PA diameter', '>2.5 cm', (v) => v.pa > 2.5],
  ]],
  ['C', 'The IVC and the RA', 'the IVC and the RA', [
    ['ivc', 'IVC >2.1 cm, with <50% collapse with a sniff', '', (v) => v.ivc > 2.1 && v.coll < 50],
    ['ra', 'RA area at end-systole', '>18 cm²', (v) => v.ra > 18],
  ]],
];
const TRV_BANDS = [['≤2.8', 'low', 'intermediate'], ['2.9–3.4', 'intermediate', 'high'], ['>3.4', 'high', 'high']];
function escOf(v) {
  const band = v.trv <= 2.8 ? 0 : v.trv <= 3.4 ? 1 : 2;
  const on = {}, cats = [];
  for (const [c, , , list] of SIGNS) {
    for (const [k, , , f] of list) on[k] = !!f(v);
    if (list.some(([k]) => on[k])) cats.push(c);
  }
  const other = cats.length >= 2;
  return { band, on, cats, other, prob: TRV_BANDS[band][other ? 2 : 1] };
}

/** The septum's shape at the two times (Mukherjee 2025, p146): flat above FLAT. */
function patternOf(v) {
  const d = v.eiD > FLAT, s = v.eiS > FLAT;
  return s ? (d ? 'both' : 'pressure') : d ? 'volume' : 'none';
}
const PATTERN = {
  none: 'round at both times',
  volume: 'flat at end-diastole only',
  pressure: 'flat at end-systole',
  both: 'flat at end-systole and end-diastole',
};
const PATTERN_MEANS = {
  none: 'no overload pattern', volume: 'RV volume overload', pressure: 'RV pressure overload', both: 'RV pressure overload, with or without volume overload',
};

/**
 * Values as reported: the measurements at their decimals, and each calculation from the rounded
 * values before it. The grades read these numbers, so a value on screen never contradicts its
 * grade. The LV basal diameter is the heart's own with the septum at its end-diastolic place.
 */
function measure(raw, heart) {
  const v = { ...raw, heart };
  for (const k of IN) v[k] = round(raw[k], INPUTS[k].d);
  v.fac = round((100 * (v.eda - v.esa)) / v.eda, 0);
  v.rapE = rapEstimate({ d: v.ivc, col: v.coll, mode: 'sniff', sec: 'unclear' });
  v.rap = v.rapE.rap;
  v.grad = round(4 * v.trv ** 2, 0);
  v.rvsp = v.grad + v.rap;
  v.lvb = round(lvBasalAt(heart, sepOf(heart, v.eiD)), 1);
  v.rvlv = round(v.rvb / v.lvb, 2);
  v.tsp = round(v.tapse / v.rvsp, 2);
  v.g = Object.fromEntries(GRADED.map((k) => [k, levelOf(k, v[k])]));
  v.esc = escOf(v);
  v.pat = patternOf(v);
  // the page's grade: the RV systolic pressure under a pressure load (Mukherjee 2025 Figure 5),
  // the RV basal diameter under a volume load
  v.grade = GNAME[v.load === 'pressure' ? v.g.rvsp : v.g.rvb];
  return v;
}

const heartOf = (s) => s.pheno || 'normal';
const loadOf = (s) => (s[LOAD] === 'volume' ? 'volume' : 'pressure');
/** The values on screen, from the store: the edited measurements (rvx), or the model's at the slider. */
function shownOf(s) {
  const heart = heartOf(s);
  if (!s[EDITS]) return measure(modelAt(s[KEY], loadOf(s), heart), heart);
  const v = modelAt(s[EDITS].base, s[EDITS].load, heart);
  for (const k of [...IN, ...SW]) v[k] = s[EDITS][k];
  return measure(v, heart);
}
let lastKey = '', lastShown = null;
/** shownOf, kept for the last state: the figure asks every frame. */
function shown(s) {
  const key = s[EDITS] ? `e|${heartOf(s)}` : `${s[KEY]}|${loadOf(s)}|${heartOf(s)}`;
  if (key !== lastKey || (s[EDITS] && s[EDITS] !== lastShown?.ed) || !lastShown) {
    lastKey = key;
    lastShown = shownOf(s);
    lastShown.ed = s[EDITS] || null;
  }
  return lastShown;
}
export const gradeOf = (x, load = 'pressure') => measure(modelAt(x, load, 'normal'), 'normal').grade;

let sheet = null, st = null, setState = null;
const beat = new Beat(RR);
const BANDS_OF = { pressure: [], volume: [] };

// ---------------------------------------------------------------- the figure
// The RV-focused four-chamber view and the short axis at the papillary muscles cut from the heart
// mesh (meshpanel.js): the heart the page shows; its RV free wall out to the printed RV basal
// diameter less what the septum's shift adds (rvGrow, meshcal.js rvGrowOf and rvSepAdd), its wall
// at the printed thickness (rvThick, rvThickOf), its RA at the printed area (raGrow,
// raAreaWeight), and the septum at the printed eccentricity index at end-diastole and at
// end-systole, moving between them with the systolic weight (sep, sepOf and sepEsOf). The
// tricuspid valve travels the printed TAPSE (rvT, a share of the heart's own travel), and the RV
// free wall's own motion (rvK) is the track's, moved by the printed FAC's distance from the
// image's (meshcal.js rvFacAt and its slopes), so the cine shows the printed FAC.
const redraw = () => { if (sheet) sheet.dirty = true; };
const MESH = new MeshPanel('a4c_rv', { diseases: ['rvGrow', 'raGrow', 'rvThick', 'sep'], rv: true, redraw });
const MESH_PM = new MeshPanel('psax_pm', { diseases: ['rvGrow', 'rvThick', 'sep'], rv: true, redraw });

/** The mesh weights for the values v at time tt (ms) of the beat. */
function meshOf(v, tt) {
  const heart = st.pheno || 'normal', sy = cycleAt(tt).s;
  const wD = sepOf(heart, v.eiD), wS = sepEsOf(heart, v.eiS);
  return {
    disease: { rvGrow: rvGrowOf(heart, v.rvb - rvSepAdd(heart, wD)), raGrow: raAreaWeight(heart, v.ra), rvThick: rvThickOf(heart, v.wall) },
    motion: { sep: wD + (wS - wD) * sy },
    ...rvMotion(heart, v),
  };
}
/** The RV's own motion for the values v on heart: the tricuspid valve's travel (rvT) and the free wall's (rvK). */
function rvMotion(heart, v) {
  const rvT = clamp(v.tapse / rvTapseOwn(heart), 0.3, 1.15);
  const f = rvFacAt(heart, v.load, v.s);
  return { rvT, rvK: clamp(v.kr + (v.fac - f.fac - f.sT * (rvT - v.kTe)) / f.sR, 0, 1.25) };
}

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

/** Where the RV's name goes: its open blood 2.5 cm from the tricuspid annulus into the RV (as chapter 18). */
function rvName(ev, s) {
  const h = hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), apex = onPlane(ev, ev.anchors(s).apex);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  return blood(ev, add(M, mul(nrm, 2.5)));
}

function a4c(ctx, box, v, tt) {
  const M = meshOf(v, tt);
  MESH.draw(ctx, box, titleOf(ctx, box.w, ['APICAL FOUR-CHAMBER, RV FOCUSED', 'A4C, RV FOCUSED', 'A4C RV']), {
    tms: tt, disease: M.disease, motion: M.motion, rvK: M.rvK, rvT: M.rvT,
    // deeper as the RA grows (its length as the root of its area, 5 cm at 19.7 cm²)
    deeper: Math.max(0, 5 * (Math.sqrt(v.ra / 19.7) - 1)),
    names: [['lv', 'LV', 'apex', 0.45], [rvName, 'RV'], ['la', 'LA'], ['ra', 'RA']],
    // a narrow panel keeps the image clear: the RV's size and wall only (the readouts give the rest)
    lines: box.w < 260
      ? [`RV ${v.rvb.toFixed(1)} cm`, `wall ${v.wall.toFixed(1)} mm`]
      : [`RV base ${v.rvb.toFixed(1)} cm`, [`RV wall ${v.wall.toFixed(1)} mm`, `wall ${v.wall.toFixed(1)} mm`], [`RA area ${v.ra} cm²`, `RA ${v.ra} cm²`], `FAC ${v.fac}%`],
  });
}

// the eccentricity index's two diameters on the short axis (Mukherjee 2025 Table 2): D1 across
// the LV from the septum, D2 square to it, both through the cavity's middle
const centroid = (P) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const f = P[j][0] * P[i][1] - P[i][0] * P[j][1];
    a += f; cx += (P[j][0] + P[i][0]) * f; cy += (P[j][1] + P[i][1]) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
/** The chord of polygon P through Q along side: its two ends. */
function chord(P, Q, side) {
  const n = perp(side);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], da = dot(sub(a, Q), n), db = dot(sub(b, Q), n);
    if ((da > 0) === (db > 0)) continue;
    const X = add(a, mul(sub(b, a), da / (da - db))), t = dot(sub(X, Q), side);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  return Number.isFinite(lo) ? [add(Q, mul(side, lo)), add(Q, mul(side, hi))] : null;
}

function psax(ctx, box, v, tt) {
  const M = meshOf(v, tt), sy = cycleAt(tt).s;
  const title = titleOf(ctx, box.w, [`PSAX · LVEI ${v.eiD.toFixed(2)} ED · ${v.eiS.toFixed(2)} ES`, `PSAX · EI ${v.eiD.toFixed(2)} / ${v.eiS.toFixed(2)}`, `EI ${v.eiD.toFixed(2)}/${v.eiS.toFixed(2)}`]);
  MESH_PM.draw(ctx, box, title, {
    tms: tt, disease: M.disease, motion: M.motion, rvK: M.rvK, rvT: M.rvT, names: [['rv', 'RV']],
    over: (c, F, ev) => {
      const an = ev.anchors(sy), lv = onPlane(ev, an.lv), rv = onPlane(ev, an.rv);
      const P = cavity(ev, blood(ev, lv));
      if (P.length < 12) return;
      const C = centroid(P), d1 = unit(sub(rv, lv)), d2 = perp(d1);
      const a = chord(P, C, d1), b = chord(P, C, d2);
      // each diameter's name past its end away from the septum (D1) and at its anterior end (D2)
      for (const [ch, name] of [[a, 'D1'], [b, 'D2']]) {
        if (!ch) continue;
        cal(c, F, ch[0], ch[1], '');
        const end = dot(sub(ch[1], ch[0]), d1) > 0 || name === 'D2' ? ch[1] : ch[0];
        const out = unit(sub(end, C)), [x, y] = F.P(add(end, mul(out, 0.45)));
        c.save();
        c.font = `500 10.5px ${MONO}`;
        c.fillStyle = SC.cal;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(name, x, y);
        c.restore();
      }
    },
  });
}

/** CW through the tricuspid valve: the TR jet away from the probe in systole, the inflow in diastole. */
function trCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · TRICUSPID REGURGITATION', 'CW · TR'));
  const bx = inner(P);
  const base = 0.28, vs = Math.max(3, Math.ceil(v.trv + 0.6));
  const DUR = EV.mvo + 10 - EV.mvc;
  const fn = (u) => {
    const t = (u * 2 * RR) % RR, w = (t - EV.mvc) / DUR;
    if (w > 0 && w < 1) return -v.trv * Math.pow(Math.sin(Math.PI * w), 0.45);
    return mitralV(t - 6, 0.5, 0.4, 200);
  };
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'cw', broad: 0.4, key: `rvtr|${v.trv}|${vs}`, seed: 43 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const xp = X(EV.mvc + DUR / 2), yp = y0 + v.trv * k;
  caliper(ctx, xp - 14, yp, xp + 14, yp, { solid: true });
  note(ctx, bx, [`peak ${v.trv.toFixed(1)} m/s · 4V² ${v.grad} + RAP ${v.rap} = RVSP ${v.rvsp} mmHg`, `peak ${v.trv.toFixed(1)} m/s · RVSP ${v.rvsp} mmHg`, `${v.trv.toFixed(1)} m/s · RVSP ${v.rvsp}`], 'top');
  return bx;
}

// The RVOT flow from the parasternal short axis: away from the probe, from pulmonic opening for
// the RV's ejection time; its peak at the acceleration time. A notch (nd) splits it into an early
// peak and a lower late-systolic wave (Mukherjee 2025 Table 3: the W sign).
const T0 = EV.avo + 5, ETR = 330;
function rvotShape(t, acct, nd) {
  const u = (t - T0) / ETR;
  if (u <= 0 || u >= 1) return 0;
  const a = clamp(acct / ETR, 0.12, 0.6);
  const dome = Math.pow(u < a ? Math.sin((Math.PI / 2) * (u / a)) : Math.cos((Math.PI / 2) * ((u - a) / (1 - a))), 0.8);
  if (!(nd > 0)) return dome;
  // the notched profile: the early peak falls to a notch at c, then a second, lower wave
  const c = Math.min(0.62, a + 0.24);
  const early = u < a ? Math.sin((Math.PI / 2) * (u / a)) : u < c ? Math.cos((Math.PI / 2) * ((u - a) / (c - a))) : 0;
  const late = u > c - 0.06 ? 0.55 * Math.pow(Math.sin(Math.PI * ((u - c + 0.06) / (1.06 - c))), 0.9) : 0;
  const notched = Math.max(early, late, 0.22 * Math.sin(Math.PI * u));
  return dome * (1 - nd) + notched * nd;
}

function rvotPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RVOT · SHORT AXIS', 'PW · RVOT'));
  const bx = inner(P);
  const vr = round(v.rvotV, 2), nd = round(v.notch === 'yes' ? Math.max(v.nd, 0.6) : 0, 2), acct = v.acct;
  const base = 0.16, vs = Math.max(0.8, Math.ceil((vr + 0.15) * 5) / 5);
  const fn = (u) => -vr * rvotShape((u * 2 * RR) % RR, acct, nd);
  spectral(ctx, bx, { fn, scale: vs, base, mode: 'pw', broad: 0.16, key: `rvot|${vr}|${acct}|${nd}|${vs}`, seed: 44 });
  vscale(ctx, bx, vs, base, 0.5);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + base * bx.h;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  // the acceleration time: flow onset to peak velocity, under the envelope's peak
  const yPk = y0 + vr * rvotShape(T0 + acct, acct, nd) * k;
  const yc = y0 + 9;
  caliper(ctx, X(T0), yc, X(T0 + acct), yc, { solid: true, size: 3 });
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(X(T0 + acct), yPk);
  ctx.lineTo(X(T0 + acct), yc);
  ctx.stroke();
  ctx.restore();
  note(ctx, bx, [`AccT ${acct} ms${v.notch === 'yes' ? ' · mid-systolic notch' : ''}`, `AccT ${acct} ms${v.notch === 'yes' ? ' · notch' : ''}`], 'bottom');
  return bx;
}

/** M-mode through the lateral tricuspid annulus: its excursion toward the apex. */
function tapseMM(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'M-MODE · TAPSE', 'TAPSE'));
  const bx = { x: P.x + 6, y: P.y + 24, w: P.w - 12, h: P.h - 30 };
  const pxmm = Math.min(bx.h / 40, 4), y0 = bx.y + bx.h * 0.22;
  ctx.save();
  ctx.fillStyle = '#20262a';
  ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
  ctx.strokeStyle = '#d9dfe2';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= 220; i++) {
    const u = i / 220, y = y0 + cycleAt((u * 2 * RR) % RR).s * v.tapse * pxmm;
    i ? ctx.lineTo(bx.x + u * bx.w, y) : ctx.moveTo(bx.x + u * bx.w, y);
  }
  ctx.stroke();
  const xb = bx.x + (EV.avc / (2 * RR)) * bx.w;
  caliper(ctx, xb, y0, xb, y0 + v.tapse * pxmm, { solid: true });
  ctx.restore();
  note(ctx, bx, [`TAPSE ${v.tapse} mm`, `${v.tapse} mm`], 'bottom');
  return bx;
}

/** Pulsed tissue Doppler of the lateral tricuspid annulus: S′, e′ and a′. */
function sPrimeTDI(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW TISSUE DOPPLER · TV ANNULUS', 'TDI · S′'));
  const bx = inner(P);
  const sP = v.sPrime / 100, eP = 0.14, aP = 0.12;
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    if (t > 70 && t < 330) return sP * Math.sin((Math.PI * (t - 70)) / 260) ** 0.9;
    if (t > 470 && t < 600) return -eP * Math.sin((Math.PI * (t - 470)) / 130);
    if (t > 770 && t < 857) return -aP * Math.sin((Math.PI * (t - 770)) / 87);
    return 0;
  };
  spectral(ctx, bx, { fn, scale: 0.2, base: 0.5, mode: 'pw', broad: 0.25, key: `rvs|${v.sPrime}`, seed: 8 });
  vscale(ctx, bx, 0.2, 0.5, 0.1, 'cm/s', { cm: true });
  const k = (bx.h * 0.5) / 0.2, yb = bx.y + bx.h * 0.5;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  caliper(ctx, X(200) - 12, yb - sP * k, X(200) + 12, yb - sP * k, { solid: true });
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letters = [waveLetter(ctx, 'e′', X(535), Math.min(bx.y + bx.h - 4, yb + eP * k + 13)), waveLetter(ctx, 'a′', X(815), Math.min(bx.y + bx.h - 4, yb + aP * k + 13))];
  ctx.restore();
  note(ctx, bx, [`S′ ${v.sPrime.toFixed(1)} cm/s`, `${v.sPrime.toFixed(1)} cm/s`], 'auto', letters);
  return bx;
}

function draw(sh) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shown(st);
  const frame = st[FRAME] || 'cine';
  const still = frame === 'es' ? EV.avc : 0;
  const tt = beat.at(frame === 'cine', still);
  // the strips' sweep, or a fixed line at the frame shown
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : still / (2 * RR));
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    const [a1, a2] = rows(a, [1.3, 1], 8);
    a4c(ctx, a1, v, tt);
    psax(ctx, a2, v, tt);
    const [b1, b2, b3] = rows(b, [1, 1, 1], 8);
    for (const bx of [trCW(ctx, b1, v), rvotPW(ctx, b2, v), tapseMM(ctx, b3, v)]) mark(bx);
    return;
  }
  const colL = { x: 16, y: 14, w: W * 0.44 - 16, h: H - 26 };
  const colR = { x: W * 0.455, y: 14, w: W * 0.545 - 16, h: H - 26 };
  const [a1, a2] = rows(colL, [1.35, 1], 10);
  a4c(ctx, a1, v, tt);
  psax(ctx, a2, v, tt);
  const [r1, r2, r3] = rows(colR, [1, 1, 1], 10);
  const [c1, c2] = cols(r3, [1, 1.15], 10);
  for (const bx of [trCW(ctx, r1, v), rvotPW(ctx, r2, v), tapseMM(ctx, c1, v), sPrimeTDI(ctx, c2, v)]) mark(bx);
}

// ---------------------------------------------------------------- the measurements in the text
// From the measurements (▲▼) through the pressures to the bands of Table 1, the septum's shape at
// both times, the probability of PH, and the result. Each change flashes where it acts.
const NAME = {
  rvb: 'RV basal diameter', wall: 'RV free wall', eda: 'RV end-diastolic area', esa: 'RV end-systolic area', ra: 'RA area', tapse: 'TAPSE',
  eiD: 'LVEI, end-diastole', eiS: 'LVEI, end-systole', pa: 'Main PA diameter', trv: 'Peak TR velocity', acct: 'RVOT acceleration time', notch: 'Mid-systolic notch',
  prv: 'Early-diastolic PR velocity', sPrime: 'RV S′', ivc: 'IVC diameter', coll: 'IVC collapse, sniff',
  fac: 'Fractional area change', grad: 'RV–RA gradient', rap: 'RA pressure', rvsp: 'RV systolic pressure', lvb: 'LV basal diameter', rvlv: 'RV/LV basal ratio', tsp: 'TAPSE/sPAP',
};
const UNIT = {
  rvb: 'cm', wall: 'mm', eda: 'cm²', esa: 'cm²', ra: 'cm²', tapse: 'mm', eiD: '', eiS: '', pa: 'cm', trv: 'm/s', acct: 'ms', prv: 'm/s', sPrime: 'cm/s',
  ivc: 'cm', coll: '%', fac: '%', grad: 'mmHg', rap: 'mmHg', rvsp: 'mmHg', lvb: 'cm', rvlv: '', tsp: 'mm/mmHg',
};
const ARIA = {
  rvb: 'RV basal diameter', wall: 'RV free wall thickness', eda: 'RV end-diastolic area', esa: 'RV end-systolic area', ra: 'RA area', tapse: 'TAPSE',
  eiD: 'LV eccentricity index at end-diastole', eiS: 'LV eccentricity index at end-systole', pa: 'main PA diameter', trv: 'peak TR velocity',
  acct: 'RVOT acceleration time', prv: 'early-diastolic PR velocity', sPrime: 'RV S′', ivc: 'IVC diameter', coll: 'IVC collapse with a sniff',
};
const SWITCH_LABEL = { notch: ['None', 'Present'] };
/** The measurements in the groups of the diagram. */
const GROUPS = [
  ['twod', '2D and M-mode', 'RV-focused four-chamber view at end-diastole (RA at end-systole); short axis at the papillary muscles', ['rvb', 'wall', 'eda', 'esa', 'ra', 'tapse', 'eiD', 'eiS', 'pa']],
  ['dop', 'Doppler', 'CW through the TR and the PR jet; PW in the RVOT; tissue Doppler of the annulus', ['trv', 'acct', 'notch', 'prv', 'sPrime']],
  ['ivc', 'IVC', 'subcostal view, at end-expiration and with a sniff', ['ivc', 'coll']],
];
/** The names in the change line: the cause, and its effects. */
const EFFECT = { fac: 'FAC', grad: 'RV–RA gradient', rap: 'RA pressure', rvsp: 'RVSP', lvb: 'LV basal diameter', rvlv: 'RV/LV ratio', tsp: 'TAPSE/sPAP' };
/** What each measurement changes. */
const EFFECTS = { trv: ['rvsp', 'grad', 'tsp'], ivc: ['rap', 'rvsp', 'tsp'], coll: ['rap', 'rvsp', 'tsp'], eda: ['fac'], esa: ['fac'], tapse: ['tsp'], rvb: ['rvlv'], eiD: ['lvb', 'rvlv'] };
/** Each formula, and its numbers: text, and the keys whose values show. */
const FORMULA = {
  grad: ['4 × peak TR velocity²', ['4 × ', { k: 'trv' }, '²']],
  rvsp: ['RV–RA gradient + RA pressure', [{ k: 'grad' }, ' + ', { k: 'rap' }]],
  fac: ['(EDA − ESA) ÷ EDA', ['(', { k: 'eda' }, ' − ', { k: 'esa' }, ') ÷ ', { k: 'eda' }]],
  rvlv: ['RV basal ÷ LV basal diameter', [{ k: 'rvb' }, ' ÷ ', { k: 'lvb' }]],
  tsp: ['TAPSE ÷ RVSP', [{ k: 'tapse' }, ' ÷ ', { k: 'rvsp' }]],
};
/** The widest each number gets (characters), so a formula keeps its place as values change. */
const WIDE = { trv: 3, grad: 3, rap: 2, eda: 4, esa: 4, rvb: 3, lvb: 3, tapse: 2, rvsp: 3 };
const STEPS = [
  ['size', 'RV size and function', ['rvb', 'wall', 'eda', 'esa', 'fac', 'ra', 'tapse', 'sPrime']],
  ['press', 'Pulmonary pressure and flow', ['grad', 'rap', 'rvsp', 'trv', 'acct', 'pa']],
];
const UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 7.2 5 2.6l3.8 4.6z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 2.8 5 7.4l3.8-4.6z" fill="currentColor"/></svg>';
const BANDS_NOTE = 'Table 1 grades each measure as normal or mildly, moderately or severely abnormal; the bands are for adults, both sexes together. The diagram uses the corrected version of the guideline (May 2025).';
const SEPT_NOTE = 'The LV eccentricity index is D2 ÷ D1 on the short axis at the papillary muscles: D1 from the septum across the LV, D2 square to it. It is 1 in a round LV<span class="cite" data-ref="mukherjee2025,ryan1985"></span>. The diagram calls the septum flat above 1.1, the threshold of the ESC/ERS signs<span class="cite" data-ref="humbert2022"></span>; the ASE guideline calls an index above 1 abnormal.';
const ESC_NOTE = 'The other signs change the probability only when they come from at least two of the three categories. The aortic root of the model is 3.1 cm. RA area: the ESC/ERS sign is &gt;18 cm²; the ASE band of normal is &lt;19 cm².';
/** A slider's crossing stays in the change line this long (ms) while the moves after it cross nothing. */
const HOLD = 2500;
const num = (k, x) => (SWITCH[k] ? SWITCH_LABEL[k][SWITCH[k].indexOf(x)].toLowerCase() : x.toFixed(DEC[k]));
const withUnit = (k, s) => (UNIT[k] ? `${s}${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const txt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
const LEAD = {
  pressure: { normal: 'Normal RV systolic pressure', mild: 'Mild pulmonary hypertension', moderate: 'Moderate pulmonary hypertension', severe: 'Severe pulmonary hypertension' },
  volume: { normal: 'Normal RV size', mild: 'Mild RV dilation', moderate: 'Moderate RV dilation', severe: 'Severe RV dilation' },
};
const PROB = ['low', 'intermediate', 'high'];

let dg = null;          // the diagram's elements
let prev = null;        // what the diagram showed last
let pending = null;     // the cause of the change being drawn: an edit or Reset (else the slider)
let fresh = true;       // the next drawing sets the baseline: no change line, no flash
let lastCross = -1e9, lineKind = '';

function buildDiagram(host) {
  if (!host) return;
  const btn = (k, dir) => `<button type="button" class="ase-b" data-k="${k}" data-dir="${dir}" aria-label="${dir > 0 ? 'Increase' : 'Decrease'} ${ARIA[k]}">${dir > 0 ? UP : DOWN}</button>`;
  const input = (k) => (SWITCH[k]
    ? `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="seg rgx-tg">${SWITCH[k].map((x, i) => `<button type="button" data-k="${k}" data-i="${i}" aria-pressed="false">${SWITCH_LABEL[k][i]}</button>`).join('')}</span>
    </div>`
    : `<div class="ase-row asx-in" data-row="${k}" role="group" aria-label="${NAME[k]}">
      <span class="ase-nm">${NAME[k]}</span>
      <span class="ase-ctl">${btn(k, -1)}<span class="ase-v"><b></b><small>${UNIT[k]}</small></span>${btn(k, 1)}</span>
    </div>`);
  const group = ([s, name, sub, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">${sub}</span></p>
      ${keys.map(input).join('')}
    </div>`;
  const nums = (k) => FORMULA[k][1].map((p) => (typeof p === 'string' ? p : `<i data-x="${p.k}" style="--w:${WIDE[p.k] || 3}ch"></i>`)).join('');
  const chips = (k) => `<span class="asx-chips" aria-hidden="true">${BANDS[k].map(([lab], i) => `<span class="asx-c" data-i="${i}" data-l="${i}">${GNAME[i]} ${lab}</span>`).join('')}</span>`;
  const eq = (k) => `<div class="asx-eq" data-eq="${k}" role="group" aria-label="${NAME[k]}">
      <p class="asx-top"><span class="asx-nm">${NAME[k]}</span><span class="asx-v"><b></b><small>${UNIT[k]}</small></span>${BANDS[k] ? '<span class="asx-st"></span>' : ''}</p>
      ${FORMULA[k] ? `<p class="asx-f"><span class="asx-fx">${FORMULA[k][0]}</span> = <span class="asx-n">${nums(k)}</span></p>` : k === 'rap' ? '<p class="asx-f"><span class="asx-fx"></span></p>' : ''}
      ${BANDS[k] ? chips(k) : ''}
    </div>`;
  const sign = (cat) => ([k, name, rule]) => `<p class="asx-q" data-c="${cat}:${k}"><i class="ase-mk" aria-hidden="true"></i><span class="asx-qn">${name}</span>${rule ? `<span class="asx-qr">${rule}</span>` : ''}<span class="asx-qs"></span></p>`;
  const cat = ([c, name, , list]) => `<div class="rgx-set" data-set="${c}" data-n="${list.length}"><p class="rgx-sh"><span>${c} · ${name}</span><span class="ase-count"></span></p>${list.map(sign(c)).join('')}</div>`;
  host.innerHTML = `
    <div class="ase-tbar"><h3 class="ase-title">Measurements and grades</h3><button type="button" class="ase-reset is-off" aria-label="Reset the edited values">Reset</button></div>
    <div class="ase-head">
      <p class="ase-result" tabindex="-1"><b></b> · <span></span></p>
      <p class="ase-change" aria-live="polite"></p>
    </div>
    ${GROUPS.map(group).join('')}
    ${STEPS.map(([s, name, keys]) => `<div class="ase-step is-on asx-step" data-s="${s}">
      <p class="ase-sh"><span class="ase-sn">${name}</span><span class="ase-sx">ASE 2025, Table 1<span class="cite" data-ref="mukherjee2025"></span></span>${s === 'press' ? `<a class="asx-go" href="#pressure" data-go="pressure" aria-label="The RV systolic pressure: chapter ${numOf('pressure')}, Doppler hemodynamics">${numOf('pressure')} Pressure →</a>` : ''}</p>
      ${keys.map(eq).join('')}
      ${s === 'size' ? `<p class="ase-note asx-note">${BANDS_NOTE}</p>` : ''}
    </div>`).join('')}
    <div class="ase-step is-on asx-step" data-s="sept">
      <p class="ase-sh"><span class="ase-sn">Septum</span><span class="ase-sx">the LV's shape at end-diastole and at end-systole<span class="cite" data-ref="mukherjee2025"></span></span></p>
      <div class="asx-br is-on" data-b="pat"><p class="asx-bl">The septum is</p><p class="asx-os">${Object.keys(PATTERN).map((o) => `<span class="ase-o" data-o="${o}"${o === 'none' ? '' : ' data-sev'}>${PATTERN[o]}</span>`).join('')}</p></div>
      <p class="ase-note asx-note rgx-pat"></p>
      <p class="ase-note asx-note">${SEPT_NOTE}</p>
    </div>
    <div class="ase-step is-on asx-step" data-s="esc">
      <p class="ase-sh"><span class="ase-sn">Probability of PH</span><span class="ase-sx">ESC/ERS 2022, Table 10 and Figure 5<span class="cite" data-ref="humbert2022"></span></span></p>
      <div class="asx-br is-on" data-b="trv"><p class="asx-bl">Peak TR velocity, m/s</p><p class="asx-os">${TRV_BANDS.map(([lab], i) => `<span class="ase-o" data-o="t${i}"${i ? ' data-sev' : ''}>${lab}</span>`).join('')}</p></div>
      ${['lvb', 'rvlv', 'tsp'].map(eq).join('')}
      ${SIGNS.map(cat).join('')}
      <p class="asx-q rgx-qg"><span class="asx-qn">Categories with a sign</span><span class="asx-qr">at least two change the probability</span><span class="asx-qs"></span></p>
      <p class="ase-note asx-note">${ESC_NOTE}</p>
    </div>
    <div class="ase-step is-on ase-res asx-step" data-s="res">
      <p class="ase-sh"><span class="ase-sn">Result</span><span class="ase-sx">the echocardiographic probability of PH<span class="cite" data-ref="humbert2022"></span></span></p>
      <div class="asx-br is-on" data-b="prob"><p class="asx-bl">Probability</p><p class="asx-os">${PROB.map((o) => `<span class="ase-o" data-o="${o}"${o === 'low' ? '' : ' data-sev'}>${o}</span>`).join('')}</p></div>
    </div>`;
  const q = (s) => host.querySelector(s);
  dg = {
    host, result: q('.ase-result'), head: q('.ase-result b'), sub: q('.ase-result span'), change: q('.ase-change'), reset: q('.ase-reset'), pat: q('.rgx-pat'),
    rows: Object.fromEntries(IN.map((k) => {
      const el = q(`[data-row="${k}"]`);
      return [k, { el, v: el.querySelector('.ase-v b'), dn: el.querySelector('[data-dir="-1"]'), up: el.querySelector('[data-dir="1"]') }];
    })),
    sw: Object.fromEntries(SW.map((k) => [k, { el: q(`[data-row="${k}"]`), bs: [...host.querySelectorAll(`[data-row="${k}"] button`)] }])),
    eqs: Object.fromEntries([...host.querySelectorAll('.asx-eq')].map((el) => [el.dataset.eq, {
      el, v: el.querySelector('.asx-v b'), st: el.querySelector('.asx-st'), chips: el.querySelector('.asx-chips'), fx: el.querySelector('.asx-fx'),
      cs: [...el.querySelectorAll('.asx-c')], xs: [...el.querySelectorAll('[data-x]')],
    }])),
    qg: { el: q('.rgx-qg'), st: q('.rgx-qg .asx-qs') },
    sets: Object.fromEntries([...host.querySelectorAll('.rgx-set')].map((el) => [el.dataset.set, { el, n: el.querySelector('.ase-count'), of: Number(el.dataset.n) }])),
    crit: Object.fromEntries([...host.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, { el, st: el.querySelector('.asx-qs') }])),
    out: Object.fromEntries([...host.querySelectorAll('.ase-o')].map((el) => [el.dataset.o, el])),
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b && !b.disabled) edit(b.dataset.k, b.dataset.i !== undefined ? SWITCH[b.dataset.k][Number(b.dataset.i)] : Number(b.dataset.dir), b);
    else if (e.target.closest('.ase-reset')) resetEdits();
  });
}

/** The measurements and the switch of the values v, as rvx stores them. */
const valsOf = (v) => Object.fromEntries([...IN, ...SW].map((k) => [k, v[k]]));

/** The keys of rvx that differ from the model's values where the edits started. */
function editedOf(ed) {
  const m = measure(modelAt(ed.base, ed.load, heartOf(st)), heartOf(st));
  return [...IN.filter((k) => Math.abs(ed[k] - m[k]) > 1e-9), ...SW.filter((k) => ed[k] !== m[k])];
}

const freeLive = () => { const live = document.querySelector('#ch-rv .live'); if (live?.style.minHeight) live.style.minHeight = ''; };

/** A ▲▼ click (dir) or the switch (its value): the edited values and the slider at their result, in one patch; Play and the tour stop. */
function edit(k, x, btn = null) {
  const s = st;
  const base = s[EDITS] ? s[EDITS].base : s[KEY], load = s[EDITS] ? s[EDITS].load : loadOf(s);
  const cur = shown(s);
  const vals = valsOf(cur);
  const from = vals[k], to = SWITCH[k] ? x : stepOf(from, limits(k, cur), x);
  if (to === from) return;
  vals[k] = to;
  const ed = { ...vals, base, load };
  const next = shownOf({ ...s, [EDITS]: ed });
  pending = { kind: 'edit', k, from, to };
  steady(btn, () => {
    if (!editedOf(ed).length) setState({ [EDITS]: null, [KEY]: base, anim: false, playing: false });   // back at the model's values
    else setState({ [EDITS]: Object.freeze(ed), [KEY]: slideOf(s[KEY], next.grade, BANDS_OF[load]), anim: false, playing: false });
  });
  pending = null;
  if (next.grade !== cur.grade || next.esc.prob !== cur.esc.prob) cue('bell');
}

function resetEdits() {
  pending = { kind: 'reset' };
  setState({ [EDITS]: null, anim: false, playing: false });
  pending = null;
  dg?.result.focus({ preventScroll: true });
}

/** The diagram at the values on screen: numbers, bands, signs, the result; then what changed. */
function renderDiagram(s, v) {
  if (!dg) return;
  const M = { ed: !!s[EDITS], v, out: `${v.load}|${v.grade}|${v.esc.prob}|${v.pat}`, eds: s[EDITS] ? editedOf(s[EDITS]) : [] };
  const P = fresh ? null : prev;
  fresh = false;
  prev = M;
  for (const k of IN) {
    const R = dg.rows[k], L = limits(k, v);
    txt(R.v, num(k, v[k]));
    R.el.classList.toggle('is-ed', M.eds.includes(k));
    for (const [b, off, other] of [[R.dn, v[k] <= L.min + 1e-9, R.up], [R.up, v[k] >= L.max - 1e-9, R.dn]]) {
      if (off && document.activeElement === b) other.focus();   // keep the focus in the row at a limit
      b.disabled = off;
    }
  }
  for (const [k, S] of Object.entries(dg.sw)) {
    S.bs.forEach((b, i) => b.setAttribute('aria-pressed', String(SWITCH[k][i] === v[k])));
    S.el.classList.toggle('is-ed', M.eds.includes(k));
  }
  for (const [k, E] of Object.entries(dg.eqs)) {
    txt(E.v, num(k, v[k]));
    for (const el of E.xs) txt(el, num(el.dataset.x, v[el.dataset.x]));
    if (k === 'rap') txt(E.fx, `IVC ${v.ivc.toFixed(1)} cm ${v.rapE.dilated ? '>' : '≤'}2.1, collapse ${v.coll}% ${v.rapE.collapses ? '≥' : '<'}50%${v.rapE.indeterminate ? ': indeterminate' : ''}`);
    if (!E.st) continue;
    const g = v.g[k];
    E.cs.forEach((c) => c.classList.toggle('is-on', Number(c.dataset.i) === g));
    txt(E.st, GNAME[g]);
    E.el.dataset.l = g;
  }
  // the septum
  for (const o of Object.keys(PATTERN)) dg.out[o].classList.toggle('is-on', o === v.pat);
  txt(dg.pat, `LVEI ${v.eiD.toFixed(2)} at end-diastole and ${v.eiS.toFixed(2)} at end-systole: ${PATTERN_MEANS[v.pat]}.`);
  // the probability
  TRV_BANDS.forEach((_, i) => dg.out[`t${i}`].classList.toggle('is-on', i === v.esc.band));
  for (const [id, R] of Object.entries(dg.crit)) {
    const on = v.esc.on[id.split(':')[1]];
    R.el.classList.toggle('is-on', on);
    txt(R.st, on ? 'yes' : 'no');
  }
  for (const [c, R] of Object.entries(dg.sets)) {
    const n = SIGNS.find(([x]) => x === c)[3].filter(([k]) => v.esc.on[k]).length;
    txt(R.n, `${n} of ${R.of}`);
    R.el.classList.toggle('is-on', n > 0);
  }
  txt(dg.qg.st, `${v.esc.cats.length} of 3${v.esc.cats.length ? ` (${v.esc.cats.join(', ')})` : ''}`);
  dg.qg.el.classList.toggle('is-on', v.esc.other);
  for (const o of PROB) dg.out[o].classList.toggle('is-on', o === v.esc.prob);
  // the result
  txt(dg.head, LEAD[v.load][v.grade]);
  txt(dg.sub, `${v.load === 'pressure' ? `RVSP ${v.rvsp} mmHg` : `RV basal diameter ${v.rvb.toFixed(1)} cm`} · septum ${PATTERN[v.pat]} · probability of PH ${v.esc.prob}`);
  dg.result.classList.toggle('is-raised', v.grade === 'severe' || v.esc.prob === 'high');
  dg.reset.classList.toggle('is-off', !M.ed);   // its room stays, so nothing moves when it shows
  if (!M.ed && !pending) freeLive();
  // the slider's label: main.js writes it when rvS changes, and an edit can change it alone
  const o = document.querySelector('output[data-for="rvS"]');
  if (o) txt(o, rvPage.format.rvS(s[KEY], s));
  if (!P) { txt(dg.change, ''); lineKind = ''; return; }
  const moved = IN.some((k) => P.v[k] !== v[k]) || SW.some((k) => P.v[k] !== v[k]) || P.out !== M.out || P.ed !== M.ed;
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

/** What a change crossed: the bands of Table 1, the septum and the signs' categories. */
function crossed(P, M) {
  const a = P.v, b = M.v, out = [];
  for (const k of GRADED) if (a.g[k] !== b.g[k]) out.push(`${EFFECT[k] || NAME[k]} ${GNAME[b.g[k]]} ${BANDS[k][b.g[k]][0]}${UNIT[k] ? `${UNIT[k] === '%' ? '' : ' '}${UNIT[k]}` : ''}`);
  if (a.pat !== b.pat) out.push(`septum ${PATTERN[b.pat]}`);
  if (a.esc.cats.length !== b.esc.cats.length) out.push(`signs in ${b.esc.cats.length} of 3 categories`);
  return out;
}

/** The cause and effect of a change, as one line. crossed: a band, the septum or the result changed. */
function changeLine(P, M, cause) {
  const head = cause.kind === 'edit' ? `${NAME[cause.k]} ${withUnit(cause.k, `${num(cause.k, cause.from)} → ${num(cause.k, cause.to)}`)}` : cause.kind === 'reset' ? 'Reset' : 'Severity';
  const cut = crossed(P, M);
  let what;
  if (cause.kind === 'edit' && EFFECTS[cause.k]) {
    const ch = EFFECTS[cause.k].filter((k) => P.v[k] !== M.v[k]).slice(0, 2);
    what = [...ch.map((k) => `${EFFECT[k]} ${withUnit(k, `${num(k, P.v[k])} → ${num(k, M.v[k])}`)}`), ...cut.slice(0, 2)].join(', ') || 'no band changed';
  } else what = [...(P.ed && !M.ed ? ['edits cleared'] : []), ...cut.slice(0, 3)].join(', ') || 'no cut-off crossed';
  const r = (x) => `${LEAD[x.v.load][x.v.grade].toLowerCase()}, probability ${x.v.esc.prob}`;
  const result = P.out === M.out ? `Result unchanged: ${r(M)}` : `Result: ${r(P)} → ${r(M)}`;
  return { text: `${head}: ${what}. ${result}.`, crossed: cut.length > 0 || P.out !== M.out };
}

function flashChanges(P, M, cause) {
  const a = P.v, b = M.v;
  for (const k of GRADED) if (a.g[k] !== b.g[k] && dg.eqs[k]) flash(dg.eqs[k].chips);
  if (a.pat !== b.pat) flash(dg.out[b.pat]);
  for (const [id, R] of Object.entries(dg.crit)) { const k = id.split(':')[1]; if (a.esc.on[k] !== b.esc.on[k]) flash(R.el); }
  if (a.esc.other !== b.esc.other) flash(dg.qg.el);
  if (a.esc.band !== b.esc.band) flash(dg.out[`t${b.esc.band}`]);
  if (a.esc.prob !== b.esc.prob) flash(dg.out[b.esc.prob]);
  if (P.out !== M.out) flash(dg.result);
  // an edit: the numbers it changed pulse, so each calculation shows that it follows its inputs
  if (cause.kind === 'edit' && !SWITCH[cause.k]) {
    flash(dg.rows[cause.k].v.parentElement, 'is-tick');
    for (const [k, E] of Object.entries(dg.eqs)) {
      if (a[k] !== b[k]) flash(E.v.parentElement, 'is-tick');
      for (const el of E.xs) if (a[el.dataset.x] !== b[el.dataset.x]) flash(el, 'is-tick');
    }
  }
}

/** The live sentences: the result in bold, then size, function, the septum and the probability of PH. */
function liveOf(v, s, cite) {
  const M = cite('mukherjee2025'), H = cite('humbert2022');
  const w = (k) => wordOf(k, v.g[k]);
  const s0 = v.load === 'pressure'
    ? ` The peak TR velocity is ${fmt(v.trv, 1)} m/s and the estimated RA pressure ${v.rap} mmHg, so the RV systolic pressure is ${v.rvsp} mmHg, ${v.g.rvsp ? `the range of ${GNAME[v.g.rvsp]} PH (${BANDS.rvsp[v.g.rvsp][0]} mmHg)` : 'normal (≤34 mmHg)'}${M}.`
    : ` The RV basal diameter is ${fmt(v.rvb, 1)} cm (${w('rvb')}) and the RA area ${v.ra} cm² (${w('ra')}); the peak TR velocity is ${fmt(v.trv, 1)} m/s, and the RV systolic pressure ${v.rvsp} mmHg${M}.`;
  const s1 = v.load === 'pressure'
    ? ` The RV basal diameter is ${fmt(v.rvb, 1)} cm (${w('rvb')}), the RV free wall ${fmt(v.wall, 1)} mm (${w('wall')}) and the RA area ${v.ra} cm² (${w('ra')}).`
    : ` The RV free wall is ${fmt(v.wall, 1)} mm (${w('wall')}), and the RV end-diastolic area ${fmt(v.eda, 1)} cm² (${w('eda')}).`;
  const trac = v.g.tapse === 0 && v.g.fac > 0
    ? ` TAPSE and S′ measure the base of the free wall, which can keep its motion in a pressure-overloaded RV, so they can overestimate RV function while FAC falls${M}.`
    : '';
  const s2 = ` TAPSE is ${v.tapse} mm (${w('tapse')}), S′ ${fmt(v.sPrime, 1)} cm/s (${w('sPrime')}) and FAC ${v.fac}% (${w('fac')})${M}.`;
  const s3 = ` The LV eccentricity index is ${v.eiD.toFixed(2)} at end-diastole and ${v.eiS.toFixed(2)} at end-systole: the septum is ${PATTERN[v.pat]}, ${v.pat === 'none' ? 'with no overload pattern' : `the pattern of ${PATTERN_MEANS[v.pat]}`}${M}.`;
  const signs = v.esc.cats.length ? `signs from ${v.esc.cats.length === 1 ? 'one category' : `${['', 'one', 'two', 'three'][v.esc.cats.length]} categories`} (${v.esc.cats.map((c) => SIGNS.find(([x]) => x === c)[2]).join(', ')})` : 'no other signs';
  const s4 = ` A peak TR velocity of ${fmt(v.trv, 1)} m/s (${TRV_BANDS[v.esc.band][0]} m/s) with ${signs} gives ${v.esc.prob === 'intermediate' ? 'an' : 'a'} ${v.esc.prob} echocardiographic probability of PH${H}.`;
  const ed = s[EDITS] ? editedOf(s[EDITS]) : [];
  // the caveat on TAPSE last, so that the sentences before it keep their places (the video picks them)
  return `<b>${LEAD[v.load][v.grade]}.</b>${s0}${s1}${s2}${s3}${s4}${trac}${ed.length ? ` Edited values: ${ed.map((k) => NAME[k]).join(', ')}.` : ''}`;
}

const rvPage = {
  key: 'rv',
  part: 'function',
  title: 'Right ventricle',
  nav: 'RV',
  dwell: 26,
  defaults: { rvS: 0.5, rvLoad: 'pressure', rvFrame: 'cine', [EDITS]: null },
  format: {
    rvS: (x, s) => {
      const load = s ? (s[EDITS] ? s[EDITS].load : loadOf(s)) : 'pressure';
      const g = s?.[EDITS] ? shown(s).grade : gradeOf(x, load);
      return g === 'normal' ? 'normal' : `${g} ${load === 'pressure' ? 'PH' : 'dilation'}`;
    },
  },
  watch: ['rvS', 'rvLoad', 'rvFrame', EDITS, 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    for (const load of LOADS) BANDS_OF[load] = bands((x) => gradeOf(x, load));
    const host = document.getElementById('rv-grades');
    let painted = '';
    const paint = (s) => {
      const load = loadOf(s);
      if (load === painted) return;
      painted = load;
      paintBands(host, BANDS_OF[load], { normal: 0, mild: 1, moderate: 2, severe: 3 }, { moderate: 'mod.' });
    };
    paint(state);
    buildDiagram(document.getElementById('rv-calc'));
    // The slider, the load, Play, the tour or a heart's preset: the values follow the slider again.
    // A store listener, not onState, so that a heart chosen on another chapter clears the edits too.
    subscribe?.((s, ch) => {
      if (LOAD in ch) paint(s);
      if (s[EDITS] && !(EDITS in ch) && (KEY in ch || LOAD in ch || 'pheno' in ch || ('anim' in ch && s.anim) || ('playing' in ch && s.playing))) set({ [EDITS]: null });
    });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { fresh = true; freeLive(); MESH.start(); MESH_PM.start(); },
  leave() { fresh = true; freeLive(); },
  // the heart model and the RV's targets load at idle, before the chapter opens (main.js warms every chapter)
  warm() { MESH.start(); MESH_PM.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS_OF[loadOf(s)]);
    if (beat.tick(dt, (s[FRAME] || 'cine') === 'cine') && sheet) sheet.dirty = true;
  },
  // the sequence: pressure overload from normal to severe, then volume overload
  tourEnter(set) { set({ rvS: 0, rvLoad: 'pressure', rvFrame: 'cine', [EDITS]: null }); },
  tourTick(tt, set) {
    if (tt < 13) set({ rvLoad: 'pressure', rvS: Math.round(clamp((tt - 1) / 11, 0, 1) * 200) / 200 });
    else set({ rvLoad: 'volume', rvS: Math.round(clamp((tt - 14) / 11, 0, 1) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse): the sequence continues from it
  tourAt(s) { return loadOf(s) === 'volume' ? 14 + s.rvS * 11 : 1 + s.rvS * 11; },
  text(s, { cite }) {
    const v = shown(s);
    return {
      readouts: [
        { k: 'RV basal diameter', v: fmt(v.rvb, 1), u: 'cm', flag: v.g.rvb > 0 },
        { k: 'RV free wall', v: fmt(v.wall, 1), u: 'mm', flag: v.g.wall > 0 },
        { k: 'TAPSE', v: fmt(v.tapse), u: 'mm', flag: v.g.tapse > 0 },
        { k: 'RV systolic pressure', v: fmt(v.rvsp), u: 'mmHg', flag: v.g.rvsp > 0 },
        { k: 'LVEI, ED / ES', v: `${v.eiD.toFixed(2)} / ${v.eiS.toFixed(2)}`, text: true, flag: v.pat !== 'none' },
        { k: 'Probability of PH', v: v.esc.prob, text: true, flag: v.esc.prob !== 'low' },
      ],
      live: liveOf(v, s, cite),
      extra: () => renderDiagram(s, v),
    };
  },
};
export default rvPage;
