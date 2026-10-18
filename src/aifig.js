// The figure of chapter 'ai' (ch/ai.js): EchoPrime and EchoNet-Measurements in seven steps.
// Row 1, EchoPrime, four panels: 1 sort (the 14 videos of ai.js, each with its view), 2 encode (one
// video encoder, 512 numbers a video), 3 weigh (the chosen section's mix of the 14 videos: each
// view's share of the public section weights of echoprime.js) and 4 answer (about 150 task
// heads). Row 2,
// EchoNet-Measurements: 5 measure, nine B-mode clips and eight Doppler and M-mode images, with the
// calipers and peaks of ch/measure.js. Row 3: 6 anchor (each number head checks its measurement)
// and 7 report (EchoPrime's words, the measured numbers). A report section lights its cell of the
// strip and its mix in 3, its heads in 4, its tiles in 5, its lines in 6 and its sentence in 7.
//
// The task heads and the anchor are in development and not published: here they are a teaching
// simulation. A head's value is the site's value for the heart shown (the SITE table and the
// Doppler values of ch/measure.js), and its range is that value ± BAND. The words of the report
// are the site's own report for the heart (ch/report.js). Neither model ran on these images.
//
// A box 840 px wide or more shows every step at once, in the three rows, at least 540 px tall. A
// narrower box shows the steps in more rows, each as tall as its cards need, and the box scrolls.
// Arrows link each step to the next. Every text is 9.5 px or larger, except a video's view on a
// phone (9 px), the rows' labels of step 2 and the anchor's band label (8.5 px, 7 px where the
// rows lie under 10 px apart) and the mix's labels in a narrow card (8.5 px).
import { MONO, SANS, clamp, rng } from './sketch.js';
import { SC, spectral } from './scope.js';
import { cycleAt, RR } from './cyclemodel.js';
import { SECTIONS, GROUPS, W as WEIGHT } from './echoprime.js';
import { buildReport } from './ch/report.js';
import { B, D, SITE, siteValue, dopplerOf, regionOf, DW, DH, DEEPER, OFF, blob, loadViews, warmViews, reportedFrame } from './ch/measure.js';

const SERIF = '"Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
/** A head's range in the figure: its value ± 10%. A band chosen for the figure, not the model's error. */
export const BAND = 0.1;
/** The anchor's scale: the head's value ± 70%, so that the septum's second peak stays on it. */
const SPAN = 0.7;
/** The anchor's one band for all its lines (SHOW_SCALES off): the head's value ± 25%, or ± SPAN with the second peak. */
const SPAN_BAND = 0.25;
/**
 * The septum's second peak (valuesOf's two): off, and its switch hidden (ch/ai.js). The cards
 * take the size of the values that can show. The code stays.
 */
export const SHOW_TWO = false;
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
 * from paper-3 (0) to the accent (1). The measurement model's marks are teal: #2dc1b3 for the
 * heat maps, the calipers' dots and lines and the frame; on paper, text and outlines in the
 * readable teal #0f766e.
 */
