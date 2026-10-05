// Infective endocarditis: one slider from a normal mitral valve to a large vegetation with leaflet
// perforation and severe acute mitral regurgitation, and a switch for the frame shown.
// A vegetation appears on the atrial side of the anterior mitral leaflet and grows to 22 mm: a
// sessile nodule that oscillates, then a pedunculated mass that prolapses across the coaptation
// plane (Saric 2016 Table 5). The size is the maximal length (Delgado 2023), flagged at 10 mm,
// the length in the ESC recommendations for urgent surgery to prevent embolism. Then the leaflet
// perforates: an eccentric jet crosses the leaflet's body, graded by its vena contracta with the
// cut-offs of chronic MR (Zoghbi 2017 Table 8), and the pulmonary vein flow reverses in systole
// when it is severe. The views are cut from the heart mesh: the parasternal long axis zoomed on the
// valves, with a caliper on the vegetation, and the apical three-chamber view with the color jet.
// Both lie in one plane, which holds the vegetation and the hole (gl/endocarditismesh.js).
import { Sheet, clamp, MONO } from '../sketch.js';
import { panel, spectral, vscale, SC } from '../scope.js';
import { RR, EV, cycleAt, mitralV } from '../cyclemodel.js';
import { mono, tracks, bands, paintBands, playSeverity, Beat, cine, cursor, rows, cols, inner, meters, note, fit, shown as rounded, waveLetter } from '../sev.js';
import { cal, jet, barFor } from '../echo2d.js';
import { MeshPanel } from '../meshpanel.js';
import { onPlane, blood, cavity, sub, add, mul, dot, unit, perp } from '../meshjet.js';
import { endocarditisHook } from '../gl/endocarditismesh.js';

const KEY = 'ieS';
const FRAME = 'ieFrame';
const NYQ = 60;                // cm/s, the color scale (ASE 2017: 50-70 cm/s for the jet area)
const T_SYS = 250, T_DIA = 560;   // ms after the R wave: the frames held for systole and diastole
const CUT = 10;                // mm, the vegetation length of the ESC recommendations on surgery (Delgado 2023)

// ---------------------------------------------------------------- the model
// The tracks over the slider s. veg: the vegetation's maximal length (mm), from none to 22 mm; it
// reaches 10 mm at s 0.31. vc: the vena contracta of the perforation jet (cm), printed to 0.1 cm:
// none below s 0.5, then 0.1 cm, 0.3 cm (moderate) from s 0.62 and 0.7 cm (severe) from s 0.78.
// vmax: the MR jet's peak velocity (m/s), lower as the LA pressure rises in acute MR (Zoghbi
// 2017); tri: how early the CW envelope peaks (0 round, 1 triangular). The pulmonary vein S and D
// (m/s) follow the vena contracta as Table 8 grades them: systolic dominance with mild MR,
// blunting with moderate MR, reversal with severe MR.
const STOPS = [0, 0.04, 0.2, 0.31, 0.5, 0.62, 0.78, 1];
const TRK = tracks(STOPS, {
  veg: [0, 2, 7, 10.5, 15, 17, 19.5, 22],
  vc: [0, 0, 0, 0, 0.05, 0.25, 0.65, 0.9],
  vmax: [5.0, 5.0, 5.0, 5.0, 5.0, 4.8, 4.3, 4.0],
  tri: [0, 0, 0, 0, 0, 0.2, 0.8, 1],
});
const pvSOf = mono([[0, 0.55], [0.2, 0.5], [0.3, 0.42], [0.5, 0.22], [0.65, 0.05], [0.7, -0.05], [0.9, -0.3]]);
const pvDOf = mono([[0, 0.42], [0.3, 0.45], [0.7, 0.58], [0.9, 0.62]]);

/** How far the vegetation is pedunculated and prolapses (0 a sessile nodule, 1 prolapsing), by its length (mm). */
export function mobOf(veg) {
  if (veg <= 0) return 0;
  const u = clamp((veg - 6.5) / 2, 0, 1);
  return u * u * (3 - 2 * u);
}
/** The MR grade of the vena contracta (cm), with the cut-offs of chronic MR (Zoghbi 2017 Table 8). */
export const mrOf = (vc) => (vc <= 0 ? 'none' : vc < 0.3 ? 'mild' : vc < 0.7 ? 'moderate' : 'severe');

