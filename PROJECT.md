# 博客项目技术文档 — 完整版

> 最后更新：2026-08-07  
> 此文档面向 LLM / 新开发者，涵盖项目的全部技术细节、配置、接口与排障记录。

---

## 1. 项目概览

| 项目 | 详情 |
|------|------|
| 名称 | 我的博客 |
| 本地路径 | `/home/levia/blog` |
| GitHub 仓库 | `https://github.com/Levia808/blog`（main 分支） |
| GitHub Pages | `https://levia808.github.io/blog/` |
| Cloudflare Pages | `https://blog-go3.pages.dev/`（主站） |
| 作者 | Levia808 |
| Git 提交邮箱 | `Levia808@users.noreply.github.com` |

---

## 2. 技术栈

| 层 | 技术 | 版本/说明 |
|----|------|-----------|
| 静态站点 | Hugo | v0.164.0 extended |
| 主题 | PaperMod | adityatelange/hugo-PaperMod（Git Submodule） |
| 语言 | zh-cn | 简体中文，hasCJKLanguage: true |
| 后端 | Supabase | `https://iyquixzprfwkglaqptxj.supabase.co` |
| 认证 | Supabase Auth | 邮箱 + GitHub OAuth |
| 数据库 | PostgreSQL (Supabase) | profiles / comments / uploads |
| 文件存储 | Supabase Storage | 头像上传 |
| CMS | Sveltia CMS | `/admin/` 路径，Decap CMS 协议 |
| 搜索 | Fuse.js | 静态 JSON 索引 |
| 部署 | Cloudflare Pages + GitHub Pages | 双线部署 |
| CI/CD | GitHub Actions | 构建 → GitHub Pages；Cloudflare 自动同步 |

---

## 3. 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                   博客前端 (Hugo 静态站点)                   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ 文章展示  │ │ 搜索     │ │ 评论区   │ │ 用户系统     │ │
│  │ (Markdown)│ │ (Fuse.js)│ │(Supabase)│ │ (Supabase)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────┐                │
│  │         后台管理 /admin/              │                │
│  │    Sveltia CMS + GitHub OAuth 认证    │                │
│  └──────────────────────────────────────┘                │
│                                                          │
│  ┌──────────────────────────────────────┐                │
│  │         个人中心 /profile/             │                │
│  │    资料编辑 + 头像上传 + GitHub 同步    │                │
│  └──────────────────────────────────────┘                │
│                                                          │
└──────────────────────────────────────────────────────────┘
         │                                              │
         ▼                                              ▼
   ┌──────────┐                              ┌──────────────────┐
   │ Supabase │                              │  GitHub OAuth App │
   │ (Auth +  │                              │  Client ID:       │
   │  DB +    │                              │  Ov23lij9x9gn...  │
   │  Storage)│                              └──────────────────┘
   └──────────┘
