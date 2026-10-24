"""The heart against the rib cage: heart points within 3 mm of bone or past it (by ray parity),
and a Workbench close-up of the chest from the front and the left.

    python check_chest.py --out look/chest
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
OUT = sys.argv[sys.argv.index('--out') + 1]
os.makedirs(OUT, exist_ok=True)
S = scene.build()
rib = next(o for o in S['bones'] if o.name == 'Bone.ripcage')
me = rib.data
bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
HV = np.array([v.co[:] for v in S['myo'].data.vertices])
def crossings(p, d):
    n, o = 0, Vector(p)
    for _ in range(40):
        h = bvh.ray_cast(o, d, 200)
        if h[0] is None:
            break
        n += 1
        o = h[0] + d * 1e-4
    return n
near, inside = [], []
for p in HV[::7]:
    loc, nrm, i, dist = bvh.find_nearest(Vector(p))
    if dist < 0.3:
        near.append(p)
        if crossings(p, Vector((0, -1, 0))) % 2 == 1:
            inside.append(p)
print('heart points within 3 mm of the rib cage: %d of %d; inside bone: %d' % (len(near), len(HV[::7]), len(inside)))
if inside:
    P = np.array(inside)
    print('  inside: x %.1f..%.1f  y %.1f..%.1f  z %.1f..%.1f' % (P[:, 0].min(), P[:, 0].max(), P[:, 1].min(), P[:, 1].max(), P[:, 2].min(), P[:, 2].max()))
sc, M = S['sc'], S['M']
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light, sh.color_type = 'STUDIO', 'MATERIAL'
M['skin'].diffuse_color = (0.80, 0.65, 0.58, 0.15)
M['bone'].diffuse_color = (0.9, 0.86, 0.75, 0.6)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
SUP = Matrix.Rotation(-np.pi / 2, 4, 'X')
def shoot(name, eye, tgt, lens, up=(0, 1, 0), res=(1100, 1000)):
    E, T = SUP @ Vector(eye), SUP @ Vector(tgt)
    f = (T - E).normalized(); r = f.cross(Vector(up)).normalized(); u = r.cross(f).normalized()
    cam.matrix_world = Matrix.Translation(E) @ Matrix((r, u, -f)).transposed().to_4x4()
    cam.data.lens, cam.data.clip_end, cam.data.clip_start = lens, 3000, 1
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = os.path.join(OUT, name + '.png')
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
c = np.array([A.XM + 2, -2, 2])
shoot('chest_front', c + [0, -90, 0], c, 50)
shoot('chest_left', c + [80, -30, 0], c, 50)
