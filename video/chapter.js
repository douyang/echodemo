// "The Heart by Ultrasound": one chapter as a video (?ch=as). The chapter's figure, drawn by the
// site's own code (src/ch/*.js), steps through the chapter's states on the beat (video/chapters.js)
// in the frame of the views video (video/app.js): the progress line, the panes, the caption, and
// the title and end cards. tools/render-video.mjs --ch=as calls window.__video.frame(i) for
// i = 0, 1, 2 ... and captures each frame. ?reel=k draws clip k of the intro (video/reel.js):
// its script, the progress line and title card of the intro, and its frames of the whole.
//
// The clock (video/chapter.html): performance.now() reads the time of the frame being drawn. The
// chapter's own motion (its anim(): the beat of a severity page, the cursor of Cycle) runs in
// steps of 1/FPS from the start, so a frame depends on its time once the steps before it have
// run: frame(i) runs the steps it needs first, without drawing them. Frames come in order.
import { FPS, BEAT, DISSOLVE, SIZE, segAt, cycleMs } from './timeline.js';
import { VIDEOS, chapterLayout, stepStates } from './chapters.js';
import { REEL, reelLayout, clipVideo, reelTrack, reelDip } from './reel.js';
import { CHAPTERS, PARTS } from '../src/chapters.js';
import { state, set, subscribe, declare } from '../src/state.js';
import { RR } from '../src/cyclemodel.js';
import { ecg } from '../src/scope.js';
import { scanner } from '../src/scanner.js';
import { setHeart } from '../src/echo2d.js';
import { setPheno, loadModel } from '../src/model3d.js';
import { meshPanelsReady } from '../src/meshpanel.js';

// The figure is laid out for a smaller box and drawn larger, so its lines and lettering have the
// weight they have on the site: while it draws, the page reports a device pixel ratio equal to
// the zoom (src/sketch.js, src/bmode.js and the echo views read it).
let DPR = 1;
Object.defineProperty(window, 'devicePixelRatio', { get: () => DPR, configurable: true });
function atZoom(z, fn) {
  const was = DPR;
  DPR = z;
  try { return fn(); } finally { DPR = was; }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** The site's ease for a change of view (src/echo.js, advance()). */
const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
/** Text of a piece of the site's markup: tags out, spaces closed up. */
const plain = (html) => { const d = h('div', '', html); return d.textContent.replace(/\s+/g, ' ').trim(); };

// ---------------------------------------------------------------- the chapter and its video
const params = new URLSearchParams(location.search);
/** A clip of the intro (?reel=k): its place in the whole, or null for a chapter video. */
const RL = params.has('reel') ? reelLayout() : null;
const CLIP = RL ? RL.clips[Number(params.get('reel'))] : null;
if (RL && !CLIP?.video) throw new Error(`no chapter clip ${params.get('reel')} in the intro`);
const KEY = CLIP ? CLIP.ch : (params.get('ch') || 'as').toLowerCase();
const V = CLIP ? clipVideo(CLIP.k) : VIDEOS[KEY];
if (!V) throw new Error(`no video for chapter ${KEY}`);
const IDX = CHAPTERS.findIndex((c) => c.key === KEY);
const C = CHAPTERS[IDX];
const NUM = String(IDX + 1).padStart(2, '0');
const [W, H] = SIZE['16:9'];
const L = chapterLayout(V);
/** A clip draws frames F0 to F1 of the intro. Its first frame is `offset` s after its bar line. */
const T0 = CLIP ? CLIP.offset : 0;
const FRAMES = CLIP ? CLIP.frames : L.frames;
let STATES = stepStates(V, {});   // with the chapter's presets once its module is in (init)
// a trial: &side=0|1 and &zoom=1.4 override the video's own
const SIDE = params.has('side') ? params.get('side') !== '0' : V.side !== false;
const ZOOM = Number(params.get('zoom')) || (V.zoom ?? 1.3);

/** Frame layout (px), as the views video's 16:9 frame: the figure takes the first two panes' room. */
const LAY = {
  head: 50,
  track: { x: 64, y: 30, w: 1792, h: 46 },
  fig: SIDE ? { x: 48, y: 100, w: 1336, h: 728 } : { x: 48, y: 100, w: 1824, h: 728 },
  side: { x: 1404, y: 100, w: 468, h: 728 },
  caption: { x: 68, y: 852, w: 1784, h: 200 },
  title: { x: 128, y: 330 },
  ecg: { y: 760, h: 170, x0: 128, x1: 1792 },
};

// ---------------------------------------------------------------- theme
/**
 * The site's palettes (src/styles.css): the light one on the page, so the figure draws graphite
 * on paper as the site does in its light theme (src/sketch.js tokens() reads the root), and the
 * dark one on the frame, as the dark cuts of the views video.
 */
const PAL = { light: {}, dark: {} };
async function applyTheme() {
  const css = await fetch('src/styles.css').then((r) => r.text());
  const block = (sel) => {
    const i = css.indexOf(sel);
    if (i < 0) throw new Error(`src/styles.css has no ${sel}`);
    const a = css.indexOf('{', i);
    return css.slice(a + 1, css.indexOf('}', a));
  };
  const vars = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  PAL.light = vars(block(':root {'));
  PAL.dark = { ...PAL.light, ...vars(block(':root[data-theme="dark"] {')) };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(PAL.light)) root.style.setProperty(k, v);
  root.style.colorScheme = 'light';
  const F = $('#frame'), D = PAL.dark;
  for (const [k, v] of Object.entries(D)) F.style.setProperty(k, v);
  // the video's own tokens on a dark frame (video.css)
  F.style.setProperty('--ground', D['--paper']);
  F.style.setProperty('--card', D['--paper-2']);
  F.style.setProperty('--edge', `color-mix(in srgb, ${D['--rule']} 55%, transparent)`);
  F.style.setProperty('--track', `color-mix(in srgb, ${D['--rule']} 70%, transparent)`);
  F.style.colorScheme = 'dark';
  root.style.background = document.body.style.background = D['--paper'];
}

