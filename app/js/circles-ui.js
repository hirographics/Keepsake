// The Circles screens: sign in with a name, make or join a circle, this week's theme,
// send a page, look at everyone's pages and give ribbons. No scores, no ranks, no winner.
import { h, sheet, confirmSheet } from './ui.js';
import { api, RIBBONS } from './circles.js';
import { db } from './db.js';
import { renderPage, toBlob } from './render.js';
import { sound } from './audio.js';
import { tried } from './tried.js';

let ctx = null; // { app, back, toast, earn }
const ribbonOf = id => RIBBONS.find(r => r.id === id);
const notice = () => { try { return localStorage.getItem('keepsake.circleNotice') === 'ok'; } catch (e) { return false; } };
const noticeOk = () => { try { localStorage.setItem('keepsake.circleNotice', 'ok'); } catch (e) { /* ignore */ } };

function screen(title, ...body) {
  ctx.app.innerHTML = '';
  const root = h('div', { class: 'home circles' },
    h('header', { class: 'circ-head' },
      h('button', { class: 'icon', 'aria-label': 'Back', onclick: () => ctx.backTo() }, '‹'),
      h('h1', {}, title)),
    ...body);
  ctx.app.append(root);
  return root;
}
function busy(text = 'Loading...') { return h('p', { class: 'note circ-busy' }, text); }
function errorBox(e, retry) {
  return h('div', { class: 'circ-error' }, h('p', {}, e.message || String(e)), retry ? h('button', { class: 'btn small', onclick: retry }, 'Try again') : null);
}

// A ribbon drawn as a small rosette in its color.
function ribbonIcon(kind, size = 26) {
  const r = ribbonOf(kind) || RIBBONS[0];
  const s = h('span', { class: 'ribbon-ic', title: r.name, style: `--rc:${r.color};width:${size}px;height:${size * 1.3}px` });
  s.innerHTML = `<svg viewBox="0 0 20 26"><path d="M6 13 L3 25 L7 22 L9 25 L10 14Z M14 13 L17 25 L13 22 L11 25 L10 14Z" fill="var(--rc)" opacity=".85"/><circle cx="10" cy="9" r="8" fill="var(--rc)"/><circle cx="10" cy="9" r="5.2" fill="#fffaf0" opacity=".9"/><circle cx="10" cy="9" r="3.2" fill="var(--rc)"/></svg>`;
  return s;
}

export async function showCircles(c) {
  ctx = { ...c, backTo: c.back };
  if (window.KEEPSAKE_ARTIFACT && !window.KEEPSAKE_FAKE_API) {
    screen('Circles', h('div', { class: 'circ-intro' }, h('p', { class: 'circ-big' }, 'Circles live in the installed app.'),
      h('p', {}, 'This test copy inside Claude cannot reach the Keepsake server. Open Keepsake from your home screen to make or join a circle.')));
    return;
  }
  const root = screen('Circles', busy());
  let me;
  try { me = await api.me(); } catch (e) { root.lastChild.replaceWith(errorBox(e, () => showCircles(c))); return; }
  if (!me || !me.name) return signInScreen(me);
  return listScreen(me);
}

function signInScreen(me) {
  const name = h('input', { class: 'line-input', placeholder: 'Your name, as friends know you', maxlength: 40, value: (me && me.name) || '' });
  const status = h('p', { class: 'note tight' });
  screen('Circles',
    h('div', { class: 'circ-intro' },
      h('p', { class: 'circ-big' }, 'Scrapbook alongside friends.'),
      h('p', {}, 'A circle is a private group you join with a code. Each week has a loose theme. Everyone sends one page, and friends give ribbons. There are no scores, no ranks and no winner.'),
      h('p', { class: 'note tight' }, 'No email needed. Your name is all your circle sees.')),
    name,
    h('button', { class: 'btn primary', onclick: async e => {
      if (!name.value.trim()) { name.focus(); return; }
      e.currentTarget.disabled = true; status.textContent = 'Signing in...';
      try { const m = await api.signIn(name.value); listScreen(m); }
      catch (err) { status.textContent = err.message; e.currentTarget.disabled = false; }
    } }, 'Start'), status);
}

