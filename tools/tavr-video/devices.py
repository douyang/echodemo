"""The devices of the TAVR video and the rails they run on (standing frame, cm).

Rail A: right femoral artery to the LV apex (the access wire, the sheath, the stiff wire and the
delivery system). Rail B: left femoral artery to the noncoronary sinus (the pigtail). Rail C: right
femoral vein to the RV apex (the pacing lead). Each device keeps one topology; the animation
moves its vertices every frame (update_*).

Device sizes follow the SAPIEN 3 label (P140031/S085): a 26-mm valve, 20 mm tall when expanded,
in a 14F expandable sheath; the frame shortens by about 7 mm as it expands (Blackman 2021, Table 3).
"""
import numpy as np

import anat as A
import geo as G

UP = A.ROOT                                  # into the aorta from the annulus
DOWN = -A.ROOT


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- rails
def lv_path():
    """From the annulus down the LVOT and LV to the apex, then the stiff wire's curl."""
    lvot = A.AV + DOWN * 1.4
    near = A.APEX_ENDO + A.LV_AXIS * 1.25
    mid = 0.55 * A.LV_EQ + 0.45 * near
    # straight along the root's axis from 1.2 cm above the annulus to the LVOT
    P = [A.AV + UP * 1.2, A.AV + UP * 0.6, A.AV, A.AV + DOWN * 0.7, lvot, mid, near]
    d = G.unit(near - mid)
    side = G.unit(np.cross(d, np.cross(A.MV - near, d)))   # curl toward the mitral side
    R = 0.95
    c = near + side * R
    loop = [c - side * R * np.cos(p) + d * R * np.sin(p) for p in np.linspace(0, 1.7 * np.pi, 24)[1:]]
    return np.array(P), np.array(loop)


def rail_a():
    hub = A.PUNCTURE_R - A.NEEDLE_DIR * 16.0
    fem = A.FEMORAL_R[1::-1, :3]            # puncture -> inguinal ligament
    ili = A.ILIAC_R[::-1, :3]               # ligament -> aortic bifurcation
    ao = A.AORTA_EXT[::-1, :3]              # bifurcation -> model end
    model = A.AORTA_MODEL[::-1]             # descending end -> arch -> root
    head, loop = lv_path()
    P = np.vstack([[hub, A.PUNCTURE_R - A.NEEDLE_DIR * 4.0], fem, ili[1:], ao[1:], model[1:-2], head, loop])
    return G.Rail(A.catmull(P, 10), step=0.04)


def rail_b():
    dirL = A.NEEDLE_DIR * np.array([-1.0, 1.0, 1.0])      # a direction mirrors without the midline
    pu = A.mirror(A.PUNCTURE_R)
    hubL = pu - dirL * 16.0
    fem = A.mirror(A.FEMORAL_R[1::-1, :3])
    ili = A.ILIAC_L[::-1, :3]
    ao = A.AORTA_EXT[::-1, :3] + np.array([0.35, -0.25, 0])
    model = A.AORTA_MODEL[::-1][1:-2] + np.array([0.3, -0.2, 0])
    # the noncoronary sinus: just above the annulus, posterior and to the right of the axis
    e_post = G.unit(np.array([-0.55, 0.85, 0.0]) - UP * np.dot(np.array([-0.55, 0.85, 0.0]), UP))
    ncc = A.AV + UP * 0.55 + e_post * 0.95
    top = A.AV + UP * 2.2 + e_post * 0.5
    d = G.unit(ncc - top)
    side = G.unit(np.cross(d, UP))
    R = 0.42
    c = ncc + side * R
    loop = [c - side * R * np.cos(p) - d * R * np.sin(p) for p in np.linspace(0, 1.8 * np.pi, 18)[1:]]
    P = np.vstack([[hubL, pu - dirL * 4.0], fem, ili[1:], ao[1:], model, [top, ncc], loop])
    return G.Rail(A.catmull(P, 10), step=0.04)


def rv_apex():
    """A point in the RV cavity near its apex: from the tricuspid valve toward the apex region."""
    return A.TV + 0.55 * (A.APEX_EPI - A.TV) + np.array([0.0, -0.6, 0.0])


