#!/usr/bin/env node
// Builds docs/data/demo.json for the experience page: every combination on the page is run through
// the real advisor with LIVE official calculate-price, so the page never shows an estimated price.
// Read-only (no orders, no coupon claiming). Run during a normal meal period (Beijing 10:44–21:45).
//   node scripts/build-demo.mjs --city 上海市 --near 人民广场
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv } from '../src/env.mjs';
import { createSource, requestKey } from '../src/source.mjs';
import { advise } from '../src/advisor.mjs';

loadEnv();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const where = { city: arg('city', '上海市'), near: arg('near', '人民广场') };

export const MAINS = ['', '麦辣鸡腿堡', '麦香鸡', '巨无霸', '板烧鸡腿堡', '麦香鱼', '双层吉士汉堡'];
export const SIDES = ['', '中薯', '麦乐鸡5块'];
export const DRINKS = ['', '中可乐', '无糖可乐中杯', '雪碧中杯'];
const PRESETS = {
  group: { label: '三个人一起点', request: '巨无霸 板烧鸡腿堡 麦辣鸡腿堡 3个中薯 3杯中可乐' },
};

// One live source shared by every run; identical requests are sent only once.
const live = createSource();
const memo = new Map();
const source = { mode: 'live', call: (tool, args = {}) => {
  const k = requestKey(tool, args);
  if (!memo.has(k)) memo.set(k, live.call(tool, args).catch((e) => { memo.delete(k); throw e; }));
  return memo.get(k);
} };

const yuan = (c) => (c == null ? null : c / 100);
function condense(r) {
  if (r.needsClarification) return { status: 'clarify', asks: r.needsClarification };
  if (r.noPlan) return { status: 'noplan', items: r.items, onlyInCombos: r.noPlan.onlyInCombos };
  if (!r.recommended) return { status: 'noprice', items: r.items };
  const best = r.recommended;
  const line = (l, q) => ({ name: l.name, quantity: l.quantity, contents: l.contents, subtotal: yuan(q?.productList?.find((p) => p.productCode === l.productCode)?.subtotal) });
  const others = [];
  const twin = r.alternatives.find((c) => c.quote.price === best.quote.price);
  if (twin) others.push(twin);
  const base = r.alternatives.find((c) => r.baseline && c.signature === r.baseline.signature);
  if (base && !others.includes(base)) others.push(base);
  const next = r.alternatives.find((c) => c.quote.price > best.quote.price && !others.includes(c));
  if (next && others.length < 3) others.push(next);
  return {
    status: 'ok',
    items: r.items.map((i) => ({ name: i.name, qty: i.qty })),
    recommended: { lines: best.lines.map((l) => line(l, best.quote)), price: yuan(best.quote.price), traceId: best.quote.traceId, at: best.quote.at },
    baseline: r.baseline?.quote?.price != null ? yuan(r.baseline.quote.price) : null,
    saving: yuan(r.saving),
    keepOriginal: r.keepOriginal,
    alternatives: others.map((c) => ({ text: c.lines.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`).join(' + '), price: yuan(c.quote.price) })),
    notices: r.notices.map((n) => ({ name: n.name, menuPrice: yuan(n.menuPrice), plain: n.plain.status === 'verified' ? yuan(n.plain.price) : null,
      withCard: n.withCard.status === 'verified' ? yuan(n.withCard.price) : null, card: n.card ? { name: n.card.name, price: yuan(n.card.price) } : null, extras: n.extras })),
    pending: r.pending.map((p) => p.title),
    claimableCount: r.claimableCount,
    searched: r.searched,
    verified: r.alternatives.length + 1,
    unknown: r.unknown.length,
  };
}

const requestFor = (m, s, d, n) => [m, s, d].filter(Boolean).map((x) => (n > 1 ? `${n}${x.includes('可乐') || x.includes('雪碧') ? '杯' : '个'}${x}` : x)).join(' ');

const out = { store: null, at: null, combos: {}, presets: {} };
const t0 = Date.now();
let done = 0, failed = 0;
const jobs = [];
for (const m of MAINS) for (const s of SIDES) for (const d of DRINKS) for (const n of [1, 2, 3]) {
  if (!m && !s && !d) continue;
  jobs.push({ key: `${m}|${s}|${d}|${n}`, request: requestFor(m, s, d, n) });
}
for (const [id, p] of Object.entries(PRESETS)) jobs.push({ key: `preset:${id}`, request: p.request, preset: id });

for (const job of jobs) {
  try {
    const r = await advise(source, { request: job.request, ...where });
    out.store ||= { code: r.store.storeCode, name: r.store.storeName };
    out.at ||= r.time;
    const c = { request: job.request, ...condense(r) };
    if (job.preset) out.presets[job.preset] = { label: PRESETS[job.preset].label, ...c };
    else out.combos[job.key] = c;
    done++;
  } catch (e) {
    failed++;
    console.error(`✗ ${job.request}: ${e.message}`);
  }
  if ((done + failed) % 25 === 0) console.log(`${done + failed}/${jobs.length} · ${(Date.now() - t0) / 1000 | 0}s · 实际请求 ${memo.size}`);
}
out.menu = { mains: MAINS.filter(Boolean), sides: SIDES.filter(Boolean), drinks: DRINKS.filter(Boolean) };
mkdirSync('docs/data', { recursive: true });
writeFileSync('docs/data/demo.json', JSON.stringify(out));
// Same data as a script so the page also works when opened straight from disk (file://).
writeFileSync('docs/data/demo.js', `window.DEMO = ${JSON.stringify(out)};\n`);
const st = Object.values(out.combos).reduce((m, c) => (m[c.status] = (m[c.status] || 0) + 1, m), {});
console.log(`完成：${done} 个，失败 ${failed} 个，用时 ${(Date.now() - t0) / 1000 | 0}s，实际官方请求 ${memo.size} 次`, st);
