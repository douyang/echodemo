"""Build the static scene of the TAVR video: the heart model, the vessels below it, the body and
its bones (the CC0 Human Base Meshes, hbm.py), the inguinal ligaments and the table. Run inside
Blender's Python (bpy 4.5); anim.py builds it.

The heart model is the heartmodel repository's assets/heart.raw.glb and valves.raw.glb: the folder
in TAVR_ASSETS (or --assets), else ../heartmodel/assets next to this repository. The body is the
Human Base Meshes bundle v1.4.1 of Blender Studio (CC0; the bundle's README):
https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
Its .blend: TAVR_HBM (or --hbm), else video/out/tavr-procedure/hbm/human_base_meshes_bundle.blend.

    python scene.py [--assets <folder>] [--hbm <bundle.blend>] [--save scene.blend]
"""
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import anat as A  # noqa: E402
import geo as G  # noqa: E402
import hbm  # noqa: E402
import mats  # noqa: E402

ASSETS = os.environ.get('TAVR_ASSETS', os.path.join(HERE, '..', '..', '..', 'heartmodel', 'assets'))
HBM = os.environ.get('TAVR_HBM', os.path.join(HERE, '..', '..', 'video', 'out', 'tavr-procedure', 'hbm',
                                             'human_base_meshes_bundle.blend'))


# ---------------------------------------------------------------- helpers
def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


def mesh_obj(name, V, F, mat, coll, root=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in np.asarray(V, float)], [], [tuple(f) for f in F])
    me.validate(clean_customdata=False)
    if smooth:
        me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if mat is not None:
        o.data.materials.append(mat)
    if root is not None:
        o.parent = root
    return o


def set_verts(o, V):
    o.data.vertices.foreach_set('co', np.asarray(V, np.float32).ravel())
    o.data.update()


def tube_obj(name, rows, mat, coll, root, sides=24, step=0.25, caps=True):
    """A tube through the rows [x, y, z, r] (Catmull-Rom, resampled every `step` cm)."""
    P = A.resample(A.catmull(rows, 8), step)
    V = G.tube_verts(P[:, :3], P[:, 3], sides, cap0=caps, cap1=caps)
    F = G.tube_faces(len(P), sides, caps, caps)
    return mesh_obj(name, V, F, mat, coll, root)


