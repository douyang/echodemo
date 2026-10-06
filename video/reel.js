// The intro: one clip from each of nine chapters, between a title card and the end card. The
// cuts fall on the bar lines of one score. No DOM. The pages, the render tool and the score read it.
//  - video/chapter.html?reel=k draws a chapter clip. video/index.html?reel=k draws the clip of Views.
//  - tools/render-video.mjs --reel renders the clips and joins them in order.
//  - tools/score/pulse.py intro writes the score. The clips are its windows.
//
// The clips come from a review of the chapter videos and the views video. Each is the most
// striking and most useful moment of its part of the site. No two clips teach the same lesson or
// show the same layout. Planes is archived since the review: the clip of Views has the time of
// both clips, and the nine planes of Planes in its Probe and body pane (video/cuts.js, planes).
// Left out, with the reason:
//  - Pulse, Doppler, Doppler hemodynamics: diagrams. The valve clips show Doppler in use.
//  - Loop: the cycle clip and the valve clips show its loads.
//  - Systolic function, Diastolic function: dense panels. LV function shows in the segments and
//    amyloid clips.
//  - AR, MS, TR: the layout of AS and MR.
// Stress echocardiography, added with its chapter, follows Regional wall motion, as its chapter does:
// the quad screen of a stress test. The right ventricle (chapter 14), added after the review, has no clip.
// AI interpretation and measurement closes the intro, as its part closes the site: the weights of
// the LV section, its task heads, then the anchor, which returns the septum's caliper from a second
// peak. Four bars, so that the score's whole four-bar phrases still end on the end card (36 bars).
//
// A clip has ch (the chapter's key) and bars (its length in bars of the score). A chapter clip has
// a video in the shape of video/chapters.js. The clip of Views has a cut of the views video
// (video/cuts.js). Holds and moves are in bars. Captions are the chapter's own text: its live
// text at the step's state, or a sentence from its page.
import { BEAT, FPS } from './timeline.js';
import { CHAPTERS } from '../src/chapters.js';

/** The tempo of the score (tools/score/pulse.py). A bar is 8/3 heartbeats, so a clip of 3 bars is 8 heartbeats. */
export const BPM = 105;
/** Heartbeats (60/70 s) in a bar. */
export const BAR = 240 / BPM / BEAT;

/** Two states of a page: a hold, a move, then a longer hold for the main caption. */
const TWO = { hold0: 0.75, move: 1, hold1: 1.25 };

