// Complications of myocardial infarction on the heart mesh (chapter 'mi'). Lengths in cm.
//
// Two disease targets, built through phenomesh.js DISEASE (entries miAneu and miFlail):
//
// miAneu: a true LV aneurysm at the apex. Below a hinge level, the apical endocardium moves onto
// a sphere at weight 1. The sphere's section at the hinge is the LV cavity there, and its
// diameter is that width / ANEU_RATIO, so the aneurysm's mouth is wide (Gatewood 1980). The wall
// keeps ANEU_THIN of its thickness. The move fades in over ANEU_FADE of the LV's length below the
// hinge, so the aneurysm's wall runs on from the normal wall. The pericardium and the LV's
// papillary muscles move with the wall next to them. The apex landmarks move with the wall, so
// the apical views keep the probe 1.6 cm from the apex (echo.js viewGeometry). It is a static
// shape: the chapter weights it with echo.js setDisease.
//
// miFlail: a flail anterior mitral leaflet after rupture of the posteromedial papillary muscle.
// That muscle holds the medial half of both leaflets (Karagodin 2020). On the shut valve, the
// anterior leaflet from just lateral of A2's middle to the posteromedial commissure turns past
// a fold line FLAIL_AT of the way down from its hinge. It turns by FLAIL_DEG degrees at weight 1
// about the annulus's tangent, so its free edge points into the left atrium. The chordae next to
// it go with it. It is a move within the beat (echo.js setMotion), as hcmmesh.js builds hcmSam.
//
// Two lesions drawn on the plane in each frame, as the septal defects of gl/shuntsmesh.js:
//
// The ventricular septal rupture: a disc through the apical septum, its middle and axis in the
// plane of the view that measures it, drawn as blood over the septum (echo.js setShapes).
//
// The pseudoaneurysm: a neck through the inferolateral wall (a disc, as the septal rupture) and a
// sac outside the wall. The sac on the plane is a circle round a point beyond the epicardium,
// bounded by the heart's outer surface where the circle reaches it, so it runs on behind the
// intact wall next to the neck (Gatewood 1980). Its wall is the pericardium, drawn bright, with a
// layer of thrombus inside its far side. The neck and the sac exist only on the plane of the view;
// the 3D heart does not show them.

import { DB } from '../bmode.js';
import { wallFrame, planeOf, cutOf, axisOnPlane, throughWall } from './shuntsmesh.js';
import { section } from './massesmesh.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];

// region of a myocardial vertex: its colour x 10 (gl/phenomesh.js)
const LV = 1, RV = 2;

// ---------------------------------------------------------------- the normal mesh, found once
/** The myocardium's world positions and regions on the normal mesh of model. */
function myoOf(model) {
  const mesh = model.heart.meshes.Myocardium;
  mesh.updateMatrixWorld(true);
  const e = mesh.matrixWorld.elements, P = mesh.geometry.attributes.position, C = mesh.geometry.attributes.color;
  const n = P.count, X = new Float32Array(3 * n), REG = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = P.getX(i), y0 = P.getY(i), z0 = P.getZ(i);
    X[3 * i] = e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12];
    X[3 * i + 1] = e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13];
    X[3 * i + 2] = e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14];
    REG[i] = C ? Math.round(C.getX(i) * 10) : 1;
  }
  return { X, REG, n };
}

/** The LV's frame on the normal heart: the epicardial apex, the long axis and its length to the mitral valve. */
function lvFrame(model) {
  const A = model.anat.normal(), Z = A.axis.clone(), apex = A.point('apex_epi', 0, 0), mv = A.point('mv', 0, 0);
  return { A, Z, apex, L: mv.clone().sub(apex).dot(Z) };
}

// The apical septum: the LV wall at levels 20% to 40% of the way from the epicardial apex to the
// mitral valve, within 32 degrees of the direction from the LV's axis to the RV's centre, and
// within 1.6 cm of the RV wall. The LAD supplies it; an anterior infarction ruptures it (Damluji 2021).
const SEPT_U = [0.2, 0.4], SEPT_WIN = 32;
// The inferolateral wall of the long axis: the LV wall at levels 58% to 78%, within 28 degrees of
// the direction in that plane square to the LV's axis, away from the septum.
const IL_U = [0.58, 0.78], IL_WIN = 28;

