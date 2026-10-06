// Transesophageal echocardiography (chapter TEE): the esophagus, the probe and the standard views
// of Hahn 2013, cut from the heart mesh. World cm, the model's frame: x to the patient's left,
// y to the head, z to the front (echo.js BODY). No DOM here: ch/tee.js draws.
//
// The probe frame at the transducer: F, the beam axis (square to the face); u, along the tip
// toward the mouth; t = u x F, the array at 0 degrees. Image display (Hahn 2013, Figure 2): the
// transducer at the top of the sector, so the near field is posterior at the mid-esophageal
// level. At 0 degrees the plane is square to the tip (transverse) and screen-right is t: with
// the probe facing forward, the patient's left, so the patient's right is on the left of the
// display. Forward rotation turns screen-right toward u, so at 90 degrees the left of the display
// is inferior; at 180 degrees the image is the mirror image of 0 degrees.
import * as THREE from '../vendor/three.bundle.min.js';
import { phenoWeights } from './gl/heart.js';
import { VESSELS } from './views.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0), FRONT = V3(0, 0, 1), LEFT = V3(1, 0, 0);
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const nz = (v) => v.clone().normalize();
/** v made square to a (a unit), normalized. */
const sq = (v, a) => v.clone().addScaledVector(a, -v.dot(a)).normalize();

/** The esophagus's radius and the transducer face's offset from its centre line, toward the heart (cm). */
export const R_ESO = 0.8, FACE = 0.45;
/** The probe tip in the stomach: its radius for the clearance test, and its gap below the heart (cm). */
const R_TG = 0.75, TG_GAP = 2.0;

// ---------------------------------------------------------------- the probe frame
/**
 * The plane of the multiplane angle ang (degrees) for probe frame f = { O, F, t, u }: the beam
 * axis d = F, screen-right r = t cos(ang) + u sin(ang), normal n = r x d (echo.js viewGeometry).
 */
export function planeAt(f, ang) {
  const a = rad(ang);
  const r = f.t.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.u, Math.sin(a)).normalize();
  const d = f.F.clone();
  const n = new THREE.Vector3().crossVectors(r, d).normalize();
  return { O: f.O.clone(), d, r, n };
}

/**
 * The probe frame that shows plane (O, F, r) at angle ang: the inverse of planeAt. With
 * w = F x r, t = r cos(ang) - w sin(ang) and u = r sin(ang) + w cos(ang).
 */
export function frameFor(O, F, r, ang) {
  const a = rad(ang), w = new THREE.Vector3().crossVectors(F, r);
  const t = r.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, -Math.sin(a)).normalize();
  const u = r.clone().multiplyScalar(Math.sin(a)).addScaledVector(w, Math.cos(a)).normalize();
  return { O: O.clone(), F: F.clone(), t, u };
}

/** A frame facing F with the tip along up (the esophagus): t = u x F, nothing flexed sideways. */
export function frameFacing(O, F, up) {
  const Fn = nz(F), u = sq(up, Fn);
  const t = new THREE.Vector3().crossVectors(u, Fn).normalize();
  return { O: O.clone(), F: Fn, t, u };
}

/** Frame a to frame b by k (0 to 1): the position along a straight line, the turn by slerp. */
export function mixFrames(a, b, k) {
  const q = (f) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, f.u, f.F));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q(a).slerp(q(b), k));
  const t = V3(), u = V3(), F = V3();
  m.extractBasis(t, u, F);
  return { O: a.O.clone().lerp(b.O, k), F, t, u };
}

// ---------------------------------------------------------------- the heart's points
/**
 * The shown heart's myocardium and pericardium at end-diastole and end-systole, world cm, from
 * an EchoView's mesh data (echo.js MeshData): the clearance tests and the vessels below read them.
 */
export function heartPoints(ev) {
  const P = ev.heart, out = {};
  for (const [key, md] of [['myo', ev.myo], ['peri', ev.peri]]) {
    if (!md) continue;
    const ed = [], es = [];
    for (const [s, list] of [[0, ed], [1, es]]) {
      const w = { amyloid: P ? P.a : 0, systole: s, amyloid_systole: (P ? P.a : 0) * s, ...phenoWeights(Object.keys(md.dict), P, s) };
      md.morph(w, false);
      list.push(Float32Array.from(md.pos));
    }
    out[key] = { ed: ed[0], es: es[0] };
  }
  const col = ev.myo.mesh.geometry.attributes.color;
  const n = ev.myo.count;
  out.region = new Uint8Array(n);
  if (col) for (let i = 0; i < n; i++) out.region[i] = Math.round(col.getX(i) * 10);
  return out;
}

