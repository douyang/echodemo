// Study interpretation: how EchoPrime (Vukadinovic 2026) reads a whole echocardiography study.
// Study: the 14 videos of a comprehensive study of the heart the page shows, cut from the heart
// mesh as EchoPrime takes them in (16 frames of 224 × 224 pixels, one beat), each tagged with its
// view group; the anatomical attention weights of the public code (echoprime.js) as a heat map,
// 15 report sections by 11 view groups; and, for the chosen section, the share of its weight that
// the videos present carry, its three heaviest view groups, and its text in the site's own report
// (ch/report.js). Retrieval: a map of 2,000 simulated earlier studies, placed so that similar
// studies lie close, with the study of the heart shown, its k nearest studies and what they give.
// EchoPrime does not run here: the weights are the model's; the videos and the library are the site's.
import { Sheet, MONO, SANS, rng, clamp } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, mitralV, lvotV, RR, EV } from '../cyclemodel.js';
import { SC, flowColor } from '../scope.js';
import { colorFlow, stream, boxAround, jetFlow, convergence } from '../cflow.js';
import { scanner } from '../scanner.js';
import { onPlane, hingesOf, closureOf, blood, cavity, middle, sub, add, mul, dot, len, unit, perp } from '../meshjet.js';
import { VESSELS } from '../views.js';
import { GROUPS, SECTIONS, W as WEIGHT, coverage, K_PAPER } from '../echoprime.js';
import { buildReport, sectionTexts } from './report.js';

const G = Object.fromEntries(GROUPS.map((g, i) => [g.key, i]));
/**
 * The 14 videos of the study, in the order of a standard examination (the slider adds them in
 * this order): the view cut from the mesh (views.js), its view group, and the three color Doppler
 * videos.
 */
const TILES = [
  { view: 'plax', g: G.Parasternal_Long },
  { view: 'plax', g: G.Doppler_Parasternal_Long, color: 'plax' },
  { view: 'psax_av', g: G.Parasternal_Short },
  { view: 'psax_av', g: G.Doppler_Parasternal_Short, color: 'psax' },
  { view: 'psax_mv', g: G.Parasternal_Short },
  { view: 'psax_pm', g: G.Parasternal_Short },
  { view: 'a4c', g: G.A4C },
  { view: 'a4c', g: G.Apical_Doppler, color: 'a4c' },
  { view: 'a5c', g: G.A5C },
  { view: 'a2c', g: G.A2C },
  { view: 'a3c', g: G.A3C },
  { view: 'sc4c', g: G.Subcostal },
  { view: 'sc_ivc', g: G.Subcostal },
  { view: 'ssn', g: G.SSN },
];
const A4C = 6;            // the apical four-chamber video: the study of one video (aiOnly)
const N_ALL = TILES.length;

/** The videos in the study (indexes into TILES): the first aiN, or the A4C video alone. */
function videosOf(s) {
  if (s.aiOnly) return [A4C];
  const n = clamp(Math.round(s.aiN ?? N_ALL), 1, N_ALL);
  return TILES.map((_, i) => i).slice(0, n);
}
/** The view groups that the videos carry (a Set of GROUPS indexes). */
const groupsOf = (videos) => new Set(videos.map((i) => TILES[i].g));
const secOf = (s) => clamp(Math.round(s.aiSec ?? 0), 0, SECTIONS.length - 1);
/** The view groups of a section by weight, heaviest first: [{ g, w }]. */
const ranked = (sec) => WEIGHT[sec].map((w, g) => ({ g, w })).sort((a, b) => b.w - a.w || a.g - b.g);
/** A share in percent as the figure and the text print it: '<1' under 1%, '>99' short of 100%. */
const pctOf = (x) => (x > 0 && x < 0.01 ? '<1' : x > 0.99 && x < 1 - 1e-9 ? '>99' : String(Math.round(x * 100)));

// ---------------------------------------------------------------- the videos
// Each video is one beat of NF frames of PX × PX pixels, cut from the mesh once for the heart
// shown and kept in a sheet of 4 × 4 frames; the figure plays them in a loop on the page's clock.
// The frames are cut a few at a time on the page's animation frames, so the page stays
// responsive, in the order of the study; a video shows when all its frames are in.
const PX = 224, NF = 16, TOTAL = N_ALL * NF;
const BUDGET = 12;        // ms of cutting per animation frame (at least one frame)
const STILL = 10;         // the frame shown with reduced motion: early diastole, the valves open
const cache = {
  state: 'idle',          // idle, loading, ready, failed: the heart model and the view that cuts
  ev: null,               // one offscreen EchoView cuts every video
  version: -1,            // the version of the heart (model3d.js) that the frames show
  next: 0,                // the next frame to cut: video × NF + frame
  tiles: TILES.map(() => ({ sheet: null, done: 0, box: null })),
  t0: 0,                  // Date.now() at the first frame of this heart
  ms: 0,                  // ms to cut all the frames of this heart
};

let sheet = null, st = null, setState = null, open = false;
const redraw = () => { if (sheet) sheet.dirty = true; };
const heartWanted = () => (st && st.pheno) || 'normal';

/** Load the heart model and make the view that cuts the videos, once. */
function start() {
  if (cache.state !== 'idle') return;
  cache.state = 'loading';
  Promise.all([scanner(), import('../echo.js')]).then(([S, E]) => {
    // the view is PX / ratio CSS px, so that its canvas, and the frame, are PX device px
    const r = ratio(), w = Math.round(PX / r);
    const ev = new E.EchoView(S.model, document.createElement('canvas'), { offscreen: true, width: w, height: w });
    ev.fill = true;
    cache.ev = ev;
    cache.state = 'ready';
    redraw();
    pump();
  }).catch((err) => {
    console.error('ai: the videos failed', err);
    cache.state = 'failed';
    redraw();
  });
}
/** The pixel ratio of the echo views (echo.js setSize, bmode.js), at most 2. */
const ratio = () => Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);

/** True when every frame of the heart shown is in (or the model failed: nothing will come). */
function complete() {
  if (cache.state === 'failed') return true;
  if (cache.state !== 'ready') return false;
  const m = cache.ev.model;
  return m.pheno.key === heartWanted() && cache.version === m.pheno.version && cache.next >= TOTAL;
}
/** The frames of video i can show: all of them are in, for the heart shown. */
function shows(i) {
  if (cache.state !== 'ready') return false;
  const m = cache.ev.model;
  return m.pheno.key === heartWanted() && cache.version === m.pheno.version && cache.tiles[i].done >= NF;
}

let pumping = false;
/** Cut frames on the next animation frame, and on each one after it until all are in. */
function pump() {
  if (pumping || typeof requestAnimationFrame !== 'function') return;
  pumping = true;
  requestAnimationFrame(() => {
    pumping = false;
    if (open && fill()) pump();
  });
}
/** Cut the next frames for BUDGET ms (at least one). Returns true while frames remain or the heart is still being built. */
function fill() {
  if (cache.state === 'idle') start();
  if (cache.state !== 'ready') return false;     // start() pumps when the model is in
  const m = cache.ev.model;
  if (m.pheno.key !== heartWanted()) return true;   // the model builds the heart: wait for it
  if (cache.version !== m.pheno.version) {
    cache.version = m.pheno.version;
    cache.next = 0;
    for (const T of cache.tiles) { T.done = 0; T.box = null; }
    cache.t0 = Date.now();
    cache.ms = 0;
    redraw();
  }
  if (cache.next >= TOTAL) return false;
  // Date.now(): a video page holds performance.now() still while it loads (video/chapter.html)
  const t0 = Date.now();
  let n = 0;
  while (cache.next < TOTAL && (n === 0 || (n < 4 && Date.now() - t0 < BUDGET))) {
    try { cut(cache.next); } catch (err) { console.error('ai: a frame failed', err); }
    cache.next++;
    n++;
    if (cache.next % NF === 0) redraw();   // a video is in
  }
  if (cache.next >= TOTAL) { cache.ms = Date.now() - cache.t0; redraw(); return false; }
  return true;
}

/** Cut frame i (video × NF + frame) into its video's sheet. */
function cut(i) {
  const k = Math.floor(i / NF), f = i % NF, T = TILES[k], tile = cache.tiles[k], ev = cache.ev;
  const w = Math.round(PX / ratio());
  if (ev.w !== w || ev.dpr !== ratio()) ev.setSize(w, w);
  if (ev.view !== T.view) ev.setView(T.view, { animate: false });
  const c = cycleAt((f * RR) / NF);
  ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  if (T.color) colorOver(ev, T.color, c, tile);
  if (!tile.sheet) {
    tile.sheet = document.createElement('canvas');
    tile.sheet.width = 4 * PX;
    tile.sheet.height = 4 * PX;
  }
  const g = tile.sheet.getContext('2d');
  const x = (f % 4) * PX, y = Math.floor(f / 4) * PX;
  g.clearRect(x, y, PX, PX);
  g.drawImage(ev.canvas, 0, 0, ev.canvas.width, ev.canvas.height, x, y, PX, PX);
  // the view outlines its sector in the page's ink (echo.js draw): here, in the scanner's frame
  // color, so that a frame does not keep the theme it was cut in
  if (ev.fanPath) {
    const k2 = PX / ev.w;
    g.save();
    g.setTransform(k2, 0, 0, k2, x, y);
    g.strokeStyle = SC.bg;
    g.lineWidth = 2;
    g.stroke(ev.fanPath);
    g.restore();
  }
  tile.done = f + 1;
}

