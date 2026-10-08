// Transesophageal echocardiography: the standard views of Hahn 2013 from a probe in the
// esophagus and the stomach, in two panes:
//  - left, the whole heart with the esophagus behind it (a tube), the probe at its level and its
//    imaging plane, which turns with the multiplane angle (gl/teeprobe3d.js, gl/fans.js);
//  - right, the echo image that the plane cuts from the same mesh, in the display convention of
//    Hahn 2013 (Figure 2): the transducer at the top; at 0 degrees the patient's right on the
//    left of the display; at 90 degrees the left of the display inferior; at 180 degrees the
//    mirror image of 0 degrees.
// Two switches and one slider: the level (upper esophageal, mid-esophageal, transgastric), the
// turn of the probe (left, neutral, right), and the multiplane angle, 0 to 180 degrees. Each
// standard view sits at one level, one turn and one angle (teeviews.js STD). Between two views of
// a level and turn, the probe moves from one view's position to the other's as the angle turns.
// A drag of the slider that stops near a view's angle snaps to it.
// Free probe: four more sliders move the probe from that pose (advance or withdraw along its path,
// turn, ante- or retroflex, flex to the side), and the multiplane angle then turns the plane alone.
import * as THREE from '../../vendor/three.bundle.min.js';
import { loadModel } from '../model3d.js';
import { sharedStage } from '../gl/shared.js';
import { Fan, rgb } from '../gl/fans.js';
import { TeeScene } from '../gl/teeprobe3d.js';
import { STD, LEVELS, slotViews, slotFrame, viewAt, planeAt, teeAnatomy, framesOf, probePath, maneuver, mixFrames, freeFrame, FACE } from '../teeviews.js';
import { reducedMotion } from '../state.js';
import { MONO } from '../sketch.js';

// What each view shows (Hahn 2013, Table 10: the structures imaged) and how the probe gets there
// (Table 10, the maneuver, and the text of each view). Angles in degrees.
const INFO = {
  me4c: { shows: 'LA, RA, atrial septum, LV, RV, ventricular septum, mitral valve (A3A2 and P2P1), tricuspid valve', move: 'Advance to the mitral valve; slight retroflexion may be needed to align the mitral valve and the LV apex' },
  memc: { shows: 'LA, coronary sinus, LV, mitral valve (P3-A3A2A1-P1), papillary muscles, chordae', move: 'From the four-chamber view, rotate forward to 50–70°' },
  me2c: { shows: 'LA, coronary sinus, LA appendage, LV, mitral valve (P3-A3A2A1)', move: 'Rotate forward to 80–100°' },
  melax: { shows: 'LA, LV, LVOT, RVOT, mitral valve (P2-A2), aortic valve, proximal ascending aorta', move: 'Rotate forward to 120–140°' },
  meavlax: { shows: 'LA, LVOT, RVOT, mitral valve (A2-P2), aortic valve, proximal ascending aorta', move: 'From the long-axis view, withdraw slightly at 120–140°; turn to the right to fine-tune' },
  measclax: { shows: 'Mid-ascending aorta, right pulmonary artery behind it', move: 'From the aortic valve long-axis view, withdraw, typically with backward rotation to 90–110°' },
  meascsax: { shows: 'Mid-ascending aorta in short axis, main pulmonary artery and its bifurcation, SVC', move: 'Rotate backward to 0–30° and turn to the right (clockwise)' },
  meavsax: { shows: 'Aortic valve, RA, LA, upper atrial septum, RVOT, pulmonic valve', move: 'Turn to the left to center the aorta, advance and rotate to 25–45°; slight anteflexion may be needed' },
  merv: { shows: 'Aortic valve, RA, LA, upper atrial septum, tricuspid valve, RVOT, pulmonic valve', move: 'From the aortic valve short-axis view, advance slightly and rotate to 50–70°' },
  mebicaval: { shows: 'LA, RA and its appendage, atrial septum, SVC, IVC', move: 'From the two-chamber view at 90–110°, turn to the right' },
  melaa: { shows: 'LA appendage, left upper pulmonary vein', move: 'From the two-chamber view at 90–110°, turn to the left; advancing or anteflexing the probe may open the appendage' },
  tgsax: { shows: 'LV at the mid level, both papillary muscles, RV at the mid level', move: 'Advance into the stomach and anteflex against the gastric wall; angle 0–20°' },
  tg2c: { shows: 'LV, mitral valve, LA and LA appendage', move: 'From the midpapillary view, rotate to 90–110°' },
  daosax: { shows: 'Descending aorta, left thorax, azygos and hemiazygos veins, intercostal arteries', move: 'From the transgastric views, turn to the left at 0–10° and withdraw to just above the diaphragm; with the aorta in the centre, withdraw further to image the whole descending thoracic aorta' },
  daolax: { shows: 'Descending aorta, left thorax', move: 'Rotate to 90–100°' },
  uearchlax: { shows: 'Aortic arch, innominate vein, mediastinal tissue', move: 'Withdraw along the descending aorta until it elongates, then turn to the right so the probe faces anterior' },
  uearchsax: { shows: 'Aortic arch, innominate vein, main pulmonary artery, pulmonic valve, mediastinal tissue', move: 'Rotate to 70–90°' },
};
// The views in the order of Hahn 2013 (its number): the tour and the [ and ] keys
const TOUR = [...STD].sort((a, b) => a.hahn - b.hahn);
// A slot of the switches with no standard view: what the guideline shows there
const EMPTY = {
  'ue|left': 'No standard view lies at this turn of the probe in the upper esophagus.',
  'tg|right': 'Turned to the right in the stomach, the plane passes through the RV (views 19, 20 and 23). The figure does not show these views.',
};
// the structures named on the echo image, when they lie in the plane (echo.js drawLabels)
const LABELS = [['la', 'LA'], ['ra', 'RA'], ['lv', 'LV'], ['rv', 'RV'], ['mv', 'MV'], ['tv', 'TV'], ['av', 'AV'], ['pv', 'PV'],
  ['ias', 'IAS'], ['lvot', 'LVOT'], ['rvot', 'RVOT'], ['teeLaa', 'LAA'], ['teeAsc', 'Asc Ao'], ['teeDesc', 'Desc Ao'], ['teeArch', 'Arch'], ['teeSvc', 'SVC'], ['teeIvc', 'IVC'], ['rpa', 'RPA'], ['mpa', 'PA']];
