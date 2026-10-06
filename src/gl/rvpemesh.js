// Acute pulmonary embolism in chapter 13 (load 'pe'): the RV free wall's systolic motion by level,
// from the base to the apex, for McConnell's sign. Lengths in cm.
//
// Each myocardium vertex has a level along the RV: 0 at the tricuspid annulus and 1 at the RV apex.
// The level comes from the vertex's height on the LV's long axis in the normal mesh. The annulus is
// the tricuspid valve's landmark, 8.6 cm above the epicardial apex. The apex is the lowest vertex
// of the RV free wall (rvMask above 0.5), 2.5 cm above it. The chapter gives the free wall's
// motion as a share of the heart's own at the middles of the basal, mid and apical thirds. A
// vertex takes the share of its third, with a smooth change across each border. echo.js setRvSys
// scales the free wall's systolic targets by these shares (its argument reg). For the other loads
// it scales them by one share, k. The RV outflow tract, above the annulus, takes the basal share.
//
// freeWall measures the motion on a view cut from the mesh: the RV-focused four-chamber view. The
// RV's long axis runs from the middle of the tricuspid hinges to the RV apex. Lines square to it
// meet the free wall's endocardium on the lateral side. Each point found there carries its place
// at end-diastole: the section's ref, the same wall in the rest shape. That place gives its level
// at end-diastole, from its height on the LV's long axis. The height runs between the tricuspid
// valve's landmark and the lowest point of the RV free wall of the heart shown. wallLevels takes
// the points at the middles of the three thirds. A level's inward motion is its wall's move from
// end-diastole along the wall's inward normal. The centerline method measures the border's move
// square to the border in the same way. The same wall is followed, so the valve's own travel
// (TAPSE) does not count as wall motion.
import { loadModel, rvMask } from '../model3d.js';
import { hingesOf, onPlane, blood, cavity, middle, sub, add, mul, dot, len, unit, perp } from '../meshjet.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The middles of the basal, mid and apical thirds, as levels from the annulus (0) to the apex (1). */
export const LEVELS = [1 / 6, 1 / 2, 5 / 6];
// the change between two thirds spreads over this share of the RV's length on each side of the border
const SOFT = 0.07;

let levelsP = null, MASK = null;
/** Each myocardium vertex's level along the RV, 0 the tricuspid annulus to 1 the RV apex (normal mesh). */
export function rvLevels() {
  if (!levelsP) {
    levelsP = (async () => {
      const m = await loadModel();
      const mask = await rvMask();
      MASK = mask;
      const A = m.anat, Z = A.axis, apex = A.raw('apex_epi', 0, 0);
      const pos = m.heart.meshes.Myocardium.geometry.attributes.position.array, n = pos.length / 3;
      const h = new Float32Array(n);
      let lo = Infinity;
      for (let i = 0; i < n; i++) {
        h[i] = (pos[3 * i] - apex.x) * Z.x + (pos[3 * i + 1] - apex.y) * Z.y + (pos[3 * i + 2] - apex.z) * Z.z;
        if (mask[i] > 0.5) lo = Math.min(lo, h[i]);
      }
      const tv = A.raw('tv', 0, 0), hTv = (tv.x - apex.x) * Z.x + (tv.y - apex.y) * Z.y + (tv.z - apex.z) * Z.z;
      const t = new Float32Array(n);
      for (let i = 0; i < n; i++) t[i] = Math.min(1, Math.max(0, (hTv - h[i]) / (hTv - lo)));
      return t;
    })();
  }
  return levelsP;
}

/** The share of the heart's own motion at level t, from the shares b, m and a of the three thirds. */
export function shareAt(t, b, m, a) {
  return b + (m - b) * smooth((t - 1 / 3 + SOFT) / (2 * SOFT)) + (a - m) * smooth((t - 2 / 3 + SOFT) / (2 * SOFT));
}

const made = new Map();
/**
 * The free wall's motion share at every myocardium vertex, for the shares [b, m, a] of the basal,
 * mid and apical thirds (levels from rvLevels). echo.js setRvSys takes it as reg. The last few
 * arrays are kept, so a frame that asks again gets the same array. The view then does not cut the
 * heart again.
 */
export function rvShares(levels, b, m, a) {
  const [rb, rm, ra] = [b, m, a].map((x) => Math.round(x * 1000) / 1000), key = `${rb}|${rm}|${ra}`;
  let S = made.get(key);
  if (!S) {
    S = new Float32Array(levels.length);
    for (let i = 0; i < S.length; i++) S[i] = shareAt(levels[i], rb, rm, ra);
    made.set(key, S);
    if (made.size > 8) made.delete(made.keys().next().value);
  }
  return { key, S };
}

/**
 * Where the ray from C along dir first meets a wall loop of the section, or null. It returns
 * { t, P, P0, e0 }: P0 is the same wall's place at end-diastole (the loop's ref). e0 is the wall's
 * direction there.
 */
function hitOf(C, dir, loops) {
  let best = null;
  for (const W of loops) {
    const P = W.pts, R = W.ref, k = P.length;
    for (let i = 0; i < k - 1 + (W.closed ? 1 : 0); i++) {
      const a = P[i], b = P[(i + 1) % k], e = sub(b, a), den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, C);
      const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && (!best || t < best.t)) {
        const ra = R ? R[i] : a, rb = R ? R[(i + 1) % k] : b;
        best = { t, P: add(C, mul(dir, t)), P0: add(ra, mul(sub(rb, ra), u)), e0: sub(rb, ra) };
      }
    }
  }
  return best;
}
function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

let span = null;
/**
 * The RV's span on the LV's long axis at end-diastole, on the heart shown. It runs from the
 * tricuspid valve's landmark to the lowest point of the RV free wall (rvMask above 0.5), in the
 * rest shape.
 */
