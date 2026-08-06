# 博客项目 · 完整技术文档 & 设计系统

> 最后更新：2026-08-07 · Levia808  
> 此文档整合项目技术细节与暗色酸性粗野主义设计系统，面向 LLM / 新开发者。

---

## 一、项目概览

| 项目 | 详情 |
|------|------|
| 名称 | 我的博客 |
| 本地路径 | `/home/levia/blog` |
| GitHub 仓库 | `https://github.com/Levia808/blog`（main 分支） |
| GitHub Pages | `https://levia808.github.io/blog/` |
| Cloudflare Pages | `https://blog-go3.pages.dev/`（主站） |
| 作者 | Levia808 |
| Git 邮箱 | `Levia808@users.noreply.github.com` |

### 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 静态站点 | Hugo v0.164.0 extended | Go 静态站点生成器 |
| 主题 | PaperMod (adityatelange/hugo-PaperMod) | Git Submodule |
| 语言 | zh-cn | 简体中文 |
| 后端 | Supabase | `https://iyquixzprfwkglaqptxj.supabase.co` |
| 认证 | Supabase Auth | 邮箱 + GitHub OAuth |
| 数据库 | PostgreSQL (Supabase) | profiles / comments / uploads |
| 文件存储 | Supabase Storage | 头像上传 |
| CMS | Sveltia CMS | `/admin/`，Decap CMS 协议 |
| 搜索 | Fuse.js | 静态 JSON 索引 |
| 部署 | Cloudflare Pages + GitHub Pages | 双线 |
| CI/CD | GitHub Actions | 自动构建 → GitHub Pages |

---

## 二、设计系统：暗色酸性粗野主义

> Neo-Brutalism × Acid Design × Flat × Motion  
> 深黑底色、荧光绿酸性点缀、零阴影、零圆角、零渐变、终端美学

### 2.1 六项设计法则

| # | 法则 | 说明 |
|---|------|------|
| 01 | 纯平无影 | zero box-shadow · zero gradient · zero backdrop-filter |
| 02 | 绝对直线 | border-radius: 0 · 全直角 |
| 03 | 深黑底色 | #0A0A0A 画布 · #141414 卡片 |
| 04 | 酸性点缀 | #39FF14 / #FF2D55 / #CCFF00 / #00FFFF |
| 05 | 粗野结构 | 2px 实线边框 · 非对称布局 · 暴露网格 |
| 06 | 终端审美 | JetBrains Mono · ▶ 提示符 · ASCII 装饰 |

### 2.2 DO / DON'T

**DO:**
- 2-3px 实线单色边框
- border-radius: 0 全直角
- 0px box-shadow / 0px gradient
- #0A0A0A 底色 + 酸性 accent
- JetBrains Mono / Space Grotesk
- 非对称网格 + 打破居中
- CLI 提示符 / ASCII 装饰

**DON'T:**
- box-shadow（任何模糊）
- linear/radial-gradient
- border-radius > 2px
- 低对比度低饱和色
- 精致阴影/玻璃效果
- 居中对称一切
- 过度装饰的图标/插画

### 2.3 配色系统

**中性灰阶：**

| Token | Hex | 用途 |
|-------|-----|------|
| --color-bg | #0A0A0A | 页面底色 |
| --color-surface | #141414 | 卡片/容器底 |
| --color-border | #2A2A2A | 默认边框 |
| gray-500 | #4A4A4A | 辅助元素 |
| --color-fg | #EBEBEB | 主文字 |
| --color-muted | #777777 | 次要文字 |

**酸性色系：**

| Token | Hex | 用途 |
|-------|-----|------|
| --color-acid | #39FF14 | 主强调 · 荧光绿 |
| --color-acid2 | #CCFF00 | 次强调 · 黄绿 |
| --color-yellow | #FFD700 | 点缀 · 金 |
| --color-pink | #FF2D55 | 错误/强调 · 酸性粉 |
| --color-cyan | #00FFFF | 信息/链接 · 电青 |
| --color-purple | #AF52DE | 装饰 · 紫 |

### 2.4 字体系统

| 字体 | 用途 | Weight | 来源 |
|------|------|--------|------|
| **Space Grotesk** | 标题 H1-H3 | 700-900 | Google Fonts · Variable |
| **IBM Plex Sans** | 正文（英文） | 400-600 | Google Fonts |
| **Noto Sans SC** | 正文（中文）/ 降级 | 400-600 | Google Fonts |
| **JetBrains Mono** | 代码 · 标签 · 终端 · 导航 | 400-700 | Google Fonts · 连字 |

