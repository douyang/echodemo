// Chapter Diseases of the aorta: the calipers measured on the views cut from the heart mesh, and
// the tables of those measurements against the weights of the chapter's targets
// (gl/aortamesh.js), measured on each heart. The chapter inverts the tables, so that each
// diameter it prints is the one its image shows. Lengths in cm, in the view's plane.
//
// The root and the ascending aorta (Lang 2015; Goldstein 2015): chords square to the root's axis
// on the plane, at levels above the aortic valve's centre; along each, the walls' edges. The leading edge of a wall is its edge nearer the probe: the anterior wall's
// outer face and the posterior wall's inner face. L-L runs from the one to the other, I-I between
// the two inner faces. The sinuses: the largest L-L from 0.3 to 2.0 cm above the valve's centre.
// The sinotubular junction: L-L 2.4 cm above it, where the sinuses end in this model. The
// ascending aorta: L-L 1.5 cm above the junction. The annulus: I-I at midsystole, at the cusps'
// hinge points, square to the root's axis.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

export const LEVEL = { sinus: [0.3, 2.0], stj: 2.4, asc: 1.5 };

/** Where the line P0 + t dir (t in -len..len) crosses the closed wall loops: the sorted t. */
function crossings(loops, P0, dir, len) {
  const hits = [];
  for (const L of loops) {
    if (!L.closed) continue;
    const P = L.pts, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], den = dir[0] * ey - dir[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const qx = a[0] - P0[0], qy = a[1] - P0[1];
      const t = (qx * ey - qy * ex) / den, u = (qx * dir[1] - qy * dir[0]) / den;
      if (u >= 0 && u < 1 && t >= -len && t <= len) hits.push(t);
    }
  }
  return hits.sort((x, y) => x - y);
}
/** How many closed loops enclose the point p: an odd count is inside a wall. */
function depthAt(loops, p) {
  let k = 0;
  for (const L of loops) {
    if (!L.closed) continue;
    const P = L.pts;
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    if (c) k++;
  }
  return k;
}

/**
 * The chord through C along n (n points away from the probe): the lumen's edges round C, and the
 * walls' far faces beyond them: { a0, a, b, b1 } as t along n (a0 < a < 0 < b < b1), or null.
 * a0..a: the anterior wall, b..b1: the posterior wall.
 */
function chordAt(loops, C, n, reach = 4.5) {
  const h = crossings(loops, C, n, reach);
  const after = h.filter((t) => t > 1e-6), before = h.filter((t) => t < -1e-6);
  if (after.length < 2 || before.length < 2) return null;
  return { a0: before[before.length - 2], a: before[before.length - 1], b: after[0], b1: after[1] };
}

/** The root's axis on the plane at systolic weight s: the valve's centre P0 and the unit direction ax. */
function rootAxis(ev, s) {
  const A = ev.anat, g = ev.g;
  const q = ev.toPlane(A.point('av', 0, s), g), r = A.aorticRoot;
  const ax = unit([r.dot(g.r), r.dot(g.d)]);
  return { P0: [q[0], q[1]], ax };
}

/** n square to direction d on the plane, pointing away from the probe (deeper). */
const across = (d) => { const n = [-d[1], d[0]]; return n[1] < 0 ? mul(n, -1) : n; };

/**
 * The chords across the aorta square to the root's axis, from 0.3 cm above the valve's centre up
 * to hMax, every 0.1 cm: { h, C, n, a0, a, b, b1 } (C on the axis, n square to it, away from the
 * probe), or [] when the plane shows no lumen there. The root and the proximal ascending aorta
 * run straight in this model (the centre line lies within 0.4 cm of the root's axis to 4.4 cm).
 */
export function chords(ev, s = 0, hMax = 6) {
  if (!ev || !ev.last) return [];
  const loops = ev.last.tissue.filter((L) => L.closed && L.pts.length > 2);
  const { P0, ax } = rootAxis(ev, s);
  const n = across(ax), out = [];
  for (let h = 0.3; h <= hMax + 1e-9; h += 0.1) {
    const C = add(P0, mul(ax, h));
    if (depthAt(loops, C) % 2) break;   // the axis ran into a wall
    const c = chordAt(loops, C, n);
    if (!c) break;
    out.push({ h, C, n, ...c });
  }
  return out;
}
export const midline = chords;

