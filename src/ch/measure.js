// Automated measurements (EchoNet-Measurements). A stub: the figure is under construction.
import { Sheet } from '../sketch.js';

let sheet = null;
const B_NAMES = ['Septum', 'LV internal diameter', 'Posterior wall', 'LA diameter', 'RV basal diameter', 'Aortic root', 'Ascending aorta', 'Pulmonary artery', 'IVC'];
const D_NAMES = ['TR peak velocity', 'Aortic peak velocity', 'MR peak velocity', 'LVOT peak velocity', 'Septal e′', 'Lateral e′', 'Mitral E and E/A', 'TAPSE'];

export default {
  key: 'measure',
  part: 'ai',
  title: 'Automated measurements',
  nav: 'AI measure',
  dwell: 40,
  defaults: { emTab: 'bmode', emB: 1, emD: 0, emTwo: false, emRaw: false },
  format: {
    emB: (x) => B_NAMES[Math.round(x)] ?? '',
    emD: (x) => D_NAMES[Math.round(x)] ?? '',
  },
  watch: ['emTab', 'emB', 'emD', 'emTwo', 'emRaw', 'pheno'],
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh) => sh.text('EchoNet-Measurements figure', 20, 40, { size: 18 }));
    return sheet;
  },
  text(s) {
    return { readouts: [{ k: 'Measurement', v: s.emTab === 'bmode' ? B_NAMES[s.emB] : D_NAMES[s.emD], text: true }], live: '' };
  },
};
