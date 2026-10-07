// The figure of chapter 'ai' (ch/ai.js): EchoPrime and EchoNet-Measurements in seven steps.
// Row 1, EchoPrime, four panels: 1 sort (the 14 videos of ai.js, each with its view), 2 encode (one
// video encoder, 512 numbers a video), 3 weigh (the public section weights of echoprime.js, a row
// for each video, a column for each section) and 4 answer (about 150 task heads). Row 2,
// EchoNet-Measurements: 5 measure, nine B-mode clips and eight Doppler and M-mode images, with the
// calipers and peaks of ch/measure.js. Row 3: 6 anchor (each number head checks its measurement)
// and 7 report (EchoPrime's words, the measured numbers). A report section lights its column in 3,
// its heads in 4, its tiles in 5, its lines in 6 and its sentence in 7.
//
// The task heads and the anchor are in development and not published: here they are a teaching
// simulation. A head's value is the site's value for the heart shown (the SITE table and the
// Doppler values of ch/measure.js), and its range is that value ± BAND. The words of the report
// are the site's own report for the heart (ch/report.js). Neither model ran on these images.
//
// A box of 840 × 650 px or more shows the three rows. A smaller one shows one of two views (aiRow),
// with tabs at the top: EchoPrime (1 to 4), or the measurements with the anchor and the report (5
// to 7). Every text is 9.5 px or larger (9 px for a video's view on a phone).
import { MONO, SANS, clamp, rng } from './sketch.js';
import { SC, spectral } from './scope.js';
import { cycleAt, RR } from './cyclemodel.js';
import { SECTIONS, W as WEIGHT } from './echoprime.js';
import { buildReport } from './ch/report.js';
import { B, D, SITE, siteValue, dopplerOf, regionOf, DW, DH, DEEPER, OFF, blob, centerMark, loadViews, warmViews, reportedFrame } from './ch/measure.js';

const SERIF = '"Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
/** A head's range in the figure: its value ± 10%. A band chosen for the figure, not the model's error. */
export const BAND = 0.1;
/** The anchor's scale: the head's value ± 70%, so that the septum's second peak stays on it. */
const SPAN = 0.7;
const SEC = Object.fromEntries(SECTIONS.map((s, i) => [s.key, i]));
// the short names of the sections, in a caption and on a chip
export const SEC_SHORT = ['LV', 'Wall motion', 'RV', 'LA', 'RA', 'Atrial septum', 'Mitral valve', 'Aortic valve', 'Tricuspid valve', 'Pulmonic valve', 'Pericardium', 'Aorta', 'IVC', 'PA', 'Pulmonary veins'];

// ---------------------------------------------------------------- the 17 outputs
// The nine B-mode measurements and the eight Doppler and M-mode models of ch/measure.js (B, D),
// each with the view or mode of its image, its names and its section of the report.
const BINFO = {
  ivs: { short: 'IVS', name: 'Septum', rpt: 'IVSd', tag: 'PLAX', sec: 'lv' },
  lvid: { short: 'LVID', name: 'LV internal diameter', rpt: 'LVIDd', tag: 'PLAX', sec: 'lv' },
  lvpw: { short: 'LVPW', name: 'Posterior wall', rpt: 'LVPWd', tag: 'PLAX', sec: 'lv' },
  la: { short: 'LA', name: 'LA diameter', rpt: 'LA', tag: 'PLAX', sec: 'la' },
  rvb: { short: 'RV base', name: 'RV basal diameter', rpt: 'RV base', tag: 'A4C RV', sec: 'rv' },
  root: { short: 'Ao root', name: 'Aortic root', rpt: 'Ao root', tag: 'PLAX', sec: 'aorta' },
  asc: { short: 'Asc Ao', name: 'Ascending aorta', rpt: 'Asc Ao', tag: 'PLAX Ao', sec: 'aorta' },
  pa: { short: 'PA', name: 'Pulmonary artery', rpt: 'PA', tag: 'PSAX PA', sec: 'pa' },
  ivc: { short: 'IVC', name: 'IVC', rpt: 'IVC', tag: 'SC IVC', sec: 'ivc' },
};
const DINFO = {
  tr: { short: 'TR', name: 'TR peak velocity', rpt: 'TR', tag: 'CW', sec: 'tv' },
  av: { short: 'AV', name: 'AV peak velocity', rpt: 'AV', tag: 'CW', sec: 'av' },
  mr: { short: 'MR', name: 'MR peak velocity', rpt: 'MR', tag: 'CW', sec: 'mv' },
  lvot: { short: 'LVOT', name: 'LVOT peak velocity', rpt: 'LVOT', tag: 'PW', sec: 'av' },
  sep: { short: 'e′ septal', name: 'Septal e′', rpt: 'e′ septal', tag: 'TDI', sec: 'lv' },
  lat: { short: 'e′ lateral', name: 'Lateral e′', rpt: 'e′ lateral', tag: 'TDI', sec: 'lv' },
  ea: { short: 'E, E/A', name: 'Mitral E, E/A', rpt: 'E', tag: 'PW', sec: 'lv' },
  tapse: { short: 'TAPSE', name: 'TAPSE', rpt: 'TAPSE', tag: 'M-mode', sec: 'rv' },
};
/** The 17 outputs: B-mode first, in the order of ch/measure.js. */
export const OUT = [
  ...B.map((m) => ({ kind: 'b', key: m.key, m, ...BINFO[m.key], sec: SEC[BINFO[m.key].sec] })),
  ...D.map((d) => ({ kind: 'd', key: d.key, d, ...DINFO[d.key], sec: SEC[DINFO[d.key].sec] })),
];
const BY = Object.fromEntries(OUT.map((o) => [o.key, o]));
/** The outputs of each section, in the order of the report: the anchor's lines (six at most). */
const LINES = { lv: ['ivs', 'lvid', 'lvpw', 'ea', 'sep', 'lat'], rv: ['rvb', 'tapse'], la: ['la'], mv: ['mr'], av: ['av', 'lvot'], tv: ['tr'], aorta: ['root', 'asc'], ivc: ['ivc'], pa: ['pa'] };
export const linesOf = (sec) => (LINES[SECTIONS[sec].key] || []).map((k) => BY[k]);
/**
 * The number heads of each section: every output of EchoNet-Measurements (17 models, 18
 * measurements: mitral E and E/A come from one model), and the LVEF.
 */
const NUM_HEADS = { lv: ['LVEF', 'IVSd', 'LVIDd', 'LVPWd', 'E', 'E/A', 'e′ septal', 'e′ lateral'], rv: ['RV base', 'TAPSE'], la: ['LA'], mv: ['MR'], av: ['AV', 'LVOT'], tv: ['TR'], aorta: ['Ao root', 'Asc Ao'], ivc: ['IVC'], pa: ['PA'] };
export const numHeads = (sec) => NUM_HEADS[SECTIONS[sec].key] || [];
/** The grid of heads: a column for each section, ten heads in each, 150 in all. */
export const HEADS_PER = 10;

// ---------------------------------------------------------------- the values and the anchor
/**
 * The anchor rule: the caliper stays when its value lies in the head's range. Else its end moves
 * to the heat map's peak that agrees with the head. With no such peak, the value is flagged for
 * review. peaks: the caliper's value with its end on each peak of the map.
 */
export function anchor(head, cal, peaks = []) {
  const lo = head * (1 - BAND), hi = head * (1 + BAND), inR = (v) => v >= lo - 1e-9 && v <= hi + 1e-9;
  if (inR(cal)) return { state: 'kept', value: cal, cal, head, lo, hi };
  const ok = peaks.filter(inR).sort((a, b) => Math.abs(a - head) - Math.abs(b - head));
  if (ok.length) return { state: 'moved', value: ok[0], cal, head, lo, hi };
  return { state: 'flagged', value: cal, cal, head, lo, hi };
}

const VALUES = new Map();
/**
 * Every output on heart key, with the septum's second peak when two: its head (the site's value),
 * the caliper, the anchor's result, the unit and the decimals that the site prints. The B-mode
 * values are the SITE table of ch/measure.js, which its calipers measure on the mesh; the
 * two-peaked septum is siteValue's (its end OFF / 2 along the caliper). The others are the
 * Doppler values of ch/measure.js.
 */
export function valuesOf(heart, two) {
  const key = `${heart}|${two ? 1 : 0}`;
  if (VALUES.has(key)) return VALUES.get(key);
  const site = SITE[heart] ? heart : 'normal', out = {};
  for (const o of OUT) {
    if (o.kind === 'b') {
      const V = siteValue(o.m, site), isTwo = !!two && o.key === 'ivs';
      // the caliper with the end on each peak: the wall's own, and the second, OFF farther out
      const far = V.cm + (o.m.two.out ? OFF : -OFF);
      out[o.key] = { ...anchor(V.cm, isTwo ? V.cm2 : V.cm, isTwo ? [V.cm, far] : [V.cm]), two: isTwo, unit: 'cm', dec: 1 };
    } else {
      const R = dopplerOf(o.d, site), unit = R.unit || (R.mode === 'mm' ? 'mm' : 'm/s');
      out[o.key] = { ...anchor(R.value, R.value, [R.value]), unit, dec: R.dec, A: R.A, own: R.own !== false };
    }
  }
  const R = buildReport(site, 'M');
  const v = { heart: site, two: !!two, out, ef: R.ef, R };
  VALUES.set(key, v);
  return v;
}
const fx = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** An output's printed value: the anchored one, with its unit; E with E/A. */
export function valueText(o, r, form = 0) {
  if (o.key === 'ea') {
    const ea = fx(r.value / r.A, 2);
    return [`${fx(r.value, 2)} m/s, ${ea}`, `${fx(r.value, 2)}, ${ea}`][form] ?? `${fx(r.value, 2)}, ${ea}`;
  }
  return `${fx(r.value, r.dec)} ${r.unit}`;
}
/** The caliper's own value, before the anchor, as the site prints it (no unit). */
export const calText = (r) => fx(r.cal, r.dec);

