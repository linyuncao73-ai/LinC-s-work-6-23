# YOW 司机派单助手 — 项目交接主文档

> 最后更新：2026-07-20 ｜ 维护者：Lin
> 这是接手本项目的第一份必读文档。深入细节见 `docs/` 目录。

一句话概括：**给 UniUni YOW（渥太华）hub 调度员用的每日派单网页工具**。晚上排第二天的班（导入取货表 → 自动派司机 → off/换人/拆线给中介 → 发 WhatsApp 报告 → 回填公司系统），数据通过 Supabase 在同事间云同步。

线上地址：<https://linyuncao73-ai.github.io/LinC-s-work-6-23/>

---

## ⚠️ 先纠正三个常见误解

接手前请注意，本项目的真实架构与一些人的预期不同：

1. **没有后端服务器，也没有 Edge Function / API 代理。** 前端是纯静态页面，直接从浏览器调用 Supabase 的 REST API（`/rest/v1/…`）。所有"业务逻辑"都跑在浏览器里。
2. **不部署在 Vercel / Cloudflare。** 部署方式是 **GitHub Actions 构建 → 推到 `gh-pages` 分支 → GitHub Pages 托管**。见下方「部署流程」。
3. **Gemini AI 不是主流程，只是兜底。** 日常 99% 操作是本地纯规则解析（瞬时、离线、不花钱）。只有「上传截图导入」和「中介反馈本地规则全部失配」两种情况才会调用 Gemini，需要 API key。见 `docs/隐藏逻辑与业务规则.md`。

---

## 技术栈

| 层 | 用什么 |
|----|--------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6（`base: './'` 相对路径，因为部署在子路径） |
| 样式 | Tailwind（**CDN 引入**，见 `index.html`，非 PostCSS 构建） + Font Awesome CDN |
| 图标字体 | Font Awesome 6.4 CDN |
| AI | `@google/genai`（Gemini），仅兜底 |
| 云存储 | Supabase（Postgres + REST + 匿名 RLS），前端直连 |
| Excel 解析 | `xlsx`（SheetJS） |
| 测试 | Vitest（`npm test`，65 个用例） |
| 部署 | GitHub Actions → gh-pages → GitHub Pages |

依赖见 `package.json`。无 Redux/路由库——全局状态就是 `App.tsx` 里的一堆 `useState`；"页面"用一个 `view` 字符串切换，不是真正的路由。

---

## 前端结构

**几乎所有 UI 和状态都在 `App.tsx` 一个文件里**（约 2700 行）。这是本项目最大的技术债（见 `docs/已知问题与技术债.md`），但也意味着改动集中、好定位。

`App.tsx` 里的主要组件（都在同一文件顶层定义）：

| 组件 | 作用 |
|------|------|
| `App` | 根组件，持有全部状态、所有 handler、顶栏、`view` 切换 |
| `MainEditor` | 主表格（Editor 页）：路线逐行编辑、拆线、改派、Hold 建议条 |
| `AvailabilityPanel` | 勾选明天 off 的司机 |
| `SplitModal` | 拆线弹窗（司机保留量 vs 剪给中介，含数量实时提醒） |
| `ReassignModal` | off 司机快速换人 |
| `FeedbackModal` | 粘贴中介反馈 → 预览"改前→改后" → 套用 |
| `PasteTableModal` | 粘贴取货表文本导入（推荐路径） |
| `AllocationSummaryView` | Allocations 页：生成分配区间串、顺序复制回填公司系统 |
| `WhatsAppReports` / `AgencyReport` | Reports 页：每个团队一张卡片，生成并复制/发送 WhatsApp 报告 |
| `DriversView` | Drivers 页：司机名册增删改、临时司机批准、中介群链接、Update 上传云端 |
| `HistoryModal` | 每日历史存档翻看/恢复 |
| `PrintView` | 打印视图 |
| `ApiKeyModal` | 设置 Gemini API key + 团队口令 |

