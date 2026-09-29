// 10 Segments: regional wall motion. The 17-segment model as a bull's-eye and as the three
// apical views that show it. An occluded coronary artery sets the motion of its territory,
// and each segment can be scored by hand: tap it on the bull's-eye or on an apical view.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, RR } from '../cyclemodel.js';
import { loadModel } from '../model3d.js';

export const SEG_NAMES = ['basal anterior', 'basal anteroseptal', 'basal inferoseptal', 'basal inferior', 'basal inferolateral', 'basal anterolateral',
  'mid anterior', 'mid anteroseptal', 'mid inferoseptal', 'mid inferior', 'mid inferolateral', 'mid anterolateral',
  'apical anterior', 'apical septal', 'apical inferior', 'apical lateral', 'apex'];
// Standard AHA assignment (Javadi 2010, Figure 2); supply varies between patients.
export const TERRITORY = { lad: [1, 2, 7, 8, 13, 14, 17], rca: [3, 4, 9, 10, 15], lcx: [5, 6, 11, 12, 16] };
const ANAME = { lad: 'left anterior descending', rca: 'right coronary', lcx: 'circumflex' };
// Segments along each apical view, screen-left base to apex to screen-right base (Lang 2015, Figure 4).
const VIEWS = {
  A4C: { left: [3, 9, 14], right: [6, 12, 16], lname: 'septum', rname: 'lateral' },
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

/** The segment at level h (0 apex .. 1 mitral annulus) and angle th (deg; 90 anterior, 180 septal). */
function segmentOf(h, th) {
  if (h < 0.06) return 17;
  const a = ((th % 360) + 360) % 360;
  if (h < 0.36) return [13, 14, 15, 16][(Math.round((a - 90) / 90) % 4 + 4) % 4];
  const i = (Math.round((a - 90) / 60) % 6 + 6) % 6;
  return h < 0.66 ? 7 + i : 1 + i;
}

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
  const A = m.anat, ax = A.axis, la = A.lateral, an = A.anterior;
  const apex = A.point('apex_endo', 0, 0), L = A.point('mv', 0, 0).sub(apex).dot(ax);
  const flat = (v) => v.clone().addScaledVector(ax, -v.dot(ax)).normalize();
  const angle = (v) => (Math.atan2(v.dot(an), v.dot(la)) * 180) / Math.PI;
  let sx = 0, sy = 0;
  [['a4c', 210], ['a2c', 270], ['a3c', 330]].forEach(([k, std]) => {
    const g = geoms[k];
    if (!g) return;
    const d = ((std - angle(flat(g.r.clone().negate()))) * Math.PI) / 180;
    sx += Math.cos(d); sy += Math.sin(d);
  });
  const turn = (Math.atan2(sy, sx) * 180) / Math.PI;
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
  // the middle of the wall by level: the median distance of the LV's vertices from the axis
  const rMid = (h) => { const l = lists[bin(h)]; return l.length ? l[Math.floor(l.length * 0.5)] : 2.5; };
  // the numbers: on each view's two walls at the basal, mid and apical levels, and at the apex
  const labels = {};
  for (const [k, g] of Object.entries(geoms)) {
    const out = [];
    for (const side of [-1, 1]) {
      const dir = flat(g.r.clone().multiplyScalar(side));
      const th = angle(dir) + turn;
      for (const h of [0.83, 0.51, 0.21]) out.push({ k: segmentOf(h, th), p: apex.clone().addScaledVector(ax, h * L).addScaledVector(dir, rMid(h)) });
    }
    out.push({ k: 17, p: apex.clone().addScaledVector(ax, -0.45) });
    labels[k] = out;
  }
  return { mem, labels, turn };
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

async function startEcho() {
  if (echo) return;
  echo = { loading: true };
  try {
    const [m, E] = await Promise.all([loadModel(), import('../echo.js')]);
    const map = segmentMap(m, Object.fromEntries(ECHO.map(([, k]) => [k, E.viewGeometry(m.anat, k)])));
    const views = ECHO.map(([name, key]) => {
      const canvas = document.createElement('canvas');
      const ev = new E.EchoView(m, canvas, { offscreen: true, width: 240, height: 200 });
      ev.depth = 15;                     // closer than the standard views: the LV fills more
      ev.setView(key, { animate: false });
      return { name, key, ev, canvas, fresh: false };
    });
    echo = { map, views, next: 0, segs: '' };
    if (sheet) sheet.dirty = true;
  } catch (e) {
    echo = { failed: true };
  }
}

/** The scores onto the model; a view that is stale is drawn again. */
function syncEcho() {
  if (!echo || !echo.views || echo.segs === st.segs) return;
  const scale = regionalScale(echo.map, parse(st.segs));
  for (const v of echo.views) { v.ev.setRegional(scale); v.fresh = false; }
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
  for (const { k, p } of echo.map.labels[v.key] || []) {
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
  if (w >= 200) sh.text(`${spec.lname} · ${spec.rname}`, box.x + 4, box.y + 32, { family: SANS, weight: 400, size: 10.5, color: t.ink3 });
}

function fillFor(t, score) {
  return score === 1 ? null : score === 2 ? t.flag2 : t.flag;
}

function bullseye(sh, t, cx, cy, R, sc) {
  const ctx = sh.ctx;
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
      sh.text(String(seg), cx + Math.cos(am) * rm, cy - Math.sin(am) * rm + 4, { family: MONO, weight: 500, size: 11, align: 'center', color: t.ink });
    });
  }
  const cap = new Path2D();
  cap.arc(cx, cy, 0.14 * R, 0, Math.PI * 2);
  const f = fillFor(t, sc[17]);
  if (f) { ctx.save(); ctx.fillStyle = f; ctx.globalAlpha = 0.75; ctx.fill(cap); ctx.restore(); }
  ctx.save(); ctx.strokeStyle = hover === 17 ? t.accent : t.ink; ctx.lineWidth = hover === 17 ? 2.5 : 1; ctx.stroke(cap); ctx.restore();
  sh.text('17', cx, cy + 4, { family: MONO, weight: 500, size: 11, align: 'center' });
  // orientation
  sh.text('anterior', cx, cy - R - 10, { size: 16, align: 'center', color: t.ink2 });
  sh.text('inferior', cx, cy + R + 22, { size: 16, align: 'center', color: t.ink2 });
  sh.text('septal', cx - R - 8, cy + 5, { size: 16, align: 'right', color: t.ink2 });
  sh.text('lateral', cx + R + 8, cy + 5, { size: 16, color: t.ink2 });
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
  if (narrow) {
    const R = Math.min(W * 0.26, H * 0.2);
    layout.bull = { cx: W * 0.5, cy: R + 30, R };
    bullseye(sh, t, W * 0.5, R + 30, R, S.sc);
    const bw = (W - 24) / 3, by = 2 * R + 80;
    if (live) echo.views.forEach((v, i) => echoView(sh, t, { x: 8 + i * (bw + 4), y: by, w: bw, h: Math.min(H - by - 8, bw * 1.05) }, v, S.sc));
    else ['A4C', 'A2C', 'A3C'].forEach((n, i) => apicalView(sh, t, { x: 8 + i * (bw + 4), y: by, w: bw, h: H - by - 8 }, n, S.sc, sys));
    return;
  }
  const R = Math.min(W * 0.2, H * 0.3);
  layout.bull = { cx: W * 0.27, cy: H * 0.42, R };
  bullseye(sh, t, W * 0.27, H * 0.42, R, S.sc);
  sh.text('17 segments, seen from the apex; tap one to score it', W * 0.27, H * 0.42 + R + 52, { size: 18, align: 'center', color: t.ink2 });
  if (live) {
    // the three views down the right side, as the scanner shows them
    const x = W * 0.53, w = W * 0.45, top = H * 0.04, gap = 10, h = (H * 0.86 - 2 * gap) / 3;
    echo.views.forEach((v, i) => echoView(sh, t, { x, y: top + i * (h + gap), w, h }, v, S.sc));
  } else {
    const bw = W * 0.15, bx = W * 0.52, bh = H * 0.62;
    ['A4C', 'A2C', 'A3C'].forEach((n, i) => apicalView(sh, t, { x: bx + i * (bw + 10), y: H * 0.14, w: bw, h: bh }, n, S.sc, sys));
    sh.text('the apical views, systole in motion', bx, H * 0.14 + bh + 34, { size: 18, color: t.ink2 });
  }
  // legend
  const ly = H - 40;
  [[1, 'normal'], [2, 'hypokinetic'], [3, 'akinetic'], [4, 'dyskinetic']].forEach(([k, name], i) => {
    const lx = 30 + i * 130;
    const ctx = sh.ctx;
    ctx.save();
    ctx.fillStyle = fillFor(t, k) || t.paper2;
    ctx.fillRect(lx, ly - 10, 16, 12);
    ctx.strokeStyle = t.ink;
    ctx.strokeRect(lx, ly - 10, 16, 12);
    ctx.restore();
    if (k === 4) { const p = new Path2D(); p.rect(lx, ly - 10, 16, 12); sh.hatch(p, 0.8, 4, t.ink, 0.8, 9, 0.6); }
    sh.text(`${k} ${name}`, lx + 22, ly, { family: SANS, weight: 400, size: 12, color: t.ink2 });
  });
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

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
  defaults: { culprit: 'lad', wm: 3, segs: preset('lad', 3) },
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
    const seen = Object.entries(VIEWS).filter(([, v]) => [...v.left, ...v.right].some((k) => bad.includes(k))).map(([n]) => n);
    const by = Object.keys(TERRITORY).map((c) => ({ c, n: TERRITORY[c].filter((k) => S.sc[k] > 1).length, of: TERRITORY[c].length })).filter((x) => x.n);
    const listBy = [2, 3, 4].map((w) => ({ w, ks: bad.filter((k) => S.sc[k] === w) })).filter((x) => x.ks.length)
      .map((x) => `${WM[x.w]} (${x.w}): ${x.ks.join(', ')}`).join('; ');
    const territory = s.culprit === 'none' ? 'none' : TERRITORY[s.culprit] ? ANAME[s.culprit] : by.length ? by.map((x) => `${x.c === 'lcx' ? 'Cx' : x.c.toUpperCase()} ${x.n} of ${x.of}`).join(' · ') : 'none';
    const tail = `The index is the mean of the 16 scores: ${fmt(S.wmsi, 2)}${cite('lang2015')}.`;
    let live;
    if (!bad.length) live = `All 16 segments score 1 (normal): the wall motion score index is 1.00${cite('lang2015')}. Tap a segment to score it.`;
    else if (TERRITORY[s.culprit]) {
      const segs = TERRITORY[s.culprit];
      live = `A ${ANAME[s.culprit]} territory that is ${WM[s.wm]} scores ${s.wm} in segments ${segs.filter((k) => k < 17).join(', ')}${segs.includes(17) ? ' (and the apical cap, which the index leaves out)' : ''}. Views that show it: ${seen.join(', ')}. ${tail} The map is the standard one; in one CT study, 72% of patients had at least one segment supplied by a different artery${cite('javadi2010')}.`;
    } else {
      live = `Scored by hand: ${listBy}. Views that show them: ${seen.join(', ') || 'none'}. By the standard map, the abnormal segments lie in the territory of ${by.map((x) => `the ${ANAME[x.c]} (${x.n} of ${x.of})`).join(', ')}${cite('javadi2010')}. ${tail}${bad.includes(17) ? ' The apical cap counts only in the 17-segment model.' : ''}`;
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
