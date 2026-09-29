// B-mode image formation, shared by the mesh views (echo.js) and the parametric views
// (echo2d.js). The caller lists structures in cm from the probe (x to the right, y into the
// body). Each frame they go into a small polar raster (beam angle by depth); then:
//   echogenicity per structure, a specular border where the beam meets a surface head-on,
//   an acoustic shadow behind calcium, the chest wall and its reverberation clutter;
//   random scatterers that move with each structure, blurred by the beam (fine along it,
//   coarse across it) into speckle; time-gain and edge fall-off; log compression; and scan
//   conversion to the sector.
import { rng } from './sketch.js';

const DEG = 180 / Math.PI;
const SU = 4, SV = 40;              // scatterer grid: columns per degree, rows per cm
const SW = 512, SH = 1024;          // 128 degrees by 25.6 cm; both powers of two (wrap by mask)
const U0 = 64;                      // degrees added to the beam angle so columns stay positive
const CLO = -60, CHI = 30;          // dB range of the raster code in the red channel

// Echogenicity in dB against myocardium, harmonic imaging. The screen maps DLO..DHI to black..white.
export const DB = {
  blood: -60, myo: 0, fat: 3, fibrous: 6, valve: 9, calcium: 22, pericardium: 16,
  chord: -6, liver: -4, faint: -20,
};
const DLO = -31, DHI = 25, GAMMA = 1.5;

const code = (db) => Math.max(1, Math.min(255, Math.round(((db - CLO) / (CHI - CLO)) * 254) + 1));
const DEC = new Float32Array(256);
for (let c = 1; c < 256; c++) DEC[c] = 10 ** ((CLO + ((c - 1) / 254) * (CHI - CLO)) / 20);
// blue channel: the shadow cast behind a structure, in tenths of a dB
const SHD = new Float32Array(256);
for (let c = 0; c < 256; c++) SHD[c] = 10 ** (-(c / 10) / 20);

/** Lateral beam width (FWHM, cm) at depth r (cm): f/2 receive focus near the probe, then a
 * 2 cm aperture at 3.4 MHz (harmonic) lets it grow as 0.45 mm x r / 2 cm. */
const fwhmLat = (r) => Math.max(0.09, 0.0225 * r);
const FWHM_AX = 0.08;               // axial, cm

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
  for (let i = 0; i < N; i++) lf[i] = 10 ** (lf[i] / 20);
  NZ = { I, Q, LF: lf };
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
  for (let j = 0; j < H; j++) {
    const y = (box.y + (j + 0.5) / q - top) / k;
    if (y <= 0) continue;
    for (let i = 0; i < W; i++) {
      const x = (box.x + (i + 0.5) / q - cx) / k;
      const r = Math.hypot(x, y), t = Math.atan2(x, y);
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
  const NB = Math.max(24, Math.min(360, Math.round(((t1 - t0) * r1 * k) / 2)));
  const NS = Math.max(24, Math.min(560, Math.round(((r1 - r0) * k) / 1.1)));
  const dt = (t1 - t0) / (NB - 1), dr = (r1 - r0) / (NS - 1);
  // per pixel: raster position and gain
  const FB = new Float32Array(n), FS = new Float32Array(n).fill(-1), GN = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const r = RR[p];
    if (r < 0) continue;
    const t = TH[p];
    FB[p] = Math.min(NB - 1.001, Math.max(0, (t - t0) / dt));
    FS[p] = Math.min(NS - 1.001, Math.max(0, (r - r0) / dr));
    // time-gain leaves a little loss with depth; the edge elements see less
    GN[p] = 1 - 0.22 * r - 5 * (t / half) ** 6;
  }
  // per raster sample: scatterer position; chest wall and clutter; electronic noise
  const N = NB * NS;
  const UR = new Float32Array(N), VR = new Float32Array(N), WALL = new Float32Array(N), FLOOR = new Float32Array(N);
  for (let s = 0; s < NS; s++) {
    const r = r0 + s * dr;
    for (let b = 0; b < NB; b++) {
      const t = t0 + b * dt, i = s * NB + b;
      UR[i] = (t * DEG + U0) * SU;
      VR[i] = r * SV;
      const x = r * Math.sin(t), z = r * Math.cos(t);
      let db = chestDb(x, z, near);
      if (db === null) {
        if (liver && z < liver - 0.18) db = DB.liver + 1.5 * Math.sin(x * 0.9 + z * 0.7);
        else if (liver && z < liver) db = 6;                    // diaphragm
        else db = -14 - 9 * (z - (liver || near));             // reverberation clutter
      }
      WALL[i] = 10 ** (db / 20);
      FLOOR[i] = 10 ** ((-41 + 0.95 * r) / 20);                 // amplified with depth
    }
  }
  // beam blur: across the beam, two box passes per row (half-width from the beam width at
  // that depth); along the beam, a Gaussian. NORM restores the mean power per row.
  const HB = new Int16Array(NS), NORM = new Float32Array(NS);
  const KA = gaussK(Math.max(0.5, FWHM_AX / 2.355 / dr), 12);
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
  // speckle reduction window: one beam width to each side, across and along the beam
  const HR = new Int16Array(NS);
  for (let s = 0; s < NS; s++) { const r = Math.max(0.3, r0 + s * dr); HR[s] = Math.max(2, Math.min(40, Math.round(fwhmLat(r) / r / dt))); }
  const HA = Math.max(1, Math.min(20, Math.round(FWHM_AX / dr)));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const img = cv.getContext('2d').createImageData(W, H);
  G = {
    W, H, n, q, NB, NS, N, t0, t1, r0, r1, dt, dr, FB, FS, GN, UR, VR, WALL, FLOOR, HB, NORM, KA, HR, HA, cv, img,
    out: new Uint32Array(img.data.buffer), A: new Float32Array(N), I: new Float32Array(N), Q: new Float32Array(N),
    T: new Float32Array(N), E: new Float32Array(N), ID: new Uint8Array(N), RI: new Float32Array(NB), RQ: new Float32Array(NB), empty,
  };
  G.EB = new Int32Array(G.E.buffer);
  GEO.set(key, G);
  if (GEO.size > 6) GEO.delete(GEO.keys().next().value);
  return G;
}

