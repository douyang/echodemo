// The eighteen chapters in reading order, grouped into seven parts.
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
import report from './ch/report.js';

export const PARTS = [
  { key: 'physics', num: 'I', name: 'Physics' },
  { key: 'physiology', num: 'II', name: 'Physiology' },
  { key: 'views', num: 'III', name: 'Views' },
  { key: 'function', num: 'IV', name: 'Function' },
  { key: 'valves', num: 'V', name: 'Valves' },
  { key: 'pericardium', num: 'VI', name: 'Pericardium' },
  { key: 'report', num: 'VII', name: 'Report' },
];

export const CHAPTERS = [pulse, image, shift, pressure, cycle, loop, windows, planes, eject, segments, fill, asPage, arPage, msPage, mrPage, trPage, periPage, report];
