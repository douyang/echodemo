// Speckle tracking on an apical view cut from the heart mesh, as Voigt 2015 defines it. The region
// of interest (ROI) spans the wall at end-diastole, from the endocardial to the epicardial border,
// with the myocardial midline between them. Each side runs from its basal end point to the apex,
// the point most distant from the middle of the base. Each side has three segments of equal length
// at end-diastole. The segments then follow the tissue: each point of the midline is a weighted set
// of mesh vertices. So its place at any moment of the beat is the place of that tissue on the plane.
// Longitudinal strain is (L - L0) / L0, with L0 the length at end-diastole. The global strain of a
// view takes the whole midline (Voigt 2015).

import { hingesOf, onPlane } from './meshjet.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * The section of a mesh (echo.js MeshData, after a morph) with plane g, as closed loops whose points
 * keep their tissue: each point lies on the mesh edge a-b at fraction t. Points in plane cm [u, v].
 */
export function sectionEdges(md, g) {
  const { pos, index, count } = md;
  const nx = g.n.x, ny = g.n.y, nz = g.n.z, k0 = nx * g.O.x + ny * g.O.y + nz * g.O.z;
  const sd = new Float32Array(count);
  for (let i = 0; i < count; i++) { const s = nx * pos[3 * i] + ny * pos[3 * i + 1] + nz * pos[3 * i + 2] - k0; sd[i] = s === 0 ? 1e-6 : s; }
  const pts = new Map(), adj = new Map();
  const point = (a, b) => {
    const key = a < b ? a * 1048576 + b : b * 1048576 + a;
    if (!pts.has(key)) {
      const t = sd[a] / (sd[a] - sd[b]);
      const x = pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t - g.O.x, y = pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t - g.O.y, z = pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t - g.O.z;
      pts.set(key, { p: [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z], m: [[a, 1 - t], [b, t]] });
    }
    return key;
  };
  const link = (p, q) => { if (!adj.has(p)) adj.set(p, []); if (!adj.has(q)) adj.set(q, []); adj.get(p).push(q); adj.get(q).push(p); };
  const tri = index ? index.length / 3 : count / 3;
  for (let f = 0; f < tri; f++) {
    const a = index ? index[3 * f] : 3 * f, b = index ? index[3 * f + 1] : 3 * f + 1, c = index ? index[3 * f + 2] : 3 * f + 2;
    const sa = sd[a] > 0, sb = sd[b] > 0, sc = sd[c] > 0;
    if (sa === sb && sb === sc) continue;
    const e = [];
    if (sa !== sb) e.push(point(a, b));
    if (sb !== sc) e.push(point(b, c));
    if (sc !== sa) e.push(point(c, a));
    if (e.length === 2) link(e[0], e[1]);
  }
  const loops = [], used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const line = [];
    let cur = start, prev = -1, closed = false;
    for (let guard = 0; guard < 200000; guard++) {
      used.add(cur);
      line.push(pts.get(cur));
      const nb = adj.get(cur);
      let next = -1;
      for (const q of nb) if (q !== prev && !used.has(q)) { next = q; break; }
      if (next === -1) { closed = nb.includes(start) && line.length > 2; break; }
      prev = cur;
      cur = next;
    }
    if (line.length > 2 && closed) loops.push(line);
  }
  return loops;
}

/** The LV apex of the heart shown on the view's plane (cm): a guide to the LV's side of the base. */
export const apexOf = (ev, s = 0) => onPlane(ev, ev.anchors(s).apex);

/** A blend of two tissue points: f of the way from m1 to m2 (each a list of [vertex, weight]). */
function blend(m1, m2, f) {
  const out = new Map();
  for (const [v, w] of m1) out.set(v, (out.get(v) || 0) + w * (1 - f));
  for (const [v, w] of m2) out.set(v, (out.get(v) || 0) + w * f);
  return [...out.entries()].filter(([, w]) => w > 1e-9);
}

