# Render the procedure pane of chapter M-TEER, T-TEER or TAVR in Blender (Cycles): the heart model
# cut away, with the guide from the inferior vena cava across the atrial septum and the clip on the
# mitral valve, the guide in the right atrium and the clip on the tricuspid valve, or the
# transcatheter valve in the aortic root (the export's geo.ch). The meshes come from the site
# itself (tools/blender/export.mjs), so the frames show the heart and the device that the echo
# panes cut. A frame of the export may carry its own camera
# (cam: { at: [x, y, z] in the site's cm, width (cm), yaw and pitch (deg) about the step's view }),
# for a video with camera moves.
#
#   python tools/blender/render.py --mesh video/out/mteer/mesh_stills --out video/out/mteer/stills
#        [--frames before,septum]   only these frames (names from the export)
#        [--res 1000] [--samples 48]
#        [--aspect 1.17]            the frame's width over its height (the height keeps the field)
#        [--allow-overlap]          render frames that fail the overlap check (export.js)
#
# Run it with Python that has Blender's bpy module (pip install bpy; Blender 4.2 or later). Before
# it renders, it reads the export's overlap check: a frame whose device meets a wall or a leaflet
# where it should not stops the run (--allow-overlap renders it anyway).
#
# Axes: the export is in the site's world, cm (x to the patient's left, y to the head, z to the
# front); Blender's is in m with z up: (x, y, z) -> (x, -z, y) / 100.
import argparse
import json
import math
import os
import sys
import time

import numpy as np
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector, Matrix

