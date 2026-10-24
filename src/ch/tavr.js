// Transcatheter aortic valve replacement (TAVR) for aortic stenosis, as transesophageal echo (TEE)
// guides it and as echo assesses the result. One slider runs the procedure through four steps:
// measure the annulus; cross the valve with the guidewire and the crimped valve; deploy; check
// the result. A switch for the valve (balloon-expandable or self-expanding) and one for the
// paravalvular regurgitation that the check finds (none to severe).
// The figure: the mid-esophageal aortic valve long-axis and short-axis views (Hahn 2013, views 6
// and 10; teeviews.js), cut from the heart mesh with the valve, its delivery system and the
// native leaflets (gl/tavrmesh.js); color Doppler of the paravalvular jets in diastole; CW
// Doppler through the valve and PW Doppler in the LVOT from the deep transgastric view; the
// measurements against the criteria of a successful result.
import { Sheet, clamp } from '../sketch.js';
import { panel, spectral, vscale, caliper, tagBox, SC } from '../scope.js';
import { RR, EV, cycleAt } from '../cyclemodel.js';
import { shown, Beat, cursor, rows, cols, inner, meters, note, fit, gradeTable, paintBands, cine } from '../sev.js';
import { cal, jet } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { asWeights } from '../meshcal.js';
import { annulusOf } from '../gl/prostheticmesh.js';
import { DESIGNS, wallOf, tavrItems, frameAt } from '../gl/tavrmesh.js';
import { teeAnatomy, framesOf, planeAt, BY_KEY } from '../teeviews.js';

const T_KEY = 'tavrT';
const VALVE = 'tavrValve';
const LEAK = 'tavrLeak';

// ---------------------------------------------------------------- the procedure
// The slider's four steps, as shares of its range. Cross: the crimped valve comes down from the
// ascending aorta to its place over the annulus. Deploy: the frame expands. Check: the delivery
// system is out and color Doppler looks for paravalvular jets.
const STEPS = [
  { key: 'measure', name: 'Measure', a: 0, b: 0.22 },
  { key: 'cross', name: 'Cross', a: 0.22, b: 0.46 },
  { key: 'deploy', name: 'Deploy', a: 0.46, b: 0.7 },
  { key: 'check', name: 'Check', a: 0.7, b: 1 },
];
const stepOf = (t) => STEPS.find((S) => t < S.b) || STEPS[STEPS.length - 1];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** cm above its final place, as the crimped valve comes down (Cross); 0 from Deploy on. */
const dropAt = (t) => (t < 0.22 ? 0 : 4.5 * (1 - smooth((t - 0.24) / 0.17)));
/** The frame's expansion, 0 crimped to 1 expanded (Deploy). */
const expandAt = (t) => smooth((t - 0.48) / 0.16);

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
const DEPTH = { be: 0.2, se: 0.3 };    // cm the frame's inflow lies below the annulus (gl/tavrmesh.js)
// A new leak in a small, stiff ventricle: the LV takes up half of its volume as a larger stroke
// volume, and the forward volume falls by the other half (a model choice). The total crosses the
// valve in systole, so the flow and the gradient rise with the leak; the regurgitant fraction
// falls in its grade's column (19%, 43%, 60%).
const TAKEN = 0.5;

const valveOf = (s) => (s[VALVE] === 'se' ? 'se' : 'be');
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
 * The hemodynamics at slider position t: before deployment, the native stenosis; after it, the
 * valve's EOA, and a paravalvular leak's volume in the flow across the LVOT and the valve. While
 * the self-expanding frame expands, the orifice widens with it; while the balloon expands the
 * other frame, rapid pacing leaves little forward flow (paced).
 */