**字号阶梯：**

| Token | 值 | 用途 |
|-------|-----|------|
| --text-hero | clamp(36px, 6vw, 64px) / 900 | H1 |
| --text-h2 | 28px / 800 | Section 标题 |
| --text-h3 | 18px / 700 | Card 标题 |
| --text-body | 15px / 400 | 段落正文 |
| --text-mono | 13px / 400 JetBrains Mono | 代码/终端 |
| --text-label | 10px / 700 JetBrains Mono uppercase | 标签 |

### 2.5 间距与布局令牌

**间距 (Space Tokens):**

| Token | 值 | 用途 |
|-------|-----|------|
| --space-xs | 4px | 紧密间距 |
| --space-sm | 8px | 小组件内边 |
| --space-md | 16px | 卡片间距 |
| --space-lg | 24px | 区块内边 |
| --space-xl | 32px | 大区块间距 |
| --space-2xl | 48px | 区块间分隔 |
| --space-3xl | 64px | Section padding |
| --space-4xl | 80px | 大段落 |

**内容宽度：**

| Token | 值 | 用途 |
|-------|-----|------|
| --content-max | 1040px | 页面最大宽 |
| --content-narrow | 720px | 文章正文宽 |
| --content-col-gap | 20px | 列间距 |

### 2.6 网格策略

| 网格 | CSS | 用途 |
|------|-----|------|
| 2 栏 | `1fr 1fr` | 关于页、对比卡片 |
| 3 栏 | `repeat(3, 1fr)` | 首页文章、特色推荐 |
| 自适应 | `repeat(auto-fill, minmax(280px, 1fr))` | 标签云、参考 |
| 文章+侧栏 | `1fr 220px` | 文章详情页 |
| 非对称 | `3fr 2fr` | Hero 分栏（可选） |

> 粗野主义鼓励**打破对称**——不要所有列等宽，卡片可以错位排列，打破均匀栅格感。

### 2.7 动效设计系统

**动效哲学：** 锋利 · 瞬时 · 机械 · 荧光。禁用弹性/回弹/渐进柔和曲线。

**时间令牌：**

| Token | 值 | 用途 |
|-------|-----|------|
| --dur-instant | 50ms | 边框闪变 |
| --dur-fast | 100ms | hover 反馈 |
| --dur-normal | 150ms | 展开/折叠 |
| --dur-slow | 300ms | 模态进出 |

**动效效果清单：**

| # | 效果 | 说明 | 用途 |
|---|------|------|------|
| 01 | BLINK | step-end 闪烁光标 | loading / 等待 |
| 02 | RGB SHIFT | `text-shadow` 色散偏移 | 标题 hover |
| 03 | NOISE | `translate` 微小抖动 | 按钮微反馈 |
| 04 | BORDER BREATHE | 边框颜色循环渐变 | 加载卡片 |
| 05 | TYPEWRITER | `border-right` 打字光标 | 加载文案/输入框 |
| 06 | BORDER FLASH | hover 瞬间边框变色 | 卡片/按钮主交互 |
| 07 | SKELETON | `opacity` 呼吸动画 | 文章列表骨架屏 |
| 08 | SCANLINE SCROLL | 全局 CRT 扫描线 | 背景装饰 |

**过渡规则：**

```
hover-in:      0ms-delay, 100ms-duration, ease-out
hover-out:     0ms-delay, 100ms-duration, ease-out
modal-in:      fade 150ms + slide-up 100ms
modal-out:     fade 100ms + slide-down 50ms
scroll-reveal: translateY(12px)→0, opacity 0→1, 300ms, staggered 50ms/item
page-trans:    crossfade 200ms (no slide/zoom)
reduced-motion: all → instant 0ms
```

### 2.8 UI 组件完整规格

#### 按钮变体

| 类型 | Default | Hover | Disabled |
|------|---------|-------|----------|
| Outline | 透明底 + 酸性绿边 | 酸性绿实心底 + 黑字 | 边框 #444 + 字 #555 |
| Filled | 酸性绿实心底 + 黑字 | 透明底 + 酸性绿字 | 底 #222 + 字 #555 |
| Pink | 透明底 + 粉色边 | 粉色实心底 + 白字 | 边框 #444 + 字 #555 |
| Cyan | 透明底 + 青色边 | 青色实心底 + 黑字 | 边框 #444 + 字 #555 |

#### 表单控件

