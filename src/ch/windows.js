// 07 Windows: the canonical 2D views. Each view is a plane through the heart: left, the 3D
// heart with the sector; right, the echo image that plane cuts from the same mesh.
import { VIEWS, WINDOWS, ORDER, SHORT, MOVE } from '../views.js';
import { loadModel } from '../model3d.js';
import { sharedStage } from '../gl/shared.js';
import { Labels } from '../gl/stage3d.js';

// What each view shows and what is measured there (ASE 2019, Tables 2.1-2.27 and Section IV).
const INFO = {
  plax: { shows: 'LA, mitral valve, LV, LVOT, aortic valve, septum, RV', acquire: 'Septum, LV diameter and inferolateral wall at end-diastole; LV diameter at end-systole; proximal RVOT; LA diameter' },
  plax_deep: { shows: 'Pericardial and pleural spaces behind the heart', acquire: 'Screen for pericardial and pleural effusion' },
  plax_avmv: { shows: 'Two aortic cusps and both mitral leaflets', acquire: 'Leaflet motion of both valves' },
  plax_av: { shows: 'Aortic valve, LVOT, proximal ascending aorta', acquire: 'Annulus and LVOT diameters in mid-systole; color on the aortic valve' },
  plax_mv: { shows: 'Mitral leaflets, chordae and annulus; LA; LV inflow', acquire: 'Leaflet anatomy and motion; color on the mitral valve' },
  plax_asc: { shows: 'Sinuses, sinotubular junction, tubular ascending aorta', acquire: 'Aortic diameters at end-diastole; color' },
  rv_in: { shows: 'RA, tricuspid valve, RV; IVC and coronary sinus in some', acquire: 'TR color; TR peak velocity by CW' },
  rv_out: { shows: 'RVOT, pulmonic valve, main PA', acquire: 'RVOT PW; pulmonic valve CW; color' },
  psax_av: { shows: 'Aortic valve, LA, RA, tricuspid valve, RVOT, pulmonic valve, atrial septum', acquire: 'Proximal and distal RVOT; TR color and CW' },
  psax_pa: { shows: 'Aorta above the valve, RA, RVOT, pulmonic valve, main PA and branches', acquire: 'Main PA diameter; RVOT PW; pulmonic CW; PR end-diastolic velocity' },
  psax_tv: { shows: 'RA, tricuspid valve, RV inflow, high septum', acquire: 'Tricuspid color; TR CW' },
  psax_avz: { shows: 'Aortic cusps: non-, right and left coronary', acquire: 'Cusp number and motion; color' },
  psax_cor: { shows: 'Aortic root; origins of the left main and right coronary arteries', acquire: 'Where each coronary artery arises (anomalous origin)' },
  psax_mv: { shows: 'RV, septum, both mitral leaflets, LV', acquire: 'Leaflet excursion; basal wall motion; mitral color' },
  psax_pm: { shows: 'RV, septum, papillary muscles, LV', acquire: 'Global and regional LV function' },
  psax_ap: { shows: 'LV apex', acquire: 'Apical wall motion' },
  a4c: { shows: 'LA, mitral valve, LV, septum, RV, tricuspid valve, RA, atrial septum', acquire: 'LV and LA volumes (with A2C); mitral inflow; tissue Doppler; TR CW; pulmonary vein flow' },
  a4c_lv: { shows: 'LV, mitral apparatus, part of the LA', acquire: 'Biplane LV volumes (with A2C); wall motion; strain' },
  a4c_rv: { shows: 'RA, tricuspid valve, RV, LA, LV', acquire: 'RV diameters and areas; TAPSE; tricuspid annular S′; TR CW' },
  a4c_la: { shows: 'Pulmonary veins, LA, mitral valve, LV, RA, tricuspid valve, RV', acquire: 'LA volume at end-systole; RA volume; pulmonary vein flow' },
  a4c_mv: { shows: 'Mitral valve', acquire: 'Leaflet anatomy; mitral color; MR CW' },
  a4c_tv: { shows: 'Tricuspid leaflets and annulus', acquire: 'Leaflet anatomy and coaptation; TR color' },
  a4c_apex: { shows: 'LV apex', acquire: 'Apical wall motion; apical thrombus' },
  a5c: { shows: 'LA, mitral valve, LV, septum, LVOT, aortic valve, proximal aorta, RA, RV', acquire: 'LVOT PW about 5 mm below the valve; aortic valve CW; AR CW' },
  a2c: { shows: 'LV, mitral valve, LA; coronary sinus and LA appendage in some', acquire: 'LA volume; biplane LV volumes; mitral color' },
  a2c_lv: { shows: 'LV', acquire: 'Biplane LV volumes (with A4C)' },
  a3c: { shows: 'LA, mitral valve, LV, LVOT, aortic valve, aorta', acquire: 'Color on the mitral valve, LVOT and aortic valve; LVOT PW and aortic CW; AR and MR CW' },
  a3c_lv: { shows: 'LV', acquire: 'Wall motion; strain' },
  a3c_av: { shows: 'Aortic valve, LVOT, proximal aorta', acquire: 'Aortic valve and LVOT color' },
  sc4c: { shows: 'Liver, LV, mitral valve, RV, tricuspid valve, both septa, RA, LA', acquire: 'RV free wall thickness; septal defects; color on the atrial septum' },
  sc4c_ias: { shows: 'Atrial septum, square to the beam', acquire: 'Septal defects and color across the septum' },
  sc_ivc: { shows: 'IVC in long axis through the liver, hepatic veins, IVC–RA junction', acquire: 'IVC diameter 1 to 2 cm from the RA and its collapse; hepatic vein PW' },
  sc_aorta: { shows: 'Upper abdominal aorta behind the liver, celiac trunk, SMA', acquire: 'Color and PW of aortic flow (appendix view)' },
  ssn: { shows: 'Ascending aorta, arch, descending aorta, head vessels, right PA', acquire: 'Arch color; ascending and descending aorta PW; descending aorta CW' },
  ssn_sax: { shows: 'Arch in cross-section, right PA along its length, LA', acquire: 'Right PA size; LA and the pulmonary veins' },
};
const WIN_KEYS = WINDOWS.map((w) => w.key);

