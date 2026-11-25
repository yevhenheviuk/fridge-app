// Boot: login → load features → nav → render.
// Each feature is a self-contained module in features/<id>/index.js.
// A feature that fails to load or render is isolated: the rest keep working.
import { $, el, app, pref, savePref, toast } from './core.js';
import { defineTable, startSync, setOnChange, login, logout, hasToken, setOnAuthLost } from './db.js';
import './people.js';
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
  $('fab').hidden = !(started && f.fab);
  if (f.fab) { $('fab').textContent = f.fab.label; $('fab').onclick = f.fab.onClick; }
  if (started) safe(f, 'render', () => f.render?.(roots[f.id]));
}
app.render = render;
let raf;
const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
setOnChange(later);
$('settingsBtn').onclick = () => app.go('settings');

async function start() {
  if (started) return;
  for (const f of features) safe(f, 'init', () => f.init?.(roots[f.id]));
  started = true;
  await startSync();
  render();
}

/* ---------- auth: one household password ---------- */
const showAuth = on => { $('auth').hidden = !on; if (on) setTimeout(() => $('aPass').focus(), 50); };
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('aMsg').textContent = 'Зачекай…';
  try { await login($('aPass').value); $('aMsg').textContent = ''; $('aPass').value = ''; showAuth(false); start(); }
  catch (err) { $('aMsg').textContent = err.message; }
});
setOnAuthLost(() => showAuth(true));
app.logout = () => { logout(); location.reload(); };

/* ---------- boot ---------- */
render();
if (hasToken()) start(); else showAuth(true);
setInterval(render, 60 * 60 * 1000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
