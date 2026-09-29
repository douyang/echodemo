// The body key (chapter 07, Probe and body): a small figure of the patient in a corner of the 3D
// view, turned as the camera is. It shows how the body lies around the heart, the heart inside
// the chest, and the probe on the skin at the view's window with its beam toward the heart.
import * as THREE from '../../vendor/three.bundle.min.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * The probe's place on the skin for each acoustic window, in the body's own frame (cm): x from
 * the midline to the patient's left, y up from the heart's centre, z back from the front of the
 * chest. Parasternal: left sternal border, 3rd to 4th intercostal space; apical: over the apex
 * beat; subcostal: below the xiphoid; suprasternal: the notch (views.js, WINDOWS).
 */
const SITE = {
  plax: [3, 4, 0], psax: [3, 4, 0], apical: [10, -7, 3.2], sub: [0.5, -13, 1], ssn: [0, 15, 5],
};

export class BodyKey {
  /** heart: the heart's centre (world cm); the body's midline lies 2 cm to its right. */
  constructor(heart, lvAxis) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(-0.4, 0.8, 1);
    this.camera.add(light);
    this.scene.add(this.camera, new THREE.AmbientLight(0xffffff, 1.5));
    this.H = heart.clone();
    this.mid = V3(this.H.x - 2, 0, 0);
    this.front = this.H.z + 6;                       // the front of the chest, 6 cm before the heart's centre
    const zc = this.front - 10;                      // the body's centre line, front to back
    const P = (x, y, z = 0) => V3(this.mid.x + x, this.H.y + y, zc + z);
    this.body = new THREE.MeshLambertMaterial({ color: 0xd8d2c6, transparent: true, opacity: 0.55, depthWrite: false });
    this.red = new THREE.MeshBasicMaterial({ color: 0xb23a2e });
    this.probeMat = new THREE.MeshBasicMaterial({ color: 0x22272b });
    this.beamMat = new THREE.LineDashedMaterial({ color: 0x22272b, dashSize: 1.6, gapSize: 1.2 });
    const part = (geo, at, sx = 1, sy = 1, sz = 1, rot = null) => {
      const m = new THREE.Mesh(geo, this.body);
      m.position.copy(at);
      m.scale.set(sx, sy, sz);
      if (rot) m.rotation.set(...rot);
      m.renderOrder = 1;
      this.scene.add(m);
      return m;
    };
    // trunk from the pelvis to the shoulders, flatter front to back; arms at the sides
    part(new THREE.CapsuleGeometry(14, 26, 8, 24), P(0, -6), 1.12, 1, 0.68);
    part(new THREE.CapsuleGeometry(4.2, 26, 6, 12), P(-21, 0), 1, 1, 1, [0, 0, -0.12]);
    part(new THREE.CapsuleGeometry(4.2, 26, 6, 12), P(21, 0), 1, 1, 1, [0, 0, 0.12]);
    part(new THREE.CylinderGeometry(5, 5.5, 8, 16), P(0, 23));
    part(new THREE.SphereGeometry(8.5, 24, 16), P(0, 34));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4.5, 12), this.probeMat);
    nose.position.copy(P(0, 33.5, 9.8));
    nose.rotation.x = Math.PI / 2;
    this.scene.add(nose);
    // the heart inside the chest, along its long axis
    const heartM = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.red);
    heartM.scale.set(4.2, 6.2, 4.2);
    heartM.quaternion.setFromUnitVectors(V3(0, 1, 0), lvAxis.clone().normalize());
    heartM.position.copy(this.H);
    heartM.renderOrder = 2;
    this.scene.add(heartM);
    // the probe and its beam (placed by setView)
    this.probe = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 6, 16), this.probeMat);
    this.beam = new THREE.Line(new THREE.BufferGeometry(), this.beamMat);
    this.probe.renderOrder = this.beam.renderOrder = 3;
    this.scene.add(this.probe, this.beam);
    // the patient's left: a letter beside the left shoulder
    this.left = letter('L');
    this.left.position.copy(P(31, 17, 0));
    this.left.renderOrder = 4;
    this.scene.add(this.left);
    this.center = P(0, 8);
    this.radius = 31;
  }

  /** Put the probe at window win on the skin, its beam toward target (world cm). */
  setView(win, target) {
    const s = SITE[win] || SITE.plax;
    const at = V3(this.mid.x + s[0], this.H.y + s[1], this.front - s[2]);
    const dir = target.clone().sub(at).normalize();
    this.probe.position.copy(at).addScaledVector(dir, -2.5);
    this.probe.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
    this.beam.geometry.dispose();
    this.beam.geometry = new THREE.BufferGeometry().setFromPoints([at, target]);
    this.beam.computeLineDistances();
  }

  retheme(tok) {
    this.body.color.setStyle(tok.paper3 || tok.paper2);
    this.probeMat.color.setStyle(tok.ink);
    this.beamMat.color.setStyle(tok.ink);
    this.red.color.setStyle(tok.congo || '#b23a2e');
    this.left.material.color.setStyle(tok.ink);
    this.paper = tok.paper;
    this.rule = tok.rule;
  }

  /** The key's corner of a w x h view (CSS px, from the top left): the top left, under the pane's name. */
  rect(w, h) {
    const kw = Math.round(Math.max(88, Math.min(160, w * 0.27)));
    const kh = Math.round(Math.min(h * 0.62, kw * 1.25));
    return { x: 12, y: 36, w: kw, h: kh };
  }

  /** The key for this frame: its camera turned as the main camera is. */
  frame(mainCamera, w, h) {
    const r = this.rect(w, h);
    const q = mainCamera.quaternion;
    const back = V3(0, 0, 1).applyQuaternion(q);
    this.camera.position.copy(this.center).addScaledVector(back, 200);
    this.camera.quaternion.copy(q);
    const aspect = r.w / r.h, R = this.radius;
    const hw = aspect >= 1 ? R * aspect : R, hh = aspect >= 1 ? R : R / aspect;
    Object.assign(this.camera, { left: -hw, right: hw, top: hh, bottom: -hh });
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.left.quaternion.copy(q);
    return { scene: this.scene, camera: this.camera, rect: r, clear: this.paper || '#f4f1ea', border: this.rule || '#c9c3b8' };
  }
}

/** A flat letter that faces the camera (a plane turned each frame), drawn from a canvas. */
function letter(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 44px "IBM Plex Sans", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(ch, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, color: 0x22272b });
  // the letter's alpha is the canvas's: the colour comes from the material
  mat.alphaMap = tex;
  mat.map = null;
  return new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat);
}
