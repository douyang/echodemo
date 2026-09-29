// B-mode image formation, shared by the mesh views (echo.js) and the parametric views
// (echo2d.js). The caller lists structures in cm from the probe (x to the right, y into the
// body). Each frame they go into a polar raster (beam angle by depth); then:
//   echogenicity per structure, a specular border where the beam meets a surface head-on,
//   an acoustic shadow behind calcium, the chest wall and its reverberation clutter;
//   random scatterers that move with each structure, blurred by the beam (fine along it,
//   coarser across it) into speckle; time-gain and edge fall-off; log compression; and scan
//   conversion to the sector at the screen's own pixel density.
import { rng } from './sketch.js';

const DEG = 180 / Math.PI;
const SU = 4, SV = 40;              // scatterer grid: columns per degree, rows per cm
const SW = 512, SH = 1024;          // 128 degrees by 25.6 cm; both powers of two (wrap by mask)
const U0 = 64;                      // degrees added to the beam angle so columns stay positive

// Echogenicity in dB against myocardium, harmonic imaging. The screen maps DLO..DHI to black..white.
// Leaflets and chordae are dense collagen: brighter than muscle, and thin, so the beam blur
// takes back part of that before they reach the screen.
export const DB = {
  blood: -60, myo: 0, fat: 3, fibrous: 6, valve: 15, calcium: 22, pericardium: 16,
  chord: 4, liver: -4, faint: -20,
};
const DLO = -31, DHI = 25, GAMMA = 1.5;
const amp = (db) => 10 ** (db / 20);

/**
 * Beam width. Harmonic imaging with a 2.5 cm aperture: the 1.7 MHz transmit beam squared (the
 * harmonic grows with the square of the pressure) times the 3.4 MHz receive beam gives about
 * 1.3 mm across the beam at 10 cm, growing with depth; 0.8 mm near the probe. Along the beam,
 * a pulse of two cycles at 3.4 MHz: 0.6 mm.
 */
const LAT = 0.013;                  // rad: lateral FWHM / depth in the far field
const fwhmLat = (r) => Math.max(0.08, LAT * r);
const FWHM_AX = 0.06;               // cm

function gaussK(sigma, cap = 60) {
  const r = Math.min(cap, Math.max(1, Math.ceil(sigma * 2.5)));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

// ---------------------------------------------------------------- scatterers
// White complex Gaussian noise on a beam grid (angle by depth): the random scatterers in the
// tissue. Each structure carries its scatterers as it moves; the beam blur comes after, each
// frame, so the grains keep their size while the wall shortens and thickens. LF: a slow
// variation of about 1.5 dB, a few mm across, as a factor on the amplitude.
let NZ = null;
function scatterers() {
  if (NZ) return NZ;
  const N = SW * SH, R = rng(20251);
  const I = new Float32Array(N), Q = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const m = Math.sqrt(-2 * Math.log(R() + 1e-12)), a = 6.283185307 * R();
    I[i] = m * Math.cos(a);
    Q[i] = m * Math.sin(a);
  }
  const lf = lowField(R);
  // one table, three numbers per grid point (I, Q and the slow factor): one memory read each
  const IQL = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { IQL[3 * i] = I[i]; IQL[3 * i + 1] = Q[i]; IQL[3 * i + 2] = 10 ** (lf[i] / 20); }
  NZ = { I, Q, IQL };
  return NZ;
}

