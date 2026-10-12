// Valve hinges on the wall. The valve model sits in the heart model's annuli with gaps. The
// anterior arc of the mitral ring lies up to 1.5 cm below the junction of the LA and the aortic
// root, where the aortomitral curtain joins the anterior leaflet to the root. The tricuspid ring
// lies 1.0 to 1.7 cm inside the RA-RV junction across the anterior and posterior leaflets. The
// aortic cusps stop 1 to 5 mm short of their sinuses, and the pulmonary cusps about 1 mm. The
// valves and the walls also move apart in the beat: in systole the tricuspid ring descends about
// 1 cm farther than the RA-RV junction. A cut through a gap showed a leaflet loose in the cavity,
// its hinge on nothing.
//
// Two changes close the gaps. The tricuspid fit moves the tricuspid ring and its leaflets' bases
// out to the RA-RV junction where the ring lies far inside it (there the nearest atrial wall lies
// high on the RA wall, so a membrane to it would cross the atrium). The skirts then join each
// valve's hinge to the wall where a gap remains: a membrane. Round the valve's axis, each
// half-plane that holds the axis meets the hinge at one point (a station). At rest the skirt there
// runs to the nearest wall point of that half-plane (for a ring, one skirt to the atrial side of
// its annulus and one to the ventricular side). For the mitral valve's anterior arc this is the
// aortomitral curtain. A ring's skirts are wall: drawn as wall and as thick as the atrial wall
// (WALL). A cusp's skirt is the cusp's base: drawn as valve, thin. Each frame the station's wall
// point slides along the wall near that place (WIN either way) to the point nearest the hinge, so
// the skirt stays a short bridge as the valve and the wall move apart. A skirt keeps no shape of
// its own: its hinge edge takes the valve's place (the middle of the ring, or the outermost point
// of a cusp) and its wall edge a point of a wall triangle, so it holds through the beat, the
// burden, the heart shown and a chapter's targets, in the echo views (echo.js) and in the 3D model
// (heart.js). The leaflets do not change, so what the chapters measure on them stays.
import * as THREE from '../../vendor/three.bundle.min.js';
import { cycleAt } from '../cyclemodel.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

const STEP = 3;          // degrees between stations round the valve's axis
const KER = 4;           // degrees: a ring station is the weighted middle of the ring within this
const GAP = 0.04;        // cm: a gap wider than this, in any state, gets a skirt
const FAR = 2.0;         // cm: no skirt to a wall farther than this at rest
const ATRIAL = 0.3;      // cm: a ring's atrial wall point lies no more than this below the hinge, and its ventricular one no more than this above
const VMAX = 0.6;        // cm: a ring's ventricular skirt closes no wider gap at rest (the outflow tract stays open)
const NEAR = 5.0;        // cm: the wall triangles searched lie within this of the valve's centre
const THICK = 0.08;      // cm: a cusp's skirt's thickness (the cusp's own base, valve tissue)
// cm: a ring's skirts stand for the wall at the annulus, the aortomitral curtain on the mitral
// valve's anterior arc: they are drawn as wall (echo.js, heart.js), as thick as the atrial wall
// beside them (the model's LA wall: median 2.8 mm on 307 rays from the LA's centre; the RA: 3.2 mm)
const WALL = { MitralValve: 0.28, TricuspidValve: 0.32 };
const EMBED = 0.06;      // cm: the skirt's wall edge reaches this far into the wall
const SMOOTH = [1, 2, 3, 2, 1];   // the weights over neighbouring stations of the hinge-to-wall offsets each frame
const ALONG = 2;         // segments from the hinge to the wall
const JUMP = 0.35;       // cm: a wall point this far from its neighbours' offset is found again
const SPLIT = 0.9;       // cm: a skirt does not span two wall points this far apart (the left trigone spans less)
const WIN = 1.5;         // cm: a station's wall point slides along the wall up to this far either way of its place at rest
const SLACK = 0.5;       // cm: past its widest in the cycle (g) by more than this, and by more than STRETCH times g, a station's skirt shrinks to its hinge
const STRETCH = 1.6;     // (a disease heart's annulus lies farther from its wall than the model's own)
const HOLD = 1.0;        // cm: a skirt no longer than this always holds
const LET_GO = 0.3;      // cm: over which it shrinks
// the states in which a gap is looked for: times of the cycle (ms) at no burden and at full burden
const TIMES = [0, 100, 200, 300, 400, 500, 600, 700, 800];

/** Connected parts of an indexed mesh: a part number for each vertex. */
function parts(count, index) {
  const par = new Int32Array(count).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) { const a = f(index[t]); par[f(index[t + 1])] = a; par[f(index[t + 2])] = a; }
  const out = new Int32Array(count);
  for (let i = 0; i < count; i++) out[i] = f(i);
  return out;
}

/** The centre of points and their axis of least spread (unit). */
function leastAxis(pts) {
  const c = V3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const m = [0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const inv = new THREE.Matrix3().set(m[0], m[1], m[2], m[1], m[3], m[4], m[2], m[4], m[5]).invert();
  let v = V3(0.3, 0.5, 0.8).normalize();
  for (let k = 0; k < 60; k++) v = v.applyMatrix3(inv).normalize();
  return { c, n: v };
}

const at = (pos, i) => V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
/** A point given as weights on vertices: [[i, w], ...]. */
const sumOf = (pos, ws) => ws.reduce((p, [i, w]) => p.addScaledVector(at(pos, i), w), V3());
/** Weights on vertices with equal ids merged. */
function merged(ws) {
  const m = new Map();
  for (const [i, w] of ws) if (w) m.set(i, (m.get(i) || 0) + w);
  return [...m.entries()];
}

/**
 * Where plane (point O, normal n) cuts the triangles tris (start offsets into index) of positions
 * pos: segments, each end with its place on its edge (vertices a and b, u from a to b), as
 * weights on the triangle's vertices, and the edge's key (two triangles share their ends there).
 */
function cutTris(pos, index, tris, O, n) {
  const out = [];
  const sd = (i) => (pos[3 * i] - O.x) * n.x + (pos[3 * i + 1] - O.y) * n.y + (pos[3 * i + 2] - O.z) * n.z;
  for (const t of tris) {
    const v = [index[t], index[t + 1], index[t + 2]], s = v.map(sd);
    const ends = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      if ((s[a] > 0) === (s[b] > 0)) continue;
      const u = s[a] / (s[a] - s[b]), va = v[a], vb = v[b];
      ends.push({ p: at(pos, va).lerp(at(pos, vb), u), w: [[va, 1 - u], [vb, u]], a: va, b: vb, u, key: va < vb ? va * 2097152 + vb : vb * 2097152 + va });
    }
    if (ends.length === 2) { ends.tri = t; out.push(ends); }
  }
  return out;
}

