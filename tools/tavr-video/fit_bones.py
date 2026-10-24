"""Fit the pelvis and thorax units of the bundle's skeleton into its male body by the soft tissue
over palpable landmarks (typical lean adult depths, cm): ASIS 1.5, pubic symphysis 2.5, greater
trochanter 3.0, sacrum 2.0, iliac crest (lateral) 3.0; sternum 1.2, lateral ribs 2.5, thoracic
spinous processes 1.5. No bone point may lie outside the skin. Scale, tilt (about X), and the
offsets in Y and Z are searched; X stays on the midline. hbm.py FITS holds the result.

    python fit_bones.py <human_base_meshes_bundle.blend>
"""
import os, sys, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import hbm
bpy.ops.wm.read_factory_settings(use_empty=True)
objs = hbm.load(sys.argv[1], body_level=1)
Bv, Bf = hbm.world_verts(objs[hbm.BODY])
xb = float(np.median(Bv[:, 0]))
bvh = BVHTree.FromPolygons([Vector(v) for v in Bv - [xb, 0, 0]], Bf)
bones = {n.replace(hbm.SKEL, ''): hbm.world_verts(o)[0] for n, o in objs.items() if n.startswith(hbm.SKEL)}
L = hbm.landmarks(bones)
x0 = L['midline_x']
fz = L['fhead_R'][2]
rng = np.random.default_rng(2)

def depth(Q):
    out = np.empty(len(Q))
    for i, q in enumerate(Q):
        loc, nrm, idx, d = bvh.find_nearest(Vector(q))
        out[i] = -d if (Vector(q) - loc).dot(nrm) > 0 else d     # positive inside
    return out

def ext(V, axis, sign, sel=None):
    V = V if sel is None else V[sel]
    return V[np.argmax(sign * V[:, axis])]

hip, sac, fR, fL = bones['hip'], bones['sacral'], bones['leg_femur.R'], bones['leg_femur.L']
rib = bones['ripcage']
tsp = np.vstack([V for n, V in bones.items() if n.startswith('spine_thoracic')])
lm_p = [  # (point, target depth m)
    (L['asis_R'], 0.015), (L['asis_L'], 0.015),
    (ext(hip, 1, -1, np.abs(hip[:, 0] - x0) < 0.01), 0.025),                       # pubic symphysis front
    (ext(fR, 0, -1, fR[:, 2] > fz - 0.06), 0.030), (ext(fL, 0, 1, fL[:, 2] > fz - 0.06), 0.030),   # trochanters
    (ext(sac, 1, 1), 0.020),                                                        # sacrum back
    (ext(hip, 0, -1, hip[:, 2] > fz + 0.08), 0.030), (ext(hip, 0, 1, hip[:, 2] > fz + 0.08), 0.030),  # crests
]
z0, z1 = rib[:, 2].min(), rib[:, 2].max()
lm_t = []
for f in (0.55, 0.75, 0.92):
    zc = z0 + f * (z1 - z0)
    band = np.abs(rib[:, 2] - zc) < 0.01
    lm_t.append((ext(rib, 1, -1, band & (np.abs(rib[:, 0] - x0) < 0.015)), 0.012))     # sternum
for f in (0.35, 0.55):
    zc = z0 + f * (z1 - z0)
    band = np.abs(rib[:, 2] - zc) < 0.01
    lm_t += [(ext(rib, 0, -1, band), 0.025), (ext(rib, 0, 1, band), 0.025)]          # lateral ribs
for f in (0.3, 0.55, 0.8):
    zc = tsp[:, 2].min() + f * (tsp[:, 2].max() - tsp[:, 2].min())
    lm_t.append((ext(tsp, 1, 1, np.abs(tsp[:, 2] - zc) < 0.012), 0.015))            # spinous processes
UNITS = {
    'pelvis': (np.vstack([hip, sac, bones['coccygeal']] + [V for n, V in bones.items() if n.startswith('spine_lumbar')]
                         + [fR[fR[:, 2] > fz - 0.08], fL[fL[:, 2] > fz - 0.08]]), lm_p),
    'thorax': (np.vstack([rib, tsp]), lm_t),
}
res = {}
for unit, (P, lms) in UNITS.items():
    c = P.mean(0)
    S = P[rng.choice(len(P), 300, replace=False)]
    LP = np.array([p for p, _ in lms]); LT = np.array([t for _, t in lms])
    def evaluate(s, pitch, dy, dz):
        R = np.array(Matrix.Rotation(np.radians(pitch), 3, 'X'))
        T = lambda Q: (Q - c) @ R.T * s + [c[0] - x0, c[1] + dy, c[2] + dz]
        dl = depth(T(LP)); ds = depth(T(S))
        return ((dl - LT) ** 2).sum() + 1e3 * (np.clip(0.002 - ds, 0, None) ** 2).sum(), dl, (ds < 0).mean()
    best = None
    for s, pitch, dy, dz in itertools.product(np.arange(0.90, 1.021, 0.02), range(-9, 10, 3),
                                              np.arange(-0.03, 0.031, 0.01), np.arange(-0.10, 0.101, 0.02)):
        e = evaluate(s, pitch, dy, dz)
        if best is None or e[0] < best[0][0]:
            best = (e, (s, pitch, dy, dz))
    # refine round the best
    (e0, prm) = best
    for step in (0.5, 0.25):
        s0, p0, y0, z0_ = prm
        for s, pitch, dy, dz in itertools.product(s0 + np.array([-0.01, 0, 0.01]) * step * 2, p0 + np.array([-1.5, 0, 1.5]) * step * 2,
                                                  y0 + np.array([-0.005, 0, 0.005]) * step * 2, z0_ + np.array([-0.01, 0, 0.01]) * step * 2):
            e = evaluate(s, pitch, dy, dz)
            if e[0] < best[0][0]:
                best = (e, (s, pitch, dy, dz))
        prm = best[1]
    (cost, dl, out), (s, pitch, dy, dz) = best
    print(f'{unit}: scale {s:.3f} pitch {pitch:+.1f} dy {dy:+.4f} dz {dz:+.4f} cost {cost:.5f} outside {100*out:.1f}%')
    print('   landmark depths (cm):', np.round(dl * 100, 1), 'targets', np.round(LT * 100, 1))
    R = np.array(Matrix.Rotation(np.radians(pitch), 3, 'X'))
    T = lambda Q: (np.asarray(Q) - c) @ R.T * s + [c[0] - x0, c[1] + dy, c[2] + dz]
    if unit == 'pelvis':
        for k in ('fhead_R', 'fhead_L', 'asis_R', 'pubic_R'):
            print('  ', k, np.round(T(L[k]), 4))
        print('   fhead radius', round(L['fhead_r_R'] * s, 4))
    else:
        print('   manubrium_top', np.round(T(L['manubrium_top']), 4))
    res[unit] = dict(c=c.tolist(), s=float(s), pitch=float(pitch), dy=float(dy), dz=float(dz), x0=float(x0), xb=xb)
print({u: {k: round(v, 4) for k, v in r.items() if k in ('s', 'pitch', 'dy', 'dz')} for u, r in res.items()})