const SNAP = 6;          // degrees: a drag that stops this near a view's angle (or in its range) snaps to it
const JUMP = 700;        // ms: the probe moves to a new level or turn, or across a jump of the angle, in this time
const STEP_MAX = 8;      // degrees: a larger change of the angle at once is a jump; a smaller one shows at once
// the free probe's controls (cm, then degrees), and how far the probe moves at once before it is a
// jump (the button back to the view, a switch): beyond 1 cm or 10 degrees
const FREE_KEYS = ['teeAdv', 'teeRot', 'teeFlex', 'teeLat'];
const JUMP_CM = 1, JUMP_DEG = 10;
const cssVar = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

let stage = null, echo = null, model = null, ready = null, failed = false, fig = null, tick = 0;
let st = null, setState = null, on = false, scene3d = null, fan = null;
// the heart shown: its anatomy (teeviews.js), the views' probe frames, the probe's path
let G = null, frames = null, path = null, gVer = -1;
// the probe shown (frame, angle, depth), and a jump in progress: from the probe shown when it began,
// toward the controls, over JUMP ms of performance.now() (the clock of the chapter videos too)
let cur = null, move = null, lastKey = '', lastAng = null, lastNow = 0, lastT = null;

// ---------------------------------------------------------------- the views
/** The standard view the controls show, or null; and the slot's view nearest the angle. */
function viewOf(s) {
  const v = viewAt(s.teeLevel, s.teeTurn, s.teeAngle, 0.5);
  return moved(s) ? { on: null, near: v.near } : v;
}
/** The free probe away from the pose it started from: a control moved, or the angle turned alone. */
function moved(s) {
  return !!s.teeFree && (FREE_KEYS.some((k) => Math.abs(s[k]) > 1e-6) || Math.abs(s.teeAngle - s.teeBase) > 0.5);
}
/** The image depth at the angle: between the slot's two views, by angle (cm). */
function depthAt(level, turn, ang) {
  const L = slotViews(level, turn);
  if (!L.length) return slotViews(level, 'mid')[0].depth;
  if (ang <= L[0].angle) return L[0].depth;
  for (let i = 1; i < L.length; i++) {
    if (ang <= L[i].angle) {
      const k = (ang - L[i - 1].angle) / (L[i].angle - L[i - 1].angle);
      return L[i - 1].depth + (L[i].depth - L[i - 1].depth) * k;
    }
  }
  return L[L.length - 1].depth;
}

/** The anatomy of the heart shown: rebuilt when the Heart menu builds another heart. */
function anatomy() {
  const P = echo.heart;
  if (G && P.version === gVer) return;
  if (P.version !== echo.pv) echo.takePheno();
  gVer = P.version;
  G = teeAnatomy(echo);
  frames = framesOf(G);
  path = probePath(G);
  scene3d.setEsophagus(G.E);
  // the readouts give the probe's place in this heart: they render again
  setState({ teeGeo: `${P.key}:${P.version}` });
}

