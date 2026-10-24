// Transcatheter edge-to-edge repair of the tricuspid valve on the heart mesh (chapter tteer):
// the clip on the anteroseptal line of coaptation, its delivery system from the inferior vena cava
// into the RA, and the tricuspid leaflets before and after the clip holds them. Lengths in cm, in
// the heart model's world space: x to the patient's left, y to the head, z to the front.
//
// The model's tricuspid valve has three leaflets on one skirt. Its commissures are the three places
// round the annulus where the open leaflets are shortest. The leaflet that faces the mitral valve is
// the septal leaflet; of the other two, the one toward the front of the heart is the anterior
// leaflet, the third the posterior leaflet. Shut, the three free edges meet near the annulus's
// middle (Q0), along three lines of coaptation. The clip's site Q lies on the anteroseptal line,
// SITE.at of the way from Q0 to the anteroseptal commissure.
//
// Disease targets, built through phenomesh.js DISEASE:
//
// ttGap: a central coaptation gap. In the shut and the middle shapes, the distal part of each
// leaflet draws back toward its own hinge and down toward the RV apex (tethering), so the free
// edges no longer meet; the open shape keeps its place. A valve target in the scheme of
// phenomesh.js buildValve.
//
// ttGrasp, ttHalf, ttClip: the anterior and septal leaflets held in the clip with its arms at 120,
// 60 and 0 degrees (closed), on the gapped valve: each leaflet's last CLIP.ins cm lies on its arm,
// the part above it runs from the arm's end to the hinge, and the hold fades out over CLIP.lat cm on
// each side of the clip. The posterior leaflet stays free.
//
// The clip and the catheters are built each frame from the chapter's state (pose), as closed
// meshes, with gl/clipmesh.js's shapes; the echo views cut them as metal and plastic (clipmesh.js
// deviceItems), and the 3D views draw the same meshes.
import * as CM from './clipmesh.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const arr = (v) => (Array.isArray(v) ? v.slice() : [v.x, v.y, v.z]);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEG = Math.PI / 180;
const turn = (v, k, th) => {
  const c = Math.cos(th), s = Math.sin(th), kv = dot(k, v);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, kv * (1 - c)));
};

/** The clip (gl/clipmesh.js CLIP, the NT size) and the catheters' radii. */
export const CLIP = CM.CLIP;
/**
 * The catheters' radii (cm): the steerable guide catheter has a 25 Fr shaft, 8.4 mm across, and
 * the steerable sleeve's distal shaft is 5.3 mm (a manufacturer's labeling, src/refs.js
 * fdap230007c); the delivery catheter and the rest as in gl/clipmesh.js.
 */
export const CATH = { ...CM.CATH, guide: 0.42, sleeve: 0.265 };
/** The leaflets: 0 anterior, 1 septal, 2 posterior. */
export const LEAF = ['anterior', 'septal', 'posterior'];
/** The clip's site: its share of the way from Q0 to the anteroseptal commissure along the line of coaptation. */
export const SITE = { at: 0.38 };
/**
 * The coaptation gap (ttGap): how far each free edge draws back toward its hinge (r) and down
 * toward the RV apex (tent), in cm at the tip; from: the share of the leaflet's length, from the
 * hinge, where the move starts.
 */
export const GAP = { r: 0.3, tent: 0.22, from: 0.45 };
/** The arm angles (deg, between the two arms) that the three hold targets draw. */
export const HOLD = { ttGrasp: 120, ttHalf: 60, ttClip: 0 };

// ---------------------------------------------------------------- the site, found once
const SITES = new WeakMap();

