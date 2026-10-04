// Overlays on an echo view cut from the heart mesh that need the section's own shapes: a valve's
// hinge points and closure point, a chamber's cavity, and the parasternal LV calipers. The
// chapters draw their jets (echo2d.js jet), calipers and measurement boxes on them. Each takes
// an EchoView after frame() and works in plane cm, the coordinates of echo2d.js overlays.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];
export { sub, add, mul, dot, len, unit, perp };

/** A world point of the heart on the view's plane (cm). */
export function onPlane(ev, p) {
  const q = ev.toPlane(p, ev.g);
  return [q[0], q[1]];
}

/** The section's walls, and with valves the leaflets too, as segments [a, b]. */
function segments(ev, valves = true) {
  const segs = [];
  const put = (L) => { const P = L.pts, m = P.length; for (let i = 0; i < m - 1 + (L.closed ? 1 : 0); i++) segs.push([P[i], P[(i + 1) % m]]); };
  for (const W of ev.last.tissue) put(W);
  if (valves) for (const V of ev.last.valves) put(V);
  return segs;
}

/** How far the ray from C along dir runs before it meets a segment: Infinity if it meets none. */
function cast(C, dir, segs) {
  let best = Infinity;
  for (const [a, b] of segs) {
    const e = sub(b, a), den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, C);
    const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
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

/** The point of segment a-b nearest p. */
function onSeg(p, a, b) {
  const e = sub(b, a), l2 = e[0] * e[0] + e[1] * e[1] || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2));
  return add(a, mul(e, t));
}

/**
 * Where a valve's annulus ring crosses the plane: the middles of the two small loops (under
 * 1.2 cm round) farthest apart, or null when the plane misses the ring.
 */
export function hingesOf(ev, valve) {
  const rings = ev.last.valves.filter((V) => V.valve === valve && V.closed && V.pts.length > 2).map((V) => {
    let per = 0;
    for (let i = 1; i < V.pts.length; i++) per += len(sub(V.pts[i], V.pts[i - 1]));
    return { per, p: mul(V.pts.reduce((a, q) => add(a, q), [0, 0]), 1 / V.pts.length) };
  }).filter((r) => r.per < 1.2);
  if (rings.length < 2) return null;
  let h = [rings[0].p, rings[1].p], far = len(sub(h[0], h[1]));
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const d = len(sub(rings[i].p, rings[j].p));
    if (d > far) { far = d; h = [rings[i].p, rings[j].p]; }
  }
  return far >= 1 ? h : null;
}

/**
 * The leaflets of a valve on the plane: its loops and runs but the annulus ring's small loops.
 */
export function leafletsOf(ev, valve) {
  return ev.last.valves.filter((V) => {
    if (V.valve !== valve || V.pts.length < 2) return false;
    if (!V.closed) return true;
    let per = 0;
    for (let i = 1; i < V.pts.length; i++) per += len(sub(V.pts[i], V.pts[i - 1]));
    return per >= 1.2;
  }).map((V) => V.pts);
}

/**
 * The deepest point of blood near p: of the points on a grid within r cm of p, the one in no
 * wall (an even number of the closed wall loops round it) and farthest from every wall and
 * valve. Returns p when it finds none.
 */
export function blood(ev, p, r = 1.2) {
  const loops = ev.last.tissue.filter((W) => W.closed && W.pts.length > 2).map((W) => W.pts);
  const segs = segments(ev);
  let best = null, room = -1;
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const q = [p[0] + (i * r) / 4, p[1] + (j * r) / 4];
    if (i * i + j * j > 16) continue;
    if (loops.reduce((k, P) => (inside(P, q[0], q[1]) ? k + 1 : k), 0) % 2) continue;
    let d = Infinity;
    for (const [a, b] of segs) d = Math.min(d, len(sub(onSeg(q, a, b), q)));
    if (d > room) { room = d; best = q; }
  }
  return best || p;
}

/**
 * A chamber's cavity on the plane: rays from C (in its blood) to the nearest wall or valve, each
 * cut where it crosses one of the lines cuts ([[a, b], ...]: a valve closes the chamber there),
 * as a polygon in angle order round C. Rays that meet nothing within reach cm are left out, so
 * an opening (a vein, an outflow tract) is bridged by the rays beside it.
 */