/** Points in a grid of cells, for the distance to the nearest point. */
class Cloud {
  constructor(arrays, cell = 0.6) {
    this.cell = cell;
    this.g = new Map();
    this.pts = [];
    for (const a of arrays) for (let i = 0; i < a.length; i += 3) this.add(a[i], a[i + 1], a[i + 2]);
  }
  key(x, y, z) { return `${x},${y},${z}`; }
  add(x, y, z) {
    const c = this.cell, k = this.key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
    if (!this.g.has(k)) this.g.set(k, []);
    this.g.get(k).push(x, y, z);
  }
  /** Distance from p to the nearest point, up to rMax (Infinity beyond). */
  dist(p, rMax = 2) {
    const c = this.cell, cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c), reach = Math.ceil(rMax / c);
    let best = rMax * rMax;
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
      const L = this.g.get(this.key(cx + dx, cy + dy, cz + dz));
      if (!L) continue;
      for (let i = 0; i < L.length; i += 3) {
        const ex = L[i] - p.x, ey = L[i + 1] - p.y, ez = L[i + 2] - p.z, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < best) best = d2;
      }
    }
    return best >= rMax * rMax ? Infinity : Math.sqrt(best);
  }
}

// ---------------------------------------------------------------- the esophagus
/**
 * The esophagus's centre line in the normal heart, head to stomach (world cm): behind the
 * aortic arch on its right; down behind the RPA and the LA, right of the descending aorta (the
 * aorta lies behind it and to its left, Hahn 2013); then in front of the aorta and to the left,
 * to the hiatus and the cardia below the heart. For another heart each point moves back until
 * the tube clears that heart, and from y -2.4 to 2.4 cm the tube lies on the LA's back wall.
 */
export const ESO = [
  [-0.9, 15.0, -4.0], [-1.1, 11.0, -4.3], [-1.5, 7.0, -4.3], [-1.8, 4.0, -4.6], [-1.8, 2.0, -5.0],
  [-1.8, 0.0, -5.25], [-1.6, -2.0, -4.9], [-0.8, -3.6, -4.4], [0.2, -5.0, -3.6], [0.6, -6.0, -2.4],
];
const ON_LA = [-2.4, 2.4];   // y: the band where the tube lies on the heart

/**
 * The esophagus of the heart in pts (heartPoints): { curve (head to cardia), cloud, pts }.
 * In the band ON_LA a design point keeps its x and y and comes forward from 6 cm behind until
 * the tube meets the heart. The band's mean shift back (a large LA pushes the esophagus back)
 * moves the points next to it too, fading to none 6 cm from the band. A point that would then
 * meet the heart takes the least move back and to the right that clears it, and stays in front
 * of the middle of the descending aorta (desc, its centre line): the aorta lies behind the
 * esophagus and to its left.
 */
