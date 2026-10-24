"""The voice of a reel: ElevenLabs speaks each beat's line, and the with-timestamps endpoint times
its characters, for the captions that follow the voice (tools/shorts/compose.py).

  python3 tools/shorts/voice.py video/shorts/tteer/script.yaml video/out/shorts/tteer/audio

Writes <out>/<beat>.wav (48 kHz mono, one clip a beat), <out>/words.json (each beat's caption
words with their start and end in s from the clip's start) and <out>/ledger.json (the characters
sent and their estimated price). A line may give [shown|spoken]: the caption shows the first, the
voice says the second ("[TEE|T E E]").

The API key comes from $ELEVENLABS_API_KEY or ~/.config/elevenlabs/key, never from the repository.
A clip whose text, voice and model have not changed is not sent again (its hash is in the ledger).
Spend cap: before each call the ledger adds the call's price at RATE dollars per 1,000 characters
(the highest list price of the plans with API access); a call that would take the total over CAP
stops the run.
"""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request

import yaml

CAP = 4.00
RATE = 0.30            # $ per 1,000 characters: an upper bound of the per-character price
API = 'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128'


def load(path):
    """A YAML (or JSON) file of the reel: script.yaml, claims.yaml."""
    with open(path) as f:
        return yaml.safe_load(f) if path.endswith(('.yaml', '.yml')) else json.load(f)


def key():
    k = os.environ.get('ELEVENLABS_API_KEY')
    if k:
        return k.strip()
    with open(os.path.expanduser('~/.config/elevenlabs/key')) as f:
        return f.read().strip()


def parse(line):
    """A line of the script: the caption's words, the spoken text, and for each caption word the
    range of spoken words it stands for."""
    shown, spoken, groups = [], [], []
    for m in re.finditer(r'\[([^|\]]+)\|([^\]]+)\]|([^\[]+)', line):
        if m.group(3) is not None:
            for w in m.group(3).split():
                groups.append((len(spoken), len(spoken) + 1))
                shown.append(w)
                spoken.append(w)
        else:
            a, b = m.group(1).split(), m.group(2).split()
            s0 = len(spoken)
            spoken.extend(b)
            for i, w in enumerate(a):
                lo, hi = (s0 + i, s0 + i + 1) if len(a) == len(b) else (s0, s0 + len(b))
                groups.append((lo, hi))
                shown.append(w)
    # punctuation stuck after a pair joins the caption word before it
    out_s, out_g = [], []
    for w, g in zip(shown, groups):
        if out_s and re.fullmatch(r'[.,;:!?]+', w):
            out_s[-1] += w
            continue
        out_s.append(w)
        out_g.append(g)
    return out_s, ' '.join(spoken), out_g


def spoken_words(alignment):
    """The spoken words and their times from the character alignment: [(word, t0, t1)]."""
    ch = alignment['characters']
    t0s, t1s = alignment['character_start_times_seconds'], alignment['character_end_times_seconds']
    words, cur, a, b = [], '', None, None
    for c, x0, x1 in zip(ch, t0s, t1s):
        if c.isspace():
            if cur:
                words.append((cur, a, b))
            cur, a, b = '', None, None
            continue
        if not cur:
            a = x0
        cur += c
        b = x1
    if cur:
        words.append((cur, a, b))
    return words


def main(script_path, out):
    S = load(script_path)
    os.makedirs(out, exist_ok=True)
    led_path = os.path.join(out, 'ledger.json')
    ledger = json.load(open(led_path)) if os.path.exists(led_path) else {'cap': CAP, 'rate_per_1000': RATE, 'calls': [], 'spent': 0.0}
    voice, model = S['voice']['id'], S['voice']['model']
    settings = S['voice'].get('settings', {})
    words_out = {}
    for beat in S['beats']:
        text = beat.get('voice')
        if not text:
            continue
        shown, spoken, groups = parse(text)
        h = hashlib.sha256(json.dumps([spoken, voice, model, settings]).encode()).hexdigest()[:16]
        wav = os.path.join(out, f"{beat['id']}.wav")
        meta = os.path.join(out, f"{beat['id']}.json")
        cached = os.path.exists(wav) and os.path.exists(meta) and json.load(open(meta)).get('hash') == h
        if not cached:
            price = len(spoken) * RATE / 1000
            if ledger['spent'] + price > CAP + 1e-9:
                sys.exit(f"spend cap: {beat['id']} would take ${ledger['spent'] + price:.2f} past ${CAP:.2f}")
            ledger['spent'] = round(ledger['spent'] + price, 4)
            ledger['calls'].append({'beat': beat['id'], 'chars': len(spoken), 'price': round(price, 4), 'hash': h})
            json.dump(ledger, open(led_path, 'w'), indent=1)
            body = json.dumps({'text': spoken, 'model_id': model, 'voice_settings': settings}).encode()
            req = urllib.request.Request(API.format(voice=voice), data=body, method='POST',
                                         headers={'xi-api-key': key(), 'Content-Type': 'application/json', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read())
            mp3 = os.path.join(out, f"{beat['id']}.mp3")
            open(mp3, 'wb').write(base64.b64decode(res['audio_base64']))
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', mp3, '-ar', '48000', '-ac', '1', wav], check=True)
            os.remove(mp3)
            json.dump({'hash': h, 'alignment': res.get('alignment'), 'spoken': spoken}, open(meta, 'w'))
            print(f"{beat['id']}: {len(spoken)} characters, ${price:.3f}; total ${ledger['spent']:.2f} of ${CAP:.2f}")
        else:
            print(f"{beat['id']}: cached")
        al = json.load(open(meta))['alignment']
        sw = spoken_words(al)
        # each caption word: from the start of its first spoken word to the end of its last
        cap = []
        for w, (lo, hi) in zip(shown, groups):
            seg = sw[lo:hi] if hi <= len(sw) else sw[lo:]
            if not seg:
                continue
            cap.append([w, round(seg[0][1], 3), round(seg[-1][2], 3)])
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], capture_output=True, text=True, check=True).stdout)
        words_out[beat['id']] = {'words': cap, 'dur': round(dur, 3)}
    json.dump(words_out, open(os.path.join(out, 'words.json'), 'w'), indent=1)
    print(f"ledger: ${ledger['spent']:.2f} of ${CAP:.2f} ({sum(c['chars'] for c in ledger['calls'])} characters sent)")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
