// Disease hearts built on the normal mesh. Each phenotype adds morph targets to every mesh, so
// the 3D heart, its cut and every echo slice show one shape. The shapes are procedural fields in
// the heart's own frame (the LV long axis from the apex), not sculpted; the amyloid heart is the
// model's own amyloid target. A phenotype's targets are built the first time the page shows it
// (model3d.js). Targets per phenotype k:
//   ph_k       the end-diastolic change (weight 1)
//   ph_k_sys   the change to the systolic motion, (scale - 1) x systole (weight s)
//   ph_k_mid   a valve's shape at the middle of its swing (weight m, as leafletWeights)
//   ph_k_far   a valve's shape at the far end of its swing: the mitral valve shut, the aortic
//              valve open (weight f)
import * as THREE from '../../vendor/three.bundle.min.js';
import { TERRITORY, segmentOf } from '../aha.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A value from a table of [u, value] rows, eased between rows. */
function table(tab, u) {
  if (u <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (u <= tab[i][0]) { const [u0, v0] = tab[i - 1], [u1, v1] = tab[i]; return v0 + (v1 - v0) * smooth((u - u0) / (u1 - u0)); }
  }
  return tab[tab.length - 1][1];
}

// ---------------------------------------------------------------- the phenotypes
// Lengths in cm. dilate: how far the LV wall moves out from the long axis, by level u (0 the
// epicardial apex, 1 the mitral valve); stretch: how far the apex moves away from the base;
// la: the left atrium's scale about the mitral valve; lvAmy: the amyloid target's weight on the
// LV wall (negative thins it); sys: systolic motion as a fraction of normal; sizes (mm), which
// place the labels: the LV diameters at end-diastole and end-systole from short-axis slices of
// the built shape, and the walls as lvAmy moves them.
export const MESH = {
  // a large anterior infarct: dilated, thin and akinetic in the LAD territory, the rest
  // hypokinetic; the mitral leaflets pulled toward the apex
  icm: {
    dilate: [[-0.3, 0.45], [0, 0.5], [0.2, 0.72], [0.5, 0.82], [0.8, 0.72], [1.0, 0.3], [1.2, 0]],
    stretch: 0.6, la: 1.17, lvAmy: { lad: -0.4 },
    sys: { lad: 0, apex: -0.2, remote: 0.6, other: 0.75 },
    tent: 0.45,
    sizes: { lvid: 64, lvids: 60, ivs: 5.5, pw: 8.9 },
  },
  // Barlow: bileaflet billowing of thick redundant leaflets, a wide annulus, and the large LA
  // and LV of severe chronic mitral regurgitation, which contracts briskly
  barlow: {
    dilate: [[-0.3, 0.3], [0, 0.32], [0.2, 0.5], [0.5, 0.56], [0.8, 0.5], [1.0, 0.35], [1.2, 0]],
    stretch: 0.5, la: 1.4, annulus: 1.2,
    sys: { lv: 1.3, other: 1 },
    billow: 1.5, mvThick: 0.2,
    sizes: { lvid: 58, lvids: 37, ivs: 8.6, pw: 8.9 },
  },
  // bicuspid aortic valve, right and left cusps fused, severely stenotic: concentric LVH, the
  // ascending aorta wide
  bav: {
    dilate: null, stretch: 0, la: 1.1, lvAmy: { lv: 0.55 }, aorta: 0.4,
    sys: { lv: 1, other: 1 },
    av: { open: 0.5, dome: 0.4, thick: 0.07 },
    sizes: { lvid: 43, lvids: 29, ivs: 12.8, pw: 12.2 },
  },
};
export const PHENO_MESH_KEYS = Object.keys(MESH);

// ---------------------------------------------------------------- small helpers
/**
 * A pause for the page every ms of work: the builds below run for a second or more (several on
 * a phone), and the page keeps answering while they run. Call it often; it returns at once
 * until ms have passed.
 */
