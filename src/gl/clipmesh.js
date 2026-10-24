// Transcatheter edge-to-edge repair of the mitral valve on the heart mesh (chapter mteer):
// the clip, its delivery system, the septum that the system crosses, and the mitral leaflets
// before and after the clip holds them. Lengths in cm, in the heart model's world space: x to
// the patient's left, y to the head, z to the front.
//
// Disease targets, built through phenomesh.js DISEASE:
//
// tcFlail: a flail P2. The middle scallop of the posterior leaflet turns past a fold line
// FLAIL.at of the way down from its hinge, about the annulus's tangent there, so its free edge
// points into the LA when the valve shuts; the part past the fold grows longer, as its chordae
// are torn. The chordae next to it go with it. A move within the beat (echo.js setMotion), as
// mimesh.js builds the flail anterior leaflet.
//
// tcFossa: the fossa ovalis as one thin wall: round the puncture site the LA's and the RA's
// walls of the mesh's septum, which have a gap between them, move together until they meet,
// and neither passes the other. A static shape.
//
// tcSepLa: the RA's wall of the septum moves with the LA's as the LA grows (the LA target):
// weighted as the LA target is, so the fossa stays one wall in a large LA.
//
// tcTent: the fossa ovalis pushed toward the LA by the transseptal sheath ("tenting"): the
// septum's two walls round the puncture site move along the septum's axis, most at the site and
// none past TENT.r. A static shape (echo.js setDisease).
//
// tcGrasp, tcHalf, tcClip: the leaflets held in the clip with its arms at 120, 60 and 0 degrees
// (closed). Each leaflet's last CLIP.ins cm lies on its arm, the part above it runs from the
// arm's end to the hinge, and the hold fades out over CLIP.lat cm on each side of the clip, so
// the open valve has two orifices, one on each side of the clip. Each is a valve target in the
// scheme of phenomesh.js buildValve: a change for the open, the middle and the shut leaflets.
//
// The clip and the catheters are built each frame from the chapter's state (pose), as closed
// meshes. The echo views cut them on their planes (echo.js extraItems) as metal and plastic,
// with the shadow and the reverberation behind them; the 3D views draw the same meshes. The
// sizes of the clip follow the device's labeling where the chapter cites it (refs abbottifu2019,
// abbottg4); the rest of the shapes are a drawing.

const V = (x = 0, y = 0, z = 0) => [x, y, z];
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
/** v turned by th (rad) about the unit axis k (Rodrigues). */
const turn = (v, k, th) => {
  const c = Math.cos(th), s = Math.sin(th), kv = dot(k, v);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, kv * (1 - c)));
};

// ---------------------------------------------------------------- the device
/**
 * The clip (cm). arm: arm length and width of the NT size (abbottg4); body: the clip's spine,
 * radius and length from the arms' hinge; armT: the arms' thickness; grip: the grippers' length,
 * width and thickness. ins: how much of each leaflet the closed clip holds; lat: how far the
 * hold fades out on each side of the clip; hinge: the hinge's depth below the coaptation point
 * when the clip holds the leaflets; r0: where a held leaflet's tip lies along the arm from the
 * hinge; off: a held leaflet's distance from its arm; pivot: each arm's pivot, to its side of the
 * clip's axis; ant: the clip's axis this far from Q toward the anterior leaflet, so the posterior
 * arm clears the posterior annulus. A held leaflet runs to just past its arm's end (r0 + ins), so
 * it leaves the clip over the arm's end and not through the arm.
 */
export const CLIP = {
  armL: 0.9, armW: 0.4, armT: 0.07,
  bodyR: 0.12, bodyL: 1.0,
  gripL: 0.72, gripW: 0.3, gripT: 0.035,
  ins: 0.7, lat: 0.55, hinge: 0.8, r0: 0.25, off: 0.06, pivot: 0.15, ant: 0.12,
};
/** The catheters' radii (cm): the steerable guide at the septum, the steerable sleeve, the delivery catheter, the transseptal sheath and needle. */
export const CATH = { guide: 0.37, sleeve: 0.22, dc: 0.12, sheath: 0.14, needle: 0.04 };
/** The flail P2 (tcFlail): the sector round P2 (deg: full within half, gone past half + soft), fold, turn (deg) and growth. */
export const FLAIL = { half: 28, soft: 14, at: 0.28, deg: 125, long: 0.45 };
/** The tenting (tcTent): its height at weight 1 and its reach on the septum (cm). */
export const TENT = { h: 1.2, r: 1.0 };
/** The fossa ovalis (tcFossa): how far round the puncture site the two walls move together (cm), and the share of that within which they meet. */
export const FOSSA = { r: 2.2, full: 0.55 };
/**
 * The puncture site on the atrial septum (the fossa ovalis, high and toward the back): up, its
 * place between the septum's lowest and highest points above the mitral annular plane (0 to 1);
 * back, its place from the middle of the septum at that height toward its back edge (0 to 1).
 */
export const PUNCTURE = { up: 0.92, back: 0.3 };
/** The arm angles (deg, between the two arms) that the three hold targets draw. */
export const HOLD = { tcGrasp: 120, tcHalf: 60, tcClip: 0 };

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
  // the inverse of the scatter matrix, by cofactors
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

/**
 * The mitral valve's frame and the clip's site on the rest (open) valve of mesh (the model's
 * MitralValve, after gl/mvopen.js): C, N (the annulus's centre and normal, into the LA), R (its
 * radius), A0 (toward the aortic valve, in the annular plane), B0 (medial, toward the tricuspid
 * valve), Bc (along the line of coaptation, medial) and Ac (square to it, toward the anterior
 * leaflet); per leaflet vertex its angle round the annulus from A0 and from Ac (deg, medial
 * positive), its depth along the leaflet (f, 0 at the hinge, 1 at the tip), its side (1
 * anterior, -1 posterior), its distance from its leaflet's tip (ell) and its hinge point; and Q,
 * the point where A2 and P2 meet when the valve is shut. anat: the model's Anatomy (normal
 * landmarks).
 */
