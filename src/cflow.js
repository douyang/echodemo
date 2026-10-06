// Color flow as the scanner makes it, for the parametric echo views (echo2d.js).
//
// A flow field (cm/s) comes from a few elements: jets, flow that converges on an orifice, and
// laminar streams (inflow, outflow, veins). The field is sampled along the color lines of a
// fixed color box. Each sample takes the scanner's pulse-pair estimate. The phase of the lag-one
// autocorrelation gives the mean velocity along the beam; past the Nyquist limit it wraps
// (aliasing). A spread of velocities inside the sample volume (turbulence) makes the phase
// random, which gives the mosaic, and raises the variance. The wall filter removes slow flow,
// bright tissue keeps its grey (write priority), and the samples are interpolated onto the
// screen (scan conversion).
import { flowColor } from './scope.js';
import { cine } from './sev.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------------------------------------------------------------- noise
function h32(i, j, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise, -0.5..0.5, one lattice cell per unit. */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h32(xi, yi, s), b = h32(xi + 1, yi, s), c = h32(xi, yi + 1, s), d = h32(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5;
}
/**
 * Two octaves of value noise, standard deviation about 1; the lattice is turned (0.6 rad) so that
 * its rows do not line up with a jet's axis.
 */
function gnoise(x, y, s) {
  const u = 0.825 * x - 0.565 * y, v = 0.565 * x + 0.825 * y;
  return 4.4 * (vnoise(u, v, s) + 0.5 * vnoise(2.1 * v + 17.3, 2.1 * u + 5.9, s + 101));
}
/** The same noise, changing smoothly from one frame to the next; tf in frames. */
function tnoise(x, y, s, tf) {
  const f = Math.floor(tf), w = tf - f, ww = w * w * (3 - 2 * w);
  return (gnoise(x, y, s + 7919 * f) * (1 - ww) + gnoise(x, y, s + 7919 * (f + 1)) * ww) / Math.sqrt((1 - ww) ** 2 + ww * ww);
}

// ---------------------------------------------------------------- paths
function path(pts, pad) {
  const P = { n: pts.length - 1, ax: [], ay: [], tx: [], ty: [], l: [], c: [], L: 0, bb: null };
  let cum = 0;
  for (let i = 0; i < P.n; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy) || 1e-6;
    P.ax.push(pts[i][0]); P.ay.push(pts[i][1]); P.tx.push(dx / l); P.ty.push(dy / l); P.l.push(l); P.c.push(cum);
    cum += l;
  }
  P.L = cum;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  P.bb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  return P;
}
// A point projected on a path: arc length s (below 0 before the start, past L after the end),
// signed distance n (positive to the left of the travel), the segment i, the fraction f along it
// and the segment's direction.
const PR = { s: 0, n: 0, i: 0, f: 0, tx: 1, ty: 0 };
function project(P, x, y) {
  let best = Infinity;
  for (let i = 0; i < P.n; i++) {
    const px = x - P.ax[i], py = y - P.ay[i], tx = P.tx[i], ty = P.ty[i];
    let a = px * tx + py * ty;
    if (i > 0 && a < 0) a = 0;
    if (i < P.n - 1 && a > P.l[i]) a = P.l[i];
    const qx = px - a * tx, qy = py - a * ty, d2 = qx * qx + qy * qy;
    if (d2 < best) {
      best = d2;
      PR.s = P.c[i] + a; PR.i = i; PR.f = a / P.l[i]; PR.tx = tx; PR.ty = ty;
      PR.n = (tx * py - ty * px >= 0 ? 1 : -1) * Math.sqrt(d2);
    }
  }
  return PR;
}

// ---------------------------------------------------------------- flow elements
/**
 * Flow that converges on an orifice O (the PISA): speed q / (2 pi r^2) toward O, up to cap, on
 * the upstream side of d (unit vector downstream) inside a cone of half-angle half (rad; pi/2
 * for a flat valve, less for a funnel) whose edge fades over soft (in cosine), out to R cm.
 * q in mL/s (cm³/s).
 */
