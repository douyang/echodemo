// Parametric echo views for the severity pages, drawn to scale in cm: apical four-chamber,
// parasternal long axis, three short-axis levels and an IVC M-mode. The model gives the sizes;
// the views draw them, so a caliper on the screen reads the value the page reports. The image
// comes from bmode.js: each structure has its own echogenicity, a surface is brighter where
// the beam meets it head-on, and the speckle moves with the tissue.
import { SC, sectorPath, colorBar, caliper, panel, tagBox } from './scope.js';
import { cycleAt, mitralV, lvotV, EV, RR } from './cyclemodel.js';
import { colorFlow, convergence, jetFlow, jetShare, stream, boxAround } from './cflow.js';
import { bmode, mmode, DB } from './bmode.js';
import { MONO, SANS, clamp, mix } from './sketch.js';
import { cine, motionNow } from './sev.js';

// ---------------------------------------------------------------- small geometry
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const lerp2 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const perp = (a) => [-a[1], a[0]];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------------------------------------------------------------- the heart shown
// The heart the page shows (pheno.js) changes the valves in every view drawn here: a bicuspid
// aortic valve (right and left cusps fused) closes off-centre in the long axis and opens as a
// slit in the short axis; a Barlow mitral valve has thick, long leaflets that billow past the
// annulus into the atrium. Walls and chamber sizes stay each page's own.
let HEART = 'normal';
export function setHeart(k) { HEART = k || 'normal'; }
/** The heart the views draw: 'normal' or a key of pheno.js. */
export const heartShown = () => HEART;
const BARLOW = { len: 1.3, thick: 0.3, tent: -0.5 };
/** The mitral leaflet thickness (cm) the views draw for a page's thickness t. */
export function shownMitralThick(t) { return HEART === 'barlow' ? Math.max(t, BARLOW.thick) : t; }
/** The mitral settings v and leaflet-length factor k for the heart shown. */
function mitralOf(v, k) {
  if (HEART !== 'barlow') return [v, k];
  return [{ ...v, thick: Math.max(v?.thick ?? 0.12, BARLOW.thick), tent: BARLOW.tent }, k * BARLOW.len];
}

/** Catmull-Rom spline through points; closed or open. */
function spline(pts, n = 10, closed = false) {
  const out = [];
  const N = pts.length;
  const P = (i) => (closed ? pts[(i + N) % N] : pts[clamp(i, 0, N - 1)]);
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[N - 1]);
  return out;
}

/** Offset an open polyline away from a reference point by thickness th(i/n) (cm). */
function offsetAway(poly, th, ref) {
  const n = poly.length;
  const nrm = poly.map((p, i) => unit(perp(sub(poly[Math.min(n - 1, i + 1)], poly[Math.max(0, i - 1)]))));
  const sg = sideAway(poly, nrm, ref);
  return poly.map((p, i) => add(p, mul(nrm[i], sg * (typeof th === 'function' ? th(i / (n - 1)) : th))));
}
/**
 * The one side of a line (normals nrm) that faces away from ref at most of its points. A test at
 * each point alone fails where the line runs toward ref, near an end: there it picks the other
 * side, and the offset folds back across the line (the septum into the LVOT in systole).
 */
function sideAway(poly, nrm, ref) {
  return poly.reduce((s, p, i) => s + Math.sign(dot(sub(p, ref), nrm[i])), 0) < 0 ? -1 : 1;
}
const ribbon = (inner, outer) => [...inner, ...outer.slice().reverse()];
/** A polyline resampled to n points at even steps along its length. */
function resample(poly, n) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1], out = [];
  for (let k = 0, j = 0; k < n; k++) {
    const d = (L * k) / (n - 1);
    while (j < poly.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    out.push(lerp2(poly[j], poly[j + 1], clamp((d - cum[j]) / seg, 0, 1)));
  }
  return out;
}
/**
 * The outer envelope of an open outline, from its first point to its last: the side of its convex
 * hull away from the chord between the ends, as 160 even steps, lightly smoothed. A fixed count
 * keeps it matched to its reference shape, so its speckle moves with it.
 */
function envelope(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  const P = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const H = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  const near = (q) => H.reduce((k, p, i) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(H[k][0] - q[0], H[k][1] - q[1]) ? i : k), 0);
  const ia = near(a), ib = near(b), n = H.length;
  const fwd = [], back = [];
  for (let i = ia; ; i = (i + 1) % n) { fwd.push(H[i]); if (i === ib) break; }
  for (let i = ia; ; i = (i - 1 + n) % n) { back.push(H[i]); if (i === ib) break; }
  // the far side: the arc that lies farther from the chord a-b
  const off = (arc) => Math.max(...arc.map((p) => Math.abs(cross(a, b, p))));
  // it starts and ends on the hull, at the corners nearest the two ends of the outline
  const arc = off(fwd) >= off(back) ? fwd : back;
  const r = resample(arc, 160);
  // a light running mean rounds the corners where the hull leaves the outline
  return r.map((p, i) => {
    if (i < 2 || i > r.length - 3) return p;
    let x = 0, y = 0;
    for (let k = -2; k <= 2; k++) { x += r[i + k][0]; y += r[i + k][1]; }
    return [x / 5, y / 5];
  });
}
const centroid = (poly) => mul(poly.reduce((a, p) => add(a, p), [0, 0]), 1 / poly.length);
/** An ellipse (or circle) of n points. */
const ellipse = (c, rx, ry = rx, n = 40) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]; });
/** A closed ring between two ellipses about c. */
const ring = (c, r0, r1, n = 32, k = 1) => { const a = ellipse(c, r0, r0 * k, n), b = ellipse(c, r1, r1 * k, n); return ribbon([...a, a[0]], [...b, b[0]]); };
/** The centre of an ellipse of radii a and b (axes along x and y) through p and q: of the two, the one nearer near. */
function ellipseThrough(p, q, a, b, near) {
  const P = [p[0] / a, p[1] / b], Q = [q[0] / a, q[1] / b];
  const M = lerp2(P, Q, 0.5), d = len(sub(Q, P)), n = perp(unit(sub(Q, P))), h = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
  const cs = [1, -1].map((sg) => { const c = add(M, mul(n, sg * h)); return [c[0] * a, c[1] * b]; });
  return len(sub(cs[0], near)) <= len(sub(cs[1], near)) ? cs[0] : cs[1];
}
/** Points on an arc about c (radians, y down), a0 to a1. */
const arc = (c, r, a0, a1, n = 30) => Array.from({ length: n + 1 }, (_, i) => { const a = mix(a0, a1, i / n); return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
/** The point at fraction f along a polyline, by index. */
const along = (poly, f) => poly[Math.round(clamp(f, 0, 1) * (poly.length - 1))];
/** Bumps toward ref on a contour (trabeculae): amp(u) in cm, u = i / (n - 1). */
function trabeculate(poly, amp, ref, seed) {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = amp(i / (n - 1));
    if (a <= 0) return p;
    const bump = 0.5 + 0.5 * Math.sin(i * 2.9 + seed) * Math.cos(i * 1.37 + 2 * seed);
    return add(p, mul(unit(sub(ref, p)), a * bump));
  });
}
/** A rounded muscle (papillary) from base b along direction d: length l, width w. */
function muscle(b, d, l, w, into) {
  const t = perp(d);
  return spline([
    add(add(b, mul(t, w / 2)), mul(into, 0.2)),
    add(add(b, mul(d, l * 0.5)), mul(t, w * 0.42)),
    add(b, mul(d, l)),
    add(add(b, mul(d, l * 0.5)), mul(t, -w * 0.42)),
    add(add(b, mul(t, -w / 2)), mul(into, 0.2)),
  ], 6, true);
}
/** Echogenicity of a valve from its leaflet thickness (cm). */
const valveDb = (v) => DB.valve + 6 * clamp(((v?.thick ?? 0.12) - 0.12) / 0.3, 0, 1);

// ---------------------------------------------------------------- valve leaflets
// A leaflet keeps its length through the beat. It swings about its hinge between an open and
// a shut shape: the direction of each short step along it is blended, not the points, so it
// turns as a flap does instead of shrinking toward its hinge.
const NL = 14;
const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += len(sub(p[i], p[i - 1])); return s; };
/** Quadratic curve a -> b, its control point moved h (cm) along bd from the middle. */
function quad(a, b, bd, h, m = 12) {
  const c = add(lerp2(a, b, 0.5), mul(bd, h));
  return Array.from({ length: m + 1 }, (_, i) => {
    const t = i / m, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });
}
/**
 * A leaflet shape from hinge h, length l: a curve to e that bulges along bd as far as the
 * length needs, then a tail along td (the zone where the leaflets meet). A leaflet shorter
 * than the distance to e runs straight toward it and stops short.
 */
function flap(h, e, l, bd, td = null, tail = 0) {
  const chord = len(sub(e, h)), arcL = l - (td ? tail : 0);
  if (arcL <= chord * 1.001) return [h, add(h, mul(unit(sub(e, h)), l))];
  let lo = 0, hi = arcL;
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (plen(quad(h, e, bd, m)) < arcL) lo = m; else hi = m; }
  const arc = quad(h, e, bd, (lo + hi) / 2);
  return td && tail > 0 ? [...arc, add(e, mul(td, tail))] : arc;
}
/** Step directions (rad) of a polyline cut into NL equal steps, and its length. */
function headings(poly) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + len(sub(poly[i], poly[i - 1])));
  const L = cum[cum.length - 1] || 1e-6;
  const pt = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    return lerp2(poly[i - 1], poly[i], clamp((s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1));
  };
  const hs = [];
  let p = poly[0];
  for (let k = 1; k <= NL; k++) { const q = pt((k / NL) * L); hs.push(Math.atan2(q[1] - p[1], q[0] - p[0])); p = q; }
  return { hs, L };
}
/** The leaflet at fraction f from shape A (0) to shape B (1), walked out from hinge h. */
function swing(h, A, B, f) {
  const a = headings(A), b = headings(B), L = mix(a.L, b.L, f) / NL;
  const out = [h];
  let p = h;
  for (let k = 0; k < NL; k++) {
    const d = b.hs[k] - a.hs[k];
    const th = a.hs[k] + Math.atan2(Math.sin(d), Math.cos(d)) * f;
    p = add(p, [Math.cos(th) * L, Math.sin(th) * L]);
    out.push(p);
  }
  return out;
}
/** Closed outline of a leaflet: thickness t0 at the hinge to t1 at the free edge, a round tip. */
function leafOutline(mid, t0, t1) {
  const n = mid.length, Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const nn = unit(perp(sub(mid[Math.min(n - 1, i + 1)], mid[Math.max(0, i - 1)])));
    const u = i / (n - 1), w = mix(t0, t1, u * u) / 2;
    Lf.push(add(mid[i], mul(nn, w)));
    Rt.push(add(mid[i], mul(nn, -w)));
  }
  const e = mid[n - 1], d = unit(sub(e, mid[n - 2])), nn = perp(d), w = t1 / 2;
  const cap = [];
  for (let k = 1; k < 6; k++) { const a = (k / 6) * Math.PI; cap.push(add(e, add(mul(nn, w * Math.cos(a)), mul(d, w * Math.sin(a))))); }
  return [...Lf, ...cap, ...Rt.reverse()];
}
/** A band of thickness t along an open line (a cusp edge seen in short axis). */
function band(line, t) {
  const n = line.length, Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const nn = unit(perp(sub(line[Math.min(n - 1, i + 1)], line[Math.max(0, i - 1)])));
    Lf.push(add(line[i], mul(nn, t / 2)));
    Rt.push(add(line[i], mul(nn, -t / 2)));
  }
  return [...Lf, ...Rt.reverse()];
}
/**
 * Two leaflets from hinges h1, h2 of lengths L1, L2 that meet on the ventricular side
 * (toward: unit vector into the ventricle). The shut shapes billow a little toward the atrium
 * and share a zone of contact; gap (cm) keeps the tips apart. open1, open2: the open end
 * points; bulge1, bulge2: the side each open leaflet bows to.
 */
function valvePair(h1, h2, L1, L2, toward, o) {
  const gap = o.gap ?? 0, tent = o.tent ?? 0.45;
  const span = unit(sub(h2, h1)), w = len(sub(h2, h1)), back = mul(toward, -1);
  const cAt = (p) => add(add(h1, mul(span, w * p)), mul(toward, tent + 0.6 * gap));
  const left = (p, i) => {
    const c = add(cAt(p), mul(span, i ? gap / 2 : -gap / 2));
    return (i ? L2 : L1) - 1.03 * len(sub(c, i ? h2 : h1));
  };
  // where the tips meet: the longer leaflet covers more of the orifice, both keep the same contact
  let lo = 0.2, hi = 0.9;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (left(m, 0) > left(m, 1)) lo = m; else hi = m; }
  const C = cAt((lo + hi) / 2);
  const c1 = add(C, mul(span, -gap / 2)), c2 = add(C, mul(span, gap / 2));
  // the length the leaflets have left over goes first into the zone where they meet (up to 8 mm)
  const tail = gap > 0.02 ? 0 : Math.max(0, Math.min(left((lo + hi) / 2, 0), o.coapt ?? 0.8));
  const shut1 = flap(h1, c1, L1, back, toward, tail), shut2 = flap(h2, c2, L2, back, toward, tail);
  const open1 = flap(h1, o.open1, L1, o.bulge1), open2 = flap(h2, o.open2, L2, o.bulge2);
  return { shut1, shut2, open1, open2, C };
}

/**
 * Two leaflets seen edge-on across a tube, from hinges h1 and h2 on its walls; dir points
 * downstream. Shut, they meet a little downstream of the hinges (tent, cm) and bow back
 * upstream; open (f = 1), each lies along its own wall. Midlines, hinge first.
 */
function tubeValve(h1, h2, dir, f, tent = 0.3) {
  const mid = lerp2(h1, h2, 0.5), L = Math.hypot(len(sub(h2, h1)) / 2, tent) * 1.02 + 0.06;
  const out1 = unit(sub(h1, mid)), out2 = unit(sub(h2, mid));
  const along = (h, out) => add(h, mul(unit(add(mul(dir, 0.97), mul(out, 0.14))), L * 0.96));
  const P = valvePair(h1, h2, L, L, dir, { tent, open1: along(h1, out1), open2: along(h2, out2), bulge1: out1, bulge2: out2 });
  return [swing(h1, P.shut1, P.open1, f), swing(h2, P.shut2, P.open2, f)];
}

/** Items for leaflets: each its own fill (its speckle turns with it), then the bright surface. */
const leaves = (list, refs, e) => [
  ...list.map((p, i) => ({ polys: [p], refs: refs ? [refs[i]] : null, e })),
  { borders: list, e, spec: 7, w: 0.05, closed: true },
];

// ---------------------------------------------------------------- the scanner frame
/** Panel, sector and cm -> px mapping. deg: sector angle; depth in cm; near: chest wall (cm). */
export function frame(ctx, box, depthIn, title, o = {}) {
  panel(ctx, box.x, box.y, box.w, box.h, title);
  // the scanner sets depth in half-centimetre steps
  const depth = Math.round(depthIn * 2) / 2;
  const deg = o.deg ?? 80;
  let top = box.y + 24;
  // the sector fills the panel height; its sides may run past the panel and are clipped
  let R = Math.max(40, box.h - 30);
  let cx = box.x + box.w / 2 + (o.shift ?? 0) * box.w;
  let k = R / depth;
  if (o.zoom) {
    // zoom: o.zoom.span cm of the sector fill the image height, o.zoom.c (cm) in the middle; the
    // probe lies above the image
    k = (box.h - 26) / o.zoom.span;
    cx = box.x + (box.w - 30) / 2 - o.zoom.c[0] * k;
    top = box.y + 20 + (box.h - 20) / 2 - o.zoom.c[1] * k;
    R = depth * k;
  }
  const sect = { cx, top, R, deg };
  const P = (p) => [cx + p[0] * k, top + p[1] * k];
  const clipBox = new Path2D();
  clipBox.rect(box.x + 1, box.y + 20, box.w - 30, box.h - 21);
  const view = { box: { x: box.x + 1, y: box.y + 20, w: box.w - 30, h: box.h - 21 }, cx, top, k, half: (deg / 2) * (Math.PI / 180), depth, near: o.near ?? 1.4 };
  return { sect, k, P, depth, box, clipBox, view, fan: sectorPath(cx, top, R, deg), zoom: !!o.zoom };
}

/** The B-mode image of a list of structures (see bmode.js), inside the panel. */
export function scan(ctx, F, items, o = {}) {
  ctx.save();
  ctx.clip(F.clipBox);
  const b = F.box;
  bmode(ctx, F.view, items, { t: o.t, gain: o.gain, live: cine.live, key: `${b.x},${b.y},${b.w},${b.h}` });
  ctx.restore();
}

/** A depth scale on the panel's right edge, drawn last. */
export function finish(ctx, F) {
  const { box, sect, k } = F;
  const x = box.x + box.w - 24;
  ctx.save();
  ctx.strokeStyle = SC.dim;
  ctx.fillStyle = SC.dim;
  ctx.font = `500 10px ${MONO}`;
  ctx.lineWidth = 1;
  for (let d = 1; d < F.depth; d++) {
    const y = sect.top + d * k;
    if (y < box.y + 24) continue;                 // a zoomed image starts below the probe
    if (y > box.y + box.h - 6) break;
    const l = d % 5 === 0 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y);
    ctx.stroke();
    if (d % 5 === 0 && !(F.barEnd && y - 6 < F.barEnd)) ctx.fillText(String(d), x + 8, y + 3.5);
  }
  ctx.restore();
}

/**
 * Measurement box in the panel's lower left corner, as on the scanner. A line may be an array of
 * forms, longest first; the box shrinks its type, then takes the short forms, to keep clear of
 * the depth scale.
 */
export function measures(ctx, F, lines) {
  if (!lines.length) return;
  const room = F.box.w - 8 - 34;
  ctx.save();
  let out = null, size = 9;
  search: for (const pick of [0, 1]) {
    const arr = lines.map((l) => { const f = [].concat(l); return f[Math.min(pick, f.length - 1)]; });
    for (const sz of [10.5, 9.5, 9]) {
      ctx.font = `500 ${sz}px ${MONO}`;
      out = arr; size = sz;
      if (Math.max(...arr.map((q) => ctx.measureText(q).width)) + 12 <= room) break search;
    }
  }
  ctx.restore();
  F.meas = tagBox(ctx, F.box.x + 8, F.box.y + F.box.h - 8 - (out.length * (size + 3) + 8) / 2, out, { size });
}

/** Small white chamber labels, kept inside the image when the chamber runs past its edge. */
function tag(ctx, F, text, p, o = {}) {
  const q = F.P(p);
  const vb = F.view.box;
  // a zoomed image names only what it shows
  if (F.zoom && (q[0] < vb.x + 8 || q[0] > vb.x + vb.w - 8 || q[1] < vb.y + 8 || q[1] > vb.y + vb.h - 8)) return;
  ctx.save();
  ctx.font = `600 ${o.size || 11}px ${SANS}`;
  ctx.fillStyle = o.color || 'rgba(214,222,226,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const b = F.view.box, hw = ctx.measureText(text).width / 2 + 5;
  let x = clamp(q[0], b.x + hw, b.x + b.w - hw), y = clamp(q[1], b.y + 10, b.y + b.h - 10);
  // clear of the color bar and its legend at the right edge, and of the measurement box
  if (F.barEnd && y - 8 < F.barEnd && x + hw > F.box.x + F.box.w - 34) x = F.box.x + F.box.w - 34 - hw;
  const m = F.meas;
  if (m && x + hw > m.x && x - hw < m.x + m.w && y + 8 > m.y && y - 8 < m.y + m.h) y = m.y - 10;
  // a dark outline keeps the tag legible over a color jet
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,10,12,0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}
/**
 * A color bar at the image's right edge for the range lo..hi (cm/s); its legend ends above the
 * depth scale's first number.
 */
