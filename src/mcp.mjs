// Minimal McDonald's China MCP client (Streamable HTTP, stateless) with a tool whitelist.
// Every tool response from mcp.mcd.cn is Markdown with the raw JSON after "Original Response";
// we extract that JSON so no price ever has to be read by a language model.

export const READ_TOOLS = new Set([
  'now-time-info',
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'query-store-coupons',
  'available-coupons',
  'calculate-price',
]);
export const WRITE_TOOLS = new Set(['auto-bind-coupons']);

const ENDPOINT = process.env.MCD_MCP_URL || 'https://mcp.mcd.cn';

export class McpError extends Error {
  constructor(message, { code, tool, traceId } = {}) {
    super(message);
    this.code = code;
    this.tool = tool;
    this.traceId = traceId;
  }
}

// Returns the first balanced JSON object starting at `start`, respecting strings.
export function extractJson(text, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

// Parses a tool's text payload into { json, text }. `json` is null for Markdown-only tools.
export function parseToolText(text) {
  const anchor = text.indexOf('{"success"');
  const json = anchor >= 0 ? extractJson(text, anchor) : null;
  return { json, text };
}

const BUSY = /太火爆|稍后再试/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ token = process.env.MCD_MCP_TOKEN, allowWrite = false, fetchImpl = fetch } = {}) {
  if (!token) throw new McpError('缺少麦当劳 MCP Token：请在 ~/.config/mcd-advisor/.env 里设置 MCD_MCP_TOKEN', { code: 'NO_TOKEN' });
  let id = 0;

  async function call(tool, args = {}) {
    const allowed = READ_TOOLS.has(tool) || (allowWrite && WRITE_TOOLS.has(tool));
    if (!allowed) throw new McpError(`工具不在白名单内：${tool}`, { code: 'NOT_ALLOWED', tool });

    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: tool, arguments: args } }),
      });
      if (res.status === 401) throw new McpError('Token 无效或已过期：去 open.mcd.cn 控制台重新激活', { code: 401, tool });
      if (res.status === 429) {
        if (attempt >= 3) throw new McpError('请求太快被限流（600 次/分钟）', { code: 429, tool });
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new McpError(`MCP HTTP ${res.status}`, { code: res.status, tool });

      let body = await res.text();
      const dataLine = body.split('\n').find((l) => l.startsWith('data:'));
      if (dataLine) body = dataLine.slice(5);
      const rpc = JSON.parse(body);
      if (rpc.error) throw new McpError(rpc.error.message || 'MCP 错误', { code: rpc.error.code, tool });
      const text = (rpc.result?.content || []).map((c) => c.text || '').join('\n');
      const parsed = parseToolText(text);
      if (rpc.result?.isError || (parsed.json && parsed.json.success === false)) {
        const j = parsed.json || {};
        const message = j.message || text.slice(0, 200);
        // Server-side surge protection answers "太火爆了，请稍后再试" with HTTP 200; back off and retry.
        if (BUSY.test(message) && attempt < 4) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        throw new McpError(message, { code: j.code, tool, traceId: j.traceId });
      }
      return parsed;
    }
  }

  return { call };
}
