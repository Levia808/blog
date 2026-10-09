# 博客项目恢复记录

> 生成日期：2026-09-20（Asia/Shanghai）  
> 目标：在不把 Codex 原始日志、浏览器 profile、Cookie、Token 或线上业务数据复制进仓库的前提下，恢复博客项目的可继续开发上下文。

## 1. 恢复结论

- GitHub 仓库已恢复到当前工作区：`/home/levia/文档/blog`。
- 当前代码对应 `main` 分支，HEAD 为 `7c4f7338a79482ddebf763cb2678809aa6a35e1d`（`feat: refine Swiss blog experience and moments motion`）。
- 当前工作树无未提交修改（恢复文档本身除外，生成后需再次检查）。
- 项目是 Hugo 静态博客，主题为仓库内自制的 `themes/brutalism`；动态、认证、评论、媒体和后台能力由 Supabase 提供。
- 原始 Codex 会话仍在本机 `/home/levia/.codex/` 下，已建立索引说明，未复制原始 JSONL 到仓库。路径与数据库说明见 [`CODEX_CONTEXT_INDEX.md`](CODEX_CONTEXT_INDEX.md)。
- 仓库中的 SQL/代码只能恢复“结构和逻辑”，不能恢复 Supabase 线上真实用户、动态、评论、媒体或 Storage 文件；这些必须在 Supabase Dashboard/API 中单独核验。

## 2. Git 恢复状态

远程仓库：`https://github.com/Levia808/blog`  
主站：`https://blog-go3.pages.dev/`  
GitHub Pages 镜像：`https://levia808.github.io/blog/`

当前 Git 元数据有一个特殊情况：

- 实际 Git 数据在 `/tmp/blog-recovered/.git`。
- 工作区内 `/home/levia/文档/blog/.git` 是系统预置的占位目录，不能视为正常 Git 元数据目录。
- 后续 Git 命令必须显式指定：

```bash
git --git-dir=/tmp/blog-recovered/.git \
  --work-tree=/home/levia/文档/blog <command>
```

不要删除或覆盖工作区内的 `.git` 占位目录，除非先确认当前 Codex 工作区的挂载策略已经改变。

常用检查：

```bash
git --git-dir=/tmp/blog-recovered/.git \
  --work-tree=/home/levia/文档/blog status --short --branch

git --git-dir=/tmp/blog-recovered/.git \
  --work-tree=/home/levia/文档/blog log -5 --oneline --decorate
```

## 3. 项目地图

```text
content/                    Hugo 页面、动态页和文章
content/posts/              Markdown 文章
 data/                       可被 CMS/后台修改的 YAML 配置
 themes/brutalism/          自制主题：layouts、CSS、主题 JS、短代码
 static/js/                 Supabase、认证、评论、动态、资料、后台前端
 static/admin-cms/          Sveltia CMS 入口、配置和字体控件
 static/float-player/       悬浮网易云播放器前端
 threads-repost/            Threads 抓取桥、Edge Functions 和部署说明
 music-api/                 公网/独立网易云 API 代理
 float-player/netease-proxy/本地网易云代理
 scripts/                   本地启动辅助脚本
 .github/                   GitHub Actions、字体清单和视频转码
 supabase-*.sql             Supabase 初始 schema 与幂等修复脚本
 design-*.html              历史设计稿/交互方案，不是 Hugo 页面
```

主要入口：

| 功能 | 入口 |
|---|---|
| 首页/欢迎页 | `themes/brutalism/layouts/index.html`、`data/welcome.yaml` |
| 文章 | `content/posts/`、`static/admin-cms/config.yml` |
| 动态 | `content/moments.md`、`static/js/moments.js`、`supabase-moments*.sql` |
| 登录/资料 | `static/js/supabase.js`、`static/js/auth-ui.js`、`static/js/profile.js` |
| 评论 | `static/js/comments.js`、`supabase-setup.sql`、`supabase-comments-thread.sql` |
| 管理后台 | `content/admin.md`、`static/js/admin.js`、`threads-repost/supabase/functions/admin-*.ts` |
| Sveltia CMS | `static/admin-cms/index.html`、`static/admin-cms/config.yml` |
| Threads | `threads-repost/README.md`、`threads-repost/fetch.mjs`、`threads-repost/bridge/` |
| 悬浮播放器 | `static/float-player/`、`music-api/server.js`、`float-player/netease-proxy/server.js` |