/** The indices of the points P on their convex hull (monotone chain). */
function hullOf(P) {
  const idx = P.map((_, i) => i).sort((a, b) => P[a][0] - P[b][0] || P[a][1] - P[b][1]);
  const cross = (o, a, b) => (P[a][0] - P[o][0]) * (P[b][1] - P[o][1]) - (P[a][1] - P[o][1]) * (P[b][0] - P[o][0]);
  const lower = [], upper = [];
  for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop(); lower.push(i); }
  for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop(); upper.push(i); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i].p[0], yi = P[i].p[1], xj = P[j].p[0], yj = P[j].p[1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * The first crossing of the ray from p along dir with the loops, beyond t0 cm and before tMax:
 * { t, p, m (its tissue), loop, j, i (the loop and the points of the edge it crosses) }, or null.
 */
function firstHit(loops, p, dir, t0, tMax) {
  let best = null;
  loops.forEach((L, li) => {
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const A = L[j].p, B = L[i].p, e = sub(B, A), den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(A, p), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > t0 && t < tMax && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, p: add(p, mul(dir, t)), m: blend(L[j].m, L[i].m, u), loop: li, j, i };
    }
  });
  return best;
}

/** Each myocardial vertex's region (heart model vertex colors: 1 LV, 2 RV, 3 LA, 4 RA, 5 aorta, 6 PA, 7 veins). */
export function regionsOf(md) {
  if (md.regions) return md.regions;
  const C = md.mesh.geometry.attributes.color, R = new Uint8Array(md.count).fill(1);
  if (C) for (let i = 0; i < md.count; i++) R[i] = Math.round(C.getX(i) * 10);
  md.regions = R;
  return R;
}

/**
 * The ROI of the LV on one apical view (a4c, a2c or a3c), from the frame the view last drew: it
 * must be the end-diastolic frame, as the tissue found here is the reference. The endocardial
 * border runs from the apex along each wall to its base: the cavity's loop point nearest a mitral
 * hinge, or the last point of LV tissue (in the three-chamber view the anteroseptal wall ends at
 * the aortic root). n: points on the border. Returns { mid: [{ m, p }], endo, epi, iApex,
 * bounds: [7 fractional indices], L0: [6 segment lengths], len0, ends } or null.
 */
