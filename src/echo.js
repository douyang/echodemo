// Echo views as live cross-sections of the heart mesh. The same code draws the
// on-screen view beside the 3D heart (chapter 07) and offscreen frames for other chapters.
import * as THREE from '../vendor/three.bundle.min.js';
import { tokens, MONO, SANS } from './sketch.js';
import { VIEWS, VESSELS } from './views.js';
import { leafletWeights, phenoWeights } from './gl/heart.js';
import { ecg as ecgStrip } from './scope.js';
import { bmode, DB } from './bmode.js';
import { reducedMotion } from './state.js';
import { ABD, buildAbdomen, beneath } from './abdomen.js';
import { Liver3D } from './gl/liver3d.js';
import { pencilProbe, placeProbe } from './gl/probe3d.js';

export { VIEWS };

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SLICE = 0.25;   // half the thickness of the imaging slice, cm: chordae inside it show
const BODY = { left: V3(1, 0, 0), sup: V3(0, 1, 0), ant: V3(0, 0, 1) };   // world axes of the model
const VP = (k) => V3(...VESSELS[k]);
// the long axis of the pulmonic valve, toward the PA (the principal axes of the valve mesh);
// the trunk leaves the valve along it
const PV_AXIS = V3(0.348, 0.87, -0.348).normalize();

/** Transducer origin O, beam axis d, screen-right r, plane normal n (world, cm). */
export function viewGeometry(anat, key) {
  const spec = VIEWS[key];
  if (!spec || !spec.plane) return null;
  const Z = anat.axis.clone(), X = anat.lateral.clone(), Y = anat.anterior.clone();
  const apex = anat.point('apex_epi', 0, 0), mv = anat.point('mv', 0, 0), tv = anat.point('tv', 0, 0);
  const av = anat.point('av', 0, 0), eq = anat.point('lv_eq', 0, 0), pv = anat.point('pv', 0, 0);
  const la = anat.point('la_c', 0, 0), ra = anat.point('ra_c', 0, 0);
  const perp = (v, ax) => v.clone().addScaledVector(ax, -v.dot(ax)).normalize();
  const onPlane = (P, Q, n0) => P.clone().addScaledVector(n0, -P.clone().sub(Q).dot(n0));   // P moved onto the plane through Q
  const lvc = eq.clone().lerp(mv, 0.25);
  const aims = { lvc, la, mv, av };
  let O, d, r;
  const apical = (target, right) => {
    O = apex.clone().addScaledVector(Z, -1.6);
    d = target.clone().sub(O).normalize();
    r = perp(right, d);
  };
  const plaxBase = () => {
    // a little septal of the aortic valve center, so the plane crosses the RV outflow in front of the septum
    const th = THREE.MathUtils.degToRad(132);
    const u = X.clone().multiplyScalar(Math.cos(th)).addScaledVector(Y, Math.sin(th)).normalize();
    return { u, level: eq.clone().lerp(mv, 0.55) };
  };
  // subcostal: the probe below the xiphoid; each plane holds the beam from there, and the
  // probe is set back along the beam to the skin, 1.6 cm of abdominal wall outside the liver
  const SUB = V3(-1.0, -9.8, 12.2);
  const subcostal = (target, n0, marker) => {
    const Op = SUB.clone().addScaledVector(n0, -SUB.clone().sub(target).dot(n0));
    d = target.clone().sub(Op).normalize();
    r = perp(marker, d);
    O = beneath(target, d, 1.6);
  };
  switch (spec.plane) {
    case 'a4c': apical(spec.aim ? aims[spec.aim] : mv.clone().lerp(tv, 0.45), mv.clone().sub(tv)); break;
    // the four-chamber plane tilted anteriorly 10 degrees (ASE 2019, Table 2, row 2.17): the beam
    // aims 85% of the way from the four-chamber target to the aortic valve, so the LVOT, the valve
    // and the root lie in the plane, between the RA and the LA (at 55% the plane missed the valve
    // by 1 cm and showed four chambers)
    case 'a5c': apical(mv.clone().lerp(tv, 0.4).lerp(av, 0.85), mv.clone().sub(tv)); break;
    case 'a3c': apical(spec.aim ? aims[spec.aim] : mv.clone().lerp(av, 0.5), av.clone().sub(mv)); break;
    case 'a2c': {
      // the third apical plane: about 60 degrees from both the four-chamber and the long-axis
      // planes (ASE: rotate about 60 degrees counterclockwise from A4C), anterior wall on screen-right
      const flat = (v) => v.clone().addScaledVector(Z, -v.dot(Z)).normalize();
      const u4 = flat(mv.clone().sub(tv)), u3 = flat(av.clone().sub(mv));
      if (u4.dot(u3) < 0) u3.negate();
      const right = new THREE.Vector3().crossVectors(Z, u4.add(u3)).normalize();
      if (right.dot(Y) < 0) right.negate();
      apical(spec.aim ? aims[spec.aim] : mv.clone(), right);
      break;
    }
    case 'a4c_rv': {
      // the probe slides toward the RV apex; the tricuspid valve sits in the middle of the sector
      O = apex.clone().addScaledVector(Z, -1.4).addScaledVector(X, -2.6);
      d = tv.clone().lerp(mv, 0.15).sub(O).normalize();
      r = perp(mv.clone().sub(tv), d);
      break;
    }
    case 'plax': {
      const { u, level } = plaxBase();
      O = level.clone().addScaledVector(u, 8.2);
      d = u.clone().negate().addScaledVector(Z, 0.12).normalize();
      r = perp(Z, d);
      break;
    }
    case 'plax_asc': {
      // one interspace higher, the beam on the aortic root: the ascending aorta runs to screen-right
      const { u, level } = plaxBase();
      const asc = av.clone().addScaledVector(anat.aorticRoot, 2.6);
      O = level.clone().addScaledVector(u, 8.2).addScaledVector(BODY.sup, 2.2);
      d = asc.clone().lerp(av, 0.4).sub(O).normalize();
      r = perp(anat.aorticRoot, d);
      break;
    }
    case 'rv_in': {
      // tilted toward the right hip: RV in front, tricuspid valve, RA behind
      const rvb = eq.clone().addScaledVector(X, -4.4).addScaledVector(Z, 0.4);
      const n0 = new THREE.Vector3().subVectors(tv, rvb).cross(new THREE.Vector3().subVectors(ra, rvb)).normalize();
      const { u } = plaxBase();
      const d0 = perp(u.clone().negate(), n0);           // the parasternal beam, turned into this plane
      const aim = tv.clone().lerp(ra, 0.25);
      O = aim.clone().addScaledVector(d0, -9.0);
      d = perp(aim.clone().sub(O), n0);
      r = perp(perp(ra.clone().sub(rvb), n0), d);
      break;
    }
    case 'rv_out': {
      // tilted toward the left shoulder: RVOT, pulmonic valve and main PA along the plane. The
      // plane runs along the valve's own axis, turned about it to hold the bifurcation, so the
      // trunk runs in the plane from the valve to the bifurcation, and 3 mm to one side of the
      // axis: there it crosses two cusps and the line where they meet, so the shut valve is
      // two thin cusps meeting in the middle (through the axis it would graze a commissure).
      // The cusps hinge on the walls and open along them; the aortic root lies behind.
      const bif = VP('paBif');
      const e = perp(bif.clone().sub(pv), PV_AXIS);
      const n0 = PV_AXIS.clone().cross(e).normalize();
      O = pv.clone().addScaledVector(e, -7.8).addScaledVector(n0, 0.3);
      d = perp(pv.clone().lerp(bif, 0.3).sub(O), n0);
      r = perp(perp(bif.clone().sub(pv), n0), d);
      break;
    }
    case 'psax_av': case 'psax_avz': case 'psax_tv': case 'psax_pa': case 'psax_cor': {
      // The great-vessel levels (ASE 2019, Table 2, rows 2.7-2.10). The probe lies in front of the
      // aortic root and a little to its left, at the left sternal border; the beam runs back,
      // a little to the right and down. Screen-right is the patient's left. Each level is a
      // plane through the aortic root, turned from square to it where the level needs.
      const n0 = anat.aorticRoot.clone();
      const e1 = perp(BODY.left, n0), e2 = n0.clone().cross(e1);
      // n0 turned by tilt degrees toward direction az round the root (az 180: the patient's right)
      const turned = (tilt, az) => {
        const t = THREE.MathUtils.degToRad(tilt), a = THREE.MathUtils.degToRad(az);
        return n0.clone().multiplyScalar(Math.cos(t)).addScaledVector(e1, Math.sin(t) * Math.cos(a)).addScaledVector(e2, Math.sin(t) * Math.sin(a)).normalize();
      };
      const probe = (C, n, dist, aim = V3(-0.45, -0.15, -1)) => {
        d = perp(aim, n);
        r = perp(perp(BODY.left, n), d);
        O = C.clone().addScaledVector(d, -dist);
      };
      // the shut cusps meet 0.6 to 1.3 cm above the valve's centre point, highest at the wall
      if (spec.plane === 'psax_avz') {
        // zoomed on the valve, square to the root through the free edges: the shut cusps meet
        // in a Y and each cusp shows whole (the sonographer turns the probe until the valve is round)
        probe(av.clone().addScaledVector(n0, 0.7), n0, 6.2);
      } else if (spec.plane === 'psax_pa') {
        // tilted up from the valve: the aorta above its valve in cross-section, the RVOT, the
        // pulmonic valve, the trunk down the right of the sector, the bifurcation, the RPA behind
        // the aorta and the LPA. The plane passes 2 cm up the root and leans 20 degrees from
        // square to it, toward the front and a little to the patient's left
        probe(av.clone().addScaledVector(n0, 2.0), turned(20, 300), 6.0, V3(-0.1, -0.1, -1));
      } else if (spec.plane === 'psax_cor') {
        // through both coronary origins, as square to the aortic root as that allows; the
        // probe moves onto this plane from the valve-level position
        const Lm = VP('lmca'), Rc = VP('rca');
        const u = Lm.clone().sub(Rc).normalize();
        const n1 = n0.clone().addScaledVector(u, -n0.dot(u)).normalize();
        const C = Lm.clone().lerp(Rc, 0.5);
        probe(av.clone().addScaledVector(n0, 0.62), turned(28, 170), 6.2);
        O = onPlane(O, C, n1);
        d = C.clone().sub(O).normalize();
        r = perp(perp(BODY.left, n1), d);
      } else if (spec.plane === 'psax_tv') {
        // the tricuspid valve: the plane leans 30 degrees toward the patient's right and 2 back;
        // the probe comes onto it from where it lies for a plane leaning 28 degrees toward the
        // right and 10 back, and the sector turns onto the valve
        probe(av.clone().addScaledVector(n0, 0.62), turned(28, 170), 6.2);
        const n1 = turned(30, 178);
        const P0 = onPlane(O, av.clone().addScaledVector(n0, 0.55), n1);
        const t = onPlane(tv, av.clone().addScaledVector(n0, 0.55), n1);
        O = P0;
        d = t.clone().sub(O).normalize();
        r = perp(perp(BODY.left, n1), d);
      } else {
        // the aortic valve level (ASE 2019, Table 2, row 2.8): leaning 30 degrees toward the
        // patient's right and 20 degrees back, through a point 4.5 mm above the valve's centre.
        // The shut cusps meet 6 to 13 mm above it, so the leaning plane still crosses them where
        // they meet. Square to the root the plane would pass above this model's left atrium;
        // leaning, it cuts the atrium about 2 mm behind the root, and the tricuspid and pulmonic
        // valves beside the aortic valve: AV, LA, RA, TV, RVOT, PV and the atrial septum. The
        // sector turns 10 degrees in the plane toward the patient's left, so the main PA runs
        // round the aorta down the right of the sector
        const n = turned(30, 160);
        probe(av.clone().addScaledVector(n0, 0.45), n, 6.2, V3(-0.45, -0.15, -1).applyAxisAngle(n, THREE.MathUtils.degToRad(-10)));
      }
      break;
    }
    case 'psax': {
      // The LV levels (ASE 2019, Table 2, rows 2.11-2.13). The probe lies at the left sternal
      // border, 138 degrees round the LV's axis from its lateral wall toward the front, level with
      // a point a fifth of the way from the LV's equator to the mitral valve. From there the beam
      // tilts 9 degrees up to the mitral valve (the long axis turned 90 degrees clockwise lies 2
      // degrees from that plane) and 9 degrees down to the papillary muscles; at both levels the RV
      // lies at about 11 o'clock from the LV, as in the reference images. For the apex (slide) the
      // probe moves down the chest to a level below the end of the RV, square to the axis, so the
      // LV shows alone. level: along the axis from the LV's equator, in units of the distance from
      // there to the mitral valve's centre.
      const th = THREE.MathUtils.degToRad(138);
      const u = X.clone().multiplyScalar(Math.cos(th)).addScaledVector(Y, Math.sin(th)).normalize();
      const L = mv.clone().sub(eq).dot(Z), at = (h) => eq.clone().addScaledVector(Z, h * L);
      const level = spec.level ?? -0.24;
      if (spec.slide) {
        O = at(level).addScaledVector(u, 7.6);
        d = perp(u.clone().negate(), Z);
      } else {
        O = at(0.2).addScaledVector(u, 7.6);
        d = at(level).sub(O).normalize();
      }
      // screen-right square to the beam and to the axis, toward the patient's left
      r = new THREE.Vector3().crossVectors(Z, d).normalize();
      if (r.dot(X) < 0) r.negate();
      break;
    }
    case 'sc4c': {
      // from below the RV, through the RV free wall first. In this model the four-chamber
      // plane passes above the liver, so the liver is the near-field layer (views.js: liver)
      const r4 = perp(mv.clone().sub(tv), Z);
      const n4 = Z.clone().cross(r4).normalize();
      const center = eq.clone().lerp(mv, 0.4);
      O = center.clone().addScaledVector(r4, -12.5).addScaledVector(Z, -3.6);
      d = center.clone().sub(O);
      d.addScaledVector(n4, -d.dot(n4)).normalize();
      r = perp(Z.clone().negate(), d);
      break;
    }
    case 'sc_ivc': case 'sc_aorta': {
      // long axis of the IVC as it runs through the liver into the right atrium, the head on
      // screen-right; a small angle to the patient's left finds the aorta behind the liver
      const P = spec.plane === 'sc_ivc' ? ABD.ivc.pts : ABD.aorta.pts;
      const A = V3(...P[0]), B = V3(...P[2]);
      const probe = SUB.clone().addScaledVector(BODY.left, spec.plane === 'sc_ivc' ? -1.2 : 0.6);
      const n0 = new THREE.Vector3().crossVectors(A.clone().sub(probe), B.clone().sub(probe)).normalize();
      subcostal(spec.plane === 'sc_ivc' ? A.clone().lerp(B, 0.2).lerp(ra, 0.12) : A.clone().lerp(B, 0.62), n0, BODY.sup);
      break;
    }
    case 'ssn': case 'ssn_sax': {
      // plane of the arch: ascending, top, descending
      const A = VP('ascMid'), T = VP('archTop'), D = VP('desc');
      const n0 = new THREE.Vector3().subVectors(T, A).cross(new THREE.Vector3().subVectors(D, A)).normalize();
      const mid = A.clone().add(T).add(D).multiplyScalar(1 / 3);
      O = T.clone().addScaledVector(BODY.sup, 4.2).addScaledVector(BODY.ant, 3.0);
      O.addScaledVector(n0, -O.clone().sub(mid).dot(n0));
      d = perp(mid.clone().sub(O), n0);
      r = perp(perp(D.clone().sub(A), n0), d);
      if (spec.plane === 'ssn_sax') {
        // rotated 90 degrees clockwise on the same beam: the arch in cross-section, the right
        // PA below it in its length, the left atrium below that; patient's left on screen-right
        r = n0.clone();
        if (r.dot(BODY.left) < 0) r.negate();
        r = perp(r, d);
      }
      break;
    }
    default: return null;
  }
  const n = new THREE.Vector3().crossVectors(r, d).normalize();
  return { O, d, r, n };
}

