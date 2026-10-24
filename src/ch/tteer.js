// Tricuspid transcatheter edge-to-edge repair (T-TEER) with a clip (the TriClip), by the
// transfemoral venous route. One slider steps through the procedure, and the figure is the screen
// that the interventional echocardiographer reads at each step. The case is massive secondary TR
// with a central coaptation gap (gl/tteermesh.js ttGap), in the dilated RV and RA of chapter
// Tricuspid regurgitation at that grade; one clip joins the anterior and septal leaflets.
//
// The figure has four panes. The left pane shows the procedure from outside the heart: a still for
// each step, rendered in Blender from the same heart mesh and device (tools/blender/). The other
// three panes are echo images cut live from the heart mesh with the device in it: the TEE planes
// that guide each step (src/ttviews.js), the 3D TEE en face view of the valve from the RA
// (src/enface3d.js), Doppler, and TTE before and after the procedure.
//
// Between two steps the device moves: its pose (gl/tteermesh.js deviceOf) eases from one step's
// keys to the next, and the panes change half-way. The values are teaching values inside the
// ranges of the sources, not patient data.
import * as THREE from '../../vendor/three.bundle.min.js';
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV, cycleAt, mitralV } from '../cyclemodel.js';
import { Beat, cursor, rows, cols, inner, note, fit, shown as rounded, paintBands, playSeverity } from '../sev.js';
import { jet, barFor, heartShown } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { onPlane, blood, cavity, sub, add, mul, dot, unit, len } from '../meshjet.js';
import { rvGrowOf, raWeight } from '../meshcal.js';
import { scanner } from '../scanner.js';
import { diseaseTargets, lvMask } from '../model3d.js';
import { teeAnatomy, framesOf, planeAt } from '../teeviews.js';
import * as TTV from '../ttviews.js';
import * as TT from '../gl/tteermesh.js';
import * as CM from '../gl/clipmesh.js';
import { cutMesh } from '../gl/prostheticmesh.js';
import { EnFace } from '../enface3d.js';
import { valuesAt as trValuesAt, trCW, hvPW } from './tr.js';

