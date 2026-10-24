// The TEE planes of transcatheter edge-to-edge repair (chapter mteer), on the heart shown.
// World cm, the model's frame (teeviews.js). No DOM here: ch/mteer.js draws.
//
// Each plane comes from one of the standard probe frames of teeviews.js (framesOf), turned so
// its beam meets the structure the step looks at: the frame keeps its probe position and its
// orientation, so the multiplane angle on the icon is the angle that frame would show. An
// X-plane is two planes from one probe position: the primary plane, and the secondary plane
// square to it through a cursor line in the primary image (the beam line through the device),
// which shows at the primary angle + 90 degrees.
//
// septal(): the transseptal puncture. Primary: the bicaval view through the puncture site, the
// SVC on the right of the display, which places the site high or low on the septum. Secondary:
// the short-axis plane of the same beam through the aortic valve, which places the site to the
// front or to the back (a biplane's second plane turns to any angle).
// height(): the four-chamber plane through the puncture site and the middle of the mitral
// annulus, on which the site's height above the annular plane is measured.
// mitral(): the mitral X-plane. Primary: the commissural view through the beam to the clip's
// site, P1's side (lateral) on the right of the display. Secondary: the long-axis view through
// the cursor on the clip, the aortic valve on the right.
// tgBasal(): the transgastric short axis moved up the LV axis to the leaflets' tips.
import * as THREE from '../vendor/three.bundle.min.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const sq = (v, a) => v.clone().addScaledVector(a, -v.dot(a));

/** Frame f turned by the least rotation that takes its beam F onto target - O. */
export function aimed(f, target) {
  const d = target.clone().sub(f.O).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(f.F.clone().normalize(), d);
  return { O: f.O.clone(), F: d, t: f.t.clone().applyQuaternion(q).normalize(), u: f.u.clone().applyQuaternion(q).normalize(), T: f.T };
}

/** The multiplane angle (deg) at which frame f shows screen-right r: 0 to 360. */
export function angleOf(f, r) {
  return ((Math.atan2(r.dot(f.u), r.dot(f.t)) * 180) / Math.PI + 360) % 360;
}

/**
 * A plane of frame f with beam d (unit, from f.O) and screen-right want (made square to d):
 * { g: { O, d, r, n }, ang }. The screen-right turns half round when the angle would lie past
 * 180 degrees, as a probe's plane does (180 shows the mirror image of 0).
 */
function plane(f, d, want) {
  let r = sq(want, d).normalize();
  let ang = angleOf({ ...f, F: d }, r);
  if (ang > 180) { r = r.negate(); ang -= 180; }
  const n = new THREE.Vector3().crossVectors(r, d).normalize();
  return { g: { O: f.O.clone(), d: d.clone(), r, n }, ang };
}

/** The point of plane g (world) at [u, v] cm. */
export const fromPlane = (g, u, v) => g.O.clone().addScaledVector(g.r, u).addScaledVector(g.d, v);
/** A world point on plane g: [u, v] cm. */
export const toPlane = (g, p) => { const q = p.clone().sub(g.O); return [q.dot(g.r), q.dot(g.d)]; };

/**
 * An X-plane from frame f: the primary plane with beam on aim and screen-right toward want1, and
 * the secondary plane square to it through the cursor (the beam line through the world point
 * cursor, moved into the primary plane), screen-right toward want2.
 */
export function xplane(f, aim, want1, cursor, want2) {
  const fa = aimed(f, aim);
  const P1 = plane(fa, fa.F, want1);
  // the cursor: the beam line in the primary plane through the cursor point's foot on it
  const c = cursor ? cursor.clone().addScaledVector(P1.g.n, -cursor.clone().sub(fa.O).dot(P1.g.n)) : aim;
  const dc = c.clone().sub(fa.O).normalize();
  const fc = { ...fa, F: dc };
  // the X-plane shows the secondary plane at the primary angle + 90 degrees; past 180 the
  // machine shows the angle 180 less, the image mirrored
  let ang2 = (P1.ang + 90) % 360;
  let r2 = P1.g.n.clone();
  if (r2.dot(want2) < 0) r2.negate();
  if (ang2 > 180) ang2 -= 180;
  const n2 = new THREE.Vector3().crossVectors(r2, dc).normalize();
  const g2 = { O: fa.O.clone(), d: dc, r: r2, n: n2 };
  return { primary: P1, secondary: { g: g2, ang: ang2 }, frame: fc, cursor: toPlane(P1.g, c) };
}

/**
 * The transseptal X-plane: frames (teeviews.js framesOf), punct (gl/clipmesh.js punctureOf),
 * S the puncture site on the heart shown (world, THREE.Vector3), and the venae cavae.
 */
export function septal(frames, S, vessels, av = null) {
  const sup = V3(vessels.svc).sub(V3(vessels.ivc)).normalize();
  const fa = aimed(frames.mebicaval, S);
  const P1 = plane(fa, fa.F, sup);
  // the short axis: the plane of the same beam that holds the aortic valve, the anterior mark
  // (the guideline's ME short-axis view at 30-60 degrees, Zamorano 2011)
  const P2 = plane(fa, fa.F, av ? av.clone().sub(fa.O) : new THREE.Vector3(0, 0, 1));
  return { primary: P1, secondary: P2, frame: fa, cursor: toPlane(P1.g, S) };
}

/** The four-chamber plane through the puncture site S and the annulus's middle C (THREE.Vector3): the RA side on the left. */
export function height(frames, S, C) {
  const mid = S.clone().lerp(C, 0.5);
  const fa = aimed(frames.me4c, mid);
  return plane(fa, fa.F, C.clone().sub(S));
}

/**
 * The mitral X-plane: aim, the clip's site (Q, THREE.Vector3), cursor the point of the device
 * the long axis cuts through (or null: through Q); B0 medial and A0 toward the aortic valve.
 */
export function mitral(frames, aim, cursor, A0, B0) {
  return xplane(frames.memc, aim, B0.clone().negate(), cursor, A0);
}

/**
 * The transgastric short axis (frame tgsax at its angle) moved along its normal to pass through
 * point P (THREE.Vector3). With N (the mitral annulus's normal), the plane also turns, about P,
 * by the least turn that lays it parallel to the annulus, as the probe's flexion does: it cuts
 * the leaflets at one depth all round, the double orifice after a clip, not the LA on one side
 * and the LV on the other.
 */
export function tgBasal(frames, planeAt, ang, P, N = null) {
  const g = planeAt(frames.tgsax, ang);
  const k = P.clone().sub(g.O).dot(g.n);
  const O = g.O.clone().addScaledVector(g.n, k);
  if (!N) return { g: { O, d: g.d.clone(), r: g.r.clone(), n: g.n.clone() }, ang, shift: k };
  const to = N.clone().normalize();
  if (to.dot(g.n) < 0) to.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(g.n.clone().normalize(), to);
  const O2 = O.clone().sub(P).applyQuaternion(q).add(P);
  return { g: { O: O2, d: g.d.clone().applyQuaternion(q), r: g.r.clone().applyQuaternion(q), n: to }, ang, shift: k };
}
