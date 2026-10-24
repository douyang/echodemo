// Mitral transcatheter edge-to-edge repair (M-TEER) with a clip, by the transfemoral,
// transseptal route. One slider steps through the procedure, and the figure is the
// screen that the interventional echocardiographer reads at each step. The case is primary MR
// from a flail P2 (gl/clipmesh.js tcFlail), in the LA and LV of chronic severe MR: the values of
// chapter Mitral regurgitation near its severe end.
//
// The figure has four panes. The left pane shows the procedure from outside the heart: a still
// for each step, rendered in Blender from the same heart mesh and device (tools/blender/). The
// other three panes are echo images cut live from the heart mesh with the device in it: the TEE
// planes that guide each step (src/teerviews.js), the 3D TEE en face view of the valve
// (src/enface3d.js), Doppler, and TTE before and after the procedure.
//
// Between two steps the device moves: its pose (gl/clipmesh.js deviceOf) eases from one step's
// keys to the next, and the panes change half-way. The values are teaching values inside the
// ranges of the sources, not patient data.
import * as THREE from '../../vendor/three.bundle.min.js';
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV, cycleAt, mitralV } from '../cyclemodel.js';
import { Beat, cursor, rows, cols, inner, note, fit, shown as rounded, paintBands, playSeverity } from '../sev.js';
import { cal, jet, pathJet, barFor, heartShown } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { onPlane, blood, cavity, sub, add, mul, dot, unit, perp, len } from '../meshjet.js';
import { laWeight, lvSizeOf, lvByEf } from '../meshcal.js';
import { scanner } from '../scanner.js';
import { diseaseTargets, lvMask } from '../model3d.js';
import { teeAnatomy, framesOf, planeAt } from '../teeviews.js';
import * as TV from '../teerviews.js';
import * as CM from '../gl/clipmesh.js';
import { cutMesh } from '../gl/prostheticmesh.js';
import { EnFace } from '../enface3d.js';
import { valuesAt as mrValuesAt } from './mr.js';

const KEY = 'tcS';
const NYQ = 60;              // cm/s, the color scale (ASE 2017: 50-70 cm/s)
const T_SYS = 250;           // ms after the R wave: the frame held in systole when the cine is off
/** The disease keys of the chapter's heart (phenomesh.js DISEASE). */
const DISEASES = ['la', 'lvSize', 'tcFlail', 'tcFossa', 'tcSepLa', 'tcTent', 'tcGrasp', 'tcHalf', 'tcClip'];
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------------------------------------------------------------- the steps
/** The steps, as the slider's bands name them: the full name and the short one. */
export const STEPS = [
  { key: 'before', name: 'Before: TTE', short: 'TTE' },
  { key: 'septum', name: 'Transseptal puncture', short: 'Septum' },
  { key: 'steer', name: 'Steering', short: 'Steer' },
  { key: 'align', name: 'Alignment', short: 'Align' },
  { key: 'grasp', name: 'Grasping', short: 'Grasp' },
  { key: 'assess', name: 'Assessment', short: 'Assess' },
  { key: 'release', name: 'Release', short: 'Release' },
  { key: 'after', name: 'After: TTE', short: 'TTE' },
];
const LAST = STEPS.length - 1;
/** The step position (0 to 7) of the slider's value. */
export const posOf = (x) => clamp(x, 0, 1) * LAST;
/** The step shown at step position s: the nearest one. */
export const stepAt = (s) => clamp(Math.round(s), 0, LAST);

/**
 * The device's pose along the steps (gl/clipmesh.js REST_POSE), keyed at step positions and eased
 * between them, after the device's instructions for use. The sheath tents the fossa and crosses;
 * the guide sits in the LA and the clip is steered down to the valve. Above the valve the arms
 * open to 180 degrees and the clip turns until the arms lie square to the line of coaptation. The
 * arms close to 60 degrees to cross the valve, the clip goes 2 cm into the LV, opens to the
 * grasping angle of 120 degrees and comes back up under the leaflets; the grippers drop and the
 * arms close, through 60 degrees, until the leaflets meet, in a narrow V. Then the clip is
 * released and the system comes back out.
 */
const POSE_KEYS = [
  [0, { show: 0, sept: 0, cross: 0, steer: 0, depth: 1.6, rot: 35, arm: 0, grip: 0, cap: 0, rel: 0, out: 0, gone: 0 }],
  [0.5, { show: 1 }],
  [1, { sept: 1 }],
  [1.45, { sept: 0, cross: 1 }],
  [2, { steer: 1, depth: 1.5 }],
  [2.5, { arm: 180, depth: 1.3 }],
  [3, { rot: 0 }],
  [3.15, { arm: 60 }],
  [3.35, { depth: -2.0 }],
  [3.5, { arm: 120 }],
  [3.75, { depth: -CM.CLIP.hinge, cap: 1 }],
  [4, { grip: 1 }],
  [4.5, { arm: 60 }],
  [5, { arm: 15 }],
  [5.5, { rel: 1 }],
  [6, { out: 1 }],
  [6.6, { gone: 1 }],
  [7, {}],
];
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** The keys filled forward, so each key holds every field. */
const FULL = (() => {
  const out = [];
  let cur = {};
  for (const [s, k] of POSE_KEYS) { cur = { ...cur, ...k }; out.push([s, { ...cur }]); }
  return out;
})();
/** The device's pose at step position s. */
export function poseAt(s) {
  if (s <= FULL[0][0]) return { ...FULL[0][1] };
  for (let i = 1; i < FULL.length; i++) {
    const [s1, b] = FULL[i];
    if (s > s1) continue;
    const [s0, a] = FULL[i - 1], u = ease((s - s0) / (s1 - s0)), o = {};
    for (const k of Object.keys(b)) o[k] = a[k] + (b[k] - a[k]) * u;
    return o;
  }
  return { ...FULL[FULL.length - 1][1] };
}
const poseKey = (p) => Object.values(p).map((x) => Math.round(x * 1000)).join(',');

// ---------------------------------------------------------------- the values
// Before: the severe primary MR of chapter Mitral regurgitation near its severe end, with a flail
// P2, a specific sign of severe MR. After: one clip at A2-P2, two small residual jets and the
// mean gradient across the double orifice (teaching values).
const BEFORE = mrValuesAt(0.82);
/** The double orifice's area after the clip (cm², the two orifices together). */
const MVA_AFTER = 2.4;
/** The stroke volume through the mitral valve after the clip (mL): the forward volume and the small residual MR. */
const SV_MV = 82;
const HR = Math.round(60000 / RR);
/**
 * The inflow after the clip: E and A waves in the shape of cyclemodel.js mitralV (A at 0.6 of E, a
 * deceleration time of 260 ms), scaled so that the VTI times the double orifice's area gives the
 * stroke volume through it; its mean gradient is 4v² over the filling period, the trace the
 * scanner takes. The before values: the inflow of chapter Mitral regurgitation.
 */
const INFLOW = (() => {
  const t0 = EV.mvo, t1 = RR + EV.mvc, step = 0.5, AE = 0.6, DT = 260;
  const fill = (E, A, dt) => {
    let vti = 0, s2 = 0, n = 0;
    for (let t = t0; t < t1; t += step) { const v = mitralV(t % RR, E, A, dt); vti += (v * step) / 10; s2 += v * v; n++; }
    return { vti, mg: (4 * s2) / n };
  };
  const E = SV_MV / MVA_AFTER / fill(1, AE, DT).vti;
  return { E, A: E * AE, dt: DT, mg: fill(E, E * AE, DT).mg, before: fill(BEFORE.E, BEFORE.A, 180).mg };
})();
/** The mean gradient (mmHg) as printed, before and after the clip. */
const MG = { before: rounded(INFLOW.before, 1), after: rounded(INFLOW.mg, 1) };
/** The residual MR: the vena contracta of each jet (cm), medial and lateral of the clip. */
const RESID = { med: 0.2, lat: 0.15 };
/** The iatrogenic ASD: its flow's vena contracta (cm). */
const IASD = 0.5;
/** The beam's thickness across the image plane for the device's echo (cm, each side; a teaching value): a clip a little off the plane still echoes. */
const SLAB = 0.2;

