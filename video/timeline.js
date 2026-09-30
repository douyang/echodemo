// Timing shared by the video page (video/app.js) and the tools (tools/*.mjs). No DOM.
//
// Everything runs on the heartbeat. One beat is 60/70 s: one heartbeat of the model
// (src/cyclemodel.js, 70 per minute) and one beat of the music. The beat grid falls on
// mitral closure (EV.mvc, the onset of systole), so each hold and each move of the plane
// starts on a heartbeat, where the kick of the soundtrack lands.
import { RR, EV } from '../src/cyclemodel.js';
import { VIEWS } from '../src/views.js';

export const FPS = 30;
export const BPM = 70;
export const BEAT = 60 / BPM;                 // s
export const SIZE = { '16:9': [1920, 1080], '9:16': [1080, 1920] };
/** The model's cycle time (ms from the R wave) at each beat of the grid: mitral closure. */
export const GRID_MS = EV.mvc;
/** Seconds the title and end cards take to dissolve into and out of the tour. */
export const DISSOLVE = 0.6;

/**
 * The model's cycle time (ms, 0 to RR) at video time t (s). The heart beats at exactly
 * 70 per minute: the model's cycle (RR = 857 ms) is stretched by 0.02% to 60/70 s.
 */
export function cycleMs(t) {
  const u = t / BEAT;
  return ((u - Math.floor(u)) * RR + GRID_MS) % RR;
}

/** Holds, moves and the two cards of a cut, in beats and in seconds, and its length. */
export function layout(cut) {
  const segs = [];
  let b = 0;
  const push = (s, beats) => { segs.push({ ...s, b0: b, b1: b + beats, t0: b * BEAT, t1: (b + beats) * BEAT }); b += beats; };
  push({ kind: 'title' }, cut.intro);
  cut.views.forEach((v, i) => {
    const next = cut.views[i + 1];
    const cross = !!next && VIEWS[next].win !== VIEWS[v].win;
    const hold = !next ? cut.lastHold ?? cut.hold : cross ? cut.winHold ?? cut.hold : cut.hold;
    push({ kind: 'hold', view: v, i }, hold);
    if (next) push({ kind: 'move', from: v, to: next, i, cross }, cross ? cut.winMove ?? cut.move : cut.move);
  });
  push({ kind: 'end' }, cut.outro);
  const tour = { t0: segs[1].t0, t1: segs[segs.length - 1].t0 };
  return { segs, beats: b, duration: b * BEAT, frames: Math.round(b * BEAT * FPS), tour };
}

/** The segment at time t (the end card holds past the end). */
export function segAt(L, t) {
  for (const s of L.segs) if (t < s.t1) return s;
  return L.segs[L.segs.length - 1];
}

/** The windows of a cut in order, each with the time it takes on screen and its views. */
export function windowsOf(cut, L = layout(cut)) {
  const out = [];
  for (const s of L.segs) {
    if (s.kind !== 'hold') continue;
    const win = VIEWS[s.view].win;
    let w = out[out.length - 1];
    if (!w || w.win !== win) { w = { win, t0: s.t0, t1: s.t1, views: [] }; out.push(w); }
    w.views.push({ view: s.view, t0: s.t0, t1: s.t1 });
    w.t1 = s.t1;
  }
  return out;
}

/**
 * Events the soundtrack follows (seconds): the beat grid, the start of the tour, each
 * arrival at a view (with its index and whether it opens a new window), each move between
 * windows, the end card and the last beat.
 */
export function events(cut) {
  const L = layout(cut);
  const ev = [];
  for (const s of L.segs) {
    if (s.kind === 'hold') ev.push({ type: 'arrive', t: s.t0, b: s.b0, i: s.i, view: s.view, win: VIEWS[s.view].win });
    if (s.kind === 'move' && s.cross) ev.push({ type: 'window', t: s.t0, b: s.b0, t1: s.t1, b1: s.b1, from: s.from, to: s.to });
    if (s.kind === 'end') ev.push({ type: 'end', t: s.t0, b: s.b0 });
  }
  for (let k = 1; k < ev.length; k++) if (ev[k].type === 'arrive' && ev[k - 1].type === 'window') ev[k].newWindow = true;
  ev.find((e) => e.type === 'arrive').first = true;
  return { ...L, events: ev, lastBeat: L.beats - 1 };
}
