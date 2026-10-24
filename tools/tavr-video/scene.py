"""Build the static scene of the TAVR video: the heart model, the vessels below it, the body,
the groin's landmarks and the table. Run inside Blender's Python (bpy 4.5); anim.py builds it.

The heart model is the heartmodel repository's assets/heart.raw.glb and valves.raw.glb: the folder
in TAVR_ASSETS (or --assets), else ../heartmodel/assets next to this repository.

    python scene.py [--assets <folder>] [--save scene.blend]
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
import mats  # noqa: E402

ASSETS = os.environ.get('TAVR_ASSETS', os.path.join(HERE, '..', '..', '..', 'heartmodel', 'assets'))


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
def build_body(M, coll, root):
    """Torso from bodykey.js's cross-sections, arms, head and legs, joined into one skin."""
    parts = []
    # the torso to the pelvis (bodykey's rings to 42 cm below the notch, then a rounder pelvis that
    # the thighs merge into: no torso hem over the legs)
    rings = [r for r in A.RINGS if r[0] >= -42] + [[-48, 16.4, -2.4, -25.0], [-53, 14.6, -3.8, -24.0]]
    rows = A.catmull(np.array(rings, float), 4)
    Msides = 64
    V = []
    for r in rows:
        for k in range(Msides):
            x, z = A.section(r, 2 * np.pi * k / Msides)
            V.append(A.body_point(x, r[0], z))
    parts.append((np.array(V), G.tube_faces(len(rows), Msides, True, True), True))
    for side in (1, -1):
        arm = A.catmull(np.array(A.ARM, float), 4)
        P = np.array([A.body_point(side * a[0], a[1], a[2]) for a in arm])
        parts.append((G.tube_verts(P, arm[:, 3], 24), G.tube_faces(len(P), 24), False))
        # the leg: hip to ankle, then the foot
        hip = A.body_point(side * 8.2, -44.0, -14.0)
        knee = A.body_point(side * 9.6, -93.0, -13.0)
        calf = A.body_point(side * 9.7, -105.0, -13.8)
        ankle = A.body_point(side * 9.8, -135.0, -14.6)
        leg = np.array([[*hip, 9.4], [*A.body_point(side * 8.7, -56, -14.0), 8.8],
                        [*A.body_point(side * 9.2, -70, -13.6), 7.4], [*knee, 5.4],
                        [*calf, 5.9], [*ankle, 3.3]])
        L = A.resample(A.catmull(leg, 6), 1.0)
        parts.append((G.tube_verts(L[:, :3], L[:, 3], 24), G.tube_faces(len(L), 24), False))
        toe = ankle + np.array([0, -11.0, -4.0])
        foot = np.array([[*ankle, 3.3], [*(ankle + np.array([0, -4, -5.5])), 3.6], [*toe, 2.4]])
        F2 = A.resample(A.catmull(foot, 6), 0.8)
        parts.append((G.tube_verts(F2[:, :3], F2[:, 3], 20), G.tube_faces(len(F2), 20), False))
    # the head: an egg set forward at the jaw (bodykey.js)
    hc = A.body_point(0, 21.8, -11.2)
    u, v = np.meshgrid(np.linspace(0, np.pi, 33), np.linspace(0, 2 * np.pi, 48, endpoint=False), indexing='ij')
    x, y, z = np.sin(u) * np.cos(v), np.cos(u), np.sin(u) * np.sin(v)
    jaw = np.clip((-y - 0.1) / 0.85, 0, 1)
    jaw = jaw * jaw * (3 - 2 * jaw)
    X = x * 7.6 * (1 - 0.3 * jaw)
    Zd = z * 9.9 * np.where(z < 0, 1 - 0.45 * jaw, 1) + 3.0 * jaw
    HV = np.stack([hc[0] + X, hc[1] - Zd, hc[2] + y * 11.6], -1).reshape(-1, 3)
    HF = []
    nu, nv = 33, 48
    for i in range(nu - 1):
        for k in range(nv):
            a, b = i * nv + k, i * nv + (k + 1) % nv
            HF.append((a, b, b + nv, a + nv))
    parts.append((HV, HF, False))
    # one mesh, then one skin over all parts
    allV, allF, off = [], [], 0
    for Vp, Fp, _ in parts:
        allV.append(np.asarray(Vp))
        allF += [tuple(i + off for i in f) for f in Fp]
        off += len(Vp)
    o = mesh_obj('Body', np.vstack(allV), allF, M['skin'], coll, root)
    remesh(o, 0.6, smooth_iter=40)
    o.data.shade_smooth()
    return o


