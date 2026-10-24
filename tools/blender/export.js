// The heart and the device of chapter M-TEER, as Blender reads them (tools/blender/export.mjs
// runs this page). For each frame { name, s, t }: the chapter's state at step position s and time
// t (ms in the beat), the morphed meshes in world cm (glTF frame: x to the patient's left, y to
// the head, z to the front), the device's parts, and an overlap check of the device against the
// walls and the leaflets. The topology (indices, the myocardium's regions) goes once.
import * as THREE from '../../vendor/three.bundle.min.js';
import { diseaseTargets, lvMask } from '../../src/model3d.js';
import { scanner } from '../../src/scanner.js';
import { cycleAt } from '../../src/cyclemodel.js';
import * as TC from '../../src/ch/mteer.js';
import * as CM from '../../src/gl/clipmesh.js';

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
  const myo = grid(ev.myo.pos), mv = ev.valves.find((v) => v.mesh.name === 'MitralValve');
  const leaf = grid(mv.pos, 0.2);
  const { sm } = TC.motionFor(ev, g);
  // the crossing: round the septum's site in this frame (a tent moves it toward the LA) and at rest
  const S = sm.map(g.punct.P), S0 = g.S.toArray();
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

window.__run = async (frames) => {
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
    ev.valveHook = TC.holdFor(g, st.pose);
    const c = cycleAt(f.t);
    ev.frame({ s: c.s, v: c.v, drive: c.drive, phase: c.phase, t: c.t });
    for (const [name, md] of list()) await save(`${f.name}/${name}.pos`, md.pos);
    const D = TC.deviceFor(ev, g, st.pose);
    const parts = {};
    for (const [k, m] of Object.entries(D.parts)) {
      if (!m.pos.length) continue;
      await save(`${f.name}/dev_${k}.pos`, Float32Array.from(m.pos));
      await save(`${f.name}/dev_${k}.idx`, Uint32Array.from(m.idx));
      parts[k] = m.pos.length / 3;
    }
    const { vm, sm } = TC.motionFor(ev, g);
    report.push({ ...f, pose: st.pose, parts, overlap: overlap(ev, g, D, st.pose), Q: vm.map(g.site.Q), C: vm.map(g.site.C), N: vm.dir(g.site.N), S: sm.map(g.punct.P), clipTop: D.clip ? D.clip.top : null });
    document.getElementById('log').textContent = `frame ${f.name}`;
  }
  const A = model.anat.normal(), P = (k) => A.point(k, 0, 0).toArray();
  const geo = {
    C: g.C.toArray(), N: g.N.toArray(), Q: g.Q.toArray(), Ac: g.Ac.toArray(), Bc: g.Bc.toArray(), S: g.S.toArray(), Nias: g.Nias.toArray(),
    apex: P('apex_endo'), av: P('av'), la: P('la_c'), ra: P('ra_c'), tv: P('tv'), ivc: CM.CAVA.ivc, svc: CM.CAVA.svc,
  };
  return { topo, report, geo };
};
window.__ready = true;