function slicer(ms = 12) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}
// a cell's three indices packed in one number (each under 1024 in size): a Map lookup by number
// costs far less than one by a built string, and nearest() makes hundreds per query
const cellKey = (cx, cy, cz) => ((cx + 1024) * 2048 + (cy + 1024)) * 2048 + (cz + 1024);
/** A grid of points for neighbour searches. */
export function grid(pos, keep, cell) {
  const g = new Map();
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    if (keep && !keep(i)) continue;
    const k = cellKey(Math.floor(pos[3 * i] / cell), Math.floor(pos[3 * i + 1] / cell), Math.floor(pos[3 * i + 2] / cell));
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(i);
  }
  return { g, cell, pos };
}
/** The k nearest points of grid G to (x, y, z) within rMax: [[index, d2], ...]. */
export function nearest(G, x, y, z, k, rMax) {
  const { g, cell, pos } = G;
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
  const reach = Math.ceil(rMax / cell);
  const best = [];
  for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
    const list = g.get(cellKey(cx + dx, cy + dy, cz + dz));
    if (!list) continue;
    for (const i of list) {
      const ex = pos[3 * i] - x, ey = pos[3 * i + 1] - y, ez = pos[3 * i + 2] - z, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > rMax * rMax) continue;
      if (best.length < k) { best.push([i, d2]); best.sort((a, b) => a[1] - b[1]); }
      else if (d2 < best[k - 1][1]) { best[k - 1] = [i, d2]; best.sort((a, b) => a[1] - b[1]); }
    }
  }
  return best;
}
/** Vertex normals of an indexed triangle mesh at positions pos. */
function normals(pos, index) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < index.length; t += 3) {
    const a = 3 * index[t], b = 3 * index[t + 1], c = 3 * index[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
/** Connected parts of an indexed mesh: a part number for each vertex. */
function parts(count, index) {
  const par = new Int32Array(count).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) { const a = f(index[t]); par[f(index[t + 1])] = a; par[f(index[t + 2])] = a; }
  const id = new Map(), out = new Int32Array(count);
  for (let i = 0; i < count; i++) { const r = f(i); if (!id.has(r)) id.set(r, id.size); out[i] = id.get(r); }
  return out;
}
/** Principal axes of a point set: the unit vector of least spread. */
function leastAxis(pts) {
  const c = V3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const m = [0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  // inverse iteration on the covariance: the eigenvector of the smallest eigenvalue
  const M = new THREE.Matrix3().set(m[0], m[1], m[2], m[1], m[3], m[4], m[2], m[4], m[5]);
  const inv = M.clone().invert();
  let v = V3(0.3, 0.5, 0.8).normalize();
  for (let k = 0; k < 60; k++) v = v.applyMatrix3(inv).normalize();
  return { c, n: v };
}

// ---------------------------------------------------------------- the heart's frame
function frameOf(meshes, anat, turn) {
  const P = (k) => anat.raw(k, 0, 0);
  const Z = anat.axis.clone(), X = anat.lateral.clone(), Y = anat.anterior.clone();
  const apex = P('apex_epi'), apexEndo = P('apex_endo'), mv = P('mv');
  const L = mv.clone().sub(apex).dot(Z), Ls = mv.clone().sub(apexEndo).dot(Z);
  const F = { Z, X, Y, apex, apexEndo, mv, L, Ls, h0: 2.0, turn, laC: P('la_c'), av: P('av'), aoRoot: anat.aorticRoot.clone() };
  // the LV cavity's radius by level, from the LV wall's vertices (their lower quartile)
  const myo = meshes.Myocardium.geometry, pos = myo.attributes.position.array, col = myo.attributes.color;
  const lists = Array.from({ length: 26 }, () => []);
  for (let i = 0; i < pos.length / 3; i++) {
    if (Math.round(col.getX(i) * 10) !== 1) continue;
    const c = lvCoords(F, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    const b = Math.floor((c.u + 0.1) / 0.05);
    if (b >= 0 && b < 26) lists[b].push(c.r);
  }
  const R = lists.map((l) => { if (l.length < 12) return null; l.sort((a, b) => a - b); return l[Math.floor(l.length * 0.25)]; });
  for (let i = 0; i < R.length; i++) if (R[i] == null) R[i] = R.slice(i).find((x) => x != null) ?? R.slice(0, i).reverse().find((x) => x != null) ?? 2;
  F.Rref = (u) => { const x = (u + 0.1) / 0.05 - 0.5, i = clamp(Math.floor(x), 0, R.length - 2), t = clamp(x - i, 0, 1); return R[i] + (R[i + 1] - R[i]) * t; };
  // the mitral annulus: its plane from the ring of the valve model; its normal points into the LA
  const mvGeo = meshes.MitralValve.geometry, mp = mvGeo.attributes.position.array;
  const part = parts(mp.length / 3, mvGeo.index.array);
  const cnt = new Map();
  for (let i = 0; i < part.length; i++) cnt.set(part[i], (cnt.get(part[i]) || 0) + 1);
  const ringPart = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const ring = [];
  for (let i = 0; i < part.length; i++) if (part[i] === ringPart) ring.push(V3(mp[3 * i], mp[3 * i + 1], mp[3 * i + 2]));
  const ax = leastAxis(ring);
  if (ax.n.dot(F.laC.clone().sub(mv)) < 0) ax.n.negate();
  F.mvN = ax.n;
  F.mvC = ax.c;
  F.mvR = ring.reduce((s, p) => s + p.clone().sub(ax.c).addScaledVector(ax.n, -p.clone().sub(ax.c).dot(ax.n)).length(), 0) / ring.length;
  F.mvPart = part;
  F.mvRing = ringPart;
  return F;
}
/** Where a point lies against the LV: level u, radius r from the axis (from a point 2 cm up
 * the axis near the apex, so the apical dome is round), and the radial direction. */
function lvCoords(F, x, y, z) {
  const qx = x - F.apex.x, qy = y - F.apex.y, qz = z - F.apex.z;
  const h = qx * F.Z.x + qy * F.Z.y + qz * F.Z.z, hc = Math.max(h, F.h0);
  const rx = qx - hc * F.Z.x, ry = qy - hc * F.Z.y, rz = qz - hc * F.Z.z;
  return { h, u: h / F.L, r: Math.hypot(rx, ry, rz), rx, ry, rz };
}
/** Segment coordinates as Regional wall motion counts them: level from the endocardial apex, and angle. */
function segCoords(F, x, y, z) {
  const qx = x - F.apexEndo.x, qy = y - F.apexEndo.y, qz = z - F.apexEndo.z;
  const h = qx * F.Z.x + qy * F.Z.y + qz * F.Z.z;
  const rx = qx - h * F.Z.x, ry = qy - h * F.Z.y, rz = qz - h * F.Z.z;
  const th = (Math.atan2(rx * F.Y.x + ry * F.Y.y + rz * F.Y.z, rx * F.X.x + ry * F.X.y + rz * F.X.z) * 180) / Math.PI + F.turn;
  return { hs: h / F.Ls, th };
}
/** A smooth map over the segments: fn(segment) sampled round each cell and averaged. */
function segGrid(fn) {
  const H0 = -0.2, DH = 0.025, NH = 57, NT = 72;
  const g = new Float32Array(NH * NT);
  for (let i = 0; i < NH; i++) for (let j = 0; j < NT; j++) {
    let s = 0, n = 0;
    for (const dh of [-0.06, -0.03, 0, 0.03, 0.06]) for (const dt of [-20, -10, 0, 10, 20]) { s += fn(segmentOf(H0 + i * DH + dh, j * 5 + dt)); n++; }
    g[i * NT + j] = s / n;
  }
  return (h, th) => {
    const x = clamp((h - H0) / DH, 0, NH - 1.001), i = Math.floor(x), fx = x - i;
    const a = (((th % 360) + 360) % 360) / 5, j = Math.floor(a) % NT, fy = a - Math.floor(a), j1 = (j + 1) % NT;
    const v0 = g[i * NT + j] * (1 - fy) + g[i * NT + j1] * fy, v1 = g[(i + 1) * NT + j] * (1 - fy) + g[(i + 1) * NT + j1] * fy;
    return v0 * (1 - fx) + v1 * fx;
  };
}

// ---------------------------------------------------------------- the fields
/** The LV's own change at a point: out from the long axis, and the apex away from the base. */
function lvField(F, P, x, y, z, out) {
  if (!P.dilate && !P.stretch) return;
  const c = lvCoords(F, x, y, z);
  // far from the LV (the right atrium's far wall, the great veins) the move fades
  const far = 1 - 0.6 * smooth((c.r - 5.5) / 4);
  if (P.dilate && c.r > 1e-6) {
    const a = table(P.dilate, c.u) * Math.min(1, c.r / F.Rref(c.u)) * far / c.r;
    out[0] += c.rx * a; out[1] += c.ry * a; out[2] += c.rz * a;
  }
  if (P.stretch) {
    const e = -P.stretch * (1 - clamp(c.u, 0, 1)) * far;
    out[0] += F.Z.x * e; out[1] += F.Z.y * e; out[2] += F.Z.z * e;
  }
}
/** The mitral annulus widened about its centre, with the tissue next to it. */
function annulusField(F, P, x, y, z, out) {
  if (!P.annulus) return;
  const qx = x - F.mvC.x, qy = y - F.mvC.y, qz = z - F.mvC.z, n = F.mvN;
  const hn = qx * n.x + qy * n.y + qz * n.z;
  const px = qx - hn * n.x, py = qy - hn * n.y, pz = qz - hn * n.z, rp = Math.hypot(px, py, pz);
  const w = (1 - smooth((rp - 2.0) / 1.5)) * (1 - smooth((Math.abs(hn) - 0.6) / 1.2));
  const k = (P.annulus - 1) * w;
  out[0] += px * k; out[1] += py * k; out[2] += pz * k;
}
/** The left atrium scaled about the mitral valve: nothing moves at the annulus. */
function laField(F, P, x, y, z, out, wRegion) {
  if (!P.la || P.la === 1 || wRegion <= 0) return;
  const qx = x - F.mvC.x, qy = y - F.mvC.y, qz = z - F.mvC.z;
  const up = smooth((qx * F.mvN.x + qy * F.mvN.y + qz * F.mvN.z) / 1.2);
  const d = Math.hypot(x - F.laC.x, y - F.laC.y, z - F.laC.z);
  const k = (P.la - 1) * up * (1 - smooth((d - 3.2) / 2.5)) * wRegion;
  out[0] += qx * k; out[1] += qy * k; out[2] += qz * k;
}
/**
 * The descending aorta stops the large atrium and its veins. A wall point that the fields take
 * nearer the aorta's axis than DESC_R goes back out along the radius, by a smooth maximum, so the
 * aorta leaves its mark on the atrium's back wall (as a large LA shows in the long axis) and no
 * vein runs into it. desc: the axis (preparePhenotypes); out: the point's change, made smaller.
 */
function descGuard(desc, x, y, z, out) {
  const [w, r, rx, ry, rz] = descAxis(desc, x + out[0], y + out[1], z + out[2]);
  if (w <= 0 || r < 1e-3 || r > DESC_R + 8 * DESC_SOFT) return;
  const k = (w * (DESC_R + DESC_SOFT * Math.log1p(Math.exp((r - DESC_R) / DESC_SOFT)) - r)) / r;
  out[0] += rx * k; out[1] += ry * k; out[2] += rz * k;
}
/** A point against the descending aorta's axis: [weight along it (1 on its length), r, radius vector]. */
function descAxis(desc, x, y, z) {
  const { A, u, t0, t1 } = desc;
  const px = x - A.x, py = y - A.y, pz = z - A.z;
  const t = px * u.x + py * u.y + pz * u.z;
  const rx = px - t * u.x, ry = py - t * u.y, rz = pz - t * u.z;
  return [smooth((t - t0 + 0.8) / 0.8) * (1 - smooth((t - t1) / 0.6)), Math.hypot(rx, ry, rz), rx, ry, rz];
}
// The descending aorta's wall lies 1.35 to 1.44 cm from the axis from VESSELS.desc to descLow
// (1.5 cm above desc to 7 cm below it, where the model ends it); the guard keeps 1 mm more.
const DESC_R = 1.55, DESC_SOFT = 0.15;
/** The ascending aorta widened (bicuspid aortopathy): out from its centre line. */
function aortaField(F, P, x, y, z, out, wRegion, line) {
  if (!P.aorta || wRegion <= 0) return;
  // nearest point on the centre line, and how far along it
  let best = null;
  let s0 = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const A = line[i], B = line[i + 1], ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, l2 = ux * ux + uy * uy + uz * uz;
    const t = clamp(((x - A.x) * ux + (y - A.y) * uy + (z - A.z) * uz) / l2, 0, 1);
    const cx = A.x + ux * t, cy = A.y + uy * t, cz = A.z + uz * t, d = Math.hypot(x - cx, y - cy, z - cz);
    if (!best || d < best.d) best = { d, cx, cy, cz, s: s0 + t * Math.sqrt(l2) };
    s0 += Math.sqrt(l2);
  }
  if (!best || best.d < 1e-6) return;
  const prof = smooth((best.s - 1.6) / 1.0) * (1 - smooth((best.s - 6.5) / 2.0)) * (1 - smooth((best.d - 2.3) / 0.8));
  const k = (P.aorta * prof * wRegion) / best.d;
  out[0] += (x - best.cx) * k; out[1] += (y - best.cy) * k; out[2] += (z - best.cz) * k;
}

// ---------------------------------------------------------------- building the targets
const TARGETS = (k) => ({ ed: `ph_${k}`, sys: `ph_${k}_sys`, mid: `ph_${k}_mid`, far: `ph_${k}_far` });

function addTarget(mesh, name, data) {
  const g = mesh.geometry;
  const attr = new THREE.Float32BufferAttribute(data, 3);
  attr.name = name;
  g.morphAttributes.position.push(attr);
  // the renderer reads a normal target for every position target
  if (g.morphAttributes.normal) {
    const nz = new THREE.Float32BufferAttribute(new Float32Array(data.length), 3);
    nz.name = name;
    g.morphAttributes.normal.push(nz);
  }
  mesh.morphTargetDictionary[name] = mesh.morphTargetInfluences.length;
  mesh.morphTargetInfluences.push(0);
}
const targetOf = (mesh, name) => {
  const i = mesh.morphTargetDictionary[name];
  return i === undefined ? null : mesh.geometry.morphAttributes.position[i].array;
};

/**
 * What every phenotype needs, found once: the heart's frame, the LV wall's weight on each
 * myocardial vertex, and how near each vertex lies to the LA and the aorta. anat: the Anatomy
 * (normal landmarks via raw()); turn: the angle that puts the model's apical planes on the
 * standard walls (aha.js).
 */
export async function preparePhenotypes(meshes, anat, turn, VESSELS) {
  const tick = slicer();
  const F = frameOf(meshes, anat, turn);
  const myo = meshes.Myocardium.geometry;
  const mpos = myo.attributes.position.array, mcol = myo.attributes.color, nMyo = mpos.length / 3;
  const REG = new Uint8Array(nMyo);
  for (let i = 0; i < nMyo; i++) REG[i] = Math.round(mcol.getX(i) * 10);
  // the LV wall, smoothed over 0.7 cm so the septum's two faces and the LV-RV junctions blend
  const G = grid(mpos, null, 0.7);
  const lvMask = new Float32Array(nMyo), laNear = new Float32Array(nMyo), aoNear = new Float32Array(nMyo);
  const GLA = grid(mpos, (i) => REG[i] === 3, 0.8), GAO = grid(mpos, (i) => REG[i] === 5, 0.8);
  for (let i = 0; i < nMyo; i++) {
    if ((i & 127) === 0) await tick();
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
    const nb = nearest(G, x, y, z, 24, 0.7);
    lvMask[i] = nb.length ? nb.filter(([j]) => REG[j] === 1).length / nb.length : REG[i] === 1 ? 1 : 0;
    // other walls within a centimetre of the LA or the aorta move with them, so walls that
    // touch (the atrial septum, the aortic root on the LA) do not cross
    if (REG[i] === 3 || REG[i] === 7) laNear[i] = 1;
    else { const q = nearest(GLA, x, y, z, 1, 2.0); laNear[i] = q.length ? 1 - smooth((Math.sqrt(q[0][1]) - 0.5) / 1.2) : 0; }
    if (REG[i] === 5) aoNear[i] = 1;
    else { const q = nearest(GAO, x, y, z, 1, 2.0); aoNear[i] = q.length ? 1 - smooth((Math.sqrt(q[0][1]) - 0.4) / 1.0) : 0; }
  }
  const aoLine = [F.av, V3(...VESSELS.ascMid), V3(...VESSELS.archTop)];
  const dA = V3(...VESSELS.desc);
  const desc = { A: dA, u: V3(...VESSELS.descLow).sub(dA).normalize(), t0: -1.5, t1: 6.8 };
  // the descending aorta holds its place: the large atrium meets it (descGuard) and does not move it
  for (let i = 0; i < nMyo; i++) {
    if (REG[i] !== 5 || !laNear[i]) continue;
    const [w, r] = descAxis(desc, mpos[3 * i], mpos[3 * i + 1], mpos[3 * i + 2]);
    laNear[i] *= 1 - w * (1 - smooth((r - 1.5) / 0.5));
  }
  return { meshes, anat, F, REG, lvMask, laNear, aoNear, aoLine, desc, mpos, nMyo };
}

/**
 * Add phenotype key's targets to every mesh (ctx from preparePhenotypes). Returns its systolic
 * scale at a point, sys(x, y, z), and its landmarks, landmark(name, s) (cm).
 */
export async function buildPhenotype(ctx, key) {
  const { anat, F } = ctx;
  const out = await buildTargets(ctx, MESH[key], TARGETS(key));
  /** A landmark of this phenotype at systole s, from its normal corners (cm). */
  out.landmark = (name, s) => {
    const P = MESH[key];
    const e0 = anat.raw(name, 0, 0), e1 = anat.raw(name, 0, 1);
    const d = [0, 0, 0];
    lvField(F, P, e0.x, e0.y, e0.z, d);
    annulusField(F, P, e0.x, e0.y, e0.z, d);
    if (name === 'la_c' || name === 'la_r') laField(F, P, e0.x, e0.y, e0.z, d, 1);
    const p = e0.clone().add(V3(d[0], d[1], d[2]));
    if (P.lvAmy && (name === 'apex_endo' || name === 'apex_epi' || name === 'lv_eq')) {
      const a0 = anat.raw(name, 1, 0);
      let w = 0;
      if (P.lvAmy.lv) w = P.lvAmy.lv;
      else { const sc = segCoords(F, e0.x, e0.y, e0.z); w = P.lvAmy.lad * (segmentOf(sc.hs, sc.th) === 17 || TERRITORY.lad.includes(segmentOf(sc.hs, sc.th)) ? 1 : 0); }
      p.addScaledVector(a0.clone().sub(e0), w);
    }
    const sc = out.sys(e0.x, e0.y, e0.z);
    return p.addScaledVector(e1.clone().sub(e0), s * sc);
  };
  return out;
}

// ---------------------------------------------------------------- a chapter's disease
// A chapter's disease on whatever heart the page shows (the LA of raised filling pressure, say):
// targets dx_<key> on every mesh, built by the phenotypes' fields and weighted 0 to 1 by the
// chapter (echo.js setDisease). Weight 1 is the change below; a target is linear in its weight.
export const DISEASE = {
  // the left atrium scaled about the mitral valve: by 2 at weight 1, so weight w scales it by 1 + w
  la: { la: 2 },
};
/** Add disease key's target to every mesh (ctx from preparePhenotypes); returns how far a landmark moves at weight 1. */
export async function buildDisease(ctx, key) {
  const P = DISEASE[key], { anat, F } = ctx;
  const out = await buildTargets(ctx, P, { ed: `dx_${key}`, sys: null, mid: null, far: null });
  /** The move of landmark name at weight 1 and end-diastole (cm). */
  out.shift = (name) => {
    const e0 = anat.raw(name, 0, 0), d = [0, 0, 0];
    lvField(F, P, e0.x, e0.y, e0.z, d);
    annulusField(F, P, e0.x, e0.y, e0.z, d);
    if (name === 'la_c' || name === 'la_r') laField(F, P, e0.x, e0.y, e0.z, d, 1);
    return V3(d[0], d[1], d[2]);
  };
  return out;
}

/**
 * The targets of shape P (a MESH or DISEASE entry) on every mesh, under the names T: ed (the
 * end-diastolic change, weight 1), sys (the change to the systolic motion; null for none), mid
 * and far (a valve's shapes along its swing). Returns the systolic scale at a point, sys(x, y, z).
 */
async function buildTargets(ctx, P, T) {
  const { meshes, F, REG, lvMask, laNear, aoNear, aoLine, desc, mpos, nMyo } = ctx;
  const tick = slicer();
  const S = P.sys || { lv: 1, other: 1 };
  // systolic scale of the LV wall by segment, and the other walls
  let lvScale;
  if (S.lad !== undefined) {
    const lad = new Set(TERRITORY.lad);
    lvScale = segGrid((s) => (s === 17 ? S.apex : lad.has(s) ? S.lad : S.remote));
  } else lvScale = () => S.lv;
  const ladGrid = P.lvAmy && P.lvAmy.lad ? segGrid((s) => (TERRITORY.lad.includes(s) ? 1 : 0)) : null;
  const scaleAt = (x, y, z) => {
    const c = lvCoords(F, x, y, z);
    const w = (1 - smooth((c.r - F.Rref(c.u) - 0.9) / 0.8)) * (1 - smooth((c.u - 1.02) / 0.12));
    const sc = segCoords(F, x, y, z);
    return S.other + (lvScale(sc.hs, sc.th) - S.other) * w;
  };
  const amyAt = (i, x, y, z) => {
    if (!P.lvAmy) return 0;
    if (P.lvAmy.lv) return P.lvAmy.lv * lvMask[i];
    const sc = segCoords(F, x, y, z);
    return P.lvAmy.lad * ladGrid(sc.hs, sc.th) * lvMask[i];
  };
  // ---- myocardium
  const myoMesh = meshes.Myocardium;
  const sysT = targetOf(myoMesh, 'systole'), amyT = targetOf(myoMesh, 'amyloid'), amySysT = targetOf(myoMesh, 'amyloid_systole');
  const ed = new Float32Array(mpos.length), sy = new Float32Array(mpos.length), scaleMyo = new Float32Array(nMyo);
  const d = [0, 0, 0];
  for (let i = 0; i < nMyo; i++) {
    if ((i & 255) === 0) await tick();
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
    d[0] = d[1] = d[2] = 0;
    lvField(F, P, x, y, z, d);
    annulusField(F, P, x, y, z, d);
    laField(F, P, x, y, z, d, laNear[i]);
    aortaField(F, P, x, y, z, d, aoNear[i], aoLine);
    if (P.la && (REG[i] === 3 || REG[i] === 7)) descGuard(desc, x, y, z, d);
    const aw = amyAt(i, x, y, z);
    for (let k = 0; k < 3; k++) ed[3 * i + k] = d[k] + aw * amyT[3 * i + k];
    const sc = scaleAt(x, y, z);
    scaleMyo[i] = sc;
    for (let k = 0; k < 3; k++) sy[3 * i + k] = (sc - 1) * sysT[3 * i + k] + aw * amySysT[3 * i + k];
  }
  addTarget(myoMesh, T.ed, ed);
  if (T.sys) addTarget(myoMesh, T.sys, sy);
  // ---- the pericardium and the coronary arteries go with the wall under them
  const GW = grid(mpos, null, 1.0);
  for (const name of ['Pericardium', 'Coronaries']) {
    const mesh = meshes[name];
    if (!mesh) continue;
    const p = mesh.geometry.attributes.position.array, n = p.length / 3;
    const st = targetOf(mesh, 'systole');
    const e2 = new Float32Array(p.length), s2 = new Float32Array(p.length);
    for (let j = 0; j < n; j++) {
      if ((j & 127) === 0) await tick();
      const x = p[3 * j], y = p[3 * j + 1], z = p[3 * j + 2];
      const nb = nearest(GW, x, y, z, 6, 2.5);
      let wsum = 0, sc = 0;
      const acc = [0, 0, 0];
      for (const [i, d2] of nb) {
        const w = 1 / (d2 + 0.02);
        wsum += w;
        sc += w * scaleMyo[i];
        for (let k = 0; k < 3; k++) acc[k] += w * ed[3 * i + k];
      }
      if (wsum > 0) {
        for (let k = 0; k < 3; k++) e2[3 * j + k] = acc[k] / wsum;
        sc /= wsum;
      } else {
        d[0] = d[1] = d[2] = 0;
        lvField(F, P, x, y, z, d);
        for (let k = 0; k < 3; k++) e2[3 * j + k] = d[k];
        sc = scaleAt(x, y, z);
      }
      for (let k = 0; k < 3; k++) s2[3 * j + k] = (sc - 1) * st[3 * j + k];
    }
    addTarget(mesh, T.ed, e2);
    if (T.sys) addTarget(mesh, T.sys, s2);
  }
  // ---- papillary muscles, valves and chordae: the fields where they are
  for (const name of ['Papillary', 'MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve', 'MitralChordae', 'TricuspidChordae']) {
    const mesh = meshes[name];
    if (!mesh) continue;
    const g = mesh.geometry, p = g.attributes.position.array, n = p.length / 3;
    const st = targetOf(mesh, 'systole'), at = targetOf(mesh, 'amyloid'), ast = targetOf(mesh, 'amyloid_systole');
    const e2 = new Float32Array(p.length), s2 = new Float32Array(p.length);
    const aw = name === 'Papillary' && P.lvAmy && P.lvAmy.lv ? P.lvAmy.lv : 0;
    for (let j = 0; j < n; j++) {
      if ((j & 255) === 0) await tick();
      const x = p[3 * j], y = p[3 * j + 1], z = p[3 * j + 2];
      d[0] = d[1] = d[2] = 0;
      lvField(F, P, x, y, z, d);
      annulusField(F, P, x, y, z, d);
      const sc = scaleAt(x, y, z);
      for (let k = 0; k < 3; k++) {
        e2[3 * j + k] = d[k] + aw * at[3 * j + k];
        s2[3 * j + k] = (sc - 1) * st[3 * j + k] + aw * ast[3 * j + k];
      }
    }
    const extra = valveShapes(F, P, name, mesh, e2);
    if (extra.ed) for (let i = 0; i < e2.length; i++) e2[i] += extra.ed[i];
    addTarget(mesh, T.ed, e2);
    if (T.sys) addTarget(mesh, T.sys, s2);
    if (extra.mid) addTarget(mesh, T.mid, extra.mid);
    if (extra.far) addTarget(mesh, T.far, extra.far);
  }
  return { sys: scaleAt };
}

/**
 * Valve shapes for a phenotype, beyond the fields: thicker leaflets, billowing, tenting, and the
 * fused bicuspid valve. e0: the field's end-diastolic change already found for this mesh.
 * Returns { ed, mid, far } (Float32Arrays or null).
 */
function valveShapes(F, P, name, mesh, e0) {
  const g = mesh.geometry, base = g.attributes.position.array, n = base.length / 3, idx = g.index.array;
  const res = { ed: null, mid: null, far: null };
  const mid = targetOf(mesh, 'leaflets_mid'), far = targetOf(mesh, 'leaflets');
  const shape = (t, extra) => {
    const out = new Float32Array(base.length);
    for (let i = 0; i < out.length; i++) out[i] = base[i] + e0[i] + (t ? t[i] : 0) + (extra ? extra[i] : 0);
    return out;
  };
  const mvPlane = (x, y, z) => {
    const qx = x - F.mvC.x, qy = y - F.mvC.y, qz = z - F.mvC.z, nn = F.mvN;
    const h = qx * nn.x + qy * nn.y + qz * nn.z;
    return { h, rho: Math.hypot(qx - h * nn.x, qy - h * nn.y, qz - h * nn.z) };
  };
  // ---- mitral valve and its chordae
  if ((name === 'MitralValve' || name === 'MitralChordae') && (P.billow || P.tent) && far) {
    const leaflet = name === 'MitralValve' ? (i) => F.mvPart[i] !== F.mvRing : () => true;
    const R = F.mvR * (P.annulus || 1);
    const shut = shape(far);
    const push = new Float32Array(base.length);
    for (let i = 0; i < n; i++) {
      if (!leaflet(i)) continue;
      const x = shut[3 * i], y = shut[3 * i + 1], z = shut[3 * i + 2];
      const { h, rho } = mvPlane(x, y, z);
      const prof = Math.max(0, 1 - (rho / R) ** 2);
      // chordae follow the leaflets near them, not near the papillary muscles
      const hf = name === 'MitralChordae' ? smooth((h + 2.3) / 1.3) : 1;
      const amt = (P.billow || 0) * prof * hf - (P.tent || 0) * prof * hf;
      for (let k = 0; k < 3; k++) push[3 * i + k] = F.mvN.getComponent(k) * amt;
    }
    res.far = push;
    if (name === 'MitralValve' && P.mvThick) {
      // thick leaflets: each face moves out along its normal, in the open, middle and shut shapes
      const t = P.mvThick;
      const n0 = normals(shape(null), idx), nm = normals(shape(mid), idx), nf = normals(shape(far, push), idx);
      res.ed = new Float32Array(base.length);
      res.mid = new Float32Array(base.length);
      for (let i = 0; i < n; i++) {
        if (!leaflet(i)) continue;
        for (let k = 0; k < 3; k++) {
          res.ed[3 * i + k] = t * n0[3 * i + k];
          res.mid[3 * i + k] = t * (nm[3 * i + k] - n0[3 * i + k]);
          res.far[3 * i + k] += t * (nf[3 * i + k] - n0[3 * i + k]);
        }
      }
    }
  }
  // ---- the bicuspid aortic valve
  if (name === 'AorticValve' && P.av && far && mid) {
    const ax = F.aoAxis || (F.aoAxis = aorticAxis(F));
    const e1 = V3(1, 0, 0).addScaledVector(ax, -ax.x).normalize(), e2 = ax.clone().cross(e1);
    const C = F.av;
    const angOf = (x, y, z) => Math.atan2((x - C.x) * e2.x + (y - C.y) * e2.y + (z - C.z) * e2.z, (x - C.x) * e1.x + (y - C.y) * e1.y + (z - C.z) * e1.z);
    // the three cusps: their bellies are the lowest points round the root
    const low = new Float32Array(72).fill(Infinity);
    for (let i = 0; i < n; i++) {
      const x = base[3 * i], y = base[3 * i + 1], z = base[3 * i + 2];
      const b = Math.floor(((angOf(x, y, z) + Math.PI) / (2 * Math.PI)) * 72) % 72;
      low[b] = Math.min(low[b], (x - C.x) * ax.x + (y - C.y) * ax.y + (z - C.z) * ax.z);
    }
    let b0 = 0;
    for (let b = 0; b < 24; b++) {
      const sum = (bb) => low[bb % 72] + low[(bb + 24) % 72] + low[(bb + 48) % 72];
      if (sum(b) < sum(b0)) b0 = b;
    }
    const centres = [0, 1, 2].map((k) => ((b0 + 0.5 + 24 * k) / 72) * 2 * Math.PI - Math.PI);
    const dirOf = (a) => e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
    // right coronary cusp: the most anterior; non-coronary: the more rightward of the others
    const ANT = V3(0, 0, 1), LEFT = V3(1, 0, 0);
    const order = centres.map((a, i) => ({ a, i, ant: dirOf(a).dot(ANT), left: dirOf(a).dot(LEFT) }));
    const R = order.slice().sort((p, q) => q.ant - p.ant)[0];
    const rest = order.filter((o) => o !== R).sort((p, q) => p.left - q.left);
    const N = rest[0], L = rest[1];
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // the raphe: where the right and left cusps meet
    const raphe = R.a + wrap(L.a - R.a) / 2;
    const cuspOf = (a) => {
      let best = null;
      for (const o of order) { const dd = Math.abs(wrap(a - o.a)); if (!best || dd < best.dd) best = { o, dd }; }
      return best.o;
    };
    const k = P.av.open, domeH = P.av.dome;
    // how much of its normal swing a point makes: the right and left cusps are fused at the
    // raphe and open only toward their commissures with the non-coronary cusp, so the orifice
    // runs between the two remaining commissures (a fish mouth); every opening is restricted
    const swingOf = (a) => {
      const c = cuspOf(a);
      if (c === N) return k;
      return k * smooth(Math.abs(wrap(a - raphe)) / ((2 * Math.PI) / 3));
    };
    const rootR = 1.13;
    const build = (t, frac) => {
      const o = new Float32Array(base.length);
      for (let i = 0; i < n; i++) {
        const x = base[3 * i], y = base[3 * i + 1], z = base[3 * i + 2];
        const lam = swingOf(angOf(x, y, z));
        // doming: the bellies bow into the aorta while the edges are held
        const px = x + lam * t[3 * i] - C.x, py = y + lam * t[3 * i + 1] - C.y, pz = z + lam * t[3 * i + 2] - C.z;
        const hh = px * ax.x + py * ax.y + pz * ax.z;
        const rho = clamp(Math.hypot(px - hh * ax.x, py - hh * ax.y, pz - hh * ax.z) / rootR, 0, 1);
        const dome = domeH * frac * 4 * rho * (1 - rho);
        for (let q = 0; q < 3; q++) o[3 * i + q] = (lam - 1) * t[3 * i + q] + ax.getComponent(q) * dome;
      }
      return o;
    };
    res.mid = build(mid, 0.6);
    res.far = build(far, 1);
    // thick, stiff cusps; thicker again along the raphe, the fused edge of the right and left cusps
    const th = P.av.thick;
    const thAt = (i) => {
      const a = angOf(base[3 * i], base[3 * i + 1], base[3 * i + 2]), c = cuspOf(a);
      return c === N ? th : th * (1 + 2.2 * Math.exp(-((wrap(a - raphe) / 0.3) ** 2)));
    };
    const n0 = normals(shape(null), idx), nm = normals(shape(mid, res.mid), idx), nf = normals(shape(far, res.far), idx);
    res.ed = new Float32Array(base.length);
    for (let i = 0; i < n; i++) {
      const w = thAt(i);
      for (let q = 0; q < 3; q++) {
        const j = 3 * i + q;
        res.ed[j] = w * n0[j];
        res.mid[j] += w * (nm[j] - n0[j]);
        res.far[j] += w * (nf[j] - n0[j]);
      }
    }
    F.bav = { R: R.a, L: L.a, N: N.a, raphe, e1, e2 };
  }
  return res;
}
function aorticAxis(F) {
  // the aortic root's axis, as the Anatomy frame gives it
  return F.aoRoot.clone();
}