export function roiOf(ev, view, n = 121) {
  const g = ev.g;
  if (!g || !ev.last) return null;
  const mv = hingesOf(ev, 'MitralValve');
  if (!mv) { roiOf.why = 'no mitral hinges'; return null; }
  const apex = apexOf(ev, 0);
  const loops = sectionEdges(ev.myo, g);
  if (!loops.length) return null;
  const REG = regionsOf(ev.myo);
  const isLV = (m) => { let w = 0; for (const [v, x] of m) if (REG[v] === 1) w += x; return w >= 0.5; };
  const M0 = mul(add(mv[0], mv[1]), 0.5);
  let nrm = perp(unit(sub(mv[1], mv[0])));
  if (dot(sub(apex, M0), nrm) < 0) nrm = mul(nrm, -1);
  // the cavity's middle: on the line from the middle of the mitral valve to the apex, in no wall
  const inWall = (q) => loops.reduce((k, L) => (inside(L, q[0], q[1]) ? k + 1 : k), 0) % 2 === 1;
  const depth = dot(sub(apex, M0), nrm);
  let C = null;
  for (const f of [0.45, 0.4, 0.5, 0.35, 0.55, 0.3, 0.6]) { const q = add(M0, mul(nrm, f * depth)); if (!inWall(q)) { C = q; break; } }
  if (!C) { roiOf.why = 'no cavity'; return null; }
  // the endocardium at the apex: where a ray from the cavity's middle toward the apex first meets
  // a wall. Its loop holds the LV's endocardial border, whether it closes round the cavity or the
  // plane opens the cavity to the outside (through a vein) and the loop runs on round the heart.
  const hit = firstHit(loops, C, unit(sub(apex, C)), 0, 20);
  if (!hit) { roiOf.why = 'no apex'; return null; }
  const cav = loops[hit.loop], N = cav.length;
  const ia = len(sub(cav[hit.i].p, hit.p)) < len(sub(cav[hit.j].p, hit.p)) ? hit.i : hit.j;
  // from the apex along each wall while the tissue is the LV's, and no farther than 1 cm past the
  // line between the hinges; then back to the point nearest a hinge, where one lies within 0.8 cm
  const walk = (step) => {
    const out = [];
    for (let i = ia, k = 0; k < N; i = (i + step + N) % N, k++) {
      if (k > 0 && (!isLV(cav[i].m) || dot(sub(cav[i].p, M0), nrm) < -1)) break;
      out.push(cav[i]);
    }
    let best = -1, bd = 0.8;
    out.forEach((P, k) => { const d = Math.min(len(sub(P.p, mv[0])), len(sub(P.p, mv[1]))); if (d < bd) { bd = d; best = k; } });
    return best >= 0 ? out.slice(0, best + 1) : out;
  };
  const a = walk(1), b = walk(-1);
  if (a.length < 8 || b.length < 8) { roiOf.why = 'short walls'; return null; }
  let border = [...b.reverse(), ...a.slice(1)];
  if (border[0].p[0] > border[border.length - 1].p[0]) border = border.reverse();
  // the compacted myocardium, as the biplane trace takes it (meshtrace.js): the border runs over
  // the ridges that the mesh's wall makes into the cavity. Its points on the convex hull, in their
  // order, with both ends.
  const onHull = new Set(hullOf(border.map((P) => P.p)));
  border = border.filter((P, i) => i === 0 || i === border.length - 1 || onHull.has(i));
  const M = mul(add(border[0].p, border[border.length - 1].p), 0.5);
  // resampled at equal arc length, each point keeping its tissue
  const cum = [0];
  for (let i = 1; i < border.length; i++) cum.push(cum[i - 1] + len(sub(border[i].p, border[i - 1].p)));
  const total = cum[cum.length - 1];
  const endo = [];
  for (let k = 0, j = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < border.length - 2 && cum[j + 1] < s) j++;
    const f = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    endo.push({ p: add(border[j].p, mul(sub(border[j + 1].p, border[j].p), f)), m: blend(border[j].m, border[j + 1].m, f) });
  }
  // the epicardial border: the first wall surface along the outward normal of each endocardial
  // point. At the base the border bends toward the valve's hinge, so the last END points take the
  // normal of the wall just apical to them.
  const END = 8, outs = [], hits = [];
  for (let k = 0; k < n; k++) {
    const q = clamp(k, END, n - 1 - END);
    const a = endo[q - 2].p, b = endo[q + 2].p;
    let out = perp(unit(sub(b, a)));
    if (dot(out, sub(endo[q].p, C)) < 0) out = mul(out, -1);
    outs.push(out);
    hits.push(firstHit(loops, endo[k].p, out, 0.05, 6));
  }
  // the wall's thickness, held to 1.6 times its median: where the wall runs into another wall (the
  // atrioventricular groove) the midline stays in the LV's own wall
  const ts = hits.slice(8, n - 8).filter(Boolean).map((h) => h.t).sort((x, y) => x - y);
  if (!ts.length) { roiOf.why = 'no epicardium'; return null; }
  const cap = Math.min(2, 1.6 * ts[Math.floor(ts.length / 2)]);
  // a point whose normal meets no wall takes its neighbour's epicardial point
  const epi = endo.map((E, k) => { const h = hits[k]; if (!h) return null; const t = Math.min(h.t, cap); return { p: add(E.p, mul(outs[k], t)), m: blend(E.m, h.m, t / h.t) }; });
  for (let k = 0; k < n; k++) {
    if (epi[k]) continue;
    for (let d = 1; d < n; d++) { const j = epi[k - d] ? k - d : epi[k + d] ? k + d : -1; if (j >= 0) { epi[k] = epi[j]; break; } }
  }
  const raw = endo.map((E, k) => ({ p: mul(add(E.p, epi[k].p), 0.5), m: blend(E.m, epi[k].m, 0.5) }));
  // the midline, smoothed (a binomial filter over nine points; places and tissue alike, so the
  // tracking stays exact); its two ends stay
  const W = [1, 8, 28, 56, 70, 56, 28, 8, 1];
  const mid = raw.map((P, k) => {
    if (k === 0 || k === n - 1) return P;
    const r = Math.min(4, k, n - 1 - k);
    let p = [0, 0], tot = 0;
    const acc = new Map();
    for (let j = -r; j <= r; j++) {
      const w = W[j + 4], Q = raw[k + j];
      p = add(p, mul(Q.p, w));
      tot += w;
      for (const [v, x] of Q.m) acc.set(v, (acc.get(v) || 0) + w * x);
    }
    return { p: mul(p, 1 / tot), m: [...acc.entries()].map(([v, x]) => [v, x / tot]).filter(([, x]) => x > 1e-9) };
  });
  // the apex: the endocardial point farthest from the middle of the base (Voigt 2015)
  let iApex = 0;
  endo.forEach((P, k) => { if (len(sub(P.p, M)) > len(sub(endo[iApex].p, M))) iApex = k; });
  // the segment bounds on the midline: thirds of each side's length at end-diastole
  const mc = [0];
  for (let k = 1; k < n; k++) mc.push(mc[k - 1] + len(sub(mid[k].p, mid[k - 1].p)));
  const at = (s) => { let k = 0; while (k < n - 2 && mc[k + 1] < s) k++; return k + (mc[k + 1] > mc[k] ? (s - mc[k]) / (mc[k + 1] - mc[k]) : 0); };
  const sA = mc[iApex], sE = mc[n - 1];
  const bounds = [0, at(sA / 3), at((2 * sA) / 3), iApex, at(sA + (sE - sA) / 3), at(sA + (2 * (sE - sA)) / 3), n - 1];
  const roi = { mid, endo, epi, iApex, bounds, C, M };
  roi.L0 = segLengths(roi, mid.map((P) => P.p));
  roi.len0 = roi.L0.reduce((x, y) => x + y, 0);
  return roi;
}