- `input[text]` / `textarea`: 黑底 + 1px 暗边 + focus 变酸性绿 2px
- `select`: 自定义下拉箭头，无原生 appearance
- `checkbox`: 自定义方框，选中 → 酸性绿底 + 黑勾

#### 通知 Toast

- **Success**: 酸性绿边框 + 酸性绿字
- **Error**: 粉色边框 + 粉色字
- **Info**: 青色边框 + 青色字

#### 焦点指示器

```css
:focus-visible { outline: 2px solid #39FF14; outline-offset: 2px; }
```

#### 状态组件

- **Skeleton 加载**: #2A2A2A 灰块 · 1.5s 呼吸透明度
- **Empty 空状态**: 居中卡片 + `[ ]` + 暂无提示
- **Error 错误态**: 粉色边框卡片 + 失败提示 + 重试按钮

#### 链接

- 正文内链: 酸性绿 + hover 下划线
- 导航链接: 无下划线 + hover 变色
- 外部链接: 虚线 + hover 实线

### 2.9 组件规格总表

| 组件 | 暗色酸性处理 | 动效 | 优先级 |
|------|-------------|------|--------|
| 首页 Hero | 1px 酸性绿边框 + `[ACID FEATURE]` · 无圆角 | 边框呼吸可选 | P0 |
| 文章卡片 | #141414 + 1px 暗边 · hover→酸性绿边框 | 100ms 边框变色 | P0 |
| 导航栏 | `.` 前缀 + 大写 monospace + 当前页绿色 | 100ms 颜色过渡 | P0 |
| 文章详情 | 720px 正文 + 220px sticky TOC · 代码 3px 绿左线 | 滚动 TOC 高亮跟随 | P0 |
| 按钮 | 2px 单色边框 · 直角 · hover 反色填充 | 100ms 背景+颜色切换 | P0 |
| 表单输入 | 黑底 1px 暗边 · focus→酸性绿 2px · 无圆角 | 100ms 边框变色 | P0 |
| 标签/徽章 | `[TEXT]` 方括号 monospace · 单色边框 | 无 | P1 |
| 终端窗口 | 黑底 + 三色点标题栏 + ▶ 提示符 + 绿等宽 | 闪烁光标 | P1 |
| Toast | 黑底 + acid/pink/cyan 边框 + monospace | 150ms fade-in | P1 |
| 搜索 | `$` prompt 风格输入 · Ctrl+K | 50ms 聚焦边框变绿 | P1 |
| Skeleton | #2A2A2A 灰块 · 无圆角 | 1.5s 呼吸 | P1 |
| Empty/Error | 居中卡片 · `[EMPTY]`/`[ERROR]` monospace 标签 | 无 | P1 |
| 评论区 | 2px 边框 textarea + terminal 按钮 | 100ms 边框变色 | P2 |
| ASCII 装饰 | box-drawing 字符分隔线 · CRT scanline | scanline 滚动 | P2 |
| 主题切换 | 浅色: 白底黑字 + 保留酸性绿 | 即时切换 | P2 |

### 2.10 响应式规范

| 断点 | 宽度 | 布局变化 |
|------|------|----------|
| Desktop | ≥ 1024px | 3 列文章 · 文章+TOC 侧栏 · 完整导航 |
| Tablet | 768-1023px | 2 列文章 · TOC 移底部 · 导航保持 |
| Mobile | ≤ 767px | 单列 · TOC 折叠 · 汉堡菜单 · 字体缩小 |

**移动端适配：**
- 导航折叠 ☰ → 全屏展开（无动画）
- H1: `clamp(28px, 8vw, 48px)`
- Section padding: 48px (vs 80px)
- 最小触摸目标: 44×44px
- 按钮间距 ≥ 8px

### 2.11 文章详情页布局

```
┌──────────────────────────────────────────┐
│  导航栏                                   │
├───────────────────────┬──────────────────┤
│                      │   ▶ TOC          │
│  正文区 (720px)       │   ▪ 1. 章节      │
│                      │   ▪ 2. 章节      │
│  代码块 [绿左线]      │   ▪ 3. 章节      │
│  引用块 [粉左线]      │                  │
│  正文链接 [绿下划线]   │  (sticky 220px)  │
│                      │                  │
└───────────────────────┴──────────────────┘
```

