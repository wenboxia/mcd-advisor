<p align="center">
  <img src="docs/images/banner.png?v=2" alt="麦麦参谋 · 同一顿，换个买法" width="880">
</p>

<p align="center">
  <a href="#先看效果"><strong>先看效果</strong></a> &middot;
  <a href="#30-秒离线试用"><strong>30 秒试用</strong></a> &middot;
  <a href="#快速开始"><strong>快速开始</strong></a> &middot;
  <a href="#在-agent-里当-skill-用"><strong>Agent Skill</strong></a> &middot;
  <a href="#它怎么工作"><strong>怎么工作</strong></a> &middot;
  <a href="README.en.md"><strong>English</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/%E4%BB%B7%E6%A0%BC%E6%9D%A5%E6%BA%90-%E9%BA%A6%E5%BD%93%E5%8A%B3%E5%AE%98%E6%96%B9%E6%A0%B8%E4%BB%B7-DA291C" alt="价格来源：麦当劳官方核价">
  <a href="tests/advisor.test.mjs"><img src="https://img.shields.io/badge/%E7%A6%BB%E7%BA%BF%E6%B5%8B%E8%AF%95-24%20%E6%9D%A1%E9%80%9A%E8%BF%87-2E7D32" alt="离线测试 24 条通过"></a>
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-0-FFC72C" alt="零依赖">
  <img src="https://img.shields.io/badge/node-%E2%89%A518-3C873A" alt="Node ≥18">
  <a href="MCP_INTEGRATION.md"><img src="https://img.shields.io/badge/%E9%BA%A6%E5%BD%93%E5%8A%B3%20MCP-8%20%2F%2035%20%E4%B8%AA%E5%B7%A5%E5%85%B7-27251F" alt="麦当劳 MCP：8/35 个工具"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

# 麦麦参谋 · 同一顿，换个买法

**菜单显示 ¥28，为什么这次核价是 ¥57？**

你想吃的东西（餐品、规格、数量）**一样都不变**，麦麦参谋用**麦当劳官方核价**帮你核对这一顿怎么买更合适：分开点、套餐、随心配 1+1、门店券，挑出一个，并附上一张能核对的账单。省得下就告诉你怎么省，省不下就直说。

<table>
  <tr><td width="64"><b>场&#8288;景</b></td><td>点麦当劳之前，想知道「同样这些东西」怎么买更合适</td></tr>
  <tr><td width="64"><b>输&#8288;入</b></td><td>想吃什么（例：麦辣鸡腿堡 中薯 中可乐）+ 在哪（城市 + 地标，或 App 收藏门店）</td></tr>
  <tr><td width="64"><b>输&#8288;出</b></td><td>一个建议 + 少付多少 + 会员条件价的解释 + 可领券提醒 + 一张账单（门店、时间、逐行小计、核价编号）</td></tr>
  <tr><td width="64"><b>不&#8288;做</b></td><td>不下单、不替你换主食、不劝你多买、不推荐买会员卡、不承诺「全场最省」</td></tr>
</table>

## 先看效果

<p align="center">
  <img src="docs/images/cases.png?v=2" alt="三个真实案例：随心配省 ¥13.1；菜单 ¥28 的四件套不加卡要 ¥57；只要一个汉堡时保持原单" width="880">
</p>

<p align="center">
  <img src="docs/images/terminal.png?v=2" alt="终端输出：建议三件套 ¥33.5，比分开点少付 ¥12.5，并解释 ¥28 的四件套和可领券" width="760">
  <br><sub>离线回放 2026-10-21 晚在上海黄浦华旭国际大厦餐厅录下的官方返回（<code>fixtures/</code>，任何人都能复现）。价格因门店、时段而异，不是全国统一价。</sub>
</p>

这三个案例覆盖了三种结果：

| 你想吃 | 麦麦参谋的回答 | 依据 |
|---|---|---|
| 麦香鸡 + 中可乐 | 点**随心配 1+1**，¥13.9（分开点 ¥27.0） | 两样一样不少，官方核价 |
| 麦辣鸡腿堡 + 中薯 + 中可乐 | 点**三件套**，¥33.5（分开点 ¥46.0）；菜单上 ¥28 的四件套要随单加购麦金卡，不加卡 ¥57.0，加卡 ¥37.9（含 ¥9.9 卡费），而且会多一份麦乐鸡 | 每种买法都单独核价 |
| 只要一个麦辣鸡腿堡 | **保持原单**，¥22.5 | 套餐会多出薯条可乐，不算同一顿 |

