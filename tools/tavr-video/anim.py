"""The TAVR video's Blender shots: the scene, the devices and a timeline in seconds. Every frame is
a function of its time alone (update(t)), so any frame renders on its own.

    python anim.py --still 6.5,13,22 --out look/s1 [--engine workbench] [--res 1216x486]
    python anim.py --shot access --out frames/access [--samples 16]

Times follow the video's storyboard (the composite places these frames at the same seconds).
"""
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import anat as A  # noqa: E402
import devices as D  # noqa: E402
import geo as G  # noqa: E402
import mats  # noqa: E402
import scene  # noqa: E402

FPS = 30
SUPINE = Matrix.Rotation(-np.pi / 2, 4, 'X')
SM = D.smooth


def ease(t, a, b):
    """0 before a, 1 after b, a smooth step between."""
    return float(SM((t - a) / (b - a)))


# ---------------------------------------------------------------- the storyboard (s)
SHOTS = {
    'title': (0.0, 4.0), 'access': (4.0, 16.0), 'pacing': (16.0, 19.0), 'cross': (19.0, 26.0),
    'sheathpass': (34.0, 37.0), 'align': (37.0, 40.0), 'arch': (40.0, 44.0),
    'position': (44.0, 52.0), 'deploy': (52.0, 62.0), 'withdraw': (72.0, 74.5), 'close': (74.5, 77.0),
}
SPLIT = {'position', 'deploy'}          # left half of the card: the TEE view takes the right


def shot_at(t):
    for k, (a, b) in SHOTS.items():
        if a <= t < b:
            return k
    return None


# ---------------------------------------------------------------- the heart's rhythm
RR = 60 / 70
PACE_ON, PACE_OFF = 52.0, 61.0
RR_PACE = 60 / 180


def rhythm(t):
    """Systole (0..1) and the share of the cycle in ejection, at time t: 70 per minute, and
    180 per minute with little motion under rapid pacing."""
    pacing = PACE_ON <= t < PACE_OFF
    period = RR_PACE if pacing else RR
    ph = (t % period) / period
    if pacing:
        sys_ = 0.12 * np.sin(np.pi * ph) ** 2
        eject = 0.0
    else:
        rise = SM((ph - 0.04) / 0.30)
        fall = SM((ph - 0.42) / 0.16)
        sys_ = float(rise * (1 - fall))
        eject = float(SM((ph - 0.10) / 0.06) * (1 - SM((ph - 0.40) / 0.06)))
    return sys_, eject


