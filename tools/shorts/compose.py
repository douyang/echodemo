"""Compose a vertical reel (the medical-shorts pipeline): the Blender frames, the echo panes, the
words on screen, the captions, the source line, the voice and the music, encoded to MP4.

  python3 tools/shorts/compose.py plan   video/shorts/tteer/script.yaml
  python3 tools/shorts/compose.py render video/shorts/tteer/script.yaml [--novoice] [--to 12.5]
  python3 tools/shorts/compose.py storyboard video/shorts/tteer/script.yaml

plan: the beats' times from the voice (tools/shorts/voice.py words.json): a beat starts `lead` s
before its line and ends `gap` s after it, or at its `min` length. Writes plan.json, and
panes.json, the clips that tools/shorts/panes.mjs captures from the chapter video.
render: one cut, 1080x1920 at the script's fps: <slug>-voice.mp4 (the voice over the music, which
ducks under it) or <slug>-novoice.mp4 (the music; longer captions), with <cut>.cues.json (the
times of the beats, the words and the captions, and the text boxes) for tools/shorts/qa.py.
--to renders the first seconds only, for a check.
storyboard: out/storyboard.png (each beat's frame, times, words, voice line and claims) and
out/frames3d.png (the Blender frames on one sheet).

Under video/out/shorts/<slug>/: frames3d/ (tools/blender/render.py: <name>.png, and <name>.json,
the landmarks in the frame), audio/ (voice.py; music.wav from tools/shorts/music.py), panes/
(panes.mjs), out/.

Layout (px): the Blender frame 0-1010; the step's words at 266; the captions round 945; the
panes 1012-1472; the source line at 1474-1498. The platform draws over the top 250 and the
bottom 420: no key text there. The last frame repeats the first, so the reel loops.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
W, H = 1080, 1920
SAFE_TOP, SAFE_BOTTOM = 250, 420
R3D_H = 1010
ANCHOR = (540, 600)                 # the point a push zooms about (the subject's middle)
TITLE_Y = 266
CAP_MID = 945
PANE_Y, PANE_S, PANE_X = 1012, 460, (60, 560)
SRC_Y = 1474
XF = 0.35                           # s: the cross-fade between beats
XF_CLOSE = 0.7                      # s: the close's cross-fade back to the first frame
BG0, BG1 = (11, 13, 17), (17, 20, 26)
INK, DIM, ACCENT = (242, 242, 240), (150, 156, 166), (240, 178, 82)


def load(path):
    with open(path) as f:
        return yaml.safe_load(f) if path.endswith(('.yaml', '.yml')) else json.load(f)


def ease(x):
    x = min(1.0, max(0.0, x))
    return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


# ---------------------------------------------------------------- fonts (the site's, video/fonts)
_FONTS = {}


def font(name, size, wght=None):
    """A font of video/fonts at size px; the WOFF2 files go to TTF once (video/out/fonts)."""
    key = (name, size, wght)
    if key in _FONTS:
        return _FONTS[key]
    ttf = os.path.join(ROOT, 'video', 'out', 'fonts', f'{name}.ttf')
    if not os.path.exists(ttf):
        from fontTools.ttLib import TTFont
        os.makedirs(os.path.dirname(ttf), exist_ok=True)
        f = TTFont(os.path.join(ROOT, 'video', 'fonts', f'{name}.woff2'))
        f.flavor = None
        f.save(ttf)
    f = ImageFont.truetype(ttf, size, layout_engine=ImageFont.Layout.RAQM)
    if wght is not None:
        try:
            f.set_variation_by_axes([wght] + [size] * (len(f.get_variation_axes()) - 1))
        except Exception:
            pass
    _FONTS[key] = f
    return f


# ---------------------------------------------------------------- the plan
class Reel:
    def __init__(self, script):
        self.S = load(script)
        self.slug = self.S['slug']
        self.fps = self.S['fps']
        self.out = os.path.join(ROOT, 'video', 'out', 'shorts', self.slug)
        self.words = json.load(open(os.path.join(self.out, 'audio', 'words.json')))

    def plan(self):
        """Each beat's start and end (s, on whole frames), and where its line starts."""
        S, fr = self.S, 1.0 / self.fps
        snap = lambda x: round(x * self.fps) / self.fps
        t, beats = 0.0, []
        for b in S['beats']:
            lead = b.get('lead', 0.12 if not beats else S['lead'])
            gap = b.get('gap', S['gap'])
            vd = self.words[b['id']]['dur'] if b.get('voice') else 0.0
            dur = snap(max(lead + vd + gap, b.get('min', 0.0)))
            beats.append({'id': b['id'], 't0': snap(t), 't1': snap(t + dur), 'voice_at': snap(t + lead), 'voice_dur': vd})
            t += dur
        P = {'duration': snap(t), 'frames': int(round(t * self.fps)), 'beats': beats}
        json.dump(P, open(os.path.join(self.out, 'plan.json'), 'w'), indent=1)
        spec = [{'name': pb['id'], 'step': s['panes']['step'], 'from': 'move', 'dur': round(pb['t1'] - pb['t0'] + 0.2, 3), 'show': s['panes']['show']}
                for s, pb in zip(S['beats'], beats) if 'step' in s.get('panes', {})]
        json.dump({'panes': spec}, open(os.path.join(self.out, 'panes.json'), 'w'), indent=1)
        for b in beats:
            print(f"{b['id']:<8} {b['t0']:6.2f} - {b['t1']:6.2f}  ({b['t1'] - b['t0']:.2f} s)")
        print(f"total {P['duration']:.2f} s, {P['frames']} frames")
        return P


