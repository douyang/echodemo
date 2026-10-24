// The TEE planes of transcatheter edge-to-edge repair of the tricuspid valve (chapter tteer), on
// the heart shown. World cm, the model's frame (teeviews.js). No DOM here: ch/tteer.js draws.
//
// Each plane comes from one of the standard probe frames of teeviews.js (framesOf), turned so its
// beam meets the structure the step looks at (teerviews.js aimed): the frame keeps its probe
// position and its orientation, so the multiplane angle on the icon is the angle that frame
// would show.
//
// fourC(): the mid-esophageal four-chamber plane through the tricuspid valve, the patient's right
// on the left of the display (Hahn 2013).
// inflow(): the mid-esophageal RV inflow-outflow plane through the valve.
// bicaval(): the bicaval plane through the junction of the IVC and the RA, the SVC on the right of
// the display: the guide as it enters the RA.
// grasp(): the X-plane of the grasp from the mid-esophageal probe: the primary plane through the
// beam to the clip's site and along the anteroseptal line of coaptation, where the arms show
// edge-on once they are square to it; the secondary plane through the cursor on the clip, across
// the line, where both arms and both leaflets show.
// tgShort(): the transgastric short axis of the valve: the plane parallel to the annulus through
// a point just on the RV side of the leaflets, from a probe in that plane below the heart, as the
// transgastric probe sees the valve en face when it is withdrawn and anteflexed toward the RV.
import * as THREE from '../vendor/three.bundle.min.js';
import { aimed, angleOf, xplane, toPlane } from './teerviews.js';

const sq = (v, a) => v.clone().addScaledVector(a, -v.dot(a));

/**
 * A plane of frame f with beam d (unit, from f.O) and screen-right want (made square to d): { g:
 * { O, d, r, n }, ang }, as teerviews.js makes its planes (past 180 degrees the screen-right turns
 * half round, as a probe's plane does).
 */
function plane(f, d, want) {
  let r = sq(want, d).normalize();
  let ang = angleOf({ ...f, F: d }, r);
  if (ang > 180) { r = r.negate(); ang -= 180; }
  const n = new THREE.Vector3().crossVectors(r, d).normalize();
  return { g: { O: f.O.clone(), d: d.clone(), r, n }, ang };
}

/** The mid-esophageal four-chamber plane aimed at target (THREE.Vector3): screen-right the frame's own (the patient's left). */
export function fourC(frames, target) {
  const fa = aimed(frames.me4c, target);
  return plane(fa, fa.F, fa.t);
}

/** The mid-esophageal RV inflow-outflow plane aimed at target, at the frame's own angle. */
export function inflow(frames, target, planeAt) {
  const f = frames.merv, at = planeAt(f, 60);
  const fa = aimed(f, target);
  // keep the frame's screen-right at its view's angle, turned with the beam
  const q = new THREE.Quaternion().setFromUnitVectors(f.F.clone().normalize(), fa.F);
  return plane(fa, fa.F, at.r.clone().applyQuaternion(q));
}

/** The bicaval plane through point target, the SVC on the right of the display; vessels: { ivc, svc } (arrays). */
export function bicaval(frames, target, vessels) {
  const sup = new THREE.Vector3(...vessels.svc).sub(new THREE.Vector3(...vessels.ivc)).normalize();
  const fa = aimed(frames.mebicaval, target);
  return plane(fa, fa.F, sup);
}

/**
 * The grasp's X-plane from the mid-esophageal four-chamber probe: aim, the clip's site (or the
 * clip); cursor, the point of the device the secondary plane cuts through; Bc, along the line of
 * coaptation toward the anteroseptal commissure; Ac, across it toward the anterior leaflet.
 */
export function grasp(frames, aim, cursor, Bc, Ac) {
  return xplane(frames.me4c, aim, Bc.clone().negate(), cursor, Ac);
}

/**
 * The transgastric short axis of the valve: the plane through P square to the annulus's normal N,
 * seen from the transgastric probe's position moved into that plane. Screen-right is the frame's
 * own (the patient's left at 0 degrees), so the near field holds the inferior side of the valve.
 */
export function tgShort(frames, P, N, ang = 10) {
  const f = frames.tgsax, n = N.clone().normalize();
  const O = f.O.clone().addScaledVector(n, -f.O.clone().sub(P).dot(n));
  const d = P.clone().sub(O).normalize();
  let r = new THREE.Vector3().crossVectors(d, n).normalize();
  if (r.dot(f.t) < 0) r.negate();
  const g = { O, d, r, n: new THREE.Vector3().crossVectors(r, d).normalize() };
  return { g, ang, depth: P.clone().sub(O).length() };
}

export { toPlane };