export function cavity(ev, C, cuts = [], reach = 9, n = 144) {
  const segs = segments(ev);
  // each line as its normal toward C and C's distance from it
  const lines = cuts.map(([a, b]) => {
    let nl = perp(unit(sub(b, a)));
    if (dot(sub(C, a), nl) < 0) nl = mul(nl, -1);
    return { nl, d0: dot(sub(C, a), nl) };
  });
  const P = [];
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n, dir = [Math.cos(th), Math.sin(th)];
    let t = cast(C, dir, segs);
    // the ray crosses a line where its distance from it falls to 0
    for (const { nl, d0 } of lines) {
      const rate = dot(dir, nl);
      if (rate < -1e-9) t = Math.min(t, d0 / -rate);
    }
    if (t <= reach) P.push(add(C, mul(dir, t)));
  }
  return P;
}

/** The area of polygon P (cm²). */
export function area(P) {
  let s = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += P[j][0] * P[i][1] - P[i][0] * P[j][1];
  return Math.abs(s) / 2;
}

/** The middle of the points P. */
export function middle(P) {
  return mul(P.reduce((a, q) => add(a, q), [0, 0]), 1 / Math.max(1, P.length));
}

/**
 * Where a shut valve's leaflets meet on the plane: the pair of points of two leaflets nearest
 * each other; with one leaflet (they merge where they touch), its point farthest along dir (cm
 * from M). Null when the plane shows no leaflet.
 */
export function closureOf(ev, valve, M, dir) {
  const L = leafletsOf(ev, valve);
  if (!L.length) return null;
  if (L.length === 1) {
    let best = L[0][0];
    for (const p of L[0]) if (dot(sub(p, M), dir) > dot(sub(best, M), dir)) best = p;
    return best;
  }
  // the two longest leaflets
  const lenOf = (P) => P.reduce((s, p, i) => (i ? s + len(sub(p, P[i - 1])) : 0), 0);
  const [A, B] = L.slice().sort((x, y) => lenOf(y) - lenOf(x));
  let best = null, gap = Infinity;
  for (const p of A) for (const q of B) {
    const d = len(sub(p, q));
    if (d < gap) { gap = d; best = mul(add(p, q), 0.5); }
  }
  return best;
}

// each valve mesh's annulus ring (the smaller connected part of the valve model), found once
const RINGS = new WeakMap();
function ringOf(mesh) {
  if (RINGS.has(mesh)) return RINGS.get(mesh);
  const g = mesh.geometry, idx = g.index.array, n = g.attributes.position.count;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let f = 0; f < idx.length; f += 3) { const a = find(idx[f]); par[find(idx[f + 1])] = a; par[find(idx[f + 2])] = a; }
  const cnt = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
  // a valve model of one part (the aortic valve's cusps) has no ring
  const ring = new Uint8Array(n);
  if (cnt.size > 1) {
    const root = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
    for (let i = 0; i < n; i++) ring[i] = find(i) === root ? 1 : 0;
  }
  RINGS.set(mesh, ring);
  return ring;
}

/**
 * A valve's orifice seen along its axis (14), as the frame now shapes it: the open area inside
 * the leaflets, the area that planimetry at the tips traces. Round the point of the orifice
 * farthest from every leaflet point, the nearest leaflet point in each of 180 directions bounds
 * it. Returns A (cm², en face) and P, the trace on the view's plane (cm): that edge, smoothed,
 * in a plane square to the axis at the tips' mean depth, scaled about its middle to area A.
 * Null when the leaflets do not ring it.
 * frame: { c, n } (world), the valve's centre and axis, for a valve model with no ring.
 */
