"""Track Lacrymaria in a darkfield clip: body, neck centreline, camera pan.

Run on the laptop:
  uv run --with opencv-python-headless --with scikit-image --with numpy \
      tracking/track.py footage/clipA.mp4 tracking/clipA --t0 0 --t1 18

Writes <out>.npz (per frame: centreline tail->head in image px, half-widths,
length, camera offset) and <out>_overlay.mp4 to check it by eye.
"""
import argparse
import collections

import cv2
import numpy as np
from skimage.morphology import skeletonize

N_PTS = 120            # samples along the centreline
OVERLAYS = [(0, 0, 560, 230), (1340, 860, 1920, 1080)]   # label, scale bar (x0,y0,x1,y1)


def longest_path(skel, dist):
    """Longest geodesic path through a skeleton, as an ordered (n,2) x,y array."""
    ys, xs = np.nonzero(skel)
    if len(xs) < 5:
        return None
    idx = -np.ones(skel.shape, dtype=np.int32)
    idx[ys, xs] = np.arange(len(xs))
    nb = [[] for _ in range(len(xs))]
    h, w = skel.shape
    for i, (y, x) in enumerate(zip(ys, xs)):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and idx[yy, xx] >= 0:
                        nb[i].append((idx[yy, xx], 1.4142 if dy and dx else 1.0))

    def far(src):
        d = np.full(len(xs), np.inf)
        prev = -np.ones(len(xs), dtype=np.int32)
        d[src] = 0
        q = collections.deque([src])
        while q:                      # skeletons are near-trees: BFS with relaxation
            i = q.popleft()
            for j, wgt in nb[i]:
                if d[i] + wgt < d[j]:
                    d[j] = d[i] + wgt
                    prev[j] = i
                    q.append(j)
        d[np.isinf(d)] = -1
        return int(d.argmax()), prev

    a, _ = far(int(np.argmax(dist[ys, xs])))
    b, prev = far(a)
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    p = np.array(path)
    return np.stack([xs[p], ys[p]], axis=1).astype(np.float64)


def resample(path, n):
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, path[:, 0]), np.interp(t, s, path[:, 1])], axis=1), s[-1]