/**
 * A caliper from a chord: L-L and I-I (cm) and their ends on the plane. The anterior wall's leading
 * edge lies its thickness before the lumen. Where that wall touches another structure (the RV
 * outflow tract's wall), the interval on the chord is thicker than 0.45 cm, and the wall's own
 * thickness elsewhere on the root (tWall) stands for it.
 */
function caliperOf(m, tWall) {
  const at = (t) => add(m.C, mul(m.n, t));
  const t = m.a - m.a0 <= WALL_MAX ? m.a - m.a0 : tWall;
  return { h: m.h, ll: m.b - m.a + t, ii: m.b - m.a, ll0: at(m.a - t), ll1: at(m.b), ii0: at(m.a), ii1: at(m.b), wall: t };
}
const WALL_MAX = 0.45;
/** The chord of M at the level h (linear between the two round it), or null. */
function sampleAt(M, h) {
  for (let i = 1; i < M.length; i++) {
    if (M[i].h < h) continue;
    const A = M[i - 1], B = M[i], f = (h - A.h) / (B.h - A.h || 1);
    const lerp = (x, y) => x + (y - x) * f;
    return { h, C: [lerp(A.C[0], B.C[0]), lerp(A.C[1], B.C[1])], n: A.n, a0: lerp(A.a0, B.a0), a: lerp(A.a, B.a), b: lerp(A.b, B.b), b1: lerp(A.b1, B.b1) };
  }
  return null;
}

/**
 * The three end-diastolic calipers of the root and the ascending aorta on the current frame of ev
 * (a long-axis view through the root): { sinus, stj, asc }, each { h, ll, ii, ll0, ll1, ii0, ii1 }
 * or null where the plane does not show it.
 */
export function rootCalipers(ev, s = 0) {
  const M = chords(ev, s, LEVEL.stj + LEVEL.asc + 0.3);
  if (M.length < 5) return { sinus: null, stj: null, asc: null };
  // the anterior wall's own thickness: the median of the chords where it stands alone
  const own = M.map((m) => m.a - m.a0).filter((t) => t <= WALL_MAX).sort((x, y) => x - y);
  const tWall = own.length ? own[Math.floor(own.length / 2)] : 0.3;
  let best = null;
  for (const m of M) {
    if (m.h < LEVEL.sinus[0] || m.h > LEVEL.sinus[1]) continue;
    const c = caliperOf(m, tWall);
    if (!best || c.ll > best.ll) best = c;
  }
  const j = sampleAt(M, LEVEL.stj), a = sampleAt(M, LEVEL.stj + LEVEL.asc);
  return { sinus: best, stj: j ? caliperOf(j, tWall) : null, asc: a ? caliperOf(a, tWall) : null };
}

/**
 * The annulus on the current frame of ev at systolic weight s (midsystole), as Lang 2015 (Figure
 * 12) has it on the long axis: from the hinge point of the right coronary cusp, the one the plane
 * shows, square to the root's axis across to the inner edge of the opposite wall. The hinge point:
 * the lowest point of the aortic valve's section on the anterior side of the axis. Without it, the
 * chord at the level of the cusps' hinge ring (hingeOf: gl/prostheticmesh.js annulusOf).
 */
export function annulusCaliper(ev, s, hingeOf) {
  if (!ev || !ev.last) return null;
  const loops = ev.last.tissue.filter((L) => L.closed && L.pts.length > 2);
  const { P0, ax } = rootAxis(ev, s);
  const n = across(ax);
  let hinge = null;
  for (const L of ev.last.valves) {
    if (L.valve !== 'AorticValve') continue;
    for (const p of L.pts) {
      const d = sub(p, P0), h = dot(d, ax), w = dot(d, n);
      if (w < 0 && (!hinge || h < hinge.h)) hinge = { h, w, p };
    }
  }
  let C, a;
  if (hinge) {
    C = hinge.p;
    a = 0;
  } else {
    const A = hingeOf(ev, s);
    if (!A) return null;
    const q = ev.toPlane(ev.anat.point('av', 0, s).clone().set(A.C[0], A.C[1], A.C[2]), ev.g);
    C = add(P0, mul(ax, dot(sub([q[0], q[1]], P0), ax)));
    const h = crossings(loops, C, n, 4.5).filter((t) => t < -1e-6);
    if (!h.length) return null;
    a = h[h.length - 1];
  }
  // the posterior wall's inner face: the first crossing past the root's axis
  const axisAt = dot(sub(add(P0, mul(ax, dot(sub(C, P0), ax))), C), n);
  const b = crossings(loops, C, n, 4.5).filter((t) => t > Math.max(a, axisAt) + 1e-6)[0];
  if (b === undefined) return null;
  const at = (t) => add(C, mul(n, t));
  return { h: dot(sub(C, P0), ax), ii: b - a, ii0: at(a), ii1: at(b), hinge: !!hinge };
}

