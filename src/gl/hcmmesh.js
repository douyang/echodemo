// Hypertrophic cardiomyopathy on the heart mesh (chapter 'hcm'): two disease targets that
// phenomesh.js builds through its DISEASE table (entries hcmSep and hcmSam). Lengths in cm.
//
// hcmSep: asymmetric septal hypertrophy. The LV myocardium (region 1) of the anterior septum
// grows thicker at the base and in the middle of the LV. At weight 1 its LV face moves 0.6 cm
// toward the LV axis, and its RV face 0.25 cm away from it. The RV face moves only where the RV
// cavity lies outside it, more than 0.25 cm from the pericardium; the anterior free wall
// thickens inward only. The posterior (inferolateral) wall does not move. A static shape,
// weighted by the chapter with echo.js setDisease.
//
// hcmSam: systolic anterior motion of the mitral valve. The distal anterior leaflet folds toward
// the anterior septum: past a fold line 35% of the way down from its hinge (by depth below the
// annulus, open), the shut leaflet turns 125° at weight 1 about the normal of the long-axis plane
// (apex and the two valves' centres), and the folded part grows 70% longer, as an elongated
// leaflet of obstructive HCM. The chordae next to it go with it; the posterior leaflet stays, so
// the leaflets part. A move within the beat: the chapter weights it with echo.js setMotion, 0 in
// diastole. The target holds the move from the shut shape, so a weight w moves each point a
// share w along the straight line to its folded place.
//
// Both targets leave the landmarks where they are (shift is zero), so the view planes do not move.

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// the anterior septum: the direction from the LV axis to the aortic valve, turned this far (deg)
// toward the middle of the septum, and the arc it covers in full and as it fades (deg)
const SEP_TURN = 15, SEP_FULL = 50, SEP_FADE = 50;
// the levels (u: 0 at the epicardial apex, 1 at the mitral valve) that thicken: from the middle
// of the LV, in full to the level of the mitral leaflets' tips, and less up to the aortic valve,
// so the outflow tract stays open in diastole
const LEV_UP = [0.3, 0.55], LEV_DOWN = [0.84, 1.04];
const SEP_IN = 0.6, SEP_OUT = 0.25;
// the arc (deg) where the RV cavity lies outside the septum, so its RV face can move out
const RV_ARC = [95, 240], RV_SOFT = 15;
// the anterior leaflet: within this angle (deg) of the direction to the aortic valve, fading over
// the next; the fold, as a share of the leaflet's depth below the annulus (open), and its angle
const AML_FULL = 60, AML_FADE = 50, FOLD_AT = 0.35, FOLD_SOFT = 0.15, FOLD_DEG = 125;
// the folded part longer by this share: the elongated anterior leaflet of obstructive HCM
const ELONG = 0.7;

/**
 * Build target key of kind ('septum' or 'sam') on the meshes. ctx: phenomesh.js
 * preparePhenotypes; H: helpers of phenomesh.js { addTarget, grid, nearest }.
 */
export async function buildHcm(ctx, key, kind, H) {
  const { meshes, F } = ctx;
  const V3 = (x, y, z) => F.Z.clone().set(x, y, z);
  const tick = slicer();
  // the LV axis frame: the radial direction at angle ph (deg) round the axis, 0 lateral, 90 anterior
  const radial = (ph) => {
    const a = (ph * Math.PI) / 180;
    return F.X.clone().multiplyScalar(Math.cos(a)).addScaledVector(F.Y, Math.sin(a)).normalize();
  };
  const phiOf = (x, y, z) => {
    const q = V3(x, y, z).sub(F.apex);
    q.addScaledVector(F.Z, -q.dot(F.Z));
    return (Math.atan2(q.dot(F.Y), q.dot(F.X)) * 180) / Math.PI;
  };
  const phAV = phiOf(F.av.x, F.av.y, F.av.z);
  if (kind === 'septum') await buildSeptum(ctx, key, H, tick, phAV + SEP_TURN);
  else {
    // the fold turns in the plane of the apex and the two valves' centres (the long-axis views)
    const K = F.av.clone().sub(F.apex).cross(F.mvC.clone().sub(F.apex)).normalize();
    await buildSam(ctx, key, H, tick, radial(phAV), K);
  }
  return { shift: () => V3(0, 0, 0) };
}