const SITES = new WeakMap();
/**
 * The sites of the two drawn lesions on the normal mesh of model, found once:
 * { vsr: { wall, axis }, il: { wall, axis } }. wall: myocardium vertex indices; axis: world unit
 * vector, from the LV toward the RV (vsr) or out of the LV (il).
 */
export function sitesOf(model) {
  if (SITES.has(model)) return SITES.get(model);
  const { X, REG, n } = myoOf(model), F = lvFrame(model), A = F.A;
  // the septum faces the patient's right of the LV (Anatomy.anchors: the septum and the RV lie along -lateral)
  const uRV = A.lateral.clone().negate();
  uRV.addScaledVector(F.Z, -uRV.dot(F.Z)).normalize();
  // the inferolateral direction of the long axis: in the plane of the apex and the two valves'
  // centres, square to the LV's axis, on the side away from the septum (the RV)
  const mv = A.point('mv', 0, 0), av = A.point('av', 0, 0);
  const n0 = mv.clone().sub(F.apex).cross(av.clone().sub(F.apex)).normalize();
  const w = n0.clone().cross(F.Z).normalize();
  if (w.dot(uRV) > 0) w.negate();
  // the RV wall, on a grid of 0.8 cm cells
  const cell = 0.8, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < n; i++) {
    if (REG[i] !== RV) continue;
    const k = key(X[3 * i], X[3 * i + 1], X[3 * i + 2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const nearRV = (i, r) => {
    const x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell), R = Math.ceil(r / cell);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
      for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) if (Math.hypot(X[3 * j] - x, X[3 * j + 1] - y, X[3 * j + 2] - z) < r) return true;
    }
    return false;
  };
  const cosS = Math.cos((SEPT_WIN * Math.PI) / 180), cosI = Math.cos((IL_WIN * Math.PI) / 180);
  const out = { vsr: { wall: [], axis: [uRV.x, uRV.y, uRV.z] }, il: { wall: [], axis: [w.x, w.y, w.z] } };
  for (let i = 0; i < n; i++) {
    if (REG[i] !== LV) continue;
    const qx = X[3 * i] - F.apex.x, qy = X[3 * i + 1] - F.apex.y, qz = X[3 * i + 2] - F.apex.z;
    const h = qx * F.Z.x + qy * F.Z.y + qz * F.Z.z, u = h / F.L;
    const rx = qx - h * F.Z.x, ry = qy - h * F.Z.y, rz = qz - h * F.Z.z, r = Math.hypot(rx, ry, rz) || 1;
    if (u >= SEPT_U[0] && u <= SEPT_U[1] && (rx * uRV.x + ry * uRV.y + rz * uRV.z) / r > cosS && nearRV(i, 1.6)) out.vsr.wall.push(i);
    if (u >= IL_U[0] && u <= IL_U[1] && (rx * w.x + ry * w.y + rz * w.z) / r > cosI) out.il.wall.push(i);
  }
  SITES.set(model, out);
  return out;
}

// ---------------------------------------------------------------- the septal rupture
const VSR = new WeakMap();   // each view's cut of the rupture in its last frame
/**
 * The shapes of a septal rupture of diameter dMm on a view (echo.js setShapes): the disc through
 * the apical septum as blood. Its middle and axis lie in the plane of view key (the measuring
 * view), so that plane cuts it dMm wide. The cut opens the LV into the RV through the septum and
 * stops 1.5 mm into the blood on each side (shuntsmesh.js throughWall).
 */