function modelAt(t, valve, leak) {
  const L = LEAKS[leak], V = VALVES[valve], u = expandAt(t), after = u >= 1;
  const rvol = after ? L.rvol : 0, flow = SV + TAKEN * rvol;
  const csa = Math.PI * (LVOT_D / 2) ** 2;
  const eoa = after ? V.eoa : valve === 'se' ? AVA0 + (V.eoa - AVA0) * u : AVA0;
  // the native stenosis peaks late and rounded; the new valve early
  const k = valve === 'se' ? u : after ? 1 : 0;
  const atet = 0.42 + (0.27 - 0.42) * k, p = 0.62 + (0.95 - 0.62) * k;
  const vtiL = flow / csa, vtiA = flow / eoa;
  return {
    t, valve, leak, after, u, paced: valve === 'be' && u > 0 && !after, eoa, flow, rvol, rf: rvol / flow, vtiL, vtiA, atet, p,
    vmax: vtiA / (100 * ET * gMean(qOf(atet), p)), vL: vtiL / (100 * ET * gMean(1, 0.8)),
  };
}

/** The values as reported, each calculation from the rounded values before it; none during pacing. */
function measure(m) {
  const v = { ...m, L: LEAKS[m.leak], V: VALVES[m.valve], step: stepOf(m.t) };
  v.depth = DEPTH[m.valve] * 10;   // mm
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
  if (key !== lastKey || !lastShown) { lastKey = key; lastShown = measure(modelAt(s[T_KEY], valveOf(s), leakOf(s))); }
  return lastShown;
}

let sheet = null, st = null;
const beat = new Beat(RR);
const redraw = () => { if (sheet) sheet.dirty = true; };

// ---------------------------------------------------------------- the TEE views
// The probe frames of the TEE views of the heart shown (teeviews.js), found once for each heart:
// both panels show the same heart.
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
 * multiplane angle, moved along its normal by shift() cm (the short axis, to the height that the
 * step asks for).
 */
