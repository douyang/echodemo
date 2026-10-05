// Infective endocarditis on the heart mesh (chapter 'endocarditis'): a vegetation on the atrial
// side of the anterior mitral leaflet and a perforation of that leaflet, for the echo views cut
// from the mesh. Both lie in the parasternal long-axis plane, which holds the apex and the centres
// of the mitral and aortic valves. The apical three-chamber view lies in the same plane, so the
// two views show one vegetation and one hole.
//
// At each frame the anterior leaflet's section in that plane gives the vegetation's base, on the
// leaflet's atrial face a fixed share of its length from the free edge, and the hole's centre.
// The vegetation is a lobulated solid of revolution in world space, its axis in the plane. It
// swings with the valve: into the LA while the valve is shut, and through the orifice into the LV
// while it is open. It also flutters. Saric 2016 (Table 5) describes this motion and a myocardial
// texture, so its section is drawn at the echogenicity of myocardium. The perforation removes the
// leaflet's section inside a sphere round the hole, so the gap on the plane is the hole's diameter.
// echo.js calls the hook (EchoView.extra) after it cuts the valves, and draws the items it returns
// before the leaflets.
import { DB } from '../bmode.js';
import { cycleAt, EV, RR } from '../cyclemodel.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const rot = (a, t) => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
const DEG = Math.PI / 180;

/** The echogenicity of the vegetation (dB against myocardium): "myocardial texture" (Saric 2016 Table 5). */
export const VEG_DB = DB.myo + 2;

// ---------------------------------------------------------------- the plane
/** A world point (THREE.Vector3) in the coordinates of plane g: [u right, v depth] (cm). */
const toUV = (g, p) => { const x = p.x - g.O.x, y = p.y - g.O.y, z = p.z - g.O.z; return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z]; };
/** A point [u, v] of plane g in world coordinates, as [x, y, z]. */
const toW = (g, q) => [g.O.x + q[0] * g.r.x + q[1] * g.d.x, g.O.y + q[0] * g.r.y + q[1] * g.d.y, g.O.z + q[0] * g.r.z + q[1] * g.d.z];
/** A direction [u, v] of plane g in world coordinates. */
const dirW = (g, q) => [q[0] * g.r.x + q[1] * g.d.x, q[0] * g.r.y + q[1] * g.d.y, q[0] * g.r.z + q[1] * g.d.z];
/** A world point [x, y, z] in the coordinates of plane g, with its distance from the plane. */
const inG = (g, p) => { const x = p[0] - g.O.x, y = p[1] - g.O.y, z = p[2] - g.O.z; return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z, x * g.n.x + y * g.n.y + z * g.n.z]; };

// ---------------------------------------------------------------- the anterior leaflet
function perimeter(P, closed) {
  let s = 0;
  for (let i = 1; i < P.length; i++) s += len(sub(P[i], P[i - 1]));
  return closed && P.length > 2 ? s + len(sub(P[0], P[P.length - 1])) : s;
}
const middle = (P) => mul(P.reduce((a, q) => add(a, q), [0, 0]), 1 / Math.max(1, P.length));
const nearestIndex = (P, q) => { let b = 0; for (let i = 1; i < P.length; i++) if (len(sub(P[i], q)) < len(sub(P[b], q))) b = i; return b; };

/** A polyline P resampled at the share f of its length (0 its first point, 1 its last). */
function along(P, f) {
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + len(sub(P[i], P[i - 1])));
  const a = clamp(f, 0, 1) * S[S.length - 1];
  for (let i = 1; i < P.length; i++) {
    if (S[i] >= a) { const t = (a - S[i - 1]) / Math.max(1e-9, S[i] - S[i - 1]); return add(P[i - 1], mul(sub(P[i], P[i - 1]), t)); }
  }
  return P[P.length - 1];
}
const lengthOf = (P) => perimeter(P, false);