export function siteOf(mesh, anat) {
  if (SITES.has(mesh)) return SITES.get(mesh);
  const g = mesh.geometry, base = g.attributes.position.array, n = base.length / 3;
  const dict = mesh.morphTargetDictionary, MP = g.morphAttributes.position;
  const far = MP[dict.leaflets].array;
  const part = parts(n, g.index.array), cnt = new Map();
  for (let i = 0; i < n; i++) cnt.set(part[i], (cnt.get(part[i]) || 0) + 1);
  const ringPart = [...cnt.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const ringIdx = [], ring = [];
  for (let i = 0; i < n; i++) if (part[i] === ringPart) { ringIdx.push(i); ring.push([base[3 * i], base[3 * i + 1], base[3 * i + 2]]); }
  const P = planeOfPts(ring), C = P.c;
  let N = P.n;
  const la = arr(anat.raw('la_c', 0, 0));
  if (dot(N, sub(la, C)) < 0) N = mul(N, -1);
  const inPlane = (v) => unit(sub(v, mul(N, dot(v, N))));
  const A0 = inPlane(sub(arr(anat.raw('av', 0, 0)), C));
  let B0 = cross(N, A0);
  if (dot(B0, sub(arr(anat.raw('tv', 0, 0)), C)) < 0) B0 = mul(B0, -1);
  const R = ring.reduce((s, p) => { const d = sub(p, C); return s + len(sub(d, mul(N, dot(d, N)))); }, 0) / ring.length;
  // the hinge round the annulus, in 5-degree bins: the mean of the ring's vertices there
  const BINS = 72, angOf = (p) => { const d = sub(p, C); return Math.atan2(dot(d, B0), dot(d, A0)) / DEG; };
  const binOf = (a) => ((Math.floor(((a + 180) / 360) * BINS) % BINS) + BINS) % BINS;
  const hb = Array.from({ length: BINS }, () => ({ p: [0, 0, 0], k: 0 }));
  for (const p of ring) { const b = hb[binOf(angOf(p))]; b.p = add(b.p, p); b.k++; }
  const hinge = hb.map((b, k) => {
    if (b.k) return mul(b.p, 1 / b.k);
    const a = ((k + 0.5) / BINS) * 360 - 180;
    return add(C, add(mul(A0, R * Math.cos(a * DEG)), mul(B0, R * Math.sin(a * DEG))));
  });
  // each leaflet vertex: angle, depth (open, along -N), side
  const leaf = new Uint8Array(n), ang = new Float32Array(n), depth = new Float32Array(n), side = new Int8Array(n);
  let H = 1e-6;
  for (let i = 0; i < n; i++) {
    if (part[i] === ringPart) continue;
    leaf[i] = 1;
    const p = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    ang[i] = angOf(p);
    depth[i] = Math.max(0, -dot(sub(p, C), N));
    H = Math.max(H, depth[i]);
    side[i] = Math.abs(ang[i]) < 90 ? 1 : -1;
  }
  // the depth along each leaflet: against the deepest point of its own 5-degree bin, so the
  // posterior leaflet, shorter than the anterior one, runs from 0 at the hinge to 1 at its tip
  const Hbin = new Float32Array(BINS).fill(1e-6);
  for (let i = 0; i < n; i++) if (leaf[i]) { const b = binOf(ang[i]); Hbin[b] = Math.max(Hbin[b], depth[i]); }
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) if (leaf[i]) f[i] = Math.min(1, depth[i] / Hbin[binOf(ang[i])]);
  // each bin's leaflet length: the farthest open point from its hinge
  const Lbin = new Float32Array(BINS).fill(0.5);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    const b = binOf(ang[i]), p = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    Lbin[b] = Math.max(Lbin[b], len(sub(p, hinge[b])));
  }
  const ell = new Float32Array(n);
  for (let i = 0; i < n; i++) if (leaf[i]) ell[i] = (1 - f[i]) * Lbin[binOf(ang[i])];
  // the line of coaptation: the long axis of the shut leaflets' free edges in the annular plane
  // (Bc, medial), and its normal Ac toward the anterior leaflet. The model's line of coaptation
  // lies about 30 degrees from square to A0: the anterior leaflet's middle (A2) is medial of the
  // aortic valve's direction. The clip and the views of the coaptation line use Ac and Bc.
  let sa = 0, sb = 0, saa = 0, sab = 0, sbb = 0, k0 = 0;
  for (let i = 0; i < n; i++) {
    if (!leaf[i] || f[i] < 0.85) continue;
    const d = sub([base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]], C);
    const x = dot(d, A0), y = dot(d, B0);
    sa += x; sb += y; saa += x * x; sab += x * y; sbb += y * y; k0++;
  }
  sa /= k0; sb /= k0;
  const th = 0.5 * Math.atan2(2 * (sab / k0 - sa * sb), saa / k0 - sa * sa - (sbb / k0 - sb * sb));
  let Bc = add(mul(A0, Math.cos(th)), mul(B0, Math.sin(th)));
  // the major axis: the one of the two square directions along which the edges spread more
  const spread = (v) => { let m = 0; for (let i = 0; i < n; i++) { if (!leaf[i] || f[i] < 0.85) continue; const d = sub([base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]], C); m += dot(d, v) ** 2; } return m; };
  const Bc2 = cross(N, Bc);
  if (spread(Bc2) > spread(Bc)) Bc = Bc2;
  if (dot(Bc, B0) < 0) Bc = mul(Bc, -1);
  let Ac = cross(N, Bc);
  if (dot(Ac, A0) < 0) Ac = mul(Ac, -1);
  const angAc = angOf(add(C, Ac));
  // each leaflet vertex's angle from Ac (deg), and its leaflet: anterior within 90 degrees of Ac
  const angC = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    angC[i] = ((ang[i] - angAc + 540) % 360) - 180;
    side[i] = Math.abs(angC[i]) < 90 ? 1 : -1;
  }
  // Q: the shut tips of A2 and P2 on the line through C along Ac, and their middle
  const tipOf = (s) => {
    let c = [0, 0, 0], k = 0;
    for (let i = 0; i < n; i++) {
      if (!leaf[i] || side[i] !== s || f[i] < 0.85) continue;
      const S = [base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]];
      if (Math.abs(dot(sub(S, C), Bc)) > 0.25) continue;
      c = add(c, S); k++;
    }
    return k ? mul(c, 1 / k) : C;
  };
  const Qa = tipOf(1), Qp = tipOf(-1), Q = lerp(Qa, Qp, 0.5);
  // the lateral coordinate of each leaflet vertex: along Bc from Q, on the shut valve
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf[i]) continue;
    const S = [base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]];
    b[i] = dot(sub(S, Q), Bc);
  }
  const site = { C, N, R, A0, B0, Ac, Bc, Q, Qa, Qp, H, n, leaf, ang, angC, f, side, ell, b, hingeOf: (i) => hinge[binOf(ang[i])], Lbin, binOf, ringIdx, part, ringPart };
  SITES.set(mesh, site);
  return site;
}

// ---------------------------------------------------------------- the targets
/**
 * Build target key of kind ('flail', 'tent' or a hold: 'grasp', 'half', 'clip') on the meshes.
 * ctx: phenomesh.js preparePhenotypes; H: its helpers { addTarget, grid, nearest }.
 */
export async function buildClipTarget(ctx, key, kind, H) {
  const { meshes, anat } = ctx;
  const zero = () => ctx.F.Z.clone().set(0, 0, 0);
  const site = siteOf(meshes.MitralValve, anat.normal ? anat.normal() : anat);
  if (kind === 'flail') await buildFlail(ctx, key, site, H);
  else if (kind === 'tent') await buildTent(ctx, key, H);
  else if (kind === 'fossa') await buildFossa(ctx, key, H);
  else if (kind === 'sepla') await buildSepLa(ctx, key, H);
  else await buildHold(ctx, key, site, HOLD[key] ?? 0, H);
  return { shift: zero };
}

/** A pause for the page every ms of work. */
function slicer(ms = 12) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}

