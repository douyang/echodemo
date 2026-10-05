// The septal defects of the shunts chapter on the heart mesh. The septa are found once on the
// normal mesh by the myocardium's regions. The atrial septum is the LA wall within 1.2 cm of the
// RA wall, and the RA wall within 1.2 cm of the LA wall. The membranous septum is the LV wall
// just below the aortic valve that faces the RV, about 11 o'clock round the aortic root on the
// short axis. In each frame a defect takes its centre from those vertices as the heart is drawn
// (the morphed mesh, so it follows the beat and the heart the page shows), and moves it into the
// view that measures it. The defect is a disc of radius R round its axis, through a slab of the
// septum; a view's plane cuts it as a polygon (cm on the plane), which the echo draws as blood
// over the septum (echo.js setShapes). A VSD's cut also stops 1.5 mm into the blood on each side
// of the wall it crosses on that plane, so it opens the LV into the RV and no further.

// region of a myocardial vertex: its colour x 10 (gl/phenomesh.js)
const LV = 1, RV = 2, LA = 3, RA = 4, AO = 5;

// the membranous septum's site round the aortic root: the tricuspid valve's side, turned VSD_TURN
// degrees toward the pulmonary valve. On the model the tricuspid valve lies 6 degrees from the
// commissure of the right and non-coronary cusps, and the pulmonary valve 103 degrees. The site
// lies under the right coronary cusp next to that commissure, where the LV outflow first meets
// the RV and no longer the RA. The wall within VSD_WIN degrees of it.
const VSD_TURN = 35, VSD_WIN = 20;

