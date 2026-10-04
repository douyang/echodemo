// The chapter order, by key, and the two hidden chapters. chapters.js builds CHAPTERS from it, and
// a page takes a chapter's number from it (numOf), so a new order needs no edit in the text.
//
// The order follows the ASE comprehensive examination (Mitchell 2019): instrumentation, the views,
// then the measurements; the RA pressure (Mukherjee 2025) before the pressures that add it; then
// function, the valves by valve as in the ASE report (Taub 2025), each stenosis before its
// regurgitation, the pericardium and amyloid; stress echocardiography, an examination of its own,
// comes last.

// The report chapter is hidden: its module and markup stay (index.html, #ch-report) and come back
// as the last chapter, in a part of its own, when this is true. The Normal values table opens from it.
export const SHOW_REPORT = false;
// Planes is archived: its module and markup stay (index.html, #ch-planes, #fig-planes) and come
// back after Views when this is true. Views shows the nine standard planes in its Probe and body
// view (ch/windows.js).
export const SHOW_PLANES = false;

export const ORDER = [
  'pulse', 'image', 'shift', 'windows', ...(SHOW_PLANES ? ['planes'] : []), 'cycle', 'loop', 'ivc', 'pressure',
  'eject', 'segments', 'fill', 'as', 'ar', 'ms', 'mr', 'tr', 'peri', 'amyloid', 'stress', ...(SHOW_REPORT ? ['report'] : []),
];

/** A chapter's number as the page prints it ("08"); '' for a chapter that is not shown. */
export function numOf(key) {
  const i = ORDER.indexOf(key);
  return i < 0 ? '' : String(i + 1).padStart(2, '0');
}
