// 04 Planes: the standard views as planes through one heart. Pick views to see where their
// planes lie and where they cross; pick a structure to find the views that show it.
import { VIEWS, WINDOWS, STRUCTS, HAS, PLANE_VIEWS, CODE, MOVE } from '../views.js';
import { loadModel } from '../model3d.js';
import { sharedStage } from '../gl/shared.js';
import { SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';

const PRESETS = {
  nine: ['plax', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a2c', 'a3c', 'sc4c', 'ssn'],
  long: ['plax', 'plax_asc', 'rv_in', 'rv_out'],
  stack: ['psax_av', 'psax_mv', 'psax_pm', 'psax_ap'],
  apical: ['a4c', 'a5c', 'a2c', 'a3c'],
  all: PLANE_VIEWS,
};
const SNAME = Object.fromEntries(STRUCTS.map((s) => [s.id, s]));
const WNAME = Object.fromEntries(WINDOWS.map((w) => [w.key, w.name]));

let T = null;                  // three.js, loaded with the stage
let stage = null, echo = null, model = null, ready = null, failed = false, fig = null, on = false;
let st = null, setState = null;
let group = null, crossLines = null, marker = null, anchors = null, geoms = null;
const fans = new Map();
let ink = null, labelBoxes = [], tick = 0, down = null;
let freeFan = null, nearFan = null, nearInfo = null;
const FREE_KEYS = ['prot', 'ptilt', 'prock', 'pslide', 'psweep'];
// labels for a plane that is not a standard view: any structure lying on it
const GENERIC = [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA'], ['ivs', 'IVS'], ['ias', 'IAS'], ['mv', 'MV'], ['tv', 'TV'], ['av', 'AV'], ['pv', 'PV'],
  ['ao', 'Ao'], ['mpa', 'PA'], ['apex', 'apex'], ['desc', 'desc Ao'], ['arch', 'arch'], ['ivcl', 'IVC'], ['svc', 'SVC']];
// A plane is judged by the anatomy it holds: the angle between the planes and how far the
// view's imaged centre lies off the free plane. Near: within 20 degrees and 3 cm; on it (it
// settles there when let go): within 10 degrees and 1.5 cm.
const NEAR = { deg: 20, cm: 3.0 }, ON = { deg: 10, cm: 1.5 };

const sel = (s = st) => (s.pviews ? s.pviews.split(',').filter((k) => HAS[k]) : []);
const winColor = (win) => getComputedStyle(document.documentElement).getPropertyValue(`--w-${win}`).trim() || '#555';
function rgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}

function note(msg) {
  const n = fig && fig.querySelector('#planes-note');
  if (n) n.textContent = msg;
}

// ---------------------------------------------------------------- geometry
/** Angle between two view planes, degrees (0 to 90). */
function planeAngle(a, b) {
  return (Math.acos(Math.min(1, Math.abs(a.n.dot(b.n)))) * 180) / Math.PI;
}

/** The segment where two fans cross, or null (parallel, or the line misses a fan). */
function crossing(ka, kb) {
  const A = geoms[ka], B = geoms[kb];
  const L = new T.Vector3().crossVectors(A.n, B.n);
  if (L.lengthSq() < 1e-3) return null;
  L.normalize();
  const cA = A.n.dot(A.O), cB = B.n.dot(B.O), k = A.n.dot(B.n), det = 1 - k * k;
  const P0 = A.n.clone().multiplyScalar((cA - cB * k) / det).addScaledVector(B.n, (cB - cA * k) / det);
  let lo = -Infinity, hi = Infinity;
  for (const [g, spec] of [[A, VIEWS[ka]], [B, VIEWS[kb]]]) {
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

// ---------------------------------------------------------------- 3D objects
const FAN_VS = `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Fans are drawn over the pencil heart; where a fan runs behind the heart's front surface it
// is drawn fainter, so a plane reads as going into the heart.
const FAN_FS = `
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

function fanMaterial(col) {
  return new T.ShaderMaterial({
    vertexShader: FAN_VS,
    fragmentShader: FAN_FS,
    uniforms: {
      uColor: { value: new T.Vector3(...col) },
      uAlpha: { value: 0.14 },
      uBehind: { value: 0.45 },
      tDepth: { value: stage.pencil.rtNormal.depthTexture },
      uRes: { value: new T.Vector2(1, 1) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
  });
}

let probeGeo = null;
function makeFan(k) { return fanFor(geoms[k], VIEWS[k], rgb(winColor(VIEWS[k].win))); }

/** A fan (sector, outline, probe) for plane g with the view settings spec, in color col. */
function fanFor(g, spec, col) {
  const half = (spec.angle * Math.PI) / 360, N = 40;
  const verts = [g.O.x, g.O.y, g.O.z];
  for (let i = 0; i <= N; i++) {
    const th = -half + (2 * half * i) / N;
    const p = g.O.clone().addScaledVector(g.d.clone().multiplyScalar(Math.cos(th)).addScaledVector(g.r, Math.sin(th)), spec.depth);
    verts.push(p.x, p.y, p.z);
  }
  const idx = [];
  for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const lgeo = new T.BufferGeometry();
  lgeo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  const mat = fanMaterial(col);
  const lmat = new T.LineBasicMaterial({ color: new T.Color(...col), transparent: true, opacity: 0.8, depthTest: false });
  const mesh = new T.Mesh(geo, mat);
  const outline = new T.LineLoop(lgeo, lmat);
  if (!probeGeo) probeGeo = new T.CylinderGeometry(0.4, 0.65, 2.2, 18);
  const probe = new T.Mesh(probeGeo, new T.MeshBasicMaterial({ color: new T.Color(...col), transparent: true, opacity: 0.5, depthTest: false }));
  probe.position.copy(g.O).addScaledVector(g.d, -1.2);
  probe.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), g.d);
  mesh.renderOrder = 1;
  outline.renderOrder = 3;
  probe.renderOrder = 3;
  const obj = new T.Group();
  obj.add(mesh, outline, probe);
  group.add(obj);
  return { obj, mat, lmat, probe, col };
}

function dropFan(f) {
  group.remove(f.obj);
  f.obj.children[0].geometry.dispose();
  f.obj.children[1].geometry.dispose();
  f.mat.dispose();
  f.lmat.dispose();
  f.probe.material.dispose();
}

function syncFans() {
  const want = new Set(sel().filter((k) => geoms[k]));
  for (const [k, f] of fans) if (!want.has(k)) { dropFan(f); fans.delete(k); }
  for (const k of want) if (!fans.has(k)) fans.set(k, makeFan(k));
  retheme3d();
  style();
}

/** Lines where the focused plane crosses the other planes on show. */
function syncCrossings() {
  const pts = [];
  const k = st.pfocus;
  if (geoms[k]) {
    for (const j of fans.keys()) {
      if (j === k) continue;
      const c = crossing(k, j);
      if (c) pts.push(c.a.x, c.a.y, c.a.z, c.b.x, c.b.y, c.b.z);
    }
  }
  crossLines.geometry.dispose();
  crossLines.geometry = new T.BufferGeometry();
  crossLines.geometry.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
}

// ---------------------------------------------------------------- free plane
const quatOf = (g) => new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(g.r, g.d, g.n));

/**
 * The free plane: the focused view's plane moved as a probe is. Rotate turns it about the
 * beam (clockwise from the probe for +), tilt turns the beam across the plane, rock turns it
 * within the plane (toward screen-right for +); slide and sweep move the probe along and
 * across the plane.
 */
function freePose(s = st) {
  const b = geoms[s.pfocus];
  if (!b) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const d = b.d.clone(), r = b.r.clone().applyAxisAngle(d, rad(s.prot)), n = b.n.clone().applyAxisAngle(d, rad(s.prot));
  d.applyAxisAngle(r, rad(s.ptilt));
  n.applyAxisAngle(r, rad(s.ptilt));
  d.applyAxisAngle(n, rad(-s.prock));
  r.applyAxisAngle(n, rad(-s.prock));
  const O = b.O.clone().addScaledVector(b.r, s.pslide).addScaledVector(b.n, s.psweep);
  return { O, d: d.normalize(), r: r.normalize(), n: n.normalize() };
}
const moved = (s = st) => FREE_KEYS.some((k) => Math.abs(s[k] || 0) > 1e-6);
// the probe's window; the long- and short-axis views share the parasternal one
const SITE = { plax: 'parasternal', psax: 'parasternal', apical: 'apical', sub: 'subcostal', ssn: 'suprasternal' };
const site = (k) => SITE[VIEWS[k].win];

/**
 * The standard view nearest to plane g, among the views of the window that the probe is in
 * (the focused view's): the angle between the planes, and how far the view's imaged centre
 * lies off g (it must also lie within the sector's reach in g). The angle counts the side the
 * marker is on: the same plane turned 180° shows the heart mirrored and is not the view
 * (`flip` names that view). A plane from another window can lie close to g (the apical and
 * subcostal four-chamber planes do) but is another view. Where two views share a plane, the
 * closer beam direction decides.
 */
function nearest(g, from = st.pfocus) {
  if (!g || !VIEWS[from]) return null;
  let best = null, flip = null;
  for (const k of PLANE_VIEWS) {
    const G = geoms[k];
    if (!G || site(k) !== site(from)) continue;
    const depth = VIEWS[k].depth;
    const deg = (Math.acos(Math.max(-1, Math.min(1, g.n.dot(G.n)))) * 180) / Math.PI;
    const q = G.O.clone().addScaledVector(G.d, depth / 2).sub(g.O);
    const cm = Math.abs(q.dot(g.n));
    const inside = Math.hypot(q.dot(g.r), q.dot(g.d) - depth / 2) <= depth / 2;
    const beam = (Math.acos(Math.max(-1, Math.min(1, g.d.dot(G.d)))) * 180) / Math.PI;
    if (inside && 180 - deg < NEAR.deg && cm < NEAR.cm && (!flip || 180 - deg < flip.deg)) flip = { k, deg: 180 - deg };
    const score = deg / NEAR.deg + cm / NEAR.cm + beam / 180 + (inside ? 0 : 2);
    if (!best || score < best.score) best = { k, deg, cm, score, inside };
  }
  if (best) {
    best.near = best.inside && best.deg < NEAR.deg && best.cm < NEAR.cm;
    best.on = best.near && best.deg < ON.deg && best.cm < ON.cm;
    best.flip = !best.near && flip ? flip.k : null;
  }
  return best;
}

function freeSpec() {
  const b = VIEWS[st.pfocus] || VIEWS.a4c;
  const on = nearInfo && nearInfo.on;
  return { angle: b.angle, depth: b.depth, near: b.near, liver: b.liver, short: on ? VIEWS[nearInfo.k].short : 'FREE', name: 'Free plane',
    labels: on ? VIEWS[nearInfo.k].labels : GENERIC, strict: !on };
}

/** Rebuild the free fan on plane g, and the ghost of a near view that is not on show. */
function drawFree(g) {
  if (freeFan) { dropFan(freeFan); freeFan = null; }
  if (nearFan) { dropFan(nearFan); nearFan = null; }
  if (!st.pfree || !g) return;
  const css = getComputedStyle(document.documentElement);
  freeFan = fanFor(g, VIEWS[st.pfocus] || VIEWS.a4c, rgb(css.getPropertyValue('--ink').trim()));
  freeFan.mat.uniforms.uAlpha.value = 0.2;
  freeFan.lmat.opacity = 1;
  freeFan.probe.material.opacity = 0.85;
  const nb = nearInfo;
  if (nb && nb.near && !fans.has(nb.k)) {
    nearFan = fanFor(geoms[nb.k], VIEWS[nb.k], rgb(winColor(VIEWS[nb.k].win)));
    nearFan.mat.uniforms.uAlpha.value = 0.08;
    nearFan.lmat.opacity = 0.9;
    nearFan.probe.visible = false;
  }
}

/** The free plane after a change of its controls; animate when it moves onto a view. */
function syncFree(animate = false) {
  const box = document.getElementById('planes-free');
  if (box) box.hidden = !st.pfree;
  if (!stage || !on || !group) return;
  const g = st.pfree ? freePose() : null;
  nearInfo = g ? nearest(g) : null;
  if (box) {
    box.classList.toggle('is-near', !!(nearInfo && nearInfo.near && !nearInfo.on));
    box.classList.toggle('is-on', !!(nearInfo && nearInfo.on));
    const out = document.getElementById('pfree-state');
    if (out) {
      const nb = nearInfo;
      out.textContent = !nb ? '' : nb.on && nb.deg < 0.05 && nb.cm < 0.01 ? `on ${CODE[nb.k]}` : nb.on ? `${CODE[nb.k]}: let go to settle on it` : nb.near ? `near ${CODE[nb.k]} · ${Math.round(nb.deg)}° · ${nb.cm.toFixed(1)} cm` : nb.flip ? `${CODE[nb.flip]} plane, marker reversed` : 'no standard view near';
    }
  }
  drawFree(g);
  style();
  if (echo) {
    // a move to another window takes longer: the probe lifts and crosses the chest
    const T = crossMove ? 2600 : undefined;
    if (g) echo.setGeometry(g, freeSpec(), { animate, T });
    else if (geoms[st.pfocus]) echo.setView(st.pfocus, { animate, T });
  }
  if (st.pcam === 'plane') camera(!animate);
}

// ---------------------------------------------------------------- moving the probe to a view
// A move to a view goes in steps: the probe slides and sweeps back over the skin first, then
// the beam is tilted and rocked, and the probe turns last, when the beam is again on the view's
// axis. Each control eases over its own stretch of the move, and the stretches overlap; the
// sliders move with it.
const STRETCH = { pslide: [0, 0.45], psweep: [0, 0.45], ptilt: [0.28, 0.76], prock: [0.28, 0.76], prot: [0.52, 1] };
const RANGE = { prot: 180, ptilt: 45, prock: 40, pslide: 5, psweep: 5 };
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
let glide = null, gliding = false, crossMove = false;

/** Ease the probe controls from where they are to `to` (zero: the focused view itself). */
function startGlide(to = {}, then = null) {
  const from = Object.fromEntries(FREE_KEYS.map((k) => [k, st[k] || 0]));
  const target = Object.fromEntries(FREE_KEYS.map((k) => [k, to[k] ?? 0]));
  const turn = ['prot', 'ptilt', 'prock'].reduce((a, k) => a + Math.abs(from[k] - target[k]), 0);
  const move = Math.abs(from.pslide - target.pslide) + Math.abs(from.psweep - target.psweep);
  if (turn < 0.5 && move < 0.05) {
    glide = null;
    set0(target);
    if (then) then();
    return;
  }
  // slow enough to follow: about 1.4 s for a small correction, up to 4 s for a large one.
  // The move runs on the clock, so a slow frame rate does not stretch it.
  glide = { from, to: target, t0: performance.now(), T: Math.min(4, 1.4 + turn / 60 + move / 3), then };
}
function set0(vals) {
  gliding = true;
  setState({ ...vals, playing: false });
  gliding = false;
}
function stepGlide() {
  if (!glide) return;
  const u = reducedMotion ? 1 : Math.min(1, (performance.now() - glide.t0) / (glide.T * 1000)), vals = {};
  for (const k of FREE_KEYS) {
    const [a, b] = STRETCH[k];
    vals[k] = glide.from[k] + (glide.to[k] - glide.from[k]) * ease((u - a) / (b - a));
  }
  set0(vals);
  if (u >= 1) { const then = glide.then; glide = null; if (then) then(); }
}

/**
 * The probe controls that put view b's plane where plane g is: the turn of g against b as
 * rotate, tilt and rock (the order freePose applies them), and the probe's shift over the
 * skin as slide and sweep. A shift along b's beam has no control and is left out.
 */
function controlsFor(g, b) {
  const deg = (x) => (x * 180) / Math.PI;
  const tilt = Math.asin(Math.max(-1, Math.min(1, -b.d.dot(g.n))));
  const rot = Math.atan2(b.r.dot(g.n), b.n.dot(g.n));
  const rock = -Math.atan2(b.d.dot(g.r), b.d.dot(g.d));
  const dO = g.O.clone().sub(b.O);
  return { prot: deg(rot), ptilt: deg(tilt), prock: deg(rock), pslide: dO.dot(b.r), psweep: dO.dot(b.n) };
}

/**
 * Take the free plane to view k. In the same window the present pose is first counted from k,
 * then the controls ease back to k itself. For another window the probe comes back to the
 * focused view, then moves over to the new window.
 */
function goTo(k) {
  if (!geoms || !geoms[k] || !st.pfree) return;
  const list = sel();
  if (!list.includes(k)) list.push(k);
  if (k === st.pfocus) { startGlide(); return; }
  const g = freePose();
  const c = g && site(k) === site(st.pfocus) ? controlsFor(g, geoms[k]) : null;
  if (c && FREE_KEYS.every((key) => Math.abs(c[key]) <= RANGE[key])) {
    glide = null;
    set0({ pviews: list.join(','), pfocus: k, ...c });
    startGlide();
  } else {
    startGlide({}, () => { crossMove = true; set0({ pviews: list.join(','), pfocus: k }); crossMove = false; });
  }
}

/** On letting go of a control: a plane on a standard view settles onto it. */
function release() {
  if (!st.pfree) return;
  const nb = nearest(freePose());
  if (!nb || !nb.on) return;
  const list = sel();
  if (!list.includes(nb.k)) list.push(nb.k);
  setState({ pviews: list.join(','), pfocus: nb.k, prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0, playing: false });
}

function style() {
  if (!group) return;
  const S = st.pstruct !== 'none' ? st.pstruct : null;
  for (const [k, f] of fans) {
    const focus = k === st.pfocus;
    const has = S ? HAS[k].includes(S) : true;
    const near = st.pfree && nearInfo && nearInfo.near && nearInfo.k === k;
    f.mat.uniforms.uAlpha.value = S ? (has ? (focus ? 0.3 : 0.16) : 0.025) : (focus ? 0.3 : near ? 0.2 : 0.07);
    f.lmat.opacity = S ? (has ? 0.95 : 0.14) : (focus || near ? 1 : 0.42);
    f.probe.material.opacity = S && !has ? 0.1 : focus ? 0.85 : 0.35;
  }
  syncCrossings();
  crossLines.visible = st.plines;
  const s = S && SNAME[S];
  const P = s && s.anchor ? anchors[s.anchor] : null;
  marker.visible = !!P;
  if (P) marker.position.copy(P);
  cut();
}

function cut() {
  if (!stage || !on) return;
  const g = st.pcut ? (st.pfree ? freePose() : geoms[st.pfocus]) : null;
  stage.heart.setCut(g ? new T.Plane().setFromNormalAndCoplanarPoint(g.n.clone(), g.O) : null);
}

function retheme3d() {
  if (!group) return;
  for (const [k, f] of fans) {
    const col = rgb(winColor(VIEWS[k].win));
    f.mat.uniforms.uColor.value.set(...col);
    f.lmat.color.setRGB(...col);
    f.probe.material.color.setRGB(...col);
  }
  const css = getComputedStyle(document.documentElement);
  if (freeFan) { const c = rgb(css.getPropertyValue('--ink').trim()); freeFan.mat.uniforms.uColor.value.set(...c); freeFan.lmat.color.setRGB(...c); freeFan.probe.material.color.setRGB(...c); }
  crossLines.material.color.setRGB(...rgb(css.getPropertyValue('--ink').trim()));
  marker.material.color.setRGB(...rgb(css.getPropertyValue('--flag').trim()));
}

function camera(instant = false) {
  const A = model.anat;
  if (st.pcam === 'plane') {
    // square to the focused (or free) plane, turned as its echo is: probe at the top
    const g = st.pfree ? freePose() : geoms[st.pfocus];
    if (g) {
      const depth = (VIEWS[st.pfocus] || VIEWS.a4c).depth;
      stage.view(g.n.clone(), g.d.clone().negate(), 0.16 * depth, g.O.clone().addScaledVector(g.d, depth * 0.5), instant);
      return;
    }
  }
  if (st.pcam === 'apex') stage.view(A.axis.clone(), A.anterior.clone(), 2.6, A.point('lv_eq', 0, 0), instant);
  else if (st.pcam === 'side') stage.view(A.lateral.clone().negate(), A.axis.clone(), 2.9, stage.center, instant);
  else stage.view(new T.Vector3(-0.38, -0.2, -1).normalize(), new T.Vector3(0, 1, 0), 3.1, stage.center, instant);
}

// ---------------------------------------------------------------- setup
async function ensure() {
  if (failed) throw new Error('3D view unavailable');
  if (!ready) {
    ready = (async () => {
      T = await import('../../vendor/three.bundle.min.js');
      model = await loadModel();
      const e = await import('../echo.js');
      stage = await sharedStage();
      geoms = {};
      for (const k of PLANE_VIEWS) { const g = e.viewGeometry(model.anat, k); if (g) geoms[k] = g; }
      echo = new e.EchoView(model, fig.querySelector('#planes-canvas'), {});
      echo.top = 42;
      anchors = echo.anchors(0);
      // papillary muscles: the middle of their mesh
      const pap = model.heart.meshes.Papillary;
      if (pap) {
        pap.updateMatrixWorld(true);
        anchors.lvc = new T.Box3().setFromObject(pap).getCenter(new T.Vector3());
      }
      group = new T.Group();
      group.visible = false;
      crossLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x22272b, transparent: true, opacity: 0.9, depthTest: false }));
      crossLines.renderOrder = 4;
      marker = new T.Mesh(new T.SphereGeometry(0.42, 20, 14), new T.MeshBasicMaterial({ color: 0xb23a2e, depthTest: false }));
      marker.renderOrder = 5;
      group.add(crossLines, marker);
      stage.overlayScene.add(group);
      return true;
    })().catch((err) => { failed = true; console.error('Planes 3D failed:', err); note('This device could not start the 3D view.'); throw err; });
  }
  return ready;
}

