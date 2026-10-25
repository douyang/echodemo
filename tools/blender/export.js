// The heart and the device of chapter M-TEER, T-TEER (?ch=tteer) or TAVR (?ch=tavr), as Blender
// reads them (tools/blender/export.mjs runs this page). For each frame { name, s, t }: the
// chapter's state at step position s and time t (ms in the beat), the morphed meshes in world cm
// (glTF frame: x to the patient's left, y to the head, z to the front), the device's parts, and
// an overlap check of the device against the walls and the leaflets (the clip only). The topology
// (indices, the myocardium's regions) goes once.
import * as THREE from '../../vendor/three.bundle.min.js';
import { diseaseTargets, lvMask } from '../../src/model3d.js';
import { scanner } from '../../src/scanner.js';
import { cycleAt } from '../../src/cyclemodel.js';
import * as CM from '../../src/gl/clipmesh.js';
import { frameAt } from '../../src/gl/tavrmesh.js';
import { gridMesh } from '../../src/gl/prostheticmesh.js';

/** The chapter: mteer (the default), tteer or tavr. */
const CH = { tteer: 'tteer', tavr: 'tavr' }[new URLSearchParams(location.search).get('ch')] || 'mteer';
const TC = await import(`../../src/ch/${CH}.js`);
/** The valve that the clip holds. */
const VALVE = CH === 'tteer' ? 'TricuspidValve' : 'MitralValve';

const b64 = (arr) => {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const save = (name, arr) => window.__save(name, b64(arr));

/** Points in cells, for the nearest point. */
function grid(pos, cell = 0.3) {
  const g = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${Math.floor(pos[i] / cell)},${Math.floor(pos[i + 1] / cell)},${Math.floor(pos[i + 2] / cell)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(pos[i], pos[i + 1], pos[i + 2]);
  }
  return { g, cell };
}
function nearest(G, x, y, z, rMax = 0.6) {
  const { g, cell } = G, R = Math.ceil(rMax / cell), cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
  let best = rMax * rMax;
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    const L = g.get(`${cx + a},${cy + b},${cz + c}`);
    if (!L) continue;
    for (let i = 0; i < L.length; i += 3) { const d = (L[i] - x) ** 2 + (L[i + 1] - y) ** 2 + (L[i + 2] - z) ** 2; if (d < best) best = d; }
  }
  return Math.sqrt(best);
}

/**
 * The overlap check before a render: the device's vertices against the myocardium, away from the
 * septal crossing (CROSS cm round the puncture site, where the guide meets the septum at an
 * angle), and the clip against the leaflets before it
 * holds them (cap < 0.5). A vertex nearer than WALL or LEAF cm to the other mesh counts as a hit.
 */
