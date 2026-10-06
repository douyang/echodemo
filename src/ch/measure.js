// Automated measurements: EchoNet-Measurements (Sahashi 2025; the public code, github.com/echonet/
// measurements). One DeepLabv3 segmentation model for each of 18 measurements outputs a heat map
// for each point it looks for: two for a B-mode caliper, one for a Doppler peak, two for the E
// and A peaks and two for TAPSE. After a sigmoid, each point is the weighted center of its map:
// the mean of the rows and of the columns, weighted by the map (utils.py
// segmentation_to_coordinates), so a map with two peaks puts its point between them. A caliper is
// √((Δx·ΔX)² + (Δy·ΔY)²) cm, with the pixel size ΔX, ΔY from the DICOM region tags (0018,602C)
// and (0018,602E); a velocity is (the point's row − the baseline row) × ΔY, the baseline from
// the tag (0018,6022). A video without the tags (an AVI) gives the points and no number. A B-mode
// model runs on every frame, and the peaks and troughs of the LV diameter over the clip mark
// end-diastole and end-systole (utils.py get_systole_diastole: a low-pass filter, then scipy
// find_peaks 25 frames apart, the first and the last extreme dropped).
//
// The figure is an illustration. The heat maps sit on the site's own caliper points, cut from the
// heart mesh of the heart shown (the LV calipers of meshjet.js plaxCalipers; the other calipers on
// the same planes, below), and on the peaks of the other chapters' Doppler traces. EchoNet-
// Measurements did not run on these images. The figure keeps each weighted center unrounded, so
// its numbers are the site's; the public scripts round the points to whole pixels (and the
// one-point Doppler script takes the brightest pixel), a difference of about a pixel.
import { Sheet, clamp, MONO, SANS } from '../sketch.js';
import { panel, spectral, vscale, SC, tagBox } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { Beat, rows, cols, inner, note, fit } from '../sev.js';
import { reducedMotion } from '../state.js';
import { MeshPanel } from '../meshpanel.js';
import { scanner } from '../scanner.js';
import { onPheno } from '../model3d.js';
import { VIEWS, VESSELS } from '../views.js';
import { ABD } from '../abdomen.js';
import { plaxCalipers, onPlane, hingesOf, blood, cavity, middle, sub, add, mul, dot, len, unit, perp } from '../meshjet.js';
import { presetsFor } from '../pheno.js';
import { rvTapseOwn } from '../meshcal.js';
import { numOf } from '../order.js';
import { trCwAt, trCwScale, TR_BASE, TR_PEAK } from './rv.js';
import { valuesAt as asValues, cwEnvelopes } from './as.js';
import mrPage, { valuesAt as mrValues, mrCw } from './mr.js';
import { valuesAt as fillShown, inflow, tissue } from './fill.js';
import pressurePage from './pressure.js';

// ---------------------------------------------------------------- the model's numbers
// The heat maps: one hue over the scanner's grey (both themes draw the scanner alike); a peak is
// a Gaussian 1.5 mm wide (σ; 3.5 mm at half its height); a two-peaked map's second peak lies
// 0.75 cm from the first along the caliper line, as high as the first.
const HEAT = [255, 92, 196];
const heat = (a) => `rgba(${HEAT[0]},${HEAT[1]},${HEAT[2]},${a})`;
const SIGMA = 0.15, OFF = 0.75;
// The clip: 26 frames a beat (30 a second at 70 a minute), three beats, from mid-diastole (the
// 18th frame of the beat, 593 ms after the R wave), so that each end-diastole and end-systole
// lies inside it and find_peaks can see it.
const FPB = 26, NF = 3 * FPB, F0 = 18, FRAME = RR / FPB;
// Each view a little shallower than the site's (MeshPanel deeper), so a wall's caliper is not too
// small. The B-mode frame the model reads: 640 × 480 px, the probe at the middle of the top row;
// each view's pixel size (cm) fits the depth shown into the 480 rows.
const DEEPER = { plax: -3, plax_asc: -3, a4c_rv: -2, psax_pa: -2, sc_ivc: -3 };
const pxOf = (view) => Math.round(((VIEWS[view].depth + (DEEPER[view] || 0)) / 460) * 1000) / 1000;
const pxAt = (p, s) => [320 + p[0] / s, p[1] / s];
// The Doppler region the model reads: 1024 × 426 px, the lower part of a 768 × 1024 frame
// (README: the region starts near row 342).
const DW = 1024, DH = 426;

// ---------------------------------------------------------------- the measurements
// The nine B-mode measurements: the name of the public code's weights (model), the view, the
// frame reported (end-diastole, end-systole, or the largest of the clip), and the second peak of
// the two-peaked map: on end 0 or 1 of the caliper, outward (away from the other end) or inward,
// on a structure that the model could take for the end it looks for.
const B = [
  { key: 'ivs', name: 'Septum', short: 'IVS', model: 'ivs', view: 'plax', at: 'ed', two: { end: 0, out: true, on: 'RV trabeculation', site: 'septum' } },
  { key: 'lvid', name: 'LV internal diameter', short: 'LVID', model: 'lvid', view: 'plax', at: 'ed', two: { end: 1, out: false, on: 'mitral chordae', site: 'posterior wall' } },
  { key: 'lvpw', name: 'Posterior wall', short: 'LVPW', model: 'lvpw', view: 'plax', at: 'ed', two: { end: 0, out: true, on: 'mitral chordae', site: 'posterior wall' } },
  { key: 'la', name: 'LA diameter', short: 'LA', model: 'la', view: 'plax', at: 'es', two: { end: 0, out: true, on: 'aortic wall', site: 'LA wall' } },
  { key: 'rvb', name: 'RV basal diameter', short: 'RV base', model: 'rv_base', view: 'a4c_rv', at: 'ed', two: { end: 1, out: false, on: 'septal leaflet', site: 'septum' } },
  { key: 'root', name: 'Aortic root', short: 'Ao root', model: 'aortic_root', view: 'plax', at: 'ed', two: { end: 1, out: false, on: 'aortic cusp', site: 'posterior wall' } },
  { key: 'asc', name: 'Ascending aorta', short: 'Asc Ao', model: 'aorta', view: 'plax_asc', at: 'ed', two: { end: 1, out: true, on: 'right PA', site: 'posterior wall' } },
  { key: 'pa', name: 'Pulmonary artery', short: 'PA', model: 'pa', view: 'psax_pa', at: 'ed', two: { end: 0, out: true, on: 'aortic wall', site: 'PA wall' } },
  { key: 'ivc', name: 'IVC', short: 'IVC', model: 'ivc', view: 'sc_ivc', at: 'max', two: { end: 0, out: true, on: 'hepatic vein', site: 'IVC wall' } },
];
// The eight Doppler and M-mode models (E and E/A come from one model with two maps).
const D = [
  { key: 'tr', name: 'TR peak velocity', model: 'trvmax' },
  { key: 'av', name: 'Aortic valve peak velocity', model: 'avvmax' },
  { key: 'mr', name: 'MR peak velocity', model: 'mrvmax' },
  { key: 'lvot', name: 'LVOT peak velocity', model: 'lvotvmax' },
  { key: 'sep', name: 'Septal e′', model: 'medevel' },
  { key: 'lat', name: 'Lateral e′', model: 'latevel' },
  { key: 'ea', name: 'Mitral E and E/A', model: 'mvpeak_2c' },
  { key: 'tapse', name: 'TAPSE', model: 'tapse_2c' },
];
const VIEW_TITLE = {
  plax: ['PARASTERNAL LONG AXIS', 'PLAX'],
  plax_asc: ['PARASTERNAL LONG AXIS · ASCENDING AORTA', 'PLAX · ASC AO', 'PLAX AO'],
  a4c_rv: ['APICAL FOUR-CHAMBER, RV FOCUSED', 'A4C, RV FOCUSED', 'A4C RV'],
  psax_pa: ['PARASTERNAL SHORT AXIS · PULMONARY ARTERY', 'PSAX · PA'],
  sc_ivc: ['SUBCOSTAL · IVC', 'SC · IVC'],
};

// The value each B-mode model reports on each heart (cm): the site's calipers on the frame that
// the clip reports (end-diastole, end-systole, or the largest), measured on the mesh by the
// calipers below. The text reads this table, so that it never waits for the mesh; the figure
// measures every frame itself, and says so in the console if a value leaves the table.
const SITE = {
  normal: { ivs: 0.882, lvid: 4.681, lvpw: 0.898, la: 3.381, rvb: 3.075, root: 3.188, asc: 2.711, pa: 1.762, ivc: 2.018 },
  amyloid: { ivs: 1.638, lvid: 3.991, lvpw: 1.560, la: 5.045, rvb: 3.041, root: 3.187, asc: 2.711, pa: 1.762, ivc: 1.992 },
  icm: { ivs: 0.660, lvid: 6.264, lvpw: 0.899, la: 3.826, rvb: 3.043, root: 3.372, asc: 2.732, pa: 1.875, ivc: 2.009 },
  barlow: { ivs: 0.883, lvid: 5.680, lvpw: 0.898, la: 4.944, rvb: 3.062, root: 3.355, asc: 2.755, pa: 2.341, ivc: 2.007 },
  bav: { ivs: 1.181, lvid: 4.301, lvpw: 1.264, la: 3.718, rvb: 2.885, root: 3.206, asc: 3.516, pa: 1.719, ivc: 2.018 },
};
/** The site's value and the two-peaked map's (cm) for B-mode measurement m on heart: the second peak moves its end OFF / 2 along the caliper. */
function siteValue(m, heart) {
  const cm = (SITE[heart] || SITE.normal)[m.key];
  return { cm, cm2: cm + (m.two.out ? OFF / 2 : -OFF / 2) };
}

const heartOf = (s) => s.pheno || 'normal';
const tabOf = (s) => (s.emTab === 'doppler' ? 'doppler' : 'bmode');
const bOf = (s) => B[clamp(Math.round(s.emB), 0, B.length - 1)];
const dOf = (s) => D[clamp(Math.round(s.emD), 0, D.length - 1)];