/** The connected part of each vertex of an indexed mesh. */
function parts(count, index) {
  const par = new Int32Array(count).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) { const a = f(index[t]); par[f(index[t + 1])] = a; par[f(index[t + 2])] = a; }
  const out = new Int32Array(count);
  for (let i = 0; i < count; i++) out[i] = f(i);
  return out;
}
/** The plane of a point set: centre and the unit vector of least spread (power iteration on the inverse). */
function planeOfPts(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const A = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
  const co = (r, c2) => {
    const m = A.filter((_, i) => i !== r).map((row) => row.filter((_, j) => j !== c2));
    return ((r + c2) % 2 ? -1 : 1) * (m[0][0] * m[1][1] - m[0][1] * m[1][0]);
  };
  const det = A[0][0] * co(0, 0) + A[0][1] * co(0, 1) + A[0][2] * co(0, 2);
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c2) => co(c2, r) / det));
  let v = unit([0.3, 0.5, 0.8]);
  for (let k = 0; k < 60; k++) v = unit([dot(inv[0], v), dot(inv[1], v), dot(inv[2], v)]);
  return { c, n: v };
}
/** Angle a (deg) into -180 to 180. */
const wrap = (a) => ((a + 540) % 360) - 180;

/**
 * The tricuspid valve's frame and the clip's site on the rest (open) valve of mesh (the model's
 * TricuspidValve): C, N (the annulus's centre and normal, into the RA), R (its mean radius), S0
 * (toward the mitral valve, in the annular plane: the septal side), B0 (square to S0 in the plane),
 * A0 (toward the aortic valve, in the plane); the commissures (deg from S0: as, ps, ap); per
 * leaflet vertex its angle round the annulus (deg from S0), its leaflet (LEAF index), its depth
 * along the leaflet (f, 0 at the hinge, 1 at the tip), its distance from the leaflet's tip (ell)
 * and its hinge point; Q0, where the three shut free edges meet; the anteroseptal line of
 * coaptation (Bc, from Q0 toward the anteroseptal commissure; Ac, square to it toward the anterior
 * leaflet); and Q, the clip's site on that line. anat: the model's Anatomy (normal landmarks).
 */
