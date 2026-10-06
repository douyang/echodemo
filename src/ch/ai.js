// Study interpretation (EchoPrime). A stub: the figure is under construction.
import { Sheet } from '../sketch.js';
import { SECTIONS } from '../echoprime.js';

let sheet = null;

export default {
  key: 'ai',
  part: 'ai',
  title: 'Study interpretation',
  nav: 'AI read',
  dwell: 40,
  defaults: { aiTab: 'study', aiSec: 0, aiN: 14, aiOnly: false, aiMap: 'lv', aiK: 50 },
  format: {
    aiSec: (x) => SECTIONS[Math.round(x)]?.name ?? '',
    aiN: (x) => `${Math.round(x)} of 14`,
    aiK: (x) => String(Math.round(x)),
  },
  watch: ['aiTab', 'aiSec', 'aiN', 'aiOnly', 'aiMap', 'aiK', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh) => sh.text('EchoPrime figure', 20, 40, { size: 18 }));
    return sheet;
  },
  text(s) {
    return { readouts: [{ k: 'Section', v: SECTIONS[s.aiSec]?.name ?? '', text: true }], live: '' };
  },
};
