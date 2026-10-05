// The twenty-two chapters in reading order (order.js), grouped into eight parts.
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
import constrictPage from './ch/constrict.js';
import hcmPage from './ch/hcm.js';
import report from './ch/report.js';

import { ORDER, SHOW_REPORT } from './order.js';

export { numOf } from './order.js';

export const PARTS = [
  { key: 'physics', num: 'I', name: 'Physics' },
  { key: 'views', num: 'II', name: 'Views' },
  { key: 'physiology', num: 'III', name: 'Physiology' },
  { key: 'hemodynamics', num: 'IV', name: 'Hemodynamics' },
  { key: 'function', num: 'V', name: 'Function' },
  { key: 'valves', num: 'VI', name: 'Valves' },
  { key: 'pericardium', num: 'VII', name: 'Pericardium' },
  { key: 'cardiomyopathy', num: 'VIII', name: 'Cardiomyopathy' },
  ...(SHOW_REPORT ? [{ key: 'report', num: 'IX', name: 'Report' }] : []),
];

const BY = Object.fromEntries([pulse, image, shift, windows, planes, cycle, loop, ivcPage, pressure, eject, segments, fill,
  asPage, arPage, msPage, mrPage, trPage, periPage, amyloidPage, stressPage, rvPage, constrictPage, hcmPage, report].map((c) => [c.key, c]));
/** The chapters in reading order (order.js). */
export const CHAPTERS = ORDER.map((k) => BY[k]);