## 4. 产品/前端理解

这是一个偏 Swiss / Nordic / brutalist 的个人技术博客，作者为 Levia。当前实现包括：

- 首页 100vh 终端/欢迎页、打字机文本、可变字体字重插值、头像磁性吸附和液体滑动导航。
- 文章卡片四种布局：`grid`、`horizontal`、`fullscreen`、`feature`；全屏/精选卡片支持自定义标题字体、颜色、透明度、字号和图片/视频封面。
- 文章页底部横幅、阅读进度、目录、面包屑、文章上下篇导航、View Transitions、滚动入场和深浅色主题。
- `prefers-reduced-motion` 兼容；字体主要自托管，避免 Google Fonts 运行时依赖。
- Fuse.js 静态搜索索引，站点输出 HTML、RSS 和 JSON。
- Supabase 登录、GitHub OAuth、用户资料、头像上传/同步、管理员角色、动态、点赞、评论树和实时更新。
- 全站左侧悬浮网易云播放器，支持播放列表、后台扫码登录和本地/公网代理切换。

### 配置文件

- `data/cards.yaml`：默认卡片样式，目前为 `fullscreen`。
- `data/site.yaml`：作者、头像、导航、功能开关。
- `data/welcome.yaml`：欢迎页文案和动效参数；`titleVariationFrom` 等字段必须保持合法 YAML。
- `data/player.yaml`：网易云播放器开关、歌单、代理地址和动效参数。
- `hugo.yaml`：站点 URL、导航、功能开关、搜索参数。

## 5. 构建与部署链路

### 本地构建

目标 Hugo 版本为 `v0.164.0 extended`。本机当前 `hugo` 不在 PATH，因此本次只完成静态文件和脚本级验证，未宣称 Hugo 构建成功。

```bash
# 如果环境已有 Hugo
hugo server -D
hugo --minify

# 或使用仓库 Docker 配置（需要本机 Docker）
docker compose up
docker compose run --rm hugo --noTimes --minify
```

### 双部署

```text
push main
  ├─ GitHub Actions: .github/workflows/deploy.yml
  │    ├─ 生成字体清单
  │    ├─ HEVC/AV1 → H.264 视频转码
  │    ├─ hugo --minify --baseURL https://levia808.github.io/blog/
  │    └─ GitHub Pages
  └─ Cloudflare Pages webhook/构建
       └─ https://blog-go3.pages.dev/
```

GitHub Actions 成功不等于 Cloudflare Pages 已更新。若线上版本与仓库不一致，先检查 Cloudflare Pages 的 Deployments，而不是立即回滚代码。

## 6. Supabase 数据模型与恢复边界

项目 ref：`iyquixzprfwkglaqptxj`  
Project URL：`https://iyquixzprfwkglaqptxj.supabase.co`

### 代码中可确认的模型

- `profiles`：用户资料、角色、账号状态。
- `content_items`、`content_versions`：后台内容/版本模型。
- `comments`、`comment_reports`、`moderation_queue`：文章评论、举报和审核。
- `notifications`、`audit_logs`、`security_events`、`media_assets`：通知、审计、安全事件和媒体库。
- `moments`：动态正文、媒体、地点和可见性。
- `moment_likes`、`moment_comments`、`moment_comment_likes`：动态点赞、评论和评论点赞。
- Storage 桶：头像、媒体和 `threads-reposts`；实际线上桶状态需要 Dashboard 核验。

### SQL 推荐理解顺序

这些脚本均以幂等/可重复执行为目标，但线上已存在的 policy、publication 或历史函数仍需先检查：

```text
supabase-setup.sql
supabase-fix.sql
supabase-fix2.sql
supabase-moments.sql
supabase-moments-fix.sql
supabase-comments-thread.sql
supabase-moments-location.sql
supabase-moments-visibility.sql
supabase-admin-user-activity.sql
```

其中：

- `supabase-setup.sql` 建立用户、内容、评论、审核、通知、审计和媒体基础模型。
- `supabase-fix*.sql` 用于结构对齐、RPC 重建和权限补全。
- `supabase-moments*.sql` 增加动态、动态互动、地点和公开/白名单/黑名单可见性。
- `supabase-comments-thread.sql` 给文章评论增加 `parent_id`，支持树状回复和管理员操作。
- `supabase-admin-user-activity.sql` 增加管理员查看用户行为时间线的 RPC。