**纯逻辑抽在 `services/` 和 `types.ts`**（这些有单测，改这里最安全）：

| 文件 | 职责 |
|------|------|
| `types.ts` | 所有类型 + **业务常量**（名册、占位符映射、区域名、扫描号、时间段、门槛）+ 日期工具 |
| `services/cloudSync.ts` | Supabase 读写：快照/名册/临时司机/每日存档，加解密封装 |
| `services/snapshotCrypto.ts` | AES-GCM 加密（团队口令派生密钥） |
| `services/geminiClient.ts` | Gemini 调用 + 多模型重试链 |
| `services/geminiParser.ts` | 截图导入（AI）+ 共享的 `buildRoutesFromRows`（行→路线展开） |
| `services/textTableParser.ts` | 粘贴文本导入（纯规则，推荐路径） |
| `services/feedbackParser.ts` | 中介反馈解析（本地规则优先 + AI 兜底）+ 套用逻辑 |
| `services/ebinderParser.ts` | E-binder 截图解析（**已废弃**，司机请假改纯手动，代码保留未删） |
| `services/excelParser.ts` | Excel 上传导入 |
| `services/holdSuggestions.ts` | Hold 建议门槛规则 |
| `services/apiKey.ts` | Gemini key 的 localStorage 存取 |

---

## Supabase 表结构

项目只用**一张表**：`dispatch_snapshots`

```sql
create table dispatch_snapshots (
  id         text primary key,
  data       jsonb,
  updated_at timestamptz
);
-- 匿名可读写（RLS 开放）。安全性靠可选的团队口令加密，见下。
```

这张表用 `id` 当"命名空间"，存放 4 类行：

| id | 内容 | 谁写 |
|----|------|------|
| `yow-main` | 当前排班快照（routes + batchInfo + registry + …） | 点 ☁↑ 保存 |
| `yow-roster` | 已批准的正式名册（registry）+ 删除墓碑 + 中介群链接 teamContacts | Drivers 页点 Update（需密码，问维护者） |
| `yow-pending` | 临时司机（temp）+ 删除墓碑 deleted | 自动同步（1 秒防抖，无需密码） |
| `yow-day-YYYY-MM-DD` | 每日历史存档（一天一行，upsert） | 每次 ☁↑ 保存时自动存一份 |

**加密**：如果设置了「团队口令」（localStorage `team_passcode`），`data` 存的是 `{v:2, salt, iv, ct}` 密文（PBKDF2 100k 轮 + AES-GCM）；没设口令就存明文 JSON。因为匿名 key 是公开的，口令是唯一真正的保护。**同一团队所有人必须用同一个口令，否则互相解不开。**