/**
 * Where plane (point O, normal n) cuts the triangles tris, taken in order along a chain (each
 * shares an edge with the next): the chain's ends in order, flat [a, b, u, ...] (each on the edge
 * from vertex a to b, u of the way). The skirts keep a station's stretch of wall as its
 * triangles; this gives the same ends wherever the same triangles and plane are cut.
 */
function chainEnds(pos, index, tris, O, n) {
  const segs = tris.map((t) => cutTris(pos, index, [t], O, n)[0]).filter(Boolean);
  if (!segs.length) return [];
  const flat3 = (e) => [e.a, e.b, Math.round(e.u * 1000) / 1000];
  if (segs.length === 1) return [...flat3(segs[0][0]), ...flat3(segs[0][1])];
  const shared = (x, y) => x.find((e) => y.some((f) => f.key === e.key));
  const out = [];
  // the first triangle's end that the second does not share, then each shared end, then the last's other end
  const first = shared(segs[0], segs[1]);
  out.push(...flat3(segs[0].find((e) => e !== first) || segs[0][0]));
  for (let k = 0; k + 1 < segs.length; k++) out.push(...flat3(shared(segs[k], segs[k + 1]) || segs[k][1]));
  const last = shared(segs[segs.length - 1], segs[segs.length - 2]);
  out.push(...flat3(segs[segs.length - 1].find((e) => e !== last) || segs[segs.length - 1][1]));
  return out;
}

/** The point of the segments nearest T that passes test(p): { p, w (weights), d (to T), k (segment) }, or null. */
function nearestOn(segs, T, test) {
  let best = null, bd = Infinity;
  const p = V3();
  for (let k = 0; k < segs.length; k++) {
    const [e0, e1] = segs[k], a = e0.p, b = e1.p;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz || 1e-12;
    const u = Math.max(0, Math.min(1, ((T.x - a.x) * dx + (T.y - a.y) * dy + (T.z - a.z) * dz) / l2));
    p.set(a.x + u * dx, a.y + u * dy, a.z + u * dz);
    const d = p.distanceTo(T);
    if (d >= bd || !test(p)) continue;
    bd = d;
    best = { p: p.clone(), d, k, u };
  }
  if (!best) return null;
  const [e0, e1] = segs[best.k], u = best.u;
  best.w = merged([...e0.w.map(([i, w]) => [i, w * (1 - u)]), ...e1.w.map(([i, w]) => [i, w * u])]);
  return best;
}

/** The triangles of the wall within NEAR of C (start offsets into the index). */
function nearTris(pos, index, C) {
  const out = [];
  for (let t = 0; t < index.length; t += 3) {
    const i = index[t];
    if (Math.abs(pos[3 * i] - C.x) < NEAR && Math.abs(pos[3 * i + 1] - C.y) < NEAR && Math.abs(pos[3 * i + 2] - C.z) < NEAR) out.push(t);
  }
  return out;
}

/** Unit directions square to axis N: A0 toward ref (projected), and B0 = N x A0. */
function frame(N, C, ref) {
  const A0 = ref.clone().sub(C);
  A0.addScaledVector(N, -A0.dot(N));
  if (A0.lengthSq() < 1e-8) A0.copy(Math.abs(N.x) < 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).addScaledVector(N, -N.x);
  A0.normalize();
  return { A0, B0: N.clone().cross(A0) };
}
const unitAt = (A0, B0, deg) => { const a = (deg * Math.PI) / 180; return A0.clone().multiplyScalar(Math.cos(a)).addScaledVector(B0, Math.sin(a)); };

/**
 * The stations of an atrioventricular valve's ring (the valve mesh's smallest part): the ring's
 * middle every STEP degrees (weights on the ring's vertices), the ring tube's radius there, and
 * the outward direction U. toAtrium: a point in the atrium, so the axis N points into it; ref: a
 * point that sets the direction of 0 degrees.
 */
function ringStations(mesh, toAtrium, ref) {
  const g = mesh.geometry, pos = g.attributes.position.array, idx = g.index.array, n = pos.length / 3;
  const part = parts(n, idx), cnt = new Map();
  for (let i = 0; i < n; i++) cnt.set(part[i], (cnt.get(part[i]) || 0) + 1);
  const ring = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const ids = [];
  for (let i = 0; i < n; i++) if (part[i] === ring) ids.push(i);
  const { c: C, n: N } = leastAxis(ids.map((i) => at(pos, i)));
  if (N.dot(toAtrium.clone().sub(C)) < 0) N.negate();
  const { A0, B0 } = frame(N, C, ref);
  const ang = ids.map((i) => { const q = at(pos, i).sub(C); return (Math.atan2(q.dot(B0), q.dot(A0)) * 180) / Math.PI; });
  const out = [];
  for (let th = -180; th < 180; th += STEP) {
    const ws = [];
    ids.forEach((i, k) => {
      let d = Math.abs(ang[k] - th) % 360;
      if (d > 180) d = 360 - d;
      if (d < KER) ws.push([i, 1 - d / KER]);
    });
    const sw = ws.reduce((s, [, w]) => s + w, 0);
    if (!sw) { out.push(null); continue; }
    const hinge = ws.map(([i, w]) => [i, w / sw]);
    const H = sumOf(pos, hinge);
    const r = hinge.reduce((s, [i, w]) => s + w * at(pos, i).distanceTo(H), 0);
    out.push({ hinge, H, r, U: unitAt(A0, B0, th) });
  }
  return { C, N, A0, B0, stations: out, ring: new Set(ids), part, ringPart: ring };
}