/**
 * The values at slider position s, as the page prints them: the length in whole millimetres, the
 * vena contracta to 0.1 cm, the velocities to 0.1 m/s and 0.01 m/s; the grade, the flags and the
 * words come from these (sev.js shown), and the image draws them.
 */
export function modelAt(s) {
  const m = TRK(s);
  const v = { s };
  v.veg = rounded(Math.max(0, m.veg));
  v.vc = rounded(Math.max(0, m.vc), 1);
  v.vmax = rounded(m.vmax, 1);
  v.tri = rounded(m.tri, 2);
  v.mob = mobOf(v.veg);
  v.prolapse = v.veg >= 8;
  v.mr = mrOf(v.vc);
  v.pvS = rounded(pvSOf(v.vc), 2);
  v.pvD = rounded(pvDOf(v.vc), 2);
  v.sd = v.pvD > 0 ? rounded(v.pvS / v.pvD, 1) : 0;
  v.grade = v.vc > 0 ? `${v.mr} MR` : v.veg >= CUT ? '≥10 mm' : v.veg > 0 ? '<10 mm' : 'none';
  return v;
}
export const gradeOf = (s) => modelAt(s).grade;

// the grades along the slider, as the bands under it name them, and their levels (sev.js paintBands)
const LEV = { none: 0, '<10 mm': 1, '≥10 mm': 2, 'mild MR': 3, 'moderate MR': 4, 'severe MR': 5 };
const BAND_SHORT = { '<10 mm': '<10', '≥10 mm': '≥10', 'mild MR': 'mild', 'moderate MR': 'mod.', 'severe MR': 'severe' };
const LEAD = {
  none: 'No vegetation',
  '<10 mm': 'Small vegetation on the anterior mitral leaflet',
  '≥10 mm': 'Vegetation of 10 mm or more',
  'mild MR': 'Leaflet perforation with mild MR',
  'moderate MR': 'Leaflet perforation with moderate MR',
  'severe MR': 'Leaflet perforation with severe MR',
};
let BANDS = [];

let sheet = null, st = null;
const beat = new Beat(RR);
const redraw = () => { if (sheet) sheet.dirty = true; };

// ---------------------------------------------------------------- the views
// The parasternal long axis zoomed on the valves, and the apical three-chamber view, cut from the
// heart mesh: the heart the page shows, with the vegetation and the perforation of the values on
// screen (gl/endocarditismesh.js, through echo.js extra).
const PLAX = new MeshPanel('plax_avmv', { redraw });
const A3C = new MeshPanel('a3c', { redraw });

/** The zoomed long axis looks at a point 1 cm from the mitral valve toward the apex, so the vegetation stays in the box in systole and in diastole. */
function zoomCentre(ev) {
  const an = ev.anchors(0), m = ev.toPlane(an.mv, ev.g), a = ev.toPlane(an.apex, ev.g);
  const d = Math.hypot(a[0] - m[0], a[1] - m[1]) || 1;
  return [m[0] + ((a[0] - m[0]) / d) * 1.0, m[1] + ((a[1] - m[1]) / d) * 1.0];
}
const extraOf = (v) => ({ extra: endocarditisHook({ veg: v.veg, mob: v.mob, hole: v.vc }), extraKey: `${v.veg}|${v.mob.toFixed(3)}|${v.vc}` });

/** The longest of the titles that fits a panel w px wide (scope.js panel: 11 px, 10 px in from each side). */
function titleOf(ctx, w, names) {
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  const t = names.find((s) => ctx.measureText(s).width <= w - 20) || names[names.length - 1];
  ctx.restore();
  return t;
}

