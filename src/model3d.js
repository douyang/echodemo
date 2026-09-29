// One copy of the heart model for the page: the 3D stage and the offscreen scanner share it.
let modelP = null;

export function loadModel() {
  if (!modelP) {
    modelP = (async () => {
      const [{ loadHeart, Anatomy }, doc] = await Promise.all([
        import('./gl/heart.js'),
        fetch('assets/anatomy.json').then((r) => {
          if (!r.ok) throw new Error(`anatomy: HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      const heart = await loadHeart('assets/heart.json', { valves: 'assets/valves.json' });
      return { heart, anat: new Anatomy(doc), doc };
    })();
  }
  return modelP;
}

/** Normal-heart wall and cavity sizes measured on the mesh (mm), for label anchors. */
export function normalGeo(doc) {
  const ed = doc.corners.normal_ed.measurements, es = doc.corners.normal_es.measurements;
  return { ivs: ed.ivs, pw: ed.pw, lvid: ed.lvid, lvids: es.lvid, effusion: ed.peri_gap, rvWall: ed.rv_wall };
}

/** Cardiac-cycle drive for the mesh: systole weight s and valve drive, from the cycle model. */
export function meshState(cyc) {
  return { a: 0, s: cyc.s, v: cyc.v, phase: cyc.phase, drive: cyc.drive };
}
