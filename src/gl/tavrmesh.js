// The transcatheter aortic valve of the TAVR chapter (ch/tavr.js), in the aortic annulus of the
// heart shown: a balloon-expandable valve (a short frame with an outer skirt, its leaflets inside
// the annulus) or a self-expanding valve (a tall frame that reaches the ascending aorta, its
// leaflets above the annulus). Before deployment: the valve crimped on its delivery catheter, the
// nose cone and the guidewire into the LV. During deployment the frame expands: the
// balloon-expandable frame along its whole length at once, the self-expanding frame from its
// inflow up as its capsule draws back. After it, the native leaflets lie pushed out between the
// frame and the sinus wall. Each frame the parts are built on the annulus of the heart's own
// aortic valve (prostheticmesh.js annulusOf), fitted to the root's wall, cut on the view's plane,
// and returned as B-mode items (bmode.js).
// Lengths in cm, in the heart model's world space. A height h counts along the root's axis from
// the hinge ring of the cusps, toward the aorta; an angle phi counts round the axis from ep toward
// eh (annulusOf). No three.js here: plain [x, y, z] arrays.
import { gridMesh, cutMesh, facing, echoes } from './prostheticmesh.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The two designs (cm), each the size its label gives for the model's annulus (24 mm by TEE).
 * label: the size on the label; frameH: the frame's height; base: the height of its inflow edge
 * against the annulus (negative: below it, in the LVOT); crimpR: the frame's radius crimped on
 * the catheter. be: a 26-mm balloon-expandable valve (SAPIEN 3 label: 26 mm for a TEE annulus of
 * 21-25 mm; frame 20 mm tall), a cylinder whose inflow lies 0.2 cm below the annulus (90% of the
 * frame above it, the 90/10 end of the 80/20 to 90/10 target), with an outer skirt over its lower
 * skirtH. se: a 29-mm self-expanding valve (Evolut label: 29 mm for an annulus of 23-26 mm), 4.6
 * cm tall (a review's figure, not the label's), its inflow 0.3 cm below the annulus (the 3-mm
 * target); profile: [height above the inflow, radius] of the frame as it expands free (wide at
 * the inflow, narrow at the waist, flared at the outflow), a drawing, not the maker's dimensions;
 * the root's wall narrows it where it meets the wall. leaf: the leaflets' attachment, lowest at
 * each leaflet's middle (base) and highest at the commissures (comm), the height at which they
 * meet shut (coapt) and of their free edges open (open), all above the inflow: inside the
 * annulus (be), above it (se).
 */
export const DESIGNS = {
  be: { label: 2.6, frameH: 2.0, base: -0.2, crimpR: 0.3, skirtH: 0.85, profile: [[0, 1.3], [2.0, 1.3]],
    leaf: { base: 0.35, comm: 1.8, coapt: 1.15, open: 1.7 } },
  se: { label: 2.9, frameH: 4.6, base: -0.3, crimpR: 0.33, skirtH: 1.2, profile: [[0, 1.45], [0.6, 1.38], [1.4, 1.2], [2.6, 1.14], [3.6, 1.45], [4.6, 1.75]],
    leaf: { base: 1.3, comm: 2.8, coapt: 2.0, open: 2.7 } },
};
/** The cm between the frame and the root's wall where the wall narrows it; the native leaflets' thickness. */
const GAP = 0.03, NATIVE_T = 0.17;
/** The commissures, native and of the valve (degrees from ep): the valve's posts line up with the native ones. */
const COMM0 = 90;

// ---------------------------------------------------------------- the root's wall
// The root's lumen: the least distance from the axis to the myocardium's vertices, in cells of
// HB cm of height and 360 / NA degrees, from H0 to H1 cm. An empty cell takes the nearest cell
// of its row that has one; a row with none puts no limit on the frame.
const HB = 0.1, H0 = -1.2, H1 = 4.9, NA = 36, RMAX = 2.6;
/**
 * The root's wall at this frame, from the myocardium as the echo view last morphed it: a function
 * (h, phi) -> the lumen's radius (cm), Infinity where the model has no wall.
 */