/** Smooth random field over the scatterer grid (dB, standard deviation 1.5). */
function lowField(R) {
  const w = SW / 16, h = SH / 16, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = R() - 0.5;
  const box = (a, dx, dy) => {
    const o = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) s += a[((y + k * dy + h) % h) * w + ((x + k * dx + w) % w)];
      o[y * w + x] = s / 3;
    }
    return o;
  };
  let c = g;
  for (let p = 0; p < 2; p++) { c = box(c, 1, 0); c = box(c, 0, 1); }
  let m = 0, v = 0;
  for (const x of c) { m += x; v += x * x; }
  m /= c.length;
  v = Math.sqrt(v / c.length - m * m) || 1;
  const out = new Float32Array(SW * SH);
  for (let y = 0; y < SH; y++) {
    const fy = y / 16, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % h;
    for (let x = 0; x < SW; x++) {
      const fx = x / 16, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % w;
      const a = c[y0 * w + x0] + (c[y0 * w + x1] - c[y0 * w + x0]) * tx;
      const b = c[y1 * w + x0] + (c[y1 * w + x1] - c[y1 * w + x0]) * tx;
      out[y * SW + x] = (1.5 * (a + (b - a) * ty - m)) / v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- screen grey map
const MAP = new Uint32Array(1024);
{
  const le = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 0; i < 1024; i++) {
    const v = Math.pow(i / 1023, GAMMA);
    const r = Math.round(7 + v * 241), g = Math.round(8 + v * 240), b = Math.round(9 + v * 236);
    MAP[i] = le ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255;
  }
}
const KSCALE = 1023 / (DHI - DLO);

// ---------------------------------------------------------------- near field
/** Chest wall under the probe (dB), by depth z below the skin (cm); near: its thickness. */
function chestDb(x, z, near) {
  const zz = z + 0.05 * Math.sin(x * 1.7 + 0.6) + 0.035 * Math.sin(x * 3.3 + 2.1);
  const f = zz / near;
  if (zz < 0.07) return 3;                                   // skin
  if (f < 0.3) return -14;                                   // subcutaneous fat
  if (f < 0.76) return -5 + 3 * Math.sin(zz * 41 + x * 0.8); // muscle, striated
  if (f < 0.84) return 8;                                    // fascia
  if (f < 1) return -7;                                      // fat over the pleura
  return null;
}

// ---------------------------------------------------------------- geometry cache
const GEO = new Map();
/**
 * v: { box: {x, y, w, h} (CSS px), cx, top (sector apex, px), k (px per cm), half (rad),
 *      depth (cm), near (cm of chest wall), liver (cm: liver down to this depth, subcostal) }
 * q: image pixels per CSS px (the device pixel ratio).
 */
function geometry(v, q) {
  const { box, cx, top, k, half, depth } = v;
  const near = v.near ?? 1.2, liver = v.liver ?? 0;
  const W = Math.max(2, Math.round(box.w * q)), H = Math.max(2, Math.round(box.h * q));
  const key = [W, H, (cx - box.x).toFixed(1), (top - box.y).toFixed(1), k.toFixed(3), half.toFixed(4), depth, near, liver, q].join('|');
  let G = GEO.get(key);
  if (G) return G;
  const n = W * H;
  const TH = new Float32Array(n), RR = new Float32Array(n).fill(-1);
  let t0 = Infinity, t1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  const tanH = Math.tan(Math.min(half, 1.55));
  for (let j = 0; j < H; j++) {
    const y = (box.y + (j + 0.5) / q - top) / k;
    if (y <= 0 || y > depth) continue;
    // only the pixels of this row that can lie inside the sector
    const xm = Math.min(y * tanH, Math.sqrt(depth * depth - y * y));
    const i0 = Math.max(0, Math.floor((cx - box.x - xm * k) * q - 1)), i1 = Math.min(W - 1, Math.ceil((cx - box.x + xm * k) * q + 1));
    for (let i = i0; i <= i1; i++) {
      const x = (box.x + (i + 0.5) / q - cx) / k;
      const r = Math.sqrt(x * x + y * y), t = Math.atan2(x, y);
      if (r > depth || t < -half || t > half) continue;
      const p = j * W + i;
      TH[p] = t;
      RR[p] = r;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
    }
  }
  const empty = !(t1 > t0 && r1 > r0);
  if (empty) { t0 = -half; t1 = half; r0 = 0; r1 = depth; }
  r0 = Math.max(0, r0 - 0.2);
  r1 = Math.min(depth, r1 + 0.2);
  t0 = Math.max(-half, t0 - 0.01);
  t1 = Math.min(half, t1 + 0.01);
  // raster: 2.2 samples across the beam width, 2.1 along the pulse, but no more than 1.25
  // per image pixel (a small panel cannot show more) and never fewer than one per 6 image
  // pixels across the beam or 3 along it
  const arcPx = (t1 - t0) * r1 * k * q, depPx = (r1 - r0) * k * q;
  const NB = Math.max(24, Math.min(760, Math.round(Math.max(Math.min((t1 - t0) / (LAT / 2.2), 1.25 * arcPx), arcPx / 6))));
  const NS = Math.max(24, Math.min(1200, Math.round(Math.max(Math.min((r1 - r0) / (FWHM_AX / 2.1), 1.25 * depPx), depPx / 3))));
  const dt = (t1 - t0) / (NB - 1), dr = (r1 - r0) / (NS - 1);
  // per image pixel inside the sector: raster cell, weights and gain
  let m = 0;
  for (let p = 0; p < n; p++) if (RR[p] >= 0) m++;
  const PIX = new Int32Array(m), FI = new Int32Array(m), FB = new Float32Array(m), FS = new Float32Array(m), GN = new Float32Array(m);
  m = 0;
  for (let p = 0; p < n; p++) {
    const r = RR[p];
    if (r < 0) continue;
    const t = TH[p];
    const fb = Math.min(NB - 1.001, Math.max(0, (t - t0) / dt)), fs = Math.min(NS - 1.001, Math.max(0, (r - r0) / dr));
    const b = fb | 0, s = fs | 0;
    PIX[m] = p;
    FI[m] = s * NB + b;
    FB[m] = fb - b;
    FS[m] = fs - s;
    // time-gain leaves a little loss with depth; the edge elements see less
    const e = t / half, e2 = e * e;
    GN[m] = 1 - 0.22 * r - 5 * e2 * e2 * e2;
    m++;
  }
  // scatterer grid position of each raster column and row; the electronic noise per row; the
  // chest wall and its clutter per sample, only where they are above the noise
  const N = NB * NS;
  const UC = new Float32Array(NB), VRW = new Float32Array(NS), FLR = new Float32Array(NS);
  for (let b = 0; b < NB; b++) UC[b] = ((t0 + b * dt) * DEG + U0) * SU;
  for (let s = 0; s < NS; s++) { const r = r0 + s * dr; VRW[s] = r * SV; FLR[s] = amp(-41 + 0.95 * r); }
  const WALL = new Float32Array(N);
  const zEnd = (liver || near) + 4.5;
  for (let s = 0; s < NS; s++) {
    const r = r0 + s * dr;
    if (r * Math.cos(Math.max(Math.abs(t0), Math.abs(t1))) > zEnd) break;
    for (let b = 0; b < NB; b++) {
      const t = t0 + b * dt;
      const x = r * Math.sin(t), z = r * Math.cos(t);
      if (z > zEnd) continue;
      let db = chestDb(x, z, near);
      if (db === null) {
        if (liver && z < liver - 0.18) db = DB.liver + 1.5 * Math.sin(x * 0.9 + z * 0.7);
        else if (liver && z < liver) db = 6;                    // diaphragm
        else db = -14 - 9 * (z - (liver || near));             // reverberation clutter
      }
      WALL[s * NB + b] = amp(db);
    }
  }
  // beam blur: across the beam, two box passes per row (half-width from the beam width at
  // that depth); along the beam, a Gaussian. NORM restores the mean power per row.
  const HB = new Int16Array(NS), NORM = new Float32Array(NS);
  // seven taps hold the pulse at 2.1 samples across (sigma about 1); wider, it is cut there
  const KA = gaussK(Math.max(0.5, FWHM_AX / 2.355 / dr), 3), K7 = new Float32Array(4);
  const ra = (KA.length - 1) >> 1;
  for (let j = 0; j <= ra; j++) K7[3 - j] = KA[ra + j];
  let s2a = 0;
  for (const w of KA) s2a += w * w;
  for (let s = 0; s < NS; s++) {
    const r = Math.max(0.3, r0 + s * dr);
    const sig = Math.min(14, fwhmLat(r) / 2.355 / r / dt);
    const h = Math.max(0, Math.round(Math.sqrt(1.5 * sig * sig + 0.25) - 0.5));
    HB[s] = h;
    const w = 2 * h + 1;
    const s2l = (w * w + ((w - 1) * w * (2 * w - 1)) / 3) / w ** 4;
    NORM[s] = 1 / (2 * s2l * s2a);
  }
  // the scatterer grid is read with interpolation where the raster is finer than it (a
  // magnified view)
  const fine = dt * DEG * SU < 0.8 || dr * SV < 0.8;
  // speckle reduction window: half a beam width to each side, across and along the beam; a
  // whole one in a magnified view, where each grain covers many pixels
  const sr = fine ? 1 : 0.5;
  const HR = new Int16Array(NS);
  for (let s = 0; s < NS; s++) { const r = Math.max(0.3, r0 + s * dr); HR[s] = Math.max(1, Math.min(30, Math.round((sr * fwhmLat(r)) / r / dt))); }
  const HA = Math.max(1, Math.min(20, Math.round((sr * FWHM_AX) / dr)));
  const SRM = fine ? 0.4 : 0.2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const img = cv.getContext('2d').createImageData(W, H);
  G = {
    W, H, n, q, NB, NS, N, t0, t1, r0, r1, dt, dr, PIX, FI, FB, FS, GN, UC, VRW, FLR, WALL, HB, NORM, K7, HR, HA, SRM, fine, cv, img,
    out: new Uint32Array(img.data.buffer), empty,
  };
  GEO.set(key, G);
  if (GEO.size > 10) GEO.delete(GEO.keys().next().value);
  return G;
}

// Working buffers, shared by every geometry (one frame is made at a time), grown as needed.
let WB = null;
function work(G) {
  const { N, NB, NS } = G;
  if (!WB || WB.N < N || WB.NB < NB || WB.NS < NS) {
    const n = Math.max(N, WB ? WB.N : 0), nb = Math.max(NB, WB ? WB.NB : 0), ns = Math.max(NS, WB ? WB.NS : 0);
    WB = {
      N: n, NB: nb, NS: ns, A: new Float32Array(n), I: new Float32Array(n), Q: new Float32Array(n), T: new Float32Array(n), E: new Float32Array(n),
      ID: new Uint8Array(n), SF: new Float32Array(n), CV: new Float32Array(n), AV: new Float32Array(n), TOUCH: new Int32Array(n),
      COV: new Float32Array(nb), HEAD: new Int32Array(ns * 4),
    };
    WB.EB = new Int32Array(WB.E.buffer);
  }
  Object.assign(G, WB, { N, NB, NS });
  return G;
}

// ---------------------------------------------------------------- rasterizer
// Structures go into the raster through a small software rasterizer: polygons by scanlines
// (four per raster row, exact coverage along each), lines and surfaces as capsules around
// each segment. Coverage blends the structure's amplitude into the sample, so a structure
// thinner than a sample stays in the image with part of its strength.
// Points in raster coordinates go into one flat buffer, reused frame to frame.
let RB = new Float32Array(1 << 16);
let RBn = 0;
function rbPush(x, y) {
  if (RBn + 2 > RB.length) { const b = new Float32Array(RB.length * 2); b.set(RB); RB = b; }
  RB[RBn++] = x;
  RB[RBn++] = y;
}

/** One point (cm) into RB in raster coordinates. */
function rbMap(G, x, y) {
  if (y < 1e-3) y = 1e-3;
  rbPush((Math.atan2(x, y) - G.t0) / G.dt, (Math.sqrt(x * x + y * y) - G.r0) / G.dr);
}

/**
 * Points (cm) into RB in raster coordinates, adding points where a step would be longer than
 * 2 samples. Returns the index of the first point; RBn marks the end.
 */
function toRaster(G, pts, closed) {
  const { t0, dt, r0, dr } = G;
  const idt = 1 / dt, idr = 1 / dr;
  const start = RBn;
  const n = pts.length;
  if (!n) return start;
  let px = pts[0][0], py = pts[0][1] > 1e-3 ? pts[0][1] : 1e-3;
  let qx = (Math.atan2(px, py) - t0) * idt, qy = (Math.sqrt(px * px + py * py) - r0) * idr;
  rbPush(qx, qy);
  const last = closed ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const p = pts[i % n];
    const x = p[0], y = p[1] > 1e-3 ? p[1] : 1e-3;
    const ux = (Math.atan2(x, y) - t0) * idt, uy = (Math.sqrt(x * x + y * y) - r0) * idr;
    const d = Math.max(Math.abs(ux - qx), Math.abs(uy - qy));
    if (d > 2 && d < 5000) {
      const m = Math.min(400, Math.ceil(d / 2));
      for (let s = 1; s < m; s++) {
        const f = s / m, sx = px + (x - px) * f;
        let sy = py + (y - py) * f;
        if (sy < 1e-3) sy = 1e-3;
        rbPush((Math.atan2(sx, sy) - t0) * idt, (Math.sqrt(sx * sx + sy * sy) - r0) * idr);
      }
    }
    rbPush(ux, uy);
    px = x; py = y; qx = ux; qy = uy;
  }
  return start;
}