// ---------------------------------------------------------------- coarctation
// The suprasternal view of the arch is the plane through the ascending aorta, the top of the arch
// and the descending aorta (echo.js viewGeometry 'ssn'). The descending aorta's centre line lies
// about 0.6 cm behind that plane, so the chapter moves the plane along its normal onto the
// isthmus's middle (gl/aortamesh.js), and the plane cuts the narrowing through its axis.

/** The shift (cm, along the plane's normal) that brings the isthmus's middle C (world) onto plane g0. */
export function shiftOnto(g0, C) {
  return C.clone().sub(g0.O).dot(g0.n);
}

/**
 * The narrowest lumen at the isthmus on the current frame of ev: chords square to the isthmus's
 * axis on the plane, every 0.05 cm from 1.0 cm before its middle to 1.0 cm after, I-I between the
 * walls' inner faces. ist: { C, t } (world). { d, p0, p1, tau, C, n, ax } or null.
 */
export function coaCaliper(ev, ist) {
  if (!ev || !ev.last || !ist) return null;
  const loops = ev.last.tissue.filter((L) => L.closed && L.pts.length > 2);
  const g = ev.g, q = ev.toPlane(ist.C, g);
  const ax = unit([ist.t.dot(g.r), ist.t.dot(g.d)]);
  const n = across(ax);
  let best = null;
  for (let tau = -1.0; tau <= 1.0 + 1e-9; tau += 0.05) {
    const C = add([q[0], q[1]], mul(ax, tau));
    if (depthAt(loops, C) % 2) continue;
    const h = crossings(loops, C, n, 3);
    const after = h.filter((t) => t > 1e-6), before = h.filter((t) => t < -1e-6);
    if (!after.length || !before.length) continue;
    const a = before[before.length - 1], b = after[0];
    if (!best || b - a < best.d) best = { d: b - a, p0: add(C, mul(n, a)), p1: add(C, mul(n, b)), tau, C, n, ax };
  }
  return best;
}

/**
 * The abdominal aorta's lumen on the subcostal view, at its upper end, below the diaphragm: I-I on
 * the line square to the tube, 1.5 cm below the end of its section. The tube's wall is drawn
 * 0.28 cm wide over its surface (echo.js), so the lumen shows 0.28 cm narrower than the tube.
 * { d, p0, p1, C, n, dir } or null.
 */
export function diaphragmCaliper(ev) {
  const md = ev && ev.abd && ev.abd.aorta;
  if (!md || !ev.g) return null;
  const loops = md.section(ev.g).filter((L) => L.closed && L.pts.length > 2);
  if (!loops.length) return null;
  const P = loops.sort((x, y) => y.pts.length - x.pts.length)[0].pts;
  const m = mul(P.reduce((acc, p) => add(acc, p), [0, 0]), 1 / P.length);
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of P) { const d = sub(p, m); sxx += d[0] * d[0]; sxy += d[0] * d[1]; syy += d[1] * d[1]; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // the tube's long axis on the plane, toward the head (screen-right in this view)
  let dir = [Math.cos(th), Math.sin(th)];
  if (dir[0] < 0) dir = mul(dir, -1);
  let end = -Infinity;
  for (const p of P) end = Math.max(end, dot(sub(p, m), dir));
  const C = add(m, mul(dir, end - 1.5)), n = across(dir);
  const h = crossings([{ closed: true, pts: P }], C, n, 3);
  const after = h.filter((t) => t > 1e-6), before = h.filter((t) => t < -1e-6);
  if (!after.length || !before.length) return null;
  const a = before[before.length - 1] + 0.14, b = after[0] - 0.14;
  return { d: b - a, p0: add(C, mul(n, a)), p1: add(C, mul(n, b)), C, n, dir };
}