**排版规格：**
- 文章标题: 36px / 900 / letter-spacing -1px
- 文章正文: 15px / line-height 1.9 / 颜色 #CCC
- 代码块: 黑底 #0C0C0C + 左 3px 酸性绿线 + JetBrains Mono
- 引用块: 左 3px 粉色线 + 斜体 + muted
- H1→36px 900, H2→24px 800, H3→18px 700

### 2.12 实施路径

| 步骤 | 内容 | 关键文件 |
|------|------|----------|
| 01 | CSS 令牌注入 | `assets/css/extended/design-system.css` |
| 02 | 字体替换 | 加载 Space Grotesk + JetBrains Mono + Noto Sans SC |
| 03 | 组件酸性化 | `assets/css/extended/nav.css`, `comments.css` |
| 04 | 终端 + 动效 | `assets/css/extended/animations.css`, `layouts/partials/footer.html` |

**文件映射：**

| 文件 | 内容 |
|------|------|
| `assets/css/extended/design-system.css` | CSS Variables + 全局样式 + 排版 |
| `assets/css/extended/animations.css` | 动效 @keyframes + transition 规则 |
| `assets/css/extended/nav.css` | 导航栏 · 酸性标签 · 汉堡菜单 |
| `assets/css/extended/comments.css` | 评论区粗野化 |
| `layouts/partials/header.html` | 导航 HTML · 用户菜单 |
| `layouts/partials/auth-modal.html` | 登录弹窗 · GitHub 按钮 |
| `layouts/partials/footer.html` | 页脚 · ASCII 装饰 |
| `layouts/_default/single.html` | 文章页 TOC 侧栏 · 代码块 |
| `hugo.yaml` | Google Fonts · fuseOpts |

---

## 三、架构总览

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

## 四、目录结构

```
blog/
├── hugo.yaml                      # Hugo 核心配置
├── PROJECT.md                     # 本文档
├── design-proposal-brutalist.html # 暗色酸性粗野设计方案 (浏览器可看)
├── design-proposal.html           # 深色编辑风方案
├── README.md                      # 交接文档
├── blog-system-requirements.md    # 博客系统需求文档
├── supabase-setup.sql             # Supabase 数据库迁移
├── .gitignore / .gitmodules
│
├── archetypes/
│   └── default.md
│
├── assets/css/extended/           # PaperMod CSS 注入点
│   ├── design-system.css
│   ├── animations.css
│   ├── nav.css
│   ├── comments.css
│   ├── admin-workspace.css
│   ├── z-mission.css
│   ├── zz-gritty-editorial.css
│   └── zzz-glass-blog.css
│
├── content/
│   ├── posts/hello-world.md
│   ├── about.md     (layout: page)
│   ├── search.md    (layout: search)
│   ├── archives.md  (layout: archives)
│   ├── profile.md   (layout: profile)
│   └── admin.md     (layout: admin)
│
├── layouts/
│   ├── index.html
│   ├── _default/
│   │   ├── profile.html
│   │   └── admin.html
│   └── partials/
│       ├── header.html
│       ├── auth-modal.html
│       ├── comments.html
│       ├── extend_head.html
│       └── extend_footer.html
│
├── static/
│   ├── favicon.svg
│   ├── images/
│   ├── admin-cms/
│   │   ├── index.html
│   │   └── config.yml
│   └── js/
│       ├── supabase.js     # Supabase 客户端 + Auth/Profile/Admin/Comment
│       ├── auth-ui.js      # 登录/注册弹窗
│       ├── profile.js      # 个人中心
│       ├── admin.js        # 管理后台
│       ├── comments.js     # 评论
│       ├── home.js         # 首页
│       └── app.js          # 主题 JS
│
├── themes/PaperMod/              # Git Submodule
│
└── .github/workflows/
    └── deploy.yml
```

---

## 五、Hugo 配置 (`hugo.yaml`)

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
      unsafe: true

outputs:
  home:
    - HTML
    - RSS
    - JSON

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

## 六、Supabase 后端

### 6.1 连接信息

| 配置项 | 值 |
|--------|-----|
| Supabase URL | `https://iyquixzprfwkglaqptxj.supabase.co` |
| Anon Key | `sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT` |
| 定义位置 | `static/js/supabase.js:1-2` |

### 6.2 客户端初始化

```js
const SUPABASE_URL = 'https://iyquixzprfwkglaqptxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT';

var blogSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});
```

### 6.3 JS 服务模块