/** The probe frame and the plane the controls ask for, with the image depth. */
function target(s) {
  if (s.teeFree) {
    // the pose the controls gave at the angle where the probe was freed, moved by the free controls
    const base = slotFrame(frames, s.teeLevel, s.teeTurn, s.teeBase);
    // the Turn slider is positive to the right (clockwise), as it is drawn; freeFrame's turn to the left
    const f = freeFrame(base, path, { adv: s.teeAdv, rot: -s.teeRot, flex: s.teeFlex, lat: s.teeLat });
    return { f, ang: s.teeAngle, depth: depthAt(s.teeLevel, s.teeTurn, s.teeBase) };
  }
  const f = slotFrame(frames, s.teeLevel, s.teeTurn, s.teeAngle);
  return { f, ang: s.teeAngle, depth: depthAt(s.teeLevel, s.teeTurn, s.teeAngle) };
}
/** Two probe frames far enough apart that the probe should move between them, not jump. */
function far(a, b) {
  const deg = (x, y) => (Math.acos(Math.max(-1, Math.min(1, x.dot(y)))) * 180) / Math.PI;
  return a.O.distanceTo(b.O) > JUMP_CM || deg(a.F, b.F) > JUMP_DEG || deg(a.u, b.u) > JUMP_DEG;
}

// ---------------------------------------------------------------- echo labels
/**
 * Label points of the vessels on plane g: where each vessel's centre line (teeviews.js) meets the
 * plane, nearest the sector's centre line; for the arch, the middle of its vertices near the plane;
 * for the LA appendage, a point in its lumen.
 */
function vesselAnchors(g) {
  const out = {};
  const meet = (L) => {
    let best = null, bu = Infinity;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1].clone().sub(g.O).dot(g.n), b = L[i].clone().sub(g.O).dot(g.n);
      if (a * b > 0 || a === b) continue;
      const P = L[i - 1].clone().lerp(L[i], a / (a - b)), u = Math.abs(P.clone().sub(g.O).dot(g.r));
      if (u < bu) { bu = u; best = P; }
    }
    return best;
  };
  const pick = { teeAsc: G.asc, teeDesc: G.desc, teeSvc: G.svc, teeIvc: G.ivc };
  for (const [k, L] of Object.entries(pick)) { const P = meet(L); if (P) out[k] = P; }
  // the appendage: its label inside the lumen, 0.4 cm from its centre toward the mouth
  out.teeLaa = G.laa.c.clone().addScaledVector(G.laa.axis, -0.4);
  const near = G.archPts.filter((q) => Math.abs(q.clone().sub(g.O).dot(g.n)) < 0.5);
  if (near.length > 8) out.teeArch = near.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / near.length);
  return out;
}

// ---------------------------------------------------------------- the frame
function onFrame(stg) {
  if (!echo || !scene3d) return;
  anatomy();
  const now = performance.now();
  const T = target(st);
  // a new level, turn or heart, or a jump of the angle (a snap, a key, a step of the tour): the
  // probe moves there; a small change of the angle (a drag, a sweep) shows at once, and so does
  // everything after a gap in the frames (a hidden tab, or a chapter video drawn at one moment)
  const key = `${st.teeLevel}|${st.teeTurn}|${gVer}`, gap = now - lastNow > 250;
  if (gap) move = null;
  else if (cur && !reducedMotion && (key !== lastKey || Math.abs(st.teeAngle - lastAng) > STEP_MAX || (lastT && far(lastT.f, T.f)))) move = { from: cur, t0: now };
  lastKey = key;
  lastAng = st.teeAngle;
  lastNow = now;
  lastT = T;
  cur = T;
  if (move) {
    const u = Math.min(1, Math.max(0, (now - move.t0) / JUMP)), e = u * u * (3 - 2 * u), a = move.from;
    if (u >= 1) move = null;
    else cur = { f: mixFrames(a.f, T.f, e), ang: a.ang + (T.ang - a.ang) * e, depth: a.depth + (T.depth - a.depth) * e };
  }
  const g = planeAt(cur.f, cur.ang);
  const spec = specFor(st, cur);
  fan.shape(g, spec);
  fan.setRes(stage.pencil.w * stage.pencil.dpr, stage.pencil.h * stage.pencil.dpr);
  scene3d.setRes(stage.pencil.w * stage.pencil.dpr, stage.pencil.h * stage.pencil.dpr);
  // the shaft: the path from the mouth down to the probe's head
  const s = path.sOf(cur.f.O.clone().addScaledVector(cur.f.F, -FACE));
  scene3d.setProbe(cur.f, path.samples.filter((p, i) => (i / (path.samples.length - 1)) * path.length < s - 1.5));
  if (tick++ % 2) return;   // about 30 echo frames a second is enough
  const lab = fig.querySelector('#tee-label');
  if (lab && lab.offsetParent) echo.top = 32 + Math.max(10, lab.offsetHeight);
  echo.extraAnchors = vesselAnchors(g);
  echo.setGeometry(g, spec, { animate: false });
  echo.frame({ ...stg.state });
  angleIcon(cur.ang);
}

