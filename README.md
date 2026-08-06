# 我的博客 — 交接文档

## 1. 项目概览

| 项 | 值 |
|---|----|
| 站点 | `https://blog-go3.pages.dev/`（Cloudflare Pages）+ `https://levia808.github.io/blog/`（GitHub Pages） |
| 框架 | Hugo v0.164.0 extended + PaperMod 主题 |
| 本地路径 | `/home/levia/blog` |
| 仓库 | `https://github.com/Levia808/blog`（main 分支） |

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    博客前端 (Hugo 静态)                    │
│  ├── 评论区    → Giscus (GitHub Discussions)             │
│  ├── 站内搜索  → Fuse.js (静态 JSON 索引)                 │
│  ├── 后台编辑  → Sveltia CMS (/admin/)                    │
│  │    └── 认证 → GitHub OAuth (Client: Ov23lix...)       │
│  ├── 用户系统  → Supabase                                │
│  │    ├── 邮箱注册/登录                                    │
│  │    ├── GitHub OAuth 一键登录                           │
│  │    ├── 头像上传 / GitHub 头像拉取                       │
│  │    └── 管理后台 (/admin/)                              │
│  └── 部署     → Cloudflare Pages + GitHub Pages (双线)    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 文件清单

### 3.1 核心配置

| 文件 | 说明 |
|------|------|
| `hugo.yaml` | Hugo 主配置：站点信息、PaperMod 参数、Giscus 评论区、Fuse.js 搜索、菜单 |
| `archetypes/default.md` | 新文章模板（tags/categories/series/description/ShowToc） |
| `.github/workflows/deploy.yml` | GitHub Actions 部署到 GitHub Pages |

### 3.2 页面内容

| 文件 | 说明 |
|------|------|
| `content/posts/hello-world.md` | 首篇示例文章 |
| `content/about.md` | 关于页面 |
| `content/search.md` | 搜索页面（layout: search） |
| `content/profile.md` | 个人主页 — Supabase 驱动 |
| `content/admin.md` | 管理后台 — Supabase 驱动 |

### 3.3 模板覆盖（layouts/）

| 文件 | 说明 |
|------|------|
| `layouts/partials/header.html` | **导航栏** — Liquid Group 液体滑动菜单 + 主题切换 + 用户头像 |
| `layouts/partials/comments.html` | **评论区** — Giscus 嵌入脚本 |
| `layouts/partials/auth-modal.html` | **认证弹窗** — 登录 / 注册 / 重置密码 |
| `layouts/partials/extend_head.html` | **头部注入** — View Transitions meta + favicon + app.js |
| `layouts/partials/extend_footer.html` | **尾部注入** — Supabase SDK + auth-modal + supabase.js + auth-ui.js |
| `layouts/_default/profile.html` | 个人主页布局模板 |
| `layouts/_default/admin.html` | 管理后台布局模板 |

### 3.4 样式（assets/css/extended/）

| 文件 | 说明 |
|------|------|
| `custom.css` | CJK 字体栈、响应式断点、卡片 hover、Giscus 样式、打印优化 |
| `animations.css` | View Transitions 页面切换、scroll-reveal 入场、阅读进度条、导航下划线、reduced-motion |
| `nav.css` | **导航栏全部样式** — Liquid Group、3 列布局、glass morphism、登录按钮、用户菜单、响应式 |
| `design-system.css` | 代码块/引用块/图片/HR/标签云/toc/链接过渡 |
| `auth.css` | 认证弹窗、用户下拉菜单、个人主页表单、管理后台表格 |

### 3.5 JavaScript（static/js/）

| 文件 | 说明 |
|------|------|
| `app.js` | **核心交互** — scroll-reveal (IntersectionObserver)、阅读进度条、导航栏毛玻璃、主题监听、图片懒加载 |
| `supabase.js` | **Supabase 客户端** — 初始化、Auth/Profile/Admin API 封装 |
| `auth-ui.js` | **认证交互** — 弹窗开关、登录/注册/重置表单提交、用户菜单、GitHub 登录 |
| `profile.js` | **个人主页** — 资料编辑、头像上传、GitHub 头像同步 |
| `admin.js` | **管理后台** — 用户列表、统计数据 |

### 3.6 静态资源

| 文件 | 说明 |
|------|------|
| `static/favicon.svg` | 站点图标 |
| `static/admin/index.html` | Sveltia CMS 入口（CDN 加载） |
| `static/admin/config.yml` | Sveltia CMS 配置 — GitHub 后端、文章/页面集合 |

### 3.7 外部服务

| 服务 | 用途 | 配置位置 |
|------|------|---------|
| **GitHub Discussions** | Giscus 评论区数据存储 | 仓库 Settings → Discussions 开启 |
| **GitHub OAuth App** | Sveltia CMS 管理后台认证 | Client ID: `Ov23lij9x9gnpRXSOY8w` |
| **Supabase** | 用户认证 + 数据库 + 头像存储 | `supabase.js` 第 1-2 行 |

---

## 4. 功能清单

### 4.1 动效系统（7 层）

| # | 动效 | 技术 | 浏览器 |
|---|------|------|--------|
| 1 | 页面切换 — 淡入淡出 | CSS View Transitions API | Chrome/Edge |
| 2 | 滚动入场 — 逐段浮现 | CSS animation + IntersectionObserver | 全部 |
| 3 | 导航栏 — Liquid Group 液体滑动 | CSS transition + JS slider | 全部 |
| 4 | 导航栏 — 滚动毛玻璃 | backdrop-filter + JS class toggle | 全部 |
| 5 | 阅读进度条 | animation-timeline + JS fallback | 全部 |
| 6 | 链接 hover 下划线 center-expand | CSS ::after transition | 全部 |
| 7 | 主题切换按钮旋转 | CSS transform | 全部 |