def rail_c():
    hub = A.VEIN_PUNCTURE_R - A.NEEDLE_DIR * 12.0
    fem = A.FEMORAL_V_R[1::-1, :3]
    ili = A.ILIAC_V_R[::-1, :3]
    ivc = A.IVC_EXT[::-1, :3]
    tip = rv_apex()
    P = np.vstack([[hub, A.VEIN_PUNCTURE_R - A.NEEDLE_DIR * 3.0], fem, ili[1:], ivc[1:-1],
                   [A.RA_C + np.array([0, 0, -0.6]), A.TV + np.array([0.3, -0.3, -0.2]), tip]])
    return G.Rail(A.catmull(P, 10), step=0.04)


# ---------------------------------------------------------------- tubes on a rail
class RailTube:
    """A tube of fixed topology laid on a rail between two arc lengths, radius a function of s."""

    def __init__(self, rail, rings, sides):
        self.rail, self.rings, self.sides = rail, rings, sides
        self.F = G.tube_faces(rings, sides, True, True)

    def verts(self, s0, s1, radius, offset=None):
        s = np.linspace(s0, s1, self.rings)
        P, T, N, B = self.rail.at(s)
        if offset is not None:
            P = P + offset(s)
        R = radius(s) if callable(radius) else np.full(len(s), radius)
        a = np.linspace(0, 2 * np.pi, self.sides, endpoint=False)
        V = (P[:, None, :] + R[:, None, None] * (np.cos(a)[None, :, None] * N[:, None, :]
                                                  + np.sin(a)[None, :, None] * B[:, None, :])).reshape(-1, 3)
        return np.vstack([V, P[:1], P[-1:]])


# ---------------------------------------------------------------- the valve (SAPIEN 3 type)
CELLS = 12                     # cells round the frame
ROWS_EXP = np.array([0.0, 0.33, 0.66, 0.99, 2.0])        # node rows, expanded (20 mm tall)
ROWS_CRIMP = np.array([0.0, 0.47, 0.94, 1.41, 2.7])      # crimped: 27 mm, 7 mm longer
R_EXP, R_CRIMP = 1.3, 0.27
STRUT = 0.028
SKIRT_H = 0.72                 # the outer PET skirt over the inflow cells (expanded)


def frame_lattice():
    """Node indices and strut edges of the frame: rows of CELLS nodes, offset half a cell on odd
    rows, joined in diamonds; three commissure posts up the tall outflow cells."""
    nodes, edges = [], []
    nr = len(ROWS_EXP)
    for j in range(nr):
        for k in range(CELLS):
            nodes.append((j, k + 0.5 * (j % 2)))
    idx = lambda j, k: j * CELLS + (k % CELLS)
    for j in range(nr - 1):
        for k in range(CELLS):
            if j % 2 == 0:
                edges += [(idx(j, k), idx(j + 1, k)), (idx(j, k), idx(j + 1, k - 1))]
            else:
                edges += [(idx(j, k), idx(j + 1, k)), (idx(j, k), idx(j + 1, k + 1))]
    # the commissure posts: the top cells at 3 places get a vertical bar
    for k in (0, 4, 8):
        edges.append((idx(nr - 2, k), idx(nr - 1, k)))
    return nodes, edges


def frame_nodes(e, wall=None):
    """Local node positions (x, y, z from the inflow) at expansion e (0 crimped, 1 expanded).
    wall(z, angles) -> the largest radius the root allows at that height (or None)."""
    nodes, _ = frame_lattice()
    rows = ROWS_CRIMP + (ROWS_EXP - ROWS_CRIMP) * e
    r = R_CRIMP + (R_EXP - R_CRIMP) * e
    out = []
    for j, kk in nodes:
        a = 2 * np.pi * kk / CELLS
        z = rows[j]
        rr = r
        if wall is not None:
            rr = min(r, wall(z, a))
        out.append((rr * np.cos(a), rr * np.sin(a), z))
    return np.array(out), rows[-1]


