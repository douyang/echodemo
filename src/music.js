// Sound for the page, off until the visitor turns it on: music in time with the heart, and cues
// for what changes on screen. Built to the InVision sound brand (the invision-sound skill): all of
// it synthesized here, nothing to download.
//  - Music: one beat per heartbeat, at the heart rate the page shows (70 a minute; faster in
//    tamponade). Where the heart on the page beats in real time, the kick falls on its first heart
//    sound (mitral closure, EV.mvc in cyclemodel.js); a chapter that slows its beat, or shows no
//    heart, keeps 70 a minute without the lock. C major, I-V-vi-IV (C, G, Am, F), one chord to a
//    bar of four beats, in the brand's voicings: a pad of five detuned saws, a sine sub on the
//    root in eighths, a soft kick on every beat, off-beat hats, and the brand's plucked arpeggio
//    with a dotted-eighth echo. The pad, the sub and the arpeggio dip on each kick. No claps.
//  - Cues (cue()): a new chapter sounds the brand's rising fourth, G5 then C6 ("value lands");
//    smaller changes (a view in chapters 07 and 08, any switch or tick box, the heart shown, a
//    grade while a severity page plays) a single soft bell on a note of the chord that plays. A
//    bell never follows a chapter cue within 0.6 s, nor another bell within 0.25 s.
// The brand's films run at 120 BPM; this page keeps the heart's tempo, so the beat is the heart.
// A click turns the sound on (browsers start sound only after one). iPhone and iPad play Web Audio
// as ambient sound, which the ring/silent switch mutes (videos play as media, and it does not mute
// them): the page asks for media playback there (mediaPlayback()).
import { RR, EV } from './cyclemodel.js';

const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
/** Whether this browser can play the sound. */
export const canPlay = !!AC;

const S1 = EV.mvc / RR;          // where the kick falls, as a fraction of the beat from the R wave
const AHEAD = 0.12;              // s of sound scheduled ahead of the clock, at the least
const TICK = 25;                 // ms between scheduling passes, when the page keeps up
const LEVEL = 1.75;              // master level: about -17.5 LUFS with the cues, as the first music
// The films' groove leans on the kick and the sub, which phone and laptop speakers barely play.
// Here the pad and the plucks carry the music, a little brighter, over a softer kick and sub: a
// calm bed that a laptop still plays. With the panned pad and plucks louder, their pans narrow
// (width) to keep the mix as near mono as the films. The cues stand above the bed in their own
// band as in the films (the chapter cue as the brand's value cue); the bells sit lower.
const MIX = { kick: 0.16, sub: [0.075, 0.055], hat: 0.06, pluck: [0.08, 0.056], pad: 0.08, cutoff: 2200, width: 0.55 };
const CUE = { chapter: [0.15, 0.125], bell: 0.09 };

// The brand's chords (score_helpers.py CH, MIDI): the pad's notes, the sub's root, the
// arpeggio's notes; and the notes a bell may take on each (the brand's single marks: A4, C5, E5, G5;
// on G, E5 as well as G5, which the G arpeggio plays itself)
const CHORDS = [
  { pad: [48, 52, 55, 60, 64], root: 36, arp: [72, 76, 79, 83, 84], bell: [79, 76] },   // C
  { pad: [43, 50, 55, 59, 62], root: 31, arp: [67, 71, 74, 79, 83], bell: [76, 79] },   // G
  { pad: [45, 52, 57, 60, 64], root: 33, arp: [69, 72, 76, 79, 81], bell: [76, 69] },   // Am
  { pad: [41, 48, 53, 57, 60], root: 29, arp: [65, 69, 72, 76, 77], bell: [72, 69] },   // F
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];   // the brand's arpeggio, one note per eighth
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

let ctx = null, out = null, music = null, verb = null, echo = null, echoTaps = [], noise = null;
let timer = 0, playing = false, next = 0, last = -1, n = 0, lastPass = 0, gap = TICK / 1000;
let chord = 0, lastChapterCue = -1, lastBell = -1, bells = 0;
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

// iPhone and iPad (iPadOS reports a Mac with touch); a second of silence, played on a loop
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const SILENCE = 'assets/silence.mp3';
let keep = null;

/**
 * Sound as media playback, which the ring/silent switch leaves alone: the Audio Session API where
 * the browser has it, and on iPhone and iPad also a silent media element that plays while the
 * sound is on (a playing media element puts the page in media playback). Call it from a click.
 */
