// The free probe of the transthoracic views: a view's plane moved as a probe on the chest is
// moved (Views, ch/windows.js; Planes, archived, ch/planes.js). A plane is { O, d, r, n } in world
// cm (echo.js viewGeometry): O the transducer, d the beam, r screen-right (the side of the index
// marker), n = r x d.
//
// The moves, in the terms of the ASE guideline (Mitchell 2019, Section II.B), applied in this order:
//  - rotate: the probe turns about its beam; + is clockwise as the examiner sees it, looking along
//    the beam into the chest;
//  - tilt: the beam turns across the plane, toward n for +; the probe stays where it is;
//  - rock: the beam turns within the plane, toward the marker (screen-right) for +;
//  - slide: the probe moves over the skin, along the starting marker (r) and across the starting
//    plane (n), square to the starting beam.
// The planes' vectors are three.js vectors, so this module needs no import of its own.

const rad = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
/** The angle between two unit vectors, degrees (0 to 180). */
export const angleOf = (a, b) => deg(Math.acos(clamp1(a.dot(b))));

/** Plane b moved by the controls c: rot, tilt, rock (degrees), slide, across (cm). */
export function freePose(b, c = {}) {
  const { rot = 0, tilt = 0, rock = 0, slide = 0, across = 0 } = c;
  const d = b.d.clone(), r = b.r.clone().applyAxisAngle(d, rad(rot)), n = b.n.clone().applyAxisAngle(d, rad(rot));
  d.applyAxisAngle(r, rad(tilt));
  n.applyAxisAngle(r, rad(tilt));
  d.applyAxisAngle(n, rad(-rock));
  r.applyAxisAngle(n, rad(-rock));
  const O = b.O.clone().addScaledVector(b.r, slide).addScaledVector(b.n, across);
  return { O, d: d.normalize(), r: r.normalize(), n: n.normalize() };
}

/**
 * The controls that move plane b onto plane g: the inverse of freePose. The turn of g against b
 * as rotate, tilt and rock (the order freePose applies them); and the slides that bring the probe
 * to where g's beam line meets b's skin (the plane through b.O square to b.d). The planes and the
 * beam lines then coincide. The probe cannot move along its beam, so it lies `along` cm from g.O
 * on that line (positive: deeper than g.O).
 */
export function controlsFor(g, b) {
  const tilt = Math.asin(clamp1(-b.d.dot(g.n)));
  const rot = Math.atan2(b.r.dot(g.n), b.n.dot(g.n));
  const rock = -Math.atan2(b.d.dot(g.r), b.d.dot(g.d));
  const den = g.d.dot(b.d);
  const t = Math.abs(den) > 1e-6 ? -g.O.clone().sub(b.O).dot(b.d) / den : 0;
  const P = g.O.clone().addScaledVector(g.d, t).sub(b.O);
  return { rot: deg(rot), tilt: deg(tilt), rock: deg(rock), slide: P.dot(b.r), across: P.dot(b.n), along: t };
}

/**
 * How far plane g lies from plane h, as the transesophageal free probe measures it (ch/tee.js):
 * the angle between the beams, the angle between the markers (screen-right), and how far g's probe
 * lies from h's beam line (cm). A probe on that line images h's plane with h's aim.
 */
export function poseGap(g, h) {
  const q = g.O.clone().sub(h.O);
  return { beam: angleOf(g.d, h.d), marker: angleOf(g.r, h.r), cm: q.addScaledVector(h.d, -q.dot(h.d)).length() };
}

/** Labels for a plane that is no standard view: any of these structures that lies on it. */
export const GENERIC = [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA'], ['ivs', 'IVS'], ['ias', 'IAS'], ['mv', 'MV'], ['tv', 'TV'], ['av', 'AV'], ['pv', 'PV'],
  ['ao', 'Ao'], ['mpa', 'PA'], ['apex', 'apex'], ['desc', 'desc Ao'], ['arch', 'arch'], ['ivcl', 'IVC'], ['svc', 'SVC']];