export function wallOf(ev, F) {
  const pos = ev.myo.pos, m = pos.length / 3, nh = Math.round((H1 - H0) / HB) + 1;
  const T = new Float32Array(nh * NA).fill(Infinity);
  const { C, n, ep, eh } = F;
  for (let i = 0; i < m; i++) {
    const x = pos[3 * i] - C[0], y = pos[3 * i + 1] - C[1], z = pos[3 * i + 2] - C[2];
    const h = x * n[0] + y * n[1] + z * n[2];
    if (h < H0 - HB / 2 || h > H1 + HB / 2) continue;
    const a = x * ep[0] + y * ep[1] + z * ep[2], b = x * eh[0] + y * eh[1] + z * eh[2], r = Math.hypot(a, b);
    if (r > RMAX) continue;
    const ih = Math.round((h - H0) / HB), ia = Math.floor(((Math.atan2(b, a) / (2 * Math.PI) + 1) % 1) * NA) % NA;
    const k = ih * NA + ia;
    if (r < T[k]) T[k] = r;
  }
  for (let ih = 0; ih < nh; ih++) {
    const row = T.subarray(ih * NA, ih * NA + NA), full = Float32Array.from(row);
    for (let ia = 0; ia < NA; ia++) {
      if (Number.isFinite(full[ia])) continue;
      for (let d = 1; d < NA / 2; d++) {
        const p = full[(ia + d) % NA], q = full[(ia - d + NA) % NA];
        if (Number.isFinite(p) || Number.isFinite(q)) { row[ia] = Math.min(p, q); break; }
      }
    }
  }
  return (h, phi) => {
    const u = clamp((h - H0) / HB, 0, nh - 1), i0 = Math.floor(u), i1 = Math.min(nh - 1, i0 + 1), fu = u - i0;
    const w = ((phi / (2 * Math.PI)) % 1 + 1) % 1 * NA - 0.5, j0 = (Math.floor(w) + NA) % NA, j1 = (j0 + 1) % NA, fw = w - Math.floor(w);
    const c = (i, j) => T[i * NA + j];
    const a0 = c(i0, j0), a1 = c(i0, j1), b0 = c(i1, j0), b1 = c(i1, j1);
    if (![a0, a1, b0, b1].every(Number.isFinite)) return Math.min(a0, a1, b0, b1);
    return (a0 * (1 - fw) + a1 * fw) * (1 - fu) + (b0 * (1 - fw) + b1 * fw) * fu;
  };
}