// ---------------------------------------------------------------- the calipers on the plane (cm)
// The walls of a section lie between its closed loops (echo.js intervals): a line crosses a wall
// at each loop it crosses. A vessel's caliper runs from the inner edge of one wall to the inner
// edge of the other, square to its axis, as the LV calipers run from wall to wall.
const loopsOf = (ev) => ev.last.tissue.filter((L) => L.closed && L.pts.length > 2);
/** Where the line through C along unit u crosses the loops: distances from C (cm), in order. */
function crossings(ev, C, u, loops, reach = 9) {
  return ev.crossings(loops, [C[0] - reach * u[0], C[1] - reach * u[1]], u, 2 * reach).map((t) => t - reach);
}
/** The lumen through C across u: from the nearest crossing on one side to the nearest on the other. */
function lumen(ev, C, u, loops) {
  let a = -Infinity, b = Infinity;
  for (const t of crossings(ev, C, u, loops)) { if (t < 0 && t > a) a = t; if (t > 0 && t < b) b = t; }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a: add(C, mul(u, a)), b: add(C, mul(u, b)), w: b - a, mid: add(C, mul(u, (a + b) / 2)) };
}
/**
 * Up a vessel from P, first along u: every step cm the lumen square to the vessel's axis, centred
 * again on the lumen's middle, the axis turning toward the line of the middles. [{ d, a, b, w, mid, u }].
 */
function vessel(ev, P, u, d1, loops, step = 0.1) {
  const out = [];
  let C = P, prev = null;
  u = unit(u);
  for (let d = 0; d <= d1 + 1e-9; d += step) {
    const L = lumen(ev, d ? add(C, mul(u, step)) : C, perp(u), loops);
    if (!L) break;
    if (prev) u = unit(add(mul(u, 0.7), mul(unit(sub(L.mid, prev)), 0.3)));
    prev = C = L.mid;
    out.push({ d, ...L, u });
  }
  return out;
}
const widest = (list) => list.reduce((m, q) => (!m || q.w > m.w ? q : m), null);
/** A caliper's two ends with end 0 the nearer the probe (the plane's depth runs down the image). */
const nearFirst = (a, b) => (a[1] <= b[1] ? [a, b] : [b, a]);
/** The aortic root's axis on the plane (the heart model's, toward the ascending aorta). */
const rootAxis = (ev) => { const n = ev.anat.aorticRoot, g = ev.g; return unit([g.r.dot(n), g.d.dot(n)]); };
/** A point of the heart model (world cm, views.js VESSELS) on the plane. */
const planeOf = (ev, p) => {
  const g = ev.g, x = p[0] - g.O.x, y = p[1] - g.O.y, z = p[2] - g.O.z;
  return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z];
};
function inside(P, q) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/**
 * A point to cast a cavity's rays from (meshjet.js cavity): p itself when it lies in blood, 3 mm
 * or more from every wall, else the deepest blood near it (meshjet.js blood, which costs more).
 */
function seedIn(ev, p, loops) {
  if (loops.reduce((k, L) => (inside(L.pts, p) ? k + 1 : k), 0) % 2 === 0) {
    let d = Infinity;
    for (const L of loops) {
      const P = L.pts;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const e = sub(P[i], P[j]), l2 = dot(e, e) || 1e-12, t = clamp(dot(sub(p, P[j]), e) / l2, 0, 1);
        d = Math.min(d, len(sub(add(P[j], mul(e, t)), p)));
      }
    }
    if (d >= 0.3) return p;
  }
  return blood(ev, p);
}
/**
 * Each view's calipers at systolic weight s, on the EchoView ev after its frame(): { key: [end 0,
 * end 1] } in plane cm.
 */
const CALIPERS = {
  /**
   * The parasternal long axis. The septum, the LV and the posterior wall: meshjet.js plaxCalipers,
   * the site's own. The aortic root: its widest lumen 0.3 to 2 cm up the root from the valve's
   * centre (the sinuses), square to the root's axis. The LA: along the scan line through the
   * middle of that lumen, the LA's lumen from its anterior wall to its posterior wall. (In this
   * model the root rises 49° across the image and the LA lies under the annulus, so a line square
   * to the root at the sinuses passes beside the LA; the scan line is the M-mode's line.)
   */
  plax(ev, s) {
    const out = {}, K = plaxCalipers(ev, s);
    if (K) { out.ivs = K.ivs; out.lvid = K.lv; out.lvpw = K.pw; }
    const loops = loopsOf(ev), an = ev.anchors(s);
    const root = widest(vessel(ev, onPlane(ev, an.av), rootAxis(ev), 2.0, loops).filter((q) => q.d >= 0.3));
    if (!root) return out;
    out.root = nearFirst(root.a, root.b);
    const C = root.mid, dir = unit(C), H = hingesOf(ev, 'MitralValve');
    const LA = H ? cavity(ev, seedIn(ev, onPlane(ev, an.la), loops), [H], 9, 72) : [];
    if (LA.length < 12) return out;
    const h = crossings(ev, C, dir, loops, 13).filter((t) => t > 0);
    for (let i = 0; i + 1 < h.length; i++) {
      if (h[i + 1] - h[i] > 1 && inside(LA, add(C, mul(dir, (h[i] + h[i + 1]) / 2)))) {
        out.la = [add(C, mul(dir, h[i])), add(C, mul(dir, h[i + 1]))];
        break;
      }
    }
    return out;
  },
  /**
   * The ascending aorta, one interspace higher: up the root from the valve to the sinotubular
   * junction (the narrowest lumen after the sinuses) and on to 4.5 cm, its widest lumen past the
   * junction, square to its axis (as chapter 14 measures it, 2 to 4.5 cm above the valve).
   */
  plax_asc(ev, s) {
    const st = vessel(ev, onPlane(ev, ev.anchors(s).av), rootAxis(ev), 4.5, loopsOf(ev));
    const sinus = widest(st.filter((q) => q.d >= 0.3 && q.d <= 2));
    if (!sinus) return {};
    const stj = st.filter((q) => q.d > sinus.d && q.d <= 3).reduce((m, q) => (!m || q.w < m.w ? q : m), null);
    const asc = stj && widest(st.filter((q) => q.d >= Math.max(2, stj.d)));
    return asc ? { asc: nearFirst(asc.a, asc.b) } : {};
  },
  /**
   * The RV basal diameter at end-diastole (meshcal.js rvGrow): the widest the RV is in its basal
   * third, parallel to the tricuspid annulus, from the free wall to the septum (the walls, not the
   * leaflets, bound it, as the LV calipers). The third of the RV's length from the annulus's middle
   * to the apex. End 0 on the free wall, end 1 on the septum.
   */
  a4c_rv(ev, s) {
    const H = hingesOf(ev, 'TricuspidValve');
    if (!H) return {};
    const an = ev.anchors(s), M = middle(H), loops = loopsOf(ev);
    let a = unit(sub(H[1], H[0])), n = perp(a);
    if (dot(sub(onPlane(ev, an.rv), M), n) < 0) n = mul(n, -1);
    // the septum lies toward the LV
    if (dot(sub(onPlane(ev, an.lv), M), a) < 0) a = mul(a, -1);
    const L = crossings(ev, M, n, loops, 12).find((t) => t > 0.5);
    if (!L) return {};
    let best = null;
    for (let k = 0; k <= 40; k++) {
      const W = lumen(ev, add(M, mul(n, (k / 40) * (L / 3))), a, loops);
      if (W && (!best || W.w > best.w)) best = W;
    }
    return best ? { rvb: [best.a, best.b] } : {};
  },
  /**
   * The main PA midway between the pulmonic valve and the bifurcation (views.js VESSELS.paBif),
   * square to the line between them, centred on the lumen; end 0 toward the aorta.
   */
  psax_pa(ev, s) {
    const an = ev.anchors(s), pv = onPlane(ev, an.pv), bif = planeOf(ev, VESSELS.paBif), loops = loopsOf(ev);
    const across = perp(unit(sub(bif, pv)));
    let L = lumen(ev, mul(add(pv, bif), 0.5), across, loops);
    if (L) L = lumen(ev, L.mid, across, loops) || L;
    if (!L) return {};
    const ao = onPlane(ev, an.ao);
    return { pa: len(sub(L.a, ao)) <= len(sub(L.b, ao)) ? [L.a, L.b] : [L.b, L.a] };
  },
  /**
   * The IVC (abdomen.js, a tube through the liver to the heart's own stub) 1.8 cm from its junction
   * with the right heart, square to its axis, as chapter 07 measures it (ivc2d.js); end 0 anterior.
   */
  sc_ivc(ev) {
    const P = ABD.ivc.pts.map((p) => planeOf(ev, p)), J = P[0], u = unit(sub(P[1], P[0]));
    const loops = ev.abd.ivc.section(ev.g).filter((L) => L.closed && L.pts.length > 2);
    const L = lumen(ev, add(J, mul(u, 1.8)), perp(u), loops);
    return L ? { ivc: nearFirst(L.a, L.b) } : {};
  },
};

// ---------------------------------------------------------------- every frame of the clip
// A view that cuts the mesh without drawing its image: its sections are all that the calipers
// need. One per view; each keeps the calipers of the 26 frames of a beat for the heart it last
// cut (the clip repeats the beat), so a measurement changes without cutting again. The views cut
// ahead of need, a few frames at a time (warmAhead), and the figure cuts what is left when it
// needs a view first.
let SCAN = null, entered = false;
const samplers = new Map();
/** The view's sampler, its frames cleared when the heart shown changes. */
function samplerOf(view) {
  let S = samplers.get(view);
  if (!S) {
    const ev = SCAN.make(64, 48, view, { fill: true, draw: () => {} });
    ev.setView(view, { animate: false });
    S = { ev, key: '', frames: [] };
    samplers.set(view, S);
  }
  const P = SCAN.model.pheno, key = `${P.key}|${P.version}`;
  if (S.key !== key) { S.key = key; S.frames = []; }
  return S;
}
/** Cut the view's next frame of the beat and measure it: false when the beat is complete. */
function sampleNext(view) {
  const S = samplerOf(view);
  if (S.frames.length >= FPB) return false;
  const c = cycleAt(S.frames.length * FRAME);
  S.ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  S.frames.push(CALIPERS[view](S.ev, c.s));
  return true;
}
/** The calipers of the 26 frames of the view's beat on the heart shown (cut now if need be), or null before the mesh loads. */
function samplesOf(view) {
  if (!SCAN) return null;
  while (sampleNext(view));
  return samplerOf(view).frames;
}
/** Cut every view's beat ahead of need, 8 ms at a time: the parasternal long axis first (its LV diameter gives the phases), then the view shown. */
let warming = 0;
function warmAhead() {
  if (!SCAN || warming || !entered) return;
  const step = () => {
    const t0 = performance.now();
    for (const v of ['plax', bOf(st).view, ...Object.keys(CALIPERS)]) {
      while (performance.now() - t0 < 8 && sampleNext(v));
      if (performance.now() - t0 >= 8) { warming = setTimeout(step, 30); return; }
    }
    warming = 0;
  };
  warming = setTimeout(step, 30);
}
/** The beat's frame (0 to 25) that clip frame f shows. */
const phaseOf = (f) => (((f + F0) % FPB) + FPB) % FPB;

