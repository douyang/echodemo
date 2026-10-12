// The free probe in the sequence of the TEE chapter (src/ch/tee.js) and in its video
// (video/chapters.js): from the ME four-chamber view, the probe's movements one at a time, each out
// and back, then all five together. A move gives the free controls at p, from 0 to 1 of its time,
// at the steps of their sliders. Each move starts and ends at rest, at the view's angle. No DOM.

/** The four-chamber view's angle: the free probe starts there. */
export const FREE_BASE = 5;
/** The controls at rest: the probe at the four-chamber view. */
export const FREE_REST = { teeAngle: FREE_BASE, teeAdv: 0, teeRot: 0, teeFlex: 0, teeLat: 0 };
// the sliders' steps (index.html): cm, then degrees
const STEP = { teeAngle: 1, teeAdv: 0.1, teeRot: 1, teeFlex: 1, teeLat: 1 };

const smooth = (x) => x * x * (3 - 2 * x);
/** A value through keyframes [p, value], eased on each leg, so that it stops at each keyframe. */
function keys(K) {
  return (p) => {
    if (p <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) {
      if (p > K[i][0]) continue;
      const [p0, a] = K[i - 1], [p1, b] = K[i];
      return a + (b - a) * smooth((p - p0) / (p1 - p0));
    }
    return K[K.length - 1][1];
  };
}
/** Out to a, then through rest to b, and back to rest, with a stop at a and at b. */
const outBack = (a, b) => keys([[0, 0], [0.25, a], [0.35, a], [0.65, b], [0.75, b], [1, 0]]);
// the shapes of the five together: 0 at both ends, and still there
const bump = (p) => Math.sin(Math.PI * p) ** 2;                                    // out and back
const wave = (p) => (Math.sin(Math.PI * p) * Math.sin(2 * Math.PI * p)) / 0.7698;   // one side, then the other

/**
 * What each control of the free probe does (Hahn 2013, the probe's movements; teeviews.js
 * freeFrame): the chapter's live text and the video's captions.
 */
export const HOW = {
  teeAngle: 'The multiplane angle turns the plane about the beam, and the probe stays where it is.',
  teeAdv: 'Advancing or withdrawing moves the probe along the esophagus, and the plane moves with it.',
  teeRot: 'Turning rotates the probe about its shaft: clockwise to the right, counterclockwise to the left.',
  teeFlex: 'Anteflexion tilts the beam toward the head, and retroflexion toward the feet.',
  teeLat: 'Side flexion bends the tip to the right or left: the plane turns about the beam, and the transducer moves a little to that side.',
};

/**
 * The moves in their order: the multiplane angle to 60° and back; withdraw 3 cm, then advance
 * 3 cm; turn 30° to the left, then to the right; anteflex 25°, then retroflex 20°; flex 20° to
 * the right, then to the left; then all five together. track: the move's short name; name: the
 * move and its size; line: what it does.
 */
export const MOVES = [
  { key: 'angle', track: 'Angle', name: 'Rotate forward to 60°, then back', line: HOW.teeAngle, at: { teeAngle: keys([[0, FREE_BASE], [0.4, 60], [0.6, 60], [1, FREE_BASE]]) } },
  { key: 'adv', track: 'Advance', name: 'Withdraw 3 cm, then advance 3 cm', line: HOW.teeAdv, at: { teeAdv: outBack(-3, 3) } },
  { key: 'rot', track: 'Turn', name: 'Turn 30° to the left, then to the right', line: HOW.teeRot, at: { teeRot: outBack(-30, 30) } },
  { key: 'flex', track: 'Flex', name: 'Anteflex 25°, then retroflex 20°', line: HOW.teeFlex, at: { teeFlex: outBack(25, -20) } },
  { key: 'lat', track: 'Side flex', name: 'Flex 20° to the right, then to the left', line: HOW.teeLat, at: { teeLat: outBack(20, -20) } },
  {
    key: 'all',
    track: 'All five',
    name: 'All five together',
    line: 'The four controls and the multiplane angle move at once, and the probe comes back to the four-chamber view.',
    at: {
      teeAngle: (p) => FREE_BASE + 40 * bump(p),
      teeAdv: (p) => -2 * wave(p),
      teeRot: (p) => 20 * bump(p),
      teeFlex: (p) => 15 * wave(p),
      teeLat: (p) => -15 * bump(p),
    },
  },
];

/** Move m's free controls at p (0 to 1 of its time), at the steps of their sliders. */
export function moveAt(m, p) {
  const out = { ...FREE_REST }, q = Math.max(0, Math.min(1, p));
  // + 0 turns a rounded -0 into 0
  for (const [k, f] of Object.entries(m.at)) out[k] = Number((Math.round(f(q) / STEP[k]) * STEP[k]).toFixed(1)) + 0;
  return out;
}
