// A sewing needle, for scale. The water of the scene is a box 840 by 640 by 320 um, and
// the far long side of that box (the one the page's view looks towards) lies in the eye
// of the needle: from behind the needle the whole scene is seen through its eye, and
// from far enough off the whole needle is seen, with the scene a speck at one end of it.
//
// It is an ordinary needle of the larger kind (a darner or a crewel needle): 45 mm long,
// 0.9 mm thick, with an eye about 1 mm long and 0.4 mm wide in a head that is flattened
// and a little wider than the shaft. Made of two pieces that run into each other: the
// head, a bar bent round the eye, and the shaft, which starts inside the head's far end
// and tapers over its last 9 mm to a point 24 um across.
//
// It is polished steel in a dark room: it shows by what it reflects (one long light
// overhead, a smaller one to the side, a faint horizon) and is otherwise nearly black, and
// it is kept dimmer still while the view is among the organisms, so that there it is a
// shape in the shadows behind them. It is opaque, and the only thing in the scene that
// hides what is behind it.
import * as THREE from 'three';

export const BOX = [420, 320, 160];                  // half the water's size: where the motes are scattered (see makeMotes)
const EYE = { hl: 520, hw: 190 };                    // half the eye's length and width: its rounded ends just clear the box's corners
const BAR = 330, DEEP = 460, R = 450;                // the bar round the eye, across and through; the shaft's radius
const LENGTH = 45000, TAPER = 9000, TIP = 12;        // um
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// rings of n points each, joined into one smooth skin
function skin(rings, closed) {
  const m = rings.length, n = rings[0].length, pos = new Float32Array(m * n * 3), idx = [];
  rings.forEach((ring, i) => ring.forEach((p, j) => pos.set(p, (i * n + j) * 3)));
  for (let i = 0; i < (closed ? m : m - 1); i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = ((i + 1) % m) * n + j, d = ((i + 1) % m) * n + ((j + 1) % n);
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}

export function makeNeedle() {
  // in its own frame: x along the needle from the middle of the eye towards the point,
  // y through the eye, z across it
  // the head: a bar with a rounded-off oblong section, carried round the eye
  const rc = EYE.hw + BAR / 2, half = EYE.hl - EYE.hw, path = [];
  for (let i = 0; i < 36; i++) path.push([-half + (2 * half * i) / 36, rc, 1, 0]);                 // [x, z, tangent]
  for (let i = 0; i < 44; i++) { const a = Math.PI / 2 - (Math.PI * i) / 44; path.push([half + rc * Math.cos(a), rc * Math.sin(a), Math.sin(a), -Math.cos(a)]); }
  for (let i = 0; i < 36; i++) path.push([half - (2 * half * i) / 36, -rc, -1, 0]);
  for (let i = 0; i < 44; i++) { const a = -Math.PI / 2 - (Math.PI * i) / 44; path.push([-half + rc * Math.cos(a), rc * Math.sin(a), Math.sin(a), -Math.cos(a)]); }
  const NS = 36;
  const head = skin(path.map(([x, z, tx, tz]) => Array.from({ length: NS }, (_, j) => {
    const f = (j / NS) * 2 * Math.PI, out = (BAR / 2) * spow(Math.cos(f), 0.6), y = (DEEP / 2) * spow(Math.sin(f), 0.6);
    return [x + tz * out, y, z - tx * out];              // out is away from the eye: the tangent turned a quarter
  })), true);

  // the shaft: oval where it leaves the head, round from 3 mm on, and tapering to the point
  // (it starts just past the end of the eye, as wide there as the head is, so the two outlines meet)
  const x0 = EYE.hl + 20, w0 = Math.sqrt((rc + BAR / 2) ** 2 - (x0 - half) ** 2), x1 = half + LENGTH - EYE.hl - 520, st = [];
  for (let i = 0; i <= 40; i++) st.push(x0 + (3000 * i) / 40);
  for (let i = 1; i <= 24; i++) st.push(x0 + 3000 + ((x1 - TAPER - x0 - 3000) * i) / 24);
  for (let i = 1; i <= 90; i++) st.push(x1 - TAPER + TAPER * (1 - (1 - i / 90) ** 1.6));           // closer together towards the point
  const NA = 48, rings = st.map((x) => {
    const u = Math.max(0, (x - (x1 - TAPER)) / TAPER), r = Math.max(TIP, R * (1 - u) ** 0.9), k = Math.min(1, (x - x0) / 3000), e = k * k * (3 - 2 * k);
    const ry = (DEEP / 2) * (1 - e) + R * e, rz = w0 * (1 - e) + R * e;
    return Array.from({ length: NA }, (_, j) => { const f = (j / NA) * 2 * Math.PI; return [x, (ry * r / R) * Math.cos(f), (rz * r / R) * Math.sin(f)]; });
  });
  for (let i = 1; i <= 6; i++) {                        // the point itself: rounded off
    const a = (i / 6) * (Math.PI / 2), r = Math.max(0.01, TIP * Math.cos(a));
    rings.push(Array.from({ length: NA }, (_, j) => { const f = (j / NA) * 2 * Math.PI; return [x1 + TIP * Math.sin(a), r * Math.cos(f), r * Math.sin(f)]; }));
  }
  const shaft = skin(rings, false);

  const g = new THREE.BufferGeometry(), pos = new Float32Array(head.pos.length + shaft.pos.length);
  pos.set(head.pos); pos.set(shaft.pos, head.pos.length);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([...head.idx, ...shaft.idx.map((i) => i + head.pos.length / 3)]);
  g.computeVertexNormals();

  const U = { uGain: { value: 0.3 } };
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U,
    vertexShader: /* glsl */ `
      out vec3 vN; out vec3 vW; out vec3 vP;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vP = position; vN = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      in vec3 vN; in vec3 vW; in vec3 vP; out vec4 frag;
      uniform float uGain;
      float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      float streaks(float x) { float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main() {
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        // the marks of the grinding wheel run round the needle: the polish scatters along it
        float mark = streaks(vP.x * 0.21) * 0.6 + streaks(vP.x * 0.043 + 7.0) * 0.4 - 0.5;
        N = normalize(N + vec3(0.06 * mark, 0.0, 0.0));
        vec3 Rf = reflect(-V, N);
        float over = smoothstep(0.35, 0.9, Rf.z) * (0.75 + 0.25 * smoothstep(-0.2, 0.6, Rf.x));     // a long light overhead
        float side = smoothstep(0.82, 0.97, dot(Rf, normalize(vec3(-0.45, -0.8, 0.25))));           // a window to one side
        float line = exp(-abs(Rf.z + 0.05) * 9.0);                                                  // the horizon of the room
        float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 steel = vec3(0.74, 0.80, 0.88);
        vec3 c = steel * (0.006 + 0.30 * over + 0.42 * side + 0.035 * line + 0.05 * rim) * (1.0 + 0.25 * mark);
        frag = vec4(c * uGain, 1.0);
      }`,
  }));
  // onto the far long side of the water: the eye's own middle plane half the head's depth beyond it
  mesh.position.set(0, BOX[1] + DEEP / 2, 0);
  mesh.updateMatrixWorld();
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  // dim among the organisms, itself from further off
  const C = new THREE.Vector3(0, 0, 0);
  const update = (camera) => { const d = camera.position.distanceTo(C), k = Math.min(1, Math.max(0, (d - 900) / 4500)); U.uGain.value = 0.07 + 0.58 * k * k * (3 - 2 * k); };
  return { mesh, update, size: { length: LENGTH, eye: [2 * EYE.hl, 2 * EYE.hw], thick: 2 * R }, tip: new THREE.Vector3(x1 + TIP, BOX[1] + DEEP / 2, 0) };
}
