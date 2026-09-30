// Shared WebGL stage: the heart with the imaging plane (chapter 07 Windows).
import * as THREE from '../../vendor/three.bundle.min.js';
import { Pencil } from './pencil.js';
import { loadModel } from '../model3d.js';
import { cycleAt, RR } from '../cyclemodel.js';
import { tokens } from '../sketch.js';
import { reducedMotion } from '../state.js';

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Minimal trackball: drag to rotate about the camera's own axes, wheel or
 * pinch to zoom. Unlike OrbitControls it keeps whatever up vector a preset set.
 */
class Trackball {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3();
    this.minDistance = 1;
    this.maxDistance = 1000;
    this.vel = { x: 0, y: 0 };
    this.pointers = new Map();
    this.listeners = new Set();
    this.pinch = 0;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      for (const fn of this.listeners) fn();
    });
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        this.vel.x = (e.clientX - p.x) * 0.0085;
        this.vel.y = (e.clientY - p.y) * 0.0085;
        this.rotate(this.vel.x, this.vel.y);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [c, d] = [...this.pointers.values()];
        const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0 > 0) this.zoom(d0 / d1);
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = (e) => { this.pointers.delete(e.pointerId); };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }
  onStart(fn) { this.listeners.add(fn); }
  rotate(dx, dy) {
    const cam = this.camera;
    const off = cam.position.clone().sub(this.target);
    const up = cam.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(off, up).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(up, -dx)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, -dy));
    off.applyQuaternion(q);
    cam.up.applyQuaternion(q).normalize();
    cam.position.copy(this.target).add(off);
    cam.lookAt(this.target);
  }
  zoom(f) {
    const cam = this.camera;
    const off = cam.position.clone().sub(this.target);
    const L = Math.min(this.maxDistance, Math.max(this.minDistance, off.length() * f));
    cam.position.copy(this.target).addScaledVector(off.normalize(), L);
  }
  update() {
    if (this.pointers.size === 0 && (Math.abs(this.vel.x) > 1e-4 || Math.abs(this.vel.y) > 1e-4)) {
      this.vel.x *= 0.9;
      this.vel.y *= 0.9;
      this.rotate(this.vel.x, this.vel.y);
    }
    this.camera.lookAt(this.target);
  }
}

export class Stage3D {
  /** opts.Renderer: a class with the Pencil interface. */
  constructor(opts = {}) {
    this.pencil = new (opts.Renderer || Pencil)();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
    this.camera.position.set(0, 0, 40);
    const key = new THREE.DirectionalLight(0xffffff, 2.9);
    key.position.set(-0.55, 0.75, 0.6);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(0.8, -0.2, -0.5);
    this.camera.add(key, rim);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    this.overlayScene = new THREE.Scene();
    this.host = null;
    this.running = false;
    this.clock = 0;
    this.phase = 0;
    this.mode = 'remodel';
    // look: draft 2 only, 0 line, 1 mass, 2 detail, 3 reality
    this.opts = { a: 0, beat: true, peri: true, cut: 'a4c', labels: true, look: 0 };
    this.onFrame = null;
    this.inset = null;    // a key in a corner (gl/bodykey.js): frame(camera, w, h) -> { scene, camera, rect }
    this.tween = null;
    this.ready = this._load();
  }

  async _load() {
    const { heart, anat, doc } = await loadModel();
    this.heart = heart;
    this.anat = anat;
    this.doc = doc;
    this.scene.add(heart.group);
    const box = new THREE.Box3().setFromObject(heart.meshes.Myocardium);
    this.center = box.getCenter(new THREE.Vector3());
    this.radius = box.getSize(new THREE.Vector3()).length() / 2;
    this.controls = new Trackball(this.camera, this.pencil.canvas);
    this.controls.minDistance = this.radius * 1.2;
    this.controls.maxDistance = this.radius * 5;
    this.controls.target.copy(this.center);
    this.controls.onStart(() => { this.tween = null; this.controls.vel = { x: 0, y: 0 }; });
    this.lvCenter = this.anat.point('lv_eq', 0, 0).lerp(this.anat.point('mv', 0, 0), 0.25);
    this.pencil.setTheme(tokens());
    if (this.pencil.setModel) this.pencil.setModel(this);
    return this;
  }

  attach(host) {
    if (this.host === host) return;
    this.host = host;
    host.appendChild(this.pencil.canvas);
    this.resize();
  }

