// Diseases of the aorta on the heart mesh (chapter 'aorta'): three disease targets that
// phenomesh.js builds through its DISEASE table (entries aoRoot, aoAsc and aoCoa). Lengths in cm.
//
// The centre line (centreLine): marched through the aorta's wall, region 5 of the myocardium, from
// the aortic valve's centre up the root, round the arch and down the descending aorta. Each step
// takes the wall's vertices in a slab 0.3 cm thick, square to the line, and the centre of the
// circle that fits them (least squares). Vertices more than 0.45 cm off that circle (the stubs of
// the arch's branches) are left out, and the circle is fitted again. The next slab lies 0.4 cm on.
//
// aoRoot: the sinuses of Valsalva wider. Each wall point moves out from the centre line, 1 cm at
// weight 1 from 0.9 to 1.35 cm above the valve's centre, fading to none at the centre (the annulus
// lies 0.1 cm below it) and 2.45 cm above it. The sinotubular junction lies about 2.4 cm above it.
// aoAsc: the tubular ascending aorta wider, 1 cm at weight 1 from 2.8 to 6.2 cm, fading to none at
// 1.9 cm and at 7.8 cm, below the arch's branches.
// The walls next to the aorta (the left atrium, the RV outflow tract, the pulmonary artery, the
// right atrium and the venae cavae) move out with it: in full within 0.8 cm of the aorta's wall,
// fading to none at 2.4 cm, so that a move of up to 1.5 cm leaves 0.7 cm or more between them.
// aoCoa: coarctation, a waist round the centre line of the descending aorta at the isthmus, where
// the arch turns down: each wall point moves toward the line, 1 cm at weight 1 within 0.15 cm of
// the waist's middle, fading to none at 0.7 cm. Only the aorta's wall moves.
// The pericardium and the coronary arteries take the move of the wall next to them.
//
// The targets leave the landmarks where they are (shift is zero), so the view planes stay. With
// shift, buildAorta returns the centre line and the isthmus (middle C, axis t along the line
// toward the arch), which the chapter uses to place its suprasternal plane; for aoCoa also the centre
// of the left subclavian artery's stub (lsa), which the chapter names on that plane.

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// the profiles along the centre line (cm from the aortic valve's centre)
const ROOT = { up: [0.0, 0.9], down: [1.35, 2.45] };
const ASC = { up: [1.9, 2.8], down: [6.2, 7.8] };
// the walls next to the aorta follow it in full within NEAR[0] cm of its wall, and not at all
// beyond NEAR[1] cm
const NEAR = [0.8, 2.4];
// the waist: full within this distance of its middle, none beyond the second (cm)
const WAIST = [0.15, 0.7];

