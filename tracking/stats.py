"""Print a summary of a tracking file: jumps, cuts, length over time."""
import sys
import numpy as np
d = np.load(sys.argv[1]); t = d['t']; L = d['length']; cam = d['cam']; b = d['body']; r = d['resp']
dc = np.linalg.norm(np.diff(cam, axis=0), axis=1); db = np.linalg.norm(np.diff(b, axis=0), axis=1)
print('fps', d['fps'], 'frames', len(t))
print('low resp', [(round(float(t[i]), 2), round(float(r[i]), 3)) for i in np.where(r < 0.08)[0]][:40])
print('body jumps', [(round(float(t[i + 1]), 2), int(db[i])) for i in np.where(db > 30)[0]])
print('cam jumps', [(round(float(t[i + 1]), 2), int(dc[i])) for i in np.where(dc > 25)[0]])
print('static frames', int(((dc < 0.05) & (db < 0.05)).sum()))
for i in range(0, len(t), 30):
    print(f"{t[i]:6.2f} len {L[i]:5.0f} cam {cam[i].round()} body {b[i].round()} resp {r[i]:.2f}")
