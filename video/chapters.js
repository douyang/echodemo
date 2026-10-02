// The chapter videos (video/chapter.html?ch=key): one for each chapter but 07, which has the
// views video (video/cuts.js). No DOM: the page, the render tool and the score read it.
//
// A video: the title card (intro, in beats; one beat = 60/70 s), then the chapter's figure
// through its steps, then the end card (outro). The steps follow the chapter's own tour (its
// tourTick, src/ch/*.js), slowed, with a hold on each, and the slider values its page offers.
//
// A step:
//   set     state keys of the chapter at the start of the hold, over those of the steps before
//   preset  a preset of the chapter (video `presets`: the module's table and the key it sets)
//   drift   numbers that move evenly to these values across the hold
//   via     keys set while the plane moves into the step (the loop's sliders move as 'custom')
//   move    beats from the step before (numbers ease; other values change at the middle)
//   hold    beats on the step
//   name, line   the caption; by default the chapter's live sentence at the step's state: its
//           bold lead, then the rest. pick: which sentences of the rest (0 = the first)
//   track   the step's name on the progress line (by default its caption name)
// A video: pane (the figure pane's name), zoom (the figure is laid out for a box `zoom` times
// smaller and drawn larger), side (the measurements pane; false for none), sub (the title
// card's line; by default the first sentence of the chapter's dek), quant (a step for each
// number that moves, as its slider has: the figure sees the values the site shows), presets.
import { BEAT, FPS } from './timeline.js';

const STEP = { move: 3, hold: 5 };
/** The music's tempo (tools/score/pulse.py): the end card falls on a bar line after whole phrases. */
const PHRASE = (16 * 60) / 109.3;   // s: four bars of four beats