/**
 * The anterior mitral leaflet on plane g at this frame (s: the systolic weight): its section, the
 * MitralValve loop nearest the aortic valve; its hinge, the end next to the section of the annulus
 * ring nearer the aortic valve; its free edge, the point farthest from the hinge; and its two
 * faces from the free edge to the hinge. The atrial face is the one away from the septum's side
 * of the leaflet's chord. Null when the plane shows no leaflet.
 */
export function leafletOn(ev, g, s) {
  const vd = ev.valves.find((v) => v.mesh.name === 'MitralValve');
  if (!vd) return null;
  const loops = vd.section(g).map((L) => ({ ...L, per: perimeter(L.pts, L.closed) }));
  const an = ev.anchors(s);
  const av = toUV(g, an.av), lvot = toUV(g, an.lvot), mv = toUV(g, an.mv), apex = toUV(g, an.apex);
  const rings = loops.filter((L) => L.closed && L.per < 1.2 && L.pts.length > 2);
  const leaves = loops.filter((L) => L.per >= 1.2 && L.pts.length > 3);
  if (!leaves.length) return null;
  const dmin = (P, q) => P.reduce((m, p) => Math.min(m, len(sub(p, q))), Infinity);
  const AL = leaves.slice().sort((a, b) => dmin(a.pts, av) - dmin(b.pts, av))[0];
  const P = AL.pts;
  const ring = rings.map((L) => middle(L.pts)).sort((a, b) => len(sub(a, av)) - len(sub(b, av)))[0];
  const iH = nearestIndex(P, ring || av);
  let iT = 0;
  for (let i = 0; i < P.length; i++) if (len(sub(P[i], P[iH])) > len(sub(P[iT], P[iH]))) iT = i;
  // the two faces, from the free edge to the hinge
  let f1, f2;
  if (AL.closed) {
    f1 = []; f2 = [];
    for (let i = iT; ; i = (i + 1) % P.length) { f1.push(P[i]); if (i === iH) break; }
    for (let i = iT; ; i = (i - 1 + P.length) % P.length) { f2.push(P[i]); if (i === iH) break; }
  } else {
    const run = iT < iH ? P.slice(iT, iH + 1) : P.slice(iH, iT + 1).reverse();
    f1 = run; f2 = run;
  }
  if (f1.length < 2 || f2.length < 2) return null;
  // the ventricular face is on the septum's side of the leaflet's chord (hinge to free edge): the
  // outflow tract lies between the leaflet and the septum in diastole, and the septum lies apical
  // to the shut leaflet in systole. The faces lie 1 mm apart, too close to compare their distances
  // from the septum, so the loop's direction tells them apart: f1 runs from the free edge on to
  // the hinge, which puts it left of the chord when the loop's area is positive.
  const septum = toUV(g, an.asw);
  const chord = sub(P[iT], P[iH]);
  const sigma = Math.sign(cross(chord, sub(septum, P[iH]))) || 1;
  let area = 0;
  for (let i = 0; i < P.length; i++) area += cross(P[i], P[(i + 1) % P.length]);
  const [atrial, vent] = AL.closed && Math.sign(area) === sigma ? [f2, f1] : [f1, f2];
  const L = 0.5 * (lengthOf(atrial) + lengthOf(vent));
  /** The nearest point to q on polyline F. */
  const onto = (F, q) => {
    let best = F[0], bd = Infinity;
    for (let i = 1; i < F.length; i++) {
      const a = F[i - 1], e = sub(F[i], a), l2 = dot(e, e) || 1e-12, t = clamp(dot(sub(q, a), e) / l2, 0, 1), p = add(a, mul(e, t)), d = len(sub(q, p));
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  /**
   * The leaflet at the share f of its length from the free edge: the atrial face, the ventricular
   * face across from it, the middle, and the normal: square to the atrial face there, toward the
   * atrial side, away from the septum's side of the chord.
   */
  const across = (f) => {
    const a = along(atrial, f), b = onto(vent, a), c = mul(add(a, b), 0.5);
    const t = unit(sub(along(atrial, Math.min(1, f + 0.06)), along(atrial, Math.max(0, f - 0.06))));
    let n = [-t[1], t[0]];
    if (Math.sign(cross(chord, n)) === sigma) n = mul(n, -1);
    return { a, b, c, n };
  };
  return { atrial, vent, L, across, tip: P[iT], hinge: P[iH], up: unit(sub(mv, apex)), lvot, mv, apex };
}

// ---------------------------------------------------------------- the vegetation's shape
const NU = 34, NPHI = 24;
/** The lobes round the vegetation: a fixed pattern, so it keeps its shape as it grows. */
const lobe = (u, f) => 0.5 * Math.sin(3 * f + 2.1 + 5 * u) + 0.3 * Math.sin(5 * f - 1.3 - 8 * u) + 0.2 * Math.sin(2 * f + 0.4 + 13 * u);
const smax = (a, b, e = 0.012) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + e * e));
/**
 * The radius (cm) of a vegetation of length L (cm) at the share u of its axis and the angle f
 * round it, before the scale that sets its maximal length. k, 0 to 1: from a sessile nodule
 * (widest at its base) to a pedunculated, lobulated mass on a narrow stalk.
 */
