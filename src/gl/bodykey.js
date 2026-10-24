// The body key (Views, Probe and body): the patient in a corner of the 3D view, turned as
// the camera is, drawn in pencil like the heart (pencil.js, renderInset). The body is an outline:
// inside it beats the model's own heart in red pencil, placed as it lies in the chest, and the
// probe sits on the skin at the view's window with its sector toward the heart. The torso and its
// skin are torso.js's; the free probe of Views slides over that skin.
import * as THREE from '../../vendor/three.bundle.min.js';
import { pencilProbe, placeProbe, PROBE_TAIL } from './probe3d.js';
import { pencilMaterials } from './heart.js';
import { RINGS, FRONT_N, SIDE_N, spline, section, placeTorso, Skin } from '../torso.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The left arm's centre line (dx from the midline, dy, z as in RINGS) and radius, cm. */
const ARM = [
  [16.8, -4.5, -13.4, 4.6], [19.2, -9, -13.5, 4.9], [20.2, -18, -13.6, 4.3], [20.9, -28, -13.8, 3.8],
  [21.2, -33, -13.7, 3.6], [21.4, -41, -13.0, 3.9], [21.3, -53, -12.2, 2.9], [21.1, -58, -11.8, 2.6],
];

/**
 * The probe's place on the skin for each acoustic window: cm from the midline to the patient's
 * left, and from the jugular notch (views.js, WINDOWS). Parasternal: left sternal border, 3rd to
 * 4th intercostal space; apical: over the apex, 5th space between the mid-clavicular and anterior
 * axillary lines; subcostal: below the xiphoid; suprasternal: the notch.
 */
const SITE = { plax: [2.6, -10], psax: [2.6, -10], apical: [11.5, -20.5], sub: [0.8, -23], ssn: [0, 0.8] };

