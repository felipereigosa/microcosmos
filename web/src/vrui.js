// What a headset shows besides the water: a ray from the right hand to point with, and,
// for the organism it has picked, a panel above it (name, a line about it, three figures
// and the list of its parts), a small ring on each of those parts, and the whole text on
// a card that stands over the left hand when that hand is raised into view. Pointing at
// a ring brings up that part's name and what to notice about it; the rings and the list
// on the panel share their colours, so the list says what there is to look for.
//
// A page of text hung in the water would pull the eyes off the organism, and small type
// is coarse in a headset, so what floats there is short, each piece at the depth of the
// thing it is about (nothing for the eyes to refocus on), and the reading is on the
// card, brought up like a watch. Everything is worked out in the room, in metres, and
// keeps the same size to the eye however far off it is; nothing here depends on which
// way the head is turned, only on where it is, so nothing swims as one looks about.
//
// It is all drawn by itself, after the water has been put on the headset's buffer (see
// vr.js): at the headset's full sharpness whatever size the water is drawn at, and in
// its own colours rather than tone-mapped ones.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';
const INK = '#f1fafb', SOFT = 'rgba(207, 233, 238, 0.88)', DIM = 'rgba(207, 233, 238, 0.58)', RULE = 'rgba(160, 220, 235, 0.24)';
const BACK = 'rgba(5, 16, 23, 0.84)';

const PX = (2.1 * DEG) / 64;                         // of a label's drawing, as the eye sees it: its type comes out 1.1 degrees high
const TAG_W = 25 * DEG, TAG_UP = 4.5 * DEG, TAG_MAX = 13 * DEG;   // the panel's width, and how far over its spot it stands: at least, at most
const GAP = 3.2 * DEG, REACH = 9 * DEG;              // a label stands this far out from its part, and up to this much more to clear the organism
const SHOW = [4 * DEG, 8 * DEG];                     // how wide the parts must spread in view for their rings to come in
const RING = 2.4 * DEG, AIM = 2.4 * DEG, HOLD = 1.5; // a ring's size; how near the ray must pass; seconds a label stays after the ray has left
const CARD_W = 0.42, CARD_UP = 0.06;                 // metres: the card's width, and how far over the hand it starts
const RAY = 2.5, RAY_R = 0.0013;                     // metres: the ray's length over open water, and its radius

function wrap(x, text, maxW) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && x.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function sheet(x, w, h, r) {                          // the dark rounded ground everything is written on
  x.beginPath();
  x.moveTo(r, 1); x.arcTo(w - 1, 1, w - 1, h - 1, r); x.arcTo(w - 1, h - 1, 1, h - 1, r); x.arcTo(1, h - 1, 1, 1, r); x.arcTo(1, 1, w - 1, 1, r);
  x.closePath();
  x.fillStyle = BACK; x.fill();
  x.lineWidth = 2; x.strokeStyle = RULE; x.stroke();
}
const spaced = (x, on) => { if ('letterSpacing' in x) x.letterSpacing = on ? '4px' : '0px'; };