let XX = new Float32Array(1 << 15), XW = new Int8Array(1 << 15), XN = new Int32Array(1 << 15);
const TX = new Float32Array(8192), TW = new Int8Array(8192);
const SUB = 4;

/**
 * Fill polygons at amplitude a, with id tag and shadow factor shf. rings: [start, end) pairs
 * of point indices into RB (raster coordinates), each ring closed.
 */
function fillPolys(G, rings, evenodd, a, tag, shf) {
  const { NB, NS, A, ID, SF, COV, HEAD } = G;
  const nsub = NS * SUB;
  HEAD.fill(-1);
  let nx = 0, kmin = nsub, kmax = -1;
  for (let r = 0; r < rings.length; r += 2) {
    const s0 = rings[r], s1 = rings[r + 1], n = (s1 - s0) >> 1;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const pi = s0 + 2 * i, qi = s0 + 2 * ((i + 1) % n);
      const ya = RB[pi + 1], yb = RB[qi + 1];
      if (ya === yb) continue;
      const w = yb > ya ? 1 : -1, lo = w > 0 ? ya : yb, hi = w > 0 ? yb : ya;
      let k0 = Math.ceil((lo + 0.5) * SUB - 0.5), k1 = Math.ceil((hi + 0.5) * SUB - 0.5) - 1;
      if (k0 < 0) k0 = 0;
      if (k1 > nsub - 1) k1 = nsub - 1;
      if (k0 > k1) continue;
      const xa = RB[pi], inv = (RB[qi] - xa) / (yb - ya);
      for (let k = k0; k <= k1; k++) {
        if (nx >= XX.length) {
          const L = XX.length * 2, a2 = new Float32Array(L), w2 = new Int8Array(L), n2 = new Int32Array(L);
          a2.set(XX); w2.set(XW); n2.set(XN);
          XX = a2; XW = w2; XN = n2;
        }
        XX[nx] = xa + ((k + 0.5) / SUB - 0.5 - ya) * inv;
        XW[nx] = w;
        XN[nx] = HEAD[k];
        HEAD[k] = nx++;
      }
      if (k0 < kmin) kmin = k0;
      if (k1 > kmax) kmax = k1;
    }
  }
  if (kmax < 0) return;
  const f1 = 1 / SUB;
  for (let s = (kmin / SUB) | 0; s <= ((kmax / SUB) | 0); s++) {
    let bmin = NB, bmax = -1;
    for (let j = 0; j < SUB; j++) {
      let m = 0;
      for (let e = HEAD[s * SUB + j]; e >= 0 && m < 8192; e = XN[e]) { TX[m] = XX[e]; TW[m] = XW[e]; m++; }
      if (m < 2) continue;
      for (let i = 1; i < m; i++) {
        const x = TX[i], w = TW[i];
        let k = i - 1;
        while (k >= 0 && TX[k] > x) { TX[k + 1] = TX[k]; TW[k + 1] = TW[k]; k--; }
        TX[k + 1] = x;
        TW[k + 1] = w;
      }
      let wind = 0;
      for (let i = 0; i < m - 1; i++) {
        wind += TW[i];
        if (evenodd ? (wind & 1) === 0 : wind === 0) continue;
        let xa = TX[i], xb = TX[i + 1];
        if (xb <= xa || xb < -0.5 || xa > NB - 0.5) continue;
        if (xa < -0.5) xa = -0.5;
        if (xb > NB - 0.5) xb = NB - 0.5;
        const ba = Math.floor(xa + 0.5), bb = Math.min(NB - 1, Math.floor(xb + 0.5));
        if (ba === bb) COV[ba] += (xb - xa) * f1;
        else {
          COV[ba] += (ba + 0.5 - xa) * f1;
          for (let b = ba + 1; b < bb; b++) COV[b] += f1;
          COV[bb] += (xb - bb + 0.5) * f1;
        }
        if (ba < bmin) bmin = ba;
        if (bb > bmax) bmax = bb;
      }
    }
    const o = s * NB;
    for (let b = bmin; b <= bmax; b++) {
      let c = COV[b];
      if (c <= 0) continue;
      COV[b] = 0;
      if (c > 1) c = 1;
      const i = o + b;
      A[i] += c * (a - A[i]);
      if (c >= 0.5) ID[i] = tag;
      if (shf < 1) { const f = 1 - c * (1 - shf); if (f < SF[i]) SF[i] = f; }
    }
  }
}