/** The echo settings for the probe shown: the sector, the depth, the labels and the name. */
function specFor(s, c) {
  const v = viewOf(s).on;
  const name = v ? v.short : moved(s) ? 'Free' : LEVELS.find((l) => l.key === s.teeLevel).short;
  return { angle: 90, depth: Math.round(c.depth * 2) / 2, near: 0.4, labels: LABELS, strict: true, short: `${name} · ${Math.round(c.ang)}°`, name: v ? v.name : 'TEE', win: 'psax' };
}

/**
 * The multiplane icon in the image's top right corner, after the Philips display: on a dark chip
 * (the machine's screen), a half circle open at the top with 0 at its left end and 180 at its
 * right, the angle above it, and a white needle from the centre that turns counterclockwise
 * (Hahn 2013): to the left at 0 degrees, down at 90, to the right at 180.
 */
function angleIcon(ang) {
  const m = echo.map;
  if (!m) return;
  const ctx = echo.ctx, dpr = echo.dpr;
  const r = 24, W = 2 * r + 24, H = r + 25;
  const x0 = echo.w - W - 6, y0 = m.top - 6, cx = x0 + W / 2, cy = y0 + 20;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05070a';
  ctx.beginPath();
  ctx.moveTo(x0 + 5, y0);
  ctx.arcTo(x0 + W, y0, x0 + W, y0 + H, 5);
  ctx.arcTo(x0 + W, y0 + H, x0, y0 + H, 5);
  ctx.arcTo(x0, y0 + H, x0, y0, 5);
  ctx.arcTo(x0, y0, x0 + W, y0, 5);
  ctx.closePath();
  ctx.fill();
  // the half circle: its diameter on top, the arc below
  ctx.strokeStyle = '#3a52b4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.stroke();
  // the needle: wide at the centre, pointed at the rim
  const a = (ang * Math.PI) / 180, dx = -Math.cos(a), dy = Math.sin(a), tip = r - 2, w = 2.4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + dx * tip, cy + dy * tip);
  ctx.lineTo(cx - dy * w, cy + dx * w);
  ctx.lineTo(cx + dy * w, cy - dx * w);
  ctx.closePath();
  ctx.fill();
  // the ends and the angle
  ctx.fillStyle = '#e8edf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 8px ${MONO}`;
  ctx.fillText('0', cx - r, cy - 4);
  ctx.fillText('180', cx + r, cy - 4);
  ctx.font = `700 12px ${MONO}`;
  ctx.fillText(String(Math.round(ang)), cx, cy - 4);
  ctx.restore();
}

// ---------------------------------------------------------------- the 3D pane
// the heart from the patient's left, a little from the front and above: the esophagus and the
// probe behind it, on the right of the pane, as in the guideline's three-dimensional figures
const CAM = { dir: new THREE.Vector3(-1, -0.2, -0.3).normalize(), up: new THREE.Vector3(0, 1, 0), dist: 3.0 };
function aim(instant = false) {
  if (!stage) return;
  // the middle of the scene: from the arch above to the stomach below, between heart and esophagus
  const t = stage.center.clone().add(new THREE.Vector3(0, -1.5, -0.5));
  // the scene is tall: a wide pane (a phone's) moves back so that the arch and the stomach show
  const aspect = stage.camera.aspect || 1;
  stage.view(CAM.dir, CAM.up, CAM.dist * Math.max(1, Math.min(1.5, aspect * 0.8)), t, instant);
}

function retheme3d() {
  if (fan) fan.setColor(rgb(cssVar('--accent') || '#2b5d8a'));
  if (scene3d) scene3d.setColor(rgb(cssVar('--flag-2') || '#d98a80'), rgb(cssVar('--ink') || '#22272b'));
}

function note(msg) {
  const n = fig && fig.querySelector('#tee-note');
  if (n) n.textContent = msg;
}

