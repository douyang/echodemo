// "Echo views": a video of the key echo views of chapter 07 (Windows) of The Heart by Ultrasound.
// One cut (?cut=A|B|C|D), one frame at a time: tools/render-video.mjs calls
// window.__video.frame(i) and captures the frame. Nothing here runs on a clock of its own: the
// heartbeat, the plane, the cameras and the text follow t = i / FPS alone, so any frame renders
// the same whether it is drawn alone or in a sequence.
//
// Three panes, drawn from the one heart mesh by the site's own code:
//  - Probe and body: the whole heart from the front with the imaging plane (the overlay of
//    src/echo.js) and the probe (drawn in pencil with the heart: the stage's tools), and the
//    body key (src/gl/bodykey.js, a pencil inset) above it;
//  - Cross-section: the heart cut on the plane and seen square to it, with the site's tags;
//  - Ultrasound image: the echo the same plane cuts from the mesh (src/echo.js, src/bmode.js).
// The two 3D panes are two pencil renderers (src/gl/pencil.js) that draw the one scene with
// the one camera in turn: before each pass the camera is posed and the cut set or cleared. In
// the subcostal views both draw the liver (src/gl/liver3d.js) as the site does, faded in and out
// across each move.
import * as THREE from '../vendor/three.bundle.min.js';
import { FPS, BEAT, DISSOLVE, SIZE, layout, segAt, windowsOf, cycleMs } from './timeline.js';
import { CUTS, caption, WIN_NAME } from './cuts.js';
import { VIEWS } from '../src/views.js';
import { RR, cycleAt } from '../src/cyclemodel.js';
import { loadModel } from '../src/model3d.js';
import { Stage3D, Labels } from '../src/gl/stage3d.js';
import { Pencil } from '../src/gl/pencil.js';
import { BodyKey } from '../src/gl/bodykey.js';
import { EchoView, viewGeometry } from '../src/echo.js';
import { tokens } from '../src/sketch.js';
import { ecg } from '../src/scope.js';

// Each pane is laid out smaller and drawn larger, so lines, hatching and lettering have the
// weight they have on the site: while a canvas sizes itself and draws, the page reports a
// device pixel ratio equal to that pane's zoom (src/gl/pencil.js, src/echo.js, src/bmode.js
// read it).
let DPR = 1;
Object.defineProperty(window, 'devicePixelRatio', { get: () => DPR, configurable: true });
function atZoom(z, fn) {
  const was = DPR;
  DPR = z;
  try { return fn(); } finally { DPR = was; }
}

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
/** The site's ease for a change of view (src/echo.js, advance()). */
const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });

// ---------------------------------------------------------------- the cut and its layout
const params = new URLSearchParams(location.search);
const CUT = CUTS[(params.get('cut') || 'A').toUpperCase()];
if (!CUT) throw new Error(`no cut ${params.get('cut')}`);
if (params.get('theme')) CUT.theme = params.get('theme');
const [W, H] = SIZE[CUT.aspect];
const L = layout(CUT);
const WINS = windowsOf(CUT, L);

/**
 * Frame layouts (px). Panes: box, zoom; body: the key's box and the part of the canvas left
 * for the heart and the probe (fractions: x, y, width, height); section: the part of the
 * height the sector's depth fills, and where its middle sits.
 */
const LAYOUTS = {
  '16:9': {
    v: false, head: 50,
    track: { x: 64, y: 30, w: 1792, h: 46 },
    caption: { x: 68, y: 852, w: 1784, h: 200 },
    body: { x: 48, y: 100, w: 468, h: 728, zoom: 1.3, key: [0.03, 0.01, 0.94, 0.47], area: [0.06, 0.53, 0.88, 0.44] },
    section: { x: 536, y: 100, w: 760, h: 728, zoom: 1.3, fill: 0.6, drop: 0.54 },
    echo: { x: 1316, y: 100, w: 556, h: 728, zoom: 1.5 },
    title: { x: 128, y: 330 },
    ecg: { y: 760, h: 170, x0: 128, x1: 1792 },
  },
  '9:16': {
    v: true, head: 54,
    track: { x: 60, y: 38, w: 960, h: 52 },
    caption: { x: 64, y: 122, w: 952, h: 228 },
    body: { x: 40, y: 370, w: 1000, h: 340, zoom: 1.3, key: [0.02, 0.02, 0.4, 0.94], area: [0.45, 0.05, 0.52, 0.9] },
    section: { x: 40, y: 726, w: 1000, h: 520, zoom: 1.3, fill: 0.8, drop: 0.56 },
    // the echo's canvas is narrower than its pane, so the ECG runs under the sector only
    echo: { x: 40, y: 1262, w: 1000, h: 618, zoom: 1.25, canvasW: 720 },
    title: { x: 84, y: 700 },
    ecg: { y: 1180, h: 170, x0: 84, x1: 996 },
  },
};
const LAY = LAYOUTS[CUT.aspect];
const PANE_NAME = { body: 'Probe and body', section: 'Cross-section', echo: 'Ultrasound image' };
// the progress line names the windows in full, or by their short names on a phone
const TRACK_NAME = LAY.v ? { plax: 'PLAX', psax: 'PSAX', apical: 'Apical', sub: 'Subcostal', ssn: 'SSN' } : WIN_NAME;

