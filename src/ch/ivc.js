// Inferior vena cava: the RA pressure from the IVC (ASE 2025, Mukherjee: Table 4, Figure 3).
// Hidden as a chapter of its own (SHOW_IVC in order.js): Doppler hemodynamics (ch/pressure.js)
// shows the estimate as its IVC setting, with the subcostal long axis and the M-mode. This page
// keeps the whole figure: the subcostal long axis of the IVC with a caliper 1 to 2 cm from the RA,
// the IVC on M-mode through quiet breathing and a sniff, hepatic vein PW Doppler, and the IVC and
// the abdominal aorta side by side. The text: the steps of the estimate as a diagram, with ▲▼
// buttons on the IVC diameter and its collapse (src/ivcfig.js).
import { Sheet, clamp } from '../sketch.js';
import { reducedMotion } from '../state.js';
import { cine, meters, rows, cols } from '../sev.js';
import { drawSubcostal, drawMmode, drawHV, drawPair } from '../ivc2d.js';
import { defaultsOf, valuesOf, model, ivcClock, ivcDiagram, liveOf, readoutsOf, boxLines, HV_NAME, fmt } from '../ivcfig.js';

// the page's own keys for the estimate's inputs (ivcfig.js)
const K = { D: 'ivcD', sniff: 'ivcSniff', quiet: 'ivcQuiet', breath: 'ivcBreath', sec: 'ivcSec', tr: 'ivcTR' };
const DEF = defaultsOf(K);

let sheet = null, st = null, setState = null, dg = null;
const panels = ivcClock();   // the clock of the panels

function draw(sh, t) {
  const W = sh.w, H = sh.h, ctx = sh.ctx;
  const v = valuesOf(st, K), m = model(v);
  cine.live = !reducedMotion;
  const P = panels.frame(v, m);
  if (W < 700) {
    const [top, bot] = rows({ x: 6, y: 6, w: W - 12, h: H - 12 }, [1.45, 1], 8);
    const [a, b] = cols(top, [1.15, 1], 8);
    drawSubcostal(ctx, a, P.sc, { box: boxLines(v, m, false) });
    const [r1, r2] = rows(b, [1, 1], 8);
    drawMmode(ctx, r1, P.p, P.u);
    drawHV(ctx, r2, m.hv, P.sweep);
    drawPair(ctx, bot, { d: P.d, hvW: m.hvW, beat: P.beat, t: P.tm });
    return;
  }
  const colL = { x: 16, y: 36, w: W * 0.5 - 22, h: H - 48 };
  const colR = { x: W * 0.5 + 6, y: 36, w: W * 0.5 - 22, h: H - 48 };
  const [v2d, vPair] = rows(colL, [1.55, 1], 12);
  drawSubcostal(ctx, v2d, P.sc, { box: boxLines(v, m, true) });
  drawPair(ctx, vPair, { d: P.d, hvW: m.hvW, beat: P.beat, t: P.tm });
  const [r1, r2, r3] = rows(colR, [1.1, 0.95, 0.72], 12);
  drawMmode(ctx, r1, P.p, P.u);
  drawHV(ctx, r2, m.hv, P.sweep);
  meters(sh, t, r3, meterItems(v, m));
}

function meterItems(v, m) {
  const e = m.est, cut = m.mode === 'quiet' ? 20 : 50;
  return [
    { k: 'IVC diameter', v: v.D, u: 'cm', d: 1, lo: 0.8, hi: 3.4, cuts: [[2.1, '2.1'], [2.5, '2.5']], bad: v.D > 2.1 },
    m.mode === 'ppv'
      ? { k: 'Collapse: not used', v: NaN, u: '', lo: 0, hi: 100, cuts: [], bad: false }
      : { k: m.mode === 'quiet' ? 'Collapse, quiet' : 'Collapse, sniff', v: m.col, u: '%', lo: 0, hi: 100, cuts: [[cut, String(cut)]], bad: m.col < cut },
    { k: 'Hepatic vein S/D', v: m.sd ?? NaN, u: '', d: 1, lo: 0, hi: 2.5, cuts: [[1, '1']], bad: m.sd === null || m.sd < 1 },
    { k: 'S/(S+D)', v: m.sff ?? NaN, u: '%', lo: 0, hi: 100, cuts: [[55, '55']], bad: m.sff === null || m.sff < 55 },
    { k: 'RA pressure', v: e.rap ?? NaN, u: 'mmHg', lo: 0, hi: 25, cuts: [[5, '5'], [10, '10'], [20, '20']], bad: e.level === 'raised' || e.rap === 8 },
  ];
}

