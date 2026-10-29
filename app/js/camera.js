// Two full screens: the in-app camera and the develop screen.
import { h } from './ui.js';
import { db } from './db.js';
import { sound } from './audio.js';
import { tried } from './tried.js';
import { EFFECTS, develop, newSeed, rememberLook, disposableLook, originalLook, isPlain } from './look.js';

// The live camera needs the installed app. The test copy's page is not allowed to open it.
export function canLiveCamera() {
  return !window.KEEPSAKE_ARTIFACT && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// The film: like a disposable, you wind it before each shot. It remembers the last frame,
// so a shot taken without winding lands on top of it.
const ROLL = 27;
function film() {
  try { return { wound: true, left: ROLL, ...JSON.parse(localStorage.getItem('keepsake.film') || '{}') }; } catch (e) { return { wound: true, left: ROLL }; }
}
function saveFilm(f) { try { localStorage.setItem('keepsake.film', JSON.stringify(f)); } catch (e) { /* ignore */ } }
function loadImg(blob) {
  return new Promise(res => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
}

// Resolves { blob, flash } after a shot, null if closed, or { error } if the camera could not start.
// `aspect` is the photo window's width / height. The viewfinder has exactly that shape,
// and the shot keeps exactly what the viewfinder shows, so the photo fills its frame as seen.
export function openCamera({ prompt, aspect = 3 / 4 }) {
  return new Promise(async resolve => {
    let facing = 'environment', flash = true, stream = null, done = false;
    const video = h('video', { class: 'cam-video', playsinline: '', muted: '', autoplay: '' });
    video.muted = true;
    const flashBtn = h('button', { class: 'cam-btn', 'aria-label': 'Flash', onclick: () => { flash = !flash; flashBtn.classList.toggle('off', !flash); flashBtn.lastChild.textContent = flash ? 'Flash on' : 'Flash off'; } },
      h('span', { class: 'g' }, '⚡'), h('span', {}, 'Flash on'));
    const blink = h('div', { class: 'cam-blink' });
    // The thumbwheel and the frame counter.
    let f = film(), wound = 0;
    const count = h('div', { class: 'cam-count' }, String(f.left));
    const wheel = h('div', { class: 'cam-wheel' + (f.wound ? '' : ' unwound'), 'aria-label': 'Film wheel. Drag down to wind.' });
    let wy = null, ticks = 0;
    wheel.addEventListener('pointerdown', e => { e.preventDefault(); wheel.setPointerCapture(e.pointerId); wy = e.clientY; });
    wheel.addEventListener('pointermove', e => {
      if (wy == null) return;
      const dy = e.clientY - wy;
      if (dy <= 0) { wy = e.clientY; return; } // it only turns one way
      wy = e.clientY;
      wheel.style.backgroundPositionY = `${(parseFloat(wheel.style.backgroundPositionY) || 0) + dy}px`;
      if (f.wound) { if ((ticks += dy) > 40) { ticks = 0; sound.pat(); } return; } // already wound: it just slips
      wound += dy;
      if (Math.floor(wound / 16) > Math.floor((wound - dy) / 16)) sound.tick();
      if (wound > 150) {
        f.wound = true; f.left = f.left > 1 ? f.left - 1 : ROLL;
        saveFilm(f); sound.clunk();
        count.textContent = String(f.left);
        wheel.classList.remove('unwound');
        if (navigator.vibrate) navigator.vibrate(12);
      }
    });
    const wheelUp = () => { wy = null; };
    wheel.addEventListener('pointerup', wheelUp);
    wheel.addEventListener('pointercancel', wheelUp);
    // The shutter: an unwound camera will not fire on a tap. Hold it down to force the shutter anyway.
    let holdT = null, fired = false;
    const shutter = h('button', { class: 'shutter', 'aria-label': 'Take the photo' });
    shutter.addEventListener('pointerdown', e => {
      e.preventDefault(); fired = false;
      if (f.wound || !f.hasLast) { fired = true; shoot(false); return; }
      shutter.classList.add('stiff');
      holdT = setTimeout(() => { fired = true; shutter.classList.remove('stiff'); shoot(true); }, 900);
    });
    const shutterUp = () => {
      clearTimeout(holdT); shutter.classList.remove('stiff');
      if (!fired && !f.wound) { wheel.classList.remove('nudge'); void wheel.offsetWidth; wheel.classList.add('nudge'); sound.pat(); }
    };
    shutter.addEventListener('pointerup', shutterUp);
    shutter.addEventListener('pointerleave', shutterUp);
    const root = h('div', { class: 'cam', style: `--ar:${aspect}` },
      h('div', { class: 'cam-stage' },
        h('div', { class: 'cam-view' },
          video,
          h('div', { class: 'cam-tint' }),
          h('div', { class: 'cam-corners' }),
          blink),
        count, wheel),
      h('div', { class: 'cam-top' },
        h('button', { class: 'cam-x', 'aria-label': 'Close camera', onclick: () => finish(null) }, '✕'),
        prompt ? h('div', { class: 'cam-prompt' }, prompt) : null),
      h('div', { class: 'cam-bottom' },
        flashBtn,
        shutter,
        h('button', { class: 'cam-btn', 'aria-label': 'Flip camera', onclick: () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); } },
          h('span', { class: 'g' }, '⟲'), h('span', {}, 'Flip'))));
    document.body.append(root);

    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 3000 }, height: { ideal: 4000 } }, audio: false });
        video.srcObject = stream;
        video.classList.toggle('mirror', facing === 'user');
        await video.play();
      } catch (e) {
        finish({ error: e });
      }
    }
    function stop() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
    function finish(result) {
      if (done) return;
      done = true;
      stop();
      root.remove();
      resolve(result);
    }
    async function shoot(double) {
      if (!video.videoWidth || done) return;
      // Keep the centre of the frame in the viewfinder's shape, the same part the viewfinder shows.
      const vw = video.videoWidth, vh = video.videoHeight;
      let sw = vw, sh = vh;
      if (vw / vh > aspect) sw = Math.round(vh * aspect); else sh = Math.round(vw / aspect);
      const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const ctx = c.getContext('2d');
      if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      if (double) {
        // Shot without winding: this frame lands on the last one, both faint and glowing.
        const lastBlob = await db.getBlob('film-last').catch(() => null);
        const last = lastBlob && await loadImg(lastBlob);
        if (last) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const k = Math.max(sw / last.naturalWidth, sh / last.naturalHeight);
          ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85;
          ctx.drawImage(last, (sw - last.naturalWidth * k) / 2, (sh - last.naturalHeight * k) / 2, last.naturalWidth * k, last.naturalHeight * k);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          window.dispatchEvent(new CustomEvent('keepsake-tried', { detail: 'double-exposure' }));
        }
      }
      blink.classList.remove('go'); void blink.offsetWidth; blink.classList.add('go', flash ? 'white' : 'dark');
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      f.wound = false; f.hasLast = true; saveFilm(f);
      db.putBlob('film-last', blob).catch(() => {});
      setTimeout(() => finish({ blob, flash }), 260);
    }
    start();
  });
}

