// Parametric echo views for the severity pages, drawn to scale in cm: apical four-chamber,
// parasternal long axis, two short-axis insets and an IVC M-mode. The model gives the sizes;
// the views draw them, so a caliper on the screen reads the value the page reports.
import { SC, textures, sectorPath, colorOf, colorBar, caliper, panel, tagBox } from './scope.js';
import { cycleAt } from './cyclemodel.js';
import { rng, MONO, SANS, clamp, mix } from './sketch.js';

// ---------------------------------------------------------------- small geometry
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
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

// ---------------------------------------------------------------- the scanner frame
/** Panel, sector and cm -> px mapping. deg: sector angle; depth in cm. */
export function frame(ctx, box, depth, title, o = {}) {
  panel(ctx, box.x, box.y, box.w, box.h, title);
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
  return { sect, k, P, depth, box, clipBox, fan: sectorPath(cx, top, R, deg) };
}

// tissue is drawn into an offscreen mask, then filled with speckle
let MASK = null;
function maskCtx(w, h) {
  if (!MASK) MASK = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
  if (MASK.width !== W || MASK.height !== H) { MASK.width = W; MASK.height = H; }
  const g = MASK.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  return { g, dpr };
}

/**
 * Draw the B-mode image: tissue polygons (cm) filled with speckle over dark blood, bright
 * lines (valves, pericardium) on top. F: frame from frame().
 */