export function vsrShapes(dMm, key) {
  return (g, ev) => {
    VSR.delete(ev);
    if (!(dMm > 0)) return null;
    const site = sitesOf(ev.model).vsr, P = planeOf(ev, key);
    if (!P) return null;
    const f = wallFrame(ev, site, P, 0.6);
    const axis = axisOnPlane(g, f.N);
    const cut = throughWall(ev, cutOf(g, f.C, f.N, dMm / 20, 1.4), axis);
    if (!cut) return null;
    VSR.set(ev, { cut, f, axis });
    return [{ polys: [cut.poly], e: DB.blood, blood: true }];
  };
}
/** The septal rupture that view ev drew in its last frame: { cut, f, axis }, or undefined. */
export const vsrOf = (ev) => VSR.get(ev);

/** The width of a cut across its axis, through its middle: the caliper [a, b] (plane cm), or null. */
export function widthOf(D) {
  if (!D || !D.axis) return null;
  const t = perp(D.axis), c = D.cut.c, P = D.cut.poly;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], e = sub(b, a), den = t[0] * e[1] - t[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const wv = sub(a, c), lam = (wv[0] * e[1] - wv[1] * e[0]) / den, u = (wv[0] * t[1] - wv[1] * t[0]) / den;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    lo = Math.min(lo, lam); hi = Math.max(hi, lam);
  }
  return Number.isFinite(lo) ? [add(c, mul(t, lo)), add(c, mul(t, hi))] : null;
}

