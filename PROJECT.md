# 博客项目技术文档

## 项目概览

| 项目 | 详情 |
|------|------|
| 名称 | 我的博客 |
| 本地路径 | `/home/levia/blog` |
| GitHub 仓库 | `https://github.com/Levia808/blog` |
| GitHub Pages | `https://levia808.github.io/blog/` |
| Cloudflare Pages | `https://blog-go3.pages.dev/` |
| 作者 | Levia808 |
| 邮箱 | `Levia808@users.noreply.github.com` |

---

## 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| Hugo | v0.164.0 extended | Go 静态站点生成器 |
| Theme | PaperMod (adityatelange/hugo-PaperMod.git) | 极简博客主题，git submodule 引入 |
| 语言 | zh-cn (简体中文) | 支持 CJK |
| Git | 2.43.0 | 版本控制 |

---

## 目录结构

```
blog/
├── hugo.yaml             # Hugo 站点核心配置
├── archetypes/
│   └── default.md        # 新文章模板
├── assets/               # Hugo 资源管道处理目录（空）
├── content/
│   ├── posts/            # 博客文章（.md）
│   │   └── hello-world.md
│   └── about.md          # 关于页面
├── data/                 # Hugo Data 模板（空）
├── i18n/                 # 国际化翻译文件（空）
├── layouts/              # 自定义布局覆盖（空）
├── static/               # 静态文件（空）
├── themes/
│   └── PaperMod/         # 主题（Git Submodule）
├── .github/workflows/
│   └── deploy.yml        # GitHub Actions 部署工作流
├── .gitignore
├── .gitmodules
└── .hugo_build.lock      # Hugo 构建锁文件
```

---

## Hugo 配置详情 (`hugo.yaml`)

```yaml
baseURL: https://blog-go3.pages.dev/
locale: zh-cn
title: 我的博客
theme: PaperMod

enableRobotsTXT: true
hasCJKLanguage: true

params:
  env: production
  author: Levia808
  description: 个人技术博客
  defaultTheme: auto          # 跟随系统亮暗色
  ShowReadingTime: true       # 显示阅读时间
  ShowShareButtons: false     # 不显示分享按钮
  ShowPostNavLinks: true      # 显示上下篇文章链接
  ShowBreadCrumbs: true       # 显示面包屑导航
  ShowCodeCopyButtons: true   # 代码块复制按钮
  ShowToc: true               # 显示目录
  comments: false             # 禁用评论

  homeInfoParams:
    Title: 欢迎来到我的博客
    Content: 这里记录我的学习与思考。

  socialIcons:
    - name: github
      url: https://github.com/Levia808

menu:
  main:
    - name: 归档    url: archives/  weight: 10
    - name: 标签    url: tags/      weight: 20
    - name: 关于    url: about/     weight: 30
```

### PaperMod 主题可扩展的 params 选项

```yaml
params:
  # 主页配置
  profileMode:
    enabled: true
    title: 标题
    imageUrl: /avatar.jpg
    imageTitle: avatar
  # 社交媒体
  socialIcons:
    - name: github     url: https://github.com/xxx
    - name: twitter    url: https://twitter.com/xxx
    - name: email      url: mailto:xxx@xxx.com
    - name: rss        url: index.xml
  # 搜索（需启用 JSON 输出）
  fuseOpts: {}  # PaperMod 内置 Fuse.js 搜索
  # 封面图
  cover:
    linkFullImages: true
    ShowReadingTime: true
  # SEO
  keywords: [blog, tech]
  # Google Analytics
  googleAnalyticsID: "G-XXXXXXXXXX"
  # 页脚
  hideFooter: false
  ShowWordCount: true
  ShowRssButtonInSectionTermList: true
  UseHugoToc: true
```

---

## 文章模板 (`archetypes/default.md`)

```yaml
---
date: '{{ .Date }}'
draft: true
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
---
```

新建文章时 Hugo 自动填充日期和标题。文章存放在 `content/posts/`。

### 文章 Front Matter 可用字段

```yaml
---
title: "文章标题"
date: "2026-08-06T15:27:00+08:00"
draft: true          # true=草稿不发布, false=正式发布
tags: [标签1, 标签2]   # 标签列表
categories: [分类1]    # 分类列表
series: [系列名]      # 文章系列
description: "文章摘要"
author: Levia808
cover:
  image: /cover.jpg
  alt: 封面描述
ShowToc: true
---
```

---

## 部署配置

### 部署 1：GitHub Pages

**触发条件**：push 到 `main` 分支

**工作流** (`.github/workflows/deploy.yml`)：`main` 分支 push 自动触发 GitHub Actions，构建 Hugo 并部署到 GitHub Pages。

- `actions/checkout@v4` — 拉取代码（含 submodule）
- `peaceiris/actions-hugo@v3` — 安装 Hugo extended
- `hugo --minify` — 构建并压缩
- `actions/upload-pages-artifact@v3` — 上传构建产物
- `actions/deploy-pages@v4` — 部署到 Pages

