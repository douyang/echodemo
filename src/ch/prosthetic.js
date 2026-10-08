// Prosthetic aortic valves: one slider from normal function to significant stenosis of a surgical
// valve, a switch for the valve (a stented bioprosthesis or a bileaflet mechanical valve) and a
// switch for the cause of a high gradient: obstruction of the valve (thickened leaflets that open
// less, or a disc that opens less, from degeneration, thrombus or pannus), or prosthesis-patient
// mismatch (a normal valve, small for the patient). The Doppler measures follow the ASE 2024
// guideline (Zoghbi, Table 5, Table 7 and Figure 13); the reference EOA of each valve is its row
// of Appendix Table A4. The figure: the parasternal long axis and the short axis at the valve cut
// from the heart mesh, with the prosthesis in the heart's own annulus (gl/prostheticmesh.js); CW
// Doppler through the valve and PW Doppler in the LVOT; the measurements against their cut-offs.
import { Sheet, clamp } from '../sketch.js';
import { panel, spectral, vscale, caliper, tagBox, SC } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { shown, tracks, lazyBands, paintBands, playSeverity, Beat, cursor, rows, cols, inner, meters, note, fit, gradeTable } from '../sev.js';
import { cal } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { annulusOf, prosthesisItems, CLOSED, OPEN, SIZE } from '../gl/prostheticmesh.js';

const KEY = 'proS';
const VALVE = 'proValve';
const CAUSE = 'proCause';

// ---------------------------------------------------------------- the valves and the patient
// Two 23-mm surgical valves, with the reference EOA (mean ± SD) of their row of the ASE 2024
// Appendix Table A4: a stented bovine pericardial valve (Perimount) and a bileaflet mechanical
// valve (St. Jude Medical Standard). Both have a reference EOA of 1.6 cm².
const VALVES = {
  bio: { name: 'bioprosthesis', long: 'stented bovine pericardial bioprosthesis', row: 'Perimount', ref: 1.6, sd: 0.3, of: 'the bioprosthesis' },
  mech: { name: 'mechanical valve', long: 'bileaflet mechanical valve', row: 'St. Jude Medical Standard', ref: 1.6, sd: 0.4, of: 'the mechanical valve' },
};
const LABEL = 23;          // mm, both valves
const LVOT_D = 2.2;        // cm: the LVOT 0.4 cm below the sewing ring, measured on the normal heart's mesh
const ET = 0.292;          // s, the model's ejection time (cyclemodel.js, Alhakak 2025)
const BSA0 = 1.8;          // m², the patient of the obstruction track
const SVI = 41.7;          // mL/m², the stroke volume index: 75 mL at 1.8 m²

// ---------------------------------------------------------------- the Doppler envelopes
// The jet's envelope over ejection: v(t) = V g(t / ET), g(u) = sin(π u^q)^p. q puts the peak at
// the acceleration time (u = 0.5^(1/q) = AT/ET); p is fitted to the jet's VTI and peak velocity, as
// in as.js. The LVOT envelope is symmetric (q = 1).
const P_LO = 0.1, P_HI = 24;
const shape = (q, p) => (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * Math.pow(u, q)), p) : 0);
const memo = new Map();
function gMean(q, p) {
  const key = `${q.toFixed(5)}|${p.toFixed(5)}`;
  let m = memo.get(key);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < 240; i++) m += Math.pow(Math.sin(Math.PI * Math.pow((i + 0.5) / 240, q)), p);
    m /= 240;
    if (memo.size > 4000) memo.clear();
    memo.set(key, m);
  }
  return m;
}
/** The p for which the mean of g is f, within P_LO to P_HI. */
function fitP(q, f) {
  if (f >= gMean(q, P_LO)) return P_LO;
  if (f <= gMean(q, P_HI)) return P_HI;
  let lo = Math.log(P_LO), hi = Math.log(P_HI);
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (gMean(q, Math.exp(m)) > f) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}
const qOf = (atet) => Math.log(0.5) / Math.log(clamp(atet, 0.1, 0.6));

