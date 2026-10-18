"""Shared synthesis engine (instruments and helpers) for the video soundtracks. Everything is
synthesized; no samples.

master() takes the echo's delay time (delay=, default 0.375 s, a dotted eighth at 120 BPM), so a
score at another tempo keeps a dotted-eighth echo."""
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 46.0
N = int(DUR * SR)
rng = np.random.default_rng(46)

L = np.zeros(N)
R = np.zeros(N)
SEND_L = np.zeros(N)  # reverb send
SEND_R = np.zeros(N)
DLY_L = np.zeros(N)   # delay send
DLY_R = np.zeros(N)
MUSIC_L = np.zeros(N)  # bus that gets side-chained
MUSIC_R = np.zeros(N)


def set_duration(d):
    """re-size all buses for a soundtrack of d seconds (call before reset/place)."""
    global DUR, N, L, R, SEND_L, SEND_R, DLY_L, DLY_R, MUSIC_L, MUSIC_R
    DUR = float(d)
    N = int(DUR * SR)
    L, R, SEND_L, SEND_R, DLY_L, DLY_R, MUSIC_L, MUSIC_R = (np.zeros(N) for _ in range(8))


def reset(seed):
    global rng
    rng = np.random.default_rng(seed)
    for a in (L, R, SEND_L, SEND_R, DLY_L, DLY_R, MUSIC_L, MUSIC_R):
        a[:] = 0.0


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def place(sig, t0, pan=0.0, gain=1.0, rev=0.0, dly=0.0, bus="main"):
    """add mono sig at time t0 with equal-power pan (-1..1)."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    s = sig[: max(0, N - i0)] * gain
    if i0 < 0:
        s = s[-i0:]
        i0 = 0
    a = (pan + 1) * np.pi / 4
    gl, gr = np.cos(a), np.sin(a)
    n = len(s)
    if bus == "music":
        MUSIC_L[i0:i0 + n] += s * gl
        MUSIC_R[i0:i0 + n] += s * gr
    else:
        L[i0:i0 + n] += s * gl
        R[i0:i0 + n] += s * gr
    if rev:
        SEND_L[i0:i0 + n] += s * gl * rev
        SEND_R[i0:i0 + n] += s * gr * rev
    if dly:
        DLY_L[i0:i0 + n] += s * gl * dly
        DLY_R[i0:i0 + n] += s * gr * dly


def expdecay(n, tau, attack=0.002):
    t = tt(n)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / tau)


def adsr(n, a, d, s, r, hold):
    t = tt(n)
    env = np.where(t < a, t / a, np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
    rel = np.clip((t - hold) / r, 0, 1)
    env = np.where(t > hold, env * (1 - rel), env)
    return np.clip(env, 0, 1)


def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def bp(x, f1, f2, order=2):
    sos = signal.butter(order, [f1, min(f2, SR * 0.45)], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep_filter(x, kind, f_start, f_end, block=256, order=2, curve="exp"):
    y = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        u = b / max(nb - 1, 1)
        fc = f_start * (f_end / f_start) ** u if curve == "exp" else f_start + (f_end - f_start) * u
        if kind == "band":
            lo, hi = fc / 1.5, min(fc * 1.5, SR * 0.45)
            sos = signal.butter(order, [lo, hi], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(order, min(fc, SR * 0.45), kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = x[b * block:(b + 1) * block]
        out, zi = signal.sosfilt(sos, seg, zi=zi)
        y[b * block:(b + 1) * block] = out
    return y


def saw(freq, n, phase0=0.0):
    """polyBLEP band-limited saw, freq scalar or array."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m1 = ph < dt
    t1 = ph[m1] / dt[m1]
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt[m2]
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(2 * np.pi * (phase0 + np.cumsum(f) / SR))


def noise(n):
    return rng.standard_normal(n)