function plax(ctx, box, v, tt) {
  if (PLAX.ev) {
    const z = zoomCentre(PLAX.ev);
    PLAX.ev.zoomAt = z;
  }
  const z = PLAX.ev ? PLAX.ev.zoomAt : [0, 0];
  const X = extraOf(v);
  // the LA named toward its roof, clear of the vegetation that it holds in systole
  const names = [['la', 'LA', 'ao', 0.4], ['plv', 'LV', 'asw', 0.5], ['ao', 'Ao']];
  const lines = [`veg ${v.veg ? `${v.veg} mm` : 'none'}`, ...(v.vc > 0 ? [[`perforation · VC ${v.vc.toFixed(1)} cm`, `VC ${v.vc.toFixed(1)} cm`]] : [])];
  PLAX.draw(ctx, box, titleOf(ctx, box.w, ['PARASTERNAL LONG AXIS · ZOOM', 'PLAX · ZOOM', 'PLAX']), {
    tms: tt, ...X, extraKey: `${X.extraKey}|${z[0].toFixed(3)}|${z[1].toFixed(3)}`,
    names,
    over: (c, F, ev) => {
      const V = ev.ie && ev.ie.veg;
      if (!V) return;
      // the caliper on the vegetation's maximal length
      const [p, q] = V.ends;
      const tip = Math.hypot(p[0] - V.base[0], p[1] - V.base[1]) > Math.hypot(q[0] - V.base[0], q[1] - V.base[1]) ? p : q;
      cal(c, F, p, q, '', { solid: true });
      c.save();
      c.font = `500 11px ${MONO}`;
      const label = `${v.veg} mm`;
      const hw = c.measureText(label).width / 2 + 2, bx = F.view.box;
      // the length beyond the far end, or beside the vegetation where a name or the measurement
      // box takes that place
      const T = F.P(tip), o = unit(sub(tip, V.base)), s = perp(o), M = F.P(mul(add(p, q), 0.5));
      const half = V.polys.flat().reduce((m, r) => Math.max(m, Math.abs(dot(sub(F.P(r), M), s))), 0);
      const keep = [...nameBoxes(c, F, ev, names, cycleAt(tt).s), measureBox(c, F, lines)];
      const spots = [add(T, mul(o, hw + 5)), add(M, mul(s, half + 10)), add(M, mul(s, -half - 10)), add(add(T, mul(o, hw + 5)), mul(s, 16)), add(add(T, mul(o, hw + 5)), mul(s, -16))]
        .map(([x0, y0]) => [clamp(x0, bx.x + hw, bx.x + bx.w - hw), clamp(y0, bx.y + 10, bx.y + bx.h - 10)]);
      const clear = ([x, y]) => keep.every((b) => !b || x + hw < b.x || x - hw > b.x + b.w || y + 8 < b.y || y - 8 > b.y + b.h);
      const [x, y] = spots.find(clear) || spots[0];
      c.fillStyle = SC.cal;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(8,10,12,0.85)';
      c.strokeText(label, x, y);
      c.fillText(label, x, y);
      c.restore();
    },
    lines,
  });
}

/** The boxes (px) of the chamber names, where MeshPanel.tags puts them. */
function nameBoxes(ctx, F, ev, names, s) {
  const an = ev.anchors(s), bx = F.view.box, out = [];
  ctx.save();
  ctx.font = `600 11px ${MONO}`;
  for (const [k, name, toward, f] of names) {
    if (!an[k]) continue;
    const [x0, y0] = F.P(F.cm(toward && an[toward] ? an[k].clone().lerp(an[toward], f) : an[k]));
    const hw = ctx.measureText(name).width / 2 + 3;
    const x = clamp(x0, bx.x + hw + 2, bx.x + bx.w - hw - 2), y = clamp(y0, bx.y + 10, bx.y + bx.h - 10);
    out.push({ x: x - hw, y: y - 9, w: 2 * hw, h: 18 });
  }
  ctx.restore();
  return out;
}

/** About the box (px) of the measurement lines at the panel's lower left (echo2d.js measures). */
function measureBox(ctx, F, lines) {
  if (!lines.length) return null;
  ctx.save();
  ctx.font = `500 10.5px ${MONO}`;
  const w = Math.max(...lines.map((l) => ctx.measureText([].concat(l)[0]).width)) + 16;
  ctx.restore();
  const h = lines.length * 13.5 + 12;
  return { x: F.box.x, y: F.box.y + F.box.h - 8 - h, w: w + 8, h: h + 8 };
}

/** The LA on the plane: its blood, from its middle to the walls and the leaflets. */
function laOf(ev, s) {
  const an = ev.anchors(s);
  const C = blood(ev, onPlane(ev, an.la));
  return cavity(ev, C);
}

/** The jet's strength over systole (0..1): from mitral closure to opening, peaking early when the envelope is triangular. */
function strengthAt(t, tri) {
  if (t < EV.mvc || t > EV.mvo) return 0;
  const w = (t - EV.mvc) / (EV.mvo - EV.mvc);
  const round = Math.pow(Math.sin(Math.PI * w), 0.35);
  const early = w < 0.3 ? Math.pow(w / 0.3, 0.45) : Math.pow((1 - w) / 0.7, 0.7);
  return round * (1 - tri) + early * tri;
}

