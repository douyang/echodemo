"""The voice-over of a chapter video: a text-to-speech engine speaks each line of the script,
and each word of the caption takes the time it is spoken, for the captions that follow the voice
(video/chapter.js).

  python tools/voice/vo.py video/vo/mteer.json

Writes video/vo/<key>.js (the lines, where each starts in its step's hold, and the time of each
word of the caption: video/chapters.js builds the video from it) and video/out/vo/<key>/*.wav
(one clip a line, 24 kHz). A line of the script may give [shown|spoken]: the caption shows the
first, the voice says the second ("[TEE|T E E]", "[4 to 5 cm|four to five centimeters]").

The script's engine:
- "elevenlabs": the ElevenLabs API (/v1/text-to-speech/<voice>/with-timestamps, 24 kHz PCM) with
  the script's voice (a voice ID), model and settings. The API key comes from the environment,
  $ELEVENLABS_API_KEY; it is never written to a file here. The API gives the time of each
  character it speaks.
- "kokoro" (the default): Kokoro speaks, and faster-whisper times the words. Needs kokoro-onnx
  0.4, faster-whisper 1.2 and the models: kokoro-v1.0.onnx and voices-v1.0.bin
  (github.com/thewh1teagle/kokoro-onnx releases) in $VOICE_MODELS (default ~/.cache/voice), and
  Whisper base.en, which faster-whisper downloads there.

Each line is spoken alone, so its start and end are exact; within it, the words of the caption
take the times of the spoken letters, matched letter by letter (difflib), so a word written
another way ("3D" for "three D") still finds its time. The caption's word lights at its start.
A clip already spoken with the same words, engine, voice and settings is kept, with its times.
Needs (Python 3.12 venv): soundfile, scipy, numpy.
"""
import difflib
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

MODELS = os.environ.get('VOICE_MODELS', os.path.expanduser('~/.cache/voice'))
LEAD, GAP, TAIL = 0.5, 0.45, 0.9      # s: the first line after the hold starts; between lines; after the last
TITLE_AT = 0.6                         # s: the title line, from the start of the title card
NUM = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'}
TENS = {'1': '', '2': 'twenty', '3': 'thirty', '4': 'forty', '5': 'fifty', '6': 'sixty', '7': 'seventy', '8': 'eighty', '9': 'ninety'}
TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']


