"""Soundtrack of a cut of the "Echo views" video, or of a chapter video: Bright pulse, the style chosen from the review of
fourteen. A soft synth pluck plays a sixteenth-note arpeggio with a dotted-eighth echo over a pad
(C Am F G, one chord to a bar); a sub bass joins from the second window; the pluck and the pad
brighten window by window. No drums, no heartbeat, no beat locked to the heart, no chimes during
the tour. The end card is a rolled C chord, the pad on Cmaj9, and the InVision logo shimmer
(G5, B5, E6), soft.
The tempo is near 109 BPM, set so that the end card falls on a bar line and the bars come in
fours: the first and the last bar play eighths. Each part is set by its K-weighted level while it
plays, relative to the pluck. The brand engine's room and echo (synth.py), without the side-chain;
side/mid 0.10; -15 LUFS with linear gain, true peak under -2.5 dBTP (AAC adds up to 1 dB). A
fixed seed per cut, so a mix rebuilds exactly; cut C's seed is the one reviewed.
  python3 tools/score/pulse.py A video/out/echo-views-A.wav [--lufs=-15] [--tp=-2.5]
  python3 tools/score/pulse.py as video/out/chapter-as.wav       a chapter video: its steps are the windows
  python3 tools/score/pulse.py intro video/out/intro.wav         the intro: the clips are the windows. Its
                                                                 layout is in bars of 105 BPM, so the tempo is 105 BPM.
"""
import os
import subprocess
import sys
from itertools import combinations

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import synth as S                                 # noqa: E402
from synth import chime, mtof, pad_note, saw, sweep_filter, tt   # noqa: E402
import score as SC                                # noqa: E402  (timeline, measure, limit)

SR = 48000
BPM = 109.3
SEEDS = {'A': 9201, 'B': 9202, 'C': 9102, 'D': 9204}
SEEDS['P'] = 9307                                 # cut P (archived), the three-pane video of PR #19
# the chapter videos (video/chapters.js), by key: 93 and the chapter's number when it was scored,
# with 08 Planes in the list (archived since); the seeds stay, so the scores rebuild as they were
SEEDS.update({'PULSE': 9301, 'IMAGE': 9302, 'SHIFT': 9303, 'PRESSURE': 9304, 'CYCLE': 9305, 'LOOP': 9306,
              'EJECT': 9309, 'SEGMENTS': 9310, 'FILL': 9311, 'AS': 9312, 'AR': 9313,
              'MS': 9314, 'MR': 9315, 'TR': 9316, 'PERI': 9317, 'AMYLOID': 9318})
SEEDS['IVC'] = 9319                               # IVC (then chapter 18): the next number after that list
SEEDS['STRESS'] = 9320                            # stress echocardiography (then chapter 19): the next number
SEEDS['RV'] = 9321                                # the right ventricle (chapter 13): the next number
SEEDS['HCM'] = 9322                               # hypertrophic cardiomyopathy: the next number
SEEDS['INTRO'] = 9300                             # the intro (video/reel.js): 93 and chapter 00
PROG = ['C', 'Am', 'F', 'G']
CHORD = {'C': (0, [0, 4, 7]), 'Am': (9, [9, 0, 4]), 'F': (5, [5, 9, 0]), 'G': (7, [7, 11, 2])}
ARP = [0, 2, 1, 3, 2, 4, 3, 1]                    # the brand's arpeggio pattern
_rng = np.random.default_rng(0)                   # the plucks' phases (seeded per cut)


# ---------------------------------------------------------------- instruments
def _release(x, rel):
    k = min(len(x), int(rel * SR))
    if k > 1:
        x[-k:] *= np.linspace(1, 0, k)
    return x


def pluck(midi, vel=0.5, dur=0.6, cut0=4200, cut1=600):
    """A soft synth pluck: saw and square through a low-pass that closes quickly."""
    f = mtof(midi)
    n = int(dur * SR)
    t = tt(n)
    x = 0.6 * saw(f, n, _rng.random()) + 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    x = sweep_filter(x, 'low', cut0, cut1, block=128)
    return _release(x * np.exp(-t / 0.22) * np.clip(t / 0.003, 0, 1), 0.03) * vel


