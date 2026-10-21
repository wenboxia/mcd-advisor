// Offline tests: replay real MCP responses recorded on 2026-10-21 (上海黄浦华旭国际大厦餐厅), no token needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../src/source.mjs';
import { advise } from '../src/advisor.mjs';
import { createClient } from '../src/mcp.mjs';
import { normalize, splitQty } from '../src/match.mjs';
import { diffCents } from '../src/catalog.mjs';

const FIX = new URL('../fixtures/shanghai-1450713', import.meta.url).pathname;
const where = { city: '上海市', near: '人民广场' };
const run = (request, source = createSource({ replayDir: FIX })) => advise(source, { request, ...where });

// "Same meal": what the recommended cart contains must equal what was asked for, food by food.
function assertSameMeal(r) {
  const want = r.items.flatMap((i) => Array(i.qty).fill(i.name)).sort();
  const got = r.recommended.lines.flatMap((l) => Array(l.quantity).fill(l.contents).flat()).sort();
  assert.deepEqual(got, want);
}

test('换买法：麦辣鸡腿堡 + 中薯 + 中可乐 -> 三件套 ¥33.5，比分开点少付 ¥12.5', async () => {
  const r = await run('麦辣鸡腿堡 中薯 中可乐');
  assert.equal(r.recommended.quote.status, 'verified');
  assert.equal(r.recommended.quote.price, 3350);
  assert.equal(r.baseline.quote.price, 4600);
  assert.equal(r.saving, 1250);
  assertSameMeal(r);
});

test('随心配：麦香鸡 + 中可乐 -> ¥13.9，比分开点少付 ¥13.1', async () => {
  const r = await run('麦香鸡 中可乐');
  assert.equal(r.recommended.quote.price, 1390);
  assert.equal(r.saving, 1310);
  assert.match(r.recommended.lines[0].name, /随心配/);
  assertSameMeal(r);
});

test('数量：2 个麦香鸡 + 2 杯中可乐 -> 两份随心配 ¥27.8，比分开点少付 ¥26.2', async () => {
  const r = await run('2个麦香鸡 2杯中可乐');
  assert.equal(r.recommended.quote.price, 2780);
  assert.equal(r.baseline.quote.price, 5400);
  assertSameMeal(r);
});

test('几个人一起点：三个人各要汉堡 + 中薯 + 中可乐 -> 三份三件套 ¥104.5，比分开点少付 ¥37.5', async () => {
  const r = await run('巨无霸 板烧鸡腿堡 麦辣鸡腿堡 3个中薯 3杯中可乐');
  assert.equal(r.recommended.quote.price, 10450);
  assert.equal(r.baseline.quote.price, 14200);
  assert.equal(r.saving, 3750);
  assert.equal(r.recommended.lines.length, 3);
  assert.ok(r.recommended.lines.every((l) => /三件套/.test(l.name)));
  assertSameMeal(r);
});

test('没得省：只要一个麦辣鸡腿堡时不推套餐，保持原点法', async () => {
  const r = await run('麦辣鸡腿堡');
  assert.equal(r.keepOriginal, true);
  assert.equal(r.recommended.quote.price, 2250);
  assertSameMeal(r);
});

test('条件价：菜单 ¥28 的四件套，不加卡核价 ¥57，加 ¥9.9 体验卡后 ¥37.9，且多一份麦乐鸡4块', async () => {
  const r = await run('麦辣鸡腿堡 中薯 中可乐');
  const n = r.notices.find((x) => x.type === 'conditional');
  assert.ok(n, 'should explain the conditional menu price');
  assert.equal(n.menuPrice, 2800);
  assert.equal(n.plain.price, 5700);
  assert.equal(n.withCard.price, 3790);
  assert.equal(n.card.price, 990);
  assert.deepEqual(n.extras, ['麦乐鸡4块']);
  // Never recommended: the recommendation is the same-meal set, not the card bundle.
  assert.doesNotMatch(r.recommended.lines.map((l) => l.name).join(), /四件套/);
});

test('可领券只标「待核验」、不参与排名；「免费脆薯饼」不会被当成中薯条', async () => {
  const one = await run('麦辣鸡腿堡');
  assert.deepEqual(one.pending.map((p) => p.title), ['11.9元麦辣鸡腿堡']);
  assert.equal(one.claimableCount, 3);
  const three = await run('麦辣鸡腿堡 中薯 中可乐');
  assert.ok(!three.pending.some((p) => p.title.includes('脆薯饼')));
});