function spanOf(ev) {
  const key = `${ev.pv}|${ev.dVer || 0}`;
  if (span && span.key === key && span.ev === ev) return span;
  const Z = ev.anat.axis, rest = ev.myo.rest, tv = ev.anchors(0).tv;
  let lo = Infinity;
  for (let i = 0; i < MASK.length; i++) if (MASK[i] > 0.5) lo = Math.min(lo, rest[3 * i] * Z.x + rest[3 * i + 1] * Z.y + rest[3 * i + 2] * Z.z);
  span = { key, ev, Z, hT: tv.x * Z.x + tv.y * Z.y + tv.z * Z.z, hA: lo };
  return span;
}

/**
 * The RV free wall on the RV-focused four-chamber view, after ev.frame() at systolic weight s.
 * It returns { M, A, u, side, hinge, L, hits } in plane cm. M is the middle of the tricuspid
 * hinges. A is the RV apex: the RV's blood farthest from M toward the apex. u is the unit axis
 * from M to A, L cm long. side is the unit normal to u toward the lateral hinge, out through the
 * free wall. hinge is the lateral hinge. hits lie on lines square to the axis. The lines run from
 * 45% of the axis's length above M to 98% of the way down it. Each hit gives the free wall's
 * endocardium P, its place at end-diastole P0 and its level then. The level is 0 at the annulus
 * and 1 at the apex. Each hit also gives the wall's inward normal at end-diastole, n0. The lines
 * start above M because the valve travels more than the wall next to it (meshcal.js RV_TAPSE).
 * In systole the basal wall lies beside the RA. The RV's blood is the union of the cavity traces
 * from starts 1.5, 2.5 and 3.5 cm from M and at the RV landmark. The chapter's FAC is traced the
 * same way. It returns null before rvLevels resolves, or when the plane misses the valve.
 */
export function freeWall(ev, s, n = 72) {
  const h = MASK && hingesOf(ev, 'TricuspidValve');
  if (!h) return null;
  const M = middle(h), an = ev.anchors(s), apex = onPlane(ev, an.apex), lv = onPlane(ev, an.lv);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(apex, M), nrm) < 0) nrm = mul(nrm, -1);
  const polys = [];
  for (const p of [add(M, mul(nrm, 1.5)), onPlane(ev, an.rv), add(M, mul(nrm, 2.5)), add(M, mul(nrm, 3.5))]) {
    const b = blood(ev, p);
    if (dot(sub(b, M), nrm) < 0.3) continue;
    if (polys.length && !polys.some((P) => inside(P, b[0], b[1]))) continue;
    const P = cavity(ev, b, [h]);
    if (P.length > 8) polys.push(P);
  }
  if (!polys.length) return null;
  let A = null, far = -Infinity;
  for (const P of polys) for (const p of P) { const d = dot(sub(p, M), nrm); if (d > far) { far = d; A = p; } }
  const L = len(sub(A, M)), u = unit(sub(A, M));
  // the lateral hinge: the one farther from the LV
  const hinge = len(sub(h[0], lv)) > len(sub(h[1], lv)) ? h[0] : h[1];
  let side = perp(u);
  if (dot(sub(hinge, M), side) < 0) side = mul(side, -1);
  const S = spanOf(ev), g = ev.g, loops = ev.last.tissue.filter((W) => W.pts.length > 1);
  const closed = loops.filter((W) => W.closed && W.pts.length > 2).map((W) => W.pts);
  const hits = [];
  for (let k = 0; k <= n; k++) {
    const f = -0.45 + (1.43 * k) / n, Q = add(M, mul(u, f * L));
    if (closed.reduce((c, P) => (inside(P, Q[0], Q[1]) ? c + 1 : c), 0) % 2) continue;   // the axis runs in a wall here
    const H = hitOf(Q, side, loops);
    if (!H) continue;
    // the wall's level at end-diastole, from its height on the LV's long axis
    const x = g.O.x + H.P0[0] * g.r.x + H.P0[1] * g.d.x, y = g.O.y + H.P0[0] * g.r.y + H.P0[1] * g.d.y, z = g.O.z + H.P0[0] * g.r.z + H.P0[1] * g.d.z;
    const t = (S.hT - (x * S.Z.x + y * S.Z.y + z * S.Z.z)) / (S.hT - S.hA);
    let n0 = perp(unit(H.e0));
    if (dot(n0, side) > 0) n0 = mul(n0, -1);
    hits.push({ f, P: H.P, P0: H.P0, t, n0 });
  }
  return { M, A, u, side, hinge, L, hits };
}

/**
 * The free wall at the middles of its three thirds (LEVELS), from freeWall's hits. Each is
 * { t, P, P0, n0, inward }: the wall now and at end-diastole, its inward normal then, and its
 * inward motion since (cm). The motion is the move along the inward normal at end-diastole. The
 * centerline method measures it square to the border in the same way. A level that no hit
 * brackets is null.
 */
export function wallLevels(fw) {
  if (!fw) return LEVELS.map(() => null);
  return LEVELS.map((t) => {
    const H = fw.hits;
    for (let i = 1; i < H.length; i++) {
      const a = H[i - 1], b = H[i];
      if ((a.t - t) * (b.t - t) > 0 || a.t === b.t) continue;
      const w = (t - a.t) / (b.t - a.t);
      const P = add(a.P, mul(sub(b.P, a.P), w)), P0 = add(a.P0, mul(sub(b.P0, a.P0), w)), n0 = unit(add(mul(a.n0, 1 - w), mul(b.n0, w)));
      return { t, P, P0, n0, inward: dot(sub(P, P0), n0) };
    }
    return null;
  });
}