class TeePanel extends MeshPanel {
  constructor(tee, spec, o = {}) {
    super('free', o);
    this.tee = tee;
    this.spec = spec;
    this.shiftOf = o.shift || null;
  }
  plane(tms) {
    const g = planeAt(teeFrames(this.ev)[this.tee], BY_KEY[this.tee].angle);
    const k = this.shiftOf ? this.shiftOf(this.ev, g, tms) : 0;
    if (k) g.O.addScaledVector(g.n, k);
    return { g, k };
  }
  draw(ctx, P, title, o = {}) {
    let key = '';
    if (this.state === 'ready') {
      const p = this.plane(o.tms ?? 0), spec = this.spec(this.ev, p.g);
      key = `${p.k.toFixed(3)}|${spec.zoom.uv.map((x) => x.toFixed(2)).join(',')}|${spec.zoom.w}`;
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

/**
 * The short axis's height on the root's axis above the hinge ring (cm): the cusps before
 * deployment, the frame's skirt after it, where paravalvular jets pass the annulus. The plane
 * leans 15 degrees from square to the root (teeviews.js: as square as the beam allows), so it
 * crosses the frame 0.3 cm lower on one side than at the axis: at 0.15 cm it meets the skirt of
 * either frame all round, just above the balloon-expandable frame's inflow.
 */
const saxH = (t) => (expandAt(t) > 0 ? 0.15 : 0.75);
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
  const av = ev.anat.point('av', 0, cycleAt(tms).s), h = saxH(st[T_KEY]);
  const C = [av.x + R.d[0], av.y + R.d[1], av.z + R.d[2]];
  const N = [g.n.x, g.n.y, g.n.z], nn = R.n[0] * N[0] + R.n[1] * N[1] + R.n[2] * N[2];
  if (Math.abs(nn) < 0.3) return 0;
  // the plane meets the axis where (C + h n - O - k N) . N = 0
  return shown((C[0] - g.O.x) * N[0] + (C[1] - g.O.y) * N[1] + (C[2] - g.O.z) * N[2] + h * nn, 3);
}

const HIDE = new Set(['AorticValve']);
const MESH_LAX = new TeePanel('meavlax', LAX_SPEC, { diseases: ['avSten', 'avThick'], redraw });
const MESH_SAX = new TeePanel('meavsax', SAX_SPEC, { diseases: ['avSten', 'avThick'], redraw, shift: saxShiftOf });

/** How far the valve's leaflets are open (0 shut to 1 open) for the cycle's aortic drive. */
const openOf = (drive) => Math.min(1, drive / 0.85);

/**
 * The panel's options for slider position t: before deployment, the heart's own aortic valve,
 * stenotic and calcified; from deployment on, that valve left out and the native leaflets drawn
 * pushed out by the frame; the transcatheter valve and its delivery system as B-mode items.
 */
function procedure(v, t) {
  const u = expandAt(t), drop = dropAt(t), system = t >= 0.22 && t < 0.7;
  const on = t >= 0.22;
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
    const wall = wallOf(ev, F);
    const apex = ev.anat.point('apex_endo', 0, state.s);
    return tavrItems(F, wall, {
      kind: v.valve, u, drop, system, native: u > 0, open: u >= 1 ? openOf(state.drive.av) : 0,
      orifice: v.V.eoa / 0.9, apex: [apex.x, apex.y, apex.z],
    }, g);
  };
  o.extraKey = `${v.valve}|${u.toFixed(3)}|${drop.toFixed(3)}|${system}`;
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
 * placed from it, so both views show each jet at the same place on the frame: 0 posterior, on the
 * near side of both views; 180 anterior, in their far field.
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

function lax(ctx, box, v, tt) {
  const t = v.t, step = v.step, measuring = step.key === 'measure';
  // the annulus is measured on a frame held in mid-systole
  const tms = measuring ? MID_SYS : tt, s = cycleAt(tms).s;
  const mm = annMm[teeKey] ?? null;
  const lines = measuring ? (mm ? [[`Annulus ${mm} mm`, `${mm} mm`]] : null) : expandAt(t) >= 1 ? [[`Depth ${fmt(v.depth, 0)} mm`, `${fmt(v.depth, 0)} mm`]] : null;
  const title = fit(box.w, `ME AV LAX · 120° · ${v.V.label}-MM ${v.valve === 'be' ? 'BALLOON-EXPANDABLE' : 'SELF-EXPANDING'}`, 'ME AV LAX');
  const F = MESH_LAX.draw(ctx, box, title, {
    tms, ...procedure(v, t), lines: lines || undefined,
    names: measuring ? [['ao', 'Ao'], ['la', 'LA'], ['lvot', 'LVOT']] : [['ao', 'Ao'], ['la', 'LA']],
    over: (c, F, ev) => {
      const A = annulusOf(ev, s), g = ev.g;
      if (!A || !g) return;
      const back = posterior(A);
      if (measuring) {
        // the annulus: hinge point to hinge point, in the plane of the long axis
        const a = toPlane(g, atF(A, A.R, back, 0)), b = toPlane(g, atF(A, A.R, back + Math.PI, 0));
        cal(c, F, a, b, '');
      } else if (expandAt(t) >= 1) {
        // the implant depth on the anterior side: from the annulus to the frame's inflow
        const fr = frameAt(v.valve, wallOf(ev, A)), front = back + Math.PI;
        const r = fr.r(fr.lo, front) + 0.3;
        cal(c, F, toPlane(g, atF(A, r, front, 0)), toPlane(g, atF(A, r, front, fr.lo)), '');
        if (step.key === 'check' && v.L.jets.length) leakLax(c, F, A, g, v, tt, fr, back);
      }
    },
  });
  noteAnnulus(MESH_LAX.ev);
  return F;
}

/** The jet of v.L that lies on the side at angle side (degrees from posterior), within its width and 8 degrees of beam width. */
const jetOn = (v, side) => v.L.jets.find(([j, w]) => Math.abs((((side - j) % 360) + 540) % 360 - 180) <= w / 2 + 8);

/**
 * The paravalvular jets on the long axis, in diastole: from outside the frame's inflow into the
 * LVOT, where a jet lies on the plane: on its posterior side (0) or its anterior side (180).
 */
function leakLax(c, F, A, g, v, tt, fr, back) {
  const a = diastoleAt(tt);
  if (a <= 0.02) return;
  for (const side of [0, 180]) {
    if (!jetOn(v, side)) continue;
    const ang = back + (side * Math.PI) / 180;
    const r = fr.r(fr.lo + 0.1, ang) + 0.06 + v.L.vc / 2;
    const O = toPlane(g, atF(A, r, ang, fr.lo + 0.05)), down = toPlane(g, atF(A, r - 0.25, ang, fr.lo - 1));
    const dir = [down[0] - O[0], down[1] - O[1]], l = Math.hypot(dir[0], dir[1]) || 1;
    jet(c, F, { O, dir: [dir[0] / l, dir[1] / l], q: v.L.rvol * 2, va: 60, vc: v.L.vc, jl: 0.8 + 3 * (v.L.ext / 36), jw: v.L.vc * 2.4, a: a * shade(side), pisa: false, box: false });
  }
}
/**
 * How much of a jet's color the mid-esophageal views show at its angle from the posterior side:
 * all of a posterior jet; less of an anterior one, in the far field behind the frame, where the
 * frame's shadow hides it (Zoghbi 2019).
 */
const shade = (j) => 1 - 0.6 * smooth((Math.abs((((j % 360) + 540) % 360) - 180) - 60) / 60);

function sax(ctx, box, v, tt) {
  const s = cycleAt(tt).s, t = v.t, step = v.step;
  const title = fit(box.w, `ME AV SAX · 30° · ${expandAt(t) > 0 ? 'FRAME AT THE SKIRT' : 'CUSPS'}`, 'ME AV SAX');
  return MESH_SAX.draw(ctx, box, title, {
    tms: tt, ...procedure(v, t),
    names: [['la', 'LA'], ['ra', 'RA'], ['rvot', 'RVOT']],
    over: (c, F, ev) => {
      if (step.key !== 'check' || !v.L.jets.length) return;
      const A = annulusOf(ev, s), g = ev.g;
      if (!A || !g) return;
      leakSax(c, F, A, g, v, tt, frameAt(v.valve, wallOf(ev, A)), posterior(A));
    },
  });
}

/**
 * The paravalvular jets on the short axis, in diastole: color in the crescents between the frame
 * and the annulus that the jets take; their share of the circumference is the leak's extent.
 */
function leakSax(c, F, A, g, v, tt, fr, back) {
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
    mosaic(c, poly, a * shade(j), j);
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
/**
 * CW from the deep transgastric view through the valve: the forward jet away from the probe in
 * systole; after deployment, a paravalvular leak's signal toward the probe in diastole, as faint
 * or dense as the leak is large, its slope from the pressure half-time.
 */
function cwPanel(ctx, P, v) {
  if (v.paced) return pacedPanel(ctx, P, 'CW · DEEP TG · RAPID PACING', 'CW · PACING', 0.9, 'cw');
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, `CW · ${v.after ? 'TRANSCATHETER VALVE' : v.u > 0 ? 'VALVE EXPANDING' : 'NATIVE AORTIC VALVE'} · DEEP TG`, 'CW · AV'));
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
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, long, short));
  const bx = inner(P), base = 0.12, vs = 2;
  const beatAt = (u) => { const x = ((u * 2 * RR) % PACE) / (PACE * 0.5); return x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0; };
  spectral(ctx, bx, { fn: (u) => -vmax * beatAt(u), scale: vs, base, mode, broad: mode === 'cw' ? 0.45 : 0.14, key: `tavrpace|${mode}|${vmax}`, seed: mode === 'cw' ? 5 : 6 });
  vscale(ctx, bx, vs, base, 0.5);
  note(ctx, bx, ['Balloon inflated once systolic pressure ≤50 mmHg', 'Systolic ≤50 mmHg', 'Pacing'], 'bottom');
  return bx;
}