const WALL = 0.12, WALL_CLIP = 0.08, LEAF = 0.06, CROSS = 1.8;
function overlap(ev, g, D, pose) {
  const myo = grid(ev.myo.pos), mv = ev.valves.find((v) => v.mesh.name === VALVE);
  const leaf = grid(mv.pos, 0.2);
  // the crossing (M-TEER): round the septum's site in this frame (a tent moves it toward the LA)
  // and at rest. T-TEER crosses no wall.
  const S = CH === 'mteer' ? TC.motionFor(ev, g).sm.map(g.punct.P) : [1e9, 1e9, 1e9];
  const S0 = CH === 'mteer' ? g.S.toArray() : [1e9, 1e9, 1e9];
  const crossing = (x, y, z) => Math.hypot(x - S[0], y - S[1], z - S[2]) <= CROSS || Math.hypot(x - S0[0], y - S0[1], z - S0[2]) <= CROSS;
  const out = { wallMin: Infinity, wallHits: 0, leafMin: Infinity, leafHits: 0, parts: {}, where: [] };
  const clipParts = new Set(['body', 'armA', 'armP', 'gripA', 'gripP']);
  for (const [name, m] of Object.entries(D.parts)) {
    let wmin = Infinity, hits = 0;
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
      if (!crossing(x, y, z)) {
        const d = nearest(myo, x, y, z);
        wmin = Math.min(wmin, d);
        if (d < (clipParts.has(name) ? WALL_CLIP : WALL)) { hits++; if (out.where.length < 12) out.where.push([name, x, y, z].map((v) => (typeof v === 'number' ? Number(v.toFixed(2)) : v))); }
      }
      if (clipParts.has(name) && !(pose.cap >= 0.5)) {
        const d = nearest(leaf, x, y, z, 0.4);
        out.leafMin = Math.min(out.leafMin, d);
        if (d < LEAF) out.leafHits++;
      }
    }
    out.parts[name] = { wallMin: Number(wmin.toFixed(3)), wallHits: hits };
    out.wallMin = Math.min(out.wallMin, wmin);
    out.wallHits += hits;
  }
  for (const k of ['wallMin', 'leafMin']) out[k] = Number.isFinite(out[k]) ? Number(out[k].toFixed(3)) : null;
  // the catheter's centre line: its clearance from the walls (cm), away from the crossing
  if (D.path) {
    let cmin = Infinity, at = null;
    for (const q of D.path) {
      if (Math.hypot(q[0] - S[0], q[1] - S[1], q[2] - S[2]) <= 1.4 || q[1] < -6) continue;
      const d = nearest(myo, q[0], q[1], q[2], 1.2);
      if (d < cmin) { cmin = d; at = q.map((v) => Number(v.toFixed(2))); }
    }
    out.pathMin = Number.isFinite(cmin) ? Number(cmin.toFixed(3)) : null;
    out.pathAt = at;
  }
  return out;
}

// ---------------------------------------------------------------- TAVR
// The parts that only the stills show: the frame's struts (the echo views cut a smooth frame and
// draw its struts as beads), the guidewire as a tube, the balloon at Deploy.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** A tube of radius r round the polyline pts (world cm), sides faces round: its ends open. */
function tube(pts, r, sides = 6) {
  const pos = [], idx = [];
  let N = null;
  for (let i = 0; i < pts.length; i++) {
    const T = nrm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    // a normal carried along the line, square to each tangent in turn (it does not twist)
    if (!N) N = nrm(crs(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    else { const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; N = nrm([N[0] - d * T[0], N[1] - d * T[1], N[2] - d * T[2]]); }
    const B = crs(T, N);
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides, c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.push(pts[i][0] + c * N[0] + s * B[0], pts[i][1] + c * N[1] + s * B[1], pts[i][2] + c * N[2] + s * B[2]);
    }
    if (i) for (let k = 0; k < sides; k++) {
      const a = (i - 1) * sides + k, b = (i - 1) * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { pos, idx };
}
/** Several meshes as one. */
function joined(list) {
  const pos = [], idx = [];
  for (const m of list) { const o = pos.length / 3; pos.push(...m.pos); for (const i of m.idx) idx.push(i + o); }
  return { pos, idx };
}
/** The point at radius r, angle phi (rad, from ep toward eh) and height h of annulus frame F. */
const atF = (F, r, phi, h) => [0, 1, 2].map((i) => F.C[i] + r * (Math.cos(phi) * F.ep[i] + Math.sin(phi) * F.eh[i]) + h * F.n[i]);
/**
 * The balloon-expandable frame's struts: rows of diamond cells, NC round and NR high, from its
 * inflow to its outflow, on its outer face; and three posts at its commissures over its outflow
 * half. A drawing of the cell pattern, not the maker's.
 */
function struts(R, NC = 12, NR = 4) {
  const fr = frameAt('be', R.wall, R.P.u), c0 = (R.P.comm * Math.PI) / 180;
  const along = (a0, h0, a1, h1, n = 6) => Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n, h = h0 + ((h1 - h0) * k) / n;
    return atF(R.F, fr.r(h, a) + 0.012, a, h);
  });
  const lines = [];
  for (let j = 0; j < NR; j++) {
    const h0 = fr.lo + ((fr.hi - fr.lo) * j) / NR, h1 = fr.lo + ((fr.hi - fr.lo) * (j + 1)) / NR;
    for (let i = 0; i < NC; i++) {
      const a = c0 + (2 * Math.PI * i) / NC + (j % 2 ? Math.PI / NC : 0);
      lines.push(along(a, h0, a + Math.PI / NC, h1), along(a, h0, a - Math.PI / NC, h1));
    }
  }
  const mid = (fr.lo + fr.hi) / 2;
  for (let k = 0; k < 3; k++) { const a = c0 + (2 * Math.PI * k) / 3; lines.push(along(a, mid, a, fr.hi, 4)); }
  return joined(lines.map((L) => tube(L, 0.024, 5)));
}
/** The balloon, full: the frame's inner face over its length, tapering to the shaft 0.7 cm beyond each end. */
function balloon(R) {
  const fr = frameAt('be', R.wall, 1), z0 = fr.lo - 0.7, z1 = fr.hi + 0.7, rs = 0.16;
  const m = gridMesh(48, 40, (a, b) => {
    const phi = 2 * Math.PI * a, h = z0 + (z1 - z0) * b;
    const rf = fr.r(Math.min(fr.hi, Math.max(fr.lo, h)), phi) - 0.04;
    const t = h < fr.lo ? (h - z0) / (fr.lo - z0) : h > fr.hi ? (z1 - h) / (z1 - fr.hi) : 1;
    return atF(R.F, rs + (rf - rs) * Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, t))), phi, h);
  }, true);
  return { pos: Array.from(m.pos), idx: m.idx };
}