  resize() {
    if (!this.host) return;
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.pencil.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  retheme() { this.pencil.setTheme(tokens()); }

  start() {
    if (this.running) return;
    this.running = true;
    // a stop and a start in one frame must not leave two loops running
    const gen = (this.gen = (this.gen || 0) + 1);
    let last = performance.now();
    const loop = (now) => {
      if (!this.running || gen !== this.gen) return;
      // the next frame is booked first, so one frame that throws cannot stop the view
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      try { this.tick(dt); } catch (err) { this.report(err); }
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
  /** The first failure of a frame goes to the console and to onError, once. */
  report(err) {
    if (this.error) return;
    this.error = err;
    console.error('3D frame failed:', err);
    if (this.onError) this.onError(err);
  }

  /** Camera preset: direction the camera looks along, and screen-up vector. */
  view(dir, up, distScale = 2.55, target = null, instant = false) {
    const tgt = (target || this.center).clone();
    const d = dir.clone().normalize();
    // a labeled figure backs off to leave room for the tags: in a portrait host, and in a
    // host too narrow for a tag column on each side of the heart (about 0.8 of the height wide)
    const aspect = this.camera.aspect || 1;
    let fit = 1;
    if (this.opts.labeled && aspect < 1) fit = Math.pow(1 / aspect, 0.85) * 1.1;
    else if (this.opts.labeled) {
      const cols = (2 * Math.min(150, 0.25 * this.pencil.w)) / Math.max(1, this.pencil.h);
      fit = Math.min(1.4, Math.max(1, 0.8 / Math.max(0.2, aspect - cols)));
    } else fit = Math.max(1, 0.85 / aspect);   // the imaging plane: the whole heart across a narrow pane
    const pos = tgt.clone().addScaledVector(d, -this.radius * distScale * fit);
    const upv = up.clone().normalize();
    if (instant || reducedMotion) {
      this.camera.position.copy(pos);
      this.camera.up.copy(upv);
      this.controls.target.copy(tgt);
      this.camera.lookAt(tgt);
      this.tween = null;
      return;
    }
    this.tween = {
      t: 0,
      p0: this.camera.position.clone(), p1: pos,
      u0: this.camera.up.clone(), u1: upv,
      c0: this.controls.target.clone(), c1: tgt,
    };
  }

  presetFor(cut) {
    const A = this.anat;
    if (cut === 'a4c') {
      const pl = A.a4cPlane(this.opts.a);
      const t = this.lvCenter.clone().lerp(A.point('la_c', 0, 0), 0.3);
      return { dir: pl.normal.clone(), up: A.axis.clone(), target: t, dist: 2.25 };
    }
    if (cut === 'sax') {
      const t = A.point('lv_eq', 0, 0);
      // echo convention: seen from the apex, so the RV lies on the left of the screen
      return { dir: A.axis.clone().addScaledVector(A.anterior, -0.22).normalize(), up: A.anterior.clone(), target: t, dist: 1.9 };
    }
    // whole heart: from the front, a little from the patient's left and above
    const dir = new THREE.Vector3(-0.38, -0.2, -1).normalize();
    return { dir, up: new THREE.Vector3(0, 1, 0), target: this.center.clone(), dist: 3.0 };
  }

  tick(dt) {
    if (!this.heart) return;
    this.clock += dt;
    const o = this.opts;
    // one beat of the shared cycle model (70 per minute); still = end-diastole
    if (o.beat && !reducedMotion) this.phase = (this.phase + dt / (RR / 1000)) % 1;
    else this.phase = o.stillPhase ?? 0;
    const cyc = cycleAt(this.phase * RR);
    const s = cyc.s, v = cyc.v, drive = cyc.drive;
    this.heart.setState(o.a, s, v, drive);
    const a = this.heart.state.a;   // with the amyloid heart's own burden
    this.state = { a, s, v, phase: this.phase, drive, t: cyc.t };
    const P = this.heart.pheno;
    if (P && P.version !== this.pv) {
      // a new heart: its LV centre for the presets
      this.pv = P.version;
      this.lvCenter = this.anat.point('lv_eq', 0, 0).lerp(this.anat.point('mv', 0, 0), 0.25);
    }

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 0.9);
      const k = smooth(tw.t);
      this.camera.position.lerpVectors(tw.p0, tw.p1, k);
      this.camera.up.lerpVectors(tw.u0, tw.u1, k).normalize();
      this.controls.target.lerpVectors(tw.c0, tw.c1, k);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
    this.camera.updateMatrixWorld();

    // the 2D figure that follows the model (labels, echo) and the 3D view fail apart
    if (this.onFrame) { try { this.onFrame(this); } catch (err) { this.report(err); } }
    const boil = reducedMotion ? 0 : Math.floor(this.clock * 7) * 1.37;
    this.pencil.render(this.scene, this.camera, this.heart, {
      boil,
      amyloid: a,
      look: o.look,
      time: this.clock,
      groundUp: o.groundUp,
      site: o.site,
      overlayScene: this.overlayScene.children.length ? this.overlayScene : null,
      inset: this.inset ? this.inset.frame(this.camera, this.pencil.w, this.pencil.h) : null,
    });
  }

  project(v) {
    const p = v.clone().project(this.camera);
    const r = this.pencil;
    return { x: (p.x * 0.5 + 0.5) * r.w, y: (-p.y * 0.5 + 0.5) * r.h, z: p.z };
  }

  /**
   * Screen box (px) of the heart on the kept side of the cut: the end-diastolic
   * shape of the heart shown (the largest frame of the beat), every other vertex.
   */
  screenBox() {
    if (!this.heart) return null;
    const P = this.heart.pheno;
    const a = Math.round(Math.max(this.opts.a, P ? P.a : 0) * 100) / 100, key = `${a}|${P ? P.version : 0}`;
    if (!this.sample || this.sample.key !== key) {
      const heart = [], peri = [];
      const v = new THREE.Vector3(), t = new THREE.Vector3();
      this.heart.group.updateMatrixWorld(true);
      for (const [name, m] of Object.entries(this.heart.meshes)) {
        if (!m.geometry) continue;
        const g = m.geometry;
        const pos = g.attributes.position;
        const dict = m.morphTargetDictionary || {}, MP = g.morphAttributes.position || [];
        // the targets that make end-diastole: the amyloid burden, a disease heart's own shape
        const use = [[dict.amyloid, a], [P && P.mesh ? dict[`ph_${P.mesh}`] : undefined, 1]].filter(([k, w]) => k !== undefined && MP[k] && w > 0);
        const out = name === 'Pericardium' ? peri : heart;
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i);
          for (const [k, w] of use) {
            t.fromBufferAttribute(MP[k], i);
            if (g.morphTargetsRelative) v.addScaledVector(t, w); else v.lerp(t, w);
          }
          v.applyMatrix4(m.matrixWorld);
          out.push(v.x, v.y, v.z);
        }
      }
      this.sample = { key, heart: new Float32Array(heart), peri: new Float32Array(peri) };
    }
    const M = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).elements;
    const plane = this.heart.clip.length ? this.heart.clipPlane : null;
    const nx = plane ? plane.normal.x : 0, ny = plane ? plane.normal.y : 0, nz = plane ? plane.normal.z : 0, c = plane ? plane.constant : 1;
    const W = this.pencil.w, H = this.pencil.h;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const scan = (a) => {
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        if (nx * x + ny * y + nz * z + c < 0) continue;
        const w = M[3] * x + M[7] * y + M[11] * z + M[15];
        if (w <= 0) continue;
        const sx = ((M[0] * x + M[4] * y + M[8] * z + M[12]) / w * 0.5 + 0.5) * W;
        const sy = (-(M[1] * x + M[5] * y + M[9] * z + M[13]) / w * 0.5 + 0.5) * H;
        if (sx < x0) x0 = sx;
        if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy;
        if (sy > y1) y1 = sy;
      }
    };
    scan(this.sample.heart);
    if (this.heart.peri && this.heart.peri.visible) scan(this.sample.peri);
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }
}