// ---------------------------------------------------------------- page
let sheet = null, figEl = null, capEls = null, cardEls = null, trackEls = [], sideEls = null;

function pane(k, name, r) {
  const el = h('div', 'pane');
  el.id = `pane-${k}`;
  px(el, r);
  const view = h('div', 'pane-view');
  view.style.top = `${LAY.head}px`;
  el.append(h('p', 'pane-name', esc(name)), view);
  $('#frame').appendChild(el);
  return { el, view, w: r.w, h: r.h - LAY.head };
}

/** The chapter's article and figure, from the site's page: the chapter's code finds its parts by id. */
async function loadSource() {
  const doc = new DOMParser().parseFromString(await fetch('index.html').then((r) => r.text()), 'text/html');
  const art = doc.getElementById(`ch-${KEY}`), fig = doc.getElementById(`fig-${KEY}`);
  if (!art || !fig) throw new Error(`index.html has no #ch-${KEY} or #fig-${KEY}`);
  $('#src').appendChild(document.importNode(art, true));
  return { art: $(`#ch-${KEY}`), fig: document.importNode(fig, true) };
}

function build(src) {
  const F = $('#frame');
  Object.assign(F.style, { width: `${W}px`, height: `${H}px` });
  document.body.style.width = `${W}px`;
  document.body.style.height = `${H}px`;
  // the figure: the site's own, on paper
  const P = pane('fig', V.pane ?? C.title, LAY.fig);
  const Lt = PAL.light;
  P.el.style.setProperty('--card', Lt['--paper']);
  for (const n of ['--ink', '--ink-2', '--ink-3']) P.el.style.setProperty(n, Lt[n]);
  P.el.style.setProperty('--edge', `color-mix(in srgb, ${Lt['--rule']} 45%, transparent)`);
  figEl = src.fig;
  figEl.classList.add('is-active');
  for (const el of $$('.poster, .fig-note, .occl, figcaption', figEl)) el.remove();
  Object.assign(figEl.style, { position: 'absolute', left: '0px', top: '0px', width: `${P.w}px`, height: `${P.h}px`, margin: '0' });
  P.view.appendChild(figEl);
  P.view.style.height = `${P.h}px`;
  panes.fig = P;
  // the measurements: the chapter's readouts, as the site lists them beside the figure
  if (SIDE) {
    const S = pane('side', 'Measurements', LAY.side);
    const list = h('dl', 'ro-list');
    S.view.appendChild(list);
    panes.side = S;
    sideEls = { list, rows: [], sig: '' };
  }
  // caption: the chapter, the step's name and its line
  const cap = h('div');
  cap.id = 'caption';
  px(cap, LAY.caption);
  const line = (cls) => { const e = h('div', `cap-line ${cls}`); e.append(h('span'), h('span')); return e; };
  capEls = { eye: line('cap-eye'), name: line('cap-name'), text: line('cap-text') };
  capEls.eye.style.setProperty('--wc', 'var(--accent)');
  cap.append(capEls.eye, capEls.name, capEls.text);
  F.appendChild(cap);
  // cards over the panes; the progress line stays above them
  const card = h('div');
  card.id = 'card';
  const title = h('div');
  const T = LAY.title;
  const eye = h('p', 'card-eye', CLIP ? esc(REEL.title.eye) : `${NUM} <span>·</span> ${esc(PART_NAME)}`);
  const t1 = h('p', 'card-title', esc(CLIP ? REEL.title.name : C.title));
  const rule = h('div', 'card-rule');
  const sub = h('p', 'card-sub', esc(CLIP ? REEL.title.sub : SUB));
  Object.assign(eye.style, { left: `${T.x + 6}px`, top: `${T.y - 54}px` });
  Object.assign(t1.style, { left: `${T.x}px`, top: `${T.y}px` });
  Object.assign(rule.style, { left: `${T.x + 6}px`, top: `${T.y + 196}px`, width: '132px' });
  Object.assign(sub.style, { left: `${T.x + 4}px`, top: `${T.y + 232}px`, width: `${W - 2 * T.x}px` });
  title.append(eye, t1, rule, sub);
  const end = h('div');
  const e1 = h('p', 'card-end', 'The Heart by <em>Ultrasound</em>');
  e1.style.top = `${Math.round(H / 2 - 66)}px`;
  end.appendChild(e1);
  const trace = h('canvas', 'card-ecg');
  const EB = LAY.ecg;
  trace.width = W;
  trace.height = EB.h;
  Object.assign(trace.style, { top: `${EB.y}px`, width: `${W}px`, height: `${EB.h}px` });
  card.append(title, end, trace);
  F.appendChild(card);
  cardEls = { card, title, end, eye, t1, rule, sub, e1, trace };
  // the progress line: one segment a step, named. In a clip of the intro, one segment a clip.
  const track = h('div');
  track.id = 'track';
  px(track, LAY.track);
  if (CLIP) {
    trackEls = RL.clips.map((c) => {
      const el = h('div', 'win');
      el.style.setProperty('--wc', 'var(--accent)');
      const ln = h('div', 'line'), fill = h('div', 'fill'), lab = h('div', 'lab', esc(c.title));
      ln.appendChild(fill);
      el.append(lab, ln);
      track.appendChild(el);
      return { el, fill, lab };
    });
    F.appendChild(track);
    return;
  }
  const n = V.steps.length, gap = 14, segW = (LAY.track.w - gap * (n - 1)) / n;
  trackEls = V.steps.map((st, i) => {
    const el = h('div', 'win');
    Object.assign(el.style, { left: `${i * (segW + gap)}px`, width: `${segW}px` });
    el.style.setProperty('--wc', 'var(--accent)');
    const ln = h('div', 'line');
    const fill = h('div', 'fill');
    ln.appendChild(fill);
    const lab = h('div', 'lab');
    el.append(lab, ln);
    track.appendChild(el);
    return { el, fill, lab, span: spanOf(i) };
  });
  F.appendChild(track);
}
const panes = {};

