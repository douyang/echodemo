// Music in time with the heart on the page: one beat per heartbeat, at the heart rate the page
// shows (70 a minute; faster in tamponade). Where the heart on the page beats in real time, the
// kick falls on its first heart sound (mitral closure, EV.mvc in cyclemodel.js). A chapter that
// slows its beat, or shows no heart, keeps 70 a minute without the lock.
// The loop is in D major, I-V-vi-IV, one chord to a bar of four beats: a kick on every beat, a
// clap on two and four, sixteenth-note hats, an off-beat bass, and a pad and arpeggio that dip
// on each kick, with a little reverb. Web Audio synthesis: nothing to download. Off when the page opens; a click turns
// it on (browsers start sound only after one).
import { RR, EV } from './cyclemodel.js';

const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
/** Whether this browser can play the music. */
export const canPlay = !!AC;

const S1 = EV.mvc / RR;          // where the kick falls, as a fraction of the beat from the R wave
const AHEAD = 0.12;              // s of sound scheduled ahead of the clock, at the least
const TICK = 25;                 // ms between scheduling passes, when the page keeps up
const LEVEL = 0.75;              // master level

// one chord a bar (MIDI notes): the bass root, the pad's four voices, the arpeggio's four notes
// (the voicings of the video's soundtrack, tools/make-audio.mjs)
const CHORDS = [
  { root: 38, pad: [62, 66, 69, 76], arp: [74, 78, 81, 86] },   // D (add9)
  { root: 33, pad: [61, 64, 69, 76], arp: [73, 76, 81, 85] },   // A
  { root: 35, pad: [59, 62, 66, 69], arp: [71, 74, 78, 83] },   // B minor 7
  { root: 31, pad: [55, 59, 62, 66], arp: [71, 74, 79, 83] },   // G major 7
];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

let ctx = null, out = null, duck = null, verb = null, noise = null, timer = 0, playing = false;
let next = 0, last = -1, n = 0, lastPass = 0, gap = TICK / 1000;
// the heart the page showed last: ms per beat, the phase from the R wave (null: not beating), the
// frame it was drawn in (rAF time), how fast its beat ran against the clock (1: real time), and
// whether the kick follows it
const heart = { rr: RR, phase: null, at: 0, speed: 0, locked: false };

/**
 * The heart the page draws this frame: { rr, phase } from the chapter (pulse()), or null; now:
 * the frame's time. A page that draws few frames a second slows its beat (each frame advances it
 * at most 0.1 s): the kick follows the heart only while it beats in real time (locks within 4%,
 * lets go past 12%).
 */
export function follow(p, now = performance.now()) {
  const phase = p && p.phase != null ? p.phase : null;
  heart.rr = p && p.rr > 0 ? p.rr : RR;
  if (phase === null || heart.phase === null) heart.speed = 0;
  else {
    const dp = (((phase - heart.phase) % 1) + 1) % 1, dt = now - heart.at;
    if (dt > 0 && dp < 0.5) heart.speed += ((dp * heart.rr) / dt - heart.speed) * Math.min(1, dt / 400);
    else heart.speed = 0;
  }
  const off = Math.abs(heart.speed - 1);
  heart.locked = phase !== null && (heart.locked ? off < 0.12 : off < 0.04);
  heart.phase = phase;
  heart.at = now;
}

/** Turn the music on or off; resolves to whether it plays. Call it from a click. */
export async function setMusic(want) {
  if (!AC) return false;
  if (want) {
    if (!ctx) build();
    const resumed = ctx.resume();     // inside the click, as some browsers require
    playing = true;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.08);
    start();
    try { await resumed; } catch (e) { stop(); playing = false; }
  } else if (ctx) {
    playing = false;
    stop();
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => { if (!playing && ctx.state === 'running') ctx.suspend(); }, 300);
  }
  return playing;
}

