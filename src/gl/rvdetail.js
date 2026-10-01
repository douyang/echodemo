// Three changes to the heart model when it loads (model3d.js), after the pulmonary artery's bend:
//   seatLeftVeins  The model's left pulmonary veins leave the left atrium's lateral wall beside the
//                  mitral annulus and run out to the left, and the lower one lies in the apical
//                  four-chamber plane: that view showed a tube leaving the LV's base. Each vein now
//                  turns over its first centimetre, the upper one up, left and back, the lower one
//                  back, left and a little down, in front of the descending aorta, out of the
//                  four-chamber and long-axis planes. Where their shared mouth still crosses the
//                  four-chamber plane, it is pressed into the line of the atrial wall.
//   holdPapillary  An RV papillary muscle ran out through the RV free wall. Every papillary point
//                  now stays at least 1.2 mm inside the heart's outer surface.
//   trabeculate    The RV's trabeculations: the moderator band from the septum to the free wall,
//                  thin trabeculae across the apex, and coarse ridges on the free wall's apical half.
// Lengths in cm. The four-chamber frame is echo.js's (viewGeometry, 'a4c'): u across the image (the
// LV to the right), depth from the probe, w off the plane.
import * as THREE from '../../vendor/three.bundle.min.js';
import { AxisBend, turnMesh } from './pabend.js';
import { grid, nearest } from './phenomesh.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// a smooth fixed field in [-1, 1]: three plane waves (direction, wavelength in cm, phase), shifted
const WAVES = [[0.48, 0.81, 0.34, 2.3, 0.4], [-0.72, 0.21, 0.66, 3.1, 2.1], [0.15, -0.57, 0.81, 2.7, 4.0]]
  .map(([x, y, z, l, ph]) => { const k = (2 * Math.PI) / (l * Math.hypot(x, y, z)); return [x * k, y * k, z * k, ph]; });
const field = (x, y, z, shift) => WAVES.reduce((s, [kx, ky, kz, ph]) => s + Math.sin(kx * x + ky * y + kz * z + ph + shift), 0) / WAVES.length;

// left veins: the direction each turns to (x the patient's left, y up, z front)
// The lower one runs back more than down: turned further down it cleared the four-chamber plane
// as well, but in systole it swung through the long-axis plane behind the mitral annulus.
export const VEINS = { upper: [0.72, 0.38, -0.58], lower: [0.42, -0.38, -0.82], a0: -0.3, a1: 1.0 };
// the mouth's press: the atrial wall's outer line in the four-chamber plane, from the LV's base
// to the atrium below the mouth ([u, depth]), how much of the bulge past it stays, and the reach
export const PRESS = { line: [[4.25, 10.3], [4.45, 12.1]], keep: 0.12, near: 0.3, reach: 1.0, band: [10.0, 12.4], soft: 0.35 };
export const RV = {
  hold: 0.12,                       // papillary points stay this far inside the outer surface
  // Outer (epicardial) vertices: within reach of the pericardium, the normal along the
  // pericardium's (dot above agree). The hold uses the sure set: an endocardial vertex taken as
  // outer pushes the papillary points near it into the wall. The ridges spare the maybe set: an
  // outer vertex taken as endocardial bulges the epicardium.
  epi: { sure: { reach: 0.6, agree: 0.3 }, maybe: { reach: 1.5, agree: 0 } },
  // coarse ridges: height, full to this far along the RV and gone by the next, two wavelengths;
  // each family's phase wanders by up to wander radians and the height drops by up to vary,
  // so the ridges run unevenly as trabeculae do, not as a comb
  ridge: { amp: 0.2, full: 0.25, gone: 0.55, waves: [1.25, 1.55], wander: 2.2, vary: 0.6 },
  // the moderator band: where along the RV (0 the apex, 1 the tricuspid valve) its middle crosses,
  // its slope toward the base on the way to the free wall, radii at the septum, middle, free wall,
  // and its bow toward the apex
  band: { at: 0.36, slope: 0.45, w: 0.05, radii: [0.27, 0.2, 0.24], bow: 0.15 },
  // apical trabeculae: [along the RV, off the plane, turn in the plane (deg), radius, slope out of
  // the plane]. Those on the plane show as thin bars in the four-chamber view, the sloped ones as
  // spots, the rest in the planes that cut them
  strands: [[0.06, 0, 5, 0.1, 0], [0.15, 0.04, -30, 0.09, 0], [0.24, 0, 10, 0.1, -0.7],
    [0.1, -0.6, 15, 0.11, 0], [0.17, 0.6, -15, 0.1, 0], [0.27, 0.9, 10, 0.1, 0], [0.29, -0.9, -20, 0.1, 0]],
};