export const REEL = {
  key: 'intro',
  // the title card: the site's name and the start of its description (index.html, meta description)
  title: { eye: `${CHAPTERS.length} chapters`, name: 'The Heart by Ultrasound', sub: 'An illustrated, interactive guide to echocardiography.' },
  intro: 2,
  outro: 3,
  clips: [
    // Image: the sweep draws the frame, one scan line at a time
    { ch: 'image', bars: 2, video: { pane: 'Scan lines and frames', quant: { depth: 1 }, steps: [
      { set: { depth: 16, sector: 80, density: 1.2, focus: 10, artifact: 'none' }, name: 'Scan lines acquired in sequence', hold: 2 },
    ] } },
    // Views: the probe turns 90° at the left sternal border, from the long axis to the short axis, tilts
    // to the mitral valve level, then crosses the chest to the apex; the nine planes in Probe and body
    { ch: 'windows', bars: 6, cut: { views: ['plax', 'psax_av', 'psax_mv', 'a4c'], planes: true,
      winHold: 1, winMove: 1, hold: 0.75, move: 0.5, lastHold: 0.75 } },
    // Cycle: the cursor runs through one cardiac cycle, and the echo follows it. The line is from the chapter's dek.
    { ch: 'cycle', bars: 3, video: { pane: 'Cardiac cycle', side: false, steps: [
      { set: { tcycle: 0, crun: false }, drift: { tcycle: 856 }, name: 'The cardiac cycle',
        line: 'Mitral and aortic valve opening and closure divide the cycle into isovolumic contraction, ejection, isovolumic relaxation and filling.', hold: 3 },
    ] } },
    // Regional wall motion: an LAD occlusion lights its territory on the bullseye and in the three apical views
    { ch: 'segments', bars: 3, video: { pane: '17-segment model', steps: [
      { set: { culprit: 'none', wm: 3 }, name: 'Normal wall motion', line: 'All 16 segments are scored 1 (normal), and the wall motion score index is 1.00.', hold: TWO.hold0 },
      { set: { culprit: 'lad' }, pick: [0], move: TWO.move, hold: TWO.hold1 },
    ] } },
    // Stress echocardiography: the quad screen of a dobutamine test in one view, from a normal response
    // to ischemia in the LAD territory: the segments turn abnormal at peak. The line is from the chapter's
    // dek. Four bars, so that the score's whole four-bar phrases end on the end card at 105 BPM.
    { ch: 'stress', bars: 4, video: { pane: 'Dobutamine stress', steps: [
      { set: { sxCase: 'normal', sxView: 'a2c' }, name: 'Normal response', line: '', hold: 1 },
      { set: { sxCase: 'lad', sxView: 'a2c' }, name: 'Ischemia in the LAD territory',
        line: 'A segment that is normal at rest and becomes abnormal with stress indicates ischemia in the territory of its coronary artery.', move: 1, hold: 2 },
    ] } },
    // AS, MR, pericardial effusion, amyloidosis: a page from normal to its most telling grade
    { ch: 'as', bars: 3, video: { pane: '2D and Doppler', side: false, quant: { asS: 0.005 }, steps: [
      { set: { asS: 0.05, asCine: true }, name: 'No aortic stenosis', pick: [0], hold: TWO.hold0 },
      { set: { asS: 0.55 }, name: 'Severe aortic stenosis', pick: [0], move: TWO.move, hold: TWO.hold1 },
    ] } },
    { ch: 'mr', bars: 3, video: { pane: '2D and Doppler', side: false, quant: { mrS: 0.005 }, steps: [
      { set: { mrS: 0, mrCine: true, mrColor: 'jet' }, name: 'No mitral regurgitation', line: '', hold: TWO.hold0 },
      { set: { mrS: 0.9 }, name: 'Severe mitral regurgitation', pick: [0], move: TWO.move, hold: TWO.hold1 },
    ] } },
    { ch: 'peri', bars: 3, video: { pane: '2D and Doppler', side: false, quant: { periS: 0.005 }, steps: [
      { set: { periS: 0.04, periCine: true }, name: 'No pericardial effusion', pick: [0], hold: TWO.hold0 },
      { set: { periS: 0.85 }, name: 'Tamponade', pick: [0], move: TWO.move, hold: TWO.hold1 },
    ] } },
    { ch: 'amyloid', bars: 3, video: { pane: 'Echocardiographic signs', side: false, quant: { amyS: 0.0025 }, steps: [
      { set: { amyS: 0 }, pick: [2], hold: TWO.hold0 },
      { set: { amyS: 0.9 }, name: 'Relative apical sparing', line: 'The septum measures {IVSd} mm. {s2}', move: TWO.move, hold: TWO.hold1 },
    ] } },
    { ch: 'ai', bars: 4, video: { pane: 'EchoPrime and EchoNet-Measurements', side: false, discrete: ['aiSec', 'aiStep', 'aiRow'], steps: [
      { set: { aiTab: 'steps', aiStep: 3, aiSec: 0, aiRow: 0, aiTwo: true }, hold: 1 },
      { set: { aiStep: 4 }, move: 0.75, hold: 1 },
      { set: { aiStep: 6, aiRow: 2 }, move: 0.5, hold: 0.75 },
    ] } },
  ],
};

const num = (ch) => String(CHAPTERS.findIndex((c) => c.key === ch) + 1).padStart(2, '0');
const title = (ch) => CHAPTERS.find((c) => c.key === ch).title;

/**
 * The time of each clip (s): T0, T1 and its tour, the part between the cards. The first clip
 * holds the title card. The last clip holds the end card. The first frame of a clip is the first
 * frame at or after its bar line: frame F0 of the whole, at clip time `offset` (0 to 1/FPS s).
 */