/**
 * Capsules of half-width hw (cm) around a segment (raster coordinates). Each sample keeps the
 * largest coverage any segment of the item gives it (so joints are not counted twice), with
 * that segment's amplitude; commit() blends them in.
 */
function capsule(G, xa, ya, xb, yb, hw, a, st) {
  const { NB, NS, dt, dr, r0, CV, AV, TOUCH } = G;
  const rm = Math.max(0.3, r0 + ((ya + yb) / 2) * dr);
  const cx = rm * dt, cy = dr, px = Math.sqrt(cx * cy);
  const out = hw + 0.5 * px, out2 = out * out, core = hw - 0.5 * px, core2 = core > 0 ? core * core : -1;
  const ex = out / cx, ey = out / cy;
  const b0 = Math.max(0, Math.ceil(Math.min(xa, xb) - ex)), b1 = Math.min(NB - 1, Math.floor(Math.max(xa, xb) + ex));
  const s0 = Math.max(0, Math.ceil(Math.min(ya, yb) - ey)), s1 = Math.min(NS - 1, Math.floor(Math.max(ya, yb) + ey));
  const ux = (xb - xa) * cx, uy = (yb - ya) * cy, L2 = ux * ux + uy * uy, iL2 = L2 > 0 ? 1 / L2 : 0;
  const ipx = 1 / px;
  for (let s = s0; s <= s1; s++) {
    const qy = (s - ya) * cy, o = s * NB;
    for (let b = b0; b <= b1; b++) {
      const qx = (b - xa) * cx;
      let t = (qx * ux + qy * uy) * iL2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = qx - t * ux, dy = qy - t * uy, d2 = dx * dx + dy * dy;
      if (d2 >= out2) continue;
      const c = d2 <= core2 ? 1 : (hw - Math.sqrt(d2)) * ipx + 0.5;
      const i = o + b;
      if (CV[i] === 0) TOUCH[st.n++] = i;
      if (c > CV[i]) { CV[i] = c; AV[i] = a; }
    }
  }
}
function commit(G, st, tag, shf) {
  const { A, ID, SF, CV, AV, TOUCH } = G;
  for (let k = 0; k < st.n; k++) {
    const i = TOUCH[k], c = CV[i];
    CV[i] = 0;
    A[i] += c * (AV[i] - A[i]);
    if (c >= 0.5) ID[i] = tag;
    if (shf < 1) { const f = 1 - c * (1 - shf); if (f < SF[i]) SF[i] = f; }
  }
  st.n = 0;
}

