# 📋 博客项目 · LLM 交接文档（持续更新）

> 用途：任意 LLM / 新开发者可凭本文档无缝接手工作。
> 更新规则：每次任务完成后追加「工作日志」并刷新状态，保持本文档为唯一事实源。
> 最后更新：2026-08-09 · Codex · 基线 `a5dcdb2`

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
| 后端 | Supabase（Auth / DB / Storage `media`+`avatars` 桶） |
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
│   └─ 文章编辑器: 自定义字体控件(上传/资源库/预览) + 文章页特殊效果(Canvas UI) + 视频/音频组件
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

## 3. 数据 / 配置（全部后台可编辑）

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

## 4. 功能清单（当前全量）

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

### 媒体/上传
- 后台媒体库上传（Supabase `media`，类型白名单含字体 font/* + 扩展名兜底，进度条）
- 后台/编辑器上传字体 → 同步 GitHub `assets/images` + 更新 fonts.json
- 构建时视频转码（HEVC/AV1 → H.264）

---

## 5. 代码地图

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
└─ static/js/theme.js          全站动效(欢迎页/乱码/视差/目录回弹/视频/文章页 Canvas UI 效果懒加载)
assets/
├─ js/canvasui-article-effects-entry.ts  Canvas UI 官方 vanilla 源码打包入口
└─ vendor/canvas-ui/                    Canvas UI 官方 vanilla TS 源码 + LICENSE
static/
├─ admin-cms/index.html        Sveltia CMS 门禁+注册(字体控件/视频组件)
├─ admin-cms/config.yml        Sveltia 集合(文章/页面/站点设置/卡片样式/欢迎页)
├─ js/admin.js                 自定义后台(GitHub 发布/媒体库/字体同步)
├─ js/canvasui-article-effects.js  Canvas UI 官方源码构建出的文章页特效 bundle
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
```

---

## 6. 开发约定（务必遵守）

1. **改动后**：`hugo --minify` 验证 0 ERROR，再 `git push`
2. **提交前**：`git pull --rebase origin main`（远端常有用户 CMS 提交）
3. **CMS/配置改动**：修改 `static/admin-cms/config.yml` 后必须 `yaml.safe_load` 校验；**posts collection 字段名唯一**（重名=编辑器打不开）
4. **编辑器页面 JS**（admin-cms/index.html）：改完必须提取 `<script>` 跑 `node --check`（语法错误=整个编辑器白屏，历史事故）
5. **数据文件**：一律 YAML；欢迎页配置保存时 `titleVariationFrom/To` 双引号转义（嵌套单引号曾致构建全挂）
6. **视频**：上传前确认 H.264（HEVC 桌面 Chrome 无法解码）；构建会自动转码
7. **字体文件**：上传后需同步 `assets/images` + `fonts.json`（编辑器/后台上传已自动处理）
8. **git 代理**：若 push 失败，检查 `http://127.0.0.1:7897`

---

## 7. 已知问题 / 风险

| # | 问题 | 状态/建议 |
|---|------|-----------|
| 1 | **CF Pages 主站停更**（14:35 后未更新） | ⚠️ **用户需查 CF 面板构建**；临时用 GH Pages 验证 |
| 2 | 楷体预览依赖系统字体（mac 无 KaiTi → 回退衬线） | 需楷体请上传自定义字体 |
| 3 | 动态评论/头像上传可能 RLS 缺失 | 数据库 SQL 见 `supabase-*.sql` 与待办 |
| 4 | 文章页无 front matter 标题（只显示 md 内容） | 设计如此；正文写 `# 标题` 即显示 |
| 5 | 本机 Docker daemon 未运行 | Windows 上用 Docker Desktop |
| 6 | 旧文章 `entry_title_font: custom` 无文件 → 回退 serif | 用编辑器重选即可 |

---

## 8. 待办（下一步任务建议）

- [ ] **P0** 用户检查 Cloudflare Pages 构建状态并修复停更（否则主站功能长期滞后）
- [ ] **P1** 执行数据库 SQL（若未执行）：动态评论 RLS（`moment_comments` insert 策略）、`avatars` 桶上传策略、`profiles` 更新策略
- [ ] **P1** 用户验收：编辑器字体上传→预览→封面生效全链路；欢迎页头像随个人主页更新
- [ ] **P2** 主题加 `version` 字段（便于版本追踪）
- [ ] **P2** 楷体等中文系统字体预览降级提示优化
- [ ] **P3** 编辑器字体控件：上传后 fonts.json 更新失败时的重试/提示增强

---

## 9. 工作日志（最近）

| 日期 | 提交 | 内容 |
|------|------|------|
| 08-09 | `本次提交` | 文章编辑器新增文章页特殊效果开关/类型选择；接入 Canvas UI 官方 vanilla 源码并打包文章页 effects bundle |
| 08-09 | `da89df5` | 重构全屏封面字体控件：独立 JS/CSS、低延迟本地预览、自定义字体上传渲染验收、Docker server --noTimes |
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
