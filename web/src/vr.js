// The scene from inside a headset (WebXR): no bloom and no slider; pointing, labels and
// the text are in vrui.js.
//
// The scene is in micrometres and its shaders expect an ordinary camera, so nothing in it
// is scaled. Instead the headset is treated as a giant's: its eyes are put in the scene
// S micrometres apart for each metre they really are apart, which sets how big everything
// feels. Moving about changes where the room sits in the scene (origin), which way it is
// turned (q: there is no up in the water, so any way will do) and S:
//   left stick: fly where the head looks; right stick: sideways turns in steps, forward
//     and back grows and shrinks the scene about a spot in front of the face
// The right hand points: its trigger picks the organism under the ray, which the room
// then rides along with (open water lets go); closed on the grip and moved left or right
// it sets the speed of the simulation.
// It starts with the page's view straight ahead, so the slide stands like a window.
//
// The eyes are drawn into a half-float buffer of our own, as on the page, and that is
// tone-mapped onto the headset's: drawn straight onto it, the see-through layers would be
// added up after tone mapping and wash out. The buffer's size is felt for (see tune): as
// big as the headset's own if the frame rate holds, smaller only where smaller is faster.
import * as THREE from 'three';
import { makeVRUI } from './vrui.js';

// S runs from the largest zoom to life size (a million micrometres to the metre), where
// the needle is a needle in the hand and the water a speck in its eye
const FAR = 30000, NEAR_M = 0.04, S_MIN = 10, S_MAX = 1e6;
const FLY = 0.3, ZOOM = 1.5, SNAP = Math.PI / 6;     // m/s, e-folds/s, radians
const SPEED = 2.5;                                   // of the simulation, for each metre the hand moves
const RIDE = 0.35, LEAP = 150;                       // seconds to catch up with what is followed; micrometres in a frame that count as a jump, not a swim

