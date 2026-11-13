// The microscope's shallow focus. Nothing in the scene writes depth (it is all
// see-through and added up), so the blur cannot be worked out from a depth buffer
// afterwards. Instead every shader sorts what it draws by how blurred it is to be:
// the sharp part goes to the screen in the ordinary way, and the rest is drawn once
// more into five layers, for blurs of 3, 6, 12, 24 and 48 pixels across, a thing in
// between being shared by the two layers next to it. Each layer is then spread into
// discs of its own size and added to the picture. Everything is added up on the
// screen anyway, so the parts just sum to the whole. Nothing here changes from frame
// to frame, so what is out of focus keeps still.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const BANDS = 5, R0 = 3;                               // the layers, and the blur of the first in pixels

// uLens: x which part to draw (0 all, 1 the sharp part, 2 the layers), y the distance of
// the plane in focus, z the radius in pixels of the blur of a thing at depth d, times
// |1/y - 1/d|. Every material under root gets it, and the sorting at the end of its shader.
function atEndOfMain(src, code) {
  let i = src.indexOf('{', src.indexOf('void main')), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(0, i) + code + src.slice(i);
  }
  throw new Error('lens: no main() found');
}
export function fitLens(root, uLens) {
  root.traverse((o) => {
    const m = o.material;
    if (!m || !m.isShaderMaterial || m.uniforms.uLens) return;
    m.uniforms.uLens = uLens;
    m.vertexShader = 'uniform vec3 uLens; out float vLensC;\n' + atEndOfMain(m.vertexShader, ' vLensC = uLens.z * abs(1.0 / uLens.y - 1.0 / gl_Position.w); ');
    // a solid material (the granules) cannot be shared out, so it is drawn over what is there
    // with its share as its cover, and first, as it was when solid
    const solid = !m.transparent;
    if (solid) {
      Object.assign(m, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      o.renderOrder = -1000;
    }
    // added-up materials are weighted by their colour alone, the others carry their cover in alpha
    const part = (w) => (m.blending === THREE.AdditiveBlending ? `vec4(f.rgb * ${w}, f.a)` : `f * ${w}`);
    let outs = 'layout(location = 0) out highp vec4 frag;';
    for (let k = 1; k < BANDS; k++) outs += ` layout(location = ${k}) out highp vec4 frag${k};`;
    const src = m.fragmentShader.replace(/\bout\s+(highp\s+)?vec4\s+frag\s*;/, outs);
    if (src === m.fragmentShader) throw new Error('lens: a shader does not write to "frag"');
    let layers = `frag = ${part('max(0.0, 1.0 - abs(t))')};`, none = '';
    for (let k = 1; k < BANDS; k++) { layers += ` frag${k} = ${part(`max(0.0, 1.0 - abs(t - ${k}.0))`)};`; none += ` frag${k} = vec4(0.0);`; }
    m.fragmentShader = 'uniform highp vec3 uLens; in highp float vLensC;\n' + atEndOfMain(src, ` {
      if (!(frag.r >= 0.0 && frag.g >= 0.0 && frag.b >= 0.0 && frag.r + frag.g + frag.b < 1e4)) frag = vec4(0.0);   // not a number: it would spread
      vec4 f = frag;
      float t = vLensC < ${R0}.0 ? vLensC / ${R0}.0 - 1.0 : min(log2(vLensC / ${R0}.0), ${BANDS - 1}.0);
      if (uLens.x > 1.5) { ${solid ? 'if (t <= -1.0) discard;' : ''} ${layers} }
      else { float w = uLens.x < 0.5 ? 1.0 : max(0.0, -t); ${solid ? 'if (w <= 0.0) discard;' : ''} frag = ${part('w')};${none} }
    } `);
    m.needsUpdate = true;
  });
}

const VERT = 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const quad = (o) => new FullScreenQuad(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, depthTest: false, depthWrite: false, ...o }));
const ADD = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true };

// Draws the layers of the scene, spreads each and adds them to what is in the buffer.
// Layer k is read from a copy 2^k times smaller (the mipmaps) and, beyond the first, spread
// at that size too, so every layer costs the same few samples however wide its blur.
export class LensPass extends Pass {
  constructor(scene, camera, uLens) {
    super();
    this.scene = scene; this.camera = camera; this.uLens = uLens;
    this.needsSwap = false;
    this.bands = new THREE.WebGLRenderTarget(4, 4, { count: BANDS, type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.small = [];
    for (let k = 1; k < BANDS; k++) this.small.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    const disc = {
      uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uLod: { value: 0 } },
      fragmentShader: `precision highp float; uniform sampler2D tDiffuse; uniform vec2 uStep; uniform float uLod; in vec2 vUv; out vec4 frag;
        void main() {
          vec3 c = vec3(0.0);
          for (int i = 0; i < 16; i++) { float a = 2.39996 * float(i), r = sqrt((float(i) + 0.5) / 16.0); c += textureLod(tDiffuse, vUv + uStep * r * vec2(cos(a), sin(a)), uLod).rgb; }
          frag = vec4(c / 16.0, 1.0);
        }`,
    };
    this.spread = quad(disc);
    this.spreadAdd = quad({ ...disc, ...ADD });
    this.sumUp = quad({
      ...ADD, uniforms: { t1: { value: null }, t2: { value: null }, t3: { value: null }, t4: { value: null } },
      fragmentShader: `precision highp float; uniform sampler2D t1, t2, t3, t4; in vec2 vUv; out vec4 frag;
        void main() { frag = vec4(texture(t1, vUv).rgb + texture(t2, vUv).rgb + texture(t3, vUv).rgb + texture(t4, vUv).rgb, 1.0); }`,
    });
  }
  setSize(w, h) {
    this.bands.setSize(w, h);
    this.small.forEach((t, i) => t.setSize(Math.max(1, Math.ceil(w / (2 << i))), Math.max(1, Math.ceil(h / (2 << i)))));
  }
  render(renderer, writeBuffer, readBuffer) {
    const auto = renderer.autoClear, bg = this.scene.background, W = this.bands.width, H = this.bands.height;
    this.scene.background = null;                       // the sharp part has laid the background down already
    this.uLens.value.x = 2;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.bands);
    renderer.render(this.scene, this.camera);
    this.scene.background = bg;
    this.uLens.value.x = 1;
    renderer.autoClear = false;
    for (let k = 0; k < BANDS; k++) {
      const u = (k ? this.spread : this.spreadAdd).material.uniforms, r = R0 * (1 << k);
      u.tDiffuse.value = this.bands.textures[k]; u.uStep.value.set(r / W, r / H); u.uLod.value = k;
      renderer.setRenderTarget(k ? this.small[k - 1] : readBuffer);
      (k ? this.spread : this.spreadAdd).render(renderer);
    }
    const u = this.sumUp.material.uniforms;
    this.small.forEach((t, i) => { u['t' + (i + 1)].value = t.texture; });
    renderer.setRenderTarget(readBuffer);
    this.sumUp.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.bands.dispose(); this.small.forEach((t) => t.dispose()); this.spread.dispose(); this.spreadAdd.dispose(); this.sumUp.dispose(); }
}
