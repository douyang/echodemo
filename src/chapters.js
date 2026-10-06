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
import ivcPage from './ch/ivc.js';
import stressPage from './ch/stress.js';
import rvPage from './ch/rv.js';
import lvadPage from './ch/lvad.js';
import constrictPage from './ch/constrict.js';
import hcmPage from './ch/hcm.js';
import prostheticPage from './ch/prosthetic.js';
import shuntsPage from './ch/shunts.js';
import endocarditisPage from './ch/endocarditis.js';
import aortaPage from './ch/aorta.js';
import massesPage from './ch/masses.js';
import miPage from './ch/mi.js';
// Shock is hidden (SHOW_SHOCK in order.js), so this file does not import it and the page does not
// load it. To restore it, add `import shockPage from './ch/shock.js';` here and shockPage to BY
// below, and follow the steps at SHOW_SHOCK in order.js.
import measurePage from './ch/measure.js';
import aiPage from './ch/ai.js';
import teePage from './ch/tee.js';
import report from './ch/report.js';

import { ORDER, BONUS, numOf } from './order.js';

export { numOf } from './order.js';

const BY = Object.fromEntries([pulse, image, shift, windows, planes, cycle, loop, ivcPage, pressure, eject, segments, fill,
  asPage, arPage, msPage, mrPage, trPage, prostheticPage, endocarditisPage, aortaPage, periPage, amyloidPage, strainPage, stressPage, rvPage, lvadPage, constrictPage, hcmPage, shuntsPage, massesPage, miPage, measurePage, aiPage, teePage, report].map((c) => [c.key, c]));
/**
 * Every chapter shown, in the order back and next step through them: the main chapters in
 * reading order (ORDER), then the bonus chapters (BONUS). state.chapter is an index in it.
 */
export const CHAPTERS = [...ORDER, ...BONUS].map((k) => BY[k]);
/**
 * The chapters of the chapter bar, of its list and of the tour, by their index in CHAPTERS: the
 * main chapters. A bonus chapter is not in it. It opens by back and next, by the block at the end
 * of the last main chapter and by its address, and the bar then shows no chapter as current.
 */
export const BAR = ORDER.map((k, i) => i);

// Each chapter names its part (its module's `part`). A part with no chapter in the bar is left
// out, and the numerals follow the parts that remain. Congenital, Masses and Acute care hold only
// bonus chapters now. TEE is in the part Views, after Views (order.js).
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
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
/** The parts of the chapter bar, in order, numbered I, II ... */
export const PARTS = ALL_PARTS.filter((p) => BAR.some((i) => CHAPTERS[i].part === p.key)).map((p, i) => ({ ...p, num: ROMAN[i] }));
/** The part that a chapter's video names: its part in the bar, or Bonus for a bonus chapter. */
export function partOf(key) {
  if (numOf(key).startsWith('B')) return { key: 'bonus', num: '', name: 'Bonus' };
  const c = CHAPTERS.find((x) => x.key === key);
  return PARTS.find((p) => p.key === c?.part) || null;
}
