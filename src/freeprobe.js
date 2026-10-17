// The free probe of the transthoracic views: a view's plane moved as a probe on the chest is
// moved (Views, ch/windows.js; Planes, archived, ch/planes.js). A plane is { O, d, r, n } in world
// cm (echo.js viewGeometry): O the transducer, d the beam, r screen-right (the side of the index
// marker), n = r x d.
//
// The moves, in the terms of the ASE guideline (Mitchell 2019, Section II.B), applied in this order:
//  - slide: the probe moves over the skin, toward the starting marker (r) and across the starting
//    plane (n);
//  - rotate: the probe turns about its beam; + is clockwise as the examiner sees it, looking along
//    the beam into the chest;
//  - tilt: the beam turns across the plane, toward n for +; the probe stays where it is;
//  - rock: the beam turns within the plane, toward the marker (screen-right) for +.
// With the skin of the torso (torso.js; Views), the probe slides over the skin from where its beam
// enters it, turns with the chest's curve as it goes, and tilts and rocks on its face at the skin,
// so it can slide from one acoustic window to another. Without it (Planes), the probe slides in
// the plane square to the starting beam and turns about its transducer.
// The planes' vectors are three.js vectors, so this module needs no import of its own.

const rad = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The angle between two unit vectors, degrees (0 to 180). */
export const angleOf = (a, b) => deg(Math.acos(clamp1(a.dot(b))));

/**
 * Plane b moved by the controls c: rot, tilt, rock (degrees), slide, across (cm). With skin
 * (torso.js Skin) the probe slides over the skin (overSkin) and turns on its face there; the
 * transducer lies on the beam as far from the skin as plane b's lies, or depth(E, d, s) cm, given
 * the point of contact E, the beam d and that distance s. The pose also returns E.
 */
export function freePose(b, c = {}, skin = null, depth = null) {
  const { rot = 0, tilt = 0, rock = 0, slide = 0, across = 0 } = c;
  const m = skin ? overSkin(b, slide, across, skin) : { d: b.d.clone(), r: b.r.clone(), n: b.n.clone() };
  const { d, r, n } = m;
  r.applyAxisAngle(d, rad(rot));
  n.applyAxisAngle(d, rad(rot));
  d.applyAxisAngle(r, rad(tilt));
  n.applyAxisAngle(r, rad(tilt));
  d.applyAxisAngle(n, rad(-rock));
  r.applyAxisAngle(n, rad(-rock));
  d.normalize();
  if (!skin) return { O: b.O.clone().addScaledVector(b.r, slide).addScaledVector(b.n, across), d, r: r.normalize(), n: n.normalize() };
  return { O: m.E.clone().addScaledVector(d, depth ? depth(m.E, d, m.s) : m.s), d, r: r.normalize(), n: n.normalize(), E: m.E };
}

/**
 * Where plane b's beam line enters the skin, E: the transducer lies s cm on along the beam from
 * there (negative: in front of the skin).
 */
export function entryOf(b, skin) {
  const out = (t) => { const P = b.O.clone().addScaledVector(b.d, -t); return skin.f(P.x, P.y, P.z) > 0; };
  // back along the beam from a transducer inside the skin, or on from one outside, in steps of
  // 0.5 cm to the skin; then halve the last step
  let a = 0, z = 0;
  if (out(0)) while (out(z) && z > -30) { a = z; z -= 0.5; }
  else while (!out(z) && z < 40) { a = z; z += 0.5; }
  for (let i = 0; i < 30; i++) { const m = (a + z) / 2; if (out(m) === out(a)) a = m; else z = m; }
  const s = (a + z) / 2;
  return { E: b.O.clone().addScaledVector(b.d, -s), s };
}

const STEP = 0.2;   // cm: the slide over the skin goes in steps this long
/**
 * Plane b's probe slid over the skin, slide cm toward its marker and across cm across its plane,
 * on the straightest path the skin allows (a geodesic), from where its beam enters the skin. At
 * each step the probe turns as the skin turns under it (the normal of one step onto the next), so
 * it keeps its angle to the skin: a probe square to the chest stays square to it. Returns the
 * point of contact E, the turned beam, marker and plane normal, and the transducer's distance s.
 */