export function convergence(O, d, q, o = {}) {
  const half = o.half ?? Math.PI / 2, R = o.R ?? 3;
  return {
    kind: 0, ox: O[0], oy: O[1], dx: d[0], dy: d[1], q, cap: o.cap ?? 500, cmin: Math.cos(half), frac: 1 - Math.cos(half), soft: o.soft ?? 0.12, R,
    bb: [O[0] - R, O[1] - R, O[0] + R, O[1] + R],
  };
}
// the rim of slow entrained blood outside a jet, as a fraction of its half-width
const RIM = 0.2;
/**
 * The outline of a jet's color, 0..1 of its largest half-width at u (0..1 of its length): it
 * widens fast past the orifice, is widest at pk, and closes round at the tip; a jet on a wall
 * (wall) stays wide up to it.
 */
function outline(u, pk, wall) {
  if (u <= 0 || u >= 1) return 0;
  if (u < pk) return Math.pow(Math.sin((Math.PI / 2) * (u / pk)), 0.55);
  const v = (u - pk) / (1 - pk);
  return wall ? 1 - 0.15 * smooth(v) : Math.pow(Math.cos((Math.PI / 2) * v), 0.6);
}
/**
 * A jet from pts[0], the vena contracta, along the path pts: orifice speed u0 (cm/s), vena
 * contracta vc, color length len and width wid (cm); its color area is 0.55 x len x wid, or its
 * largest width is wid with fit 'width'; lam 0 (turbulent) to 1 (laminar); pk where it is widest
 * (0..1 of its length); wall: it runs into a wall at its tip; pre (cm): the jet keeps its neck
 * this far before its outline starts (from the orifice between the leaflets into the chamber);
 * open (cm): how far the outline takes to leave the neck; seed for its eddies. keep: its neck
 * keeps its color over the leaflet tips, as with the usual color priority.
 */
export function jetFlow(pts, o) {
  const P = path(pts, o.wid / 2 + 0.4), pre = o.pre ?? 0, len = Math.min(o.len, P.L - pre), pk = o.pk ?? 0.55, wall = !!o.wall;
  let I = 0;
  for (let i = 0; i < 64; i++) I += outline((i + 0.5) / 64, pk, wall) / 64;
  const tx = P.tx[0], ty = P.ty[0], O = pts[0], a = -0.25, b = pre + 0.25, w = o.vc / 2;
  const keep = o.keep ? [[O[0] + tx * a - ty * w, O[1] + ty * a + tx * w], [O[0] + tx * b - ty * w, O[1] + ty * b + tx * w], [O[0] + tx * b + ty * w, O[1] + ty * b - tx * w], [O[0] + tx * a + ty * w, O[1] + ty * a - tx * w]] : null;
  return {
    kind: 1, P, keep, u0: o.u0, vc: o.vc, len, wid: (o.fit === 'width' ? o.wid : (0.55 * o.wid) / I) / (1 + RIM), lam: o.lam ?? 0, seed: o.seed ?? 1, core: o.core ?? 1.4 * o.vc + 0.25, bb: P.bb,
    pk, wall, pre, open: o.open ?? 0.3 + 0.4 * o.vc,
  };
}
/** The share (0..1) of a straight jet's color outline, rim included, that lies inside the polygon poly. */
export function jetShare(e, poly) {
  const P = e.P, tx = P.tx[0], ty = P.ty[0], ox = P.ax[0], oy = P.ay[0];
  let tot = 0, inn = 0;
  for (let i = 0; i < 32; i++) {
    const u = (i + 0.5) / 32, s = u * e.len;
    const H = Math.max((e.vc / 2) * (1 - smooth(u / 0.3)), (e.wid / 2) * smooth(s / e.open) * outline(u, e.pk, e.wall)) * (1 + RIM);
    for (let j = 0; j < 16; j++) {
      const q = ((j + 0.5) / 8 - 1) * H, x = ox + tx * (e.pre + s) - ty * q, y = oy + ty * (e.pre + s) + tx * q;
      tot += H;
      if (inPoly(poly, x, y)) inn += H;
    }
  }
  return tot > 0 ? inn / tot : 1;
}
/**
 * A laminar stream along pts: speeds sp (cm/s along the path; negative runs back along it) and
 * half-widths hw (cm) at its points. Its ends fade; tex (0..1) varies its speed in patches.
 */
