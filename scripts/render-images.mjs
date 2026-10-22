#!/usr/bin/env node
// Renders README images from docs/design/*.html with local headless Chrome.
// The terminal screenshot is generated from a real (replayed) run, so it always matches the code.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(new URL('..', import.meta.url).pathname);
mkdirSync(`${root}/docs/images`, { recursive: true });

const cmd = '麦辣鸡腿堡 中薯 中可乐';
const out = execFileSync('node', ['bin/mcd-advisor.mjs', cmd, '--city', '上海市', '--near', '人民广场', '--replay', 'fixtures/shanghai-1450713'], { cwd: root, encoding: 'utf8' })
  .replace(/用时 [\d.]+ 秒 · /, ''); // replay timing is meaningless; don't show a made-up number
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const colored = esc(out).split('\n').map((l) => {
  if (l.startsWith('✅')) return `<span class="ok">${l}</span>`;
  if (l.includes('⚠️')) return `<span class="warn">${l}</span>`;
  if (l.includes('🟡')) return `<span class="pend">${l}</span>`;
  if (l.startsWith('账单') || l.startsWith('麦麦参谋')) return `<span class="head">${l}</span>`;
  if (l.startsWith('找到')) return `<span class="dim">${l}</span>`;
  return l;
}).join('\n');
const lines = out.split('\n').length + 2;
const height = 130 + lines * 33;
writeFileSync(`${root}/docs/design/terminal.html`, `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Noto+Sans+SC:wght@400;700&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1500px;height:${height}px;background:#FFF3D6;padding:34px;font-family:"JetBrains Mono","Noto Sans SC",monospace}
.win{background:#1E1B16;border-radius:16px;box-shadow:0 24px 50px rgba(0,0,0,.28);overflow:hidden;height:100%}
.bar{height:46px;background:#2B2721;display:flex;align-items:center;gap:10px;padding:0 18px}.bar i{width:14px;height:14px;border-radius:50%;display:inline-block}
.bar span{margin-left:14px;color:#a8a08d;font-size:16px}pre{padding:22px 28px;color:#EDE6D6;font-size:20px;line-height:33px;white-space:pre-wrap;font-family:inherit}
.p{color:#FFC72C}.ok{color:#7BD88F;font-weight:700}.warn{color:#FFB547}.pend{color:#FFD866}.head{color:#FF8A75;font-weight:700}.dim{color:#8f8774}</style></head>
<body><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>mcd-advisor</span></div>
<pre><span class="p">$</span> mcd-advisor "${cmd}" --city 上海市 --near 人民广场
${colored}</pre></div></body></html>`);

const shots = [
  ['banner', 1760, 640],
  ['cases', 1760, 820],
  ['flow', 1760, 980],
  ['terminal', 1500, height],
];
for (const [name, w, h] of shots) {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--force-device-scale-factor=2',
    '--virtual-time-budget=8000', `--screenshot=${root}/docs/images/${name}.png`, `file://${root}/docs/design/${name}.html`], { stdio: 'ignore' });
  console.log(`docs/images/${name}.png`);
}