function a3c(ctx, box, v, tt) {
  const X = extraOf(v);
  const c0 = cycleAt(tt);
  A3C.draw(ctx, box, titleOf(ctx, box.w, [`APICAL THREE-CHAMBER · COLOR ${NYQ} cm/s`, `A3C · COLOR ${NYQ} cm/s`, `A3C · ${NYQ}`]), {
    tms: tt, ...X,
    names: [['lv', 'LV', 'apex', 0.45], ['la', 'LA', 'mv', -0.7], ['ao', 'Ao']],
    over: (c, F, ev) => {
      barFor(c, F, -NYQ, NYQ);
      const H = ev.ie && ev.ie.hole;
      if (!H || !(v.vc > 0)) return;
      const a = strengthAt(c0.t, v.tri);
      if (!(a > 0.02)) return;
      const LA = laOf(ev, c0.s);
      if (LA.length < 12) return;
      // an eccentric jet through the hole, square to the leaflet, into the LA, which clips it; its
      // length and width grow with the vena contracta to the LA's far wall
      const f = clamp(v.vc / 0.8, 0, 1);
      const q = Math.PI * (v.vc / 2) ** 2 * v.vmax * 100;
      // the flow that converges on the hole comes straight to it from the LV: the blood seen from
      // the hole's middle, on the LV side of the line across it
      const tq = perp(H.n), lip = [add(H.Q, mul(tq, H.c + 0.1)), sub(H.Q, mul(tq, H.c + 0.1))];
      const LV = cavity(ev, sub(H.Q, mul(H.n, 0.05)), [lip], 9, 180);
      jet(c, F, { q, va: NYQ, vc: v.vc, jl: 0.9 + 3.3 * f, jw: 0.35 + 1.1 * f, a, pisa: true, O: H.Q, dir: H.n, clip: LA, pclip: LV.length >= 12 ? LV : null });
      tissueOver(c, F, ev);
    },
  });
}

/**
 * The scanner shows tissue before flow (the color write priority): the vegetation and the valve
 * leaflets cover the jet's color. The B-mode image is drawn again inside their sections.
 */
function tissueOver(ctx, F, ev) {
  const polys = (ev.ie && ev.ie.veg ? ev.ie.veg.polys : []).slice();
  for (const L of (ev.last && ev.last.valves) || []) if (L.closed && L.pts.length > 2) polys.push(L.pts);
  if (!polys.length) return;
  const path = new Path2D();
  for (const poly of polys) {
    // all sections wound one way, so where two overlap the clip keeps both
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    (area < 0 ? poly.slice().reverse() : poly).forEach((p, i) => { const q = F.P(p); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
    path.closePath();
  }
  const bx = F.view.box;
  ctx.save();
  ctx.clip(path);
  ctx.drawImage(ev.canvas, bx.x, bx.y, ev.w, ev.h);
  ctx.restore();
}

// ---------------------------------------------------------------- Doppler
/** CW through the mitral valve from the apex: the MR jet below the baseline in systole, the inflow above it in diastole. */
function mrCW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'CW · MITRAL VALVE, APICAL', 'CW · MV'));
  const bx = inner(P);
  const leak = v.vc > 0, base = 0.22, vs = 6;
  // a faint jet in mild MR, dense in severe (Zoghbi 2017 Table 8)
  const dens = leak ? clamp(0.25 + v.vc / 0.8, 0.25, 1) : 0;
  const mr = (u) => {
    const t = (u * 2 * RR) % RR;
    return leak && t >= EV.mvc && t <= EV.mvo ? -v.vmax * strengthAt(t, v.tri) : 0;
  };
  const inflow = (u) => mitralV((u * 2 * RR) % RR, 0.8, 0.55);
  spectral(ctx, bx, { fn: [mr, inflow], scale: vs, base, mode: 'cw', broad: 0.35 + 0.35 * (1 - dens), gain: [0.45 + 0.55 * dens, 1], key: `iecw|${leak}|${v.vmax}|${v.tri}|${dens.toFixed(2)}`, seed: 31 });
  vscale(ctx, bx, vs, base, 2);
  const word = !leak ? 'no regurgitation' : v.mr === 'severe' ? 'dense, triangular' : v.mr === 'moderate' ? 'dense, partial' : 'faint';
  note(ctx, bx, leak ? [`MR peak ${v.vmax.toFixed(1)} m/s · ${word}`, `MR ${v.vmax.toFixed(1)} m/s · ${word}`, `MR ${v.vmax.toFixed(1)} m/s`] : ['no regurgitation', 'no MR'], 'bottom');
  return bx;
}

