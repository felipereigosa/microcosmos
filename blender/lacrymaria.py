"""Procedural Lacrymaria olor, built headless in Blender 5.x.

Run:  blender -b --factory-startup -P lacrymaria.py -- --out DIR [options]

Geometry is in micrometres, scaled by U into Blender units. Anatomy follows
Flaum & Prakash, Science 384, eadk5511 (2024): a 40 um wide body tapering to a
~9 um neck, 15 helical pleats with rows of cilia in the grooves, helix angle
high on the body and low on the neck, a head knob with a crown of long cilia.

The pose is a centreline described by yaw and pitch along arc length, so the
same builder can later be driven by curves tracked from footage.
"""
import argparse
import math
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

U = 0.1  # Blender units per micrometre
N_PLEATS = 15


# ----------------------------------------------------------------- parameters
class Params:
    ds = 0.25            # ring spacing along the cell, um
    nphi = 300           # vertices around
    time = 0.0           # s, drives the ciliary beat phase
    beat_hz = 14.0
    cilia_scale = 1.0    # cilia length, relative to the paper's cell
    seed = 3
    # shape. Defaults are the cell of the paper; a tracked clip overrides them.
    r_body = None        # radius from the tail, one value per um, up to s_body
    s_body = 150.0       # where the body ends and the neck begins, um
    r_neck = 3.9
    head_scale = 1.0     # size of the head knob (1 = 20 um long, 5.9 um radius)
    size = 1.0           # size of the body relative to the paper's (organelles)
    # pose
    length = 380.0       # total length tail to head tip, um
    path = None          # (n,3) um polyline tail->head; None = the swan pose
    yaw_amp = 1.55       # swan pose: in-plane sweep of the neck, rad
    pitch_amp = 0.30     # swan pose: out-of-plane, rad


PAPER_BODY = np.array([
    (0, 0.0), (3, 1.6), (10, 3.6), (25, 7.5), (50, 13.5), (75, 18.5),
    (92, 20.0), (105, 19.0), (120, 14.0), (135, 8.5), (150, 5.4), (175, 4.3)])
# head knob: distance back from the tip, radius (um, at head_scale 1)
HEAD = np.array([(0, 0.0), (0.4, 1.5), (1.5, 2.9), (3.5, 3.9), (6.0, 4.6), (9.5, 5.9),
                 (13.5, 5.6), (17.5, 3.5), (20.0, 3.7)])
HEAD_LEN = 20.0


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def smooth(a, sigma_samples):
    k = int(sigma_samples * 3)
    if k < 1:
        return a
    x = np.arange(-k, k + 1)
    w = np.exp(-0.5 * (x / sigma_samples) ** 2)
    w /= w.sum()
    pad = np.concatenate([np.full(k, a[0]), a, np.full(k, a[-1])])
    return np.convolve(pad, w, mode="valid")


def profiles(P):
    """Arc length samples, radius r(s) and helix angle theta(s), in um and rad.

    The body keeps its shape from the tail; the neck is a tube of whatever
    length is left; the head knob rides on the far end. So lengthening the
    cell only lengthens the neck, as in the real one."""
    L = max(P.length, 12.0)
    s = np.arange(0.0, L + 1e-6, P.ds)
    d = L - s                                               # distance from the head tip
    if P.r_body is None:
        r = np.interp(s, PAPER_BODY[:, 0], PAPER_BODY[:, 1])
    else:
        r = np.interp(s, np.arange(len(P.r_body)), P.r_body)
    r = np.where(s < P.s_body, np.maximum(r, P.r_neck * smoothstep(s / 6.0)), P.r_neck)
    r = np.where(s > P.s_body + 25, P.r_neck, r)
    r = smooth(r, 2.0 / P.ds)
    hs = P.head_scale
    hr = np.interp(d / hs, HEAD[:, 0], HEAD[:, 1]) * hs
    w = smoothstep((HEAD_LEN * hs - d) / (4.0 * hs))
    r = np.maximum(r * (1 - w) + hr * w, np.where(s < P.s_body, r, 0.0))
    r *= smoothstep(s / 1.5) * smoothstep(d / (1.0 * hs))
    x = np.clip((r - P.r_neck) / max(r.max() - P.r_neck, 1e-6), 0, 1)
    theta = np.radians(20 + 54 * smoothstep(x) ** 0.8
                       + 22 * np.exp(-((d - 10 * hs) / (5 * hs)) ** 2))
    theta = smooth(theta, 3.0 / P.ds)
    return s, r, theta, L


