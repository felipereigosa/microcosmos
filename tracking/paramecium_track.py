"""Track a swimming Paramecium in a clip where the stage may be nudged.

  uv run --no-project --with opencv-python-headless --with numpy --with matplotlib \
      tracking/paramecium_track.py clip.webm out_prefix [--t0 s --t1 s] [--thresh 22]

The stage's motion is measured on the scenery (phase correlation from frame to
frame). The cell is the biggest pale, unsaturated blob against the blue water
and the brown debris. For the biggest blob the script records the centre, the
long axis, the length and the half-width along the axis, all in pixels of the
half-size frame and in the scenery's frame of reference. The pointed, wider end
of P. caudatum is the back; the sign of the axis is fixed so that it points to
the front. Writes out_prefix.npz, out_prefix_plot.png and out_prefix_strip.jpg.
"""
import argparse
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--t0", type=float, default=0)
ap.add_argument("--t1", type=float, default=1e9)
ap.add_argument("--thresh", type=float, default=22)
ap.add_argument("--w", type=int, default=960)
a = ap.parse_args()

cap = cv2.VideoCapture(a.src)
fps = cap.get(cv2.CAP_PROP_FPS)
frames, times = [], []
i = 0
while True:
    ok, f = cap.read()
    if not ok:
        break
    t = i / fps
    i += 1
    if t < a.t0 or t > a.t1:
        continue
    h = round(f.shape[0] * a.w / f.shape[1])
    frames.append(cv2.resize(f, (a.w, h), interpolation=cv2.INTER_AREA))
    times.append(t)
F = len(frames)
H, W = frames[0].shape[:2]
print(f"{F} frames, {fps:.2f} fps, {W}x{H}")

# line the frames up on the scenery: shift of each frame against the one before
gray = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (0, 0), 2).astype(np.float32) for f in frames]
win = cv2.createHanningWindow((W, H), cv2.CV_32F)
cam = np.zeros((F, 2))
for k in range(1, F):
    (dx, dy), resp = cv2.phaseCorrelate(gray[k - 1], gray[k], win)
    if resp < 0.05 or np.hypot(dx, dy) > 60:
        dx = dy = 0.0
    cam[k] = cam[k - 1] - (dx, dy)
print("stage drift, px:", np.ptp(cam, axis=0).round(1))