export function barFor(ctx, F, lo, hi) {
  const { box, sect, k } = F;
  let yNum = sect.top + 5 * k;
  while (yNum < box.y + 24) yNum += 5 * k;
  const h = clamp(yNum - 12 - (box.y + 34) - 24, 24, 90);
  colorBar(ctx, box.x + box.w - 20, box.y + 34, h, hi / 100, { w: 7, lo: lo / 100, hi: hi / 100 });
  F.barEnd = box.y + 34 + h + 24;
}

/** Caliper between two cm points with a label. */
export function cal(ctx, F, a, b, text, o = {}) {
  const A = F.P(a), B = F.P(b);
  caliper(ctx, A[0], A[1], B[0], B[1], { solid: o.solid ?? false, size: 3.5 });
  if (text) {
    ctx.save();
    ctx.font = `500 ${o.size || 10.5}px ${MONO}`;
    ctx.fillStyle = SC.cal;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'middle';
    const m = [(A[0] + B[0]) / 2 + (o.dx ?? 6), (A[1] + B[1]) / 2 + (o.dy ?? 0)];
    ctx.fillText(text, m[0], m[1]);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- jets drawn from their model
// The 'plume' format (jets.js): each jet from a model of its flow, drawn at the aliasing
// velocity, over the grey image; no normal flow. The 'scanner' format (cflow.js) is above.
let JC = null;
const hash = (i, j, f) => { const x = Math.sin(i * 127.1 + j * 311.7 + f * 74.7) * 43758.5453; return x - Math.floor(x); };
/** Smooth noise in 0..1 on a lattice of `step` cells (blobs about that size), frame f. */
function blob(i, j, step, f) {
  const x = i / step, y = j / step, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, f), b = hash(x0 + 1, y0, f), c = hash(x0, y0 + 1, f), d = hash(x0 + 1, y0 + 1, f);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** The BART color of velocity v (m/s) at aliasing velocity nyq (m/s), wrapped past it. */
function plumeColor(v, nyq) {
  let u = v / nyq;
  if (Math.abs(u) > 1) u = ((((u + 1) % 2) + 2) % 2) - 1;   // wrap into [-1, 1)
  const a = Math.abs(u);
  const lo = u >= 0 ? SC.red : SC.blue, hi = u >= 0 ? SC.yellow : SC.cyan;
  const t = Math.pow(a, 1.4);
  let c = lo.map((q, i) => q + (hi[i] - q) * t);
  const dim = 0.35 + 0.65 * Math.min(1, a * 1.6);
  c = c.map((q) => q * dim);
  return c.map((q) => Math.max(0, Math.min(255, Math.round(q))));
}

/**
 * A regurgitant or stenotic jet in color Doppler: flow convergence (PISA) upstream of the
 * orifice O and a jet downstream, inside a color box: velocity along the beam, red toward the
 * probe, wrapping at the aliasing velocity. Every jet is drawn as the torrential TR jet shows:
 * a smooth flame, laminar, with no variance mosaic, its core aliasing once. So the velocity
 * drawn is at most 3.2 times the aliasing velocity (vmax, cm/s, sets another), and a jet across
 * the beam is drawn as if at 40 degrees to it; the CW panels carry the true velocity.
 * dir: unit vector of the jet (downstream); q: flow (mL/s); va: aliasing velocity (cm/s); vc:
 * vena contracta (cm); jl, jw: jet length and largest width (cm); clip: chamber polygon (cm) the
 * jet stays inside; clipOr: more polygons it may fill too (the blood between the orifice and the
 * chamber); keep: cm over which the core keeps its velocity before it slows (its potential
 * core; 0 by default); pclip: the polygon the convergence zone stays inside (none: it is not cut);
 * a: 0..1 strength over the cycle; pisa: false for no convergence zone; box: false to leave
 * out the outline and return the box's extent { t0, t1, r0, r1 } (radians, px) instead; skip(p):
 * true for a point (cm) the jet and its convergence zone leave out (a dissection flap, ch/aorta.js);
 * wide: cm from O where the jet is widest (jw), as a jet whose width a caliper reads there (by
 * default near the middle of its length); fade: the jet ends, fading out, where its axis leaves
 * its clip (a jet aimed at a leaflet).
 */
export function jet(ctx, F, j) {
  if (!j || !(j.a > 0.02) || !(j.q > 0)) return;   // a NaN strength draws nothing
  const { k, box, sect } = F;
  const O = j.O, d = unit(j.dir), n = perp(d);
  const va = j.va, Wd = j.jw, w0 = Math.max(0.12, j.vc / 2);
  let L = j.jl * Math.min(1, j.a * 1.15);
  const v0 = Math.min(clamp(j.q / (Math.PI * w0 * w0), 90, 600), j.vmax ?? 3.2 * va);   // cm/s at the vena contracta
  // toward the probe or away, as the jet leaves the orifice; a jet across the beam is drawn as if
  // it met the beam at no more than about 40 degrees, so it shows its flame too
  const sgn = Math.sign(dot(d, unit(mul(O, -1)))) || -1;
  // its convergence zone too: when the jet meets the beam at more than 40 degrees (across), the
  // zone shows the flow's part along the jet's axis, at 40 degrees to the beam (ax: the axis's
  // direction toward the probe's side)
  const ax = mul(d, sgn), COS40 = Math.cos((40 * Math.PI) / 180), across = dot(ax, unit(mul(O, -1))) < COS40;
  const Rp = j.pisa === false ? 0 : Math.min(2.4, Math.sqrt(j.q / (2 * Math.PI * 0.15 * va)));
  const halfAt = j.wide > 0
    // widest at wide cm, then narrowing to the vena contracta's width at its end
    ? (u) => w0 + (Wd / 2 - w0) * (u <= j.wide ? Math.sin((Math.PI / 2) * (u / j.wide)) : Math.cos((Math.PI / 2) * Math.min(1, (u - j.wide) / Math.max(L - j.wide, 0.01)))) ** 0.8
    : (u) => w0 + (Wd / 2 - w0) * Math.sin(Math.PI * Math.min(1, (u / Math.max(L, 0.01)) * 0.9 + 0.1)) ** 0.8 * Math.min(1, (u / Math.max(L, 0.01)) * 2.2);
  // the region to color, in px: the jet and the convergence zone
  const pts = [add(O, mul(n, Wd / 2 + 0.2)), add(O, mul(n, -Wd / 2 - 0.2)), add(add(O, mul(d, L + 0.2)), mul(n, Wd / 2 + 0.2)), add(add(O, mul(d, L + 0.2)), mul(n, -Wd / 2 - 0.2)), add(O, mul(d, -Rp - 0.1)), add(add(O, mul(d, -0.1)), mul(n, Rp + 0.1)), add(add(O, mul(d, -0.1)), mul(n, -Rp - 0.1))].map(F.P);
  const x0 = Math.max(box.x, Math.min(...pts.map((p) => p[0]))), x1 = Math.min(box.x + box.w - 30, Math.max(...pts.map((p) => p[0])));
  const y0 = Math.max(box.y + 20, Math.min(...pts.map((p) => p[1]))), y1 = Math.min(box.y + box.h, Math.max(...pts.map((p) => p[1])));
  if (!(x1 > x0 && y1 > y0)) return;
  const cell = Math.max(2, k * 0.09);                        // color pixels about 1 mm
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (!JC) JC = document.createElement('canvas');
  if (JC.width < W || JC.height < H) { JC.width = Math.max(JC.width, W); JC.height = Math.max(JC.height, H); }
  const g = JC.getContext('2d', { willReadFrequently: true });
  // a larger jet drawn before leaves its pixels past W x H, which smoothing would draw at the edge
  g.clearRect(0, 0, JC.width, JC.height);
  const img = g.createImageData(W, H), px = img.data;
  const pathOf = (poly) => {
    if (!poly) return null;
    const path = new Path2D();
    poly.forEach((p, i) => { const q = F.P(p); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
    path.closePath();
    return path;
  };
  const clip = pathOf(j.clip), pclip = pathOf(j.pclip), also = (j.clipOr || []).map(pathOf).filter(Boolean);
  // fade: past the orifice, the jet ends where its axis first leaves its clip or meets a point that
  // skip leaves out, so that its tip fades out there and does not stop at a straight edge (a
  // leaflet's line)
  if (j.fade) {
    let entered = false;
    for (let t = 0.05; t < L; t += 0.05) {
      const p = add(O, mul(d, t)), [X, Y] = F.P(p);
      const free = !(j.skip && j.skip(p)) && (!clip || g.isPointInPath(clip, X, Y) || also.some((q) => g.isPointInPath(q, X, Y)));
      if (free) entered = true;
      else if (entered) { L = t; break; }
    }
  }
  const f = cine.live ? Math.floor((motionNow() * 1000) / 45) : 0;
  for (let jj = 0; jj < H; jj++) {
    for (let ii = 0; ii < W; ii++) {
      const X = x0 + (ii + 0.5) * cell, Y = y0 + (jj + 0.5) * cell;
      const p = [(X - sect.cx) / k, (Y - sect.top) / k];
      if (j.skip && j.skip(p)) continue;
      const rel = sub(p, O), al = dot(rel, d), ac = dot(rel, n);
      const toward = unit(mul(p, -1));                         // from here to the probe
      let vb = 0, alpha = 0;
      if (al >= -0.02) {
        // the jet: fastest in its core, slowing and widening downstream
        if (al > L) continue;
        const half = halfAt(al);
        if (Math.abs(ac) > half) continue;
        if (clip && !g.isPointInPath(clip, X, Y) && !also.some((q) => g.isPointInPath(q, X, Y))) continue;
        const vcl = v0 / (1 + (0.35 * Math.max(0, al - (j.keep || 0))) / w0);
        const v = vcl * Math.exp(-((ac / (0.55 * half)) ** 2)) * j.a;
        const turb = 0.08;
        const nz = blob(ii, jj, 2.2, f) - 0.5, nz2 = blob(ii + 50, jj + 50, 1.3, f) - 0.5;
        vb = v * sgn * Math.max(Math.abs(dot(d, toward)), 0.75) + turb * vcl * (1.6 * nz + 0.8 * nz2);
        alpha = Math.min(1, j.a * 1.5) * (1 - smooth((Math.abs(ac) / half - 0.75) / 0.25)) * (1 - smooth((al / Math.max(L, 0.01) - 0.8) / 0.2));
      } else if (Rp > 0) {
        // flow convergence: v = q / (2 pi r^2) toward the orifice
        const r = len(rel);
        if (r > Rp || r < 0.04) continue;
        if (pclip && !g.isPointInPath(pclip, X, Y)) continue;
        // across the beam: one hemisphere in the jet's color with its aliasing shell, fading at its
        // flanks, not a red and a blue lobe either side of the beam through the orifice
        const v = (j.q / (2 * Math.PI * r * r)) * j.a, flow = unit(sub(O, p));
        vb = across ? v * COS40 * dot(flow, ax) : v * dot(flow, toward);
        alpha = Math.min(1, j.a * 1.4) * smooth((Math.abs(vb) / va - 0.12) / 0.12);
      }
      if (alpha <= 0.02 || Math.abs(vb) < 0.1 * va) continue;
      const [cr, cg, cb] = plumeColor(vb / 100, va / 100);
      const o = 4 * (jj * W + ii);
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = Math.round(255 * alpha);
    }
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(JC, 0, 0, W, H, x0, y0, W * cell, H * cell);
  ctx.restore();
  // the color box, as the scanner outlines it
  const polar = pts.map((q) => { const x = (q[0] - sect.cx) / k, y = (q[1] - sect.top) / k; return [Math.atan2(x, y), Math.hypot(x, y)]; });
  const t0 = Math.min(...polar.map((q) => q[0])) - 0.04, t1 = Math.max(...polar.map((q) => q[0])) + 0.04;
  const r0 = Math.max(0.5, Math.min(...polar.map((q) => q[1])) - 0.3) * k, r1 = (Math.max(...polar.map((q) => q[1])) + 0.3) * k;
  // j.box false: no outline here; the box's extent goes back, so a caller can outline several jets as one box
  if (j.box === false) return { t0, t1, r0, r1 };
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sect.cx, sect.top, r0, Math.PI / 2 - t0, Math.PI / 2 - t1, true);
  ctx.arc(sect.cx, sect.top, r1, Math.PI / 2 - t1, Math.PI / 2 - t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * A jet whose axis bends, as jet() draws a straight one: an eccentric jet that meets a chamber's
 * wall and runs on along it (the Coanda effect). path: the jet's axis, [u, v] points (plane cm)
 * from the orifice downstream, close together and smooth. half(s): the jet's half-width (cm) at
 * s cm along its axis; core(s): its core's velocity at s, a share of the velocity at the vena
 * contracta. The jet grows along its axis over the cycle with a. Its color is the velocity along
 * the beam with the sign it has where it leaves the orifice, so one jet shows one color along its
 * whole length as it bends. q, va, vmax, vc, a, clip, pclip, pisa and box as in jet().
 */
export function pathJet(ctx, F, j) {
  if (!j || !(j.a > 0.02) || !(j.q > 0) || !j.path || j.path.length < 2) return;
  const { k, box, sect } = F;
  const P = j.path, m = P.length;
  // the axis's arc length at each point, and each segment's direction
  const S = [0], D = [];
  for (let i = 1; i < m; i++) {
    const e = sub(P[i], P[i - 1]), l = len(e) || 1e-6;
    S.push(S[i - 1] + l);
    D.push(mul(e, 1 / l));
  }
  const L = S[m - 1] * Math.min(1, j.a * 1.15);
  if (!(L > 0.05)) return;
  const va = j.va, w0 = Math.max(0.12, j.vc / 2), O = P[0], d0 = D[0];
  const v0 = Math.min(clamp(j.q / (Math.PI * w0 * w0), 90, 600), j.vmax ?? 3.2 * va);
  const sgn = Math.sign(dot(d0, unit(mul(O, -1)))) || -1;
  const ax = mul(d0, sgn), COS40 = Math.cos((40 * Math.PI) / 180), across = dot(ax, unit(mul(O, -1))) < COS40;
  const Rp = j.pisa === false ? 0 : Math.min(2.4, Math.sqrt(j.q / (2 * Math.PI * 0.15 * va)));
  // the segments the jet reaches now, and the region to color (px): the jet and the convergence zone
  let last = 1;
  while (last < m - 1 && S[last] < L) last++;
  let hmax = 0;
  for (let i = 0; i <= last; i++) hmax = Math.max(hmax, j.half(Math.min(S[i], L)));
  const pts = [];
  for (let i = 0; i <= last; i++) for (const sg of [-1, 1]) pts.push(F.P(add(P[i], mul(perp(D[Math.min(i, m - 2)]), sg * (hmax + 0.2)))));
  for (const q of [add(O, mul(d0, -Rp - 0.1)), add(add(O, mul(d0, -0.1)), mul(perp(d0), Rp + 0.1)), add(add(O, mul(d0, -0.1)), mul(perp(d0), -Rp - 0.1))]) pts.push(F.P(q));
  const x0 = Math.max(box.x, Math.min(...pts.map((p) => p[0]))), x1 = Math.min(box.x + box.w - 30, Math.max(...pts.map((p) => p[0])));
  const y0 = Math.max(box.y + 20, Math.min(...pts.map((p) => p[1]))), y1 = Math.min(box.y + box.h, Math.max(...pts.map((p) => p[1])));
  if (!(x1 > x0 && y1 > y0)) return;
  const cell = Math.max(2, k * 0.09);
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (!JC) JC = document.createElement('canvas');
  if (JC.width < W || JC.height < H) { JC.width = Math.max(JC.width, W); JC.height = Math.max(JC.height, H); }
  const g = JC.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, JC.width, JC.height);
  const img = g.createImageData(W, H), px = img.data;
  const pathOf = (poly) => {
    if (!poly) return null;
    const path = new Path2D();
    poly.forEach((p, i) => { const q = F.P(p); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
    path.closePath();
    return path;
  };
  const clip = pathOf(j.clip), pclip = pathOf(j.pclip);
  const f = cine.live ? Math.floor((motionNow() * 1000) / 45) : 0;
  for (let jj = 0; jj < H; jj++) {
    for (let ii = 0; ii < W; ii++) {
      const X = x0 + (ii + 0.5) * cell, Y = y0 + (jj + 0.5) * cell;
      const p = [(X - sect.cx) / k, (Y - sect.top) / k];
      // the nearest point of the axis: s along it, c across it
      let best = Infinity, s = 0, c = 0, dl = d0;
      for (let i = 0; i < last; i++) {
        const r = sub(p, P[i]), e = D[i], seg = S[i + 1] - S[i];
        const al = dot(r, e), t = i === 0 ? Math.min(al, seg) : clamp(al, 0, seg);
        const q = sub(r, mul(e, t)), d2 = q[0] * q[0] + q[1] * q[1];
        if (d2 < best) { best = d2; s = S[i] + t; c = dot(r, perp(e)); dl = e; }
      }
      const toward = unit(mul(p, -1));
      let vb = 0, alpha = 0;
      if (s >= -0.02) {
        if (s > L) continue;
        const half = j.half(s);
        if (Math.abs(c) > half) continue;
        if (clip && !g.isPointInPath(clip, X, Y)) continue;
        const vcl = v0 * j.core(s);
        const v = vcl * Math.exp(-((c / (0.55 * half)) ** 2)) * j.a;
        const nz = blob(ii, jj, 2.2, f) - 0.5, nz2 = blob(ii + 50, jj + 50, 1.3, f) - 0.5;
        vb = v * sgn * Math.max(Math.abs(dot(dl, toward)), 0.75) + 0.08 * vcl * (1.6 * nz + 0.8 * nz2);
        alpha = Math.min(1, j.a * 1.5) * (1 - smooth((Math.abs(c) / half - 0.75) / 0.25)) * (1 - smooth((s - (L - Math.min(1, 0.25 * L))) / Math.min(1, 0.25 * L)));
      } else if (Rp > 0) {
        const rel = sub(p, O), r = len(rel);
        if (r > Rp || r < 0.04) continue;
        if (pclip && !g.isPointInPath(pclip, X, Y)) continue;
        const v = (j.q / (2 * Math.PI * r * r)) * j.a, flow = unit(sub(O, p));
        vb = across ? v * COS40 * dot(flow, ax) : v * dot(flow, toward);
        alpha = Math.min(1, j.a * 1.4) * smooth((Math.abs(vb) / va - 0.12) / 0.12);
      }
      if (alpha <= 0.02 || Math.abs(vb) < 0.1 * va) continue;
      const [cr, cg, cb] = plumeColor(vb / 100, va / 100);
      const o = 4 * (jj * W + ii);
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb; px[o + 3] = Math.round(255 * alpha);
    }
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(JC, 0, 0, W, H, x0, y0, W * cell, H * cell);
  ctx.restore();
  const polar = pts.map((q) => { const x = (q[0] - sect.cx) / k, y = (q[1] - sect.top) / k; return [Math.atan2(x, y), Math.hypot(x, y)]; });
  const t0 = Math.min(...polar.map((q) => q[0])) - 0.04, t1 = Math.max(...polar.map((q) => q[0])) + 0.04;
  const r0 = Math.max(0.5, Math.min(...polar.map((q) => q[1])) - 0.3) * k, r1 = (Math.max(...polar.map((q) => q[1])) + 0.3) * k;
  if (j.box === false) return { t0, t1, r0, r1 };
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sect.cx, sect.top, r0, Math.PI / 2 - t0, Math.PI / 2 - t1, true);
  ctx.arc(sect.cx, sect.top, r1, Math.PI / 2 - t1, Math.PI / 2 - t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the beat
/** Contraction 0 (end-diastole) .. 1 (end-systole), valve drives, at ms after the R wave. */
export function phase(t) {
  const c = cycleAt(t);
  return { c: clamp(c.s, 0, 1), mvShut: c.drive.mv, tvShut: c.drive.tv, avOpen: c.drive.av, t: c.t };
}
const at = (pair, c) => (Array.isArray(pair) ? mix(pair[0], pair[1], c) : pair);

// ---------------------------------------------------------------- color flow in the views
// Normal flow through the beat, from the cycle model, and a lesion's jet with its flow
// convergence; cflow.js makes the color image. C, from the page:
//   lo, hi (cm/s): the displayed range, hi - lo twice the Nyquist limit; variance (bool);
//   roi: the color box: 'la', 'ra', 'mv', 'tv' (A4C), 'lvot', 'aorta', 'mitral' (PLAX);
//   'mvin' (A4C): the LA within 3.5 cm of the mitral annulus and the inflow; reach (cm): how far it
//     runs into the LV (5);
//   zoom (A4C): { at: 'mv' | 'tv', span (cm) };
//   E, A (m/s): mitral inflow; Et, At: tricuspid inflow; lvot (m/s): peak outflow;
//   pvS, pvD (m/s, into the LA): pulmonary veins; hvS, hvD (m/s, negative forward): hepatic veins;
//   mr, tr, ar, as, ms: a jet { q (mL/s), u0 (cm/s), vc, jl, jw (cm), frac (its share of its
//     chamber) or area (cm²) at full strength, a (0..1), lam (0..1),
//     pk (where it is widest, 0..1 of its length), open (cm), fit ('width': jw is its largest
//     width; else its area is 0.55 jl jw), dir, half and soft (the cone of its flow convergence), pisa }.
/** For checks: jetOnly leaves out the normal flow, noReturn a jet's return flow; stats ({ poly }, cm) takes the color area in poly. */
export const cfDebug = { jetOnly: false, noReturn: false, stats: null };
const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
/** Pulmonary vein velocity (m/s, into the atrium): S, D and the atrial reversal, as Mitral regurgitation draws them. */
function pvAt(t, S, D, Ar = -0.25) {
  const tt = t < 60 ? t + RR : t;
  return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
}
const polyArea = (poly) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return Math.abs(a) / 2; };
/** Where the ray from O along d enters the chamber poly and where it meets its far wall (cm from O). */
function crossing(O, d, poly) {
  let entry = null;
  for (let s = 0; s < 14; s += 0.05) {
    const p = add(O, mul(d, s));
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    if (c && entry === null) entry = s;
    else if (!c && entry !== null) return { entry, exit: s };
  }
  return { entry: entry ?? 0, exit: 14 };
}
/**
 * A lesion: flow convergence upstream of the orifice O and the jet along d. The jet keeps its
 * neck (the vena contracta) until it enters its chamber (cham, a polygon), where its color
 * length and area are counted; a jet that reaches the far wall spreads along it and comes back
 * along the side walls, toward the orifice.
 */
function lesion(O, d, J, cham) {
  const a = J.a, L = J.jl * Math.min(1, a * 1.15);
  const out = J.pisa === false ? [] : [convergence(O, d, J.q * a, { cap: J.u0, half: J.half, soft: J.soft })];
  if (L <= 0.15) return out;
  const X = cham ? crossing(O, d, cham) : { entry: 0, exit: Infinity }, D = X.exit - X.entry, hits = L > 0.8 * D;
  const u0 = J.u0 * Math.sqrt(a), grow = Math.min(1, 0.35 + 0.65 * a);
  // the color area at full strength: a share of the chamber as drawn (frac), cm² (area), or 0.55 jl jw
  const target = J.frac && cham ? J.frac * polyArea(cham) : J.area;
  const make = (wid) => jetFlow([O, add(O, mul(d, X.entry + L + 0.4))], {
    u0, vc: J.vc, len: L, pre: X.entry, wid, lam: J.lam, seed: J.seed ?? 3, pk: J.pk ?? (hits ? 0.6 : 0.5), wall: hits, open: J.open, fit: J.fit, keep: true,
  });
  const w0 = target ? (target * grow) / (0.55 * J.jl) : J.jw * grow;
  let jet = make(w0);
  // what falls outside the chamber is not drawn: widen the jet to make up for it
  for (let i = 0; i < 3 && target && cham; i++) {
    const f = jetShare(jet, cham);
    if (f > 0.98) break;
    jet = make(w0 / Math.max(0.55, f));
  }
  out.push(jet);
  if (hits && !cfDebug.noReturn) {
    // along the far wall, then back along the side walls (toward the probe in an apical view)
    const core = 1.4 * J.vc + 0.25, v = (0.3 * u0 * core) / Math.max(core, D), I = add(O, mul(d, X.exit - 0.45)), n = perp(d);
    for (const sgn of [1, -1]) {
      const side = mul(n, sgn * Math.min(2.4, J.jw * 0.5));
      out.push(stream([I, add(I, side), add(add(I, side), mul(d, -0.5 * D)), add(add(I, mul(side, 0.8)), mul(d, -0.85 * D))], [0.5 * v, 0.8 * v, 0.55 * v, 0.15 * v], [0.35, 0.42, 0.45, 0.35], { seed: 7 + sgn }));
    }
  }
  return out;
}
/**
 * Inflow through an open valve: from the atrium (H, the middle of the annulus) the blood speeds
 * up into the funnel of the leaflets, is fastest between their tips, and runs on toward the apex
 * as a broad laminar jet that slows within a few centimetres.
 */
function inflow(H, tip, into, gapW, v, far, seed) {
  const w = clamp(gapW, 0.9, 3.2);
  return stream([add(H, mul(into, -2.2)), H, tip, add(tip, mul(into, 1.4)), add(tip, mul(into, far))],
    [0.18 * v, 0.55 * v, v, 0.75 * v, 0.25 * v], [2.1, 1.7, w * 0.48, w * 0.55, w * 0.5], { seed, tex: 0.15, bill: 0.14 });
}

function a4cFlows(S, t, C) {
  const fl = [];
  const Hm = lerp2(S.S0, S.L0, 0.5), Ht = lerp2(S.TS, S.TL, 0.5), rvAx = unit(sub(S.Ra, Ht));
  const ldown = unit(add(mul(S.ax, -1), mul(S.nl, 0.12))), rdown = unit(add(mul(S.ax, -1), mul(S.out, 0.18)));
  if (!cfDebug.jetOnly) {
    // mitral and tricuspid inflow, E then A
    const vm = mitralV(t, C.E ?? 0.8, C.A ?? 0.55) * 100, vt = mitralV(t - 6, C.Et ?? 0.5, C.At ?? 0.4) * 100;
    if (vm > 2 && !C.ms) fl.push(inflow(Hm, S.mv.tip, S.ax, len(sub(S.mv.l1[NL], S.mv.l2[NL])), vm, S.lvL * 0.45, 21));
    if (vt > 2) fl.push(inflow(Ht, S.tv.tip, rvAx, len(sub(S.tv.l1[NL], S.tv.l2[NL])), vt, 3.2, 23));
    // the LV vortex: the inflow turns near mid-ventricle and runs back along both walls
    const vv = 0.3 * mitralV(t - 70, C.E ?? 0.8, C.A ?? 0.55) * 100;
    if (vv > 2) {
      for (const [side, f] of [[S.nl, 0.56], [mul(S.nl, -1), 0.44]]) {
        const P = (u) => add(lerp2(S.B, S.A, u), mul(side, lvWidth(u, S.lvW, S.ma) * f - 0.6));
        fl.push(stream([P(0.62), P(0.4), P(0.15)], [0.6 * vv, vv, 0.5 * vv], [0.5, 0.55, 0.45], { seed: f > 0.5 ? 31 : 33 }));
      }
    }
    // ejection: toward the outflow tracts, which lie in front of this plane
    const vo = lvotV(t, C.lvot ?? 1.0) * 100;
    if (vo > 2) {
      const a0 = lerp2(S.B, S.A, 0.55), b0 = add(add(S.S0, mul(S.ax, 1.2)), mul(S.nl, 0.9));
      // most of this flow runs across the plane: little of it shows
      fl.push(stream([a0, lerp2(a0, b0, 0.55), b0], [0.1 * vo, 0.22 * vo, 0.16 * vo], [1.0, 0.95, 0.75], { seed: 35 }));
      fl.push(stream([lerp2(Ht, S.Ra, 0.55), add(lerp2(S.TS, S.TL, 0.35), mul(rvAx, 1.0))], [0.1 * vo, 0.18 * vo], [0.8, 0.65], { seed: 37 }));
    }
    // pulmonary veins through the LA roof, toward the mitral valve; reversed flow runs back into them
    const pv = pvAt(t, C.pvS ?? 0.55, C.pvD ?? 0.4) * 100;
    if (Math.abs(pv) > 2) {
      const nLa = S.laCav.length - 1;
      for (const gi of [Math.round(nLa * 0.43), Math.round(nLa * 0.63)]) {
        const p = S.laCav[gi], d = unit(sub(Hm, p));
        fl.push(stream([sub(p, mul(d, 0.9)), p, add(p, mul(d, 2.4))], [pv, 0.85 * pv, 0.15 * pv], [0.3, 0.38, 0.7], { seed: 40 + gi }));
      }
    }
    // caval return: the IVC opens into the floor of the RA, behind this plane
    const cav = -((C.hvS ?? -0.45) * bump(t, 90, 400, 250) + (C.hvD ?? -0.3) * bump(t, EV.mvo + 15, 720, 540)) * 60;
    if (Math.abs(cav) > 2) {
      let f0 = S.raCav[0], best = -Infinity;
      for (const p of S.raCav) { const d = dot(sub(p, S.TL), rdown); if (d > best) { best = d; f0 = p; } }
      fl.push(stream([add(f0, mul(rdown, 0.6)), f0, lerp2(f0, Ht, 0.5)], [cav, 0.8 * cav, 0.3 * cav], [0.6, 0.7, 0.8], { seed: 45 }));
    }
  }
  if (C.mr?.a > 0.02) fl.push(...lesion(S.mv.gapMid, C.mr.dir ?? ldown, C.mr, S.laCav));
  if (C.tr?.a > 0.02) fl.push(...lesion(S.tv.gapMid, rdown, C.tr, S.raCav));
  // the stenotic jet leaves the domed leaflets along the axis of their funnel, toward the apex
  if (C.ms?.a > 0.02) fl.push(...lesion(S.mv.tip, unit(sub(S.mv.tip, Hm)), C.ms, S.lvCav));
  return fl;
}
// The color box depends only on the heart's sizes and the page's setting: made once for each.
const BOXES = new Map();
function cachedBox(key, make) {
  let b = BOXES.get(key);
  if (!b) {
    b = make();
    BOXES.set(key, b);
    if (BOXES.size > 32) BOXES.delete(BOXES.keys().next().value);
  }
  return b;
}
/** The A4C color box: over the chambers of every shape given (the box keeps still through the beat). */
function a4cBox(shapes, C, half) {
  const pts = [];
  for (const T of shapes) {
    if (C.roi === 'la') pts.push(add(T.S0, mul(T.ax, 2.4)), add(T.L0, mul(T.ax, 2.4)), ...T.laCav);
    else if (C.roi === 'mvin') {
      // the LA and the inflow below the valve, along the valve's axis: points across the LV near
      // the probe would open the sector over the right heart at every depth
      const H = lerp2(T.S0, T.L0, 0.5), n = perp(T.ax), E = add(H, mul(T.ax, C.reach ?? 5));
      pts.push(...T.laCav.filter((p) => len(sub(p, H)) < 3.5), T.S0, T.L0, add(E, mul(n, 0.8)), add(E, mul(n, -0.8)));
    }
    else if (C.roi === 'ra') {
      const ax = unit(sub(T.Ra, lerp2(T.TS, T.TL, 0.5)));
      pts.push(add(T.TS, mul(ax, 2.4)), add(T.TL, mul(ax, 2.4)), ...T.raCav);
    } else {
      const c = (C.roi === 'tv' ? T.tv : T.mv).gapMid;
      for (let i = 0; i < 12; i++) pts.push(add(c, [2 * Math.cos((i * Math.PI) / 6), 2 * Math.sin((i * Math.PI) / 6)]));
    }
  }
  return boxAround(pts, half, { mr: 0.25 });
}

function plaxFlows(S, R, t, C, g) {
  const fl = [];
  const { xAnn, aoMid, yLv, yPw, lvot, hingeA, hingeP, tipA, tipP } = S;
  const Rp = (pts) => pts.map(R);
  const Rd = (p, d) => unit(sub(R(add(p, d)), R(p)));      // a direction at p, turned with the image
  const root = g.root ?? 3.1, avTip = lerp2(S.cuspA[NL], S.cuspP[NL], 0.5), mvTip = lerp2(tipA, tipP, 0.5);
  if (!cfDebug.jetOnly) {
    // systole: the LV empties through the outflow tract into the aorta
    const vo = lvotV(t, C.lvot ?? 1.0) * 100;
    if (vo > 2) {
      const pts = [[-3.2, (yLv + yPw) / 2], [xAnn - 1.4, aoMid + 0.1], [xAnn + 0.8, aoMid]];
      const sp = [0.3 * vo, 0.9 * vo, 1.1 * vo], hw = [1.6, lvot * 0.42, (g.av?.open ?? 1.9) * 0.45];
      if (!C.as) { pts.push([xAnn + 3.4, aoMid - 0.25], [xAnn + 6.5, aoMid - 0.6]); sp.push(vo, 0.9 * vo); hw.push(root * 0.4, root * 0.38); }
      fl.push(stream(Rp(pts), sp, hw));
    }
    // diastole: mitral inflow toward the apex
    const vm = mitralV(t, C.E ?? 0.8, C.A ?? 0.55) * 100;
    if (vm > 2 && !C.ms) {
      const H = lerp2(hingeA, hingeP, 0.5);
      fl.push(inflow(R(H), R(mvTip), Rd(mvTip, unit(sub(mvTip, H))), len(sub(tipA, tipP)), vm, 3.4, 25));
    }
  }
  const lv = Rp(S.lvCav);
  if (C.ar?.a > 0.02) fl.push(...lesion(R(avTip), Rd(avTip, unit(sub([-4, aoMid + 1.0], [xAnn, aoMid]))), C.ar, lv));
  if (C.as?.a > 0.02) fl.push(...lesion(R(avTip), Rd(avTip, unit(sub([xAnn + 6, aoMid - 0.3], [xAnn + 1.2, aoMid]))), C.as));
  // the stenotic jet leaves along the axis of the leaflet funnel
  if (C.ms?.a > 0.02) fl.push(...lesion(R(mvTip), Rd(mvTip, unit(sub(mvTip, lerp2(hingeA, hingeP, 0.5)))), C.ms, lv));
  return fl;
}
/** The PLAX color box, round the lesion's region in every shape given. */
function plaxBox(shapes, C, R, half) {
  const pts = [];
  for (const T of shapes) {
    const { xAnn, aoTop, aoBot, yLv, yPw } = T;
    if (C.roi === 'lvot') pts.push([xAnn + 2.0, aoTop - 0.2], [xAnn + 2.0, aoBot + 0.2], [xAnn - 6, yLv + 0.1], [xAnn - 6, yPw - 0.2]);
    else if (C.roi === 'aorta') pts.push([xAnn - 2.4, aoTop], [xAnn - 2.4, aoBot + 0.3], [xAnn + 5.2, aoTop - 0.6], [xAnn + 5.2, aoBot]);
    else pts.push(...T.laCav, [xAnn - 4.5, yLv + 0.3], [xAnn - 4.5, yPw - 0.3]);
  }
  return boxAround(pts.map(R), half);
}

// ---------------------------------------------------------------- apical four-chamber
/** The septum's share of the LV width in an apical view, and its share of the systolic narrowing. */
const SEP = 0.44, SEP_SYS = 0.4;
/**
 * LV cavity width (cm) at level u (0 mitral annulus .. 1 apex) in an apical view: it widens from
 * the annulus (ma) to its widest (lvW) over the basal 22% of the length, then narrows to a round
 * apex. The disk model of Systolic function uses the same profile.
 */
export function lvWidth(u, lvW, ma) {
  return u < 0.22 ? mix(ma, lvW, smooth(u / 0.22)) : lvW * Math.sqrt(Math.max(0, 1 - ((u - 0.22) / 0.78) ** 2.3));
}
/** A leaflet pair in an apical view, hinges h1 and h2, lengths L1 and L2 (cm); v: {thick, gap, dome, tip}. */
const rotDir = (d, side, deg) => { const a = (deg * Math.PI) / 180; return unit(add(mul(d, Math.cos(a)), mul(side, Math.sin(a)))); };
function apValve(h1, h2, toward, L1, L2, v, shut) {
  const span = unit(sub(h2, h1)), out1 = mul(span, -1);
  let open1 = add(h1, mul(rotDir(toward, out1, 10), L1 * 0.95)), open2 = add(h2, mul(rotDir(toward, span, 22), L2 * 0.95));
  const dome = v?.dome ?? 0;
  if (dome > 0) {
    // rheumatic: the fused tips stay close, a small orifice; the anterior leaflet domes
    const k = smooth(dome / 0.6), tip = add(lerp2(h1, h2, 0.5), mul(toward, 1.2 + 0.3 * (1 - dome))), tw = v.tip ?? 1.2;
    open1 = lerp2(open1, add(tip, mul(span, -tw / 2)), k);
    open2 = lerp2(open2, add(tip, mul(span, tw / 2)), k);
  }
  const P = valvePair(h1, h2, L1, L2, toward, { gap: v?.gap ?? 0, tent: v?.tent, open1, open2, bulge1: out1, bulge2: span });
  const l1 = swing(h1, P.open1, P.shut1, shut), l2 = swing(h2, P.open2, P.shut2, shut);
  const th = v?.thick ?? 0.12, tipTh = th * (1 + 0.4 * dome);
  return { l1, l2, o1: leafOutline(l1, th * 0.75, tipTh), o2: leafOutline(l2, th * 0.75, tipTh), tip: lerp2(l1[NL], l2[NL], 0.5), gapMid: P.C };
}
/**
 * Every A4C structure (cm) at contraction c; valves follow the phase ph. dyn, for this moment
 * only: ra, rv (0..1) how far the RA and RV free walls are pushed in (tamponade); sep (cm) how
 * far the middle of the septum moves toward the LV (inspiration in tamponade); swing [dx, dy]
 * (cm), the heart's shift inside a large effusion. g.effusion (cm) widens the pericardial space.
 */
function a4cShape(g, c, ph, dyn = {}) {
  const lvL = at(g.lvL, c), lvW = at(g.lvW, c), wall = at(g.lvWall, c), ivs = at(g.ivs, c);
  const rvW = at(g.rvW, c), rvWall = at(g.rvWall ?? 0.4, c);
  const raIn = dyn.ra ?? 0, rvIn = dyn.rv ?? 0;
  const bow = (u) => (dyn.sep ?? 0) * Math.sin(Math.PI * u);    // septal shift, most at mid-septum
  const laW = at(g.laW, c), laL = at(g.laL, c), raW = at(g.raW, c), raL = at(g.raL, c);
  const ma = at(g.ma ?? 3.1, c), ta = at(g.ta ?? 3.0, c);
  // LV: apex fixed, the base moves toward it in systole; fluid in front of the apex sets the
  // heart deeper, the sac stays under the chest wall
  const apexY = 1.9 + 0.65 * wall + 0.7 * (g.effusion ?? 0);
  const A = [0.2, apexY];                              // endocardial apex
  const xsb = -0.95 + ivs / 2;                         // septal endocardium at the base
  const bx = xsb + ma * 0.5;                           // mitral annulus center, lvL from the apex
  const B = [bx, apexY + Math.sqrt(Math.max(lvL * lvL - (bx - A[0]) ** 2, 0.25 * lvL * lvL))];
  const ax = unit(sub(A, B));                          // base -> apex
  let nl = perp(ax); if (nl[0] < 0) nl = mul(nl, -1);  // toward the lateral wall
  const out = mul(nl, -1);                             // toward the RV free wall
  const N = 36;
  const widthAt = (u) => lvWidth(u, lvW, ma);
  const widthAt0 = (u) => lvWidth(u, at(g.lvW, 0), at(g.ma ?? 3.1, 0));
  const Pax = (u) => lerp2(B, A, u);
  // even steps to 80% of the length, then shorter ones: the width falls fast near the apex, and
  // even steps there would leave a faceted, pointed tip
  const U = (i) => { const x = i / N; return x <= 0.8 ? x : 0.8 + 0.2 * (1 - (1 - (x - 0.8) / 0.2) ** 2); };
  const sep = [], lat = [];
  for (let i = 0; i <= N; i++) {
    const u = U(i), w = widthAt(u), w0 = widthAt0(u);
    // the septum takes 40% of the systolic narrowing and the lateral wall 60%, so the septum's
    // RV face moves 2 to 3 mm, as in the 3D model; at end-diastole the walls lie as before
    sep.push(add(Pax(u), mul(nl, bow(u) - (SEP * w0 - SEP_SYS * (w0 - w)) * (1 - 0.06 * Math.sin(Math.PI * u)))));
    lat.push(add(Pax(u), mul(nl, ((1 - SEP) * w0 - (1 - SEP_SYS) * (w0 - w)) * (1 + 0.05 * Math.sin(Math.PI * u)))));
  }
  const lvCav = [...sep, ...lat.slice(0, -1).reverse()];   // septal hinge -> apex -> lateral hinge
  const S0 = sep[0], L0 = lat[0];
  const lvC = centroid(lvCav);
  // trabeculae line the apical third
  const trab = (u) => 0.13 * smooth((u - 0.58) / 0.3);
  const sepT = trabeculate(sep, trab, lvC, 0.7), latT = trabeculate(lat, trab, lvC, 2.1);
  const lvCavT = [...sepT, ...latT.slice(0, -1).reverse()];
  // septum: LV septal border offset toward the RV by its thickness
  const sepN = sep.map((p, i) => unit(perp(sub(sep[Math.min(N, i + 1)], sep[Math.max(0, i - 1)]))));
  const sepSg = sideAway(sep, sepN, lvC);
  const nsep = (i) => mul(sepN[i], sepSg);
  const rvSep = sep.map((p, i) => add(p, mul(nsep(i), ivs * (1 - 0.25 * (i / N) ** 3))));
  const iRvApex = Math.round(N * 0.74);
  const ivsRib = ribbon(sepT.slice(0, iRvApex + 2), rvSep.slice(0, iRvApex + 2));
  // LV apical and lateral wall
  const lvFree = lvCav.slice(iRvApex - 1), lvFreeT = lvCavT.slice(iRvApex - 1);
  // thin at the apex; thinner again where the muscle inserts into the annulus (the last 10%)
  const lvOut = offsetAway(lvFree, (u) => wall * (0.68 + 0.32 * smooth((u - 0.35) / 0.4)) * (1 - 0.4 * smooth((u - 0.9) / 0.1)), lvC);
  const lvRib = ribbon(lvFreeT, lvOut);
  // RV: from the tricuspid septal hinge (more apical than the mitral one) up the septum, around
  // the RV apex, down the free wall to the tricuspid lateral hinge
  const iTv = Math.round(N * 0.055);
  const TS = rvSep[iTv];
  const Ra = rvSep[iRvApex];
  const TL = add(add(TS, mul(out, ta)), mul(ax, 0.15));
  // in tamponade the free wall buckles inward in early diastole (k), most at its middle; it
  // stays where it is when the septum moves
  const rvFreeAt = (k) => {
    const Mb = add(add(rvSep[Math.round(N * 0.2)], mul(out, rvW * (1 - 0.3 * k) + bow(0.2))), mul(ax, -0.1));
    const Mm = add(rvSep[Math.round(N * 0.48)], mul(out, rvW * 0.82 * (1 - 0.62 * k) + bow(0.48)));
    return spline([Ra, add(rvSep[Math.round(N * 0.66)], mul(out, rvW * 0.5 * (1 - 0.35 * k) + bow(0.66))), Mm, Mb, TL], 10);
  };
  const rvFree = rvFreeAt(rvIn);
  const rvC = centroid([...rvSep.slice(iTv, iRvApex + 1), ...rvFree]);
  // coarse trabeculae on the free wall's apical half, the deepest at the apex
  const rvFreeT = trabeculate(rvFree, (u) => 0.24 * (1 - smooth((u - 0.1) / 0.5)), rvC, 1.3);
  const rvOut = offsetAway(rvFree, rvWall, rvC);
  const rvRib = ribbon(rvFreeT, rvOut);
  const rvSepEndo = rvSep.slice(iTv, iRvApex + 1);
  // and on the septal face of the apical third
  const rvSepEndoT = trabeculate(rvSepEndo, (u) => 0.12 * smooth((u - 0.62) / 0.3), rvC, 2.4);
  // moderator band: septum to free wall where the apical third of the RV begins
  const mbS = rvSep[Math.round(N * 0.56)];
  let jb = 0, db = Infinity;
  for (let j = 0; j < rvFree.length * 0.6; j++) { const d = Math.abs(dot(sub(rvFree[j], mbS), ax)); if (d < db) { db = d; jb = j; } }
  const mb = spline([add(mbS, mul(out, 0.05)), add(lerp2(mbS, rvFree[jb], 0.5), mul(ax, 0.22)), rvFree[jb]], 6);
  // thin trabeculae across the apex, beyond the band: [septum (fraction of N), free wall (fraction
  // from the apex), bow along the axis]
  const rvStrands = [[0.66, 0.1, 0.06], [0.62, 0.2, -0.05], [0.7, 0.05, 0.03]].map(([fs, ff, bend]) => {
    const a = rvSep[Math.round(N * fs)], b = along(rvFree, ff);
    return spline([a, add(lerp2(a, b, 0.5), mul(ax, bend)), b], 5);
  });
  // left atrium below the mitral annulus; the septal side follows the atrial septum
  const ldown = unit(add(mul(ax, -1), mul(nl, 0.12)));
  const laPts = [
    S0,
    add(add(S0, mul(ldown, laL * 0.3)), mul(nl, -0.14)),
    add(add(S0, mul(ldown, laL * 0.8)), mul(nl, -0.1)),
    add(add(S0, mul(ldown, laL)), mul(nl, laW * 0.45)),
    add(add(S0, mul(ldown, laL * 0.74)), mul(nl, laW * 0.97)),
    add(add(L0, mul(ldown, laL * 0.3)), mul(nl, Math.max(0.1, laW - ma) * 0.75)),
    L0,
  ];
  const laCav = spline(laPts, 10);
  const laC = centroid(laCav);
  const laOut = offsetAway(laCav, 0.18, laC);
  // pulmonary veins open through the roof: a right vein beside the septum, a left one laterally
  const nLa = laCav.length - 1, gaps = [Math.round(nLa * 0.43), Math.round(nLa * 0.63)], gw = 2;
  const laRibs = [], pvWalls = [];
  let from = 0;
  for (const gi of gaps) {
    laRibs.push(ribbon(laCav.slice(from, gi - gw + 1), laOut.slice(from, gi - gw + 1)));
    from = gi + gw;
    const d = unit(add(unit(sub(laCav[gi], laC)), mul(ldown, 0.7)));
    for (const e of [gi - gw, gi + gw]) pvWalls.push([laOut[e], add(add(laOut[e], mul(d, 0.95)), mul(sub(laOut[e], laOut[gi]), 0.35))]);
  }
  laRibs.push(ribbon(laCav.slice(from), laOut.slice(from)));
  // right atrium below the tricuspid annulus
  const rdown = unit(add(mul(ax, -1), mul(out, 0.18)));
  const iasTop = add(S0, mul(nl, -0.38));
  // in tamponade the RA free wall folds inward at end-diastole and into systole
  const raPts = [
    TL,
    add(add(TL, mul(rdown, raL * 0.35)), mul(out, Math.max(0.1, raW - ta) * 0.7 - raW * 0.5 * raIn)),
    add(add(iasTop, mul(rdown, raL * 0.72)), mul(out, raW * (0.95 - 0.55 * raIn))),
    add(add(iasTop, mul(rdown, raL)), mul(out, raW * (0.45 - 0.12 * raIn))),
    add(add(iasTop, mul(ldown, raL * 0.75)), mul(out, 0.04)),
    add(add(iasTop, mul(ldown, raL * 0.3)), mul(out, 0.02)),
    add(iasTop, mul(ax, 0.12)),
    TS,
  ];
  const raCav = spline(raPts, 10);
  const raC = centroid(raCav);
  const raOut = offsetAway(raCav, 0.17, raC);
  const raRib = ribbon(raCav, raOut);
  // crux: fibrous tissue between the two annuli and the atrial septum
  const crux = [S0, add(S0, mul(ldown, 0.5)), add(iasTop, mul(rdown, 0.6)), add(iasTop, mul(ax, 0.12)), TS, rvSep[0]];
  const annuli = [ellipse(S0, 0.2, 0.2, 12), ellipse(L0, 0.22, 0.2, 12), ellipse(TL, 0.18, 0.18, 12)];
  // anterolateral papillary muscle on the lateral wall, its head toward the mitral valve
  const pmBase = lat[Math.round(N * 0.56)];
  const pmDir = unit(add(mul(nl, -0.85), mul(ax, -0.5)));
  const pm = muscle(pmBase, pmDir, 0.9, 0.8 + 0.25 * c, nl);
  const pmTip = add(pmBase, mul(pmDir, 0.82));
  // valves. Mitral: anterior leaflet on the septal side (2.5 cm), posterior on the lateral side
  // (1.5 cm). Tricuspid: septal leaflet (1.5 cm), anterior leaflet on the free wall (2.1 cm).
  const valve = apValve;
  const [mvV, mvK] = mitralOf(g.mv, g.mvK ?? 1);   // mvK: longer leaflets span a dilated annulus
  const mv = valve(S0, L0, ax, 2.5 * mvK, 1.5 * mvK, mvV, ph.mvShut);
  const Tc = lerp2(TS, TL, 0.5);
  const rvAx = unit(sub(Ra, Tc));
  const tv = valve(TS, TL, rvAx, 1.5, 2.1, g.tv, ph.tvShut);
  // chordae fan out from the papillary head to the free edges and the bodies of both leaflets
  const pmSide = perp(pmDir);
  const chords = [[pmTip, along(mv.l2, 0.97)], [pmTip, along(mv.l2, 0.6)], [add(pmTip, mul(pmSide, 0.12)), along(mv.l1, 0.97)], [add(pmTip, mul(pmSide, 0.12)), along(mv.l1, 0.72)], [add(pmTip, mul(pmSide, -0.1)), along(mv.l1, 0.5)]];
  // pericardium round the free walls, from one atrioventricular groove to the other. It follows
  // the convex envelope of the ventricles' outer walls, so it bridges the interventricular
  // groove (epicardial fat fills it) and never cuts into a wall; a collapsing RV wall pulls away
  // from it. Fluid widens the space most round the apex and the free walls, least at the grooves
  const heartC = centroid([lvC, rvC, laC, raC]);
  const eff = g.effusion ?? 0;
  const rvOut0 = rvIn > 0.001 ? offsetAway(rvFreeAt(0), rvWall, rvC) : rvOut;
  const wallsOut = [add(rvOut0[rvOut0.length - 1], mul(out, 0.1)), ...rvOut0.slice().reverse(), ...lvOut, add(L0, mul(nl, wall + 0.25))];
  const hull = envelope(wallsOut);
  const fat = ribbon(hull, wallsOut);        // on the heart: it moves when the heart swings
  let peri = offsetAway(hull, 0.13, heartC);
  if (eff > 0.01) {
    // the sac, pushed out along lines from the middle of the heart (they never cross)
    const n = peri.length - 1;
    peri = peri.map((p, i) => add(p, mul(unit(sub(p, heartC)), eff * (0.2 + 0.8 * Math.pow(Math.max(0, Math.sin((Math.PI * i) / n)), 0.6)))));
  }
  // outside the sac: lung and fat, grey, so that the fluid shows as the dark band inside it
  const outer = g.effusion === undefined ? null : ribbon(peri, offsetAway(peri, 1.6, heartC));
  // behind the atria: mediastinum, with the descending aorta beside the left atrium
  const yDeep = Math.max(...laCav.map((p) => p[1]), ...raCav.map((p) => p[1]));
  const medi = [[raC[0] - raW * 0.95, yDeep - 1.1], [laC[0] + laW * 0.95, yDeep - 1.1], [laC[0] + laW + 3.5, 30], [raC[0] - raW - 3.5, 30]];
  const daC = add(laPts[4], add(mul(ldown, 1.45), mul(nl, 0.55)));
  const shape = {
    A, B, S0, L0, TS, TL, Ra, ax, nl, out, lvC, rvC, laC, raC, lvCav, lvCavT, laCav, raCav, rvFree, rvFreeT, rvSep, rvSepEndo, rvSepEndoT, rvStrands,
    lvOut, rvOut, laOut, raOut, ivsRib, lvRib, rvRib, laRibs, raRib, pvWalls, crux, annuli, pm, mb, mv, tv, chords, mvShut: ph.mvShut,
    daRing: ring(daC, 0.95, 1.17, 28), daLumen: ellipse(daC, 0.95, 0.95, 28), lvW, lvL, rvW, laW, laL, raW, raL, ma, ta, fat,
  };
  // a swinging heart moves inside a sac that stays put. It rocks about the middle of the
  // atrioventricular plane, so the apex travels farthest (sw[0], cm) and the grooves, where
  // the fluid is thinnest, hardly move sideways; and it bobs a little (sw[1], cm)
  const sw = dyn.swing;
  let moved = shape;
  if (sw && (sw[0] || sw[1])) {
    const pv = lerp2(TL, L0, 0.5), th = sw[0] / lvL, cs = Math.cos(th), sn = Math.sin(th);
    const rot = (v) => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs];
    moved = mapShape(shape, (p) => add(add(pv, rot(sub(p, pv))), [0, sw[1]]), rot, ['ax', 'nl', 'out']);
  }
  return { ...moved, peri, outer, medi };
}
/** Every point in a nested shape through f; the directions named in dirs through g. */
function mapShape(x, f, g, dirs = []) {
  if (Array.isArray(x)) {
    if (x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'number') return f(x);
    return x.map((y) => mapShape(y, f, g));
  }
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) o[k] = dirs.includes(k) ? g(v) : mapShape(v, f, g);
    return o;
  }
  return x;
}

function a4cItems(S, Sr, g) {
  return [
    ...(S.outer ? [{ polys: [S.outer], refs: [Sr.outer], e: -11 }] : []),
    { polys: [S.medi], e: -21 },
    { polys: [S.fat], refs: [Sr.fat], e: DB.fat - 2 },
    { polys: [S.laCav, S.raCav, S.daLumen], e: DB.blood, blood: true },
    { polys: [S.daRing], refs: [Sr.daRing], e: DB.fibrous - 2 },
    { polys: [S.lvRib], refs: [Sr.lvRib], e: DB.myo },
    { polys: [S.ivsRib], refs: [Sr.ivsRib], e: DB.myo },
    { polys: [S.rvRib], refs: [Sr.rvRib], e: DB.myo - 1 },
    { polys: S.laRibs, refs: Sr.laRibs, e: DB.myo - 5 },
    { polys: [S.raRib], refs: [Sr.raRib], e: DB.myo - 5 },
    { polys: [S.crux], refs: [Sr.crux], e: DB.fibrous },
    { polys: S.annuli, refs: Sr.annuli, e: DB.fibrous + 1 },
    { polys: [S.pm], refs: [Sr.pm], e: DB.myo },
    { lines: [S.mb], refs: [Sr.mb], e: DB.myo, w: 0.3 },
    { lines: S.rvStrands, refs: Sr.rvStrands, e: DB.myo - 2, w: 0.12 },
    { lines: S.pvWalls, refs: Sr.pvWalls, e: -7, w: 0.1 },
    { borders: [S.lvCavT], refs: [Sr.lvCavT], e: DB.myo, spec: 8 },
    { borders: [S.rvSepEndoT, S.rvFreeT], refs: [Sr.rvSepEndoT, Sr.rvFreeT], e: DB.myo, spec: 7 },
    { borders: [S.laCav, S.raCav], refs: [Sr.laCav, Sr.raCav], e: DB.myo - 2, spec: 6 },
    { borders: [S.lvOut, S.rvOut], refs: [Sr.lvOut, Sr.rvOut], e: DB.myo, spec: 6 },
    { borders: [S.peri], refs: [Sr.peri], e: 7, spec: 10, w: 0.14, all: true },
    { lines: S.chords, e: DB.chord - 3 - 14 * (1 - S.mvShut), w: 0.04 },
    ...leaves([S.mv.o1, S.mv.o2], [Sr.mv.o1, Sr.mv.o2], valveDb(g.mv)),
    ...leaves([S.tv.o1, S.tv.o2], [Sr.tv.o1, Sr.tv.o2], valveDb(g.tv) - 1),
  ];
}

/**
 * g (cm; [ED, ES] pairs beat with the heart):
 *   lvL, lvW, lvWall, ivs, rvW, rvWall, laW, laL ([min, max]), raW, raL, ma (mitral annulus),
 *   ta (tricuspid annulus), mv: {thick, gap, dome, tip}, tv: {thick, gap}
 * o: t (ms), ph (the phase, in place of t's), title, depth, color (the scanner format: see
 *    a4cFlows) or jets: {mr, tr, ms} (the plume format: see jet()), labels (false, or a list such
 *    as ['LA', 'RA']), gain, after(ctx, F, geo)
 * Returns the geometry (cm) for labels and measurements.
 */
export function drawA4C(ctx, box, g, o = {}) {
  const ph = o.ph ?? phase(o.t ?? 150);
  const c = ph.c, C = o.color;
  // the reference frame: end-diastole with the valves shut, where the speckle is laid down
  const S = a4cShape(g, c, ph, o.dyn), Sr = a4cShape(g, 0, { ...ph, mvShut: 1, tvShut: 1 });
  const zc = C?.zoom ? (C.zoom.at === 'tv' ? Sr.tv : Sr.mv).gapMid : null;
  const F = frame(ctx, box, o.depth ?? 16, o.title ?? 'APICAL FOUR-CHAMBER', { deg: 80, near: 1.2, zoom: zc && { c: zc, span: C.zoom.span } });
  scan(ctx, F, a4cItems(S, Sr, g), { t: o.t, gain: o.gain });
  if (C) {
    // the color box keeps still through the beat: it covers the chambers at both ends of it
    const key = `a4c|${HEART}|${C.roi}|${C.reach ?? ''}|${F.view.half}|${JSON.stringify(g)}`;
    colorFlow(ctx, F, {
      box: cachedBox(key, () => a4cBox([Sr, a4cShape(g, 1, { ...ph, mvShut: 1, tvShut: 1 })], C, F.view.half)), lo: C.lo, hi: C.hi, variance: C.variance,
      blood: [S.lvCav, S.laCav, S.raCav, [...S.rvSepEndo, ...S.rvFree]],
      tissue: [S.mv.o1, S.mv.o2, S.tv.o1, S.tv.o2, S.pm, ...S.annuli],
      flows: a4cFlows(S, o.t ?? ph.t ?? 150, C), stats: cfDebug.stats,
    });
    barFor(ctx, F, C.lo, C.hi);
  }
  const J = o.jets;
  if (J) {
    const ldown = unit(add(mul(S.ax, -1), mul(S.nl, 0.12))), rdown = unit(add(mul(S.ax, -1), mul(S.out, 0.18)));
    if (J.mr) jet(ctx, F, { ...J.mr, O: S.mv.gapMid, dir: J.mr.dir ?? ldown, clip: S.laCav });
    if (J.tr) jet(ctx, F, { ...J.tr, O: S.tv.gapMid, dir: rdown, clip: S.raCav });
    if (J.ms) jet(ctx, F, { ...J.ms, O: S.mv.tip, dir: S.ax, clip: S.lvCav });
    const any = J.mr || J.tr || J.ms;
    if (any) barFor(ctx, F, -any.va, any.va);
  }
  const geo = { ...S, F, c, ph };
  // the hook first: the tags keep clear of the measurement box it draws
  if (o.after) o.after(ctx, F, geo);
  const want = (k) => (Array.isArray(o.labels) ? o.labels.includes(k) : o.labels !== false);
  if (want('LV')) tag(ctx, F, 'LV', add(S.lvC, mul(S.ax, 0.8)));
  if (want('RV')) tag(ctx, F, 'RV', add(centroid(S.rvFree), mul(S.out, -0.2)));
  if (want('LA')) tag(ctx, F, 'LA', S.laC);
  if (want('RA')) tag(ctx, F, 'RA', S.raC);
  finish(ctx, F);
  return geo;
}

// ---------------------------------------------------------------- apical two-chamber
/**
 * The A2C structures (cm) at contraction c: the LV with the inferior wall on screen-left and the
 * anterior wall on screen-right, both papillary muscles, the mitral valve, the LA below it and
 * the coronary sinus in the inferior atrioventricular groove. g as for drawA4C (lvL, lvW, lvWall,
 * laW, laL, ma, mv, mvK, effusion); both LV walls take lvWall.
 */
function a2cShape(g, c, ph) {
  const lvL = at(g.lvL, c), lvW = at(g.lvW, c), wall = at(g.lvWall, c);
  const laW = at(g.laW, c), laL = at(g.laL, c), ma = at(g.ma ?? 3.1, c);
  const apexY = 1.9 + 0.65 * wall + 0.7 * (g.effusion ?? 0);
  const A = [0.1, apexY], B = [0.4, apexY + Math.sqrt(lvL * lvL - 0.09)];   // lvL from apex to annulus center
  const ax = unit(sub(A, B));                          // base -> apex
  let nl = perp(ax); if (nl[0] < 0) nl = mul(nl, -1);  // toward the anterior wall
  const N = 36;
  const widthAt = (u) => lvWidth(u, lvW, ma);
  const Pax = (u) => lerp2(B, A, u);
  const U = (i) => { const x = i / N; return x <= 0.8 ? x : 0.8 + 0.2 * (1 - (1 - (x - 0.8) / 0.2) ** 2); };
  const inf = [], ant = [];
  for (let i = 0; i <= N; i++) {
    const u = U(i), w = widthAt(u);
    inf.push(add(Pax(u), mul(nl, -w * 0.5 * (1 - 0.04 * Math.sin(Math.PI * u)))));
    ant.push(add(Pax(u), mul(nl, w * 0.5 * (1 + 0.04 * Math.sin(Math.PI * u)))));
  }
  const lvCav = [...inf, ...ant.slice(0, -1).reverse()];   // inferior hinge -> apex -> anterior hinge
  const S0 = inf[0], L0 = ant[0];
  const lvC = centroid(lvCav);
  const trab = (u) => 0.13 * smooth((u - 0.58) / 0.3);
  const infT = trabeculate(inf, trab, lvC, 1.1), antT = trabeculate(ant, trab, lvC, 2.7);
  const lvCavT = [...infT, ...antT.slice(0, -1).reverse()];
  // one U of muscle, thinner at the apex and at the annulus as in the four-chamber view
  const lvOut = offsetAway(lvCav, (u) => wall * (1 - 0.32 * Math.exp(-(((u - 0.5) / 0.16) ** 2))) * (1 - 0.4 * smooth((Math.abs(u - 0.5) - 0.42) / 0.08)), lvC);
  const lvRib = ribbon(lvCavT, lvOut);
  // left atrium below the annulus
  const ldown = mul(ax, -1);
  const mid = lerp2(S0, L0, 0.5), side = Math.max(0.1, (laW - ma) / 2);
  const laCav = spline([
    S0,
    add(add(S0, mul(ldown, laL * 0.35)), mul(nl, -side * 0.8)),
    add(add(mid, mul(ldown, laL * 0.92)), mul(nl, -laW * 0.42)),
    add(mid, mul(ldown, laL * 1.03)),
    add(add(mid, mul(ldown, laL * 0.9)), mul(nl, laW * 0.46)),
    add(add(L0, mul(ldown, laL * 0.35)), mul(nl, side * 0.9)),
    L0,
  ], 10);
  const laC = centroid(laCav);
  const laOut = offsetAway(laCav, 0.18, laC);
  const annuli = [ellipse(S0, 0.2, 0.2, 12), ellipse(L0, 0.22, 0.2, 12)];
  const csC = add(add(S0, mul(nl, -(wall + 0.45))), mul(ldown, 0.35));
  // papillary muscles: posteromedial on the inferior wall, anterolateral on the anterior wall
  const pmI = inf[Math.round(N * 0.56)], pmA = ant[Math.round(N * 0.56)];
  const dI = unit(add(mul(nl, 0.85), mul(ax, -0.5))), dA = unit(add(mul(nl, -0.85), mul(ax, -0.5)));
  const pm = [muscle(pmI, dI, 0.9, 0.75 + 0.25 * c, mul(nl, -1)), muscle(pmA, dA, 0.9, 0.75 + 0.25 * c, nl)];
  const tipI = add(pmI, mul(dI, 0.82)), tipA = add(pmA, mul(dA, 0.82));
  // mitral valve: the posterior leaflet on the inferior side (1.5 cm), the anterior on the anterior side (2.3 cm)
  const [mvV, mvK] = mitralOf(g.mv, g.mvK ?? 1);
  const mv = apValve(S0, L0, ax, 1.5 * mvK, 2.3 * mvK, mvV, ph.mvShut);
  const chords = [[tipI, along(mv.l1, 0.97)], [tipI, along(mv.l1, 0.6)], [tipA, along(mv.l2, 0.97)], [tipA, along(mv.l2, 0.7)], [add(tipA, mul(nl, -0.12)), along(mv.l2, 0.5)]];
  // pericardium round the LV, from one atrioventricular groove to the other
  const wallsOut = [add(S0, mul(nl, -(wall + 0.25))), ...lvOut, add(L0, mul(nl, wall + 0.25))];
  const hull = envelope(wallsOut);
  const fat = ribbon(hull, wallsOut);
  const eff = g.effusion ?? 0;
  let peri = offsetAway(hull, 0.13, lvC);
  if (eff > 0.01) {
    const n = peri.length - 1;
    peri = peri.map((p, i) => add(p, mul(unit(sub(p, lvC)), eff * (0.2 + 0.8 * Math.pow(Math.max(0, Math.sin((Math.PI * i) / n)), 0.6)))));
  }
  const outer = g.effusion === undefined ? null : ribbon(peri, offsetAway(peri, 1.6, lvC));
  const yDeep = Math.max(...laCav.map((p) => p[1]));
  const medi = [[laC[0] - laW - 1.2, yDeep - 0.8], [laC[0] + laW + 1.2, yDeep - 0.8], [laC[0] + laW + 4, 30], [laC[0] - laW - 4, 30]];
  return {
    A, B, S0, L0, ax, nl, lvC, laC, lvCav, lvCavT, laCav, lvOut, laOut, lvRib, laRib: ribbon(laCav, laOut), annuli, pm, mv, chords,
    fat, peri, outer, medi, csRing: ring(csC, 0.3, 0.44, 20), csLumen: ellipse(csC, 0.3, 0.3, 20), mvShut: ph.mvShut, lvW, lvL,
  };
}

function a2cItems(S, Sr, g) {
  return [
    ...(S.outer ? [{ polys: [S.outer], refs: [Sr.outer], e: -11 }] : []),
    { polys: [S.medi], e: -21 },
    { polys: [S.fat], refs: [Sr.fat], e: DB.fat - 2 },
    { polys: [S.laCav, S.csLumen], e: DB.blood, blood: true },
    { polys: [S.lvRib], refs: [Sr.lvRib], e: DB.myo },
    { polys: [S.laRib], refs: [Sr.laRib], e: DB.myo - 5 },
    { polys: [S.csRing], refs: [Sr.csRing], e: DB.fibrous - 4 },
    { polys: S.annuli, refs: Sr.annuli, e: DB.fibrous + 1 },
    { polys: S.pm, refs: Sr.pm, e: DB.myo },
    { borders: [S.lvCavT], refs: [Sr.lvCavT], e: DB.myo, spec: 8 },
    { borders: [S.laCav], refs: [Sr.laCav], e: DB.myo - 2, spec: 6 },
    { borders: [S.lvOut], refs: [Sr.lvOut], e: DB.myo, spec: 6 },
    { borders: [S.peri], refs: [Sr.peri], e: 7, spec: 10, w: 0.14, all: true },
    { lines: S.chords, e: DB.chord - 3 - 14 * (1 - S.mvShut), w: 0.04 },
    ...leaves([S.mv.o1, S.mv.o2], [Sr.mv.o1, Sr.mv.o2], valveDb(g.mv)),
  ];
}

/** Apical two-chamber view; g and o as for drawA4C (no color flow). Returns the geometry (cm). */
export function drawA2C(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 16, o.title ?? 'APICAL TWO-CHAMBER', { deg: 80, near: 1.2 });
  const ph = o.ph ?? phase(o.t ?? 150);
  const c = ph.c;
  const S = a2cShape(g, c, ph), Sr = a2cShape(g, 0, { ...ph, mvShut: 1 });
  scan(ctx, F, a2cItems(S, Sr, g), { t: o.t, gain: o.gain });
  const geo = { ...S, F, c, ph };
  if (o.after) o.after(ctx, F, geo);
  const want = (k) => (Array.isArray(o.labels) ? o.labels.includes(k) : o.labels !== false);
  if (want('LV')) tag(ctx, F, 'LV', add(S.lvC, mul(S.ax, 0.8)));
  if (want('LA')) tag(ctx, F, 'LA', S.laC);
  finish(ctx, F);
  return geo;
}

/**
 * The tracing of an apical view for the method of disks (the geometry drawA4C or drawA2C returns):
 * the border of the compacted myocardium (trabeculae in the cavity), closed by a straight line
 * across the mitral annulus; the length L from the middle of that line to the farthest point of
 * the border; n disks square to it. d: the disk diameters (cm).
 */
export function lvTrace(geo, n = 20) {
  const poly = geo.lvCav, M = lerp2(geo.S0, geo.L0, 0.5);
  let A = poly[0];
  for (const p of poly) if (len(sub(p, M)) > len(sub(A, M))) A = p;
  const L = len(sub(A, M)), u = unit(sub(A, M)), q = perp(u);
  // the nearest crossing of the ray P + t dir (t > 0) with the border
  const hit = (P, dir) => {
    let best = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], e = sub(poly[i + 1], a), den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, P);
      const t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
    }
    return best;
  };
  const disks = [], d = [];
  for (let i = 0; i < n; i++) {
    const P = add(M, mul(u, ((i + 0.5) / n) * L));
    const t1 = hit(P, q), t2 = hit(P, mul(q, -1));
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) { d.push(0); continue; }
    disks.push([add(P, mul(q, t1)), add(P, mul(q, -t2))]);
    d.push(t1 + t2);
  }
  return { M, A, L, disks, d, border: poly };
}

