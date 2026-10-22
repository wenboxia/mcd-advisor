#!/usr/bin/env node
// Refuses to pass if anything that would be committed contains a secret.
//   node scripts/check-secrets.mjs           scan tracked + untracked (not ignored) files in the working tree
//   node scripts/check-secrets.mjs --staged  scan exactly what is staged (used by .githooks/pre-commit)
// Checks generic token patterns AND the exact values of your local secrets, so real secrets never
// have to be written into this script.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { ENV_FILE, parseEnvFile, workbuddyToken } from '../src/env.mjs';

const staged = process.argv.includes('--staged');
const git = (...args) => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 64 << 20 });

const files = staged
  ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').toString().split('\0').filter(Boolean)
  : git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter((f) => f && existsSync(f) && statSync(f).isFile());
const read = (f) => (staged ? git('show', `:${f}`) : readFileSync(f));

const SECRET_NAME = /(TOKEN|KEY|SECRET)/;
const fromFile = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, 'utf8')) : {};
const values = new Map();
for (const [name, value] of [...Object.entries(fromFile), ...Object.entries(process.env)]) {
  if (SECRET_NAME.test(name) && /(MCD|DEEPSEEK|LLM|OPENAI|KIMI|GLM|MOONSHOT|ZHIPU)/.test(name) && value && value.length >= 12) values.set(value, name);
}
const wb = workbuddyToken();
if (wb && wb.length >= 12) values.set(wb, 'WorkBuddy 麦当劳连接器 Token');
const empties = Object.entries(fromFile).filter(([n, v]) => SECRET_NAME.test(n) && (!v || v.length < 12)).map(([n]) => n);

const patterns = [
  { name: 'DeepSeek/OpenAI 风格 Key', re: /sk-[A-Za-z0-9]{24,}/ },
  { name: 'Bearer 真实 Token', re: /Bearer\s+(?!\$\{)[A-Za-z0-9]{24,}/ },
  { name: '环境变量里的真实值', re: /(MCD_MCP_TOKEN|DEEPSEEK_API_KEY)\s*=\s*["']?(?!your-)[A-Za-z0-9-]{16,}/ },
];

const hits = [];
for (const f of files) {
  const buf = read(f);
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  for (const p of patterns) if (p.re.test(text)) hits.push(`${f}: ${p.name}`);
  for (const [value, name] of values) if (text.includes(value)) hits.push(`${f}: 含有本机 ${name} 的真实值`);
}

if (hits.length) {
  console.error('❌ 发现疑似密钥，已阻止：\n' + hits.map((h) => `  ${h}`).join('\n'));
  process.exit(1);
}
if (empties.length) console.error(`⚠️ 本机配置里这些项为空或过短，没法逐字比对：${empties.join(', ')}`);
console.log(`✅ 密钥扫描通过：${staged ? '暂存区' : '工作区'} ${files.length} 个文件，并逐字比对了本机 ${values.size} 个真实密钥值`);
