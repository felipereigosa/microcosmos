// Vorticella: a bell-shaped ciliate on a long stalk, anchored to a floc. The bell
// (zooid) has no cilia on its body, only a wreath round the rim of the bell that runs
// about one and a quarter turns and down into the funnel of the mouth; its beating
// draws a ring-shaped eddy of water and bacteria in front of the bell. A band inside
// the stalk (the spasmoneme) can pull the stalk into a tight coil in a few
// thousandths of a second, the bell closing as it goes; it then stretches out
// again over some seconds.
//
// Sizes are the usual ones for Vorticella convallaria (bell 50 to 90 um long and 35
// to 50 wide, stalk 100 to 300 um long and about 4 thick), as reviewed in Ryu,
// Pepper, Nagai & France, "Vorticella: a protozoan for bio-inspired engineering",
// Micromachines 8(1), 2017. NOT YET CHECKED against the paper itself: written from
// memory on 2026-11-13. Drawn small, like the paramecia, so that the Lacrymaria
// stays the biggest thing in the drop. The eddy of particles is a show of what the
// cilia do, not a simulation.
import * as THREE from 'three';
import { mulberry, Builder } from './desmodesmus.js';

const TAU = 2 * Math.PI;
const SEG = 6;                   // pieces per cilium
const NS = 150, SIDES = 6;       // rings along the stalk, and points round each
const TURNS = 7;                 // coils of the stalk when it is pulled in
const LOD = [120, 280];          // the eddy shows within 120 of the camera and is gone beyond 280
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };

// where: the floc it grows on (its centre, roughly), the way the stalk points, the
// stalk's and the bell's length, and when in the loop (as fractions) it snaps back
const SPECS = [
  { floc: [141, 15, -144], dir: [0.7, -0.45, 0.55], stalk: 105, len: 32, seed: 5, snaps: [0.13, 0.47, 0.8] },
];

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide };
const RIM = 'float facing = dot(normalize(vN), normalize(-vV)); float f = clamp(1.0 - abs(facing), 0.0, 1.0);';
// a deep blue, at Felipe's wish (the living cell is clear as glass)
const V = (r, g, b) => `vec3(${r}, ${g}, ${b})`;
const SKIN = { dark: V(0.004, 0.010, 0.050), mid: V(0.022, 0.055, 0.26), bright: V(0.22, 0.40, 1.0), stripe: V(0.020, 0.050, 0.20), cil0: V(0.03, 0.07, 0.28), cil1: V(0.16, 0.30, 0.75) };

// the bell: radius at u from 0 (where the stalk joins) to 1 (the rim), for a bell len long
function radiusAt(u, len) {
  const Rm = 0.31 * len;
  return Rm * (0.10 + 0.90 * sstep(u / 0.86) ** 0.85) * (1 - 0.06 * Math.exp(-(((u - 0.88) / 0.05) ** 2)) + 0.16 * Math.exp(-(((u - 0.99) / 0.035) ** 2)));
}