// ---------------------------------------------------------------- the model
// Obstruction: the EOA falls from the valve's reference; the jet peaks later and rounder (AT/ET
// from 0.23 to 0.46, p from 1.0 to 0.6); the bioprosthesis's leaflets thicken (cm, drawn, not
// printed). The flow stays normal: 75 mL, 257 mL/s over ejection. Mismatch: the same valve,
// opening to its reference EOA, in a larger patient: the indexed EOA falls from 0.89 to 0.64
// cm²/m² (BSA 1.8 to 2.5 m²), and the stroke volume keeps its index, so the flow and the
// velocity rise; the jet stays early-peaking. At the slider's start both tracks are one patient.
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const OBST = {
  bio: tracks(STOPS, { eoa: [1.6, 1.42, 1.12, 0.82, 0.6], atet: [0.23, 0.265, 0.33, 0.4, 0.46], p: [1.0, 0.95, 0.8, 0.66, 0.6], thick: [0.08, 0.1, 0.16, 0.26, 0.34] }),
  mech: tracks(STOPS, { eoa: [1.6, 1.38, 1.02, 0.7, 0.52], atet: [0.23, 0.265, 0.33, 0.4, 0.46], p: [1.0, 0.95, 0.8, 0.66, 0.6], thick: [0.08, 0.08, 0.08, 0.08, 0.08] }),
};
const MISMATCH = tracks(STOPS, { ieoa: [1.6 / BSA0, 0.84, 0.75, 0.66, 0.635] });

const valveOf = (s) => (s[VALVE] === 'mech' ? 'mech' : 'bio');
const causeOf = (s) => (s[CAUSE] === 'ppm' ? 'ppm' : 'obst');

/** The model at slider position s: the true values before they are measured. */
function modelAt(s, valve, cause) {
  const V = VALVES[valve];
  let eoa, bsa, atet, p, thick;
  if (cause === 'ppm') { const t = MISMATCH(s); eoa = V.ref; bsa = eoa / t.ieoa; atet = 0.23; p = 1.0; thick = 0.08; }
  else { const t = OBST[valve](s); ({ eoa, atet, p, thick } = t); bsa = BSA0; }
  const sv = SVI * bsa, csa = Math.PI * (LVOT_D / 2) ** 2;
  const vtiL = sv / csa, vtiA = sv / eoa;
  return {
    s, valve, cause, bsa, thick, d: LVOT_D, vtiL, vtiA, at: atet * ET * 1000, et: ET * 1000,
    vmax: vtiA / (100 * ET * gMean(qOf(atet), p)), vL: vtiL / (100 * ET * gMean(1, 0.8)),
  };
}

/**
 * The opening angles (degrees) of the two discs for an EOA that is the share r of the
 * reference. The first disc loses its motion first, then the second. A disc that passes the
 * share g of its half of the orifice opens to CLOSED + (OPEN − CLOSED) × g^0.65, a model choice.
 * sten: the Doppler grade (0 normal); the first disc opens to 73° or more (the CT limit) while
 * the grade is normal and to 72° or less once it is not, so the leaflets and the grade agree.
 */
function discAngles(r, sten) {
  const k = (g) => Math.round(CLOSED + (OPEN - CLOSED) * Math.pow(clamp(g, 0, 1), 0.65));
  const a = r >= 0.5 ? [k(2 * r - 1), OPEN] : [CLOSED, k(2 * r)];
  return [sten > 0 ? Math.min(a[0], 72) : Math.max(a[0], 73), a[1]];
}

/**
 * Values as reported: the measurements at their decimals, and each calculation from the rounded
 * values before it. The columns of Table 5, the grade, the words and the image read these.
 */
function measure(m) {
  const V = VALVES[m.valve];
  const v = { ...m, ref: V.ref, sd: V.sd };
  v.d = shown(m.d, 1);
  v.vtiL = shown(m.vtiL, 1);
  v.vtiA = shown(m.vtiA, 1);
  v.vmax = shown(m.vmax, 1);
  v.vL = shown(m.vL, 2);
  v.at = shown(m.at, 0);
  v.et = shown(m.et, 0);
  v.bsa = shown(m.bsa, 2);
  const csa = Math.PI * (v.d / 2) ** 2;
  v.sv = shown(csa * v.vtiL, 0);
  v.eoa = shown((csa * v.vtiL) / v.vtiA, 2);
  v.dvi = shown(v.vtiL / v.vtiA, 2);
  v.atet = shown(v.at / v.et, 2);
  v.ieoa = shown(v.eoa / v.bsa, 2);
  // the drawn envelopes: the jet's peak at AT, its fullness fitted to the VTI; the mean gradient
  // is the mean of 4v² over it (as in as.js)
  v.qA = qOf(v.at / v.et);
  v.pA = fitP(v.qA, v.vtiA / (100 * v.vmax * ET));
  v.pL = fitP(1, v.vtiL / (100 * v.vL * ET));
  v.mg = shown(4 * v.vmax ** 2 * gMean(v.qA, 2 * v.pA), 0);
  v.col = colsOf(v);
  v.ppm = v.ieoa > 0.85 ? 0 : v.ieoa > 0.65 ? 1 : 2;
  const sig = (v.col.vmax === 2 || v.col.mg === 2) && (v.col.dvi === 2 || v.col.eoa === 2);
  v.sten = sig ? 2 : Object.values(v.col).some((c) => c > 0) ? 1 : 0;
  v.grade = m.cause === 'ppm' ? PPM_GRADE[v.ppm] : STEN_GRADE[v.sten];
  v.angles = m.valve === 'mech' ? (m.cause === 'ppm' ? [OPEN, OPEN] : discAngles(v.eoa / V.ref, v.sten)) : null;
  return v;
}