def sub(midi, dur, vel=0.6, att=0.02, rel=0.2):
    f = mtof(midi)
    n = int((dur + rel) * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    return x * np.clip(t / att, 0, 1) * np.clip((dur + rel - t) / rel, 0, 1) * vel


# ---------------------------------------------------------------- harmony and time
def tones(name, lo, hi):
    pcs = CHORD[name][1]
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


def root(name, lo):
    return lo + (CHORD[name][0] - lo) % 12


def lead(prev, name, lo, hi, k):
    """A voicing of k notes in [lo, hi] with the least movement from prev."""
    pcs = set(CHORD[name][1])
    best = None
    for c in combinations(tones(name, lo, hi), k):
        if len({m % 12 for m in c}) < min(k, len(pcs)) or c[-1] - c[0] > 19:
            continue
        cost = abs(np.mean(c) - (lo + hi) / 2) if prev is None else sum(abs(a - b) for a, b in zip(c, prev))
        if best is None or cost < best[0]:
            best = (cost, c)
    return list(best[1])


def window_at(T, t):
    k = -1
    for i, w in enumerate(T['windows']):
        if t >= w['t0'] - 1e-6:
            k = i
    return k


# ---------------------------------------------------------------- parts and their levels
class Part:
    """One part: its own dry stereo track, reverb and echo sends, a level relative to the pluck."""
    def __init__(self, db=0.0, rev=0.2, dly=0.0):
        self.db, self.rev, self.dly = db, rev, dly
        self.L, self.R = np.zeros(S.N), np.zeros(S.N)

    def add(self, sig, t, pan=0.0):
        i0 = int(round(max(0.0, t) * SR))
        if i0 >= S.N:
            return
        s = sig[:S.N - i0]
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        self.L[i0:i0 + len(s)] += s * np.cos(a)
        self.R[i0:i0 + len(s)] += s * np.sin(a)


# K-weighting (ITU-R BS.1770, 48 kHz): the high shelf, then the RLB high-pass
KB1, KA1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
KB2, KA2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]


def kweight(x):
    return signal.lfilter(KB2, KA2, signal.lfilter(KB1, KA1, x))


def level_active(x):
    """K-weighted RMS over the 400 ms blocks within 30 dB of the loudest: a part's level while it plays."""
    y = kweight(x)
    w = int(0.4 * SR)
    k = len(y) // w
    r = np.sqrt((y[:k * w].reshape(k, w) ** 2).mean(1))
    if r.max() <= 0:
        return 0.0
    a = r[r > r.max() * 10 ** (-30 / 20)]
    return float(np.sqrt((a ** 2).mean()))


def mixdown(parts, ref=0.05):
    for p in parts:
        r = level_active((p.L + p.R) / 2)
        if r == 0:
            continue
        g = ref * 10 ** (p.db / 20) / r
        S.L += p.L * g
        S.R += p.R * g
        if p.rev:
            S.SEND_L += p.L * g * p.rev
            S.SEND_R += p.R * g * p.rev
        if p.dly:
            S.DLY_L += p.L * g * p.dly
            S.DLY_R += p.R * g * p.dly


def momentary(L, R, t_lo, t_hi):
    """K-weighted momentary loudness (400 ms, 100 ms hop) of L+R between t_lo and t_hi (dB, relative)."""
    i0, i1 = int(t_lo * SR), int(t_hi * SR)
    y = kweight((L[i0:i1] + R[i0:i1]) / 2)
    w, h = int(0.4 * SR), int(0.1 * SR)
    c = np.cumsum(np.r_[0, y ** 2])
    idx = np.arange(0, max(1, len(y) - w), h)
    return 10 * np.log10((c[idx + w] - c[idx]) / w + 1e-15)