/**
 * Fit where the scatterers under this item sat in the reference frame: u' = a + b u + c v,
 * v' = d + e u + f v in grid columns and rows, least squares over the item's points, pulled
 * toward no motion when the points are few or in a line.
 */
function fitMotion(cur, ref, out, o) {
  const P = [], Rf = [];
  for (let i = 0; i < cur.length; i++) {
    const a = cur[i], b = ref[i];
    if (!a || !b || a.length !== b.length) continue;
    const step = Math.max(1, Math.floor(a.length / 60));
    for (let j = 0; j < a.length; j += step) {
      const pa = a[j], pb = b[j];
      P.push([(Math.atan2(pa[0], Math.max(pa[1], 1e-3)) * DEG + U0) * SU, Math.hypot(pa[0], pa[1]) * SV]);
      Rf.push([(Math.atan2(pb[0], Math.max(pb[1], 1e-3)) * DEG + U0) * SU, Math.hypot(pb[0], pb[1]) * SV]);
    }
  }
  const n = P.length;
  if (!n) { out.set([0, 1, 0, 0, 0, 1], o); return; }
  let mu = 0, mv = 0, ru = 0, rv = 0;
  for (let i = 0; i < n; i++) { mu += P[i][0]; mv += P[i][1]; ru += Rf[i][0]; rv += Rf[i][1]; }
  mu /= n; mv /= n; ru /= n; rv /= n;
  let suu = 0, suv = 0, svv = 0, au = 0, av = 0, bu = 0, bv = 0;
  for (let i = 0; i < n; i++) {
    const u = P[i][0] - mu, v = P[i][1] - mv, U = Rf[i][0] - ru, V = Rf[i][1] - rv;
    suu += u * u; suv += u * v; svv += v * v;
    au += u * U; av += v * U; bu += u * V; bv += v * V;
  }
  const lam = n * 30;
  const a11 = suu + lam, a12 = suv, a22 = svv + lam;
  const det = a11 * a22 - a12 * a12;
  const b1 = (a22 * (au + lam) - a12 * av) / det, c1 = (a11 * av - a12 * (au + lam)) / det;
  const e1 = (a22 * bu - a12 * (bv + lam)) / det, f1 = (a11 * (bv + lam) - a12 * bu) / det;
  out.set([ru - b1 * mu - c1 * mv, b1, c1, rv - e1 * mu - f1 * mv, e1, f1], o);
}

const MOT = new Float32Array(256 * 6);

/**
 * Draw a B-mode frame into ctx.
 * view: { box, cx, top, k, half, depth, near, liver } (see geometry()).
 * items, drawn in order (later ones cover earlier ones):
 *   { polys: [[x, y]...][], e (dB), rule, refs, shadow (dB) }         filled regions
 *   { lines: [[x, y]...][], e, w (cm), refs, shadow, closed }          bright lines: valves, pericardium
 *   { borders: [[x, y]...][], e, spec (dB added at normal incidence), w, refs, closed, all }
 *       surfaces: brighter where the beam meets them head-on; all: draw oblique parts at e too
 *   blood: true on a fill: no id, no motion
 * refs: the same shapes in the reference frame (same point counts): the scatterers move with them.
 * o: { t (ms in the beat: the noise follows it and holds when it holds), gain (dB), q (image
 *      pixels per CSS px; the screen's by default), live (the cine runs), key (the caller: a
 *      live caller may get its last frame) }
 */
