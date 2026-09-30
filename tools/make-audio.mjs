// Soundtrack for a cut of the "Echo views" video: an original, upbeat synth track at 70 BPM,
// one beat per heartbeat. It reads the same cut as the video (video/cuts.js, video/timeline.js),
// so it runs as long as the cut and follows its views and windows:
//   - a kick on every beat of the grid, which the video puts on mitral closure (the onset of
//     systole, EV.mvc in src/cyclemodel.js): the kick is the heartbeat;
//   - sixteenth-note hats, a clap on beats 2 and 4, an off-beat bass;
//   - a major-key progression (D major: I, V, vi, IV) that moves on one chord with each view
//     and starts again on I with each window;
//   - light sidechain ducking of the pad, bass and arpeggio on each kick;
//   - a small riser over each move to another window, landing on the new view;
//   - a clean ending: the final chord and kick on the last beat.
// Dependency-free synthesis at 48 kHz. Loudness -16 LUFS integrated, true peak under -1.5 dBTP:
// a peak limiter with no delay, then one linear gain from ffmpeg's EBU R128 measure (see master),
// so nothing moves in time. The WAV is muxed as AAC 192 kb/s by tools/render-video.mjs.
//   node tools/make-audio.mjs --cut=A [--out=video/out]   -> video/out/echo-views-A.wav
//        [--solo=kick,bass]   only these parts, to check the mix
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CUTS } from '../video/cuts.js';
import { events, BEAT, BPM } from '../video/timeline.js';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const cutId = arg('cut', 'A').toUpperCase();
const out = arg('out', 'video/out');
// --solo=kick,bass: only these parts (kick clap hat bass pad arp riser crash), to check a mix
const SOLO = arg('solo', '') ? new Set(arg('solo', '').split(',')) : null;
const play = (part) => !SOLO || SOLO.has(part);
const CUT = CUTS[cutId];
if (!CUT) throw new Error(`no cut ${cutId}`);
const EV = events(CUT);
const DUR = EV.duration;
const NBEATS = EV.beats;
const S16 = BEAT / 4;

const SR = 48000;
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);        // drums, risers: not ducked
const DL = new Float32Array(N), DR = new Float32Array(N);      // pad, bass, arpeggio: ducked by the kick
const RL = new Float32Array(N), RR = new Float32Array(N);      // reverb send
const EL = new Float32Array(N);                                 // echo send (mono in)

// ---------------------------------------------------------------- helpers
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const si = (t) => Math.max(0, Math.min(N, Math.round(t * SR)));
let seed = 70070;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
function biquad(type, fc, q = 0.707) {
  const w = (2 * Math.PI * Math.min(fc, SR * 0.45)) / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = a; b1 = 0; b2 = -a; }   // band-pass, 0 dB peak
  const a0 = 1 + a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cs) / a0, a2: (1 - a) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bq(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
}
function retune(f, type, fc, q) { const g = biquad(type, fc, q); f.b0 = g.b0; f.b1 = g.b1; f.b2 = g.b2; f.a1 = g.a1; f.a2 = g.a2; }
// band-limited saw (polyBLEP)
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
/** One sample into the mix: p pan (-1..1), duck (on the ducked bus), rev and echo sends. */
function put(i, v, p = 0, duck = false, rev = 0, echo = 0) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan(p);
  if (duck) { DL[i] += v * gl; DR[i] += v * gr; } else { L[i] += v * gl; R[i] += v * gr; }
  if (rev) { RL[i] += v * gl * rev; RR[i] += v * gr * rev; }
  if (echo) EL[i] += v * echo;
}

// ---------------------------------------------------------------- the cut's structure, in beats
const intro = CUT.intro;
const arrivals = EV.events.filter((e) => e.type === 'arrive');
const moves = EV.events.filter((e) => e.type === 'window');
const endBeat = EV.events.find((e) => e.type === 'end').b;
const LAST = NBEATS - 1;
// bars start at the first view: the title card is a pick-up into it
const inBar = (k) => (((k - intro) % 4) + 4) % 4;

// harmony: D major. Each view moves on one chord; each window starts again on I; the title
// and end cards rest on I
const PROG = [
  { root: 38, pad: [62, 66, 69, 76], arp: [74, 78, 81, 86] },   // D (add9)
  { root: 33, pad: [61, 64, 69, 76], arp: [73, 76, 81, 85] },   // A
  { root: 35, pad: [59, 62, 66, 69], arp: [71, 74, 78, 83] },   // Bm7
  { root: 31, pad: [55, 59, 62, 66], arp: [71, 74, 79, 83] },   // Gmaj7
];
const chordOf = new Array(NBEATS).fill(0);
{
  let win = null, n = 0;
  for (const a of arrivals) {
    if (a.win !== win) { win = a.win; n = 0; }
    const c = n % 4;
    n++;
    for (let k = a.b; k < NBEATS; k++) chordOf[k] = c;
  }
  for (let k = endBeat; k < NBEATS; k++) chordOf[k] = 0;
}