async function ensure() {
  if (failed) throw new Error('3D view unavailable');
  if (!ready) {
    ready = (async () => {
      model = await loadModel();
      const e = await import('../echo.js');
      stage = await sharedStage();
      // the echo draws on its own canvas: the 3D pane is this chapter's (no stage for the echo)
      echo = new e.EchoView(model, fig.querySelector('#tee-canvas'));
      echo.retheme();
      // the vessels' label points of the plane shown, beside the heart's own anchors
      const base = echo.anchors.bind(echo);
      echo.anchors = (s) => Object.assign(base(s), echo.extraAnchors || {});
      scene3d = new TeeScene(stage);
      const g0 = { O: new THREE.Vector3(), d: new THREE.Vector3(0, 0, 1), r: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 1, 0) };
      fan = new Fan(g0, { angle: 90, depth: 10 }, [0.2, 0.4, 0.6], stage.pencil.rtNormal.depthTexture);
      fan.probe.visible = false;   // the TEE probe is drawn in pencil (scene3d)
      fan.mat.uniforms.uAlpha.value = 0.2;
      fan.obj.visible = false;
      stage.overlayScene.add(fan.obj);
      retheme3d();
      return true;
    })().catch((err) => { failed = true; note('The 3D view could not be started on this device.'); throw err; });
  }
  return ready;
}

async function enter() {
  on = true;
  try { await ensure(); } catch (e) { return; }
  if (!on) return;
  stage.onError = (err) => note(`The 3D view stopped: ${String(err.message || err).slice(0, 120)}`);
  stage.attach(fig.querySelector('.pane-3d .gl-host'));
  stage.opts.beat = true;
  stage.opts.stillPhase = 0;
  stage.opts.labeled = false;
  stage.inset = null;
  stage.layer = null;
  stage.heart.group.visible = true;
  stage.heart.setPericardium(false);
  stage.heart.setCut(null);
  stage.resize();
  echo.resize();
  anatomy();
  cur = null;
  move = null;
  lastT = null;
  scene3d.show(true);
  fan.obj.visible = true;
  aim(true);
  stage.onFrame = onFrame;
  fig.classList.add('gl-ready');
  stage.start();
}

// ---------------------------------------------------------------- the slider's view bands
/** Under the slider: the guideline's angle range of each view of the slot, with its name. */
function paintViews(s) {
  const host = document.getElementById('tee-views');
  if (!host) return;
  const key = `${s.teeLevel}|${s.teeTurn}`;
  if (host.dataset.slot === key) return;
  host.dataset.slot = key;
  const L = slotViews(s.teeLevel, s.teeTurn);
  host.innerHTML = L.map((v) => {
    const a = v.range[0] / 180, b = Math.max(v.range[1], v.range[0] + 2) / 180;
    // the name centered on the view's angle, in a window 36 degrees wide
    const c0 = Math.max(0, Math.min(1 - 0.2, v.angle / 180 - 0.1));
    return `<i style="--a:${a.toFixed(4)};--w:${(b - a).toFixed(4)}" data-l="1"></i><span style="--a:${c0.toFixed(4)};--w:0.2">${v.short.replace(/^(ME|UE|TG) /, '')}</span>`;
  }).join('');
  host.hidden = !L.length;
}

/** A drag of the slider that stops within a view's range, or near its angle, snaps to the view. */
function bindSnap() {
  const el = document.getElementById('teeAngle');
  if (!el) return;
  let drag = false;
  el.addEventListener('pointerdown', () => { drag = true; });
  const snap = () => {
    if (!drag) return;
    drag = false;
    if (st.teeFree) return;   // a free probe's angle turns the plane alone
    const a = Number(el.value);
    const L = slotViews(st.teeLevel, st.teeTurn);
    const v = L.find((x) => Math.abs(x.angle - a) <= SNAP || (a >= x.range[0] && a <= x.range[1]));
    if (v && v.angle !== a) setState({ teeAngle: v.angle, playing: false, anim: false });
  };
  el.addEventListener('change', snap);
  el.addEventListener('pointerup', () => setTimeout(snap, 0));
}

