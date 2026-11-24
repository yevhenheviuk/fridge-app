// Europe/Brussels time helpers (the household's timezone).
const TZ = 'Europe/Brussels';
export const brusselsDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const brusselsHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
export const brusselsWeekday = () => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date()); // 'Sun'
export const daysBefore = n => brusselsDate(new Date(Date.now() - n * 864e5));
export const dayDiff = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 864e5);
};
export const eur = n => (Math.round(Number(n) * 100) / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' €';
export const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
