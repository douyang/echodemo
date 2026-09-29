// Parametric echo views for the severity pages, drawn to scale in cm: apical four-chamber,
// parasternal long axis, three short-axis levels and an IVC M-mode. The model gives the sizes;
// the views draw them, so a caliper on the screen reads the value the page reports. The image
// comes from bmode.js: each structure has its own echogenicity, a surface is brighter where
// the beam meets it head-on, and the speckle moves with the tissue.
import { SC, sectorPath, colorOf, colorBar, caliper, panel, tagBox } from './scope.js';
import { cycleAt } from './cyclemodel.js';
import { bmode, mmode, DB } from './bmode.js';
import { MONO, SANS, clamp, mix } from './sketch.js';
import { cine } from './sev.js';

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
  return poly.map((p, i) => {
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(n - 1, i + 1)];
    let nn = unit(perp(sub(b, a)));
    if ((p[0] - ref[0]) * nn[0] + (p[1] - ref[1]) * nn[1] < 0) nn = mul(nn, -1);
    const d = typeof th === 'function' ? th(i / (n - 1)) : th;
    return add(p, mul(nn, d));
  });
}
const ribbon = (inner, outer) => [...inner, ...outer.slice().reverse()];
const centroid = (poly) => mul(poly.reduce((a, p) => add(a, p), [0, 0]), 1 / poly.length);
/** An ellipse (or circle) of n points. */
const ellipse = (c, rx, ry = rx, n = 40) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]; });
/** A closed ring between two ellipses about c. */
const ring = (c, r0, r1, n = 32, k = 1) => { const a = ellipse(c, r0, r0 * k, n), b = ellipse(c, r1, r1 * k, n); return ribbon([...a, a[0]], [...b, b[0]]); };
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

// ---------------------------------------------------------------- the scanner frame
/** Panel, sector and cm -> px mapping. deg: sector angle; depth in cm; near: chest wall (cm). */
export function frame(ctx, box, depthIn, title, o = {}) {
  panel(ctx, box.x, box.y, box.w, box.h, title);
  // the scanner sets depth in half-centimetre steps
  const depth = Math.round(depthIn * 2) / 2;
  const deg = o.deg ?? 80;
  const top = box.y + 24;
  // the sector fills the panel height; its sides may run past the panel and are clipped
  const R = Math.max(40, box.h - 30);
  const cx = box.x + box.w / 2 + (o.shift ?? 0) * box.w;
  const k = R / depth;
  const sect = { cx, top, R, deg };
  const P = (p) => [cx + p[0] * k, top + p[1] * k];
  const clipBox = new Path2D();
  clipBox.rect(box.x + 1, box.y + 20, box.w - 30, box.h - 21);
  const view = { box: { x: box.x + 1, y: box.y + 20, w: box.w - 30, h: box.h - 21 }, cx, top, k, half: (deg / 2) * (Math.PI / 180), depth, near: o.near ?? 1.4 };
  return { sect, k, P, depth, box, clipBox, view, fan: sectorPath(cx, top, R, deg) };
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
    if (y > box.y + box.h - 6) break;
    const l = d % 5 === 0 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y);
    ctx.stroke();
    if (d % 5 === 0) ctx.fillText(String(d), x + 8, y + 3.5);
  }
  ctx.restore();
}

/** Measurement box in the panel's lower left corner, as on the scanner. */
export function measures(ctx, F, lines) {
  if (!lines.length) return;
  tagBox(ctx, F.box.x + 8, F.box.y + F.box.h - 8 - (lines.length * 14 + 8) / 2, lines, { size: 10.5 });
}