// ---------------------------------------------------------------- the text
const levelName = (k) => LEVELS.find((l) => l.key === k).name;
/** Where the screen's right side points at angle a (Hahn 2013, Figure 2: the plane directed anteriorly from the esophagus). */
function display(a, level, turn) {
  if (level === 'tg' && turn === 'left') return 'Turned to the left above the diaphragm, the probe faces the left thoracic cavity, with the aorta in the near field.';
  if (level === 'tg') return 'In the stomach, the beam points up through the LV, and the transducer is at the top of the image.';
  if (a <= 20) return 'At this angle the patient’s right is on the left of the display.';
  if (a >= 160) return 'At this angle the patient’s left is on the left of the display: the mirror image of 0°.';
  if (a >= 70 && a <= 110) return 'At this angle the left of the display is inferior and the right is superior.';
  return a < 70 ? 'Between 0° and 90°, the right of the display turns from the patient’s left toward the head.' : 'Between 90° and 180°, the left of the display turns from the feet toward the patient’s left.';
}
/** The probe's place in the model against the four-chamber view: cm and degrees, in words. */
function placeText(s) {
  if (!frames || !path) return '';
  const f = target(s).f, f0 = frames.me4c;
  const m = maneuver(f, f0, path);
  const parts = [];
  const d = Math.round(m.depth * 2) / 2;
  // in the stomach the turn is not measured against the esophagus: the depth alone
  const stomach = path.sOf(f.O.clone().addScaledVector(f.F, -FACE)) > path.cardia;
  if (stomach) parts.push(`advanced ${d.toFixed(1)} cm into the stomach`);
  else if (Math.abs(d) >= 0.5) parts.push(d > 0 ? `advanced ${d.toFixed(1)} cm` : `withdrawn ${(-d).toFixed(1)} cm`);
  if (!stomach) {
    const t = Math.round(m.turn / 5) * 5;
    if (Math.abs(t) >= 5) parts.push(`turned ${Math.abs(t)}° to the ${t > 0 ? 'left' : 'right'}`);
  }
  return parts.length ? `${parts.join(', ')} from the four-chamber position` : 'at the four-chamber position';
}
/** The tip's flexion in the model (teeviews.js framesOf), for a view whose plane needs it. */
function flexText(v) {
  const f = frames && frames[v.pose ? v.key : v.frame];
  if (!f || f.lateral === undefined) return '';
  const lat = Math.round(f.lateral), ante = Math.round(f.ante), out = [];
  if (Math.abs(ante) >= 5) out.push(ante > 0 ? `anteflexed ${ante}°` : `retroflexed ${-ante}°`);
  if (Math.abs(lat) >= 5) out.push(`flexed ${Math.abs(lat)}° to the ${lat > 0 ? 'right' : 'left'}`);
  return out.join(' and ');
}

// ---------------------------------------------------------------- the free probe
/** The free probe's moves from the pose it started from, in words. */
function freeText(s) {
  const out = [], a = Math.round(s.teeAdv * 10) / 10, r = Math.round(s.teeRot), f = Math.round(s.teeFlex), l = Math.round(s.teeLat);
  if (a) out.push(a > 0 ? `advanced ${a.toFixed(1)} cm` : `withdrawn ${(-a).toFixed(1)} cm`);
  if (r) out.push(`turned ${Math.abs(r)}° to the ${r > 0 ? 'right' : 'left'}`);
  if (f) out.push(f > 0 ? `anteflexed ${f}°` : `retroflexed ${-f}°`);
  if (l) out.push(`flexed ${Math.abs(l)}° to the ${l > 0 ? 'right' : 'left'}`);
  return out.join(', ');
}
/**
 * The standard view nearest the plane the probe shows: the larger of the angles between the two
 * beams and between the two screen-rights, and the distance between the two transducers. On a
 * view within 2 degrees and 0.2 cm; near it within 15 degrees and 1.5 cm.
 */