// The columns of ASE 2024 Table 5 (normal, possible stenosis, suggests significant stenosis) at
// the decimals the page prints. The EOA's: the reference ± 1 SD, 1 SD smaller, 2 SDs smaller.
// The contour's name follows the AT/ET's column (the page's rule).
function colsOf(v) {
  const e1 = shown(v.ref - v.sd, 2), e2 = shown(v.ref - 2 * v.sd, 2);
  return {
    vmax: v.vmax < 3 ? 0 : v.vmax < 4 ? 1 : 2,
    mg: v.mg < 20 ? 0 : v.mg < 35 ? 1 : 2,
    dvi: v.dvi > 0.35 ? 0 : v.dvi >= 0.25 ? 1 : 2,
    eoa: v.eoa >= e1 ? 0 : v.eoa > e2 ? 1 : 2,
    at: v.at < 80 ? 0 : v.at <= 100 ? 1 : 2,
    atet: v.atet < 0.32 ? 0 : v.atet <= 0.37 ? 1 : 2,
  };
}
const STEN_GRADE = ['normal', 'possible stenosis', 'significant stenosis'];
const PPM_GRADE = ['no mismatch', 'moderate mismatch', 'severe mismatch'];
const CONTOUR = ['triangular, early peaking', 'triangular to intermediate', 'rounded, symmetric'];
const LEVELS = { normal: 0, 'possible stenosis': 2, 'significant stenosis': 3, 'no mismatch': 0, 'moderate mismatch': 2, 'severe mismatch': 3 };
const SHORT = { 'possible stenosis': 'possible', 'significant stenosis': 'significant', 'no mismatch': 'none', 'moderate mismatch': 'moderate', 'severe mismatch': 'severe' };

