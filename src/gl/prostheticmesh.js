// A surgical aortic valve prosthesis in the aortic annulus of the heart shown (chapter Prosthetic
// valves, ch/prosthetic.js): a stented bioprosthesis (sewing ring, stent with three posts, three
// leaflets) or a bileaflet mechanical valve (sewing ring, housing, two discs). Each frame the
// prosthesis is built on the annulus of the heart's own aortic valve, which the echo leaves out,
// cut on the view's plane, and returned as B-mode items (bmode.js): fabric, tissue and metal, the
// acoustic shadow behind them, and reverberation behind the metal.
// Lengths in cm, in the heart model's world space. No three.js here: plain [x, y, z] arrays.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const arr = (v) => [v.x, v.y, v.z];
const DEG = Math.PI / 180;

/**
 * The valve's sizes (cm). A 23-mm valve: the stent's outer radius is half the label size. The
 * sewing ring reaches out to the heart's own annulus. Bioprosthesis: the stent posts stand 1.55 cm
 * above the ring, the stent's rim 0.7 cm between them. Each leaflet hangs from the stent between
 * two posts (0.12 cm above the ring at its middle, 0.8 cm at the posts) and from the posts above
 * that; its free edge lies 1.5 cm above the ring when open and meets the others 0.95 cm above it
 * at the centre when shut. Open, the share comm of each leaflet's width next to a post stays
 * against its neighbour, from the post in to the orifice; the rest stands straight below the
 * free edge, so a cut square to the root at areaH shows the orifice whole. Mechanical valve: the
 * housing is 0.6 cm tall, and the discs pivot 0.22 cm to each side of the centre (CLOSED, the
 * angle of a shut disc to the annular plane; OPEN, of a fully open one).
 */
export const SIZE = {
  label: 2.3, ringH: -0.02,
  bio: { postH: 1.55, rimH: 0.7, wall: 0.08, attachLow: 0.12, commH: 0.8, comm: 0.1, coaptH: 0.95, openH: 1.5, areaH: 1.36 },
  mech: { housingR: 1.1, housingLo: -0.12, housingHi: 0.48, discR: 1.04, pivotH: 0.18, pivotX: 0.22, disc: 0.08 },
};
export const CLOSED = 25, OPEN = 85;

// ---------------------------------------------------------------- the annulus
/**
 * The annulus of the heart's own aortic valve at this frame: the hinge ring of its cusps (their
 * lowest points along the root's axis), centre C, axis n into the aorta, and two directions
 * square to n: eh, square to the parasternal long-axis plane (the discs' hinge axis), and ep in
 * that plane. R: the ring's radius (90th percentile of the cusp points within 1.5 mm of the
 * lowest). Null when the heart has no aortic valve model.
 */
export function annulusOf(ev, s) {
  const vd = ev.valves.find((v) => v.mesh.name === 'AorticValve');
  if (!vd) return null;
  const A = ev.anat, av = arr(A.point('av', 0, s)), n = unit(arr(A.aorticRoot));
  const p = vd.pos, m = vd.count;
  let hmin = Infinity;
  const hs = new Float32Array(m), rs = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const q = [p[3 * i] - av[0], p[3 * i + 1] - av[1], p[3 * i + 2] - av[2]];
    const h = dot(q, n);
    hs[i] = h;
    rs[i] = Math.hypot(q[0] - h * n[0], q[1] - h * n[1], q[2] - h * n[2]);
    if (h < hmin) hmin = h;
  }
  const ring = [];
  for (let i = 0; i < m; i++) if (hs[i] < hmin + 0.15) ring.push(rs[i]);
  ring.sort((a, b) => a - b);
  const R = ring.length ? ring[Math.floor(ring.length * 0.9)] : SIZE.label / 2;
  const C = [av[0] + n[0] * hmin, av[1] + n[1] * hmin, av[2] + n[2] * hmin];
  const gp = ev.geoms && ev.geoms.plax;
  let w = gp ? arr(gp.n) : Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  w = sub(w, n.map((x) => x * dot(w, n)));
  const eh = unit(w), ep = unit(cross(n, eh));
  return { C, n, eh, ep, R };
}

// ---------------------------------------------------------------- the meshes
/**
 * A grid mesh of nu x nv points from f(u, v) -> [x, y, z], u and v from 0 to 1; wrapU and wrapV
 * close it in u and in v (a tube, a torus), so that its cut is a closed loop.
 */