function nearestView(s) {
  if (!frames || !path) return null;
  const g = planeAt(target(s).f, s.teeAngle);
  const deg = (x, y) => (Math.acos(Math.max(-1, Math.min(1, x.dot(y)))) * 180) / Math.PI;
  let best = null;
  for (const v of STD) {
    const h = planeAt(frames[v.key], v.angle);
    const d = Math.max(deg(g.d, h.d), deg(g.r, h.r)), cm = g.O.distanceTo(h.O), score = d + 10 * cm;
    if (!best || score < best.score) best = { v, deg: d, cm, score };
  }
  best.on = best.deg < 2 && best.cm < 0.2;
  best.near = best.deg < 15 && best.cm < 1.5;
  return best;
}
function nearText(nb) {
  if (!nb) return '';
  return nb.on ? `on ${nb.v.short}` : nb.near ? `near ${nb.v.short} · ${Math.round(nb.deg)}° · ${nb.cm.toFixed(1)} cm` : 'no standard view near';
}
/** The free probe's panel: shown with the probe free, with the standard view it is on or near. */
function paintFree(s) {
  const box = document.getElementById('tee-free');
  if (!box) return;
  box.hidden = !s.teeFree;
  if (!s.teeFree) return;
  const nb = nearestView(s);
  box.classList.toggle('is-on', !!(nb && nb.on));
  box.classList.toggle('is-near', !!(nb && nb.near && !nb.on));
  const out = document.getElementById('tee-free-state');
  if (out) out.textContent = nearText(nb);
}
const REST = { teeAdv: 0, teeRot: 0, teeFlex: 0, teeLat: 0 };
const signed = (v, d, unit) => { const r = Math.round(v * 10 ** d) / 10 ** d; return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}${unit}`; };
const side = (v, pos, neg) => { const r = Math.round(v); return r ? `${Math.abs(r)}° ${r > 0 ? pos : neg}` : '0°'; };

export default {
  key: 'tee',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  // in the part Views, after the transthoracic views (order.js)
  part: 'views',
  title: 'Transesophageal echocardiography',
  nav: 'TEE',
  dwell: 48,
  // teeGeo: the heart whose probe positions the readouts give (set when its anatomy is built)
  // teeFree: the probe moves freely from the pose the controls gave at teeBase (degrees), by the
  // free controls (FREE_KEYS); the angle then turns the plane alone
  defaults: { teeLevel: 'me', teeTurn: 'mid', teeAngle: 5, teeGeo: '', teeFree: false, teeBase: 5, ...REST },
  watch: ['teeLevel', 'teeTurn', 'teeAngle', 'teeGeo', 'pheno', 'teeFree', 'teeBase', ...FREE_KEYS],
  // the free controls: advance and anteflexion signed (− is a withdrawal, a retroflexion), the turn
  // and the side flex with their side (each slider is positive to the right)
  format: {
    teeAngle: (a) => `${a}°`,
    teeAdv: (v) => signed(v, 1, ' cm'),
    teeRot: (v) => side(v, 'right', 'left'),
    teeFlex: (v) => signed(v, 0, '°'),
    teeLat: (v) => side(v, 'right', 'left'),
  },
  figure(f) { fig = f; return null; },
  pulse: () => (stage ? stage.pulse() : null),
  init({ state, set }) {
    st = state;
    setState = set;
    fig = document.getElementById('fig-tee');   // warm() may run before the figure is first shown
    paintViews(state);
    bindSnap();
    paintFree(state);
    document.getElementById('tee-free-reset')?.addEventListener('click', () => set({ ...REST, teeAngle: st.teeBase, playing: false, anim: false }));
  },
  enter() { enter(); },
  leave() {
    on = false;
    if (scene3d) scene3d.show(false);
    if (fan) fan.obj.visible = false;
    if (stage) {
      stage.heart.setPericardium(true);
      if (stage.onFrame === onFrame) { stage.stop(); stage.onFrame = null; }
    }
  },
  warm() { ensure().catch(() => {}); },
  ready() { return failed || (on && stage && stage.running && stage.onFrame === onFrame); },
  resize() {
    if (!stage || !on) return;
    stage.resize();
    if (echo) echo.resize();
    aim(true);
  },
  retheme() {
    if (stage) stage.retheme();
    if (echo) echo.retheme();
    retheme3d();
  },
  onState(s, ch) {
    // freed or held again: the free controls start at rest from the pose at this angle; a new level
    // or turn takes the free probe there; Play holds the probe to the guided poses
    if ('teeFree' in ch || (s.teeFree && ('teeLevel' in ch || 'teeTurn' in ch))) setState({ teeBase: s.teeAngle, ...REST });
    if (s.teeFree && ((ch.playing && s.playing) || (ch.anim && s.anim))) setState({ teeFree: false });
    if (['teeFree', 'teeBase', 'teeAngle', 'teeLevel', 'teeTurn', 'teeGeo', 'chapter', ...FREE_KEYS].some((k) => k in ch)) paintFree(s);
    if ('teeLevel' in ch || 'teeTurn' in ch || 'chapter' in ch) paintViews(s);
    if (['teeLevel', 'teeTurn', 'teeAngle', 'chapter', 'teeFree', 'teeBase', ...FREE_KEYS].some((k) => k in ch)) {
      const lab = fig && fig.querySelector('#tee-label');
      const v = viewOf(s).on;
      if (lab) lab.textContent = v ? v.name : `${moved(s) ? 'Free probe' : levelName(s.teeLevel)} · ${s.teeAngle}°`;
    }
  },
  key_(k, set, s) {
    if (k !== '[' && k !== ']') return;
    // the views in the guideline's order; between views, the next one after the nearest
    const v = viewOf(s).on || viewOf(s).near || TOUR[0];
    const i = Math.max(0, TOUR.indexOf(v)), n = TOUR.length;
    const w = TOUR[(i + (k === ']' ? 1 : n - 1)) % n];
    set({ teeLevel: w.level, teeTurn: w.turn, teeAngle: w.angle, teeFree: false, playing: false });
  },
  tourEnter(set) { set({ teeLevel: 'me', teeTurn: 'mid', teeAngle: TOUR[0].angle, teeFree: false }); },
  // each view for an equal share of the dwell; when the next view lies at the same level and
  // turn, the angle turns to it in the last third of the share
  tourTick(tt, set) {
    const n = TOUR.length, step = this.dwell / n;
    const i = Math.min(n - 1, Math.floor(tt / step)), v = TOUR[i], w = TOUR[i + 1];
    const u = Math.min(1, Math.max(0, (tt - i * step) / step));
    let ang = v.angle;
    if (w && w.level === v.level && w.turn === v.turn && u > 2 / 3) {
      const k = (u - 2 / 3) * 3;
      ang = Math.round(v.angle + (w.angle - v.angle) * k * k * (3 - 2 * k));
    }
    set({ teeLevel: v.level, teeTurn: v.turn, teeAngle: ang });
  },
  // the time of the tour at which tourTick shows this view (its inverse); none between views
  tourAt(s) {
    const v = viewOf(s).on;
    const i = v ? TOUR.indexOf(v) : -1;
    return i < 0 ? undefined : ((i + 0.01) * this.dwell) / TOUR.length;
  },
  text(s, { cite }) {
    const { on: v, near } = viewOf(s);
    const key = `${s.teeLevel}|${s.teeTurn}`;
    const readouts = [];
    if (v) {
      readouts.push({ k: 'View', v: `${v.name} (Hahn view ${v.hahn}${v.reeves ? '; one of the 11 basic views' : ''})`, text: true });
      readouts.push({ k: 'Level and angle', v: `${levelName(v.level)}, ${v.angle}° (guideline ${v.range[0]}–${v.range[1]}°)`, text: true });
      readouts.push({ k: 'Probe movement (guideline)', v: INFO[v.key].move, text: true });
      readouts.push({ k: 'Shows', v: INFO[v.key].shows, text: true });
    } else if (moved(s)) {
      const nb = nearestView(s), t = nearText(nb);
      readouts.push({ k: 'View', v: `Free probe${t ? `, ${t}` : ''}`, text: true });
      // the level is where the probe now lies, which "Probe in the model" gives: the angle alone here
      readouts.push({ k: 'Angle', v: `${s.teeAngle}°`, text: true });
      const b = viewAt(s.teeLevel, s.teeTurn, s.teeBase, 0.5).on, from = `the ${b ? `${b.short} ` : ''}position at ${s.teeBase}°`;
      const moves = freeText(s);
      readouts.push({ k: 'Free probe', v: moves ? `${moves.replace(/^./, (c) => c.toUpperCase())} from ${from}` : `Not moved from ${from}`, text: true });
    } else {
      readouts.push({ k: 'View', v: near ? `No standard view; nearest ${near.short} at ${near.angle}°` : 'No standard view at this turn', text: true });
      readouts.push({ k: 'Level and angle', v: `${levelName(s.teeLevel)}, ${s.teeAngle}°`, text: true });
    }
    const place = placeText(s);
    if (place) readouts.push({ k: 'Probe in the model', v: place.charAt(0).toUpperCase() + place.slice(1), text: true });
    let live = '';
    if (v) {
      live = `<b>${v.name}.</b> ${display(v.angle, v.level, v.turn)} `;
      const flex = flexText(v);
      if (flex && v.key === 'me4c') live += `To show this heart’s four-chamber plane at ${v.angle}°, the model’s probe is ${flex}. The guideline notes that slight retroflexion may be needed. `;
    } else if (moved(s)) {
      // the orientation at this angle holds wherever the free probe lies
      live = `<b>Free probe, ${s.teeAngle}°.</b> ${display(s.teeAngle, 'me', 'mid')} The multiplane angle turns the plane about the beam, and the probe stays where it is. `;
    } else {
      live = `<b>${levelName(s.teeLevel)}, ${s.teeAngle}°.</b> ${display(s.teeAngle, s.teeLevel, s.teeTurn)} `;
      if (EMPTY[key]) live += `${EMPTY[key]} `;
    }
    live += `<span class="note">Views, angles and probe movements as in the ASE/SCA guideline${cite('hahn2013')}; the basic examination of 11 views${cite('reeves2013')}.</span>`;
    return { readouts, live };
  },
};