def smooth_path(path, sigma):
    k = int(sigma * 3)
    x = np.arange(-k, k + 1)
    w = np.exp(-0.5 * (x / sigma) ** 2)
    w /= w.sum()
    out = np.empty_like(path)
    for c in range(2):
        # reflect about the end points so the tips do not shrink
        a = path[:, c]
        pad = np.concatenate([2 * a[0] - a[k:0:-1], a, 2 * a[-1] - a[-2:-k - 2:-1]])
        out[:, c] = np.convolve(pad, w, mode="valid")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("out")
    ap.add_argument("--t0", type=float, default=0)
    ap.add_argument("--t1", type=float, default=1e9)
    ap.add_argument("--seed", default="")          # "x,y" of the body in the first frame
    ap.add_argument("--thresh", type=float, default=16)
    ap.add_argument("--cut", type=float, default=6.0)   # mean frame difference that means a cut
    a = ap.parse_args()

    cap = cv2.VideoCapture(a.clip)
    fps = cap.get(cv2.CAP_PROP_FPS)
    f0 = int(a.t0 * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    W, H = int(cap.get(3)), int(cap.get(4))
    vw = cv2.VideoWriter(a.out + "_overlay.mp4", cv2.VideoWriter_fourcc(*"mp4v"), fps, (W // 2, H // 2))
    keep = np.ones((H, W), np.uint8)
    for x0, y0, x1, y1 in OVERLAYS:
        keep[y0:y1, x0:x1] = 0
    hann = cv2.createHanningWindow((W, H), cv2.CV_32F)

    seed = np.array([float(v) for v in a.seed.split(",")]) if a.seed else None
    prev_c = None
    prev_small = None
    cuts = []
    prev_head = None
    prev_bg = None
    cam = np.zeros(2)
    rec = collections.defaultdict(list)
    f = f0
    while f / fps < a.t1:
        ok, bgr = cap.read()
        if not ok:
            break
        g = cv2.GaussianBlur(bgr.max(axis=2), (0, 0), 2.0).astype(np.float32)
        bgl = cv2.GaussianBlur(g, (0, 0), 60)            # slowly varying background
        d = (g - bgl) * keep
        m = (d > a.thresh).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
        small = cv2.resize(g, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
        cut = prev_small is not None and np.abs(small - prev_small).mean() > a.cut
        prev_small = small
        if cut:
            cuts.append(f)
            prev_c, prev_bg = None, None
        rb = bgr[:, :, 2].astype(np.float32) - bgr[:, :, 0].astype(np.float32)
        best, score = -1, -1e18
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area < 2500 or area > 150000:
                continue
            if prev_c is None:
                # after a cut or at the start: the big bluish thing off the border
                sel = lab[y:y + h, x:x + w] == i
                warm = rb[y:y + h, x:x + w][sel].mean()
                border = x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1
                sc = area * (0.3 if border else 1.0) - (1e9 if warm > 0 else 0)
                if seed is not None:
                    sc = -np.linalg.norm(cent[i] - seed)
            else:
                sc = -np.linalg.norm(cent[i] - prev_c)
            if sc > score:
                best, score = i, sc
        seed = None
        ok_frame = best >= 0 and score > -5e8 and (prev_c is None or -score < 250)
        pts = np.full((N_PTS, 2), np.nan)
        hw = np.full(N_PTS, np.nan)
        length = np.nan
        body_c = np.full(2, np.nan)
        org = np.zeros((H, W), np.uint8)
        if ok_frame:
            org = (lab == best).astype(np.uint8)
            dist = cv2.distanceTransform(org, cv2.DIST_L2, 5)
            bx, by, bw, bh, _ = stats[best]
            # the body is the fat part: its centre is the distance-weighted centroid
            fat = dist > 0.6 * dist.max()
            yy, xx = np.nonzero(fat)
            body_c = np.array([xx.mean(), yy.mean()])
            crop = org[by:by + bh, bx:bx + bw].astype(bool)
            path = longest_path(skeletonize(np.pad(crop, 2)), np.pad(dist[by:by + bh, bx:bx + bw], 2))
            if path is not None:
                path += (bx - 2, by - 2)
            if path is not None and len(path) > 20:
                # extend both ends to the mask edge: the skeleton stops short of the tips
                for end in (0, -1):
                    tip = path[end]
                    back = path[min(12, len(path) - 1)] if end == 0 else path[max(-13, -len(path))]
                    dirn = tip - back
                    dirn /= np.linalg.norm(dirn) + 1e-9
                    ext = dist[int(tip[1]), int(tip[0])]
                    extra = tip + dirn * ext
                    path = np.vstack([extra, path]) if end == 0 else np.vstack([path, extra])
                path = smooth_path(path, 6.0)
                pts, length = resample(path, N_PTS)
                # tail end is the one nearer the body centre
                if np.linalg.norm(pts[0] - body_c) > np.linalg.norm(pts[-1] - body_c):
                    pts = pts[::-1].copy()
                xi = np.clip(pts[:, 0].round().astype(int), 0, W - 1)
                yi = np.clip(pts[:, 1].round().astype(int), 0, H - 1)
                hw = dist[yi, xi]
                prev_head = pts[-1]
            prev_c = cent[best]

        # camera pan: phase correlation of the background, organism and overlays removed
        bgim = d.copy()
        bgim[cv2.dilate(org, np.ones((41, 41), np.uint8)) > 0] = 0
        if prev_bg is not None:
            (dx, dy), resp = cv2.phaseCorrelate(prev_bg, bgim, hann)
            if resp > 0.02 and abs(dx) < 80 and abs(dy) < 80:
                cam += (dx, dy)
        else:
            resp = 1.0
        prev_bg = bgim

        rec["frame"].append(f)
        rec["t"].append(f / fps)
        rec["pts"].append(pts)
        rec["halfwidth"].append(hw)
        rec["length"].append(length)
        rec["body"].append(body_c)
        rec["cam"].append(cam.copy())
        rec["resp"].append(resp)
        rec["cut"].append(cut)

        vis = bgr.copy()
        if ok_frame and not np.isnan(pts[0, 0]):
            cs, _ = cv2.findContours(org, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(vis, cs, -1, (0, 160, 255), 1)
            cv2.polylines(vis, [pts.round().astype(np.int32)], False, (0, 255, 0), 3)
            cv2.circle(vis, tuple(pts[-1].round().astype(int)), 9, (0, 0, 255), 2)       # head
            cv2.circle(vis, tuple(pts[0].round().astype(int)), 6, (255, 255, 0), 2)      # tail
        cv2.putText(vis, f"{f / fps:6.2f}s  len {length:6.0f}px  cam {cam[0]:.0f},{cam[1]:.0f}",
                    (600, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
        vw.write(cv2.resize(vis, (W // 2, H // 2), interpolation=cv2.INTER_AREA))
        f += 1
    vw.release()
    np.savez_compressed(a.out + ".npz", fps=fps, size=(W, H),
                        **{k: np.array(v) for k, v in rec.items()})
    L = np.array(rec["length"])
    print("cuts at", [round(c / fps, 2) for c in cuts])
    print(f"frames {len(L)}  tracked {np.isfinite(L).sum()}  length px min/median/max "
          f"{np.nanmin(L):.0f}/{np.nanmedian(L):.0f}/{np.nanmax(L):.0f}  cam end {cam}")


main()
