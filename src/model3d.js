// One copy of the heart model for the page: the 3D stage and the offscreen scanner share it.
let modelP = null;

export function loadModel() {
  if (!modelP) {
    modelP = (async () => {
      const [{ loadHeart, Anatomy, turnValve }, doc] = await Promise.all([
        import('./gl/heart.js'),
        fetch('assets/anatomy.json').then((r) => {
          if (!r.ok) throw new Error(`anatomy: HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      const anat = new Anatomy(doc);
      // The valve model sets the aortic cusps 60 degrees round from where a heart has them: its
      // commissures face the coronary origins. Turned, the right coronary cusp faces the RV
      // outflow tract, the left and non-coronary cusps lie behind it on the left and the right,
      // and each coronary artery leaves its own sinus (ASE 2019, Table 2.9).
      const prepare = (meshes) => {
        if (meshes.AorticValve) turnValve(meshes.AorticValve, anat.point('av', 0, 0), anat.aorticRoot, 60);
      };
      const heart = await loadHeart('assets/heart.json', { valves: 'assets/valves.json', prepare });
      return { heart, anat, doc };
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