// ---------------------------------------------------------------- the tour
// 0-2 s the defaults (3 mmHg); 2-4.5 s the IVC widens to 2.4 cm (indeterminate past 2.1 cm:
// 8 mmHg); 5-7.5 s the collapse falls to 30% (15 mmHg below 50%); 8-9.5 s severe TR, the IVC
// at 2.7 cm (20 mmHg can be considered); from 11 s positive-pressure ventilation.
function tourState(tt) {
  const s = { ...DEF };
  if (tt >= 2) s.ivcD = Math.round((1.8 + clamp((tt - 2) / 2.5, 0, 1) * 0.6) * 10) / 10;
  if (tt >= 5) s.ivcSniff = Math.round((60 - clamp((tt - 5) / 2.5, 0, 1) * 30) / 5) * 5;
  if (tt >= 8) { s.ivcTR = 'severe'; s.ivcD = Math.round((2.4 + clamp((tt - 8) / 1.5, 0, 1) * 0.3) * 10) / 10; }
  if (tt >= 11) s.ivcBreath = 'ppv';
  return s;
}

const ivcPage = {
  key: 'ivc',
  part: 'hemodynamics',
  title: 'Inferior vena cava',
  nav: 'IVC',
  dwell: 16,
  defaults: { ...DEF },
  watch: Object.keys(DEF),
  figure(fig) {
    sheet = new Sheet(fig.querySelector('canvas'), (sh, t) => draw(sh, t));
    return sheet;
  },
  init({ state, set }) {
    st = state;
    setState = set;
    dg = ivcDiagram({ host: document.getElementById('ivc-ase'), K, get: () => st, set: (p) => setState(p), live: '#ch-ivc .live' });
  },
  // on the way in and out, the next drawing sets the baseline: no flash for changes made elsewhere
  enter() { dg?.reset(); },
  leave() { dg?.reset(); },
  pulse: () => panels.pulse(),
  anim(dt) {
    if (panels.tick(dt) && sheet) sheet.dirty = true;
  },
  tourEnter(set) { set({ ...DEF }); },
  tourTick(tt, set) { set(tourState(tt)); },
  /** The tour time at which tourTick gives state s (the first such time), or 0. */
  tourAt(s) {
    for (let tt = 0; tt <= ivcPage.dwell; tt += 0.05) {
      const p = tourState(tt);
      if (Object.keys(p).every((k) => s[k] === p[k])) return Math.round(tt * 100) / 100;
    }
    return 0;
  },
  text(s, { cite }) {
    const v = valuesOf(s, K), m = model(v);
    return {
      readouts: [
        ...readoutsOf(v, m),
        { k: 'Hepatic vein flow', v: HV_NAME[m.hv], text: true, flag: m.hv !== 'normal' },
        { k: 'Hepatic vein S/D', v: m.sd === null ? '–' : fmt(m.sd, 1), flag: m.sd === null || m.sd < 1 },
        { k: 'S/(S + D)', v: m.sff === null ? '–' : fmt(m.sff), u: m.sff === null ? '' : '%', flag: m.sff === null || m.sff < 55 },
      ],
      live: liveOf(v, m, cite),
      extra: () => dg?.render(v, m),
    };
  },
};
export default ivcPage;
