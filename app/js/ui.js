// Small DOM helpers and bottom sheets shared by every screen.
export const $ = (sel, root = document) => root.querySelector(sel);
export const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
};

// ---------- sheets ----------
export function sheet(title, body, { onClose, tall } = {}) {
  const back = h('div', { class: 'sheet-back' });
  const box = h('div', { class: 'sheet' + (tall ? ' tall' : '') },
    h('div', { class: 'sheet-head' }, h('div', { class: 'grab' }), h('h2', {}, title), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => close() }, '✕')),
    h('div', { class: 'sheet-body' }, body));
  back.append(box);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.classList.remove('open');
    setTimeout(() => back.remove(), 220);
    onClose && onClose();
  }
  return { close, box };
}

export function confirmSheet(title, text, yes, onYes) {
  const s = sheet(title, h('div', {},
    h('p', { class: 'note' }, text),
    h('div', { class: 'row end' },
      h('button', { class: 'btn', onclick: () => s.close() }, 'Keep it'),
      h('button', { class: 'btn danger', onclick: () => { s.close(); onYes(); } }, yes))));
}

