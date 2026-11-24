// Boot: login → load features → nav → render.
// Each feature is a self-contained module in features/<id>/index.js.
// A feature that fails to load or render is isolated: the rest keep working.
import { $, el, app, pref, savePref, toast } from './core.js';
import { sb, defineTable, loadAll, startRealtime, setOnChange } from './db.js';
import { loadPeople, onPeopleChange, persons, me, setMe } from './people.js';
import { FEATURE_IDS } from './registry.js';

const features = [];
const roots = {};

/* ---------- load features ---------- */
for (const id of FEATURE_IDS) {
  document.head.append(el('link', { rel: 'stylesheet', href: `features/${id}/style.css` }));
}
const mods = await Promise.all(FEATURE_IDS.map(id =>
  import(`../features/${id}/index.js`).then(m => m.default).catch(e => { console.error(`feature "${id}" failed to load`, e); return null; })));
for (const f of mods) {
  if (!f) continue;
  features.push(f);
  app.features[f.id] = f;
  for (const [t, o] of Object.entries(f.tables || {})) defineTable(t, o);
  const root = el('main', { 'data-feature': f.id, hidden: true });
  $('viewsHost').append(root);
  roots[f.id] = root;
}

/* ---------- render ---------- */
app.view = app.features[pref('view', '')] ? pref('view', '') : features[0]?.id;
app.go = id => { if (!app.features[id]) return; app.view = id; savePref('view', id); render(); scrollTo(0, 0); };
let started = false;

function safe(f, what, fn) {
  try { return fn(); } catch (e) {
    console.error(`feature "${f.id}" ${what} failed`, e);
    if (what === 'render') roots[f.id].replaceChildren(el('p', { class: 'empty' }, `Розділ «${f.name}» зламався. Інші працюють.`));
  }
}

function render() {
  const f = app.features[app.view];
  if (!f) return;
  $('title').textContent = f.title || f.name;
  $('count').textContent = (started && safe(f, 'count', () => f.count?.())) || '';
  const nav = $('views'); nav.replaceChildren();
  features.filter(x => x.nav !== false).forEach(x => {
    const n = started ? safe(x, 'badge', () => x.badge?.()) : 0;
    nav.append(el('button', { class: 'view-btn', 'aria-pressed': String(x.id === app.view), onclick: () => app.go(x.id) },
      el('span', { class: 'vi', 'aria-hidden': 'true' }, x.icon), x.name,
      n ? el('span', { class: 'badge' }, String(n)) : null));
  });
  $('settingsBtn').setAttribute('aria-pressed', String(app.view === 'settings'));
  for (const x of features) roots[x.id].hidden = x.id !== app.view;
  const ps = persons();
  $('meBanner').hidden = !started || ps.length < 2 || !!me();
  if (!$('meBanner').hidden) {
    $('meChips').replaceChildren(...ps.map(p => el('button', { class: 'chip', onclick: () => { setMe(p.id); toast(`Привіт, ${p.name}!`); } }, p.name)));
  }
  $('fab').hidden = !(started && f.fab);
  if (f.fab) { $('fab').textContent = f.fab.label; $('fab').onclick = f.fab.onClick; }
  if (started) safe(f, 'render', () => f.render?.(roots[f.id]));
}
app.render = render;
let raf;
const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
setOnChange(later);
onPeopleChange(later);
$('settingsBtn').onclick = () => app.go('settings');

async function start() {
  if (started) return;
  for (const f of features) safe(f, 'init', () => f.init?.(roots[f.id]));
  started = true;
  await Promise.all([loadAll(), loadPeople()]);
  startRealtime();
  render();
}

/* ---------- auth ---------- */
async function authDo(kind) {
  const email = $('aEmail').value.trim(), password = $('aPass').value;
  if (!email || password.length < 6) { $('aMsg').textContent = 'Введи email і пароль від 6 символів'; return; }
  $('aMsg').textContent = 'Зачекай…';
  const redirect = location.origin + location.pathname;
  const { data, error } = kind === 'up'
    ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $('aMsg').textContent = error.message.includes('Invalid login') ? 'Невірний email або пароль'
      : error.message.includes('not confirmed') ? 'Спершу підтверди email — лист уже в пошті' : error.message;
    return;
  }
  if (kind === 'up' && !data.session) { $('aMsg').textContent = 'Готово! Підтверди email за посиланням у листі, потім увійди.'; return; }
  $('aMsg').textContent = '';
}
$('authForm').addEventListener('submit', e => { e.preventDefault(); authDo('in'); });
$('aSignup').onclick = () => authDo('up');
app.session = null;
const onSession = s => { app.session = s; $('auth').hidden = !!s; if (s) start(); };
sb.auth.onAuthStateChange((_ev, s) => onSession(s));

/* ---------- boot ---------- */
render();
const { data: { session } } = await sb.auth.getSession();
onSession(session);
setInterval(render, 60 * 60 * 1000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
