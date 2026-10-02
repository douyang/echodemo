// 07 Views: the standard transthoracic views as planes through one heart, in three panes drawn
// from the one heart mesh (gl/stage3d.js, Pane3D):
//  - All planes: the planes of the chosen views in their window colors, the current plane in ink
//    with the probe, and the body figure (gl/bodykey.js) with Probe and body;
//  - Cross-section: the heart cut on the current plane and seen square to it, with the tags;
//  - the echo that the same plane cuts from the mesh.
// One plane drives the three panes. A change of view eases it once (echo.js), and each pane draws
// it in each frame. The free plane moves the same plane.
import { VIEWS, WINDOWS, ORDER, SHORT, MOVE, STRUCTS, HAS, PLANE_VIEWS, CODE } from '../views.js';
import { loadModel } from '../model3d.js';
import { sharedStage } from '../gl/shared.js';
import { Labels } from '../gl/stage3d.js';
import { SANS, tokens } from '../sketch.js';
import { Fan, crossing, rgb } from '../gl/fans.js';
import { reducedMotion } from '../state.js';

// What each view shows and what is measured there (ASE 2019, Tables 2.1-2.27 and Section IV).
const INFO = {
  plax: { shows: 'LA, mitral valve, LV, LVOT, aortic valve, septum, RV', acquire: 'Septum, LV diameter and inferolateral wall at end-diastole; LV diameter at end-systole; proximal RVOT; LA diameter' },
  plax_deep: { shows: 'Pericardial and pleural spaces behind the heart', acquire: 'Screening for pericardial and pleural effusion' },
  plax_avmv: { shows: 'Two aortic cusps and both mitral leaflets', acquire: 'Leaflet motion of both valves' },
  plax_av: { shows: 'Aortic valve, LVOT, proximal ascending aorta', acquire: 'Annulus and LVOT diameters in mid-systole; color Doppler of the aortic valve' },
  plax_mv: { shows: 'Mitral leaflets, chordae and annulus; LA; LV inflow', acquire: 'Leaflet anatomy and motion; color Doppler of the mitral valve' },
  plax_asc: { shows: 'Sinuses, sinotubular junction, tubular ascending aorta', acquire: 'Aortic diameters at end-diastole; color Doppler' },
  rv_in: { shows: 'RA, tricuspid valve, RV; IVC and coronary sinus in some patients', acquire: 'TR by color Doppler; TR peak velocity by CW Doppler' },
  rv_out: { shows: 'RVOT, pulmonic valve, main PA', acquire: 'RVOT PW Doppler; pulmonic valve CW Doppler; color Doppler' },
  psax_av: { shows: 'Aortic valve, LA, RA, tricuspid valve, RVOT, pulmonic valve, atrial septum', acquire: 'Proximal and distal RVOT; TR by color and CW Doppler' },
  psax_pa: { shows: 'Aorta above the valve, RA, RVOT, pulmonic valve, main PA and branches', acquire: 'Main PA diameter; RVOT PW Doppler; pulmonic valve CW Doppler; PR end-diastolic velocity' },
  psax_tv: { shows: 'RA, tricuspid valve, RV inflow, high septum', acquire: 'Tricuspid valve color Doppler; TR CW Doppler' },
  psax_avz: { shows: 'Noncoronary, right coronary and left coronary aortic cusps', acquire: 'Cusp number and motion; color Doppler' },
  psax_cor: { shows: 'Aortic root; origins of the left main and right coronary arteries', acquire: 'Origin of each coronary artery (anomalous origin)' },
  psax_mv: { shows: 'RV, septum, both mitral leaflets, LV', acquire: 'Leaflet excursion; basal wall motion; mitral color Doppler' },
  psax_pm: { shows: 'RV, septum, papillary muscles, LV', acquire: 'Global and regional LV function' },
  psax_ap: { shows: 'LV apex', acquire: 'Apical wall motion' },
  a4c: { shows: 'LA, mitral valve, LV, septum, RV, tricuspid valve, RA, atrial septum', acquire: 'LV and LA volumes (with A2C); mitral inflow; tissue Doppler; TR CW Doppler; pulmonary vein flow' },
  a4c_lv: { shows: 'LV, mitral apparatus, part of the LA', acquire: 'Biplane LV volumes (with A2C); wall motion; strain' },
  a4c_rv: { shows: 'RA, tricuspid valve, RV, LA, LV', acquire: 'RV diameters and areas; TAPSE; tricuspid annular S′; TR CW Doppler' },
  a4c_la: { shows: 'Pulmonary veins, LA, mitral valve, LV, RA, tricuspid valve, RV', acquire: 'LA volume at end-systole; RA volume; pulmonary vein flow' },
  a4c_mv: { shows: 'Mitral valve', acquire: 'Leaflet anatomy; mitral color Doppler; MR CW Doppler' },
  a4c_tv: { shows: 'Tricuspid leaflets and annulus', acquire: 'Leaflet anatomy and coaptation; TR color Doppler' },
  a4c_apex: { shows: 'LV apex', acquire: 'Apical wall motion; apical thrombus' },
  a5c: { shows: 'LA, mitral valve, LV, septum, LVOT, aortic valve, proximal aorta, RA, RV', acquire: 'LVOT PW Doppler about 5 mm below the valve; aortic valve CW Doppler; AR CW Doppler' },
  a2c: { shows: 'LV, mitral valve, LA; coronary sinus and LA appendage in some patients', acquire: 'LA volume; biplane LV volumes; mitral color Doppler' },
  a2c_lv: { shows: 'LV', acquire: 'Biplane LV volumes (with A4C)' },
  a3c: { shows: 'LA, mitral valve, LV, LVOT, aortic valve, aorta', acquire: 'Color Doppler of the mitral valve, LVOT and aortic valve; LVOT PW and aortic valve CW Doppler; AR and MR CW Doppler' },
  a3c_lv: { shows: 'LV', acquire: 'Wall motion; strain' },
  a3c_av: { shows: 'Aortic valve, LVOT, proximal aorta', acquire: 'Aortic valve and LVOT color Doppler' },
  sc4c: { shows: 'Liver, LV, mitral valve, RV, tricuspid valve, atrial and ventricular septa, RA, LA', acquire: 'RV free wall thickness; septal defects; color Doppler of the atrial septum' },
  sc4c_ias: { shows: 'Atrial septum, perpendicular to the beam', acquire: 'Septal defects; color Doppler across the septum' },
  sc_ivc: { shows: 'IVC in long axis through the liver, hepatic veins, IVC–RA junction', acquire: 'IVC diameter 1 to 2 cm from the RA and its collapse; hepatic vein PW Doppler' },
  sc_aorta: { shows: 'Upper abdominal aorta behind the liver, celiac trunk, SMA', acquire: 'Color and PW Doppler of aortic flow (appendix view)' },
  ssn: { shows: 'Ascending aorta, arch, descending aorta, head vessels, right PA', acquire: 'Color Doppler of the arch; PW Doppler of the ascending and descending aorta; CW Doppler of the descending aorta' },
  ssn_sax: { shows: 'Arch in cross-section, right PA along its length, LA', acquire: 'Right PA size; LA and the pulmonary veins' },
};
const WIN_KEYS = WINDOWS.map((w) => w.key);
const NINE = ['plax', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a2c', 'a3c', 'sc4c', 'ssn'];
const PRESETS = {
  nine: NINE,
  long: ['plax', 'plax_asc', 'rv_in', 'rv_out'],
  stack: ['psax_av', 'psax_mv', 'psax_pm', 'psax_ap'],
  apical: ['a4c', 'a5c', 'a2c', 'a3c'],
  all: PLANE_VIEWS,
};
/** The view with a plane of its own (PLANE_VIEWS) whose plane view k shares, or null. */
const PARENT = Object.fromEntries(Object.keys(VIEWS).map((k) => [k, PLANE_VIEWS.includes(k) ? k
  : PLANE_VIEWS.find((j) => VIEWS[j].plane === VIEWS[k].plane && VIEWS[j].level === VIEWS[k].level) || null]));
const SNAME = Object.fromEntries(STRUCTS.map((s) => [s.id, s]));
// labels for a plane that is not a standard view: any structure lying on it
const GENERIC = [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA'], ['ivs', 'IVS'], ['ias', 'IAS'], ['mv', 'MV'], ['tv', 'TV'], ['av', 'AV'], ['pv', 'PV'],
  ['ao', 'Ao'], ['mpa', 'PA'], ['apex', 'apex'], ['desc', 'desc Ao'], ['arch', 'arch'], ['ivcl', 'IVC'], ['svc', 'SVC']];
// A plane is judged by the anatomy it holds: the angle between the planes and how far the
// view's imaged centre lies off the free plane. Near: within 20 degrees and 3 cm; on it (it
// settles there when let go): within 10 degrees and 1.5 cm.
const NEAR = { deg: 20, cm: 3.0 }, ON = { deg: 10, cm: 1.5 };
const FREE_KEYS = ['prot', 'ptilt', 'prock', 'pslide', 'psweep'];

let T = null, EM = null;       // three.js and echo.js, loaded with the stage
let stage = null, pane = null, echo = null, model = null, ready = null, failed = false, fig = null, on = false;
let st = null, setState = null, labels = null, ink = null, bodyKey = null;
let group = null, crossLines = null, marker = null, curFan = null, nearFan = null, anchors = null, geoms = null, pv = -1;
const fans = new Map();
let labelBoxes = [], tick = 0, down = null, hover = null, nearInfo = null, lastMeas = '';

const sel = (s = st) => (s.pviews ? s.pviews.split(',').filter((k) => HAS[k]) : []);
const winColor = (win) => getComputedStyle(document.documentElement).getPropertyValue(`--w-${win}`).trim() || '#555';
const cssVar = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

function note(msg) {
  const n = fig && fig.querySelector('#planes-note');
  if (n) n.textContent = msg;
}

function fillViewRow(win) {
  const seg = document.getElementById('view-seg');
  if (!seg || seg.dataset.win === win) return;
  seg.dataset.win = win;
  seg.innerHTML = ORDER[win].map((k) => `<button type="button" data-val="${k}" aria-pressed="${String(st.view === k)}">${SHORT[k]}</button>`).join('');
}

/** Take the probe to view k: with the free plane on, by the free plane's moves (goTo). */
function goView(k, extra = {}) {
  if (!VIEWS[k]) return;
  if (st.pfree && geoms && geoms[k]) {
    if (Object.keys(extra).length) setState({ ...extra, playing: false });
    goTo(k);
    return;
  }
  setState({ win: VIEWS[k].win, view: k, ...extra, playing: false });
}

// ---------------------------------------------------------------- geometry
/** Angle between two view planes, degrees (0 to 90). */
function planeAngle(a, b) {
  return (Math.acos(Math.min(1, Math.abs(a.n.dot(b.n)))) * 180) / Math.PI;
}

const planeOf = (g) => (g ? new T.Plane().setFromNormalAndCoplanarPoint(g.n.clone(), g.O) : null);

// ---------------------------------------------------------------- 3D objects of All planes
/** A fan in All planes (gl/fans.js), on plane g with the view settings spec, in color col. */
function newFan(g, spec, col) {
  const f = new Fan(g, spec, col, pane.pencil.rtNormal.depthTexture);   // the fans draw in All planes only
  group.add(f.obj);
  return f;
}
const makeFan = (k) => newFan(geoms[k], VIEWS[k], rgb(winColor(VIEWS[k].win)));
const dropFan = (f) => f.dispose();

function syncFans() {
  if (!group) return;
  const want = new Set(sel().filter((k) => geoms[k]));
  for (const [k, f] of fans) if (!want.has(k)) { dropFan(f); fans.delete(k); }
  for (const k of want) if (!fans.has(k)) fans.set(k, makeFan(k));
  retheme3d();
  style();
}

/** The view whose plane the probe is on: the current view's own (PARENT), or null. */
const focus = (s = st) => PARENT[s.view] || null;

/** Lines where the current plane crosses the planes on show. */
function syncCrossings() {
  const pts = [];
  const g = echo && echo.g;
  if (g) {
    const sg = echo.specOf(echo.view), f = focus();
    for (const j of fans.keys()) {
      if (j === f && !st.pfree) continue;
      const c = crossing(g, sg, geoms[j], VIEWS[j]);
      if (c) pts.push(c.a.x, c.a.y, c.a.z, c.b.x, c.b.y, c.b.z);
    }
  }
  crossLines.geometry.dispose();
  crossLines.geometry = new T.BufferGeometry();
  crossLines.geometry.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
}

// ---------------------------------------------------------------- free plane
/**
 * The free plane: the current view's plane moved as a probe is. Rotate turns it about the
 * beam (clockwise from the probe for +), tilt turns the beam across the plane, rock turns it
 * within the plane (toward screen-right for +); slide and sweep move the probe along and
 * across the plane.
 */
function freePose(s = st) {
  const b = echo && echo.geoms[s.view];
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
 * (the current view's): the angle between the planes, and how far the view's imaged centre
 * lies off g (it must also lie within the sector's reach in g). The angle counts the side the
 * marker is on: the same plane turned 180° shows the heart mirrored and is not the view
 * (`flip` names that view). A plane from another window can lie close to g (the apical and
 * subcostal four-chamber planes do) but is another view. Where two views share a plane, the
 * closer beam direction decides.
 */
function nearest(g, from = st.view) {
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
  const b = VIEWS[st.view] || VIEWS.a4c;
  const on = nearInfo && nearInfo.on;
  return { angle: b.angle, depth: b.depth, near: b.near, liver: b.liver, short: on ? VIEWS[nearInfo.k].short : 'FREE', name: 'Free plane',
    labels: on ? VIEWS[nearInfo.k].labels : GENERIC, strict: !on };
}

/** The ghost of a near view that is not on show. */
function drawNear() {
  if (nearFan) { dropFan(nearFan); nearFan = null; }
  const nb = nearInfo;
  if (!st.pfree || !nb || !nb.near || fans.has(nb.k)) return;
  nearFan = newFan(geoms[nb.k], VIEWS[nb.k], rgb(winColor(VIEWS[nb.k].win)));
  nearFan.mat.uniforms.uAlpha.value = 0.08;
  nearFan.lmat.opacity = 0.9;
  nearFan.probe.visible = false;
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
  drawNear();
  style();
  // a move to another window takes longer: the probe lifts and crosses the chest
  const Tm = crossMove ? 2600 : undefined;
  if (g) echo.setGeometry(g, freeSpec(), { animate, T: Tm, instant: !animate });
  else echo.setView(st.view, { animate, T: Tm });
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
let glide = null, gliding = false, crossMove = false, zeroing = false;

/** Ease the probe controls from where they are to `to` (zero: the current view itself). */
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
 * current view, then moves over to the new window.
 */
function goTo(k) {
  if (!geoms || !geoms[k] || !st.pfree) return;
  if (k === st.view) { startGlide(); return; }
  const g = freePose();
  const c = g && site(k) === site(st.view) ? controlsFor(g, geoms[k]) : null;
  if (c && FREE_KEYS.every((key) => Math.abs(c[key]) <= RANGE[key])) {
    glide = null;
    set0({ win: VIEWS[k].win, view: k, ...c });
    startGlide();
  } else {
    startGlide({}, () => { crossMove = true; set0({ win: VIEWS[k].win, view: k }); crossMove = false; });
  }
}

/** On letting go of a control: a plane on a standard view settles onto it. */
function release() {
  if (!st.pfree) return;
  const nb = nearest(freePose());
  if (!nb || !nb.on) return;
  set0({ win: VIEWS[nb.k].win, view: nb.k, prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0 });
}

// ---------------------------------------------------------------- the panes
/** The look of each fan: the current view's bold, the rest by the structure chosen. */
function style() {
  if (!group) return;
  const S = st.pstruct !== 'none' ? st.pstruct : null, f = focus();
  for (const [k, fan] of fans) {
    const isF = k === f && !st.pfree;
    const has = S ? HAS[k].includes(S) : true;
    const near = (st.pfree && nearInfo && nearInfo.near && nearInfo.k === k) || hover === k;
    fan.mat.uniforms.uAlpha.value = S ? (has ? (isF ? 0.3 : 0.16) : 0.025) : (isF ? 0.3 : near ? 0.2 : 0.07);
    fan.lmat.opacity = S ? (has ? 0.95 : 0.14) : (isF || near ? 1 : 0.42);
    fan.probe.material.opacity = S && !has ? 0.1 : 0.35;
  }
  syncCrossings();
  crossLines.visible = st.plines;
  const s = S && SNAME[S];
  const P = s && s.anchor ? anchors[s.anchor] : null;
  marker.visible = !!P;
  if (P) marker.position.copy(P);
}

function retheme3d() {
  if (!group) return;
  for (const [k, f] of fans) f.setColor(rgb(winColor(VIEWS[k].win)));
  const ink3 = rgb(cssVar('--ink'));
  if (curFan) curFan.setColor(ink3);
  crossLines.material.color.setRGB(...ink3);
  marker.material.color.setRGB(...rgb(cssVar('--flag')));
}

/** The camera of All planes: a viewpoint, or square to the current plane (en face). */
function camera(instant = false) {
  if (!pane) return;
  const A = model.anat;
  if (st.pcam === 'plane') {
    // square to the current plane, turned as its echo is: probe at the top
    const g = st.pfree ? freePose() : echo.geoms[st.view];
    if (g) {
      const depth = (VIEWS[st.view] || VIEWS.a4c).depth;
      pane.view(g.n.clone(), g.d.clone().negate(), 0.16 * depth, g.O.clone().addScaledVector(g.d, depth * 0.5), instant);
      return;
    }
  }
  if (st.pcam === 'apex') pane.view(A.axis.clone(), A.anterior.clone(), 2.6, A.point('lv_eq', 0, 0), instant);
  else if (st.pcam === 'side') pane.view(A.lateral.clone().negate(), A.axis.clone(), 2.9, stage.center, instant);
  else pane.view(new T.Vector3(-0.38, -0.2, -1).normalize(), new T.Vector3(0, 1, 0), 3.1, stage.center, instant);
}

// The All planes pane draws the scene as its own: the fans, the heart whole (or cut, or hidden),
// no pericardium, the whole liver in the subcostal views and the body figure. The cross-section
// pane (the stage's own) keeps the scene as the echo sets it: cut on the plane, its sector.
let saved = null;
const pLiver = { a: 0, a0: 0, a1: 0, t0: 0, T: 700 };
function prepare(p) {
  group.visible = true;
  if (echo.overlay) echo.overlay.visible = false;
  // the pencil probe, 13 cm long, stands in front of the heart in the parasternal views: here
  // the current plane's own probe marks it
  if (echo.probeRoot) echo.probeRoot.visible = false;
  stage.heart.setPericardium(false);
  stage.heart.group.visible = !!st.pheart;
  const cut = st.pcut ? planeOf(echo.g) : null;
  stage.heart.setCut(cut);
  const L = echo.liver3d;
  if (L) {
    saved = [L.liver.alpha, L.layer.alpha];
    L.liver.setAlpha(pLiver.a);
    L.layer.setAlpha(0);
    L.setCut(cut);
  }
  const W = p.pencil.w * p.pencil.dpr, H = p.pencil.h * p.pencil.dpr;
  for (const f of [...fans.values(), curFan, nearFan]) if (f) f.setRes(W, H);
}
function restore() {
  group.visible = false;
  if (echo.overlay) echo.overlay.visible = true;
  if (echo.probeRoot) echo.probeRoot.visible = true;
  stage.heart.setPericardium(true);
  stage.heart.group.visible = true;
  const cut = planeOf(echo.g);
  stage.heart.setCut(cut);
  const L = echo.liver3d;
  if (L && saved) {
    L.liver.setAlpha(saved[0]);
    L.layer.setAlpha(saved[1]);
    L.setCut(cut);
  }
}
/** The liver of All planes: the whole liver in the subcostal views, faded as the plane moves. */
function liverTo(T0 = 700) {
  const v = VIEWS[st.view], a1 = v && v.win === 'sub' ? 1 : 0;
  if (a1 === pLiver.a1) return;
  Object.assign(pLiver, { a0: pLiver.a, a1, t0: performance.now(), T: reducedMotion ? 1 : T0 });
}
function stepLiver() {
  const u = Math.min(1, (performance.now() - pLiver.t0) / pLiver.T);
  pLiver.a = pLiver.a0 + (pLiver.a1 - pLiver.a0) * u * u * (3 - 2 * u);
}

/** Probe and body: the body figure in a corner of All planes, its probe at the window. */
async function body(want) {
  if (want && !bodyKey) {
    const { BodyKey } = await import('../gl/bodykey.js');
    if (!bodyKey) {
      bodyKey = new BodyKey(model.heart.meshes.Myocardium, model.anat);
      bodyKey.retheme(tokens());
    }
  }
  if (!pane) return;
  pane.inset = st.wbody && bodyKey ? bodyKey : null;
  keySite();
}
function keySite() {
  const g = echo && echo.g;
  if (!pane || !pane.inset || !g) return;
  const spec = echo.specOf(echo.view), v = VIEWS[st.view] || VIEWS.plax;
  bodyKey.setView(v.win, g.O.clone().addScaledVector(g.d, spec.depth * 0.45), g.r, spec);
}

// ---------------------------------------------------------------- setup
async function ensure() {
  if (failed) throw new Error('3D view unavailable');
  if (!ready) {
    ready = (async () => {
      T = await import('../../vendor/three.bundle.min.js');
      model = await loadModel();
      EM = await import('../echo.js');
      stage = await sharedStage();
      pane = stage.addPane();
      echo = new EM.EchoView(model, fig.querySelector('#windows-canvas'), { stage });
      echo.showOverlay(false);
      echo.top = 42;
      echo.section = true;
      echo.retheme();
      labels = new Labels(fig.querySelector('#windows-overlay'));
      group = new T.Group();
      group.visible = false;   // drawn in All planes only (prepare)
      crossLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x22272b, transparent: true, opacity: 0.55, depthTest: false }));
      crossLines.renderOrder = 4;
      marker = new T.Mesh(new T.SphereGeometry(0.42, 20, 14), new T.MeshBasicMaterial({ color: 0xb23a2e, depthTest: false }));
      marker.renderOrder = 5;
      group.add(crossLines, marker);
      stage.overlayScene.add(group);
      takeHeart();
      // the current plane in ink: the sector the probe images, in each frame where the echo has it
      curFan = newFan(geoms.plax, VIEWS.plax, rgb(cssVar('--ink')));
      curFan.mat.uniforms.uAlpha.value = 0.2;
      curFan.lmat.opacity = 1;
      curFan.probe.material.opacity = 0.6;
      pane.prepare = prepare;
      pane.restore = restore;
      pane.layer = echo.liver3d;
      retheme3d();
      return true;
    })().catch((err) => { failed = true; console.error('Views 3D failed:', err); note('The 3D view could not be started on this device.'); throw err; });
  }
  return ready;
}

function sizeInk() {
  const r = fig.querySelector('.pane-planes').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (ink.width !== Math.round(w * dpr) || ink.height !== Math.round(h * dpr)) {
    ink.width = Math.round(w * dpr);
    ink.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

/** Tags for the planes, the structure and the body axes, drawn over All planes. */
function drawInk() {
  const { w, h, dpr } = sizeInk();
  const ctx = ink.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const paper = cssVar('--paper'), inkc = cssVar('--ink');
  const S = st.pstruct !== 'none' ? st.pstruct : null;
  // what a tag must not cover: the tags already down, the pane's name and note, the body figure
  const placed = [];
  const host = ink.getBoundingClientRect();
  for (const e of fig.querySelectorAll('.pane-planes .pane-label, #planes-note')) {
    if (!e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    placed.push({ x: (r.left + r.right) / 2 - host.left, y: (r.top + r.bottom) / 2 - host.top, w: r.width, h: r.height });
  }
  if (pane.inset && bodyKey) {
    const r = bodyKey.rect(w, h);
    placed.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w + 8, h: r.h + 8 });
  }
  labelBoxes = [];
  const tag = (text, x, y, color, bold, key) => {
    ctx.font = `${bold ? 700 : 600} ${bold ? 13 : 12}px ${SANS}`;
    const tw = ctx.measureText(text).width;
    const free = (yy) => !placed.some((p) => Math.abs(p.x - x) < (p.w + tw) / 2 + 4 && Math.abs(p.y - yy) < ((p.h || 15) + 15) / 2);
    // the nearest free place above or below
    let yy = null;
    for (const dy of [0, 15, -15, 30, -30, 45, -45, 60, -60]) if (free(y + dy)) { yy = y + dy; break; }
    if (yy === null || x < 4 || x > w - 4 || yy < 10 || yy > h - 10) return;
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
  const f = focus();
  const view = new T.Vector3();
  pane.camera.getWorldDirection(view);
  // the current plane, at rest on a view that is not on show: its code in ink. Its probe seen
  // end-on hides the middle of the heart, as a fan's does
  const g = echo.g;
  if (g) curFan.probe.visible = Math.abs(g.d.dot(view)) < 0.8;
  if (g && !echo.tr && !(f && fans.has(f) && !st.pfree)) {
    const spec = echo.specOf(echo.view);
    const p = pane.project(g.O.clone().addScaledVector(g.d, spec.depth * 0.8));
    const text = st.pfree ? (nearInfo && nearInfo.on && !moved() ? CODE[nearInfo.k] : 'Free') : CODE[st.view];
    if (p.z < 1) tag(text, p.x, p.y, inkc, true, null);
  }
  // plane tags: on the center line of each fan, as far out as the figure allows
  const order = [...fans.keys()].sort((a, b) => (b === f) - (a === f));
  for (const k of order) {
    const gk = geoms[k], spec = VIEWS[k];
    // a probe seen end-on hides the middle of the heart
    // and the probe on the current plane is the ink one
    fans.get(k).probe.visible = !(k === f && !st.pfree) && Math.abs(gk.d.dot(view)) < 0.8;
    let p = null;
    for (let t = spec.depth * 0.94; t > 2; t -= 0.5) {
      const q = pane.project(gk.O.clone().addScaledVector(gk.d, t));
      if (q.z < 1 && q.x > 36 && q.x < w - 36 && q.y > 30 && q.y < h - 56) { p = q; break; }
    }
    if (!p) continue;
    const dim = S && !HAS[k].includes(S);
    ctx.globalAlpha = dim ? 0.35 : 1;
    tag(CODE[k], p.x, p.y, winColor(spec.win), k === f && !st.pfree, k);
    ctx.globalAlpha = 1;
  }
  // a near view that is not on show
  if (nearFan && nearInfo) {
    const pos = nearFan.outline.geometry.attributes.position;
    const m = (pos.count - 1) >> 1;
    const O = new T.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)), E = new T.Vector3(pos.getX(m), pos.getY(m), pos.getZ(m));
    const p = pane.project(O.lerp(E, 0.8));
    if (p.z < 1) tag(CODE[nearInfo.k], p.x, p.y, winColor(VIEWS[nearInfo.k].win), false, null);
  }
  // the structure
  if (S && marker.visible) {
    const p = pane.project(marker.position);
    tag(SNAME[S].name, p.x, p.y - 16, cssVar('--flag'), true, null);
  }
  // body axes: patient left, superior, anterior; above the note, which wraps on phones
  const nt = document.getElementById('planes-note');
  const ox = 34, oy = Math.min(h - 34, (nt && nt.offsetParent ? nt.offsetTop : h) - 36);
  const axes = [[new T.Vector3(1, 0, 0), 'L'], [new T.Vector3(0, 1, 0), 'S'], [new T.Vector3(0, 0, 1), 'A']];
  ctx.font = `600 10px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [v, name] of axes) {
    const d = v.clone().transformDirection(pane.camera.matrixWorldInverse);
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

/** Tags for the cross-section, in columns beside the sector. */
function sectionTags(stg) {
  if (!labels) return;
  if (!st.wlabels) { labels.update([], null, 1, 1); return; }
  const host = fig.querySelector('.pane-section').getBoundingClientRect();
  // the pane's name stays clear of the tags
  const keep = ['#windows-3dlabel'].map((q) => fig.querySelector(q)).filter((e) => e && e.offsetParent).map((e) => {
    const r = e.getBoundingClientRect();
    return { x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top };
  });
  // laid out at end-diastole, so the tags hold still through the beat and none comes and goes
  // with it; each leader starts where its structure is now
  // a narrow pane (a phone) takes the views' short names: RVOT, IVS
  const short = host.width < 340;
  const now = new Map(echo.sectionLabels(stg.state.s, short).map((it) => [it.id, it]));
  labels.update(echo.sectionLabels(0, short), echo.sectorBox(), host.width, host.height, keep, now);
}

/** The planes and structure points of the heart shown (a new heart: model3d.js). */
function takeHeart() {
  pv = model.pheno.version;
  geoms = {};
  for (const k of PLANE_VIEWS) { const g = EM.viewGeometry(model.anat, k); if (g) geoms[k] = g; }
  anchors = echo.anchors(0);
  // papillary muscles: the middle of their mesh
  const pap = model.heart.meshes.Papillary;
  if (pap) {
    pap.updateMatrixWorld(true);
    anchors.lvc = new T.Box3().setFromObject(pap).getCenter(new T.Vector3());
  }
  if (!group) return;
  for (const f of fans.values()) dropFan(f);
  fans.clear();
  syncFans();
  if (st.pfree && on) syncFree(false);
}

function onFrame(stg) {
  if (!echo) return;
  if (model.pheno.version !== pv) takeHeart();
  // the plane, eased: each pane follows it in each frame
  echo.advance();
  const g = echo.g;
  curFan.obj.visible = !!g;
  if (g) curFan.shape(g, echo.specOf(echo.view));
  // at rest on a view on show, the view's own fan carries the color: the ink keeps its outline
  const f = focus();
  curFan.mat.uniforms.uAlpha.value = !st.pfree && !echo.tr && f && fans.has(f) ? 0.04 : 0.16;
  if (echo.tr || st.pfree) syncCrossings();
  stepLiver();
  if (pane.inset && echo.tr) keySite();
  drawInk();
  sectionTags(stg);
  if (tick++ % 2) return;   // about 30 frames a second is enough for the echo
  // the scanner line sits under the view's name, which takes two lines on a phone
  const lab = fig.querySelector('#windows-label');
  if (lab && lab.offsetParent) echo.top = 32 + Math.max(10, lab.offsetHeight);
  echo.labels = false;      // the tags name the structures on the cross-section, not on the echo
  echo.calipers = !st.wcine;
  if (echo.g) echo.frame({ ...stg.state });
  else echo.drawEmpty();
  const m = echo.measure;
  const key = m && m.lvid ? `${m.ivs.toFixed(1)}/${m.lvid.toFixed(1)}/${m.pw.toFixed(1)}` : '';
  if (key !== lastMeas) { lastMeas = key; setState({ wmeas: key }); }
}

async function enter() {
  on = true;
  try { await ensure(); } catch (e) { return; }
  if (!on) return;
  stage.onError = (err) => note(`The 3D view stopped: ${String(err.message || err).slice(0, 120)}`);
  stage.attach(fig.querySelector('.pane-section .gl-host'));
  pane.attach(fig.querySelector('.pane-planes .gl-host'));
  pane.on = true;
  stage.opts.beat = st.wcine;
  stage.opts.stillPhase = 0;
  stage.heart.group.visible = true;
  stage.heart.setPericardium(true);
  echo.showOverlay(true);
  syncFans();
  stage.resize();
  pane.resize();
  echo.resize();
  if (st.pfree) syncFree(false);
  else echo.setView(st.view, { animate: false });
  liverTo(1);
  pLiver.t0 = 0;
  stepLiver();
  await body(st.wbody);
  if (!on) return;
  stage.onFrame = onFrame;
  fig.classList.add('gl-ready');
  camera(true);
  stage.start();
  // the text again, now with the model's planes (the angles between them)
  if (!st.wready) setState({ wready: true });
}

/**
 * The view whose sector is under the pointer (a client point), or null: of the sectors there,
 * the nearest one that is not the current view, else the current one.
 */
function fanAt(cx, cy) {
  if (!stage || !on || !fans.size) return null;
  const c = pane.pencil.canvas.getBoundingClientRect();
  if (!c.width || !c.height) return null;
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(((cx - c.left) / c.width) * 2 - 1, -((cy - c.top) / c.height) * 2 + 1), pane.camera);
  const meshes = [];
  for (const [k, f] of fans) {
    f.mesh.userData.view = k;
    meshes.push(f.mesh);
  }
  const hits = ray.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const other = hits.find((hh) => hh.object.userData.view !== focus());
  return (other || hits[0]).object.userData.view;
}

function buildChips() {
  const host = document.getElementById('planes-views');
  if (!host) return;
  host.innerHTML = WINDOWS.map((w) => {
    const ks = PLANE_VIEWS.filter((k) => VIEWS[k].win === w.key);
    return `<div class="win" style="--c: var(--w-${w.key})"><span>${w.name}</span>${ks.map((k) => `<button type="button" class="chip" data-view="${k}" aria-pressed="false" title="${VIEWS[k].name}">${CODE[k]}</button>`).join('')}</div>`;
  }).join('');
  // a click: a plane not on show is shown and the probe goes to it; a plane on show takes the
  // probe; the plane the probe is on goes from the set
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    const k = b.dataset.view;
    const list = sel();
    const i = list.indexOf(k);
    if (i < 0) { list.push(k); goView(k, { pviews: list.join(',') }); return; }
    if (focus() !== k || st.pfree) { goView(k); return; }
    list.splice(i, 1);
    setState({ pviews: list.join(','), playing: false });
  });
  const sets = document.getElementById('planes-sets');
  sets?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]');
    if (!b) return;
    const list = b.dataset.set === 'none' ? [] : PRESETS[b.dataset.set];
    const cam = { apical: 'apex', stack: 'side' }[b.dataset.set];
    setState({ pviews: list.join(','), ...(cam ? { pcam: cam } : {}), playing: false });
  });
  const mtx = document.getElementById('planes-matrix');
  mtx?.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { goView(v.dataset.view); return; }
    const r = e.target.closest('[data-struct]');
    if (r) setState({ pstruct: st.pstruct === r.dataset.struct ? 'none' : r.dataset.struct, playing: false });
  });
}

function syncChips() {
  const list = sel();
  const S = st.pstruct !== 'none' ? st.pstruct : null, f = focus();
  for (const b of document.querySelectorAll('#planes-views button[data-view]')) {
    const k = b.dataset.view;
    b.setAttribute('aria-pressed', String(list.includes(k)));
    b.classList.toggle('is-focus', k === f);
    b.classList.toggle('has', !!S && HAS[k].includes(S));
    b.classList.toggle('dim', !!S && !HAS[k].includes(S));
  }
}

function matrix() {
  const t = document.getElementById('planes-matrix');
  if (!t) return;
  const views = sel();
  if (!views.length) { t.innerHTML = ''; return; }
  const S = st.pstruct !== 'none' ? st.pstruct : null, f = focus();
  const rows = STRUCTS.filter((s) => s.id === S || views.some((k) => HAS[k].includes(s.id)));
  t.innerHTML = `<caption>Structures in each view</caption>
    <thead><tr><th scope="col">Structure</th>${views.map((k) => `<th scope="col" class="v${k === f ? ' fcol' : ''}" data-view="${k}" style="--c: var(--w-${VIEWS[k].win})" title="${VIEWS[k].name}"><span>${CODE[k]}</span></th>`).join('')}</tr></thead>
    <tbody>${rows.map((s) => `<tr data-struct="${s.id}"${s.id === S ? ' class="cur"' : ''}><th scope="row">${s.name}</th>${views.map((k) => `<td class="${k === f ? 'fcol' : ''}" style="--c: var(--w-${VIEWS[k].win})">${HAS[k].includes(s.id) ? '●' : ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function listNames(keys) {
  const names = keys.map((k) => CODE[k]);
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default {
  key: 'windows',
  part: 'views',
  title: 'Views',
  dwell: 36,
  // wcine: the beat runs all the time (no control); off, the PLAX calipers would show
  defaults: { win: 'plax', view: 'plax', wcine: true, wlabels: true, wbody: false, wmeas: '', wready: false,
    pviews: NINE.join(','), pstruct: 'none', pcam: 'front', pheart: true, pcut: false, plines: true,
    pfree: false, prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0 },
  watch: ['win', 'view', 'wcine', 'wlabels', 'wbody', 'wmeas', 'wready', 'pviews', 'pstruct', 'pcam', 'pheart', 'pcut', 'plines', 'pfree', ...FREE_KEYS],
  pulse: () => (stage ? stage.pulse() : null),
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
    fig = document.getElementById('fig-windows');
    ink = fig.querySelector('#planes-ink');
    fillViewRow(state.win);
    const host = fig.querySelector('.pane-planes');
    host.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    // a click (not a drag) on a plane's tag or on its sector takes the probe to that view
    const tagAt = (e) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return labelBoxes.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    };
    host.addEventListener('click', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const hit = tagAt(e);
      const k = hit ? hit.key : fanAt(e.clientX, e.clientY);
      if (k) goView(k);
    });
    // on hover, the sector a click would take lights up as a near view does
    const hoverOn = (k) => { if (k !== hover) { hover = k; style(); } };
    host.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') return;
      const hit = tagAt(e), k = hit ? hit.key : fanAt(e.clientX, e.clientY);
      host.style.cursor = k ? 'pointer' : '';
      hoverOn(k || null);
    });
    host.addEventListener('pointerleave', () => { host.style.cursor = ''; hoverOn(null); });
    buildChips();
    for (const k of FREE_KEYS) document.getElementById(k)?.addEventListener('change', release);
    document.getElementById('pfree-reset')?.addEventListener('click', () => startGlide());
    const pick = document.getElementById('pgoto');
    if (pick) {
      pick.innerHTML = WINDOWS.map((w) => {
        const ks = PLANE_VIEWS.filter((k) => VIEWS[k].win === w.key);
        return ks.length ? `<optgroup label="${w.name}">${ks.map((k) => `<option value="${k}">${VIEWS[k].name}</option>`).join('')}</optgroup>` : '';
      }).join('');
      pick.value = PARENT[st.view] || 'plax';
      pick.addEventListener('change', () => goTo(pick.value));
    }
    const seg = document.querySelector('.seg[data-key="pstruct"]');
    if (seg) seg.insertAdjacentHTML('beforeend', STRUCTS.filter((s) => s.id !== 'abd').map((s) => `<button type="button" data-val="${s.id}" title="${s.name}">${s.short}</button>`).join(''));
    syncChips();
  },
  enter() { enter(); },
  leave() {
    on = false;
    hover = null;
    glide = null;
    if (labels) labels.update([], null, 1, 1);
    if (nearFan) { dropFan(nearFan); nearFan = null; }
    if (pane) { pane.on = false; pane.inset = null; }
    if (group) group.visible = false;
    if (echo) echo.showOverlay(false);
    if (stage) {
      stage.opts.labeled = false;
      stage.inset = null;
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
    pane.resize();
    if (echo) {
      echo.resize();
      if (st.pfree) syncFree(false); else echo.setView(st.view, { animate: false });
    }
    camera(true);
  },
  retheme() {
    if (stage) stage.retheme();
    if (echo) echo.retheme();
    if (bodyKey) bodyKey.retheme(tokens());
    retheme3d();
  },
  onState(s, ch) {
    if (!gliding && glide && (FREE_KEYS.some((k) => k in ch) || 'view' in ch || 'pfree' in ch)) glide = null;
    // a window button: its first view; a view of another window: that window
    if ('win' in ch) {
      fillViewRow(s.win);
      if (!('view' in ch) && VIEWS[s.view].win !== s.win) { setState({ view: ORDER[s.win][0] }); return; }
    }
    if ('view' in ch && VIEWS[s.view].win !== s.win) setState({ win: VIEWS[s.view].win });
    // a new view with the free plane on, from any control but the free plane's own moves: the
    // probe goes to that view itself (the move below eases there)
    if ('view' in ch && s.pfree && !gliding && moved(s)) {
      zeroing = true;
      try { setState({ prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0 }); } finally { zeroing = false; }
    }
    const pick = document.getElementById('pgoto');
    if (pick && ('view' in ch || 'chapter' in ch) && PARENT[s.view]) pick.value = PARENT[s.view];
    if ('pviews' in ch || 'view' in ch || 'pstruct' in ch) syncChips();
    const lab = fig && fig.querySelector('#windows-label');
    if (lab && ('view' in ch || 'pfree' in ch || 'chapter' in ch || FREE_KEYS.some((k) => k in ch))) {
      // the free plane takes the name of the view it lies on
      lab.textContent = s.pfree && moved(s) ? 'Free plane' : VIEWS[s.view].name;
    }
    const freeBox = document.getElementById('planes-free');
    if (freeBox && 'pfree' in ch) freeBox.hidden = !s.pfree;
    if (!stage || !echo || !on || !group) return;
    if ('pviews' in ch) syncFans();
    else if ('view' in ch || 'pstruct' in ch || 'plines' in ch || 'pcut' in ch || 'pfree' in ch) style();
    if (s.pfree || 'pfree' in ch) {
      // the free plane: animate when it moves onto a view (a snap or a new view), follow the controls directly
      if (!zeroing && ('pfree' in ch || 'view' in ch || FREE_KEYS.some((k) => k in ch))) syncFree('view' in ch || ('pfree' in ch && !s.pfree));
    } else if ('view' in ch) echo.setView(s.view);
    if ('view' in ch || 'pfree' in ch) { liverTo(echo.tr ? echo.tr.T : 700); keySite(); }
    if ('wbody' in ch) body(s.wbody);
    if ('wcine' in ch) stage.opts.beat = s.wcine;
    // square to the plane: a new view turns the camera with it (the free plane turns it in syncFree)
    if ('pcam' in ch || ('view' in ch && s.pcam === 'plane' && !s.pfree)) camera();
  },
  key_(k, set, s) {
    if (k !== '[' && k !== ']') return;
    // every view in one row, window by window: past a window's last view comes the next
    // window's first, and past the last window the first again
    const all = WIN_KEYS.flatMap((w) => ORDER[w]);
    const i = all.indexOf(s.view), n = all.length;
    const v = all[(i + (k === ']' ? 1 : n - 1)) % n];
    set({ win: VIEWS[v].win, view: v, playing: false });
  },
  tourEnter(set) {
    set({ win: 'plax', view: 'plax', wcine: true, pviews: NINE.join(','), pstruct: 'none', pcam: 'front', pheart: true, pcut: false, plines: true,
      pfree: false, prot: 0, ptilt: 0, prock: 0, pslide: 0, psweep: 0 });
  },
  tourTick(tt, set, s) {
    const seq = ['plax', 'rv_in', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'ssn'];
    const v = seq[Math.min(seq.length - 1, Math.floor(tt / (this.dwell / seq.length)))];
    if (s.view !== v) set({ win: VIEWS[v].win, view: v });
  },
  text(s, { cite }) {
    const k = s.view, v = VIEWS[k], info = INFO[k];
    const m = echo && echo.measure && echo.measure.lvid ? echo.measure : null;
    const S = s.pstruct !== 'none' ? SNAME[s.pstruct] : null;
    const readouts = [
      { k: 'Probe movement', v: MOVE[k], text: true },
      { k: 'Shows', v: info.shows, text: true },
      { k: 'Recorded in this view', v: info.acquire, text: true },
    ];
    const nb = s.pfree && geoms && T && echo ? nearest(freePose(s), k) : null;
    if (nb) readouts.unshift({ k: 'Free plane', v: nb.on && !moved(s) ? `on ${CODE[nb.k]}` : nb.flip ? `${CODE[nb.flip]} plane, marker reversed` : `${Math.round(nb.deg)}° · ${nb.cm.toFixed(1)} cm off ${CODE[nb.k]}`, text: true });
    let live = '';
    if (nb) {
      live += `<b>Free plane.</b> ${nb.on && !moved(s) ? `The plane coincides with a standard view (${VIEWS[nb.k].name}).` : nb.near ? `The plane lies ${Math.round(nb.deg)}° from the plane of the nearest view (${VIEWS[nb.k].name}), whose center lies ${nb.cm.toFixed(1)} cm from the free plane.` : nb.flip ? `The plane is that of ${CODE[nb.flip]} with the marker on the opposite side, so the image is mirrored. A 180° rotation of the probe produces the standard view.` : 'No standard view lies near the plane.'} `;
      live += `The probe remains in the ${site(k)} window, so the plane is compared only with the views of that window. Within ${NEAR.deg}° and ${NEAR.cm} cm, the nearest view is marked; within ${ON.deg}° and ${ON.cm} cm, the plane settles onto that view when the control is released. `;
    }
    live += `<b>${v.name}.</b> `;
    if (!v.plane) live += 'The heart model ends at the diaphragm, so the model contains no section for this view. ';
    else if (k === 'plax' && m && !s.wcine) live += `At end-diastole, with calipers perpendicular to the LV long axis, the septum measures ${(m.ivs / 10).toFixed(1)} cm, the LV internal diameter ${(m.lvid / 10).toFixed(1)} cm and the inferolateral wall ${(m.pw / 10).toFixed(1)} cm. `;
    else if (v.zoom) live += `The image is magnified to a region ${v.zoom.w} cm wide. `;
    // the plane against the planes on show: the views of its window first (the rotations and
    // tilts between them), then the nearest others
    const g = echo && echo.geoms ? echo.geoms[k] : null;
    if (g && geoms) {
      const self = PARENT[k];
      const rel = sel(s).filter((j) => j !== self && geoms[j]).map((j) => ({ j, a: planeAngle(g, geoms[j]), same: VIEWS[j].win === v.win }));
      const par = rel.filter((r) => r.a < 3);
      const cross = [...rel.filter((r) => r.a >= 3 && r.same).sort((x, y) => x.a - y.a), ...rel.filter((r) => r.a >= 3 && !r.same).sort((x, y) => x.a - y.a)].slice(0, 3);
      if (cross.length) live += `In this model, its plane lies ${cross.map((r) => `${Math.round(r.a)}° from ${CODE[r.j]}`).join(', ')}. `;
      if (par.length) live += `${listNames(par.map((r) => r.j))} ${par.length > 1 ? 'are' : 'is'} parallel to this plane, ${par.map((r) => `${Math.abs(geoms[r.j].O.clone().sub(g.O).dot(g.n)).toFixed(1)} cm`).join(', ')} away. `;
    }
    if (S) {
      const views = sel(s);
      const inViews = views.filter((j) => HAS[j].includes(S.id));
      const all = Object.keys(HAS).filter((j) => HAS[j].includes(S.id));
      live += `The selected structure (<span class="k-red">${S.name}</span>) appears in ${all.length} of the ${Object.keys(HAS).length} standard views${inViews.length ? `; of the planes displayed, it lies in ${listNames(inViews)}` : ''}. `;
      if (!S.anchor) live += 'The heart model has no marker for this structure. ';
    }
    live += `<span class="note">Views and measurements are as defined in the ASE guideline${cite('mitchell2019')}. Annotation class: ${v.lab || 'none'}.</span>`;
    return { readouts, live, extra: () => matrix() };
  },
};
