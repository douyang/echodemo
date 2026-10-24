"""The patient's body from the CC0 Human Base Meshes (Blender Studio, v1.4.1): the realistic male
body and the realistic skeleton, read from the bundle's .blend without running its scripts.

The bundle's skeleton does not match its body as a whole (2 to 12% of its points fall outside
the skin at any one scale), so two units of it are fitted into the body separately
(tools/fit_landmarks.py): the pelvis (hip bones, sacrum, coccyx, lumbar spine, the top of each
femur) and the thorax (rib cage, thoracic spine), each by the soft tissue over palpable
landmarks. The femurs then turn about their heads to lie along the thighs.

The body's trunk is short against adult proportions: 43.9 cm from the jugular notch to the hip
joints at a height of 1.69 m, where ANSUR II men measure about 51 cm at 1.76 m (suprasternale
and trochanterion heights). The heart model's frame keeps the site's layout (anat.py: the notch
51.5 cm above the femoral heads), so the body is scaled by 1.04 and its trunk stretched along its
length between the notch and the hip joints: a man of about 1.82 m.
"""
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

BODY = 'GEO-body_male_realistic'
SKEL = 'GEO-skeletion.'
SCALE = 104.0                 # cm per bundle metre, outside the trunk
NOTCH_Z = 1.355               # the jugular notch on the body's skin (bundle frame, m)
# the units' fits (tools/fit_landmarks.py): scale, tilt about X (degrees), offsets (m)
FITS = {
    'pelvis': dict(s=0.885, pitch=-7.5, dy=-0.0025, dz=-0.025),
    'thorax': dict(s=0.890, pitch=0.8, dy=-0.0075, dz=-0.075),
}


def load(path, body_level=2):
    """Link the body and every skeleton part into the current scene; return {name: object}."""
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [BODY, BODY + '.eye.L', BODY + '.eye.R'] + [n for n in src.objects if n.startswith(SKEL)]
    sc = bpy.context.scene
    out = {}
    for o in dst.objects:
        if o is None:
            continue
        sc.collection.objects.link(o)
        out[o.name] = o
    for m in out[BODY].modifiers:
        if m.type == 'MULTIRES':
            m.levels = m.render_levels = body_level
    bpy.context.view_layer.update()
    return out