/** PW in the LVOT from the deep transgastric view, the sample just proximal to the frame (ASE 2024). */
function pwPanel(ctx, P, v) {
  if (v.paced) return pacedPanel(ctx, P, 'PW · LVOT · RAPID PACING', 'PW · PACING', 0.3, 'pw');
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, v.after ? 'PW · LVOT, JUST PROXIMAL TO THE FRAME · DEEP TG' : 'PW · LVOT · DEEP TG', 'PW · LVOT'));
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
 * The measurements against their cut-offs: before deployment, those of severe aortic stenosis
 * (Baumgartner 2017); after it, the valve's intended performance (VARC-3), the circumferential
 * extent of a paravalvular leak (ASE 2024 Table 8) and the indexed EOA (mismatch, ASE 2024
 * Table 7, BMI below 30 kg/m²). During pacing no values are taken.
 */
function meterItems(v) {
  if (!v.after) {
    return [
      { k: 'Peak velocity', v: v.vmax, u: 'm/s', d: 1, lo: 1, hi: 6, cuts: [[4, '4']], bad: v.vmax >= 4 },
      { k: 'Mean gradient', v: v.mg, u: 'mmHg', lo: 0, hi: 80, cuts: [[40, '40']], bad: v.mg >= 40 },
      { k: 'AVA', v: v.eoaShown, u: 'cm²', d: 2, lo: 0.2, hi: 3, cuts: [[1, '1.0']], bad: v.eoaShown <= 1 },
      { k: 'DVI', v: v.dvi, u: '', d: 2, lo: 0.1, hi: 0.8, cuts: [[0.25, '0.25']], bad: v.dvi < 0.25 },
    ];
  }
  return [
    { k: 'Peak velocity', v: v.vmax, u: 'm/s', d: 1, lo: 1, hi: 5, cuts: [[3, '3']], bad: !v.crit.vmax },
    { k: 'Mean gradient', v: v.mg, u: 'mmHg', lo: 0, hi: 50, cuts: [[20, '20']], bad: !v.crit.mg },
    { k: 'DVI', v: v.dvi, u: '', d: 2, lo: 0.1, hi: 0.8, cuts: [[0.25, '0.25']], bad: !v.crit.dvi },
    { k: 'Leak extent', v: v.L.ext, u: '%', lo: 0, hi: 50, cuts: [[10, '10'], [30, '30']], bad: !v.crit.ar },
    { k: 'Indexed EOA', v: v.ieoa, u: 'cm²/m²', d: 2, lo: 0.4, hi: 1.4, cuts: [[0.65, '0.65'], [0.85, '0.85']], bad: v.ieoa <= 0.85 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = shownOf(st);
  const tt = beat.at(true, 200);
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.2, 1], 8);
    const [a1, a2] = rows(a, [1.2, 1], 8);
    lax(ctx, a1, v, tt);
    sax(ctx, a2, v, tt);
    const [b1, b2] = rows(b, [1, 1], 8);
    for (const bx of [cwPanel(ctx, b1, v), pwPanel(ctx, b2, v)]) cursor(ctx, bx, beat.sweep);
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.45 - 16, h: H - 48 };
  const colR = { x: W * 0.465, y: 36, w: W * 0.535 - 18, h: H - 48 };
  const vh = Math.min(colL.w * 1.0, colL.h * 0.64);
  lax(ctx, { x: colL.x, y: colL.y, w: colL.w, h: vh }, v, tt);
  meters(sh, t, { x: colL.x, y: colL.y + vh + 16, w: colL.w, h: colL.h - vh - 16 }, meterItems(v));
  const [r1, r2, r3] = rows(colR, [1.25, 1, 0.75], 10);
  sax(ctx, r1, v, tt);
  for (const bx of [cwPanel(ctx, r2, v), pwPanel(ctx, r3, v)]) cursor(ctx, bx, beat.sweep);
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const LIVE = {
  measure: (v, c, mm) => `<b>Measure.</b> The calcified native valve opens little: a peak velocity of ${fmt(v.vmax, 1)} m/s and a mean gradient of ${v.mg} mmHg, severe stenosis${c('baumgartner2017')}. On the long axis, held in systole, the annulus measures ${mm ? `${mm} mm` : '–'} from hinge point to hinge point${c('hahn2022')}; the short axis shows the three cusps and their calcium${c('zamorano2011')}.`,
  cross: (v, c) => `<b>Cross.</b> A stiff guidewire lies across the valve with its end curved in the LV apex; TEE watches it for entanglement in the mitral apparatus${c('hahn2015')}. The crimped valve comes down over it to the annulus, positioned against the cusps' hinge points${c('hahn2015')}.`,
  deploy: (v, c) => (v.valve === 'be'
    ? `<b>Deploy.</b> Under rapid ventricular pacing, the balloon is inflated once the systolic pressure is 50 mmHg or less and held full for 3 seconds${c('fdas3')}: the frame expands along its whole length at once. Its ventricular end lies 2 mm below the annulus, a 90/10 position (aortic/ventricular) inside the 80/20 to 90/10 target${c('blackman2021')}.`
    : `<b>Deploy.</b> The capsule draws back and the frame expands from its inflow up, without rapid pacing${c('zoghbi2019')}; until release it can be recaptured and placed again${c('fdaevolut')}. The target depth is 3 mm below the noncoronary cusp${c('grubb2025')}; the leaflets sit above the annulus${c('popma2019')}.`),
  check: (v, c) => {
    const where = { mild: 'One jet at the frame\'s ventricular edge', moderate: 'Two jets', severe: 'Three jets' }[v.leak];
    const leak = v.leak === 'none'
      ? 'No paravalvular jet enters the LVOT.'
      : `${where} take${v.leak === 'mild' ? 's' : ''} ${v.L.ext}% of the frame's circumference: ${v.leak} paravalvular regurgitation${c('zoghbi2024')}.${v.leak === 'mild' ? '' : ` The anterior jet lies in the frame's shadow on the mid-esophageal views; the deep transgastric view shows it${c('zoghbi2019')}.`}`;
    const ok = v.success
      ? `Each criterion of the valve's intended performance is met${c('genereux2021')}.`
      : `Moderate or greater regurgitation fails the valve's intended performance${c('genereux2021')}${v.mg >= 20 ? '; the leak\'s volume crosses the valve again in systole, and the gradient rises with the flow' : ''}.`;
    return `<b>Check.</b> ${leak} The mean gradient is ${v.mg} mmHg, the peak velocity ${fmt(v.vmax, 1)} m/s and the DVI ${fmt(v.dvi, 2)}. ${ok}`;
  },
};

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