export function stream(pts, sp, hw, o = {}) {
  const P = path(pts, Math.max(...hw) + 0.2);
  return { kind: 2, P, sp, hw, sig: o.sig ?? 0.06, tex: o.tex ?? 0.18, bill: o.bill ?? 0.1, seed: o.seed ?? 5, bb: P.bb };
}

const FV = { vx: 0, vy: 0, s2: 0 };
function pisaAt(e, x, y) {
  const dx = e.ox - x, dy = e.oy - y, r = Math.hypot(dx, dy);
  if (r > e.R || r < 1e-4) return;
  const c = (dx * e.dx + dy * e.dy) / r;                   // cosine from the upstream axis
  if (c < e.cmin) return;
  const w = smooth((c - e.cmin) / e.soft) * (1 - smooth((r - 0.7 * e.R) / (0.3 * e.R)));
  const v = Math.min(e.cap, e.q / (2 * Math.PI * r * r * e.frac)) * w;
  FV.vx += (v * dx) / r;
  FV.vy += (v * dy) / r;
  FV.s2 += (0.03 * v) ** 2;
}
function jetAt(e, x, y, tf) {
  const pr = project(e.P, x, y);
  const s0 = pr.s, s = s0 - e.pre;
  if (s0 < -0.05 || s > e.len) return;
  const u = Math.max(0, s) / e.len, tx = pr.tx, ty = pr.ty, side = pr.n >= 0 ? 1 : -1, an = Math.abs(pr.n);
  // the outline: the neck, then a flame that closes at the tip; the edge billows
  let h = Math.max((e.vc / 2) * (1 - smooth(u / 0.3)), (e.wid / 2) * smooth(s / e.open) * outline(u, e.pk, e.wall));
  h *= 1 + 0.16 * Math.max(-1.5, Math.min(1.5, tnoise(s / 0.55, side * 3.1, e.seed + 11, tf * 0.5))) * smooth(s / 0.5);
  if (h <= 0.01) return;
  if (an >= h) {
    // just outside the turbulent jet: blood it draws along, slow and laminar (its blue rim)
    const rim = RIM * h * smooth(s / 0.8) * (1 - smooth((u - 0.8) / 0.2));
    if (an >= h + rim) return;
    const sp = 8 + 24 * (1 - (an - h) / rim) ** 1.5;
    FV.vx += sp * tx;
    FV.vy += sp * ty;
    FV.s2 += 16;
    return;
  }
  const q = an / h, G = (1 - q * q) ** 2;
  // centreline speed: the orifice speed through the core, then falling as 1/distance
  let uc = s <= e.core ? e.u0 : (e.u0 * e.core) / s;
  uc *= 1 - 0.6 * smooth((u - 0.7) / 0.3);
  const sp = 9 + (uc - 9) * G;
  // turbulence: low in the core, then about a quarter of the centreline speed; less at the edge
  const I = e.lam > 0.5 ? 0.025 : 0.035 + 0.23 * smooth((s - 0.4 * e.core) / (1.4 * e.core));
  const sig = I * uc * (0.3 + 0.7 * Math.sqrt(G));
  // eddies: patches of faster and slower flow, about a third of the jet wide, a fifth of the
  // centreline speed where the jet is turbulent
  const ell = 0.15 + 0.12 * s;
  const e1 = tnoise(s / ell, pr.n / ell, e.seed, tf), e2 = tnoise(s / ell + 41.3, pr.n / ell - 17.9, e.seed, tf);
  const nx = -ty * side, ny = tx * side, spread = 0.18 * q, ea = 0.8 * I * uc * (0.4 + 0.6 * Math.sqrt(G));
  FV.vx += sp * (tx + spread * nx) + ea * (e1 * tx + e2 * nx);
  FV.vy += sp * (ty + spread * ny) + ea * (e1 * ty + e2 * ny);
  FV.s2 += sig * sig;
}
function streamAt(e, x, y, tf) {
  const pr = project(e.P, x, y), s = pr.s, L = e.P.L;
  if (s < 0 || s > L) return;
  const i = pr.i, f = Math.max(0, Math.min(1, pr.f)), side = pr.n >= 0 ? 1 : -1;
  const h = (e.hw[i] + (e.hw[i + 1] - e.hw[i]) * f) * (1 + e.bill * Math.max(-1.5, Math.min(1.5, tnoise(s / 0.7, side * 3.3, e.seed + 9, tf * 0.5))));
  const an = Math.abs(pr.n);
  if (an >= h) return;
  const q = an / h, w = 1 - q * q;
  const v = (e.sp[i] + (e.sp[i + 1] - e.sp[i]) * f) * w * Math.sqrt(w) * smooth(s / 0.35) * smooth((L - s) / 0.5) * (1 + e.tex * Math.max(-1.5, Math.min(1.5, tnoise(s / 0.6, pr.n / 0.6, e.seed, tf))));
  FV.vx += v * pr.tx;
  FV.vy += v * pr.ty;
  FV.s2 += (e.sig * v) ** 2;
}
/** The velocity (cm/s) and velocity spread at a point (cm) from a list of flow elements. */
export function field(flows, x, y, tf = 0) {
  FV.vx = 0; FV.vy = 0; FV.s2 = 0;
  for (const e of flows) {
    const bb = e.bb;
    if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
    if (e.kind === 0) pisaAt(e, x, y);
    else if (e.kind === 1) jetAt(e, x, y, tf);
    else streamAt(e, x, y, tf);
  }
  return FV;
}

