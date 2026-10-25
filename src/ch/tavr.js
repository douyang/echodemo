// Transcatheter aortic valve replacement (TAVR) with a balloon-expandable valve, by the
// transfemoral route. One slider steps through the procedure, and the figure is the screen that the
// interventional echocardiographer reads at each step: TTE before; on TEE, the annulus measured,
// the valve crossed and placed, deployed and checked; TTE after. A switch sets the paravalvular
// regurgitation that the check finds (none to severe).
//
// The figure has four panes, as in chapters M-TEER and T-TEER. The left pane shows the procedure
// from outside the heart: a still for each step, rendered in Blender from the same heart mesh and
// valve (tools/blender/). The other three panes are cut live from the heart mesh with the valve,
// its delivery system and the native leaflets in it (gl/tavrmesh.js): the TEE aortic valve long
// and short axes (Hahn 2013, views 6 and 10; teeviews.js), the TEE long axis, the parasternal views,
// color Doppler of the paravalvular jets in diastole, CW Doppler through the valve and PW Doppler
// in the LVOT.
//
// Between two steps the valve moves: it comes down to the annulus, expands under rapid pacing, and
// its delivery system comes out; the panes change half-way. The values are teaching values inside
// the ranges of the sources, not patient data. The self-expanding valve's model stays in the code
// (SHOW_SE).
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, caliper, tagBox, SC } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { shown, Beat, cursor, rows, cols, inner, note, gradeTable, paintBands, playSeverity, cine } from '../sev.js';
import { cal, jet } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { asWeights } from '../meshcal.js';
import { annulusOf } from '../gl/prostheticmesh.js';
import { wallOf, tavrItems, tavrParts, frameAt, inflowAt } from '../gl/tavrmesh.js';
import { teeAnatomy, framesOf, planeAt, BY_KEY } from '../teeviews.js';

const T_KEY = 'tavrT';
const VALVE = 'tavrValve';
const LEAK = 'tavrLeak';
/** The self-expanding valve: its model stays, and the figure shows one device, as M-TEER and T-TEER do. */
const SHOW_SE = false;

// ---------------------------------------------------------------- the steps
/** The steps, as the slider's bands name them: the full name and the short one. */
export const STEPS = [
  { key: 'before', name: 'Before: TTE', short: 'TTE' },
  { key: 'measure', name: 'Measure', short: 'Measure' },
  { key: 'cross', name: 'Cross', short: 'Cross' },
  { key: 'deploy', name: 'Deploy', short: 'Deploy' },
  { key: 'check', name: 'Check', short: 'Check' },
  { key: 'after', name: 'After: TTE', short: 'TTE' },
];
const LAST = STEPS.length - 1;
/** The step position (0 to 5) of the slider's value. */
export const posOf = (x) => clamp(x, 0, 1) * LAST;
/** The step shown at step position s: the nearest one. */
export const stepAt = (s) => clamp(Math.round(s), 0, LAST);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ease = smooth;

// Between two steps the valve moves (step positions). From Measure to Cross the delivery system
// comes up the aorta and the crimped valve comes down from the ascending aorta to its place over
// the annulus; from Cross to Deploy the balloon fills under rapid pacing and the frame expands; from
// Deploy to Check the balloon empties, pacing stops and the delivery system comes out.
/** The delivery system and the wire in place. */
const systemAt = (s) => s > 1.05 && s < 3.5;
/** cm above its final place, as the crimped valve comes down. */
const dropAt = (s) => 4.5 * (1 - smooth((s - 1.15) / 0.75));
/** The frame's expansion, 0 crimped to 1 expanded. */
const expandAt = (s) => smooth((s - 2.15) / 0.7);
/** Rapid ventricular pacing: from the balloon's filling to its emptying. */
const pacingAt = (s) => s > 2.1 && s < 3.4;
/** From here on the new valve works, and its values are measured. */
const AFTER = 3.4;

// Each valve's EOA: the mean of its size in the core-lab normal values (ASE 2024, Appendix Tables
// A1-A2, from Hahn 2019): SAPIEN 3 26 mm, 1.74 cm² (mean gradient 10.6 mmHg); Evolut R 29 mm,
// 1.97 cm² (7.9 mmHg). With the model's flow the figure gives 10 and 7 mmHg.
const VALVES = {
  be: { name: 'balloon-expandable', short: 'Balloon-expandable', label: 26, eoa: 1.74 },
  se: { name: 'self-expanding', short: 'Self-expanding', label: 29, eoa: 1.97 },
};
// The paravalvular regurgitation the check finds, each grade inside its column of ASE 2024 Table
// 8: the share of the frame's circumference that its jets take (ext, %), the vena contracta's
// width (vc, cm), the regurgitant volume (mL), the pressure half-time of its CW signal (ms), and
// its jets: [angle from the root's posterior side (degrees), width (degrees)].
const LEAKS = {
  none: { name: 'none', ext: 0, vc: 0, rvol: 0, pht: null, jets: [] },
  mild: { name: 'mild', ext: 7, vc: 0.2, rvol: 15, pht: 650, jets: [[0, 25]] },
  moderate: { name: 'moderate', ext: 20, vc: 0.45, rvol: 40, pht: 340, jets: [[0, 40], [180, 32]] },
  severe: { name: 'severe', ext: 36, vc: 0.7, rvol: 62, pht: 170, jets: [[0, 55], [180, 45], [-95, 30]] },
};
const LVOT_D = 2.2;    // cm, measured just below the frame's inflow on the normal heart's mesh
const SV = 72;         // mL, the stroke volume with no leak
const BSA = 1.8;       // m²
const ET = 0.292;      // s, the model's ejection time (cyclemodel.js)
const AVA0 = 0.75;     // cm², the native valve before TAVR
// A new leak in a small, stiff ventricle: the LV takes up half of its volume as a larger stroke
// volume, and the forward volume falls by the other half (a model choice). The total crosses the
// valve in systole, so the flow and the gradient rise with the leak; the regurgitant fraction
// falls in its grade's column (19%, 43%, 60%).
const TAKEN = 0.5;

const valveOf = (s) => (SHOW_SE && s[VALVE] === 'se' ? 'se' : 'be');
const leakOf = (s) => (LEAKS[s[LEAK]] ? s[LEAK] : 'none');

// ---------------------------------------------------------------- the Doppler envelopes
// v(t) = V g(t / ET), g(u) = sin(π u^q)^p: q puts the peak at the acceleration time (AT/ET), p
// is fitted to the VTI and the peak velocity (as in as.js and prosthetic.js).
const P_LO = 0.1, P_HI = 24;
const shape = (q, p) => (u) => (u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * Math.pow(u, q)), p) : 0);
const memo = new Map();
function gMean(q, p) {
  const key = `${q.toFixed(5)}|${p.toFixed(5)}`;
  let m = memo.get(key);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < 240; i++) m += Math.pow(Math.sin(Math.PI * Math.pow((i + 0.5) / 240, q)), p);
    m /= 240;
    if (memo.size > 4000) memo.clear();
    memo.set(key, m);
  }
  return m;
}
const qOf = (atet) => Math.log(0.5) / Math.log(clamp(atet, 0.1, 0.6));

