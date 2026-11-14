// The soundtrack: one long quiet piece, looping, faded in at the first click, tap or key
// (a browser will not play anything before that; see begin) and switched by a small button that
// remembers its setting. An <audio> element rather than Web Audio, so that it also plays
// when the page is opened straight from disk. The file is web/music.mp3, beside the page;
// if it is not there the button is not shown.
//   "Dreams Become Real" by Kevin MacLeod (incompetech.com), CC BY 4.0,
//   https://creativecommons.org/licenses/by/4.0/ (trimmed and made a little louder)
const LEVEL = 0.55, FADE = 2.5;                      // how loud, of the file's own level; seconds to fade in or out

export function makeSound(button, src, busy = () => false) {
  const audio = new Audio();
  audio.loop = true; audio.preload = 'none'; audio.volume = 0; audio.src = src;
  let on = true, begun = false, timer = 0;
  try { on = localStorage.getItem('microcosm.sound') !== 'off'; } catch (e) { /* no storage from disk in some browsers */ }
  const show = () => { button.classList.toggle('off', !on); button.setAttribute('aria-pressed', String(on)); };
  function fade() {                                  // towards LEVEL or nothing, then stop the file if it is nothing
    clearInterval(timer);
    const to = on && !document.hidden ? LEVEL : 0;
    if (to) audio.play().catch(() => {});
    timer = setInterval(() => {
      const gap = to - audio.volume, step = (LEVEL * 0.05) / FADE, there = Math.abs(gap) <= step;
      audio.volume = there ? to : audio.volume + Math.sign(gap) * step;
      if (there) { clearInterval(timer); if (!to) audio.pause(); }
    }, 50);
  }
  // It starts at the first thing the browser counts as a gesture, and which events those
  // are differs: a mouse button going down is one, a finger or a headset's pointer going
  // down is not (only its coming up is). So every kind is listened for, a refusal is
  // ignored, and the next one tries again until it is playing.
  function begin() {
    if (begun || !on) return;
    audio.play().then(() => { if (!begun) { begun = true; fade(); } }, () => {});
  }
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, begin, true);
  button.addEventListener('click', () => {
    on = !on; begun = true;                            // from here on the button is in charge
    try { localStorage.setItem('microcosm.sound', on ? 'on' : 'off'); } catch (e) { /* as above */ }
    show(); fade();
  });
  // not from a tab that has been put away, unless it is a headset that is being looked through
  document.addEventListener('visibilitychange', () => { if (begun && !busy()) fade(); });
  audio.addEventListener('error', () => { button.hidden = true; });
  button.hidden = false;
  show();
  return { audio, begin, playing: () => !audio.paused, on: () => on };
}