export function tvSiteOf(mesh, anat) {
  if (SITES.has(mesh)) return SITES.get(mesh);
  const g = mesh.geometry, base = g.attributes.position.array, n = base.length / 3;
  const dict = mesh.morphTargetDictionary, MP = g.morphAttributes.position;
  const far = MP[dict.leaflets].array;
  const part = parts(n, g.index.array), cnt = new Map();
  for (let i = 0; i < n; i++) cnt.set(part[i], (cnt.get(part[i]) || 0) + 1);
  const ringPart = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const ringIdx = [], ring = [];
  for (let i = 0; i < n; i++) if (part[i] === ringPart) { ringIdx.push(i); ring.push([base[3 * i], base[3 * i + 1], base[3 * i + 2]]); }
  const Pl = planeOfPts(ring), C = Pl.c;
  let N = Pl.n;
  if (dot(N, sub(arr(anat.raw('ra_c', 0, 0)), C)) < 0) N = mul(N, -1);
  const inPlane = (v) => unit(sub(v, mul(N, dot(v, N))));
  const S0 = inPlane(sub(arr(anat.raw('mv', 0, 0)), C));
  const B0 = cross(N, S0);
  const A0 = inPlane(sub(arr(anat.raw('av', 0, 0)), C));
  const angOf = (p) => { const d = sub(p, C); return Math.atan2(dot(d, B0), dot(d, S0)) / DEG; };
  const R = ring.reduce((s, p) => { const d = sub(p, C); return s + len(sub(d, mul(N, dot(d, N)))); }, 0) / ring.length;
  // the hinge round the annulus, in 5-degree bins: the mean of the ring's vertices there
  const BINS = 72, binOf = (a) => ((Math.floor(((a + 180) / 360) * BINS) % BINS) + BINS) % BINS;
  const hb = Array.from({ length: BINS }, () => ({ p: [0, 0, 0], k: 0 }));
  for (const p of ring) { const b = hb[binOf(angOf(p))]; b.p = add(b.p, p); b.k++; }
  const hinge = hb.map((b, k) => {
    if (b.k) return mul(b.p, 1 / b.k);
    const a = ((k + 0.5) / BINS) * 360 - 180;
    return add(C, add(mul(S0, R * Math.cos(a * DEG)), mul(B0, R * Math.sin(a * DEG))));
  });
  const leaf = new Uint8Array(n), ang = new Float32Array(n), depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (part[i] === ringPart) continue;
    leaf[i] = 1;
    const p = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    ang[i] = angOf(p);
    depth[i] = Math.max(0, -dot(sub(p, C), N));
  }
  const Hbin = new Float32Array(BINS).fill(1e-6), Lbin = new Float32Array(BINS).fill(0.5);
  for (let i = 0; i < n; i++) if (leaf[i]) { const b = binOf(ang[i]); Hbin[b] = Math.max(Hbin[b], depth[i]); }
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) if (leaf[i]) f[i] = Math.min(1, depth[i] / Hbin[binOf(ang[i])]);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    const b = binOf(ang[i]), p = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    Lbin[b] = Math.max(Lbin[b], len(sub(p, hinge[b])));
  }
  const ell = new Float32Array(n);
  for (let i = 0; i < n; i++) if (leaf[i]) ell[i] = (1 - f[i]) * Lbin[binOf(ang[i])];
  // the commissures: the three deepest minima of the leaflets' length round the annulus (smoothed
  // over 15 degrees), at least 60 degrees apart
  const Ls = Array.from(Lbin, (_, k) => (Lbin[(k + BINS - 1) % BINS] + Lbin[k] + Lbin[(k + 1) % BINS]) / 3);
  const mins = [];
  for (let k = 0; k < BINS; k++) if (Ls[k] <= Ls[(k + BINS - 1) % BINS] && Ls[k] <= Ls[(k + 1) % BINS]) mins.push(k);
  mins.sort((a, b) => Ls[a] - Ls[b]);
  const com = [];
  for (const k of mins) {
    const a = ((k + 0.5) / BINS) * 360 - 180;
    if (com.every((c) => Math.abs(wrap(c - a)) >= 60)) com.push(a);
    if (com.length === 3) break;
  }
  com.sort((a, b) => a - b);
  // the three arcs between the commissures: the septal leaflet's holds S0 (angle 0); the anterior
  // leaflet's middle lies nearer the front of the heart than the posterior leaflet's
  const arcs = [0, 1, 2].map((j) => {
    const a = com[j], b = com[(j + 1) % 3], span = ((b - a) + 360) % 360;
    return { a, b, span, mid: wrap(a + span / 2) };
  });
  const inArc = (x, A) => ((x - A.a + 360) % 360) < A.span;
  const sIdx = arcs.findIndex((A) => inArc(0, A));
  const front = arr(anat.anterior), fAng = Math.atan2(dot(front, B0), dot(front, S0)) / DEG;
  const others = [0, 1, 2].filter((j) => j !== sIdx);
  const aIdx = Math.abs(wrap(arcs[others[0]].mid - fAng)) < Math.abs(wrap(arcs[others[1]].mid - fAng)) ? others[0] : others[1];
  const pIdx = others.find((j) => j !== aIdx);
  const id = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (leaf[i]) id[i] = inArc(ang[i], arcs[aIdx]) ? 0 : inArc(ang[i], arcs[sIdx]) ? 1 : 2;
  // the commissure each pair of leaflets shares
  const shared = (x, y) => [arcs[x].a, arcs[x].b].find((c) => c === arcs[y].a || c === arcs[y].b);
  const comm = { as: shared(aIdx, sIdx), ps: shared(pIdx, sIdx), ap: shared(aIdx, pIdx) };
  // the shut free edges (f >= 0.85) and Q0, where the three meet: the mean of the shut tips
  // within 0.35 cm of the point nearest all three leaflets' tips
  const shut = (i) => [base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]];
  const tips = [[], [], []];
  for (let i = 0; i < n; i++) if (leaf[i] && f[i] >= 0.85) tips[id[i]].push(shut(i));
  const nearestTo = (L, p) => L.reduce((b, q) => (len(sub(q, p)) < len(sub(b, p)) ? q : b), L[0]);
  let Q0 = C;
  for (let it = 0; it < 8; it++) {
    const ps = tips.map((L) => nearestTo(L, Q0));
    Q0 = mul(add(add(ps[0], ps[1]), ps[2]), 1 / 3);
  }
  // the anteroseptal line of coaptation: from Q0 toward the anteroseptal commissure's hinge, in
  // the annular plane; Ac square to it, toward the anterior leaflet
  const hAS = hinge[binOf(comm.as)];
  const Bc = inPlane(sub(hAS, Q0));
  let Ac = cross(N, Bc);
  const aMid = arcs[aIdx].mid * DEG, aDir = add(mul(S0, Math.cos(aMid)), mul(B0, Math.sin(aMid)));
  if (dot(Ac, aDir) < 0) Ac = mul(Ac, -1);
  const lineLen = len(sub(sub(hAS, Q0), mul(N, dot(sub(hAS, Q0), N))));
  // the clip's site: on the line, at the depth of the shut tips of the anterior and septal leaflets there
  const P0 = add(Q0, mul(Bc, SITE.at * lineLen));
  const near = [];
  for (const L of [tips[0], tips[1]]) for (const q of L) {
    const d = sub(q, P0);
    if (Math.abs(dot(d, Bc)) < 0.3 && len(sub(d, mul(N, dot(d, N)))) < 0.6) near.push(q);
  }
  const hQ = near.length ? near.reduce((s, q) => s + dot(sub(q, P0), N), 0) / near.length : 0;
  const Q = add(P0, mul(N, hQ));
  // each leaflet vertex: its side for the clip (1 anterior, -1 septal, 0 posterior) and its place
  // along the line from Q, on the shut valve
  const side = new Int8Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    side[i] = id[i] === 0 ? 1 : id[i] === 1 ? -1 : 0;
    b[i] = dot(sub(shut(i), Q), Bc);
  }
  const site = {
    C, N, R, S0, B0, A0, Ac, Bc, Q, Q0, lineLen, comm, arcs: { anterior: arcs[aIdx], septal: arcs[sIdx], posterior: arcs[pIdx] },
    n, leaf, ang, id, f, side, ell, b, hingeOf: (i) => hinge[binOf(ang[i])], hingeAt: (a) => hinge[binOf(a)], Lbin, binOf, ringIdx, part, ringPart,
  };
  SITES.set(mesh, site);
  return site;
}