def frames_along(T):
    """Rotation-minimising normals along unit tangents T, starting in the XY plane."""
    N = np.zeros_like(T)
    n = np.cross([0.0, 0.0, 1.0], T[0])
    if np.linalg.norm(n) < 1e-6:
        n = np.array([0.0, 1.0, 0.0])
    for i in range(len(T)):
        n = n - T[i] * n.dot(T[i])
        n /= np.linalg.norm(n)
        N[i] = n
    return N, np.cross(T, N)


def centreline(P, s, L):
    """Positions and frames along the cell."""
    if P.path is None:
        u = np.clip((s - 118.0) / max(L - HEAD_LEN - 118.0, 1.0), 0, 1.1)
        yaw = P.yaw_amp * np.sin(1.25 * np.pi * u) * smoothstep(u * 5)
        pitch = P.pitch_amp * np.sin(1.7 * np.pi * u) * smoothstep(u * 5)
        T = np.stack([np.cos(pitch) * np.cos(yaw), np.cos(pitch) * np.sin(yaw),
                      np.sin(pitch)], axis=1)
        C = np.cumsum(T * P.ds, axis=0)
        C -= C[0]
    else:
        path = np.asarray(P.path, dtype=float)
        a = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
        q = s / s[-1] * a[-1]
        C = np.stack([np.interp(q, a, path[:, k]) for k in range(3)], axis=1)
        C = np.stack([smooth(C[:, k], 1.5 / P.ds) for k in range(3)], axis=1)
        T = np.gradient(C, axis=0)
        T /= np.linalg.norm(T, axis=1, keepdims=True)
    N, B = frames_along(T)
    return C, T, N, B


# ------------------------------------------------------------------ mesh utils
def make_mesh(name, verts, faces, smooth_shade=True):
    me = bpy.data.meshes.new(name)
    faces = np.asarray(faces, dtype=np.int32)
    k = faces.shape[1]
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", np.asarray(verts, dtype=np.float32).ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set("vertex_index", faces.ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", np.arange(len(faces), dtype=np.int32) * k)
    try:
        me.polygons.foreach_set("loop_total", np.full(len(faces), k, dtype=np.int32))
    except Exception:
        pass
    me.update(calc_edges=True)
    me.validate()
    if smooth_shade:
        me.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def unit_icosphere(subdiv):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bm.verts.ensure_lookup_table()
    v = np.array([x.co[:] for x in bm.verts], dtype=np.float32)
    f = np.array([[x.index for x in face.verts] for face in bm.faces], dtype=np.int32)
    bm.free()
    return v, f


def blobs(name, centres, radii, subdiv=2, axes=None, stretch=None, noise=0.0, rng=None):
    """Many spheres/ellipsoids in one mesh. centres (n,3) um, radii (n,) um."""
    v, f = unit_icosphere(subdiv)
    n = len(centres)
    V = np.repeat(v[None], n, axis=0)                       # n, nv, 3
    if noise and rng is not None:
        V = V * (1 + noise * rng.standard_normal((n, len(v), 1)).astype(np.float32))
    V = V * np.asarray(radii, dtype=np.float32)[:, None, None]
    if axes is not None:                                    # elongate along axes
        a = np.asarray(axes, dtype=np.float32)
        a /= np.linalg.norm(a, axis=1, keepdims=True)
        along = (V * a[:, None, :]).sum(-1, keepdims=True)
        V = V + along * a[:, None, :] * (np.asarray(stretch, dtype=np.float32)[:, None, None] - 1)
    V = V + np.asarray(centres, dtype=np.float32)[:, None, :]
    F = f[None] + (np.arange(n, dtype=np.int32) * len(v))[:, None, None]
    return make_mesh(name, V.reshape(-1, 3) * U, F.reshape(-1, 3))


