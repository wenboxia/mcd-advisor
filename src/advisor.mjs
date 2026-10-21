// Orchestration: store -> menu -> request -> candidates -> official calculate-price -> one answer + receipt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildCatalog, defaultContents, toCents } from './catalog.mjs';
import { parseRequest, normalize } from './match.mjs';
import { generateCandidates, conditionalLookalikes, signature } from './plan.mjs';

const CACHE_DIR = process.env.MCD_ADVISOR_CACHE || join(homedir(), '.cache', 'mcd-advisor');

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

export async function findStore(source, { store, city, near, beType = 1 }) {
  if (!store && city && !near) throw Object.assign(new Error('只说了城市，还需要地标：加上 --near 人民广场 这样的参数'), { code: 'NEED_NEAR' });
  if (!store && near && !city) throw Object.assign(new Error('只说了地标，还需要城市：加上 --city 上海市 这样的参数'), { code: 'NEED_CITY' });
  if (store && !(city && near)) return { storeCode: String(store), storeName: `门店 ${store}` };
  const byLocation = !!(city && near);
  const args = byLocation ? { searchType: 2, city, keyword: near, beType } : { searchType: 1, beType };
  const res = await source.call('query-nearby-stores', args);
  const list = res.json?.data || [];
  // A store the person named is never silently swapped for the nearest one.
  if (store) {
    const named = list.find((s) => s.storeCode === String(store));
    return named ? { storeCode: named.storeCode, storeName: named.storeName, address: named.address } : { storeCode: String(store), storeName: `门店 ${store}` };
  }
  const hit = list[0];
  if (!hit) throw Object.assign(new Error(byLocation ? `在「${city} ${near}」附近没找到门店` : '没有收藏门店：请用 --city 和 --near 指定位置'), { code: 'NO_STORE' });
  return { storeCode: hit.storeCode, storeName: hit.storeName, address: hit.address, open: hit.businessStatus, others: list.slice(0, 5) };
}

async function loadMenu(source, base, date) {
  const cacheFile = join(CACHE_DIR, base.storeCode, `${date}.json`);
  const menu = (await source.call('query-meals', base)).json.data;
  let details = {};
  if (source.mode === 'live' && existsSync(cacheFile)) details = JSON.parse(readFileSync(cacheFile, 'utf8'));
  const missing = Object.keys(menu.meals).filter((c) => details[c] == null);
  let fetched = 0;
  await pool(missing, 4, async (code) => {
    try { details[code] = (await source.call('query-meal-detail', { ...base, code })).json?.data || null; fetched++; }
    catch { details[code] = null; }
  });
  if (source.mode === 'live' && fetched) {
    // Only successful details are cached; failures are retried on the next run.
    mkdirSync(join(CACHE_DIR, base.storeCode), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(Object.entries(details).filter(([, v]) => v))));
  }
  return { menu, details };
}

// available-coupons is Markdown only: "- 优惠券标题：11.9元麦辣鸡腿堡 \ 状态：可领取"
export function parseClaimable(text) {
  const out = [];
  const re = /优惠券标题[：:]\s*([^\\\n]+?)\s*\\?\s*\n\s*状态[：:]\s*([^\\\n]+)/g;
  let m;
  while ((m = re.exec(text || ''))) out.push({ title: m[1].trim(), status: m[2].trim() });
  return out;
}

const couponTarget = (title) => normalize(title.replace(/^[\d.]+元|^免费|任选\d+|\d+选\d+/g, '')).base;

async function priceCandidate(source, base, cand, extra = {}) {
  const items = cand.lines.map((l) => {
    const it = { productCode: l.productCode, quantity: l.quantity };
    if (l.roundList?.length) it.roundList = l.roundList;
    if (l.couponId) { it.couponId = l.couponId; it.couponCode = l.couponCode; }
    return it;
  });
  try {
    const res = await source.call('calculate-price', { ...base, items, ...extra });
    const d = res.json.data;
    return { status: 'verified', price: d.price, originalPrice: d.originalPrice, discount: d.discount, productList: d.productList, traceId: res.json.traceId, at: res.json.datetime };
  } catch (e) {
    return { status: 'unknown', reason: e.message };
  }
}

