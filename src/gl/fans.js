// Imaging-plane fans for the Probe and body view (chapter 07, ch/windows.js) and the views video
// (video/app.js): a sector in a color, its outline and a small probe at its apex, drawn over the
// pencil heart. Where a fan runs behind the heart's front surface it is drawn fainter, so a plane
// reads as going into the heart: the fan reads the heart's depth from the pencil renderer that
// draws it (gl/pencil.js, rtNormal).
import * as THREE from '../../vendor/three.bundle.min.js';

const VS = `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uBehind;
uniform sampler2D tDepth;
uniform vec2 uRes;
void main() {
  float hd = texture2D(tDepth, gl_FragCoord.xy / uRes).r;
  float a = uAlpha * ((hd < 1.0 && gl_FragCoord.z > hd) ? uBehind : 1.0);
  gl_FragColor = vec4(uColor * a, a);
}`;

const N = 40;
let probeGeo = null;

/** The points of a fan on plane g ({ O, d, r, n }) with the view settings spec: apex, then the arc. */
export function fanVerts(g, spec) {
  const half = (spec.angle * Math.PI) / 360;
  const verts = [g.O.x, g.O.y, g.O.z];
  for (let i = 0; i <= N; i++) {
    const th = -half + (2 * half * i) / N;
    const p = g.O.clone().addScaledVector(g.d.clone().multiplyScalar(Math.cos(th)).addScaledVector(g.r, Math.sin(th)), spec.depth);
    verts.push(p.x, p.y, p.z);
  }
  return verts;
}

export class Fan {
  /**
   * A fan on plane g with the view settings spec (angle, depth), in color col ([r, g, b], 0 to 1).
   * depthTexture: the heart's depth from the renderer that draws the fan.
   */
  constructor(g, spec, col, depthTexture) {
    const verts = fanVerts(g, spec);
    const idx = [];
    for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uColor: { value: new THREE.Vector3(...col) },
        uAlpha: { value: 0.14 },
        uBehind: { value: 0.45 },
        tDepth: { value: depthTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.lmat = new THREE.LineBasicMaterial({ color: new THREE.Color(...col), transparent: true, opacity: 0.8, depthTest: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.outline = new THREE.LineLoop(lgeo, this.lmat);
    this.mesh.frustumCulled = false;
    this.outline.frustumCulled = false;
    if (!probeGeo) probeGeo = new THREE.CylinderGeometry(0.4, 0.65, 2.2, 18);
    this.probe = new THREE.Mesh(probeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), transparent: true, opacity: 0.5, depthTest: false }));
    this.mesh.renderOrder = 1;
    this.outline.renderOrder = 3;
    this.probe.renderOrder = 3;
    this.obj = new THREE.Group();
    this.obj.add(this.mesh, this.outline, this.probe);
    this.col = col;
    this.placeProbe(g);
  }

  placeProbe(g) {
    this.probe.position.copy(g.O).addScaledVector(g.d, -1.2);
    this.probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.d);
  }

  /** Move the fan onto plane g (a plane that moves, in each frame). */
  shape(g, spec) {
    const verts = fanVerts(g, spec);
    for (const m of [this.mesh, this.outline]) {
      const a = m.geometry.attributes.position;
      a.array.set(verts);
      a.needsUpdate = true;
    }
    this.placeProbe(g);
  }

  setColor(col) {
    this.col = col;
    this.mat.uniforms.uColor.value.set(...col);
    this.lmat.color.setRGB(...col);
    this.probe.material.color.setRGB(...col);
  }

  /** The drawing size (device px) the depth texture is read at. */
  setRes(w, h) { this.mat.uniforms.uRes.value.set(w, h); }

  dispose() {
    this.obj.removeFromParent();
    this.mesh.geometry.dispose();
    this.outline.geometry.dispose();
    this.mat.dispose();
    this.lmat.dispose();
    this.probe.material.dispose();
  }
}

/**
 * The segment where the fans of planes A and B (settings sa, sb: angle, depth) cross, or null
 * (parallel, or the line misses a fan).
 */
export function crossing(A, sa, B, sb) {
  const L = new THREE.Vector3().crossVectors(A.n, B.n);
  if (L.lengthSq() < 1e-3) return null;
  L.normalize();
  const cA = A.n.dot(A.O), cB = B.n.dot(B.O), k = A.n.dot(B.n), det = 1 - k * k;
  const P0 = A.n.clone().multiplyScalar((cA - cB * k) / det).addScaledVector(B.n, (cB - cA * k) / det);
  let lo = -Infinity, hi = Infinity;
  for (const [g, spec] of [[A, sa], [B, sb]]) {
    const q = P0.clone().sub(g.O);
    const u0 = q.dot(g.r), v0 = q.dot(g.d), du = L.dot(g.r), dv = L.dot(g.d);
    const tn = Math.tan((spec.angle * Math.PI) / 360);
    // inside the sector: |u| <= v tan(half)
    for (const [s0, s1] of [[u0 - v0 * tn, du - dv * tn], [-u0 - v0 * tn, -du - dv * tn]]) {
      if (Math.abs(s1) < 1e-9) { if (s0 > 0) return null; continue; }
      const t = -s0 / s1;
      if (s1 > 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
    }
    // inside the depth: u^2 + v^2 <= depth^2
    const qa = du * du + dv * dv, qb = 2 * (u0 * du + v0 * dv), qc = u0 * u0 + v0 * v0 - spec.depth * spec.depth;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) return null;
    const r = Math.sqrt(disc);
    lo = Math.max(lo, (-qb - r) / (2 * qa));
    hi = Math.min(hi, (-qb + r) / (2 * qa));
    if (lo >= hi) return null;
  }
  return { a: P0.clone().addScaledVector(L, lo), b: P0.clone().addScaledVector(L, hi), dir: L };
}

/** A color as [r, g, b] (0 to 1) from a hex string (#rgb or #rrggbb). */
export function rgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}
