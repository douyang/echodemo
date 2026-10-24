"""The TAVR procedure video: the Blender shots (anim.py), the site's TEE views (a capture of the TAVR
chapter on this video's clock, and the TEE chapter's video) and the frame of the chapter videos
(video/video.css, video/chapter.js), composed frame by frame and piped to ffmpeg (H.264, BT.709,
as tools/render-video.mjs).

    python compose.py --out video/out/tavr-procedure.mp4 [--audio video/out/tavr-procedure/score.wav]
    python compose.py --stills 2,10,40.5 --out /tmp/stills      PNG stills at those times (s)
    python compose.py --timeline timeline.json                  the score's timeline (score.py)

The TEE views take the card in most of the video: the valve's position, its depth as the balloon
fills, the check for paravalvular leaks and the check for a pericardial effusion. The severity
of the stenosis and the valve's gradients stand in small panels beside them.

Sources (defaults under the work folder video/out/tavr-procedure; each has its option): --frames
(Blender, f%05d.jpg at 30 fps of this video's Blender clock: anim.py), --frames1 (the first cut's
frames: its 45-61 s give the 3-D view of the position and the deployment; anim.py at commit
293afc7 with cut1-caps.patch), --tavr chapter-tavr.mp4 (the TAVR chapter captured on this
video's clock: capture.py), --tee video/out/chapter-tee.mp4, --fonts fonts/ (the site's faces as
TTF, converted from video/fonts on the first run).
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
WORK = os.path.join(REPO, 'video', 'out', 'tavr-procedure')
W, H, FPS = 1920, 1080, 30


def hexc(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, k):
    """a over b at k (CSS color-mix(a k, b))."""
    return tuple(round(x * k + y * (1 - k)) for x, y in zip(a, b))


# the site's dark palette (src/styles.css) on the frame; its light paper in the panes
GROUND, INK, INK2, INK3 = hexc('#1a1f23'), hexc('#e4e7e3'), hexc('#b1bcc1'), hexc('#88969d')
RULE, ACCENT, PAPER = hexc('#4a5760'), hexc('#86b4e0'), hexc('#e2e4e3')
TRACK, EDGE = mix(RULE, GROUND, 0.7), mix(RULE, PAPER, 0.55)
# ink on the paper (the light theme's ink and ink-3)
PINK, PINK2, PINK3 = hexc('#1d2328'), hexc('#4a555c'), hexc('#6f7c85')
# the scope's palette (src/scope.js SC): the monitor in the deployment
SC_BG, SC_FRAME, SC_TEXT, SC_DIM, SC_ECG = hexc('#101315'), hexc('#3a4247'), hexc('#c7cdd0'), hexc('#8d979c'), hexc('#7fd08a')
SC_ART, SC_CAL = (232, 112, 95), hexc('#f2d48a')

# frame layout (video/chapter.js LAY): the figure pane, the progress line, the caption, the cards
CARD = (48, 100, 1824, 728)
TRK = (64, 30, 1792, 46)
CAP = (68, 852, 1784, 200)
TITLE = (128, 330)
ECG_BOX = (128, 1792, 760, 170)       # x0, x1, top, height

# ---------------------------------------------------------------- the timeline (video frames)
# The title card is four beats at 70 a minute (video/chapter.js): 103 frames. A Blender frame b
# shows at video frame b + 103, so the Blender clock (anim.py) is the video clock less 3.43 s.
OFF = 103
END0 = 1813                            # the end card (60.43 s)
TOTAL = 1933                           # 64.43 s
BEAT = 60 / 70
DISSOLVE = 0.6                         # the cards (video/timeline.js)
XF = 12                                # a cut between shots: a 0.4-s dissolve on the cut
V1 = 19.0                              # the first cut's clock in the position and the deployment: this one's + 19 s

WINDOWS = [('Access', 103, 343), ('Wires', 343, 493), ('TEE', 493, 613), ('Baseline', 613, 763),
           ('Delivery', 763, 883), ('Position', 883, 1093), ('Inflation', 1093, 1363), ('Check', 1363, 1573),
           ('Effusion', 1573, 1723), ('Closure', 1723, 1813)]

# shots: video frames [f0, f1); 'blender' (its frame is the video frame less OFF, held at its ends),
# 'tee' (the TEE chapter's video from time t0), and the layouts of the TAVR chapter's capture from
# time t0 (baseline, position, inflation, check) and of the TEE chapter's video (effusion).
# cont: no dissolve into this shot (the camera runs on)
SHOTS = [
    dict(f0=0, f1=145, kind='blender', label='Arterial route'),
    dict(f0=145, f1=343, kind='blender', label='Right femoral artery', cont=True),
    dict(f0=343, f1=403, kind='blender', label='Pacing lead'),
    dict(f0=403, f1=493, kind='blender', label='Aortic root and LV, cut away'),
    dict(f0=493, f1=613, kind='tee', t0=19.3),
    dict(f0=613, f1=763, kind='baseline', t0=0.5),
    dict(f0=763, f1=799, kind='blender', label='Right femoral artery'),
    dict(f0=799, f1=835, kind='blender', label='Descending aorta'),
    dict(f0=835, f1=883, kind='blender', label='Aortic arch'),
    dict(f0=883, f1=1093, kind='position', t0=6.6),
    dict(f0=1093, f1=1363, kind='inflation', t0=16 * BEAT),
    dict(f0=1363, f1=1573, kind='check', t0=22.9),
    dict(f0=1573, f1=1723, kind='effusion', t0=65.4),
    dict(f0=1723, f1=TOTAL, kind='blender', label='Right femoral artery'),
]
EYE = 'B3 · TAVR'
ACC = 'Hadidi OF, Nguyen TC. ACC TAVR Handbook, ch. 10, 2018'
IFU = 'SAPIEN 3 instructions for use, FDA P140031/S085'
CAPTIONS = [
    (103, 'Femoral access',
     'A needle enters the common femoral artery below the inguinal ligament, over the femoral head. '
     'Two preclosure sutures go in first, then a 14F sheath.', ACC),
    (343, 'Pacing lead and wire',
     'A pacing lead goes to the right ventricle. A stiff wire crosses the valve and curls in the LV apex.', ACC),
    (493, 'TEE guidance',
     'The probe lies behind the left atrium. At 120–140°, the long axis shows the LVOT, the valve and the root.',
     'Hahn RT, et al. J Am Soc Echocardiogr 2013 (ASE/SCA)'),
    (613, 'Baseline',
     'In systole, the annulus measures 24 mm from hinge point to hinge point. Severe stenosis: 4.4 m/s, mean '
     'gradient 47 mmHg.', 'Hahn RT, et al. J Am Soc Echocardiogr 2022 · Baumgartner H, et al. J Am Soc Echocardiogr 2017'),
    (763, 'Valve delivery',
     'The crimped valve passes the sheath, is aligned on its balloon in the descending aorta and crosses the arch.', IFU),
    (883, 'Position',
     'On the long axis, TEE places the crimped valve across the annulus: its ventricular end 9 mm below the '
     'hinge points, for a final 80/20 to 90/10.',
     'Hahn RT, et al. JACC Cardiovasc Imaging 2015 · Blackman D, et al. Cardiol Ther 2021'),
    (1093, 'Inflation',
     'Rapid pacing drops the systolic pressure below 50 mmHg. As the balloon fills, the frame shortens from its '
     'ventricular end: the depth goes from 9 to 2 mm.',
     IFU + ' · Schymik G, et al. J Interv Cardiol 2015'),
    (1363, 'Check',
     'A circular frame and no paravalvular jet. A mean gradient of 10 mmHg, a peak velocity of 2.2 m/s and a DVI '
     'of 0.46: the intended performance.',
     'Généreux P, et al. Eur Heart J 2021 (VARC-3) · Zoghbi WA, et al. J Am Soc Echocardiogr 2024'),
    (1573, 'No effusion',
     'A new pericardial effusion would suggest annular rupture; a new wall-motion abnormality, coronary '
     'obstruction. The transgastric short axis shows neither.',
     'Hahn RT, et al. JACC Cardiovasc Imaging 2015 · Agricola E, et al. Eur Heart J Cardiovasc Imaging 2023'),
    (1723, 'Closure',
     'The sheath comes out; the preplaced sutures close the artery.', ACC),
]
CARD_EYE, CARD_TITLE = 'B3 · Procedure', 'TAVR'
CARD_SUB = 'A balloon-expandable valve, from the groin to the annulus, with the TEE views that guide it.'

# the monitor in the deployment (the first cut's Blender clock, s): anim.py there
PACE_ON, PACE_OFF = 52.0, 61.0
BAL_FILL, BAL_FULL, BAL_EMPTY, BAL_DONE = 53.5, 56.5, 59.5, 61.0

# the TAVR chapter's capture (VIDEOS.tavr in the capture tree, s): the slider holds 0.4805 from
# 13.71, moves to 0.6395 over 15.21-18.21 (the balloon fills) and holds to 22.71
CAP_FILL0, CAP_FILL1, CAP_T0, CAP_T1 = 15.214, 18.214, 0.4805, 0.6395
# its panes (rows, columns of the 1920 x 1080 frame)
CAP_LAX = (197, 591, 68, 869)
CAP_SAX = (197, 442, 896, 1849)
CAP_CW = (455, 651, 896, 1849)


# ---------------------------------------------------------------- easing (video/chapter.js)
def clamp01(x):
    return min(1.0, max(0.0, x))


def ease(x):
    x = clamp01(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out(x):
    return 1 - (1 - clamp01(x)) ** 3


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def depth_at(ct):
    """The implant depth (mm) the TAVR chapter shows at capture time ct: gl/tavrmesh.js inflowAt
    with the slider's expansion (src/ch/tavr.js expandAt), 9 mm crimped to 2 mm expanded."""
    T = CAP_T0 + (CAP_T1 - CAP_T0) * clamp01((ct - CAP_FILL0) / (CAP_FILL1 - CAP_FILL0))
    u = smooth((T - 0.48) / 0.16)
    return 10 * (0.9 - 0.7 * smooth(u))