// ---------------------------------------------------------------- the panes
let sheet = null, st = null;
const beat = new Beat(RR);
const redraw = () => { if (sheet) sheet.dirty = true; };

/**
 * A TEE pane: a mesh panel whose plane comes from the chapter (an X-plane, the transseptal views),
 * not from a views.js key. plane() sets it; the next draw cuts it.
 */
class TeePanel extends MeshPanel {
  constructor(o = {}) {
    super('a4c', o);
    this.gKey = '';
  }
  plane(g, spec, key) {
    if (!this.ev || key === this.gKey) return;
    this.gKey = key;
    this.ev.setGeometry(g, spec, { animate: false });
    this.view = 'free';
    this.last = '';
  }
}

const P = {
  plax: new MeshPanel('plax', { diseases: DISEASES, lv: true, redraw }),
  a4c: new MeshPanel('a4c', { diseases: DISEASES, lv: true, redraw }),
  psax: new MeshPanel('psax_mv', { diseases: DISEASES, lv: true, redraw }),
  B: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
  C: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
  D: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
};
const startAll = () => { for (const p of Object.values(P)) p.start(); };

/** The heart's LV for the case: its size at the case's LVEDD and LVEF (meshcal.js). */
const lvOf = (heart) => lvByEf(heart, lvSizeOf(heart, BEFORE.lvedd), BEFORE.ef);
/** The disease weights at pose p for heart, at systole share sy: the case's LA and LV, the tenting, the held leaflets. */
function diseaseOf(p, heart, sy) {
  const W8 = lvOf(heart), la = laWeight(BEFORE.lavi, heart);
  return {
    la,
    lvSize: W8.size + (W8.esSize - W8.size) * sy,
    // the fossa one wall, and the septum's two walls moving together as the LA grows
    tcFossa: 1,
    tcSepLa: la,
    tcTent: rounded(p.sept * (1 - smooth(p.cross)), 3),
    ...CM.holdWeights(rounded(p.arm, 1), rounded(p.cap, 3)),
  };
}
/** The flail's move within the beat: all of it while the valve shuts, none once the clip holds the leaflets. */
const flailAt = (tt, p) => rounded((1 - clamp(p.cap, 0, 1)) * clamp(cycleAt(tt).drive.mv, 0, 1), 2);

// ---------------------------------------------------------------- the geometry of the case
// The clip's site and the puncture site are found once on the rest mesh (gl/clipmesh.js). The
// TEE planes need them in the case's heart: the valve and the septum as the LA and LV of the case
// move them, at end-diastole. A small view of its own cuts that frame once for each heart shown.
let GEO = null, geoVer = -1, geoFailed = false;
async function buildGeo(ver) {
  const S = await scanner();
  const shifts = await diseaseTargets(DISEASES), mask = await lvMask();
  const model = S.model, heart = model.pheno.key;
  const ev = S.make(64, 64, 'a4c', { fill: true });
  ev.setView('a4c', { animate: false });
  const W8 = lvOf(heart);
  const la = laWeight(BEFORE.lavi, heart);
  ev.setDisease({ la, lvSize: W8.size, tcFossa: 1, tcSepLa: la }, shifts);
  ev.setMotion({});
  ev.setLvSys(W8.k, mask);
  const c = cycleAt(0);
  ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  const site = CM.siteOf(model.heart.meshes.MitralValve, model.anat.normal());
  const punct = CM.punctureOf(model);
  const { vm, sm } = motionOf(ev, { site, punct });
  const at = (p) => V3(vm.map(p)), dir = (v) => V3(vm.dir(v)).normalize();
  const G = teeAnatomy(ev), F = framesOf(G);
  const g = {
    ver, site, punct, F, G,
    C: at(site.C), N: dir(site.N), A0: dir(site.A0), Ac: dir(site.Ac), Bc: dir(site.Bc),
    Q: at(site.Q), Qa: at(site.Qa), Qp: at(site.Qp),
    S: V3(sm.map(punct.P)), Nias: V3(punct.Nias),
    av: model.anat.point('av', 0, 0),
  };
  // the puncture site's height above the leaflets on the four-chamber view, with the sheath
  // tenting the fossa (the tent's top TENT.h toward the LA along the septum's axis)
  const top = g.S.clone().addScaledVector(g.Nias, -CM.TENT.h);
  g.height = rounded(height2d(TV.height(F, g.S, g.C).g, top, g.C, g.N).h, 1);
  return g;
}
/**
 * The height of world point top above the mitral annulus on plane g, as a caliper on the image
 * takes it: its distance from the line where the annulus's plane (through C, square to N) meets
 * the image plane. { h (cm), a, b } (the caliper's ends, plane cm).
 */
function height2d(g, top, C, N) {
  const a = g.r.dot(N), b = g.d.dot(N), c = g.O.clone().sub(C).dot(N);
  const q = top.clone().sub(g.O), u0 = q.dot(g.r), v0 = q.dot(g.d);
  const k = (a * u0 + b * v0 + c) / (a * a + b * b || 1);
  return { h: Math.abs(k) * Math.hypot(a, b), a: [u0, v0], b: [u0 - k * a, v0 - k * b] };
}
/** The geometry of the heart shown, or null while it is built. */
function geoOf(model) {
  const ver = model.pheno.version;
  if (GEO && GEO.ver === ver) return GEO;
  if (geoVer !== ver) {
    geoVer = ver;
    buildGeo(ver).then((g) => { if (g.ver === model.pheno.version) { GEO = g; redraw(); } })
      .catch((err) => { geoFailed = true; console.error('TEER geometry failed:', err); });
  }
  return null;
}

/**
 * A mesh's base positions in world space (echo.js MeshData): the shape on which gl/clipmesh.js
 * found the sites, before any heart, disease or beat. MeshData's rest shape holds the heart and
 * the static disease already, so a move from base to pos carries all of them.
 */