// ---------------------------------------------------------------- voices
/** The kick: a pitched thump with a click; the heartbeat of the track. */
function kick(t0, gain) {
  if (!play('kick')) return;
  const i0 = si(t0), i1 = si(t0 + 0.45);
  const hp = biquad('hp', 2500, 0.7);
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    const f = 48 + 120 * Math.exp(-x / 0.03);
    ph += f / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.exp(-x / 0.15) * Math.min(1, x / 0.0015);
    const click = x < 0.006 ? bq(hp, noise()) * (1 - x / 0.006) * 0.3 : 0;
    // driven into a soft clip: a round, dense thump with a flat top rather than a sharp spike
    put(i, (Math.tanh(body * 2.6) * 0.8 + click) * gain, 0, false, 0.02);
  }
}
function clap(t0, gain) {
  if (!play('clap')) return;
  const i0 = si(t0), i1 = si(t0 + 0.35);
  const bp = biquad('bp', 1500, 0.9), hp = biquad('hp', 900, 0.7);
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    // three quick bursts, then the tail
    let env = Math.exp(-x / 0.11) * 0.55;
    for (const d of [0, 0.011, 0.022]) if (x >= d && x < d + 0.012) env = Math.max(env, Math.exp(-(x - d) / 0.004));
    const v = bq(hp, bq(bp, noise())) * env * gain;
    put(i, v, 0.08, false, 0.35);
  }
}
function hat(t0, gain, open = false, p = 0.2) {
  if (!play('hat')) return;
  const len = open ? 0.11 : 0.026, i0 = si(t0), i1 = si(t0 + len * 6);
  const hp = biquad('hp', 7600, 0.8), bp = biquad('bp', 10500, 0.8);
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    const n0 = noise();
    // the noise's spikes are rounded off: a hat is heard for its sheen, not its peaks
    const v = Math.tanh(1.8 * (bq(hp, n0) * 0.7 + bq(bp, n0) * 0.5)) * 0.62 * Math.exp(-x / len) * gain;
    put(i, v, p, false, 0.05);
  }
}
function bassNote(t0, m, len, gain) {
  if (!play('bass')) return;
  const f = mtof(m), i0 = si(t0), i1 = si(t0 + len + 0.06);
  const lp = biquad('lp', 820, 1.2);
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    const env = Math.min(1, x / 0.004) * (x < len ? 1 - 0.35 * (x / len) : Math.max(0, 0.65 * (1 - (x - len) / 0.06)));
    const dt = f / SR;
    ph += dt; if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - blep(ph, dt);
    const v = (bq(lp, saw) * 0.75 + 0.55 * Math.sin(2 * Math.PI * ph)) * env * gain;
    put(i, v, 0, true);
  }
}
function padNote(t0, t1, m, gain, p, cutoff = 2400, a = 0.3) {
  if (!play('pad')) return;
  const r = 0.5, f = mtof(m);
  const i0 = si(t0), i1 = si(t1 + r);
  const lp = biquad('lp', cutoff, 0.6);
  const ph = [rand(), rand(), rand()], det = [-0.006, 0.0005, 0.0065];
  for (let i = i0; i < i1; i++) {
    const t = i / SR;
    const env = Math.min(1, (t - t0) / a) * (t > t1 ? Math.max(0, 1 - (t - t1) / r) : 1);
    if (env <= 0) continue;
    let v = 0;
    for (let k = 0; k < 3; k++) {
      const dt = (f * (1 + det[k])) / SR;
      ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1;
      v += 2 * ph[k] - 1 - blep(ph[k], dt);
    }
    put(i, bq(lp, v / 3) * env * gain, p, true, 0.3);
  }
}
function pluck(t0, m, gain, p) {
  if (!play('arp')) return;
  const f = mtof(m), i0 = si(t0), i1 = si(t0 + 0.5);
  const lp = biquad('lp', 4000, 0.9);
  let ph = rand();
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    if ((i - i0) % 32 === 0) retune(lp, 'lp', 1400 + 7600 * Math.exp(-x / 0.07), 1.0);
    const dt = f / SR;
    ph += dt; if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - blep(ph, dt), tri = 1 - 4 * Math.abs(ph - 0.5);
    const env = Math.min(1, x / 0.002) * Math.exp(-x / 0.14);
    put(i, bq(lp, 0.5 * saw + 0.5 * tri) * env * gain, p, true, 0.18, 0.3);
  }
}
/** Filtered noise rising into a beat: a small riser. */
function riser(t0, t1, gain) {
  if (!play('riser')) return;
  const i0 = si(t0), i1 = si(t1);
  const bp = biquad('bp', 400, 1.6);
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const u = (i - i0) / Math.max(1, i1 - i0);
    if ((i - i0) % 64 === 0) retune(bp, 'bp', 350 * Math.pow(7000 / 350, u), 1.6);
    ph += (220 * Math.pow(2, 1.5 * u)) / SR;
    const env = Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1);
    const v = (bq(bp, noise()) + 0.12 * Math.sin(2 * Math.PI * ph) * u) * env * gain;
    put(i, v, (u - 0.5) * 0.6, false, 0.3);
  }
}
/** A soft crash on the beat a new window lands on, and at the very end. */
function crash(t0, gain, len = 1.6) {
  if (!play('crash')) return;
  const i0 = si(t0), i1 = si(t0 + len * 4);
  const hp = biquad('hp', 4200, 0.7), bp = biquad('bp', 6800, 0.5);
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / SR;
    const n0 = noise();
    const v = (bq(hp, n0) * 0.6 + bq(bp, n0) * 0.4) * Math.exp(-x / len) * Math.min(1, x / 0.003) * gain;
    put(i, v, rand() * 0.5 - 0.25, false, 0.25);
  }
}

