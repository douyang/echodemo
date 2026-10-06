// Anatomy below the heart, for the subcostal echo views only (the 3D heart does not draw it):
// the liver, its top moulded to the underside of the heart (the diaphragm between them); the
// IVC from the model's stub down through the liver; the right and middle hepatic veins; the
// abdominal aorta from the end of the model's descending aorta, with the celiac trunk and the
// superior mesenteric artery; and the vertebral bodies behind the aorta.
// World cm, the model's frame: x to the patient's left, y up, z to the front.
import * as THREE from '../vendor/three.bundle.min.js';

/** Centerlines (world cm) and radii at the two ends (cm). */
export const ABD = {
  ivc: { pts: [[-3.0, -4.2, 1.8], [-2.8, -6.0, 0.8], [-2.5, -8.5, -0.6], [-2.2, -11.5, -1.6], [-2.0, -15.5, -2.0]], r: [1.05, 0.95] },
  mhv: { pts: [[-2.8, -5.3, 1.2], [-2.0, -6.6, 2.8], [-1.2, -8.2, 4.6]], r: [0.4, 0.22] },
  rhv: { pts: [[-3.2, -5.4, 1.0], [-4.8, -6.6, 1.6], [-6.6, -8.2, 2.2]], r: [0.42, 0.24] },
  // the aorta and the spine come forward below the diaphragm with the lumbar curve
  aorta: { pts: [[0.62, -3.4, -6.0], [0.55, -7.0, -5.0], [0.45, -11.0, -3.8], [0.35, -15.5, -3.0]], r: [1.1, 0.95] },
  celiac: { pts: [[0.45, -8.1, -3.9], [0.5, -7.7, -2.6], [0.55, -7.4, -1.7]], r: [0.32, 0.26] },
  sma: { pts: [[0.42, -9.4, -3.5], [0.4, -9.9, -2.4], [0.36, -12.5, -2.0], [0.3, -15.5, -1.8]], r: [0.3, 0.26] },
  spine: { pts: [[0.1, -4.5, -8.6], [0.0, -10.0, -7.6], [-0.1, -16.0, -6.6]], r: [1.8, 1.8] },
};

// the liver's bounding ellipsoid (world cm): centre and radii
const LC = new THREE.Vector3(-2.0, -10.0, 2.0), LR = new THREE.Vector3(9.0, 5.5, 7.2);
const inLiver = (p) => ((p.x - LC.x) / LR.x) ** 2 + ((p.y - LC.y) / LR.y) ** 2 + ((p.z - LC.z) / LR.z) ** 2 < 1;

/**
 * Where a subcostal probe sits for a beam d that reaches target: back along the beam to the
 * last point inside the liver, then wall (cm) of abdominal wall.
 */
export function beneath(target, d, wall) {
  let last = -1;
  const p = new THREE.Vector3();
  for (let t = 0; t <= 26; t += 0.1) {
    p.copy(target).addScaledVector(d, -t);
    if (inLiver(p)) last = t;
  }
  return target.clone().addScaledVector(d, -((last < 0 ? 8 : last) + wall));
}

/** Join vertices that share a position (a sphere repeats its seam), so sections close. */
export function weld(g) {
  const p = g.attributes.position, map = new Map(), idx = [], pos = [];
  const remap = new Int32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    remap[i] = j;
  }
  const src = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
  for (let t = 0; t < src.length; t += 3) {
    const a = remap[src[t]], b = remap[src[t + 1]], c = remap[src[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** A tube along a smooth path, closed at both ends, so a plane always cuts a closed outline. */
function tube(pts, r0, r1, seg = 16) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const N = Math.max(8, Math.round(curve.getLength() / 0.35));
  const fr = curve.computeFrenetFrames(N, false);
  const pos = [], idx = [];
  // each vertex's ring centre and its distance (cm) along the tube from its first end, for a
  // change of caliber (echo.js setIvc)
  const ctr = [], along = [], len = curve.getLength();
  for (let i = 0; i <= N; i++) {
    const c = curve.getPointAt(i / N), r = r0 + (r1 - r0) * (i / N);
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const p = c.clone().addScaledVector(fr.normals[i], r * Math.cos(a)).addScaledVector(fr.binormals[i], r * Math.sin(a));
      pos.push(p.x, p.y, p.z);
      ctr.push(c.x, c.y, c.z);
      along.push((i / N) * len);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  const capFrom = pos.length / 3;
  // end caps: a centre point joined to each ring
  for (const [i, flip] of [[0, true], [N, false]]) {
    const c = curve.getPointAt(i / N), ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    ctr.push(c.x, c.y, c.z);
    along.push((i / N) * len);
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g);
  m.userData.capFrom = capFrom;
  m.userData.centers = new Float32Array(ctr);
  m.userData.along = new Float32Array(along);
  return m;
}

/**
 * The liver: an ellipsoid (the right lobe is the large part, on the patient's right) whose top
 * is pressed down to 0.35 cm below the underside of the heart, where the heart lies on it.
 */
function liver(heart) {
  // lowest point of the heart and pericardium over a grid in x and z (0.75 cm cells)
  const x0 = -13, z0 = -9, cell = 0.75, nx = 32, nz = 30;
  const low = new Float32Array(nx * nz).fill(Infinity);
  const v = new THREE.Vector3();
  for (const name of ['Pericardium', 'Myocardium']) {
    const m = heart.meshes[name];
    if (!m) continue;
    m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (v.y > 2) continue;
      const ix = Math.floor((v.x - x0) / cell), iz = Math.floor((v.z - z0) / cell);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const k = iz * nx + ix;
      if (v.y < low[k]) low[k] = v.y;
    }
  }
  // spread each low point to its neighbours (a smooth dome under the heart)
  const dome = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let m = Infinity;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        m = Math.min(m, low[jz * nx + jx] + 0.12 * (dx * dx + dz * dz));
      }
      dome[iz * nx + ix] = m;
    }
  }
  const top = (x, z) => {
    const ix = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / cell))), iz = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / cell)));
    return dome[iz * nx + ix] - 0.35;
  };
  const C = LC, R = LR;
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const x = C.x + v.x * R.x;
    let z = C.z + v.z * R.z;
    let y = C.y + v.y * R.y;
    // the left lobe is thinner than the right, and lies in front of the aorta
    if (x > C.x) y = C.y + (y - C.y) * (1 - 0.35 * ((x - C.x) / R.x));
    if (z < C.z) z = C.z + (z - C.z) * (1 - 0.55 * Math.min(1, Math.max(0, (x - C.x + 1) / 5)));
    y = Math.min(y, top(x, z));
    p.setXYZ(i, x, y, z);
  }
  return new THREE.Mesh(weld(g));
}

/** The liver alone, built once per heart model (the 3D views draw it: gl/liver3d.js). */
const livers = new WeakMap();
export function buildLiver(heart) {
  if (!livers.has(heart)) livers.set(heart, liver(heart));
  return livers.get(heart);
}

/** The meshes, built once from the heart model. */
export function buildAbdomen(heart) {
  const out = { liver: new THREE.Mesh(buildLiver(heart).geometry) };
  for (const [k, t] of Object.entries(ABD)) out[k] = tube(t.pts, t.r[0], t.r[1], k === 'spine' ? 20 : 16);
  for (const m of Object.values(out)) m.updateMatrixWorld(true);
  return out;
}