/** The profile of target kind at arclength s (cm): 0 to 1. */
function profile(kind, s) {
  const P = kind === 'root' ? ROOT : ASC;
  return smooth((s - P.up[0]) / (P.up[1] - P.up[0])) * (1 - smooth((s - P.down[0]) / (P.down[1] - P.down[0])));
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

/**
 * The aorta's centre line on the normal mesh (ctx from phenomesh.js preparePhenotypes), found once:
 * { pts: [[x, y, z]...], R: the fitted radius at each point, s: arclength at each point (cm) }.
 */
export function centreLine(ctx) {
  if (ctx.aortaLine) return ctx.aortaLine;
  const { F, REG, mpos, nMyo } = ctx;
  const P = [];
  for (let i = 0; i < nMyo; i++) if (REG[i] === 5) P.push([mpos[3 * i], mpos[3 * i + 1], mpos[3 * i + 2]]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let C = [F.av.x, F.av.y, F.av.z], dir = unit([F.aoRoot.x, F.aoRoot.y, F.aoRoot.z]);
  const pts = [], R = [];
  let rPrev = 1.5;
  for (let k = 0; k < 90; k++) {
    // the slab's vertices near the wall's last radius from the centre ahead: the stubs of the
    // arch's branches stand farther out
    let slab = P.filter((q) => { const v = sub(q, C); return Math.abs(dot(v, dir)) < 0.15 && Math.abs(Math.hypot(...v) - rPrev) < 0.6; });
    if (slab.length < 8) break;
    let e1 = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    e1 = unit(sub(e1, dir.map((x) => x * dot(e1, dir))));
    const e2 = cross(dir, e1);
    let fit = null;
    for (let pass = 0; pass < 3; pass++) {
      // the circle x² + y² = a x + b y + c through the slab's points, by least squares
      let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0;
      const n = slab.length;
      for (const q of slab) {
        const v = sub(q, C), x = dot(v, e1), y = dot(v, e2), z = x * x + y * y;
        sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sxz += x * z; syz += y * z; sz += z;
      }
      const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxz, syz, sz];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M);
      if (Math.abs(D) < 1e-9) break;
      const col = (j) => M.map((row, i) => row.map((x, jj) => (jj === j ? b[i] : x)));
      const a = det(col(0)) / D, bb = det(col(1)) / D, c = det(col(2)) / D;
      const cx = a / 2, cy = bb / 2, r = Math.sqrt(Math.max(0, c + cx * cx + cy * cy));
      fit = { cx, cy, r };
      // the wall's own vertices: those near the circle (the stubs of the arch's branches stand off it)
      const keep = slab.filter((q) => { const v = sub(q, C), x = dot(v, e1) - cx, y = dot(v, e2) - cy; return Math.abs(Math.hypot(x, y) - r) < 0.45; });
      if (keep.length === slab.length || keep.length < 8) break;
      slab = keep;
    }
    if (!fit) break;
    const Cn = [C[0] + e1[0] * fit.cx + e2[0] * fit.cy, C[1] + e1[1] * fit.cx + e2[1] * fit.cy, C[2] + e1[2] * fit.cx + e2[2] * fit.cy];
    pts.push(Cn);
    R.push(fit.r);
    rPrev = fit.r;
    if (pts.length > 1) {
      const nd = unit(sub(pts[pts.length - 1], pts[pts.length - 2]));
      dir = unit(dir.map((x, i) => x + nd[i]));
    }
    C = Cn.map((x, i) => x + 0.4 * dir[i]);
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  ctx.aortaLine = { pts, R, s };
  return ctx.aortaLine;
}

/** The point of the centre line nearest (x, y, z): its arclength s, the foot c, the distance d and the fitted radius R there. */
function nearestOn(L, x, y, z) {
  let best = null;
  for (let i = 0; i < L.pts.length - 1; i++) {
    const A = L.pts[i], B = L.pts[i + 1];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], l2 = ux * ux + uy * uy + uz * uz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - A[0]) * ux + (y - A[1]) * uy + (z - A[2]) * uz) / l2));
    const cx = A[0] + ux * t, cy = A[1] + uy * t, cz = A[2] + uz * t, d = Math.hypot(x - cx, y - cy, z - cz);
    if (!best || d < best.d) best = { d, s: L.s[i] + t * (L.s[i + 1] - L.s[i]), c: [cx, cy, cz], R: L.R[i] + t * (L.R[i + 1] - L.R[i]) };
  }
  return best;
}

/**
 * The isthmus: the middle of the first step of the centre line, past the top of the arch, that runs
 * down at 50° or more from the horizontal, just past the last branch stub; and the line's direction
 * there, toward the arch, over the steps on either side. { C, t, i }.
 */
function isthmusOf(L) {
  let top = 0;
  for (let i = 1; i < L.pts.length; i++) if (L.pts[i][1] > L.pts[top][1]) top = i;
  for (let i = top + 1; i < L.pts.length - 2; i++) {
    const a = L.pts[i], b = L.pts[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1;
    if (-d[1] / l <= Math.sin((50 * Math.PI) / 180)) continue;
    const p = L.pts[i - 1], q = L.pts[i + 2], e = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], m = Math.hypot(...e) || 1;
    return { C: a.map((x, k) => (x + b[k]) / 2), t: e.map((x) => x / m), i };
  }
  return null;
}

/**
 * The left subclavian artery's stub: the last branch stub of the arch before the isthmus. The
 * stubs' vertices lie more than 0.45 cm outside the wall's fitted circle; of those between the top
 * of the arch and the isthmus, the ones within 0.6 cm (arclength) of the last make its stub. Their
 * centre (world), or null.
 */
function lsaOf(L, ist, ctx) {
  if (!ist) return null;
  const { REG, mpos, nMyo } = ctx;
  let top = 0;
  for (let i = 1; i < L.pts.length; i++) if (L.pts[i][1] > L.pts[top][1]) top = i;
  const s0 = L.s[top], s1 = L.s[ist.i] + 0.5 * (L.s[ist.i + 1] - L.s[ist.i]);
  const stub = [];
  for (let i = 0; i < nMyo; i++) {
    if (REG[i] !== 5) continue;
    const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
    const q = nearestOn(L, x, y, z);
    if (q.s > s0 && q.s < s1 && q.d > q.R + 0.45) stub.push([q.s, x, y, z]);
  }
  if (!stub.length) return null;
  const last = Math.max(...stub.map((p) => p[0]));
  const near = stub.filter((p) => p[0] > last - 0.6);
  return [1, 2, 3].map((k) => near.reduce((a, p) => a + p[k], 0) / near.length);
}