// ---------------------------------------------------------------- the frame
/** The frame's free radius at height z above its inflow (its profile). */
function freeR(D, z) {
  const P = D.profile;
  if (z <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (z <= P[i][0]) { const t = (z - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; }
  }
  return P[P.length - 1][1];
}

/**
 * The frame's outer radius at height z above its inflow and angle phi, once expanded: its free
 * radius, narrowed where the root's wall meets it (its inflow then holds the annulus).
 */
function deployedR(D, z, phi, wall) {
  const w = wall(D.base + z, phi);
  return Math.max(D.crimpR, Math.min(freeR(D, z), w - GAP));
}

/**
 * The frame's outer radius during deployment (u: 0 crimped, 1 expanded). The balloon-expandable
 * frame expands along its length at once; the self-expanding frame expands behind the edge of
 * its capsule, which draws back from the inflow to the outflow, over 0.6 cm.
 */
function frameR(D, z, phi, wall, u, kind) {
  const full = deployedR(D, z, phi, wall);
  if (u >= 1) return full;
  if (kind === 'be') return D.crimpR + (full - D.crimpR) * smooth(u);
  const front = u * (D.frameH + 0.6);
  return D.crimpR + (full - D.crimpR) * smooth((front - z) / 0.6);
}

// ---------------------------------------------------------------- the parts
/**
 * The valve and its delivery system at this frame, in world space: a list of parts { kind, mesh }
 * (meshes cut as lines), and { kind: 'wire', pts } for the guidewire's centre line. P: { kind
 * ('be' | 'se'), u (deployment, 0 crimped to 1 expanded), drop (cm above its final place, as it
 * crosses), system (the catheter and the wire in place), open (0 shut to 1 open: the cycle's
 * drive), orifice (the open leaflets' orifice, cm²), native (the native leaflets pushed out),
 * apex (world point: the LV apex, where the wire ends) }.
 */
export function tavrParts(F, wall, P) {
  const { C, n, eh, ep } = F, D = DESIGNS[P.kind], drop = P.drop || 0, u = P.u ?? 1;
  const at = (r, phi, h) => [
    C[0] + r * (Math.cos(phi) * ep[0] + Math.sin(phi) * eh[0]) + h * n[0],
    C[1] + r * (Math.cos(phi) * ep[1] + Math.sin(phi) * eh[1]) + h * n[1],
    C[2] + r * (Math.cos(phi) * ep[2] + Math.sin(phi) * eh[2]) + h * n[2],
  ];
  const h0 = D.base + drop;
  const parts = [];
  // the frame, and its radius as a table (the leaflets and the native leaflets lie against it)
  const NU = 96, NV = Math.max(12, Math.round(D.frameH / 0.12));
  const R = (z, phi) => frameR(D, z, phi, wall, u, P.kind);
  parts.push({ kind: 'frame', mesh: gridMesh(NU, NV, (a, b) => { const phi = 2 * Math.PI * a, z = b * D.frameH; return at(R(z, phi), phi, h0 + z); }, true) });
  // the outer skirt over the frame's lower part, once the frame holds the annulus
  if (u > 0.5) parts.push({ kind: 'skirt', mesh: gridMesh(NU, 6, (a, b) => { const phi = 2 * Math.PI * a, z = b * D.skirtH; return at(R(z, phi) + 0.025, phi, h0 + z); }, true) });
  // the valve's leaflets, inside the frame
  parts.push(...leaflets(D, R, at, h0, P, u));
  if (P.native) parts.push(...nativeLeaflets(D, R, wall, at, P));
  if (P.system) parts.push(...deliverySystem(D, at, h0, P, u));
  return parts;
}

/**
 * The valve's three leaflets, inside the frame, between its commissures: their attachment runs
 * from the commissures (comm) down to the middle of each leaflet (base). Shut, the free edges meet
 * along the three lines from the commissures to the centre; open, they ring an orifice of the
 * given area. Crimped, the leaflets fold inside the crimped frame (they open with it).
 */
function leaflets(D, R, at, h0, P, u) {
  const L = D.leaf, out = [], o = P.open ?? 0, t = 0.05;
  const k = smooth(u);
  for (let j = 0; j < 3; j++) {
    const p0 = (COMM0 + 120 * j) * DEG, p1 = p0 + 120 * DEG;
    out.push({ kind: 'leaflet', mesh: gridMesh(25, 9, (a, b) => {
      const phi = p0 + a * (p1 - p0), mid = Math.abs(2 * a - 1);
      // the attachment: on the frame's inner face, low at the leaflet's middle
      const zA = L.base + (L.comm - L.base) * Math.pow(mid, 1.6);
      const rA = R(zA, phi) - 0.06;
      // the free edge: shut, on the line from its commissure to the centre; open, round the orifice
      const ro = Math.min(rA - 0.05, Math.sqrt(P.orifice / Math.PI) + t / 2) * k + rA * 0.4 * (1 - k);
      const pc = a < 0.5 ? p0 : p1, rs = rA * mid;
      const zs = L.coapt + (L.comm - L.coapt) * mid ** 1.5, zo = L.open + (L.comm - L.open) * mid ** 2;
      const xs = rs * Math.cos(pc), ys = rs * Math.sin(pc), xo = ro * Math.cos(phi), yo = ro * Math.sin(phi);
      const xe = xs + o * (xo - xs), ye = ys + o * (yo - ys), ze = zs + o * (zo - zs);
      const xa = rA * Math.cos(phi), ya = rA * Math.sin(phi);
      // across the leaflet: open, it reaches the orifice's radius by half its length
      const g = o > 0 ? b + o * (1 - (1 - Math.min(1, b / 0.5)) ** 2 - b) : b;
      const sag = 0.08 * Math.sin(Math.PI * b) * Math.sin(Math.PI * a) * (1 - o);
      const x = xa + g * (xe - xa), y = ya + g * (ye - ya), z = zA + b * (ze - zA) - sag;
      const r = Math.hypot(x, y), ph = Math.atan2(y, x);
      return at(r, ph, h0 + z);
    }) });
  }
  return out;
}

/**
 * The native leaflets, calcified and pushed out by the frame: each hangs from its hinge on the
 * root's wall (low at its middle, at the annulus, high at the commissures) to its free edge, and
 * lies against the frame's outer face, or against the wall where the frame stands off it. As the
 * frame expands, they open with it from the stenotic cone they formed.
 */
function nativeLeaflets(D, R, wall, at, P) {
  const out = [], top = 1.65, edge = 1.2, cone = 0.45;
  for (let j = 0; j < 3; j++) {
    const p0 = (COMM0 + 120 * j) * DEG, p1 = p0 + 120 * DEG;
    out.push({ kind: 'native', mesh: gridMesh(25, 9, (a, b) => {
      const phi = p0 + a * (p1 - p0), mid = Math.abs(2 * a - 1);
      const hA = top * Math.pow(mid, 1.7), hE = edge + (top - edge) * mid ** 2;
      const h = hA + b * (hE - hA);
      // the hinge on the wall; the leaflet then runs in to the stenotic cone, or out to the frame
      const rWall = Math.min(wall(h, phi), 1.6) - NATIVE_T / 2;
      const rCone = rWall + (cone - rWall) * b * (1 - mid);
      const zf = h - D.base, rF = zf >= 0 && zf <= D.frameH ? R(zf, phi) + NATIVE_T / 2 + 0.02 : 0;
      const r = Math.min(rWall, Math.max(rCone, rF));
      return at(r, phi, h);
    }) });
  }
  return out;
}

/**
 * The delivery system: the catheter's shaft above the valve, the nose cone below it, and for the
 * self-expanding valve the capsule over the part of the frame not yet released; the guidewire from
 * the nose cone to the LV apex.
 */
function deliverySystem(D, at, h0, P, u) {
  const out = [];
  const tube = (r, lo, hi) => gridMesh(40, 4, (a, b) => at(r, 2 * Math.PI * a, lo + b * (hi - lo)), true);
  const topZ = h0 + D.frameH;
  if (P.kind === 'se') {
    // the capsule covers the frame above the edge that has drawn back
    const front = h0 + u * (D.frameH + 0.6);
    if (front < topZ) out.push({ kind: 'capsule', mesh: tube(D.crimpR + 0.05, front, topZ + 0.3) });
    out.push({ kind: 'shaft', mesh: tube(0.24, Math.max(front, topZ + 0.3), 10) });
  } else out.push({ kind: 'shaft', mesh: tube(0.22, topZ + 0.15, 10) });
  // the nose cone, from the crimped frame down to the wire, while the frame is crimped
  const nose = h0 - 1.0;
  if (u < 0.05) out.push({ kind: 'nose', mesh: gridMesh(40, 6, (a, b) => at(D.crimpR * (1 - b) + 0.08 * b, 2 * Math.PI * a, h0 - b * 1.0), true) });
  // the wire: down the axis from the nose cone, then curving to the LV apex
  if (P.apex) {
    const A = at(0, 0, nose), Ax = P.apex, pts = [];
    const B = at(0, 0, nose - 2.5);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, s = 1 - t;
      // a quadratic curve: from the nose cone, along the axis, to the apex
      pts.push([0, 1, 2].map((k) => s * s * A[k] + 2 * s * t * B[k] + t * t * Ax[k]));
    }
    out.push({ kind: 'wire', pts });
  }
  return out;
}