# ---------------------------------------------------------------- the rig
class Rig:
    def __init__(self, res=(1216, 486)):
        S = scene.build()
        self.S, self.sc, self.M, self.root = S, S['sc'], S['M'], S['root']
        self.sc.render.resolution_x, self.sc.render.resolution_y = res
        self.devc = S['C']['Devices']
        self.heart = [o for o in S['C']['Anatomy'].objects if o.type == 'MESH' and o.data.shape_keys]
        self.myo, self.av = S['myo'], S['av']
        self.ra, self.rb, self.rc = D.rail_a(), D.rail_b(), D.rail_c()
        ra = self.ra
        self.s_p = ra.nearest(A.PUNCTURE_R)
        self.s_bif = ra.nearest(A.AORTIC_BIF)
        self.s_ann = ra.nearest(A.AV)
        self.s_desc = ra.nearest(np.array([0.30, 5.70, -8.0]))
        self.s_skin = self.skin_crossing(ra, 0.0, self.s_p)
        self.s_skin_c = self.skin_crossing(self.rc, 0.0, self.rc.nearest(A.VEIN_PUNCTURE_R))
        self.s_skin_b = self.skin_crossing(self.rb, 0.0, self.rb.nearest(A.mirror(A.PUNCTURE_R)))
        print('rail A %.1f cm: skin %.1f puncture %.1f bifurcation %.1f desc %.1f annulus %.1f' % (
            ra.L, self.s_skin, self.s_p, self.s_bif, self.s_desc, self.s_ann))
        self.wall = self.root_wall()
        self.pushed_key()
        self.make_devices()
        self.make_cut()
        self.cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
        S['C']['Cameras'].objects.link(self.cam)
        self.sc.camera = self.cam

    # -------------------------------------------------------- measurements of the scene
    def skin_crossing(self, rail, s0, s1):
        """Arc length where the rail enters the body's skin, by a ray cast along it."""
        body = self.S['body']
        me = body.data
        bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
        a = rail.at(s0)[0]
        b = rail.at(s1)[0]
        d = Vector(b - a)
        hit = bvh.ray_cast(Vector(a), d.normalized(), d.length)
        if hit[0] is None:
            return s1 - 3.0
        return s0 + hit[3]

    def root_wall(self):
        hs, R, e1, e2 = scene.wall_table(self.myo, A.AV, A.ROOT)
        # rays that missed: the column's neighbours
        for i in range(R.shape[0]):
            row = R[i]
            if np.all(np.isnan(row)):
                R[i] = 2.0
                continue
            idx = np.arange(len(row))
            ok = ~np.isnan(row)
            R[i] = np.interp(idx, idx[ok], row[ok], period=len(row))
        self.wall_h, self.wall_R, self.wall_e1, self.wall_e2 = hs, R, e1, e2
        print('root wall radius at the annulus %.2f cm, 1 cm above %.2f cm' % (
            np.median(R[np.argmin(abs(hs))]), np.median(R[np.argmin(abs(hs - 1.0))])))
        return R

    def wall_at(self, h, dirs):
        """The root's inner radius at height h (cm above the annulus) toward world directions dirs."""
        a = np.arctan2(dirs @ self.wall_e2, dirs @ self.wall_e1) % (2 * np.pi)
        j = a / (2 * np.pi) * self.wall_R.shape[1]
        i = np.clip((h - self.wall_h[0]) / (self.wall_h[1] - self.wall_h[0]), 0, len(self.wall_h) - 1)
        i0, j0 = np.floor(i).astype(int), np.floor(j).astype(int) % self.wall_R.shape[1]
        i1, j1 = np.minimum(i0 + 1, len(self.wall_h) - 1), (j0 + 1) % self.wall_R.shape[1]
        fi, fj = i - np.floor(i), j - np.floor(j)
        R = self.wall_R
        return (R[i0, j0] * (1 - fj) + R[i0, j1] * fj) * (1 - fi) + (R[i1, j0] * (1 - fj) + R[i1, j1] * fj) * fi

    def pushed_key(self):
        """A shape key on the native valve: its leaflets open and pressed out against the frame."""
        av = self.av
        keys = av.data.shape_keys.key_blocks
        n = len(av.data.vertices)
        base = np.zeros(n * 3)
        keys['leaflets'].data.foreach_get('co', base)
        P = base.reshape(-1, 3)
        rel = P - A.AV
        h = rel @ A.ROOT
        radial = rel - np.outer(h, A.ROOT)
        r = np.linalg.norm(radial, axis=1)
        dirs = radial / np.maximum(r, 1e-6)[:, None]
        target = np.minimum(D.R_EXP, self.wall_at(h, dirs) - 0.03) + 0.13
        r2 = np.maximum(r, target)
        Q = A.AV + np.outer(h, A.ROOT) + dirs * r2[:, None]
        k = av.shape_key_add(name='pushed', from_mix=False)
        k.data.foreach_set('co', Q.ravel())

    # -------------------------------------------------------- devices
    def obj(self, name, V, F, mat, smooth=True):
        o = scene.mesh_obj(name, V, F, self.M[mat], self.devc, self.root, smooth)
        return o

    def make_devices(self):
        ra, rb, rc = self.ra, self.rb, self.rc
        M = self.M
        self.t_wire = D.RailTube(ra, 1400, 8)
        self.wire = self.obj('Wire', self.t_wire.verts(0, 1, 0.045), self.t_wire.F, 'wire')
        self.t_sheath = D.RailTube(ra, 520, 28)
        self.sheath = self.obj('Sheath', self.t_sheath.verts(0, 1, 0.315), self.t_sheath.F, 'sheath')
        self.t_cath = D.RailTube(ra, 700, 12)
        self.cath = self.obj('Catheter', self.t_cath.verts(0, 1, 0.1), self.t_cath.F, 'pigtail')
        self.t_flex = D.RailTube(ra, 800, 24)
        self.flex = self.obj('Flex', self.t_flex.verts(0, 1, 0.23), self.t_flex.F, 'shaft')
        self.t_inner = D.RailTube(ra, 160, 12)
        self.inner = self.obj('Inner', self.t_inner.verts(0, 1, 0.07), self.t_inner.F, 'shaft')
        self.t_pig = D.RailTube(rb, 1300, 10)
        self.pig = self.obj('Pigtail', self.t_pig.verts(0, 1, 0.1), self.t_pig.F, 'pigtail')
        self.t_lead = D.RailTube(rc, 1100, 10)
        self.lead = self.obj('Lead', self.t_lead.verts(0, 1, 0.08), self.t_lead.F, 'lead')
        self.t_proglide = D.RailTube(ra, 120, 20)
        self.proglide = self.obj('ProGlide', self.t_proglide.verts(0, 1, 0.21), self.t_proglide.F, 'hub')
        self.t_glow = D.RailTube(ra, 900, 16)
        self.glow = self.obj('Glow', self.t_glow.verts(0, 1, 0.42), self.t_glow.F, 'glow')
        # the pacing shot: the lead's course lit, as the arterial route in the title
        self.t_lglow = D.RailTube(rc, 700, 12)
        self.lglow = self.obj('LeadGlow', self.t_lglow.verts(0, 1, 0.3), self.t_lglow.F, 'glow')
        # rigid parts, built straight on local z and laid on the rail each frame
        Vb, Fb = G.revolve(D.balloon_profile(0), 48)
        self.balloon = self.obj('Balloon', Vb, Fb, 'balloon')
        Vn, Fn = G.revolve(D.nose_profile(), 32)
        self.nose = self.obj('Nose', Vn, Fn, 'nose')
        Vh, Fh = G.revolve(np.array([[0.32, 0], [0.9, 0.4], [0.9, 4.0], [0.6, 4.6], [0.6, 6.0]]), 32)
        self.hub = self.obj('SheathHub', Vh, Fh, 'hub')
        Vnd, Fnd = G.revolve(np.array([[0.0, -0.25], [0.045, 0.0], [0.045, 7.0], [0.3, 7.1], [0.3, 8.6], [0.18, 9.0]]), 16)
        self.needle = self.obj('Needle', Vnd, Fnd, 'needle')
        self.needle.data.materials.append(M['needlehub'])
        mi = [1 if i >= 2 * 16 else 0 for i in range(len(Fnd))]   # rows 3-5: the hub
        self.needle.data.polygons.foreach_set('material_index', mi)
        Vt, Ft = G.revolve(np.array([[0.0, 0.0], [0.085, 0.05], [0.085, 0.35], [0.0, 0.42]]), 12)
        self.electrode = self.obj('Electrode', Vt, Ft, 'electrode')
        # the valve
        nodes, edges = D.frame_lattice()
        Vf, _ = D.frame_nodes(0)
        me = bpy.data.meshes.new('Frame')
        me.from_pydata([tuple(v) for v in Vf], edges, [])
        self.frame = bpy.data.objects.new('Frame', me)
        self.devc.objects.link(self.frame)
        self.frame.parent = self.root
        self.frame.data.materials.append(M['cobalt'])
        sk = self.frame.modifiers.new('skin', 'SKIN')
        sk.use_smooth_shade = True
        for v in me.skin_vertices[0].data:
            v.radius = (D.STRUT, D.STRUT)
        sub = self.frame.modifiers.new('sub', 'SUBSURF')
        sub.levels = sub.render_levels = 1
        Vs, Fs = D.skirt_verts(0)
        self.skirt = self.obj('Skirt', Vs, Fs, 'pet')
        sol = self.skirt.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = 0.02
        Vl, Fl = D.leaflet_verts(0, 0)
        self.leaflets = self.obj('Leaflets', Vl, Fl, 'bovine')
        sol = self.leaflets.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = 0.03
        self.sutures = self.make_sutures()

    def make_sutures(self):
        """Two preclosure sutures: four strands from the arteriotomy out along the tract."""
        P, T, N, B = self.ra.at(self.s_p)
        objs = []
        for k, a in enumerate([0.5, 1.2, 2.0, 2.7]):
            off = 0.36 * (np.cos(a) * N + np.sin(a) * B)
            pts = [P + off]
            for d in np.linspace(0.6, 9.0, 14):
                q = self.ra.at(self.s_p - d)[0] + off * (1.0 + 0.4 * d / 9) + np.array([0, 0, -0.05 * d])
                pts.append(q)
            pts = np.array(pts)
            V = G.tube_verts(pts, 0.025, 8)
            o = self.obj(f'Suture{k}', V, G.tube_faces(len(pts), 8), 'suture')
            o['pts'] = pts.ravel().tolist()
            objs.append(o)
        return objs

    def make_cut(self):
        """The cutaway: a box beyond the plane of the LV and root axes, toward the camera side."""
        n = G.unit(np.cross(A.ROOT, A.LV_AXIS))           # right, anterior, inferior
        self.cut_n = n
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.object
        c.name = 'Cutter'
        for col in list(c.users_collection):
            col.objects.unlink(c)
        self.devc.objects.link(c)
        c.parent = self.root
        c.scale = (60, 60, 60)
        R = Matrix(((*G.unit(np.cross(n, A.ROOT)),), (*A.ROOT,), (*n,))).transposed()
        c.matrix_basis = Matrix.Translation(Vector(A.AV + n * (30 + 0.25))) @ R.to_4x4() @ Matrix.Diagonal((60, 60, 60, 1))
        c.data.materials.append(self.M['cut'])
        c.hide_render = True
        c.display_type = 'WIRE'
        self.cutter = c
        self.cut_mods = []
        # the myocardium is closed but for a few 3-vertex holes: fill them, then cut it with a
        # boolean (its cut face takes the cutter's material); the open meshes (valves, chordae,
        # coronaries) lose their faces beyond the plane (a geometry-nodes clip)
        import bmesh
        me = self.myo.data
        bm = bmesh.new()
        bm.from_mesh(me)
        edges = [e for e in bm.edges if e.is_boundary]
        bmesh.ops.holes_fill(bm, edges=edges, sides=8)
        bm.to_mesh(me)
        bm.free()
        m = self.myo.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.material_mode = 'TRANSFER'
        m.use_hole_tolerant = True
        m.object = c
        self.cut_mods.append(m)
        clip = clip_group(Vector(tuple(A.AV + n * 0.25)), Vector(tuple(n)))
        for o in self.heart:
            if o is self.myo:
                continue
            g = o.modifiers.new('cut', 'NODES')
            g.node_group = clip
            self.cut_mods.append(g)

    # -------------------------------------------------------- per-frame placement
    def heart_offset(self, sys_):
        return sys_ * (A.AV_ES - A.AV)

    def follow(self, s, sys_):
        """The heart's motion carried by the devices near the root (weight 1 below the sinotubular
        junction, 0 in the arch)."""
        w = SM((s - (self.s_ann - 7.0)) / 4.0)
        return np.outer(w, self.heart_offset(sys_))

    def lay_valve(self, V, s_in, sys_):
        """Local valve points (z from the inflow toward the aorta) laid on rail A."""
        V = np.asarray(V, float)
        s = s_in - V[:, 2]
        P, T, N, B = self.ra.at(s)
        W = P + V[:, :1] * N - V[:, 1:2] * B
        return W + self.follow(s, sys_)

    def lay_rigid(self, V, s0, sys_, flip=False):
        V = np.asarray(V, float)
        s = s0 + (V[:, 2] if not flip else -V[:, 2])
        P, T, N, B = self.ra.at(s)
        W = P + V[:, :1] * N + (V[:, 1:2] if not flip else -V[:, 1:2]) * B
        return W + self.follow(s, sys_)

    def frame_wall(self, s_in):
        """The wall function the frame sees with its inflow at s_in: local (z, angle) -> radius."""
        h_in = self.s_ann - s_in
        P, T, N, B = self.ra.at(np.array([s_in]))
        N, B = N[0], B[0]

        def f(z, a):
            d = np.cos(a) * N - np.sin(a) * B
            return float(self.wall_at(np.array([h_in + z]), d[None, :])[0]) - 0.03
        return f

    # -------------------------------------------------------- the state at time t
    def state(self, t):
        """Every moving thing as numbers: arc lengths of tips and ends, expansion, visibility."""
        st = {}
        sp, sk, sb, sa = self.s_p, self.s_skin, self.s_bif, self.s_ann
        L = self.ra.L
        # needle: in 5.0-7.0, out 9.0-9.8
        st['needle'] = 5.0 <= t < 9.8
        tip = sk - 1.2 + (sp + 0.25 - (sk - 1.2)) * ease(t, 5.2, 7.0)
        tip -= 7.0 * ease(t, 9.0, 9.8)
        st['needle_tip'] = tip
        # wire: the access wire to the iliac (7.5-9), the stiff wire later to the apex
        w1 = sp - 1.0 + 14.0 * ease(t, 7.5, 9.0)
        if t >= 16.0:
            w1 = sa - 2.5 + 5.0 * ease(t, 19.6, 21.2)
            w1 += (L - (sa + 2.5)) * ease(t, 21.6, 24.6)
        if t >= 72.0:
            # the stiff wire leaves the LV with the delivery system; a wire stays in the artery until
            # the sutures close it (ACC TAVR Handbook ch. 10), then comes out (76.4-77.0)
            w1 = L - (L - (sa - 8)) * ease(t, 72.6, 74.2)
            w1 -= (sa - 8 - (sk - 3)) * ease(t, 76.4, 77.0)
        st['wire'] = 7.5 <= t < 77.0
        st['wire_end'] = w1
        # diagnostic catheter (cross shot): 2 cm behind the wire to the valve, then back out
        st['cath'] = 19.0 <= t < 26.0
        st['cath_tip'] = min(sa - 1.2, w1 - 2.0) - 8.0 * ease(t, 23.0, 25.5)
        # ProGlide: in 9.8-10.6, out 11.0-11.6; the sutures from 11.0 to the end of the closure
        st['proglide'] = 9.8 <= t < 11.6
        st['proglide_tip'] = sk - 2 + (sp + 0.8 - (sk - 2)) * ease(t, 9.8, 10.6) - 9 * ease(t, 11.0, 11.6)
        st['sutures'] = 11.0 <= t
        st['tighten'] = ease(t, 75.6, 76.4)
        # sheath: in 12.0-15.5; out 74.6-75.6
        st['sheath'] = 12.0 <= t < 75.6
        stip = sk - 0.5 + (sb + 2.0 - (sk - 0.5)) * ease(t, 12.2, 15.5)
        stip -= (sb + 2.0 - (sk - 1.0)) * ease(t, 74.6, 75.6)
        st['sheath_tip'] = stip
        st['sheath_len'] = 34.0
        # delivery system: valve centre along rail A (crimped valve 2.7 cm long)
        sv = None
        if 34.0 <= t < 37.0:
            sv = (stip - 34.0) - 2.5 + (sp + 9.0 - ((stip - 34.0) - 2.5)) * ease(t, 34.3, 36.8)
        elif 37.0 <= t < 40.0:
            sv = self.s_desc
        elif 40.0 <= t < 44.0:
            sv = self.s_desc + (sa - 0.45 - self.s_desc) * ease(t, 40.0, 43.4)
        elif 44.0 <= t < 72.0:
            sv = sa - 0.45 + 0.18 * np.sin((t - 44.0) * 2.4) * (1 - ease(t, 45.5, 47.5))
        elif 72.0 <= t < 74.5:
            sv = sa - 0.45 - 16.0 * ease(t, 72.3, 74.0)
        st['valve'] = sv is not None
        st['valve_c'] = sv if sv is not None else 0.0
        # the balloon: distal to the valve until the alignment in the descending aorta (37.6-39.4)
        st['balloon_off'] = 2.85 * (1 - ease(t, 37.6, 39.4)) if t < 40.0 else 0.0
        # expansion and inflation: pacing from 52.0, balloon 53.5-56.5, hold 3 s, deflate 59.5-61.0
        e = ease(t, 53.5, 56.5)
        st['expand'] = e if t < 72.0 else 1.0
        st['inflate'] = e * (1 - ease(t, 59.5, 61.0)) if t < 72.0 else 0.0
        st['deployed'] = t >= 56.5
        # after deployment the valve stays at the annulus; the system withdraws (72.3-74.0)
        st['system_c'] = sv if sv is not None else 0.0
        if t >= 72.0:
            st['valve_c'] = sa - 0.45
        st['system'] = (34.0 <= t < 74.5)
        st['implant'] = (t >= 56.5)
        # pigtail in the noncoronary sinus from the wires shot on; pacing lead from 16.0
        st['pigtail'] = 19.0 <= t < 72.0
        st['lead'] = 16.0 <= t < 72.0
        rl = self.rc.L
        st['lead_tip'] = self.s_skin_c + 2 + (rl - self.s_skin_c - 2) * ease(t, 16.3, 18.8)
        # the glow along the path (title); it fades as the camera flies in to the groin
        st['glow'] = ease(t, 0.5, 3.4) if t < 4.8 else 0.0
        st['glow_a'] = 1.0 - ease(t, 4.0, 4.8)
        return st

    def update(self, t):
        sys_, eject = rhythm(t)
        st = self.state(t)
        shot = shot_at(t)
        # the heart beats
        for o in self.heart:
            kb = o.data.shape_keys.key_blocks
            if 'systole' in kb:
                kb['systole'].value = sys_
            if 'leaflets' in kb:
                if o.name.startswith('Aortic'):
                    kb['leaflets'].value = 0.32 * eject if not st['implant'] else 0.0
                elif o.name.startswith(('Mitral', 'Tricuspid')):
                    kb['leaflets'].value = sys_          # these close in systole
                else:
                    kb['leaflets'].value = eject
        kb = self.av.data.shape_keys.key_blocks
        kb['pushed'].value = st['expand']
        # devices
        self.place_devices(t, st, sys_, eject)
        # shot look: visibility, materials, cut, camera
        self.shot_look(t, shot, st)
        self.camera(t, shot)

    def show(self, o, on):
        o.hide_render = not on
        o.hide_viewport = not on

    def place_devices(self, t, st, sys_, eject):
        ra = self.ra
        fol = lambda s: self.follow(s, sys_)
        # needle (on the straight start of rail A)
        self.show(self.needle, st['needle'])
        if st['needle']:
            Vn, _ = G.revolve(np.array([[0.0, -0.25], [0.045, 0.0], [0.045, 7.0], [0.3, 7.1], [0.3, 8.6], [0.18, 9.0]]), 16)
            Vn[:, 2] = -Vn[:, 2]
            scene.set_verts(self.needle, self.lay_rigid(Vn, st['needle_tip'], 0.0))
        # wire
        self.show(self.wire, st['wire'])
        if st['wire']:
            s0 = min(-25.0, st['wire_end'] - 5)
            scene.set_verts(self.wire, self.t_wire.verts(s0, st['wire_end'], 0.045, fol))
        # catheter
        self.show(self.cath, st['cath'])
        if st['cath']:
            scene.set_verts(self.cath, self.t_cath.verts(-20.0, st['cath_tip'], 0.1, fol))
        # ProGlide and sutures
        self.show(self.proglide, st['proglide'])
        if st['proglide']:
            scene.set_verts(self.proglide, self.t_proglide.verts(st['proglide_tip'] - 22, st['proglide_tip'], 0.21))
        for o in self.sutures:
            self.show(o, st['sutures'])
            if st['sutures']:
                pts = np.array(o['pts']).reshape(-1, 3)
                k = st['tighten']
                q = pts.copy()
                q[1:4] = pts[1:4] + (pts[0] - pts[1:4]) * k * np.array([0.6, 0.4, 0.2])[:, None]
                scene.set_verts(o, G.tube_verts(q, 0.025, 8))
        # sheath and hub; the sheath widens where the crimped valve passes inside it
        self.show(self.sheath, st['sheath'])
        self.show(self.hub, st['sheath'])
        if st['sheath']:
            tip = st['sheath_tip']
            s0 = tip - st['sheath_len']
            sv = st['valve_c'] if (st['valve'] and st['system']) else -1e9

            def rad(s):
                r = 0.315 + 0.11 * np.exp(-((s - sv) / 1.6) ** 2)
                return r * (1 - 0.35 * SM((s - (tip - 0.6)) / 0.6))
            scene.set_verts(self.sheath, self.t_sheath.verts(s0, tip, rad))
            Vh, _ = G.revolve(np.array([[0.32, 0], [0.9, 0.4], [0.9, 4.0], [0.6, 4.6], [0.6, 6.0]]), 32)
            Vh[:, 2] = -Vh[:, 2]
            scene.set_verts(self.hub, self.lay_rigid(Vh, s0, 0.0))
        # the delivery system: flex catheter, inner shaft, balloon, nose cone, valve
        on = st['system']
        for o in (self.flex, self.inner, self.balloon, self.nose):
            self.show(o, on)
        valve_on = st['valve'] or st['implant']
        for o in (self.frame, self.skirt, self.leaflets):
            self.show(o, valve_on)
        if on or valve_on:
            sc = st['system_c']
            e = st['expand']
            # the valve: crimped length 2.7 cm centred on its centre; expanded, its outflow stays put
            vc = st['valve_c'] if st['valve'] else sc
            H_c = D.ROWS_CRIMP[-1]
            s_out = vc - H_c / 2                       # the outflow (aortic end): fixed
            Vf, H = D.frame_nodes(e)
            s_in = s_out + H                            # the inflow moves up as it shortens
            wall = self.frame_wall(s_in) if e > 0 else None
            Vf, H = D.frame_nodes(e, wall)
            scene.set_verts(self.frame, self.lay_valve(Vf, s_in, sys_))
            Vs, _ = D.skirt_verts(e, wall=wall)
            scene.set_verts(self.skirt, self.lay_valve(Vs, s_in, sys_))
            open_ = (eject if st['implant'] else 0.0) * e
            Vl, _ = D.leaflet_verts(e, open_)
            scene.set_verts(self.leaflets, self.lay_valve(Vl, s_in, sys_))
            if on:
                sb = sc + st['balloon_off']             # balloon centre
                rmax = 1.22                              # inside the frame's struts and skirt
                Vb, _ = G.revolve(D.balloon_profile(st['inflate'], rmax), 48)
                scene.set_verts(self.balloon, self.lay_rigid(Vb, sb, sys_))
                s_nose = sb + D.BALLOON_L / 2 + D.CONE_L
                Vn, _ = G.revolve(D.nose_profile(), 32)
                scene.set_verts(self.nose, self.lay_rigid(Vn, s_nose, sys_))
                s_flex = sc - H_c / 2 - 0.05
                scene.set_verts(self.flex, self.t_flex.verts(-30.0, s_flex, 0.23, fol))
                scene.set_verts(self.inner, self.t_inner.verts(s_flex - 0.2, s_nose + 0.1, 0.07, fol))
        # pigtail and pacing lead
        self.show(self.pig, st['pigtail'])
        if st['pigtail']:
            fb = lambda s: np.outer(SM((s - (self.rb.L - 9.0)) / 4.0), self.heart_offset(sys_))
            scene.set_verts(self.pig, self.t_pig.verts(-20.0, self.rb.L, 0.1, fb))
        self.show(self.lead, st['lead'])
        self.show(self.electrode, st['lead'])
        if st['lead']:
            tip = st['lead_tip']
            scene.set_verts(self.lead, self.t_lead.verts(-15.0, tip, 0.08))
            P, T, N, B = self.rc.at(np.array([tip - 0.42]))
            Vt, _ = G.revolve(np.array([[0.0, 0.0], [0.085, 0.05], [0.085, 0.35], [0.0, 0.42]]), 12)
            W = P[0] + Vt[:, :1] * N[0] + Vt[:, 1:2] * B[0] + Vt[:, 2:3] * T[0]
            scene.set_verts(self.electrode, W)
        # the title's glow along the arterial path
        g = st['glow']
        self.show(self.glow, g > 0)
        if g > 0:
            s1 = self.s_p + (self.s_ann - self.s_p) * g
            scene.set_verts(self.glow, self.t_glow.verts(self.s_p, max(s1, self.s_p + 0.5), 0.5))
            self.M['glow'].node_tree.nodes['glow'].outputs[0].default_value = st['glow_a']

    # -------------------------------------------------------- per-shot look
    LOOK = {
        # shot: body on, skin alpha (face, edge), heart alpha, aorta alpha, arteries alpha, cut on
        'title': (True, (0.03, 0.42), 0.6, 0.5, 0.5, False),
        'access': (True, (0.10, 0.62), 1.0, 1.0, 0.42, False),
        'pacing': (True, (0.04, 0.45), 0.32, 0.6, 0.85, False),
        'cross': (False, None, 1.0, 1.0, 1.0, True),
        'sheathpass': (True, (0.10, 0.62), 1.0, 1.0, 0.42, False),
        'align': (False, None, 1.0, 0.25, 0.25, False),
        'arch': (False, None, 0.3, 0.2, 0.6, False),
        'position': (False, None, 1.0, 1.0, 1.0, True),
        'deploy': (False, None, 1.0, 1.0, 1.0, True),
        'withdraw': (False, None, 1.0, 1.0, 1.0, True),
        'close': (True, (0.10, 0.62), 1.0, 1.0, 0.42, False),
    }

    def shot_look(self, t, shot, st):
        body_on, skin, heart_a, aorta_a, art_a, cut = self.LOOK.get(shot, self.LOOK['title'])
        # the fly-in to the groin (4.0-5.4 s): the title's look turns into the groin's
        fly = 1.0 - ease(t, 4.0, 5.2) if shot == 'access' else 0.0
        if fly > 0:
            _, skin0, h0, a0, r0, _ = self.LOOK['title']
            skin = tuple(x1 + (x0 - x1) * fly for x0, x1 in zip(skin0, skin))
            heart_a, aorta_a, art_a = (x1 + (x0 - x1) * fly for x0, x1 in ((h0, heart_a), (a0, aorta_a), (r0, art_a)))
        S = self.S
        for o in [S['body'], S['table']] + list(S['marks']):
            self.show(o, body_on)
        groin = shot in ('access', 'sheathpass', 'close')
        for o in S['marks']:
            if o.name.startswith('Ligament'):
                self.show(o, groin and o.name == 'Ligament1')
        mats.set_alpha(self.M['ligament'], 1.0 - fly)
        # the groin shots: the skin fades out round the puncture (a patch over the anatomy)
        nt = self.M['skin'].node_tree
        fp = nt.nodes['focus']
        for k, v in zip('XYZ', A.PUNCTURE_R + np.array([0, -1.5, 3.0])):
            fp.inputs[k].default_value = float(v)
        r = 1000.0
        if shot == 'access':
            r = 14.0 + 30.0 * ease(t, 13.0, 15.8)
            r += (300.0 - r) * (1.0 - ease(t, 4.0, 5.4))     # the patch closes in as the camera nears
        elif shot in ('sheathpass', 'close'):
            r = 16.0
        nt.nodes['focus_r'].outputs[0].default_value = r
        nt.nodes['cull'].outputs[0].default_value = (1.0 - fly) if groin else 0.0
        for o in S['marks']:
            if o.name.startswith('Femur'):
                self.show(o, False)
            if o.name == 'FemoralHead-1':
                # the far femoral head leaves the groin shots once the camera is near
                self.show(o, body_on and (not groin or (shot == 'access' and t < 5.0)))
        if skin:
            nt = self.M['skin'].node_tree
            nt.nodes['alpha_lo'].outputs[0].default_value = skin[0]
            nt.nodes['alpha_hi'].outputs[0].default_value = skin[1]
        mats.set_alpha(self.M['myocardium'], heart_a)
        mats.set_alpha(self.M['aorta'], aorta_a)
        mats.set_alpha(self.M['artery'], art_a)
        mats.set_alpha(self.M['vein'], max(art_a, 0.5) if body_on else min(1.0, heart_a + 0.2))
        # the pacing lead lit along its course while it goes in; the veins clear round it
        lit = shot == 'pacing' and st['lead']
        self.show(self.lglow, lit)
        if lit:
            mats.set_alpha(self.M['vein'], 0.3)
            scene.set_verts(self.lglow, self.t_lglow.verts(self.s_skin_c - 4.0, st['lead_tip'], 0.3))
            self.M['glow'].node_tree.nodes['glow'].outputs[0].default_value = 0.5
        for m in self.cut_mods:
            m.show_render = m.show_viewport = cut
        # in the cutaway, the tubes below the heart and the pacing lead in the (cut) RV would float
        for o in (S['vessels']['Veins'], S['vessels']['Arteries']):
            self.show(o, not cut)
        if shot in ('align', 'arch'):
            self.show(S['vessels']['Veins'], False)
        if cut or shot in ('align', 'arch'):
            # without its veins (hidden in these shots) the lead would float
            self.show(self.lead, False)
            self.show(self.electrode, False)
        if groin:
            # the pigtail leaves the other groin: from the right it rises out of the far side of the
            # body as a bare line
            self.show(self.pig, False)
        # the valves and chordae outside the cut view are hidden behind the opaque heart anyway

    # -------------------------------------------------------- cameras (standing-frame eye and target)
    def cam_for(self, t, shot):
        a, b = SHOTS.get(shot, (0, 1))
        u = (t - a) / (b - a)
        ra = self.ra
        groin = A.PUNCTURE_R
        n = self.cut_n
        if shot == 'title':
            eye = np.array([A.XM - 105, -95, -12]) + np.array([0, 0, -10]) * u
            return eye, np.array([A.XM, 0, -22]), 32, 'body'
        if shot in ('access', 'sheathpass', 'close'):
            # a side view from the patient's right: the skin on top, the needle's 45 degrees, the artery;
            # the fly-in starts where the title's camera ends
            far = np.array([A.XM - 105, -95, -22])
            near = groin + np.array([-24.0, -5.0, 1.5])
            near_t = groin + np.array([0.0, -1.5, 1.0])
            if shot == 'access':
                k = ease(t, 4.0, 5.6)
                eye = far + (near - far) * k
                tgt = np.array([A.XM, 0, -22]) + (near_t - np.array([A.XM, 0, -22])) * k
                # pull back to see the sheath reach the aorta (13.0-15.8)
                mid = 0.5 * (groin + A.AORTIC_BIF)
                m_ = ease(t, 13.0, 15.8)
                eye = eye + (mid + np.array([-58.0, -14.0, 0.0]) - eye) * m_
                tgt = tgt + (mid + np.array([0.0, -2.0, 0.0]) - tgt) * m_
                return eye, tgt, 32 + 18 * k, 'body'
            if shot == 'sheathpass':
                return groin + np.array([-32.0, -8.0, 7.0]), groin + np.array([0.0, -1.5, 5.0]), 45, 'body'
            return near, near_t, 50, 'body'
        if shot == 'pacing':
            eye = np.array([A.XM - 80, -70, -2])
            tgt = np.array([A.XM + 1, 0, -10])
            return eye, tgt, 40, 'body'
        if shot in ('cross', 'position', 'deploy', 'withdraw'):
            if shot == 'cross':
                # the root as the wire crosses (19-21.5), then the LV as the stiff wire curls (21.5-24.6)
                k = ease(t, 21.4, 23.4)
                c0, c1 = A.AV - A.ROOT * 0.3, 0.5 * (A.AV + A.APEX_ENDO) + A.ROOT * 0.6
                e0, e1 = A.AV + n * 15 + A.ROOT * 0.8, 0.5 * (A.AV + A.APEX_ENDO) + n * 27 + A.ROOT * 2.0
                return e0 + (e1 - e0) * k, c0 + (c1 - c0) * k, 50, 'root'
            eye = A.AV + n * 17 + A.ROOT * 1.5
            tgt = A.AV + A.ROOT * 0.3 - A.LV_AXIS * 0.4
            lens = 55 if shot != 'withdraw' else 45
            return eye, tgt, lens, 'root'
        if shot == 'align':
            c = self.ra.at(np.array([self.s_desc]))[0][0]
            eye = c + np.array([-20, -14, 1.5]) + np.array([0, 0, 1.5]) * u
            return eye, c + np.array([0, 0, 0.6]), 55, 'root'
        if shot == 'arch':
            c = np.array([0.2, 2.6, 6.2]) + np.array([-0.4, -2.0, -3.4]) * ease(t, 41.2, 43.8)
            eye = c + np.array([-36, -27, 4])
            return eye, c, 40, 'root'
        return np.array([A.XM - 105, -95, -12]), np.array([A.XM, 0, -22]), 32, 'body'

    def camera(self, t, shot):
        eye, tgt, lens, mode = self.cam_for(t, shot)
        E, T = SUPINE @ Vector(tuple(eye)), SUPINE @ Vector(tuple(tgt))
        f = (T - E).normalized()
        up = Vector((0, 0, 1)) if mode == 'body' else (SUPINE @ Vector(tuple(A.ROOT))).normalized()
        r = f.cross(up).normalized()
        u = r.cross(f).normalized()
        R = Matrix((r, u, -f)).transposed()
        self.cam.matrix_world = Matrix.Translation(E) @ R.to_4x4()
        self.cam.data.lens = lens
        self.cam.data.clip_start = 0.3
        self.cam.data.clip_end = 1500
        split = shot in SPLIT
        sc = self.sc
        sc.render.resolution_x = self.full[0] // 2 if split else self.full[0]
        sc.render.resolution_y = self.full[1]


