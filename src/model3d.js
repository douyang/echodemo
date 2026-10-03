// One copy of the heart model for the page: the 3D stage and the offscreen scanner share it.
import { PHENOS } from './pheno.js';

let modelP = null;

export function loadModel() {
  if (!modelP) {
    modelP = (async () => {
      const [{ loadHeart, Anatomy, turnValve }, { bendPA }, RVD, doc] = await Promise.all([
        import('./gl/heart.js'),
        import('./gl/pabend.js'),
        import('./gl/rvdetail.js'),
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
      // The model's pulmonary trunk rises steeply from its valve; re-shaped, it runs back round
      // the left side of the aorta, as in the great-vessel short axis (gl/pabend.js).
      // The left pulmonary veins' shared mouth is pressed into the line of the atrial wall in the
      // four-chamber plane (the mesh carries the veins' course), the papillary muscles stay inside
      // the heart, and the RV gets its trabeculations (gl/rvdetail.js).
      const prepare = (meshes) => {
        if (meshes.AorticValve) turnValve(meshes.AorticValve, anat.point('av', 0, 0), anat.aorticRoot, 60);
        bendPA(meshes, anat.point('pv', 0, 0));
        RVD.seatLeftVeins(meshes, anat, { bend: false });
        RVD.trabeculate(meshes, anat);
        RVD.holdPapillary(meshes);
      };
      const heart = await loadHeart('assets/heart.json', { valves: 'assets/valves.json', prepare });
      const m = { heart, anat, doc, pheno: { key: 'normal', a: 0, mesh: null, version: 0 }, sizes: normalGeo(doc), built: {} };
      await applyPheno(m);
      return m;
    })();
  }
  return modelP;
}

// ---------------------------------------------------------------- the heart shown
let wanted = 'normal';
const listeners = new Set(), busyFns = new Set();
/** fn(model) runs each time the model takes a new heart. */
export function onPheno(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** fn(true) runs when a disease heart starts to build (a few seconds, once), fn(false) when it is done. */
export function onPhenoBusy(fn) { busyFns.add(fn); return () => busyFns.delete(fn); }

/** Show heart key (pheno.js). A loaded model takes it now; a model still to load takes it then. */
export function setPheno(key) {
  wanted = PHENOS[key] ? key : 'normal';
  if (modelP) modelP.then(applyPheno).catch(() => {});
}

let applying = Promise.resolve();
function applyPheno(m) {
  applying = applying.then(() => take(m)).catch((err) => console.error('heart change failed:', err));
  return applying;
}
async function take(m) {
  const key = wanted, P = PHENOS[key];
  if (m.pheno.key === key) return;
  let shape = null;
  if (P.mesh) {
    if (!m.built[P.mesh]) {
      for (const fn of busyFns) fn(true);
      try { m.built[P.mesh] = await buildShape(m, P.mesh); } finally { for (const fn of busyFns) fn(false); }
    }
    shape = m.built[P.mesh];
  }
  m.pheno = { key, a: P.a, mesh: P.mesh, version: m.pheno.version + 1 };
  m.heart.pheno = m.pheno;
  m.anat.pheno = key === 'normal' ? null : { a: P.a, landmark: shape ? shape.landmark : null };
  m.sizes = shape ? shape.sizes : key === 'amyloid' ? cornerGeo(m.doc, 'amyloid') : normalGeo(m.doc);
  for (const fn of listeners) fn(m);
}

/** A disease heart's targets on every mesh (phenomesh.js), built the first time it is shown. */
let fields = null;
async function buildShape(m, mesh) {
  const [PM, E, { apicalTurn }, { VESSELS }] = await Promise.all([import('./gl/phenomesh.js'), import('./echo.js'), import('./aha.js'), import('./views.js')]);
  // let the page draw the busy Heart menu before the long computation below
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (!fields) {
    const A = m.anat.normal();
    const geoms = Object.fromEntries(['a4c', 'a2c', 'a3c'].map((k) => [k, E.viewGeometry(A, k)]));
    fields = PM.preparePhenotypes(m.heart.meshes, m.anat, apicalTurn(A, geoms), VESSELS);
  }
  const shape = PM.buildPhenotype(fields, mesh);
  shape.sizes = { ...normalGeo(m.doc), ...(PM.MESH[mesh].sizes || {}) };
  return shape;
}

/** Normal-heart wall and cavity sizes measured on the mesh (mm), for label anchors. */
export function normalGeo(doc) { return cornerGeo(doc, 'normal'); }
function cornerGeo(doc, which) {
  const ed = doc.corners[`${which}_ed`].measurements, es = doc.corners[`${which}_es`].measurements;
  return { ivs: ed.ivs, pw: ed.pw, lvid: ed.lvid, lvids: es.lvid, effusion: ed.peri_gap, rvWall: ed.rv_wall };
}

/** Cardiac-cycle drive for the mesh: systole weight s and valve drive, from the cycle model. */
export function meshState(cyc) {
  return { a: 0, s: cyc.s, v: cyc.v, phase: cyc.phase, drive: cyc.drive };
}
