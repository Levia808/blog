# 📋 博客项目 · LLM 交接文档（持续更新）

> 用途：任意 LLM / 新开发者可凭本文档无缝接手工作。
> 更新规则：每次任务完成后追加「工作日志」并刷新状态，保持本文档为唯一事实源。
> 最后更新：2026-08-13 · opencode（本地未提交：串文卡片多图预览/查看优化 + 图片持久化/预览图生成；新增「感知」页设计稿 `perception-page/`）

---

## 0. 项目速览

| 项 | 值 |
|----|-----|
| 本地路径 | `/home/levia/blog` |
| 仓库 | `https://github.com/Levia808/blog`（main 分支） |
| **主站（用户访问）** | `https://blog-go3.pages.dev/`（**Cloudflare Pages**） |
| 镜像站 | `https://levia808.github.io/blog/`（GitHub Pages） |
| 框架 | Hugo **v0.164.0 extended**（webp 图像处理必须 extended） |
| 主题 | **brutalism**（自制独立主题 `themes/brutalism/`，无正式版本号） |
| 内容管理 | **Sveltia CMS**（`/admin-cms/`）+ **自定义后台**（`/admin/`） |
| 后端 | Supabase（Auth / DB / Storage `media`+`avatars`+`threads-reposts` 桶）+ Edge Functions `threads-fetch`/`threads-login`（已部署） |
| Threads 转发 | 动态正文贴链接→自动渲染官方 embed 风格卡片；本地 Cookie 桥（`threads-repost/bridge/`）+ 自动爬取 |
| 动态页 | 发布/点赞/评论树/地点/可见性/编辑/实时同步 + Threads 串文卡片 |
| 语言 | zh-cn ｜ 作者 Levia（GitHub: Levia808） |

**git 凭证**：`~/.git-credentials`（token，python 可提取用于 GitHub API）。
**代理**：github 等需 `http://127.0.0.1:7897`（仓库级 git 代理已配；unpkg/google fonts 直连）。
**Docker**（Windows 开发）：`Dockerfile` + `docker-compose.yml`（`ghcr.io/gohugoio/hugo:v0.164.0`，`docker compose up` → :1313，Windows bind mount 使用 `--noTimes`）。

---

## 1. 技术架构

```
┌─ 前端: Hugo 静态站 (themes/brutalism 独立主题)
│   ├─ 首页: 100vh 终端欢迎页 (打字机 + 可变字体字重插值 + 管理员头像磁性吸附)
│   ├─ 文章卡片: 三种样式 grid / horizontal / fullscreen(全屏杂志封面, 支持视频封面)
│   ├─ 文章页: 底部横幅 + 悬浮目录(弹性回弹) + 正文标题取自 md 内容
│   ├─ Fuse.js 搜索 (Ctrl+K) · 深/浅主题 · 乱码转化 hover · 封面视差
│   └─ 字体: Playfair/Grotesk/Mono 已自托管 (static/fonts, 零 Google 依赖)
├─ CMS: /admin-cms/ Sveltia CMS (Supabase 门禁 + GitHub OAuth 经 Worker)
│   └─ 文章编辑器: 自定义字体控件(上传/资源库/预览) + 视频/音频组件
├─ 后台: /admin/ 自定义面板 (Supabase RPC + GitHub API)
│   └─ 仪表盘/文章管理/媒体库(含上传进度条)/系统设置(字体预览)/GitHub 发布
├─ 后端: Supabase (Auth/DB/Storage + RPC: admin_*, get_my_profile 等)
└─ 部署: GitHub Actions (构建) → GH Pages + CF Pages (主站)
```

---

## 2. 部署链路（双线）

```
push main
 ├─ GitHub Actions (deploy.yml):
 │    1. gen-fonts.py     生成 static/fonts.json (字体清单) + 发布 assets 字体副本
 │    2. 视频自动重编码   .github/transcode.py (HEVC/AV1 → H.264, 降 1080p)
 │    3. hugo --minify    --baseURL https://levia808.github.io/blog/
 │    4. deploy-pages     → GH Pages (levia808.github.io/blog/)
 └─ Cloudflare Pages webhook → CF 独立构建 (blog-go3.pages.dev, 主站)
```

**⚠️ 已知风险（重要）**：CF Pages 曾在 2026-08-08 14:35 后停更（构建未更新，编辑器页面长期旧版）。
代码/CI 均正常（Actions success），**需用户检查 CF 面板构建状态**（dash.cloudflare.com → Pages → blog-go3 → Deployments）。
验证部署版本：`curl https://blog-go3.pages.dev/js/theme.js | grep initVideoLoading`（新版必有）。

---

## 3. Threads 串文转发系统（动态转发卡片）

> 动态正文粘贴 Threads 链接 → 自动渲染官方 embed 风格卡片（头像/正文/图片/翻译）。
> 卡片数据存 `threads-reposts` 桶的 `<postId>.json`，由「本地 Cookie 桥」+ Edge Function 生成。

### 3.1 架构