let RC = null;
function rasterCtx(w, h) {
  if (!RC) {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 600;
    RC = c.getContext('2d', { willReadFrequently: true });
  }
  RC.setTransform(1, 0, 0, 1, 0, 0);
  RC.globalCompositeOperation = 'source-over';
  RC.globalAlpha = 1;
  RC.fillStyle = '#000';
  RC.fillRect(0, 0, w + 2, h + 2);
  return RC;
}

// ---------------------------------------------------------------- items to raster
function mapper(G) {
  const { t0, dt, r0, dr } = G;
  return (x, y) => {
    const yy = y > 1e-3 ? y : 1e-3;
    return [(Math.atan2(x, yy) - t0) / dt + 0.5, (Math.hypot(x, yy) - r0) / dr + 0.5];
  };
}

/** Add a polyline (cm) to a path in raster coordinates, subdividing long steps. */
function trace(path, M, pts, closed) {
  const n = pts.length;
  if (n < 2) return;
  let pp = pts[0], pq = M(pp[0], pp[1]);
  path.moveTo(pq[0], pq[1]);
  const last = closed ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const p = pts[i % n];
    const q = M(p[0], p[1]);
    const d = Math.max(Math.abs(q[0] - pq[0]), Math.abs(q[1] - pq[1]));
    if (d > 3 && d < 5000) {
      const m = Math.min(400, Math.ceil(d / 3));
      for (let s = 1; s < m; s++) {
        const f = s / m, a = M(pp[0] + (p[0] - pp[0]) * f, pp[1] + (p[1] - pp[1]) * f);
        path.lineTo(a[0], a[1]);
      }
    }
    path.lineTo(q[0], q[1]);
    pp = p;
    pq = q;
  }
  if (closed) path.closePath();
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
 * o: { t (ms in the beat: the noise follows it and holds when it holds), gain (dB), q (samples
 *      per CSS px), live (the cine runs), key (the caller: a live caller may get its last frame) }
 */