async function listScreen(me) {
  ctx.backTo = ctx.back;
  const list = h('div', { class: 'circ-list' }, busy());
  const code = h('input', { class: 'line-input code-input', placeholder: 'Invite code', maxlength: 6, autocapitalize: 'characters', autocomplete: 'off' });
  const cname = h('input', { class: 'line-input', placeholder: 'Name for a new circle', maxlength: 40 });
  const status = h('p', { class: 'note tight' });
  screen('Circles',
    h('p', { class: 'note tight circ-me' }, `You are ${me.name}. `, h('button', { class: 'linkish', onclick: () => rename(me) }, 'Change name')),
    list,
    h('div', { class: 'label' }, 'Join a circle'),
    h('div', { class: 'row' }, code, h('button', { class: 'btn', onclick: async () => {
      if (code.value.trim().length < 6) { code.focus(); return; }
      status.textContent = 'Joining...';
      try { const c = await api.joinCircle(code.value); sound.done(); circleScreen(me, c.id); }
      catch (e) { status.textContent = e.message; }
    } }, 'Join')),
    h('div', { class: 'label' }, 'Start a circle'),
    h('div', { class: 'row' }, cname, h('button', { class: 'btn', onclick: async () => {
      if (!cname.value.trim()) { cname.focus(); return; }
      status.textContent = 'Making it...';
      try { const c = await api.createCircle(cname.value); sound.done(); circleScreen(me, c.id); }
      catch (e) { status.textContent = e.message; }
    } }, 'Make')),
    status);
  try {
    const circles = await api.myCircles();
    list.innerHTML = '';
    if (!circles.length) list.append(h('p', { class: 'note' }, 'You are not in a circle yet. Join one with a code from a friend, or start your own.'));
    for (const c of circles) list.append(h('button', { class: 'circ-card', onclick: () => circleScreen(me, c.id) },
      h('strong', {}, c.name), h('span', {}, c.owner === me.id ? 'You started this one' : 'Open')));
  } catch (e) { list.innerHTML = ''; list.append(errorBox(e, () => listScreen(me))); }
}

function rename(me) {
  const inp = h('input', { class: 'line-input', value: me.name, maxlength: 40 });
  const s = sheet('Your name', h('div', { class: 'stack' }, inp,
    h('button', { class: 'btn primary', onclick: async () => {
      if (!inp.value.trim()) return;
      try { await api.setName(inp.value); me.name = inp.value.trim(); s.close(); listScreen(me); } catch (e) { ctx.toast(0, e.message); }
    } }, 'Save')));
}

