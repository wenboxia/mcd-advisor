// Candidate generation for "same meal, different way to buy".
// Every candidate covers exactly the requested foods: nothing added, nothing dropped.
// Menu-based estimates only decide which candidates are worth sending to the official calculate-price.

import { alaCarte } from './catalog.mjs';

const MAX_FILLS = 48;

const keyOf = (m) => [...m.entries()].filter(([, n]) => n > 0).sort().map(([f, n]) => `${f}*${n}`).join(';');
const countOf = (keys) => keys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
const minus = (m, used) => { const n = new Map(m); for (const f of used) n.set(f, n.get(f) - 1); return n; };
const unitsLeft = (m) => [...m.values()].reduce((s, n) => s + n, 0);

// All multisets of exactly k units over `opts` ([{food, cap}]), as arrays of counts.
function multisets(opts, k) {
  const out = [];
  const walk = (i, left, acc) => {
    if (out.length >= MAX_FILLS) return;
    if (left === 0) { out.push(acc.slice()); return; }
    if (i === opts.length) return;
    for (let n = Math.min(left, opts[i].cap); n >= 0; n--) {
      acc[i] = n;
      walk(i + 1, left - n, acc);
    }
    acc[i] = 0;
  };
  walk(0, k, new Array(opts.length).fill(0));
  return out;
}

// Every way one bundle can be filled entirely from `remaining` (Map food -> count).
// Each round takes exactly `need` units; optional rounds (min 0) may be left out.
// Returns [{ rounds: [{ round, items: [{code, qty}] }], used: [food...], diff }].
export function fillBundle(catalog, bundle, remaining) {
  const out = [];
  const walk = (i, left, picked, used, diff) => {
    if (out.length >= MAX_FILLS) return;
    if (i === bundle.rounds.length) {
      if (used.length) out.push({ rounds: picked, used, diff });
      return;
    }
    const r = bundle.rounds[i];
    const byFood = new Map();
    for (const c of r.choices) {
      const food = catalog.atoms.get(c.code)?.food;
      if (!food || !(left.get(food) > 0)) continue;
      if (!byFood.has(food) || byFood.get(food).diff > c.diff) byFood.set(food, { ...c, food });
    }
    const opts = [...byFood.values()].map((c) => ({ ...c, cap: Math.min(left.get(c.food), c.max) }));
    for (const counts of multisets(opts, r.need)) {
      const items = [];
      const usedHere = [];
      let d = 0;
      const next = new Map(left);
      counts.forEach((n, j) => {
        if (!n) return;
        const c = opts[j];
        items.push({ code: c.code, qty: n });
        for (let k = 0; k < n; k++) usedHere.push(c.food);
        next.set(c.food, next.get(c.food) - n);
        d += c.diff * n;
      });
      walk(i + 1, next, [...picked, { round: r.id, items }], [...used, ...usedHere], diff + d);
    }
    if (r.min === 0) walk(i + 1, left, picked, used, diff);
  };
  walk(0, new Map(remaining), [], [], 0);
  return out;
}

const bundleLine = (catalog, bundle, fill) => ({
  productCode: bundle.code,
  name: bundle.name,
  contents: fill.rounds.flatMap((p) => p.items.flatMap((it) => Array(it.qty).fill(catalog.atoms.get(it.code)?.name || it.code))),
  quantity: 1,
  roundList: fill.rounds.map((p) => ({ round: p.round, comboItemList: p.items.map((it) => ({ code: it.code, quantity: it.qty })) })),
  covers: fill.used,
  estimate: bundle.estimate + fill.diff,
  discountType: bundle.discountType,
});

function alaCarteLine(catalog, food) {
  const s = alaCarte(catalog, food);
  if (!s) return null;
  const f = catalog.foods.get(food);
  const product = catalog.products.get(s.product);
  const line = { productCode: s.product, name: f.name, contents: [f.name], quantity: 1, covers: [food], estimate: s.cost };
  if (product && product.name !== f.name && s.type === 'single') line.productName = product.name;
  if (s.type === 'variant') line.roundList = [{ round: s.round, comboItemList: [{ code: s.atom, quantity: 1 }] }];
  return line;
}

const roundSig = (l) => (l.roundList || []).map((r) => `/${r.round}:${r.comboItemList.map((c) => `${c.code}x${c.quantity}`).join(',')}`).join('');