export function bmode(ctx, view, items, o = {}) {
  const Z = scatterers();
  const G = geometry(view, o.q ?? 1);
  // a running cine asks for a new frame at the screen rate; the scanner makes about 30 a
  // second, so a frame under 30 ms old is shown again (only for the same caller)
  const now = performance.now();
  if (o.live && o.key !== undefined && G.key === o.key && now - G.at < 30) {
    ctx.drawImage(G.cv, view.box.x, view.box.y, view.box.w, view.box.h);
    return G;
  }
  G.key = o.key;
  G.at = now;
  const { NB, NS, N } = G;
  const R = rasterCtx(NB, NS);
  const M = mapper(G);
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
    const shade = (db) => `rgb(${code(db)},${tag},${it.shadow ? Math.min(255, Math.round(it.shadow * 10)) : 0})`;
    if (it.polys) {
      const path = new Path2D();
      for (const p of it.polys) if (p && p.length > 2) trace(path, M, p, true);
      R.fillStyle = shade(it.e);
      R.fill(path, it.rule || 'nonzero');
    }
    if (it.lines) {
      const path = new Path2D();
      for (const p of it.lines) if (p && p.length > 1) trace(path, M, p, !!it.closed);
      R.strokeStyle = shade(it.e);
      R.lineCap = 'round';
      R.lineJoin = 'round';
      R.lineWidth = Math.max(1, (it.w ?? 0.1) / G.dr);
      R.stroke(path);
    }
    if (it.borders) {
      // five bins of cos^4 of the angle between the beam and the surface normal; a sixth for
      // the oblique rest when `all`
      const bins = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const used = [0, 0, 0, 0, 0, 0];
      for (const p of it.borders) {
        if (!p || p.length < 2) continue;
        const n = p.length, last = it.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
          const a = p[i], b = p[(i + 1) % n];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
          if (tl < 1e-6) continue;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ml = Math.hypot(mx, my) || 1;
          const c = Math.abs((-ty * mx + tx * my) / (tl * ml));
          const lv = c * c * c * c;
          if (lv < 0.1 && !it.all) continue;
          const bi = lv < 0.1 ? 5 : Math.min(4, Math.floor(((lv - 0.1) / 0.9) * 5));
          trace(bins[bi], M, [a, b], false);
          used[bi] = 1;
        }
      }
      R.lineCap = 'round';
      R.lineWidth = Math.max(1, (it.w ?? 0.07) / G.dr);
      for (let bi = 0; bi < 6; bi++) {
        if (!used[bi]) continue;
        R.strokeStyle = shade(it.e + (bi === 5 ? 0 : (it.spec ?? 6) * (0.1 + (0.9 * (bi + 0.5)) / 5)));
        R.stroke(bins[bi]);
      }
    }
  }
  const d = R.getImageData(0, 0, NB, NS).data;
  const { A, I, Q, T, E, ID, UR, VR, WALL, FLOOR, HB, NORM, KA, RI, RQ } = G;
  // echogenicity, then shadows cast down each beam
  let shadows = false;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    A[i] = DEC[d[j]];
    ID[i] = d[j + 1];
    if (d[j + 2]) shadows = true;
  }
  if (shadows) {
    for (let b = 0; b < NB; b++) {
      let att = 1;
      for (let s = 0, i = b; s < NS; s++, i += NB) {
        A[i] *= att;
        const c = d[4 * i + 2];
        if (c && SHD[c] < att) att = SHD[c];
      }
    }
  }
  // scatterers: each structure's, where they sat in the reference frame; the electronic
  // noise changes from frame to frame while the cine runs and holds when it stops
  const fr = o.t === undefined ? 0 : Math.floor(o.t / 22) & 1023;
  const du = (fr * 197) & (SW - 1), dv = (fr * 389) & (SH - 1);
  const NI = Z.I, NQ = Z.Q, LF = Z.LF;
  for (let i = 0; i < N; i++) {
    let u = UR[i], v = VR[i];
    const tg = ID[i];
    if (tg) {
      const m = tg * 6;
      const uu = MOT[m] + MOT[m + 1] * u + MOT[m + 2] * v;
      v = MOT[m + 3] + MOT[m + 4] * u + MOT[m + 5] * v;
      u = uu;
    }
    const k = (((v | 0) & (SH - 1)) << 9) | ((u | 0) & (SW - 1));
    const kb = ((((VR[i] | 0) + dv) & (SH - 1)) << 9) | (((UR[i] | 0) + du) & (SW - 1));
    const a = A[i] * LF[k] + WALL[i], f = FLOOR[i];
    I[i] = a * NI[k] + f * NI[kb];
    Q[i] = a * NQ[k] + f * NQ[kb];
  }
  // across the beam: two box passes per row
  for (const F of [I, Q]) {
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
  // along the beam, then the envelope power
  const ra = (KA.length - 1) >> 1;
  for (let s = 0; s < NS; s++) {
    RI.fill(0);
    RQ.fill(0);
    for (let j = -ra; j <= ra; j++) {
      const y = s + j < 0 ? 0 : s + j >= NS ? NS - 1 : s + j, w = KA[j + ra], o0 = y * NB;
      for (let b = 0; b < NB; b++) { RI[b] += w * I[o0 + b]; RQ[b] += w * Q[o0 + b]; }
    }
    const o0 = s * NB, nm = NORM[s];
    for (let b = 0; b < NB; b++) E[o0 + b] = (RI[b] * RI[b] + RQ[b] * RQ[b]) * nm;
  }
  // speckle reduction, as the scanner applies it: blend each sample with the mean power
  // around it (about two grains), so the nulls between grains are not black cracks
  const { HR, HA } = G;
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
  for (let b = 0; b < NB; b++) {
    const h = HA;
    let sum = 0, cnt = 0;
    for (let y = 0; y <= h && y < NS; y++) { sum += T[y * NB + b]; cnt++; }
    for (let s = 0; s < NS; s++) {
      const i = s * NB + b;
      E[i] = 0.6 * E[i] + 0.4 * (sum / cnt) + 1e-12;
      const ya = s + h + 1, yr = s - h;
      if (ya < NS) { sum += T[ya * NB + b]; cnt++; }
      if (yr >= 0) { sum -= T[yr * NB + b]; cnt--; }
    }
  }
  // to dB: log2 read from the float's own bits (within 0.2 dB, much faster than Math.log)
  const EB = G.EB;
  for (let i = 0; i < N; i++) E[i] = 3.010299957 * (EB[i] * 1.1920928955078125e-7 - 126.94269504);
  // scan conversion
  const { FB, FS, GN, out, n } = G;
  const lo = DLO - (o.gain ?? 0);
  for (let p = 0; p < n; p++) {
    const fs = FS[p];
    if (fs < 0) continue;
    const fb = FB[p];
    const b = fb | 0, s = fs | 0, tb = fb - b, ts = fs - s;
    const i = s * NB + b;
    const ea = E[i] + (E[i + 1] - E[i]) * tb;
    const eb = E[i + NB] + (E[i + NB + 1] - E[i + NB]) * tb;
    let kk = (ea + (eb - ea) * ts + GN[p] - lo) * KSCALE;
    kk = kk < 0 ? 0 : kk > 1023 ? 1023 : kk | 0;
    out[p] = MAP[kk];
  }
  G.cv.getContext('2d').putImageData(G.img, 0, 0);
  ctx.drawImage(G.cv, view.box.x, view.box.y, view.box.w, view.box.h);
  return G;
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
 * Cached by key.
 */
export function mmode(ctx, box, d0, d1, layers, key) {
  const W = Math.max(2, Math.round(box.w)), H = Math.max(2, Math.round(box.h));
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
        for (let q = -rad; q <= rad; q++) a += kk[q + rad] * col[Math.min(H - 1, Math.max(0, j + q))];
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
          const uf = 300 + i * 0.08, ua = uf | 0, fu = uf - ua;
          sp = SP[row | (ua & (SW - 1))] * (1 - fu) + SP[row | ((ua + 1) & (SW - 1))] * fu;
        } else sp = SP[row | ((i * 37) & (SW - 1))];
        let q = (tmp[j] + sp - DLO) * KSCALE;
        q = q < 0 ? 0 : q > 1023 ? 1023 : q | 0;
        out[j * W + i] = MAP[q];
      }
    }
    c.getContext('2d').putImageData(img, 0, 0);
    MM.set(k, c);
    if (MM.size > 8) MM.delete(MM.keys().next().value);
  }
  ctx.drawImage(c, box.x, box.y, box.w, box.h);
}
