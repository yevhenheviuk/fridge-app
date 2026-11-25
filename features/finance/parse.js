// Expense categories + free-text parser. PURE module: used by the app
// (features/finance) AND by the worker (MCP add_expense).
// Changing a category key = data migration (expenses.cat stores it).

export const EXP_CATS = [
  { k: 'food', n: 'Продукти', e: '🛒', w: ['delhaize', 'colruyt', 'aldi', 'lidl', 'carrefour', 'albert', 'okay', 'spar', 'intermarch', 'продукт', 'маркет', 'їжа додому'] },
  { k: 'cafe', n: 'Кафе і їжа', e: '☕', w: ['кава', 'кафе', 'coffee', 'cafe', 'café', 'resto', 'mcdo', 'kfc', 'pizza', 'піца', 'deliveroo', 'uber eats', 'takeaway', 'шаурма', 'бургер', 'суші', 'обід', 'вечеря'] },
  { k: 'move', n: 'Транспорт', e: '🚇', w: ['stib', 'sncb', 'mivb', 'de lijn', 'uber', 'bolt', 'train', 'поїзд', 'метро', 'таксі', 'bus', 'автобус', 'flixbus'] },
  { k: 'fun', n: 'Ігри і підписки', e: '🎮', w: ['steam', 'netflix', 'spotify', 'psn', 'playstation', 'xbox', 'nintendo', 'youtube', 'discord', 'гра', 'кіно', 'cinema', 'claude', 'chatgpt'] },
  { k: 'home', n: 'Дім', e: '🏠', w: ['action', 'ikea', 'hema', 'kruidvat', ' dm', 'brico', 'побут', 'аптека', 'pharmacie', 'apotheek', 'оренда', 'світло', 'інтернет', 'proximus', 'orange', 'telenet'] },
  { k: 'other', n: 'Інше', e: '📦', w: [] },
];
export const expCat = k => EXP_CATS.find(c => c.k === k) || EXP_CATS[EXP_CATS.length - 1];
export const catOf = t => {
  const s = ' ' + t.toLowerCase();
  return (EXP_CATS.find(c => c.w.some(w => s.includes(w))) || EXP_CATS[EXP_CATS.length - 1]).k;
};

// «delhaize 47», «кава 3,5», «47 aldi», «steam 24.99€», «-aldi 23»
export function parseExpense(raw) {
  const s = String(raw).trim().replace(/^[-−💸]\s*/u, '');
  let m = s.match(/^(.{1,60}?)\s+(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur|євро)?$/i);
  if (m) return { title: m[1].trim(), amount: parseFloat(m[2].replace(',', '.')) };
  m = s.match(/^(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur|євро)?\s+(.{1,60})$/i);
  if (m) return { title: m[2].trim(), amount: parseFloat(m[1].replace(',', '.')) };
  return null;
}