/** The apical four-chamber plane (echo.js viewGeometry 'a4c'): probe O, depth d, across r, normal n. */
export function a4cFrame(anat) {
  const apex = anat.point('apex_epi', 0, 0), mv = anat.point('mv', 0, 0), tv = anat.point('tv', 0, 0);
  const O = apex.clone().addScaledVector(anat.axis, -1.6);
  const d = mv.clone().lerp(tv, 0.45).sub(O).normalize();
  const right = mv.clone().sub(tv);
  const r = right.addScaledVector(d, -right.dot(d)).normalize();
  return { O, d, r, n: V3().crossVectors(r, d).normalize() };
}

const regionsOf = (geo) => {
  const c = geo.attributes.color, out = new Uint8Array(c.count);
  for (let i = 0; i < c.count; i++) out[i] = Math.round(c.getX(i) * 10);
  return out;
};
const comp = (attr, i, c) => (c === 0 ? attr.getX(i) : c === 1 ? attr.getY(i) : c === 2 ? attr.getZ(i) : attr.getW(i));
const xyz = (attr) => {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) { out[3 * i] = attr.getX(i); out[3 * i + 1] = attr.getY(i); out[3 * i + 2] = attr.getZ(i); }
  return out;
};

// ---------------------------------------------------------------- the left pulmonary veins
/** Bend the left veins out of the four-chamber plane and press their mouth into the atrial wall. */
export function seatLeftVeins(meshes, anat) {
  const myo = meshes.Myocardium;
  if (!myo) return;
  const g = myo.geometry, P = g.attributes.position, n = P.count, reg = regionsOf(g);
  // the left veins: vein vertices left of x = -0.6 (the right veins and the cavae lie right of -1.5)
  const left = [];
  for (let i = 0; i < n; i++) if (reg[i] === 7 && P.getX(i) > -0.6) left.push(i);
  if (left.length < 50) return;
  // the two veins: 2-means, seeded at the lowest and the highest point
  const pt = (i) => V3(P.getX(i), P.getY(i), P.getZ(i));
  let lo = left[0], hi = left[0];
  for (const i of left) { if (P.getY(i) < P.getY(lo)) lo = i; if (P.getY(i) > P.getY(hi)) hi = i; }
  const c = [pt(lo), pt(hi)], lab = new Uint8Array(left.length);
  for (let it = 0; it < 30; it++) {
    const s = [V3(), V3()], k = [0, 0];
    left.forEach((i, j) => { const p = pt(i); lab[j] = p.distanceToSquared(c[0]) <= p.distanceToSquared(c[1]) ? 0 : 1; s[lab[j]].add(p); k[lab[j]]++; });
    for (const m of [0, 1]) if (k[m]) c[m] = s[m].multiplyScalar(1 / k[m]);
  }
  const la = anat.point('la_c', 0, 0), mats = new Map(), p = V3();
  for (const [m, name] of [[0, 'lower'], [1, 'upper']]) {
    const idx = left.filter((_, j) => lab[j] === m), cen = c[m];
    // the vein's axis: the principal axis of its points, pointing away from the atrium's centre
    const C = new Float64Array(6);
    for (const i of idx) {
      const x = P.getX(i) - cen.x, y = P.getY(i) - cen.y, z = P.getZ(i) - cen.z;
      C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z;
    }
    const M = new THREE.Matrix3().set(C[0], C[1], C[2], C[1], C[3], C[4], C[2], C[4], C[5]);
    let u = V3(1, 0.1, -0.2).normalize();
    for (let it = 0; it < 80; it++) u = u.applyMatrix3(M).normalize();
    if (cen.clone().sub(la).dot(u) < 0) u.negate();
    let tmin = Infinity;
    for (const i of idx) tmin = Math.min(tmin, pt(i).sub(cen).dot(u));
    const mouth = cen.clone().addScaledVector(u, tmin);
    const b = V3(...VEINS[name]).normalize();
    const bend = new AxisBend(mouth, u, V3().crossVectors(u, b), Math.acos(clamp(u.dot(b), -1, 1)), VEINS.a0, VEINS.a1);
    for (const i of idx) {
      p.fromBufferAttribute(P, i);
      const q = bend.apply(p);
      if (!q) continue;
      P.setXYZ(i, p.x, p.y, p.z);
      mats.set(i, new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)));
    }
  }
  // the normals turn with the bend; the displacements (systole, amyloid) stay as loaded, so each
  // vein point still moves as the atrium it leaves moves (turned with it, a point 2 cm out would
  // move up to 90 degrees off that)
  const moves = g.morphAttributes.position;
  g.morphAttributes.position = [];
  turnMesh(g, mats, V3());
  g.morphAttributes.position = moves;
  // the press: what bulges past the wall line u -> line + (u - line) * c, near the plane only
  const F = a4cFrame(anat), S = PRESS, [[u0, e0], [u1, e1]] = S.line;
  for (let i = 0; i < n; i++) {
    if ((reg[i] !== 3 && reg[i] !== 7) || P.getX(i) <= -2.5) continue;
    p.fromBufferAttribute(P, i).sub(F.O);
    const u = p.dot(F.r), dep = p.dot(F.d), w = p.dot(F.n);
    const ut = u0 + (u1 - u0) * clamp((dep - e0) / (e1 - e0), 0, 1);
    if (u <= ut) continue;
    const k = (1 - smooth((Math.abs(w) - S.near) / S.reach)) * smooth((dep - S.band[0]) / S.soft) * (1 - smooth((dep - S.band[1]) / S.soft));
    if (k <= 0) continue;
    const du = (ut - u) * k * (1 - S.keep);
    P.setXYZ(i, P.getX(i) + F.r.x * du, P.getY(i) + F.r.y * du, P.getZ(i) + F.r.z * du);
  }
  P.needsUpdate = true;
}