/** The chordae next to the leaflet points that move take their move, fading over fade cm. */
async function chordaeFollow(meshes, site, moves, keys, H, fade = 1.0, share = 1) {
  const ch = meshes.MitralChordae;
  if (!ch) return;
  const tick = slicer();
  const base = meshes.MitralValve.geometry.attributes.position.array;
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

/** tcFlail: P2's free edge into the LA on the shut valve (a move within the beat). */
async function buildFlail(ctx, key, site, H) {
  const mesh = ctx.meshes.MitralValve, base = mesh.geometry.attributes.position.array, n = site.n;
  const far = mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary.leaflets].array;
  const { N, C, A0, B0 } = site;
  const t = new Float32Array(base.length);
  for (let i = 0; i < n; i++) {
    if (!site.leaf[i]) continue;
    // the middle scallop of the posterior leaflet: within FLAIL.half degrees of the posterior
    // leaflet's middle (180 degrees from Ac), faded at the edges
    const da = 180 - Math.abs(site.angC[i]);
    const aw = 1 - smooth((da - FLAIL.half) / FLAIL.soft);
    const f = site.f[i];
    if (aw <= 0 || f <= FLAIL.at) continue;
    const S = [base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]];
    const ar = site.ang[i] * DEG, ur = add(mul(A0, Math.cos(ar)), mul(B0, Math.sin(ar)));
    const h = add(C, mul(ur, site.R));
    const q = add(h, mul(sub(S, h), FLAIL.at / f));
    // turn about the annulus's tangent at the fold, the free edge toward the atrium (+N)
    const K = unit(cross(N, ur));
    const b = aw * smooth((f - FLAIL.at) / 0.15);
    const v = sub(S, q);
    let th = FLAIL.deg * DEG * b;
    if (dot(turn(v, K, 0.3), N) < dot(v, N)) th = -th;
    const P = add(q, mul(turn(v, K, th), 1 + FLAIL.long * b));
    t[3 * i] = P[0] - S[0]; t[3 * i + 1] = P[1] - S[1]; t[3 * i + 2] = P[2] - S[2];
  }
  H.addTarget(mesh, `dx_${key}`, t);
  // the torn chordae and the head of the muscle go with the leaflet
  await chordaeFollow(ctx.meshes, site, [t], [`dx_${key}`], H, 0.8, 0.9);
}

/**
 * The puncture site on the atrial septum of the normal mesh, high and toward the back of the
 * fossa (PUNCTURE): on the RA face, the vertex at that place. { P (world, in the middle of the
 * septum's thickness), Pra (the RA face's vertex), Nias (the septum's axis, from the LA face
 * toward the RA face), faces, height (cm above the mitral annular plane, at rest), idx }.
 */
