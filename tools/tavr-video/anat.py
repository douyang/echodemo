"""Anatomy of the TAVR video, in the standing frame of the heart model (Blender, cm).

Frame: X = the patient's left, Y = posterior, Z = superior. The heart model (heartmodel repo,
assets/heart.raw.glb, imported by Blender's glTF reader) lies in this frame as the site shows it.
The body is laid round the heart as the site's body key does (src/gl/bodykey.js): the apex
8.5 cm left of the midline, the aortic valve 12 cm below the jugular notch, the front of the
heart 2.4 cm under the skin. The vessels below the heart are a drawing at adult proportions,
not one patient's anatomy: they join the model's descending aorta and inferior vena cava where
the model's own centre lines end (heartmodel/blender/anatomy.py, vessel_paths).
"""
import numpy as np

# ---------------------------------------------------------------- the heart model's landmarks
AV = np.array([-0.38, -0.61, 1.87])          # aortic valve centre, end-diastole
AV_ES = np.array([0.05, -1.04, 1.52])        # the same at end-systole
ROOT = np.array([-0.301, -0.150, 0.942])     # ascending aorta direction (unit)
LV_AXIS = np.array([-0.612, 0.612, 0.5])     # apex -> base (unit)
MV = np.array([-0.18, 0.46, -0.78])
TV = np.array([-2.34, -3.46, -0.23])
RA_C = np.array([-3.14, -2.51, 0.03])
LV_EQ = np.array([1.78, -1.78, -1.45])
APEX_ENDO = np.array([5.39, -5.39, -4.40])
APEX_EPI = np.array([5.76, -5.76, -4.70])

# the model's aorta, root to descending end (anatomy.vessel_paths), and its lumen radii (cm)
AORTA_MODEL = np.array([
    [-0.38, -0.61, 1.87], [-0.63, -0.71, 2.77], [-0.88, -0.86, 3.87], [-1.28, -1.01, 5.87],
    [-1.18, -0.81, 7.67], [-0.58, 0.39, 9.17], [0.42, 1.99, 9.87], [1.32, 3.59, 8.87],
    [1.42, 4.79, 6.67], [0.92, 5.69, 3.67], [0.62, 5.99, -0.33], [0.62, 5.99, -3.13]])
AORTA_MODEL_R = np.array([1.15, 1.60, 1.35, 1.40, 1.40, 1.35, 1.30, 1.20, 1.15, 1.10, 1.10, 1.10])
IVC_MODEL_END = np.array([-2.84, -1.71, -3.97])

# ---------------------------------------------------------------- the body (bodykey.js)
XM = 5.7554 - 8.5            # the midline: the apex 8.5 cm to its left
ZN = 1.8722 + 12.0           # the jugular notch: the aortic valve 12 cm below it
ZF = 8.34 + 2.4              # the chest's front at the heart (three.js z): the heart's front + 2.4 cm

# torso cross-sections, neck to thighs: height from the notch, half-breadth, skin front and back
RINGS = [
    [13, 5.2, -8.0, -17.0], [9, 5.5, -6.5, -17.5], [5, 5.9, -5.6, -18.0], [4.2, 7.3, -5.3, -18.6],
    [3.0, 10.5, -5.0, -19.6], [1.8, 14.5, -4.8, -20.6], [0.6, 17.8, -4.5, -21.6], [-1, 19.6, -4.1, -22.5],
    [-4, 20.0, -3.0, -23.5], [-8, 17.8, -1.8, -24.8], [-12, 16.9, -0.6, -25.6], [-15, 16.7, 0, -26.0],
    [-19, 16.2, -0.2, -25.9], [-24, 15.5, -1.3, -25.3], [-30, 15.0, -1.8, -24.0], [-35, 14.8, -1.7, -23.2],
    [-42, 15.6, -1.6, -23.6], [-50, 17.3, -2.6, -25.8], [-58, 16.8, -3.6, -25.5], [-62, 15.5, -4.5, -24.5],
]
FRONT_N, BACK_N = 2.2, 2.8
ARM = [
    [16.8, -4.5, -13.4, 4.6], [19.2, -9, -13.5, 4.9], [20.2, -18, -13.6, 4.3], [20.9, -28, -13.8, 3.8],
    [21.2, -33, -13.7, 3.6], [21.4, -41, -13.0, 3.9], [21.3, -53, -12.2, 2.9], [21.1, -58, -11.8, 2.6],
]


