// The Blender heart in three.js: morph control, cut plane with stencil caps,
// and landmarks for labels and echo views.
import * as THREE from '../../vendor/three.bundle.min.js';
import { GLTFLoader, MeshoptDecoder } from '../../vendor/three.bundle.min.js';

// chordae take the valve color without contour slices; the papillary muscles are muscle
const FLAG = { Myocardium: 0.0, Coronaries: 0.5, MitralValve: 0.25, TricuspidValve: 0.25, AorticValve: 0.25, PulmonaryValve: 0.25, MitralChordae: 0.28, TricuspidChordae: 0.28, Papillary: 0.0, Probe: 0.75 };
const VALVES = ['MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve'];
// meshes of the detailed valve model (draft 2), and the drive that moves each
const DRIVE = { MitralValve: 'mv', MitralChordae: 'mv', TricuspidValve: 'tv', TricuspidChordae: 'tv', AorticValve: 'av', PulmonaryValve: 'pv' };
const SOLIDS = ['Myocardium', 'Papillary'];   // closed meshes that get a cap where the plane cuts them

/**
 * Morph weights for a mesh with three leaflet shapes (base, leaflets_mid, leaflets).
 * x from the drive (or v without one) runs base -> mid -> far, so a leaflet swings on an arc.
 * The _a, _s and _as keys give each state of burden a and systole s its own leaflet shapes.
 */
export function leafletWeights(name, v, drive, a = 0, s = 0) {
  const x = drive && DRIVE[name] ? drive[DRIVE[name]] : v;
  const m = x < 0.5 ? 2 * x : 2 * (1 - x), f = Math.max(0, 2 * x - 1);
  return {
    leaflets_mid: m, leaflets_mid_a: a * m, leaflets_mid_s: s * m, leaflets_mid_as: a * s * m,
    leaflets: f, leaflets_a: a * f, leaflets_s: s * f, leaflets_as: a * s * f,
  };
}

// Lambert shading packed into (tone, region, flag, 1) for the pencil composite.
function dataMaterial(flag, vertexColors, clipping) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors, side: THREE.DoubleSide });
  m.clippingPlanes = clipping;
  m.userData.flag = flag;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlag = { value: flag };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlag;')
      .replace('#include <color_fragment>', '')
      .replace('#include <opaque_fragment>', `
        float tone = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
        #ifdef USE_COLOR
          float region = vColor.r;
        #else
          float region = 0.0;
        #endif
        gl_FragColor = vec4(tone, region, uFlag, 1.0);`)
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
  };
  m.customProgramCacheKey = () => `pencil-data-${flag}-${vertexColors}`;
  return m;
}

function normalMaterial(clipping) {
  const m = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  m.clippingPlanes = clipping;
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

async function parseGlb(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`heart model: HTTP ${res.status}`);
  // the published copy ships the binary glTF as base64 in JSON
  let buf;
  if (url.endsWith('.json')) {
    const bin = atob((await res.json()).glb);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf = u8.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}

/** opts.valves: a model whose meshes replace the heart's valves (and add chordae and muscles). */
export async function loadHeart(url, opts = {}) {
  const [gltf, extra] = await Promise.all([parseGlb(url), opts.valves ? parseGlb(opts.valves) : null]);
  if (extra) {
    const add = [];
    extra.scene.traverse((o) => { if (o.isMesh) add.push(o); });
    const names = new Set(add.map((o) => o.name));
    const drop = [];
    gltf.scene.traverse((o) => { if (o.isMesh && names.has(o.name)) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
    for (const o of add) gltf.scene.add(o);   // both models share one frame
  }
  return new Heart(gltf.scene);
}

export class Heart {
  constructor(root) {
    this.group = new THREE.Group();
    this.group.add(root);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.clip = [];            // shared array: empty = no cut
    this.items = [];           // {mesh, data, normal}
    this.meshes = {};
    this.state = { a: 0, s: 0, v: 0 };
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      this.meshes[o.name] = o;
      o.frustumCulled = false;
    });
    const peri = this.meshes.Pericardium;
    for (const [name, mesh] of Object.entries(this.meshes)) {
      if (name === 'Pericardium') continue;
      const vc = !!mesh.geometry.attributes.color;
      const it = { mesh, data: dataMaterial(FLAG[name] ?? 0, vc, this.clip), normal: normalMaterial(this.clip) };
      mesh.material = it.data;
      this.items.push(it);
    }
    this.peri = peri || null;
    if (peri) {
      this.periNormal = normalMaterial(this.clip);
      peri.material = this.periNormal;
    }
    this._buildCaps();
    this.setState(0, 0, 0);
  }

  _buildCaps() {
    const base = { depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc };
    const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    back.clippingPlanes = this.clip;
    front.clippingPlanes = this.clip;
    this.stencilMats = [back, front];
    this.stencils = [];
    for (const name of SOLIDS) {
      const solid = this.meshes[name];
      if (!solid) continue;
      for (const mat of [back, front]) {
        const s = new THREE.Mesh(solid.geometry, mat);
        s.morphTargetInfluences = solid.morphTargetInfluences;
        s.morphTargetDictionary = solid.morphTargetDictionary;
        s.renderOrder = 1;
        s.frustumCulled = false;
        s.matrixAutoUpdate = false;
        s.visible = false;
        solid.add(s);
        this.stencils.push(s);
      }
    }
    const capData = new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.85, 0.1, 1.0, 1.0); }',
      ...STENCIL_CAP,
    });
    const capNormal = new THREE.MeshNormalMaterial({ ...STENCIL_CAP });
    this.cap = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), capData);
    this.cap.renderOrder = 2;
    this.cap.visible = false;
    this.cap.frustumCulled = false;
    this.group.add(this.cap);
    this.items.push({ mesh: this.cap, data: capData, normal: capNormal });
  }

  /**
   * a = amyloid burden, s = systolic phase, v = leaflet phase (valves);
   * drive = {mv, tv, av, pv} for the detailed valves (null: v moves them all).
   */
  setState(a, s, v = s, drive = null) {
    this.state = { a, s, v, drive };
    for (const [name, mesh] of Object.entries(this.meshes)) {
      const dict = mesh.morphTargetDictionary;
      const inf = mesh.morphTargetInfluences;
      if (!dict || !inf) continue;
      if (dict.amyloid !== undefined) inf[dict.amyloid] = a;
      if (dict.systole !== undefined) inf[dict.systole] = s;
      if (dict.amyloid_systole !== undefined) inf[dict.amyloid_systole] = a * s;
      if (dict.leaflets_mid !== undefined) {
        for (const [key, w] of Object.entries(leafletWeights(name, v, drive, a, s))) {
          if (dict[key] !== undefined) inf[dict[key]] = w;
        }
      } else if (dict.leaflets !== undefined) inf[dict.leaflets] = VALVES.includes(name) ? v : 0;
    }
  }

  /** plane: THREE.Plane in world space, or null for the whole heart. */
  setCut(plane) {
    const on = !!plane;
    if (on) this.clipPlane.copy(plane);
    const was = this.clip.length > 0;
    this.clip.length = 0;
    if (on) this.clip.push(this.clipPlane);
    if (was !== on) {
      for (const it of this.items) { it.data.needsUpdate = true; it.normal.needsUpdate = true; }
      if (this.periNormal) this.periNormal.needsUpdate = true;
      for (const m of this.stencilMats) m.needsUpdate = true;
    }
    for (const s of this.stencils) s.visible = on;
    this.cap.visible = on;
    if (on) {
      const p = this.clipPlane.coplanarPoint(new THREE.Vector3());
      this.cap.position.copy(p);
      this.cap.lookAt(p.clone().sub(this.clipPlane.normal));
      this.cap.updateMatrixWorld(true);
    }
  }

  setPericardium(v) { if (this.peri) this.peri.visible = v; }
}

