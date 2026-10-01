// The timeline of a cut as JSON, for the score (score.py): the beat, the length, the tour, the
// holds, moves and cards (video/timeline.js layout), the events and the windows.
//   node tools/score/events.mjs A > /tmp/A.json
import { CUTS } from '../../video/cuts.js';
import { BEAT, events, windowsOf } from '../../video/timeline.js';

const cut = CUTS[(process.argv[2] || 'A').toUpperCase()];
if (!cut) throw new Error(`no cut ${process.argv[2]}`);
const E = events(cut);
const out = {
  id: cut.id,
  beat: BEAT,
  beats: E.beats,
  duration: E.duration,
  frames: E.frames,
  tour: E.tour,
  segs: E.segs.map(({ kind, view, from, to, cross, b0, b1, t0, t1 }) => ({ kind, view, from, to, cross, b0, b1, t0, t1 })),
  events: E.events,
  windows: windowsOf(cut, E).map(({ win, t0, t1, views }) => ({ win, t0, t1, views: views.map((v) => v.view) })),
};
process.stdout.write(JSON.stringify(out, null, 1));