// ---------------------------------------------------------------- the report
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
/** A sentence without the parentheses that hold a number, the report's own measurements. */
const strip = (s) => s.replace(/\s*\([^()]*\d[^()]*\)/g, '').replace(/\s+([,;.])/g, '$1').trim();
const REPORTS = new Map();
/**
 * The report for heart V.heart: a sentence group for each of the 15 sections, in EchoPrime's
 * order. Each is a list of parts [text, kind, output]: 'w' words (EchoPrime's, from the site's
 * report for the heart), 'n' a measured number (anchored), 'h' a number of EchoPrime's own (the
 * LVEF), 'f' a value flagged for review. No number of the site's report enters: each number is
 * a measurement of the figure, or the LVEF.
 */
export function reportOf(V) {
  const id = `${V.heart}|${V.two ? 1 : 0}`;
  if (REPORTS.has(id)) return REPORTS.get(id);
  const X = V.R.texts, c = V.R.c, out = V.out;
  const num = (k, form = 0) => { const r = out[k]; return [valueText(BY[k], r, form), r.state === 'flagged' ? 'f' : 'n', k]; };
  const w = (s) => [s, 'w'];
  const head = (s) => (s.match(/^([^(]+?)\s*\(/) || [])[1] || '';
  const S = {};
  const size = head(X.lv), wall = (X.lv.match(/Wall thickness is (\w+)/) || [])[1] || 'normal';
  const lvWords = /^normal size$/i.test(size) && wall === 'normal' ? 'normal size and wall thickness' : `${lc(size)}, ${wall} wall thickness`;
  const dia = X.lv.match(/(Normal diastolic function|Grade \d diastolic dysfunction)(?:; ([^.]+))?\./);
  S.lv = [w(`Left ventricle: ${lvWords}; LVEF `), [`${V.ef}%`, 'h'], w('. IVSd '), num('ivs'), w(', LVIDd '), num('lvid'), w(', LVPWd '), num('lvpw'), w('. '),
    w(`${dia ? `${dia[1]}${dia[2] ? `, ${dia[2]}` : ''}` : 'Diastolic function'}: E `), [`${fx(out.ea.value, 2)} m/s`, 'n', 'ea'], w(', E/A '), [fx(out.ea.value / out.ea.A, 2), 'n', 'ea'],
    w(', septal e′ '), num('sep'), w(', lateral e′ '), num('lat'), w('.')];
  S.wm = [w(X.wm)];
  S.rv = [w(`Right ventricle: ${lc(head(X.rv) || 'normal size')}, basal diameter `), num('rvb'), w('; TAPSE '), num('tapse'), w('.')];
  // the report grades the LA by its volume index; the figure prints its diameter
  const la = lc(head(X.la) || 'normal size');
  S.la = [w(`Left atrium: ${la}${/^normal/.test(la) ? '' : ' by volume'}; diameter `), num('la'), w('.')];
  S.ra = [w(`Right atrium: ${lc(X.ra)}`)];
  S.ias = [w(X.ias)];
  S.mv = out.mr.own && c.mv.severe ? [w(`${strip(c.mv.severe).replace(/\.$/, '')}; peak velocity `), num('mr'), w('.')] : [w(X.mv)];
  S.av = [w(`${c.av.severe ? strip(c.av.severe) : X.av} Peak velocity `), num('av'), w('; LVOT '), num('lvot'), w('.')];
  S.tv = [w(`${X.tv.split(/(?<=\.)\s+/).filter((s) => !/\d/.test(s)).join(' ')} Peak TR velocity `), num('tr'), w('.')];
  S.pv = [w(X.pv)];
  S.peri = [w(strip(X.peri))];
  S.aorta = /\d/.test(X.aorta) ? [w('Aortic root '), num('root'), w(', ascending aorta '), num('asc'), w('.')]
    : [w(`${X.aorta.replace(/\.$/, '')}: root `), num('root'), w(', ascending aorta '), num('asc'), w('.')];
  const col = (X.ivc.match(/(more|less) than 50% collapse on sniff/) || [])[0];
  S.ivc = [w('IVC '), num('ivc'), w(col ? `, with ${col}.` : '.')];
  S.pa = [w(`${X.pa.replace(/\.$/, '')} (`), num('pa'), w(').')];
  S.pveins = [w(strip(X.pveins))];
  const list = SECTIONS.map((s, i) => ({ sec: i, parts: S[s.key] }));
  REPORTS.set(id, list);
  return list;
}

// ---------------------------------------------------------------- colors and type
let PAL = { key: '' };
const rgbOf = (c) => {
  const s = String(c || '').trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? [...s.slice(1)].map((x) => x + x).join('') : s.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : [128, 128, 128];
};
const mix = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u));
const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
/**
 * The figure's colors from the sheet's tokens, in both themes: the cards on paper-2; the weights
 * from paper-3 (0) to the accent (1); the heat maps' pink, on the paper and on the scanner.
 */
function palette(t) {
  const key = `${t.paper}|${t.paper2}|${t.paper3}|${t.accent}|${t.dark}`;
  if (PAL.key === key) return PAL;
  const p3 = rgbOf(t.paper3), ac = rgbOf(t.accent);
  PAL = {
    key,
    card: t.paper2,
    weight: (w) => css(mix(p3, ac, clamp(w, 0, 1))),
    pink: t.dark ? '#ff6fb5' : '#d2398c',
    band: css(ac, t.dark ? 0.3 : 0.2),
    lit: css(rgbOf(t.accent2), t.dark ? 0.75 : 0.55),
  };
  return PAL;
}

/** Text of size px, family f, weight wt. */
const F = (size, family = SANS, weight = 400) => ({ size, family, weight });
/** Upper-case text with letter spacing: its width. */
function capsWidth(sh, str, o, track) {
  const s = str.toUpperCase();
  let w = 0;
  for (const ch of s) w += sh.measure(ch, o);
  return w + track * Math.max(0, s.length - 1);
}
/** Upper-case text with letter spacing, drawn a letter at a time (canvas letter spacing is not everywhere). */
function caps(sh, str, x, y, o, track) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    sh.text(ch, cx, y, o);
    cx += sh.measure(ch, o) + track;
  }
}
/** str in lines of at most w px at font o. */
function wrap(sh, str, w, o) {
  const lines = [];
  let cur = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || sh.measure(next, o) <= w) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** The first form that fits w px at font o, or null. */
const fits = (sh, forms, w, o) => [].concat(forms).find((f) => sh.measure(f, o) <= w) ?? null;

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function diamond(ctx, x, y, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.85, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function dot(ctx, x, y, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}
function ring(ctx, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
function arrowHead(ctx, x, y, dx, dy, s = 5) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - s * ux + s * 0.55 * uy, y - s * uy - s * 0.55 * ux);
  ctx.lineTo(x - s * ux - s * 0.55 * uy, y - s * uy + s * 0.55 * ux);
  ctx.closePath();
  ctx.fill();
}
/** A flag after a value that the anchor could not confirm. */
function flagMark(ctx, x, y, h, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y - h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.7, y - h * 0.78); ctx.lineTo(x, y - h * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the B-mode images
// Each B-mode tile is its view cut from the heart mesh at the frame that its clip reports, with the
// view a little shallower, as ch/measure.js draws it; the calipers are measure.js's own on that
// frame. The views that measure load and cut their beats first (loadViews, warmViews), a few ms
// at a time; then each measurement's trace, then each tile, one a call. The tiles are cut by the
// offscreen view that cuts the videos (ch/ai.js), once those are in.
const CUT_H = 220;          // CSS px: the height of a cut, so that a tile's crop stays sharp
const CUT_W = 360;
const MS = {
  state: 'idle',            // idle, loading, ready, failed
  heart: '',                // the heart (pheno key) that the tiles below hold; a round trip through
                            // another heart keeps them, as the videos of ch/ai.js
  frames: {},               // key -> reportedFrame (ch/measure.js)
  tiles: {},                // key -> { canvas, map, w, h }
};
let wantHeart = () => 'normal';
let onChange = () => {};
let viewOf = () => null;
/** The heart the page shows, a call when a tile arrives (the chapter redraws), and the view that cuts. */
export function bind(want, change, view) { wantHeart = want; onChange = change; viewOf = view; }
function msStart() {
  if (MS.state !== 'idle') return;
  MS.state = 'loading';
  loadViews().then(() => {
    MS.state = 'ready';
    onChange();
  }).catch((err) => {
    console.error('ai: the measurement views failed', err);
    MS.state = 'failed';
    onChange();
  });
}
/** The heart model's key, when it is the heart wanted; else ''. */
function heartNow() {
  const ev = viewOf(), m = ev && ev.model;
  if (!m || m.pheno.key !== wantHeart()) return '';
  return m.pheno.key;
}
/** Every tile of the heart shown is in (or the model failed: nothing will come). */
export function measureDone() {
  if (MS.state === 'failed') return true;
  const h = heartNow();
  return !!h && MS.heart === h && B.every((m) => MS.tiles[m.key]);
}
/** Work on the tiles for up to ms, one trace or one tile a call: true while work remains. */
export function measureStep(ms = 12) {
  if (MS.state === 'idle') msStart();
  if (MS.state !== 'ready') return MS.state === 'loading';
  const h = heartNow();
  if (!h) return true;                          // the model builds the heart: wait for it
  if (MS.heart !== h) { MS.heart = h; MS.frames = {}; MS.tiles = {}; onChange(); }
  if (B.every((x) => MS.tiles[x.key])) return false;
  if (warmViews(ms)) return true;
  const m = B.find((x) => !MS.frames[x.key]);
  if (m) {
    const f = reportedFrame(m);
    if (f && f.heart === h) MS.frames[m.key] = f;
    return true;
  }
  const k = B.find((x) => !MS.tiles[x.key]);
  if (!k) return false;
  try { MS.tiles[k.key] = cutTile(viewOf(), k, MS.frames[k.key]); } catch (err) { console.error('ai: a tile failed', err); MS.tiles[k.key] = { failed: true }; }
  onChange();
  return B.some((x) => !MS.tiles[x.key]);
}
/** Cut measurement m's view at its reported frame into a canvas of its own; the view's depth as it was. */
function cutTile(ev, m, f) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), depth = ev.depth;
  if (ev.w !== CUT_W || ev.h !== CUT_H || ev.dpr !== dpr) ev.setSize(CUT_W, CUT_H);
  if (ev.view !== m.view) ev.setView(m.view, { animate: false });
  try {
    ev.depth = undefined;
    ev.depth = ev.specOf(m.view).depth + (DEEPER[m.view] || 0);
    const c = cycleAt(f.tms);
    ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  } finally { ev.depth = depth; }
  const cv = document.createElement('canvas');
  cv.width = ev.canvas.width;
  cv.height = ev.canvas.height;
  const g = cv.getContext('2d');
  g.drawImage(ev.canvas, 0, 0);
  // the sector's outline in the scanner's frame color, not the theme's ink (echo.js draw)
  if (ev.fanPath) {
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = SC.bg;
    g.lineWidth = 2;
    g.stroke(ev.fanPath);
    g.restore();
  }
  const mp = ev.map;
  return { canvas: cv, map: { cx: mp.cx, top: mp.top, k: mp.scale }, w: CUT_W, h: CUT_H };
}