let lastKey = '', lastShown = null;
/** The values on screen, kept for the last state: the figure asks every frame. */
function shownOf(s) {
  const key = `${s[KEY]}|${valveOf(s)}|${causeOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(modelAt(s[KEY], valveOf(s), causeOf(s))); }
  return lastShown;
}
export const gradeOf = (x, valve = 'bio', cause = 'obst') => measure(modelAt(x, valve, cause)).grade;

let sheet = null, st = null;
const beat = new Beat(RR);
const BANDS_OF = {};
const bandKey = (s) => `${valveOf(s)}|${causeOf(s)}`;

// ---------------------------------------------------------------- the figure
// The parasternal long axis, zoomed on the aortic valve, and the short axis square to the aortic
// root at the valve, cut from the heart mesh: the heart the page shows, its own aortic valve left
// out of the cut and the prosthesis in its annulus (gl/prostheticmesh.js). The bioprosthesis's
// leaflets open to the printed EOA; the mechanical valve's discs open to the printed angles. The
// long axis carries the LVOT caliper, 0.4 cm below the sewing ring.
const redraw = () => { if (sheet) sheet.dirty = true; };
const HIDE = new Set(['AorticValve']);
const MESH = new MeshPanel('plax_av', { diseases: [], redraw });
const MESH_SAX = new MeshPanel('psax_avz', { diseases: [], redraw });

/** The prosthesis the values v show, for gl/prostheticmesh.js. */
const prosOf = (v) => ({ type: v.valve, orifice: v.eoa, thick: v.thick, angles: v.angles || [OPEN, OPEN] });
/**
 * How far the prosthesis is open (0 shut to 1 open) for the cycle's aortic drive: the native
 * cusps drift 15% toward closure late in ejection (cyclemodel.js); the leaflets and discs of a
 * prosthesis stay fully open until they close.
 */
const openOf = (drive) => Math.min(1, drive / 0.85);
/** The panel's options that put the prosthesis in: the valve left out, the items, their key. */
function withProsthesis(v) {
  const P = prosOf(v);
  return {
    hide: HIDE,
    extra: (ev, g, state) => {
      const F = annulusOf(ev, state.s);
      return F ? prosthesisItems(F, { ...P, open: openOf(state.drive.av) }, g) : [];
    },
    extraKey: `${P.type}|${P.orifice}|${P.thick.toFixed(3)}|${P.angles.join(',')}`,
  };
}

// The short axis, square to the root, moves along its normal to the height above the sewing ring
// that shows the prosthesis in mid-systole: the bioprosthesis's leaflets just below their free
// edges (SIZE.bio.areaH, where the orifice inside them has the printed EOA as its area), the
// mechanical valve's housing and discs (0.25 cm). Found once for each heart, from a frame of it:
// null until the panel has drawn one.
const SAX_H = { bio: SIZE.bio.areaH, mech: 0.25 };
const saxShift = {};
function saxShiftOf(ev, valve) {
  const key = `${ev.model.pheno.version}|${valve}`;
  if (saxShift[key] !== undefined) return saxShift[key];
  // the ring of the frame drawn last (its cusps' positions), carried to mid-systole with the av landmark
  const g = ev.g, now = ev.last && ev.last.state;
  if (!g || !now) return null;
  const F = annulusOf(ev, now.s);
  if (!F) return null;
  const s200 = cycleAt(200).s, av = ev.anat.point('av', 0, s200), avNow = ev.anat.point('av', 0, now.s);
  const n = F.n, N = [g.n.x, g.n.y, g.n.z], nn = n[0] * N[0] + n[1] * N[1] + n[2] * N[2];
  if (Math.abs(nn) < 0.3) return 0;
  const C = [F.C[0] + av.x - avNow.x, F.C[1] + av.y - avNow.y, F.C[2] + av.z - avNow.z];
  // the height above the ring at which the root's axis meets the plane, without the shift in use
  const h = ((g.O.x - C[0]) * N[0] + (g.O.y - C[1]) * N[1] + (g.O.z - C[2]) * N[2]) / nn;
  const h0 = h - (ev.shift || 0) / nn;
  saxShift[key] = shown((SAX_H[valve] - h0) * nn, 3);
  return saxShift[key];
}

/** A plane point (cm) of a world point given as [x, y, z]. */
const toPlane = (g, p) => { const x = p[0] - g.O.x, y = p[1] - g.O.y, z = p[2] - g.O.z; return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z]; };

/**
 * The LVOT caliper on the long axis: square to the root's axis, 0.4 cm below the sewing ring,
 * from the septum's side for the printed diameter. Returns [a, b] in plane cm, or null.
 */
function lvotCaliper(ev, s, d) {
  const g = ev.g, F = annulusOf(ev, s);
  if (!g || !F || !ev.last) return null;
  const C = F.C.map((x, i) => x - F.n[i] * 0.4);
  const q = toPlane(g, C);
  const ax = [F.n[0] * g.r.x + F.n[1] * g.r.y + F.n[2] * g.r.z, F.n[0] * g.d.x + F.n[1] * g.d.y + F.n[2] * g.d.z];
  const l = Math.hypot(ax[0], ax[1]) || 1;
  let side = [-ax[1] / l, ax[0] / l];
  // from the septum: the side nearer the probe
  if (side[1] > 0) side = [-side[0], -side[1]];
  const loops = [...ev.last.tissue, ...ev.last.valves.filter((V) => V.valve === 'MitralValve')];
  // the line runs from 3 cm past the septum's side toward the posterior wall; with no septum
  // within 3 cm, the caliper centres on the root's axis
  const back = [-side[0], -side[1]];
  const hits = ev.crossings(loops, [q[0] + side[0] * 3, q[1] + side[1] * 3], back, 6);
  const near = hits.filter((t) => t < 3);
  const t0 = near.length ? near[near.length - 1] : 3 - d / 2;
  const a = [q[0] + side[0] * (3 - t0), q[1] + side[1] * (3 - t0)];
  return [a, [a[0] + back[0] * d, a[1] + back[1] * d]];
}

function plax(ctx, box, v, tt) {
  const s = cycleAt(tt).s;
  const lines = [[`LVOT ${v.d.toFixed(1)} cm`, `LVOT ${v.d.toFixed(1)}`]];
  if (v.angles) lines.push([`Leaflets ${v.angles[0]}° · ${v.angles[1]}°`, `${v.angles[0]}° · ${v.angles[1]}°`]);
  MESH.draw(ctx, box, fit(box.w, `PLAX · ZOOM · ${LABEL}-MM ${v.valve === 'bio' ? 'BIOPROSTHESIS' : 'MECHANICAL VALVE'}`, 'PLAX · ZOOM'), {
    tms: tt, ...withProsthesis(v), lines,
    names: [['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      const L = lvotCaliper(ev, s, v.d);
      if (L) cal(c, F, L[0], L[1], '');
    },
  });
}

function psax(ctx, box, v, tt) {
  const ev = MESH_SAX.ev;
  const shift = ev ? saxShiftOf(ev, v.valve) : null;
  MESH_SAX.draw(ctx, box, fit(box.w, 'PSAX · PROSTHESIS, SQUARE TO THE ROOT', 'PSAX · VALVE'), {
    tms: tt, ...withProsthesis(v), shift: shift ?? 0,
    names: [['la', 'LA'], ['ra', 'RA'], ['rvot', 'RVOT']],
  });
  // the first frame of the heart gives the shift: draw again with it
  if (shift === null && MESH_SAX.ev && MESH_SAX.ev.last) redraw();
}

/**
 * CW through the prosthesis from the apex: the jet away from the probe, its peak and its
 * acceleration time marked, and the ejection time below.
 */
function cwPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · PROSTHETIC AORTIC VALVE · APICAL', 'CW · VALVE'));
  const bx = inner(P), base = 0.1;
  // the scale leaves 30 px under the peak for its tag and the line of text at the bottom
  const vs = Math.max(4, Math.ceil(v.vmax + 0.6), Math.ceil(v.vmax / Math.max(0.5, 1 - 30 / bx.h)));
  const gA = shape(v.qA, v.pA), T = v.et;
  const at = (u) => ((u * 2 * RR) % RR - EV.avo) / T;
  spectral(ctx, bx, {
    fn: (u) => -v.vmax * gA(at(u)), scale: vs, base, mode: 'cw', broad: 0.45,
    key: `procw|${v.vmax}|${v.qA.toFixed(4)}|${v.pA.toFixed(4)}|${T}|${vs}`, seed: 5,
  });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * (1 - base)) / vs, y0 = bx.y + bx.h * base, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  // the peak, in the first beat
  const xPk = X(EV.avo + v.at), yPk = y0 + v.vmax * k;
  caliper(ctx, xPk - 10, yPk, xPk + 10, yPk, { solid: true });
  const narrow = bx.w < 300;
  tagBox(ctx, xPk + 14, yPk, [narrow ? `${v.vmax.toFixed(1)}` : `${v.vmax.toFixed(1)} m/s`], { size: 10.5, bounds: bx });
  // the acceleration time under the baseline, from the onset to the peak; the ejection time below it
  const ya = y0 + 8, ye = y0 + 15;
  caliper(ctx, X(EV.avo), ya, X(EV.avo + v.at), ya, { solid: true, size: 3 });
  caliper(ctx, X(EV.avo), ye, X(EV.avo + v.et), ye, { size: 3 });
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(xPk, yPk);
  ctx.lineTo(xPk, ya);
  ctx.stroke();
  ctx.restore();
  note(ctx, bx, [`AT ${v.at} ms · ET ${v.et} ms · AT/ET ${v.atet.toFixed(2)} · VTI ${v.vtiA.toFixed(1)} cm · mean ${v.mg} mmHg`,
    `AT ${v.at} · AT/ET ${v.atet.toFixed(2)} · mean ${v.mg} mmHg`, `AT/ET ${v.atet.toFixed(2)} · ${v.mg} mmHg`], 'bottom');
  return bx;
}

/** PW in the LVOT from the apex, the sample just below the valve: its VTI gives the stroke volume and the DVI. */
function pwPanel(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · LVOT · APICAL', 'PW · LVOT'));
  const bx = inner(P), base = 0.12;
  const vs = Math.max(1.2, Math.ceil((v.vL + 0.3) * 5) / 5);
  const gL = shape(1, v.pL), T = v.et;
  const at = (u) => ((u * 2 * RR) % RR - EV.avo) / T;
  spectral(ctx, bx, { fn: (u) => -v.vL * gL(at(u)), scale: vs, base, mode: 'pw', broad: 0.14, key: `propw|${v.vL}|${v.pL.toFixed(4)}|${T}|${vs}`, seed: 6 });
  vscale(ctx, bx, vs, base, 0.5);
  note(ctx, bx, [`VTI ${v.vtiL.toFixed(1)} cm · peak ${v.vL.toFixed(2)} m/s · DVI ${v.dvi.toFixed(2)}`, `VTI ${v.vtiL.toFixed(1)} cm · DVI ${v.dvi.toFixed(2)}`, `DVI ${v.dvi.toFixed(2)}`], 'bottom');
  return bx;
}

function meterItems(v) {
  const e1 = shown(v.ref - v.sd, 2), e2 = shown(v.ref - 2 * v.sd, 2);
  const items = [
    { k: 'Peak velocity', v: v.vmax, u: 'm/s', d: 1, lo: 1, hi: 6, cuts: [[3, '3'], [4, '4']], bad: v.col.vmax > 0 },
    { k: 'Mean gradient', v: v.mg, u: 'mmHg', lo: 0, hi: 80, cuts: [[20, '20'], [35, '35']], bad: v.col.mg > 0 },
    { k: 'DVI', v: v.dvi, u: '', d: 2, lo: 0.1, hi: 0.6, norm: [0.36, 0.6], cuts: [[0.25, '0.25'], [0.35, '0.35']], bad: v.col.dvi > 0 },
    { k: 'EOA', v: v.eoa, u: 'cm²', d: 2, lo: 0.4, hi: 2.2, norm: [e1, v.ref + v.sd], cuts: [[e2, e2.toFixed(1)], [e1, e1.toFixed(1)]], bad: v.col.eoa > 0 },
    { k: 'Acceleration time', v: v.at, u: 'ms', lo: 40, hi: 160, cuts: [[80, '80'], [100, '100']], bad: v.col.at > 0 },
    { k: 'AT/ET', v: v.atet, u: '', d: 2, lo: 0.15, hi: 0.55, cuts: [[0.32, '0.32'], [0.37, '0.37']], bad: v.col.atet > 0 },
  ];
  if (v.cause === 'ppm') items.push({ k: 'Indexed EOA', v: v.ieoa, u: 'cm²/m²', d: 2, lo: 0.4, hi: 1.1, cuts: [[0.65, '0.65'], [0.85, '0.85']], bad: v.ppm > 0 });
  return items;
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shownOf(st);
  const tt = beat.at(true, 200);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    const [a1, a2] = rows(a, [1.25, 1], 8);
    plax(ctx, a1, v, tt);
    psax(ctx, a2, v, tt);
    const [b1, b2] = rows(b, [1, 1], 8);
    for (const bx of [cwPanel(ctx, b1, v), pwPanel(ctx, b2, v)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.0, colL.h * 0.6);
  plax(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [r1, r2, r3] = rows(colR, [1, 0.8, 1.2], 10);
  for (const bx of [cwPanel(ctx, r1, v), pwPanel(ctx, r2, v)]) cursor(ctx, bx, beat.sweep);
  psax(ctx, r3, v, tt);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LEAD = {
  obst: (v) => ({ normal: `Normal ${v.valve === 'bio' ? 'bioprosthesis' : 'mechanical valve'}`, 'possible stenosis': `Possible stenosis of ${VALVES[v.valve].of}`, 'significant stenosis': `Significant stenosis of ${VALVES[v.valve].of}` }[v.grade]),
  ppm: (v) => ({ 'no mismatch': 'No prosthesis–patient mismatch', 'moderate mismatch': 'Moderate prosthesis–patient mismatch', 'severe mismatch': 'Severe prosthesis–patient mismatch' }[v.grade]),
};
/** The leaflets as the image shows them: the grade's words (the bioprosthesis), the angles (the mechanical valve). */
function leafletsOf(v) {
  if (v.valve === 'mech') return `${v.angles[0]}° / ${v.angles[1]}°`;
  if (v.cause === 'ppm') return 'thin, mobile';
  return ['thin, mobile', 'mildly thickened', 'thickened, restricted'][v.sten];
}

function liveOf(v, cite) {
  const Z = cite('zoghbi2024'), O = cite('otto2020');
  const V = VALVES[v.valve];
  const ref = `${V.ref.toFixed(1)} ± ${V.sd.toFixed(1)} cm²`;
  const eoaCol = ['within 1 SD of', 'more than 1 SD below', 'at least 2 SDs below'][v.col.eoa];
  const lead = LEAD[v.cause](v);
  const s0 = ` The peak velocity is ${fmt(v.vmax, 1)} m/s, the mean gradient ${v.mg} mmHg and the DVI ${fmt(v.dvi, 2)}. The EOA of ${fmt(v.eoa, 2)} cm² is ${eoaCol} the reference of ${ref} for this valve${Z}.`;
  const s1 = ` The jet peaks ${v.at} ms after the onset of flow, at an AT/ET of ${fmt(v.atet, 2)}: a ${CONTOUR[v.col.atet]} contour${Z}.`;
  if (v.cause === 'ppm') {
    const size = [
      'above the 0.85 cm²/m² that defines mismatch at a BMI below 30 kg/m²',
      'at a BMI below 30 kg/m², 0.66–0.85 cm²/m² is moderate mismatch',
      'at a BMI below 30 kg/m², 0.65 cm²/m² or less is severe mismatch',
    ][v.ppm];
    const sizeLine = ` The ${LABEL}-mm ${V.name} opens normally, in a patient with a body surface area of ${fmt(v.bsa, 2)} m². The indexed EOA is ${fmt(v.ieoa, 2)} cm²/m²${v.ppm ? ';' : ','} ${size}${Z}.`;
    const flow = v.sv > 90 ? ` The stroke volume is ${v.sv} mL, above the 50–90 mL for which the velocity cut-offs hold${Z}.` : '';
    const fig = v.vmax > 3
      ? ` For a velocity above 3 m/s, the ASE algorithm reads an early peak with a DVI of 0.30 or more as a normal prosthesis, and an indexed EOA below 0.85 cm²/m² as mismatch${Z}.`
      : '';
    return `<b>${lead}.</b>${sizeLine}${s0}${s1}${flow}${fig}`;
  }
  let s2;
  if (v.valve === 'bio') {
    s2 = [
      ' The leaflets are thin and open fully.',
      ` The leaflets are mildly thickened and open less. Mild thickening is often the first sign of primary failure of a biological valve, and it calls for a shorter interval between studies${Z}.`,
      ` The leaflets are thickened and open less. A thin layer of thrombus on the cusps can cause this obstruction and can resolve with oral anticoagulation; 3D TEE or 4D CT can detect it${O}.`,
    ][v.sten];
  } else {
    s2 = v.angles.every((a) => a >= 73)
      ? ` Both leaflets open to ${v.angles[1]}°; on CT, a bileaflet valve normally opens to 73–90°${Z}.`
      : ` One leaflet opens to ${Math.min(...v.angles)}° and the other to ${Math.max(...v.angles)}°; on CT, a bileaflet valve normally opens to 73–90°${Z}. Strong reflections from the valve obscure the leaflets' motion on TTE in most patients, and fluoroscopy or cine-CT is recommended to assess it${O}.`;
  }
  const s3 = v.sten === 2
    ? ` A flow-dependent measure (the velocity or the mean gradient) and a flow-independent one (the DVI or the EOA) both suggest significant stenosis${Z}.`
    : v.sten === 1 ? ` At least one measure is outside its normal range. Significant stenosis needs a flow-dependent and a flow-independent measure that both suggest it${Z}.` : '';
  return `<b>${lead}.</b>${s0}${s1}${s2}${s3}`;
}