// ----------------------------------------------------------------------------
// Labels drawn in HTML over the canvas, with SVG leader lines.
// ----------------------------------------------------------------------------
export class Labels {
  constructor(host) {
    this.host = host;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.appendChild(this.svg);
    this.nodes = new Map();
    // measure again once the hand font arrives or the tag size changes with the width
    const stale = () => { for (const n of this.nodes.values()) n.html = null; };
    if (document.fonts) document.fonts.addEventListener('loadingdone', stale);
    window.addEventListener('resize', stale);
  }
  clear() {
    for (const n of this.nodes.values()) { n.tag.remove(); n.path.remove(); n.dot.remove(); }
    this.nodes.clear();
  }
  /**
   * Tags sit in two columns beside the heart, like an anatomy plate.
   * items: [{id, x, y, text, sub, flag, side?}] in px; box: screen box of the heart.
   */
  update(items, box, w, h) {
    const seen = new Set();
    const tags = [];
    for (const it of items) {
      seen.add(it.id);
      let n = this.nodes.get(it.id);
      if (!n) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        this.host.appendChild(tag);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'leader');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'leader-dot');
        dot.setAttribute('r', '2.4');
        this.svg.append(path, dot);
        n = { tag, path, dot };
        this.nodes.set(it.id, n);
      }
      const html = it.sub ? `${it.text}<small>${it.sub}</small>` : it.text;
      n.tag.classList.toggle('is-flag', !!it.flag);
      n.tag.style.display = n.path.style.display = n.dot.style.display = '';
      if (n.html !== html) {
        // measure the layouts a narrow column can take: as written, the long
        // sub-line on two lines, the name on two lines, both
        // split at the space that balances the two lines; a tie goes to the later space
        const half = (str) => {
          let best = -1, len = Infinity;
          for (let i = str.indexOf(' '); i >= 0; i = str.indexOf(' ', i + 1)) {
            const l = Math.max(i, str.length - i - 1);
            if (l <= len) { best = i; len = l; }
          }
          return best >= 0 ? `${str.slice(0, best)}<br>${str.slice(best + 1)}` : str;
        };
        const name2 = half(it.text), sub2 = it.sub && it.sub.length > 10 ? half(it.sub) : it.sub;
        const make = (a, b) => (b ? `${a}<small>${b}</small>` : a);
        const seen = new Set();
        n.vars = [];
        for (const v of [make(it.text, it.sub), make(it.text, sub2), make(name2, it.sub), make(name2, sub2)]) {
          if (seen.has(v)) continue;
          seen.add(v);
          n.tag.innerHTML = v;
          n.vars.push({ html: v, w: n.tag.offsetWidth, h: n.tag.offsetHeight });
        }
        n.tag.innerHTML = html;
        n.html = html;
        n.cur = 0;
      }
      tags.push({ it, n });
    }
    if (!box) box = { x0: w * 0.3, x1: w * 0.7, y0: 0, y1: h };

    // sides: nearest column, then even out a lopsided split
    const mid = (box.x0 + box.x1) / 2;
    for (const t of tags) t.left = t.it.side ? t.it.side === 'left' : t.it.x < mid;
    for (;;) {
      const L = tags.filter((t) => t.left), R = tags.filter((t) => !t.left);
      const [big, small] = L.length > R.length ? [L, R] : [R, L];
      if (big.length - small.length <= 2) break;
      const move = big.filter((t) => !t.it.side).sort((a, b) => Math.abs(a.it.x - mid) - Math.abs(b.it.x - mid))[0];
      if (!move) break;
      move.left = !move.left;
    }

    const pad = 8;
    // each tag takes its first layout that fits the room beside the heart, else its narrowest
    for (const t of tags) {
      const { n } = t;
      const room = t.left ? box.x0 - 16 - pad : w - pad - box.x1 - 16;
      let k = n.vars.findIndex((v) => v.w <= room);
      if (k < 0) k = n.vars.reduce((b, v, i) => (v.w < n.vars[b].w - 4 ? i : b), 0);
      if (k !== n.cur) { n.tag.innerHTML = n.vars[k].html; n.cur = k; }
      t.hw = n.vars[k].w / 2;
      t.hh = n.vars[k].h / 2 + 3;
    }
    for (const col of [true, false]) {
      const list = tags.filter((t) => t.left === col).sort((a, b) => a.it.y - b.it.y);
      for (const t of list) {
        const cx = col ? box.x0 - 16 - t.hw : box.x1 + 16 + t.hw;
        t.x = Math.max(pad + t.hw, Math.min(w - pad - t.hw, cx));
        t.y = t.it.y;
      }
      // stack without overlap, top to bottom, then pull back inside the figure
      for (let i = 0; i < list.length; i++) {
        const lo = i ? list[i - 1].y + list[i - 1].hh + list[i].hh : pad + list[i].hh;
        list[i].y = Math.max(list[i].y, lo);
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const hi = i < list.length - 1 ? list[i + 1].y - list[i + 1].hh - list[i].hh : h - pad - list[i].hh;
        list[i].y = Math.min(list[i].y, hi);
      }
    }

    for (const t of tags) {
      const { it, n } = t;
      n.tag.classList.toggle('is-left', t.left);
      n.tag.style.left = `${t.x}px`;
      n.tag.style.top = `${t.y}px`;
      const ex = t.left ? t.x + t.hw + 4 : t.x - t.hw - 4;
      const ey = t.y - t.hh + 12;
      n.path.setAttribute('d', `M${it.x.toFixed(1)},${it.y.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
      n.dot.setAttribute('cx', it.x.toFixed(1));
      n.dot.setAttribute('cy', it.y.toFixed(1));
    }
    for (const [id, n] of this.nodes) {
      if (!seen.has(id)) { n.tag.style.display = n.path.style.display = n.dot.style.display = 'none'; }
    }
  }
}