**重要边界：** 本地 SQL 不包含 Supabase 线上业务数据；不要把用户数据、Storage 文件或管理员账号信息假设为已恢复。

## 7. Threads 转发 pipeline

```text
动态正文粘贴 Threads 链接
  → moments.js 识别帖子 ID
  → 从 Storage/threads-reposts/<postId>.json 读取结构化结果
  → 缺失时检测本机 bridge（127.0.0.1:8788）
  → bridge 使用独立 Chrome 的 CDP/登录态抽取 Threads
  → threads-fetch Edge Function 转存媒体并写回 JSON
  → 前端渲染官方 embed 风格卡片
```

本地 bridge 使用 Chrome 调试端口 `9222`，只应绑定 loopback。接口包括 `/api/status`、`/api/open`、`/api/cookies`、`/api/fetch`、`/api/close`。Edge Functions 还包括 `threads-login`、`admin-create-user`、`admin-update-profile`。

媒体逻辑已经考虑：

- 顶层 `video_versions` 和 `image_versions2.candidates`。
- 候选去重、过滤 `blob:` URL、优先高质量资源。
- 图片/视频混排、两张一页、独立查看器。
- hover 静音播放；切页、隐藏页面、离开预览和关闭查看器时停止/释放视频。
- 服务器转存图片/视频，尽量避免 fbcdn 临时签名 URL 过期。

限制：自动抓取依赖本机桥；访客设备没有桥时不会凭空抓取。旧 JSON 中若仍是失效的 fbcdn URL，需要重新抓取迁移。绝不要把 Cookie、sessionid、账号密码、service role key 写入仓库或恢复文档。

## 8. 已执行验证

截至 2026-09-20：

```text
通过：data/welcome.yaml
通过：static/admin-cms/config.yml
通过：data/cards.yaml / data/player.yaml / data/site.yaml
通过：static/js/moments.js
通过：static/js/comments.js
通过：static/js/profile.js
通过：static/js/supabase.js
通过：static/js/admin.js
通过：themes/brutalism/static/js/theme.js
通过：threads-repost/fetch.mjs
通过：music-api/server.js
通过：float-player/netease-proxy/server.js
通过：scripts/start-netease-player.js
未验证：hugo build（本机未安装 Hugo）
```

可重复验证：

```bash
python3 - <<'PY'
import yaml
for p in ['data/welcome.yaml', 'static/admin-cms/config.yml']:
    with open(p, encoding='utf-8') as f:
        yaml.safe_load(f)
    print('OK', p)
PY

for f in \
  static/js/moments.js static/js/comments.js static/js/profile.js \
  static/js/supabase.js static/js/admin.js themes/brutalism/static/js/theme.js \
  threads-repost/fetch.mjs music-api/server.js \
  float-player/netease-proxy/server.js scripts/start-netease-player.js; do
  node --check "$f" || exit 1
done
```

## 9. 后续优先级

1. 在 Supabase Dashboard 核验线上表、RLS、Realtime publication、Storage 桶和真实数据是否仍存在。
2. 在 Cloudflare Pages 检查 `blog-go3.pages.dev` 的最新部署是否包含当前 commit 的特征。
3. 获得 Hugo `0.164.0 extended` 后执行完整构建；若构建失败，再按具体模板/资源错误修复。
4. 若 Threads 旧数据媒体失效，先备份现有 JSON，再通过本地 bridge 重新抓取并由 Edge Function 转存。
5. 任何 `git push` 前先确认工作树和远程：

```bash
git --git-dir=/tmp/blog-recovered/.git \
  --work-tree=/home/levia/文档/blog status --short --branch
# 如有 CMS 自动提交，先 pull --rebase，再推送
```

## 10. 敏感信息规则

本恢复记录只记录结构、路径、命令和结论，不记录：

- Supabase service-role key、JWT、Cookie、sessionid、PAT、OAuth secret、账号密码。
- 网易云登录 cookie/session 文件。
- Threads Chrome profile 或浏览器调试数据。
- Supabase 线上真实用户/动态/评论/媒体数据。

这些信息即使在本机存在，也不应复制到 Git 仓库、Markdown 交接文档、Issue 或聊天记录中。