def world_verts(o):
    """The evaluated mesh of o (its modifiers applied) in world space: (V, faces)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    M = np.array(ev.matrix_world)
    V = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    F = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return V, F


def sphere_fit(P):
    """Least-squares sphere through the points P: (centre, radius)."""
    A = np.c_[2 * P, np.ones(len(P))]
    x = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
    return x[:3], float(np.sqrt(x[3] + x[:3] @ x[:3]))


def landmarks(bones):
    """The skeleton's landmarks in the bundle's frame (m), from {part: vertices}."""
    L = {}
    hip = bones['hip']
    x0 = float(np.median(hip[:, 0]))
    L['midline_x'] = x0
    for side in ('R', 'L'):
        V = bones['leg_femur.' + side]
        top = V[V[:, 2] > V[:, 2].max() - 0.07]
        med = top[np.abs(top[:, 0] - x0) < np.median(np.abs(top[:, 0] - x0))]
        L['fhead_' + side], L['fhead_r_' + side] = sphere_fit(med)
    fz = (L['fhead_R'][2] + L['fhead_L'][2]) / 2
    for side, sgn in (('R', -1), ('L', 1)):
        S = hip[np.sign(hip[:, 0] - x0) == sgn]
        crest = S[(S[:, 2] > fz + 0.04) & (np.abs(S[:, 0] - x0) > 0.07)]
        L['asis_' + side] = crest[np.argmin(crest[:, 1])]
        # the pubic tubercle: the top of the pubic crest, 1.8 to 3.2 cm from the midline
        pub = S[(np.abs(S[:, 0] - x0) > 0.018) & (np.abs(S[:, 0] - x0) < 0.032) & (S[:, 2] < fz + 0.03)
                & (S[:, 1] < np.percentile(S[:, 1], 20))]
        L['tubercle_' + side] = pub[np.argmax(pub[:, 2])]
    front = hip[(np.abs(hip[:, 0] - x0) < 0.01) & (hip[:, 2] < fz + 0.03)]
    L['symphysis'] = front[np.argmax(front[:, 2])]
    rib = bones['ripcage']
    fr = rib[(np.abs(rib[:, 0] - x0) < 0.012) & (rib[:, 1] < np.percentile(rib[:, 1], 30))]
    L['manubrium_top'] = fr[np.argmax(fr[:, 2])]
    return L


def unit_points(bones, L, unit):
    """The points of a unit, as its fit took them."""
    fz = L['fhead_R'][2]
    if unit == 'pelvis':
        keep = [bones['hip'], bones['sacral'], bones['coccygeal']]
        keep += [V for n, V in bones.items() if n.startswith('spine_lumbar')]
        keep += [bones[f][bones[f][:, 2] > fz - 0.08] for f in ('leg_femur.R', 'leg_femur.L')]
    else:
        keep = [bones['ripcage']] + [V for n, V in bones.items() if n.startswith('spine_thoracic')]
    return np.vstack(keep)


def unit_transform(bones, L, unit):
    """Bundle skeleton frame -> body frame (x centred on the body's midline), for a unit."""
    f = FITS[unit]
    c = unit_points(bones, L, unit).mean(0)
    R = np.array(Matrix.Rotation(np.radians(f['pitch']), 3, 'X'))
    off = np.array([c[0] - L['midline_x'], c[1] + f['dy'], c[2] + f['dz']])
    return lambda P: (np.asarray(P) - c) @ R.T * f['s'] + off


class Warp:
    """Body frame (m, x centred) -> the heart model's standing frame (cm): scale SCALE, the trunk
    stretched between the hip joints (z_h) and the notch so that they lie at fh_z and notch_z."""

    def __init__(self, z_h, notch_z, fh_z, xm, y0):
        self.xm, self.y0 = xm, y0
        zs = np.linspace(-0.05, 1.9, 3901)
        ramp = lambda u: np.clip(u, 0, 1) ** 2 * (3 - 2 * np.clip(u, 0, 1))
        w = ramp((zs - (z_h - 0.04)) / 0.08) * (1 - ramp((zs - (NOTCH_Z - 0.04)) / 0.08))
        dz = zs[1] - zs[0]
        # the slope SCALE * (1 + k w); k so that the trunk spans notch_z - fh_z
        inside = (zs >= z_h) & (zs <= NOTCH_Z)
        k = ((notch_z - fh_z) / SCALE - (NOTCH_Z - z_h)) / (w[inside].sum() * dz)
        g = SCALE * (1 + k * w)
        F = np.r_[0, np.cumsum(0.5 * (g[1:] + g[:-1]) * dz)]
        F += notch_z - np.interp(NOTCH_Z, zs, F)
        self.zs, self.F, self.k = zs, F, k

    def __call__(self, P):
        P = np.asarray(P, float)
        z = np.interp(P[..., 2], self.zs, self.F)
        return np.stack([self.xm + SCALE * P[..., 0], self.y0 + SCALE * P[..., 1], z], -1)


def align_femur(V, head, thigh_dir):
    """Turn a femur (its points V) about its head so that its shaft runs along thigh_dir."""
    lo = V[V[:, 2] < np.percentile(V[:, 2], 3)].mean(0)       # the knee end
    a = (lo - head) / np.linalg.norm(lo - head)
    b = thigh_dir / np.linalg.norm(thigh_dir)
    R = np.array(Vector(a).rotation_difference(Vector(b)).to_matrix())
    return (V - head) @ R.T + head


def thigh_axis(BV, side, z0, z1, xc):
    """The thigh's centre line between heights z0 > z1 (body frame): its direction, from the
    centroids of the skin's cross-sections on the given side."""
    C = []
    for z in np.linspace(z0, z1, 7):
        s = BV[np.abs(BV[:, 2] - z) < 0.004]
        s = s[np.sign(s[:, 0] - xc) == side]
        s = s[np.abs(s[:, 0] - xc) < 0.25]                      # not the hand
        C.append([s[:, 0].mean(), s[:, 1].mean(), z])
    C = np.array(C)
    d = np.linalg.svd(C - C.mean(0))[2][0]
    return d if d[2] < 0 else -d, C


def build(path, heart_front, fh_z, notch_z, xm, gap=2.4, body_level=2):
    """The body and the bones in the heart model's standing frame (cm). heart_front: the heart's
    most anterior point; the skin lies `gap` cm in front of it. Returns meshes and landmarks."""
    objs = load(path, body_level)
    BV, BF = world_verts(objs[BODY])
    xb = float(np.median(BV[:, 0]))
    BV = BV - [xb, 0, 0]
    bones = {n.replace(SKEL, ''): world_verts(o) for n, o in objs.items() if n.startswith(SKEL)}
    bv = {n: v[0] for n, v in bones.items()}
    L = landmarks(bv)
    Tp, Tt = unit_transform(bv, L, 'pelvis'), unit_transform(bv, L, 'thorax')
    fh = {s: Tp(L['fhead_' + s]) for s in 'RL'}
    z_h = (fh['R'][2] + fh['L'][2]) / 2
    W = Warp(z_h, notch_z, fh_z, xm, 0.0)
    # the depth: skin `gap` cm in front of the heart's front
    bvh = BVHTree.FromPolygons([Vector(v) for v in W(BV)], BF)
    hf = np.asarray(heart_front, float)
    hit = bvh.ray_cast(Vector((hf[0], hf[1] - 60.0, hf[2])), Vector((0, 1, 0)), 120.0)
    y0 = (hf[1] - gap) - hit[0].y
    W = Warp(z_h, notch_z, fh_z, xm, y0)
    out = {'body': (W(BV), BF), 'warp': W, 'bones': {}}
    for e in ('eye.L', 'eye.R'):
        V, F = world_verts(objs[BODY + '.' + e])
        out[e] = (W(V - [xb, 0, 0]), F)
    PEL = ['hip', 'sacral', 'coccygeal'] + [n for n in bones if n.startswith('spine_lumbar')]
    THO = ['ripcage'] + [n for n in bones if n.startswith('spine_thoracic')]
    for n in PEL:
        out['bones'][n] = (W(Tp(bv[n])), bones[n][1])
    for n in THO:
        out['bones'][n] = (W(Tt(bv[n])), bones[n][1])
    for s, sgn in (('R', -1), ('L', 1)):
        d, _ = thigh_axis(BV, sgn, z_h - 0.10, z_h - 0.38, 0.0)
        V = align_femur(Tp(bv['leg_femur.' + s]), fh[s], d)
        out['bones']['leg_femur.' + s] = (W(V), bones['leg_femur.' + s][1])
    lm = {k: W(Tp(L[k])) for k in ('fhead_R', 'fhead_L', 'asis_R', 'asis_L', 'tubercle_R', 'tubercle_L', 'symphysis')}
    lm['fhead_r'] = L['fhead_r_R'] * FITS['pelvis']['s'] * SCALE
    lm['manubrium_top'] = W(Tt(L['manubrium_top']))
    out['landmarks'] = lm
    for o in objs.values():
        bpy.data.objects.remove(o, do_unlink=True)
    return out