const TEAL = '#2dc1b3', TEAL_RGB = [45, 193, 179];
function palette(t) {
  const key = `${t.paper}|${t.paper2}|${t.paper3}|${t.accent}|${t.dark}`;
  if (PAL.key === key) return PAL;
  const p3 = rgbOf(t.paper3), ac = rgbOf(t.accent);
  PAL = {
    key,
    card: t.paper2,
    weight: (w) => css(mix(p3, ac, clamp(w, 0, 1))),
    teal: TEAL,
    tealInk: t.dark ? TEAL : '#0f766e',
    // the head's ring beside the teal dot: the accent; on slate a deeper blue, as the light accent
    // and the teal are too alike there (dataviz palette check: ΔE 11 against 17)
    head: t.dark ? css(mix(ac, rgbOf(t.accent2), 0.5)) : t.accent,
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
/** A number head: a ring in the accent. On a scale, the caliper's dot inside it is a value the head confirms. */
function headRing(ctx, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, r * 0.34);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
/** A caliper's value: a teal dot, edged in the readable teal on paper, where the teal alone is pale. */
function calDot(ctx, t, x, y, r) {
  const C = palette(t);
  dot(ctx, x, y, r, C.teal);
  if (t.dark) return;
  ctx.save();
  ctx.strokeStyle = C.tealInk;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
/** A caliper's end on the scanner's image: a teal dot, edged dark so that it holds over bright tissue. */
function endDot(ctx, x, y, r = 2.4) {
  ctx.save();
  ctx.fillStyle = TEAL;
  ctx.strokeStyle = 'rgba(8,10,12,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
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
const BANDS = 0.46;         // the bands' share of the height under row 1, as in the three rows
/**
 * The figure with tabs, as before Oct 2026 (layoutTabs): the three rows in a box of 840 × 650 px
 * or more, else one of two views with tabs at the top. Hidden; the code stays.
 */
export const SHOW_TABS = false;
/**
 * Steps 2 to 4 as grids, as before 9 Oct 2026: a grid of numbers for the videos, the weights of
 * every section in its column, and the 150 heads in a grid. Off: a stripe for each video, a line
 * from each video to the chosen section, and that section's heads with their output. The code
 * stays.
 */
const SHOW_GRIDS = false;
/**
 * Step 3 as lines, as before 10 Oct 2026: a line from each video's row to the chosen section, as
 * wide and as dark as the weight of its view group (weighLines). Off: the study's mix of the
 * chosen section (weighShare). The code stays.
 */
const SHOW_LINES = false;
/** A scale on each line of the anchor, as before 9 Oct 2026. Off: one band and one head line for all its lines. The code stays. */
const SHOW_SCALES = false;
const FIT_W = 840, FIT_H = 540;   // px: the smallest box that shows every step at once
const LINK = 30;            // px: the band of the two links over the measurements, in one line
const LINK2 = 46;           // the band in two lines
const ROW_GAP = 20;         // px between two rows of a flow: room for an arrow
const GAP_Y = 16;           // px between the measurements and the anchor of the three rows
const LANE = 12;            // px at the left of a flow: the link from the sort down to the measurements
/**
 * The layout of the figure in a box W × H. A box FIT_W px wide or more shows every step at once,
 * in three rows at least FIT_H px tall (layoutFit). A narrower box shows the steps in more rows,
 * each as tall as its cards need (layoutFlow). H of the layout is the height of its content: where
 * that is taller than the box, the box scrolls. sh measures the text. row: the view of the figure
 * with tabs.
 */
export function layoutOf(W, H, row, sh) {
  if (SHOW_TABS) return layoutTabs(W, H, row, sh);
  const key = `${W}|${H}`;
  let L = LAYOUTS.get(key);
  if (!L) {
    L = W >= FIT_W ? layoutFit(W, H, sh) : layoutFlow(W, H, sh);
    LAYOUTS.set(key, L);
    if (LAYOUTS.size > 12) LAYOUTS.delete(LAYOUTS.keys().next().value);
  }
  return L;
}
/**
 * The layouts made, by box: a layout depends on the box and on the fonts that measure its text
 * alone, and the figure draws again with each frame of the videos. A font that loads clears them.
 */
const LAYOUTS = new Map();
globalThis.document?.fonts?.addEventListener?.('loadingdone', () => LAYOUTS.clear());
/**
 * The three rows in a box W px wide, FIT_H px tall or more. Row 1, EchoPrime: the sort at two
 * fifths of the width, the other three at a fifth each. Under the links, the measurements and the
 * anchor in row 2, no taller than row 1, and the report across the figure in row 3 (viewSix). Where
 * these cards need more height than the box gives, the content grows and the box scrolls. In a
 * tall box the content ends under the report.
 */
function layoutFit(W, H, sh) {
  const Hc = Math.max(H, FIT_H), u = (W - 2 * PAD - 3 * GAP) / 5;
  const h1 = clamp(Math.round((Hc - 2 * PAD - LINK - GAP) * 0.4), 200, 360);
  // the links' band: one line, or two where the labels need them (linkPlan reads the cards' x alone)
  let band = LINK, P, F6, plan;
  for (let i = 0; i < 2; i++) {
    const y2 = PAD + h1 + band;
    P = { 1: { x: PAD, y: PAD, w: 2 * u, h: h1 } };
    [2, 3, 4].forEach((k, j) => { P[k] = { x: PAD + (j + 2) * u + (j + 1) * GAP, y: PAD, w: u, h: h1 }; });
    F6 = viewSix(sh, { x: PAD, y: y2, w: W - 2 * PAD, h: Hc - PAD - y2 }, GAP, GAP_Y, h1);
    Object.assign(P, F6.P);
    plan = linkPlan(sh, P, PAD, null, true);
    if (plan.h <= band) break;
    band = plan.h;
  }
  const c = F6.compact;
  return { W, H: Math.max(Hc, F6.bottom + PAD), P, fit: true, merged: F6.merged, level: F6.level, clip: F6.clip, compact: { 5: c, 5.5: c, 6: c, 7: c }, link: { y0: PAD + h1, y1: PAD + h1 + band, ...plan }, arrows: arrowsOf(P) };
}
/**
 * The steps in rows of cards, each row as tall as its cards need, for a box W px wide (narrower
 * than FIT_W). From 800 px the rows are those of the three rows: the sort at two fifths beside the
 * other three of EchoPrime; the bands, in one card or two, whichever row is shorter, with the
 * anchor at their right, no taller than the row of EchoPrime; the report across the figure. Under
 * 800 px the sort sits over the other three, in a row of three from 486 px or of two and one. The
 * bands take two cards from 600 px, else one, and the anchor and the report follow, each across
 * the figure. Where rows lie between the sort and the measurements, their link runs down a lane at
 * the left. The normal heart's values set the heights, so they do not change with the heart. A
 * flow shorter than the box gives the rest to the report.
 */
function layoutFlow(W, H, sh) {
  const V = valuesOf('normal', SHOW_TWO), wide = W >= 800, lane = wide ? 0 : LANE;
  const x0 = PAD + lane, w0 = W - 2 * PAD - lane, half = (w0 - GAP) / 2;
  let merged = w0 < 600, split = 0.5;
  const rows = [];
  if (wide) {
    const u = (w0 - 3 * GAP) / 5;
    rows.push([[1, 2 * u, sortNeed(sh, 2 * u, 52)], [2, u, encodeNeed()], [3, u, weighNeed(u)], [4, u, answerNeed(u)]]);
  } else {
    rows.push([[1, w0, sortNeed(sh, w0, 64)]]);
    if (w0 >= 3 * 150 + 2 * GAP) {
      const u = (w0 - 2 * GAP) / 3;
      rows.push([[2, u, encodeNeed()], [3, u, weighNeed(u)], [4, u, answerNeed(u)]]);
    } else {
      rows.push([[2, half, encodeNeed()], [3, half, weighNeed(half)]]);
      rows.push([[4, w0, answerNeed(w0)]]);
    }
  }
  const bands = rows.length;
  if (wide) {
    const wa = clamp(Math.round(w0 * 0.3), 280, 400), wl = w0 - wa - GAP, hw = (wl - GAP) / 2;
    const nb = bandNeed(sh, wl, 'b', V), nd = bandNeed(sh, wl, 'd', V), one = nb + nd + SEP + HEAD + 12;
    const two = Math.max(bandNeed(sh, hw, 'b', V), bandNeed(sh, hw, 'd', V)) + HEAD + 12;
    merged = one <= two;
    split = nb / (nb + nd);
    let h = Math.max(merged ? one : two, anchorNeed(sh, wa, false, true));
    // no taller than row 1, or than the anchor's need where that is more: the tiles then shrink,
    // in the form whose images are larger at that height (a tie keeps the form of the needs)
    const most = Math.max(Math.max(...rows[0].map((c) => c[2])), anchorNeed(sh, wa, false));
    if (h > most) {
      const qa = bandsAt(sh, wl, most, true, split, V), qb = bandsAt(sh, hw, most, false, split, V);
      if (qa || qb) {
        h = most;
        if (!(merged ? qa : qb) || Math.abs(qa - qb) > 2) merged = qa > qb;
      }
    }
    rows.push(merged ? [[5, wl, h], [6, wa, h]] : [[5, hw, h], [5.5, hw, h], [6, wa, h]]);
  } else {
    const nb = bandNeed(sh, merged ? w0 : half, 'b', V), nd = bandNeed(sh, merged ? w0 : half, 'd', V);
    if (merged) { rows.push([[5, w0, nb + nd + SEP + HEAD + 12]]); split = nb / (nb + nd); }
    else {
      const h = Math.max(nb, nd) + HEAD + 12;
      rows.push([[5, half, h], [5.5, half, h]]);
    }
    rows.push([[6, w0, anchorNeed(sh, w0, false, true)]]);
  }
  rows.push([[7, w0, reportNeed(sh, w0)]]);
  // the cards' boxes: x first, as the links' band needs them for its height
  const P = {};
  for (const row of rows) {
    let x = x0;
    for (const [k, w] of row) { P[k] = { x, y: 0, w, h: 0 }; x += w + GAP; }
  }
  const plan = linkPlan(sh, P, x0, lane ? PAD + lane / 2 : null, wide);
  let y = PAD, link = null;
  rows.forEach((row, i) => {
    if (i === bands) { link = { y0: y - ROW_GAP, y1: y - ROW_GAP + plan.h, ...plan }; y += plan.h - ROW_GAP; }
    const h = Math.max(...row.map((c) => c[2]));
    for (const [k] of row) Object.assign(P[k], { y, h });
    y += h + ROW_GAP;
  });
  const total = y - ROW_GAP + PAD;
  if (total < H) P[7].h += H - total;
  const P1 = P[1];
  return { W, H: Math.max(H, total), P, flow: true, merged, split, level: 0, compact: {}, link: { ...link, from1: lane ? { x: P1.x, y: P1.y + P1.h - 18 } : null }, arrows: arrowsOf(P) };
}
/** The figure with tabs (SHOW_TABS): the three rows, or one of two views (viewFive for the second). */
function layoutTabs(W, H, row, sh) {
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
    return { all: true, old: true, W, H, P, rows: [0, 1, 2], link: { y0: PAD + h1, y1: y2 } };
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
function viewFive(sh, box, g, gy = g) {
  const half = (box.w - g) / 2, V = valuesOf('normal', SHOW_TWO);
  const make = (merged, compact, h3, level) => {
    const P = {}, h2 = box.h - h3 - gy, y3 = box.y + h2 + gy;
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
  const first = wide ? make(false, false, box.h - Math.round(box.h * BANDS) - gy, 0)
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
  return { ...make(merged, compact, Math.min(need.compact, box.h - gy), 2), clip: true };
}
const REPORT_MAX = 0.42;      // the report's largest share of the height under the links (viewSix)
const REPORT_WS = 12.5;       // px: the type that sets the report's height there
/**
 * The cards under the links of the three rows, in box. Row 2: the bands of measurements and, at
 * their right under step 4, the anchor, at 30% of the width (280 to 400 px). Row 3: the report
 * across the box, as tall as its words at REPORT_WS px, up to REPORT_MAX of the box and down to 4
 * lines where the anchor needs the room. The bands sit side by side, or in one card where that
 * gives larger images. Compact headers come where they give larger images by more than 2 px. The
 * form with the largest tiles wins, at the lowest label level that holds images of IH_MIN px.
 * Where no form holds them, the row of the measurements grows. Row 2 is no taller than top (the
 * height of row 1), or than the anchor's need where that is more. The normal heart's values set
 * the layout, so it does not change with the heart. bottom: the foot of the report, below the box
 * where the cards need more height than it gives.
 */
function viewSix(sh, box, g, gy, top = Infinity) {
  const V = valuesOf('normal', SHOW_TWO), wa = clamp(Math.round(box.w * 0.3), 280, 400), wl = box.w - wa - g;
  const rows = reportLines(sh, { x: 0, w: box.w - 2 * IN }, reportOf(V), REPORT_WS).rows, lh = Math.round(REPORT_WS * 1.32);
  const repH = (compact, n) => (compact ? HEAD_C + 2 + 7 : HEAD + 4 + 8) + reportPlan(sh, box.w, box.w - 2 * IN, compact, true).foot - 2 + n * lh;
  const make = (merged, compact, h2, h3, level) => {
    const P = {}, y3 = box.y + h2 + gy;
    if (merged) P[5] = { x: box.x, y: box.y, w: wl, h: h2 };
    else {
      const hw = (wl - g) / 2;
      P[5] = { x: box.x, y: box.y, w: hw, h: h2 };
      P[5.5] = { x: box.x + hw + g, y: box.y, w: hw, h: h2 };
    }
    P[6] = { x: box.x + wl + g, y: box.y, w: wa, h: h2 };
    P[7] = { x: box.x, y: y3, w: box.w, h: h3 };
    const B = bandBoxes(P, merged, compact), q = [];
    let ok = true;
    for (const kind of ['b', 'd']) {
      const G = tileGrid(sh, B[kind], OUT.filter((o) => o.kind === kind), V, ASPECT[kind], COLS[kind], level, true);
      ok = ok && G.ok;
      q.push(Math.min(G.ih, G.w / ASPECT[kind]));
    }
    return { P, merged, compact, level, ok, q: Math.min(...q), bottom: y3 + h3 };
  };
  // the heights for a header form: the report's, its least (lo), and the measurements' row, which
  // takes the rest of the box up to its most. The room that the row leaves goes back to the
  // report, up to the height of its words.
  const heights = (compact) => {
    const need = anchorNeed(sh, wa, compact), lo = repH(compact, Math.min(4, rows)), hi = repH(compact, rows);
    const most = Math.max(need, top);
    let h3 = clamp(Math.round(box.h * REPORT_MAX), lo, hi);
    if (box.h - gy - h3 < need) h3 = Math.max(lo, box.h - gy - need);
    const h2 = Math.min(Math.max(need, box.h - gy - h3), most);
    return { h2, h3: clamp(box.h - gy - h2, h3, hi), lo, most };
  };
  // the best form with the measurements' row extra px taller, up to its most: the report gives up
  // lines first, down to 4, then the content grows (grow px)
  const search = (extra) => {
    let best = null;
    for (const compact of [false, true]) {
      const { h2, h3, lo, most } = heights(compact), h2x = Math.min(h2 + extra, most), h3x = Math.max(lo, h3 - (h2x - h2));
      for (const level of [0, 1, 2]) {
        let c = null;
        for (const merged of [false, true]) {
          const m = make(merged, compact, h2x, h3x, level);
          if (m.ok && (!c || m.q > c.q + 2)) c = m;
        }
        if (!c) continue;
        c.grow = Math.max(0, h2x + gy + h3x - box.h);
        if (!best || c.grow < best.grow || (c.grow === best.grow && (c.level < best.level || (c.level === best.level && c.q > best.q + 2)))) best = c;
        break;
      }
    }
    return best;
  };
  // no growth first, then the lowest label level, then the tallest report
  let best = null;
  for (let extra = 0; extra <= 300; extra += 10) {
    const b = search(extra);
    if (b && (!best || b.grow < best.grow || (b.grow === best.grow && b.level < best.level))) best = b;
    if (best && (best.grow > 0 || best.level === 0 || (b && b.grow > 0))) break;
  }
  return best ?? { ...make(true, true, heights(true).h2, heights(true).lo, 2), clip: true };
}
/**
 * The height of the sort's card w px wide: its 14 videos in the fewest rows whose tiles are tmin
 * px wide or more, with each view's tag in one line. sortPanel then takes that grid.
 */
function sortNeed(sh, w, tmin) {
  const bw = w - 2 * IN, tagO = { family: MONO, weight: 500, size: bw < 200 ? 9 : 9.5 };
  const need = Math.max(tmin, ...VIEW_TAG.map((s) => sh.measure(s, tagO) + 5));
  const c = [7, 5, 4, 3].find((n) => (bw - (n - 1) * 2) / n >= need) ?? 3;
  const r = Math.ceil(N_VID / c), th = (bw - (c - 1) * 2) / c / 1.12;
  return Math.ceil(r * th + (r - 1) * 2) + HEAD + 12 + 18;
}
/**
 * The heights of the cards of steps 2, 3 and 4, w px wide: the encoder's box and the sections'
 * strip over 14 rows of 11 px; the heads' box over the LV's eight number heads at 15 px and four
 * lines of words. With the grids (SHOW_GRIDS): 14 rows of numbers; 14 rows of weights, as high as
 * a column is wide up to 11 px; the heads, 6 to 14 px each.
 */
const encodeNeed = () => (SHOW_GRIDS ? HEAD + 12 + 18 + 14 * 8 : HEAD + 12 + 18 + ROWS_TOP + 6 + 14 * 11);
const weighNeed = (w) => (SHOW_GRIDS ? HEAD + 12 + 18 + Math.ceil(14 * clamp((w - 2 * IN) / 15, 6, 11)) : encodeNeed());
const answerNeed = (w) => (SHOW_GRIDS ? HEAD + 12 + Math.ceil(10 * clamp((w - 2 * IN - 33.6) / 15, 6, 14) + 83.6) : HEAD + 12 + 18 + 29 + 8 * 15 + 4 * 14);
const TILE_W = { b: 96, d: 88 };   // px: the width of a band's tiles in a flow
/**
 * The height of a band's tiles in a card w px wide: the columns whose tiles come nearest TILE_W
 * px wide (as a ratio), with every name and value in its tile, as tileGrid then takes them.
 */
function bandNeed(sh, w, kind, V) {
  const list = OUT.filter((o) => o.kind === kind), bw = w - 2 * IN, tw = (c) => (bw - (c - 1) * TILE_GX) / c;
  const off = (c) => Math.max(tw(c) / TILE_W[kind], TILE_W[kind] / tw(c));
  const ok = COLS[kind].filter((c) => list.every((o) => labelFits(sh, o, V.out[o.key], tw(c), 0)));
  const c = (ok.length ? ok : [Math.min(...COLS[kind])]).reduce((a, b) => (off(b) < off(a) ? b : a));
  const r = Math.ceil(list.length / c), one = list.every((o) => oneLine(sh, o, V.out[o.key], tw(c)));
  return Math.ceil(r * (tw(c) / ASPECT[kind] + LABS[0][one ? 0 : 1]) + (r - 1) * TILE_GY);
}
/**
 * The height of a report card w px wide that holds the normal heart's report at 13.5 px (13 on a
 * phone), with a line to spare for a longer report.
 */
function reportNeed(sh, w) {
  const bw = w - 2 * IN, lay = reportLines(sh, { x: 0, w: bw }, reportOf(valuesOf('normal', SHOW_TWO)), w < 420 ? 13 : 13.5);
  return HEAD + 12 + reportPlan(sh, w, bw, false).foot - 2 + (lay.rows + 1) * lay.lh;
}
/**
 * The two links over the measurements, across: the sort's link to the B-mode band, straight down
 * from the sort or down the lane at laneX; and the number heads' link down from step 4. With six,
 * the anchor sits under step 4, in the row of the measurements, and the heads' link drops into
 * it. Else it drops to the bands, with a branch to the B-mode band where the bands are two cards.
 * Their labels go in one line, the heads' label on the branch where it fits; else it goes in a
 * second line. h: the band's height. A label too long for its room takes a shorter form.
 */
function linkPlan(sh, P, x0, laneX, six = false) {
  const B = P[5], D = P[5.5], o1 = F(11, SANS, 400), o2 = F(11, MONO, 500);
  const x1 = laneX === null ? clamp(P[1].x + P[1].w * 0.42, B.x + 16, B.x + B.w - 16) : B.x + 24;
  const full4 = P[4].w >= P[1].w - 1;
  let x4 = full4 ? P[4].x + P[4].w - 28 : P[4].x + P[4].w / 2;
  if (six) x4 = clamp(x4, P[6].x + 16, P[6].x + P[6].w - 16);
  const xb = !six && D && x4 > B.x + B.w ? B.x + B.w - 30 : null;
  const S1 = ['the view picks the clip each model reads', 'the view picks each clip'];
  const S2 = ['the number heads anchor every value', 'the heads anchor every value', 'heads anchor each value'];
  const s1 = fits(sh, S1, (xb ?? x4) - 12 - (x1 + 9), o1) ?? S1[1];
  const e1 = x1 + 9 + sh.measure(s1, o1), w2 = (s) => sh.measure(s, o2) + 14;
  const fitIn = (l, r) => S2.find((s) => w2(s) <= r - l);
  // the heads' label: on the branch, in the middle; else at the left of the heads' drop, in full
  // after the sort's label, or in a second line between the two drops
  let s2, at, l2x;
  if (xb !== null) {
    s2 = fitIn(xb + 10, x4 - 10);
    at = s2 ? 'branch' : 2;
    s2 ??= S2[2];
    l2x = at === 'branch' ? (xb + x4) / 2 - w2(s2) / 2 : Math.max(xb + 9, x4 - 9 - w2(s2));
  } else {
    at = w2(S2[0]) <= x4 - 9 - (e1 + 16) ? 1 : 2;
    s2 = at === 1 ? S2[0] : fitIn(x1 + 9, x4 - 9) ?? S2[2];
    l2x = Math.max(at === 1 ? e1 + 16 : x1 + 9, x4 - 9 - w2(s2));
  }
  return { x1, x4, xb, lane: laneX, s1, s2, l2x, at, h: at === 2 ? LINK2 : LINK, six };
}
/**
 * The arrows from each step to the next, other than the links over the measurements: in the
 * gutter between two cards of a row, or down from a card to the one under it. The measurements
 * lead to the anchor from the card next to it: the Doppler band where it shares the anchor's row.
 */
function arrowsOf(P) {
  const out = [], to6 = P[5.5] && Math.abs(P[5.5].y - P[6].y) < 1 ? 5.5 : 5;
  for (const [a, b] of [[1, 2], [2, 3], [3, 4], [to6, 6], [6, 7]]) {
    const A = P[a], Bq = P[b];
    if (Math.abs(A.y - Bq.y) < 1) out.push({ x: A.x + A.w, y: A.y + Math.min(A.h, Bq.h) / 2 });
    else {
      const l = Math.max(A.x, Bq.x), r = Math.min(A.x + A.w, Bq.x + Bq.w);
      out.push({ x: (l + r) / 2, y0: A.y + A.h, y1: Bq.y });
    }
  }
  return out;
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
 * subtitle sits at their right where it fits. both: the one card of both bands. row: the three
 * rows, where a compact report's legend takes the room of its subtitle (reportPlan).
 */
function card(sh, t, P, k, lit, compact = false, both = false, row = false) {
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
  if (compact) return cardCompact(sh, t, P, n, title, k === 7 && reportPlan(sh, P.w, P.w - 2 * IN, true, row).row ? [] : subs);
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

// 2 · Encode: the encoder, and each video as a stripe of its 512 numbers
const ROWS_TOP = 30;          // px over the rows of steps 2 and 3: the encoder's box, the sections' strip
/** The rows of the 14 videos in the cards of steps 2 and 3: the first row's top, the pitch, the height. */
function videoRows(b, bottom) {
  const y0 = b.y + ROWS_TOP, h = bottom - 6 - y0;
  return { y0, rh: h / N_VID, h };
}
/** The type of the rows' labels at a pitch of rh px: 8.5 px, or 7 px under 10 px. */
const rowLabel = (rh) => ({ o: F(rh >= 10 ? 8.5 : 7, MONO, 500) });
/**
 * The rows that carry a label at a pitch of rh px: every row from 6.5 px, where the 7 px type
 * still clears the next row. Under 6.5 px, two labels stay 7 px apart, and the rows of the chosen
 * section's largest weights take theirs first, so that the views that the section rests on keep
 * their labels in step 2 (and their weights in step 3's lines, SHOW_LINES).
 */
function labelRows(rh, sec) {
  const d = rh >= 6.5 ? 1 : Math.max(2, Math.ceil(7 / rh));
  if (d === 1) return new Array(N_VID).fill(true);
  const show = new Array(N_VID).fill(false), taken = [];
  const order = [...Array(N_VID).keys()].sort((a, b) => WEIGHT[sec][VG[b]] - WEIGHT[sec][VG[a]] || a - b);
  for (const i of order) if (taken.every((j) => Math.abs(i - j) >= d)) { taken.push(i); show[i] = true; }
  return show;
}
/** An outlined box over a card's content: its name at the left, a note at the right. */
function moduleBox(sh, t, b, names, note) {
  const ctx = sh.ctx, tO = F(10.5, SANS, 600), mO = F(9.5, MONO, 500), nw = sh.measure(note, mO);
  ctx.save();
  rrect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, MODULE_H, 6);
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  const name = fits(sh, names, b.w - nw - 26, tO) ?? [].concat(names).pop();
  sh.text(name, b.x + 9, b.y + 15, { ...tO, color: t.ink });
  sh.text(note, b.x + b.w - 9, b.y + 15, { ...mO, align: 'right', color: t.ink3 });
}
const MODULE_H = 21;
/**
 * The encoder's box, and a row for each video: its view's tag and a stripe of its numbers. The
 * stripe is a sketch, 32 bars for the 512 numbers. A bus leads from the box to each row.
 */
function encodeRows(sh, t, b, heart, rowsY, sec) {
  const ctx = sh.ctx;
  const bottom = caption(sh, t, b, ['every video → 512 numbers', '512 numbers a video']);
  moduleBox(sh, t, b, ['Video encoder', 'Encoder'], 'mViT');
  const R = videoRows(b, bottom), L = rowLabel(R.rh), show = labelRows(R.rh, sec);
  const tagW = Math.max(...VIEW_TAG.map((x) => sh.measure(x, L.o)));
  const bx = b.x + tagW + 7, x1 = bx + 6, n = 32, cw = (b.x + b.w - x1) / n;
  const ac = rgbOf(t.accent), seed = [...heart].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  ctx.save();
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, b.y + MODULE_H + 1);
  ctx.lineTo(bx, R.y0 + R.rh * (N_VID - 0.5));
  for (let i = 0; i < N_VID; i++) { const y = R.y0 + R.rh * (i + 0.5); ctx.moveTo(bx, y); ctx.lineTo(x1 - 1, y); }
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < N_VID; i++) {
    const y = R.y0 + i * R.rh, r = rng(4000 + i * 31 + seed);
    if (show[i]) sh.text(VIEW_TAG[i], b.x + tagW, y + R.rh / 2 + L.o.size * 0.35, { ...L.o, align: 'right', color: t.ink3 });
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = css(ac, 0.14 + 0.86 * r());
      ctx.fillRect(x1 + k * cw, y + 1.5, Math.max(0.8, cw - 1), Math.max(1, R.rh - 3));
    }
  }
  rowsY.top = R.y0;
  rowsY.h = R.h;
}
/** The encoder as a filled bar, and each video as a row of 16 numbers (SHOW_GRIDS). */
function encodeGrid(sh, t, b, heart, rowsY) {
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

// 3 · Weigh: the chosen section's mix of the videos (SHOW_LINES: a line from each video to it)
const VG = [7, 5, 8, 6, 8, 8, 2, 4, 3, 0, 1, 10, 10, 9];   // each video's view group (echoprime.js GROUPS)
/** The 15 sections in a strip at the top of box b, the chosen one lit; a click chooses one. Returns the y under it. */
function sectionStrip(sh, t, b, sec, hits) {
  const ctx = sh.ctx, sw = b.w / SECTIONS.length;
  for (let s = 0; s < SECTIONS.length; s++) {
    ctx.save();
    rrect(ctx, b.x + s * sw + 1, b.y + 4, sw - 2, 10, Math.min(2.5, (sw - 2) / 2));
    ctx.fillStyle = s === sec ? t.accent : t.paper3;
    ctx.fill();
    ctx.restore();
    hits.push({ x0: b.x + s * sw, y0: b.y, x1: b.x + (s + 1) * sw, y1: b.y + 20, sec: s });
  }
  return b.y + 20;
}
/**
 * The 15 sections in a strip, the chosen one lit (a click chooses one), and from each video's row
 * a line to the chosen section's pill, as wide and as dark as the public weight of its view group,
 * with the weight at its start. The rows are those of step 2 (SHOW_LINES).
 */
function weighLines(sh, t, b, sec, hits) {
  const ctx = sh.ctx;
  const bottom = caption(sh, t, b, ['public weights of the section', 'public weights']);
  sectionStrip(sh, t, b, sec, hits);
  const R = videoRows(b, bottom), L = rowLabel(R.rh), show = labelRows(R.rh, sec), pO = F(10.5, SANS, 600);
  const name = fits(sh, [SECTIONS[sec].name, SEC_SHORT[sec]], b.w * 0.5, pO) ?? SEC_SHORT[sec];
  const pw = sh.measure(name, pO) + 18, ph = 22, px = b.x + b.w - pw, py = R.y0 + R.h / 2 - ph / 2;
  const x0 = b.x + sh.measure('0.00', L.o) + 6, ac = rgbOf(t.accent);
  for (let i = 0; i < N_VID; i++) {
    const w = WEIGHT[sec][VG[i]], y = R.y0 + R.rh * (i + 0.5);
    if (show[i]) sh.text(w.toFixed(2), b.x, y + L.o.size * 0.35, { ...L.o, color: w >= 0.5 ? t.ink : t.ink3 });
    if (w <= 0) continue;
    const ex = px - 1, ey = py + ph / 2, mx = x0 + (ex - x0) * 0.55;
    ctx.save();
    ctx.strokeStyle = css(ac, 0.12 + 0.8 * w);
    ctx.lineWidth = 0.6 + 2.6 * w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.bezierCurveTo(mx, y, mx, ey, ex, ey);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  rrect(ctx, px, py, pw, ph, ph / 2);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.restore();
  sh.text(name, px + pw / 2, py + 15, { ...pO, align: 'center', color: t.paper2 });
}
/**
 * The mix of the study's 14 videos for section sec: each view group's share of the sum of the
 * videos' weights, that is, the sum of its own videos' weights (a group with three videos counts
 * three times) over that sum for all 14. The five largest, then the rest as one part when it holds
 * two or more groups; whole percent that add to 100 (largest remainder). EchoPrime adds the
 * videos' embeddings, each times its weight (echoprime.js); the shares are this site's arithmetic
 * on those weights, not an output of EchoPrime. [{ g, n, v, pc }], largest first: g the view group
 * (-1 for the rest), n its videos (for the rest, its groups), v the sum of its weights, pc percent.
 */
export function shareOf(sec) {
  const all = GROUPS.map((_, g) => {
    const n = VG.filter((x) => x === g).length;
    return { g, n, v: n * WEIGHT[sec][g] };
  }).filter((p) => p.v > 0).sort((a, b) => b.v - a.v || a.g - b.g);
  const parts = all.length > 6 ? all.slice(0, 5) : all, rest = all.slice(parts.length);
  if (rest.length) parts.push({ g: -1, n: rest.length, v: rest.reduce((a, p) => a + p.v, 0) });
  const total = parts.reduce((a, p) => a + p.v, 0), raw = parts.map((p) => (100 * p.v) / total);
  const pc = raw.map(Math.floor);
  let left = 100 - pc.reduce((a, x) => a + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; pc[i]++; left--; }
  return parts.map((p, i) => ({ ...p, pc: pc[i] }));
}
/**
 * The 15 sections in a strip, the chosen one lit (a click chooses one), its name, and one bar of
 * its mix (shareOf), the largest share at the top. Each part carries its view group's tag, its
 * videos (×3) and its share; a part's shade grows with its share, and the rest is pale. A label
 * that moves off its part to clear the next one keeps a line to it.
 */
function weighShare(sh, t, b, sec, hits) {
  const ctx = sh.ctx, C = palette(t);
  const bottom = caption(sh, t, b, ['each view\'s share of the mix', 'share of the mix']);
  const y1 = sectionStrip(sh, t, b, sec, hits), nO = F(10.5, SANS, 600);
  sh.text(fits(sh, [SECTIONS[sec].name, SEC_SHORT[sec]], b.w, nO) ?? SEC_SHORT[sec], b.x, y1 + 10, { ...nO, color: t.ink });
  const parts = shareOf(sec), top = y1 + 18, h = bottom - 6 - top, vmax = parts[0].v, total = parts.reduce((a, p) => a + p.v, 0);
  const bw = clamp(Math.round(b.w * 0.14), 18, 30), lx = b.x + bw + 9, right = b.x + b.w;
  const forms = (p) => (p.g < 0 ? [`${p.n} other views`, `${p.n} others`, 'others'] : p.n > 1 ? [`${GROUPS[p.g].tag} ×${p.n}`, GROUPS[p.g].tag] : [GROUPS[p.g].tag]);
  // 9.5 px where every label fits beside its percent, else 8.5 px
  const room = (o) => right - lx - sh.measure('100%', o) - 6;
  const o = [9.5, 8.5].map((z) => F(z, MONO, 500)).find((q) => parts.every((p) => sh.measure(forms(p)[0], q) <= room(q))) ?? F(8.5, MONO, 500);
  let y = top;
  const lab = parts.map((p) => {
    const ph = (h * p.v) / total, mid = y + ph / 2;
    ctx.save();
    ctx.fillStyle = p.g < 0 ? C.weight(0.14) : C.weight(0.3 + (0.7 * p.v) / vmax);
    ctx.fillRect(b.x, y + 1, bw, Math.max(0.5, ph - 2));
    ctx.restore();
    y += ph;
    return { mid, y: mid, p };
  });
  // the labels at their parts' middles, pushed apart where parts are thin, inside the bar's span
  const gap = o.size + 2.5, lo = top + o.size * 0.5, hi = top + h - o.size * 0.5;
  for (let k = 1; k < lab.length; k++) lab[k].y = Math.max(lab[k].y, lab[k - 1].y + gap);
  if (lab.length && lab[lab.length - 1].y > hi) lab[lab.length - 1].y = hi;
  for (let k = lab.length - 2; k >= 0; k--) lab[k].y = Math.min(lab[k].y, lab[k + 1].y - gap);
  if (lab.length && lab[0].y < lo) {
    lab[0].y = lo;
    for (let k = 1; k < lab.length; k++) lab[k].y = Math.max(lab[k].y, lab[k - 1].y + gap);
  }
  for (const l of lab) {
    if (Math.abs(l.y - l.mid) > 1.5) {
      ctx.save();
      ctx.strokeStyle = t.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x + bw + 1.5, l.mid);
      ctx.lineTo(lx - 2.5, l.y);
      ctx.stroke();
      ctx.restore();
    }
    const s = fits(sh, forms(l.p), room(o), o) ?? forms(l.p).pop();
    sh.text(s, lx, l.y + o.size * 0.35, { ...o, color: l.p.g < 0 ? t.ink3 : t.ink2 });
    sh.text(`${l.p.pc}%`, right, l.y + o.size * 0.35, { ...o, align: 'right', color: l.p.g < 0 ? t.ink2 : t.ink });
  }
}
/** The weights of every section, a column each, the chosen one framed (SHOW_GRIDS). */
function weighGrid(sh, t, b, sec, hits) {
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
  ctx.strokeStyle = C.teal;
  ctx.lineWidth = 2.2;
  rrect(ctx, b.x + sec * cw - 1.5, b.y - 2.5, cw + 1.4, h + 4, 3);
  ctx.stroke();
  ctx.restore();
}

// 4 · Answer: the chosen section's heads and their output
/** The number heads of section sec: each with its value, and its output (none for the LVEF, which no caliper measures). */
function headRows(sec, V) {
  return numHeads(sec).map((h) => {
    if (h === 'LVEF') return { name: h, value: `${V.ef}%`, o: null };
    if (h === 'E/A') { const r = V.out.ea; return { name: h, value: fx(r.head / r.A, 2), o: BY.ea }; }
    const o = OUT.find((x) => x.rpt === h);
    if (!o) return { name: h, value: '', o: null };
    const r = V.out[o.key];
    return { name: h, value: o.key === 'ea' ? `${fx(r.head, 2)} m/s` : valueText(o, { ...r, value: r.head }), o };
  });
}
/**
 * The word heads' output of section sec: the phrases of its sentences, without the numbers and
 * their labels, and without the section's name ("Normal size and wall thickness").
 */
function wordsOf(V, sec) {
  const chunks = [];
  let cur = '';
  for (const [str, k] of reportOf(V)[sec].parts) {
    if (k === 'w') cur += str;
    else { chunks.push([cur, true]); cur = ''; }
  }
  chunks.push([cur, false]);
  const out = [];
  for (const [c, before] of chunks) {
    // a chunk before a number ends in the number's label: cut at its last mark ("(" has no label)
    let ph = c;
    if (before && !/\(\s*$/.test(c)) { const m = c.match(/^(.*)[;:,.]\s*[^;:,.]*$/s); ph = m ? m[1] : ''; }
    ph = ph.replace(/^[\s;:,.()]+|[\s;:,.()]+$/g, '').replace(/^[A-Z][a-z]+(?: [a-z]+)?: /, '').replace(/^with /, '');
    for (const q of ph.split(/(?<=\.)\s+/)) {
      const x = q.replace(/\.$/, '').trim();
      if (x.split(/\s+/).length >= 2) out.push(x.charAt(0).toUpperCase() + x.slice(1));
    }
  }
  return out;
}
/**
 * The box of the chosen section's heads, then their output: each number head and its value,
 * ringed where it anchors a caliper; then the words of the word heads in the serif, in the room
 * that the number heads leave at 11 px a line or more. Words that do not fit end in an ellipsis.
 */
function answerList(sh, t, b, sec, V) {
  const ctx = sh.ctx, C = palette(t);
  const bottom = caption(sh, t, b, ['one head per report task', 'one per task']);
  moduleBox(sh, t, b, [`${SECTIONS[sec].name} heads`, `${SEC_SHORT[sec]} heads`, SEC_SHORT[sec]], 'of ~150');
  const rows = headRows(sec, V), kO = F(10, MONO, 500), vO = F(10.5, MONO, 500), wO = F(11, SERIF, 400), wh = 14;
  const top = b.y + MODULE_H + 8, room = bottom - 4 - top;
  const words = wordsOf(V, sec).flatMap((w) => wrap(sh, `“${w}”`, b.w - 14, wO));
  const nW = clamp(Math.floor((room - rows.length * 11) / wh), 0, words.length);
  const lh = rows.length ? clamp((room - nW * wh) / rows.length, 11, 17) : 0;
  let y = top + 9;
  for (const r of rows) {
    if (y > bottom - 4) break;
    if (r.o) headRing(ctx, b.x + 5, y - 3.5, 3.6, C.head);
    sh.text(r.name, b.x + 14, y, { ...kO, color: t.ink2 });
    sh.text(r.value, b.x + b.w - 2, y, { ...vO, align: 'right', color: t.ink });
    y += lh;
  }
  y += rows.length ? 3 : 2;
  words.slice(0, nW).forEach((l, i) => {
    let str = l;
    if (i === nW - 1 && nW < words.length) {
      while (str.length > 1 && sh.measure(`${str}…`, wO) > b.w - 14) str = str.slice(0, -1);
      str = `${str.replace(/[\s,;“]+$/, '')}…`;
    }
    sh.text(str, b.x + 14, y, { ...wO, color: t.ink2 });
    y += wh;
  });
}
/** A column of ten heads for each section, the number heads marked, and a chip with one head's value (SHOW_GRIDS). */
function answerGrid(sh, t, b, sec, V, hits) {
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
      if (r < nh) headRing(ctx, x + s / 2, y + s / 2, s * 0.3, lit ? t.paper2 : t.ink3);
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

// 5 · Measure: a tile for each output, with its marks, name and value
const LAB1 = 29, LAB2 = 41;   // the label under a tile with its anchor check: name and value in one line, or in two
/**
 * Each tile's own anchor check under its value (miniAnchor): off, as step 6 shows the check, and
 * the images take its room. The code stays.
 */
const SHOW_TILE_CHECK = false;
/**
 * The label's height under a tile, in one line or in two, at each level. 0: the name and the value,
 * with the anchor check where SHOW_TILE_CHECK. 1, a short box: the name and the value. 2, the
 * shortest boxes: the value, with the name in the image's tag.
 */
const LABS = [SHOW_TILE_CHECK ? [LAB1, LAB2] : [17, 30], [17, 30], [17, 17]];
const IH_MIN = 24;            // px: the smallest image of a tile
const TILE_GX = 6, TILE_GY = 6;   // px between two tiles, across and down
const ASPECT = { b: 1.7, d: 2.0 }, COLS = { b: [5, 3, 9, 4], d: [4, 8, 3, 2] };
const ASPECT_MIN = { b: 1.4, d: 1.4 };   // the tallest shape of an image, where its box has the height
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
    const r = Math.ceil(list.length / c), gx = TILE_GX, gy = TILE_GY, w = (b.w - (c - 1) * gx) / c;
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
/**
 * The smaller image of the two bands in a flow's row of measurements h px tall: in one card w px
 * wide, the B-mode band at split of its height (bothBands), or in two cards w px wide each. 0
 * where a band holds no images of IH_MIN px with every name and value in its tile.
 */
function bandsAt(sh, w, h, merged, split, V) {
  const a = { x: 0, y: 0, w: w - 2 * IN, h: h - HEAD - 4 - 8 }, hb = (a.h - SEP) * split;
  const box = merged ? { b: { ...a, h: hb }, d: { ...a, h: a.h - SEP - hb } } : { b: a, d: a };
  let q = Infinity;
  for (const kind of ['b', 'd']) {
    const G = tileGrid(sh, box[kind], OUT.filter((o) => o.kind === kind), V, ASPECT[kind], COLS[kind], 0, true);
    if (!G.ok) return 0;
    q = Math.min(q, G.ih, G.w / ASPECT[kind]);
  }
  return q;
}
/** A band's tiles in box b, at label level. strict: in a view of two (tileGrid). clip: a box to keep them in. */
function measurePanel(sh, t, b, kind, sec, V, hits, level = 0, strict = false, clip = null) {
  const list = OUT.filter((o) => o.kind === kind), ctx = sh.ctx;
  const G = tileGrid(sh, b, list, V, ASPECT[kind], COLS[kind], level, strict);
  // the images take the height that the grid leaves in the box, up to ASPECT_MIN
  if (G.ok) G.ih = Math.max(G.ih, Math.min(G.w / ASPECT_MIN[kind], (b.h - (G.r - 1) * G.gy) / G.r - G.lab));
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
 * P: the card, where each band keeps its tiles in its part (a box too short for the bands).
 * split: the B-mode band's share of the height (a flow gives each band its own need).
 */
function bothBands(sh, t, b, sec, V, hits, level, P, split = 0.5) {
  const h = (b.h - SEP) * split, hd = b.h - SEP - h, ctx = sh.ctx;
  measurePanel(sh, t, { ...b, h }, 'b', sec, V, hits, level, true, P && { x: P.x - 2, y: b.y - 4, w: P.w + 4, h: h + 4 + SEP / 2 });
  ctx.save();
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(b.x, b.y + h + SEP / 2); ctx.lineTo(b.x + b.w, b.y + h + SEP / 2); ctx.stroke();
  ctx.restore();
  measurePanel(sh, t, { ...b, y: b.y + h + SEP, h: hd }, 'd', sec, V, hits, level, true, P && { x: P.x - 2, y: b.y + h + SEP / 2, w: P.w + 4, h: P.y + P.h + 2 - (b.y + h + SEP / 2) });
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
    for (const p of [f.ends[0], f.ends[1], ...(two ? [f.p2] : [])]) { const q = P(p); blob(ctx, q[0], q[1], sig, 0.6, TEAL_RGB); }
    // the caliper after the anchor: a teal line between two teal dots, over a dark line that
    // keeps it clear of bright tissue; with two peaks, the model's own end (between them) ringed
    const A = P(f.ends[0]), Bq = P(f.ends[1]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(8,10,12,0.6)';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.stroke();
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.stroke();
    for (const q of [A, Bq]) endDot(ctx, q[0], q[1]);
    if (two) {
      const e = f.two[o.m.two.end], q = P(e);
      ring(ctx, q[0], q[1], 3.6, TEAL);
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
  // the heat maps on the peaks, and their weighted centers as teal dots
  const sig = Math.max(2.4, (9 / DH) * bx.h);
  for (const p of Dd.points) {
    const q = regionOf(Dd, p), x = bx.x + (q[0] / DW) * bx.w, y = bx.y + (q[1] / DH) * bx.h;
    blob(ctx, x, y, sig, 0.65, TEAL_RGB);
    endDot(ctx, x, y);
  }
  ctx.restore();
  imgTag(sh, img, tag);
}
/**
 * Under a tile: the name, then the value (anchored: in the accent, after the caliper's own value
 * when there is room), in one line or in two; under them, where SHOW_TILE_CHECK, the anchor check.
 * At level 1 no check; at level 2 the value alone, as the name is in the image's tag (LABS).
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
    if (b.x + b.w - vw - 3 - sh.measure(was, wO) >= left) sh.text(was, b.x + b.w - vw - 3, vy, { ...wO, align: 'right', color: C.tealInk });
  }
  if (level === 0 && SHOW_TILE_CHECK) miniAnchor(sh.ctx, t, b.x + 2, vy + 10, b.w - 4, r);
}
/** The anchor check: the head's range and ring on a short scale, the caliper's dot. */
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
  headRing(ctx, X(r.head), y, 4, C.head);
  if (r.state === 'moved') {
    ring(ctx, X(r.cal), y, 3.4, C.tealInk);
    ctx.save();
    ctx.strokeStyle = C.tealInk;
    ctx.fillStyle = C.tealInk;
    ctx.lineWidth = 1;
    const a = X(r.cal) - 4.5, bb = X(r.value) + 5;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(bb + 3, y); ctx.stroke();
    arrowHead(ctx, bb, y, -1, 0, 4);
    ctx.restore();
  }
  if (r.state === 'flagged') dot(ctx, X(r.value), y, 2.4, t.flag);
  else calDot(ctx, t, X(r.value), y, 2.4);
}

// 6 · Anchor: a line for each output of the section
/** A legend glyph at (x, y), the baseline of its text: the head, the caliper, a second peak or a flag. */
function legendGlyph(ctx, t, g, x, y) {
  const C = palette(t);
  if (g === 'd' && SHOW_SCALES) headRing(ctx, x + 4, y - 3.5, 3.6, C.head);
  else if (g === 'd') {
    // the band of the heads' range, with its head line
    ctx.save();
    ctx.fillStyle = C.band;
    rrect(ctx, x, y - 8.5, 9, 10, 2);
    ctx.fill();
    ctx.strokeStyle = C.head;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(x + 4.5, y - 8.5); ctx.lineTo(x + 4.5, y + 1.5); ctx.stroke();
    ctx.restore();
  }
  else if (g === 'c') calDot(ctx, t, x + 4, y - 3.5, 2.8);
  else if (g === 'f') flagMark(ctx, x + 2, y, 8, t.flag);
  else ring(ctx, x + 4, y - 3.5, 3.4, C.tealInk);
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
      sh.text(was, right - w1 - 6, ty, { ...valO, align: 'right', color: C.tealInk });
      vw = w1 + 6 + sh.measure(was, valO);
    } else {
      const v = valueText(o, r), fw = r.state === 'flagged' ? 10 : 0;
      sh.text(v, right - fw, ty, { ...valO, align: 'right', color: r.state === 'flagged' ? t.flag : t.ink });
      if (fw) flagMark(ctx, right - 6, ty, 9, t.flag);
      vw = sh.measure(v, valO) + fw;
    }
    sh.text(fits(sh, [o.name, o.short], area.w - vw - 8, nameO) ?? o.short, area.x, ty, { ...nameO, color: t.ink });
    // the scale: the head's range and ring, the caliper's dot; a moved caliper ringed, with its arrow
    ctx.save();
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
    ctx.fillStyle = C.band;
    rrect(ctx, X(r.lo), y - 3.5, X(r.hi) - X(r.lo), 7, 2);
    ctx.fill();
    ctx.restore();
    headRing(ctx, X(r.head), y, 4.4, C.head);
    if (r.state === 'moved') {
      ring(ctx, X(r.cal), y, 3.8, C.tealInk);
      ctx.save();
      ctx.strokeStyle = C.tealInk;
      ctx.fillStyle = C.tealInk;
      ctx.lineWidth = 1;
      const a = X(r.cal) - 5, e = X(r.value) + 5.5;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(e + 3, y); ctx.stroke();
      arrowHead(ctx, e, y, -1, 0, 4);
      ctx.restore();
    }
    if (r.state === 'flagged') dot(ctx, X(r.value), y, 2.6, t.flag);
    else calDot(ctx, t, X(r.value), y, 2.6);
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
const BAND_LAB = 12;          // px over the anchor's lines: the label of its one band (SHOW_SCALES off)
/**
 * The widths of the anchor's name and value columns in a card w px wide inside. The values keep
 * their width, and the names give way to keep the scale 64 px long, down to the short names.
 */
function anchorColumns(sh, w, lines, V) {
  const nameO = F(11, SANS, 400), valO = F(11, MONO, 500);
  const valW = Math.max(...lines.map((o) => {
    const r = V.out[o.key];
    return sh.measure(r.state === 'moved' ? `${calText(r)} → ${valueText(o, r)}` : valueText(o, r), valO);
  })) + 8;
  const full = Math.max(...lines.map((o) => sh.measure(o.name, nameO))) + 12;
  const short = Math.max(...lines.map((o) => sh.measure(o.short, nameO))) + 8;
  const nameW = Math.min(w * 0.36, full, Math.max(w - valW - 10 - 64, short));
  return { nameW, valW };
}
/**
 * The height an anchor card w px wide needs for the most lines a section has (the LV's six, with
 * the septum's second peak where SHOW_TWO): its header, its lines in one row each (18 px) or two
 * (20 px), and its legend. roomy: 26 px a line, for a flow.
 */
function anchorNeed(sh, w, compact, roomy = false) {
  const V = valuesOf('normal', SHOW_TWO), lines = linesOf(0), bw = w - 2 * IN;
  const { nameW, valW } = anchorColumns(sh, bw, lines, V);
  const one = bw - nameW - valW - 10 >= 64;
  const rows = lines.length * (roomy ? 26 : one ? 18 : 20) + (one && !SHOW_SCALES ? BAND_LAB : 0);
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
  const lab = SHOW_SCALES ? 0 : BAND_LAB;
  const lh = clamp((area.h - lab) / Math.max(lines.length, 3), 18, 34);
  const nameO = F(11, SANS, 400), valO = F(11, MONO, 500);
  const { nameW, valW } = anchorColumns(sh, area.w, lines, V);
  const sx0 = area.x + nameW, sx1 = area.x + area.w - valW - 10, half = (sx1 - sx0) / 2, cx = (sx0 + sx1) / 2;
  // a narrow card: the name and the value in one line, the scale under them
  if (sx1 - sx0 < 64) { anchorRows(sh, t, area, lines, V); return; }
  // each line's scale is its head's value ± the span, the same for every line: one band (the
  // heads' range) and one head line serve them all, under a label (SHOW_SCALES: a scale a line)
  const span = SHOW_SCALES || SHOW_TWO ? SPAN : SPAN_BAND, y0 = area.y + lab;
  const Xn = (u) => cx + clamp(u / span, -1.05, 1.05) * half;
  if (!SHOW_SCALES) {
    ctx.save();
    ctx.fillStyle = C.band;
    rrect(ctx, Xn(-BAND), y0 + 2, Xn(BAND) - Xn(-BAND), lh * lines.length - 4, 3);
    ctx.fill();
    ctx.strokeStyle = C.head;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, y0 + 2); ctx.lineTo(cx, y0 + lh * lines.length - 2); ctx.stroke();
    ctx.restore();
    sh.text('head ± 10%', cx, area.y + 9, { ...F(8.5, MONO, 500), align: 'center', color: t.ink2 });
  }
  lines.forEach((o, i) => {
    const r = V.out[o.key], y = y0 + lh * (i + 0.5) + (SHOW_SCALES ? 2 : 0);
    const X = (v) => Xn(v / r.head - 1);
    const name = fits(sh, [o.name, o.short], nameW - 8, nameO) ?? o.short;
    sh.text(name, area.x, y + 4, { ...nameO, color: t.ink });
    if (SHOW_SCALES) {
      ctx.save();
      ctx.strokeStyle = t.rule;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx0, y); ctx.lineTo(sx1, y); ctx.stroke();
      ctx.fillStyle = C.band;
      rrect(ctx, X(r.lo), y - 6, X(r.hi) - X(r.lo), 12, 2);
      ctx.fill();
      ctx.restore();
      headRing(ctx, X(r.head), y, 6, C.head);
    }
    if (r.state === 'moved') {
      ring(ctx, X(r.cal), y, 5.5, C.tealInk);
      ctx.save();
      ctx.strokeStyle = C.tealInk;
      ctx.fillStyle = C.tealInk;
      ctx.lineWidth = 1.2;
      const a = X(r.cal) - 7, e = X(r.value) + 7;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(e + 4, y); ctx.stroke();
      arrowHead(ctx, e, y, -1, 0, 5);
      ctx.restore();
    }
    if (r.state === 'flagged') dot(ctx, X(r.value), y, 3.6, t.flag);
    else calDot(ctx, t, X(r.value), y, 3.6);
    const vx = area.x + area.w;
    if (r.state === 'moved') {
      const v = valueText(o, r), vw = sh.measure(v, { ...valO, weight: 600 });
      sh.text(v, vx, y + 4, { ...valO, weight: 600, align: 'right', color: t.accent });
      sh.text(`${calText(r)} →`, vx - vw - 7, y + 4, { ...valO, align: 'right', color: C.tealInk });
    } else {
      const v = valueText(o, r);
      sh.text(v, vx - (r.state === 'flagged' ? 10 : 0), y + 4, { ...valO, align: 'right', color: r.state === 'flagged' ? t.flag : t.ink });
      if (r.state === 'flagged') flagMark(ctx, vx - 6, y + 4, 9, t.flag);
    }
  });
}

// 7 · Report: the sentences, EchoPrime's words in the serif, the measured numbers in blue
const REPORT_KEYS = [['serif: ', 'EchoPrime heads', F(11, SERIF, 400)], ['blue: ', 'measured, then anchored', F(10, MONO, 500)]];
/**
 * Where the report's legend goes in a card w px wide, bw inside: at the right of the header where
 * it fits there (foot 0), else at the foot in one line (20 px) or one item a line (34 px). With
 * row (the three rows), a compact header takes it in one line at its right, in place of the
 * subtitle.
 */
function reportPlan(sh, w, bw, compact, row = false) {
  const lo = F(10, SANS, 400), widths = REPORT_KEYS.map(([k, s, kO]) => sh.measure(k, kO) + sh.measure(s, lo));
  const titleW = sh.measure('Report', F(18.5, SERIF)) + 44, capsW = 190;
  if (!compact && w - Math.max(titleW, capsW) - Math.max(...widths) >= 36) return { beside: true, widths, foot: 0 };
  const one = widths[0] + 14 + widths[1] <= bw + 2;
  if (row && compact && one && bw - 20 - sh.measure('Report', F(16, SERIF)) - (widths[0] + 14 + widths[1]) >= 24) return { beside: true, row: true, one, widths, foot: 0 };
  return { beside: false, one, widths, foot: one ? 20 : 34 };
}
/** The report's legend (reportPlan). Returns the room it takes at the foot. */
function reportLegend(sh, t, P, b, compact, row = false) {
  const lo = F(10, SANS, 400), L = reportPlan(sh, P.w, b.w, compact, row), colors = [t.ink2, t.accent];
  REPORT_KEYS.forEach(([k, s, kO], i) => {
    const right = P.x + P.w - IN;
    const x = L.row ? right - L.widths[1] - (i ? 0 : L.widths[0] + 14) : L.beside ? right - L.widths[i] : L.one && i ? b.x + L.widths[0] + 14 : b.x;
    const y = L.row ? P.y + 20 : L.beside ? P.y + 19 + i * 15 : b.y + b.h - 3 - (L.one || i ? 0 : 14);
    sh.text(k, x, y, { ...kO, color: colors[i] });
    sh.text(s, x + sh.measure(k, kO), y, { ...lo, color: t.ink3 });
  });
  return L.foot;
}
/**
 * The words of each part of report R in lines area.w px wide, at ws px: words break at spaces, a
 * number with its unit stays whole, and a value flagged for review takes its flag's room too.
 * Numbers are 1 px smaller, in the mono face.
 */
function reportLines(sh, area, R, ws) {
  const wO = F(ws, SERIF, 400), nO = F(ws - 1, MONO, 500), lh = Math.round(ws * 1.32);
  const items = [], space = sh.measure(' ', wO);
  let x = area.x, y = 0;
  for (const S of R) {
    for (const [text, kind] of S.parts) {
      const o = kind === 'w' ? wO : nO;
      const toks = kind === 'w' ? text.split(/(\s+)/).filter((q) => q.length) : [text];
      for (const tok of toks) {
        if (/^\s+$/.test(tok)) { x += space; continue; }
        const w = sh.measure(tok, o) + (kind === 'f' ? 10 : 0);
        if (x + w > area.x + area.w + 0.5 && x > area.x) { x = area.x; y += lh; }
        items.push({ tok, x, y, w, o, kind, sec: S.sec });
        x += w;
      }
    }
    x += space;
  }
  return { items, lh, rows: Math.round(y / lh) + 1, ws, space };
}
function reportPanel(sh, t, P, b, sec, V, hits, compact, row = false) {
  const ctx = sh.ctx, C = palette(t), R = reportOf(V);
  const foot = reportLegend(sh, t, P, b, compact, row);
  const area = { x: b.x, y: b.y - 2, w: b.w, h: b.h - foot + 2 };
  // the words of each part, laid out in lines; a section's sentence lit. The largest type whose
  // lines all fit; numbers 1 px smaller in the mono face, never under 9.5 px
  let lay = null;
  for (const ws of [14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5]) {
    lay = reportLines(sh, area, R, ws);
    if (lay.rows * lay.lh <= area.h) break;
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
    headRing(ctx, cx - w2 / 2 + 4, ym - 8, 3.6, t.accent);
    sh.text(s2, cx - w2 / 2 + 12, ym - 4.5, { ...lo, color: t.accent });
  }
}

/**
 * The arrows of the figure without tabs: from each step to the next, in a gutter or down to the
 * next row; and over the measurements, the sort's link to the B-mode band and the number heads'
 * link to both bands, with their labels (linkPlan).
 */
function arrows(sh, t, L) {
  const ctx = sh.ctx, K = L.link, y0 = K.y0 + 3, y1 = K.y1 - 3, ym = K.y0 + 16;
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.fillStyle = t.accent;
  ctx.lineWidth = 1.4;
  const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  for (const a of L.arrows) {
    if (a.y0 === undefined) { line([[a.x + 2, a.y], [a.x + 6, a.y]]); arrowHead(ctx, a.x + GAP - 2, a.y, 1, 0, 5); }
    else { line([[a.x, a.y0 + 2], [a.x, a.y1 - 6]]); arrowHead(ctx, a.x, a.y1 - 1, 0, 1, 6); }
  }
  // the sort's link: straight down, or from the sort's side down the lane and across
  if (K.lane !== null) line([[K.from1.x, K.from1.y], [K.lane, K.from1.y], [K.lane, ym], [K.x1, ym], [K.x1, y1 - 5]]);
  else line([[K.x1, y0], [K.x1, y1 - 5]]);
  arrowHead(ctx, K.x1, y1, 0, 1, 6);
  // the number heads' link: down from step 4, with its branch to the B-mode band
  line([[K.x4, y0], [K.x4, y1 - 5]]);
  arrowHead(ctx, K.x4, y1, 0, 1, 6);
  if (K.xb !== null) { line([[K.x4, ym], [K.xb, ym], [K.xb, y1 - 5]]); arrowHead(ctx, K.xb, y1, 0, 1, 6); }
  ctx.restore();
  sh.text(K.s1, K.x1 + 9, ym + 4, { ...F(11, SANS, 400), color: t.ink2 });
  const yb = K.at === 'branch' ? ym - 4.5 : K.at === 1 ? ym + 4 : ym + 20;
  headRing(ctx, K.l2x + 4, yb - 3.5, 3.6, t.accent);
  sh.text(K.s2, K.l2x + 12, yb, { ...F(11, MONO, 500), color: t.accent });
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
  headRing(ctx, x2 + 4, y2 - 4, 3.6, t.accent);
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
 * Draw the figure for state S: { sec, step (0 none, 1 to 7), two, row, heart, boxH } on sheet sh
 * with tokens t. boxH: the height of the box that shows the sheet, which can be shorter than the
 * sheet (the box scrolls). F1.video(ctx, i, x, y, w, h) draws video i of the study (ch/ai.js).
 * Returns the layout and the hit boxes (a section, or a view of the figure with tabs).
 */
export function drawFigure(sh, t, S, F1) {
  const L = layoutOf(sh.w, S.boxH ?? sh.h, S.row, sh), hits = [], V = valuesOf(S.heart, S.two);
  const lit = (k) => S.step === Math.floor(k) || (k === 5.5 && S.step === 5);
  const rows = { top: 0, h: 0 }, level = L.level || 0, ctx = sh.ctx;
  // compact headers: per card without tabs, for every card of the view with tabs
  const compact = (k) => (typeof L.compact === 'object' ? !!L.compact[k] : !!L.compact);
  for (const k of [1, 2, 3, 4, 5, 5.5, 6, 7]) {
    const P = L.P[k];
    if (!P) continue;
    // in a box too short for the measurements, each card keeps its drawing inside it. The clip
    // lies 2 px outside the card, clear of its frame and of the next card (8 px or more away)
    const clip = L.clip && k >= 5 ? { x: P.x - 2, y: P.y - 2, w: P.w + 4, h: P.h + 4 } : null;
    if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
    const b = card(sh, t, P, k, lit(k), compact(k), k === 5 && L.merged, !!L.fit);
    if (k === 1) sortPanel(sh, t, b, F1);
    else if (k === 2) (SHOW_GRIDS ? encodeGrid : encodeRows)(sh, t, b, V.heart, rows, S.sec);
    else if (k === 3) (SHOW_GRIDS ? weighGrid : SHOW_LINES ? weighLines : weighShare)(sh, t, b, S.sec, hits);
    else if (k === 4) { if (SHOW_GRIDS) answerGrid(sh, t, b, S.sec, V, hits); else answerList(sh, t, b, S.sec, V); }
    else if (k === 5 && L.merged) bothBands(sh, t, b, S.sec, V, hits, level, clip ? P : null, L.split);
    else if (k === 5 || k === 5.5) measurePanel(sh, t, b, k === 5 ? 'b' : 'd', S.sec, V, hits, level, !L.old, clip);
    else if (k === 6) anchorPanel(sh, t, b, S.sec, V, b.head);
    else reportPanel(sh, t, P, b, S.sec, V, hits, compact(k), !!L.fit);
    if (clip) ctx.restore();
  }
  if (L.tabs) {
    tabsOf(sh, t, L, hits);
    if (L.foot) linkNotes(sh, t, L.foot);
  } else if (L.old) links(sh, t, L);
  else arrows(sh, t, L);
  return { L, hits };
}