export function punctureOf(model) {
  const key = model.heart.meshes.Myocardium;
  if (PUNCT.has(key)) return PUNCT.get(key);
  const pos = key.geometry.attributes.position.array;
  const faces = septaFaces(model);
  const site = siteOf(model.heart.meshes.MitralValve, model.anat.normal());
  const ant = arr(model.anat.anterior);
  const at = (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const hOf = (p) => dot(sub(p, site.C), site.N);
  const hs = faces.right.map((i) => hOf(at(i)));
  const h0 = Math.min(...hs), h1 = Math.max(...hs), want = h0 + PUNCTURE.up * (h1 - h0);
  // the RA face's vertices within 0.4 cm of that height, and their extent front to back
  let band = faces.right.filter((i) => Math.abs(hOf(at(i)) - want) < 0.4);
  if (band.length < 6) band = faces.right;
  const ys = band.map((i) => dot(at(i), ant));
  const lo = Math.min(...ys), hi = Math.max(...ys), mid = (lo + hi) / 2, wantY = mid - PUNCTURE.back * (mid - lo);
  let best = band[0], bd = Infinity;
  for (const i of band) {
    const p = at(i), d = Math.abs(dot(p, ant) - wantY) + 0.7 * Math.abs(hOf(p) - want);
    if (d < bd) { bd = d; best = i; }
  }
  const P0 = at(best);
  const near = (L) => L.filter((i) => len(sub(at(i), P0)) < 1.4);
  const mean = (L) => mul(L.reduce((s, i) => add(s, at(i)), [0, 0, 0]), 1 / Math.max(1, L.length));
  const la = mean(near(faces.left).length ? near(faces.left) : faces.left), ra = mean(near(faces.right).length ? near(faces.right) : faces.right);
  const Nias = unit(sub(ra, la));
  const D = Math.max(0.2, dot(sub(ra, la), Nias));
  const P = add(P0, mul(Nias, -0.5 * D));
  // the LA face's vertex across from the RA face's one: the septum's motion is the mean of the two
  let idxL = faces.left[0], dl = Infinity;
  for (const i of faces.left) { const d = len(sub(at(i), sub(P0, mul(Nias, D)))); if (d < dl) { dl = d; idxL = i; } }
  const out = { P, Pra: P0, Nias, D, faces, height: hOf(P0), idx: best, idxL };
  PUNCT.set(key, out);
  return out;
}
const PUNCT = new WeakMap();
const FACES = new WeakMap();
/** The atrial septum's faces of model (as gl/shuntsmesh.js septaOf), found once. */
function septaFaces(model) {
  const mesh = model.heart.meshes.Myocardium;
  if (FACES.has(mesh)) return FACES.get(mesh);
  const geo = mesh.geometry, pos = geo.attributes.position.array, col = geo.attributes.color;
  const n = pos.length / 3, REG = new Uint8Array(n);
  for (let i = 0; i < n; i++) REG[i] = Math.round(col.getX(i) * 10);
  const cell = 0.6, grid = (r) => {
    const g = new Map();
    for (let i = 0; i < n; i++) {
      if (REG[i] !== r) continue;
      const k = `${Math.floor(pos[3 * i] / cell)},${Math.floor(pos[3 * i + 1] / cell)},${Math.floor(pos[3 * i + 2] / cell)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(i);
    }
    return g;
  };
  const within = (g, x, y, z, r) => {
    const R = Math.ceil(r / cell), cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
      const L = g.get(`${cx + a},${cy + b},${cz + c}`);
      if (!L) continue;
      for (const j of L) if (Math.hypot(pos[3 * j] - x, pos[3 * j + 1] - y, pos[3 * j + 2] - z) < r) return true;
    }
    return false;
  };
  const GLA = grid(3), GRA = grid(4), out = { left: [], right: [] };
  for (let i = 0; i < n; i++) {
    if (REG[i] === 3 && within(GRA, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], 1.2)) out.left.push(i);
    else if (REG[i] === 4 && within(GLA, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], 1.2)) out.right.push(i);
  }
  FACES.set(mesh, out);
  return out;
}

/**
 * The atrial septum round the puncture site S on the rest mesh, on lines along its axis (Nias)
 * through a grid on its plane, every SEPT.step cm out to reach cm from the site. The mesh's
 * septum is two walls, the LA's (region 3) and the RA's (region 4), with a gap between them that
 * is 0.4 to 2 cm wide round the fossa. A line crosses the septum where a face of the LA's wall
 * comes just before a face of the RA's, with no other wall between them; there: la, ra, the two
 * faces of each wall [h1, h2] (cm along Nias from the site), and m, the middle of the gap,
 * smoothed over the septum and kept inside the gap. v: the share of the line's neighbours that
 * cross the septum too, so the targets fade out at the septum's edge. Returns { xyh(p): a
 * point's [x, y, h] (x, y on the septum's plane), along(x, y, h, fn): the sum over the four lines
 * round (x, y) of their bilinear weight times v times fn(line, h), mid(x, y): the gap's middle
 * there (cm along Nias), e1, e2 }.
 */
const SEPT = { step: 0.2, band: 1.2 };
const SEPTA = new WeakMap();
function septumOf(meshes, S, reach) {
  const myo = meshes.Myocardium;
  const memo = SEPTA.get(myo);
  if (memo && memo.reach >= reach) return memo;
  const pos = myo.geometry.attributes.position.array, ix = myo.geometry.index.array, col = myo.geometry.attributes.color;
  const n = pos.length / 3, REG = new Uint8Array(n);
  for (let i = 0; i < n; i++) REG[i] = Math.round(col.getX(i) * 10);
  const Nn = S.Nias, e1 = unit(cross(Nn, Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(Nn, e1);
  const xyh = (p) => { const d = sub(p, S.P); return [dot(d, e1), dot(d, e2), dot(d, Nn)]; };
  // the myocardium's triangles near the site, every region, in 0.4 cm buckets on the septum's plane
  const B = 0.4, buckets = new Map(), key = (a, b) => `${a},${b}`;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const r = REG[a] === REG[b] || REG[a] === REG[c] ? REG[a] : REG[b] === REG[c] ? REG[b] : REG[a];
    const P = [a, b, c].map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), q = P.map(xyh);
    if (q.every((v) => Math.abs(v[2]) > 4) || q.every((v) => Math.hypot(v[0], v[1]) > reach + 0.8)) continue;
    const x0 = Math.floor(Math.min(q[0][0], q[1][0], q[2][0]) / B), x1 = Math.floor(Math.max(q[0][0], q[1][0], q[2][0]) / B);
    const y0 = Math.floor(Math.min(q[0][1], q[1][1], q[2][1]) / B), y1 = Math.floor(Math.max(q[0][1], q[1][1], q[2][1]) / B);
    for (let u = x0; u <= x1; u++) for (let v = y0; v <= y1; v++) {
      const k = key(u, v);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push([P[0], P[1], P[2], r]);
    }
  }
  const STEP = SEPT.step, M = Math.ceil((reach + 0.4) / STEP), W = 2 * M + 1;
  const L = new Array(W * W).fill(null);
  for (let gi = 0; gi < W; gi++) for (let gj = 0; gj < W; gj++) {
    const x = (gi - M) * STEP, y = (gj - M) * STEP;
    const O = add(S.P, add(mul(e1, x), mul(e2, y)));
    const hits = [];
    for (const [A, Bv, C, r] of buckets.get(key(Math.floor(x / B), Math.floor(y / B))) || []) {
      const E1 = sub(Bv, A), E2 = sub(C, A), P = cross(Nn, E2), det = dot(E1, P);
      if (Math.abs(det) < 1e-9) continue;
      const T = sub(O, A), u = dot(T, P) / det;
      if (u < 0 || u > 1) continue;
      const Q = cross(T, E1), v = dot(Nn, Q) / det;
      if (v < 0 || u + v > 1) continue;
      const h = dot(E2, Q) / det;
      if (Math.abs(h) < 4) hits.push([h, r]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    let best = null;
    for (let k = 0; k + 1 < hits.length; k++) {
      if (hits[k][1] !== 3 || hits[k + 1][1] !== 4) continue;
      const gap = hits[k + 1][0] - hits[k][0], mid = (hits[k][0] + hits[k + 1][0]) / 2;
      if (gap < 2.2 && Math.abs(mid) < 2.2 && (!best || Math.abs(mid) < Math.abs(best.mid))) best = { k, mid };
    }
    if (!best) continue;
    const k = best.k, h = (j) => hits[j][0];
    const la = [k > 0 && hits[k - 1][1] === 3 && h(k) - h(k - 1) < 0.8 ? h(k - 1) : h(k) - 0.3, h(k)];
    const ra = [h(k + 1), k + 2 < hits.length && hits[k + 2][1] === 4 && h(k + 2) - h(k + 1) < 0.8 ? h(k + 2) : h(k + 1) + 0.3];
    L[gi * W + gj] = { la, ra, mid: best.mid };
  }
  // the gap's middle, smoothed over 0.3 cm and kept inside each line's gap; and each line's share
  // of neighbours that cross the septum
  const cellOf = (i, j) => (i >= 0 && i < W && j >= 0 && j < W ? L[i * W + j] : null);
  for (let gi = 0; gi < W; gi++) for (let gj = 0; gj < W; gj++) {
    const c = L[gi * W + gj];
    if (!c) continue;
    let s = 0, w = 0, nb = 0;
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const q = cellOf(gi + a, gj + b);
      if (Math.abs(a) <= 1 && Math.abs(b) <= 1 && q) nb++;
      if (!q) continue;
      const k = Math.exp(-((a * a + b * b) * STEP * STEP) / (2 * 0.3 * 0.3));
      s += k * q.mid; w += k;
    }
    c.m = clamp(s / w, c.la[1], c.ra[0]);
    c.v = smooth(nb / 9);
  }
  /** The sum over the four lines round (x, y) of bilinear weight, times v, times fn(line, h). */
  const along = (x, y, h, fn) => {
    const fx = x / STEP + M, fy = y / STEP + M, i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
    let s = 0;
    for (const [di, dj, k] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
      const c = cellOf(i0 + di, j0 + dj);
      if (c && k > 0) s += k * c.v * fn(c, h);
    }
    return s;
  };
  const mid = (x, y) => {
    const w = along(x, y, 0, () => 1);
    return w > 1e-6 ? along(x, y, 0, (c) => c.m) / w : 0;
  };
  const out = { reach, xyh, along, mid, e1, e2 };
  SEPTA.set(myo, out);
  return out;
}
/**
 * A line's map along the septum's axis that closes the gap: h to h', piecewise linear and
 * rising, so no two points pass each other. The LA's wall moves whole until its RA face lies on
 * the gap's middle, the RA's wall until its LA face does; the blood within SEPT.band cm on either
 * side stretches or squeezes to make up, and points past it keep their place.
 */
function closeGap(c, h) {
  const b = SEPT.band, tl = c.la[1] - c.la[0], tr = c.ra[1] - c.ra[0];
  const X = [c.la[0] - b, c.la[0], c.la[1], c.ra[0], c.ra[1], c.ra[1] + b];
  const Y = [c.la[0] - b, c.m - tl, c.m, c.m, c.m + tr, c.ra[1] + b];
  if (h <= X[0] || h >= X[5]) return h;
  let k = 0;
  while (k < 4 && h > X[k + 1]) k++;
  const u = X[k + 1] > X[k] ? (h - X[k]) / (X[k + 1] - X[k]) : 0;
  return Y[k] + (Y[k + 1] - Y[k]) * u;
}
/** A line's share of a move of the septum as one: 1 over both walls, none past SEPT.band cm from them. */
function septBand(c, h) {
  const b = SEPT.band;
  if (h < c.la[0]) return smooth(1 - (c.la[0] - 0.1 - h) / (b - 0.1));
  if (h > c.ra[1]) return smooth(1 - (h - c.ra[1] - 0.1) / (b - 0.1));
  return 1;
}
/** Each myocardial vertex within reach cm of the septum's axis through the site: [i, x, y, h, r]. */
function nearSeptum(meshes, S, reach) {
  const sp = septumOf(meshes, S, reach), pos = meshes.Myocardium.geometry.attributes.position.array, out = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const [x, y, h] = sp.xyh([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), r = Math.hypot(x, y);
    if (r < reach && Math.abs(h) < 4) out.push([i, x, y, h, r]);
  }
  return { sp, list: out };
}
/** A zero target on the meshes that the septum's targets leave as they are, so every mesh knows the key. */
function zeroOthers(meshes, key, H) {
  for (const name of ['Pericardium', 'Coronaries', 'Papillary']) if (meshes[name]) H.addTarget(meshes[name], `dx_${key}`, new Float32Array(meshes[name].geometry.attributes.position.array.length));
}

/**
 * tcFossa: the fossa ovalis as one thin wall. The mesh's atrial septum is the LA's wall and the
 * RA's wall with a gap between them. Round the puncture site, on each line along the septum's
 * axis, the two walls move toward the middle of the gap there until they meet (closeGap): each
 * moves whole, so it keeps its thickness, and nothing passes anything else. All of the gap
 * closes within FOSSA.full of FOSSA.r from the site, and none past FOSSA.r. A static shape.
 */
async function buildFossa(ctx, key, H) {
  const { meshes } = ctx;
  const S = punctureOf({ heart: { meshes }, anat: ctx.anat });
  const myo = meshes.Myocardium, t = new Float32Array(myo.geometry.attributes.position.array.length);
  const { sp, list } = nearSeptum(meshes, S, FOSSA.r);
  for (const [i, x, y, h, r] of list) {
    const k = (1 - smooth((r / FOSSA.r - FOSSA.full) / (1 - FOSSA.full))) * sp.along(x, y, h, (c, hh) => closeGap(c, hh) - hh);
    t[3 * i] = k * S.Nias[0]; t[3 * i + 1] = k * S.Nias[1]; t[3 * i + 2] = k * S.Nias[2];
  }
  H.addTarget(myo, `dx_${key}`, t);
  zeroOthers(meshes, key, H);
}

/**
 * tcTent: the fossa round the puncture site moved toward the LA, a cone with a round top: the
 * septum as one (both walls, by the same amount on each line, septBand), so the fossa (tcFossa)
 * stays one wall.
 */
async function buildTent(ctx, key, H) {
  const { meshes } = ctx;
  const S = punctureOf({ heart: { meshes }, anat: ctx.anat });
  const myo = meshes.Myocardium, t = new Float32Array(myo.geometry.attributes.position.array.length), toLA = mul(S.Nias, -1);
  const { sp, list } = nearSeptum(meshes, S, TENT.r);
  for (const [i, x, y, h, r] of list) {
    // the septum stretched over the sheath's tip
    const k = TENT.h * (1 - r / TENT.r) ** 1.25 * sp.along(x, y, h, septBand);
    t[3 * i] = k * toLA[0]; t[3 * i + 1] = k * toLA[1]; t[3 * i + 2] = k * toLA[2];
  }
  H.addTarget(myo, `dx_${key}`, t);
  zeroOthers(meshes, key, H);
}

/**
 * tcSepLa: the septum moves as one when the LA grows (phenomesh.js DISEASE.la). The LA target
 * moves the LA's wall, and the RA's wall less, where it lies near the LA (phenomesh.js laNear),
 * so the two walls of the septum would slide apart. Weighted as the LA target is, this target
 * gives both walls on each line the LA target's move of the fossa's middle there (H.laAt, a
 * point's move at weight 1 as the LA's own wall takes it), in place of their own (H.laShift(i),
 * vertex i's move at weight 1): the fossa stays one wall in a large LA, and the septum bows
 * toward the RA. Over the fossa and SEP_LA.out cm round it, fading out over SEP_LA.fade cm.
 */
const SEP_LA = { out: 0.6, fade: 1.2 };
async function buildSepLa(ctx, key, H) {
  const { meshes } = ctx;
  const S = punctureOf({ heart: { meshes }, anat: ctx.anat });
  const myo = meshes.Myocardium, t = new Float32Array(myo.geometry.attributes.position.array.length);
  const r0 = FOSSA.r + SEP_LA.out;
  const { sp, list } = nearSeptum(meshes, S, r0 + SEP_LA.fade);
  const tick = slicer();
  for (const [i, x, y, h, r] of list) {
    if ((i & 255) === 0) await tick();
    const w = sp.along(x, y, h, septBand) * (1 - smooth((r - r0) / SEP_LA.fade));
    if (!(w > 1e-4)) continue;
    const at = add(S.P, add(add(mul(sp.e1, x), mul(sp.e2, y)), mul(S.Nias, sp.mid(x, y))));
    const d = mul(sub(H.laAt(at), H.laShift(i)), w);
    t[3 * i] = d[0]; t[3 * i + 1] = d[1]; t[3 * i + 2] = d[2];
  }
  H.addTarget(myo, `dx_${key}`, t);
  zeroOthers(meshes, key, H);
}

/**
 * Where the clip holds a leaflet point i, for arms deg degrees apart, on the clip at rest:
 * { P, w } (the held point and how much of the hold applies there), from the point's natural
 * position nat. The clip's hinge lies CLIP.hinge below Q; each arm runs from the hinge at half
 * the angle from the clip's axis (N), toward its own leaflet (Ac for the anterior one). The
 * leaflet's last CLIP.ins cm lie along the arm, its tip CLIP.r0 from the hinge; the part above
 * runs from the arm's end to the hinge on the annulus and keeps its own shape near the annulus.
 */
function held(site, i, nat, deg) {
  const { N, Ac, Bc, Q } = site, s = site.side[i], phi = (deg / 2) * DEG;
  // each arm turns about its own pivot, CLIP.pivot to its side of the clip's axis
  const Hc = add(add(Q, mul(N, -CLIP.hinge)), mul(Ac, CLIP.ant + s * CLIP.pivot));
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

/** A hold target: the leaflets in the clip with its arms deg apart, for the open, middle and shut leaflets. */
async function buildHold(ctx, key, site, deg, H) {
  const mesh = ctx.meshes.MitralValve, g = mesh.geometry, base = g.attributes.position.array;
  const dict = mesh.morphTargetDictionary, MP = g.morphAttributes.position;
  const mid = MP[dict.leaflets_mid].array, far = MP[dict.leaflets].array;
  const ed = new Float32Array(base.length), em = new Float32Array(base.length), ef = new Float32Array(base.length);
  const tick = slicer();
  for (let i = 0; i < site.n; i++) {
    if ((i & 255) === 0) await tick();
    if (!site.leaf[i]) continue;
    if (Math.abs(site.b[i]) > CLIP.armW / 2 + CLIP.lat) continue;
    const o = [base[3 * i], base[3 * i + 1], base[3 * i + 2]];
    const om = add(o, [mid[3 * i], mid[3 * i + 1], mid[3 * i + 2]]), of = add(o, [far[3 * i], far[3 * i + 1], far[3 * i + 2]]);
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
 * tcGrasp (120), tcHalf (60) and tcClip (0), blended by the angle, times cap.
 */
export function holdWeights(deg, cap) {
  const out = { tcGrasp: 0, tcHalf: 0, tcClip: 0 };
  if (!(cap > 0)) return out;
  const a = clamp(deg, 0, 120);
  if (a >= 60) { const u = (a - 60) / 60; out.tcGrasp = cap * u; out.tcHalf = cap * (1 - u); }
  else { const u = a / 60; out.tcHalf = cap * u; out.tcClip = cap * (1 - u); }
  return out;
}

// ---------------------------------------------------------------- meshes
/** A closed tube along the polyline pts (world cm) of radius r (a number or a function of the share along it), nr sides, capped at both ends. */
export function tube(pts, r, nr = 14) {
  const m = pts.length;
  if (m < 2) return { pos: new Float32Array(0), idx: [] };
  // parallel-transport frames along the line
  const T = pts.map((p, k) => unit(sub(pts[Math.min(m - 1, k + 1)], pts[Math.max(0, k - 1)])));
  let e1 = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  e1 = unit(sub(e1, mul(T[0], dot(e1, T[0]))));
  const F1 = [e1];
  for (let k = 1; k < m; k++) {
    const prev = F1[k - 1], t = T[k];
    F1.push(unit(sub(prev, mul(t, dot(prev, t)))));
  }
  const L = [0];
  for (let k = 1; k < m; k++) L.push(L[k - 1] + len(sub(pts[k], pts[k - 1])));
  const total = L[m - 1] || 1;
  const rad = typeof r === 'function' ? (k) => r(L[k] / total) : () => r;
  const pos = new Float32Array((m * nr + 2) * 3), idx = [];
  for (let k = 0; k < m; k++) {
    const e = F1[k], f = cross(T[k], e), rr = rad(k);
    for (let j = 0; j < nr; j++) {
      const th = (2 * Math.PI * j) / nr, c = Math.cos(th), s = Math.sin(th);
      pos.set(add(pts[k], add(mul(e, rr * c), mul(f, rr * s))), 3 * (k * nr + j));
    }
  }
  for (let k = 0; k + 1 < m; k++) for (let j = 0; j < nr; j++) {
    const j1 = (j + 1) % nr, a = k * nr + j, b = k * nr + j1, c = (k + 1) * nr + j, d = (k + 1) * nr + j1;
    idx.push(a, c, b, b, c, d);
  }
  const c0 = m * nr, c1 = m * nr + 1;
  pos.set(pts[0], 3 * c0);
  pos.set(pts[m - 1], 3 * c1);
  for (let j = 0; j < nr; j++) {
    const j1 = (j + 1) % nr;
    idx.push(c0, j1, j);
    idx.push(c1, (m - 1) * nr + j, (m - 1) * nr + j1);
  }
  return { pos, idx };
}

/** A closed box: centre c, unit axes ax (length), ay (width), az (thickness) and half sizes hx, hy, hz; rounded ends when round. */
export function box(c, ax, ay, az, hx, hy, hz) {
  const pos = new Float32Array(8 * 3), idx = [];
  let k = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pos.set(add(c, add(mul(ax, sx * hx), add(mul(ay, sy * hy), mul(az, sz * hz)))), 3 * k++);
  }
  // vertex (sx, sy, sz) at 4*(sx>0) + 2*(sy>0) + (sz>0)
  const q = (a, b, c2, d) => idx.push(a, b, c2, a, c2, d);
  q(0, 1, 3, 2); q(4, 6, 7, 5); q(0, 4, 5, 1); q(2, 3, 7, 6); q(0, 2, 6, 4); q(1, 5, 7, 3);
  return { pos, idx };
}

/** Points of a cubic Bezier from p0 to p3 with handles p1 and p2, n segments. */
export function bezier(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push(add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t))));
  }
  return out;
}
/** Points of a Catmull-Rom spline through pts, n segments per span. */
export function spline(pts, n = 10) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
/** The part of polyline pts from share a to share b of its length. */
export function trim(pts, a, b) {
  const L = [0];
  for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + len(sub(pts[k], pts[k - 1])));
  const T = L[L.length - 1] || 1, A = clamp(a, 0, 1) * T, B = clamp(b, 0, 1) * T;
  if (B - A < 1e-4) return [];
  const at = (s) => {
    let k = 1;
    while (k < L.length - 1 && L[k] < s) k++;
    const u = (s - L[k - 1]) / Math.max(1e-9, L[k] - L[k - 1]);
    return lerp(pts[k - 1], pts[k], clamp(u, 0, 1));
  };
  const out = [at(A)];
  for (let k = 0; k < pts.length; k++) if (L[k] > A && L[k] < B) out.push(pts[k]);
  out.push(at(B));
  return out;
}
/** The length of polyline pts. */
export function lengthOf(pts) {
  let s = 0;
  for (let k = 1; k < pts.length; k++) s += len(sub(pts[k], pts[k - 1]));
  return s;
}

// ---------------------------------------------------------------- the pose
/**
 * The chapter's state as the device's pose (all optional, defaults at rest):
 * sept 0..1, the transseptal sheath pushed on the fossa (tenting at 1); cross 0..1, the guide
 * across the septum into the LA; steer 0..1, the clip steered from the guide's tip to the valve;
 * depth (cm), the clip's hinge above (+) or below (-) Q along N; rot (deg), the arms' turn from
 * square to the line of coaptation; arm (deg), the angle between the arms; grip 0..1, the
 * grippers down; cap 0..1, the leaflets held; rel 0..1, the clip released and the delivery
 * catheter drawn back into the guide; out 0..1, the guide drawn back from the LA into the RA
 * (to 0.5) and down to the IVC; gone > 0, the guide out of the body; show > 0, any device at all.
 */
/** The venae cavae's points (views.js VESSELS): the IVC where it meets the RA, and the SVC. */
export const CAVA = { ivc: [-3.3, -4.4, 2.4], svc: [-3.06, 4.81, 2.2] };

export const REST_POSE = { sept: 0, cross: 0, steer: 0, depth: 1.6, rot: 0, arm: 0, grip: 0, cap: 0, rel: 0, out: 0, gone: 0, show: 0 };

/**
 * The device in world cm for the heart drawn: its parts as closed meshes, and its frames.
 * site: siteOf; punct: punctureOf; motion: the valve's motion from rest to this frame
 * ({ map(p), dir(v) }: a rigid map, valveMotion) for the clip once it holds the leaflets, and
 * the septum's (septumMotion) for the crossing; pose: as REST_POSE; along: a plane the route in
 * the RA keeps to; clear(p, room): the point p moved off the walls by room cm (the route's
 * clearance). Returns { parts: { name: { pos, idx } }, clip: { H, a, e, w, phi } | null, path }.
 */
export function deviceOf(site, punct, pose0, motion = null, sept = null, cava = CAVA, along = null, clear = null) {
  const pose = { ...REST_POSE, ...pose0 };
  const parts = {};
  if (!(pose.show > 0)) return { parts, clip: null };
  const idMap = { map: (p) => p, dir: (v) => v };
  const vm = motion || idMap, sm = sept || idMap;
  // the route to the septum: up the IVC (abdomen.js ABD.ivc) into the RA, along the line of the
  // venae cavae to the height of the fossa, then across to it, square to the septum
  const nRA = punct.Nias, S = sm.map(punct.P), nRAm = unit(sm.dir(nRA));
  const E = cava.ivc, up = unit(sub(cava.svc, cava.ivc));
  // along: a plane ({ O, n }, world arrays) that the route in the RA keeps to, so the bicaval
  // view through the puncture site shows the sheath along its length
  const onto = (p) => (along ? sub(p, mul(along.n, dot(sub(p, along.O), along.n))) : p);
  const Ein = onto(E);
  const M = onto(add(E, mul(up, Math.max(0.8, dot(sub(S, E), up) - 0.4))));
  const near = onto(add(S, mul(nRAm, 0.9)));
  let route = spline([[-2.0, -15.5, -2.0], [-2.5, -8.5, -0.6], [-2.9, -5.6, 1.4], Ein, lerp(M, near, 0.35), near, S], 8);
  // clear: the walls' clearance (a function of a point and the room it needs, that gives the
  // point moved off the walls); the route keeps to the lumen of the IVC and the RA, but for its
  // last 1.4 cm, where it meets the septum. A pass of smoothing takes out the kinks.
  if (clear) {
    const room = CATH.guide + 0.15, free = (p) => len(sub(p, S)) > 1.4;
    for (let it = 0; it < 3; it++) {
      route = route.map((p) => (free(p) ? clear(p, room) : p));
      if (it < 2) route = route.map((p, i) => (i === 0 || i === route.length - 1 || !free(p) ? p : mul(add(add(route[i - 1], route[i + 1]), mul(p, 2)), 0.25)));
    }
  }
  // the guide's reach past the septum into the LA: 1.6 cm when across, less as it is drawn back
  // (out 0 to 0.5); then it comes back down the route (out 0.5 to 1) to the IVC
  const out = clamp(pose.out, 0, 1);
  const reach = 1.6 * clamp(pose.cross, 0, 1) * (1 - smooth(out / 0.5));
  const back = clamp((out - 0.5) / 0.5, 0, 1);
  const tS = mul(nRAm, -1);   // across the septum, into the LA
  const G = add(S, mul(tS, reach));
  // before the guide crosses: the transseptal sheath, its dilator and needle push on the fossa.
  // S follows the septum (sept: its motion, the tent too), so the tip sits just under the tent's top
  if (pose.cross <= 0) {
    const tip = add(S, mul(tS, -0.2));
    const sheath = [...route.slice(0, -1), tip];
    parts.sheath = tube(trim(sheath, 0, 1), CATH.sheath);
    return { parts, clip: null, path: sheath };
  }
  // the guide from the IVC, through the septum, to its tip in the LA; drawn back past the
  // septum it ends in the RA, then in the IVC
  const guidePath = reach > 0.05 ? [...route, G] : trim(route, 0, 1 - 0.45 * back);
  parts.guide = tube(guidePath, (u) => (u > 0.9 ? CATH.guide : CATH.guide * 1.09));
  // a clip that holds the leaflets stays on them when the guide comes back; none is out before
  const held = clamp(pose.cap, 0, 1) >= 0.999;
  if (reach <= 0.05 && !held) return { parts, clip: null, path: guidePath };
  // the clip: steered from the guide's tip (pointing on along it) to above Q, square to the
  // annulus; then down along N to its depth. Its axis a points back up the catheter.
  const steer = clamp(pose.steer, 0, 1);
  const N = site.N, Q = site.Q;
  const aFree = unit(lerp(mul(tS, -1), N, smooth(steer)));
  const over = add(add(Q, mul(N, pose.depth)), mul(site.Ac, CLIP.ant));
  const Hfree = lerp(add(G, mul(tS, 1.2 + CLIP.bodyL)), over, smooth(steer));
  const rot = pose.rot * DEG;
  const eRest = turn(site.Ac, N, rot);
  // the held clip moves with the valve; a free one keeps its place
  const k = clamp(pose.cap, 0, 1);
  const Hm = vm.map(Hfree), am = unit(vm.dir(aFree)), em = unit(vm.dir(eRest));
  const Hc = lerp(Hfree, Hm, k), a = unit(lerp(aFree, am, k));
  let e = unit(lerp(steer < 1 ? unit(sub(eRest, mul(aFree, dot(eRest, aFree)))) : eRest, em, k));
  e = unit(sub(e, mul(a, dot(e, a))));
  const w = cross(a, e);
  const phi = (clamp(pose.arm, 0, 240) / 2) * DEG;
  const top = add(Hc, mul(a, CLIP.bodyL));
  // body: a rod from just below the hinge to the top, and a collar at the top
  parts.body = tube([add(Hc, mul(a, -0.1)), add(Hc, mul(a, 0.05)), top], (u) => (u < 0.06 ? CLIP.bodyR * 0.75 : CLIP.bodyR), 12);
  // the arms: from the hinge, at phi from the axis toward each side, the inner face against the leaflet
  for (const [name, s] of [['armA', 1], ['armP', -1]]) {
    const d = add(mul(a, Math.cos(phi)), mul(e, s * Math.sin(phi)));
    const nrm = sub(mul(a, Math.sin(phi)), mul(e, s * Math.cos(phi)));
    // each arm turns about its own pivot, CLIP.pivot to its side of the axis, so the closed
    // clip holds both leaflets and both grippers between its arms
    const Hs = add(Hc, mul(e, s * CLIP.pivot));
    const c = add(add(Hs, mul(d, CLIP.armL / 2 + 0.02)), mul(nrm, -CLIP.armT / 2));
    parts[name] = box(c, d, w, nrm, CLIP.armL / 2, CLIP.armW / 2, CLIP.armT / 2);
    // the gripper: from near the hinge, up against the body (0) or down on its arm (1)
    const psi = clamp(pose.grip, 0, 1) * phi;
    const dg = add(mul(a, Math.cos(psi)), mul(e, s * Math.sin(psi)));
    const ng = sub(mul(a, Math.sin(psi)), mul(e, s * Math.cos(psi)));
    const lift = (1 - clamp(pose.grip, 0, 1)) * (CLIP.bodyR + CLIP.gripT);
    const cg = add(add(Hs, mul(dg, CLIP.gripL / 2 + 0.1)), mul(ng, CLIP.gripT / 2 + CLIP.off * 2 + lift * 0));
    parts[name === 'armA' ? 'gripA' : 'gripP'] = box(cg, dg, w, ng, CLIP.gripL / 2, CLIP.gripW / 2, CLIP.gripT / 2);
  }
  // the delivery catheter and the steerable sleeve from the guide's tip to the clip's top; after
  // release the catheter draws back into the guide
  const rel = clamp(pose.rel, 0, 1);
  let curve = [];
  if (reach > 0.05 && rel < 0.999) {
    const end = lerp(top, add(G, mul(tS, 0.3)), smooth(rel));
    const endDir = unit(lerp(a, mul(tS, -1), smooth(rel)));
    const lead = Math.min(1.4, 0.45 * len(sub(end, G)) + 0.2);
    curve = bezier(G, add(G, mul(tS, lead)), add(end, mul(endDir, lead)), end, 28);
    const L = lengthOf(curve);
    if (L > 0.15) {
      const sl = clamp((L - 1.2) / L, 0.2, 0.75);
      parts.sleeve = tube(trim(curve, 0, sl), CATH.sleeve, 12);
      parts.dc = tube(curve, CATH.dc, 10);
    }
  }
  // gone: the guide out of the body (the TTE after the procedure)
  if (pose.gone > 0) delete parts.guide;
  return { parts, clip: { H: Hc, a, e, w, phi, top }, path: [...guidePath, ...curve] };
}

// ---------------------------------------------------------------- motion of the valve and the septum
/**
 * The rigid motion that carries the mitral annulus from the shape the site was found on to its
 * place in this frame: from the ring's vertices in rest (the base mesh, world space) to the same
 * vertices in pos (the morphed valve, echo.js MeshData.pos). { map(p), dir(v) }.
 */
export function valveMotion(site, rest, pos) {
  const fr = (P) => {
    const pts = site.ringIdx.map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    const pl = planeOfPts(pts);
    let n = pl.n;
    if (dot(n, site.N) < 0) n = mul(n, -1);
    // the aortic side: the ring's vertices nearest A0 at rest
    let ant = [0, 0, 0];
    for (const p of pts) { const d = sub(p, pl.c); ant = add(ant, mul(d, Math.max(0, dot(unit(d), site.A0)) ** 4)); }
    const e = unit(sub(ant, mul(n, dot(ant, n)))), w = cross(n, e);
    return { c: pl.c, e, w, n };
  };
  const A = fr(rest), B = fr(pos);
  const dir = (v) => add(add(mul(B.e, dot(v, A.e)), mul(B.w, dot(v, A.w))), mul(B.n, dot(v, A.n)));
  return { map: (p) => add(B.c, dir(sub(p, A.c))), dir };
}
/**
 * The leaflets that the clip holds, put on its arms in this frame. The hold targets (tcGrasp,
 * tcHalf, tcClip) put them there on the rest valve, at three arm angles; the heart's shapes, the
 * disease targets and the blend between the three angles move them up to 2 mm off the arms,
 * through the metal. This puts each held point where held() puts it on the clip as drawn (clip:
 * deviceOf's { H, a, e, w, phi }): the last CLIP.ins cm of each leaflet on its arm, faded across
 * the clip as the targets fade; the part above takes the move of the arm's end, faded out over
 * 0.6 cm. pos: the morphed valve (world cm), changed in place; share: how much the clip holds (cap).
 */
export function snapHeld(site, pos, clip, share) {
  if (!clip || !(share > 0)) return;
  const { H, a, e, w, phi } = clip, half = CLIP.armW / 2;
  const move = new Map(), ends = new Map(), bin = (s, b) => `${s}|${Math.round(b / 0.1)}`;
  for (let i = 0; i < site.n; i++) {
    if (!site.leaf[i] || site.ell[i] > CLIP.ins || Math.abs(site.b[i]) > half + CLIP.lat) continue;
    const s = site.side[i], b = site.b[i], bh = clamp(b, -half, half);
    const d = add(mul(a, Math.cos(phi)), mul(e, s * Math.sin(phi))), nrm = sub(mul(a, Math.sin(phi)), mul(e, s * Math.cos(phi)));
    // the lateral axis w is a x e, -Bc on the rest clip: held()'s Bc * b
    const T = add(add(add(add(H, mul(e, s * CLIP.pivot)), mul(d, CLIP.r0 + site.ell[i])), mul(nrm, CLIP.off)), mul(w, -bh));
    const m = sub(T, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
    move.set(i, m);
    if (site.ell[i] > CLIP.ins - 0.2) {
      const k = bin(s, b), q = ends.get(k) || { m: [0, 0, 0], n: 0 };
      q.m = add(q.m, m); q.n++;
      ends.set(k, q);
    }
  }
  for (let i = 0; i < site.n; i++) {
    if (!site.leaf[i] || Math.abs(site.b[i]) > half + CLIP.lat) continue;
    let m = move.get(i);
    if (!m) {
      const u = (site.ell[i] - CLIP.ins) / 0.6;
      if (u >= 1) continue;
      let q = null;
      for (const db of [0, 1, -1, 2, -2]) { q = ends.get(`${site.side[i]}|${Math.round(site.b[i] / 0.1) + db}`); if (q) break; }
      if (!q) continue;
      m = mul(q.m, (1 - smooth(u)) / q.n);
    }
    const k = share * (1 - smooth((Math.abs(site.b[i]) - half) / CLIP.lat));
    pos[3 * i] += k * m[0]; pos[3 * i + 1] += k * m[1]; pos[3 * i + 2] += k * m[2];
  }
}
/** The motion of the septum near the puncture: the move of its RA-face vertex, no turn. */
export function septumMotion(punct, rest, pos) {
  const mv = (i) => [pos[3 * i] - rest[3 * i], pos[3 * i + 1] - rest[3 * i + 1], pos[3 * i + 2] - rest[3 * i + 2]];
  // the mean of the two faces' moves: the fossa's merge (tcFossa) moves them toward each other
  const d = punct.idxL != null ? mul(add(mv(punct.idx), mv(punct.idxL)), 0.5) : mv(punct.idx);
  return { map: (p) => add(p, d), dir: (v) => v };
}

// ---------------------------------------------------------------- the echo
/**
 * The echo of each part (dB against myocardium): fill, its bright edge (spec), the shadow it
 * casts, and reverberation behind faces that meet the beam. The clip is metal under polyester
 * fabric; the catheters are polymer over a braid of wire, hollow: their fill is the lumen.
 */
export const TONE = {
  clip: { e: 24, spec: 8, shadow: 14, reverb: { n: 3, step: 0.2, e: 10, fade: 6, w: 0.06 } },
  grip: { e: 20, spec: 6, shadow: 6 },
  // a catheter is a hollow tube: bright walls round a dark lumen (lumen, dB), not a solid band
  cath: { e: 16, spec: 7, shadow: 9, lumen: -24, reverb: { n: 2, step: 0.18, e: 8, fade: 5, w: 0.06 } },
};
const PART_TONE = { body: 'clip', armA: 'clip', armP: 'clip', gripA: 'grip', gripP: 'grip', dc: 'cath', sleeve: 'cath', guide: 'cath', sheath: 'cath' };

/** Copies of the lines L moved along the beam, away from the probe, by k steps of step cm. */
function echoes(L, k, step) {
  return L.map((P) => P.map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [x + (x / l) * k * step, y + (y / l) * k * step]; }));
}
/** The runs of the loops L that face the probe: segments more than 45 degrees from the beam. */
function facing(L) {
  const out = [];
  for (const P of L) {
    let run = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ml = Math.hypot(mx, my) || 1;
      const c = tl > 1e-9 ? Math.abs(tx * mx + ty * my) / (tl * ml) : 1;
      if (c < Math.SQRT1_2) { if (!run.length) run.push(a); run.push(b); } else if (run.length) { if (run.length > 1) out.push(run); run = []; }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/**
 * The device's parts cut on plane g (echo.js: O, r, d, n), as B-mode items (bmode.js). cut:
 * gl/prostheticmesh.js cutMesh. Returns { items, loops: { name: [loop] } }.
 */
export function deviceItems(dev, g, cut, slab = 0) {
  const items = [], loops = {};
  // slab: the beam's thickness across the plane (cm, each side). A device a little off the plane
  // still echoes, fainter: the cuts at -slab and +slab add to the cut on the plane.
  const offs = slab > 0 ? [0, -slab, slab] : [0];
  const moved = (off) => {
    if (!off) return g;
    const O = arr(g.O), n = arr(g.n), P = add(O, mul(n, off));
    return { ...g, O: g.O && g.O.isVector3 ? g.O.clone().set(P[0], P[1], P[2]) : P };
  };
  for (const [name, mesh] of Object.entries(dev.parts)) {
    if (!mesh.pos.length) continue;
    const T = TONE[PART_TONE[name] || 'cath'];
    for (const off of offs) {
      const L = cut(mesh, moved(off)).filter((x) => x.closed && x.pts.length > 2).map((x) => x.pts);
      if (!L.length) continue;
      const e = off ? T.e - 4 : T.e;
      if (!off) loops[name] = L;
      items.push({ polys: L, e: T.lumen ?? e, shadow: off ? T.shadow * 0.5 : T.shadow }, { borders: L, e, spec: off ? 0 : T.spec, w: T.lumen != null ? 0.07 : 0.05, closed: true, all: true });
      if (!off && T.reverb) {
        const back = facing(L), Rv = T.reverb;
        if (back.length) for (let k = 1; k <= Rv.n; k++) items.push({ lines: echoes(back, k, Rv.step), e: Rv.e - Rv.fade * (k - 1), w: Rv.w });
      }
    }
  }
  return { items, loops };
}