export function esophagus(pts, desc = []) {
  const cloud = new Cloud([pts.myo.ed, pts.myo.es, ...(pts.peri ? [pts.peri.ed, pts.peri.es] : [])]);
  const clear = (q) => cloud.dist(q, R_ESO + 0.5) >= R_ESO;
  // the moves tried, the least first: back (dz) and to the right (dx), 1 mm apart
  if (!MOVES) {
    MOVES = [];
    for (let i = 0; i <= 30; i++) for (let k = 0; k <= 40; k++) MOVES.push([-0.1 * i, -0.1 * k]);
    MOVES.sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2);
  }
  // the band first: from 6 cm behind each design point forward, to the last point that clears
  // the heart; the band's mean shift back then carries the points next to it, fading over 6 cm
  const inBand = (y) => y >= ON_LA[0] && y <= ON_LA[1];
  const zs = ESO.map(([x, y, z0]) => {
    if (!inBand(y)) return null;
    let z = z0 - 6;
    for (let zz = z0 - 6; zz <= z0 + 2; zz += 0.05) { if (clear(V3(x, y, zz))) z = zz; else break; }
    return z;
  });
  const shifts = ESO.map(([, , z0], i) => (zs[i] === null ? null : zs[i] - z0)).filter((d) => d !== null);
  const shift = Math.min(0, shifts.reduce((a, d) => a + d, 0) / Math.max(1, shifts.length));
  const out = [];
  for (const [i, [x, y, zd]] of ESO.entries()) {
    if (zs[i] !== null) { out.push(V3(x, y, zs[i])); continue; }
    const gap = y > ON_LA[1] ? y - ON_LA[1] : ON_LA[0] - y;
    const A = lineAt(desc, y), zMin = A ? A.z : -Infinity;
    const z0 = Math.max(zd + shift * Math.max(0, 1 - gap / 6), Math.min(zd, zMin));
    let p = V3(x, y, z0);
    if (!clear(p)) {
      const m = MOVES.find(([dx, dz]) => z0 + dz >= zMin && clear(V3(x + dx, y, z0 + dz)));
      if (m) p = V3(x + m[0], y, z0 + m[1]);
      else { let z = z0; while (!clear(V3(x, y, z)) && z > z0 - 6) z -= 0.05; p.z = z; }
    }
    out.push(p);
  }
  // the band's points may stand in a row: smooth z along the line once
  const sm = out.map((p, i) => (i > 0 && i < out.length - 1 ? V3(p.x, p.y, Math.min(p.z, (out[i - 1].z + 2 * p.z + out[i + 1].z) / 4)) : p.clone()));
  const curve = new THREE.CatmullRomCurve3(sm, false, 'centripetal');
  return { curve, cloud, pts: sm };
}
let MOVES = null;

/** The point of the esophagus at height y, and the tangent there toward the head. */
export function eso(E, y) {
  // the curve's height falls monotonically from the head: bisect on its parameter
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (E.curve.getPoint(m).y > y) lo = m; else hi = m; }
  const s = (lo + hi) / 2;
  const P = E.curve.getPoint(s), T = E.curve.getTangent(s).negate().normalize();
  return { P, T, s };
}

// ---------------------------------------------------------------- the vessels
/**
 * Vertex sets of the myocardium mesh, picked once on its base shape by region (1 LV, 2 RV, 3 LA,
 * 4 RA, 5 aorta, 6 PA, 7 veins) and place: the descending aorta and the aortic arch, the
 * ascending aorta and the venae cavae. A heart's own shape moves the same vertices, so each
 * set follows the heart shown. The mesh's LA has no appendage (a smooth sac): no set for it.
 */
function vertexSets(base, region) {
  const n = region.length, sets = { desc: [], arch: [], asc: [], svc: [], ivc: [] };
  for (let i = 0; i < n; i++) {
    const x = base[3 * i], y = base[3 * i + 1], z = base[3 * i + 2], r = region[i];
    if (r === 5 && z < -3.0 && y < 8.5) sets.desc.push(i);
    if (r === 5 && y > 8.5) sets.arch.push(i);
    if (r === 5 && y > 2.6 && y < 8.5 && z > -1.0 && x < 0.5) sets.asc.push(i);
    if (r === 7 && x < -1.8 && y > 2.6 && z > 0.5) sets.svc.push(i);
    if (r === 7 && x < -1.4 && y < -1.6 && z > 0.5) sets.ivc.push(i);
  }
  return sets;
}
/** A vessel's centre line from a vertex set: the mean of its vertices in slices along `along` (1 cm). */
function centreLine(pos, idx, along = UP, step = 1) {
  const bins = new Map();
  for (const i of idx) {
    const p = V3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    const k = Math.round(p.dot(along) / step);
    if (!bins.has(k)) bins.set(k, { s: V3(), n: 0 });
    const b = bins.get(k);
    b.s.add(p);
    b.n++;
  }
  return [...bins.entries()].filter(([, b]) => b.n >= 6).sort((a, b) => a[0] - b[0]).map(([, b]) => b.s.multiplyScalar(1 / b.n));
}
/** The point of polyline L at height y (linear between its points), or null. */
function lineAt(L, y) {
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.clone().lerp(b, (y - a.y) / (b.y - a.y));
  }
  return null;
}