// Merge identical lines into quantities so the cart reads like a person would order it.
export function mergeLines(lines) {
  const out = [];
  for (const l of lines) {
    const sig = `${l.productCode}${roundSig(l)}#${l.couponId || ''}`;
    const same = out.find((o) => o._sig === sig);
    if (same) {
      same.quantity += l.quantity;
      same.covers = [...same.covers, ...l.covers];
      same.estimate += l.estimate; // contents stay per unit
    } else out.push({ ...l, _sig: sig });
  }
  return out.map(({ _sig, ...l }) => l);
}

export const signature = (lines) =>
  lines.map((l) => `${l.productCode}x${l.quantity}${roundSig(l)}${l.couponId ? `#${l.couponId}` : ''}`).sort().join('+');

// targets: [{ food, qty }]. Returns { baseline, candidates, total } with candidates sorted by estimate.
// Search = exact dynamic programming over the remaining multiset (optimal by estimate), plus one
// candidate per possible "first bundle" so the official price check sees real alternatives.
export function generateCandidates(catalog, targets, { limit = 8 } = {}) {
  const want = countOf(targets.flatMap((t) => Array(t.qty).fill(t.food)));
  const bundles = [...catalog.products.values()].filter((p) => p.kind === 'bundle' && !p.gated && p.estimate > 0);

  const allSeparately = (rem) => {
    const lines = [];
    for (const [f, n] of rem) for (let i = 0; i < n; i++) {
      const l = alaCarteLine(catalog, f);
      if (!l) return null;
      lines.push(l);
    }
    return lines;
  };

  const memo = new Map();
  const solve = (rem) => {
    const k = keyOf(rem);
    if (!k) return { cost: 0, lines: [] };
    if (memo.has(k)) return memo.get(k);
    memo.set(k, { cost: Infinity, lines: null }); // guard against cycles
    let best = { cost: Infinity, lines: null };
    const sep = allSeparately(rem);
    if (sep) best = { cost: sep.reduce((s, l) => s + l.estimate, 0), lines: sep };
    for (const b of bundles) {
      for (const fill of fillBundle(catalog, b, rem)) {
        const sub = solve(minus(rem, fill.used));
        const cost = b.estimate + fill.diff + sub.cost;
        if (cost < best.cost) best = { cost, lines: [bundleLine(catalog, b, fill), ...sub.lines] };
      }
    }
    memo.set(k, best);
    return best;
  };

  const seen = new Map();
  const add = (lines) => {
    if (!lines) return null;
    const merged = mergeLines(lines);
    const sig = signature(merged);
    if (!seen.has(sig)) seen.set(sig, { lines: merged, estimate: merged.reduce((s, l) => s + l.estimate, 0), signature: sig });
    return seen.get(sig);
  };

  const sep = allSeparately(want);
  const baseline = add(sep);
  const optimum = solve(want);
  if (optimum.lines) add(optimum.lines);
  for (const b of bundles) {
    for (const fill of fillBundle(catalog, b, want)) {
      const sub = solve(minus(want, fill.used));
      if (sub.lines) add([bundleLine(catalog, b, fill), ...sub.lines]);
    }
  }

  const candidates = [...seen.values()].sort((a, b) => a.estimate - b.estimate || a.lines.length - b.lines.length);
  return { baseline, candidates: candidates.slice(0, limit), total: candidates.length, units: unitsLeft(want) };
}

// Bundles that contain everything requested PLUS extra food and show a cheaper conditional menu price.
// These are the "menu says ¥28" cases worth explaining, never recommending.
export function conditionalLookalikes(catalog, targets, belowCents) {
  const want = countOf(targets.flatMap((t) => Array(t.qty).fill(t.food)));
  const out = [];
  for (const p of catalog.products.values()) {
    if (p.kind !== 'bundle' || p.gated || !p.withOrder || p.menuPrice >= belowCents) continue;
    const left = new Map(want);
    const roundList = [];
    const extras = [];
    for (const r of p.rounds) {
      if (r.min === 0) continue;
      const items = [];
      let filled = 0;
      for (const c of r.choices) {
        const food = catalog.atoms.get(c.code)?.food;
        const n = Math.min(left.get(food) || 0, c.max, r.need - filled);
        if (n > 0) { items.push({ code: c.code, quantity: n }); left.set(food, left.get(food) - n); filled += n; }
        if (filled === r.need) break;
      }
      const def = r.choices.find((c) => c.isDefault) || r.choices[0];
      for (let i = filled; i < r.need; i++) extras.push(def.name);
      if (items.length) roundList.push({ round: r.id, comboItemList: items });
    }
    if ([...left.values()].some((n) => n > 0)) continue;
    out.push({ product: p, roundList, extras });
  }
  return out.sort((a, b) => a.product.menuPrice - b.product.menuPrice);
}
