// The pulmonary trunk and its branches, re-shaped when the model loads. The model's trunk rose 48
// degrees from its valve to the bifurcation, 30 degrees out of the plane square to the aortic root,
// so the parasternal short axis at the aortic valve cut it as a stub. In a heart the trunk runs back
// round the left side of the aorta near that plane (the circle and sausage of normally related great
// arteries). The RPA runs behind the aorta, and the LPA runs back and to the left over the left
// bronchus. Here (angles in degrees: elevation above the horizontal, then azimuth toward the
// patient's left from straight back):
//   the trunk bends along its own axis, from s0 to s1 cm above the valve, to (e, phi); past s1 it
//     moves as one piece, so the bifurcation and both branches go with it;
//   the LPA bends along its own axis over its first a1 cm to (eL, phiL), then turns down over the
//     bronchus from b0 to b1 cm to (eL2, phiL2);
//   the RPA climbs from the lowered bifurcation to rpaUp over ra0..ra1 cm, then levels off to
//     rpaLevel over rb0..rb1 cm, so it still passes under the arch.
// First the two holes in the wall close (closeHoles, below). The pulmonary valve moves with the
// trunk's field. The RV muscle round the trunk's root, and the pericardium and coronaries near the
// PA, follow the nearest PA point: each by the share of the gap it lies across (its distance to
// fixed tissue over the sum of both distances), so what lies between the PA and a fixed wall is
// squeezed, not crossed. Each morph target's displacement, and each normal, turns with its point.
import * as THREE from '../../vendor/three.bundle.min.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const D2R = Math.PI / 180;
const dirn = (e, phi) => new THREE.Vector3(Math.cos(e * D2R) * Math.sin(phi * D2R), Math.sin(e * D2R), -Math.cos(e * D2R) * Math.cos(phi * D2R));

// The PA's axes, measured on the model from medial points of its lumen (cm; x the patient's left,
// y up, z front): the trunk's axis 3.5 cm from the valve, and each branch's axis where it leaves.
export const PA_AXES = {
  trunkEnd: [2.59, 6.45, -0.03],
  lpaFrom: [2.95, 6.62, -0.12], lpaDir: [0.745, -0.13, -0.65],
  rpaFrom: [2.0, 6.5, -1.1], rpaDir: [-0.976, -0.08, -0.2],
};
export const PA_SHAPE = {
  e: 15, phi: 19, s0: 0.5, s1: 2.8,
  eL: 19, phiL: 25, a0: 0, a1: 2, eL2: -25, phiL2: 30, b0: 2.0, b1: 3.5,
  rpaUp: [30, -89], ra0: 0.2, ra1: 1.0, rpaLevel: [0, -92], rb0: 1.6, rb1: 2.4,
  sleeve: 1.0, peri: 3.0, cor: 0.8,
};

/** A bend along an axis line (origin A, direction u): points turn by angle th * w(a) about k. */
class AxisBend {
  constructor(A, u, k, th, a0, a1, amax = 12, h = 0.005) {
    this.A = A.clone(); this.u = u.clone().normalize(); this.a0 = a0; this.h = h; this.amax = amax;
    const n = Math.round(amax / h) + 1, kk = k.clone().normalize();
    this.q = new Array(n); this.C = new Float64Array(3 * n);
    const c = A.clone(), prev = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const w = th * smooth((i * h - a0) / (a1 - a0));
      this.q[i] = new THREE.Quaternion().setFromAxisAngle(kk, w);
      t.copy(this.u).applyQuaternion(this.q[i]);
      if (i > 0) c.addScaledVector(prev, h / 2).addScaledVector(t, h / 2);
      prev.copy(t);
      this.C[3 * i] = c.x; this.C[3 * i + 1] = c.y; this.C[3 * i + 2] = c.z;
    }
  }
  /** Moves p (in place); returns the turn as a quaternion, or null where nothing moves. */
  apply(p) {
    const a = this._d.copy(p).sub(this.A).dot(this.u);
    if (a <= this.a0) return null;
    const ac = Math.min(a, this.amax), j = Math.round(ac / this.h), q = this.q[j];
    const off = this._d.copy(p).sub(this.A).addScaledVector(this.u, -ac).applyQuaternion(q);
    p.set(this.C[3 * j], this.C[3 * j + 1], this.C[3 * j + 2]).add(off);
    if (a > this.amax) p.addScaledVector(this._e.copy(this.u).applyQuaternion(q), a - this.amax);
    return q;
  }
}
AxisBend.prototype._d = new THREE.Vector3();
AxisBend.prototype._e = new THREE.Vector3();