test('说不清的会先问：「麦乐鸡」有 4 块和 5 块', async () => {
  const r = await run('麦乐鸡 可乐');
  assert.ok(r.needsClarification);
  const options = r.needsClarification[0].options;
  assert.ok(options.includes('麦乐鸡4块') && options.includes('麦乐鸡5块'));
});

test('核价失败的方案标「无法确认」，不参与排名', async () => {
  const replay = createSource({ replayDir: FIX });
  let n = 0;
  const flaky = {
    mode: 'replay',
    call: (tool, args) => (tool === 'calculate-price' && n++ === 0 ? Promise.reject(new Error('核价超时')) : replay.call(tool, args)),
  };
  const normal = await run('麦辣鸡腿堡 中薯 中可乐');
  const r = await advise(flaky, { request: '麦辣鸡腿堡 中薯 中可乐', ...where });
  assert.equal(r.unknown.length, normal.unknown.length + 1);
  assert.ok(r.recommended.quote.status === 'verified');
  assert.ok(r.alternatives.every((c) => c.quote.status === 'verified'));
});

test('门店券：一单最多挂 1 张，挂在对应商品上并参与官方核价', async () => {
  const replay = createSource({ replayDir: FIX });
  const coupon = { couponId: 'C1', couponCode: 'X1', title: '测试券：麦辣鸡腿汉堡立减', products: [{ productCode: '1440' }] };
  const stub = {
    mode: 'replay',
    async call(tool, args) {
      if (tool === 'query-store-coupons') return { json: { success: true, data: [coupon] } };
      if (tool === 'calculate-price' && args.items.some((i) => i.couponId)) {
        assert.equal(args.items.filter((i) => i.couponId).length, 1);
        return { json: { success: true, traceId: 't', datetime: 'd', data: { price: 3600, originalPrice: 4600, discount: 1000, productList: [] } } };
      }
      return replay.call(tool, args);
    },
  };
  const r = await advise(stub, { request: '麦辣鸡腿堡 中薯 中可乐', ...where });
  const withCoupon = [r.recommended, ...r.alternatives].find((c) => c.lines.some((l) => l.couponId));
  assert.ok(withCoupon);
  assert.equal(withCoupon.lines.filter((l) => l.couponId).length, 1);
  assert.equal(withCoupon.lines.find((l) => l.couponId).productCode, '1440');
});

test('白名单：下单等工具根本发不出去；领券要显式开启', async () => {
  const neverFetch = () => { throw new Error('should not reach the network'); };
  const ro = createClient({ token: 'test', fetchImpl: neverFetch });
  await assert.rejects(ro.call('create-order', {}), /白名单/);
  await assert.rejects(ro.call('auto-bind-coupons', {}), /白名单/);
  await assert.rejects(ro.call('draw-lottery', {}), /白名单/);
  const rw = createClient({ token: 'test', allowWrite: true, fetchImpl: neverFetch });
  await assert.rejects(rw.call('create-order', {}), /白名单/);
});

test('名字归一：中薯 = 中薯条，中可乐 = 可乐中杯，5块麦乐鸡 = 麦乐鸡-5块', () => {
  assert.deepEqual(normalize('中薯'), normalize('中薯条'));
  assert.deepEqual(normalize('中可乐'), normalize('可乐中杯'));
  assert.deepEqual(normalize('5块麦乐鸡'), normalize('麦乐鸡-5块'));
  assert.deepEqual(normalize('麦辣鸡腿堡'), normalize('麦辣鸡腿汉堡'));
  assert.deepEqual(splitQty('2个麦辣鸡腿堡'), { text: '麦辣鸡腿堡', qty: 2 });
  assert.deepEqual(splitQty('中可乐x3'), { text: '中可乐', qty: 3 });
  assert.equal(diffCents('+ ¥1.5'), 150);
  assert.equal(diffCents('-¥0.5'), -50);
});

test('密钥扫描：要提交的文件里没有任何 Token / Key', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', ['scripts/check-secrets.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.match(out, /密钥扫描通过/);
});