export const VIDEOS = {
  // 01: the tour raises the frequency from 2 to 7 MHz, then turns time gain compensation on
  pulse: {
    pane: 'Pulse and echoes',
    quant: { freq: 0.1 },
    steps: [
      { set: { freq: 2, cycles: 2, tgc: false }, name: '2 MHz', hold: 6 },
      { set: { freq: 3.5 }, name: '3.5 MHz', move: 4, hold: 6 },
      { set: { freq: 5 }, name: '5 MHz', move: 4, hold: 6 },
      { set: { freq: 7 }, name: '7 MHz', move: 4, hold: 6 },
      { set: { tgc: true }, name: 'Time gain compensation', track: 'TGC', pick: [2, 3], move: 2, hold: 7 },
    ],
  },
  // 02: depth from 16 to 24 cm and back, then the four artifacts
  image: {
    pane: 'Scan lines and frames',
    quant: { depth: 1 },
    steps: [
      { set: { depth: 16, sector: 80, density: 1.2, focus: 10, artifact: 'none' }, name: '16 cm deep', track: '16 cm' },
      { set: { depth: 24 }, name: '24 cm deep', track: '24 cm', move: 4 },
      { set: { depth: 16, artifact: 'reverb' }, name: 'Reverberation', pick: [2], move: 4 },
      { set: { artifact: 'shadow' }, name: 'Acoustic shadow', track: 'Shadow', pick: [2] },
      { set: { artifact: 'mirror' }, name: 'Mirror image', track: 'Mirror', pick: [2] },
      { set: { artifact: 'lobe' }, name: 'Side lobe', pick: [2], hold: 6 },
    ],
  },
  // 03: the beam angle, aliasing past the Nyquist limit, continuous wave, color
  shift: {
    pane: 'Doppler',
    quant: { angle: 1, vtrue: 0.05 },
    steps: [
      { set: { dmode: 'pw', angle: 0, vtrue: 1, sdepth: 10, f0: 2.5 }, name: 'Beam along the flow', track: '0°' },
      { set: { angle: 60 }, name: '60° to the flow', track: '60°', pick: [0, 1], move: 4 },
      { set: { angle: 0, vtrue: 2 }, name: 'Past the Nyquist limit', track: 'Aliasing', pick: [0, 2, 3], move: 4 },
      { set: { dmode: 'cw' }, name: 'Continuous wave', track: 'CW', pick: [2] },
      { set: { dmode: 'color', vtrue: 1 }, name: 'Color Doppler', track: 'Color', pick: [2, 3] },
      { set: { vtrue: 2 }, name: 'Color aliasing', track: 'Color, 2 m/s', pick: [0, 3], move: 4 },
    ],
  },
  // 04: a caliper error on the LVOT, then the TR jet and the IVC
  pressure: {
    pane: 'Flow and gradients',
    quant: { calErr: 0.5, trV: 0.05, ivcD: 0.1 },
    steps: [
      { set: { sv: 70, lvotD: 2, calErr: 0, hr: 70, trV: 2.4, ivcD: 1.8, ivcCollapse: 'gt' }, name: 'Stroke volume from the LVOT', track: 'Stroke volume', pick: [0], hold: 6 },
      { set: { calErr: 2 }, name: 'A 2 mm caliper error', track: '+2 mm', pick: [0], move: 4, hold: 6 },
      { set: { calErr: 0 }, name: 'RV systolic pressure', track: 'RVSP', pick: [1], move: 4, hold: 6 },
      { set: { trV: 3, ivcD: 2.4 }, name: 'A faster jet, a wide IVC', track: 'TR 3.0 m/s', pick: [1], move: 4, hold: 6 },
      { set: { trV: 3.5, ivcCollapse: 'lt' }, name: 'The IVC collapses less than 50%', track: 'TR 3.5 m/s', pick: [1], move: 4, hold: 7 },
    ],
  },
  // 05: the cursor runs through one beat, phase by phase
  cycle: {
    pane: 'One heartbeat',
    side: false,
    steps: [
      { set: { tcycle: 28, crun: false }, drift: { tcycle: 62 }, track: 'IVC', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 70 }, drift: { tcycle: 195 }, track: 'Rapid ejection', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 205 }, drift: { tcycle: 350 }, track: 'Reduced ejection', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 362 }, drift: { tcycle: 448 }, track: 'IVR', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 460 }, drift: { tcycle: 692 }, track: 'Rapid filling', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 706 }, drift: { tcycle: 776 }, track: 'Diastasis', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 786 }, drift: { tcycle: 852 }, track: 'Atrial', pick: [1, 2, 3], move: 1, hold: 7 },
    ],
  },
  // 06: the five hearts of the tour; between them the sliders move as the page's 'custom'
  loop: {
    pane: 'Pressure–volume loop',
    presets: { from: 'PV_PRESETS', key: 'pv' },
    steps: [
      { preset: 'normal', pick: [0, 1], track: 'Normal', hold: 6 },
      { preset: 'hfref', via: { pv: 'custom' }, pick: [0, 1], track: 'HFrEF', move: 4, hold: 6 },
      { preset: 'hfpef', via: { pv: 'custom' }, pick: [0, 1], track: 'HFpEF', move: 4, hold: 6 },
      { preset: 'as', via: { pv: 'custom' }, pick: [0, 1], track: 'Pressure load', move: 4, hold: 6 },
      { preset: 'mr', via: { pv: 'custom' }, pick: [0, 1], track: 'Volume load', move: 4, hold: 7 },
    ],
  },
  // 08: the tour's four sets of planes (PRESETS in src/ch/planes.js), each seen from its own side
  planes: {
    pane: '',   // the figure names its two panes itself
    side: false,
    steps: [
      { set: { pviews: 'plax,psax_av,psax_mv,psax_pm,a4c,a2c,a3c,sc4c,ssn', pfocus: 'plax', pcam: 'front', pstruct: 'none', pheart: true, pcut: false, plines: true, pfree: false },
        track: 'Nine views', hold: 9 },
      { set: { pviews: 'a4c,a5c,a2c,a3c', pfocus: 'a2c', pcam: 'apex' }, name: 'Apical planes rotate about the LV long axis', track: 'Apical', move: 4, hold: 9 },
      { set: { pviews: 'psax_av,psax_mv,psax_pm,psax_ap', pfocus: 'psax_mv', pcam: 'side' }, name: 'Short-axis planes are parallel slices', track: 'Short axis', move: 4, hold: 9 },
      { set: { pviews: 'plax,psax_av,psax_mv,psax_pm,a4c,a2c,a3c,sc4c,ssn', pfocus: 'a3c', pcam: 'front', pstruct: 'av' }, name: 'One structure, several views', track: 'Aortic valve', move: 4, hold: 9 },
    ],
  },
  // 09: a dilated LV with a low EF, foreshortening, then the RV
  eject: {
    pane: 'Volumes and function',
    quant: { edv: 1, ef: 1, fore: 1, tapse: 0.5, sPrime: 0.5, fac: 1 },
    steps: [
      { set: { side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, tapse: 22, sPrime: 12, fac: 45, frame8: 'cine' }, name: 'Normal LV', track: 'Normal LV', pick: [0, 2], hold: 6 },
      { set: { edv: 200, ef: 30 }, name: 'Dilated LV, low EF', track: 'Low EF', pick: [0, 1], move: 4, hold: 6 },
      { set: { edv: 120, ef: 60, fore: 20 }, name: 'Foreshortened views', track: 'Foreshortened', pick: [2, 3], move: 4, hold: 6 },
      { set: { fore: 0, side: 'rv' }, name: 'Normal RV', track: 'Normal RV', pick: [0, 1], move: 4, hold: 6 },
      { set: { tapse: 12, sPrime: 7, fac: 27 }, name: 'RV dysfunction', track: 'Low RV function', pick: [0], move: 4, hold: 7 },
    ],
  },
  // 10: the three coronary territories, akinetic
  segments: {
    pane: 'Seventeen segments',
    steps: [
      { set: { culprit: 'none', wm: 3 }, name: 'Normal', line: 'All 16 segments score 1, and the wall motion score index is 1.00.', hold: 8 },
      { set: { culprit: 'lad' }, track: 'LAD', pick: [0, 1], move: 4, hold: 9 },
      { set: { culprit: 'rca' }, track: 'RCA', pick: [0, 1], move: 4, hold: 9 },
      { set: { culprit: 'lcx' }, track: 'Circumflex', pick: [0, 1], move: 4, hold: 9 },
    ],
  },
  // 11: from normal filling to grade 3
  fill: {
    pane: 'Filling',
    quant: { fstate: 0.05 },
    steps: [
      { set: { fstate: 0, fCine: true }, track: 'Normal', pick: [0, 1], hold: 8 },
      { set: { fstate: 1 }, track: 'Grade 1', pick: [0], move: 4, hold: 8 },
      { set: { fstate: 2 }, track: 'Grade 2', line: '{s0} E/A {E/A}, average E/e′ {Average E/e′}.', move: 4, hold: 8 },
      { set: { fstate: 3 }, track: 'Grade 3', line: '{s0} E/A {E/A}, average E/e′ {Average E/e′}.', move: 4, hold: 9 },
    ],
  },
  // 12-17: the severity pages, a step in the middle of each grade band (the page's slider)
  as: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { asS: 0.005 },
    steps: [
      { set: { asS: 0.05, asCine: true }, name: 'No stenosis', track: 'None', hold: 4 },
      { set: { asS: 0.145 }, name: 'Mild aortic stenosis', track: 'Mild', hold: 4 },
      { set: { asS: 0.265 }, name: 'Moderate aortic stenosis', track: 'Moderate', hold: 4 },
      { set: { asS: 0.4 }, name: 'Severe by area only', track: 'Area only', pick: [0, 1], hold: 5 },
      { set: { asS: 0.55 }, name: 'Severe aortic stenosis', track: 'Severe', hold: 4 },
      { set: { asS: 0.72 }, name: 'Very severe aortic stenosis', track: 'Very severe', hold: 4 },
      { set: { asS: 0.87 }, name: 'Severe, with LV dysfunction', track: 'LV dysfunction', line: '{s0} LVEF {LVEF}%: below 50%.', hold: 4 },
      { set: { asS: 0.97 }, name: 'Severe, low flow, low gradient', track: 'Low flow', pick: [0, 1, 2], hold: 6 },
    ],
  },
  ar: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { arS: 0.005 },
    steps: [
      { set: { arS: 0, arCine: true }, name: 'No regurgitation', track: 'None', line: '', hold: 5 },
      { set: { arS: 0.15 }, name: 'Mild aortic regurgitation', track: 'Mild', move: 4, hold: 6 },
      { set: { arS: 0.41 }, name: 'Moderate aortic regurgitation', track: 'Moderate', move: 4, hold: 6 },
      { set: { arS: 0.66 }, name: 'Severe aortic regurgitation', track: 'Severe', move: 4, hold: 6 },
      { set: { arS: 0.9 }, name: 'Severe, with LV dysfunction', track: 'LV dysfunction', pick: [0, 2], move: 4, hold: 7 },
    ],
  },
  ms: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { msS: 0.005, hr: 1 },
    steps: [
      { set: { msS: 0.03, msCine: true, hr: 70 }, name: 'Normal mitral valve', track: 'None', line: 'Area {Mitral valve area} cm², pressure half-time {Pressure half-time} ms.', hold: 5 },
      { set: { msS: 0.15 }, name: 'Mild mitral stenosis', track: 'Mild', move: 4, hold: 6 },
      { set: { msS: 0.37 }, name: 'Moderate mitral stenosis', track: 'Moderate', move: 4, hold: 6 },
      { set: { msS: 0.85 }, name: 'Severe mitral stenosis', track: 'Severe', move: 4, hold: 6 },
      { set: { hr: 110 }, name: 'Severe, at 110 beats a minute', track: 'Faster heart', pick: [0], move: 4, hold: 7 },
    ],
  },
  mr: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { mrS: 0.005 },
    steps: [
      { set: { mrS: 0, mrCine: true, mrColor: 'jet' }, name: 'No regurgitation', track: 'None', line: '', hold: 5 },
      { set: { mrS: 0.15 }, name: 'Mild mitral regurgitation', track: 'Mild', move: 4, hold: 6 },
      { set: { mrS: 0.4 }, name: 'Moderate mitral regurgitation', track: 'Moderate', move: 4, hold: 6 },
      { set: { mrS: 0.65 }, name: 'Severe mitral regurgitation', track: 'Severe', move: 4, hold: 6 },
      { set: { mrS: 0.9 }, name: 'Severe, with LV dysfunction', track: 'LV dysfunction', move: 4, hold: 7 },
    ],
  },
  tr: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { trS: 0.005 },
    steps: [
      { set: { trS: 0, trCine: true, trColor: 'jet' }, name: 'No regurgitation', track: 'None', line: '' },
      { set: { trS: 0.1 }, name: 'Mild tricuspid regurgitation', track: 'Mild' },
      { set: { trS: 0.3 }, name: 'Moderate tricuspid regurgitation', track: 'Moderate' },
      { set: { trS: 0.5 }, name: 'Severe tricuspid regurgitation', track: 'Severe' },
      { set: { trS: 0.7 }, name: 'Massive tricuspid regurgitation', track: 'Massive', pick: [0, 1, 3] },
      { set: { trS: 0.9 }, name: 'Torrential tricuspid regurgitation', track: 'Torrential', pick: [0, 1, 3], hold: 6 },
    ],
  },
  peri: {
    pane: 'Echo and Doppler',
    side: false,
    quant: { periS: 0.005 },
    steps: [
      { set: { periS: 0.04, periCine: true }, name: 'No effusion', track: 'None', line: 'The two layers of the pericardium lie together.', hold: 5 },
      { set: { periS: 0.2 }, name: 'Mild effusion', track: 'Mild', move: 4, hold: 6 },
      { set: { periS: 0.45 }, name: 'Moderate effusion', track: 'Moderate', move: 4, hold: 6 },
      { set: { periS: 0.64 }, name: 'Severe effusion', track: 'Severe', pick: [0, 2, 3], move: 4, hold: 6 },
      { set: { periS: 0.85 }, name: 'Tamponade', track: 'Tamponade', pick: [0, 1, 4], move: 4, hold: 7 },
    ],
  },
  // 18: the walls thicken; the echo criteria are met; the apex is spared
  amyloid: {
    pane: 'Echo signs',
    side: false,
    quant: { amyS: 0.0025 },
    steps: [
      { set: { amyS: 0 }, track: 'Normal wall', pick: [1, 2], hold: 6 },
      { set: { amyS: 0.3 }, track: 'Wall 11 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.45 }, track: 'Wall ≥12 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.6 }, track: 'Criteria met', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.9 }, name: 'Apical sparing', track: 'Apex spared', pick: [0, 2], move: 4, hold: 7 },
    ],
  },
};