let SETS = null;
/**
 * The geometry of the heart shown, for the probe and the labels: landmarks, axes, the esophagus,
 * the vessels, and where the probe lies in the stomach. ev: the chapter's
 * EchoView (echo.js), whose mesh data and landmarks follow the heart of the Heart menu.
 */
export function teeAnatomy(ev) {
  const pts = heartPoints(ev);
  if (!SETS) SETS = vertexSets(ev.myo.base, pts.region);
  const A = ev.anat, p = (k) => A.point(k, 0, 0);
  const G = {
    mv: p('mv'), tv: p('tv'), av: p('av'), pv: p('pv'), apex: p('apex_epi'), apexEndo: p('apex_endo'), eq: p('lv_eq'), la: p('la_c'), ra: p('ra_c'),
    Z: A.axis.clone(), X: A.lateral.clone(), Y: A.anterior.clone(), root: A.aorticRoot.clone(),
  };
  const ed = pts.myo.ed;
  G.desc = centreLine(ed, SETS.desc);
  G.asc = centreLine(ed, SETS.asc);
  G.svc = centreLine(ed, SETS.svc);
  G.ivc = centreLine(ed, SETS.ivc);
  // the arch: the centre of its section at each height, from 9 cm up (it runs front to back there)
  G.archPts = SETS.arch.map((i) => V3(ed[3 * i], ed[3 * i + 1], ed[3 * i + 2]));
  G.E = esophagus(pts, G.desc);
  // the transgastric probe: from 9 cm below the LV's middle at the papillary muscles, along the
  // LV's anterior axis, up to where the tip meets the heart (the gastric wall and the diaphragm)
  G.lvc = G.eq.clone().lerp(G.apexEndo, 0.15);
  let P = G.lvc.clone().addScaledVector(G.Y, -9);
  for (let k = 0; k < 160; k++) {
    const q = P.clone().addScaledVector(G.Y, 0.05);
    if (G.E.cloud.dist(q, R_TG + 0.5) < R_TG) break;
    P = q;
  }
  // the stomach's wall and the diaphragm lie between the tip and the heart: the tip stays
  // TG_GAP further down, so the LV's middle lies about 5 cm from it (Hahn 2013, view 17)
  G.tg = P.addScaledVector(G.Y, -TG_GAP);
  return G;
}

// ---------------------------------------------------------------- the standard views
// Each view's plane comes from the heart shown: a plane through the transducer O that holds the
// structures the guideline lists, the beam F toward the view's centre, and screen-right r as the
// guideline's figure has it. frameFor then gives the probe frame that shows the plane at the
// view's angle. Where the frame's tip axis leans from the esophagus, the probe is flexed.

/** The transducer on the esophagus at height y, its face toward target (F from there). */
function onEso(G, y, target) {
  const { P, T } = eso(G.E, y);
  let F = nz(target.clone().sub(P));
  const O = P.clone().addScaledVector(F, FACE);
  F = nz(target.clone().sub(O));
  return { O, F, T, P };
}
/** In-plane screen-right: square to F in the plane of normal n, on the side of want. */
function rightIn(n, F, want) {
  const r = new THREE.Vector3().crossVectors(n, F).normalize();
  return r.dot(want) < 0 ? r.negate() : r;
}
/** The height of the esophagus point whose transducer lies in the plane (C, n), toward C. */
function heightOnPlane(G, C, n, y0, y1) {
  const f = (y) => { const { P } = eso(G.E, y); const F = sq(C.clone().sub(P), n); return n.dot(P.clone().addScaledVector(F, FACE).sub(C)); };
  let a = y0, b = y1, fa = f(a);
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2, fm = f(m); if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}

/**
 * The mid-esophageal plane of the four-chamber view (Hahn 2013, view 2): the probe behind the LA,
 * 0.9 cm above its centre, the beam toward the LV apex; the plane holds the apex and the centre of
 * the tricuspid valve (the largest tricuspid annulus). The frame that shows it at the four-chamber
 * angle, the beam on the apex, is the frame of views 3 to 5; view 2 turns its beam (POSE.me4c).
 */
function meMitral(G) {
  const { O, F, T } = onEso(G, G.la.y + 0.9, G.apex);
  const n = new THREE.Vector3().crossVectors(G.apex.clone().sub(O), G.tv.clone().sub(O)).normalize();
  return { O, F, r: rightIn(n, F, G.mv.clone().sub(G.tv)), T };
}

