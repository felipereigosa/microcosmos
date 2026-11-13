// Desmodesmus communis: a green alga that lives as a flat raft (coenobium) of
// oblong cells joined side by side, with a long spine at each corner. It has no
// flagella: it drifts and tumbles in the water.
//
// Measurements after Hegewald & Braband, "A taxonomic revision of Desmodesmus serie
// Desmodesmus", Fottea 17(2), 2017: cells 9.6 to 19.3 um long on average (7.6 to 23.1),
// 2.5 to 3.5 times as long as wide, in rows of 2, 4 or 8; four spines 8 to 15 um long,
// about a cell length or shorter, on the poles of the outer cells; an outer wall layer
// with an irregular net, held off the inner layers by tube-like spacers; rosettes
// about 0.5 um across made of 4 or 5 tubes. One chloroplast lining the wall with one
// pyrenoid is the genus description. The net is drawn several times too coarse so
// that it can be seen; organelles are drawn as a textbook would, as for Lacrymaria.
import * as THREE from 'three';

const TAU = 2 * Math.PI;
const BOX = 3.6;                 // exponent of the superellipse: 2 is an ellipsoid, more is boxier
const LOD = [30, 100];           // close-up detail: all there within 30 um of the camera, gone beyond 100
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// what drifts in the drop: where, how many cells, cell length (um), length over width, spine length, turns per loop
const RAFTS = [
  { p: [40, -130, 110], cells: 4, len: 18, ratio: 3.0, spine: 14, turns: 5, seed: 11 },
  { p: [150, -40, 95], cells: 8, len: 15, ratio: 3.1, spine: 12, turns: 3, seed: 23 },
  { p: [-95, 60, -20], cells: 4, len: 12, ratio: 2.7, spine: 10, turns: 6, seed: 37 },
  { p: [30, -235, 120], cells: 2, len: 13, ratio: 2.8, spine: 11, turns: 7, seed: 51 },
];

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// collects triangles with per-vertex extras, then makes one geometry of them
class Builder {
  constructor(extra) { this.extra = extra; this.pos = []; this.nrm = []; this.idx = []; this.att = {}; for (const k in extra) this.att[k] = []; }
  get n() { return this.pos.length / 3; }
  vert(p, n, vals) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); for (const k in this.extra) this.att[k].push(...vals[k]); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    for (const k in this.extra) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.att[k]), this.extra[k]));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
    return g;
  }
}

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide };
const NOISE = /* glsl */ `
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;
const VERT_HEAD = /* glsl */ `
  out vec3 vN; out vec3 vV; out vec3 vP;
  void base() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; vP = position;
    gl_Position = projectionMatrix * mv;
  }`;
// every base of a pow() is clamped: a rim term a hair below zero gives a NaN pixel
const RIM = 'float facing = dot(normalize(vN), normalize(-vV)); float f = clamp(1.0 - abs(facing), 0.0, 1.0);';

function makeRaft(spec, common) {
  const rnd = mulberry(spec.seed), uni = (a, b) => a + (b - a) * rnd();
  const a = spec.len / 2, b = a / spec.ratio, pitch = 2 * b * 0.96, n = spec.cells;
  const lod = { value: 0 };
  // an outer cell is a little narrower at its poles, which tuck in towards the row
  const cellX = (i) => (i - (n - 1) / 2) * pitch;
  const sideOf = (i) => (i === 0 ? -1 : i === n - 1 ? 1 : 0);
  const shape = (i, th, ph, k) => {                    // point and normal on cell i, shrunk by k
    const e = 2 / BOX, st = Math.sin(th), ct = Math.cos(th), side = sideOf(i);
    const y = a * spow(st, e), rho = Math.abs(ct) ** e, q = (y / a) ** 2;
    const taper = 1 - 0.2 * Math.abs(side) * q;
    const p = [cellX(i) + k * b * rho * taper * Math.cos(ph) - side * 0.11 * b * q * 2, k * y, k * b * 0.94 * rho * taper * Math.sin(ph)];
    const m = Math.abs(ct) ** (2 - e), nn = [m * Math.cos(ph) / b, spow(st, 2 - e) / a, m * Math.sin(ph) / (0.94 * b)];
    const l = Math.hypot(...nn) || 1;
    return [p, nn.map((v) => v / l)];
  };

  // -- the wall and, inside it, the chloroplast: the same boxy shell at two sizes
  const NT = 40, NP = 36;
  const shell = (bld, k, vals) => {
    for (let i = 0; i < n; i++) {
      const o = bld.n, seed = rnd();
      for (let t = 0; t <= NT; t++) for (let j = 0; j <= NP; j++) {
        const th = (t / NT - 0.5) * Math.PI, ph = (j / NP) * TAU;
        const [p, nn] = shape(i, th, ph, k);
        bld.vert(p, nn, vals(i, p, ph, seed));
      }
      for (let t = 0; t < NT; t++) for (let j = 0; j < NP; j++) {
        const q = o + t * (NP + 1) + j;
        bld.idx.push(q, q + 1, q + NP + 2, q, q + NP + 2, q + NP + 1);
      }
    }
  };
  const wallB = new Builder({ aUV: 3 });
  shell(wallB, 1, (i, p, ph, seed) => ({ aUV: [p[1], ph * b, seed] }));
  const wall = new THREE.Mesh(wallB.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: { uLod: lod },
    vertexShader: VERT_HEAD + /* glsl */ `in vec3 aUV; out vec3 vUV; void main() { vUV = aUV; base(); }`,
    fragmentShader: NOISE + /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vP; in vec3 vUV; out vec4 frag; uniform float uLod;
      vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      // distance to the nearest edge of an irregular net (the outer wall layer)
      float net(vec2 x) {
        vec2 n = floor(x), fr = fract(x), mr; float md = 8.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j)), r = g + h2(n + g) - fr; float d = dot(r, r);
          if (d < md) { md = d; mr = r; }
        }
        md = 8.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j)), r = g + h2(n + g) - fr;
          if (dot(mr - r, mr - r) > 0.0001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
        }
        return md;
      }
      void main() {
        ${RIM}
        vec3 col = vec3(0.30, 0.52, 0.34) * (0.035 + 0.75 * pow(f, 2.4));
        if (uLod > 0.01) {
          float e = net(vUV.xy * 3.3 + vUV.z * 40.0);
          col += vec3(0.085, 0.15, 0.10) * uLod * (1.0 - smoothstep(0.02, 0.10, e)) * (0.25 + 0.75 * abs(facing));
        }
        frag = vec4(col * (facing > 0.0 ? 1.0 : 0.5), 1.0);
      }`,
  }));

  const chlB = new Builder({ aUV: 3 });
  const gap = [];                                      // each cell's chloroplast is open along one side
  for (let i = 0; i < n; i++) gap.push(uni(0, TAU));
  shell(chlB, 0.84, (i, p, ph, seed) => ({ aUV: [p[1] / a, ph - gap[i], seed] }));
  const chloro = new THREE.Mesh(chlB.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: { uLod: lod },
    vertexShader: VERT_HEAD + /* glsl */ `in vec3 aUV; out vec3 vUV; void main() { vUV = aUV; base(); }`,
    fragmentShader: NOISE + /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vP; in vec3 vUV; out vec4 frag; uniform float uLod;
      void main() {
        ${RIM}
        vec3 q = vP + vUV.z * 31.0;
        float lump = 0.62 * vnoise(q * 0.95) + 0.38 * vnoise(q * 2.3);            // lobes, with darker gaps between
        float lobes = smoothstep(0.30, 0.62, lump);
        float open = smoothstep(0.35, 0.95, abs(cos(0.5 * vUV.y)) + 0.45 * (lump - 0.5) + 0.25 * vUV.x * vUV.x);   // the open side
        float grain = 0.75 + 0.25 * vnoise(q * 7.0);
        vec3 col = vec3(0.070, 0.30, 0.035) * (0.22 + 0.78 * lobes) * grain + vec3(0.12, 0.42, 0.06) * pow(f, 2.2) * 0.55;
        if (uLod > 0.01) {                                                        // thylakoids, as lines along the cell
          float w = vUV.y * 26.0 + 2.5 * vnoise(q * 0.8);
          col += vec3(0.05, 0.26, 0.03) * uLod * lobes * smoothstep(0.55, 0.95, abs(sin(w)));
        }
        frag = vec4(col * open * (facing > 0.0 ? 1.0 : 0.6), 1.0);
      }`,
  }));

  // -- everything else with a surface: spines, rosettes, pyrenoid, nucleus and the rest
  const B = new Builder({ aEdge: 3, aCore: 3, aK: 3 });      // aK: strength, rim power, 1 if close-up only
  const ico = new THREE.IcosahedronGeometry(1, 2), icoP = ico.getAttribute('position'), icoI = ico.getIndex();
  const M = new THREE.Matrix4(), NM = new THREE.Matrix3(), v = new THREE.Vector3();
  const blob = (c, radii, rot, look) => {              // an ellipsoid at c, turned by the Euler angles rot
    M.compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...radii));
    NM.getNormalMatrix(M);
    const o = B.n;
    for (let i = 0; i < icoP.count; i++) {
      const p = v.fromBufferAttribute(icoP, i).clone().applyMatrix4(M), nn = v.fromBufferAttribute(icoP, i).clone().applyMatrix3(NM).normalize();
      B.vert([p.x, p.y, p.z], [nn.x, nn.y, nn.z], look);
    }
    if (icoI) for (let i = 0; i < icoI.count; i++) B.idx.push(o + icoI.getX(i));
    else for (let i = 0; i < icoP.count; i++) B.idx.push(o + i);
  };
  const tube = (pts, rad, look, sides = 6) => {        // a round tube along pts, radius from rad(0..1)
    const o = B.n, m = pts.length;
    let N = null;
    for (let i = 0; i < m; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(m - 1, i + 1)];
      const T = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      if (!N) N = new THREE.Vector3(0, 0, 1).cross(T).lengthSq() > 0.01 ? new THREE.Vector3(0, 0, 1).cross(T).normalize() : new THREE.Vector3(1, 0, 0);
      N.addScaledVector(T, -N.dot(T)).normalize();
      const Bn = new THREE.Vector3().crossVectors(T, N), r = rad(i / (m - 1));
      for (let j = 0; j < sides; j++) {
        const c = Math.cos((j / sides) * TAU), s = Math.sin((j / sides) * TAU), nn = [N.x * c + Bn.x * s, N.y * c + Bn.y * s, N.z * c + Bn.z * s];
        B.vert([pts[i][0] + r * nn[0], pts[i][1] + r * nn[1], pts[i][2] + r * nn[2]], nn, look);
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < sides; j++) {
      const q = o + i * sides + j, q2 = o + i * sides + ((j + 1) % sides);
      B.idx.push(q, q2, q2 + sides, q, q2 + sides, q + sides);
    }
  };
  const look = (edge, core, strength, pw = 1.6, close = 0) => ({ aEdge: edge, aCore: core, aK: [strength, pw, close] });
  const SPINE = look([0.62, 0.86, 0.70], [0.03, 0.05, 0.035], 0.55, 1.2);
  const ROSETTE = look([0.85, 0.95, 0.75], [0.06, 0.09, 0.05], 0.45, 1.0, 1);
  const PYR = look([0.80, 0.95, 0.42], [0.035, 0.06, 0.008], 0.55, 2.0);
  const STARCH = look([0.95, 0.95, 0.85], [0.07, 0.07, 0.05], 0.55, 1.2, 1);
  const NUC = look([0.90, 0.22, 0.62], [0.06, 0.005, 0.045], 0.42);
  const NUCLEOLUS = look([1.0, 0.45, 0.8], [0.12, 0.02, 0.08], 0.5, 1.6, 1);
  const VAC = look([0.55, 0.85, 1.0], [0, 0.003, 0.006], 0.5, 3.0);
  const MITO = look([1.0, 0.55, 0.22], [0.05, 0.015, 0.004], 0.6, 1.4, 1);
  const GOLGI = look([1.0, 0.85, 0.30], [0.05, 0.035, 0.005], 0.6, 1.3, 1);

  // spines: one at each pole of the two outer cells, pointing away from the row and curving
  // further out; "bundles of tubes" in the paper, drawn as one tapering tube
  const ends = n > 1 ? [0, n - 1] : [0];
  for (const i of ends) for (const up of [-1, 1]) {
    const side = sideOf(i) || (up > 0 ? 1 : -1);
    const [root] = shape(i, up * Math.PI / 2 * 0.93, side > 0 ? 0 : Math.PI, 1);
    let ang = uni(0.62, 0.86), z = 0, zs = uni(-0.12, 0.12);
    const bend = uni(0.012, 0.03), pts = [root], steps = 22, ds = (spec.spine * uni(0.9, 1.1)) / steps;
    for (let s = 0; s < steps; s++) {
      const p = pts[pts.length - 1];
      pts.push([p[0] + side * Math.sin(ang) * ds, p[1] + up * Math.cos(ang) * ds, (z += zs * ds)]);
      ang += bend * ds;
    }
    const r0 = 0.085 * b + 0.12;
    tube(pts, (u) => r0 * (1 - u) ** 0.7 + 0.035, SPINE);
  }

  const beads = [];                                    // x y z radius r g b
  const inside = (i, y, rho, ph, k = 0.74) => {        // a point in cell i, rho from 0 (axis) to 1 (just inside the chloroplast)
    const r = b * k * Math.max(0, 1 - Math.abs(y / a) ** BOX) ** (1 / BOX) * rho;
    return [cellX(i) + r * Math.cos(ph), y, 0.94 * r * Math.sin(ph)];
  };
  for (let i = 0; i < n; i++) {
    const flip = rnd() < 0.5 ? -1 : 1, gp = gap[i];
    // the pyrenoid sits in the chloroplast, on the side away from its opening, in a sheath of starch plates
    const pr = 0.36 * b, pc = inside(i, flip * uni(0.08, 0.22) * a, 0.42, gp + Math.PI + uni(-0.5, 0.5));
    blob(pc, [pr, pr, pr], [0, 0, 0], PYR);
    blob(pc, [pr * 0.45, pr * 0.45, pr * 0.45], [0, 0, 0], look([0.55, 0.80, 0.25], [0.05, 0.09, 0.01], 0.5, 1.2, 1));
    for (let k = 0; k < 9; k++) {
      const u = 2 * rnd() - 1, w = uni(0, TAU), s = Math.sqrt(1 - u * u), d = [s * Math.cos(w), s * Math.sin(w), u];
      blob(pc.map((c, j) => c + d[j] * pr * 1.22), [pr * 0.5, pr * 0.5, pr * 0.16], [Math.atan2(-d[1], d[2]), Math.asin(d[0]), 0], STARCH);
    }
    // the nucleus on the open side, towards the other end; a Golgi stack beside it
    const nr = 0.40 * b, nc = inside(i, -flip * uni(0.18, 0.32) * a, 0.38, gp + uni(-0.4, 0.4));
    blob(nc, [nr, nr * 1.1, nr], [0, 0, 0], NUC);
    blob([nc[0] + 0.25 * nr, nc[1], nc[2] - 0.2 * nr], [nr * 0.38, nr * 0.38, nr * 0.38], [0, 0, 0], NUCLEOLUS);
    const gw = uni(0, TAU);
    for (let k = 0; k < 4; k++) {
      const off = nr * 1.25 + k * 0.11 * b;
      blob([nc[0] + Math.cos(gw) * off * 0.5, nc[1] - flip * off, nc[2] + Math.sin(gw) * off * 0.5], [0.30 * b * (1 - 0.1 * k), 0.035 * b, 0.26 * b * (1 - 0.1 * k)], [0.5 * Math.sin(gw), 0, -0.5 * Math.cos(gw)], GOLGI);
    }
    for (let k = 0; k < 4; k++) {
      const y = uni(-0.78, 0.78) * a;
      blob(inside(i, y, uni(0.3, 0.75), uni(0, TAU)), [0.10 * b, uni(0.28, 0.45) * b, 0.10 * b], [uni(-0.5, 0.5), 0, uni(-0.5, 0.5)], MITO);
    }
    for (const e of [-1, 1]) {
      const vr = uni(0.16, 0.26) * b;
      blob(inside(i, e * uni(0.62, 0.74) * a, uni(0, 0.3), uni(0, TAU)), [vr, vr, vr], [0, 0, 0], VAC);
    }
    for (let k = 0; k < 14; k++) {                     // starch grains in the chloroplast, a few oil drops
      const oil = k < 3, p = inside(i, uni(-0.85, 0.85) * a, oil ? uni(0.2, 0.7) : uni(0.8, 1.02), uni(0, TAU));
      beads.push([...p, (oil ? uni(0.07, 0.12) : uni(0.04, 0.085)) * b, ...(oil ? [0.95, 0.70, 0.18] : [0.78, 0.90, 0.62])]);
    }
    // rosettes: a ring of 4 or 5 short tubes about 0.5 um across, here one near each pole on each face
    for (const e of [-1, 1]) for (const face of [-1, 1]) {
      const [p, nn] = shape(i, e * uni(0.9, 1.15), face * Math.PI / 2 + uni(-0.5, 0.5), 1);
      const t1 = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(...nn)).normalize(), t2 = new THREE.Vector3(...nn).cross(t1);
      const m = rnd() < 0.5 ? 4 : 5;
      for (let k = 0; k < m; k++) {
        const c = Math.cos((k / m) * TAU) * 0.19, s = Math.sin((k / m) * TAU) * 0.19;
        const q = [p[0] + t1.x * c + t2.x * s, p[1] + t1.y * c + t2.y * s, p[2] + t1.z * c + t2.z * s];
        tube([q, q.map((x, j) => x + nn[j] * 0.3)], () => 0.085, ROSETTE, 5);
      }
    }
  }
  const parts = new THREE.Mesh(B.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: { uLod: lod },
    vertexShader: /* glsl */ `
      in vec3 aEdge; in vec3 aCore; in vec3 aK; uniform float uLod;
      out vec3 vN; out vec3 vV; out vec3 vEdge; out vec3 vCore; out vec2 vK;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = mat3(modelViewMatrix) * normal; vV = mv.xyz;
        vEdge = aEdge; vCore = aCore; vK = vec2(aK.x * mix(1.0, uLod, aK.z), aK.y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vEdge; in vec3 vCore; in vec2 vK; out vec4 frag;
      void main() {
        ${RIM}
        frag = vec4(mix(vCore, vEdge, pow(f, vK.y)) * vK.x, 1.0);
      }`,
  }));

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beads.flatMap((q) => q.slice(0, 3))), 3));
  pg.setAttribute('aBead', new THREE.BufferAttribute(new Float32Array(beads.flatMap((q) => q.slice(3))), 4));
  const grains = new THREE.Points(pg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { uPx: common.uPx },
    vertexShader: /* glsl */ `
      in vec4 aBead; uniform float uPx; out vec3 vCol; out float vDim;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = 2.0 * aBead.x * uPx / -mv.z;
        gl_PointSize = max(1.5, px);
        vDim = min(1.0, (px * px) / 2.25); vCol = aBead.yzw;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vCol; in float vDim; out vec4 frag;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
        float lam = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
        frag = vec4(vCol * (0.07 + 0.36 * lam) * vDim, 1.0);
      }`,
  }));

  const g = new THREE.Group();
  g.add(grains, chloro, parts, wall);
  g.children.forEach((o) => { o.frustumCulled = false; });
  g.matrixAutoUpdate = false;
  g.userData = { spec, lod, radius: Math.hypot(a, (n * pitch) / 2) + 0.6 * spec.spine, cell: [a, b], triangles: (wallB.idx.length + chlB.idx.length + B.idx.length) / 3 };
  return g;
}

// The motion is invented and periodic, so that it loops with the rest: each raft wanders
// slowly about its place and turns over and over about an axis of its own that itself
// leans about slowly. Whole numbers of cycles per loop throughout.
export function makeDesmodesmus(common, period) {
  const rafts = RAFTS.map((spec) => {
    const g = makeRaft(spec, common), r = mulberry(spec.seed * 7 + 1), w = (k) => (TAU * k) / period;
    const wave = (amp, kmax) => { const q = [amp * (0.5 + r()), w(1 + Math.floor(r() * kmax)), TAU * r(), amp * 0.4 * r(), w(2 + Math.floor(r() * kmax)), TAU * r()]; return (t) => q[0] * Math.sin(q[1] * t + q[2]) + q[3] * Math.sin(q[4] * t + q[5]); };
    const u = new THREE.Vector3(0.75 + 0.5 * r(), 0.45 + 0.5 * r(), 0.25 * r()).normalize();    // mostly end over end and edge over edge
    Object.assign(g.userData, { drift: [wave(26, 2), wave(26, 2), wave(16, 2)], lean: [wave(0.9, 3), wave(0.9, 3), wave(0.9, 3)], axis: u, q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(TAU * r(), TAU * r(), TAU * r())) });
    return g;
  });
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e = new THREE.Euler();
  function update(t, camera) {
    for (const g of rafts) {
      const d = g.userData;
      g.position.set(d.spec.p[0] + d.drift[0](t), d.spec.p[1] + d.drift[1](t), d.spec.p[2] + d.drift[2](t));
      qa.setFromEuler(e.set(d.lean[0](t), d.lean[1](t), d.lean[2](t)));
      qb.setFromAxisAngle(d.axis, (TAU * d.spec.turns * t) / period);
      g.quaternion.copy(qa).multiply(d.q0).multiply(qb);
      g.updateMatrix();
      d.lod.value = 1 - sstep((camera.position.distanceTo(g.position) - LOD[0]) / (LOD[1] - LOD[0]));
    }
  }
  return { rafts, update };
}