export function bmode(ctx, view, items, o = {}) {
  const Z = scatterers();
  const G = geometry(view, o.q ?? Math.min(2, window.devicePixelRatio || 1));
  // a running cine asks for a new frame at the screen rate; the scanner makes about 30 a
  // second, so a frame under 30 ms old is shown again (only for the same caller)
  const now = performance.now();
  if (o.live && o.key !== undefined && G.key === o.key && now - G.at < 30) {
    ctx.drawImage(G.cv, view.box.x, view.box.y, view.box.w, view.box.h);
    return G;
  }
  G.key = o.key;
  G.at = now;
  work(G);
  rasterize(G, items);
  shadows(G);
  scatter(G, Z, o.t);
  lateral(G, G.I);
  lateral(G, G.Q);
  axial(G);
  reduce(G);
  toDb(G);
  scan(G, DLO - (o.gain ?? 0));
  G.cv.getContext('2d').putImageData(G.img, 0, 0);
  ctx.drawImage(G.cv, view.box.x, view.box.y, view.box.w, view.box.h);
  return G;
}

// The stages below are small functions so the engine optimizes each one on its own.

/** The items into the raster: amplitude, structure id and shadow per sample. */
function rasterize(G, items) {
  const { A, ID, SF, N } = G;
  A.fill(0, 0, N);
  ID.fill(0, 0, N);
  SF.fill(1, 0, N);
  const st = { n: 0 };
  let id = 0;
  for (const it of items) {
    if (id >= 250) break;
    const has = (it.polys && it.polys.length) || (it.lines && it.lines.length) || (it.borders && it.borders.length);
    if (!has) continue;
    let tag = 0;
    if (!it.blood) {
      id++;
      tag = id;
      if (it.refs) fitMotion(it.polys || it.lines || it.borders, it.refs, MOT, id * 6);
      else MOT.set([0, 1, 0, 0, 0, 1], id * 6);
    }
    const shf = it.shadow ? amp(-it.shadow) : 1;
    if (it.polys) {
      RBn = 0;
      const rings = [];
      for (const p of it.polys) if (p && p.length > 2) { const s0 = toRaster(G, p, true); rings.push(s0, RBn); }
      fillPolys(G, rings, it.rule === 'evenodd', amp(it.e), tag, shf);
    }
    if (it.lines) {
      const hw = (it.w ?? 0.1) / 2, a = amp(it.e);
      for (const p of it.lines) {
        if (!p || p.length < 2) continue;
        RBn = 0;
        toRaster(G, p, !!it.closed);
        for (let i = 0; i + 3 < RBn; i += 2) capsule(G, RB[i], RB[i + 1], RB[i + 2], RB[i + 3], hw, a, st);
      }
      commit(G, st, tag, shf);
    }
    if (it.borders) {
      // brightness from cos^4 of the angle between the beam and the surface normal
      const hw = (it.w ?? 0.07) / 2, sp = it.spec ?? 6;
      for (const p of it.borders) {
        if (!p || p.length < 2) continue;
        const n = p.length, last = it.closed ? n : n - 1;
        RBn = 0;
        for (let i = 0; i < n; i++) rbMap(G, p[i][0], p[i][1]);
        for (let i = 0; i < last; i++) {
          const j = (i + 1) % n, a0 = p[i], b0 = p[j];
          const tx = b0[0] - a0[0], ty = b0[1] - a0[1], tl = Math.hypot(tx, ty);
          if (tl < 1e-6) continue;
          const mx = (a0[0] + b0[0]) / 2, my = (a0[1] + b0[1]) / 2, ml = Math.hypot(mx, my) || 1;
          const c = Math.abs((-ty * mx + tx * my) / (tl * ml));
          const lv = c * c * c * c;
          if (lv < 0.1 && !it.all) continue;
          const a = amp(it.e + (lv < 0.1 ? 0 : sp * lv));
          const xa = RB[2 * i], ya = RB[2 * i + 1], xb = RB[2 * j], yb = RB[2 * j + 1];
          if (Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) <= 2) capsule(G, xa, ya, xb, yb, hw, a, st);
          else {
            // a long step: follow the curve the straight segment makes in the raster
            const base = RBn, m = Math.min(400, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) / 2));
            for (let k = 0; k <= m; k++) { const f = k / m; rbMap(G, a0[0] + tx * f, a0[1] + ty * f); }
            for (let k = base; k + 3 < RBn; k += 2) capsule(G, RB[k], RB[k + 1], RB[k + 2], RB[k + 3], hw, a, st);
            RBn = base;
          }
        }
      }
      commit(G, st, tag, shf);
    }
  }
}


/** Shadows cast down each beam, from below the structure that casts them. */
function shadows(G) {
  const { NB, NS, A, SF } = G;
  for (let b = 0; b < NB; b++) {
    let att = 1;
    for (let s = 0, i = b; s < NS; s++, i += NB) {
      A[i] *= att;
      if (SF[i] < att) att = SF[i];
    }
  }
}

/**
 * Scatterers: each structure's, where they sat in the reference frame; the electronic noise
 * changes from frame to frame while the cine runs and holds when it stops.
 */
