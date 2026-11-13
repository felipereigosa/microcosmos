"""Pose file -> compact JSON for the web viewer.
  uv run --with numpy tracking/export_json.py tracking/clipA_pose.npz web/clipA.json"""
import json
import sys
import numpy as np

d = np.load(sys.argv[1])
P = d["P"]
n = 64                                                   # points kept per frame
idx = np.linspace(0, P.shape[1] - 1, n)
i0 = np.floor(idx).astype(int)
i1 = np.minimum(i0 + 1, P.shape[1] - 1)
w = (idx - i0)[None, :, None]
Q = P[:, i0] * (1 - w) + P[:, i1] * w
centre = (Q.reshape(-1, 2).min(0) + Q.reshape(-1, 2).max(0)) / 2
out = {
    "fps": float(d["fps"]), "frames": int(P.shape[0]), "points": n,
    "centre": [round(float(v), 2) for v in centre],
    "P": [round(float(v), 2) for v in (Q - centre).ravel()],
    "L": [round(float(v), 2) for v in d["L"]],
    "r_body": [round(float(v), 3) for v in d["r_body"]],
    "s_body": float(d["s_body"]), "r_neck": round(float(d["r_neck"]), 3),
    "r_max": round(float(d["r_max"]), 3),
    "source": "Motion tracked from footage by James Weiss, Journey to the Microcosmos, "
              "'Lacrymaria: Vicious Long-Necked Predators', 1:10.6 to 1:14.0",
}
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
print(len(out["P"]), "numbers")