/**
 * The stations of a semilunar valve: in each half-plane round axis Z through C, every STEP
 * degrees, the cusps' outermost point (their hinge on the sinus) in the shut shape (the mesh's
 * base), as weights on the two vertices of its edge.
 */
function cuspStations(mesh, C, Z) {
  const g = mesh.geometry, pos = g.attributes.position.array, idx = g.index.array;
  const all = [];
  for (let t = 0; t < idx.length; t += 3) all.push(t);
  const { A0, B0 } = frame(Z, C, C.clone().add(Math.abs(Z.x) < 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)));
  const B = buckets(pos, idx, all, C, A0, B0);
  const out = [];
  for (let th = -180, k = 0; th < 180; th += STEP, k++) {
    const U = unitAt(A0, B0, th);
    const segs = cutTris(pos, idx, B[k], C, Z.clone().cross(U));
    let best = null, rb = -1;
    for (const s of segs) for (const e of s) {
      const q = e.p.clone().sub(C);
      if (q.dot(U) <= 0) continue;
      const r = q.addScaledVector(Z, -q.dot(Z)).length();
      if (r > rb) { rb = r; best = e; }
    }
    out.push(best ? { hinge: best.w, H: best.p, r: THICK / 2, U } : null);
  }
  return { C, N: Z, A0, B0, stations: out };
}

/**
 * Triangles tris (start offsets into index) of positions pos in buckets by the angles they span
 * round the axis through C (frame A0, B0): one bucket for each station every STEP degrees, so a
 * station's half-plane cuts only its own bucket's triangles.
 */
function buckets(pos, index, tris, C, A0, B0) {
  const m = Math.round(360 / STEP), out = Array.from({ length: m }, () => []), deg = 180 / Math.PI;
  const a = [0, 0, 0];
  for (const t of tris) {
    let onAxis = false;
    for (let k = 0; k < 3; k++) {
      const i = index[t + k], x = pos[3 * i] - C.x, y = pos[3 * i + 1] - C.y, z = pos[3 * i + 2] - C.z;
      const u = x * A0.x + y * A0.y + z * A0.z, v = x * B0.x + y * B0.y + z * B0.z;
      if (u * u + v * v < 1e-4) onAxis = true;
      a[k] = Math.atan2(v, u) * deg;
    }
    a.sort((p, q) => p - q);
    // the shortest arc that holds the three angles: from the end of the widest gap between them
    const g0 = a[1] - a[0], g1 = a[2] - a[1], g2 = a[0] + 360 - a[2];
    const wide = g0 >= g1 && g0 >= g2 ? 0 : g1 >= g2 ? 1 : 2, gw = [g0, g1, g2][wide];
    if (onAxis || gw < 180) { for (const b of out) b.push(t); continue; }
    const from = a[(wide + 1) % 3], span = 360 - gw;
    for (let k = Math.ceil((from + 180) / STEP); k * STEP - 180 <= from + span; k++) out[((k % m) + m) % m].push(t);
  }
  return out;
}

/**
 * The wall's cut in each station's half-plane at rest: per station, the segments where the
 * half-plane meets the wall (Myocardium) within FAR + WIN of the hinge. The wall triangles go into
 * buckets by the angles they span round the axis first, so each half-plane cuts only its own.
 */
function wallCuts(R, myo) {
  const pos = myo.geometry.attributes.position.array, idx = myo.geometry.index.array;
  const B = buckets(pos, idx, nearTris(pos, idx, R.C), R.C, R.A0, R.B0), C = R.C;
  return R.stations.map((st, k) => {
    if (!st) return null;
    const segs = cutTris(pos, idx, B[k], C, R.N.clone().cross(st.U));
    return segs.filter(([e0, e1]) => Math.min(e0.p.distanceTo(st.H), e1.p.distanceTo(st.H)) < FAR + WIN && (e0.p.clone().sub(C).dot(st.U) > 0 || e1.p.clone().sub(C).dot(st.U) > 0));
  });
}

/** The side test of a ring's wall point p against hinge H on axis N (toward the atrium). */
function sideOk(side, p, H, N) {
  if (!side) return true;
  const h = (p.x - H.x) * N.x + (p.y - H.y) * N.y + (p.z - H.z) * N.z;
  return side === 'atrial' ? h > -ATRIAL : h < ATRIAL;
}

/**
 * Each station's wall point at rest: the nearest point of its half-plane's cut, outward from the
 * axis, and on side: 'atrial' (no more than ATRIAL below the hinge), 'ventricular' (no more than
 * ATRIAL above it, and no farther than VMAX) or any. A point that jumps away from its neighbours'
 * (more than JUMP from the median of their offsets) is found again as the wall point nearest the
 * place that median gives. Returns per station { k (segment), A (point), gap (cm) } or null.
 */