| 模块 | 暴露为 | 功能 |
|------|--------|------|
| Auth | `window.Auth` | 注册/登录/登出/GitHub OAuth/密码重置/会话监听 |
| Profile | `window.Profile` | 读取/更新资料、头像上传、GitHub 头像同步 |
| Admin | `window.Admin` | 管理后台 |
| MediaService | `window.MediaService` | 文件上传 |
| CommentService | `window.CommentService` | 评论 CRUD |

### 6.4 关键 API

```js
// === Auth ===
Auth.signUp(email, password)
Auth.signIn(email, password)
Auth.signInWithGitHub()
Auth.signOut()
Auth.resetPassword(email)
Auth.user()           // → Promise<user | null>
Auth.session()        // → Promise<session | null>
Auth.onAuthChange(fn)

// === Profile ===
Profile.get()
Profile.update({ username, display_name, bio, website })
Profile.uploadAvatar(file)
Profile.syncGithubAvatar()
```

### 6.5 Supabase 控制台配置

| 配置项 | 路径 | 值 |
|--------|------|-----|
| GitHub Provider | Auth → Providers → GitHub | Client ID + Secret |
| Redirect URLs | Auth → URL Configuration | `https://blog-go3.pages.dev/**`, `https://levia808.github.io/**` |
| Site URL | Auth → URL Configuration | `https://blog-go3.pages.dev` |

---

## 七、GitHub OAuth 认证流程

### 7.1 OAuth App 配置

| 项 | 值 |
|----|-----|
| Client ID | `Ov23lij9x9gnpRXSOY8w` |
| Client Secret | 仅存储在 Supabase 控制台 |
| Callback URL | `https://iyquixzprfwkglaqptxj.supabase.co/auth/v1/callback` |
| 创建位置 | https://github.com/settings/developers |

### 7.2 登录流程

```
点击"GitHub 登录"
→ auth-ui.js 调用 Auth.signInWithGitHub()
→ supabase.js 调用 blogSupabase.auth.signInWithOAuth({ provider:'github' })
→ Supabase → GitHub OAuth URL
→ 用户在 GitHub 授权
→ GitHub → Supabase callback
→ Supabase 302 → redirectTo URL (blog-go3.pages.dev/profile/)
→ detectSessionInUrl 提取 session
→ updateAuthUI() 更新界面
```

### 7.3 redirectTo 处理

```js
var profileUrl = window.location.origin + '/profile/';
if (window.location.hostname === 'levia808.github.io') {
  profileUrl = window.location.origin + '/blog/profile/';
}
```

### 7.4 Fallback 容错

点击 GitHub 登录后：
1. 先尝试 Supabase signInWithOAuth
2. 3 秒内未跳转 → 直接打开 GitHub OAuth 授权链接
3. Supabase 报错 → alert 显示错误

### 7.5 排障记录

| 问题 | 原因 | 修复 |
|------|------|------|
| `redirect_uri is not associated` | GitHub OAuth App 无回调 URL | 添加 Supabase 回调 |
| 点击登录 404 | 旧 OAuth App 被删除 | 重建 App |
| 登录后 404 | GitHub Pages 缺 `/blog/` 前缀 | supabase.js hostname 判断 |
| profile.js 404 | Markdown 中 `{{ }}` 未处理 | 硬编码路径 |
| 登录静默失败 | .catch() 缺失 | alert + fallback |

---

## 八、登录/注册弹窗

**文件:** `layouts/partials/auth-modal.html`

**面板：**
- 登录 (`#authLogin`): 邮箱 + 密码 → `Auth.signIn()`
- 注册 (`#authRegister`): 显示名 + 邮箱 + 密码 → `Auth.signUp()`
- 找回密码 (`#authForgot`): 邮箱 → `Auth.resetPassword()`
- GitHub (`#githubLogin`): → `Auth.signInWithGitHub()`

**触发入口：** 导航栏 `#navLoginBtn` / 评论框提示 / Profile 页

**用户菜单 (登录后)：**
- 个人中心 → `/profile/`
- 管理后台 → `/admin/` (仅管理员)
- 登出

---

## 九、CMS 后台

| 项 | 值 |
|----|-----|
| CMS | Sveltia CMS (Decap CMS 兼容) |
| 配置 | `static/admin-cms/config.yml` |
| 入口 | `static/admin-cms/index.html` |
| 认证 | GitHub OAuth（独立 App） |
| 后端 | GitHub API（操作仓库文件） |
| 站点 URL | `https://blog-go3.pages.dev` |

---

## 十、评论区

- Supabase 原生评论（非 Giscus）
- 登录后可评论 · Markdown 预览
- JS: `static/js/comments.js`
- 样式: `assets/css/extended/comments.css`
- HTML: `layouts/partials/comments.html`

