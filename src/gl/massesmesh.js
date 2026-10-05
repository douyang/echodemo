// Cardiac masses as meshes on the heart (chapter 'masses'): a left atrial myxoma on a stalk from
// the atrial septum at the fossa ovalis, a thrombus on the endocardium of the LV apex, and a
// papillary fibroelastoma on the aortic side of an aortic cusp. Each mass is a closed triangle
// mesh in world cm. It is built in each frame from points of the heart that the view shows, so
// it moves with that heart through the beat. The echo views cut it as they cut the heart
// (section) and draw it under the walls (echo.js under), so a wall covers the part of a mass
// that lies inside it. The places where the masses attach are found once for each heart, on the
// heart's rest shape (anchorsOf).
//
// Sizes follow the values that the chapter prints (src/ch/masses.js): a mass's long axis lies in
// the plane of the view that measures it (the myxoma and the thrombus in the four-chamber view,
// the fibroelastoma in the long axis), so its section there shows its full length and width.

import { cycleAt } from '../cyclemodel.js';

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const vunit = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const of3 = (p) => [p.x, p.y, p.z];
const at = (pos, i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** a moved onto the plane g: its component along the plane's normal taken out. */
const toPlane = (a, g) => { const n = of3(g.n); return vsub(a, vmul(n, vdot(vsub(a, of3(g.O)), n))); };
/** World point of plane g at plane cm (u, v). */
const fromPlane = (g, u, v) => vadd(vadd(of3(g.O), vmul(of3(g.r), u)), vmul(of3(g.d), v));
/** Plane cm [u, v] of world point p on plane g. */
export const planeOf = (g, p) => { const q = vsub(p, of3(g.O)); return [vdot(q, of3(g.r)), vdot(q, of3(g.d))]; };
/**
 * The plane of view key on the heart that ev shows, where the view puts it: without the panel's
 * own move of its plane (echo.js setShift, setStandoff), so every panel builds a mass alike.
 */
function geom(ev, key) {
  const g = ev.geoms[key];
  if (!g) return null;
  const sh = ev.shift || 0, so = ev.standoff || 0;
  if (!sh && !so) return g;
  const O = vadd(vsub(of3(g.O), vmul(of3(g.n), sh)), vmul(of3(g.d), so));
  return { O: { x: O[0], y: O[1], z: O[2] }, d: g.d, r: g.r, n: g.n };
}

// Echogenicity in dB against myocardium (bmode.js DB). A thrombus is darker than muscle, with a
// bright free surface and faint layers parallel to the wall (a laminated thrombus); a myxoma is
// gelatinous and darker, with a bright surface and darker areas inside; a fibroelastoma is dense
// tissue, about as bright as a thickened leaflet. With an ultrasound enhancing agent the
// cavities fill with bright echoes: a thrombus and a fibroelastoma take up none and stay dark;
// a myxoma takes up less than the myocardium (Porter 2018).
export const ECHO = {
  thrombus: { fill: -10, edge: 12, layer: -3, hole: -10 },
  myxoma: { fill: -6, edge: 6, layer: -6, hole: -17 },
  pfe: { fill: 9, edge: 3, layer: 9, hole: 9 },
};
export const ECHO_UEA = {
  cavity: 11,
  thrombus: { fill: -26, edge: -12, layer: -26, hole: -26 },
  myxoma: { fill: -10, edge: -2, layer: -10, hole: -18 },
  pfe: { fill: -26, edge: -12, layer: -26, hole: -26 },
};

// ---------------------------------------------------------------- the plane section
/**
 * The section of a closed triangle mesh (pos: world xyz, index: triangles) by plane g, as
 * polylines in plane cm [u, v]; closed loops have closed true. With rest (the same mesh in a
 * reference pose), each loop also carries ref: the same material points, on the same plane, for
 * the speckle (bmode.js refs).
 */
export function section(pos, index, g, rest = null) {
  const nx = g.n.x, ny = g.n.y, nz = g.n.z, k0 = nx * g.O.x + ny * g.O.y + nz * g.O.z;
  const count = pos.length / 3, sd = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const s = nx * pos[3 * i] + ny * pos[3 * i + 1] + nz * pos[3 * i + 2] - k0;
    sd[i] = s === 0 ? 1e-7 : s;
  }
  const pts = new Map(), refs = new Map(), adj = new Map();
  const point = (a, b) => {
    const key = a < b ? a * 1048576 + b : b * 1048576 + a;
    if (!pts.has(key)) {
      const t = sd[a] / (sd[a] - sd[b]);
      pts.set(key, planeOf(g, vlerp(at(pos, a), at(pos, b), t)));
      if (rest) refs.set(key, planeOf(g, vlerp(at(rest, a), at(rest, b), t)));
    }
    return key;
  };
  const link = (p, q) => {
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q);
    adj.get(q).push(p);
  };
  for (let f = 0; f < index.length; f += 3) {
    const a = index[f], b = index[f + 1], c = index[f + 2];
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
    const line = [], rline = [];
    let cur = start, prev = -1, closed = false;
    for (let guard = 0; guard < 100000; guard++) {
      used.add(cur);
      line.push(pts.get(cur));
      if (rest) rline.push(refs.get(cur));
      const nb = adj.get(cur);
      let next = -1;
      for (const q of nb) if (q !== prev && !used.has(q)) { next = q; break; }
      if (next === -1) { closed = nb.includes(start) && line.length > 2; break; }
      prev = cur;
      cur = next;
    }
    if (line.length > 1) loops.push({ pts: line, closed, ref: rest ? rline : null });
  }
  return loops;
}