export function makeVR({ renderer, scene, animal, camera, controls, common, speed, button, report, onEnd, pick, select }) {
  const xr = renderer.xr;
  const nav = { origin: new THREE.Vector3(), q: new THREE.Quaternion(), S: 300, S0: 300, placed: false };
  const stats = { fps: 0, mean: 0, scale: 0.8, adapt: true, size: [0, 0], rate: 0, error: '', log: [] };
  let session = null, grab = null, armed = true, acc = 0, n = 0, total = 0, frames = 0, saved = null;
  const ui = makeVRUI({ nav, pick, select });
  // the hands, as last seen: where the right one points, where the left one is, and the trigger
  const hands = { ray: false, p: new THREE.Vector3(), q: new THREE.Quaternion(), left: false, lp: new THREE.Vector3(), trigger: false, click: false };
  const ride = { on: false, at: new THREE.Vector3(), lead: new THREE.Vector3() };

  const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const Q = nav.q, R = new THREE.Quaternion(), P = new THREE.Vector3(), d0 = new THREE.Vector3();
  const w = new THREE.Vector3(), v = new THREE.Vector3(), hp = new THREE.Vector3(), hq = new THREE.Quaternion(), gaze = new THREE.Vector3();
  // a spot in the room (metres) to the scene (micrometres)
  const toWorld = (p, out) => out.copy(p).applyQuaternion(Q).multiplyScalar(nav.S).add(nav.origin);
  // move the room so that its spot p lies on the scene's spot at
  const pin = (p, at) => { v.copy(p).applyQuaternion(Q).multiplyScalar(-nav.S).add(at); nav.origin.copy(v); };
  const dead = (a) => (Math.abs(a || 0) < 0.15 ? 0 : a);
  const clampS = (s) => Math.min(S_MAX, Math.max(S_MIN, s));

  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: target.texture }, uSize: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSize;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        gl_FragColor = vec4(texture2D(tDiffuse, gl_FragCoord.xy / uSize).rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (h(gl_FragCoord.xy) + h(gl_FragCoord.yx + 7.3) - 1.0) / 255.0;
      }`,
  }));
  quad.frustumCulled = false; quad.renderOrder = -100;
  // The water's picture goes onto the headset's buffer in the same pass as the ray, the
  // panel and the card, as the first thing drawn for each eye (it finds its place in the
  // picture from where it is on the buffer). As a pass of its own before theirs it cost the
  // headset a quarter of its frames: its chip had to fetch the whole buffer back to draw on.
  ui.scene.add(quad);
  const ports = [new THREE.Vector4(), new THREE.Vector4()];
  // On the page the organisms are a second scene drawn over the first. Here they go inside
  // it for the visit, in a group that is drawn after everything else, so that each frame
  // is one pass: a headset's chip pays dearly for coming back to a buffer it has left.
  const guests = new THREE.Group();
  guests.renderOrder = 1;

  // the page's view, straight ahead and level whichever way the head is tilted, from the
  // spot where it would be twice as big as on the page at an arm and a half (S0, which
  // still sets the pace of flying), but zoomed in as far as it goes: the same water,
  // seen by someone much smaller, so everything is huge and far off
  function place() {
    const t = controls.target, d = saved.position.distanceTo(t);
    nav.S0 = clampS(d / 3); nav.S = S_MIN;
    const level = d0.set(gaze.x, 0, gaze.z).normalize();
    Q.copy(saved.quaternion).multiply(R.setFromAxisAngle(Y, -Math.atan2(-level.x, -level.z)));
    P.copy(hp).addScaledVector(level, (1.5 * nav.S0) / nav.S); P.y -= (0.1 * nav.S0) / nav.S;
    pin(P, t);
    nav.placed = true;
  }

  function move(frame, ref, dt) {
    let held = null;
    hands.ray = hands.left = false;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const x = dead(gp.axes[2]), y = dead(gp.axes[3]);
      if (src.handedness !== 'right') {                // fly: forward is where the head looks. Zoomed in, the pace through the
                                                       // water stays what it was at the start, so it is faster past the face
        if (x || y) {
          v.set(1, 0, 0).applyQuaternion(hq).multiplyScalar(x).addScaledVector(gaze, -y);
          nav.origin.addScaledVector(v.applyQuaternion(Q), FLY * Math.max(nav.S, nav.S0) * dt);
        }
        const at = src.gripSpace && frame.getPose(src.gripSpace, ref);
        if (at) { hands.lp.copy(at.transform.position); hands.left = true; }
        continue;
      }
      if (Math.abs(x) > 0.6 && armed) { toWorld(hp, w); Q.multiply(R.setFromAxisAngle(Y, -Math.sign(x) * SNAP)); pin(hp, w); armed = false; }
      else if (Math.abs(x) < 0.3) armed = true;
      if (y && Math.abs(y) > Math.abs(x)) {             // forward: everything grows about a spot in front of the face
        P.copy(hp).addScaledVector(gaze, 0.8);
        toWorld(P, w); nav.S = clampS(nav.S * Math.exp(y * ZOOM * dt)); pin(P, w);
      }
      const aim = src.targetRaySpace && frame.getPose(src.targetRaySpace, ref), pulled = !!gp.buttons[0]?.pressed;
      if (aim) { hands.p.copy(aim.transform.position); hands.q.copy(aim.transform.orientation); hands.ray = true; }
      if (pulled && !hands.trigger) hands.click = true;
      hands.trigger = pulled;
      const pose = gp.buttons[1]?.pressed && src.gripSpace && frame.getPose(src.gripSpace, ref);
      if (pose) held = P.copy(pose.transform.position);
    }
    // the right hand, closed on the grip, is a slider in the air: to the right
    // the simulation runs faster, to the left slower, down to a stop
    if (held && !grab) grab = { from: held.clone(), right: new THREE.Vector3(-gaze.z, 0, gaze.x).normalize(), speed: speed.get() };
    else if (held) speed.set(grab.speed + v.copy(held).sub(grab.from).dot(grab.right) * SPEED);
    else grab = null;
    // riding along with the organism that was picked: the room goes where it goes, a little
    // behind, so that a lunge of its own is a glide here; a jump from one place to another
    // (the eaten Halteria's spot passing to the one that ate it) is not followed
    const sel = ui.selected();
    if (!sel) ride.on = false;
    else {
      sel.ride(w);
      if (!ride.on) { ride.at.copy(w); ride.lead.copy(w); ride.on = true; }
      v.copy(w).sub(ride.at); ride.at.copy(w);
      if (v.length() > LEAP) ride.lead.add(v);
      v.copy(w).sub(ride.lead).multiplyScalar(1 - Math.exp(-dt / RIDE));
      ride.lead.add(v); nav.origin.add(v);
    }
  }

  // before the scene is updated: where the head is now, so that what depends on the
  // camera's distance sees the right one
  function begin(frame, dt) {
    try {
      const ref = xr.getReferenceSpace(), pose = ref && frame && frame.getViewerPose(ref);
      if (!pose) return;
      hp.copy(pose.transform.position); hq.copy(pose.transform.orientation); gaze.set(0, 0, -1).applyQuaternion(hq);
      if (!nav.placed) place();
      move(frame, ref, dt);
      xr.updateCamera(camera);
      const xc = xr.getCamera(), near = NEAR_M * nav.S;
      for (const c of [xc, ...xc.cameras]) {           // the same pose, as a giant's: no scale in the matrix
        P.copy(c.position).applyQuaternion(Q).multiplyScalar(nav.S).add(nav.origin);
        c.matrixWorld.compose(P, R.copy(Q).multiply(c.quaternion), ONE);
        c.matrixWorldInverse.copy(c.matrixWorld).invert();
        const e = c.projectionMatrix.elements;         // the headset's own, with the scene's near and far
        const far = Math.max(FAR, 400 * nav.S);          // far enough to see the whole needle when it is small
        e[10] = -(far + near) / (far - near); e[14] = (-2 * far * near) / (far - near);
        c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
      }
      toWorld(hp, camera.position); camera.quaternion.copy(Q).multiply(hq);
      camera.updateMatrixWorld();
    } catch (e) { fail(e); }
  }

  function render(dt) {
    try {
      const out = renderer.getRenderTarget(), cams = xr.getCamera().cameras;
      if (!out || !cams.length) return;
      const q = stats.scale, W = Math.max(4, Math.round(out.width * q)), H = Math.max(4, Math.round(out.height * q));
      if (target.width !== W || target.height !== H) target.setSize(W, H);
      stats.size = [W, H];
      cams.forEach((c, i) => {
        if (!ports[i]) ports[i] = new THREE.Vector4();
        ports[i].copy(c.viewport);
        c.viewport.set(Math.round(c.viewport.x * q), Math.round(c.viewport.y * q), Math.round(c.viewport.z * q), Math.round(c.viewport.w * q));
      });
      common.uPx.value = (cams[0].projectionMatrix.elements[5] * cams[0].viewport.w) / 2;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      cams.forEach((c, i) => c.viewport.copy(ports[i]));
      // that picture, and over it the ray, the panel and the card at the headset's own sharpness
      ui.update({ dt, head: hp, gaze, ray: hands.ray ? hands : null, left: hands.left ? hands.lp : null, click: hands.click });
      hands.click = false;
      quad.material.uniforms.uSize.value.set(out.width, out.height);
      renderer.setRenderTarget(out);
      renderer.render(ui.scene, camera);
    } catch (e) { fail(e); }
    acc += dt; n++; total += dt; frames++;
    if (acc >= 1) {
      stats.fps = n / acc; stats.mean = frames / total;
      stats.rate = (session && session.frameRate) || 72;
      if (stats.adapt && total > 3) tune();
      stats.log.push([Math.round(total), +stats.scale.toFixed(2), Math.round(stats.fps)]);
      if (stats.log.length > 900) stats.log.shift();
      acc = 0; n = 0;
    }
  }

  // Once a second: is the buffer the right size? A smaller one is tried when frames come
  // short and kept only if it was faster (when the chip is busy with something else,
  // shrinking just blurs); a bigger one is tried when there is time to spare, or when
  // smaller did not help, and kept unless it was slower. Each try is judged on the second
  // full second after it, the first one holding the hitch of the new buffer.
  const feel = { floor: 0.4, ceil: 1, tried: null, wait: 0, calm: 0 };
  function tune() {
    const f = stats.fps, low = f < 0.9 * stats.rate, q = stats.scale;
    if (feel.wait > 0) { feel.wait--; return; }
    if (feel.tried) {
      const { scale, fps, dir } = feel.tried;
      feel.tried = null;
      if (dir < 0 && f < fps * 1.08) { feel.floor = scale; stats.scale = scale; feel.wait = 1; return; }
      if (dir > 0 && low && f < fps * 0.93) { feel.ceil = scale; stats.scale = scale; feel.wait = 1; return; }
    }
    const spare = !low && f > 0.97 * stats.rate, stuck = low && q <= feel.floor + 1e-3;
    feel.calm = spare || stuck ? feel.calm + 1 : 0;
    let to = q;
    if (low && !stuck) to = Math.max(feel.floor, q * 0.85);
    else if (feel.calm >= 3 && q < feel.ceil - 1e-3) to = Math.min(feel.ceil, q / 0.85);
    if (to !== q) { feel.tried = { scale: q, fps: f, dir: Math.sign(to - q) }; stats.scale = to; feel.wait = 1; feel.calm = 0; }
  }

  function fail(e) {
    stats.error = String((e && e.stack) || e).slice(0, 400);
    console.error(e);
    if (session) session.end().catch(() => {});
  }

  async function enter() {
    if (session) return;
    stats.error = '';
    try {
      const s = await navigator.xr.requestSession('immersive-vr');
      saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
      nav.placed = false; grab = null; acc = n = total = frames = 0; ride.on = false; hands.trigger = hands.click = false;
      stats.log = []; Object.assign(feel, { floor: 0.4, ceil: 1, tried: null, wait: 0, calm: 0 });
      controls.enabled = false;
      guests.add(animal); scene.add(guests);
      xr.enabled = true;
      xr.cameraAutoUpdate = false;
      xr.setReferenceSpaceType('local');
      await xr.setSession(s);
      session = s;
      // 72 pictures a second rather than 90: the time that leaves goes into a sharper picture
      if (s.updateTargetFrameRate && s.supportedFrameRates && Array.from(s.supportedFrameRates).includes(72)) s.updateTargetFrameRate(72).catch(() => {});
    } catch (e) { stats.error = String(e); xr.enabled = false; controls.enabled = true; scene.remove(guests); guests.remove(animal); report('VR did not start: ' + stats.error); }
  }
  xr.addEventListener('sessionend', () => {
    session = null;
    xr.enabled = false;
    scene.remove(guests); guests.remove(animal);
    controls.enabled = true;
    if (saved) { camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); }
    onEnd();
    report(stats.error ? 'VR stopped: ' + stats.error
      : `VR: ${stats.mean.toFixed(0)} fps on average, ${stats.fps.toFixed(0)} at the end (display ${stats.rate}), ${stats.size.join('×')} at scale ${stats.scale.toFixed(2)}`);
  });

  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { button.hidden = !ok; }).catch(() => {});
    button.onclick = enter;
  }
  return { begin, render, enter, nav, stats, ui, hands, select: ui.show, presenting: () => !!session && xr.isPresenting, end: () => session && session.end() };
}