/** A mesh from a grid of rows x M points that closes round, with a cap at each end. */
function gridMesh(rows, M) {
  const pos = [], idx = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  const R = rows.length;
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = a + M, e = b + M;
      idx.push(a, b, c, b, e, c);
    }
  }
  const ends = [rows[0], rows[R - 1]].map((r) => r.reduce((s, p) => s.add(p), V3()).divideScalar(M));
  const c0 = pos.length / 3;
  pos.push(ends[0].x, ends[0].y, ends[0].z, ends[1].x, ends[1].y, ends[1].z);
  for (let k = 0; k < M; k++) {
    const k2 = (k + 1) % M;
    idx.push(c0, k2, k, c0 + 1, (R - 1) * M + k, (R - 1) * M + k2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WARM = 0.6;   // the pencil composite's flag for red pencil

export class BodyKey {
  /**
   * myo: the heart's myocardium mesh (the key shares its geometry and beat); anat: the model's
   * landmarks. The body is laid round the heart: the apex 8.5 cm left of the midline, the aortic
   * valve 12 cm below the jugular notch, the front of the heart 2.4 cm under the skin.
   */
  constructor(myo, anat) {
    this.src = myo;
    this.scene = new THREE.Scene();
    // a long lens, so the pencil edges read depth as they do on the heart; lit as the stage is
    this.camera = new THREE.PerspectiveCamera(20, 1, 140, 260);
    const key = new THREE.DirectionalLight(0xffffff, 2.9);
    key.position.set(-0.55, 0.75, 0.6);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(0.8, -0.2, -0.5);
    this.camera.add(key, rim);
    this.scene.add(this.camera, new THREE.AmbientLight(0xffffff, 0.95));
    Object.assign(this, placeTorso(myo, anat));
    this.skin = new Skin(this);
    const W = (dx, dy, z) => V3(this.xm + dx, this.yN + dy, this.zF + z);

    // the torso: splined cross-sections, 1.2 cm apart
    this.rows = spline(RINGS, (p, q) => Math.max(1, Math.ceil(Math.abs(p[0] - q[0]) / 1.2)));
    const M = 64;
    const torso = this.rows.map((r) => Array.from({ length: M }, (_, k) => {
      const [x, z] = section(r, (k / M) * Math.PI * 2);
      return W(x, r[0], z);
    }));
    const parts = [gridMesh(torso, M)];
    // the arms: tubes along the centre lines, mirrored
    for (const side of [1, -1]) {
      const line = spline(ARM, (p, q) => Math.max(2, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1.5)));
      const pts = line.map(([dx, dy, z]) => W(side * dx, dy, z));
      const rings = pts.map((p, i) => {
        const t = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
        const u = V3(0, 0, 1).addScaledVector(t, -t.z).normalize(), v = new THREE.Vector3().crossVectors(t, u);
        return Array.from({ length: 24 }, (_, k) => {
          const a = (k / 24) * Math.PI * 2;
          return p.clone().addScaledVector(u, line[i][3] * Math.cos(a)).addScaledVector(v, line[i][3] * Math.sin(a));
        });
      });
      parts.push(gridMesh(rings, 24));
    }
    // the head: an egg, narrower and set forward at the jaw, with a nose and ears
    const hc = W(0, 21.8, -11.2);
    const head = new THREE.SphereGeometry(1, 48, 32);
    const hp = head.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const jaw = THREE.MathUtils.smoothstep(-y, 0.1, 0.95);
      x *= 7.6 * (1 - 0.3 * jaw);
      z *= 9.9 * (z < 0 ? 1 - 0.45 * jaw : 1);
      z += 3.0 * jaw;
      hp.setXYZ(i, hc.x + x, hc.y + y * 11.6, hc.z + z);
    }
    head.computeVertexNormals();
    parts.push(head);
    const nose = new THREE.BufferGeometry();
    const f = 9.5;
    nose.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 1.6, f - 0.3, -1.2, -2.4, f - 0.4, 0, -1.6, f + 2.1, 1.2, -2.4, f - 0.4,
    ].map((v, i) => v + [hc.x, hc.y - 1, hc.z][i % 3]), 3));
    nose.setIndex([0, 1, 2, 0, 2, 3, 1, 3, 2]);
    parts.push(nose.toNonIndexed());
    parts[parts.length - 1].computeVertexNormals();
    for (const side of [1, -1]) {
      const ear = new THREE.SphereGeometry(1, 16, 12);
      ear.scale(0.55, 3.1, 1.9);
      ear.rotateY(-side * 0.45);   // the back of the ear stands out from the head
      ear.rotateX(-0.18);
      ear.translate(hc.x + side * 7.9, hc.y - 0.6, hc.z - 0.9);
      parts.push(ear);
    }
    // the body: an outline only (the pencil inset's third pass), so the heart shows inside it
    this.outlineNormal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    this.outline = parts.map((g) => new THREE.Mesh(g, this.outlineNormal));
    this.scene.add(...this.outline);

    // the heart: the model's own mesh, beating with it, in red pencil
    const H = pencilMaterials(WARM, 0xdadada);
    this.heart = new THREE.Mesh(myo.geometry, H.data);
    this.scene.add(this.heart);
    this.solids = [{ mesh: this.heart, data: H.data, normal: H.normal }];

    // the probe on the skin and its sector (placed by setView), in graphite
    const P = pencilProbe();
    this.probe = P.group;
    this.cable = new THREE.Mesh(new THREE.BufferGeometry(), P.cable.data);
    this.solids.push(...P.items, { mesh: this.cable, data: P.cable.data, normal: P.cable.normal });
    this.fanMat = new THREE.MeshBasicMaterial({ color: 0x1f262b, transparent: true, opacity: 0.16, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.fanLineMat = new THREE.LineBasicMaterial({ color: 0x1f262b, transparent: true, opacity: 0.7, depthTest: false });
    this.fan = new THREE.Mesh(new THREE.BufferGeometry(), this.fanMat);
    this.fanLine = new THREE.LineLoop(new THREE.BufferGeometry(), this.fanLineMat);
    this.fan.renderOrder = 4;
    this.fanLine.renderOrder = 5;
    this.scene.add(this.probe, this.cable, this.fan, this.fanLine);

    // the patient's left: a letter beside the left shoulder
    this.left = letter('L');
    this.left.position.copy(W(28, 3, -13));
    this.left.renderOrder = 6;
    this.scene.add(this.left);
    this.flat = [this.fan, this.fanLine, this.left];
    this.center = W(0, -1.5, -12.5);
    this.radius = 37;
  }

  /** The point on the skin for window win (SITE), on the front of the body. */
  site(win) {
    const [dx, dy] = SITE[win] || SITE.plax;
    const rows = this.rows;
    let i = 0;
    while (i < rows.length - 2 && rows[i + 1][0] > dy) i++;
    const t = THREE.MathUtils.clamp((rows[i][0] - dy) / (rows[i][0] - rows[i + 1][0]), 0, 1);
    const r = rows[i].map((v, k) => v + (rows[i + 1][k] - v) * t);
    const zc = (r[2] + r[3]) / 2, h = (r[2] - r[3]) / 2;
    const u = Math.min(0.999, Math.abs(dx) / r[1]) ** SIDE_N;
    return V3(this.xm + dx, this.yN + dy, this.zF + zc + h * (1 - u) ** (1 / FRONT_N));
  }

  /**
   * Put the probe at window win on the skin, its beam toward target (world cm), its marker
   * toward r; the sector spec.angle wide and spec.depth deep. shift: the free probe's move over
   * the skin (Views, world cm), from the window's place; the probe stays on the skin.
   */
  setView(win, target, r, spec = {}, shift = null) {
    const at = this.site(win);
    if (shift) this.skin.onSkin(at.add(shift));
    const dir = target.clone().sub(at).normalize();
    placeProbe(this.probe, at, dir, r);
    // the cable leaves along the handle, then hangs
    const out = dir.clone().negate(), down = V3(0, -1, 0), tail = at.clone().addScaledVector(out, PROBE_TAIL);
    const path = new THREE.CatmullRomCurve3([
      tail, tail.clone().addScaledVector(out, 2.2), tail.clone().addScaledVector(out, 4).addScaledVector(down, 1.8),
      tail.clone().addScaledVector(out, 5).addScaledVector(down, 6), tail.clone().addScaledVector(out, 5.4).addScaledVector(down, 12),
    ]);
    this.cable.geometry.dispose();
    this.cable.geometry = new THREE.TubeGeometry(path, 32, 0.22, 8, false);
    const u = r.clone().addScaledVector(dir, -r.dot(dir)).normalize();
    const half = THREE.MathUtils.degToRad((spec.angle || 90) / 2), D = spec.depth || 16;
    const pts = [at.x, at.y, at.z], N = 32, idx = [];
    for (let i = 0; i <= N; i++) {
      const th = -half + (2 * half * i) / N;
      const p = at.clone().addScaledVector(dir, D * Math.cos(th)).addScaledVector(u, D * Math.sin(th));
      pts.push(p.x, p.y, p.z);
      if (i) idx.push(0, i, i + 1);
    }
    for (const m of [this.fan, this.fanLine]) {
      m.geometry.dispose();
      m.geometry = new THREE.BufferGeometry();
      m.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    }
    this.fan.geometry.setIndex(idx);
  }

  retheme(tok) {
    // the drawing takes the page's ink and red from the pencil composite; these are the flat marks
    const ink = new THREE.Color(tok.ink || '#1f262b');
    this.fanMat.color.copy(ink);
    this.fanLineMat.color.copy(ink);
    this.left.material.color.copy(ink);
    this.paper = tok.paper;
    this.rule = tok.rule;
  }

  /** The key's corner of a w x h view (CSS px, from the top left): the top left, under the pane's name. */
  rect(w, h) {
    // 30% of the pane's width, 96 to 190 px; a pane under 213 px wide (Views' left pane in a small figure) keeps 55% of its width for the heart
    const kw = Math.round(Math.max(Math.min(96, w * 0.45), Math.min(190, w * 0.3)));
    const kh = Math.round(Math.min(h * 0.6, kw * 1.3));
    return { x: 12, y: 36, w: kw, h: kh };
  }

  /** The key for this frame: its camera turned as the main camera is, the heart at its beat. */
  frame(mainCamera, w, h) {
    this.heart.morphTargetInfluences = this.src.morphTargetInfluences;
    this.heart.morphTargetDictionary = this.src.morphTargetDictionary;
    const r = this.rect(w, h);
    const q = mainCamera.quaternion;
    const back = V3(0, 0, 1).applyQuaternion(q), D = 200;
    this.camera.position.copy(this.center).addScaledVector(back, D);
    this.camera.quaternion.copy(q);
    this.camera.aspect = r.w / r.h;
    this.camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(this.radius / D));
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.left.quaternion.copy(q);
    // seen from behind, the probe on the chest is out of sight: the outline body would not hide it
    this.probe.visible = this.cable.visible = back.z > -0.25;
    return {
      scene: this.scene, camera: this.camera, rect: r, clear: this.paper || '#e2e4e3', border: this.rule || '#a9aeac',
      pencil: { solids: this.solids, outline: this.outline, outlineNormal: this.outlineNormal, flat: this.flat, ink: 0.72 },
    };
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
  // the letter's alpha is the canvas's: the colour comes from the material
  const mat = new THREE.MeshBasicMaterial({ alphaMap: tex, transparent: true, depthTest: false, color: 0x1f262b });
  return new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat);
}
