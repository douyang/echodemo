// 07 Views: the canonical 2D views. Each view is a plane through the heart: left, the 3D heart
// cut on the plane, or with Probe and body the whole heart with the probe, the body figure and
// the planes of the nine standard views; right, the echo image that plane cuts from the same mesh.
import * as THREE from '../../vendor/three.bundle.min.js';
import { VIEWS, WINDOWS, ORDER, SHORT, MOVE, CODE } from '../views.js';
import { loadModel } from '../model3d.js';
import { sharedStage } from '../gl/shared.js';
import { Labels } from '../gl/stage3d.js';
import { Fan, crossing, rgb } from '../gl/fans.js';
import { SANS } from '../sketch.js';

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

let stage = null, echo = null, ready = null, failed = false, fig = null, tick = 0, labels = null;
let st = null, setState = null, lastMeas = '', on = false;

// ---------------------------------------------------------------- the planes of Probe and body
// The nine standard planes of 08 Planes (archived), in the Probe and body view only: each in the
// color of its window, the current view's lit, with the lines where the current plane crosses
// the others. The current plane is the echo's own fan, in ink. A click on a plane or on its tag
// takes the probe to that view.
const NINE = ['plax', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a2c', 'a3c', 'sc4c', 'ssn'];
/** The plane of the nine that view k lies on (the same plane and level), or null. */
const OF_NINE = Object.fromEntries(Object.keys(VIEWS).map((k) => [k, NINE.includes(k) ? k
  : NINE.find((j) => VIEWS[j].plane === VIEWS[k].plane && VIEWS[j].level === VIEWS[k].level) || null]));
const NOTE = { cut: 'Drag to orbit · Scroll or pinch to zoom', body: 'Drag to orbit · Scroll or pinch to zoom · Click a plane' };
const cssVar = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const winColor = (win) => cssVar(`--w-${win}`) || '#555';
let planes = null, ink = null, inkOn = false, labelBoxes = [], down = null, hover = null;

/** The nine fans (gl/fans.js) in the stage's overlay, made once: they read the heart's depth. */
function buildPlanes() {
  const group = new THREE.Group();
  group.visible = false;
  const fans = new Map();
  for (const k of NINE) {
    if (!echo.geoms[k]) continue;
    const f = new Fan(echo.geoms[k], VIEWS[k], rgb(winColor(VIEWS[k].win)), stage.pencil.rtNormal.depthTexture);
    // the pencil probe marks the current view, and the body figure shows it on the chest
    f.probe.visible = false;
    group.add(f.obj);
    fans.set(k, f);
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, depthTest: false }));
  lines.renderOrder = 4;
  lines.frustumCulled = false;
  group.add(lines);
  stage.overlayScene.add(group);
  planes = { group, fans, lines, geoms: echo.geoms, key: '', moving: false };
  retheme3d();
}

function retheme3d() {
  if (!planes) return;
  for (const [k, f] of planes.fans) f.setColor(rgb(winColor(VIEWS[k].win)));
  planes.lines.material.color.setRGB(...rgb(cssVar('--ink')));
  planes.key = '';
}

/** Show the planes with Probe and body, hide them with the cut. */
function showPlanes(want) {
  if (want && !planes && stage && echo) buildPlanes();
  if (planes) { planes.group.visible = !!want; planes.key = ''; }
  if (!want) {
    clearInk();
    hover = null;
    const host = fig && fig.querySelector('.pane-3d');
    if (host) host.style.cursor = '';
  }
}

function clearInk() {
  labelBoxes = [];
  if (!ink || !inkOn) return;
  ink.getContext('2d').clearRect(0, 0, ink.width, ink.height);
  inkOn = false;
}

/** Lines where the current plane crosses the other planes of the nine. */
function crossings() {
  const pts = [];
  const g = echo.g;
  if (g) {
    const sg = echo.specOf(echo.view), f0 = OF_NINE[st.view];
    for (const k of planes.fans.keys()) {
      if (k === f0) continue;
      const c = crossing(g, sg, echo.geoms[k], VIEWS[k]);
      if (c) pts.push(c.a.x, c.a.y, c.a.z, c.b.x, c.b.y, c.b.z);
    }
  }
  planes.lines.geometry.dispose();
  planes.lines.geometry = new THREE.BufferGeometry();
  planes.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}