// ---------------------------------------------------------------- apical five-chamber
/**
 * Every A5C structure (cm) at contraction c: the four-chamber plane tilted toward the front, so
 * that the LV outflow tract, the aortic valve and the aortic root lie between the septum and the
 * mitral valve, with the RA on their left and the LA on their right. The aortic annulus lies on
 * the LV base next to the septum; the anterior mitral leaflet hinges on the root beside it; the
 * aorta runs down the scan line through the valve, the line of the CW Doppler. g as for drawA5C.
 */
function a5cShape(g, c, ph) {
  const lvL = at(g.lvL, c), lvW = at(g.lvW, c), wall = at(g.lvWall, c), ivs = at(g.ivs, c);
  const rvW = at(g.rvW, c), rvWall = at(g.rvWall ?? 0.4, c);
  const laW = at(g.laW, c), laL = at(g.laL, c), raW = at(g.raW, c), raL = at(g.raL, c), ta = at(g.ta ?? 3.0, c);
  const lvot = g.lvot ?? 2.0, root = Math.max(g.root ?? 3.1, lvot + 0.5), asc = g.asc ?? (HEART === 'bav' ? 3.9 : 3.0);
  // the LV base in this plane: the aortic annulus (as wide as the LVOT), 2 mm of aortic-mitral
  // curtain and the mitral annulus as the plane cuts it; together about as wide as the LV
  const ma = clamp(at(g.lvW, 0) * 1.02 - lvot - 0.2, 1.8, 2.8);
  const bw = lvot + 0.2 + ma;
  const apexY = 1.9 + 0.65 * wall;
  const A = [0.2, apexY];
  // the base sits so that the valve lies under the probe, 0.45 cm left of the midline
  const bx = -0.45 + 0.44 * bw - lvot / 2;
  const B = [bx, apexY + Math.sqrt(Math.max(lvL * lvL - (bx - A[0]) ** 2, 0.25 * lvL * lvL))];
  const ax = unit(sub(A, B));                          // base -> apex
  let nl = perp(ax); if (nl[0] < 0) nl = mul(nl, -1);  // toward the lateral wall
  const out = mul(nl, -1);                             // toward the RV free wall
  const N = 36;
  const Pax = (u) => lerp2(B, A, u);
  const U = (i) => { const x = i / N; return x <= 0.8 ? x : 0.8 + 0.2 * (1 - (1 - (x - 0.8) / 0.2) ** 2); };
  const sep = [], lat = [];
  const lvW0 = at(g.lvW, 0);
  for (let i = 0; i <= N; i++) {
    const u = U(i), w = lvWidth(u, lvW, bw), w0 = lvWidth(u, lvW0, bw);
    // the septum under the aortic valve is the front wall of the outflow tract: it keeps its place
    // through systole (the LVOT keeps its diameter), and the septum below it moves as in the A4C
    const k = smooth((u - 0.12) / 0.28);
    sep.push(add(Pax(u), mul(nl, -(SEP * w0 - k * SEP_SYS * (w0 - w)) * (1 - 0.06 * Math.sin(Math.PI * u)))));
    lat.push(add(Pax(u), mul(nl, ((1 - SEP) * w0 - (1 - SEP_SYS) * (w0 - w)) * (1 + 0.05 * Math.sin(Math.PI * u)))));
  }
  const lvCav = [...sep, ...lat.slice(0, -1).reverse()];   // aortic annulus (septal hinge) -> apex -> lateral mitral hinge
  const Al = sep[0], L0 = lat[0];
  const lvC = centroid(lvCav);
  const trab = (u) => 0.13 * smooth((u - 0.58) / 0.3);
  const sepT = trabeculate(sep, trab, lvC, 0.7), latT = trabeculate(lat, trab, lvC, 2.1);
  const lvCavT = [...sepT, ...latT.slice(0, -1).reverse()];
  const sepN = sep.map((p, i) => unit(perp(sub(sep[Math.min(N, i + 1)], sep[Math.max(0, i - 1)]))));
  const sepSg = sideAway(sep, sepN, lvC);
  const nsep = (i) => mul(sepN[i], sepSg);
  // the septum thins over its last centimetre, the membranous part under the aortic valve
  const rvSep = sep.map((p, i) => add(p, mul(nsep(i), ivs * (1 - 0.25 * (i / N) ** 3) * mix(0.35, 1, smooth(U(i) / 0.12)))));
  const iRvApex = Math.round(N * 0.74);
  const ivsRib = ribbon(sepT.slice(0, iRvApex + 2), rvSep.slice(0, iRvApex + 2));
  const lvFree = lvCav.slice(iRvApex - 1), lvFreeT = lvCavT.slice(iRvApex - 1);
  const lvOut = offsetAway(lvFree, (u) => wall * (0.68 + 0.32 * smooth((u - 0.35) / 0.4)) * (1 - 0.4 * smooth((u - 0.9) / 0.1)), lvC);
  const lvRib = ribbon(lvFreeT, lvOut);
  // RV, as in the four-chamber view
  const iTv = Math.round(N * 0.055);
  const TS = rvSep[iTv], Ra = rvSep[iRvApex];
  const TL = add(add(TS, mul(out, ta)), mul(ax, 0.15));
  const rvFree = spline([Ra, add(rvSep[Math.round(N * 0.66)], mul(out, rvW * 0.5)), add(rvSep[Math.round(N * 0.48)], mul(out, rvW * 0.82)),
    add(add(rvSep[Math.round(N * 0.2)], mul(out, rvW)), mul(ax, -0.1)), TL], 10);
  const rvC = centroid([...rvSep.slice(iTv, iRvApex + 1), ...rvFree]);
  const rvFreeT = trabeculate(rvFree, (u) => 0.24 * (1 - smooth((u - 0.1) / 0.5)), rvC, 1.3);
  const rvOut = offsetAway(rvFree, rvWall, rvC);
  const rvRib = ribbon(rvFreeT, rvOut);
  const rvSepEndo = rvSep.slice(iTv, iRvApex + 1);
  const rvSepEndoT = trabeculate(rvSepEndo, (u) => 0.12 * smooth((u - 0.62) / 0.3), rvC, 2.4);
  const mbS = rvSep[Math.round(N * 0.56)];
  let jb = 0, db = Infinity;
  for (let j = 0; j < rvFree.length * 0.6; j++) { const d = Math.abs(dot(sub(rvFree[j], mbS), ax)); if (d < db) { db = d; jb = j; } }
  const mb = spline([add(mbS, mul(out, 0.05)), add(lerp2(mbS, rvFree[jb], 0.5), mul(ax, 0.22)), rvFree[jb]], 6);
  const rvStrands = [[0.66, 0.1, 0.06], [0.62, 0.2, -0.05], [0.7, 0.05, 0.03]].map(([fs, ff, bend]) => {
    const a = rvSep[Math.round(N * fs)], b = along(rvFree, ff);
    return spline([a, add(lerp2(a, b, 0.5), mul(ax, bend)), b], 5);
  });
  // the aortic root: from the annulus down the scan line through the valve. Sinuses to the root
  // diameter 1.1 cm past the annulus, a waist at the sinotubular junction, then the ascending
  // aorta. Points as depth d past the annulus and offset y across the aorta (right +)
  const Ar = add(Al, mul(nl, lvot)), Av = lerp2(Al, Ar, 0.5);
  const dn = unit(Av);
  let nlo = perp(dn); if (nlo[0] < 0) nlo = mul(nlo, -1);
  const axo = (d, y) => add(add(Av, mul(dn, d)), mul(nlo, y));
  const stj = Math.min(root, asc) * 0.9;
  const radius = (d) => (d < 1.1 ? mix(lvot / 2, root / 2, smooth(d / 1.1)) : d < 2.6 ? mix(root / 2, stj / 2, smooth((d - 1.1) / 1.5)) : mix(stj / 2, asc / 2, smooth((d - 2.6) / 1.4)));
  const AW = 0.24;                                       // the aortic wall
  const tube = (sg, extra) => Array.from({ length: 41 }, (_, i) => {
    if (i === 0) return add(sg < 0 ? Al : Ar, mul(nl, sg * extra));
    const d = 11 * (i / 40) ** 1.35;
    return axo(d, sg * (radius(d) + extra));
  });
  const aoL = tube(-1, 0), aoR = tube(1, 0);
  const aoLumen = [...aoL, ...aoR.slice().reverse()];
  const aoWalls = [ribbon(aoL, tube(-1, AW)), ribbon(aoR, tube(1, AW))];
  // the atria lie against the root: their walls touch its outer surface
  const rOut = (d, wl) => radius(d) + AW + wl;
  // valves. Mitral: the anterior leaflet hinges on the root, beside the aortic annulus (2.4 cm);
  // the posterior leaflet hinges on the lateral annulus (1.5 cm). Tricuspid as in the A4C.
  const Ma = add(Ar, mul(nl, 0.2));
  const [mvV, mvK] = mitralOf(g.mv, 1);
  const mv = apValve(Ma, L0, ax, 2.4 * mvK, 1.5 * mvK, mvV, ph.mvShut);
  const tv = apValve(TS, TL, unit(sub(Ra, lerp2(TS, TL, 0.5))), 1.5, 2.1, g.tv, ph.tvShut);
  // the aortic cusps, built across the aorta (x down it, y across it) as in the long axis: shut,
  // they meet past the annulus and sag toward the LV; open, they lie along the sinus walls, or a
  // stiff valve opens only to open (cm) and its cusps dome into the aorta. A bicuspid valve shuts
  // off-centre (the larger, fused cusp reaches past the middle), always domes in systole and
  // opens off-centre.
  const toL = (P) => { const d = sub(P, Av); return [dot(d, dn), dot(d, nlo)]; };
  const fromL = (p) => axo(p[0], p[1]);
  const half = lvot / 2, avGap = g.av?.gap ?? 0;
  const openW = clamp(g.av?.open ?? lvot - 0.1, 0.12, lvot - 0.1);
  const bav = g.av?.bicuspid ?? HEART === 'bav';
  const C0 = [0.85, (g.av?.ecc ?? (bav ? 0.35 : 0)) * half];
  const yc = bav ? 0.3 * half : 0;
  const stiff = bav ? 1 : smooth((lvot - 0.1 - openW) / 0.6);
  const cuspOf = (h, sgn) => {
    const lc = Math.hypot(0.8, Math.abs(h[1] - C0[1]) - 0.05) * 1.04 + 0.12;
    const shut = flap(h, add(C0, [0, (sgn * avGap) / 2]), lc, [-1, 0], avGap > 0.02 ? null : [1, 0], 0.12);
    const end = lerp2(add(h, mul(unit([0.97, sgn * 0.12]), lc * 0.96)), [0.35 + lc * 0.55, yc + (sgn * openW) / 2], stiff);
    const open = flap(h, end, lc, unit(lerp2([0, sgn], [0.5, sgn * 0.85], stiff)));
    return swing(h, shut, open, ph.avOpen).map(fromL);
  };
  const cuspL = cuspOf(add(toL(Al), [0.05, 0.05]), -1), cuspR = cuspOf(add(toL(Ar), [0.05, -0.05]), 1);
  const avTh = g.av?.thick ?? 0.1;
  const cuspLo = leafOutline(cuspL, avTh * 0.8, avTh * 1.3), cuspRo = leafOutline(cuspR, avTh * 0.8, avTh * 1.3);
  const avTip = lerp2(cuspL[NL], cuspR[NL], 0.5);
  // left atrium beside the root, below the mitral valve; pulmonary veins through its roof
  const ldown = unit(add(mul(ax, -1), mul(nl, 0.12)));
  const laPts = [
    Ma,
    axo(0.9, rOut(0.9, 0.18)),
    axo(laL * 0.78, rOut(laL * 0.78, 0.18)),
    add(add(Ma, mul(ldown, laL)), mul(nl, laW * 0.5)),
    add(add(Ma, mul(ldown, laL * 0.74)), mul(nl, laW * 0.97)),
    add(add(L0, mul(ldown, laL * 0.3)), mul(nl, Math.max(0.1, laW - ma) * 0.75)),
    L0,
  ];
  const laCav = spline(laPts, 10);
  const laC = centroid(laCav);
  const laOut = offsetAway(laCav, 0.18, laC);
  const nLa = laCav.length - 1, gaps = [Math.round(nLa * 0.45), Math.round(nLa * 0.65)], gw = 2;
  const laRibs = [], pvWalls = [];
  let from = 0;
  for (const gi of gaps) {
    laRibs.push(ribbon(laCav.slice(from, gi - gw + 1), laOut.slice(from, gi - gw + 1)));
    from = gi + gw;
    const d = unit(add(unit(sub(laCav[gi], laC)), mul(ldown, 0.7)));
    for (const e of [gi - gw, gi + gw]) pvWalls.push([laOut[e], add(add(laOut[e], mul(d, 0.95)), mul(sub(laOut[e], laOut[gi]), 0.35))]);
  }
  laRibs.push(ribbon(laCav.slice(from), laOut.slice(from)));
  // right atrium beside the root, below the tricuspid valve
  const rdown = unit(add(mul(ax, -1), mul(out, 0.18)));
  const raPts = [
    TL,
    add(add(TL, mul(rdown, raL * 0.35)), mul(out, Math.max(0.1, raW - ta) * 0.7)),
    add(axo(raL * 0.72, -rOut(raL * 0.72, 0.17)), mul(nlo, -raW * 0.9)),
    axo(raL * 0.98, -rOut(raL * 0.98, 0.17) - raW * 0.4),
    axo(raL * 0.6, -rOut(raL * 0.6, 0.17)),
    axo(0.8, -rOut(0.8, 0.17)),
    TS,
  ];
  const raCav = spline(raPts, 10);
  const raC = centroid(raCav);
  const raOut = offsetAway(raCav, 0.17, raC);
  const raRib = ribbon(raCav, raOut);
  // fibrous tissue: the membranous septum between the RA and the LVOT, and round the root
  const memb = [Al, ...rvSep.slice(0, iTv + 1), axo(0.8, -rOut(0.8, 0.02)), axo(0.4, -(radius(0.4) + AW))];
  const annuli = [ellipse(Ma, 0.2, 0.2, 12), ellipse(L0, 0.22, 0.2, 12), ellipse(TL, 0.18, 0.18, 12)];
  // papillary muscle and chordae, as in the A4C
  const pmBase = lat[Math.round(N * 0.56)];
  const pmDir = unit(add(mul(nl, -0.85), mul(ax, -0.5)));
  const pm = muscle(pmBase, pmDir, 0.9, 0.8 + 0.25 * c, nl);
  const pmTip = add(pmBase, mul(pmDir, 0.82));
  const pmSide = perp(pmDir);
  const chords = [[pmTip, along(mv.l2, 0.97)], [pmTip, along(mv.l2, 0.6)], [add(pmTip, mul(pmSide, 0.12)), along(mv.l1, 0.97)], [add(pmTip, mul(pmSide, 0.12)), along(mv.l1, 0.72)], [add(pmTip, mul(pmSide, -0.1)), along(mv.l1, 0.5)]];
  // pericardium and fat round the free walls; mediastinum behind the atria; tissue round the
  // root between the atria (the chambers and the aorta are cut out of it)
  const heartC = centroid([lvC, rvC, laC, raC]);
  const wallsOut = [add(rvOut[rvOut.length - 1], mul(out, 0.1)), ...rvOut.slice().reverse(), ...lvOut, add(L0, mul(nl, wall + 0.25))];
  const hull = envelope(wallsOut);
  const fat = ribbon(hull, wallsOut);
  const peri = offsetAway(hull, 0.13, heartC);
  const yDeep = Math.max(...laCav.map((p) => p[1]), ...raCav.map((p) => p[1]));
  const medi = [[raC[0] - raW * 0.95, yDeep - 1.1], [laC[0] + laW * 0.95, yDeep - 1.1], [laC[0] + laW + 3.5, 30], [raC[0] - raW - 3.5, 30]];
  const hilum = [TS, Al, Ma, axo(1.2, rOut(1.2, 0.6)), axo(12, asc / 2 + 1.5), axo(12, -asc / 2 - 1.5), axo(1.2, -rOut(1.2, 0.6))];
  const daC = add(laPts[4], add(mul(ldown, 1.45), mul(nl, 0.55)));
  return {
    A, B, Al, Ar, Av, Ma, L0, TS, TL, Ra, ax, nl, out, dn, nlo, lvC, rvC, laC, raC, lvCav, lvCavT, laCav, raCav, rvFree, rvFreeT, rvSep, rvSepEndo, rvSepEndoT, rvStrands,
    lvOut, rvOut, laOut, raOut, ivsRib, lvRib, rvRib, laRibs, raRib, pvWalls, memb, annuli, pm, mb, mv, tv, chords, mvShut: ph.mvShut,
    aoL, aoR, aoLumen, aoWalls, cuspL, cuspR, cuspLo, cuspRo, avTip, axo, radius, lvot, root, asc, fat, peri, medi, hilum,
    daRing: ring(daC, 0.95, 1.17, 28), daLumen: ellipse(daC, 0.95, 0.95, 28),
  };
}

