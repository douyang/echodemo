// 10 Segments: regional wall motion. The 17-segment model as a bull's-eye and as the three
// apical views that show it; an occluded coronary artery sets the motion of its territory.
import { Sheet, clamp, mix, MONO, SANS } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cycleAt, RR } from '../cyclemodel.js';

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

export function scores(s) {
  const sc = Array(18).fill(1);
  if (s.culprit !== 'none') for (const k of TERRITORY[s.culprit]) sc[k] = s.wm;
  const sixteen = sc.slice(1, 17);
  return { sc, wmsi: sixteen.reduce((a, b) => a + b, 0) / 16, abnormal: sixteen.filter((x) => x > 1).length };
}

let sheet = null, st = null, clock = 0;

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
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 1;
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
  ctx.save(); ctx.strokeStyle = t.ink; ctx.stroke(cap); ctx.restore();
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
  // colored wall bands
  const band = (pts, sign) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const f = fillFor(t, sc[a.seg]);
      ctx.save();
      ctx.strokeStyle = f || t.ink3;
      ctx.globalAlpha = f ? 0.9 : 0.5;
      ctx.lineWidth = 11;
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
  if (narrow) {
    const R = Math.min(W * 0.26, H * 0.2);
    bullseye(sh, t, W * 0.5, R + 30, R, S.sc);
    const bw = (W - 24) / 3, by = 2 * R + 80;
    ['A4C', 'A2C', 'A3C'].forEach((n, i) => apicalView(sh, t, { x: 8 + i * (bw + 4), y: by, w: bw, h: H - by - 8 }, n, S.sc, sys));
    return;
  }
  const R = Math.min(W * 0.2, H * 0.3);
  bullseye(sh, t, W * 0.27, H * 0.42, R, S.sc);
  sh.text('17 segments, seen from the apex', W * 0.27, H * 0.42 + R + 52, { size: 18, align: 'center', color: t.ink2 });
  const bw = W * 0.15, bx = W * 0.52, bh = H * 0.62;
  ['A4C', 'A2C', 'A3C'].forEach((n, i) => apicalView(sh, t, { x: bx + i * (bw + 10), y: H * 0.14, w: bw, h: bh }, n, S.sc, sys));
  sh.text('the apical views, systole in motion', bx, H * 0.14 + bh + 34, { size: 18, color: t.ink2 });
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

export default {
  key: 'segments',
  part: 'function',
  title: 'Segments',
  dwell: 14,
  defaults: { culprit: 'lad', wm: 3 },
  watch: ['culprit', 'wm'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) { st = state; },
  anim(dt) {
    if (reducedMotion) return;
    clock += dt / 1.5;
    if (sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ culprit: 'none', wm: 3 }); },
  tourTick(tt, set) {
    const c = tt < 3 ? 'none' : tt < 7 ? 'lad' : tt < 10.5 ? 'rca' : 'lcx';
    set({ culprit: c, wm: 3 });
  },
  text(s, { cite }) {
    const S = scores(s);
    const segs = s.culprit === 'none' ? [] : TERRITORY[s.culprit];
    const seen = Object.entries(VIEWS).filter(([, v]) => [...v.left, ...v.right].some((k) => segs.includes(k))).map(([n]) => n);
    return {
      readouts: [
        { k: 'Wall motion score index', v: fmt(S.wmsi, 2), flag: S.wmsi > 1 },
        { k: 'Abnormal segments', v: `${S.abnormal} of 16`, flag: S.abnormal > 0 },
        { k: 'Territory', v: s.culprit === 'none' ? 'none' : ANAME[s.culprit], text: true },
      ],
      live: s.culprit === 'none'
        ? `All 16 segments score 1 (normal): the wall motion score index is 1.00${cite('lang2015')}.`
        : `A ${ANAME[s.culprit]} territory that is ${WM[s.wm]} scores ${s.wm} in segments ${segs.filter((k) => k < 17).join(', ')}${segs.includes(17) ? ' (and the apical cap, which the index leaves out)' : ''}. Views that show it: ${seen.join(', ')}. The index is the mean of the 16 scores: ${fmt(S.wmsi, 2)}${cite('lang2015')}. The map is the standard one; in one CT study, 72% of patients had at least one segment supplied by a different artery${cite('javadi2010')}.`,
    };
  },
};