---

## 十一、数据库 (`supabase-setup.sql`)

### 核心表

| 表 | 字段 |
|----|------|
| `profiles` | id, username, display_name, bio, website, avatar_url, role |
| `comments` | 关联 profiles + 文章路径 |
| `uploads` | 文件上传记录 |
| `auth.users` | Supabase 内置 |
| `auth.identities` | OAuth 身份 |

### 角色体系

| 角色 | 列值 | 说明 |
|------|------|------|
| 超级管理员 | `role = 'superadmin'` | GitHub 登录 `levia808` 自动获得 |
| 管理员 | `role = 'admin'` | SQL 手动设置 |
| 作者 | `role = 'author'` | CMS 内容编辑 |
| 注册用户 | `role = 'user'` | 默认 |

---

## 十二、部署配置

### Cloudflare Pages（主站）

| 项 | 值 |
|----|-----|
| 仓库 | `Levia808/blog` · 分支 `main` |
| 框架 | Hugo |
| 构建命令 | `hugo` |
| 输出目录 | `public` |
| 环境变量 | `HUGO_VERSION = 0.164.0` |
| URL | `https://blog-go3.pages.dev/` |

### GitHub Pages

| 项 | 值 |
|----|-----|
| 触发 | push main → GitHub Actions |
| Workflow | `.github/workflows/deploy.yml` |
| URL | `https://levia808.github.io/blog/` |

### GitHub Actions

```yaml
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

## 十三、本地开发

```bash
cd /home/levia/blog
export PATH="$HOME/.local/bin:$PATH"

# 新建文章
hugo new content posts/my-post.md

# 本地预览 (含草稿)
hugo server -D
# → http://localhost:1313/blog/

# 构建
hugo

# 推送
git add -A && git commit -m "描述" && git push
```

---

## 十四、Git 配置

| 项 | 值 |
|----|-----|
| 远程 | `https://github.com/Levia808/blog.git` |
| 分支 | `main` |
| 用户名 | Levia808 |
| 邮箱 | `Levia808@users.noreply.github.com` |
| 认证 | HTTP Token + credential-helper store |
| 代理 | `http://127.0.0.1:7897`（仓库级 `git config http.proxy`） |

> `/etc/hosts` 将 github.com 映射到 `127.0.0.1`，终端需代理。浏览器不受影响。

---

## 十五、注意事项

1. 文章 `draft: true` → 改为 `false` 才发布
2. `hugo.yaml` 已配 `unsafe: true`，支持 Markdown 内嵌 HTML
3. 自定义布局: `layouts/_default/<name>.html` 对应 `layout: <name>`
4. CSS 注入: `assets/css/extended/*.css`，PaperMod 自动加载
5. **不要改 PaperMod 源码**（Git Submodule，更新会丢失）
6. **Client Secret 永不在代码中**，仅 Supabase 控制台
7. Markdown 正文中的 `{{ }}` 不会被 Hugo 处理，需在布局文件中使用

---

## 十六、文件速查

| 改动目标 | 文件 |
|----------|------|
| 站点配置 | `hugo.yaml` |
| 新文章 | `hugo new content posts/xxx.md` |
| 首页样式 / CSS 变量 | `assets/css/extended/design-system.css` |
| 动效 / @keyframes | `assets/css/extended/animations.css` |
| 导航栏 | `layouts/partials/header.html` + `assets/css/extended/nav.css` |
| 登录弹窗 | `layouts/partials/auth-modal.html` |
| 认证逻辑 | `static/js/supabase.js` + `static/js/auth-ui.js` |
| 个人中心 | `static/js/profile.js` + `content/profile.md` |
| 评论区 | `static/js/comments.js` + `layouts/partials/comments.html` + `assets/css/extended/comments.css` |
| 管理后台 | `static/js/admin.js` + `static/admin-cms/config.yml` |
| 文章详情页 | `layouts/_default/single.html`（覆盖主题） |
| 页脚 / ASCII | `layouts/partials/footer.html` |
| Supabase SQL | `supabase-setup.sql` |
| CI/CD | `.github/workflows/deploy.yml` |
| 设计稿 (深色编辑风) | `design-proposal.html` |
| 设计稿 (暗色酸性粗野) | `design-proposal-brutalist.html` |

---

<p align="right"><em>文档版本: v5.0 · 2026-08-07 · Levia808</em></p>