def body_point(dx, dy, zr):
    """A point given as bodykey does: cm left of the midline, height from the notch, depth (three.js z
    from the chest's front at the heart, negative inward) -> the standing frame."""
    return np.array([XM + dx, -(ZF + zr), ZN + dy])


def section(r, t):
    """A point of a torso cross-section at angle t (0: the patient's left, pi/2: the front)."""
    _, a, zf, zb = r
    c, s = np.cos(t), np.sin(t)
    zc, h = (zf + zb) / 2, (zf - zb) / 2
    n = FRONT_N if s >= 0 else BACK_N
    return a * np.sign(c) * abs(c) ** (2 / 2.4), zc + h * np.sign(s) * abs(s) ** (2 / n)


def mirror(p):
    """The same point on the patient's other side."""
    q = np.array(p, float)
    q[..., 0] = 2 * XM - q[..., 0]
    return q


# ---------------------------------------------------------------- vessels below the heart
# Drawn on the CC0 body and bones as hbm.py fits them round the heart (tools/fit_body.py writes
# the landmarks to body_fit.json; tools/check_body.py checks the clearances): the femoral heads at
# (-10.49, 0.58, -37.6) and (5.00, 0.58, -37.6), radius 2.09; the anterior superior iliac spines
# at (-13.85, -3.82, -28.37) and (8.37, -3.82, -28.37); the pubic tubercles at (-5.61, -3.75,
# -36.91) and (0.12, -3.75, -36.91); L4's body from z -24.3 to -20, its front at y 0.71. Each path:
# rows of [x, y, z, lumen radius] (cm). The abdominal aorta and the inferior vena cava lie on the
# front of the spine; the aorta divides in front of the lower third of L4. The common iliac
# arteries cross in front of the iliac veins and the start of the cava; the external iliac
# arteries run along the pelvic brim and under the inguinal ligament at its middle; the common
# femoral artery lies 3 cm under the skin over the medial third of the femoral head, the vein
# 1.4 cm medial to it.
AORTA_EXT = np.array([
    [0.62, 5.99, -2.40, 1.10], [0.62, 5.99, -3.13, 1.10], [0.20, 3.10, -6.50, 1.08],
    [-0.40, 1.20, -10.0, 1.05], [-0.95, 0.70, -14.0, 1.00], [-1.45, -0.30, -18.0, 0.97],
    [-1.75, -0.35, -21.5, 0.93], [-1.95, 0.15, -24.3, 0.90]])
AORTIC_BIF = AORTA_EXT[-1, :3]
ILIAC_R = np.array([
    [-1.95, 0.15, -24.3, 0.55], [-4.00, -0.90, -26.0, 0.53], [-5.60, -0.30, -27.2, 0.51],
    [-6.80, 0.90, -28.4, 0.49], [-7.90, 0.40, -30.0, 0.47], [-8.60, -1.30, -32.0, 0.45],
    [-8.80, -2.90, -33.6, 0.43]])
FEMORAL_R = np.array([
    [-8.80, -2.90, -33.6, 0.43], [-9.00, -4.20, -37.6, 0.42], [-9.20, -4.10, -41.0, 0.40],
    [-9.60, -3.80, -46.0, 0.34], [-10.5, -3.00, -54.0, 0.31], [-11.4, -2.20, -62.0, 0.29],
    [-12.0, -1.60, -66.0, 0.28]])
PROFUNDA_R = np.array([
    [-9.20, -4.10, -41.0, 0.30], [-9.90, -2.60, -43.0, 0.28], [-10.8, -1.20, -48.0, 0.26],
    [-11.5, -0.20, -56.0, 0.23], [-12.0, 0.50, -60.0, 0.21]])