// ----------------------------------------------------------------------------
// CPU morph and plane section
// ----------------------------------------------------------------------------
class MeshData {
  constructor(mesh) {
    this.mesh = mesh;
    const g = mesh.geometry;
    this.base = g.attributes.position.array;
    this.count = g.attributes.position.count;
    this.index = g.index ? g.index.array : null;
    this.dict = mesh.morphTargetDictionary || {};
    this.pos = new Float32Array(this.count * 3);
    this.sd = new Float32Array(this.count);
    // vertices from here on are the centres of a tube's end caps (abdomen.js)
    this.capFrom = mesh.userData && mesh.userData.capFrom !== undefined ? mesh.userData.capFrom : Infinity;
    mesh.updateMatrixWorld(true);
    this.matrix = mesh.matrixWorld.clone();
    this.identity = this.matrix.equals(new THREE.Matrix4());
    // the rest shape in world space: where each section point sat at end-diastole
    this.rest = new Float32Array(this.count * 3);
    this.setRest({});
  }
  /** The shape targets (a disease heart adds its own after loading). */
  get targets() { return (this.mesh.geometry.morphAttributes.position || []).map((a) => a.array); }
  /** The rest shape: the base plus the targets w (the end-diastole of the heart shown). */
  setRest(w) {
    this.morph(w, false);
    this.rest.set(this.pos);
  }
  morph(w, scaled = true) {
    const { base, pos, targets, dict } = this;
    pos.set(base);
    for (const [name, value] of Object.entries(w)) {
      const i = dict[name];
      if (i === undefined || !value) continue;
      const t = targets[i], sc = scaled && this.scale && this.scale[name];
      // a per-vertex scale on a target: regional wall motion on the systole shape
      if (sc) for (let k = 0, v = 0; k < pos.length; k += 3, v++) { const f = value * sc[v]; pos[k] += f * t[k]; pos[k + 1] += f * t[k + 1]; pos[k + 2] += f * t[k + 2]; }
      else for (let k = 0; k < pos.length; k++) pos[k] += value * t[k];
    }
    if (!this.identity) {
      const e = this.matrix.elements;
      for (let k = 0; k < pos.length; k += 3) {
        const x = pos[k], y = pos[k + 1], z = pos[k + 2];
        pos[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
    }
  }
  /**
   * Closed and open polylines in plane coordinates [u (right), v (depth)]. withRef: each loop
   * also carries `ref`, the same material points in the rest shape, projected on the plane.
   */
  section(g, withRef = false) {
    const { pos, sd, index, count, rest } = this;
    const nx = g.n.x, ny = g.n.y, nz = g.n.z;
    const k0 = nx * g.O.x + ny * g.O.y + nz * g.O.z;
    for (let i = 0; i < count; i++) {
      const s = nx * pos[3 * i] + ny * pos[3 * i + 1] + nz * pos[3 * i + 2] - k0;
      sd[i] = s === 0 ? 1e-6 : s;
    }
    const pts = new Map(), refs = new Map();
    const adj = new Map();
    const rx = g.r.x, ry = g.r.y, rz = g.r.z, dx = g.d.x, dy = g.d.y, dz = g.d.z;
    const ox = g.O.x, oy = g.O.y, oz = g.O.z;
    const point = (a, b) => {
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      if (!pts.has(key)) {
        const t = sd[a] / (sd[a] - sd[b]);
        const x = pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t - ox;
        const y = pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t - oy;
        const z = pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t - oz;
        const P = [x * rx + y * ry + z * rz, x * dx + y * dy + z * dz];
        if (a >= this.capFrom || b >= this.capFrom) P.push(1);   // on the end cap of a tube
        pts.set(key, P);
        if (withRef) {
          const X = rest[3 * a] + (rest[3 * b] - rest[3 * a]) * t - ox;
          const Y = rest[3 * a + 1] + (rest[3 * b + 1] - rest[3 * a + 1]) * t - oy;
          const Z = rest[3 * a + 2] + (rest[3 * b + 2] - rest[3 * a + 2]) * t - oz;
          refs.set(key, [X * rx + Y * ry + Z * rz, X * dx + Y * dy + Z * dz]);
        }
      }
      return key;
    };
    const link = (p, q) => {
      if (!adj.has(p)) adj.set(p, []);
      if (!adj.has(q)) adj.set(q, []);
      adj.get(p).push(q);
      adj.get(q).push(p);
    };
    const tri = index ? index.length / 3 : count / 3;
    for (let f = 0; f < tri; f++) {
      const a = index ? index[3 * f] : 3 * f, b = index ? index[3 * f + 1] : 3 * f + 1, c = index ? index[3 * f + 2] : 3 * f + 2;
      const sa = sd[a] > 0, sb = sd[b] > 0, sc = sd[c] > 0;
      if (sa === sb && sb === sc) continue;
      const e = [];
      if (sa !== sb) e.push(point(a, b));
      if (sb !== sc) e.push(point(b, c));
      if (sc !== sa) e.push(point(c, a));
      if (e.length === 2) link(e[0], e[1]);
    }
    const loops = [];
    const used = new Set();
    for (const start of adj.keys()) {
      if (used.has(start)) continue;
      const line = [], rline = [];
      let cur = start, prev = -1;
      let closed = false;
      for (let guard = 0; guard < 200000; guard++) {
        used.add(cur);
        line.push(pts.get(cur));
        if (withRef) rline.push(refs.get(cur));
        const nb = adj.get(cur);
        let next = -1;
        for (const q of nb) if (q !== prev && !used.has(q)) { next = q; break; }
        if (next === -1) { closed = nb.includes(start) && line.length > 2; break; }
        prev = cur;
        cur = next;
      }
      if (line.length > 1) loops.push({ pts: line, closed, ref: withRef ? rline : null });
    }
    return loops;
  }
  /** Triangles within `half` cm of the plane, in plane coordinates. */
  slab(g, half) {
    const { pos, index, count } = this;
    const nx = g.n.x, ny = g.n.y, nz = g.n.z;
    const rx = g.r.x, ry = g.r.y, rz = g.r.z, dx = g.d.x, dy = g.d.y, dz = g.d.z;
    const ox = g.O.x, oy = g.O.y, oz = g.O.z;
    const near = new Uint8Array(count);
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = pos[3 * i] - ox, y = pos[3 * i + 1] - oy, z = pos[3 * i + 2] - oz;
      if (Math.abs(nx * x + ny * y + nz * z) >= half) continue;
      near[i] = 1;
      uv[2 * i] = x * rx + y * ry + z * rz;
      uv[2 * i + 1] = x * dx + y * dy + z * dz;
    }
    const out = [];
    const tri = index ? index.length / 3 : count / 3;
    for (let f = 0; f < tri; f++) {
      const a = index ? index[3 * f] : 3 * f, b = index ? index[3 * f + 1] : 3 * f + 1, c = index ? index[3 * f + 2] : 3 * f + 2;
      if (near[a] && near[b] && near[c]) out.push(uv[2 * a], uv[2 * a + 1], uv[2 * b], uv[2 * b + 1], uv[2 * c], uv[2 * c + 1]);
    }
    return out;
  }
}

/**
 * Directions of the three aortic cusps from the root's axis, named by where they lie: the
 * right coronary cusp in front, the non-coronary cusp the more rightward of the other two, the
 * left coronary cusp the last. Each cusp's belly is its lowest point round the root.
 */
function cuspDirs(model) {
  const mesh = model.heart.meshes.AorticValve;
  if (!mesh) return null;
  const A = model.anat, n0 = A.aorticRoot.clone(), av = A.point('av', 0, 0);
  const e1 = BODY.left.clone().addScaledVector(n0, -n0.x).normalize(), e2 = n0.clone().cross(e1);
  const p = mesh.geometry.attributes.position.array;
  const low = new Float32Array(72).fill(Infinity);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] - av.x, y = p[i + 1] - av.y, z = p[i + 2] - av.z;
    const a = Math.atan2(x * e2.x + y * e2.y + z * e2.z, x * e1.x + y * e1.y + z * e1.z);
    const b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 72) % 72;
    low[b] = Math.min(low[b], x * n0.x + y * n0.y + z * n0.z);
  }
  let b0 = 0;
  const sum = (b) => low[b % 72] + low[(b + 24) % 72] + low[(b + 48) % 72];
  for (let b = 1; b < 24; b++) if (sum(b) < sum(b0)) b0 = b;
  const dirs = [0, 1, 2].map((k) => {
    const a = ((b0 + 0.5 + 24 * k) / 72) * 2 * Math.PI - Math.PI;
    return e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
  });
  const R = dirs.slice().sort((u, v) => v.dot(BODY.ant) - u.dot(BODY.ant))[0];
  const [N, L] = dirs.filter((u) => u !== R).sort((u, v) => u.dot(BODY.left) - v.dot(BODY.left));
  return { rcc: R, ncc: N, lcc: L };
}

