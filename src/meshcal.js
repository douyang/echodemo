// Sizes of the heart mesh against the weights of the chapters' disease targets (phenomesh.js
// DISEASE), measured on the mesh for each heart the header can show. A chapter sets a weight
// from the size it prints, so the echo view shows that size.
//
// The left atrium (dx_la): the ratio of its volume at end-systole, where the LA volume index is
// measured, to its volume at weight 0, against the weight. The volume ratio is the ratio of the
// spread of the LA wall's vertices (the root of the determinant of their covariance, which a
// uniform scale changes as the volume). It gives the amyloid heart's own LA as 2.312 times the
// normal one; the model's own measurement is 115.16 ÷ 49.78 = 2.313. Each heart's LA volume
// index at weight 0 is the normal mesh's 49.78 mL ÷ 1.97 m² times its own ratio.
const LA_W = [-0.3, -0.2, -0.1, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6];
const LA_RATIO = {
  normal: [0.486, 0.628, 0.798, 1, 1.114, 1.237, 1.37, 1.513, 1.667, 1.831, 2.006, 2.193, 2.604, 3.066],
  amyloid: [0.572, 0.696, 0.838, 1, 1.089, 1.183, 1.282, 1.388, 1.499, 1.616, 1.74, 1.87, 2.15, 2.458],
  icm: [0.527, 0.661, 0.818, 1, 1.101, 1.21, 1.326, 1.449, 1.58, 1.72, 1.868, 2.025, 2.367, 2.746],
  barlow: [0.597, 0.715, 0.849, 1, 1.083, 1.17, 1.262, 1.36, 1.463, 1.571, 1.684, 1.804, 2.06, 2.341],
  bav: [0.508, 0.645, 0.808, 1, 1.107, 1.223, 1.346, 1.479, 1.62, 1.771, 1.931, 2.102, 2.474, 2.891],
};
/** Each heart's LA volume index at weight 0 (mL/m²). */
export const LA_BASE = { normal: 25.3, amyloid: 58.4, icm: 37.4, barlow: 67.9, bav: 31.4 };

/** The dx_la weight that shows LA volume index lavi (mL/m²) on heart key; held to the measured range. */
export function laWeight(lavi, heart = 'normal') {
  const R = LA_RATIO[heart] || LA_RATIO.normal, r = lavi / (LA_BASE[heart] || LA_BASE.normal);
  if (r <= R[0]) return LA_W[0];
  for (let i = 1; i < R.length; i++) if (r <= R[i]) return LA_W[i - 1] + ((LA_W[i] - LA_W[i - 1]) * (r - R[i - 1])) / (R[i] - R[i - 1]);
  return LA_W[LA_W.length - 1];
}
