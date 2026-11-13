// Interactive Lacrymaria: the same procedural model as blender/lacrymaria.py,
// built on the GPU each frame from a centreline, so it can be orbited while it
// hunts and swims. The cell's measurements come from the tracked footage; the
// behaviour is invented (see "behaviour" below) and loops.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import DATA from '../clipA.json';

const N_PLEATS = 15;
const NR = 720;            // rings along the cell
const NPHI = 192;          // vertices around
const HEAD_LEN = 20;
const HEAD = [[0, 0], [0.4, 1.5], [1.5, 2.9], [3.5, 3.9], [6, 4.6], [9.5, 5.9], [13.5, 5.6], [17.5, 3.5], [20, 3.7]];
const HS = 0.55;                                   // head scale
const SIZE = DATA.r_max / 20;                      // body size relative to the paper's cell
const KS = DATA.s_body / 150;
const CILIA_SCALE = 0.4 + 0.6 * SIZE;
const BEAT_HZ = 14;

// ------------------------------------------------------------------ helpers
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] * (1 - t) + ys[hi] * t;
}
function smoothArr(a, sigma) {
  const k = Math.floor(sigma * 3);
  if (k < 1) return a;
  const w = new Float32Array(2 * k + 1);
  let sum = 0;
  for (let i = -k; i <= k; i++) { w[i + k] = Math.exp(-0.5 * (i / sigma) ** 2); sum += w[i + k]; }
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = -k; j <= k; j++) v += w[j + k] * a[Math.min(n - 1, Math.max(0, i + j))];
    out[i] = v / sum;
  }
  return out;
}
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry(7);
const uni = (a, b) => a + (b - a) * rnd();
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// ------------------------------------------------- the cell's shape, on CPU
const HEAD_D = HEAD.map((h) => h[0]), HEAD_R = HEAD.map((h) => h[1]);
const BODY_S = DATA.r_body.map((_, i) => i);

// radius and helix angle along a cell of length L, sampled at n points
function profiles(L, n) {
  const ds = L / (n - 1);
  let r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    let v = s < DATA.s_body ? Math.max(interp(s, BODY_S, DATA.r_body), DATA.r_neck * sstep(s / 6)) : DATA.r_neck;
    if (s > DATA.s_body + 25) v = DATA.r_neck;
    r[i] = v;
  }
  r = smoothArr(r, 2 / ds);
  let rmax = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds, d = L - s;
    const hr = interp(d / HS, HEAD_D, HEAD_R) * HS;
    const w = sstep((HEAD_LEN * HS - d) / (4 * HS));
    r[i] = Math.max(r[i] * (1 - w) + hr * w, s < DATA.s_body ? r[i] : 0) * sstep(s / 1.5) * sstep(d / HS);
    rmax = Math.max(rmax, r[i]);
  }
  let theta = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = L - i * ds;
    const x = Math.min(1, Math.max(0, (r[i] - DATA.r_neck) / Math.max(rmax - DATA.r_neck, 1e-6)));
    theta[i] = (20 + 54 * sstep(x) ** 0.8 + 22 * Math.exp(-(((d - 10 * HS) / (5 * HS)) ** 2))) * Math.PI / 180;
  }
  theta = smoothArr(theta, 3 / ds);
  return { r, theta, ds };
}

const ringData = new Float32Array(NR * 3 * 4);
const ringTex = new THREE.DataTexture(ringData, NR, 3, THREE.RGBAFormat, THREE.FloatType);
ringTex.minFilter = ringTex.magFilter = THREE.NearestFilter;