/** A pause for the page every 12 ms of work, as phenomesh.js slicer. */
function slicer(ms = 12) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}

async function buildSeptum(ctx, key, H, tick, phC) {
  const { meshes, F, REG, mpos, nMyo } = ctx;
  const peri = meshes.Pericardium.geometry.attributes.position.array;
  const GP = H.grid(peri, null, 0.6);
  const ed = new Float32Array(mpos.length);
  for (let i = 0; i < nMyo; i++) {
    if ((i & 255) === 0) await tick();
    if (REG[i] !== 1) continue;
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
    // the point against the LV axis, as phenomesh.js lvCoords measures it
    const qx = x - F.apex.x, qy = y - F.apex.y, qz = z - F.apex.z;
    const h = qx * F.Z.x + qy * F.Z.y + qz * F.Z.z, hc = Math.max(h, F.h0);
    const rx = qx - hc * F.Z.x, ry = qy - hc * F.Z.y, rz = qz - hc * F.Z.z, r = Math.hypot(rx, ry, rz) || 1;
    const u = h / F.L;
    const lev = smooth((u - LEV_UP[0]) / (LEV_UP[1] - LEV_UP[0])) * (1 - smooth((u - LEV_DOWN[0]) / (LEV_DOWN[1] - LEV_DOWN[0])));
    if (lev <= 0) continue;
    const ph = (Math.atan2(rx * F.Y.x + ry * F.Y.y + rz * F.Y.z, rx * F.X.x + ry * F.X.y + rz * F.X.z) * 180) / Math.PI;
    let d = Math.abs(ph - phC) % 360;
    if (d > 180) d = 360 - d;
    const ang = 1 - smooth((d - SEP_FULL) / SEP_FADE);
    if (ang <= 0) continue;
    // the LV face lies at the cavity's radius, the outer face 0.6 cm or more beyond it; tissue
    // well inside the radius (the curtain between the aortic and mitral valves) stays
    const rr = r - F.Rref(u), outer = smooth((rr - 0.3) / 0.3), face = smooth((rr + 0.6) / 0.3);
    let k = -SEP_IN * (1 - outer) * face;
    const p360 = (ph + 360) % 360, rv = smooth((p360 - RV_ARC[0]) / RV_SOFT) * (1 - smooth((p360 - RV_ARC[1] + RV_SOFT) / RV_SOFT));
    if (outer > 0 && rv > 0) {
      const nb = H.nearest(GP, x, y, z, 1, 1.0), dp = nb.length ? Math.sqrt(nb[0][1]) : 1.0;
      k += SEP_OUT * outer * rv * smooth((dp - 0.25) / 0.2);
    }
    k *= lev * ang;
    ed[3 * i] = (rx / r) * k; ed[3 * i + 1] = (ry / r) * k; ed[3 * i + 2] = (rz / r) * k;
  }
  H.addTarget(meshes.Myocardium, `dx_${key}`, ed);
}