// ---------------------------------------------------------------- color Doppler on the mesh
// Normal flow in the three color videos, from the cycle model (cyclemodel.js), as the scanner
// shows it (cflow.js): BART colors, red toward the probe and blue away, aliasing at NYQ. Mitral
// and tricuspid inflow toward the apex in diastole, with the E and A waves; ejection through the
// LV outflow tract and the aortic root (parasternal long axis) and the RV outflow tract and the
// pulmonary artery (short axis at the aortic valve) in systole. Each stream runs between the
// heart's landmarks on the plane of the cut (echo.js anchors); the color stays in the blood of the
// cut. The Barlow heart adds its mitral regurgitation, the bicuspid heart its stenotic jet.
const NYQ = 60;           // cm/s

/** The frame of echo2d.js frame() for the offscreen view (cm on the plane -> CSS px). */
function frameOf(ev) {
  const mp = ev.map, spec = ev.specOf(ev.view), box = { x: 0, y: 0, w: ev.w, h: ev.h };
  const clipBox = new Path2D();
  clipBox.rect(0, 0, ev.w, ev.h);
  return {
    k: mp.scale, box, clipBox, fan: ev.fanPath,
    sect: { cx: mp.cx, top: mp.top, R: spec.depth * mp.scale, deg: spec.angle },
    view: { box, cx: mp.cx, top: mp.top, k: mp.scale, half: mp.half, depth: spec.depth },
  };
}

function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/**
 * The blood of the cut: each closed wall loop that lies inside an odd number of the others (an
 * endocardial or lumen outline: echo.js draws the walls even-odd).
 */
function bloodOf(ev) {
  const loops = ev.last.tissue.filter((L) => L.closed && L.pts.length > 2).map((L) => L.pts);
  return loops.filter((P, i) => loops.reduce((k, Q, j) => (j !== i && inside(Q, P[0][0], P[0][1]) ? k + 1 : k), 0) % 2 === 1);
}
/** What the color leaves out: the leaflets and the papillary muscles. */
const tissueOf = (ev) => [...ev.last.valves, ...ev.last.pap].filter((L) => L.closed && L.pts.length > 2).map((L) => L.pts);

/**
 * Inflow through an atrioventricular valve (as echo2d.js inflow): from the atrium's middle Q
 * through the middle of the annulus, fastest between the leaflet tips, on into the ventricle
 * toward A as a broad laminar jet that slows over far cm. Its axis runs from the atrium's middle
 * to A, turned a little square to the annulus. C: the valve's landmark, where the cut misses the
 * annulus. v: cm/s.
 */
function inflow(ev, valve, C, Q, A, v, far, seed) {
  const h = hingesOf(ev, valve);
  const H = h ? middle(h) : C;
  let into = unit(sub(A, Q));
  if (h) {
    let n = perp(unit(sub(h[1], h[0])));
    if (dot(n, into) < 0) n = mul(n, -1);
    into = unit(add(mul(into, 0.7), mul(n, 0.3)));
  }
  const k = h ? clamp(len(sub(h[1], h[0])) / 2.8, 0.75, 1.3) : 1;
  // upstream: the atrium's middle, when it lies behind the valve and not too far
  const back = dot(sub(Q, H), into) < -0.8 && len(sub(Q, H)) < 4.5 ? Q : add(H, mul(into, -2.2));
  const flow = v > 2 ? stream([back, H, add(H, mul(into, 1.1)), add(H, mul(into, 2.5)), add(H, mul(into, far))],
    [0.18 * v, 0.55 * v, v, 0.75 * v, 0.25 * v], [2.0 * k, 1.6 * k, 1.0 * k, 1.1 * k, 1.0 * k], { seed, tex: 0.15, bill: 0.14 }) : null;
  return { H, into, back, end: add(H, mul(into, far + 0.8)), flow };
}

/** The Barlow heart's mitral regurgitation in systole: from where the leaflets meet, into the LA (as ch/mr.js mrJet). */
function mrJet(ev, an, t, toward) {
  if (t < EV.mvc || t > EV.mvo) return [];
  const h = hingesOf(ev, 'MitralValve');
  if (!h) return [];
  const M = middle(h);
  let nrm = perp(unit(sub(h[1], h[0])));
  if (dot(sub(toward, M), nrm) < 0) nrm = mul(nrm, -1);
  const O = closureOf(ev, 'MitralValve', M, nrm) || M, side = perp(nrm);
  const LA = cavity(ev, blood(ev, onPlane(ev, an.la)), [[add(O, side), sub(O, side)]]);
  if (LA.length < 12) return [];
  const dir = unit(add(mul(nrm, -0.8), mul(unit(sub(middle(LA), O)), 0.2)));
  let deep = 0, w0 = Infinity, w1 = -Infinity;
  for (const p of LA) {
    deep = Math.max(deep, dot(sub(p, O), dir));
    const x = dot(sub(p, O), perp(dir));
    w0 = Math.min(w0, x);
    w1 = Math.max(w1, x);
  }
  // severe: EROA 0.46 cm² at 5 m/s (ch/report.js), a jet that fills most of the LA
  const a = Math.pow(Math.max(0, Math.sin((Math.PI * (t - EV.mvc)) / (EV.mvo - EV.mvc))), 0.35);
  const L = 0.85 * deep * Math.min(1, a * 1.15);
  if (a < 0.02 || L < 0.3) return [];
  return [
    convergence(O, dir, 230 * a, { cap: 500 }),
    jetFlow([O, add(O, mul(dir, L + 0.4))], { u0: 500 * Math.sqrt(a), vc: 0.8, len: L, wid: 0.6 * (w1 - w0), lam: 0, seed: 3, pk: 0.5, keep: true }),
  ];
}

/** The bicuspid heart's stenotic jet in systole: from where the cusps meet, up the aorta (as ch/as.js asJet). */
function asJet(ev, an, t) {
  if (t < EV.avo || t > EV.avc) return [];
  const av = onPlane(ev, an.av), up = unit(sub(onPlane(ev, an.ao), av));
  const O = closureOf(ev, 'AorticValve', av, up) || av, side = perp(up);
  const AO = cavity(ev, blood(ev, add(O, mul(up, 1.2)), 0.5), [[add(O, side), sub(O, side)]]);
  if (AO.length < 12) return [];
  const dir = unit(sub(middle(AO), O));
  // severe: 4.5 m/s through 0.76 cm² (ch/report.js); its strength follows ejection
  const a = lvotV(t, 1);
  if (a < 0.02) return [];
  return [
    convergence(O, dir, 342 * a, { cap: 450, half: 1.1 }),
    jetFlow([O, add(O, mul(dir, 4.6))], { u0: 450 * Math.sqrt(a), vc: 0.98, len: 4.2 * Math.min(1, a * 1.15), wid: 1.8, lam: 0.2, seed: 5, keep: true }),
  ];
}

