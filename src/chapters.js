// The eighteen chapters in reading order, grouped into eight parts.
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
import report from './ch/report.js';

// The report chapter is hidden: its module and markup stay (index.html, #ch-report) and come
// back as chapter 19, in a part of its own after 18 IVC, when this is true (main.js shows the
// article of every chapter listed here).
// The Normal values table opens from it.
const SHOW_REPORT = false;
// 08 Planes is archived: its module and markup stay (index.html, #ch-planes, #fig-planes) and come
// back as chapter 08 after 07 when this is true. Chapter 07 shows the nine standard planes in its
// Probe and body view (ch/windows.js).
const SHOW_PLANES = false;

export const PARTS = [
  { key: 'physics', num: 'I', name: 'Physics' },
  { key: 'physiology', num: 'II', name: 'Physiology' },
  { key: 'views', num: 'III', name: 'Views' },
  { key: 'function', num: 'IV', name: 'Function' },
  { key: 'valves', num: 'V', name: 'Valves' },
  { key: 'pericardium', num: 'VI', name: 'Pericardium' },
  { key: 'cardiomyopathy', num: 'VII', name: 'Cardiomyopathy' },
  { key: 'ivc', num: 'VIII', name: 'Right heart' },
  ...(SHOW_REPORT ? [{ key: 'report', num: 'IX', name: 'Report' }] : []),
];

export const CHAPTERS = [pulse, image, shift, pressure, cycle, loop, windows, ...(SHOW_PLANES ? [planes] : []), eject, segments, fill, asPage, arPage, msPage, mrPage, trPage, periPage, amyloidPage, ivcPage, ...(SHOW_REPORT ? [report] : [])];