```
动态页 (moments.js)
 ├─ 正文识别 threads 链接 → 读桶 <id>.json → 渲染卡片
 │    └─ 资源缺失时: 检测本机桥 (localhost:8788) → 自动爬取生成 (无需手动)
  ├─ 卡片: 头像 / 正文+翻译按钮 / 多图(2张/页统一高度轮播, 点击放大) / 仅页脚跳转
  │    └─ 图片: 卡片显示低分辨率预览图 (media[].preview), 放大查看用原图 (media[].url=data-orig)
  │       原图/预览均由 Edge Function 服务端代拉转存桶内 (解决 fbcdn 签名 URL 过期)
 └─ 地点搜索: Nominatim (accept-language=zh-CN 中文地理编码) + Photon 附近POI兜底

本地 Cookie 桥 (threads-repost/bridge/) —— 必须本机运行
 ├─ bridge.py        : 零依赖 Python (标准库+自研最小WS客户端), 端口 8788 仅绑 127.0.0.1
 │    ├─ /api/status · /api/open · /api/cookies · /api/fetch · /api/close (均 CORS+Private-Network 头)
 │    ├─ /api/cookies : 读调试 Chrome 的 HttpOnly cookie (CDP Network.getAllCookies), 用真实爬取验证有效性
 │    └─ /api/fetch   : 导航标签→等渲染→DOM 提取 (正文/时间/媒体/头像/互动), 目标失效自动重开标签
 ├─ chrome-debug.sh/.bat : 一键启动 调试Chrome(:9222, 独立profile) + 桥
 └─ 浏览器登录 = 真实 Chrome 登录 threads.com (2FA/验证码原生支持)

Edge Functions (threads-repost/supabase/functions/, 已部署至 iyquixzprfwkglaqptxj)
  ├─ threads-fetch  : 两种模式
  │    ① {json: 桥提取的数据} → 校验+入库 (推荐, 头像 fbcdn 被 CORP 拦 → 服务端代拉转存桶内公开URL)
  │       图片同样服务端代拉: 下载原图转存 `media/<id>/<i>.<ext>` + 预览用 Storage 图像转换按需生成
  │       (media[].url=原图公开URL, media[].preview=render/image URL?width=640&quality=80&resize=contain; 卡片用预览/放大用原图)
 │    ② {url, cookie} → 服务端直爬 og 解析 (已废弃: Threads 改客户端渲染无 og, 仅兜底)
 │    桶缺失自动创建(public), 响应含 CORS 头
 └─ threads-login  : IG Web 登录接口取 sessionid (明文格式优先, AES-GCM+NaCL sealedbox 降级)
```

### 3.2 文件与部署

```
threads-repost/
├── supabase/functions/threads-fetch/index.ts    # 入库函数 (CORS+桶自愈+头像转存)
├── supabase/functions/threads-login/index.ts    # 账号密码登录 (双格式加密)
├── bridge/bridge.py                             # 本地 Cookie 桥 (端口 8788)
├── bridge/chrome-debug.sh / chrome-debug.bat    # 一键启动器
└── README.md                                    # 完整方案文档
static/js/moments.js                             # 卡片渲染/轮播/翻译/自动爬取/地点
themes/brutalism/assets/css/features.css         # 卡片样式 (.th-*)
themes/brutalism/layouts/partials/scripts.html   # moments.js/admin.js 已加 ?v= 版本号防缓存
```

部署命令（**link 状态会丢失，必须与 deploy 合并同一条命令执行**）：
```bash
cd threads-repost
supabase link --project-ref iyquixzprfwkglaqptxj && supabase functions deploy threads-fetch --no-verify-jwt
supabase functions deploy threads-login --no-verify-jwt
```

### 3.3 使用流程

1. 双击 `bridge/chrome-debug.sh`（自动开调试 Chrome + 桥，登录态存 `~/.threads-debug-chrome`）
2. 后台「平台管理」→「浏览器登录」：弹真实 Chrome → 登录 threads.com → 自动读取并验证 Cookie
3. 动态页发布含 Threads 链接的动态 → 卡片自动生成（桥在跑时无需任何手动操作）
4. 后台也可手动「测试连接 / 爬取串文」（链接支持 threads.net 与 threads.com）

### 3.4 技术要点 / 踩坑记录（重要）

- **iframe 反代登录不可行**：IG 登录 SPA 对非官方来源 API 返回 `error 1357055`，且 `X-Frame-Options: DENY`——业界一致走真实浏览器自动化
- **og:description 已废弃**：Threads 帖页无论登录与否都不再输出 og 元数据（纯客户端渲染）——必须浏览器渲染后 DOM 提取；服务端 GraphQL 复刻被拒（1357004，需大量运行时状态参数）
- **supabase-js v2 对非 2xx 不 reject**：resolve 成 `{data:null, error: FunctionsHttpError}`——调用方须先查 `res.error`，真实原因在 `await error.context.json()`
- **Edge Function CORS**：预检 OPTIONS 会被路由进函数，必须显式返回 204 + CORS 头；所有响应加 `Access-Control-Allow-Origin: *`
- **`createClient` 不自动注入**：须 `import { createClient } from 'jsr:@supabase/supabase-js@2'`
- **fbcdn 头像带 CORP: same-origin**：浏览器跨站加载必被拦 → Edge 端代拉后转存桶内公开 URL
- **桥目标失效**（No such target id）：自动重开标签（曾导致自动爬取静默失败）
- **Photon 不支持 lang=zh**（返回空）；**Nominatim 支持 `accept-language=zh-CN`** 原生中文地理编码（限速 1 请求/秒，需 User-Agent + 串行节流）
- **多图布局**：2 张/页 + 统一高度（`h=(宽-间距)/max(页内宽高比之和)`，限幅 180–520px）；圆点按页数生成
- **浏览器缓存**：moments.js/admin.js 已加 `?v={{now.Unix}}`，否则部署后旧 JS 滞留（曾致自动爬取"没生效"）
- **图片预览用 Storage 图像转换（render/image）**：Edge Function 只下载原图转存（fetch+upload，零图像库依赖），预览用 `object/public` → `render/image/public` URL + `?width=640&quality=80&resize=contain` 按需生成（项目已启用 Image Transformations，CDN 缓存）。⚠️ **踩坑**：最初用 `npm:@imagemagick/magick-wasm@0.0.8`（wasm 内嵌 base64 约 9.8MB）在 Edge Function 生成预览，部署成功但运行时报 `BOOT_ERROR (Function failed to start)`——emscripten 模块在 Supabase Edge Runtime 启动即崩，已弃用改用 render/image

### 3.5 已知限制

- 自动爬取依赖**本机桥**（localhost:8788）——访客/其他设备浏览时缺失资源降级为链接文本；桥不可达时后台「测试连接」自动降级服务端直爬（多已失效）
- threads 图片为 fbcdn 临时签名 URL（会过期）——**已缓解**：新增爬取时 Edge Function 服务端代拉原图+预览转存桶内（永不过期）；仅「旧存量帖子」（已存 JSON、未重新爬取）仍可能保留过期 fbcdn URL，需重新爬取一次才迁移
- 卡片正文截断 UI 噪音（翻译/热门/查看动态等）为黑名单式，Threads UI 改版后可能需补充
- 繁简变体地点（涩谷/澀谷）保留为两条不合并（防误并同区域不同地点）