/** The color of one frame of a color video, over the B-mode image the view has just cut. */
function colorOver(ev, kind, c, tile) {
  const t = c.t, an = ev.anchors(c.s), at = (k) => onPlane(ev, an[k]);
  const heart = ev.model.pheno.key;
  const flows = [], pts = [];
  if (kind === 'plax') {
    const lv = at('plv'), la = at('la');
    const mv = inflow(ev, 'MitralValve', at('mv'), la, lv, mitralV(t) * 100, 4.0, 25);
    if (mv.flow) flows.push(mv.flow);
    // ejection: from the LV through the outflow tract, the valve and the root; with a stenotic
    // valve the jet takes over at the valve
    const vo = lvotV(t) * 100;
    if (vo > 2) {
      const P = [lv, at('lvot'), at('av')], sp = [0.3 * vo, 0.9 * vo, 1.1 * vo], hw = [1.4, 0.85, 0.9];
      if (heart !== 'bav') { P.push(at('ao'), at('asc')); sp.push(vo, 0.85 * vo); hw.push(1.25, 1.2); }
      flows.push(stream(P, sp, hw, { seed: 27 }));
    }
    if (heart === 'barlow') flows.push(...mrJet(ev, an, t, lv));
    if (heart === 'bav') flows.push(...asJet(ev, an, t));
    pts.push(mv.back, mv.H, mv.end, at('av'), at('asc'), lv);
  } else if (kind === 'psax') {
    // ejection: along the RV outflow tract in front of the aortic root, through the pulmonic
    // valve, and down the main pulmonary artery toward its bifurcation
    const vp = lvotV(t - 10, 0.9) * 100;
    const rvot = at('rvot'), pv = at('pv'), pa = at('mpa'), bif = onPlane(ev, an.mpa.clone().set(...VESSELS.paBif));
    const P = [add(rvot, mul(unit(sub(rvot, pv)), 1.6)), rvot, pv, pa, add(pa, mul(unit(sub(bif, pa)), 1.6))];
    if (vp > 2) flows.push(stream(P, [0.4 * vp, 0.9 * vp, 1.05 * vp, 0.95 * vp, 0.75 * vp], [1.0, 0.9, 0.85, 1.0, 1.0], { seed: 29 }));
    pts.push(...P);
  } else {
    const apex = at('apex');
    const mv = inflow(ev, 'MitralValve', at('mv'), at('la'), apex, mitralV(t) * 100, 4.5, 21);
    const tv = inflow(ev, 'TricuspidValve', at('tv'), at('ra'), at('rv'), mitralV(t - 6, 0.5, 0.4) * 100, 3.2, 23);
    for (const x of [mv, tv]) if (x.flow) flows.push(x.flow);
    if (heart === 'barlow') flows.push(...mrJet(ev, an, t, apex));
    // the box takes the atria too, where a regurgitant jet runs
    pts.push(mv.back, tv.back, mv.H, tv.H, mv.end, tv.end, add(mv.H, mul(mv.into, -4.5)));
  }
  const F = frameOf(ev);
  // the color box keeps still through the beat: it is set at the video's first frame
  if (!tile.box) tile.box = boxAround(pts, F.view.half, { mr: 0.4 });
  colorFlow(ev.ctx, F, { box: tile.box, lo: -NYQ, hi: NYQ, variance: false, blood: bloodOf(ev), tissue: tissueOf(ev), flows, now: t / 1000 });
  colorScale(ev.ctx, F);
}
/** A color bar in the top right corner, as on the scanner (no numbers: the video is small). */
function colorScale(ctx, F) {
  const h = Math.round(F.box.h * 0.22), w = 5, x = F.box.x + F.box.w - w - 5, y = F.box.y + 8, c = [0, 0, 0];
  ctx.save();
  for (let i = 0; i < h; i++) {
    const [r, g, b] = flowColor(NYQ - ((i + 0.5) / h) * 2 * NYQ, -NYQ, NYQ, 0, c);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y + i, w, 1.2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the clock
let clock = 0;            // s: the videos' clock, run by anim()
let shownFrame = -1;
const frameNow = () => (reducedMotion ? STILL : Math.floor((clock * 1000) / (RR / NF)) % NF);

// ---------------------------------------------------------------- colors
const rgbOf = (c) => {
  const s = String(c || '').trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? [...s.slice(1)].map((x) => x + x).join('') : s.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : [128, 128, 128];
};
const mixRgb = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u));
const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
let PAL = { key: '' };
/**
 * The figure's colors from the sheet's tokens, so that both themes follow: the heat map's
 * single-hue scale from the paper (weight 0) to the accent (1), light to dark on paper and dark
 * to light on slate; the LVEF scale in the accent's hue, light to dark on paper (dark to light on
 * slate); and the four grades: none grey, mild the accent, moderate and severe the two flag reds.
 */
function palette(t) {
  const key = `${t.paper}|${t.paper2}|${t.accent}|${t.accent2}|${t.ink}|${t.flag}|${t.flag2}|${t.rule}`;
  if (PAL.key === key) return PAL;
  const p2 = rgbOf(t.paper2), ac = rgbOf(t.accent), a2 = rgbOf(t.accent2), ink = rgbOf(t.ink);
  const efLo = mixRgb(a2, ac, 0.25), efHi = mixRgb(ac, ink, 0.35);
  PAL = {
    key,
    heat: (w) => css(mixRgb(p2, ac, clamp(w, 0, 1))),
    heatDark: (w) => w > 0.55,
    ef: (ef) => css(mixRgb(efLo, efHi, clamp((ef - 10) / 70, 0, 1))),
    grade: [t.rule, t.accent, t.flag2, t.flag],
  };
  return PAL;
}

// ---------------------------------------------------------------- text helpers
/** str in lines of at most w px at font o, at most max lines; a cut last line ends with an ellipsis. */
function wrap(sh, str, w, o, max = Infinity) {
  const lines = [];
  let cur = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || sh.measure(next, o) <= w) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  let last = out[max - 1];
  while (last.includes(' ') && sh.measure(`${last}…`, o) > w) last = last.replace(/\s+\S+$/, '');
  out[max - 1] = `${last.replace(/[,;:]$/, '')}…`;
  return out;
}
/** A line of text whose top is at y; returns the top of the next line (gap px below it). */
function line(sh, str, x, y, o, gap = 4) {
  sh.text(str, x, y + o.size * 0.8, o);
  return y + o.size + gap;
}
/** The first form that fits w px at font o, or the last. */
const fitText = (sh, forms, w, o) => forms.find((f) => sh.measure(f, o) <= w) ?? forms[forms.length - 1];

// row names: the full section names, or the short ones of a narrow figure
const SHORT = ['LV', 'WM', 'RV', 'LA', 'RA', 'IAS', 'MV', 'AV', 'TV', 'PV', 'Peri', 'Aorta', 'IVC', 'PA', 'PVs'];
// the name of a section in a sentence
const IN_TEXT = ['left ventricle', 'regional wall motion', 'right ventricle', 'left atrium', 'right atrium', 'atrial septum', 'mitral valve', 'aortic valve', 'tricuspid valve', 'pulmonic valve', 'pericardium', 'aorta', 'IVC', 'pulmonary artery', 'pulmonary veins'];
// a view group in a sentence
const GROUP_TEXT = {
  A2C: 'the apical two-chamber view', A3C: 'the apical three-chamber view', A4C: 'the apical four-chamber view', A5C: 'the apical five-chamber view',
  Apical_Doppler: 'apical color Doppler', Doppler_Parasternal_Long: 'parasternal long-axis color Doppler', Doppler_Parasternal_Short: 'parasternal short-axis color Doppler',
  Parasternal_Long: 'the parasternal long-axis view', Parasternal_Short: 'the parasternal short-axis view', SSN: 'the suprasternal view', Subcostal: 'the subcostal view',
};

// ---------------------------------------------------------------- the study: layout
let hit = null;           // the heat map's rows on screen, for a click: { x0, x1, y0, rh }

/** Tiles in box b: the column count of cols that gives the largest square tiles. */
function gridIn(b, cols, gap) {
  let best = null;
  for (const c of cols) {
    const r = Math.ceil(N_ALL / c);
    const s = Math.floor(Math.min((b.w - (c - 1) * gap) / c, (b.h - (r - 1) * gap) / r));
    if (!best || s > best.s) best = { c, r, s };
  }
  return { ...best, gap, x: b.x, y: b.y, w: best.c * best.s + (best.c - 1) * gap, h: best.r * best.s + (best.r - 1) * gap };
}

/** The heat map's size at width w: its row labels, and the height of its title and column labels. */
function heatSize(sh, w, narrow) {
  const lab = { family: SANS, weight: 400, size: narrow ? 10 : 11.5 };
  const full = SECTIONS.map((x) => x.name), wFull = Math.max(...full.map((s) => sh.measure(s, lab)));
  const useFull = w - wFull - 10 >= 11 * 26;
  const names = useFull ? full : SHORT;
  const labelW = Math.ceil(Math.max(...names.map((s) => sh.measure(s, lab)))) + 10;
  const tagO = { family: SANS, weight: 500, size: narrow ? 10 : 11 };
  const tagW = Math.max(...GROUPS.map((g) => sh.measure(g.tag, tagO)));
  // the column labels slant up to the right: the last one needs room past the last column
  const ang = (60 * Math.PI) / 180;
  const cw0 = (w - labelW) / GROUPS.length, padR = Math.max(0, Math.ceil(tagW * Math.cos(ang) - cw0 / 2) + 2);
  const cw = (w - labelW - padR) / GROUPS.length;
  const head = Math.ceil(tagW * Math.sin(ang)) + 9;
  return { lab, names, labelW, tagO, cw, ang, head, title: narrow ? 19 : 22 };
}