/** utils.py apply_lpf: the signal's Fourier transform with every frequency above cutoff removed. */
function lowPass(x, cutoff) {
  const n = x.length, re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) { const a = (-2 * Math.PI * k * j) / n; re[k] += x[j] * Math.cos(a); im[k] += x[j] * Math.sin(a); }
  for (let k = cutoff + 1; k < n - cutoff; k++) { re[k] = 0; im[k] = 0; }
  return Array.from({ length: n }, (_, j) => {
    let s = 0;
    for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k * j) / n; s += re[k] * Math.cos(a) - im[k] * Math.sin(a); }
    return s / n;
  });
}
/**
 * scipy.signal.find_peaks(x, distance): the local maxima (the middle of a flat top), then, from
 * the highest down, each peak closer than distance to a kept one dropped.
 */
function findPeaks(x, distance) {
  const pk = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (!(x[i - 1] < x[i])) continue;
    let j = i + 1;
    while (j < x.length - 1 && x[j] === x[i]) j++;
    if (x[j] < x[i]) { pk.push((i + j - 1) >> 1); i = j - 1; }
  }
  const keep = pk.map(() => true);
  for (const i of pk.map((_, k) => k).sort((a, b) => x[pk[b]] - x[pk[a]])) {
    if (!keep[i]) continue;
    for (let j = i - 1; j >= 0 && pk[i] - pk[j] < distance; j--) keep[j] = false;
    for (let j = i + 1; j < pk.length && pk[j] - pk[i] < distance; j++) keep[j] = false;
  }
  return pk.filter((_, k) => keep[k]);
}
/**
 * utils.py get_systole_diastole on the LV diameter of the clip, after the low-pass filter of
 * process_video_with_diameter (frequencies up to 140 a minute at 30 frames a second): end-diastole
 * at its peaks, end-systole at its troughs, 25 frames apart, the first and the last extreme dropped.
 */
function phasesOf(lvid) {
  const sm = lowPass(lvid, Math.ceil((140 / 60 / 30) * lvid.length));
  let ed = findPeaks(sm, 25), es = findPeaks(sm.map((v) => -v), 25);
  if (ed.length && es.length) {
    const all = [...ed, ...es], lo = Math.min(...all), hi = Math.max(...all);
    ed = ed.filter((i) => i !== lo && i !== hi);
    es = es.filter((i) => i !== lo && i !== hi);
  }
  return { ed, es };
}

/** The ends of the two-peaked map's end: the second peak, OFF cm from it along the caliper. */
function secondPeak(m, ends) {
  const e = ends[m.two.end], o = ends[1 - m.two.end], u = unit(sub(e, o));
  return add(e, mul(u, m.two.out ? OFF : -OFF));
}
/**
 * A heat map on the model's pixel grid (pixel size px cm) round centre c: its peaks (plane cm),
 * Gaussians of height 1, sampled at the pixels' middles within half cm. Returns its cells
 * ({ p, h }) and its weighted center: the mean of the pixels' positions weighted by the map.
 */
