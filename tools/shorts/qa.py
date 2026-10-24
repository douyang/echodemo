"""QA of a reel (the medical-shorts checks): duration, frame count, loudness, true peak, caption
coverage, safe zones, copy rules, claims and the loop.

  python3 tools/shorts/qa.py video/shorts/tteer/script.yaml video/out/shorts/tteer/out/tteer-voice.mp4 [--novoice]

Reads the script, the claims (claims.yaml beside the script), the cut's timeline and captions
(<mp4 stem>.cues.json, written by compose.py), and the MP4. Writes <mp4 stem>.qa.json and exits 1
when a check fails.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import yaml

BANNED = ['revolutionary', 'game-changer', 'game changer', 'breakthrough', 'miracle', 'cutting-edge', 'cutting edge', "here's", 'did you know']
SAFE_TOP, SAFE_BOTTOM = 250, 420


def load(path):
    """A YAML (or JSON) file of the reel: script.yaml, claims.yaml."""
    with open(path) as f:
        return yaml.safe_load(f) if path.endswith(('.yaml', '.yml')) else json.load(f)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
                          'stream=nb_read_frames,width,height,r_frame_rate:format=duration', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d['streams'][0]
    num, den = map(int, s['r_frame_rate'].split('/'))
    return {'frames': int(s['nb_read_frames']), 'w': s['width'], 'h': s['height'], 'fps': num / den, 'dur': float(d['format']['duration'])}


def loudness(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    txt = r.stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', txt)[-1])
    tp = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', txt)[-1])
    return i, tp


def frame_at(path, which, w, h):
    """The first or the last frame as an RGB array."""
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'error']
    if which == 'last':
        args += ['-sseof', '-0.2', '-i', path, '-update', '1', '-frames:v', '1']
    else:
        args += ['-i', path, '-frames:v', '1']
    args += ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(args, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8)
    n = w * h * 3
    return a[-n:].reshape(h, w, 3).astype(np.float64)


def ssim(a, b):
    """Global SSIM on the luma, after a 4x box down-sample (a cheap, stable loop check)."""
    def luma(x):
        y = 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]
        h, w = y.shape[0] // 4 * 4, y.shape[1] // 4 * 4
        return y[:h, :w].reshape(h // 4, 4, w // 4, 4).mean((1, 3))
    x, y = luma(a), luma(b)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mx, my = x.mean(), y.mean()
    vx, vy, cxy = x.var(), y.var(), ((x - mx) * (y - my)).mean()
    return float(((2 * mx * my + c1) * (2 * cxy + c2)) / ((mx ** 2 + my ** 2 + c1) * (vx + vy + c2)))


def main(script_path, mp4, novoice=False):
    S = load(script_path)
    claims = {c['id']: c for c in load(os.path.join(os.path.dirname(script_path), 'claims.yaml'))['claims']}
    stem = mp4[:-4]
    cues = json.load(open(stem + '.cues.json'))
    P = probe(mp4)
    res = {'file': os.path.basename(mp4), 'checks': []}

    def check(name, ok, detail):
        res['checks'].append({'check': name, 'pass': bool(ok), 'detail': detail})

    plan = cues['duration']
    check('duration', abs(P['dur'] - plan) <= 0.5 and S.get('min', 30) <= P['dur'] <= S.get('max', 90),
          f"{P['dur']:.2f} s, planned {plan:.2f} s (window {S.get('min', 30)}-{S.get('max', 90)} s)")
    want = round(plan * S['fps'])
    check('frames', abs(P['frames'] - want) <= 1 and abs(P['fps'] - S['fps']) < 0.01, f"{P['frames']} frames at {P['fps']:.2f} fps, planned {want}")
    check('size', (P['w'], P['h']) == tuple(S['size']), f"{P['w']} x {P['h']}")
    i, tp = loudness(mp4)
    check('loudness', abs(i - (-14.0)) <= 1.0, f'{i:.1f} LUFS integrated (target -14 ±1)')
    check('true peak', tp <= -1.0, f'{tp:.1f} dBTP (ceiling -1.0)')
    if not novoice:
        # every voiced word inside a caption window
        missing = []
        for b in cues['voice']:
            for w, t0, t1 in b['words']:
                mid = (t0 + t1) / 2
                if not any(c['t0'] - 1e-3 <= mid <= c['t1'] + 1e-3 and w in c['text'] for c in cues['captions']):
                    missing.append(f'{w}@{mid:.2f}')
        check('caption coverage', not missing, 'every voiced word is captioned' if not missing else f"{len(missing)} words without a caption: {', '.join(missing[:8])}")
    else:
        short = [c for c in cues['captions'] if (c['t1'] - c['t0']) < max(1.2, 0.3 * len(c['text'].split())) - 1e-3]
        check('caption time', not short, 'each caption stays 0.3 s a word and at least 1.2 s' if not short else f'{len(short)} captions too short: {short[0]["text"][:40]}')
    # safe zones: no key text in the top 250 px or the bottom 420 px
    bad = [e for e in cues['text_boxes'] if e['y0'] < SAFE_TOP or e['y1'] > S['size'][1] - SAFE_BOTTOM]
    check('safe zones', not bad, 'no key text in the top 250 px or the bottom 420 px' if not bad else f"{len(bad)} text boxes outside: {bad[0]['what']}")
    # copy rules over every word shown or spoken
    texts = [c['text'] for c in cues['captions']] + [e['what'] for e in cues['text_boxes']] + [b.get('voice', '') for b in S['beats']]
    hits = [t for t in texts if '\u2014' in t or any(w in t.lower() for w in BANNED)]
    check('copy rules', not hits, 'no em dashes, no banned words' if not hits else f'{len(hits)} lines: {hits[0][:60]}')
    # claims: every cited ID exists and is verified
    cited = sorted({c for b in S['beats'] for c in b.get('claims', [])})
    unv = [c for c in cited if c not in claims or claims[c].get('status') != 'verified']
    check('claims', not unv, f'{len(cited)} claims cited, all verified' if not unv else f"not verified: {', '.join(unv)}")
    # the loop: the last frame matches the first
    a, b = frame_at(mp4, 'first', P['w'], P['h']), frame_at(mp4, 'last', P['w'], P['h'])
    s = ssim(a, b)
    check('loop', s >= 0.97, f'SSIM first vs last {s:.3f} (0.97 or more)')
    res['pass'] = all(c['pass'] for c in res['checks'])
    json.dump(res, open(stem + '.qa.json', 'w'), indent=1)
    for c in res['checks']:
        print(f"{'pass' if c['pass'] else 'FAIL'}  {c['check']:<16} {c['detail']}")
    sys.exit(0 if res['pass'] else 1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--novoice' in sys.argv)