function radius(u, f, L, k) {
  const uc = mix(0, 0.56, k), hw = mix(1, 0.44, k);
  const Rb = Math.min(0.48, L * mix(0.42, 0.24, k));
  const body = Rb * Math.sqrt(Math.max(0, 1 - ((u - uc) / hw) ** 2));
  const r0 = mix(Rb, 0.075, k);
  const stalk = r0 * (1 - smooth((u - (uc - hw) - 0.02) / 0.1));
  const r = k > 0.05 ? smax(body, stalk) : body;
  const shag = 1 + (0.1 + 0.12 * k) * lobe(u, f) * smooth(u / 0.25) + 0.05 * Math.sin(9 * f + 23 * u);
  return Math.max(0, r * shag * (u >= 1 ? 0 : 1));
}

/** The farthest two points of the loops' points, and their distance. */
export function farthest(loops) {
  const all = loops.flat();
  let ends = [all[0], all[0]], far = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const d = len(sub(all[i], all[j]));
    if (d > far) { far = d; ends = [all[i], all[j]]; }
  }
  return { ends, far };
}

const shapes = new Map();
// a plane through the axis of a vegetation built at the origin along z, square to x
const G0 = { O: { x: 0, y: 0, z: 0 }, n: { x: 1, y: 0, z: 0 }, r: { x: 0, y: 1, z: 0 }, d: { x: 0, y: 0, z: 1 } };
/**
 * The vegetation of maximal length Lmm (mm) and mobility k: its scale, set so that its section
 * through its axis, as the plane cuts the mesh, has its farthest two points Lmm apart (ESC 2023:
 * the size of a vegetation is its maximal length). Cached.
 */
function shapeOf(Lmm, k) {
  const key = `${Lmm.toFixed(2)}|${k.toFixed(3)}`;
  if (shapes.has(key)) return shapes.get(key);
  const L = Lmm / 10, out = { L, k, sc: 1 };
  const E = farthest(sectionOf(meshOf(out, [0, 0, 0], [0, 0, 1], [1, 0, 0]), G0, [0, 0]).map((l) => l.pts)).far;
  out.sc = E > 1e-6 ? L / E : 1;
  if (shapes.size > 200) shapes.clear();
  shapes.set(key, out);
  return out;
}

/**
 * The vegetation as a mesh in world space: base B (world [x, y, z]), axis a (world unit), the
 * plane's normal nw (world unit; a lies in the plane). Returns { pos (world), loc ([z, y] for
 * each vertex, its place in the vegetation's own frame), index }.
 */