// ---------------------------------------------------------------- score
// levels of the parts (linear)
const MIX = { kick: 0.5, clap: 0.4, hat: 0.9, bass: 0.26, pad: 0.13, arp: 0.17, riser: 0.2, crash: 0.12 };
const firstArrival = arrivals[0].b;
const riserBeats = new Set();            // beats a riser covers: the drums thin out under it
for (const m of moves) for (let k = m.b; k < m.b1; k++) riserBeats.add(k);
for (let k = 0; k < NBEATS; k++) {
  const t = k * BEAT, bb = inBar(k), ch = PROG[chordOf[k]];
  const tour = k >= firstArrival && k < endBeat;
  const card = k < firstArrival;
  const last = k === LAST;
  // the heartbeat: every beat, from the first frame to the last
  kick(t, MIX.kick * (last ? 1.1 : 1));
  if (last) continue;
  // clap on 2 and 4 of the bar, in the tour and on the end card
  if (!card && (bb === 1 || bb === 3) && k < LAST - 1) clap(t, MIX.clap);
  // hats: sixteenths; the off-beat eighth loudest; an open hat on the last off-beat of each bar
  const hatsOn = tour || (card && k >= firstArrival - 1) || (k >= endBeat && k < LAST - 1);
  if (hatsOn) {
    const vel = [0.26, 0.12, 0.36, 0.14];
    for (let s = 0; s < 4; s++) {
      if (s === 0 && card) continue;
      const open = s === 2 && bb === 3 && tour;
      hat(t + s * S16, MIX.hat * vel[s] * (riserBeats.has(k) ? 0.7 : 1), open, s % 2 ? 0.3 : -0.1);
    }
  }
  // bass: the root on the off-beat eighth, the octave on the last sixteenth
  if (!card || k >= firstArrival - 1) {
    bassNote(t + 2 * S16, ch.root, S16 * 1.6, MIX.bass);
    bassNote(t + 3 * S16, ch.root + 12, S16 * 0.7, MIX.bass * 0.55);
    if (bb === 0 && tour) bassNote(t, ch.root, S16 * 0.8, MIX.bass * 0.6);
  }
  // arpeggio: sixteenths through the chord, two beats to the pattern
  if (tour || k >= endBeat) {
    const seq = [0, 2, 3, 1, 2, 3, 1, 2], vel = [1, 0.55, 0.8, 0.55, 0.9, 0.55, 0.75, 0.6];
    const beatPair = ((k - intro) % 2 + 2) % 2;
    for (let s = 0; s < 4; s++) {
      const step = beatPair * 4 + s;
      if (k >= LAST - 1 && s > 0) break;
      pluck(t + s * S16, ch.arp[seq[step]], MIX.arp * vel[step], step % 2 ? 0.4 : -0.4);
    }
  }
}
// pads: one chord from each change of chord to the next; the title card swells in
{
  const spans = [];
  let k0 = 0;
  for (let k = 1; k <= NBEATS; k++) {
    if (k === NBEATS || chordOf[k] !== chordOf[k0] || k === firstArrival || k === endBeat) { spans.push([k0, k]); k0 = k; }
  }
  for (const [a, b] of spans) {
    const ch = PROG[chordOf[a]], t0 = a * BEAT;
    const t1 = b >= NBEATS ? LAST * BEAT + 0.05 : b * BEAT;
    const swell = a === 0;   // the title card: softer, darker, slower in
    ch.pad.forEach((m, j) => padNote(t0, t1, m, MIX.pad * (swell ? 0.8 : 1), -0.5 + j / (ch.pad.length - 1), swell ? 1800 : 3400, swell ? 1.4 : 0.3));
  }
}
// risers into each change of window, a crash where the new window lands; the tour's start
for (const m of moves) {
  riser(m.b * BEAT + 0.25 * BEAT, m.b1 * BEAT, MIX.riser);
  crash(m.b1 * BEAT, MIX.crash, 1.2);
}
riser(Math.max(0, (firstArrival - 2) * BEAT), firstArrival * BEAT, MIX.riser * 0.8);
crash(firstArrival * BEAT, MIX.crash, 1.3);
// the ending: the last beat, a full chord and a long crash that ring out to the last frame
{
  const t = LAST * BEAT, ch = PROG[0], ring = DUR - t;
  crash(t, MIX.crash * 1.4, ring * 0.5);
  bassNote(t, ch.root, ring * 0.55, MIX.bass * 1.1);
  for (const [j, m] of [...ch.pad, ch.arp[0], ch.arp[2]].entries()) padNote(t, t + ring * 0.35, m, MIX.pad * 0.85, -0.6 + j * 0.2, 4200, 0.01);
  ch.arp.forEach((m, j) => pluck(t + j * 0.018, m, MIX.arp * 0.9, -0.3 + j * 0.2));
}