function start() { last = -1; next = 0; lastPass = 0; if (!timer) timer = setInterval(schedule, TICK); }
function stop() { clearInterval(timer); timer = 0; }

// a hidden tab throttles timers: stop there, start again on the next beat when it shows
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !playing) return;
    if (document.hidden) { stop(); ctx.suspend(); } else { ctx.resume(); start(); }
  });
}

function build() {
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = 0;
  const lim = ctx.createDynamicsCompressor();     // a soft limiter on the mix
  lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.15;
  out.connect(lim).connect(ctx.destination);
  let s = 70070;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; };
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd();
  // a room: 1.4 s of noise dying away, a little different in each ear
  const conv = ctx.createConvolver(), ir = ctx.createBuffer(2, Math.round(1.4 * ctx.sampleRate), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const h = ir.getChannelData(c);
    for (let i = 0; i < h.length; i++) h[i] = rnd() * Math.exp((-4.6 * i) / h.length) * 0.35;
  }
  conv.buffer = ir;
  verb = ctx.createGain();                        // the reverb send
  verb.gain.value = 0.3;
  verb.connect(conv).connect(out);
  duck = ctx.createGain();                        // the bass, pad and arpeggio, which dip on each kick
  duck.connect(out);
}

/** Schedule the beats that start soon: within AHEAD, or longer where the page is slow. */
function schedule() {
  const now = ctx.currentTime, P = heart.rr / 1000, wall = performance.now();
  // a slow page runs these passes late (a heavy frame holds the thread): look further ahead
  if (lastPass) gap += ((wall - lastPass) / 1000 - gap) * 0.3;
  lastPass = wall;
  const ahead = Math.min(1, Math.max(AHEAD, 2.5 * gap));
  if (heart.locked && wall - heart.at < 250) {
    // the page's next first heart sound, in the context's time: a frame shows about 16 ms after
    // it is drawn, and a sound leaves the speakers its output latency after its time
    const ph = heart.phase + (wall - heart.at) / heart.rr;
    let t = now + ((((S1 - ph) % 1) + 1) % 1) * P + 0.016 - (ctx.outputLatency || ctx.baseLatency || 0);
    if (last < 0) { if (t < now - 0.02) t += P; }
    else {
      // the heart sound nearest a beat after the last kick, reached by at most 15% of a beat per
      // beat, so the beat stays even while the music catches the heart
      t += Math.round((last + P - t) / P) * P;
      t = Math.min(last + 1.15 * P, Math.max(last + 0.85 * P, t));
    }
    next = t;
  } else if (next < now) next = Math.max(now + 0.05, last + P);
  while (next < now + ahead) {
    beat(next, P, n++);
    last = next;
    next += P;
  }
}

/** One heartbeat of music from time T, P s long; k counts the beats. */
function beat(T, P, k) {
  const bar = k % 4, chord = CHORDS[Math.floor(k / 4) % 4], q = P / 4;
  kick(T);
  pump(T, P);
  if (bar === 1 || bar === 3) clap(T);
  for (let i = 0; i < 4; i++) hat(T + i * q, [0.38, 0.17, 0.5, 0.2][i]);
  bass(T + 2 * q, chord.root, 1.7 * q);
  arp(T, chord.arp[(2 * bar) % 4], 1.6 * q);
  arp(T + 2 * q, chord.arp[(2 * bar + 1) % 4], 1.6 * q);
  if (bar === 0) pad(T, chord.pad, 4 * P);
}

/** A gain that rises to peak in a s and falls away over d s. */
function envelope(T, peak, a, d) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, T);
  g.gain.exponentialRampToValueAtTime(peak, T + a);
  g.gain.exponentialRampToValueAtTime(0.0001, T + a + d);
  return g;
}

