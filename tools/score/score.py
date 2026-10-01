"""Soundtrack of a cut of the "Echo views" video, scored to the InVision sound brand (the
invision-sound skill) with its reference engine (synth.py). It reads the cut's timeline
(events.mjs, from video/timeline.js), so each cue sits on the frame of its event:
  - title card: one heartbeat on the first beat the trace draws, a whoosh as the title rises and
    one for the line under it, a C pad that swells, a riser into the tour;
  - tour: the heart's tempo (70 a minute; the beat grid falls on mitral closure, so the kick is
    the heartbeat), C major I-V-vi-IV, one chord to a view and back to C with each window; the
    brand's pad, sub, kick, off-beat hats and plucked arpeggio with a dotted-eighth echo; the pad
    brightens window by window, and the last two windows add sixteenth hats;
  - a new window: a riser over the move, then the brand's rising fourth G5-C6 ("value lands")
    and a light accent as its first view arrives;
  - any other view: one soft bell (the brand's single mark) on a note of its chord;
  - the beat before the end card drops the kick and the sub;
  - end card: the sound logo (Cmaj9; the shimmer G5-B5-E6 as the title rises; the heartbeat on
    the last beat), then the 0.6 s fade.
A fixed seed per cut, so a mix rebuilds exactly. Loudness -15 LUFS with the brand's linear
two-pass normalization (loudnorm2.py), true peak -2.5 dBTP, so AAC (which raises the peak by up to
1 dB) stays under the brand's -1 dBTP. At this tempo the bed is sparser than the films' 120 BPM,
so the hits stand higher over it: a look-ahead true-peak limiter takes the few hits above the
ceiling down first, else the normalization would leave linear mode and lift the quiet title card.
  python3 tools/score/score.py A video/out/echo-views-A.wav
"""
import json
import os
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import synth as S  # noqa: E402
from synth import chime, heartbeat, hat, impact, kick, mtof, pad_note, place, pluck, riser, sub_note, whoosh  # noqa: E402

SEEDS = {'A': 7101, 'B': 7102, 'C': 7103, 'D': 7104}
LUFS, TP = -15.0, -2.5

# the brand's chords (score_helpers.py CH): pad notes, sub root, arpeggio notes (MIDI)
CH = {
    'C': ([48, 52, 55, 60, 64], 36, [72, 76, 79, 83, 84]),
    'G': ([43, 50, 55, 59, 62], 31, [67, 71, 74, 79, 83]),
    'Am': ([45, 52, 57, 60, 64], 33, [69, 72, 76, 79, 81]),
    'F': ([41, 48, 53, 57, 60], 29, [65, 69, 72, 76, 77]),
}
PROG = ['C', 'G', 'Am', 'F']
# the single mark of each chord: the brand's single-mark notes (A4, C5, E5, G5) in the chord; on G,
# E5 first (G6): the G chord's arpeggio plays G5 itself
BELL = {'C': [79, 76], 'G': [76, 79], 'Am': [76, 69], 'F': [72, 69]}
ARP = [0, 2, 1, 3, 2, 4, 3, 1]
CMAJ9 = [48, 52, 55, 59, 62, 67]