// ---------------------------------------------------------------- effects and mix
// sidechain: each kick ducks the pad, bass and arpeggio by about 5 dB, back within 0.2 s
{
  const g = new Float32Array(N).fill(1);
  for (let k = 0; k < NBEATS; k++) {
    const i0 = si(k * BEAT), i1 = si(k * BEAT + 0.4);
    for (let i = i0; i < i1; i++) {
      const x = (i - i0) / SR;
      const d = 1 - 0.45 * Math.min(1, x / 0.004) * Math.exp(-x / 0.1);
      g[i] = Math.min(g[i], d);
    }
  }
  for (let i = 0; i < N; i++) { L[i] += DL[i] * g[i]; R[i] += DR[i] * g[i]; }
}
// ping-pong echo on the arpeggio: an eighth note
{
  const D = Math.round((BEAT / 2) * SR), fb = 0.3;
  const bl = new Float32Array(N), br = new Float32Array(N);
  for (let i = D; i < N; i++) {
    bl[i] = EL[i - D] + br[i - D] * fb;
    br[i] = bl[i - D] * fb;
    L[i] += bl[i] * 0.28; R[i] += br[i] * 0.28;
  }
}
// reverb: a small Schroeder network on the send
function reverb(inp, combs, aps) {
  const o = new Float32Array(N);
  for (const d of combs) {
    const buf = new Float32Array(d); let k = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[k];
      lp = y * 0.7 + lp * 0.3;
      buf[k] = inp[i] + lp * 0.8;
      o[i] += y;
      k = k + 1 === d ? 0 : k + 1;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d); let k = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[k], x = o[i];
      buf[k] = x + b * 0.5;
      o[i] = b - x;
      k = k + 1 === d ? 0 : k + 1;
    }
  }
  return o;
}
const rvl = reverb(RL, [1557, 1617, 1491, 1422, 1277, 1356], [225, 556, 441]);
const rvr = reverb(RR, [1580, 1640, 1514, 1445, 1300, 1379], [248, 579, 464]);
for (let i = 0; i < N; i++) { L[i] += rvl[i] * 0.07; R[i] += rvr[i] * 0.07; }

// ---------------------------------------------------------------- master
// Loudness: about -16 LUFS integrated, true peak under -1.5 dBTP. A peak limiter with no delay
// (offline, it looks ahead at the samples themselves) takes the tops off the kicks and claps;
// ffmpeg measures the result (EBU R128) and one linear gain sets the loudness. Where the true
// peak would pass the target, the limiter goes lower and the measure runs again. Nothing here
// moves the audio in time, so the kicks stay on the picture's beats.
const TARGET_I = -16, TARGET_TP = -1.5;
const EQ = 'highpass=f=28,bass=g=-2:f=90,equalizer=f=3200:t=q:w=0.9:g=2.5,treble=g=2:f=6000';
fs.mkdirSync(out, { recursive: true });
const raw = path.join(out, `.echo-views-${cutId}-raw.wav`);
const wav = path.join(out, `echo-views-${cutId}.wav`);