function scatter(G, Z, t) {
  const { NB, NS, A, ID, I, Q, UC, VRW, FLR, WALL, fine } = G;
  const fr = t === undefined ? 0 : Math.floor(t / 22) & 1023;
  const du = (fr * 197) & (SW - 1), dv = (fr * 389) & (SH - 1);
  const Z3 = Z.IQL;
  for (let s = 0, i = 0; s < NS; s++) {
   const v0r = VRW[s], f = FLR[s], rowB = (((v0r | 0) + dv) & (SH - 1)) << 9;
   for (let b = 0; b < NB; b++, i++) {
    let u = UC[b], v = v0r;
    const tg = ID[i];
    if (tg) {
      const m = tg * 6;
      const uu = MOT[m] + MOT[m + 1] * u + MOT[m + 2] * v;
      v = MOT[m + 3] + MOT[m + 4] * u + MOT[m + 5] * v;
      u = uu;
    }
    const kb = 3 * (rowB | (((UC[b] | 0) + du) & (SW - 1)));
    let si, sq, lf;
    if (fine) {
      // between grid points the scatterers blend, so a magnified view shows no steps; the
      // weights are scaled so the blend keeps the power of one grid point everywhere
      const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
      const ro0 = (v0 & (SH - 1)) << 9, ro1 = ((v0 + 1) & (SH - 1)) << 9, c0 = u0 & (SW - 1), c1 = (u0 + 1) & (SW - 1);
      const w00 = (1 - fu) * (1 - fv), w01 = fu * (1 - fv), w10 = (1 - fu) * fv, w11 = fu * fv;
      const g = 1 / Math.sqrt(w00 * w00 + w01 * w01 + w10 * w10 + w11 * w11);
      const k00 = 3 * (ro0 | c0), k01 = 3 * (ro0 | c1), k10 = 3 * (ro1 | c0), k11 = 3 * (ro1 | c1);
      si = (Z3[k00] * w00 + Z3[k01] * w01 + Z3[k10] * w10 + Z3[k11] * w11) * g;
      sq = (Z3[k00 + 1] * w00 + Z3[k01 + 1] * w01 + Z3[k10 + 1] * w10 + Z3[k11 + 1] * w11) * g;
      lf = Z3[k00 + 2];
    } else {
      const k = 3 * ((((v | 0) & (SH - 1)) << 9) | ((u | 0) & (SW - 1)));
      si = Z3[k];
      sq = Z3[k + 1];
      lf = Z3[k + 2];
    }
    const a = A[i] * lf + WALL[i];
    I[i] = a * si + f * Z3[kb];
    Q[i] = a * sq + f * Z3[kb + 1];
   }
  }
}

/** Across the beam: two box passes per row (half-width HB from the beam width at that depth). */
function lateral(G, F) {
  const { NB, NS, HB, T } = G;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? T : F, dst = pass ? F : T;
    for (let s = 0; s < NS; s++) {
      const h = HB[s], o0 = s * NB;
      if (!h) { for (let b = 0; b < NB; b++) dst[o0 + b] = src[o0 + b]; continue; }
      let sum = 0, cnt = 0;
      for (let x = 0; x <= h && x < NB; x++) { sum += src[o0 + x]; cnt++; }
      for (let b = 0; b < NB; b++) {
        dst[o0 + b] = sum / cnt;
        const xa = b + h + 1, xr = b - h;
        if (xa < NB) { sum += src[o0 + xa]; cnt++; }
        if (xr >= 0) { sum -= src[o0 + xr]; cnt--; }
      }
    }
  }
}

/** Along the beam: a Gaussian of up to seven taps; then the envelope power. */
function axial(G) {
  const { NB, NS, I, Q, E, K7, NORM } = G;
  const k0 = K7[0], k1 = K7[1], k2 = K7[2], k3 = K7[3];
  for (let s = 0; s < NS; s++) {
    const o = s * NB, nm = NORM[s];
    const a0 = (s < 3 ? 0 : s - 3) * NB, a1 = (s < 2 ? 0 : s - 2) * NB, a2 = (s < 1 ? 0 : s - 1) * NB;
    const a4 = (s + 1 >= NS ? NS - 1 : s + 1) * NB, a5 = (s + 2 >= NS ? NS - 1 : s + 2) * NB, a6 = (s + 3 >= NS ? NS - 1 : s + 3) * NB;
    for (let b = 0; b < NB; b++) {
      const ri = k0 * (I[a0 + b] + I[a6 + b]) + k1 * (I[a1 + b] + I[a5 + b]) + k2 * (I[a2 + b] + I[a4 + b]) + k3 * I[o + b];
      const rq = k0 * (Q[a0 + b] + Q[a6 + b]) + k1 * (Q[a1 + b] + Q[a5 + b]) + k2 * (Q[a2 + b] + Q[a4 + b]) + k3 * Q[o + b];
      E[o + b] = (ri * ri + rq * rq) * nm;
    }
  }
}

/**
 * Light speckle reduction, as the scanner applies it: a fifth of each sample is the mean
 * power within half a beam width, which keeps the grain and softens the black nulls (two
 * fifths within a beam width when the view is magnified).
 */
function reduce(G) {
  const { NB, NS, E, T, HR, HA, SRM } = G;
  const keep = 1 - SRM;
  for (let s = 0; s < NS; s++) {
    const o0 = s * NB, h = HR[s];
    let sum = 0, cnt = 0;
    for (let x = 0; x <= h && x < NB; x++) { sum += E[o0 + x]; cnt++; }
    for (let b = 0; b < NB; b++) {
      T[o0 + b] = sum / cnt;
      const xa = b + h + 1, xr = b - h;
      if (xa < NB) { sum += E[o0 + xa]; cnt++; }
      if (xr >= 0) { sum -= E[o0 + xr]; cnt--; }
    }
  }
  const h = HA;
  for (let b = 0; b < NB; b++) {
    let sum = 0, cnt = 0;
    for (let y = 0; y <= h && y < NS; y++) { sum += T[y * NB + b]; cnt++; }
    for (let s = 0; s < NS; s++) {
      const i = s * NB + b;
      E[i] = keep * E[i] + SRM * (sum / cnt) + 1e-12;
      const ya = s + h + 1, yr = s - h;
      if (ya < NS) { sum += T[ya * NB + b]; cnt++; }
      if (yr >= 0) { sum -= T[yr * NB + b]; cnt--; }
    }
  }
}