# ------------------------------------------------------------------- the cell
class Cell:
    def __init__(self, P):
        self.P = P
        self.rng = np.random.default_rng(P.seed)
        self.s, self.r, self.theta, self.L = profiles(P)
        self.ne = self.L - HEAD_LEN * P.head_scale          # neck end / head start
        self.C, self.T, self.N, self.B = centreline(P, self.s, self.L)
        r_safe = np.maximum(self.r, 0.4 * P.r_neck + 0.05)
        # left-handed helix phase of the pleats
        self.psi = -np.cumsum(np.tan(self.theta) / r_safe * P.ds)
        perp = 2 * np.pi * r_safe * np.cos(self.theta) / N_PLEATS
        self.depth = np.minimum(0.34 * perp, 1.1) * smoothstep(self.r / (0.5 * P.r_neck))
        self.depth *= 1.0 - 0.6 * smoothstep((self.s - self.ne) / (4.0 * P.head_scale))

    def idx(self, s):
        return np.clip(s / self.P.ds, 0, len(self.s) - 1.001)

    def at(self, arr, s):
        f = self.idx(np.asarray(s, dtype=float))
        i = f.astype(int)
        t = (f - i)
        if arr.ndim == 2:
            t = t[..., None]
        return arr[i] * (1 - t) + arr[i + 1] * t

    def point(self, s, rho, phi):
        """Point inside the cell: rho is a fraction of the local radius."""
        s = np.asarray(s, dtype=float)
        c, n, b = self.at(self.C, s), self.at(self.N, s), self.at(self.B, s)
        rr = (self.at(self.r, s) * rho)[..., None]
        return c + rr * (np.cos(phi)[..., None] * n + np.sin(phi)[..., None] * b)

    # -- pellicle: the pleated outer surface
    def build_surface(self):
        P = self.P
        phi = np.linspace(0, 2 * np.pi, P.nphi, endpoint=False)
        x = N_PLEATS * (phi[None, :] - self.psi[:, None])
        groove = (0.5 + 0.5 * np.cos(x)) ** 2.2             # 1 in the groove
        R = self.r[:, None] - self.depth[:, None] * groove
        R = np.maximum(R, 0.0)
        V = (self.C[:, None, :]
             + R[..., None] * (np.cos(phi)[None, :, None] * self.N[:, None, :]
                               + np.sin(phi)[None, :, None] * self.B[:, None, :]))
        ni, nj = R.shape
        i = np.arange(ni - 1)[:, None]
        j = np.arange(nj)[None, :]
        a = i * nj + j
        b = i * nj + (j + 1) % nj
        F = np.stack([a, b, b + nj, a + nj], axis=-1).reshape(-1, 4)
        ob = make_mesh("pellicle", V.reshape(-1, 3) * U, F)
        at = ob.data.attributes.new("pleat", "FLOAT", "POINT")
        at.data.foreach_set("value", groove.astype(np.float32).ravel())
        return ob

    # -- cilia: hair curves rooted in the grooves
    def build_cilia(self):
        """Body cilia are counted from the tail and neck cilia from the head, so
        each one stays put on its piece of the cell while the neck pays out."""
        P = self.P
        rng = np.random.default_rng(P.seed + 1)
        s, ne, hs = self.s, self.ne, P.head_scale
        dens = np.full_like(s, 1.0 / 1.25)                   # cilia per um of row
        dens[s > ne + 3.5 * hs] = 1.0 / (0.7 * max(hs, 0.6))
        dens[(s > ne + 14.5 * hs) | (self.r < 0.25 * P.r_neck)] = 0.0
        w = dens * P.ds / np.cos(self.theta)
        from_tail = np.cumsum(w)
        from_head = np.cumsum(w[::-1])[::-1]
        M = 6000
        offs = rng.uniform(0, 1, (2, N_PLEATS))
        jit = rng.uniform(0.85, 1.12, (2, N_PLEATS, M))
        noise = rng.normal(0, 0.25, (2, N_PLEATS, M))
        rs, rk, rj, rn, rc = [], [], [], [], []
        for k in range(N_PLEATS):
            m = np.arange(int(from_tail[-1] - offs[0, k]) + 1)
            st = np.interp(m + offs[0, k], from_tail, s)
            keep = st <= P.s_body
            rs.append(st[keep]); rk.append(np.full(keep.sum(), k))
            rj.append(jit[0, k, m[keep] % M]); rn.append(noise[0, k, m[keep] % M])
            rc.append(st[keep])
            m = np.arange(int(from_head[0] - offs[1, k]) + 1)
            sh = np.interp(m + offs[1, k], from_head[::-1], s[::-1])
            keep = sh > P.s_body
            rs.append(sh[keep]); rk.append(np.full(keep.sum(), k))
            rj.append(jit[1, k, m[keep] % M]); rn.append(noise[1, k, m[keep] % M])
            rc.append(sh[keep] - self.L)
        rs, rk, rj, rn, rc = (np.concatenate(v) for v in (rs, rk, rj, rn, rc))
        n = len(rs)
        phi = self.at(self.psi, rs) + 2 * np.pi * rk / N_PLEATS
        c, t = self.at(self.C, rs), self.at(self.T, rs)
        nn, bb = self.at(self.N, rs), self.at(self.B, rs)
        rad = self.at(self.r, rs) - self.at(self.depth, rs)
        nrm = np.cos(phi)[:, None] * nn + np.sin(phi)[:, None] * bb
        circ = -np.sin(phi)[:, None] * nn + np.cos(phi)[:, None] * bb
        base = c + rad[:, None] * nrm
        head = smoothstep((rs - (ne + 3.0 * hs)) / (2.5 * hs))   # 1 on the head crown
        # beat direction: body cilia sweep backwards, crown cilia reach forward
        d = (-t + 0.45 * circ) * (1 - head[:, None]) + (t + 0.15 * circ) * head[:, None]
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        crown = 10.5 * max(hs, 0.72)
        length = (6.5 + 1.5 * smoothstep((rad - 5) / 10)) * (1 - head) + crown * head
        length *= rj * (smoothstep(rs / 12.0) * 0.6 + 0.4) * P.cilia_scale
        npts = 10
        uu = np.linspace(0, 1, npts)
        phase = 2 * np.pi * rc / 13.0 + 0.8 * rk - 2 * np.pi * P.beat_hz * P.time + rn
        beta0 = 0.40 * (1 - head) + 0.75 * head
        amp = 0.85 * (1 - head) + 0.70 * head
        beta = (beta0[:, None]
                + amp[:, None] * np.sin(phase[:, None] - 2.4 * uu[None, :])
                * (0.25 + 0.75 * uu[None, :]))
        seg = (length / (npts - 1))[:, None, None]
        step = (np.cos(beta)[..., None] * nrm[:, None, :]
                + np.sin(beta)[..., None] * d[:, None, :]) * seg
        step[:, 0, :] = 0
        pts = base[:, None, :] + np.cumsum(step, axis=1)
        radius = np.linspace(0.12, 0.045, npts)[None, :] * np.ones((n, 1))
        radius *= (1 + 0.25 * head)[:, None]

        cu = bpy.data.hair_curves.new("cilia")
        cu.add_curves([npts] * n)
        cu.points.foreach_set("position", (pts * U).astype(np.float32).ravel())
        rflat = (radius * U).astype(np.float32).ravel()
        try:
            cu.points.foreach_set("radius", rflat)
        except Exception:
            at = cu.attributes.get("radius") or cu.attributes.new("radius", "FLOAT", "POINT")
            at.data.foreach_set("value", rflat)
        ob = bpy.data.objects.new("cilia", cu)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    # -- what is inside
    def build_organelles(self):
        """Laid out for the paper's cell (body 150 um long, 20 um radius), then
        fitted to this one: along by ks, sizes by P.size."""
        P, rng, hs = self.P, self.rng, self.P.head_scale
        ks, kr, L = P.s_body / 150.0, P.size, self.L
        obs = {}
        ms = np.array([80.0, 99.0]) * ks
        mc = self.point(ms, np.array([0.18, 0.15]), np.array([0.6, 3.6]))
        stretch = np.array([1.45, 1.35]) * min(1.0, ks / kr * 1.3)
        obs["macronucleus"] = blobs("macronucleus", mc, np.array([7.2, 6.6]) * kr, 4,
                                    axes=self.at(self.T, ms) + [[0, 0.3, 0.2]] * 2,
                                    stretch=np.maximum(stretch, 1.0), noise=0.012, rng=rng)
        obs["micronucleus"] = blobs("micronucleus",
                                    self.point([90.0 * ks], np.array([0.42]), np.array([2.2])),
                                    [2.3 * kr], 3)
        obs["vacuole"] = blobs("contractile_vacuole",
                               self.point(np.array([27.0, 128.0]) * ks, np.array([0.15, 0.2]),
                                          np.array([1.0, 4.0])),
                               np.array([5.0, 3.2]) * kr, 4)
        n = 9
        fs = rng.uniform(42, 122, n) * ks
        fr = rng.uniform(2.6, 5.6, n) * kr
        fc = self.point(fs, rng.uniform(0.25, 0.62, n), rng.uniform(0, 2 * np.pi, n))
        obs["food"] = blobs("food_vacuoles", fc, fr, 3, noise=0.03, rng=rng)
        cs, cr = [], []
        for c, r in zip(fc, fr):
            m = int(rng.integers(5, 12))
            d = rng.standard_normal((m, 3))
            d = d / np.linalg.norm(d, axis=1, keepdims=True) * rng.uniform(0, 0.55, (m, 1)) * r
            cs.append(c + d)
            cr.append(rng.uniform(0.18, 0.4, m) * r)
        obs["food_bits"] = blobs("food_bits", np.concatenate(cs), np.concatenate(cr), 2,
                                 noise=0.08, rng=rng)
        # granules: the body's stay with the body, the neck's ride with the head
        n = int(5600 * ks * kr * kr) + 200
        gs = rng.triangular(6, 90, 140, n) * ks
        gc = self.point(gs, np.sqrt(rng.uniform(0, 1, n)) * 0.80, rng.uniform(0, 2 * np.pi, n))
        gr = rng.lognormal(-1.25, 0.5, n).clip(0.12, 1.1) * max(kr, 0.75)
        gr = np.minimum(gr, self.at(self.r, gs) * 0.22)
        m = 420
        back = rng.uniform(8 * hs, 330, m)                   # distance back from the tip
        nrho, nphi_ = np.sqrt(rng.uniform(0, 1, m)) * 0.70, rng.uniform(0, 2 * np.pi, m)
        nr = rng.lognormal(-1.25, 0.5, m).clip(0.12, 1.1)
        keep = (L - back) > P.s_body * 0.95
        ns = (L - back)[keep]
        nc = self.point(ns, nrho[keep], nphi_[keep])
        nr = np.minimum(nr[keep], self.at(self.r, ns) * 0.30)
        obs["granules"] = blobs("granules", np.vstack([gc, nc]), np.concatenate([gr, nr]), 2)
        # extrusomes (toxicysts): thin rods packed in the head, pointing forward
        n = 46
        es = L - rng.uniform(4.0, 10.5, n) * hs
        ec = self.point(es, rng.uniform(0.1, 0.62, n), rng.uniform(0, 2 * np.pi, n))
        ax = self.at(self.T, es) + rng.normal(0, 0.16, (n, 3))
        obs["extrusomes"] = blobs("extrusomes", ec, np.full(n, 0.2 * max(hs, 0.6)), 1,
                                  axes=ax, stretch=rng.uniform(9, 15, n) * hs / max(hs, 0.6))
        return obs

    def build(self):
        parts = {"pellicle": self.build_surface(), "cilia": self.build_cilia()}
        parts.update(self.build_organelles())
        return parts


