"""Render the Lacrymaria model driven by a tracked clip.

  blender -b --factory-startup -P blender/animate.py -- \
      --pose tracking/clipA_pose.npz --out /some/dir --views match,orbit

Views:
  match  the footage's own framing: orthographic from above, panning with the
         original camera, so it can be laid next to the clip frame for frame
  orbit  a camera that circles the animal at a low angle
The cell is rebuilt for every frame from that frame's centreline and length.
"""
import argparse
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lacrymaria as lac
from lacrymaria import U


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pose", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--views", default="match,orbit")
    ap.add_argument("--res", default="1280x720")
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--step", type=int, default=2)
    ap.add_argument("--frames", default="")          # e.g. "0,60,120" to test
    ap.add_argument("--head-scale", type=float, default=0.55)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])

    d = np.load(a.pose)
    P2, L, t = d["P"], d["L"], d["t"]
    W, H = (float(v) for v in d["size"])
    ppu = float(d["ppu"])
    idx = [int(v) for v in a.frames.split(",")] if a.frames else list(range(0, len(t), a.step))

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    lac.setup_world()
    res = tuple(int(x) for x in a.res.split("x"))
    lac.setup_render(res, a.samples)
    cam = lac.new_camera()

    allp = P2.reshape(-1, 2)
    lo, hi = allp.min(0), allp.max(0)
    mid = np.array([*(lo + hi) / 2, 0.0]) * U
    extent = float(np.linalg.norm(hi - lo)) * U
    lac.add_light("key", mid + np.array([-8, -14, 18]), mid, 9000, 14, (1.0, 0.96, 0.9))
    lac.add_light("rim", mid + np.array([10, 16, 6]), mid, 12000, 10, (0.6, 0.85, 1.0))

    t_start = time.time()
    for n, f in enumerate(idx):
        P = lac.Params()
        P.r_body, P.s_body, P.r_neck = d["r_body"], float(d["s_body"]), float(d["r_neck"])
        P.size = float(d["r_max"]) / 20.0
        P.head_scale = a.head_scale
        P.cilia_scale = 0.4 + 0.6 * P.size
        P.length = float(L[f])
        P.path = np.column_stack([P2[f], np.zeros(len(P2[f]))])
        P.time = float(t[f] - t[0])
        parts = lac.Cell(P).build()
        lac.look_glow(parts)
        for v in a.views.split(","):
            if v == "match":
                cam.data.type = "ORTHO"
                cam.data.ortho_scale = W / ppu * U
                cx = (W / 2 - d["cam"][f, 0]) / ppu * U
                cy = -(H / 2 - d["cam"][f, 1]) / ppu * U
                cam.location = (cx, cy, 60)
                cam.rotation_euler = (0, 0, 0)
            else:
                cam.data.type = "PERSP"
                u = n / max(len(idx) - 1, 1)
                az = math.radians(-115 + 80 * u)
                el = math.radians(30)
                dirn = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
                lac.aim_camera(cam, mid, dirn, extent * 1.05 * 50 / 36, 50.0)
            bpy.context.scene.render.filepath = f"{a.out}/{v}/{n:04d}.png"
            bpy.ops.render.render(write_still=True)
        lac.remove_parts(parts)
        print(f"frame {n + 1}/{len(idx)}  {time.time() - t_start:.0f}s", flush=True)


main()