function studyLayout(sh, W, H) {
  const wide = W >= 640 && W >= H * 1.05;
  if (wide) {
    const pad = 14, gap = 18;
    const lw = Math.round((W - 2 * pad - gap) * 0.55);
    const left = { x: pad, y: pad, w: lw, h: H - 2 * pad - 18 };
    const right = { x: pad + lw + gap, y: pad, w: W - 2 * pad - gap - lw, h: H - 2 * pad };
    // four columns, unless three give tiles a tenth larger
    const g3 = gridIn(left, [3], 8), g4 = gridIn(left, [4], 8);
    const grid = g3.s > 1.1 * g4.s ? g3 : g4;
    const hs = heatSize(sh, right.w, false);
    const rh = clamp(Math.floor((right.h * 0.6 - hs.title - hs.head) / 15), 11, 21);
    const heat = { x: right.x, y: right.y, w: right.w, h: hs.title + hs.head + 15 * rh, rh, ...hs };
    const box = { x: right.x, y: heat.y + heat.h + 14, w: right.w, h: right.y + right.h - (heat.y + heat.h + 14) };
    return { wide, grid, heat, box, pad, foot: { x: grid.x, y: grid.y + grid.h + 14, w: grid.w } };
  }
  // narrow (a phone): the grid, the heat map, then the section box. The grid in four columns,
  // with the section, its share of the weight and its top views beside it; a short figure takes
  // the videos in two rows of seven, with the section under the heat map, if its tiles are larger.
  const pad = 6, gap = 8, SIDE = 112;
  const hs = heatSize(sh, W - 2 * pad, true);
  const rh = clamp(Math.floor((H * 0.4 - hs.title - hs.head) / 15), 9, 13);
  const heatH = hs.title + hs.head + 15 * rh;
  const free = H - 2 * pad - 2 * gap - heatH;
  let grid = gridIn({ x: pad, y: pad, w: W - 2 * pad - 10 - SIDE, h: free - 58 }, [4], 4);
  let side = { x: pad + grid.w + 10, y: pad, w: W - 2 * pad - grid.w - 10, h: grid.h };
  const g7 = gridIn({ x: pad, y: pad, w: W - 2 * pad, h: free - 92 }, [7], 4);
  if (grid.s < 52 && g7.s > grid.s) { grid = g7; side = null; }
  const heat = { x: pad, y: pad + grid.h + gap, w: W - 2 * pad, h: heatH, rh, ...hs };
  const box = { x: pad, y: heat.y + heat.h + gap, w: W - 2 * pad, h: H - pad - (heat.y + heat.h + gap) };
  return { wide, grid, side, heat, box, pad, foot: null };
}