/** The A5C flows in the scanner format (as a4cFlows): ejection down the LVOT into the aorta, mitral inflow, the stenotic jet. */
function a5cFlows(S, t, C) {
  const fl = [];
  if (!cfDebug.jetOnly) {
    // systole: from the middle of the LV down the LVOT and through the valve, away from the probe
    const vo = lvotV(t, C.lvot ?? 1.0) * 100;
    if (vo > 2) {
      const pts = [lerp2(S.B, S.A, 0.45), S.axo(-1.6, 0), S.axo(-0.3, 0), S.axo(0.6, 0)];
      const sp = [0.3 * vo, 0.8 * vo, vo, 1.1 * vo], hw = [1.4, S.lvot * 0.42, S.lvot * 0.42, S.lvot * 0.38];
      if (!C.as) { pts.push(S.axo(3, 0), S.axo(7, 0)); sp.push(vo, 0.9 * vo); hw.push(S.root * 0.4, S.asc * 0.38); }
      fl.push(stream(pts, sp, hw));
    }
    // diastole: mitral inflow toward the apex
    const vm = mitralV(t, C.E ?? 0.8, C.A ?? 0.55) * 100;
    if (vm > 2) fl.push(inflow(lerp2(S.Ma, S.L0, 0.5), S.mv.tip, S.ax, len(sub(S.mv.l1[NL], S.mv.l2[NL])), vm, 3.4, 25));
  }
  if (C.as?.a > 0.02) fl.push(...lesion(S.avTip, S.dn, C.as));
  return fl;
}
/** The A5C color box: the LVOT and the aorta in every shape given (the box keeps still through the beat). */
function a5cBox(shapes, half) {
  const pts = [];
  for (const T of shapes) for (const [d, y] of [[-2.2, -1.5], [-2.2, 1.5], [6.5, -T.asc / 2 - 0.3], [6.5, T.asc / 2 + 0.3]]) pts.push(T.axo(d, y));
  return boxAround(pts, half);
}

