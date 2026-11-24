// App core: DOM + date + format helpers, toast, and the `app` hub that
// features use to talk to each other. No feature logic here.

export const $ = id => document.getElementById(id);

// el('button', {class:'btn', onclick: fn}, 'text', childEl)
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}

// Static markup for dialogs/skeletons. Never pass user data in here — use el().
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/* ---------- dates (device local time = Brussels) ---------- */
export const today = () => { const n = new Date(); n.setHours(0, 0, 0, 0); return n; };
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => iso(today());
export const plusDays = n => { const d = today(); d.setDate(d.getDate() + n); return iso(d); };
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysLeft = exp => (exp ? Math.round((parse(exp) - today()) / 864e5) : null);
export const daysAgo = s => Math.round((today() - parse(s.slice(0, 10))) / 864e5);
export const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
export const MONTHS_G = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export const fmtDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS_G[d.getMonth()]}`; };
export const fmtDay = s => parse(s).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
export const ago = s => { const n = daysAgo(s); return n <= 0 ? 'сьогодні' : n === 1 ? 'вчора' : `${n} дн. тому`; };

/* ---------- words & numbers ---------- */
export function plural(n, a, b, c) {
  n = Math.abs(n); const x = n % 10, y = n % 100;
  if (x === 1 && y !== 11) return a;
  if (x >= 2 && x <= 4 && (y < 10 || y >= 20)) return b;
  return c;
}
export const pDays = n => plural(n, 'день', 'дні', 'днів');
export const eur = n => { n = Number(n) || 0; return (Math.round(n * 100) / 100).toLocaleString('uk-UA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; };
export const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/* ---------- per-device preferences ---------- */
export const pref = (k, d) => { try { return localStorage.getItem('home.' + k) ?? d; } catch { return d; } };
export const savePref = (k, v) => { try { localStorage.setItem('home.' + k, v); } catch { /* private mode */ } };

/* ---------- feedback ---------- */
let tt;
export function toast(msg, action) {
  const t = $('toast'), b = $('toastBtn');
  $('toastMsg').textContent = msg;
  if (action) { b.hidden = false; b.textContent = action.label; b.onclick = () => { t.classList.remove('on'); action.fn(); }; t.classList.add('act'); }
  else { b.hidden = true; t.classList.remove('act'); }
  t.classList.add('on'); clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), action ? 5000 : 2200);
}
export function errMsg(e) {
  console.warn(e);
  toast(navigator.onLine ? 'Не збереглося, спробуй ще раз' : 'Немає інтернету — зміни не збережено');
}
// Destructive button: first tap arms it, second tap within 2.5 s runs fn.
export function confirmTap(btn, fn) {
  if (btn.dataset.arm) { fn(); return; }
  const was = btn.textContent;
  btn.dataset.arm = '1'; btn.textContent = 'Точно?'; btn.classList.add('armed');
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.arm; btn.textContent = was; btn.classList.remove('armed'); } }, 2500);
}

/* ---------- hub between features ----------
   app.go('fridge')                      → switch view
   app.call('fridge', 'openSheet', ...)  → run another feature's public action
   Public actions are listed in each feature's CLAUDE.md. */
export const app = {
  view: null,
  features: {},
  go: () => {},
  render: () => {},
  call(feature, action, ...args) {
    const fn = app.features[feature]?.actions?.[action];
    if (!fn) { console.warn(`no action ${feature}.${action}`); return; }
    return fn(...args);
  },
};