export function gridMesh(nu, nv, f, wrapU = false, wrapV = false) {
  const pos = new Float32Array(nu * nv * 3);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const P = f(wrapU ? i / nu : i / (nu - 1), wrapV ? j / nv : j / (nv - 1));
    pos.set(P, 3 * (i * nv + j));
  }
  const idx = [];
  const iu = wrapU ? nu : nu - 1, jv = wrapV ? nv : nv - 1;
  for (let i = 0; i < iu; i++) for (let j = 0; j < jv; j++) {
    const i1 = (i + 1) % nu, j1 = (j + 1) % nv;
    const a = i * nv + j, b = i1 * nv + j, c = i * nv + j1, d = i1 * nv + j1;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}

/**
 * The prosthesis at this frame, in world space: a list of parts { mesh, kind } where kind is
 * 'ring' (a closed surface, cut as filled loops), 'stent', 'leaflet', 'housing' or 'disc' (open
 * surfaces, cut as lines). P: { type: 'bio' | 'mech', open (0 shut to 1 open: the cycle's drive),
 * orifice (bio: the open orifice's area, cm²), thick (bio: leaflet thickness, cm), angles (mech:
 * the most each disc opens, degrees) }.
 */
export function partsOf(F, P) {
  const { C, n, eh, ep } = F;
  // a point at radius r, angle phi round the axis from ep toward eh, height h above the ring
  const at = (r, phi, h) => [
    C[0] + r * (Math.cos(phi) * ep[0] + Math.sin(phi) * eh[0]) + h * n[0],
    C[1] + r * (Math.cos(phi) * ep[1] + Math.sin(phi) * eh[1]) + h * n[1],
    C[2] + r * (Math.cos(phi) * ep[2] + Math.sin(phi) * eh[2]) + h * n[2],
  ];
  const Rs = SIZE.label / 2;
  // the sewing ring: from the stent out past the heart's own annulus
  const out = Math.max(Rs + 0.28, F.R + 0.08), rr = (Rs + out) / 2, mr = Math.max(0.13, (out - Rs) / 2);
  const parts = [{ kind: 'ring', mesh: gridMesh(64, 12, (u, v) => {
    const a = 2 * Math.PI * u, b = 2 * Math.PI * v;
    return at(rr + mr * Math.cos(b), a, SIZE.ringH + mr * 0.85 * Math.sin(b));
  }, true, true) }];
  if (P.type === 'bio') {
    const B = SIZE.bio, rw = Rs - B.wall / 2, ra = Rs - B.wall - 0.02;
    // posts at 90, 210 and 330 degrees: the long-axis plane (0 and 180 degrees) passes 30 degrees from two of them
    const PHI0 = 90 * DEG;
    const post = (phi) => (1 + Math.cos(3 * (phi - PHI0))) / 2;
    const rim = (phi) => B.rimH + (B.postH - B.rimH) * post(phi) ** 2;
    parts.push({ kind: 'stent', mesh: gridMesh(120, 6, (u, v) => { const phi = 2 * Math.PI * u; return at(rw, phi, SIZE.ringH + v * (rim(phi) - SIZE.ringH)); }, true) });
    // the leaflets, from the stent (A) to the free edge (E). Shut, the free edges meet along the
    // three lines from the posts to the centre. Open, they ring an orifice of radius ro, the
    // leaflet's middle drawn half its thickness outside the orifice, so the orifice inside the
    // drawn leaflets has the area P.orifice; next to each post the share comm of the leaflet lies
    // against its neighbour, on the line from the post in to the orifice.
    const ro = Math.min(ra - 0.05, Math.sqrt(P.orifice / Math.PI) + P.thick / 2), o = P.open, c1 = B.comm;
    // a point at radius r, angle phi and height h, in the valve's own frame [x, y, h]
    const loc = (r, phi, h) => [r * Math.cos(phi), r * Math.sin(phi), h];
    // across the leaflet: open, it reaches the orifice's radius at half its length and stands straight above that
    const reach = (b) => { const t = Math.min(1, b / 0.5); return b + o * (1 - (1 - t) * (1 - t) - b); };
    for (let k = 0; k < 3; k++) {
      const p0 = PHI0 + (k * 2 * Math.PI) / 3, p1 = p0 + (2 * Math.PI) / 3;
      parts.push({ kind: 'leaflet', mesh: gridMesh(31, 11, (a, b) => {
        let A, Eo, u = 0.5;
        if (a < c1 || a > 1 - c1) {
          // next to a post: down the post, and open, in along the line from the post to the orifice
          const c = a < c1 ? a / c1 : (1 - a) / c1, pp = a < c1 ? p0 : p1;
          A = loc(ra, pp, B.postH + c * (B.commH - B.postH));
          Eo = loc(ra + c * (ro - ra), pp, B.postH + c * (B.openH - B.postH));
        } else {
          // between the posts: low on the stent at the middle, and open, round the orifice
          u = (a - c1) / (1 - 2 * c1);
          const phi = p0 + u * (p1 - p0);
          A = loc(ra, phi, B.attachLow + (B.commH - B.attachLow) * Math.pow(Math.abs(2 * u - 1), 1.6));
          Eo = loc(ro, phi, B.openH);
        }
        // shut: the free edge on the lines from the posts to the centre
        const far = Math.abs(2 * a - 1), Es = loc(ra * far, a < 0.5 ? p0 : p1, B.coaptH + (B.postH - B.coaptH) * far ** 1.5);
        const E = [0, 1, 2].map((i) => Es[i] + o * (Eo[i] - Es[i]));
        // shut, the leaflet's belly sags a little toward the ventricle
        const sag = 0.1 * Math.sin(Math.PI * b) * Math.sin(Math.PI * u) * (1 - o) * (a < c1 || a > 1 - c1 ? 0 : 1);
        const g = reach(b), x = A[0] + g * (E[0] - A[0]), y = A[1] + g * (E[1] - A[1]), h = A[2] + b * (E[2] - A[2]) - sag;
        return [C[0] + x * ep[0] + y * eh[0] + h * n[0], C[1] + x * ep[1] + y * eh[1] + h * n[1], C[2] + x * ep[2] + y * eh[2] + h * n[2]];
      }) });
    }
  } else {
    const M = SIZE.mech;
    parts.push({ kind: 'housing', mesh: gridMesh(120, 4, (u, v) => at(M.housingR, 2 * Math.PI * u, M.housingLo + v * (M.housingHi - M.housingLo)), true) });
    // the discs: half-discs on each side of ep, each turning about its pivot line (parallel to
    // eh, pivotX from the centre): its outer part swings into the aorta as it opens
    [1, -1].forEach((side, k) => {
      const th = (CLOSED + (Math.max(CLOSED, P.angles[k]) - CLOSED) * P.open) * DEG;
      parts.push({ kind: 'disc', mesh: gridMesh(13, 17, (a, b) => {
        const x = a * M.discR, half = Math.sqrt(Math.max(0, M.discR * M.discR - x * x)), y = (2 * b - 1) * half;
        const X = M.pivotX + (x - M.pivotX) * Math.cos(th), Z = M.pivotH + (x - M.pivotX) * Math.sin(th);
        return [0, 1, 2].map((i) => C[i] + side * X * ep[i] + y * eh[i] + Z * n[i]);
      }) });
    });
  }
  return parts;
}