/** Plane makers by view: { O, F, r, T } with r the screen-right of the view at its angle. */
const POSE = {
  // the four-chamber view: the plane of meMitral, the beam turned toward the crux so that the
  // crux and the apex lie on either side of the sector's centre line, with both atria in view
  me4c(G) {
    const p = meMitral(G);
    const crux = G.mv.clone().lerp(G.tv, 0.5);
    const at = (P) => { const q = P.clone().sub(p.O); return Math.atan2(q.dot(p.r), q.dot(p.F)); };
    const a = (at(G.apex) + at(crux)) / 2, c = Math.cos(a), si = Math.sin(a);
    const F = p.F.clone().multiplyScalar(c).addScaledVector(p.r, si).normalize();
    const r = p.r.clone().multiplyScalar(c).addScaledVector(p.F, -si).normalize();
    return { O: p.O, F, r, T: p.T };
  },
  // the mitral commissural, two-chamber and long-axis views: the frame that shows the plane of
  // meMitral at the four-chamber angle, the beam toward the apex, rotated forward from there
  memitral(G) { return { ...meMitral(G), ang: 5 }; },
  // the aortic valve in short axis: square to the root where the shut cusps meet; the left
  // coronary cusp, posterior and on the patient's left, to the right of the display
  meavsax(G) {
    const C = G.av.clone().addScaledVector(G.root, 0.6), n = G.root.clone();
    const y = heightOnPlane(G, C, n, G.av.y - 3, G.av.y + 4);
    const { P, T } = eso(G.E, y);
    const F = sq(C.clone().sub(P), n), O = P.clone().addScaledVector(F, FACE);
    return { O, F: sq(C.clone().sub(O), n), r: rightIn(n, sq(C.clone().sub(O), n), LEFT), T };
  },
  // RV inflow and outflow round the aortic valve: the plane of the tricuspid and pulmonic
  // valves, the probe a little lower than for the valve in short axis; RVOT to the right
  merv(G) {
    const C = G.av.clone().addScaledVector(G.root, 0.6);
    const y = heightOnPlane(G, C, G.root, G.av.y - 3, G.av.y + 4) - 0.6;
    const { O, T } = onEso(G, y, C);
    const n = new THREE.Vector3().crossVectors(G.tv.clone().sub(O), G.pv.clone().sub(O)).normalize();
    const F = sq(C.clone().sub(O), n);
    return { O, F, r: rightIn(n, F, G.pv.clone().sub(G.tv)), T };
  },
  // both venae cavae and the atrial septum; the SVC to the right of the display (superior)
  mebicaval(G) {
    const S = lineAt(G.svc, G.ra.y + 3.5) || G.svc[G.svc.length - 1], I = lineAt(G.ivc, G.ra.y - 3) || G.ivc[0];
    const ias = G.la.clone().lerp(G.ra, 0.5);
    const { O, T } = onEso(G, G.la.y + 1.2, ias);
    const n = new THREE.Vector3().crossVectors(S.clone().sub(O), I.clone().sub(O)).normalize();
    const F = sq(ias.clone().sub(O), n);
    return { O, F, r: rightIn(n, F, S.clone().sub(I)), T };
  },
  // the aortic valve, the LVOT and the proximal ascending aorta in long axis: the plane of the
  // root's axis; the aorta to the right of the display
  meavlax(G) {
    const C = G.av.clone();
    const { O, T } = onEso(G, G.av.y + 0.2, C);
    const n = new THREE.Vector3().crossVectors(G.root, C.clone().sub(O)).normalize();
    const F = sq(C.clone().sub(O), n);
    return { O, F, r: rightIn(n, F, G.root), T };
  },
  // the LV in short axis at the papillary muscles, from the stomach: the inferior wall in the
  // near field, the septum on the left of the display and the lateral wall on the right
  tgsax(G) {
    const F = nz(G.lvc.clone().sub(G.tg)), O = G.tg.clone().addScaledVector(F, 0.3);
    const n = G.Z.clone();
    return { O, F: sq(F, n), r: rightIn(n, sq(F, n), G.X), T: null };
  },
  // the descending aorta, the probe just above the diaphragm turned to face it
  dao(G) {
    const y = -3.0, A = lineAt(G.desc, y) || G.desc[0];
    const { O, F, T } = onEso(G, y, A);
    return { O, F: sq(F, T), T, direct: true };   // the face square to the tube: no flexion
  },
  // the aortic arch from the upper esophagus, the probe turned to face it
  uearch(G) {
    const top = G.archPts.reduce((m, q) => Math.max(m, q.y), -Infinity);
    const y = top - 1.6;
    const sec = G.archPts.filter((q) => Math.abs(q.y - y) < 0.5);
    const C = sec.reduce((s, q) => s.add(q), V3()).multiplyScalar(1 / Math.max(1, sec.length));
    // the arch's course at this height: the long axis of its section, seen from above
    let xx = 0, xz = 0, zz = 0;
    for (const q of sec) { const dx = q.x - C.x, dz = q.z - C.z; xx += dx * dx; xz += dx * dz; zz += dz * dz; }
    const th = 0.5 * Math.atan2(2 * xz, xx - zz), a = V3(Math.cos(th), 0, Math.sin(th));
    const { P, T } = eso(G.E, y);
    // the point of the arch's axis that the line of sight meets at a right angle
    const C1 = C.clone().addScaledVector(a, -C.clone().sub(P).dot(a));
    const F = sq(C1.clone().sub(P), T), O = P.clone().addScaledVector(F, FACE);
    return { O, F, T, direct: true };
  },
  // the ascending aorta at the right pulmonary artery, which lies behind it
  measc(G) {
    const y = VESSELS.rpaMid[1] + 0.2, A = lineAt(G.asc, y) || G.asc[G.asc.length - 1];
    const { O, F, T } = onEso(G, y, A);
    return { O, F: sq(F, T), T, direct: true };
  },
};