**几个人一起点**：手机传一圈、大家把要的写进同一句话就行，它会算出合在一起怎么买更划算。比如三个人各要一个汉堡 + 中薯 + 中可乐：

```bash
node bin/mcd-advisor.mjs "巨无霸 板烧鸡腿堡 麦辣鸡腿堡 3个中薯 3杯中可乐" --city 上海市 --near 人民广场
```

建议点**巨无霸、板烧鸡腿堡、麦辣鸡腿汉堡三份三件套**，共 ¥104.5，分开点要 ¥142.0，少付 ¥37.5，同样有离线回放记录。它只回答「合在一起怎么买」，不做 AA 分账，谁付多少你们自己转就好。

## 30 秒离线试用

不需要 Token，也不需要装任何依赖，用的是录下来的真实官方返回：

```bash
git clone https://github.com/wenboxia/mcd-advisor.git
cd mcd-advisor
npm run demo
```

## 快速开始

1. 需要 Node.js 18+，零第三方依赖。
2. 在 [open.mcd.cn/mcp](https://open.mcd.cn/mcp) 用手机号登录 → 控制台 → 激活，拿到你自己的 MCP Token。
3. 把 Token 写进**仓库之外**的本机配置文件（格式见 [`.env.example`](.env.example)）：
   ```bash
   mkdir -p ~/.config/mcd-advisor && cp .env.example ~/.config/mcd-advisor/.env
   # 编辑 ~/.config/mcd-advisor/.env，填上 MCD_MCP_TOKEN
   ```
4. 问一句：
   ```bash
   node bin/mcd-advisor.mjs "麦辣鸡腿堡 中薯 中可乐" --city 上海市 --near 人民广场
   node bin/mcd-advisor.mjs "两个麦香鸡 两杯中可乐" --store 1450713 --json
   node bin/mcd-advisor.mjs "麦辣鸡腿汉堡三件套" --city 上海市 --near 人民广场   # 报套餐名也行，按默认搭配拆开比较
   ```
5. （可选）用一句大白话问：在配置文件里加上 `DEEPSEEK_API_KEY`。换成 Kimi、GLM 等兼容 OpenAI 接口的模型时，再设 `LLM_BASE_URL`（接口地址）和 `DEEPSEEK_MODEL`（模型名）：
   ```bash
   node bin/mcd-advisor.mjs --ask "中午想在上海人民广场吃个麦辣鸡腿堡，配中薯和可乐"
   ```
   模型只负责把这句话转成餐品清单，比价和核价仍然全部由代码完成。

| 选项 | 作用 |
|---|---|
| `--city` `--near` | 按城市 + 地标找最近的门店；都不填就用你在 App 里收藏的门店 |
| `--store` | 直接指定门店编号 |
| `--json` | 输出 JSON，给 Agent 或其他程序用 |
| `--claim` | 领取麦麦省可领券后重新核价。官方接口会**一次领取全部**可领券，所以脚本会先说明，并要你在终端里亲手输入 `y` |
| `--replay <dir>` | 用录好的数据离线运行 |

## 在 Agent 里当 Skill 用

本仓库就是一个 Agent Skill（[`SKILL.md`](SKILL.md)），可以放进 Claude Code、Codex 等支持 Skill 的工具：

```bash
# Claude Code
git clone https://github.com/wenboxia/mcd-advisor.git ~/.claude/skills/mcd-advisor
```

然后直接说「麦辣鸡腿堡加中薯中可乐，人民广场附近怎么买更划算」。

Skill 按**三层渐进式披露**组织：
1. frontmatter 里的说明负责触发；
2. `SKILL.md` 正文约 40 行，只放硬规则和流程；
3. `references/` 里的规则和排错文档在需要时才读。

宿主模型只负责问清楚要吃什么、运行脚本、把结果讲清楚，**价格一律来自脚本输出**。

## 它怎么工作

<p align="center">
  <img src="docs/images/flow.png?v=2" alt="它怎么工作：你说想吃什么 → 拆成具体食物 → 列出同一顿的所有买法 → 麦当劳官方核价 → 一个建议 + 一张账单；可领券标为待核验，会员条件价分别核价只解释" width="880">
</p>

- **同一顿，由代码判定**：每个方案拆开后，食物清单必须和你要的完全一致，多出一份薯条也不行。小杯和中杯算两种东西；「任选 3 份」这样的格子按份数算。买不到一模一样的一顿时会直说（例如某样东西只在会多出别的东西的套餐里卖）。
- **说不清就先问**：名字只有完全对上才直接用，「巨无霸大套餐」「鸡块」这种会先给你选项，不会悄悄换成别的东西。「学生专享」这类有资格限制的商品不会出现在方案里。
- **份数再多也是最优**：按剩余食物做动态规划，4 份、6 份照样能找到估算最省的组合，再交给官方核价。
- **价格只认官方**：菜单价只用来决定哪些方案值得送去核价，最终排序只看 `calculate-price` 的返回。价格分三种状态：✅ 已官方核价、🟡 待核验（券还没领，拿不到券号）、⚪ 无法确认。后两种不参与排名。
- **会员条件价讲清楚**：菜单 `discountType` 是「随单购…」的商品，分别核价「不加卡」和「加卡（含卡费）」，只解释，不推荐买卡。
- **快**：第一次查一家店要拉取全部菜单详情，实测约 7 秒；当天再查会用缓存，实测 1–2 秒。

用到哪些 MCP 工具、为什么不用另外 27 个、踩过哪些坑，见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)。

