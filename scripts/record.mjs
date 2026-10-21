#!/usr/bin/env node
// Records read-only MCP responses for one store into _local/recordings/<storeCode>/ (gitignored).
// Usage: node scripts/record.mjs --city 上海市 --keyword 人民广场 [--store 1450713]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env.mjs';
import { createClient } from '../src/mcp.mjs';

loadEnv();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const city = arg('city', '上海市');
const keyword = arg('keyword', '人民广场');
const mcp = createClient();

const save = (dir, name, args, res) =>
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ args, text: res.text }, null, 1));

const stores = await mcp.call('query-nearby-stores', { searchType: 2, city, keyword, beType: 1 });
const storeCode = arg('store', stores.json.data[0].storeCode);
const dir = join('_local', 'recordings', storeCode);
mkdirSync(dir, { recursive: true });
save(dir, 'query-nearby-stores', { searchType: 2, city, keyword, beType: 1 }, stores);

const base = { storeCode, orderType: 1, beType: 1 };
save(dir, 'now-time-info', {}, await mcp.call('now-time-info'));
const meals = await mcp.call('query-meals', base);
save(dir, 'query-meals', base, meals);
save(dir, 'query-store-coupons', base, await mcp.call('query-store-coupons', base));
save(dir, 'available-coupons', {}, await mcp.call('available-coupons'));

const codes = Object.keys(meals.json.data.meals);
let done = 0, failed = 0;
const queue = codes.filter((c) => !existsSync(join(dir, `query-meal-detail__${c}.json`)));
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const code = queue.shift();
    try {
      save(dir, `query-meal-detail__${code}`, { ...base, code }, await mcp.call('query-meal-detail', { ...base, code }));
      done++;
    } catch (e) {
      failed++;
      console.error(`detail ${code} failed: ${e.message}`);
    }
  }
}));
console.log(`store ${storeCode}: menu ${codes.length} items, details fetched ${done} (skipped ${codes.length - done - failed - queue.length}), failed ${failed} -> ${dir}`);