def remesh(o, voxel, smooth_iter=0):
    m = o.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.use_smooth_shade = True
    if smooth_iter:
        s = o.modifiers.new('smooth', 'CORRECTIVE_SMOOTH')
        s.iterations = smooth_iter
        s.use_only_smooth = True
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------- the heart
def import_heart(root, M, coll):
    """The site's heart model: myocardium (aorta and veins with their own materials), coronaries
    and the detailed valves, chordae and papillary muscles; the pericardium left out."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'heart.raw.glb'))
    for n in ['MitralValve', 'TricuspidValve', 'AorticValve', 'PulmonaryValve', 'Pericardium']:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'valves.raw.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        o.parent = root
        o.data.materials.clear()
    myo = bpy.data.objects['Myocardium']
    # materials by region (the red channel of the model's colour, tenths): 5 aorta, 7 veins
    for k in ['myocardium', 'aorta', 'vein', 'cut']:
        myo.data.materials.append(M[k])
    me = myo.data
    ca = me.color_attributes['Color']
    col = np.zeros(len(ca.data) * 4)
    ca.data.foreach_get('color', col)
    reg = np.round(col.reshape(-1, 4)[:, 0] * 10).astype(int)
    li = np.zeros(len(me.polygons), int)
    me.polygons.foreach_get('loop_start', li)
    fr = reg[li]
    mi = np.where(fr == 5, 1, np.where(fr == 7, 2, 0))
    me.polygons.foreach_set('material_index', mi)
    me.shade_smooth()
    bpy.data.objects['Coronaries'].data.materials.append(M['artery'])
    for n in ['MitralValve', 'TricuspidValve', 'PulmonaryValve', 'MitralChordae', 'TricuspidChordae']:
        bpy.data.objects[n].data.materials.append(M['chordae'])
    bpy.data.objects['Papillary'].data.materials.append(M['myocardium'])
    av = bpy.data.objects['AorticValve']
    av.data.materials.append(M['native'])
    for o in new:
        if o.type == 'MESH':
            o.data.shade_smooth()
    return myo, av


def stenotic(av, M):
    """The native aortic valve made thick and calcified: a solidify, and a noise that whitens and
    roughens the leaflets (the shape keys stay under the modifiers, so the bumps move with them)."""
    tex = bpy.data.textures.new('calc', 'CLOUDS')
    tex.noise_scale = 0.18
    d = av.modifiers.new('calc', 'DISPLACE')
    d.texture = tex
    d.strength = 0.06
    d.texture_coords = 'LOCAL'
    s = av.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.12
    s.offset = 0
    # the material: calcium where a noise in object space runs high
    m = M['native']
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 2.2
    nz.inputs['Detail'].default_value = 4
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.48
    ramp.color_ramp.elements[0].color = (0.80, 0.66, 0.50, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.94, 0.92, 0.86, 1)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])


def wall_table(myo, axis_o, axis_d, h0=-1.5, h1=3.5, dh=0.1, na=72):
    """The inner radius of the aortic root and LVOT round the valve's axis (cm), by casting rays from
    the axis at end-diastole: rows of height h (along axis_d from axis_o), columns of angle."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = myo.evaluated_get(dg)
    me = ev.to_mesh()
    # the mesh's own coordinates: the standing frame (the parent turns it supine)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
    ev.to_mesh_clear()
    d = Vector(axis_d).normalized()
    e1 = d.orthogonal().normalized()
    e2 = d.cross(e1)
    hs = np.arange(h0, h1 + 1e-6, dh)
    R = np.full((len(hs), na), np.nan)
    for i, h in enumerate(hs):
        c = Vector(axis_o) + d * h
        for j in range(na):
            a = 2 * np.pi * j / na
            ray = (e1 * np.cos(a) + e2 * np.sin(a)).normalized()
            hit = bvh.ray_cast(c, ray, 4.0)
            if hit[0] is not None:
                R[i, j] = hit[3]
    return hs, R, np.array(e1), np.array(e2)


# ---------------------------------------------------------------- the body
def build_body(M, coll, root, heart_front):
    """The CC0 male body and its fitted bones (hbm.py) round the heart: the skin 2.4 cm in front
    of the heart, the notch and the hip joints at the frame's heights (anat.py)."""
    R = hbm.build(HBM, heart_front, A.FH_Z, A.ZN, A.XM)
    body = mesh_obj('Body', *R['body'], M['skin'], coll, root)
    eyes = [mesh_obj('Eye' + k[-1], *R[k], M['eye'], coll, root) for k in ('eye.L', 'eye.R')]
    bones = [mesh_obj('Bone.' + n, V, F, M['bone'], coll, root) for n, (V, F) in R['bones'].items()]
    return body, eyes, bones, R


# ---------------------------------------------------------------- vessels and landmarks
def build_vessels(M, coll, root):
    """The arteries and veins below the heart, both sides; each tree is one remeshed surface."""
    art_parts = [A.AORTA_EXT, A.ILIAC_R, A.FEMORAL_R, A.PROFUNDA_R, A.ILIAC_L]
    art_parts += [A.mirror(p) for p in [A.FEMORAL_R, A.PROFUNDA_R]]
    ven_parts = [A.IVC_EXT, A.ILIAC_V_R, A.FEMORAL_V_R, A.ILIAC_V_L, A.mirror(A.FEMORAL_V_R)]
    out = {}
    for name, parts, mat in [('Arteries', art_parts, M['artery']), ('Veins', ven_parts, M['vein'])]:
        allV, allF, off = [], [], 0
        for rows in parts:
            P = A.resample(A.catmull(rows, 8), 0.2)
            Vp = G.tube_verts(P[:, :3], P[:, 3], 32)
            allV.append(Vp)
            allF += [tuple(i + off for i in f) for f in G.tube_faces(len(P), 32)]
            off += len(Vp)
        o = mesh_obj(name, np.vstack(allV), allF, mat, coll, root)
        remesh(o, 0.08)
        o.data.shade_smooth()
        out[name] = o
    return out