## 为什么敢让你相信这个结果

- **可复现**：`fixtures/` 里是 2026-10-21 晚真实查询录下的官方原始返回（已核对不含个人信息）。`npm test` 用它离线回放，24 条测试覆盖：
  - 换买法、随心配、份数、几个人一起点、保持原单、买不到一模一样；
  - 会员条件价、可领券、一单一券、核价失败；
  - 多份格子、4 份以上最优、有资格限制的商品、模糊名字先问、套餐名展开；
  - 指定门店、工具白名单、名字归一、密钥扫描。
- **可核对**：每次建议都附核价编号（官方 `traceId`）和逐行小计。
- **不夸大**：没有更合适的买法就说「保持原来的点法」。没领的券只标「待核验」，不拿来排名。

## 安全与隐私

- **默认只读**：工具调用走白名单。下单、取消、抽奖、积分兑换这些工具，即使被要求也发不出去（有测试覆盖）。
- **唯一的写操作是领券**：必须加 `--claim`，并在终端里亲手输入 `y`。非交互环境会直接拒绝。
- **密钥不出本机**：Token 和模型 Key 只放在 `~/.config/mcd-advisor/.env`，仓库里只有占位符。`npm run check-secrets` 会扫描所有要提交的文件，并逐字比对本机的真实密钥值；`npm test` 也会跑它。想在每次提交前自动检查，运行一次 `git config core.hooksPath .githooks`，之后 pre-commit 会扫描暂存区里实际要提交的内容。

## 已知限制

- 只支持到店自取（含堂食、外带取餐柜），暂不支持外送和得来速。
- 可领券在领取前拿不到券号，无法提前核价。官方领券接口一次领取全部，不能只领一张。
- 套餐里的口味特调（去酸黄瓜、少冰等）还没参与比较，默认按标准做法核价。
- 价格只代表那家店、那个时刻的官方报价，下单时以 App 为准。

## 项目信息

- 麦当劳程序员创意开发大赛参赛作品，**非麦当劳官方产品**。项目里没有使用麦当劳的商标图形。
- 报名 Issue：[M-China/mcd-developer-innovation-challenge#983](https://github.com/M-China/mcd-developer-innovation-challenge/issues/983)（官方已确认成功参赛）
- 参赛声明：[CONTEST_DECLARATION.md](CONTEST_DECLARATION.md) · MCP 接入说明：[MCP_INTEGRATION.md](MCP_INTEGRATION.md) · 配置示例：[mcp-config.example.json](mcp-config.example.json)
- 许可证：[MIT](LICENSE)

如果它帮你看清了某一顿的价格，欢迎点个 ⭐。