function makeCell(spec, common, flocs) {
  const rnd = mulberry(spec.seed), uni = (a, b) => a + (b - a) * rnd();
  const H = spec.len, Ls = spec.stalk, lipR = radiusAt(1, H);
  const U = { uC: { value: 0 }, uPhase: { value: 0 }, uTime: { value: 0 }, uLod: { value: 0 }, uPx: common.uPx };
  const g = new THREE.Group(), zooid = new THREE.Group();
  g.matrixAutoUpdate = false;

  // ---- the bell's skin, and the disc that closes it inside the rim
  const pb = new Builder({ aUV: 3 }), NX = 56, NP = 48;
  for (let i = 0; i <= NX; i++) {
    const u = i / NX, r = radiusAt(u, H), dr = (radiusAt(u + 0.004, H) - radiusAt(u - 0.004, H)) / (0.008 * H);
    for (let j = 0; j <= NP; j++) {
      const phi = (j / NP) * TAU, c = Math.cos(phi), s = Math.sin(phi), m = Math.hypot(1, dr);
      pb.vert([u * H, r * c, r * s], [-dr / m, c / m, s / m], { aUV: [u, phi, 0] });
    }
  }
  const ND = 10, discR = lipR * 0.86;
  for (let i = 0; i <= ND; i++) {
    const q = i / ND, rho = discR * q, x = H * 0.975 + 2.2 * Math.cos((Math.PI / 2) * q), sl = 2.2 * (Math.PI / 2) * Math.sin((Math.PI / 2) * q) / discR;
    for (let j = 0; j <= NP; j++) {
      const phi = (j / NP) * TAU, c = Math.cos(phi), s = Math.sin(phi), m = Math.hypot(1, sl);
      pb.vert([x, rho * c, rho * s], [1 / m, (sl * c) / m, (sl * s) / m], { aUV: [1, phi, 1] });
    }
  }
  const quads = (first, nx) => { for (let i = 0; i < nx; i++) for (let j = 0; j < NP; j++) { const a = first + i * (NP + 1) + j; pb.idx.push(a, a + 1, a + NP + 2, a, a + NP + 2, a + NP + 1); } };
  quads(0, NX); quads((NX + 1) * (NP + 1), ND);
  const PINCH = /* glsl */ `float pinch = 1.0 - 0.78 * uC * smoothstep(0.70, 1.0, aUV.x);`;
  const pellicle = new THREE.Mesh(pb.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aUV; uniform float uC; out vec3 vN; out vec3 vV; out vec3 vUV;
      void main() {
        ${PINCH}
        vec3 p = vec3(position.x - 4.5 * uC * aUV.z, position.yz * pinch);       // snapped back, the rim draws shut over the disc
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; vUV = aUV; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vUV; out vec4 frag;
      void main() {
        ${RIM}
        float e = pow(f, 2.2);
        vec3 col = mix(mix(${SKIN.dark}, ${SKIN.mid}, smoothstep(0.0, 0.7, e)), ${SKIN.bright}, smoothstep(0.7, 1.0, e)) + ${SKIN.dark};
        // the rings that run round the bell (silverlines), fading before they get finer than a pixel
        float s = vUV.x * 64.0, rows = smoothstep(0.30, 0.48, abs(fract(s) - 0.5)) * (1.0 - smoothstep(0.25, 0.6, fwidth(s))) * (1.0 - vUV.z);
        col += ${SKIN.stripe} * rows * (0.3 + 0.7 * abs(facing));
        frag = vec4(col * (facing > 0.0 ? 1.0 : 0.30) * 0.8, 1.0);
      }`,
  }));

  // ---- the wreath: an outer row thrown outwards and an inner one standing over the disc
  const roots = [];                                     // [point, outward, length, phase, lean]
  const row = (n, rad, x, ln, lean) => { for (let k = 0; k < n; k++) { const phi = (k / n) * TAU + uni(-0.01, 0.01); roots.push([[x, rad * Math.cos(phi), rad * Math.sin(phi)], [0, Math.cos(phi), Math.sin(phi)], ln * uni(0.9, 1.1), 5 * phi, lean]); } };
  row(130, lipR * 0.97, H * 0.995, 7.0, 0.95);
  row(110, lipR * 0.90, H * 0.992, 6.5, 0.45);
  row(90, lipR * 0.84, H * 0.985, 5.5, 0.05);
  const nv = roots.length * SEG * 2, cp = new Float32Array(nv * 3), co = new Float32Array(nv * 3), ci = new Float32Array(nv * 4);
  let o = 0;
  for (const [p, out, ln, ph, lean] of roots) for (let q = 0; q < SEG; q++) for (let e = 0; e < 2; e++) { cp.set(p, o * 3); co.set(out, o * 3); ci.set([q + e, ln, ph, lean], o * 4); o++; }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  cg.setAttribute('aOut', new THREE.BufferAttribute(co, 3));
  cg.setAttribute('aInfo', new THREE.BufferAttribute(ci, 4));
  const cilia = new THREE.LineSegments(cg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aOut; in vec4 aInfo; uniform float uPhase, uC, uPx; out float vU; out float vGain;
      void main() {
        float q = aInfo.x, seg = aInfo.y / ${SEG}.0 * (1.0 - 0.8 * uC);
        vec3 ax = vec3(1.0, 0.0, 0.0), tg = cross(ax, aOut);
        vec3 p = vec3(position.x - 4.5 * uC, position.yz * (1.0 - 0.78 * uC));
        for (int j = 1; j <= ${SEG}; j++) {
          if (float(j) > q + 0.5) break;
          float u = (float(j) - 0.5) / ${SEG}.0, w = uPhase - aInfo.z - 1.3 * u;       // a wave running round the rim, and up each cilium
          float beta = mix(aInfo.w + 0.55 * sin(w) * (0.4 + 0.6 * u), -0.9, uC), gam = 0.7 * cos(w) * u;
          p += (cos(beta) * ax + sin(beta) * (cos(gam) * aOut + sin(gam) * tg)) * seg;
        }
        vU = q / ${SEG}.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vGain = clamp(0.085 * uPx / -mv.z, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `precision highp float; in float vU; in float vGain; out vec4 frag; void main() { frag = vec4(mix(${SKIN.cil0}, ${SKIN.cil1}, vU) * 0.8 * vGain, 1.0); }`,
  }));

  // ---- what is inside, as a textbook draws it: one mesh of rim-lit shells
  const ib = new Builder({ aEdge: 3, aCore: 3, aPar: 2 });
  const look = (edge, core, strength = 0.4, pw = 1.8) => ({ aEdge: edge, aCore: core, aPar: [strength, pw] });
  const ball = (c, rx, ry, rz, lk, nu = 22, nw = 14) => {
    const first = ib.n;
    for (let i = 0; i <= nw; i++) for (let j = 0; j <= nu; j++) {
      const th = (i / nw) * Math.PI, ph = (j / nu) * TAU, n = [Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
      const nn = [n[0] / rx, n[1] / ry, n[2] / rz], m = Math.hypot(...nn);
      ib.vert([c[0] + rx * n[0], c[1] + ry * n[1], c[2] + rz * n[2]], nn.map((v) => v / m), lk);
    }
    for (let i = 0; i < nw; i++) for (let j = 0; j < nu; j++) { const a = first + i * (nu + 1) + j; ib.idx.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1); }
  };
  const tube = (path, rad, n, lk, sides = 10) => {
    const first = ib.n, P = (i) => new THREE.Vector3(...path(Math.min(1, Math.max(0, i / n))));
    const ref = new THREE.Vector3(0.05, 1, 0.03).normalize();
    for (let i = 0; i <= n; i++) {
      const c = P(i), T = P(i + 0.5).sub(P(i - 0.5)).normalize(), a = new THREE.Vector3().crossVectors(T, ref).normalize(), b = new THREE.Vector3().crossVectors(T, a), r = rad(i / n);
      for (let j = 0; j <= sides; j++) { const ph = (j / sides) * TAU, nn = a.clone().multiplyScalar(Math.cos(ph)).addScaledVector(b, Math.sin(ph)); ib.vert(c.clone().addScaledVector(nn, r).toArray(), nn.toArray(), lk); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) { const a = first + i * (sides + 1) + j; ib.idx.push(a, a + 1, a + sides + 2, a, a + sides + 2, a + sides + 1); }
  };
  // the macronucleus: a long band bent into a C across the bell, the micronucleus beside it
  const NUC = look([0.90, 0.22, 0.62], [0.045, 0.004, 0.034], 0.34);
  tube((s) => { const a = -2.25 + 4.5 * s; return [0.63 * H + 0.17 * H * Math.cos(a), -1.2 + 1.2 * Math.sin(2 * a), 0.155 * H * Math.sin(a)]; }, (s) => 1.6 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, s))) ** 0.5), 40, NUC);
  ball([0.68 * H, -0.5, 0.07 * H], 1.0, 1.0, 1.0, look([1.0, 0.45, 0.8], [0.14, 0.03, 0.10], 0.5, 1.5), 10, 8);
  // the funnel of the mouth: from the edge of the disc down into the bell
  const funnel = (s) => [H * (0.985 - 0.40 * s), lipR * (0.62 - 0.55 * s * s), -0.2 * lipR * Math.sin(Math.PI * s)];
  tube(funnel, (s) => 1.7 * (1 - 0.8 * s) + 0.25, 24, look([0.80, 0.78, 0.55], [0.012, 0.012, 0.006], 0.32, 2.2), 16);
  // food vacuoles, greener the newer, and mitochondria
  const inside = (u0, u1, k = 0.68) => { const u = uni(u0, u1), r = k * radiusAt(u, H) * Math.sqrt(rnd()), ph = uni(0, TAU); return [u * H, r * Math.cos(ph), r * Math.sin(ph)]; };
  const marks = { wreath: [H, lipR, 0], funnel: funnel(0.45), nucleus: [0.8 * H, -1.2, 0] };   // where the labels point (see partsOf in main.js)
  for (let i = 0; i < 8; i++) {
    const age = rnd(), r = uni(1.1, 2.1) * (1 - 0.3 * age), edge = age < 0.5 ? [0.50 + 0.6 * age, 0.90 - 0.24 * age, 0.28] : [0.80, 0.78 - 0.6 * (age - 0.5), 0.25];
    const fc = inside(0.3, 0.8);
    if (!i) marks.food = fc;
    ball(fc, r, r, r, look(edge, edge.map((x) => x * 0.03), 0.36, 2.2));
  }
  for (let i = 0; i < 26; i++) ball(inside(0.18, 0.9, 0.85), uni(0.9, 1.3), 0.38, 0.38, look([1.0, 0.40, 0.18], [0.07, 0.014, 0.006], 0.36, 1.7), 8, 6);
  const INNER_VERT = /* glsl */ `in vec3 aEdge, aCore; in vec2 aPar; out vec3 vN; out vec3 vV; out vec3 vEdge; out vec3 vCore; out vec2 vPar; uniform float uC;
    void main() { float k = uC * smoothstep(0.70, 1.0, position.x / ${H.toFixed(1)}); vec4 mv = modelViewMatrix * vec4(position.x - 4.5 * k, position.yz * (1.0 - 0.78 * k), 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; vEdge = aEdge; vCore = aCore; vPar = aPar; gl_Position = projectionMatrix * mv; }`;
  const INNER_FRAG = /* glsl */ `precision highp float; in vec3 vN; in vec3 vV; in vec3 vEdge; in vec3 vCore; in vec2 vPar; out vec4 frag;
    void main() { ${RIM} frag = vec4((vCore + vEdge * pow(f, vPar.y)) * vPar.x, 1.0); }`;
  const innerMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, ...ADD, uniforms: U, vertexShader: INNER_VERT, fragmentShader: INNER_FRAG });
  const inner = new THREE.Mesh(ib.geometry(), innerMat);
  // the contractile vacuole, beside the funnel: fills slowly, empties at a stroke
  const vb = ib; vb.pos = []; vb.nrm = []; vb.idx = []; for (const k in vb.att) vb.att[k] = [];
  ball([0, 0, 0], 1, 1, 1, look([0.55, 0.85, 1.0], [0, 0.003, 0.006], 0.7, 3.0), 28, 18);
  const vac = new THREE.Mesh(vb.geometry(), innerMat);
  vac.position.set(0.74 * H, -0.42 * lipR, 0.32 * lipR);

  // ---- the eddy: specks carried round a ring in front of the bell, in along the middle
  // and out over the rim, turning slowly about the bell's axis as they go
  const NPART = 340, ps = new Float32Array(NPART * 4), pz = new Float32Array(NPART * 3);
  for (let i = 0; i < NPART; i++) { const q = 2 + 11 * rnd() ** 0.8; ps.set([uni(0, TAU), q, uni(0, TAU), (uni(0.8, 1.3) * 9) / q], i * 4); pz.set([uni(0.14, 0.42), rnd(), rnd()], i * 3); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPART * 3), 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(ps, 4));
  pg.setAttribute('aSize', new THREE.BufferAttribute(pz, 3));
  const eddy = new THREE.Points(pg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec4 aSeed; in vec3 aSize; uniform float uTime, uC, uLod, uPx; out float vGain; out float vWarm;
      void main() {
        float q = aSeed.y, th = aSeed.z + uTime * aSeed.w, phi = aSeed.x + 0.45 * uTime + 0.6 * sin(th);
        float ax = ${(H + 3).toFixed(2)} + 0.9 * q + 1.25 * q * sin(th), rho = ${(lipR * 1.35).toFixed(2)} + q * cos(th);
        vec4 mv = modelViewMatrix * vec4(ax, rho * cos(phi), rho * sin(phi), 1.0);
        float px = aSize.x * uPx / -mv.z;
        gl_PointSize = max(px, 1.5);
        vGain = uLod * (1.0 - uC) * clamp(px / 1.5, 0.0, 1.0) * (0.5 + 0.5 * aSize.y);
        vWarm = aSize.z;
        gl_Position = vGain > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in float vGain; in float vWarm; out vec4 frag;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        frag = vec4(mix(vec3(0.55, 0.68, 0.80), vec3(0.85, 0.66, 0.30), vWarm) * (1.0 - r2) * 0.55 * vGain, 1.0);
      }`,
  }));
  eddy.frustumCulled = false;
  zooid.add(pellicle, cilia, inner, vac, eddy);
  cilia.frustumCulled = false;

  // ---- the stalk: a clear sheath, and the band inside it that does the pulling
  const sp = new Float32Array((NS + 1) * SIDES * 3), sn = new Float32Array((NS + 1) * SIDES * 3), sidx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < SIDES; j++) { const a = i * SIDES + j, b = i * SIDES + ((j + 1) % SIDES); sidx.push(a, b, b + SIDES, a, b + SIDES, a + SIDES); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('normal', new THREE.BufferAttribute(sn, 3));
  sg.setIndex(sidx);
  const sheath = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD,
    vertexShader: /* glsl */ `out vec3 vN; out vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `precision highp float; in vec3 vN; in vec3 vV; out vec4 frag; void main() { ${RIM} frag = vec4(mix(${SKIN.mid} * 0.3, ${SKIN.bright}, pow(f, 1.8)) * 0.7, 1.0); }`,
  }));
  const bp = new Float32Array((NS + 1) * 3), bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  const band = new THREE.Line(bg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `uniform float uPx; out float vGain; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vGain = clamp(0.5 * uPx / -mv.z, 0.15, 1.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `precision highp float; in float vGain; out vec4 frag; void main() { frag = vec4(vec3(0.45, 0.62, 1.0) * 0.5 * vGain, 1.0); }`,
  }));
  sheath.frustumCulled = band.frustumCulled = false;
  g.add(sheath, band, zooid);

  // the stalk's middle line at s (0 at the floc, 1 at the bell), pulled in by c, at time tm
  const SR = 0.95;
  const centre = (s, c, tm, out) => {
    const axial = Ls * (1 - 0.8 * c), a = Math.sqrt(Ls * Ls - axial * axial) / (TAU * TURNS), w = sstep(s / 0.1) * (1 - 0.5 * sstep((s - 0.93) / 0.07)), ang = TAU * TURNS * s;
    const loose = (1 - c) * s * s;
    return out.set(s * axial, a * w * Math.cos(ang) + loose * (7 * Math.sin(0.43 * tm) + 3 * Math.sin(1.1 * tm + 1)), a * w * Math.sin(ang) + loose * (9 + 5 * Math.sin(0.31 * tm + 2)));
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
  function pose(c, tm) {
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      centre(s, c, tm, A); centre(Math.min(1, s + 0.004), c, tm, B); T.copy(B); centre(Math.max(0, s - 0.004), c, tm, B); T.sub(B).normalize();
      N1.crossVectors(T, Z).normalize(); N2.crossVectors(T, N1);
      const r = SR * (1 + 0.8 * sstep(1 - s / 0.04));                       // spreading a little where it holds on
      for (let j = 0; j < SIDES; j++) {
        const ph = (j / SIDES) * TAU, cx = Math.cos(ph), sx = Math.sin(ph), k = (i * SIDES + j) * 3;
        sn[k] = N1.x * cx + N2.x * sx; sn[k + 1] = N1.y * cx + N2.y * sx; sn[k + 2] = N1.z * cx + N2.z * sx;
        sp[k] = A.x + r * sn[k]; sp[k + 1] = A.y + r * sn[k + 1]; sp[k + 2] = A.z + r * sn[k + 2];
      }
      const ph = 9 * TAU * s, q = 0.45 * SR;                                // the band winds along inside the sheath
      bp[i * 3] = A.x + q * (N1.x * Math.cos(ph) + N2.x * Math.sin(ph)); bp[i * 3 + 1] = A.y + q * (N1.y * Math.cos(ph) + N2.y * Math.sin(ph)); bp[i * 3 + 2] = A.z + q * (N1.z * Math.cos(ph) + N2.z * Math.sin(ph));
    }
    sg.attributes.position.needsUpdate = sg.attributes.normal.needsUpdate = bg.attributes.position.needsUpdate = true;
    centre(1, c, tm, A); centre(0.985, c, tm, B);
    T.copy(A).sub(B).normalize().lerp(X, 0.85 * c).normalize();              // coiled, the bell still looks away from the floc
    zooid.position.copy(A);
    zooid.quaternion.setFromUnitVectors(X, T);
    zooid.scale.set(1 - 0.2 * c, 1 + 0.13 * c, 1 + 0.13 * c);               // and rounds up
  }

  // on the floc: the lobe nearest the given spot, a little way in from its edge
  let lobe = flocs[0], best = Infinity;
  for (const f of flocs) { const d = Math.hypot(f[0] - spec.floc[0], f[1] - spec.floc[1], f[2] - spec.floc[2]); if (d < best) { best = d; lobe = f; } }
  const dir = new THREE.Vector3(...spec.dir).normalize();
  g.position.set(lobe[0], lobe[1], lobe[2]).addScaledVector(dir, lobe[3] * 0.7);
  g.quaternion.setFromUnitVectors(X, dir);
  g.updateMatrix();
  const spots = Array.from({ length: 9 }, () => ({ p: new THREE.Vector3(), r: 2 }));    // for clicking: the bell, then along the stalk
  const mark = (key, v) => {                            // in the scene; the stalk's is half way along it
    if (key === 'stalk') return v.copy(spots[4].p);
    if (key === 'vacuole') return v.copy(vac.position).applyMatrix4(zooid.matrixWorld);
    return marks[key] ? v.fromArray(marks[key]).applyMatrix4(zooid.matrixWorld) : null;
  };
  Object.assign(g.userData, { spec, U, pose, zooid, vac, spots, centre, H, lipR, mark });
  return g;
}

