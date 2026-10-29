// Two full screens: the in-app camera and the develop screen.
import { h } from './ui.js';
import { tried } from './tried.js';
import { EFFECTS, develop, newSeed, rememberLook, disposableLook, originalLook, isPlain } from './look.js';

// The live camera needs the installed app. The test copy's page is not allowed to open it.
export function canLiveCamera() {
  return !window.KEEPSAKE_ARTIFACT && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
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
    const root = h('div', { class: 'cam', style: `--ar:${aspect}` },
      h('div', { class: 'cam-stage' },
        h('div', { class: 'cam-view' },
          video,
          h('div', { class: 'cam-tint' }),
          h('div', { class: 'cam-corners' }),
          blink)),
      h('div', { class: 'cam-top' },
        h('button', { class: 'cam-x', 'aria-label': 'Close camera', onclick: () => finish(null) }, '✕'),
        prompt ? h('div', { class: 'cam-prompt' }, prompt) : null),
      h('div', { class: 'cam-bottom' },
        flashBtn,
        h('button', { class: 'shutter', 'aria-label': 'Take the photo', onclick: shoot }),
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
    async function shoot() {
      if (!video.videoWidth) return;
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
      blink.classList.remove('go'); void blink.offsetWidth; blink.classList.add('go', flash ? 'white' : 'dark');
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      setTimeout(() => finish({ blob, flash }), 260);
    }
    start();
  });
}

// Shows the photo with the effects. Resolves the chosen look, or null if cancelled.
export function openDevelop({ src, look, title = 'Develop' }) {
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
    function finish(r) { root.remove(); resolve(r); }
    draw();
  });
}