function heatMap(peaks, px, c, half) {
  const cells = [];
  let sw = 0, su = 0, sv = 0;
  const [cx, cy] = pxAt(c, px), n = Math.ceil(half / px);
  for (let j = Math.floor(cy) - n; j <= Math.floor(cy) + n; j++) {
    for (let i = Math.floor(cx) - n; i <= Math.floor(cx) + n; i++) {
      const p = [(i + 0.5 - 320) * px, (j + 0.5) * px];
      let h = 0;
      for (const q of peaks) h += Math.exp(-((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) / (2 * SIGMA * SIGMA));
      if (h < 1e-4) continue;
      cells.push({ p, h: Math.min(1, h) });
      sw += h; su += h * p[0]; sv += h * p[1];
    }
  }
  return { cells, center: sw > 0 ? [su / sw, sv / sw] : c };
}

/**
 * The B-mode measurement m on the heart shown: per clip frame, the site's ends and, with the
 * two-peaked map, the model's; the LV diameter's phases; the reported frame. Null until the mesh
 * loads.
 */
const traceCache = new Map();
function traceOf(m) {
  const fr = samplesOf(m.view), lv = samplesOf('plax');
  if (!fr || !lv) return null;
  const key = `${m.key}|${samplers.get(m.view).key}|${samplers.get('plax').key}`;
  if (traceCache.has(key)) return traceCache.get(key);
  const px = pxOf(m.view), frames = [];
  for (let f = 0; f < NF; f++) {
    const ends = fr[phaseOf(f)][m.key] || null;
    if (!ends) { frames.push(null); continue; }
    const p2 = secondPeak(m, ends), e = ends[m.two.end];
    const H = heatMap([e, p2], px, mul(add(e, p2), 0.5), OFF / 2 + 4 * SIGMA);
    const two = m.two.end === 0 ? [H.center, ends[1]] : [ends[0], H.center];
    frames.push({ ends, p2, two, cm: len(sub(ends[1], ends[0])), cm2: len(sub(two[1], two[0])) });
  }
  const lvid = Array.from({ length: NF }, (_, f) => { const k = lv[phaseOf(f)].lvid; return k ? len(sub(k[1], k[0])) : 0; });
  const ph = phasesOf(lvid);
  let at;
  if (m.at === 'max') at = frames.reduce((b, q, f) => (q && (b < 0 || q.cm > frames[b].cm + 1e-9) ? f : b), -1);
  else at = (m.at === 'es' ? ph.es : ph.ed)[0] ?? -1;
  const out = { frames, ph, at, px };
  const P = SCAN.model.pheno, want = SITE[P.key] && SITE[P.key][m.key];
  if (want && at >= 0 && Math.abs(frames[at].cm - want) > 0.002) console.warn(`measure: ${m.key} on the ${P.key} heart measures ${frames[at].cm.toFixed(3)} cm, the table ${want} cm`);
  traceCache.set(key, out);
  if (traceCache.size > 40) traceCache.delete(traceCache.keys().next().value);
  return out;
}

/** The B-mode values as the clip reports them on the heart now cut (cm), or null while the mesh loads: tools and checks read them. */
export function reportedNow() {
  const out = {};
  for (const m of B) {
    const T = traceOf(m);
    if (!T || T.at < 0) return null;
    out[m.key] = { cm: T.frames[T.at].cm, cm2: T.frames[T.at].cm2, at: T.at, ed: T.ph.ed, es: T.ph.es };
  }
  return out;
}

// ---------------------------------------------------------------- the Doppler of the heart shown
// Each recording is the other chapters' own, at the heart's values: the values that the Heart menu
// gives each chapter (pheno.js presets). TR: the heart's peak TR velocity of chapter 08 (its trV),
// drawn as chapter 13 draws the CW trace. The aortic valve and the LVOT: chapter 14's model at the
// heart's grade (none, but on the bicuspid heart). MR: chapter 18's model at the heart's grade;
// a heart without MR there shows chapter 18's jet at its default. E, A and e′: chapter 11's model
// at the heart's filling state. TAPSE: the annulus's travel on the RV-focused view of the heart
// mesh (chapter 13 at a normal RV).
const fixed = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
function dopplerOf(d, heart) {
  const P = presetsFor(heart), two = RR * 2;
  if (d.key === 'tr') {
    const v = P.trV ?? pressurePage.defaults.trV, vs = trCwScale(v);
    return {
      title: ['CW · TRICUSPID REGURGITATION', 'CW · TR'], mode: 'cw', scale: vs, base: TR_BASE, broad: 0.4, seed: 43, step: 1,
      fn: (u) => trCwAt((u * two) % RR, v), key: `emtr|${v}|${vs}`,
      points: [{ t: TR_PEAK, v: -v, name: 'peak' }], value: v, dec: 1, site: `chapter ${numOf('pressure')}`,
    };
  }
  if (d.key === 'av' || d.key === 'lvot') {
    const V = asValues(P.asS ?? 0), E = cwEnvelopes(V), T = V.et * 1000;
    const tPeak = (g, vmax) => { let bt = EV.avo, bv = 0; for (let t = EV.avo; t <= EV.avo + T; t += 1) { const y = g(t); if (y > bv) { bv = y; bt = t; } } return bt; };
    if (d.key === 'av') {
      const vs = Math.max(4, Math.ceil(V.vmax + 0.6));
      return {
        title: ['CW · LVOT AND AORTIC VALVE', 'CW · LVOT, AV'], mode: 'cw', scale: vs, base: 0.07, broad: 0.45, seed: 3, step: 1, gain: [0.75, 1.35],
        fn: [(u) => -E.jet((u * two) % RR), (u) => -E.lvot((u * two) % RR)], key: `emav|${V.vmax}|${V.vL}|${V.qA.toFixed(3)}|${V.pA.toFixed(3)}|${V.pL.toFixed(3)}|${vs}`,
        points: [{ t: tPeak(E.jet), v: -V.vmax, name: 'peak' }], value: V.vmax, dec: 1, site: `chapter ${numOf('as')}`,
      };
    }
    // PW in the LVOT: chapter 14's LVOT envelope, on the scale and baseline of chapter 08's PW strip
    const vs = Math.max(1.5, Math.ceil(V.vL * 1.15 * 2) / 2);
    return {
      title: ['PW · LVOT', 'PW · LVOT'], mode: 'pw', scale: vs, base: 0.1, broad: 0.08, seed: 3, step: 0.5,
      fn: (u) => -E.lvot((u * two) % RR), key: `emlvot|${V.vL}|${V.pL.toFixed(3)}|${vs}`,
      points: [{ t: tPeak(E.lvot), v: -V.vL, name: 'peak' }], value: V.vL, dec: 2, site: `chapter ${numOf('as')}`,
    };
  }
  if (d.key === 'mr') {
    const own = (P.mrS ?? 0) > 0, V = mrValues(own ? P.mrS : mrPage.defaults.mrS), env = mrCw(V);
    let bt = 0, bv = 0;
    for (let t = EV.mvc; t <= EV.mvo; t += 1) { const y = env(t); if (y > bv) { bv = y; bt = t; } }
    const vs = Math.max(6, Math.ceil(V.vmax + 0.6)), dens = Math.round(clamp(V.rvol / 60, 0.06, 1) * 50) / 50;
    return {
      title: ['CW · MITRAL REGURGITATION', 'CW · MR'], mode: 'cw', scale: vs, base: 0.06, broad: 0.35 + 0.4 * (1 - dens), seed: 12, step: 2, dens,
      fn: (u) => -env((u * two) % RR), key: `emmr|${V.vmax}|${V.p.toFixed(4)}|${V.onset.toFixed(3)}|${V.tri.toFixed(3)}|${dens}|${vs}`,
      points: [{ t: bt, v: -bv, name: 'peak' }], value: V.vmax, dec: 1, site: `chapter ${numOf('mr')}`, own,
    };
  }
  const F = fillShown(P.fstate ?? 0);
  if (d.key === 'sep' || d.key === 'lat') {
    const eP = d.key === 'sep' ? F.sep : F.lat, vs = Math.max(F.sep, F.lat) > 16 ? 0.24 : 0.18;
    return {
      title: d.key === 'sep' ? ['PW TISSUE DOPPLER · SEPTAL ANNULUS', 'TDI · SEPTAL'] : ['PW TISSUE DOPPLER · LATERAL ANNULUS', 'TDI · LATERAL'], mode: 'pw', scale: vs, base: 0.4, broad: 0.25, seed: d.key === 'sep' ? 6 : 7, step: 0.1, cm: true,
      fn: (u) => tissue(F, eP)((u * two) % RR), key: `em${d.key}|${eP}|${vs}`,
      points: [{ t: EV.mvo + 65, v: -eP / 100, name: 'e′' }], value: eP, dec: 1, unit: 'cm/s', site: `chapter ${numOf('fill')}`,
    };
  }
  if (d.key === 'ea') {
    const vs = F.E > 1.2 ? 2 : 1.4;
    return {
      title: ['PW · MITRAL INFLOW', 'PW · MV INFLOW'], mode: 'pw', scale: vs, base: 0.92, broad: 0.1, seed: 2, step: 0.5,
      fn: (u) => inflow(F)((u * two) % RR), key: `emea|${F.E}|${F.A}|${F.DT.toFixed(1)}|${vs}`,
      points: [{ t: EV.mvo + 70, v: F.E, name: 'E' }, { t: 800, v: F.A, name: 'A' }], value: F.E, A: F.A, ea: F.ea, dec: 2, site: `chapter ${numOf('fill')}`,
    };
  }
  // TAPSE: the annulus on M-mode, 4 cm deep across the strip (chapter 13's 40 mm), as it travels
  // toward the apex in systole (cyclemodel.js systolic weight × TAPSE)
  const tapse = fixed(rvTapseOwn(heart), 0);
  return {
    title: ['M-MODE · TAPSE · LATERAL TRICUSPID ANNULUS', 'M-MODE · TAPSE'], mode: 'mm', tapse, span: 40, top: 0.22,
    points: [{ t: RR, mm: 0, name: 'end-diastole' }, { t: RR + 405, mm: tapse, name: 'peak' }], value: tapse, dec: 0, unit: 'mm', site: `chapter ${numOf('rv')}`,
  };
}
const dopplerCache = new Map();
function dopplerShown(s) {
  const d = dOf(s), key = `${d.key}|${heartOf(s)}`;
  if (!dopplerCache.has(key)) dopplerCache.set(key, { d, ...dopplerOf(d, heartOf(s)) });
  return dopplerCache.get(key);
}

let sheet = null, st = null;
const beat = new Beat(RR);
const clip = { ms: 0 };
const redraw = () => { if (sheet) sheet.dirty = true; };
const MESH = new MeshPanel('plax', { redraw });

// ---------------------------------------------------------------- drawing helpers
/** A heat map's peak on the image: a Gaussian of the heat hue, σ = sigma px, up to alpha a. */
function blob(ctx, x, y, sigma, a = 0.8) {
  const R = 3 * sigma, g = ctx.createRadialGradient(x, y, 0, x, y, R);
  for (let i = 0; i <= 6; i++) { const k = i / 2; g.addColorStop(i / 6, heat(a * Math.exp(-(k * k) / 2))); }
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}
/** The weighted center: a ring and a cross in the calipers' yellow. */
function centerMark(ctx, x, y, r = 4.5) {
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.moveTo(x - r - 3, y); ctx.lineTo(x + r + 3, y);
  ctx.moveTo(x, y - r - 3); ctx.lineTo(x, y + r + 3);
  ctx.stroke();
  ctx.restore();
}
/** Scanner text with a dark outline, legible over the image: { x0, y0, x1, y1 } of its box. */
function tag(ctx, text, x, y, o = {}) {
  ctx.save();
  ctx.font = `${o.weight || 500} ${o.size || 11}px ${MONO}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,10,12,0.88)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || SC.cal;
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width, x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  ctx.restore();
  return { x0, y0: y - 7, x1: x0 + w, y1: y + 7 };
}
/** tag() kept inside box b: the text's box shifts in, whatever its alignment. */
function tagIn(ctx, text, x, y, b, o = {}) {
  ctx.save();
  ctx.font = `${o.weight || 500} ${o.size || 11}px ${MONO}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  const dx = clamp(x0, b.x + 4, b.x + b.w - 4 - w) - x0;
  return tag(ctx, text, x + dx, clamp(y, b.y + 9, b.y + b.h - 9), o);
}
/** The first of the forms that fits w px in the mono face at size px, else the last. */
function pick(ctx, forms, w, size, weight = 500) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${MONO}`;
  const f = forms.find((s) => ctx.measureText(s).width <= w) ?? forms[forms.length - 1];
  ctx.restore();
  return f;
}
/** A panel title from its forms, the longest that fits (scope.js panel: 11 px, 10 px in from each side), with room for a reading at its right. */
function titleOf(ctx, w, forms, right = 0) {
  return pick(ctx, forms, w - 20 - right, 11);
}
const f1 = (x) => x.toFixed(1);

// ---------------------------------------------------------------- B-mode
const NAMES = {
  plax: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
  plax_asc: [['asc', 'Ao', 'ao', 0.5], ['plv', 'LV']],
  a4c_rv: [['lv', 'LV', 'apex', 0.45], ['ra', 'RA'], ['la', 'LA']],
  psax_pa: [['ao', 'Ao'], ['rvot', 'RVOT']],
  sc_ivc: [['ra', 'RA'], [(ev) => { const P = ABD.ivc.pts.map((p) => planeOf(ev, p)); return add(P[0], mul(unit(sub(P[1], P[0])), 4.2)); }, 'IVC']],
};

/** The echo view with the two heat maps, the caliper between their weighted centers and its length, at clip frame f. */
function bView(ctx, box, m, T, f, o) {
  const fr = T.frames[f], tms = phaseOf(f) * FRAME;
  MESH.setView(m.view);
  const read = `frame ${f + 1}/${NF}`;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const rw = ctx.measureText(read).width + 14;
  ctx.restore();
  const right = box.w > 300 ? rw : 0;
  let F = null;
  MESH.draw(ctx, box, titleOf(ctx, box.w, VIEW_TITLE[m.view], right), {
    tms, deeper: DEEPER[m.view],
    names: NAMES[m.view],
    over: (c, Fr, ev) => {
      F = Fr;
      if (!fr) { note(c, Fr.view.box, 'no caliper on this frame', 'top'); return; }
      const sig = SIGMA * Fr.k, two = o.two, ends = two ? fr.two : fr.ends;
      c.save();
      c.beginPath();
      c.rect(Fr.view.box.x, Fr.view.box.y, Fr.view.box.w, Fr.view.box.h);
      c.clip();
      // the maps: one peak on each end; the two-peaked map adds its second
      for (const p of [fr.ends[0], fr.ends[1], ...(two ? [fr.p2] : [])]) { const q = Fr.P(p); blob(c, q[0], q[1], sig); }
      // the caliper between the weighted centers
      const A = Fr.P(ends[0]), Bp = Fr.P(ends[1]);
      c.strokeStyle = SC.cal;
      c.lineWidth = 1.2;
      c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bp[0], Bp[1]); c.stroke();
      c.setLineDash([]);
      for (const q of [A, Bp]) centerMark(c, q[0], q[1], 3);
      // its length beside it, on the side away from the probe's line of sight
      const L = len(sub(ends[1], ends[0])), px = T.px;
      const text = o.raw ? `${f1(L / px)} px` : `${L.toFixed(2)} cm`;
      const mid = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], u = unit(sub(Bp, A));
      let nn = perp(u);
      if (nn[0] < 0) nn = mul(nn, -1);
      const lab = tag(c, text, mid[0] + nn[0] * 14, mid[1] + nn[1] * 14, { size: 11.5, weight: 600, align: nn[0] > 0.3 ? 'left' : 'center' });
      // no chamber name on the length (meshpanel.js tags skips a name in the box F.meas)
      Fr.meas = { x: lab.x0 - 4, y: lab.y0 - 3, w: lab.x1 - lab.x0 + 8, h: lab.y1 - lab.y0 + 6 };
      // the second peak's structure, named beyond it
      if (two) {
        const q = Fr.P(fr.p2), e = Fr.P(fr.ends[m.two.end]), w = unit(sub(q, e));
        let side = perp(w);
        if (dot(side, nn) > 0) side = mul(side, -1);
        const tx = q[0] + w[0] * 10 + side[0] * 12, ty = q[1] + w[1] * 10 + side[1] * 12;
        tag(c, m.two.on, tx, ty, { size: 10.5, color: heat(1), align: side[0] < -0.3 ? 'right' : side[0] > 0.3 ? 'left' : 'center' });
      }
      if (o.raw) note(c, Fr.view.box, ['no pixel size: no centimeters', 'no pixel size'], 'top', [lab]);
      c.restore();
    },
  });
  // the frame's number on the title line, as the scanner shows the cine's frame
  if (right) {
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.textAlign = 'right';
    ctx.fillText(read, box.x + box.w - 10, box.y + 17);
    ctx.restore();
  }
  return F;
}

/** A close-up of the heat map on the caliper's end that the two-peaked map changes: its pixels and its weighted center. */
function bClose(ctx, P, m, T, f, F, o) {
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w, ['HEAT MAP · CLOSE-UP', 'HEAT MAP']));
  const bx = { x: P.x + 4, y: P.y + 22, w: P.w - 8, h: P.h - 26 }, fr = T.frames[f];
  if (!fr || !F || !MESH.ev) return;
  const px = T.px, e = fr.ends[m.two.end], c = mul(add(e, fr.p2), 0.5);
  const span = Math.max(1.6, OFF + 1.1), z = Math.min(bx.w, bx.h) / span;
  const Q = (p) => [bx.x + bx.w / 2 + (p[0] - c[0]) * z, bx.y + bx.h / 2 + (p[1] - c[1]) * z];
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx.x, bx.y, bx.w, bx.h);
  ctx.clip();
  // the image under the map, from the view's own frame, magnified
  const ev = MESH.ev, vb = F.view.box, dpr = ev.dpr || 1;
  const p0 = [c[0] - bx.w / 2 / z, c[1] - bx.h / 2 / z], s0 = F.P(p0);
  ctx.drawImage(ev.canvas, (s0[0] - vb.x) * dpr, (s0[1] - vb.y) * dpr, (bx.w / z) * F.k * dpr, (bx.h / z) * F.k * dpr, bx.x, bx.y, bx.w, bx.h);
  // the map on the model's pixels: each square one pixel of the 640 × 480 frame
  const H = heatMap(o.two ? [e, fr.p2] : [e], px, c, span * 0.75), cell = px * z;
  for (const { p, h } of H.cells) {
    if (h < 0.03) continue;
    const q = Q(p);
    ctx.fillStyle = heat(0.82 * h);
    ctx.fillRect(q[0] - cell / 2, q[1] - cell / 2, cell - (cell > 5 ? 0.6 : 0), cell - (cell > 5 ? 0.6 : 0));
  }
  // the caliper's line through the crop
  const other = fr.ends[1 - m.two.end], u = unit(sub(e, other)), A = Q(add(c, mul(u, -span))), Bq = Q(add(c, mul(u, span)));
  ctx.strokeStyle = SC.cal;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const w = Q(H.center);
  centerMark(ctx, w[0], w[1], 5);
  // the names, beside the caliper's line: the end's own structure and the second peak's on one
  // side, the center on the other
  const side = perp(u), sd = side[0] > 0 ? side : mul(side, -1), fs = bx.w < 200 ? 9.5 : 10.5;
  const boxes = [];
  const name = (text, p, k, color) => {
    const q = Q(p), d = mul(sd, Math.sign(k)), x = q[0] + sd[0] * k, y = q[1] + sd[1] * k;
    const align = d[0] > 0.35 ? 'left' : d[0] < -0.35 ? 'right' : 'center';
    boxes.push(tagIn(ctx, text, x, y + (align === 'center' ? (d[1] > 0 ? 7 : -7) : 0), bx, { size: fs, color, align }));
  };
  if (o.two) {
    name(m.two.site, e, 14, '#d6dee2');
    name(m.two.on, fr.p2, 14, heat(1));
  }
  name('weighted center', H.center, -14, SC.cal);
  // the pixel's size, at the foot
  note(ctx, bx, [`1 square = 1 px = ${px.toFixed(3)} cm`, `1 px = ${px.toFixed(3)} cm`], 'bottom', boxes);
  ctx.restore();
}

/** Ticks on the right of a plot box for the range lo..hi: { step, ticks }. */
function niceTicks(lo, hi, room) {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100];
  const step = steps.find((s) => (hi - lo) / s <= room) ?? 100;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(v);
  return { step, ticks: out };
}

/** The measurement on every frame of the clip, with the phases from the LV diameter and the frame reported. */
function bTrace(ctx, P, m, T, f, o) {
  const unitTxt = o.raw ? 'px' : 'cm';
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w, [`${m.short} ON EVERY FRAME · 3 BEATS · ${unitTxt}`, `${m.short} · EVERY FRAME · ${unitTxt}`, `${m.short} · ${unitTxt}`]));
  const bx = { x: P.x + 8, y: P.y + 34, w: P.w - 46, h: P.h - 52 };
  if (bx.h < 20) return;
  const k = o.raw ? 1 / T.px : 1;
  const site = T.frames.map((q) => (q ? q.cm * k : null)), two = T.frames.map((q) => (q ? q.cm2 * k : null));
  const shown = o.two ? [...site, ...two] : site, ok = shown.filter((v) => v !== null);
  if (!ok.length) return;
  let lo = Math.min(...ok), hi = Math.max(...ok);
  const pad = Math.max((hi - lo) * 0.18, (o.raw ? 2 : 0.06));
  lo -= pad; hi += pad;
  const X = (i) => bx.x + ((i + 0.5) / NF) * bx.w, Y = (v) => bx.y + bx.h - ((v - lo) / (hi - lo)) * bx.h;
  ctx.save();
  // the scale at the right
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  ctx.lineWidth = 1;
  const { step, ticks } = niceTicks(lo, hi, Math.max(2, Math.floor(bx.h / 18)));
  for (const v of ticks) {
    const y = Y(v);
    ctx.strokeStyle = SC.frame;
    ctx.beginPath(); ctx.moveTo(bx.x, y); ctx.lineTo(bx.x + bx.w, y); ctx.stroke();
    ctx.fillText(v.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0), bx.x + bx.w + 5, y + 3.5);
  }
  // end-diastole and end-systole: the peaks and troughs of the LV diameter
  ctx.font = `500 10px ${MONO}`;
  ctx.textAlign = 'center';
  for (const [list, name] of [[T.ph.ed, 'ED'], [T.ph.es, 'ES']]) {
    for (const i of list) {
      const x = X(i);
      ctx.strokeStyle = name === 'ED' ? 'rgba(127,227,255,0.55)' : 'rgba(141,151,156,0.6)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, bx.y - 2); ctx.lineTo(x, bx.y + bx.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = name === 'ED' ? `rgb(${SC.cyan.join(',')})` : SC.text;
      ctx.fillText(name, x, bx.y - 5);
    }
  }
  // the traces: the site's ends (dashed under the two-peaked map) and the model's
  const line = (vals, color, dash, dots) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let on = false;
    vals.forEach((v, i) => { if (v === null) { on = false; return; } const x = X(i), y = Y(v); if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y); on = true; });
    ctx.stroke();
    ctx.setLineDash([]);
    if (dots) for (let i = 0; i < vals.length; i++) if (vals[i] !== null) { ctx.beginPath(); ctx.arc(X(i), Y(vals[i]), 1.5, 0, 2 * Math.PI); ctx.fill(); }
  };
  if (o.two) line(site, SC.dim, [3, 3], false);
  const main = o.two ? two : site;
  line(main, SC.cal, [], bx.w / NF >= 3.5);
  // the cine's frame
  if (o.live) {
    ctx.strokeStyle = SC.cal;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(X(f), bx.y); ctx.lineTo(X(f), bx.y + bx.h); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the frame reported, and its value
  const avoid = [];
  if (T.at >= 0 && main[T.at] !== null) {
    const x = X(T.at), y = Y(main[T.at]);
    ctx.strokeStyle = SC.cal;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2 * Math.PI); ctx.stroke();
    const txt = o.raw ? `${f1(main[T.at])} px` : `${main[T.at].toFixed(2)} cm`;
    const right = x < bx.x + bx.w * 0.6;
    const r = tagBox(ctx, right ? x + 9 : x - 9, clamp(y + (y > bx.y + bx.h / 2 ? -13 : 13), bx.y + 10, bx.y + bx.h - 10), [txt], { size: 10.5, align: right ? 'left' : 'right', bounds: { x: bx.x, y: bx.y - 4, w: bx.w, h: bx.h + 8 } });
    avoid.push({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
  }
  ctx.restore();
  const what = m.at === 'max' ? 'reported: the largest of the clip' : `reported at ${m.at === 'es' ? 'end-systole' : 'end-diastole'}`;
  const how = m.key === 'lvid' ? 'ED, ES: its peaks and troughs' : 'ED, ES: peaks and troughs of LVID';
  note(ctx, { x: bx.x - 4, y: bx.y + 6, w: bx.w + 8, h: bx.h + 6 }, [`${how} · ${what}`, what, m.at === 'max' ? 'largest' : m.at.toUpperCase()], 'bottom', avoid);
}

// ---------------------------------------------------------------- how the number is made (on the paper)
/**
 * Lines of the arithmetic in box b: a title in the hand, then mono lines, each { t, c (color), w
 * (weight) } or a list of forms, long to short. The type shrinks to fit the widest line, then
 * lines from the end drop when the box is short.
 */
function howPanel(sh, t, b, title, lines) {
  const narrow = b.w < 260;
  let y = b.y + (narrow ? 15 : 20);
  sh.text(title, b.x, y, { size: narrow ? 17 : 21, color: t.ink });
  y += narrow ? 9 : 12;
  const avail = b.y + b.h - y;
  let size = narrow ? 10.5 : 12;
  const forms = lines.map((l) => [].concat(l.t));
  for (; size > 9; size -= 0.5) {
    const wide = forms.map((fs) => fs.find((s) => sh.measure(s, { family: MONO, size, weight: 500 }) <= b.w) ?? null);
    if (wide.every(Boolean)) break;
  }
  const lh = size * 1.55, n = Math.max(1, Math.min(lines.length, Math.floor(avail / lh)));
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    const s = forms[i].find((x) => sh.measure(x, { family: MONO, size, weight: l.w || 500 }) <= b.w) ?? forms[i][forms[i].length - 1];
    y += lh;
    sh.text(s, b.x, y, { family: MONO, size, weight: l.w || 500, color: l.c || t.ink2 });
  }
}

function bHow(sh, t, b, m, T, f, o) {
  const fr = T.frames[f];
  if (!fr) return;
  const ends = o.two ? fr.two : fr.ends, px = T.px, wide = b.w >= 300;
  const p1 = pxAt(ends[0], px), p2 = pxAt(ends[1], px), dx = p2[0] - p1[0], dy = p2[1] - p1[1], dist = Math.hypot(dx, dy);
  const cm = dist * px, rep = T.at >= 0 ? T.frames[T.at] : null;
  const pt = (q) => `(${f1(q[0])}, ${f1(q[1])}) px`;
  const mark = (i) => (o.two && i === m.two.end ? ', between 2 peaks' : '');
  const lines = [];
  if (wide) lines.push({ t: [`${m.model} model · 2 heat maps · frame ${f + 1} of ${NF}`, `${m.model} · frame ${f + 1} of ${NF}`], c: t.ink3 });
  lines.push({ t: [`point 1 ${pt(p1)}${mark(0)}`, `point 1 ${pt(p1)}`, `1 ${pt(p1)}`] });
  lines.push({ t: [`point 2 ${pt(p2)}${mark(1)}`, `point 2 ${pt(p2)}`, `2 ${pt(p2)}`] });
  lines.push({ t: [`distance √(${f1(Math.abs(dx))}² + ${f1(Math.abs(dy))}²) = ${f1(dist)} px`, `distance ${f1(dist)} px`] });
  if (o.raw) {
    lines.push({ t: ['pixel size: none (no DICOM region tags)', 'pixel size: none'] });
    lines.push({ t: [`${f1(dist)} px: no pixel size, no centimeters`, 'no pixel size: no cm'], c: t.flag, w: 600 });
  } else {
    lines.push({ t: [`pixel size ${px.toFixed(3)} cm (DICOM 0018,602C, 602E)`, `pixel size ${px.toFixed(3)} cm`] });
    lines.push({ t: [`${f1(dist)} px × ${px.toFixed(3)} cm = ${cm.toFixed(2)} cm`, `= ${cm.toFixed(2)} cm`], c: o.two ? t.flag : t.accent, w: 600 });
    if (rep) {
      const at = m.at === 'max' ? 'the largest of the clip' : m.at === 'es' ? 'end-systole' : 'end-diastole';
      const v = o.two ? rep.cm2 : rep.cm;
      lines.push({ t: [`reported at ${at} (frame ${T.at + 1}): ${v.toFixed(2)} cm`, `reported: ${v.toFixed(2)} cm`] });
      if (o.two) lines.push({ t: [`the site's caliper: ${rep.cm.toFixed(2)} cm`, `site: ${rep.cm.toFixed(2)} cm`], c: t.ink3 });
    }
  }
  howPanel(sh, t, b, 'How the number is made', lines);
}