// chambers and vessels may sit a little further from the plane than walls and valves and still show
const ECHO_ONLY = new Set(['liver', 'hv', 'abdao', 'celiac', 'sma', 'ivcl']);
// full names for the tags on the cross-section
const FULL = {
  LV: 'Left ventricle', RV: 'Right ventricle', LA: 'Left atrium', RA: 'Right atrium', IVS: 'Ventricular septum', IAS: 'Atrial septum',
  MV: 'Mitral valve', TV: 'Tricuspid valve', AV: 'Aortic valve', PV: 'Pulmonic valve', Ao: 'Aorta', LVOT: 'LV outflow tract', RVOT: 'RV outflow tract',
  PA: 'Pulmonary artery', 'main PA': 'Main pulmonary artery', RPA: 'Right pulmonary artery', LPA: 'Left pulmonary artery', IVC: 'Inferior vena cava',
  SVC: 'Superior vena cava', 'desc Ao': 'Descending aorta', 'ascending Ao': 'Ascending aorta', 'descending Ao': 'Descending aorta', arch: 'Aortic arch',
  LMCA: 'Left main coronary artery', RCA: 'Right coronary artery', 'Ao root': 'Aortic root', RCC: 'Right coronary cusp', LCC: 'Left coronary cusp', NCC: 'Non-coronary cusp', 'R+L': 'Fused right and left cusps', SMA: 'Superior mesenteric artery', 'abdominal Ao': 'Abdominal aorta',
};
const ROOMY = new Set(['la', 'ra', 'lv', 'rv', 'rvant', 'rvot', 'mpa', 'ao', 'asc', 'arch', 'desc', 'ivc', 'ivcl', 'rpa', 'lpa', 'svc', 'abdao']);