```

---

## 4. 目录结构

```
blog/
├── hugo.yaml                    # Hugo 站点核心配置
├── PROJECT.md                   # 本文档
├── design-proposal.html         # 视觉设计方案（深色编辑风）
├── README.md                    # 交接文档
├── blog-system-requirements.md  # 博客系统需求文档
├── supabase-setup.sql           # Supabase 数据库迁移 SQL
├── .gitignore
├── .gitmodules
│
├── archetypes/
│   └── default.md               # 新文章 Front Matter 模板
│
├── assets/
│   └── css/extended/            # PaperMod 自定义 CSS 注入点
│       ├── admin-workspace.css
│       ├── animations.css
│       ├── comments.css
│       ├── design-system.css
│       ├── nav.css
│       ├── z-mission.css
│       ├── zz-gritty-editorial.css
│       └── zzz-glass-blog.css
│
├── content/
│   ├── posts/
│   │   └── hello-world.md       # 示例文章
│   ├── about.md                 # 关于页面 (layout: page)
│   ├── search.md                # 搜索页面 (layout: search)
│   ├── archives.md              # 归档页面 (layout: archives)
│   ├── profile.md               # 个人中心 (layout: profile)
│   └── admin.md                 # 后台入口 (layout: admin)
│
├── layouts/
│   ├── index.html               # 自定义首页
│   ├── _default/
│   │   ├── profile.html         # /profile/ 布局模板
│   │   └── admin.html           # /admin/ 布局模板
│   ├── partials/
│   │   ├── header.html          # 导航栏（含登录按钮/用户菜单）
│   │   ├── auth-modal.html      # 登录/注册弹窗
│   │   ├── comments.html        # Supabase 评论区
│   │   ├── extend_head.html     # <head> 扩展
│   │   └── extend_footer.html   # 页脚扩展
│   └── _partials/
│       └── header.html          # 备用导航
│
├── static/
│   ├── favicon.svg
│   ├── images/
│   ├── admin-cms/
│   │   ├── index.html           # Sveltia CMS 入口
│   │   └── config.yml           # CMS 配置
│   └── js/
│       ├── supabase.js          # Supabase 客户端 + Auth/Profile/Admin/Comment 服务
│       ├── auth-ui.js           # 登录/注册弹窗 UI 逻辑
│       ├── profile.js           # 个人中心页面逻辑
│       ├── admin.js             # 管理后台页面逻辑
│       ├── comments.js          # 评论区功能
│       ├── home.js              # 首页功能
│       └── app.js               # Hugo 主题 JS（主题切换等）
│
├── themes/
│   └── PaperMod/                # Git Submodule
│
└── .github/
    └── workflows/
        └── deploy.yml           # GitHub Actions 部署到 GitHub Pages
```

---

## 5. Hugo 配置 (`hugo.yaml`)

```yaml
baseURL: https://blog-go3.pages.dev/
locale: zh-cn
title: 我的博客
theme: PaperMod

enableRobotsTXT: true
hasCJKLanguage: true

markup:
  goldmark:
    renderer:
      unsafe: true               # 允许 Markdown 中嵌入原始 HTML

outputs:
  home:
    - HTML
    - RSS
    - JSON                       # Fuse.js 搜索索引

params:
  env: production
  author: Levia808
  description: 个人技术博客 — 记录学习、思考与技术分享。
  defaultTheme: light
  ShowReadingTime: true
  ShowShareButtons: false
  ShowPostNavLinks: true
  ShowBreadCrumbs: true
  ShowCodeCopyButtons: true
  ShowToc: true
  ShowWordCount: true
  ShowRssButtonInSectionTermList: true
  comments: true

  keywords: [博客, 技术, 编程, 学习]

  homeInfoParams:
    Title: 欢迎来到我的博客
    Content: 这里记录我的学习与思考。

  socialIcons:
    - name: github
      url: https://github.com/Levia808

  fuseOpts:
    isCaseSensitive: false
    shouldSort: true
    location: 0
    distance: 1000
    threshold: 0.4
    minMatchCharLength: 0
    keys: [title, content, summary, tags]

menu:
  main:
    - name: 归档    url: archives/   weight: 10
    - name: 搜索    url: search/     weight: 15
    - name: 标签    url: tags/       weight: 20
    - name: 关于    url: about/      weight: 30
```

---

## 6. Supabase 后端

### 6.1 连接信息

| 配置项 | 值 |
|--------|-----|
| Supabase URL | `https://iyquixzprfwkglaqptxj.supabase.co` |
| Anon Key | `sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT` |
| 定义位置 | `static/js/supabase.js:1-2` |

### 6.2 客户端初始化

```js
// static/js/supabase.js
const SUPABASE_URL = 'https://iyquixzprfwkglaqptxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT';

var blogSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,       // 从 URL hash 中提取 session
    storage: window.localStorage
  }
});
```

### 6.3 JS 服务模块 (`static/js/supabase.js`)

所有业务逻辑封装为全局对象挂载到 `window`：