// ---------------------------------------------------------------- theme
/** The site's palette for the cut's theme: the custom properties of src/styles.css. */
async function applyTheme(theme) {
  const css = await fetch('src/styles.css').then((r) => r.text());
  const block = (sel) => {
    const i = css.indexOf(sel);
    if (i < 0) throw new Error(`src/styles.css has no ${sel}`);
    const a = css.indexOf('{', i);
    return css.slice(a + 1, css.indexOf('}', a));
  };
  const root = document.documentElement;
  const put = (body) => { for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) root.style.setProperty(m[1], m[2].trim()); };
  for (const m of block(':root {').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) LIGHT[m[1]] = m[2].trim();
  put(block(':root {'));
  if (theme === 'dark') put(block(':root[data-theme="dark"] {'));
  root.style.colorScheme = theme;
  root.dataset.theme = theme;
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const LIGHT = {};   // the light palette (src/styles.css :root), for paper panes on a dark frame
/**
 * How the probe-and-body and cross-section panes draw: 'paper', graphite on paper whatever the
 * frame (the site's light drawing), or 'theme', the cut's own palette (chalk on slate when dark).
 */
const DIAGRAMS = params.get('diagrams') || CUT.diagrams || 'paper';
/** The palette the drawings take. */
function diagTokens() {
  if (DIAGRAMS !== 'paper') return { ...tokens(), accent: cssVar('--accent') };
  const L = LIGHT;
  return { ink: L['--ink'], chalk: L['--chalk'], congo: L['--flag'], accent: L['--accent'], paper: L['--paper'], rule: L['--rule'], dark: false };
}

// ---------------------------------------------------------------- page
const panes = {};
let trackEls = [], capEls = null, cardEls = null;

function build() {
  const F = $('#frame');
  Object.assign(F.style, { width: `${W}px`, height: `${H}px` });
  document.body.style.width = `${W}px`;
  document.body.style.height = `${H}px`;
  if (LAY.v) F.classList.add('v');
  for (const k of ['body', 'section', 'echo']) {
    const P = LAY[k];
    const el = h('div', 'pane');
    el.id = `pane-${k}`;
    px(el, P);
    const view = h('div', 'pane-view');
    view.style.top = `${LAY.head}px`;
    el.append(h('p', 'pane-name', PANE_NAME[k]), view);
    F.appendChild(el);
    // the canvas: w x h layout px, drawn at zoom, centred in the pane
    const cw = P.canvasW || P.w;
    const w = Math.floor(cw / P.zoom), hh = Math.floor((P.h - LAY.head) / P.zoom);
    panes[k] = { el, view, zoom: P.zoom, w, h: hh, x0: Math.round((P.w - w * P.zoom) / 2) };
  }
  // paper panes on a dark frame: the two drawing panes take the light palette
  if (DIAGRAMS === 'paper' && CUT.theme === 'dark') {
    const L = LIGHT;
    for (const k of ['body', 'section']) {
      const st = panes[k].el.style;
      st.setProperty('--card', L['--paper']);
      for (const n of ['--ink', '--ink-2', '--ink-3']) st.setProperty(n, L[n]);
      st.setProperty('--edge', `color-mix(in srgb, ${L['--rule']} 45%, transparent)`);
    }
  }
  // caption: an eyebrow (the window; not on a phone, where the name says it), the view's
  // name, the probe and the structures
  const cap = h('div');
  cap.id = 'caption';
  px(cap, LAY.caption);
  const line = (cls) => { const e = h('div', `cap-line ${cls}`); e.append(h('span'), h('span')); return e; };
  capEls = { eye: line('cap-eye'), name: line('cap-name') };
  if (LAY.v) capEls.eye.style.display = 'none';
  cap.append(capEls.eye, capEls.name);
  for (const [k, label] of [['probe', 'Probe'], ['shows', 'Shows']]) {
    if (k === 'shows' && CUT.caption !== 'full') continue;
    const row = h('div', `cap-row ${k}`);
    capEls[k] = line('');
    row.append(h('b', '', label), capEls[k]);
    cap.appendChild(row);
  }
  F.appendChild(cap);
  // cards over the panes; the progress line stays above them
  const card = h('div');
  card.id = 'card';
  const title = h('div');
  const T = LAY.title;
  const t1 = h('p', 'card-title', esc(CUT.cards.title));
  const rule = h('div', 'card-rule');
  const sub = h('p', 'card-sub', esc(CUT.cards.sub));
  Object.assign(t1.style, { left: `${T.x}px`, top: `${T.y}px` });
  Object.assign(rule.style, { left: `${T.x + 6}px`, top: `${T.y + (LAY.v ? 186 : 196)}px`, width: '132px' });
  Object.assign(sub.style, { left: `${T.x + 4}px`, top: `${T.y + (LAY.v ? 222 : 232)}px`, width: `${W - 2 * T.x}px` });
  title.append(t1, rule, sub);
  const end = h('div');
  const words = esc(CUT.cards.end).replace(/(\S+)$/, '<em>$1</em>');
  const e1 = h('p', 'card-end', words);
  e1.style.top = `${Math.round(H / 2 - (LAY.v ? 60 : 66))}px`;
  end.appendChild(e1);
  // a heartbeat trace swept across both cards in time with the beat
  const trace = h('canvas', 'card-ecg');
  const EB = LAY.ecg;
  trace.width = W;
  trace.height = EB.h;
  Object.assign(trace.style, { top: `${EB.y}px`, width: `${W}px`, height: `${EB.h}px` });
  card.append(title, end, trace);
  F.appendChild(card);
  cardEls = { card, title, end, t1, rule, sub, e1, trace };
  // the five windows, one segment each, a tick for each view
  const track = h('div');
  track.id = 'track';
  px(track, LAY.track);
  const gap = 14, segW = (LAY.track.w - gap * (WINS.length - 1)) / WINS.length;
  trackEls = WINS.map((w, i) => {
    const el = h('div', 'win');
    Object.assign(el.style, { left: `${i * (segW + gap)}px`, width: `${segW}px` });
    el.style.setProperty('--wc', `var(--w-${w.win})`);
    const lab = h('div', 'lab', esc(TRACK_NAME[w.win]));
    const ln = h('div', 'line');
    const fill = h('div', 'fill');
    ln.appendChild(fill);
    el.append(lab, ln);
    const span = spanOf(i);
    const ticks = w.views.map((v) => {
      const tk = h('div', 'tick');
      tk.style.left = `${Math.min(segW - 4, Math.max(4, ((v.t0 - span.a) / (span.b - span.a)) * segW))}px`;
      el.appendChild(tk);
      return { el: tk, t0: v.t0 };
    });
    track.appendChild(el);
    return { el, fill, ticks, span };
  });
  F.appendChild(track);
}
/**
 * A window's span on the progress line: from the middle of the move into it (where the caption
 * changes) to the middle of the move out of it; the first from its first view, the last to the
 * end of the tour.
 */