function sizeInk() {
  const host = fig.querySelector('.pane-3d');
  const r = host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (ink.width !== Math.round(w * dpr) || ink.height !== Math.round(h * dpr)) {
    ink.width = Math.round(w * dpr);
    ink.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

/** Tags for the planes and the structure, the body axes, drawn over the 3D view. */
function drawInk() {
  const { w, h, dpr } = sizeInk();
  const ctx = ink.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const paper = css.getPropertyValue('--paper').trim(), inkc = css.getPropertyValue('--ink').trim();
  const S = st.pstruct !== 'none' ? st.pstruct : null;
  const placed = [];
  labelBoxes = [];
  const tag = (text, x, y, color, bold, key) => {
    ctx.font = `${bold ? 700 : 600} ${bold ? 13 : 12}px ${SANS}`;
    const tw = ctx.measureText(text).width;
    let yy = y;
    for (let k = 0; k < 8; k++) {
      if (!placed.some((p) => Math.abs(p.x - x) < (p.w + tw) / 2 + 4 && Math.abs(p.y - yy) < 15)) break;
      yy += 15;
    }
    if (x < 4 || x > w - 4 || yy < 10 || yy > h - 10) return;
    placed.push({ x, y: yy, w: tw });
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = paper;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, x, yy);
    ctx.fillStyle = color;
    ctx.fillText(text, x, yy);
    if (key) labelBoxes.push({ key, x0: x - tw / 2 - 4, x1: x + tw / 2 + 4, y0: yy - 9, y1: yy + 9 });
  };
  // plane tags: on the center line of each fan, as far out as the figure allows
  const order = [...fans.keys()].sort((a, b) => (b === st.pfocus) - (a === st.pfocus));
  const view = new T.Vector3();
  stage.camera.getWorldDirection(view);
  for (const k of order) {
    const g = geoms[k], spec = VIEWS[k];
    // a probe seen end-on hides the middle of the heart
    const f = fans.get(k);
    f.probe.visible = Math.abs(g.d.dot(view)) < 0.8;
    let p = null;
    for (let t = spec.depth * 0.94; t > 2; t -= 0.5) {
      const q = stage.project(g.O.clone().addScaledVector(g.d, t));
      if (q.z < 1 && q.x > 36 && q.x < w - 36 && q.y > 30 && q.y < h - 56) { p = q; break; }
    }
    if (!p) continue;
    const dim = S && !HAS[k].includes(S);
    ctx.globalAlpha = dim ? 0.35 : 1;
    tag(CODE[k], p.x, p.y, winColor(spec.win), k === st.pfocus, k);
    ctx.globalAlpha = 1;
  }
  // the free plane and a near view that is not on show
  for (const [f, text, color, bold] of [[freeFan, 'Free', css.getPropertyValue('--ink').trim(), true], [nearFan, nearInfo ? CODE[nearInfo.k] : '', nearInfo ? winColor(VIEWS[nearInfo.k].win) : '', false]]) {
    if (!f || !text) continue;
    const pos = f.obj.children[1].geometry.attributes.position;
    const m = (pos.count - 1) >> 1;
    const O = new T.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)), E = new T.Vector3(pos.getX(m), pos.getY(m), pos.getZ(m));
    const p = stage.project(O.lerp(E, 0.8));
    if (p.z < 1) tag(text, p.x, p.y, color, bold, null);
  }
  // the structure
  if (S && marker.visible) {
    const p = stage.project(marker.position);
    tag(SNAME[S].name, p.x, p.y - 16, css.getPropertyValue('--flag').trim(), true, null);
  }
  // body axes: patient left, superior, anterior; above the note, which wraps on phones
  const note = document.getElementById('planes-note');
  const ox = 34, oy = Math.min(h - 34, (note && note.offsetParent ? note.offsetTop : h) - 36);
  const axes = [[new T.Vector3(1, 0, 0), 'L'], [new T.Vector3(0, 1, 0), 'S'], [new T.Vector3(0, 0, 1), 'A']];
  ctx.font = `600 10px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [v, name] of axes) {
    const d = v.clone().transformDirection(stage.camera.matrixWorldInverse);
    const x = ox + d.x * 20, y = oy - d.y * 20;
    ctx.globalAlpha = d.z > 0 ? 0.45 : 1;
    ctx.strokeStyle = inkc;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = inkc;
    ctx.fillText(name, ox + d.x * 29, oy - d.y * 29);
  }
  ctx.globalAlpha = 1;
}

function onFrame(stg) {
  const W = stg.pencil.w * stg.pencil.dpr, H = stg.pencil.h * stg.pencil.dpr;
  for (const f of [...fans.values(), freeFan, nearFan]) if (f) f.mat.uniforms.uRes.value.set(W, H);
  // while the free plane settles onto a view, its fan and the cut follow the easing plane
  if (echo && echo.tr && st.pfree) {
    echo.advance();
    drawFree(echo.g);
    if (freeFan) freeFan.mat.uniforms.uRes.value.set(W, H);
    if (st.pcut) stage.heart.setCut(new T.Plane().setFromNormalAndCoplanarPoint(echo.g.n.clone(), echo.g.O));
  }
  drawInk();
  if (tick++ % 2 || !echo) return;
  if (!echo.canvas.offsetParent) { echo.advance(); return; }   // the echo pane is hidden on phones
  echo.labels = true;
  if (echo.g) echo.frame({ ...stg.state });
  else echo.drawEmpty();
}

async function enter() {
  on = true;
  try { await ensure(); } catch (e) { return; }
  if (!on) return;
  stage.onError = (err) => note(`The 3D view stopped: ${String(err.message || err).slice(0, 120)}`);
  stage.attach(fig.querySelector('.gl-host'));
  stage.opts.beat = true;
  stage.heart.setPericardium(false);
  stage.heart.group.visible = st.pheart;
  group.visible = true;
  syncFans();
  echo.setView(st.pfocus, { animate: false });
  syncFree(false);
  stage.onFrame = onFrame;
  fig.classList.add('gl-ready');
  stage.resize();
  echo.resize();
  camera(true);
  stage.start();
}

function focusView(k) {
  if (!k) return;
  const list = sel();
  if (!list.includes(k)) list.push(k);
  setState({ pviews: list.join(','), pfocus: k, playing: false });
}

function buildChips() {
  const host = document.getElementById('planes-views');
  if (!host) return;
  host.innerHTML = WINDOWS.map((w) => {
    const ks = PLANE_VIEWS.filter((k) => VIEWS[k].win === w.key);
    return `<div class="win" style="--c: var(--w-${w.key})"><span>${w.name}</span>${ks.map((k) => `<button type="button" class="chip" data-view="${k}" aria-pressed="false" title="${VIEWS[k].name}">${CODE[k]}</button>`).join('')}</div>`;
  }).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    const k = b.dataset.view;
    const list = sel();
    const i = list.indexOf(k);
    if (i < 0) { list.push(k); setState({ pviews: list.join(','), pfocus: k, playing: false }); return; }
    if (st.pfocus !== k) { setState({ pfocus: k, playing: false }); return; }
    list.splice(i, 1);
    setState({ pviews: list.join(','), pfocus: list[list.length - 1] || '', playing: false });
  });
  const sets = document.getElementById('planes-sets');
  sets?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]');
    if (!b) return;
    const list = b.dataset.set === 'none' ? [] : PRESETS[b.dataset.set];
    const focus = list.includes(st.pfocus) ? st.pfocus : list[0] || '';
    const cam = { apical: 'apex', stack: 'side' }[b.dataset.set];
    setState({ pviews: list.join(','), pfocus: focus, ...(cam ? { pcam: cam } : {}), playing: false });
  });
  const mtx = document.getElementById('planes-matrix');
  mtx?.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { focusView(v.dataset.view); return; }
    const r = e.target.closest('[data-struct]');
    if (r) setState({ pstruct: st.pstruct === r.dataset.struct ? 'none' : r.dataset.struct, playing: false });
  });
}

function syncChips() {
  const list = sel();
  const S = st.pstruct !== 'none' ? st.pstruct : null;
  for (const b of document.querySelectorAll('#planes-views button[data-view]')) {
    const k = b.dataset.view;
    b.setAttribute('aria-pressed', String(list.includes(k)));
    b.classList.toggle('is-focus', k === st.pfocus);
    b.classList.toggle('has', !!S && HAS[k].includes(S));
    b.classList.toggle('dim', !!S && !HAS[k].includes(S));
  }
}

function matrix() {
  const t = document.getElementById('planes-matrix');
  if (!t) return;
  const views = sel();
  if (!views.length) { t.innerHTML = ''; return; }
  const S = st.pstruct !== 'none' ? st.pstruct : null;
  const rows = STRUCTS.filter((s) => s.id === S || views.some((k) => HAS[k].includes(s.id)));
  t.innerHTML = `<caption>What each view shows</caption>
    <thead><tr><th scope="col">Structure</th>${views.map((k) => `<th scope="col" class="v${k === st.pfocus ? ' fcol' : ''}" data-view="${k}" style="--c: var(--w-${VIEWS[k].win})" title="${VIEWS[k].name}"><span>${CODE[k]}</span></th>`).join('')}</tr></thead>
    <tbody>${rows.map((s) => `<tr data-struct="${s.id}"${s.id === S ? ' class="cur"' : ''}><th scope="row">${s.name}</th>${views.map((k) => `<td class="${k === st.pfocus ? 'fcol' : ''}" style="--c: var(--w-${VIEWS[k].win})">${HAS[k].includes(s.id) ? '●' : ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function listNames(keys) {
  const names = keys.map((k) => CODE[k]);
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default {
  key: 'planes',
  part: 'physics',
  title: 'Planes',
  dwell: 28,
  defaults: { pviews: PRESETS.nine.join(','), pfocus: 'a4c', pstruct: 'none', pcam: 'front', pheart: true, pcut: false, plines: true,
    pfree: false, prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0 },
  watch: ['pviews', 'pfocus', 'pstruct', 'pcam', 'pheart', 'pcut', 'plines', 'pfree', ...FREE_KEYS],
  format: {
    prot: (v) => `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)}°`,
    ptilt: (v) => `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)}°`,
    prock: (v) => `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)}°`,
    pslide: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} cm`,
    psweep: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} cm`,
  },
  figure(f) { fig = f; return null; },
  init({ state, set }) {
    st = state;
    setState = set;
    // warm() may run before the figure is first shown
    fig = document.getElementById('fig-planes');
    ink = fig.querySelector('#planes-ink');
    const host = fig.querySelector('.pane-3d');
    host.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    host.addEventListener('click', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = labelBoxes.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
      if (hit) focusView(hit.key);
    });
    buildChips();
    for (const k of FREE_KEYS) document.getElementById(k)?.addEventListener('change', release);
    document.getElementById('pfree-reset')?.addEventListener('click', () => startGlide());
    const pick = document.getElementById('pgoto');
    if (pick) {
      pick.innerHTML = WINDOWS.map((w) => {
        const ks = PLANE_VIEWS.filter((k) => VIEWS[k].win === w.key);
        return ks.length ? `<optgroup label="${w.name}">${ks.map((k) => `<option value="${k}">${VIEWS[k].name}</option>`).join('')}</optgroup>` : '';
      }).join('');
      pick.value = st.pfocus;
      pick.addEventListener('change', () => goTo(pick.value));
    }
    const seg = document.querySelector('.seg[data-key="pstruct"]');
    if (seg) seg.insertAdjacentHTML('beforeend', STRUCTS.filter((s) => s.id !== 'abd').map((s) => `<button type="button" data-val="${s.id}" title="${s.name}">${s.short}</button>`).join(''));
    syncChips();
  },
  enter() { enter(); },
  leave() {
    on = false;
    if (freeFan) { dropFan(freeFan); freeFan = null; }
    if (nearFan) { dropFan(nearFan); nearFan = null; }
    if (group) group.visible = false;
    if (stage) {
      stage.heart.group.visible = true;
      stage.heart.setCut(null);
      if (stage.onFrame === onFrame) { stage.stop(); stage.onFrame = null; }
    }
  },
  warm() { ensure().catch(() => {}); },
  anim() { stepGlide(); },
  ready() { return failed || (on && stage && stage.running && stage.onFrame === onFrame); },
  resize() {
    if (!stage || !on) return;
    stage.resize();
    if (echo) { echo.resize(); echo.setView(st.pfocus); }
  },
  retheme() { retheme3d(); if (echo) echo.retheme(); },
  onState(s, ch) {
    if (!gliding && glide && (FREE_KEYS.some((k) => k in ch) || 'pfocus' in ch || 'pfree' in ch)) glide = null;
    const pick = document.getElementById('pgoto');
    if (pick && ('pfocus' in ch || 'chapter' in ch) && PLANE_VIEWS.includes(s.pfocus)) pick.value = s.pfocus;
    if ('pviews' in ch || 'pfocus' in ch || 'pstruct' in ch) syncChips();
    const lab = fig && fig.querySelector('#planes-label');
    if (lab && ('pfocus' in ch || 'chapter' in ch)) lab.textContent = VIEWS[s.pfocus] ? VIEWS[s.pfocus].name : 'No view chosen';
    if (lab && ('pfree' in ch || FREE_KEYS.some((k) => k in ch)) && s.pfree) lab.textContent = 'Free plane';
    const freeBox = document.getElementById('planes-free');
    if (freeBox && 'pfree' in ch) freeBox.hidden = !s.pfree;
    if (fig && ('pfree' in ch || 'chapter' in ch)) {
      const was = fig.classList.contains('free-on');
      fig.classList.toggle('free-on', !!s.pfree);
      if (was !== !!s.pfree && stage && on) { stage.resize(); if (echo) echo.resize(); }
    }
    if (!stage || !on || !group) return;
    if ('pviews' in ch) syncFans();
    else if ('pfocus' in ch || 'pstruct' in ch || 'plines' in ch || 'pcut' in ch) style();
    if (s.pfree || 'pfree' in ch) {
      // the free plane: animate when it moves onto a view (a snap or a new focus), follow the controls directly
      if ('pfree' in ch || 'pfocus' in ch || FREE_KEYS.some((k) => k in ch)) syncFree('pfocus' in ch);
    } else if ('pfocus' in ch && s.pfocus) echo.setView(s.pfocus);
    if ('pheart' in ch) stage.heart.group.visible = s.pheart;
    if ('pcam' in ch) camera();
  },
  key_(k, set, s) {
    if (k !== '[' && k !== ']') return;
    const list = sel(s);
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(s.pfocus));
    set({ pfocus: list[(i + (k === ']' ? 1 : list.length - 1)) % list.length], playing: false });
  },
  tourEnter(set) { set({ pviews: PRESETS.nine.join(','), pfocus: 'plax', pstruct: 'none', pcam: 'front', pheart: true, pcut: false, plines: true }); },
  tourTick(tt, set, s) {
    const step = Math.floor(tt / 7);
    const want = [
      { pviews: PRESETS.nine.join(','), pfocus: 'plax', pcam: 'front', pstruct: 'none' },
      { pviews: PRESETS.apical.join(','), pfocus: 'a2c', pcam: 'apex', pstruct: 'none' },
      { pviews: PRESETS.stack.join(','), pfocus: 'psax_mv', pcam: 'side', pstruct: 'none' },
      { pviews: PRESETS.nine.join(','), pfocus: 'a3c', pcam: 'front', pstruct: 'av' },
    ][Math.min(3, step)];
    if (Object.keys(want).some((k) => s[k] !== want[k])) set(want);
  },
  text(s, { cite }) {
    const views = sel(s);
    const k = s.pfocus && VIEWS[s.pfocus] ? s.pfocus : null;
    const S = s.pstruct !== 'none' ? SNAME[s.pstruct] : null;
    const readouts = [
      { k: 'Planes on', v: String(views.length) },
      { k: 'Focused view', v: k ? CODE[k] : '–' },
      { k: 'Window', v: k ? WNAME[VIEWS[k].win] : '–', text: true },
    ];
    if (k) readouts.push({ k: 'How to get there', v: MOVE[k], text: true });
    const nb = s.pfree && geoms && T ? nearest(freePose(s), s.pfocus) : null;
    if (nb) readouts.push({ k: 'Free plane', v: nb.on && !moved(s) ? `on ${CODE[nb.k]}` : nb.flip ? `${CODE[nb.flip]} plane, marker reversed` : `${Math.round(nb.deg)}° · ${nb.cm.toFixed(1)} cm off ${CODE[nb.k]}`, text: true });
    let live = '';
    if (nb) {
      live += `<b>Free plane.</b> ${nb.on && !moved(s) ? `It lies on ${VIEWS[nb.k].name}.` : nb.near ? `It is ${Math.round(nb.deg)}° from the plane of ${VIEWS[nb.k].name}, whose centre lies ${nb.cm.toFixed(1)} cm off it.` : nb.flip ? `It is the plane of ${CODE[nb.flip]} with the marker on the other side, so the image is mirrored. Turn the probe 180° to get the view.` : 'No standard view is near.'} `;
      live += `The probe stays in the ${site(s.pfocus)} window, so only the views of that window count. Within ${NEAR.deg}° and ${NEAR.cm} cm the nearest view is marked; within ${ON.deg}° and ${ON.cm} cm the plane settles onto it when you let go. `;
    }
    if (k) {
      live += `<b>${VIEWS[k].name}.</b> Shows ${HAS[k].map((id) => SNAME[id].short).join(', ')}${cite('mitchell2019')}. `;
      if (geoms && geoms[k]) {
        const rel = views.filter((j) => j !== k && geoms[j]).map((j) => ({ j, a: planeAngle(geoms[k], geoms[j]), same: VIEWS[j].win === VIEWS[k].win }));
        const par = rel.filter((r) => r.a < 3);
        // views of the same window first (the rotations and tilts between them), then the nearest others
        const cross = [...rel.filter((r) => r.a >= 3 && r.same).sort((x, y) => x.a - y.a), ...rel.filter((r) => r.a >= 3 && !r.same).sort((x, y) => x.a - y.a)].slice(0, 3);
        if (cross.length) live += `In this model it lies ${cross.map((r) => `${Math.round(r.a)}° from ${CODE[r.j]}`).join(', ')}. `;
        if (par.length) live += `${listNames(par.map((r) => r.j))} ${par.length > 1 ? 'are' : 'is'} parallel to it, ${par.map((r) => `${Math.abs(geoms[r.j].O.clone().sub(geoms[k].O).dot(geoms[k].n)).toFixed(1)} cm`).join(', ')} away. `;
      }
    } else live += 'Choose a view. ';
    if (S) {
      const inViews = views.filter((j) => HAS[j].includes(S.id));
      const all = Object.keys(HAS).filter((j) => HAS[j].includes(S.id));
      live += `<span class="k-red">${S.name}</span>: in ${all.length} of the ${Object.keys(HAS).length} standard views${inViews.length ? `; of the planes on, ${listNames(inViews)}` : ''}.`;
      if (!S.anchor) live += ' The heart model has no marker for it.';
    }
    return { readouts, live, extra: () => matrix() };
  },
};
