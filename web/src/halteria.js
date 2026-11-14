// Halteria: a small globular ciliate, and what the Lacrymaria eats here. It hangs
// almost still in the water, turning slowly, fanning bacteria in with a collar of
// membranelles (plates of fused cilia) round its front; round its middle stand
// groups of long stiff bristles, and when anything touches it they all strike at
// once and the cell is somewhere else: it jumps backwards, far faster than it swims.
//
// The Lacrymaria catching one is in the Journey to the Microcosmos episode this
// project started from ("hunting a Halteria", footage by James Weiss, 4:38 to 5:38):
// the head touches, the prey stops dead, the neck draws it in and holds it at its tip
// for some 15 s, then the cell closes up to it, its mouth stretches right over the
// prey and it sits bent double for half a minute with a lump in its front end.
//
// Numbers as usually given for Halteria grandinella (Wikipedia and the atlases it
// cites; no paper was read): globular, 15 to 35 um across; 15 membranelles in the
// collar and 7 more in the mouth; 7 to 10 rows of bristles round the equator, each
// bristle 15 to 25 um long; one oblong macronucleus and a round micronucleus; the
// contractile vacuole about half way along. The speed and length of the jump are from
// memory (a millimetre or two a second over a tenth of a millimetre or so), unchecked.
// Reddish at Felipe's wish; the living cell is colourless.
import * as THREE from 'three';
import { mulberry, Builder } from './desmodesmus.js';

const TAU = 2 * Math.PI;
const UNIT = 1 / 1.7;            // scene units per um, as for the paramecia
const HALF_LEN = 13, HALF_WID = 11.5;       // um
export const SIZE = { a: HALF_LEN * UNIT, b: HALF_WID * UNIT };    // in scene units, for whoever swallows one
const SEG = 5;                   // pieces per cilium
const LOD = [45, 130];           // close-up detail: all there within 45 of the camera, gone beyond 130
const V_JUMP = 900;              // scene units a second at the start of a jump (about 1.5 mm/s)
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// The bystanders: where each one lives (scene units). They are not scripted: each
// jumps away from whatever comes near it (see planJumps). The one that gets eaten is
// made separately, from what main.js says about the catch.
const HOMES = [
  { home: [10, 45, 22], seed: 3 },
  { home: [205, -70, 18], seed: 7 },
  { home: [-95, -120, 34], seed: 11 },
  { home: [-40, -40, -30], seed: 17 },
];

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide };
const RIM = 'float facing = dot(normalize(vN), normalize(-vV)); float f = clamp(1.0 - abs(facing), 0.0, 1.0);';   // clamped: a pow() of a negative gives NaN
const V = (r, g, b) => `vec3(${r}, ${g}, ${b})`;
const SKIN = { dark: V(0.030, 0.006, 0.005), mid: V(0.25, 0.055, 0.040), bright: V(1.0, 0.34, 0.25), haze: V(0.024, 0.006, 0.005),
  rows: V(0.16, 0.040, 0.030), mouth: V(0.060, 0.016, 0.012), cil0: V(0.11, 0.028, 0.022), cil1: V(0.52, 0.17, 0.12), bristle: V(0.62, 0.24, 0.18) };