/**
 * The hemodynamics at step position s: before the new valve works, the native stenosis; after
 * it, the valve's EOA, and a paravalvular leak's volume in the flow across the LVOT and the valve.
 * While the balloon is full, rapid pacing leaves little forward flow (paced). The self-expanding
 * frame (SHOW_SE) widens the orifice as it expands, without pacing.
 */
function modelAt(s, valve, leak) {
  const L = LEAKS[leak], V = VALVES[valve], u = expandAt(s), after = s >= AFTER;
  const rvol = after ? L.rvol : 0, flow = SV + TAKEN * rvol;
  const csa = Math.PI * (LVOT_D / 2) ** 2;
  const eoa = after ? V.eoa : valve === 'se' ? AVA0 + (V.eoa - AVA0) * u : AVA0;
  // the native stenosis peaks late and rounded; the new valve early
  const k = valve === 'se' ? u : after ? 1 : 0;
  const atet = 0.42 + (0.27 - 0.42) * k, p = 0.62 + (0.95 - 0.62) * k;
  const vtiL = flow / csa, vtiA = flow / eoa;
  // from the Cross step on the valve sits at its place
  const placed = s >= 1.9 && dropAt(s) < 0.02;
  return {
    s, valve, leak, after, u, placed, paced: valve === 'be' && pacingAt(s), eoa, flow, rvol, rf: rvol / flow, vtiL, vtiA, atet, p,
    vmax: vtiA / (100 * ET * gMean(qOf(atet), p)), vL: vtiL / (100 * ET * gMean(1, 0.8)),
  };
}

/** The values as reported, each calculation from the rounded values before it; none during pacing. */
function measure(m) {
  const k = stepAt(m.s);
  const v = { ...m, L: LEAKS[m.leak], V: VALVES[m.valve], k, step: STEPS[k] };
  // mm the frame's inflow lies below the annulus, live as the frame expands and shortens
  v.depth = -inflowAt(m.valve, m.u) * 10;
  if (m.paced) {
    Object.assign(v, { vmax: NaN, vtiL: NaN, vtiA: NaN, vL: NaN, dvi: NaN, eoaShown: NaN, ieoa: NaN, mg: NaN, qA: qOf(m.atet), pA: m.p });
    v.crit = { mg: false, vmax: false, dvi: false, ar: true };
    v.success = false;
    return v;
  }
  v.vmax = shown(m.vmax, 1);
  v.vtiL = shown(m.vtiL, 1);
  v.vtiA = shown(m.vtiA, 1);
  v.vL = shown(m.vL, 2);
  v.dvi = shown(v.vtiL / v.vtiA, 2);
  v.eoaShown = shown((Math.PI * (LVOT_D / 2) ** 2 * v.vtiL) / v.vtiA, 2);
  v.ieoa = shown(v.eoaShown / BSA, 2);
  v.qA = qOf(m.atet);
  v.pA = m.p;
  v.mg = shown(4 * v.vmax ** 2 * gMean(v.qA, 2 * v.pA), 0);
  // the valve's intended performance, VARC-3's echo part of device success: each criterion met?
  v.crit = { mg: v.mg < 20, vmax: v.vmax < 3, dvi: v.dvi >= 0.25, ar: !['moderate', 'severe'].includes(m.leak) };
  v.success = Object.values(v.crit).every(Boolean);
  return v;
}

let lastKey = '', lastShown = null;
function shownOf(s) {
  const key = `${s[T_KEY]}|${valveOf(s)}|${leakOf(s)}`;
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(modelAt(posOf(s[T_KEY]), valveOf(s), leakOf(s))); }
  return lastShown;
}

let sheet = null, st = null;
const beat = new Beat(RR);
const redraw = () => { if (sheet) sheet.dirty = true; };

// ---------------------------------------------------------------- the TEE views
// The probe frames of the TEE views of the heart shown (teeviews.js), found once for each heart:
// the panels show the same heart.
let teeKey = '', teeFr = null;
function teeFrames(ev) {
  const P = ev.heart, key = `${P ? P.key : ''}:${P ? P.version : 0}`;
  if (key !== teeKey || !teeFr) {
    if (P && P.version !== ev.pv) ev.takePheno();
    teeFr = framesOf(teeAnatomy(ev));
    teeKey = key;
  }
  return teeFr;
}

/**
 * A TEE view of the heart mesh in a panel: the plane of a standard view (teeviews.js STD) at its
 * multiplane angle, or at the angle angle(ev) gives, moved along its normal by shift() cm (the
 * short axis, to the height that the step asks for; the long axis, onto the root's axis).
 */
class TeePanel extends MeshPanel {
  constructor(tee, spec, o = {}) {
    super('free', o);
    this.tee = tee;
    this.spec = spec;
    this.shiftOf = o.shift || null;
    this.angleOf = o.angle || null;
    this.ang = BY_KEY[tee].angle;
  }
  plane(tms) {
    const fr = teeFrames(this.ev)[this.tee];
    this.ang = this.angleOf ? this.angleOf(this.ev) : BY_KEY[this.tee].angle;
    const g = planeAt(fr, this.ang);
    const k = this.shiftOf ? this.shiftOf(this.ev, g, tms) : 0;
    if (k) g.O.addScaledVector(g.n, k);
    return { g, k };
  }
  draw(ctx, P, title, o = {}) {
    let key = '';
    if (this.state === 'ready') {
      const p = this.plane(o.tms ?? 0), spec = this.spec(this.ev, p.g);
      key = `${p.k.toFixed(3)}|${spec.zoom ? `${spec.zoom.uv.map((x) => x.toFixed(2)).join(',')}|${spec.zoom.w}` : ''}`;
      this.ev.setGeometry(p.g, spec, { animate: false });
    }
    return super.draw(ctx, P, title, { ...o, extraKey: `${o.extraKey || ''}|${teeKey}|${key}` });
  }
}

/**
 * The views' settings: a zoomed box (w cm wide) round the root, as TAVR imaging shows it: on the
 * long axis centered `along` cm up the root from the valve's centre (the self-expanding frame
 * reaches into the ascending aorta), on the short axis on the valve.
 */
