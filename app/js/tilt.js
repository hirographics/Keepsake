// Tilt to shine: holo pieces catch the light as you tilt the phone.
// iPhone asks once for permission to read motion; the request has to come from a tap.
// Some places (like the test copy inside Claude) block motion. Then the light follows
// your finger instead, so the effect can still be seen.
const root = document.documentElement;
let on = false, finger = false, gotMotion = false, base = null, tx = 0, ty = 0, sx = 0, sy = 0, raf = 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const canTilt = () => 'DeviceOrientationEvent' in window;
export const needsPermission = () => canTilt() && typeof DeviceOrientationEvent.requestPermission === 'function';
const remembered = () => { try { return localStorage.getItem('keepsake.tilt') === 'on'; } catch (e) { return false; } };
const remember = () => { try { localStorage.setItem('keepsake.tilt', 'on'); } catch (e) { /* ignore */ } };

// Resolves 'tilt' when motion arrives, 'finger' when motion is blocked or refused.
export async function startTilt() {
  if (gotMotion) return 'tilt';
  if (finger) return 'finger';
  if (!canTilt()) return startFinger();
  if (needsPermission() && !on) {
    let r = 'denied';
    try { r = await DeviceOrientationEvent.requestPermission(); } catch (e) { /* blocked here, or refused */ }
    if (r !== 'granted') return startFinger();
  }
  if (!on) window.addEventListener('deviceorientation', onTilt);
  on = true;
  // A phone that is allowed to read motion sends readings right away. Silence means blocked.
  const ok = await new Promise(res => {
    if (gotMotion) return res(true);
    const t = setTimeout(() => res(gotMotion), 1200);
    window.addEventListener('deviceorientation', function once(e) {
      if (e.gamma == null) return;
      window.removeEventListener('deviceorientation', once); clearTimeout(t); res(true);
    });
  });
  if (ok) { remember(); return 'tilt'; }
  return startFinger();
}
export const tiltOn = () => on || finger;

function onTilt(e) {
  if (e.gamma == null || e.beta == null) return;
  gotMotion = true;
  if (finger) stopFinger();
  if (!base) base = { g: e.gamma, b: e.beta };
  // The resting angle slowly follows how you hold the phone, so any holding angle feels neutral.
  base.g += (e.gamma - base.g) * 0.01;
  base.b += (e.beta - base.b) * 0.01;
  tx = clamp((e.gamma - base.g) / 22, -1, 1);
  ty = clamp((e.beta - base.b) / 22, -1, 1);
  kick();
}

// Fallback: drag a finger anywhere and the light moves with it, as if you tilted toward it.
function onFinger(e) {
  if (e.pointerType === 'mouse' && !e.buttons) return;
  tx = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
  ty = clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
  kick();
}
function startFinger() {
  if (!finger) {
    finger = true;
    window.addEventListener('pointermove', onFinger, { passive: true });
    window.addEventListener('pointerdown', onFinger, { passive: true });
  }
  return 'finger';
}
function stopFinger() {
  finger = false;
  window.removeEventListener('pointermove', onFinger);
  window.removeEventListener('pointerdown', onFinger);
}

function kick() { if (!raf) raf = requestAnimationFrame(apply); }
function apply() {
  raf = 0;
  sx += (tx - sx) * 0.35; sy += (ty - sy) * 0.35;
  root.classList.add('tilting');
  root.style.setProperty('--tx', sx.toFixed(3));
  root.style.setProperty('--ty', sy.toFixed(3));
  if (Math.abs(tx - sx) > 0.002 || Math.abs(ty - sy) > 0.002) raf = requestAnimationFrame(apply);
}

// On phones that need no permission, start right away (quietly; no finger fallback yet).
// On iPhone, if you said yes before, start again on your first tap.
export function initTilt() {
  if (!canTilt()) return;
  if (!needsPermission()) {
    window.addEventListener('deviceorientation', onTilt);
    on = true;
    return;
  }
  if (remembered()) window.addEventListener('pointerdown', () => startTilt(), { once: true, capture: true });
}
export const lightOn = () => gotMotion || finger;