| 模块 | 暴露为 | 功能 |
|------|--------|------|
| Auth | `window.Auth` | 注册/登录/登出/GitHub OAuth/密码重置/会话监听 |
| Profile | `window.Profile` | 读取/更新个人资料、头像上传、GitHub 头像同步 |
| Admin | `window.Admin` | 管理后台功能 |
| MediaService | `window.MediaService` | 文件上传 |
| CommentService | `window.CommentService` | 评论 CRUD |

### 6.4 Auth 模块关键 API

```js
// 注册
Auth.signUp(email, password)

// 邮箱登录
Auth.signIn(email, password)

// GitHub OAuth 登录
Auth.signInWithGitHub()

// 登出
Auth.signOut()

// 密码重置
Auth.resetPassword(email)

// 获取当前用户
Auth.user()           // → Promise<user | null>
Auth.session()        // → Promise<session | null>

// 监听认证状态变化
Auth.onAuthChange(function(event, session) { ... })
```

### 6.5 Profile 模块关键 API

```js
Profile.get()                          // 获取当前用户资料
Profile.update({ username, display_name, bio, website })  // 更新资料
Profile.uploadAvatar(file)             // 上传头像到 Supabase Storage
Profile.syncGithubAvatar()             // 从 GitHub 拉取头像
```

### 6.6 Supabase 控制台配置要点

| 配置项 | 路径 | 值 |
|--------|------|-----|
| GitHub Provider | Authentication → Providers → GitHub | Client ID + Client Secret |
| Redirect URLs | Authentication → URL Configuration | `https://blog-go3.pages.dev/**`, `https://levia808.github.io/**`, `http://localhost:1313/**` |
| Site URL | Authentication → URL Configuration | `https://blog-go3.pages.dev` |

---

## 7. GitHub OAuth 认证流程

### 7.1 OAuth App 配置

| 配置项 | 值 |
|--------|-----|
| Client ID | `Ov23lij9x9gnpRXSOY8w` |
| Client Secret | 存储在 Supabase 控制台（不在代码中） |
| Authorization callback URL | `https://iyquixzprfwkglaqptxj.supabase.co/auth/v1/callback` |
| 创建位置 | https://github.com/settings/developers |

### 7.2 登录流程

```
用户点击"GitHub 登录"
  → auth-ui.js 调用 Auth.signInWithGitHub()
  → supabase.js 调用 blogSupabase.auth.signInWithOAuth({ provider: 'github' })
  → Supabase 构造 GitHub OAuth URL
  → 浏览器跳转到 https://github.com/login/oauth/authorize?client_id=...
  → 用户在 GitHub 授权
  → GitHub 回调 Supabase: https://iyquixzprfwkglaqptxj.supabase.co/auth/v1/callback
  → Supabase 交换 code → token，302 到 redirectTo URL
  → 浏览器回到 blog-go3.pages.dev/profile/
  → detectSessionInUrl 从 URL hash 提取 session
  → updateAuthUI() 更新界面状态
```

### 7.3 redirectTo 路径处理

```js
// static/js/supabase.js
var profileUrl = window.location.origin + '/profile/';
// GitHub Pages 需要 /blog/ 前缀
if (window.location.hostname === 'levia808.github.io') {
  profileUrl = window.location.origin + '/blog/profile/';
}
```

### 7.4 登录失败 Fallback

```js
// static/js/auth-ui.js — 点击 GitHub 登录后的容错逻辑：
// 1. 先尝试 Supabase signInWithOAuth
// 2. 如果 3 秒内未跳转，直接打开 GitHub OAuth 授权链接
// 3. 如果 Supabase 报错，弹出 alert 显示错误信息
```

### 7.5 已解决的排障记录