let peak = 0, ms = 0;
for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); ms += (L[i] * L[i] + R[i] * R[i]) / 2; }
if (SOLO) console.log(`${[...SOLO].join('+')}: peak ${(20 * Math.log10(peak)).toFixed(1)} dB, rms ${(10 * Math.log10(ms / N)).toFixed(1)} dB (mix scale)`);
for (let i = 0; i < N; i++) { L[i] /= peak; R[i] /= peak; }

/** Gain per sample that holds the peaks at `ceiling`: a sliding minimum 3 ms each way, smoothed, released over 80 ms. */
function limiterGain(ceiling) {
  const A = Math.round(0.003 * SR), rel = 1 - Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(N);
  for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > ceiling ? ceiling / p : 1; }
  // sliding minimum over [i - A, i + A] (monotonic deque)
  const mn = new Float32Array(N), dq = new Int32Array(N);
  let head = 0, tail = 0;
  for (let j = 0; j < N + A; j++) {
    if (j < N) { while (tail > head && need[dq[tail - 1]] >= need[j]) tail--; dq[tail++] = j; }
    const i = j - A;
    if (i < 0) continue;
    while (dq[head] < i - A) head++;
    mn[i] = need[dq[head]];
  }
  // a moving average over A samples keeps every peak at or under the ceiling and rounds the corners
  const g = new Float32Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += mn[i];
    if (i >= A) acc -= mn[i - A];
    g[i] = acc / Math.min(i + 1, A);
  }
  // the gain falls at once and comes back slowly
  for (let i = 1; i < N; i++) g[i] = Math.min(g[i], g[i - 1] + (1 - g[i - 1]) * rel);
  return g;
}
function writeWav(file, gain, scale) {
  const pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const fade = Math.min(1, i / (0.004 * SR), (N - 1 - i) / (0.03 * SR)), k = gain[i] * scale * fade;
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * k * 32767))), i * 4);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * k * 32767))), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}
/** EBU R128 integrated loudness (LUFS) and true peak (dBTP) of a file, after the filter chain af. */
function measure(file, af) {
  const p = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `${af ? `${af},` : ''}loudnorm=print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const j = JSON.parse(p.stderr.slice(p.stderr.lastIndexOf('{'), p.stderr.lastIndexOf('}') + 1));
  return { i: Number(j.input_i), tp: Number(j.input_tp) };
}

let ceilingDb = -2, gainDb = 0, pre = null, lim = null;
for (let pass = 0; pass < 6; pass++) {
  lim = limiterGain(10 ** (ceilingDb / 20));
  writeWav(raw, lim, 0.5);   // written 6 dB down, so the EQ cannot clip it
  pre = measure(raw, EQ);
  gainDb = TARGET_I - pre.i;
  const over = pre.tp + gainDb - (TARGET_TP - 0.2);
  if (over <= 0) break;
  ceilingDb -= over + 0.3;
}
// how hard the limiter works: the deepest cut at each kick, and the share of time it cuts at all
{
  const cuts = [];
  for (let k = 0; k < NBEATS; k++) {
    let m = 1;
    for (let i = si(k * BEAT), e = si(k * BEAT + 0.05); i < e; i++) m = Math.min(m, lim[i]);
    cuts.push(-20 * Math.log10(m));
  }
  cuts.sort((a, b) => a - b);
  let busy = 0;
  for (let i = 0; i < N; i++) if (lim[i] < 0.989) busy++;
  console.log(`limiter: median cut at a kick ${cuts[cuts.length >> 1].toFixed(1)} dB, largest ${cuts[cuts.length - 1].toFixed(1)} dB; cutting more than 0.1 dB ${((100 * busy) / N).toFixed(1)}% of the time`);
}
const p2 = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `${EQ},volume=${gainDb.toFixed(3)}dB,atrim=0:${DUR.toFixed(6)}`,
  '-ar', String(SR), '-c:a', 'pcm_s16le', wav], { encoding: 'utf8' });
if (p2.status !== 0) throw new Error(p2.stderr);
fs.unlinkSync(raw);
const q = measure(wav, '');
console.log(`wrote ${wav}: ${DUR.toFixed(3)} s, ${NBEATS} beats at ${BPM} BPM (${(BEAT * 1000).toFixed(2)} ms), ` +
  `${arrivals.length} views, ${moves.length} window changes; ${q.i.toFixed(2)} LUFS, true peak ${q.tp.toFixed(2)} dBTP (limiter at ${ceilingDb.toFixed(1)} dB)`);