/** The steps' names on the progress line: their own, or their captions'. */
function labelTrack() { if (!CLIP) trackEls.forEach((w, i) => { w.lab.textContent = V.steps[i].track || CAPS[i].name; }); }

/**
 * The progress line of the intro, with the fonts in. Each clip is as wide as the name of its
 * chapter, plus an equal share of the room left. So every name fits on one line.
 */
function sizeReelTrack() {
  if (!CLIP) return;
  const gap = 14, need = trackEls.map((w) => w.lab.scrollWidth);
  const spare = (LAY.track.w - gap * (trackEls.length - 1) - need.reduce((a, b) => a + b, 0)) / trackEls.length;
  if (spare < 8) throw new Error('the intro\'s chapter names do not fit on the progress line');
  let x = 0;
  trackEls.forEach((w, i) => {
    Object.assign(w.el.style, { left: `${x.toFixed(1)}px`, width: `${(need[i] + spare).toFixed(1)}px` });
    x += need[i] + spare + gap;
  });
}

/** A step's span on the progress line: from the middle of the move into it to the middle of the move out. */
function spanOf(i) {
  const holds = L.segs.filter((s) => s.kind === 'hold'), moves = L.segs.filter((s) => s.kind === 'move');
  const mid = (s) => (s.t0 + s.t1) / 2;
  return { a: i ? mid(moves[i - 1]) : holds[0].t0, b: i < moves.length ? mid(moves[i]) : L.tour.t1 };
}