# ------------------------------------------------------------------ instruments
def heartbeat(big=1.0):
    n = int(0.9 * SR)
    t = tt(n)

    def thump(f0, f1, dur, amp):
        m = int(dur * SR)
        tq = tt(m)
        fr = f1 + (f0 - f1) * np.exp(-tq / 0.035)
        s = sine(fr, m) * expdecay(m, 0.075 * (1 + 0.6 * (big - 1)), 0.004)
        body = lp(noise(m), 220) * expdecay(m, 0.03, 0.002) * 0.9
        return np.tanh(1.6 * (s + body)) * amp

    out = np.zeros(n)
    lub = thump(78, 42, 0.5, 1.0 * big)
    dub = thump(66, 44, 0.45, 0.72 * big)
    out[: len(lub)] += lub
    i = int(0.2 * SR)
    out[i:i + len(dub)] += dub[: n - i]
    if big > 1.0:
        sub = sine(40 + 12 * np.exp(-t / 0.2), n) * expdecay(n, 0.45 * big, 0.005) * 0.55 * (big - 0.6)
        out += sub
    return out


def kick(gain=1.0):
    n = int(0.45 * SR)
    t = tt(n)
    fr = 47 + 85 * np.exp(-t / 0.028)
    body = sine(fr, n) * expdecay(n, 0.19, 0.0015)
    click = hp(noise(n), 2500) * expdecay(n, 0.004, 0.0005) * 0.25
    return np.tanh(1.3 * (body + click)) * gain


def hat(tau=0.028, gain=1.0):
    n = int(0.25 * SR)
    x = hp(noise(n), 7000, 4) * expdecay(n, tau, 0.0008)
    return x * gain


def clap(gain=1.0):
    n = int(0.6 * SR)
    x = np.zeros(n)
    for k, off in enumerate((0.0, 0.011, 0.022)):
        i = int(off * SR)
        m = int(0.012 * SR)
        x[i:i + m] += noise(m) * (0.8 + 0.1 * k)
    i = int(0.03 * SR)
    x[i:] += noise(n - i) * expdecay(n - i, 0.11, 0.002) * 0.7
    return bp(x, 900, 2600) * gain


def pluck(midi, dur=0.28, gain=1.0):
    n = int(dur * SR) + int(0.05 * SR)
    f = mtof(midi)
    x = 0.6 * saw(f, n) + 0.4 * saw(f * 1.004, n, 0.37)
    # decaying low-pass envelope approximated with two filtered layers
    bright = lp(x, 5200) * expdecay(n, 0.045, 0.002)
    dark = lp(x, 1100) * expdecay(n, 0.16, 0.002)
    return (bright * 0.7 + dark) * gain


def pad_note(midi, dur, gain=1.0, cutoff=1800, att=0.35, rel=0.9):
    n = int((dur + rel) * SR)
    f = mtof(midi)
    x = np.zeros(n)
    for k, dc in enumerate((-13, -6, 0, 6, 13)):
        x += saw(f * 2 ** (dc / 1200), n, rng.random())
    x /= 5
    x = lp(x, cutoff, 2)
    env = adsr(n, att, 0.6, 0.75, rel, dur)
    return x * env * gain


def sub_note(midi, dur, gain=1.0):
    n = int((dur + 0.08) * SR)
    f = mtof(midi)
    x = sine(f, n) + 0.22 * sine(2 * f, n) + 0.06 * np.tanh(3 * sine(f, n))
    env = adsr(n, 0.008, 0.1, 0.9, 0.07, dur)
    return x * env * gain


def whoosh(dur=0.5, f0=400, f1=4000, gain=1.0):
    n = int(dur * SR)
    x = sweep_filter(noise(n), "band", f0, f1)
    t = tt(n) / dur
    env = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.6
    return x * env * gain


def riser(dur=1.6, gain=1.0):
    n = int(dur * SR)
    t = tt(n) / dur
    nz = sweep_filter(noise(n), "high", 300, 7000) * (t ** 2.2)
    tone = sine(180 * 2 ** (2.2 * t), n) * (t ** 3) * 0.25
    return (nz * 0.8 + tone) * gain


def impact(gain=1.0, tail=0.7):
    n = int(2.0 * SR)
    t = tt(n)
    boom = sine(34 + 40 * np.exp(-t / 0.09), n) * expdecay(n, tail, 0.002)
    crack = lp(noise(n), 3500) * expdecay(n, 0.09, 0.001) * 0.55
    air = hp(noise(n), 5000) * expdecay(n, 0.35, 0.004) * 0.12
    return np.tanh(1.2 * (boom + crack + air)) * gain


def tick(freq=3200, gain=1.0):
    n = int(0.05 * SR)
    x = bp(noise(n), freq / 1.4, freq * 1.4) * expdecay(n, 0.006, 0.0004)
    return x * gain