# ---------------------------------------------------------------- the pictures
class Frames3D:
    """The Blender frames: by name, and by the step position s (one frame each 0.1, s000, s040..s660)."""
    def __init__(self, d):
        self.d, self.cache, self.marks = d, {}, {}

    def get(self, name):
        if name not in self.cache:
            im = Image.open(os.path.join(self.d, f'{name}.png')).convert('RGBA')
            assert im.size == (W, R3D_H), (name, im.size)
            self.cache[name] = im
            mp = os.path.join(self.d, f'{name}.json')
            self.marks[name] = json.load(open(mp)) if os.path.exists(mp) else {}
        return self.cache[name]

    @staticmethod
    def pair(s):
        """The two frames round s and the weight of the second."""
        if s >= 6.6 - 1e-6:
            return 's660', 's660', 0.0
        if s <= 1e-6:
            return 's000', 's000', 0.0
        if s < 0.4:
            return 's000', 's040', s / 0.4
        lo = math.floor(s * 10 + 1e-6) / 10
        a = (s - lo) / 0.1
        return f's{round(lo * 100):03d}', f's{round(min(6.6, lo + 0.1) * 100):03d}', a

    def at_s(self, s):
        n0, n1, a = self.pair(s)
        A = self.get(n0)
        if a < 1e-3 or n0 == n1:
            return A
        return Image.blend(A, self.get(n1), a)


def push(im, z):
    """im zoomed by z about ANCHOR (a slow push), the same size."""
    if abs(z - 1) < 1e-4:
        return im
    ax, ay = ANCHOR
    w, h = im.size
    box = (ax - ax / z, ay - ay / z, ax + (w - ax) / z, ay + (h - ay) / z)
    return im.resize((w, h), Image.BICUBIC, box=box)


def background():
    g = np.linspace(0, 1, H)[:, None, None]
    a = np.array(BG0)[None, None, :] * (1 - g) + np.array(BG1)[None, None, :] * g
    return Image.fromarray(np.repeat(a, W, axis=1).astype(np.uint8), 'RGB').convert('RGBA')


def shade():
    """Dark gradients over the Blender frame: at the top under the step's words, and at its foot,
    where the captions sit and the frame meets the panes."""
    a = np.zeros((H, W), np.float32)
    y = np.arange(H, dtype=np.float32)
    a = np.maximum(a, (np.clip((420 - y) / 420, 0, 1) ** 1.5 * 0.78)[:, None])
    a = np.maximum(a, (np.clip((y - 820) / (R3D_H - 820), 0, 1) ** 1.2 * 0.92)[:, None])
    a[R3D_H:] = 0
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = BG0
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def rounded(im, r=14):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], r, fill=255)
    out = im.convert('RGBA')
    out.putalpha(m)
    return out


