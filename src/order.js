// The chapter order, by key, and the two hidden chapters. chapters.js builds CHAPTERS from it, and
// a page takes a chapter's number from it (numOf), so a new order needs no edit in the text.
//
// The order follows the ASE comprehensive examination (Mitchell 2019): instrumentation, the views,
// then the measurements; the RA pressure (Mukherjee 2025) before the pressures that add it; then
// function: the LV's systolic and diastolic function, its regional wall motion and stress
// echocardiography, which tests that motion, then the right ventricle; then the valves by valve as in
// the ASE report (Taub 2025), each stenosis before its regurgitation, the pericardium and amyloid.
// Artificial intelligence comes last: a model that reads a whole study draws on every chapter before it.

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

export const ORDER = [
  'pulse', 'image', 'shift', 'windows', ...(SHOW_PLANES ? ['planes'] : []), 'cycle', 'loop', 'ivc', 'pressure',
  'eject', 'fill', 'segments', 'strain', 'stress', 'rv', 'lvad', 'as', 'ar', 'ms', 'mr', 'tr', 'prosthetic', 'endocarditis', 'aorta', 'peri', 'constrict', 'hcm', 'amyloid', 'shunts', 'masses', ...(SHOW_MEASURE ? ['measure'] : []), 'ai', ...(SHOW_REPORT ? ['report'] : []),
];

/** A chapter's number as the page prints it ("08"); '' for a chapter that is not shown. */
export function numOf(key) {
  const i = ORDER.indexOf(key);
  return i < 0 ? '' : String(i + 1).padStart(2, '0');
}