// ---------------------------------------------------------------- the pseudoaneurysm
/** The section's walls as segments [a, b] (plane cm). */
function wallSegs(ev) {
  const segs = [];
  for (const W of ev.last.tissue) {
    const P = W.pts, m = P.length;
    for (let i = 0; i < m - 1 + (W.closed ? 1 : 0); i++) segs.push([P[i], P[(i + 1) % m]]);
  }
  return segs;
}
/** How far the ray from C along dir runs before it meets a segment (Infinity if none). */
function cast(C, dir, segs) {
  let best = Infinity;
  for (const [a, b] of segs) {
    const e = sub(b, a), den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const wv = sub(a, C), t = (wv[0] * e[1] - wv[1] * e[0]) / den, u = (wv[0] * dir[1] - wv[1] * dir[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

// the sac's middle lies at least this share of its radius beyond the epicardium, so the sac runs
// on behind the intact wall on either side of the neck
const SAC_OFF = 0.3;
// the layer of thrombus inside the sac's far wall, as a share of the radius at its deepest
const SAC_CLOT = 0.22;
// the echo of the tissue round the sac (dB against myocardium, bmode.js DB)
const SAC_RIM = -12;
const PSEUDO = new WeakMap();
/**
 * The shapes of a pseudoaneurysm of neck n and sac diameter D (cm) on a view: the neck through
 * the inferolateral wall (as vsrShapes), the sac as blood bounded by its circle and the heart's
 * outer surface, its bright wall and the thrombus inside it. Their middles and the neck's axis lie
 * in the plane of view key, so that plane cuts the neck n wide and the sac D wide along the wall.
 * The tissue outside the sac's free wall is drawn grey, so the sac stands out from the dark field.
 */
export function pseudoShapes(n, D, key) {
  return (g, ev) => {
    PSEUDO.delete(ev);
    if (!(n > 0) || !(D > 0)) return null;
    const site = sitesOf(ev.model).il, P = planeOf(ev, key);
    if (!P) return null;
    const f = wallFrame(ev, site, P, 0.6);
    const axis = axisOnPlane(g, f.N);
    if (!axis) return null;
    const neck = throughWall(ev, cutOf(g, f.C, f.N, n / 2, 1.4), axis, 0.2);
    if (!neck || !neck.span) return null;
    // the sac's middle: past the epicardium where the neck leaves the wall
    const R = D / 2;
    const out = add(neck.p0, mul(axis, neck.span[1] - 0.2));
    const segs = wallSegs(ev), K = 144, poly = [], rim = [];
    // the middle as near the wall as lets the diameter along the wall run free of the heart, so
    // the caliper through it measures D (from SAC_OFF of the radius out, in steps of 1%)
    const t = perp(axis);
    let S = add(out, mul(axis, SAC_OFF * R));
    for (let k = SAC_OFF; k <= SAC_OFF + 0.5; k += 0.01) {
      S = add(out, mul(axis, k * R));
      if (cast(S, t, segs) >= R && cast(S, mul(t, -1), segs) >= R) break;
    }
    for (let k = 0; k < K; k++) {
      const th = (2 * Math.PI * k) / K, dir = [Math.cos(th), Math.sin(th)];
      const t = Math.min(cast(S, dir, segs), R);
      poly.push(add(S, mul(dir, t)));
      if (t >= R - 1e-6) rim.push(k);
    }
    // the bright wall: the runs of the circle that the heart does not stop
    const arcs = [];
    let run = [];
    for (let j = 0; j <= K; j++) {
      const k = j % K, on = rim.includes(k);
      if (on && j < K) run.push(poly[k]);
      else if (on && j === K && arcs.length && rim.includes(0)) { arcs[0] = [...run, ...arcs[0]]; run = []; }
      else { if (run.length > 1) arcs.push(run); run = []; }
    }
    if (run.length > 1) arcs.push(run);
    // the thrombus: a crescent inside the far wall, thickest opposite the neck, none at the ends of
    // the diameter along the wall
    const clot = [];
    const M = 48;
    for (let k = 0; k <= M; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / M, dir = add(mul(axis, Math.cos(a)), mul(perp(axis), Math.sin(a)));
      clot.push(add(S, mul(dir, R)));
    }
    for (let k = M; k >= 0; k--) {
      const a = -Math.PI / 2 + (Math.PI * k) / M, dir = add(mul(axis, Math.cos(a)), mul(perp(axis), Math.sin(a)));
      const tk = SAC_CLOT * R * Math.pow(Math.max(0, Math.cos(a)), 1.6);
      clot.push(add(S, mul(dir, R - tk)));
    }
    PSEUDO.set(ev, { neck, axis, S, R, f, poly, out });
    return [
      { polys: [neck.poly], e: DB.blood, blood: true },
      { borders: arcs, e: SAC_RIM, spec: 4, w: 1.1, top: true },
      { polys: [poly], e: DB.blood, blood: true, top: true },
      { polys: [clot], e: -9, top: true },
      { borders: [clot], e: -4, spec: 4, w: 0.05, closed: true, top: true },
      { borders: arcs, e: DB.pericardium, spec: 10, w: 0.16, top: true },
    ];
  };
}
/** The pseudoaneurysm that view ev drew in its last frame: { neck, axis, S, R, poly }, or undefined. */
export const pseudoOf = (ev) => PSEUDO.get(ev);

/**
 * The sac's diameter along the wall: the caliper through its middle square to the neck's axis,
 * across the sac's outline (plane cm), or null.
 */
export function sacCaliper(Q) {
  if (!Q) return null;
  const t = perp(Q.axis), c = Q.S, P = Q.poly;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], e = sub(b, a), den = t[0] * e[1] - t[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const wv = sub(a, c), lam = (wv[0] * e[1] - wv[1] * e[0]) / den, u = (wv[0] * t[1] - wv[1] * t[0]) / den;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    lo = Math.min(lo, lam); hi = Math.max(hi, lam);
  }
  return Number.isFinite(lo) ? [add(c, mul(t, lo)), add(c, mul(t, hi))] : null;
}

// ---------------------------------------------------------------- the aneurysm's calipers
/** Whether point q lies in the blood: inside an even number of the closed loops. */
function inBlood(loops, q) {
  let k = 0;
  for (const P of loops) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > q[1]) !== (P[j][1] > q[1]) && q[0] < ((P[j][0] - P[i][0]) * (q[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    if (c) k++;
  }
  return k % 2 === 0;
}
const ANEU_CAL = new WeakMap();
/**
 * The aneurysm's calipers on view ev at end-diastole: the rest shape (echo.js setRest, with the
 * disease) cut by the view's plane. The mouth runs across the LV cavity, square to the LV's long
 * axis, at the hinge level (ANEU_U of the LV's length above the apex). The width is the largest
 * width parallel to it below the hinge. Gatewood 1980 compares the two (Omax and Dmax). Returns
 * { mouth, width }, each [a, b] in plane cm between the endocardial borders, or null.
 */
export function aneurysmCalipers(ev) {
  const md = ev.myo, g = ev.g;
  if (!md || !md.rest || !g) return null;
  const f4 = (x) => x.toFixed(4);
  const key = [ev.heart.key, ev.heart.version, ev.dVer || 0, f4(g.O.x), f4(g.O.y), f4(g.O.z), f4(g.n.x), f4(g.n.y), f4(g.n.z)].join('|');
  const hit = ANEU_CAL.get(ev);
  if (hit && hit.key === key) return hit.out;
  const out = measureAneurysm(ev, md, g);
  ANEU_CAL.set(ev, { key, out });
  return out;
}
function measureAneurysm(ev, md, g) {
  const loops = section(md.rest, md.index, g).filter((L) => L.closed && L.pts.length > 2).map((L) => L.pts);
  const segs = [];
  for (const P of loops) for (let i = 0; i < P.length; i++) segs.push([P[i], P[(i + 1) % P.length]]);
  // the LV's axis from the heart's own landmarks, before the aneurysm moves the apex
  const A = ev.ownAnat || ev.model.anat, Z = A.axis;
  const apex = A.point('apex_epi', 0, 0), mv = A.point('mv', 0, 0);
  const L = mv.clone().sub(apex).dot(Z);
  const P3 = (h) => {
    const x = apex.x + Z.x * h - g.O.x, y = apex.y + Z.y * h - g.O.y, z = apex.z + Z.z * h - g.O.z;
    return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z];
  };
  const ax = unit(sub(P3(1), P3(0))), t = perp(ax);
  const across = (h) => {
    const C = P3(h);
    if (!inBlood(loops, C)) return null;
    const a = cast(C, t, segs), b = cast(C, mul(t, -1), segs);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a + b > 9) return null;
    return [add(C, mul(t, -b)), add(C, mul(t, a))];
  };
  const hH = ANEU_U * L, mouth = across(hH);
  if (!mouth) return null;
  let width = mouth, best = len(sub(mouth[1], mouth[0]));
  for (let h = hH - 0.05; h > -3; h -= 0.05) {
    const K = across(h);
    if (!K) { if (h < hH - 1) break; continue; }
    const w = len(sub(K[1], K[0]));
    if (w > best) { best = w; width = K; }
  }
  return { mouth, width };
}

// ---------------------------------------------------------------- the targets
// miAneu: the hinge (u, from the epicardial apex) and the fade below it. At weight 1 the
// endocardium below the hinge lies on a sphere whose width at the hinge is the LV's cavity there
// and whose largest width is that width / ANEU_RATIO, and the wall keeps ANEU_THIN of its
// thickness. The septum's side moves across the LV's axis by ANEU_SEPT of that, into the RV's
// apex. On the four-chamber view the mouth is 0.89 to 0.95 of the width by heart (src/mical.js);
// Gatewood 1980 found 0.9 to 1.0 in true aneurysms.
const ANEU_U = 0.36, ANEU_FADE = 0.08, ANEU_RATIO = 0.87, ANEU_THIN = 0.4, ANEU_SEPT = 0.85;
// miFlail: the leaflet from this angle round the annulus (deg, from the direction of the aortic
// valve, medial positive) to the commissure, the fold line, the turn at weight 1, and how much
// longer the part past the fold grows (its chordae are torn)
const FLAIL_FROM = -14, FLAIL_TO = 105, FLAIL_SOFT = 18, FLAIL_AT = 0.22, FLAIL_DEG = 105, FLAIL_LONG = 0.35;

/**
 * Build target key of kind ('aneu' or 'flail') on the meshes. ctx: phenomesh.js
 * preparePhenotypes; H: helpers of phenomesh.js { addTarget, grid, nearest }.
 */
export async function buildMi(ctx, key, kind, H) {
  const { F } = ctx;
  const tick = slicer();
  const zero = () => F.Z.clone().set(0, 0, 0);
  if (kind === 'aneu') {
    const apexMove = await buildAneurysm(ctx, key, H, tick);
    return { shift: (name) => (name === 'apex_epi' ? apexMove.epi.clone() : name === 'apex_endo' ? apexMove.endo.clone() : zero()) };
  }
  await buildFlail(ctx, key, H, tick);
  return { shift: zero };
}

/** A pause for the page every 12 ms of work, as phenomesh.js slicer. */
function slicer(ms = 12) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}

/** The aneurysm's sphere on the normal heart's frame F: its middle Cb, radius rp, the hinge's height and the cavity's radius there. */
function aneurysmGeo(F) {
  const hH = ANEU_U * F.L, rho = F.Rref(ANEU_U);
  const rp = rho / ANEU_RATIO, delta = Math.sqrt(rp * rp - rho * rho);
  return { hH, rho, rp, Cb: F.apex.clone().addScaledVector(F.Z, hH - delta) };
}

async function buildAneurysm(ctx, key, H, tick) {
  const { meshes, F, REG, mpos, nMyo } = ctx;
  const G = aneurysmGeo(F), Cb = G.Cb;
  const lev = (x, y, z) => {
    const u = ((x - F.apex.x) * F.Z.x + (y - F.apex.y) * F.Z.y + (z - F.apex.z) * F.Z.z) / F.L;
    return 1 - smooth((u - ANEU_U + ANEU_FADE) / ANEU_FADE);
  };
  // the endocardium's distance from Cb in each direction: the nearest LV vertex in bins of 4
  // degrees round Cb, then the least of each bin and its neighbours
  const NB = 90, bins = new Float32Array(NB * NB).fill(Infinity);
  const binOf = (vx, vy, vz, d) => {
    const th = Math.acos(clamp(vz / d, -1, 1)), ph = Math.atan2(vy, vx) + Math.PI;
    return [Math.min(NB - 1, Math.floor((th / Math.PI) * NB)), Math.min(NB - 1, Math.floor((ph / (2 * Math.PI)) * NB))];
  };
  const cand = [];
  for (let i = 0; i < nMyo; i++) {
    if ((i & 1023) === 0) await tick();
    if (REG[i] !== LV) continue;
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
    if (lev(x, y, z) <= 0 && lev(x - F.Z.x * 0.6, y - F.Z.y * 0.6, z - F.Z.z * 0.6) <= 0) continue;
    const vx = x - Cb.x, vy = y - Cb.y, vz = z - Cb.z, d = Math.hypot(vx, vy, vz);
    if (d < 1e-6) continue;
    const [a, b] = binOf(vx, vy, vz, d);
    bins[a * NB + b] = Math.min(bins[a * NB + b], d);
    cand.push(i);
  }
  const endoAt = (a, b) => {
    let m = Infinity;
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const aa = a + da, bb = (b + db + NB) % NB;
      if (aa < 0 || aa >= NB) continue;
      m = Math.min(m, bins[aa * NB + bb]);
    }
    return m;
  };
  const septal = F.X.clone().negate();
  /** The move of a point at distance d from Cb along unit dir, depth dw into the wall past the endocardium at de, weighted by lv. */
  const moveOf = (dir, d, de, dw, lv) => {
    const target = G.rp + ANEU_THIN * Math.max(0, dw);
    const k = (target - d) * lv;
    const m = dir.clone().multiplyScalar(k);
    // less across the axis on the septum's side
    const ax = m.dot(F.Z), rad = m.clone().addScaledVector(F.Z, -ax);
    const rl = rad.length();
    if (rl > 1e-9) {
      const c = rad.dot(septal) / rl, f = 1 - (1 - ANEU_SEPT) * smooth((c - 0.2) / 0.6);
      return F.Z.clone().multiplyScalar(ax).addScaledVector(rad, f);
    }
    return m;
  };
  const ed = new Float32Array(mpos.length);
  const dir = F.Z.clone();
  for (const i of cand) {
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2], lv = lev(x, y, z);
    if (lv <= 0) continue;
    const vx = x - Cb.x, vy = y - Cb.y, vz = z - Cb.z, d = Math.hypot(vx, vy, vz);
    const [a, b] = binOf(vx, vy, vz, d), de = endoAt(a, b);
    if (!Number.isFinite(de)) continue;
    dir.set(vx / d, vy / d, vz / d);
    const m = moveOf(dir, d, de, d - de, lv);
    ed[3 * i] = m.x; ed[3 * i + 1] = m.y; ed[3 * i + 2] = m.z;
  }
  H.addTarget(meshes.Myocardium, `dx_${key}`, ed);
  // the pericardium follows the LV wall under it: each vertex takes the move of the nearest
  // myocardium vertex within 1.2 cm when that vertex is LV wall, and none over the RV
  const GM = H.grid(mpos, null, 0.6);
  const peri = meshes.Pericardium, pp = peri.geometry.attributes.position.array, pt = new Float32Array(pp.length);
  for (let j = 0; j < pp.length / 3; j++) {
    if ((j & 255) === 0) await tick();
    const nb = H.nearest(GM, pp[3 * j], pp[3 * j + 1], pp[3 * j + 2], 1, 1.2);
    if (!nb.length || REG[nb[0][0]] !== LV) continue;
    const i = nb[0][0];
    pt[3 * j] = ed[3 * i]; pt[3 * j + 1] = ed[3 * i + 1]; pt[3 * j + 2] = ed[3 * i + 2];
  }
  H.addTarget(peri, `dx_${key}`, pt);
  // the LV's papillary muscles (region 1 of their mesh) inside the moving cavity go with the
  // endocardium next to them
  const pap = meshes.Papillary;
  if (pap) {
    const qp = pap.geometry.attributes.position.array, col = pap.geometry.attributes.color, qt = new Float32Array(qp.length);
    for (let j = 0; j < qp.length / 3; j++) {
      if (col && Math.round(col.getX(j) * 10) !== LV) continue;
      const x = qp[3 * j], y = qp[3 * j + 1], z = qp[3 * j + 2], lv = lev(x, y, z);
      if (lv <= 0) continue;
      const vx = x - Cb.x, vy = y - Cb.y, vz = z - Cb.z, d = Math.hypot(vx, vy, vz);
      const [a, b] = binOf(vx, vy, vz, d), de = endoAt(a, b);
      if (!Number.isFinite(de)) continue;
      dir.set(vx / d, vy / d, vz / d);
      const m = moveOf(dir, de, de, 0, lv);
      qt[3 * j] = m.x; qt[3 * j + 1] = m.y; qt[3 * j + 2] = m.z;
    }
    H.addTarget(pap, `dx_${key}`, qt);
  }
  // the apex's landmarks: the endocardium's and the epicardium's move along the axis
  const apexMove = (p, epi) => {
    const v = p.clone().sub(Cb), d = v.length(), [a, b] = binOf(v.x, v.y, v.z, d), de = endoAt(a, b);
    return Number.isFinite(de) ? moveOf(v.multiplyScalar(1 / d), d, de, epi ? d - de : 0, 1) : F.Z.clone().set(0, 0, 0);
  };
  return { epi: apexMove(ctx.anat.raw('apex_epi', 0, 0), true), endo: apexMove(ctx.anat.raw('apex_endo', 0, 0), false) };
}

