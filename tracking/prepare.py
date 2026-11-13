"""Turn raw tracking into a clean pose file for Blender.

  uv run --with numpy tracking/prepare.py tracking/clipA.npz tracking/clipA_pose.npz \
      --t0 9.2 --t1 12.6 --px-per-um 3.89

World coordinates are micrometres, camera pan removed, y up. Bad frames
(neck lost or merged with something) are bridged by interpolation, then the
curves are smoothed a little in time. Also measures the body's radius profile
from the tail, so the model can take the shape of this individual.
"""
import argparse
import numpy as np


def gauss_t(a, sigma):
    k = int(sigma * 3) + 1
    x = np.arange(-k, k + 1)
    w = np.exp(-0.5 * (x / sigma) ** 2)
    w /= w.sum()
    pad = np.concatenate([np.repeat(a[:1], k, 0), a, np.repeat(a[-1:], k, 0)])
    return sum(w[i] * pad[i:i + len(a)] for i in range(len(w)))


ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--t0", type=float, default=0)
ap.add_argument("--t1", type=float, default=1e9)
ap.add_argument("--px-per-um", type=float, required=True)
ap.add_argument("--smooth", type=float, default=1.3)      # frames
a = ap.parse_args()

d = np.load(a.src)
sel = (d["t"] >= a.t0) & (d["t"] <= a.t1)
t, pts, hw, cam, frame = d["t"][sel], d["pts"][sel], d["halfwidth"][sel], d["cam"][sel], d["frame"][sel]
ppu = a.px_per_um
F, N, _ = pts.shape

seg = np.linalg.norm(np.diff(pts, axis=1), axis=2)
L = seg.sum(1)
# bad frames: untracked, or the length jumps away from its neighbours
med = np.array([np.nanmedian(L[max(0, i - 4):i + 5]) for i in range(F)])
bad = ~np.isfinite(L) | (np.abs(L - med) > 0.22 * med)
print(f"{F} frames, {bad.sum()} bridged")
good = np.nonzero(~bad)[0]
world = (pts - cam[:, None, :]) / ppu
world[..., 1] *= -1
for i in np.nonzero(bad)[0]:
    lo, hi = good[good < i], good[good > i]
    if len(lo) and len(hi):
        w = (i - lo[-1]) / (hi[0] - lo[-1])
        world[i] = world[lo[-1]] * (1 - w) + world[hi[0]] * w
    else:
        world[i] = world[lo[-1] if len(lo) else hi[0]]
world = gauss_t(world, a.smooth)
seg = np.linalg.norm(np.diff(world, axis=1), axis=2)
L = seg.sum(1)

# radius profile from the tail, median over good frames, one value per um
s_pts = np.concatenate([np.zeros((F, 1)), np.cumsum(np.linalg.norm(np.diff(pts, axis=1), axis=2), axis=1)], axis=1) / ppu
hw_um = hw / ppu
smax = 140
prof = np.full(smax, np.nan)
for k in range(smax):
    v = [np.interp(k, s_pts[i], hw_um[i]) for i in good if s_pts[i, -1] > k + 25]
    if len(v) > 5:
        prof[k] = np.median(v)
valid = np.isfinite(prof)
prof = np.interp(np.arange(smax), np.nonzero(valid)[0], prof[valid])
prof[0] = 0
r_max, s_peak = prof.max(), int(prof.argmax())
# neck radius: typical half-width well beyond the body, on long-necked frames
neck = [np.median(hw_um[i][(s_pts[i] > s_peak * 2 + 15) & (s_pts[i] < s_pts[i, -1] - 12)])
        for i in good if s_pts[i, -1] > s_peak * 2 + 45]
r_neck = float(np.nanmedian(neck)) if neck else 2.0
after = np.nonzero((np.arange(smax) > s_peak) & (prof <= 1.6 * r_neck))[0]
s_body = float(after[0]) if len(after) else float(smax - 1)
prof[int(s_body):] = r_neck
print(f"body: r_max {r_max:.1f} um at s={s_peak}, ends at s={s_body:.0f} um; neck radius {r_neck:.2f} um")
print(f"length um: min {L.min():.0f} max {L.max():.0f}")
np.savez_compressed(a.dst, t=t, frame=frame, P=world, L=L, cam=cam, bad=bad, r_body=prof,
                    r_neck=r_neck, s_body=s_body, r_max=r_max, ppu=ppu, size=d["size"], fps=d["fps"])