export function reelLayout() {
  const n = REEL.clips.length, sec = BAR * BEAT;
  let t = 0;
  const clips = REEL.clips.map((c, k) => {
    const intro = k === 0 ? REEL.intro : 0, outro = k === n - 1 ? REEL.outro : 0;
    const T0 = t, T1 = t + (intro + c.bars + outro) * sec;
    t = T1;
    return { ...c, k, num: num(c.ch), title: title(c.ch), intro, outro, T0, T1, tour: { t0: T0 + intro * sec, t1: T1 - outro * sec } };
  });
  const frames = Math.round(t * FPS);
  clips.forEach((c, k) => { c.F0 = k ? Math.ceil(c.T0 * FPS - 1e-6) : 0; });
  clips.forEach((c, k) => {
    c.F1 = k < n - 1 ? clips[k + 1].F0 : frames;
    c.frames = c.F1 - c.F0;
    c.offset = c.F0 / FPS - c.T0;
    c.duration = c.T1 - c.T0;
  });
  return { clips, duration: t, frames, beats: t / BEAT, bars: t / sec, tour: { t0: clips[0].tour.t0, t1: clips[n - 1].tour.t1 } };
}

/** Clip k as a chapter video (video/chapters.js): beats for bars, its cards if any, no padding. */
export function clipVideo(k) {
  const c = reelLayout().clips[k];
  if (!c.video) throw new Error(`clip ${k} (${c.ch}) is not a chapter clip`);
  const steps = c.video.steps.map((st, i) => ({ ...st, hold: st.hold * BAR, ...(i ? { move: st.move * BAR } : {}) }));
  return { ...c.video, steps, intro: c.intro * BAR, outro: c.outro * BAR, exact: true };
}

/** Clip k as a cut of the views video (video/cuts.js layout()), in beats, with no cards. */
export function clipCut(k, cards) {
  const c = reelLayout().clips[k];
  if (!c.cut) throw new Error(`clip ${k} (${c.ch}) is not a views clip`);
  const b = (x) => x * BAR;
  const { views, winHold, winMove, lastHold, hold = winHold, move = winMove, left, probe, planes } = c.cut;
  return { id: 'R', name: 'Intro', aspect: '16:9', theme: 'dark', caption: 'compact', cards, views, left, probe, planes,
    intro: 0, hold: b(hold), move: b(move), winHold: b(winHold), winMove: b(winMove), lastHold: b(lastHold), outro: 0 };
}

/** The progress line of the intro at time tg (s, of the whole): for each clip, the part done and if it is on. */
export function reelTrack(R, tg) {
  const n = R.clips.length;
  return R.clips.map((c, k) => {
    const a = c.tour.t0, b = c.tour.t1;
    const on = tg >= a && (tg < b || k === n - 1) && tg >= R.tour.t0;
    return { f: tg < R.tour.t0 ? 0 : Math.max(0, Math.min(1, (tg - a) / (b - a))), on };
  });
}

/**
 * The cut between two clips. The panes and the caption go out over the last 0.15 s of a clip.
 * They come in over the first 0.25 s of the next clip. The frame and the progress line stay. The
 * first clip comes in and the last clip goes out with the dissolves of the cards.
 */
export function reelDip(c, t, easeOut, ease) {
  const last = c.k === REEL.clips.length - 1;
  const din = c.k > 0 ? easeOut(t / 0.25) : 1;
  const dout = last ? 1 : 1 - ease((t - (c.duration - 0.15)) / 0.15);
  return Math.max(0, Math.min(din, dout));
}

/** Events for the score, in the shape of tools/score/events.mjs. The clips are its windows. */
export function reelEvents() {
  const R = reelLayout();
  const n = R.clips.length;
  const segs = [{ kind: 'title', t0: 0, t1: R.tour.t0, b0: 0, b1: R.tour.t0 / BEAT }];
  const events = [];
  R.clips.forEach((c, k) => {
    segs.push({ kind: 'hold', view: c.ch, t0: c.tour.t0, t1: c.tour.t1, b0: c.tour.t0 / BEAT, b1: c.tour.t1 / BEAT });
    events.push({ type: 'arrive', t: c.tour.t0, b: c.tour.t0 / BEAT, i: k, view: c.ch, win: c.ch, ...(k ? { newWindow: true } : { first: true }) });
  });
  segs.push({ kind: 'end', t0: R.tour.t1, t1: R.duration, b0: R.tour.t1 / BEAT, b1: R.beats });
  events.push({ type: 'end', t: R.tour.t1, b: R.tour.t1 / BEAT });
  const windows = R.clips.map((c) => ({ win: c.ch, t0: c.tour.t0, t1: c.tour.t1, views: [c.ch] }));
  return { id: REEL.key, beat: BEAT, beats: R.beats, duration: R.duration, frames: R.frames, tour: R.tour, segs, events, windows, lastBeat: Math.ceil(R.beats) - 1, n };
}