const KEY = 'ttS';
const NYQ = 60;              // cm/s, the color scale (ASE 2017: 50-70 cm/s)
const T_SYS = 250;           // ms after the R wave: the frame held in systole when the cine is off
/** The disease keys of the chapter's heart (phenomesh.js DISEASE). */
const DISEASES = ['rvGrow', 'raGrow', 'ttGap', 'ttGrasp', 'ttHalf', 'ttClip'];
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
/** Points and directions in world space (arrays of three): the sum, and a multiple. meshjet.js's add and mul are for plane points. */
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------------------------------------------------------- the steps
/** The steps, as the slider's bands name them: the full name and the short one. */
export const STEPS = [
  { key: 'before', name: 'Before: TTE', short: 'TTE' },
  { key: 'guide', name: 'Guide in the RA', short: 'Guide' },
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
 * The device's pose along the steps (gl/tteermesh.js REST_POSE), keyed at step positions and
 * eased between them. The guide comes up the IVC into the RA and points at the valve; the clip is
 * steered down over the anteroseptal line of coaptation. Above the valve the arms open to 180
 * degrees, and the clip turns until the arms lie square to the line. The arms close to 60 degrees
 * to cross the valve, the clip goes into the RV, opens to 120 degrees and comes back up under the
 * anterior and septal leaflets; the grippers drop and the arms close until the leaflets meet. Then
 * the clip is released and the system comes back out.
 */
const POSE_KEYS = [
  [0, { show: 0, guide: 0, steer: 0, depth: 1.8, rot: 35, arm: 0, grip: 0, cap: 0, rel: 0, out: 0, gone: 0 }],
  [0.4, { show: 1 }],
  [1, { guide: 1 }],
  [2, { steer: 1, depth: 1.6 }],
  [2.5, { arm: 180, depth: 1.4 }],
  [3, { rot: 0 }],
  [3.15, { arm: 60 }],
  [3.35, { depth: -1.8 }],
  [3.5, { arm: 120 }],
  [3.75, { depth: -TT.CLIP.hinge, cap: 1 }],
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
// Before: massive TR, the values of chapter Tricuspid regurgitation at its slider's 0.66, with the
// right heart of that grade. After: one clip on the anteroseptal line; the residual jet and the
// hepatic veins of that chapter at 0.30 (moderate TR), in the same right heart (it remodels over
// months, not in minutes). The inflow's mean gradient through the orifices left by the clip.
export const S_BEFORE = 0.66, S_AFTER = 0.3;
const BEFORE = trValuesAt(S_BEFORE);
const AFTER = { ...trValuesAt(S_AFTER), rvb: BEFORE.rvb, ravi: BEFORE.ravi, ta: BEFORE.ta };
/** The orifices' area after the clip (cm², together) and the forward and residual volume through them in diastole (mL). */
const TVA_AFTER = 4.2;
const SV_TV = 95;
const HR = Math.round(60000 / RR);
/**
 * The inflow after the clip: E and A waves in the shape of cyclemodel.js mitralV (A at 0.6 of E,
 * a deceleration time of 220 ms), scaled so that the VTI times the orifices' area gives the volume
 * through them; its mean gradient is 4v² over the filling period, the trace the scanner takes.
 */
const INFLOW = (() => {
  const t0 = EV.mvo, t1 = RR + EV.mvc, step = 0.5, AE = 0.6, DT = 220;
  const fill = (E, A, dt) => {
    let vti = 0, s2 = 0, n = 0;
    for (let t = t0; t < t1; t += step) { const v = mitralV(t % RR, E, A, dt); vti += (v * step) / 10; s2 += v * v; n++; }
    return { vti, mg: (4 * s2) / n };
  };
  const E = SV_TV / TVA_AFTER / fill(1, AE, DT).vti;
  return { E, A: E * AE, dt: DT, mg: fill(E, E * AE, DT).mg, before: fill(BEFORE.E, BEFORE.A, 200).mg };
})();
/** The mean gradient (mmHg) as printed, before and after the clip. */
const MG = { before: rounded(INFLOW.before, 1), after: rounded(INFLOW.mg, 1) };
/** The beam's thickness across the image plane for the device's echo (cm, each side). */
const SLAB = 0.15;
/** The TR grade's word, lower case. */
const gradeWord = (v) => String(v.grade || '').toLowerCase();

// ---------------------------------------------------------------- the panes
let sheet = null, st = null;
const beat = new Beat(RR);
const redraw = () => { if (sheet) sheet.dirty = true; };

/** A TEE pane: a mesh panel whose plane comes from the chapter (an X-plane, the TG short axis), not from a views.js key. */
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
  a4c: new MeshPanel('a4c_rv', { diseases: DISEASES, lv: true, redraw }),
  psax: new MeshPanel('psax_tv', { diseases: DISEASES, lv: true, redraw }),
  B: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
  C: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
  D: new TeePanel({ diseases: DISEASES, lv: true, redraw }),
};
const startAll = () => { for (const p of Object.values(P)) p.start(); };

/** The disease weights at pose p for heart: the right heart of massive TR, the gap, the held leaflets. */
function diseaseOf(p, heart) {
  return {
    rvGrow: rvGrowOf(heart, BEFORE.rvb),
    raGrow: raWeight(BEFORE.ravi, heart),
    ttGap: 1,
    ...TT.holdWeights(rounded(p.arm, 1), rounded(p.cap, 3)),
  };
}

// ---------------------------------------------------------------- the geometry of the case
// The clip's site is found once on the rest mesh (gl/tteermesh.js). The TEE planes need it in the
// case's heart: the valve as the dilated right heart moves it, at end-diastole. A small view of its
// own cuts that frame once for each heart shown.
let GEO = null, geoVer = -1, geoFailed = false;
async function buildGeo(ver) {
  const S = await scanner();
  const shifts = await diseaseTargets(DISEASES), mask = await lvMask();
  const model = S.model, heart = model.pheno.key;
  const ev = S.make(64, 64, 'a4c', { fill: true });
  ev.setView('a4c', { animate: false });
  ev.setDisease({ rvGrow: rvGrowOf(heart, BEFORE.rvb), raGrow: raWeight(BEFORE.ravi, heart), ttGap: 1 }, shifts);
  ev.setMotion({});
  ev.setLvSys(1, mask);
  const c = cycleAt(0);
  ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
  const site = TT.tvSiteOf(model.heart.meshes.TricuspidValve, model.anat.normal());
  const vm = motionOf(ev, { site });
  const at = (p) => V3(vm.map(p)), dir = (v) => V3(vm.dir(v)).normalize();
  const G = teeAnatomy(ev), F = framesOf(G);
  const g = {
    ver, site, F, G,
    C: at(site.C), N: dir(site.N), S0: dir(site.S0), A0: dir(site.A0), Ac: dir(site.Ac), Bc: dir(site.Bc),
    Q: at(site.Q), Q0: at(site.Q0),
    av: model.anat.point('av', 0, 0), ra: model.anat.point('ra_c', 0, 0),
    ivc: V3(CM.CAVA.ivc),
  };
  // the coaptation point in mid-systole: the annulus moves toward the apex in systole, so the
  // transgastric short axis, square to the valve's axis, is set where the shut leaflets lie
  const cs = cycleAt(T_SYS);
  ev.frame({ s: cs.s, v: cs.v, drive: cs.drive, phase: cs.phase, t: cs.t });
  g.Q0sys = V3(motionOf(ev, { site }).map(site.Q0));
  return g;
}
/** The geometry of the heart shown, or null while it is built. */
function geoOf(model) {
  const ver = model.pheno.version;
  if (GEO && GEO.ver === ver) return GEO;
  if (geoVer !== ver) {
    geoVer = ver;
    buildGeo(ver).then((g) => { if (g.ver === model.pheno.version) { GEO = g; redraw(); } })
      .catch((err) => { geoFailed = true; console.error('T-TEER geometry failed:', err); });
  }
  return null;
}

/**
 * A mesh's base positions in world space (echo.js MeshData): the shape on which
 * gl/tteermesh.js found the site, before any heart, disease or beat.
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
/** The tricuspid valve's motion from the base mesh to the frame that view ev holds. */
function motionOf(ev, g) {
  const vd = ev.valves.find((v) => v.mesh.name === 'TricuspidValve');
  return TT.valveMotion(g.site, worldBase(vd), vd.pos);
}
/**
 * The walls' clearance in the frame that view ev holds: a function that moves a point off the
 * myocardium until room cm lie between them (gl/tteermesh.js deviceOf clear).
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
/** The device in the frame that view ev holds, at pose p: { parts, clip, path, tip }. */
function deviceOn(ev, g, p) {
  return TT.deviceOf(g.site, p, motionOf(ev, g), CM.CAVA, clearanceOf(ev));
}
/** The B-mode items of the device on plane gg of view ev (echo.js extraItems); the device stays on ev for the labels and the 3D pane. */
const deviceHook = (g, p) => (ev, gg) => {
  const D = deviceOn(ev, g, p);
  ev.ttDevice = D;
  ev.ttDeviceKey = poseKey(p);
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
 * The multiplane icon in the image's top right corner, after the TEE chapter's: a half circle open
 * at the top, 0 at its left end and 180 at its right, the angle above it and a white needle that
 * turns counterclockwise (Hahn 2013).
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
/** The jet's strength over systole (0 to 1): from tricuspid closure to opening; tri peaks it early. */
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
/**
 * The RA and the RV on the plane, cut apart at the leaflets (plane cm polygons), in the frame of
 * view ev; F, the pane's frame, stops them at the image's edges.
 */
function chambersOf(ev, g, F = null) {
  const vm = motionOf(ev, g);
  const N = V3(vm.dir(g.site.N)).normalize(), Q0 = V3(vm.map(g.site.Q0)), Q = V3(vm.map(g.site.Q));
  // the line through the leaflets' coaptation, parallel to the annulus: the RA's floor in systole
  // is the shut leaflets, and the line closes the gap between them
  const cut = lineOn(ev, Q0.clone().addScaledVector(N, -0.05), N);
  const cuts = cut ? [cut] : [];
  for (const V of ev.last.valves) {
    if (!V.skirt || V.pts.length < 2) continue;
    const m = V.pts.length;
    for (let i = 0; i < m - 1 + (V.closed ? 1 : 0); i++) cuts.push({ a: V.pts[i], b: V.pts[(i + 1) % m], ends: 0 });
  }
  if (F) {
    const bx = F.view.box, k = F.k, u = (X) => (X - F.sect.cx) / k, v = (Y) => (Y - F.sect.top) / k;
    const u0 = u(bx.x), u1 = u(bx.x + bx.w), v0 = Math.max(v(bx.y), 0.4), v1 = v(bx.y + bx.h);
    cuts.push([[u0, v0], [u0, v1]], [[u1, v0], [u1, v1]], [[u0, v0], [u1, v0]], [[u0, v1], [u1, v1]]);
  }
  const ra = cavity(ev, blood(ev, onPlane(ev, Q0.clone().addScaledVector(N, 1.8))), cuts);
  const rv = cavity(ev, blood(ev, onPlane(ev, Q0.clone().addScaledVector(N, -2.0))), cuts);
  return { ra, rv, N, Q0, Q, vm };
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

/**
 * A TR jet from world point W at the leaflets' level: up into the RA along the valve's axis, with
 * its flow convergence on the RV side. v: the TR values (tr.js): the vena contracta and the jet's
 * share of the RA set its size; a residual jet (small) leans a little away from the clip.
 */
function trJetFrom(c, F, ev, g, tt, W, v, lean = null) {
  const cy = cycleAt(tt), a = strengthAt(cy.t, v.triD ?? 0);
  if (!(a > 0.02)) return null;
  const K = chambersOf(ev, g, F);
  if (K.ra.length < 12) return null;
  if (Math.abs(W.clone().sub(ev.g.O).dot(ev.g.n)) > 1.3) return null;
  const O = onPlane(ev, W);
  let up = unit(sub(onPlane(ev, W.clone().addScaledVector(K.N, 1)), O));
  if (lean) { const l = sub(onPlane(ev, W.clone().add(lean)), O); if (len(l) > 0.05) up = unit(add(up, mul(unit(l), 0.25))); }
  // the jet's length and width from its share of the RA on the plane, as chapter 19 sizes it
  let lMax = 0;
  for (const p of K.ra) lMax = Math.max(lMax, dot(sub(p, O), up));
  const raArea = Math.abs(K.ra.reduce((s, p, i) => { const q = K.ra[(i + 1) % K.ra.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const jA = Math.min(((v.jet || 10) / 100) * raArea, raArea * 0.8);
  const jl = Math.min(lMax * 0.95, Math.sqrt((jA / 0.55) * 1.2));
  const jw = jl > 0 ? jA / (0.55 * jl) : 0;
  const q = 2 * Math.PI * (v.r || 0.3) ** 2 * 28;
  return jet(c, F, { q, va: NYQ, vmax: (v.vmax || 2.5) * 100 * 0.3, vc: v.vc, jl, jw, a, O, dir: up, clip: K.ra, pclip: K.rv.length > 12 ? K.rv : null, pisa: K.rv.length > 12, box: false });
}
/** Before the clip: the central jet through the coaptation gap. */
function drawGapJet(c, F, ev, g, tt) {
  const vm = motionOf(ev, g), W = V3(vm.map(g.site.Q0)).addScaledVector(V3(vm.dir(g.site.N)).normalize(), 0.1);
  const b = trJetFrom(c, F, ev, g, tt, W, BEFORE);
  if (b) { colorBox(c, F, [b]); barFor(c, F, -NYQ, NYQ); }
}
/** After the clip: the residual jet through the gap left between the clip and the posterior leaflet. */
function drawResidualJet(c, F, ev, g, tt) {
  const vm = motionOf(ev, g);
  const Q0 = V3(vm.map(g.site.Q0)), Q = V3(vm.map(g.site.Q)), N = V3(vm.dir(g.site.N)).normalize();
  const W = Q0.clone().addScaledVector(Q0.clone().sub(Q), 0.45).addScaledVector(N, 0.1);
  const b = trJetFrom(c, F, ev, g, tt, W, AFTER, Q0.clone().sub(Q).normalize());
  if (b) { colorBox(c, F, [b]); barFor(c, F, -NYQ, NYQ); }
}

// ---------------------------------------------------------------- the planes of each step
/**
 * The TEE planes on the case's heart g, at pose p. The grasp's X-plane: the plane along the
 * anteroseptal line through the clip's site, and the plane across it through the cursor on the
 * clip (src/ttviews.js). The four-chamber and the RV inflow-outflow planes. The transgastric short
 * axis through the shut leaflets.
 */
function planes(g, p) {
  const zoomOn = (x, at, w) => ({ uv: [0, at.clone().sub(x.g.O).dot(x.g.d)], w });
  const aim = p.show > 0 && p.steer > 0.5 ? g.Q.clone().addScaledVector(g.N, clamp(p.depth, -1.6, 1.6) + 0.3) : g.Q;
  const X = TTV.grasp(g.F, aim, aim, g.Bc, g.Ac);
  const up = (k) => g.Q0.clone().addScaledVector(g.N, k);
  const along = { ...X.primary, key: 'along', name: `ME X-PLANE ${Math.round(X.primary.ang)}° · ALONG THE LINE`, short: `X ${Math.round(X.primary.ang)}°`, depth: 11 };
  along.zoom = zoomOn(along, g.Q, 6);
  along.names = [[up(2.4), 'RA'], [up(-2.6), 'RV']];
  const across = { ...X.secondary, key: 'across', name: `ME X-PLANE ${Math.round(X.secondary.ang)}° · ACROSS THE LINE`, short: `X ${Math.round(X.secondary.ang)}°`, depth: 11 };
  across.zoom = zoomOn(across, g.Q, 6);
  across.names = [[up(2.4), 'RA'], [up(-2.6), 'RV']];
  const f4 = TTV.fourC(g.F, g.C);
  const four = { ...f4, key: 'me4c', name: 'ME FOUR-CHAMBER', short: '4C', depth: 13, names: [[up(2.6), 'RA'], [up(-3.0), 'RV']] };
  four.zoom = zoomOn(four, g.C, 8.5);
  // the RV inflow-outflow view through the valve's middle, at its own angle
  const IO = TTV.inflow(g.F, g.C, planeAt);
  const rvio = { ...IO, key: 'rvio', name: 'ME RV INFLOW-OUTFLOW', short: 'RV In-Out', depth: 12, names: [[up(2.6), 'RA'], [up(-3.0), 'RV']] };
  rvio.zoom = zoomOn(rvio, g.C, 8.5);
  // through the shut leaflets near their tips, where it cuts each leaflet and the gap between them
  const T = TTV.tgShort(g.F, g.Q0sys.clone().addScaledVector(g.N, 0.1), g.N);
  const tg = { ...T, key: 'tg', name: 'TG SHORT AXIS · TRICUSPID VALVE', short: 'TG SAX', depth: Math.min(14, T.depth + 3), names: [] };
  tg.zoom = { uv: [0, T.depth], w: 6.5 };
  tg.leaflets = true;
  return { along, across, four, rvio, tg };
}

// ---------------------------------------------------------------- the echo panes
/** A TTE pane: a4c (RV focused) or psax (tricuspid valve), with the device and o.color: 'gap' or 'residual'. */
function tte(ctx, box, which, p, tt, g, o = {}) {
  const pane = P[which];
  const titles = {
    a4c: [`APICAL FOUR-CHAMBER, RV FOCUSED · COLOR ${NYQ} cm/s`, `A4C RV · COLOR ${NYQ}`, 'A4C RV'],
    psax: [`PARASTERNAL SHORT AXIS · TRICUSPID VALVE · COLOR ${NYQ}`, 'PSAX · TV', 'PSAX'],
  }[which];
  const names = {
    a4c: [['lv', 'LV', 'apex', 0.45], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA']],
    psax: [['ra', 'RA'], ['rv', 'RV']],
  }[which];
  return pane.draw(ctx, box, titleOf(ctx, box.w, titles), {
    tms: tt, disease: (heart) => diseaseOf(p, heart), motion: {}, lvK: 1,
    deeper: which === 'a4c' ? 1.5 : 0,
    extra: p.show > 0 ? deviceHook(g, p) : null, extraKey: p.show > 0 ? poseKey(p) : '',
    names,
    over: (c, F, ev) => {
      if (o.color === 'gap') drawGapJet(c, F, ev, g, tt);
      else if (o.color === 'residual') drawResidualJet(c, F, ev, g, tt);
    },
  });
}

/** The leaflets' initials on the transgastric short axis: A, S and P where the plane cuts them. */
function leafletTags(g) {
  const out = [];
  for (const [arc, t] of [['anterior', 'A'], ['septal', 'S'], ['posterior', 'P']]) {
    out.push([(ev) => {
      const vm = motionOf(ev, g), A = g.site.arcs[arc];
      const h = vm.map(g.site.hingeAt(A.mid)), q = vm.map(g.site.Q0);
      const w = V3(add3(mul3(h, 0.55), mul3(q, 0.45))).addScaledVector(V3(vm.dir(g.site.N)).normalize(), -0.3);
      return Math.abs(w.clone().sub(ev.g.O).dot(ev.g.n)) < 1.2 ? onPlane(ev, w) : null;
    }, t]);
  }
  return out;
}

/** A TEE pane: view x of planes(), with the device; o.color: 'gap' or 'residual'. */
function tee(ctx, box, pane, x, p, tt, g, o = {}) {
  const key = `${x.key}|${x.g.O.toArray().map((v) => v.toFixed(3))}|${x.g.d.toArray().map((v) => v.toFixed(4))}|${x.g.r.toArray().map((v) => v.toFixed(4))}`;
  pane.plane(x.g, teeSpec(x.short, x.name, x.depth, x.zoom || null), key);
  const F = pane.draw(ctx, box, titleOf(ctx, box.w, [`TEE · ${x.name}`, `TEE · ${x.short}`, x.short]), {
    tms: tt, disease: (heart) => diseaseOf(p, heart), motion: {}, lvK: 1,
    extra: p.show > 0 ? deviceHook(g, p) : null, extraKey: `${p.show > 0 ? poseKey(p) : ''}|${x.key}`,
    names: [...(x.names || []).map(([w, t]) => [(ev) => onPlane(ev, w), t]), ...(x.leaflets ? leafletTags(g) : []), ...deviceNames(g, x, p)],
    over: (c, F2, ev) => {
      if (o.color === 'gap') drawGapJet(c, F2, ev, g, tt);
      else if (o.color === 'residual') drawResidualJet(c, F2, ev, g, tt);
    },
  });
  if (F) angleIcon(ctx, F.view.box, x.ang);
  return F;
}

/** The device's name on a TEE plane: the guide or the clip, where the plane cuts it. */
function deviceNames(g, x, p) {
  if (!(p.show > 0)) return [];
  const near = (ev, w) => (Math.abs(w.clone().sub(ev.g.O).dot(ev.g.n)) < 0.9 ? onPlane(ev, w) : null);
  if (p.steer < 0.3) {
    return [[(ev) => {
      const D = ev.ttDevice;
      return D && D.tip ? near(ev, V3(D.tip).addScaledVector(g.N, 0.6)) : null;
    }, 'guide']];
  }
  if (x.key !== 'along' && x.key !== 'across' && x.key !== 'me4c') return [];
  return [[(ev) => {
    const D = ev.ttDevice;
    if (!D || !D.clip) return null;
    const c = V3(D.clip.top);
    return near(ev, c.addScaledVector(g.N, 0.4).addScaledVector(x.key === 'across' ? g.Ac : g.Bc, 1.0));
  }, 'clip']];
}

// ---------------------------------------------------------------- the 3D pane
let enface = null, enfaceFailed = false;
/**
 * The 3D TEE en face view of the valve from the RA, from the frame that view ev holds: the septal
 * leaflet at 6 o'clock, the aortic valve's side up, with the leaflets' initials.
 */
function enFacePane(ctx, box, ev, g, p) {
  panel(ctx, box.x, box.y, box.w, box.h, titleOf(ctx, box.w, ['3D TEE · EN FACE FROM THE RA', '3D TEE · EN FACE', '3D EN FACE']));
  const bx = { x: box.x + 1, y: box.y + 24, w: box.w - 2, h: box.h - 25 };
  if (!ev || enfaceFailed) { note(ctx, bx, enfaceFailed ? '3D view unavailable' : 'loading the heart model', 'top'); return; }
  try { if (!enface) enface = new EnFace(400, 400); } catch (e) { enfaceFailed = true; console.error('3D view failed:', e); return; }
  const vm = motionOf(ev, g);
  const C = vm.map(g.site.C), N = unit3(vm.dir(g.site.N)), up = unit3(mul3(vm.dir(g.site.S0), -1));
  const D = p.show > 0 ? (ev.ttDevice && ev.ttDeviceKey === poseKey(p) ? ev.ttDevice : deviceOn(ev, g, p)) : null;
  const parts = D ? Object.fromEntries(Object.entries(D.parts).filter(([k]) => k !== 'guide')) : null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), side = Math.max(64, Math.round(Math.min(bx.w, bx.h) * dpr));
  enface.setSize(side, side);
  const hTop = D && D.clip ? dot3(D.clip.top, C, N) : 0;
  const cv = enface.draw(ev, C, N, up, parts, { top: clamp(hTop + 0.3, 1.1, 2.8), zoom: 6.6, valves: ['TricuspidValve', 'AorticValve'], chords: ['TricuspidChordae'], regions: [4, 5], reach: 2.6, cropTop: 0.9, cropBottom: -0.8 });
  const sz = side / dpr, x0 = bx.x + (bx.w - sz) / 2, y0 = bx.y + (bx.h - sz) / 2;
  ctx.drawImage(cv, x0, y0, sz, sz);
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
  for (const [arc, t] of [['anterior', 'A'], ['septal', 'S'], ['posterior', 'P']]) {
    const A = g.site.arcs[arc], h = vm.map(g.site.hingeAt(A.mid)), q = vm.map(g.site.Q0);
    tag(add3(mul3(h, 0.62), mul3(q, 0.38)), t);
  }
  ctx.restore();
}
const unit3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** The height of point p above point C along n (arrays). */
const dot3 = (p, C, n) => (p[0] - C[0]) * n[0] + (p[1] - C[1]) * n[1] + (p[2] - C[2]) * n[2];

// ---------------------------------------------------------------- Doppler
/**
 * CW Doppler of the tricuspid inflow after the clip: the inflow through the orifices with its
 * traced envelope and mean gradient, and the faint residual TR. TEE: the inflow runs away from the
 * probe, below the baseline; TTE (apical): toward it, above the baseline.
 */
function inflowCW(ctx, box, tteView) {
  panel(ctx, box.x, box.y, box.w, box.h, fit(box.w, tteView ? `CW · TRICUSPID INFLOW · APICAL · HR ${HR}` : `CW · TRICUSPID INFLOW · TEE · HR ${HR}`, 'CW · TV'));
  const bx = inner(box);
  const M = INFLOW, span = 2 * RR, sg = tteView ? 1 : -1;
  const vs = 3.0, base = tteView ? 0.62 : 0.38;
  const inflow = (u) => sg * mitralV((u * span) % RR, M.E, M.A, M.dt);
  const tr = (u) => -sg * AFTER.vmax * strengthAt((u * span) % RR, 0);
  spectral(ctx, bx, { fn: [inflow, tr], scale: vs, base, mode: 'cw', broad: 0.35, gain: [1, 0.35], key: `ttcw|${tteView}|${M.E.toFixed(3)}`, seed: 43 });
  vscale(ctx, bx, vs, base, 1);
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
// The Blender stills (assets/tteer/<step>.webp), one for each step, loaded when the chapter first
// shows. Between two steps the two stills cross-fade. A chapter video gives frames of its own along
// the steps (video/chapter.js): window.__videoFrames(s) returns the two round step position s and
// the share of the second.
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
      const r = await fetch(`assets/tteer/${s.key}.webp`);
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
    const gr = c.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
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
    case 'before': return { B: ['tte', 'a4c', { color: 'gap' }], C: ['tte', 'psax', { color: 'gap' }], D: ['trcw', false] };
    case 'guide': return { B: ['tee', x.four, {}], C: ['tee', x.rvio, {}], D: ['enface'] };
    case 'steer': return { B: ['tee', x.along, {}], C: ['tee', x.across, {}], D: ['enface'] };
    case 'align': return { B: ['tee', x.tg, {}], C: ['tee', x.across, {}], D: ['enface'] };
    case 'grasp': return { B: ['tee', x.along, {}], C: ['tee', x.across, {}], D: ['tee', x.tg, {}] };
    case 'assess': return { B: ['tee', x.four, { color: 'residual' }], C: ['cw', false], D: ['tee', x.tg, {}] };
    case 'release': return { B: ['tee', x.four, {}], C: ['tee', x.across, {}], D: ['enface'] };
    default: return { B: ['tte', 'a4c', { color: 'residual' }], C: ['hv', true], D: ['cw', true] };
  }
}

/** Draw pane spec into box (which: B, C or D, the TEE panel); returns the view it drew on, for the 3D pane. */
function drawPane(ctx, box, spec, which, p, tt, g, lastEv) {
  const [kind, a, o] = spec;
  if (kind === 'tte') { tte(ctx, box, a, p, tt, g, o); return P[a].state === 'ready' ? P[a].ev : null; }
  if (kind === 'tee') { tee(ctx, box, P[which], a, p, tt, g, o); return P[which].ev; }
  if (kind === 'cw') { inflowCW(ctx, box, a); return null; }
  if (kind === 'trcw') { trCW(ctx, box, BEFORE); return null; }
  if (kind === 'hv') { hvPW(ctx, box, AFTER); return null; }
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
  const need = [P.B, P.C, P.D, P.a4c, P.psax];
  if (!g || need.some((x) => x.state !== 'ready')) {
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
  switch (STEPS[k].key) {
    case 'before':
      return `<b>Massive secondary TR.</b> The RV and the annulus are dilated, and the leaflets no longer meet: a central gap lets a wide jet into the RA. Vena contracta ${fmt(BEFORE.vc, 1)} cm, PISA EROA ${fmt(BEFORE.eroa, 2)} cm², in the massive grade of the five-grade scale${cite('hahn2023')}; the hepatic veins show systolic flow reversal${cite('zoghbi2017')}.`;
    case 'guide':
      return `<b>Guide in the RA.</b> From the femoral vein, the steerable guide comes up the IVC into the RA${cite('fdap230007c')}. Here the four-chamber and RV inflow-outflow views show its tip above the valve; the bicaval view keeps it clear of the septum, the Eustachian valve and leads${cite('hahn2025')}.`;
    case 'steer':
      return `<b>Steering.</b> The delivery system flexes down toward the valve, over the anteroseptal line of coaptation${cite('hahn2025')}. The X-plane from the mid-esophagus shows the clip along the line and across it.`;
    case 'align':
      return `<b>Alignment.</b> In the RA the arms open to about 180°${cite('fdap230007c')}, and the clip turns until the arms are square to the anteroseptal line. The 3D en face view shows the turn most accurately, and the transgastric short axis checks it${cite('hahn2025')}.`;
    case 'grasp':
      return `<b>Grasping.</b> The arms close to 60° or less, and the clip goes below the valve into the RV. The arms open to the grasping angle, the clip comes back under the anterior and septal leaflets, and the grippers drop${cite('fdap230007c')}. The X-plane shows both leaflets on the arms before the clip closes${cite('hahn2025')}.`;
    case 'assess':
      return `<b>Assessment before release.</b> One jet remains, through the gap beside the clip: ${gradeWord(AFTER)} TR, vena contracta ${fmt(AFTER.vc, 1)} cm. The 3D vena contracta area grades it better than PISA, which tends to overestimate it with a clip in place${cite('hahn2025')}. The mean gradient is ${fmt(MG.after, 1)} mmHg at ${HR} bpm; TVARC asks for less than 5 mmHg${cite('hahn2023')}.`;
    case 'release':
      return `<b>Release.</b> The clip is released, and the delivery system and the guide come back down the IVC${cite('onishi2026')}. No septum is crossed, so no atrial septal defect remains${cite('onishi2026')}.`;
    default:
      return `<b>After: TTE.</b> The RV-focused four-chamber view shows the residual jet, ${gradeWord(AFTER)} TR. Systolic flow in the hepatic veins is forward again, though blunted${cite('zoghbi2017')}. Mean gradient ${fmt(MG.after, 1)} mmHg at ${HR} bpm.`;
  }
}

/** The bands under the slider: one for each step, coloured by the TR grade at that step. */
function paint() {
  const w = 1 / LAST;
  const list = STEPS.map((x, i) => ({ a: Math.max(0, (i - 0.5) * w), b: Math.min(1, (i + 0.5) * w), g: x.name }));
  const lev = Object.fromEntries(STEPS.map((x, i) => [x.name, i <= 4 ? 4 : 2]));
  const short = Object.fromEntries(STEPS.map((x) => [x.name, x.short]));
  paintBands(document.getElementById('tt-steps'), list, lev, short);
  return list;
}
let BANDS = [];

export default {
  key: 'tteer',
  part: 'structural',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Tricuspid transcatheter edge-to-edge repair',
  nav: 'T-TEER',
  dwell: 40,
  defaults: { ttS: 0 },
  format: {
    ttS: (x) => STEPS[stepAt(posOf(x))].name,
  },
  watch: ['ttS', 'pheno'],
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
  // the tour, and a chapter video's captions, wait for the echo panes and the case's geometry; a
  // pane that failed does not hold them
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
  tourEnter(set) { set({ ttS: 0 }); },
  tourTick(tt, set) {
    const u = Math.max(0, tt - 0.5), k = Math.floor(u / 5), r = u - 5 * k;
    const s = k >= LAST ? LAST : k + (r < 3.5 ? 0 : ease((r - 3.5) / 1.5));
    set({ ttS: Math.round((s / LAST) * 1000) / 1000 });
  },
  tourAt(s) { return 0.5 + 5 * stepAt(posOf(s.ttS)); },
  text(s, { cite }) {
    const k = stepAt(posOf(s[KEY])), p = poseAt(k);
    const step = STEPS[k].key, after = k >= 5;
    const extra = {
      before: { k: 'Vena contracta', v: fmt(BEFORE.vc, 1), u: 'cm', flag: true },
      guide: { k: 'Route', v: 'femoral vein, IVC', text: true },
      steer: { k: 'Clip', v: 'over the anteroseptal line', text: true },
      align: { k: 'Arms to coaptation line', v: fmt(90 - p.rot), u: '°' },
      grasp: { k: 'Arms', v: fmt(p.arm), u: '°' },
      assess: { k: 'Mean gradient', v: fmt(MG.after, 1), u: 'mmHg' },
      release: { k: 'Atrial septum', v: 'not crossed', text: true },
      after: { k: 'Mean gradient', v: fmt(MG.after, 1), u: 'mmHg' },
    }[step];
    return {
      readouts: [
        { k: 'Step', v: `${k + 1} of ${STEPS.length}`, text: true },
        { k: 'Tricuspid regurgitation', v: after ? gradeWord(AFTER) : gradeWord(BEFORE), text: true, flag: !after },
        extra,
      ],
      live: liveOf(k, cite),
    };
  },
};

export { BEFORE, AFTER, MG, INFLOW, DISEASES };

// ---------------------------------------------------------------- for tools
// tools/blender/export.js and the chapter video read the chapter's own state, so the Blender
// frames show the heart and the device that the echo panes cut.
/** The state at step position s and time tt (ms) for heart: the device's pose, the disease weights, the moves within the beat and the LV's own contraction. */
export function stateAt(s, tt, heart = 'normal') {
  const p = poseAt(s);
  return { pose: p, disease: diseaseOf(p, heart), motion: {}, lvK: 1 };
}
/** The case's geometry for the heart shown (the site, the TEE frames), built once. */
export const caseGeometry = (model) => buildGeo(model.pheno.version);
/** The device in the frame that view ev holds, at pose p (gl/tteermesh.js deviceOf). */
export const deviceFor = (ev, g, p) => deviceOn(ev, g, p);
/** The valve's motion from the base mesh to view ev's frame (gl/tteermesh.js valveMotion). */
export const motionFor = (ev, g) => motionOf(ev, g);
/** The figure's boxes for a canvas of W x H CSS px (tools/shorts/ crops the panes from a video frame). */
export const paneBoxes = (W, H) => layout(W, H);