# ---------------------------------------------------------------- vessels and landmarks
def build_vessels(M, coll, root):
    """The arteries and veins below the heart, both sides; each tree is one remeshed surface."""
    art_parts = [A.AORTA_EXT, A.ILIAC_R, A.FEMORAL_R, A.PROFUNDA_R]
    art_parts += [A.mirror(p) for p in [A.ILIAC_R, A.FEMORAL_R, A.PROFUNDA_R]]
    ven_parts = [A.IVC_EXT, A.ILIAC_V_R, A.FEMORAL_V_R]
    ven_parts += [A.mirror(p) for p in [A.ILIAC_V_R, A.FEMORAL_V_R]]
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
    """The groin's landmarks, both sides: the inguinal ligament and the femur's head, neck and shaft;
    and the spine behind the aorta."""
    objs = []
    for side in (1, -1):
        f = (lambda p: np.asarray(p, float)) if side == 1 else A.mirror
        lig = np.array([[*f(p), 0.14] for p in A.LIGAMENT_R])
        objs.append(tube_obj(f'Ligament{side}', lig, M['ligament'], coll, root, sides=12, step=0.3))
        head = f(A.FEMORAL_HEAD_R)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=A.FEMORAL_HEAD_RADIUS, location=head)
        s = bpy.context.object
        s.name = f'FemoralHead{side}'
        for c in list(s.users_collection):
            c.objects.unlink(s)
        coll.objects.link(s)
        s.parent = root
        s.data.materials.append(M['bone'])
        s.data.shade_smooth()
        objs.append(s)
        neck = np.array([[*head, 1.6], [*f(A.TROCHANTER_R), 1.9],
                         [*f(A.TROCHANTER_R + np.array([0.3, 0, -5])), 1.5]])
        objs.append(tube_obj(f'Femur{side}', neck, M['bone'], coll, root, sides=20, step=0.5))
    # the spine: vertebral bodies from the upper chest to the sacrum, behind the aorta and the cava
    spine = np.array([[A.XM, 9.6, 11.0], [A.XM, 9.8, 0.0], [A.XM, 8.6, -12.0], [A.XM, 6.8, -22.0],
                      [A.XM, 6.4, -27.0], [A.XM, 8.0, -31.0]])
    sp = A.resample(A.catmull(spine, 8), 0.05)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(sp, axis=0), axis=1))]
    T, N, B = G.rmf(sp)
    allV, allF, off = [], [], 0
    k = 0.0
    while k < s[-1] - 2.0:
        i0, i1 = np.searchsorted(s, k), np.searchsorted(s, k + 2.0)
        P = sp[i0:i1 + 1]
        r = 1.7 + 0.5 * (k / s[-1])
        Vp = G.tube_verts(P, r, 24)
        allV.append(Vp)
        allF += [tuple(i + off for i in f) for f in G.tube_faces(len(P), 24)]
        off += len(Vp)
        k += 2.55
    objs.append(mesh_obj('Spine', np.vstack(allV), allF, M['bone'], coll, root))
    return objs


def build_table(M, coll, root_supine):
    bpy.ops.mesh.primitive_cube_add(size=1)
    t = bpy.context.object
    t.name = 'Table'
    for c in list(t.users_collection):
        c.objects.unlink(t)
    coll.objects.link(t)
    t.scale = (60, 210, 4)
    t.location = (A.XM, -40.0, -18.5)     # world, supine: under the back
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
    body = build_body(M, C['Body'], root)
    table = build_table(M, C['Body'], root)
    L = lights(C['Lights'])
    bpy.context.view_layer.update()
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=save)
    return dict(sc=sc, M=M, C=C, root=root, myo=myo, av=av, vessels=vessels, marks=marks, body=body, table=table, lights=L)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    save = args[args.index('--save') + 1] if '--save' in args else None
    if '--assets' in args:
        ASSETS = args[args.index('--assets') + 1]
    build(save)