# veins: the cava from the model's end down the front of the spine to the confluence of the
# common iliac veins at L5, right of the midline; the right iliac and femoral veins
IVC_EXT = np.array([
    [-2.87, -1.78, -3.60, 1.10], [-2.84, -1.71, -3.97, 1.10], [-3.30, 0.20, -5.5, 1.10],
    [-4.10, 1.50, -8.0, 1.08], [-4.40, 1.10, -12.0, 1.05], [-4.60, -0.05, -17.0, 1.00],
    [-4.70, -0.25, -22.0, 0.97], [-4.60, 0.60, -26.6, 0.92]])
ILIAC_V_R = np.array([
    [-4.60, 0.60, -26.6, 0.62], [-5.30, 2.00, -27.4, 0.60], [-6.00, 2.50, -28.2, 0.58],
    [-7.30, 1.40, -30.2, 0.56], [-7.60, -0.60, -32.4, 0.54], [-7.40, -2.60, -35.0, 0.52]])
FEMORAL_V_R = np.array([
    [-7.40, -2.60, -35.0, 0.52], [-7.60, -3.70, -37.6, 0.50], [-8.20, -3.50, -41.0, 0.48],
    [-8.90, -3.20, -46.0, 0.44], [-9.90, -2.40, -54.0, 0.40], [-10.9, -1.60, -62.0, 0.36],
    [-11.5, -1.00, -66.0, 0.34]])
# the left: the right side mirrored, but the common iliac artery from the bifurcation (left of the
# midline) and the left common iliac vein across the front of L5 to the cava
ILIAC_L = np.array([
    [-1.95, 0.15, -24.3, 0.55], [-0.90, -0.60, -26.0, 0.53], [0.11, -0.30, -27.2, 0.51],
    [1.31, 0.90, -28.4, 0.49], [2.41, 0.40, -30.0, 0.47], [3.11, -1.30, -32.0, 0.45],
    [3.31, -2.90, -33.6, 0.43]])
ILIAC_V_L = np.array([
    [-4.60, 0.60, -26.6, 0.60], [-4.00, 0.70, -26.9, 0.60], [-1.60, 1.00, -27.6, 0.59],
    [0.51, 2.50, -28.2, 0.58], [1.81, 1.40, -30.2, 0.56], [2.11, -0.60, -32.4, 0.54],
    [1.91, -2.60, -35.0, 0.52]])

# landmarks of the groin: the inguinal ligament (ASIS to pubic tubercle, sagging at its middle)
# and the femoral head
LIGAMENT_R = np.array([[-13.85, -3.82, -28.37], [-9.60, -4.40, -33.2], [-5.61, -3.75, -36.91]])
FEMORAL_HEAD_R = np.array([-10.49, 0.58, -37.6])
FEMORAL_HEAD_RADIUS = 2.09
FH_Z = FEMORAL_HEAD_R[2]                      # the hip joints' height: the body fits to it (hbm.py)

# the arterial puncture: the common femoral artery over the femoral head, below the ligament
PUNCTURE_R = FEMORAL_R[1, :3].copy()
NEEDLE_DIR = np.array([0.0, 0.7071, 0.7071])     # 45 degrees, deep and toward the head
VEIN_PUNCTURE_R = FEMORAL_V_R[1, :3].copy()


def catmull(P, n=8):
    """Catmull-Rom through the rows of P (any columns), n points per span."""
    P = np.asarray(P, float)
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return np.array(out)


def resample(P, step):
    """Points every `step` cm along the polyline P (columns past the 3rd are interpolated too)."""
    P = np.asarray(P, float)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P[:, :3], axis=0), axis=1))]
    s = np.arange(0, d[-1], step)
    s = np.r_[s, d[-1]] if d[-1] - s[-1] > 1e-6 else s
    return np.stack([np.interp(s, d, P[:, k]) for k in range(P.shape[1])], 1)