# ---------------------------------------------------------------- type
class Type:
    """The site's faces from TTF (video/fonts converted), shaped by raqm. Newsreader is variable:
    weight 400 and the optical size of the type's size, as a browser sets it (to 72)."""

    def __init__(self, d):
        self.d, self.cache = d, {}
        src = os.path.join(REPO, 'video', 'fonts')
        if os.path.isdir(src):
            from fontTools.ttLib import TTFont
            os.makedirs(d, exist_ok=True)
            for f in os.listdir(src):
                out = os.path.join(d, f[:-6] + '.ttf')
                if f.endswith('.woff2') and not os.path.exists(out):
                    t = TTFont(os.path.join(src, f))
                    t.flavor = None
                    t.save(out)

    def font(self, name, size):
        key = (name, size)
        if key not in self.cache:
            f = ImageFont.truetype(os.path.join(self.d, name + '.ttf'), size, layout_engine=ImageFont.Layout.RAQM)
            if name.startswith('Newsreader'):
                f.set_variation_by_axes([400, min(72, max(6, size))])
            self.cache[key] = f
        return self.cache[key]


def baseline(top, size, lh, asc=1.025, desc=0.275):
    """The baseline of a CSS line box (top, line height lh) for a face of ascent and descent asc,
    desc (em): the half-leading above the ascent. Plex: 1.025/0.275; Newsreader: 0.735/0.265."""
    return top + (lh - (asc + desc) * size) / 2 + asc * size


class Mask:
    """A coverage mask (float 0..1) at a frame position: a block of type or a drawing."""

    def __init__(self, x, y, a):
        self.x, self.y, self.a = x, y, a


def text_mask(segs, pad=12):
    """Type on one baseline. segs: (text, font, tracking px, color); returns [(Mask, color)] with
    the baseline at y = pad of each mask. Tracked type is set glyph by glyph at its shaped advance."""
    out, x = [], 0.0
    for text, f, track, color in segs:
        w = f.getlength(text) + track * len(text)
        asc, desc = f.getmetrics()
        img = Image.new('L', (int(w + 2 * pad), asc + desc + 2 * pad), 0)
        d = ImageDraw.Draw(img)
        if track:
            for i, ch in enumerate(text):
                d.text((pad + f.getlength(text[:i]) + track * i, pad + asc), ch, font=f, fill=255, anchor='ls')
        else:
            d.text((pad, pad + asc), text, font=f, fill=255, anchor='ls')
        out.append((Mask(x - pad, -asc - pad, np.asarray(img, np.float32) / 255), color))
        x += w
    return out, x


def wrap(text, f, width):
    """Lines of text within width (greedy; a last line of one word takes one more)."""
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if f.getlength(t) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    if len(lines) > 1 and ' ' not in lines[-1]:
        prev = lines[-2].split()
        lines[-2], lines[-1] = ' '.join(prev[:-1]), prev[-1] + ' ' + lines[-1]
    return lines


class Block:
    """Several masks placed on the frame, drawn together at one opacity and offset."""

    def __init__(self):
        self.parts = []

    def add(self, masks, x, y):
        for m, c in masks:
            self.parts.append((Mask(m.x + x, m.y + y, m.a), c))
        return self

    def draw(self, fr, alpha=1.0, dy=0.0, clip=None, color=None):
        """color: one colour for every part, in place of their own."""
        if alpha <= 0.002:
            return
        for m, c in self.parts:
            blit(fr, m, color or c, alpha, round(dy), clip)


def blit(fr, m, color, alpha=1.0, dy=0, clip=None):
    """Colour through mask m onto the image fr (float RGB, any size), at opacity alpha, moved down
    dy px. clip: (x0, x1) columns to keep."""
    Hf, Wf = fr.shape[:2]
    x0, y0 = int(round(m.x)), int(round(m.y)) + dy
    a = m.a
    h, w = a.shape
    X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(Wf, x0 + w), min(Hf, y0 + h)
    if clip:
        X0, X1 = max(X0, clip[0]), min(X1, clip[1])
    if X1 <= X0 or Y1 <= Y0:
        return
    k = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None] * alpha
    reg = fr[Y0:Y1, X0:X1]
    reg += (np.asarray(color, np.float32) - reg) * k


