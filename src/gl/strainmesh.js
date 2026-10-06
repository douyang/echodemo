// Myocardial strain on the heart mesh (chapter 'strain'). The model's own systolic motion shortens
// the LV's walls unevenly: its midline strain is about -10%, mostly in the basal segments. So the
// chapter sets the motion along the LV's long axis itself, as one field of space. Every point at
// level h of the LV (0 at the endocardial apex, 1 at the mitral valve) moves toward the apex by the
// shortening of the LV below it. Above the mitral valve the field fades out over FADE cm. So the
// valves, the atria and the aortic root follow the base, and points that lie together move
// together. Near the apex the model's own motion stays, as its wall thickens there along the axis.
// The model's own motion across the long axis stays too; on the LV wall the chapter scales it.
// phenomesh.js builds five targets through its DISEASE table. The chapter weights them within the
// beat (echo.js setMotion), each in proportion to the systolic weight s of the cycle model:
//   strA, weight s: takes away the model's own motion that the chapter sets.
//   strB, weight s x kT: the LV wall's own motion, but along the axis away from the apex.
//   strD, weight s x kL: the motion along the axis; the LV shortens by EPS x PROFILE(h) at level h.
//   strR, weight s x k x (1 - q): the share of strB and strD that belongs to the LAD territory of
//     the 18-segment model (Voigt 2015). With it, the LAD segments shorten and thicken by q of the
//     rest, and the segments basal to them move less.
//   strZ, weight a x s: takes away the amyloid heart's own systolic change that the chapter sets.
// Each target leaves the landmarks where they are (shift is zero), so the view planes do not move.
// The fields are found on the normal heart's mesh, as Regional wall motion finds its segments. So a
// vertex keeps them whatever heart is shown.

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the shortening along the axis at weight 1, and its profile by level (a factor at each of the
// levels LEVELS), set so that the speckle tracking of the three apical views (src/straintrack.js)
// measures about the same strain in the basal, mid and apical segments
export const EPS = -0.2;
export const LEVELS = [0, 0.2, 0.4, 0.6, 0.8, 1];
export const PROFILE = [1.4, 1.35, 1.0, 1.0, 1.15, 1.2];
// the field fades out over this many cm above the mitral valve's level
const FADE = 3.5;
// the model's own motion stays at the apex and gives way to the field from level 0.06 to 0.24
const CAP0 = 0.06, CAP1 = 0.24;
// the LAD territory in the 18-segment model: the anterior and anteroseptal walls at every level,
// and the inferoseptal wall at the apical level (the 17-segment model's apical septal segment and
// apex, Javadi 2010 in aha.js, split among the six apical segments). Angles as aha.js: 90
// anterior, 150 anteroseptal, 210 inferoseptal, taken round the LV's long axis from the apex to the
// centre of the mitral valve (MV_TOP), so that the hinges of each apical view sit at the angles of
// its walls (the frame's own axis passes 0.9 cm from that centre). APICAL: the level where the apical segment of the
// inferoseptal wall ends, a third of the four-chamber view's septal midline from the apex. Borders
// blend over BLEND deg and over LBLEND of the LV's length. The four-chamber plane meets the septum
// at 217 to 241 deg in this model and the two-chamber plane the inferior wall at 278 to 289 deg, so
// the apical band ends at 258 deg, between the two: the field then changes little along either cut.
export const APICAL = 0.25;
const BLEND = 12, LBLEND = 0.05, SEPT_END = 258, MV_TOP = 0.9;

/** The LAD's share of the wall at level h and angle th (deg). */
export function ladOf(h, th) {
  const a = ((th % 360) + 360) % 360;
  const band = (lo, hi) => smooth((a - lo + BLEND) / (2 * BLEND)) * (1 - smooth((a - hi + BLEND) / (2 * BLEND)));
  const apical = 1 - smooth((h - APICAL + LBLEND) / (2 * LBLEND));
  return Math.max(band(60, 180), band(180, SEPT_END) * apical);
}
/** The profile of the shortening at level h. */
export function profileOf(h) {
  const x = clamp(h, 0, 1) * (LEVELS.length - 1), i = Math.min(LEVELS.length - 2, Math.floor(x)), f = x - i;
  return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * smooth(f);
}

/**
 * Build target key of kind ('A', 'B', 'D', 'R' or 'Z') on the meshes. ctx: phenomesh.js
 * preparePhenotypes; H: helpers of phenomesh.js { addTarget, grid, nearest }.
 */
export async function buildStrain(ctx, key, kind, H) {
  const S = await fieldsOf(ctx, H);
  for (const [name, T] of Object.entries(S.targets[kind])) H.addTarget(ctx.meshes[name], `dx_${key}`, T);
  return { shift: () => ctx.F.Z.clone().set(0, 0, 0) };
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

/** The five targets on every mesh, found once for all five keys. */
function fieldsOf(ctx, H) {
  if (!ctx.strain) ctx.strain = build(ctx, H);
  return ctx.strain;
}

async function build(ctx, H) {
  const { meshes, F, REG, mpos, nMyo } = ctx;
  const tick = slicer();
  const Z = F.Z, X = F.X, Y = F.Y, A0 = F.apexEndo, Lax = F.Ls;
  const coords = (x, y, z) => {
    const qx = x - A0.x, qy = y - A0.y, qz = z - A0.z;
    const zz = qx * Z.x + qy * Z.y + qz * Z.z;
    const rx = qx - zz * Z.x, ry = qy - zz * Z.y, rz = qz - zz * Z.z;
    const px = rx * X.x + ry * X.y + rz * X.z, py = rx * Y.x + ry * Y.y + rz * Y.z, h = zz / Lax;
    const th = (Math.atan2(py, px) * 180) / Math.PI + F.turn;
    // round the long axis from the apex to the mitral valve's centre: (cx, cy) at level 1
    const f = clamp(h, 0, 1), qx2 = px - f * mvc.x, qy2 = py - f * mvc.y;
    const th2 = (Math.atan2(qy2, qx2) * 180) / Math.PI + F.turn;
    return { h, px, py, r: Math.hypot(rx, ry, rz), th: ((th % 360) + 360) % 360, r2: Math.hypot(qx2, qy2), th2: ((th2 % 360) + 360) % 360 };
  };
  // the mitral valve's centre off the frame's axis: the mean of its vertices above level MV_TOP
  const mvc = { x: 0, y: 0 };
  if (meshes.MitralValve) {
    const p = meshes.MitralValve.geometry.attributes.position.array;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < p.length / 3; i++) {
      const c = coords(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      if (c.h < MV_TOP) continue;
      sx += c.px; sy += c.py; n++;
    }
    if (n) { mvc.x = sx / n; mvc.y = sy / n; }
  }
  // The field along the axis (cm, toward the apex negative), as the shortening below level h: all
  // of the LV, and the LAD's share, on a grid of levels and angles; above the mitral valve it fades.
  const NH = 241, H0 = -0.2, DH = 0.01, NT = 72;
  const cum = new Float32Array(NH), cumLad = new Float32Array(NH * NT);
  for (let i = 1; i < NH; i++) {
    const h = H0 + i * DH, hm = h - DH / 2;
    const inLv = hm > 0 && hm < 1 ? DH : 0;
    cum[i] = cum[i - 1] + inLv * profileOf(hm);
    for (let j = 0; j < NT; j++) cumLad[i * NT + j] = cumLad[(i - 1) * NT + j] + inLv * profileOf(hm) * ladOf(hm, j * 5);
  }
  const fade = (h) => (h <= 1 ? 1 : 1 - smooth(((h - 1) * Lax) / FADE));
  const lookup = (h) => { const x = clamp((h - H0) / DH, 0, NH - 1.001), i = Math.floor(x); return [i, x - i]; };
  const fieldAll = (h) => { const [i, f] = lookup(h); return EPS * Lax * (cum[i] + (cum[i + 1] - cum[i]) * f) * fade(h); };
  // near the axis the angle means little: the LAD's share blends to its mean round the axis
  const meanLad = new Float32Array(NH);
  for (let i = 0; i < NH; i++) { let s = 0; for (let j = 0; j < NT; j++) s += cumLad[i * NT + j]; meanLad[i] = s / NT; }
  const fieldLad = (h, th, r) => {
    const [i, f] = lookup(h), a = th / 5, j0 = Math.floor(a) % NT, j1 = (j0 + 1) % NT, g = a - Math.floor(a);
    const at = (k) => cumLad[k * NT + j0] * (1 - g) + cumLad[k * NT + j1] * g;
    const v = at(i) + (at(i + 1) - at(i)) * f, m = meanLad[i] + (meanLad[i + 1] - meanLad[i]) * f, k = Math.min(1, r / 1.2);
    return EPS * Lax * (m + (v - m) * k) * fade(h);
  };
  // the LV wall: region 1, and the septum's RV face (region 2 within the LV's outer radius, as
  // Regional wall motion takes it), up to the mitral valve
  const NL = 24, lists = Array.from({ length: NL }, () => []), lvl = (h) => Math.floor(clamp(h, 0, 0.999) * NL);
  const cs = new Array(nMyo);
  for (let i = 0; i < nMyo; i++) {
    if ((i & 1023) === 0) await tick();
    cs[i] = coords(mpos[3 * i], mpos[3 * i + 1], mpos[3 * i + 2]);
    if (REG[i] === 1) lists[lvl(cs[i].h)].push(cs[i].r);
  }
  const rOut = lists.map((l) => { l.sort((a, b) => a - b); return l.length ? l[Math.floor(l.length * 0.9)] : 3; });
  const WALL = new Uint8Array(nMyo);
  for (let i = 0; i < nMyo; i++) WALL[i] = cs[i].h <= 1.06 && (REG[i] === 1 || (REG[i] === 2 && cs[i].r < rOut[lvl(cs[i].h)] + 0.4)) ? 1 : 0;
  const Gwall = H.grid(mpos, (i) => WALL[i] === 1, 0.6);
  const close = (x, y, z) => { const q = H.nearest(Gwall, x, y, z, 1, 1.15); return q.length ? 1 - smooth((Math.sqrt(q[0][1]) - 0.25) / 0.9) : 0; };
  const lvFade = (h) => 1 - smooth((h - 1) / 0.06);

  const SYS = (mesh, name) => { const i = mesh.morphTargetDictionary[name]; return i === undefined ? null : mesh.geometry.morphAttributes.position[i].array; };
  const targets = { A: {}, B: {}, D: {}, R: {}, Z: {} };
  for (const [name, mesh] of Object.entries(meshes)) {
    const S = SYS(mesh, 'systole');
    if (!S) continue;
    const SA = SYS(mesh, 'amyloid_systole');
    const valve = /Valve$/.test(name), chord = /Chordae$/.test(name);
    const pos = mesh.geometry.attributes.position.array, n = pos.length / 3;
    const col = mesh.geometry.attributes.color;
    const T = { A: new Float32Array(3 * n), B: new Float32Array(3 * n), D: new Float32Array(3 * n), R: new Float32Array(3 * n), Z: new Float32Array(3 * n) };
    for (let i = 0; i < n; i++) {
      if ((i & 511) === 0) await tick();
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const c = name === 'Myocardium' ? cs[i] : coords(x, y, z);
      // a valve moves with its annulus as one piece: the field at the valve's level or above
      const h = valve ? Math.max(1, c.h) : c.h;
      // w: the share of the LV wall, whose own motion the chapter scales
      let w = 0;
      if (name === 'Myocardium') w = WALL[i] ? lvFade(c.h) : close(x, y, z) * lvFade(c.h);
      else if (name === 'Papillary') w = col && Math.round(col.getX(i) * 10) === 2 ? 0 : 1;
      else if (!valve && !chord) w = close(x, y, z) * lvFade(c.h);
      // b: the share of the motion along the axis that the field sets (none at the apex)
      const b = valve || chord ? 1 : smooth((c.h - CAP0) / (CAP1 - CAP0));
      const fa = fieldAll(h), fl = fieldLad(h, c.th2, c.r2), lad = w ? ladOf(c.h, c.th2) : 0;
      const an = S[3 * i] * Z.x + S[3 * i + 1] * Z.y + S[3 * i + 2] * Z.z;
      const aa = SA ? SA[3 * i] * Z.x + SA[3 * i + 1] * Z.y + SA[3 * i + 2] * Z.z : 0;
      for (let k = 0; k < 3; k++) {
        const zk = k === 0 ? Z.x : k === 1 ? Z.y : Z.z;
        // the model's own motion that stays: across the axis, and along it where the field does not reach
        const P = S[3 * i + k] - b * an * zk, PA = SA ? SA[3 * i + k] - b * aa * zk : 0;
        T.A[3 * i + k] = -b * an * zk - w * P;
        T.B[3 * i + k] = w * P;
        T.D[3 * i + k] = b * fa * zk;
        T.R[3 * i + k] = -(b * fl * zk + w * lad * P);
        T.Z[3 * i + k] = -(b * aa * zk + w * PA);
      }
    }
    for (const k of Object.keys(targets)) targets[k][name] = T[k];
  }
  last = { targets, coords, fieldAll, fieldLad, mvc };
  return last;
}
/** The fields of the last build, for the checks. */
export let last = null;