| 问题 | 原因 | 修复 |
|------|------|------|
| `redirect_uri is not associated` | GitHub OAuth App 未配置回调 URL | 添加 Supabase 回调地址 |
| 点击登录 404 | 旧 OAuth App 被删除 | 重新创建 OAuth App（Client ID: `Ov23lij9x9gnpRXSOY8w`） |
| 登录后跳转 404 | GitHub Pages 路径缺少 `/blog/` 前缀 | supabase.js 中按 hostname 判断拼接路径 |
| profile.js 加载 404 | Markdown 中 Hugo 模板语法未被处理 | 改为硬编码 `/js/profile.js` |
| 登录按钮静默失败 | .catch() 缺失 | 添加 alert 弹窗 + fallback 直接链接 |

---

## 8. 登录/注册弹窗 (`layouts/partials/auth-modal.html`)

### 8.1 弹窗结构

- 登录面板 (`#authLogin`)：邮箱 + 密码 → `Auth.signIn()`
- 注册面板 (`#authRegister`)：显示名 + 邮箱 + 密码 → `Auth.signUp()`
- 找回密码 (`#authForgot`)：邮箱 → `Auth.resetPassword()`
- GitHub 登录按钮 (`#githubLogin`) → `Auth.signInWithGitHub()`

### 8.2 触发入口

- 导航栏登录按钮 (`#navLoginBtn`) — 未登录时显示
- 评论框未登录提示
- Profile 页面"需要登录"按钮

### 8.3 用户菜单

登录后导航栏显示用户菜单（`#userMenuContainer`），包含：
- 个人中心 → `/profile/`
- 管理后台 → `/admin/`（仅管理员可见）
- 登出

---

## 9. CMS 后台 (`/admin/`)

| 配置项 | 值 |
|--------|-----|
| CMS | Sveltia CMS (Decap CMS 兼容) |
| 配置文件 | `static/admin-cms/config.yml` |
| 入口 | `static/admin-cms/index.html` |
| 认证 | GitHub OAuth（独立 App，Client ID 在 config.yml 中） |
| 后端 | GitHub API（直接操作仓库文件） |
| 站点 URL | `https://blog-go3.pages.dev` |

---

## 10. 评论区 (`layouts/partials/comments.html`)

- 通过 Supabase 实时评论（非 Giscus）
- 登录后可评论
- 支持 Markdown 预览
- JS 逻辑在 `static/js/comments.js`
- 样式在 `assets/css/extended/comments.css`

---

## 11. 数据库 (`supabase-setup.sql`)

### 核心表

| 表 | 说明 |
|----|------|
| `profiles` | 用户资料（id, username, display_name, bio, website, avatar_url, role） |
| `comments` | 评论（关联 profiles + 文章路径） |
| `uploads` | 文件上传记录 |
| `auth.users` | Supabase 内置用户表 |
| `auth.identities` | OAuth 身份（GitHub identity） |

### 角色体系

| 角色 | SQL 中的列 | 权限 |
|------|-----------|------|
| 超级管理员 | `role = 'superadmin'` | GitHub 登录用户 `levia808` 自动获得 |
| 管理员 | `role = 'admin'` | 通过 SQL 手动设置 |
| 作者 | `role = 'author'` | CMS 内容编辑 |
| 注册用户 | `role = 'user'` | 默认角色 |

---

## 12. 设计系统

详见 `/home/levia/blog/design-proposal.html`（浏览器可直接打开查看）。

**推荐方向**：深色编辑风

| 维度 | 值 |
|------|-----|
| 底色 | `#0d0d0d` / `#161616` |
| 强调色 | 琥珀金 `#f0c040` |
| 功能色 | 蓝 `#4da6ff` / 青 `#2dd4bf` / 红 `#ff6b6b` |
| 标题字体 | Inter (Google Fonts) |
| 正文字体 | Noto Sans SC (Google Fonts) |
| 代码字体 | JetBrains Mono |
| 卡片圆角 | 12px |
| 间距基准 | 4px 倍数 |

---

## 13. 部署配置

### 13.1 Cloudflare Pages（主站）

