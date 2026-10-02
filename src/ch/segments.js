// 09 Segments: regional wall motion. The 17-segment model as a bull's-eye and as the three
// apical views that show it. The buttons on the figure occlude the LAD, RCA or circumflex and
// set the motion of its territory; each segment can also be scored by hand: tap it on the
// bull's-eye or on an apical view.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, RR } from '../cyclemodel.js';
import { loadModel } from '../model3d.js';
import { TERRITORY, segmentOf, apicalTurn } from '../aha.js';

export const SEG_NAMES = ['basal anterior', 'basal anteroseptal', 'basal inferoseptal', 'basal inferior', 'basal inferolateral', 'basal anterolateral',
  'mid anterior', 'mid anteroseptal', 'mid inferoseptal', 'mid inferior', 'mid inferolateral', 'mid anterolateral',
  'apical anterior', 'apical septal', 'apical inferior', 'apical lateral', 'apex'];
// Standard AHA assignment (Javadi 2010, Figure 2; aha.js); supply varies between patients.
export { TERRITORY };
const ANAME = { lad: 'left anterior descending', rca: 'right coronary', lcx: 'circumflex' };
// Segments along each apical view, screen-left base to apex to screen-right base (Lang 2015, Figure 4).
const VIEWS = {
  A4C: { left: [3, 9, 14], right: [6, 12, 16], lname: 'inferoseptal', rname: 'anterolateral' },
  A2C: { left: [4, 10, 15], right: [1, 7, 13], lname: 'inferior', rname: 'anterior' },
  A3C: { left: [5, 11, 16], right: [2, 8, 14], lname: 'inferolateral', rname: 'anteroseptal' },
};
const WM = { 1: 'normal', 2: 'hypokinetic', 3: 'akinetic', 4: 'dyskinetic' };
const EXC = { 1: 1, 2: 0.45, 3: 0, 4: -0.35 };   // inward motion in systole, as a fraction of normal

// The scores live in one state key, `segs`: 17 digits, segment 1 first. A preset (an artery
// and a score) writes its territory; a tap on a segment moves it on to the next score.
const preset = (culprit, wm) => {
  const a = Array(17).fill(1);
  if (TERRITORY[culprit]) for (const k of TERRITORY[culprit]) a[k - 1] = wm;
  return a.join('');
};
const parse = (segs) => {
  const sc = Array(18).fill(1);
  for (let k = 1; k <= 17; k++) sc[k] = clamp(Number(segs?.[k - 1]) || 1, 1, 4);
  return sc;
};
/** The preset a pattern matches: { culprit, wm }, or culprit 'custom'. */
function match(segs) {
  if (segs === preset('none')) return { culprit: 'none' };
  for (const c of Object.keys(TERRITORY)) for (const w of [2, 3, 4]) if (segs === preset(c, w)) return { culprit: c, wm: w };
  return { culprit: 'custom' };
}

export function scores(s) {
  const sc = parse(s.segs);
  const sixteen = sc.slice(1, 17);
  return { sc, wmsi: sixteen.reduce((a, b) => a + b, 0) / 16, abnormal: sixteen.filter((x) => x > 1).length };
}

let sheet = null, st = null, setState = null, clock = 0, hover = 0;
let layout = null;   // where the last frame put the bull's-eye and the apical walls, for taps

// ---------------------------------------------------------------- the apical views as echo
// The three views are scanner frames cut from the heart model. Each myocardial vertex belongs to
// an AHA segment, by its level along the LV long axis and its angle round it; its motion in
// systole is scaled by that segment's score. Until the model is in, line drawings stand in.
const ECHO = [['A4C', 'a4c'], ['A2C', 'a2c'], ['A3C', 'a3c']];
let echo = null;

/**
 * Each LV vertex's segments (the neighbourhood is sampled, so borders blend), and where to put
 * the segment numbers in each view. Angles are turned so that the model's own apical planes
 * fall on the standard walls: the four-chamber septal wall at 210 degrees (inferoseptal), the
 * two-chamber at 270 (inferior), the three-chamber at 330 (inferolateral).
 */