def fill(fr, x, y, w, h, color, alpha=1.0):
    reg = fr[y:y + h, x:x + w]
    reg += (np.asarray(color, np.float32) - reg) * alpha


def round_rect(w, h, r, ss=4):
    """An antialiased rounded-rectangle mask."""
    img = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(img).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), r * ss, fill=255)
    return np.asarray(img.reduce(ss), np.float32) / 255


def polyline(w, h, pts, width, ss=4):
    """An antialiased polyline mask (w x h); pts in px."""
    img = Image.new('L', (w * ss, h * ss), 0)
    d = ImageDraw.Draw(img)
    p = [(x * ss, y * ss) for x, y in pts]
    if len(p) > 1:
        d.line(p, fill=255, width=max(1, round(width * ss)), joint='curve')
    return np.asarray(img.reduce(ss), np.float32) / 255


def disc(r, ss=4):
    d = int(round(2 * r))
    return round_rect(d, d, d / 2, ss)


def paste(img, src, x, y, w, h):
    """src (uint8 or float RGB) resized to w x h into img at (x, y)."""
    im = Image.fromarray(np.asarray(src, np.uint8)) if src.dtype != np.uint8 else Image.fromarray(src)
    img[y:y + h, x:x + w] = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32)


# ---------------------------------------------------------------- the heartbeat (src/scope.js ecg())
def ecg_shape(ph):
    g = lambda m, s: np.exp(-(((ph - m) / s) ** 2))
    w = lambda p: g(p, 0.008)
    return 0.12 * g(0.87, 0.025) - 0.1 * g(0.985, 0.006) + w(0.0) + w(1.0) - 0.22 * g(0.018, 0.007) + 0.24 * g(0.33, 0.055)


def card_trace(offset):
    """The cards' trace: four beats from x0 to x1 (ECG_BOX), as the chapter videos draw it."""
    x0, x1, top, h = ECG_BOX
    k = 1.8
    y0, amp = h * 0.66, h * 0.52
    xs = np.arange(x0 / k, x1 / k + 1e-6, 1.2)
    ph = ((xs - x0 / k) / ((x1 - x0) / k) * 4 + offset) % 1
    ys = y0 / k - ecg_shape(ph) * amp / k
    pts = list(zip(xs * k - x0 + 4, ys * k))
    a = polyline(int(x1 - x0 + 8), int(h), pts, 1.1 * k) * 0.9
    return Mask(x0 - 4, top, a)


# ---------------------------------------------------------------- the monitor (deployment)
RR = 60 / 70
R0 = 51.62                                 # an R wave of the sinus rhythm before the pacing


def art_template():
    """The arterial pulse over one beat from the R wave: rise, peak, notch, diastolic run-off."""
    ph = np.array([0.0, 0.08, 0.12, 0.17, 0.23, 0.31, 0.39, 0.42, 0.45, 0.50, 0.70, 0.90, 1.0])
    v = np.array([0.06, 0.0, 0.05, 0.80, 1.0, 0.88, 0.62, 0.52, 0.58, 0.55, 0.32, 0.14, 0.06])
    u = np.linspace(0, 1, 1000, endpoint=False)
    f = np.interp(u, ph, v)
    k = np.exp(-0.5 * (np.arange(-40, 41) / 12) ** 2)
    k /= k.sum()
    f = np.convolve(np.r_[f[-40:], f, f[:40]], k, 'same')[40:-40]
    return lambda p: f[(np.asarray(p) % 1 * 1000).astype(int) % 1000]


ART = art_template()


def signals(t):
    """ECG (R wave = 1) and arterial pressure (mmHg) at Blender times t (array, the first cut's
    clock): sinus rhythm at 70 a minute, ventricular pacing at 180 a minute (PACE_ON to PACE_OFF),
    then sinus rhythm again."""
    t = np.asarray(t, float)
    ecg = np.zeros_like(t)
    p = np.zeros_like(t)
    pre = t < PACE_ON
    ph = ((t - R0) / RR) % 1
    ecg[pre] = ecg_shape(ph[pre])
    sinus = 68 + 56 * ART(ph)
    # pacing: a wide paced complex every 1/3 s; the pressure falls to about 42 mmHg with a pulse
    # pressure of about 7 (SBP < 50, pulse pressure < 10: ACC TAVR Handbook ch. 10)
    pace = (t >= PACE_ON) & (t < PACE_OFF)
    php = ((t - PACE_ON) * 3.0) % 1
    g = lambda x, m, s: np.exp(-(((x - m) / s) ** 2))
    ecg[pace] = (0.75 * g(php, 0.13, 0.07) - 0.35 * g(php, 0.30, 0.06) - 0.22 * g(php, 0.62, 0.12))[pace]
    d = np.maximum(0, t - PACE_ON)
    mean = 42 + 43 * np.exp(-d / 0.35)
    amp = 7 + 49 * np.exp(-d / 0.25)
    paced = mean + amp * (0.5 * np.sin(2 * np.pi * (php - 0.25)))
    w = np.clip((t - PACE_ON) / 0.3, 0, 1)
    w = w * w * (3 - 2 * w)
    p = np.where(pre, sinus, (1 - w) * sinus + w * paced)
    # after the pacing: sinus rhythm from 0.2 s later, the pressure back over about 2 s
    post = t >= PACE_OFF
    R1 = PACE_OFF + 0.2
    ph1 = ((t - R1) / RR) % 1
    ecg[post] = np.where(t[post] >= R1, ecg_shape(ph1[post]), 0.0)
    rec = np.exp(-np.maximum(0, t - PACE_OFF) / 0.8)
    s1, d1 = 116 - 70 * rec, 64 - 22 * rec
    after = np.where(t >= R1, d1 + (s1 - d1) * ART(ph1), 42 + 0 * t)
    w2 = np.clip((t - PACE_OFF) / 0.25, 0, 1)
    p = np.where(post, (1 - w2) * paced + w2 * after, p)
    return ecg, p


def spikes(t0, t1):
    """The pacing spikes between Blender times t0 and t1."""
    k0 = max(0, int(np.ceil((t0 - PACE_ON) * 3)))
    out = []
    k = k0
    while True:
        s = PACE_ON + k / 3
        if s >= min(t1, PACE_OFF):
            break
        out.append(s)
        k += 1
    return out