def trim_end(t_tour, t_end, total, over=2.0):
    """Everything from the end card on goes down so its loudest moment is at most `over` dB above
    the tour's median: a gentle close, not a hit. The gain moves over the 150 ms before the cut."""
    med = float(np.median(momentary(S.L, S.R, t_tour, t_end)))
    top = float(momentary(S.L, S.R, t_end, total).max())
    trim = min(0.0, med + over - top)
    if trim < 0:
        g = np.ones(S.N)
        i0, i1 = int((t_end - 0.15) * SR), int(t_end * SR)
        g[i0:i1] = np.linspace(1, 10 ** (trim / 20), i1 - i0)
        g[i1:] = 10 ** (trim / 20)
        for a in (S.L, S.R, S.SEND_L, S.SEND_R, S.DLY_L, S.DLY_R):
            a *= g
    return trim


def master(path, bed, delay, rms=0.11):
    """The brand master (synth.master) without the side-chain: the ping-pong echo (feedback 0.38,
    6 taps), the 2.6 s room, high-pass 28 Hz, tanh glue, -1 dBFS peak, the 0.6 s fade. The
    plucks' attacks are sharper than the brand's pads, so the bed sits lower into the tanh."""
    N = S.N
    Lm, Rm = S.L.copy(), S.R.copy()
    sl, sr = S.SEND_L.copy(), S.SEND_R.copy()
    d = int(delay * SR)
    dl, dr = np.zeros(N), np.zeros(N)
    for k in range(1, 7):
        g, sh = 0.38 ** (k - 1), d * k
        if sh >= N:
            break
        src = (S.DLY_L[:N - sh] + S.DLY_R[:N - sh]) * 0.5 * g
        (dr if k % 2 == 1 else dl)[sh:] += src
    Lm += S.lp(dl, 4500) * 0.8
    Rm += S.lp(dr, 4500) * 0.8
    ir_n = int(2.6 * SR)
    ti = tt(ir_n)
    env = np.exp(-ti / 0.62) * np.clip(ti / 0.012, 0, 1)
    pre = np.zeros(int(0.02 * SR))
    irl = np.concatenate([pre, S.lp(S.noise(ir_n), 6000) * env])
    irr = np.concatenate([pre, S.lp(S.noise(ir_n), 6000) * env])
    irl /= np.sqrt(np.sum(irl ** 2))
    irr /= np.sqrt(np.sum(irr ** 2))
    Lm += S.hp(signal.fftconvolve(sl, irl)[:N], 180) * 0.9
    Rm += S.hp(signal.fftconvolve(sr, irr)[:N], 180) * 0.9
    mix = np.stack([S.hp(Lm, 28), S.hp(Rm, 28)], 1)
    mix *= rms / np.sqrt(np.mean(mix[int(bed[0] * SR):int(bed[1] * SR)] ** 2))
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    mix *= (np.clip((S.DUR - tt(N)) / 0.6, 0, 1) * np.clip(tt(N) / 0.01, 0, 1))[:, None]
    mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
    wavfile.write(path, SR, (mix * 32767).astype(np.int16))


def narrow(path, sm=0.10):
    """The brand's narrow image: the side channel scaled so that side/mid is at most sm."""
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768.0
    M, Sd = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    r = np.sqrt((Sd ** 2).mean() / (M ** 2).mean())
    Sd *= min(1.0, sm / r)
    wavfile.write(path, sr, (np.stack([M + Sd, M - Sd], 1) * 32767).clip(-32768, 32767).astype(np.int16))
    return r


def normalize(src, dst, lufs, tp):
    """Linear gain to lufs; peaks above the ceiling that gain takes to tp go down first (score.limit)."""
    i_raw, _ = SC.measure(src)
    lim = dst[:-4] + '.lim.wav'
    runs, most = SC.limit(src, lim, tp - (lufs - i_raw) - 0.3)
    i_lim, tp_lim = SC.measure(lim)
    if tp_lim + (lufs - i_lim) > tp:
        raise SystemExit(f'peaks too high for linear gain ({tp_lim:.2f} dBTP at {i_lim:.2f} LUFS)')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', lim, '-af', f'volume={lufs - i_lim:.3f}dB',
                    '-ar', '48000', '-c:a', 'pcm_s16le', dst], check=True)
    os.remove(lim)
    return runs, most