let stage = null, echo = null, ready = null, failed = false, fig = null, tick = 0, labels = null;
let st = null, setState = null, lastMeas = '', on = false;

function note(msg) {
  const n = fig && fig.querySelector('#windows-note');
  if (n) n.textContent = msg;
}

function fillViewRow(win) {
  const seg = document.getElementById('view-seg');
  if (!seg || seg.dataset.win === win) return;
  seg.dataset.win = win;
  seg.innerHTML = ORDER[win].map((k) => `<button type="button" data-val="${k}" aria-pressed="${String(st.view === k)}">${SHORT[k]}</button>`).join('');
}

async function ensure() {
  if (failed) throw new Error('3D view unavailable');
  if (!ready) {
    ready = (async () => {
      const model = await loadModel();
      const e = await import('../echo.js');
      stage = await sharedStage();
      echo = new e.EchoView(model, fig.querySelector('#windows-canvas'), { stage });
      echo.showOverlay(false);
      echo.top = 42;
      echo.retheme();
      labels = new Labels(fig.querySelector('#windows-overlay'));
      return true;
    })().catch((err) => { failed = true; note('This device could not start the 3D view.'); throw err; });
  }
  return ready;
}

/** Tags for the cross-section, in columns beside the sector. */
function sectionTags(stg) {
  if (!labels) return;
  if (st.wbody || !st.wlabels) { labels.update([], null, 1, 1); return; }
  const host = fig.querySelector('.pane-3d').getBoundingClientRect();
  // the pane's name and its note stay clear of the tags
  const keep = ['#windows-3dlabel', '#windows-note'].map((q) => fig.querySelector(q)).filter((e) => e && e.offsetParent).map((e) => {
    const r = e.getBoundingClientRect();
    return { x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top };
  });
  labels.update(echo.sectionLabels(stg.state.s), echo.sectorBox(), host.width, host.height, keep);
}

function onFrame(stg) {
  if (!echo) return;
  sectionTags(stg);
  if (tick++ % 2) return;   // about 30 frames a second is enough for the echo
  // the scanner line sits under the view's name, which takes two lines on a phone
  const lab = fig.querySelector('#windows-label');
  if (lab && lab.offsetParent) echo.top = 32 + Math.max(10, lab.offsetHeight);
  echo.labels = false;      // the labels name the structures on the model, not on the echo
  echo.calipers = !st.wcine;
  echo.frame({ ...stg.state });
  const m = echo.measure;
  const key = m && m.lvid ? `${m.ivs.toFixed(1)}/${m.lvid.toFixed(1)}/${m.pw.toFixed(1)}` : '';
  if (key !== lastMeas) { lastMeas = key; setState({ wmeas: key }); }
}

async function enter() {
  on = true;
  try { await ensure(); } catch (e) { return; }
  if (!on) return;
  stage.onError = (err) => note(`The 3D view stopped: ${String(err.message || err).slice(0, 120)}`);
  stage.attach(fig.querySelector('.gl-host'));
  stage.opts.beat = st.wcine;
  stage.opts.stillPhase = 0;
  stage.heart.group.visible = true;
  stage.heart.setPericardium(true);
  echo.showOverlay(true);
  echo.section = true;
  echo.setView(st.view);
  echo.setBody(st.wbody);
  stage.onFrame = onFrame;
  fig.classList.add('gl-ready');
  stage.resize();
  echo.resize();
  stage.start();
}