---

## 4. 数据库（Supabase）

| 项 | 值 |
|----|-----|
| 项目 ref | `iyquixzprfwkglaqptxj`（`static/js/supabase.js` 内 URL + anon key） |
| Edge Functions | `threads-fetch` / `threads-login`（`--no-verify-jwt` 部署；CORS 已在函数内处理） |
| 存储桶 | `media`（媒体库）· `avatars`（头像）· `threads-reposts`（串文 JSON，public，缺失自动创建） |

**核心表**（对应 `supabase-*.sql`，仓库根）：

| 表 | 说明 | 相关 SQL |
|----|------|----------|
| `profiles` | 用户资料（display_name/role/account_status/github 等） | `supabase-setup.sql` |
| `moments` | 动态（content/media/location{name,lat,lng}/visibility/visible_to/hidden_from） | `supabase-moments.sql` + `-fix` + `-location` + `-visibility` |
| `moment_likes` | 点赞 | 同上 |
| `moment_comments` | 评论（含 `parent_id` 树状回复） | `supabase-moments-fix.sql` + `supabase-comments-thread.sql` |
| `moment_comment_likes` | 评论赞 | 同上 |
| `media` | 媒体库资产 | `supabase-setup.sql` |
| `comments` | 文章评论区（树状回复，独立于动态） | `supabase-comments-thread.sql` |

**注意**：
- 前端查询有多级降级链（新版表关系 → 旧表），未执行的 SQL 会导致部分功能缺失（评论 RLS/地点字段/Realtime），见待办
- RPC：`admin_*`（后台管理）、`get_my_profile` 等定义于 `supabase-setup.sql`
- `threads-reposts` 桶 public 读取无需策略（存储服务按 bucket.public 放行）

---

## 5. 数据 / 配置（全部后台可编辑）

| 文件 | 内容 | 后台入口 |
|------|------|----------|
| `data/site.yaml` | 作者/头像URL/描述/功能开关/社交 | 站点设置 |
| `data/cards.yaml` | 卡片样式 grid/horizontal/fullscreen（当前 **fullscreen**） | 卡片样式 |
| `data/welcome.yaml` | 打字机/字重插值/ShapeBlur/火花参数 | 欢迎页配置 |
| `static/fonts.json` | **字体清单（单一权威）**：构建扫描 + 上传增量更新 | — |
| `static/fonts/*.css|woff2` | Playfair/Grotesk/Mono 自托管字体 | — |

**主题参数读取**：模板统一 `$P := site.Data.site`（site 数据优先，回退 `site.Params`）。
⚠️ 数据文件须 YAML（Sveltia 不解析 TOML——历史教训：welcome.toml 曾致 CMS 不可编辑）。

---

## 6. 功能清单（当前全量）

