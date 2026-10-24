// The chapter order, by key, the bonus page, the bonus chapters and the hidden chapters.
// chapters.js builds CHAPTERS from it, and a page takes a chapter's number from it (numOf), so a
// new order needs no edit in the text.
//
// The order follows the ASE comprehensive examination (Mitchell 2019): instrumentation, the views,
// then the measurements. TEE follows the transthoracic views, in the same part: a second set of
// views, from its own probe. Then Doppler hemodynamics, whose second half gives the RA pressure
// from the IVC (Mukherjee 2025) that the RV systolic pressure adds; then function: the LV's
// systolic and diastolic function and its regional wall motion. Stress echocardiography tests
// that motion, so it follows it. Myocardial strain follows stress, then the right ventricle. Then
// the valves by valve as in the ASE report (Taub 2025), each stenosis before its regurgitation, the
// pericardium and amyloid. Artificial intelligence comes last: a model that reads a whole study
// draws on every chapter before it.

// The report chapter is hidden: its module and markup stay (index.html, #ch-report) and come back
// as the last main chapter, in a part of its own, when this is true. The Normal values table opens from it.
export const SHOW_REPORT = false;
// Planes is archived: its module and markup stay (index.html, #ch-planes, #fig-planes) and come
// back after Views when this is true. Views shows the nine standard planes in its Probe and body
// view (ch/windows.js).
export const SHOW_PLANES = false;
// Automated measurements is hidden: its module and markup stay (index.html, #ch-measure,
// #fig-measure) and come back before the AI chapter when this is true. The AI chapter shows its
// 17 outputs (src/aifig.js), and the address #measure opens it (src/main.js).
export const SHOW_MEASURE = false;
// Shock is hidden. The page does not load its module (src/ch/shock.js, src/shockcal.js stay in the
// repo), and no text, list or video names it. To restore it:
//  1. Set SHOW_SHOCK to true. Shock then comes back after Cardiac amyloidosis, in the part Acute care.
//  2. Import src/ch/shock.js in src/chapters.js and add it to BY (the note there).
//  3. Put back the lines in archive/shock.html: the figure and the article in index.html, its
//     sources in src/refs.js, its heart preset in src/pheno.js and its stage height in src/styles.css.
// Its chapter video (video/chapters.js) follows this flag.
export const SHOW_SHOCK = false;
// Constrictive pericarditis is hidden as a chapter of its own: Pericardial disease (src/ch/peri.js)
// shows constriction and restrictive cardiomyopathy on its switch, with the figure and the text
// of src/constriction.js. The page does not load the old chapter's module (src/ch/constrict.js
// stays in the repo), and the address #constrict opens Pericardial disease on Constriction
// (src/main.js). To restore the chapter:
//  1. Set SHOW_CONSTRICT to true. It then comes back after Pericardial disease, in the part Pericardium.
//  2. Import src/ch/constrict.js in src/chapters.js and add it to BY.
//  3. Put back the lines in archive/constrict.html: the figure and the article in index.html and its
//     stage height in src/styles.css.
//  4. Run node tools/preload.mjs.
// Its chapter video is in archive/constrict.html too.
export const SHOW_CONSTRICT = false;
// The inferior vena cava is hidden as a chapter of its own: Doppler hemodynamics (src/ch/pressure.js)
// shows the RA pressure from the IVC on its switch (IVC), with the subcostal long axis and the
// M-mode, and the text of its second half. The page does not load the old chapter's module
// (src/ch/ivc.js stays in the repo, with the hepatic veins, the IVC beside the aorta and the
// meters; both use src/ivcfig.js). The address #ivc and every link to the IVC open Doppler
// hemodynamics on IVC (src/main.js), and numOf('ivc') gives its number (SHOWN_IN). To restore the
// chapter:
//  1. Set SHOW_IVC to true. It then comes back before Doppler hemodynamics, in the part Hemodynamics.
//  2. Import src/ch/ivc.js in src/chapters.js and add it to BY.
//  3. Put back the lines in archive/ivc.html: the figure and the article in index.html, its stage
//     height in src/styles.css and its video in video/chapters.js. The article holds the diagram
//     (#ivc-ase), so Doppler hemodynamics then needs another id for its own.
//  4. Run node tools/preload.mjs.
export const SHOW_IVC = false;

/** The main chapters, in reading order: the numbers 01, 02 ..., the tour, and the chapter bar and its list before B. */
export const ORDER = [
  'pulse', 'image', 'shift', 'windows', ...(SHOW_PLANES ? ['planes'] : []), 'tee', 'cycle', 'loop', ...(SHOW_IVC ? ['ivc'] : []), 'pressure',
  'eject', 'fill', 'segments', 'stress', 'strain', 'rv', 'as', 'ar', 'ms', 'mr', 'tr', 'aorta', 'peri', ...(SHOW_CONSTRICT ? ['constrict'] : []), 'hcm', 'amyloid', ...(SHOW_SHOCK ? ['shock'] : []), ...(SHOW_MEASURE ? ['measure'] : []), 'ai', ...(SHOW_REPORT ? ['report'] : []),
];

/**
 * The bonus page, number B: one entry of the chapter bar after the last main chapter, in a part of
 * its own (Bonus). Its page lists the bonus chapters, and it opens by its address (#bonus).
 */
export const BONUS_PAGE = 'bonus';

/**
 * The bonus chapters, after the bonus page, numbered B1, B2 ... They are not in the chapter bar,
 * its list or the tour: the bar shows B while one is open. The bonus page links to them, back and
 * next step through them, and each opens by its address (#lvad).
 */
export const BONUS = ['lvad', 'prosthetic', 'endocarditis', 'shunts', 'masses', 'mi', 'mitraclip'];

/** A hidden chapter that a main chapter shows as one of its settings: a link to it takes that chapter's number. */
export const SHOWN_IN = SHOW_IVC ? {} : { ivc: 'pressure' };

/**
 * A chapter's number as the page prints it ("08", "B" for the bonus page, "B3" for a bonus
 * chapter); the number of the chapter that shows it for a key in SHOWN_IN; '' for a chapter that
 * is not shown.
 */
export function numOf(key) {
  const i = ORDER.indexOf(SHOWN_IN[key] ?? key);
  if (i >= 0) return String(i + 1).padStart(2, '0');
  if (key === BONUS_PAGE) return 'B';
  const b = BONUS.indexOf(key);
  return b < 0 ? '' : `B${b + 1}`;
}