/** The TEE views of each step, EACVI 2023 Table 6 with ASE 2022 and 2019 (the current step's rows marked). */
const VIEWS = [
  ['measure', 'ME AV long axis, 120–140°', 'Annulus at the hinge points, in systole; LVOT and septum'],
  ['measure', 'ME AV short axis, 30–60°', 'Cusps, their opening and calcium'],
  ['measure', '3D zoom of the root', 'Annular area and perimeter; left main height'],
  ['measure', 'Deep transgastric; descending aorta', 'Baseline gradient and regurgitation; baseline aortic flow'],
  ['cross', 'ME four-chamber, 0–30°; TG long axis, 90–120°', 'Pacing wire in the RV; effusion'],
  ['cross', 'ME mitral biplane: two-chamber 60–90°, long axis 120–140°', 'Stiff wire and the mitral apparatus'],
  ['cross', 'ME AV long axis', 'Crimped valve against the hinge points'],
  ['deploy', 'ME AV long axis, biplane or 3D', 'Frame ends and implant depth'],
  ['check', 'ME AV biplane, to the frame\'s ventricular edge', 'Frame shape, leaflet motion, paravalvular jets'],
  ['check', 'Deep transgastric', 'Gradient, peak velocity, DVI; anterior jets'],
  ['check', 'Descending aorta', 'New holodiastolic flow reversal'],
  ['check', 'ME and TG short axis; ME mitral views', 'Wall motion, effusion; new MR'],
];
function viewsTable(host, key, c) {
  if (!host) return;
  let last = '';
  host.innerHTML = `<caption>TEE views by step${c('agricola2023,hahn2022,zoghbi2019')}</caption>
    <thead><tr><th>Step</th><th>View</th><th>Shows</th></tr></thead>
    <tbody>${VIEWS.map(([k, view, shows]) => {
      const name = k === last ? '' : STEPS.find((S) => S.key === k).name;
      last = k;
      return `<tr class="${k === key ? 'cur' : ''}"><td>${name}</td><td>${view}</td><td>${shows}</td></tr>`;
    }).join('')}</tbody>`;
}