/** The segments of the loops (plane cm), for ray casts. */
function segsOf(loops) {
  const out = [];
  for (const L of loops) {
    const P = L.pts, m = P.length;
    for (let i = 0; i < m - 1 + (L.closed ? 1 : 0); i++) out.push([P[i], P[(i + 1) % m]]);
  }
  return out;
}
/** How far the ray from C along dir (plane cm) runs to the first segment; Infinity for none. */
function cast(C, dir, segs) {
  let best = Infinity;
  for (const [a, b] of segs) {
    const ex = b[0] - a[0], ey = b[1] - a[1], den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - C[0], wy = a[1] - C[1];
    const t = (wx * ey - wy * ex) / den, u = (wx * dir[1] - wy * dir[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/** The vertex of pos nearest p (among keep, when given). */
function nearestVertex(pos, p, keep = null) {
  let best = -1, bd = Infinity;
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    if (keep && !keep(i)) continue;
    const d = (pos[3 * i] - p[0]) ** 2 + (pos[3 * i + 1] - p[1]) ** 2 + (pos[3 * i + 2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
/** The myocardium's region of each vertex (anatomy.json regions: 1 LV, 2 RV, 3 LA, 4 RA, ...). */
function regions(md) {
  if (md.reg) return md.reg;
  const C = md.mesh.geometry.attributes.color, n = md.count;
  md.reg = new Uint8Array(n);
  for (let i = 0; i < n; i++) md.reg[i] = C ? Math.round(C.getX(i) * 10) : 1;
  return md.reg;
}

// ---------------------------------------------------------------- where the masses attach
const ANCHORS = new Map();
/**
 * The places on the heart that ev shows where each mass attaches, found on the heart's rest
 * shape (end-diastole) and kept for that heart:
 *   myx: the LA face of the atrial septum on the four-chamber plane, 55% of the way up the
 *        septum from the crux (the fossa ovalis): a myocardium vertex and the offset from it;
 *        the mitral annulus on that plane (its radius and its normal toward the LA), and how far
 *        the LA reaches from the attachment toward its lateral wall;
 *   thr: the endocardium of the LV apex on the four-chamber plane, the patch of apical
 *        endocardium round it (the vertices that a ray from the LV cavity meets first), the
 *        LV's long axis on that plane, and the chord on the plane of a base of each radius;
 *   pfe: the aortic face of the anterior aortic cusp on the long-axis plane, halfway along the
 *        cusp, and the vertex on the cusp's other face.
 */
export function anchorsOf(ev) {
  const key = `${ev.heart.key}|${ev.heart.version}`;
  if (ANCHORS.has(key)) return ANCHORS.get(key);
  const A = { myx: myxAnchor(ev), thr: thrAnchor(ev), pfe: pfeAnchor(ev) };
  ANCHORS.set(key, A);
  return A;
}

/** The mitral annulus on plane g at rest: its middle and radius (where the ring crosses), and its normal toward the LA. */
function annulusOn(ev, g, la) {
  const mv = ev.valves.find((v) => v.mesh.name === 'MitralValve');
  if (!mv) return null;
  const rings = section(mv.rest, mv.index, g).filter((L) => L.closed && L.pts.length > 2).map((L) => {
    let per = 0;
    for (let k = 1; k < L.pts.length; k++) per += Math.hypot(L.pts[k][0] - L.pts[k - 1][0], L.pts[k][1] - L.pts[k - 1][1]);
    return { per, c: L.pts.reduce((s, p) => [s[0] + p[0] / L.pts.length, s[1] + p[1] / L.pts.length], [0, 0]) };
  }).filter((r) => r.per < 1.2);
  let h = null, far = 0;
  for (const a of rings) for (const b of rings) { const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]); if (d > far) { far = d; h = [a.c, b.c]; } }
  if (!h || far < 1) return null;
  const mid = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
  let nrm = unit2([-(h[1][1] - h[0][1]), h[1][0] - h[0][0]]);
  if ((la[0] - mid[0]) * nrm[0] + (la[1] - mid[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
  // the open leaflets (the valve's rest shape is open): the channel between them, by depth below
  // the annulus (0 to 2 cm in steps of 0.25): its middle along the annulus (tangent tan) and its
  // half-width, 1.2 mm in from each leaflet
  const tan = [nrm[1], -nrm[0]];
  const xd = (p) => { const q = [p[0] - mid[0], p[1] - mid[1]]; return [q[0] * tan[0] + q[1] * tan[1], -(q[0] * nrm[0] + q[1] * nrm[1])]; };
  // each leaflet's points as [along the annulus, depth]; the septal leaflet is the one with the
  // smaller mean x (the attachment's side)
  const leaves = section(mv.rest, mv.index, g).filter((L) => L.pts.length > 2).filter((L) => {
    let per = 0;
    for (let k = 1; k < L.pts.length; k++) per += Math.hypot(L.pts[k][0] - L.pts[k - 1][0], L.pts[k][1] - L.pts[k - 1][1]);
    return per >= 1.2;
  }).map((L) => L.pts.map(xd)).map((P) => ({ P, mx: P.reduce((s, q) => s + q[0], 0) / P.length })).sort((a, b) => a.mx - b.mx);
  const sideA = leaves.length > 1 ? leaves[0].P : [], sideB = leaves.length > 1 ? leaves[leaves.length - 1].P : [];
  const chan = [];
  for (let k = 0; k <= 8; k++) {
    const dep = 0.25 * k;
    let lo = -Infinity, hi = Infinity;
    for (const q of sideA) if (Math.abs(q[1] - dep) <= 0.14) lo = Math.max(lo, q[0]);
    for (const q of sideB) if (Math.abs(q[1] - dep) <= 0.14) hi = Math.min(hi, q[0]);
    // past a leaflet's tip the channel opens on that side, 1 mm for each step
    const prev = chan[chan.length - 1] || { lo: -far / 2, hi: far / 2 };
    if (!Number.isFinite(lo)) lo = prev.lo - 0.1;
    if (!Number.isFinite(hi)) hi = prev.hi + 0.1;
    chan.push({ dep, lo, hi, c: (lo + hi) / 2, w: Math.max(0.3, (hi - lo) / 2 - 0.12) });
  }
  return { mid, r: far / 2, nrm, tan, h, chan };
}

function myxAnchor(ev) {
  const g = geom(ev, 'a4c'), md = ev.myo, R = md.rest, reg = regions(md);
  const loops = section(R, md.index, g).filter((L) => L.closed);
  const segs = segsOf(loops);
  const an = ev.anchors(0);
  const la = planeOf(g, of3(an.la)), ra = planeOf(g, of3(an.ra));
  const ann = annulusOn(ev, g, la);
  // the septum's LA face on the plane: LA vertices within 9 mm of an RA vertex, near the plane
  const nrm = of3(g.n), O = of3(g.O);
  const raPts = [];
  for (let i = 0; i < md.count; i++) if (reg[i] === 4) raPts.push(at(R, i));
  let v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < md.count; i++) {
    if (reg[i] !== 3) continue;
    const p = at(R, i);
    if (Math.abs(vdot(vsub(p, O), nrm)) > 0.4) continue;
    let near = false;
    for (const q of raPts) if (Math.abs(q[0] - p[0]) < 0.9 && Math.abs(q[1] - p[1]) < 0.9 && Math.abs(q[2] - p[2]) < 0.9 && vlen(vsub(q, p)) < 0.9) { near = true; break; }
    if (!near) continue;
    const v = planeOf(g, p)[1];
    v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const vAt = Number.isFinite(v0) ? v0 + 0.55 * (v1 - v0) : la[1];
  // from the LA at that depth toward the RA: the first wall is the septum's LA face
  const C = [la[0], vAt];
  const dir = unit2([ra[0] - la[0], 0]);
  const t = cast(C, dir, segs);
  const H = Number.isFinite(t) ? [C[0] + dir[0] * t, C[1]] : la;
  const H3 = fromPlane(g, H[0], H[1]);
  const i = nearestVertex(R, H3);
  // how far the LA reaches from the attachment along the annulus, toward the lateral wall
  const tan = ann ? [ann.nrm[1], -ann.nrm[0]] : [1, 0];
  const lat = tan[0] * (la[0] - H[0]) + tan[1] * (la[1] - H[1]) < 0 ? [-tan[0], -tan[1]] : tan;
  const wLat = cast([H[0] + lat[0] * 0.05, H[1] + lat[1] * 0.05], lat, segs);
  return { i, off: vsub(H3, at(R, i)), H, sept: [v0, v1], ann, wLat: Number.isFinite(wLat) ? wLat : 3, reach: ann ? Math.hypot(ann.mid[0] - H[0], ann.mid[1] - H[1]) : 2 };
}

function thrAnchor(ev) {
  const g = geom(ev, 'a4c'), md = ev.myo, R = md.rest;
  const loops = section(R, md.index, g).filter((L) => L.closed);
  const an = ev.anchors(0);
  const lv = planeOf(g, of3(an.lv)), ap = planeOf(g, of3(an.apex));
  const dir = unit2([ap[0] - lv[0], ap[1] - lv[1]]);
  const t = cast(lv, dir, segsOf(loops));
  const Hc = fromPlane(g, lv[0] + dir[0] * t, lv[1] + dir[1] * t);
  // the cavity's middle, 3 cm up the LV from the apex: rays from it meet the endocardium first
  const Lc = vadd(Hc, vmul(vunit(vsub(of3(an.lv), Hc)), 3.0));
  const n = R.length / 3, RMAX = 3.2;
  const cand = [];
  for (let i = 0; i < n; i++) {
    const p = at(R, i), rho = vlen(vsub(p, Hc));
    if (rho > RMAX + 1.6) continue;
    const w = vsub(p, Lc), d = vlen(w);
    cand.push({ i, rho, d, w: vmul(w, 1 / d) });
  }
  // a vertex is on the endocardium if no vertex in nearly its direction from Lc lies nearer by
  // more than 2.5 mm
  const COS = Math.cos((5 * Math.PI) / 180);
  const first = new Set();
  for (const a of cand) {
    if (a.rho > RMAX) continue;
    let ok = true;
    for (const b of cand) if (b.d < a.d - 0.25 && vdot(a.w, b.w) > COS) { ok = false; break; }
    if (ok) first.add(a.i);
  }
  const rho = new Map();
  for (const a of cand) if (first.has(a.i)) rho.set(a.i, a.rho);
  // the patch's triangles: all three vertices on the endocardium near the apex
  const tris = [];
  const I = md.index;
  for (let f = 0; f < I.length; f += 3) if (first.has(I[f]) && first.has(I[f + 1]) && first.has(I[f + 2])) tris.push(I[f], I[f + 1], I[f + 2]);
  const ic = nearestVertex(R, Hc, (i) => first.has(i));
  // the LV's long axis on the plane, from the apex toward the base
  const n4 = of3(g.n);
  let ax = vsub(Lc, Hc);
  ax = vunit(vsub(ax, vmul(n4, vdot(ax, n4))));
  return { Hc, Lc, rho, tris, ic, off: vsub(Hc, at(R, ic)), rmax: RMAX, ax, chords: baseChords(R, tris, g, Hc, ax, RMAX) };
}
/**
 * The chord of the base on the plane for each radius of the patch: the patch at rest cut by the
 * plane is a line through the apex, and its two points at distance r from the middle (one each
 * side of the axis) are the ends of a base of radius r. Returns [[r, chord], ...] (cm).
 */
function baseChords(pos, tris, g, Hc, ax, rmax) {
  const h = planeOf(g, Hc), o = planeOf(g, of3(g.O)), a2 = planeOf(g, vadd(of3(g.O), ax));
  const perp = unit2([-(a2[1] - o[1]), a2[0] - o[0]]);
  const segs = segsOf(section(pos, Uint32Array.from(tris), g));
  const tab = [];
  for (let r = 0.2; r <= rmax + 1e-9; r += 0.05) {
    const end = [null, null];
    for (const [p, q] of segs) {
      const dp = Math.hypot(p[0] - h[0], p[1] - h[1]), dq = Math.hypot(q[0] - h[0], q[1] - h[1]);
      if ((dp < r) === (dq < r)) continue;
      const f = (r - dp) / (dq - dp), x = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      const side = (x[0] - h[0]) * perp[0] + (x[1] - h[1]) * perp[1] < 0 ? 0 : 1;
      if (!end[side]) end[side] = x;
    }
    if (!end[0] || !end[1]) break;
    tab.push([r, Math.hypot(end[0][0] - end[1][0], end[0][1] - end[1][1])]);
  }
  return tab;
}
/** The radius of the patch whose base has chord L (cm) on the plane (baseChords). */
function baseRadius(A, L) {
  const T = A.chords;
  if (!T.length) return Math.min(A.rmax, L / 2);
  if (L <= T[0][1]) return T[0][0] * (L / T[0][1]);
  for (let k = 1; k < T.length; k++) {
    if (T[k][1] >= L) return T[k - 1][0] + ((T[k][0] - T[k - 1][0]) * (L - T[k - 1][1])) / (T[k][1] - T[k - 1][1] || 1);
  }
  return T[T.length - 1][0];
}
/**
 * The patch cut at radius Rb: its own vertices inside, and new ones where its edges cross Rb
 * ({ a, b, f }: f of the way from vertex a to vertex b), so that the base ends at Rb exactly.
 * Kept for each radius.
 */
function clipPatch(A, Rb) {
  const key = Rb.toFixed(4);
  if (!A.clips) A.clips = new Map();
  if (A.clips.has(key)) return A.clips.get(key);
  const verts = [], ids = new Map();
  const vOf = (a, b, f) => {
    const k = a === b ? `${a}` : a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!ids.has(k)) {
      ids.set(k, verts.length);
      verts.push(a === b ? { a, b, f: 0, rho: A.rho.get(a) } : a < b ? { a, b, f, rho: Rb } : { a: b, b: a, f: 1 - f, rho: Rb });
    }
    return ids.get(k);
  };
  const tris = [];
  for (let t = 0; t < A.tris.length; t += 3) {
    const v = [A.tris[t], A.tris[t + 1], A.tris[t + 2]], r = v.map((i) => A.rho.get(i));
    const poly = [];
    for (let e = 0; e < 3; e++) {
      const i = v[e], j = v[(e + 1) % 3], ri = r[e], rj = r[(e + 1) % 3];
      if (ri <= Rb) poly.push(vOf(i, i, 0));
      if ((ri <= Rb) !== (rj <= Rb)) poly.push(vOf(i, j, (Rb - ri) / (rj - ri)));
    }
    for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
  }
  const out = { verts, tris, centre: ids.has(`${A.ic}`) ? ids.get(`${A.ic}`) : -1 };
  A.clips.set(key, out);
  return out;
}

function pfeAnchor(ev) {
  const g = geom(ev, 'plax');
  const av = ev.valves.find((v) => v.mesh.name === 'AorticValve');
  if (!av || !g) return null;
  const up = vunit(of3(ev.anat.aorticRoot));
  const c0 = of3(ev.anchors(0).av);
  // the shut cusps on the long-axis plane: thin loops from the root's wall to the middle
  const loops = section(av.rest, av.index, g).filter((L) => L.closed && L.pts.length > 3);
  const cen = planeOf(g, c0), o = planeOf(g, of3(g.O)), u2 = planeOf(g, vadd(of3(g.O), up));
  const upP = [u2[0] - o[0], u2[1] - o[1]];
  let best = null;
  for (const L of loops) {
    const m = L.pts.reduce((s, p) => [s[0] + p[0] / L.pts.length, s[1] + p[1] / L.pts.length], [0, 0]);
    // the anterior cusp: nearer the probe (less deep) than the valve's middle
    if (m[1] > cen[1]) continue;
    const span = Math.max(...L.pts.map((p) => Math.hypot(p[0] - m[0], p[1] - m[1])));
    if (!best || span > best.span) best = { L, m, span };
  }
  if (!best) return null;
  // halfway along the cusp, on its aortic face: of the loop's points within 2.5 mm of its
  // middle, the one farthest up the root
  let pick = best.L.pts[0], score = -Infinity;
  for (const p of best.L.pts) {
    const dm = Math.hypot(p[0] - best.m[0], p[1] - best.m[1]);
    const s = p[0] * upP[0] + p[1] * upP[1] - 3 * Math.max(0, dm - 0.25);
    if (s > score) { score = s; pick = p; }
  }
  const P3 = fromPlane(g, pick[0], pick[1]);
  const i = nearestVertex(av.rest, P3);
  // the cusp's other face: the nearest vertex 0.5 to 2.5 mm from this one, down the root
  const below = vsub(P3, vmul(up, 0.12));
  const j = nearestVertex(av.rest, below, (k) => { const d = vlen(vsub(at(av.rest, k), P3)); return k !== i && d > 0.05 && d < 0.25; });
  return { i, j, off: vsub(P3, at(av.rest, i)), P: pick };
}

// ---------------------------------------------------------------- meshes
/**
 * A closed surface round an axis: rings at z (cm) from 0 to len along unit dir from base,
 * radius r(z, th) (th round the axis from e2, toward e1), with a point at each end that closes
 * it. Returns { pos, index }.
 */
function revolve(base, dir, e1, e2, len, r, nz = 26, nth = 28) {
  const pos = new Float32Array(3 * (2 + (nz - 1) * nth)), index = [];
  pos.set(base, 0);
  let o = 3;
  for (let k = 1; k < nz; k++) {
    const z = (len * k) / nz;
    const c = vadd(base, vmul(dir, z));
    for (let j = 0; j < nth; j++) {
      const th = (2 * Math.PI * j) / nth, rr = r(z, th);
      pos.set(vadd(c, vadd(vmul(e2, rr * Math.cos(th)), vmul(e1, rr * Math.sin(th)))), o);
      o += 3;
    }
  }
  pos.set(vadd(base, vmul(dir, len)), o);
  const ring = (k, j) => 1 + (k - 1) * nth + (j % nth);
  const last = 1 + (nz - 1) * nth;
  for (let j = 0; j < nth; j++) index.push(0, ring(1, j + 1), ring(1, j));
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 0; j < nth; j++) {
      const a = ring(k, j), b = ring(k, j + 1), c = ring(k + 1, j), d = ring(k + 1, j + 1);
      index.push(a, b, d, a, d, c);
    }
  }
  for (let j = 0; j < nth; j++) index.push(last, ring(nz - 1, j), ring(nz - 1, j + 1));
  return { pos, index: Uint32Array.from(index) };
}
/** Two unit vectors square to dir: e1 along the plane's normal n, e2 in the plane (when dir lies in it). */
function frame(dir, n) {
  let e1 = vsub(n, vmul(dir, vdot(n, dir)));
  if (vlen(e1) < 1e-6) e1 = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  e1 = vunit(e1);
  return { e1, e2: vunit(vcross(dir, e1)) };
}
/** dir turned by angle a (rad) about unit axis k. */
function turn(dir, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return vadd(vadd(vmul(dir, c), vmul(vcross(k, dir), s)), vmul(k, vdot(k, dir) * (1 - c)));
}

/**
 * The myxoma: a body of length L and width W (cm) on a stalk from the septum, in the
 * four-chamber plane. It moves on the stalk with the mitral valve. With the valve open (drive.mv
 * 0) its axis runs through the middle of the channel between the open leaflets, 7.5 mm below the
 * annulus, and in mid-diastole its tip lies d cm below the annulus, in the LV; a body too short
 * to reach the annulus hangs toward the valve on a stalk of 0.4 cm. With the valve shut the body
 * swings back and lies over the valve: its tip at least 1.5 mm above the annulus, as near the
 * valve as that allows, and 3.5 mm short of the LA's lateral wall, sliding back on its stalk if
 * it is too long for that. Below the annulus the body narrows to the channel between the
 * leaflets, as a gelatinous tumor does. p: { L, W, d, wob (rad, its own motion) }.
 */
const STALK = 0.4;
/**
 * The time (ms) in mid-diastole at which the tumor's tip lies d below the annulus, on a stalk
 * of STALK (the chapter's still frame). The tumor keeps that length through the beat, and swings
 * on its stalk; in systole a tumor too long for the LA slides back on it.
 */
export const MYX_REF_MS = 560;
const S_REF = cycleAt(MYX_REF_MS).s;
/** The channel between the open leaflets at depth dep (cm) below the annulus: its middle (world, moved by shift) and half-width. */
function channelAt(ann, g4, shift, dep) {
  const ch = ann.chan, k = clamp(dep / 0.25, 0, ch.length - 1), i = Math.min(ch.length - 2, Math.floor(k)), f = k - i;
  const c = ch[i].c + (ch[i + 1].c - ch[i].c) * f;
  let w = ch[i].w + (ch[i + 1].w - ch[i].w) * f;
  if (dep > 0.25 * (ch.length - 1)) w += 0.4 * (dep - 0.25 * (ch.length - 1));
  const { mid, tan, nrm } = ann;
  return { C: vadd(fromPlane(g4, mid[0] + tan[0] * c - nrm[0] * dep, mid[1] + tan[1] * c - nrm[1] * dep), shift), w };
}
function myxomaGeom(ev, p, st, pos, A, extra = 0) {
  const g4 = geom(ev, 'a4c'), n4 = of3(g4.n);
  const att = toPlane(vadd(at(pos, A.i), A.off), g4);
  const ann = A.ann;
  // the annulus moves with the beat: the valve's centre now, against its centre at rest
  const shift = vsub(toPlane(of3(ev.anchors(st.s).mv), g4), toPlane(of3(ev.anchors(0).mv), g4));
  const M = vadd(fromPlane(g4, ann.mid[0], ann.mid[1]), shift);
  // the annulus's normal toward the LA, and the direction along it toward the lateral wall
  const N = vunit(vsub(fromPlane(g4, ann.nrm[0], ann.nrm[1]), of3(g4.O)));
  let T = vsub(vsub(M, att), vmul(N, vdot(vsub(M, att), N)));
  T = vlen(T) > 1e-6 ? vunit(T) : vunit(vcross(N, n4));
  const hA = vdot(vsub(att, M), N);
  const Q = channelAt(ann, g4, shift, 0.75).C;
  const dQ = vunit(vsub(Q, att));
  // the length: in mid-diastole (MYX_REF_MS) the tip lies d below the annulus on the line
  // through the channel (extra: cm more along it, so that the deepest point of the body lies d
  // below); a short body hangs toward the channel
  const shiftR = vsub(toPlane(of3(ev.anchors(S_REF).mv), g4), toPlane(of3(ev.anchors(0).mv), g4));
  const MR = vadd(fromPlane(g4, ann.mid[0], ann.mid[1]), shiftR);
  const dR = vunit(vsub(channelAt(ann, g4, shiftR, 0.75).C, att));
  const downR = -vdot(dR, N);
  const totalDia = (p.d > 0 && downR > 0.05 ? (vdot(vsub(att, MR), N) + p.d) / downR : p.L + STALK) + extra;
  const total = Math.max(0.15, totalDia - p.L) + p.L;
  // shut: slid back on the stalk to fit short of the lateral wall, over the valve
  const totalSys = clamp(A.wLat - 0.35, p.L + 0.15, total);
  const thM = Math.atan2(vdot(dQ, N), vdot(dQ, T));
  const thLow = Math.asin(clamp((0.15 - hA) / totalSys, -1, 1));
  const thSys = Math.max(thM, thLow);
  const dSys = vunit(vadd(vmul(T, Math.cos(thSys)), vmul(N, Math.sin(thSys))));
  const k = smooth(clamp(1 - st.drive.mv, 0, 1));
  let dir = vunit(vlerp(dSys, dQ, k));
  if (p.wob) dir = turn(dir, n4, p.wob);
  const len = totalSys + (total - totalSys) * k;
  return { att, M, N, dir, stalk: Math.max(0.15, len - p.L), total: len, n4, shift, g4 };
}
/** The tumor's surface round its axis: the radius r(z, th) at z cm along it from base, with its frame. */
function myxomaBody(ev, p, st, pos, A, extra = 0) {
  const G = myxomaGeom(ev, p, st, pos, A, extra);
  const { att, M, N, dir, stalk, n4, shift, g4 } = G;
  const { e1, e2 } = frame(dir, n4);
  const body = (zb, th) => {
    const u = clamp(zb / p.L, 0, 1);
    // egg-shaped, widest 45% of the way from the stalk, with a lobulated surface
    const x = u < 0.45 ? u / 0.45 : (1 - u) / 0.55;
    const r = (p.W / 2) * Math.pow(clamp(1 - (1 - x) * (1 - x), 0, 1), 0.55);
    return r * (1 + 0.045 * Math.sin(3 * th + 1.7) * Math.sin(Math.PI * u) + 0.03 * Math.sin(5 * th + 6 * u));
  };
  // the in-plane width (th 0 and pi) at its widest is W
  let wmax = 0;
  for (let i = 1; i < 80; i++) { const z = (p.L * i) / 80; wmax = Math.max(wmax, body(z, 0) + body(z, Math.PI)); }
  const sc = p.W / (wmax || 1);
  const EMB = 0.15;                                     // the stalk starts inside the septum
  const base = vsub(att, vmul(dir, EMB));
  const len = EMB + stalk + p.L;
  const r = (z, th) => {
    const zb = z - EMB - stalk;
    let rr = zb <= 0 ? 0.11 : Math.max(0.11, sc * body(zb, th));
    // below the annulus the body keeps inside the channel between the leaflets
    const C = vadd(base, vmul(dir, z)), dep = vdot(vsub(M, C), N);
    if (dep > -0.1) {
      const ch = channelAt(A.ann, g4, shift, Math.max(0, dep));
      const lim = Math.max(0.12, ch.w - vlen(vsub(C, ch.C)));
      if (rr > lim) rr = lim + (rr - lim) * 0.06;
    }
    return Math.max(0.02, rr);
  };
  return { G, e1, e2, body, sc, EMB, base, len, r };
}
/** How deep (cm) below the annulus the body's outline on the plane reaches (th 0 and pi lie on it). */
function deepestOf(B) {
  const { G, base, len, r, e2 } = B;
  let best = -Infinity;
  for (let i = 0; i <= 160; i++) {
    const z = (len * i) / 160, C = vadd(base, vmul(G.dir, z));
    for (const [th, sg] of [[0, 1], [Math.PI, -1]]) best = Math.max(best, vdot(vsub(G.M, vadd(C, vmul(e2, sg * r(z, th)))), G.N));
  }
  return best;
}
/**
 * The body's outline reaches past the tip of its axis where its end is round and its axis
 * slants: the cm to add along the axis, with the valve open, so that its deepest point on the
 * plane lies d below the annulus in mid-diastole (MYX_REF_MS), on the heart as it is now (pos).
 * A body that does not prolapse (d 0) stays 0.3 mm or more above the annulus: it slides back on
 * its stalk if it would reach past it.
 */
function tipFix(ev, p, pos, A) {
  const open = { s: S_REF, drive: { mv: 0 } };
  let fix = 0;
  for (let it = 0; it < 3; it++) {
    const B = myxomaBody(ev, { ...p, wob: 0 }, open, pos, A, fix);
    const down = -vdot(B.G.dir, B.G.N);
    if (down < 0.05) break;
    const deep = deepestOf(B);
    fix += ((p.d > 0 ? p.d : Math.min(deep, -0.03)) - deep) / down;
  }
  return fix;
}
function myxomaMesh(ev, p, st, pos, A) {
  const B = myxomaBody(ev, p, st, pos, A, tipFix(ev, p, pos, A));
  const { att, dir, stalk } = B.G;
  const { e1, e2, body, sc, EMB, base, len, r } = B;
  // darker areas inside a larger tumor, on the plane, kept well inside the body where it narrows
  const holes = [];
  if (p.L >= 1.6) {
    for (const [f, side, k] of [[0.38, 1, 0.14], [0.6, -1, 0.1]]) {
      const z = EMB + stalk + f * p.L, rr = Math.min(r(z, side > 0 ? 0 : Math.PI), sc * body(f * p.L, side > 0 ? 0 : Math.PI));
      const rad = Math.min(k * p.W, 0.4 * rr), c = vadd(vadd(base, vmul(dir, z)), vmul(e2, side * 0.3 * rr));
      holes.push(revolve(vsub(c, vmul(dir, rad)), dir, e1, e2, 2 * rad, (zz) => Math.sqrt(Math.max(0, rad * rad - (zz - rad) ** 2)), 10, 14));
    }
  }
  return { meshes: [revolve(base, dir, e1, e2, len, r, 44, 30)], holes, axis: { att, rear: vadd(att, vmul(dir, stalk)), tip: vadd(att, vmul(dir, stalk + p.L)) } };
}

/**
 * The thrombus: the apical endocardium (the patch, cut at the radius whose base has chord L on
 * the four-chamber plane) moved into the cavity by a thickness that falls from T at the
 * patch's middle to none at its edge (cm); its base lies 0.5 mm inside the wall. shape 0: a
 * layer along the wall, moved along the wall's normal (mural); 1: a mound over the middle of the
 * patch on a thin lining, moved along the LV's long axis, so that its top stands above the
 * edge of a deep apex (protruding). A mobile thrombus adds a frond from the mound's top that
 * moves on its own (mob: its length, cm; wag: its angle, rad).
 */
function thrombusMeshes(ev, p, pos, A) {
  const Rb = baseRadius(A, p.L);
  const C = clipPatch(A, Rb), nP = C.verts.length;
  if (!C.tris.length || C.centre < 0) return { meshes: [], axis: null };
  const P = C.verts.map((v) => (v.a === v.b ? at(pos, v.a) : vlerp(at(pos, v.a), at(pos, v.b), v.f)));
  // vertex normals of the patch now, toward the cavity
  const nrm = P.map(() => [0, 0, 0]);
  for (let f = 0; f < C.tris.length; f += 3) {
    const a = C.tris[f], b = C.tris[f + 1], c = C.tris[f + 2];
    const fn = vcross(vsub(P[b], P[a]), vsub(P[c], P[a]));
    for (const k of [a, b, c]) nrm[k] = vadd(nrm[k], fn);
  }
  const lc = vadd(at(pos, A.ic), vadd(A.off, vsub(A.Lc, A.Hc)));
  const w = clamp(p.shape || 0, 0, 1);
  const out = new Float32Array(6 * nP);
  // two layers inside it, parallel to the wall: the patch moved by 0.4 and 0.75 of the thickness
  const lay = [new Float32Array(3 * nP), new Float32Array(3 * nP)];
  // the thickness across the patch (u: 0 at its middle, 1 at its edge): a layer, tapering at its
  // edge; a mound over the middle (radius c of the patch's, its top flat out to 0.12), on a
  // lining 0.18 as thick as it
  const c = 1 - 0.45 * w, u0 = 0.12;
  const prof = (u) => {
    if (u >= 1) return 0;
    const layer = Math.pow(1 - Math.pow(u, 6), 0.5);
    const mound = u < c ? Math.pow(1 - (Math.max(0, u - u0) / (c - u0)) ** 2, 0.75) : 0;
    return (1 - w) * layer + w * Math.max(mound, 0.18 * layer);
  };
  let dc = A.ax;
  for (let k = 0; k < nP; k++) {
    let nv = vunit(nrm[k]);
    if (vdot(nv, vsub(lc, P[k])) < 0) nv = vmul(nv, -1);
    const dv = vunit(vadd(vmul(nv, 1 - w), vmul(A.ax, w)));
    const t = p.T * prof(C.verts[k].rho / Rb);
    out.set(vsub(P[k], vmul(nv, 0.05)), 3 * k);
    out.set(vadd(P[k], vmul(dv, Math.max(0.01, t))), 3 * (nP + k));
    lay[0].set(vadd(P[k], vmul(dv, 0.4 * t)), 3 * k);
    lay[1].set(vadd(P[k], vmul(dv, 0.75 * t)), 3 * k);
    if (k === C.centre) dc = dv;
  }
  // the base (reversed), the free surface, and the side walls along the patch's edge
  const index = [], edges = new Map();
  for (let f = 0; f < C.tris.length; f += 3) {
    const a = C.tris[f], b = C.tris[f + 1], c = C.tris[f + 2];
    index.push(a, c, b, a + nP, b + nP, c + nP);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const kk = x < y ? x * 65536 + y : y * 65536 + x;
      edges.set(kk, edges.has(kk) ? null : [x, y]);
    }
  }
  for (const e of edges.values()) {
    if (!e) continue;
    const [x, y] = e;
    index.push(x, y, y + nP, x, y + nP, x + nP);
  }
  const meshes = [{ pos: out, index: Uint32Array.from(index) }];
  const free = Uint32Array.from(C.tris);
  const layers = p.T > 0.25 ? lay.map((pos2) => ({ pos: pos2, index: free })) : [];
  // the calipers on the four-chamber plane: the thickness from the base's middle, square to the
  // wall there, and the base's two ends (where the patch's edge crosses the plane)
  const g4 = geom(ev, 'a4c'), n4 = of3(g4.n);
  const bot = vadd(P[C.centre], A.off);
  let up = vsub(dc, vmul(n4, vdot(dc, n4)));
  up = vlen(up) > 1e-6 ? vunit(up) : A.ax;
  const top = vadd(bot, vmul(up, p.T));
  const b2 = planeOf(g4, bot), o2 = planeOf(g4, of3(g4.O)), u2 = planeOf(g4, vadd(of3(g4.O), up));
  const across = unit2([-(u2[1] - o2[1]), u2[0] - o2[0]]);
  const basePos = new Float32Array(3 * nP);
  P.forEach((q, k) => basePos.set(q, 3 * k));
  let e0 = null, e1 = null, lo = Infinity, hi = -Infinity;
  for (const L of section(basePos, free, g4)) {
    for (const q of L.pts) {
      const c = (q[0] - b2[0]) * across[0] + (q[1] - b2[1]) * across[1];
      if (c < lo) { lo = c; e0 = q; }
      if (c > hi) { hi = c; e1 = q; }
    }
  }
  if (p.mob > 0) {
    // the frond: from the mound's top into the cavity, in the four-chamber plane, turned by wag
    const dir = vunit(turn(up, n4, p.wag || 0));
    const { e1: f1, e2: f2 } = frame(dir, n4);
    const fw = 0.24 + 0.08 * p.mob;
    const base = vsub(toPlane(top, g4), vmul(dir, 0.3));
    const len = p.mob + 0.3;
    meshes.push(revolve(base, dir, f1, f2, len, (z, th) => {
      const u = z / len;
      return Math.max(0.02, (fw / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92)), 0.6) * (1 + 0.08 * Math.sin(3 * th + 4 * u)));
    }, 18, 16));
  }
  const ends = e0 && e1 ? [fromPlane(g4, e0[0], e0[1]), fromPlane(g4, e1[0], e1[1])] : null;
  return { meshes, layers, axis: { base: bot, top, n: up, ends } };
}

/**
 * The body's radius at w (0 at the end of the stalk, 1 at its tip) and th round its axis, for a
 * body 1 cm long: round, with fronds round it (a sea anemone); a sessile one sits on a broad
 * base.
 */
function pfeRadius(w, th, stalked) {
  const zz = w - 0.5, body = Math.sqrt(Math.max(0, 0.25 - zz * zz));
  const fronds = 1 + 0.16 * Math.pow(Math.max(0, Math.sin(7 * th + 9 * w)), 3) + 0.07 * Math.sin(4 * th + 13 * w);
  return Math.max(!stalked && w < 0.5 ? 0.3 : 0, body * fronds);
}
const PFE_CHORD = new Map();
/** The longest chord of that body's outline on the plane (th 0 and pi), for a body 1 cm long. */
function pfeChord(stalked) {
  if (PFE_CHORD.has(stalked)) return PFE_CHORD.get(stalked);
  const P = [];
  for (let i = 0; i <= 96; i++) { const w = i / 96; P.push([w, pfeRadius(w, 0, stalked)], [w, -pfeRadius(w, Math.PI, stalked)]); }
  let best = 0;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) best = Math.max(best, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  PFE_CHORD.set(stalked, best);
  return best;
}
/**
 * The fibroelastoma: a round body with frond-like extensions on the aortic face of the cusp,
 * its longest chord on the long-axis plane D (cm). On a stalk (stalk, cm) it moves on its own
 * (wag, rad) and with the flow, up the root while the valve is open; without one it sits on the
 * cusp. Its middle lies on the long-axis plane.
 */
function pfeMesh(ev, p, st, avPos, A) {
  const gp = geom(ev, 'plax'), np = of3(gp.n);
  const P = vadd(at(avPos, A.i), A.off);
  let u = vsub(at(avPos, A.i), at(avPos, A.j));
  const upA = vunit(of3(ev.anat.aorticRoot));
  u = vlen(u) > 1e-6 ? vunit(u) : upA;
  if (vdot(u, upA) < -0.2) u = vmul(u, -1);
  // the flow carries it up the root while the valve is open
  u = vunit(vlerp(u, upA, (p.stalk > 0 ? 0.5 : 0.15) * clamp(st.drive.av || 0, 0, 1)));
  if (p.wag) u = turn(u, np, p.wag);
  // the body's length along its axis, so that its outline's longest chord on the plane is D
  const stalked = p.stalk > 0, Lb = p.D / pfeChord(stalked);
  const att = toPlane(P, gp);
  const C = toPlane(vadd(att, vmul(u, p.stalk + Lb / 2)), gp);
  const dir = vunit(vsub(C, att));
  const { e1, e2 } = frame(dir, np);
  const EMB = 0.06;
  const base = vsub(att, vmul(dir, EMB));
  const zs = EMB + p.stalk, len = zs + Lb;
  const r = (z, th) => Math.max(0.02, z < zs ? (stalked ? 0.05 : 0.3 * Lb) : Lb * pfeRadius((z - zs) / Lb, th, stalked));
  const mesh = revolve(base, dir, e1, e2, len, r, 30, 28);
  return { meshes: [mesh], axis: { att, C, dir, from: p.stalk } };
}

/**
 * The masses at cycle state st for the chapter's values p ({ kind, ...sizes }): { meshes:
 * [{ pos, index }], world cm; axis: the mass's own points for the calipers, world cm }.
 */
function meshesAt(ev, p, st, rest) {
  const A = anchorsOf(ev);
  if (p.kind === 'myxoma' && p.L > 0 && A.myx.ann) return myxomaMesh(ev, p, st, rest ? ev.myo.rest : ev.myo.pos, A.myx);
  if (p.kind === 'thrombus' && p.T > 0) return thrombusMeshes(ev, p, rest ? ev.myo.rest : ev.myo.pos, A.thr);
  if (p.kind === 'pfe' && p.D > 0 && A.pfe) {
    const av = ev.valves.find((v) => v.mesh.name === 'AorticValve');
    return pfeMesh(ev, p, st, rest ? av.rest : av.pos, A.pfe);
  }
  return { meshes: [], axis: null };
}
const REST = { s: 0, t: 0, drive: { mv: 1, tv: 1, av: 0, pv: 0 } };

/**
 * The image items for echo.js underWalls: with an enhancing agent (p.uea), the cavities (the walls'
 * inner loops) bright first; then each mass, filled, with a bright surface, its speckle riding
 * with it (refs: the mass at rest). The masses' loops on the plane go to ev.massLoops, and the
 * mass's own points (meshesAt axis) to ev.massAxis, for the chapter's calipers.
 */
export function massItems(ev, p, { loops, outer, state }) {
  const items = [];
  if (p.uea) items.push({ polys: loops.filter((L) => !outer.includes(L)).map((L) => L.pts), e: ECHO_UEA.cavity, blood: true });
  ev.massLoops = [];
  const now = meshesAt(ev, p, state, false), rest = meshesAt(ev, { ...p, wob: 0, wag: 0 }, REST, true);
  ev.massAxis = now.axis;
  const E = p.uea ? ECHO_UEA[p.kind] : ECHO[p.kind];
  const g = ev.g;
  const cut = (m, r, closed) => {
    const ref = r && r.pos.length === m.pos.length ? r.pos : null;
    const L = section(m.pos, m.index, g, ref).filter((x) => x.pts.length > 2 && (!closed || x.closed));
    return { pts: L.map((x) => x.pts), refs: ref ? L.map((x) => x.ref) : null };
  };
  now.meshes.forEach((m, k) => {
    const L = cut(m, rest.meshes[k], true);
    if (!L.pts.length) return;
    ev.massLoops.push(...L.pts);
    items.push({ polys: L.pts, refs: L.refs, e: E.fill });
    items.push({ borders: L.pts, refs: L.refs, e: E.fill + E.edge, spec: 6, w: 0.07, closed: true, all: true });
  });
  // the darker areas inside, and the faint layers of a thrombus (not with the agent, which hides them)
  (now.holes || []).forEach((m, k) => {
    const L = cut(m, rest.holes && rest.holes[k], true);
    if (L.pts.length) items.push({ polys: L.pts, refs: L.refs, e: E.hole });
  });
  if (!p.uea) {
    (now.layers || []).forEach((m, k) => {
      const L = cut(m, rest.layers && rest.layers[k], false);
      if (L.pts.length) items.push({ lines: L.pts, refs: L.refs, e: E.layer, w: 0.045 });
    });
  }
  return items;
}

/** The myxoma's channel through the open mitral valve on heart (ev): for the measurement of the model's geometry. */
export function myxomaGeometry(ev) {
  const A = anchorsOf(ev).myx;
  return A && A.ann ? { H: A.H, ann: A.ann, wLat: A.wLat, reach: A.reach } : null;
}
