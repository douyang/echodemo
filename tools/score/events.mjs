// The timeline of a cut, or of a chapter video, as JSON, for the score (pulse.py, score.py): the
// beat, the length, the tour, the holds, moves and cards (video/timeline.js layout, or
// video/chapters.js chapterLayout), the events and the windows (a chapter's steps).
//   node tools/score/events.mjs A > /tmp/A.json        a cut of the views video
//   node tools/score/events.mjs as > /tmp/as.json      the AS video (its key)
//   node tools/score/events.mjs intro > /tmp/i.json    the intro (video/reel.js)
import { CUTS } from '../../video/cuts.js';
import { VIDEOS, chapterEvents } from '../../video/chapters.js';
import { BEAT, events, windowsOf } from '../../video/timeline.js';
import { REEL, reelEvents } from '../../video/reel.js';

const key = process.argv[2] || 'A';
if (key.toLowerCase() === REEL.key) {
  // the intro (video/reel.js): the clips are the windows
  const { n, lastBeat, ...E } = reelEvents();
  process.stdout.write(JSON.stringify(E, null, 1));
  process.exit(0);
}
const cut = CUTS[key.toUpperCase()];
const video = VIDEOS[key.toLowerCase()];
if (!cut && !video) throw new Error(`no cut or chapter video ${key}`);
const E = cut ? events(cut) : chapterEvents(video);
const out = {
  id: cut ? cut.id : key.toLowerCase(),
  beat: BEAT,
  beats: E.beats,
  duration: E.duration,
  frames: E.frames,
  tour: E.tour,
  segs: E.segs.map(({ kind, view, from, to, cross, b0, b1, t0, t1 }) => ({ kind, view, from, to, cross, b0, b1, t0, t1 })),
  events: E.events,
  windows: cut ? windowsOf(cut, E).map(({ win, t0, t1, views }) => ({ win, t0, t1, views: views.map((v) => v.view) })) : E.windows,
};
process.stdout.write(JSON.stringify(out, null, 1));
