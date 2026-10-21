#!/usr/bin/env node
// 麦麦参谋 CLI: same meal, a better way to buy it.
//   mcd-advisor "麦辣鸡腿堡 中薯 中可乐" --city 上海市 --near 人民广场
//   mcd-advisor "麦香鸡 中可乐" --store 1450713 --json
//   mcd-advisor "麦辣鸡腿堡 中薯 中可乐" --replay fixtures/1450713     (offline, no token)
import { createInterface } from 'node:readline/promises';
import { loadEnv } from '../src/env.mjs';
import { createSource } from '../src/source.mjs';
import { advise } from '../src/advisor.mjs';
import { render } from '../src/format.mjs';
import { parseNaturalLanguage } from '../src/nl.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const BOOL = ['json', 'claim', 'help', 'ask'];
let request = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !BOOL.includes(argv[i - 1].slice(2)))).join(' ');

if (flag('help') || !request) {
  console.log(`麦麦参谋：想吃的一样不变，帮你核对这一顿怎么买更合适。

用法：
  mcd-advisor "麦辣鸡腿堡 中薯 中可乐" --city 上海市 --near 人民广场
  mcd-advisor "麦香鸡 中可乐" --store 1450713
选项：
  --city/--near   按城市 + 地标找最近的门店（不填就用你在 App 里收藏的门店）
  --store         直接指定门店编号
  --json          输出 JSON（给 Agent / 其他程序用）
  --claim         领取麦麦省全部可领券后重新核价（会先问你，输入 y 才执行）
  --ask           用一句大白话提问（需要 DEEPSEEK_API_KEY；换 Kimi/GLM 时再设 LLM_BASE_URL 和 DEEPSEEK_MODEL），例如：
                  mcd-advisor --ask "中午想在上海人民广场吃个麦辣鸡腿堡配中薯可乐"
  --replay <dir>  用录好的数据离线运行，不需要 Token`);
  if (!flag('help')) console.error('\n没有说要吃什么。');
  process.exit(flag('help') ? 0 : 1);
}

loadEnv();
const replayDir = opt('replay');
const withCity = (c) => (c && !/[市省区县]$/.test(c) && c.length <= 4 ? `${c}市` : c);
const params = { request, store: opt('store'), city: withCity(opt('city')), near: opt('near') };

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

try {
  if (flag('ask')) {
    const nl = await parseNaturalLanguage(request);
    params.request = nl.request;
    params.city ||= withCity(nl.city);
    params.near ||= nl.near;
    console.error(`我理解的是：${nl.request || '（没听出要吃什么）'}${params.near ? ` · ${params.city || ''}${params.near}附近` : ''}\n`);
  }
  if (params.near && !params.city && !params.store) throw new Error('只说了地标，还需要城市：加上 --city 上海市 这样的参数');
  let result = await advise(createSource({ replayDir, recordDir: opt('record') }), params);

  if (flag('claim') && !result.needsClarification) {
    if (replayDir) throw new Error('离线回放模式不能领券');
    const n = result.claimableCount;
    if (!n) console.error('现在没有可领的券。');
    else {
      console.error(`\n领券会调用麦当劳的「一键领券」，一次领取你账号里全部 ${n} 张可领券（不能只领一张）。`);
      if (!process.stdin.isTTY) throw new Error('领券必须在终端里亲手确认，当前不是交互终端，已取消。');
      if (await confirm('确定领取吗？输入 y 确认，其他任意键取消：')) {
        const writer = createSource({ allowWrite: true });
        await writer.call('auto-bind-coupons');
        console.error('已领取，重新查这家店能用的券并核价……\n');
        result = await advise(createSource({ recordDir: opt('record') }), params);
      } else console.error('已取消，没有领券。\n');
    }
  }

  if (flag('json')) console.log(JSON.stringify(result, null, 2));
  else console.log(render(result));
  // 0 = answered (check recommended / noPlan), 2 = needs clarification, 3 = no official price at all
  process.exit(result.needsClarification ? 2 : result.recommended || result.noPlan ? 0 : 3);
} catch (e) {
  console.error(`出错了：${e.message}${e.code === 'NO_TOKEN' ? '' : e.code ? `（${e.code}）` : ''}`);
  process.exit(1);
}