async function circleScreen(me, id) {
  ctx.backTo = () => listScreen(me);
  const root = screen('Circle', busy());
  let v;
  try { v = await api.circleView(id); } catch (e) { root.lastChild.replaceWith(errorBox(e, () => circleScreen(me, id))); return; }
  const { circle, theme, members, entries } = v;
  const owner = circle.owner === me.id;
  const mine = entries.find(e => e.user_id === me.id);
  const given = entries.flatMap(e => e.ribbons.filter(r => r.giver === me.id));
  root.querySelector('h1').textContent = circle.name;
  root.lastChild.remove();

  // This week's theme, as a little card pinned to the top.
  const end = new Date(theme.week + 'T00:00:00'); end.setDate(end.getDate() + 6);
  const days = Math.max(0, Math.ceil((end - new Date()) / 864e5));
  const themeCard = h('div', { class: 'theme-card' },
    h('span', { class: 'theme-label' }, 'This week'),
    h('strong', {}, theme.title),
    h('span', { class: 'note tight' }, days ? `${days} day${days === 1 ? '' : 's'} left · ends Sunday` : 'Last day'),
    owner ? h('button', { class: 'linkish', onclick: () => editTheme(me, id, theme) }, 'Change theme') : null);

  const sendBtn = h('button', { class: 'btn primary', onclick: () => pickPage(me, id, theme, !!mine) }, mine ? 'Swap my page' : 'Send a page');
  const gallery = h('div', { class: 'gallery' });
  if (!entries.length) gallery.append(h('p', { class: 'note' }, 'No pages yet this week. Be the first.'));
  for (const e of [...entries].sort((a, b) => (b.user_id === me.id) - (a.user_id === me.id) || a.updated_at.localeCompare(b.updated_at))) {
    gallery.append(h('button', { class: 'entry', onclick: () => entryView(me, id, e, given) },
      e.url ? h('img', { src: e.url, alt: `${e.name}'s page`, loading: 'lazy' }) : h('div', { class: 'entry-missing' }, 'Picture missing'),
      h('span', { class: 'entry-name' }, e.user_id === me.id ? 'You' : e.name),
      h('span', { class: 'entry-ribbons' }, e.ribbons.slice(0, 8).map(r => ribbonIcon(r.kind, 16)))));
  }

  const invite = h('div', { class: 'invite' },
    h('span', { class: 'theme-label' }, 'Invite code'),
    h('strong', { class: 'code' }, circle.code),
    h('button', { class: 'btn small', onclick: () => shareInvite(circle) }, 'Send invite'));

  const people = h('div', { class: 'people' }, members.map(m => h('div', { class: 'person' },
    h('span', {}, m.id === me.id ? `${m.name} (you)` : m.name, m.id === circle.owner ? h('em', {}, ' · started it') : null),
    owner && m.id !== me.id ? h('button', { class: 'linkish', onclick: () => confirmSheet(`Remove ${m.name}?`,
      `${m.name} leaves the circle and their pages here are deleted.`, 'Remove', async () => {
        try { await api.removeMember(id, m.id); circleScreen(me, id); } catch (e) { ctx.toast(0, e.message); }
      }) }, 'Remove') : null)));

  root.append(themeCard, sendBtn,
    h('div', { class: 'label' }, `Pages this week · ${given.length} of 3 ribbons given`),
    gallery, invite,
    h('div', { class: 'label' }, `In this circle (${members.length})`), people,
    owner
      ? h('button', { class: 'linkish danger', onclick: () => confirmSheet('Delete this circle?', 'Everyone is removed and every page sent here is deleted from the server. This cannot be undone.', 'Delete', async () => {
          try { await api.deleteCircle(id); listScreen(me); } catch (e) { ctx.toast(0, e.message); }
        }) }, 'Delete this circle')
      : h('button', { class: 'linkish danger', onclick: () => confirmSheet('Leave this circle?', 'Your pages here are deleted from the server. You can join again with the code.', 'Leave', async () => {
          try { await api.leaveCircle(id); listScreen(me); } catch (e) { ctx.toast(0, e.message); }
        }) }, 'Leave this circle'));
}

function editTheme(me, id, theme) {
  const inp = h('input', { class: 'line-input', value: theme.title, maxlength: 60 });
  const ideas = ['Something you made', 'A small win', 'Outside', 'Food you shared', 'Golden hour', 'Your people', 'Something old', 'A favorite corner', 'Something blue', 'On the road', 'A quiet moment', 'Firsts', 'What made you laugh'];
  const s = sheet("This week's theme", h('div', { class: 'stack' }, inp,
    h('div', { class: 'chips' }, ideas.map(t => h('button', { class: 'chip', onclick: () => { inp.value = t; } }, t))),
    h('button', { class: 'btn primary', onclick: async () => {
      if (!inp.value.trim()) return;
      try { await api.setTheme(theme.id, inp.value); s.close(); circleScreen(me, id); } catch (e) { ctx.toast(0, e.message); }
    } }, 'Save')));
}

async function shareInvite(circle) {
  const link = location.origin + location.pathname;
  const text = `Join my Keepsake circle "${circle.name}". Open ${link}, tap Circles, and enter the code ${circle.code}.`;
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); ctx.toast(0, 'Invite copied. Paste it in a message.'); } catch (e) { ctx.toast(0, `Code: ${circle.code}`); }
}

