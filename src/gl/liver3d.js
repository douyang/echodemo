// The liver in the 3D views of the subcostal window (chapter 07 and the views video): drawn by
// the pencil renderer as a layer of its own over the heart (gl/pencil.js), so it can come and
// go with a fade. Two solids, cut on the imaging plane as the heart is:
//  - liver: the liver of abdomen.js, the one the echo cuts in the IVC and aorta views;
//  - layer: the near-field liver of the subcostal four-chamber view. In this model that plane
//    passes above the liver, so the echo draws the liver there as a layer under the chest wall
//    (views.js: liver; bmode.js); this lobe is that layer in 3D, in the plane, from the chest
//    wall to the diaphragm and wider than the sector.
import * as THREE from '../../vendor/three.bundle.min.js';
import { buildLiver, weld } from '../abdomen.js';
import { reducedMotion } from '../state.js';

const smooth = (t) => t * t * (3 - 2 * t);

/** Lambert tone, the solid's alpha and no flag in the data pass (gl/heart.js dataMaterial). */
function dataMaterial(clip, alpha) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.clippingPlanes = clip;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAlpha = alpha;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAlpha;')
      .replace('#include <color_fragment>', '')
      .replace('#include <opaque_fragment>', `
        float tone = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
        gl_FragColor = vec4(tone, uAlpha, 0.0, 1.0);`)
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
  };
  m.customProgramCacheKey = () => 'pencil-layer-data';
  return m;
}

const STENCIL_CAP = {
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp,
  stencilZFail: THREE.ReplaceStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
};

/** One closed mesh with its stencil faces and its cap on the cut (gl/heart.js _buildCaps). */
class Solid {
  constructor(geometry, clip) {
    this.alpha = 0;
    this.fade = null;
    this.uAlpha = { value: 0 };
    this.root = new THREE.Group();
    this.root.visible = false;
    const data = dataMaterial(clip, this.uAlpha);
    const normal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    normal.clippingPlanes = clip;
    this.mesh = new THREE.Mesh(geometry, data);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    const base = { depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc };
    const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    back.clippingPlanes = clip;
    front.clippingPlanes = clip;
    this.stencilMats = [back, front];
    this.stencils = [back, front].map((mat) => {
      const s = new THREE.Mesh(geometry, mat);
      s.renderOrder = 1;
      s.frustumCulled = false;
      s.visible = false;
      this.root.add(s);
      return s;
    });
    // the cut face: tone of the heart's cap, this solid's alpha, the cap flag
    const capData = new THREE.ShaderMaterial({
      uniforms: { uAlpha: this.uAlpha },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uAlpha; void main(){ gl_FragColor = vec4(0.85, uAlpha, 1.0, 1.0); }',
      ...STENCIL_CAP,
    });
    const capNormal = new THREE.MeshNormalMaterial({ ...STENCIL_CAP });
    this.cap = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), capData);
    this.cap.renderOrder = 2;
    this.cap.visible = false;
    this.cap.frustumCulled = false;
    this.root.add(this.cap);
    this.items = [{ mesh: this.mesh, data, normal }, { mesh: this.cap, data: capData, normal: capNormal }];
  }

  setAlpha(a) {
    this.alpha = a;
    this.uAlpha.value = a;
  }
}

/**
 * The near-field layer of plane g ({ O, d, r, n }) with a sector of half-angle half: a lobe
 * from the chest wall (wall, cm deep) to the diaphragm (bottom, cm deep), 5 cm thick about the
 * plane. Across the sector both faces are flat, as the echo draws the layer; past it the lobe
 * thickens toward the right lobe (screen-left) and thins to an edge toward the apex.
 */
