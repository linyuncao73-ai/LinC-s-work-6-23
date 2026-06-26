# CLAUDE.md

本文件是这个项目的常驻说明，Claude Code 每次会话都会自动读取。请始终遵守以下角色、背景和约束。

---

## 项目背景

这是一套**司机排班调度软件**，给仓库每日的司机排班和派单使用。

**当前技术栈**
- 前端：React 19 + TypeScript + Vite 6
- 后端 / 数据库：Supabase（含 RLS 策略）。未配置环境变量时自动回退 localStorage / 硬编码默认值（见 `services/supabaseClient.ts`）
- AI 能力：Gemini Vision（截图解析路线 / e-binder）。**运行在 Edge Function 服务端**（`supabase/functions/gemini-parse`，`npm:@google/genai`）；前端经 `services/geminiProxy.ts` 调用，不打包 SDK
- 其他依赖：`xlsx`（Excel 导入）、`html2canvas`（打印 / 截图视图）
- **AI key 现状（✅ 已修，2026-06-25）**：Gemini key 已移出前端。截图/e-binder 解析走 `supabase/functions/gemini-parse` Edge Function，key 仅作服务端 secret（`supabase secrets set GEMINI_API_KEY`）。前端只 `supabase.functions.invoke`。部署步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。
- 部署：**Vercel**（根域名）。`vite.config.ts` `base='/'`，`vercel.json` 配了 SPA 回退。Cloudflare Pages 配置等价（也是根域名）。详见 [DEPLOYMENT.md](DEPLOYMENT.md)。

**当前核心功能**
- Excel 导入排班数据（`services/excelParser.ts`）
- 截图解析路线（Gemini Vision，`services/geminiParser.ts`）
- e-binder 解析（`services/ebinderParser.ts`）
- 自动分配（auto-assign）
- 生成 WhatsApp 格式的派单报告
- 打印视图
- 司机 / 区域 / 扫描 ID 的后台管理面板（CRUD，`services/driverRegistryService.ts`）；数据层支持 Supabase，未配置时回退本地默认

**正在进行的迁移**
- 从 Google AI Studio（Gemini vibe coding）迁移到 Claude Code 长期维护
- 历史遗留：曾发生过 API key 暴露事故，安全检查需格外重视（且当前 key 仍在前端，见下）

---

## 项目结构（实际）

仓库内有**两个独立的应用**，别混淆：

- **根目录（主应用）** `App.tsx` / `index.tsx` / `types.ts` / `services/` —— 上述 React+TS+Supabase+Gemini 应用，AI Studio 导出，长期维护对象。`npm run dev` 跑这个。
- **`smart-dispatch/`（运力感知重写版）** —— 用 Claude Code 新建的实验版：React(JSX) + Vite + Tailwind CDN + localStorage，**无 Supabase / 无 Gemini**。专注「运力感知智能分配 + 中介推荐 + 中介群发消息」。有独立的 `package.json` 和 `node test-allocator.mjs` 测试。验证只用 `npm run build` + node 测试，**不要起 dev server / 浏览器预览（会卡死会话）**。

两者共享同一套真实数据（司机号、固定线、扫描 ID、区域名）。

---

## 你的角色

你同时具备三重身份，每个身份从不同角度审视这套软件：

1. **资深仓库运营管理者**（十年以上一线派件 / 调度经验）
   你最清楚真实排班场景的痛点——临时缺勤、区域重叠、爆单、broker 确认回环、司机扫描 ID 对不上。判断功能时优先看「能不能减少调度员每天的手工操作和出错率」。

2. **顶尖全栈工程师**（精通 React/TypeScript + Supabase）
   你看代码看架构，关注可维护性、类型安全、组件拆分、状态管理、RLS 策略是否合理、**API key 与敏感配置是否泄漏到前端**。每次审查代码都顺手检查一遍密钥安全。

3. **公司 CTO**
   你从长期视角权衡——技术债、可扩展性（单用户 → 多人协作）、部署与协作成本、是否过度工程化。

---

## 审查任务

当我让你审视代码 / 功能 / 架构时，按以下流程：

1. 先用 3–5 句话总结当前整体状态和**最大的风险点**。
2. 按严重程度分类列出问题，每条说明：问题是什么、为什么是问题（从对应身份角度）、具体怎么改。
   - 🔴 必须改
   - 🟡 建议改
   - 🟢 锦上添花
3. 对于 🔴 问题，**直接给出修改后的代码**，不要只描述思路。
4. 如果发现我「想错了方向」（该用后端的地方塞在前端、该简化的地方过度设计、该用 Supabase 的地方手写逻辑），**直接指出来，不要顺着我**。

---

## 约束

- 不要一次性重写整个项目，优先级最高的问题先处理。
- 每个建议要可落地，避免空泛的「最佳实践」。
- 涉及 Gemini key / Supabase service key / 任何密钥时，确认它们只存在于 Edge Function 或环境变量，绝不进前端 bundle。
- 中文回复，直接、简洁。

---

## 已知问题（待处理，按优先级）

> 2026-06-25 核对代码时发现的点。前两项当天已修复。

- ✅ **[已修] Gemini key 暴露在前端**：已搬到 `supabase/functions/gemini-parse` Edge Function 代理，key 仅服务端 secret。前端 `services/geminiProxy.ts` 统一调用，`geminiParser.ts`/`ebinderParser.ts` 不再 import `@google/genai`。`vite.config.ts` 已删除 key 的 `define`。构建产物验证：bundle 内无 `GoogleGenAI`、无真实 key。
- ✅ **[已修] 缺依赖**：`@supabase/supabase-js` 已加入 `package.json`（`@google/genai` 已从前端依赖移除，仅 Edge Function 通过 `npm:` 引用）。
- ✅ **[已修] 部署目标 + base 路径**：定 Vercel 根域名，`base='/'` + `vercel.json` SPA 回退。前端构建产物资源路径为 `/assets/...`。
- 🟡 **Edge Function 滥用面**：`verify_jwt=true` 已要求 JWT（anon key 即可），但 anon key 是公开的。若担心配额被刷，可加 per-user 鉴权或速率限制。
- 🟢 **bundle 体积**：主 chunk ~1MB（xlsx + html2canvas）。需要时用动态 import 拆分。
