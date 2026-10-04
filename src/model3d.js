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
      // The papillary muscles stay inside the heart, and the RV gets its trabeculations
      // (gl/rvdetail.js). The left pulmonary veins need no change: the mesh brings the lower one
      // into the back of the atrium, clear of the four-chamber planes, so RVD.seatLeftVeins is not
      // called.
      const prepare = (meshes) => {
        if (meshes.AorticValve) turnValve(meshes.AorticValve, anat.point('av', 0, 0), anat.aorticRoot, 60);
        bendPA(meshes, anat.point('pv', 0, 0));
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

/** What every built shape needs (phenomesh.js preparePhenotypes), found once: a disease heart and a chapter's disease may ask together. */
let fieldsP = null;
function fieldsOf(m, PM, E, apicalTurn, VESSELS) {
  if (!fieldsP) {
    const A = m.anat.normal();
    const geoms = Object.fromEntries(['a4c', 'a2c', 'a3c'].map((k) => [k, E.viewGeometry(A, k)]));
    fieldsP = PM.preparePhenotypes(m.heart.meshes, m.anat, apicalTurn(A, geoms), VESSELS);
  }
  return fieldsP;
}
/** A disease heart's targets on every mesh (phenomesh.js), built the first time it is shown. */
async function buildShape(m, mesh) {
  const [PM, E, { apicalTurn }, { VESSELS }] = await Promise.all([import('./gl/phenomesh.js'), import('./echo.js'), import('./aha.js'), import('./views.js')]);
  // let the page draw the busy Heart menu before the long computation below
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const shape = await PM.buildPhenotype(await fieldsOf(m, PM, E, apicalTurn, VESSELS), mesh);
  shape.sizes = { ...normalGeo(m.doc), ...(PM.MESH[mesh].sizes || {}) };
  return shape;
}

/**
 * A chapter's disease targets (phenomesh.js DISEASE), built on every mesh the first time a
 * chapter asks for them; the echo views weight them (echo.js setDisease). Resolves to
 * { key: { shift(name) } }, the move of each landmark at weight 1. The chapter's panel shows the
 * wait; the Heart menu does not, as its heart does not change.
 */
const diseases = {};
export async function diseaseTargets(keys) {
  const m = await loadModel();
  for (const k of keys) if (!diseases[k]) diseases[k] = buildDisease(m, k);
  const built = await Promise.all(keys.map((k) => diseases[k]));
  return Object.fromEntries(keys.map((k, i) => [k, built[i]]));
}
async function buildDisease(m, key) {
  const [PM, E, { apicalTurn }, { VESSELS }] = await Promise.all([import('./gl/phenomesh.js'), import('./echo.js'), import('./aha.js'), import('./views.js')]);
  return PM.buildDisease(await fieldsOf(m, PM, E, apicalTurn, VESSELS), key);
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