/** A k-d tree over points ids of xyz, for nearest-point queries within a reach. */
class KDTree {
  constructor(xyz, ids) {
    this.xyz = xyz; this.ids = Int32Array.from(ids); this.axis = new Uint8Array(this.ids.length);
    this._build(0, this.ids.length);
  }
  _build(lo, hi) {
    if (hi - lo <= 1) return;
    const { xyz, ids } = this, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = lo; i < hi; i++) for (let k = 0; k < 3; k++) { const c = xyz[3 * ids[i] + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
    const ax = mx[0] - mn[0] >= mx[1] - mn[1] && mx[0] - mn[0] >= mx[2] - mn[2] ? 0 : mx[1] - mn[1] >= mx[2] - mn[2] ? 1 : 2;
    const mid = (lo + hi) >> 1;
    // quickselect: the median along ax at mid
    let l = lo, r = hi - 1;
    while (l < r) {
      const pv = xyz[3 * ids[(l + r) >> 1] + ax];
      let i = l, j = r;
      while (i <= j) {
        while (xyz[3 * ids[i] + ax] < pv) i++;
        while (xyz[3 * ids[j] + ax] > pv) j--;
        if (i <= j) { const t = ids[i]; ids[i] = ids[j]; ids[j] = t; i++; j--; }
      }
      if (mid <= j) r = j; else if (mid >= i) l = i; else break;
    }
    this.axis[mid] = ax;
    this._build(lo, mid); this._build(mid + 1, hi);
  }
  /** The nearest point within reach of (x, y, z): { i, d }, or null. */
  nearest(x, y, z, reach) {
    const { xyz, ids, axis } = this, q = [x, y, z];
    let best = -1, bd = reach * reach;
    const visit = (lo, hi) => {
      if (hi <= lo) return;
      const mid = (lo + hi) >> 1, p = ids[mid];
      const dx = xyz[3 * p] - x, dy = xyz[3 * p + 1] - y, dz = xyz[3 * p + 2] - z, d = dx * dx + dy * dy + dz * dz;
      if (d < bd || (d === bd && p < best)) { bd = d; best = p; }
      if (hi - lo === 1) return;
      const diff = q[axis[mid]] - xyz[3 * p + axis[mid]];
      if (diff < 0) { visit(lo, mid); if (diff * diff <= bd) visit(mid + 1, hi); } else { visit(mid + 1, hi); if (diff * diff <= bd) visit(lo, mid); }
    };
    visit(0, ids.length);
    return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
  }
}

/** The field: moves p in place and returns its turn as a Matrix3 (identity where nothing moves). */
export class PABend {
  constructor(pv, shape = PA_SHAPE, axes = PA_AXES) {
    this.C0 = pv.clone();
    const E0 = V3(axes.trunkEnd), T = E0.clone().sub(this.C0).normalize();
    this.T = T;
    const t2 = dirn(shape.e, shape.phi), th = Math.acos(THREE.MathUtils.clamp(T.dot(t2), -1, 1));
    this.trunk = new AxisBend(this.C0, T, new THREE.Vector3().crossVectors(T, t2), th, shape.s0, shape.s1);
    const full = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(T, t2).normalize(), th);
    this.J0 = V3(axes.lpaFrom); this.L0 = V3(axes.lpaDir).normalize();
    this.JR0 = V3(axes.rpaFrom); this.R0 = V3(axes.rpaDir).normalize();
    const J1 = this.J0.clone(); this.trunk.apply(J1);
    const L1 = this.L0.clone().applyQuaternion(full), lt = dirn(shape.eL, shape.phiL);
    this.lpa = new AxisBend(J1, L1, new THREE.Vector3().crossVectors(L1, lt), Math.acos(THREE.MathUtils.clamp(L1.dot(lt), -1, 1)), shape.a0, shape.a1);
    // the LPA's second turn, down over the left bronchus, along its turned axis
    const l2 = dirn(shape.eL2, shape.phiL2);
    this.lpa2 = new AxisBend(J1, lt, new THREE.Vector3().crossVectors(lt, l2), Math.acos(THREE.MathUtils.clamp(lt.dot(l2), -1, 1)), shape.b0, shape.b1);
    // the RPA climbs from the lowered bifurcation, then levels off to pass under the arch
    const JR1 = this.JR0.clone(); this.trunk.apply(JR1);
    const R1 = this.R0.clone().applyQuaternion(full), rt = dirn(...shape.rpaUp), r2 = dirn(...shape.rpaLevel);
    this.rpa = new AxisBend(JR1, R1, new THREE.Vector3().crossVectors(R1, rt), Math.acos(THREE.MathUtils.clamp(R1.dot(rt), -1, 1)), shape.ra0, shape.ra1);
    this.rpa2 = new AxisBend(JR1, rt, new THREE.Vector3().crossVectors(rt, r2), Math.acos(THREE.MathUtils.clamp(rt.dot(r2), -1, 1)), shape.rb0, shape.rb1);
    this.bif = E0.clone(); this.trunk.apply(this.bif);   // where the trunk's axis ends now
    this._v = new THREE.Vector3(); this._p = new THREE.Vector3(); this._q = new THREE.Vector3();
    this._m4 = new THREE.Matrix4(); this._m3 = new THREE.Matrix3(); this._qb = new THREE.Quaternion();
    this._branches = [[[this.lpa, this.lpa2], this.J0, this.L0, this.R0], [[this.rpa, this.rpa2], this.JR0, this.R0, this.L0]];
  }
  /** 0 on the trunk below its end, 1 past the junction or well off the trunk's axis. */
  _beyond(p) {
    const v = this._v.copy(p).sub(this.C0), s = v.dot(this.T), rho = v.addScaledVector(this.T, -s).length();
    return Math.max(smooth((s - 2.8) / 0.6), smooth((rho - 1.6) / 0.5) * smooth((s - 1.5) / 0.5));
  }
  /** How much p belongs to a branch (from J along dir, against the other branch's dir). */
  _side(p, J, dir, other) {
    const v = this._v.copy(p).sub(J), a = v.dot(dir), b = v.dot(other);
    return smooth(a - b) * smooth((a + 0.3) / 0.6);
  }
  /** Moves p (in place) as a PA point; m receives its turn. branches: false for the valve. */
  move(p, m, branches = true) {
    const orig = this._p.copy(p);
    const qT = this.trunk.apply(p);
    if (qT) m.setFromMatrix4(this._m4.makeRotationFromQuaternion(qT)); else m.identity();
    if (!branches) return;
    const beyond = this._beyond(orig);
    if (beyond <= 0) return;
    for (const [bends, J, dir, other] of this._branches) {
      const w = this._side(orig, J, dir, other) * beyond;
      if (w <= 0) continue;
      const q = this._q.copy(p), qB = this._qb.identity();
      let any = false;
      for (const bend of bends) { const qi = bend.apply(q); if (qi) { qB.premultiply(qi); any = true; } }
      if (!any) continue;
      p.lerp(q, w);
      const RB = this._m3.setFromMatrix4(this._m4.makeRotationFromQuaternion(qB)).multiply(m);
      for (let i = 0; i < 9; i++) m.elements[i] += (RB.elements[i] - m.elements[i]) * w;
    }
  }
}

