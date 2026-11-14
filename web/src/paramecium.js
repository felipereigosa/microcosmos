// Paramecium caudatum: the slipper-shaped ciliate, covered in thousands of cilia that
// beat in travelling waves.
//
// (The two here are drawn small: see "Sizes" below.)
//
// Numbers after Brette, "Integrative neuroscience of Paramecium, a 'swimming neuron'",
// eNeuro 8(3), 2021 (open access): a large species, about 200 um long, with a pointed
// back end; several thousand cilia, each about 10 um long and 0.2 um thick, beating at
// 10 to 20 Hz with the power stroke to the rear and to the right, so that the cell goes
// forward turning over to the left about once a second, along a spiral wider than
// itself with the oral groove facing the spiral's axis; about 1 mm/s; the beat is
// organised in metachronal waves that wrap the body in spirals. Meeting something, it
// backs up for a fraction of a second (the cilia strike forward), then swings its front
// end round while the back end stays put, and goes on (the avoiding reaction).
//
// The shape and the grazing follow two videos by Alexander Klepnev on Wikimedia Commons
// (CC BY 4.0, "Инфузория туфелька 6" and "7"): at a floc the cell keeps its front end
// in the debris and swings its body about it, some 100 degrees one way and back every
// 7 s or so, now and then jerking back a fifth of its length; then it darts off.
//
// Not from those sources, but textbook cell biology placed by hand: one macronucleus
// with one compact micronucleus against it, two contractile vacuoles with radiating
// canals that beat in turn, the gullet, food vacuoles carried round by the streaming
// cytoplasm (far faster here than in life), trichocysts under the pellicle, crystals.
import * as THREE from 'three';
import { mulberry, Builder } from './desmodesmus.js';

const TAU = 2 * Math.PI, RAD = Math.PI / 180;
const SEG = 8;                   // pieces per cilium
const LOD = [70, 190];           // close-up detail: all there within 70 of the camera, gone beyond 190 (scene units)
// Sizes. Felipe wanted the paramecia smaller than the Lacrymaria (2026-11-13). The cell is
// built in real micrometres, so that cilia, trichocysts and the rest keep their true sizes
// on a smaller cell, and then drawn at UNIT scene units per um: the scene's unit is read
// as 1.7 um, which makes the Lacrymaria a large individual with a body of 100 um and
// these two small paramecia of 85 and 75 um (small for the genus, well below P. caudatum's
// 170 um and more; the shape is still that species').
const UNIT = 1 / 1.7;
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// The two in the drop; len in um, places in scene units. Each goes round its stops for ever: n is where its front end
// rests in the fringe of a floc and d the way it faces there; dwell is its share of the
// time left over after the swims; back is how far it backs away on leaving, in body
// lengths, and out, if given, the way it faces after turning; shift moves a cell's whole round in time, in seconds. A stop with c instead of n is a place in open water where it only checks
// itself, backs up and turns (an avoiding reaction with nothing much in the way).
const SPECS = [
  { len: 85, seed: 5, stops: [
    { n: [239, 114, 3], d: [0.1, 0.9, 0.42], dwell: 1.9, swing: [46, 10] },
    { n: [-5, 168, -85], d: [-0.6, 0.75, -0.3], dwell: 0.95, swing: [44, 10], back: 0.25 },
    { n: [156, -5, -144], d: [-0.6, 0.8, 0], dwell: 1.6, swing: [50, 12] },
  ] },
  { len: 75, seed: 9, shift: 13.7, stops: [
    { n: [-68, -153, 25], d: [0.1, -0.91, -0.4], dwell: 1.1, swing: [40, 10], back: 0.3, out: [0.5, 0.2, -0.85] },
    { n: [45, 2, -136], d: [1, 0, 0], dwell: 1.5, swing: [40, 14] },
    { n: [-62, 201, -102], d: [0.6, 0.8, 0], dwell: 1.75, swing: [46, 12], out: [-0.35, -0.85, 0.4] },
  ] },
];