export function scan(ctx, F, tissue, o = {}) {
  const { sect, P, box } = F;
  const tex = textures(ctx);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.fillStyle = SC.bg;
  ctx.fill(F.fan);
  ctx.clip(F.fan);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = tex.blood;
  ctx.fill(F.fan);
  ctx.globalAlpha = 1;
  // tissue mask
  const { g, dpr } = maskCtx(box.w, box.h);
  g.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
  g.fillStyle = '#fff';
  for (const poly of tissue) {
    if (!poly || poly.length < 3) continue;
    g.beginPath();
    poly.forEach((p, i) => { const q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    g.fill();
  }
  // grey by depth, then speckle, only where the mask is set
  g.globalCompositeOperation = 'source-in';
  const grad = g.createRadialGradient(sect.cx, sect.top, 0, sect.cx, sect.top, sect.R);
  const gain = o.gain ?? 1;
  grad.addColorStop(0, `rgba(150,150,150,${0.95 * gain})`);
  grad.addColorStop(0.6, `rgba(120,120,120,${0.85 * gain})`);
  grad.addColorStop(1, `rgba(90,90,90,${0.75 * gain})`);
  g.fillStyle = grad;
  g.fillRect(box.x, box.y, box.w, box.h);
  g.globalCompositeOperation = 'source-atop';
  const st = textures(g);
  g.fillStyle = st.speckle;
  g.globalAlpha = 0.95;
  g.fillRect(box.x, box.y, box.w, box.h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  const T = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(MASK, 0, 0, MASK.width, MASK.height, box.x * T.a, box.y * T.d, box.w * T.a, box.h * T.d);
  ctx.setTransform(T);
  // endocardial edges, faint
  if (o.edges) {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (const poly of o.edges) {
      ctx.beginPath();
      poly.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
    }
  }
  // bright structures: [poly, widthCm, alpha]
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [poly, wcm, a] of o.bright || []) {
    ctx.strokeStyle = `rgba(245,248,250,${a ?? 0.92})`;
    ctx.lineWidth = Math.max(1.2, wcm * F.k);
    ctx.beginPath();
    poly.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
  }
  ctx.restore();
}

/** Sector outline and a depth scale on the panel's right edge, drawn last. */
export function finish(ctx, F) {
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = '#6a747a';
  ctx.lineWidth = 1;
  ctx.stroke(F.fan);
  ctx.restore();
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

// ---------------------------------------------------------------- color jets
const RND = rng(71);
const MOSAIC = Array.from({ length: 1400 }, () => [RND(), RND(), RND(), RND()]);
const PAL = [[255, 214, 90], [127, 227, 255], [120, 220, 120], [216, 65, 47], [47, 111, 216]];

/**
 * A regurgitant or stenotic jet: flow convergence (PISA) upstream of orifice O and a mosaic
 * jet downstream. dir: unit vector of the jet (downstream). q: flow (mL/s); va: aliasing (cm/s);
 * vc: vena contracta (cm); jl, jw: jet length and largest width (cm); clip: polygon (cm) the
 * jet stays inside; a: 0..1 strength over the cycle.
 */
export function jet(ctx, F, j) {
  if (!j || j.a <= 0.02 || j.q <= 0) return;
  const { P, k } = F;
  const O = j.O, d = unit(j.dir), n = perp(d);
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  if (j.clip) {
    const cp = new Path2D();
    j.clip.forEach((p, i) => { const q = P(p); if (i) cp.lineTo(q[0], q[1]); else cp.moveTo(q[0], q[1]); });
    cp.closePath();
    // the convergence side stays unclipped: clip only the jet half
    ctx.save();
    ctx.clip(cp);
    mosaic(ctx, F, j, O, d, n);
    ctx.restore();
  } else mosaic(ctx, F, j, O, d, n);
  // flow convergence: v = q / (2 pi r^2) toward O on the upstream side, colored along the beam
  if (j.pisa !== false) {
    const Rcm = Math.min(2.2, Math.max(0.6, 2.2 * Math.sqrt(j.q / 300)));
    const step = Math.max(2, Math.round(k * 0.12));
    const Oq = P(O);
    const rpx = Rcm * k;
    for (let y = Oq[1] - rpx; y <= Oq[1] + rpx; y += step) {
      for (let x = Oq[0] - rpx; x <= Oq[0] + rpx; x += step) {
        const pc = [(x - F.sect.cx) / k, (y - F.sect.top) / k];
        const rel = sub(pc, O);
        const along = rel[0] * d[0] + rel[1] * d[1];
        if (along > -0.05) continue;                  // upstream only
        const r = len(rel);
        if (r > Rcm || r < 0.05) continue;
        const v = (j.q / (2 * Math.PI * r * r)) * j.a;  // cm/s
        if (v < j.va * 0.35) continue;
        const flow = mul(unit(sub(O, pc)), v);          // toward the orifice
        const toProbe = unit(mul(pc, -1));
        const vb = flow[0] * toProbe[0] + flow[1] * toProbe[1];
        const [cr, cg, cb] = colorOf(vb / 100, j.va / 100);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.92 * Math.min(1, j.a * 1.4)})`;
        ctx.fillRect(x, y, step, step);
      }
    }
  }
  ctx.restore();
}

function mosaic(ctx, F, j, O, d, n) {
  const { k } = F;
  const L = j.jl, W = j.jw, w0 = Math.max(0.12, j.vc / 2);
  const sz = Math.max(2.5, k * 0.16);
  for (const [a, b, c, e] of MOSAIC) {
    const u = Math.pow(a, 0.85);
    if (u > j.a * 1.15) continue;
    const half = w0 + (W / 2 - w0) * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1)) ** 0.8 * Math.min(1, u * 2.2);
    const p = add(add(O, mul(d, u * L)), mul(n, (b - 0.5) * 2 * half));
    const q = F.P(p);
    const col = PAL[Math.floor(c * (j.laminar ? 2 : PAL.length))];
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.85 - 0.55 * u) * Math.min(1, j.a * 1.5) * (0.6 + 0.4 * e)})`;
    ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
  }
}

// ---------------------------------------------------------------- apical four-chamber
/**
 * g (cm; [ED, ES] pairs beat with the heart):
 *   lvL, lvW, lvWall, ivs, rvW, rvL, rvWall, laW, laL ([min, max]), raW, raL, ma (mitral annulus),
 *   ta (tricuspid annulus), mv: {thick, gap, dome, tip}, tv: {thick, gap}
 * o: t (ms), title, depth, jets: {mr, tr} (flow q mL/s, va, vc, jl, jw), labels, calipers
 * Returns the geometry (cm) for labels and measurements.
 */
export function drawA4C(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 16, o.title ?? 'APICAL FOUR-CHAMBER', { deg: 80 });
  const ph = phase(o.t ?? 150);
  const c = ph.c;
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
  const N = 18;
  const widthAt = (u) => {                             // cavity width across the axis
    if (u < 0.22) return mix(ma, lvW, smooth(u / 0.22));
    return lvW * Math.pow(Math.max(0, 1 - ((u - 0.22) / 0.78) ** 2.3), 0.5);
  };
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
  // septum: LV septal border offset toward the RV by its thickness
  const nsep = (i) => {
    const a = sep[Math.max(0, i - 1)], b = sep[Math.min(N, i + 1)];
    let nn = unit(perp(sub(b, a)));
    if ((sep[i][0] - lvC[0]) * nn[0] + (sep[i][1] - lvC[1]) * nn[1] < 0) nn = mul(nn, -1);
    return nn;
  };
  const rvSep = sep.map((p, i) => add(p, mul(nsep(i), ivs * (1 - 0.25 * (i / N) ** 3))));
  const iRvApex = Math.round(N * 0.74);
  const ivsRib = ribbon(sep.slice(0, iRvApex + 2), rvSep.slice(0, iRvApex + 2));
  // LV apical and lateral wall
  const lvFree = lvCav.slice(iRvApex - 1);
  const lvOut = offsetAway(lvFree, (u) => wall * (0.68 + 0.32 * smooth((u - 0.35) / 0.4)), lvC);
  const lvRib = ribbon(lvFree, lvOut);
  // RV: from the tricuspid septal hinge (more apical than the mitral one) up the septum, around
  // the RV apex, down the free wall to the tricuspid lateral hinge
  const iTv = 1;
  const TS = rvSep[iTv];
  const Ra = rvSep[iRvApex];
  const out = mul(nl, -1);                             // toward the RV free wall
  const TL = add(add(TS, mul(out, ta)), mul(ax, 0.15));
  const Mb = add(add(rvSep[Math.round(N * 0.2)], mul(out, rvW)), mul(ax, -0.1));
  const Mm = add(rvSep[Math.round(N * 0.48)], mul(out, rvW * 0.82));
  const rvFree = spline([Ra, add(rvSep[Math.round(N * 0.66)], mul(out, rvW * 0.5)), Mm, Mb, TL], 8);
  const rvC = centroid([...rvSep.slice(iTv, iRvApex + 1), ...rvFree]);
  const rvOut = offsetAway(rvFree, rvWall, rvC);
  const rvRib = ribbon(rvFree, rvOut);
  // left atrium below the mitral annulus
  const ldown = unit(add(mul(ax, -1), mul(nl, 0.12)));
  const Mc = lerp2(S0, L0, 0.5);
  // the septal side follows the atrial septum; the atrium grows laterally and downward
  const laPts = [
    S0,
    add(add(S0, mul(ldown, laL * 0.3)), mul(nl, -0.14)),
    add(add(S0, mul(ldown, laL * 0.8)), mul(nl, -0.1)),
    add(add(S0, mul(ldown, laL)), mul(nl, laW * 0.45)),
    add(add(S0, mul(ldown, laL * 0.74)), mul(nl, laW * 0.97)),
    add(add(L0, mul(ldown, laL * 0.3)), mul(nl, Math.max(0.1, laW - ma) * 0.75)),
    L0,
  ];
  const laCav = spline(laPts, 8);
  const laC = centroid(laCav);
  const laOut = offsetAway(laCav, 0.22, laC);
  const laRib = ribbon(laCav, laOut);
  // right atrium below the tricuspid annulus
  const rdown = unit(add(mul(ax, -1), mul(out, 0.18)));
  const Tc = lerp2(TS, TL, 0.5);
  const iasTop = add(S0, mul(nl, -0.38));
  const raPts = [
    TL,
    add(add(TL, mul(rdown, raL * 0.35)), mul(out, Math.max(0.1, raW - ta) * 0.7)),
    add(add(iasTop, mul(rdown, raL * 0.72)), mul(out, raW * 0.95)),
    add(add(iasTop, mul(rdown, raL)), mul(out, raW * 0.45)),
    add(add(iasTop, mul(rdown, raL * 0.75)), mul(out, 0.04)),
    add(add(iasTop, mul(rdown, raL * 0.3)), mul(out, 0.02)),
    add(iasTop, mul(ax, 0.12)),
    TS,
  ];
  const raCav = spline(raPts, 8);
  const raC = centroid(raCav);
  const raOut = offsetAway(raCav, 0.2, raC);
  const raRib = ribbon(raCav, raOut);
  // crux: the tissue between the two annuli and the atrial septum
  const crux = [S0, add(S0, mul(ldown, 0.5)), add(iasTop, mul(rdown, 0.6)), add(iasTop, mul(ax, 0.12)), TS, rvSep[0]];
  // chest wall
  const chest = [[-8, 0.35], [8, 0.35], [8, 1.35], [-8, 1.35]];
  const tissue = [chest, ivsRib, lvRib, rvRib, laRib, raRib, crux];
  // valves
  const valve = (h1, h2, towardV, gapCm, thick, shut, dome, tipW) => {
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
  const mv = valve(S0, L0, ax, g.mv?.gap ?? 0, g.mv?.thick ?? 0.12, ph.mvShut, g.mv?.dome ?? 0, g.mv?.tip ?? 1.2);
  const rvAx = unit(sub(Ra, Tc));
  const tv = valve(TS, TL, rvAx, g.tv?.gap ?? 0, g.tv?.thick ?? 0.1, ph.tvShut, 0, 1.2);
  const peri = offsetAway([...lvOut.slice(0), ], 0.12, lvC);
  const bright = [
    [mv.l1, g.mv?.thick ?? 0.12], [mv.l2, g.mv?.thick ?? 0.12],
    [tv.l1, g.tv?.thick ?? 0.1], [tv.l2, g.tv?.thick ?? 0.1],
    [peri, 0.12, 0.7], [offsetAway(rvOut, 0.1, rvC), 0.1, 0.6],
  ];
  scan(ctx, F, tissue, { edges: [lvCav, rvFree, laCav, raCav], bright, gain: o.gain });
  // jets
  const J = o.jets || {};
  if (J.mr) jet(ctx, F, { ...J.mr, O: mv.gapMid, dir: ldown, clip: laCav });
  if (J.tr) jet(ctx, F, { ...J.tr, O: tv.gapMid, dir: rdown, clip: raCav });
  if (J.ms) jet(ctx, F, { ...J.ms, O: mv.tip, dir: ax, clip: lvCav });
  if (J.mr || J.tr || J.ms) colorBar(ctx, box.x + box.w - 20, box.y + 34, Math.min(90, box.h * 0.25), (J.mr || J.tr || J.ms).va / 100, { w: 7 });
  // labels
  if (o.labels !== false) {
    tag(ctx, F, 'LV', add(lvC, mul(ax, 0.8)));
    tag(ctx, F, 'RV', add(centroid(rvFree), mul(out, -0.2)));
    tag(ctx, F, 'LA', laC);
    tag(ctx, F, 'RA', raC);
  }
  const geo = { F, S0, L0, TS, TL, A, B, Ra, ax, nl, out, lvCav, laCav, raCav, rvFree, rvSep, mv, tv, lvW, lvL, rvW, laW, laL, raW, raL, ma, ta, c, ph };
  if (o.after) o.after(ctx, F, geo);
  finish(ctx, F);
  return geo;
}

// ---------------------------------------------------------------- parasternal long axis
/**
 * g (cm): rvd (RV outflow), ivs, lvid, pw ([ED, ES] pairs), root (aortic sinus), lvot, la (AP,
 *   [min, max]), av: {thick, open (orifice width at full opening, cm), calc}, mv: {thick, dome,
 *   tip (orifice width, cm)}, effusion
 * o: t, jets: {ar, as, ms}, calipers: 'lv' | 'la' | 'lvot' | null
 */
export function drawPLAX(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 15, o.title ?? 'PARASTERNAL LONG AXIS', { deg: 88 });
  const ph = phase(o.t ?? 150);
  const c = ph.c;
  const ivs = at(g.ivs, c), lvid = at(g.lvid, c), pw = at(g.pw, c), rvd = at(g.rvd ?? 2.6, c);
  const la = at(g.la, c), root = g.root ?? 3.1, lvot = g.lvot ?? 2.1;
  // the heart frame: x along the long axis (+ toward the aorta), y depth; tilted so the apex
  // (left) lies deeper
  const th = -0.14, pivot = [0, 7];
  const R = (p) => {
    const d = sub(p, pivot), cs = Math.cos(th), sn = Math.sin(th);
    return [pivot[0] + d[0] * cs - d[1] * sn - 1.0, pivot[1] + d[0] * sn + d[1] * cs];
  };
  const RP = (poly) => poly.map(R);
  const y0 = 1.75;                                  // RV free wall
  const yRv = y0 + 0.4, yIvs = yRv + rvd, yLv = yIvs + ivs, yPw = yLv + lvid, yEpi = yPw + pw;
  const xL = -9, xAnn = 0.55;
  // aortic root: its anterior wall continues the septum's LV surface; sinuses, then the
  // ascending aorta. The LVOT runs from the septum to the anterior mitral hinge.
  const aoTop = yLv - 0.05, aoBot = aoTop + lvot;
  const aoMid = (aoTop + aoBot) / 2;
  const sinus = (sgn) => spline([[xAnn, sgn < 0 ? aoTop : aoBot], [xAnn + 1.0, aoMid + sgn * root / 2], [xAnn + 2.3, aoMid + sgn * (root * 0.47)], [xAnn + 3.2, aoMid + sgn * root * 0.43], [xAnn + 7, aoMid + sgn * root * 0.42 - 0.5]], 8);
  const aoAnt = sinus(-1), aoPost = sinus(1);
  const rvWallP = [[xL, y0], [xAnn + 2.6, y0 - 0.25], [xAnn + 2.6, yRv - 0.25], [xL, yRv]];
  // the septum thins toward the membranous part and meets the anterior aortic wall
  const ivsP = [[xL, yIvs + 0.15], [-2, yIvs], [xAnn - 0.9, yIvs + 0.05], [xAnn + 0.15, aoTop - 0.3], [xAnn + 0.15, aoTop + 0.02], [-1.2, yLv], [xL, yLv + 0.2]];
  const aoAntWall = ribbon(aoAnt, aoAnt.map((p) => [p[0], p[1] - 0.28]));
  const aoPostWall = ribbon(aoPost, aoPost.map((p) => [p[0], p[1] + 0.28]));
  // LA behind the aortic root, AV groove at the posterior mitral hinge
  const laTop = aoBot + 0.28 + 0.05;
  const hingeP = [xAnn + 0.35, yPw - 0.1];          // posterior mitral hinge (AV groove)
  const laPts = [[xAnn + 0.4, laTop], [xAnn + 2.4, laTop + 0.05], [xAnn + 3.9, laTop + la * 0.4], [xAnn + 3.5, laTop + la * 0.95], [xAnn + 1.6, laTop + la + 0.05], [hingeP[0] + 0.25, Math.max(laTop + la * 0.75, hingeP[1] + 0.2)], hingeP];
  const laCav = spline(laPts, 8);
  const laRib = ribbon(laCav, offsetAway(laCav, 0.22, centroid(laCav)));
  const pwP = [[xL, yPw + 0.2], [-2, yPw], [hingeP[0], hingeP[1] + 0.1], [hingeP[0] + 0.3, hingeP[1] + pw * 0.9], [-2, yEpi], [xL, yEpi + 0.25]];
  // descending aorta behind the LA
  const dao = [];
  const daoC = [xAnn + 0.6, laTop + la + 1.35];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; dao.push([daoC[0] + 1.05 * Math.cos(a), daoC[1] + 0.95 * Math.sin(a)]); }
  const daoRib = ribbon([...dao, dao[0]], [...dao, dao[0]].map((p) => add(daoC, mul(sub(p, daoC), 1.22))));
  const chest = [[-9, 0.35], [9, 0.35], [9, 1.45], [-9, 1.45]];
  const effusion = g.effusion ?? 0;
  // the aortic valve: two cusps from the annulus
  const avT = g.av?.thick ?? 0.1;
  const openW = (g.av?.open ?? 1.9) * ph.avOpen;
  const cuspA0 = [xAnn + 0.05, aoTop + 0.05], cuspP0 = [xAnn + 0.05, aoBot - 0.05];
  const cMid = [xAnn + 1.15, aoMid];
  const cuspA = spline([cuspA0, lerp2([xAnn + 0.8, aoMid - 0.25], [xAnn + 0.9, aoTop + 0.35], ph.avOpen), [cMid[0] + 0.35 * ph.avOpen, aoMid - Math.max(0.03, openW / 2)]], 6);
  const cuspP = spline([cuspP0, lerp2([xAnn + 0.8, aoMid + 0.25], [xAnn + 0.9, aoBot - 0.35], ph.avOpen), [cMid[0] + 0.35 * ph.avOpen, aoMid + Math.max(0.03, openW / 2)]], 6);
  // the mitral valve: anterior leaflet from the posterior aortic root, posterior from the groove
  const hingeA = [xAnn + 0.1, aoBot + 0.08];
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
  const mvT = g.mv?.thick ?? 0.12;
  const peri = [[xL, yEpi + 0.2 + effusion], [-2, yEpi + effusion + 0.02], [hingeP[0] + 0.4, yEpi + effusion - 0.05], [xAnn + 2.2, laTop + la + 0.45 + effusion * 0.3]];
  const tissue = [chest, RP(rvWallP), RP(ivsP), RP(aoAntWall), RP(aoPostWall), RP(laRib), RP(pwP), RP(daoRib)];
  const bright = [
    [RP(cuspA), avT], [RP(cuspP), avT],
    [RP(aml), mvT], [RP(pml), mvT * 0.9],
    [RP(spline(peri, 8)), 0.16, 0.95],
  ];
  if (g.av?.calc) for (const [p, r] of [[cuspA0, 0.22], [cuspP0, 0.2], [[xAnn + 0.6, aoTop + 0.3], 0.16]]) bright.push([RP([p, add(p, [r, 0.05])]), r * g.av.calc, 0.95]);
  scan(ctx, F, tissue, { edges: [RP(laCav)], bright });
  // jets
  const J = o.jets || {};
  const lvCav = RP([[xL, yLv], [xAnn - 0.3, yLv - 0.05], [xAnn, aoTop + 0.2], [xAnn, aoBot], [hingeP[0], hingeP[1]], [xL, yPw]]);
  const aoCav = RP([[xAnn + 0.05, aoTop + 0.1], [xAnn + 7, aoTop - 0.6], [xAnn + 7, aoBot + 0.3], [xAnn + 0.05, aoBot - 0.1]]);
  if (J.ar) jet(ctx, F, { ...J.ar, O: R([xAnn + 0.6, aoMid]), dir: unit(sub(R([-4, aoMid + 1.0]), R([xAnn, aoMid]))), clip: lvCav });
  if (J.as) jet(ctx, F, { ...J.as, O: R([xAnn + 1.2, aoMid]), dir: unit(sub(R([xAnn + 6, aoMid - 0.3]), R([xAnn + 1.2, aoMid]))), clip: aoCav, pisa: false });
  if (J.ms) jet(ctx, F, { ...J.ms, O: R(lerp2(tipA, tipP, 0.5)), dir: unit(sub(R([-6, (yLv + yPw) / 2 + 0.6]), R(lerp2(tipA, tipP, 0.5)))), clip: lvCav });
  const anyJet = J.ar || J.as || J.ms;
  if (anyJet) colorBar(ctx, box.x + box.w - 20, box.y + 34, Math.min(90, box.h * 0.25), anyJet.va / 100, { w: 7 });
  if (o.labels !== false) {
    tag(ctx, F, 'RV', R([-3.5, (yRv + yIvs) / 2]));
    tag(ctx, F, 'LV', R([-4.5, (yLv + yPw) / 2]));
    tag(ctx, F, 'Ao', R([xAnn + 3.6, aoMid]));
    tag(ctx, F, 'LA', R([xAnn + 2.1, laTop + la * 0.55]));
  }
  const geo = { F, R, yIvs, yLv, yPw, yEpi, ivs, lvid, pw, la, laTop, aoTop, aoBot, aoMid, xAnn, c, ph, lvot };
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
  const F = frame(ctx, box, o.depth ?? 8, o.title ?? 'PSAX · AORTIC VALVE', { deg: 70 });
  const ph = phase(o.t ?? 150);
  const C = [0, 4.6], r = (g.root ?? 3.1) / 2;
  const ring = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; ring.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); }
  const wall = ribbon(ring, ring.map((p) => add(C, mul(sub(p, C), 1.16))));
  const chest = [[-6, 0.35], [6, 0.35], [6, 1.4], [-6, 1.4]];
  const la = [];
  for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI * 2; la.push([C[0] + 0.3 + 2.1 * Math.cos(a), C[1] + r + 1.9 + 1.2 * Math.sin(a)]); }
  const laRib = ribbon(la, la.map((p) => add([C[0] + 0.3, C[1] + r + 1.9], mul(sub(p, [C[0] + 0.3, C[1] + r + 1.9]), 1.12))));
  // orifice: equilateral curved triangle of area AVA, open in ejection only
  const area = Math.max(0.02, (g.ava ?? 3) * ph.avOpen);
  const ro = Math.min(r * 0.93, Math.sqrt((4 * area) / (3 * Math.sqrt(3))));
  const com = [0, 1, 2].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + Math.PI / 3; return add(C, [r * Math.cos(a), r * Math.sin(a)]); });
  const bright = [];
  for (let i = 0; i < 3; i++) {
    const p = com[i], q = com[(i + 1) % 3];
    const aMid = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + Math.PI;
    const mid = add(C, [ro * 0.5 * Math.cos(aMid), ro * 0.5 * Math.sin(aMid)]);
    bright.push([spline([p, lerp2(mid, add(C, mul(sub(mid, C), 0.2)), 0), q], 8), g.thick ?? 0.12]);
  }
  if (g.calc) for (const p of com) bright.push([[add(p, [-0.12, 0]), add(p, [0.12, 0.05])], 0.35 * g.calc, 0.95]);
  scan(ctx, F, [chest, wall, laRib], { bright });
  // planimetry of the orifice during ejection
  if (ph.avOpen > 0.6 && o.trace !== false) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
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
  const F = frame(ctx, box, o.depth ?? 12, o.title ?? 'PSAX · MITRAL VALVE', { deg: 72 });
  const ph = phase(o.t ?? 600);
  const C = [0, 6.6];
  const ri = (at(g.lvid, ph.c) ?? 4.6) / 2, wall = at(g.wall ?? 0.9, ph.c);
  const circ = (rr, n = 48, cc = C, sx = 1) => { const p = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; p.push([cc[0] + rr * sx * Math.cos(a), cc[1] + rr * Math.sin(a)]); } return p; };
  const lvRib = ribbon(circ(ri), circ(ri + wall));
  const rv = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI; rv.push([C[0] - 0.4 + (ri + wall + 1.5) * Math.cos(a) * 1.05, C[1] - 0.2 + (ri + wall + 1.3) * Math.sin(a) * 0.8]); }
  const rvRib = ribbon(rv, rv.map((p) => add(p, [0, -0.35])));
  const chest = [[-7, 0.35], [7, 0.35], [7, 1.45], [-7, 1.45]];
  // leaflets fill the annulus; the orifice is an ellipse (2:1) of the valve area
  const open = 1 - ph.mvShut;
  const area = Math.max(0.03, (g.mva ?? 4) * open);
  const bAx = Math.sqrt(area / (2 * Math.PI)), aAx = 2 * bAx;
  const annR = Math.min(ri * 0.92, 1.8);
  const orifice = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; orifice.push([C[0] + aAx * Math.cos(a), C[1] + 0.2 + bAx * Math.sin(a)]); }
  const leaflet = ribbon(circ(annR, 48, [C[0], C[1] + 0.2]), orifice.slice().reverse());
  const tissue = [chest, lvRib, rvRib];
  if ((g.thick ?? 0.12) > 0.2 || open < 0.98) tissue.push(leaflet);
  const bright = [[orifice, g.thick ?? 0.15, 0.95]];
  scan(ctx, F, tissue, { bright, edges: [orifice] });
  if (open > 0.7 && o.trace !== false) {
    ctx.save();
    ctx.strokeStyle = SC.cal;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    orifice.forEach((p, i) => { const q = F.P(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
    ctx.restore();
  }
  finish(ctx, F);
  return { F, C };
}

/** Parasternal short axis at the papillary muscles: septal flattening (eccentricity index). */
export function drawPSAXpm(ctx, box, g, o = {}) {
  const F = frame(ctx, box, o.depth ?? 13, o.title ?? 'PSAX · PAPILLARY MUSCLES', { deg: 76 });
  const ph = phase(o.t ?? 150);
  const C = [0.8, 6.8];
  const lvid = at(g.lvid, ph.c), wall = at(g.wall ?? 0.9, ph.c);
  const ei = at(g.ei ?? 1, ph.c);                      // D1 / D2: >1 when the septum flattens
  const rx = lvid / 2, ry = lvid / 2 / ei;
  const lv = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const sx = Math.cos(a), sy = Math.sin(a);
    // flatten the septal side (left on screen) toward a straight line
    // septal side pulled in so that the drawn D2 / D1 equals ei
    const f = 2 / ei - 1;
    const flat = sx < 0 ? 1 - (1 - f) * sx * sx : 1;
    lv.push([C[0] + rx * sx * flat, C[1] + ry * ei * sy]);
  }
  const lvOut = offsetAway(lv, wall, C);
  const rvW = at(g.rvw ?? 2.2, ph.c);
  // RV free wall: a crescent from the anterior to the inferior septal junction, bulging left
  const top = [C[0] - rx * 0.35, C[1] - lvid / 2 - wall * 0.6], bot = [C[0] - rx * 0.35, C[1] + lvid / 2 + wall * 0.6];
  const far = [C[0] - rx * (0.2 + 2 / ei - 1) - wall - rvW, C[1]];
  const rv = spline([top, [far[0] + rvW * 0.35, C[1] - lvid * 0.62], far, [far[0] + rvW * 0.35, C[1] + lvid * 0.62], bot], 8);
  const rvRib = ribbon(rv, offsetAway(rv, 0.35, [C[0] - rx, C[1]]));
  const chest = [[-7, 0.35], [7, 0.35], [7, 1.45], [-7, 1.45]];
  const pm = [[C[0] + rx * 0.35, C[1] + ry * 0.55], [C[0] - rx * 0.1, C[1] + ry * 0.75]].map((p) => { const q = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; q.push([p[0] + 0.45 * Math.cos(a), p[1] + 0.35 * Math.sin(a)]); } return q; });
  scan(ctx, F, [chest, ribbon(lv, lvOut), rvRib, ...pm], { edges: [lv] });
  if (o.labels !== false) { tag(ctx, F, 'LV', C); tag(ctx, F, 'RV', [C[0] - rx - wall - rvW * 0.55, C[1] - 0.3]); }
  finish(ctx, F);
  return { F, C, rx, ry: ry * ei };
}