// ---------------------------------------------------------------- the cut
/** Polylines where the plane g ({ O, r, d, n }) cuts a triangle mesh, in plane cm [u, v]. */
export function cutMesh(mesh, g) {
  const { pos, idx } = mesh, m = pos.length / 3;
  const O = arr(g.O), N = arr(g.n), R = arr(g.r), D = arr(g.d);
  const sd = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const s = (pos[3 * i] - O[0]) * N[0] + (pos[3 * i + 1] - O[1]) * N[1] + (pos[3 * i + 2] - O[2]) * N[2];
    sd[i] = s === 0 ? 1e-6 : s;
  }
  const pts = new Map(), adj = new Map();
  const point = (a, b) => {
    const key = a < b ? a * 1048576 + b : b * 1048576 + a;
    if (!pts.has(key)) {
      const t = sd[a] / (sd[a] - sd[b]);
      const x = pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t - O[0], y = pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t - O[1], z = pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t - O[2];
      pts.set(key, [x * R[0] + y * R[1] + z * R[2], x * D[0] + y * D[1] + z * D[2]]);
    }
    return key;
  };
  const link = (p, q) => {
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q);
    adj.get(q).push(p);
  };
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const sa = sd[a] > 0, sb = sd[b] > 0, sc = sd[c] > 0;
    if (sa === sb && sb === sc) continue;
    const e = [];
    if (sa !== sb) e.push(point(a, b));
    if (sb !== sc) e.push(point(b, c));
    if (sc !== sa) e.push(point(c, a));
    if (e.length === 2) link(e[0], e[1]);
  }
  const lines = [], used = new Set();
  // open runs first, from their ends, so each comes out whole
  const starts = [...adj.keys()].sort((x, y) => adj.get(x).length - adj.get(y).length);
  for (const start of starts) {
    if (used.has(start)) continue;
    const line = [];
    let cur = start, prev = -1, closed = false;
    for (let guard = 0; guard < 100000; guard++) {
      used.add(cur);
      line.push(pts.get(cur));
      const nb = adj.get(cur);
      let next = -1;
      for (const q of nb) if (q !== prev && !used.has(q)) { next = q; break; }
      if (next === -1) { closed = nb.includes(start) && line.length > 2; break; }
      prev = cur;
      cur = next;
    }
    if (line.length > 1) lines.push({ pts: line, closed });
  }
  return lines;
}