def measure(path):
    """Integrated loudness (LUFS) and true peak (dBTP), from ffmpeg's loudnorm measure."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    m = json.loads(r[r.rfind('{'):r.rfind('}') + 1])
    return float(m['input_i']), float(m['input_tp'])


def limit(src, dst, ceiling):
    """
    Take every peak of src above ceiling (dBTP, on the signal 4x oversampled) down to it: the gain
    falls over 5 ms before the peak, holds through a run of peaks, and comes back over 80 ms.
    Below the ceiling nothing changes. Returns the number of runs and the most it took (dB).
    """
    sr, x = wavfile.read(src)
    x = x.astype(np.float64) / 32768.0
    p = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    p = np.pad(p, (0, 4 * len(x) - len(p)))[:4 * len(x)].reshape(-1, 4).max(axis=1)
    c = 10 ** (ceiling / 20)
    over = np.flatnonzero(p > c)
    g = np.ones(len(x))
    a, r = int(0.005 * sr), int(0.08 * sr)
    runs, most = 0, 0.0
    if len(over):
        cuts = np.flatnonzero(np.diff(over) > r)
        for s, e in zip(np.r_[over[0], over[cuts + 1]], np.r_[over[cuts], over[-1]]):
            k = c / p[s:e + 1].max()
            g[s:e + 1] = np.minimum(g[s:e + 1], k)
            i0 = max(0, s - a)
            ramp = 1 - (1 - k) * 0.5 * (1 - np.cos(np.pi * np.arange(s - i0) / a))
            g[i0:s] = np.minimum(g[i0:s], ramp)
            i1 = min(len(x), e + 1 + r)
            back = k + (1 - k) * 0.5 * (1 - np.cos(np.pi * np.arange(i1 - e - 1) / r))
            g[e + 1:i1] = np.minimum(g[e + 1:i1], back)
            runs, most = runs + 1, max(most, -20 * np.log10(k))
    wavfile.write(dst, sr, (x * g[:, None]).astype(np.float32))
    return runs, most


def timeline(cut):
    r = subprocess.run(['node', os.path.join(HERE, 'events.mjs'), cut], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def score(cut, out):
    T = timeline(cut)
    B = T['beat']
    e8 = B / 2
    S.set_duration(T['duration'])
    S.reset(SEEDS[cut])
    kicks, duck = [], []
    t_tour = T['tour']['t0']
    t_end = next(e['t'] for e in T['events'] if e['type'] == 'end')
    drop = (t_end - B, t_end)                       # the breath before the end card
    dropped = lambda t: drop[0] - 1e-6 <= t < drop[1] - 1e-6
    wins = T['windows']
    win_of = {v: i for i, w in enumerate(wins) for v in w['views']}
    cutoff = lambda w: 1400 + (2200 - 1400) * (w / max(1, len(wins) - 1))

    def value_cue(t):
        place(chime(mtof(79), 1.0, 1.5), t, 0.0, 0.125, rev=0.4)
        place(chime(mtof(84), 1.0, 1.5), t + 0.12, 0.0, 0.105, rev=0.4)
        place(impact(0.55, 0.5), t, 0.0, 0.6, rev=0.35)
        duck.append(t)

    # ---------------------------------------------------------------- title card
    place(heartbeat(1.0), B, 0.0, 0.85, rev=0.2)                    # the trace's first beat
    place(whoosh(0.6, 500, 2600), 0.15, -0.2, 0.08, rev=0.2)          # the title rises
    place(whoosh(0.5, 900, 4200), 0.75, 0.2, 0.06, rev=0.2)           # the line under it
    for m in CH['C'][0]:
        place(pad_note(m, t_tour, 1.0, cutoff=1300, att=0.8, rel=0.9), 0.0, (m % 5 - 2) * 0.28, 0.04, rev=0.45, bus='music')
    place(riser(0.8), t_tour - 0.8, 0.0, 0.22)

    # ---------------------------------------------------------------- tour: a chord to a view
    arrivals = [e for e in T['events'] if e['type'] == 'arrive']
    nth_in_win = {}
    for k, a in enumerate(arrivals):
        w = win_of[a['view']]
        j = nth_in_win.get(w, 0)
        nth_in_win[w] = j + 1
        name = PROG[j % len(PROG)]
        pad, root, arp = CH[name]
        t0 = a['t']
        t1 = arrivals[k + 1]['t'] if k + 1 < len(arrivals) else t_end
        d = t1 - t0
        for m in pad:
            place(pad_note(m, d, 1.0, cutoff=cutoff(w), att=0.2, rel=0.5), t0, (m % 5 - 2) * 0.28, 0.044, rev=0.35, bus='music')
        for i in range(int(round(d / e8))):
            ts = t0 + i * e8
            if not dropped(ts):
                place(sub_note(root, e8 * 0.85, 1.0), ts, 0.0, 0.25 if i % 2 == 0 else 0.18, bus='music')
            place(pluck(arp[ARP[i % 8] % 5], 0.2, 1.0), ts, 0.35 * np.sin(i * 0.9), 0.05 * (1.0 if i % 4 == 0 else 0.7),
                  rev=0.2, dly=0.35, bus='music')
        # the cue of the arrival: the value cue for a new window (and the first view), else a bell
        if a.get('first') or a.get('newWindow'):
            value_cue(t0)
        else:
            notes = BELL[name]
            place(chime(mtof(notes[(j // len(PROG)) % len(notes)]), 1.0, 1.3), t0, 0.0, 0.08, rev=0.4)
    for e in T['events']:
        if e['type'] == 'window':
            r = min(0.9, e['t1'] - e['t'])
            place(riser(r), e['t1'] - r, 0.0, 0.2)
    # kick on every beat of the grid, off-beat hats (sixteenths in the last two windows)
    nb = int(round((t_end - t_tour) / B))
    for i in range(nb):
        tb = t_tour + i * B
        if not dropped(tb):
            kicks.append(tb)
            place(kick(1.0), tb, 0.0, 0.62)
        place(hat(0.045, 1.0), tb + e8, 0.25, 0.12, rev=0.05)
        w = next((k for k, x in enumerate(wins) if x['t0'] - 1e-6 <= tb < (wins[k + 1]['t0'] if k + 1 < len(wins) else t_end)), 0)
        if w >= len(wins) - 2:
            place(hat(0.016, 1.0), tb + B / 4, -0.3, 0.05)
            place(hat(0.016, 1.0), tb + 3 * B / 4, -0.3, 0.045)

    # ---------------------------------------------------------------- end card: the sound logo
    hold = T['duration'] - t_end
    place(impact(1.0, 0.9), t_end, 0.0, 0.8, rev=0.45)
    place(kick(1.0), t_end, 0.0, 0.68)
    kicks.append(t_end)
    duck.append(t_end)
    for m in CMAJ9:
        place(pad_note(m, hold, 1.0, cutoff=2000, att=0.08, rel=1.1), t_end, (m % 5 - 2) * 0.3, 0.05, rev=0.5, bus='music')
    place(sub_note(36, hold, 1.0), t_end, 0.0, 0.24, bus='music')
    for i, m in enumerate((79, 83, 88)):                               # as the title rises (0.9 s)
        place(chime(mtof(m), 1.0, 1.8), t_end + 0.7 + i * 0.08, (i - 1) * 0.4, 0.07, rev=0.5)
    if hold >= 4.0:
        place(whoosh(0.5, 900, 4200), t_end + 1.6, 0.2, 0.09, rev=0.2)
    place(heartbeat(1.2), T['duration'] - B, 0.0, 0.88, rev=0.3)       # the trace's last beat

    raw, lim = out[:-4] + '.raw.wav', out[:-4] + '.lim.wav'
    S.master(raw, kicks, bed=(t_tour + 2 * B, t_end - 2 * B), duck_extra=duck, delay=0.75 * B)
    # the ceiling that linear gain to LUFS takes to TP (0.3 dB spare for the limiter's own overshoot)
    i_raw, _ = measure(raw)
    runs, most = limit(raw, lim, TP - (LUFS - i_raw) - 0.3)
    i_lim, tp_lim = measure(lim)
    if tp_lim + (LUFS - i_lim) > TP:
        raise SystemExit(f'{cut}: peaks too high for linear normalization ({tp_lim:.2f} dBTP at {i_lim:.2f} LUFS)')
    subprocess.run([sys.executable, os.path.join(HERE, 'loudnorm2.py'), lim, out, str(TP)], check=True)
    i, tp = measure(out)
    print(f'{cut}: {i:.1f} LUFS, {tp:.1f} dBTP; limiter took {runs} peaks down by up to {most:.1f} dB')
    os.remove(raw)
    os.remove(lim)


if __name__ == '__main__':
    score(sys.argv[1].upper(), sys.argv[2])