/** Subcostal IVC M-mode over one breath: diameter and collapse with a sniff. */
export function drawIVC(ctx, box, g, o = {}) {
  panel(ctx, box.x, box.y, box.w, box.h, o.title ?? 'M-MODE · IVC, SUBCOSTAL');
  const B = { x: box.x + 6, y: box.y + 24, w: box.w - 40, h: box.h - 30 };
  const tex = textures(ctx);
  const pxcm = B.h / 6;
  const mid = B.y + B.h * 0.5;
  const dmax = g.d, coll = g.collapse;                // cm, fraction on the sniff
  ctx.save();
  ctx.beginPath();
  ctx.rect(B.x, B.y, B.w, B.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(110,110,110,0.55)';
  ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = tex.speckle;
  ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.globalAlpha = 1;
  // lumen: diameter over time, a sniff in the middle
  const dAt = (u) => {
    const sniff = Math.exp(-(((u - 0.55) / 0.07) ** 2));
    const card = 0.04 * Math.sin(u * Math.PI * 2 * 7);
    return dmax * (1 - coll * sniff) * (1 + card);
  };
  ctx.fillStyle = SC.bg;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const u = i / 120; ctx.lineTo(B.x + u * B.w, mid - (dAt(u) / 2) * pxcm); }
  for (let i = 120; i >= 0; i--) { const u = i / 120; ctx.lineTo(B.x + u * B.w, mid + (dAt(u) / 2) * pxcm); }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tex.blood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,248,250,0.85)';
  ctx.lineWidth = 1.6;
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const u = i / 120; ctx.lineTo(B.x + u * B.w, mid + sg * (dAt(u) / 2) * pxcm); }
    ctx.stroke();
  }
  ctx.restore();
  // calipers: largest diameter and the sniff
  const x1 = B.x + B.w * 0.2, x2 = B.x + B.w * 0.55;
  caliper(ctx, x1, mid - (dAt(0.2) / 2) * pxcm, x1, mid + (dAt(0.2) / 2) * pxcm, { size: 3.5 });
  caliper(ctx, x2, mid - (dAt(0.55) / 2) * pxcm, x2, mid + (dAt(0.55) / 2) * pxcm, { size: 3.5 });
  tagBox(ctx, x1 + 6, mid, [`${dmax.toFixed(1)} cm`], { size: 10.5, bounds: B });
  tagBox(ctx, x2 + 6, mid, [`sniff ${(dmax * (1 - coll)).toFixed(1)} cm`], { size: 10.5, bounds: B });
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