// --------------------------------------------------------------- behaviour
// Invented, with the footage and the paper as the guide: the animal stays at one
// spot and throws its neck out again and again in different directions, feeling
// around (out in about a second, a few quick part-retractions, back in under a
// second: the timing of the tracked clip), shifting and
// turning a little as it goes; then it pulls the neck in and swims off, spinning
// about its axis, to another spot. Everything is a periodic function of time, so
// the whole thing loops without a seam. Times in seconds of the animal's own time.
const RAD = Math.PI / 180;
const smoother = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const NECK_REST = 28, NECK_SWIM = 15, S_REF = 30;   // um; S_REF is the point of the body that the path moves
// where it stops: place, heading on arrival and on leaving (it turns while it hunts),
// pitch likewise, then the throws of the neck: yaw and pitch from the body's axis in
// degrees, neck length in um, time spent feeling around in s, hook at the tip in degrees
const SITES = [
  { p: [95, -8, 5], yaw: [180, 196], pitch: [6, 2], bouts: [[24, 22, 150, 0.8, 30], [-62, 4, 100, 0.0, -20], [8, 40, 186, 2.1, -45], [70, -20, 88, 0.5, 25]] },
  { p: [-160, -55, 48], yaw: [205, 325], pitch: [10, -14], bouts: [[-35, -25, 120, 0.6, -30], [22, 14, 150, 1.6, 40], [-80, 30, 95, 0.0, 15], [15, -40, 140, 1.0, -35]] },
  { p: [125, -128, -45], yaw: [350, 462], pitch: [-12, 16], bouts: [[40, 30, 135, 0.9, 35], [5, 14, 172, 1.9, -30], [85, 45, 110, 0.4, 20]] },
];
const BOUTS = [], SEGS = [];
let PERIOD = 0;
{
  const rb = mulberry(99);
  const dirOf = (yaw, pitch) => [Math.cos(pitch * RAD) * Math.cos(yaw * RAD), Math.cos(pitch * RAD) * Math.sin(yaw * RAD), Math.sin(pitch * RAD)];
  let t = 0;
  SITES.forEach((site, k) => {
    const hunt = { type: 'hunt', site, t0: t };
    t += 0.6;
    for (const [yaw, pitch, len, dwell, hook] of site.bouts) {
      const ext = 0.45 + len / 260, ret = 0.4 + len / 330;
      BOUTS.push({ a: t, b: t + ext, c: t + ext + dwell, e: t + ext + dwell + ret, yaw: yaw * RAD, pitch: pitch * RAD, hook: hook * RAD, len,
        dips: Math.round(dwell / 0.75), dip: 0.18 + 0.2 * rb() });
      t += ext + dwell + ret + 0.45 + 0.6 * rb();
    }
    hunt.t1 = t;
    SEGS.push(hunt);
    const next = SITES[(k + 1) % SITES.length];
    const dist = Math.hypot(next.p[0] - site.p[0], next.p[1] - site.p[1], next.p[2] - site.p[2]);
    const d0 = dirOf(site.yaw[1], site.pitch[1]), d1 = dirOf(next.yaw[0], next.pitch[0]), h = 0.42 * dist;
    SEGS.push({ type: 'swim', t0: t, t1: t + 1.2 + dist / 105, turns: Math.max(1, Math.round(dist / 130)),
      P: [site.p, site.p.map((v, i) => v + d0[i] * h), next.p.map((v, i) => v - d1[i] * h), next.p] });
    t = SEGS[SEGS.length - 1].t1;
  });
  PERIOD = t;
}
// smooth noise that repeats exactly every PERIOD: a few sines at whole multiples of the loop
function loopNoise(seed, hzLo, hzHi) {
  const r = mulberry(seed), parts = [];
  for (let i = 0; i < 4; i++) parts.push([2 * Math.PI * Math.max(1, Math.round((hzLo + (hzHi - hzLo) * r()) * PERIOD)) / PERIOD, 6.283 * r(), 0.6 + 0.8 * r()]);
  return (t) => { let v = 0; for (const q of parts) v += q[2] * Math.sin(q[0] * t + q[1]); return v / 2.2; };
}
const NZ = {
  yaw: loopNoise(1, 0.08, 0.3), pitch: loopNoise(2, 0.08, 0.3), roll: loopNoise(3, 0.05, 0.2),
  fwd: loopNoise(4, 0.07, 0.22), side: loopNoise(5, 0.07, 0.22), up: loopNoise(6, 0.07, 0.22),
  a1: loopNoise(7, 0.2, 0.6), a2: loopNoise(8, 0.4, 1.0), b1: loopNoise(9, 0.2, 0.6), b2: loopNoise(10, 0.4, 1.0),
  ha: loopNoise(11, 0.15, 0.5), hb: loopNoise(12, 0.15, 0.5),
};
// how far out the neck is, 0 to 1, and the throw it belongs to (blended between throws)
function neckAt(t, out) {
  const n = BOUTS.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) if (BOUTS[i].a <= t) j = i;
  const q = BOUTS[j], nx = BOUTS[(j + 1) % n];
  const tt = t < q.a ? t + PERIOD : t;                          // before the first throw: still after the last one
  let env = 0;
  if (tt < q.b) env = smoother((tt - q.a) / (q.b - q.a));
  else if (tt < q.c) env = 1 - (q.dips ? q.dip * (0.5 - 0.5 * Math.cos((2 * Math.PI * q.dips * (tt - q.b)) / (q.c - q.b))) : 0);
  else if (tt < q.e) env = 1 - smoother((tt - q.c) / (q.e - q.c));
  const x0 = 0.5 * (q.c + q.e), x1 = nx.a + (nx.a < q.a ? PERIOD : 0);
  const m = smoother((tt - x0) / (x1 - x0));
  out.env = env;
  out.len = q.len;
  out.yaw = q.yaw + (nx.yaw - q.yaw) * m; out.pitch = q.pitch + (nx.pitch - q.pitch) * m; out.hook = q.hook + (nx.hook - q.hook) * m;
}
const B = { C: [0, 0, 0], e1: [1, 0, 0], e2: [0, 1, 0], e3: [0, 0, 1], roll: 0, Ln: NECK_REST, env: 0, yaw: 0, pitch: 0, hook: 0, len: 0, swim: 0 };
const nk = {};
function behave(t) {
  t = ((t % PERIOD) + PERIOD) % PERIOD;
  let seg = SEGS[SEGS.length - 1], turnsDone = 0;
  for (const g of SEGS) { if (t >= g.t0 && t < g.t1) { seg = g; break; } if (g.type === 'swim') turnsDone += g.turns; }
  const u = (t - seg.t0) / (seg.t1 - seg.t0);
  let d, C, swim = 0, roll = 2 * Math.PI * turnsDone + 0.35 * NZ.roll(t);
  if (seg.type === 'hunt') {
    const w = smoother(u / 0.12) * smoother((1 - u) / 0.12), k = smoother(u), st = seg.site;
    const yaw = (st.yaw[0] + (st.yaw[1] - st.yaw[0]) * k + 9 * w * NZ.yaw(t)) * RAD, pitch = (st.pitch[0] + (st.pitch[1] - st.pitch[0]) * k + 6 * w * NZ.pitch(t)) * RAD;
    d = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
    C = [st.p[0], st.p[1], st.p[2]];
    B.creep = w;
  } else {
    const q = smoother(u), r = 1 - q, P = seg.P;
    C = [0, 0, 0]; d = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      C[i] = r * r * r * P[0][i] + 3 * r * r * q * P[1][i] + 3 * r * q * q * P[2][i] + q * q * q * P[3][i];
      d[i] = r * r * (P[1][i] - P[0][i]) + 2 * r * q * (P[2][i] - P[1][i]) + q * q * (P[3][i] - P[2][i]);
    }
    const dl = Math.hypot(d[0], d[1], d[2]); d = d.map((v) => v / dl);
    swim = smoother(u / 0.15) * smoother((1 - u) / 0.15);
    roll += 2 * Math.PI * seg.turns * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));   // spins up and down again
    B.creep = 0;
  }
  const hl = Math.hypot(d[0], d[1]);
  const e2 = [-d[1] / hl, d[0] / hl, 0], e3 = [-d[2] * e2[1], d[2] * e2[0], d[0] * e2[1] - d[1] * e2[0]];
  const c = B.creep, f = 13 * c * NZ.fwd(t), sd = 6 * c * NZ.side(t), up = 4 * c * NZ.up(t);
  const hx = 3.2 * swim * Math.cos(roll), hy = 3.2 * swim * Math.sin(roll);     // it swims along a narrow helix
  for (let i = 0; i < 3; i++) C[i] += d[i] * f + e2[i] * (sd + hx) + e3[i] * (hy) + (i === 2 ? up : 0);
  neckAt(t, nk);
  const rest = NECK_REST + (NECK_SWIM - NECK_REST) * swim;
  B.Ln = rest + (nk.len - rest) * nk.env;
  B.C = C; B.e1 = d; B.e2 = e2; B.e3 = e3; B.roll = roll; B.swim = swim;
  B.env = nk.env; B.yaw = nk.yaw; B.pitch = nk.pitch; B.hook = nk.hook;
  return B;
}