function mediaPlayback(on) {
  try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch (e) { /* not settable here */ }
  if (!IOS) return;
  if (on) {
    if (!keep) {
      keep = new Audio(SILENCE);
      keep.loop = true;
      keep.setAttribute('playsinline', '');
    }
    keep.play().catch(() => {});
  } else if (keep) keep.pause();
}

/** Turn the sound on or off; resolves to whether it plays. Call it from a click. */
export async function setMusic(want) {
  if (!AC) return false;
  if (want) {
    if (!ctx) build();
    mediaPlayback(true);
    const resumed = ctx.resume();     // inside the click, as some browsers require
    playing = true;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.08);
    start();
    try { await resumed; } catch (e) { stop(); playing = false; mediaPlayback(false); }
  } else if (ctx) {
    playing = false;
    stop();
    mediaPlayback(false);
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => { if (!playing && ctx.state === 'running') ctx.suspend(); }, 300);
  }
  return playing;
}

/**
 * A cue for a change on screen, while the sound is on: 'chapter' (the brand's rising fourth,
 * G5 then C6) or 'bell' (one soft chime on a note of the chord that plays).
 */
export function cue(kind) {
  if (!ctx || !playing || ctx.state !== 'running') return;
  const T = ctx.currentTime + 0.02;
  if (kind === 'chapter') {
    lastChapterCue = T;
    chime(T, hz(79), CUE.chapter[0], 0, 1.5);
    chime(T + 0.12, hz(84), CUE.chapter[1], 0, 1.5);
  } else if (kind === 'bell') {
    if (T - lastChapterCue < 0.6 || T - lastBell < 0.25) return;
    lastBell = T;
    const notes = CHORDS[chord].bell;
    chime(T, hz(notes[bells++ % notes.length]), CUE.bell, 0, 1.3);
  }
}

function start() { last = -1; next = 0; lastPass = 0; if (!timer) timer = setInterval(schedule, TICK); }
function stop() { clearInterval(timer); timer = 0; }

// a hidden tab throttles timers: stop there, start again on the next beat when it shows. A call
// or another app's audio can stop the sound on a phone (the context reads "interrupted"): the next
// tap on the page brings it back
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !playing) return;
    if (document.hidden) { stop(); ctx.suspend(); if (keep) keep.pause(); } else { ctx.resume(); start(); if (keep) keep.play().catch(() => {}); }
  });
  // on release: a touch counts as a gesture when the finger lifts, not when it lands
  document.addEventListener('pointerup', () => {
    if (!ctx || !playing || ctx.state === 'running') return;
    ctx.resume().catch(() => {});
    if (keep) keep.play().catch(() => {});
  }, { passive: true });
}

// ---------------------------------------------------------------- the mix
function build() {
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = 0;
  // the brand's master: nothing below 28 Hz, then tanh (drive 1.15), here scaled so that nothing
  // passes 0.85 (-1.4 dBFS)
  const hp = filter('highpass', 28), clip = ctx.createWaveShaper(), curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) curve[i] = (0.85 * Math.tanh(1.15 * (i / 1024 - 1))) / Math.tanh(1.15);
  clip.curve = curve;
  clip.oversample = '4x';
  out.connect(hp).connect(clip).connect(ctx.destination);
  let s = 70070;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; };
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd();
  // the brand's room: 2.6 s of noise dying away (0.62 s decay), 20 ms late, soft above 6 kHz,
  // its return cut below 180 Hz; the music bus sends a quarter of itself
  const sr = ctx.sampleRate, pre = Math.round(0.02 * sr), len = Math.round(2.6 * sr);
  const ir = ctx.createBuffer(2, pre + len, sr);
  for (let c = 0; c < 2; c++) {
    const h = ir.getChannelData(c);
    let e = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; h[pre + i] = rnd() * Math.exp(-t / 0.62) * Math.min(1, t / 0.012); e += h[pre + i] ** 2; }
    const k = 1 / Math.sqrt(e);
    for (let i = 0; i < len; i++) h[pre + i] *= k;
  }
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = ir;
  verb = ctx.createGain();
  const ret = ctx.createGain();
  ret.gain.value = 0.9;
  verb.connect(filter('lowpass', 6000)).connect(conv).connect(filter('highpass', 180)).connect(ret).connect(out);
  // the brand's echo: a dotted eighth, ping-pong, feedback 0.38, soft above 4.5 kHz
  echo = ctx.createGain();
  const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = ctx.createGain(), soft = filter('lowpass', 4500), merge = ctx.createChannelMerger(2), eo = ctx.createGain();
  fb.gain.value = 0.38;
  eo.gain.value = 0.8;
  echo.connect(soft);
  soft.connect(dr);
  dr.connect(merge, 0, 1);
  dr.connect(dl);
  dl.connect(merge, 0, 0);
  dl.connect(fb).connect(dr);
  merge.connect(eo).connect(out);
  echoTaps = [dl, dr];
  // the music bus: dips on each kick
  music = ctx.createGain();
  music.connect(out);
  const toVerb = ctx.createGain();
  toVerb.gain.value = 0.25;
  music.connect(toVerb).connect(verb);
}