export function segmentMap(m, geoms) {
  const mesh = m.heart.meshes.Myocardium;
  mesh.updateMatrixWorld(true);
  const e = mesh.matrixWorld.elements, P = mesh.geometry.attributes.position, C = mesh.geometry.attributes.color;
  // a vertex keeps its segment whatever heart is shown: found on the normal heart
  const A = m.anat.normal(), ax = A.axis, la = A.lateral, an = A.anterior;
  const apex = A.point('apex_endo', 0, 0), L = A.point('mv', 0, 0).sub(apex).dot(ax);
  const turn = apicalTurn(A, geoms);
  const n = P.count, H = new Float32Array(n), TH = new Float32Array(n), R = new Float32Array(n), REG = new Uint8Array(n), X = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const x0 = P.getX(i), y0 = P.getY(i), z0 = P.getZ(i);
    const x = e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12], y = e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13], z = e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14];
    X[3 * i] = x; X[3 * i + 1] = y; X[3 * i + 2] = z;
    const qx = x - apex.x, qy = y - apex.y, qz = z - apex.z;
    const h = qx * ax.x + qy * ax.y + qz * ax.z;
    const rx = qx - h * ax.x, ry = qy - h * ax.y, rz = qz - h * ax.z;
    H[i] = h / L;
    R[i] = Math.hypot(rx, ry, rz);
    TH[i] = (Math.atan2(rx * an.x + ry * an.y + rz * an.z, rx * la.x + ry * la.y + rz * la.z) * 180) / Math.PI + turn;
    REG[i] = C ? Math.round(C.getX(i) * 10) : 1;      // 1 LV, 2 RV (anatomy.json regions)
  }
  // the LV's outer radius by level: the septum's RV face lies inside it, the RV free wall outside
  const NB = 24, rOut = new Float32Array(NB), lists = Array.from({ length: NB }, () => []);
  const bin = (h) => Math.floor(clamp(h, 0, 0.999) * NB);
  for (let i = 0; i < n; i++) if (REG[i] === 1) lists[bin(H[i])].push(R[i]);
  lists.forEach((l, b) => { l.sort((p, q) => p - q); rOut[b] = l.length ? l[Math.floor(l.length * 0.9)] : 3; });
  const mem = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const wall = REG[i] === 1 || (REG[i] === 2 && R[i] < rOut[bin(H[i])] + 0.4);
    if (!wall || H[i] > 1.06) continue;
    const cnt = new Map();
    for (const dh of [-0.04, 0, 0.04]) for (const dt of [-8, 0, 8]) { const s = segmentOf(H[i] + dh, TH[i] + dt); cnt.set(s, (cnt.get(s) || 0) + 1); }
    mem[i] = [...cnt.entries()];
  }
  // the pericardium moves with the wall under it: each of its vertices takes the scale of the
  // nearest LV wall vertex within 1.5 cm (a grid of 1.5 cm cells keeps the search short)
  let near = null;
  const pm = m.heart.meshes.Pericardium;
  if (pm) {
    pm.updateMatrixWorld(true);
    const f = pm.matrixWorld.elements, Q = pm.geometry.attributes.position, G = 1.5, grid = new Map();
    const cellKey = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
    for (let i = 0; i < n; i++) {
      if (!mem[i]) continue;
      const k = cellKey(X[3 * i], X[3 * i + 1], X[3 * i + 2]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
    near = new Int32Array(Q.count).fill(-1);
    for (let j = 0; j < Q.count; j++) {
      const x0 = Q.getX(j), y0 = Q.getY(j), z0 = Q.getZ(j);
      const x = f[0] * x0 + f[4] * y0 + f[8] * z0 + f[12], y = f[1] * x0 + f[5] * y0 + f[9] * z0 + f[13], z = f[2] * x0 + f[6] * y0 + f[10] * z0 + f[14];
      const cx = Math.floor(x / G), cy = Math.floor(y / G), cz = Math.floor(z / G);
      let best = -1, bd = G * G;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        for (const i of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) {
          const d = (X[3 * i] - x) ** 2 + (X[3 * i + 1] - y) ** 2 + (X[3 * i + 2] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      near[j] = best;
    }
  }
  return { mem, turn, near };
}

/**
 * Where the segment numbers sit in each view (geoms: the planes of the heart shown): on its two
 * walls at the basal, mid and apical levels, and at the apex, in the middle of the wall of the
 * heart shown at end-diastole.
 */
export function segmentLabels(m, map, geoms) {
  const mesh = m.heart.meshes.Myocardium, geo = mesh.geometry, P = geo.attributes.position, C = geo.attributes.color;
  const e = mesh.matrixWorld.elements;
  const A = m.anat, ax = A.axis, la = A.lateral, an = A.anterior;
  const apex = A.point('apex_endo', 0, 0), L = A.point('mv', 0, 0).sub(apex).dot(ax);
  const flat = (v) => v.clone().addScaledVector(ax, -v.dot(ax)).normalize();
  const angle = (v) => (Math.atan2(v.dot(an), v.dot(la)) * 180) / Math.PI;
  // end-diastole of the heart shown: the amyloid burden, or a disease heart's own shape
  const ph = m.pheno, dict = mesh.morphTargetDictionary || {}, MP = geo.morphAttributes.position || [];
  const use = [[dict.amyloid, ph.a], [ph.mesh ? dict[`ph_${ph.mesh}`] : undefined, 1]].filter(([k, w]) => k !== undefined && MP[k] && w);
  const NB = 24, lists = Array.from({ length: NB }, () => []);
  const bin = (h) => Math.floor(clamp(h, 0, 0.999) * NB);
  for (let i = 0; i < P.count; i++) {
    if (C && Math.round(C.getX(i) * 10) !== 1) continue;
    let x0 = P.getX(i), y0 = P.getY(i), z0 = P.getZ(i);
    for (const [k, w] of use) { x0 += w * MP[k].getX(i); y0 += w * MP[k].getY(i); z0 += w * MP[k].getZ(i); }
    const x = e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12], y = e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13], z = e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14];
    const qx = x - apex.x, qy = y - apex.y, qz = z - apex.z;
    const h = qx * ax.x + qy * ax.y + qz * ax.z;
    lists[bin(h / L)].push(Math.hypot(qx - h * ax.x, qy - h * ax.y, qz - h * ax.z));
  }
  for (const l of lists) l.sort((p, q) => p - q);
  // the middle of the wall by level: the median distance of the LV's vertices from the axis
  const rMid = (h) => { const l = lists[bin(h)]; return l.length ? l[Math.floor(l.length * 0.5)] : 2.5; };
  const labels = {};
  for (const [k, g] of Object.entries(geoms)) {
    const out = [];
    for (const side of [-1, 1]) {
      const dir = flat(g.r.clone().multiplyScalar(side));
      const th = angle(dir) + map.turn;
      for (const h of [0.83, 0.51, 0.21]) out.push({ k: segmentOf(h, th), p: apex.clone().addScaledVector(ax, h * L).addScaledVector(dir, rMid(h)) });
    }
    out.push({ k: 17, p: apex.clone().addScaledVector(ax, -0.45) });
    labels[k] = out;
  }
  return labels;
}