/** Pulmonary vein, PW: S and D toward the probe, atrial reversal Ar below the baseline. */
function pvPW(ctx, P, v) {
  panel(ctx, P.x, P.y, P.w, P.h, fit(P.w, 'PW · RIGHT UPPER PULMONARY VEIN', 'PW · PULM. VEIN'));
  const bx = inner(P);
  const S = v.pvS, D = v.pvD, Ar = -0.25;
  const bump = (t, a, b, pk) => (t > a && t < b ? Math.sin(Math.PI * Math.pow((t - a) / (b - a), Math.log(0.5) / Math.log((pk - a) / (b - a)))) : 0);
  const fn = (u) => {
    const t = (u * 2 * RR) % RR;
    const tt = t < 60 ? t + RR : t;
    return S * bump(t, 90, 400, 250) + D * bump(t, EV.mvo + 15, 720, 540) + Ar * bump(tt, 790, 900, 835);
  };
  spectral(ctx, bx, { fn, scale: 1.0, base: 0.6, mode: 'pw', broad: 0.12, key: `iepv|${S}|${D}`, seed: 33 });
  vscale(ctx, bx, 1.0, 0.6, 0.5, '');
  const y0 = bx.y + 0.6 * bx.h, k = (bx.h * 0.6) / 1.0;
  const X = (ms) => bx.x + (ms / (2 * RR)) * bx.w;
  ctx.save();
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = SC.cal;
  ctx.textAlign = 'center';
  const letters = [
    waveLetter(ctx, 'S', X(250), S >= 0 ? y0 - S * k - 5 : y0 - S * k + 13),
    waveLetter(ctx, 'D', X(540), y0 - D * k - 5),
    waveLetter(ctx, 'Ar', X(835), y0 - Ar * k + 13),
  ];
  ctx.restore();
  note(ctx, bx, S < 0 ? ['systolic flow reversal', 'S reversed'] : S < 0.1 ? ['minimal systolic flow', 'minimal S'] : [`S/D ${v.sd.toFixed(1)}${v.sd < 1 ? ' · systolic blunting' : ' · systolic dominance'}`, `S/D ${v.sd.toFixed(1)}`], 'auto', letters);
  return bx;
}

function meterItems(v) {
  return [
    { k: 'Vegetation length', v: v.veg, u: 'mm', lo: 0, hi: 25, cuts: [[CUT, '10']], bad: v.veg >= CUT },
    { k: 'Vena contracta', v: v.vc, u: 'cm', d: 1, lo: 0, hi: 1.0, cuts: [[0.3, '0.3'], [0.7, '0.7']], bad: v.vc >= 0.7 },
    { k: 'Pulmonary vein S', v: v.pvS, u: 'm/s', d: 2, lo: -0.5, hi: 0.8, cuts: [[0, '0']], bad: v.pvS < 0 },
  ];
}

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = modelAt(st[KEY]);
  const frame = st[FRAME] || 'cine';
  const still = frame === 'dia' ? T_DIA : T_SYS;
  const tt = beat.at(frame === 'cine', still);
  // the strips' sweep, or a fixed line at the frame shown
  const mark = (bx) => cursor(ctx, bx, cine.live ? beat.sweep : still / (2 * RR));
  if (W < 700) {
    const [a, b] = cols({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.25, 1], 8);
    const [a1, a2] = rows(a, [1.15, 1], 8);
    plax(ctx, a1, v, tt);
    a3c(ctx, a2, v, tt);
    const [b1, b2] = rows(b, [1, 1], 8);
    for (const bx of [mrCW(ctx, b1, v), pvPW(ctx, b2, v)]) mark(bx);
    return;
  }
  const colL = { x: 16, y: 14, w: W * 0.47 - 16, h: H - 26 };
  const colR = { x: W * 0.485, y: 14, w: W * 0.515 - 16, h: H - 26 };
  const [a1, a2] = rows(colL, [1.12, 1], 10);
  plax(ctx, a1, v, tt);
  a3c(ctx, a2, v, tt);
  const [r1, r2, r3] = rows(colR, [1, 1, 0.62], 10);
  for (const bx of [mrCW(ctx, r1, v), pvPW(ctx, r2, v)]) mark(bx);
  meters(sh, t, { x: r3.x, y: r3.y + 4, w: r3.w, h: r3.h - 4 }, meterItems(v), { row: 30 });
}

// ---------------------------------------------------------------- the text
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const MOB = (v) => (v.veg <= 0 ? 'none' : v.prolapse ? 'prolapsing' : 'oscillating');