/** A grid of the points of pos whose index passes keep, for searches within r. */
function gridOf(pos, keep, cell) {
  const g = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    if (!keep(i)) continue;
    const k = `${Math.floor(pos[3 * i] / cell)},${Math.floor(pos[3 * i + 1] / cell)},${Math.floor(pos[3 * i + 2] / cell)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(i);
  }
  return { g, cell, pos };
}
/** Whether a point of grid G lies within r of (x, y, z). */
function within(G, x, y, z, r) {
  const { g, cell, pos } = G, R = Math.ceil(r / cell);
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    const L = g.get(`${cx + a},${cy + b},${cz + c}`);
    if (!L) continue;
    for (const j of L) if (Math.hypot(pos[3 * j] - x, pos[3 * j + 1] - y, pos[3 * j + 2] - z) < r) return true;
  }
  return false;
}

const FOUND = new WeakMap();
/**
 * The septa's vertices on the normal mesh of model (model3d.js loadModel), found once:
 * { ias: { left, right }, vsd: { wall, axis } }. ias: the LA and RA faces of the atrial septum,
 * lists of myocardial vertex indices. vsd: the LV wall of the membranous septum (indices), and
 * its axis (world, unit), radial from the aortic root toward the RV.
 */
export function septaOf(model) {
  if (FOUND.has(model)) return FOUND.get(model);
  const geo = model.heart.meshes.Myocardium.geometry, pos = geo.attributes.position.array, col = geo.attributes.color;
  const n = pos.length / 3, REG = new Uint8Array(n);
  for (let i = 0; i < n; i++) REG[i] = Math.round(col.getX(i) * 10);
  const of = (...r) => gridOf(pos, (i) => r.includes(REG[i]), 0.6);
  const G = { la: of(LA), ra: of(RA), rv: of(RV) };
  const near = (i, Gx, r) => within(Gx, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], r);
  // the membranous septum: below the aortic valve's centre along the root's axis (0.2 to 1.3 cm),
  // within 2.6 cm of that axis, and within VSD_WIN degrees of the site's direction round it
  const A = model.anat.normal(), av = A.point('av', 0, 0), ax = A.aorticRoot;
  const radial = (p) => { const d = p.clone().sub(av); d.addScaledVector(ax, -d.dot(ax)); return d.normalize(); };
  const uT = radial(A.point('tv', 0, 0)), uP = radial(A.point('pv', 0, 0));
  const w = ax.clone().cross(uT).normalize();
  if (w.dot(uP) < 0) w.negate();
  const th = (VSD_TURN * Math.PI) / 180, u = uT.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th));
  const cosWin = Math.cos((VSD_WIN * Math.PI) / 180);
  const below = (i) => {
    const x = pos[3 * i] - av.x, y = pos[3 * i + 1] - av.y, z = pos[3 * i + 2] - av.z;
    const h = x * ax.x + y * ax.y + z * ax.z;
    if (h < -1.3 || h > -0.2) return false;
    const rx = x - h * ax.x, ry = y - h * ax.y, rz = z - h * ax.z, r = Math.hypot(rx, ry, rz);
    return r < 2.6 && (rx * u.x + ry * u.y + rz * u.z) / (r || 1) > cosWin;
  };
  const out = { ias: { left: [], right: [] }, vsd: { wall: [], axis: [u.x, u.y, u.z] } };
  for (let i = 0; i < n; i++) {
    const r = REG[i];
    if (r === LA && near(i, G.ra, 1.2)) out.ias.left.push(i);
    else if (r === RA && near(i, G.la, 1.2)) out.ias.right.push(i);
    else if ((r === LV || r === AO) && below(i) && near(i, G.rv, 1.6)) out.vsd.wall.push(i);
  }
  FOUND.set(model, out);
  return out;
}

/** The mean of the points of pos at the indices list. */
function meanOf(pos, list) {
  const c = [0, 0, 0];
  for (const i of list) { c[0] += pos[3 * i]; c[1] += pos[3 * i + 1]; c[2] += pos[3 * i + 2]; }
  return c.map((v) => v / Math.max(1, list.length));
}

/**
 * A septum's centre and axis on the heart as drawn: pos, the myocardium's morphed positions
 * (echo.js MeshData.pos, world cm); faces, { left, right } of septaOf. { C, N }: C midway between
 * the faces' means, N the unit vector from the left face's mean to the right face's.
 */
export function septumFrame(pos, faces) {
  const a = meanOf(pos, faces.left), b = meanOf(pos, faces.right);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1;
  return { C: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], N: d.map((v) => v / l), gap: l };
}

/** Of the vertices in list, those within near cm of plane P ({ O, n }) at rest (echo.js MeshData.rest); all of them when fewer than 4 are. */
function nearPlane(ev, list, P, near) {
  const rest = ev.myo.rest, nx = P.n.x, ny = P.n.y, nz = P.n.z, k = P.O.x * nx + P.O.y * ny + P.O.z * nz;
  const out = list.filter((i) => Math.abs(rest[3 * i] * nx + rest[3 * i + 1] * ny + rest[3 * i + 2] * nz - k) < near);
  return out.length >= 4 ? out : list;
}

/**
 * A frame { C, N } moved into plane P: C to its foot on P, and N turned into P (kept when it is
 * nearly square to P). The view that measures the defect then cuts it through its middle and
 * along its axis, so its cut is the defect's diameter wide.
 */
export function intoPlane(f, P) {
  const n = P.n, dn = (f.C[0] - P.O.x) * n.x + (f.C[1] - P.O.y) * n.y + (f.C[2] - P.O.z) * n.z;
  const C = [f.C[0] - dn * n.x, f.C[1] - dn * n.y, f.C[2] - dn * n.z];
  const k = f.N[0] * n.x + f.N[1] * n.y + f.N[2] * n.z;
  const N = [f.N[0] - k * n.x, f.N[1] - k * n.y, f.N[2] - k * n.z], l = Math.hypot(...N);
  return { ...f, C, N: l > 0.3 ? N.map((v) => v / l) : f.N };
}

/**
 * The atrial septal defect's centre and axis on the heart as drawn, in the view that measures it:
 * of each face, the vertices within near cm of plane P ({ O, n }, world) at end-diastole (echo.js
 * MeshData.rest, which holds the heart shown with the chapter's disease); septumFrame of those
 * as they move, moved into P (intoPlane). ev: the EchoView after its morph (frame()).
 */
export function defectFrame(ev, faces, P, near = 0.5) {
  return intoPlane(septumFrame(ev.myo.pos, { left: nearPlane(ev, faces.left, P, near), right: nearPlane(ev, faces.right, P, near) }), P);
}

/**
 * Frame f ({ C, N }, in plane P) moved off cm along the septum: square to N in P, toward the
 * world point toward (a THREE.Vector3).
 */
export function slide(f, P, toward, off) {
  const n = P.n, N = f.N;
  let t = [n.y * N[2] - n.z * N[1], n.z * N[0] - n.x * N[2], n.x * N[1] - n.y * N[0]];
  const l = Math.hypot(...t) || 1;
  t = t.map((v) => v / l);
  if ((toward.x - f.C[0]) * t[0] + (toward.y - f.C[1]) * t[1] + (toward.z - f.C[2]) * t[2] < 0) t = t.map((v) => -v);
  return { ...f, C: f.C.map((v, i) => v + off * t[i]) };
}

/**
 * The ventricular septal defect's centre and axis on the heart as drawn, in the view that
 * measures it: the mean of the wall's vertices near plane P (as defectFrame) as they move, and
 * the septum's axis (septaOf), moved into P.
 */
export function wallFrame(ev, site, P, near = 0.5) {
  const C = meanOf(ev.myo.pos, nearPlane(ev, site.wall, P, near));
  return intoPlane({ C, N: site.axis, gap: 0 }, P);
}

/**
 * Plane key of ev moved along its normal by shift cm (echo.js viewGeometry, as setShift moves
 * it), whatever shift ev itself has: { O, n }, or null.
 */
export function planeOf(ev, key, shift = 0) {
  const g = ev.geoms && ev.geoms[key];
  if (!g) return null;
  return { O: g.O.clone().addScaledVector(g.n, shift - (ev.shift || 0)), n: g.n };
}

/**
 * The cut of a defect on plane g (echo.js: O, r, d, n): the disc of radius R (cm) round axis N
 * through C, in the slab |(X - C).N| <= h. Returns { poly, c, dn, p0 } (poly, c and p0 in plane
 * cm: the outline, 64 points, its middle, and C's foot on the plane; dn, C's distance off the
 * plane), or null when the plane misses the defect.
 */
export function cutOf(g, C, N, R, h, k = 64) {
  if (!(R > 0)) return null;
  const vx = C[0] - g.O.x, vy = C[1] - g.O.y, vz = C[2] - g.O.z;
  const cu = vx * g.r.x + vy * g.r.y + vz * g.r.z, cv = vx * g.d.x + vy * g.d.y + vz * g.d.z, dn = vx * g.n.x + vy * g.n.y + vz * g.n.z;
  const rN = g.r.x * N[0] + g.r.y * N[1] + g.r.z * N[2], dN = g.d.x * N[0] + g.d.y * N[1] + g.d.z * N[2], nN = g.n.x * N[0] + g.n.y * N[1] + g.n.z * N[2];
  // the plane's point nearest C: (cu, cv). From there along each direction of the plane, the
  // distance to the slab's faces (linear) and to the disc's rim (a quadratic)
  const s0 = -dn * nN;
  if (Math.abs(s0) > h || dn * dn - s0 * s0 > R * R) return null;
  const poly = [];
  for (let i = 0; i < k; i++) {
    const th = (2 * Math.PI * i) / k, c = Math.cos(th), s = Math.sin(th);
    const sg = c * rN + s * dN;
    let t = Infinity;
    if (sg > 1e-9) t = (h - s0) / sg;
    else if (sg < -1e-9) t = (-h - s0) / sg;
    const A = 1 - sg * sg, B = -2 * s0 * sg, Cq = dn * dn - s0 * s0 - R * R;
    const tr = A > 1e-9 ? (-B + Math.sqrt(Math.max(0, B * B - 4 * A * Cq))) / (2 * A) : (B < -1e-9 ? -Cq / B : Infinity);
    t = Math.min(t, tr);
    poly.push([cu + t * c, cv + t * s]);
  }
  let mx = 0, my = 0;
  for (const p of poly) { mx += p[0]; my += p[1]; }
  return { poly, c: [mx / k, my / k], dn, p0: [cu, cv] };
}

/** N on plane g: its unit direction on the plane, [across, depth], or null when N is square to the plane. */
export function axisOnPlane(g, N) {
  const u = g.r.x * N[0] + g.r.y * N[1] + g.r.z * N[2], v = g.d.x * N[0] + g.d.y * N[1] + g.d.z * N[2], l = Math.hypot(u, v);
  return l > 0.2 ? [u / l, v / l] : null;
}

/** Whether plane point q lies in the section's wall: inside an odd number of its closed loops (echo.js draws the walls even-odd). */
function inWall(loops, q) {
  let k = 0;
  for (const P of loops) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    if (c) k++;
  }
  return k % 2 === 1;
}

/**
 * A defect's cut stopped at the wall it crosses on this plane: of cut (cutOf), the part from m cm
 * into the blood on one side of the wall to m cm into the blood on the other, along dir (the
 * axis on the plane, axisOnPlane) through C's foot. ev: the EchoView in its frame (ev.last holds
 * the section's walls). The wall is the one round C's foot, or else the first one along the axis
 * within 1.2 cm of it. Returns the cut with its outline clipped and its span along dir
 * ([lo, hi], cm from C's foot), or null when no wall is near.
 */
export function throughWall(ev, cut, dir, m = 0.15) {
  if (!cut || !dir || !ev.last) return cut;
  const loops = ev.last.tissue.filter((W) => W.closed && W.pts.length > 2).map((W) => W.pts);
  const p0 = cut.p0, at = (t) => [p0[0] + t * dir[0], p0[1] + t * dir[1]];
  const STEP = 0.02, FAR = 2.5;
  // from t along sign, the first step where the wall test turns to want
  const until = (t0, sign, want) => {
    for (let t = t0; Math.abs(t) <= FAR; t += sign * STEP) if (inWall(loops, at(t)) === want) return t;
    return null;
  };
  let lo = null, hi = null;
  if (inWall(loops, p0)) {
    hi = until(0, 1, false); lo = until(0, -1, false);
  } else {
    for (const sign of [1, -1]) {
      const a = until(0, sign, true);
      if (a === null || Math.abs(a) > 1.2) continue;
      const b = until(a, sign, false);
      if (b === null) continue;
      [lo, hi] = sign > 0 ? [a, b] : [b, a];
      break;
    }
  }
  if (lo === null || hi === null) return null;
  lo -= m; hi += m;
  // the outline clipped to lo <= (p - p0).dir <= hi (Sutherland-Hodgman, one side at a time)
  const along = (p) => (p[0] - p0[0]) * dir[0] + (p[1] - p0[1]) * dir[1];
  const side = (P, keep) => {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], sa = keep(a), sb = keep(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out;
  };
  const poly = side(side(cut.poly, (p) => along(p) - lo), (p) => hi - along(p));
  if (poly.length < 3) return null;
  let mx = 0, my = 0;
  for (const p of poly) { mx += p[0]; my += p[1]; }
  return { ...cut, poly, c: [mx / poly.length, my / poly.length], span: [lo, hi] };
}