aligned = frames
N = 41                                     # samples along the axis for the width
rec = dict(t=[], c=[], ax=[], L=[], hw=[], area=[], ok=[])
prev = None
for k in range(F):
    hsv = cv2.cvtColor(cv2.GaussianBlur(frames[k], (0, 0), 2), cv2.COLOR_BGR2HSV).astype(np.float32)
    sat, val = hsv[..., 1], hsv[..., 2]
    blue = (hsv[..., 0] > 95) & (hsv[..., 0] < 125)
    s0 = np.median(sat[blue]) if blue.any() else np.median(sat)
    m = ((sat < s0 - a.thresh) & (val > np.median(val[blue]) + 8)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    if k % 100 == 50:
        cv2.imwrite(f"{a.out}_mask{k:04d}.jpg", np.hstack([frames[k], cv2.cvtColor(m * 255, cv2.COLOR_GRAY2BGR)]))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    good = False
    c = ax = np.zeros(2)
    L = area = 0.0
    hw = np.zeros(N)
    if n > 1:
        # the biggest blob, or the one nearest to where the cell was
        idx = 1 + np.argsort(-st[1:, cv2.CC_STAT_AREA])[:4]
        j = idx[0] if prev is None else min(idx, key=lambda q: np.hypot(*(cen[q] - prev)) - 0.02 * st[q, cv2.CC_STAT_AREA])
        area = float(st[j, cv2.CC_STAT_AREA])
        ys, xs = np.nonzero(lab == j)
        x0, y0, bw, bh = st[j, :4]
        edge = x0 <= 1 or y0 <= 1 or x0 + bw >= W - 1 or y0 + bh >= H - 1
        if area > 600:
            P = np.stack([xs, ys], 1).astype(np.float64)
            c = P.mean(0)
            w, v = np.linalg.eigh(np.cov((P - c).T))
            ax = v[:, 1]
            u = (P - c) @ ax
            s = (P - c) @ v[:, 0]
            lo, hi = np.percentile(u, [0.5, 99.5])
            L = hi - lo
            c = c + ax * 0.5 * (lo + hi)
            cs = c + cam[k]                    # in the scenery's frame
            b = np.clip(((u - lo) / max(L, 1e-6) * N).astype(int), 0, N - 1)
            for q in range(N):
                sel = s[b == q]
                hw[q] = 0.5 * (np.percentile(sel, 98) - np.percentile(sel, 2)) if len(sel) > 3 else 0
            good = not edge and L / max(2 * hw.max(), 1) > 2.0
            if good:
                prev = c.copy()
    for key, val in zip(rec, (times[k], c + cam[k] if L else c, ax, L, hw, area, good)):
        rec[key].append(val)
R = {k: np.array(v) for k, v in rec.items()}
ok = R["ok"]
print(f"tracked {ok.sum()} of {F} frames")

# front and back: the widest point of P. caudatum lies behind the middle
Lm = np.median(R["L"][ok])
prof = R["hw"][ok & (np.abs(R["L"] - Lm) < 0.08 * Lm)]
for k in range(F):
    if not ok[k]:
        continue
    hwk = R["hw"][k]
    x = np.linspace(-0.5, 0.5, N)
    skew = (hwk * x).sum() / max(hwk.sum(), 1e-6)       # positive: wider towards +axis
    R["ax"][k] *= -1 if skew > 0 else 1
    if skew > 0:
        R["hw"][k] = hwk[::-1]
# then keep the axis continuous in time, and let the majority decide the sign
ax = R["ax"].copy()
votes = 0
last = None
flips = np.ones(F)
for k in range(F):
    if not ok[k]:
        continue
    if last is not None and ax[k] @ (ax[last] * flips[last]) < 0:
        flips[k] = -1
    last = k
maj = np.sign((flips[ok]).sum()) or 1
for k in range(F):
    if ok[k] and flips[k] * maj < 0:
        R["ax"][k] *= -1
        R["hw"][k] = R["hw"][k][::-1]

np.savez(a.out + ".npz", fps=fps, cam=cam, **R)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

t, c, ax, L = R["t"][ok], R["c"][ok], R["ax"][ok], R["L"][ok]
BL = np.median(L)
dt = np.gradient(t)
v = np.gradient(c, axis=0) / dt[:, None]
fwd = (v * ax).sum(1) / BL
side = (v[:, 0] * -ax[:, 1] + v[:, 1] * ax[:, 0]) / BL
head = np.unwrap(np.arctan2(ax[:, 1], ax[:, 0]))
sm = lambda x, n=5: np.convolve(x, np.ones(n) / n, "same")
fig, axs = plt.subplots(5, 1, figsize=(14, 16))
axs[0].plot(c[:, 0], c[:, 1], lw=0.8)
axs[0].scatter(c[::25, 0], c[::25, 1], c=t[::25], s=12)
for q in range(0, len(t), 12):
    axs[0].plot([c[q, 0], c[q, 0] + ax[q, 0] * BL / 2], [c[q, 1], c[q, 1] + ax[q, 1] * BL / 2], "r", lw=0.4)
axs[0].invert_yaxis(); axs[0].set_aspect("equal"); axs[0].set_title(f"path (red: towards the front), body length {BL:.0f} px")
axs[1].plot(t, sm(fwd)); axs[1].axhline(0, c="k", lw=0.5); axs[1].set_ylabel("forward speed, body lengths/s")
axs[2].plot(t, sm(side)); axs[2].axhline(0, c="k", lw=0.5); axs[2].set_ylabel("sideways speed, BL/s")
axs[3].plot(t, np.degrees(head)); axs[3].set_ylabel("heading, deg")
axs[4].plot(t, L / BL, label="length"); axs[4].plot(t, 2 * R["hw"][ok].max(1) / BL, label="width"); axs[4].legend(); axs[4].set_ylabel("in body lengths")
for q in axs[1:]:
    q.set_xlim(t[0], t[-1]); q.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(a.out + "_plot.png", dpi=70)
pm = np.median(R["hw"][ok], 0) / BL
print("body length px:", round(BL, 1), " median half-width profile back to front, in body lengths:")
print(np.round(pm, 3).tolist())
print("forward speed BL/s: median %.2f, 10th %.2f, 90th %.2f; fraction backwards %.2f" % (np.median(fwd), *np.percentile(fwd, [10, 90]), (fwd < -0.15).mean()))

# a strip of the cell turned to lie along x, every few frames, to see the roll and the groove
tiles = []
sel = np.nonzero(ok)[0][::3][:120]
for k in sel:
    cx, cy = R["c"][k] - cam[k]
    ang = np.degrees(np.arctan2(R["ax"][k][1], R["ax"][k][0]))
    M = cv2.getRotationMatrix2D((cx, cy), ang, 200 / BL)
    M[0, 2] += 120 - cx; M[1, 2] += 45 - cy
    tiles.append(cv2.warpAffine(aligned[k], M, (240, 90)))
rows = [np.hstack(tiles[i:i + 8]) for i in range(0, len(tiles) - 7, 8)]
if rows:
    cv2.imwrite(a.out + "_strip.jpg", np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
