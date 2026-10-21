// Maps what a person types ("麦辣鸡腿堡 中薯 中可乐x2") to concrete atom codes from the catalog.
// Deterministic: no model involved. Ambiguities are returned, never guessed silently.

const SIZE_RE = /(小|中|大)杯/;

// Normalised (size, base) for a food name. "可乐中杯" -> {size:'中', base:'可乐'}; "中薯条" -> {size:'中', base:'薯'}
export function normalize(name) {
  let s = String(name)
    .replace(/[\s【】“”"'（）()·™]/g, '')
    .replace(/可口可乐/g, '可乐')
    .replace(/汉堡包?/g, '堡')
    .replace(/薯条/g, '薯')
    .replace(/-/g, '')
    .replace(/^(\d+)块(.+)$/, '$2$1块');
  let size = null;
  const cup = s.match(SIZE_RE);
  if (cup) {
    size = cup[1];
    s = s.replace(SIZE_RE, '');
  } else {
    const lead = s.match(/^(小|中|大)(?=(薯|可乐|雪碧|无糖可乐|玉米|红茶|柠檬红茶|怡泉|美式|奶铁|拿铁|鲜萃))/);
    if (lead) {
      size = lead[1];
      s = s.slice(1);
    }
  }
  return { size, base: s.replace(/杯$/, '') };
}

// One "food" = all atom codes whose names normalise to the same size+base (e.g. two codes both named 中薯条).
export const foodKey = (name) => { const n = normalize(name); return `${n.size || ''}|${n.base}`; };

const NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNIT = '个|份|杯|只|盒|根|位';

// "中可乐x2" / "2个麦辣鸡腿堡" / "两杯中可乐" / "麦辣鸡腿堡*2" -> { text, qty }. "5块麦乐鸡" stays a name.
export function splitQty(token) {
  let t = token.trim();
  let qty = 1;
  let m = t.match(new RegExp(`^(\\d+|[一两二三四五六七八九十])\\s*(${UNIT})(.+)$`)) || t.match(/^(\d+)(?![\d块])\s*(.+)$/);
  if (m) {
    qty = NUM[m[1]] || parseInt(m[1], 10);
    t = m[m.length - 1];
  }
  m = t.match(/^(.+?)\s*[x×*]\s*(\d+)$/i);
  if (m) { t = m[1]; qty *= parseInt(m[2], 10); }
  return { text: t.trim(), qty };
}

export const splitRequest = (text) =>
  String(text).split(/[+＋,，、;；\s]+|和|加|配/).map((s) => s.trim()).filter(Boolean);

// A token that is only a multiplier ("x2", "×3", "2份") applies to the item before it.
const MULTIPLIER = new RegExp(`^(?:[x×*]\\s*(\\d+)|(\\d+|[一两二三四五六七八九十])\\s*(?:${UNIT}))$`, 'i');

// Resolve one token. Returns { food, assumedSize } | { combo } | { ambiguous } | { none }.
// Only exact name matches resolve silently; anything fuzzy is asked back to the person.
export function resolveToken(catalog, text) {
  const want = normalize(text);
  const foods = [...catalog.foods.values()].map((f) => ({ f, n: normalize(f.name) }));
  const sizedBases = new Set(foods.filter((e) => e.n.size).map((e) => e.n.base));

  let pool = foods.filter((e) => e.n.base === want.base);
  let assumedSize = null;
  if (pool.length) {
    if (want.size) pool = pool.filter((e) => e.n.size === want.size);
    else if (sizedBases.has(want.base)) {
      const mid = pool.filter((e) => e.n.size === '中');
      if (mid.length) { pool = mid; assumedSize = '中'; }
    }
    if (pool.length === 1) return { food: pool[0].f, assumedSize };
    if (pool.length > 1) return { ambiguous: pool.map((e) => e.f.name) };
  }

  // A combo named exactly ("麦辣鸡腿汉堡三件套"): expand it to its default contents.
  const combos = [...catalog.products.values()].filter((p) => p.kind === 'bundle' && !p.gated);
  const combo = combos.find((p) => normalize(p.name).base === want.base);
  if (combo) return { combo };

  // Fuzzy: never resolve silently. Offer foods and combos whose names overlap enough.
  const overlap = (a, b) => a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.4;
  const options = [
    ...foods.filter((e) => overlap(e.n.base, want.base) && (!want.size || e.n.size === want.size)).map((e) => e.f.name),
    ...combos.filter((p) => overlap(normalize(p.name).base, want.base)).map((p) => p.name),
  ];
  // "麦辣鸡腿堡套餐" / "巨无霸大套餐": also offer combos built around that item.
  const core = want.base.replace(/(超值|大|小)?(套餐|套)$/, '');
  if (core !== want.base && core.length >= 2) options.push(...combos.filter((p) => normalize(p.name).base.startsWith(core)).map((p) => p.name));
  const uniq = [...new Set(options)].slice(0, 8);
  return uniq.length ? { ambiguous: uniq } : { none: true };
}

// Parse the whole request. Returns { items: [{ food, qty, assumedSize, said, fromCombo? }], problems, combos }.
export function parseRequest(catalog, text, { expandCombo } = {}) {
  const items = [];
  const problems = [];
  const combos = [];
  const add = (food, qty, extra) => {
    const existing = items.find((i) => i.food.key === food.key);
    if (existing) existing.qty += qty;
    else items.push({ food, qty, ...extra });
  };
  let last = null;
  for (const tok of splitRequest(text)) {
    const mul = tok.match(MULTIPLIER);
    if (mul && last) {
      const n = parseInt(mul[1], 10) || NUM[mul[2]] || parseInt(mul[2], 10);
      for (const it of last) it.qty += it.unit * (n - 1);
      last = null;
      continue;
    }
    const { text: t, qty } = splitQty(tok);
    const r = resolveToken(catalog, t);
    if (r.food) {
      add(r.food, qty, { assumedSize: r.assumedSize, said: t });
      const it = items.find((i) => i.food.key === r.food.key);
      it.unit = qty;
      last = [it];
    } else if (r.combo && expandCombo) {
      const foods = expandCombo(r.combo);
      combos.push({ name: r.combo.name, qty, contents: foods.map((k) => catalog.foods.get(k).name) });
      const per = new Map();
      for (const k of foods) per.set(k, (per.get(k) || 0) + 1);
      last = [];
      for (const [k, n] of per) {
        add(catalog.foods.get(k), n * qty, { said: r.combo.name, fromCombo: r.combo.name });
        last.push(Object.assign(items.find((i) => i.food.key === k), { unit: n }));
      }
    } else {
      problems.push({ said: t, ...(r.combo ? { ambiguous: [r.combo.name] } : r) });
      last = null;
    }
  }
  for (const i of items) delete i.unit;
  return { items, problems, combos };
}