/** Small white chamber labels. */
function tag(ctx, F, text, p, o = {}) {
  const q = F.P(p);
  ctx.save();
  ctx.font = `600 ${o.size || 11}px ${SANS}`;
  ctx.fillStyle = o.color || 'rgba(214,222,226,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, q[0], q[1]);
  ctx.restore();
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

// ---------------------------------------------------------------- the beat
/** Contraction 0 (end-diastole) .. 1 (end-systole), valve drives, at ms after the R wave. */
export function phase(t) {
  const c = cycleAt(t);
  return { c: clamp(c.s, 0, 1), mvShut: c.drive.mv, tvShut: c.drive.tv, avOpen: c.drive.av, t: c.t };
}
const at = (pair, c) => (Array.isArray(pair) ? mix(pair[0], pair[1], c) : pair);

// ---------------------------------------------------------------- color flow
let JC = null;
const hash = (i, j, f) => { const x = Math.sin(i * 127.1 + j * 311.7 + f * 74.7) * 43758.5453; return x - Math.floor(x); };
/** Smooth noise in 0..1 on a lattice of `step` cells (blobs about that size), frame f. */
function blob(i, j, step, f) {
  const x = i / step, y = j / step, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, f), b = hash(x0 + 1, y0, f), c = hash(x0, y0 + 1, f), d = hash(x0 + 1, y0 + 1, f);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * A regurgitant or stenotic jet in color Doppler: flow convergence (PISA) upstream of the
 * orifice O and a turbulent jet downstream, inside a color box, as the scanner shows them:
 * velocity along the beam, red toward the probe, wrapping at the aliasing velocity, with a
 * green variance tag where the flow is turbulent. dir: unit vector of the jet (downstream);
 * q: flow (mL/s); va: aliasing velocity (cm/s); vc: vena contracta (cm); jl, jw: jet length
 * and largest width (cm); clip: chamber polygon (cm) the jet stays inside; a: 0..1 strength
 * over the cycle; laminar: a slow jet without the mosaic.
 */
export function jet(ctx, F, j) {
  if (!j || j.a <= 0.02 || j.q <= 0) return;
  const { k, box, sect } = F;
  const O = j.O, d = unit(j.dir), n = perp(d);
  const va = j.va, L = j.jl * Math.min(1, j.a * 1.15), Wd = j.jw, w0 = Math.max(0.12, j.vc / 2);
  const v0 = clamp(j.q / (Math.PI * w0 * w0), 90, 600);   // cm/s at the vena contracta
  const Rp = j.pisa === false ? 0 : Math.min(2.4, Math.sqrt(j.q / (2 * Math.PI * 0.15 * va)));
  const halfAt = (u) => w0 + (Wd / 2 - w0) * Math.sin(Math.PI * Math.min(1, (u / Math.max(L, 0.01)) * 0.9 + 0.1)) ** 0.8 * Math.min(1, (u / Math.max(L, 0.01)) * 2.2);
  // the region to color, in px: the jet and the convergence zone
  const pts = [add(O, mul(n, Wd / 2 + 0.2)), add(O, mul(n, -Wd / 2 - 0.2)), add(add(O, mul(d, L + 0.2)), mul(n, Wd / 2 + 0.2)), add(add(O, mul(d, L + 0.2)), mul(n, -Wd / 2 - 0.2)), add(O, mul(d, -Rp - 0.1)), add(add(O, mul(d, -0.1)), mul(n, Rp + 0.1)), add(add(O, mul(d, -0.1)), mul(n, -Rp - 0.1))].map(F.P);
  const x0 = Math.max(box.x, Math.min(...pts.map((p) => p[0]))), x1 = Math.min(box.x + box.w - 30, Math.max(...pts.map((p) => p[0])));
  const y0 = Math.max(box.y + 20, Math.min(...pts.map((p) => p[1]))), y1 = Math.min(box.y + box.h, Math.max(...pts.map((p) => p[1])));
  if (x1 <= x0 || y1 <= y0) return;
  const cell = Math.max(2, k * 0.09);                        // color pixels about 1 mm
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (!JC) JC = document.createElement('canvas');
  if (JC.width < W || JC.height < H) { JC.width = Math.max(JC.width, W); JC.height = Math.max(JC.height, H); }
  const g = JC.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(W, H), px = img.data;
  const clip = j.clip ? new Path2D() : null;
  if (clip) { j.clip.forEach((p, i) => { const q = F.P(p); if (i) clip.lineTo(q[0], q[1]); else clip.moveTo(q[0], q[1]); }); clip.closePath(); }
  const f = cine.live ? Math.floor(performance.now() / 45) : 0;
  for (let jj = 0; jj < H; jj++) {
    for (let ii = 0; ii < W; ii++) {
      const X = x0 + (ii + 0.5) * cell, Y = y0 + (jj + 0.5) * cell;
      const p = [(X - sect.cx) / k, (Y - sect.top) / k];
      const rel = sub(p, O), al = dot(rel, d), ac = dot(rel, n);
      const toward = unit(mul(p, -1));                         // from here to the probe
      let vb = 0, vr = 0, alpha = 0;
      if (al >= -0.02) {
        // the jet: fastest in its core, slowing and widening downstream
        if (al > L) continue;
        const half = halfAt(al);
        if (Math.abs(ac) > half) continue;
        if (clip && !g.isPointInPath(clip, X, Y)) continue;
        const vcl = v0 / (1 + (0.35 * al) / w0);
        const v = vcl * Math.exp(-((ac / (0.55 * half)) ** 2)) * j.a;
        const turb = j.laminar ? 0.08 : 0.55 * Math.min(1, 0.4 + al / (4 * w0));
        const nz = blob(ii, jj, 2.2, f) - 0.5, nz2 = blob(ii + 50, jj + 50, 1.3, f) - 0.5;
        vb = v * dot(d, toward) + turb * vcl * (1.6 * nz + 0.8 * nz2);
        vr = Math.min(1, (turb * vcl) / va) * (j.laminar ? 0 : 1);
        alpha = Math.min(1, j.a * 1.5) * (1 - smooth((Math.abs(ac) / half - 0.75) / 0.25)) * (1 - smooth((al / Math.max(L, 0.01) - 0.8) / 0.2));
      } else if (Rp > 0) {
        // flow convergence: v = q / (2 pi r^2) toward the orifice
        const r = len(rel);
        if (r > Rp || r < 0.04) continue;
        const v = (j.q / (2 * Math.PI * r * r)) * j.a;
        vb = v * dot(unit(sub(O, p)), toward);
        alpha = Math.min(1, j.a * 1.4) * smooth((Math.abs(vb) / va - 0.12) / 0.12);
      }
      if (alpha <= 0.02 || Math.abs(vb) < 0.1 * va) continue;
      const [cr, cg, cb] = colorOf(vb / 100, va / 100, 0.45 * vr);
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

// ---------------------------------------------------------------- apical four-chamber
/** Every A4C structure (cm) at contraction c; valves follow the phase ph. */
function a4cShape(g, c, ph) {
  const lvL = at(g.lvL, c), lvW = at(g.lvW, c), wall = at(g.lvWall, c), ivs = at(g.ivs, c);
  const rvW = at(g.rvW, c), rvWall = at(g.rvWall ?? 0.4, c);
  const laW = at(g.laW, c), laL = at(g.laL, c), raW = at(g.raW, c), raL = at(g.raL, c);
  const ma = at(g.ma ?? 3.1, c), ta = at(g.ta ?? 3.0, c);
  // LV: apex fixed, the base moves toward it in systole
  const apexY = 1.9 + 0.65 * wall;
  const yb = apexY + lvL;
  const A = [0.2, apexY];                              // endocardial apex
  const xsb = -0.95 + ivs / 2;                         // septal endocardium at the base
  const B = [xsb + ma * 0.5, yb];                      // mitral annulus center
  const ax = unit(sub(A, B));                          // base -> apex
  let nl = perp(ax); if (nl[0] < 0) nl = mul(nl, -1);  // toward the lateral wall
  const out = mul(nl, -1);                             // toward the RV free wall
  const N = 36;
  const widthAt = (u) => (u < 0.22 ? mix(ma, lvW, smooth(u / 0.22)) : lvW * Math.pow(Math.max(0, 1 - ((u - 0.22) / 0.78) ** 2.3), 0.5));
  const Pax = (u) => lerp2(B, A, u);
  const sep = [], lat = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, w = widthAt(u);
    sep.push(add(Pax(u), mul(nl, -w * 0.44 * (1 - 0.06 * Math.sin(Math.PI * u)))));
    lat.push(add(Pax(u), mul(nl, w * 0.56 * (1 + 0.05 * Math.sin(Math.PI * u)))));
  }
  const lvCav = [...sep, ...lat.slice(0, -1).reverse()];   // septal hinge -> apex -> lateral hinge
  const S0 = sep[0], L0 = lat[0];
  const lvC = centroid(lvCav);
  // trabeculae line the apical third
  const trab = (u) => 0.13 * smooth((u - 0.58) / 0.3);
  const sepT = trabeculate(sep, trab, lvC, 0.7), latT = trabeculate(lat, trab, lvC, 2.1);
  const lvCavT = [...sepT, ...latT.slice(0, -1).reverse()];
  // septum: LV septal border offset toward the RV by its thickness
  const nsep = (i) => {
    const a = sep[Math.max(0, i - 1)], b = sep[Math.min(N, i + 1)];
    let nn = unit(perp(sub(b, a)));
    if ((sep[i][0] - lvC[0]) * nn[0] + (sep[i][1] - lvC[1]) * nn[1] < 0) nn = mul(nn, -1);
    return nn;
  };
  const rvSep = sep.map((p, i) => add(p, mul(nsep(i), ivs * (1 - 0.25 * (i / N) ** 3))));
  const iRvApex = Math.round(N * 0.74);
  const ivsRib = ribbon(sepT.slice(0, iRvApex + 2), rvSep.slice(0, iRvApex + 2));
  // LV apical and lateral wall
  const lvFree = lvCav.slice(iRvApex - 1), lvFreeT = lvCavT.slice(iRvApex - 1);
  const lvOut = offsetAway(lvFree, (u) => wall * (0.68 + 0.32 * smooth((u - 0.35) / 0.4)), lvC);
  const lvRib = ribbon(lvFreeT, lvOut);
  // RV: from the tricuspid septal hinge (more apical than the mitral one) up the septum, around
  // the RV apex, down the free wall to the tricuspid lateral hinge
  const iTv = Math.round(N * 0.055);
  const TS = rvSep[iTv];
  const Ra = rvSep[iRvApex];
  const TL = add(add(TS, mul(out, ta)), mul(ax, 0.15));
  const Mb = add(add(rvSep[Math.round(N * 0.2)], mul(out, rvW)), mul(ax, -0.1));
  const Mm = add(rvSep[Math.round(N * 0.48)], mul(out, rvW * 0.82));
  const rvFree = spline([Ra, add(rvSep[Math.round(N * 0.66)], mul(out, rvW * 0.5)), Mm, Mb, TL], 10);
  const rvC = centroid([...rvSep.slice(iTv, iRvApex + 1), ...rvFree]);
  const rvFreeT = trabeculate(rvFree, (u) => 0.17 * (1 - smooth(u / 0.45)), rvC, 1.3);
  const rvOut = offsetAway(rvFree, rvWall, rvC);
  const rvRib = ribbon(rvFreeT, rvOut);
  const rvSepEndo = rvSep.slice(iTv, iRvApex + 1);
  // moderator band: septum to free wall where the apical third of the RV begins
  const mbS = rvSep[Math.round(N * 0.56)];
  let jb = 0, db = Infinity;
  for (let j = 0; j < rvFree.length * 0.6; j++) { const d = Math.abs(dot(sub(rvFree[j], mbS), ax)); if (d < db) { db = d; jb = j; } }
  const mb = spline([add(mbS, mul(out, 0.05)), add(lerp2(mbS, rvFree[jb], 0.5), mul(ax, 0.22)), rvFree[jb]], 6);
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
  const raPts = [
    TL,
    add(add(TL, mul(rdown, raL * 0.35)), mul(out, Math.max(0.1, raW - ta) * 0.7)),
    add(add(iasTop, mul(rdown, raL * 0.72)), mul(out, raW * 0.95)),
    add(add(iasTop, mul(rdown, raL)), mul(out, raW * 0.45)),
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
  // valves
  const valve = (h1, h2, towardV, gapCm, shut, dome, tipW) => {
    const mid = lerp2(h1, h2, 0.5), span = unit(sub(h2, h1));
    const closedTip = add(mid, mul(towardV, 0.45));
    const c1 = add(closedTip, mul(span, -gapCm / 2)), c2 = add(closedTip, mul(span, gapCm / 2));
    let o1, o2;
    if (dome > 0) {
      // stenotic: tips held close, bodies dome into the ventricle
      const tip = add(mid, mul(towardV, 1.6 + 0.4 * dome));
      o1 = add(tip, mul(span, -tipW / 2));
      o2 = add(tip, mul(span, tipW / 2));
    } else {
      o1 = add(add(h1, mul(towardV, 2.2)), mul(span, 0.35));
      o2 = add(add(h2, mul(towardV, 1.35)), mul(span, -0.3));
    }
    const t1 = lerp2(o1, c1, shut), t2 = lerp2(o2, c2, shut);
    const bow = (h, tp, s) => {
      const m = lerp2(h, tp, 0.5);
      const bulge = dome > 0 ? mul(towardV, 0.55 * dome * (1 - shut)) : mul(towardV, 0.15);
      return spline([h, add(m, add(bulge, mul(span, s * 0.1))), tp], 6);
    };
    return { l1: bow(h1, t1, 1), l2: bow(h2, t2, -1), tip: lerp2(t1, t2, 0.5), open: lerp2(o1, o2, 0.5), gapMid: closedTip };
  };
  const mv = valve(S0, L0, ax, g.mv?.gap ?? 0, ph.mvShut, g.mv?.dome ?? 0, g.mv?.tip ?? 1.2);
  const Tc = lerp2(TS, TL, 0.5);
  const rvAx = unit(sub(Ra, Tc));
  const tv = valve(TS, TL, rvAx, g.tv?.gap ?? 0, ph.tvShut, 0, 1.2);
  const chords = [[pmTip, along(mv.l2, 0.9)], [pmTip, along(mv.l1, 0.9)]];
  // pericardium around the free walls, from the right atrium to the left atrium
  const heartC = centroid([lvC, rvC, laC, raC]);
  const every = (p, k) => p.filter((_, i) => i % k === 0);
  const periPts = [add(TL, mul(out, 0.3)), ...every(rvOut.slice().reverse(), 5), ...every(lvOut, 4), add(L0, mul(nl, wall + 0.25))];
  const peri = offsetAway(spline(periPts, 3), 0.13, heartC);
  // behind the atria: mediastinum, with the descending aorta beside the left atrium
  const yDeep = Math.max(...laCav.map((p) => p[1]), ...raCav.map((p) => p[1]));
  const medi = [[raC[0] - raW * 0.95, yDeep - 1.1], [laC[0] + laW * 0.95, yDeep - 1.1], [laC[0] + laW + 3.5, 30], [raC[0] - raW - 3.5, 30]];
  const daC = add(laPts[4], add(mul(ldown, 1.45), mul(nl, 0.55)));
  return {
    A, B, S0, L0, TS, TL, Ra, ax, nl, out, lvC, rvC, laC, raC, lvCav, lvCavT, laCav, raCav, rvFree, rvFreeT, rvSep, rvSepEndo,
    lvOut, rvOut, laOut, raOut, ivsRib, lvRib, rvRib, laRibs, raRib, pvWalls, crux, annuli, pm, mb, mv, tv, chords, peri,
    medi, daRing: ring(daC, 0.95, 1.17, 28), daLumen: ellipse(daC, 0.95, 0.95, 28), lvW, lvL, rvW, laW, laL, raW, raL, ma, ta,
  };
}

function a4cItems(S, Sr, g) {
  return [
    { polys: [S.medi], e: -21 },
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
    { lines: S.pvWalls, refs: Sr.pvWalls, e: -7, w: 0.1 },
    { borders: [S.lvCavT], refs: [Sr.lvCavT], e: DB.myo, spec: 8 },
    { borders: [S.rvSepEndo, S.rvFreeT], refs: [Sr.rvSepEndo, Sr.rvFreeT], e: DB.myo, spec: 7 },
    { borders: [S.laCav, S.raCav], refs: [Sr.laCav, Sr.raCav], e: DB.myo - 2, spec: 6 },
    { borders: [S.lvOut, S.rvOut], refs: [Sr.lvOut, Sr.rvOut], e: DB.myo, spec: 6 },
    { borders: [S.peri], refs: [Sr.peri], e: 7, spec: 10, w: 0.14, all: true },
    { lines: [S.mv.l1, S.mv.l2], e: valveDb(g.mv), w: g.mv?.thick ?? 0.12 },
    { lines: [S.tv.l1, S.tv.l2], e: valveDb(g.tv) - 1, w: g.tv?.thick ?? 0.1 },
    { lines: S.chords, e: DB.chord - 4, w: 0.04 },
  ];
}

/**
 * g (cm; [ED, ES] pairs beat with the heart):
 *   lvL, lvW, lvWall, ivs, rvW, rvWall, laW, laL ([min, max]), raW, raL, ma (mitral annulus),
 *   ta (tricuspid annulus), mv: {thick, gap, dome, tip}, tv: {thick, gap}
 * o: t (ms), title, depth, jets: {mr, tr, ms} (flow q mL/s, va, vc, jl, jw), labels, gain
 * Returns the geometry (cm) for labels and measurements.
 */
export function drawA4C(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 16, o.title ?? 'APICAL FOUR-CHAMBER', { deg: 80, near: 1.2 });
  const ph = phase(o.t ?? 150);
  const c = ph.c;
  const S = a4cShape(g, c, ph), Sr = a4cShape(g, 0, ph);
  scan(ctx, F, a4cItems(S, Sr, g), { t: o.t, gain: o.gain });
  // jets
  const J = o.jets || {};
  const ldown = unit(add(mul(S.ax, -1), mul(S.nl, 0.12))), rdown = unit(add(mul(S.ax, -1), mul(S.out, 0.18)));
  if (J.mr) jet(ctx, F, { ...J.mr, O: S.mv.gapMid, dir: ldown, clip: S.laCav });
  if (J.tr) jet(ctx, F, { ...J.tr, O: S.tv.gapMid, dir: rdown, clip: S.raCav });
  if (J.ms) jet(ctx, F, { ...J.ms, O: S.mv.tip, dir: S.ax, clip: S.lvCav });
  if (J.mr || J.tr || J.ms) colorBar(ctx, box.x + box.w - 20, box.y + 34, Math.min(90, box.h * 0.25), (J.mr || J.tr || J.ms).va / 100, { w: 7 });
  if (o.labels !== false) {
    tag(ctx, F, 'LV', add(S.lvC, mul(S.ax, 0.8)));
    tag(ctx, F, 'RV', add(centroid(S.rvFree), mul(S.out, -0.2)));
    tag(ctx, F, 'LA', S.laC);
    tag(ctx, F, 'RA', S.raC);
  }
  const geo = { ...S, F, c, ph };
  if (o.after) o.after(ctx, F, geo);
  finish(ctx, F);
  return geo;
}

// ---------------------------------------------------------------- parasternal long axis
/** Every PLAX structure in the heart's own frame (x toward the aorta, y depth), cm. */
function plaxShape(g, c, ph) {
  const ivs = at(g.ivs, c), lvid = at(g.lvid, c), pw = at(g.pw, c), rvd = at(g.rvd ?? 2.6, c);
  const la = at(g.la, c), root = g.root ?? 3.1, lvot = g.lvot ?? 2.1;
  const y0 = 1.75;                                  // RV free wall
  const yRv = y0 + 0.4, yIvs = yRv + rvd, yLv = yIvs + ivs, yPw = yLv + lvid, yEpi = yPw + pw;
  const xL = -10, xAnn = 0.55, xM = -2.3;
  // the walls converge toward the apex, off the left of the image; not at all at the tips
  const cv = (x) => (x >= xM ? 0 : smooth((xM - x) / (xM - xL)));
  const aoTop = yLv - 0.05, aoBot = aoTop + lvot, aoMid = (aoTop + aoBot) / 2;
  const hingeP = [xAnn + 0.35, yPw - 0.1];          // posterior mitral hinge (AV groove)
  const hingeA = [xAnn + 0.1, aoBot + 0.08];        // anterior mitral hinge (aortic-mitral curtain)
  const xs = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
  // septum: thinner toward the membranous part, where it meets the anterior aortic wall
  const sepTh = (x) => ivs * (x < -1.6 ? 1 : mix(1, 0.55, smooth((x + 1.6) / (xAnn + 1.25))));
  const sepLV = [...xs(xL, xAnn - 0.35).map((x) => [x, yLv + 0.12 * lvid * cv(x)]), [xAnn + 0.05, aoTop + 0.02]];
  const sepRV = [...xs(xL, xAnn - 0.35).map((x) => [x, yLv + 0.12 * lvid * cv(x) - sepTh(x)]), [xAnn + 0.15, aoTop - 0.3]];
  const ivsRib = ribbon(sepLV, sepRV);
  // RV free wall across the top, over the outflow tract to the right
  const rvEndo = xs(xL, xAnn + 5.5).map((x) => [x, yRv + 0.22 * rvd * cv(x) - (x > xAnn ? 0.05 * (x - xAnn) : 0)]);
  const rvEpi = rvEndo.map((p) => [p[0], p[1] - 0.4]);
  const rvEndoT = trabeculate(rvEndo, (u) => 0.1 * (1 - smooth(u / 0.35)), [xL + 2, yIvs], 0.4);
  const rvRib = ribbon(rvEndoT, rvEpi);
  // posterior (inferolateral) wall, rising to the AV groove
  const pwEndo = xs(xL, hingeP[0]).map((x) => [x, yPw - 0.22 * lvid * cv(x) - 0.1 * smooth((x + 1.2) / (hingeP[0] + 1.2))]);
  const pwTh = (x) => pw * (x > -0.8 ? mix(1, 0.75, smooth((x + 0.8) / (hingeP[0] + 0.8))) : 1);
  const pwEpi = pwEndo.map((p) => [p[0], p[1] + pwTh(p[0])]);
  const pwRib = ribbon(pwEndo, pwEpi);
  // aortic root: sinuses, then the ascending aorta
  const sinus = (sgn) => spline([[xAnn, sgn < 0 ? aoTop : aoBot], [xAnn + 1.0, aoMid + sgn * root / 2], [xAnn + 2.3, aoMid + sgn * (root * 0.47)], [xAnn + 3.2, aoMid + sgn * root * 0.43], [xAnn + 7, aoMid + sgn * root * 0.42 - 0.5]], 8);
  const aoAnt = sinus(-1), aoPost = sinus(1);
  const aoAntWall = ribbon(aoAnt, aoAnt.map((p) => [p[0], p[1] - 0.28]));
  const aoPostWall = ribbon(aoPost, aoPost.map((p) => [p[0], p[1] + 0.28]));
  // LA behind the aortic root
  const laTop = aoBot + 0.33;
  const laPts = [[xAnn + 0.4, laTop], [xAnn + 2.4, laTop + 0.05], [xAnn + 3.9, laTop + la * 0.4], [xAnn + 3.5, laTop + la * 0.95], [xAnn + 1.6, laTop + la + 0.05], [hingeP[0] + 0.25, Math.max(laTop + la * 0.75, hingeP[1] + 0.2)], hingeP];
  const laCav = spline(laPts, 8);
  const laRib = ribbon(laCav, offsetAway(laCav, 0.22, centroid(laCav)));
  // coronary sinus in the AV groove; descending aorta behind the LA
  const csC = [hingeP[0] - 0.35, hingeP[1] + pw * 0.75 + 0.45];
  const daoC = [xAnn + 0.7, laTop + la + 1.4];
  // pericardium behind the posterior wall, round the AV groove, between the LA and the aorta
  const eff = g.effusion ?? 0;
  const periPts = [...pwEpi.filter((_, i) => i % 5 === 0).map((p) => [p[0], p[1] + 0.2 + eff]), [csC[0] + 0.3, csC[1] + 0.62 + eff * 0.5], [xAnn + 2.2, laTop + la + 0.4 + eff * 0.3], [xAnn + 3.8, laTop + la * 0.85 + 0.35]];
  const peri = spline(periPts, 4);
  const post = [...peri, [xAnn + 9, laTop + la], [xAnn + 9, 30], [xL - 2, 30], [xL - 2, peri[0][1]]];
  // aortic valve: right and non-coronary cusps from the annulus
  const openW = (g.av?.open ?? 1.9) * ph.avOpen;
  const cuspA0 = [xAnn + 0.05, aoTop + 0.05], cuspP0 = [xAnn + 0.05, aoBot - 0.05];
  const cMid = [xAnn + 1.15, aoMid];
  const cuspA = spline([cuspA0, lerp2([xAnn + 0.8, aoMid - 0.25], [xAnn + 0.9, aoTop + 0.35], ph.avOpen), [cMid[0] + 0.35 * ph.avOpen, aoMid - Math.max(0.03, openW / 2)]], 6);
  const cuspP = spline([cuspP0, lerp2([xAnn + 0.8, aoMid + 0.25], [xAnn + 0.9, aoBot - 0.35], ph.avOpen), [cMid[0] + 0.35 * ph.avOpen, aoMid + Math.max(0.03, openW / 2)]], 6);
  // mitral valve: anterior leaflet from the posterior aortic root, posterior from the groove
  const shut = ph.mvShut;
  const dome = g.mv?.dome ?? 0;
  const coapt = [-0.35, (hingeA[1] + hingeP[1]) / 2 - 0.15];
  let tipA, tipP, ctrlA, ctrlP;
  if (dome > 0) {
    const w = g.mv?.tip ?? 1.2;
    const tipMid = [-1.9, (yLv + yPw) / 2 + 0.3];
    tipA = lerp2([tipMid[0], tipMid[1] - w / 2], coapt, shut);
    tipP = lerp2([tipMid[0] + 0.15, tipMid[1] + w / 2], [coapt[0] + 0.05, coapt[1] + 0.05], shut);
    ctrlA = lerp2([-0.9, yLv + 0.3], [(hingeA[0] + coapt[0]) / 2, (hingeA[1] + coapt[1]) / 2 - 0.3], shut);
    ctrlP = lerp2([-0.6, yPw - 0.4], [(hingeP[0] + coapt[0]) / 2, (hingeP[1] + coapt[1]) / 2 + 0.2], shut);
  } else {
    tipA = lerp2([-2.1, yLv + 0.55], coapt, shut);
    tipP = lerp2([-0.9, yPw - 0.35], [coapt[0] + 0.05, coapt[1] + 0.08], shut);
    ctrlA = lerp2([-0.8, yLv + 1.0], [(hingeA[0] + coapt[0]) / 2, (hingeA[1] + coapt[1]) / 2 - 0.15], shut);
    ctrlP = lerp2([-0.2, yPw - 0.5], [(hingeP[0] + coapt[0]) / 2, (hingeP[1] + coapt[1]) / 2 + 0.1], shut);
  }
  const aml = spline([hingeA, ctrlA, tipA], 8), pml = spline([hingeP, ctrlP, tipP], 8);
  // posteromedial papillary muscle rising from the posterior wall, chordae to both leaflets
  const pmX = -4.3, pmBase = [pmX, yPw - 0.22 * lvid * cv(pmX)];
  const pmDir = unit([0.4, -1]);
  const pm = muscle(pmBase, pmDir, 1.0, 0.8 + 0.25 * c, [0, 1]);
  const pmTip = add(pmBase, mul(pmDir, 0.9));
  const chords = [[pmTip, along(pml, 0.95)], [pmTip, along(aml, 0.95)], [add(pmTip, [0.2, 0]), along(aml, 0.7)]];
  const lvCav = [...sepLV.slice(0, -1), [xAnn, aoTop + 0.2], [xAnn, aoBot], hingeP, ...pwEndo.slice().reverse()];
  return {
    ivs, lvid, pw, la, yIvs, yLv, yPw, yEpi, laTop, aoTop, aoBot, aoMid, xAnn, lvot, hingeP, hingeA,
    ivsRib, sepLV, sepRV, rvRib, rvEndoT, pwRib, pwEndo, aoAnt, aoPost, aoAntWall, aoPostWall, laCav, laRib,
    csRing: ring(csC, 0.32, 0.46, 20, 0.9), csLumen: ellipse(csC, 0.32, 0.29, 20), daoRing: ring(daoC, 1.02, 1.25, 28, 0.92), daoLumen: ellipse(daoC, 1.02, 0.94, 28),
    peri, post, cuspA, cuspP, cuspA0, cuspP0, aml, pml, tipA, tipP, pm, chords, lvCav,
  };
}

/**
 * g (cm): rvd (RV outflow), ivs, lvid, pw ([ED, ES] pairs), root (aortic sinus), lvot, la (AP,
 *   [min, max]), av: {thick, open (orifice width at full opening, cm), calc}, mv: {thick, dome,
 *   tip (orifice width, cm), calc}, effusion
 * o: t, depth, jets: {ar, as, ms}, title, labels, after
 */
export function drawPLAX(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 15, o.title ?? 'PARASTERNAL LONG AXIS', { deg: 88, near: 1.4 });
  const ph = phase(o.t ?? 150);
  const c = ph.c;
  // the heart is tilted so the apex (left) lies deeper
  const th = -0.14, pivot = [0, 7];
  const R = (p) => {
    const d = sub(p, pivot), cs = Math.cos(th), sn = Math.sin(th);
    return [pivot[0] + d[0] * cs - d[1] * sn - 1.0, pivot[1] + d[0] * sn + d[1] * cs];
  };
  const RP = (poly) => poly.map(R);
  const S = plaxShape(g, c, ph), Sr = plaxShape(g, 0, ph);
  const two = (key) => ({ polys: [RP(S[key])], refs: [RP(Sr[key])] });
  const items = [
    { polys: [RP(S.post)], e: -26 },
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
    { lines: [RP(S.cuspA), RP(S.cuspP)], e: valveDb(g.av), w: g.av?.thick ?? 0.1 },
    { lines: [RP(S.aml), RP(S.pml)], e: valveDb(g.mv), w: g.mv?.thick ?? 0.12 },
    { lines: S.chords.map(RP), e: DB.chord, w: 0.05 },
  ];
  const calc = g.av?.calc ?? 0;
  if (calc > 0.05) {
    const spots = [[S.cuspA0, 0.22], [S.cuspP0, 0.2], [[S.xAnn + 0.6, S.aoTop + 0.3], 0.16], [along(S.cuspP, 0.6), 0.14]];
    items.push({ lines: spots.map(([p, r]) => RP([p, add(p, [r, 0.05])])), e: DB.calcium - 6 * (1 - calc), w: 0.12 + 0.18 * calc, shadow: 10 * calc });
  }
  if (g.mv?.calc) items.push({ lines: [RP([S.tipA, along(S.aml, 0.8)]), RP([S.tipP, along(S.pml, 0.8)])], e: DB.calcium - 4, w: 0.18, shadow: 8 * g.mv.calc });
  scan(ctx, F, items, { t: o.t, gain: o.gain });
  // jets
  const J = o.jets || {};
  const { xAnn, aoTop, aoBot, aoMid, yLv, yPw, tipA, tipP } = S;
  const lvCav = RP(S.lvCav);
  const aoCav = RP([[xAnn + 0.05, aoTop + 0.1], [xAnn + 7, aoTop - 0.6], [xAnn + 7, aoBot + 0.3], [xAnn + 0.05, aoBot - 0.1]]);
  if (J.ar) jet(ctx, F, { ...J.ar, O: R([xAnn + 0.6, aoMid]), dir: unit(sub(R([-4, aoMid + 1.0]), R([xAnn, aoMid]))), clip: lvCav });
  if (J.as) jet(ctx, F, { ...J.as, O: R([xAnn + 1.2, aoMid]), dir: unit(sub(R([xAnn + 6, aoMid - 0.3]), R([xAnn + 1.2, aoMid]))), clip: aoCav, pisa: false });
  if (J.ms) jet(ctx, F, { ...J.ms, O: R(lerp2(tipA, tipP, 0.5)), dir: unit(sub(R([-6, (yLv + yPw) / 2 + 0.6]), R(lerp2(tipA, tipP, 0.5)))), clip: lvCav });
  const anyJet = J.ar || J.as || J.ms;
  if (anyJet) colorBar(ctx, box.x + box.w - 20, box.y + 34, Math.min(90, box.h * 0.25), anyJet.va / 100, { w: 7 });
  if (o.labels !== false) {
    tag(ctx, F, 'RV', R([-1.2, (S.yIvs + 2.15) / 2]));
    tag(ctx, F, 'LV', R([-4.5, (yLv + yPw) / 2]));
    tag(ctx, F, 'Ao', R([xAnn + 3.6, aoMid]));
    tag(ctx, F, 'LA', R([xAnn + 2.1, S.laTop + S.la * 0.55]));
  }
  const geo = { F, R, yIvs: S.yIvs, yLv, yPw, yEpi: S.yEpi, ivs: S.ivs, lvid: S.lvid, pw: S.pw, la: S.la, laTop: S.laTop, aoTop, aoBot, aoMid, xAnn, c, ph, lvot: S.lvot };
  if (o.after) o.after(ctx, F, geo);
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
/** Parasternal short axis at the aortic valve: three cusps, orifice drawn to its area (cm²). */
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
  // left atrium behind, right atrium to the left, the atrial septum between
  const laC = [C[0] + 0.3, C[1] + r + 1.55], raC = [C[0] - r - 1.2, C[1] + 1.25];
  const la = ellipse(laC, 2.1, 1.25), ra = ellipse(raC, 1.3, 1.45);
  const laRib = ribbon([...la, la[0]], [...ellipse(laC, 2.3, 1.45), [laC[0] + 2.3, laC[1]]]);
  const raRib = ribbon([...ra, ra[0]], [...ellipse(raC, 1.5, 1.65), [raC[0] + 1.5, raC[1]]]);
  const root = ring(C, r, r + 0.22, 48);
  // tricuspid leaflets across the left end of the outflow band, pulmonary cusps at the right end
  const tvH1 = rvIn[0], tvH2 = rvOutC[0], tvDir = unit(sub(rvIn[3], rvIn[0]));
  const tvMid = lerp2(tvH1, tvH2, 0.5), tvOpen = 1 - ph.tvShut;
  const tvL = [[tvH1, add(lerp2(tvH1, tvMid, 0.9), mul(tvDir, 0.9 * tvOpen))], [tvH2, add(lerp2(tvH2, tvMid, 0.9), mul(tvDir, 0.9 * tvOpen))]];
  const n = rvIn.length - 1;
  const pvH1 = rvIn[n], pvH2 = rvOutC[n], pvDir = unit(sub(rvIn[n], rvIn[n - 3]));
  const pvMid = lerp2(pvH1, pvH2, 0.5);
  const pvL = [[pvH1, add(lerp2(pvH1, pvMid, 0.9), mul(pvDir, 0.9 * ph.avOpen))], [pvH2, add(lerp2(pvH2, pvMid, 0.9), mul(pvDir, 0.9 * ph.avOpen))]];
  const pa = [[pvH1, add(pvH1, mul(add(pvDir, [0.3, 0.9]), 1.6))], [pvH2, add(pvH2, mul(add(pvDir, [0.2, 0.9]), 1.8))]];
  // aortic cusps: closed, the three lines of the "Y"; open, a curved triangle of area AVA
  const area = Math.max(0.02, (g.ava ?? 3) * ph.avOpen);
  const ro = Math.min(r * 0.93, Math.sqrt((4 * area) / (3 * Math.sqrt(3))));
  const com = [0, 1, 2].map((i) => { const a = -PI / 2 + (i * 2 * PI) / 3 + PI / 3; return add(C, [r * Math.cos(a), r * Math.sin(a)]); });
  const cusps = [];
  for (let i = 0; i < 3; i++) {
    const p = com[i], q = com[(i + 1) % 3];
    const aMid = -PI / 2 + (i * 2 * PI) / 3 + PI;
    cusps.push(spline([p, add(C, [ro * 0.5 * Math.cos(aMid), ro * 0.5 * Math.sin(aMid)]), q], 8));
  }
  const items = [
    { polys: [fat], e: DB.fat - 2 },
    { polys: [la, ra], e: DB.blood, blood: true },
    { polys: [rvWall], e: DB.myo - 1 },
    { polys: [laRib, raRib], e: DB.myo - 2 },
    { polys: [root], e: DB.fibrous },
    { borders: [rvIn, rvOutC, la, ra], e: DB.myo, spec: 6 },
    { lines: [...tvL, ...pvL], e: DB.valve - 1, w: 0.09 },
    { lines: pa, e: DB.fibrous - 3, w: 0.18 },
    { lines: cusps, e: valveDb({ thick: g.thick }), w: g.thick ?? 0.12 },
  ];
  if (g.calc > 0.05) items.push({ lines: com.map((p) => [add(p, [-0.12, 0]), add(p, [0.12, 0.05])]), e: DB.calcium - 6 * (1 - g.calc), w: 0.3 * g.calc + 0.08, shadow: 9 * g.calc });
  scan(ctx, F, items, { t: o.t });
  // planimetry of the orifice during ejection
  if (ph.avOpen > 0.6 && o.trace !== false) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = -PI / 2 + (i * 2 * PI) / 3;
      const q = F.P(add(C, [ro * Math.cos(a) * 0.98, ro * Math.sin(a) * 0.98]));
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.restore();
  }
  finish(ctx, F);
  return { F, C };
}

/** Parasternal short axis at the mitral valve: the orifice drawn to its area (cm²). */
export function drawPSAXmv(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 12, o.title ?? 'PSAX · MITRAL VALVE', { deg: 72, near: 1.4 });
  const ph = phase(o.t ?? 600);
  const shape = (c) => {
    const C = [0, 6.6];
    const ri = (at(g.lvid, c) ?? 4.6) / 2, wall = at(g.wall ?? 0.9, c);
    const endo = ellipse(C, ri, ri, 56), epi = ellipse(C, ri + wall, ri + wall, 56);
    // RV crescent in front and to the left
    const rvI = arc(C, ri + wall, Math.PI * 1.02, Math.PI * 1.78, 24);
    const rvO = rvI.map((p, i) => { const u = i / (rvI.length - 1); return add(p, mul(unit(sub(p, [C[0] + 0.6, C[1] + 0.4])), 0.25 + 1.45 * Math.sin(Math.PI * u) ** 0.8)); });
    const rvW = offsetAway(rvO, 0.35, C);
    return { C, ri, wall, endo, epi, rvO, rvW, lv: ribbon([...endo, endo[0]], [...epi, epi[0]]), rv: ribbon(rvO, rvW) };
  };
  const S = shape(ph.c), Sr = shape(0);
  const C = S.C;
  // leaflets fill the annulus; the orifice is an ellipse (2:1) of the valve area
  const open = 1 - ph.mvShut;
  const area = Math.max(0.03, (g.mva ?? 4) * open);
  const bAx = Math.sqrt(area / (2 * Math.PI)), aAx = 2 * bAx;
  const annR = Math.min(S.ri * 0.92, 1.8);
  const Mc = [C[0], C[1] + 0.2];
  const orifice = ellipse(Mc, aAx, bAx, 40);
  const annulus = ellipse(Mc, annR, annR * 0.86, 40);
  const thick = g.thick ?? 0.12;
  const items = [
    { polys: [S.lv], refs: [Sr.lv], e: DB.myo },
    { polys: [S.rv], refs: [Sr.rv], e: DB.myo - 1 },
    { borders: [S.endo, S.epi, S.rvO], refs: [Sr.endo, Sr.epi, Sr.rvO], e: DB.myo, spec: 7, closed: true },
    // thickened leaflets: the whole fused sheet shows; thin ones, mostly their free edges
    { polys: [ribbon([...annulus, annulus[0]], [...orifice, orifice[0]])], e: thick > 0.2 ? valveDb({ thick }) - 3 : DB.myo - 9, rule: 'evenodd' },
    { lines: [orifice], e: valveDb({ thick }), w: Math.max(0.1, thick), closed: true },
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
  const F = frame(ctx, box, o.depth ?? 13, o.title ?? 'PSAX · PAPILLARY MUSCLES', { deg: 76, near: 1.4 });
  const ph = phase(o.t ?? 150);
  const shape = (c) => {
    const C = [0.8, 6.8];
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
    const rvW = at(g.rvw ?? 2.2, c);
    // RV free wall: a crescent from the anterior to the inferior septal junction, bulging left
    const top = [C[0] - rx * 0.35, C[1] - lvid / 2 - wall * 0.6], bot = [C[0] - rx * 0.35, C[1] + lvid / 2 + wall * 0.6];
    const far = [C[0] - rx * (0.2 + 2 / ei - 1) - wall - rvW, C[1]];
    const rv = spline([top, [far[0] + rvW * 0.35, C[1] - lvid * 0.62], far, [far[0] + rvW * 0.35, C[1] + lvid * 0.62], bot], 8);
    const rvOut = offsetAway(rv, 0.35, [C[0] - rx, C[1]]);
    // papillary muscles: anterolateral at 4 o'clock, posteromedial at 8 o'clock
    const pms = [0.62, 2.3].map((a) => ellipse([C[0] + (rx - 0.45) * Math.cos(a), C[1] + (ry * ei - 0.45) * Math.sin(a)], 0.5, 0.4, 18));
    return { C, rx, ry, ei, lv: lvC, lvOut, rv, rvOut, pms, wall, rvW, lvRib: ribbon(lvC, lvOut), rvRib: ribbon(rv, rvOut) };
  };
  const S = shape(ph.c), Sr = shape(0);
  const items = [
    { polys: [S.lvRib], refs: [Sr.lvRib], e: DB.myo },
    { polys: [S.rvRib], refs: [Sr.rvRib], e: DB.myo - 1 },
    { polys: S.pms, refs: Sr.pms, e: DB.myo },
    { borders: [S.lv, S.lvOut, S.rv], refs: [Sr.lv, Sr.lvOut, Sr.rv], e: DB.myo, spec: 7 },
  ];
  scan(ctx, F, items, { t: o.t });
  const { C, rx, ry, ei, wall, rvW } = S;
  if (o.labels !== false) { tag(ctx, F, 'LV', C); tag(ctx, F, 'RV', [C[0] - rx - wall - rvW * 0.55, C[1] - 0.3]); }
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
  tagBox(ctx, x1 + 6, mid, [`${g.d.toFixed(1)} cm`], { size: 10.5, bounds: B });
  tagBox(ctx, x2 + 6, mid, [`sniff ${(g.d * (1 - g.collapse)).toFixed(1)} cm`], { size: 10.5, bounds: B });
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