function filter(type, f, q = 0.707) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
}
function osc(type, f) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f;
  return o;
}
function pan(p) {
  const s = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (s.pan) s.pan.value = Math.max(-1, Math.min(1, p));
  return s;
}
/** node -> pan p -> dest, with sends to the reverb and the echo. */
function route(node, p, dest, rev = 0, dly = 0) {
  const pn = pan(p);
  node.connect(pn).connect(dest);
  if (rev) { const g = ctx.createGain(); g.gain.value = rev; pn.connect(g).connect(verb); }
  if (dly) { const g = ctx.createGain(); g.gain.value = dly; pn.connect(g).connect(echo); }
}

// ---------------------------------------------------------------- the beats
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
  const bar = k % 4, e = P / 2;
  chord = Math.floor(k / 4) % 4;
  const C = CHORDS[chord];
  for (const t of echoTaps) t.delayTime.setTargetAtTime(0.75 * P, T, 0.05);   // a dotted eighth
  kick(T, MIX.kick);
  pump(T, P);
  hat(T + e, MIX.hat);
  sub(T, C.root, 0.85 * e, MIX.sub[0]);
  sub(T + e, C.root, 0.85 * e, MIX.sub[1]);
  for (let j = 0; j < 2; j++) {
    const i = 2 * bar + j;
    pluck(T + j * e, C.arp[ARP[i] % 5], MIX.pluck[i % 4 === 0 ? 0 : 1], MIX.width * 0.35 * Math.sin(i * 0.9));
  }
  if (bar === 0) pad(T, C.pad, 4 * P, MIX.cutoff);
}

/** The brand's kick: a sine falling from 132 to 47 Hz, and a click. */
function kick(T, peak) {
  const o = osc('sine', 132), g = ctx.createGain();
  o.frequency.setValueAtTime(132, T);
  o.frequency.setTargetAtTime(47, T, 0.028);
  g.gain.setValueAtTime(0, T);
  g.gain.linearRampToValueAtTime(peak, T + 0.0015);
  g.gain.setTargetAtTime(0, T + 0.0015, 0.19);
  o.connect(g).connect(out);
  o.start(T);
  o.stop(T + 1.2);
  hiss(T, 'highpass', 2500, 0.25 * peak, 0.004, out);
}

/** Filtered noise with an instant attack and a decay of tau s. */
function hiss(T, type, f, peak, tau, dest, rev = 0) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noise;
  let node = src.connect(filter(type, f));
  if (type === 'highpass' && f > 5000) node = node.connect(filter(type, f));   // a steeper cut for the hats
  g.gain.setValueAtTime(peak, T);
  g.gain.setTargetAtTime(0, T, tau);
  node.connect(g);
  route(g, type === 'highpass' && f > 5000 ? 0.25 : 0, dest, rev);
  src.start(T, Math.random() * 0.8);
  src.stop(T + 8 * tau + 0.02);
}
const hat = (T, peak) => hiss(T, 'highpass', 7000, peak, 0.045, out, 0.05);

/** The brand's sub: a sine with a little of its octave, on the music bus. */
function sub(T, m, d, peak) {
  const f = hz(m), a = osc('sine', f), b = osc('sine', 2 * f), bg = ctx.createGain(), g = ctx.createGain();
  bg.gain.value = 0.22;
  g.gain.setValueAtTime(0, T);
  g.gain.linearRampToValueAtTime(peak, T + 0.008);
  g.gain.setTargetAtTime(0.9 * peak, T + 0.008, 0.04);
  g.gain.setTargetAtTime(0, T + d, 0.025);
  a.connect(g);
  b.connect(bg).connect(g);
  g.connect(music);
  for (const o of [a, b]) { o.start(T); o.stop(T + d + 0.2); }
}