/** To dB: log2 read from the float's own bits (within 0.2 dB, much faster than Math.log). */
function toDb(G) {
  const { N, E, EB } = G;
  for (let i = 0; i < N; i++) E[i] = 3.010299957 * (EB[i] * 1.1920928955078125e-7 - 126.94269504);
}

/** Scan conversion, one image pixel at a time inside the sector. */
function scan(G, lo) {
  const { NB, E, PIX, FI, FB, FS, GN, out } = G;
  for (let m = 0, L = PIX.length; m < L; m++) {
    const i = FI[m], tb = FB[m];
    const ea = E[i] + (E[i + 1] - E[i]) * tb;
    const eb = E[i + NB] + (E[i + NB + 1] - E[i + NB]) * tb;
    let kk = (ea + (eb - ea) * FS[m] + GN[m] - lo) * KSCALE;
    kk = kk < 0 ? 0 : kk > 1023 ? 1023 : kk | 0;
    out[PIX[m]] = MAP[kk];
  }
}

// ---------------------------------------------------------------- M-mode
let SPK = null;
/** A speckle strip for M-mode: the scatterers blurred along the beam only (dB about the mean). */
function mSpeckle() {
  if (SPK) return SPK;
  const Z = scatterers();
  const ka = gaussK((FWHM_AX / 2.355) * SV), ra = (ka.length - 1) >> 1;
  SPK = new Float32Array(SW * SH);
  let sum = 0;
  for (let u = 0; u < SW; u++) {
    for (let v = 0; v < SH; v++) {
      let a = 0, b = 0;
      for (let j = -ra; j <= ra; j++) { const w = ka[j + ra], x = ((v + j) & (SH - 1)) * SW + u; a += w * Z.I[x]; b += w * Z.Q[x]; }
      const p = a * a + b * b;
      SPK[v * SW + u] = p;
      sum += p;
    }
  }
  const inv = (SW * SH) / sum;
  for (let i = 0; i < SPK.length; i++) SPK[i] = Math.max(-30, 4.342944819 * Math.log(SPK[i] * inv + 1e-9));
  return SPK;
}

const MM = new Map();
/**
 * An M-mode strip: one beam over time. box (CSS px); depth [d0, d1] (cm) from top to bottom;
 * layers(u) for u in 0..1 across the strip returns [[top, bottom, dB, motion]] in cm, where
 * motion (cm) moves that layer's speckle with it. Blood between layers keeps the noise floor.
 * Drawn at the screen's pixel density; cached by key.
 */
export function mmode(ctx, box, d0, d1, layers, key) {
  const q = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(2, Math.round(box.w * q)), H = Math.max(2, Math.round(box.h * q));
  const k = `${key}|${W}x${H}|${d0}|${d1}`;
  let c = MM.get(k);
  if (!c) {
    const SP = mSpeckle();
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const img = c.getContext('2d').createImageData(W, H);
    const out = new Uint32Array(img.data.buffer);
    const col = new Float32Array(H), tmp = new Float32Array(H), mot = new Float32Array(H);
    const dz = (d1 - d0) / H;
    const kk = gaussK(Math.max(0.6, FWHM_AX / 2.355 / dz), 12), rad = (kk.length - 1) >> 1;
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1);
      const L = layers(u);
      for (let j = 0; j < H; j++) {
        const z = d0 + (j + 0.5) * dz;
        let a = 10 ** ((-40 + 0.9 * z) / 20), m = NaN;
        for (const [t0, t1, db, mv] of L) if (z >= t0 && z < t1) { a += 10 ** (db / 20); m = mv || 0; }
        col[j] = a;
        mot[j] = m;
      }
      for (let j = 0; j < H; j++) {
        let a = 0;
        for (let p = -rad; p <= rad; p++) a += kk[p + rad] * col[Math.min(H - 1, Math.max(0, j + p))];
        tmp[j] = 8.685889638 * Math.log(a + 1e-7);
      }
      for (let j = 0; j < H; j++) {
        const z = d0 + (j + 0.5) * dz;
        // tissue keeps its speckle along the strip (horizontal streaks); blood changes per line
        const still = !Number.isNaN(mot[j]);
        const v = ((z - (still ? mot[j] : 0)) * SV) | 0, row = (v & (SH - 1)) << 9;
        let sp;
        if (still) {
          // the same scatterers line after line, drifting slowly: horizontal streaks
          const uf = 300 + (i / q) * 0.08, ua = uf | 0, fu = uf - ua;
          sp = SP[row | (ua & (SW - 1))] * (1 - fu) + SP[row | ((ua + 1) & (SW - 1))] * fu;
        } else sp = SP[row | ((((i / q) | 0) * 37) & (SW - 1))];
        let p = (tmp[j] + sp - DLO) * KSCALE;
        p = p < 0 ? 0 : p > 1023 ? 1023 : p | 0;
        out[j * W + i] = MAP[p];
      }
    }
    c.getContext('2d').putImageData(img, 0, 0);
    MM.set(k, c);
    if (MM.size > 8) MM.delete(MM.keys().next().value);
  }
  ctx.drawImage(c, box.x, box.y, box.w, box.h);
}