let cx = new Float32Array(NR), cy = new Float32Array(NR), cz = new Float32Array(NR);
function updateRings(time) {
  const b = behave(time), L = DATA.s_body + b.Ln;
  const { r, theta, ds } = profiles(L, NR);
  // The centreline, shaped as in the tracked clip: the neck is a smooth curve with no
  // waves in it. It turns where it leaves the body and is nearly straight beyond that,
  // so it goes out along a line and comes back along itself; the long neck only sways
  // as a gentle arc. Drawn in, it is livelier: it swings about and its tip curls over.
  const s0 = 0.8 * DATA.s_body, out = b.env, slack = 1 - out;
  const yaw = b.yaw + 0.16 * out * NZ.a1(time) + 0.30 * slack * NZ.a2(time), pitch = b.pitch + 0.13 * out * NZ.b1(time) + 0.24 * slack * NZ.b2(time);
  const arcA = 0.0035 * NZ.ha(time), arcB = 0.0028 * NZ.hb(time), hook = b.hook * (0.2 + 0.8 * slack);
  let x = 0, y = 0, z = 0, ref = 0;
  for (let i = 0; i < NR; i++) {
    const s = i * ds, sn = Math.max(0, s - s0), turn = 1 - Math.exp(-sn / 16), tip = Math.exp(-(L - s) / 14) * sstep(sn / 12);
    const al = yaw * turn + arcA * sn + hook * tip;
    const be = pitch * turn + arcB * sn;
    const c1 = Math.cos(be) * Math.cos(al), c2 = Math.cos(be) * Math.sin(al), c3 = Math.sin(be);
    if (i > 0) {
      x += (b.e1[0] * c1 + b.e2[0] * c2 + b.e3[0] * c3) * ds; y += (b.e1[1] * c1 + b.e2[1] * c2 + b.e3[1] * c3) * ds; z += (b.e1[2] * c1 + b.e2[2] * c2 + b.e3[2] * c3) * ds;
    }
    cx[i] = x; cy[i] = y; cz[i] = z;
    if (s <= S_REF) ref = i;
  }
  const ox = b.C[0] - cx[ref], oy = b.C[1] - cy[ref], oz = b.C[2] - cz[ref];
  const sx = smoothArr(cx, 1.5 / ds), sy = smoothArr(cy, 1.5 / ds), sz = smoothArr(cz, 1.5 / ds);
  // the frame is carried along the cell without twisting, starting from the body's roll
  const cr = Math.cos(b.roll), sr = Math.sin(b.roll);
  let nx = cr * b.e2[0] + sr * b.e3[0], ny = cr * b.e2[1] + sr * b.e3[1], nz = cr * b.e2[2] + sr * b.e3[2];
  let psi = 0;
  for (let i = 0; i < NR; i++) {
    const a = Math.max(0, i - 1), c = Math.min(NR - 1, i + 1);
    let tx = sx[c] - sx[a], ty = sy[c] - sy[a], tz = sz[c] - sz[a];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const dn = nx * tx + ny * ty + nz * tz;
    nx -= dn * tx; ny -= dn * ty; nz -= dn * tz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const rs = Math.max(r[i], 0.4 * DATA.r_neck + 0.05);
    psi -= (Math.tan(theta[i]) / rs) * ds;
    const perp = (2 * Math.PI * rs * Math.cos(theta[i])) / N_PLEATS;
    const ne = L - HEAD_LEN * HS;
    const depth = Math.min(0.34 * perp, 1.1) * sstep(r[i] / (0.5 * DATA.r_neck)) * (1 - 0.6 * sstep((i * ds - ne) / (4 * HS)));
    let o = i * 4;
    ringData[o] = sx[i] + ox; ringData[o + 1] = sy[i] + oy; ringData[o + 2] = sz[i] + oz; ringData[o + 3] = r[i];
    o = (NR + i) * 4;
    ringData[o] = nx; ringData[o + 1] = ny; ringData[o + 2] = nz; ringData[o + 3] = psi;
    o = (2 * NR + i) * 4;
    ringData[o] = tx; ringData[o + 1] = ty; ringData[o + 2] = tz; ringData[o + 3] = depth;
  }
  ringTex.needsUpdate = true;
  return L;
}

