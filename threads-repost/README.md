# 🧵 Threads 串文转发（后端爬取 → 静态资源）· HANDOVER

> 动态中一键转发 Threads 串文：后端爬取内容 → 静态 JSON 资源 → 自绘卡片渲染
> 状态：方案与爬虫脚本就绪（需登录 Cookie 部署验证）· 本地文件夹
> 最后更新：2026-08-11

---

## 0. 速览

| 项 | 值 |
|----|-----|
| 位置 | `threads-repost/`（仓库根，独立文件夹） |
| 方案 | 后端爬虫（携带 Threads 登录 Cookie）→ 静态 JSON 资源 → 前端自绘卡片 |
| 设计稿 | `design-threads-repost.html`（转发卡片 UI/UX） |
| 数据存储 | **静态 JSON**（站点/存储可访问路径），非浏览器直连、非 iframe |
| 降级 | 无 Cookie/爬取失败 → 动态仅保留链接（点击跳转） |

## 1. 文件说明

```
threads-repost/
├── fetch.mjs   # 后端爬虫 (Node 18+): 带 Cookie 爬取 → JSON 静态资源
└── README.md   # 本文档
design-threads-repost.html  # 转发后的动态 UI/UX 设计稿
```

## 2. 可行性验证结论（重要）

- **Threads embed 页**（`threads.net/@user/post/<id>/embed`）：HTTP 200 但 **JS 渲染**，无 SSR 内容
- **无头浏览器渲染 embed**：显示「串文无法显示」（登录限制）
- **帖子页**（无头渲染）：**登录墙** + 推荐流（目标帖子内容不加载）
- **结论**：Threads **无登录环境无法获取目标串文**（任何方案皆然）——**必须携带登录 Cookie**（`sessionid` 等）

## 3. 爬虫用法

```bash
# 1. 获取 Cookie: 浏览器登录 Threads → F12 → Network → 任意请求头复制 Cookie
# 2. 爬取单条串文
THREADS_COOKIE="sessionid=xxx; ds_user_id=xxx" node fetch.mjs \
  "https://www.threads.net/@user/post/ID" static/threads/ID.json
# 输出: { url, id, author, handle, time, text, replies, stats, fetchedAt }
```

## 4. 集成流程

1. **发布动态**：正文粘贴 Threads 链接（`threads.net/@user/post/<id>` 或 `threads.com/@user/post/<id>`）
2. **后端爬取**：发布时调用 `fetch.mjs`（或包装为 API/Edge Function）→ 生成 `threads/<id>.json`
3. **静态资源**：JSON 存放站点可访问路径（如 `static/threads/` 或 Supabase Storage `threads-reposts/` 桶）
4. **前端渲染**（moments.js）：
   - 识别正文 Threads 链接 → `fetch('/threads/<id>.json')`（或 storage URL）→ 读 JSON → 自绘转发卡片（主帖 + 回复链缩进 + mono 互动数据）
   - 资源不存在/失败 → 降级为链接文本（点击跳转）

## 5. 管理后台 · 平台管理（自动登录链）

后台新增「平台管理」侧栏页（`/admin/`，需 superadmin），实现最傻瓜式自动化链：

1. **自动登录**：填账号密码 → 调 Edge Function `threads-login` → 自动保存 Cookie 到本机 localStorage
2. **Cookie 管理**：可查看/手动粘贴/测试连接/清除（Cookie 失效时降级方案）
3. **爬取串文**：填链接 → 调 Edge Function `threads-fetch` → 生成静态资源到 `threads-reposts` 桶

Edge Function 部署：

```bash
supabase functions deploy threads-login --no-verify-jwt
supabase functions deploy threads-fetch --no-verify-jwt
```

`threads-login` 原理：Threads 与 Instagram 共用账号体系，登录走 IG Web 登录接口
（`instagram.com/api/v1/web/accounts/login/ajax/`）。密码加密优先明文格式
（`#PWD_INSTAGRAM_BROWSER:0:<ts>:<password>`，instaloader 同款），被拒时自动降级为
IG Web 官方加密格式（AES-256-GCM + NaCL sealed box，公钥从登录页动态提取）。
返回 `sessionid=…; ds_user_id=…` 即为 Threads 爬取所需 Cookie。
若账号触发验证码/双因素/Checkpoint，返回明确错误提示手动粘贴 Cookie。

注意（2026-08 实测）：

- `www.threads.net` 已 301 迁移至 `www.threads.com`，旧 `threads.net/api/v1/web/accounts/login/`
  端点已失效（404），登录统一走 IG 接口
- IG 服务器对密码加密格式校验宽松：明文格式当前可用，加密格式亦被接受

## 6. 扩展点

- **回复链**：当前 `replies: []` 占位——需扩展解析（Threads GraphQL API 或页面结构，带 Cookie）
- **互动数**：`stats` 占位（likes/replies/reposts）——同回复链解析
- **部署形态**：可包装为 Supabase Edge Function / Cloudflare Worker（Node 运行时），或独立定时/手动脚本

## 7. 工作日志

| 日期 | 内容 |
|------|------|
| 08-11 | 方案调研：embed/页面无登录不可获取（JS 渲染+登录墙）→ 确定带 Cookie 后端爬取方案 |
| 08-11 | 设计稿：转发卡片 UI/UX（主帖+回复链+mono 数据，瑞士极简） |
| 08-11 | 爬虫脚本 fetch.mjs（Node，带 Cookie，输出静态 JSON） |
| 08-11 | Edge Function `threads-fetch` + 后台设置面板 Cookie/测试/爬取 |
| 08-11 | Edge Function `threads-login`（IG Web 登录接口 + 密码加密，明文/密文双格式降级） |
| 08-11 | 后台新增「平台管理」侧栏页：自动登录 → Cookie → 爬取 完整链路 |