function meshOf(shape, B, a, nw) {
  const { L, k, sc } = shape;
  const ey = [a[1] * nw[2] - a[2] * nw[1], a[2] * nw[0] - a[0] * nw[2], a[0] * nw[1] - a[1] * nw[0]];
  const nv = (NU - 1) * NPHI + 2;
  const pos = new Float32Array(nv * 3), loc = new Float32Array(nv * 2);
  const put = (i, z, x, y) => {
    pos[3 * i] = B[0] + z * a[0] + x * nw[0] + y * ey[0];
    pos[3 * i + 1] = B[1] + z * a[1] + x * nw[1] + y * ey[1];
    pos[3 * i + 2] = B[2] + z * a[2] + x * nw[2] + y * ey[2];
    loc[2 * i] = z; loc[2 * i + 1] = y;
  };
  put(0, 0, 0, 0);                          // the base's centre
  put(nv - 1, L * sc, 0, 0);                // the tip
  for (let i = 1; i < NU; i++) {
    const u = i / NU;
    for (let j = 0; j < NPHI; j++) {
      // half a step round, so that no vertex lies on the plane through the axis
      const f = (2 * Math.PI * (j + 0.5)) / NPHI, r = radius(u, f, L, k) * sc;
      put(1 + (i - 1) * NPHI + j, u * L * sc, r * Math.cos(f), r * Math.sin(f));
    }
  }
  const index = [];
  const ring = (i, j) => 1 + (i - 1) * NPHI + (j % NPHI);
  for (let j = 0; j < NPHI; j++) index.push(0, ring(1, j + 1), ring(1, j));
  for (let i = 1; i < NU - 1; i++) {
    for (let j = 0; j < NPHI; j++) index.push(ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i, j), ring(i + 1, j + 1), ring(i + 1, j));
  }
  for (let j = 0; j < NPHI; j++) index.push(ring(NU - 1, j), ring(NU - 1, j + 1), nv - 1);
  return { pos, loc, index };
}

/** Closed loops where plane g cuts mesh M, in plane coordinates, each with ref: the same points in the vegetation's own frame, placed at R0. */
function sectionOf(M, g, R0) {
  const { pos, loc, index } = M, n = pos.length / 3;
  const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (pos[3 * i] - g.O.x) * g.n.x + (pos[3 * i + 1] - g.O.y) * g.n.y + (pos[3 * i + 2] - g.O.z) * g.n.z;
    sd[i] = s === 0 ? 1e-7 : s;
  }
  const pts = new Map(), adj = new Map();
  const point = (a, b) => {
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    if (!pts.has(key)) {
      const t = sd[a] / (sd[a] - sd[b]);
      const p = [pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t, pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t, pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t];
      const q = inG(g, p);
      const z = loc[2 * a] + (loc[2 * b] - loc[2 * a]) * t, y = loc[2 * a + 1] + (loc[2 * b + 1] - loc[2 * a + 1]) * t;
      pts.set(key, { p: [q[0], q[1]], r: [R0[0] + y, R0[1] + z] });
    }
    return key;
  };
  const link = (p, q) => {
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q); adj.get(q).push(p);
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
    const line = [], ref = [];
    let cur = start, prev = -1;
    for (let guard = 0; guard < 20000; guard++) {
      used.add(cur);
      const P = pts.get(cur);
      line.push(P.p); ref.push(P.r);
      let next = -1;
      for (const q of adj.get(cur)) if (q !== prev && !used.has(q)) { next = q; break; }
      if (next === -1) break;
      prev = cur; cur = next;
    }
    if (line.length > 2) loops.push({ pts: line, ref });
  }
  return loops;
}

// ---------------------------------------------------------------- the motion
/**
 * How far the vegetation has swung (0 in the LA, the valve shut; 1 through the orifice into the
 * LV, the valve open) at t ms after the R wave: it follows the mitral valve's opening 25 ms late,
 * as the inflow carries it, and returns 5 ms ahead of the valve's closure, so the closing
 * leaflets never hold it on the ventricular side.
 */