// the panel: what it is, three figures, and its parts, each with the colour of its ring
function drawTag(info, parts) {
  const W = 800, P = 36, c = document.createElement('canvas'), x = c.getContext('2d');
  const lay = (on) => {
    const say = (s, px, py, font, fill) => { x.font = font; x.fillStyle = fill; if (on) x.fillText(s, px, py); };
    const para = (s, px, py, w, font, fill, lh) => { x.font = font; x.fillStyle = fill; for (const l of wrap(x, s, w)) { if (on) x.fillText(l, px, py); py += lh; } return py; };
    const rule = (py) => { if (on) { x.fillStyle = RULE; x.fillRect(P, py, W - 2 * P, 2); } };
    spaced(x, true); say(info.kind.toUpperCase(), P, 58, `600 23px ${SANS}`, info.accent); spaced(x, false);
    say(info.name, P, 126, `italic 500 62px ${SERIF}`, INK);
    let y = para(info.tag, P, 176, W - 2 * P, `400 33px ${SANS}`, SOFT, 44) - 16;
    rule(y);
    const sw = (W - 2 * P) / 3;
    let low = y;
    info.stats.forEach(([v, label], i) => {
      say(v, P + i * sw, y + 56, `600 38px ${SANS}`, info.accent);
      low = Math.max(low, para(label, P + i * sw, y + 90, sw - 24, `400 23px ${SANS}`, DIM, 29));
    });
    y = low - 4;
    if (parts.length) {
      rule(y);
      spaced(x, true); say('POINT AT A RING TO SEE', P, y + 44, `600 20px ${SANS}`, DIM); spaced(x, false);
      let px = P;
      y += 90;
      for (const { name, color } of parts) {             // the parts, flowing along and on to the next line
        x.font = `500 28px ${SANS}`;
        const w = x.measureText(name).width + 34;
        if (px + w > W - P) { px = P; y += 46; }
        if (on) { x.beginPath(); x.arc(px + 9, y - 10, 7, 0, 2 * Math.PI); x.lineWidth = 4; x.strokeStyle = color; x.shadowColor = color; x.shadowBlur = 8; x.stroke(); x.shadowBlur = 0; }
        say(name, px + 28, y, `500 28px ${SANS}`, INK);
        px += w + 26;
      }
      y += 12;
    } else y -= 20;
    return y + 22;
  };
  c.width = W; c.height = 8;
  c.height = Math.ceil(lay(false));
  sheet(x, c.width, c.height, 26);
  lay(true);
  return c;
}
// a part's label: its name, and under it what to notice
function drawLabel(name, color, what) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = `600 34px ${SANS}`;
  const head = x.measureText(name).width + 82;
  x.font = `400 27px ${SANS}`;
  const lines = what ? wrap(x, what, Math.max(430, head - 56)) : [];
  c.width = Math.ceil(Math.max(head, ...lines.map((l) => x.measureText(l).width + 56))); c.height = 64 + lines.length * 36 + (lines.length ? 10 : 0);
  sheet(x, c.width, c.height, 28);
  x.beginPath(); x.arc(31, 32, 9, 0, 2 * Math.PI); x.shadowColor = color; x.shadowBlur = 12; x.fillStyle = color; x.fill(); x.shadowBlur = 0;
  x.font = `600 34px ${SANS}`; x.fillStyle = INK; x.fillText(name, 54, 44);
  x.font = `400 27px ${SANS}`; x.fillStyle = SOFT;
  lines.forEach((l, i) => x.fillText(l, 28, 88 + i * 36));
  return c;
}
// the whole text, as on the page's panel, in two columns: what it is, and what to look for
function drawCard(info) {
  const W = 1400, P = 46, G = 52, CW = (W - 2 * P - G) / 2, c = document.createElement('canvas');
  const lay = (x, on) => {
    const say = (s, px, py, font, fill) => { x.font = font; x.fillStyle = fill; if (on) x.fillText(s, px, py); };
    const para = (s, px, py, w, font, fill, lh) => { x.font = font; x.fillStyle = fill; for (const l of wrap(x, s, w)) { if (on) x.fillText(l, px, py); py += lh; } return py; };
    const rule = (px, py, w) => { if (on) { x.fillStyle = RULE; x.fillRect(px, py, w, 2); } };
    let y = P + 24;
    spaced(x, true); say(info.kind.toUpperCase(), P, y, `600 23px ${SANS}`, info.accent); spaced(x, false);
    say(info.name, P, y + 70, `italic 500 60px ${SERIF}`, INK);
    y = para(info.tag, P, y + 120, CW, `400 30px ${SANS}`, SOFT, 41) - 12;
    rule(P, y, CW);
    const sw = CW / 3;
    let low = y;
    info.stats.forEach(([v, label], i) => {
      say(v, P + i * sw, y + 54, `600 35px ${SANS}`, info.accent);
      low = Math.max(low, para(label, P + i * sw, y + 84, sw - 22, `400 20px ${SANS}`, DIM, 25));
    });
    y = low; rule(P, y, CW); y += 50;
    for (const t of info.text) y = para(t, P, y, CW, `400 27px ${SANS}`, SOFT, 39) + 14;
    const left = y - 14 - 39;

    const X = P + CW + G;
    y = P + 24;
    spaced(x, true); say('LOOK CLOSER', X, y, `600 21px ${SANS}`, DIM); spaced(x, false);
    y += 54;
    for (const [col, name, what] of info.look) {
      if (on) { x.beginPath(); x.arc(X + 9, y - 10, 8, 0, 2 * Math.PI); x.shadowColor = col; x.shadowBlur = 10; x.fillStyle = col; x.fill(); x.shadowBlur = 0; }
      say(name, X + 32, y, `600 28px ${SANS}`, INK);
      y = para(what, X + 32, y + 36, CW - 32, `400 25px ${SANS}`, SOFT, 34) + 20;
    }
    rule(X, y - 22, CW);
    y = para(info.model, X, y + 16, CW, `400 20px ${SANS}`, DIM, 28);
    return Math.max(left, y - 28) + P;
  };
  const x = c.getContext('2d');
  c.width = W; c.height = Math.ceil(lay(x, false));
  sheet(x, c.width, c.height, 34);
  lay(x, true);
  return c;
}

