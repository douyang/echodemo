// One heartbeat at 70 per minute (RR 857 ms), time from the R wave.
// Pressures (mmHg), LV volume (mL), mitral and LVOT Doppler velocities (m/s), valve state,
// and the drive for the heart mesh. Typical adult values for teaching, not patient data.

export const RR = 857;
// Valve events. Intervals are the healthy-adult means of Alhakak 2025 (Copenhagen City Heart
// Study): isovolumic contraction 40 ms, ejection 292 ms, isovolumic relaxation 96 ms.
export const EV = {
  mvc: 25,    // mitral closure, S1
  avo: 65,    // aortic opening
  avc: 357,   // aortic closure, S2
  mvo: 453,   // mitral opening
  eEnd: 700,  // end of early filling
  aOn: 780,   // atrial contraction starts
};
export const EDV = 120, ESV = 50;

// monotone cubic (Fritsch-Carlson) through keyframes [[t, y], ...]
function mono(keys) {
  const n = keys.length;
  const x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], u = (t - x[i]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  };
}

const LV = mono([[0, 9.5], [25, 11], [45, 38], [65, 80], [105, 106], [185, 122], [275, 114], [357, 98], [385, 58], [415, 24], [440, 13.5], [453, 11.5], [480, 5], [520, 3.5], [600, 4.5], [700, 5.5], [780, 6.5], [820, 8.5], [857, 9.5]]);
const LA = mono([[0, 10], [25, 9.5], [45, 9.8], [80, 6.5], [150, 4.5], [250, 7], [350, 10], [440, 13], [453, 12.6], [500, 7.5], [540, 5.8], [650, 5.8], [760, 6.5], [815, 11.5], [857, 10]]);
const NOTCH = 379;   // end of the dicrotic notch
const AOS = mono([[65, 80], [105, 104], [185, 119], [275, 114], [357, 100], [365, 93], [NOTCH, 97]]);
// Early filling brings about 80% of the filling volume and the atrium the rest (Mitchell 2014).
const VOL = mono([[0, 120], [25, 120], [65, 120], [110, 98], [185, 74], [275, 56], [357, 50], [453, 50], [520, 82], [600, 98], [700, 104], [780, 106], [820, 114], [857, 120]]);
const AO_DIA = 97, AO_MIN = 80;
const K = Math.log(AO_DIA / AO_MIN) / (RR + EV.avo - NOTCH);

function aorta(t) {
  if (t >= EV.avo && t <= NOTCH) return AOS(t);
  const since = t > NOTCH ? t - NOTCH : t + RR - NOTCH;
  return AO_DIA * Math.exp(-K * since);
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => smooth((t - a) / (b - a));

/** Mitral inflow velocity (m/s): E then A. e and a scale the peaks (default 0.8 and 0.55). */
export function mitralV(t, e = 0.8, a = 0.55, dt = 180) {
  const eUp = 70, ePk = EV.mvo + eUp, eEnd = ePk + dt;
  let v = 0;
  if (t >= EV.mvo && t < ePk) v = e * Math.sin(((t - EV.mvo) / eUp) * Math.PI / 2);
  else if (t >= ePk && t < eEnd) v = e * (1 - (t - ePk) / dt);
  const aOn = EV.aOn, aPk = 815, aEnd = RR + 10;
  const tt = t < 20 ? t + RR : t;
  if (tt >= aOn && tt < aPk) v = Math.max(v, a * Math.sin(((tt - aOn) / (aPk - aOn)) * Math.PI / 2));
  else if (tt >= aPk && tt < aEnd) v = Math.max(v, a * (1 - (tt - aPk) / (aEnd - aPk)));
  return v;
}

/** LVOT velocity (m/s) over ejection; peak 1.1 m/s, rounded and early peaking. */
export function lvotV(t, peak = 1.1) {
  if (t < EV.avo || t > EV.avc) return 0;
  const u = (t - EV.avo) / (EV.avc - EV.avo);
  const k = 0.3;   // time of peak as a fraction of ejection
  return peak * (u < k ? Math.sin((u / k) * Math.PI / 2) : Math.cos(((u - k) / (1 - k)) * Math.PI / 2) ** 0.8);
}

function phaseName(t) {
  if (t >= EV.mvc && t < EV.avo) return 'Isovolumic contraction';
  if (t >= EV.avo && t < 200) return 'Rapid ejection';
  if (t >= 200 && t < EV.avc) return 'Reduced ejection';
  if (t >= EV.avc && t < EV.mvo) return 'Isovolumic relaxation';
  if (t >= EV.mvo && t < EV.eEnd) return 'Rapid filling';
  if (t >= EV.eEnd && t < EV.aOn) return 'Diastasis';
  return 'Atrial contraction';
}

/** Everything at time t (ms from the R wave, wraps). */
export function cycleAt(tms) {
  const t = ((tms % RR) + RR) % RR;
  const lv = LV(t), la = LA(t), ao = aorta(t), vol = VOL(t);
  // valve drives: mv, tv closure 0 open .. 1 shut; av, pv opening 0 shut .. 1 open
  const inflow = (tt) => {
    tt = ((tt % RR) + RR) % RR;
    if (tt < 5) return 0.55 + 0.45 * seg(tt, -15, 5);
    if (tt < EV.mvo) return 1;
    if (tt < EV.mvo + 22) return 1 - seg(tt, EV.mvo, EV.mvo + 22);
    if (tt < EV.aOn) return 0.45 * seg(tt, 540, 690);
    if (tt < 810) return 0.45 - 0.35 * seg(tt, EV.aOn, 800);
    return 0.1 + 0.45 * seg(tt, 830, RR + 5);
  };
  const outflow = (t0, t1) => seg(t, t0, t0 + 12) * (1 - 0.15 * seg(t, 160, t1 - 20)) * (1 - seg(t, t1 - 12, t1 + 4));
  const drive = { mv: inflow(t), tv: inflow(t - 6), av: outflow(EV.avo, EV.avc), pv: outflow(EV.avo - 5, EV.avc + 12) };
  const s = 1 - (vol - ESV) / (EDV - ESV);
  return {
    t, lv, la, ao, vol, s, drive, v: drive.av, phase: t / RR,
    mitral: mitralV(t), lvot: lvotV(t),
    name: phaseName(t),
    mvOpen: t >= EV.mvo || t < EV.mvc,
    avOpen: t >= EV.avo && t < EV.avc,
  };
}