def remove_parts(parts):
    for ob in parts.values():
        data = ob.data
        bpy.data.objects.remove(ob)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        else:
            bpy.data.hair_curves.remove(data)


# ------------------------------------------------------------------ materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes.new("ShaderNodeOutputMaterial")


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k.startswith("_"):
            setattr(n, k[1:], v)
        else:
            n.inputs[k].default_value = v
    return n


def ramp(nt, stops, interp="LINEAR"):
    n = nt.nodes.new("ShaderNodeValToRGB")
    n.color_ramp.interpolation = interp
    el = n.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, col) in zip(el, stops):
        e.position = pos
        e.color = col
    return n


def glow_shell(name, edge, core, strength=1.0, blend=0.35, alpha=0.0, power=(0.0, 1.0)):
    """Transparent surface whose silhouette edges glow: the fluorescence look."""
    m, nt, out = new_mat(name)
    lw = node(nt, "ShaderNodeLayerWeight", Blend=blend)
    inv = node(nt, "ShaderNodeMath", _operation="SUBTRACT")
    inv.inputs[0].default_value = 1.0
    nt.links.new(lw.outputs["Facing"], inv.inputs[1])      # 1 facing camera, 0 at edge
    r = ramp(nt, [(power[0], (*edge, 1)), (power[1], (*core, 1))])
    nt.links.new(inv.outputs[0], r.inputs[0])
    em = node(nt, "ShaderNodeEmission", Strength=strength)
    nt.links.new(r.outputs["Color"], em.inputs["Color"])
    tr = node(nt, "ShaderNodeBsdfTransparent", Color=(1 - alpha, 1 - alpha, 1 - alpha, 1))
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    return m


