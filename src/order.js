// The chapter order, by key, the bonus chapters and the hidden chapters. chapters.js builds
// CHAPTERS from it, and a page takes a chapter's number from it (numOf), so a new order needs no
// edit in the text.
//
// The order follows the ASE comprehensive examination (Mitchell 2019): instrumentation, the views,
// then the measurements. TEE follows the transthoracic views, in the same part: a second set of
// views, from its own probe. Then the RA pressure (Mukherjee 2025) before the pressures that add
// it; then function: the LV's systolic and diastolic function, its regional wall motion and stress
// echocardiography, which tests that motion, then the right ventricle; then the valves by valve as in
// the ASE report (Taub 2025), each stenosis before its regurgitation, the pericardium and amyloid.
// Artificial intelligence comes last: a model that reads a whole study draws on every chapter
// before it.

// The report chapter is hidden: its module and markup stay (index.html, #ch-report) and come back
// as the last chapter, in a part of its own, when this is true. The Normal values table opens from it.
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

/** The main chapters, in reading order: the chapter bar, its list, the tour and the numbers 01, 02 ... */
export const ORDER = [
  'pulse', 'image', 'shift', 'windows', ...(SHOW_PLANES ? ['planes'] : []), 'tee', 'cycle', 'loop', 'ivc', 'pressure',
  'eject', 'fill', 'segments', 'strain', 'stress', 'rv', 'as', 'ar', 'ms', 'mr', 'tr', 'aorta', 'peri', 'constrict', 'hcm', 'amyloid', ...(SHOW_SHOCK ? ['shock'] : []), ...(SHOW_MEASURE ? ['measure'] : []), 'ai', ...(SHOW_REPORT ? ['report'] : []),
];

/**
 * The bonus chapters, after the last main chapter, numbered B1, B2 ... They are not in the chapter
 * bar, its list or the tour. A block at the end of the last main chapter links to them, back and
 * next step through them, and each opens by its address (#lvad).
 */
export const BONUS = ['lvad', 'prosthetic', 'endocarditis', 'shunts', 'masses', 'mi'];

/** A chapter's number as the page prints it ("08", or "B3" for a bonus chapter); '' for a chapter that is not shown. */
export function numOf(key) {
  const i = ORDER.indexOf(key);
  if (i >= 0) return String(i + 1).padStart(2, '0');
  const b = BONUS.indexOf(key);
  return b < 0 ? '' : `B${b + 1}`;
}