// ---------------------------------------------------------------- the targets
/** A pause for the page every ms of work. */
function slicer(ms = 12) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}

/**
 * Build target key of kind ('gap' or 'hold') on the meshes. ctx: phenomesh.js
 * preparePhenotypes; H: its helpers { addTarget, grid, nearest }.
 */
export async function buildTricuspidTarget(ctx, key, kind, H) {
  const site = tvSiteOf(ctx.meshes.TricuspidValve, ctx.anat.normal ? ctx.anat.normal() : ctx.anat);
  const shapes = gapShapes(ctx.meshes.TricuspidValve, site);
  if (kind === 'gap') await buildGap(ctx, key, site, shapes, H);
  else await buildHold(ctx, key, site, shapes, HOLD[key] ?? 0, H);
  return { shift: () => ctx.F.Z.clone().set(0, 0, 0) };
}

/** The chordae next to the leaflet points that move take their move, fading over fade cm. */
async function chordaeFollow(meshes, site, moves, keys, H, fade = 1.0, share = 1) {
  const ch = meshes.TricuspidChordae;
  if (!ch) return;
  const tick = slicer();
  const base = meshes.TricuspidValve.geometry.attributes.position.array;
  const lv = [];
  for (let i = 0; i < site.n; i++) if (site.leaf[i] && moves.some((m) => m[3 * i] || m[3 * i + 1] || m[3 * i + 2])) lv.push(i);
  const cp = ch.geometry.attributes.position.array, cn = cp.length / 3;
  const outs = moves.map(() => new Float32Array(cp.length));
  if (lv.length) {
    const pts = new Float32Array(lv.length * 3);
    lv.forEach((i, k) => { pts[3 * k] = base[3 * i]; pts[3 * k + 1] = base[3 * i + 1]; pts[3 * k + 2] = base[3 * i + 2]; });
    const G = H.grid(pts, null, 0.6);
    for (let j = 0; j < cn; j++) {
      if ((j & 127) === 0) await tick();
      const q = H.nearest(G, cp[3 * j], cp[3 * j + 1], cp[3 * j + 2], 1, 1.2);
      if (!q.length) continue;
      const i = lv[q[0][0]], w = share * (1 - smooth((Math.sqrt(q[0][1]) - 0.15) / fade));
      for (let m = 0; m < moves.length; m++) for (let k = 0; k < 3; k++) outs[m][3 * j + k] = w * moves[m][3 * i + k];
    }
  }
  keys.forEach((k, m) => H.addTarget(ch, k, outs[m]));
}

