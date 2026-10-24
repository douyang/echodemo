"""Place the CC0 body and bones round the heart model (hbm.build) and write the landmarks that
anat.py's vessels below the heart were drawn on (body_fit.json, standing frame, cm): the femoral
heads, the anterior superior iliac spines, the pubic tubercles and symphysis, the front of the
lumbar and lower thoracic spine by height, the sacral promontory and alae, and the thighs'
centre lines.

    python fit_body.py --hbm <bundle.blend> [--out body_fit.json]
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import numpy as np
import hbm
import mats
import scene

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
HBM = args[args.index('--hbm') + 1]
OUT = args[args.index('--out') + 1] if '--out' in args else 'body_fit.json'
import anat as A  # noqa: E402

scene.setup()
M = mats.build()
root = bpy.data.objects.new('Patient', None)
bpy.context.scene.collection.objects.link(root)
myo, _ = scene.import_heart(root, M, scene.collection('Anatomy'))
HV = np.array([v.co[:] for v in myo.data.vertices])
front = HV[np.argmin(HV[:, 1])]
R = hbm.build(HBM, front, A.FH_Z, A.ZN, A.XM)
L = {k: np.asarray(v).tolist() if not np.isscalar(v) else float(v) for k, v in R['landmarks'].items()}
L['y0'] = float(R['warp'].y0)
L['stretch'] = float(R['warp'].k)
# the front of the spine by height: the most anterior bone point within 2.2 cm of the midline
B = R['bones']
spine = np.vstack([B[n][0] for n in B if n.startswith('spine')] + [B['sacral'][0]])
prof = []
for z in np.arange(spine[:, 2].min() + 0.5, 4.0, 0.5):
    s = spine[(np.abs(spine[:, 2] - z) < 0.3) & (np.abs(spine[:, 0] - A.XM) < 2.2)]
    if len(s) > 5:
        prof.append([float(z), float(s[:, 1].min())])
L['spine_front'] = prof
for n in ('spine_lumbar_l4', 'spine_lumbar_l5', 'spine_lumbar_l3', 'spine_thoracic_t12'):
    V = B[n][0]
    body = V[V[:, 1] < np.median(V[:, 1])]
    L[n] = {'z': float(body[:, 2].mean()), 'zlo': float(np.percentile(body[:, 2], 5)), 'front': float(body[:, 1].min())}
sac = B['sacral'][0]
top = sac[sac[:, 2] > np.percentile(sac[:, 2], 85)]
L['promontory'] = top[np.argmin(top[:, 1])].tolist()
for s, sgn in (('R', -1), ('L', 1)):
    a = top[np.sign(top[:, 0] - A.XM) == sgn]
    L['ala_' + s] = a[np.argmax(np.abs(a[:, 0] - A.XM))].tolist()
# the thighs' centre lines from the skin's cross-sections (the hands excluded)
BV = R['body'][0]
for s, sgn in (('R', -1), ('L', 1)):
    C = []
    for z in np.arange(L['fhead_' + s][2] - 6, L['fhead_' + s][2] - 46, -4.0):
        q = BV[(np.abs(BV[:, 2] - z) < 0.4) & (np.sign(BV[:, 0] - A.XM) == sgn) & (np.abs(BV[:, 0] - A.XM) < 26)]
        # the thigh's own ring: the points nearest the leg's axis cluster (drop the hand)
        cx = np.median(q[:, 0])
        q = q[np.abs(q[:, 0] - cx) < 12]
        C.append([float(q[:, 0].mean()), float(q[:, 1].mean()), float(z), float((q[:, 0].max() - q[:, 0].min()) / 2),
                  float(q[:, 1].min()), float(q[:, 1].max())])
    L['thigh_' + s] = C
json.dump(L, open(OUT, 'w'), indent=1)
print('wrote', OUT)
for k, v in L.items():
    if k not in ('spine_front', 'thigh_R', 'thigh_L'):
        print(' ', k, np.round(v, 2) if not isinstance(v, dict) else {a: round(b, 2) for a, b in v.items()})
print('  spine front (z, y):', [(round(z, 1), round(y, 2)) for z, y in L['spine_front'][::4]])
print('  thigh R (x, y, z, half-width, front, back):', [[round(c, 1) for c in r] for r in L['thigh_R']])