// Shows the photo with the effects. Resolves the chosen look, or null if cancelled.
export function openDevelop({ src, look, title = 'Develop', fresh = false }) {
  return new Promise(resolve => {
    look = { ...look };
    const stage = h('div', { class: 'dev-stage' });
    const chips = h('div', { class: 'dev-chips' });
    const presets = h('div', { class: 'dev-presets' });
    const leakBtn = h('button', { class: 'dev-leak', onclick: () => { look.seed = newSeed(); tried('new-leak'); draw(); } }, 'New light leak');
    const root = h('div', { class: 'dev' },
      h('div', { class: 'dev-top' },
        h('button', { class: 'dev-cancel', onclick: () => finish(null) }, 'Cancel'),
        h('h2', {}, title),
        h('span', {})),
      stage,
      h('div', { class: 'dev-panel' },
        presets, chips, leakBtn,
        h('button', { class: 'btn primary', onclick: () => { rememberLook(look); finish(look); } }, 'Use this photo')));
    document.body.append(root);
    let busy = false, again = false;

    async function draw() {
      chips.innerHTML = '';
      for (const e of EFFECTS) chips.append(h('button', {
        class: 'dev-chip' + (look[e.id] ? ' on' : ''), 'aria-pressed': look[e.id] ? 'true' : 'false',
        onclick: () => { look[e.id] = !look[e.id]; draw(); },
      }, h('span', { class: 'dot' }), e.name));
      const all = EFFECTS.every(e => look[e.id]);
      presets.innerHTML = '';
      presets.append(
        h('button', { class: 'dev-preset' + (all ? ' on' : ''), onclick: () => { look = { ...disposableLook(look.when), seed: look.seed }; draw(); } }, 'Disposable'),
        h('button', { class: 'dev-preset' + (isPlain(look) ? ' on' : ''), onclick: () => { look = { ...originalLook(look.when), seed: look.seed }; draw(); } }, 'Original'));
      leakBtn.hidden = !look.leaks;
      if (busy) { again = true; return; }
      busy = true;
      stage.classList.add('working');
      const c = await develop(src, look, 1200);
      c.className = 'dev-pic';
      stage.innerHTML = '';
      stage.append(c);
      stage.classList.remove('working');
      busy = false;
      if (again) { again = false; draw(); }
    }
    function finish(r) { stopDev(); root.remove(); resolve(r); }

    // A fresh shot develops slowly, like an instant print coming up. Shake the phone,
    // or wiggle a finger on the photo, to hurry it along.
    let dev = fresh ? 0 : 1, shook = 0, raf = 0, lastT = performance.now(), lastX = null, dir = 0, lastAcc = null;
    const setDev = () => { stage.style.setProperty('--dev', dev.toFixed(3)); stage.classList.toggle('developing', dev < 1); };
    const hurry = amt => {
      dev = Math.min(1, dev + amt); shook += amt;
      stage.classList.remove('jiggle'); void stage.offsetWidth; stage.classList.add('jiggle');
      if (shook > 0.3 && shook - amt <= 0.3) tried('shake');
    };
    const tick = now => {
      dev = Math.min(1, dev + (now - lastT) / 9000); lastT = now; setDev();
      if (dev < 1) raf = requestAnimationFrame(tick);
    };
    const onMotion = e => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
      if (lastAcc) { const d = Math.hypot(a.x - lastAcc.x, a.y - lastAcc.y, a.z - lastAcc.z); if (d > 14 && dev < 1) hurry(0.05); }
      lastAcc = { x: a.x, y: a.y, z: a.z };
    };
    const onWiggle = e => {
      if (dev >= 1) return;
      if (lastX != null) {
        const dx = e.clientX - lastX;
        if (Math.abs(dx) > 8) { const d = Math.sign(dx); if (dir && d !== dir) hurry(0.035); dir = d; lastX = e.clientX; }
      } else lastX = e.clientX;
    };
    function stopDev() { cancelAnimationFrame(raf); window.removeEventListener('devicemotion', onMotion); }
    if (fresh) {
      setDev();
      raf = requestAnimationFrame(tick);
      window.addEventListener('devicemotion', onMotion);
      stage.addEventListener('pointermove', onWiggle);
      stage.addEventListener('pointerdown', e => { lastX = e.clientX; dir = 0; });
    }
    draw();
  });
}