ap = argparse.ArgumentParser()
ap.add_argument('--mesh', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--frames', default='')
ap.add_argument('--res', type=int, default=1000)
ap.add_argument('--samples', type=int, default=48)
ap.add_argument('--aspect', type=float, default=1.0)
ap.add_argument('--allow-overlap', action='store_true')
ap.add_argument('--bounces', type=int, default=6)
ap.add_argument('--engine', default='CYCLES', help='CYCLES, or BLENDER_EEVEE_NEXT for a fast draft')
ap.add_argument('--fieldk', type=float, default=1.0, help='the field scaled by this (a tall frame shows more)')
ap.add_argument('--shift-y', type=float, default=0.0, help="the camera's vertical shift, in Blender's units (the frame's larger side): > 0 puts the subject lower")
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

M = json.load(open(os.path.join(args.mesh, 'manifest.json')))
frames = M['report']
if args.frames:
    want = args.frames.split(',')
    frames = [f for f in frames if f['name'] in want]
bad = [f for f in frames if f['overlap']['wallHits'] or f['overlap']['leafHits']]
if bad and not args.allow_overlap:
    for f in bad:
        o = f['overlap']
        print(f"overlap in {f['name']}: {o['wallHits']} wall hits (min {o['wallMin']} cm), {o['leafHits']} leaflet hits (min {o['leafMin']} cm)")
    sys.exit('the overlap check failed: fix the device, or pass --allow-overlap')
os.makedirs(args.out, exist_ok=True)

V = lambda p: Vector((p[0], -p[2], p[1])) * 0.01
def read(path, dt):
    return np.fromfile(path, dtype=dt)
def to_blender(pos):
    p = pos.reshape(-1, 3).astype(np.float64) * 0.01
    return np.stack([p[:, 0], -p[:, 2], p[:, 1]], axis=1)

# ---------------------------------------------------------------- the scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = args.engine
sc.cycles.device = 'CPU'
sc.cycles.samples = args.samples
sc.cycles.use_denoising = True
if args.engine != 'CYCLES':
    sc.eevee.taa_render_samples = max(8, args.samples)
sc.cycles.max_bounces = args.bounces
sc.render.use_persistent_data = True
sc.cycles.transparent_max_bounces = 24
sc.render.film_transparent = True
sc.render.resolution_y = args.res
sc.render.resolution_x = int(round(args.res * args.aspect))
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.055, 0.065, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.25

G = M['geo']
TRI = G.get('ch') == 'tteer'
TAV = G.get('ch') == 'tavr'
TILT = (0.8, 0.6)
D3 = lambda d: Vector((d[0], -d[2], d[1])).normalized()
if TAV:
    # the cut: the plane of the root's axis and the LV apex, as the TEE long axis of the aortic
    # valve cuts it; the half toward the front goes, so the root, the valve in it, the LVOT and
    # the LV show from the front
    C, apex = V(G['C']), V(G['apex'])
    n = D3(G['n']).cross(apex - C).normalized()
    if n.dot(Vector((0, -1, 0))) < 0:
        n = -n
elif TRI:
    # the cut: the plane through the clip's site square to the anteroseptal line of coaptation; the
    # half toward the patient's right and front goes, so the RA, the anterior and septal leaflets
    # in section, the clip's arms and the RV show from that side
    Bc = Vector((G['Bc'][0], -G['Bc'][2], G['Bc'][1])).normalized()
    Nb0 = Vector((G['N'][0], -G['N'][2], G['N'][1])).normalized()
    # a slanted cut: through a point 2 mm above the clip's site, its normal between the valve's
    # axis (into the RA) and the far end of the line of coaptation, so the camera sees the valve
    # from the RA at a slant, with the anterior and septal leaflets cut near the clip
    C = V(G['Q']) + Nb0 * 0.002
    n = (Nb0 * TILT[0] - Bc * TILT[1]).normalized()
else:
    C, Sx, apex = V(G['C']), V(G['S']), V(G['apex'])
    # the cut: the plane through the mitral annulus's middle, the puncture site and the LV apex; the
    # half toward the front goes, so the chambers show from the front
    n = (Sx - C).cross(apex - C).normalized()
    if n.dot(Vector((0, -1, 0))) < 0:
        n = -n
CUT_O, CUT_N = C.copy(), n.copy()
CUT_NODES = []


def set_cut(off):
    """The cut moved off cm along its normal (a frame's cam.cut): far off, the heart shows whole."""
    for sub_, dot_ in CUT_NODES:
        sub_.inputs[1].default_value = CUT_O + CUT_N * (off * 0.01)
        dot_.inputs[1].default_value = CUT_N

def principled(nt, col, rough=0.45, metal=0.0, coat=0.0, sheen=0.0, spec=0.5):
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.2
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Specular IOR Level'].default_value = spec
    return b

def material(name, col, inner=None, cut=True, bump=0.0, **kw):
    """A tissue: col outside, inner where its wall is seen cut open (back faces), transparent past the cut; bump, a fine wet grain."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    face = principled(nt, col, **kw)
    if bump > 0:
        geo0 = nt.nodes.new('ShaderNodeNewGeometry')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 650.0
        noise.inputs['Detail'].default_value = 4.0
        bmp = nt.nodes.new('ShaderNodeBump')
        bmp.inputs['Strength'].default_value = bump
        bmp.inputs['Distance'].default_value = 0.0004
        nt.links.new(geo0.outputs['Position'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], bmp.inputs['Height'])
        nt.links.new(bmp.outputs['Normal'], face.inputs['Normal'])
        # a little variation in the colour, from a coarser noise
        noise2 = nt.nodes.new('ShaderNodeTexNoise')
        noise2.inputs['Scale'].default_value = 90.0
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['To Min'].default_value = 0.85
        ramp.inputs['To Max'].default_value = 1.12
        mulc = nt.nodes.new('ShaderNodeMix'); mulc.data_type = 'RGBA'; mulc.blend_type = 'MULTIPLY'
        mulc.inputs['Factor'].default_value = 1.0
        mulc.inputs['A'].default_value = (*col, 1)
        nt.links.new(geo0.outputs['Position'], noise2.inputs['Vector'])
        nt.links.new(noise2.outputs['Fac'], ramp.inputs['Value'])
        nt.links.new(ramp.outputs['Result'], mulc.inputs['B'])
        nt.links.new(mulc.outputs['Result'], face.inputs['Base Color'])
    surf = face.outputs[0]
    if inner:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        back = principled(nt, inner, rough=0.65)
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(geo.outputs['Backfacing'], mix.inputs[0])
        nt.links.new(face.outputs[0], mix.inputs[1])
        nt.links.new(back.outputs[0], mix.inputs[2])
        surf = mix.outputs[0]
    if cut:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = CUT_O
        dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = CUT_N
        CUT_NODES.append((sub, dot))
        gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0
        nt.links.new(geo.outputs['Position'], sub.inputs[0])
        nt.links.new(sub.outputs[0], dot.inputs[0])
        nt.links.new(dot.outputs['Value'], gt.inputs[0])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix2 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(gt.outputs[0], mix2.inputs[0])
        nt.links.new(surf, mix2.inputs[1])
        nt.links.new(tr.outputs[0], mix2.inputs[2])
        surf = mix2.outputs[0]
    nt.links.new(surf, out.inputs['Surface'])
    return m

CUTIN = (0.24, 0.035, 0.03)
MAT = {
    1: material('LV', (0.33, 0.05, 0.045), CUTIN, bump=0.12, rough=0.38, coat=0.35),
    2: material('RV', (0.35, 0.055, 0.05), CUTIN, bump=0.12, rough=0.38, coat=0.35),
    3: material('LA', (0.42, 0.09, 0.075), CUTIN, bump=0.1, rough=0.4, coat=0.3),
    4: material('RA', (0.42, 0.09, 0.075), CUTIN, bump=0.1, rough=0.4, coat=0.3),
    5: material('Ao', (0.62, 0.38, 0.32), (0.45, 0.22, 0.19), bump=0.06, rough=0.45, coat=0.25),
    6: material('PA', (0.58, 0.34, 0.30), (0.42, 0.20, 0.18), bump=0.06, rough=0.45, coat=0.25),
    7: material('veins', (0.34, 0.10, 0.12), CUTIN, bump=0.06, rough=0.45, coat=0.25),
}
# the valves stay whole: the cut opens the walls round them, so the leaflets and the clip show
VALVE = material('valve', (0.80, 0.62, 0.50), (0.68, 0.48, 0.38), cut=False, bump=0.05, rough=0.38, sheen=0.25, coat=0.2)
CHORD = material('chord', (0.88, 0.82, 0.74), cut=False, rough=0.4)
# the tricuspid, aortic and pulmonary valves sit in the walls that the cut opens: they go with them
VALVE_CUT = material('valvecut', (0.80, 0.62, 0.50), (0.68, 0.48, 0.38), bump=0.05, rough=0.38, sheen=0.25, coat=0.2)
CHORD_CUT = material('chordcut', (0.88, 0.82, 0.74), rough=0.4)
def balloon_mat():
    """The balloon: a clear, slightly blue film that the frame and the leaflets show through."""
    m = bpy.data.materials.new('balloon')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.72, 0.80, 0.95, 1)
    b.inputs['Roughness'].default_value = 0.12
    b.inputs['Transmission Weight'].default_value = 0.85
    b.inputs['Alpha'].default_value = 0.6
    return m
DEV = {
    'clip': material('clip', (0.52, 0.53, 0.55), cut=False, rough=0.7, sheen=0.45),
    'grip': material('grip', (0.80, 0.80, 0.82), cut=False, rough=0.22, metal=1.0),
    'dc': material('dc', (0.46, 0.48, 0.52), cut=False, rough=0.32, coat=0.3),
    'sleeve': material('sleeve', (0.22, 0.25, 0.30), cut=False, rough=0.3, coat=0.4),
    'guide': material('guide', (0.10, 0.14, 0.24), cut=False, rough=0.26, coat=0.5),
    'sheath': material('sheath', (0.80, 0.80, 0.78), cut=False, rough=0.3, coat=0.3),
}
PART = {'body': 'clip', 'armA': 'clip', 'armP': 'clip', 'gripA': 'grip', 'gripP': 'grip', 'dc': 'dc', 'sleeve': 'sleeve', 'guide': 'guide', 'sheath': 'sheath'}
if TAV:
    # the transcatheter valve: a cobalt-chromium frame, a fabric skirt, bovine pericardial
    # leaflets; the delivery catheter, its nose cone, the stiff wire and the balloon. The native
    # leaflets, calcified and pushed out, go with the walls in the cut, so the new valve shows
    # in front of them. The metals stay light: a mirror finish would show the dark room.
    DEV.update({
        'struts': material('struts', (0.88, 0.89, 0.92), cut=False, rough=0.34, metal=0.8),
        'skirt': material('skirtfab', (0.86, 0.86, 0.84), cut=False, rough=0.78, sheen=0.5),
        'leaflet': material('pericard', (0.90, 0.84, 0.72), cut=False, rough=0.42, sheen=0.35, coat=0.15),
        'native': material('native', (0.80, 0.71, 0.56), (0.70, 0.60, 0.46), bump=0.1, rough=0.55),
        'shaft': material('shaft', (0.88, 0.88, 0.90), cut=False, rough=0.3, coat=0.3),
        'nose': material('nose', (0.28, 0.40, 0.66), cut=False, rough=0.3, coat=0.4),
        'wire': material('wire', (0.86, 0.86, 0.88), cut=False, rough=0.3, metal=0.75),
        'balloon': balloon_mat(),
    })
def dev_mat(k):
    """A device part's material: by its name, or by its kind for TAVR's numbered parts (leaflet0, native2)."""
    if TAV:
        return DEV[k.rstrip('0123456789')] if k.rstrip('0123456789') in DEV else DEV['shaft']
    return DEV[PART.get(k, 'dc')]

def make(name, verts, faces, mats, face_mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    for m in mats:
        me.materials.append(m)
    if face_mat is not None:
        me.polygons.foreach_set('material_index', face_mat)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob

# ---------------------------------------------------------------- the heart, built once
first = frames[0]['name']
tissue = {}
for name in M['topo']:
    idx = read(os.path.join(args.mesh, 'topo', f'{name}.idx'), np.uint32).reshape(-1, 3)
    pos = to_blender(read(os.path.join(args.mesh, first, f'{name}.pos'), np.float32))
    if name == 'myo':
        reg = read(os.path.join(args.mesh, 'topo', 'myo.reg'), np.uint8)
        fr = reg[idx]
        # a face takes the region most of its vertices have
        face_reg = np.where(fr[:, 1] == fr[:, 2], fr[:, 1], fr[:, 0])
        keys = sorted(MAT)
        lut = {k: i for i, k in enumerate(keys)}
        fm = np.array([lut.get(int(r), lut[1]) for r in face_reg], dtype=np.int32)
        ob = make(name, pos, idx, [MAT[k] for k in keys], fm)
    elif 'Chordae' in name:
        ob = make(name, pos, idx, [CHORD if ('Tricuspid' if TRI else 'Mitral') in name and not TAV else CHORD_CUT])
    elif name == 'Papillary':
        ob = make(name, pos, idx, [MAT[2] if TRI else MAT[1]])
    elif name.startswith('skirt_') and ('Aortic' in name or 'Pulmonary' in name):
        ob = make(name, pos, idx, [MAT[5]])
    elif TAV:
        # TAVR: the aortic valve stays whole in the cut root; the others go with the walls
        ob = make(name, pos, idx, [VALVE if 'Aortic' in name else VALVE_CUT])
    else:
        # the tricuspid valve is cut with the walls, so its leaflets show in section round the clip
        ob = make(name, pos, idx, [VALVE_CUT if TRI or 'Mitral' not in name else VALVE])
    tissue[name] = ob

# ---------------------------------------------------------------- the camera and the lights
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.clip_start = 0.002
cam.data.lens = 70

def aim(ob, at, up=Vector((0, 0, 1))):
    fwd = (at - ob.location).normalized()
    right = fwd.cross(up).normalized()
    up2 = right.cross(fwd)
    ob.rotation_euler = Matrix((right, up2, -fwd)).transposed().to_euler()

# the camera's framing for each step: the point it looks at and the field's width there (cm),
# from the front, a little from above and from the right (the patient's right is -x)
def framing(f):
    Q, Cf, Sf, N = V(f['Q']), V(f['C']), V(f['S']), Vector((f['N'][0], -f['N'][2], f['N'][1])).normalized()
    s = f['s']
    # (step, the point looked at, the field's width in cm, the camera's height over the cut)
    keys = [
        (0, Q + N * 0.008, 10.0, 0.5),
        (1, (Sf * 0.65 + Cf * 0.35), 9.0, 0.3),
        (2, (Sf * 0.45 + Q * 0.55) + N * 0.006, 8.5, 0.55),
        (3, Q + N * 0.011, 6.5, 0.7),
        (4, Q + N * 0.004, 5.5, 0.75),
        (5, Q + N * 0.002, 5.5, 0.95),
        (6, Q + N * 0.004, 6.5, 0.95),
        (7, Q + N * 0.002, 7.0, 1.0),
    ]
    i = max(0, min(len(keys) - 2, int(math.floor(s))))
    a, b = keys[i], keys[i + 1]
    u = max(0.0, min(1.0, s - a[0]))
    u = u * u * (3 - 2 * u)
    return a[1].lerp(b[1], u), a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u

def framing_tri(f):
    Q, Q0, Cf, N = V(f['Q']), V(f['Q0']), V(f['C']), Vector((f['N'][0], -f['N'][2], f['N'][1])).normalized()
    tip = V(f['tip']) if f.get('tip') else Q + N * 0.03
    s = f['s']
    # (step, the point looked at, the field's width in cm, the camera's height over the cut)
    keys = [
        (0, Q0 + N * 0.004, 9.5, 0.25),
        (1, (tip * 0.45 + Q * 0.55), 11.0, 0.3),
        (2, Q + N * 0.01, 8.0, 0.3),
        (3, Q + N * 0.005, 6.5, 0.35),
        (4, Q + N * 0.001, 5.5, 0.3),
        (5, Q + N * 0.001, 5.5, 0.3),
        (6, Q + N * 0.004, 6.5, 0.3),
        (7, Q0 + N * 0.003, 9.0, 0.3),
    ]
    i = max(0, min(len(keys) - 2, int(math.floor(s))))
    a, b = keys[i], keys[i + 1]
    u = max(0.0, min(1.0, s - a[0]))
    u = u * u * (3 - 2 * u)
    return a[1].lerp(b[1], u), a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u

def framing_tav(f):
    C, ax = V(f['C']), D3(f['n'])
    s = f['s']
    # (step, the point looked at, the field's width in cm, the camera's height over the cut)
    keys = [
        (0, C + ax * 0.004, 6.5, 0.3),
        (1, C + ax * 0.002, 5.0, 0.25),
        (2, C - ax * 0.008, 7.5, 0.35),
        (3, C + ax * 0.005, 5.5, 0.3),
        (4, C + ax * 0.006, 5.0, 0.35),
        (5, C + ax * 0.004, 6.0, 0.4),
    ]
    i = max(0, min(len(keys) - 2, int(math.floor(s))))
    a, b = keys[i], keys[i + 1]
    u = max(0.0, min(1.0, s - a[0]))
    u = u * u * (3 - 2 * u)
    return a[1].lerp(b[1], u), a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u

def place(f):
    at, width, lift = framing_tav(f) if TAV else framing_tri(f) if TRI else framing(f)
    cam_o = f.get('cam') or {}
    if 'at' in cam_o:
        at = V(cam_o['at'])
    width = cam_o.get('width', width * args.fieldk)
    set_cut(cam_o.get('cut', 0.0))
    view = (CUT_N + Vector((0, 0, lift)) + (Vector((0, 0, 0)) if TRI else Vector((-0.18, 0, 0)))).normalized()
    # a frame's own turn of the view: yaw about the body's up axis, pitch toward it
    if cam_o.get('yaw'):
        view = Matrix.Rotation(math.radians(cam_o['yaw']), 3, 'Z') @ view
    if cam_o.get('pitch'):
        side = view.cross(Vector((0, 0, 1))).normalized()
        view = Matrix.Rotation(math.radians(cam_o['pitch']), 3, side) @ view
    dist = 0.36
    cam.location = at + view * dist
    aim(cam, at)
    # the field at the target, from top to bottom (a wider frame shows more at the sides): the
    # sensor's height over the lens's focal length
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 36
    cam.data.lens = 36 * dist / (width * 0.01)
    cam.data.shift_y = args.shift_y
    return at

def light(name, d, energy, col, size):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    L.data.energy = energy
    L.data.size = size
    L.data.color = col
    sc.collection.objects.link(L)
    return L, d
LIGHTS = [light('key', Vector((-0.5, -0.6, 0.65)), 4.5, (1.0, 0.94, 0.88), 0.14),
          light('fill', Vector((0.7, -0.5, 0.1)), 1.4, (0.78, 0.86, 1.0), 0.22),
          light('rim', Vector((0.2, 0.9, 0.5)), 3.5, (1.0, 0.86, 0.84), 0.1)]
def lights(at):
    for L, d in LIGHTS:
        L.location = at + d.normalized() * 0.3
        aim(L, at)

# ---------------------------------------------------------------- each frame
device = []
for f in frames:
    t0 = time.time()
    for name, ob in tissue.items():
        pos = to_blender(read(os.path.join(args.mesh, f['name'], f'{name}.pos'), np.float32))
        ob.data.vertices.foreach_set('co', pos.reshape(-1).astype(np.float32))
        ob.data.update()
        # a valve the device has replaced (TAVR's native valve, once the frame expands)
        ob.hide_render = name in f.get('hide', [])
    for ob in device:
        bpy.data.objects.remove(ob, do_unlink=True)
    device = []
    for k in f['parts']:
        pos = to_blender(read(os.path.join(args.mesh, f['name'], f'dev_{k}.pos'), np.float32))
        idx = read(os.path.join(args.mesh, f['name'], f'dev_{k}.idx'), np.uint32).reshape(-1, 3)
        device.append(make(f'dev_{k}', pos, idx, [dev_mat(k)]))
    at = place(f)
    lights(at)
    # the landmarks' places in the frame (px from the top left, and the depth in m), for labels
    bpy.context.view_layer.update()
    marks = {k: f.get(k) for k in ('Q', 'Q0', 'clipTop', 'tip')}
    marks.update({k: G.get(k) for k in ('ra', 'tv', 'ivc', 'svc', 'av', 'apex')})
    rx, ry = sc.render.resolution_x, sc.render.resolution_y
    proj = {}
    for k, p in marks.items():
        if p:
            v = world_to_camera_view(sc, cam, V(p))
            proj[k] = [round(v.x * rx, 1), round((1 - v.y) * ry, 1), round(v.z, 4)]
    with open(os.path.join(args.out, f"{f['name']}.json"), 'w') as fh:
        json.dump(proj, fh)
    sc.render.filepath = os.path.join(args.out, f"{f['name']}.png")
    bpy.ops.render.render(write_still=True)
    print(f"{f['name']}: {time.time() - t0:.1f} s", flush=True)
