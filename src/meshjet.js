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

/**
 * The parasternal LV calipers, measured as echo.js drawCalipers measures them: along the beam
 * through the point 30% of the way from the LV's middle to the mitral valve (the heart's anchors
 * at systolic weight s), the septum's last crossing and the posterior wall's first. Returns
 * { ivs, lv, pw } as [from, to] in cm, or null.
 */
export function plaxCalipers(ev, s) {
  const an = ev.anchors(s);
  const p = onPlane(ev, an.lv.clone().lerp(an.mv, 0.3));
  const P0 = [p[0], p[1] - 9];
  const iv = ev.intervals(ev.last.tissue, P0, [0, 1], 18);
  const before = iv.filter((q) => q[1] < 9), after = iv.filter((q) => q[0] > 9);
  if (!before.length || !after.length) return null;
  const s1 = before[before.length - 1], s2 = after[0];
  const at = (t) => [P0[0], P0[1] + t];
  return { ivs: [at(s1[0]), at(s1[1])], lv: [at(s1[1]), at(s2[0])], pw: [at(s2[0]), at(s2[1])] };
}