function spanOf(i) {
  const into = (k) => {
    const s = L.segs.find((m) => m.kind === 'move' && m.cross && m.to === WINS[k].views[0].view);
    return s ? (s.t0 + s.t1) / 2 : WINS[k].t0;
  };
  return { a: i ? into(i) : WINS[0].t0, b: i + 1 < WINS.length ? into(i + 1) : L.tour.t1 };
}

// ---------------------------------------------------------------- the scene
let stage = null, model = null, echo = null, key = null, bodyPencil = null, labels = null, tagsHost = null;
const PL = {};        // each view's plane: geometry, rotation, centre, settings
const TAGS = {};      // each view's tags on the cross-section, laid out once
let SITES = null;     // each window's place on the skin of the body key (cm from the midline, the notch)
const FOV = 28;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const BODY_DIR = V3(-0.38, -0.2, -1).normalize(), BODY_UP = V3(0, 1, 0);   // echo.js setBody(): the heart from the front, head up

async function initScene() {
  stage = new Stage3D();            // its pencil draws the cross-section
  await stage.ready;
  model = await loadModel();        // the model the stage took: one heart mesh
  stage.heart.group.visible = true;
  stage.heart.setPericardium(true);
  bodyPencil = new Pencil();        // the probe-and-body pane
  const DT = diagTokens();
  for (const p of [bodyPencil, stage.pencil]) p.setTheme(DT);
  // on the heart and the body key the probe is in the page's accent, so its place stands apart
  // from the graphite heart; in the cross-section it is graphite, drawn as the heart is
  bodyPencil.setToolInk(DT.accent);
  const B = panes.body, S = panes.section, E = panes.echo;
  B.view.appendChild(bodyPencil.canvas);
  S.view.appendChild(stage.pencil.canvas);
  atZoom(B.zoom, () => bodyPencil.setSize(B.w, B.h));
  atZoom(S.zoom, () => stage.pencil.setSize(S.w, S.h));
  for (const [P, c] of [[B, bodyPencil.canvas], [S, stage.pencil.canvas]]) Object.assign(c.style, { left: `${P.x0}px`, width: `${c.width}px`, height: `${c.height}px` });
  // the tags: laid out in the canvas's own px, scaled with it
  tagsHost = h('div', 'tags-host');
  Object.assign(tagsHost.style, { left: `${S.x0}px`, width: `${S.w}px`, height: `${S.h}px`, transform: `scale(${S.zoom})` });
  const ov = h('div', 'overlay');
  tagsHost.appendChild(ov);
  S.view.appendChild(tagsHost);
  labels = new Labels(ov);
  // the echo: the site's view, driven here plane by plane
  const ec = h('canvas');
  E.view.appendChild(ec);
  echo = atZoom(E.zoom, () => new EchoView(model, ec, { stage }));
  if (echo.ro) echo.ro.disconnect();
  atZoom(E.zoom, () => echo.setSize(E.w, E.h));
  Object.assign(ec.style, { left: `${E.x0}px`, width: `${ec.width}px`, height: `${ec.height}px` });
  echo.labels = false;               // chapter 07: the tags name the structures on the model, not the echo
  echo.calipers = false;
  echo.section = true;
  echo.cutOn = false;                // each pass sets its own cut
  // the probe on the heart, without its sector: the echo pane shows the sector
  echo.showOverlay(true);
  echo.overlay.visible = false;
  echo.retheme();
  echo.top = echoTop();
  // the heart whole (no cut, so no cap), and the probe in its own frame
  stage.heart.setCut(null);
  HEART_PTS = surfacePoints(stage.heart.group, 1600, false, new Set([stage.heart.cap]));
  PROBE_PTS = surfacePoints(echo.probe, 240, true);
  // the body key: the site's own (src/gl/bodykey.js), drawn as the site draws it; the video
  // only places it, larger, in the top part of the pane (its rect)
  key = new BodyKey(model.heart.meshes.Myocardium, model.anat);
  key.retheme(DT);
  const [kx, ky, kw, kh] = LAY.body.key;
  const keyRect = { x: Math.round(kx * B.w), y: Math.round(ky * B.h), w: Math.round(kw * B.w), h: Math.round(kh * B.h) };
  key.rect = () => keyRect;
  // each window's place on its skin, so the probe can travel between windows (keySite)
  SITES = null;
  if (Array.isArray(key.rows) && typeof key.site === 'function' && [key.xm, key.yN, key.zF].every(Number.isFinite)) {
    const site = key.site.bind(key);
    SITES = {};
    for (const w of ['plax', 'psax', 'apical', 'sub', 'ssn']) { const p = site(w); SITES[w] = [p.x - key.xm, p.y - key.yN]; }
  }
  // the planes
  for (const v of new Set(CUT.views)) {
    const g = viewGeometry(model.anat, v);
    if (!g) throw new Error(`view ${v} has no plane`);
    const sp = VIEWS[v];
    PL[v] = {
      g, depth: sp.depth, angle: sp.angle, near: sp.near ?? 1.2, liver: !!sp.liver, win: sp.win,
      q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(g.r, g.d, g.n)),
      c: g.O.clone().addScaledVector(g.d, sp.depth / 2),
    };
  }
  // one frame of the echo takes the model's heart (echo.js takePheno) before any other work
  setPlane(planeAt(L.tour.t0));
  atZoom(E.zoom, () => echo.frame({ a: 0, s: 0, v: 0, phase: 0, drive: null }));
  // each view's tags: laid out once, square to its plane, at end-diastole, so they hold still
  for (const v of new Set(CUT.views)) {
    const P = still(v);
    setPlane(P);
    pose(sectionPose(P), S);
    echo.liver3d.set(liverAt(P, false));
    TAGS[v] = { items: echo.sectionLabels(0), box: echo.sectorBox() };
    FIT[v] = fitPoints(drawnPoints());
  }
}