const BASES = new WeakMap();
function worldBase(md) {
  let b = BASES.get(md);
  if (b) return b;
  if (md.identity) b = md.base;
  else {
    const e = md.matrix.elements, a = md.base;
    b = new Float32Array(a.length);
    for (let k = 0; k < a.length; k += 3) {
      const x = a[k], y = a[k + 1], z = a[k + 2];
      b[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      b[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      b[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  BASES.set(md, b);
  return b;
}
/** The valve's and the septum's motion from the base mesh to the frame that view ev holds. */
function motionOf(ev, g) {
  const vd = ev.valves.find((v) => v.mesh.name === 'MitralValve');
  return { vm: CM.valveMotion(g.site, worldBase(vd), vd.pos), sm: CM.septumMotion(g.punct, worldBase(ev.myo), ev.myo.pos) };
}
/**
 * The walls' clearance in the frame that view ev holds: a function that moves a point off the
 * myocardium until room cm lie between them (gl/clipmesh.js deviceOf clear), from a grid of the
 * wall's vertices built for each frame.
 */
function clearanceOf(ev) {
  const pos = ev.myo.pos, cell = 0.5, G = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${Math.floor(pos[i] / cell)},${Math.floor(pos[i + 1] / cell)},${Math.floor(pos[i + 2] / cell)}`;
    let L = G.get(k);
    if (!L) G.set(k, (L = []));
    L.push(pos[i], pos[i + 1], pos[i + 2]);
  }
  const nearest = (x, y, z) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = Infinity, w = null;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
      const L = G.get(`${cx + a},${cy + b},${cz + c}`);
      if (!L) continue;
      for (let i = 0; i < L.length; i += 3) { const d = (L[i] - x) ** 2 + (L[i + 1] - y) ** 2 + (L[i + 2] - z) ** 2; if (d < best) { best = d; w = [L[i], L[i + 1], L[i + 2]]; } }
    }
    return w ? { d: Math.sqrt(best), w } : null;
  };
  return (p, room) => {
    let q = p.slice();
    for (let it = 0; it < 4; it++) {
      const n = nearest(q[0], q[1], q[2]);
      if (!n || n.d >= room) break;
      const v = [q[0] - n.w[0], q[1] - n.w[1], q[2] - n.w[2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
      const k = (room - n.d) / l + 0.02;
      q = [q[0] + v[0] * k, q[1] + v[1] * k, q[2] + v[2] * k];
    }
    return q;
  };
}
/** The device in the frame that view ev holds, at pose p: { parts, clip, path }. */
function deviceOn(ev, g, p, along = null) {
  const { vm, sm } = motionOf(ev, g);
  return CM.deviceOf(g.site, g.punct, p, vm, sm, CM.CAVA, along, clearanceOf(ev));
}
/**
 * The leaflets that the clip holds, put on its arms after the valve's morph and before its cut
 * (echo.js valveHook; gl/clipmesh.js snapHeld). The device it builds serves the frame's cut too.
 */
const holdHook = (g, p, along = null) => (ev, vd) => {
  if (vd.mesh.name !== 'MitralValve' || !(p.cap > 0)) return;
  const D = deviceOn(ev, g, p, along);
  CM.snapHeld(g.site, vd.pos, D.clip, clamp(p.cap, 0, 1));
  ev.tcFrameDevice = D;
};
/** The B-mode items of the device on plane gg of view ev (echo.js extraItems); the device stays on ev for the labels and the 3D pane. */
const deviceHook = (g, p, along = null) => (ev, gg) => {
  const D = ev.tcFrameDevice || deviceOn(ev, g, p, along);
  ev.tcFrameDevice = null;
  ev.tcDevice = D;
  ev.tcDeviceKey = poseKey(p);
  return CM.deviceItems(D, gg, cutMesh, SLAB).items;
};

/** The longest of the titles that fits a pane w px wide. */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 64) || names[names.length - 1];
  ctx.restore();
  return t;
}

/**
 * The multiplane icon in the image's top right corner, after the TEE chapter's: a half circle
 * open at the top, 0 at its left end and 180 at its right, the angle above it and a white needle
 * that turns counterclockwise (Hahn 2013).
 */
function angleIcon(ctx, bx, ang) {
  const r = 14, W = 2 * r + 14, H = r + 18, x0 = bx.x + bx.w - W - 4, y0 = bx.y + 4, cx = x0 + W / 2, cy = y0 + 15;
  ctx.save();
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x0, y0, W, H);
  ctx.strokeStyle = '#3a52b4';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.stroke();
  const a = (ang * Math.PI) / 180, dx = -Math.cos(a), dy = Math.sin(a), tip = r - 2, w = 1.8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + dx * tip, cy + dy * tip);
  ctx.lineTo(cx - dy * w, cy + dx * w);
  ctx.lineTo(cx + dy * w, cy - dx * w);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8edf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 10px ${MONO}`;
  ctx.fillText(String(Math.round(ang)), cx, cy - 3);
  ctx.restore();
}

/** Echo settings of a TEE plane: a 90-degree sector of depth cm, zoomed on zoom ({ uv, w }) or not. */
const teeSpec = (short, name, depth, zoom = null) => ({ angle: 90, depth, near: 0.4, labels: [], strict: true, short, name, win: 'psax', ...(zoom ? { zoom } : {}) });

// ---------------------------------------------------------------- the jets
/** The jet's strength over systole (0 to 1): from mitral closure to opening; tri peaks it early. */
function strengthAt(t, tri = 0) {
  if (t < EV.mvc || t > EV.mvo) return 0;
  const w = (t - EV.mvc) / (EV.mvo - EV.mvc);
  const round = Math.pow(Math.sin(Math.PI * w), 0.35);
  const early = w < 0.3 ? Math.pow(w / 0.3, 0.45) : Math.pow((1 - w) / 0.7, 0.7);
  return round * (1 - tri) + early * tri;
}
/** The line where view ev's plane meets the plane through world point M square to n: [a, b] (plane cm), or null. */
function lineOn(ev, M, n) {
  const g = ev.g, k = (p) => p.clone().sub(M).dot(n);
  const at = (u, v) => g.O.clone().addScaledVector(g.r, u).addScaledVector(g.d, v);
  const pts = [];
  for (const v of [2, 12]) {
    const a = k(at(-8, v)), b = k(at(8, v));
    if (a === b || a * b > 0) continue;
    pts.push([-8 + (16 * a) / (a - b), v]);
  }
  if (pts.length < 2) {
    for (const u of [-4, 4]) {
      const a = k(at(u, 0)), b = k(at(u, 16));
      if (a === b || a * b > 0) continue;
      pts.push([u, (16 * a) / (a - b)]);
    }
  }
  return pts.length >= 2 ? [pts[0], pts[1]] : null;
}
/** Where a ray from O along d first leaves polygon Pg: { t, a, b } (the edge), or null. */
function rayHit(Pg, O, d) {
  let best = null;
  for (let i = 0; i < Pg.length; i++) {
    const a = Pg[i], b = Pg[(i + 1) % Pg.length], e = sub(b, a), den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, O), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 1e-3 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, a, b };
  }
  return best;
}
/**
 * The LA and the LV on the plane, cut apart at the leaflets (plane cm polygons), in the frame of
 * view ev; F, the pane's frame, stops them at the image's edges.
 */
function chambersOf(ev, g, F = null) {
  const { vm } = motionOf(ev, g);
  const C = V3(vm.map(g.site.C)), N = V3(vm.dir(g.site.N)).normalize(), Q = V3(vm.map(g.site.Q));
  // the line through the leaflets' coaptation, parallel to the annulus: the LA's floor in systole
  // is the shut leaflets, and the line closes the flail's gap
  const cut = lineOn(ev, Q.clone().addScaledVector(N, -0.05), N);
  const cuts = cut ? [cut] : [];
  // the valves' skirts (gl/skirts.js) close the gaps at the hinges, which meshjet.js cavity leaves open
  for (const V of ev.last.valves) {
    if (!V.skirt || V.pts.length < 2) continue;
    const m = V.pts.length;
    for (let i = 0; i < m - 1 + (V.closed ? 1 : 0); i++) cuts.push({ a: V.pts[i], b: V.pts[(i + 1) % m], ends: 0 });
  }
  // the image's edges: a chamber cut short by the zoom stops there
  let seed = (p) => p, shown = () => true;
  if (F) {
    const bx = F.view.box, k = F.k, u = (X) => (X - F.sect.cx) / k, v = (Y) => (Y - F.sect.top) / k;
    const u0 = u(bx.x), u1 = u(bx.x + bx.w), v0 = Math.max(v(bx.y), 0.4), v1 = v(bx.y + bx.h);
    cuts.push([[u0, v0], [u0, v1]], [[u1, v0], [u1, v1]], [[u0, v0], [u1, v0]], [[u0, v1], [u1, v1]]);
    // each chamber's blood is looked for inside the image: from outside it, the cuts would keep the outside
    seed = (p) => [clamp(p[0], u0 + 0.3, u1 - 0.3), clamp(p[1], v0 + 0.3, v1 - 0.3)];
    shown = (p) => p[0] > u0 + 0.1 && p[0] < u1 - 0.1 && p[1] > v0 + 0.1 && p[1] < v1 - 0.1;
  }
  // a chamber's blood: in the image, on its own side of the leaflets' line; or the point it was looked for from
  const side = (p) => ev.g.O.clone().addScaledVector(ev.g.r, p[0]).addScaledVector(ev.g.d, p[1]).sub(Q).dot(N) + 0.05;
  const inside = (k) => {
    const p = seed(onPlane(ev, Q.clone().addScaledVector(N, k)));
    for (const r of [1.2, 0.8, 0.5]) {
      const b = blood(ev, p, r);
      if (shown(b) && side(b) * k > 0) return b;
    }
    return p;
  };
  const la = cavity(ev, inside(1.6), cuts);
  const lv = cavity(ev, inside(-1.8), cuts);
  return { la, lv, C, N, Q, vm };
}
/** The colour box round several jets, from their extents (echo2d.js jet with box: false). */
function colorBox(ctx, F, list) {
  const B = list.filter(Boolean);
  if (!B.length) return;
  const half = ((F.sect.deg || 90) / 2) * (Math.PI / 180) - 0.01;
  const t0 = Math.max(-half, Math.min(...B.map((b) => b.t0))), t1 = Math.min(half, Math.max(...B.map((b) => b.t1)));
  const r0 = Math.min(...B.map((b) => b.r0)), r1 = Math.max(...B.map((b) => b.r1)), { sect } = F;
  if (!(t1 > t0)) return;
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

/** Polyline P resampled every h cm along its length. */
function resample(P, h) {
  const out = [P[0]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], e = sub(P[i], a), l = len(e);
    let t = h - carry;
    while (t <= l) { out.push(add(a, mul(e, t / l))); t += h; }
    carry = l - (t - h);
  }
  const end = P[P.length - 1];
  if (len(sub(end, out[out.length - 1])) > 0.25 * h) out.push(end);
  return out;
}
/** Polyline P smoothed n times, its first point and its last kept. */
function smoothLine(P, n) {
  let A = P;
  for (let it = 0; it < n; it++) A = A.map((p, i) => (i === 0 || i === A.length - 1 ? p : mul(add(add(A[i - 1], A[i + 1]), mul(p, 2)), 0.25)));
  return A;
}
/** Whether point p lies inside polygon Pg (even-odd rule). */
function insidePoly(Pg, p) {
  let c = false;
  for (let i = 0, j = Pg.length - 1; i < Pg.length; j = i++) {
    const [xi, yi] = Pg[i], [xj, yj] = Pg[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Pane F's image in plane cm: [u0, u1, v0, v1]. */
function imageBox(F) {
  const bx = F.view.box, k = F.k;
  return [(bx.x - F.sect.cx) / k, (bx.x + bx.w - F.sect.cx) / k, (bx.y - F.sect.top) / k, (bx.y + bx.h - F.sect.top) / k];
}
/**
 * The axis of a jet that leaves O along d, meets the wall of the chamber Pg (plane cm) and then
 * runs along it (the Coanda effect): straight to the wall, a bend, and on along the wall off cm
 * inside it, for up to reach cm, until the wall turns back or leaves the image ([u0, u1, v0, v1]).
 * { pts, sWall }: the axis, every 0.08 cm, and how far along it the jet lies on the wall; null
 * when the ray meets the wall within 0.6 cm.
 */
function wallPath(Pg, O, d, img, off = 0.3, reach = 4.5) {
  const n = Pg.length;
  let hit = null;
  for (let i = 0; i < n; i++) {
    const a = Pg[i], b = Pg[(i + 1) % n], e = sub(b, a), den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, O), t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 1e-3 && u >= 0 && u <= 1 && (!hit || t < hit.t)) hit = { t, i };
  }
  if (!hit || hit.t < 0.6) return null;
  const H = add(O, mul(d, hit.t));
  // the wall from the hit on, the way the jet runs on; it stops where the chamber ends at the image's edge
  const step = dot(sub(Pg[(hit.i + 1) % n], Pg[hit.i]), d) >= 0 ? 1 : -1;
  const atEdge = (p) => img && (p[0] < img[0] + 0.1 || p[0] > img[1] - 0.1 || p[1] < img[2] + 0.1 || p[1] > img[3] - 0.1);
  let W = [H], run = 0;
  for (let k = step > 0 ? (hit.i + 1) % n : hit.i, m = 0; m < n && run < reach + 1; m++, k = (k + step + n) % n) {
    const p = Pg[k];
    if (atEdge(p)) break;
    run += len(sub(p, W[W.length - 1]));
    W.push(p);
  }
  if (W.length < 2) W.push(add(H, mul(d, 0.3)));
  W = smoothLine(resample(W, 0.1), 12);
  // the jet leaves the wall where the wall turns back on it
  const T = (i) => unit(sub(W[Math.min(i + 2, W.length - 1)], W[Math.max(i - 2, 0)]));
  const t0 = T(2);
  let end = W.length;
  for (let i = 3; i < W.length; i++) if (dot(T(i), t0) < -0.2) { end = i; break; }
  W = W.slice(0, Math.max(2, end));
  // the wall's inner side: where most points just off it lie in the chamber
  let vote = 0;
  for (let i = 0; i < W.length; i += 2) vote += insidePoly(Pg, add(W[i], mul(perp(T(i)), 0.25))) ? 1 : -1;
  const side = vote >= 0 ? 1 : -1;
  const Wi = W.map((p, i) => add(p, mul(perp(T(i)), side * off)));
  // the bend: from the straight part, r cm before the wall, round to r cm along it
  const r = Math.min(0.7, 0.45 * hit.t);
  const A = add(O, mul(d, hit.t - r));
  let j = 1, acc = 0;
  while (j < Wi.length - 1 && acc < r) { acc += len(sub(Wi[j], Wi[j - 1])); j++; }
  const B = Wi[j - 1], Cp = Wi[0];
  const bend = [];
  for (let s = 0; s <= 1.001; s += 1 / 8) bend.push(add(add(mul(A, (1 - s) ** 2), mul(Cp, 2 * s * (1 - s))), mul(B, s * s)));
  const pts = smoothLine(resample([O, ...bend, ...Wi.slice(j)], 0.08), 3);
  return { pts, sWall: hit.t };
}

/**
 * The flail P2's jet: from the gap between A2 and the flail P2, away from the flail leaflet,
 * across the LA to its anterior wall and then along it, an eccentric jet that hugs the wall
 * (Zoghbi 2017). One jet along one bending axis (echo2d.js pathJet); its flow convergence lies on
 * the LV side of the gap.
 */
function drawFlailJet(c, F, ev, g, tt) {
  const cy = cycleAt(tt), a = strengthAt(cy.t, 0.3);
  if (!(a > 0.02)) return;
  const K = chambersOf(ev, g, F);
  if (K.la.length < 12) return;
  const gap = K.Q.clone().addScaledVector(K.N, 0.1);
  if (Math.abs(gap.clone().sub(ev.g.O).dot(ev.g.n)) > 0.7) return;
  const O = onPlane(ev, gap);
  const up = unit(sub(onPlane(ev, gap.clone().addScaledVector(K.N, 1)), O));
  const Ac = V3(K.vm.dir(g.site.Ac));
  const antV = sub(onPlane(ev, gap.clone().addScaledVector(Ac, 1)), O);
  const ant = len(antV) > 0.3 ? unit(antV) : null;
  const d1 = ant ? unit(add(mul(up, 0.75), mul(ant, 0.66))) : up;
  const v = BEFORE, q = v.flow || 2 * Math.PI * v.r * v.r * 32;
  const w0 = Math.max(0.12, v.vc / 2), keep = 0.6;
  // along the wall it meets (the Coanda effect); a plane across the jet shows it straight
  let W = ant ? wallPath(K.la, O, d1, imageBox(F)) : null;
  if (!W) {
    const hit = rayHit(K.la, O, d1);
    W = { pts: resample([O, add(O, mul(d1, Math.min(4.4, (hit ? hit.t : 3) * 0.95)))], 0.08), sWall: Infinity };
  }
  const sw = Math.min(W.sWall, 3);
  // the jet widens to about 1 cm by the wall and a little more along it; its core slows as it
  // spreads, and slower on the wall, where it keeps its momentum
  const half = (s) => (s < sw ? w0 + (0.48 - w0) * Math.sin((Math.PI / 2) * Math.min(1, s / Math.max(0.6 * sw, 0.3))) : 0.48 + 0.04 * Math.min(1, (s - sw) / 2));
  const core = (s) => (1 / (1 + (0.35 * Math.max(0, Math.min(s, sw) - keep)) / w0)) * Math.exp(-Math.max(0, s - sw) / 4);
  const b = pathJet(c, F, { q, va: NYQ, vmax: 1.8 * NYQ, vc: v.vc, a, path: W.pts, half, core, clip: K.la, pclip: K.lv, pisa: K.lv.length > 12, box: false });
  colorBox(c, F, [b]);
  barFor(c, F, -NYQ, NYQ);
}

/** The residual MR after the clip: a small jet through each orifice, medial and lateral of the clip. */
function drawResidualJets(c, F, ev, g, tt) {
  const cy = cycleAt(tt), a = strengthAt(cy.t, 0);
  if (!(a > 0.02)) return;
  const K = chambersOf(ev, g, F);
  if (K.la.length < 12) return;
  const Bc = V3(K.vm.dir(g.site.Bc));
  const boxes = [];
  for (const [side, vc] of [[1, RESID.med], [-1, RESID.lat]]) {
    const p3 = K.Q.clone().addScaledVector(Bc, side * 0.75).addScaledVector(K.N, 0.05);
    if (Math.abs(p3.clone().sub(ev.g.O).dot(ev.g.n)) > 0.5) continue;
    const O = onPlane(ev, p3), up = unit(sub(onPlane(ev, p3.clone().addScaledVector(K.N, 1)), O));
    const q = Math.PI * (vc / 2) ** 2 * 500;
    boxes.push(jet(c, F, { q, va: NYQ, vmax: 1.6 * NYQ, vc, jl: 0.9 + 2.2 * vc, jw: 0.3 + 1.2 * vc, a, O, dir: up, clip: K.la, pisa: false, box: false }));
  }
  colorBox(c, F, boxes);
  barFor(c, F, -NYQ, NYQ);
}

/** The flow across the iatrogenic ASD after the guide comes back: left to right through the puncture site. */
function drawShuntJet(c, F, ev, g, tt) {
  const { sm } = motionOf(ev, g);
  const S = V3(sm.map(g.punct.P)), Nn = g.Nias;
  if (Math.abs(S.clone().sub(ev.g.O).dot(ev.g.n)) > 0.6) return;
  const O = onPlane(ev, S);
  const d = unit(sub(onPlane(ev, S.clone().addScaledVector(Nn, 1)), O));
  // left-to-right flow through the whole cycle, more in late systole and in diastole
  const t = cycleAt(tt).t, a = 0.6 + 0.3 * Math.sin((2 * Math.PI * (t - 120)) / RR);
  // the RA's blood just across the septum, and the LA's on the near side, where the flow converges
  const RA = cavity(ev, blood(ev, onPlane(ev, S.clone().addScaledVector(Nn, 0.7)), 0.5));
  const LA = cavity(ev, blood(ev, onPlane(ev, S.clone().addScaledVector(Nn, -0.8)), 0.5));
  if (RA.length < 12) return;
  // the defect: the jet starts on the septum's LA face, runs through a channel the defect's width
  // across the septum, and on into the RA; its flow convergence lies in the LA
  const back = LA.length > 12 ? rayHit(LA, O, mul(d, -1)) : null, t0 = back && back.t < 1.2 ? back.t : 0;
  const O1 = add(O, mul(d, -t0)), side = mul(perp(d), IASD / 2);
  const chan = [[-0.1, 1], [t0 + 0.5, 1], [t0 + 0.5, -1], [-0.1, -1]].map(([u, k]) => add(add(O1, mul(d, u)), mul(side, k)));
  const b = jet(c, F, { q: 30, va: NYQ, vmax: 1.4 * NYQ, vc: IASD, jl: 1.6 + t0, jw: 1.1, a, O: O1, dir: d, clip: RA, clipOr: [chan], pclip: LA.length > 12 ? LA : null, pisa: LA.length > 12, box: false });
  colorBox(c, F, [b]);
  barFor(c, F, -NYQ, NYQ);
}

// ---------------------------------------------------------------- the planes of each step
/**
 * The TEE planes on the case's heart g, at pose p. The mitral X-plane: the commissural view
 * through the clip's site, and the long-axis view square to it through the cursor on the clip
 * (src/teerviews.js). The transseptal X-plane: the bicaval view and its short axis through the
 * puncture site; the four-chamber view through the puncture site and the annulus's middle. The
 * transgastric short axis at the leaflets' tips.
 */
function planes(g, p) {
  const zoomOn = (x, w = 5.2) => ({ uv: [0, g.Q.clone().sub(x.g.O).dot(x.g.d)], w });
  // the X-plane follows the clip: its cursor, and the primary plane's beam, on the clip's body
  const aim = p.show > 0 && p.steer > 0.5 ? g.Q.clone().addScaledVector(g.N, clamp(p.depth, -1.6, 1.6) + 0.3) : g.Q;
  const X = TV.mitral(g.F, aim, aim, g.Ac, g.Bc);
  const up = (k) => g.Q.clone().addScaledVector(g.N, k);
  const lax = { ...X.secondary, key: 'lax', name: 'ME LONG AXIS', short: 'LAX', depth: 10 };
  lax.zoom = zoomOn(lax);
  lax.names = [[up(1.9).addScaledVector(g.Ac, -1.9), 'LA'], [up(-2.6), 'LV'], [g.av.clone().addScaledVector(g.N, 0.6), 'Ao']];
  // before the procedure the view shows more of the LA, where the jet runs along its anterior wall
  const laxLA = { ...lax, key: 'laxLA', zoom: { uv: [0.5, lax.zoom.uv[1] - 0.9], w: 6.5 } };
  const mc = { ...X.primary, key: 'mc', name: 'ME COMMISSURAL', short: 'MC', depth: 10 };
  mc.zoom = zoomOn(mc);
  // the LA's name on the medial side (screen left): the clip's name sits on the lateral side
  mc.names = [[up(2.6).addScaledVector(g.Bc, 1.3), 'LA'], [up(-2.6), 'LV']];
  const SX = TV.septal(g.F, g.S, CM.CAVA, g.av);
  const along = { O: SX.primary.g.O.toArray(), n: SX.primary.g.n.toArray() };
  const la = g.S.clone().addScaledVector(g.Nias, -1.6), ra = g.S.clone().addScaledVector(g.Nias, 1.9);
  const onS = (x, w) => ({ uv: [0, g.S.clone().sub(x.g.O).dot(x.g.d)], w });
  const bic = { ...SX.primary, key: 'bic', name: 'ME BICAVAL', short: 'Bicaval', depth: 10, along, names: [[la, 'LA'], [ra, 'RA']] };
  bic.zoom = onS(bic, 4.2);
  const orth = { ...SX.secondary, key: 'orth', name: 'ME SHORT AXIS', short: 'SAX', depth: 10, along, names: [[la, 'LA'], [ra, 'RA']] };
  orth.zoom = onS(orth, 4.2);
  const H = TV.height(g.F, g.S, g.C);
  const four = { ...H, key: 'h4c', name: 'ME FOUR-CHAMBER', short: '4C', depth: 12, along, names: [[g.C.clone().addScaledVector(g.N, 2.4), 'LA'], [g.C.clone().addScaledVector(g.N, -3.6), 'LV']] };
  // the transgastric short axis parallel to the annulus, through the middle of the held leaflets
  const T = TV.tgBasal(g.F, planeAt, 10, g.Q.clone().addScaledVector(g.N, -0.45), g.N);
  const tg = { ...T, key: 'tg', name: 'TG BASAL SHORT AXIS', short: 'TG SAX', depth: 10, zoom: { uv: [0, g.Q.clone().sub(T.g.O).dot(T.g.d)], w: 6.5 }, names: [] };
  return { lax, laxLA, mc, bic, orth, four, tg };
}

// ---------------------------------------------------------------- the echo panes
/** A TTE pane: plax, a4c or psax, with the device and o.color: 'flail' or 'residual'. */
function tte(ctx, box, which, p, tt, g, o = {}) {
  const pane = P[which], sy = cycleAt(tt).s, f = flailAt(tt, p);
  const titles = {
    plax: [`PARASTERNAL LONG AXIS · COLOR ${NYQ} cm/s`, `PLAX · COLOR ${NYQ}`, 'PLAX'],
    a4c: [`APICAL FOUR-CHAMBER · COLOR ${NYQ} cm/s`, `A4C · COLOR ${NYQ}`, 'A4C'],
    psax: ['PARASTERNAL SHORT AXIS · MITRAL VALVE', 'PSAX · MV', 'PSAX'],
  }[which];
  const names = {
    plax: [['prv', 'RV'], ['plv', 'LV'], ['ao', 'Ao'], ['la', 'LA']],
    a4c: [['lv', 'LV', 'apex', 0.45], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
    psax: [['rv', 'RV'], ['lv', 'LV', 'latw', 0.75]],
  }[which];
  return pane.draw(ctx, box, titleOf(ctx, box.w, titles), {
    tms: tt, disease: (heart) => diseaseOf(p, heart, sy), motion: f > 0 ? { tcFlail: f } : {}, lvK: lvOf(heartShown()).k,
    deeper: which === 'plax' ? 2 : which === 'a4c' ? 1.5 : 0,
    extra: p.show > 0 ? deviceHook(g, p) : null, extraKey: p.show > 0 ? poseKey(p) : '', valve: p.cap > 0 ? holdHook(g, p) : null,
    names,
    over: (c, F, ev) => {
      if (o.color === 'flail') drawFlailJet(c, F, ev, g, tt);
      else if (o.color === 'residual') drawResidualJets(c, F, ev, g, tt);
    },
  });
}

/** A TEE pane: view x of planes(), with the device; o.color: 'flail', 'residual' or 'shunt'; o.height: the puncture height caliper. */
function tee(ctx, box, pane, x, p, tt, g, o = {}) {
  const sy = cycleAt(tt).s, f = flailAt(tt, p);
  const key = `${x.key}|${x.g.O.toArray().map((v) => v.toFixed(3))}|${x.g.d.toArray().map((v) => v.toFixed(4))}|${x.g.r.toArray().map((v) => v.toFixed(4))}`;
  pane.plane(x.g, teeSpec(x.short, x.name, x.depth, x.zoom || null), key);
  const F = pane.draw(ctx, box, titleOf(ctx, box.w, [`TEE · ${x.name}`, `TEE · ${x.short}`, x.short]), {
    tms: tt, disease: (heart) => diseaseOf(p, heart, sy), motion: f > 0 ? { tcFlail: f } : {}, lvK: lvOf(heartShown()).k,
    extra: p.show > 0 ? deviceHook(g, p, x.along || null) : null, extraKey: `${p.show > 0 ? poseKey(p) : ''}|${x.key}`, valve: p.cap > 0 ? holdHook(g, p, x.along || null) : null,
    names: [...(x.names || []).map(([w, t]) => [(ev) => onPlane(ev, w), t]), ...deviceNames(g, x, p)],
    over: (c, F2, ev) => {
      if (o.color === 'flail') drawFlailJet(c, F2, ev, g, tt);
      else if (o.color === 'residual') drawResidualJets(c, F2, ev, g, tt);
      else if (o.color === 'shunt') drawShuntJet(c, F2, ev, g, tt);
      if (o.height) heightCaliper(c, F2, ev, g, p);
    },
  });
  if (F) angleIcon(ctx, F.view.box, x.ang);
  return F;
}

/** The device's name on a TEE plane: the sheath or the clip, where the plane cuts it. */
function deviceNames(g, x, p) {
  if (!(p.show > 0)) return [];
  const near = (ev, w) => (Math.abs(w.clone().sub(ev.g.O).dot(ev.g.n)) < 0.9 ? onPlane(ev, w) : null);
  if (p.cross <= 0) {
    return [[(ev) => {
      const D = ev.tcDevice, tip = D && D.path ? V3(D.path[D.path.length - 1]) : null;
      return tip ? near(ev, tip.addScaledVector(g.Nias, 1.3)) : null;
    }, 'sheath']];
  }
  if (x.key !== 'mc' && x.key !== 'lax') return [];
  return [[(ev) => {
    const D = ev.tcDevice;
    if (!D || !D.clip) return null;
    // beside the clip's top, in the LA: toward the front in the long axis, to the lateral side
    // (screen right) in the commissural view, clear of the leaflets
    const c = V3(D.clip.top);
    return near(ev, x.key === 'lax' ? c.addScaledVector(g.N, 0.4).addScaledVector(g.Ac, 1.0) : c.addScaledVector(g.N, 0.25).addScaledVector(g.Bc, -0.95));
  }, 'clip']];
}

/** The puncture site's height above the mitral annulus on the four-chamber plane, from the tent's top. */
function heightCaliper(c, F, ev, g, p) {
  if (!(p.sept > 0.6) || p.cross > 0) return;
  const { sm, vm } = motionOf(ev, g);
  const N = V3(vm.dir(g.site.N)).normalize(), C = V3(vm.map(g.site.C));
  // the tent's top: the septum's motion carries the tent too
  const H = height2d(ev.g, V3(sm.map(g.punct.P)), C, N);
  // the number is the end-diastolic measurement of the readout, so the two agree
  cal(c, F, H.a, H.b, `${g.height.toFixed(1)} cm`, { solid: true });
}

// ---------------------------------------------------------------- the 3D pane
let enface = null, enfaceFailed = false;
/** The 3D TEE en face view of the valve from the LA (the surgeon's view), from the frame that view ev holds. */
function enFacePane(ctx, box, ev, g, p) {
  panel(ctx, box.x, box.y, box.w, box.h, titleOf(ctx, box.w, ["3D TEE · EN FACE · SURGEON'S VIEW", '3D TEE · EN FACE', '3D EN FACE']));
  const bx = { x: box.x + 1, y: box.y + 24, w: box.w - 2, h: box.h - 25 };
  if (!ev || enfaceFailed) { note(ctx, bx, enfaceFailed ? '3D view unavailable' : 'loading the heart model', 'top'); return; }
  try { if (!enface) enface = new EnFace(400, 400); } catch (e) { enfaceFailed = true; console.error('3D view failed:', e); return; }
  const { vm } = motionOf(ev, g);
  const C = vm.map(g.site.C), N = unit3(vm.dir(g.site.N)), up = unit3(vm.dir(g.site.A0));
  const D = p.show > 0 ? (ev.tcDevice && ev.tcDeviceKey === poseKey(p) ? ev.tcDevice : deviceOn(ev, g, p)) : null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), side = Math.max(64, Math.round(Math.min(bx.w, bx.h) * dpr));
  enface.setSize(side, side);
  // the crop's top: above the annulus, or above the clip while it is over the valve, as the
  // echocardiographer moves the crop to keep the clip in the volume
  const hTop = D && D.clip ? dot3(D.clip.top, C, N) : 0;
  const cv = enface.draw(ev, C, N, up, D ? D.parts : null, { top: clamp(hTop + 0.3, 1.1, 2.8) });
  const sz = side / dpr, x0 = bx.x + (bx.w - sz) / 2, y0 = bx.y + (bx.h - sz) / 2;
  ctx.drawImage(cv, x0, y0, sz, sz);
  // the names where the structures lie on the image
  ctx.save();
  ctx.font = `600 10px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,10,12,0.85)';
  ctx.fillStyle = 'rgba(232,236,240,0.92)';
  const tag = (w, t) => {
    const q = enface.project(w);
    if (!q || q[0] < 0.04 || q[0] > 0.96 || q[1] < 0.04 || q[1] > 0.96) return;
    const x = x0 + q[0] * sz, y = y0 + q[1] * sz;
    ctx.strokeText(t, x, y);
    ctx.fillText(t, x, y);
  };
  tag(g.av.toArray(), 'Ao');
  tag(g.G.laa.mouth.toArray(), 'LAA');
  ctx.restore();
}
const unit3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** The height of point p above point C along n (arrays). */
const dot3 = (p, C, n) => (p[0] - C[0]) * n[0] + (p[1] - C[1]) * n[1] + (p[2] - C[2]) * n[2];

// ---------------------------------------------------------------- Doppler
/**
 * CW Doppler across the mitral valve after the clip: the inflow through the double orifice with
 * its traced envelope and mean gradient, and the faint residual MR. TEE: the inflow runs away from
 * the probe, below the baseline; TTE (apical): toward it, above the baseline.
 */
function inflowCW(ctx, box, tteView) {
  panel(ctx, box.x, box.y, box.w, box.h, fit(box.w, tteView ? `CW · MITRAL INFLOW · APICAL · HR ${HR}` : `CW · MITRAL INFLOW · TEE · HR ${HR}`, 'CW · MV'));
  const bx = inner(box);
  const M = INFLOW, span = 2 * RR, sg = tteView ? 1 : -1;
  const vs = 2.5, base = tteView ? 0.72 : 0.28;
  const inflow = (u) => sg * mitralV((u * span) % RR, M.E, M.A, M.dt);
  const mr = (u) => -sg * 5.0 * strengthAt((u * span) % RR, 0);
  spectral(ctx, bx, { fn: [inflow, mr], scale: vs, base, mode: 'cw', broad: 0.35, gain: [1, 0.3], key: `tccw|${tteView}|${M.E.toFixed(3)}`, seed: 41 });
  vscale(ctx, bx, vs, base, 1);
  // the traced envelope of the first beat's filling, as the scanner traces it for the mean gradient
  const k = (bx.h * Math.max(base, 1 - base)) / vs, yb = bx.y + base * bx.h, X = (ms) => bx.x + (ms / span) * bx.w;
  ctx.save();
  ctx.strokeStyle = SC.cal;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(X(EV.mvo), yb);
  for (let ms = EV.mvo; ms <= RR + EV.mvc; ms += 4) ctx.lineTo(X(ms), yb - sg * mitralV(ms % RR, M.E, M.A, M.dt) * k);
  ctx.lineTo(X(RR + EV.mvc), yb);
  ctx.stroke();
  ctx.restore();
  cursor(ctx, bx, beat.sweep);
  note(ctx, bx, [`mean gradient ${MG.after.toFixed(1)} mmHg · E ${M.E.toFixed(1)} m/s · HR ${HR}`, `MG ${MG.after.toFixed(1)} mmHg · HR ${HR}`, `MG ${MG.after.toFixed(1)}`], tteView ? 'bottom' : 'top');
}

// ---------------------------------------------------------------- the procedure pane
// The Blender stills (assets/mteer/<step>.webp), one for each step, loaded when the chapter
// first shows. Between two steps the two stills cross-fade. A chapter video gives frames of its
// own along the steps (video/chapter.js): window.__videoFrames(s) returns the two round step
// position s and the share of the second.
const STILLS = {};
let mixCv = null;
/** Images a and b (with alpha) mixed, (1 - f) a + f b, on a canvas of a's size: a true cross-fade. */
function mixed(a, b, f) {
  if (!b || f <= 0.002) return a;
  if (f >= 0.998) return b;
  if (!mixCv || mixCv.width !== a.width || mixCv.height !== a.height) {
    mixCv = document.createElement('canvas');
    mixCv.width = a.width;
    mixCv.height = a.height;
  }
  const c = mixCv.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, mixCv.width, mixCv.height);
  // premultiplied sums: where both are opaque the colours mix, where one is clear its share fades
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 1 - f;
  c.drawImage(a, 0, 0, mixCv.width, mixCv.height);
  c.globalAlpha = f;
  c.drawImage(b, 0, 0, mixCv.width, mixCv.height);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  return mixCv;
}
let stillsP = null;
function loadStills() {
  if (stillsP) return stillsP;
  stillsP = Promise.all(STEPS.map(async (s) => {
    try {
      const r = await fetch(`assets/mteer/${s.key}.webp`);
      if (!r.ok) return;
      STILLS[s.key] = await createImageBitmap(await r.blob());
      redraw();
    } catch (e) { /* the pane keeps its note */ }
  }));
  return stillsP;
}
let edgeCv = null;
/** Image img with its edges faded out (frac of its size each side): the cut-off heart meets the pane softly. */
function feathered(img, frac = 0.07) {
  const w = img.width, h = img.height;
  if (!edgeCv || edgeCv.width !== w || edgeCv.height !== h) {
    edgeCv = document.createElement('canvas');
    edgeCv.width = w;
    edgeCv.height = h;
  }
  const c = edgeCv.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'destination-out';
  const fx = Math.round(w * frac), fy = Math.round(h * frac);
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, fx, 0, 0, 0, fx, h);
  edge(w, 0, w - fx, 0, w - fx, 0, fx, h);
  edge(0, 0, 0, fy, 0, 0, w, fy);
  edge(0, h, 0, h - fy, 0, h - fy, w, fy);
  c.globalCompositeOperation = 'source-over';
  return edgeCv;
}
function procedurePane(ctx, box, s) {
  panel(ctx, box.x, box.y, box.w, box.h, titleOf(ctx, box.w + 40, ['PROCEDURE · HEART MODEL, CUT AWAY', 'PROCEDURE · HEART MODEL', 'PROCEDURE']));
  const bx = { x: box.x + 1, y: box.y + 24, w: box.w - 2, h: box.h - 25 };
  const show = (img0, alpha) => {
    if (!img0 || !(alpha > 0.01)) return;
    const img = feathered(img0);
    const k = Math.min(bx.w / img.width, bx.h / img.height), w = img.width * k, h = img.height * k;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, bx.x + (bx.w - w) / 2, bx.y + (bx.h - h) / 2, w, h);
    ctx.restore();
  };
  const own = typeof window !== 'undefined' && window.__videoFrames ? window.__videoFrames(s) : null;
  if (own) show(mixed(own.a, own.b, own.f), 1);
  else {
    loadStills();
    const a = Math.floor(clamp(s, 0, LAST)), b = Math.min(LAST, a + 1), f = smooth((s - a - 0.3) / 0.4);
    const A = STILLS[STEPS[a].key], B = STILLS[STEPS[b].key];
    if (!A && !B) { note(ctx, bx, 'loading the procedure images', 'top'); return; }
    show(mixed(A || B, A ? B : null, A && B ? f : 0), 1);
  }
  // the step's name at the foot of the pane, on a dark band so it reads over the image; a video
  // names its steps in its caption
  if (own) return;
  const label = `${stepAt(s) + 1} · ${STEPS[stepAt(s)].name.toUpperCase()}`;
  ctx.save();
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(8, 11, 15, 0.72)';
  ctx.fillRect(bx.x + 4, bx.y + bx.h - 27, ctx.measureText(label).width + 14, 21);
  ctx.fillStyle = SC.text;
  ctx.fillText(label, bx.x + 11, bx.y + bx.h - 12);
  ctx.restore();
}

// ---------------------------------------------------------------- the figure
/** The panes of step k: B and C are a pair (an X-plane, or two TTE views), D the third. */
function paneSet(k, x) {
  switch (STEPS[k].key) {
    case 'before': return { B: ['tte', 'plax', { color: 'flail' }], C: ['tee', x.laxLA, { color: 'flail' }], D: ['enface'] };
    case 'septum': return { B: ['tee', x.bic, {}], C: ['tee', x.orth, {}], D: ['tee', x.four, { height: true }] };
    case 'steer': return { B: ['tee', x.mc, {}], C: ['tee', x.lax, {}], D: ['enface'] };
    case 'align': return { B: ['tee', x.mc, {}], C: ['tee', x.lax, {}], D: ['enface'] };
    case 'grasp': return { B: ['tee', x.mc, {}], C: ['tee', x.lax, {}], D: ['enface'] };
    case 'assess': return { B: ['tee', x.mc, { color: 'residual' }], C: ['cw', false], D: ['tee', x.tg, {}] };
    case 'release': return { B: ['tee', x.bic, { color: 'shunt' }], C: ['tee', x.lax, {}], D: ['enface'] };
    default: return { B: ['tte', 'psax', {}], C: ['tte', 'a4c', { color: 'residual' }], D: ['cw', true] };
  }
}

/** Draw pane spec into box (which: B, C or D, the TEE panel); returns the view it drew on, for the 3D pane. */
function drawPane(ctx, box, spec, which, p, tt, g, lastEv) {
  const [kind, a, o] = spec;
  if (kind === 'tte') { tte(ctx, box, a, p, tt, g, o); return P[a].state === 'ready' ? P[a].ev : null; }
  if (kind === 'tee') { tee(ctx, box, P[which], a, p, tt, g, o); return P[which].ev; }
  if (kind === 'cw') { inflowCW(ctx, box, a); return null; }
  if (kind === 'enface') { enFacePane(ctx, box, lastEv, g, p); return null; }
  return null;
}

/** The figure's boxes: the procedure pane, the pair B and C, and D. */
function layout(W, H) {
  if (W < 700) {
    const frame = { x: 6, y: 6, w: W - 12, h: H - 12 };
    const [r1, r2, r3] = rows(frame, [1.05, 1, 0.9], 6);
    const [b, c] = cols(r2, [1, 1], 6);
    return { left: r1, b, c, d: r3 };
  }
  const frame = { x: 14, y: 12, w: W - 28, h: H - 24 };
  const [left, r] = cols(frame, [0.44, 0.56], 10);
  const [top, d] = rows(r, [1.12, 1], 10);
  const [b, c] = cols(top, [1, 1], 10);
  return { left, b, c, d };
}

function draw(sh) {
  const ctx = sh.ctx, s = posOf(st[KEY]), k = stepAt(s), p = poseAt(s);
  const tt = beat.at(true, T_SYS);
  const L = layout(sh.w, sh.h);
  procedurePane(ctx, L.left, s);
  const model = P.B.ev ? P.B.ev.model : null;
  const g = model ? geoOf(model) : null;
  if (!g || P.B.state !== 'ready' || P.C.state !== 'ready' || P.D.state !== 'ready') {
    startAll();
    for (const bx of [L.b, L.c, L.d]) { panel(ctx, bx.x, bx.y, bx.w, bx.h, ''); note(ctx, inner(bx), 'loading the heart model', 'top'); }
    return;
  }
  const set = paneSet(k, planes(g, p));
  const evB = drawPane(ctx, L.b, set.B, 'B', p, tt, g, null);
  const evC = drawPane(ctx, L.c, set.C, 'C', p, tt, g, evB);
  drawPane(ctx, L.d, set.D, 'D', p, tt, g, evB || evC);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** The live sentences of step k. */
function liveOf(k, cite) {
  const h = GEO ? fmt(GEO.height, 1) : '–';
  switch (STEPS[k].key) {
    case 'before':
      return `<b>Severe primary MR from a flail P2.</b> The free edge of P2 turns into the LA in systole, and an eccentric jet runs away from it, along the anterior wall of the LA. Vena contracta ${fmt(BEFORE.vc, 2)} cm, EROA ${fmt(BEFORE.eroa, 2)} cm²${cite('zoghbi2017')}.`;
    case 'septum':
      return `<b>Transseptal puncture.</b> The sheath tents the fossa ovalis, high and toward the back. The bicaval view shows superior and inferior, the short-axis view anterior and posterior; the four-chamber view gives the height above the annulus, ${h} cm here. For a flail leaflet the target is about 4.5–5.0 cm${cite('little2026')}.`;
    case 'steer':
      return `<b>Steering.</b> The guide sits across the septum. The clip is steered down to the valve, over the jet's origin at A2–P2. The commissural view shows its medial-lateral position, the long-axis view its anterior-posterior position${cite('zamorano2011')}.`;
    case 'align':
      return `<b>Alignment.</b> Above the valve the arms open, and the clip turns until the arms are square to the line of coaptation. The 3D en face view shows the turn${cite('little2026')}. In the commissural view the aligned arms show edge-on, as one line; in the long-axis view both arms show, open.`;
    case 'grasp':
      return `<b>Grasping.</b> With its arms at about 60°, the clip crosses into the LV. About 2 cm below the valve the arms open to about 120°, the clip comes back under A2 and P2, and the grippers drop. The long-axis and commissural views confirm both leaflets in the arms before the clip closes${cite('zamorano2011')}.`;
    case 'assess':
      return `<b>Assessment before release.</b> Two thin jets remain, one on each side of the clip: mild MR, vena contracta ${fmt(RESID.med, 1)} cm or less${cite('zoghbi2019')}. The mean gradient is ${fmt(MG.after, 1)} mmHg at ${HR} bpm; under 5 mmHg is preferred${cite('little2026')}. The transgastric short axis shows the double orifice.`;
    case 'release':
      return `<b>Release.</b> The clip is released, and the delivery catheter and the guide come back. The puncture leaves an iatrogenic ASD with left-to-right flow; it persisted in 50% of patients at 6 months in one series${cite('schueler2015')}.`;
    default:
      return `<b>After: TTE.</b> The parasternal short axis shows the double orifice, and the apical four-chamber view the mild residual MR. Mean gradient ${fmt(MG.after, 1)} mmHg at ${HR} bpm. A TTE at 6 months shows the LV's remodeling${cite('zamorano2011')}.`;
  }
}

/** The bands under the slider: one for each step, coloured by the MR grade at that step. */
function paint() {
  const w = 1 / LAST;
  const list = STEPS.map((x, i) => ({ a: Math.max(0, (i - 0.5) * w), b: Math.min(1, (i + 0.5) * w), g: x.name }));
  const lev = Object.fromEntries(STEPS.map((x, i) => [x.name, i <= 4 ? 4 : 1]));
  const short = Object.fromEntries(STEPS.map((x) => [x.name, x.short]));
  paintBands(document.getElementById('tc-steps'), list, lev, short);
  return list;
}
let BANDS = [];

export default {
  key: 'mteer',
  part: 'structural',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Mitral transcatheter edge-to-edge repair',
  nav: 'M-TEER',
  dwell: 40,
  defaults: { tcS: 0 },
  format: {
    tcS: (x) => STEPS[stepAt(posOf(x))].name,
  },
  watch: ['tcS', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh) => draw(sh));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = paint();
  },
  enter() { startAll(); loadStills(); },
  warm() { startAll(); },
  // the tour, and a chapter video's captions, wait for the echo panes and the case's geometry
  // (the puncture height); a pane that failed does not hold them
  ready() {
    const ps = Object.values(P);
    if (geoFailed || ps.some((p) => p.state === 'failed')) return true;
    if (ps.some((p) => p.state !== 'ready')) return false;
    return !!geoOf(P.B.ev.model);
  },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: each step held 3.5 s, then 1.5 s to the next
  tourEnter(set) { set({ tcS: 0 }); },
  tourTick(tt, set) {
    const u = Math.max(0, tt - 0.5), k = Math.floor(u / 5), r = u - 5 * k;
    const s = k >= LAST ? LAST : k + (r < 3.5 ? 0 : ease((r - 3.5) / 1.5));
    set({ tcS: Math.round((s / LAST) * 1000) / 1000 });
  },
  tourAt(s) { return 0.5 + 5 * stepAt(posOf(s.tcS)); },
  text(s, { cite }) {
    const k = stepAt(posOf(s[KEY])), p = poseAt(k), g = GEO;
    const step = STEPS[k].key, after = k >= 5;
    const extra = {
      before: { k: 'Vena contracta', v: fmt(BEFORE.vc, 2), u: 'cm', flag: true },
      septum: { k: 'Height above annulus', v: g ? fmt(g.height, 1) : '–', u: 'cm', flag: g ? g.height < 4.5 || g.height > 5.0 : false },
      steer: { k: 'Clip', v: 'above A2–P2', text: true },
      align: { k: 'Arms to coaptation line', v: fmt(90 - p.rot), u: '°' },
      grasp: { k: 'Arms', v: fmt(p.arm), u: '°' },
      assess: { k: 'Mean gradient', v: fmt(MG.after, 1), u: 'mmHg', flag: MG.after > 5 },
      release: { k: 'Atrial septum', v: 'left-to-right shunt', text: true },
      after: { k: 'Mean gradient', v: fmt(MG.after, 1), u: 'mmHg', flag: MG.after > 5 },
    }[step];
    return {
      readouts: [
        { k: 'Step', v: `${k + 1} of ${STEPS.length}`, text: true },
        { k: 'Mitral regurgitation', v: after ? 'mild' : 'severe', text: true, flag: !after },
        extra,
      ],
      live: liveOf(k, cite),
    };
  },
};

export { BEFORE, MG, RESID, INFLOW, MVA_AFTER, DISEASES };

// ---------------------------------------------------------------- for tools
// tools/blender/export.js and the chapter video read the chapter's own state, so the Blender
// frames show the heart and the device that the echo panes cut.
/** The state at step position s and time tt (ms) for heart: the device's pose, the disease weights, the moves within the beat and the LV's own contraction. */
export function stateAt(s, tt, heart = 'normal') {
  const p = poseAt(s), sy = cycleAt(tt).s, f = flailAt(tt, p);
  return { pose: p, disease: diseaseOf(p, heart, sy), motion: f > 0 ? { tcFlail: f } : {}, lvK: lvOf(heart).k };
}
/** The case's geometry for the heart shown (the sites, the TEE frames), built once. */
export const caseGeometry = (model) => buildGeo(model.pheno.version);
/** The device in the frame that view ev holds, at pose p (gl/clipmesh.js deviceOf). */
export const deviceFor = (ev, g, p, along = null) => deviceOn(ev, g, p, along);
/** The hook that puts the held leaflets on the clip's arms in a view's frame (echo.js valveHook): set ev.valveHook before ev.frame(). */
export const holdFor = (g, p) => holdHook(g, p);
/** The motion from the base mesh to view ev's frame: { vm, sm } (gl/clipmesh.js valveMotion, septumMotion). */
export const motionFor = (ev, g) => motionOf(ev, g);
