"""The soundtrack of a chapter video with a voice-over: the voice (tools/voice/vo.py) over the
Bright pulse bed (tools/score/pulse.py), which ducks under the voice.

  python3 tools/voice/mix.py mitraclip-vo video/out/chapter-mitraclip-vo.wav [--srt-only]

It also writes the captions as subtitles beside the soundtrack (.srt, one cue a line), for a
player or a site that shows its own. --srt-only writes only them.

The video (video/chapters.js, its `vo`) gives where each line starts: the title line on the title
card, and each step's lines in its hold. The voice sits at -16 LUFS. The bed plays at its own
level, -15 LUFS, on the end card, 6 dB under it between lines and across the moves, and 15 dB
under it while the voice speaks: it goes down over 0.12 s, starting 0.15 s before a line, and
comes back over 0.5 s, 0.25 s after it. Then the mix goes to -15 LUFS with linear gain, the
true peak under -2.5 dBTP (pulse.py normalize: AAC adds up to 1 dB).
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.io import wavfile
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'score'))
import pulse                                       # noqa: E402
import score as SC                                 # noqa: E402

SR = 48000
VOICE_LUFS = -16.0
GAP_DB, SPEECH_DB = -6.0, -15.0                    # the bed between lines, and under the voice
LOOK, HOLD, ATTACK, RELEASE = 0.15, 0.25, 0.12, 0.5


def video_of(key):
    """The video's layout (events.mjs) and its voice-over (video/vo/<chapter>.js)."""
    T = SC.timeline(key)
    js = subprocess.run(['node', '-e', f"import('{ROOT}/video/chapters.js').then((m) => process.stdout.write(JSON.stringify(m.VIDEOS['{key}'].vo)))"],
                        capture_output=True, text=True, check=True).stdout
    return T, json.loads(js)


def smooth_gain(target, dt):
    """A gain curve (dB) that falls with ATTACK and rises with RELEASE (one-pole, both ways)."""
    out = np.empty_like(target)
    g = target[0]
    a_dn, a_up = np.exp(-dt / ATTACK), np.exp(-dt / RELEASE)
    for i, x in enumerate(target):
        a = a_dn if x < g else a_up
        g = a * g + (1 - a) * x
        out[i] = g
    return out


def normalize(src, dst, lufs, tp):
    """pulse.py normalize, but the limiter's ceiling comes down until the gain after it fits: the
    voice's peaks are many, so limiting them takes some loudness too."""
    i_raw, _ = SC.measure(src)
    lim = dst[:-4] + '.lim.wav'
    ceiling = tp - (lufs - i_raw) - 0.3
    for _ in range(5):
        runs, most = SC.limit(src, lim, ceiling)
        i_lim, tp_lim = SC.measure(lim)
        over = tp_lim + (lufs - i_lim) - tp
        if over <= 0:
            break
        ceiling -= over + 0.1
    else:
        raise SystemExit(f'peaks too high for linear gain ({tp_lim:.2f} dBTP at {i_lim:.2f} LUFS)')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', lim, '-af', f'volume={lufs - i_lim:.3f}dB',
                    '-ar', '48000', '-c:a', 'pcm_s16le', dst], check=True)
    os.remove(lim)
    return runs, most


def srt(lines, path):
    """The lines as SubRip cues: each from its start to 0.3 s after its end, never past the next."""
    stamp = lambda t: f'{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round(t % 1 * 1000)) % 1000:03d}'
    out = []
    for k, (t0, ln) in enumerate(lines):
        t1 = t0 + ln['dur'] + 0.3
        if k + 1 < len(lines):
            t1 = min(t1, lines[k + 1][0] - 0.05)
        out.append(f'{k + 1}\n{stamp(t0)} --> {stamp(t1)}\n{ln["text"]}\n')
    with open(path, 'w') as f:
        f.write('\n'.join(out))