class Panes:
    """The panes of each beat (panes.mjs): JPEG sequences, at PANE_S px; past the end of a clip
    the hold's last whole heartbeats loop (at 70 a minute, 7 beats = 6.0 s = 180 frames)."""
    def __init__(self, d):
        self.d = d
        self.meta = json.load(open(os.path.join(d, 'panes.json')))
        self.clips = {c['name']: c for c in self.meta['clips']}
        self.cache = {}

    def index(self, name, k):
        """The frame of clip name at frame k of its beat: past the clip's end, the hold's last
        whole heartbeats (RR 857 ms) loop, so the loop has no seam."""
        c = self.clips[name]
        if k < c['n']:
            return k
        beat = 0.857 * self.meta['fps']
        avail = c['n'] - max(0, c['holdFrom'])
        cycles = min(7, int(avail // beat))
        span = max(1, round(cycles * beat)) if cycles else avail
        lo = c['n'] - span
        return lo + (k - lo) % span

    def s_at(self, name, k):
        c = self.clips[name]
        return c['s'][min(k, c['n'] - 1)]

    def get(self, name, pane, k):
        i = self.index(name, k)
        key = (name, pane, i)
        if key not in self.cache:
            if len(self.cache) > 600:
                self.cache.clear()
            im = Image.open(os.path.join(self.d, f'{name}_{pane}', f'{i + 1:04d}.jpg')).convert('RGB')
            self.cache[key] = rounded(im.resize((PANE_S, PANE_S), Image.LANCZOS))
        return self.cache[key]


# ---------------------------------------------------------------- text
def text_size(f, s):
    b = f.getbbox(s)
    return b[2] - b[0], b[3] - b[1], b


def draw_text(img, xy, s, f, fill, anchor='la', stroke=0, stroke_fill=(0, 0, 0, 200)):
    ImageDraw.Draw(img).text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)


def wrap(s, f, width):
    words, lines, cur = s.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if cur and text_size(f, t)[0] > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def layer():
    return Image.new('RGBA', (W, H), (0, 0, 0, 0))


def is_num(w):
    return any(ch.isdigit() for ch in w)


def caption_img(words, size, max_w=960, lines_max=2):
    """A caption: white words with a dark edge, numbers in the accent colour."""
    f = font('IBMPlexSans-600', size)
    text = ' '.join(words)
    lines = wrap(text, f, max_w)[:lines_max]
    lh = int(size * 1.18)
    im = Image.new('RGBA', (W, lh * len(lines) + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for j, ln in enumerate(lines):
        tw = d.textlength(ln, font=f)
        x = (W - tw) / 2
        y = 10 + j * lh
        for w in ln.split(' '):
            col = ACCENT if is_num(w) else INK
            d.text((x, y), w, font=f, fill=col, stroke_width=4, stroke_fill=(5, 6, 8, 230))
            x += d.textlength(w + ' ', font=f)
    return im, len(lines)


LEAD = {'a', 'an', 'the', 'of', 'to', 'into', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'and', 'or', 'but', 'no', 'its', 'their', 'up', 'down', 'under', 'over', 'two', 'one', 'is', 'was'}
# word pairs that a caption keeps together
GLUE = {('right', 'atrium'), ('right', 'ventricle'), ('inferior', 'vena'), ('vena', 'cava'), ('femoral', 'vein'),
        ('tricuspid', 'regurgitation'), ('tricuspid', 'valve'), ('medical', 'therapy'), ('heart', 'failure'),
        ('failure', 'admissions'), ('quality', 'of'), ('of', 'life'), ('one', 'year'), ('30', 'days'), ('two', 'planes'),
        ('25', 'french'), ('87', 'percent'), ('4.8', 'percent'), ('two', 'or'), ('or', 'three'), ('three', 'clips'),
        ('no', 'longer'), ('the', 'grasp'), ('the', 'gradient'), ('the', 'leak'), ('one', 'clip'), ('two', 'leaflets')}


def _bare(w):
    return w.lower().strip(',.;:?!')


def chunks(words, novoice):
    """The caption groups of a line: 1 to 3 words (with the voice), or phrases up to 7 words and
    34 characters (without it). A group ends at a comma or a full stop; inside a clause the
    groups are the cheapest split: a lone word, a group that ends on a word that leads into the
    next one ("the", "into") and a split pair ("right atrium") cost more."""
    max_w, max_c, soft_c = (3, 22, 18) if not novoice else (7, 34, 30)
    # with the voice a caption ends at every comma; without it, only at a full stop, and a
    # group that ends at a comma costs less
    hard = ',.;:?!' if not novoice else '.;:?!'
    clauses, cur = [], []
    for w in words:
        cur.append(w)
        if w[0][-1] in hard:
            clauses.append(cur)
            cur = []
    if cur:
        clauses.append(cur)
    out = []
    for cl in clauses:
        n = len(cl)
        best = [0.0] + [math.inf] * n
        back = [0] * (n + 1)
        for e in range(1, n + 1):
            for k in range(1, max_w + 1):
                b = e - k
                if b < 0:
                    break
                g = cl[b:e]
                chars = len(' '.join(x[0] for x in g))
                if chars > max_c and k > 1:
                    continue
                cost = 1.0 + (2.5 if k == 1 and n > 1 else 0.0) + max(0, chars - soft_c) * 0.5
                if e < n and _bare(g[-1][0]) in LEAD:
                    cost += 4.0
                if e < n and (_bare(cl[e - 1][0]), _bare(cl[e][0])) in GLUE:
                    cost += 5.0
                if novoice and e < n and not g[-1][0].endswith(','):
                    cost += 1.5
                if best[b] + cost < best[e]:
                    best[e], back[e] = best[b] + cost, b
        cuts, e = [], n
        while e > 0:
            cuts.append((back[e], e))
            e = back[e]
        out.extend(cl[b:e] for b, e in reversed(cuts))
    return out


# ---------------------------------------------------------------- the cut
class Cut:
    def __init__(self, reel, novoice):
        self.R, self.novoice = reel, novoice
        self.P = json.load(open(os.path.join(reel.out, 'plan.json')))
        self.beats = {b['id']: b for b in self.P['beats']}
        self.order = [b['id'] for b in self.P['beats']]
        self.spec = {b['id']: b for b in reel.S['beats']}
        self.F3 = Frames3D(os.path.join(reel.out, 'frames3d'))
        self.PN = Panes(os.path.join(reel.out, 'panes'))
        self.bg = background()
        self.shade = shade()
        self.text_boxes = []
        self.captions = self.make_captions()
        self.titles = {}
        self.cards = {}
        self.label_boxes = {}

    # -- captions
    def make_captions(self):
        caps = []
        for bid in self.order:
            b, sp = self.beats[bid], self.spec[bid]
            if not sp.get('voice'):
                continue
            ws = [(w, t0 + b['voice_at'], t1 + b['voice_at']) for w, t0, t1 in self.R.words[bid]['words']]
            groups = chunks(ws, self.novoice)
            for j, g in enumerate(groups):
                t0 = g[0][1]
                nxt = groups[j + 1][0][1] if j + 1 < len(groups) else None
                t1 = nxt if nxt is not None else min(g[-1][2] + 0.35, b['t1'] - 0.05)
                caps.append({'text': ' '.join(x[0] for x in g), 'words': [x[0] for x in g], 't0': t0, 't1': t1, 'beat': bid})
        if self.novoice:
            # each caption stays 0.3 s a word and at least 1.2 s: a short one waits for its time,
            # and the next starts after it
            for j, c in enumerate(caps):
                need = max(1.2, 0.3 * len(c['words']))
                if j:
                    c['t0'] = max(c['t0'], caps[j - 1]['t1'])
                c['t1'] = max(c['t1'], c['t0'] + need)
            # the last caption ends half a second before the loop; one that would end later
            # starts earlier, and the captions before it give up the time they can spare
            limit = self.P['duration'] - 0.5
            for j in range(len(caps) - 1, -1, -1):
                c = caps[j]
                need = max(1.2, 0.3 * len(c['words']))
                if c['t1'] <= limit + 1e-9:
                    break
                c['t1'] = limit
                c['t0'] = min(c['t0'], limit - need)
                limit = c['t0']
        for c in caps:
            c['img'], n = caption_img(c['words'], 64 if not self.novoice else 54, lines_max=1 if not self.novoice else 2)
            hgt = c['img'].size[1]
            c['y'] = int(CAP_MID - hgt / 2)
            self.text_boxes.append({'what': f"caption: {c['text']}", 'y0': c['y'], 'y1': c['y'] + hgt})
        return caps

    # -- the step's words
    def title(self, bid):
        if bid in self.titles:
            return self.titles[bid]
        sp = self.spec[bid]
        im = layer()
        if 'text' in sp.get('panes', {}):
            self.titles[bid] = None
            return None
        f = font('IBMPlexSans-600', 46)
        lines = wrap(sp['onscreen'], f, 900)
        d = ImageDraw.Draw(im)
        k = self.order.index(bid)
        d.rounded_rectangle([60, TITLE_Y + 4, 66, TITLE_Y + 4 + 54 * len(lines) - 10], 3, fill=ACCENT)
        for j, ln in enumerate(lines):
            draw_text(im, (84, TITLE_Y + j * 54), ln, f, INK, stroke=2, stroke_fill=(5, 6, 8, 160))
        self.text_boxes.append({'what': f"title: {sp['onscreen']}", 'y0': TITLE_Y, 'y1': TITLE_Y + 54 * len(lines)})
        self.titles[bid] = im
        return im

    # -- the source line
    def source(self, bid):
        key = ('src', bid)
        if key in self.titles:
            return self.titles[key]
        im = layer()
        f = font('IBMPlexSans-400', 24)
        draw_text(im, (W // 2, SRC_Y + 12), self.spec[bid]['source'], f, DIM, anchor='mm')
        self.text_boxes.append({'what': f"source: {self.spec[bid]['source']}", 'y0': SRC_Y, 'y1': SRC_Y + 24})
        self.titles[key] = im
        return im

    # -- the panes region
    def card(self, kind):
        if kind in self.cards:
            return self.cards[kind]
        im = layer()
        d = ImageDraw.Draw(im)
        if kind == 'hook':
            f = font('Newsreader-normal', 92, wght=500)
            sp = next(b for b in self.R.S['beats'] if b.get('panes', {}).get('text') == 'hook')
            lines = sp['panes'].get('lines') or wrap(sp['onscreen'], f, 960)
            y = 1120
            for j, ln in enumerate(lines):
                draw_text(im, (W // 2, y + j * 104), ln, f, INK, anchor='ma')
            f2 = font('IBMPlexSans-500', 30)
            draw_text(im, (W // 2, y + len(lines) * 104 + 34), 'The Heart by Ultrasound · bonus chapter B8', f2, DIM, anchor='ma')
            self.text_boxes.append({'what': f"hook: {' '.join(lines)}", 'y0': y, 'y1': y + len(lines) * 104 + 70})
        elif kind == 'kccq':
            x0, y0, x1, y1 = 60, PANE_Y, W - 60, PANE_Y + PANE_S
            d.rounded_rectangle([x0, y0, x1, y1], 14, fill=(22, 25, 32, 255), outline=(255, 255, 255, 26), width=2)
            fh, fl, fv, fn = font('IBMPlexSans-600', 38), font('IBMPlexSans-500', 34), font('IBMPlexSans-600', 40), font('IBMPlexSans-400', 27)
            draw_text(im, (x0 + 44, y0 + 40), 'KCCQ score, change at 1 year', fh, INK)
            draw_text(im, (x0 + 44, y0 + 92), 'points; higher is better', fn, DIM)
            rows = [('T-TEER', 12.3, ACCENT), ('Control', 0.6, (120, 128, 140))]
            bx0, bw = x0 + 230, 520
            for j, (lab, v, col) in enumerate(rows):
                yy = y0 + 170 + j * 92
                draw_text(im, (x0 + 44, yy + 6), lab, fl, INK)
                d.rounded_rectangle([bx0, yy, bx0 + max(8, bw * v / 12.3), yy + 52], 8, fill=col)
                draw_text(im, (bx0 + max(8, bw * v / 12.3) + 16, yy + 4), f'+{v:.1f}', fv, col if j == 0 else INK)
            note = 'Death or tricuspid surgery, and heart failure hospitalization: no apparent difference at 1 year.'
            for j, ln in enumerate(wrap(note, fn, x1 - x0 - 88)):
                draw_text(im, (x0 + 44, y0 + 368 + j * 36), ln, fn, DIM)
            self.text_boxes.append({'what': 'card: KCCQ +12.3 vs +0.6', 'y0': y0 + 40, 'y1': y0 + 440})
        self.cards[kind] = im
        return im

    # -- one beat at time t: the Blender layer (W x R3D_H), and the panes layer (full canvas)
    def scene(self, bid, t):
        b, sp = self.beats[bid], self.spec[bid]
        u = t - b['t0']
        dur = b['t1'] - b['t0']
        k = int(round(u * self.R.fps))
        shot = sp['shot']
        marks = None
        if 'chapter' in shot:
            s = self.PN.s_at(bid, k) if bid in self.PN.clips else float(shot['chapter'])
            im3 = self.F3.at_s(s)
            n0, n1, a = Frames3D.pair(s)
            marks = (n0, n1, a)
        else:
            z0, z1 = shot.get('zoom', [1.0, 1.0])
            im3 = push(self.F3.get(shot['frame']), z0 + (z1 - z0) * ease(u / max(dur, 1e-6)))
            marks = (shot['frame'], shot['frame'], 0.0)
        pn = layer()
        pp = sp.get('panes', {})
        if 'step' in pp:
            for x, p in zip(PANE_X, pp['show']):
                pn.alpha_composite(self.PN.get(bid, p, k), (x, PANE_Y))
        elif 'card' in pp:
            pn = self.card(pp['card'])
        elif 'text' in pp:
            pn = self.card(pp['text'])
        return im3, pn, marks

    def labels(self, bid, marks, alpha):
        """Small labels on the Blender frame at its landmarks (render.py writes their places)."""
        sp = self.spec[bid]
        if not sp.get('labels') or alpha <= 0:
            return None
        n0, n1, a = marks
        self.F3.get(n0), self.F3.get(n1)
        m0, m1 = self.F3.marks.get(n0, {}), self.F3.marks.get(n1, {})
        im = layer()
        d = ImageDraw.Draw(im)
        f = font('IBMPlexSans-500', 30)
        for L in sp['labels']:
            p0, p1 = m0.get(L['mark']), m1.get(L['mark'])
            if not p0:
                continue
            p1 = p1 or p0
            x, y = p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a
            dx, dy = L.get('dx', 40), L.get('dy', -40)
            if not (SAFE_TOP + 70 < y + dy < 860 and 40 < x < W - 40):
                continue
            col = (*INK, int(255 * alpha))
            d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(*ACCENT, int(255 * alpha)), outline=(5, 6, 8, int(200 * alpha)), width=2)
            d.line([x, y, x + dx, y + dy], fill=(*INK, int(200 * alpha)), width=2)
            anchor = 'ld' if dx >= 0 else 'rd'
            d.text((x + dx + (6 if dx >= 0 else -6), y + dy + 12), L['text'], font=f, fill=col, anchor=anchor, stroke_width=3, stroke_fill=(5, 6, 8, int(200 * alpha)))
            key = (bid, L['text'])
            y0, y1 = int(y + dy - 24), int(y + dy + 14)
            b0, b1 = self.label_boxes.get(key, (y0, y1))
            self.label_boxes[key] = (min(b0, y0), max(b1, y1))
        return im

    def frame(self, t):
        i = max(j for j, bid in enumerate(self.order) if self.beats[bid]['t0'] <= t + 1e-9)
        bid = self.order[i]
        b = self.beats[bid]
        u = t - b['t0']
        im3, pn, marks = self.scene(bid, t)
        title, src = self.title(bid), self.source(bid)
        xf = XF_CLOSE if bid == self.order[-1] else XF
        if i > 0 and u < xf:
            a = ease(u / xf)
            pid = self.order[i - 1]
            p3, ppn, _ = self.scene(pid, b['t0'] - 1.0 / self.R.fps)
            im3 = Image.blend(p3, im3, a) if p3.size == im3.size else im3
            pn = Image.blend(ppn, pn, a)
            pt, ps = self.title(pid), self.source(pid)
            title = self.mix(pt, title, a)
            src = self.mix(ps, src, a)
        lab = self.labels(bid, marks, min(1.0, u / 0.4, max(0.0, (b['t1'] - t) / 0.3)))
        out = self.bg.copy()
        out.alpha_composite(im3, (0, 0))
        out.alpha_composite(self.shade)
        if lab is not None:
            out.alpha_composite(lab)
        if title is not None:
            out.alpha_composite(title)
        out.alpha_composite(pn)
        if src is not None:
            out.alpha_composite(src)
        for c in self.captions:
            if c['t0'] - 1e-9 <= t < c['t1']:
                a = min(1.0, (t - c['t0']) / 0.08 + 0.35)
                ci = c['img'] if a >= 1 else self.fade(c['img'], a)
                out.alpha_composite(ci, (0, c['y']))
        return out.convert('RGB')

    @staticmethod
    def fade(im, a):
        im = im.copy()
        im.putalpha(im.getchannel('A').point(lambda v: int(v * a)))
        return im

    def mix(self, A, B, a):
        if A is None and B is None:
            return None
        A = A if A is not None else layer()
        B = B if B is not None else layer()
        return Image.blend(A, B, a)

    # -- the sound
    def audio(self, path):
        T = self.P['duration']
        n = int(round(T * 48000))
        music_p = os.path.join(self.R.out, 'audio', 'music.wav')
        mus = read_wav(music_p, n, stereo=True)
        if self.novoice:
            mix = mus
        else:
            v = np.zeros(n)
            for b in self.P['beats']:
                if not self.spec[b['id']].get('voice'):
                    continue
                x = read_wav(os.path.join(self.R.out, 'audio', f"{b['id']}.wav"), None)
                i0 = int(round(b['voice_at'] * 48000))
                v[i0:i0 + len(x)] += x[:max(0, n - i0)]
            lv, lm = lufs_of(v[:, None].repeat(2, 1), self.R.out), lufs_of(mus, self.R.out)
            # the music under the voice by 20 dB; between the lines and the beats it comes up to
            # 11 dB under the voice's level, slowly, so it does not pump
            env = np.abs(v)
            win = int(0.05 * 48000)
            env = np.convolve(env, np.ones(win) / win, mode='same')
            speech = (env > 10 ** (-38 / 20)).astype(np.float64)
            g_on, g_off = 10 ** ((lv - 20 - lm) / 20), 10 ** ((lv - 11 - lm) / 20)
            target = g_off + (g_on - g_off) * speech
            gain = smooth_gain(target, 48000, att=0.08, rel=0.7)
            mix = mus * gain[:, None] + v[:, None] * np.array([[1.0, 1.0]])
        raw = path[:-4] + '.raw.wav'
        write_wav(raw, mix)
        loudnorm(raw, path, -14.0, -2.0)
        os.remove(raw)

    def render(self, path, upto=None):
        T = self.P['duration']
        N = self.P['frames'] if upto is None else int(round(upto * self.R.fps))
        wav = path[:-4] + '.wav'
        self.audio(wav)
        cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(self.R.fps), '-i', '-',
               '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{N / self.R.fps:.4f}', '-movflags', '+faststart', path]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for j in range(N):
            pr.stdin.write(self.frame(j / self.R.fps).tobytes())
            if j % 150 == 0:
                print(f'frame {j}/{N}', flush=True)
        pr.stdin.close()
        pr.wait()
        os.remove(wav)
        # the cues for the QA
        voice = []
        if not self.novoice:
            for b in self.P['beats']:
                if self.spec[b['id']].get('voice'):
                    voice.append({'beat': b['id'], 'words': [[w, round(t0 + b['voice_at'], 3), round(t1 + b['voice_at'], 3)] for w, t0, t1 in self.R.words[b['id']]['words']]})
        for (bid, txt), (y0, y1) in self.label_boxes.items():
            self.text_boxes.append({'what': f'label: {txt} ({bid})', 'y0': y0, 'y1': y1})
        boxes, seen = [], set()
        for e in self.text_boxes:
            if (e['what'], e['y0']) not in seen:
                seen.add((e['what'], e['y0']))
                boxes.append(e)
        cues = {'duration': N / self.R.fps, 'beats': self.P['beats'], 'voice': voice,
                'captions': [{'text': c['text'], 't0': round(c['t0'], 3), 't1': round(c['t1'], 3)} for c in self.captions],
                'text_boxes': boxes}
        json.dump(cues, open(path[:-4] + '.cues.json', 'w'), indent=1)


    def storyboard(self, path):
        """One sheet: each beat's frame at its middle, its times, its words on screen, its voice
        line and its claims."""
        cols, tw, th, pad = 4, 270, 480, 30
        beats = self.P['beats']
        rows_n = math.ceil(len(beats) / cols)
        cellh = th + 270
        sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows_n * cellh + 100), (246, 246, 244))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 30), f"{self.R.slug} reel: storyboard, {self.P['duration']:.1f} s, {len(beats)} beats", font=font('IBMPlexSans-600', 30), fill=(20, 20, 20))
        f1, f2 = font('IBMPlexSans-600', 17), font('IBMPlexSans-400', 15)
        for k, b in enumerate(beats):
            im = self.frame((b['t0'] + b['t1']) / 2).resize((tw, th), Image.LANCZOS)
            x, y = pad + (k % cols) * (tw + pad), 100 + (k // cols) * cellh
            sheet.paste(im, (x, y))
            sp = self.spec[b['id']]
            yy = y + th + 10
            d.text((x, yy), f"{k + 1}. {b['id']}  {b['t0']:.1f} to {b['t1']:.1f} s", font=f1, fill=(20, 20, 20))
            yy += 26
            line = re.sub(r'\[([^|\]]+)\|[^\]]+\]', r'\1', sp.get('voice', ''))
            for label, txt in (('On screen', sp['onscreen']), ('Voice', line), ('Claims', ', '.join(sp.get('claims', [])))):
                for ln in wrap(f'{label}: {txt}', f2, tw):
                    d.text((x, yy), ln, font=f2, fill=(60, 60, 60))
                    yy += 19
                yy += 4
        sheet.save(path)
        return path


def contact(frames_dir, path, per_row=10, tw=216):
    """The Blender frames on one sheet, in step order, each with its name."""
    names = sorted(n[:-4] for n in os.listdir(frames_dir) if n.endswith('.png'))
    names = [n for n in names if n != 'hook'] + (['hook'] if 'hook' in names else [])
    th = round(tw * R3D_H / W)
    rows_n = math.ceil(len(names) / per_row)
    sheet = Image.new('RGB', (per_row * tw, rows_n * (th + 22)), (18, 20, 24))
    d = ImageDraw.Draw(sheet)
    f = font('IBMPlexSans-500', 15)
    for k, n in enumerate(names):
        im = Image.open(os.path.join(frames_dir, f'{n}.png')).convert('RGBA')
        bg = Image.new('RGBA', im.size, (*BG0, 255))
        bg.alpha_composite(im)
        x, y = (k % per_row) * tw, (k // per_row) * (th + 22)
        sheet.paste(bg.convert('RGB').resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x + 6, y + th + 2), n, font=f, fill=INK)
    sheet.save(path)
    return path


# ---------------------------------------------------------------- sound helpers
def read_wav(path, n, stereo=False):
    ch = 2 if stereo else 1
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', '48000', '-f', 'f64le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float64).reshape(-1, ch)
    if not stereo:
        x = x[:, 0]
    if n is not None:
        if len(x) < n:
            x = np.concatenate([x, np.zeros((n - len(x),) + x.shape[1:])])
        x = x[:n]
    return x.copy()


def write_wav(path, x):
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = x[:, None]
    pr = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f64le', '-ar', '48000', '-ac', str(x.shape[1]), '-i', '-', '-c:a', 'pcm_f32le', path],
                        input=x.astype(np.float64).tobytes(), check=True)
    return pr


def lufs_of(x, tmpdir):
    """The integrated loudness (LUFS) of x, through a temporary file in tmpdir."""
    import re
    import tempfile
    fd, p = tempfile.mkstemp(suffix='.wav', dir=tmpdir)
    os.close(fd)
    write_wav(p, x)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', p, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    os.remove(p)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])


def smooth_gain(target, sr, att, rel):
    """A one-pole follower in dB: down fast (att s), up slowly (rel s)."""
    g = 20 * np.log10(np.maximum(target, 1e-6))
    out = np.empty_like(g)
    ka, kr = math.exp(-1 / (att * sr)), math.exp(-1 / (rel * sr))
    y = g[0]
    for i in range(0, len(g), 64):
        x = g[i]
        k = ka if x < y else kr
        y = x + (y - x) * (k ** 64)
        out[i:i + 64] = y
    return 10 ** (out / 20)


def loudnorm(src, dst, I, TP):
    """Two-pass loudnorm to I LUFS, true peak TP, 48 kHz."""
    import re
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', f'loudnorm=I={I}:TP={TP}:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    af = (f"loudnorm=I={I}:TP={TP}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', '-c:a', 'pcm_s16le', dst], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=['plan', 'render', 'storyboard'])
    ap.add_argument('script')
    ap.add_argument('--novoice', action='store_true')
    ap.add_argument('--to', type=float, default=None)
    a = ap.parse_args()
    R = Reel(a.script)
    if a.stage == 'plan':
        R.plan()
        return
    C = Cut(R, a.novoice)
    os.makedirs(os.path.join(R.out, 'out'), exist_ok=True)
    if a.stage == 'storyboard':
        print(C.storyboard(os.path.join(R.out, 'out', 'storyboard.png')))
        print(contact(os.path.join(R.out, 'frames3d'), os.path.join(R.out, 'out', 'frames3d.png')))
        return
    name = f"{R.slug}-{'novoice' if a.novoice else 'voice'}{'-test' if a.to else ''}.mp4"
    path = os.path.join(R.out, 'out', name)
    C.render(path, a.to)
    print(path)


if __name__ == '__main__':
    main()