def skirt_verts(e, sides=96, nz=6, wall=None):
    """The outer sealing skirt: a pleated band over the inflow cells."""
    h = SKIRT_H + (SKIRT_H * ROWS_CRIMP[-1] / ROWS_EXP[-1] - SKIRT_H) * (1 - e)
    r = R_CRIMP + (R_EXP - R_CRIMP) * e + 0.03
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    V = []
    for z in np.linspace(0.02, h, nz):
        for ai in a:
            rr = r + 0.018 * np.sin(ai * CELLS * 2) * e
            if wall is not None:
                rr = min(rr, wall(z, ai) + 0.01)
            V.append((rr * np.cos(ai), rr * np.sin(ai), z))
    return np.array(V), G.tube_faces(nz, sides, False, False)


def leaflet_verts(e, open_, nu=21, nv=9):
    """Three leaflets inside the frame, tied to the posts at 0, 120 and 240 degrees: shut, the free
    edges meet along the lines to the centre; open, they ring an orifice. Crimped (e=0) they fold
    against the inner shaft."""
    out = []
    r = (R_CRIMP + (R_EXP - R_CRIMP) * e) - 0.05
    base, comm = 0.55 + 0.25 * (1 - e), 1.75 + 0.6 * (1 - e)
    coapt, top = 1.25 + 0.4 * (1 - e), 1.85 + 0.6 * (1 - e)
    ro = 0.55 * r
    for j in range(3):
        p0 = 2 * np.pi * (j * 4) / CELLS
        p1 = p0 + 2 * np.pi / 3
        for i in range(nu):
            a = i / (nu - 1)
            phi = p0 + a * (p1 - p0)
            mid = abs(2 * a - 1)
            zA = base + (comm - base) * mid ** 1.6
            # shut: the free edge on the line from its post to the centre
            pc = p0 if a < 0.5 else p1
            xs, ys = r * mid * np.cos(pc), r * mid * np.sin(pc)
            zs = coapt + (comm - coapt) * mid ** 1.5
            xo, yo = ro * np.cos(phi), ro * np.sin(phi)
            zo = top + (comm - top) * mid ** 2
            xe, ye, ze = xs + open_ * (xo - xs), ys + open_ * (yo - ys), zs + open_ * (zo - zs)
            xa, ya = r * np.cos(phi), r * np.sin(phi)
            for k in range(nv):
                b = k / (nv - 1)
                sag = 0.07 * np.sin(np.pi * b) * np.sin(np.pi * a) * (1 - open_)
                out.append((xa + b * (xe - xa), ya + b * (ye - ya), zA + b * (ze - zA) - sag))
    V = np.array(out)
    F = []
    for j in range(3):
        o = j * nu * nv
        for i in range(nu - 1):
            for k in range(nv - 1):
                a = o + i * nv + k
                F.append((a, a + nv, a + nv + 1, a + 1))
    return V, F


# ---------------------------------------------------------------- the delivery system's parts
BALLOON_L = 3.1                # working length (cm)
CONE_L = 0.55


def balloon_profile(inflate, rmax=1.3, n=40):
    """Balloon profile rows [r, z] (z from its proximal cone to its distal cone, centred on 0)."""
    r_lo = 0.075
    r_body = 0.24 + (rmax - 0.24) * inflate
    z0, z1 = -BALLOON_L / 2, BALLOON_L / 2
    rows = []
    for t in np.linspace(0, 1, 8):
        rows.append((r_lo + (r_body - r_lo) * smooth(t), z0 - CONE_L * (1 - t)))
    for t in np.linspace(0, 1, n)[1:-1]:
        rows.append((r_body, z0 + t * (z1 - z0)))
    for t in np.linspace(0, 1, 8):
        rows.append((r_lo + (r_body - r_lo) * smooth(1 - t), z1 + CONE_L * t))
    return np.array(rows)


def nose_profile(n=16):
    """The nose cone: from the balloon catheter's tip 1.6 cm long, 0.28 -> 0.07 cm in radius."""
    t = np.linspace(0, 1, n)
    return np.stack([0.28 - (0.28 - 0.07) * smooth(t) ** 0.8, t * 1.6], 1)