// ---------------------------------------------------------------- the study: drawing
/** One video: its frame, or a placeholder until its frames are in; dim when it is not in the study. */
function tile(sh, t, i, x, y, s, inStudy, sec) {
  const ctx = sh.ctx, T = TILES[i];
  ctx.save();
  ctx.fillStyle = SC.bg;
  ctx.fillRect(x, y, s, s);
  if (shows(i)) {
    const f = frameNow(), sx = (f % 4) * PX, sy = Math.floor(f / 4) * PX;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache.tiles[i].sheet, sx, sy, PX, PX, x, y, s, s);
  } else {
    // a placeholder: the sector's outline, and how many frames are in
    ctx.strokeStyle = SC.frame;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + 3);
    ctx.arc(x + s / 2, y + 3, s * 0.9, Math.PI / 2 + 0.7, Math.PI / 2 - 0.7, true);
    ctx.closePath();
    ctx.save();
    ctx.clip(new Path2D(`M${x} ${y}h${s}v${s}h${-s}z`));
    ctx.stroke();
    ctx.restore();
    const done = cache.state === 'ready' && cache.version === cache.ev.model.pheno.version ? cache.tiles[i].done : 0;
    ctx.fillStyle = SC.frame;
    ctx.fillRect(x + 6, y + s - 7, s - 12, 2);
    ctx.fillStyle = SC.dim;
    ctx.fillRect(x + 6, y + s - 7, ((s - 12) * done) / NF, 2);
    if (cache.state === 'failed') {
      ctx.font = `500 9px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('no heart model', x + s / 2, y + s / 2);
    }
  }
  ctx.restore();
  const { fs, two } = tagSize(sh, s);
  // the tile keeps its text: nothing runs into the next one
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip();
  if (!inStudy) {
    // not acquired: the video dims into the paper
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = t.paper;
    ctx.fillRect(x, y, s, s);
    ctx.restore();
    const o = { family: SANS, weight: 500, size: fs, align: 'center', color: t.ink2 };
    if (sh.measure('not acquired', o) <= s - 6) sh.text('not acquired', x + s / 2, y + s / 2 + fs * 0.35, o);
    else { sh.text('not', x + s / 2, y + s / 2 - 1, o); sh.text('acquired', x + s / 2, y + s / 2 + fs + 1, o); }
  }
  // the view group's tag, as the scanner prints its text; on a video not in the study, in the page's ink
  const lines = two ? tagLines(GROUPS[T.g].tag) : [GROUPS[T.g].tag], lh = fs + 1.5;
  ctx.font = `500 ${fs}px ${MONO}`;
  if (inStudy) {
    ctx.fillStyle = 'rgba(8,10,12,0.72)';
    ctx.fillRect(x + 2, y + 2, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 6, lines.length * lh + 3.5);
  }
  ctx.fillStyle = inStudy ? SC.text : t.ink2;
  ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, x + 5, y + 4.5 + k * lh));
  if (inStudy) {
    // the chosen section's weight for this video's group: its number, and a frame as strong as it is
    const w = WEIGHT[sec][T.g];
    if (w > 0.005) {
      ctx.save();
      ctx.strokeStyle = t.accent;
      ctx.globalAlpha = 0.3 + 0.7 * w;
      ctx.lineWidth = 1 + (s < 80 ? 2.5 : 3.5) * w;
      const o = ctx.lineWidth / 2;
      ctx.strokeRect(x + o, y + o, s - 2 * o, s - 2 * o);
      ctx.restore();
    }
    const str = w.toFixed(2);
    ctx.font = `600 ${fs}px ${MONO}`;
    const ww = ctx.measureText(str).width;
    ctx.fillStyle = 'rgba(8,10,12,0.72)';
    ctx.fillRect(x + s - ww - 9, y + s - fs - 8, ww + 6, fs + 5);
    ctx.fillStyle = SC.cal;
    ctx.fillText(str, x + s - ww - 6, y + s - fs - 5.5);
  }
  ctx.restore();
}
/** A tag in two lines, for a small tile: at its space ('PLAX', 'Dop'), or after three letters ('Sub-', 'costal'). */
function tagLines(tag) {
  const i = tag.indexOf(' ');
  return i > 0 ? [tag.slice(0, i), tag.slice(i + 1)] : tag.length > 6 ? [`${tag.slice(0, 3)}-`, tag.slice(3)] : [tag];
}
/**
 * The type of a tile's text: { fs (px), two }. The widest tag fits the tile in one line at 8 px or
 * more; on a smaller tile the tags take two lines.
 */
function tagSize(sh, s) {
  const base = s < 90 ? 9.5 : 10.5, o = { family: MONO, weight: 500, size: base }, room = s - 10;
  const widest = (list) => Math.max(...list.map((l) => sh.measure(l, o)));
  const one = Math.min(base, (base * room) / widest(GROUPS.map((g) => g.tag)));
  if (one >= 8) return { fs: Math.floor(one * 10) / 10, two: false };
  return { fs: Math.max(7, Math.floor(Math.min(base, (base * room) / widest(GROUPS.flatMap((g) => tagLines(g.tag)))) * 10) / 10), two: true };
}

/** The attention weights: a row for each section, a column for each view group. */
function heatMap(sh, t, b, sec, groups, narrow) {
  const ctx = sh.ctx, P = palette(t);
  const { labelW, cw, ang, head, rh, names, lab, tagO } = b;
  // title, and the scale from 0 to 1
  const ttl = { family: SANS, weight: 600, size: narrow ? 12 : 13, color: t.ink2 };
  sh.text(fitText(sh, ['Attention weights by view group', 'Attention weights'], b.w - 120, ttl), b.x, b.y + 13, ttl);
  const lw = narrow ? 56 : 80, lx = b.x + b.w - lw - 14, ly = b.y + 5;
  for (let i = 0; i < lw; i++) { ctx.fillStyle = P.heat(i / (lw - 1)); ctx.fillRect(lx + i, ly, 1.2, 8); }
  ctx.save(); ctx.strokeStyle = t.rule; ctx.lineWidth = 1; ctx.strokeRect(lx - 0.5, ly - 0.5, lw + 1, 9); ctx.restore();
  const so = { family: MONO, weight: 500, size: 9.5, color: t.ink3 };
  sh.text('0', lx - 4, ly + 8, { ...so, align: 'right' });
  sh.text('1', lx + lw + 4, ly + 8, so);
  const x0 = b.x + labelW, y0 = b.y + b.title + head;
  // column labels; a group not in the study in the faint ink
  GROUPS.forEach((g, j) => {
    const on = groups.has(j), cx = x0 + (j + 0.5) * cw;
    ctx.save();
    ctx.translate(cx + (ang < 1.5 ? -2 : 3.5), y0 - 6);
    ctx.rotate(-ang);
    ctx.font = `${on ? 500 : 400} ${tagO.size}px ${SANS}`;
    ctx.fillStyle = on ? t.ink2 : t.ink3;
    ctx.textAlign = 'left';
    ctx.fillText(g.tag, 0, 0);
    ctx.restore();
  });
  // the cells
  const valO = { family: MONO, weight: 600, size: Math.min(10.5, rh - 1, cw * 0.36) };
  for (let i = 0; i < SECTIONS.length; i++) {
    const y = y0 + i * rh, chosen = i === sec;
    sh.text(names[i], x0 - 8, y + rh / 2 + lab.size * 0.36, { ...lab, align: 'right', weight: chosen ? 600 : 400, color: chosen ? t.ink : t.ink2 });
    for (let j = 0; j < GROUPS.length; j++) {
      const w = WEIGHT[i][j], x = x0 + j * cw, on = groups.has(j);
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.32;
      ctx.fillStyle = P.heat(w);
      ctx.fillRect(x + 0.5, y + 0.5, cw - 1, rh - 1);
      ctx.restore();
    }
  }
  // a group not in the study: its column hatched
  for (let j = 0; j < GROUPS.length; j++) {
    if (groups.has(j)) continue;
    const p = new Path2D();
    p.rect(x0 + j * cw + 0.5, y0 + 0.5, cw - 1, 15 * rh - 1);
    sh.hatch(p, -0.8, 5, t.ink3, 0.8, j + 1, 0.55);
  }
  // the chosen row: outlined, with its weights
  const ys = y0 + sec * rh;
  ctx.save();
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x0 - 1, ys - 1, GROUPS.length * cw + 2, rh + 2);
  ctx.restore();
  if (valO.size >= 8) {
    for (let j = 0; j < GROUPS.length; j++) {
      const w = WEIGHT[sec][j], str = cw >= sh.measure('0.00', valO) + 3 ? w.toFixed(2) : w.toFixed(2).replace(/^0(?=\.)/, '');
      const dark = P.heatDark(w) && groups.has(j);
      sh.text(str, x0 + (j + 0.5) * cw, ys + rh / 2 + valO.size * 0.36, { ...valO, align: 'center', color: dark ? t.paper : t.ink });
    }
  }
  hit = { x0: b.x, x1: x0 + GROUPS.length * cw, y0, rh };
}

/**
 * The chosen section: its name, the share of its weight that the videos present carry (with a
 * meter), its three heaviest view groups, and its text in the site's own report for this heart.
 * side: on a phone, the box beside the grid, which takes the name, the share and the views.
 */
function sectionBox(sh, t, b, side, sec, groups, narrow) {
  const ctx = sh.ctx, cov = coverage(sec, groups), top3 = ranked(sec).slice(0, 3);
  const name = { family: SANS, weight: 600, size: narrow ? 13 : 15, color: t.ink };
  const small = { family: SANS, weight: 400, size: narrow ? 10.5 : 12, color: t.ink2 };
  const head = { ...small, weight: 600 };
  const num = { family: MONO, weight: 600, size: narrow ? 12.5 : 14, color: t.ink };
  /** The name, the share and its meter in box r, from its top; returns the top of what follows. */
  const share = (r) => {
    let y = r.y;
    for (const s of wrap(sh, SECTIONS[sec].name, r.w, name, 2)) y = line(sh, s, r.x, y, name, 3);
    y += 5;
    const pct = `${pctOf(cov)}%`, lab = 'Attention present';
    if (sh.measure(lab, small) + sh.measure(pct, num) + 10 <= r.w) {
      sh.text(pct, r.x + r.w, y + num.size * 0.8, { ...num, align: 'right' });
      y = line(sh, lab, r.x, y + (num.size - small.size), small, 6);
    } else {
      y = line(sh, lab, r.x, y, small, 3);
      y = line(sh, pct, r.x, y, num, 6);
    }
    ctx.save();
    ctx.fillStyle = t.paper3;
    ctx.fillRect(r.x, y, r.w, 5);
    ctx.fillStyle = t.accent;
    ctx.fillRect(r.x, y, Math.round(r.w * cov), 5);
    ctx.restore();
    return y + 5;
  };
  /** The three heaviest view groups: in one line, or one line each (lines); a group not in the study faint. */
  const tops = (x, y, w, lines) => {
    y = line(sh, 'Top views', x, y, head, 4);
    const items = top3.map(({ g, w: v }) => ({ str: `${GROUPS[g].tag} ${v.toFixed(2)}`, on: groups.has(g) }));
    const one = items.map((it) => it.str).join('  ·  ');
    if (!lines && sh.measure(one, small) <= w) {
      let cx = x;
      items.forEach((it, k) => {
        const s = (k ? '  ·  ' : '') + it.str;
        sh.text(s, cx, y + small.size * 0.8, { ...small, color: it.on ? t.ink : t.ink3 });
        cx += sh.measure(s, small);
      });
      return y + small.size;
    }
    for (const it of items) y = line(sh, it.str, x, y, { ...small, color: it.on ? t.ink : t.ink3 }, 3);
    return y;
  };
  let y;
  if (side) {
    tops(side.x, share(side) + 14, side.w, true);
    y = b.y;
  } else if (narrow) {
    // under the heat map on a short phone: the name and the share in one line, the meter, the top views
    const pct = `${pctOf(cov)}%`, base = b.y + name.size * 0.8, pw = sh.measure(pct, num);
    sh.text(pct, b.x + b.w, base, { ...num, align: 'right' });
    if (sh.measure(SECTIONS[sec].name, name) + sh.measure('Attention present', small) + pw + 24 <= b.w) sh.text('Attention present', b.x + b.w - pw - 8, base, { ...small, align: 'right' });
    y = line(sh, SECTIONS[sec].name, b.x, b.y, name, 5);
    ctx.save();
    ctx.fillStyle = t.paper3;
    ctx.fillRect(b.x, y, b.w, 4);
    ctx.fillStyle = t.accent;
    ctx.fillRect(b.x, y, Math.round(b.w * cov), 4);
    ctx.restore();
    y += 10;
    const items = top3.map(({ g, w: v }) => ({ str: `${GROUPS[g].tag} ${v.toFixed(2)}`, on: groups.has(g) }));
    let cx = b.x;
    sh.text('Top views', cx, y + small.size * 0.8, head);
    cx += sh.measure('Top views', head) + 8;
    for (const [k, it] of items.entries()) {
      const str = (k ? ' · ' : '') + it.str;
      if (cx + sh.measure(str, small) > b.x + b.w) break;
      sh.text(str, cx, y + small.size * 0.8, { ...small, color: it.on ? t.ink : t.ink3 });
      cx += sh.measure(str, small);
    }
    y += small.size + 12;
  } else {
    y = tops(b.x, share(b) + 16, b.w, false) + 18;
  }
  // the section's text in the site's own report for this heart: not EchoPrime's output
  const txt = sectionTexts(heartCase(), 'M')[SECTIONS[sec].key] || '';
  const lab = { family: SANS, weight: 600, size: narrow ? 10 : 11, color: t.ink3 };
  const body = { family: SANS, weight: 400, size: narrow ? 11 : 12.5, color: t.ink2 };
  const lh = body.size + 4, n = Math.floor((b.y + b.h - (y + lab.size + 6)) / lh);
  if (n < 1) return;
  y = line(sh, 'Site report for this heart', b.x, y, lab, 6);
  for (const s of wrap(sh, txt, b.w, body, n)) y = line(sh, s, b.x, y, body, 4);
}

function drawStudy(sh, t) {
  const W = sh.w, H = sh.h, s = st, sec = secOf(s), videos = videosOf(s), groups = groupsOf(videos), inStudy = new Set(videos);
  const L = studyLayout(sh, W, H);
  const g = L.grid;
  TILES.forEach((_, i) => {
    const x = g.x + (i % g.c) * (g.s + g.gap), y = g.y + Math.floor(i / g.c) * (g.s + g.gap);
    tile(sh, t, i, x, y, g.s, inStudy.has(i), sec);
  });
  if (L.foot) {
    const o = { family: SANS, weight: 400, size: 11, color: t.ink3 };
    sh.text(fitText(sh, ['Each video: one beat in 16 frames of 224 × 224 pixels, EchoPrime’s input', '16 frames of 224 × 224 pixels each'], L.foot.w, o), L.foot.x, L.foot.y, o);
  }
  heatMap(sh, t, L.heat, sec, groups, !L.wide);
  sectionBox(sh, t, L.box, L.side, sec, groups, !L.wide);
}

// ---------------------------------------------------------------- the library (Retrieval)
// 2,000 earlier studies, made here: an LVEF from a mixture (70% about 62% with SD 5, 15% about
// 45% with SD 6, 15% about 28% with SD 7, held to 10 to 80%), an aortic stenosis grade (none 85%,
// mild 5%, moderate 4%, severe 6%) and a mitral regurgitation grade (none or trace 72%, mild 14%,
// moderate 8%, severe 6%), drawn independently. Each section has its own map, as EchoPrime has an
// embedding for each section: a place that follows the section's value (LVEF along a curved band;
// a cluster for each grade, the clusters along an arc), plus noise of the study's own. Most
// studies lie near their value's place; some (STRAY) lie far from it, as the other findings of a
// study move it in the embedding.
const N_LIB = 2000, STRAY = 0.12;
const GRADES = {
  av: { names: ['none', 'mild', 'moderate', 'severe'], what: 'aortic stenosis', none: 'no aortic stenosis' },
  mv: { names: ['none or trace', 'mild', 'moderate', 'severe'], what: 'mitral regurgitation', none: 'no or trace mitral regurgitation' },
};
/** The LVEF's place on its map (unit square): an arch from 10% at the lower left to 80% at the lower right. */
function efPlace(ef) {
  const u = clamp((ef - 10) / 70, 0, 1), th = ((200 + 150 * u) * Math.PI) / 180;
  return [0.5 + 0.42 * Math.cos(th), 0.79 + 0.42 * Math.sin(th)];
}
/** A grade's place on its map: the four clusters along an arc, none at the lower left. */
function gradePlace(g) {
  const th = ((198 + 32 * g) * Math.PI) / 180;
  return [0.62 + 0.46 * Math.cos(th), 0.82 + 0.46 * Math.sin(th)];
}
const SPREAD = { ef: 0.055, grade: [0.1, 0.07, 0.07, 0.07], stray: 0.22 };
let LIB = null;
function library() {
  if (LIB) return LIB;
  const r = rng(20260212);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const pick = (P) => { let u = r(), g = 0; while (g < P.length - 1 && u >= P[g]) { u -= P[g]; g++; } return g; };
  const ef = new Float32Array(N_LIB), av = new Uint8Array(N_LIB), mv = new Uint8Array(N_LIB);
  const pos = { lv: new Float32Array(2 * N_LIB), av: new Float32Array(2 * N_LIB), mv: new Float32Array(2 * N_LIB) };
  for (let i = 0; i < N_LIB; i++) {
    const u = r();
    ef[i] = Math.round(clamp(u < 0.7 ? 62 + 5 * gauss() : u < 0.85 ? 45 + 6 * gauss() : 28 + 7 * gauss(), 10, 80));
    av[i] = pick([0.85, 0.05, 0.04, 0.06]);
    mv[i] = pick([0.72, 0.14, 0.08, 0.06]);
    const put = (key, [x, y], sd) => {
      const k = r() < STRAY ? SPREAD.stray : sd;
      pos[key][2 * i] = x + k * gauss();
      pos[key][2 * i + 1] = y + k * gauss();
    };
    put('lv', efPlace(ef[i]), SPREAD.ef);
    put('av', gradePlace(av[i]), SPREAD.grade[av[i]]);
    put('mv', gradePlace(mv[i]), SPREAD.grade[mv[i]]);
  }
  LIB = { ef, av, mv, pos };
  return LIB;
}

const HEARTS = ['normal', 'amyloid', 'icm', 'barlow', 'bav'];
/** The case of the site's report for the heart shown (ch/report.js has one for each heart). */
const heartCase = () => (HEARTS.includes(heartWanted()) ? heartWanted() : 'normal');
const HEART_VALUES = new Map();
/**
 * The heart shown, as the site's report has it: its LVEF (biplane), its aortic stenosis grade
 * (severe when the report states it, else none) and its mitral regurgitation grade (severe when
 * the report states it, else the grade its mitral text names: trace counts with none).
 */
function heartValues(key) {
  if (HEART_VALUES.has(key)) return HEART_VALUES.get(key);
  const R = buildReport(key, 'M'), c = R.c;
  const word = (c.mv.text.match(/\b(trace|mild|moderate|severe)\b[^.]*\bmitral regurgitation/i) || [])[1]?.toLowerCase();
  const v = { ef: R.ef, av: c.av.severe ? 3 : 0, mv: c.mv.severe ? 3 : { mild: 1, moderate: 2, severe: 3 }[word] ?? 0 };
  HEART_VALUES.set(key, v);
  return v;
}
const mapOf = (s) => (['lv', 'av', 'mv'].includes(s.aiMap) ? s.aiMap : 'lv');
const kOf = (s) => clamp(Math.round(s.aiK ?? K_PAPER), 1, 200);

const ORDERS = new Map();
/** The query's place and the library's studies by distance from it, nearest first. */
function neighbors(map, key) {
  const id = `${map}|${key}`;
  if (ORDERS.has(id)) return ORDERS.get(id);
  const L = library(), H = heartValues(key), P = L.pos[map];
  const q = map === 'lv' ? efPlace(H.ef) : gradePlace(H[map]);
  const d = new Float32Array(N_LIB);
  for (let i = 0; i < N_LIB; i++) d[i] = Math.hypot(P[2 * i] - q[0], P[2 * i + 1] - q[1]);
  const order = Array.from({ length: N_LIB }, (_, i) => i).sort((a, b) => d[a] - d[b] || a - b);
  const out = { q, d, order };
  ORDERS.set(id, out);
  return out;
}
/** What the k nearest studies give for section map: LV, their LVEFs; a valve, the count of each grade and the grade reported. */
function retrieve(map, key, k) {
  const L = library(), N = neighbors(map, key), first = N.order.slice(0, k), H = heartValues(key);
  if (map === 'lv') {
    const v = first.map((i) => L.ef[i]);
    return { map, k, mean: Math.round(v.reduce((a, b) => a + b, 0) / k), nearest: L.ef[first[0]], lo: Math.min(...v), hi: Math.max(...v), heart: H.ef, N, first };
  }
  const counts = [0, 0, 0, 0];
  for (const i of first) counts[L[map][i]]++;
  // a finding enters the report when more than half of the k carry it
  const rep = counts.findIndex((n) => n > k / 2);
  return { map, k, counts, rep, heart: H[map], N, first };
}

// ---------------------------------------------------------------- the library: drawing
let DOTS = { key: '', cv: null };
/** The studies as dots, drawn once for a map, a size and a theme. */
function dots(sh, t, map, side) {
  const P = palette(t), k = sh.dpr * (sh.z || 1), key = `${map}|${side}|${k}|${P.key}`;
  if (DOTS.key === key) return DOTS.cv;
  const L = library(), pos = L.pos[map], n = Math.ceil(side * k);
  const cv = DOTS.cv || document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const g = cv.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, side, side);
  const dot1 = (i, color, r) => {
    const x = pos[2 * i] * side, y = pos[2 * i + 1] * side;
    if (x < 1 || y < 1 || x > side - 1 || y > side - 1) return;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  if (map === 'lv') for (let i = 0; i < N_LIB; i++) dot1(i, P.ef(L.ef[i]), 1.35);
  else {
    // no disease first and smaller, so that the grades lie over it
    const gr = L[map];
    for (let lev = 0; lev < 4; lev++) for (let i = 0; i < N_LIB; i++) if (gr[i] === lev) dot1(i, P.grade[lev], lev ? 1.5 : 1.1);
  }
  DOTS = { key, cv };
  return cv;
}

function retrievalLayout(W, H) {
  const wide = W >= 640 && W >= H * 1.05;
  if (wide) {
    const pad = 14, gap = 22;
    const side = Math.floor(Math.min(H - 2 * pad, (W - 2 * pad - gap) * 0.62));
    return { wide, map: { x: pad, y: pad, w: side, h: side }, box: { x: pad + side + gap, y: pad, w: W - 2 * pad - gap - side, h: side } };
  }
  const pad = 6, gap = 10;
  const side = Math.floor(Math.min(W - 2 * pad, H - 2 * pad - gap - 128));
  return { wide, map: { x: Math.round((W - side) / 2), y: pad, w: side, h: side }, box: { x: pad, y: pad + side + gap, w: W - 2 * pad, h: H - 2 * pad - side - gap } };
}

function drawRetrieval(sh, t) {
  const ctx = sh.ctx, s = st, map = mapOf(s), k = kOf(s), key = heartCase();
  const L = retrievalLayout(sh.w, sh.h), M = L.map, side = M.w;
  const R = retrieve(map, key, k);
  // the map: its frame, the studies, the k nearest ringed, the circle that holds them, the query
  ctx.save();
  ctx.fillStyle = t.paper2;
  ctx.fillRect(M.x, M.y, side, side);
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(M.x + 0.5, M.y + 0.5, side - 1, side - 1);
  ctx.drawImage(dots(sh, t, map, side), M.x, M.y, side, side);
  ctx.restore();
  const X = (u) => M.x + u * side, Y = (v) => M.y + v * side;
  const pos = library().pos[map];
  ctx.save();
  ctx.beginPath();
  ctx.rect(M.x, M.y, side, side);
  ctx.clip();
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const i of R.first) {
    const x = X(pos[2 * i]), y = Y(pos[2 * i + 1]);
    ctx.moveTo(x + 3.6, y);
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
  }
  ctx.stroke();
  const [qx, qy] = [X(R.N.q[0]), Y(R.N.q[1])], rk = R.N.d[R.first[R.first.length - 1]] * side;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = t.ink2;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(qx, qy, Math.max(rk, 4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // the query: a cross with a halo of paper
  for (const [c, lw] of [[t.paper, 5.5], [t.ink, 2.2]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(qx - 7, qy - 7); ctx.lineTo(qx + 7, qy + 7);
    ctx.moveTo(qx + 7, qy - 7); ctx.lineTo(qx - 7, qy + 7);
    ctx.stroke();
  }
  ctx.restore();
  const qo = { family: SANS, weight: 600, size: 12, color: t.ink };
  const qw = sh.measure('this heart', qo), right = qx + 12 + qw < M.x + side - 6;
  ctx.save();
  ctx.font = `600 12px ${SANS}`;
  ctx.textAlign = right ? 'left' : 'right';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = t.paper2;
  ctx.strokeText('this heart', right ? qx + 12 : qx - 12, qy - 9);
  ctx.restore();
  sh.text('this heart', right ? qx + 12 : qx - 12, qy - 9, { ...qo, align: right ? 'left' : 'right' });
  // the map's name and its caption
  const head = { family: SANS, weight: 600, size: L.wide ? 13 : 12, color: t.ink2 };
  sh.text(`${{ lv: 'Left ventricle', av: 'Aortic valve', mv: 'Mitral valve' }[map]} section`, M.x + 10, M.y + 18, head);
  const cap = { family: SANS, weight: 400, size: L.wide ? 11 : 10, color: t.ink3 };
  const lines = wrap(sh, 'Schematic: 2,000 simulated studies. EchoPrime searches 512 dimensions.', side - 20, cap, 2);
  lines.forEach((ln, i) => sh.text(ln, M.x + 10, M.y + side - 10 - (lines.length - 1 - i) * (cap.size + 3), cap));
  resultBox(sh, t, L.box, R, !L.wide);
}

/** What the k nearest studies give, the heart's own value, and the key to the map's colors. */
function resultBox(sh, t, b, R, narrow) {
  const ctx = sh.ctx, P = palette(t);
  const head = { family: SANS, weight: 600, size: narrow ? 12.5 : 14, color: t.ink };
  const lab = { family: SANS, weight: 400, size: narrow ? 11 : 12.5, color: t.ink2 };
  const val = { family: MONO, weight: 500, size: narrow ? 12 : 14, color: t.ink };
  const note = { family: SANS, weight: 400, size: narrow ? 10.5 : 11.5, color: t.ink3 };
  const lh = narrow ? 19 : 26, two = narrow && b.w >= 330, cw = two ? (b.w - 20) / 2 : b.w;
  let y = b.y;
  /**
   * Rows { k, v, bold, color, bar } in one column, or two on a phone: a label (after a dot of
   * the row's color, the key to the map), its value at the right, and a bar of bar (0 to 1).
   */
  const rows = (list) => {
    const per = two ? Math.ceil(list.length / 2) : list.length;
    const kw = Math.max(...list.map((r) => sh.measure(r.k, { ...lab, weight: 600 })));
    list.forEach((r, i) => {
      const x = b.x + (two && i >= per ? cw + 20 : 0), base = y + (two ? i % per : i) * lh + lab.size * 0.8 + 2;
      let tx = x;
      if (r.color) {
        ctx.save();
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(x + 5, base - lab.size * 0.32, r.small ? 3.6 : 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        tx += 16;
      }
      sh.text(r.k, tx, base, { ...lab, weight: r.bold ? 600 : 400, color: r.bold ? t.ink : t.ink2 });
      sh.text(r.v, x + cw, base, { ...val, align: 'right', weight: r.bold ? 600 : 500 });
      const bx = tx + kw + 12, bw = x + cw - 44 - bx;
      if (r.bar !== undefined && bw >= 40) {
        ctx.save();
        ctx.fillStyle = t.paper3;
        ctx.fillRect(bx, base - 7, bw, 6);
        ctx.fillStyle = r.color;
        ctx.fillRect(bx, base - 7, Math.round(bw * r.bar), 6);
        ctx.restore();
      }
    });
    y += per * lh;
  };
  const notes = (str) => {
    for (const s of wrap(sh, str, b.w, note, 3)) y = line(sh, s, b.x, y, note, 3);
  };
  const ep = R.k === K_PAPER ? `EchoPrime: k = ${K_PAPER}, as here.` : `EchoPrime: k = ${K_PAPER}.`;
  if (R.map === 'lv') {
    y = line(sh, fitText(sh, [`LVEF from the ${R.k} closest ${R.k === 1 ? 'study' : 'studies'}`, `LVEF, k = ${R.k}`], b.w, head), b.x, y, head, narrow ? 6 : 12);
    rows([
      { k: R.k === 1 ? 'Closest study' : `Mean of ${R.k}`, v: `${R.mean}%`, bold: true },
      { k: 'Nearest study', v: `${R.nearest}%` },
      { k: 'This heart', v: `${R.heart}%` },
      { k: R.k === 1 ? 'Range' : `Range of ${R.k}`, v: R.k === 1 ? `${R.lo}%` : `${R.lo}–${R.hi}%` },
    ]);
    y += narrow ? 2 : 6;
    notes(ep);
    // the key to the map: the LVEF scale
    y += narrow ? 6 : 12;
    const kx = b.x + sh.measure('LVEF', lab) + 10, kw = Math.min(narrow ? 160 : 200, b.x + b.w - kx - 16);
    sh.text('LVEF', b.x, y + 9, lab);
    for (let i = 0; i < kw; i++) { ctx.fillStyle = P.ef(10 + (70 * i) / (kw - 1)); ctx.fillRect(kx + i, y, 1.2, 10); }
    const so = { family: MONO, weight: 500, size: 10, color: t.ink3, align: 'center' };
    for (const v of [10, 45, 80]) sh.text(`${v}%`, clamp(kx + ((v - 10) / 70) * (kw - 1), kx + 8, kx + kw - 8), y + 23, so);
    return;
  }
  const G8 = GRADES[R.map];
  y = line(sh, fitText(sh, [`${G8.what[0].toUpperCase()}${G8.what.slice(1)} in the ${R.k} closest`, `${R.map === 'av' ? 'AS' : 'MR'}, k = ${R.k}`], b.w, head), b.x, y, head, narrow ? 6 : 12);
  // each grade: its color on the map, its name, and its count among the k
  rows(G8.names.map((nm, g) => ({ k: nm, v: String(R.counts[g]), bold: g === R.rep, color: P.grade[g], small: !g, bar: R.counts[g] / R.k })));
  y += narrow ? 4 : 10;
  rows([
    { k: 'Reported', v: R.rep >= 0 ? G8.names[R.rep] : 'no grade', bold: true },
    { k: 'This heart', v: G8.names[R.heart] },
  ]);
  y += narrow ? 2 : 6;
  notes(`A grade is reported when more than half of the k carry it. ${ep}`);
}

function draw(sh, t) {
  if (!st) return;
  if (st.aiTab === 'retrieval') drawRetrieval(sh, t);
  else drawStudy(sh, t);
}

// ---------------------------------------------------------------- the text
function studyText(s, cite) {
  const sec = secOf(s), videos = videosOf(s), groups = groupsOf(videos), cov = coverage(sec, groups);
  const top = ranked(sec), [a, b] = top, pct = pctOf(cov);
  const name = IN_TEXT[sec], f2 = (x) => x.toFixed(2);
  const share = pct === '<1' ? 'less than 1%' : `${pct}%`;
  let live;
  if (s.aiOnly) {
    live = `<b>With the A4C video alone, the ${name} section keeps ${share} of its weight.</b> In the paper, studies with one A4C video performed about as well as full studies across tasks${cite('vukadinovic2026')}.`;
  } else {
    const rest = b.w >= 0.8 ? `and ${GROUP_TEXT[GROUPS[b.g].key]} (${f2(b.w)})` : `with ${GROUP_TEXT[GROUPS[b.g].key]} next (${f2(b.w)})`;
    live = `<b>The ${name} section rests on ${GROUP_TEXT[GROUPS[a.g].key]} (${f2(a.w)}) ${rest}.</b> The videos present carry ${share} of its weight.`;
  }
  return {
    readouts: [
      { k: 'Section', v: SECTIONS[sec].name, text: true },
      { k: 'Attention present', v: pct, u: '%', flag: cov < 0.5 },
      { k: 'Top views', v: top.slice(0, 3).map(({ g, w }) => `${GROUPS[g].tag} ${f2(w)}`).join(' · '), text: true },
      { k: 'Videos', v: s.aiOnly ? 'A4C only' : `${videos.length} of ${N_ALL}`, text: true },
    ],
    live,
  };
}

function retrievalText(s) {
  const map = mapOf(s), k = kOf(s), R = retrieve(map, heartCase(), k);
  const sec = { lv: 'Left ventricle', av: 'Aortic valve', mv: 'Mitral valve' }[map];
  const studies = (n) => (n === 1 ? 'study' : 'studies');
  if (map === 'lv') {
    const live = k === 1
      ? `<b>With k = 1, the LVEF is that of the single closest study: ${R.nearest}%.</b> This heart's LVEF is ${R.heart}%.`
      : `<b>The mean of the ${k} closest studies gives an LVEF of ${R.mean}%.</b> The nearest study alone gives ${R.nearest}%${Math.abs(R.mean - R.heart) >= 3 ? `; this heart's LVEF is ${R.heart}%` : ''}.`;
    return {
      readouts: [
        { k: 'Section', v: sec, text: true },
        { k: 'Similar studies, k', v: String(k) },
        { k: k === 1 ? 'LVEF, closest study' : `LVEF, mean of ${k}`, v: String(R.mean), u: '%', flag: R.mean < 52 },
        { k: 'This heart', v: String(R.heart), u: '%', flag: R.heart < 52 },
      ],
      live,
    };
  }
  const G8 = GRADES[map], phrase = (g) => (g === 0 ? G8.none : `${G8.names[g]} ${G8.what}`);
  let live;
  if (R.rep >= 0) {
    const n = R.counts[R.rep];
    live = k === 1
      ? `<b>The single closest study has ${phrase(R.rep)}, so the section reports it.</b> This heart has ${phrase(R.heart)}.`
      : `<b>${n} of the ${k} closest studies have ${phrase(R.rep)}, more than half, so the section reports it.</b> This heart has ${phrase(R.heart)}.`;
  } else {
    const big = R.counts.indexOf(Math.max(...R.counts));
    live = `<b>No grade passes half of the ${k} closest studies, so the section reports no grade.</b> The largest group, ${R.counts[big]} ${studies(R.counts[big])}, has ${phrase(big)}; this heart has ${phrase(R.heart)}.`;
  }
  return {
    readouts: [
      { k: 'Section', v: sec, text: true },
      { k: 'Similar studies, k', v: String(k) },
      { k: 'Reported', v: R.rep >= 0 ? G8.names[R.rep] : 'no grade', text: true, flag: R.rep >= 2 },
      { k: 'This heart', v: G8.names[R.heart], text: true, flag: R.heart >= 2 },
    ],
    live,
  };
}