/** ASE 2024 Table 5 for a surgical valve, the current column of each row marked; the EOA row with this valve's reference. */
function stenRows(v) {
  const e1 = shown(v.ref - v.sd, 2), e2 = shown(v.ref - 2 * v.sd, 2), c = v.col;
  return [
    ['Jet velocity contour', ['Triangular, early peaking', 'Triangular to intermediate', 'Rounded, symmetric'], c.atet],
    ['Acceleration time, ms', ['<80', '80–100', '>100'], c.at],
    ['AT/ET', ['<0.32', '0.32–0.37', '>0.37'], c.atet],
    ['Peak velocity, m/s', ['<3', '3–4', '≥4'], c.vmax],
    ['Mean gradient, mmHg', ['<20', '20–34', '≥35'], c.mg],
    ['DVI', ['>0.35', '0.25–0.35', '<0.25'], c.dvi],
    [`EOA, cm² (reference ${v.ref.toFixed(1)} ± ${v.sd.toFixed(1)})`, [`Reference ± 1 SD: ≥${e1.toFixed(2)}`, `1 SD smaller: ${(e2 + 0.01).toFixed(2)}–${(e1 - 0.01).toFixed(2)}`, `2 SDs smaller: ≤${e2.toFixed(2)}`], c.eoa],
  ];
}
/** ASE 2024 Table 7, the aortic rows; the page's patient has a BMI below 30 kg/m². */
function ppmRows(v) {
  const cur = v.cause === 'ppm' ? v.ppm : -1;
  return [
    ['Indexed EOA, BMI <30 kg/m²', ['>0.85', '0.66–0.85', '≤0.65'], cur],
    ['Indexed EOA, BMI ≥30 kg/m²', ['>0.70', '0.56–0.70', '≤0.55'], -1],
  ];
}