function layerGeometry(g, wall, bottom, half) {
  const geo = weld(new THREE.SphereGeometry(1, 72, 36));
  const p = geo.attributes.position;
  const hv = (bottom - wall) / 2, hw = 2.5;
  const reach = bottom * Math.tan(half);   // the sector's half-width at the diaphragm
  const L = reach + 4.0, R = reach + 2.6;   // the lobe's ends, screen-left and screen-right
  // |u/h|^4 + |v/hv|^4 + (w/hw)^2 = 1 (a squircle in the plane), h the end on u's side
  const sq = (x) => Math.sign(x) * Math.sqrt(Math.abs(x));
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = sq(v.x) * (v.x < 0 ? L : R);
    // depth below the wall, scaled past the sector: deeper to the left, shallower to the right
    const f = 1 + 0.4 * ramp(-u, reach, L) - 0.7 * ramp(u, reach, R);
    const depth = wall + (sq(v.y) + 1) * hv * f;
    const q = g.O.clone().addScaledVector(g.r, u).addScaledVector(g.d, depth).addScaledVector(g.n, hw * v.z);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Liver3D {
  /**
   * heart: the model's heart (abdomen.js builds the liver from it); g4c: the subcostal
   * four-chamber plane; spec4c: its view (views.js: near, the depth of the diaphragm).
   */
  constructor(heart, g4c, spec4c) {
    this.clip = [];
    this.clipPlane = new THREE.Plane();
    this.group = new THREE.Group();
    this.group.visible = false;
    const lg = buildLiver(heart).geometry.clone();
    lg.computeVertexNormals();
    this.liver = new Solid(lg, this.clip);
    this.layer = new Solid(layerGeometry(g4c, 1.5, spec4c.near, THREE.MathUtils.degToRad(spec4c.angle / 2)), this.clip);
    this.solids = [this.liver, this.layer];
    for (const s of this.solids) this.group.add(s.root);
  }

  /** The most any solid shows (the pencil renderer skips the layer at 0). */
  get alpha() { return Math.max(this.liver.alpha, this.layer.alpha); }

  /** A new four-chamber plane (another heart): the layer follows it. */
  setPlane4c(g4c, spec4c) {
    const old = this.layer.mesh.geometry;
    const geo = layerGeometry(g4c, 1.5, spec4c.near, THREE.MathUtils.degToRad(spec4c.angle / 2));
    this.layer.mesh.geometry = geo;
    for (const s of this.layer.stencils) s.geometry = geo;
    old.dispose();
  }

  /** plane: THREE.Plane in world space (the heart's cut), or null for the whole solids. */
  setCut(plane) {
    const on = !!plane;
    if (on) this.clipPlane.copy(plane);
    const was = this.clip.length > 0;
    this.clip.length = 0;
    if (on) this.clip.push(this.clipPlane);
    for (const s of this.solids) {
      if (was !== on) {
        for (const it of s.items) { it.data.needsUpdate = true; it.normal.needsUpdate = true; }
        for (const m of s.stencilMats) m.needsUpdate = true;
      }
      for (const st of s.stencils) st.visible = on;
      s.cap.visible = on;
      if (on) {
        const p = this.clipPlane.coplanarPoint(new THREE.Vector3());
        s.cap.position.copy(p);
        s.cap.lookAt(p.clone().sub(this.clipPlane.normal));
        s.cap.updateMatrixWorld(true);
      }
    }
  }

  /** Set the alphas now: { liver, layer } (the video sets them frame by frame). */
  set(a) {
    for (const k of ['liver', 'layer']) if (k in a) { this[k].fade = null; this[k].setAlpha(a[k]); }
  }

  /** Fade toward { liver, layer } over T ms from now. */
  fadeTo(a, T = 700) {
    const now = performance.now();
    for (const k of ['liver', 'layer']) {
      if (!(k in a)) continue;
      const s = this[k];
      if (reducedMotion) { s.fade = null; s.setAlpha(a[k]); continue; }
      if ((s.fade ? s.fade.a1 : s.alpha) === a[k]) continue;
      s.fade = { a0: s.alpha, a1: a[k], t0: now, T };
    }
  }

  /** Move the fades on; true while one runs. */
  step() {
    const now = performance.now();
    let busy = false;
    for (const s of this.solids) {
      const f = s.fade;
      if (!f) continue;
      const u = Math.min(1, (now - f.t0) / f.T);
      s.setAlpha(f.a0 + (f.a1 - f.a0) * smooth(u));
      if (u >= 1) s.fade = null;
      else busy = true;
    }
    return busy;
  }
}