function restAnchors(R, cuts, side) {
  const far = side === 'ventricular' ? VMAX : FAR;
  const ok = (st) => (p) => p.clone().sub(R.C).dot(st.U) > 0 && sideOk(side, p, st.H, R.N);
  const out = R.stations.map((st, k) => {
    if (!st || !cuts[k]) return null;
    const best = nearestOn(cuts[k], st.H, ok(st));
    if (!best || best.d - st.r > far) return null;
    return { k: best.k, A: best.p, gap: best.d - st.r };
  });
  const n = out.length;
  const off = (k) => out[k].A.clone().sub(R.stations[k].H);
  const fixes = [];
  out.forEach((an, k) => {
    if (!an) return;
    const near = [];
    for (let j = -2; j <= 2; j++) { const i = (k + j + n) % n; if (j && out[i]) near.push(off(i)); }
    if (near.length < 2) return;
    const med = V3(...['x', 'y', 'z'].map((c) => { const v = near.map((o) => o[c]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; }));
    if (off(k).distanceTo(med) <= JUMP) return;
    const st = R.stations[k];
    const best = nearestOn(cuts[k], st.H.clone().add(med), ok(st));
    if (best && best.p.distanceTo(st.H) - st.r <= far) fixes.push([k, { k: best.k, A: best.p, gap: best.p.distanceTo(st.H) - st.r }]);
  });
  for (const [k, f] of fixes) out[k] = f;
  return out;
}

/**
 * The stretch of a station's cut along which its wall point slides: the chain of segments through
 * the rest point's segment (k), on along their shared ends each way, to WIN from the rest point A.
 * Returns the chain's triangles in order.
 */
function windowOf(segs, k, A) {
  const byKey = new Map();
  segs.forEach(([e0, e1], i) => { for (const e of [e0, e1]) { if (!byKey.has(e.key)) byKey.set(e.key, []); byKey.get(e.key).push(i); } });
  // from end e of segment i, on to WIN: the segments passed, in order
  const seen = new Set([k]);
  const walk = (i, e, d) => {
    const out = [];
    while (d < WIN) {
      const next = (byKey.get(e.key) || []).find((j) => !seen.has(j));
      if (next === undefined) break;
      seen.add(next);
      out.push(next);
      const [a, b] = segs[next], o = a.key === e.key ? b : a;
      d += o.p.distanceTo(e.p);
      e = o;
    }
    return out;
  };
  const [e0, e1] = segs[k];
  return [...walk(k, e0, A.distanceTo(e0.p)).reverse(), k, ...walk(k, e1, A.distanceTo(e1.p))].map((i) => segs[i].tri);
}

/** Runs of stations (cyclic) where keep holds, split where two rest wall points lie SPLIT apart. */
function runsOf(stations, keep) {
  const n = stations.length;
  const link = (i) => { const a = stations[i], b = stations[(i + 1) % n]; return keep[i] && keep[(i + 1) % n] && a.A.distanceTo(b.A) < SPLIT; };
  const links = stations.map((_, i) => link(i));
  if (links.every(Boolean)) return [{ ids: stations.map((_, i) => i), cyclic: true }];
  const runs = [];
  const start = links.findIndex((v) => !v);
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!keep[i]) { if (cur && cur.length >= 2) runs.push({ ids: cur, cyclic: false }); cur = null; continue; }
    if (!cur) cur = [];
    cur.push(i);
    if (!links[i]) { if (cur.length >= 2) runs.push({ ids: cur, cyclic: false }); cur = null; }
  }
  if (cur && cur.length >= 2) runs.push({ ids: cur, cyclic: false });
  return runs;
}

/**
 * A skirt's shell: two sheets THICK apart, joined round their edges, over each run's grid of
 * stations (i) by ALONG + 1 points from the hinge to the wall (j). Returns the index and the
 * vertex count; skirtShape writes the positions in the same order.
 */
function shell(runs) {
  const index = [];
  let base = 0;
  const J = ALONG + 1;
  for (const r of runs) {
    const n = r.ids.length, v = (s, i, j) => base + s * n * J + i * J + j;
    const quad = (a, b, c, d) => index.push(a, b, c, a, c, d);
    const last = r.cyclic ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const i1 = (i + 1) % n;
      for (let j = 0; j < ALONG; j++) {
        quad(v(0, i, j), v(0, i1, j), v(0, i1, j + 1), v(0, i, j + 1));
        quad(v(1, i, j), v(1, i, j + 1), v(1, i1, j + 1), v(1, i1, j));
      }
      quad(v(0, i, 0), v(1, i, 0), v(1, i1, 0), v(0, i1, 0));
      quad(v(0, i, ALONG), v(0, i1, ALONG), v(1, i1, ALONG), v(1, i, ALONG));
    }
    if (!r.cyclic) {
      for (let j = 0; j < ALONG; j++) {
        quad(v(0, 0, j), v(0, 0, j + 1), v(1, 0, j + 1), v(1, 0, j));
        quad(v(0, n - 1, j), v(1, n - 1, j), v(1, n - 1, j + 1), v(0, n - 1, j + 1));
      }
    }
    base += 2 * n * J;
  }
  return { index: Uint32Array.from(index), count: base };
}