// ---------------------------------------------------------------- the image
/**
 * The echo of each part: its level (dB against myocardium), its width as a line (cm) and the
 * shadow it casts (dB). The metal frame is bright and shadows; the skirt and the catheter less;
 * the calcified native leaflets are bright and thick; the valve's leaflets thin.
 */
export const TONE = {
  frame: { e: 32, w: 0.11, shadow: 16 }, skirt: { e: 17, w: 0.05, shadow: 3 }, leaflet: { e: 13, w: 0.05, shadow: 2 },
  native: { e: 22, w: NATIVE_T, shadow: 10 }, shaft: { e: 19, w: 0.05, shadow: 6 }, capsule: { e: 24, w: 0.07, shadow: 12 },
  nose: { e: 18, w: 0.05, shadow: 4 }, wire: { e: 26, w: 0.04, shadow: 3 },
  // behind the frame's struts that face the beam: two echoes 0.18 cm apart
  reverb: { n: 2, step: 0.18, e: 14, fade: 6, w: 0.07 },
};
/** A line on the beam's slice: the guidewire shows within this many cm of the plane. */
const SLICE = 0.3;
/** The frame's struts on a cut: bright for BEAD cm, then a gap of GAP_B cm between the cells. */
const BEAD = 0.15, GAP_B = 0.07;