export default {
  key: 'windows',
  part: 'views',
  title: 'Windows',
  dwell: 30,
  // wcine: the beat runs all the time (no control); off, the PLAX calipers would show
  defaults: { win: 'plax', view: 'plax', wcine: true, wlabels: true, wbody: false, wmeas: '' },
  watch: ['win', 'view', 'wcine', 'wlabels', 'wbody', 'wmeas'],
  figure(f) { fig = f; return null; },
  init({ state, set }) {
    st = state;
    setState = set;
    fig = document.getElementById('fig-windows');   // warm() may run before the figure is first shown
    fillViewRow(state.win);
  },
  enter() { enter(); },
  leave() {
    on = false;
    if (labels) labels.update([], null, 1, 1);
    if (stage) { stage.opts.labeled = false; stage.inset = null; }   // the stage is shared with 08 Planes
    if (echo) echo.showOverlay(false);
    if (stage && stage.onFrame === onFrame) { stage.stop(); stage.onFrame = null; }
  },
  warm() { ensure().catch(() => {}); },
  ready() { return failed || (on && stage && stage.running && stage.onFrame === onFrame); },
  resize() {
    if (!stage) return;
    stage.resize();
    if (echo) { echo.resize(); echo.setView(st.view); }
  },
  retheme() { if (stage) stage.retheme(); if (echo) echo.retheme(); },
  onState(s, ch) {
    if ('win' in ch) {
      fillViewRow(s.win);
      if (VIEWS[s.view].win !== s.win) { setState({ view: ORDER[s.win][0] }); return; }
    }
    if ('view' in ch && VIEWS[s.view].win !== s.win) { setState({ win: VIEWS[s.view].win }); return; }
    if ('view' in ch || 'chapter' in ch) {
      const lab = fig && fig.querySelector('#windows-label');
      if (lab) lab.textContent = VIEWS[s.view].name;
    }
    if ('wbody' in ch || 'chapter' in ch) {
      const l3 = fig && fig.querySelector('#windows-3dlabel');
      if (l3) l3.textContent = s.wbody ? 'Probe and body' : 'Cross-section';
    }
    if (!stage || !echo || !on) return;
    if ('view' in ch) echo.setView(s.view);
    if ('wbody' in ch) echo.setBody(s.wbody);
    if ('wcine' in ch) stage.opts.beat = s.wcine;
  },
  key_(k, set, s) {
    if (k !== '[' && k !== ']') return;
    // every view in one row, window by window: past a window's last view comes the next
    // window's first, and past the last window the first again
    const all = WIN_KEYS.flatMap((w) => ORDER[w]);
    const i = all.indexOf(s.view), n = all.length;
    const v = all[(i + (k === ']' ? 1 : n - 1)) % n];
    set({ win: VIEWS[v].win, view: v, playing: false });
  },
  tourEnter(set) { set({ win: 'plax', view: 'plax', wcine: true }); },
  tourTick(tt, set) {
    const seq = ['plax', 'plax_av', 'rv_in', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a4c_rv', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'ssn'];
    const v = seq[Math.min(seq.length - 1, Math.floor(tt / (this.dwell / seq.length)))];
    set({ win: VIEWS[v].win, view: v });
  },
  text(s, { cite }) {
    const v = VIEWS[s.view], info = INFO[s.view];
    const m = echo && echo.measure && echo.measure.lvid ? echo.measure : null;
    const readouts = [
      { k: 'How to get there', v: MOVE[s.view], text: true },
      { k: 'Shows', v: info.shows, text: true },
      { k: 'Acquire here', v: info.acquire, text: true },
    ];
    let live = `<b>${v.name}.</b> `;
    if (!v.plane) live += 'The heart model ends at the diaphragm, so this view has no slice here. ';
    else if (s.view === 'plax' && m && !s.wcine) live += `Calipers at end-diastole, square to the long axis: septum ${(m.ivs / 10).toFixed(1)} cm, cavity ${(m.lvid / 10).toFixed(1)} cm, inferolateral wall ${(m.pw / 10).toFixed(1)} cm. `;
    else if (v.zoom) live += `A ${v.zoom.w} cm box, magnified. `;
    live += `<span class="note">Views and measurements: ASE${cite('mitchell2019')}. Lab class: ${v.lab || 'none in the list'}</span>`;
    return { readouts, live };
  },
};