function zoomed(name, short, w, along) {
  return (ev, g) => {
    const c = ev.anchors(0).av.clone().addScaledVector(ev.anat.aorticRoot.clone().normalize(), along());
    const q = c.sub(g.O);
    return { angle: 90, depth: 9, near: 0.4, labels: [], strict: true, short, name, win: 'psax', zoom: { uv: [q.dot(g.r), q.dot(g.d)], w: w() } };
  };
}
const LAX_SPEC = zoomed('ME aortic valve long axis', 'ME AV LAX · 120°', () => (valveOf(st) === 'se' ? 7.5 : 6.5), () => (valveOf(st) === 'se' ? 1.2 : 0.3));
const SAX_SPEC = zoomed('ME aortic valve short axis', 'ME AV SAX · 30°', () => 5.5, () => 0);
/** The ME long axis, whole: the LV, where the stiff wire curls in the apex, and the mitral valve. */
const ME_SPEC = () => ({ angle: 90, depth: 15, near: 0.4, labels: [], strict: true, short: 'ME LAX', name: 'ME long axis', win: 'psax' });

/**
 * The short axis's height on the root's axis above the hinge ring (cm), at step position s: the
 * cusps before deployment, the frame's skirt after it, where paravalvular jets pass the annulus.
 * The plane leans 15 degrees from square to the root (teeviews.js: as square as the beam allows),
 * so it crosses the frame 0.3 cm lower on one side than at the axis: at 0.15 cm it meets the skirt
 * of either frame all round, just above the balloon-expandable frame's inflow.
 */
const saxH = (s) => (expandAt(s) > 0 ? 0.15 : 0.75);
// The shift that brings the plane to that height at time tms of the beat. The root moves about
// 0.5 cm along its axis in each beat; the plane follows it, as the probe is adjusted to keep the
// level in view, so the frame's skirt stays in the image through the beat. The hinge ring's
// centre is found once for each heart, from a frame the panel has drawn, as an offset from the
// av landmark, which gives the root's motion.
const ringOff = {};
function saxShiftOf(ev, g, tms) {
  let R = ringOff[teeKey];
  if (!R) {
    const now = ev.last && ev.last.state;
    const F = now && annulusOf(ev, now.s);
    if (!F) return 0;
    const av = ev.anat.point('av', 0, now.s);
    R = ringOff[teeKey] = { d: [F.C[0] - av.x, F.C[1] - av.y, F.C[2] - av.z], n: F.n };
    // the first frame gives the offset: draw again with it
    redraw();
  }
  const av = ev.anat.point('av', 0, cycleAt(tms).s), h = saxH(posOf(st[T_KEY]));
  const C = [av.x + R.d[0], av.y + R.d[1], av.z + R.d[2]];
  const N = [g.n.x, g.n.y, g.n.z], nn = R.n[0] * N[0] + R.n[1] * N[1] + R.n[2] * N[2];
  if (Math.abs(nn) < 0.3) return 0;
  // the plane meets the axis where (C + h n - O - k N) . N = 0
  return shown((C[0] - g.O.x) * N[0] + (C[1] - g.O.y) * N[1] + (C[2] - g.O.z) * N[2] + h * nn, 3);
}
// The long axis holds the root's axis through the av landmark (teeviews.js), which also moves up
// to 0.23 cm across that plane in each beat. The plane follows it, so that it cuts the valve
// through its centre.
function laxShiftOf(ev, g, tms) {
  const av = ev.anat.point('av', 0, cycleAt(tms).s);
  return shown((av.x - g.O.x) * g.n.x + (av.y - g.O.y) * g.n.y + (av.z - g.O.z) * g.n.z, 3);
}

const HIDE = new Set(['AorticValve']);
const DISEASES = ['avSten', 'avThick'];
const MESH_LAX = new TeePanel('meavlax', LAX_SPEC, { diseases: DISEASES, redraw, shift: laxShiftOf });
const MESH_SAX = new TeePanel('meavsax', SAX_SPEC, { diseases: DISEASES, redraw, shift: saxShiftOf });
const MESH_ME = new TeePanel('melax', ME_SPEC, { diseases: DISEASES, redraw, angle: (ev) => wireAngleOf(ev) });
// the parasternal views of chapter Prosthetic valves: the long axis and the short axis, zoomed on
// the aortic valve
const TTE_LAX = new MeshPanel('plax_av', { diseases: DISEASES, redraw });
const TTE_SAX = new MeshPanel('psax_avz', { diseases: DISEASES, redraw });
const PANES = [MESH_LAX, MESH_SAX, MESH_ME, TTE_LAX, TTE_SAX];
const startAll = () => { for (const p of PANES) p.start(); };

/**
 * The angle (degrees from ep) of a commissure of the valve. A balloon-expandable valve lands at
 * any rotation. The model turns both valves so that the long axis crosses each leaflet it cuts 30
 * degrees from a commissure, where the two leaflets look alike. In the five hearts this puts its
 * commissures 21 to 24 degrees from those of the native leaflets it draws (tavrmesh.js COMM0).
 */
function commOf(F) {
  const g = planeAt(teeFr.meavlax, BY_KEY.meavlax.angle), N = [g.n.x, g.n.y, g.n.z], { n, ep, eh } = F;
  // the line on which the long axis crosses the hinge ring's plane
  const d = [N[1] * n[2] - N[2] * n[1], N[2] * n[0] - N[0] * n[2], N[0] * n[1] - N[1] * n[0]];
  const cut = Math.atan2(d[0] * eh[0] + d[1] * eh[1] + d[2] * eh[2], d[0] * ep[0] + d[1] * ep[1] + d[2] * ep[2]);
  return (cut * 180) / Math.PI - 30;
}

/**
 * The TEE long axis turned to the stiff wire: the multiplane angle, 100 to 160 degrees, whose plane
 * runs closest to the wire, as the imager turns the plane to follow it to the apex. Found once for
 * each heart, with the valve at its place (Cross).
 */
const wireAng = {};
function wireAngleOf(ev) {
  if (wireAng[teeKey] !== undefined) return wireAng[teeKey];
  const f = teeFrames(ev).melax, s0 = cycleAt(MID_SYS).s, F = annulusOf(ev, s0);
  if (!F) return BY_KEY.melax.angle;
  const apex = ev.anat.point('apex_endo', 0, s0);
  const parts = tavrParts(F, wallOf(ev, F), { kind: 'be', u: 0, drop: 0, system: true, native: false, open: 0, orifice: 1, apex: [apex.x, apex.y, apex.z], comm: commOf(F) });
  const pts = parts.find((p) => p.kind === 'wire').pts;
  let best = BY_KEY.melax.angle, bestE = Infinity;
  for (let a = 100; a <= 160; a++) {
    const g = planeAt(f, a);
    let e = 0;
    for (const p of pts) e += ((p[0] - g.O.x) * g.n.x + (p[1] - g.O.y) * g.n.y + (p[2] - g.O.z) * g.n.z) ** 2;
    if (e < bestE) { bestE = e; best = a; }
  }
  return (wireAng[teeKey] = best);
}

/** How far the valve's leaflets are open (0 shut to 1 open) for the cycle's aortic drive. */
const openOf = (drive) => Math.min(1, drive / 0.85);

/** The valve's state at step position s: the parts that tavrmesh.js builds, before the annulus is known. */
function valveAt(s, valve = 'be') {
  return { kind: valve, u: expandAt(s), drop: dropAt(s), system: systemAt(s), paced: valve === 'be' && pacingAt(s) };
}