// ---------------------------------------------------------------- the figure
/** The sheet at the pane's size: laid out at 1/zoom and drawn at zoom, pixel for pixel. */
function sizeSheet(sh, w, hh, z) {
  sh.ro?.disconnect();
  sh.resize = () => {};
  sh.w = Math.floor(w / z);
  sh.h = Math.floor(hh / z);
  sh.dpr = z;
  sh.z = 1;
  sh.zoom = 1;
  sh.canvas.width = Math.round(sh.w * z);
  sh.canvas.height = Math.round(sh.h * z);
  Object.assign(sh.canvas.style, { width: `${sh.canvas.width}px`, height: `${sh.canvas.height}px`, left: `${Math.round((w - sh.canvas.width) / 2)}px`, top: '0px', right: 'auto', bottom: 'auto' });
  sh.dirty = true;
}

/** A number at its slider's step (video quant), as the page shows it. */
const snap = (k, v) => { const q = V.quant?.[k]; return q ? Number((Math.round(v / q) * q).toFixed(6)) : v; };
/** Between two states at p (0 to 1): numbers move, other values change at the middle. */
function mix(a, b, p) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    // a number eases, unless the video names it discrete (a control with set values, such as the RA pressure)
    out[k] = typeof x === 'number' && typeof y === 'number' && !V.discrete?.includes(k) ? snap(k, x + (y - x) * p) : p < 0.5 ? x ?? y : y ?? x;
  }
  return out;
}
/** The chapter's state at video time u: a step's, drifting across its hold, or between two steps across a move. */
function scriptAt(u) {
  u = Math.max(0, u);
  const s = segAt(L, u);
  if (s.kind === 'title') return STATES[0].a;
  if (s.kind === 'end') return STATES[STATES.length - 1].b;
  if (s.kind === 'hold') return mix(STATES[s.i].a, STATES[s.i].b, clamp01((u - s.t0) / (s.t1 - s.t0)));
  const to = STATES[s.to];
  return { ...mix(STATES[s.from].b, to.a, ease((u - s.t0) / (s.t1 - s.t0))), ...to.via };
}

/** The chapter's motion, stepped at 1/FPS from the start: the script's state, then anim(). */
let simN = -1;
function advance(n) {
  if (n < simN) throw new Error(`frame ${n} after frame ${simN}: frames come in order`);
  while (simN < n) {
    simN++;
    set(scriptAt(simN / FPS + T0));
    C.anim?.(1 / FPS, state, set);
  }
}

function renderFigure() {
  if (!sheet) return;
  atZoom(ZOOM, () => sheet.render(true));
}

// ---------------------------------------------------------------- measurements
function updateSide(out) {
  if (!sideEls) return;
  const items = (out.readouts || []).slice(0, V.rows ?? 6);
  const sig = items.map((it) => `${it.k}|${it.text ? 1 : 0}`).join('/');
  if (sig !== sideEls.sig) {
    sideEls.sig = sig;
    sideEls.list.innerHTML = '';
    sideEls.rows = items.map((it) => {
      const el = h('div', `ro${it.text ? ' text' : ''}`);
      const k = h('dt', '', it.k), v = h('dd');
      el.append(k, v);
      sideEls.list.appendChild(el);
      return { el, v, last: '' };
    });
  }
  items.forEach((it, i) => {
    const r = sideEls.rows[i];
    const html = `${it.v}${it.u ? `<small>${it.u}</small>` : ''}`;
    if (html !== r.last) { r.v.innerHTML = html; r.last = html; }
    r.el.classList.toggle('flag', !!it.flag);
  });
}

