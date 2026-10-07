// Constrictive pericarditis as a chapter of its own: hidden. Pericardial disease (ch/peri.js) shows
// constriction and restrictive cardiomyopathy as two settings of its switch, with the figure and
// the text of src/constriction.js. The page does not load this module. To restore the chapter,
// follow the steps at SHOW_CONSTRICT in src/order.js.
import { Sheet, clamp } from '../sketch.js';
import { lazyBands, paintBands, playSeverity } from '../sev.js';
import { MODES, LEVELS, SHORT, LABEL, valuesCache, gradeOf, constrictionFigure, liveOf, readoutsOf, diffTable } from '../constriction.js';

const KEY = 'conS';
const MODE = 'conMode';
const modeOf = (s) => (s[MODE] === 'rcm' ? 'rcm' : 'cp');
const BANDS_OF = { cp: [], rcm: [] };
const valuesOf = valuesCache();

let sheet = null, st = null;
const fig = constrictionFigure(() => { if (sheet) sheet.dirty = true; });

const page = {
  key: 'constrict',
  part: 'pericardium',
  model: true,   // the figure needs the heart model at once (tools/preload.mjs)
  title: 'Constrictive pericarditis',
  nav: 'CP',
  dwell: 26,
  defaults: { conS: 0.55, conMode: 'cp' },
  format: { conS: (x, s) => { const mode = s ? modeOf(s) : 'cp'; return LABEL[mode][gradeOf(x, mode)]; } },
  watch: ['conS', 'conMode', 'pheno'],
  figure(el) {
    sheet = new Sheet(el.querySelector('canvas'), (sh, t) => fig.draw(sh, t, valuesOf(st[KEY], modeOf(st)), st.pheno));
    return sheet;
  },
  init({ state, subscribe }) {
    st = state;
    for (const mode of MODES) BANDS_OF[mode] = lazyBands((x) => gradeOf(x, mode));
    const host = document.getElementById('constrict-grades');
    let painted = '';
    const paint = (s) => {
      const mode = modeOf(s);
      if (mode === painted) return;
      painted = mode;
      paintBands(host, BANDS_OF[mode], LEVELS, SHORT[mode]);
    };
    paint(state);
    subscribe?.((s, ch) => { if (MODE in ch) paint(s); });
  },
  // the heart model and the targets load at idle, before the chapter opens (main.js warmQueue)
  enter() { fig.mesh.start(); },
  warm() { fig.mesh.start(); },
  // the heart for the music: the page's beat while the cine runs
  pulse: () => fig.pulse(),
  anim(dt, s, set) {
    playSeverity(dt, s, set, KEY, BANDS_OF[modeOf(s)]);
    if (fig.tick(dt) && sheet) sheet.dirty = true;
  },
  // the sequence: constriction from normal to severe, then restrictive cardiomyopathy
  tourEnter(set) { set({ conS: 0, conMode: 'cp' }); },
  tourTick(tt, set) {
    if (tt < 13) set({ conMode: 'cp', conS: Math.round(clamp((tt - 1) / 11, 0, 1) * 200) / 200 });
    else set({ conMode: 'rcm', conS: Math.round(clamp((tt - 14) / 11, 0, 1) * 200) / 200 });
  },
  // the time of the sequence at which tourTick shows this state (its inverse)
  tourAt(s) { return modeOf(s) === 'rcm' ? 14 + s.conS * 11 : 1 + s.conS * 11; },
  text(s, { cite }) {
    const v = valuesOf(s[KEY], modeOf(s));
    return {
      readouts: readoutsOf(v),
      live: liveOf(v, cite),
      extra: (art) => {
        diffTable(art.querySelector('#constrict-table'), v, cite);
        // the slider's label: main.js writes it when conS changes, and the switch changes it alone
        const o = document.querySelector('output[data-for="conS"]'), lab = page.format.conS(s[KEY], s);
        if (o && o.textContent !== lab) o.textContent = lab;
      },
    };
  },
};
export default page;