/**
 * The panel's options for the valve's state v: before deployment, the heart's own aortic valve,
 * stenotic and calcified; from deployment on, that valve left out and the native leaflets drawn
 * pushed out by the frame; the transcatheter valve and its delivery system as B-mode items. The
 * leaflets lie open against the frame while the balloon is full.
 */
function procedure(v) {
  const { u, drop, system, paced } = valveAt(v.s, v.valve);
  const on = v.s > 1.05;
  // the native valve as the AS chapter draws severe stenosis: its orifice and its cusps' thickness
  const o = {
    disease: (heart) => { const W = asWeights(heart, AVA0, 2.8); return { avSten: W.as, avThick: W.thick }; },
    calc: { AorticValve: 1 },
  };
  if (u > 0) o.hide = HIDE;
  if (!on) return o;
  o.extra = (ev, g, state) => {
    const F = annulusOf(ev, state.s);
    if (!F) return [];
    teeFrames(ev);
    const wall = wallOf(ev, F);
    const apex = ev.anat.point('apex_endo', 0, state.s);
    return tavrItems(F, wall, {
      kind: v.valve, u, drop, system, native: u > 0, open: u >= 1 ? (paced ? 1 : openOf(state.drive.av)) : 0,
      orifice: v.V.eoa / 0.9, apex: [apex.x, apex.y, apex.z], comm: commOf(F),
    }, g);
  };
  o.extraKey = `${v.valve}|${u.toFixed(3)}|${drop.toFixed(3)}|${system}|${paced}`;
  return o;
}

// ---------------------------------------------------------------- overlays
/** A world point [x, y, z] on plane g: [u, v] cm. */
const toPlane = (g, p) => { const x = p[0] - g.O.x, y = p[1] - g.O.y, z = p[2] - g.O.z; return [x * g.r.x + y * g.r.y + z * g.r.z, x * g.d.x + y * g.d.y + z * g.d.z]; };
/** The point at radius r, angle phi and height h of annulus frame F. */
const atF = (F, r, phi, h) => [0, 1, 2].map((i) => F.C[i] + r * (Math.cos(phi) * F.ep[i] + Math.sin(phi) * F.eh[i]) + h * F.n[i]);
/**
 * The angle round the axis (rad, from ep toward eh) of the root's posterior side: toward the
 * transducer of the long-axis view, which lies in that view's plane. The paravalvular jets are
 * placed from it, so every view shows each jet at the same place on the frame: 0 posterior, on the
 * near side of the TEE views; 180 anterior, in their far field.
 */
function posterior(F) {
  const g = planeAt(teeFr.meavlax, BY_KEY.meavlax.angle);
  const q = [g.O.x - F.C[0], g.O.y - F.C[1], g.O.z - F.C[2]], k = q[0] * F.n[0] + q[1] * F.n[1] + q[2] * F.n[2];
  const w = q.map((x, i) => x - k * F.n[i]);
  return Math.atan2(w[0] * F.eh[0] + w[1] * F.eh[1] + w[2] * F.eh[2], w[0] * F.ep[0] + w[1] * F.ep[1] + w[2] * F.ep[2]);
}

/** The paravalvular jets flow from aortic closure to opening (0..1, with 25-ms ramps). */
function diastoleAt(tms) {
  const since = (((tms - EV.avc) % RR) + RR) % RR, dur = RR - (EV.avc - EV.avo);
  return smooth(since / 25) * smooth((dur - since) / 25);
}

const MID_SYS = 200;   // ms after the R wave: the frame on which the annulus is measured
// The annulus of each heart (mm), measured once on a systolic frame of the long axis: the
// readouts and the live text give it, so the text renders again when it is known.
const annMm = {};
let setState = null;
function noteAnnulus(ev) {
  const now = ev && ev.last && ev.last.state;
  if (!now || annMm[teeKey] !== undefined || now.t < EV.avo + 60 || now.t > EV.avc - 60) return;
  const A = annulusOf(ev, now.s);
  if (!A) return;
  annMm[teeKey] = shown(2 * A.R * 10, 0);
  setState?.({ tavrGeo: `${teeKey}:${annMm[teeKey]}` });
}

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

// ---------------------------------------------------------------- the echo panes
/** The TEE long axis: the annulus at Measure; the implant depth once the valve sits at its place; the jets at the check. */
function lax(ctx, box, v, tt) {
  const measuring = v.step.key === 'measure';
  // the annulus is measured on a frame held in mid-systole
  const tms = measuring ? MID_SYS : tt, s = cycleAt(tms).s;
  const mm = annMm[teeKey] ?? null;
  const u = v.u, placed = v.placed, dmm = fmt(v.depth, 0);
  const lines = measuring ? (mm ? [[`Annulus ${mm} mm`, `${mm} mm`]] : null) : placed ? [[`Depth ${dmm} mm`, `${dmm} mm`]] : null;
  const title = titleOf(ctx, box.w, ['TEE · ME AORTIC VALVE LONG AXIS', 'TEE · ME AV LONG AXIS', 'ME AV LAX']);
  const F = MESH_LAX.draw(ctx, box, title, {
    tms, ...procedure(v), lines: lines || undefined,
    names: measuring ? [['ao', 'Ao'], ['la', 'LA'], ['lvot', 'LVOT']] : [['ao', 'Ao'], ['la', 'LA']],
    over: (c, F2, ev) => {
      const A = annulusOf(ev, s), g = ev.g;
      if (!A || !g) return;
      const back = posterior(A);
      if (measuring) {
        // the annulus: hinge point to hinge point, in the plane of the long axis
        const a = toPlane(g, atF(A, A.R, back, 0)), b = toPlane(g, atF(A, A.R, back + Math.PI, 0));
        cal(c, F2, a, b, '');
      } else if (placed) {
        // the depth on the anterior side: from the annulus to the frame's inflow
        const fr = frameAt(v.valve, wallOf(ev, A), u), front = back + Math.PI;
        const r = fr.r(fr.lo, front) + 0.3;
        cal(c, F2, toPlane(g, atF(A, r, front, 0)), toPlane(g, atF(A, r, front, fr.lo)), '');
        if (v.step.key === 'check' && v.L.jets.length) leakLax(c, F2, A, g, v, tt, fr, back, false);
      }
    },
  });
  if (F) angleIcon(ctx, F.view.box, BY_KEY.meavlax.angle);
  noteAnnulus(MESH_LAX.ev);
  return F;
}

