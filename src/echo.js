// Echo views as live cross-sections of the heart mesh. The same code draws the
// on-screen view beside the 3D heart (chapter 03) and offscreen frames for other chapters.
import * as THREE from '../vendor/three.bundle.min.js';
import { tokens, rng, MONO, SANS } from './sketch.js';
import { VIEWS, VESSELS } from './views.js';
import { leafletWeights } from './gl/heart.js';
import { normalGeo } from './model3d.js';
import { ecg as ecgStrip } from './scope.js';

export { VIEWS };

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SLICE = 0.25;   // half the thickness of the imaging slice, cm: chordae inside it show
const BODY = { left: V3(1, 0, 0), sup: V3(0, 1, 0), ant: V3(0, 0, 1) };   // world axes of the model
const VP = (k) => V3(...VESSELS[k]);

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
  switch (spec.plane) {
    case 'a4c': apical(spec.aim ? aims[spec.aim] : mv.clone().lerp(tv, 0.45), mv.clone().sub(tv)); break;
    case 'a5c': apical(mv.clone().lerp(tv, 0.4).lerp(av, 0.55), mv.clone().sub(tv)); break;
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
      // tilted toward the left shoulder: RVOT, pulmonic valve and main PA along the plane
      const bif = VP('paBif');
      const rvo = pv.clone().lerp(av, 0.35).addScaledVector(Z, -1.2);
      const n0 = new THREE.Vector3().subVectors(pv, rvo).cross(new THREE.Vector3().subVectors(bif, rvo)).normalize();
      O = onPlane(pv.clone().addScaledVector(BODY.ant, 7.6).addScaledVector(BODY.sup, -1.4), pv, n0);
      d = perp(pv.clone().lerp(bif, 0.3).sub(O), n0);
      r = perp(perp(bif.clone().sub(rvo), n0), d);
      break;
    }
    case 'psax_av': case 'psax_tv': {
      // square to the aortic root, through the valve: the three cusps in cross-section
      const n0 = anat.aorticRoot.clone();
      d = perp(Y.clone().negate(), n0);
      r = perp(perp(X, n0), d);
      O = av.clone().addScaledVector(d, -7.4);
      if (spec.plane === 'psax_tv') {
        // same plane, the sector steered medially onto the tricuspid valve
        const t = tv.clone().addScaledVector(n0, -tv.clone().sub(av).dot(n0));
        d = t.clone().sub(O).normalize();
        r = perp(perp(X, n0), d);
      }
      break;
    }
    case 'psax_pa': {
      // tilted up the pulmonary trunk to its bifurcation
      const bif = VP('paBif');
      const n0 = new THREE.Vector3().subVectors(pv, av).cross(new THREE.Vector3().subVectors(bif, av)).normalize();
      const mid = pv.clone().lerp(bif, 0.45);
      O = onPlane(mid.clone().addScaledVector(BODY.ant, 7.2), av, n0);
      d = perp(mid.clone().sub(O), n0);
      r = perp(perp(BODY.left, n0), d);
      break;
    }
    case 'psax': {
      const th = THREE.MathUtils.degToRad(128);
      const u = X.clone().multiplyScalar(Math.cos(th)).addScaledVector(Y, Math.sin(th)).normalize();
      const level = eq.clone().lerp(mv, spec.level ?? -0.24);
      O = level.clone().addScaledVector(u, 7.6);
      d = perp(u.clone().negate(), Z);   // keep the plane square to the long axis
      r = perp(perp(X, d), Z);
      break;
    }
    case 'sc4c': {
      // from below the RV, through the RV free wall first
      const r4 = perp(mv.clone().sub(tv), Z);
      const n4 = Z.clone().cross(r4).normalize();
      const center = eq.clone().lerp(mv, 0.4);
      O = center.clone().addScaledVector(r4, -12.5).addScaledVector(Z, -3.6);
      d = center.clone().sub(O);
      d.addScaledVector(n4, -d.dot(n4)).normalize();
      r = perp(Z.clone().negate(), d);
      break;
    }
    case 'sc_ivc': {
      // sagittal plane through the IVC and the right atrium; the head end on screen-right
      const ivc = VP('ivc');
      const mid = ivc.clone().lerp(ra, 0.5);
      O = mid.clone().addScaledVector(BODY.sup, -4.0).addScaledVector(BODY.ant, 9.0);
      d = perp(mid.clone().sub(O), BODY.left);
      r = perp(perp(BODY.sup, BODY.left), d);
      break;
    }
    case 'ssn': {
      // plane of the arch: ascending, top, descending
      const A = VP('ascMid'), T = VP('archTop'), D = VP('desc');
      const n0 = new THREE.Vector3().subVectors(T, A).cross(new THREE.Vector3().subVectors(D, A)).normalize();
      const mid = A.clone().add(T).add(D).multiplyScalar(1 / 3);
      O = T.clone().addScaledVector(BODY.sup, 4.2).addScaledVector(BODY.ant, 3.0);
      O.addScaledVector(n0, -O.clone().sub(mid).dot(n0));
      d = perp(mid.clone().sub(O), n0);
      r = perp(perp(D.clone().sub(A), n0), d);
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
    this.targets = (g.morphAttributes.position || []).map((a) => a.array);
    this.pos = new Float32Array(this.count * 3);
    this.sd = new Float32Array(this.count);
    mesh.updateMatrixWorld(true);
    this.matrix = mesh.matrixWorld.clone();
    this.identity = this.matrix.equals(new THREE.Matrix4());
  }
  morph(w) {
    const { base, pos, targets, dict } = this;
    pos.set(base);
    for (const [name, value] of Object.entries(w)) {
      const i = dict[name];
      if (i === undefined || !value) continue;
      const t = targets[i];
      for (let k = 0; k < pos.length; k++) pos[k] += value * t[k];
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
  /** Closed and open polylines in plane coordinates [u (right), v (depth)]. */
  section(g) {
    const { pos, sd, index, count } = this;
    const nx = g.n.x, ny = g.n.y, nz = g.n.z;
    const k0 = nx * g.O.x + ny * g.O.y + nz * g.O.z;
    for (let i = 0; i < count; i++) {
      const s = nx * pos[3 * i] + ny * pos[3 * i + 1] + nz * pos[3 * i + 2] - k0;
      sd[i] = s === 0 ? 1e-6 : s;
    }
    const pts = new Map();
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
        pts.set(key, [x * rx + y * ry + z * rz, x * dx + y * dy + z * dz]);
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
      const line = [];
      let cur = start, prev = -1;
      let closed = false;
      for (let guard = 0; guard < 200000; guard++) {
        used.add(cur);
        line.push(pts.get(cur));
        const nb = adj.get(cur);
        let next = -1;
        for (const q of nb) if (q !== prev && !used.has(q)) { next = q; break; }
        if (next === -1) { closed = nb.includes(start) && line.length > 2; break; }
        prev = cur;
        cur = next;
      }
      if (line.length > 1) loops.push({ pts: line, closed });
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

// chambers and vessels may sit a little further from the plane than walls and valves and still show
const ROOMY = new Set(['la', 'ra', 'lv', 'rv', 'rvant', 'rvot', 'mpa', 'ao', 'asc', 'arch', 'desc', 'ivc', 'rpa', 'lpa']);

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
    this.geo = normalGeo(model.doc);
    const h = model.heart;
    this.myo = new MeshData(h.meshes.Myocardium);
    this.valves = ['MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve'].filter((n) => h.meshes[n]).map((n) => new MeshData(h.meshes[n]));
    this.chords = ['MitralChordae', 'TricuspidChordae'].filter((n) => h.meshes[n]).map((n) => new MeshData(h.meshes[n]));
    this.pap = h.meshes.Papillary ? new MeshData(h.meshes.Papillary) : null;
    this.peri = h.meshes.Pericardium ? new MeshData(h.meshes.Pericardium) : null;
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
    this.probe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 2.4, 20), new THREE.MeshBasicMaterial({ color: 0x22272b, transparent: true, opacity: 0.22, depthTest: false }));
    // one group, so a chapter that shares the stage can hide this fan
    this.overlay = new THREE.Group();
    this.overlay.add(this.fan, this.fanLine, this.probe);
    s.overlayScene.add(this.overlay);
  }

  retheme() {
    if (!this.fanMat) return;
    const t = tokens();
    this.fanMat.color.setStyle(t.ink);
    this.fanLineMat.color.setStyle(t.ink);
    this.probe.material.color.setStyle(t.ink);
  }

  setView(key) {
    this.view = key;
    const g = this.geoms[key];
    const spec = VIEWS[key];
    this.zoomAt = null;
    if (g && spec.zoom) {
      const q = this.toPlane(this.anchors(0)[spec.zoom.at], g);
      this.zoomAt = [q[0], q[1]];
    }
    if (!this.stage || !this.fan) return;
    if (!g) {
      this.stage.heart.setCut(null);
      this.fan.visible = this.fanLine.visible = this.probe.visible = false;
      return;
    }
    this.fan.visible = this.fanLine.visible = this.probe.visible = true;
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
    const idx = [];
    for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
    this.fan.geometry.dispose();
    this.fan.geometry = new THREE.BufferGeometry();
    this.fan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.fan.geometry.setIndex(idx);
    this.fanLine.geometry.dispose();
    this.fanLine.geometry = new THREE.BufferGeometry();
    this.fanLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    this.probe.position.copy(g.O).addScaledVector(g.d, -1.5);
    this.probe.quaternion.setFromUnitVectors(V3(0, 1, 0), g.d);
    // 3D: cut on the imaging plane, keep the far side, view obliquely
    this.stage.heart.setCut(new THREE.Plane().setFromNormalAndCoplanarPoint(g.n.clone(), g.O));
    const look = g.n.clone().addScaledVector(g.r, -0.55).addScaledVector(g.d, 0.35).normalize();
    const up = g.d.clone().negate();
    this.stage.view(look, up, 2.7, g.O.clone().addScaledVector(g.d, spec.depth * 0.45));
  }

  /** state: { s, v, drive, phase } from the cycle model. */
  frame(state) {
    const g = this.geoms[this.view];
    if (!g) { this.drawEmpty(); return; }
    const w = { amyloid: 0, systole: state.s, amyloid_systole: 0 };
    this.myo.morph(w);
    const tissue = this.myo.section(g);
    const lw = (md) => (md.dict.leaflets_mid !== undefined ? leafletWeights(md.mesh.name, state.v, state.drive, 0, state.s) : { leaflets: state.v });
    const valves = [];
    for (const vd of this.valves) {
      vd.morph({ ...w, ...lw(vd) });
      valves.push(...vd.section(g));
    }
    const chords = [];
    for (const cd of this.chords) {
      cd.morph({ ...w, ...lw(cd) });
      chords.push(cd.slab(g, SLICE));
    }
    let pap = [];
    if (this.pap) {
      this.pap.morph(w);
      pap = this.pap.section(g);
    }
    let peri = [];
    if (this.peri) {
      this.peri.morph(w);
      peri = this.peri.section(g);
    }
    this.last = { tissue, valves, peri, chords, pap, state };
    this.draw(tissue, valves, peri, state, { chords, pap });
  }

  /** Screen mapping for the current view and canvas size. */
  mapping() {
    const base = VIEWS[this.view];
    // a chapter may set its own depth and sector width (chapter 02)
    const spec = { ...base, depth: this.depth ?? base.depth, angle: this.angle ?? base.angle };
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
    const scale = Math.min((H - top - ecgH - (off ? 6 : 40)) / spec.depth, (W - (off ? 6 : 36)) / (2 * spec.depth * Math.sin(half)));
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
    const tex = this.textures();

    const R = spec.depth * scale;
    if (m.zoomed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(8, m.boxTop, W - 16, m.boxH);
      ctx.clip();
    }
    const fan = new Path2D();
    fan.moveTo(cx, top);
    fan.arc(cx, top, R, Math.PI / 2 + half, Math.PI / 2 - half, true);
    fan.closePath();
    ctx.save();
    ctx.fillStyle = '#101315';
    ctx.fill(fan);
    ctx.clip(fan);
    ctx.fillStyle = tex.blood;
    ctx.fill(fan);

    const grad = ctx.createRadialGradient(cx, top, 0, cx, top, R);
    grad.addColorStop(0, 'rgba(255,255,255,0.78)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.62)');
    grad.addColorStop(1, 'rgba(255,255,255,0.36)');
    // near field: chest wall (or liver from below the ribs)
    const nearPath = new Path2D();
    nearPath.moveTo(cx, top);
    nearPath.arc(cx, top, spec.near * scale, Math.PI / 2 + half, Math.PI / 2 - half, true);
    nearPath.closePath();
    ctx.save();
    ctx.clip(nearPath);
    ctx.fillStyle = grad;
    ctx.globalAlpha = spec.liver ? 0.22 : 0.3;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = spec.liver ? 0.75 : 0.95;
    ctx.fillStyle = tex.speckle;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const tissuePath = new Path2D();
    for (const L of tissue) {
      if (!L.closed || L.pts.length < 3) continue;
      tissuePath.moveTo(X(L.pts[0][0]), Y(L.pts[0][1]));
      for (let i = 1; i < L.pts.length; i++) tissuePath.lineTo(X(L.pts[i][0]), Y(L.pts[i][1]));
      tissuePath.closePath();
    }
    ctx.save();
    ctx.clip(tissuePath, 'evenodd');
    ctx.fillStyle = '#101315';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = tex.speckle;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.1;
    ctx.stroke(tissuePath);

    const pap = (extra.pap || []).filter((L) => L.closed && L.pts.length > 2);
    if (pap.length) {
      const papPath = new Path2D();
      for (const L of pap) {
        papPath.moveTo(X(L.pts[0][0]), Y(L.pts[0][1]));
        for (let i = 1; i < L.pts.length; i++) papPath.lineTo(X(L.pts[i][0]), Y(L.pts[i][1]));
        papPath.closePath();
      }
      const outside = new Path2D();
      outside.rect(0, 0, W, H);
      outside.addPath(tissuePath);
      ctx.save();
      ctx.clip(outside, 'evenodd');
      ctx.stroke(papPath);
      ctx.clip(papPath);
      ctx.fillStyle = '#101315';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = tex.speckle;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const chords = extra.chords || [];
    if (chords.some((c) => c.length)) {
      ctx.beginPath();
      for (const c of chords) {
        for (let i = 0; i < c.length; i += 6) {
          ctx.moveTo(X(c[i]), Y(c[i + 1]));
          ctx.lineTo(X(c[i + 2]), Y(c[i + 3]));
          ctx.lineTo(X(c[i + 4]), Y(c[i + 5]));
          ctx.closePath();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    for (const L of valves) {
      ctx.beginPath();
      L.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      if (L.closed) ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.2;
    for (const L of peri) {
      ctx.beginPath();
      L.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      if (L.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

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
    if (off) return;

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
    if (this.calipers && this.view === 'plax') this.drawCalipers(tissue, X, Y);
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

  textures() {
    if (this.tex) return this.tex;
    const mk = (size, fn) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      fn(c.getContext('2d'), size);
      return c;
    };
    const R = rng(11);
    const speckle = mk(256, (x, n) => {
      for (let i = 0; i < 2600; i++) {
        const px = R() * n, py = R() * n;
        x.globalAlpha = 0.18 + 0.55 * R();
        x.fillStyle = '#ffffff';
        x.beginPath();
        x.ellipse(px, py, 1.2 + 2.6 * R(), 0.6 + 0.8 * R(), 0, 0, Math.PI * 2);
        x.fill();
      }
    });
    const blood = mk(128, (x, n) => {
      for (let i = 0; i < 380; i++) {
        x.globalAlpha = 0.05 + 0.1 * R();
        x.fillStyle = '#ffffff';
        x.fillRect(R() * n, R() * n, 1 + R() * 2, 1);
      }
    });
    this.tex = { speckle: this.ctx.createPattern(speckle, 'repeat'), blood: this.ctx.createPattern(blood, 'repeat') };
    return this.tex;
  }

  toPlane(P, g) {
    const q = P.clone().sub(g.O);
    return [q.dot(g.r), q.dot(g.d), q.dot(g.n)];
  }

  /** Middle of the LV wall on the screen-right (side 1) or screen-left (side -1) of this plane. */
  wallPoint(side, s, g) {
    const A = this.model.anat, Z = A.axis;
    const eq = A.point('lv_eq', 0, s);
    const mid = eq.clone().addScaledVector(g.n, -eq.clone().sub(g.O).dot(g.n));
    const rr = g.r.clone().addScaledVector(Z, -g.r.dot(Z)).normalize();
    const lvid = (s > 0.5 ? this.geo.lvids : this.geo.lvid) * 0.1, wall = this.geo.pw * 0.1;
    return mid.addScaledVector(rr, side * (lvid / 2 + wall / 2));
  }

  /** Named anchors (world, cm) for the labels. */
  anchors(s) {
    const A = this.model.anat;
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
    an.rvot = an.pv.clone().lerp(an.av, 0.35);
    an.ao = an.av.clone().addScaledVector(A.aorticRoot, 1.6);
    an.apex = A.point('apex_endo', 0, s).lerp(eq, 0.12);
    an.lvc = eq.clone().lerp(an.mv, 0.25);
    an.lvot = an.av.clone().lerp(an.mv, 0.25).addScaledVector(A.axis, -1.1);
    an.avmv = an.av.clone().lerp(an.mv, 0.5);
    an.asc = an.av.clone().addScaledVector(A.aorticRoot, 3.4);
    an.arch = V3(...VESSELS.archTop).addScaledVector(BODY.sup, -1.2);
    an.desc = V3(...VESSELS.desc);
    an.ivc = V3(...VESSELS.ivc).addScaledVector(BODY.sup, 1.4);
    const bif = V3(...VESSELS.paBif);
    an.mpa = an.pv.clone().lerp(bif, 0.5);
    an.rpa = bif.clone().addScaledVector(BODY.left, -2.6).addScaledVector(BODY.ant, -0.8);
    an.lpa = bif.clone().addScaledVector(BODY.left, 2.4).addScaledVector(BODY.ant, -0.8);
    return an;
  }

  drawLabels(state, X, Y) {
    const g = this.geoms[this.view];
    const an = this.anchors(state.s || 0);
    const ctx = this.ctx;
    const list = VIEWS[this.view].labels || [];
    const placed = [];
    ctx.save();
    ctx.font = `600 11px ${SANS}`;
    ctx.textBaseline = 'middle';
    for (const [id, txt] of list) {
      let x, y;
      if (id === 'liver') {
        const nr = VIEWS[this.view].near * this.map.scale * 0.55;
        x = this.map.cx; y = this.map.top + nr;
      } else {
        const P = id === 'wallL' || id === 'wallR' ? this.wallPoint(id === 'wallR' ? 1 : -1, state.s || 0, g) : an[id];
        if (!P) continue;
        const q = this.toPlane(P, g);
        if (Math.abs(q[2]) > (ROOMY.has(id) ? 2.8 : 1.8) || q[1] < 0.5) continue;
        x = X(q[0]); y = Y(q[1]);
        if (!ctx.isPointInPath(this.fanPath, x * this.dpr, y * this.dpr)) continue;
        if (this.boxPath && !ctx.isPointInPath(this.boxPath, x * this.dpr, y * this.dpr)) continue;
      }
      const w = ctx.measureText(txt).width + 10;
      // nudge down until it does not overlap a placed label
      let yy = y;
      for (let k = 0; k < 6; k++) {
        if (!placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - yy) < 16)) break;
        yy += 16;
      }
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
    const g = this.geoms[this.view];
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