/** The positions of mesh's vertices ids with shape-target weights w (targets are changes), into a Float32Array of the mesh's size. */
function morphAt(mesh, ids, w) {
  const g = mesh.geometry, base = g.attributes.position.array, dict = mesh.morphTargetDictionary || {};
  const T = g.morphAttributes.position || [], out = new Float32Array(base.length);
  const on = Object.entries(w).filter(([k, x]) => x && dict[k] !== undefined && T[dict[k]]).map(([k, x]) => [T[dict[k]].array, x]);
  for (const i of ids) {
    let x = base[3 * i], y = base[3 * i + 1], z = base[3 * i + 2];
    for (const [t, s] of on) { x += s * t[3 * i]; y += s * t[3 * i + 1]; z += s * t[3 * i + 2]; }
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
  return out;
}

// ---------------------------------------------------------------- the wall point, each frame
const _H = V3(), _A = V3();
/**
 * Station st's hinge now (into H) and its wall point (into A): the point of its stretch of wall
 * nearest the hinge that passes the side test (axis N), or the nearest one if none does. P and W:
 * the valve's and the wall's positions. Returns the distance from H to A.
 */
function slide(st, P, W, N, side, H, A) {
  H.set(0, 0, 0);
  for (let q = 0; q < st.hinge.length; q += 2) { const i = st.hinge[q], w = st.hinge[q + 1]; H.x += w * P[3 * i]; H.y += w * P[3 * i + 1]; H.z += w * P[3 * i + 2]; }
  const E = st.e, X = st.x;
  for (let q = 0, o = 0; q < E.length; q += 3, o += 3) {
    const a = E[q], b = E[q + 1], u = E[q + 2], v = 1 - u;
    X[o] = v * W[3 * a] + u * W[3 * b]; X[o + 1] = v * W[3 * a + 1] + u * W[3 * b + 1]; X[o + 2] = v * W[3 * a + 2] + u * W[3 * b + 2];
  }
  let best = Infinity, any = Infinity, bx = 0, by = 0, bz = 0, ax = 0, ay = 0, az = 0;
  for (let i = 0, j = 3; j < E.length; i += 3, j += 3) {
    const dx = X[j] - X[i], dy = X[j + 1] - X[i + 1], dz = X[j + 2] - X[i + 2], l2 = dx * dx + dy * dy + dz * dz || 1e-12;
    const t = Math.max(0, Math.min(1, ((H.x - X[i]) * dx + (H.y - X[i + 1]) * dy + (H.z - X[i + 2]) * dz) / l2));
    const px = X[i] + t * dx, py = X[i + 1] + t * dy, pz = X[i + 2] + t * dz;
    const d2 = (px - H.x) ** 2 + (py - H.y) ** 2 + (pz - H.z) ** 2;
    if (d2 < any) { any = d2; ax = px; ay = py; az = pz; }
    if (d2 >= best) continue;
    if (side) {
      const h = (px - H.x) * N.x + (py - H.y) * N.y + (pz - H.z) * N.z;
      if (side === 'atrial' ? h <= -ATRIAL : h >= ATRIAL) continue;
    }
    best = d2; bx = px; by = py; bz = pz;
  }
  if (best < Infinity) A.set(bx, by, bz); else A.set(ax, ay, az);
  return A.distanceTo(H);
}

/**
 * The largest gap of each station (cm, hinge to its sliding wall point) over the cycle at no
 * burden and at full burden, as the model's own shape targets move them. lw(name, v, drive, a, s):
 * the leaflet weights (gl/heart.js leafletWeights).
 */
function gapsOverCycle(valveMesh, myo, stations, N, side, lw) {
  const vIds = new Set(), wIds = new Set();
  for (const st of stations) if (st) { for (let q = 0; q < st.hinge.length; q += 2) vIds.add(st.hinge[q]); for (let q = 0; q < st.e.length; q += 3) { wIds.add(st.e[q]); wIds.add(st.e[q + 1]); } }
  const out = stations.map(() => -Infinity);
  for (const a of [0, 1]) for (const t of TIMES) {
    const c = cycleAt(t), s = c.s;
    const base = { systole: s, amyloid: a, amyloid_systole: a * s };
    const P = morphAt(valveMesh, vIds, { ...base, ...lw(valveMesh.name, c.v, c.drive, a, s) }), W = morphAt(myo, wIds, base);
    stations.forEach((st, k) => { if (st) out[k] = Math.max(out[k], slide(st, P, W, N, side, _H, _A)); });
  }
  return out;
}

// ---------------------------------------------------------------- the tricuspid annulus
// Where the tricuspid ring lies more than FIT_MIN inside the RA-RV junction (the nearest wall
// point within BAND of the annulus plane, beyond the ring), the ring moves out to the junction,
// and the leaflet's base with it, less with distance from the ring, none past FIT_FADE. The moves
// of neighbouring stations blend over FIT_SMOOTH stations each side. The four-chamber views cut
// the ring away from these sectors, at the septal and lateral hinges that the RV and TR chapters
// measure, and those hinges do not move. The burden and systole targets of the moved ring take
// the junction's own change, so it stays at the junction through the beat.
const BAND = 0.5, FIT_MIN = 0.5, FIT_FADE = 1.2, FIT_SMOOTH = 3;
const FOLLOW = ['systole', 'amyloid', 'amyloid_systole'];

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const arr = (v) => [r5(v.x), r5(v.y), r5(v.z)];
const vec = (a) => V3(a[0], a[1], a[2]);

/**
 * The tricuspid fit, found on the rest shape: the ring's frame, its stations' middles (H), and
 * per station the move (D) and each followed target's change (corr), blended over FIT_SMOOTH
 * stations each side; null when no station lies FIT_MIN inside the junction.
 */
function tricuspidFit(meshes, anat) {
  const tv = meshes.TricuspidValve, myo = meshes.Myocardium;
  if (!tv || !myo) return null;
  const R = ringStations(tv, anat.raw('ra_c', 0, 0), anat.raw('av', 0, 0));
  const cuts = wallCuts(R, myo);
  const m = R.stations.length;
  const D = R.stations.map(() => V3()), anchor = R.stations.map(() => null);
  let moved = 0;
  R.stations.forEach((st, k) => {
    if (!st || !cuts[k]) return;
    const out = st.H.clone().sub(R.C).dot(st.U);
    const best = nearestOn(cuts[k], st.H, (p) => { const q = p.clone().sub(R.C); return q.dot(st.U) > out && Math.abs(q.dot(R.N)) < BAND; });
    if (!best || best.d - st.r < FIT_MIN || best.d > FAR + 0.5) return;
    D[k] = best.p.clone().sub(st.H).multiplyScalar(1 - (st.r + 0.02) / best.d);
    anchor[k] = best.w;
    moved++;
  });
  if (!moved) return null;
  // the change of each target at the ring: the junction's own less the ring's
  const dict = tv.morphTargetDictionary || {}, myoDict = myo.morphTargetDictionary || {};
  const T = tv.geometry.morphAttributes.position || [], MT = myo.geometry.morphAttributes.position || [];
  const follow = FOLLOW.filter((k) => dict[k] !== undefined && myoDict[k] !== undefined);
  const blend = (list) => list.map((_, k) => {
    const s = V3();
    for (let j = -FIT_SMOOTH; j <= FIT_SMOOTH; j++) s.add(list[(k + j + m) % m]);
    return arr(s.multiplyScalar(1 / (2 * FIT_SMOOTH + 1)));
  });
  const corr = {};
  for (const name of follow) {
    corr[name] = blend(R.stations.map((st, k) => {
      if (!st || !anchor[k]) return V3();
      return sumOf(MT[myoDict[name]].array, anchor[k]).sub(sumOf(T[dict[name]].array, st.hinge));
    }));
  }
  return {
    C: arr(R.C), N: arr(R.N), A0: arr(R.A0), B0: arr(R.B0), ring: [...R.ring].sort((a, b) => a - b),
    H: R.stations.map((st) => (st ? arr(st.H) : null)), D: blend(D), corr, moved,
  };
}

/**
 * Move the tricuspid ring and its leaflets' bases (and the chordae on them) by fit F: each vertex
 * by its station's move, by its angle round the ring, weighed by its distance from the ring; the
 * followed targets by their change likewise. The old positions stay in the valve's
 * userData.prefit, for the annulus plane of phenomesh.js growFrame.
 */
function applyTricuspidFit(meshes, F) {
  const tv = meshes.TricuspidValve;
  if (!tv || !F) return;
  const C = vec(F.C), A0 = vec(F.A0), B0 = vec(F.B0), m = F.D.length;
  const Hs = F.H.map((h) => (h ? vec(h) : null)), Db = F.D.map(vec);
  const Cb = Object.fromEntries(Object.entries(F.corr).map(([k, l]) => [k, l.map(vec)]));
  const ring = new Set(F.ring);
  const valueAt = (list, th) => {
    const x = (th + 180) / STEP, i = ((Math.floor(x) % m) + m) % m, f = x - Math.floor(x), j = (i + 1) % m;
    return list[i].clone().lerp(list[j], f);
  };
  const move = (mesh, isRing) => {
    const g = mesh.geometry, pos = g.attributes.position.array, n = pos.length / 3;
    const dict = mesh.morphTargetDictionary || {}, T = g.morphAttributes.position || [];
    const follow = Object.keys(Cb).filter((k) => dict[k] !== undefined);
    const prefit = Float32Array.from(pos);
    for (let v = 0; v < n; v++) {
      const p = at(prefit, v), q = p.clone().sub(C);
      const th = (Math.atan2(q.dot(B0), q.dot(A0)) * 180) / Math.PI;
      const i = ((Math.round((th + 180) / STEP) % m) + m) % m;
      const H = Hs[i] || Hs.find(Boolean);
      const w = isRing(v) ? 1 : 1 - smooth(p.distanceTo(H) / FIT_FADE);
      if (w <= 0) continue;
      const d = valueAt(Db, th);
      if (d.lengthSq() < 1e-10) continue;
      pos[3 * v] += w * d.x; pos[3 * v + 1] += w * d.y; pos[3 * v + 2] += w * d.z;
      for (const name of follow) {
        const c = valueAt(Cb[name], th), t = T[dict[name]].array;
        t[3 * v] += w * c.x; t[3 * v + 1] += w * c.y; t[3 * v + 2] += w * c.z;
      }
    }
    g.attributes.position.needsUpdate = true;
    for (const name of follow) T[dict[name]].needsUpdate = true;
    if (g.attributes.normal) g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return prefit;
  };
  tv.userData.prefit = move(tv, (v) => ring.has(v));
  if (meshes.TricuspidChordae) move(meshes.TricuspidChordae, () => false);
}

// ---------------------------------------------------------------- the skirts
const flat = (ws) => ws.flatMap(([i, w]) => [i, r5(w)]);

/**
 * The frames of the heart model's valves, each { valve, ring, R }: for a ring (the mitral and the
 * tricuspid valve) R holds its stations (ringStations); for a semilunar valve R holds the axis and
 * frame (C, N, A0, B0) that its cusp stations use. anat: the Anatomy (gl/heart.js).
 */
function valveFrames(meshes, anat) {
  const P = (k) => anat.raw(k, 0, 0), out = [];
  if (meshes.MitralValve) out.push({ valve: 'MitralValve', ring: true, R: ringStations(meshes.MitralValve, P('la_c'), P('av')) });
  if (meshes.TricuspidValve) out.push({ valve: 'TricuspidValve', ring: true, R: ringStations(meshes.TricuspidValve, P('ra_c'), P('av')) });
  for (const valve of ['AorticValve', 'PulmonaryValve']) {
    const mesh = meshes[valve];
    if (!mesh) continue;
    const pos = mesh.geometry.attributes.position.array, pts = [];
    for (let i = 0; i < pos.length; i += 3) pts.push(V3(pos[i], pos[i + 1], pos[i + 2]));
    const { c: C, n } = leastAxis(pts);
    const N = valve === 'AorticValve' ? anat.aorticRoot.clone().normalize() : n;
    const { A0, B0 } = frame(N, C, C.clone().add(Math.abs(N.x) < 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)));
    out.push({ valve, ring: false, R: { C, N, A0, B0 } });
  }
  return out;
}
/** The normal of station k's plane in frame R. */
const planeOf = (R, k) => R.N.clone().cross(unitAt(R.A0, R.B0, k * STEP - 180));