const prostheticPage = {
  key: 'prosthetic',
  part: 'valves',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Prosthetic valves',
  nav: 'Prosthetic',
  dwell: 31,
  defaults: { proS: 0.5, proValve: 'bio', proCause: 'obst' },
  format: {
    proS: (x, s) => (s ? shownOf({ ...s, proS: x }).grade : gradeOf(x)),
  },
  watch: ['proS', 'proValve', 'proCause', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    for (const valve of ['bio', 'mech']) for (const cause of ['obst', 'ppm']) BANDS_OF[`${valve}|${cause}`] = lazyBands((x) => gradeOf(x, valve, cause));
    const host = document.getElementById('pro-grades');
    let painted = '';
    const paint = (s) => {
      const k = bandKey(s);
      if (k === painted) return;
      painted = k;
      paintBands(host, BANDS_OF[k], LEVELS, SHORT);
    };
    paint(state);
    subscribe?.((s, ch) => { if (VALVE in ch || CAUSE in ch) paint(s); });
  },
  enter() { MESH.start(); MESH_SAX.start(); },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter)
  warm() { MESH.start(); MESH_SAX.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS_OF[bandKey(s)] || []);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: the bioprosthesis from normal to significant stenosis, the mechanical valve
  // likewise, then mismatch with the bioprosthesis
  tourEnter(set) { set({ proS: 0, proValve: 'bio', proCause: 'obst' }); },
  tourTick(tt, set) {
    if (tt < 12) set({ proValve: 'bio', proCause: 'obst', proS: Math.round(clamp((tt - 1) / 10, 0, 1) * 200) / 200 });
    else if (tt < 23) set({ proValve: 'mech', proCause: 'obst', proS: Math.round(clamp((tt - 12.5) / 10, 0, 1) * 200) / 200 });
    else set({ proValve: 'bio', proCause: 'ppm', proS: Math.round(clamp((tt - 23.5) / 7, 0, 1) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    if (causeOf(s) === 'ppm') return 23.5 + s.proS * 7;
    return valveOf(s) === 'mech' ? 12.5 + s.proS * 10 : 1 + s.proS * 10;
  },
  text(s, { cite }) {
    const v = shownOf(s);
    const sten = v.cause === 'obst';
    return {
      readouts: [
        { k: 'Peak velocity', v: fmt(v.vmax, 1), u: 'm/s', flag: v.col.vmax > 0 },
        { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: v.col.mg > 0 },
        { k: 'DVI', v: fmt(v.dvi, 2), flag: v.col.dvi > 0 },
        { k: 'EOA', v: fmt(v.eoa, 2), u: 'cm²', flag: v.col.eoa > 0 },
        sten ? { k: 'Acceleration time', v: fmt(v.at), u: 'ms', flag: v.col.at > 0 } : { k: 'Indexed EOA', v: fmt(v.ieoa, 2), u: 'cm²/m²', flag: v.ppm > 0 },
        { k: 'AT/ET', v: fmt(v.atet, 2), flag: v.col.atet > 0 },
        sten ? { k: 'Leaflets', v: leafletsOf(v), text: true, flag: v.valve === 'mech' ? v.angles.some((a) => a < 73) : v.sten > 0 } : { k: 'Body surface area', v: fmt(v.bsa, 2), u: 'm²' },
        { k: 'Result', v: v.grade, text: true, flag: sten ? v.sten > 0 : v.ppm > 0 },
      ],
      live: liveOf(v, cite),
      extra: (art) => {
        gradeTable(art.querySelector('#pro-table'), stenRows(v), `Prosthetic aortic stenosis: ${LABEL}-mm ${VALVES[v.valve].name}`, ['Normal', 'Possible stenosis', 'Suggests significant stenosis']);
        gradeTable(art.querySelector('#pro-table2'), ppmRows(v), 'Prosthesis–patient mismatch, aortic', ['None', 'Moderate', 'Severe']);
      },
    };
  },
};
export default prostheticPage;
export { modelAt, measure, VALVES, LVOT_D, BSA0, SVI, discAngles, openOf, SAX_H };