export function makeVRUI({ nav, pick, select }) {
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;                // every piece is put where it goes by hand, in the scene's own micrometres
  const PLANE = new THREE.PlaneGeometry(1, 1);
  const piece = (order, opts = {}) => {
    const m = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, ...opts }));
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = order; m.visible = false; m.userData.aspect = 1;
    scene.add(m);
    return m;
  };
  const paint = (m, canvas) => {
    if (m.material.map) m.material.map.dispose();
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    m.material.map = t; m.material.needsUpdate = true; m.userData.aspect = canvas.width / canvas.height; m.userData.px = [canvas.width, canvas.height];
  };
  const disc = (() => {                                // a soft-edged spot, tinted by whoever uses it
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = c.height = 64;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#fff'); g.addColorStop(0.6, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const hoop = (() => {                                // a ring with a spot in the middle: something to point at
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = c.height = 96;
    x.fillStyle = 'rgba(0, 0, 0, 0.5)'; x.beginPath(); x.arc(48, 48, 40, 0, 2 * Math.PI); x.fill();   // a dark ground, to stand out on a bright organism
    x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 6; x.lineWidth = 11;
    x.beginPath(); x.arc(48, 48, 31, 0, 2 * Math.PI); x.stroke();
    x.beginPath(); x.arc(48, 48, 10, 0, 2 * Math.PI); x.fill();
    return new THREE.CanvasTexture(c);
  })();

  const tag = piece(3), tagLine = piece(1, { color: '#cfe9ee' }), tagDot = piece(2, { map: disc, color: '#cfe9ee' });
  const card = piece(5), hoverDot = piece(4, { map: disc, color: '#ffffff' });
  const slots = [];
  const slot = (i) => (slots[i] || (slots[i] = { plate: piece(3), line: piece(1), dot: piece(2, { map: hoop }), dir: new THREE.Vector2(), c: new THREE.Vector2(), p: new THREE.Vector3(), fresh: true, on: false, live: false, glow: 0, i }));
  // the ray: a thin rod from the hand, fading along its length
  const rayMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, uniforms: { uA: { value: 0.3 } },
    vertexShader: 'varying float vU; void main() { vU = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying float vU; void main() { gl_FragColor = vec4(0.72, 0.93, 1.0, uA * (1.0 - 0.75 * smoothstep(0.0, 1.0, vU)) * smoothstep(0.0, 0.02, vU)); }',
  });
  const ray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), rayMat);
  ray.matrixAutoUpdate = false; ray.frustumCulled = false; ray.renderOrder = 6; ray.visible = false;
  scene.add(ray);

  let sel = null, age = 0, hover = null, tick = 0, cardShown = 0, shown = 0, tagUp = 0, aimed = null, left = 0, clock = 0;
  const head = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), w = new THREE.Vector3();
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3(), M = new THREE.Matrix4();
  const q = new THREE.Quaternion(), qw = new THREE.Quaternion(), qi = new THREE.Quaternion(), sc = new THREE.Vector3();
  const O = new THREE.Vector3(), D = new THREE.Vector3();

  const toRoom = (p, out) => out.copy(p).sub(nav.origin).applyQuaternion(qi).multiplyScalar(1 / nav.S);
  // a piece at p in the room, turned by r there, sx by sy metres
  const put = (m, p, r, sx, sy) => {
    w.copy(p).applyQuaternion(nav.q).multiplyScalar(nav.S).add(nav.origin);
    m.matrixWorld.compose(w, qw.copy(nav.q).multiply(r), sc.set(sx * nav.S, sy * nav.S, nav.S));
    m.visible = true;
  };
  // upright and facing the head, from wherever it is
  const face = (p, out) => {
    ez.copy(head).sub(p).normalize(); ex.crossVectors(Y, ez);
    if (ex.lengthSq() < 1e-6) ex.set(1, 0, 0);
    ex.normalize(); ey.crossVectors(ez, ex);
    return out.setFromRotationMatrix(M.makeBasis(ex, ey, ez));
  };
  const billboard = (m, p, width) => put(m, p, face(p, q), width, width / m.userData.aspect);
  const stroke = (m, p0, p1, thick) => {               // a flat line from p0 to p1, its face to the head
    ex.copy(p1).sub(p0);
    const len = ex.length();
    if (len < 1e-6) { m.visible = false; return; }
    ex.multiplyScalar(1 / len); c.copy(p0).add(p1).multiplyScalar(0.5);
    ez.copy(head).sub(c).normalize(); ey.crossVectors(ez, ex).normalize(); ez.crossVectors(ex, ey);
    put(m, c, q.setFromRotationMatrix(M.makeBasis(ex, ey, ez)), len, thick);
  };
  // which way from the head: round to the right from straight ahead, and up
  const angles = (p) => { d.copy(p).sub(head); const l = d.length() || 1e-6; return [Math.atan2(d.x, -d.z), Math.asin(Math.max(-1, Math.min(1, d.y / l))), l]; };
  const along = (az, el, l, out) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(l).add(head);
  const turn = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));

  function show(s) {
    sel = s; age = 0; shown = 0; tagUp = 0; aimed = null;
    for (const k of slots) { k.on = k.live = false; k.fresh = true; k.glow = 0; }
    if (!s) return;
    paint(tag, drawTag(s.info, s.parts)); paint(card, drawCard(s.info));
    s.parts.forEach((p, i) => {
      const k = slot(i);
      paint(k.plate, drawLabel(p.name, p.color, p.what));
      k.dot.material.color.set(p.color); k.line.material.color.set(p.color);
      k.on = true; k.at = p.at;
    });
  }

  function labels(dt) {
    const fade = Math.min(1, age / 0.35);
    sel.anchor(w); toRoom(w, a);
    const [az0, el0, l0] = angles(a), ce = Math.max(0.25, Math.cos(el0));
    // where each part is, as angles from the picked spot, and how they lie about their middle
    const live = [];
    let mx = 0, my = 0, top = 0;
    for (const k of slots) {
      k.plate.visible = k.line.visible = k.dot.visible = k.live = false;
      if (!k.on || !k.at(w)) continue;
      toRoom(w, k.p);
      const [az, el, l] = angles(k.p);
      if (l < 0.08) continue;
      k.l = l; k.x = turn(az - az0) * ce; k.y = el - el0;
      mx += k.x; my += k.y; top = Math.max(top, k.y);
      live.push(k);
    }
    mx /= live.length || 1; my /= live.length || 1;
    let wide = 0;
    for (const k of live) wide = Math.max(wide, Math.hypot(k.x - mx, k.y - my));
    // from far off, where the parts cannot be told apart, the panel is enough: the rings
    // come in as the organism grows in view
    const near = Math.min(1, Math.max(0, (2 * wide - SHOW[0]) / (SHOW[1] - SHOW[0])));
    shown += (near - shown) * (1 - Math.exp(-dt / 0.25));

    // the panel: above the spot that was picked, clear of the parts if that is not far, on a line
    const up = Math.min(TAG_MAX, Math.max(TAG_UP, top + TAG_UP)), th = TAG_W / tag.userData.aspect;
    tagUp += (up - tagUp) * (tagUp ? 1 - Math.exp(-dt / 0.5) : 1);
    billboard(tag, along(az0, el0 + tagUp + th / 2, l0, b), TAG_W * l0);
    stroke(tagLine, a, along(az0, el0 + tagUp, l0, b), 0.1 * DEG * l0);
    billboard(tagDot, a, 0.9 * DEG * l0);
    tag.material.opacity = fade; tagLine.material.opacity = 0.6 * fade; tagDot.material.opacity = fade;

    for (const k of live) {
      // the ring on the part, breathing a little so that it reads as something to point at
      const o = fade * shown, want = k === aimed ? 1 : 0;
      k.glow += (want - k.glow) * (1 - Math.exp(-dt / 0.15));
      k.live = o > 0.3;
      if (o > 0.02) { billboard(k.dot, k.p, RING * k.l * (1 + 0.07 * Math.sin(2.6 * clock + 1.3 * k.i) + 0.35 * k.glow)); k.dot.material.opacity = o * (0.85 + 0.15 * k.glow); }
      // which way its label stands off: out from the middle, past the part and towards the
      // rim (as far as REACH: up close the rim is out of sight); kept turning slowly even
      // while it is not shown, so that it is right when it is
      const dx = k.x - mx, dy = k.y - my, r = Math.hypot(dx, dy), f = k.fresh ? 1 : 1 - Math.exp(-dt / 0.8);
      if (r > 1 * DEG) k.dir.lerp(d.set(dx / r, dy / r, 0), f); else if (k.fresh) k.dir.set(0.8, -0.6);
      if (k.dir.lengthSq() < 1e-4) k.dir.set(0.8, -0.6);
      k.dir.normalize();
      k.fresh = false;
      if (k.glow < 0.02) continue;
      // the label of the one that is pointed at; if it would lie over the panel it goes under it
      const hw = (k.plate.userData.px[0] * PX) / 2, hh = (k.plate.userData.px[1] * PX) / 2, kx = Math.max(-1, Math.min(1, 3 * k.dir.x));
      const out = GAP + Math.min(REACH, Math.max(0, 0.85 * wide - r));
      let cx = k.x + k.dir.x * out + kx * hw, cy = k.y + k.dir.y * (out + hh);
      if (Math.abs(cx) < hw + TAG_W / 2 && cy + hh > tagUp - 0.4 * DEG && cy - hh < tagUp + th) cy = tagUp - 0.4 * DEG - hh;
      billboard(k.plate, along(az0 + cx / ce, el0 + cy, k.l, b), 2 * hw * k.l);
      stroke(k.line, k.p, along(az0 + (cx - kx * hw) / ce, el0 + cy - k.dir.y * hh, k.l, b), 0.09 * DEG * k.l);
      k.plate.material.opacity = o * k.glow; k.line.material.opacity = 0.75 * o * k.glow;
    }
  }

  // once a frame, after the scene has moved on. u: { dt, head, gaze, ray: { p, q } or null,
  // left: where the left hand is or null, click: the trigger has just been pulled }
  function update(u) {
    head.copy(u.head); qi.copy(nav.q).invert();
    age += u.dt; clock += u.dt; tick++;
    ray.visible = hoverDot.visible = false;
    if (u.ray) {
      D.set(0, 0, -1).applyQuaternion(u.ray.q);
      // a ring of the picked organism that the ray passes close by (as last placed): the nearest to the ray wins
      let on = null, best = AIM, reach = 0;
      for (const k of slots) {
        if (!k.live) continue;
        const t = d.copy(k.p).sub(u.ray.p).dot(D);
        if (t <= 0) continue;
        const off = Math.sqrt(Math.max(0, d.lengthSq() - t * t)) / t;
        if (off < best) { best = off; on = k; reach = t; }
      }
      if (on) { aimed = on; left = 0; } else if (aimed && (left += u.dt) > HOLD) aimed = null;
      if (u.click || tick % 2 === 0) {                   // what the ray is on: looked up every other frame, and at a click
        O.copy(u.ray.p).applyQuaternion(nav.q).multiplyScalar(nav.S).add(nav.origin);
        hover = pick(O, d.copy(D).applyQuaternion(nav.q));
      }
      if (u.click && !on) select(hover);                 // open water lets go, as on the page; on a ring it changes nothing
      const len = on ? reach : hover ? hover.t / nav.S : RAY;
      w.copy(u.ray.p).applyQuaternion(nav.q).multiplyScalar(nav.S).add(nav.origin);
      ray.matrixWorld.compose(w, qw.copy(nav.q).multiply(u.ray.q), sc.set(RAY_R * nav.S, RAY_R * nav.S, len * nav.S));
      ray.visible = true; rayMat.uniforms.uA.value = on || hover ? 0.75 : 0.28;
      if (hover && !on) { a.copy(u.ray.p).addScaledVector(D, len); billboard(hoverDot, a, 1.1 * DEG * a.distanceTo(head)); }
    } else { hover = null; if (aimed && (left += u.dt) > HOLD) aimed = null; }

    tag.visible = tagLine.visible = tagDot.visible = card.visible = false;
    if (!sel) { for (const k of slots) k.plate.visible = k.line.visible = k.dot.visible = k.live = false; cardShown = 0; aimed = null; return; }
    labels(u.dt);
    // the card: over the left hand, there when the hand is held up where the eyes are looking
    let want = 0;
    if (u.left) {
      d.copy(u.left).sub(head);
      const l = d.length(), cos = d.dot(u.gaze) / (l || 1);
      want = l < 0.85 && cos > Math.cos(38 * DEG) ? 1 : 0;
      cardShown += (want - cardShown) * (1 - Math.exp(-u.dt / 0.12));
      if (cardShown > 0.02) {
        const h = CARD_W / card.userData.aspect;
        billboard(card, a.copy(u.left).addScaledVector(Y, CARD_UP + h / 2), CARD_W);
        card.material.opacity = cardShown;
      }
    } else cardShown = 0;
  }

  return { scene, update, show, selected: () => sel, hovering: () => hover, aimed: () => aimed, slots, pieces: { tag, card, ray } };
}