// ------------------------------------------------------------------ the shape
// A dome: round behind, widest a little in front of the middle, flattened in front
// where the collar stands. c runs from -1 (the back pole) to 1 (the front pole).
const AX = HALF_LEN / 0.886;
const C_COLLAR = 0.56;           // where the collar of membranelles stands
const xOf = (c) => AX * ((c < 0.4 ? c : 0.4 + (c - 0.4) * 0.62) + 0.114);
const mouthAt = (c, phi) => {    // the mouth: a pocket running back from the collar on one side
  let dp = phi; dp -= TAU * Math.round(dp / TAU);
  return sstep((c + 0.15) / 0.3) * (1 - sstep((c - 0.62) / 0.2)) * Math.exp(-((dp / 0.5) ** 2));
};
// how wide the cell is x along its axis from its middle, in scene units (the mouth's pocket left out): for whoever swallows one
export function radiusAt(x) {
  const g = x / UNIT / AX - 0.114, c = g < 0.4 ? g : 0.4 + (g - 0.4) / 0.62;
  return Math.abs(c) >= 1 ? 0 : HALF_WID * Math.pow(1 - c * c, 0.43) * UNIT;
}
const radOf = (c, phi) => HALF_WID * Math.pow(Math.max(0, 1 - c * c), 0.43) * (1 - 0.30 * mouthAt(c, phi));
const at = (c, rho, phi) => { const r = rho * radOf(c, phi); return [xOf(c), r * Math.cos(phi), r * Math.sin(phi)]; };
function frame(c, phi) {         // outward normal, and the way to the front along the surface
  const e = 0.004, k = Math.min(0.995, Math.max(-0.995, c));
  const dx = sub(at(k + e, 1, phi), at(k - e, 1, phi)), dp = sub(at(k, 1, phi + 0.02), at(k, 1, phi - 0.02));
  let nn = unit(cross(dp, dx));
  if (dot(nn, [0.3 * k, Math.cos(phi), Math.sin(phi)]) < 0) nn = nn.map((v) => -v);
  return [nn, unit(add(dx, nn, -dot(dx, nn)))];
}