/** Per-vertex scale on the systolic motion for the scores sc[1..17]. */
export function regionalScale(map, sc) {
  const out = new Float32Array(map.mem.length).fill(1);
  map.mem.forEach((mm, i) => {
    if (!mm) return;
    let a = 0, w = 0;
    for (const [s, c] of mm) { a += c * EXC[sc[s]]; w += c; }
    out[i] = a / w;
  });
  return out;
}
/** The same for the pericardium: each vertex follows the LV wall vertex nearest to it. */
export function periScale(map, scale) {
  if (!map.near) return null;
  return Float32Array.from(map.near, (i) => (i >= 0 ? scale[i] : 1));
}

async function startEcho() {
  if (echo) return;
  echo = { loading: true };
  try {
    const [m, E] = await Promise.all([loadModel(), import('../echo.js')]);
    const map = segmentMap(m, Object.fromEntries(ECHO.map(([, k]) => [k, E.viewGeometry(m.anat.normal(), k)])));
    const views = ECHO.map(([name, key]) => {
      const canvas = document.createElement('canvas');
      const ev = new E.EchoView(m, canvas, { offscreen: true, width: 240, height: 200 });
      ev.depth = 15;                     // closer than the standard views: the LV fills more
      ev.noSys = true;                   // the scores set the wall motion, not the heart's own change
      ev.setView(key, { animate: false });
      return { name, key, ev, canvas, fresh: false };
    });
    echo = { m, E, map, views, next: 0, segs: '', pv: -1, labels: {} };
    if (sheet) sheet.dirty = true;
  } catch (e) {
    echo = { failed: true };
  }
}

/** The scores onto the model; a view that is stale is drawn again. */
function syncEcho() {
  if (!echo || !echo.views) return;
  if (echo.pv !== echo.m.pheno.version) {
    // a new heart: the numbers move to its walls, and every view is cut again
    echo.pv = echo.m.pheno.version;
    echo.labels = segmentLabels(echo.m, echo.map, Object.fromEntries(ECHO.map(([, k]) => [k, echo.E.viewGeometry(echo.m.anat, k)])));
    for (const v of echo.views) v.fresh = false;
  }
  if (echo.segs === st.segs) return;
  const scale = regionalScale(echo.map, parse(st.segs)), ps = periScale(echo.map, scale);
  for (const v of echo.views) { v.ev.setRegional(scale, ps); v.fresh = false; }
  echo.segs = st.segs;
}

function renderView(v) {
  const c = cycleAt(reducedMotion ? 330 : (clock * 1000) % RR);
  v.ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  v.fresh = true;
}