// ------------------------------------------------------------------ the shape
// Half-width over length, from the front (0) to the back (1): a rounded, narrower
// front, widest behind the middle, a blunt point at the back (after the frames of
// "Инфузория туфелька 7").
const PX = [0, 0.012, 0.03, 0.07, 0.15, 0.3, 0.45, 0.58, 0.67, 0.76, 0.84, 0.9, 0.95, 0.98, 1];
const PR = [0, 0.03, 0.05, 0.068, 0.083, 0.095, 0.108, 0.121, 0.126, 0.118, 0.098, 0.072, 0.042, 0.02, 0];
function lerpTab(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; }
  return ys[ys.length - 1];
}
const MOUTH = 0.585;             // where the oral groove ends, from the front
function shapeOf(L) {
  // the table, smoothed and rounded off at both ends
  const n = 400, tab = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) tab[i] = lerpTab(i / n, PX, PR);
  for (let pass = 0; pass < 12; pass++) { let prev = tab[0]; for (let i = 1; i < n; i++) { const c = tab[i]; tab[i] = 0.25 * prev + 0.5 * c + 0.25 * tab[i + 1]; prev = c; } }
  const r0 = (xa) => { const f = Math.min(1, Math.max(0, xa)) * n, i = Math.min(n - 1, Math.floor(f)); return L * (tab[i] + (tab[i + 1] - tab[i]) * (f - i)) * Math.sqrt(sstep(xa / 0.012)) * Math.sqrt(sstep((1 - xa) / 0.02)); };
  // the oral groove: a broad, shallow trough that starts to one side at the front and
  // winds over to the midline of the oral side, deepening, as far as the mouth
  const grooveAt = (xa) => 0.95 * (1 - sstep(xa / MOUTH));
  const groove = (xa, phi) => {
    let dp = phi - grooveAt(xa); dp -= TAU * Math.round(dp / TAU);
    const w = 0.95 - 0.45 * Math.min(1, xa / MOUTH);
    return sstep((xa - 0.02) / 0.22) * (1 - sstep((xa - MOUTH + 0.035) / 0.075)) * Math.exp(-((dp / w) ** 2));
  };
  const rad = (xa, phi) => r0(xa) * (1 - 0.40 * groove(xa, phi));
  const cy = (xa) => -0.022 * L * Math.sin(Math.PI * xa);            // the back is the more arched side
  // a point of the cell: xa from the front, rho from the axis (1 is the surface), phi round it (0 is the oral side)
  const at = (xa, rho, phi) => { const r = rho * rad(xa, phi); return [L * (0.5 - xa), cy(xa) + r * Math.cos(phi), r * Math.sin(phi)]; };
  const frame = (xa, phi) => {                         // outward normal, and the way to the back along the surface
    const e = 0.004, a = Math.min(0.996, Math.max(0.004, xa));
    const dx = sub(at(a + e, 1, phi), at(a - e, 1, phi)), dp = sub(at(a, 1, phi + 0.02), at(a, 1, phi - 0.02));
    let nn = unit(cross(dp, dx));
    if (dot(nn, [0, Math.cos(phi), Math.sin(phi)]) < 0) nn = nn.map((v) => -v);
    return [nn, unit(add(dx, nn, -dot(dx, nn)))];
  };
  return { L, r0, rad, at, frame, groove, grooveAt, cy, rmax: L * 0.126 };
}

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide };
// The pellicle and the cilia are golden, to tell the paramecia from the grey-blue
// Lacrymaria at a glance (the colours are a choice: the living cells are clear as glass).
// From dark to bright; the blue ones they replaced are in the git history.
const V = (r, g, b) => `vec3(${r}, ${g}, ${b})`;
const SKIN = { dark: V(0.022, 0.016, 0.004), mid: V(0.19, 0.135, 0.038), bright: V(0.82, 0.60, 0.20), haze: V(0.019, 0.014, 0.005),
  groove: V(0.042, 0.030, 0.009), rows: V(0.145, 0.104, 0.032), cil0: V(0.092, 0.066, 0.020), cil1: V(0.18, 0.128, 0.040), cil2: V(0.37, 0.27, 0.09) };
// The cilia are drawn well short of their real 10 um or so, at Felipe's wish: a peach
// fuzz that leaves the shape of the cell to be seen, not a ball of hair.
const FUZZ = 0.32;
const RIM = 'float facing = dot(normalize(vN), normalize(-vV)); float f = clamp(1.0 - abs(facing), 0.0, 1.0);';   // clamped: a pow() of a negative gives NaN