def words_of_int(n):
    """An integer (0-999) as words, as the voice says it."""
    n = int(n)
    if n < 10:
        return NUM[str(n)]
    if n < 20:
        return TEENS[n - 10]
    if n < 100:
        return TENS[str(n // 10)] + ('' if n % 10 == 0 else ' ' + NUM[str(n % 10)])
    return NUM[str(n // 100)] + ' hundred' + ('' if n % 100 == 0 else ' ' + words_of_int(n % 100))


def norm(s):
    """Letters for matching: digits as words, lower case, letters only."""
    s = re.sub(r'(\d+)\.(\d+)', lambda m: words_of_int(m.group(1)) + ' point ' + ' '.join(NUM[d] for d in m.group(2)), s)
    s = re.sub(r'\d+', lambda m: words_of_int(m.group(0)) if len(m.group(0)) <= 3 else m.group(0), s)
    return re.sub(r'[^a-z]', '', s.lower())


def parse(line):
    """A line of the script: the caption's words, the spoken text, and for each caption word the
    range of spoken words it stands for."""
    shown, spoken, groups = [], [], []
    for m in re.finditer(r'\[([^|\]]+)\|([^\]]+)\]|([^\[]+)', line):
        if m.group(3) is not None:
            for w in m.group(3).split():
                # punctuation after a pair ("[MR|M R].") joins the word before it, in the caption
                # and in the voice's text: a space before it makes a voice say something there
                if re.fullmatch(r'[.,;:!?]+', w) and spoken:
                    shown[-1] += w
                    spoken[-1] += w
                    continue
                groups.append((len(shown), len(spoken), len(spoken) + 1))
                shown.append(w)
                spoken.append(w)
        else:
            a, b = m.group(1).split(), m.group(2).split()
            # a word stuck to the pair ("MR," or "scallop." after it) joins the pair's last word
            s0 = len(spoken)
            spoken.extend(b)
            for i, w in enumerate(a):
                # one caption word to one spoken word when the counts match, else the whole group
                lo, hi = (s0 + i, s0 + i + 1) if len(a) == len(b) else (s0, s0 + len(b))
                groups.append((len(shown), lo, hi))
                shown.append(w)
    # punctuation in the text after a pair: "[MR|M R]." gives the caption word "MR" then "."
    out_shown, out_groups = [], []
    for (k, lo, hi), w in zip(groups, shown):
        if out_shown and re.fullmatch(r'[.,;:!?]+', w):
            out_shown[-1] += w
            continue
        out_shown.append(w)
        out_groups.append((lo, hi))
    return out_shown, ' '.join(spoken), out_groups


def times(spoken, wh, dur):
    """Start and end (s) of each spoken word: Whisper's words matched letter by letter."""
    sw = spoken.split()
    A, owner = '', []
    for i, w in enumerate(sw):
        n = norm(w)
        A += n
        owner += [i] * len(n)
    B, tB = '', []
    for w in wh:
        n = norm(w['word'])
        for j in range(len(n)):
            B += n[j]
            tB.append(w['start'] + (w['end'] - w['start']) * (j + 0.5) / len(n))
    hits = [[] for _ in sw]
    for blk in difflib.SequenceMatcher(None, A, B, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            hits[owner[blk.a + k]].append(tB[blk.b + k])
    t = [[min(h), max(h)] if h else None for h in hits]
    # a word with no letter matched takes its place between its neighbours
    known = [i for i, x in enumerate(t) if x]
    if not known:
        step = dur / max(1, len(sw))
        return [[i * step, (i + 1) * step] for i in range(len(sw))]
    for i in range(len(sw)):
        if t[i]:
            continue
        p = max([k for k in known if k < i], default=None)
        q = min([k for k in known if k > i], default=None)
        a = t[p][1] if p is not None else 0.0
        b = t[q][0] if q is not None else dur
        n = (q if q is not None else len(sw)) - (p if p is not None else -1)
        f = (i - (p if p is not None else -1)) / n
        t[i] = [a + (b - a) * f, a + (b - a) * min(1.0, f + 1 / n)]
    # in order, and inside the clip
    for i in range(1, len(t)):
        t[i][0] = max(t[i][0], t[i - 1][0] + 0.01)
    for x in t:
        x[0] = min(max(0.0, x[0]), dur)
        x[1] = min(max(x[0] + 0.05, x[1]), dur)
    return t


def eleven(text, S):
    """ElevenLabs speaks text: (samples, 24000, the time of each character as Whisper-style words)."""
    import base64
    import urllib.error
    import urllib.request
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        sys.exit('set ELEVENLABS_API_KEY to use the elevenlabs engine')
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{S['voice']}/with-timestamps?output_format=pcm_24000"
    body = json.dumps({'text': text, 'model_id': S.get('model', 'eleven_multilingual_v2'), 'voice_settings': S.get('settings', {})}).encode()
    req = urllib.request.Request(url, data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'ElevenLabs: HTTP {e.code}: {e.read()[:300]!r}')
    a = np.frombuffer(base64.b64decode(d['audio_base64']), dtype='<i2').astype(np.float32) / 32768
    al = d['alignment']
    chars = [{'word': c, 'start': s0, 'end': s1} for c, s0, s1 in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds'])]
    return a, 24000, chars


def main(path):
    S = json.load(open(path))
    engine = S.get('engine', 'kokoro')
    key = os.path.splitext(os.path.basename(path))[0]
    root = os.path.dirname(os.path.dirname(os.path.abspath(path)))   # video/
    clips = os.path.join(root, 'out', 'vo', key)
    os.makedirs(clips, exist_ok=True)
    tts = asr = None

    def speak(text, name):
        nonlocal tts, asr
        shown, spoken, groups = parse(text)
        # a clip already spoken with the same words, engine, voice and settings is kept, with the
        # times of its letters
        wav, meta = os.path.join(clips, f'{name}.wav'), os.path.join(clips, f'{name}.json')
        want = {'spoken': spoken, 'engine': engine, 'voice': S['voice'], 'speed': S.get('speed', 1.0),
                'model': S.get('model'), 'settings': S.get('settings')}
        old = json.load(open(meta)) if os.path.exists(meta) else None
        if os.path.exists(wav) and old and {k: old.get(k) for k in want} == want and (engine != 'elevenlabs' or old.get('chars')):
            a, sr = sf.read(wav, dtype='float32')
            wh = old.get('chars')
        elif engine == 'elevenlabs':
            a, sr, wh = eleven(spoken, S)
            sf.write(wav, a, sr)
            json.dump({**want, 'chars': wh}, open(meta, 'w'))
        else:
            if tts is None:
                from kokoro_onnx import Kokoro
                tts = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
            a, sr = tts.create(spoken, voice=S['voice'], speed=S.get('speed', 1.0), lang='en-us')
            sf.write(wav, a, sr)
            json.dump(want, open(meta, 'w'))
            wh = None
        dur = len(a) / sr
        if wh is None:
            if asr is None:
                from faster_whisper import WhisperModel
                asr = WhisperModel('base.en', device='cpu', compute_type='int8', download_root=os.path.join(MODELS, 'whisper'))
            # no prompt and no carried text: with the script as a prompt, Whisper repeated it past the clip's end
            segs, _ = asr.transcribe(resample_poly(a, 16000, sr).astype(np.float32), word_timestamps=True, language='en',
                                     beam_size=5, condition_on_previous_text=False, temperature=0.0)
            wh = [{'word': w.word, 'start': w.start, 'end': w.end} for s in segs for w in s.words]
        t = times(spoken, wh, dur)
        words = [[w, round(t[lo][0], 3), round(t[hi - 1][1], 3)] for w, (lo, hi) in zip(shown, groups)]
        heard = ''.join(w['word'] for w in wh) if engine == 'elevenlabs' else ' '.join(w['word'].strip() for w in wh)
        print(f'{name}: {dur:.2f} s | {heard}')
        return {'text': ' '.join(shown), 'dur': round(dur, 3), 'words': words, 'clip': f'{name}.wav'}

    title = speak(S['title'], 'title')
    title['at'] = TITLE_AT
    segments = []
    for g in S['segments']:
        at, lines = LEAD, []
        for i, ln in enumerate(g['lines']):
            L = speak(ln['text'], f"{g['key']}-{i}")
            L['at'] = round(at, 3)
            L['s'] = ln.get('s')
            lines.append(L)
            at += L['dur'] + GAP
        need = lines[-1]['at'] + lines[-1]['dur'] + TAIL
        segments.append({'key': g['key'], 'name': g['name'], 'track': g['track'], 'need': round(need, 3), 'lines': lines})
    out = {'key': key, 'voice': S['voice'], 'speed': S.get('speed', 1.0), 'lead': LEAD, 'gap': GAP, 'tail': TAIL,
           'title': title, 'segments': segments}
    js = os.path.join(root, 'vo', f'{key}.js')
    with open(js, 'w') as f:
        f.write(f'// The voice-over of the {key} video: written by tools/voice/vo.py from video/vo/{key}.json; do not edit.\n')
        f.write('// Each line: where it starts in its step\'s hold (at, s), its length (dur), the caption\'s words with the\n')
        f.write('// time each is spoken (s from the line\'s start), and the step positions it moves between (s).\n')
        f.write('export default ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
    total = title['dur'] + sum(L['dur'] for g in segments for L in g['lines'])
    print(f'wrote {js}: {sum(len(g["lines"]) for g in segments) + 1} lines, {total:.1f} s of speech')


if __name__ == '__main__':
    main(sys.argv[1])