/**
 * Build target key of kind ('root', 'asc' or 'coa') on the meshes. ctx: phenomesh.js
 * preparePhenotypes; H: helpers of phenomesh.js { addTarget, grid, nearest }.
 */
export async function buildAorta(ctx, key, kind, H) {
  const { meshes, REG, mpos, nMyo, F } = ctx;
  const tick = slicer();
  const L = centreLine(ctx);
  const ist = isthmusOf(L);
  const lsa = kind === 'coa' ? lsaOf(L, ist, ctx) : null;
  const ed = new Float32Array(mpos.length);
  if (kind === 'coa') {
    if (ist) {
      const [cx, cy, cz] = ist.C, [tx, ty, tz] = ist.t;
      for (let i = 0; i < nMyo; i++) {
        if ((i & 255) === 0) await tick();
        if (REG[i] !== 5) continue;
        const x = mpos[3 * i] - cx, y = mpos[3 * i + 1] - cy, z = mpos[3 * i + 2] - cz;
        const tau = x * tx + y * ty + z * tz;
        const w = 1 - smooth((Math.abs(tau) - WAIST[0]) / (WAIST[1] - WAIST[0]));
        if (w <= 0) continue;
        const rx = x - tau * tx, ry = y - tau * ty, rz = z - tau * tz, r = Math.hypot(rx, ry, rz);
        if (r < 1e-6 || r > 2.2) continue;
        ed[3 * i] = (-rx / r) * w; ed[3 * i + 1] = (-ry / r) * w; ed[3 * i + 2] = (-rz / r) * w;
      }
    }
  } else {
    const G5 = H.grid(mpos, (i) => REG[i] === 5, 0.8);
    for (let i = 0; i < nMyo; i++) {
      if ((i & 255) === 0) await tick();
      const x = mpos[3 * i], y = mpos[3 * i + 1], z = mpos[3 * i + 2];
      let follow = 1;
      if (REG[i] !== 5) {
        const q = H.nearest(G5, x, y, z, 1, NEAR[1]);
        if (!q.length) continue;
        follow = 1 - smooth((Math.sqrt(q[0][1]) - NEAR[0]) / (NEAR[1] - NEAR[0]));
      }
      const q = nearestOn(L, x, y, z);
      const p = profile(kind, q.s) * follow;
      if (p <= 0 || q.d < 1e-6) continue;
      const k = p / q.d;
      ed[3 * i] = (x - q.c[0]) * k; ed[3 * i + 1] = (y - q.c[1]) * k; ed[3 * i + 2] = (z - q.c[2]) * k;
    }
  }
  H.addTarget(meshes.Myocardium, `dx_${key}`, ed);
  // the pericardium and the coronary arteries go with the wall next to them, as phenomesh.js buildGrow does
  const G = H.grid(mpos, null, 1.0);
  for (const name of ['Pericardium', 'Coronaries']) {
    const mesh = meshes[name];
    if (!mesh) continue;
    const p = mesh.geometry.attributes.position.array, n = p.length / 3;
    const e2 = new Float32Array(p.length);
    for (let j = 0; j < n; j++) {
      if ((j & 127) === 0) await tick();
      const nb = H.nearest(G, p[3 * j], p[3 * j + 1], p[3 * j + 2], 6, 2.5);
      let wsum = 0;
      const acc = [0, 0, 0];
      for (const [i, d2] of nb) {
        const w = 1 / (d2 + 0.02);
        wsum += w;
        for (let k = 0; k < 3; k++) acc[k] += w * ed[3 * i + k];
      }
      if (wsum > 0) for (let k = 0; k < 3; k++) e2[3 * j + k] = acc[k] / wsum;
    }
    H.addTarget(mesh, `dx_${key}`, e2);
  }
  const V3 = (a) => F.Z.clone().set(a[0], a[1], a[2]);
  return {
    shift: () => V3([0, 0, 0]),
    line: L,
    isthmus: ist ? { C: V3(ist.C), t: V3(ist.t), r: (L.R[ist.i] + L.R[ist.i + 1]) / 2 } : null,
    lsa: kind === 'coa' && lsa ? V3(lsa) : null,
  };
}
