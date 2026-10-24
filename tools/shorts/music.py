"""The music bed of a reel: tools/score/pulse.py on the reel's own timeline. Each beat of the
script is a window (the arpeggio opens and the bass comes in as the windows pass), and the close
is the end card (the rolled chord and the chime).

  python3 tools/shorts/music.py video/shorts/tteer/script.yaml [--seed TTEER-REEL]

Reads video/out/shorts/<slug>/plan.json (tools/shorts/compose.py plan) and writes
video/out/shorts/<slug>/audio/music.wav (48 kHz stereo, -16 LUFS; compose.py sets the mix).
"""
import json
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'score'))
import pulse                          # noqa: E402
import score as SC                    # noqa: E402


def main(script, seed=None):
    S = yaml.safe_load(open(script))
    out = os.path.join(ROOT, 'video', 'out', 'shorts', S['slug'])
    P = json.load(open(os.path.join(out, 'plan.json')))
    beats = P['beats']
    close = beats[-1]
    T = {'duration': P['duration'], 'beat': 60 / pulse.BPM,
         'events': [{'type': 'end', 't': close['t0']}],
         'windows': [{'t0': b['t0'], 't1': b['t1']} for b in beats[:-1]],
         'tour': {'t0': beats[1]['t0'], 't1': close['t0']}}
    SC.timeline = lambda cut: T
    seed = seed or f"{S['slug'].upper()}-REEL"
    path = os.path.join(out, 'audio', 'music.wav')
    pulse.score(seed, path, -16.0, -3.0)
    print(path)


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    sd = next((x.split('=', 1)[1] for x in sys.argv[1:] if x.startswith('--seed=')), None)
    main(a[0], sd)