/**
 * Copies of the lines L moved along the beam, away from the probe at the plane's origin, by k
 * steps of step cm: the reverberation behind a strong reflector.
 */
export function echoes(L, k, step) {
  return L.map((P) => P.map(([u, v]) => { const l = Math.hypot(u, v) || 1; return [u + (u / l) * k * step, v + (v / l) * k * step]; }));
}

/**
 * The runs of the lines L that face the probe: segments more than 45 degrees from the beam
 * through their middle. Only these send the beam back to the probe and reverberate.
 */
export function facing(L) {
  const out = [];
  for (const P of L) {
    let run = [];
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ml = Math.hypot(mx, my) || 1;
      const c = tl > 1e-9 ? Math.abs(tx * mx + ty * my) / (tl * ml) : 1;
      if (c < Math.SQRT1_2) { if (!run.length) run.push(a); run.push(b); } else if (run.length) { if (run.length > 1) out.push(run); run = []; }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/**
 * The echo of each part: its level (dB against myocardium), its width as a line (cm), and the
 * shadow it casts (dB). The fabric of the sewing ring and the stent shadow a little, the metal
 * of a mechanical valve deeply. The leaflets brighten by up to `thick` dB as they thicken. Behind
 * the metal's faces that meet the beam, reverb.n echoes, reverb.step cm apart along the beam,
 * start at reverb.e and fade by reverb.fade dB each; the metal's own shadow dims them too.
 */
export const TONE = {
  ring: { e: 21, shadow: 10 }, stent: { e: 20, w: 0.08, shadow: 6 }, leaflet: { e: 15, thick: 5, shadow: 6 },
  housing: { e: 28, w: 0.11, shadow: 28 }, disc: { e: 28, shadow: 24 },
  reverb: { n: 4, step: 0.2, e: 16, fade: 5, w: 0.08 },
};

/**
 * The B-mode items (bmode.js) of the prosthesis on plane g: fabric, tissue and metal brighter
 * than myocardium, each with its shadow, and the reverberation behind the metal (TONE).
 */
export function prosthesisItems(F, P, g) {
  const items = [], metal = [], T = TONE;
  const thickF = P.type === 'bio' ? Math.max(0, Math.min(1, (P.thick - 0.08) / 0.27)) : 0;
  for (const part of partsOf(F, P)) {
    const cut = cutMesh(part.mesh, g);
    if (!cut.length) continue;
    const L = cut.map((x) => x.pts);
    if (part.kind === 'ring') {
      const loops = cut.filter((x) => x.closed && x.pts.length > 2).map((x) => x.pts);
      items.push({ polys: loops, e: T.ring.e, rule: 'evenodd', shadow: T.ring.shadow }, { borders: loops, e: T.ring.e, spec: 7, w: 0.06, closed: true });
    } else if (part.kind === 'stent') items.push({ lines: L, e: T.stent.e, w: T.stent.w, shadow: T.stent.shadow });
    else if (part.kind === 'leaflet') items.push({ lines: L, e: T.leaflet.e + T.leaflet.thick * thickF, w: P.thick, shadow: T.leaflet.shadow * thickF });
    else if (part.kind === 'housing') { items.push({ lines: L, e: T.housing.e, w: T.housing.w, shadow: T.housing.shadow }); metal.push(...L); }
    else if (part.kind === 'disc') { items.push({ lines: L, e: T.disc.e, w: SIZE.mech.disc, shadow: T.disc.shadow }); metal.push(...L); }
  }
  const R = T.reverb, back = facing(metal);
  if (back.length) for (let k = 1; k <= R.n; k++) items.push({ lines: echoes(back, k, R.step), e: R.e - R.fade * (k - 1), w: R.w });
  return items;
}
