// The chapter videos (video/chapter.html?ch=key): one for each chapter but 07, whose video is cut
// B of the views video (video/cuts.js). No DOM: the page, the render tool and the score read it.
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
//   cut     every key changes at the middle of the move: for a step that switches the kind
//           (a mass, a valve, a defect or a disease) whose slider value means another thing
//   hold    beats on the step
//   name, line   the caption; by default the chapter's live sentence at the step's state: its
//           bold lead, then the rest. pick: which sentences of the rest (0 = the first)
//   track   the step's name on the progress line (by default its caption name)
// A video: pane (the figure pane's name), zoom (the figure is laid out for a box `zoom` times
// smaller and drawn larger), side (the measurements pane; false for none), sub (the title
// card's line; by default the first sentence of the chapter's dek), quant (a step for each
// number that moves, as its slider has: the figure sees the values the site shows), presets,
// discrete (numbers that change at the middle of a move, as text does: a control with set values).
// A step's pheno names the heart (src/pheno.js); the 2D views draw its valves.
// A video of several chapters: chapters (their keys, in the order shown), title (the title
// card's), pane (an object: the pane name of each chapter) and a step's ch (the chapter it shows;
// by default the first). The video's key names it; the figure dips to the page between chapters.
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
      { set: { freq: 2, cycles: 2, tgc: false }, name: 'Transmit frequency 2 MHz', track: '2 MHz', hold: 6 },
      { set: { freq: 3.5 }, name: 'Transmit frequency 3.5 MHz', track: '3.5 MHz', move: 4, hold: 6 },
      { set: { freq: 5 }, name: 'Transmit frequency 5 MHz', track: '5 MHz', move: 4, hold: 6 },
      { set: { freq: 7 }, name: 'Transmit frequency 7 MHz', track: '7 MHz', move: 4, hold: 6 },
      { set: { tgc: true }, name: 'Time gain compensation', track: 'TGC', pick: [2, 3], move: 2, hold: 7 },
    ],
  },
  // 02: depth from 16 to 24 cm and back, then the four artifacts
  image: {
    pane: 'Scan lines and frames',
    quant: { depth: 1 },
    steps: [
      { set: { depth: 16, sector: 80, density: 1.2, focus: 10, artifact: 'none' }, name: 'Imaging depth 16 cm', track: '16 cm' },
      { set: { depth: 24 }, name: 'Imaging depth 24 cm', track: '24 cm', move: 4 },
      { set: { depth: 16, artifact: 'reverb' }, name: 'Reverberation', pick: [2], move: 4 },
      { set: { artifact: 'shadow' }, name: 'Acoustic shadow', track: 'Shadow', pick: [2] },
      { set: { artifact: 'mirror' }, name: 'Mirror image', track: 'Mirror', pick: [2] },
      { set: { artifact: 'lobe' }, name: 'Side-lobe artifact', track: 'Side lobe', pick: [2], hold: 6 },
    ],
  },
  // 03: the beam angle, aliasing past the Nyquist limit, continuous wave, color
  shift: {
    pane: 'Doppler',
    quant: { angle: 1, vtrue: 0.05 },
    steps: [
      { set: { dmode: 'pw', angle: 0, vtrue: 1, sdepth: 10, f0: 2.5 }, name: 'Beam parallel to the flow', track: '0°' },
      { set: { angle: 60 }, name: 'Beam at 60° to the flow', track: '60°', pick: [0, 1], move: 4 },
      { set: { angle: 0, vtrue: 2 }, name: 'Aliasing above the Nyquist limit', track: 'Aliasing', pick: [0, 2, 3], move: 4 },
      { set: { dmode: 'cw' }, name: 'Continuous-wave Doppler', track: 'CW', pick: [2] },
      { set: { dmode: 'color', vtrue: 1 }, name: 'Color Doppler', track: 'Color', pick: [2, 3] },
      { set: { vtrue: 2 }, name: 'Aliasing on color Doppler', track: 'Color, 2 m/s', pick: [0, 3], move: 4 },
    ],
  },
  // Doppler hemodynamics: the valve narrows, then the aorta; then the TR jet and the RA pressure (from the IVC chapter)
  pressure: {
    pane: 'Flow and pressure',
    quant: { valveA: 0.05, aoD: 0.1, trV: 0.05 },
    discrete: ['rap'],
    steps: [
      { set: { sv: 70, lvotD: 2, valveA: 2.5, aoD: 3, trV: 2.4, rap: 3 }, name: 'The same flow at every level', track: 'Flow', pick: [0], hold: 6 },
      { set: { valveA: 1.2 }, name: 'A narrower valve: the velocity rises', track: 'Valve 1.2 cm²', pick: [0], move: 4, hold: 6 },
      { set: { valveA: 0.7 }, name: 'The pressure falls where the velocity rises', track: 'Valve 0.7 cm²', pick: [1], move: 4, hold: 6 },
      { set: { aoD: 2.2 }, name: 'A small aorta: more pressure recovery', track: 'Aorta 2.2 cm', pick: [1], move: 4, hold: 6 },
      { set: { trV: 3, rap: 8 }, name: 'Higher peak TR velocity, RA pressure 8 mmHg', track: 'TR 3.0 m/s', pick: [2], move: 4, hold: 6 },
      { set: { trV: 3.5, rap: 15 }, name: 'RA pressure 15 mmHg', track: 'TR 3.5 m/s', pick: [2], move: 4, hold: 7 },
    ],
  },
  // 05: the cursor runs through one beat, phase by phase
  cycle: {
    pane: 'Cardiac cycle',
    side: false,
    steps: [
      { set: { tcycle: 28, crun: false }, drift: { tcycle: 62 }, track: 'IVCT', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 70 }, drift: { tcycle: 195 }, track: 'Rapid ejection', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 205 }, drift: { tcycle: 350 }, track: 'Reduced ejection', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 362 }, drift: { tcycle: 448 }, track: 'IVRT', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 460 }, drift: { tcycle: 692 }, track: 'Rapid filling', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 706 }, drift: { tcycle: 776 }, track: 'Diastasis', pick: [1, 2, 3], move: 1, hold: 6 },
      { set: { tcycle: 786 }, drift: { tcycle: 852 }, track: 'Atrial contraction', pick: [1, 2, 3], move: 1, hold: 7 },
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
  // 08: a dilated LV with a low EF, foreshortening, then the RV
  // 09: the LV only (the RV went to chapter 13)
  eject: {
    pane: 'Volumes and function',
    quant: { edv: 1, ef: 1, fore: 1 },
    steps: [
      { set: { side: 'lv', edv: 120, ef: 60, wall: 9, fore: 0, ejSex: 'M', frame8: 'cine' }, name: 'Normal LV systolic function', track: 'Normal LV', pick: [0, 2], hold: 6 },
      { set: { edv: 200, ef: 30 }, name: 'Dilated LV with reduced LVEF', track: 'Reduced LVEF', pick: [0, 1], move: 4, hold: 6 },
      { set: { edv: 120, ef: 60, fore: 20 }, name: 'Foreshortened apical views', track: 'Foreshortened', pick: [2, 3], move: 4, hold: 6 },
      { set: { fore: 0 }, name: 'The views through the true apex', track: 'True apex', pick: [0, 2], move: 4, hold: 6 },
    ],
  },
  // 09: the three coronary territories, akinetic
  segments: {
    pane: '17-segment model',
    steps: [
      { set: { culprit: 'none', wm: 3 }, name: 'Normal wall motion', line: 'All 16 segments are scored 1 (normal), and the wall motion score index is 1.00.', track: 'Normal', hold: 8 },
      { set: { culprit: 'lad' }, track: 'LAD', pick: [0, 1], move: 4, hold: 9 },
      { set: { culprit: 'rca' }, track: 'RCA', pick: [0, 1], move: 4, hold: 9 },
      { set: { culprit: 'lcx' }, track: 'Circumflex', pick: [0, 1], move: 4, hold: 9 },
    ],
  },
  // 10: from normal filling to grade 3
  fill: {
    pane: 'Diastolic function',
    quant: { fstate: 0.05 },
    steps: [
      { set: { fstate: 0, fCine: true }, track: 'Normal', pick: [0, 1], hold: 8 },
      { set: { fstate: 1 }, track: 'Grade 1', pick: [0], move: 4, hold: 8 },
      { set: { fstate: 2 }, track: 'Grade 2', line: '{s0} The E/A ratio is {E/A}, and the average E/e′ is {Average E/e′}.', move: 4, hold: 8 },
      { set: { fstate: 3 }, track: 'Grade 3', line: '{s0} The E/A ratio is {E/A}, and the average E/e′ is {Average E/e′}.', move: 4, hold: 9 },
    ],
  },
  // 11-16: the severity pages, a step in the middle of each grade band (the page's slider)
  as: {
    pane: '2D and Doppler',
    side: false,
    quant: { asS: 0.005 },
    steps: [
      { set: { asS: 0.05, asCine: true, pheno: 'normal' }, name: 'No aortic stenosis', track: 'None', pick: [0], hold: 4 },
      // the AVA (1.22 cm²) lies in the moderate band: the line says why the grade is mild (asGrade, src/norms.js)
      { set: { asS: 0.145 }, name: 'Mild aortic stenosis', track: 'Mild', line: '{s0} With an AVA of 1.0 cm² or more, the peak velocity and the mean gradient grade the valve.', hold: 4 },
      { set: { asS: 0.265 }, name: 'Moderate aortic stenosis', track: 'Moderate', hold: 4 },
      { set: { asS: 0.4 }, name: 'Normal-flow, low-gradient aortic stenosis', track: 'NF-LG', pick: [0, 1], hold: 5 },
      { set: { asS: 0.55 }, name: 'Severe aortic stenosis', track: 'Severe', hold: 4 },
      { set: { asS: 0.72 }, name: 'Very severe aortic stenosis', track: 'Very severe', hold: 4 },
      { set: { asS: 0.87 }, name: 'Severe aortic stenosis with LV dysfunction', track: 'LV dysfunction', line: '{s0} The LVEF is {LVEF}%, below 50%.', hold: 4 },
      { set: { asS: 0.97 }, name: 'Classical low-flow, low-gradient aortic stenosis', track: 'Low flow', pick: [0, 1, 2], hold: 6 },
      // the bicuspid heart (src/pheno.js) at its severe grade: the cusps dome, and the short axis shows two
      { set: { asS: 0.55, pheno: 'bav' }, name: 'Bicuspid aortic valve, severe stenosis', track: 'Bicuspid',
        line: 'The right and left cusps are fused, with a raphe. The valve domes in systole and opens off centre, and the ascending aorta measures 3.6 cm.', move: 3, hold: 6 },
    ],
  },
  ar: {
    pane: '2D and Doppler',
    side: false,
    quant: { arS: 0.005 },
    steps: [
      { set: { arS: 0, arCine: true }, name: 'No aortic regurgitation', track: 'None', line: '', hold: 5 },
      // the numbers, the Figure 25 criteria, then the LV (mild, moderate) or the ACC/AHA stage (severe)
      { set: { arS: 0.15 }, name: 'Mild aortic regurgitation', track: 'Mild', pick: [0, 1, 2], move: 4, hold: 6 },
      { set: { arS: 0.41 }, name: 'Moderate aortic regurgitation', track: 'Moderate', pick: [0, 1, 2], move: 4, hold: 6 },
      { set: { arS: 0.66 }, name: 'Severe aortic regurgitation', track: 'Severe', pick: [0, 1, 3], move: 4, hold: 6 },
      { set: { arS: 0.9 }, name: 'Severe aortic regurgitation with LV dysfunction', track: 'LV dysfunction', pick: [0, 1, 3], move: 4, hold: 7 },
    ],
  },
  ms: {
    pane: '2D and Doppler',
    side: false,
    quant: { msS: 0.005, hr: 1 },
    steps: [
      { set: { msS: 0.03, msCine: true, hr: 70 }, name: 'No mitral stenosis', track: 'None', line: 'The mitral valve area is {Mitral valve area} cm², and the pressure half-time is {Pressure half-time} ms.', hold: 5 },
      { set: { msS: 0.15 }, name: 'Mild mitral stenosis', track: 'Mild', move: 4, hold: 6 },
      { set: { msS: 0.37 }, name: 'Moderate mitral stenosis', track: 'Moderate', move: 4, hold: 6 },
      // severe: the numbers without the agreement line; at 110/min, the gradient and why its bands do not apply
      { set: { msS: 0.85 }, name: 'Severe mitral stenosis', track: 'Severe', pick: [0, 1, 2], move: 4, hold: 6 },
      { set: { hr: 110 }, name: 'Severe mitral stenosis, heart rate 110/min', track: 'Heart rate 110', pick: [1, 3], move: 4, hold: 7 },
    ],
  },
  mr: {
    pane: '2D and Doppler',
    side: false,
    quant: { mrS: 0.005 },
    steps: [
      { set: { mrS: 0, mrCine: true, mrColor: 'jet' }, name: 'No mitral regurgitation', track: 'None', line: '', hold: 5 },
      // the numbers, the Figure 18 criteria, then the chambers (mild, moderate) or the ACC/AHA stage (severe)
      { set: { mrS: 0.15 }, name: 'Mild mitral regurgitation', track: 'Mild', pick: [0, 1, 2], move: 4, hold: 6 },
      { set: { mrS: 0.4 }, name: 'Moderate mitral regurgitation', track: 'Moderate', pick: [0, 1, 2], move: 4, hold: 6 },
      { set: { mrS: 0.65 }, name: 'Severe mitral regurgitation', track: 'Severe', pick: [0, 1, 3], move: 4, hold: 6 },
      { set: { mrS: 0.9 }, name: 'Severe mitral regurgitation with LV dysfunction', track: 'LV dysfunction', pick: [0, 1, 3], move: 4, hold: 7 },
    ],
  },
  // 13: pressure overload from a normal RV to severe PH, and the septum at end-systole; then
  // volume overload, and the septum at end-diastole
  rv: {
    pane: '2D and Doppler',
    side: false,
    quant: { rvS: 0.005 },
    steps: [
      { set: { rvS: 0, rvLoad: 'pressure', rvFrame: 'cine', rvx: null }, name: 'Normal RV', track: 'Normal', pick: [1, 2], hold: 6 },
      { set: { rvS: 0.3 }, name: 'Mild pulmonary hypertension', track: 'Mild PH', pick: [0, 1], move: 4, hold: 6 },
      { set: { rvS: 0.5 }, name: 'Moderate pulmonary hypertension', track: 'Moderate PH', pick: [0, 2, 4], move: 4, hold: 7 },
      { set: { rvS: 0.9 }, name: 'Severe pulmonary hypertension', track: 'Severe PH', pick: [1, 2], move: 4, hold: 7 },
      { set: { rvFrame: 'es' }, name: 'End-systole: the septum flattens', track: 'End-systole', pick: [3], move: 2, hold: 5 },
      { set: { rvS: 0, rvFrame: 'cine' }, name: 'A normal RV again', track: 'Back', line: '', move: 3, hold: 2 },
      { set: { rvLoad: 'volume' }, name: 'Volume overload', track: 'Volume', line: 'The same RV under a volume load: an atrial septal defect, or significant TR or PR.', move: 1, hold: 3 },
      { set: { rvS: 0.5 }, name: 'Moderate RV dilation', track: 'Moderate dilation', pick: [0, 2], move: 4, hold: 6 },
      { set: { rvS: 0.85 }, name: 'Severe RV dilation', track: 'Severe dilation', pick: [0, 1], move: 4, hold: 7 },
      { set: { rvFrame: 'ed' }, name: 'End-diastole: the septum flattens', track: 'End-diastole', pick: [3], move: 2, hold: 6 },
    ],
  },
  tr: {
    pane: '2D and Doppler',
    side: false,
    quant: { trS: 0.005 },
    steps: [
      { set: { trS: 0, trCine: true, trColor: 'jet' }, name: 'No tricuspid regurgitation', track: 'None', line: '' },
      // the numbers, the Figure 31 criteria, then the right heart (mild) or the pressure; beyond
      // severe, the EACVI grade and the falling velocity
      { set: { trS: 0.1 }, name: 'Mild tricuspid regurgitation', track: 'Mild', pick: [0, 1, 2] },
      { set: { trS: 0.3 }, name: 'Moderate tricuspid regurgitation', track: 'Moderate', pick: [0, 1, 3] },
      { set: { trS: 0.5 }, name: 'Severe tricuspid regurgitation', track: 'Severe', pick: [0, 1, 3] },
      { set: { trS: 0.7 }, name: 'Massive tricuspid regurgitation', track: 'Massive', pick: [0, 3, 4] },
      { set: { trS: 0.9 }, name: 'Torrential tricuspid regurgitation', track: 'Torrential', pick: [0, 3, 4], hold: 6 },
    ],
  },
  // 19: a bioprosthesis from normal function to significant stenosis, then a mechanical valve;
  // then the normal bioprosthesis in larger patients: mismatch
  prosthetic: {
    pane: '2D and Doppler',
    side: false,
    quant: { proS: 0.005 },
    steps: [
      { set: { proS: 0, proValve: 'bio', proCause: 'obst' }, name: 'Normal bioprosthesis', track: 'Bio normal', pick: [0, 1, 2], hold: 7 },
      { set: { proS: 0.45 }, name: 'Possible stenosis of the bioprosthesis', track: 'Bio possible', pick: [0, 2, 3], move: 4, hold: 7 },
      { set: { proS: 0.85 }, name: 'Significant stenosis of the bioprosthesis', track: 'Bio significant', pick: [0, 2, 5], move: 4, hold: 7 },
      { set: { proS: 0, proValve: 'mech' }, name: 'Normal mechanical valve', track: 'Mech normal', pick: [0, 3], move: 3, cut: true, hold: 6 },
      { set: { proS: 0.42 }, name: 'Possible stenosis of the mechanical valve', track: 'Mech possible', pick: [0, 2, 3], move: 4, hold: 7 },
      { set: { proS: 0.85 }, name: 'Significant stenosis of the mechanical valve', track: 'Mech significant', pick: [0, 3, 4], move: 4, hold: 7 },
      { set: { proS: 0.5, proValve: 'bio', proCause: 'ppm' }, name: 'Moderate prosthesis–patient mismatch', track: 'Moderate mismatch', pick: [0, 1, 4], move: 3, cut: true, hold: 7 },
      { set: { proS: 0.9 }, name: 'Severe prosthesis–patient mismatch', track: 'Severe mismatch', pick: [1, 5, 6], move: 4, hold: 7 },
    ],
  },
  // infective endocarditis: a vegetation on the anterior mitral leaflet grows and prolapses; the
  // leaflet perforates, and the regurgitation through it grows from mild to severe
  endocarditis: {
    pane: '2D and Doppler',
    side: false,
    quant: { ieS: 0.005 },
    steps: [
      { set: { ieS: 0, ieFrame: 'cine' }, name: 'No vegetation', track: 'None', hold: 5 },
      { set: { ieS: 0.17 }, track: '<10 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { ieS: 0.4 }, track: '≥10 mm', pick: [1, 2], move: 4, hold: 7 },
      { set: { ieFrame: 'dia' }, name: 'Diastole: the vegetation prolapses into the LV', track: 'Diastole', pick: [1], move: 2, hold: 5 },
      { set: { ieS: 0.56, ieFrame: 'cine' }, track: 'Mild MR', pick: [3, 4], move: 4, hold: 6 },
      { set: { ieS: 0.7 }, track: 'Moderate MR', pick: [4], move: 4, hold: 6 },
      { set: { ieS: 0.9 }, track: 'Severe MR', pick: [4, 5, 6], move: 4, hold: 7 },
    ],
  },
  peri: {
    pane: '2D and Doppler',
    side: false,
    quant: { periS: 0.005 },
    steps: [
      { set: { periS: 0.04, periCine: true }, name: 'No pericardial effusion', track: 'None', pick: [0], hold: 5 },
      { set: { periS: 0.2 }, name: 'Mild pericardial effusion', track: 'Mild', move: 4, hold: 6 },
      { set: { periS: 0.45 }, name: 'Moderate pericardial effusion', track: 'Moderate', move: 4, hold: 6 },
      { set: { periS: 0.64 }, name: 'Severe pericardial effusion', track: 'Severe', pick: [0, 2, 3], move: 4, hold: 6 },
      { set: { periS: 0.85 }, name: 'Tamponade', track: 'Tamponade', pick: [0, 1, 4], move: 4, hold: 7 },
    ],
  },
  // hcm: at rest from a normal heart to severe obstruction; back to latent obstruction at rest;
  // the same heart with Valsalva and its SAM; then severe obstruction with Valsalva (the tour)
  hcm: {
    pane: '2D and Doppler',
    side: false,
    quant: { hcmS: 0.005 },
    steps: [
      { set: { hcmS: 0, hcmProv: 'rest', hcmFrame: 'cine' }, track: 'Normal', pick: [0, 1], hold: 6 },
      { set: { hcmS: 0.3 }, track: '13–14 mm', pick: [1], move: 4, hold: 6 },
      { set: { hcmS: 0.42 }, track: 'Wall ≥15 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { hcmFrame: 'ed' }, name: 'End-diastole: the septum and the posterior wall', track: 'End-diastole', pick: [0], move: 2, hold: 5 },
      { set: { hcmS: 0.72, hcmFrame: 'cine' }, track: 'At rest', pick: [1, 2], move: 4, hold: 7 },
      { set: { hcmS: 1 }, name: 'Severe obstruction at rest', track: 'Severe', pick: [1, 2], move: 4, hold: 7 },
      { set: { hcmS: 0.53 }, track: 'Latent', pick: [1, 2], move: 4, hold: 6 },
      { set: { hcmProv: 'valsalva' }, name: 'Latent obstruction: the Valsalva strain', track: 'Valsalva', pick: [1, 2], move: 2, hold: 7 },
      { set: { hcmFrame: 'sam' }, name: 'SAM: the leaflet meets the septum', track: 'SAM', pick: [3, 4], move: 2, hold: 6 },
      { set: { hcmS: 1, hcmFrame: 'cine' }, name: 'Severe obstruction with Valsalva', track: 'Severe, Valsalva', pick: [2, 6], move: 4, hold: 7 },
    ],
  },
  // constriction from a normal pericardium to all three Mayo Clinic criteria, then restrictive
  // cardiomyopathy to grade 3: a step in the middle of each band
  constrict: {
    pane: '2D and Doppler',
    side: false,
    quant: { conS: 0.005 },
    steps: [
      { set: { conS: 0, conMode: 'cp' }, track: 'Normal', pick: [0, 1], hold: 5 },
      { set: { conS: 0.35 }, track: 'Thickened', pick: [0, 1], move: 4, hold: 6 },
      { set: { conS: 0.58 }, track: 'Constriction', pick: [0, 1], move: 4, hold: 7 },
      { set: { conS: 0.9 }, track: '3 of 3', pick: [1, 2, 3], move: 4, hold: 7 },
      { set: { conS: 0.9 }, name: 'Annulus reversus', track: 'Annulus', pick: [4], move: 1, hold: 5 },
      { set: { conS: 0, conMode: 'rcm' }, name: 'Restrictive cardiomyopathy', track: 'Restriction', line: 'The same slider for restrictive cardiomyopathy: the stiff myocardium, not the pericardium, limits filling.', move: 3, cut: true, hold: 3 },
      { set: { conS: 0.28 }, track: 'Grade 1', pick: [0, 1], move: 4, hold: 6 },
      { set: { conS: 0.57 }, track: 'Grade 2', pick: [0, 1], move: 4, hold: 6 },
      { set: { conS: 0.92 }, track: 'Grade 3', pick: [1, 2, 3], move: 4, hold: 8 },
    ],
  },
  // 17: the walls thicken; the echo criteria are met; the apex is spared
  amyloid: {
    pane: 'Echocardiographic signs',
    side: false,
    quant: { amyS: 0.0025 },
    steps: [
      { set: { amyS: 0 }, track: 'Normal wall', pick: [1, 2], hold: 6 },
      { set: { amyS: 0.3 }, track: 'Wall 11 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.45 }, track: 'Wall ≥12 mm', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.6 }, track: 'ESC criteria met', pick: [0, 1], move: 4, hold: 6 },
      { set: { amyS: 0.9 }, name: 'Relative apical sparing', track: 'Apical sparing', pick: [0, 2], move: 4, hold: 7 },
    ],
  },
  // 21: a secundum ASD from none to large, a perimembranous VSD from restrictive to an RV
  // pressure of half the systemic pressure, the saline study for a PFO, then the LA pressure across
  // a restrictive atrial communication at a mean of 8, 18 and 28 mmHg (the chapter's tour)
  shunts: {
    pane: '2D and Doppler',
    side: false,
    quant: { shS: 0.005 },
    steps: [
      { set: { shType: 'asd', shS: 0, shMan: 'valsalva' }, track: 'No ASD', pick: [0, 1], hold: 5 },
      { set: { shS: 0.3 }, track: 'Small ASD', pick: [0, 1, 3], move: 4, hold: 6 },
      { set: { shS: 0.75 }, track: 'Significant ASD', pick: [0, 1, 2], move: 4, hold: 7 },
      { set: { shType: 'vsd', shS: 0.4 }, track: 'Restrictive VSD', pick: [0, 1, 4], move: 3, cut: true, hold: 7 },
      { set: { shS: 0.75 }, track: 'Significant VSD', pick: [1, 2, 4], move: 4, hold: 7 },
      { set: { shS: 1 }, name: 'Perimembranous VSD, RV pressure over half the systemic pressure', track: 'RVSP ≥50%', pick: [1, 2, 5], move: 4, hold: 7 },
      { set: { shType: 'pfo', shMan: 'valsalva', shS: 0.4 }, track: 'Valsalva only', pick: [0, 1], move: 3, cut: true, hold: 8 },
      { set: { shS: 0.9, shMan: 'rest' }, track: 'At rest', pick: [0, 1], move: 3, cut: true, hold: 8 },
      { set: { shType: 'lap', shS: 0 }, track: 'LAP 8 mmHg', line: 'A restrictive communication keeps a gradient between the atria: LA pressure = RA pressure + 4V². {s3}', move: 3, cut: true, hold: 7 },
      { set: { shS: 0.455 }, track: 'LAP 18 mmHg', pick: [1, 2, 3], move: 4, hold: 7 },
      { set: { shS: 0.91 }, track: 'LAP 28 mmHg', pick: [3, 5, 6], move: 4, hold: 8 },
    ],
  },
  // 18: from a normal IVC to a raised RA pressure, severe TR and ventilation (the chapter's tour),
  // then the IVC and the aorta side by side
  ivc: {
    pane: 'IVC and hepatic veins',
    side: false,
    quant: { ivcD: 0.1, ivcSniff: 5 },
    steps: [
      { set: { ivcD: 1.8, ivcSniff: 60, ivcQuiet: 30, ivcBreath: 'sniff', ivcSec: 'unclear', ivcTR: 'none' }, track: '3 mmHg', pick: [0, 1, 2], hold: 6 },
      { set: { ivcD: 2.4 }, name: 'Indeterminate: RA pressure 8 mmHg', track: '8 mmHg', pick: [0, 1, 3], move: 4, hold: 6 },
      { set: { ivcSniff: 30 }, track: '15 mmHg', pick: [0, 1, 3], move: 4, hold: 6 },
      { set: { ivcTR: 'severe', ivcD: 2.7 }, name: 'Severe tricuspid regurgitation', track: 'Severe TR', pick: [3, 4, 5, 6], move: 4, hold: 7 },
      // without TR, so that the hepatic veins show no sign that would set the estimate (Mukherjee 2025: 8 mmHg if doubt remains)
      { set: { ivcBreath: 'ppv', ivcTR: 'none' }, track: 'Ventilation', pick: [0, 1, 2], move: 3, hold: 6 },
      { set: { ivcD: 1.8, ivcSniff: 60, ivcBreath: 'sniff', ivcTR: 'none' }, name: 'IVC or aorta', track: 'IVC or aorta',
        line: 'The IVC has a thin wall, lies in the liver, receives the hepatic veins and narrows on a sniff. The aorta has a thick wall, lies outside the liver, gives off the celiac trunk and the SMA, and pulsates with no change on a sniff.', move: 3, hold: 7 },
    ],
  },
  // 19: the seven cases of the chapter's tour, each on the view that shows its territory best
  stress: {
    pane: 'Dobutamine stress',
    steps: [
      { set: { sxCase: 'normal', sxView: 'a4c' }, track: 'Normal', pick: [0], hold: 6 },
      { set: { sxCase: 'lad', sxView: 'a2c' }, track: 'LAD', pick: [1], hold: 7 },
      { set: { sxCase: 'rca', sxView: 'a2c' }, track: 'RCA', pick: [1], hold: 7 },
      { set: { sxCase: 'lcx', sxView: 'a4c' }, track: 'Circumflex', pick: [1], hold: 7 },
      { set: { sxCase: 'multi', sxView: 'a2c' }, track: 'Two vessels', pick: [1, 2], hold: 7 },
      { set: { sxCase: 'scar', sxView: 'a2c' }, track: 'Scar', pick: [0, 1], hold: 7 },
      { set: { sxCase: 'viable', sxView: 'a2c' }, track: 'Viable', pick: [1, 2, 3], hold: 8 },
    ],
  },
  // Cardiac masses: the chapter's tour. The myxoma grows until it obstructs the mitral valve;
  // the LV thrombus goes from mural to mobile, then an enhancing agent fills the cavity; the
  // fibroelastoma goes from sessile to mobile
  masses: {
    pane: '2D and Doppler',
    side: false,
    quant: { maS: 0.005 },
    steps: [
      { set: { maType: 'myxoma', maUea: false, maS: 0 }, track: 'No mass', pick: [1], hold: 5 },
      { set: { maS: 0.15 }, track: 'Myxoma', pick: [0, 1], move: 3, hold: 6 },
      { set: { maS: 0.62 }, track: 'Prolapse', pick: [0, 1], move: 4, hold: 7 },
      { set: { maS: 1 }, track: 'Obstruction', pick: [2], move: 4, hold: 7 },
      { set: { maType: 'thrombus', maS: 0 }, track: 'Akinetic apex', pick: [1], move: 2, cut: true, hold: 5 },
      { set: { maS: 0.2 }, track: 'Mural', pick: [0, 1], move: 3, hold: 6 },
      { set: { maS: 0.55 }, track: 'Protruding', pick: [0, 1], move: 4, hold: 6 },
      { set: { maS: 0.95 }, track: 'Mobile', pick: [0], move: 4, hold: 7 },
      { set: { maUea: true }, name: 'With an enhancing agent', track: 'Agent', pick: [2], move: 2, hold: 6 },
      { set: { maType: 'pfe', maUea: false, maS: 0.25 }, track: 'Sessile', pick: [0, 1], move: 2, cut: true, hold: 6 },
      { set: { maS: 0.85 }, track: 'Mobile', pick: [0, 1], move: 4, hold: 7 },
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
