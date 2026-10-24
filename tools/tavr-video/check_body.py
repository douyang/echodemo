"""Build the scene (scene.py) and check the body round the anatomy: the heart and vessels inside
the skin, the vessels out of the bones, the aorta and the cava in front of the spine, the sternum
in front of the heart. Then Workbench previews: from the front, the right and the groin.

    python check_body.py --out look/body [--no-render]
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import anat as A
import scene

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = args[args.index('--out') + 1]
os.makedirs(OUT, exist_ok=True)
S = scene.build()
sc, M = S['sc'], S['M']
verts = lambda o: np.array([v.co[:] for v in o.data.vertices])
tree = lambda o: BVHTree.FromPolygons([v.co.copy() for v in o.data.vertices], [p.vertices[:] for p in o.data.polygons])
# Inside a closed mesh: an odd number of crossings on a ray. The nearest face's normal is not a
# safe test: far from a mesh, or in a fold, it can face away from the point.
RAY = Vector((0.13, -0.98, 0.15)).normalized()
def crossings(bvh, v):
    n, o = 0, v.copy()
    for _ in range(64):
        h = bvh.ray_cast(o, RAY, 400)
        if h[0] is None:
            break
        n += 1
        o = h[0] + RAY * 1e-4
    return n
def inside(bvh, P):
    return np.array([crossings(bvh, Vector(p)) % 2 == 1 for p in P])
skin = tree(S['body'])
HV = verts(S['myo'])
print('heart outside the skin: %.2f%%' % (100 * (~inside(skin, HV[::25])).mean()))
paths = {'aorta': A.AORTA_EXT, 'iliac R': A.ILIAC_R, 'femoral R': A.FEMORAL_R, 'profunda R': A.PROFUNDA_R,
         'iliac L': A.ILIAC_L, 'ivc': A.IVC_EXT, 'iliac v R': A.ILIAC_V_R, 'femoral v R': A.FEMORAL_V_R, 'iliac v L': A.ILIAC_V_L}
bones = {o.name: tree(o) for o in S['bones']}
for name, rows in paths.items():
    P = A.resample(A.catmull(rows, 8), 0.3)
    out_skin = (~inside(skin, P[:, :3])).mean()
    worst = (1e9, None, None)
    for bn, bt in bones.items():
        for p in P:
            v = Vector(p[:3])
            loc, nrm, i, d = bt.find_nearest(v)
            sd = -d if crossings(bt, v) % 2 else d
            if sd - p[3] < worst[0]:
                worst = (sd - p[3], bn, np.round(p[:3], 1))
    print(f'{name:12s} outside skin {100*out_skin:5.1f}%  nearest bone wall {worst[0]:+.2f} cm ({worst[1]} at {worst[2]})')
rib = verts(next(o for o in S['bones'] if o.name == 'Bone.ripcage'))
st = rib[(np.abs(rib[:, 0] - A.XM) < 1.5) & (rib[:, 1] < -2) & (rib[:, 2] > HV[:, 2].min()) & (rib[:, 2] < A.AV[2] + 3)]
print('sternum back y %.2f, heart front y %.2f' % (st[:, 1].max(), HV[:, 1].min()))
for k, v in S['fit'].items():
    print(' ', k, np.round(v, 2))
if '--no-render' in args:
    sys.exit(0)
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light, sh.color_type = 'STUDIO', 'MATERIAL'
M['skin'].diffuse_color = (0.80, 0.65, 0.58, 0.3)
M['bone'].diffuse_color = (0.9, 0.86, 0.75, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
SUP = Matrix.Rotation(-np.pi / 2, 4, 'X')
def shoot(name, eye, tgt, lens, up=(0, 1, 0), res=(1000, 1200)):
    E, T = SUP @ Vector(eye), SUP @ Vector(tgt)
    f = (T - E).normalized(); r = f.cross(Vector(up)).normalized(); u = r.cross(f).normalized()
    cam.matrix_world = Matrix.Translation(E) @ Matrix((r, u, -f)).transposed().to_4x4()
    cam.data.lens, cam.data.clip_end, cam.data.clip_start = lens, 3000, 1
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = os.path.join(OUT, name + '.png')
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
mid = np.array([A.XM, 0, -40])
shoot('front', mid + [0, -420, 0], mid, 50)
shoot('side', mid + [-420, 0, 0], mid, 50)
g = A.FEMORAL_HEAD_R
shoot('groin', g + [-6, -70, 6], g + [4, 0, 4], 50, res=(1200, 900))
shoot('groin_side', g + [-60, -22, 4], g + [2, -2, 3], 50, res=(1200, 900))
shoot('table', np.array([A.XM - 105, -95, -12]), np.array([A.XM, 0, -22]), 32, up=(0, 0, 1), res=(1216, 486))