// Choose one of your pages to send. It goes as a picture; hidden notes never leave the phone.
async function pickPage(me, id, theme, swapping) {
  const books = (await db.allBooks()).sort((a, b) => b.updated - a.updated);
  const grid = h('div', { class: 'pick-pages' });
  const s = sheet(swapping ? 'Swap your page' : 'Send a page', h('div', { class: 'stack' },
    h('p', { class: 'note tight' }, `Theme: ${theme.title}. Pick any page. It goes as a picture; notes hidden under photos stay on your phone.`),
    books.length ? grid : h('p', { class: 'note' }, 'Make a book first, then send one of its pages.')), { tall: true });
  for (const b of books) {
    grid.append(h('div', { class: 'label' }, b.title));
    const row = h('div', { class: 'pick-row' });
    grid.append(row);
    for (let i = 0; i < b.pages.length; i++) {
      const cell = h('button', { class: 'pick-cell', 'aria-label': `${b.title}, page ${i + 1}`, onclick: () => { s.close(); send(me, id, theme, b.pages[i], `${b.title}, page ${i + 1}`); } });
      row.append(cell);
      renderPage(b.pages[i], 0.16).then(c => cell.append(c)).catch(() => {});
    }
  }
}

async function send(me, id, theme, page, title) {
  const go = async () => {
    ctx.toast(0, 'Sending your page...');
    try {
      const c = await renderPage(page, 1.2);
      const blob = await toBlob(c, 'image/jpeg', 0.86);
      await api.sendPage(id, theme.id, blob, title);
      sound.done();
      tried('circle-page');
      ctx.earn('circle:' + theme.id, 25, 'Sent to your circle');
      circleScreen(me, id);
    } catch (e) { ctx.toast(0, e.message); }
  };
  if (notice()) return go();
  confirmSheet('Your page goes online', 'Pages you send are stored on the Keepsake server so your circle can see them. Only people in this circle can see it. You can take it back any time, and leaving the circle deletes it.', 'Send it', () => { noticeOk(); go(); });
}

function entryView(me, id, e, given) {
  const isMine = e.user_id === me.id;
  const left = 3 - given.length;
  const body = h('div', { class: 'stack' },
    e.url ? h('img', { class: 'entry-big', src: e.url, alt: `${e.name}'s page` }) : null,
    h('p', { class: 'note tight' }, e.title || ''),
    h('div', { class: 'entry-ribbons big' }, e.ribbons.length ? e.ribbons.map(r => ribbonIcon(r.kind, 26)) : h('span', { class: 'note tight' }, 'No ribbons yet')));
  if (isMine) {
    body.append(h('button', { class: 'btn danger-quiet', onclick: () => confirmSheet('Take your page back?', 'It is deleted from the server. You can send another before Sunday.', 'Take it back', async () => {
      try { await api.deletePage(e); s.close(); circleScreen(me, id); } catch (err) { ctx.toast(0, err.message); }
    }) }, 'Take my page back'));
  } else {
    body.append(h('div', { class: 'label' }, left > 0 ? `Give a ribbon · ${left} of 3 left this week` : 'You have given all 3 ribbons this week'),
      h('div', { class: 'ribbon-picks' }, RIBBONS.map(r => {
        const mineGiven = e.ribbons.some(x => x.giver === me.id && x.kind === r.id);
        return h('button', { class: 'ribbon-pick' + (mineGiven ? ' on' : ''), disabled: !mineGiven && left <= 0, onclick: async () => {
          try {
            if (mineGiven) await api.takeRibbon(e, r.id);
            else { await api.giveRibbon(e, r.id); sound.press(); tried('ribbon'); }
            s.close(); circleScreen(me, id);
          } catch (err) { ctx.toast(0, err.message); }
        } }, ribbonIcon(r.id, 22), h('span', {}, r.name));
      })));
  }
  const s = sheet(isMine ? 'Your page' : `${e.name}'s page`, body, { tall: true });
}