// ---------------------------------------------------------------- the color box
/** The polar color box [t0, t1, r0, r1] (rad from straight down, cm from the probe) round points (cm). */
export function boxAround(pts, half, o = {}) {
  let t0 = Infinity, t1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const p of pts) {
    const t = Math.atan2(p[0], p[1]), r = Math.hypot(p[0], p[1]);
    t0 = Math.min(t0, t); t1 = Math.max(t1, t); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
  }
  const mt = o.mt ?? 0.035, mr = o.mr ?? 0.3;
  return [Math.max(-half + 0.01, t0 - mt), Math.min(half - 0.01, t1 + mt), Math.max(0.5, r0 - mr), r1 + mr];
}

// Blood: the chambers filled, the leaflets and other tissue cut out, on a 0.4 mm raster.
let MC = null;
const MRES = 0.04;
function bloodMask(cf, t0, t1, r0, r1) {
  const xs = [], ys = [];
  for (const t of [t0, t1]) for (const r of [r0, r1]) { xs.push(r * Math.sin(t)); ys.push(r * Math.cos(t)); }
  if (t0 < 0 && t1 > 0) { xs.push(0); ys.push(r1); }
  const x0 = Math.min(...xs) - 0.1, y0 = Math.min(...ys) - 0.1;
  const w = Math.max(1, Math.ceil((Math.max(...xs) + 0.1 - x0) / MRES)), h = Math.max(1, Math.ceil((Math.max(...ys) + 0.1 - y0) / MRES));
  if (!MC) { MC = document.createElement('canvas'); MC.getContext('2d', { willReadFrequently: true }); }
  if (MC.width < w || MC.height < h) { MC.width = Math.max(MC.width, w); MC.height = Math.max(MC.height, h); }
  const g = MC.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setTransform(1 / MRES, 0, 0, 1 / MRES, -x0 / MRES, -y0 / MRES);
  const trace = (poly) => { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  g.fillStyle = '#fff';
  for (const poly of cf.blood) { trace(poly); g.fill(); }
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = '#fff';
  g.lineWidth = 0.07;
  g.lineJoin = 'round';
  for (const poly of cf.tissue || []) { trace(poly); g.fill(); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  for (const e of cf.flows) if (e.keep) { trace(e.keep); g.fill(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { d: g.getImageData(0, 0, w, h).data, x0, y0, w, h };
}
const maskAt = (M, x, y) => {
  const i = Math.floor((x - M.x0) / MRES), j = Math.floor((y - M.y0) / MRES);
  return i < 0 || j < 0 || i >= M.w || j >= M.h ? 0 : M.d[4 * (j * M.w + i) + 3] / 255;
};
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------- the image
const DT = 0.014, DR = 0.06;       // color line spacing (rad) and sample spacing along a line (cm)
const NE = 10;                      // pulses per color line
let RE = null, IM = null, DP = null, PB = null, CV = null, CS = null, SN = null, CO = null, CAP = 0, JC = null, JI = null;
// the last color frame: while the cine runs, a new one comes every 50 ms (20 color frames a
// second, as on a scanner); the frames between show it again
let LAST = { key: '', X0: 0, Y0: 0, W: 0, H: 0, cell: 1 };
const COL = [0, 0, 0];
// The estimate noise of one color frame: white noise blurred over 3 lines and 7 samples (the
// beam width and the pulse length), standard deviation 1.
let NZ1 = null, NZ2 = null, NZW = null, NZKEY = '';
function estimateNoise(NB, NS, fr) {
  const key = `${NB}x${NS}:${fr}`;
  if (key === NZKEY) return;
  NZKEY = key;
  const N = NB * NS;
  if (!NZ1 || NZ1.length < N) { NZ1 = new Float32Array(N); NZ2 = new Float32Array(N); NZW = new Float32Array(N); }
  for (const [out, sd] of [[NZ1, 11], [NZ2, 29]]) {
    for (let i = 0; i < N; i++) out[i] = 2 * (h32(i, fr, sd) + h32(i, fr, sd + 1) + h32(i, fr, sd + 2) - 1.5);
    // across 3 lines, then along 7 samples
    for (let s = 0; s < NS; s++) {
      const r = s * NB;
      for (let b = 0; b < NB; b++) NZW[r + b] = out[r + Math.max(0, b - 1)] + out[r + b] + out[r + Math.min(NB - 1, b + 1)];
    }
    for (let s = 0; s < NS; s++) {
      for (let b = 0; b < NB; b++) {
        let a = 0;
        for (let ds = -3; ds <= 3; ds++) a += NZW[Math.min(NS - 1, Math.max(0, s + ds)) * NB + b];
        out[s * NB + b] = a * 0.2182;                     // 1 / sqrt(21)
      }
    }
  }
}

/**
 * Color flow in a color box, over the B-mode image of frame F (echo2d.js).
 * cf: box [t0, t1, r0, r1] from boxAround; lo, hi (cm/s): the displayed range, hi - lo twice the
 * Nyquist limit (a shifted baseline makes them unequal); variance: tag turbulence green; blood
 * and tissue: polygons (cm); flows: elements; stats (optional): { poly } counts the color area
 * (cm²) inside poly into stats.area. now (optional, s): the time of a frame made ahead of time
 * (ch/ai.js), for its noise and eddies; such a frame is always made new, never the last one again.
 */
export function colorFlow(ctx, F, cf) {
  const { k, sect, view } = F;
  const [t0, t1, r0, r1] = cf.box;
  if (!(t1 > t0 && r1 > r0)) return;
  const lo = cf.lo, hi = cf.hi, Vn = (hi - lo) / 2, span = hi - lo;
  const fixed = Number.isFinite(cf.now);
  const key = cine.live && !cf.stats && !fixed ? `${Math.floor(performance.now() / 50)}|${F.box.x},${F.box.y},${F.box.w},${F.box.h}|${k}|${sect.cx},${sect.top}|${cf.box.join(',')}|${lo},${hi},${cf.variance}` : '';
  if (key && key === LAST.key) {
    blit(ctx, F, LAST);
    outlineBox(ctx, F, cf.box);
    return;
  }
  // an odd count of samples: the flow is evaluated on every other one along each line, and
  // interpolated between (across the lines it keeps its full resolution)
  const NB = Math.max(2, Math.ceil((t1 - t0) / DT) + 1), NS = 2 * Math.max(1, Math.ceil((r1 - r0) / DR / 2)) + 1;
  const dT = (t1 - t0) / (NB - 1), dR = (r1 - r0) / (NS - 1), N = NB * NS;
  const NSc = (NS + 1) >> 1;
  if (N > CAP) { CAP = N; RE = new Float32Array(N); IM = new Float32Array(N); DP = new Float32Array(N); PB = new Float32Array(N); CV = new Float32Array(N); CS = new Float32Array(N); }
  const M = bloodMask(cf, t0, t1, r0, r1);
  const now = fixed ? cf.now : cine.live ? performance.now() / 1000 : 0;
  const tf = now * 12, fr = Math.floor(now * 20);    // eddies change over about 80 ms; color frames at 20 Hz
  const pwf = 0.1 * Math.PI;                          // wall filter: 10% of the Nyquist limit
  const flows = cf.flows;
  estimateNoise(NB, NS, fr);
  if (!SN || SN.length < NB) { SN = new Float32Array(NB); CO = new Float32Array(NB); }
  for (let b = 0; b < NB; b++) { SN[b] = Math.sin(t0 + b * dT); CO[b] = Math.cos(t0 + b * dT); }
  for (let s = 0; s < NS; s++) {
    const r = r0 + s * dR;
    for (let b = 0; b < NB; b++) PB[s * NB + b] = maskAt(M, r * SN[b], r * CO[b]);
  }
  // the flow along the beam and its spread, on every other sample where blood is near
  for (let sc = 0; sc < NSc; sc++) {
    const s = 2 * sc, r = r0 + s * dR;
    for (let b = 0; b < NB; b++) {
      const o = sc * NB + b;
      let near = false;
      for (let ds = -1; ds <= 1; ds++) { const ss = s + ds; if (ss >= 0 && ss < NS && PB[ss * NB + b] > 0.02) { near = true; break; } }
      if (!near) { CV[o] = 0; CS[o] = 0; continue; }
      const f = field(flows, r * SN[b], r * CO[b], tf);
      CV[o] = -(f.vx * SN[b] + f.vy * CO[b]);                       // toward the probe positive
      CS[o] = f.s2;
    }
  }
  for (let s = 0; s < NS; s++) {
    const sc = s >> 1, ws = (s & 1) * 0.5, sc1 = Math.min(NSc - 1, sc + 1);
    for (let b = 0; b < NB; b++) {
      const o = s * NB + b, pb = PB[o];
      if (pb < 0.02) { RE[o] = 0; IM[o] = 0; DP[o] = 0; continue; }
      const i0 = sc * NB + b, i1 = sc1 * NB + b;
      const vb = CV[i0] * (1 - ws) + CV[i1] * ws, s2 = CS[i0] * (1 - ws) + CS[i1] * ws;
      const phi = (Math.PI * vb) / Vn, sg = (Math.PI * Math.sqrt(s2)) / Vn;
      const rho = Math.exp(-0.5 * sg * sg);                          // correlation left by the spread
      let pw = phi % (2 * Math.PI);
      if (pw > Math.PI) pw -= 2 * Math.PI; else if (pw < -Math.PI) pw += 2 * Math.PI;
      const dp = pb * (1 - rho * Math.exp(-((pw / pwf) ** 2)));    // power the wall filter leaves
      const ns = Math.sqrt(Math.max(0, 1 - rho * rho) / NE) + 0.08;
      RE[o] = dp * (rho * Math.cos(phi) + ns * NZ1[o]);
      IM[o] = dp * (rho * Math.sin(phi) + ns * NZ2[o]);
      DP[o] = dp;
    }
  }
  // scan conversion onto screen cells about 0.6 mm across
  const cx = sect.cx, top = sect.top;
  const cxs = [], cys = [];
  for (const t of [t0, t1]) for (const r of [r0, r1]) { cxs.push(cx + r * Math.sin(t) * k); cys.push(top + r * Math.cos(t) * k); }
  if (t0 < 0 && t1 > 0) { cxs.push(cx); cys.push(top + r1 * k); }
  const ib = view.box;
  const X0 = Math.max(ib.x, Math.floor(Math.min(...cxs))), X1 = Math.min(ib.x + ib.w, Math.ceil(Math.max(...cxs)));
  const Y0 = Math.max(ib.y, Math.floor(Math.min(...cys))), Y1 = Math.min(ib.y + ib.h, Math.ceil(Math.max(...cys)));
  if (X1 > X0 && Y1 > Y0) {
    const cell = Math.max(1.25, Math.min(2.5, k * 0.065));
    const W = Math.ceil((X1 - X0) / cell), H = Math.ceil((Y1 - Y0) / cell);
    if (!JC) JC = document.createElement('canvas');
    if (JC.width < W || JC.height < H) { JC.width = Math.max(JC.width, W); JC.height = Math.max(JC.height, H); }
    const g = JC.getContext('2d');
    if (!JI || JI.width !== W || JI.height !== H) JI = g.createImageData(W, H);
    const img = JI, px = img.data;
    px.fill(0);
    const st = cf.stats?.poly ? cf.stats : null;
    let nst = 0;
    for (let j = 0; j < H; j++) {
      const y = (Y0 + (j + 0.5) * cell - top) / k;
      for (let i = 0; i < W; i++) {
        const x = (X0 + (i + 0.5) * cell - cx) / k;
        const fb = (Math.atan2(x, y) - t0) / dT, fs = (Math.sqrt(x * x + y * y) - r0) / dR;
        if (!(fb >= 0 && fs >= 0 && fb <= NB - 1 && fs <= NS - 1)) continue;
        const b = Math.min(NB - 2, fb | 0), s = Math.min(NS - 2, fs | 0), wb = fb - b, ws = fs - s;
        const a = s * NB + b, c = a + NB;
        const w00 = (1 - wb) * (1 - ws), w01 = wb * (1 - ws), w10 = (1 - wb) * ws, w11 = wb * ws;
        const pb = PB[a] * w00 + PB[a + 1] * w01 + PB[c] * w10 + PB[c + 1] * w11;
        if (pb < 0.5) continue;
        const dp = DP[a] * w00 + DP[a + 1] * w01 + DP[c] * w10 + DP[c + 1] * w11;
        if (dp < 0.45 * pb) continue;
        const re = RE[a] * w00 + RE[a + 1] * w01 + RE[c] * w10 + RE[c + 1] * w11;
        const im = IM[a] * w00 + IM[a + 1] * w01 + IM[c] * w10 + IM[c + 1] * w11;
        const v = (Math.atan2(im, re) / Math.PI) * Vn, coh = Math.sqrt(re * re + im * im) / dp;
        if (Math.abs(v) < 0.1 * Vn && coh > 0.5) continue;           // below the wall filter; turbulence passes it
        let vd = v - lo;
        vd = vd - span * Math.floor(vd / span) + lo;                 // into [lo, hi)
        flowColor(vd, lo, hi, cf.variance ? Math.max(0, Math.min(1, (0.85 - coh) / 0.6)) : 0, COL);
        const q = 4 * (j * W + i);
        px[q] = COL[0]; px[q + 1] = COL[1]; px[q + 2] = COL[2]; px[q + 3] = 255;
        if (st && inPoly(st.poly, x, y)) nst++;
      }
    }
    if (st) st.area = nst * (cell / k) ** 2;
    g.putImageData(img, 0, 0);
    LAST = { key, X0, Y0, W, H, cell };
    blit(ctx, F, LAST);
  } else LAST = { key: '', X0: 0, Y0: 0, W: 0, H: 0, cell: 1 };
  outlineBox(ctx, F, cf.box);
}
/** The color image of the last frame onto the panel, inside the sector. */
function blit(ctx, F, L) {
  if (!(L.W > 0 && L.H > 0)) return;
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.clip(F.fan);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(JC, 0, 0, L.W, L.H, L.X0, L.Y0, L.W * L.cell, L.H * L.cell);
  ctx.restore();
}
/** The color box, as the scanner outlines it. */
function outlineBox(ctx, F, [t0, t1, r0, r1]) {
  const { k, sect } = F, cx = sect.cx, top = sect.top;
  ctx.save();
  ctx.clip(F.clipBox);
  ctx.strokeStyle = 'rgba(205,212,216,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, top, r0 * k, Math.PI / 2 - t0, Math.PI / 2 - t1, true);
  ctx.arc(cx, top, r1 * k, Math.PI / 2 - t1, Math.PI / 2 - t0, false);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