连接信息（**可安全公开**，硬编码在 `services/cloudSync.ts` 顶部）：
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`（匿名 publishable key，配合 RLS 使用，公开无妨）

> 想换 Supabase 项目：改 `cloudSync.ts` 顶部两个常量即可；或在浏览器 localStorage 存 `supabase_config`（`{url, key}` JSON）临时覆盖，不用重新部署。

---

## 部署流程（真实）

**自动部署，推代码即发布**。配置在 `.github/workflows/deploy.yml`：

1. 向 `main` 或 `claude/scheduling-system-improvements-pf3cni` 分支 push（或手动 workflow_dispatch）
2. GitHub Actions：`npm ci` → `npm test`（**测试不过会中止部署**）→ `npm run build`
3. `JamesIves/github-pages-deploy-action` 把 `dist/` 推到 `gh-pages` 分支
4. GitHub Pages 从 `gh-pages` 分支托管，约 1–2 分钟生效

关键细节：
- **`clean: false`**（workflow 里）：保留旧的带 hash 的 chunk 文件。部署瞬间已打开页面的用户还能懒加载旧模块，不会白屏。
- **`index.tsx` 里监听 `vite:preloadError`**：老页面加载已删除的 chunk 时自动刷新一次（60 秒内不重复刷），避免"Failed to fetch dynamically imported module"。
- GitHub 仓库设置里 Pages 的 source 必须选 `gh-pages` 分支（一次性设置，已配好）。

**本地开发**：
```bash
npm install
npm run dev      # localhost:3000
npm test         # 跑测试
npm run build    # 本地构建到 dist/
```

---

## 环境变量清单（只列变量名和用途）

本项目**几乎不依赖环境变量**——密钥要么是公开的、要么存在用户浏览器里。

| 变量名 | 用途 | 何时需要 |
|--------|------|----------|
| `GEMINI_API_KEY` | 构建时注入到 `process.env.API_KEY`，作为 Gemini key 的兜底来源 | 可选，一般不设。见下 |

**重要**：Gemini API key 的**主来源不是环境变量**，而是每个用户在页面右上角钥匙图标里填入、只存自己浏览器 localStorage（键名 `gemini_api_key`）。这样 key 永远不进代码仓库、不进构建产物。

> ⚠️ **绝对不要把真实 Gemini key 写进代码、`.env`、聊天记录或提交历史**——本项目历史上已因 key 泄露被 Google 作废过一次。GitHub 的 push protection 也会拦截。key 轮换步骤见 `docs/维护操作指南.md`。

Supabase 的 URL 和匿名 key 是硬编码的公开值（配合 RLS），不算敏感环境变量。

`.gitignore` 已排除 `node_modules`、`dist`、`*.local`（含 `.env.local`）。

---

## localStorage 键一览

前端状态大量落在浏览器 localStorage（换电脑不会带走，靠云同步补齐）：

| 键 | 内容 |
|----|------|
| `yow_dispatch_routes` / `yow_dispatch_batch` | 当前路线表 / 批次信息 |
| `yow_dispatch_registry` | 司机名册（含临时司机） |
| `yow_dispatch_ebinder` / `yow_dispatch_overrides` | E-binder 数据 / 手动 off 覆盖（多为废弃遗留） |
| `yow_dispatch_deleted` | 正式司机删除墓碑 |
| `yow_temp_deleted` | 临时司机删除墓碑（同步到 yow-pending） |
| `yow_team_contacts` | 中介 WhatsApp 群链接（本地缓存，随名册同步） |
| `yow_roster_dirty` | 名册有未上传改动的标记 |
| `yow_cloud_seen` | 上次见到的云端时间戳（冲突提示用） |
| `gemini_api_key` | 用户的 Gemini API key |
| `team_passcode` | 团队加密口令 |
| `supabase_config` | 可选：覆盖 Supabase 连接 |

---

## docs/ 目录

- **`docs/隐藏逻辑与业务规则.md`** — Auto-Assign 默认司机映射、WhatsApp 报告格式约定、日期/批次逻辑、拆线与 Hold 规则、名册优先级等"只有维护者知道"的约定。**接手必读。**
- **`docs/维护操作指南.md`** — **第 0 节是给调度员/同事的每晚排班 SOP**（导入取货表→Auto-Assign→拆线→报告→反馈→回填保存，含 2026-08 改版后的两页粘贴导入）；之后是维护者改代码的分步指南：加司机、改路线配置、加司机字段、Gemini key 轮换、换 Supabase 项目、改团队口令。
- **`docs/已知问题与技术债.md`** — 已知 bug、未完成功能、技术债，按优先级排序。

---

## 接手第一步建议

1. `npm install && npm run dev` 跑起来，对着线上版点一遍晚上排班流程。
2. 读 `docs/隐藏逻辑与业务规则.md`——不懂那些常量映射，改任何东西都会踩坑。
3. 改 `services/` 和 `types.ts` 里的逻辑时**先跑 `npm test`**；这些有单测保护。改 `App.tsx` 的 UI 没有测试，靠手点验证。
4. 任何改动 push 到部署分支就会自动上线，**没有预发环境**——重要改动先本地 `npm run build` 确认无误。