// ---------------------------------------------------------------- layout
const PAD = 6, GAP = 12;
const HEAD = 42;            // a card's header: its number, title and subtitle
const HEAD_C = 28;          // a compact card's header (a phone, a short box): its number and title in one line
const IN = 10;              // a card's inner margin
const BANDS = 0.46;         // the bands' share of the height in the second view, as in the three rows
/**
 * The layout of the figure in a box W × H: all three rows, or one of two views. View 0 is
 * EchoPrime. View 1 is the measurements, the anchor and the report (viewFive): sh measures its
 * text.
 */
export function layoutOf(W, H, row, sh) {
  const all = W >= 840 && H >= 650;
  if (all) {
    const cw = (W - 2 * PAD - 3 * GAP) / 4, bw = (W - 2 * PAD - GAP) / 2;
    const link = 30, h1 = clamp(Math.round((H - 2 * PAD - link - GAP) * 0.345), 210, 300);
    const rest = H - 2 * PAD - h1 - link - GAP, h2 = Math.round(rest * 0.46), h3 = rest - h2;
    const y2 = PAD + h1 + link, y3 = y2 + h2 + GAP;
    const P = {
      1: { x: PAD, y: PAD, w: cw, h: h1 }, 2: { x: PAD + cw + GAP, y: PAD, w: cw, h: h1 },
      3: { x: PAD + 2 * (cw + GAP), y: PAD, w: cw, h: h1 }, 4: { x: PAD + 3 * (cw + GAP), y: PAD, w: cw, h: h1 },
      5: { x: PAD, y: y2, w: bw, h: h2 }, 5.5: { x: PAD + bw + GAP, y: y2, w: bw, h: h2 },
      6: { x: PAD, y: y3, w: bw, h: h3 }, 7: { x: PAD + bw + GAP, y: y3, w: bw, h: h3 },
    };
    return { all: true, W, H, P, rows: [0, 1, 2], link: { y0: PAD + h1, y1: y2 } };
  }
  // one view: tabs across the top, the view's panels under them
  const tabs = { x: PAD, y: PAD, w: W - 2 * PAD, h: 26 };
  const box = { x: PAD, y: tabs.y + tabs.h + 6, w: W - 2 * PAD, h: H - tabs.h - 6 - 2 * PAD };
  const r = clamp(Math.round(row ?? 0), 0, 1), P = {};
  const g = W < 520 ? 8 : GAP;
  let foot = null;
  if (r === 1) return { all: false, W, H, rows: [r], tabs, row: r, foot, ...viewFive(sh, box, g) };
  // the links to the other view, under this one: one line, or two on a narrow figure
  const fh = W < 700 ? 34 : 18;
  foot = { x: box.x, y: box.y + box.h - fh, w: box.w, h: fh };
  box.h -= fh + 4;
  if (box.w / box.h > 1.6) {
    const w = (box.w - 3 * g) / 4;
    [1, 2, 3, 4].forEach((k, i) => { P[k] = { x: box.x + i * (w + g), y: box.y, w, h: box.h }; });
  } else {
    const w = (box.w - g) / 2, h = (box.h - g) / 2;
    [1, 2, 3, 4].forEach((k, i) => { P[k] = { x: box.x + (i % 2) * (w + g), y: box.y + Math.floor(i / 2) * (h + g), w, h }; });
  }
  return { all: false, W, H, P, rows: [r], tabs, row: r, foot };
}
/**
 * The cards of view 1 in box, in one of two forms. In a box 600 px wide or more, the bands can sit
 * side by side, the anchor under the B-mode band and the report under the Doppler band. Or one
 * card holds both bands across the box, with the anchor and the report side by side under it.
 * The first try keeps the bands' share of the three rows; on a phone, the anchor and the report
 * take a third of the height. It stands where each band's images are 32 px high, or as high as
 * their width allows. Else the anchor and the report get the height of the anchor's six lines,
 * and the form with the largest tiles wins. Standard headers win a tie. A shorter tile label
 * (LABS) comes only where the full one does not fit. The normal heart's values set the layout,
 * so it does not change with the heart.
 */
function viewFive(sh, box, g) {
  const half = (box.w - g) / 2, V = valuesOf('normal', true);
  const make = (merged, compact, h3, level) => {
    const P = {}, h2 = box.h - h3 - g, y3 = box.y + h2 + g;
    if (merged) P[5] = { x: box.x, y: box.y, w: box.w, h: h2 };
    else {
      P[5] = { x: box.x, y: box.y, w: half, h: h2 };
      P[5.5] = { x: box.x + half + g, y: box.y, w: half, h: h2 };
    }
    P[6] = { x: box.x, y: y3, w: half, h: h3 };
    P[7] = { x: box.x + half + g, y: y3, w: half, h: h3 };
    // each band's grid: its image height, up to the image's own shape
    const B = bandBoxes(P, merged, compact), q = [];
    let ok = h2 > 0;
    for (const kind of ['b', 'd']) {
      const G = tileGrid(sh, B[kind], OUT.filter((o) => o.kind === kind), V, ASPECT[kind], COLS[kind], level, true);
      ok = ok && G.ok;
      q.push({ ih: G.ih, full: G.w / ASPECT[kind] });
    }
    const good = ok && q.every((x) => x.ih >= Math.min(32, x.full) - 0.5);
    return { P, merged, compact, level, ok, good, q: Math.min(...q.map((x) => Math.min(x.ih, x.full))) };
  };
  const need = { std: anchorNeed(sh, half, false), compact: anchorNeed(sh, half, true) };
  const wide = box.w >= 600;
  const first = wide ? make(false, false, box.h - Math.round(box.h * BANDS) - g, 0)
    : make(true, true, Math.max(need.compact, Math.min(Math.round(box.h * 0.34), 220)), 0);
  if (first.good && first.P[6].h >= (wide ? need.std : need.compact)) return first;
  const forms = wide ? [[false, false], [false, true], [true, false], [true, true]] : [[true, true]];
  for (const level of [0, 1, 2]) {
    let best = null;
    for (const [merged, compact] of forms) {
      const c = make(merged, compact, compact ? need.compact : need.std, level);
      if (c.ok && (!best || c.q > best.q + 2)) best = c;
    }
    if (best) return best;
  }
  // no form holds images of IH_MIN px: the last one, at the shortest label, each card clipped
  const [merged, compact] = forms[forms.length - 1];
  return { ...make(merged, compact, Math.min(need.compact, box.h - g), 2), clip: true };
}
/** The view of each step: 1 to 4 EchoPrime, 5 to 7 the measurements, the anchor and the report. */
export const rowOfStep = (k) => (k >= 5 ? 1 : 0);

// ---------------------------------------------------------------- the panels
const TITLES = {
  1: ['Sort', ['EchoPrime · view classifier', 'View classifier']],
  2: ['Encode', ['EchoPrime · one video encoder', 'One video encoder', 'Video encoder']],
  3: ['Weigh', ['EchoPrime · section weights', 'Section weights']],
  4: ['Answer', ['EchoPrime · about 150 heads', 'About 150 heads']],
  5: ['Measure · B-mode', ['EchoNet-Measurements · nine, one clip each', 'Nine, one clip each']],
  5.5: ['Doppler and M-mode', ['Eight, one image each']],
  6: ['Anchor', ['EchoPrime heads check each value', 'Heads check each value']],
  7: ['Report', ['Both models, one report']],
};
/** The title of the one card of both bands. */
const TITLE_BOTH = ['Measure', ['EchoNet-Measurements · 18 measurements', '18 measurements']];
/**
 * A card: its fill, its frame when lit, its number, title and subtitle. Returns the box under the
 * header. A compact card (a phone, a short box) has its number and title in one line. Its
 * subtitle sits at their right where it fits. both: the one card of both bands.
 */
function card(sh, t, P, k, lit, compact = false, both = false) {
  const ctx = sh.ctx, C = palette(t);
  ctx.save();
  rrect(ctx, P.x, P.y, P.w, P.h, 9);
  ctx.fillStyle = C.card;
  ctx.fill();
  if (lit) {
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    rrect(ctx, P.x + 1, P.y + 1, P.w - 2, P.h - 2, 8);
    ctx.stroke();
  }
  ctx.restore();
  const [title, subs] = both ? TITLE_BOTH : TITLES[k], narrow = P.w < 230;
  const n = k === 5.5 ? '' : String(Math.floor(k));
  if (compact) return cardCompact(sh, t, P, n, title, subs);
  const numO = { family: SERIF, weight: 400, size: narrow ? 24 : 28, color: t.accent };
  const x0 = P.x + IN + 1, tx = n ? x0 + (narrow ? 22 : 26) : x0;
  if (n) {
    const ctx2 = sh.ctx;
    ctx2.save();
    ctx2.font = `italic 400 ${numO.size}px ${SERIF}`;
    ctx2.fillStyle = t.accent;
    ctx2.fillText(n, x0 - 1, P.y + 32);
    ctx2.restore();
  }
  const tO = { family: SERIF, weight: 400, size: narrow ? 17 : 18.5, color: t.ink };
  const tf = sh.fit(title, P.x + P.w - 10 - tx, tO, 0.8);
  sh.text(tf.str, tx, P.y + 22, { ...tO, size: tf.size });
  const sO = { family: SANS, weight: 500, size: 9.5, color: t.ink3 }, room = P.x + P.w - 10 - tx;
  let done = false;
  for (const tr of [1.1, 0.5, 0]) {
    const f = [].concat(subs).find((s) => capsWidth(sh, s, sO, tr) <= room);
    if (f) { caps(sh, f, tx, P.y + 37, sO, tr); done = true; break; }
  }
  if (!done) { const s = [].concat(subs).pop(); caps(sh, s, tx, P.y + 37, sO, 0); }
  return { x: P.x + IN, y: P.y + HEAD + 4, w: P.w - 2 * IN, h: P.h - HEAD - 4 - 8 };
}
/**
 * A compact card's header: the number and the title in one line, the subtitle at the right where
 * it fits. The box it returns has head: the room at the right of the title that the subtitle
 * leaves free (its left, its baseline, its width).
 */