function makeCell(seed, common) {
  const rnd = mulberry(seed), uni = (a, b) => a + (b - a) * rnd();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  // uLimp: stung, nothing beats any more. uFold: swallowed, everything lies flat. uFade: overall brightness.
  const U = { uLod: { value: 0 }, uPhase: { value: 0 }, uKick: { value: 0 }, uLimp: { value: 0 }, uFold: { value: 0 }, uFade: { value: 1 },
    uSting: { value: 0 }, uCover: { value: -1e3 }, uPulse: { value: 1 }, uPx: common.uPx, uUnit: { value: UNIT } };

  // ---- pellicle
  const NX = 72, NP = 72, pb = new Builder({ aUV: 3 });
  for (let i = 0; i <= NX; i++) {
    const c = -Math.cos((Math.PI * i) / NX);
    for (let j = 0; j <= NP; j++) {
      const phi = (j / NP) * TAU, [nn] = frame(c, phi);
      pb.vert(at(c, 1, phi), nn, { aUV: [c, phi, mouthAt(c, phi)] });
    }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j; pb.idx.push(a, a + 1, a + NP + 2, a, a + NP + 2, a + NP + 1); }
  const pellicle = new THREE.Mesh(pb.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aUV; out vec3 vN; out vec3 vV; out vec3 vUV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = mat3(modelViewMatrix) * normal; vV = mv.xyz; vUV = aUV; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vUV; out vec4 frag; uniform float uLod, uFade, uSting;
      vec3 ramp4(float x, float p1, float p2, vec3 c1, vec3 c2, vec3 c3) {
        if (x < p1) return mix(vec3(0.0), c1, x / p1);
        if (x < p2) return mix(c1, c2, (x - p1) / (p2 - p1));
        return mix(c2, c3, (x - p2) / (1.0 - p2));
      }
      void main() {
        ${RIM}
        vec3 col = ramp4(pow(f, 1.5), 0.45, 0.82, ${SKIN.dark}, ${SKIN.mid}, ${SKIN.bright}) + ${SKIN.haze};
        col += ${SKIN.mouth} * vUV.z;
        // the ridge the collar stands on, and close up the fine lines that run from pole to pole
        float ridge = exp(-pow((vUV.x - ${C_COLLAR.toFixed(2)}) / 0.035, 2.0));
        float s = vUV.y * ${(28 / TAU).toFixed(5)}, lines = smoothstep(0.30, 0.48, abs(fract(s) - 0.5)) * (1.0 - smoothstep(0.25, 0.6, fwidth(s)));
        col += ${SKIN.rows} * (0.8 * ridge + 0.6 * uLod * lines * (1.0 - vUV.x * vUV.x)) * (0.3 + 0.7 * abs(facing));
        col += vec3(0.9, 0.55, 0.25) * 0.10 * uSting * exp(-pow((vUV.x + 1.0) / 0.5, 2.0));          // where it was hit
        frag = vec4(col * (facing > 0.0 ? 1.0 : 0.30) * 0.8 * uFade, 1.0);
      }`,
  }));

  // ---- cilia. kind 0: the collar, 15 membranelles, each a little fan that swings as one;
  // 1: the 7 smaller ones down the side of the mouth; 2: the bristles, in 7 rows of 3
  const roots = [];                                     // [point, normal, the way it leans, length, phase, kind]
  for (let k = 0; k < 15; k++) {
    const phi0 = ((k + 0.5) / 15) * TAU;
    for (let i = 0; i < 6; i++) {
      const phi = phi0 + (i - 2.5) * 0.045, [nn, fwd] = frame(C_COLLAR, phi);
      roots.push([at(C_COLLAR, 1, phi), nn, fwd, 12 * (1 - 0.04 * Math.abs(i - 2.5)) * uni(0.96, 1.04), (k / 15) * TAU * 2 + 0.05 * i, 0]);
    }
  }
  for (let k = 0; k < 7; k++) {
    const c = 0.50 - 0.085 * k, phi0 = -0.42 + 0.03 * k;
    for (let i = 0; i < 4; i++) {
      const [nn, fwd] = frame(c - 0.02 * i, phi0), side = unit(cross(fwd, nn));
      roots.push([at(c - 0.02 * i, 1, phi0), nn, side, 5.5 * uni(0.9, 1.05), 1.1 * k + 0.1 * i, 1]);
    }
  }
  for (let k = 0; k < 7; k++) {
    const phi0 = ((k + 0.5) / 7) * TAU + 0.45;
    for (let i = 0; i < 3; i++) {
      const c = 0.10 - 0.11 * i, phi = phi0 + uni(-0.03, 0.03), [nn, fwd] = frame(c, phi);
      roots.push([at(c, 1, phi), unit(add(nn, fwd, 0.22 - 0.3 * i)), fwd.map((v) => -v), [21, 18, 15][i] * uni(0.92, 1.08), rnd() * TAU, 2]);
    }
  }
  const nv = roots.length * SEG * 2, cp = new Float32Array(nv * 3), cn = new Float32Array(nv * 3), cb = new Float32Array(nv * 3), ci = new Float32Array(nv * 4);
  let o = 0;
  for (const [p, nn, lean, ln, ph, kind] of roots) for (let q = 0; q < SEG; q++) for (let e = 0; e < 2; e++) {
    cp.set(p, o * 3); cn.set(nn, o * 3); cb.set(lean, o * 3); ci.set([q + e, ln, ph, kind], o * 4); o++;
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  cg.setAttribute('aNrm', new THREE.BufferAttribute(cn, 3));
  cg.setAttribute('aLean', new THREE.BufferAttribute(cb, 3));
  cg.setAttribute('aInfo', new THREE.BufferAttribute(ci, 4));
  const cilia = new THREE.LineSegments(cg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aNrm, aLean; in vec4 aInfo;
      uniform float uPhase, uKick, uLimp, uCover, uPx;
      out float vU; out float vGain; out float vKind; out float vFold;
      void main() {
        // uCover: how far along the cell the mouth of what is swallowing it has come. A cilium
        // lies flat, shrinks and is gone as the mouth reaches its foot, so that nothing sticks out through the skin
        float uFold = aInfo.w > 1.5 ? smoothstep(-10.0, -3.5, uCover - position.x) : smoothstep(-4.5, -0.5, uCover - position.x);   // the bristles, which trail back towards the mouth, go first
        vFold = uFold;
        float q = aInfo.x, kind = aInfo.w, seg = aInfo.y / ${SEG}.0;
        vec3 n = aNrm, side = cross(n, aLean), p = position;
        for (int j = 1; j <= ${SEG}; j++) {
          if (float(j) > q + 0.5) break;
          float u = (float(j) - 0.5) / ${SEG}.0, beta, gam = 0.0;
          if (kind > 1.5) {
            // a bristle: stiff and still; in a jump they all swing back at once and return;
            // stung, they droop; swallowed, they are pressed flat
            beta = 1.9 * uKick * (0.6 + 0.4 * u) + uLimp * (0.5 + 0.5 * u + 0.12 * sin(aInfo.z + 3.0 * u)) + uFold * 1.1;
            gam = uLimp * 0.5 * sin(aInfo.z);
          } else {
            float w = uPhase - aInfo.z - 1.5 * u, live = 1.0 - uLimp;
            float rest = kind > 0.5 ? 0.9 : 0.75;                 // how far it leans when at rest
            beta = rest + live * 0.62 * sin(w) * (0.35 + 0.65 * u) + uLimp * (0.25 + 0.5 * u) + uFold * 0.9;
            gam = live * 0.5 * cos(w) * u;
          }
          beta = min(beta, 1.75);
          p += (cos(beta) * n + sin(beta) * (cos(gam) * aLean + sin(gam) * side)) * seg * (1.0 - 0.85 * uFold);
        }
        vU = q / ${SEG}.0; vKind = kind;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vGain = clamp((kind > 1.5 ? 0.11 : 0.085) * uPx / -mv.z, 0.0, 1.0);    // real width in pixels, capped at one
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in float vU; in float vGain; in float vKind; in float vFold; out vec4 frag; uniform float uFade;
      void main() {
        vec3 c = vKind > 1.5 ? ${SKIN.bristle} * (0.75 - 0.4 * vU) : mix(${SKIN.cil0}, ${SKIN.cil1}, vU);
        frag = vec4(c * 0.7 * vGain * uFade * (1.0 - vFold), 1.0);
      }`,
  }));

  // ---- what is inside, in one mesh. aK: strength, rim power, 1 if close-up only. aPulse: the point a part swells about
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
  const taken = [];
  const free = (p, r) => taken.every((k) => len(sub(p, k)) > r + k[3]);
  // the macronucleus, oblong, lying across the middle; the micronucleus in a dent of it
  const mc = [xOf(-0.12), -1.2, 0.8];
  blob(mc, [3.6, 6.4, 3.8], [0.3, 0.2, 0.25], look([0.95, 0.30, 0.66], [0.05, 0.006, 0.036], 0.34));
  for (let e = -0.6; e <= 0.61; e += 0.6) taken.push([mc[0], mc[1] + e * 6.4, mc[2], 4.0]);
  for (let i = 0; i < 4; i++) blob(add(mc, [uni(-1.4, 1.4), -4.4 + 2.9 * i + uni(-0.4, 0.4), uni(-1.5, 1.5)]), [0.7, 1.25, 0.7], [0.3, 0.2, 0.25], look([1.0, 0.62, 0.78], [0.10, 0.035, 0.065], 0.28, 1.8, 1));   // its band-like nucleoli
  const mic = add(mc, [3.2, 2.2, 2.4]);
  blob(mic, [1.25, 1.25, 1.25], [0, 0, 0], look([1.0, 0.5, 0.82], [0.14, 0.03, 0.10], 0.5, 1.5));
  taken.push([...mic, 1.5]);
  // the contractile vacuole: half way along, beside the mouth
  const vac = at(0.0, 0.66, 0.95);
  blob(vac, [2.5, 2.5, 2.5], [0, 0, 0], look([0.55, 0.85, 1.0], [0, 0.003, 0.006], 0.7, 3.0), 1);
  taken.push([...vac, 3.0]);
  // food vacuoles: bacteria and small algae, behind the mouth
  let made = 0;
  for (let tries = 0; made < 5 && tries < 400; tries++) {
    const r = uni(1.5, 2.5), p = at(uni(-0.6, 0.3), uni(0.15, 0.62), uni(0, TAU));
    if (!free(p, r)) continue;
    const g = rnd() < 0.6;
    blob(p, [r, r, r], [0, 0, 0], look(g ? [0.50, 0.90, 0.28] : [0.85, 0.62, 0.22], g ? [0.03, 0.06, 0.012] : [0.05, 0.03, 0.008], 0.36, 1.5));
    taken.push([...p, r * 1.1]); made++;
  }
  // mitochondria, small and round, under the pellicle; close up only
  made = 0;
  for (let tries = 0; made < 34 && tries < 2000; tries++) {
    const c = uni(-0.9, 0.5), phi = uni(0, TAU), p = at(c, 1 - uni(1.3, 2.6) / Math.max(4, radOf(c, phi)), phi), r = uni(0.45, 0.62);
    if (!free(p, r)) continue;
    blob(p, [r * uni(1, 1.5), r, r], [uni(0, TAU), uni(0, TAU), 0], look([1.0, 0.44, 0.16], [0.07, 0.016, 0.006], 0.42, 1.7, 1));
    taken.push([...p, r]); made++;
  }
  const parts = new THREE.Mesh(B.geometry(), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `
      in vec3 aEdge; in vec3 aCore; in vec3 aK; in vec4 aPulse; uniform float uLod, uPulse;
      out vec3 vN; out vec3 vV; out vec3 vEdge; out vec3 vCore; out vec2 vK;
      void main() {
        vec3 p = position;
        if (aPulse.w > 0.5) p = aPulse.xyz + (p - aPulse.xyz) * uPulse;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = mat3(modelViewMatrix) * normal; vV = mv.xyz;
        vEdge = aEdge; vCore = aCore; vK = vec2(aK.x * mix(1.0, uLod, aK.z), aK.y);
        gl_Position = vK.x > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vN; in vec3 vV; in vec3 vEdge; in vec3 vCore; in vec2 vK; out vec4 frag; uniform float uFade;
      void main() { ${RIM} frag = vec4(mix(vCore, vEdge, pow(f, vK.y)) * vK.x * uFade, 1.0); }`,
  }));

  // ---- grains in the cytoplasm
  const beads = [];
  for (let i = 0; i < 260; i++) {
    const p = at(uni(-0.93, 0.6), Math.sqrt(rnd()) * 0.86, uni(0, TAU)), w = rnd();
    beads.push([...p, Math.min(0.9, Math.max(0.14, Math.exp(-1.25 + 0.45 * gauss()))), ...(w < 0.5 ? [0.95, 0.52, 0.30] : w < 0.8 ? [0.85, 0.70, 0.40] : [0.80, 0.80, 0.75])]);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(beads.flatMap((q) => q.slice(0, 3)), 3));
  pg.setAttribute('aBead', new THREE.Float32BufferAttribute(beads.flatMap((q) => q.slice(3, 7)), 4));
  const grains = new THREE.Points(pg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, ...ADD,
    vertexShader: /* glsl */ `
      in vec4 aBead; uniform float uPx, uUnit; out vec3 vCol; out float vDim;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = 2.0 * aBead.x * uUnit * uPx / -mv.z;
        gl_PointSize = max(1.5, px);
        vDim = min(1.0, (px * px) / 2.25); vCol = aBead.yzw;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; in vec3 vCol; in float vDim; out vec4 frag; uniform float uFade;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
        float lam = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
        frag = vec4(vCol * (0.06 + 0.30 * lam) * vDim * uFade, 1.0);
      }`,
  }));

  // ---- the threads the Lacrymaria's extrusomes drive into it, at the back pole where
  // the head holds it; they show only once it has been stung
  const sp = [];
  for (let i = 0; i < 14; i++) {
    const a = uni(0, TAU), w = uni(0.05, 0.42), p = [xOf(-1) + 0.4, HALF_WID * w * Math.cos(a), HALF_WID * w * Math.sin(a)];
    sp.push(...add(p, [-1, 0, 0], uni(0.5, 1.5)), ...add(p, unit([1, 0.5 * gauss() * w, 0.5 * gauss() * w]), uni(4, 8.5)));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const sting = new THREE.LineSegments(sg, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, ...ADD, uniforms: U,
    vertexShader: /* glsl */ `uniform float uPx, uSting; out float vGain;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vGain = uSting * clamp(0.16 * uPx / -mv.z, 0.0, 1.0); gl_Position = uSting > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0); }`,
    fragmentShader: /* glsl */ `precision highp float; in float vGain; out vec4 frag; uniform float uFade; void main() { frag = vec4(vec3(1.0, 0.66, 0.25) * 0.5 * vGain * uFade, 1.0); }`,
  }));

  const g = new THREE.Group();
  g.add(grains, parts, sting, cilia, pellicle);
  g.traverse((q) => { q.frustumCulled = false; });
  g.matrixAutoUpdate = false;
  g.userData = { U, radius: SIZE.b, cilia: roots.length, triangles: (pb.idx.length + B.idx.length) / 3, clock: null, vacPeriod: uni(5, 7), seed };
  return g;
}