// ---------------------------------------------------------------- Doppler and M-mode
/** Region pixel (1024 × 426) of a point of the strip box bx at time t (ms of its two beats) and velocity v (m/s), or depth mm on M-mode. */
function regionOf(D, p) {
  const x = (p.t / (2 * RR)) * DW;
  if (D.mode === 'mm') return [x, (D.top + p.mm / D.span) * DH];
  return [x, (D.base - (p.v * Math.max(D.base, 1 - D.base)) / D.scale) * DH];
}
/** The velocity (cm/s) of one region pixel; for M-mode the depth (cm) of one pixel. */
const deltaY = (D) => (D.mode === 'mm' ? D.span / 10 / DH : (100 * D.scale) / (DH * Math.max(D.base, 1 - D.base)));
const toBox = (bx, q) => [bx.x + (q[0] / DW) * bx.w, bx.y + (q[1] / DH) * bx.h];

/** The recording, as its chapter draws it. Returns its plot box. */
function dStrip(ctx, P, D, right) {
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w, D.title, right));
  if (D.mode === 'mm') {
    // as chapter 13 draws it: the annulus's echo over two beats, toward the apex in systole
    const bx = { x: P.x + 6, y: P.y + 24, w: P.w - 40, h: P.h - 30 };
    ctx.save();
    ctx.fillStyle = '#20262a';
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.strokeStyle = '#d9dfe2';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const u = i / 240, y = bx.y + (D.top + (cycleAt((u * 2 * RR) % RR).s * D.tapse) / D.span) * bx.h;
      if (i) ctx.lineTo(bx.x + u * bx.w, y); else ctx.moveTo(bx.x + u * bx.w, y);
    }
    ctx.stroke();
    // depth marks every 5 mm, numbered every cm
    ctx.font = `400 10px ${MONO}`;
    ctx.fillStyle = SC.dim;
    ctx.strokeStyle = SC.dim;
    ctx.lineWidth = 1;
    for (let mm = 0; mm <= D.span; mm += 5) {
      const y = bx.y + (mm / D.span) * bx.h;
      ctx.beginPath(); ctx.moveTo(bx.x + bx.w + 2, y); ctx.lineTo(bx.x + bx.w + (mm % 10 ? 4 : 6), y); ctx.stroke();
      if (mm % 10 === 0 && mm > 0 && mm < D.span) ctx.fillText(String(mm / 10), bx.x + bx.w + 9, y + 3.5);
    }
    ctx.fillText('cm', bx.x + bx.w + 9, bx.y + bx.h - 2);
    ctx.restore();
    return bx;
  }
  const bx = inner(P, 34);
  spectral(ctx, bx, { fn: D.fn, scale: D.scale, base: D.base, mode: D.mode, broad: D.broad, gain: D.gain, key: D.key, seed: D.seed });
  if (D.dens !== undefined && D.dens < 0.95) {
    // a faint jet, as chapter 18 dims it
    ctx.save();
    ctx.fillStyle = SC.bg;
    ctx.globalAlpha = 0.72 * (1 - D.dens);
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.restore();
  }
  vscale(ctx, bx, D.scale, D.base, D.step, D.cm ? 'cm/s' : 'm/s', { cm: D.cm });
  return bx;
}

