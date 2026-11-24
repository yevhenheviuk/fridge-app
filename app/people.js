// People of the household (from the `profiles` row) and "who am I on this device".
// One shared login, so identity is a per-device choice stored in localStorage.
// Person ids: 'yevhen', 'oleksandra'. 'both' = shared owner.
import { sb, data, db, defineTable, rpc, onTableChange } from './db.js';
import { pref, savePref } from './core.js';

const FALLBACK = [{ id: 'me', name: 'Я', goal: '', kcal: null, avoid: '' }];
let raw = FALLBACK;
let changed = () => {};
export const onPeopleChange = fn => { changed = fn; };

// Full profile objects (name, goal, kcal, avoid) — used by meals.
export const profiles = () => raw;
// Real people only (without the placeholder 'me').
export const persons = () => { const p = raw.filter(x => x.id !== 'me'); return p.length ? p : FALLBACK; };
export const personName = id => (id === 'both' ? 'Обоє' : persons().find(p => p.id === id)?.name || '');

export const me = () => { const id = pref('me', ''); return persons().some(p => p.id === id) ? id : null; };
export const meOrFirst = () => me() || persons()[0].id;
export const setMe = id => { savePref('me', id); changed(); };
export const partner = () => persons().find(p => p.id !== meOrFirst()) || null;

export async function loadPeople() {
  const { data: row } = await sb.from('profiles').select('people').maybeSingle();
  raw = row && Array.isArray(row.people) && row.people.length ? row.people : FALLBACK;
  changed();
}
onTableChange('profiles', loadPeople);

/* ---------- XP ---------- */
defineTable('xp');
export const xpOf = id => data.xp.find(r => r.person === id)?.xp || 0;
export const houseXp = () => data.xp.reduce((a, r) => a + r.xp, 0);
export const level = x => ({ l: Math.floor(x / 100) + 1, p: ((x % 100) + 100) % 100 });
export async function addXp(n, person = meOrFirst()) {
  if (!person || person === 'me') return;
  await rpc('add_xp', { p_person: person, p_n: n });
  await db.xp.load();
}
