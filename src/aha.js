// The 17 AHA segments of the LV (Lang 2015) and the coronary territories (Javadi 2010), shared by
// Regional wall motion and the disease hearts (gl/phenomesh.js).
export const TERRITORY = { lad: [1, 2, 7, 8, 13, 14, 17], rca: [3, 4, 9, 10, 15], lcx: [5, 6, 11, 12, 16] };

/** The segment at level h (0 apex .. 1 mitral annulus) and angle th (deg; 90 anterior, 180 septal). */
export function segmentOf(h, th) {
  if (h < 0.06) return 17;
  const a = ((th % 360) + 360) % 360;
  if (h < 0.36) return [13, 14, 15, 16][(Math.round((a - 90) / 90) % 4 + 4) % 4];
  const i = (Math.round((a - 90) / 60) % 6 + 6) % 6;
  return h < 0.66 ? 7 + i : 1 + i;
}

/**
 * The turn (deg) that puts the model's own apical planes on the standard walls: the four-chamber
 * septal wall at 210 degrees (inferoseptal), the two-chamber at 270 (inferior), the
 * three-chamber at 330 (inferolateral). A: the anatomy frame; geoms: the a4c, a2c and a3c planes.
 */
export function apicalTurn(A, geoms) {
  const ax = A.axis, la = A.lateral, an = A.anterior;
  const flat = (v) => v.clone().addScaledVector(ax, -v.dot(ax)).normalize();
  const angle = (v) => (Math.atan2(v.dot(an), v.dot(la)) * 180) / Math.PI;
  let sx = 0, sy = 0;
  [['a4c', 210], ['a2c', 270], ['a3c', 330]].forEach(([k, std]) => {
    const g = geoms[k];
    if (!g) return;
    const d = ((std - angle(flat(g.r.clone().negate()))) * Math.PI) / 180;
    sx += Math.cos(d); sy += Math.sin(d);
  });
  return (Math.atan2(sy, sx) * 180) / Math.PI;
}