function swingAt(t) {
  const o = Math.min(1 - cycleAt(t - 25).drive.mv, 1 - cycleAt(t + 5).drive.mv);
  return smooth(clamp(o / 0.6, 0, 1));
}
/**
 * The vegetation's own motion (radians) at t ms: a recoil after each crossing that dies away,
 * and a flutter of two incommensurate periods (Saric 2016 Table 5: "high-frequency flutter,
 * oscillating, chaotic, ... independent of valve motion").
 */
function flutterAt(t) {
  const tt = ((t % RR) + RR) % RR;
  const ring = (t0, a) => { const d = ((tt - t0) % RR + RR) % RR; return a * Math.exp(-d / 85) * Math.sin((2 * Math.PI * d) / 105); };
  return 5 * DEG * Math.sin((2 * Math.PI * tt) / 113 + 0.7) + 3 * DEG * Math.sin((2 * Math.PI * tt) / 71 + 2.1)
    + ring(EV.mvo + 30, 16 * DEG) + ring(RR - 5, -12 * DEG);
}

/**
 * The vegetation's axis on the plane (a unit [u, v]) at time t: on a sessile nodule (k 0) square
 * to the leaflet's atrial face; on a pedunculated mass (k 1) swung by the valve, from the LA (along
 * the LV's long axis, leaning to the atrial side) through the orifice to the LV (toward the apex),
 * on the atrial side of the leaflet, with its flutter.
 */
function axisAt(lf, att, t, k) {
  const na = att.n, up = lf.up;
  // into the LA along the long axis, leaning 14 degrees toward the anterior leaflet's hinge, so it
  // keeps clear of the posterior leaflet; toward the apex, on the atrial side of the anterior leaflet
  const dS = unit(add(up, mul(unit(sub(lf.hinge, lf.tip)), 0.25))), dD = unit(add(mul(up, -1), mul(na, 0.35)));
  // the swing turns dS toward na and on to dD
  const sense = Math.sign(cross(dS, na)) || 1;
  let span = Math.atan2(cross(dS, dD), dot(dS, dD)) * sense;
  if (span < 0) span += 2 * Math.PI;
  span = Math.min(span, 200 * DEG);
  const fl = flutterAt(t);
  const swing = rot(dS, sense * (span * swingAt(t) + fl));
  const still = rot(na, sense * 0.6 * fl);
  // between the two by k, turning the short way
  const ang = Math.atan2(cross(still, swing), dot(still, swing));
  return rot(still, ang * k);
}

// ---------------------------------------------------------------- the perforation
/**
 * The leaflet's loops cut by a hole: every point of a MitralValve loop of plane g inside the
 * sphere (Xh, rh) goes, and each piece left closes across its cut. valves: echo.js's list, changed
 * in place. Returns the hole on the plane ({ Q, c }, the circle where the sphere meets it) or null.
 */
function cutHole(valves, g, Xh, rh) {
  const q = inG(g, Xh);
  if (!(rh > 0) || Math.abs(q[2]) >= rh) return null;
  const Q = [q[0], q[1]], c = Math.sqrt(rh * rh - q[2] * q[2]);
  const inside = (p) => len(sub(p, Q)) < c;
  const hit = (a, b) => {
    // where segment a-b crosses the circle, from a (outside) toward b (inside), or the reverse
    const d = sub(b, a), f = sub(a, Q);
    const A = dot(d, d), Bq = 2 * dot(f, d), C = dot(f, f) - c * c;
    const disc = Math.max(0, Bq * Bq - 4 * A * C), s = Math.sqrt(disc);
    const t1 = (-Bq - s) / (2 * A), t2 = (-Bq + s) / (2 * A);
    const t = t1 >= 0 && t1 <= 1 ? t1 : t2;
    return add(a, mul(d, clamp(t, 0, 1)));
  };
  for (let li = valves.length - 1; li >= 0; li--) {
    const L = valves[li];
    if (L.valve !== 'MitralValve' || !L.closed || L.pts.length < 3) continue;
    const P = L.pts;
    if (!P.some(inside)) continue;
    const s0 = P.findIndex((p) => !inside(p));
    if (s0 < 0) { valves.splice(li, 1); continue; }
    const pieces = [];
    let run = [];
    for (let k = 0; k <= P.length; k++) {
      const a = P[(s0 + k - 1 + P.length) % P.length], b = P[(s0 + k) % P.length];
      const ia = k > 0 && inside(a), ib = inside(b);
      if (k === 0) { run.push(b); continue; }
      if (!ia && !ib) run.push(b);
      else if (!ia && ib) { run.push(hit(a, b)); if (run.length > 2) pieces.push(run); run = []; }
      else if (ia && !ib) { run = [hit(b, a), b]; }
    }
    if (run.length > 1 && pieces.length) pieces[0] = [...run, ...pieces[0]];
    else if (run.length > 2) pieces.push(run);
    valves.splice(li, 1, ...pieces.filter((r) => r.length > 2).map((pts) => ({ pts, closed: true, valve: 'MitralValve' })));
  }
  return { Q, c };
}

