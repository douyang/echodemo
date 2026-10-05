// The posterior mitral leaflet's open shape. In the valve model the open shape is the mesh's base
// and the shut one its leaflets target (gl/heart.js leafletWeights: the mitral drive runs 0 open
// to 1 shut). The posterior leaflet of that base hardly opens: across P2 it leaves the annulus
// 60-65 degrees below the annulus plane and bends back to 45-50 degrees, 1.0 cm long, while shut
// it lies 25-35 degrees below, 1.17 cm long. In the long axis its hinge sits behind a ridge of the
// posterior wall, so in diastole only its tip showed, as a stub that pointed into the orifice.
//
// Its middle shape (the drive at 0.5, which diastasis nears) lay close to the shut one too.
//
// Here the open posterior leaflet is the shut one, a smooth arc from the hinge to the coaptation,
// turned TURN degrees toward the apex about its own part of the hinge (the annulus), and LONGER
// times longer from the hinge; the middle one is the shut one turned half as far. So the leaflet
// clears the ridge and opens toward the apex and the posterior wall in early diastole, and stays
// half open in diastasis. The change fades in over the commissures, so the anterior leaflet does
// not move. The chordae next to the posterior leaflet go with it, less with distance from it. The
// shut target takes the change back, positions and normals, so the shut shape stays where it was.
// The other targets (systole, amyloid, and the burden and systole variants of the leaflet shapes)
// keep their changes, which add to the new shapes.
import * as THREE from '../../vendor/three.bundle.min.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// the posterior leaflet by its angle round the annulus from the aortic valve (deg): it changes in
// full past FULL, and not at all inside FROM (the anterior leaflet and the commissures)
const FROM = 85, FULL = 115;
// the open leaflet: the shut one turned TURN degrees toward the apex and LONGER times longer. At 20
// degrees it clears the ridge of the posterior wall in the long axis; at 30 it grazes it
const TURN = 20, LONGER = 1.1;
// the chordae go with the leaflet near it, less to none at FADE cm from it
const FADE = 1.2;
const BINS = 72;   // the annulus in 5-degree parts

/** What the last call did, for the checks: { leaflet, chordae } (the vertices moved), turn (deg) and longer. */
export let report = null;

/** Connected parts of an indexed mesh: a part number for each vertex. */
function parts(count, index) {
  const par = new Int32Array(count).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) { const a = f(index[t]); par[f(index[t + 1])] = a; par[f(index[t + 2])] = a; }
  const out = new Int32Array(count);
  for (let i = 0; i < count; i++) out[i] = f(i);
  return out;
}