def mat_pellicle_glow():
    """Body wall: clear, edges glow, and the pleat grooves carry bright bands.
    The far wall is dimmed so the near one reads in front of it."""
    m, nt, out = new_mat("pellicle")
    lw = node(nt, "ShaderNodeLayerWeight", Blend=0.40)
    edge = ramp(nt, [(0.0, (0, 0, 0, 1)), (0.55, (0.004, 0.022, 0.034, 1)),
                     (0.88, (0.03, 0.20, 0.27, 1)), (1.0, (0.30, 0.75, 0.80, 1))])
    nt.links.new(lw.outputs["Facing"], edge.inputs[0])
    at = node(nt, "ShaderNodeAttribute", _attribute_name="pleat")
    band = ramp(nt, [(0.0, (0, 0, 0, 1)), (0.5, (0, 0, 0, 1)),
                     (0.88, (0.015, 0.13, 0.15, 1)), (1.0, (0.05, 0.36, 0.34, 1))])
    nt.links.new(at.outputs["Fac"], band.inputs[0])
    mix = node(nt, "ShaderNodeMixRGB", _blend_type="ADD", Fac=1.0)
    nt.links.new(edge.outputs["Color"], mix.inputs[1])
    nt.links.new(band.outputs["Color"], mix.inputs[2])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    back = node(nt, "ShaderNodeMapRange")
    back.inputs["To Min"].default_value = 1.0
    back.inputs["To Max"].default_value = 0.30
    nt.links.new(geo.outputs["Backfacing"], back.inputs["Value"])
    em = node(nt, "ShaderNodeEmission")
    nt.links.new(mix.outputs["Color"], em.inputs["Color"])
    nt.links.new(back.outputs[0], em.inputs["Strength"])
    tr = node(nt, "ShaderNodeBsdfTransparent", Color=(0.90, 0.955, 0.96, 1))
    gl = node(nt, "ShaderNodeBsdfGlossy", Color=(0.035, 0.05, 0.055, 1), Roughness=0.30)
    add = nt.nodes.new("ShaderNodeAddShader")
    add2 = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], add2.inputs[0])
    nt.links.new(gl.outputs[0], add2.inputs[1])
    nt.links.new(add2.outputs[0], out.inputs["Surface"])
    return m