/** The TEE short axis: the cusps, then the frame at the skirt, with the jets at the check. */
function sax(ctx, box, v, tt) {
  const s = cycleAt(tt).s, skirt = v.u > 0;
  const title = titleOf(ctx, box.w, [`TEE · ME AORTIC VALVE SHORT AXIS · ${skirt ? 'AT THE SKIRT' : 'CUSPS'}`, 'TEE · ME AV SHORT AXIS', 'ME AV SAX']);
  const F = MESH_SAX.draw(ctx, box, title, {
    tms: tt, ...procedure(v),
    names: [['la', 'LA'], ['ra', 'RA'], ['rvot', 'RVOT']],
    over: (c, F2, ev) => {
      if (v.step.key !== 'check' || !v.L.jets.length) return;
      const A = annulusOf(ev, s), g = ev.g;
      if (!A || !g) return;
      leakSax(c, F2, A, g, v, tt, frameAt(v.valve, wallOf(ev, A)), posterior(A), false);
    },
  });
  if (F) angleIcon(ctx, F.view.box, BY_KEY.meavsax.angle);
  return F;
}

/** The TEE long axis, whole: the stiff wire in the LV, its end curved in the apex, clear of the mitral apparatus. */
function meLax(ctx, box, v, tt) {
  const title = titleOf(ctx, box.w, ['TEE · ME LONG AXIS · STIFF WIRE IN THE LV', 'TEE · ME LONG AXIS', 'ME LAX']);
  const F = MESH_ME.draw(ctx, box, title, { tms: tt, ...procedure(v), names: [['la', 'LA'], ['lv', 'LV'], ['ao', 'Ao']] });
  if (F) angleIcon(ctx, F.view.box, MESH_ME.ang);
  return F;
}

/** The parasternal long axis, zoomed on the aortic valve: the calcified cusps before; the valve after. */
function ttePlax(ctx, box, v, tt) {
  const after = v.k === LAST, s = cycleAt(tt).s;
  const title = titleOf(ctx, box.w, ['TTE · PARASTERNAL LONG AXIS · AORTIC VALVE', 'TTE · PLAX · AV', 'PLAX']);
  return TTE_LAX.draw(ctx, box, title, {
    tms: tt, ...procedure(v),
    names: [['ao', 'Ao'], ['lvot', 'LVOT']],
    over: (c, F, ev) => {
      if (!after || !v.L.jets.length) return;
      const A = annulusOf(ev, s), g = ev.g;
      if (!A || !g) return;
      teeFrames(ev);
      leakLax(c, F, A, g, v, tt, frameAt(v.valve, wallOf(ev, A)), posterior(A), true);
    },
  });
}

/**
 * The parasternal short axis, zoomed on the aortic valve: the calcified cusps before; after, moved
 * to the frame's skirt (the short axis's height), where the jets pass the annulus.
 */
function ttePsax(ctx, box, v, tt) {
  const after = v.k === LAST, s = cycleAt(tt).s, ev = TTE_SAX.ev;
  let shift = 0;
  if (after && ev && ev.g) {
    teeFrames(ev);
    // the view's own plane: the shift now on it taken off
    const g0 = { O: ev.g.O.clone().addScaledVector(ev.g.n, -(ev.shift || 0)), n: ev.g.n };
    shift = saxShiftOf(ev, g0, tt);
  }
  const title = titleOf(ctx, box.w, [`TTE · PARASTERNAL SHORT AXIS · ${after ? 'AT THE SKIRT' : 'AORTIC VALVE'}`, 'TTE · PSAX · AV', 'PSAX']);
  return TTE_SAX.draw(ctx, box, title, {
    tms: tt, ...procedure(v), shift,
    names: [['la', 'LA'], ['ra', 'RA'], ['rvot', 'RVOT']],
    over: (c, F, ev2) => {
      if (!after || !v.L.jets.length) return;
      const A = annulusOf(ev2, s), g = ev2.g;
      if (!A || !g) return;
      leakSax(c, F, A, g, v, tt, frameAt(v.valve, wallOf(ev2, A)), posterior(A), true);
    },
  });
}

/** The jet of v.L that lies on the side at angle side (degrees from posterior), within its width and 8 degrees of beam width. */
const jetOn = (v, side) => v.L.jets.find(([j, w]) => Math.abs((((side - j) % 360) + 540) % 360 - 180) <= w / 2 + 8);

/**
 * The paravalvular jets on a long axis, in diastole: from outside the frame's inflow into the
 * LVOT, where a jet lies on the plane: on its posterior side (0) or its anterior side (180).
 */
function leakLax(c, F, A, g, v, tt, fr, back, tte) {
  const a = diastoleAt(tt);
  if (a <= 0.02) return;
  for (const side of [0, 180]) {
    if (!jetOn(v, side)) continue;
    const ang = back + (side * Math.PI) / 180;
    const r = fr.r(fr.lo + 0.1, ang) + 0.06 + v.L.vc / 2;
    const O = toPlane(g, atF(A, r, ang, fr.lo + 0.05)), down = toPlane(g, atF(A, r - 0.25, ang, fr.lo - 1));
    const dir = [down[0] - O[0], down[1] - O[1]], l = Math.hypot(dir[0], dir[1]) || 1;
    jet(c, F, { O, dir: [dir[0] / l, dir[1] / l], q: v.L.rvol * 2, va: 60, vc: v.L.vc, jl: 0.8 + 3 * (v.L.ext / 36), jw: v.L.vc * 2.4, a: a * shade(side, tte), pisa: false, box: false });
  }
}
/**
 * How much of a jet's color a view shows at its angle from the posterior side: all of a jet on
 * the probe's side; less of one in the far field behind the frame, where the frame's shadow hides
 * it: anterior jets on TEE, posterior jets on TTE (Zoghbi 2019).
 */
const shade = (j, tte = false) => 1 - 0.6 * smooth((Math.abs(((((tte ? j + 180 : j) % 360) + 540) % 360) - 180) - 60) / 60);

/**
 * The paravalvular jets on a short axis, in diastole: color in the crescents between the frame
 * and the annulus that the jets take; their share of the circumference is the leak's extent.
 */
function leakSax(c, F, A, g, v, tt, fr, back, tte) {
  const a = diastoleAt(tt);
  if (a <= 0.02) return;
  // the point at radius off cm outside the frame and angle phi where the plane cuts it
  const N = [g.n.x, g.n.y, g.n.z], nn = A.n[0] * N[0] + A.n[1] * N[1] + A.n[2] * N[2];
  const onPlane = (phi, off) => {
    const u = [0, 1, 2].map((i) => Math.cos(phi) * A.ep[i] + Math.sin(phi) * A.eh[i]);
    const q = (g.O.x - A.C[0]) * N[0] + (g.O.y - A.C[1]) * N[1] + (g.O.z - A.C[2]) * N[2];
    const un = u[0] * N[0] + u[1] * N[1] + u[2] * N[2];
    let r = 1.2, h = 0;
    for (let k = 0; k < 3; k++) { h = (q - r * un) / nn; r = fr.r(h, phi) + off; }
    return F.P(toPlane(g, atF(A, r, phi, h)));
  };
  c.save();
  c.beginPath();
  c.rect(F.view.box.x, F.view.box.y, F.view.box.w, F.view.box.h);
  c.clip();
  for (const [j, w] of v.L.jets) {
    const n = 18, poly = [], at = (i) => back + ((j - w / 2 + (w * i) / n) * Math.PI) / 180;
    for (let i = 0; i <= n; i++) poly.push(onPlane(at(i), 0.05));
    for (let i = n; i >= 0; i--) poly.push(onPlane(at(i), 0.07 + v.L.vc));
    mosaic(c, poly, a * shade(j, tte), j);
  }
  c.restore();
}

