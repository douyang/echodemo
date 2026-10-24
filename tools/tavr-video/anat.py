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
# Each path: rows of [x, y, z, lumen radius] (cm). Right side; the left mirrors it.
AORTA_EXT = np.array([
    [0.62, 5.99, -2.40, 1.10], [0.62, 5.99, -3.13, 1.10], [0.30, 5.70, -8.0, 1.08],
    [-0.80, 5.10, -12.5, 1.05], [-1.60, 4.40, -17.0, 1.00], [-1.90, 3.70, -21.0, 0.95],
    [-2.00, 3.20, -24.1, 0.90]])
AORTIC_BIF = AORTA_EXT[-1, :3]
ILIAC_R = np.array([
    [-2.00, 3.20, -24.1, 0.55], [-4.6, 3.6, -27.5, 0.52], [-7.6, 3.6, -30.4, 0.50],
    [-9.6, 1.5, -33.0, 0.46], [-10.9, -1.8, -35.2, 0.44], [-11.3, -3.75, -36.6, 0.42]])
FEMORAL_R = np.array([
    [-11.3, -3.75, -36.6, 0.42], [-11.45, -3.80, -38.2, 0.40], [-11.8, -3.30, -41.5, 0.40],
    [-12.3, -3.0, -48.0, 0.33], [-12.8, -2.6, -56.0, 0.30], [-13.2, -2.2, -66.0, 0.28]])
PROFUNDA_R = np.array([
    [-11.8, -3.30, -41.5, 0.30], [-13.3, -2.3, -44.5, 0.28], [-14.0, -1.0, -50.0, 0.25],
    [-14.4, 0.0, -58.0, 0.22]])
# veins: the IVC from the model's end down to the iliac confluence, then the right iliac and femoral
IVC_EXT = np.array([
    [-2.87, -1.78, -3.60, 1.10], [-2.84, -1.71, -3.97, 1.10], [-3.0, -0.6, -7.0, 1.10],
    [-4.0, 1.6, -12.0, 1.05], [-4.5, 2.8, -18.0, 1.00], [-4.3, 3.6, -25.5, 0.95],
    [-3.9, 4.0, -27.8, 0.90]])
ILIAC_V_R = np.array([
    [-3.9, 4.0, -27.8, 0.62], [-6.4, 4.4, -30.0, 0.60], [-8.6, 4.2, -31.5, 0.58],
    [-10.1, 1.4, -33.8, 0.55], [-10.4, -2.0, -35.6, 0.52], [-10.1, -3.6, -36.9, 0.50]])
FEMORAL_V_R = np.array([
    [-10.1, -3.6, -36.9, 0.50], [-10.2, -4.0, -38.5, 0.50], [-10.6, -3.6, -42.0, 0.48],
    [-11.3, -3.0, -50.0, 0.42], [-12.0, -2.4, -58.0, 0.38], [-12.5, -1.8, -66.0, 0.34]])

# landmarks of the groin: the inguinal ligament (ASIS to pubic tubercle) and the femoral head
LIGAMENT_R = np.array([[-14.2, -3.6, -32.6], [-10.2, -5.9, -35.4], [-5.55, -6.4, -38.6]])
FEMORAL_HEAD_R = np.array([-12.2, -0.4, -37.6])
FEMORAL_HEAD_RADIUS = 2.3
TROCHANTER_R = np.array([-17.0, -0.6, -40.2])
KNEE_R = np.array([-12.4, 0.4, -79.0])

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