// ---------------------------------------------------------------- the tables
// Measured on each heart (the checks): at each point of a grid of the aoRoot and aoAsc weights,
// GRID x GRID ([aoRoot][aoAsc]), the end-diastolic L-L (cm) at the sinuses, the STJ and the
// ascending aorta on the zoomed long axis (plax_root), as rootCalipers reads them; and the
// annulus I-I at midsystole (211 ms), the same at every point of a coarser grid (0.25). The
// coarctation: the narrowest lumen at the isthmus (coaCaliper) against the aoCoa weight, 0 to 1
// in steps of 0.05, the same on every heart and at end-diastole and midsystole; and the abdominal
// aorta below the diaphragm (diaphragmCaliper).
export const GRID = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5];
export const ROOT = {
  normal: {
    ann: 2.485,
    sin: [
      [3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505, 3.505],
      [3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751],
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249, 4.249],
      [4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498, 4.498],
      [4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747, 4.747],
      [4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996, 4.996],
      [5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245, 5.245],
      [5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494, 5.494],
      [5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743, 5.743],
      [5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992, 5.992],
      [6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24],
      [6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489, 6.489],
    ],
    stj: [
      [2.998, 3.144, 3.287, 3.429, 3.568, 3.706, 3.842, 3.975, 4.106, 4.235, 4.361, 4.484, 4.673],
      [3.007, 3.153, 3.296, 3.437, 3.576, 3.715, 3.85, 3.984, 4.115, 4.244, 4.37, 4.538, 4.686],
      [3.016, 3.161, 3.304, 3.445, 3.585, 3.723, 3.859, 3.993, 4.125, 4.253, 4.38, 4.55, 4.699],
      [3.025, 3.17, 3.313, 3.454, 3.594, 3.732, 3.868, 4.002, 4.134, 4.263, 4.389, 4.563, 4.711],
      [3.034, 3.178, 3.321, 3.462, 3.602, 3.741, 3.877, 4.011, 4.143, 4.272, 4.399, 4.576, 4.724],
      [3.043, 3.187, 3.33, 3.47, 3.611, 3.749, 3.886, 4.02, 4.152, 4.282, 4.409, 4.589, 4.737],
      [3.051, 3.196, 3.338, 3.479, 3.62, 3.758, 3.895, 4.03, 4.162, 4.292, 4.452, 4.602, 4.749],
      [3.06, 3.204, 3.347, 3.487, 3.628, 3.767, 3.904, 4.039, 4.171, 4.301, 4.464, 4.614, 4.762],
      [3.069, 3.213, 3.355, 3.496, 3.637, 3.776, 3.913, 4.048, 4.181, 4.311, 4.477, 4.627, 4.774],
      [3.078, 3.222, 3.364, 3.505, 3.646, 3.785, 3.923, 4.058, 4.191, 4.321, 4.49, 4.64, 4.787],
      [3.087, 3.23, 3.372, 3.514, 3.655, 3.795, 3.932, 4.067, 4.2, 4.331, 4.502, 4.653, 4.799],
      [3.095, 3.239, 3.381, 3.523, 3.664, 3.804, 3.942, 4.077, 4.21, 4.341, 4.515, 4.665, 4.812],
      [3.104, 3.248, 3.389, 3.532, 3.673, 3.813, 3.951, 4.087, 4.22, 4.375, 4.528, 4.678, 4.824],
    ],
    asc: [
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
      [2.939, 3.197, 3.452, 3.704, 3.957, 4.209, 4.461, 4.714, 4.967, 5.219, 5.472, 5.725, 5.978],
    ],
  },
  amyloid: {
    ann: 2.312,
    sin: [
      [3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508, 3.508],
      [3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751, 3.751],
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248, 4.248],
      [4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496, 4.496],
      [4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745, 4.745],
      [4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993, 4.993],
      [5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242, 5.242],
      [5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49, 5.49],
      [5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739, 5.739],
      [5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987, 5.987],
      [6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236, 6.236],
      [6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485, 6.485],
    ],
    stj: [
      [3.011, 3.146, 3.282, 3.418, 3.553, 3.688, 3.823, 3.957, 4.09, 4.222, 4.353, 4.483, 4.612],
      [3.003, 3.136, 3.272, 3.408, 3.543, 3.678, 3.813, 3.947, 4.08, 4.212, 4.343, 4.473, 4.602],
      [2.991, 3.127, 3.253, 3.388, 3.523, 3.658, 3.793, 3.927, 4.06, 4.192, 4.323, 4.453, 4.582],
      [2.972, 3.106, 3.242, 3.368, 3.503, 3.638, 3.773, 3.907, 4.04, 4.172, 4.303, 4.433, 4.562],
      [2.983, 3.118, 3.253, 3.376, 3.509, 3.641, 3.775, 3.91, 4.044, 4.177, 4.31, 4.441, 4.57],
      [2.987, 3.122, 3.254, 3.382, 3.517, 3.651, 3.785, 3.92, 4.053, 4.186, 4.317, 4.447, 4.576],
      [2.993, 3.126, 3.259, 3.391, 3.524, 3.66, 3.794, 3.926, 4.059, 4.191, 4.322, 4.453, 4.58],
      [3.003, 3.136, 3.269, 3.401, 3.534, 3.67, 3.804, 3.936, 4.069, 4.202, 4.333, 4.463, 4.59],
      [3.014, 3.146, 3.279, 3.412, 3.544, 3.68, 3.814, 3.947, 4.08, 4.212, 4.343, 4.473, 4.601],
      [3.018, 3.15, 3.283, 3.418, 3.553, 3.688, 3.823, 3.957, 4.09, 4.222, 4.353, 4.484, 4.61],
      [3.028, 3.16, 3.293, 3.428, 3.563, 3.698, 3.833, 3.967, 4.1, 4.232, 4.364, 4.494, 4.62],
      [3.038, 3.17, 3.303, 3.438, 3.573, 3.708, 3.843, 3.977, 4.11, 4.242, 4.374, 4.504, 4.63],
      [3.048, 3.18, 3.313, 3.448, 3.583, 3.718, 3.853, 3.987, 4.12, 4.253, 4.384, 4.514, 4.64],
    ],
    asc: [
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
      [2.938, 3.195, 3.449, 3.702, 3.955, 4.208, 4.461, 4.714, 4.967, 5.22, 5.473, 5.727, 5.979],
    ],
  },
  icm: {
    ann: 2.426,
    sin: [
      [3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769, 3.769],
      [3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99, 3.99],
      [4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238, 4.238],
      [4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486, 4.486],
      [4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734, 4.734],
      [4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981],
      [5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229, 5.229],
      [5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477, 5.477],
      [5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725, 5.725],
      [5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973, 5.973],
      [6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221, 6.221],
      [6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468, 6.468],
      [6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714, 6.714],
    ],
    stj: [
      [3.067, 3.248, 3.427, 3.602, 3.773, 3.941, 4.106, 4.268, 4.427, 4.582, 4.736, 4.888, 5.037],
      [3.067, 3.249, 3.428, 3.603, 3.774, 3.942, 4.108, 4.27, 4.428, 4.584, 4.738, 4.89, 5.039],
      [3.068, 3.25, 3.429, 3.604, 3.775, 3.944, 4.109, 4.271, 4.43, 4.585, 4.739, 4.892, 5.041],
      [3.069, 3.251, 3.43, 3.605, 3.777, 3.945, 4.111, 4.273, 4.431, 4.587, 4.741, 4.894, 5.043],
      [3.07, 3.252, 3.431, 3.606, 3.778, 3.946, 4.112, 4.274, 4.433, 4.589, 4.743, 4.896, 5.045],
      [3.07, 3.253, 3.432, 3.607, 3.779, 3.948, 4.113, 4.276, 4.434, 4.59, 4.745, 4.897, 5.047],
      [3.071, 3.254, 3.433, 3.608, 3.78, 3.949, 4.115, 4.277, 4.436, 4.592, 4.747, 4.899, 5.049],
      [3.072, 3.255, 3.434, 3.61, 3.782, 3.95, 4.116, 4.279, 4.438, 4.594, 4.749, 4.902, 5.051],
      [3.073, 3.256, 3.435, 3.611, 3.783, 3.952, 4.118, 4.28, 4.439, 4.595, 4.75, 4.904, 5.053],
      [3.073, 3.256, 3.436, 3.612, 3.784, 3.953, 4.119, 4.282, 4.441, 4.597, 4.753, 4.906, 5.056],
      [3.074, 3.257, 3.437, 3.613, 3.785, 3.955, 4.121, 4.284, 4.443, 4.599, 4.754, 4.908, 5.058],
      [3.075, 3.258, 3.438, 3.614, 3.787, 3.956, 4.122, 4.285, 4.444, 4.601, 4.756, 4.91, 5.06],
      [3.076, 3.259, 3.439, 3.615, 3.788, 3.957, 4.124, 4.287, 4.446, 4.602, 4.758, 4.912, 5.062],
    ],
    asc: [
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
      [2.954, 3.21, 3.464, 3.716, 3.969, 4.222, 4.474, 4.727, 4.98, 5.233, 5.486, 5.739, 5.992],
    ],
  },
  barlow: {
    ann: 3.135,
    sin: [
      [3.768, 3.768, 3.768, 3.768, 3.768, 3.768, 3.768, 3.768, 3.768, 3.773, 3.85, 3.929, 4.008],
      [3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.916, 3.967, 4.046],
      [4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096, 4.096],
      [4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258, 4.258],
      [4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487, 4.487],
      [4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658, 4.658],
      [4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805, 4.805],
      [4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981, 4.981],
      [5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196, 5.196],
      [5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411, 5.411],
      [5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628, 5.628],
      [5.634, 5.635, 5.633, 5.63, 5.628, 5.627, 5.627, 5.628, 5.628, 5.629, 5.631, 5.633, 5.634],
      [5.844, 5.845, 5.843, 5.84, 5.839, 5.838, 5.837, 5.838, 5.838, 5.84, 5.841, 5.842, 5.843],
    ],
    stj: [
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
      [3.018, 3.244, 3.471, 3.698, 3.926, 4.156, 4.387, 4.62, 4.855, 5.091, 5.328, 5.567, 5.808],
    ],
    asc: [
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
      [2.971, 3.227, 3.482, 3.736, 3.99, 4.244, 4.498, 4.751, 5.003, 5.255, 5.505, 5.756, 6.007],
    ],
  },
  bav: {
    ann: 2.283,
    sin: [
      [3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54],
      [3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784, 3.784],
      [4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028, 4.028],
      [4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272, 4.272],
      [4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516, 4.516],
      [4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759, 4.759],
      [5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003, 5.003],
      [5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25],
      [5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498, 5.498],
      [5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745, 5.745],
      [5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993, 5.993],
      [6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24, 6.24],
      [6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487, 6.487],
    ],
    stj: [
      [3.714, 3.856, 3.997, 4.135, 4.271, 4.405, 4.537, 4.667, 4.794, 4.97, 5.117, 5.263, 5.407],
      [3.722, 3.864, 4.005, 4.143, 4.28, 4.414, 4.546, 4.676, 4.803, 4.982, 5.13, 5.276, 5.42],
      [3.73, 3.873, 4.013, 4.152, 4.288, 4.423, 4.555, 4.685, 4.812, 4.994, 5.142, 5.288, 5.432],
      [3.739, 3.881, 4.021, 4.16, 4.297, 4.431, 4.564, 4.694, 4.822, 5.006, 5.154, 5.3, 5.444],
      [3.747, 3.889, 4.03, 4.168, 4.305, 4.44, 4.573, 4.703, 4.831, 5.018, 5.166, 5.312, 5.456],
      [3.756, 3.898, 4.038, 4.177, 4.314, 4.449, 4.582, 4.713, 4.881, 5.03, 5.178, 5.324, 5.468],
      [3.764, 3.906, 4.046, 4.186, 4.323, 4.458, 4.591, 4.722, 4.893, 5.043, 5.191, 5.337, 5.48],
      [3.773, 3.914, 4.055, 4.194, 4.332, 4.467, 4.6, 4.731, 4.905, 5.055, 5.203, 5.349, 5.492],
      [3.781, 3.923, 4.064, 4.203, 4.341, 4.476, 4.61, 4.741, 4.917, 5.067, 5.215, 5.361, 5.504],
      [3.79, 3.931, 4.072, 4.212, 4.35, 4.485, 4.619, 4.75, 4.929, 5.079, 5.227, 5.373, 5.516],
      [3.798, 3.94, 4.081, 4.221, 4.359, 4.495, 4.628, 4.789, 4.941, 5.091, 5.24, 5.385, 5.365],
      [3.807, 3.948, 4.09, 4.23, 4.368, 4.504, 4.638, 4.801, 4.953, 5.103, 5.252, 5.397, 5.385],
      [3.815, 3.957, 4.098, 4.239, 4.377, 4.513, 4.647, 4.813, 4.965, 5.115, 5.264, 5.409, 5.393],
    ],
    asc: [
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
      [3.754, 4.006, 4.255, 4.503, 4.752, 5.001, 5.25, 5.5, 5.75, 6, 6.251, 6.502, 6.753],
    ],
  },
};
export const COA = { step: 0.05, d: [2.366, 2.32, 2.242, 2.154, 2.056, 1.958, 1.859, 1.76, 1.662, 1.563, 1.465, 1.366, 1.268, 1.169, 1.071, 0.972, 0.873, 0.775, 0.676, 0.578, 0.48], diaphragm: 1.865 };