// ---------------------------------------------------------------- the heart's outer surface
/** Myocardial vertices facing out of the heart: within reach of the pericardium, each normal along
 *  the nearest pericardial normal (dot above agree). only(i), if given, limits the test. */
function outerSurface(myo, peri, { reach, agree }, only = null) {
  const g = myo.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const pg = peri.geometry, pp = xyz(pg.attributes.position), pn = xyz(pg.attributes.normal);
  const G = grid(pp, null, reach), out = new Uint8Array(n);   // a cell of the reach: 27 cells a search
  for (let i = 0; i < n; i++) {
    if (only && !only(i)) continue;
    const nb = nearest(G, P.getX(i), P.getY(i), P.getZ(i), 1, reach);
    if (!nb.length) continue;
    const j = nb[0][0];
    out[i] = N.getX(i) * pn[3 * j] + N.getY(i) * pn[3 * j + 1] + N.getZ(i) * pn[3 * j + 2] > agree ? 1 : 0;
  }
  return out;
}

/** Keep every papillary point at least RV.hold inside the heart's outer surface. */
export function holdPapillary(meshes) {
  const pap = meshes.Papillary, myo = meshes.Myocardium, peri = meshes.Pericardium;
  if (!pap || !myo || !peri) return 0;
  const g = myo.geometry, P = g.attributes.position, N = g.attributes.normal, pos = xyz(P);
  const Q = pap.geometry.attributes.position, box = new THREE.Box3().setFromBufferAttribute(Q).expandByScalar(1.5);
  // only the wall within the search reach (1.5) of the papillary muscles needs the outer test
  const outer = outerSurface(myo, peri, RV.epi.sure, (i) => box.containsPoint(V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])));
  const G = grid(pos, (i) => outer[i] === 1, 0.75);
  let moved = 0;
  for (let i = 0; i < Q.count; i++) {
    const x = Q.getX(i), y = Q.getY(i), z = Q.getZ(i);
    const nb = nearest(G, x, y, z, 3, 1.5);
    if (!nb.length) continue;
    // the outer surface there: the mean point and normal of the nearest three
    let qx = 0, qy = 0, qz = 0, nx = 0, ny = 0, nz = 0;
    for (const [j] of nb) { qx += pos[3 * j]; qy += pos[3 * j + 1]; qz += pos[3 * j + 2]; nx += N.getX(j); ny += N.getY(j); nz += N.getZ(j); }
    const k = nb.length, l = Math.hypot(nx, ny, nz) || 1;
    qx /= k; qy /= k; qz /= k; nx /= l; ny /= l; nz /= l;
    const s = (x - qx) * nx + (y - qy) * ny + (z - qz) * nz;
    if (s <= -RV.hold) continue;
    const m = s + RV.hold;
    Q.setXYZ(i, x - nx * m, y - ny * m, z - nz * m);
    moved++;
  }
  Q.needsUpdate = true;
  return moved;
}

