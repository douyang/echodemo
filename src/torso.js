// The patient's torso, laid round the heart model, in world cm (echo.js BODY: x to the patient's
// left, y to the head, z to the front). The body key draws it (gl/bodykey.js), and the free probe
// of Views slides over its skin (freeprobe.js).

/**
 * The torso's cross-sections, neck to thighs (cm): height from the jugular notch, half-breadth,
 * and the skin's front and back on the midline, from the front of the chest at the heart.
 * Adult male proportions: chest 33 cm across and 26 cm deep, shoulders 48 cm, hips 35 cm.
 */
export const RINGS = [
  [13, 5.2, -8.0, -17.0], [9, 5.5, -6.5, -17.5], [5, 5.9, -5.6, -18.0], [4.2, 7.3, -5.3, -18.6],
  [3.0, 10.5, -5.0, -19.6], [1.8, 14.5, -4.8, -20.6], [0.6, 17.8, -4.5, -21.6], [-1, 19.6, -4.1, -22.5],
  [-4, 20.0, -3.0, -23.5], [-8, 17.8, -1.8, -24.8], [-12, 16.9, -0.6, -25.6], [-15, 16.7, 0, -26.0],
  [-19, 16.2, -0.2, -25.9], [-24, 15.5, -1.3, -25.3], [-30, 15.0, -1.8, -24.0], [-35, 14.8, -1.7, -23.2],
  [-42, 15.6, -1.6, -23.6], [-50, 17.3, -2.6, -25.8], [-58, 16.8, -3.6, -25.5], [-62, 15.5, -4.5, -24.5],
];
// the cross-section is |x / half-breadth|^SIDE_N + |z / half-depth|^FRONT_N (BACK_N behind) = 1:
// the chest is rounder in front than behind, and squarer at the sides
export const FRONT_N = 2.2, BACK_N = 2.8, SIDE_N = 2.4;

/** Catmull-Rom through the rows of a table, n steps per span. */
export function spline(rows, steps) {
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
    const n = steps(p1, p2);
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(rows[rows.length - 1].slice());
  return out;
}

/** A point [x, z] of a torso cross-section r at angle t (0: the patient's left, pi/2: the front). */
export function section(r, t) {
  const [, a, zf, zb] = r, c = Math.cos(t), s = Math.sin(t);
  const zc = (zf + zb) / 2, h = (zf - zb) / 2, n = s >= 0 ? FRONT_N : BACK_N;
  return [a * Math.sign(c) * Math.abs(c) ** (2 / SIDE_N), zc + h * Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/**
 * Where the torso lies round the heart (myo: the myocardium mesh; anat: the model's landmarks):
 * the midline 8.5 cm to the right of the apex, the jugular notch 12 cm above the aortic valve, the
 * skin 2.4 cm in front of the heart. xm, yN, zF: the world x of the midline, y of the notch, and z
 * from which the rings' front and back count.
 */
export function placeTorso(myo, anat) {
  const pos = myo.geometry.attributes.position;
  let front = -Infinity;
  for (let i = 0; i < pos.count; i++) front = Math.max(front, pos.getZ(i));
  return { xm: anat.point('apex_epi', 0, 0).x - 8.5, yN: anat.point('av', 0, 0).y + 12, zF: front + 2.4 };
}

// the rings at every DY cm of height, top to bottom, from the spline the body key draws
const DY = 0.1;
const DENSE = (() => {
  const fine = spline(RINGS, () => 80), top = RINGS[0][0], out = [];
  let j = 0;
  for (let i = 0; top - i * DY >= RINGS[RINGS.length - 1][0] - 1e-9; i++) {
    const y = top - i * DY;
    while (j < fine.length - 2 && fine[j + 1][0] > y) j++;
    const a = fine[j], b = fine[j + 1], t = Math.min(1, Math.max(0, (a[0] - y) / (a[0] - b[0] || 1)));
    out.push(a.map((v, k) => v + (b[k] - v) * t));
  }
  return out;
})();

/**
 * The skin as a surface: f(p) < 0 inside the torso, 0 on the skin, > 0 outside; its outward
 * normal; and a point moved onto it. at: placeTorso's result.
 */
export class Skin {
  constructor(at) {
    this.xm = at.xm;
    this.yN = at.yN;
    this.zF = at.zF;
  }

  /**
   * The cross-section at world height y: [height, half-breadth, front, back], cubic between the
   * dense rings so that the skin's normal turns smoothly as the probe slides (between straight
   * lines it turned in steps, and a long slide jittered by up to 1 mm).
   */
  ring(y) {
    const n = DENSE.length, u = Math.min(n - 1.000001, Math.max(0, (RINGS[0][0] - (y - this.yN)) / DY));
    const i = Math.floor(u), t = u - i, t2 = t * t, t3 = t2 * t;
    const p0 = DENSE[Math.max(0, i - 1)], p1 = DENSE[i], p2 = DENSE[i + 1], p3 = DENSE[Math.min(n - 1, i + 2)];
    return p1.map((v, k) => 0.5 * (2 * v + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * v + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * v - 3 * p2[k] + p3[k]) * t3));
  }

  f(x, y, z) {
    const [, a, zf, zb] = this.ring(y);
    const v = (z - this.zF - (zf + zb) / 2) / ((zf - zb) / 2);
    return Math.abs((x - this.xm) / a) ** SIDE_N + Math.abs(v) ** (v >= 0 ? FRONT_N : BACK_N) - 1;
  }

  /** The gradient of f at p, [x, y, z] (central differences). */
  grad(p) {
    const e = 0.01;
    return [
      (this.f(p.x + e, p.y, p.z) - this.f(p.x - e, p.y, p.z)) / (2 * e),
      (this.f(p.x, p.y + e, p.z) - this.f(p.x, p.y - e, p.z)) / (2 * e),
      (this.f(p.x, p.y, p.z + e) - this.f(p.x, p.y, p.z - e)) / (2 * e),
    ];
  }

  /** The skin's outward unit normal at p (a point on or near the skin), into out. */
  normal(p, out) {
    const [gx, gy, gz] = this.grad(p), l = Math.hypot(gx, gy, gz) || 1;
    return out.set(gx / l, gy / l, gz / l);
  }

  /** p moved onto the skin along the normal (Newton steps on f), in place. */
  onSkin(p) {
    for (let i = 0; i < 8; i++) {
      const F = this.f(p.x, p.y, p.z);
      if (Math.abs(F) < 1e-9) break;
      const [gx, gy, gz] = this.grad(p), g2 = gx * gx + gy * gy + gz * gz || 1;
      p.set(p.x - (F * gx) / g2, p.y - (F * gy) / g2, p.z - (F * gz) / g2);
    }
    return p;
  }
}
