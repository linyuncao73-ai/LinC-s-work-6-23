# 部署 & 安全配置

## 为什么改

Gemini key 以前通过 `vite.config.ts` 的 `define` 内联进前端 bundle，任何人打开
DevTools 看 JS 就能拿到 key 盗刷（曾发生过一次暴露事故）。现在 key 只存在于
Supabase Edge Function 的服务端 secret 里，前端只上传图片、拿回解析结果。

数据流：

```
浏览器 (上传图片 base64)
   │  supabase.functions.invoke("gemini-parse", { op, imageBase64, mimeType })
   ▼
Supabase Edge Function  gemini-parse   ← GEMINI_API_KEY 只在这里 (secret)
   │  调 Gemini Vision，返回结构化 JSON
   ▼
浏览器 (前端做 registry/ZONE_NAMES 映射 → RouteData)
```

---

## 照这个顺序做（首次部署）

### 0. ⚠️ 先吊销旧 Gemini key（最重要）

旧 key 在之前的 bundle 里泄露过，**必须作废重发**：
- 去 [Google AI Studio → Get API key](https://aistudio.google.com/apikey)（或 Google Cloud Console）
- 删除 / 吊销旧 key，新建一个 key
- 新 key **只**在第 2 步进 `supabase secrets`，**绝不**写进任何 `.env.local` / 代码 / 前端

### 1. 推送分支

```bash
cd "D:\claude stuff\LinC-dispatch"
git push -u origin feat/smart-dispatch-and-gemini-edge-fn
```
然后在 GitHub 开 PR 合并到 `main`（或本地 `git checkout main && git merge` 后再 push）。

### 2. 部署 Edge Function（需要你的 Supabase 登录）

前置：安装 [Supabase CLI](https://supabase.com/docs/guides/cli)（`npm i -g supabase` 或 scoop/brew）。

```bash
supabase login
supabase link --project-ref <你的-project-ref>          # ref 在 Supabase 项目 Settings → General

supabase secrets set GEMINI_API_KEY=<第0步新建的-key>    # 服务端 secret，不进前端
supabase functions deploy gemini-parse
```

### 3. 部署前端到 Vercel（根域名）

已定 **Vercel**，配置就绪：`vite.config.ts` `base='/'`、`vercel.json` 已配 SPA 回退。

1. [vercel.com](https://vercel.com) → New Project → 选这个 GitHub repo
2. Framework 会自动识别 Vite，Build = `npm run build`，Output = `dist`（`vercel.json` 已写好）
3. **Environment Variables** 里加两个（公开值，受 RLS 保护）：
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
4. Deploy → 拿到可分享给同事的 URL

> Cloudflare Pages 等价：Build `npm run build`、Output `dist`、同样两个环境变量；`vercel.json` 的 SPA 回退在 CF 上对应 `_redirects` 里 `/* /index.html 200`。

### 本地开发用的环境变量

复制 `.env.local.example` 为 `.env.local`（已被 gitignore），填同样两个值：
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```
没配也能跑——`supabaseClient.ts` 会回退 localStorage / 默认数据（见 console 警告）。

---

## 验证

- `npm run build` 后，bundle 里**不应**出现真实 Gemini key，也不应有 `GoogleGenAI` 类
  （已搬到 Edge Function）：`grep -c "GoogleGenAI" dist/assets/*.js` 应为 `0`。
- 资源路径应为 `/assets/...`（根域名）：`grep -o '/assets/[^"]*' dist/index.html`。
- 线上：上传一张取货表截图，「截图解析」应正常返回路线；Edge Function 日志在
  Supabase 控制台 → Edge Functions → gemini-parse → Logs 查看。
- 映射逻辑本地可单测（不需云端）：`node services/geminiMapping.test.ts`（17 项）。

---

## 备注

- `smart-dispatch/` 是**另一个独立 app**（运力感知重写版，纯前端 + localStorage），
  不依赖 Supabase / Gemini，暂不需要按上面部署。要跑只 `cd smart-dispatch && npm run build`。
- 若以后改回 GitHub Pages 子路径部署，把 `vite.config.ts` 的 `base` 改回
  `'/linc-s-work-6-23/'`。