def main(key, out, srt_only=False):
    T, vo = video_of(key)
    holds = [s for s in T['segs'] if s['kind'] == 'hold']
    t_end = next(e['t'] for e in T['events'] if e['type'] == 'end')
    n = int(round(T['frames'] / 30 * SR))
    clips = os.path.join(ROOT, 'video', 'out', 'vo', vo['key'])
    lines = [(vo['title']['at'], vo['title'])] + [(holds[i]['t0'] + ln['at'], ln) for i, g in enumerate(vo['segments']) for ln in g['lines']]
    srt(lines, out[:-4] + '.srt')
    if srt_only:
        print(f'wrote {out[:-4]}.srt: {len(lines)} cues')
        return
    # the voice: each line at its place
    voice = np.zeros(n, dtype=np.float64)
    spans = []
    for t0, ln in lines:
        a, sr = sf.read(os.path.join(clips, ln['clip']), dtype='float64')
        a = resample_poly(a, SR, sr)
        i0 = int(round(t0 * SR))
        voice[i0:i0 + len(a)] += a[:max(0, n - i0)]
        spans.append((t0, t0 + len(a) / SR))
    # the voice compressed (3:1 over -24 dBFS, 4 ms attack, 90 ms release), as a voice-over is:
    # Kokoro's speech peaks some 17 dB over its loudness, and the mix has room for about 12
    tmp, tmp2 = out[:-4] + '.voice.wav', out[:-4] + '.voice2.wav'
    sf.write(tmp, np.stack([voice, voice], 1), SR, subtype='FLOAT')
    i_v, _ = SC.measure(tmp)
    sf.write(tmp, np.stack([voice, voice], 1) * 10 ** ((VOICE_LUFS - i_v) / 20), SR, subtype='FLOAT')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-af',
                    'acompressor=threshold=-24dB:ratio=3:attack=4:release=90:knee=3', '-c:a', 'pcm_f32le', tmp2], check=True)
    i_v, p_v = SC.measure(tmp2)
    voice = sf.read(tmp2, dtype='float64')[0][:, 0] * 10 ** ((VOICE_LUFS - i_v) / 20)
    print(f'voice: {VOICE_LUFS:.1f} LUFS, {p_v + VOICE_LUFS - i_v:.1f} dBTP after the compressor')
    os.remove(tmp)
    os.remove(tmp2)
    # the bed, and its gain: down under each line, up between, full on the end card
    bed_path = out[:-4] + '.bed.wav'
    pulse.score(key.upper(), bed_path)
    bed, sr = sf.read(bed_path, dtype='float64')
    os.remove(bed_path)
    assert sr == SR, sr
    bed = bed[:n] if len(bed) >= n else np.pad(bed, ((0, n - len(bed)), (0, 0)))
    dt = 0.005
    tt = np.arange(0, n / SR, dt)
    target = np.full(len(tt), GAP_DB)
    for a, b in spans:
        target[(tt >= a - LOOK) & (tt < b + HOLD)] = SPEECH_DB
    target[tt >= t_end] = 0.0
    g = smooth_gain(target, dt)
    gain = 10 ** (np.interp(np.arange(n) / SR, tt, g) / 20)
    mix = bed * gain[:, None] + voice[:, None]
    raw = out[:-4] + '.raw.wav'
    # 16-bit, as the limiter (score.py limit) reads it, with its peak at -6 dBFS: the loudness
    # step after it sets the level
    mix *= 0.5 / np.abs(mix).max()
    wavfile.write(raw, SR, np.round(mix * 32767).astype(np.int16))
    runs, most = normalize(raw, out, -15.0, -2.5)
    os.remove(raw)
    i, p = SC.measure(out)
    speech = sum(b - a for a, b in spans)
    print(f'{key}: {len(lines)} lines, {speech:.1f} s of voice in {n / SR:.1f} s; {i:.1f} LUFS, {p:.1f} dBTP; limiter {runs} peaks, at most {most:.1f} dB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--srt-only' in sys.argv)
