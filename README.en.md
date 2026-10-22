<p align="center">
  <img src="docs/images/banner.png?v=2" alt="McD Advisor · same meal, smarter way to buy" width="880">
</p>

<p align="center">
  <a href="https://wenboxia.github.io/mcd-advisor/"><strong>🍔 Try it online</strong></a> &middot;
  <a href="#what-it-looks-like"><strong>Demo</strong></a> &middot;
  <a href="#try-it-offline-in-30-seconds"><strong>Try offline</strong></a> &middot;
  <a href="#quick-start"><strong>Quick start</strong></a> &middot;
  <a href="#use-it-as-an-agent-skill"><strong>Agent Skill</strong></a> &middot;
  <a href="README.md"><strong>中文</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/prices-official%20calculate--price-DA291C" alt="prices from the official calculate-price">
  <a href="tests/advisor.test.mjs"><img src="https://img.shields.io/badge/offline%20tests-27%20passing-2E7D32" alt="27 offline tests"></a>
  <img src="https://img.shields.io/badge/dependencies-0-FFC72C" alt="zero dependencies">
  <img src="https://img.shields.io/badge/node-%E2%89%A518-3C873A" alt="Node ≥18">
  <a href="#use-it-as-an-agent-skill"><img src="https://img.shields.io/badge/Skill%20for-WorkBuddy%20%C2%B7%20Claude%20Code%20%C2%B7%20Codex-27251F" alt="Skill for WorkBuddy · Claude Code · Codex"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

# McD Advisor (麦麦参谋) · same meal, smarter way to buy

**The menu says ¥28, so why does checkout say ¥57?**

Tell it what you want to eat at McDonald's China: items, sizes, and quantities. Your meal stays exactly the same. McD Advisor lists the ways to buy that same meal at that store right now: separately, as a combo with official swaps, as a "1+1" pair, or with a store coupon. It sends the most promising few, plus your original order, to McDonald's own `calculate-price` tool, and ranks only officially priced options. You get **one** recommendation plus a receipt you can verify. When nothing beats your original order, it says so.

Built on the official McDonald's China MCP server for the McDonald's Developer Innovation Challenge. Not an official McDonald's product.

👉 **[Try it online](https://wenboxia.github.io/mcd-advisor/)** — no install, no token. All 249 combinations on the page were priced one by one by McDonald's official `calculate-price` at a real Shanghai store.

## What it looks like

<p align="center"><img src="docs/images/cases.png?v=2" alt="Three real cases" width="880"></p>
<p align="center"><a href="https://wenboxia.github.io/mcd-advisor/"><img src="docs/images/demo-page.png?v=1" alt="The online experience page: pick a meal, get one officially priced recommendation" width="880"></a><br><sub>The online experience page (click to open). Every price was returned by McDonald's official price check at a Shanghai store on 2026-10-22.</sub></p>

The cases above come from one real store in Shanghai (2026-10-21 and 2026-10-22). Prices vary by store and time of day.

| You want | Answer |
|---|---|
| McChicken + medium Coke | The "1+1" pair: **¥13.9**. Ordered separately: ¥27.0. |
| McSpicy burger + medium fries + medium Coke | The 3-piece combo: **¥33.5**. Ordered separately: ¥46.0. The ¥28 four-piece on the menu needs a membership card bought in the same order: ¥57.0 without it, or ¥37.9 including the ¥9.9 card. It also adds extra nuggets. |
| Just one McSpicy burger | **Keep it as is**: ¥22.5. A combo would add food you didn't ask for. |
| Three people, each a burger + medium fries + medium Coke | Put everything in one request: **three combos, ¥104.5**. Ordered separately: ¥142.0. It does not split the bill. |

## Try it offline in 30 seconds

No token and no dependencies needed. It replays recorded official responses:

```bash
git clone https://github.com/wenboxia/mcd-advisor.git && cd mcd-advisor && npm run demo
```

## Quick start

1. Install Node.js 18+.
2. Get your own MCP token at [open.mcd.cn/mcp](https://open.mcd.cn/mcp). Put it in `~/.config/mcd-advisor/.env`, which lives outside the repo; see [`.env.example`](.env.example).
3. Run:
   ```bash
   node bin/mcd-advisor.mjs "麦辣鸡腿堡 中薯 中可乐" --city 上海市 --near 人民广场
   ```
   Add `--json` for machine-readable output.

   Add `--ask "..."` for natural-language input. This needs `DEEPSEEK_API_KEY`. For Kimi, GLM or another OpenAI-compatible provider, also set `LLM_BASE_URL` and `DEEPSEEK_MODEL`. The model only turns your sentence into an item list; all pricing stays deterministic.

## Use it as an Agent Skill

The repository itself is a standard Skill ([`SKILL.md`](SKILL.md)). Install it in **WorkBuddy**, Claude Code, Codex or any host that supports Skills:

| Host | Install |
|---|---|
| **WorkBuddy** | Import the repository folder under 专家 · 技能 · 连接器 (Experts · Skills · Connectors), or clone it into WorkBuddy's skill folder (command below) and restart WorkBuddy |
| Claude Code | `git clone https://github.com/wenboxia/mcd-advisor.git ~/.claude/skills/mcd-advisor` |
| Codex and others | Put the repository in that host's Skill folder |

```bash
git clone https://github.com/wenboxia/mcd-advisor.git ~/.workbuddy/skills/mcd-advisor
```

On Windows, WorkBuddy's skill folder is `%USERPROFILE%\.workbuddy\skills\`.

Token: if you already set up the McDonald's MCP connector in WorkBuddy, nothing else is needed. The script reuses that token from your local WorkBuddy config, read-only. With other hosts, put it in `~/.config/mcd-advisor/.env`.

The host model asks what you want, runs the script and explains the result. The script talks to the official McDonald's MCP server directly, so prices always come from the official `calculate-price`.

## How it stays honest

- **"Same meal" is checked in code.** Every option must contain exactly the requested foods, no more and no less. A small Coke is not a medium Coke, and "pick 3 snacks" slots count as 3 units. Vague names are asked back, never swapped silently.
- **Official prices only.** Menu prices only decide which options are worth checking; the ranking uses `calculate-price`. Unclaimed coupons are marked "pending" and never ranked.
- **Read-only by default.** Tool calls go through a whitelist. Placing orders and drawing lotteries are impossible. Claiming coupons (`--claim`) claims all available coupons at once, so it asks you to type `y` in a real terminal first.
- **Secrets stay local.** `npm run check-secrets` scans every file to be committed and compares it against your real local token values.

<p align="center"><img src="docs/images/flow.png?v=3" alt="How it works" width="880"></p>

Tool choices, call flow and pitfalls are in [MCP_INTEGRATION.md](MCP_INTEGRATION.md). License: [MIT](LICENSE).

Contest registration: [M-China/mcd-developer-innovation-challenge#983](https://github.com/M-China/mcd-developer-innovation-challenge/issues/983) (accepted).