/** The lines L (plane cm) broken into beads: the struts that the plane crosses, with the cells between them. */
function beads(L) {
  const out = [];
  for (const P of L) {
    let run = [P[0]], left = BEAD, on = true;
    for (let i = 1; i < P.length; i++) {
      let a = P[i - 1];
      const b = P[i];
      let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (seg > 1e-9) {
        if (seg < left) { left -= seg; if (on) run.push(b); seg = 0; break; }
        const t = left / seg, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (on) { run.push(m); if (run.length > 1) out.push(run); } else run = [m];
        seg -= left;
        a = m;
        on = !on;
        left = on ? BEAD : GAP_B;
      }
    }
    if (on && run.length > 1) out.push(run);
  }
  return out;
}

/**
 * The B-mode items (bmode.js) of the valve on plane g ({ O, r, d, n }), in plane cm: each part's
 * cut, with its echo and shadow (TONE); the guidewire where it runs within the beam's slice.
 */
export function tavrItems(F, wall, P, g) {
  const items = [];
  const O = [g.O.x, g.O.y, g.O.z], N = [g.n.x, g.n.y, g.n.z], Rr = [g.r.x, g.r.y, g.r.z], Dd = [g.d.x, g.d.y, g.d.z];
  for (const part of tavrParts(F, wall, P)) {
    const T = TONE[part.kind];
    if (part.kind === 'wire') {
      let run = [];
      const flush = () => { if (run.length > 1) items.push({ lines: [run], e: T.e, w: T.w, shadow: T.shadow }); run = []; };
      for (const p of part.pts) {
        const q = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
        const off = q[0] * N[0] + q[1] * N[1] + q[2] * N[2];
        if (Math.abs(off) > SLICE) { flush(); continue; }
        run.push([q[0] * Rr[0] + q[1] * Rr[1] + q[2] * Rr[2], q[0] * Dd[0] + q[1] * Dd[1] + q[2] * Dd[2]]);
      }
      flush();
      continue;
    }
    const cut = cutMesh(part.mesh, g);
    if (!cut.length) continue;
    const L = cut.map((x) => x.pts);
    if (part.kind !== 'frame') { items.push({ lines: L, e: T.e, w: T.w, shadow: T.shadow }); continue; }
    // the metal frame: its struts, and the reverberation behind those that face the beam
    const S = beads(L);
    items.push({ lines: S, e: T.e, w: T.w, shadow: T.shadow });
    const R = TONE.reverb, back = facing(S);
    if (back.length) for (let k = 1; k <= R.n; k++) items.push({ lines: echoes(back, k, R.step), e: R.e - R.fade * (k - 1), w: R.w });
  }
  return items;
}

/**
 * The frame's outer radius as deployed, at height h above the hinge ring and angle phi (cm), and
 * the heights of its inflow and outflow: for the paravalvular jets and the implant depth.
 */
export function frameAt(kind, wall) {
  const D = DESIGNS[kind];
  return { r: (h, phi) => deployedR(D, h - D.base, phi, wall), lo: D.base, hi: D.base + D.frameH };
}