/**
 * The standard views shown, in the order of Hahn 2013 (Table 10; its number in hahn). level:
 * ue, me or tg; turn: left, mid or right (the slot of the figure's switches); angle: the
 * multiplane angle at which the figure shows the view; range: the guideline's angle;
 * pose: the plane maker; frame: a view whose frame this view shares (its angle differs);
 * reeves: one of the 11 views of the basic perioperative examination (Reeves 2013, Figure 1).
 */
export const STD = [
  { key: 'me4c', hahn: 2, reeves: true, name: 'ME four-chamber', short: 'ME 4C', level: 'me', turn: 'mid', angle: 5, depth: 15, range: [0, 10], pose: 'me4c' },
  { key: 'memc', hahn: 3, reeves: false, name: 'ME mitral commissural', short: 'ME MC', level: 'me', turn: 'mid', angle: 60, depth: 15, range: [50, 70], pose: 'memitral' },
  { key: 'me2c', hahn: 4, reeves: true, name: 'ME two-chamber', short: 'ME 2C', level: 'me', turn: 'mid', angle: 85, depth: 15, range: [80, 100], frame: 'memc' },
  { key: 'melax', hahn: 5, reeves: true, name: 'ME long axis', short: 'ME LAX', level: 'me', turn: 'mid', angle: 140, depth: 15, range: [120, 140], frame: 'memc' },
  { key: 'meavlax', hahn: 6, reeves: false, name: 'ME aortic valve long axis', short: 'ME AV LAX', level: 'me', turn: 'right', angle: 120, depth: 11, range: [120, 140], pose: 'meavlax' },
  { key: 'measclax', hahn: 7, reeves: true, name: 'ME ascending aorta long axis', short: 'ME Asc Ao LAX', level: 'ue', turn: 'right', angle: 95, depth: 11, range: [90, 110], pose: 'measc' },
  { key: 'meascsax', hahn: 8, reeves: true, name: 'ME ascending aorta short axis', short: 'ME Asc Ao SAX', level: 'ue', turn: 'right', angle: 5, depth: 11, range: [0, 30], frame: 'measclax' },
  { key: 'meavsax', hahn: 10, reeves: true, name: 'ME aortic valve short axis', short: 'ME AV SAX', level: 'me', turn: 'right', angle: 30, depth: 10, range: [25, 45], pose: 'meavsax' },
  { key: 'merv', hahn: 11, reeves: true, name: 'ME RV inflow-outflow', short: 'ME RV In-Out', level: 'me', turn: 'right', angle: 55, depth: 12, range: [50, 70], pose: 'merv' },
  { key: 'mebicaval', hahn: 13, reeves: true, name: 'ME bicaval', short: 'ME Bicaval', level: 'me', turn: 'right', angle: 95, depth: 11, range: [90, 110], pose: 'mebicaval' },
  // the short axis at 10 degrees: the frame's 90 degrees then holds the apex, the mitral valve and
  // the LA, with the aortic valve out of the plane (at 0, the plane at 90 met the aortic valve)
  { key: 'tgsax', hahn: 17, reeves: true, name: 'TG midpapillary short axis', short: 'TG Mid SAX', level: 'tg', turn: 'mid', angle: 10, depth: 12, range: [0, 20], pose: 'tgsax' },
  { key: 'tg2c', hahn: 22, reeves: false, name: 'TG two-chamber', short: 'TG 2C', level: 'tg', turn: 'mid', angle: 90, depth: 12, range: [90, 110], frame: 'tgsax' },
  { key: 'daosax', hahn: 25, reeves: true, name: 'Descending aorta short axis', short: 'Desc Ao SAX', level: 'tg', turn: 'left', angle: 0, depth: 8, range: [0, 10], pose: 'dao' },
  { key: 'daolax', hahn: 26, reeves: true, name: 'Descending aorta long axis', short: 'Desc Ao LAX', level: 'tg', turn: 'left', angle: 90, depth: 8, range: [90, 100], frame: 'daosax' },
  { key: 'uearchlax', hahn: 27, reeves: false, name: 'UE aortic arch long axis', short: 'UE Arch LAX', level: 'ue', turn: 'mid', angle: 0, depth: 8, range: [0, 10], pose: 'uearch' },
  { key: 'uearchsax', hahn: 28, reeves: false, name: 'UE aortic arch short axis', short: 'UE Arch SAX', level: 'ue', turn: 'mid', angle: 70, depth: 11, range: [70, 90], frame: 'uearchlax' },
];
export const BY_KEY = Object.fromEntries(STD.map((v) => [v.key, v]));