export class EchoView {
  /**
   * model: { heart, anat, doc } from loadModel(); stage: the Stage3D (for the fan overlay) or null.
   * opts.offscreen: draw frames of opts.width x opts.height with no header, ECG or labels.
   */
  constructor(model, canvas, opts = {}) {
    this.model = model;
    this.stage = opts.stage || null;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.offscreen = !!opts.offscreen;
    this.view = 'plax';
    this.calipers = false;
    this.labels = !this.offscreen;
    this.measure = {};
    this.geo = model.sizes;
    this.pv = -1;         // the version of the heart it last took (model3d.js); the first frame takes it
    this.noSys = false;   // true: the heart's own systolic change is off (chapter 09 sets the motion)
    this.own = null;      // a heart of this view's own (setBurden), in place of the page's
    this.ownAnat = null;
    // the plane on screen: cur (O, d, r, n), easing toward the view's plane after a change
    this.cur = null;
    this.tr = null;
    this.section = false;
    const h = model.heart;
    this.myo = new MeshData(h.meshes.Myocardium);
    this.valves = ['MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve'].filter((n) => h.meshes[n]).map((n) => new MeshData(h.meshes[n]));
    this.chords = ['MitralChordae', 'TricuspidChordae'].filter((n) => h.meshes[n]).map((n) => new MeshData(h.meshes[n]));
    this.pap = h.meshes.Papillary ? new MeshData(h.meshes.Papillary) : null;
    this.peri = h.meshes.Pericardium ? new MeshData(h.meshes.Pericardium) : null;
    this.cor = h.meshes.Coronaries ? new MeshData(h.meshes.Coronaries) : null;
    // below the heart: liver, veins, abdominal aorta and spine (they do not move with the beat)
    this.abd = {};
    for (const [k, m] of Object.entries(buildAbdomen(h))) { const md = new MeshData(m); md.morph({}); this.abd[k] = md; }
    this.geoms = {};
    for (const k of Object.keys(VIEWS)) { const g = viewGeometry(model.anat, k); if (g) this.geoms[k] = g; }
    if (this.offscreen) {
      this.setSize(opts.width || 300, opts.height || 250);
      return;
    }
    if (this.stage) this._buildOverlay();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  /**
   * Regional wall motion: a scale on each myocardial vertex's systolic motion, or null; and one
   * for the pericardium, so that it moves with the wall under it.
   */
  setRegional(scale, periScale = null) {
    this.myo.scale = scale ? { systole: scale } : null;
    if (this.peri) this.peri.scale = periScale ? { systole: periScale } : null;
  }

  /** The heart this view shows: its own (setBurden), or the page's (model3d.js). */
  get heart() { return this.own || this.model.pheno; }
  /** The landmarks of that heart. */
  get anat() { return this.ownAnat || this.model.anat; }

  /**
   * Show the model's own amyloid heart at burden a (0 normal .. 1 the amyloid corner), whatever
   * heart the page shows; null: the page's heart again. Chapter 17 sets it.
   */
  setBurden(a) {
    if (a === null || a === undefined) {
      this.own = null;
      this.ownAnat = null;
      this.pv = -2;
      return;
    }
    if (this.own && this.own.a === a) return;
    this.ownV = (this.ownV || 0) + 1;
    // a version the page's hearts never take, so the next frame takes this heart
    this.own = { key: 'amyloid', a, mesh: null, version: -1000 - this.ownV };
    const anat = Object.create(this.model.anat.normal());
    anat.pheno = { a, landmark: null };
    this.ownAnat = anat;
    const c = this.model.doc.corners;
    const at = (k, ph = 'ed') => c[`normal_${ph}`].measurements[k] + (c[`amyloid_${ph}`].measurements[k] - c[`normal_${ph}`].measurements[k]) * a;
    this.ownGeo = { ivs: at('ivs'), pw: at('pw'), lvid: at('lvid'), lvids: at('lvid', 'es'), effusion: at('peri_gap'), rvWall: at('rv_wall') };
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
  }

  _buildOverlay() {
    const s = this.stage;
    this.fanMat = new THREE.MeshBasicMaterial({ color: 0x22272b, transparent: true, opacity: 0.035, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.fanLineMat = new THREE.LineBasicMaterial({ color: 0x22272b, transparent: true, opacity: 0.6, depthTest: false });
    this.fan = new THREE.Mesh(new THREE.BufferGeometry(), this.fanMat);
    this.fanLine = new THREE.LineLoop(new THREE.BufferGeometry(), this.fanLineMat);
    // the transducer at the fan's apex, drawn in pencil with the heart (the stage's tools)
    const P = pencilProbe();
    this.probe = P.group;
    this.probeRoot = new THREE.Group();
    this.probeRoot.add(this.probe);
    s.scene.add(this.probeRoot);
    s.tools.push(...P.items);
    // one group, so a chapter that shares the stage can hide this fan (showOverlay)
    this.overlay = new THREE.Group();
    this.overlay.add(this.fan, this.fanLine);
    s.overlayScene.add(this.overlay);
    // the liver of the subcostal views, a layer of the stage's pencil over the heart
    this.liver3d = new Liver3D(this.model.heart, this.geoms.sc4c, VIEWS.sc4c);
    s.scene.add(this.liver3d.group);
  }

  /** Show or hide the fan, the probe and the liver (a chapter that shares the stage hides them). */
  showOverlay(on) {
    if (this.overlay) this.overlay.visible = on;
    if (this.probeRoot) this.probeRoot.visible = on;
    if (this.liver3d) {
      if (on) this.stage.layer = this.liver3d;
      else if (this.stage.layer === this.liver3d) this.stage.layer = null;
    }
  }

  /**
   * The liver for view key, fading over T ms: in a subcostal view, the liver the plane cuts
   * (IVC and aorta views), or the near-field layer of the four-chamber view; with the probe
   * and body, the whole liver in every subcostal view. None in the other windows.
   */
  _liverFor(key, T) {
    if (!this.liver3d) return;
    const v = VIEWS[key], sub = !!v && v.win === 'sub', four = sub && v.plane === 'sc4c';
    this.liver3d.fadeTo({ liver: sub && (this.bodyOn || !four) ? 1 : 0, layer: four && !this.bodyOn ? 1 : 0 }, T);
  }

  retheme() {
    if (!this.fanMat) return;
    const t = tokens();
    this.fanMat.color.setStyle(t.ink);
    this.fanLineMat.color.setStyle(t.ink);
    if (this.bodyKey) this.bodyKey.retheme(t);
  }

  /**
   * Probe and body (chapter 07): the whole heart from the front, head up, with the plane and
   * the probe, and the body key in a corner (gl/bodykey.js). Off: the cut, seen square to it.
   */
  async setBody(on) {
    this.bodyOn = !!on;
    if (!this.stage) return;
    if (on && !this.bodyKey) {
      const { BodyKey } = await import('./gl/bodykey.js');
      this.bodyKey = new BodyKey(this.model.heart.meshes.Myocardium, this.model.anat);
      this.bodyKey.retheme(tokens());
    }
    if (!!on !== this.bodyOn) return;   // switched again while the key loaded
    this.stage.inset = on ? this.bodyKey : null;
    this.cutOn = !on;
    if (on) this.stage.heart.setCut(null);
    const g = this.geoms[this.view];
    if (!g) return;
    const spec = this.specOf(this.view);
    this._place3d(this.g, spec);
    this._liverFor(this.view);
    if (on) {
      this._keySite();
      this.stage.opts.labeled = false;
      this.stage.view(new THREE.Vector3(-0.38, -0.2, -1).normalize(), BODY.sup.clone(), 3.0, this.stage.center.clone());
    } else this._aim(g, spec);
  }

  /** The body key's probe at this view's window, its beam toward the middle of the sector. */
  _keySite() {
    const g = this.geoms[this.view];
    if (!this.bodyKey || !g || !VIEWS[this.view]) return;
    const spec = this.specOf(this.view);
    this.bodyKey.setView(VIEWS[this.view].win, g.O.clone().addScaledVector(g.d, spec.depth * 0.45), g.r, spec);
  }

  /** The view's settings; a chapter may set its own depth and sector width (chapter 02). */
  specOf(key) {
    const base = key === 'free' ? this.freeSpec || {} : VIEWS[key] || {};
    const spec = { ...base, depth: this.depth ?? base.depth, angle: this.angle ?? base.angle };
    // a bicuspid valve (phenomesh.js): the right and left cusps are one, fused along a raphe
    const P = this.heart;
    if (P && P.key === 'bav' && spec.labels && spec.labels.some(([id]) => id === 'rcc')) {
      spec.labels = [...spec.labels.filter(([id]) => !['rcc', 'lcc', 'ncc'].includes(id)), ['rl', 'R+L'], ['raphe', 'raphe'], ['ncc', 'NCC']];
    }
    return spec;
  }

  /** The plane now on screen: the eased one during a change, else the view's own. */
  get g() {
    return this.cur || this.geoms[this.view] || null;
  }

  /**
   * Show a view. With animate (the default once a plane is on screen), the plane moves from
   * where it is to the new one: it turns along the shortest rotation while the point it
   * images slides across, the way a probe is tilted, rotated and slid, never from nothing.
   */
  setView(key, opts = {}) {
    const from = this.g;
    this.view = key;
    if (this.own && !this.geoms[key] && VIEWS[key]) { const g = viewGeometry(this.anat, key); if (g) this.geoms[key] = g; }
    const g1 = this.geoms[key] || null;
    const spec = this.specOf(key);
    this.zoomAt = null;
    if (g1 && spec.zoom && spec.zoom.at) {
      const q = this.toPlane(this.anchors(0)[spec.zoom.at], g1);
      this.zoomAt = [q[0], q[1]];
    } else if (g1 && spec.zoom && spec.zoom.uv) this.zoomAt = spec.zoom.uv;
    const animate = (opts.animate ?? !this.offscreen) && !reducedMotion && from && g1;
    if (animate) {
      const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(from.r, from.d, from.n));
      const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(g1.r, g1.d, g1.n));
      const depth = spec.depth;
      const c0 = from.O.clone().addScaledVector(from.d, depth * 0.5), c1 = g1.O.clone().addScaledVector(g1.d, depth * 0.5);
      const ang = q0.angleTo(q1), dist = c0.distanceTo(c1);
      if (ang < 1e-4 && dist < 1e-3) { this.tr = null; this.cur = null; }
      else {
        const T = opts.T ?? Math.min(1300, 380 + 650 * (ang / Math.PI) + 55 * dist);
        this.tr = { q0, q1, c0, c1, depth, t0: performance.now(), T };
        this.cur = { O: from.O.clone(), d: from.d.clone(), r: from.r.clone(), n: from.n.clone() };
      }
    } else { this.tr = null; this.cur = null; }
    if (!this.stage || !this.fan) return;
    this._liverFor(key, this.tr ? this.tr.T : 700);
    if (!g1) {
      this.stage.heart.setCut(null);
      this.fan.visible = this.fanLine.visible = this.probe.visible = false;
      return;
    }
    this.fan.visible = this.fanLine.visible = this.probe.visible = true;
    this._place3d(this.g, spec);
    if (this.bodyOn) this._keySite();   // the camera stays where the viewer put it
    else this._aim(g1, spec);
  }

  /**
   * The 3D camera for plane g: obliquely onto the cut, or square to it (section), turned as
   * the echo is: the probe at the top, screen-right the same side. It eases there.
   */
  _aim(g, spec) {
    if (!this.stage || !g) return;
    const target = g.O.clone().addScaledVector(g.d, spec.depth * (this.section ? 0.5 : 0.45));
    this.stage.opts.labeled = !!this.section;
    if (this.section) this.stage.view(g.n.clone(), g.d.clone().negate(), 0.137 * spec.depth, target);
    else {
      const look = g.n.clone().addScaledVector(g.r, -0.55).addScaledVector(g.d, 0.35).normalize();
      this.stage.view(look, g.d.clone().negate(), 2.7, target);
    }
  }

  /** Show the plane as a cross-section of the heart, square to the screen, or obliquely. */
  setSection(on) {
    this.section = !!on;
    const g = this.geoms[this.view];
    if (g && !this.bodyOn) this._aim(g, this.specOf(this.view));
  }

  /**
   * Label points for the cross-section: the view's structures that lie on the plane and in
   * the sector, as screen points of the 3D stage. Returns [{ id, x, y, text }].
   */
  sectionLabels(s) {
    const g = this.g;
    if (!g || !this.stage) return [];
    const spec = this.specOf(this.view);
    const an = this.anchors(s || 0);
    const half = THREE.MathUtils.degToRad(spec.angle / 2);
    const out = [];
    for (const [id, txt] of spec.labels || []) {
      // the abdominal vessels are drawn in the echo only, not on the 3D heart; the liver too,
      // unless the 3D view shows it (gl/liver3d.js)
      if (ECHO_ONLY.has(id) && !(id === 'liver' && this.liverShown())) continue;
      let q;
      {
        const P = id === 'liver' ? this.liverPoint(g, spec) : id === 'wallL' || id === 'wallR' ? this.wallPoint(id === 'wallR' ? 1 : -1, s || 0, g) : an[id];
        if (!P) continue;
        q = this.toPlane(P, g);
        if (Math.abs(q[2]) > (ROOMY.has(id) ? 2.8 : 1.8) || q[1] < 0.5) continue;
      }
      if (Math.abs(Math.atan2(q[0], q[1])) > half || Math.hypot(q[0], q[1]) > spec.depth) continue;
      const p = this.stage.project(g.O.clone().addScaledVector(g.r, q[0]).addScaledVector(g.d, q[1]));
      if (p.z > 1) continue;
      out.push({ id, x: p.x, y: p.y, text: FULL[txt] || txt.charAt(0).toUpperCase() + txt.slice(1) });
    }
    return out;
  }

  /** True when the 3D cross-section shows a liver, or is fading one in. */
  liverShown() {
    const L = this.liver3d, on = (sd) => (sd.fade ? sd.fade.a1 : sd.alpha) > 0;
    return !!L && !this.bodyOn && (on(L.liver) || on(L.layer));
  }

  /**
   * Where the liver tag points on plane g: the middle of the four-chamber view's near-field
   * layer, or the middle of the part of the liver's section inside the sector.
   */
  liverPoint(g, spec) {
    const L = this.liver3d;
    if ((L.layer.fade ? L.layer.fade.a1 : L.layer.alpha) > 0) return g.O.clone().addScaledVector(g.d, (1.5 + spec.near) / 2);
    const loops = this.abd.liver.section(g).filter((l) => l.closed && l.pts.length > 2).map((l) => l.pts);
    const inside = (x, y) => loops.some((P) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    });
    const half = THREE.MathUtils.degToRad(spec.angle / 2);
    let su = 0, sv = 0, n = 0;
    for (let z = 1; z < spec.depth; z += 0.5) {
      for (let k = -8; k <= 8; k++) {
        const th = (half * k) / 8.5, x = z * Math.sin(th), y = z * Math.cos(th);
        if (inside(x, y)) { su += x; sv += y; n++; }
      }
    }
    if (!n) return null;
    return g.O.clone().addScaledVector(g.r, su / n).addScaledVector(g.d, sv / n);
  }