/** Turn a morph-target displacement or a normal at vertex i by m. */
function turn(attr, i, m, v) { v.fromBufferAttribute(attr, i).applyMatrix3(m); attr.setXYZ(i, v.x, v.y, v.z); }

/**
 * Re-shape the PA in meshes (Myocardium, PulmonaryValve, Pericardium, Coronaries), in place.
 * pv: the pulmonary valve's centre (anatomy landmark). Returns the field (for its bifurcation).
 */
export function bendPA(meshes, pv, shape = PA_SHAPE) {
  const F = new PABend(pv, shape), myo = meshes.Myocardium;
  if (!myo) return F;
  const g = myo.geometry, P = g.attributes.position, col = g.attributes.color, n = P.count;
  const orig = Float32Array.from(P.array);
  const reg = new Uint8Array(n);
  for (let i = 0; i < n; i++) reg[i] = Math.round(col.getX(i) * 10);
  closeHoles(g, reg);
  const pa = [], still = [];
  for (let i = 0; i < n; i++) (reg[i] === 6 ? pa : still).push(i);
  const mats = new Map();   // vertex -> Matrix3 turn
  const disp = new Map();   // PA vertex -> [dx, dy, dz]
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (const i of pa) {
    p.fromBufferAttribute(P, i);
    const m = new THREE.Matrix3();
    F.move(p, m);
    disp.set(i, [p.x - orig[3 * i], p.y - orig[3 * i + 1], p.z - orig[3 * i + 2]]);
    P.setXYZ(i, p.x, p.y, p.z); mats.set(i, m);
  }
  const paTree = new KDTree(orig, pa);
  // the PA's box: points further than a reach from it skip the nearest-point search
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of pa) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], orig[3 * i + k]); hi[k] = Math.max(hi[k], orig[3 * i + k]); }
  const near = (x, y, z, r) => x > lo[0] - r && x < hi[0] + r && y > lo[1] - r && y < hi[1] + r && z > lo[2] - r && z < hi[2] + r;
  const blend = (m, w) => { const out = new THREE.Matrix3(); for (let k = 0; k < 9; k++) out.elements[k] += (m.elements[k] - out.elements[k]) * w; return out; };
  // the RV muscle round the trunk's root
  const sleeve = new Set();
  for (const i of still) {
    if (reg[i] !== 2 || !near(orig[3 * i], orig[3 * i + 1], orig[3 * i + 2], shape.sleeve)) continue;
    const hit = paTree.nearest(orig[3 * i], orig[3 * i + 1], orig[3 * i + 2], shape.sleeve);
    if (!hit) continue;
    const w = smooth(1 - hit.d / shape.sleeve), d = disp.get(hit.i);
    if (w <= 0 || (!d[0] && !d[1] && !d[2])) continue;
    P.setXYZ(i, orig[3 * i] + d[0] * w, orig[3 * i + 1] + d[1] * w, orig[3 * i + 2] + d[2] * w);
    mats.set(i, blend(mats.get(hit.i), w)); sleeve.add(i);
  }
  turnMesh(g, mats, v);
  // the pericardium and the coronaries near the PA
  const FAR = 4;
  const fixed = new KDTree(orig, still.filter((i) => !sleeve.has(i) && near(orig[3 * i], orig[3 * i + 1], orig[3 * i + 2], FAR + shape.peri)));
  for (const [name, reach] of [['Pericardium', shape.peri], ['Coronaries', shape.cor]]) {
    const mesh = meshes[name];
    if (!mesh) continue;
    const G = mesh.geometry, Q = G.attributes.position, qm = new Map();
    for (let i = 0; i < Q.count; i++) {
      const x = Q.getX(i), y = Q.getY(i), z = Q.getZ(i);
      if (!near(x, y, z, reach)) continue;
      const hit = paTree.nearest(x, y, z, reach);
      if (!hit) continue;
      const other = fixed.nearest(x, y, z, FAR), dO = other ? other.d : FAR;
      const w = (dO / (dO + hit.d + 1e-9)) * smooth(1 - hit.d / reach), d = disp.get(hit.i);
      if (w <= 1e-4) continue;
      Q.setXYZ(i, x + d[0] * w, y + d[1] * w, z + d[2] * w);
      qm.set(i, blend(mats.get(hit.i), w));
    }
    turnMesh(G, qm, v);
  }
  // the pulmonary valve: the same field, without the branches
  const pvm = meshes.PulmonaryValve;
  if (pvm) {
    const G = pvm.geometry, Q = G.attributes.position, qm = new Map();
    for (let i = 0; i < Q.count; i++) {
      p.fromBufferAttribute(Q, i);
      const m = new THREE.Matrix3();
      F.move(p, m, false);
      Q.setXYZ(i, p.x, p.y, p.z); qm.set(i, m);
    }
    turnMesh(G, qm, v);
  }
  return F;
}