// ---------------------------------------------------------------- inverting the tables
const STEP = GRID[1] - GRID[0], LAST = GRID.length - 1;
/** Table T (GRID x GRID) at the weights (wr, wa): bilinear between its points. */
function lerp2(T, wr, wa) {
  const x = Math.min(LAST, Math.max(0, wr / STEP)), y = Math.min(LAST, Math.max(0, wa / STEP));
  const i = Math.min(LAST - 1, Math.floor(x)), j = Math.min(LAST - 1, Math.floor(y)), u = x - i, v = y - j;
  return (T[i][j] * (1 - u) + T[i + 1][j] * u) * (1 - v) + (T[i][j + 1] * (1 - u) + T[i + 1][j + 1] * u) * v;
}
/** The w in [0, wMax] at which f, rising, reaches y: 0 when y is below f(0), wMax above f(wMax). */
function rise(f, y, wMax) {
  if (y <= f(0)) return 0;
  if (y >= f(wMax)) return wMax;
  let a = 0, b = wMax;
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (f(m) < y) a = m; else b = m; }
  return (a + b) / 2;
}

/**
 * The weights of aoRoot and aoAsc on heart that make the image's L-L at the sinuses sin and at
 * the ascending aorta asc (cm), as near as the image allows, and what the image then measures:
 * { wr, wa, sin, stj, asc, ann }. A size below the heart's own leaves its weight at 0, and the
 * image shows the heart's own. The sinuses depend on aoRoot and the ascending aorta on aoAsc
 * alone, but for the Barlow heart's sinuses at the largest aoAsc: two rounds settle both.
 */
export function rootFor(heart, sin, asc) {
  const T = ROOT[heart] || ROOT.normal, wMax = GRID[LAST];
  let wr = 0, wa = 0;
  for (let k = 0; k < 4; k++) {
    wr = rise((w) => lerp2(T.sin, w, wa), sin, wMax);
    wa = rise((w) => lerp2(T.asc, wr, w), asc, wMax);
  }
  return { wr, wa, sin: lerp2(T.sin, wr, wa), stj: lerp2(T.stj, wr, wa), asc: lerp2(T.asc, wr, wa), ann: T.ann };
}

/** The aoCoa weight that narrows the isthmus's lumen to d (cm), and the lumen the image then shows: { w, d }. */
export function coaFor(d) {
  const n = COA.d.length - 1, wMax = n * COA.step;
  const f = (w) => {
    const x = Math.min(n, Math.max(0, w / COA.step)), i = Math.min(n - 1, Math.floor(x)), u = x - i;
    return COA.d[i] * (1 - u) + COA.d[i + 1] * u;
  };
  const w = rise((x) => -f(x), -d, wMax);
  return { w, d: f(w) };
}