/** The TAVR frames: the heart with the native valve stenotic, then left out; the valve's parts. */
async function runTavr(frames) {
  const S = await scanner(), model = S.model;
  const shifts = await diseaseTargets(TC.DISEASES);
  const ev = S.make(64, 64, 'a4c', { fill: true });
  ev.setView('a4c', { animate: false });
  const list = () => [['myo', ev.myo], ...ev.valves.map((v) => [v.mesh.name, v]), ...ev.chords.map((c) => [c.mesh.name, c]), ...(ev.pap ? [['Papillary', ev.pap]] : []),
    ...ev.skirts.map((k) => [`skirt_${k.sk.name}`, k])];
  const topo = {};
  for (const [name, md] of list()) {
    await save(`topo/${name}.idx`, Uint32Array.from(md.index));
    topo[name] = { count: md.count, tris: md.index.length / 3 };
  }
  const col = ev.myo.mesh.geometry.attributes.color, reg = new Uint8Array(ev.myo.count);
  for (let i = 0; i < ev.myo.count; i++) reg[i] = Math.round(col.getX(i) * 10);
  await save('topo/myo.reg', reg);
  const report = [];
  let geo = null;
  for (const f of frames) {
    const st = TC.stateAt(f.s, f.t, model.pheno.key);
    ev.setDisease(st.disease, shifts);
    ev.setMotion(st.motion);
    ev.valveHook = null;
    const c = cycleAt(f.t);
    ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
    for (const [name, md] of list()) await save(`${f.name}/${name}.pos`, md.pos);
    const R = TC.partsFor(ev, f.s, c);
    const out = {}, n = {};
    for (const part of R.parts) {
      // the echo views' smooth frame gives way to its struts
      if (part.kind === 'frame') continue;
      const name = `${part.kind}${n[part.kind] = (n[part.kind] ?? -1) + 1}`;
      out[name] = part.kind === 'wire' ? tube(part.pts, 0.045, 8) : { pos: Array.from(part.mesh.pos), idx: part.mesh.idx };
    }
    if (R.parts.some((p) => p.kind === 'frame')) out.struts = struts(R);
    if (st.pose.paced && st.pose.u >= 1) out.balloon = balloon(R);
    const parts = {};
    for (const [k, m] of Object.entries(out)) {
      if (!m.pos.length) continue;
      await save(`${f.name}/dev_${k}.pos`, Float32Array.from(m.pos));
      await save(`${f.name}/dev_${k}.idx`, Uint32Array.from(m.idx));
      parts[k] = m.pos.length / 3;
    }
    const apex = ev.anat.point('apex_endo', 0, c.s).toArray();
    report.push({ ...f, pose: st.pose, parts, hide: st.hide, overlap: { wallHits: 0, leafHits: 0 }, C: R.F.C, n: R.F.n, apex });
    geo = geo || { ch: CH, C: R.F.C, n: R.F.n, apex, av: ev.anat.point('av', 0, c.s).toArray(), mv: ev.anat.point('mv', 0, c.s).toArray() };
    document.getElementById('log').textContent = `frame ${f.name}`;
  }
  return { topo, report, geo };
}