// ----------------------------------------------------------------------------
// Landmarks: bilinear blend of the four corner states in anatomy.json (cm).
// ----------------------------------------------------------------------------
export class Anatomy {
  constructor(doc) {
    this.doc = doc;
    const f = doc.frame;
    this.axis = new THREE.Vector3(...f.lv_axis).normalize();
    this.lateral = new THREE.Vector3(...f.lateral).normalize();
    this.anterior = new THREE.Vector3(...f.anterior).normalize();
    this.aorticRoot = new THREE.Vector3(...f.aortic_root).normalize();
  }
  point(name, a, s) {
    const c = this.doc.corners;
    const get = (k) => new THREE.Vector3(...c[k].landmarks[name]);
    const n = get('normal_ed').multiplyScalar((1 - a) * (1 - s))
      .add(get('normal_es').multiplyScalar((1 - a) * s))
      .add(get('amyloid_ed').multiplyScalar(a * (1 - s)))
      .add(get('amyloid_es').multiplyScalar(a * s));
    return n;
  }
  /** Named anchors for labels, in world space (cm). p = patient(a). */
  anchors(a, s, p) {
    const mm = 0.1;
    const lvEq = this.point('lv_eq', a, s);
    const lvid = (s > 0.5 ? p.lvids : p.lvid) * mm;
    const sep = this.lateral.clone().multiplyScalar(-1);
    const out = {
      lv: lvEq.clone(),
      septum: lvEq.clone().addScaledVector(sep, lvid / 2 + p.ivs * mm / 2),
      lvWall: lvEq.clone().addScaledVector(this.lateral, lvid / 2 + p.pw * mm / 2),
      rv: lvEq.clone().addScaledVector(sep, lvid / 2 + p.ivs * mm + 1.3),
      effusion: lvEq.clone().addScaledVector(this.lateral, lvid / 2 + p.pw * mm + 0.09 + p.effusion * mm / 2),
      apex: this.point('apex_epi', a, s),
      la: this.point('la_c', a, s),
      ra: this.point('ra_c', a, s),
      mv: this.point('mv', a, s),
      tv: this.point('tv', a, s),
      av: this.point('av', a, s),
      pv: this.point('pv', a, s),
    };
    out.ias = out.la.clone().lerp(out.ra, 0.5);
    out.aorta = out.av.clone().addScaledVector(this.aorticRoot, 3.2);
    out.pa = out.pv.clone().addScaledVector(new THREE.Vector3(0.35, 0.76, -0.55).normalize(), 2.2);
    out.center = out.lv.clone().lerp(out.av, 0.35);
    return out;
  }
  /** Four-chamber plane through the apex and both AV valve centers. */
  a4cPlane(a = 0) {
    const apex = this.point('apex_epi', a, 0), mv = this.point('mv', a, 0), tv = this.point('tv', a, 0);
    const n = new THREE.Vector3().subVectors(mv, apex).cross(new THREE.Vector3().subVectors(tv, apex)).normalize();
    // keep the posterior half: normal points posteriorly (-anterior)
    if (n.dot(this.anterior) > 0) n.negate();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, apex);
  }
  saxPlane(a = 0) {
    const eq = this.point('lv_eq', a, 0);
    const mv = this.point('mv', a, 0);
    const p = eq.clone().lerp(mv, 0.22);
    // keep the basal half; the camera looks at the cut from the apex
    return new THREE.Plane().setFromNormalAndCoplanarPoint(this.axis.clone(), p);
  }
}