const tavrPage = {
  key: 'tavr',
  part: 'valves',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Transcatheter aortic valve replacement',
  nav: 'TAVR',
  dwell: 44,
  // tavrGeo: the heart whose annulus the readouts give (set when the long axis has measured it)
  defaults: { tavrT: 0.85, tavrValve: 'be', tavrLeak: 'mild', tavrGeo: '' },
  format: {
    tavrT: (x) => stepOf(x).name,
  },
  watch: ['tavrT', 'tavrValve', 'tavrLeak', 'tavrGeo', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    // the steps under the slider, as the grades sit under a severity slider
    paintBands(document.getElementById('tavr-steps'), STEPS.map((S) => ({ a: S.a, b: S.b, g: S.name })), {});
  },
  enter({ set }) { setState = set; MESH_LAX.start(); MESH_SAX.start(); },
  warm() { MESH_LAX.start(); MESH_SAX.start(); },
  pulse: () => beat.pulse(),
  anim(dt) {
    if (beat.tick(dt, true) && sheet) sheet.dirty = true;
  },
  // the sequence: the balloon-expandable valve through the four steps with no leak; then the
  // self-expanding valve, its check through each grade of paravalvular regurgitation
  tourEnter(set) { set({ tavrT: 0, tavrValve: 'be', tavrLeak: 'none' }); },
  tourTick(tt, set) {
    const pass = (t0, len) => Math.round(clamp((tt - t0) / len, 0, 1) * 200) / 200;
    if (tt < 20) set({ tavrValve: 'be', tavrLeak: 'none', tavrT: pass(0, 18) });
    else set({ tavrValve: 'se', tavrLeak: tt < 37 ? 'none' : tt < 39.5 ? 'mild' : tt < 42 ? 'moderate' : 'severe', tavrT: pass(20, 16) });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) {
    if (valveOf(s) === 'be') return s.tavrT * 18;
    const leak = leakOf(s);
    if (leak !== 'none' && s.tavrT >= 1) return { mild: 37, moderate: 39.5, severe: 42 }[leak];
    return 20 + s.tavrT * 16;
  },
  text(s, { cite }) {
    const v = shownOf(s);
    const c = (k) => cite(k);
    const mm = annMm[teeKey] ?? null;
    return {
      readouts: [
        { k: 'Step', v: v.step.name, text: true },
        { k: 'Annulus, 2D TEE', v: mm ? `${mm}` : '–', u: 'mm' },
        { k: 'Valve', v: `${v.V.label} mm, ${v.V.name}`, text: true },
        { k: 'Implant depth', v: v.after ? fmt(v.depth, 0) : '–', u: 'mm' },
        { k: 'Peak velocity', v: fmt(v.vmax, 1), u: 'm/s', flag: v.after ? !v.crit.vmax : v.vmax >= 4 },
        { k: 'Mean gradient', v: fmt(v.mg), u: 'mmHg', flag: v.after ? !v.crit.mg : v.mg >= 40 },
        { k: 'DVI', v: fmt(v.dvi, 2), flag: v.dvi < 0.25 },
        { k: 'Paravalvular leak', v: v.after ? `${v.leak}${v.L.ext ? `, ${v.L.ext}%` : ''}` : '–', text: true, flag: v.after && !v.crit.ar },
        { k: 'Result', v: v.after ? (v.success ? 'intended performance' : 'not met') : v.paced ? 'pacing' : v.u > 0 ? 'expanding' : 'severe AS', text: true, flag: v.after ? !v.success : v.u === 0 },
      ],
      live: LIVE[v.step.key](v, c, mm),
      extra: (art) => {
        gradeTable(art.querySelector('#tavr-table'), leakRows(v), 'Paravalvular regurgitation after TAVR', ['Mild', 'Moderate', 'Severe']);
        viewsTable(art.querySelector('#tavr-views'), v.step.key, c);
      },
    };
  },
};
export default tavrPage;
export { modelAt, measure, STEPS, LEAKS, VALVES };