def build_landmarks(M, coll, root):
    """The inguinal ligaments, ASIS to pubic tubercle, both sides."""
    objs = []
    for side in (1, -1):
        f = (lambda p: np.asarray(p, float)) if side == 1 else A.mirror
        lig = np.array([[*f(p), 0.10] for p in A.LIGAMENT_R])
        objs.append(tube_obj(f'Ligament{side}', lig, M['ligament'], coll, root, sides=12, step=0.3))
    return objs


def build_table(M, coll, back_y):
    """The table: its top under the body's back (back_y: the most posterior skin, standing frame)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    t = bpy.context.object
    t.name = 'Table'
    for c in list(t.users_collection):
        c.objects.unlink(t)
    coll.objects.link(t)
    t.scale = (110, 215, 4)
    t.location = (A.XM, -42.0, -back_y - 2.0)     # world, supine: under the back
    t.data.materials.append(M['table'])
    bev = t.modifiers.new('bevel', 'BEVEL')
    bev.width = 1.5
    bev.segments = 4
    return t


# ---------------------------------------------------------------- the scene
def setup(res=(1216, 486)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.04
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 24
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.use_persistent_data = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 93
    # the world: a dark slate, a little lighter above
    w = bpy.data.worlds.new('world')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, -np.pi / 2, 0)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.012, 0.015, 0.018, 1)
    ramp.color_ramp.elements[1].color = (0.045, 0.052, 0.060, 1)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    return sc


def lights(coll):
    out = {}
    for name, loc, energy, size, color in [
        ('Key', (-60, 30, 90), 9.0e4, 60, (1.0, 0.97, 0.93)),
        ('Fill', (70, -20, 40), 2.5e4, 80, (0.85, 0.9, 1.0)),
        ('Rim', (0, -120, 30), 3.0e4, 50, (0.9, 0.95, 1.0)),
    ]:
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        coll.objects.link(lo)
        lo.location = loc
        direction = -Vector(loc)
        lo.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        out[name] = lo
    return out


def build(save=None):
    sc = setup()
    M = mats.build()
    C = {k: collection(k) for k in ['Anatomy', 'Body', 'Devices', 'Lights', 'Cameras']}
    root = bpy.data.objects.new('Patient', None)       # standing frame -> supine world
    sc.collection.objects.link(root)
    root.rotation_euler = (-np.pi / 2, 0, 0)
    myo, av = import_heart(root, M, C['Anatomy'])
    stenotic(av, M)
    vessels = build_vessels(M, C['Anatomy'], root)
    marks = build_landmarks(M, C['Anatomy'], root)
    HV = np.array([v.co[:] for v in myo.data.vertices])
    body, eyes, bones, R = build_body(M, C['Body'], root, HV[np.argmin(HV[:, 1])])
    table = build_table(M, C['Body'], float(R['body'][0][:, 1].max()))
    L = lights(C['Lights'])
    bpy.context.view_layer.update()
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=save)
    return dict(sc=sc, M=M, C=C, root=root, myo=myo, av=av, vessels=vessels, marks=marks, body=body, eyes=eyes,
                bones=bones, table=table, lights=L, fit=R['landmarks'])


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    save = args[args.index('--save') + 1] if '--save' in args else None
    if '--assets' in args:
        ASSETS = args[args.index('--assets') + 1]
    if '--hbm' in args:
        HBM = args[args.index('--hbm') + 1]
    build(save)
