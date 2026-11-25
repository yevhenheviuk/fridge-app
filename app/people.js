// People of the household (table `profiles`, row id 'main') and
// "who am I on this device" (localStorage). Person ids: 'yevhen', 'oleksandra'.
// 'both' = shared owner. XP: table `xp` (person, xp), server rpc add_xp.
import { data, db, defineTable, rpc } from './db.js';
import { pref, savePref, app } from './core.js';

defineTable('profiles');
defineTable('xp');

const FALLBACK = [{ id: 'me', name: 'Я', goal: '', kcal: null, avoid: '' }];

// Full profile objects (name, goal, kcal, avoid) — used by meals.
export const profiles = () => { const p = data.profiles[0]?.people; return Array.isArray(p) && p.length ? p : FALLBACK; };
// Real people only (without the placeholder 'me').
export const persons = () => { const p = profiles().filter(x => x.id !== 'me'); return p.length ? p : FALLBACK; };
export const personName = id => (id === 'both' ? 'Обоє' : persons().find(p => p.id === id)?.name || '');

export const me = () => { const id = pref('me', ''); return persons().some(p => p.id === id) ? id : null; };
export const meOrFirst = () => me() || persons()[0].id;
export const setMe = id => { savePref('me', id); app.render(); };
export const partner = () => persons().find(p => p.id !== meOrFirst()) || null;

export const xpOf = id => data.xp.find(r => r.person === id)?.xp || 0;
export const houseXp = () => data.xp.reduce((a, r) => a + r.xp, 0);
export const level = x => ({ l: Math.floor(x / 100) + 1, p: ((x % 100) + 100) % 100 });
export async function addXp(n, person = meOrFirst()) {
  if (!person || person === 'me') return;
  await rpc('add_xp', { person, n });
  await db.xp.load();
}