// ---------------------------------------------------------------- the tour
// Study: the LV section, the aortic valve, the IVC; the videos added one by one under the IVC
// section; the A4C video alone, then the full study again. Retrieval: the LV map with k = 1, 50
// and 200, then the aortic valve with k = 50.
const T_SEC = [[0, 0], [4, 7], [8, 12]], T_ADD = [12, 21], T_ONLY = [21, 24], T_FULL = 24;
const T_RET = [[26, 'lv', 1], [29.5, 'lv', 50], [33, 'lv', 200], [36.5, 'av', 50]];
const addAt = (tt) => clamp(1 + Math.floor(((tt - T_ADD[0]) / (T_ADD[1] - T_ADD[0])) * N_ALL), 1, N_ALL);

// ---------------------------------------------------------------- the chapter
export default {
  key: 'ai',
  part: 'ai',
  title: 'Study interpretation',
  nav: 'AI read',
  dwell: 40,
  defaults: { aiTab: 'study', aiSec: 0, aiN: 14, aiOnly: false, aiMap: 'lv', aiK: 50 },
  format: {
    aiSec: (x) => SECTIONS[Math.round(x)]?.name ?? '',
    aiN: (x) => `${Math.round(x)} of 14`,
    aiK: (x) => String(Math.round(x)),
  },
  watch: ['aiTab', 'aiSec', 'aiN', 'aiOnly', 'aiMap', 'aiK', 'pheno'],
  figure(fig) {
    const canvas = fig.querySelector('canvas');
    sheet = new Sheet(canvas, (sh, t) => draw(sh, t));
    // a click on a row of the heat map chooses its section
    const rowAt = (e) => {
      if (!hit || !st || st.aiTab === 'retrieval') return -1;
      const r = canvas.getBoundingClientRect(), z = sheet.z || 1;
      const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z;
      if (x < hit.x0 || x > hit.x1 || y < hit.y0) return -1;
      const i = Math.floor((y - hit.y0) / hit.rh);
      return i >= 0 && i < SECTIONS.length ? i : -1;
    };
    canvas.addEventListener('click', (e) => {
      const i = rowAt(e);
      if (i >= 0 && setState && i !== secOf(st)) setState({ aiSec: i });
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      canvas.style.cursor = rowAt(e) >= 0 ? 'pointer' : '';
    });
    canvas.addEventListener('pointerleave', () => { canvas.style.cursor = ''; });
    return sheet;
  },
  init({ state, set, subscribe }) {
    st = state;
    setState = set;
    // the controls of one part of the figure show only with it (data-ai-tab)
    const tabs = () => {
      for (const el of document.querySelectorAll('#ch-ai [data-ai-tab]')) el.hidden = el.dataset.aiTab !== (state.aiTab === 'retrieval' ? 'retrieval' : 'study');
    };
    tabs();
    subscribe?.((s, ch) => { if ('aiTab' in ch) tabs(); });
  },
  enter() { open = true; start(); pump(); },
  leave() { open = false; },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter); the
  // videos are cut only while the chapter is open
  warm() { start(); },
  // a video page and the tour wait for every frame of the heart shown
  ready() {
    if (!complete()) { open = true; pump(); return false; }
    return true;
  },
  onState(s, ch) {
    if ('pheno' in ch) { redraw(); pump(); }
  },
  anim(dt) {
    if (!reducedMotion) clock += dt;
    if (!complete() && open) pump();
    if (st && st.aiTab !== 'retrieval') {
      const f = frameNow();
      if (f !== shownFrame) { shownFrame = f; redraw(); }
    }
  },
  pulse() { return { rr: RR, phase: reducedMotion ? null : ((clock * 1000) % RR) / RR }; },
  tourEnter(set) { set({ aiTab: 'study', aiSec: 0, aiN: N_ALL, aiOnly: false, aiMap: 'lv', aiK: K_PAPER }); },
  tourTick(tt, set) {
    if (tt < T_ADD[0]) {
      const sec = T_SEC.filter(([t0]) => tt >= t0).pop()[1];
      set({ aiTab: 'study', aiSec: sec, aiN: N_ALL, aiOnly: false });
    } else if (tt < T_ADD[1]) set({ aiTab: 'study', aiSec: 12, aiN: addAt(tt), aiOnly: false });
    else if (tt < T_FULL) set({ aiTab: 'study', aiSec: 12, aiN: N_ALL, aiOnly: true });
    else if (tt < T_RET[0][0]) set({ aiTab: 'study', aiSec: 12, aiN: N_ALL, aiOnly: false });
    else {
      const [, map, k] = T_RET.filter(([t0]) => tt >= t0).pop();
      set({ aiTab: 'retrieval', aiMap: map, aiK: k });
    }
  },
  // the time of the sequence at which tourTick shows this state (its inverse); a state off the
  // sequence starts it from the beginning
  tourAt(s) {
    if (s.aiTab === 'retrieval') {
      const k = kOf(s), map = mapOf(s);
      const at = T_RET.find(([, m, kk]) => m === map && kk === k);
      return at ? at[0] + 0.01 : undefined;
    }
    if (s.aiOnly) return T_ONLY[0] + 0.01;
    const n = clamp(Math.round(s.aiN), 1, N_ALL);
    if (n < N_ALL) return secOf(s) === 12 ? T_ADD[0] + ((n - 1) / N_ALL) * (T_ADD[1] - T_ADD[0]) + 0.01 : undefined;
    const at = T_SEC.find(([, sec]) => sec === secOf(s));
    return at ? at[0] + 0.01 : undefined;
  },
  text(s, { cite }) {
    return s.aiTab === 'retrieval' ? retrievalText(s) : studyText(s, cite);
  },
};
// TEMP-DEBUG (remove before finishing)
export const __debug = { cache, TILES };