/** A turbulent jet across the plane: a mosaic of aliased colors in the polygon (px). */
function mosaic(c, poly, a, seed) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys)), x1 = Math.ceil(Math.max(...xs)), y1 = Math.ceil(Math.max(...ys));
  const path = new Path2D();
  poly.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
  path.closePath();
  c.save();
  c.clip(path);
  // the colors change every 60 ms while the cine runs, as a scanner's frames do
  const cell = 3, f = cine.live ? Math.floor(performance.now() / 60) : 0;
  for (let y = y0; y < y1; y += cell) {
    for (let x = x0; x < x1; x += cell) {
      const k = hash(Math.floor(x / cell), Math.floor(y / cell), f * 31 + seed);
      const col = k < 0.3 ? SC.yellow : k < 0.5 ? SC.cyan : k < 0.75 ? SC.red : SC.blue;
      c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.85 * a).toFixed(3)})`;
      c.fillRect(x, y, cell, cell);
    }
  }
  c.restore();
}
/** A value 0..1 from three integers, with no pattern a reader would see. */
function hash(i, j, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- Doppler
/** Where the Doppler beam comes from: the deep transgastric view on TEE, the apex on TTE. */
const WIN = { tee: ['DEEP TG', 'TG'], tte: ['APICAL', 'APICAL'] };

/**
 * CW through the valve, from below: the forward jet away from the probe in systole; after
 * deployment, a paravalvular leak's signal toward the probe in diastole, as faint or dense as the
 * leak is large, its slope from the pressure half-time.
 */
function cwPanel(ctx, P, v, win) {
  if (v.paced) return pacedPanel(ctx, P, `CW · ${WIN[win][0]} · RAPID PACING`, 'CW · PACING', 0.9, 'cw');
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w + 40, [`CW · ${v.after ? 'TRANSCATHETER VALVE' : v.u > 0 ? 'VALVE EXPANDING' : 'NATIVE AORTIC VALVE'} · ${WIN[win][0]}`, 'CW · AORTIC VALVE', 'CW · AV']));
  // the baseline high when only the forward jet shows; lower when the leak's signal needs room above it
  const leak = v.after && v.L.pht, bx = inner(P), base = leak ? 0.45 : 0.12;
  const vs = Math.max(leak ? 5 : 4, Math.ceil(v.vmax + 0.6));
  const gA = shape(v.qA, v.pA), T = ET * 1000;
  const at = (u) => ((u * 2 * RR) % RR - EV.avo) / T;
  const fns = [(u) => -v.vmax * gA(at(u))];
  const gain = [1];
  if (leak) {
    // the leak's signal: from aortic closure to opening, its peak velocity 4 m/s, falling with the half-time
    const k = Math.log(2) / v.L.pht;
    fns.push((u) => {
      const tm = (u * 2 * RR) % RR, td = tm >= EV.avc ? tm - EV.avc : tm + RR - EV.avc;
      if (tm >= EV.avo && tm < EV.avc) return 0;
      const pg = 64 * Math.exp(-k * td);
      return Math.sqrt(pg / 4) * smooth(td / 20);
    });
    // faint and incomplete when mild, dense when severe
    gain.push(v.leak === 'mild' ? 0.18 : v.leak === 'moderate' ? 0.42 : 0.8);
  }
  spectral(ctx, bx, { fn: fns, gain, scale: vs, base, mode: 'cw', broad: 0.45, key: `tavrcw|${v.vmax}|${v.qA.toFixed(4)}|${v.pA}|${v.leak}|${v.after}|${vs}`, seed: 5 });
  vscale(ctx, bx, vs, base, 1);
  const k = (bx.h * Math.max(base, 1 - base)) / vs, y0 = bx.y + bx.h * base, X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  const tPk = EV.avo + v.atet * T, xPk = X(tPk), yPk = y0 + v.vmax * k;
  caliper(ctx, xPk - 10, yPk, xPk + 10, yPk, { solid: true });
  const tag = tagBox(ctx, xPk + 14, yPk, [bx.w < 300 ? `${v.vmax.toFixed(1)}` : `${v.vmax.toFixed(1)} m/s`], { size: 10.5, bounds: bx });
  // the note stays at the foot of the strip, clear of the peak's tag (a native jet near the scale's
  // end puts the tag there): left, else right
  const head = { x0: bx.x, x1: bx.x + bx.w, y0: bx.y, y1: y0 + 6 };
  note(ctx, bx, [`VTI ${v.vtiA.toFixed(1)} cm · mean ${v.mg} mmHg${leak ? ` · PHT ${v.L.pht} ms` : ''}`, `mean ${v.mg} mmHg`], 'auto',
    [head, { x0: tag.x, x1: tag.x + tag.w, y0: tag.y, y1: tag.y + tag.h }]);
  return bx;
}

/**
 * During balloon inflation: rapid ventricular pacing, about 180 beats a minute in the drawing, and
 * little forward flow. The label gives no rate: the balloon is inflated once the systolic pressure
 * is 50 mmHg or less (SAPIEN 3 instructions for use).
 */
const PACE = 333;
function pacedPanel(ctx, P, long, short, vmax, mode) {
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w + 40, [long, short]));
  const bx = inner(P), base = 0.12, vs = 2;
  const beatAt = (u) => { const x = ((u * 2 * RR) % PACE) / (PACE * 0.5); return x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0; };
  spectral(ctx, bx, { fn: (u) => -vmax * beatAt(u), scale: vs, base, mode, broad: mode === 'cw' ? 0.45 : 0.14, key: `tavrpace|${mode}|${vmax}`, seed: mode === 'cw' ? 5 : 6 });
  vscale(ctx, bx, vs, base, 0.5);
  note(ctx, bx, ['Balloon inflated once systolic pressure ≤50 mmHg', 'Systolic ≤50 mmHg', 'Pacing'], 'bottom');
  return bx;
}

/** PW in the LVOT, the sample just proximal to the frame (ASE 2024). */
function pwPanel(ctx, P, v, win) {
  if (v.paced) return pacedPanel(ctx, P, `PW · LVOT · ${WIN[win][0]} · RAPID PACING`, 'PW · PACING', 0.3, 'pw');
  panel(ctx, P.x, P.y, P.w, P.h, titleOf(ctx, P.w + 40, [v.after ? `PW · LVOT, JUST PROXIMAL TO THE FRAME · ${WIN[win][0]}` : `PW · LVOT · ${WIN[win][0]}`, 'PW · LVOT']));
  const bx = inner(P), base = 0.12;
  const vs = Math.max(1.2, Math.ceil((v.vL + 0.3) * 5) / 5);
  const fitP = (q, f) => {
    let lo = Math.log(P_LO), hi = Math.log(P_HI);
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (gMean(q, Math.exp(m)) > f) lo = m; else hi = m; }
    return Math.exp((lo + hi) / 2);
  };
  const gL = shape(1, fitP(1, v.vtiL / (100 * v.vL * ET))), T = ET * 1000;
  const at = (u) => ((u * 2 * RR) % RR - EV.avo) / T;
  spectral(ctx, bx, { fn: (u) => -v.vL * gL(at(u)), scale: vs, base, mode: 'pw', broad: 0.14, key: `tavrpw|${v.vL}|${v.vtiL}|${vs}`, seed: 6 });
  vscale(ctx, bx, vs, base, 0.5);
  note(ctx, bx, [`VTI ${v.vtiL.toFixed(1)} cm · DVI ${v.dvi.toFixed(2)}`, `DVI ${v.dvi.toFixed(2)}`], 'bottom');
  return bx;
}

/**
 * Under rapid pacing the heart barely moves: a small contraction at the start of ejection, five in
 * the strips' loop of two beats (175 a minute), so that the loop joins without a step.
 */
const PACED_MS = (2 * RR) / 5;
const pacedTime = (ms) => EV.avo + 20 * Math.sin(Math.PI * ((ms % PACED_MS) / PACED_MS)) ** 2;

// ---------------------------------------------------------------- the procedure pane
// The Blender stills (assets/tavr/<step>.webp), one for each step, loaded when the chapter first
// shows. Between two steps the two stills cross-fade. A chapter video gives frames of its own
// along the steps (video/chapter.js): window.__videoFrames(s) returns the two round step position
// s and the share of the second.
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
      const r = await fetch(`assets/tavr/${s.key}.webp`);
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
/** The panes of each step: B and C a pair (the TEE biplane of the root, or two parasternal views), D the third (one or two Doppler strips, or the TEE long axis). */
const PANE_SET = {
  before: { B: ttePlax, C: ttePsax, D: ['cw'], win: 'tte' },
  measure: { B: lax, C: sax, D: ['cw'], win: 'tee' },
  cross: { B: lax, C: sax, D: meLax, win: 'tee' },
  deploy: { B: lax, C: sax, D: ['cw'], win: 'tee' },
  check: { B: lax, C: sax, D: ['cw', 'pw'], win: 'tee' },
  after: { B: ttePlax, C: ttePsax, D: ['cw', 'pw'], win: 'tte' },
};

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
  const ctx = sh.ctx, v = shownOf(st), set = PANE_SET[v.step.key];
  const t0 = beat.at(true, 200), tt = v.paced && cine.live ? pacedTime(beat.ms) : t0;
  const L = layout(sh.w, sh.h);
  procedurePane(ctx, L.left, v.s);
  set.B(ctx, L.b, v, tt);
  set.C(ctx, L.c, v, tt);
  if (typeof set.D === 'function') { set.D(ctx, L.d, v, tt); return; }
  const boxes = set.D.length > 1 ? rows(L.d, [1, 1], 8) : [L.d];
  set.D.forEach((kind, i) => {
    const bx = kind === 'cw' ? cwPanel(ctx, boxes[i], v, set.win) : pwPanel(ctx, boxes[i], v, set.win);
    cursor(ctx, bx, beat.sweep);
  });
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LIVE = {
  before: (v, c) => `<b>Before: TTE.</b> The parasternal long and short axes show a calcified aortic valve that opens little. From the apex, CW records a peak velocity of ${fmt(v.vmax, 1)} m/s and a mean gradient of ${v.mg} mmHg: severe aortic stenosis${c('baumgartner2017')}.`,
  measure: (v, c, mm) => `<b>Measure.</b> On the long axis, held in systole, the annulus measures ${mm ? `${mm} mm` : '–'} from hinge point to hinge point${c('hahn2022')}: a 26-mm SAPIEN 3${c('fdas3')}. The short axis shows the three cusps and their calcium${c('zamorano2011')}; the deep transgastric view records the baseline gradient, ${v.mg} mmHg.`,
  cross: (v, c) => `<b>Cross.</b> A stiff guidewire lies across the valve with its end curved in the LV apex; TEE watches it for entanglement in the mitral apparatus${c('hahn2015')}. The crimped valve comes down over it to the annulus, positioned against the cusps' hinge points${c('hahn2015')}, its ventricular end ${fmt(v.depth, 0)} mm below them.`,
  deploy: (v, c) => (v.valve === 'be'
    ? `<b>Deploy.</b> Under rapid ventricular pacing, the balloon is inflated once the systolic pressure is 50 mmHg or less and held full for 3 seconds${c('fdas3')}. The frame expands along its whole length at once and shortens from 27 to 20 mm, mostly at its ventricular end${c('schymik2015')}. That end rises from 9 to 2 mm below the annulus: a 90/10 position (aortic/ventricular), inside the 80/20 to 90/10 target${c('blackman2021')}.`
    : `<b>Deploy.</b> The capsule draws back and the frame expands from its inflow up, without rapid pacing${c('zoghbi2019')}; until release it can be recaptured and placed again${c('fdaevolut')}. The target depth is 3 mm below the noncoronary cusp${c('grubb2025')}; the leaflets sit above the annulus${c('popma2019')}.`),
  check: (v, c) => {
    const where = { mild: 'One jet at the frame\'s ventricular edge', moderate: 'Two jets', severe: 'Three jets' }[v.leak];
    const leak = v.leak === 'none'
      ? 'No paravalvular jet enters the LVOT.'
      : `${where} take${v.leak === 'mild' ? 's' : ''} ${v.L.ext}% of the frame's circumference: ${v.leak} paravalvular regurgitation${c('zoghbi2024')}.${v.leak === 'mild' ? '' : ` The anterior jet lies in the frame's shadow on the mid-esophageal views; the deep transgastric view shows it${c('zoghbi2019')}.`}`;
    return `<b>Check.</b> ${leak} The mean gradient is ${v.mg} mmHg, the peak velocity ${fmt(v.vmax, 1)} m/s and the DVI ${fmt(v.dvi, 2)}. ${result(v, c)}`;
  },
  after: (v, c) => {
    const leak = v.leak === 'none'
      ? 'The parasternal short axis at the skirt shows no paravalvular jet.'
      : `The parasternal short axis at the skirt shows the ${v.leak} leak, ${v.L.ext}% of the circumference; on TTE the frame shadows posterior jets${c('zoghbi2019')}.`;
    return `<b>After: TTE.</b> A TTE soon after the implant sets the baseline${c('zoghbi2019')}. ${leak} Mean gradient ${v.mg} mmHg, peak velocity ${fmt(v.vmax, 1)} m/s, DVI ${fmt(v.dvi, 2)}. ${result(v, c)}`;
  },
};
/** The valve's intended performance (VARC-3), met or not. */
function result(v, c) {
  return v.success
    ? `Each criterion of the valve's intended performance is met${c('genereux2021')}.`
    : `Moderate or greater regurgitation fails the valve's intended performance${c('genereux2021')}${v.mg >= 20 ? '; the leak\'s volume crosses the valve again in systole, and the gradient rises with the flow' : ''}.`;
}