class Monitor:
    """A scope panel: ECG and arterial pressure on a 4-s sweep, their rate and pressure, and the
    state of the pacing and the balloon. Its clock is the first cut's Blender clock."""
    YE, AE = 80, 30              # the ECG's baseline and R wave (px in the panel)
    YP0, YP1 = 160, 100          # the pressure's 0 and 140 mmHg
    TW = 4.0                     # sweep (s)
    T0 = 47.0                    # the sweep's clock origin (Blender s)

    def __init__(self, ty, x, y, wd, ht=176):
        self.ty, self.X, self.Y, self.WD, self.HT = ty, x, y, wd, ht
        self.TX0, self.TX1 = 140, wd - 40      # the traces' columns in the panel
        self.panel = round_rect(wd, ht, 10)
        self.cycles = {}
        f13 = ty.font('IBMPlexSans-500', 13)
        self.lab = {k: text_mask([(k, f13, 13 * 0.16, SC_DIM)])[0] for k in ('ECG', 'ART')}

    def cycle(self, c):
        """Masks of the ECG and pressure traces over sweep c."""
        if c not in self.cycles:
            w = self.TX1 - self.TX0
            ta = self.T0 + c * self.TW
            xs = np.arange(0, w + 0.01, 0.5)
            t = ta + xs / w * self.TW
            e, p = signals(t)
            ye = self.YE - e * self.AE
            yp = self.YP0 - np.clip(p, 0, 140) / 140 * (self.YP0 - self.YP1)
            sp = []
            for s in spikes(ta, ta + self.TW):
                x = (s - ta) / self.TW * w
                sp.append([(x, self.YE), (x, self.YE - 1.2 * self.AE)])
            me = polyline(w + 1, self.HT, list(zip(xs, ye)), 1.5)
            for seg in sp:
                me = np.maximum(me, polyline(w + 1, self.HT, seg, 1.1))
            mp = polyline(w + 1, self.HT, list(zip(xs, yp)), 1.6)
            self.cycles[c] = (me, mp)
        return self.cycles[c]

    def readout(self, tb):
        """Rate and pressure as the monitor shows them, updated each quarter second."""
        q = np.floor(tb * 4) / 4
        hr = 180 if PACE_ON <= q < PACE_OFF else 70
        t = np.linspace(q - 1.2, q, 600)
        _, p = signals(t)
        return hr, int(round(p.max())), int(round(p.min()))

    def status(self, tb):
        """The state line, whether the pacing is on, and the seconds the balloon is held full."""
        if tb < PACE_ON:
            return 'Sinus rhythm', False, ''
        if tb < BAL_FILL:
            return 'Rapid pacing', True, ''
        if tb < BAL_FULL:
            return 'Rapid pacing · balloon filling', True, ''
        if tb < BAL_EMPTY:
            return 'Rapid pacing · balloon full', True, '%d s' % min(3, int(np.floor(tb - BAL_FULL)) + 1)
        if tb < BAL_DONE:
            return 'Rapid pacing · balloon emptying', True, ''
        return 'Pacing off · valve in place', False, ''

    def draw(self, fr, tb, alpha):
        if alpha <= 0.002:
            return
        X, Y = self.X, self.Y
        blit(fr, Mask(X, Y, self.panel), SC_BG, 0.92 * alpha)
        edge = self.panel - np.pad(round_rect(self.WD - 2, self.HT - 2, 9), 1)
        blit(fr, Mask(X, Y, np.clip(edge, 0, 1)), SC_FRAME, alpha)
        ty = self.ty
        text, on, held = self.status(tb)
        f13 = ty.font('IBMPlexSans-500', 13)
        segs = [(text.upper(), f13, 13 * 0.16, SC_TEXT if on else SC_DIM)]
        if held:
            segs.append(('  ' + held, ty.font('IBMPlexMono-500', 14), 0, SC_TEXT))
        ms, _ = text_mask(segs)
        x = X + 16
        if on:
            blit(fr, Mask(x, Y + 26 - 10, disc(4.5)), ACCENT, alpha)
            x += 9 + 10
        Block().add(ms, x, Y + 26).draw(fr, alpha)
        hr, sbp, dbp = self.readout(tb)
        mono = ty.font('IBMPlexMono-500', 24)
        small = ty.font('IBMPlexSans-400', 13)
        for k, yl, val, unit, col in (('ECG', 60, f'{hr}', '/min', SC_ECG), ('ART', 118, f'{sbp}/{dbp}', 'mmHg', SC_ART)):
            Block().add(self.lab[k], X + 16, Y + yl).draw(fr, alpha)
            vm, vw = text_mask([(val, mono, 0, col)])
            Block().add(vm, X + 16, Y + yl + 28).draw(fr, alpha)
            um, _ = text_mask([(unit, small, 0, SC_DIM)])
            Block().add(um, X + 16 + vw + 6, Y + yl + 28).draw(fr, alpha)
        y50 = int(round(Y + self.YP0 - 50 / 140 * (self.YP0 - self.YP1)))
        for xd in range(X + self.TX0, X + self.TX1, 8):
            fill(fr, xd, y50, 4, 1, SC_DIM, 0.7 * alpha)
        lm, _ = text_mask([('50', ty.font('IBMPlexMono-500', 11), 0, SC_DIM)])
        Block().add(lm, X + self.TX1 + 8, y50 + 4).draw(fr, alpha)
        w = self.TX1 - self.TX0
        u = (tb - self.T0) / self.TW
        c = int(np.floor(u))
        head = (u - c) * w
        gap = 14
        me, mp = self.cycle(c)
        x0 = X + self.TX0
        blit(fr, Mask(x0, Y, me), SC_ECG, alpha, clip=(x0, x0 + int(head)))
        blit(fr, Mask(x0, Y, mp), SC_ART, alpha, clip=(x0, x0 + int(head)))
        if c > 0 and head + gap < w:
            me1, mp1 = self.cycle(c - 1)
            blit(fr, Mask(x0, Y, me1), SC_ECG, alpha, clip=(x0 + int(head + gap), x0 + w + 1))
            blit(fr, Mask(x0, Y, mp1), SC_ART, alpha, clip=(x0 + int(head + gap), x0 + w + 1))


# ---------------------------------------------------------------- sources
class Clip:
    """A site video's frames from time t0, decoded in order by ffmpeg (BT.709 limited range to
    RGB) at its own size (w x h)."""

    def __init__(self, path, t0, size=(W, H)):
        self.path, self.t0, self.size = path, t0, size
        self.p, self.k, self.last = None, None, None

    def frame(self, k):
        if self.last is not None and self.k is not None and k == self.k - 1:
            return self.last                           # a held frame: decoded already
        if self.p is None or k != self.k:
            self.open(k)
        w, h = self.size
        buf = self.p.stdout.read(w * h * 3)
        self.k = k + 1
        if len(buf) == w * h * 3:
            self.last = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        return self.last

    def open(self, k):
        if self.p:
            self.p.kill()
            self.p.wait()
        t = self.t0 + k / FPS
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', f'{t:.4f}', '-i', self.path, '-vf',
                                   'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-'],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def close(self):
        if self.p:
            self.p.kill()
            self.p.wait()
            self.p = None