  /** Screen box (px) of the sector on the 3D stage, for the tag columns beside it. */
  sectorBox() {
    const g = this.g;
    if (!g || !this.stage) return null;
    const spec = this.specOf(this.view), half = THREE.MathUtils.degToRad(spec.angle / 2);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (P) => { const p = this.stage.project(P); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
    add(g.O);
    for (let i = 0; i <= 8; i++) {
      const th = -half + (2 * half * i) / 8;
      add(g.O.clone().addScaledVector(g.d.clone().multiplyScalar(Math.cos(th)).addScaledVector(g.r, Math.sin(th)), spec.depth));
    }
    return { x0, y0, x1, y1 };
  }

  /**
   * Show any plane g ({ O, d, r, n }) with the settings spec (angle, depth, near, labels, name,
   * short); animate as setView does.
   */
  setGeometry(g, spec, opts = {}) {
    this.freeSpec = spec;
    this.geoms.free = g;
    this.setView('free', opts);
  }

  /** Move the plane along its change; true while it moves. */
  advance() {
    const tr = this.tr;
    if (!tr) return false;
    const u = Math.min(1, (performance.now() - tr.t0) / tr.T);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const q = tr.q0.clone().slerp(tr.q1, e);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const r = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
    m.extractBasis(r, d, n);
    const c = tr.c0.clone().lerp(tr.c1, e);
    this.cur = { O: c.addScaledVector(d, -tr.depth * 0.5), d, r, n };
    if (u >= 1) { this.tr = null; this.cur = null; }
    if (this.stage && this.fan) this._place3d(this.g, this.specOf(this.view));
    return true;
  }

  /** The sector, the probe and the cut on plane g. */
  _place3d(g, spec) {
    if (!g) return;
    const half = THREE.MathUtils.degToRad(spec.angle / 2);
    const verts = [g.O.x, g.O.y, g.O.z];
    const line = [g.O.x, g.O.y, g.O.z];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const th = -half + (2 * half * i) / N;
      const dir = g.d.clone().multiplyScalar(Math.cos(th)).addScaledVector(g.r, Math.sin(th));
      const p = g.O.clone().addScaledVector(dir, spec.depth);
      verts.push(p.x, p.y, p.z);
      line.push(p.x, p.y, p.z);
    }
    if (!this.fanIdx) {
      const idx = [];
      for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
      this.fanIdx = idx;
    }
    this.fan.geometry.dispose();
    this.fan.geometry = new THREE.BufferGeometry();
    this.fan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.fan.geometry.setIndex(this.fanIdx);
    this.fanLine.geometry.dispose();
    this.fanLine.geometry = new THREE.BufferGeometry();
    this.fanLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    placeProbe(this.probe, g.O, g.d, g.r);
    const cut = this.cutOn !== false ? new THREE.Plane().setFromNormalAndCoplanarPoint(g.n.clone(), g.O) : null;
    if (cut) this.stage.heart.setCut(cut);
    if (this.liver3d) this.liver3d.setCut(cut);
  }