/** One apical view as a scanner frame in box, with the segment numbers on its walls. */
function echoView(sh, t, box, v, sc) {
  const ctx = sh.ctx;
  const w = Math.max(60, Math.round(box.w)), h = Math.max(60, Math.round(box.h));
  if (v.ev.w !== w || v.ev.h !== h) { v.ev.setSize(w, h); v.fresh = false; }
  if (!v.fresh) renderView(v);
  ctx.drawImage(v.canvas, box.x, box.y, w, h);
  const mp = v.ev.map, g = v.ev.g, spec = VIEWS[v.name];
  if (!mp || !g) return;
  ctx.save();
  ctx.font = `600 ${w < 200 ? 9.5 : 11}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { k, p } of echo.labels[v.key] || []) {
    const [u, vv] = v.ev.toPlane(p, g);
    const x = box.x + mp.X(u), y = box.y + mp.Y(vv);
    if (x < box.x + 6 || x > box.x + w - 6 || y < box.y + 6 || y > box.y + h - 6) continue;
    const s = sc[k], r = w < 200 ? 7 : 8.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = s === 1 ? 'rgba(16,19,21,0.55)' : s === 2 ? '#f0b27a' : '#ff6b5b';
    ctx.fill();
    if (k === hover || s === 4) { ctx.lineWidth = s === 4 ? 2 : 1.5; ctx.strokeStyle = k === hover ? '#ffffff' : '#ffe89a'; ctx.stroke(); }
    ctx.fillStyle = s === 1 ? '#ffe89a' : '#101315';
    ctx.fillText(String(k), x, y + 0.5);
    if (layout) layout.walls.push({ x, y, seg: k });
  }
  ctx.restore();
  sh.text(v.name, box.x + 4, box.y + 16, { size: w < 200 ? 15 : 19, color: t.ink });
  if (w < 200) return;
  // the walls, left of the sector's edge and its segment numbers: on one line, or one wall a
  // line, or not at all
  const o = { family: SANS, weight: 400, size: 10.5, color: t.ink3 }, both = `${spec.lname} · ${spec.rname}`;
  const room = (yb) => mp.cx - Math.max(0, yb + 3 - mp.top) * Math.tan(mp.half) - 14;
  if (sh.fit([both, ''], room(32), o, 1).str === both) sh.text(both, box.x + 4, box.y + 32, o);
  else {
    const a = sh.fit([spec.lname, ''], room(32), o, 0.85), b = sh.fit([spec.rname, ''], room(45), o, 0.85);
    const size = Math.min(a.size, b.size);
    if (a.str && b.str) { sh.text(a.str, box.x + 4, box.y + 32, { ...o, size }); sh.text(b.str, box.x + 4, box.y + 45, { ...o, size }); }
  }
}

function fillFor(t, score) {
  return score === 1 ? null : score === 2 ? t.flag2 : t.flag;
}

function bullseye(sh, t, cx, cy, R, sc, small = false, over = null) {
  const ctx = sh.ctx;
  // a small map: the apical ring's numbers sit a quarter radius from the centre, so the type
  // shrinks to keep them off the 17
  const num = small ? clamp((0.25 * R - 1) / 1.2, 7.5, 9.5) : 11;
  const names = [];
  const rings = [
    { r0: 0.66, r1: 1, segs: [1, 2, 3, 4, 5, 6], a0: 60, n: 6 },
    { r0: 0.36, r1: 0.66, segs: [7, 8, 9, 10, 11, 12], a0: 60, n: 6 },
    { r0: 0.14, r1: 0.36, segs: [13, 14, 15, 16], a0: 45, n: 4 },
  ];
  // anterior at the top, septum on the left, lateral on the right; angles counterclockwise
  const wedge = (r0, r1, a, b) => {
    const p = new Path2D();
    const A = (-a * Math.PI) / 180, B = (-b * Math.PI) / 180;
    p.arc(cx, cy, r1 * R, A, B, true);
    p.arc(cx, cy, r0 * R, B, A, false);
    p.closePath();
    return p;
  };
  for (const ring of rings) {
    const step = 360 / ring.n;
    ring.segs.forEach((seg, i) => {
      // segment 1 (or 13) centered at the top, then counterclockwise
      const mid = 90 + i * step;
      const p = wedge(ring.r0, ring.r1, mid - step / 2, mid + step / 2);
      const f = fillFor(t, sc[seg]);
      if (f) {
        ctx.save();
        ctx.fillStyle = f;
        ctx.globalAlpha = sc[seg] === 4 ? 0.95 : 0.75;
        ctx.fill(p);
        ctx.restore();
        if (sc[seg] === 4) sh.hatch(p, 0.8, 4, t.ink, 0.8, seg, 0.5);
      }
      ctx.save();
      ctx.strokeStyle = seg === hover ? t.accent : t.ink;
      ctx.lineWidth = seg === hover ? 2.5 : 1;
      ctx.stroke(p);
      ctx.restore();
      const am = (mid * Math.PI) / 180, rm = ((ring.r0 + ring.r1) / 2) * R;
      names.push([String(seg), cx + Math.cos(am) * rm, cy - Math.sin(am) * rm + num * 0.36]);
    });
  }
  const cap = new Path2D();
  cap.arc(cx, cy, 0.14 * R, 0, Math.PI * 2);
  const f = fillFor(t, sc[17]);
  if (f) { ctx.save(); ctx.fillStyle = f; ctx.globalAlpha = 0.75; ctx.fill(cap); ctx.restore(); }
  ctx.save(); ctx.strokeStyle = hover === 17 ? t.accent : t.ink; ctx.lineWidth = hover === 17 ? 2.5 : 1; ctx.stroke(cap); ctx.restore();
  names.push(['17', cx, cy + num * 0.36]);
  // whatever is drawn over the map (the arteries) goes under the numbers, so they stay legible
  if (over) over();
  for (const [str, x, y] of names) {
    ctx.save();
    ctx.font = `500 ${num}px ${MONO}`;
    const w = ctx.measureText(str).width;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = t.paper;
    if (over) ctx.fillRect(x - w / 2 - 1, y - num * 0.8, w + 2, num);
    ctx.restore();
    sh.text(str, x, y, { family: MONO, weight: 500, size: num, align: 'center', color: t.ink });
  }
  // orientation
  const fs = small ? 12 : 16;
  sh.text(small ? 'ant' : 'anterior', cx, cy - R - (small ? 5 : 10), { size: fs, align: 'center', color: t.ink2 });
  sh.text(small ? 'inf' : 'inferior', cx, cy + R + (small ? 13 : 22), { size: fs, align: 'center', color: t.ink2 });
  sh.text(small ? 'sept' : 'septal', cx - R - (small ? 4 : 8), cy + 5, { size: fs, align: 'right', color: t.ink2 });
  sh.text(small ? 'lat' : 'lateral', cx + R + (small ? 9 : 16), cy + 5, { size: fs, color: t.ink2 });
}

// The coronary arteries on the bull's-eye, schematic: the apex at the centre, the base at the
// rim, so a vessel that runs from the base to the apex is a line toward the centre. Points are
// [radius as a fraction of R, angle in degrees, counterclockwise from lateral]. The LAD runs in
// the anterior interventricular groove (between segments 1 and 2) and round the apex, with a
// diagonal over the anterior wall; the RCA comes to the crux in the right atrioventricular
// groove and runs on as the posterior descending artery (between segments 3 and 4); the
// circumflex runs round the lateral wall in the left atrioventricular groove, with obtuse
// marginal branches over it.
const COURSE = {
  lad: { name: 'LAD', main: [[1.16, 120], [0.66, 120], [0.36, 119], [0.14, 116], [0, 116], [0, 300], [0.13, 300]], branches: [[[0.8, 120], [0.55, 96], [0.42, 76]]], block: [1.02, 120], label: [1.3, 128] },
  rca: { name: 'RCA', main: [[1.16, 190], [1.1, 215], [1.08, 240], [0.66, 240], [0.36, 240], [0.22, 240]], branches: [], block: [1.11, 207], label: [1.32, 210] },
  lcx: { name: 'LCX', main: [[1.17, 77], [1.08, 62], [1.08, 20], [1.08, -20], [1.08, -58]], branches: [[[1.08, 20], [0.66, 8], [0.38, 2]], [[1.08, -20], [0.66, -27], [0.42, -32]]], block: [1.12, 70], label: [1.32, 52] },
};
const toXY = ([r, a], cx, cy, R) => [cx + Math.cos((a * Math.PI) / 180) * r * R, cy - Math.sin((a * Math.PI) / 180) * r * R];

/** Sample a polar path into screen points, so that a run at one radius follows the circle. */
function polar(pts, cx, cy, R) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, a0] = pts[i], [r1, a1] = pts[i + 1];
    // a step every 4 degrees round and every 0.05 R across; none to spin on the spot at the apex
    const n = r0 === 0 && r1 === 0 ? 1 : Math.max(2, Math.ceil(Math.abs(a1 - a0) / 4), Math.ceil(Math.abs(r1 - r0) / 0.05));
    for (let j = i ? 1 : 0; j <= n; j++) {
      const u = j / n, r = r0 + (r1 - r0) * u, a = ((a0 + (a1 - a0) * u) * Math.PI) / 180;
      out.push([cx + Math.cos(a) * r * R, cy - Math.sin(a) * r * R]);
    }
  }
  return out;
}

/** The arteries: all faint, the occluded one dark, with a bar at the block and dashes beyond. */
function arteries(sh, t, cx, cy, R, culprit, small) {
  const ctx = sh.ctx;
  const lw = small ? 1.8 : 2.6;
  const stroke = (pts, color, width, dash, halo) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (halo) { ctx.strokeStyle = t.paper; ctx.lineWidth = width + 3; ctx.stroke(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  };
  for (const [key, c] of Object.entries(COURSE)) {
    const on = key === culprit;
    if (!on && small) continue;
    const main = polar(c.main, cx, cy, R);
    if (!on) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      stroke(main, t.ink3, lw * 0.6);
      for (const b of c.branches) stroke(polar(b, cx, cy, R), t.ink3, lw * 0.45);
      ctx.restore();
      const [lr, la] = c.label, a = (la * Math.PI) / 180;
      sh.text(c.name, cx + Math.cos(a) * lr * R, cy - Math.sin(a) * lr * R + 4, { family: SANS, weight: 500, size: small ? 9.5 : 11, align: 'center', color: t.ink3 });
      continue;
    }
    // flow stops at the block: solid before it, dashed after it
    const [qx, qy] = toXY(c.block, cx, cy, R);
    let k = 1;
    main.forEach(([x, y], i) => { if (i && i < main.length - 1 && Math.hypot(x - qx, y - qy) < Math.hypot(main[k][0] - qx, main[k][1] - qy)) k = i; });
    const dash = small ? [4, 3] : [6, 4];
    stroke(main.slice(0, k + 1), t.ink, lw, null, true);
    stroke(main.slice(k), t.ink, lw, dash, true);
    for (const b of c.branches) stroke(polar(b, cx, cy, R), t.ink, lw * 0.75, dash, true);
    const [x0, y0] = main[k - 1], [x1, y1] = main[k + 1] || main[k];
    const d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d, ny = (x1 - x0) / d, L = small ? 6 : 9;
    const [bx, by] = main[k];
    stroke([[bx - nx * L, by - ny * L], [bx + nx * L, by + ny * L]], t.flag, small ? 3 : 4, null, true);
    const [lr, la] = c.label, a = (la * Math.PI) / 180;
    sh.text(c.name, cx + Math.cos(a) * lr * R, cy - Math.sin(a) * lr * R + 4, { family: SANS, weight: 700, size: small ? 11 : 13, align: 'center', color: t.ink });
  }
}

function apicalView(sh, t, box, name, sc, sys) {
  const ctx = sh.ctx;
  const v = VIEWS[name];
  const { x, y, w, h } = box;
  const cx = x + w / 2, top = y + 14, len = h - 64, half = Math.min(w * 0.34, len * 0.42);
  // endocardium: from the left base up to the apex and down to the right base
  const N = 36;
  const side = (sign, segs) => {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;                            // 0 base .. 1 apex
      const seg = u < 0.36 ? segs[0] : u < 0.7 ? segs[1] : u < 0.94 ? segs[2] : 17;
      const r = half * Math.sqrt(Math.max(0, 1 - u * u)) ;
      const yy = top + (1 - u) * len;
      const move = EXC[sc[seg]] * sys * 0.28 * half * (1 - 0.5 * u);
      pts.push({ x: cx + sign * (r - move), y: yy - (u > 0.9 ? move * 0.6 : 0), seg });
    }
    return pts;
  };
  const L = side(-1, v.left), Rr = side(1, v.right);
  // the middle of each wall band, for taps
  if (layout) for (const [pts, sign] of [[L, -1], [Rr, 1]]) for (const p of pts) layout.walls.push({ x: p.x + sign * 7, y: p.y, seg: p.seg });
  // colored wall bands
  const band = (pts, sign) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const f = fillFor(t, sc[a.seg]);
      const on = a.seg === hover;
      ctx.save();
      ctx.strokeStyle = f || (on ? t.accent : t.ink3);
      ctx.globalAlpha = f || on ? 0.9 : 0.5;
      ctx.lineWidth = on ? 15 : 11;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(a.x + sign * 7, a.y);
      ctx.lineTo(b.x + sign * 7, b.y);
      ctx.stroke();
      ctx.restore();
    }
  };
  band(L, -1);
  band(Rr, 1);
  ctx.save();
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  L.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i].x, Rr[i].y);
  ctx.stroke();
  ctx.restore();
  // segment numbers
  for (const [pts, sign] of [[L, -1], [Rr, 1]]) {
    for (const k of [6, 19, 30]) {
      const p = pts[k];
      sh.text(String(p.seg), p.x + sign * 24, p.y + 4, { family: MONO, weight: 500, size: 11, align: 'center', color: t.ink2 });
    }
  }
  sh.text(name, cx, y + h - 24, { size: 20, align: 'center' });
  sh.text(`${v.lname} · ${v.rname}`, cx, y + h - 6, { family: SANS, weight: 400, size: 10.5, color: t.ink3, align: 'center' });
}

function draw(sh, t) {
  const W = sh.w, H = sh.h;
  const narrow = W < 700;
  const S = scores(st);
  const sys = reducedMotion ? 1 : clamp(cycleAt((clock * 1000) % RR).s, 0, 1);
  layout = { bull: null, walls: [] };
  const live = echo && echo.views;
  if (live) syncEcho();
  // the occlusion buttons sit over the top of the figure. Below them, two by two: the
  // bull's-eye, then the four-, two- and three-chamber views
  // below the buttons, which wrap to two rows on a phone
  const oc = sh.canvas.closest('figure')?.querySelector('.occl');
  const ob = oc && oc.offsetParent ? (oc.getBoundingClientRect().bottom - sh.canvas.getBoundingClientRect().top) / (sh.z || 1) : 0;
  const top = Math.max(narrow ? 50 : 66, Math.ceil(ob) + 8), pad = narrow ? 6 : 14, gap = narrow ? 6 : 14;
  const cw = (W - 2 * pad - gap) / 2, chh = (H - top - pad - gap) / 2;
  const cell = (i) => ({ x: pad + (i % 2) * (cw + gap), y: top + Math.floor(i / 2) * (chh + gap), w: cw, h: chh });
  const b = cell(0);
  // the caption and the color key take 116 px; a short cell gives the whole of it to the map
  // (the segment buttons under the controls carry the same colors)
  const roomy = !narrow && (b.h - 116) / 2 >= 70;
  const R = roomy ? Math.min(b.w * 0.3, (b.h - 116) / 2) : Math.min(b.w * 0.3, (b.h - 34) / 2);
  const cx = b.x + b.w / 2, cy = roomy ? b.y + 22 + R : b.y + b.h / 2;
  const small = !roomy && R < 90;
  layout.bull = { cx, cy, R };
  bullseye(sh, t, cx, cy, R, S.sc, small, () => arteries(sh, t, cx, cy, R, st.culprit, small));
  if (live) echo.views.forEach((v, i) => echoView(sh, t, cell(i + 1), v, S.sc));
  else ['A4C', 'A2C', 'A3C'].forEach((n, i) => apicalView(sh, t, cell(i + 1), n, S.sc, sys));
  if (!roomy) return;
  const cap = sh.fit(['17 segments, seen from the apex; tap one to score it', '17 segments, seen from the apex'], b.w, { size: 15 }, 0.85);
  sh.text(cap.str, cx, b.y + b.h - 30, { size: cap.size, align: 'center', color: t.ink2 });
  // legend: one row, centred, its type smaller when the cell is narrow
  const ctx = sh.ctx, keys = [[1, 'normal'], [2, 'hypokinetic'], [3, 'akinetic'], [4, 'dyskinetic']];
  let fs = 12, widths = [];
  for (; fs >= 10; fs -= 0.5) {
    ctx.save();
    ctx.font = `400 ${fs}px ${SANS}`;
    widths = keys.map(([k, name]) => 22 + ctx.measureText(`${k} ${name}`).width);
    ctx.restore();
    if (widths.reduce((a, c) => a + c, 0) + 3 * 14 <= b.w) break;
  }
  const ly = b.y + b.h - 4;
  let lx = cx - (widths.reduce((a, c) => a + c, 0) + 3 * 14) / 2;
  keys.forEach(([k, name], i) => {
    ctx.save();
    ctx.fillStyle = fillFor(t, k) || t.paper2;
    ctx.fillRect(lx, ly - 10, 16, 12);
    ctx.strokeStyle = t.ink;
    ctx.strokeRect(lx, ly - 10, 16, 12);
    ctx.restore();
    if (k === 4) { const p = new Path2D(); p.rect(lx, ly - 10, 16, 12); sh.hatch(p, 0.8, 4, t.ink, 0.8, 9, 0.6); }
    sh.text(`${k} ${name}`, lx + 22, ly, { family: SANS, weight: 400, size: fs, color: t.ink2 });
    lx += widths[i] + 14;
  });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

/** Where each apical view shows the abnormal segments, in words: 'A2C, the anterior wall ...'. */
function where(sc) {
  const out = [];
  for (const [name, v] of Object.entries(VIEWS)) {
    const parts = [];
    for (const [segs, wall] of [[v.left, v.lname], [v.right, v.rname]]) {
      const bad = segs.filter((k) => sc[k] > 1);
      if (bad.length === 3) { parts.push(`the whole ${wall} wall`); continue; }
      // name the levels: 'the basal and mid inferoseptal segments', 'the apical septal segment'
      const groups = [];
      for (const k of bad) {
        const [lvl, ...rest] = SEG_NAMES[k - 1].split(' '), wallName = rest.join(' ');
        const g = groups.find((x) => x.wall === wallName);
        if (g) g.lvls.push(lvl); else groups.push({ wall: wallName, lvls: [lvl] });
      }
      for (const g of groups) parts.push(`the ${g.lvls.join(' and ')} ${g.wall} segment${g.lvls.length > 1 ? 's' : ''}`);
    }
    if (sc[17] > 1) parts.push('the apex');
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    out.push(`${name}, ${list || 'normal'}`);
  }
  return out.join('; ');
}

/** The segment under a pointer event on the figure, or 0. */
function segAt(e) {
  if (!layout || !sheet) return 0;
  const r = sheet.canvas.getBoundingClientRect(), z = sheet.z || 1;
  const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z;
  const B = layout.bull;
  if (B) {
    const dx = x - B.cx, dy = y - B.cy, rho = Math.hypot(dx, dy) / B.R;
    if (rho <= 1.02) {
      if (rho < 0.14) return 17;
      const ring = rho < 0.36 ? [13, 14, 15, 16] : rho < 0.66 ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
      const step = 360 / ring.length, a = (Math.atan2(-dy, dx) * 180) / Math.PI;
      return ring[(((Math.round((a - 90) / step)) % ring.length) + ring.length) % ring.length];
    }
  }
  let best = 0, bd = 13;
  for (const p of layout.walls) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) { bd = d; best = p.seg; }
  }
  return best;
}

/** Move segment k on to the next score: normal, hypokinetic, akinetic, dyskinetic, normal. */
function cycle(k) {
  const a = [...parse(st.segs).slice(1)];
  a[k - 1] = (a[k - 1] % 4) + 1;
  const segs = a.join('');
  setState({ segs, ...match(segs), playing: false, anim: false });
}

// the segment buttons under the controls: the keyboard's way to score, and a key to the colors
function fillPick() {
  const host = document.getElementById('seg-pick');
  if (!host || host.childElementCount) return;
  const rows = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17]];
  host.innerHTML = rows.map((r, i) => `<span class="segpick-row"><span class="segpick-level">${['Basal', 'Mid', 'Apical'][i]}</span>${r.map((k) => `<button type="button" data-seg="${k}">${k}</button>`).join('')}</span>`).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-seg]');
    if (b) cycle(Number(b.dataset.seg));
  });
}
function syncPick(s) {
  const host = document.getElementById('seg-pick');
  if (!host) return;
  const sc = parse(s.segs);
  for (const b of host.querySelectorAll('button[data-seg]')) {
    const k = Number(b.dataset.seg);
    b.dataset.score = String(sc[k]);
    b.setAttribute('aria-label', `Segment ${k}, ${SEG_NAMES[k - 1]}: ${WM[sc[k]]}. Press for the next score.`);
    b.title = `${SEG_NAMES[k - 1]}: ${WM[sc[k]]}`;
  }
}

export default {
  key: 'segments',
  part: 'function',
  title: 'Segments',
  dwell: 14,
  defaults: { culprit: 'none', wm: 3, segs: preset('none') },
  watch: ['culprit', 'wm', 'segs'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    const cv = sheet.canvas;
    cv.addEventListener('click', (e) => { const k = segAt(e); if (k) cycle(k); });
    cv.addEventListener('pointermove', (e) => {
      const k = e.pointerType === 'mouse' ? segAt(e) : 0;
      if (k !== hover) { hover = k; cv.style.cursor = k ? 'pointer' : ''; sheet.dirty = true; }
    });
    cv.addEventListener('pointerleave', () => { if (hover) { hover = 0; cv.style.cursor = ''; sheet.dirty = true; } });
    return sheet;
  },
  init({ state, set }) {
    st = state;
    setState = set;
    fillPick();
    syncPick(state);
  },
  onState(s, ch) {
    // an artery or a score from the buttons writes the pattern; with a pattern made by hand,
    // a new score goes to every abnormal segment
    if (('culprit' in ch || 'wm' in ch) && !('segs' in ch)) {
      const segs = s.culprit === 'custom' ? [...s.segs].map((c) => (c !== '1' ? String(s.wm) : c)).join('') : preset(s.culprit, s.wm);
      if (segs !== s.segs) { setState({ segs, ...(s.culprit === 'custom' ? match(segs) : {}) }); return; }
    }
    if ('segs' in ch || 'chapter' in ch) syncPick(s);
  },
  enter() { startEcho(); },
  warm() { startEcho(); },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt / 1.5;
    // one scanner view per frame, in turn: each runs at about a third of the screen rate
    if (echo && echo.views) {
      syncEcho();
      renderView(echo.views[echo.next++ % echo.views.length]);
    }
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ culprit: 'none', wm: 3 }); },
  tourTick(tt, set) {
    const c = tt < 3 ? 'none' : tt < 7 ? 'lad' : tt < 10.5 ? 'rca' : 'lcx';
    set({ culprit: c, wm: 3 });
  },
  text(s, { cite }) {
    const S = scores(s);
    const bad = [];
    for (let k = 1; k <= 17; k++) if (S.sc[k] > 1) bad.push(k);
    const by = Object.keys(TERRITORY).map((c) => ({ c, n: TERRITORY[c].filter((k) => S.sc[k] > 1).length, of: TERRITORY[c].length })).filter((x) => x.n);
    const listBy = [2, 3, 4].map((w) => ({ w, ks: bad.filter((k) => S.sc[k] === w) })).filter((x) => x.ks.length)
      .map((x) => `${WM[x.w]} (${x.w}): ${x.ks.join(', ')}`).join('; ');
    const territory = s.culprit === 'none' ? 'none' : TERRITORY[s.culprit] ? ANAME[s.culprit] : by.length ? by.map((x) => `${x.c === 'lcx' ? 'Cx' : x.c.toUpperCase()} ${x.n} of ${x.of}`).join(' · ') : 'none';
    const tail = `The wall motion score index, the mean of the 16 scores, is ${fmt(S.wmsi, 2)}${cite('lang2015')}.`;
    let live;
    if (!bad.length) live = `All 16 segments are scored 1 (normal), and the wall motion score index is 1.00${cite('lang2015')}. The LAD, RCA and LCX buttons on the figure occlude the corresponding artery, and a tap on a segment advances it to the next score.`;
    else if (TERRITORY[s.culprit]) {
      const segs = TERRITORY[s.culprit];
      live = `<b>${COURSE[s.culprit].name} occlusion.</b> The territory of the occluded artery is ${WM[s.wm]}; segments ${segs.filter((k) => k < 17).join(', ')} are scored ${s.wm}${segs.includes(17) ? ', as is the apical cap, which is excluded from the wall motion score index' : ''}. The apical views show the abnormal segments as follows: ${where(S.sc)}${cite('lang2015')}. ${tail} The territories are those of the standard map; in one CT study, 72% of patients had at least one segment supplied by a different artery${cite('javadi2010')}.`;
    } else {
      live = `The segments scored by hand are as follows: ${listBy}. The apical views show the abnormal segments as follows: ${where(S.sc)}. By the standard map, the abnormal segments lie in the territory of ${by.map((x) => `the ${ANAME[x.c]} artery (${x.n} of ${x.of})`).join(', ')}${cite('javadi2010')}. ${tail}${bad.includes(17) ? ' The apical cap is counted only in the 17-segment model.' : ''}`;
    }
    return {
      readouts: [
        { k: 'Wall motion score index', v: fmt(S.wmsi, 2), flag: S.wmsi > 1 },
        { k: 'Abnormal segments', v: `${S.abnormal} of 16`, flag: S.abnormal > 0 },
        { k: 'Territory', v: territory, text: true },
      ],
      live,
    };
  },
};
