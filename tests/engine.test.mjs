// Engine-level regression tests (no pricing calls): catalog, matching and the same-meal planner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../src/source.mjs';
import { buildCatalog, defaultContents } from '../src/catalog.mjs';
import { parseRequest, splitQty } from '../src/match.mjs';
import { generateCandidates } from '../src/plan.mjs';
import { advise, findStore } from '../src/advisor.mjs';

const FIX = new URL('../fixtures/shanghai-1450713', import.meta.url).pathname;
const base = { storeCode: '1450713', orderType: 1, beType: 1 };

async function loadCatalog() {
  const src = createSource({ replayDir: FIX });
  const menu = (await src.call('query-meals', base)).json.data;
  const details = {};
  for (const code of Object.keys(menu.meals)) details[code] = (await src.call('query-meal-detail', { ...base, code })).json.data;
  return { menu, details, catalog: buildCatalog(menu, details) };
}
const { menu, details, catalog } = await loadCatalog();
const plan = (text) => {
  const { items, problems } = parseRequest(catalog, text, { expandCombo: (p) => defaultContents(catalog, p) });
  return { problems, gen: generateCandidates(catalog, items.map((i) => ({ food: i.food.key, qty: i.qty }))) };
};
const names = (c) => c.lines.map((l) => l.name).join('+');

test('多份的格子按份数算：「堡堡随心拼（7件任选）」不会被当成 3 样东西的同一顿', () => {
  const { gen } = plan('麦辣鸡腿堡 中薯 中可乐');
  assert.ok(gen.candidates.every((c) => !/堡堡随心拼/.test(names(c))));
});

test('多份的格子按份数算：「韩式甜辣酱鸡块8块」要 2 份，1 份时不能拿它冒充', () => {
  assert.equal(plan('韩式甜辣酱鸡块').gen.total, 0);
  const two = plan('2个韩式甜辣酱鸡块').gen.candidates[0];
  assert.match(names(two), /8块/);
  assert.equal(two.lines[0].roundList[0].comboItemList[0].quantity, 2);
});

test('4 份以上也能找到最优：4 个麦香鸡 + 4 杯中可乐 = 4 份随心配（估算 ¥55.6）', () => {
  const best = plan('4个麦香鸡 4杯中可乐').gen.candidates[0];
  assert.equal(best.estimate, 5560);
  assert.equal(best.lines.reduce((s, l) => s + l.quantity, 0), 4);
});

test('4 份三件套：¥134.0，不会停在 3 个套餐 + 单点', () => {
  assert.equal(plan('4个麦辣鸡腿堡 4个中薯 4杯中可乐').gen.candidates[0].estimate, 13400);
});

test('学生专享这类有资格限制的商品，不会出现在任何方案里', () => {
  for (const q of ['中雪碧', '阳光柠檬红茶中杯', '麦乐鸡5块']) {
    const { gen } = plan(q);
    assert.ok(gen.candidates.every((c) => !/学生专享/.test(names(c))), q);
  }
});

test('模糊的名字只会反问，不会悄悄换成别的：「巨无霸大套餐」「麦辣鸡腿堡套餐」', () => {
  for (const q of ['巨无霸大套餐', '麦辣鸡腿堡套餐']) {
    const { problems } = plan(q);
    assert.equal(problems.length, 1, q);
    assert.ok(problems[0].ambiguous.length >= 2, q);
  }
});

test('报套餐名时按默认搭配拆开：「麦辣鸡腿汉堡三件套」= 麦辣鸡腿汉堡 + 中薯条 + 可乐中杯', () => {
  const { items, combos } = parseRequest(catalog, '麦辣鸡腿汉堡三件套', { expandCombo: (p) => defaultContents(catalog, p) });
  assert.deepEqual(items.map((i) => i.food.name).sort(), ['中薯条', '可乐中杯', '麦辣鸡腿汉堡'].sort());
  assert.equal(combos[0].name, '麦辣鸡腿汉堡三件套');
});

test('数量：「5块麦乐鸡」是名字不是数量；「两杯中可乐」= 2；「中可乐 x2」作用于前一样', () => {
  assert.deepEqual(splitQty('5块麦乐鸡'), { text: '5块麦乐鸡', qty: 1 });
  assert.deepEqual(splitQty('两杯中可乐'), { text: '中可乐', qty: 2 });
  const { items } = parseRequest(catalog, '麦香鸡 中可乐 x2');
  assert.deepEqual(items.map((i) => [i.food.name, i.qty]), [['麦香鸡', 1], ['可乐中杯', 2]]);
});

test('买不到「一模一样」的一顿时直说：小薯条只在套餐里卖', async () => {
  const r = await advise(createSource({ replayDir: FIX }), { request: '3份麦乐鸡5块 小薯条', city: '上海市', near: '人民广场' });
  assert.ok(r.noPlan);
  assert.deepEqual(r.noPlan.onlyInCombos, ['小薯条']);
  assert.equal(r.recommended, null);
});

test('门店：指定了门店编号就不会被换成最近的店；只给城市或只给地标会报错', async () => {
  const src = createSource({ replayDir: FIX });
  const st = await findStore(src, { store: '9999999', city: '上海市', near: '人民广场' });
  assert.equal(st.storeCode, '9999999');
  await assert.rejects(findStore(src, { city: '上海市' }), /还需要地标/);
  await assert.rejects(findStore(src, { near: '人民广场' }), /还需要城市/);
});

test('商品详情取不到时，这个商品不参与比较（不会被当成单品乱算）', () => {
  const broken = { ...details, 9900005456: null };
  const c = buildCatalog(menu, broken);
  assert.ok(!c.products.has('9900005456'));
  assert.deepEqual(c.skipped.map((x) => x.code), ['9900005456']);
});