### 前端
- 终端欢迎页：打字机、VariableProximity 字重插值、ShapeBlur(THREE)、火花、**管理员头像**（Supabase `profiles` 动态查询，居中 280px 圆形，标题 `mix-blend-mode: difference` 重合反相，磁性吸附 ±18px）
- 文章卡片三样式；**fullscreen 全屏杂志封面**：封面图(webp 懒加载)/**封面视频**(muted 循环自动播放、2px 细进度条、进入视口播放、首帧+spinner 占位)；hover 乱码转化(韩/日/西里尔) + 封面视差
- 文章页：底图(webp)或视频横幅、**悬浮目录**(固定于文章容器顶部、滚动弹性回弹 ±26px、scrollspy 高亮)、**标题只展示 md 正文**(front matter 标题不显示)
- 标题系统：**字体选择**(9 内置 + 自定义上传)、最多 5 行换行(`\|` 或 `<br>` 手动断行)、颜色/不透明度、`entry_scramble` 乱码开关
- 字体自托管（无 Google CDN 依赖）、登录/注册页、搜索、深/浅主题

### 编辑器字体控件（复杂度最高，勿回退到旧架构）
- 架构：**独立 `font-preview.js` + `font-preview.css` + DOM 委托**（MutationObserver 发现 Sveltia 重渲染，requestAnimationFrame 批量刷新）——控件 UI 可重建，逻辑和字体缓存不丢失
- 能力：内置 9 字体下拉 / **上传自定义字体**（本地 blob 立即预览 + GitHub Contents API PUT + 进度条 + `updateFontList` 增量更新 fonts.json）/ 资源库面板（读 fonts.json, session 缓存）/ 实时预览（标题、日期、摘要、颜色、透明度、对齐、隐藏标题）
- 关键函数：`uploadFontToGitHub` / `updateFontList` / `ensureSelectOption` / `optionValues(value)` / `ensureFontFace(path, family, version)`
- **陷阱**：`dispatchEvent` 必须 `bubbles: true`（React onChange）；select 赋值前 `ensureOption`；模板 `$fontCustom` 判定支持「值=路径」(`findRE` 扩展名)；style 需 `safeCSS`（否则 ZgotmplZ）

### 动态页（moments.js，全站交互最重模块）
- 发布：正文(markdown 轻渲染) + 多图/视频（grid 3:3 裁切、>9 收起 +N、GLightbox 放大、触控板横滑/双指下滑手势）+ **地点**（Nominatim 中文地理编码 / Photon 附近 POI，三通道选择，`location {name,lat,lng}`）
- 列表：**diff 渲染**（id+数据 key 对比，未变卡复用 DOM 零重载图）、单图等大占位、preview 缩略图 Cache API 持久化、长图 280px 收拢动画
- 互动：点赞(anime 心形迸发)/评论（**树状回复**：嵌套子树+边线、内联回复条自动收起）/评论赞/实时同步（postgres_changes 双向去重）
- 管理：编辑（媒体排序/增删/替换 + 地点 + 内容）、删除、**可见性**（公开/只让谁看/不让谁看，RLS 强制）
- **Threads 串文卡片**：正文链接识别→读桶 JSON→渲染官方 embed 风格卡（头像/正文/翻译按钮/多图轮播 2张/页统一高度/点击放大 GLightbox/仅页脚跳转）；资源缺失时检测本机桥自动爬取（详见 §3）

### 后台（admin.js + admin.html）
- 仪表盘（统计/最近文章）、文章管理（GitHub 发布/草稿/归档/删除，GitHub OAuth 经 Worker）、内容归档、评论审核、用户管理（角色/状态）、媒体库（上传进度/嵌入代码/删除）
- 系统设置：欢迎页配置、导航行为、卡片样式、字体预览（GitHub 读写 data/*.yaml）
- **平台管理**（§3）：浏览器登录（本地桥）/账号密码登录（threads-login）/Cookie 管理/爬取串文

### 媒体/上传
- 后台媒体库上传（Supabase `media`，类型白名单含字体 font/* + 扩展名兜底，进度条）
- 后台/编辑器上传字体 → 同步 GitHub `assets/images` + 更新 fonts.json
- 构建时视频转码（HEVC/AV1 → H.264）

---

## 6.5 设计稿清单（仓库根 design-*.html，浏览器直接打开预览）

| 文件 | 内容 | 状态 |
|------|------|------|
| `design-about.html` | **关于页 V3（精简版）**：仅保留开屏 hero（字符级 stagger 入场、LOCATION=江苏南京）+ 页末 LET'S TALK ↗（磁吸+箭头位移+变色）；背景粒子已去除；光标改为 **Win11 风格混合光标**（平时原生指针、hover 交互元素平滑 morph 圆形 + lerp 缓动跟随 + 12% 向元素中心吸附、点击收缩、触屏禁用）——方案调研：imsyy/home cursor.js / vue-cursor-fx 成熟模式（22 项 puppeteer 冒烟通过） | ✅ 已打包至 `about-page/`（含 README 文档，待确认后集成上线） |
| `design-moment-location.html` | **动态发布地点**：三通道选择（GPS 定位识别 / 附近地点 / 搜索指定）+ 面板/chip/卡片左下角灰色小字展示，可交互 demo（17 项自动化验证通过） | ✅ 已上线（SQL `supabase-moments-location.sql` 需用户执行后发布才可存地点） |
| `design-comment-tree.html` | **动态评论树状回复**：多层嵌套缩进+边线、内联回复输入条（发送/取消/Esc/点击外部自动收起隐藏）、可交互 demo（13 项自动化验证通过） | ✅ 已上线（集成 moments.js + features.css） |
| `design-nav-hero.html` | 导航+标题+开屏欢迎（MOD × Odin's Crow：滚动变形/均分导航/渐变线组/标语栏/光标） | 设计稿 |
| `design-loader.html` | 瑞士风加载屏 V2：描边 LEVIA 字符 stagger、进度补间、状态打字机、网格漂移、完成态动画组、分层退出 | 设计稿 |
| `design-home.html` | **加载 → 首页联动**（描边标题填实、进度衔接线条组、导航均分就绪、滚动收拢） | 设计稿（站点优化参照） |
| `perception-page/design-perception.html` | **感知页（音乐/电影/书籍）**：左文右卡分屏（44/56）+ CardSwap 式 3D 卡组 + 滚轮/点击交互（连续相位模型可打断、`power2.out` 缓动、文字延后到新卡落位才切） | ✅ 设计稿就绪（`perception-page/`，含 README，待集成） |

> 站点已实现：加载动画优化（d52268d 本地）+ 首页 hero（LEVIA 描边→实心、线条组、变形导航均分→收拢）。

## 7. 代码地图

```
themes/brutalism/
├─ layouts/index.html          首页(欢迎页+头像+卡片列表)
├─ layouts/_default/
│  ├─ single.html              文章页(标题取自md/悬浮目录/视频底图)
│  ├─ login.html               登录/注册分屏页
│  └─ admin.html / profile.html / moments.html 等
├─ layouts/partials/post-card.html   卡片三样式+视频封面+标题字体/颜色/换行
├─ layouts/shortcodes/video.html     内嵌视频(加载动效+点击播放兜底)
├─ assets/css/main.css         全部样式(bundle 构建)
└─ static/js/theme.js          全站动效(欢迎页/乱码/视差/目录回弹/视频)
static/
├─ admin-cms/index.html        Sveltia CMS 门禁+注册(字体控件/视频组件)
├─ admin-cms/config.yml        Sveltia 集合(文章/页面/站点设置/卡片样式/欢迎页)
├─ js/admin.js                 自定义后台(GitHub 发布/媒体库/字体同步)
├─ js/supabase.js              Supabase 服务层(Profile/Admin/Comments/媒体)
├─ fonts/ + fonts.json         自托管字体 + 字体清单(权威)
└─ images/                     字体副本(构建发布)
.github/
├─ workflows/deploy.yml        CI(字体清单→转码→构建→部署)
├─ gen-fonts.py                字体清单生成
└─ transcode.py                视频转码
data/                          site.yaml/cards.yaml/welcome.yaml
supabase-*.sql                 数据库(RLS/RPC/表结构)——**未执行的部分见待办**
Dockerfile + docker-compose.yml  Windows 开发环境
threads-repost/                Threads 转发系统 (bridge/ + supabase/functions/, 详见 §3)
about-page/ · perception-page/  设计稿打包 (design-*.html + README)
float-player/                  悬浮播放器实验 (aplayer 主题 + player.js)
design-*.html                  设计稿 (浏览器直接打开, 见 §6.5)
```

---

## 8. 开发约定（务必遵守）

1. **改动后**：`hugo --minify` 验证 0 ERROR，再 `git push`
2. **提交前**：`git pull --rebase origin main`（远端常有用户 CMS 提交）
3. **CMS/配置改动**：修改 `static/admin-cms/config.yml` 后必须 `yaml.safe_load` 校验；**posts collection 字段名唯一**（重名=编辑器打不开）
4. **编辑器页面 JS**（admin-cms/index.html）：改完必须提取 `<script>` 跑 `node --check`（语法错误=整个编辑器白屏，历史事故）
5. **数据文件**：一律 YAML；欢迎页配置保存时 `titleVariationFrom/To` 双引号转义（嵌套单引号曾致构建全挂）
6. **视频**：上传前确认 H.264（HEVC 桌面 Chrome 无法解码）；构建会自动转码
7. **字体文件**：上传后需同步 `assets/images` + `fonts.json`（编辑器/后台上传已自动处理）
8. **git 代理**：若 push 失败，检查 `http://127.0.0.1:7897`

---

## 9. 已知问题 / 风险

| # | 问题 | 状态/建议 |
|---|------|-----------|
| 1 | ~~CF Pages 主站停更~~ | ✅ 已恢复（近期多次部署正常，`blog-go3.pages.dev` 与 GH Pages 均最新） |
| 2 | 楷体预览依赖系统字体（mac 无 KaiTi → 回退衬线） | 需楷体请上传自定义字体 |
| 3 | 动态评论/头像上传可能 RLS 缺失 | 数据库 SQL 见 `supabase-*.sql` 与待办 |
| 4 | 文章页无 front matter 标题（只显示 md 内容） | 设计如此；正文写 `# 标题` 即显示 |
| 5 | 本机 Docker daemon 未运行 | Windows 上用 Docker Desktop |
| 6 | 旧文章 `entry_title_font: custom` 无文件 → 回退 serif | 用编辑器重选即可 |

---

## 10. 待办（下一步任务建议）

- [x] **P0** 部署 Edge Function `threads-fetch` / `threads-login`（已部署, `--no-verify-jwt`）
- [ ] **P1** 部署 Edge Function `admin-create-user --no-verify-jwt`（`threads-repost/supabase/` 目录）——否则后台「新增账号」报错
- [ ] **P1** 感知页集成：设计稿 `perception-page/design-perception.html` 迁入 `perception.html` + 数据 `data/perception.yaml` + Lenis 滚轮冲突协调（`data-lenis-prevent-wheel` 或局部停用）
- [x] **P0** 推送本地未推送提交 `d52268d`（加载动画优化 + 导航收集修复）
- [x] **P0** 用户确认 Cloudflare Pages 构建已恢复（此前字体 25MiB 超限已修复：南西油墨宋/寒蝉拙楷体已子集化）
- [ ] **P1** 设计稿（design-loader/design-home）确认后集成到站点（当前站点加载动画已应用 d52268d 优化）
- [ ] **P1** 执行数据库 SQL（若未执行）：动态评论 RLS（`moment_comments` insert 策略）、`avatars` 桶上传策略、`profiles` 更新策略——**动态修复见 `supabase-moments-fix.sql`（一键幂等，含 Realtime 发布）**；地点字段需 `supabase-moments-location.sql`（发布才可存地点）
- [ ] **P1** 用户验收：编辑器字体上传→预览→封面生效全链路；欢迎页头像随个人主页更新
- [ ] **P2** 主题加 `version` 字段（便于版本追踪）
- [ ] **P2** 楷体等中文系统字体预览降级提示优化
- [ ] **P3** 编辑器字体控件：上传后 fonts.json 更新失败时的重试/提示增强

---

## 11. 工作日志（最近）

| 日期 | 提交 | 内容 |
|------|------|------|
| 08-12 | `274c558` | 动态页发动态悬浮按键（复用文章目录弹性回弹动效）+ 修复输入框偶尔消失（Profile 重试不强制隐藏） |
| 08-12 | `6a34a03` | 交接文档：Threads 串文转发系统章节 + 工作日志全量（见 §3） |
| 08-12 | `本地` | 动态页修复 + 发动态悬浮按键：① 修复输入框偶尔消失——syncAuth 的 Profile.get 失败重试一次，仍失败不强制隐藏 composer（保留可见性）② 「＋ 发动态」FAB——滚动 >260px 显示（顶部隐藏）、点击 Lenis 平滑滚回顶部 + 发送框显现 + 聚焦 ③ **FAB 滚动弹性回弹动效复用文章页目录悬浮面板**（rAF lerp 0.16 + 惯性衰减 0.86，±18px）④ 瑞士极简胶囊样式（89 项 happy-dom + 5 项 puppeteer 真实验证） |
| 08-12 | `本地` | **Threads 前三张低分辨率根因修复（桥端）**：根因是桥从页面 `<img>` 取 `currentSrc`——前几张轮播图初始加载为 `stp=dst-jpg_e35_s480x480`（480 预览变体），后续才加载原图变体。修复：桥改为**解析页面内嵌 JSON `carousel_media` 的 image_versions2 候选**，`pickBest` 选原图档（stp 无 `_sNNNxNNN` 尺寸变体）优先、其次最大分辨率（bridge.py 已重启生效）；已重新入库 Db-45PqAZh_（10/10 全部 1840×1232 原图，线上验证） |
| 08-12 | `本地` | **Threads "前三张低分辨率" bug 根因修复**：诊断 Db-45PqAZh_ 转存文件 0,1,2 = 480×321（桥给预览档 url）、3-9 = 1840×1232——桥对前几张给预览链接。修复：`downloadImageWithFallback`——下载后若 <800px 自动附加 `stp=dst-jpg_e35`（IG CDN 原图质量档）重试取更高分辨率（已部署）；**已转存的旧帖需重新爬取（桥）覆盖** |
| 08-12 | `本地` | **Threads 原图分辨率修复（诊断+已处理）**：诊断发现转存文件实为 4096×2730 原图，低分辨率在显示层——JSON 宽高为空（前端比例失效）+ 预览固定 640px。修复：① Edge Function 新增 `imageSizeFromBytes`（JPEG SOF/PNG/WebP 字节解析）转存后回填真实宽高 ② 预览 640→1080 高清 ③ 已为帖子 Db-xCLvESnY 重新 invoke 入库（宽高 4096×2730 + 1080 预览 + ?v/&t 缓存破坏，线上验证通过）（已部署） |
| 08-12 | `本地` | **Threads 重爬自动覆盖**：资源全部 upsert 覆盖（原已有）+ 新增 ① **孤儿清理** `cleanupStaleMedia`（重爬后删除该帖下不在新媒体清单的旧文件，序号/格式漂移的残留）② **缓存破坏**（图片原图 `?v=ts` + 预览 `&t=ts`、视频 `?v=ts`——覆盖后浏览器/CDN 不再显示旧图）③ 已转存识别（视频 storage URL 跳过重下载并计入保留清单）（已部署） |
| 08-12 | `本地` | **Threads 视频落地（调研后构建）**：开源调研——SCrawler(2141⭐)支持 Threads 但为 PyQt 桌面不可服务端用、yt-dlp 主线无 Threads extractor；根因是 **CDN 签名 URL 时效短(~1-2h)** 导致视频失效。构建：Edge Function threads-fetch 新增 `processMediaVideos`——入库时下载视频（UA 头、≤40MB）转存 `threads-reposts/media/<id>/<n>.mp4` 永久 URL（`m.local=true`），失败降级保留原链接；自动播放/点击放大均走自有链接（已部署） |
| 08-12 | `本地` | **Threads 媒体爬取质量升级**：① `fetch.mjs` 重构——解析页面内嵌 JSON（carousel_media/video_versions/image_versions2），图片取**最大候选+去 CDN 尺寸参数原图**、视频取**最大码率**（宽高排序）、url 级去重防重复、`?&` 双符号修复、补充 taken_at 时间 ② Edge Function threads-fetch 桥模式同样做图片原图规范化（已部署）（7 项媒体提取单测通过） |
| 08-13 | `本地` | **新增「感知」页（音乐/电影/书籍分享）**：① 导航菜单 `hugo.yaml` 加「感知」(`perception/`，weight 6) ② 内容 `content/perception.md` + 模板 `themes/brutalism/layouts/_default/perception.html`（空壳 list-header）③ `swiss.css` 纳入 `.perception-page` ④ 设计稿 `perception-page/design-perception.html`（左文右卡分屏 + CardSwap 式 3D 卡组 + 滚轮/点击交互；连续相位模型可打断、`power2.out` 缓动、文字延后 ~58% 切换、自动播放仅首交互前）+ `perception-page/README.md` 交接文档 |
| 08-13 | `本地` | **串文卡片多图预览/查看全量优化（交互设计视角）+ 图片持久化/预览生成**：① 轮播圆点可点击跳页（扩大热区）、首/末页箭头禁用态、键盘 ←/→ 翻页（仅横向溢出时拦截）、视频播放/暂停开关（图标同步）② 图片加载骨架脉动→淡入、加载失败兜底（fbcdn 过期停止闪烁降灰占位）、`cursor: zoom-in`+悬停微缩放可供性 ③ 放大查看 GLightbox Swiss 风格覆盖（磨砂遮罩/圆形按钮/苔绿/页码计数 1/N）+ 计数随翻页更新 ④ **爬取原图+预览**：threads-fetch 服务端代拉原图转存 `media/<id>/<i>.<ext>` + 预览用 Storage render/image（`?width=640&quality=80&resize=contain`）；卡片显示 `media[].preview`，放大查看用 `data-orig` 原图（`media[].url`）。已部署验证（magick-wasm 方案 BOOT_ERROR 弃用，改用 render/image）|
| 08-12 | `270a50c` | **Threads 转发卡片多图终版**：底部进度圆点按页数显示（10图→5页5点）+ 多图统一高度至合适值（`h=(宽-gap)/max(页内宽高比之和)`，限幅180–520px，大图自动缩小、页内居中、不裁切无灰边）；媒体重构为页结构 `.th-media > .th-pair > item` |
| 08-12 | `2f0040f` | **多图一视窗两张并排 + 点击图片放大 + 仅页脚跳转**：等高校对（Google Photos 同款算法）、点图 GLightbox 放大原图不跳转、卡片仅「在 Threads 查看」页脚可跳转（捕获阶段 preventDefault）、图片宽高比备用 data-ratio + 加载/缩放重排 |
| 08-12 | `a652a14` | 去除转载图片左右浅灰遮罩（移除 contain+限高，自然比例显示） |
| 08-12 | `b7a320d` | 地点结果合并同一地点（同名忽略大小写 + 坐标~1km 内去重；繁简变体保留区分） |
| 08-12 | `6f41502` | **地点中文搜索改用 Nominatim 官方地理编码**（调研后定案）：`accept-language=zh-CN` 原生中文（涩谷→东京涩谷区、东京塔→東京鐵塔），失败回退 Photon；附近POI 保留 Photon+结果中文化；1 请求/秒串行节流 + User-Agent |
| 08-12 | `184286d` | 移除自拼的"地点搜索地名中文化"（翻译查询+合并方案脆弱，东京塔会漏），保留 translateTo 供卡片翻译 |
| 08-12 | `da9fb77` | **串文卡片翻译组件**：点「翻译」正文译中文、再点「原文」还原（gtx 免费端点，缓存/超时/失败回退，按钮在卡片链接内已拦截跳转） |
| 08-12 | `94d8fa6` | 转发正文排除翻译/查看原文/朗读等 UI 字段（桥提取黑名单）+ 桥目标失效自愈（No such target id → 自动重开标签，此 bug 曾致自动爬取静默失败） |
| 08-12 | `7c80009` | **moments.js/admin.js 加 ?v= 版本号防缓存**（浏览器缓存旧 JS 曾致自动爬取"未生效"） |
| 08-12 | `eb34ca0` | **串文链接自动爬取**（卡片加载发现资源缺失→检测本机桥→自动抓取→轮询渲染，零手动）+ 悬停卡片禁用浏览器历史手势（后细化：轮播区横向手势保留给图片浏览） |
| 08-12 | `ec5a7e5` | 卡片作者头像（fbcdn 头像 CORP 拦截 → Edge 服务端代拉转存桶内公开 URL）+ Threads 官网式左右滑动轮播（箭头/圆点/触摸） |
| 08-12 | `03e672b` | 卡片显示帖子图片/视频（桥提取媒体 → json 模式透传 → 卡片网格渲染） |
| 08-12 | `0996f0e` | 卡片去除点赞/评论/回复 UI（仅作者+正文+页脚） |
| 08-12 | `8fd132e` | **Edge Function CORS 修复**（预检 OPTIONS 被路由进函数返回 400 无 CORS 头、实际响应也无 ACAO → 浏览器全拦 "Failed to send a request"；OPTIONS 204 + 全响应 ACAO *） |
| 08-12 | `2978a92` | 桥 cookie 验证改 HTTP 200/500 判定（og 已废弃，原逻辑有效 cookie 也判失败） |
| 08-12 | `1d7f2b0` | **Threads 帖页客户端渲染**（无 og 元数据）→ 桥内真实浏览器渲染 DOM 提取（/api/fetch）；threads-fetch 新增 json 模式（修复 createClient 未导入的隐藏 bug）；测试/爬取优先走桥、降级服务端直爬 |
| 08-12 | `524eac3` | **修复"调用失败"误报**（supabase-js v2 非 2xx 不 reject，原代码吞掉真实错误）+ 桥端 cookie 域名优先（threads.com 优先于 instagram.com）+ 真实爬取验证 |
| 08-12 | `be83f59` | threads-fetch 桶缺失自动创建（public）+ 后台报错直指未部署（404） |
| 08-12 | `ebec4dd` | **浏览器登录取 Cookie**：本地 Cookie 桥（bridge.py 零依赖 + chrome-debug 启动器），CDP 读 HttpOnly sessionid；恢复被误 revert 的 embed 卡片代码 |
| 08-12 | `0907fc6` | **Threads 自动登录链 + 平台管理面板**：threads-login Edge Function（IG Web 登录接口，明文/AES-GCM+sealedbox 双格式加密）、后台「平台管理」侧栏（自动登录→Cookie→爬取）、卡片复刻官方 text-post-media embed UI |
| 08-12 | `本地` | 文章评论区四项升级：① 容器改**白色**（--swiss-surface）② **树状回复**（comments 表加 parent_id + SQL `supabase-comments-thread.sql`，渲染复用动态树状结构+内联回复条展开/发送/取消/Esc/外部收起）③ **自己/管理员可编辑删除**（行内 textarea 编辑、瑞士确认弹窗删除、RLS 加管理员 update/delete 策略）④ **动效**（新评论 `.mc-new` 入场、删除 `.mc-leave` 收拢出场、评论项 hover 苔绿边线+位移、操作按钮 hover 浮现、列表更新微淡入）（15 项 happy-dom 端到端通过） |
| 08-12 | `本地` | 关于页打包：`about-page/` 文件夹（design-about.html + README.md 完整文档——结构/光标系统/动效清单/验证/集成步骤/注意事项/日志） |
| 08-12 | `本地` | 关于页光标重构二轮：**全站自定义光标**（用户否决 Win11 混合方案）——平时透明轮廓环 36px+中心点（lerp 0.18 跟随）、hover 0.5s 平滑转实心圆（scale 1.28 + moss 填充）+ 12% 吸附、按下反馈、**打断动画**（形态全 CSS transition 可打断、位置 lerp 无 transition 防拖尾）、`* { cursor:none }` 无原生指针、触屏禁用（24 项 puppeteer 冒烟通过） |
| 08-11 | `本地` | **修复 threads 链接不可编辑（根因：`transformThreadsLinks` 的 TreeWalker 遍历整卡时把编辑面板 textarea 内的链接文本也替换成卡片 DOM，textarea 内容丢失）**——转换时跳过 TEXTAREA/INPUT/SELECT 内的文本节点；用 puppeteer+Chrome 真实浏览器复现验证（编辑框原文含链接 → 改链接保存 → 卡片 href 更新为新链接） |
| 08-11 | `本地` | 动态编辑增强：① 编辑面板新增**地点可编辑**（复用 mlp-* 选择器，每卡独立状态；保存仅 dirty 时写 location，移除→置 null，未操作→保留原值，取消→丢弃）② **threads 链接随 content 编辑**（原文进 textarea，保存后 diff 重渲染重建卡片）③ 自定义地点规则：location 完全使用所选条目的 {name,lat,lng}，**不混入 GPS 定位数据**（GPS 仅用于反向编码与附近列表）④ wheel 隔离委托化（document 捕获覆盖全部地点面板） |
| 08-11 | `本地` | **滚轮隔离重做（根因：Lenis 平滑滚动接管 wheel，冒泡阶段 preventDefault 无法阻止其 window 监听）**——成熟方案三保险：① `data-lenis-prevent-wheel` 属性（Lenis 官方支持，1.3.26 验证）② 捕获阶段 `preventDefault + stopPropagation`（先于 Lenis 冒泡监听执行）③ 手动驱动列表滚动（scrollTop += deltaY，deltaMode 换算，边界自然 clamp 无链外溢） |
| 08-11 | `本地` | 地点菜单再调：滚轮隔离改为纯 JS 边界判断（列表可滚动时放行内部滚动、到顶/底或不可滚动/非列表区一律拦截，不依赖 overscroll-behavior 兼容性）+ 菜单再次加大（480px、列表 340px、字号 14.5px、圆角 12px） |
| 08-11 | `本地` | 地点菜单交互：滚轮隔离（悬停面板 wheel 只滚菜单内，列表区 overscroll-behavior: contain + 非列表区 JS preventDefault）+ 列表滚动条重构为浅色极简（6px 苔绿半透明 thumb，Firefox scrollbar-width thin） |
| 08-11 | `本地` | 地点 UI 调整：地点按钮移至操作行**最左侧**（高度不变同行）、下拉面板放大（420px、列表 280px、字号 13→14px）、面板固定**瑞士极简浅色样式**（米白/墨黑/苔绿，不随站点深浅主题，参考 design-moment-location.html） |
| 08-11 | `本地` | 地点功能修复：① 地点按钮移入 mc-actions 与发布键同行动态（面板定宽 340px）② **修复定位/搜索全挂根因**——Photon 公共实例不支持 `lang=zh`（仅 default/de/en/fr），移除后浏览器自动带 Accept-Language；附近地点改用 `include=osm.*` 分类查询（无 q 必须指定 include，原实现请求被拒）③ 前端同名同坐标去重 + 空名过滤 ④ AbortController 8s 超时降级 |
| 08-11 | `本地` | 动态发布地点上线（design-moment-location.html 集成）：三通道（GPS 定位→Photon reverse 识别 / 定位后附近地点 / 搜索指定，防抖 300ms）、选择面板自动定位+chip 显示、发布携带 `location {name,lat,lng}`、卡片左下角灰色小字渲染、面板关闭清空搜索状态、moments 表需执行 `supabase-moments-location.sql` |
| 08-11 | `本地` | 动态评论树状回复上线（design-comment-tree.html 集成）：回复的回复递归嵌套子树（缩进+边线，L3 起收紧）、内联回复输入条（发送成功/取消/Esc/点击外部自动收起隐藏）、appendCommentNode 树插入、commentNode 定位整节点（realtime 删除级联清空容器） |
| 08-11 | `本地` | 动态页图片/头像加载防闪修复：① 列表 **diff 渲染**（按 id+数据 key 对比，未变卡片复用 DOM 零重载图，点赞/评论数仅同步数字）② 单图占位 `sizeFrame` 显式 height 参与过渡（aspect-ratio 不可动画导致 120px→真实高度瞬间跳变）③ 长图 wrap 替换 frame（原实现 frame 残留大空盒）+ 原比例全高→280px 平滑收拢动画 ④ 头像加载淡入 + 加载失败回退字母占位（破图图标消除） |
| 08-11 | `本地` | 动态修复：评论 RLS 一键修复 SQL（含 Realtime 发布）+ 评论实时同步（postgres_changes，双向去重）+ 点赞按钮移动端换行修复（nowrap + 操作行 flex-wrap）+ 作者(author)可发动态（前端 + moments_insert 改 is_staff） |
| 08-09 | `本次提交` | 移除文章页特殊效果：删除编辑器开关/类型字段、文章模板标记、懒加载逻辑、样式与特效 bundle |
| 08-09 | `da89df5` | 重构全屏封面字体控件：独立 JS/CSS、低延迟本地预览、自定义字体上传渲染验收、Docker server --noTimes |
| 08-11 | `d52268d` | **本地未推送**：加载动画优化（数字补间/打字机/标题描边联动/完成态）+ 修复导航收集 bug |
| 08-11 | `c7015ab` | 撤销站点加载动画优化（用户要求恢复至图标修改后状态，后重新优化于 d52268d） |
| 08-11 | `56c9e46` | 站点加载动画优化（后被撤销） |
| 08-11 | `84fdda8` | design-home.html：加载 → 首页联动设计稿 |
| 08-11 | `e28509e` | design-loader.html：加载动画流畅性优化（rAF 补间/无缝状态切换） |
| 08-11 | `3fe8598` | design-loader.html：加载动画 V2 动画组编排（字符 stagger/网格漂移/坐标轴圆点/分层退出） |
| 08-11 | `b603b5e` | design-loader.html：瑞士风加载动画设计稿（描边 LEVIA/进度条/编号） |
| 08-11 | `e5f0762` | 站点图标改为米白实心圆（#E4DED4） |
| 08-10 | `7ed6597` | 动态页 400 查询降级链扩展 |
| 08-10 | `96ccd99` | 加载时重置页面到顶部（删 hash 豁免） |
| 08-10 | `ba2896d` | 首页导航同步设计稿（远端，含全局导航修补——已随撤销去除） |
| 08-09 | `733ef20` | Docker 开发/构建环境（Windows 支持） |
| 08-08 | `69590c0` | 优化全屏封面字体预览 |
| 08-08 | `5278e12` | 字体列表持久化：fonts.json 单一权威，上传增量更新，零重复扫描 |
| 08-08 | `b9d0f6c` | 字体链路修复：dispatchEvent bubbles、ensureOption、buildOptions(value)（9/9 模拟通过） |
| 08-08 | `a969ae9` | 编辑器字体控件重构：全局逻辑+DOM 委托（重渲染不失效） |
| 08-08 | `7db4acb` | 编辑器一键上传字体+实时预览（GitHub 直传+进度条） |
| 08-08 | `6b10fff` | 资源库数据源合并（GitHub+Supabase）+ 界面重排 |
| 08-08 | `5ffa1f2` | hotfix 编辑器无法进入（JS 引号转义） |
| 08-08 | `9c442c1` | 欢迎页头像居中放大+个人主页头像+磁性吸附 |
| 08-08 | `696ac9f` | 头像上传缓存破坏（?v=时间戳） |
| 08-08 | `4ebf3a4` | 文章目录与容器齐平+层级 z-index 40 |
| 08-08 | `01a22f3` | 封面字体每卡独立（inline style+safeCSS）+即时预览 |
| 08-08 | `28f55ac` | 字体自托管（零 Google 依赖） |
| 08-08 | `71f0bb8` | 修复 welcome.yaml 嵌套单引号致构建全挂 |
| 08-08 | `97f430b` | 构建时视频自动重编码（任何编码→H.264） |
| 08-08 | `2cdbd9f` | 后台卡片样式/欢迎页保存 404（toml 残留） |
| 08-08 | `e6792db` | 视频编码不兼容根因修复（HEVC/AV1→H.264） |

---

*文档规则：完成任务后追加日志、刷新速览/状态/待办；涉及配置/数据库变更同步更新本文档。*