function a5cItems(S, Sr, g) {
  const items = [
    { polys: [S.medi], e: -21 },
    { polys: [S.hilum], refs: [Sr.hilum], e: -9 },
    { polys: [S.fat], refs: [Sr.fat], e: DB.fat - 2 },
    { polys: [S.laCav, S.raCav, S.aoLumen, S.daLumen], e: DB.blood, blood: true },
    { polys: [S.daRing], refs: [Sr.daRing], e: DB.fibrous - 2 },
    { polys: [S.lvRib], refs: [Sr.lvRib], e: DB.myo },
    { polys: [S.ivsRib], refs: [Sr.ivsRib], e: DB.myo },
    { polys: [S.rvRib], refs: [Sr.rvRib], e: DB.myo - 1 },
    { polys: S.laRibs, refs: Sr.laRibs, e: DB.myo - 5 },
    { polys: [S.raRib], refs: [Sr.raRib], e: DB.myo - 5 },
    { polys: S.aoWalls, refs: Sr.aoWalls, e: DB.fibrous - 1 },
    { polys: [S.memb], refs: [Sr.memb], e: DB.fibrous },
    { polys: S.annuli, refs: Sr.annuli, e: DB.fibrous + 1 },
    { polys: [S.pm], refs: [Sr.pm], e: DB.myo },
    { lines: [S.mb], refs: [Sr.mb], e: DB.myo, w: 0.3 },
    { lines: S.rvStrands, refs: Sr.rvStrands, e: DB.myo - 2, w: 0.12 },
    { lines: S.pvWalls, refs: Sr.pvWalls, e: -7, w: 0.1 },
    { borders: [S.lvCavT], refs: [Sr.lvCavT], e: DB.myo, spec: 8 },
    { borders: [S.rvSepEndoT, S.rvFreeT], refs: [Sr.rvSepEndoT, Sr.rvFreeT], e: DB.myo, spec: 7 },
    { borders: [S.laCav, S.raCav], refs: [Sr.laCav, Sr.raCav], e: DB.myo - 2, spec: 6 },
    { borders: [S.lvOut, S.rvOut], refs: [Sr.lvOut, Sr.rvOut], e: DB.myo, spec: 6 },
    { borders: [S.aoL, S.aoR], refs: [Sr.aoL, Sr.aoR], e: DB.myo + 2, spec: 6 },
    { borders: [S.peri], refs: [Sr.peri], e: 7, spec: 10, w: 0.14, all: true },
    { lines: S.chords, e: DB.chord - 3 - 14 * (1 - S.mvShut), w: 0.04 },
    ...leaves([S.mv.o1, S.mv.o2], [Sr.mv.o1, Sr.mv.o2], valveDb(g.mv)),
    ...leaves([S.tv.o1, S.tv.o2], [Sr.tv.o1, Sr.tv.o2], valveDb(g.tv) - 1),
    ...leaves([S.cuspLo, S.cuspRo], [Sr.cuspLo, Sr.cuspRo], valveDb(g.av)),
  ];
  // calcium at the hinges and on the cusps, with its shadow
  const calc = g.av?.calc ?? 0;
  if (calc > 0.05) {
    const spots = [[S.cuspL[1], 0.22], [S.cuspR[1], 0.2], [along(S.cuspL, 0.55), 0.16], [along(S.cuspR, 0.6), 0.14]];
    items.push({ lines: spots.map(([p, r]) => [p, add(p, mul(S.nlo, r))]), e: DB.calcium - 6 * (1 - calc), w: 0.12 + 0.18 * calc, shadow: 10 * calc });
  }
  return items;
}