function kick(T) {
  const o = ctx.createOscillator(), g = envelope(T, 0.7, 0.003, 0.3);
  o.frequency.setValueAtTime(140, T);
  o.frequency.exponentialRampToValueAtTime(46, T + 0.11);
  o.connect(g).connect(out);
  o.start(T);
  o.stop(T + 0.36);
  // a short knock above the sub, so small speakers carry the beat too, and the beater's click
  const b = ctx.createOscillator(), bg = envelope(T, 0.15, 0.002, 0.05);
  b.type = 'triangle';
  b.frequency.setValueAtTime(220, T);
  b.frequency.exponentialRampToValueAtTime(120, T + 0.05);
  b.connect(bg).connect(out);
  b.start(T);
  b.stop(T + 0.08);
  hiss(T, 0.18, 'bandpass', 3200, 0.012, 0.8);
}

/** Filtered noise: a hat, a clap layer, the kick's click; send: its share in the reverb. */
function hiss(T, peak, type, f, d, q = 0.7, send = 0) {
  const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = envelope(T, peak, 0.001, d);
  s.buffer = noise;
  flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  s.connect(flt).connect(g).connect(out);
  if (send) { const v = ctx.createGain(); v.gain.value = send; g.connect(v).connect(verb); }
  s.start(T, Math.random() * 0.8);
  s.stop(T + d + 0.03);
}
const hat = (T, peak) => hiss(T, peak, 'highpass', 6500, 0.045, 0.7, 0.15);
function clap(T) {
  hiss(T, 0.3, 'bandpass', 1500, 0.01, 0.8);
  hiss(T + 0.011, 0.26, 'bandpass', 1500, 0.01, 0.8);
  hiss(T + 0.022, 0.38, 'bandpass', 1500, 0.16, 0.8, 0.6);
}

/** A bass note: a saw, its filter closing, over a sine at the same pitch. */
function bass(T, m, d) {
  const o = ctx.createOscillator(), sub = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = envelope(T, 0.22, 0.006, d), sg = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = sub.frequency.value = hz(m);
  flt.type = 'lowpass'; flt.Q.value = 2;
  flt.frequency.setValueAtTime(800, T);
  flt.frequency.exponentialRampToValueAtTime(200, T + d);
  sg.gain.value = 0.7;
  o.connect(flt).connect(g).connect(duck);
  sub.connect(sg).connect(g);
  for (const x of [o, sub]) { x.start(T); x.stop(T + d + 0.05); }
}

/** A plucked note: a softened saw, half of it into the reverb. */
function arp(T, m, d) {
  const o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = envelope(T, 0.07, 0.004, d), v = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = hz(m);
  flt.type = 'lowpass'; flt.frequency.value = 2600; flt.Q.value = 0.7;
  v.gain.value = 0.5;
  o.connect(flt).connect(g).connect(duck);
  g.connect(v).connect(verb);
  o.start(T);
  o.stop(T + d + 0.05);
}

/** The pad: each voice two saws 7 cents apart, softened, held for the bar. */
function pad(T, notes, d) {
  const flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = 'lowpass'; flt.frequency.value = 1800; flt.Q.value = 0.5;
  g.gain.setValueAtTime(0.0001, T);
  g.gain.exponentialRampToValueAtTime(0.045, T + 0.3);
  g.gain.setValueAtTime(0.045, T + Math.max(0.3, d - 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, T + d + 0.6);
  const v = ctx.createGain();
  v.gain.value = 0.6;
  flt.connect(g).connect(duck);
  g.connect(v).connect(verb);
  for (const m of notes) for (const c of [-7, 7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(m);
    o.detune.value = c;
    o.connect(flt);
    o.start(T);
    o.stop(T + d + 0.65);
  }
}

/** The bass, pad and arpeggio dip on the kick and come back within the beat. */
function pump(T, P) {
  const g = duck.gain;
  g.setValueAtTime(1, T);
  g.linearRampToValueAtTime(0.45, T + 0.01);
  g.setTargetAtTime(1, T + 0.02, Math.min(0.12, 0.15 * P));
}
