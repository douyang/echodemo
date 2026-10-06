// The inflow cannula of a left ventricular assist device in the LV apex of the heart shown
// (chapter Left ventricular assist devices, ch/lvad.js). The cannula is a titanium tube. It runs
// from just outside the epicardial apex into the LV cavity. It points at the middle of the
// mitral valve, as an appropriately placed cannula does (Stainback 2015; Estep 2024). The pump
// lies outside the heart, and echocardiography does not show its impeller (Estep 2024), so the
// pump is not drawn. In each frame the tube is built on the apex and the mitral valve of the
// heart shown, with the chapter's disease on them. It is then cut on the view's plane. The cut
// returns as B-mode items (bmode.js): the lumen as blood, and the metal wall bright with a shadow
// behind it. Reverberation lies behind the faces that meet the beam.
// The tube's sizes are a drawing: no source in the chapter gives them, and the page prints none.
// Lengths in cm, in the heart model's world space; plane points are [u, v] cm (echo.js toPlane).
import { cutMesh } from './prostheticmesh.js';

/**
 * The tube: r, its outer radius; wall, the metal's thickness; out, its length outside the
 * epicardial apex (to where the pump would sit); inside, its length in the cavity past the
 * endocardial apex.
 */
export const CANNULA = { r: 0.8, wall: 0.18, out: 0.3, inside: 1.3 };

/**
 * The echo of the tube (dB against myocardium): the metal, its bright edges and the shadow behind
 * it. The reverberation lies behind the faces that meet the beam: n copies, step cm apart along
 * the beam, from e dB, each fade dB fainter. The mechanical valve of chapter Prosthetic valves
 * draws its own the same way (gl/prostheticmesh.js TONE).
 */
export const CTONE = { metal: 26, edge: 8, shadow: 10, reverb: { n: 4, step: 0.2, e: 16, fade: 5, w: 0.08 } };

const v3 = (p) => [p.x, p.y, p.z];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * The cannula at systolic weight s on view ev, after its heart and disease are set. u: its axis,
 * from the epicardial apex toward the middle of the mitral valve. B: its base, outside the apex.
 * T: its tip, in the cavity. e1 and e2: two directions square to the axis.
 */
export function cannulaOf(ev, s) {
  const A = ev.anat;
  const epi = v3(A.point('apex_epi', 0, s)), endo = v3(A.point('apex_endo', 0, s)), mv = v3(A.point('mv', 0, s));
  const u = unit3(sub3(mv, epi));
  // the apical wall's depth along the axis: from the epicardial apex to where the axis passes
  // the endocardial apex
  const dEndo = Math.max(0.3, dot3(sub3(endo, epi), u));
  const a0 = -CANNULA.out, a1 = dEndo + CANNULA.inside;
  let e1 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  e1 = unit3(sub3(e1, u.map((x) => x * dot3(e1, u))));
  const e2 = cross3(u, e1);
  const at = (a) => [epi[0] + a * u[0], epi[1] + a * u[1], epi[2] + a * u[2]];
  return { u, e1, e2, epi, a0, a1, B: at(a0), T: at(a1), at };
}

/**
 * A closed surface of revolution round the cannula's axis. The profile, a closed path of
 * [radius, distance along the axis] points, turns round the axis in nu steps. Its cut on a plane
 * is a set of closed loops.
 */
function revolve(C, profile, nu = 48) {
  const nv = profile.length, pos = new Float32Array(nu * nv * 3), idx = [];
  for (let i = 0; i < nu; i++) {
    const t = (2 * Math.PI * i) / nu, c = Math.cos(t), sn = Math.sin(t);
    for (let j = 0; j < nv; j++) {
      const [r, a] = profile[j], P = C.at(a);
      pos.set([P[0] + r * (c * C.e1[0] + sn * C.e2[0]), P[1] + r * (c * C.e1[1] + sn * C.e2[1]), P[2] + r * (c * C.e1[2] + sn * C.e2[2])], 3 * (i * nv + j));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const i1 = (i + 1) % nu, j1 = (j + 1) % nv;
    const a = i * nv + j, b = i1 * nv + j, c = i * nv + j1, d = i1 * nv + j1;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}

/** A closed path along the sides of a rectangle in (radius, axial) coordinates, with n points per long side. */
function ring(r0, r1, a0, a1, n = 36) {
  const P = [];
  for (let k = 0; k < n; k++) P.push([r1, a0 + ((a1 - a0) * k) / n]);
  for (let k = 0; k < 3; k++) P.push([r1 + ((r0 - r1) * k) / 3, a1]);
  for (let k = 0; k < n; k++) P.push([r0, a1 + ((a0 - a1) * k) / n]);
  for (let k = 0; k < 3; k++) P.push([r0 + ((r1 - r0) * k) / 3, a0]);
  return P;
}

/**
 * The runs of the loops L that face the probe (at the plane's origin): segments more than 45
 * degrees from the beam through their middle. Only these send the beam back and reverberate.
 */
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
/** Copies of the lines L moved along the beam, away from the probe, by k steps of step cm. */
function echoes(L, k, step) {
  return L.map((P) => P.map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [x + (x / l) * k * step, y + (y / l) * k * step]; }));
}

/**
 * The cannula C cut on plane g, as B-mode items. The lumen draws as blood, so it covers the wall
 * that the cannula passes through. The metal wall has bright edges and a shadow, and
 * reverberation lies behind the faces that meet the beam. For the overlays it also returns the
 * lumen's loops (lumen) and the metal's (metal).
 */
export function cannulaCut(C, g) {
  const R = CANNULA.r, ri = R - CANNULA.wall, T = CTONE;
  const lumen = cutMesh(revolve(C, ring(0.001, ri, C.a0, C.a1)), g).filter((x) => x.closed && x.pts.length > 2).map((x) => x.pts);
  const metal = cutMesh(revolve(C, ring(ri, R, C.a0, C.a1)), g).filter((x) => x.closed && x.pts.length > 2).map((x) => x.pts);
  const items = [];
  if (lumen.length) items.push({ polys: lumen, e: -60, blood: true });
  if (metal.length) {
    items.push({ polys: metal, e: T.metal, shadow: T.shadow }, { borders: metal, e: T.metal, spec: T.edge, w: 0.05, closed: true, all: true });
    const back = facing(metal), Rv = T.reverb;
    if (back.length) for (let k = 1; k <= Rv.n; k++) items.push({ lines: echoes(back, k, Rv.step), e: Rv.e - Rv.fade * (k - 1), w: Rv.w });
  }
  return { items, lumen, metal };
}

/** A world point [x, y, z] on plane g: [u, v] cm. */
export const onG = (g, p) => { const x = p[0] - g.O.x, y = p[1] - g.O.y, z = p[2] - g.O.z; return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z]; };
/** How far a world point lies off plane g (cm). */
export const offG = (g, p) => (p[0] - g.O.x) * g.n.x + (p[1] - g.O.y) * g.n.y + (p[2] - g.O.z) * g.n.z;
