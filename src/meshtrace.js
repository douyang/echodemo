// The LV traced on an echo view cut from the heart mesh, as Lang 2015 traces it for the
// biplane method of disks: the border of the compacted myocardium round the LV cavity, closed
// by a straight line between the mitral valve's two hinge points; L from the middle of that
// line to the farthest point of the border; the disks square to L. The same shape as
// echo2d.js lvTrace returns for the parametric views.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];

function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** The convex hull of points P, counterclockwise (monotone chain). */
function hull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** The point of segment a-b nearest p. */
function onSeg(p, a, b) {
  const e = sub(b, a), l2 = e[0] * e[0] + e[1] * e[1] || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2));
  return add(a, mul(e, t));
}

/**
 * ev: an EchoView after frame(); apex: the LV's apex on the plane (cm), a guide to which side of
 * the mitral valve the LV lies. Returns { border, M, A, L, disks, d, hinges } in plane cm, or null
 * when the view shows no LV to trace.
 */
export function meshTrace(ev, apex, n = 20) {
  const last = ev.last;
  if (!last) return null;
  // the walls as segments, closed loops and open runs alike
  const segs = [];
  for (const W of last.tissue) {
    const P = W.pts, m = P.length;
    for (let i = 0; i < m - 1 + (W.closed ? 1 : 0); i++) segs.push([P[i], P[(i + 1) % m]]);
  }
  if (!segs.length) return null;

  // the mitral valve's hinge points: the annulus ring of the valve model crosses the plane in
  // two small loops (about 0.5 cm round), one at each hinge
  const rings = last.valves.filter((V) => V.valve === 'MitralValve' && V.closed && V.pts.length > 2).map((V) => {
    let per = 0;
    for (let i = 1; i < V.pts.length; i++) per += len(sub(V.pts[i], V.pts[i - 1]));
    const c = V.pts.reduce((a, p) => add(a, p), [0, 0]);
    return { per, p: mul(c, 1 / V.pts.length) };
  }).filter((r) => r.per < 1.2).sort((a, b) => a.per - b.per);
  if (rings.length < 2) return null;
  let h1 = rings[0], h2 = rings[1], far = len(sub(h1.p, h2.p));
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const d = len(sub(rings[i].p, rings[j].p));
    if (d > far) { far = d; h1 = rings[i]; h2 = rings[j]; }
  }
  if (far < 1) return null;
  const M = mul(add(h1.p, h2.p), 0.5);
  // the side of the hinge line where the LV lies, and the cavity's middle
  let nrm = perp(unit(sub(h2.p, h1.p)));
  if ((apex[0] - M[0]) * nrm[0] + (apex[1] - M[1]) * nrm[1] < 0) nrm = mul(nrm, -1);
  // the rays start from the deepest point of blood on the line from M toward the apex: in no
  // wall (an even number of the closed wall loops round it) and farthest from every wall
  const loops = last.tissue.filter((W) => W.closed && W.pts.length > 2).map((W) => W.pts);
  const inWall = (p) => loops.reduce((k, P) => (inside(P, p[0], p[1]) ? k + 1 : k), 0) % 2 === 1;
  const depth = Math.max(2, (apex[0] - M[0]) * nrm[0] + (apex[1] - M[1]) * nrm[1]);
  const side = perp(nrm);
  let C = null, room = -1;
  for (let i = 1; i < 12; i++) for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const p = add(add(M, mul(nrm, (i / 12) * depth)), mul(side, off));
    if (inWall(p)) continue;
    let r = Infinity;
    for (const [a, b] of segs) r = Math.min(r, len(sub(onSeg(p, a, b), p)));
    if (r > room) { room = r; C = p; }
  }
  if (!C) return null;
  // rays from there: the nearest wall in each direction, on the LV's side of the hinge line
  const near = segs.filter(([a, b]) => len(sub(onSeg(C, a, b), C)) < 9);
  const pts = [h1.p, h2.p];
  for (let k = 0; k < 180; k++) {
    const th = (2 * Math.PI * k) / 180, dir = [Math.cos(th), Math.sin(th)];
    let best = Infinity;
    for (const [a, b] of near) {
      const e = sub(b, a), den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, C);
      const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (!Number.isFinite(best)) continue;
    const P = add(C, mul(dir, best));
    if ((P[0] - M[0]) * nrm[0] + (P[1] - M[1]) * nrm[1] > 0.05) pts.push(P);
  }
  // the compacted myocardium: the papillary muscles and the trabeculae count as cavity, so the
  // border runs over them (the convex hull; the hinge line closes it)
  const border = hull(pts);
  if (border.length < 3) return null;
  // L: from M to the farthest point of the border; disks square to it
  let A = border[0];
  for (const p of border) if (len(sub(p, M)) > len(sub(A, M))) A = p;
  const L = len(sub(A, M)), u = unit(sub(A, M)), q = perp(u);
  const poly = [...border, border[0]];
  const hit = (P, dir) => {
    let best = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], e = sub(poly[i + 1], a), den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, P);
      const t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
    }
    return best;
  };
  const disks = [], d = [];
  for (let i = 0; i < n; i++) {
    const P = add(M, mul(u, ((i + 0.5) / n) * L));
    const t1 = hit(P, q), t2 = hit(P, mul(q, -1));
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) { d.push(0); continue; }
    disks.push([add(P, mul(q, t1)), add(P, mul(q, -t2))]);
    d.push(t1 + t2);
  }
  return { M, A, L, disks, d, border: poly, hinges: [h1.p, h2.p] };
}

/** The biplane method of disks (mL) from the four- and two-chamber traces: π/4 Σ aᵢ bᵢ × L/20, L the longer length. */
export function biplane(t4, t2) {
  const n = t4.d.length, L = Math.max(t4.L, t2.L);
  let s = 0;
  for (let i = 0; i < n; i++) s += t4.d[i] * t2.d[i];
  return (Math.PI / 4) * s * (L / n);
}