// ------------------------------------------------------------------ shaders
const RING_GLSL = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D uRings;
uniform float uL;
const float NR = ${NR}.0;
const float PLEATS = ${N_PLEATS}.0;
const float TAU = 6.28318530718;
struct Ring { vec3 C; float r; vec3 N; float psi; vec3 T; float depth; };
Ring ringI(int i, float t) {
  vec4 a0 = texelFetch(uRings, ivec2(i, 0), 0), a1 = texelFetch(uRings, ivec2(i + 1, 0), 0);
  vec4 b0 = texelFetch(uRings, ivec2(i, 1), 0), b1 = texelFetch(uRings, ivec2(i + 1, 1), 0);
  vec4 c0 = texelFetch(uRings, ivec2(i, 2), 0), c1 = texelFetch(uRings, ivec2(i + 1, 2), 0);
  vec4 a = mix(a0, a1, t), b = mix(b0, b1, t), c = mix(c0, c1, t);
  return Ring(a.xyz, a.w, normalize(b.xyz), b.w, normalize(c.xyz), c.w);
}
Ring ringAt(float s) {
  float f = clamp(s / uL, 0.0, 1.0) * (NR - 1.0);
  float i = min(floor(f), NR - 2.0);
  return ringI(int(i), f - i);
}
vec3 inCell(float s, float rho, float phi) {
  Ring g = ringAt(s);
  return g.C + g.r * rho * (cos(phi) * g.N + sin(phi) * cross(g.T, g.N));
}
`;

const common = { uRings: { value: ringTex }, uL: { value: 100 }, uTime: { value: 0 }, uPx: { value: 500 } };
const mat = (o) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, ...o, uniforms: { ...common, ...(o.uniforms || {}) } });
const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };

// -- pellicle
function makePellicle() {
  const pos = new Float32Array(NR * NPHI * 3);
  for (let i = 0; i < NR; i++) for (let j = 0; j < NPHI; j++) {
    const o = (i * NPHI + j) * 3;
    pos[o] = i; pos[o + 1] = (j / NPHI) * 2 * Math.PI;
  }
  const idx = new Uint32Array((NR - 1) * NPHI * 6);
  let o = 0;
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NPHI; j++) {
    const a = i * NPHI + j, b = i * NPHI + ((j + 1) % NPHI);
    idx[o++] = a; idx[o++] = b; idx[o++] = b + NPHI; idx[o++] = a; idx[o++] = b + NPHI; idx[o++] = a + NPHI;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = mat({
    ...ADD, side: THREE.DoubleSide,
    vertexShader: RING_GLSL + /* glsl */ `
      out float vGroove; out vec3 vView; out float vFront;
      void main() {
        Ring g = ringI(int(min(position.x, NR - 2.0)), position.x > NR - 1.5 ? 1.0 : 0.0);
        float phi = position.y;
        float groove = pow(0.5 + 0.5 * cos(PLEATS * (phi - g.psi)), 2.2);
        vec3 nrm = cos(phi) * g.N + sin(phi) * cross(g.T, g.N);
        vec4 mv = modelViewMatrix * vec4(g.C + max(g.r - g.depth * groove, 0.0) * nrm, 1.0);
        vGroove = groove; vView = mv.xyz;
        vFront = dot(normalize(mat3(modelViewMatrix) * nrm), normalize(-mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      in float vGroove; in vec3 vView; in float vFront;
      out vec4 frag;
      vec3 ramp4(float x, float p1, float p2, vec3 c1, vec3 c2, vec3 c3) {
        if (x < p1) return mix(vec3(0.0), c1, x / p1);
        if (x < p2) return mix(c1, c2, (x - p1) / (p2 - p1));
        return mix(c2, c3, (x - p2) / (1.0 - p2));
      }
      void main() {
        // every pow() base is clamped: rounding can push it just below zero, pow() then
        // gives NaN, and the bloom smears one NaN pixel over the whole frame (a black flash)
        vec3 cr = cross(dFdx(vView), dFdy(vView));
        float facing = dot(cr, cr) > 0.0 ? abs(dot(normalize(cr), normalize(-vView))) : 1.0;
        float e = pow(clamp(1.0 - facing, 0.0, 1.0), 1.6);
        vec3 edge = ramp4(e, 0.45, 0.82, vec3(0.008, 0.018, 0.024), vec3(0.07, 0.15, 0.18), vec3(0.46, 0.62, 0.68));
        vec3 band = ramp4(vGroove, 0.5, 0.88, vec3(0.0), vec3(0.035, 0.085, 0.10), vec3(0.13, 0.25, 0.27));
        float back = vFront > 0.0 ? 1.0 : 0.30;
        // pale and grey-blue, as a ciliate looks in darkfield next to the debris: a thin
        // bright outline, fine striations, and a faint haze for the body itself
        frag = vec4((edge + band + vec3(0.010, 0.015, 0.018)) * back * 0.75, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// -- cilia: body ones are fixed from the tail, neck ones from the head
function makeCilia() {
  const Lref = Math.max(...DATA.L) + 30, n = 1400;
  const { r, theta, ds } = profiles(Lref, n);
  const ne = Lref - HEAD_LEN * HS;
  const w = new Float32Array(n), fromTail = new Float32Array(n), fromHead = new Float32Array(n), ss = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    ss[i] = s;
    let dens = 1 / 1.25;
    if (s > ne + 3.5 * HS) dens = 1 / (0.7 * Math.max(HS, 0.6));
    if (s > ne + 14.5 * HS || r[i] < 0.25 * DATA.r_neck) dens = 0;
    w[i] = (dens * ds) / Math.cos(theta[i]);
  }
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += w[i]; fromTail[i] = acc; }
  acc = 0;
  const hs2 = new Float32Array(n), hd = new Float32Array(n);       // increasing count from the head
  for (let i = n - 1; i >= 0; i--) { acc += w[i]; fromHead[i] = acc; }
  for (let i = 0; i < n; i++) { hs2[i] = fromHead[n - 1 - i]; hd[i] = Lref - ss[n - 1 - i]; }
  const roots = [];                                   // [a, type, row, jitter, noise]
  for (let k = 0; k < N_PLEATS; k++) {
    for (let m = rnd(); m < fromTail[n - 1]; m++) {
      const s = interp(m, fromTail, ss);
      if (s <= DATA.s_body) roots.push([s, 0, k, uni(0.85, 1.12), gauss() * 0.25]);
    }
    for (let m = rnd(); m < hs2[n - 1]; m++) {
      const d = interp(m, hs2, hd);
      if (Lref - d > DATA.s_body) roots.push([d, 1, k, uni(0.85, 1.12), gauss() * 0.25]);
    }
  }
  const SEG = 9, nv = roots.length * SEG * 2;
  const pos = new Float32Array(nv * 3), anc = new Float32Array(nv * 4);
  let o = 0;
  for (const [a, type, k, jit, noise] of roots) for (let q = 0; q < SEG; q++) for (let e = 0; e < 2; e++) {
    pos[o * 3] = q + e; pos[o * 3 + 1] = jit; pos[o * 3 + 2] = noise;
    anc[o * 4] = a; anc[o * 4 + 1] = type; anc[o * 4 + 2] = k; o++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAnchor', new THREE.BufferAttribute(anc, 4));
  const m = mat({
    ...ADD,
    uniforms: { uSBody: { value: DATA.s_body }, uRNeck: { value: DATA.r_neck } },
    vertexShader: RING_GLSL + /* glsl */ `
      in vec4 aAnchor;
      uniform float uTime, uSBody, uRNeck, uPx;
      out float vU; out float vGain;
      const float HS = ${HS.toFixed(3)};
      void main() {
        float a = aAnchor.x, type = aAnchor.y, k = aAnchor.z;
        float s = type < 0.5 ? a : uL - a;
        bool vis = type < 0.5 ? s <= uSBody : s > uSBody;
        Ring g = ringAt(s);
        float phi = g.psi + TAU * k / PLEATS;
        vec3 B = cross(g.T, g.N);
        vec3 nrm = cos(phi) * g.N + sin(phi) * B, circ = -sin(phi) * g.N + cos(phi) * B;
        float rad = g.r - g.depth;
        float ne = uL - ${HEAD_LEN}.0 * HS;
        float head = smoothstep(0.0, 1.0, (s - (ne + 3.0 * HS)) / (2.5 * HS));
        vec3 d = normalize(mix(-g.T + 0.45 * circ, g.T + 0.15 * circ, head));
        float len = mix(6.5 + 1.5 * smoothstep(0.0, 1.0, (rad - 5.0) / 10.0), 10.5 * max(HS, 0.72), head);
        len *= position.y * (smoothstep(0.0, 1.0, s / 12.0) * 0.6 + 0.4) * ${CILIA_SCALE.toFixed(3)};
        float rc = type < 0.5 ? s : -a;
        float phase = TAU * rc / 13.0 + 0.8 * k - TAU * ${BEAT_HZ}.0 * uTime + position.z;
        float beta0 = mix(0.40, 0.75, head), amp = mix(0.85, 0.70, head);
        vec3 p = g.C + rad * nrm;
        float seg = len / 9.0;
        for (int q = 1; q <= 9; q++) {
          if (float(q) > position.x + 0.5) break;
          float u = float(q) / 9.0;
          float beta = beta0 + amp * sin(phase - 2.4 * u) * (0.25 + 0.75 * u);
          p += (cos(beta) * nrm + sin(beta) * d) * seg;
        }
        vU = position.x / 9.0;
        vec4 mvp = modelViewMatrix * vec4(p, 1.0);
        vGain = clamp(${(0.075).toFixed(3)} * uPx / -mvp.z, 0.0, 1.0);   // real width in pixels, capped at one
        gl_Position = (!vis || g.r < 0.25 * uRNeck) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      in float vU; in float vGain; out vec4 frag;
      uniform float uGain;
      void main() {
        vec3 c = vU < 0.7 ? mix(vec3(0.03, 0.075, 0.09), vec3(0.075, 0.14, 0.16), vU / 0.7)
                          : mix(vec3(0.075, 0.14, 0.16), vec3(0.20, 0.29, 0.31), (vU - 0.7) / 0.3);
        frag = vec4(c * uGain * vGain, 1.0);
      }`,
  });
  m.uniforms.uGain = { value: 0.55 };
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.userData.count = roots.length;
  return lines;
}

// -- small round things as shaded point sprites: granules, food, extrusome tips
function makeBeads() {
  const P = [];                                        // a, type, rho, phi, radius, tint
  const tri = (a, c, b) => { const u = rnd(), f = (c - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); };
  const logn = () => Math.min(1.1, Math.max(0.12, Math.exp(-1.25 + 0.5 * gauss())));
  const nBody = Math.floor(5600 * KS * SIZE * SIZE) + 200;
  for (let i = 0; i < nBody; i++) P.push([tri(6, 90, 140) * KS, 0, Math.sqrt(rnd()) * 0.8, uni(0, 6.283), logn() * Math.max(SIZE, 0.75), rnd()]);
  for (let i = 0; i < 420; i++) P.push([uni(8 * HS, 330), 1, Math.sqrt(rnd()) * 0.7, uni(0, 6.283), logn(), rnd()]);
  const food = [];
  for (let i = 0; i < 9; i++) {
    const f = { s: uni(42, 122) * KS, r: uni(2.6, 5.6) * SIZE, rho: uni(0.25, 0.62), phi: uni(0, 6.283) };
    food.push(f);
    const m = 5 + Math.floor(rnd() * 7);
    for (let j = 0; j < m; j++) P.push([f.s + gauss() * f.r * 0.3, 0, Math.max(0, f.rho + gauss() * 0.08), f.phi + gauss() * 0.15, uni(0.18, 0.4) * f.r, 2 + rnd()]);
  }
  const n = P.length, pos = new Float32Array(n * 3), b = new Float32Array(n * 4);
  P.forEach((p, i) => { pos.set([p[0], p[1], p[5]], i * 3); b.set([p[2], p[3], p[4], 0], i * 4); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBead', new THREE.BufferAttribute(b, 4));
  const m = mat({
    uniforms: { uSBody: { value: DATA.s_body } },
    vertexShader: RING_GLSL + /* glsl */ `
      in vec4 aBead; uniform float uSBody, uPx;
      out float vTint; out float vDim;
      void main() {
        float s = position.y < 0.5 ? position.x : uL - position.x;
        bool vis = position.y < 0.5 || s > uSBody * 0.95;
        Ring g = ringAt(s);
        float rad = min(aBead.z, g.r * (position.y < 0.5 ? 0.22 : 0.30));
        vec4 mv = modelViewMatrix * vec4(inCell(s, aBead.x, aBead.y), 1.0);
        vTint = position.z;
        float px = 2.0 * rad * uPx / -mv.z;
        gl_PointSize = max(1.5, px);
        vDim = min(1.0, (px * px) / 2.25);
        gl_Position = vis ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      in float vTint; in float vDim; out vec4 frag;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
        vec3 base;
        if (vTint > 1.5) base = vec3(0.42, 0.50, 0.10);
        else if (vTint < 0.45) base = mix(vec3(0.80, 0.42, 0.10), vec3(0.85, 0.66, 0.30), vTint / 0.45);
        else if (vTint < 0.8) base = mix(vec3(0.85, 0.66, 0.30), vec3(0.55, 0.70, 0.45), (vTint - 0.45) / 0.35);
        else base = mix(vec3(0.55, 0.70, 0.45), vec3(0.75, 0.85, 0.80), (vTint - 0.8) / 0.2);
        float lam = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
        float rim = pow(1.0 - n.z, 2.0);
        frag = vec4((base * (0.07 + 0.36 * lam) + vec3(0.25, 0.45, 0.55) * rim * 0.13) * vDim, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return { pts, food };
}

// -- glowing shells: nuclei, vacuoles, food vacuoles
const shellGeo = new THREE.IcosahedronGeometry(1, 5);
function makeShell(o) {
  const m = mat({
    ...ADD,
    uniforms: {
      uAnchor: { value: new THREE.Vector3(o.s, o.rho, o.phi) }, uRad: { value: o.r }, uStretch: { value: o.stretch || 1 },
      uEdge: { value: new THREE.Color(...o.edge) }, uCore: { value: new THREE.Color(...o.core) },
      uStrength: { value: o.strength }, uPow: { value: o.pow || 1.6 },
    },
    vertexShader: RING_GLSL + /* glsl */ `
      uniform vec3 uAnchor; uniform float uRad, uStretch;
      out vec3 vN; out vec3 vView;
      void main() {
        Ring g = ringAt(uAnchor.x);
        vec3 v = position * uRad;
        v += dot(v, g.T) * g.T * (uStretch - 1.0);
        vec3 nn = position - dot(position, g.T) * g.T * (1.0 - 1.0 / uStretch);
        vec4 mv = modelViewMatrix * vec4(inCell(uAnchor.x, uAnchor.y, uAnchor.z) + v, 1.0);
        vN = mat3(modelViewMatrix) * nn; vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uEdge, uCore; uniform float uStrength, uPow;
      in vec3 vN; in vec3 vView; out vec4 frag;
      void main() {
        float f = clamp(1.0 - abs(dot(normalize(vN), normalize(-vView))), 0.0, 1.0);   // see the pellicle
        frag = vec4(mix(uCore, uEdge, pow(f, uPow)) * uStrength, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(shellGeo, m);
  mesh.frustumCulled = false;
  return mesh;
}

// -- extrusomes: short rods in the head
function makeExtrusomes() {
  const n = 46, pos = new Float32Array(n * 2 * 3), b = new Float32Array(n * 2 * 4);
  for (let i = 0; i < n; i++) {
    const d = uni(4, 10.5) * HS, rho = uni(0.1, 0.62), phi = uni(0, 6.283), len = uni(9, 15) * 0.2 * HS;
    for (let e = 0; e < 2; e++) { pos.set([d, rho, phi], (i * 2 + e) * 3); b.set([(e - 0.5) * 2 * len, gauss() * 0.16, gauss() * 0.16, 0], (i * 2 + e) * 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRod', new THREE.BufferAttribute(b, 4));
  const m = mat({
    ...ADD,
    vertexShader: RING_GLSL + /* glsl */ `
      in vec4 aRod; uniform float uPx; out float vGain;
      void main() {
        float s = uL - position.x;
        Ring g = ringAt(s);
        vec3 ax = normalize(g.T + aRod.y * g.N + aRod.z * cross(g.T, g.N));
        vec4 mv = modelViewMatrix * vec4(inCell(s, position.y, position.z) + ax * aRod.x, 1.0);
        vGain = clamp(0.12 * uPx / -mv.z, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `precision highp float; in float vGain; out vec4 frag; void main() { frag = vec4(vec3(1.0, 0.62, 0.2) * 0.35 * vGain, 1.0); }`,
  });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  return l;
}

// -- the water: drifting motes, so there is something to move through
function makeMotes() {
  const n = 900, pos = new Float32Array(n * 3), b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos.set([uni(-420, 420), uni(-320, 320), uni(-160, 160)], i * 3);
    b.set([Math.exp(uni(-1.2, 1.0)), rnd() * 6.283, uni(0.3, 1), rnd()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMote', new THREE.BufferAttribute(b, 4));
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: { uTime: common.uTime, uPx: common.uPx },
    vertexShader: /* glsl */ `
      in vec4 aMote; uniform float uTime, uPx; out float vA;
      void main() {
        float t = uTime * 0.35 + aMote.y;
        vec3 p = position + 5.0 * vec3(sin(t * 0.7 + aMote.y * 3.0), cos(t * 0.5 + aMote.w * 9.0), sin(t * 0.3 + aMote.y));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.5, 2.0 * aMote.x * uPx / -mv.z);
        vA = aMote.z * min(1.0, gl_PointSize / 3.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in float vA; out vec4 frag;
      void main() {
        float d = length(gl_PointCoord * 2.0 - 1.0);
        frag = vec4(vec3(0.035, 0.075, 0.10) * vA * smoothstep(1.0, 0.2, d), 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// -- the surroundings, modelled on the debris in the footage (references/debris/):
// flocs are soft clouds, not solid lumps. Each has a dark, dense core, an amber
// body, a pale ragged fringe with glinting grains, and odd things caught in it.
// They are drawn as thousands of soft, see-through puffs. All from a fixed seed.
function makeSurroundings() {
  const env = mulberry(41), eu = (a, b) => a + (b - a) * env();
  const eg = () => Math.sqrt(-2 * Math.log(1 - env())) * Math.cos(2 * Math.PI * env());
  // value noise in 3D, for the mottling and the ragged edges
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const f = (v) => v * v * (3 - 2 * v), u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const L = (a, b, k) => a + (b - a) * k;
    return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
             L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const fbm = (x, y, z) => 0.5 * vnoise(x, y, z) + 0.27 * vnoise(x * 2.1, y * 2.1, z * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3, z * 4.3) + 0.08 * vnoise(x * 8.9, y * 8.9, z * 8.9);
  // where the animal moves, so nothing at its level is placed through it
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < DATA.P.length; i += 2) { x0 = Math.min(x0, DATA.P[i]); x1 = Math.max(x1, DATA.P[i]); y0 = Math.min(y0, DATA.P[i + 1]); y1 = Math.max(y1, DATA.P[i + 1]); }
  const clear = (x, y, m) => x < x0 - m || x > x1 + m || y < y0 - m || y > y1 + m;

  const fringe = [], body = [], core = [], glint = [], cells = [], needles = [];   // puffs: x y z radius r g b a
  const flocs = [];
  const flocAt = (cx, cy, cz, R, hue) => {
    const lobes = [{ p: [0, 0, 0], r: R * eu(0.5, 0.62) }];
    const nl = 2 + Math.floor(env() * 4);
    for (let k = 0; k < nl; k++) {
      const from = lobes[Math.floor(env() * lobes.length)], a = eu(0, 6.283), r = R * eu(0.26, 0.5);
      const d = (from.r + r) * eu(0.55, 0.9);
      lobes.push({ p: [from.p[0] + Math.cos(a) * d, from.p[1] + Math.sin(a) * d, from.p[2] + eu(-0.3, 0.3) * d], r });
    }
    lobes.forEach((l) => flocs.push([cx + l.p[0], cy + l.p[1], cz + l.p[2], l.r]));
    const ox = eu(0, 100), oy = eu(0, 100), oz = eu(0, 100), sc = R / 100;
    const want = Math.floor(5200 * Math.max(0.6, sc * sc));
    for (let i = 0; i < want; i++) {
      const lb = lobes[Math.floor(env() * lobes.length)];
      const px = lb.p[0] + eg() * lb.r * 0.72, py = lb.p[1] + eg() * lb.r * 0.72, pz = lb.p[2] + eg() * lb.r * 0.5;
      let dens = 0;
      for (const l of lobes) { const q = Math.hypot(px - l.p[0], py - l.p[1], (pz - l.p[2]) * 1.4) / l.r; dens += Math.exp(-q * q * 1.6); }
      const big = fbm(px / (R * 0.35) + ox, py / (R * 0.35) + oy, pz / (R * 0.35) + oz);
      const fine = fbm(px / (R * 0.09) + oy, py / (R * 0.09) + oz, pz / (R * 0.09) + ox);
      dens += 1.5 * (big - 0.5) + 0.5 * (fine - 0.5);
      if (dens < 0.22) continue;
      const X = cx + px, Y = cy + py, Z = cz + pz, m = 0.6 + 0.8 * fine;
      if (dens > 0.98) {
        if (env() < 0.45) core.push([X, Y, Z, eu(5, 10) * sc, 0.060 * m, 0.030 * m, 0.012 * m, eu(0.22, 0.4)]);
      } else if (dens > 0.5) {
        if (env() < 0.6) {
          const w = hue + 0.25 * (big - 0.5) + 0.1 * eg();            // ochre to amber to olive
          const col = w < 0.4 ? [0.50, 0.30, 0.07] : w < 0.75 ? [0.42, 0.33, 0.10] : [0.24, 0.27, 0.12];
          body.push([X, Y, Z, eu(3, 6.5) * sc, col[0] * m * 0.72, col[1] * m * 0.72, col[2] * m * 0.72, eu(0.10, 0.2)]);
          // fine grit through the body, so it has texture up close and is not just soft cloud
          if (env() < 0.5) glint.push([X + eg() * 2, Y + eg() * 2, Z + eg() * 2, eu(0.3, 1.0), col[0] * 0.9, col[1] * 0.9, col[2] * 0.8, env() * 6.283]);
        }
      } else {
        const warm = env() < 0.3;
        fringe.push([X, Y, Z, eu(1.3, 4.2) * sc, (warm ? 0.040 : 0.020) * m, (warm ? 0.034 : 0.032) * m, (warm ? 0.016 : 0.040) * m, 1]);
        if (env() < 0.16) {                                           // grains that catch the light
          const c = env();
          glint.push([X + eg(), Y + eg(), Z + eg(), eu(0.35, 1.5), c < 0.6 ? 0.75 : 0.9, c < 0.6 ? 0.9 : 0.75, c < 0.6 ? 1.0 : 0.35, env() * 6.283]);
        }
      }
    }
    for (let i = 0; i < 4 + R / 25; i++) {                            // loose crumbs drifting off it
      const a = eu(0, 6.283), d = R * eu(1.0, 1.7);
      fringe.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, cz + eg() * R * 0.3, eu(2, 5), 0.05, 0.07, 0.08, 1]);
    }
    for (let i = 0; i < 1 + Math.floor(env() * 3); i++) {             // round orange cells caught in it
      const l = lobes[Math.floor(env() * lobes.length)], a = eu(0, 6.283), d = l.r * eu(0.75, 1.25);
      cells.push([cx + l.p[0] + Math.cos(a) * d, cy + l.p[1] + Math.sin(a) * d, cz + l.p[2] + eg() * 6, eu(4, 8), 0.72, 0.30, 0.04, 5]);
    }
    for (let i = 0; i < 5 + R / 14; i++) {                            // needles and shards
      const l = lobes[Math.floor(env() * lobes.length)], a = eu(0, 6.283), el = eu(-0.5, 0.5), len = eu(7, 34), d = l.r * eu(0.3, 1.05), b = eu(0, 6.283);
      const sx = cx + l.p[0] + Math.cos(b) * d, sy = cy + l.p[1] + Math.sin(b) * d, sz = cz + l.p[2] + eg() * l.r * 0.3, br = eu(0.4, 1.3);
      needles.push(sx, sy, sz, br, sx + Math.cos(a) * Math.cos(el) * len, sy + Math.sin(a) * Math.cos(el) * len, sz + Math.sin(el) * len, br);
    }
  };
  // two big ones near the animal, as in the footage, the rest scattered around and below
  flocAt(x1 + 150, y1 + 150, 5, 135, 0.3);
  flocAt(x0 + 40, y0 - 190, -25, 110, 0.6);
  let made = 0;
  for (let tries = 0; made < 7 && tries < 300; tries++) {
    const low = made < 3, x = eu(-520, 520), y = eu(-420, 420), R = eu(45, low ? 150 : 100);
    if (!low && !clear(x, y, R + 30)) continue;
    if (Math.hypot(x - (x1 + 150), y - (y1 + 150)) < 200 || Math.hypot(x - (x0 + 40), y - (y0 - 190)) < 180) continue;
    flocAt(x, y, low ? eu(-150, -95) : eu(-50, 70), R, env());
    made++;
  }

  const curve = (len, stepLen, wobble, zr) => {
    let x, y;
    do { x = eu(-420, 420); y = eu(-330, 330); } while (!clear(x, y, 30));
    let z = eu(zr[0], zr[1]), h = eu(0, 6.283), k = 0, vz = eu(-0.06, 0.06);
    const out = [];
    for (let d = 0; d < len; d += stepLen) {
      out.push([x, y, z]);
      k = k * 0.93 + eg() * wobble; h += k * stepLen;
      x += Math.cos(h) * stepLen; y += Math.sin(h) * stepLen; z += vz * stepLen;
    }
    return out;
  };
  // thick green filaments, after the Oscillatoria in the footage (references/filaments/):
  // a long, almost straight, smooth tube about 14 um wide, divided into short cells by
  // fine cross-walls, with a brighter wall and a grainy inside. Not a string of beads.
  const tubes = [];
  const tube = (start, heading, len, radius, zslope, bend) => {
    const NS = 18, step = 1.0, n = Math.floor(len / step) + 1;
    const pos = new Float32Array(n * NS * 3), nor = new Float32Array(n * NS * 3), al = new Float32Array(n * NS * 2), idx = new Uint32Array((n - 1) * NS * 6);
    let x = start[0], y = start[1], z = start[2], h = heading, o = 0;
    for (let i = 0; i < n; i++) {
      const d = i * step, end = Math.min(d, len - d);
      const r = radius * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, 1 - end / (radius * 0.9)), 2)));   // rounded ends
      const tx = Math.cos(h), ty = Math.sin(h), nx = -ty, ny = tx;
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * 6.2832, ca = Math.cos(a), sa = Math.sin(a), k = (i * NS + j) * 3;
        pos[k] = x + nx * ca * r; pos[k + 1] = y + ny * ca * r; pos[k + 2] = z + sa * r;
        nor[k] = nx * ca; nor[k + 1] = ny * ca; nor[k + 2] = sa;
        al[(i * NS + j) * 2] = d; al[(i * NS + j) * 2 + 1] = a;
      }
      if (i < n - 1) for (let j = 0; j < NS; j++) {
        const p0 = i * NS + j, p1 = i * NS + ((j + 1) % NS);
        idx[o++] = p0; idx[o++] = p1; idx[o++] = p1 + NS; idx[o++] = p0; idx[o++] = p1 + NS; idx[o++] = p0 + NS;
      }
      h += bend * step * Math.sin(d * 0.004 + start[0]); x += tx * step; y += ty * step; z += zslope * step;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aAlong', new THREE.BufferAttribute(al, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, ...ADD, side: THREE.DoubleSide, uniforms: { uCell: { value: radius * 0.42 } },
      vertexShader: /* glsl */ `
        in vec2 aAlong; out vec2 vA; out vec3 vN; out vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = aAlong; vN = mat3(modelViewMatrix) * normal; vV = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float; in vec2 vA; in vec3 vN; in vec3 vV; out vec4 frag; uniform float uCell;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float facing = dot(normalize(vN), normalize(-vV));
          float f = clamp(1.0 - abs(facing), 0.0, 1.0);                                       // see the pellicle
          float c = vA.x / uCell, s = fract(c);
          float wall = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.90, 1.0, s));          // dark line between cells
          float grain = 0.72 + 0.28 * h(vec2(floor(vA.x * 2.2), floor(vA.y * 7.0))) + 0.12 * (h(vec2(floor(c), 3.0)) - 0.5);
          vec3 inside = vec3(0.012, 0.062, 0.018) * grain * mix(0.25, 1.0, wall);
          vec3 rim = vec3(0.045, 0.21, 0.065) * pow(f, 2.6) * mix(0.55, 1.0, wall);
          frag = vec4((inside + rim) * (facing > 0.0 ? 1.0 : 0.45), 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.userData.path = [start, [x, y, z], radius];
    tubes.push(mesh);
  };
  tube([x1 + 40, y0 - 330, -34], 0.92, 820, 7.0, 0.030, 0.00035);     // the long one that passes beside the animal
  tube([x0 - 420, y1 + 130, 55], -0.16, 560, 5.6, -0.045, 0.0005);
  tube([x0 - 260, y0 - 300, -110], 2.45, 640, 8.0, 0.02, 0.0003);
  // fine filaments: hair-thin strands crossing the water
  const lp = [];
  for (let f = 0; f < 16; f++) {
    const c = curve(eu(160, 520), 4, 0.0045, [-60, 60]), bright = eu(0.35, 0.9);
    for (let i = 0; i + 1 < c.length; i++) lp.push(...c[i], bright, ...c[i + 1], bright);
  }

  const cloud = (list, mode) => {
    const n = list.length, pos = new Float32Array(n * 3), s = new Float32Array(n * 4), sz = new Float32Array(n);
    list.forEach((q, i) => { pos.set([q[0], q[1], q[2]], i * 3); sz[i] = q[3]; s.set([q[4], q[5], q[6], q[7]], i * 4); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(s, 4));
    const blend = mode === 'over'
      ? { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthWrite: false, transparent: true }
      : ADD;
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, ...blend, uniforms: { uPx: common.uPx, uTime: common.uTime },
      vertexShader: /* glsl */ `
        in float aSize; in vec4 aCol; uniform float uPx, uTime; out vec4 vCol; out float vDim;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = 2.0 * aSize * uPx / -mv.z;
          gl_PointSize = clamp(px, 1.5, 300.0);
          vDim = min(1.0, (px * px) / 2.25);
          vCol = aCol;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float; in vec4 vCol; in float vDim; out vec4 frag; uniform float uTime;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          ${mode === 'over' ? 'float a = vCol.a * exp(-r2 * 2.6) * (1.0 - r2); frag = vec4(vCol.rgb * a, a);'
          : mode === 'glint' ? 'float tw = 0.65 + 0.35 * sin(uTime * 9.0 + vCol.a * 7.0); frag = vec4(vCol.rgb * (0.55 * tw * vDim * exp(-r2 * 3.0)), 1.0);'
          : mode === 'cell' ? 'float rim = smoothstep(0.35, 0.92, r2) * (1.0 - smoothstep(0.92, 1.0, r2)); float k = vCol.a; frag = vec4(vCol.rgb * vDim * (0.10 + 0.55 * rim) * (k > 2.0 ? 1.5 : 1.0) + (k > 2.0 ? vCol.rgb * 0.25 * (1.0 - r2) : vec3(0.0)), 1.0);'
          : 'frag = vec4(vCol.rgb * exp(-r2 * 2.4) * (1.0 - r2), 1.0);'}
        }`,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  };
  const la = new Float32Array(lp.concat(needles.map((v, i) => (i % 4 === 3 ? v * 2.2 : v))));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(la.filter((_, i) => i % 4 < 3)), 3));
  lg.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(la.filter((_, i) => i % 4 === 3)), 1));
  const lm = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: { uPx: common.uPx },
    vertexShader: /* glsl */ `
      in float aB; uniform float uPx; out float vG;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vG = aB * clamp(0.11 * uPx / -mv.z, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `precision highp float; in float vG; out vec4 frag; void main() { frag = vec4(vec3(0.05, 0.11, 0.13) * vG, 1.0); }`,
  });
  const lines = new THREE.LineSegments(lg, lm);
  lines.frustumCulled = false;
  const grp = new THREE.Group();
  // drawn in this order whatever the view: pale fringe, amber body over it, dark core over that
  [cloud(fringe, 'add'), cloud(body.concat(core), 'over'), cloud(glint, 'glint'), cloud(cells, 'cell'), lines]
    .forEach((o, i) => { o.renderOrder = -10 + i; grp.add(o); });
  tubes.forEach((o) => { o.renderOrder = -4; grp.add(o); });
  grp.userData.tubes = tubes;
  grp.userData.flocs = flocs;                         // each lobe: x y z radius
  grp.userData.count = { fringe: fringe.length, body: body.length, core: core.length, glint: glint.length };
  return grp;
}

// ------------------------------------------------------------------- scene
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0.0018, 0.0065, 0.0125);
const camera = new THREE.PerspectiveCamera(32, 1, 2, 6000);
camera.up.set(0, 0, 1);
camera.position.set(-15, -365, 290);               // takes in all the places the animal visits
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 25;
controls.maxDistance = 1800;
controls.target.set(15, -60, 0);

const { pts: beads, food } = makeBeads();
// the animal is in a scene of its own, drawn after the bloom, so that it does not glow
// (nothing in the surroundings writes depth or is drawn after it, so the order is safe)
const animal = new THREE.Scene();
animal.add(beads);
const pellicle = makePellicle();
const cilia = makeCilia();
const surroundings = makeSurroundings();
scene.add(surroundings, makeMotes());
animal.add(pellicle, cilia, makeExtrusomes());
const st = Math.max(1, Math.min(1, (KS / SIZE) * 1.3));
[
  { s: 80 * KS, rho: 0.18, phi: 0.6, r: 7.2 * SIZE, stretch: Math.max(1, 1.45 * Math.min(1, (KS / SIZE) * 1.3)), edge: [0.90, 0.22, 0.62], core: [0.06, 0.005, 0.045], strength: 0.42 },
  { s: 99 * KS, rho: 0.15, phi: 3.6, r: 6.6 * SIZE, stretch: Math.max(1, 1.35 * Math.min(1, (KS / SIZE) * 1.3)), edge: [0.90, 0.22, 0.62], core: [0.06, 0.005, 0.045], strength: 0.42 },
  { s: 90 * KS, rho: 0.42, phi: 2.2, r: 2.3 * SIZE, edge: [1.0, 0.45, 0.8], core: [0.12, 0.02, 0.08], strength: 0.5 },
  { s: 27 * KS, rho: 0.15, phi: 1.0, r: 5.0 * SIZE, edge: [0.55, 0.85, 1.0], core: [0, 0.003, 0.006], strength: 0.7, pow: 3.0 },
  { s: 128 * KS, rho: 0.2, phi: 4.0, r: 3.2 * SIZE, edge: [0.55, 0.85, 1.0], core: [0, 0.003, 0.006], strength: 0.7, pow: 3.0 },
  ...food.map((f) => ({ ...f, edge: [0.60, 0.85, 0.25], core: [0.006, 0.016, 0.003], strength: 0.24, pow: 2.4 })),
].forEach((o) => animal.add(makeShell(o)));

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.26, 0.22, 0.15);
bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.8, 0.5, 0.15, 0.04];
composer.addPass(bloom);
const animalPass = new RenderPass(animal, camera);
animalPass.clear = false;
composer.addPass(animalPass);
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb + (h(gl_FragCoord.xy) + h(gl_FragCoord.yx + 7.3) - 1.0) / 255.0, 1.0); }`,
}));

let quality = 1;                                     // render scale, lowered if the device struggles
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr * quality);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  common.uPx.value = (h * pr * quality) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- the loop
// The behaviour just runs, slowed down, and repeats. The only control is the speed
// slider: all the way left pauses. Space pauses and resumes too; f shows the frame
// rate. The view stays where it is put, so the animal is seen to travel.
const fpsEl = document.getElementById('fps'), speedEl = document.getElementById('speed'), speedLabel = document.getElementById('speedLabel');
const SPEEDS = [0, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2];   // the first is the pause
const state = { t: 0, speed: 1 / 4, clock: 0 };
let resumeAt = SPEEDS.indexOf(state.speed);          // where space goes back to
speedEl.max = SPEEDS.length - 1;
function setSpeed(i) {
  i = Math.min(SPEEDS.length - 1, Math.max(0, i));
  if (i > 0) resumeAt = i;
  state.speed = SPEEDS[i];
  speedEl.value = i;
  speedLabel.textContent = i === 0 ? 'paused' : state.speed >= 1 ? state.speed + '×' : '1/' + Math.round(1 / state.speed) + '×';
}
const setPlay = (p) => setSpeed(p ? resumeAt : 0);
speedEl.oninput = () => setSpeed(+speedEl.value);
setSpeed(resumeAt);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { setPlay(state.speed === 0); e.preventDefault(); }
  if (e.key === 'f') fpsEl.hidden = !fpsEl.hidden;
});

let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0;
const stats = { fps: 0, cilia: cilia.userData.count, triangles: 0, period: PERIOD };
function tick(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw);
  last = now;
  if (raw > 0.5) { fpsAcc = 0; fpsN = 0; slow = 0; }   // tab was hidden: not a slow device
  state.t = (state.t + dt * state.speed) % PERIOD;
  state.clock += dt * state.speed;                    // the cilia keep beating through the loop
  common.uL.value = updateRings(state.t);
  common.uTime.value = state.clock;
  controls.update();
  composer.render();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { stats.fps = fpsN / fpsAcc; stats.triangles = renderer.info.render.triangles; fpsEl.textContent = stats.fps.toFixed(0) + ' fps';
    slow = stats.fps < 38 ? slow + 1 : 0;
    if (slow >= 4 && quality > 0.55) { quality *= 0.8; slow = 0; resize(); composer.render(); }   // redraw: a resized canvas may be cleared
    stats.quality = quality; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
const dbg = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
stats.gpu = dbg ? renderer.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
window.viewer = { state, stats, camera, controls, setPlay, bloom, renderer, composer, surroundings, animal, behave, B, SEGS, BOUTS, updateRings, ringData };
