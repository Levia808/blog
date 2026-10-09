# 项目移植文档（Levia's Blog）

> 供接手方（AI/开发者）完整理解项目架构、构建链路、CMS 体系与已知问题。
> 主站：https://blog-go3.pages.dev （Cloudflare Pages）｜仓库：`Levia808/blog`（main 分支）

---

## 1. 项目概览

| 项 | 值 |
|----|----|
| 静态站点 | Hugo（extended，本地 v0.164） |
| 主题 | 自定义 `themes/brutalism` |
| 部署 | GitHub Actions → GH Pages + **Cloudflare Pages（主站）** |
| 内容管理 | **Sveltia CMS**（`/admin-cms/`）+ **自定义后台**（`/admin/`） |
| 后端服务 | Supabase（认证、媒体存储、评论、动态、个人中心） |
| 媒体存储 | Supabase `media` bucket（后台上传）+ GitHub `assets/images`（CMS 上传） |

---

## 2. 目录结构

```
├── content/
│   └── posts/                 # 文章（markdown + front matter）
├── data/
│   ├── site.yaml              # 站点设置（CMS 可编辑：作者/描述/开关/avatarUrl）
│   ├── welcome.yaml           # 欢迎页配置（CMS 可编辑，必须保持合法 YAML）
│   └── cards.yaml             # 卡片样式（grid/horizontal/fullscreen）
├── themes/brutalism/
│   ├── layouts/               # 模板（index/single/list/partials/shortcodes）
│   ├── assets/css/main.css    # 主题样式（Hugo Pipes 打包）
│   └── static/js/theme.js     # 前端交互（欢迎页/卡片/乱码/目录/视频/头像）
├── static/
│   ├── admin-cms/             # Sveltia CMS（config.yml + index.html 编辑器）
│   ├── fonts/                 # 自托管字体（Playfair/Grotesk/Mono woff2）
│   ├── fonts.json             # 字体库清单（构建时生成）
│   ├── js/                    # admin.js / supabase.js / moments.js / comments.js
│   └── images/                # 静态资源（含字体副本）
└── .github/
    ├── workflows/deploy.yml   # 构建部署（含视频转码 + 字体清单步骤）
    ├── transcode.py           # 视频自动重编码 HEVC/AV1→H.264
    └── gen-fonts.py           # 扫描字体库生成 fonts.json + 发布字体
```

---

## 3. 构建与部署链路

### 本地开发
```bash
export PATH="$HOME/.local/bin:$PATH"
hugo server --port 1450 --bind 127.0.0.1   # 开发预览
hugo --minify                              # 生产构建（每次改动后必须验证 0 ERROR）
```

### CI（`.github/workflows/deploy.yml`，push 触发）
1. `checkout@v5`（Node 20 弃用已规避）
2. `python3 .github/gen-fonts.py` —— 扫描 assets/images + static/images 字体 → 复制发布 → 生成 `static/fonts.json`
3. `python3 .github/transcode.py` —— 非 H.264 视频自动转码（HEVC/AV1 → H.264 + faststart，超 1080p 降级）
4. `hugo --minify --baseURL https://levia808.github.io/blog/`
5. 上传 artifact → deploy-pages

### 部署双线
- **GH Pages**：Actions 自动（可靠，始终最新）
- **CF Pages（主站 blog-go3.pages.dev）**：独立绑定仓库 push 触发，**曾出现停更**（见注意事项）

### 提交规范
```bash
git add -A && git commit -m "..." 
git pull --rebase origin main   # 必须（远端常有 CMS 自动提交）
git push origin main
```

---

## 4. CMS 体系（两个入口）

### 4.1 Sveltia CMS（文章编辑器）`/admin-cms/`
- 配置：`static/admin-cms/config.yml`
- 编辑器页：`static/admin-cms/index.html`（**内嵌大段 JS**，改后必须 `node --check` 校验）
- 集合：文章（posts，含全屏卡标题字体/颜色/透明度/乱码开关字段）、页面、卡片样式（data/cards.yaml）、站点设置（data/site.yaml）、欢迎页配置（data/welcome.yaml）
- **权限门禁**：Supabase 管理员校验（`window.Admin.isAdmin()`）通过后加载 `@sveltia/cms` UMD
- **自定义 widget**（`fontPreviewSelect`，标题字体字段）：
  - 控件用 Sveltia 内部 React（`window.createElement`，**勿引入外部 React**——版本冲突会导致字段消失）
  - 逻辑层已重构为**全局轮询 + DOM 委托**（`initFontPreviewGlobal`）：Sveltia 重渲染控件时只重建 UI，全局 200ms 轮询幂等重新绑定，逻辑不丢失
  - 核心函数：`uploadFontToGitHub`（读 `localStorage.blog_gh_publish_token` 直传 GitHub contents API）、`ensureFontFace`（路径变化重建 + `?v=` 缓存破坏）、`readSavedFontFile`（从字段 DOM 提取字体路径）

### 4.2 自定义后台 `/admin/`
- `static/js/admin.js`：文章管理、GitHub 发布、媒体库（Supabase storage）、卡片样式/欢迎页配置编辑、**字体上传同步 GitHub**（`syncFontToGitHub`：PUT 字体到 assets/images + 更新 fonts.json）、字体预览面板
- 媒体上传白名单含字体：`image|video|audio|font` + 扩展名兜底

---

## 5. 主题核心功能（模板/JS 速查）