/**
 * The CW Doppler line from the probe down the scan line through the LVOT and the aortic valve;
 * pw (cm): a PW sample volume that far up the LVOT from the valve.
 */
function dopplerLine(ctx, F, S, pw) {
  const { sect, k } = F;
  const end = mul(S.dn, F.depth), P = (p) => [sect.cx + p[0] * k, sect.top + p[1] * k];
  const a = P([0, 0]), b = P(end);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (pw) {
    // the sample volume: two bars across the line, 3 mm apart
    const c = P(sub(S.Av, mul(S.dn, pw))), g = mul(S.dn, 0.15 * k), w = mul(perp(S.dn), 6);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c[0] + s * g[0] - w[0], c[1] + s * g[1] - w[1]);
      ctx.lineTo(c[0] + s * g[0] + w[0], c[1] + s * g[1] + w[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Apical five-chamber view. g (cm; [ED, ES] pairs beat with the heart): lvL, lvW, lvWall, ivs,
 *   rvW, rvWall, laW, laL ([min, max]), raW, raL, ta, lvot (LVOT and aortic annulus diameter),
 *   root (sinuses), asc (ascending aorta; by default 3.9 under the bicuspid heart, else 3.0),
 *   av: {thick, open (orifice width in systole, cm), calc, gap}, mv: {thick}, tv: {thick}
 * o: t (ms), ph, title, depth, color (the scanner format: lo, hi, variance, lvot (m/s), E, A, as:
 *    see a5cFlows) or jets: {as} (the plume format: see jet()), cw (the CW Doppler line through the
 *    valve), pw (cm: a PW sample volume this far up the LVOT from the valve), labels, gain,
 *    after(ctx, F, geo)
 * Returns the geometry (cm) for labels and measurements.
 */
export function drawA5C(ctx, box, g, o = {}) {
  const ph = o.ph ?? phase(o.t ?? 150);
  const c = ph.c;
  const S = a5cShape(g, c, ph), Sr = a5cShape(g, 0, { ...ph, mvShut: 1, tvShut: 1, avOpen: 0 });
  const F = frame(ctx, box, o.depth ?? 17, o.title ?? 'APICAL FIVE-CHAMBER', { deg: 80, near: 1.2 });
  scan(ctx, F, a5cItems(S, Sr, g), { t: o.t, gain: o.gain });
  const C = o.color;
  if (C) {
    // the color box keeps still through the beat: it covers the LVOT and the aorta at both ends of it
    const key = `a5c|${HEART}|${F.view.half}|${JSON.stringify(g)}`;
    colorFlow(ctx, F, {
      box: cachedBox(key, () => a5cBox([Sr, a5cShape(g, 1, { ...ph, mvShut: 1, tvShut: 1, avOpen: 0 })], F.view.half)), lo: C.lo, hi: C.hi, variance: C.variance,
      blood: [S.lvCav, S.laCav, S.raCav, S.aoLumen, [...S.rvSepEndo, ...S.rvFree]],
      tissue: [S.mv.o1, S.mv.o2, S.tv.o1, S.tv.o2, S.cuspLo, S.cuspRo, S.pm, ...S.annuli],
      flows: a5cFlows(S, o.t ?? ph.t ?? 150, C), stats: cfDebug.stats,
    });
    barFor(ctx, F, C.lo, C.hi);
  }
  // the stenotic jet leaves the cusp tips down the aorta, away from the probe
  const J = o.jets;
  if (J?.as) {
    jet(ctx, F, { ...J.as, O: S.avTip, dir: S.dn, clip: S.aoLumen, pisa: false });
    barFor(ctx, F, -J.as.va, J.as.va);
  }
  if (o.cw) dopplerLine(ctx, F, S, o.pw);
  const geo = { ...S, F, c, ph };
  if (o.after) o.after(ctx, F, geo);
  const want = (k) => (Array.isArray(o.labels) ? o.labels.includes(k) : o.labels !== false);
  if (want('LV')) tag(ctx, F, 'LV', add(S.lvC, mul(S.ax, 0.8)));
  if (want('RV')) tag(ctx, F, 'RV', add(centroid(S.rvFree), mul(S.out, -0.2)));
  if (want('LA')) tag(ctx, F, 'LA', add(S.laC, mul(S.nl, 0.3)));
  if (want('RA')) tag(ctx, F, 'RA', add(S.raC, mul(S.out, 0.3)));
  if (want('Ao')) tag(ctx, F, 'Ao', S.axo(3.4, 0));
  finish(ctx, F);
  return geo;
}

// ---------------------------------------------------------------- parasternal long axis
/**
 * Every PLAX structure in the heart's own frame (x toward the aorta, y depth), cm. The sizes and
 * places follow the PLAX that chapter 04 cuts from the heart mesh (echo.js): an RV outflow tract
 * of 1.75 cm in front of the septum at the mitral tips, which narrows to a thin channel in front
 * of the aortic root.
 */
function plaxShape(g, c, ph) {
  const ivs = at(g.ivs, c), lvid = at(g.lvid, c), pw = at(g.pw, c), rvd = at(g.rvd ?? 1.75, c);
  const la = at(g.la, c), root = g.root ?? 3.1, lvot = g.lvot ?? 2.1;
  const effA = g.effusionAnt ?? 0;                  // fluid in front of the RV free wall (cm)
  const y0 = 1.75 + effA;                           // RV free wall
  const yRv = y0 + 0.4, yIvs = yRv + rvd, yLv = yIvs + ivs, yPw = yLv + lvid, yEpi = yPw + pw;
  const xL = -10, xAnn = 0.55, xM = -2.3;
  // the walls converge toward the apex, off the left of the image; not at all at the tips
  const cv = (x) => (x >= xM ? 0 : smooth((xM - x) / (xM - xL)));
  const aoTop = yLv - 0.05, aoBot = aoTop + lvot, aoMid = (aoTop + aoBot) / 2;
  // mitral hinges: anterior on the aortic-mitral curtain, posterior in the AV groove. The annulus
  // narrows about 15% in systole: the basal posterior wall moves less than the wall below it
  const hA = aoBot + 0.08, dA0 = yLv + at(g.lvid, 0) - 0.1 - hA;
  const hingeP = [xAnn + 0.35, hA + dA0 * (1 - 0.15 * c)];
  const hingeA = [xAnn + 0.1, hA];
  const xs = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
  // septum: thinner toward the membranous part, where it meets the anterior aortic wall
  const sepTh = (x) => ivs * (x < -1.6 ? 1 : mix(1, 0.55, smooth((x + 1.6) / (xAnn + 1.25))));
  const sepLV = [...xs(xL, xAnn - 0.35).map((x) => [x, yLv + 0.12 * lvid * cv(x)]), [xAnn + 0.05, aoTop + 0.02]];
  const sepRV = [...xs(xL, xAnn - 0.35).map((x) => [x, yLv + 0.12 * lvid * cv(x) - sepTh(x)]), [xAnn + 0.15, aoTop - 0.3]];
  const ivsRib = ribbon(sepLV, sepRV);
  // posterior (inferolateral) wall, rising to the AV groove
  const lag = hingeP[1] - (yPw - 0.1);   // how far the groove stays behind the contracting wall
  const pwEndo = xs(xL, hingeP[0]).map((x) => [x, yPw - 0.22 * lvid * cv(x) - 0.1 * smooth((x + 1.2) / (hingeP[0] + 1.2)) + lag * smooth((x + 2) / (hingeP[0] + 2))]);
  const pwTh = (x) => pw * (x > -0.8 ? mix(1, 0.75, smooth((x + 0.8) / (hingeP[0] + 0.8))) : 1);
  const pwEpi = pwEndo.map((p) => [p[0], p[1] + pwTh(p[0])]);
  const pwRib = ribbon(pwEndo, pwEpi);
  // aortic root: sinuses, then the ascending aorta, which rises toward the chest wall
  const sinus = (sgn) => spline([[xAnn, sgn < 0 ? aoTop : aoBot], [xAnn + 1.0, aoMid + sgn * root / 2 - 0.2], [xAnn + 2.3, aoMid + sgn * (root * 0.47) - 0.45], [xAnn + 3.2, aoMid + sgn * root * 0.43 - 0.55], [xAnn + 7, aoMid + sgn * root * 0.42 - 1.0]], 8);
  const aoAnt = sinus(-1), aoPost = sinus(1);
  const aoAntWall = ribbon(aoAnt, aoAnt.map((p) => [p[0], p[1] - 0.28]));
  const aoPostWall = ribbon(aoPost, aoPost.map((p) => [p[0], p[1] + 0.28]));
  // RV free wall across the top. Past the septum it comes down in front of the aortic root, so the
  // outflow tract there is a channel of 0.6 cm (less when fluid in front presses on it).
  const yAt = (poly, x) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax_, ay] = poly[i], [bx, by] = poly[i + 1];
      if ((ax_ - x) * (bx - x) <= 0 && ax_ !== bx) return ay + ((by - ay) * (x - ax_)) / (bx - ax_);
    }
    return x < poly[0][0] ? poly[0][1] : poly[poly.length - 1][1];
  };
  const wall = (x) => 1.75 + 0.22 * rvd * cv(x);            // the epicardium, with no fluid in front
  const overAo = (x) => smooth((x - (xAnn - 0.6)) / 1.7);
  const rvEndoAt = (x) => {
    const free = wall(x) + effA + 0.4;
    if (x <= xAnn - 0.6) return free;
    const front = yAt(aoAnt, x) - 0.28;                     // the front of the aortic wall
    return Math.min(mix(free, Math.max(free, front - 0.6), overAo(x)), front - 0.25);
  };
  const rvEndo = xs(xL, xAnn + 5.5).map((x) => [x, rvEndoAt(x)]);
  const rvEpi = rvEndo.map((p) => [p[0], p[1] - 0.4]);
  const rvEndoT = trabeculate(rvEndo, (u) => 0.1 * (1 - smooth(u / 0.35)), [xL + 2, yIvs], 0.4);
  const rvRib = ribbon(rvEndoT, rvEpi);
  // LA behind the aortic root
  const laTop = aoBot + 0.33;
  const laPts = [[xAnn + 0.4, laTop], [xAnn + 2.4, laTop + 0.05], [xAnn + 3.9, laTop + la * 0.4], [xAnn + 3.5, laTop + la * 0.95], [xAnn + 1.6, laTop + la + 0.05], [hingeP[0] + 0.25, Math.max(laTop + la * 0.75, hingeP[1] + 0.2)], hingeP];
  const laCav = spline(laPts, 8);
  const laRib = ribbon(laCav, offsetAway(laCav, 0.22, centroid(laCav)));
  // coronary sinus in the AV groove; descending aorta behind the LA
  const csC = [hingeP[0] - 0.35, hingeP[1] + pw * 0.75 + 0.45];
  const daoC = [xAnn + 0.1, laTop + la + 3.0];
  // pericardium behind the posterior wall, round the coronary sinus in the AV groove and on
  // behind the LA, in front of the descending aorta (a pleural effusion runs on behind the
  // aorta). At each x it lies a margin below the deepest wall it wraps, so it never cuts one.
  // Fluid lies behind the LV and thins out at the AV groove.
  const eff = g.effusion ?? 0;
  const taper = (x) => (x < hingeP[0] ? 1 - 0.8 * smooth((x + 1.8) / (hingeP[0] + 1.8)) : mix(0.2, 0.05, smooth((x - hingeP[0]) / 1.2)));
  const laOut = offsetAway(laCav, 0.22, centroid(laCav));
  const deepest = (poly, x) => {
    let y = -Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax_, ay] = poly[i], [bx, by] = poly[i + 1];
      if ((ax_ - x) * (bx - x) <= 0 && ax_ !== bx) y = Math.max(y, ay + ((by - ay) * (x - ax_)) / (bx - ax_));
    }
    return y;
  };
  // the margin goes round the coronary sinus too, not only under it
  const M = 0.17, csRx = 0.46 + M, csRy = 0.414 + M;
  const csBelow = (x) => (Math.abs(x - csC[0]) < csRx ? csC[1] + csRy * Math.sqrt(1 - ((x - csC[0]) / csRx) ** 2) : -Infinity);
  const px = xs(xL, xAnn + 3.7, Math.round((xAnn + 3.7 - xL) / 0.1));
  const raw = px.map((x) => Math.max(deepest(pwEpi, x) + M, csBelow(x), deepest(laOut, x) + M));
  const peri = px.map((x, i) => {
    let m = 0, k = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(px.length - 1, i + 3); j++) if (Number.isFinite(raw[j])) { m += raw[j]; k++; }
    return [x, Math.max(k ? m / k : raw[i], raw[i]) + eff * taper(x)];
  });
  const post = [...peri, [xAnn + 9, laTop + la], [xAnn + 9, 30], [xL - 2, 30], [xL - 2, peri[0][1]]];
  // with fluid in front, the parietal pericardium stays under the chest wall as the heart drops
  const periA = effA > 0.02 ? xs(xL, xAnn + 5.5).map((x) => [x, wall(x) - 0.13]) : null;
  // aortic valve: right (front) and non-coronary (back) cusps from the annulus. Shut, they meet
  // in the middle of the root and sag toward the LV; open, they lie along the sinus walls. A
  // stiff valve opens only to open (cm) and the cusps dome into the aorta.
  // A bicuspid valve closes off-centre: the larger, fused cusp in front reaches past the middle.
  const cuspA0 = [xAnn + 0.05, aoTop + 0.05], cuspP0 = [xAnn + 0.05, aoBot - 0.05];
  const openW = g.av?.open ?? 1.9, avGap = g.av?.gap ?? 0;
  const ecc = g.av?.ecc ?? (HEART === 'bav' ? 0.35 : 0);
  const aoC = [xAnn + 0.85, aoMid + (ecc * (aoBot - aoTop)) / 2];
  const lcOf = (sgn) => Math.hypot(0.8, Math.abs((sgn < 0 ? aoTop : aoBot) - aoC[1]) - 0.05) * 1.04 + 0.12;   // cusp length
  const cusp = (h, sgn) => {
    const lc = lcOf(sgn);
    const shut = flap(h, add(aoC, [0, sgn * avGap / 2]), lc, [-1, 0], avGap > 0.02 ? null : [1, 0], 0.12);
    const k = smooth((1.9 - openW) / 0.6);
    const end = lerp2(add(h, mul(unit([0.97, sgn * 0.12]), lc * 0.96)), [xAnn + 0.35 + lc * 0.55, aoMid + (sgn * openW) / 2], k);
    const open = flap(h, end, lc, unit(lerp2([0, sgn], [0.5, sgn * 0.85], k)));
    return swing(h, shut, open, ph.avOpen);
  };
  const cuspA = cusp(cuspA0, -1), cuspP = cusp(cuspP0, 1);
  const avTh = g.av?.thick ?? 0.1;
  const cuspAo = leafOutline(cuspA, avTh * 0.8, avTh * 1.3), cuspPo = leafOutline(cuspP, avTh * 0.8, avTh * 1.3);
  // mitral valve: anterior leaflet (2.6 cm) from the back of the aortic root, posterior (1.5 cm)
  // from the atrioventricular groove. Rheumatic: the tips stay close and the anterior leaflet
  // domes toward the septum; the short posterior leaflet cannot move.
  const shut = ph.mvShut;
  const [mvV, mvK] = mitralOf(g.mv, 1);
  const dome = mvV?.dome ?? 0;
  const toLV = unit(perp(sub(hingeP, hingeA)));
  const toward = toLV[0] < 0 ? toLV : mul(toLV, -1);
  const up = unit(sub(hingeA, hingeP));
  const rot = (d, side, deg) => { const r = (deg * Math.PI) / 180; return unit(add(mul(d, Math.cos(r)), mul(side, Math.sin(r)))); };
  let openA = add(hingeA, mul(rot(toward, up, 38 - 14 * (mvK - 1)), 2.6 * mvK * 0.96)), openP = add(hingeP, mul(rot(toward, mul(up, -1), 25), 1.5 * mvK * 0.96));
  if (dome > 0) {
    const k = smooth(dome / 0.6), w = mvV?.tip ?? 1.2;
    const tipMid = add(lerp2(hingeA, hingeP, 0.5), mul(toward, 1.25 + 0.3 * (1 - dome)));
    openA = lerp2(openA, add(tipMid, mul(up, w / 2)), k);
    openP = lerp2(openP, add(tipMid, mul(up, -w / 2)), k);
  }
  const MP = valvePair(hingeA, hingeP, 2.6 * mvK, 1.5 * mvK, toward, { gap: mvV?.gap ?? 0, tent: mvV?.tent, open1: openA, open2: openP, bulge1: up, bulge2: mul(up, -1) });
  const aml = swing(hingeA, MP.open1, MP.shut1, shut), pml = swing(hingeP, MP.open2, MP.shut2, shut);
  const mvTh = mvV?.thick ?? 0.12, mvTip = mvTh * (1 + 0.4 * dome);
  const amlO = leafOutline(aml, mvTh * 0.75, mvTip), pmlO = leafOutline(pml, mvTh * 0.75, mvTip);
  const tipA = aml[NL], tipP = pml[NL];
  // posteromedial papillary muscle rising from the posterior wall, chordae to both leaflets
  const pmX = -4.3, pmBase = [pmX, yPw - 0.22 * lvid * cv(pmX)];
  const pmDir = unit([0.4, -1]);
  const pm = muscle(pmBase, pmDir, 1.0, 0.8 + 0.25 * c, [0, 1]);
  const pmTip = add(pmBase, mul(pmDir, 0.9));
  const chords = [[pmTip, along(pml, 0.97)], [pmTip, along(pml, 0.6)], [add(pmTip, [0.15, 0]), along(aml, 0.97)], [add(pmTip, [0.2, 0.05]), along(aml, 0.72)], [add(pmTip, [0.05, 0.08]), along(aml, 0.5)]];
  const lvCav = [...sepLV.slice(0, -1), [xAnn, aoTop + 0.2], [xAnn, aoBot], hingeP, ...pwEndo.slice().reverse()];
  return {
    ivs, lvid, pw, la, yIvs, yLv, yPw, yEpi, laTop, aoTop, aoBot, aoMid, xAnn, lvot, hingeP, hingeA,
    ivsRib, sepLV, sepRV, rvRib, rvEndoT, pwRib, pwEndo, aoAnt, aoPost, aoAntWall, aoPostWall, laCav, laRib,
    csRing: ring(csC, 0.32, 0.46, 20, 0.9), csLumen: ellipse(csC, 0.32, 0.29, 20), daoRing: ring(daoC, 1.25, 1.5, 28, 0.86), daoLumen: ellipse(daoC, 1.25, 1.075, 28),
    peri, post, periA, cuspA, cuspP, cuspA0, cuspP0, cuspAo, cuspPo, aml, pml, amlO, pmlO, tipA, tipP, pm, chords, lvCav,
  };
}