  /**
   * The heart shown changed (model3d.js): the rest shapes for the speckle, the sizes for the
   * labels, and the view planes, which follow the heart's landmarks.
   */
  takePheno() {
    const m = this.model, P = this.heart, first = this.pv === -1;
    this.pv = P.version;
    const rest = { amyloid: P.a };
    if (P.mesh) rest[`ph_${P.mesh}`] = 1;
    for (const md of [this.myo, ...this.valves, ...this.chords, this.pap, this.peri, this.cor]) if (md) md.setRest(rest);
    this.geo = this.own ? this.ownGeo : m.sizes;
    this.cusps = null;
    const free = this.geoms.free;
    this.geoms = {};
    // a view with its own heart plans only its own plane (setView plans another when asked)
    for (const k of this.own ? [this.view] : Object.keys(VIEWS)) { const g = viewGeometry(this.anat, k); if (g) this.geoms[k] = g; }
    if (free) this.geoms.free = free;
    if (this.liver3d && this.geoms.sc4c) this.liver3d.setPlane4c(this.geoms.sc4c, VIEWS.sc4c);
    if (first) return;
    this.tr = null;
    this.cur = null;
    if (this.stage && this.fan && this.geoms[this.view]) this.setView(this.view, { animate: false });
  }

  /** state: { s, v, drive, phase } from the cycle model. */
  frame(state) {
    const P = this.heart;
    if (P && P.version !== this.pv) this.takePheno();
    this.advance();
    const g = this.g;
    if (!g) { this.drawEmpty(); return; }
    const a = P ? P.a : 0, s = state.s;
    const weights = (md, lw = null) => ({ amyloid: a, systole: s, amyloid_systole: a * s, ...(lw || {}), ...phenoWeights(Object.keys(md.dict), P, s, lw, this.noSys) });
    this.myo.morph(weights(this.myo));
    const tissue = this.myo.section(g, true);
    const lw = (md) => (md.dict.leaflets_mid !== undefined ? leafletWeights(md.mesh.name, state.v, state.drive, a, s) : { leaflets: state.v });
    const valves = [];
    for (const vd of this.valves) {
      vd.morph(weights(vd, lw(vd)));
      for (const L of vd.section(g)) { L.valve = vd.mesh.name; valves.push(L); }
    }
    // chordae: those in the middle of the slice show brightest
    const chords = [], chordsCore = [];
    for (const cd of this.chords) {
      cd.morph(weights(cd, lw(cd)));
      chords.push(cd.slab(g, SLICE));
      chordsCore.push(cd.slab(g, SLICE * 0.45));
    }
    let pap = [];
    if (this.pap) {
      this.pap.morph(weights(this.pap));
      pap = this.pap.section(g, true);
    }
    let peri = [];
    if (this.peri) {
      this.peri.morph(weights(this.peri));
      peri = this.peri.section(g, true);
    }
    let cor = [];
    if (this.cor && this.specOf(this.view).cor !== false) {
      this.cor.morph(weights(this.cor));
      cor = this.cor.section(g);
    }
    // no liver in the parasternal views: this model's liver reaches into their far field, where
    // ASE's parasternal images (2019, Table 2) show none; its hepatic veins go with it, and the
    // aorta and the IVC stay
    const abd = {}, win = this.specOf(this.view).win;
    const skip = win === 'plax' || win === 'psax' ? ['liver', 'mhv', 'rhv'] : [];
    for (const [k, md] of Object.entries(this.abd)) if (!skip.includes(k)) abd[k] = md.section(g);
    this.last = { tissue, valves, peri, chords, pap, state };
    this.draw(tissue, valves, peri, state, { chords, chordsCore, pap, cor, abd });
  }

  /** Screen mapping for the current view and canvas size. */
  mapping() {
    const spec = this.specOf(this.view);
    const off = this.offscreen;
    const W = this.w, H = this.h;
    const top = off ? 4 : (this.top ?? 46), ecgH = off || this.noEcg ? 0 : Math.min(46, H * 0.09);
    const half = THREE.MathUtils.degToRad(spec.angle / 2);
    if (spec.zoom && this.zoomAt) {
      // a magnified box around a landmark: the apex of the sector sits above the canvas
      const [cu, cv] = this.zoomAt;
      const boxH = H - top - ecgH - (off ? 6 : 30);
      const scale = Math.min((W - 24) / spec.zoom.w, boxH / (spec.zoom.w * 0.9));
      const cx = W / 2 - cu * scale, top0 = top + boxH / 2 - cv * scale;
      return { X: (u) => cx + u * scale, Y: (v) => top0 + v * scale, scale, cx, top: top0, half, ecgH, spec, zoomed: true, boxTop: top, boxH };
    }
    // the depth labels (draw(): 10 px mono, 12 px right of the sector edge) stay inside a narrow canvas
    const d5 = Math.ceil(spec.depth / 5 - 1) * 5, room = W / 2 - 16 - 6.5 * String(d5).length;
    const label = off || d5 <= 0 || room <= 0 ? Infinity : room / (d5 * Math.sin(half));
    const scale = Math.min((H - top - ecgH - (off ? 6 : 40)) / spec.depth, (W - (off ? 6 : 36)) / (2 * spec.depth * Math.sin(half)), label);
    const cx = W / 2;
    return { X: (u) => cx + u * scale, Y: (v) => top + v * scale, scale, cx, top, half, ecgH, spec };
  }