export async function advise(source, { request, store, city, near, topK = 5 } = {}) {
  const t0 = Date.now();
  const now = (await source.call('now-time-info')).json?.data;
  const date = now?.date || new Date().toISOString().slice(0, 10);
  const st = await findStore(source, { store, city, near });
  const base = { storeCode: st.storeCode, orderType: 1, beType: 1 };

  const { menu, details } = await loadMenu(source, base, date);
  const catalog = buildCatalog(menu, details);
  const parsed = parseRequest(catalog, request, { expandCombo: (p) => defaultContents(catalog, p) });
  const result = {
    store: st, time: now?.formatted, request,
    items: parsed.items.map((i) => ({ name: i.food.name, qty: i.qty, assumedSize: i.assumedSize, said: i.said })),
    combos: parsed.combos,
    partialMenu: catalog.skipped.map((x) => x.name),
  };
  if (parsed.problems.length || !parsed.items.length) {
    const asks = parsed.problems.map((p) => ({ said: p.said, options: p.ambiguous || [], notFound: !!p.none }));
    if (!asks.length) asks.push({ said: request, options: [], notFound: true });
    return { ...result, needsClarification: asks, ms: Date.now() - t0 };
  }
  const targets = parsed.items.map((i) => ({ food: i.food.key, qty: i.qty }));

  // Coupons this store accepts right now: attach to matching lines, one coupon per order at most.
  const [storeCoupons, claimableRes] = await Promise.all([
    source.call('query-store-coupons', base).then((r) => r.json?.data || []).catch(() => []),
    source.call('available-coupons').then((r) => r.text).catch(() => ''),
  ]);

  const gen = generateCandidates(catalog, targets, { limit: Math.max(topK, 6) });
  if (!gen.total) {
    // Some food is only sold inside combos that would add other food: no same-meal way to buy it here.
    const onlyInCombos = parsed.items.filter((i) => !i.food.sources.length).map((i) => i.food.name);
    return { ...result, noPlan: { onlyInCombos }, recommended: null, alternatives: [], unknown: [], notices: [], pending: [], ms: Date.now() - t0 };
  }
  const toPrice = [...gen.candidates.slice(0, topK)];
  if (gen.baseline && !toPrice.find((c) => c.signature === gen.baseline.signature)) toPrice.push(gen.baseline);
  for (const coupon of storeCoupons) {
    const codes = new Set((coupon.products || []).map((p) => p.productCode));
    for (const c of gen.candidates) {
      const idx = c.lines.findIndex((l) => codes.has(l.productCode));
      if (idx < 0) continue;
      const lines = c.lines.flatMap((l, i) => (i !== idx ? [l]
        : [{ ...l, quantity: 1, couponId: coupon.couponId, couponCode: coupon.couponCode, couponTitle: coupon.title },
          ...(l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : [])]));
      toPrice.push({ lines, estimate: c.estimate, signature: `${signature(lines)}`, coupon: coupon.title });
    }
  }

  const priced = await pool(toPrice, 3, async (c) => ({ ...c, quote: await priceCandidate(source, base, c) }));
  const verified = priced.filter((c) => c.quote.status === 'verified').sort((a, b) => a.quote.price - b.quote.price || a.lines.length - b.lines.length);
  const best = verified[0] || null;
  const baselineQuote = gen.baseline && priced.find((c) => c.signature === gen.baseline.signature)?.quote;

  // Explain cheaper-looking conditional menu prices (needs a new card): price without and with the card.
  const notices = [];
  const ref = best?.quote.price ?? Infinity;
  const looks = conditionalLookalikes(catalog, targets, ref).filter((x, i, a) => a.findIndex((y) => y.product.menuPrice === x.product.menuPrice && y.extras.join() === x.extras.join()) === i);
  for (const x of looks.slice(0, 1)) {
    const lines = [{ productCode: x.product.code, quantity: 1, roundList: x.roundList }];
    const [plain, withCard] = await Promise.all([
      priceCandidate(source, base, { lines }),
      priceCandidate(source, base, { lines }, { withOrder: { ...x.product.withOrder, membershipSpecId: x.product.withOrder.specId } }),
    ]);
    const card = withCard.productList?.find((p) => p.productCode !== x.product.code);
    notices.push({ type: 'conditional', name: x.product.name, menuPrice: x.product.menuPrice, discountType: x.product.discountType, extras: x.extras, plain, withCard, card: card ? { name: card.productName, price: card.subtotal } : null });
  }

  const foodBases = targets.map((t) => normalize(catalog.foods.get(t.food).name).base);
  const claimable = parseClaimable(claimableRes).filter((c) => /可领取/.test(c.status));
  const related = (b, f) => (f.length >= 2 && b.includes(f)) || (b.length >= 2 && f.includes(b));
  const pending = claimable.filter((c) => { const b = couponTarget(c.title); return b && foodBases.some((f) => related(b, f)); })
    .map((c) => ({ title: c.title, status: 'pending', claimableTotal: claimable.length }));

  return {
    ...result,
    recommended: best,
    alternatives: verified.slice(1),
    unknown: priced.filter((c) => c.quote.status !== 'verified').map((c) => ({ lines: c.lines, reason: c.quote.reason })),
    baseline: gen.baseline ? { ...gen.baseline, quote: baselineQuote } : null,
    saving: best && baselineQuote?.price != null ? baselineQuote.price - best.quote.price : null,
    keepOriginal: !!(best && gen.baseline && best.signature === gen.baseline.signature),
    notices,
    pending,
    claimableCount: claimable.length,
    storeCouponsCount: storeCoupons.length,
    searched: gen.total,
    ms: Date.now() - t0,
  };
}

export { toCents };
