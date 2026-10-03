// The cuts of the "Echo views" video, and the caption of each view.
//
// A cut: aspect ('16:9' or '9:16'), theme ('dark' or 'light': the site's own palettes), the
// views in order, and the timing in heartbeats (one beat = 60/70 s): intro (title card), hold
// (a view on screen, still), move (the plane moving to the next view), winHold and winMove
// (the same, where the next view is in another window), lastHold, outro (end card). Captions:
// 'full' (name, probe, structures) or 'compact' (name, probe).
//
// Caption wording comes from the site: the name is VIEWS[].name and the probe line is
// WINDOWS[].probe, or the probe's move to the view, MOVE[] (src/views.js, read at run time); the
// structures are the view's labels (VIEWS[].labels) with the names the cross-section tags use
// (src/echo.js).
//
// planes: true adds the planes of the nine standard views to the Probe and body pane, with the
// current plane in ink and the lines where it crosses them, as chapter 07 drew them in its
// Probe and body view in PR #20 (video/app.js). Cut B has them.
//
// Cut P is archived: the three-pane chapter of PR #19 (left: 'planes', All planes, with the
// chapter's cards). It stays here so that it can be rendered again.
import { VIEWS, WINDOWS, MOVE } from '../src/views.js';

const ALL = ['plax', 'plax_asc', 'rv_in', 'rv_out', 'psax_av', 'psax_pa', 'psax_tv', 'psax_mv', 'psax_pm', 'psax_ap',
  'a4c', 'a4c_rv', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'sc_aorta', 'ssn', 'ssn_sax'];
const CORE = ['plax', 'rv_in', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a5c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'ssn'];
const QUICK = ['plax', 'psax_av', 'psax_mv', 'psax_pm', 'a4c', 'a2c', 'a3c', 'sc4c', 'sc_ivc', 'ssn'];

// title and end cards; the title's second line is the first sentence of chapter 07's dek (index.html)
const CARDS = { title: 'Echo views', sub: 'Each standard view is one plane through the heart.', end: 'The Heart by Ultrasound' };

export const CUTS = {
  // (A) full tour: every major view, window by window; 8 beats a view
  A: { id: 'A', name: 'Full tour', aspect: '16:9', theme: 'dark', views: ALL, caption: 'full', cards: CARDS,
    intro: 4, hold: 6, move: 2, winHold: 5, winMove: 3, lastHold: 6, outro: 6 },
  // (B) core views on the light palette, with the nine planes in Probe and body; 6 beats a view
  B: { id: 'B', name: 'Core views', aspect: '16:9', theme: 'light', views: CORE, caption: 'full', planes: true, cards: CARDS,
    intro: 4, hold: 4, move: 2, winHold: 3, winMove: 3, lastHold: 5, outro: 5 },
  // (C) quick cut: a bar (4 beats) a view, moves of one beat inside a window
  C: { id: 'C', name: 'Quick cut', aspect: '16:9', theme: 'dark', views: QUICK, caption: 'compact', cards: CARDS,
    intro: 2, hold: 3, move: 1, winHold: 2, winMove: 2, lastHold: 3, outro: 3 },
  // (D) vertical, stacked for phones; the core views, 6 beats a view
  D: { id: 'D', name: 'Vertical', aspect: '9:16', theme: 'dark', views: CORE, caption: 'full', cards: CARDS,
    intro: 3, hold: 4, move: 2, winHold: 3, winMove: 3, lastHold: 4, outro: 4 },
  // (P, archived) All planes, the cross-section and the echo, one plane moving through all
  // three; the core views, 7 beats a view; the probe line is the move to each view
  P: { id: 'P', name: 'Views and planes', aspect: '16:9', theme: 'dark', views: CORE, caption: 'full', probe: 'move', left: 'planes', chapter: 'windows',
    cards: CARDS, intro: 4, hold: 5, move: 2, winHold: 4, winMove: 3, lastHold: 6, outro: 6 },
};

/** Structures in each view: its labels (VIEWS[].labels), named as the cross-section names them. */
const SHOWS = {
  plax: 'RV outflow tract · ventricular septum · left ventricle · inferolateral wall · left atrium · aorta · mitral valve · descending aorta',
  plax_asc: 'Ascending aorta · aortic valve · left ventricle · left atrium',
  rv_in: 'Right ventricle · tricuspid valve · right atrium · inferior vena cava',
  rv_out: 'RV outflow tract · pulmonic valve · main pulmonary artery',
  psax_av: 'Aortic valve · left atrium · right atrium · RV outflow tract · tricuspid valve · pulmonic valve · atrial septum',
  psax_pa: 'Aorta · RV outflow tract · pulmonic valve · pulmonary artery · right and left pulmonary arteries',
  psax_tv: 'Tricuspid valve · right atrium · right ventricle · aortic valve',
  psax_mv: 'Right ventricle · ventricular septum · left ventricle · mitral valve',
  psax_pm: 'Right ventricle · ventricular septum · left ventricle · anterior, inferior and lateral walls',
  psax_ap: 'Left ventricle · anterior wall',
  a4c: 'Left and right ventricles · left and right atria · ventricular septum · mitral and tricuspid valves · apex',
  a4c_rv: 'Right ventricle · right atrium · tricuspid valve · left ventricle',
  a5c: 'Left ventricle · LV outflow tract · aortic valve · right ventricle · right atrium · left atrium',
  a2c: 'Left ventricle · left atrium · mitral valve · anterior and inferior walls · apex',
  a3c: 'Left ventricle · left atrium · aorta · mitral valve · anteroseptal and inferolateral walls · apex',
  sc4c: 'Liver · right ventricle · right atrium · left ventricle · left atrium · atrial septum',
  sc_ivc: 'Liver · inferior vena cava · hepatic vein · right atrium',
  sc_aorta: 'Liver · abdominal aorta · celiac trunk · superior mesenteric artery',
  ssn: 'Ascending aorta · aortic arch · descending aorta · right pulmonary artery',
  ssn_sax: 'Aortic arch · right pulmonary artery · left atrium · superior vena cava',
};

/**
 * The probe line of a window: WINDOWS[].probe. The parasternal short-axis window's own line
 * ("Same spot, rotated 90° clockwise") names the spot of the long-axis window; the caption
 * says which spot, as chapter 07 does ("Rotate 90° clockwise from the long axis").
 */
const PROBE = Object.fromEntries(WINDOWS.map((w) => [w.key, w.probe]));
PROBE.psax = 'Left sternal border, rotated 90° clockwise from the long axis';

/** Window names for the progress line: WINDOWS[].name. */
export const WIN_NAME = Object.fromEntries(WINDOWS.map((w) => [w.key, w.name]));

/** The caption of a view: { win, window, name, probe, shows }. probe: 'move', the probe's move to the view. */
export function caption(view, probe = 'window') {
  const v = VIEWS[view];
  return { win: v.win, window: WIN_NAME[v.win], name: v.name, probe: probe === 'move' ? MOVE[view] : PROBE[v.win], shows: SHOWS[view] };
}

export { ALL };
