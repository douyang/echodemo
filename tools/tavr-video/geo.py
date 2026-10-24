"""Geometry helpers for the TAVR video: tubes, surfaces of revolution and rails, in numpy.

A rail is a centre line with rotation-minimizing frames and arc length (cm). Devices are built
straight, along local z, and laid on a rail: local (x, y, z) goes to P(s0 + z) + x N + y B.
"""
import numpy as np


def unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n == 0, 1, n)


def rmf(P, n0=None):
    """Rotation-minimizing frames along the points P (double reflection, Wang et al. 2008)."""
    P = np.asarray(P, float)
    T = np.gradient(P, axis=0)
    T = unit(T)
    N = np.zeros_like(P)
    if n0 is None:
        a = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        n0 = np.cross(T[0], a)
    N[0] = unit(n0 - T[0] * np.dot(n0, T[0]))
    for i in range(len(P) - 1):
        v1 = P[i + 1] - P[i]
        c1 = np.dot(v1, v1)
        if c1 < 1e-12:
            N[i + 1] = N[i]
            continue
        rL = N[i] - (2 / c1) * np.dot(v1, N[i]) * v1
        tL = T[i] - (2 / c1) * np.dot(v1, T[i]) * v1
        v2 = T[i + 1] - tL
        c2 = np.dot(v2, v2)
        N[i + 1] = rL - (2 / c2) * np.dot(v2, rL) * v2 if c2 > 1e-12 else rL
        N[i + 1] = unit(N[i + 1] - T[i + 1] * np.dot(N[i + 1], T[i + 1]))
    B = np.cross(T, N)
    return T, N, B


class Rail:
    """A centre line sampled densely, with arc length and frames."""

    def __init__(self, P, step=0.05, n0=None):
        from anat import resample
        Q = resample(np.asarray(P, float)[:, :3], step)
        self.P = Q
        self.S = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
        self.T, self.N, self.B = rmf(Q, n0)
        self.L = self.S[-1]

    def _interp(self, A, s):
        s = np.clip(np.asarray(s, float), 0, self.L)
        return np.stack([np.interp(s, self.S, A[:, k]) for k in range(3)], -1)

    def at(self, s):
        """Position, tangent, normal and binormal at arc length s (array or scalar)."""
        P = self._interp(self.P, s)
        T = unit(self._interp(self.T, s))
        N = self._interp(self.N, s)
        N = unit(N - T * np.sum(N * T, -1, keepdims=True))
        B = np.cross(T, N)
        # past either end, the rail runs on straight
        s = np.asarray(s, float)
        lo, hi = s < 0, s > self.L
        if np.any(lo):
            P = np.where(lo[..., None], self.P[0] + self.T[0] * s[..., None], P)
        if np.any(hi):
            P = np.where(hi[..., None], self.P[-1] + self.T[-1] * (s - self.L)[..., None], P)
        return P, T, N, B

    def lay(self, V, s0):
        """Local points V (x, y, z along the rail) laid on the rail from arc length s0."""
        V = np.asarray(V, float)
        P, T, N, B = self.at(s0 + V[:, 2])
        return P + V[:, :1] * N + V[:, 1:2] * B

    def nearest(self, p):
        """Arc length of the rail point nearest p."""
        d = np.linalg.norm(self.P - np.asarray(p, float), axis=1)
        return float(self.S[int(np.argmin(d))])


def ring(n, r=1.0):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([np.cos(a) * r, np.sin(a) * r], 1)


def tube_faces(rows, sides, cap0=True, cap1=True):
    """Quads of a tube of `rows` rings of `sides` points, with fan caps (centre points appended)."""
    F = []
    for i in range(rows - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            F.append((a, b, b + sides, a + sides))
    extra = 0
    if cap0:
        c = rows * sides
        F += [(c, (k + 1) % sides, k) for k in range(sides)]
        extra += 1
    if cap1:
        c = rows * sides + extra
        o = (rows - 1) * sides
        F += [(c, o + k, o + (k + 1) % sides) for k in range(sides)]
    return F


def tube_verts(P, R, sides, frames=None, cap0=True, cap1=True):
    """Ring vertices of a tube through the points P with radii R (scalar or per point)."""
    P = np.asarray(P, float)
    R = np.broadcast_to(np.asarray(R, float), (len(P),))
    T, N, B = frames if frames is not None else rmf(P)
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    V = (P[:, None, :] + R[:, None, None] * (np.cos(a)[None, :, None] * N[:, None, :]
                                              + np.sin(a)[None, :, None] * B[:, None, :])).reshape(-1, 3)
    ext = []
    if cap0:
        ext.append(P[0])
    if cap1:
        ext.append(P[-1])
    return np.vstack([V] + ([np.array(ext)] if ext else []))


def revolve(profile, sides):
    """A surface of revolution about local z: profile rows [r, z] -> vertices, quads (no caps)."""
    profile = np.asarray(profile, float)
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    V = np.stack([profile[:, 0:1] * np.cos(a)[None, :], profile[:, 0:1] * np.sin(a)[None, :],
                  np.broadcast_to(profile[:, 1:2], (len(profile), sides))], -1).reshape(-1, 3)
    return V, tube_faces(len(profile), sides, False, False)