/**
 * The gap's moves of each leaflet vertex, relative to the mesh's own shapes: mid and far, the
 * changes of the middle and the shut shapes (the open shape keeps its place).
 */
const GAPS = new WeakMap();
function gapShapes(mesh, site) {
  if (GAPS.has(mesh)) return GAPS.get(mesh);
  const g = mesh.geometry, base = g.attributes.position.array, dict = mesh.morphTargetDictionary, MP = g.morphAttributes.position;
  const far = MP[dict.leaflets].array;
  const gf = new Float32Array(base.length), gm = new Float32Array(base.length);
  const { N } = site;
  for (let i = 0; i < site.n; i++) {
    if (!site.leaf[i]) continue;
    const u = smooth((site.f[i] - GAP.from) / (1 - GAP.from));
    if (u <= 0) continue;
    const S = [base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]];
    const h = site.hingeOf(i), d = sub(h, S), out = unit(sub(d, mul(N, dot(d, N))));
    const m = add(mul(out, GAP.r * u), mul(N, -GAP.tent * u));
    for (let k = 0; k < 3; k++) { gf[3 * i + k] = m[k]; gm[3 * i + k] = 0.5 * m[k]; }
  }
  const out = { gm, gf };
  GAPS.set(mesh, out);
  return out;
}

/** ttGap: the free edges drawn back and down in the shut and middle shapes. */
async function buildGap(ctx, key, site, shapes, H) {
  const mesh = ctx.meshes.TricuspidValve, zero = new Float32Array(mesh.geometry.attributes.position.array.length);
  H.addTarget(mesh, `dx_${key}`, zero);
  H.addTarget(mesh, `dx_${key}_mid`, shapes.gm);
  H.addTarget(mesh, `dx_${key}_far`, shapes.gf);
  await chordaeFollow(ctx.meshes, site, [zero, shapes.gm, shapes.gf], [`dx_${key}`, `dx_${key}_mid`, `dx_${key}_far`], H, 0.9, 0.8);
}

/**
 * Where the clip holds a leaflet point i, for arms deg degrees apart, on the clip at rest: { P, w }
 * (the held point and how much of the hold applies there), from the point's natural position nat.
 * The clip's hinge lies CLIP.hinge below Q (toward the RV); each arm runs from the hinge at half
 * the angle from the clip's axis (N), toward its own leaflet (Ac for the anterior one).
 */
function held(site, i, nat, deg) {
  const { N, Ac, Bc, Q } = site, s = site.side[i], phi = (deg / 2) * DEG;
  const Hc = add(Q, mul(N, -CLIP.hinge));
  const d = add(mul(N, Math.cos(phi)), mul(Ac, s * Math.sin(phi)));
  const nrm = sub(mul(N, Math.sin(phi)), mul(Ac, s * Math.cos(phi)));
  const b = site.b[i], bh = clamp(b, -CLIP.armW / 2, CLIP.armW / 2);
  const arm = (l) => add(add(add(Hc, mul(d, CLIP.r0 + l)), mul(nrm, CLIP.off)), mul(Bc, bh));
  const ell = site.ell[i], L = Math.max(site.Lbin[site.binOf(site.ang[i])], CLIP.ins + 0.1);
  let P;
  if (ell <= CLIP.ins) P = arm(ell);
  else {
    const u = clamp((ell - CLIP.ins) / (L - CLIP.ins), 0, 1);
    const E = arm(CLIP.ins), line = lerp(E, site.hingeOf(i), u);
    P = lerp(line, nat, smooth(u));
  }
  const w = 1 - smooth((Math.abs(b) - CLIP.armW / 2) / CLIP.lat);
  return { P, w };
}