function cardCompact(sh, t, P, n, title, subs) {
  const ctx = sh.ctx, x0 = P.x + IN + 1, tx = n ? x0 + 19 : x0, right = P.x + P.w - IN;
  if (n) {
    ctx.save();
    ctx.font = `italic 400 22px ${SERIF}`;
    ctx.fillStyle = t.accent;
    ctx.fillText(n, x0 - 1, P.y + 23);
    ctx.restore();
  }
  const H = compactPlan(sh, P.w, n, title, subs);
  sh.text(H.tf.str, tx, P.y + 21, { family: SERIF, weight: 400, size: H.tf.size, color: t.ink });
  if (H.sub) caps(sh, H.sub, right - H.subW, P.y + 20, { ...SUB_O, color: t.ink3 }, H.tr);
  return { x: P.x + IN, y: P.y + HEAD_C + 2, w: P.w - 2 * IN, h: P.h - HEAD_C - 2 - 7, head: { x: right - H.free, y: P.y + 20, w: H.free } };
}
const SUB_O = { family: SANS, weight: 500, size: 9.5 };
/**
 * A compact header in a card w px wide: the title and its size, and the subtitle and its letter
 * spacing where it fits at the right. free: the room that the subtitle leaves.
 */
function compactPlan(sh, w, n, title, subs) {
  const avail = w - 2 * IN - 1 - (n ? 19 : 0), tO = { family: SERIF, weight: 400, size: 16 };
  const tf = sh.fit(title, avail, tO, 0.8), room = avail - sh.measure(tf.str, { ...tO, size: tf.size }) - 14;
  for (const tr of [1.1, 0.5]) {
    const f = [].concat(subs).find((x) => capsWidth(sh, x, SUB_O, tr) <= room);
    if (f) return { tf, sub: f, tr, subW: capsWidth(sh, f, SUB_O, tr), free: 0 };
  }
  return { tf, sub: null, free: room };
}
/** The caption at the foot of a card: its top. */
function caption(sh, t, b, str, o = {}) {
  const f = F(11, SANS, 400);
  const s = fits(sh, [].concat(str), b.w, f) ?? [].concat(str).pop();
  sh.text(s, b.x, b.y + b.h - 2, { ...f, color: o.color || t.ink2 });
  return b.y + b.h - 14;
}

// 1 · Sort: the 14 videos, each tagged with its view
const VIEW_TAG = ['PLAX', 'PLAX Dop', 'PSAX AV', 'PSAX Dop', 'PSAX MV', 'PSAX PM', 'A4C', 'A4C Dop', 'A5C', 'A2C', 'A3C', 'SC 4C', 'SC IVC', 'SSN'];
const N_VID = VIEW_TAG.length;
function sortPanel(sh, t, b, F1) {
  const ctx = sh.ctx, bottom = caption(sh, t, b, ['each video gets its view', 'its view']);
  const box = { x: b.x, y: b.y, w: b.w, h: bottom - b.y - 4 };
  // the arrangement whose tiles are largest, with the longest tag in one line at 9.5 px (9 on a
  // phone); where none has room, the largest tiles, with a tag in two lines at its space
  const fs = b.w < 200 ? 9 : 9.5, tagO = { family: MONO, weight: 500, size: fs };
  const need = Math.max(...VIEW_TAG.map((s) => sh.measure(s, tagO))) + 5;
  const grids = [3, 4, 5, 7].map((c) => {
    const r = Math.ceil(N_VID / c), g = 2;
    const w = (box.w - (c - 1) * g) / c, h = Math.min(w / 1.12, (box.h - (r - 1) * g) / r);
    return { c, r, g, tw: Math.min(w, h * 1.5), h };
  });
  const area = (G) => G.tw * G.h;
  const best = grids.filter((G) => G.tw >= need).sort((p, q) => area(q) - area(p))[0] || grids.sort((p, q) => area(q) - area(p))[0];
  const gw = best.c * best.tw + (best.c - 1) * best.g, x0 = box.x + Math.max(0, (box.w - gw) / 2);
  for (let i = 0; i < N_VID; i++) {
    const x = x0 + (i % best.c) * (best.tw + best.g), y = box.y + Math.floor(i / best.c) * (best.h + best.g);
    F1.video(ctx, i, x, y, best.tw, best.h);
    // the tag, as the scanner prints its text: one line, or two at its space
    const tag = VIEW_TAG[i], lines = sh.measure(tag, tagO) + 5 <= best.tw || !tag.includes(' ') ? [tag] : tag.split(' ');
    const tw = Math.min(best.tw - 2, Math.max(...lines.map((l) => sh.measure(l, tagO))) + 5);
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,12,0.72)';
    ctx.fillRect(x + 1, y + 1, tw, lines.length * (fs + 1.5) + 2.5);
    ctx.restore();
    lines.forEach((l, k) => sh.text(l, x + 3.5, y + fs + 1.5 + k * (fs + 1.5), { ...tagO, color: SC.text }));
  }
}