// ---------------------------------------------------------------- RV trabeculations
/** A mesh's triangles for ray tests, read once: each one's first corner and two edges, and its face. */
function triangles(pos, index) {
  const m = index.length / 3, E = new Float64Array(9 * m);
  for (let f = 0; f < m; f++) {
    const a = 3 * index[3 * f], b = 3 * index[3 * f + 1], c = 3 * index[3 * f + 2], o = 9 * f;
    E[o] = pos[a]; E[o + 1] = pos[a + 1]; E[o + 2] = pos[a + 2];
    E[o + 3] = pos[b] - pos[a]; E[o + 4] = pos[b + 1] - pos[a + 1]; E[o + 5] = pos[b + 2] - pos[a + 2];
    E[o + 6] = pos[c] - pos[a]; E[o + 7] = pos[c + 1] - pos[a + 1]; E[o + 8] = pos[c + 2] - pos[a + 2];
  }
  return { E, m };
}

/** The ray o + t dir (t > tmin) on the triangles T: the nearest hit { t, tri } ({ t: Infinity } if
 *  none), or with count, how many it crosses. */
function rayHits(T, o, dir, count = false, tmin = 1e-4) {
  const { E, m } = T, dx = dir.x, dy = dir.y, dz = dir.z;
  let best = Infinity, tri = -1, k = 0;
  for (let f = 0; f < m; f++) {
    const p = 9 * f;
    const e1x = E[p + 3], e1y = E[p + 4], e1z = E[p + 5], e2x = E[p + 6], e2y = E[p + 7], e2z = E[p + 8];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det, sx = o.x - E[p], sy = o.y - E[p + 1], sz = o.z - E[p + 2];
    const u = inv * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = inv * (dx * qx + dy * qy + dz * qz);
    if (v < 0 || u + v > 1) continue;
    const t = inv * (e2x * qx + e2y * qy + e2z * qz);
    if (t <= tmin) continue;
    k++;
    if (t < best) { best = t; tri = f; }
  }
  return count ? k : { t: best, tri };
}