/**
 * The probe frame of each view on heart G: { key: { O, F, t, u, T } }. A view with a plane
 * maker gets the frame that shows its plane at its angle; the angle of an unflexed probe
 * (natural) and the flexion that the frame takes are kept for the readouts and the checks.
 */
export function framesOf(G) {
  const out = {};
  for (const v of STD) {
    if (!v.pose) continue;
    const p = POSE[v.pose](G);
    // an unflexed probe (direct): its frame faces F with the tip along the esophagus
    const f = p.direct ? frameFacing(p.O, p.F, p.T) : frameFor(p.O, p.F, p.r, p.ang ?? v.angle);
    f.T = p.T;
    if (p.T && !p.direct) {
      // an unflexed probe facing F: its tip along the esophagus; the angle at which it shows r
      const u0 = sq(p.T, p.F), t0 = new THREE.Vector3().crossVectors(u0, p.F).normalize();
      f.natural = (deg(Math.atan2(p.r.dot(u0), p.r.dot(t0))) + 360) % 360;
      f.at = p.ang ?? v.angle;   // the angle at which the frame shows the pose's plane
      // the tip's lean about the beam (positive: the tip flexed to the patient's right) and its
      // flexion toward the face (positive: anteflexed) or away from it
      f.lateral = deg(Math.atan2(new THREE.Vector3().crossVectors(f.u, u0).dot(p.F), f.u.dot(u0)));
      f.ante = deg(Math.asin(Math.max(-1, Math.min(1, p.F.dot(p.T)))));
    }
    out[v.key] = f;
  }
  for (const v of STD) if (v.frame) out[v.key] = out[v.frame];
  return out;
}

// ---------------------------------------------------------------- the figure's switches
export const LEVELS = [
  { key: 'ue', short: 'UE', name: 'Upper esophageal' },
  { key: 'me', short: 'ME', name: 'Mid-esophageal' },
  { key: 'tg', short: 'TG', name: 'Transgastric' },
];
export const TURNS = [
  { key: 'left', name: 'Left', long: 'turned to the left (counterclockwise)' },
  { key: 'mid', name: 'Neutral', long: 'not turned' },
  { key: 'right', name: 'Right', long: 'turned to the right (clockwise)' },
];
/** The views of a slot of the switches, by angle. */
export function slotViews(level, turn) {
  return STD.filter((v) => v.level === level && v.turn === turn).sort((a, b) => a.angle - b.angle);
}
/** A slot with no standard view takes the level's neutral frame turned by this much (degrees). */
const TURN_EMPTY = 30;