window.__run = async (frames) => {
  if (CH === 'tavr') return runTavr(frames);
  const S = await scanner(), model = S.model;
  const shifts = await diseaseTargets(TC.DISEASES), mask = await lvMask();
  const ev = S.make(64, 64, 'a4c', { fill: true });
  ev.setView('a4c', { animate: false });
  const g = await TC.caseGeometry(model);
  const list = () => [['myo', ev.myo], ...ev.valves.map((v) => [v.mesh.name, v]), ...ev.chords.map((c) => [c.mesh.name, c]), ...(ev.pap ? [['Papillary', ev.pap]] : []),
    ...ev.skirts.map((k) => [`skirt_${k.sk.name}`, k])];
  // the topology, once
  const topo = {};
  for (const [name, md] of list()) {
    await save(`topo/${name}.idx`, Uint32Array.from(md.index));
    topo[name] = { count: md.count, tris: md.index.length / 3 };
  }
  const col = ev.myo.mesh.geometry.attributes.color, reg = new Uint8Array(ev.myo.count);
  for (let i = 0; i < ev.myo.count; i++) reg[i] = Math.round(col.getX(i) * 10);
  await save('topo/myo.reg', reg);
  const report = [];
  for (const f of frames) {
    const st = TC.stateAt(f.s, f.t, model.pheno.key);
    ev.setDisease(st.disease, shifts);
    ev.setMotion(st.motion);
    ev.setLvSys(st.lvK, mask);
    // the held leaflets on the clip's arms, as the chapter's panes put them
    ev.valveHook = TC.holdFor ? TC.holdFor(g, st.pose) : null;
    const c = cycleAt(f.t);
    ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
    for (const [name, md] of list()) await save(`${f.name}/${name}.pos`, md.pos);
    const D = TC.deviceFor(ev, g, st.pose);
    const parts = {};
    // the frame's own camera and timing, from the frames file (yaw, pitch, width, look), go to the manifest as they are
    for (const [k, m] of Object.entries(D.parts)) {
      if (!m.pos.length) continue;
      await save(`${f.name}/dev_${k}.pos`, Float32Array.from(m.pos));
      await save(`${f.name}/dev_${k}.idx`, Uint32Array.from(m.idx));
      parts[k] = m.pos.length / 3;
    }
    if (CH === 'mteer') {
      const { vm, sm } = TC.motionFor(ev, g);
      report.push({ ...f, pose: st.pose, parts, overlap: overlap(ev, g, D, st.pose), Q: vm.map(g.site.Q), C: vm.map(g.site.C), N: vm.dir(g.site.N), S: sm.map(g.punct.P), clipTop: D.clip ? D.clip.top : null });
    } else {
      const vm = TC.motionFor(ev, g);
      report.push({ ...f, pose: st.pose, parts, overlap: overlap(ev, g, D, st.pose), Q: vm.map(g.site.Q), Q0: vm.map(g.site.Q0), C: vm.map(g.site.C), N: vm.dir(g.site.N), tip: D.tip || null, clipTop: D.clip ? D.clip.top : null });
    }
    document.getElementById('log').textContent = `frame ${f.name}`;
  }
  const A = model.anat.normal(), P = (k) => A.point(k, 0, 0).toArray();
  const geo = {
    ch: CH, C: g.C.toArray(), N: g.N.toArray(), Q: g.Q.toArray(), Ac: g.Ac.toArray(), Bc: g.Bc.toArray(),
    apex: P('apex_endo'), av: P('av'), la: P('la_c'), ra: P('ra_c'), tv: P('tv'), mv: P('mv'), ivc: CM.CAVA.ivc, svc: CM.CAVA.svc,
    ...(CH === 'mteer' ? { S: g.S.toArray(), Nias: g.Nias.toArray() } : { Q0: g.Q0.toArray(), S0: g.S0.toArray() }),
  };
  return { topo, report, geo };
};
window.__ready = true;