/** The video's chapter keys. */
export const KEYS = Object.keys(VIDEOS);

/**
 * Holds, moves and the two cards of a chapter video, in beats and in seconds, and its length.
 * The last hold takes up to 6 more beats, so that the music's tempo (whole phrases of four bars
 * to the end card) comes closest to 109.3 BPM; an `exact` video (a clip of the intro, video/reel.js)
 * keeps its own lengths.
 */
export function chapterLayout(v) {
  const intro = v.intro ?? 4, outro = v.outro ?? 5;
  const holds = v.steps.map((st) => st.hold ?? STEP.hold), moves = v.steps.map((st, k) => (k ? st.move ?? STEP.move : 0));
  const base = intro + holds.reduce((a, b) => a + b, 0) + moves.reduce((a, b) => a + b, 0);
  let pad = 0, best = Infinity;
  for (let p = 0; p <= (v.exact ? 0 : 6); p++) {
    const tEnd = (base + p) * BEAT, n = Math.max(1, Math.round(tEnd / PHRASE));
    const off = Math.abs(tEnd / n - PHRASE) / PHRASE;
    if (off < best - 1e-9) { best = off; pad = p; }
  }
  holds[holds.length - 1] += pad;
  const segs = [];
  let b = 0;
  const push = (s, beats) => { segs.push({ ...s, b0: b, b1: b + beats, t0: b * BEAT, t1: (b + beats) * BEAT }); b += beats; };
  push({ kind: 'title' }, intro);
  v.steps.forEach((st, k) => {
    if (k) push({ kind: 'move', from: k - 1, to: k, i: k - 1, cross: true }, moves[k]);
    push({ kind: 'hold', i: k }, holds[k]);
  });
  push({ kind: 'end' }, outro);
  const tour = { t0: segs[1].t0, t1: segs[segs.length - 1].t0 };
  return { segs, beats: b, duration: b * BEAT, frames: Math.round(b * BEAT * FPS), tour, pad };
}

