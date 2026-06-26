<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# YOW Dispatch Assistant

司机排班调度软件。原为 AI Studio 导出，现迁移到 Claude Code 长期维护。

> ⚠️ **安全变更（重要）**：Gemini API key 不再放进前端。截图/e-binder 解析改为走
> Supabase Edge Function 代理（`supabase/functions/gemini-parse`），key 只作为
> 服务端 secret 存在。**不要再把 `GEMINI_API_KEY` 放进 `.env.local` 给前端用** ——
> 那样会重新暴露。详见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 本地运行

**前置：** Node.js

1. 安装依赖：`npm install`
2. 复制 `.env.local.example` 为 `.env.local`，填入 Supabase 项目的 URL 和 anon key
   （这两个是公开值，受 RLS 保护，可以进前端）。
3. 部署 Edge Function 并设置 Gemini key（见 [DEPLOYMENT.md](DEPLOYMENT.md)）。
   未配置时应用仍可运行，只是「截图解析」功能会报错提示。
4. 运行：`npm run dev`

## 构建

`npm run build` —— 一次性构建，产物在 `dist/`。**不要起 dev server 长时间挂着验证**。