/**
 * A closed tube along the points C (Vector3) with radii rad: rings of k vertices carried along the
 * curve without twist, a cap at each end. Returns { pos, nrm, idx, t } (t: 0..1 along the curve).
 */
function tube(C, rad, k = 10) {
  const m = C.length, pos = [], nrm = [], idx = [], t = [];
  const T = C.map((_, i) => C[Math.min(m - 1, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize());
  let N = Math.abs(T[0].y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  N = N.addScaledVector(T[0], -N.dot(T[0])).normalize();
  for (let i = 0; i < m; i++) {
    if (i > 0) { N.addScaledVector(T[i], -N.dot(T[i])).normalize(); }
    const B = V3().crossVectors(T[i], N);
    for (let j = 0; j < k; j++) {
      const a = (2 * Math.PI * j) / k, dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      const p = C[i].clone().addScaledVector(dir, rad[i]);
      pos.push(p.x, p.y, p.z); nrm.push(dir.x, dir.y, dir.z); t.push(i / (m - 1));
    }
  }
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < k; j++) {
      const a = i * k + j, b = i * k + ((j + 1) % k), c = a + k, d = b + k;
      idx.push(a, b, d, a, d, c);
    }
  }
  // caps: a centre point at each end, fanned to its ring
  for (const [i, s] of [[0, -1], [m - 1, 1]]) {
    const ci = pos.length / 3;
    pos.push(C[i].x, C[i].y, C[i].z); nrm.push(T[i].x * s, T[i].y * s, T[i].z * s); t.push(i / (m - 1));
    for (let j = 0; j < k; j++) {
      const a = i * k + j, b = i * k + ((j + 1) % k);
      if (s < 0) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  return { pos, nrm, idx, t };
}

/** Append geometry (from tube(), with per-vertex target displacements) to mesh, region colour r. */
function append(mesh, add, r) {
  const g = mesh.geometry, n0 = g.attributes.position.count, na = add.pos.length / 3, n1 = n0 + na;
  const grow = (attr, extra, Type = Float32Array) => {
    const s = attr.itemSize, a = new Type(n1 * s);
    for (let i = 0; i < n0; i++) for (let c = 0; c < s; c++) a[i * s + c] = comp(attr, i, c);
    a.set(extra, n0 * s);
    return a;
  };
  g.setAttribute('position', new THREE.BufferAttribute(grow(g.attributes.position, add.pos), 3));
  if (g.attributes.normal) g.setAttribute('normal', new THREE.BufferAttribute(grow(g.attributes.normal, add.nrm), 3));
  if (g.attributes.color) {
    const C = g.attributes.color, s = C.itemSize, a = new Uint8Array(n1 * s);
    for (let i = 0; i < n0; i++) for (let c = 0; c < s; c++) a[i * s + c] = Math.round(comp(C, i, c) * 255);
    // the region in the red channel, as the model has it (region / 10)
    for (let i = n0; i < n1; i++) { a[i * s] = Math.round((r / 10) * 255); if (s > 3) a[i * s + 3] = 255; }
    g.setAttribute('color', new THREE.BufferAttribute(a, s, true));
  }
  const I = g.index.array, idx = n1 > 65535 ? new Uint32Array(I.length + add.idx.length) : new Uint16Array(I.length + add.idx.length);
  idx.set(I);
  for (let j = 0; j < add.idx.length; j++) idx[I.length + j] = add.idx[j] + n0;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const names = Object.entries(mesh.morphTargetDictionary).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  for (const key of ['position', 'normal']) {
    const list = g.morphAttributes[key];
    if (!list) continue;
    g.morphAttributes[key] = list.map((A, k) => {
      const extra = key === 'position' && add.targets[names[k]] ? add.targets[names[k]] : new Float32Array(na * 3);
      const B = new THREE.BufferAttribute(grow(A, extra), 3);
      B.name = A.name;
      return B;
    });
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/**
 * The RV's trabeculations. The ridges move the free wall's endocardium into the cavity; the band and
 * the trabeculae join the papillary muscles' mesh (muscle in the echo and the cut), each end set
 * 1.2 mm into the wall it meets, each point moving with the wall at its ends.
 */
export function trabeculate(meshes, anat) {
  const myo = meshes.Myocardium, pap = meshes.Papillary, peri = meshes.Pericardium;
  if (!myo || !pap || !peri) return null;
  const g = myo.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count, reg = regionsOf(g);
  const outer = outerSurface(myo, peri, RV.epi.maybe, (i) => reg[i] === 2);
  const F = a4cFrame(anat), tv = anat.point('tv', 0, 0), apexLV = anat.point('apex_endo', 0, 0);
  // the RV free wall's endocardium, and the RV's apex: its point furthest from the tricuspid valve
  // toward the LV apex
  const endo = [];
  for (let i = 0; i < n; i++) if (reg[i] === 2 && !outer[i]) endo.push(i);
  const toApex = apexLV.clone().sub(tv).normalize();
  let ia = endo[0];
  for (const i of endo) if (V3(P.getX(i), P.getY(i), P.getZ(i)).sub(tv).dot(toApex) > V3(P.getX(ia), P.getY(ia), P.getZ(ia)).sub(tv).dot(toApex)) ia = i;
  const apex = V3(P.getX(ia), P.getY(ia), P.getZ(ia)), axis = tv.clone().sub(apex), L = axis.length();
  axis.normalize();
  // 1. coarse ridges: two families of waves across the wall, sharpened, on the apical half
  const S = RV.ridge, e1 = F.r.clone().multiplyScalar(0.8).addScaledVector(F.d, 0.6).normalize(), e2 = F.r.clone().multiplyScalar(0.8).addScaledVector(F.d, -0.6).normalize();
  for (const i of endo) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const f = (x - apex.x) * axis.x + (y - apex.y) * axis.y + (z - apex.z) * axis.z;
    const a = S.amp * (1 - smooth((f / L - S.full) / (S.gone - S.full)));
    if (a <= 0) continue;
    const s1 = 0.5 + 0.5 * Math.cos((2 * Math.PI * (x * e1.x + y * e1.y + z * e1.z)) / S.waves[0] + S.wander * field(x, y, z, 0));
    const s2 = 0.5 + 0.5 * Math.cos((2 * Math.PI * (x * e2.x + y * e2.y + z * e2.z)) / S.waves[1] + 1.3 + S.wander * field(x, y, z, 1.7));
    const h = a * (1 - S.vary * (0.5 + 0.5 * field(x, y, z, 3.1))) * Math.pow(Math.max(s1, s2), 3);
    P.setXYZ(i, x + N.getX(i) * h, y + N.getY(i) * h, z + N.getZ(i) * h);
  }
  P.needsUpdate = true;
  // 2. the band and the trabeculae, between the walls the rays from inside the cavity meet
  const pos = xyz(P), index = g.index.array;
  const G = grid(pos, null, 0.5);
  const TM = triangles(pos, index), TP = triangles(xyz(peri.geometry.attributes.position), peri.geometry.index.array);
  // in a cavity: outside the muscle (an even count of crossings) and inside the pericardium (odd)
  const ray = V3(0.31, 0.42, 0.85).normalize();
  const inCavity = (c) => rayHits(TM, c, ray, true) % 2 === 0 && rayHits(TP, c, ray, true) % 2 === 1;
  const names = Object.entries(myo.morphTargetDictionary).map(([k, j]) => [k, g.morphAttributes.position[j]]);
  const motion = (p) => {
    // the walls' own target displacements at p: inverse-distance mean of the nearest four vertices
    const nb = nearest(G, p.x, p.y, p.z, 4, 1.5), out = {};
    let ws = 0;
    for (const [, d2] of nb) ws += 1 / (d2 + 1e-4);
    for (const [k, A] of names) {
      const v = V3();
      for (const [j, d2] of nb) v.add(V3(A.getX(j), A.getY(j), A.getZ(j)).multiplyScalar(1 / (d2 + 1e-4) / ws));
      out[k] = v;
    }
    return out;
  };
  const centre = (along, w) => {
    // the cavity's middle at this level: halfway between the walls the rays across it meet
    // w: the distance off the four-chamber plane
    const c = apex.clone().addScaledVector(axis, along * L).addScaledVector(F.r, -0.45);
    c.addScaledVector(F.n, w - c.clone().sub(F.O).dot(F.n));
    if (!inCavity(c)) return null;
    const hs = rayHits(TM, c, F.r), hf = rayHits(TM, c, F.r.clone().negate());
    if (!Number.isFinite(hs.t) || !Number.isFinite(hf.t)) return null;
    return c.addScaledVector(F.r, (hs.t - hf.t) / 2);
  };
  const add = { pos: [], nrm: [], idx: [], targets: {} };
  for (const [k] of names) add.targets[k] = [];
  const parts = [];
  const tried = [];
  const strand = (along, w, deg, radii, bow, need, tilt = 0) => {
    const why = (x) => { tried.push({ along, w, deg, why: x }); return null; };
    const c = centre(along, w);
    if (!c) return why('no centre');
    if (!inCavity(c)) return why('centre not in a cavity');
    // across the cavity from the septum to the free wall, turned in the plane by deg
    const a = THREE.MathUtils.degToRad(deg);
    const dir = F.r.clone().multiplyScalar(-Math.cos(a)).addScaledVector(F.d, Math.sin(a)).addScaledVector(F.n, tilt).normalize();
    const hs = rayHits(TM, c, dir.clone().negate()), hf = rayHits(TM, c, dir);
    if (!Number.isFinite(hs.t) || !Number.isFinite(hf.t)) return why('a ray met no wall');
    if (hs.t + hf.t > 3.4) return why(`too long: ${(hs.t + hf.t).toFixed(2)}`);
    const rs = reg[index[3 * hs.tri]], rf = reg[index[3 * hf.tri]];
    if (need && (rs !== need[0] || rf !== need[1])) return why(`walls ${rs}, ${rf}`);
    const A = c.clone().addScaledVector(dir, -(hs.t + RV.hold)), B = c.clone().addScaledVector(dir, hf.t + RV.hold);
    const m = 9, C = [], rad = [];
    for (let i = 0; i < m; i++) {
      const u = i / (m - 1);
      C.push(A.clone().lerp(B, u).addScaledVector(axis, -bow * 4 * u * (1 - u)));
      rad.push(radii.length === 3 ? (u < 0.5 ? radii[0] + (radii[1] - radii[0]) * smooth(u * 2) : radii[1] + (radii[2] - radii[1]) * smooth(u * 2 - 1)) : radii[0]);
    }
    const T = tube(C, rad, radii[0] > 0.18 ? 12 : 8), mA = motion(A), mB = motion(B), base = add.pos.length / 3;
    add.pos.push(...T.pos); add.nrm.push(...T.nrm); add.idx.push(...T.idx.map((j) => j + base));
    for (const [k] of names) for (const u of T.t) { const v = mA[k].clone().lerp(mB[k], u); add.targets[k].push(v.x, v.y, v.z); }
    parts.push({ along, w, deg, A, B, length: A.distanceTo(B) });
    return parts[parts.length - 1];
  };
  const b = RV.band;
  strand(b.at, b.w, THREE.MathUtils.radToDeg(Math.atan(b.slope)), b.radii, b.bow, [1, 2]);
  for (const [along, w, deg, r, tilt] of RV.strands) strand(along, w, deg, [r], 0.04, null, tilt);
  if (!add.pos.length) return { parts, tried };
  for (const [k] of names) add.targets[k] = new Float32Array(add.targets[k]);
  append(pap, add, 2);
  return { parts, tried, apex, L };
}