export function makeVorticella(common, period, flocs) {
  const cells = SPECS.map((spec) => makeCell(spec, common, flocs));
  const tmp = new THREE.Vector3();
  // how far pulled in at time t of the loop: in at a stroke, held a moment, out slowly
  const pulled = (spec, t) => {
    let c = 0;
    for (const f of spec.snaps) {
      const dt = ((((t - f * period) % period) + period) % period);
      c = Math.max(c, dt < 0.05 ? dt / 0.05 : dt < 1.0 ? 1 : dt < 6.0 ? 1 - smoother((dt - 1.0) / 5.0) : 0);
    }
    return c;
  };
  // t: the time in the loop; clock: time that never wraps, for the cilia, the eddy and the swaying
  function update(t, clock, camera) {
    for (const g of cells) {
      const d = g.userData, c = pulled(d.spec, t);
      d.U.uC.value = c;
      d.U.uPhase.value = (clock * 38) % (TAU * 1000);
      d.U.uTime.value = clock % 10000;
      d.pose(c, clock);
      const x = (((clock / 9.5) % 1) + 1) % 1, fill = x < 0.9 ? sstep(x / 0.9) : 1 - smoother((x - 0.9) / 0.1);
      d.vac.scale.setScalar(0.25 + 2.1 * fill);
      g.updateMatrixWorld(true);
      d.spots[0].p.set(d.H * 0.55, 0, 0).applyMatrix4(d.zooid.matrixWorld); d.spots[0].r = d.lipR * 0.95;
      for (let i = 1; i < d.spots.length; i++) d.centre(i / d.spots.length, c, clock, d.spots[i].p).applyMatrix4(g.matrixWorld);
      d.U.uLod.value = 1 - sstep((camera.position.distanceTo(d.spots[0].p) - LOD[0]) / (LOD[1] - LOD[0]));
    }
  }
  return { cells, update };
}