// 2 · Encode: the encoder, and each video as a row of numbers
function encodePanel(sh, t, b, heart, rowsY) {
  const ctx = sh.ctx, C = palette(t);
  const bottom = caption(sh, t, b, ['every video → 512 numbers', '512 numbers a video']);
  const top = b.y, h = bottom - top - 4, bw = Math.min(26, b.w * 0.14);
  ctx.save();
  rrect(ctx, b.x, top, bw, h, 6);
  ctx.fillStyle = t.accent2;
  ctx.fill();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.translate(b.x + bw / 2 + 4, top + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `500 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = t.accent;
  ctx.fillText('mViT', 0, 0);
  ctx.restore();
  const x0 = b.x + bw + 12, w = b.x + b.w - x0, n = 16, cw = w / n, rh = h / N_VID;
  const ac = rgbOf(t.accent), seed = [...heart].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  for (let i = 0; i < N_VID; i++) {
    const r = rng(4000 + i * 31 + seed);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = css(ac, 0.12 + 0.88 * r());
      ctx.fillRect(x0 + k * cw, top + i * rh + 1, Math.max(1, cw - 1.5), Math.max(1, rh - 2.5));
    }
  }
  rowsY.top = top;
  rowsY.h = h;
}

// 3 · Weigh: the public weights, a row for each video, a column for each section
const VG = [7, 5, 8, 6, 8, 8, 2, 4, 3, 0, 1, 10, 10, 9];   // each video's view group (echoprime.js GROUPS)
function weighPanel(sh, t, b, sec, hits) {
  const ctx = sh.ctx, C = palette(t);
  const bottom = caption(sh, t, b, [`${SEC_SHORT[sec]} column lit · public weights`, `${SEC_SHORT[sec]} column lit`, 'public weights']);
  const h = bottom - b.y - 4, cw = b.w / SECTIONS.length, rh = h / N_VID;
  for (let s = 0; s < SECTIONS.length; s++) {
    for (let i = 0; i < N_VID; i++) {
      ctx.fillStyle = C.weight(WEIGHT[s][VG[i]]);
      ctx.fillRect(b.x + s * cw + 0.6, b.y + i * rh + 0.6, cw - 1.6, rh - 1.6);
    }
    hits.push({ x0: b.x + s * cw, y0: b.y, x1: b.x + (s + 1) * cw, y1: b.y + h, sec: s });
  }
  ctx.save();
  ctx.strokeStyle = C.pink;
  ctx.lineWidth = 2;
  rrect(ctx, b.x + sec * cw - 1.5, b.y - 2.5, cw + 1.4, h + 4, 3);
  ctx.stroke();
  ctx.restore();
}

// 4 · Answer: a column of ten heads for each section; the number heads marked
function answerPanel(sh, t, b, sec, V, hits) {
  const ctx = sh.ctx, C = palette(t);
  const bottom = caption(sh, t, b, ['one head per report task', 'one per task']);
  const chipH = 36, gh = bottom - b.y - chipH - 12;
  const g = 2.4, cols = SECTIONS.length, s = Math.min((b.w - (cols - 1) * g) / cols, (gh - (HEADS_PER - 1) * g) / HEADS_PER, 22);
  const gw = cols * s + (cols - 1) * g, x0 = b.x + (b.w - gw) / 2;
  // the grid and the chip in the middle of the room above the caption
  const gy = b.y + Math.max(0, (bottom - b.y - 6 - (HEADS_PER * (s + g) + 6 + chipH)) / 2);
  for (let c = 0; c < cols; c++) {
    const nh = numHeads(c).length, lit = c === sec;
    for (let r = 0; r < HEADS_PER; r++) {
      const x = x0 + c * (s + g), y = gy + r * (s + g);
      ctx.fillStyle = lit ? t.accent : t.paper3;
      ctx.fillRect(x, y, s, s);
      if (r < nh) diamond(ctx, x + s / 2, y + s / 2, s * 0.32, lit ? t.paper2 : t.ink3);
    }
    hits.push({ x0: x0 + c * (s + g) - g / 2, y0: gy, x1: x0 + c * (s + g) + s + g / 2, y1: gy + HEADS_PER * (s + g), sec: c });
  }
  // the chip: one number head of the section and its value, or a head of words
  const cy = gy + HEADS_PER * (s + g) + 6, cw = b.w, ch = chipH;
  const heads = numHeads(sec), lines = linesOf(sec);
  let name, value, kind;
  if (lines.length) {
    const o = lines[0], r = V.out[o.key];
    name = heads.find((h) => h !== 'LVEF') || o.rpt;
    value = o.key === 'ea' ? `${fx(r.value, 2)} m/s` : valueText(o, { ...r, value: r.head });
    kind = 'number';
  } else {
    name = SEC_SHORT[sec];
    value = null;
    kind = 'words';
  }
  ctx.save();
  rrect(ctx, b.x, cy, cw, ch, 6);
  ctx.fillStyle = lines.length ? t.accent : t.paper3;
  ctx.fill();
  ctx.restore();
  const on = lines.length ? t.paper2 : t.ink, kO = F(9.5, MONO, 500);
  const kw = sh.measure(kind, kO);
  sh.text(kind, b.x + cw - 10, cy + ch - 9, { ...kO, align: 'right', color: lines.length ? t.paper2 : t.ink3 });
  const nO = F(11, SANS, 500);
  sh.text(fits(sh, [name], cw - kw - 30, nO) ?? SEC_SHORT[sec], b.x + 10, cy + 14, { ...nO, color: on });
  if (value) sh.text(value, b.x + 10, cy + ch - 7, { ...F(13, MONO, 500), color: on });
  else {
    const wO = F(11, SERIF, 400), w0 = firstWords(V, sec);
    const s2 = fits(sh, w0, cw - kw - 30, wO);
    if (s2) sh.text(s2, b.x + 10, cy + ch - 8, { ...wO, color: t.ink2 });
  }
}
/** The words of section sec's first sentence, then its first clause: the forms a chip can show. */
function firstWords(V, sec) {
  const s = reportOf(V)[sec].parts.filter((p) => p[1] === 'w').map((p) => p[0]).join('');
  const first = s.split(/(?<=\.)\s/)[0].replace(/\.$/, '').replace(/^[A-Z][a-z]+ [a-z]+: /, '');
  const clause = first.split(/;|\s\(|,\s/)[0].trim();
  return [first, clause].map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}

// 5 · Measure: a tile for each output, with its marks, name, value and anchor check
const LAB1 = 29, LAB2 = 41;   // the label under a tile: name and value in one line, or in two
/**
 * The label's height under a tile, in one line or in two, at each level. 0: the name, the value
 * and the anchor check. 1, a short box: the name and the value. 2, the shortest boxes: the value,
 * with the name in the image's tag.
 */
const LABS = [[LAB1, LAB2], [17, 30], [17, 17]];
const IH_MIN = 24;            // px: the smallest image of a tile
const ASPECT = { b: 1.7, d: 2.0 }, COLS = { b: [5, 3, 9, 4], d: [4, 8, 3, 2] };
const labO = (r) => ({ n: F(10, SANS, 600), v: F(10.5, MONO, r.state === 'moved' ? 600 : 500) });
const TAG_O = { family: MONO, weight: 500, size: 9.5 };
/** The name and the value fit one line under a tile w px wide. */
function oneLine(sh, o, r, w) {
  const O = labO(r);
  return sh.measure(o.short, O.n) + 6 + sh.measure(valueText(o, r, 1), O.v) + (r.state === 'flagged' ? 9 : 0) <= w;
}
/** The value fits a tile w px wide, and so does the name: in the image's tag at level 2, else in its own line. */
function labelFits(sh, o, r, w, level) {
  const O = labO(r), vw = sh.measure(valueText(o, r, 1), O.v) + (r.state === 'flagged' ? 9 : 0);
  return vw <= w + 0.5 && (level === 2 ? sh.measure(o.short, TAG_O) + 5 <= w : sh.measure(o.short, O.n) <= w + 0.5);
}
/**
 * The arrangement of the tiles of list in box b whose images are largest: columns, the image's
 * size, the label's form (level, LABS) and height. ok is false when no arrangement holds images
 * of IH_MIN px. In a view of two (strict), every name and value fits its tile. With no such
 * arrangement, the tiles there fill the box with smaller images, or none. The three rows keep
 * their old fallback.
 */
function tileGrid(sh, b, list, V, aspect, colsList, level = 0, strict = false) {
  let best = null, fill = null;
  for (const c of colsList) {
    const r = Math.ceil(list.length / c), gx = 10, gy = 8, w = (b.w - (c - 1) * gx) / c;
    const one = level === 2 || list.every((o) => oneLine(sh, o, V.out[o.key], w));
    if (strict && !list.every((o) => labelFits(sh, o, V.out[o.key], w, level))) continue;
    const lab = LABS[level][one ? 0 : 1];
    const ih = Math.min(w / aspect, (b.h - (r - 1) * gy) / r - lab);
    if (!fill || ih > fill.ih) fill = { c, r, gx, gy, w, ih: Math.max(0, ih), lab, one, score: 0, ok: false };
    if (ih < IH_MIN) continue;
    const score = Math.min(w, ih * aspect);
    if (!best || score > best.score + 0.5) best = { c, r, gx, gy, w, ih, lab, one, score, ok: true };
  }
  if (best) return best;
  if (strict && fill) return fill;
  const c = colsList[colsList.length - 1];
  return { c, r: Math.ceil(list.length / c), gx: 8, gy: 6, w: (b.w - 8 * (c - 1)) / c, ih: 24, lab: LAB2, one: false, ok: false };
}
/** A band's tiles in box b, at label level. strict: in a view of two (tileGrid). clip: a box to keep them in. */
function measurePanel(sh, t, b, kind, sec, V, hits, level = 0, strict = false, clip = null) {
  const list = OUT.filter((o) => o.kind === kind), ctx = sh.ctx;
  const G = tileGrid(sh, b, list, V, ASPECT[kind], COLS[kind], level, strict);
  if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  list.forEach((o, i) => {
    const x = b.x + (i % G.c) * (G.w + G.gx), y = b.y + Math.floor(i / G.c) * (G.ih + G.lab + G.gy);
    const img = { x, y, w: G.w, h: G.ih }, lit = o.sec === sec;
    // a tile of the shortest boxes may have no room for its image
    if (G.ih >= 6) {
      if (o.kind === 'b') bTile(sh, t, img, o, V, level === 2 ? o.short : o.tag);
      else dTile(sh, t, img, o, V, level === 2 ? o.short : o.tag);
    }
    tileLabel(sh, t, { x, y: y + G.ih, w: G.w }, o, V.out[o.key], lit, G.one, level);
    if (lit && G.ih >= 6) {
      ctx.save();
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, G.w + 2, G.ih + 2);
      ctx.restore();
    }
    hits.push({ x0: x, y0: y, x1: x + G.w, y1: y + G.ih + G.lab, sec: o.sec });
  });
  if (clip) ctx.restore();
}
/** The inner box of the bands' card or cards (as card() returns it), with each band's box. */
function bandBoxes(P, merged, compact) {
  const inner = (p) => (compact ? { x: p.x + IN, y: p.y + HEAD_C + 2, w: p.w - 2 * IN, h: p.h - HEAD_C - 2 - 7 } : { x: p.x + IN, y: p.y + HEAD + 4, w: p.w - 2 * IN, h: p.h - HEAD - 4 - 8 });
  if (!merged) return { b: inner(P[5]), d: inner(P[5.5]) };
  const a = inner(P[5]), h = (a.h - SEP) / 2;
  return { b: { ...a, h }, d: { ...a, y: a.y + h + SEP, h } };
}
const SEP = 9;                // px between the bands in their one card
/**
 * One card of both bands: the B-mode tiles over the Doppler and M-mode tiles, a rule between them.
 * P: the card, where each band keeps its tiles in its half (a box too short for view 1).
 */
function bothBands(sh, t, b, sec, V, hits, level, P) {
  const h = (b.h - SEP) / 2, ctx = sh.ctx;
  measurePanel(sh, t, { ...b, h }, 'b', sec, V, hits, level, true, P && { x: P.x - 2, y: b.y - 4, w: P.w + 4, h: h + 4 + SEP / 2 });
  ctx.save();
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(b.x, b.y + h + SEP / 2); ctx.lineTo(b.x + b.w, b.y + h + SEP / 2); ctx.stroke();
  ctx.restore();
  measurePanel(sh, t, { ...b, y: b.y + h + SEP, h }, 'd', sec, V, hits, level, true, P && { x: P.x - 2, y: b.y + h + SEP / 2, w: P.w + 4, h: P.y + P.h + 2 - (b.y + h + SEP / 2) });
}
/** The view tag at the top left of an image, as the scanner prints its text; none on a very short image. */
function imgTag(sh, img, str) {
  const o = TAG_O, w = sh.measure(str, o);
  if (w + 5 > img.w || img.h < 15) return;
  const ctx = sh.ctx;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,12,0.72)';
  ctx.fillRect(img.x + 1, img.y + 1, w + 5, 13.5);
  ctx.restore();
  sh.text(str, img.x + 3.5, img.y + 11, { ...o, color: SC.text });
}
function bTile(sh, t, img, o, V, tag = o.tag) {
  const ctx = sh.ctx, T = MS.tiles[o.key], f = MS.frames[o.key];
  ctx.save();
  ctx.fillStyle = SC.bg;
  ctx.fillRect(img.x, img.y, img.w, img.h);
  ctx.beginPath();
  ctx.rect(img.x, img.y, img.w, img.h);
  ctx.clip();
  if (T && T.canvas && f && MS.heart && MS.heart === heartNow()) {
    // a crop round the caliper (and the second peak), wide enough to show the structure
    const r = V.out[o.key], two = r.two;
    const pts = [f.ends[0], f.ends[1], ...(two ? [f.p2] : [])];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (img.w / img.h));
    const wcm = clamp(span * 1.6 + 2.2, 4.5, 16), k = img.w / wcm;          // px per cm on the tile
    const P = (p) => [img.x + img.w / 2 + (p[0] - cx) * k, img.y + img.h / 2 + (p[1] - cy) * k];
    // the image: the cut's px for the crop
    const m = T.map, dpr = T.canvas.width / T.w;
    const sx = (m.cx + (cx - wcm / 2) * m.k) * dpr, sy = (m.top + (cy - (img.h / k) / 2) * m.k) * dpr;
    const sw = wcm * m.k * dpr, shh = (img.h / k) * m.k * dpr;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(T.canvas, sx, sy, sw, shh, img.x, img.y, img.w, img.h);
    // the heat maps: a peak on each end, the second peak on the septum's map
    const sig = Math.max(2.2, 0.15 * k);
    for (const p of [f.ends[0], f.ends[1], ...(two ? [f.p2] : [])]) { const q = P(p); blob(ctx, q[0], q[1], sig, 0.75); }
    // the caliper after the anchor; with two peaks, the model's own end (between them) ringed
    const A = P(f.ends[0]), Bq = P(f.ends[1]);
    ctx.strokeStyle = SC.cal;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2.5]);
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.stroke();
    ctx.setLineDash([]);
    for (const q of [A, Bq]) centerMark(ctx, q[0], q[1], 2.2);
    if (two) {
      const e = f.two[o.m.two.end], q = P(e);
      ring(ctx, q[0], q[1], 3.6, palette(t).pink);
    }
  } else {
    ctx.strokeStyle = SC.frame;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(img.x + img.w / 2, img.y + 2);
    ctx.arc(img.x + img.w / 2, img.y + 2, img.h * 1.15, Math.PI / 2 + 0.68, Math.PI / 2 - 0.68, true);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  imgTag(sh, img, tag);
}
const DCACHE = new Map();
function dSpec(o, heart) {
  const id = `${o.key}|${heart}`;
  if (!DCACHE.has(id)) DCACHE.set(id, { d: o.d, ...dopplerOf(o.d, heart) });
  return DCACHE.get(id);
}
function dTile(sh, t, img, o, V, tag = o.tag) {
  const ctx = sh.ctx, Dd = dSpec(o, V.heart);
  ctx.save();
  ctx.fillStyle = SC.bg;
  ctx.fillRect(img.x, img.y, img.w, img.h);
  ctx.beginPath();
  ctx.rect(img.x, img.y, img.w, img.h);
  ctx.clip();
  const bx = { x: img.x, y: img.y, w: img.w, h: img.h };
  if (Dd.mode === 'mm') {
    // the annulus over two beats with the probe at the top, as ch/measure.js draws TAPSE
    ctx.fillStyle = '#20262a';
    ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.strokeStyle = '#d9dfe2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, y = bx.y + (Dd.top + ((1 - cycleAt((u * 2 * RR) % RR).s) * Dd.tapse) / Dd.span) * bx.h;
      if (i) ctx.lineTo(bx.x + u * bx.w, y); else ctx.moveTo(bx.x + u * bx.w, y);
    }
    ctx.stroke();
  } else {
    spectral(ctx, bx, { fn: Dd.fn, scale: Dd.scale, base: Dd.base, mode: Dd.mode, broad: Dd.broad, gain: Dd.gain, key: `ai|${Dd.key}`, seed: Dd.seed });
    if (Dd.dens !== undefined && Dd.dens < 0.95) {
      ctx.fillStyle = SC.bg;
      ctx.globalAlpha = 0.72 * (1 - Dd.dens);
      ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
      ctx.globalAlpha = 1;
    }
  }
  // the heat maps on the peaks, and their weighted centers
  const sig = Math.max(2.4, (9 / DH) * bx.h);
  for (const p of Dd.points) {
    const q = regionOf(Dd, p), x = bx.x + (q[0] / DW) * bx.w, y = bx.y + (q[1] / DH) * bx.h;
    blob(ctx, x, y, sig, 0.8);
    centerMark(ctx, x, y, 2.2);
  }
  ctx.restore();
  imgTag(sh, img, tag);
}
/**
 * Under a tile: the name, then the value (anchored: in the accent, after the caliper's own value
 * when there is room), in one line or in two; under them, the anchor check. At level 1 no check;
 * at level 2 the value alone, as the name is in the image's tag (LABS).
 */
function tileLabel(sh, t, b, o, r, lit, one, level = 0) {
  const C = palette(t), O = labO(r), nO = { ...O.n, weight: lit ? 600 : 500 }, vO = O.v;
  const named = level < 2, nw = named ? sh.measure(o.short, nO) : 0, room = one && named ? b.w - nw - 6 : b.w;
  const fw = r.state === 'flagged' ? 9 : 0;
  const val = [valueText(o, r, 0), valueText(o, r, 1)].find((s) => sh.measure(s, vO) + fw <= room) ?? valueText(o, r, 1);
  const col = r.state === 'moved' ? t.accent : r.state === 'flagged' ? t.flag : t.ink;
  const vw = sh.measure(val, vO), vy = one ? b.y + 13 : b.y + 26;
  if (named) sh.text(o.short, b.x, b.y + 13, { ...nO, color: lit ? t.ink : t.ink2 });
  sh.text(val, b.x + b.w - fw, vy, { ...vO, align: 'right', color: col });
  if (r.state === 'flagged') flagMark(sh.ctx, b.x + b.w - 6, vy, 8, t.flag);
  if (r.state === 'moved') {
    // the caliper's own value before it, where it fits
    const was = `${calText(r)}→`, wO = F(10, MONO, 500), left = one && named ? b.x + nw + 6 : b.x;
    if (b.x + b.w - vw - 3 - sh.measure(was, wO) >= left) sh.text(was, b.x + b.w - vw - 3, vy, { ...wO, align: 'right', color: C.pink });
  }
  if (level === 0) miniAnchor(sh.ctx, t, b.x + 2, vy + 10, b.w - 4, r);
}
/** The anchor check: the head's range and diamond on a short scale, the caliper's dot. */
function miniAnchor(ctx, t, x, y, w, r) {
  const C = palette(t), half = Math.min(w / 2 - 6, 60), cx = x + w / 2;
  const X = (v) => cx + clamp((v / r.head - 1) / SPAN, -1.05, 1.05) * half;
  ctx.save();
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
  ctx.fillStyle = C.band;
  ctx.fillRect(X(r.lo), y - 3.5, X(r.hi) - X(r.lo), 7);
  ctx.restore();
  diamond(ctx, X(r.head), y, 4.2, t.accent);
  if (r.state === 'moved') {
    ring(ctx, X(r.cal), y, 3.4, C.pink);
    ctx.save();
    ctx.strokeStyle = C.pink;
    ctx.fillStyle = C.pink;
    ctx.lineWidth = 1;
    const a = X(r.cal) - 4.5, bb = X(r.value) + 5;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(bb + 3, y); ctx.stroke();
    arrowHead(ctx, bb, y, -1, 0, 4);
    ctx.restore();
  }
  dot(ctx, X(r.value) + 0.6, y, 2.6, r.state === 'flagged' ? t.flag : C.pink);
}

// 6 · Anchor: a line for each output of the section
/** A legend glyph at (x, y), the baseline of its text: the head, the caliper, a second peak or a flag. */
function legendGlyph(ctx, t, g, x, y) {
  const C = palette(t);
  if (g === 'd') diamond(ctx, x + 4, y - 3.5, 4, t.accent);
  else if (g === 'c') dot(ctx, x + 4, y - 3.5, 2.8, C.pink);
  else if (g === 'f') flagMark(ctx, x + 2, y, 8, t.flag);
  else ring(ctx, x + 4, y - 3.5, 3.4, C.pink);
}
/**
 * The anchor's legend at the foot of box b: its items [glyph, text, short text] in one line, or
 * in their short forms over two lines. head: the free room at the right of a compact header,
 * which takes the first item where it fits. Returns the room it takes at the foot.
 */
function anchorLegend(sh, t, b, items, head) {
  const ctx = sh.ctx, lo = F(10, SANS, 400), L = legendPlan(sh, b.w, items, head ? head.w : 0);
  const draw = ([g, s], x, y) => { legendGlyph(ctx, t, g, x, y); sh.text(s, x + 11, y, { ...lo, color: t.ink3 }); };
  if (L.head) draw(L.head, head.x + head.w - L.head.w, head.y);
  L.rows.forEach((row, i) => {
    for (const it of row) draw(it, b.x + it.x, b.y + b.h - 3 - (L.rows.length - 1 - i) * 14);
  });
  return L.h;
}
/**
 * The legend's plan for a card bw px wide inside. Its items [glyph, text] go in one line, or in
 * their short forms over two lines. The first short form goes at the right of a compact header
 * where free px hold it. Each item has its left (x) and width (w); h is the room at the foot.
 */
function legendPlan(sh, bw, items, free = 0) {
  const lo = F(10, SANS, 400), w = (s) => 12 + sh.measure(s, lo);
  if (items.reduce((x, it) => x + w(it[1]) + 14, 0) <= bw + 4) {
    let x = 0;
    return { head: null, rows: [items.map(([g, s]) => { const it = [g, s]; it.x = x; x += w(s) + 14; return it; })], h: 20 };
  }
  let list = items, head = null;
  if (free && w(items[0][2]) <= free) { head = [items[0][0], items[0][2]]; head.w = w(items[0][2]); list = items.slice(1); }
  const rows = [[]];
  let x = 0;
  for (const [g, , s] of list) {
    if (x + w(s) > bw && rows[rows.length - 1].length) {
      if (rows.length === 2) break;
      rows.push([]);
      x = 0;
    }
    const it = [g, s];
    it.x = x;
    rows[rows.length - 1].push(it);
    x += w(s) + 10;
  }
  return { head, rows, h: 20 + 14 * (rows.length - 1) };
}
/** The anchor's lines on a narrow card, two rows each: the name and the value, then the scale. */
function anchorRows(sh, t, area, lines, V) {
  const ctx = sh.ctx, C = palette(t), lh = clamp(area.h / Math.max(lines.length, 3), 20, 34);
  const nameO = F(10.5, SANS, 400), valO = F(10.5, MONO, 500);
  const half = Math.min(area.w / 2 - 8, 90), cx = area.x + area.w / 2, right = area.x + area.w;
  lines.forEach((o, i) => {
    const r = V.out[o.key], ty = area.y + lh * i + 10, y = ty + 6.5;
    const X = (v) => cx + clamp((v / r.head - 1) / SPAN, -1.05, 1.05) * half;
    // the value at the right: after the anchor, the caliper's own value before it
    let vw;
    if (r.state === 'moved') {
      const v = valueText(o, r), was = `${calText(r)} →`, w1 = sh.measure(v, { ...valO, weight: 600 });
      sh.text(v, right, ty, { ...valO, weight: 600, align: 'right', color: t.accent });
      sh.text(was, right - w1 - 6, ty, { ...valO, align: 'right', color: C.pink });
      vw = w1 + 6 + sh.measure(was, valO);
    } else {
      const v = valueText(o, r), fw = r.state === 'flagged' ? 10 : 0;
      sh.text(v, right - fw, ty, { ...valO, align: 'right', color: r.state === 'flagged' ? t.flag : t.ink });
      if (fw) flagMark(ctx, right - 6, ty, 9, t.flag);
      vw = sh.measure(v, valO) + fw;
    }
    sh.text(fits(sh, [o.name, o.short], area.w - vw - 8, nameO) ?? o.short, area.x, ty, { ...nameO, color: t.ink });
    // the scale: the head's range and diamond, the caliper's dot; a moved caliper ringed, with its arrow
    ctx.save();
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
    ctx.fillStyle = C.band;
    rrect(ctx, X(r.lo), y - 3.5, X(r.hi) - X(r.lo), 7, 2);
    ctx.fill();
    ctx.restore();
    diamond(ctx, X(r.head), y, 4.6, t.accent);
    if (r.state === 'moved') {
      ring(ctx, X(r.cal), y, 3.8, C.pink);
      ctx.save();
      ctx.strokeStyle = C.pink;
      ctx.fillStyle = C.pink;
      ctx.lineWidth = 1;
      const a = X(r.cal) - 5, e = X(r.value) + 5.5;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(e + 3, y); ctx.stroke();
      arrowHead(ctx, e, y, -1, 0, 4);
      ctx.restore();
    }
    dot(ctx, X(r.value) + 0.6, y, 3, r.state === 'flagged' ? t.flag : C.pink);
  });
}
/** The legend's items [glyph, text, short text]: the head and its range, the caliper, a second peak, a flag. */
function anchorItems(lines, V) {
  const r0 = lines.map((o) => V.out[o.key]).find((r) => r.state === 'moved');
  const flagged = lines.some((o) => V.out[o.key].state === 'flagged');
  return [['d', 'head, its value ± 10%', 'head ± 10%'], ['c', 'caliper', 'caliper'],
    ...(r0 ? [['r', `a second peak gave ${calText(r0)} cm`, `second peak ${calText(r0)} cm`]] : []),
    ...(flagged ? [['f', 'no peak agrees: flagged for review', 'flagged for review']] : [])];
}
/** The widths of the anchor's name and value columns in a card w px wide inside. */
function anchorColumns(sh, w, lines, V) {
  const nameO = F(11, SANS, 400), valO = F(11, MONO, 500);
  const nameW = Math.min(w * 0.36, Math.max(...lines.map((o) => sh.measure(o.name, nameO))) + 12);
  const valW = Math.min(w * 0.32, Math.max(...lines.map((o) => {
    const r = V.out[o.key];
    return sh.measure(r.state === 'moved' ? `${calText(r)} → ${valueText(o, r)}` : valueText(o, r), valO);
  })) + 8);
  return { nameW, valW };
}
/**
 * The height an anchor card w px wide needs for the most lines a section has (the LV's six, with
 * the septum's second peak): its header, its lines in one row each (18 px) or two (20 px), and
 * its legend.
 */
function anchorNeed(sh, w, compact) {
  const V = valuesOf('normal', true), lines = linesOf(0), bw = w - 2 * IN;
  const { nameW, valW } = anchorColumns(sh, bw, lines, V);
  const rows = lines.length * (bw - nameW - valW - 10 >= 64 ? 18 : 20);
  const free = compact ? compactPlan(sh, w, '6', TITLES[6][0], TITLES[6][1]).free : 0;
  return (compact ? HEAD_C + 2 + 7 : HEAD + 4 + 8) + rows + legendPlan(sh, bw, anchorItems(lines, V), free).h;
}
function anchorPanel(sh, t, b, sec, V, head) {
  const ctx = sh.ctx, C = palette(t), lines = linesOf(sec);
  if (!lines.length) {
    // a section of words only: they go to the report as its heads give them
    const o = F(11.5, SANS, 400), wO = F(12.5, SERIF, 400);
    let y = b.y + 14;
    for (const s of wrap(sh, `${SECTIONS[sec].name}: no measurement. Its heads give the words of the report:`, b.w, o)) { sh.text(s, b.x, y, { ...o, color: t.ink2 }); y += 16; }
    y += 6;
    const words = reportOf(V)[sec].parts.map((p) => p[0]).join('');
    for (const s of wrap(sh, words, b.w - 14, wO)) { if (y > b.y + b.h - 4) break; sh.text(s, b.x + 14, y, { ...wO, color: t.ink }); y += 17; }
    return;
  }
  // the legend at the foot: the head and its range, the caliper, the second peak
  const area = { x: b.x, y: b.y, w: b.w, h: b.h - anchorLegend(sh, t, b, anchorItems(lines, V), head) };
  const lh = clamp(area.h / Math.max(lines.length, 3), 18, 34);
  const nameO = F(11, SANS, 400), valO = F(11, MONO, 500);
  const { nameW, valW } = anchorColumns(sh, area.w, lines, V);
  const sx0 = area.x + nameW, sx1 = area.x + area.w - valW - 10, half = (sx1 - sx0) / 2, cx = (sx0 + sx1) / 2;
  // a narrow card: the name and the value in one line, the scale under them
  if (sx1 - sx0 < 64) { anchorRows(sh, t, area, lines, V); return; }
  lines.forEach((o, i) => {
    const r = V.out[o.key], y = area.y + lh * (i + 0.5) + 2;
    const X = (v) => cx + clamp((v / r.head - 1) / SPAN, -1.05, 1.05) * half;
    const name = fits(sh, [o.name, o.short], nameW - 8, nameO) ?? o.short;
    sh.text(name, area.x, y + 4, { ...nameO, color: t.ink });
    ctx.save();
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx0, y); ctx.lineTo(sx1, y); ctx.stroke();
    ctx.fillStyle = C.band;
    rrect(ctx, X(r.lo), y - 6, X(r.hi) - X(r.lo), 12, 2);
    ctx.fill();
    ctx.restore();
    diamond(ctx, X(r.head), y, 6.5, t.accent);
    if (r.state === 'moved') {
      ring(ctx, X(r.cal), y, 5.5, C.pink);
      ctx.save();
      ctx.strokeStyle = C.pink;
      ctx.fillStyle = C.pink;
      ctx.lineWidth = 1.2;
      const a = X(r.cal) - 7, e = X(r.value) + 7;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(e + 4, y); ctx.stroke();
      arrowHead(ctx, e, y, -1, 0, 5);
      ctx.restore();
    }
    dot(ctx, X(r.value) + 1, y, 4.2, r.state === 'flagged' ? t.flag : C.pink);
    const vx = area.x + area.w;
    if (r.state === 'moved') {
      const v = valueText(o, r), vw = sh.measure(v, { ...valO, weight: 600 });
      sh.text(v, vx, y + 4, { ...valO, weight: 600, align: 'right', color: t.accent });
      sh.text(`${calText(r)} →`, vx - vw - 7, y + 4, { ...valO, align: 'right', color: C.pink });
    } else {
      const v = valueText(o, r);
      sh.text(v, vx - (r.state === 'flagged' ? 10 : 0), y + 4, { ...valO, align: 'right', color: r.state === 'flagged' ? t.flag : t.ink });
      if (r.state === 'flagged') flagMark(ctx, vx - 6, y + 4, 9, t.flag);
    }
  });
}

// 7 · Report: the sentences, EchoPrime's words in the serif, the measured numbers in blue
/**
 * The report's legend: at the right of the card's header when it fits there, else at the foot, in
 * one line or one item a line. Returns the room it takes at the foot.
 */
function reportLegend(sh, t, P, b, compact) {
  const lo = F(10, SANS, 400);
  const items = [['serif: ', 'EchoPrime heads', F(11, SERIF, 400), t.ink2], ['blue: ', 'measured, then anchored', F(10, MONO, 500), t.accent]];
  const widths = items.map(([k, s, kO]) => sh.measure(k, kO) + sh.measure(s, lo));
  const titleW = sh.measure('Report', F(18.5, SERIF)) + 44, capsW = 190;
  const right = P.x + P.w - IN;
  if (!compact && P.w - Math.max(titleW, capsW) - Math.max(...widths) >= 36) {
    items.forEach(([k, s, kO, kc], i) => {
      const y = P.y + 19 + i * 15, x = right - widths[i];
      sh.text(k, x, y, { ...kO, color: kc });
      sh.text(s, x + sh.measure(k, kO), y, { ...lo, color: t.ink3 });
    });
    return 0;
  }
  const one = widths[0] + 14 + widths[1] <= b.w + 2;
  items.forEach(([k, s, kO, kc], i) => {
    const lx = one && i ? b.x + widths[0] + 14 : b.x, ly = b.y + b.h - 3 - (one || i ? 0 : 14);
    sh.text(k, lx, ly, { ...kO, color: kc });
    sh.text(s, lx + sh.measure(k, kO), ly, { ...lo, color: t.ink3 });
  });
  return one ? 20 : 34;
}
function reportPanel(sh, t, P, b, sec, V, hits, compact) {
  const ctx = sh.ctx, C = palette(t), R = reportOf(V);
  const foot = reportLegend(sh, t, P, b, compact);
  const area = { x: b.x, y: b.y - 2, w: b.w, h: b.h - foot + 2 };
  // the words of each part, laid out in lines; a section's sentence lit. The largest type whose
  // lines all fit; numbers 1 px smaller in the mono face, never under 9.5 px
  let lay = null;
  for (const ws of [14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5]) {
    const wO = F(ws, SERIF, 400), nO = F(ws - 1, MONO, 500), lh = Math.round(ws * 1.32);
    const items = [];
    let x = area.x, y = 0;
    const space = sh.measure(' ', wO);
    for (const S of R) {
      for (const [text, kind] of S.parts) {
        const o = kind === 'w' ? wO : nO;
        // words break at spaces; a number with its unit stays whole
        const toks = kind === 'w' ? text.split(/(\s+)/).filter((q) => q.length) : [text];
        for (const tok of toks) {
          if (/^\s+$/.test(tok)) { x += space; continue; }
          // a value flagged for review takes its flag's room too
          const w = sh.measure(tok, o) + (kind === 'f' ? 10 : 0);
          if (x + w > area.x + area.w + 0.5 && x > area.x) { x = area.x; y += lh; }
          items.push({ tok, x, y, w, o, kind, sec: S.sec });
          x += w;
        }
      }
      x += space;
    }
    lay = { items, lh, rows: Math.round(y / lh) + 1, ws, space };
    if (lay.rows * lh <= area.h) break;
  }
  // the lines that fit: all of them, or a window that holds the lit sentence, with a mark where
  // lines are left out
  const maxRows = Math.max(1, Math.floor(area.h / lay.lh));
  let first = 0;
  if (lay.rows > maxRows) {
    const rowsOf = lay.items.filter((it) => it.sec === sec).map((it) => Math.round(it.y / lay.lh));
    const a = Math.min(...rowsOf), z = Math.max(...rowsOf);
    first = clamp(Math.round((a + z) / 2 - (maxRows - 1) / 2), 0, lay.rows - maxRows);
    if (a < first) first = a;
  }
  const y0 = area.y + lay.ws, rowOf = (it) => Math.round(it.y / lay.lh) - first;
  ctx.save();
  ctx.fillStyle = C.lit;
  for (const it of lay.items) {
    const row = rowOf(it);
    if (it.sec !== sec || row < 0 || row >= maxRows) continue;
    ctx.fillRect(it.x - 1, y0 + row * lay.lh - lay.ws * 0.92, it.w + lay.space + 1, lay.lh);
  }
  ctx.restore();
  for (const it of lay.items) {
    const row = rowOf(it);
    if (row < 0 || row >= maxRows) continue;
    const y = y0 + row * lay.lh, lit = it.sec === sec;
    const color = it.kind === 'n' ? t.accent : it.kind === 'f' ? t.flag : lit ? t.ink : t.ink2;
    sh.text(it.tok, it.x, y, { ...it.o, color });
    if (it.kind === 'f') flagMark(ctx, it.x + it.w - 7, y, 8, t.flag);
    hits.push({ x0: it.x, y0: y - lay.ws, x1: it.x + it.w + lay.space, y1: y - lay.ws + lay.lh, sec: it.sec });
  }
  // lines left out above or below the window: a short rule at that edge
  ctx.save();
  ctx.strokeStyle = t.ink3;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 3]);
  if (first > 0) { ctx.beginPath(); ctx.moveTo(area.x, area.y - 3); ctx.lineTo(area.x + 60, area.y - 3); ctx.stroke(); }
  if (first + maxRows < lay.rows) { const yb = y0 + maxRows * lay.lh - lay.ws + 3; ctx.beginPath(); ctx.moveTo(area.x, yb); ctx.lineTo(area.x + 60, yb); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- the links between the rows
function links(sh, t, L) {
  const ctx = sh.ctx, P = L.P, y0 = L.link.y0 + 3, y1 = L.link.y1 - 3;
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.fillStyle = t.accent;
  ctx.lineWidth = 1.4;
  // the view picks the clip: step 1 down to the B-mode band
  const x1 = P[1].x + P[1].w * 0.42;
  ctx.beginPath(); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1 - 5); ctx.stroke();
  arrowHead(ctx, x1, y1, 0, 1, 6);
  // the number heads anchor every value: step 4 down to both bands of measurements
  const x4 = P[4].x + P[4].w * 0.5, ym = y0 + 16, xb = P[5].x + P[5].w - 30;
  ctx.beginPath(); ctx.moveTo(x4, y0); ctx.lineTo(x4, y1 - 5); ctx.stroke();
  arrowHead(ctx, x4, y1, 0, 1, 6);
  ctx.beginPath(); ctx.moveTo(x4, ym); ctx.lineTo(xb, ym); ctx.lineTo(xb, y1 - 5); ctx.stroke();
  arrowHead(ctx, xb, y1, 0, 1, 6);
  ctx.restore();
  const o = F(11, SANS, 400);
  const s1 = fits(sh, ['the view picks the clip each model reads', 'the view picks each clip'], P[2].x + P[2].w - x1 - 14, o);
  if (s1) sh.text(s1, x1 + 9, ym + 4, { ...o, color: t.ink2 });
  const lo = F(11, MONO, 500), s2 = 'the number heads anchor every value';
  const w2 = sh.measure(s2, lo) + 14;
  const cx = (x4 + xb) / 2;
  if (w2 < x4 - xb - 20) {
    diamond(ctx, cx - w2 / 2 + 4, ym - 8, 4, t.accent);
    sh.text(s2, cx - w2 / 2 + 12, ym - 4.5, { ...lo, color: t.accent });
  }
}

/** Under the EchoPrime row of a small figure: its two links to the other rows, as the arrows of the full figure name them. */
function linkNotes(sh, t, b) {
  const ctx = sh.ctx, o = F(11, SANS, 400), lo = F(11, MONO, 500);
  const a = 'the view picks the clip each model reads (5)', d = 'the number heads anchor every value (6)';
  const two = sh.measure(a, o) + sh.measure(d, lo) + 60 > b.w;
  const y1 = b.y + 13, y2 = two ? y1 + 16 : y1, x2 = two ? b.x : b.x + b.w - sh.measure(d, lo) - 12;
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.fillStyle = t.accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(b.x + 4, y1 - 10); ctx.lineTo(b.x + 4, y1 - 2); ctx.stroke();
  arrowHead(ctx, b.x + 4, y1 + 1, 0, 1, 5);
  ctx.restore();
  sh.text(a, b.x + 14, y1, { ...o, color: t.ink2 });
  diamond(ctx, x2 + 4, y2 - 4, 4, t.accent);
  sh.text(d, x2 + 12, y2, { ...lo, color: t.accent });
}

/** The tabs of the two views, at the top of a small figure. */
const TABS = [
  ['1–4 EchoPrime', 'EchoPrime', '1–4'],
  ['5–7 Measurements, anchor and report', '5–7 Measure, anchor, report', '5–7 Measurements', 'Measure', '5–7'],
];
function tabsOf(sh, t, L, hits) {
  const b = L.tabs, w = b.w / TABS.length, o = F(11.5, SANS, 500);
  const ctx = sh.ctx;
  ctx.save();
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h - 0.5); ctx.lineTo(b.x + b.w, b.y + b.h - 0.5); ctx.stroke();
  ctx.restore();
  TABS.forEach((forms, i) => {
    const on = i === L.row, s = fits(sh, forms, w - 8, { ...o, weight: on ? 600 : 500 }) ?? forms[forms.length - 1];
    sh.text(s, b.x + i * w + w / 2, b.y + 16, { ...o, weight: on ? 600 : 500, align: 'center', color: on ? t.ink : t.ink3 });
    if (on) {
      ctx.save();
      ctx.fillStyle = t.accent;
      ctx.fillRect(b.x + i * w + 6, b.y + b.h - 3, w - 12, 3);
      ctx.restore();
    }
    hits.push({ x0: b.x + i * w, y0: b.y, x1: b.x + (i + 1) * w, y1: b.y + b.h, row: i });
  });
}

// ---------------------------------------------------------------- the figure
/**
 * Draw the figure for state S: { sec, step (0 none, 1 to 7), two, row, heart } on sheet sh with
 * tokens t. F1.video(ctx, i, x, y, w, h) draws video i of the study (ch/ai.js). Returns the
 * layout and the hit boxes (a section or a view).
 */
export function drawFigure(sh, t, S, F1) {
  const L = layoutOf(sh.w, sh.h, S.row, sh), hits = [], V = valuesOf(S.heart, S.two);
  const lit = (k) => S.step === Math.floor(k) || (k === 5.5 && S.step === 5);
  const rows = { top: 0, h: 0 }, compact = !!L.compact, level = L.level || 0, ctx = sh.ctx;
  for (const k of [1, 2, 3, 4, 5, 5.5, 6, 7]) {
    const P = L.P[k];
    if (!P) continue;
    // in a box too short for view 1, each card keeps its drawing inside it. The clip lies 2 px
    // outside the card, clear of its frame and of the next card (8 px or more away)
    const clip = L.clip ? { x: P.x - 2, y: P.y - 2, w: P.w + 4, h: P.h + 4 } : null;
    if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
    const b = card(sh, t, P, k, lit(k), compact, k === 5 && L.merged);
    if (k === 1) sortPanel(sh, t, b, F1);
    else if (k === 2) encodePanel(sh, t, b, V.heart, rows);
    else if (k === 3) weighPanel(sh, t, b, S.sec, hits);
    else if (k === 4) answerPanel(sh, t, b, S.sec, V, hits);
    else if (k === 5 && L.merged) bothBands(sh, t, b, S.sec, V, hits, level, L.clip ? P : null);
    else if (k === 5 || k === 5.5) measurePanel(sh, t, b, k === 5 ? 'b' : 'd', S.sec, V, hits, level, !L.all, clip);
    else if (k === 6) anchorPanel(sh, t, b, S.sec, V, b.head);
    else reportPanel(sh, t, P, b, S.sec, V, hits, compact);
    if (clip) ctx.restore();
  }
  if (L.all) links(sh, t, L);
  else {
    tabsOf(sh, t, L, hits);
    if (L.foot) linkNotes(sh, t, L.foot);
  }
  return { L, hits };
}