class Blender:
    """The Blender frames of a folder, scaled to a size; a frame not rendered yet takes the nearest
    earlier draft frame (an animatic), if a draft folder is given."""

    def __init__(self, d, draft=None):
        self.d, self.draft, self.cache = d, draft, {}

    def frame(self, b, size):
        key = (b, size)
        if key in self.cache:
            return self.cache[key]
        p = os.path.join(self.d, 'f%05d.jpg' % b)
        if not os.path.exists(p) and self.draft:
            for k in range(b, b - 12, -1):
                q = os.path.join(self.draft, 'f%05d.jpg' % k)
                if os.path.exists(q):
                    p = q
                    break
        if not os.path.exists(p):
            im = np.full((size[1], size[0], 3), 40, np.float32)
        else:
            im = np.asarray(Image.open(p).convert('RGB').resize(size, Image.LANCZOS), np.float32)
        if len(self.cache) > 8:
            self.cache.clear()
        self.cache[key] = im
        return im


# ---------------------------------------------------------------- the composer
class Composer:
    # the TEE layouts (card px): the long axis large at the left, a column of small panels at the right
    BIG = (24, 24, 1180, 579)
    COL = (1228, 572)

    def __init__(self, a):
        self.ty = Type(a.fonts)
        self.bl = Blender(a.frames, a.draft)
        self.bl1 = Blender(a.frames1)
        self.clips = {}
        self.a = a
        self.card_mask = round_rect(CARD[2], CARD[3], 18)
        inner = np.pad(round_rect(CARD[2] - 2, CARD[3] - 2, 17), 1)
        self.card_edge = np.clip(self.card_mask - inner, 0, 1)
        self.build_track()
        self.build_captions()
        self.build_cards()
        self.labels = {}
        self.static = {}
        self.mon = Monitor(self.ty, CARD[0] + self.COL[0], CARD[1] + 506, self.COL[1])

    # -- static type
    def build_track(self):
        f = self.ty.font('IBMPlexSans-500', 13)
        n = len(WINDOWS)
        self.seg_w = (TRK[2] - 14 * (n - 1)) / n
        self.trk = []
        for j, (name, f0, f1) in enumerate(WINDOWS):
            x = TRK[0] + j * (self.seg_w + 14)
            dim = Block().add(text_mask([(name.upper(), f, 13 * 0.16, INK3)])[0], x, 57)
            cur = Block().add(text_mask([(name.upper(), f, 13 * 0.16, INK)])[0], x, 57)
            self.trk.append((x, f0, f1, dim, cur))
        self.trk_line = round_rect(int(round(self.seg_w)), 3, 1.5)

    def build_captions(self):
        ty = self.ty
        fe, fn, ft, fs = ty.font('IBMPlexSans-500', 14), ty.font('IBMPlexSans-600', 46), ty.font('IBMPlexSans-400', 25), ty.font('IBMPlexSans-400', 15)
        x, y = CAP[0], CAP[1]
        self.caps = []
        dot = round_rect(9, 9, 4.5)
        for f0, name, text, src in CAPTIONS:
            eye = Block()
            eye.parts.append((Mask(x + 1, 854, dot), ACCENT))
            eye.add(text_mask([(EYE.upper(), fe, 14 * 0.18, INK3)])[0], x + 21, round(baseline(y, 14, 14)))
            nm = Block().add(text_mask([(name, fn, -0.012 * 46, INK)])[0], x, round(baseline(y + 30, 46, 50.6)))
            tx = Block()
            top = y + 30 + 50.6 + 16
            lines = wrap(text, ft, CAP[2])
            assert len(lines) <= 2, (name, lines)
            for i, line in enumerate(lines):
                tx.add(text_mask([(line, ft, 0, INK2)])[0], x, round(baseline(top + 33 * i, 25, 33)))
            sr = Block().add(text_mask([('Source: ' + src, fs, 0, INK3)])[0], x, 1046)
            self.caps.append((f0, eye, nm, tx, sr))

    def build_cards(self):
        ty = self.ty
        tx, tyy = TITLE
        fe = ty.font('IBMPlexSans-500', 20)
        num, part = CARD_EYE.split(' · ')
        segs = [(num.upper() + ' ', fe, 20 * 0.2, INK3), ('·', fe, 20 * 0.2, ACCENT), (' ' + part.upper(), fe, 20 * 0.2, INK3)]
        self.c_eye = Block().add(text_mask(segs)[0], tx + 6, round(baseline(tyy - 54, 20, 20)))
        ft = ty.font('Newsreader-normal', 156)
        self.c_title = Block().add(text_mask([(CARD_TITLE, ft, -0.028 * 156, INK)])[0], tx, round(baseline(tyy, 156, 156 * 0.95, 0.735, 0.265)))
        fsub = ty.font('Newsreader-italic', 40)
        self.c_sub = Block().add(text_mask([(CARD_SUB, fsub, 0, INK2)])[0], tx + 4, round(baseline(tyy + 232, 40, 50, 0.735, 0.265)))
        fe1, fe2 = ty.font('Newsreader-normal', 124), ty.font('Newsreader-italic', 124)
        tr = -0.024 * 124
        segs = [('The Heart by ', fe1, tr, INK), ('Ultrasound', fe2, tr, ACCENT)]
        ms, wd = text_mask(segs)
        self.c_end = Block().add(ms, round((W - wd) / 2), round(baseline(H / 2 - 66, 124, 124, 0.735, 0.265)))
        self.trace_title = card_trace(25 / 857)
        u = (END0 / FPS) / BEAT
        self.trace_end = card_trace((((u - np.floor(u)) * 857 + 25) % 857) / 857)

    def label(self, text):
        """The shot's name and its halo: the type grown 2 px and blurred 4 px."""
        if text not in self.labels:
            f = self.ty.font('IBMPlexSans-500', 13)
            ms = text_mask([(text.upper(), f, 13 * 0.2, INK3)])[0]
            halo = []
            for m, c in ms:
                im = Image.fromarray((m.a * 255).astype(np.uint8))
                a = np.asarray(im.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4)), np.float32) / 255
                halo.append((Mask(m.x, m.y, a / max(float(a.max()), 1e-6)), c))
            x, y = CARD[0] + 22, round(baseline(CARD[1] + 19, 13, 13))
            self.labels[text] = Block().add(ms, x, y), Block().add(halo, x, y)
        return self.labels[text]

    # -- small panels on the paper (card px)
    def tag(self, text, size=13, color=PINK3, track=0.16, face='IBMPlexSans-500'):
        f = self.ty.font(face, size)
        return text_mask([(text.upper() if face.startswith('IBMPlexSans-5') else text, f, size * track, color)])

    def values(self, rows, w):
        """A small table of values on the paper: label at the left, value and unit at the right."""
        key = ('values', tuple(rows), w)
        if key not in self.static:
            h = 34 * len(rows) + 8
            img = np.empty((h, w, 3), np.float32)
            img[:] = PAPER
            lab = self.ty.font('IBMPlexSans-400', 19)
            mono = self.ty.font('IBMPlexMono-500', 20)
            unit = self.ty.font('IBMPlexSans-400', 15)
            for i, (k, v, u, flag) in enumerate(rows):
                y = 26 + 34 * i
                Block().add(text_mask([(k, lab, 0, PINK2)])[0], 0, y).draw(img)
                um, uw = text_mask([(u, unit, 0, PINK3)])
                vm, vw = text_mask([(v, mono, 0, hexc('#b03a2e') if flag else PINK)])
                Block().add(um, w - uw, y).draw(img)
                Block().add(vm, w - uw - 8 - vw, y).draw(img)
                if i:
                    fill(img, 0, y - 24, w, 1, EDGE, 0.8)
            self.static[key] = img
        return self.static[key]

    def head(self, img, x, y, text):
        """A small panel's name, in the site's label style on the paper."""
        Block().add(self.tag(text)[0], x, y).draw(img)

    # -- the card's content
    def clip(self, kind, t0):
        key = (kind, t0)
        if key not in self.clips:
            if kind == 'tee':
                self.clips[key] = Clip(self.a.tee, t0)
            else:
                self.clips[key] = Clip(self.a.tavr, t0)
        return self.clips[key]

    def cap(self, s, k, box):
        """A pane of the TAVR capture (rows, columns) at shot frame k."""
        src = self.clip('tavr', s['t0']).frame(k)
        r0, r1, c0, c1 = box
        return src[r0:r1, c0:c1]

    def lax_big(self, img, s, k):
        x, y, w, h = self.BIG
        paste(img, self.cap(s, k, CAP_LAX), x, y, w, h)

    def model_inset(self, img, s, i, y=24, h=458):
        """The first cut's 3-D view of the aortic root (its split frames), small at the right."""
        x, w = self.COL
        b = int(round((min(max(i, s['f0']), s['f1'] - 1) - OFF + V1 * FPS)))
        img[y:y + h, x:x + w] = self.bl1.frame(b, (w, h))
        Block().add(self.tag('3-D · aortic root, cut away', 12, INK2)[0], x + 14, y + 24).draw(img)

    def shot_content(self, s, i):
        """The card's content (CARD w x h, float RGB) of shot s at video frame i, and its label."""
        cw, ch = CARD[2], CARD[3]
        k = min(max(i, s['f0']), s['f1'] - 1) - s['f0']        # held at the shot's ends
        kind = s['kind']
        if kind == 'blender':
            b = max(0, min(i, s['f1'] - 1) - OFF) if s['f0'] == 0 else min(max(i, s['f0']), s['f1'] - 1) - OFF
            return self.bl.frame(b, (cw, ch)), s.get('label')
        img = np.empty((ch, cw, 3), np.float32)
        img[:] = PAPER
        if kind in ('tee', 'effusion'):
            src = self.clip('tee', s['t0']).frame(k).astype(np.float32)
            img[:] = src[100:828, 48:1872]
            if kind == 'effusion':
                self.effusion_tags(img)
            return img, None
        x, cwid = self.COL
        if kind == 'baseline':
            self.lax_big(img, s, k)
            # the short axis: three calcified cusps
            hs = self.sax_small(img, s, k, 24, 'ME AV SAX · 30° · cusps')
            self.facts(img, [('24', 'mm', 'Annulus in systole, hinge point to hinge point'),
                             ('26', 'mm', 'SAPIEN 3 for a TEE annulus of 21–25 mm')])
            # severity, small: the first beat of the CW strip, then the values
            self.head(img, x, 24 + hs + 32, 'Severity')
            hc = self.cw_small(img, s, k, 24 + hs + 46)
            rows = [('Peak velocity', '4.4', 'm/s', True), ('Mean gradient', '47', 'mmHg', True),
                    ('AVA', '0.75', 'cm²', True)]
            v = self.values(rows, cwid)
            y = 24 + hs + 46 + hc + 4
            img[y:y + v.shape[0], x:x + cwid] = v
            return img, None
        if kind == 'position':
            self.lax_big(img, s, k)
            self.model_inset(img, s, i)
            self.depth_track(img, None)
            self.head(img, x, 516, 'Depth below the annulus')
            v = self.values([('Crimped, now', '9', 'mm', False), ('Final target', '2–4', 'mm', False),
                             ('Aortic/ventricular', '80/20–90/10', '', False)], cwid)
            img[532:532 + v.shape[0], x:x + cwid] = v
            return img, None
        if kind == 'inflation':
            self.lax_big(img, s, k)
            self.model_inset(img, s, i, h=458)
            self.depth_track(img, s['t0'] + k / FPS)
            return img, None
        if kind == 'check':
            self.lax_big(img, s, k)
            # the short axis: the frame at its skirt, circular, without a jet round it
            hs = self.sax_small(img, s, k, 24, 'ME AV SAX · 30° · frame at the skirt')
            self.checks(img, ['Cusps open and close', 'Frame circular', 'No paravalvular jet'])
            self.head(img, x, 24 + hs + 32, 'Valve performance')
            hc = self.cw_small(img, s, k, 24 + hs + 46)
            rows = [('Mean gradient', '10', 'mmHg', False), ('DVI', '0.46', '', False),
                    ('Paravalvular leak', 'none', '', False)]
            v = self.values(rows, cwid)
            y = 24 + hs + 46 + hc + 4
            img[y:y + v.shape[0], x:x + cwid] = v
            return img, None
        raise ValueError(kind)

    def sax_small(self, img, s, k, y, title):
        """The short axis's middle (the valve and the root), small at the right, under its own
        title (the crop leaves the pane's out); its height."""
        x, w = self.COL
        sax = self.cap(s, k, (CAP_SAX[0], CAP_SAX[1], CAP_SAX[2] + 165, CAP_SAX[2] + 760))
        h = int(round(w * sax.shape[0] / sax.shape[1]))
        paste(img, sax, x, y, w, h)
        fill(img, x, y, w, 24, hexc('#0e1113'), 1.0)
        Block().add(text_mask([(title.upper(), self.ty.font('IBMPlexMono-500', 13), 0, SC_TEXT)])[0], x + 10, y + 17).draw(img)
        return h

    def strip_box(self):
        """The band under the long axis (card px)."""
        return self.BIG[0], self.BIG[1] + self.BIG[3] + 14, self.BIG[2], 100

    def facts(self, img, items):
        """Values in the band under the long axis: a number, its unit and what it is."""
        x, y, w, h = self.strip_box()
        mono = self.ty.font('IBMPlexMono-500', 40)
        unit = self.ty.font('IBMPlexSans-400', 18)
        lab = self.ty.font('IBMPlexSans-400', 17)
        cx = x
        for v, u, what in items:
            vm, vw = text_mask([(v, mono, 0, PINK)])
            Block().add(vm, cx, y + 54).draw(img)
            um, uw = text_mask([(u, unit, 0, PINK3)])
            Block().add(um, cx + vw + 8, y + 54).draw(img)
            Block().add(text_mask([(what, lab, 0, PINK2)])[0], cx, y + 84).draw(img)
            cx += max(vw + uw + 8, lab.getlength(what)) + 64

    def checks(self, img, items):
        """Checks met, in the band under the long axis: a green dot and the check."""
        x, y, w, h = self.strip_box()
        f = self.ty.font('IBMPlexSans-500', 22)
        cx = x
        for t in items:
            blit(img, Mask(cx, y + 46 - 8, disc(8)), hexc('#3c8c5a'), 1.0)
            Block().add(text_mask([(t, f, 0, PINK)])[0], cx + 26, y + 54).draw(img)
            cx += 26 + f.getlength(t) + 56

    def cw_small(self, img, s, k, y):
        """The CW strip's first beat with its peak and its mean, small at the right; its height."""
        x, w = self.COL
        cw_ = self.cap(s, k, (CAP_CW[0], CAP_CW[1], CAP_CW[2], CAP_CW[2] + 540))
        h = int(round(w * cw_.shape[0] / cw_.shape[1]))
        paste(img, cw_, x, y, w, h)
        return h

    def depth_track(self, img, ct):
        """The implant depth as the balloon fills: its value and its course, under the long axis.
        ct: the capture's time; None before the inflation (the crimped valve at its place)."""
        x, y, w, h = self.strip_box()
        img[y:y + h, x:x + w] = PAPER
        self.head(img, x, y + 18, 'Depth below the annulus')
        t0 = SHOTS[[s['kind'] for s in SHOTS].index('inflation')]['t0']
        ct = t0 if ct is None else ct
        d = depth_at(ct)
        vm, vw = text_mask([(f'{d:.0f}', self.ty.font('IBMPlexMono-500', 40), 0, PINK)])
        Block().add(vm, x, y + 74).draw(img)
        Block().add(text_mask([('mm', self.ty.font('IBMPlexSans-400', 18), 0, PINK3)])[0], x + vw + 8, y + 74).draw(img)
        # the course over the inflation's 9 s: 0 to 10 mm down, the target band 2-4 mm
        gx0, gx1, gy0, gy1 = x + 340, x + w - 10, y + 6, y + h - 8
        X = lambda t: gx0 + (t - t0) / 9.0 * (gx1 - gx0)
        Y = lambda mm: gy0 + mm / 10 * (gy1 - gy0)
        fill(img, int(gx0), int(Y(2)), int(gx1 - gx0), int(Y(4) - Y(2)), hexc('#cfd9d2'), 1.0)
        Block().add(text_mask([('target 2–4 mm', self.ty.font('IBMPlexSans-400', 13), 0, PINK3)])[0],
                    int(gx1) - 96, int(Y(4)) + 16).draw(img)
        fill(img, int(gx0), int(Y(0)), int(gx1 - gx0), 1, PINK3, 0.6)
        Block().add(text_mask([('annulus', self.ty.font('IBMPlexSans-400', 13), 0, PINK3)])[0],
                    int(gx0) - 56, int(Y(0)) + 5).draw(img)
        ts = np.linspace(t0, ct, max(2, int((ct - t0) * 30)))
        pts = [(X(t) - gx0, Y(depth_at(t)) - y) for t in ts]
        m = polyline(int(gx1 - gx0) + 4, h, pts, 2.4)
        blit(img, Mask(int(gx0), y, m), hexc('#2f6f9f'), 1.0)
        blit(img, Mask(int(X(ct)) - 6, int(Y(depth_at(ct))) - 6, disc(6)), hexc('#2f6f9f'), 1.0)

    def effusion_tags(self, img):
        """The checks the transgastric short axis answers, at the top right of its view."""
        if 'eff' not in self.static:
            lines = ['No pericardial effusion', 'LV wall motion normal']
            f = self.ty.font('IBMPlexSans-500', 18)
            w = int(max(f.getlength(t) for t in lines)) + 54
            h = 34 * len(lines) + 18
            panel = np.empty((h, w, 3), np.float32)
            panel[:] = hexc('#f4f5f3')
            m = round_rect(w, h, 10)
            for j, t in enumerate(lines):
                yy = 34 + 34 * j
                blit(panel, Mask(16, yy - 13, disc(6)), hexc('#3c8c5a'), 1.0)
                Block().add(text_mask([(t, f, 0, PINK)])[0], 34, yy).draw(panel)
            self.static['eff'] = (panel, m)
        panel, m = self.static['eff']
        h, w = m.shape
        x, y = 925, 112
        reg = img[y:y + h, x:x + w]
        reg += (panel - reg) * m[:, :, None]

    def content(self, i):
        """The card's content at frame i with the dissolves between shots; the label's opacity."""
        j = next(n for n, s in enumerate(SHOTS) if s['f0'] <= i < s['f1'])
        s = SHOTS[j]
        h = XF / 2
        if j + 1 < len(SHOTS) and i >= s['f1'] - h and not SHOTS[j + 1].get('cont'):
            a, b, k = s, SHOTS[j + 1], (i - (s['f1'] - h)) / XF
        elif j > 0 and i < s['f0'] + h and not s.get('cont'):
            a, b, k = SHOTS[j - 1], s, (i - (s['f0'] - h)) / XF
        else:
            img, lab = self.shot_content(s, i)
            return [(img, lab, 1.0)]
        k = ease(k)
        ia, la = self.shot_content(a, i)
        ib, lb = self.shot_content(b, i)
        return [(ia * (1 - k) + ib * k, None, 1.0), (None, la, 1 - k), (None, lb, k)]

    # -- a frame
    def frame(self, i):
        t = i / FPS
        fr = np.empty((H, W, 3), np.float32)
        fr[:] = GROUND
        a_t, b_t, d = OFF / FPS, END0 / FPS, DISSOLVE / 2
        title_on = 1 - ease((t - (a_t - d)) / DISSOLVE)
        end_on = ease((t - (b_t - d)) / DISSOLVE)
        cover = max(title_on, end_on)
        if cover < 1:
            self.draw_card(fr, i)
            self.draw_caption(fr, i)
            # the monitor in the inflation, on the first cut's clock
            s = next(s for s in SHOTS if s['kind'] == 'inflation')
            if s['f0'] - 6 <= i < s['f1'] + 6:
                al = min(ease_out((i - (s['f0'] - 6)) / 12), 1 - ease((i - (s['f1'] - 6)) / 12))
                self.mon.draw(fr, (i - OFF) / FPS + V1, al)
        if cover > 0:
            fr += (np.asarray(GROUND, np.float32) - fr) * cover
            if title_on > 0:
                self.draw_title(fr, t, title_on)
            if end_on > 0 and title_on <= 0:
                self.draw_end(fr, t, end_on)
        self.draw_track(fr, i, 1 - end_on)
        return fr

    def draw_card(self, fr, i):
        x, y, w, h = CARD
        parts = self.content(i)
        img = parts[0][0]
        m = self.card_mask[:, :, None]
        reg = fr[y:y + h, x:x + w]
        reg += (img - reg) * m
        blit(fr, Mask(x, y, self.card_edge), RULE, 0.55)
        # the shot's name: ink-3 on a dark picture; where the picture under it is mid-grey (the skin
        # of the groin shots), the ink goes to ink-2 on a dark halo
        under = img[12:32, 16:320]
        lum = float((under @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean()) / 255
        k = clamp01((lum - 0.2) / 0.12)
        k = k * k * (3 - 2 * k)
        ink = tuple(a + (b - a) * k for a, b in zip(INK3, INK2))
        for _, lab, al in parts:
            if lab:
                text, halo = self.label(lab)
                halo.draw(fr, al * 0.8 * k, color=GROUND)
                text.draw(fr, al, color=ink)

    def draw_caption(self, fr, i):
        caps = self.caps
        n = max(k for k, c in enumerate(caps) if c[0] <= i) if i >= caps[0][0] else 0
        alpha = ease_out((i - caps[0][0]) / (0.6 * FPS)) if i < caps[0][0] + 0.6 * FPS else 1.0
        if i < caps[0][0]:
            return
        cur = caps[n]
        nxt = caps[n + 1] if n + 1 < len(caps) else None
        if nxt and i >= nxt[0] - 0.3 * FPS:
            o0 = 1 - ease((i - (nxt[0] - 0.3 * FPS)) / (0.3 * FPS))
            self.draw_cap(fr, cur, alpha * o0, 0)
            return
        if n > 0 and i < cur[0] + 0.45 * FPS:
            o1 = ease_out((i - cur[0]) / (0.45 * FPS))
            self.draw_cap(fr, cur, alpha * o1, 1 - o1)
            return
        self.draw_cap(fr, cur, alpha, 0)

    def draw_cap(self, fr, c, alpha, rise):
        _, eye, nm, tx, sr = c
        eye.draw(fr, alpha, 4 * rise)
        nm.draw(fr, alpha, 8 * rise)
        tx.draw(fr, alpha, 5 * rise)
        sr.draw(fr, alpha, 5 * rise)

    def draw_track(self, fr, i, alpha):
        if alpha <= 0.002:
            return
        t0 = WINDOWS[0][1]
        for j, (x, f0, f1, dim, cur) in enumerate(self.trk):
            on = f0 <= i < f1 and i >= t0
            (cur if on else dim).draw(fr, alpha)
            xi = int(round(x))
            blit(fr, Mask(xi, TRK[1] + TRK[3] - 6, self.trk_line), TRACK, alpha)
            f = 0.0 if i < t0 else clamp01((i - f0) / (f1 - f0))
            if f > 0:
                wpx = int(round(self.seg_w * f))
                blit(fr, Mask(xi, TRK[1] + TRK[3] - 6, self.trk_line), ACCENT, alpha * (1 if on else 0.45), clip=(xi, xi + wpx))

    def draw_title(self, fr, t, on):
        k0, k1 = ease_out((t - 0.05) / 0.7), ease_out((t - 0.15) / 0.8)
        k2, k3 = ease_out((t - 0.55) / 0.7), ease_out((t - 0.75) / 0.8)
        self.c_eye.draw(fr, on * k0)
        self.c_title.draw(fr, on * k1, (1 - k1) * 26)
        if k2 > 0:
            w = int(round(132 * k2))
            fill(fr, TITLE[0] + 6, TITLE[1] + 196, w, 2, ACCENT, on)
        self.c_sub.draw(fr, on * k3, (1 - k3) * 18)
        self.draw_trace(fr, self.trace_title, t, 0.0, on)

    def draw_end(self, fr, t, on):
        b = END0 / FPS
        k = ease_out((t - b) / 0.9)
        self.c_end.draw(fr, on * k, (1 - k) * 22)
        self.draw_trace(fr, self.trace_end, t, b, on)

    def draw_trace(self, fr, m, t, t0, on):
        x0, x1 = ECG_BOX[0], ECG_BOX[1]
        head = x0 + (t - t0) / (4 * BEAT) * (x1 - x0)
        if head <= x0:
            return
        blit(fr, m, ACCENT, on, clip=(0, int(min(head, x1 + 2))))


# ---------------------------------------------------------------- output
def timeline():
    """The score's timeline (tools/score/events.mjs form): the length, the tour, the end card and
    the windows."""
    return {
        'id': 'tavr-procedure', 'beat': BEAT, 'duration': TOTAL / FPS, 'frames': TOTAL,
        'tour': {'t0': OFF / FPS, 't1': END0 / FPS},
        'events': [{'type': 'end', 't': END0 / FPS}],
        'windows': [{'win': n, 't0': a / FPS, 't1': b / FPS} for n, a, b in WINDOWS],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out')
    ap.add_argument('--audio')
    ap.add_argument('--stills')
    ap.add_argument('--range', help='a:b in seconds')
    ap.add_argument('--timeline')
    ap.add_argument('--frames', default=os.path.join(WORK, 'frames'))
    ap.add_argument('--frames1', default=os.path.join(WORK, 'frames1'))
    ap.add_argument('--draft', default=None)
    ap.add_argument('--tavr', default=os.path.join(WORK, 'chapter-tavr.mp4'))
    ap.add_argument('--tee', default=os.path.join(REPO, 'video', 'out', 'chapter-tee.mp4'))
    ap.add_argument('--fonts', default=os.path.join(WORK, 'fonts'))
    ap.add_argument('--crf', default='16')
    a = ap.parse_args()
    if a.timeline:
        with open(a.timeline, 'w') as f:
            json.dump(timeline(), f, indent=1)
        print('timeline', a.timeline)
        return
    C = Composer(a)
    if a.stills:
        os.makedirs(a.out, exist_ok=True)
        for s in a.stills.split(','):
            i = min(TOTAL - 1, int(round(float(s) * FPS)))
            fr = C.frame(i)
            p = os.path.join(a.out, 'c%06.2f.png' % (i / FPS))
            Image.fromarray(np.clip(fr + 0.5, 0, 255).astype(np.uint8)).save(p)
            print('still', p)
        return
    f0, f1 = 0, TOTAL
    if a.range:
        r0, r1 = (float(x) for x in a.range.split(':'))
        f0, f1 = int(round(r0 * FPS)), min(TOTAL, int(round(r1 * FPS)))
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-r', str(FPS), '-i', '-']
    if a.audio:
        cmd += ['-ss', f'{f0 / FPS:.4f}', '-i', a.audio]
    cmd += ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium',
            '-crf', a.crf, '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
            '-color_range', 'tv']
    if a.audio:
        cmd += ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-t', f'{(f1 - f0) / FPS:.4f}']
    cmd += ['-movflags', '+faststart', a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    import time
    t0 = time.time()
    for i in range(f0, f1):
        fr = C.frame(i)
        p.stdin.write(np.clip(fr + 0.5, 0, 255).astype(np.uint8).tobytes())
        if (i - f0) % 150 == 0:
            el = time.time() - t0
            print(f'frame {i}/{f1} · {el / max(1, i - f0 + 1):.3f} s/frame', flush=True)
    p.stdin.close()
    p.wait()
    for c in C.clips.values():
        c.close()
    print('wrote', a.out, f'{(f1 - f0) / FPS:.2f} s in {time.time() - t0:.0f} s')
    sys.exit(p.returncode)


if __name__ == '__main__':
    main()