/**
 * g (cm): rvd (RV outflow), ivs, lvid, pw ([ED, ES] pairs), root (aortic sinus), lvot, la (AP,
 *   [min, max]), av: {thick, open (orifice width at full opening, cm), calc}, mv: {thick, dome,
 *   tip (orifice width, cm), calc}, effusion
 * o: t, depth, color (the scanner format: see plaxFlows) or jets: {ar, as, ms} (the plume format: see
 *    jet()), title, labels, after
 */
export function drawPLAX(ctx, box, g, o = {}) {
  // the sector and chest wall of chapter 04's PLAX (views.js: 80°, 1.2 cm)
  const F = frame(ctx, box, o.depth ?? 16, o.title ?? 'PARASTERNAL LONG AXIS', { deg: 80, near: 1.2 });
  const ph = phase(o.t ?? 150);
  const c = ph.c;
  // the heart where chapter 04's mesh PLAX shows it (echo.js): the LV minor axis at the mitral
  // tips 1.7 cm left of the centre line, its centre 7.6 cm deep, and the LV long axis rising 5°
  // toward the apex
  const th = 0.087, pivot = [-2.3, 7.15], move = [0.63, 0.43];
  const R = (p) => {
    const d = sub(p, pivot), cs = Math.cos(th), sn = Math.sin(th);
    return [pivot[0] + d[0] * cs - d[1] * sn + move[0], pivot[1] + d[0] * sn + d[1] * cs + move[1]];
  };
  const RP = (poly) => poly.map(R);
  const S = plaxShape(g, c, ph), Sr = plaxShape(g, 0, { ...ph, mvShut: 1, avOpen: 0 });
  const two = (key) => ({ polys: [RP(S[key])], refs: [RP(Sr[key])] });
  const items = [
    // behind the pericardium; grey lung and mediastinum when an effusion is drawn, so the fluid
    // shows as the dark band in front of it
    { polys: [RP(S.post)], e: g.effusion === undefined ? -26 : -13 },
    { polys: [RP(S.daoLumen), RP(S.csLumen)], e: DB.blood, blood: true },
    { ...two('daoRing'), e: DB.fibrous - 2 },
    { ...two('rvRib'), e: DB.myo - 1 },
    { ...two('ivsRib'), e: DB.myo },
    { ...two('pwRib'), e: DB.myo },
    { polys: [RP(S.aoAntWall), RP(S.aoPostWall)], refs: [RP(Sr.aoAntWall), RP(Sr.aoPostWall)], e: DB.fibrous - 1 },
    { ...two('laRib'), e: DB.myo - 2 },
    { ...two('csRing'), e: DB.fibrous - 2 },
    { ...two('pm'), e: DB.myo },
    { borders: [RP(S.sepLV), RP(S.sepRV)], refs: [RP(Sr.sepLV), RP(Sr.sepRV)], e: DB.myo, spec: 8 },
    { borders: [RP(S.pwEndo)], refs: [RP(Sr.pwEndo)], e: DB.myo, spec: 8 },
    { borders: [RP(S.rvEndoT)], refs: [RP(Sr.rvEndoT)], e: DB.myo, spec: 6 },
    { borders: [RP(S.laCav), RP(S.aoAnt), RP(S.aoPost)], refs: [RP(Sr.laCav), RP(Sr.aoAnt), RP(Sr.aoPost)], e: DB.myo, spec: 6 },
    { borders: [RP(S.peri)], refs: [RP(Sr.peri)], e: 8, spec: 10, w: 0.15, all: true },
    ...(S.periA ? [{ borders: [RP(S.periA)], e: 8, spec: 10, w: 0.15, all: true }] : []),
    { lines: S.chords.map(RP), e: DB.chord - 3 - 14 * (1 - ph.mvShut), w: 0.04 },
    ...leaves([RP(S.cuspAo), RP(S.cuspPo)], [RP(Sr.cuspAo), RP(Sr.cuspPo)], valveDb(g.av)),
    ...leaves([RP(S.amlO), RP(S.pmlO)], [RP(Sr.amlO), RP(Sr.pmlO)], valveDb(g.mv)),
  ];
  const calc = g.av?.calc ?? 0;
  if (calc > 0.05) {
    const spots = [[S.cuspA0, 0.22], [S.cuspP0, 0.2], [[S.xAnn + 0.6, S.aoTop + 0.3], 0.16], [along(S.cuspP, 0.6), 0.14]];
    items.push({ lines: spots.map(([p, r]) => RP([p, add(p, [r, 0.05])])), e: DB.calcium - 6 * (1 - calc), w: 0.12 + 0.18 * calc, shadow: 10 * calc });
  }
  if (g.mv?.calc) items.push({ lines: [RP([S.tipA, along(S.aml, 0.8)]), RP([S.tipP, along(S.pml, 0.8)])], e: DB.calcium - 4, w: 0.18, shadow: 8 * g.mv.calc });
  scan(ctx, F, items, { t: o.t, gain: o.gain });
  const { xAnn, aoTop, aoBot, aoMid, yLv, yPw } = S;
  const C = o.color;
  if (C) {
    // the color box keeps still through the beat: it covers the region at both ends of it
    const key = `plax|${HEART}|${C.roi}|${F.view.half}|${JSON.stringify(g)}`;
    colorFlow(ctx, F, {
      box: cachedBox(key, () => plaxBox([Sr, plaxShape(g, 1, { ...ph, mvShut: 1, avOpen: 0 })], C, R, F.view.half)), lo: C.lo, hi: C.hi, variance: C.variance,
      blood: [RP(S.lvCav), RP(S.laCav), RP([...S.aoAnt, ...S.aoPost.slice().reverse()]), RP([...S.rvEndoT, ...S.sepRV.slice().reverse()])],
      tissue: [RP(S.cuspAo), RP(S.cuspPo), RP(S.amlO), RP(S.pmlO), RP(S.pm)],
      flows: plaxFlows(S, R, o.t ?? 150, C, g), stats: cfDebug.stats,
    });
    barFor(ctx, F, C.lo, C.hi);
  }
  const J = o.jets;
  if (J) {
    const lvCav = RP(S.lvCav), aoCav = RP([...S.aoAnt, ...S.aoPost.slice().reverse()]), mid = R(lerp2(S.tipA, S.tipP, 0.5));
    if (J.ar) jet(ctx, F, { ...J.ar, O: R([xAnn + 0.6, aoMid]), dir: unit(sub(R([-4, aoMid + 1.0]), R([xAnn, aoMid]))), clip: lvCav });
    if (J.as) jet(ctx, F, { ...J.as, O: R([xAnn + 1.2, aoMid]), dir: unit(sub(R([xAnn + 6, aoMid - 0.3]), R([xAnn + 1.2, aoMid]))), clip: aoCav, pisa: false });
    if (J.ms) jet(ctx, F, { ...J.ms, O: mid, dir: unit(sub(R([-6, (yLv + yPw) / 2 + 0.6]), mid)), clip: lvCav });
    const any = J.ar || J.as || J.ms;
    if (any) barFor(ctx, F, -any.va, any.va);
  }
  const geo = { F, R, yIvs: S.yIvs, yLv, yPw, yEpi: S.yEpi, ivs: S.ivs, lvid: S.lvid, pw: S.pw, la: S.la, laTop: S.laTop, aoTop, aoBot, aoMid, xAnn, c, ph, lvot: S.lvot };
  if (o.after) o.after(ctx, F, geo);
  if (o.labels !== false) {
    tag(ctx, F, 'RV', R([-1.2, (S.yIvs + 2.15) / 2]));
    tag(ctx, F, 'LV', R([-4.5, (yLv + yPw) / 2]));
    tag(ctx, F, 'Ao', R([xAnn + 3.6, aoMid]));
    tag(ctx, F, 'LA', R([xAnn + 2.1, S.laTop + S.la * 0.55]));
  }
  finish(ctx, F);
  return geo;
}