/** Frame f turned about axis T by deg (positive: toward the patient's left), the face about the tube's centre. */
export function turnFrame(f, T, d) {
  const q = new THREE.Quaternion().setFromAxisAngle(T, rad(d));
  const c = f.O.clone().addScaledVector(f.F, -FACE);
  const F = f.F.clone().applyQuaternion(q), t = f.t.clone().applyQuaternion(q), u = f.u.clone().applyQuaternion(q);
  return { O: c.addScaledVector(F, FACE), F, t, u, T: f.T };
}

/**
 * The probe frame of slot (level, turn) at angle ang: between two standard views of the slot,
 * a mix of their frames by angle; past the slot's first or last view, that view's frame. A
 * slot with no standard view: the level's neutral frame, turned.
 */
export function slotFrame(frames, level, turn, ang) {
  const L = slotViews(level, turn);
  if (!L.length) {
    const N = slotViews(level, 'mid');
    const f = frames[N[0].key];
    const T = f.T || f.u;
    return turnFrame(f, T, turn === 'left' ? TURN_EMPTY : -TURN_EMPTY);
  }
  if (ang <= L[0].angle) return frames[L[0].key];
  for (let i = 1; i < L.length; i++) {
    if (ang <= L[i].angle) {
      const a = L[i - 1], b = L[i], fa = frames[a.key], fb = frames[b.key];
      if (fa === fb) return fa;
      const k = (ang - a.angle) / (b.angle - a.angle);
      const m = mixFrames(fa, fb, k * k * (3 - 2 * k));
      m.T = fa.T || fb.T;
      return m;
    }
  }
  return frames[L[L.length - 1].key];
}

/** The standard view of the slot within tol degrees of ang, or null; and the slot's nearest view. */
export function viewAt(level, turn, ang, tol = 4) {
  const L = slotViews(level, turn);
  let near = null;
  for (const v of L) if (!near || Math.abs(v.angle - ang) < Math.abs(near.angle - ang)) near = v;
  return { on: near && Math.abs(near.angle - ang) <= tol ? near : null, near };
}

/**
 * The probe's path, head to stomach: the esophagus, then from the cardia along the stomach to
 * the transgastric tip. { curve, length, sOf(p) }: sOf gives the arc length (cm from the top)
 * of the path point nearest p.
 */
export function probePath(G) {
  const E = G.E.pts, last = E[E.length - 1];
  const below = G.tg.clone().addScaledVector(G.Y, -1.4);
  const pts = [...E, last.clone().lerp(below, 0.5).add(V3(0, -0.4, 0)), below, G.tg.clone()];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 400, samples = curve.getSpacedPoints(N), length = curve.getLength();
  const sOf = (p) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= N; i++) { const d = samples[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
    return (best / N) * length;
  };
  return { curve, length, samples, sOf, at: (s) => curve.getPointAt(Math.max(0, Math.min(1, s / length))) };
}

/**
 * How frame f differs from the ME 4C frame f0, in the guideline's words: depth (cm advanced,
 * positive, or withdrawn), the turn about the esophagus (degrees, positive to the patient's
 * left), and the tip's flexion: ante (positive anteflexed) and lateral (positive to the right).
 */
export function maneuver(f, f0, path) {
  const s = path.sOf(f.O.clone().addScaledVector(f.F, -FACE)), s0 = path.sOf(f0.O.clone().addScaledVector(f0.F, -FACE));
  const T = f.T || f0.T;
  const az = (F) => { const h = sq(F, T); return h; };
  const h0 = az(f0.F), h = az(f.F);
  const turn = deg(Math.atan2(new THREE.Vector3().crossVectors(h0, h).dot(T), h0.dot(h)));
  const u0 = sq(T, f.F);
  const lateral = deg(Math.atan2(new THREE.Vector3().crossVectors(f.u, u0).dot(f.F), f.u.dot(u0)));
  const ante = deg(Math.asin(Math.max(-1, Math.min(1, f.F.dot(T)))));
  return { depth: s - s0, turn, lateral, ante };
}