/** The echo's sector sits in the middle of its canvas: its apex this far down (layout px). */
function echoTop() {
  const E = panes.echo, half = THREE.MathUtils.degToRad(40);
  const ecgH = Math.min(46, E.h * 0.09);
  const sector = Math.min((E.w - 36) / (2 * Math.sin(half)), E.h - 30 - ecgH - 40);
  return Math.max(30, Math.round((E.h - (sector + ecgH + 30)) / 2 + 12));
}

// ---------------------------------------------------------------- the plane at time t
function specFor(view, depth, angle, near, liver) {
  return { ...VIEWS[view], depth, angle, near, liver };
}
function still(v) {
  const P = PL[v];
  return { g: P.g, depth: P.depth, spec: specFor(v, P.depth, P.angle, P.near, P.liver), view: v, from: v, to: v, e: 0, u: 0 };
}
/**
 * The plane at time t. In a move inside a window it goes from where it is to the next view as
 * the site moves it (src/echo.js setView, advance): it turns along the shortest rotation while
 * the middle of the sector slides across, eased; depth, sector angle and chest wall ease with
 * it. A move to another window goes round the heart instead (orbit). Where the near field
 * changes kind (the liver layer of the subcostal four-chamber view), spec2 is the other one and
 * mix how far the echo has gone over to it.
 */
function planeAt(t) {
  const s = segAt(L, t);
  const views = CUT.views;
  if (s.kind !== 'move') return still(s.kind === 'hold' ? s.view : s.kind === 'title' ? views[0] : views[views.length - 1]);
  const u = clamp01((t - s.t0) / (s.t1 - s.t0)), e = ease(u);
  const A = PL[s.from], B = PL[s.to];
  const q = A.q.clone().slerp(B.q, e);
  const depth = lerp(A.depth, B.depth, e), angle = lerp(A.angle, B.angle, e);
  let g;
  if (s.cross) g = orbit(A, B, e, q);
  else {
    const r = V3(), d = V3(), n = V3();
    new THREE.Matrix4().makeRotationFromQuaternion(q).extractBasis(r, d, n);
    g = { O: A.c.clone().lerp(B.c, e).addScaledVector(d, -depth / 2), d, r, n };
  }
  const view = e < 0.5 ? s.from : s.to;
  const P = { g, depth, view, from: s.from, to: s.to, e, u, cross: s.cross };
  if (A.liver === B.liver) P.spec = specFor(view, depth, angle, lerp(A.near, B.near, e), A.liver);
  else {
    // the two near fields; the image goes over from one to the other in the middle of the move
    P.spec = specFor(s.from, depth, angle, A.near, A.liver);
    P.spec2 = specFor(s.to, depth, angle, B.near, B.liver);
    P.mix = ease((e - 0.3) / 0.4);
  }
  return P;
}

/**
 * A move between windows: the probe goes round the heart, not through it, as a hand takes it
 * over the chest. It travels on an arc about the heart's centre, over the front where the turn
 * is wide, a little clear of the heart in the middle of the way. The beam stays on the heart:
 * it aims at the point that slides from the middle of one sector to the middle of the next. The
 * array turns as the site turns it, kept square to the beam. At either end this is the view.
 */