async function buildFlail(ctx, key, H, tick) {
  const { meshes, F, anat } = ctx;
  const mesh = meshes.MitralValve, base = mesh.geometry.attributes.position.array, n = base.length / 3;
  const N = F.mvN, C = F.mvC;
  // the direction to the aortic valve in the annulus plane, and the medial direction: toward the
  // tricuspid valve, where the posteromedial commissure lies
  const A0 = F.av.clone().sub(C);
  A0.addScaledVector(N, -A0.dot(N)).normalize();
  let B0 = N.clone().cross(A0);
  const tv = anat.raw('tv', 0, 0).clone().sub(C);
  if (tv.dot(B0) < 0) B0.negate();
  const leaf = (i) => F.mvPart[i] !== F.mvRing;
  let Hd = 1e-6;
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf(i)) continue;
    const d = -((base[3 * i] - C.x) * N.x + (base[3 * i + 1] - C.y) * N.y + (base[3 * i + 2] - C.z) * N.z);
    depth[i] = Math.max(0, d);
    Hd = Math.max(Hd, depth[i]);
  }
  // the shut leaflets: the base shape and the leaflets target (phenomesh.js header)
  const far = mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary.leaflets].array;
  const turn = (v, K, th) => {
    const c = Math.cos(th), s = Math.sin(th), kv = K.dot(v);
    return v.clone().multiplyScalar(c).add(K.clone().cross(v).multiplyScalar(s)).addScaledVector(K, kv * (1 - c));
  };
  const t = new Float32Array(base.length);
  const S = F.Z.clone(), q = F.Z.clone(), h = F.Z.clone();
  const DEG = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    if (!leaf(i)) continue;
    const x = base[3 * i] - C.x, y = base[3 * i + 1] - C.y, z = base[3 * i + 2] - C.z;
    const a = Math.atan2(x * B0.x + y * B0.y + z * B0.z, x * A0.x + y * A0.y + z * A0.z) / DEG;
    // the medial anterior leaflet, faded at the sector's edges
    const aw = smooth((a - FLAIL_FROM + FLAIL_SOFT) / FLAIL_SOFT) * (1 - smooth((a - FLAIL_TO) / FLAIL_SOFT));
    const f = depth[i] / Hd;
    if (aw <= 0 || f <= FLAIL_AT) continue;
    // the shut point, its hinge on the annulus in the same direction, and the fold point between
    S.set(base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]);
    const ar = a * DEG, ur = A0.clone().multiplyScalar(Math.cos(ar)).addScaledVector(B0, Math.sin(ar));
    h.copy(C).addScaledVector(ur, F.mvR);
    q.copy(h).addScaledVector(S.clone().sub(h), FLAIL_AT / f);
    // turn about the annulus's tangent there, the free edge toward the atrium (+N)
    const K = N.clone().cross(ur).normalize();
    const b = aw * smooth((f - FLAIL_AT) / 0.15);
    const v = S.clone().sub(q);
    let th = FLAIL_DEG * DEG * b;
    if (turn(v, K, 0.3).dot(N) < v.dot(N)) th = -th;
    const P = q.clone().add(turn(v, K, th).multiplyScalar(1 + FLAIL_LONG * b));
    t[3 * i] = P.x - S.x; t[3 * i + 1] = P.y - S.y; t[3 * i + 2] = P.z - S.z;
  }
  H.addTarget(mesh, `dx_${key}`, t);
  // the chordae next to the flail part take 90% of its move, fading over 0.8 cm: the torn chordae
  // and the head of the muscle go with the leaflet
  const ch = meshes.MitralChordae;
  if (!ch) return;
  const lv = [];
  for (let i = 0; i < n; i++) if (leaf(i) && (t[3 * i] || t[3 * i + 1] || t[3 * i + 2])) lv.push(i);
  if (!lv.length) return;
  const pts = new Float32Array(lv.length * 3);
  lv.forEach((i, k) => { pts[3 * k] = base[3 * i]; pts[3 * k + 1] = base[3 * i + 1]; pts[3 * k + 2] = base[3 * i + 2]; });
  const G = H.grid(pts, null, 0.6);
  const cp = ch.geometry.attributes.position.array, cn = cp.length / 3;
  const cd = new Float32Array(cp.length);
  for (let j = 0; j < cn; j++) {
    if ((j & 127) === 0) await tick();
    const qn = H.nearest(G, cp[3 * j], cp[3 * j + 1], cp[3 * j + 2], 1, 1.2);
    if (!qn.length) continue;
    const i = lv[qn[0][0]], fade = 0.9 * (1 - smooth(Math.sqrt(qn[0][1]) / 0.8));
    for (let k = 0; k < 3; k++) cd[3 * j + k] = fade * t[3 * i + k];
  }
  H.addTarget(ch, `dx_${key}`, cd);
}
