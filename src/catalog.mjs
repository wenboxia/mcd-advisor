// Turns one store's menu (query-meals) and meal details (query-meal-detail) into:
//   products: everything you can put in a cart, with base price and round structure
//   atoms:    concrete foods by choice code
//   foods:    atoms grouped by normalised name — the unit "same meal" is measured in
// Prices are integer cents. Menu prices are display hints only; ranking always uses calculate-price.

import { foodKey } from './match.mjs';

export const toCents = (yuan) => Math.round(parseFloat(String(yuan).replace(/[^\d.\-]/g, '')) * 100);

// "+ ¥1.5" -> 150, "-¥0.5" -> -50
export function diffCents(diffPrice) {
  if (!diffPrice) return 0;
  const m = String(diffPrice).replace(/\s/g, '').match(/([+-])?¥?(-?\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = Math.round(parseFloat(m[2]) * 100);
  return m[1] === '-' ? -Math.abs(v) : v;
}

// discountType values seen in query-meals: null | 促销优惠 | 麦金卡优惠 | 早餐卡优惠 | 随单购麦金卡优惠 | 随单购早餐卡优惠
export const needsNewCard = (discountType) => typeof discountType === 'string' && discountType.startsWith('随单购');

// Products only some people may buy (students, new members...). Never offered as a way to buy.
export const GATED = /学生专享|新人专享|新客专享|会员专享|员工专享/;

export function buildCatalog(menuData, details) {
  const products = new Map();
  const atoms = new Map();
  const skipped = [];
  const categoryOf = new Map();
  for (const c of menuData.categories || []) {
    for (const m of c.meals || []) if (!categoryOf.has(m.code)) categoryOf.set(m.code, c.name.replace(/\s+/g, ''));
  }

  const addAtom = (code, name, how) => {
    if (!atoms.has(code)) atoms.set(code, { code, name, sources: [] });
    if (how) atoms.get(code).sources.push(how);
  };

  for (const [code, m] of Object.entries(menuData.meals || {})) {
    const detail = details[code];
    // Without a detail we cannot know what is inside; better to leave the product out than to guess.
    if (!detail) { skipped.push({ code, name: m.name }); continue; }
    const rounds = (detail.rounds || []).map((r) => {
      const min = r.minQuantity ?? 1;
      return {
        id: String(r.id),
        name: r.name,
        min,
        // How many units this slot holds (e.g. "任选3份小食" needs 3).
        need: Math.max(1, r.quantity ?? (min || 1)),
        choices: (r.choices || []).map((c) => ({
          code: c.code,
          name: c.name,
          diff: diffCents(c.diffPrice),
          isDefault: c.isDefault === 1,
          max: c.maxQuantity == null || c.maxQuantity < 0 ? Infinity : c.maxQuantity,
          defQty: c.quantity || 0,
        })),
      };
    });
    const conditional = needsNewCard(m.discountType);
    const kind = rounds.length === 0 ? 'single'
      : rounds.length === 1 && rounds[0].need === 1 && rounds[0].min >= 1 ? 'variant' : 'bundle';
    const p = {
      code,
      name: m.name,
      category: categoryOf.get(code) || '',
      // A "随单购" price only holds when a card is bought in the same order, so without the card
      // the realistic estimate is the original price.
      estimate: conditional ? toCents(m.originalPrice) : toCents(m.currentPrice),
      menuPrice: toCents(m.currentPrice),
      originalPrice: toCents(m.originalPrice),
      discountType: m.discountType || null,
      withOrder: m.withOrder || null,
      gated: GATED.test(m.name),
      rounds,
      kind,
    };
    products.set(code, p);

    const usable = !p.gated;
    if (kind === 'single') addAtom(code, detail.name || m.name, usable ? { type: 'single', product: code, cost: p.estimate } : null);
    for (const r of rounds) {
      for (const c of r.choices) {
        addAtom(c.code, c.name, kind === 'variant' && usable ? { type: 'variant', product: code, round: r.id, cost: p.estimate + c.diff } : null);
      }
    }
  }

  // Group atoms into foods (same normalised name = same food for the person ordering).
  const foods = new Map();
  for (const a of atoms.values()) {
    const key = foodKey(a.name);
    a.food = key;
    if (!foods.has(key)) foods.set(key, { key, name: a.name, codes: new Set(), sources: [] });
    const f = foods.get(key);
    f.codes.add(a.code);
    f.sources.push(...a.sources.map((s) => ({ ...s, atom: a.code })));
    if (a.name.length < f.name.length) f.name = a.name;
  }
  return { products, atoms, foods, skipped };
}

// Cheapest estimated way to buy one food on its own (null if it is only sold inside bundles).
export function alaCarte(catalog, key) {
  const f = catalog.foods.get(key);
  if (!f || f.sources.length === 0) return null;
  return f.sources.reduce((best, s) => (best && best.cost <= s.cost ? best : s));
}

// Default contents of a bundle, as food keys (used when someone names a combo, e.g. "麦辣鸡腿汉堡三件套").
export function defaultContents(catalog, product) {
  const out = [];
  for (const r of product.rounds) {
    if (r.min === 0) continue;
    const defs = r.choices.filter((c) => c.isDefault);
    const pool = defs.length ? defs : r.choices.slice(0, 1);
    let left = r.need;
    for (const c of pool) {
      const n = Math.min(left, Math.max(1, c.defQty || 1));
      for (let i = 0; i < n; i++) out.push(catalog.atoms.get(c.code).food);
      left -= n;
      if (!left) break;
    }
    while (left-- > 0) out.push(catalog.atoms.get(pool[0].code).food);
  }
  return out;
}
