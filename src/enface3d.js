// The 3D TEE "surgeon's view" of the mitral valve (chapter mteer): the valve seen en face
// from the LA, the aortic valve at 12 o'clock; and the tricuspid valve seen from the RA (chapter
// tteer, draw's valves, chords and regions), cut from the same morphed meshes as the chapter's
// 2D echo views (an EchoView after its frame()), with the clip and the delivery system. A 3D
// echo system renders its volume by depth in a bronze scale, near tissue light and far tissue
// dark; this renderer draws the surfaces that way: the LA floor, the LV's rim and the aortic root
// next to the annulus, the leaflets, their skirts and chordae, and the device, inside a crop box
// from below the leaflets' tips to a height above the annulus, as a zoomed 3D acquisition crops
// them.
// The canvas is offscreen (WebGL); a chapter draws it into its own figure (drawImage).
import * as THREE from '../vendor/three.bundle.min.js';

const VERT = `
#include <clipping_planes_pars_vertex>
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  vView = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
// the bronze scale of a 3D echo display: by depth from the camera, lit from the probe's side,
// with a fine speckle fixed to the tissue
const FRAG = `
#include <clipping_planes_pars_fragment>
uniform float uNear, uFar, uGain, uMetal;
varying vec3 vView;
varying vec3 vWorld;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  if (n.z < 0.0) n = -n;
  float lit = 0.28 + 0.72 * pow(clamp(n.z, 0.0, 1.0), 0.8);
  float t = clamp((-vView.z - uNear) / (uFar - uNear), 0.0, 1.0);
  vec3 nearC = vec3(1.0, 0.86, 0.6), midC = vec3(0.78, 0.48, 0.22), farC = vec3(0.24, 0.1, 0.035);
  vec3 c = t < 0.5 ? mix(nearC, midC, t * 2.0) : mix(midC, farC, t * 2.0 - 1.0);
  float sp = 0.78 + 0.44 * noise(vWorld * 9.0) * (1.0 - 0.5 * uMetal);
  c *= lit * sp * uGain;
  // the device: a brighter, paler echo than tissue, so its outline reads against the leaflets
  c = mix(c, vec3(0.96, 0.92, 0.82) * (0.3 + 0.8 * lit), 0.5 * uMetal);
  gl_FragColor = vec4(c, 1.0);
}`;

export class EnFace {
  /** A renderer of w x h px (device px). */
  constructor(w = 400, h = 400) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.localClippingEnabled = true;
    // the crop box's top and bottom along the annulus's normal (set in draw)
    this.clips = [new THREE.Plane(), new THREE.Plane()];
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.5, 30);
    this.mat = (metal = 0) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { uNear: { value: 2 }, uFar: { value: 8 }, uGain: { value: 1.1 }, uMetal: { value: metal } },
      clipping: true, clippingPlanes: this.clips,
    });
    this.tissue = this.mat(0);
    this.metal = this.mat(1);
    this.meshes = new Map();   // name -> THREE.Mesh
    this.sel = null;
  }

  setSize(w, h) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The crop on the rest heart, found once for view ev: the myocardium's triangles of the LA,
   * the aortic root and the LV (regions 3, 5 and 1) within reach of the annulus's middle C, from
   * below the annular plane (N) up to top cm above it. The LV's rim at the annulus joins the LA
   * floor to the valve: without it, a dilated LA's floor leaves a black ring round the annulus.
   */
  crop(ev, C, N, reach = 2.9, top = 3.0, bottom = -0.6, regions = [3, 5, 1]) {
    const md = ev.myo, P = md.rest, idx = md.index, col = md.mesh.geometry.attributes.color;
    const keep = [];
    const reg = (i) => Math.round(col.getX(i) * 10);
    for (let t = 0; t < idx.length; t += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const i = idx[t + k], r = reg(i);
        if (!regions.includes(r)) { ok = false; break; }
        const x = P[3 * i] - C[0], y = P[3 * i + 1] - C[1], z = P[3 * i + 2] - C[2];
        const h = x * N[0] + y * N[1] + z * N[2], rr = Math.hypot(x - h * N[0], y - h * N[1], z - h * N[2]);
        if (h > top || h < bottom || rr > reach) { ok = false; break; }
      }
      if (ok) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    this.sel = { myo: new Uint32Array(keep) };
  }

  /** A mesh of name over positions pos (shared Float32Array, world cm) and index idx. */
  surface(name, pos, idx, mat = this.tissue) {
    let m = this.meshes.get(name);
    if (!m) {
      const g = new THREE.BufferGeometry();
      m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      this.scene.add(m);
      this.meshes.set(name, m);
    }
    const g = m.geometry;
    const a = g.getAttribute('position');
    if (!a || a.array !== pos) g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    else a.needsUpdate = true;
    if (!g.index || g.userData.idx !== idx) { g.setIndex(new THREE.BufferAttribute(idx instanceof Uint32Array || idx instanceof Uint16Array ? idx : new Uint32Array(idx), 1)); g.userData.idx = idx; }
    m.visible = true;
    return m;
  }

  /**
   * Draw view ev (after its frame()) en face: C, N, A0 (arrays) the annulus's middle, its normal
   * into the atrium and the direction that the image shows at 12 o'clock; dev, the device's parts
   * ({ name: { pos, idx } }) or null. dist: the camera's distance above C (cm); zoom: the field's
   * width at the annulus (cm). valves, chords and regions: the valves, the chordae and the
   * myocardium's regions drawn (by default the mitral valve's: the mitral and aortic valves, the
   * mitral chordae, the LA and the aortic root); reach, cropTop and cropBottom: the crop of the
   * walls round C (cm), found on the first draw.
   */
  draw(ev, C, N, A0, dev = null, o = {}) {
    const valves = o.valves ?? ['MitralValve', 'AorticValve'], chords = o.chords ?? ['MitralChordae'], regions = o.regions ?? [3, 5, 1];
    if (!this.sel) this.crop(ev, C, N, o.reach ?? 2.9, o.cropTop ?? 3.0, o.cropBottom ?? -0.6, regions);
    for (const m of this.meshes.values()) m.visible = false;
    this.surface('myo', ev.myo.pos, this.sel.myo);
    for (const vd of ev.valves) if (valves.includes(vd.mesh.name)) this.surface(vd.mesh.name, vd.pos, vd.index);
    for (const S of ev.skirts || []) if (valves.includes(S.sk.valve)) this.surface(`skirt:${S.sk.name}`, S.pos, S.index);
    for (const cd of ev.chords || []) if (chords.includes(cd.mesh.name)) this.surface(`chords:${cd.mesh.name}`, cd.pos, cd.index);
    if (dev) for (const [name, part] of Object.entries(dev)) if (part.pos.length) this.surface(`dev:${name}`, part.pos, part.idx, this.metal).geometry.computeBoundingSphere();
    // a far camera with a narrow field: a 3D echo volume rendering has little perspective
    const dist = o.dist ?? 12, zoom = o.zoom ?? 5.6, top = o.top ?? 1.1, bottom = o.bottom ?? -2.4;
    const c = new THREE.Vector3(...C), n = new THREE.Vector3(...N), up = new THREE.Vector3(...A0);
    // the crop: keep what lies between bottom and top along n from c
    this.clips[0].setFromNormalAndCoplanarPoint(n.clone().negate(), c.clone().addScaledVector(n, top));
    this.clips[1].setFromNormalAndCoplanarPoint(n.clone(), c.clone().addScaledVector(n, bottom));
    const eye = c.clone().addScaledVector(n, dist);
    this.camera.position.copy(eye);
    this.camera.up.copy(up);
    this.camera.lookAt(c.clone().addScaledVector(n, -0.4));
    this.camera.fov = (2 * Math.atan(zoom / 2 / dist) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    for (const mat of [this.tissue, this.metal]) {
      mat.uniforms.uNear.value = dist - top;
      mat.uniforms.uFar.value = dist - bottom;
    }
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  /** Where world point p (array) lies on the last image drawn: [x, y] from 0 to 1 across it, or null behind the camera. */
  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  }

  dispose() { this.renderer.dispose(); }
}