| 配置项 | 值 |
|--------|-----|
| 仓库 | `Levia808/blog` |
| 生产分支 | `main` |
| 框架预设 | Hugo |
| 构建命令 | `hugo` |
| 输出目录 | `public` |
| 环境变量 | `HUGO_VERSION = 0.164.0` |
| URL | `https://blog-go3.pages.dev/` |

GitHub push 后自动触发构建，约 1-2 分钟生效。

### 13.2 GitHub Pages

| 配置项 | 值 |
|--------|-----|
| 触发 | push main 分支 → GitHub Actions |
| Workflow | `.github/workflows/deploy.yml` |
| Source | GitHub Actions |
| URL | `https://levia808.github.io/blog/` |

### 13.3 GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    steps:
      - checkout@v4 (submodules: recursive)
      - peaceiris/actions-hugo@v3 (extended: true)
      - hugo --minify
      - upload-pages-artifact@v3 (path: ./public)
  deploy:
    needs: build
    steps:
      - deploy-pages@v4
```

---

## 14. 本地开发

```bash
cd /home/levia/blog

# 确保 Hugo 在 PATH
export PATH="$HOME/.local/bin:$PATH"

# 新建文章
hugo new content posts/my-post.md

# 本地预览（含草稿）
hugo server -D
# → http://localhost:1313/blog/

# 构建
hugo
# → 输出到 public/

# 推送部署
git add -A
git commit -m "描述"
git push
```

---

## 15. Git 配置

| 配置项 | 值 |
|--------|-----|
| 远程 | `https://github.com/Levia808/blog.git` |
| 分支 | `main` |
| 用户名 | Levia808 |
| 邮箱 | `Levia808@users.noreply.github.com` |
| 认证方式 | HTTP Token + credential-helper store |
| 本地代理 | `http://127.0.0.1:7897` |
| 代理配置方式 | `git config http.proxy` (仓库级) |

### 网络说明

本地环境 `/etc/hosts` 将 github.com 映射到 `127.0.0.1`，终端通过代理 `127.0.0.1:7897` 访问。`git push` 需配置仓库级代理：

```bash
git config http.proxy http://127.0.0.1:7897
git config https.proxy http://127.0.0.1:7897
```

浏览器不受 `/etc/hosts` 影响，可直接访问 GitHub。

---

## 16. 注意事项

1. **文章 Front Matter**：新建文章后，将 `draft: true` 改为 `false` 才会发布
2. **HTML 在 Markdown 中**：`hugo.yaml` 已配置 `unsafe: true`，支持 Markdown 内嵌 HTML
3. **自定义布局**：在 `layouts/_default/` 创建 `layout: <name>` 对应的 `.html` 模板
4. **CSS 注入**：在 `assets/css/extended/` 下添加 `.css` 文件，PaperMod 自动加载
5. **不要直接改 PaperMod 源码**：主题是 Git Submodule，修改会在更新时丢失
6. **Client Secret 安全**：GitHub OAuth Client Secret 绝不出现在代码中，仅在 Supabase 控制台配置
7. **HTML 模板语法陷阱**：Markdown 正文中的 `{{ }}` 不会被 Hugo 处理，需在布局文件中使用

---

## 17. 相关文件速查

| 改动目标 | 修改文件 |
|----------|----------|
| 站点配置 | `hugo.yaml` |
| 新文章 | `hugo new content posts/xxx.md` |
| 首页样式 | `assets/css/extended/design-system.css` |
| 导航栏 | `layouts/partials/header.html` |
| 登录弹窗 | `layouts/partials/auth-modal.html` |
| 认证逻辑 | `static/js/supabase.js` |
| 认证 UI | `static/js/auth-ui.js` |
| 个人中心 | `static/js/profile.js` + `content/profile.md` |
| 评论区 | `static/js/comments.js` + `layouts/partials/comments.html` |
| 管理后台 | `static/js/admin.js` + `static/admin-cms/config.yml` |
| Supabase SQL | `supabase-setup.sql` |
| CI/CD | `.github/workflows/deploy.yml` |
| 设计文档 | `design-proposal.html` |