/**
 * The skirts of the heart model's four valves: a list of { name, valve, side, axis, runs,
 * stations }, each station { t (its stretch of wall as the wall's triangles, windowOf), g (its
 * largest gap in the cycle), and for a cusp c (its hinge: [a, b, u], on the edge from vertex a to
 * b) } or null, without the valves that need none. anat: the Anatomy (gl/heart.js); lw: the
 * leaflet weights (gl/heart.js leafletWeights), for the gaps over the cycle.
 */
function skirtData(meshes, anat, lw) {
  const myo = meshes.Myocardium;
  if (!myo) return [];
  const W = myo.geometry.attributes.position.array, Wi = myo.geometry.index.array;
  const out = [];
  for (const { valve, ring, R: F } of valveFrames(meshes, anat)) {
    // the rings get a skirt to the atrial wall and one to the ventricular wall: a plane that cuts
    // the groove between them obliquely sees the ring reach either
    const R = ring ? F : cuspStations(meshes[valve], F.C, F.N), cuts = wallCuts(R, myo);
    for (const side of ring ? ['atrial', 'ventricular'] : [null]) {
      const rest = restAnchors(R, cuts, side);
      const stations = R.stations.map((st, k) => {
        if (!st || !rest[k]) return null;
        const t = windowOf(cuts[k], rest[k].k, rest[k].A), e = chainEnds(W, Wi, t, R.C, planeOf(R, k));
        if (e.length < 6) return null;
        return { hinge: flat(st.hinge), e, x: new Float64Array(e.length), t, A: rest[k].A };
      });
      const gaps = gapsOverCycle(meshes[valve], myo, stations, R.N, side, lw);
      const on = gaps.map((g, k) => g - (R.stations[k] ? R.stations[k].r : 0) > GAP);
      const m = on.length;
      // each run widened by a station at each end, so the skirt fades out where the gap closes
      const keep = stations.map((st, i) => !!st && (on[i] || on[(i + m - 1) % m] || on[(i + 1) % m]));
      const runs = runsOf(stations, keep);
      if (!runs.length) continue;
      const used = new Set(runs.flatMap((r) => r.ids));
      out.push({
        name: valve.replace('Valve', 'Skirt'), valve, side, axis: arr(R.N), runs,
        stations: stations.map((st, i) => {
          if (!st || !used.has(i)) return null;
          const o = { t: st.t, g: Math.round(gaps[i] * 1000) / 1000 };
          if (!ring) { const [[a, wa], [b, wb]] = R.stations[i].hinge; o.c = [a, b, Math.round((wb / (wa + wb)) * 1e5) / 1e5]; }
          return o;
        }),
      });
    }
  }
  return out;
}