def clip_group(p0, n):
    """A geometry-nodes group that deletes the faces whose points lie beyond the plane (p0, n)."""
    g = bpy.data.node_groups.new('clip', 'GeometryNodeTree')
    g.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    g.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nd, ln = g.nodes, g.links
    gi, go = nd.new('NodeGroupInput'), nd.new('NodeGroupOutput')
    pos = nd.new('GeometryNodeInputPosition')
    sub = nd.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = p0
    dot = nd.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = n
    cmp = nd.new('FunctionNodeCompare'); cmp.data_type = 'FLOAT'; cmp.operation = 'GREATER_THAN'
    cmp.inputs[1].default_value = 0.0
    dele = nd.new('GeometryNodeDeleteGeometry'); dele.domain = 'POINT'
    ln.new(pos.outputs[0], sub.inputs[0])
    ln.new(sub.outputs[0], dot.inputs[0])
    ln.new(dot.outputs['Value'], cmp.inputs[0])
    ln.new(gi.outputs[0], dele.inputs['Geometry'])
    ln.new(cmp.outputs[0], dele.inputs['Selection'])
    ln.new(dele.outputs[0], go.inputs[0])
    return g


def setup_engine(sc, engine, samples):
    if engine == 'workbench':
        sc.render.engine = 'BLENDER_WORKBENCH'
        sh = sc.display.shading
        sh.light = 'STUDIO'
        sh.color_type = 'MATERIAL'
        sc.display.render_aa = '8'
    else:
        sc.render.engine = 'CYCLES'
        sc.cycles.samples = samples
        # the video's settings (8 samples with the denoiser): fixed samples, 12 transparent and 4
        # light bounces, about 4.5 h for all shots on 4 cores; each can be set in the environment
        env = os.environ
        sc.cycles.use_adaptive_sampling = env.get('TAVR_ADAPTIVE', '0') == '1'
        sc.cycles.transparent_max_bounces = int(env.get('TAVR_TBOUNCE', '12'))
        sc.cycles.max_bounces = int(env.get('TAVR_BOUNCES', '4'))
        sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        sc.cycles.denoising_prefilter = 'ACCURATE'


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    opt = {args[i][2:]: args[i + 1] for i in range(0, len(args) - 1) if args[i].startswith('--')}
    res = tuple(int(x) for x in opt.get('res', '1216x486').split('x'))
    rig = Rig(res)
    rig.full = res
    sc = rig.sc
    setup_engine(sc, opt.get('engine', 'cycles'), int(opt.get('samples', '16')))
    out = opt['out']
    os.makedirs(out, exist_ok=True)
    if 'save' in opt:
        bpy.ops.wm.save_as_mainfile(filepath=opt['save'])
    times = []
    if 'still' in opt:
        times = [float(x) for x in opt['still'].split(',')]
        names = [os.path.join(out, 't%06.2f.jpg' % x) for x in times]
    else:
        spans = [SHOTS[k] for k in opt['shot'].split(',')] if 'shot' in opt else [[float(x) for x in opt['range'].split(':')]]
        step = int(opt.get('step', '1'))
        frames = [f for a, b in spans for f in range(int(round(a * FPS)), int(round(b * FPS)), step)]
        times = [f / FPS for f in frames]
        names = [os.path.join(out, 'f%05d.jpg' % f) for f in frames]
    for x, name in zip(times, names):
        if os.path.exists(name) and 'force' not in opt:
            continue
        t0 = time.time()
        rig.update(x)
        bpy.context.view_layer.update()
        sc.render.filepath = name
        bpy.ops.render.render(write_still=True)
        print('frame t=%.3f %s %.1fs' % (x, os.path.basename(name), time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