def mat_cilia_glow():
    m, nt, out = new_mat("cilia")
    info = nt.nodes.new("ShaderNodeHairInfo")
    r = ramp(nt, [(0.0, (0.015, 0.09, 0.11, 1)), (0.7, (0.05, 0.17, 0.19, 1)),
                  (1.0, (0.16, 0.34, 0.34, 1))])
    nt.links.new(info.outputs["Intercept"], r.inputs[0])
    em = node(nt, "ShaderNodeEmission", Strength=1.0)
    nt.links.new(r.outputs["Color"], em.inputs["Color"])
    tr = node(nt, "ShaderNodeBsdfTransparent", Color=(0.86, 0.86, 0.86, 1))
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    return m


def mat_granules():
    """Lit, slightly glowing beads whose colour varies from one to the next."""
    m, nt, out = new_mat("granules")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    r = ramp(nt, [(0.0, (0.80, 0.42, 0.10, 1)), (0.45, (0.85, 0.66, 0.30, 1)),
                  (0.8, (0.55, 0.70, 0.45, 1)), (1.0, (0.75, 0.85, 0.80, 1))])
    nt.links.new(geo.outputs["Random Per Island"], r.inputs[0])
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(r.outputs["Color"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 0.10
    p.inputs["Roughness"].default_value = 0.35
    p.inputs["Subsurface Weight"].default_value = 0.6
    p.inputs["Subsurface Radius"].default_value = (0.05, 0.05, 0.05)
    nt.links.new(p.outputs[0], out.inputs["Surface"])
    return m


def mat_solid(name, color, emission=0.0, rough=0.5, subsurface=0.0):
    m, nt, out = new_mat(name)
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    if emission:
        p.inputs["Emission Color"].default_value = (*color, 1)
        p.inputs["Emission Strength"].default_value = emission
    if subsurface:
        p.inputs["Subsurface Weight"].default_value = subsurface
        p.inputs["Subsurface Radius"].default_value = (0.3, 0.3, 0.3)
    nt.links.new(p.outputs[0], out.inputs["Surface"])
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


_MATS = {}


def look_glow(parts):
    if _MATS:
        for k, m in _MATS.items():
            assign(parts[k], m)
        return
    assign(parts["pellicle"], mat_pellicle_glow())
    assign(parts["cilia"], mat_cilia_glow())
    assign(parts["macronucleus"], glow_shell("macronucleus", (0.95, 0.35, 0.75), (0.16, 0.03, 0.13),
                                             1.3, blend=0.5, alpha=0.25))
    assign(parts["micronucleus"], glow_shell("micronucleus", (1.0, 0.55, 0.85), (0.3, 0.08, 0.22),
                                             1.6, blend=0.5, alpha=0.3))
    assign(parts["vacuole"], glow_shell("vacuole", (0.55, 0.85, 1.0), (0.0, 0.004, 0.008),
                                        1.5, blend=0.25, power=(0.0, 0.5)))
    assign(parts["food"], glow_shell("food", (0.75, 0.95, 0.35), (0.03, 0.06, 0.012),
                                     0.9, blend=0.4, alpha=0.1))
    assign(parts["food_bits"], mat_solid("food_bits", (0.42, 0.50, 0.10), emission=0.25, subsurface=0.5))
    assign(parts["granules"], mat_granules())
    assign(parts["extrusomes"], mat_solid("extrusomes", (1.0, 0.70, 0.25), emission=0.8))
    for k, ob in parts.items():
        _MATS[k] = ob.data.materials[0]


# ---------------------------------------------------------------- scene setup
def setup_world(strength=1.0):
    w = bpy.data.worlds.new("water")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Window"], sep.inputs[0])
    r = ramp(nt, [(0.0, (0.0008, 0.0030, 0.0075, 1)), (1.0, (0.0030, 0.0130, 0.0260, 1))])
    nt.links.new(sep.outputs["Y"], r.inputs[0])
    nt.links.new(r.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def add_light(name, loc, target, power, size, color):
    li = bpy.data.lights.new(name, "AREA")
    li.energy, li.size, li.color = power, size, color
    ob = bpy.data.objects.new(name, li)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def setup_render(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU setup failed:", e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 24
    sc.cycles.transparent_max_bounces = 64
    sc.cycles.transmission_bounces = 16
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass


def aim_camera(cam, target, direction, dist, lens=60.0):
    cam.data.lens = lens
    t = Vector(target)
    d = Vector(direction).normalized()
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()


def new_camera():
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.data.clip_start, cam.data.clip_end = 0.05, 2000
    cam.data.sensor_width = 36.0
    return cam


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--views", default="top,hero,body,head")
    ap.add_argument("--res", default="1600x900")
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument("--save", default="")
    ap.add_argument("--tag", default="")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = ap.parse_args(argv)

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)

    P = Params()
    cell = Cell(P)
    parts = cell.build()
    look_glow(parts)
    setup_world()
    res = tuple(int(x) for x in a.res.split("x"))
    setup_render(res, a.samples)

    C = cell.C * U
    lo, hi = C.min(0), C.max(0)
    mid = (lo + hi) / 2
    span = max(hi[0] - lo[0], (hi[1] - lo[1]) * res[0] / res[1])

    add_light("key", mid + np.array([-8, -14, 18]), mid, 9000, 14, (1.0, 0.96, 0.9))
    add_light("rim", mid + np.array([10, 16, 6]), mid, 12000, 10, (0.6, 0.85, 1.0))
    cam = new_camera()

    def at(s):
        return cell.at(cell.C, np.array([s]))[0] * U

    lens = 60.0
    fit = lambda width: width * lens / 36.0          # distance to frame a width
    views = {
        "top": (mid, (0, 0, 1), fit(span * 1.12)),
        "hero": (at(150) + np.array([1.5, 2.0, 0]), (-0.55, -0.62, 0.42), fit(span * 0.80)),
        "body": (at(88), (-0.30, -0.72, 0.56), fit(17.0)),
        "head": (at(cell.ne + 4), (-0.75, 0.25, 0.60), fit(7.5)),
        "neck": (at(205), (0.1, -0.6, 0.7), fit(9.0)),
    }
    for v in a.views.split(","):
        tgt, d, dist = views[v]
        aim_camera(cam, tgt, d, dist, lens)
        bpy.context.scene.render.filepath = f"{a.out}/lacrymaria_{v}{a.tag}.png"
        bpy.ops.render.render(write_still=True)
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=a.save, compress=True)


if __name__ == "__main__":
    main()