> 所有动效在 `prefers-reduced-motion: reduce` 时自动禁用。

### 4.2 用户系统

| 功能 | 入口 | 状态 |
|------|------|------|
| 邮箱注册 | 导航栏「登录」→ 切换到「注册」 | 需 Supabase Email Provider 配置 |
| 邮箱登录 | 导航栏「登录」 | 同上 |
| GitHub OAuth 登录 | 导航栏「登录」→ GitHub 按钮 | 需 Supabase GitHub Provider 配置 |
| 密码重置 | 登录弹窗 → 重置密码 | 同上 |
| 个人主页 | 用户菜单 → 个人主页 | 自动 |
| 资料编辑 | 个人主页表单 | 自动 |
| 头像上传 | 个人主页 → 上传头像 | 自动 |
| GitHub 头像同步 | 个人主页 → 同步 GitHub 头像 | 自动 |
| 管理后台 | 用户菜单 → 管理后台 | 需设置 admin 角色 |

### 4.3 响应式断点

| 断点 | 行为 |
|------|------|
| **1024px+** | 完整 3 列布局、4 项 liquid group |
| **800px** | 紧凑间距、缩小字号 |
| **480px** | 最小字号、缩减 padding |
| **400px** | 极小屏优化 |

### 4.4 站内搜索

- Fuse.js 静态 JSON 索引 → `/search/`
- 快捷键：`Alt + /`
- 配置：`hugo.yaml` → `fuseOpts`

---

## 5. 开发命令

```bash
cd /home/levia/blog
export PATH="$HOME/.local/bin:$PATH"

# 新建文章
hugo new content posts/文章名.md

# 本地预览（含草稿）
hugo server -D
# → http://localhost:1313/

# 构建生产版
hugo --minify
# → public/

# 更新 PaperMod 主题
git submodule update --remote themes/PaperMod

# 提交推送
git add -A
git commit -m "描述"
git push
```

---

## 6. 第三方服务配置

### 6.1 Giscus 评论区

| 配置项 | 值 |
|--------|---|
| 仓库 | `Levia808/blog` |
| Discussions 分类 | `General` |
| 页面映射 | `pathname` |
| 语言 | `zh-CN` |

### 6.2 Sveltia CMS

| 配置项 | 值 |
|--------|---|
| 入口 | `/admin/` |
| 认证 | GitHub OAuth |
| Client ID | `Ov23lixCL7W5rvZ3DKFB` |
| Callback | `https://api.sveltia-cms.auth.amplify.aws/callback` |
| 内容类型 | 文章 (posts)、页面 (pages) |

### 6.3 Supabase

| 配置项 | 值 |
|--------|---|
| Project URL | `https://iyquixzprfwkglaqptxj.supabase.co` |
| Anon Key | 见 `static/js/supabase.js` 第 2 行 |

**需要完成的 Supabase 初始化步骤：**

1. **运行 SQL 迁移** — Supabase Dashboard → SQL Editor → 粘贴 `supabase-setup.sql` → Run
2. **启用 Email Auth** — Authentication → Providers → Email → 开启 → Save
3. **启用 GitHub Auth** — Authentication → Providers → GitHub → 开启 → 填入 OAuth 凭证 → Save
4. **设置管理员** — 注册后，SQL Editor 执行：
   ```sql
   UPDATE profiles SET role = 'admin' WHERE id = '<你的UUID>';
   ```

---

## 7. 部署流程

```
本地编辑 → git push → GitHub main 分支
                          ├── GitHub Actions → GitHub Pages (levia808.github.io/blog/)
                          └── Cloudflare Pages Webhook → hugo build → blog-go3.pages.dev
```

### Cloudflare Pages 构建配置

| 项 | 值 |
|----|-----|
| 框架预设 | Hugo |
| 构建命令 | `hugo` |
| 输出目录 | `public` |
| 环境变量 | `HUGO_VERSION=0.164.0` |

### 网络环境

| 项 | 值 |
|----|-----|
| HTTP 代理 | `http://127.0.0.1:7897` |
| Git 代理 | 同上（仓库级） |

---

## 8. 自定义指南

### 修改导航栏菜单

编辑 `hugo.yaml` 的 `menu.main` 部分，添加/删除/重命名菜单项。Liquid Group 自动适配项目数量。

### 修改主题色

PaperMod 使用 CSS 变量，在 `assets/css/extended/` 下新增 `.css` 文件覆盖：
```css
:root { --primary: rgb(50, 50, 50); }
[data-theme="dark"] { --primary: rgb(230, 230, 230); }
```

### 添加新页面

```bash
hugo new content 页面名.md
```

在 Front Matter 中设置 `layout: page`（或 `profile`、`admin`）。

### 主题定制方式

1. `hugo.yaml` → `params.*` 配置覆盖
2. `layouts/` → 与主题同路径文件覆盖模板
3. `assets/css/extended/*.css` → 自动加载的样式
4. `static/` → 覆盖主题同名文件

---

## 9. 故障排查

| 问题 | 检查 |
|------|------|
| 评论区不显示 | GitHub Discussions 是否开启？`hugo.yaml` 中 `repoId`/`categoryId` 是否正确？ |
| 搜索不工作 | `hugo.yaml` 中 `outputs.home` 是否包含 `JSON`？ |
| 登录弹窗白屏 | Supabase 配置是否正确？浏览器 Console 是否有 CORS 错误？ |
| 管理后台无权限 | 用户 `profiles.role` 是否为 `admin`？ |
| 页面过渡不流畅 | 当前浏览器是否支持 View Transitions API？Safari/Firefox 为直接切换 |
| 导航栏 slider 错位 | 菜单项数量是否与 `data-count` 一致？刷新页面重试 |