| 功能 | 位置 | 说明 |
|------|------|------|
| 欢迎页 | `layouts/index.html` + `theme.js` | 打字机、ShapeBlur(Three.js)、Sparks、VariableProximity 字重、**管理员头像**（Supabase profiles 动态查询 + 磁性吸附 + `mix-blend-mode: difference` 反相） |
| 卡片三模式 | `data/cards.yaml` + `partials/post-card.html` | grid / horizontal / fullscreen（100vw×100vh 全屏翻页） |
| 全屏卡封面 | post-card.html | 封面图（webp 压缩）/ **封面视频**（`cover.video` 字段，muted 循环无控件 + 细进度条 + 加载动效）/ 背景懒加载 |
| 标题自定义 | post-card.html + single.html | `entry_title_font`（内置 9 项或**字体文件路径值**）、`entry_title_color/opacity`、5 行 clamp、`|`/`<br>` 手动换行、乱码 hover（`data-scramble` 开关） |
| 模板安全 | post-card.html | 字体/颜色 inline style 必须 `| safeCSS`（否则渲染 `ZgotmplZ`） |
| 文章页 | single.html | **只展示 md 内容**（front matter 标题不显示，正文 `#` 标题即页面标题）；右侧悬浮目录（fixed + JS 弹性回弹 + scrollspy 高亮，z-index 40） |
| 视频 | shortcodes/video.html + 构建转码 | 内嵌视频（无原生控件时点击本体切换播放兜底）、底图视频自动播放 |
| 登录/注册 | `layouts/_default/login.html` | 独立分屏页（静态演示） |
| 搜索/动态/评论 | theme.js / moments.js / comments.js | Fuse.js 搜索、moments 动态（Supabase）、评论（RLS 依赖数据库配置） |

---

## 6. 数据文件约定

- `data/welcome.yaml`：**键名必须与 theme.js 读取一致**（typewriterText/typeSpeed/titleVariationFrom 等）；`titleVariationFrom: "'wght' 400"` 必须**双引号包裹**（单引号嵌套会导致 Hugo 构建失败——曾发生，导致全站停更）
- `data/cards.yaml`：style 值 `grid | horizontal | fullscreen`
- `data/site.yaml`：`$P` 兼容读取（模板 `site.Data.site` 优先，回退 `site.Params`）；`avatarUrl` 为欢迎页头像兜底（默认 GitHub 头像）

---

## 7. Supabase 集成要点

- `static/js/supabase.js`：`window.blogSupabase`（anon key）+ `Auth/Profile/Admin/Comments` 服务
- 媒体：`media` bucket（上传/删除走 **Storage API**——`admin_delete_media` RPC 直接删 storage 表会被拒，必须 `storage.remove()` 后删记录）
- 头像：`avatars` bucket + profiles.avatar_url（**URL 带 `?v=时间戳` 缓存破坏**，否则同名覆盖后浏览器显示旧图）
- 评论/动态：`comments` / `moment_comments` 表 insert 依赖 RLS 策略（数据库侧；缺失时前端给出引导提示）
- 编辑器资源库字体：`rpc('admin_list_media')` 列出媒体库（编辑器用户已登录可用）

---

## 8. 已知问题与注意事项（重要）

1. **CF Pages 主站停更风险**：GH Actions 正常但 CF 可能滞后/失败（曾自某次构建后停更）。用户访问的是 CF 站——排查顺序：`git log` → Actions 状态 → `curl https://blog-go3.pages.dev/xxx` 对比产物特征 → 必要时空提交触发 CF 重建 / 请用户查 CF 面板 Deployment 日志。
2. **welcome.yaml**：任何编辑必须验证 `python3 -c "import yaml; yaml.safe_load(...)"` + `hugo` 构建。
3. **编辑器页面**（admin-cms/index.html）内嵌 JS：每次改动后 `node --check`（提取 `<script>` 校验）；HTML 字符串拼接避免内层单引号。
4. **自定义 widget 禁区**：不要引入外部 React（版本冲突）；控件保持纯渲染，逻辑放全局层。
5. **视频**：上传后构建自动转码；封面视频仅 `cover.video` 字段生效（不自动使用正文内嵌）。
6. **字体**：上传后路径不变是正常的（同名覆盖）；预览用 raw URL（构建前），封面用 `/images/` 路径（构建后）；fonts.json 需构建/同步后才更新。
7. **模板安全**：动态 style 值必须 safeCSS。
8. **CSS hash 缓存**：bundle 带 hash，改 CSS 后强刷浏览器。
9. **git**：远端常有 CMS 自动提交，push 前 `git pull --rebase`。

---

## 9. 常用验证命令

```bash
node --check <js>                      # JS 语法
python3 .github/gen-fonts.py           # 重新生成字体清单
python3 .github/transcode.py           # 视频转码检查
hugo --minify                          # 构建（0 ERROR）
python3 -c "import yaml; yaml.safe_load(open('static/admin-cms/config.yml'))"
# 浏览器端到端（如需要）: puppeteer-core + google-chrome-stable
```

---

## 10. 当前进行中的工作状态

- **标题字体自定义**：已重构为「上传自定义字体（GitHub 直传+进度条+raw 实时预览）+ 资源库双通道面板 + 全局逻辑层」，多层检验通过（语法/构建/上传模拟/重渲染安全）。**待用户实际验证**。
- 后续待办：CF Pages 构建状态确认；用户反馈迭代。