/**
 * The skirts of skirtData (or the asset) as heart.js and echo.js use them: each station's hinge
 * (weights on the valve's vertices, flat) and its stretch of wall (chainEnds of its triangles, on
 * the rest shape), with the skirt's shell.
 */
function skirtsFrom(list, meshes, anat) {
  const myo = meshes.Myocardium;
  if (!myo || !list.length) return [];
  const W = myo.geometry.attributes.position.array, Wi = myo.geometry.index.array;
  const frames = Object.fromEntries(valveFrames(meshes, anat).map((f) => [f.valve, f]));
  return list.filter((d) => frames[d.valve]).map((d) => {
    const { ring, R } = frames[d.valve];
    const { index, count } = shell(d.runs);
    const wall = (d.side && WALL[d.valve]) || 0;
    return {
      // the runs copied: skirtShape keeps its scratch on them, and the data stays as found
      name: d.name, valve: d.valve, side: d.side, axis: vec(d.axis), runs: d.runs.map((r) => ({ ids: r.ids, cyclic: r.cyclic })), index, count,
      // wall: drawn as wall, not valve; thick: its thickness (cm)
      wall: wall > 0, thick: wall || THICK,
      stations: d.stations.map((st, k) => {
        if (!st) return null;
        const hinge = ring ? flat(R.stations[k].hinge) : [st.c[0], 1 - st.c[2], st.c[1], st.c[2]];
        const e = chainEnds(W, Wi, st.t, R.C, planeOf(R, k));
        return { hinge: Float64Array.from(hinge), e: Float64Array.from(e), x: new Float64Array(e.length), cap: Math.max(st.g + SLACK, st.g * STRETCH, HOLD) };
      }),
    };
  });
}

// ---------------------------------------------------------------- found once, kept in an asset
const FORMAT = 2;   // the asset's layout: 2, each station's stretch of wall as triangles
const SIG = ['Myocardium', 'MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve', 'TricuspidChordae'];
/** A check of the meshes the hinges are found on: each one's vertex count and two sums of its rest shape. */
function signature(meshes) {
  const out = {};
  for (const name of SIG) {
    const mesh = meshes[name];
    if (!mesh) continue;
    const p = mesh.geometry.attributes.position.array;
    let a = 0, b = 0;
    for (let i = 0; i < p.length; i += 3) { a += p[i] + 2 * p[i + 1] + 3 * p[i + 2]; b += ((i / 3) % 7) * (p[i] - p[i + 2]); }
    out[name] = [p.length / 3, Math.round(a * 100) / 100, Math.round(b * 100) / 100];
  }
  return out;
}
const sameSig = (a, b) => !!a && !!b && SIG.every((k) => (!a[k] && !b[k]) || (a[k] && b[k] && a[k][0] === b[k][0] && Math.abs(a[k][1] - b[k][1]) < 0.05 && Math.abs(a[k][2] - b[k][2]) < 0.05));

/**
 * Find the hinges on the meshes: the tricuspid fit, which this applies, then the skirts on the
 * fitted model. Returns the data that assets/hinges.json keeps (tools/hinges.mjs writes it).
 */
export function computeHinges(meshes, anat, lw) {
  const sig = signature(meshes);
  const tricuspid = tricuspidFit(meshes, anat);
  applyTricuspidFit(meshes, tricuspid);
  return { v: FORMAT, sig, tricuspid, skirts: skirtData(meshes, anat, lw) };
}

/**
 * Every valve's hinge on the wall, for the model loader (model3d.js): from data (the asset) when
 * it was found on these meshes, else found again here. Applies the tricuspid fit and returns
 * { skirts (for heart.js and echo.js), data }.
 */
export function hingesFor(meshes, anat, lw, data) {
  if (data && data.v === FORMAT && sameSig(data.sig, signature(meshes))) {
    applyTricuspidFit(meshes, data.tricuspid);
    return { skirts: skirtsFrom(data.skirts, meshes, anat), data };
  }
  if (data !== undefined) console.warn('assets/hinges.json does not fit this model or this code: the valve hinges are found again (node tools/hinges.mjs writes it)');
  const found = computeHinges(meshes, anat, lw);
  return { skirts: skirtsFrom(found.skirts, meshes, anat), data: found };
}

/** The vertices of each mesh that the skirts read: { meshName: Int32Array }. */
export function skirtRefs(skirts) {
  const m = { Myocardium: new Set() };
  for (const sk of skirts) {
    if (!m[sk.valve]) m[sk.valve] = new Set();
    for (const r of sk.runs) for (const i of r.ids) {
      const st = sk.stations[i];
      for (let q = 0; q < st.hinge.length; q += 2) m[sk.valve].add(st.hinge[q]);
      for (let q = 0; q < st.e.length; q += 3) { m.Myocardium.add(st.e[q]); m.Myocardium.add(st.e[q + 1]); }
    }
  }
  return Object.fromEntries(Object.entries(m).map(([k, s]) => [k, Int32Array.from(s)]));
}