/** Each frame with Probe and body: a new heart's planes, the look, the crossings, the tags. */
function planesFrame() {
  if (!planes || !st.wbody) return;
  if (planes.geoms !== echo.geoms) {
    planes.geoms = echo.geoms;
    for (const [k, f] of planes.fans) {
      if (!echo.geoms[k]) continue;
      f.shape(echo.geoms[k], VIEWS[k]);
      f.mesh.geometry.computeBoundingSphere();   // for the click's ray
    }
    planes.key = '';
  }
  const f0 = OF_NINE[st.view];
  const key = `${st.view}|${hover}`;
  if (key !== planes.key) {
    planes.key = key;
    for (const [k, f] of planes.fans) {
      f.mat.uniforms.uAlpha.value = k === f0 ? 0.26 : k === hover ? 0.2 : 0.07;
      f.lmat.opacity = k === f0 || k === hover ? 1 : 0.42;
    }
    crossings();
  } else if (echo.tr || planes.moving) crossings();   // the plane moves, and its crossings with it
  planes.moving = !!echo.tr;
  const W = stage.pencil.w * stage.pencil.dpr, H = stage.pencil.h * stage.pencil.dpr;
  for (const f of planes.fans.values()) f.setRes(W, H);
  drawTags(f0);
}

function sizeInk() {
  const r = ink.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (ink.width !== Math.round(w * dpr) || ink.height !== Math.round(h * dpr)) {
    ink.width = Math.round(w * dpr);
    ink.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

/**
 * The plane tags: each view's code on the center line of its fan, as far out as the pane
 * allows, in its window color, the current view's bold; a current view off the nine, its code
 * in ink. No tag covers another, the pane's name or note, or the body figure.
 */
function drawTags(f0) {
  if (!ink) return;
  const { w, h, dpr } = sizeInk();
  const ctx = ink.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  inkOn = true;
  const paper = cssVar('--paper'), inkc = cssVar('--ink');
  const placed = [];
  const host = ink.getBoundingClientRect();
  for (const e of fig.querySelectorAll('#windows-3dlabel, #windows-note')) {
    if (!e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    placed.push({ x: (r.left + r.right) / 2 - host.left, y: (r.top + r.bottom) / 2 - host.top, w: r.width, h: r.height });
  }
  if (stage.inset && stage.inset.rect) {
    const r = stage.inset.rect(w, h);
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
  const g = echo.g;
  if (g && !f0 && !echo.tr) {
    const p = stage.project(g.O.clone().addScaledVector(g.d, echo.specOf(echo.view).depth * 0.8));
    if (p.z < 1) tag(CODE[st.view] || VIEWS[st.view].short, p.x, p.y, inkc, true, null);
  }
  const order = [...planes.fans.keys()].sort((a, b) => (b === f0) - (a === f0));
  for (const k of order) {
    const gk = echo.geoms[k], spec = VIEWS[k];
    if (!gk) continue;
    let p = null;
    for (let t = spec.depth * 0.94; t > 2; t -= 0.5) {
      const q = stage.project(gk.O.clone().addScaledVector(gk.d, t));
      if (q.z < 1 && q.x > 36 && q.x < w - 36 && q.y > 30 && q.y < h - 56) { p = q; break; }
    }
    if (p) tag(CODE[k], p.x, p.y, winColor(spec.win), k === f0, k);
  }
}

/** The plane of the nine under the pointer: its tag, else the nearest fan the ray meets. */
function planeAt(e) {
  if (!planes || !ink) return null;
  const r = ink.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const b = labelBoxes.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  if (b) return b.key;
  const c = stage.pencil.canvas.getBoundingClientRect();
  if (!c.width || !c.height) return null;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - c.left) / c.width) * 2 - 1, -((e.clientY - c.top) / c.height) * 2 + 1), stage.camera);
  const meshes = [];
  for (const [k, f] of planes.fans) {
    f.mesh.userData.view = k;
    meshes.push(f.mesh);
  }
  const hits = ray.intersectObjects(meshes, false);
  if (!hits.length) return null;
  // the plane in front that is not the current one
  const f0 = OF_NINE[st.view];
  const other = hits.find((hh) => hh.object.userData.view !== f0);
  return (other || hits[0]).object.userData.view;
}

