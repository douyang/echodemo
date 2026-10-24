// The chapters in reading order (order.js), grouped into parts.
import pulse from './ch/pulse.js';
import image from './ch/image.js';
import windows from './ch/windows.js';
import planes from './ch/planes.js';
import cycle from './ch/cycle.js';
import loop from './ch/loop.js';
import shift from './ch/shift.js';
import pressure from './ch/pressure.js';
import eject from './ch/eject.js';
import segments from './ch/segments.js';
import strainPage from './ch/strain.js';
import fill from './ch/fill.js';
import asPage from './ch/as.js';
import arPage from './ch/ar.js';
import msPage from './ch/ms.js';
import mrPage from './ch/mr.js';
import trPage from './ch/tr.js';
import periPage from './ch/peri.js';
import amyloidPage from './ch/amyloid.js';
import stressPage from './ch/stress.js';
import rvPage from './ch/rv.js';
import lvadPage from './ch/lvad.js';
import hcmPage from './ch/hcm.js';
import prostheticPage from './ch/prosthetic.js';
import shuntsPage from './ch/shunts.js';
import endocarditisPage from './ch/endocarditis.js';
import aortaPage from './ch/aorta.js';
import massesPage from './ch/masses.js';
import miPage from './ch/mi.js';
import mteerPage from './ch/mteer.js';
// Shock is hidden (SHOW_SHOCK in order.js), so this file does not import it and the page does not
// load it. To restore it, add `import shockPage from './ch/shock.js';` here and shockPage to BY
// below, and follow the steps at SHOW_SHOCK in order.js. Constrictive pericarditis is hidden as a
// chapter of its own (SHOW_CONSTRICT in order.js) in the same way: Pericardial disease shows it.
// So is the inferior vena cava (SHOW_IVC): Doppler hemodynamics shows it.
import measurePage from './ch/measure.js';
import aiPage from './ch/ai.js';
import teePage from './ch/tee.js';
import report from './ch/report.js';
import bonusPage from './ch/bonus.js';

import { ORDER, BONUS_PAGE, BONUS, numOf } from './order.js';

export { numOf } from './order.js';

const BY = Object.fromEntries([pulse, image, shift, windows, planes, cycle, loop, pressure, eject, segments, fill,
  asPage, arPage, msPage, mrPage, trPage, prostheticPage, endocarditisPage, aortaPage, periPage, amyloidPage, strainPage, stressPage, rvPage, lvadPage, hcmPage, shuntsPage, massesPage, miPage, mteerPage, measurePage, aiPage, teePage, report, bonusPage].map((c) => [c.key, c]));
/**
 * Every chapter shown, in the order back and next step through them: the main chapters in
 * reading order (ORDER), the bonus page (B), then the bonus chapters (BONUS). state.chapter is an
 * index in it.
 */
export const CHAPTERS = [...ORDER, BONUS_PAGE, ...BONUS].map((k) => BY[k]);
/** The main chapters, by their index in CHAPTERS: the tour runs through them, and the intro counts them. */
export const MAIN = ORDER.map((k, i) => i);
/** The bonus page's index in CHAPTERS. */
const BONUS_AT = ORDER.length;
/**
 * The entries of the chapter bar and of its list, by their index in CHAPTERS: the main chapters,
 * then the bonus page (B). A bonus chapter is not in it. It opens by back and next, by the bonus
 * page and by its address, and the bar then shows B as current (barOf).
 */
export const BAR = [...MAIN, BONUS_AT];
/** The bar's entry for chapter i: the chapter itself, or B for a bonus chapter. */
export const barOf = (i) => (BAR.includes(i) ? i : BONUS_AT);

// Each chapter names its part (its module's `part`). A part with no chapter in the bar is left
// out, and the numerals follow the parts that remain. Congenital, Masses and Acute care hold only
// bonus chapters now. The bonus page has the part Bonus. TEE is in the part Views, after Views
// (order.js).
const ALL_PARTS = [
  { key: 'physics', name: 'Physics' },
  { key: 'views', name: 'Views' },
  { key: 'physiology', name: 'Physiology' },
  { key: 'hemodynamics', name: 'Hemodynamics' },
  { key: 'function', name: 'Function' },
  { key: 'valves', name: 'Valves' },
  { key: 'aorta', name: 'Aorta' },
  { key: 'pericardium', name: 'Pericardium' },
  { key: 'cardiomyopathy', name: 'Cardiomyopathy' },
  { key: 'congenital', name: 'Congenital' },
  { key: 'masses', name: 'Masses' },
  { key: 'acute', name: 'Acute care' },
  { key: 'ai', name: 'Artificial intelligence' },
  { key: 'report', name: 'Report' },
  { key: 'bonus', name: 'Bonus' },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
/** The parts of the chapter bar, in order, numbered I, II ... */
export const PARTS = ALL_PARTS.filter((p) => BAR.some((i) => CHAPTERS[i].part === p.key)).map((p, i) => ({ ...p, num: ROMAN[i] }));
/** The part that a chapter's video names: its part in the bar, or Bonus for a bonus chapter (number B1 ...). */
export function partOf(key) {
  if (numOf(key).startsWith('B')) return { key: 'bonus', num: '', name: 'Bonus' };
  const c = CHAPTERS.find((x) => x.key === key);
  return PARTS.find((p) => p.key === c?.part) || null;
}