function orbit(A, B, e, q) {
  const C = stage.center, ANT = V3(0, 0, 1);   // the front of the body (src/gl/bodykey.js)
  const a = A.g.O.clone().sub(C), b = B.g.O.clone().sub(C);
  const ra = a.length(), rb = b.length();
  a.normalize();
  b.normalize();
  const m = a.clone().add(b);
  if (m.length() < 0.8 || m.dot(ANT) < 0.25 * m.length()) m.addScaledVector(ANT, 2);
  m.normalize();
  // a quadratic Bezier on the sphere of directions: a to b by way of m
  const dir = a.multiplyScalar((1 - e) * (1 - e)).addScaledVector(m, 2 * e * (1 - e)).addScaledVector(b, e * e).normalize();
  const O = C.clone().addScaledVector(dir, lerp(ra, rb, e) + 2.5 * Math.sin(Math.PI * e));
  const d = A.c.clone().lerp(B.c, e).sub(O).normalize();
  const rq = V3(), dq = V3(), nq = V3();
  new THREE.Matrix4().makeRotationFromQuaternion(q).extractBasis(rq, dq, nq);
  const r = rq.addScaledVector(d, -rq.dot(d));
  if (r.length() < 0.2) r.copy(nq).cross(d);
  r.normalize();
  return { O, d, r, n: r.clone().cross(d).normalize() };
}

/** Put plane P into the echo view: its sector and probe in 3D, and the image it cuts. */
function setPlane(P, spec = P.spec) {
  echo.view = 'free';
  echo.freeSpec = spec;
  echo.geoms.free = P.g;
  echo.cur = null;
  echo.tr = null;
  echo.zoomAt = null;
  echo._place3d(P.g, echo.specOf('free'));
}

// ---------------------------------------------------------------- cameras
/** The cross-section, square to the plane and turned as the echo is: probe up, the same side right. */
function sectionPose(P) {
  const S = LAY.section, D = P.depth;
  const dist = D / (S.fill * 2 * TAN);
  const mid = P.g.O.clone().addScaledVector(P.g.d, D / 2);
  const target = mid.addScaledVector(P.g.d, -(S.drop - 0.5) * 2 * dist * TAN);
  return { pos: target.clone().addScaledVector(P.g.n, -dist), up: P.g.d.clone().negate(), target };
}
/**
 * The probe and body: the whole heart from the front, head up (the site's view). Each view has
 * its framing (FIT): the heart and the probe together fill the part of the pane left for them
 * (LAY.body.area), so the probe is never cut off at an edge or under the key. In a move the
 * camera eases from one framing to the next, and draws back only if the probe would leave the
 * area. The heart counts as it rests, so the camera holds still through the beat.
 */
function bodyPose(P) {
  const F = P.from === P.to ? FIT[P.view] : contain(between(FIT[P.from], FIT[P.to], P.e), drawnPoints());
  return { pos: F.target.clone().addScaledVector(BODY_DIR, -F.dist), up: BODY_UP.clone(), target: F.target };
}
const fitCam = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
let HEART_PTS = [], PROBE_PTS = [];
const FIT = {};
const BODY_RIGHT = BODY_DIR.clone().cross(BODY_UP).normalize(), BODY_SUP = BODY_RIGHT.clone().cross(BODY_DIR).normalize();

/** The heart at rest and the probe where it is now (world cm). */
function drawnPoints() {
  echo.probe.updateMatrixWorld(true);
  return HEART_PTS.concat(PROBE_PTS.map((p) => p.clone().applyMatrix4(echo.probe.matrixWorld)));
}
/** The area left for the heart and the probe (canvas px). */
function bodyArea() {
  const B = panes.body, [fx, fy, fw, fh] = LAY.body.area;
  return { x: fx * B.w, y: fy * B.h, w: fw * B.w, h: fh * B.h };
}
/** The box (canvas px) the points take with the camera on target at dist. */
function boxOf(pts, target, dist) {
  const B = panes.body, cam = fitCam, v = V3();
  cam.aspect = B.w / B.h;
  cam.updateProjectionMatrix();
  cam.position.copy(target).addScaledVector(BODY_DIR, -dist);
  cam.up.copy(BODY_UP);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    v.copy(p).project(cam);
    const x = ((v.x + 1) / 2) * B.w, y = ((1 - v.y) / 2) * B.h;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}
/** The framing that fills the area with the points: the middle of the drawing on its middle. */
function fitPoints(pts) {
  const A = bodyArea(), target = stage.center.clone();
  let dist = 3 * stage.radius;
  for (let it = 0; it < 8; it++) {
    const b = boxOf(pts, target, dist), cm = (2 * dist * TAN) / panes.body.h;
    target.addScaledVector(BODY_RIGHT, ((b.x0 + b.x1) / 2 - (A.x + A.w / 2)) * cm).addScaledVector(BODY_SUP, -((b.y0 + b.y1) / 2 - (A.y + A.h / 2)) * cm);
    dist /= Math.min(A.w / (b.x1 - b.x0), A.h / (b.y1 - b.y0));
  }
  return { target, dist };
}
/** k of the way from framing a to framing b; the zoom at an even rate. */
function between(a, b, k) {
  return { target: a.target.clone().lerp(b.target, k), dist: a.dist * Math.pow(b.dist / a.dist, k) };
}
/** Framing F, drawn back and moved only as far as it takes to keep the points in the area. */
function contain(F, pts) {
  const A = bodyArea(), target = F.target.clone();
  let dist = F.dist;
  for (let it = 0; it < 6; it++) {
    const b = boxOf(pts, target, dist);
    const f = Math.max((b.x1 - b.x0) / A.w, (b.y1 - b.y0) / A.h);
    if (f > 1) { dist *= f; continue; }
    // px to move the drawing: right (+) or left, down (+) or up
    const dx = b.x0 < A.x ? A.x - b.x0 : b.x1 > A.x + A.w ? A.x + A.w - b.x1 : 0;
    const dy = b.y0 < A.y ? A.y - b.y0 : b.y1 > A.y + A.h ? A.y + A.h - b.y1 : 0;
    if (!dx && !dy) break;
    const cm = (2 * dist * TAN) / panes.body.h;
    target.addScaledVector(BODY_RIGHT, -dx * cm).addScaledVector(BODY_SUP, dy * cm);
  }
  return { target, dist };
}