  draw(tissue, valves, peri, state, extra = {}) {
    const t = tokens();
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const m = this.mapping();
    const { X, Y, scale, cx, top, half, ecgH, spec } = m;
    this.map = m;
    const off = this.offscreen;

    const R = spec.depth * scale;
    const fan = new Path2D();
    fan.moveTo(cx, top);
    fan.arc(cx, top, R, Math.PI / 2 + half, Math.PI / 2 - half, true);
    fan.closePath();
    // the image: plane coordinates are cm from the probe, as bmode.js takes them
    const closed = (L) => L.closed && L.pts.length > 2;
    const loops = tissue.filter(closed), open = tissue.filter((L) => !L.closed && L.pts.length > 1);
    const pap = (extra.pap || []).filter(closed);
    const tri = (list) => {
      const out = [];
      for (const c of list || []) for (let i = 0; i < c.length; i += 6) out.push([[c[i], c[i + 1]], [c[i + 2], c[i + 3]], [c[i + 4], c[i + 5]]]);
      return out;
    };
    const ref = (list) => (list.every((L) => L.ref) ? list.map((L) => L.ref) : null);
    // leaflets: the mesh gives each one as a thin closed loop, about 1 mm across
    // a disease heart's own valve is brighter: a calcified bicuspid aortic valve (with a faint
    // shadow behind it), the thick myxomatous leaflets of a Barlow mitral valve
    const ph = this.heart || {};
    const hot = ph.key === 'bav' ? 'AorticValve' : ph.key === 'barlow' ? 'MitralValve' : null;
    const leaf = valves.filter((L) => closed(L) && L.valve !== hot).map((L) => L.pts);
    const hotLeaf = valves.filter((L) => closed(L) && L.valve === hot).map((L) => L.pts);
    const hotDb = ph.key === 'bav' ? DB.valve + 7 : DB.valve + 3, hotShadow = ph.key === 'bav' ? 6 : 0;
    // below the diaphragm: the liver with its bright capsule, the veins and arteries in it or
    // behind it (thin-walled veins, thicker brighter arteries), the vertebral bodies casting
    // a shadow; the coronary arteries on the heart
    const A = spec.liver ? {} : extra.abd || {};
    const loopsOf = (k) => (A[k] || []).filter(closed).map((L) => L.pts);
    const liver = loopsOf('liver'), spine = loopsOf('spine');
    const veins = ['ivc', 'mhv', 'rhv'].flatMap(loopsOf), arteries = ['aorta', 'celiac', 'sma'].flatMap(loopsOf);
    // a vessel's wall, without the flat end where the tube stops
    const walls = (list) => {
      const out = [];
      for (const L of list) {
        let run = [];
        for (let i = 0; i <= L.length; i++) {
          const p = L[i % L.length];
          if (p[2]) { if (run.length > 1) out.push(run); run = []; } else run.push(p);
        }
        if (run.length > 1) out.push(run);
      }
      return out;
    };
    // the coronary mesh crosses the RV outflow tract in places; an artery runs on the heart,
    // never through a cavity, so a section inside a blood pool and clear of the walls is dropped
    const inside = (P, x, y) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const wallGap = (C) => {
      let best = Infinity;
      for (const L of tissue) {
        const P = L.pts;
        for (let i = 1; i < P.length + (L.closed ? 1 : 0); i++) {
          const [ax, ay] = P[i - 1], [bx, by] = P[i % P.length];
          const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy || 1e-9;
          for (const [px, py] of C) {
            const t = Math.max(0, Math.min(1, ((px - ax) * ux + (py - ay) * uy) / l2));
            best = Math.min(best, Math.hypot(px - ax - t * ux, py - ay - t * uy));
          }
        }
      }
      return best;
    };
    const inBlood = (C) => {
      const x = C.reduce((s, p) => s + p[0], 0) / C.length, y = C.reduce((s, p) => s + p[1], 0) / C.length;
      const k = loops.reduce((s, L) => s + (inside(L.pts, x, y) ? 1 : 0), 0);
      return k > 0 && k % 2 === 0 && wallGap(C) > 0.12;
    };
    const cor = (extra.cor || []).filter(closed).map((L) => L.pts).filter((C) => !inBlood(C));
    // the pericardium mesh dips into the myocardium in places (up to about 3 mm), and more where
    // a wall moves on its own (chapter 09): a point of its line inside a wall moves out to the
    // wall's outer surface and 0.6 mm beyond, so the line never runs through muscle
    // even-odd over all the wall loops at once, with the edges sorted into 2.5 mm bands of depth
    // so that a point tests only the edges at its own depth
    const BAND = 0.25, bands = new Map();
    for (const [li, L] of loops.entries()) {
      const P = L.pts;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const e = [P[j][0], P[j][1], P[i][0], P[i][1], li];
        for (let b = Math.floor(Math.min(e[1], e[3]) / BAND); b <= Math.floor(Math.max(e[1], e[3]) / BAND); b++) {
          if (!bands.has(b)) bands.set(b, []);
          bands.get(b).push(e);
        }
      }
    }
    const inWall = (x, y) => {
      let c = false;
      for (const [xj, yj, xi, yi] of bands.get(Math.floor(y / BAND)) || []) if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      return c;
    };
    // a wall's outer surface: a loop that an even number of the other loops enclose
    const outer = loops.filter((L, i) => loops.reduce((k, M, j) => (j !== i && inside(M.pts, L.pts[0][0], L.pts[0][1]) ? k + 1 : k), 0) % 2 === 0);
    const clearOf = (pts) => pts.map((p) => {
      if (!inWall(p[0], p[1])) return p;
      let q = null, bd = Infinity;
      for (const L of outer) {
        const P = L.pts;
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length], ux = b[0] - a[0], uy = b[1] - a[1], l2 = ux * ux + uy * uy || 1e-9;
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / l2));
          const x = a[0] + t * ux, y = a[1] + t * uy, d = Math.hypot(p[0] - x, p[1] - y);
          if (d < bd) { bd = d; q = [x, y]; }
        }
      }
      if (!q || bd > 1.2) return p;
      const d = bd || 1;
      return [q[0] + ((q[0] - p[0]) / d) * 0.06, q[1] + ((q[1] - p[1]) / d) * 0.06];
    });
    // it also runs through a lumen in places, most round the pulmonary artery, which the model
    // re-shapes as it loads (gl/pabend.js): a point of its line in blood (inside an even number
    // of wall loops) and more than 1.2 mm from every wall is dropped, as a coronary ring is
    const odd = new Uint8Array(loops.length);
    const loopsAround = (x, y) => {
      const list = bands.get(Math.floor(y / BAND)) || [];
      for (const e of list) odd[e[4]] = 0;
      let k = 0;
      for (const [xj, yj, xi, yi, li] of list) if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k += (odd[li] ^= 1) ? 1 : -1;
      return k;
    };
    const nearWall = (x, y, r) => {
      for (let b = Math.floor((y - r) / BAND); b <= Math.floor((y + r) / BAND); b++) {
        for (const [ax, ay, bx, by] of bands.get(b) || []) {
          const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy) / l2));
          if (Math.hypot(x - ax - t * ux, y - ay - t * uy) <= r) return true;
        }
      }
      return false;
    };
    const inLumen = (p) => { const k = loopsAround(p[0], p[1]); return k > 0 && k % 2 === 0 && !nearWall(p[0], p[1], 0.12); };
    const periPts = [], periRefs = [];
    for (const L of peri) {
      const pts = clearOf(L.pts);
      let run = [], rr = [];
      for (let i = 0; i <= pts.length; i++) {
        if (i < pts.length && !inLumen(pts[i])) { run.push(pts[i]); if (L.ref) rr.push(L.ref[i]); continue; }
        if (run.length > 1) { periPts.push(run); periRefs.push(rr); }
        run = []; rr = [];
      }
    }
    this.periDrawn = periPts;          // the pericardium line as drawn, plane coordinates
    const items = [
      { polys: liver, e: DB.liver },
      { borders: liver, e: 6, spec: 9, w: 0.12, closed: true, all: true },
      { polys: spine, e: DB.calcium - 2, shadow: 30 },
      // walls first, then the lumens: where a vein joins another, its wall does not cross
      // the lumen it drains into (the walls are drawn twice as wide for the half that stays)
      { borders: walls(veins), e: DB.fibrous - 3, spec: 6, w: 0.16, all: true },
      { borders: walls(arteries), e: DB.fibrous + 2, spec: 7, w: 0.28, all: true },
      { polys: [...veins, ...arteries], e: DB.blood, blood: true },
      { polys: loops.map((L) => L.pts), refs: ref(loops), e: DB.myo, rule: 'evenodd' },
      { polys: pap.map((L) => L.pts), refs: ref(pap), e: DB.myo },
      { borders: loops.map((L) => L.pts), refs: ref(loops), e: DB.myo, spec: 8, closed: true },
      { borders: open.map((L) => L.pts), refs: ref(open), e: DB.myo, spec: 8 },
      { borders: pap.map((L) => L.pts), refs: ref(pap), e: DB.myo, spec: 6, closed: true },
      { polys: tri(extra.chords), e: DB.chord - 7 },
      { polys: tri(extra.chordsCore), e: DB.chord },
      { borders: periPts, refs: peri.every((L) => L.ref) ? periRefs : null, e: 8, spec: 10, w: 0.15, all: true },
      { polys: leaf, e: DB.valve },
      { borders: leaf, e: DB.valve, spec: 7, w: 0.06, closed: true },
      { polys: hotLeaf, e: hotDb, shadow: hotShadow },
      { borders: hotLeaf, e: hotDb, spec: 7, w: 0.06, closed: true },
      // coronary arteries run in epicardial fat: a bright sleeve, the wall, the dark lumen
      { lines: cor, closed: true, e: DB.fat + 4, w: 0.5 },
      { borders: cor, e: DB.fibrous, spec: 6, w: 0.07, closed: true, all: true },
      { polys: cor, e: DB.blood, blood: true },
    ];
    const box = m.zoomed ? { x: 8, y: m.boxTop, w: W - 16, h: m.boxH } : { x: 0, y: 0, w: W, h: H };
    const view = { box, cx, top, k: scale, half, depth: spec.depth, near: spec.liver ? 1.5 : spec.near ?? 1.2, liver: spec.liver ? spec.near : 0 };
    ctx.save();
    if (m.zoomed) {
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
    }
    bmode(ctx, view, items, { t: (state.phase ?? 0) * 857 });
    ctx.restore();
    if (m.zoomed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(8, m.boxTop, W - 16, m.boxH);
      ctx.clip();
    }
    ctx.save();
    ctx.strokeStyle = t.ink2;
    ctx.lineWidth = 1;
    ctx.stroke(fan);
    ctx.restore();
    if (m.zoomed) {
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = t.ink2;
      ctx.strokeRect(8.5, m.boxTop + 0.5, W - 17, m.boxH - 1);
      ctx.restore();
    }
    this.fanPath = fan;
    this.boxPath = null;
    if (m.zoomed) {
      this.boxPath = new Path2D();
      this.boxPath.rect(8, m.boxTop, W - 16, m.boxH);
    }
    if (off) {
      // no header, scale or labels: a page draws its own; calipers when it asks (chapter 17)
      if (this.calipers && this.view === 'plax' && !this.tr) this.drawCalipers(tissue, X, Y);
      else this.measure = {};
      return;
    }

    // depth scale and header
    ctx.save();
    ctx.strokeStyle = t.ink2;
    ctx.fillStyle = t.ink2;
    ctx.font = `500 10px ${MONO}`;
    if (!m.zoomed) {
      for (let dcm = 1; dcm < spec.depth; dcm++) {
        const x = cx + Math.sin(half) * dcm * scale, y = top + Math.cos(half) * dcm * scale;
        const len = dcm % 5 === 0 ? 7 : 3.5;
        ctx.beginPath();
        ctx.moveTo(x + 2, y);
        ctx.lineTo(x + 2 + len, y);
        ctx.stroke();
        if (dcm % 5 === 0) ctx.fillText(String(dcm), x + 12, y + 3.5);
      }
    }
    ctx.textAlign = 'left';
    const head = m.zoomed ? `${spec.short}  ·  zoom ${spec.zoom.w} cm  ·  HR 70` : `${spec.short}  ·  ${spec.depth.toFixed(0)} cm  ·  HR 70`;
    ctx.fillText(head, 12, (m.zoomed ? m.boxTop : top) - 8);
    ctx.restore();

    if (this.labels) this.drawLabels(state, X, Y);
    if (this.calipers && this.view === 'plax' && !this.tr) this.drawCalipers(tissue, X, Y);
    else this.measure = {};
    if (!this.noEcg) {
      const y0 = Math.min(H - 12, top + spec.depth * scale + ecgH / 2 + 18);
      ecgStrip(ctx, 16, W - 16, y0, ecgH * 0.42, 2.2, state.phase ?? 0, { color: t.ink2, cursor: t.accent });
    }
  }

  drawEmpty() {
    const t = tokens();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = t.ink3;
    ctx.font = `500 13px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('Below the diaphragm: outside the heart model.', this.w / 2, this.h * 0.42);
    this.measure = {};
  }

  toPlane(P, g) {
    const q = P.clone().sub(g.O);
    return [q.dot(g.r), q.dot(g.d), q.dot(g.n)];
  }

  /** Middle of the LV wall on the screen-right (side 1) or screen-left (side -1) of this plane. */
  wallPoint(side, s, g) {
    const A = this.anat, Z = A.axis;
    const eq = A.point('lv_eq', 0, s);
    const mid = eq.clone().addScaledVector(g.n, -eq.clone().sub(g.O).dot(g.n));
    const rr = g.r.clone().addScaledVector(Z, -g.r.dot(Z)).normalize();
    const lvid = (s > 0.5 ? this.geo.lvids : this.geo.lvid) * 0.1, wall = this.geo.pw * 0.1;
    return mid.addScaledVector(rr, side * (lvid / 2 + wall / 2));
  }

  /** Named anchors (world, cm) for the labels. */
  anchors(s) {
    const A = this.anat;
    const an = A.anchors(0, s, this.geo);
    const eq = A.point('lv_eq', 0, s), mm = 0.1;
    const lvid = (s > 0.5 ? this.geo.lvids : this.geo.lvid) * mm, wall = this.geo.pw * mm;
    const dir = (x, y) => A.lateral.clone().multiplyScalar(x).addScaledVector(A.anterior, y).normalize();
    const on = (x, y) => eq.clone().addScaledVector(dir(x, y), lvid / 2 + wall / 2);
    an.antw = on(0, 1);
    an.infw = on(0, -1);
    an.latw = on(1, 0);
    an.rvant = eq.clone().addScaledVector(dir(-0.6, 0.8), lvid / 2 + this.geo.ivs * mm + 1.3);
    an.asw = on(-0.87, 0.5);
    an.ilw = on(0.87, -0.5);
    an.pw = an.ilw;
    an.ivs = an.septum;
    an.rvot = an.pv.clone().addScaledVector(PV_AXIS, -1.4);   // the infundibulum, below the valve
    an.ao = an.av.clone().addScaledVector(A.aorticRoot, 1.6);
    an.apex = A.point('apex_endo', 0, s).lerp(eq, 0.12);
    an.lvc = eq.clone().lerp(an.mv, 0.25);
    an.lvot = an.av.clone().lerp(an.mv, 0.25).addScaledVector(A.axis, -1.1);
    an.avmv = an.av.clone().lerp(an.mv, 0.5);
    an.asc = an.av.clone().addScaledVector(A.aorticRoot, 3.4);
    an.arch = V3(...VESSELS.archTop).addScaledVector(BODY.sup, -1.2);
    an.desc = V3(...VESSELS.desc);
    an.ivc = V3(...VESSELS.ivc).addScaledVector(BODY.sup, 1.4);
    an.svc = V3(...VESSELS.svc);
    an.lmca = V3(...VESSELS.lmca);
    an.rca = V3(...VESSELS.rca);
    an.avroot = V3(...VESSELS.lmca).lerp(V3(...VESSELS.rca), 0.5);
    an.abdao = V3(...ABD.aorta.pts[1]).lerp(V3(...ABD.aorta.pts[2]), 0.4);
    an.celiac = V3(...ABD.celiac.pts[1]);
    an.sma = V3(...ABD.sma.pts[2]);
    an.hv = V3(...ABD.mhv.pts[1]);
    an.ivcl = V3(...ABD.ivc.pts[1]);
    // the aortic cusps, in the plane where the shut cusps meet (0.7 cm up the root)
    const cusps = this.cusps || (this.cusps = cuspDirs(this.model));
    if (cusps) {
      const C = an.av.clone().addScaledVector(A.aorticRoot, 0.7);
      for (const [k, dir] of Object.entries(cusps)) an[k] = C.clone().addScaledVector(dir, 0.6);
      // a bicuspid valve: the fused right and left cusp, and the raphe where they join
      const rl = cusps.rcc.clone().add(cusps.lcc).normalize();
      an.rl = C.clone().addScaledVector(rl, 0.75);
      an.raphe = C.clone().addScaledVector(rl, 0.3);
    }
    an.mpa = V3(...VESSELS.paMid);
    an.rpa = V3(...VESSELS.rpaMid);
    an.lpa = V3(...VESSELS.lpaMid);
    return an;
  }

  drawLabels(state, X, Y) {
    const g = this.g;
    const an = this.anchors(state.s || 0);
    const ctx = this.ctx;
    const spec = this.specOf(this.view);
    const list = spec.labels || [];
    const placed = [];
    ctx.save();
    ctx.font = `600 11px ${SANS}`;
    ctx.textBaseline = 'middle';
    for (const [id, txt] of list) {
      let x, y;
      if (id === 'liver') {
        // on the centre line: halfway through a liver layer, or 2.4 cm past the abdominal wall
        x = this.map.cx; y = this.map.top + (spec.liver ? spec.near * 0.55 : spec.near + 2.4) * this.map.scale;
        if (!ctx.isPointInPath(this.fanPath, x * this.dpr, y * this.dpr)) continue;
        if (this.boxPath && !ctx.isPointInPath(this.boxPath, x * this.dpr, y * this.dpr)) continue;
      } else {
        const P = id === 'wallL' || id === 'wallR' ? this.wallPoint(id === 'wallR' ? 1 : -1, state.s || 0, g) : an[id];
        if (!P) continue;
        const q = this.toPlane(P, g);
        const far = spec.strict ? (ROOMY.has(id) ? 1.6 : 0.9) : ROOMY.has(id) ? 2.8 : 1.8;
        if (Math.abs(q[2]) > far || q[1] < 0.5) continue;
        x = X(q[0]); y = Y(q[1]);
        if (!ctx.isPointInPath(this.fanPath, x * this.dpr, y * this.dpr)) continue;
        if (this.boxPath && !ctx.isPointInPath(this.boxPath, x * this.dpr, y * this.dpr)) continue;
      }
      const w = ctx.measureText(txt).width + 10;
      // inside the image, and off the labels already placed: down, then up; no room, no label
      x = Math.max(w / 2 + 2, Math.min(this.w - w / 2 - 2, x));
      const inFan = (py) => ctx.isPointInPath(this.fanPath, x * this.dpr, py * this.dpr) && (!this.boxPath || ctx.isPointInPath(this.boxPath, x * this.dpr, py * this.dpr));
      let yy = null;
      for (const dy of [0, 16, -16, 32, -32, 48, -48]) {
        const c = Math.max(10, Math.min(this.h - 10, y + dy));
        if (!inFan(c)) continue;
        if (!placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - c) < 16)) { yy = c; break; }
      }
      if (yy === null) continue;
      placed.push({ x, y: yy, w });
      ctx.fillStyle = 'rgba(8,10,12,0.62)';
      ctx.fillRect(x - w / 2, yy - 8, w, 16);
      ctx.fillStyle = '#ffe89a';
      ctx.textAlign = 'center';
      ctx.fillText(txt, x, yy + 0.5);
    }
    ctx.restore();
  }

  // PLAX linear measurements at end-diastole, square to the LV long axis near the mitral tips
  crossings(loops, P0, dir, len) {
    const hits = [];
    for (const L of loops) {
      const n = L.pts.length;
      const m = L.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const a = L.pts[i], b = L.pts[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const den = dir[0] * ey - dir[1] * ex;
        if (Math.abs(den) < 1e-9) continue;
        const qx = a[0] - P0[0], qy = a[1] - P0[1];
        const tt = (qx * ey - qy * ex) / den;
        const ss = (qx * dir[1] - qy * dir[0]) / den;
        if (ss >= 0 && ss < 1 && tt >= 0 && tt <= len) hits.push(tt);
      }
    }
    return hits.sort((x, y) => x - y);
  }
  intervals(loops, P0, dir, len) {
    const h = this.crossings(loops.filter((L) => L.closed), P0, dir, len);
    const out = [];
    for (let i = 0; i + 1 < h.length; i += 2) out.push([h[i], h[i + 1]]);
    return out;
  }
  drawCalipers(tissue, X, Y) {
    const g = this.g;
    const an = this.anchors(0);
    const c = this.toPlane(an.lv.clone().lerp(an.mv, 0.3), g);
    const dir = [0, 1];
    const P0 = [c[0], c[1] - 9];
    const iv = this.intervals(tissue, P0, dir, 18);
    const before = iv.filter((q) => q[1] < 9), after = iv.filter((q) => q[0] > 9);
    if (!before.length || !after.length) { this.measure = {}; return; }
    const s1 = before[before.length - 1], s2 = after[0];
    const ctx = this.ctx;
    const seg = (t0, t1) => {
      const x = X(P0[0]), y0 = Y(P0[1] + t0), y1 = Y(P0[1] + t1);
      ctx.save();
      ctx.strokeStyle = '#ffe89a';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.setLineDash([]);
      for (const y of [y0, y1]) { ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke(); }
      ctx.restore();
    };
    seg(s1[0], s1[1]); seg(s1[1], s2[0]); seg(s2[0], s2[1]);
    this.measure = { ivs: (s1[1] - s1[0]) * 10, lvid: (s2[0] - s1[1]) * 10, pw: (s2[1] - s2[0]) * 10, x: X(P0[0]), y: Y(P0[1] + s2[1]) };
  }
}