// The PA's wall has two holes, each lined by a lip of triangles that joins the wall's outer and inner
// surfaces, so a plane through a lip joins the two outlines of the section into one:
//   a 2 cm opening at the tip of a short cone in the roof of the bifurcation. Its wall draws in toward the
//     lip's centre, by a weight that falls off with distance from the lip along the mesh (out to geo cm);
//     points across the wall from each other move by the same share, so the layers keep their order;
//   a 6 mm gap in the inner surface beside it, where that surface meets the outer one: its lip goes to
//     one point, the centre of its outer-surface vertices.
// Each lip ends at one point and shares one motion. The branches' cut ends (near STUB_ENDS) stay open.
const STUB_ENDS = [[-3.82, 5.97, -2.05], [5.58, 6.43, -2.29]];
function closeHoles(g, reg, geo = 2.0) {
  const P = g.attributes.position, col = g.attributes.color, I0 = g.index.array;
  const inner = (i) => col.getY(i) > 0.5;
  // the PA's triangles
  const tri = [];
  for (let t = 0; t < I0.length; t += 3) if (reg[I0[t]] === 6 && reg[I0[t + 1]] === 6 && reg[I0[t + 2]] === 6) tri.push(I0[t], I0[t + 1], I0[t + 2]);
  const I = Int32Array.from(tri);
  // lip triangles, grouped into holes by shared vertices
  const up = new Map();
  const find = (a) => { while (up.get(a) !== a) { up.set(a, up.get(up.get(a))); a = up.get(a); } return a; };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const k = inner(a) + inner(b) + inner(c);
    if (k === 0 || k === 3) continue;
    for (const v of [a, b, c]) if (!up.has(v)) up.set(v, v);
    up.set(find(b), find(a)); up.set(find(c), find(a));
  }
  const groups = new Map();
  for (const v of up.keys()) { const r = find(v); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(v); }
  const at = (v) => new THREE.Vector3().fromBufferAttribute(P, v);
  const moved = new Set(), lips = [];
  let adj = null;
  // the small hole first, then the cone
  for (const V of [...groups.values()].sort((a, b) => a.length - b.length)) {
    const c = new THREE.Vector3();
    for (const v of V) c.add(at(v));
    c.divideScalar(V.length);
    if (STUB_ENDS.some((s) => c.distanceTo(V3(s)) < 1)) continue;
    lips.push(V);
    if (Math.max(...V.map((v) => at(v).distanceTo(c))) <= 0.6) {
      // the gap: its lip goes to the centre of the lip's outer-surface vertices
      const o = new THREE.Vector3(); let k = 0;
      for (const v of V) if (!inner(v)) { o.add(at(v)); k++; }
      if (k) o.divideScalar(k); else o.copy(c);
      for (const v of V) { P.setXYZ(v, o.x, o.y, o.z); moved.add(v); }
      continue;
    }
    // the cone: distance from the lip along the PA's edges, out to geo cm
    if (!adj) {
      // neighbours along the PA's edges, packed: vertex v's run nb[off[v] .. off[v + 1])
      const n = P.count, deg = new Int32Array(n + 1);
      for (let t = 0; t < I.length; t++) deg[I[t]] += 2;
      const off = new Int32Array(n + 1);
      for (let v = 0; v < n; v++) off[v + 1] = off[v] + deg[v];
      const nb = new Int32Array(off[n]), fill = off.slice(0, n);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], cc = I[t + 2];
        nb[fill[a]++] = b; nb[fill[a]++] = cc; nb[fill[b]++] = a; nb[fill[b]++] = cc; nb[fill[cc]++] = a; nb[fill[cc]++] = b;
      }
      adj = { off, nb };
    }
    // Dijkstra from the lip: dist per vertex (Infinity unreached), a binary heap of (distance, vertex)
    const X = P.array, n = P.count, dist = new Float64Array(n).fill(Infinity), reached = [];
    const hk = [], hv = [];
    const push = (d, v) => {
      let i = hk.length; hk.push(d); hv.push(v);
      while (i > 0) { const j = (i - 1) >> 1; if (hk[j] <= hk[i]) break; [hk[i], hk[j]] = [hk[j], hk[i]]; [hv[i], hv[j]] = [hv[j], hv[i]]; i = j; }
    };
    const pop = () => {
      const d = hk[0], v = hv[0], ld = hk.pop(), lv = hv.pop();
      if (hk.length) {
        hk[0] = ld; hv[0] = lv; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < hk.length && hk[l] < hk[m]) m = l;
          if (r < hk.length && hk[r] < hk[m]) m = r;
          if (m === i) break;
          [hk[i], hk[m]] = [hk[m], hk[i]]; [hv[i], hv[m]] = [hv[m], hv[i]]; i = m;
        }
      }
      return [d, v];
    };
    for (const v of V) { dist[v] = 0; reached.push(v); push(0, v); }
    while (hk.length) {
      const [d0, v] = pop();
      if (d0 > dist[v]) continue;
      for (let k = adj.off[v]; k < adj.off[v + 1]; k++) {
        const w = adj.nb[k], nd = d0 + Math.hypot(X[3 * w] - X[3 * v], X[3 * w + 1] - X[3 * v + 1], X[3 * w + 2] - X[3 * v + 2]);
        if (nd < geo && nd < dist[w]) { if (dist[w] === Infinity) reached.push(w); dist[w] = nd; push(nd, w); }
      }
    }
    for (const v of reached) {
      const w = smooth(1 - dist[v] / geo);
      P.setXYZ(v, X[3 * v] + (c.x - X[3 * v]) * w, X[3 * v + 1] + (c.y - X[3 * v + 1]) * w, X[3 * v + 2] + (c.z - X[3 * v + 2]) * w);
      moved.add(v);
    }
  }
  if (!moved.size) return;
  // a lip moves as one point: its vertices share the mean of their morph displacements
  for (const T of g.morphAttributes.position || []) {
    for (const V of lips) {
      const m = [0, 0, 0];
      for (const v of V) { m[0] += T.getX(v); m[1] += T.getY(v); m[2] += T.getZ(v); }
      for (const v of V) T.setXYZ(v, m[0] / V.length, m[1] / V.length, m[2] / V.length);
    }
  }
  // normals of the moved wall, from its new faces
  const N = g.attributes.normal;
  if (N) {
    const X = P.array, flag = new Uint8Array(P.count), acc = new Float64Array(3 * P.count);
    for (const v of moved) flag[v] = 1;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      if (!flag[a] && !flag[b] && !flag[c]) continue;
      const ux = X[3 * b] - X[3 * a], uy = X[3 * b + 1] - X[3 * a + 1], uz = X[3 * b + 2] - X[3 * a + 2];
      const vx = X[3 * c] - X[3 * a], vy = X[3 * c + 1] - X[3 * a + 1], vz = X[3 * c + 2] - X[3 * a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) if (flag[v]) { acc[3 * v] += nx; acc[3 * v + 1] += ny; acc[3 * v + 2] += nz; }
    }
    for (const v of moved) {
      const x = acc[3 * v], y = acc[3 * v + 1], z = acc[3 * v + 2], l = Math.hypot(x, y, z);
      if (l > 1e-6) N.setXYZ(v, x / l, y / l, z / l);
    }
    N.needsUpdate = true;
  }
}

/** After positions moved: turn normals and morph displacements at the moved vertices. */
function turnMesh(G, mats, v) {
  G.attributes.position.needsUpdate = true;
  const N = G.attributes.normal;
  const MP = G.morphAttributes.position || [], MN = G.morphAttributes.normal || [];
  for (const [i, m] of mats) {
    if (N) { turn(N, i, m, v); v.fromBufferAttribute(N, i).normalize(); N.setXYZ(i, v.x, v.y, v.z); }
    for (const T of MP) turn(T, i, m, v);
    for (const T of MN) turn(T, i, m, v);
  }
  if (N) N.needsUpdate = true;
  for (const T of MP) T.needsUpdate = true;
  for (const T of MN) T.needsUpdate = true;
  // the bounds stay as loaded: they come from the file with the morph displacements, still enclose
  // the moved PA, and nothing culls the heart's meshes
}