/**
 * About n points on the surfaces of the visible meshes under root (but skip), in world space, or
 * in root's own frame when local is set. The heart is taken as it rests: its geometry, not its beat.
 */
function surfacePoints(root, n, local = false, skip = new Set()) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverseVisible((o) => { if (o.isMesh && !skip.has(o) && o.geometry.attributes.position) meshes.push(o); });
  const total = meshes.reduce((k, m) => k + m.geometry.attributes.position.count, 0);
  const step = Math.max(1, Math.floor(total / n));
  const inv = local ? root.matrixWorld.clone().invert() : null;
  const out = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    const M = local ? inv.clone().multiply(m.matrixWorld) : m.matrixWorld;
    for (let i = 0; i < pos.count; i += step) out.push(V3().fromBufferAttribute(pos, i).applyMatrix4(M));
  }
  return out;
}
function pose(P, pane) {
  const cam = stage.camera;
  cam.position.copy(P.pos);
  cam.up.copy(P.up).normalize();
  stage.controls.target.copy(P.target);
  cam.lookAt(P.target);
  cam.aspect = pane.w / pane.h;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

// ---------------------------------------------------------------- body key: the probe on the skin
const FRONT_N = 2.2;   // src/gl/bodykey.js: the chest is rounder in front than behind
/** The point on the front of the body key's skin dx cm left of the midline and dy cm from the notch (bodykey.js site()). */
function skin(dx, dy) {
  const rows = key.rows;
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] > dy) i++;
  const t = clamp01((rows[i][0] - dy) / (rows[i][0] - rows[i + 1][0]));
  const r = rows[i].map((v, k) => v + (rows[i + 1][k] - v) * t);
  const zc = (r[2] + r[3]) / 2, hh = (r[2] - r[3]) / 2;
  const u = Math.min(0.999, Math.abs(dx) / r[1]) ** 2.4;
  return V3(key.xm + dx, key.yN + dy, key.zF + zc + hh * (1 - u) ** (1 / FRONT_N));
}
/**
 * The probe on the body key: at its window's place, its beam toward the middle of the sector
 * (echo.js _keySite). Between windows it lifts off the skin and comes down at the next one.
 */
function keySite(P) {
  const wa = VIEWS[P.from].win, wb = VIEWS[P.to].win;
  const spec = echo.specOf('free');
  const target = P.g.O.clone().addScaledVector(P.g.d, spec.depth * 0.45);
  // a key without the skin table the travel needs: the site's own placement, window by window
  if (!SITES || wa === wb) { key.setView(P.e < 0.5 ? wa : wb, target, P.g.r, spec); return; }
  const [dx, dy] = SITES[wa].map((v, k) => lerp(v, SITES[wb][k], P.e));
  const nrm = skin(dx + 0.5, dy).sub(skin(dx - 0.5, dy)).cross(skin(dx, dy + 0.5).sub(skin(dx, dy - 0.5))).normalize();
  if (nrm.z < 0) nrm.negate();
  const at = skin(dx, dy).addScaledVector(nrm, 5 * Math.sin(Math.PI * clamp01(P.u)));
  // the key places its probe at site(win): for this call, the point on the way
  key.site = () => at.clone();
  try { key.setView(wb, target, P.g.r, spec); } finally { delete key.site; }
}

/**
 * The liver's alphas for plane P (src/echo.js _liverFor): in a subcostal view the liver the
 * plane cuts, or the four-chamber view's near-field layer; with the body, the whole liver. In a
 * move each goes from the one view's to the other's with the plane.
 */
function liverAt(P, body) {
  const of = (v) => {
    const V = VIEWS[v], sub = V.win === 'sub', four = sub && V.plane === 'sc4c';
    return { liver: sub && (body || !four) ? 1 : 0, layer: four && !body ? 1 : 0 };
  };
  const a = of(P.from), b = of(P.to), k = P.from === P.to ? 0 : P.e;
  return { liver: lerp(a.liver, b.liver, k), layer: lerp(a.layer, b.layer, k) };
}