# ---------------------------------------------------------------- the score
def score(cut, out, lufs=-15.0, tp=-2.5):
    global _rng
    T = SC.timeline(cut)
    total = T['duration']
    t_end = next(e['t'] for e in T['events'] if e['type'] == 'end')
    seed = SEEDS[cut]
    S.set_duration(total)
    S.reset(seed)
    _rng = np.random.default_rng(seed)
    rng = np.random.default_rng(seed)
    n = 4 * max(1, round(t_end * BPM / 960))      # whole phrases of four bars
    bar = t_end / n
    beat = bar / 4
    at = lambda k, pos=0.0: k * bar + pos * beat
    nw = len(T['windows'])
    lit = lambda w: w / max(1, nw - 1)              # 0 at the first window, 1 at the last
    prog = [PROG[k % 4] for k in range(n)]
    arp, pad, bass = Part(0, rev=0.12, dly=0.35), Part(-8, rev=0.4), Part(-8)
    prev = None
    for k, ch in enumerate(prog):
        t0 = at(k)
        w, last = max(0, window_at(T, t0 + 0.01)), k == n - 1
        tl = tones(ch, 60, 84)[:5]
        step = 0.5 if (k == 0 or last) else 0.25    # eighths in the first and the last bar
        for i in range(int(round(4 / step))):
            pos = i * step
            m = tl[ARP[i % 8] % len(tl)]
            vel = (1.0 if abs(pos - round(pos)) < 1e-6 else 0.7) * rng.uniform(0.95, 1.03)
            arp.add(pluck(m, vel, 0.32, 1700 + 2000 * lit(w), 500), at(k, pos), 0.25 * np.sin(i * 0.9))
        prev = lead(prev, ch, 52, 72, 4)
        for m in prev:
            pad.add(pad_note(m, bar, 1.0, cutoff=1100 + 800 * lit(w), att=0.3 if k else 1.4, rel=0.7), t0, (m % 5 - 2) * 0.12)
        if w >= 1 and not last:
            r = root(ch, 36)
            for i in range(8):
                bass.add(sub(r, beat / 2 * 0.7, 1.0 if i % 2 == 0 else 0.7, 0.004, 0.05), at(k, i / 2))
    # the end card: a rolled C chord on the pluck, the pad on Cmaj9, the bass on C, the logo shimmer
    for i, m in enumerate([60, 64, 67, 72, 76, 79]):
        arp.add(pluck(m, 0.8, 0.6, 2800, 600), t_end + 0.04 * i, (i - 2.5) * 0.08)
    for m in (48, 55, 59, 62, 64):
        pad.add(pad_note(m, total - t_end, 1.0, cutoff=1500, att=0.15, rel=1.0), t_end, (m % 5 - 2) * 0.12)
    bass.add(sub(36, 2.0, 0.9, 0.01, 0.5), t_end)
    logo = Part(-10, rev=0.45)
    for i, m in enumerate((79, 83, 88)):
        logo.add(chime(mtof(m), 1.0, 2.2), t_end + 0.7 + i * 0.08, (i - 1) * 0.2)
    mixdown([arp, pad, bass, logo])
    trim = trim_end(T['tour']['t0'], t_end, total)
    raw = out[:-4] + '.raw.wav'
    master(raw, (T['tour']['t0'] + 1.0, t_end - 1.0), 0.75 * beat)
    sm = narrow(raw)
    runs, most = normalize(raw, out, lufs, tp)
    os.remove(raw)
    i, p = SC.measure(out)
    print(f'{cut}: {n} bars at {60 / beat:.1f} BPM; {i:.1f} LUFS, {p:.1f} dBTP; side/mid {sm:.2f} -> 0.10; '
          f'end card {trim:.1f} dB; limiter {runs} peaks, at most {most:.1f} dB')


if __name__ == '__main__':
    opt = {a.split('=')[0][2:]: float(a.split('=')[1]) for a in sys.argv[3:] if a.startswith('--')}
    score(sys.argv[1].upper(), sys.argv[2], opt.get('lufs', -15.0), opt.get('tp', -2.5))