/** Standard PLAX calipers at the mitral tips: septum, LV diameter, posterior wall. */
export function plaxLV(ctx, geo) {
  const { F, R } = geo;
  const x = -2.3;
  cal(ctx, F, R([x, geo.yIvs]), R([x, geo.yLv]), '');
  cal(ctx, F, R([x + 0.1, geo.yLv]), R([x + 0.1, geo.yPw]), '');
  cal(ctx, F, R([x, geo.yPw]), R([x, geo.yEpi]), '');
}

// ---------------------------------------------------------------- short-axis insets
/** The distance from c to the closed polygon poly along the angle a (radians, y down): its first crossing. */
function hitDist(poly, c, a) {
  const d = [Math.cos(a), Math.sin(a)];
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], e = sub(q, p);
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(p, c), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * Parasternal short axis at the aortic valve: three cusps, or two when the valve is bicuspid
 * (g.bicuspid, or the bicuspid heart); the orifice drawn to its area (cm²).
 */
export function drawPSAXav(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 9, o.title ?? 'PSAX · AORTIC VALVE', { deg: 72, near: 1.3 });
  const ph = phase(o.t ?? 150);
  const PI = Math.PI;
  const C = [0, 5.1], r = (g.root ?? 3.1) / 2;
  // the right ventricular outflow wraps the front of the aorta: tricuspid valve on the left,
  // pulmonary valve on the right
  const a0 = PI * 0.97, a1 = PI * 2.08;
  const rvIn = arc(C, r + 0.42, a0, a1), rvOutC = arc(C, r + 1.55, a0, a1), rvWallO = arc(C, r + 1.9, a0, a1);
  const fat = ribbon(arc(C, r + 0.2, a0, a1), rvIn);
  const rvWall = ribbon(rvOutC, rvWallO);
  // tricuspid hinges at the left end of the outflow band
  const tvH1 = rvIn[0], tvH2 = rvOutC[0];
  // left atrium behind, right atrium to the left, the atrial septum between. The RA wall meets
  // the tricuspid hinges and stays open between them: the RA opens into the RV through the valve
  const laC = [C[0] + 0.3, C[1] + r + 1.55], raA = 1.2, raB = 1.3;
  const raC = ellipseThrough(tvH1, tvH2, raA, raB, [C[0] - r - 1.2, C[1] + 1.25]);
  const la = ellipse(laC, 2.1, 1.25), ra = ellipse(raC, raA, raB);
  const laRib = ribbon([...la, la[0]], [...ellipse(laC, 2.3, 1.45), [laC[0] + 2.3, laC[1]]]);
  const angOf = (P) => Math.atan2((P[1] - raC[1]) / raB, (P[0] - raC[0]) / raA);
  let s0 = angOf(tvH1), s1 = angOf(tvH2);
  if (s1 < s0) s1 += 2 * PI;
  if (s1 - s0 < PI) [s0, s1] = [s1, s0 + 2 * PI];   // the long way round, away from the valve
  const raWall = Array.from({ length: 41 }, (_, i) => { const t = mix(s0, s1, i / 40); return [raC[0] + raA * Math.cos(t), raC[1] + raB * Math.sin(t)]; });
  const raRib = ribbon(raWall, offsetAway(raWall, 0.2, raC));
  const root = ring(C, r, r + 0.22, 48);
  // tricuspid leaflets across the left end of the outflow band, pulmonary cusps at the right end
  const tvDir = unit(sub(rvIn[3], rvIn[0]));
  // each pair swings open to lie along its own walls, the tricuspid into the right ventricle,
  // the pulmonic cusps into the pulmonary artery. Shut, they meet 1 mm past their hinge line:
  // this cut is only 1.1 cm across, and a deeper meeting point reads as a bowed valve
  const tvL = tubeValve(tvH1, tvH2, tvDir, 1 - ph.tvShut, 0.08);
  const n = rvIn.length - 1;
  const pvH1 = rvIn[n], pvH2 = rvOutC[n], pvDir = unit(sub(rvIn[n], rvIn[n - 3]));
  const pvL = tubeValve(pvH1, pvH2, pvDir, ph.avOpen, 0.1);
  const pa = [[pvH1, add(pvH1, mul(add(pvDir, [0.3, 0.9]), 1.6))], [pvH2, add(pvH2, mul(add(pvDir, [0.2, 0.9]), 1.8))]];
  // aortic cusps: closed, the three lines of the "Y"; open, a curved triangle of area AVA
  const area = Math.max(0.02, (g.ava ?? 3) * ph.avOpen);
  const ro = Math.min(r * 0.93, Math.sqrt((4 * area) / (3 * Math.sqrt(3))));
  // the cusps' free edges run from one commissure to the next: shut, through the centre (the
  // three together make a Y); open, along a triangle whose corners point to the commissures
  const bic = g.bicuspid ?? HEART === 'bav';
  const dir = (a, d) => add(C, [d * Math.cos(a), d * Math.sin(a)]);
  const cusps = [];
  let com, orifice, raphe = null;
  if (bic) {
    // right and left cusps fused: two commissures, at about 10 and 5 o'clock, and a raphe where
    // the third one was (2 o'clock). Shut, the two free edges meet in one line from commissure to
    // commissure; open, they part as a slit whose area (a lens, 4/3 x length x half-width) is AVA
    com = [dir(PI * 0.39, r), dir(PI * 1.28, r)];
    const Lc = len(sub(com[1], com[0])), w = Math.min(r * 0.8, (3 * area) / (4 * Lc));
    const nrm = unit(perp(sub(com[1], com[0])));
    const edge = (sg) => spline([com[0], add(lerp2(com[0], com[1], 0.22), mul(nrm, sg * w * 0.62)), add(lerp2(com[0], com[1], 0.5), mul(nrm, sg * w)), add(lerp2(com[0], com[1], 0.78), mul(nrm, sg * w * 0.62)), com[1]], 8);
    cusps.push(edge(1), edge(-1));
    orifice = [...edge(1), ...edge(-1).slice().reverse()];
    raphe = [dir(-PI / 6, r), dir(-PI / 6, r * 0.5)];
  } else {
    const comA = [0, 1, 2].map((i) => -PI / 2 + (i * 2 * PI) / 3 + PI / 3);
    com = comA.map((a) => dir(a, r));
    for (let i = 0; i < 3; i++) {
      const a0 = comA[i], a1 = comA[(i + 1) % 3] + (i === 2 ? 2 * PI : 0), am = (a0 + a1) / 2;
      cusps.push(spline([com[i], dir(a0, Math.max(0.05, ro * 0.97)), dir(am, ro * 0.62), dir(a1, Math.max(0.05, ro * 0.97)), com[(i + 1) % 3]], 6));
    }
    orifice = [0, 1, 2, 3].map((i) => dir(-PI / 2 + (i * 2 * PI) / 3 + PI / 3, ro * 0.98));
  }
  const flapOf = (l) => leafOutline(l, 0.07, 0.1);
  const cTh = g.thick ?? 0.12;
  const items = [
    { polys: [fat], e: DB.fat - 2 },
    { polys: [la, ra], e: DB.blood, blood: true },
    { polys: [rvWall], e: DB.myo - 1 },
    { polys: [laRib, raRib], e: DB.myo - 2 },
    { polys: [root], e: DB.fibrous },
    { borders: [rvIn, rvOutC, la, raWall], e: DB.myo, spec: 6 },
    { lines: pa, e: DB.fibrous - 3, w: 0.18 },
    ...leaves([...tvL, ...pvL].map(flapOf), null, DB.valve - 2),
    // the cusps' free edges; shut, three meet in a Y with a small nodule at the centre, two in a line
    ...leaves(cusps.map((c) => band(c, cTh)), null, valveDb({ thick: g.thick })),
  ];
  if (raphe) items.push({ lines: [raphe], e: valveDb({ thick: g.thick }) + 3, w: cTh * 1.8 });
  if (ph.avOpen < 0.35 && !bic) items.push({ polys: [ellipse(C, 0.09 + cTh * 0.3, 0.08 + cTh * 0.3, 12)], e: valveDb({ thick: g.thick }) + 2 });
  const calcAt = raphe ? [...com, raphe[1]] : com;
  if (g.calc > 0.05) items.push({ lines: calcAt.map((p) => [add(p, [-0.12, 0]), add(p, [0.12, 0.05])]), e: DB.calcium - 6 * (1 - g.calc), w: 0.3 * g.calc + 0.08, shadow: 9 * g.calc });
  scan(ctx, F, items, { t: o.t });
  // planimetry of the orifice during ejection
  if (ph.avOpen > 0.6 && o.trace !== false) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    orifice.forEach((p, i) => { const q = F.P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  finish(ctx, F);
  // the orifice (cm) as drawn, for checks
  return { F, C, orifice, bicuspid: bic };
}

/** Parasternal short axis at the mitral valve: the orifice drawn to its area (cm²). */
export function drawPSAXmv(ctx, box, g, o = {}) {
  // the sector, depth and LV centre of chapter 04's mesh PSAX at the mitral level (views.js, echo.js)
  const F = frame(ctx, box, o.depth ?? 14, o.title ?? 'PSAX · MITRAL VALVE', { deg: 80, near: 1.2 });
  const ph = phase(o.t ?? 600);
  const shape = (c) => {
    const C = [0, 7.6];
    const ri = (at(g.lvid, c) ?? 4.6) / 2, wall = at(g.wall ?? 0.9, c);
    const endo = ellipse(C, ri, ri, 56), epi = ellipse(C, ri + wall, ri + wall, 56);
    // RV crescent round the left side and the front of the LV, as the mesh shows it: from its
    // inferior junction at 163° on screen to 318°, about 3 cm deep from 180° to 260°
    const a0 = 163, a1 = 318;
    const rvI = arc(C, ri + wall, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180, 32);
    const deepAt = (deg) => 0.2 + 2.8 * smooth((deg - a0) / 22) * smooth((a1 - deg) / 65);
    const rvO = rvI.map((p, i) => add(p, mul(unit(sub(p, C)), deepAt(a0 + ((a1 - a0) * i) / (rvI.length - 1)))));
    const rvW = offsetAway(rvO, 0.35, C);
    return { C, ri, wall, endo, epi, rvO, rvW, lv: ribbon([...endo, endo[0]], [...epi, epi[0]]), rv: ribbon(rvO, rvW) };
  };
  const S = shape(ph.c), Sr = shape(0);
  const C = S.C;
  // leaflets fill the annulus; the orifice is an ellipse between the commissures. Its width
  // stays; it opens front to back, so the shut valve is one line of contact. Fully open it is
  // 2:1 and has the valve area.
  const open = 1 - ph.mvShut;
  const annR = Math.min(S.ri * 0.92, 1.8);
  const aAx = Math.min(annR * 0.9, Math.sqrt((2 * (g.mva ?? 4)) / Math.PI));
  const bAx = Math.max(0.015, ((g.mva ?? 4) * open) / (Math.PI * aAx));
  const Mc = [C[0], C[1] + 0.2];
  const orifice = ellipse(Mc, aAx, bAx, 40);
  const annulus = ellipse(Mc, annR, annR * 0.86, 40);
  const thick = shownMitralThick(g.thick ?? 0.12);
  const rimW = Math.max(0.1, thick);
  const rim = ribbon([...orifice, orifice[0]], [...ellipse(Mc, aAx + rimW, bAx + rimW, 40), [Mc[0] + aAx + rimW, Mc[1]]]);
  const items = [
    { polys: [S.lv], refs: [Sr.lv], e: DB.myo },
    { polys: [S.rv], refs: [Sr.rv], e: DB.myo - 1 },
    { borders: [S.endo, S.epi, S.rvO], refs: [Sr.endo, Sr.epi, Sr.rvO], e: DB.myo, spec: 7, closed: true },
    // thickened leaflets: the whole fused sheet shows; thin ones, mostly their free edges
    // the leaflet bodies: cut obliquely when shut, edge-on when open
    { polys: [ribbon([...annulus, annulus[0]], [...orifice, orifice[0]])], e: (thick > 0.2 ? DB.valve - 5 + 8 * (thick - 0.2) : DB.myo - 9) - 12 * open, rule: 'evenodd' },
    { polys: [rim], e: valveDb({ thick }), rule: 'evenodd' },
    { borders: [orifice], e: valveDb({ thick }), spec: 6, w: 0.05, closed: true },
  ];
  scan(ctx, F, items, { t: o.t });
  if (open > 0.7 && o.trace !== false) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    orifice.forEach((p, i) => { const q = F.P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  finish(ctx, F);
  return { F, C };
}

/** Parasternal short axis at the papillary muscles: septal flattening (eccentricity index). */
export function drawPSAXpm(ctx, box, g, o = {}) {
  // the sector, depth and LV centre of chapter 04's mesh PSAX at the papillary muscles
  const F = frame(ctx, box, o.depth ?? 14, o.title ?? 'PSAX · PAPILLARY MUSCLES', { deg: 80, near: 1.2 });
  const ph = phase(o.t ?? 150);
  const shape = (c) => {
    const C = [-0.1, 7.7];
    const lvid = at(g.lvid, c), wall = at(g.wall ?? 0.9, c);
    const ei = at(g.ei ?? 1, c);                      // D1 / D2: >1 when the septum flattens
    const rx = lvid / 2, ry = lvid / 2 / ei;
    const lv = [];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      const sx = Math.cos(a), sy = Math.sin(a);
      // the septal side (left on screen) pulled in so that the drawn D2 / D1 equals ei
      const f = 2 / ei - 1;
      const flat = sx < 0 ? 1 - (1 - f) * sx * sx : 1;
      lv.push([C[0] + rx * sx * flat, C[1] + ry * ei * sy]);
    }
    const lvC = [...lv, lv[0]];
    const lvOut = offsetAway(lvC, wall, C);
    const rvW = at(g.rvw ?? 2.9, c);
    // RV free wall: a crescent over the septal and anterior side of the LV, as chapter 04's mesh
    // shows it: from 172° to 300° on screen, deepest (rvW) at 236°, upper left. Its ends sit on
    // the LV wall, flattened or not.
    const A0 = (236 * Math.PI) / 180, h0 = (64 * Math.PI) / 180;
    const rOut = (a) => hitDist(lvOut, C, a);
    const P = (a, r) => [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
    const rv = spline([P(A0 - h0, rOut(A0 - h0)), P(A0 - h0 * 0.55, rOut(A0 - h0 * 0.55) + rvW * 0.72), P(A0, rOut(A0) + rvW),
      P(A0 + h0 * 0.55, rOut(A0 + h0 * 0.55) + rvW * 0.72), P(A0 + h0, rOut(A0 + h0))], 8);
    const rvOut = offsetAway(rv, 0.35, C);
    const rvMid = P(A0, rOut(A0) + rvW * 0.5);
    // places for the RV label along the middle of the crescent, from its deepest point toward the
    // beam: a dilated RV runs out of the sector at the upper left
    const rvLabs = Array.from({ length: 12 }, (_, i) => { const a = A0 + h0 * 0.07 * i; return P(a, rOut(a) + rvW * 0.5); });
    // coarse trabeculae on the free wall, the most at the middle of the crescent
    const rvT = trabeculate(rv, (u) => 0.15 * Math.sin(Math.PI * u), rvMid, 0.9);
    // papillary muscles: anterolateral and posteromedial, a little below 3 and 9 o'clock, where
    // chapter 04's mesh has them at this level
    const pms = [0.26, 2.88].map((a) => ellipse([C[0] + (rx - 0.45) * Math.cos(a), C[1] + (ry * ei - 0.45) * Math.sin(a)], 0.5, 0.4, 18));
    return { C, rx, ry, ei, lv: lvC, lvOut, rv, rvOut, pms, wall, rvW, rvMid, rvLabs, lvRib: ribbon(lvC, lvOut), rvRib: ribbon(rvT, rvOut), rvT };
  };
  const S = shape(ph.c), Sr = shape(0);
  const items = [
    { polys: [S.lvRib], refs: [Sr.lvRib], e: DB.myo },
    { polys: [S.rvRib], refs: [Sr.rvRib], e: DB.myo - 1 },
    { polys: S.pms, refs: Sr.pms, e: DB.myo },
    { borders: [S.lv, S.lvOut, S.rvT], refs: [Sr.lv, Sr.lvOut, Sr.rvT], e: DB.myo, spec: 7 },
  ];
  scan(ctx, F, items, { t: o.t });
  const { C, rx, ry, ei } = S;
  if (o.labels !== false) {
    const inside = (p) => p[1] > 2.2 && Math.abs(p[0]) < (p[1] - 1.4) * Math.tan(F.view.half);
    tag(ctx, F, 'LV', C);
    tag(ctx, F, 'RV', S.rvLabs.find(inside) ?? S.rvLabs[S.rvLabs.length - 1]);
  }
  finish(ctx, F);
  return { F, C, rx, ry: ry * ei };
}

/** Subcostal IVC M-mode over one breath: diameter and collapse with a sniff. */
export function drawIVC(ctx, box, g, o = {}) {
  panel(ctx, box.x, box.y, box.w, box.h, o.title ?? 'M-MODE · IVC, SUBCOSTAL');
  const B = { x: box.x + 6, y: box.y + 24, w: box.w - 40, h: box.h - 30 };
  const pxcm = B.h / 6;
  const mid = B.y + B.h * 0.5;
  // cm and fraction on the sniff, in steps small enough not to show (the strip is cached)
  const dmax = Math.round(g.d * 20) / 20, coll = Math.round(g.collapse * 50) / 50;
  // lumen: diameter over time, a sniff in the middle
  const dAt = (u) => {
    const sniff = Math.exp(-(((u - 0.55) / 0.07) ** 2));
    const card = 0.04 * Math.sin(u * Math.PI * 2 * 7);
    return dmax * (1 - coll * sniff) * (1 + card);
  };
  // liver above and below the vein; the walls move with the lumen
  mmode(ctx, B, 0, 6, (u) => {
    const h = dAt(u) / 2, m = dmax / 2 - h;
    return [[0, 0.22, 3, 0], [0.22, 3 - h - 0.09, DB.liver, m], [3 - h - 0.09, 3 - h + 0.02, 9, m], [3 + h - 0.02, 3 + h + 0.09, 9, -m], [3 + h + 0.09, 6, DB.liver - 2, -m]];
  }, `ivc|${dmax.toFixed(2)}|${coll.toFixed(2)}`);
  // calipers: largest diameter and the sniff
  const x1 = B.x + B.w * 0.2, x2 = B.x + B.w * 0.55;
  caliper(ctx, x1, mid - (dAt(0.2) / 2) * pxcm, x1, mid + (dAt(0.2) / 2) * pxcm, { size: 3.5 });
  caliper(ctx, x2, mid - (dAt(0.55) / 2) * pxcm, x2, mid + (dAt(0.55) / 2) * pxcm, { size: 3.5 });
  // the two readings side by side, or one above the other when the strip is short
  const t1 = `${g.d.toFixed(1)} cm`, t2 = `sniff ${(g.d * (1 - g.collapse)).toFixed(1)} cm`;
  ctx.save();
  ctx.font = `500 10.5px ${MONO}`;
  const w1 = ctx.measureText(t1).width + 12, w2 = ctx.measureText(t2).width + 12;
  ctx.restore();
  const clash = x1 + 6 + w1 + 4 > Math.min(B.x + B.w - w2 - 4, x2 + 6);
  tagBox(ctx, x1 + 6, clash ? mid - 13 : mid, [t1], { size: 10.5, bounds: B });
  tagBox(ctx, x2 + 6, clash ? mid + 13 : mid, [t2], { size: 10.5, bounds: B });
  // depth scale
  ctx.save();
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = SC.dim;
  ctx.strokeStyle = SC.dim;
  for (let d = 0; d <= 6; d += 1) {
    const y = B.y + d * pxcm;
    ctx.beginPath(); ctx.moveTo(B.x + B.w + 2, y); ctx.lineTo(B.x + B.w + 6, y); ctx.stroke();
    if (d % 2 === 0 && d > 0 && d < 6) ctx.fillText(String(d), B.x + B.w + 9, y + 3.5);
  }
  ctx.fillText('cm', B.x + B.w + 9, B.y + B.h - 2);
  ctx.restore();
}