// ---------------------------------------------------------------- panes
function renderPanes(t) {
  // the beat at t: the model's cycle, 70 per minute, mitral closure on each grid beat
  const ms = cycleMs(t), cyc = cycleAt(ms);
  stage.heart.setState(0, cyc.s, cyc.v, cyc.drive);
  const a = stage.heart.state.a;
  const state = { a, s: cyc.s, v: cyc.v, phase: ms / RR, drive: cyc.drive, t: cyc.t };
  stage.phase = state.phase;
  stage.clock = t;
  stage.state = state;
  const boil = Math.floor(t * 7) * 1.37;   // the pencil's line boil, as on the site (stage3d.js tick)
  const P = planeAt(t);
  setPlane(P);
  // 1. probe and body: the whole heart, the plane and the probe, the key above; all as the
  // site draws them (echo.js setBody)
  const B = panes.body;
  pose(bodyPose(P), B);
  stage.heart.setCut(null);
  echo.liver3d.setCut(null);
  echo.liver3d.set(liverAt(P, true));
  keySite(P);
  bodyPencil.render(stage.scene, stage.camera, stage.heart, { boil, amyloid: a, tools: stage.tools, layer: echo.liver3d, inset: key.frame(stage.camera, B.w, B.h) });
  // 2. cross-section: the heart cut on the plane, seen square to it
  const S = panes.section;
  pose(sectionPose(P), S);
  const cut = new THREE.Plane().setFromNormalAndCoplanarPoint(P.g.n, P.g.O);
  stage.heart.setCut(cut);
  echo.liver3d.setCut(cut);
  echo.liver3d.set(liverAt(P, false));
  stage.pencil.render(stage.scene, stage.camera, stage.heart, { boil, amyloid: a, tools: stage.tools, layer: echo.liver3d, inset: null });
  // 3. the echo. Where the near field changes kind, the two images cross over inside the
  // sector only; the scanner's lettering and the ECG come from one image, the one of the
  // view the move is closer to
  const E = panes.echo;
  if (!P.spec2) atZoom(E.zoom, () => echo.frame(state));
  else {
    const [under, over, k] = P.mix < 0.5 ? [P.spec, P.spec2, P.mix] : [P.spec2, P.spec, 1 - P.mix];
    const c = echo.canvas;
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = c.width;
    scratch.height = c.height;
    setPlane(P, over);
    atZoom(E.zoom, () => echo.frame(state));
    scratch.getContext('2d').drawImage(c, 0, 0);
    setPlane(P, under);
    atZoom(E.zoom, () => echo.frame(state));
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(echo.dpr, 0, 0, echo.dpr, 0, 0);
    ctx.clip(echo.fanPath);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }
  return P;
}
let scratch = null;

/** The tags: the view on screen, fading in as it settles and out as the plane leaves. */
function updateTags(t) {
  const s = segAt(L, t);
  let view = null, alpha = 0;
  if (s.kind === 'hold') { view = s.view; alpha = ease((t - s.t0) / 0.5); }
  else if (s.kind === 'move') { view = s.from; alpha = 1 - ease((t - s.t0) / 0.3); }
  else if (s.kind === 'end') { view = CUT.views[CUT.views.length - 1]; alpha = 1; }
  tagsHost.style.opacity = alpha.toFixed(3);
  if (alpha <= 0) return;
  const T = TAGS[view], S = panes.section;
  // in a hold each leader starts where its structure is now (the plane and the camera are the
  // view's own); in a move the tags leave with the view they named
  const now = s.kind === 'move' ? null : new Map(echo.sectionLabels(stage.state.s).map((it) => [it.id, it]));
  labels.update(T.items, T.box, S.w, S.h, [], now);
}

// ---------------------------------------------------------------- caption
/**
 * One line of the caption going from text a to text b (k: 0 to 1): out, then in, the new
 * text coming up a little as it appears. A line whose text stays holds still. Returns how
 * much of the line shows, for its label.
 */
function setLine(el, a, b, k, rise = 8) {
  const [s0, s1] = el.children;
  if (s0.textContent !== a) s0.textContent = a;
  if (s1.textContent !== b) s1.textContent = b;
  if (a === b || k <= 0) {
    s0.style.opacity = '1';
    s1.style.opacity = '0';
    s1.style.transform = '';
    return 1;
  }
  const o0 = 1 - ease(clamp01(k * 2)), o1 = easeOut(clamp01(k * 2 - 1));
  s0.style.opacity = o0.toFixed(3);
  s1.style.opacity = o1.toFixed(3);
  s1.style.transform = `translateY(${((1 - o1) * rise).toFixed(2)}px)`;
  return Math.max(o0, o1);
}
function updateCaption(t) {
  const s = segAt(L, t);
  const views = CUT.views;
  let a, b, k = 0, alpha = 1;
  if (s.kind === 'title') { a = b = views[0]; alpha = 0; }
  else if (s.kind === 'hold') { a = b = s.view; if (s.i === 0) alpha = easeOut((t - s.t0) / 0.6); }
  else if (s.kind === 'end') { a = b = views[views.length - 1]; }
  else {
    // the text changes in the middle of the move: out over the last 0.3 s before it, in over the first 0.45 s after
    a = s.from; b = s.to;
    const mid = (s.t0 + s.t1) / 2;
    k = t < mid ? 0.5 * clamp01((t - (mid - 0.3)) / 0.3) : 0.5 + 0.5 * clamp01((t - mid) / 0.45);
  }
  const A = caption(a), B = caption(b);
  $('#caption').style.opacity = alpha.toFixed(3);
  capEls.eye.style.setProperty('--wc', `var(--w-${(k < 0.5 ? A : B).win})`);
  setLine(capEls.eye, A.window, B.window, k, 4);
  setLine(capEls.name, A.name, B.name, k);
  // a row's label goes out and in with its text
  capEls.probe.previousSibling.style.opacity = setLine(capEls.probe, A.probe, B.probe, k, 5).toFixed(3);
  if (capEls.shows) capEls.shows.previousSibling.style.opacity = setLine(capEls.shows, A.shows, B.shows, k, 5).toFixed(3);
  // the eyebrow's dot takes the window's colour
  for (const s0 of capEls.eye.children) if (!s0.querySelector('i')) s0.insertAdjacentHTML('afterbegin', '<i></i>');
}

/**
 * The caption's type scales down, if it must, so that the tallest caption of the cut fits its
 * box: every caption is measured once, with the fonts in, before the first frame.
 */