// ---------------------------------------------------------------- the hook
/**
 * The hook for EchoView.extra (meshpanel.js o.extra): the vegetation and the perforation of the
 * values v, on any view in the parasternal long-axis plane. v: { veg (mm, the maximal length;
 * 0 for none), mob (0 sessile .. 1 pedunculated, prolapsing), hole (cm, the perforation's
 * diameter; 0 for none) }. What it finds stays on the view as ev.ie (for the overlays): the
 * vegetation's section and its farthest two points, the hole on the plane and the leaflet's
 * normal there, toward the LA, and the leaflet's free edge and hinge.
 */
export function endocarditisHook(v) {
  return (ev, g, state, valves) => {
    ev.ie = null;
    const gp = ev.geoms && ev.geoms.plax;
    if (!gp || !g) return [];
    const lf = leafletOn(ev, gp, state.s);
    if (!lf) return [];
    const nw = [gp.n.x, gp.n.y, gp.n.z];
    // plane directions and points from the long-axis plane into this view's plane
    const pt = (q) => { const w = inG(g, toW(gp, q)); return [w[0], w[1]]; };
    const dir = (q) => { const w = dirW(gp, q); return unit([w[0] * g.r.x + w[1] * g.r.y + w[2] * g.r.z, w[0] * g.d.x + w[1] * g.d.y + w[2] * g.d.z]); };
    const ie = { tip: pt(lf.tip), hinge: pt(lf.hinge), up: dir(lf.up), veg: null, hole: null };
    const items = [];
    // the perforation: in the leaflet's body, at 62% of its length from the free edge
    if (v.hole > 0) {
      const h = lf.across(0.62);
      const cut = cutHole(valves, g, toW(gp, h.c), v.hole / 2);
      if (cut) ie.hole = { ...cut, n: dir(h.n), d: v.hole };
    }
    // the vegetation: its base on the atrial face at the line of closure, where the leaflets part
    // in systole: at 30% of the leaflet's length from the free edge (on the five hearts the closed
    // leaflets touch over 5% to 25% of it)
    if (v.veg > 0) {
      const att = lf.across(0.3);
      const k = clamp(v.mob ?? 1, 0, 1);
      const ax = axisAt(lf, att, state.t ?? 0, k);
      const base = sub(att.a, mul(att.n, 0.03));
      const shape = shapeOf(v.veg, k);
      const M = meshOf(shape, toW(gp, base), dirW(gp, ax), nw);
      const loops = sectionOf(M, g, pt(lf.mv));
      if (loops.length) {
        const polys = loops.map((L) => L.pts), refs = loops.map((L) => L.ref);
        items.push({ polys, refs, e: VEG_DB }, { borders: polys, refs, e: VEG_DB, spec: 6, w: 0.05, closed: true });
        // its maximal length on the plane: the farthest two points of its section
        const F = farthest(polys);
        ie.veg = { polys, ends: F.ends, length: F.far, base: pt(base), axis: dir(ax) };
      }
    }
    ev.ie = ie;
    return items;
  };
}