/** The heat maps on the recording, their weighted centers and, with the DICOM data, the rows the arithmetic uses. */
function dMarks(ctx, bx, D, o) {
  const sig = Math.max(3.5, (9 / DH) * bx.h), boxes = [];
  const pts = D.points.map((p) => ({ ...p, q: regionOf(D, p) }));
  for (const p of pts) { const [x, y] = toBox(bx, p.q); blob(ctx, x, y, sig); }
  ctx.save();
  if (!o.raw && D.mode !== 'mm') {
    // the baseline row, from the DICOM tag
    const yb = bx.y + D.base * bx.h;
    ctx.strokeStyle = SC.cal;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(bx.x, yb); ctx.lineTo(bx.x + bx.w, yb); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const lab = pick(ctx, [`baseline · row ${f1(D.base * DH)} (DICOM 0018,6022)`, `baseline · row ${f1(D.base * DH)}`, 'baseline'], bx.w * 0.62, 10.5);
    const up = D.base > 0.5;
    boxes.push(tag(ctx, lab, bx.x + bx.w - 6, yb + (up ? -9 : 9), { size: 10.5, align: 'right' }));
  }
  // each point: its center, and the rows from the baseline (from the first point on M-mode)
  pts.forEach((p, i) => {
    const [x, y] = toBox(bx, p.q);
    centerMark(ctx, x, y, 4);
    if (o.raw) return;
    const y0 = D.mode === 'mm' ? (i ? toBox(bx, pts[0].q)[1] : null) : bx.y + D.base * bx.h;
    if (y0 === null) return;
    const xl = x + (D.mode === 'mm' ? 0 : 14 + 12 * i);
    ctx.strokeStyle = SC.cal;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xl, y0); ctx.lineTo(xl, y);
    for (const yy of [y0, y]) { ctx.moveTo(xl - 3, yy); ctx.lineTo(xl + 3, yy); }
    ctx.stroke();
    const rows = Math.abs(p.q[1] - (D.mode === 'mm' ? pts[0].q[1] : D.base * DH));
    const txt = `${D.points.length > 1 && D.mode !== 'mm' ? `${p.name} ` : ''}${f1(rows)} px`;
    boxes.push(tag(ctx, txt, xl + 6, (y0 + y) / 2, { size: 10.5 }));
  });
  // each map's name beside its point
  pts.forEach((p) => {
    const [x, y] = toBox(bx, p.q), above = D.mode === 'mm' ? p.mm > 0 : p.v < 0 ? false : true;
    boxes.push(tag(ctx, p.name, x, y + (above ? -sig * 2.6 - 4 : sig * 2.6 + 6), { size: 10.5, color: heat(1), align: 'center' }));
  });
  ctx.restore();
  if (o.raw) {
    const forms = D.mode === 'mm' ? ['no pixel size: no millimeters', 'no pixel size'] : ['no velocity scale without the DICOM region data', 'no DICOM region data: no velocity', 'no velocity scale'];
    note(ctx, bx, forms, 'auto', boxes);
  }
  return pts;
}

/** A close-up of the recording round the first heat map: its pixels and its weighted center. */
function dClose(ctx, P, D, bx, pts, k) {
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w, ['HEAT MAP · CLOSE-UP', 'HEAT MAP']));
  const cb = { x: P.x + 4, y: P.y + 22, w: P.w - 8, h: P.h - 26 }, p = pts[0];
  // a window of 56 region pixels across, square on the screen
  const half = 28, zx = cb.w / (2 * half), zy = zx;
  const Q = (q) => [cb.x + cb.w / 2 + (q[0] - p.q[0]) * zx, cb.y + cb.h / 2 + (q[1] - p.q[1]) * zy];
  ctx.save();
  ctx.beginPath();
  ctx.rect(cb.x, cb.y, cb.w, cb.h);
  ctx.clip();
  // the recording under the map, magnified from the figure itself
  const sx = bx.w / DW, sy = bx.h / DH, c0 = toBox(bx, [p.q[0] - cb.w / 2 / zx, p.q[1] - cb.h / 2 / zy]);
  ctx.drawImage(sheet.canvas, c0[0] * k, c0[1] * k, (cb.w / zx) * sx * k, (cb.h / zy) * sy * k, cb.x, cb.y, cb.w, cb.h);
  // the map on the region's pixels
  const sg = 9;
  let sw = 0, su = 0, sv = 0;
  for (let j = Math.floor(p.q[1]) - 34; j <= Math.floor(p.q[1]) + 34; j++) {
    for (let i = Math.floor(p.q[0]) - 34; i <= Math.floor(p.q[0]) + 34; i++) {
      const h = Math.exp(-((i + 0.5 - p.q[0]) ** 2 + (j + 0.5 - p.q[1]) ** 2) / (2 * sg * sg));
      sw += h; su += h * (i + 0.5); sv += h * (j + 0.5);
      if (h < 0.03) continue;
      const q = Q([i + 0.5, j + 0.5]);
      ctx.fillStyle = heat(0.8 * h);
      ctx.fillRect(q[0] - zx / 2, q[1] - zy / 2, zx - (zx > 5 ? 0.6 : 0), zy - (zy > 5 ? 0.6 : 0));
    }
  }
  const w = Q([su / sw, sv / sw]);
  centerMark(ctx, w[0], w[1], 5);
  const fs = cb.w < 200 ? 9.5 : 10.5;
  const r = tag(ctx, 'weighted center', w[0], clamp(w[1] - 22, cb.y + 9, cb.y + cb.h - 9), { size: fs, align: 'center' });
  note(ctx, cb, [`1 square = 1 px of the ${DW} × ${DH} region`, '1 square = 1 px'], 'bottom', [r]);
  ctx.restore();
}