let capScale = 1;
function fitCaption() {
  const cap = $('#caption'), box = LAY.caption;
  const texts = CUT.views.map(caption);
  const tallest = () => {
    let hmax = 0;
    for (const c of texts) {
      for (const [el, v] of [[capEls.eye, c.window], [capEls.name, c.name], [capEls.probe, c.probe], [capEls.shows, c.shows]]) {
        if (el) for (const s of el.children) s.textContent = v;
      }
      hmax = Math.max(hmax, cap.scrollHeight);
    }
    return hmax;
  };
  let s = 1;
  for (; s > 0.6; s -= 0.01) {
    Object.assign(cap.style, { width: `${box.w / s}px`, height: 'auto', transform: '' });
    if (tallest() * s <= box.h) break;
  }
  Object.assign(cap.style, { width: `${box.w / s}px`, height: `${box.h / s}px`, transform: `scale(${s.toFixed(4)})`, transformOrigin: '0 0' });
  capScale = s;
}

// ---------------------------------------------------------------- progress line
function updateTrack(t, fade) {
  $('#track').style.opacity = (1 - fade).toFixed(3);
  trackEls.forEach((w, i) => {
    const f = clamp01((t - w.span.a) / (w.span.b - w.span.a));
    const cur = t >= w.span.a && (t < w.span.b || i === WINS.length - 1) && t >= L.tour.t0;
    w.el.classList.toggle('cur', cur);
    w.fill.style.width = `${(t < L.tour.t0 ? 0 : f * 100).toFixed(3)}%`;
    w.fill.style.opacity = cur ? '1' : '0.45';
    for (const tk of w.ticks) tk.el.classList.toggle('on', t >= tk.t0 && t >= L.tour.t0);
  });
}

// ---------------------------------------------------------------- cards
function updateCards(t) {
  const a = L.tour.t0, b = L.tour.t1, d = DISSOLVE / 2;
  const titleOn = 1 - ease((t - (a - d)) / DISSOLVE);
  const endOn = ease((t - (b - d)) / DISSOLVE);
  const C = cardEls;
  C.card.style.opacity = Math.max(titleOn, endOn).toFixed(3);
  C.title.style.display = titleOn > 0 ? '' : 'none';
  C.end.style.display = endOn > 0 && titleOn <= 0 ? '' : 'none';
  if (titleOn > 0) {
    // the title rises in; the rule draws; the line follows
    const k1 = easeOut((t - 0.15) / 0.8), k2 = easeOut((t - 0.55) / 0.7), k3 = easeOut((t - 0.75) / 0.8);
    C.t1.style.opacity = k1.toFixed(3);
    C.t1.style.transform = `translateY(${((1 - k1) * 26).toFixed(2)}px)`;
    C.rule.style.transform = `scaleX(${k2.toFixed(4)})`;
    C.sub.style.opacity = k3.toFixed(3);
    C.sub.style.transform = `translateY(${((1 - k3) * 18).toFixed(2)}px)`;
  }
  if (endOn > 0) {
    const k = easeOut((t - b) / 0.9);
    C.e1.style.opacity = k.toFixed(3);
    C.e1.style.transform = `translateY(${((1 - k) * 22).toFixed(2)}px)`;
  }
  drawTrace(t, titleOn > 0 ? 0 : b);
  return { titleOn, endOn };
}

/**
 * The heartbeat trace on a card: the site's ECG (src/scope.js ecg()), swept in from the left
 * as a monitor draws it, four beats across. Its phase is the model's at each moment, so each
 * R wave falls on a beat of the grid, with the kick of the soundtrack.
 */
function drawTrace(t, t0) {
  const c = cardEls.trace, ctx = c.getContext('2d'), E = LAY.ecg, k = 1.8, beats = 4;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const head = E.x0 + ((t - t0) / (beats * BEAT)) * (E.x1 - E.x0);
  if (head <= E.x0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, Math.min(head, E.x1 + 2), c.height);
  ctx.clip();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalAlpha = 0.9;
  ecg(ctx, E.x0 / k, E.x1 / k, (E.h * 0.66) / k, (E.h * 0.52) / k, beats, null, { color: cssVar('--accent'), offset: cycleMs(t0) / RR });
  ctx.restore();
}

// ---------------------------------------------------------------- frames
/** Frame i: everything on screen at t = i / FPS. The panes are not drawn while a card covers them. */
function frame(i) {
  const t = i / FPS;
  const { titleOn, endOn } = updateCards(t);
  if (Math.max(titleOn, endOn) < 1) {
    renderPanes(t);
    updateTags(t);
  }
  updateCaption(t);
  updateTrack(t, endOn);
  return { dirty: true, t };
}

async function init() {
  await applyTheme(CUT.theme);
  build();
  await Promise.all(['400 20px "IBM Plex Sans"', '500 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"', '400 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"',
    '600 20px Caveat', '400 20px Caveat', '400 20px Newsreader', 'italic 400 20px Newsreader'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  fitCaption();
  await initScene();
  return {
    fps: FPS, frames: L.frames, duration: L.duration, width: W, height: H, cut: CUT.id, name: CUT.name, capScale,
    segs: L.segs.map((s) => ({ kind: s.kind, view: s.view || null, from: s.from || null, to: s.to || null, t0: s.t0, t1: s.t1 })),
  };
}

const ready = init();
window.__video = { ready, frame, layout: L, cut: CUT, planeAt: (t) => planeAt(t) };
// preview in a browser: video/index.html?cut=A&t=12.5 shows that moment
ready.then(() => {
  const at = params.get('t');
  if (at != null) frame(Math.round(Number(at) * FPS));
}).catch((err) => { console.error(err); document.title = `error: ${err.message}`; });