def blip(freq=1400, dur=0.07, gain=1.0):
    n = int(dur * SR) + int(0.02 * SR)
    t = tt(n)
    x = sine(freq * (1 - 0.08 * t / dur), n) * expdecay(n, dur / 3, 0.002)
    return x * gain


def chime(freq, gain=1.0, dur=1.2):
    n = int(dur * SR)
    t = tt(n)
    idx = 2.2 * np.exp(-t / 0.25)
    mod = np.sin(2 * np.pi * freq * 3.5 * t)
    x = np.sin(2 * np.pi * freq * t + idx * mod) * expdecay(n, 0.42, 0.002)
    x += 0.3 * np.sin(2 * np.pi * freq * 2 * t) * expdecay(n, 0.2, 0.002)
    return x * gain


def stab(midis, gain=1.0, dur=1.6):
    n = int(dur * SR)
    x = np.zeros(n)
    for m in midis:
        f = mtof(m)
        x += saw(f, n, rng.random()) + saw(f * 1.006, n, rng.random())
    x = sweep_filter(x / (2 * len(midis)), "low", 2600, 380)
    return x * expdecay(n, 0.55, 0.004) * gain


def drone(dur, midi, gain=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(midi)
    x = sine(f, n) * 0.7 + lp(saw(f, n), 240) * 0.5 + lp(noise(n), 120) * 0.25
    env = np.clip(t / 1.2, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    return x * env * gain



def master(out_path, kicks, bed=(14.0, 40.0), duck_extra=(), delay=0.375):
    """side-chain the music bus to kicks, add delay and reverb, glue and write 16-bit wav."""
    global L, R
    duck = np.ones(N)
    for tk in list(kicks) + list(duck_extra):
        i0 = int(tk * SR)
        m = int(0.4 * SR)
        if i0 >= N:
            continue
        e = 1 - 0.55 * np.exp(-tt(m) / 0.11)
        seg = duck[i0:i0 + m]
        duck[i0:i0 + m] = np.minimum(seg, e[: len(seg)])
    Lm = L + MUSIC_L * duck
    Rm = R + MUSIC_R * duck
    sl = SEND_L + MUSIC_L * duck * 0.25
    sr = SEND_R + MUSIC_R * duck * 0.25
    d = int(delay * SR)
    fb = 0.38
    dl = np.zeros(N)
    dr = np.zeros(N)
    for k in range(1, 7):
        g = fb ** (k - 1)
        sh = d * k
        if sh >= N:
            break
        src = (DLY_L[:N - sh] + DLY_R[:N - sh]) * 0.5 * g
        if k % 2 == 1:
            dr[sh:] += src
        else:
            dl[sh:] += src
    Lm = Lm + lp(dl, 4500) * 0.8
    Rm = Rm + lp(dr, 4500) * 0.8
    ir_n = int(2.6 * SR)
    ti = tt(ir_n)
    ir_env = np.exp(-ti / 0.62) * np.clip(ti / 0.012, 0, 1)
    pre = np.zeros(int(0.02 * SR))
    ir_l = np.concatenate([pre, lp(noise(ir_n), 6000) * ir_env])
    ir_r = np.concatenate([pre, lp(noise(ir_n), 6000) * ir_env])
    ir_l /= np.sqrt(np.sum(ir_l ** 2))
    ir_r /= np.sqrt(np.sum(ir_r ** 2))
    Lm = Lm + hp(signal.fftconvolve(sl, ir_l)[:N], 180) * 0.9
    Rm = Rm + hp(signal.fftconvolve(sr, ir_r)[:N], 180) * 0.9
    Lm = hp(Lm, 28)
    Rm = hp(Rm, 28)
    mix = np.stack([Lm, Rm], 1)
    rms = np.sqrt(np.mean(mix[int(bed[0] * SR):int(bed[1] * SR)] ** 2))
    mix *= 0.16 / rms
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    fade_out = np.clip((DUR - tt(N)) / 0.6, 0, 1)
    fade_in = np.clip(tt(N) / 0.01, 0, 1)
    mix *= (fade_out * fade_in)[:, None]
    peak = np.max(np.abs(mix))
    mix *= 10 ** (-1.0 / 20) / peak
    wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
    print("wrote", out_path, "peak", round(float(peak), 3))