/** The length along polyline P (plane cm) between fractional indices a < b. */
function arc(P, a, b) {
  const pt = (x) => { const i = Math.min(P.length - 2, Math.floor(x)); return add(P[i], mul(sub(P[i + 1], P[i]), x - i)); };
  let s = 0, q = pt(a);
  for (let i = Math.floor(a) + 1; i < b; i++) { s += len(sub(P[i], q)); q = P[i]; }
  return s + len(sub(pt(b), q));
}
/** The six segment lengths of roi with its midline at the places P (plane cm). */
export function segLengths(roi, P) {
  const B = roi.bounds, out = [];
  for (let j = 0; j < 6; j++) out.push(arc(P, B[j], B[j + 1]));
  return out;
}

/** World point of a tissue point m from the vertex places pos (Float32Array, world cm). */
function placeOf(m, pos) {
  let x = 0, y = 0, z = 0;
  for (const [v, w] of m) { x += w * pos[3 * v]; y += w * pos[3 * v + 1]; z += w * pos[3 * v + 2]; }
  return [x, y, z];
}
/** The midline's tissue on the plane g, the mesh at the vertex places pos (as echo.js MeshData pos). */
export function midlineAt(roi, pos, g) {
  return roi.mid.map(({ m }) => {
    const [x, y, z] = placeOf(m, pos);
    const X = x - g.O.x, Y = y - g.O.y, Z = z - g.O.z;
    return [X * g.r.x + Y * g.r.y + Z * g.r.z, X * g.d.x + Y * g.d.y + Z * g.d.z];
  });
}

/** The vertices that the ROI's midline uses. */
export function roiVertices(roi) {
  const s = new Set();
  for (const { m } of roi.mid) for (const [v] of m) s.add(v);
  return [...s];
}

/**
 * The places of some vertices of a mesh (echo.js MeshData) under target weights w, as its morph()
 * computes them, with its per-vertex scales: a Float32Array as long as the mesh's, filled at those
 * vertices only. A strain curve needs the midline at many moments, and this is far cheaper than
 * a whole morph.
 */
export function placesOf(md, w, verts, out = null) {
  const pos = out || new Float32Array(md.count * 3);
  const { base, targets, dict } = md;
  const T = Object.entries(w).filter(([name, value]) => value && dict[name] !== undefined).map(([name, value]) => [targets[dict[name]], value, md.scale && md.scale[name]]);
  const e = md.identity ? null : md.matrix.elements;
  for (const v of verts) {
    let x = base[3 * v], y = base[3 * v + 1], z = base[3 * v + 2];
    for (const [t, value, sc] of T) { const f = sc ? value * sc[v] : value; x += f * t[3 * v]; y += f * t[3 * v + 1]; z += f * t[3 * v + 2]; }
    if (e) { const X = x, Y = y, Z = z; x = e[0] * X + e[4] * Y + e[8] * Z + e[12]; y = e[1] * X + e[5] * Y + e[9] * Z + e[13]; z = e[2] * X + e[6] * Y + e[10] * Z + e[14]; }
    pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z;
  }
  return pos;
}