function dHow(sh, t, b, D, pts, o) {
  const dY = deltaY(D), base = D.base * DH;
  const pt = (q) => `(${f1(q[0])}, ${f1(q[1])}) px`;
  const head = { t: [`${D.d.model} model · ${pts.length} heat map${pts.length > 1 ? 's' : ''}`, `${D.d.model} · ${pts.length} map${pts.length > 1 ? 's' : ''}`], c: t.ink3 };
  const lines = [head];
  if (D.mode === 'mm') {
    const [a, c] = pts, rows = c.q[1] - a.q[1];
    lines.push({ t: [`end-diastole ${pt(a.q)}`, `ED ${pt(a.q)}`] }, { t: [`peak ${pt(c.q)}`, `peak ${pt(c.q)}`] });
    lines.push({ t: [`excursion ${f1(c.q[1])} − ${f1(a.q[1])} = ${f1(rows)} px`, `excursion ${f1(rows)} px`] });
    if (o.raw) lines.push({ t: ['pixel size: none (no DICOM region tags)', 'pixel size: none'] }, { t: [`${f1(rows)} px: no pixel size, no millimeters`, 'no millimeters'], c: t.flag, w: 600 });
    else {
      const cm = rows * dY;
      lines.push({ t: [`pixel size ${dY.toFixed(4)} cm (DICOM 0018,602E)`, `pixel size ${dY.toFixed(4)} cm`] });
      lines.push({ t: [`${f1(rows)} px × ${dY.toFixed(4)} cm = ${cm.toFixed(2)} cm = ${Math.round(cm * 10)} mm`, `= ${Math.round(cm * 10)} mm`], c: t.accent, w: 600 });
    }
    howPanel(sh, t, b, 'How the number is made', lines);
    return;
  }
  for (const p of pts) lines.push({ t: [`${pts.length > 1 ? `${p.name} ` : 'point '}${pt(p.q)}`, pt(p.q)] });
  if (o.raw) {
    lines.push({ t: ['baseline row: none (no DICOM tag 0018,6022)', 'baseline row: none'] });
    lines.push({ t: ['velocity per px: none (no DICOM region tags)', 'velocity per px: none'] });
    lines.push({ t: ['no velocity scale without the DICOM region data', 'no velocity scale'], c: t.flag, w: 600 });
  } else {
    lines.push({ t: [`baseline row ${f1(base)} (DICOM 0018,6022)`, `baseline row ${f1(base)}`] });
    lines.push({ t: [`${dY.toFixed(3)} cm/s per px (DICOM 0018,602E)`, `${dY.toFixed(3)} cm/s per px`] });
    const vel = pts.map((p) => Math.abs(p.q[1] - base) * dY), cm = D.unit === 'cm/s' ? 1 : 0;
    pts.forEach((p, i) => {
      const r1 = `${f1(Math.max(p.q[1], base))} − ${f1(Math.min(p.q[1], base))}`, v = vel[i].toFixed(cm);
      lines.push({ t: [`${pts.length > 1 ? `${p.name}: ` : ''}(${r1}) × ${dY.toFixed(3)} = ${v} cm/s`, `${pts.length > 1 ? `${p.name} ` : ''}= ${v} cm/s`], c: t.accent, w: 600 });
    });
    if (D.d.key === 'ea') lines.push({ t: [`E/A = ${Math.round(vel[0])} ÷ ${Math.round(vel[1])} = ${(vel[0] / vel[1]).toFixed(2)}`, `E/A ${(vel[0] / vel[1]).toFixed(2)}`], c: t.accent, w: 600 });
    else if (!cm) lines.push({ t: [`${Math.round(vel[0])} cm/s = ${(vel[0] / 100).toFixed(D.dec)} m/s, as ${D.site} prints it`, `= ${(vel[0] / 100).toFixed(D.dec)} m/s`] });
  }
  howPanel(sh, t, b, 'How the number is made', lines);
}

// ---------------------------------------------------------------- the figure
const LABEL = {
  bmode: 'Illustration: the heat maps sit on the site’s own caliper points. EchoNet-Measurements did not run on these images.',
  doppler: 'Illustration: the heat maps sit on the peaks of the site’s own recordings. EchoNet-Measurements did not run on these images.',
};
/** The label under the figure, in one or two lines that fit width w: the lines' height. */
function footLabel(sh, t, x, yBottom, w, text) {
  const o = { family: SANS, size: w < 520 ? 11 : 12, weight: 500 };
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (sh.measure(next, o) <= w || !cur) cur = next; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  const lh = o.size * 1.35;
  lines.forEach((l, i) => sh.text(l, x, yBottom - (lines.length - 1 - i) * lh, { ...o, color: t.ink2 }));
}

/** The clip's frame shown: the cine's, or the frame reported when the cine does not run. */
function frameNow(T) {
  if (reducedMotion || !T) return T && T.at >= 0 ? T.at : 0;
  return Math.floor(clip.ms / FRAME) % NF;
}

function drawB(sh, t, W, H, narrow) {
  const ctx = sh.ctx, m = bOf(st), o = { two: !!st.emTwo, raw: !!st.emRaw, live: !reducedMotion };
  const T = traceOf(m), foot = narrow ? 34 : 22;
  const area = { x: narrow ? 6 : 16, y: narrow ? 6 : 14, w: W - (narrow ? 12 : 32), h: H - (narrow ? 12 : 26) - foot };
  let img, close, how, tr;
  if (narrow) {
    [img, close, tr] = rows(area, [1.6, 1.15, 0.85], 8);
    [close, how] = cols(close, [0.85, 1.15], 10);
  } else {
    const [L, R] = cols(area, [1.42, 1], 14);
    [img, tr] = rows(L, [2.15, 1], 10);
    const ch = Math.min(R.w * 0.9, R.h * 0.46);
    close = { x: R.x, y: R.y, w: R.w, h: ch };
    how = { x: R.x, y: R.y + ch + 12, w: R.w, h: R.h - ch - 12 };
  }
  if (!T) {
    MESH.setView(m.view);
    MESH.draw(ctx, img, titleOf(ctx, img.w, VIEW_TITLE[m.view]), { tms: 0, deeper: DEEPER[m.view], names: NAMES[m.view] });
    panel(ctx, close.x, close.y, close.w, close.h, 'HEAT MAP');
    panel(ctx, tr.x, tr.y, tr.w, tr.h, `${m.short}`);
    note(ctx, inner(tr), 'loading the heart model', 'top');
  } else {
    const f = frameNow(T);
    const F = bView(ctx, img, m, T, f, o);
    bClose(ctx, close, m, T, f, F, o);
    bTrace(ctx, tr, m, T, f, o);
    bHow(sh, t, { x: how.x + (narrow ? 2 : 4), y: how.y, w: how.w - (narrow ? 2 : 4), h: how.h }, m, T, f, o);
  }
  footLabel(sh, t, area.x, H - (narrow ? 8 : 9), area.w, LABEL.bmode);
}