/** The paravalvular regurgitation's grade by its features, ASE 2024 Table 8 (the current column marked). */
function leakRows(v) {
  const c = { none: -1, mild: 0, moderate: 1, severe: 2 }[v.leak];
  return [
    ['Circumferential extent of the jets', ['<10%', '10–29%', '≥30%'], c],
    ['Vena contracta width', ['<0.3 cm', '0.3–0.6 cm', '>0.6 cm'], c],
    ['Jet density, CW', ['Incomplete or faint', 'Dense', 'Dense'], c],
    ['Pressure half-time, CW', ['>500 ms', '200–500 ms', '<200 ms'], c],
    ['Diastolic flow reversal, descending aorta', ['Absent or brief, early', 'Intermediate', 'Prominent, holodiastolic'], c],
    ['Regurgitant volume', ['<30 mL', '30–59 mL', '≥60 mL'], c],
    ['Regurgitant fraction', ['<30%', '30–50%', '≥50%'], c],
  ];
}

/** The bands under the slider: one for each step, coloured by the stenosis before the new valve works and by its leak after. */
function paint(leak) {
  const w = 1 / LAST;
  const list = STEPS.map((x, i) => ({ a: Math.max(0, (i - 0.5) * w), b: Math.min(1, (i + 0.5) * w), g: x.name }));
  const after = { none: 1, mild: 2, moderate: 3, severe: 4 }[leak] ?? 1;
  const lev = Object.fromEntries(STEPS.map((x, i) => [x.name, i <= 3 ? 4 : after]));
  const short = Object.fromEntries(STEPS.map((x) => [x.name, x.short]));
  paintBands(document.getElementById('tavr-steps'), list, lev, short);
  return list;
}
let BANDS = [], paintedLeak = '';

