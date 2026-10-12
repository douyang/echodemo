// Chapter TEE, the 3D pane: the esophagus as a tube behind the heart, the probe in it, drawn in
// pencil with the heart (a stage tool, as gl/probe3d.js is), and the imaging fan (gl/fans.js).
// The esophagus is an overlay, as the fans are: tinted, fainter where it runs behind the heart.
import * as THREE from '../../vendor/three.bundle.min.js';
import { pencilMaterials } from './heart.js';
import { TOOL } from './probe3d.js';
import { R_ESO, HEAD, shaftLine } from '../teeviews.js';

const VS = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
// the tube's rim reads more than its face (a glass tube): alpha grows toward the silhouette
const FS = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uBehind;
uniform sampler2D tDepth;
uniform vec2 uRes;
varying vec3 vN;
varying vec3 vV;
void main() {
  float hd = texture2D(tDepth, gl_FragCoord.xy / uRes).r;
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = uAlpha * (0.35 + 0.65 * rim * rim) * ((hd < 1.0 && gl_FragCoord.z > hd) ? uBehind : 1.0);
  gl_FragColor = vec4(uColor * a, a);
}`;

/** A rounded box: lofted rounded rectangles along y from 0 (the tip's end) to len. */
function headGeometry() {
  const { len, wide, thick } = HEAD;
  const M = 28, rows = [];
  const ys = [0, 0.12, 0.35, 0.7, len - 0.6, len];
  const scale = [0.55, 0.82, 0.95, 1, 1, 0.8];
  for (const [k, y] of ys.entries()) {
    const ring = [];
    for (let i = 0; i < M; i++) {
      const a = (i / M) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const x = (wide / 2) * scale[k] * Math.sign(c) * Math.abs(c) ** 0.5, z = (thick / 2) * scale[k] * Math.sign(s) * Math.abs(s) ** 0.5;
      ring.push([x, y, z]);
    }
    rows.push(ring);
  }
  const pos = [], idx = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < M; i++) {
    const a = j * M + i, b = j * M + ((i + 1) % M), c = a + M, d = b + M;
    idx.push(a, c, b, b, c, d);
  }
  const c0 = pos.length / 3;
  pos.push(0, 0, 0);
  for (let i = 0; i < M; i++) idx.push(c0, i, (i + 1) % M);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class TeeScene {
  /** stage: the shared Stage3D; color: the esophagus tint (#rrggbb). */
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();       // overlay: the esophagus
    this.group.visible = false;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.75, 0.42, 0.42) },
        uAlpha: { value: 0.42 },
        uBehind: { value: 0.4 },
        tDepth: { value: stage.pencil.rtNormal.depthTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.tube = null;
    stage.overlayScene.add(this.group);
    // the probe, in pencil: a dark shaft, a paler head with its window toward the beam
    const shaftM = pencilMaterials(TOOL, 0x5a5a5a), headM = pencilMaterials(TOOL, 0xbdbdbd), winM = pencilMaterials(TOOL, 0x7c7c7c);
    this.probe = new THREE.Group();
    this.probe.visible = false;
    this.shaft = new THREE.Mesh(new THREE.BufferGeometry(), shaftM.data);
    this.head = new THREE.Mesh(headGeometry(), headM.data);
    const win = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), winM.data);
    win.rotation.x = Math.PI / 2;      // its axis along the beam (+z of the head)
    win.position.set(0, HEAD.len * HEAD.win, HEAD.thick / 2 - 0.02);
    this.head.add(win);
    this.headRoot = new THREE.Group();
    this.headRoot.add(this.head);
    this.probe.add(this.shaft, this.headRoot);
    stage.scene.add(this.probe);
    this.items = [
      { mesh: this.shaft, data: shaftM.data, normal: shaftM.normal },
      { mesh: this.head, data: headM.data, normal: headM.normal },
      { mesh: win, data: winM.data, normal: winM.normal },
    ];
    stage.tools.push(...this.items);
    // the head again in the overlay, as the tube is drawn: where the heart hides the head, its
    // outline still shows through, fainter
    this.ghostMat = this.mat.clone();   // its own uniforms; the same depth texture
    this.ghostMat.uniforms.tDepth.value = stage.pencil.rtNormal.depthTexture;
    this.ghostMat.uniforms.uAlpha.value = 0.75;
    this.ghostMat.uniforms.uBehind.value = 0.55;
    this.ghost = new THREE.Mesh(this.head.geometry, this.ghostMat);
    this.group.add(this.ghost);
    this.key = '';
  }

  /** The esophagus of the heart shown (teeviews.js esophagus): a tube along its centre line. */
  setEsophagus(E) {
    if (this.tube) { this.tube.geometry.dispose(); this.group.remove(this.tube); }
    this.tube = new THREE.Mesh(new THREE.TubeGeometry(E.tube || E.curve, 120, R_ESO, 20, false), this.mat);
    this.tube.frustumCulled = false;
    this.group.add(this.tube);
  }

  /**
   * The probe for frame f ({ O, F, t, u }) on the probe's path (teeviews.js probePath): the head's
   * window at O facing F, its long axis along u, the array (at 0 degrees) along t; the shaft down
   * the path and into the head through its bending section (teeviews.js shaftLine).
   */
  setProbe(f, path) {
    const key = `${f.O.toArray().map((x) => x.toFixed(3))}|${f.F.toArray().map((x) => x.toFixed(3))}|${f.u.toArray().map((x) => x.toFixed(3))}`;
    if (key === this.key) return;
    this.key = key;
    // the head: its window (0.55 of its length from the tip's end) on O, set back half its thickness
    const centre = f.O.clone().addScaledVector(f.F, -HEAD.thick / 2).addScaledVector(f.u, -HEAD.len * HEAD.win);
    this.headRoot.position.copy(centre);
    this.headRoot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, f.u, f.F));
    this.ghost.position.copy(centre);
    this.ghost.quaternion.copy(this.headRoot.quaternion);
    // the shaft: down the path, then bending into the head's upper end along the head's axis
    const curve = new THREE.CatmullRomCurve3(shaftLine(path, f), false, 'centripetal');
    this.shaft.geometry.dispose();
    this.shaft.geometry = new THREE.TubeGeometry(curve, Math.max(160, Math.ceil(curve.getLength() / 0.15)), 0.5, 12, false);
  }

  /** Show the scene (the chapter's frames) or hide it. */
  show(on) {
    this.group.visible = on;
    this.probe.visible = on;
  }

  /** The drawing size (device px) the depth texture is read at. */
  setRes(w, h) {
    this.mat.uniforms.uRes.value.set(w, h);
    this.ghostMat.uniforms.uRes.value.set(w, h);
  }

  /** The tube's tint and the head's outline color ([r, g, b], 0 to 1). */
  setColor(tube, head) {
    this.mat.uniforms.uColor.value.set(...tube);
    if (head) this.ghostMat.uniforms.uColor.value.set(...head);
  }
}