/** A click (not a drag) on a plane takes the probe there; on hover, the plane lights up. */
function pickPlanes(host) {
  host.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  host.addEventListener('click', (e) => {
    if (!st.wbody || !on || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const k = planeAt(e);
    if (k && OF_NINE[st.view] !== k) setState({ win: VIEWS[k].win, view: k });
  });
  host.addEventListener('pointermove', (e) => {
    if (!st.wbody || !on || e.buttons || e.pointerType === 'touch') return;
    const k = planeAt(e);
    host.style.cursor = k ? 'pointer' : '';
    hover = k;
  });
  host.addEventListener('pointerleave', () => { host.style.cursor = ''; hover = null; });
}

function note(msg) {
  const n = fig && fig.querySelector('#windows-note');
  if (n) n.textContent = msg;
}

function fillViewRow(win) {
  const seg = document.getElementById('view-seg');
  if (!seg || seg.dataset.win === win) return;
  seg.dataset.win = win;
  seg.innerHTML = ORDER[win].map((k) => `<button type="button" data-val="${k}" aria-pressed="${String(st.view === k)}">${SHORT[k]}</button>`).join('');
}

async function ensure() {
  if (failed) throw new Error('3D view unavailable');
  if (!ready) {
    ready = (async () => {
      const model = await loadModel();
      const e = await import('../echo.js');
      stage = await sharedStage();
      echo = new e.EchoView(model, fig.querySelector('#windows-canvas'), { stage });
      echo.showOverlay(false);
      echo.top = 42;
      echo.retheme();
      labels = new Labels(fig.querySelector('#windows-overlay'));
      ink = fig.querySelector('#windows-ink');
      return true;
    })().catch((err) => { failed = true; note('The 3D view could not be started on this device.'); throw err; });
  }
  return ready;
}

/** Tags for the cross-section, in columns beside the sector. */
function sectionTags(stg) {
  if (!labels) return;
  if (st.wbody || !st.wlabels) { labels.update([], null, 1, 1); return; }
  const host = fig.querySelector('.pane-3d').getBoundingClientRect();
  // the pane's name and its note stay clear of the tags
  const keep = ['#windows-3dlabel', '#windows-note'].map((q) => fig.querySelector(q)).filter((e) => e && e.offsetParent).map((e) => {
    const r = e.getBoundingClientRect();
    return { x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top };
  });
  // laid out at end-diastole, so the tags hold still through the beat and none comes and goes
  // with it; each leader starts where its structure is now
  const now = new Map(echo.sectionLabels(stg.state.s).map((it) => [it.id, it]));
  labels.update(echo.sectionLabels(0), echo.sectorBox(), host.width, host.height, keep, now);
}

function onFrame(stg) {
  if (!echo) return;
  sectionTags(stg);
  planesFrame();
  if (tick++ % 2) return;   // about 30 frames a second is enough for the echo
  // the scanner line sits under the view's name, which takes two lines on a phone
  const lab = fig.querySelector('#windows-label');
  if (lab && lab.offsetParent) echo.top = 32 + Math.max(10, lab.offsetHeight);
  echo.labels = false;      // the labels name the structures on the model, not on the echo
  echo.calipers = !st.wcine;
  echo.frame({ ...stg.state });
  const m = echo.measure;
  const key = m && m.lvid ? `${m.ivs.toFixed(1)}/${m.lvid.toFixed(1)}/${m.pw.toFixed(1)}` : '';
  if (key !== lastMeas) { lastMeas = key; setState({ wmeas: key }); }
}

async function enter() {
  on = true;
  try { await ensure(); } catch (e) { return; }
  if (!on) return;
  stage.onError = (err) => note(`The 3D view stopped: ${String(err.message || err).slice(0, 120)}`);
  stage.attach(fig.querySelector('.gl-host'));
  stage.opts.beat = st.wcine;
  stage.opts.stillPhase = 0;
  stage.heart.group.visible = true;
  stage.heart.setPericardium(true);
  echo.showOverlay(true);
  echo.section = true;
  echo.setView(st.view);
  echo.setBody(st.wbody);
  showPlanes(st.wbody);
  stage.onFrame = onFrame;
  fig.classList.add('gl-ready');
  stage.resize();
  echo.resize();
  stage.start();
}

export default {
  key: 'windows',
  part: 'views',
  title: 'Views',
  dwell: 30,
  // wcine: the beat runs all the time (no control); off, the PLAX calipers would show
  defaults: { win: 'plax', view: 'plax', wcine: true, wlabels: true, wbody: false, wmeas: '' },
  watch: ['win', 'view', 'wcine', 'wlabels', 'wbody', 'wmeas'],
  figure(f) { fig = f; return null; },
  pulse: () => (stage ? stage.pulse() : null),
  init({ state, set }) {
    st = state;
    setState = set;
    fig = document.getElementById('fig-windows');   // warm() may run before the figure is first shown
    fillViewRow(state.win);
    pickPlanes(fig.querySelector('.pane-3d'));
  },
  enter() { enter(); },
  leave() {
    on = false;
    if (labels) labels.update([], null, 1, 1);
    showPlanes(false);
    if (stage) { stage.opts.labeled = false; stage.inset = null; }   // the stage is shared with 08 Planes (archived)
    if (echo) echo.showOverlay(false);
    if (stage && stage.onFrame === onFrame) { stage.stop(); stage.onFrame = null; }
  },
  warm() { ensure().catch(() => {}); },
  ready() { return failed || (on && stage && stage.running && stage.onFrame === onFrame); },
  resize() {
    if (!stage) return;
    stage.resize();
    if (echo) { echo.resize(); echo.setView(st.view); }
  },
  retheme() { if (stage) stage.retheme(); if (echo) echo.retheme(); retheme3d(); },
  onState(s, ch) {
    if ('win' in ch) {
      fillViewRow(s.win);
      if (VIEWS[s.view].win !== s.win) { setState({ view: ORDER[s.win][0] }); return; }
    }
    if ('view' in ch && VIEWS[s.view].win !== s.win) { setState({ win: VIEWS[s.view].win }); return; }
    if ('view' in ch || 'chapter' in ch) {
      const lab = fig && fig.querySelector('#windows-label');
      if (lab) lab.textContent = VIEWS[s.view].name;
    }
    if ('wbody' in ch || 'chapter' in ch) {
      const l3 = fig && fig.querySelector('#windows-3dlabel');
      if (l3) l3.textContent = s.wbody ? 'Probe and body' : 'Cross-section';
      if (!failed) note(s.wbody ? NOTE.body : NOTE.cut);
    }
    if (!stage || !echo || !on) return;
    if ('view' in ch) echo.setView(s.view);
    if ('wbody' in ch) { echo.setBody(s.wbody); showPlanes(s.wbody); }
    if ('wcine' in ch) stage.opts.beat = s.wcine;
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
  tourEnter(set) { set({ win: 'plax', view: 'plax', wcine: true }); },
  tourTick(tt, set) {
    const seq = ['plax', 'plax_av', 'rv_in', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a4c_rv', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'ssn'];
    const v = seq[Math.min(seq.length - 1, Math.floor(tt / (this.dwell / seq.length)))];
    set({ win: VIEWS[v].win, view: v });
  },
  text(s, { cite }) {
    const v = VIEWS[s.view], info = INFO[s.view];
    const m = echo && echo.measure && echo.measure.lvid ? echo.measure : null;
    const readouts = [
      { k: 'Probe movement', v: MOVE[s.view], text: true },
      { k: 'Shows', v: info.shows, text: true },
      { k: 'Recorded in this view', v: info.acquire, text: true },
    ];
    let live = `<b>${v.name}.</b> `;
    if (!v.plane) live += 'The heart model ends at the diaphragm, so the model contains no section for this view. ';
    else if (s.view === 'plax' && m && !s.wcine) live += `At end-diastole, with calipers perpendicular to the LV long axis, the septum measures ${(m.ivs / 10).toFixed(1)} cm, the LV internal diameter ${(m.lvid / 10).toFixed(1)} cm and the inferolateral wall ${(m.pw / 10).toFixed(1)} cm. `;
    else if (v.zoom) live += `The image is magnified to a region ${v.zoom.w} cm wide. `;
    live += `<span class="note">Views and measurements are as defined in the ASE guideline${cite('mitchell2019')}. Annotation class: ${v.lab || 'none'}.</span>`;
    return { readouts, live };
  },
};