/**
 * The state of each step: a, at the start of its hold (its keys over those of the steps before);
 * b, at the end (a with its drift); via, the keys set while the plane moves into it. presets:
 * the chapter's preset table (video `presets.from`), when the video names presets.
 */
export function stepStates(v, presets = null) {
  const out = [];
  let acc = {};
  for (const st of v.steps) {
    const p = st.preset != null ? { [v.presets.key]: st.preset, ...presets[st.preset] } : {};
    const a = { ...acc, ...p, ...(st.set || {}) };
    const b = { ...a, ...(st.drift || {}) };
    out.push({ a, b, via: st.via || {} });
    acc = b;
  }
  return out;
}

/**
 * Events the soundtrack follows (seconds), in the shape of the views video's (timeline.js
 * events()): each arrival at a step, each move, the end card; the steps are its windows.
 */
export function chapterEvents(v) {
  const L = chapterLayout(v);
  const ev = [];
  for (const s of L.segs) {
    if (s.kind === 'hold') ev.push({ type: 'arrive', t: s.t0, b: s.b0, i: s.i, view: `step${s.i}`, win: `step${s.i}` });
    if (s.kind === 'move') ev.push({ type: 'window', t: s.t0, b: s.b0, t1: s.t1, b1: s.b1, from: `step${s.from}`, to: `step${s.to}` });
    if (s.kind === 'end') ev.push({ type: 'end', t: s.t0, b: s.b0 });
  }
  for (let k = 1; k < ev.length; k++) if (ev[k].type === 'arrive' && ev[k - 1].type === 'window') ev[k].newWindow = true;
  ev.find((e) => e.type === 'arrive').first = true;
  const windows = L.segs.filter((s) => s.kind === 'hold').map((s) => ({ win: `step${s.i}`, t0: s.t0, t1: s.t1, views: [`step${s.i}`] }));
  return { ...L, events: ev, lastBeat: L.beats - 1, windows };
}