/** The brand's pluck: two saws 7 cents apart, a bright layer that dies fast over a darker one. */
function pluck(T, m, peak, p) {
  const f = hz(m), mix = ctx.createGain(), a = osc('sawtooth', f), b = osc('sawtooth', f * 1.004), ag = ctx.createGain(), bg = ctx.createGain();
  ag.gain.value = 0.6; bg.gain.value = 0.4;
  a.connect(ag).connect(mix);
  b.connect(bg).connect(mix);
  const bright = ctx.createGain(), dark = ctx.createGain(), sum = ctx.createGain();
  bright.gain.setValueAtTime(0, T); bright.gain.linearRampToValueAtTime(0.7 * peak, T + 0.002); bright.gain.setTargetAtTime(0, T + 0.002, 0.045);
  dark.gain.setValueAtTime(0, T); dark.gain.linearRampToValueAtTime(peak, T + 0.002); dark.gain.setTargetAtTime(0, T + 0.002, 0.16);
  mix.connect(filter('lowpass', 5200)).connect(bright).connect(sum);
  mix.connect(filter('lowpass', 1100)).connect(dark).connect(sum);
  route(sum, p, music, 0.2, 0.35);
  for (const o of [a, b]) { o.start(T); o.stop(T + 1.1); }
}

/** The brand's pad: each note five saws -13 to +13 cents, low-passed, held for the bar. */
function pad(T, notes, d, cutoff) {
  for (const m of notes) {
    const lp = filter('lowpass', cutoff), g = ctx.createGain(), peak = MIX.pad;
    for (const c of [-13, -6, 0, 6, 13]) {
      const o = osc('sawtooth', hz(m)), og = ctx.createGain();
      o.detune.value = c;
      og.gain.value = 0.2;
      o.connect(og).connect(lp);
      o.start(T);
      o.stop(T + d + 0.6);
    }
    g.gain.setValueAtTime(0, T);
    g.gain.linearRampToValueAtTime(peak, T + 0.2);
    g.gain.linearRampToValueAtTime(0.75 * peak, T + 0.8);
    g.gain.setValueAtTime(0.75 * peak, T + Math.max(0.8, d));
    g.gain.linearRampToValueAtTime(0, T + d + 0.5);
    lp.connect(g);
    route(g, MIX.width * ((m % 5) - 2) * 0.28, music, 0.35);
  }
}

/**
 * The brand's bell (FM): a sine at f, its frequency swung by a sine at 3.5 f (index 2.2, dying
 * away over 0.25 s), dying away over 0.42 s, with its octave; into the reverb.
 */
function chime(T, f, peak, p, dur) {
  const car = osc('sine', f), mod = osc('sine', 3.5 * f), depth = ctx.createGain(), amp = ctx.createGain(), oct = osc('sine', 2 * f), og = ctx.createGain(), sum = ctx.createGain();
  depth.gain.setValueAtTime(2.2 * 3.5 * f, T);
  depth.gain.setTargetAtTime(0, T, 0.25);
  mod.connect(depth).connect(car.frequency);
  amp.gain.setValueAtTime(0, T);
  amp.gain.linearRampToValueAtTime(peak, T + 0.002);
  amp.gain.setTargetAtTime(0, T + 0.002, 0.42);
  og.gain.setValueAtTime(0, T);
  og.gain.linearRampToValueAtTime(0.3 * peak, T + 0.002);
  og.gain.setTargetAtTime(0, T + 0.002, 0.2);
  car.connect(amp).connect(sum);
  oct.connect(og).connect(sum);
  route(sum, p, out, 0.4);
  for (const o of [car, mod, oct]) { o.start(T); o.stop(T + dur); }
}

/** The pad, the sub and the arpeggio dip 55% on the kick and come back within the beat. */
function pump(T, P) {
  const g = music.gain;
  g.setValueAtTime(1, T);
  g.linearRampToValueAtTime(0.45, T + 0.01);
  g.setTargetAtTime(1, T + 0.02, Math.min(0.11, 0.15 * P));
}