/** A hold target on the gapped valve: the leaflets in the clip with its arms deg apart, for the open, middle and shut leaflets. */
async function buildHold(ctx, key, site, shapes, deg, H) {
  const mesh = ctx.meshes.TricuspidValve, g = mesh.geometry, base = g.attributes.position.array;
  const dict = mesh.morphTargetDictionary, MP = g.morphAttributes.position;
  const mid = MP[dict.leaflets_mid].array, far = MP[dict.leaflets].array;
  const ed = new Float32Array(base.length), em = new Float32Array(base.length), ef = new Float32Array(base.length);
  const tick = slicer();
  for (let i = 0; i < site.n; i++) {
    if ((i & 255) === 0) await tick();
    if (!site.leaf[i] || !site.side[i]) continue;
    if (Math.abs(site.b[i]) > CLIP.armW / 2 + CLIP.lat) continue;
    const o = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    const om = add(add(o, [mid[3 * i], mid[3 * i + 1], mid[3 * i + 2]]), [shapes.gm[3 * i], shapes.gm[3 * i + 1], shapes.gm[3 * i + 2]]);
    const of = add(add(o, [far[3 * i], far[3 * i + 1], far[3 * i + 2]]), [shapes.gf[3 * i], shapes.gf[3 * i + 1], shapes.gf[3 * i + 2]]);
    const at = (nat) => { const h = held(site, i, nat, deg); return lerp(nat, h.P, h.w); };
    const dO = sub(at(o), o), dM = sub(at(om), om), dF = sub(at(of), of);
    for (let k = 0; k < 3; k++) {
      ed[3 * i + k] = dO[k];
      em[3 * i + k] = dM[k] - dO[k];
      ef[3 * i + k] = dF[k] - dO[k];
    }
  }
  H.addTarget(mesh, `dx_${key}`, ed);
  H.addTarget(mesh, `dx_${key}_mid`, em);
  H.addTarget(mesh, `dx_${key}_far`, ef);
  await chordaeFollow(ctx.meshes, site, [ed, em, ef], [`dx_${key}`, `dx_${key}_mid`, `dx_${key}_far`], H, 0.9, 0.85);
}

/**
 * The hold targets' weights for arms deg apart with share cap of the leaflets held: two of
 * ttGrasp (120), ttHalf (60) and ttClip (0), blended by the angle, times cap.
 */
export function holdWeights(deg, cap) {
  const out = { ttGrasp: 0, ttHalf: 0, ttClip: 0 };
  if (!(cap > 0)) return out;
  const a = clamp(deg, 0, 120);
  if (a >= 60) { const u = (a - 60) / 60; out.ttGrasp = cap * u; out.ttHalf = cap * (1 - u); }
  else { const u = a / 60; out.ttHalf = cap * u; out.ttClip = cap * (1 - u); }
  return out;
}

// ---------------------------------------------------------------- the pose and the device
/**
 * The chapter's state as the device's pose (all optional, defaults at rest): guide 0..1, the
 * steerable guide up the IVC into the RA, its tip at its place above the valve at 1; steer 0..1,
 * the clip steered from the guide's tip to above the clip's site, its axis along the valve's; depth
 * (cm), the clip's hinge above (+) or below (-) Q along N; rot (deg), the arms' turn from square to
 * the line of coaptation; arm (deg), the angle between the arms; grip 0..1, the grippers down; cap
 * 0..1, the leaflets held; rel 0..1, the clip released and the delivery catheter drawn back into the
 * guide; out 0..1, the guide drawn back down the IVC; gone > 0, the system out of the body; show > 0,
 * any device at all.
 */