async function buildSam(ctx, key, H, tick, D, K) {
  const { meshes, F } = ctx;
  const mesh = meshes.MitralValve, base = mesh.geometry.attributes.position.array, n = base.length / 3;
  const N = F.mvN, C = F.mvC;
  // the direction to the aortic valve in the annulus plane
  const A0 = F.av.clone().sub(C);
  A0.addScaledVector(N, -A0.dot(N)).normalize();
  const B0 = N.clone().cross(A0);
  const leaf = (i) => F.mvPart[i] !== F.mvRing;
  let Hd = 1e-6;
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!leaf(i)) continue;
    const d = -((base[3 * i] - C.x) * N.x + (base[3 * i + 1] - C.y) * N.y + (base[3 * i + 2] - C.z) * N.z);
    depth[i] = Math.max(0, d);
    Hd = Math.max(Hd, depth[i]);
  }
  // the shut leaflets: the base shape and the leaflets target (phenomesh.js header)
  const far = mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary.leaflets].array;
  // the fold turns about K, square to the long-axis plane, toward the septum (D)
  const turn = (v, th) => {
    const c = Math.cos(th), s = Math.sin(th), kv = K.dot(v);
    return v.clone().multiplyScalar(c).add(K.clone().cross(v).multiplyScalar(s)).addScaledVector(K, kv * (1 - c));
  };
  const probe = N.clone().negate();
  const sign = turn(probe, 0.5).dot(D) > probe.dot(D) ? 1 : -1;
  const t = new Float32Array(base.length);
  const S = F.Z.clone(), q = F.Z.clone(), h = F.Z.clone();
  for (let i = 0; i < n; i++) {
    if (!leaf(i)) continue;
    const x = base[3 * i] - C.x, y = base[3 * i + 1] - C.y, z = base[3 * i + 2] - C.z;
    // the open leaflets: the anterior one hangs on the side of the aortic valve
    const ca = x * A0.x + y * A0.y + z * A0.z, sa = x * B0.x + y * B0.y + z * B0.z, a = Math.atan2(sa, ca);
    const aw = 1 - smooth((Math.abs((a * 180) / Math.PI) - AML_FULL) / AML_FADE);
    const f = depth[i] / Hd;
    if (aw <= 0 || f <= FOLD_AT) continue;
    // the shut point, its hinge on the annulus in the same direction, and the fold point between
    S.set(base[3 * i] + far[3 * i], base[3 * i + 1] + far[3 * i + 1], base[3 * i + 2] + far[3 * i + 2]);
    h.copy(C).addScaledVector(A0, F.mvR * Math.cos(a)).addScaledVector(B0, F.mvR * Math.sin(a));
    q.copy(h).addScaledVector(S.clone().sub(h), FOLD_AT / f);
    const b = aw * smooth((f - FOLD_AT) / FOLD_SOFT), th = sign * ((FOLD_DEG * Math.PI) / 180) * b;
    const P = q.clone().add(turn(S.clone().sub(q), th).multiplyScalar(1 + ELONG * b));
    t[3 * i] = P.x - S.x; t[3 * i + 1] = P.y - S.y; t[3 * i + 2] = P.z - S.z;
  }
  H.addTarget(mesh, `dx_${key}`, t);
  // the chordae next to the leaflets take 85% of their move, fading over 0.6 cm, so the chords
  // stretch from the moved leaflet toward the papillary muscles and stay short of the septum
  const ch = meshes.MitralChordae;
  if (!ch) return;
  const lv = [];
  for (let i = 0; i < n; i++) if (leaf(i)) lv.push(i);
  const pts = new Float32Array(lv.length * 3);
  lv.forEach((i, k) => { pts[3 * k] = base[3 * i]; pts[3 * k + 1] = base[3 * i + 1]; pts[3 * k + 2] = base[3 * i + 2]; });
  const G = H.grid(pts, null, 0.6);
  const cp = ch.geometry.attributes.position.array, cn = cp.length / 3;
  const cd = new Float32Array(cp.length);
  for (let j = 0; j < cn; j++) {
    if ((j & 127) === 0) await tick();
    const q = H.nearest(G, cp[3 * j], cp[3 * j + 1], cp[3 * j + 2], 1, 1.2);
    if (!q.length) continue;
    const i = lv[q[0][0]], fade = 0.85 * (1 - smooth(Math.sqrt(q[0][1]) / 0.6));
    for (let k = 0; k < 3; k++) cd[3 * j + k] = fade * t[3 * i + k];
  }
  H.addTarget(ch, `dx_${key}`, cd);
}