// ---------------------------------------------------------------- on an echo plane
const TOUCH = 0.12;        // cm: a skirt's loop this near a wall's loop touches the wall
const TOUCH_VALVE = 0.25;  // cm: and this near its valve's (the hinge edge runs inside the ring's tube)

/** Whether a point of polyline P lies within tol of a segment of loops, or inside one of them (inside). */
function nearLoops(P, loops, tol, inside = false) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 -= tol; y0 -= tol; x1 += tol; y1 += tol;
  const t2 = tol * tol;
  for (const L of loops) {
    const Q = L.pts, m = Q.length, end = L.closed ? m : m - 1;
    for (let i = 0; i < end; i++) {
      const a = Q[i], b = Q[(i + 1) % m];
      if ((a[0] < x0 && b[0] < x0) || (a[0] > x1 && b[0] > x1) || (a[1] < y0 && b[1] < y0) || (a[1] > y1 && b[1] > y1)) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-12;
      for (const p of P) {
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2));
        const dx = a[0] + t * ex - p[0], dy = a[1] + t * ey - p[1];
        if (dx * dx + dy * dy <= t2) return true;
      }
    }
    if (inside && L.closed && m > 2) {
      for (const [x, y] of P) {
        let c = false;
        for (let i = 0, j = m - 1; i < m; j = i++) {
          const [xi, yi] = Q[i], [xj, yj] = Q[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        if (c) return true;
      }
    }
  }
  return false;
}

/**
 * Whether a skirt's loop on an echo plane (P, plane cm) joins its valve to the wall there: it
 * touches a loop of the wall (walls) and one of its valve's own loops (own). A plane near one
 * edge of a skirt shows a stub on the wall or on the hinge: echo.js leaves those out.
 */
export function bridges(P, walls, own) {
  return P.length > 1 && nearLoops(P, own, TOUCH_VALVE, true) && nearLoops(P, walls, TOUCH);
}

/**
 * Skirt sk's shape now, into out (count x 3), and its normals into outN if given: its hinge edge
 * on the valve's positions P, its wall edge on the wall's W (both the meshes' frame) at each
 * station's sliding wall point, EMBED into the wall. A station whose gap grows past its cap
 * shrinks to its hinge.
 */
export function skirtShape(sk, P, W, out, outN = null) {
  const J = ALONG + 1, h = (SMOOTH.length - 1) / 2, T = sk.thick || THICK;
  const H = V3(), A = V3();
  let px = sk.axis.x, py = sk.axis.y, pz = sk.axis.z, base = 0;
  for (const r of sk.runs) {
    const n = r.ids.length;
    // scratch per run: hinges, raw offsets, smoothed wall points (x, y, z each)
    if (!r.buf || r.buf.length < 9 * n) r.buf = new Float64Array(9 * n);
    const hs = r.buf, offs = r.buf.subarray(3 * n), as = r.buf.subarray(6 * n);
    for (let i = 0; i < n; i++) {
      slide(sk.stations[r.ids[i]], P, W, sk.axis, sk.side, H, A);
      hs[3 * i] = H.x; hs[3 * i + 1] = H.y; hs[3 * i + 2] = H.z;
      offs[3 * i] = A.x - H.x; offs[3 * i + 1] = A.y - H.y; offs[3 * i + 2] = A.z - H.z;
    }
    // the offsets smoothed along the run (a wall point on each trabecula would zigzag), each
    // shrunk to the hinge past its station's cap, and EMBED into the wall
    for (let i = 0; i < n; i++) {
      let ox = 0, oy = 0, oz = 0, sw = 0;
      for (let k = -h; k <= h; k++) {
        const j = r.cyclic ? (i + k + n) % n : i + k;
        if (j < 0 || j >= n) continue;
        const w = SMOOTH[k + h];
        ox += w * offs[3 * j]; oy += w * offs[3 * j + 1]; oz += w * offs[3 * j + 2];
        sw += w;
      }
      ox /= sw; oy /= sw; oz /= sw;
      const g = Math.hypot(ox, oy, oz);
      const f = g > 1e-6 ? (1 - smooth((g - sk.stations[r.ids[i]].cap) / LET_GO)) * (1 + EMBED / g) : 0;
      as[3 * i] = hs[3 * i] + f * ox; as[3 * i + 1] = hs[3 * i + 1] + f * oy; as[3 * i + 2] = hs[3 * i + 2] + f * oz;
    }
    for (let i = 0; i < n; i++) {
      const ip = 3 * (r.cyclic ? (i + n - 1) % n : Math.max(0, i - 1)), inx = 3 * (r.cyclic ? (i + 1) % n : Math.min(n - 1, i + 1)), c = 3 * i;
      // across the skirt (hinge to wall) and along it (the neighbours' middles): the sheet's normal
      const dx = as[c] - hs[c], dy = as[c + 1] - hs[c + 1], dz = as[c + 2] - hs[c + 2];
      const tx = (hs[inx] + as[inx] - hs[ip] - as[ip]) / 2, ty = (hs[inx + 1] + as[inx + 1] - hs[ip + 1] - as[ip + 1]) / 2, tz = (hs[inx + 2] + as[inx + 2] - hs[ip + 2] - as[ip + 2]) / 2;
      let nx = ty * dz - tz * dy, ny = tz * dx - tx * dz, nz = tx * dy - ty * dx;
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-9) { nx /= l; ny /= l; nz /= l; px = nx; py = ny; pz = nz; } else { nx = px; ny = py; nz = pz; }
      for (let j = 0; j < J; j++) {
        const u = j / ALONG, x = hs[c] + u * dx, y = hs[c + 1] + u * dy, z = hs[c + 2] + u * dz;
        for (let s2 = 0; s2 < 2; s2++) {
          const k = 3 * (base + s2 * n * J + i * J + j), sg = s2 ? -1 : 1, hh = 0.5 * sg * T;
          out[k] = x + nx * hh; out[k + 1] = y + ny * hh; out[k + 2] = z + nz * hh;
          if (outN) { outN[k] = sg * nx; outN[k + 1] = sg * ny; outN[k + 2] = sg * nz; }
        }
      }
    }
    base += 2 * n * J;
  }
  return out;
}