// ---------------------------------------------------------------- caption
const PART_NAME = PARTS.find((p) => p.key === C.part)?.name || C.part;
let SUB = '';
let CAPS = [];
/** Sentences of a line: a stop, a space, then a capital, a digit or a bracket. */
const sentences = (s) => s.split(/(?<=[.!?])\s+(?=[A-Z0-9(“"])/);
/**
 * The caption of step k: its own name and line, or the chapter's live sentence (its text()) with
 * the chapter at the step's state: the bold lead for the name, the rest (or the sentences `pick`
 * names) for the line. The state goes in through the store, so the chapter's own handlers
 * (onState) run as they do on the page.
 */
function capOf(k) {
  const st = V.steps[k];
  set(STATES[k].a);
  const out = C.text?.(state, { cite: () => '' }) || {};
  const live = out.live || '';
  const m = live.match(/^\s*<b>([\s\S]*?)<\/b>\s*([\s\S]*)$/);
  const rest = sentences(plain(m ? m[2] : live).replace(/^[,;:]\s*/, ''));
  const name = st.name ?? (m ? plain(m[1]).replace(/[.:]\s*$/, '') : C.title);
  let line = st.line ?? (st.pick ? rest.filter((_, i) => st.pick.includes(i)) : rest).join(' ');
  // a line of the video's own may quote the chapter: {s0} is a sentence of the live text, {LVEF}
  // the value of the readout of that name, as the page shows them at the step's state
  const ro = Object.fromEntries((out.readouts || []).map((r) => [r.k, plain(String(r.v))]));
  line = line.replace(/\{([^}]+)\}/g, (all, key) => {
    const v = /^s\d+$/.test(key) ? rest[Number(key.slice(1))] : ro[key];
    if (v == null) throw new Error(`chapter ${KEY}, step ${k}: no ${all} in the chapter's text`);
    return v;
  });
  return { eye: `${NUM} · ${C.title}`, name, line };
}

/** One line of the caption going from text a to text b (k: 0 to 1): out, then in (video/app.js). */
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
  const last = CAPS.length - 1;
  let a, b, k = 0, alpha = 1;
  if (s.kind === 'title') { a = b = 0; alpha = 0; }
  else if (s.kind === 'hold') { a = b = s.i; if (s.i === 0) alpha = easeOut((t - s.t0) / 0.6); }
  else if (s.kind === 'end') { a = b = last; }
  else {
    // the text changes in the middle of the move: out over the 0.3 s before it, in over the 0.45 s after
    a = s.from; b = s.to;
    const mid = (s.t0 + s.t1) / 2;
    k = t < mid ? 0.5 * clamp01((t - (mid - 0.3)) / 0.3) : 0.5 + 0.5 * clamp01((t - mid) / 0.45);
  }
  const A = CAPS[a], B = CAPS[b];
  $('#caption').style.opacity = alpha.toFixed(3);
  setLine(capEls.eye, A.eye, B.eye, k, 4);
  setLine(capEls.name, A.name, B.name, k);
  setLine(capEls.text, A.line, B.line, k, 5);
  for (const s0 of capEls.eye.children) if (!s0.querySelector('i')) s0.insertAdjacentHTML('afterbegin', '<i></i>');
}

/** A chapter's long title keeps to one line on the title card: its type scales down to the card's width. The intro's card stays as it is. */
function fitTitle() {
  const t = cardEls && cardEls.t1;
  if (!t || CLIP) return;
  t.style.whiteSpace = 'nowrap';
  const room = W - 2 * LAY.title.x, wide = t.scrollWidth;
  if (wide > room) t.style.fontSize = `${Math.floor((parseFloat(getComputedStyle(t).fontSize) * room) / wide)}px`;
}

/** The caption's type scales down, if it must, so that the tallest caption fits its box. */
let capScale = 1;
function fitCaption() {
  const cap = $('#caption'), box = LAY.caption;
  const tallest = () => {
    let hmax = 0;
    for (const c of CAPS) {
      for (const [el, v] of [[capEls.eye, c.eye], [capEls.name, c.name], [capEls.text, c.line]]) for (const s of el.children) s.textContent = v;
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
  if (CLIP) {
    // the line of the intro runs on the time of the whole
    reelTrack(RL, CLIP.T0 + t).forEach(({ f, on }, i) => {
      const w = trackEls[i];
      w.el.classList.toggle('cur', on);
      w.fill.style.width = `${(f * 100).toFixed(3)}%`;
      w.fill.style.opacity = on ? '1' : '0.45';
    });
    return;
  }
  trackEls.forEach((w, i) => {
    const f = clamp01((t - w.span.a) / (w.span.b - w.span.a));
    const cur = t >= w.span.a && (t < w.span.b || i === trackEls.length - 1) && t >= L.tour.t0;
    w.el.classList.toggle('cur', cur);
    w.fill.style.width = `${(t < L.tour.t0 ? 0 : f * 100).toFixed(3)}%`;
    w.fill.style.opacity = cur ? '1' : '0.45';
  });
}

// ---------------------------------------------------------------- cards
function updateCards(t) {
  const a = L.tour.t0, b = L.tour.t1, d = DISSOLVE / 2;
  // only the first clip of the intro has the title card. Only the last clip has the end card.
  const titleOn = CLIP && !CLIP.intro ? 0 : 1 - ease((t - (a - d)) / DISSOLVE);
  const endOn = CLIP && !CLIP.outro ? 0 : ease((t - (b - d)) / DISSOLVE);
  const E = cardEls;
  E.card.style.opacity = Math.max(titleOn, endOn).toFixed(3);
  E.title.style.display = titleOn > 0 ? '' : 'none';
  E.end.style.display = endOn > 0 && titleOn <= 0 ? '' : 'none';
  if (titleOn > 0) {
    // the title rises in; the rule draws; the line follows
    const k0 = easeOut((t - 0.05) / 0.7), k1 = easeOut((t - 0.15) / 0.8), k2 = easeOut((t - 0.55) / 0.7), k3 = easeOut((t - 0.75) / 0.8);
    E.eye.style.opacity = k0.toFixed(3);
    E.t1.style.opacity = k1.toFixed(3);
    E.t1.style.transform = `translateY(${((1 - k1) * 26).toFixed(2)}px)`;
    E.rule.style.transform = `scaleX(${k2.toFixed(4)})`;
    E.sub.style.opacity = k3.toFixed(3);
    E.sub.style.transform = `translateY(${((1 - k3) * 18).toFixed(2)}px)`;
  }
  if (endOn > 0) {
    const k = easeOut((t - b) / 0.9);
    E.e1.style.opacity = k.toFixed(3);
    E.e1.style.transform = `translateY(${((1 - k) * 22).toFixed(2)}px)`;
  }
  drawTrace(t, titleOn > 0 ? 0 : b);
  return { titleOn, endOn };
}

/** The heartbeat trace on a card: the site's ECG (src/scope.js ecg()), swept in, four beats across. */
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
  ecg(ctx, E.x0 / k, E.x1 / k, (E.h * 0.66) / k, (E.h * 0.52) / k, beats, null, { color: PAL.dark['--accent'], offset: cycleMs(t0) / RR });
  ctx.restore();
}

// ---------------------------------------------------------------- frames
/** Frame i: everything on screen at t = i / FPS. The panes are not drawn while a card covers them. */
function frame(i) {
  const t = i / FPS + T0;
  window.__clock.set(10000 + t * 1000);
  advance(i);
  const { titleOn, endOn } = updateCards(t);
  // a 3D chapter's stage draws on the frames it books (src/gl/stage3d.js start()); it keeps its
  // own beat, so it runs on every frame, under a card too
  window.__clock.flush();
  if (Math.max(titleOn, endOn) < 1) {
    renderFigure();
    updateSide(C.text?.(state, { cite: () => '' }) || {});
  }
  updateCaption(t);
  updateTrack(t, endOn);
  if (CLIP) {
    // between two clips the panes and the caption dip to the frame (video/reel.js)
    const k = reelDip(CLIP, t, easeOut, ease);
    for (const el of $$('#frame > .pane')) el.style.opacity = k.toFixed(3);
    const cap = $('#caption');
    cap.style.opacity = (Number(cap.style.opacity || 1) * k).toFixed(3);
  }
  return { t };
}

/** The chapter's echo views and models load in the background: wait for them, then a little more. */
async function settle() {
  try { await scanner(); } catch (e) { /* a chapter without the scanner */ }
  await import('../src/echo.js');
  // a 3D chapter: its stage running with the chapter's own frame (its ready())
  for (let k = 0; C.ready && !C.ready() && k < 400; k++) await new Promise((r) => setTimeout(r, 50));
  if (C.ready && !C.ready()) throw new Error(`chapter ${KEY}: the 3D view did not start`);
  // each disease heart a step shows, built now (a few seconds, once), so that the step's first
  // frame shows it; then the heart shown before
  const hearts = [...new Set(V.steps.map((s) => s.set?.pheno).filter((k) => k && k !== 'normal'))];
  if (hearts.length) {
    const m = await loadModel(), was = state.pheno || 'normal';
    const until = async (k) => {
      for (let i = 0; m.pheno.key !== k && i < 1200; i++) await new Promise((r) => setTimeout(r, 50));
      if (m.pheno.key !== k) throw new Error(`chapter ${KEY}: the ${k} heart did not build`);
    };
    for (const k of hearts) { setPheno(k); await until(k); }
    setPheno(was);
    await until(was);
  }
  // the echo views cut from the mesh (src/meshpanel.js): their model and disease targets
  for (let k = 0; !meshPanelsReady() && k < 1200; k++) await new Promise((r) => setTimeout(r, 50));
  if (!meshPanelsReady()) throw new Error(`chapter ${KEY}: the mesh views did not load`);
  await new Promise((r) => setTimeout(r, 600));
}

async function init() {
  await applyTheme();
  for (const c of CHAPTERS) if (c.defaults) declare(c.defaults);
  declare({ pheno: 'normal' });
  // the heart a step shows (its pheno), as the site's menu sets it (src/main.js): the mesh takes
  // it, and the 2D views draw its valves
  subscribe((s, changed) => { if ('pheno' in changed) { setPheno(s.pheno); setHeart(s.pheno); } });
  set({ chapter: IDX, playing: true, anim: false });
  const src = await loadSource();
  SUB = V.sub || (plain($('.dek', src.art)?.innerHTML || '').match(/^.*?[.!?](?=\s|$)/) || [''])[0];
  build(src);   // the figure is in the page before the chapter looks for its parts
  C.init?.({ state, set, subscribe, $, $$, cite: () => '' });
  if (V.presets) STATES = stepStates(V, (await import(`../src/ch/${KEY}.js`))[V.presets.from]);
  subscribe((s, changed) => { C.onState?.(s, changed); if (sheet) sheet.dirty = true; });
  CAPS = V.steps.map((_, k) => capOf(k));
  labelTrack();
  await Promise.all(['400 20px "IBM Plex Sans"', '500 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"', '400 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"',
    '600 20px Caveat', '400 20px Caveat', '400 20px Newsreader', 'italic 400 20px Newsreader'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  sheet = C.figure?.(figEl, () => state) || null;
  if (sheet) sizeSheet(sheet, panes.fig.w, panes.fig.h, ZOOM);
  C.enter?.({ state, set, playing: true });
  C.tourEnter?.(set, state);
  C.warm?.();
  await settle();
  CAPS = V.steps.map((_, k) => capOf(k));
  labelTrack();
  set(STATES[0].a);
  fitCaption();
  fitTitle();
  sizeReelTrack();
  window.__clock.start();
  return {
    fps: FPS, frames: FRAMES, duration: CLIP ? CLIP.duration : L.duration, width: W, height: H, ch: KEY, name: C.title, num: NUM, capScale,
    clip: CLIP ? { k: CLIP.k, F0: CLIP.F0, F1: CLIP.F1, offset: CLIP.offset, T0: CLIP.T0, T1: CLIP.T1 } : null,
    segs: L.segs.map((s) => ({ kind: s.kind, i: s.i ?? null, from: s.from ?? null, to: s.to ?? null, t0: s.t0, t1: s.t1 })),
    caps: CAPS,
  };
}

const ready = init();
/** For writing a script: the grade bands of a severity key, from the chapter's own format (its slider's label). */
function bands(key) {
  const f = C.format?.[key];
  if (!f) return null;
  const out = [];
  for (let i = 0; i <= 400; i++) {
    const v = i / 400, g = f(v, state);
    if (!out.length || out[out.length - 1].g !== g) out.push({ g, a: v, b: v });
    else out[out.length - 1].b = v;
  }
  return out;
}
window.__video = { ready, frame, layout: L, video: V, key: KEY, bands, clip: CLIP };
// preview in a browser: video/chapter.html?ch=as&t=12.5 shows that moment
ready.then(() => {
  const at = params.get('t');
  if (at != null) frame(Math.round(Number(at) * FPS));
}).catch((err) => { console.error(err); document.title = `error: ${err.message}`; });