// --------------------------------------------------------------- behaviour
// A cell's life is a list of jumps: { t, to, dur }. Between jumps it hangs about the
// spot it landed on, turning slowly about its own axis. The list is worked out once,
// for the whole loop, and ends where it began, so the loop has no seam.
const X = new THREE.Vector3(1, 0, 0);
function finish(jumps, seed, period) {
  const r = mulberry(seed * 31 + 5), q = new THREE.Quaternion();
  jumps.sort((a, b) => a.t - b.t);
  jumps.forEach((j, i) => {
    const from = jumps[(i - 1 + jumps.length) % jumps.length].to, d = sub(j.to, from), dist = len(d);
    j.dur = j.dur ?? 0.07 + dist / V_JUMP;
    // it lands back end first, wherever it was heading before
    j.q = new THREE.Quaternion().setFromUnitVectors(X, new THREE.Vector3(...(dist > 1e-6 ? unit(d).map((x) => -x) : [1, 0, 0]))).multiply(q.setFromAxisAngle(X, TAU * r()));
    j.spin = (r() < 0.5 ? -1 : 1) * (0.9 + 1.4 * r());       // radians a second about its own axis
    j.ph = [TAU * r(), TAU * r(), TAU * r(), TAU * r(), TAU * r()];
  });
  return { jumps, period };
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler();
function rest(j, tau, P, Q) {                           // tau: time since it landed
  const k = sstep(tau / 1.2), w = 3.2 * k;
  P.set(j.to[0] + w * Math.sin(0.83 * tau + j.ph[0]), j.to[1] + w * Math.sin(0.61 * tau + j.ph[1]), j.to[2] + 0.7 * w * Math.sin(0.47 * tau + j.ph[2]));
  ea.set(0, 0.35 * k * Math.sin(0.37 * tau + j.ph[3]), 0.35 * k * Math.sin(0.29 * tau + j.ph[4]));
  Q.copy(j.q).premultiply(qa.setFromEuler(ea)).multiply(qa.setFromAxisAngle(X, j.spin * tau));
}
const P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion();
function poseAt(plan, t, P, Q) {                        // returns how hard the bristles are striking, 0 to 1
  const { jumps, period } = plan, n = jumps.length;
  let i = -1;
  for (let k = 0; k < n; k++) if (jumps[k].t <= t) i = k;
  let tt = t;
  if (i < 0) { i = n - 1; tt = t + period; }
  const j = jumps[i], tau = tt - j.t;
  if (tau >= j.dur) { rest(j, tau - j.dur, P, Q); return 0; }
  const prev = jumps[(i - 1 + n) % n], u = tau / j.dur;
  rest(prev, j.t - prev.t - prev.dur + (i === 0 ? period : 0), P0, Q0);
  const e = 1 - (1 - u) ** 3;                           // off at full speed, slowing as the water takes it
  P.set(P0.x + (j.to[0] - P0.x) * e, P0.y + (j.to[1] - P0.y) * e, P0.z + (j.to[2] - P0.z) * e);
  Q.copy(Q0).slerp(j.q, sstep(u / 0.3));
  return Math.sin(Math.PI * Math.min(1, u / 0.55));
}

// The bystanders decide for themselves. world(t) gives everything that moves, as balls
// [x, y, z, r, ...]; still(p, r) says whether a ball at p is clear of the debris. A cell jumps when
// something is about to come within reach, to whichever of the spots round its home
// will stay clear the longest, and now and then for no reason at all.
function planJumps(spec, period, env) {
  const r = mulberry(spec.seed * 7 + 1), uni = (a, b) => a + (b - a) * r();
  const R = SIZE.b, DT = 0.08, NS = Math.round(period / DT);
  const spots = [spec.home];
  for (let tries = 0; spots.length < 12 && tries < 600; tries++) {
    const z = uni(-0.6, 0.6), a = uni(0, TAU), d = uni(45, 115), q = Math.sqrt(1 - z * z);
    const p = add(spec.home, [q * Math.cos(a) * d, q * Math.sin(a) * d, z * d * 0.7]);
    if (env.still(p, R + 14) && spots.every((s) => len(sub(s, p)) > 35)) spots.push(p);
  }
  // how much room there is round each spot at each moment
  const room = spots.map(() => new Float32Array(NS));
  const worlds = [];
  const roomAt = (p, balls) => { let m = 1e9; for (let b = 0; b < balls.length; b += 4) m = Math.min(m, Math.hypot(p[0] - balls[b], p[1] - balls[b + 1], p[2] - balls[b + 2]) - balls[b + 3]); return m - R; };
  for (let i = 0; i < NS; i++) {
    const balls = worlds[i] = Float32Array.from(env.world(i * DT));
    spots.forEach((s, k) => { room[k][i] = roomAt(s, balls); });
  }
  // a jump must not go through anything on its way, still or moving
  const open = (a, b, i) => { if (!env.path(a, b, R)) return false; for (let k = 1; k < 7; k++) if (roomAt(a.map((v, q) => v + (b[q] - v) * (k / 7)), worlds[i]) < 5) return false; return true; };
  const ahead = (k, i, n) => { let m = 1e9; for (let q = 0; q < n; q++) m = Math.min(m, room[k][(i + q) % NS]); return m; };
  // home is the spot that is quietest while the loop comes round (the given one, if it will do)
  {
    const span = Math.round(3.5 / DT), quiet = (k) => ahead(k, NS - span, 2 * span);
    let k = 0;
    if (quiet(0) < 30) for (let q = 1; q < spots.length; q++) if (quiet(q) > quiet(k)) k = q;
    [spots[0], spots[k]] = [spots[k], spots[0]]; [room[0], room[k]] = [room[k], room[0]];
  }
  const NEAR = 30, jumps = [], notes = [];
  let cur = 0, idle = uni(3, 8), last = -1;
  const END = period - 2.2;
  for (let i = 0; i < NS; i++) {
    const t = i * DT;
    if (t < last + 0.6) continue;                        // still landing
    const scared = t < END && ahead(cur, i, 3) < NEAR, bored = t > idle && t < END - 4;
    const home = t >= END && cur !== 0;
    if (!(scared || bored || home)) continue;
    let best = -1, bestRoom = -1e9;
    const pick = [];
    spots.forEach((s, k) => {
      if (k === cur) return;
      const d = len(sub(s, spots[cur])), rm = ahead(k, i, Math.round(4 / DT));
      if (d > 190 || !open(spots[cur], s, i)) return;
      if (rm > bestRoom) { bestRoom = rm; best = k; }
      if (rm > NEAR + 12) pick.push(k);
    });
    let to = home ? 0 : pick.length ? pick[Math.floor(r() * pick.length)] : best;
    if (t >= END - 4 && !home && pick.includes(0)) to = 0;        // late in the loop, head for home if it is safe there
    if (to < 0) continue;
    if (scared && !home && bestRoom < ahead(cur, i, Math.round(4 / DT))) continue;   // nowhere better: stay
    jumps.push({ t, to: spots[to] });
    notes.push(`${t.toFixed(1)} ${scared ? 'scared' : home ? 'home' : 'bored'} ${cur}>${to}`);
    cur = to; last = t; idle = t + uni(5, 11);
  }
  if (!jumps.length) jumps.push({ t: period * 0.5, to: spots[0], dur: 0.2 });
  const plan = finish(jumps, spec.seed, period);
  plan.notes = notes; plan.ends = cur; plan.spots = spots.length;
  return plan;
}

// meal: what main.js worked out about the catch (times in the loop, places in scene
// units): the prey waits at A, jumps to B at tJump as the head first comes for it, is
// caught at B at tCatch and is gone (inside, and turned into a food vacuole) by tGone.
// Its successor turns up at far at tBack and comes to A in a few jumps.
export function makeHalteria(common, period, meal, env) {
  const cells = [], plans = [];
  HOMES.forEach((spec) => { cells.push(makeCell(spec.seed, common)); plans.push(planJumps(spec, period, env)); });
  const victim = makeCell(23, common);
  {
    const f = meal.far, d = sub(meal.A, f), n = unit(cross(d, [0, 0, 1]));
    const via = (k, s) => add(add(f, d, k), n, s);
    const tb = meal.tBack;
    plans.push(finish([
      { t: meal.tJump, to: meal.B },
      { t: tb, to: f, dur: 0 },
      { t: tb + 2.2, to: via(0.36, 22) }, { t: tb + 5.0, to: via(0.70, -16) }, { t: tb + 7.4, to: meal.A },
    ], 23, period));
    cells.push(victim);
  }
  cells.forEach((g, i) => { g.userData.plan = plans[i]; g.userData.victim = g === victim; });
  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), m = new THREE.Matrix4(), bx = new THREE.Matrix4();
  const Bm = new THREE.Vector3(...meal.B);
  const Tv = new THREE.Vector3(), Nv = new THREE.Vector3(), Bv = new THREE.Vector3(), Qc = new THREE.Quaternion();
  // t: the time in the loop; clock: time that never wraps, for the cilia. held: null, or how
  // the Lacrymaria has the victim just now: { p, T, N, since, scale, fade }
  function update(t, clock, camera, held) {
    for (const g of cells) {
      const ud = g.userData, U = ud.U;
      let kick = poseAt(ud.plan, t, P, Q), scale = 1, fade = 1, limp = 0, fold = 0, sting = 0, cover = -1e3;
      g.visible = true;
      if (ud.victim) {
        if (held) {
          // the head has it by the back pole: it turns to line up with the neck and goes limp
          Tv.fromArray(held.T); Nv.fromArray(held.N); Bv.crossVectors(Tv, Nv);
          Qc.setFromRotationMatrix(bx.makeBasis(Tv, Nv, Bv));
          const grip = sstep(held.since / 1.4);
          if (held.since < 0.5) kick = Math.max(kick, Math.exp(-held.since / 0.12) * Math.abs(Math.sin(held.since * 55)));   // it tries to jump, and cannot
          Q.slerp(Qc, grip); P.fromArray(held.p);
          limp = sstep(held.since / 0.9); fold = held.fold; scale = held.scale; fade = held.fade;
          sting = sstep(held.since / 0.25) * (1 - fold); cover = held.cover / (UNIT * scale);
        } else if (t >= meal.tJump && t < meal.tCatch) P.lerp(Bm, 1 - sstep((meal.tCatch - t) / 1.5));   // it settles just where the head will find it
        else if (t >= meal.tCatch && t < meal.tBack) g.visible = false;
        else if (t >= meal.tBack) fade = sstep((t - meal.tBack) / 1.2);
      }
      m.compose(P, Q, S.setScalar(UNIT * scale));
      g.matrix.copy(m); g.matrixWorldNeedsUpdate = true;
      g.position.copy(P);
      const dt = ud.clock === null ? 0 : Math.max(0, Math.min(0.2, clock - ud.clock));
      ud.clock = clock;
      U.uPhase.value = (U.uPhase.value + TAU * 13 * (1 - limp) * dt) % (TAU * 1000);
      U.uKick.value = kick; U.uLimp.value = limp; U.uFold.value = fold; U.uFade.value = fade; U.uSting.value = sting; U.uCover.value = cover;
      U.uLod.value = 1 - sstep((camera.position.distanceTo(P) - LOD[0]) / (LOD[1] - LOD[0]));
      const x = (((clock / ud.vacPeriod) % 1) + 1) % 1;   // the vacuole fills slowly and empties at a stroke
      U.uPulse.value = (0.15 + 0.85 * Math.cbrt(x < 0.88 ? sstep(x / 0.88) : 1 - sstep((x - 0.88) / 0.12))) * (1 - limp * 0.5);
    }
  }
  return { cells, update, victim, poseAt, plans };
}