export const REST_POSE = { guide: 0, steer: 0, depth: 1.8, rot: 0, arm: 0, grip: 0, cap: 0, rel: 0, out: 0, gone: 0, show: 0 };
/**
 * The guide's tip in the RA, from the clip's site: TIP.h cm above it along the valve's axis and
 * TIP.back cm toward the IVC's side of the RA, pointing at the site, so the system comes down to
 * the valve from above and a little behind, as it enters from the IVC.
 */
export const TIP = { h: 3.0, back: 0.6 };

/**
 * The device in world cm for the heart drawn: its parts as closed meshes, and its frames. site:
 * tvSiteOf; pose: as REST_POSE; motion: the valve's motion from rest to this frame ({ map(p),
 * dir(v) }: clipmesh.js valveMotion); cava: the venae cavae (clipmesh.js CAVA); clear(p, room): the
 * point p moved off the walls by room cm (the route's clearance); along: a plane ({ O, n }, world
 * arrays) that the route's rise in the RA keeps to, so the bicaval view shows the guide along its
 * length. Returns { parts: { name: { pos, idx } }, clip: { H, a, e, w, phi, top } | null, path, tip }.
 */
export function deviceOf(site, pose0, motion = null, cava = CM.CAVA, clear = null, along = null) {
  const pose = { ...REST_POSE, ...pose0 };
  const parts = {};
  if (!(pose.show > 0)) return { parts, clip: null, path: [] };
  const vm = motion || { map: (p) => p, dir: (v) => v };
  const N = unit(vm.dir(site.N)), Q = vm.map(site.Q);
  const E = cava.ivc, up = unit(sub(cava.svc, cava.ivc));
  // the guide's tip: above the site, toward the IVC's side of the RA, pointing at the site
  const toIvc = unit(sub(sub(E, Q), mul(N, dot(sub(E, Q), N))));
  const tip = add(add(Q, mul(N, TIP.h)), mul(toIvc, TIP.back));
  const tS = unit(sub(Q, tip));
  // the route: up the femoral vein and the IVC into the RA, then a bend that brings the guide's
  // last 1.6 cm along its tip's direction
  const back = add(tip, mul(tS, -1.6));
  const onto = (p) => (along ? sub(p, mul(along.n, dot(sub(p, along.O), along.n))) : p);
  const M = onto(add(E, mul(up, Math.max(0.8, dot(sub(back, E), up) * 0.55))));
  let route = CM.spline([[-2.0, -15.5, -2.0], [-2.5, -8.5, -0.6], [-2.9, -5.6, 1.4], onto(E), M, back, tip], 8);
  if (clear) {
    const room = CATH.guide + 0.15, free = (p) => len(sub(p, tip)) > 0.6;
    for (let it = 0; it < 3; it++) {
      route = route.map((p) => (free(p) ? clear(p, room) : p));
      if (it < 2) route = route.map((p, i) => (i === 0 || i === route.length - 1 ? p : mul(add(add(route[i - 1], route[i + 1]), mul(p, 2)), 0.25)));
    }
  }
  // the rise from the IVC to M stays in the along plane, where the clearance moved it off
  if (along) {
    const hM = dot(sub(M, E), up);
    route = route.map((p) => { const h = dot(sub(p, E), up); return h > -1.5 && h < hM ? onto(p) : p; });
  }
  // how far up the route the guide has come (guide 0 to 1), and back down it (out 0 to 1)
  const reach = clamp(pose.guide, 0, 1) * (1 - 0.55 * smooth(clamp(pose.out, 0, 1)));
  const guidePath = CM.trim(route, 0, 0.62 + 0.38 * reach);
  if (guidePath.length > 1 && !(pose.gone > 0)) parts.guide = CM.tube(guidePath, CATH.guide);
  const G = guidePath.length ? guidePath[guidePath.length - 1] : tip;
  const held = clamp(pose.cap, 0, 1) >= 0.999;
  if (reach < 0.999 && !held) return { parts, clip: null, path: guidePath, tip: G };
  // the clip: steered from the guide's tip (pointing on along it) to above Q, along the valve's
  // axis; then down along N to its depth. Its axis a points back up the catheter.
  const steer = clamp(pose.steer, 0, 1);
  const aFree = unit(lerp(mul(tS, -1), N, smooth(steer)));
  const over = add(Q, mul(N, pose.depth));
  const Hfree = lerp(add(G, mul(tS, 1.0 + CLIP.bodyL)), over, smooth(steer));
  const eRest = turn(unit(vm.dir(site.Ac)), N, pose.rot * DEG);
  // Q and N already follow the valve's motion, so a clip that holds the leaflets moves with them
  const Hc = Hfree, a = aFree;
  let e = steer < 1 ? unit(sub(eRest, mul(aFree, dot(eRest, aFree)))) : eRest;
  e = unit(sub(e, mul(a, dot(e, a))));
  const w = cross(a, e);
  const phi = (clamp(pose.arm, 0, 240) / 2) * DEG;
  const top = add(Hc, mul(a, CLIP.bodyL));
  parts.body = CM.tube([add(Hc, mul(a, -0.1)), add(Hc, mul(a, 0.05)), top], (u) => (u < 0.06 ? CLIP.bodyR * 0.75 : CLIP.bodyR), 12);
  for (const [name, s] of [['armA', 1], ['armP', -1]]) {
    const d = add(mul(a, Math.cos(phi)), mul(e, s * Math.sin(phi)));
    const nrm = sub(mul(a, Math.sin(phi)), mul(e, s * Math.cos(phi)));
    const c = add(add(Hc, mul(d, CLIP.armL / 2 + 0.02)), mul(nrm, -CLIP.armT / 2 - (phi < 0.05 ? CLIP.bodyR : 0)));
    parts[name] = CM.box(c, d, w, nrm, CLIP.armL / 2, CLIP.armW / 2, CLIP.armT / 2);
    const psi = clamp(pose.grip, 0, 1) * phi;
    const dg = add(mul(a, Math.cos(psi)), mul(e, s * Math.sin(psi)));
    const ng = sub(mul(a, Math.sin(psi)), mul(e, s * Math.cos(psi)));
    const cg = add(add(Hc, mul(dg, CLIP.gripL / 2 + 0.1)), mul(ng, CLIP.gripT / 2 + CLIP.off * 2));
    parts[name === 'armA' ? 'gripA' : 'gripP'] = CM.box(cg, dg, w, ng, CLIP.gripL / 2, CLIP.gripW / 2, CLIP.gripT / 2);
  }
  // the delivery catheter and the steerable sleeve from the guide's tip to the clip's top; after
  // release the catheter draws back into the guide
  const rel = clamp(pose.rel, 0, 1);
  let curve = [];
  if (reach >= 0.999 && rel < 0.999 && !(pose.gone > 0)) {
    const end = lerp(top, add(G, mul(tS, 0.3)), smooth(rel));
    const endDir = unit(lerp(a, mul(tS, -1), smooth(rel)));
    const lead = Math.min(1.4, 0.45 * len(sub(end, G)) + 0.2);
    curve = CM.bezier(G, add(G, mul(tS, lead)), add(end, mul(endDir, lead)), end, 28);
    const L = CM.lengthOf(curve);
    if (L > 0.15) {
      const sl = clamp((L - 1.2) / L, 0.2, 0.75);
      parts.sleeve = CM.tube(CM.trim(curve, 0, sl), CATH.sleeve, 12);
      parts.dc = CM.tube(curve, CATH.dc, 10);
    }
  }
  return { parts, clip: { H: Hc, a, e, w, phi, top }, path: [...guidePath, ...curve], tip: G };
}

/** The rigid motion that carries the tricuspid annulus from the rest shape to this frame (clipmesh.js valveMotion). */
export const valveMotion = (site, rest, pos) => CM.valveMotion(site, rest, pos);