/** The plane of a point set: its centre and the unit vector of least spread. */
function planeOf(pts) {
  const c = V3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const m = [0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const inv = new THREE.Matrix3().set(m[0], m[1], m[2], m[1], m[3], m[4], m[2], m[4], m[5]).invert();
  let v = V3(0.3, 0.5, 0.8).normalize();
  for (let k = 0; k < 60; k++) v = v.applyMatrix3(inv).normalize();
  return { c, n: v };
}

/** Rotate v about the unit axis k by th (rad), Rodrigues' formula. */
function turn(v, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return v.clone().multiplyScalar(c).add(k.clone().cross(v).multiplyScalar(s)).addScaledVector(k, k.dot(v) * (1 - c));
}

/**
 * Open the posterior leaflet of meshes.MitralValve, and move the chordae of meshes.MitralChordae
 * with it, in place. anat: the heart's landmarks (gl/heart.js Anatomy). Returns report.
 */
export function openPosteriorLeaflet(meshes, anat) {
  const mesh = meshes.MitralValve;
  if (!mesh || !mesh.geometry.index) return null;
  const g = mesh.geometry, base = g.attributes.position.array, n = base.length / 3;
  const dict = mesh.morphTargetDictionary || {}, MP = g.morphAttributes.position || [];
  if (!MP[dict.leaflets_mid] || !MP[dict.leaflets]) return null;
  // the annulus: the smallest part of the mesh (the leaflets are the other); its normal points into the LA
  const part = parts(n, g.index.array), cnt = new Map();
  for (let i = 0; i < n; i++) cnt.set(part[i], (cnt.get(part[i]) || 0) + 1);
  const ringPart = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const ring = [];
  for (let i = 0; i < n; i++) if (part[i] === ringPart) ring.push(V3(base[3 * i], base[3 * i + 1], base[3 * i + 2]));
  const { c: C, n: N } = planeOf(ring);
  if (N.dot(anat.point('la_c', 0, 0).sub(C)) < 0) N.negate();
  const A0 = anat.point('av', 0, 0).sub(C);
  A0.addScaledVector(N, -A0.dot(N)).normalize();
  const B0 = N.clone().cross(A0);
  const angleOf = (x, y, z) => Math.atan2((x - C.x) * B0.x + (y - C.y) * B0.y + (z - C.z) * B0.z, (x - C.x) * A0.x + (y - C.y) * A0.y + (z - C.z) * A0.z);
  const binOf = (a) => ((Math.floor(((a + Math.PI) / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS;
  // the hinge in each part of the annulus: the mean of the ring's vertices there
  const hinge = Array.from({ length: BINS }, () => ({ p: V3(), k: 0 }));
  for (const p of ring) { const b = hinge[binOf(angleOf(p.x, p.y, p.z))]; b.p.add(p); b.k++; }
  const rMean = ring.reduce((s, p) => s + p.distanceTo(C), 0) / ring.length;
  // each part's hinge, and the axis of the turn: from the valve's middle toward the apex
  const frame = hinge.map((h, b) => {
    const a = ((b + 0.5) / BINS) * 2 * Math.PI - Math.PI;
    const inw = A0.clone().multiplyScalar(-Math.cos(a)).addScaledVector(B0, -Math.sin(a));
    const at = h.k ? h.p.clone().multiplyScalar(1 / h.k) : C.clone().addScaledVector(inw, -rMean);
    return { h: at, k: inw.clone().cross(N.clone().negate()).normalize() };
  });
  // the leaflets' points and their angles round the annulus
  const leaf = new Uint8Array(n), ang = new Float32Array(n);
  const v = V3();
  for (let i = 0; i < n; i++) {
    if (part[i] === ringPart) continue;
    leaf[i] = 1;
    ang[i] = angleOf(base[3 * i], base[3 * i + 1], base[3 * i + 2]);
  }
  // the new open and middle shapes, as changes to the model's own: co and cm (positions), no and
  // nm (normals). The open leaflet is the shut one turned TURN degrees, the middle one turned half
  // as far, each about its part of the hinge; between the commissures and FULL they blend with the
  // model's own shapes
  const midT = MP[dict.leaflets_mid].array, far = MP[dict.leaflets].array;
  const MN = g.morphAttributes.normal || [], nrm = g.attributes.normal ? g.attributes.normal.array : null;
  const midN = MN[dict.leaflets_mid] ? MN[dict.leaflets_mid].array : null, farN = MN[dict.leaflets] ? MN[dict.leaflets].array : null;
  const co = new Float32Array(base.length), cm = new Float32Array(base.length);
  const no = nrm && midN && farN ? new Float32Array(nrm.length) : null, nm = no ? new Float32Array(nrm.length) : null;
  const th = (TURN * Math.PI) / 180;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    const w = smooth((Math.abs((ang[i] * 180) / Math.PI) - FROM) / (FULL - FROM));
    if (w <= 0) continue;
    const x = ((ang[i] + Math.PI) / (2 * Math.PI)) * BINS - 0.5, b0 = ((Math.floor(x) % BINS) + BINS) % BINS, b1 = (b0 + 1) % BINS, t = x - Math.floor(x);
    const h = frame[b0].h.clone().lerp(frame[b1].h, t), k = frame[b0].k.clone().lerp(frame[b1].k, t).normalize();
    const shut = V3(base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]).sub(h);
    const qo = turn(shut, k, th).multiplyScalar(LONGER).add(h), qm = turn(shut, k, th / 2).multiplyScalar((1 + LONGER) / 2).add(h);
    for (let a = 0; a < 3; a++) {
      const o = base[3 * i + a], m = o + midT[3 * i + a];
      co[3 * i + a] = w * (qo.getComponent(a) - o);
      cm[3 * i + a] = w * (qm.getComponent(a) - m);
    }
    // the normals: the shut leaflet's, turned the same
    if (no) {
      const ns = V3(nrm[3 * i] + farN[3 * i], nrm[3 * i + 1] + farN[3 * i + 1], nrm[3 * i + 2] + farN[3 * i + 2]).normalize();
      const n0 = V3(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]), n1 = V3(nrm[3 * i] + midN[3 * i], nrm[3 * i + 1] + midN[3 * i + 1], nrm[3 * i + 2] + midN[3 * i + 2]);
      const o = n0.clone().lerp(turn(ns, k, th), w).normalize(), m = n1.clone().lerp(turn(ns, k, th / 2), w).normalize();
      for (let a = 0; a < 3; a++) { no[3 * i + a] = o.getComponent(a) - n0.getComponent(a); nm[3 * i + a] = m.getComponent(a) - n1.getComponent(a); }
    }
    moved++;
  }
  // a mesh takes the changes of its open (co) and middle (cm) shapes: the base takes co, the middle
  // target cm - co and the shut target -co, so the shut shape stays where it was (positions, and
  // the normals where no and nm are given)
  const apply = (M, cO, cM, nO = null, nM = null) => {
    const G = M.geometry, d = M.morphTargetDictionary, T = G.morphAttributes.position || [], TN = G.morphAttributes.normal || [];
    const p = G.attributes.position.array, tm = T[d.leaflets_mid].array, tf = T[d.leaflets].array;
    for (let i = 0; i < cO.length; i++) {
      if (!cO[i] && !cM[i]) continue;
      p[i] += cO[i]; tm[i] += cM[i] - cO[i]; tf[i] -= cO[i];
    }
    if (nO && G.attributes.normal && TN[d.leaflets_mid] && TN[d.leaflets]) {
      const q = G.attributes.normal.array, um = TN[d.leaflets_mid].array, uf = TN[d.leaflets].array;
      for (let i = 0; i < nO.length; i++) {
        if (!nO[i] && !nM[i]) continue;
        q[i] += nO[i]; um[i] += nM[i] - nO[i]; uf[i] -= nO[i];
      }
      G.attributes.normal.needsUpdate = true;
      TN[d.leaflets_mid].needsUpdate = true; TN[d.leaflets].needsUpdate = true;
    }
    G.attributes.position.needsUpdate = true;
    T[d.leaflets_mid].needsUpdate = true; T[d.leaflets].needsUpdate = true;
    G.computeBoundingSphere();
  };
  // the chordae near the moved leaflet take its changes, less with distance (found on the open shapes)
  const ch = meshes.MitralChordae;
  const md = ch && ch.morphTargetDictionary, mp = ch && ch.geometry.morphAttributes.position;
  let chMoved = 0;
  if (md && mp && mp[md.leaflets_mid] && mp[md.leaflets]) {
    const cp = ch.geometry.attributes.position.array, cnt = cp.length / 3;
    const ko = new Float32Array(cp.length), km = new Float32Array(cp.length);
    // a grid of the moved leaflet's points, cells of FADE cm
    const cell = new Map(), key = (x, y, z) => `${Math.floor(x / FADE)}|${Math.floor(y / FADE)}|${Math.floor(z / FADE)}`;
    for (let i = 0; i < n; i++) {
      if (!leaf[i] || !(co[3 * i] || co[3 * i + 1] || co[3 * i + 2])) continue;
      const kk = key(base[3 * i], base[3 * i + 1], base[3 * i + 2]);
      if (!cell.has(kk)) cell.set(kk, []);
      cell.get(kk).push(i);
    }
    for (let j = 0; j < cnt; j++) {
      const x = cp[3 * j], y = cp[3 * j + 1], z = cp[3 * j + 2];
      const gx = Math.floor(x / FADE), gy = Math.floor(y / FADE), gz = Math.floor(z / FADE);
      let best = -1, bd = FADE * FADE;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
        for (const i of cell.get(`${gx + a}|${gy + b}|${gz + e}`) || []) {
          const dx = base[3 * i] - x, dy = base[3 * i + 1] - y, dz = base[3 * i + 2] - z, dd = dx * dx + dy * dy + dz * dz;
          if (dd < bd) { bd = dd; best = i; }
        }
      }
      if (best < 0) continue;
      const f = 1 - smooth(Math.sqrt(bd) / FADE);
      for (let k = 0; k < 3; k++) { ko[3 * j + k] = f * co[3 * best + k]; km[3 * j + k] = f * cm[3 * best + k]; }
      chMoved++;
    }
    apply(ch, ko, km);
  }
  apply(mesh, co, cm, no, nm);
  report = { leaflet: moved, chordae: chMoved, turn: TURN, longer: LONGER };
  return report;
}