function drawD(sh, t, W, H, narrow) {
  const ctx = sh.ctx, D = dopplerShown(st), o = { raw: !!st.emRaw };
  const foot = narrow ? 34 : 22;
  const area = { x: narrow ? 6 : 16, y: narrow ? 6 : 14, w: W - (narrow ? 12 : 32), h: H - (narrow ? 12 : 26) - foot };
  let strip, close, how;
  if (narrow) {
    let low;
    [strip, low] = rows(area, [1.6, 1], 8);
    [close, how] = cols(low, [0.9, 1.1], 10);
  } else {
    const [L, R] = cols(area, [1.42, 1], 14);
    strip = L;
    const ch = Math.min(R.w * 0.95, R.h * 0.5);
    close = { x: R.x, y: R.y, w: R.w, h: ch };
    how = { x: R.x, y: R.y + ch + 12, w: R.w, h: R.h - ch - 12 };
  }
  // the value as the model reads it, on the strip's title line
  const val = o.raw ? '' : D.d.key === 'ea' ? `E ${D.value.toFixed(2)} · A ${D.A.toFixed(2)} m/s` : D.mode === 'mm' ? `${D.value} mm` : `${D.value.toFixed(D.dec)} ${D.unit || 'm/s'}`;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const vw = val ? ctx.measureText(val).width + 14 : 0;
  ctx.restore();
  const room = strip.w > 320 ? vw : 0;
  const bx = dStrip(ctx, strip, D, room);
  // the close-up copies the recording before the marks go on it
  const k = sh.dpr * (sh.z || 1);
  const pts = D.points.map((p) => ({ ...p, q: regionOf(D, p) }));
  dClose(ctx, close, D, bx, pts, k);
  dMarks(ctx, bx, D, o);
  if (room && val) {
    ctx.save();
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.textAlign = 'right';
    ctx.fillText(val, strip.x + strip.w - 10, strip.y + 17);
    ctx.restore();
  }
  dHow(sh, t, { x: how.x + (narrow ? 2 : 4), y: how.y, w: how.w - (narrow ? 2 : 4), h: how.h }, D, pts, o);
  footLabel(sh, t, area.x, H - (narrow ? 8 : 9), area.w, LABEL.doppler);
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, narrow = W < 700;
  if (tabOf(st) === 'doppler') drawD(sh, t, W, H, narrow);
  else drawB(sh, t, W, H, narrow);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const AT = { ed: 'at end-diastole', es: 'at end-systole', max: 'at its largest' };
const LEAD_NAME = { ivs: 'septum', lvid: 'LV internal diameter', lvpw: 'posterior wall', la: 'LA diameter', rvb: 'RV basal diameter', root: 'aortic root', asc: 'ascending aorta', pa: 'main pulmonary artery', ivc: 'IVC' };
/** How the reported frame is found, for each kind of measurement. */
const PHASE_WORDS = {
  ed: 'end-diastole is a frame at a peak of the LV diameter over the clip',
  es: 'end-systole is a frame at a trough of the LV diameter over the clip',
  max: 'the model reports the largest diameter of the clip; this model’s IVC does not change with the beat',
};

function bText(s, cite) {
  const m = bOf(s), V = siteValue(m, heartOf(s)), C = cite('sahashi2025');
  const name = LEAD_NAME[m.key], two = !!s.emTwo, raw = !!s.emRaw, px = pxOf(m.view);
  const cm = two ? V.cm2 : V.cm;
  const readouts = [
    { k: 'Measurement', v: m.name, text: true },
    raw ? { k: 'Value', v: fmt(cm / px, 0), u: 'px', flag: true } : { k: 'Value', v: fmt(cm, 1), u: 'cm', flag: two },
  ];
  if (two) readouts.push(raw ? { k: 'Site value', v: fmt(V.cm / px, 0), u: 'px' } : { k: 'Site value', v: fmt(V.cm, 1), u: 'cm' });
  readouts.push(raw ? { k: 'Pixel size', v: 'none', text: true, flag: true } : { k: 'Pixel size', v: px.toFixed(3), u: 'cm' });
  readouts.push({ k: 'Points', v: '2 heat maps', text: true });
  let live;
  if (raw) {
    live = `<b>Without the DICOM region data, the model finds the two ends of the ${name} but gives no centimeters.</b> The caliper is ${fmt(cm / px, 0)} px long; the pixel size that converts it is stored in the DICOM file, and an export to a video format does not keep it${C}.`;
  } else if (two) {
    live = `<b>With a second peak on ${/^[aeiou]/i.test(m.two.on) ? 'an' : 'a'} ${m.two.on}, the ${name} measures ${fmt(V.cm2, 1)} cm instead of ${fmt(V.cm, 1)} cm.</b> The weighted center falls between the two peaks, on neither structure${C}.`;
  } else {
    live = `<b>The ${name} measures ${fmt(cm, 1)} cm ${AT[m.at]}.</b> The two ends are the weighted centers of two heat maps, and the model measures every frame; ${PHASE_WORDS[m.at]}${C}.`;
  }
  return { readouts, live };
}

function dText(s, cite) {
  const D = dopplerShown(s), raw = !!s.emRaw, C = cite('sahashi2025');
  const pts = D.points.map((p) => ({ ...p, q: regionOf(D, p) })), dY = deltaY(D), base = D.base * DH;
  const readouts = [{ k: 'Measurement', v: D.d.name, text: true }];
  const n = pts.length;
  let live;
  const noMr = D.d.key === 'mr' && !D.own ? ` The heart shown has no MR in this site’s model: the recording is chapter ${numOf('mr')}’s jet at its default.` : '';
  if (D.mode === 'mm') {
    const rows = pts[1].q[1] - pts[0].q[1];
    readouts.push(raw ? { k: 'Value', v: fmt(rows, 0), u: 'px · no mm', flag: true } : { k: 'Value', v: String(D.value), u: 'mm' });
    readouts.push(raw ? { k: 'Pixel size', v: 'none', text: true, flag: true } : { k: 'Pixel size', v: dY.toFixed(4), u: 'cm' });
    live = raw
      ? `<b>Without the DICOM region data, the model finds the two points of TAPSE but gives no millimeters.</b> The annulus moves ${fmt(rows, 0)} px between them; the pixel size is stored in the DICOM file${C}.`
      : `<b>TAPSE measures ${D.value} mm.</b> Two heat maps find the annulus at end-diastole and at its peak systolic excursion; the ${fmt(rows, 0)} px between them, times ${dY.toFixed(4)} cm per px, give ${fmt(rows * dY, 2)} cm${C}.`;
  } else if (D.d.key === 'ea') {
    const E = Math.abs(pts[0].q[1] - base) * dY, A = Math.abs(pts[1].q[1] - base) * dY;
    if (raw) readouts.push({ k: 'Value', v: 'none', text: true, flag: true });
    else readouts.push({ k: 'E', v: fmt(E / 100, 2), u: 'm/s' }, { k: 'A', v: fmt(A / 100, 2), u: 'm/s' }, { k: 'E/A', v: fmt(E / A, 2) });
    readouts.push(raw ? { k: 'Velocity per pixel', v: 'none', text: true, flag: true } : { k: 'Velocity per pixel', v: dY.toFixed(3), u: 'cm/s' });
    live = raw
      ? `<b>Without the DICOM region data, the model finds the E and A peaks but gives no velocity.</b> The baseline row and the velocity per pixel come from the DICOM region tags${C}.`
      : `<b>The mitral E velocity measures ${fmt(E / 100, 2)} m/s and E/A is ${fmt(E / A, 2)}.</b> Two heat maps find the E and A peaks; each velocity is its distance from the baseline, in pixels, times the velocity per pixel stored in the DICOM file${C}.`;
  } else {
    const rows = Math.abs(pts[0].q[1] - base), v = rows * dY;
    const shownV = D.unit === 'cm/s' ? fmt(v, 1) : fmt(v / 100, D.dec);
    readouts.push(raw ? { k: 'Value', v: 'none', text: true, flag: true } : { k: 'Value', v: shownV, u: D.unit || 'm/s' });
    readouts.push(raw ? { k: 'Velocity per pixel', v: 'none', text: true, flag: true } : { k: 'Velocity per pixel', v: dY.toFixed(3), u: 'cm/s' });
    const what = { tr: 'The peak TR velocity', av: 'The peak aortic valve velocity', mr: 'The peak MR velocity', lvot: 'The peak LVOT velocity', sep: 'Septal e′', lat: 'Lateral e′' }[D.d.key];
    live = raw
      ? `<b>Without the DICOM region data, the model finds the peak but gives no velocity.</b> The baseline row and the velocity per pixel come from the DICOM region tags${C}.${noMr}`
      : `<b>${what} measures ${shownV} ${D.unit || 'm/s'}.</b> The point is the weighted center of the heat map on the peak; its ${fmt(rows, 0)} px from the baseline, times ${dY.toFixed(3)} cm/s per px, give ${fmt(v, 0)} cm/s${C}.${noMr}`;
  }
  readouts.push({ k: 'Points', v: `${n} heat map${n > 1 ? 's' : ''}`, text: true });
  return { readouts, live };
}

// ---------------------------------------------------------------- the sequence
// LVID; the septum, its map with a second peak and without; the aortic root; the IVC; then TR,
// mitral E and E/A, and TAPSE, which loses its DICOM data for the last seconds.
const STEPS = [
  [0, { emTab: 'bmode', emB: 1, emTwo: false, emRaw: false }],
  [6, { emTab: 'bmode', emB: 0, emTwo: false, emRaw: false }],
  [9, { emTab: 'bmode', emB: 0, emTwo: true, emRaw: false }],
  [14, { emTab: 'bmode', emB: 0, emTwo: false, emRaw: false }],
  [16, { emTab: 'bmode', emB: 5, emTwo: false, emRaw: false }],
  [20, { emTab: 'bmode', emB: 8, emTwo: false, emRaw: false }],
  [24, { emTab: 'doppler', emD: 0, emTwo: false, emRaw: false }],
  [28, { emTab: 'doppler', emD: 6, emTwo: false, emRaw: false }],
  [32, { emTab: 'doppler', emD: 7, emTwo: false, emRaw: false }],
  [36, { emTab: 'doppler', emD: 7, emTwo: false, emRaw: true }],
];

/** The tab's controls show only under their tab (data-em-tab). */
function showTab(s) {
  for (const el of document.querySelectorAll('#ch-measure [data-em-tab]')) el.hidden = el.dataset.emTab !== tabOf(s);
}

const measurePage = {
  key: 'measure',
  part: 'ai',
  title: 'Automated measurements',
  nav: 'AI measure',
  dwell: 40,
  defaults: { emTab: 'bmode', emB: 1, emD: 0, emTwo: false, emRaw: false },
  format: {
    emB: (x) => B[Math.round(x)]?.name ?? '',
    emD: (x) => D[Math.round(x)]?.name ?? '',
  },
  watch: ['emTab', 'emB', 'emD', 'emTwo', 'emRaw', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    showTab(state);
    subscribe?.((s, ch) => { if ('emTab' in ch) showTab(s); });
    // a new heart: its frames are cut again, ahead of need once the chapter has been open
    onPheno(() => warmAhead());
  },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter); the
  // views that only measure share it, and cut their frames once the chapter opens
  enter() { entered = true; MESH.start(); scanner().then((S) => { SCAN = S; warmAhead(); redraw(); }).catch(() => {}); },
  warm() { MESH.start(); scanner().then((S) => { SCAN = S; warmAhead(); }).catch(() => {}); },
  // the figure can draw the state shown: the mesh and the measuring views are loaded, or failed
  ready: () => MESH.state === 'failed' || (MESH.state === 'ready' && !!SCAN),
  pulse: () => beat.pulse(),
  anim(dt, s) {
    beat.tick(dt, true);
    if (tabOf(s) !== 'bmode' || reducedMotion) return;
    const f0 = Math.floor(clip.ms / FRAME) % NF;
    clip.ms = (clip.ms + dt * 1000) % (NF * FRAME);
    // a new frame of the clip: the image, its calipers and the trace's cursor move
    if (Math.floor(clip.ms / FRAME) % NF !== f0 && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ ...STEPS[0][1], emD: 0 }); },
  tourTick(tt, set) {
    let k = 0;
    while (k + 1 < STEPS.length && tt >= STEPS[k + 1][0]) k++;
    set(STEPS[k][1]);
  },
  // the time of the sequence at which tourTick shows this state (its inverse); a measurement the
  // sequence does not show starts the step after it
  tourAt(s) {
    if (tabOf(s) === 'doppler') {
      const d = Math.round(s.emD);
      return d === 7 ? (s.emRaw ? 36 : 32) : d === 0 ? 24 : 28;
    }
    const b = Math.round(s.emB);
    if (b === 1) return 0;
    if (b === 0) return s.emTwo ? 9 : 6;
    return b <= 5 ? 16 : 20;
  },
  text(s, { cite }) {
    return tabOf(s) === 'doppler' ? dText(s, cite) : bText(s, cite);
  },
};
export default measurePage;