const tavrPage = {
  key: 'tavr',
  part: 'structural',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Transcatheter aortic valve replacement',
  nav: 'TAVR',
  dwell: 30,
  // tavrGeo: the heart whose annulus the readouts give (set when the long axis has measured it)
  defaults: { tavrT: 0, tavrValve: 'be', tavrLeak: 'mild', tavrGeo: '' },
  format: {
    tavrT: (x) => STEPS[stepAt(posOf(x))].name,
  },
  watch: ['tavrT', 'tavrValve', 'tavrLeak', 'tavrGeo', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh) => draw(sh));
    return sheet;
  },
  init({ state }) {
    st = state;
    paintedLeak = leakOf(state);
    BANDS = paint(paintedLeak);
  },
  enter({ set }) { setState = set; startAll(); loadStills(); },
  warm() { startAll(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, T_KEY, BANDS);
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: each step held 3.5 s, then 1.5 s to the next, with a mild leak at the check
  tourEnter(set) { set({ tavrT: 0, tavrValve: 'be', tavrLeak: 'mild' }); },
  tourTick(tt, set) {
    const u = Math.max(0, tt - 0.5), k = Math.floor(u / 5), r = u - 5 * k;
    const s = k >= LAST ? LAST : k + (r < 3.5 ? 0 : ease((r - 3.5) / 1.5));
    set({ tavrT: Math.round((s / LAST) * 1000) / 1000 });
  },
  tourAt(s) { return 0.5 + 5 * stepAt(posOf(s.tavrT)); },
  text(s, { cite }) {
    const v = shownOf(s), k = v.k;
    const c = (key) => cite(key);
    const mm = annMm[teeKey] ?? null;
    if (leakOf(s) !== paintedLeak) { paintedLeak = leakOf(s); BANDS = paint(paintedLeak); }
    const extra = {
      before: { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: v.mg >= 40 },
      measure: { k: 'Annulus, 2D TEE', v: mm ? `${mm}` : '–', u: 'mm' },
      cross: { k: 'Implant depth', v: v.placed ? fmt(v.depth, 0) : '–', u: 'mm' },
      deploy: { k: 'Implant depth', v: v.placed ? fmt(v.depth, 0) : '–', u: 'mm' },
      check: { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: !v.crit.mg },
      after: { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: !v.crit.mg },
    }[v.step.key];
    return {
      readouts: [
        { k: 'Step', v: `${k + 1} of ${STEPS.length}`, text: true },
        k >= 4 ? { k: 'Paravalvular leak', v: v.leak, text: true, flag: !v.crit.ar } : { k: 'Aortic stenosis', v: 'severe', text: true, flag: true },
        extra,
      ],
      live: LIVE[v.step.key](v, c, mm),
      extra: (art) => {
        gradeTable(art.querySelector('#tavr-table'), leakRows(v), 'Paravalvular regurgitation after TAVR', ['Mild', 'Moderate', 'Severe']);
      },
    };
  },
};
export default tavrPage;
export { modelAt, measure, LEAKS, VALVES, DISEASES };

// ---------------------------------------------------------------- for tools
// tools/blender/export.js reads the chapter's own state, so the Blender stills show the heart and
// the valve that the echo panes cut.
/** The state at step position s and time tt (ms) for heart: the valve's state, the native valve's disease weights, the valves left out. */
export function stateAt(s, tt, heart = 'normal') {
  const pose = valveAt(s), W = asWeights(heart, AVA0, 2.8);
  return { pose, disease: { avSten: W.as, avThick: W.thick }, motion: {}, lvK: 1, hide: pose.u > 0 ? [...HIDE] : [] };
}
/**
 * The valve's parts in view ev's frame at step position s (gl/tavrmesh.js tavrParts), turned as
 * the echo panes turn it; and the annulus frame F and the root's wall, for the parts that only the
 * stills show (the frame's struts, the balloon).
 */
export function partsFor(ev, s, state) {
  const F = annulusOf(ev, state.s);
  if (!F) return null;
  teeFrames(ev);
  const p = valveAt(s), wall = wallOf(ev, F), apex = ev.anat.point('apex_endo', 0, state.s);
  const P = {
    kind: 'be', u: p.u, drop: p.drop, system: p.system, native: p.u > 0, open: p.u >= 1 ? (p.paced ? 1 : openOf(state.drive.av)) : 0,
    orifice: VALVES.be.eoa / 0.9, apex: [apex.x, apex.y, apex.z], comm: commOf(F),
  };
  // before the delivery system comes up the aorta there is no device, as in the echo panes
  return { F, wall, P, parts: s > 1.05 ? tavrParts(F, wall, P) : [] };
}