function makeCell(spec, common) {
  const rnd = mulberry(spec.seed), uni = (a, b) => a + (b - a) * rnd();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  const S = shapeOf(spec.len), L = S.L;
  const NK = Math.max(32, 16 * Math.round((TAU * S.rmax) / 1.4 / 16));   // rows of cilia (kineties), about 1.4 um apart at the widest part
  const many = (n, e = 2) => Math.max(3, Math.round(n * (L / 175) ** e));   // counts were set for a cell of 175 um
  const U = { uLod: { value: 0 }, uPhase: { value: 0 }, uStroke: { value: 0.45 }, uPulse: { value: [1, 1, 1, 1] }, uPx: common.uPx, uUnit: { value: UNIT } };

  // ---- pellicle
  const NX = 260, NP = 144, pb = new Builder({ aUV: 3 });
  for (let i = 0; i <= NX; i++) {
    const q = i / NX, xa = 0.5 - 0.5 * Math.cos(Math.PI * q);      // closer rings towards both ends
    for (let j = 0; j <= NP; j++) {
      const phi = (j / NP) * TAU, [nn] = S.frame(xa, phi);
      pb.vert(S.at(xa, 1, phi), nn, { aUV: [xa * L, phi, S.groove(xa, phi)] });
    }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j; pb.idx.push(a, a + 1, a + NP + 2, a, a + NP + 2, a + NP + 1); }
  const pellicle = new THREE.Mesh(pb.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aUV; out vec3 vN; out vec3 vV; out vec3 vUV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; vUV = aUV; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vUV; out vec4 frag; uniform float uLod;
      vec3 ramp4(float x, float p1, float p2, vec3 c1, vec3 c2, vec3 c3) {
        if (x < p1) return mix(vec3(0.0), c1, x / p1);
        if (x < p2) return mix(c1, c2, (x - p1) / (p2 - p1));
        return mix(c2, c3, (x - p2) / (1.0 - p2));
      }
      void main() {
        ${RIM}
        // a thin bright outline and a faint haze
        vec3 col = ramp4(pow(f, 1.6), 0.45, 0.82, ${SKIN.dark}, ${SKIN.mid}, ${SKIN.bright}) + ${SKIN.haze};
        col += ${SKIN.groove} * vUV.z;                                  // the groove, thick with cilia
        // the rows of cilia as fine stripes, and close up the lattice of ridges round each
        // cilium; both fade out before they get finer than a pixel
        float s = vUV.y * ${(NK / TAU).toFixed(5)}, a = vUV.x / 2.0 + 0.5 * mod(floor(s), 2.0);
        float ws = fwidth(s), wa = fwidth(vUV.x / 2.0);
        float rows = smoothstep(0.30, 0.48, abs(fract(s) - 0.5)) * (1.0 - smoothstep(0.25, 0.6, ws));
        float bars = smoothstep(0.34, 0.48, abs(fract(a) - 0.5)) * (1.0 - smoothstep(0.25, 0.6, max(ws, wa)));
        col += ${SKIN.rows} * (0.55 * rows + 0.75 * uLod * max(rows, bars)) * (0.3 + 0.7 * abs(facing));
        frag = vec4(col * (facing > 0.0 ? 1.0 : 0.30) * 0.75, 1.0);
      }`,
  }));

  // ---- cilia: on the rows, about 2 um apart; where the cell narrows, rows drop out
  const mouth = S.at(MOUTH, 0.8, 0), roots = [];        // [point, normal, way of the stroke, length, phase, kind]
  for (let k = 0; k < NK; k++) {
    const phi = (k / NK) * TAU;
    let prev = S.at(0.008, 1, phi), acc = uni(0, 2);
    for (let xa = 0.008; xa < 0.992; xa += 0.0015) {
      const p = S.at(xa, 1, phi);
      acc += len(sub(p, prev)); prev = p;
      if (acc < 2.0) continue;
      acc -= 2.0;
      const gap = (TAU * S.rad(xa, phi)) / NK, stride = gap > 0.72 ? 1 : gap > 0.36 ? 2 : gap > 0.18 ? 4 : gap > 0.09 ? 8 : 16;
      if (k % stride) continue;
      const [nn, back] = S.frame(xa, phi), g = S.groove(xa, phi);
      const ph = TAU * (p[0] / 11.5) + 4 * phi + 0.22 * gauss();     // waves 11.5 um long along the cell, four round it
      if (xa > 0.972) roots.push([p, nn, back, FUZZ * uni(17, 23), ph, 2]);                                   // the tuft at the back
      else if (g > 0.5) { const to = sub(mouth, p); roots.push([p, nn, unit(add(to, nn, -dot(to, nn))), FUZZ * 11.5 * uni(0.93, 1.08), ph, 1]); }   // in the groove they beat towards the mouth
      else roots.push([p, nn, back, FUZZ * 10.5 * uni(0.92, 1.08) * (0.8 + 0.2 * sstep(xa / 0.04)), ph, 0]);
    }
  }
  const nv = roots.length * SEG * 2, cp = new Float32Array(nv * 3), cn = new Float32Array(nv * 3), cb = new Float32Array(nv * 3), ci = new Float32Array(nv * 4);
  let o = 0;
  for (const [p, nn, back, ln, ph, kind] of roots) for (let q = 0; q < SEG; q++) for (let e = 0; e < 2; e++) {
    cp.set(p, o * 3); cn.set(nn, o * 3); cb.set(back, o * 3); ci.set([q + e, ln, ph, kind], o * 4); o++;
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  cg.setAttribute('aNrm', new THREE.BufferAttribute(cn, 3));
  cg.setAttribute('aBack', new THREE.BufferAttribute(cb, 3));
  cg.setAttribute('aInfo', new THREE.BufferAttribute(ci, 4));
  // The beat, in three dimensions. Power stroke (a third of the cycle): the cilium stands
  // nearly straight and sweeps over from leaning forward to lying back. Recovery: it
  // stays low; a bend runs from its foot to its tip, the part behind the bend already
  // returned, the part ahead still trailing and swung out to the side.
  const cilia = new THREE.LineSegments(cg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aNrm, aBack; in vec4 aInfo;
      uniform float uPhase, uStroke, uPx;
      out float vU; out float vGain;
      void main() {
        float q = aInfo.x, kind = aInfo.w, seg = aInfo.y / ${SEG}.0;
        vec3 n = aNrm, right = cross(n, aBack), p = position;
        if (kind > 1.5) {
          p += normalize(0.5 * n + aBack + 0.14 * sin(0.23 * uPhase + aInfo.z) * right) * seg * q;       // the tuft trails, barely stirring
        } else {
          float a = kind > 0.5 ? 0.0 : uStroke;
          vec3 e = cos(a) * aBack + sin(a) * right, e2 = cross(n, e);
          float tau = fract((uPhase - aInfo.z) / 6.2831853), P = 0.32, th0 = -0.55, th1 = 1.25;
          float tp = tau / P, tr = clamp((tau - P) / (1.0 - P), 0.0, 1.0);
          float theta = mix(th0, th1, smoothstep(0.0, 1.0, tp)), front = mix(-0.3, 1.3, tr), gam = 1.15 * sin(3.14159 * tr);
          for (int j = 1; j <= ${SEG}; j++) {
            if (float(j) > q + 0.5) break;
            float u = (float(j) - 0.5) / ${SEG}.0, beta, g = 0.0;
            if (tau < P) beta = theta - 0.38 * u * sin(3.14159 * tp);
            else { float m = smoothstep(front - 0.3, front + 0.3, u); beta = mix(th0, th1, m); g = gam * m; }
            p += (cos(beta) * n + sin(beta) * (cos(g) * e + sin(g) * e2)) * seg;
          }
        }
        vU = q / ${SEG}.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vGain = clamp(0.075 * uPx / -mv.z, 0.0, 1.0);                 // real width in pixels, capped at one
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in float vU; in float vGain; out vec4 frag;
      void main() {
        vec3 c = vU < 0.7 ? mix(${SKIN.cil0}, ${SKIN.cil1}, vU / 0.7)
                          : mix(${SKIN.cil1}, ${SKIN.cil2}, (vU - 0.7) / 0.3);
        frag = vec4(c * 0.55 * vGain, 1.0);
      }`,
  }));

  // ---- trichocysts: spindles standing under the pellicle between the cilia; close up only
  const tp = [];
  for (const [p, nn, back, , , kind] of roots) {
    if (kind === 2 || rnd() < 0.3) continue;
    const q = add(p, back, 1.0), d = unit(add(nn, [gauss(), gauss(), gauss()], 0.07));
    tp.push(...add(q, d, -0.5), ...add(q, d, -uni(3.6, 4.4)));
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  const tricho = new THREE.LineSegments(tg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `uniform float uPx, uLod; out float vGain;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vGain = uLod * clamp(0.16 * uPx / -mv.z, 0.0, 1.0); gl_Position = uLod > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0); }`,
    fragmentShader: /* glsl */ `precision highp float; in float vGain; out vec4 frag; void main() { frag = vec4(vec3(0.62, 0.50, 0.26) * 0.16 * vGain, 1.0); }`,
  }));

  // ---- everything inside with a surface, in one mesh
  // aK: strength, rim power, 1 if close-up only. aPulse: the point a part swells about, and which pulse it follows
  const B = new Builder({ aEdge: 3, aCore: 3, aK: 3, aPulse: 4 });
  const ico = new THREE.IcosahedronGeometry(1, 3), icoP = ico.getAttribute('position');
  const M = new THREE.Matrix4(), NM = new THREE.Matrix3(), v = new THREE.Vector3();
  const look = (edge, core, strength, pw = 1.6, close = 0) => ({ aEdge: edge, aCore: core, aK: [strength, pw, close] });
  const blob = (c, radii, rot, lk, pulse = 0) => {
    M.compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...radii));
    NM.getNormalMatrix(M);
    const base = B.n;
    for (let i = 0; i < icoP.count; i++) {
      const p = v.fromBufferAttribute(icoP, i).clone().applyMatrix4(M), nn = v.fromBufferAttribute(icoP, i).clone().applyMatrix3(NM).normalize();
      B.vert([p.x, p.y, p.z], [nn.x, nn.y, nn.z], { ...lk, aPulse: [...c, pulse] });
    }
    for (let i = 0; i < icoP.count; i++) B.idx.push(base + i);
  };
  const tube = (pts, radf, lk, sides = 8, pulse = 0) => {
    const base = B.n, m = pts.length;
    let N = null;
    for (let i = 0; i < m; i++) {
      const T = unit(sub(pts[Math.min(m - 1, i + 1)], pts[Math.max(0, i - 1)]));
      if (!N) N = unit(cross(T, Math.abs(T[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
      N = unit(add(N, T, -dot(N, T)));
      const Bn = cross(T, N), r = radf(i / (m - 1));
      for (let j = 0; j < sides; j++) {
        const c = Math.cos((j / sides) * TAU), s = Math.sin((j / sides) * TAU), nn = [N[0] * c + Bn[0] * s, N[1] * c + Bn[1] * s, N[2] * c + Bn[2] * s];
        B.vert(add(pts[i], nn, r), nn, { ...lk, aPulse: [...pts[i], pulse] });
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < sides; j++) {
      const q = base + i * sides + j, q2 = base + i * sides + ((j + 1) % sides);
      B.idx.push(q, q2, q2 + sides, q, q2 + sides, q + sides);
    }
  };
  const NUC = look([0.90, 0.22, 0.62], [0.045, 0.004, 0.034], 0.30);
  const NUCLEOLUS = look([1.0, 0.62, 0.78], [0.10, 0.035, 0.065], 0.26, 1.8, 1);
  const MIC = look([1.0, 0.45, 0.8], [0.14, 0.03, 0.10], 0.5, 1.5);
  const VAC = look([0.55, 0.85, 1.0], [0, 0.003, 0.006], 0.7, 3.0);
  const CANAL = look([0.55, 0.85, 1.0], [0.01, 0.03, 0.05], 0.5, 2.0);
  const GULLET = look([0.80, 0.78, 0.55], [0.012, 0.012, 0.006], 0.42, 2.2);
  const BAND = look([0.95, 0.90, 0.60], [0.10, 0.09, 0.04], 0.5, 1.2, 1);
  const MITO = look([1.0, 0.40, 0.18], [0.07, 0.014, 0.006], 0.42, 1.7, 1);
  const GOLGI = look([1.0, 0.78, 0.22], [0.035, 0.022, 0.003], 0.36, 2.0, 1);
  const taken = [];                                    // balls the small organelles keep out of
  const free = (p, r) => taken.every((k) => len(sub(p, k)) > r + k[3]);

  // the macronucleus: a big bean at the middle, a little towards the back; the
  // micronucleus is a compact body pressed into its oral side
  const marks = {};                                    // where the labels point (see partsOf in main.js)
  const rm = S.rmax, mc = S.at(0.50, 0.12, Math.PI), ma = 0.122 * L, mb = 0.43 * rm;
  marks.nucleus = mc; marks.cilia = S.at(0.14, 1.06, 2.2);
  blob(mc, [ma, mb, mb * 1.08], [0, 0, 0.05], NUC);
  for (let e = -0.6; e <= 0.61; e += 0.3) taken.push([mc[0] + e * ma, mc[1], mc[2], mb * 1.1]);
  for (let i = 0; i < 16; i++) {                       // nucleoli, close up
    const z = uni(-1, 1), a = uni(0, TAU), q = Math.cbrt(rnd()) * 0.8, s = Math.sqrt(1 - z * z), r = uni(0.07, 0.12) * mb * 1.3;
    blob([mc[0] + z * q * ma, mc[1] + s * Math.cos(a) * q * mb, mc[2] + s * Math.sin(a) * q * mb], [r, r, r], [0, 0, 0], NUCLEOLUS);
  }
  const mic = [mc[0] - 0.02 * L, mc[1] + mb * 1.02, mc[2] + 0.15 * mb];
  blob(mic, [0.021 * L, 0.014 * L, 0.014 * L], [0, 0, 0.2], MIC);
  taken.push([...mic, 0.024 * L]);

  // two contractile vacuoles under the back, a quarter of the way from each end, each
  // fed by canals that radiate from it under the pellicle; they beat in turn
  const vacs = [{ xa: 0.27, period: 7.3, phase: 0 }, { xa: 0.765, period: 8.6, phase: 0.5 }];
  vacs.forEach((vc, k) => {
    const phi0 = Math.PI + (k ? -0.25 : 0.3), R = 0.036 * L, depth = 1 - (R * 1.15) / S.rad(vc.xa, phi0);
    const c = S.at(vc.xa, depth, phi0);
    vc.c = c; vc.r = R;
    blob(c, [R, R, R], [0, 0, 0], VAC, k + 1);
    taken.push([...c, R * 1.2]);
    const nC = 7 + k;
    for (let j = 0; j < nC; j++) {
      const a = (j + 0.5 * k) * TAU / nC + uni(-0.12, 0.12), reach = uni(0.105, 0.135) * L, pts = [];
      for (let q = 0; q <= 14; q++) {
        const l = R * 1.02 + (reach - R * 1.02) * (q / 14), xa = vc.xa + (Math.cos(a) * l) / L;
        const rr = S.rad(Math.min(0.97, Math.max(0.03, xa)), phi0);
        pts.push(S.at(Math.min(0.97, Math.max(0.03, xa)), Math.max(0.3, 1 - (R * 0.75) / rr), phi0 + (Math.sin(a) * l) / Math.max(rr, R)));
      }
      const w = R * uni(0.11, 0.15);
      tube(pts, (q) => w * (0.34 + 0.9 * Math.exp(-(((q - 0.16) / 0.13) ** 2)) + 0.12 * (1 - q)) * sstep((1 - q) / 0.1) * (0.45 + 0.55 * sstep(q / 0.05)), CANAL, 7, k + 3);
    }
  });

  // the gullet: a funnel leading in and back from the mouth, lined by three bands of
  // fused cilia that sweep the food down; a food vacuole swells at its end
  const gul = [];
  for (let q = 0; q <= 16; q++) { const u = q / 16; gul.push(S.at(MOUTH - 0.012 + 0.125 * u, 0.80 - 0.62 * sstep(u * 1.15) + 0.1 * u * u, 0.1 * u)); }
  const gr = (u) => 0.030 * L * (1 - 0.55 * u) * (0.55 + 0.45 * sstep(u / 0.12));
  tube(gul, gr, GULLET, 12);
  marks.gullet = gul[9];
  for (let k = 0; k < 3; k++) {
    const pts = gul.map((p, i) => { const u = i / 16, a = 2.2 + k * 0.75 + 2.4 * u; return add(p, [0, Math.cos(a), Math.sin(a)], gr(u) * 0.8); });
    tube(pts, () => 0.0042 * L, BAND, 5);
  }
  gul.forEach((p, i) => { if (i % 3 === 0) taken.push([...p, gr(i / 16) * 1.2]); });

  // mitochondria under the pellicle and a few Golgi stacks deeper in; close up only
  let made = 0;
  for (let tries = 0; made < many(110, 1.5) && tries < 6000; tries++) {
    const xa = uni(0.05, 0.94), phi = uni(0, TAU), rr = S.rad(xa, phi), hl = uni(1.2, 2.0), p = S.at(xa, 1 - (2.6 + Math.abs(gauss()) * 1.6) / rr, phi);
    if (rr < 4 || !free(p, hl * 0.8)) continue;
    blob(p, [hl, uni(0.45, 0.6), uni(0.45, 0.6)], [uni(0, TAU), uni(-0.5, 0.5), uni(-0.6, 0.6)], MITO);
    if (!made) marks.mito = p;
    taken.push([...p, hl * 0.7]); made++;
  }
  made = 0;
  for (let tries = 0; made < many(7, 1) && tries < 2000; tries++) {
    const xa = uni(0.15, 0.85), phi = uni(0, TAU), p = S.at(xa, uni(0.3, 0.65), phi), Rg = uni(1.5, 2.0);
    if (!free(p, Rg * 1.3)) continue;
    const rot = [uni(0, TAU), uni(0, TAU), 0], ax = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(...rot));
    for (let i = 0; i < 5; i++) blob(add(p, [ax.x, ax.y, ax.z], (i - 2) * 0.45), [0.11, Rg * (1 - 0.08 * i), Rg * (1 - 0.08 * i)], rot, GOLGI);
    taken.push([...p, Rg * 1.3]); made++;
  }
  const parts = new THREE.Mesh(B.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aEdge; in vec3 aCore; in vec3 aK; in vec4 aPulse; uniform float uLod; uniform float uPulse[4];
      out vec3 vN; out vec3 vV; out vec3 vEdge; out vec3 vCore; out vec2 vK;
      void main() {
        vec3 p = position;
        if (aPulse.w > 0.5) p = aPulse.xyz + (p - aPulse.xyz) * uPulse[int(aPulse.w - 0.5)];
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = mat3(modelViewMatrix) * normal; vV = mv.xyz;
        vEdge = aEdge; vCore = aCore; vK = vec2(aK.x * mix(1.0, uLod, aK.z), aK.y);
        gl_Position = vK.x > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vEdge; in vec3 vCore; in vec2 vK; out vec4 frag;
      void main() { ${RIM} frag = vec4(mix(vCore, vEdge, pow(f, vK.y)) * vK.x, 1.0); }`,
  }));

  // ---- grains: the cytoplasm's granules, clusters of crystals towards both ends, and
  // close up a basal body at the foot of every cilium.  x y z radius r g b close-up
  const beads = [];
  for (let i = 0, n = many(1500); i < n; i++) {
    const p = S.at(uni(0.04, 0.95), Math.sqrt(rnd()) * 0.86, uni(0, TAU)), w = rnd();
    const col = w < 0.35 ? [0.85, 0.66, 0.30] : w < 0.7 ? [0.55, 0.70, 0.45] : [0.75, 0.85, 0.80];
    beads.push([...p, Math.min(1.0, Math.max(0.14, Math.exp(-1.2 + 0.45 * gauss()))), ...col, 0]);
  }
  for (const [xa0, cnt] of [[0.17, 5], [0.36, 3], [0.83, 6]]) for (let c = 0; c < cnt; c++) {
    const ctr = [xa0 + uni(-0.07, 0.07), uni(0.1, 0.6), uni(0, TAU)];
    for (let i = 0; i < 11; i++) beads.push([...add(S.at(...ctr), [gauss(), gauss(), gauss()], 2.2), uni(0.22, 0.55), 1.5, 1.35, 0.95, 0]);
  }
  for (const [p, nn] of roots) beads.push([...add(p, nn, -0.25), 0.13, 0.62, 0.52, 0.28, 1]);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(beads.flatMap((q) => q.slice(0, 3)), 3));
  pg.setAttribute('aBead', new THREE.Float32BufferAttribute(beads.flatMap((q) => q.slice(3, 7)), 4));
  pg.setAttribute('aClose', new THREE.Float32BufferAttribute(beads.map((q) => q[7]), 1));
  const grains = new THREE.Points(pg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, ...ADD,
    vertexShader: /* glsl */ `
      in vec4 aBead; in float aClose; uniform float uPx, uLod, uUnit; out vec3 vCol; out float vDim; out float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = 2.0 * aBead.x * uUnit * uPx / -mv.z, k = mix(1.0, uLod, aClose);
        gl_PointSize = max(1.5, px);
        vDim = min(1.0, (px * px) / 2.25) * k; vCol = aBead.yzw;
        vFade = 1.0 - 0.45 * uLod * (1.0 - aClose);            // the granules step back when the organelles show
        gl_Position = k > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vCol; in float vDim; in float vFade; out vec4 frag;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
        float lam = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
        frag = vec4(vCol * (0.06 + 0.30 * lam) * vDim * vFade, 1.0);
      }`,
  }));

  // ---- food vacuoles: born at the end of the gullet, carried by the streaming
  // cytoplasm back, then forward along one side and back along the other, shrinking
  // and browning as they are digested, and gone at the cell's vent near the back
  const route = [[0.715, 0.12, 0.05], [0.80, 0.20, -0.25], [0.87, -0.05, -0.30], [0.80, -0.40, -0.42], [0.62, -0.42, -0.58], [0.42, -0.40, -0.60],
    [0.24, -0.30, -0.45], [0.15, -0.05, -0.05], [0.22, 0.05, 0.50], [0.40, -0.05, 0.66], [0.58, 0.0, 0.68], [0.72, 0.25, 0.52], [0.80, 0.52, 0.22]];
  const routeAt = (u) => {                              // Catmull-Rom through the route, u from 0 to 1
    const m = route.length - 1, f = Math.min(0.9999, Math.max(0, u)) * m, i = Math.floor(f), t = f - i;
    const P = (k) => route[Math.min(m, Math.max(0, k))], a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    const q = [0, 1, 2].map((k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (3 * b[k] - 3 * c[k] + d[k] - a[k]) * t * t * t));
    const r = S.r0(q[0]);
    return [L * (0.5 - q[0]), S.cy(q[0]) + q[1] * r, q[2] * r];
  };
  const foodGeo = new THREE.IcosahedronGeometry(1, 3), bitGeo = new THREE.IcosahedronGeometry(1, 1);
  const food = [];
  const NF = 8;
  for (let i = 0; i < NF; i++) {
    const g = new THREE.Group(), age = { value: 0 };
    const sm = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, ...ADD, uniforms: { uAge: age, uK: { value: 1 } },
      vertexShader: /* glsl */ `out vec3 vN; out vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        precision highp float; in vec3 vN; in vec3 vV; out vec4 frag; uniform float uAge, uK;
        void main() {
          ${RIM}
          vec3 edge = uAge < 0.5 ? mix(vec3(0.50, 0.90, 0.28), vec3(0.80, 0.78, 0.25), uAge * 2.0) : mix(vec3(0.80, 0.78, 0.25), vec3(0.85, 0.48, 0.18), uAge * 2.0 - 1.0);
          frag = vec4(mix(edge * 0.03, edge, pow(f, uK > 0.5 ? 2.4 : 1.3)) * (uK > 0.5 ? 0.30 : 0.42), 1.0);
        }`,
    });
    g.add(new THREE.Mesh(foodGeo, sm));
    const bm = sm.clone(); bm.uniforms.uAge = age; bm.uniforms.uK = { value: 0 };
    for (let k = 0; k < 6; k++) {                        // what was swallowed: bacteria, as rods
      const b = new THREE.Mesh(bitGeo, bm), z = uni(-1, 1), a = uni(0, TAU), q = Math.cbrt(rnd()) * 0.62, s = Math.sqrt(1 - z * z);
      b.position.set(z * q, s * Math.cos(a) * q, s * Math.sin(a) * q);
      b.scale.set(0.30, 0.11, 0.11); b.rotation.set(uni(0, TAU), uni(0, TAU), uni(0, TAU));
      g.add(b);
    }
    g.userData = { off: (i + uni(-0.25, 0.25)) / NF, r: uni(0.026, 0.040) * L, age, side: [gauss() * 0.02 * L, gauss() * 0.012 * L] };
    food.push(g);
  }

  const g = new THREE.Group();
  g.add(grains, parts, ...food, tricho, cilia, pellicle);
  g.traverse((q) => { q.frustumCulled = false; });
  g.matrixAutoUpdate = false;
  // in the scene, not in the cell; the food vacuole pointed at is the biggest one just now
  const mark = (key, v) => {
    if (key === 'vacuoles') return v.fromArray(vacs[0].c).applyMatrix4(g.matrix);
    if (key === 'food') { let f = null; for (const q of food) if (q.visible && (!f || q.scale.x > f.scale.x)) f = q; return f ? v.copy(f.position).applyMatrix4(g.matrix) : null; }
    return marks[key] ? v.fromArray(marks[key]).applyMatrix4(g.matrix) : null;
  };
  g.userData = { spec, mark, L: L * UNIT, U, vacs, food, routeAt, shape: S, cilia: roots.length, triangles: (pb.idx.length + B.idx.length) / 3 };
  return g;
}

// --------------------------------------------------------------- behaviour
// Everything is a function of the time in the loop, so it repeats without a seam.
// At a stop the cell grazes: front end in the fringe, body swinging about it. Then
// the avoiding reaction takes it away: back up, swing the front round with the back
// end still, and dart to the next stop along a curve, turning over to the left on a
// narrow spiral with the oral side towards the spiral's axis.
const V_SWIM = 900 * UNIT;       // at the fastest point of a dart: 900 um/s (about 1 mm/s in the paper)
const yawPitch = (d) => [Math.atan2(d[1], d[0]), Math.asin(Math.max(-1, Math.min(1, d[2])))];
const fromYawPitch = (y, p) => [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
function plan(spec, period) {
  const L = spec.len * UNIT, r = mulberry(spec.seed * 13 + 3);
  const stops = spec.stops.map((s) => {
    const d = unit(s.d), C = s.c ? s.c.slice() : add(s.n, d, -L / 2);
    const a = unit([-d[1], d[0], 0]), b = cross(d, a);
    return { ...s, d, C, n: add(C, d, L / 2), a, b, ph: [TAU * r(), TAU * r(), TAU * r()] };
  });
  const bez = (P, q) => { const k = 1 - q; return [0, 1, 2].map((i) => k * k * k * P[0][i] + 3 * k * k * q * P[1][i] + 3 * k * q * q * P[2][i] + q * q * q * P[3][i]); };
  const hops = stops.map((s, i) => {
    const nx = stops[(i + 1) % stops.length], bd = (s.back ?? (s.c ? 0.55 : 0.7)) * L;
    const tail = add(s.C, s.d, -bd - L / 2), d0 = len(sub(nx.C, tail));
    const out = unit(s.out || sub(add(nx.C, nx.d, -0.45 * d0), tail));
    const A = add(tail, out, L / 2), dist = len(sub(nx.C, A)), h = 0.4 * dist;
    const P = [A, add(A, out, h), add(nx.C, nx.d, -h), nx.C];
    let arc = 0, prev = A;
    for (let k = 1; k <= 40; k++) { const p = bez(P, k / 40); arc += len(sub(p, prev)); prev = p; }
    const [y0, p0] = yawPitch(s.d), [y1, p1] = yawPitch(out);
    let dy = y1 - y0; dy -= TAU * Math.round(dy / TAU);
    if (s.turn && Math.sign(dy) !== Math.sign(s.turn)) dy += TAU * Math.sign(s.turn);
    const ang = Math.hypot(dy, p1 - p0);
    return { s, nx, bd, tail, P, yp: [y0, p0, dy, p1 - p0], Tb: 0.25 + (0.45 * bd) / L, Tp: 0.4 + ang / (210 * RAD), Ts: (1.5 * arc) / V_SWIM + 0.35 };
  });
  const fixed = hops.reduce((a, h) => a + h.Tb + h.Tp + h.Ts, 0) + stops.reduce((a, s) => a + (s.c ? 0.3 : 0), 0);
  const share = stops.reduce((a, s) => a + (s.c ? 0 : s.dwell || 1), 0);
  const segs = [];
  let t = 0;
  stops.forEach((s, i) => {
    const T = s.c ? 0.3 : ((period - fixed) * (s.dwell || 1)) / share, h = hops[i];
    segs.push({ type: 'graze', t0: t, t1: t + T, s, T, cycles: Math.max(1, Math.round(T / 6.8)), jerks: s.c ? [] : T > 9 ? [0.34, 0.69] : [0.55] }); t += T;
    segs.push({ type: 'back', t0: t, t1: t + h.Tb, h }); t += h.Tb;
    segs.push({ type: 'pivot', t0: t, t1: t + h.Tp, h }); t += h.Tp;
    segs.push({ type: 'swim', t0: t, t1: t + h.Ts, h }); t += h.Ts;
  });
  const out = { C: [0, 0, 0], d: [1, 0, 0], swim: 0, rev: 0, hz: 10, spin: 0.1 };
  function at(time) {
    const tt = (((time + (spec.shift || 0)) % period) + period) % period;
    let g = segs[segs.length - 1];
    for (const q of segs) if (tt >= q.t0 && tt < q.t1) { g = q; break; }
    const u = (tt - g.t0) / (g.t1 - g.t0);
    out.swim = 0; out.rev = 0;
    if (g.type === 'graze') {
      const s = g.s, env = s.c ? 0 : smoother(u / 0.1) * smoother((1 - u) / 0.1);
      const th1 = (s.swing ? s.swing[0] : 0) * RAD * env * Math.sin(TAU * g.cycles * u + s.ph[0]);
      const th2 = (s.swing ? s.swing[1] : 0) * RAD * env * Math.sin(TAU * (g.cycles + 1) * u + s.ph[1]);
      const d = unit(add(add(s.d, s.a, Math.tan(th1)), s.b, Math.tan(th2)));
      let pull = 0;                                    // now and then it jerks back a fifth of its length and noses in again
      for (const j of g.jerks) {
        const x = (u - j) * g.T;
        if (x > 0 && x < 1.5) { pull = 0.2 * L * (x < 0.22 ? 1 - (1 - x / 0.22) ** 2 : 1 - smoother((x - 0.4) / 1.1)); if (x < 0.22) out.rev = 1; else out.rev = 1 - sstep((x - 0.22) / 0.15); }
      }
      const nose = add(add(s.n, s.a, 3 * env * Math.sin(TAU * u + s.ph[2])), d, -pull);
      out.C = add(nose, d, -L / 2); out.d = d; out.hz = 9 + 9 * out.rev; out.spin = 0.12;
    } else if (g.type === 'back') {
      const h = g.h;
      out.C = add(h.s.C, h.s.d, -h.bd * (1 - (1 - u) ** 2)); out.d = h.s.d; out.rev = sstep(u / 0.12); out.hz = 20; out.spin = 0.6;
    } else if (g.type === 'pivot') {
      const h = g.h, k = smoother(u);
      out.d = fromYawPitch(h.yp[0] + h.yp[2] * k, h.yp[1] + h.yp[3] * k);
      out.C = add(h.tail, out.d, L / 2); out.rev = 1 - sstep(u / 0.5); out.hz = 14; out.spin = 0.45;
    } else {
      const P = g.h.P, q = sstep(u), k = 1 - q;
      out.C = [0, 1, 2].map((i) => k * k * k * P[0][i] + 3 * k * k * q * P[1][i] + 3 * k * q * q * P[2][i] + q * q * q * P[3][i]);
      out.d = unit([0, 1, 2].map((i) => k * k * (P[1][i] - P[0][i]) + 2 * k * q * (P[2][i] - P[1][i]) + q * q * (P[3][i] - P[2][i])));
      out.swim = smoother(u / 0.2) * smoother((1 - u) / 0.2); out.hz = 12 + 7 * out.swim; out.spin = 0.3 + 0.7 * out.swim;
    }
    return out;
  }
  // the turning over, summed ahead of time; nudged so that the loop ends where it began
  const NT = 4096, roll = new Float32Array(NT + 1);
  for (let i = 0; i < NT; i++) roll[i + 1] = roll[i] - TAU * at(((i + 0.5) / NT) * period).spin * (period / NT);
  const fix = (Math.round(roll[NT] / TAU) * TAU) / roll[NT];
  for (let i = 0; i <= NT; i++) roll[i] *= fix;
  const rollAt = (time) => { const f = ((((time % period) + period) % period) / period) * NT, i = Math.min(NT - 1, Math.floor(f)); return roll[i] + (roll[i + 1] - roll[i]) * (f - i); };
  return { at, rollAt, segs, stops, shift: spec.shift || 0 };
}

export function makeParamecia(common, period) {
  const cells = SPECS.map((spec) => {
    const g = makeCell(spec, common);
    g.userData.plan = plan(spec, period);
    g.userData.clock = null;
    g.userData.ends = [new THREE.Vector3(), new THREE.Vector3()];
    return g;
  });
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), Z2 = new THREE.Vector3(), m = new THREE.Matrix4(), seg = new THREE.Line3(), near = new THREE.Vector3();
  // t: the time in the loop; clock: time that never wraps, for the cilia and the vacuoles
  function update(t, clock, camera) {
    for (const g of cells) {
      const ud = g.userData, L = ud.L, p = ud.plan.at(t), rho = ud.plan.rollAt(t), d = p.d;
      const hl = Math.hypot(d[0], d[1]) || 1e-6, e2 = [-d[1] / hl, d[0] / hl, 0], e3 = cross(d, e2);
      const c = Math.cos(rho), s = Math.sin(rho);
      Y.set(c * e2[0] + s * e3[0], c * e2[1] + s * e3[1], c * e2[2] + s * e3[2]);        // the oral side
      X.set(d[0], d[1], d[2]); Z.crossVectors(X, Y);
      // the spiral: the cell rides off the path with its oral side towards it, and leans the way it circles
      const Rh = 0.11 * L * p.swim;
      X.addScaledVector(Z, 0.16 * p.swim).normalize(); Y.crossVectors(Z, X).normalize(); Z.crossVectors(X, Y);
      m.makeBasis(X, Y, Z).scale(Z2.setScalar(UNIT)).setPosition(p.C[0] - Rh * Y.x, p.C[1] - Rh * Y.y, p.C[2] - Rh * Y.z);
      g.matrix.copy(m); g.matrixWorldNeedsUpdate = true;
      g.position.setFromMatrixPosition(m);
      ud.ends[0].copy(g.position).addScaledVector(X, -L / 2); ud.ends[1].copy(g.position).addScaledVector(X, L / 2);
      seg.set(ud.ends[0], ud.ends[1]).closestPointToPoint(camera.position, true, near);
      ud.U.uLod.value = 1 - sstep((camera.position.distanceTo(near) - LOD[0]) / (LOD[1] - LOD[0]));
      // the cilia: the beat speeds up and the stroke swings round to the front when it backs up
      const dt = ud.clock === null ? 0 : Math.max(0, Math.min(0.2, clock - ud.clock));
      ud.clock = clock;
      ud.U.uPhase.value = (ud.U.uPhase.value + TAU * p.hz * dt) % (TAU * 1000);
      ud.U.uStroke.value = 0.45 + (Math.PI - 0.8) * p.rev;
      ud.vacs.forEach((v, i) => {                      // fill slowly, empty at a stroke; the canals swell while it is empty
        const x = (((clock / v.period + v.phase) % 1) + 1) % 1, f = x < 0.88 ? sstep(x / 0.88) : 1 - smoother((x - 0.88) / 0.12);
        ud.U.uPulse.value[i] = 0.12 + 0.88 * Math.cbrt(f); ud.U.uPulse.value[i + 2] = 1.4 - 0.95 * f;
      });
      for (const f of ud.food) {
        const u = (((t / period + f.userData.off) % 1) + 1) % 1, q = ud.routeAt(u);
        const r = f.userData.r * sstep(u / 0.05) * (1 - 0.45 * u) * (1 - sstep((u - 0.94) / 0.06));
        f.position.set(q[0], q[1] + f.userData.side[0], q[2] + f.userData.side[1]); f.scale.setScalar(Math.max(r, 1e-4));
        f.rotation.set(3 * u, 5 * u, 0); f.userData.age.value = u; f.visible = r > 0.05;
      }
    }
  }
  return { cells, update };
}
