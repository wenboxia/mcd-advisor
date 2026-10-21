// Data source: live MCP calls (optionally recording), or replay from a recorded directory.
// Replay makes every test and demo reproducible without a token.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createClient, parseToolText } from './mcp.mjs';

const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
      : JSON.stringify(v);
export const requestKey = (tool, args) => `${tool}__${createHash('sha1').update(stable(args)).digest('hex').slice(0, 12)}`;

// Recorded files are either "<tool>.json", "query-meal-detail__<code>.json" (from scripts/record.mjs)
// or "<tool>__<hash>.json" (generic). All contain { args, text }.
function loadRecordings(dir) {
  const byKey = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const { args, text } = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const tool = f.replace(/\.json$/, '').split('__')[0];
    byKey.set(requestKey(tool, args), text);
  }
  return byKey;
}

export function createSource({ replayDir, recordDir, allowWrite = false } = {}) {
  if (replayDir) {
    const rec = loadRecordings(replayDir);
    return {
      mode: 'replay',
      async call(tool, args = {}) {
        const text = rec.get(requestKey(tool, args));
        if (text === undefined) {
          const err = new Error(`回放数据里没有这次请求：${tool}`);
          err.code = 'NO_RECORDING';
          throw err;
        }
        const parsed = parseToolText(text);
        if (parsed.json && parsed.json.success === false) {
          const err = new Error(parsed.json.message);
          err.code = parsed.json.code;
          throw err;
        }
        return parsed;
      },
    };
  }
  const client = createClient({ allowWrite });
  if (recordDir) mkdirSync(recordDir, { recursive: true });
  return {
    mode: 'live',
    async call(tool, args = {}) {
      const res = await client.call(tool, args);
      if (recordDir && tool !== 'auto-bind-coupons') {
        const file = join(recordDir, `${requestKey(tool, args)}.json`);
        if (!existsSync(file)) writeFileSync(file, JSON.stringify({ args, text: res.text }, null, 1));
      }
      return res;
    },
  };
}