/** The live sentences: the state in bold, then the vegetation, its motion, its size against 10 mm, and the regurgitation. */
function liveOf(v, cite) {
  const D = cite('delgado2023'), S = cite('saric2016'), Z = cite('zoghbi2017'), H = cite('habib2015');
  const lead = `<b>${LEAD[v.grade]}.</b>`;
  if (v.veg <= 0) {
    return `${lead} No mass is attached to the mitral leaflets, and the leaflets are intact. A negative TTE does not exclude endocarditis: TOE is recommended when TTE is negative or nondiagnostic and the clinical suspicion of IE remains${D}.`;
  }
  const s0 = ` A ${v.veg}-mm mass is attached to the atrial side of the anterior mitral leaflet, near its line of closure, with the gray scale of myocardium${S}.`;
  const s1 = v.prolapse
    ? ` It is pedunculated and prolapses across the coaptation plane, into the LA in systole and into the LV in diastole: a highly mobile vegetation${S}.`
    : ` It oscillates with a motion of its own, independent of the leaflet${S}.`;
  const s2 = v.veg >= CUT
    ? ` Its maximal length is 10 mm or more: with another indication for surgery, urgent surgery is recommended (ESC class I), and without severe valve dysfunction or clinical embolism it may be considered at low surgical risk (class IIb)${D}.`
    : ` Its maximal length is below 10 mm, the length in the ESC recommendations for urgent surgery to prevent embolism${D}.`;
  let s3 = '';
  if (v.vc > 0) {
    s3 = ` The anterior leaflet is perforated: color flow crosses the body of the leaflet${H} in an eccentric jet. Its vena contracta is ${fmt(v.vc, 1)} cm, ${v.mr} MR by the cut-offs of chronic MR (<0.3 cm mild, ≥0.7 cm severe)${Z}.`;
    if (v.mr === 'severe') s3 += ` Systolic flow reverses in the pulmonary veins${Z}. Severe acute regurgitation that causes symptoms of heart failure is an indication for urgent surgery (ESC class I)${D}.`;
  }
  return `${lead}${s0}${s1}${s2}${s3}`;
}

export default {
  key: 'endocarditis',
  part: 'valves',
  title: 'Infective endocarditis',
  nav: 'IE',
  dwell: 24,
  defaults: { ieS: 0.45, ieFrame: 'cine' },
  format: {
    ieS: (x) => {
      const v = modelAt(x);
      return v.grade === 'none' ? 'no vegetation' : v.vc > 0 ? `perforation, ${v.mr} MR` : `vegetation ${v.veg} mm`;
    },
  },
  watch: ['ieS', 'ieFrame', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state }) {
    st = state;
    BANDS = bands((x) => gradeOf(x));
    paintBands(document.getElementById('ie-grades'), BANDS, LEV, BAND_SHORT);
  },
  // the heart model loads at idle, before the chapter opens (main.js warms every chapter)
  enter() { PLAX.start(); A3C.start(); },
  warm() { PLAX.start(); A3C.start(); },
  pulse: () => beat.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS);
    if (beat.tick(dt, (s[FRAME] || 'cine') === 'cine') && sheet) sheet.dirty = true;
  },
  // the sequence: no vegetation to a large one, then the perforation and its regurgitation
  tourEnter(set) { set({ ieS: 0, ieFrame: 'cine' }); },
  tourTick(tt, set) { set({ ieS: Math.round(clamp((tt - 1) / 21, 0, 1) * 200) / 200 }); },
  // the time of the sequence at which tourTick shows this state (its inverse): the sequence continues from it
  tourAt(s) { return 1 + s.ieS * 21; },
  text(s, { cite }) {
    const v = modelAt(s[KEY]);
    return {
      readouts: [
        { k: 'Vegetation', v: v.veg > 0 ? fmt(v.veg) : 'none', u: v.veg > 0 ? 'mm' : '', text: v.veg <= 0, flag: v.veg >= CUT },
        { k: 'Mobility', v: MOB(v), text: true, flag: v.prolapse },
        { k: 'Vena contracta', v: v.vc > 0 ? fmt(v.vc, 1) : 'none', u: v.vc > 0 ? 'cm' : '', text: v.vc <= 0, flag: v.vc >= 0.7 },
        { k: 'Mitral regurgitation', v: v.mr, text: true, flag: v.mr === 'severe' },
      ],
      live: liveOf(v, cite),
    };
  },
};