export function overSkin(b, slide, across, skin) {
  let { E, s } = entryOf(b, skin);
  const N = skin.normal(E, b.O.clone()), N1 = N.clone(), ax = N.clone();
  const d = b.d.clone(), r = b.r.clone(), n = b.n.clone();
  // the starting marker and plane normal, laid on the skin
  const e1 = b.r.clone().addScaledVector(N, -b.r.dot(N)).normalize();
  const e2 = N.clone().cross(e1);
  if (e2.dot(b.n) < 0) e2.negate();
  const t = e1.multiplyScalar(slide).addScaledVector(e2, across), L = t.length();
  if (L > 1e-9) {
    t.divideScalar(L);
    const k = Math.ceil(L / STEP), h = L / k;
    for (let i = 0; i < k; i++) {
      const P = skin.onSkin(E.clone().addScaledVector(t, h));
      skin.normal(P, N1);
      ax.crossVectors(N, N1);
      const q = ax.length();
      if (q > 1e-12) {
        const a = Math.atan2(q, N.dot(N1));
        ax.divideScalar(q);
        for (const v of [t, d, r, n]) v.applyAxisAngle(ax, a);
      }
      t.addScaledVector(N1, -t.dot(N1)).normalize();
      E = P;
      N.copy(N1);
    }
  }
  return { E, d, r, n, s, N };
}

// a view's transducer within this many cm along its beam of the probe's: farther, the probe lies
// on the far side of the body, or deep past the heart
export const ALONG = 6;
/**
 * How near the probe, touching the skin at E with the beam d, comes to each view (views: [{ g, s }],
 * each view's plane and its transducer's distance from the skin). A view weighs 1 with the beam
 * within 5 degrees of its own and its transducer within 0.5 cm of the beam line, 0 past 15
 * degrees or 1.5 cm, smoothly between; and 0 past ALONG + 3 cm along its beam. Returns the
 * views' weights w and the starting view's, rest (what the nearest leaves), which sum to 1. What
 * the probe takes from the views it nears (arrivalDepth; the body figure's probe, ch/windows.js)
 * is then its own on a view, and the settle on that view does not jump.
 */
export function arrival(E, d, views) {
  let top = 0;
  const w = views.map(({ g, s }) => {
    const q = g.O.clone().sub(E), off = q.addScaledVector(d, -q.dot(d)).length();
    const x = Math.max(angleOf(d, g.d) / 5, off / 0.5);
    if (x >= 3) return 0;
    const along = Math.abs(E.clone().addScaledVector(d, s).sub(g.O).dot(g.d));
    const v = (1 - smooth((x - 1) / 2)) * (1 - smooth((along - ALONG) / 3));
    top = Math.max(top, v);
    return v;
  });
  const sum = w.reduce((a, v) => a + v, 1 - top);
  return { w: w.map((v) => v / sum), rest: (1 - top) / sum };
}

/**
 * The transducer's distance along the beam from the point of contact as the probe nears a view
 * (arrival): the views' transducers lie at their own depths, 3 cm in front of the skin to 7 cm
 * under it, so a probe brought onto a view's beam takes that view's depth, and the image is the
 * view. s0: the starting view's. a: arrival's result, when already found.
 */
export function arrivalDepth(E, d, s0, views, a = arrival(E, d, views)) {
  return views.reduce((t, v, i) => t + a.w[i] * v.s, a.rest * s0);
}

/**
 * The controls that move plane b onto plane g: the inverse of freePose without a skin. The turn of
 * g against b as rotate, tilt and rock (the order freePose applies them); and the slides that bring
 * the probe to where g's beam line meets b's skin (the plane through b.O square to b.d). The planes
 * and the beam lines then coincide. The probe cannot move along its beam, so it lies `along` cm
 * from g.O on that line (positive: deeper than g.O).
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
 * the angle between the beams, the angle between the markers (screen-right), how far g's probe
 * lies from h's beam line (cm), and how far along that line from h's (cm, positive: deeper). A
 * probe on that line images h's plane with h's aim.
 */
export function poseGap(g, h) {
  const q = g.O.clone().sub(h.O), along = q.dot(h.d);
  return { beam: angleOf(g.d, h.d), marker: angleOf(g.r, h.r), cm: q.addScaledVector(h.d, -along).length(), along };
}

/** Labels for a plane that is no standard view: any of these structures that lies on it. */
export const GENERIC = [['lv', 'LV'], ['rv', 'RV'], ['la', 'LA'], ['ra', 'RA'], ['ivs', 'IVS'], ['ias', 'IAS'], ['mv', 'MV'], ['tv', 'TV'], ['av', 'AV'], ['pv', 'PV'],
  ['ao', 'Ao'], ['mpa', 'PA'], ['apex', 'apex'], ['desc', 'desc Ao'], ['arch', 'arch'], ['ivcl', 'IVC'], ['svc', 'SVC']];