**URL**：`https://levia808.github.io/blog/`

### 部署 2：Cloudflare Pages

**触发条件**：GitHub 仓库 `main` 分支变更自动触发

**Cloudflare Pages 构建配置**：
```
框架预设: Hugo
构建命令: hugo
输出目录: public
环境变量: HUGO_VERSION=0.164.0
```

**URL**：`https://blog-go3.pages.dev/`

---

## 本地开发

```bash
# 进入项目
cd /home/levia/blog

# 新建文章（草稿）
export PATH="$HOME/.local/bin:$PATH"
hugo new content posts/my-post.md

# 本地预览（含草稿）
hugo server -D
# → http://localhost:1313/blog/

# 构建
hugo
# → 输出到 public/
```

---

## Git 配置

| 配置项 | 值 |
|--------|-----|
| 远程仓库 | `https://github.com/Levia808/blog.git` |
| 分支 | `main` |
| 用户名 | Levia808 |
| 邮箱 | `Levia808@users.noreply.github.com` |
| 认证方式 | HTTP (token)，credential-helper: store |
| 代理 | `http://127.0.0.1:7897`（本地） |
| 主题管理 | Git Submodule (`themes/PaperMod`) |

### 常用 Git 命令

```bash
cd /home/levia/blog

# 提交并推送
git add -A
git commit -m "描述变更"
git push

# 更新主题
git submodule update --remote themes/PaperMod
```

---

## 网络环境

| 项目 | 值 |
|------|-----|
| HTTP 代理 | `http://127.0.0.1:7897` |
| Git HTTP proxy | `http://127.0.0.1:7897`（仓库级） |

---

## 文件清单

### 需要版本控制的文件
- `hugo.yaml`
- `content/` 下所有 `.md` 文件
- `archetypes/`
- `.github/workflows/deploy.yml`
- `static/` 下自定义文件
- `.gitmodules`

### 被 `.gitignore` 忽略的文件
- `public/`（构建产物）
- `resources/`（Hugo 资源缓存）
- `.hugo_build.lock`

---

## 主题定制方式

主题 PaperMod 位于 `themes/PaperMod/`（Git Submodule），不建议直接修改。如需定制：

1. **配置覆盖**：修改 `hugo.yaml` 中的 `params` 选项
2. **布局覆盖**：在 `layouts/` 目录创建与主题同路径的文件，Hugo 优先级高于 themes
3. **CSS 覆盖**：在 `assets/css/extended/` 下创建 `.css` 文件，PaperMod 自动加载
4. **静态资源覆盖**：在 `static/` 目录放置文件可覆盖主题同名文件

---

## 如需构建新页面

### 添加独立页面（如归档、标签）
PaperMod 主题内置 `archives/` 和 `tags/` 页面的布局模板，只需在菜单中配置即可运行，无需手动创建 `.md` 文件。

### 添加分类页
Hugo 默认支持 `categories` 分类，PaperMod 同样内置布局，在文章中设置 `categories: [分类名]` 即可。

### 添加自定义静态页
```bash
hugo new content mypage.md
```
在 Front Matter 中设置 `layout: page`（或其他自定义布局）。

### 添加搜索功能
在 `hugo.yaml` 的 `params` 中启用：
```yaml
params:
  fuseOpts:
    isCaseSensitive: false
    shouldSort: true
    location: 0
    distance: 1000
    threshold: 0.4
    minMatchCharLength: 0
```

---

## 关键 API / 接口

### Hugo 内置

| 接口 | 说明 |
|------|------|
| `hugo.yaml` | 站点主配置，Hugo 自动读取 |
| `content/` | 内容目录，所有 `.md` 转为 HTML 页面 |
| `layouts/` | 布局模板覆盖目录 |
| `static/` | 静态资源（CSS/JS/图片），原样复制到 `public/` |
| `archetypes/default.md` | 新文章模板，`hugo new` 时使用 |
| `themes/PaperMod/theme.toml` | 主题元数据 |

### PaperMod 主题接口

| 接口 | 说明 |
|------|------|
| `themes/PaperMod/layouts/` | 主题 HTML 模板（Go templates） |
| `themes/PaperMod/assets/` | 主题 CSS/JS |
| `themes/PaperMod/i18n/` | 主题国际化字符串（可覆盖） |
| `params.homeInfoParams` | 首页信息展示 |
| `params.profileMode` | 首页头像模式（替代文章列表） |
| `params.socialIcons` | 预定义的社交图标（`github/twitter/email/rss` 等，见主题文档） |

### PaperMod 预定义社交图标名称

`github`, `twitter`, `mastodon`, `email`, `rss`, `youtube`, `telegram`, `discord`, `reddit`, `linkedin`, `stackoverflow`, `instagram`, `x`, 等。

---

## 部署流水线

```
本地编辑 → git push → GitHub → 自动触发:
  ├── GitHub Actions → GitHub Pages (levia808.github.io/blog/)
  └── Cloudflare Pages Webhook → hugo build → blog-go3.pages.dev
```
