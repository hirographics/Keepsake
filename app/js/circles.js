// Circles: private friend groups on the Keepsake server (Supabase).
// Everything the app asks the server goes through `api`, so the screens never talk to it directly.
// The server checks membership on every read: only people in a circle ever see its pages.
const URL_ = 'https://kakasqhqwkmvswzfsnzx.supabase.co';
const KEY = 'sb_publishable_5xd-eNYwop4kqanXIwFlpQ_uY23DtbM'; // a public key, meant to live in the app

export const RIBBONS = [
  { id: 'coziest', name: 'Coziest', color: '#d98a3d' },
  { id: 'funniest', name: 'Funniest', color: '#e0b43a' },
  { id: 'best-tape', name: 'Best tape job', color: '#d3584f' },
  { id: 'hands-on', name: 'Most hands-on', color: '#5b8a72' },
  { id: 'best-story', name: 'Best story', color: '#5a77a8' },
];

let sb = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('offline')); document.head.append(s); });
}
async function client() {
  if (sb) return sb;
  if (!window.supabase) await loadScript('vendor/supabase.js');
  sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'keepsake.auth' } });
  return sb;
}
// Turns server errors into plain words.
function fail(error, fallback) {
  const m = (error && error.message) || '';
  if (/fetch|network|offline|Load failed/i.test(m)) throw new Error('You seem to be offline. Circles need the internet.');
  if (/anonymous/i.test(m) && /disabled|not enabled/i.test(m)) throw new Error('Sign-in is not switched on yet on the server (anonymous sign-ins).');
  if (/given all 3 ribbons|No circle has that code|That circle is full|Sign in first/.test(m)) throw new Error(m.replace(/^.*?: /, ''));
  throw new Error(fallback || m || 'Something went wrong.');
}
const check = ({ data, error }, fallback) => { if (error) fail(error, fallback); return data; };

const real = {
  async me() {
    const c = await client();
    const { data: { session } } = await c.auth.getSession();
    if (!session) return null;
    const uid = session.user.id;
    const { data } = await c.from('profiles').select('id,name').eq('id', uid).maybeSingle();
    return { id: uid, name: data ? data.name : '' };
  },
  async signIn(name) {
    const c = await client();
    let { data: { session } } = await c.auth.getSession();
    if (!session) session = check(await c.auth.signInAnonymously(), 'Could not sign in.').session;
    check(await c.from('profiles').upsert({ id: session.user.id, name: name.trim().slice(0, 40) }), 'Could not save your name.');
    return { id: session.user.id, name: name.trim() };
  },
  async setName(name) {
    const c = await client(); const me = await real.me();
    check(await c.from('profiles').upsert({ id: me.id, name: name.trim().slice(0, 40) }), 'Could not save your name.');
  },
  async myCircles() {
    const c = await client();
    return check(await c.from('circles').select('id,name,code,owner,created_at').order('created_at'), 'Could not load your circles.');
  },
  async createCircle(name) { const c = await client(); return check(await c.rpc('create_circle', { circle_name: name }), 'Could not make the circle.'); },
  async joinCircle(code) { const c = await client(); return check(await c.rpc('join_circle', { invite: code }), 'Could not join.'); },
  // Everything a circle screen shows: this week's theme, who is in it, the pages and their ribbons.
  async circleView(id) {
    const c = await client();
    const circle = check(await c.from('circles').select('id,name,code,owner').eq('id', id).single(), 'Could not open the circle.');
    const theme = check(await c.rpc('current_theme', { c: id }), 'Could not load this week.');
    const members = check(await c.from('members').select('user_id,joined_at').eq('circle_id', id), 'Could not load members.');
    const ids = members.map(m => m.user_id);
    const people = ids.length ? check(await c.from('profiles').select('id,name').in('id', ids)) : [];
    const entries = check(await c.from('entries').select('id,user_id,theme_id,image_path,title,updated_at').eq('theme_id', theme.id));
    const ribbons = check(await c.from('ribbons').select('entry_id,giver,kind').eq('theme_id', theme.id));
    let urls = {};
    if (entries.length) {
      const signed = check(await c.storage.from('pages').createSignedUrls(entries.map(e => e.image_path), 3600));
      for (const s of signed) if (s.signedUrl) urls[s.path] = s.signedUrl;
    }
    const name = Object.fromEntries(people.map(p => [p.id, p.name]));
    return {
      circle, theme,
      members: members.map(m => ({ id: m.user_id, name: name[m.user_id] || 'Someone' })),
      entries: entries.map(e => ({ ...e, name: name[e.user_id] || 'Someone', url: urls[e.image_path] ? urls[e.image_path] + '&v=' + Date.parse(e.updated_at) : null,
        ribbons: ribbons.filter(r => r.entry_id === e.id) })),
      myRibbons: null, // filled by the screen with the signed-in id
    };
  },
  async setTheme(themeId, title) { const c = await client(); check(await c.from('themes').update({ title: title.trim().slice(0, 60) }).eq('id', themeId), 'Could not change the theme.'); },
  async sendPage(circleId, themeId, blob, title) {
    const c = await client(); const me = await real.me();
    const path = `${circleId}/${themeId}/${me.id}.jpg`;
    check(await c.storage.from('pages').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' }), 'Could not upload the page.');
    check(await c.from('entries').upsert({ circle_id: circleId, theme_id: themeId, user_id: me.id, image_path: path, title: title || null }, { onConflict: 'theme_id,user_id' }), 'Could not send the page.');
  },
  async deletePage(entry) {
    const c = await client();
    await c.storage.from('pages').remove([entry.image_path]);
    check(await c.from('entries').delete().eq('id', entry.id), 'Could not take the page back.');
  },
  async giveRibbon(entry, kind) { const c = await client(); const me = await real.me(); check(await c.from('ribbons').insert({ entry_id: entry.id, theme_id: entry.theme_id, giver: me.id, kind })); },
  async takeRibbon(entry, kind) { const c = await client(); const me = await real.me(); check(await c.from('ribbons').delete().eq('entry_id', entry.id).eq('giver', me.id).eq('kind', kind)); },
  async removeMember(circleId, userId) {
    const c = await client();
    const mine = check(await c.from('entries').select('id,image_path').eq('circle_id', circleId).eq('user_id', userId));
    if (mine.length) await c.storage.from('pages').remove(mine.map(e => e.image_path));
    check(await c.from('entries').delete().eq('circle_id', circleId).eq('user_id', userId));
    check(await c.from('members').delete().eq('circle_id', circleId).eq('user_id', userId), 'Could not remove them.');
  },
  async leaveCircle(circleId) { const me = await real.me(); await real.removeMember(circleId, me.id); },
  async deleteCircle(circleId) {
    const c = await client();
    const all = check(await c.from('entries').select('image_path').eq('circle_id', circleId));
    if (all.length) await c.storage.from('pages').remove(all.map(e => e.image_path));
    check(await c.from('circles').delete().eq('id', circleId), 'Could not delete the circle.');
  },
};

// Tests swap in a stand-in server; the app always uses the real one.
export const api = new Proxy({}, { get: (_, k) => (window.KEEPSAKE_FAKE_API || real)[k] });