export function enFaceOrifice(ev, valve, frame = null) {
  const vd = ev.valves.find((v) => v.mesh.name === valve);
  if (!vd) return null;
  const p = vd.pos, ring = ringOf(vd.mesh), m = p.length / 3;
  let cx = 0, cy = 0, cz = 0, N = [1, 1, 1];
  if (frame) {
    // the valve's centre and axis given (the aortic valve: its centre and the root's axis)
    [cx, cy, cz] = [frame.c.x, frame.c.y, frame.c.z];
    N = [frame.n.x, frame.n.y, frame.n.z];
  } else {
    let k = 0;
    for (let i = 0; i < m; i++) if (ring[i]) { cx += p[3 * i]; cy += p[3 * i + 1]; cz += p[3 * i + 2]; k++; }
    if (!k) return null;
    cx /= k; cy /= k; cz /= k;
    // the ring's least axis: power iteration on (trace I - covariance)
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (let i = 0; i < m; i++) if (ring[i]) { const x = p[3 * i] - cx, y = p[3 * i + 1] - cy, z = p[3 * i + 2] - cz; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
    const tr = xx + yy + zz;
    for (let it = 0; it < 60; it++) {
      const v = [(tr - xx) * N[0] - xy * N[1] - xz * N[2], -xy * N[0] + (tr - yy) * N[1] - yz * N[2], -xz * N[0] - yz * N[1] + (tr - zz) * N[2]];
      const l = Math.hypot(v[0], v[1], v[2]) || 1; N = [v[0] / l, v[1] / l, v[2] / l];
    }
  }
  let e1 = Math.abs(N[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dd = e1[0] * N[0] + e1[1] * N[1] + e1[2] * N[2];
  e1 = [e1[0] - dd * N[0], e1[1] - dd * N[1], e1[2] - dd * N[2]];
  const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2 = [N[1] * e1[2] - N[2] * e1[1], N[2] * e1[0] - N[0] * e1[2], N[0] * e1[1] - N[1] * e1[0]];
  const U = [], I = [];
  for (let i = 0; i < m; i++) {
    if (ring[i]) continue;
    const x = p[3 * i] - cx, y = p[3 * i + 1] - cy, z = p[3 * i + 2] - cz;
    U.push(x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]);
    I.push(i);
  }
  let best = [0, 0], room = -1;
  for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
    const u = a * 0.12, v = b * 0.12;
    let r = Infinity;
    for (let j = 0; j < U.length; j += 2) { const d = (U[j] - u) ** 2 + (U[j + 1] - v) ** 2; if (d < r) r = d; }
    if (r > room) { room = r; best = [u, v]; }
  }
  const K = 180, R = new Float64Array(K).fill(Infinity), who = new Int32Array(K).fill(-1);
  for (let j = 0; j < U.length; j += 2) {
    const du = U[j] - best[0], dv = U[j + 1] - best[1], r = Math.hypot(du, dv);
    const s = Math.floor((((Math.atan2(dv, du) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * K) % K;
    if (r < R[s]) { R[s] = r; who[s] = I[j / 2]; }
  }
  let A = 0, h = 0, nh = 0;
  for (let s = 0; s < K; s++) {
    if (!Number.isFinite(R[s])) continue;
    A += 0.5 * R[s] * R[s] * ((2 * Math.PI) / K);
    const i = who[s];
    h += (p[3 * i] - cx) * N[0] + (p[3 * i + 1] - cy) * N[1] + (p[3 * i + 2] - cz) * N[2];
    nh++;
  }
  if (nh < K / 2) return null;
  h /= nh;
  // the trace: the edge smoothed over 5 directions, in one plane square to the axis at the tips'
  // mean depth, mapped onto the view's plane as echo.js toPlane maps it
  const P = [], g = ev.g;
  for (let s = 0; s < K; s++) {
    let r = 0, w = 0;
    for (let k = -2; k <= 2; k++) { const q = R[(s + k + K) % K]; if (Number.isFinite(q)) { r += q; w++; } }
    if (!w) continue;
    r /= w;
    const a = ((s + 0.5) * 2 * Math.PI) / K, u = best[0] + r * Math.cos(a), v = best[1] + r * Math.sin(a);
    const x = cx + u * e1[0] + v * e2[0] + h * N[0], y = cy + u * e1[1] + v * e2[1] + h * N[1], z = cz + u * e1[2] + v * e2[2] + h * N[2];
    const qx = x - g.O.x, qy = y - g.O.y, qz = z - g.O.z;
    P.push([qx * g.r.x + qy * g.r.y + qz * g.r.z, qx * g.d.x + qy * g.d.y + qz * g.d.z]);
  }
  // the trace keeps the area seen along the axis: the plane's tilt to the axis shrinks the
  // projection (by 13 to 22% at the aortic valve, and 2 to 5% at the normal heart's mitral valve)
  const Ap = area(P);
  if (Ap > 1e-6) {
    const M = middle(P), k = Math.sqrt(A / Ap);
    for (let i = 0; i < P.length; i++) P[i] = add(M, mul(sub(P[i], M), k));
  }
  return { A, P };
}

/**
 * The parasternal LV calipers, measured as echo.js drawCalipers measures them: square to the LV's
 * long axis through the point 30% of the way from the LV's middle to the mitral valve (the
 * heart's anchors at systolic weight s; echo.js caliperLine), the septum's last crossing and the
 * posterior wall's first. Returns { ivs, lv, pw } as [from, to] in cm and dir, the line's
 * direction, or null.
 */
export function plaxCalipers(ev, s) {
  const { P0, dir } = ev.caliperLine(s);
  const iv = ev.intervals(ev.last.tissue, P0, dir, 18);
  const before = iv.filter((q) => q[1] < 9), after = iv.filter((q) => q[0] > 9);
  if (!before.length || !after.length) return null;
  const s1 = before[before.length - 1], s2 = after[0];
  const at = (t) => [P0[0] + t * dir[0], P0[1] + t * dir[1]];
  return { ivs: [at(s1[0]), at(s1[1])], lv: [at(s1[1]), at(s2[0])], pw: [at(s2[0]), at(s2[1])], dir };
}
