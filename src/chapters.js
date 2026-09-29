// The fourteen chapters in reading order, grouped into six parts.
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
import narrow from './ch/narrow.js';
import leak from './ch/leak.js';
import report from './ch/report.js';

export const PARTS = [
  { key: 'physics', num: 'I', name: 'Physics and views' },
  { key: 'physiology', num: 'II', name: 'Physiology' },
  { key: 'doppler', num: 'III', name: 'Doppler' },
  { key: 'function', num: 'IV', name: 'Function' },
  { key: 'valves', num: 'V', name: 'Valves' },
  { key: 'report', num: 'VI', name: 'Report' },
];

export const CHAPTERS = [pulse, image, windows, planes, cycle, loop, shift, pressure, eject, segments, fill, narrow, leak, report];
