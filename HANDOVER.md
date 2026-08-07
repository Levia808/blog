# 📋 博客项目 · LLM 交接文档（持续更新）

> 用途：任意 LLM / 新开发者可凭此文档无缝接手工作。
> 更新规则：每次任务完成后追加「工作日志」并刷新状态，保持本文档为唯一事实源。
> 最后更新：2026-08-07 · Levia808

---

## 0. 项目速览

| 项 | 值 |
|----|-----|
| 本地路径 | `/home/levia/blog` |
| 仓库 | `https://github.com/Levia808/blog`（main） |
| 主站 | `https://blog-go3.pages.dev/`（Cloudflare Pages） |
| 镜像站 | `https://levia808.github.io/blog/`（GitHub Pages） |
| 框架 | Hugo v0.164.0 extended |
| 主题 | **brutalism**（自制独立主题，`themes/brutalism/`） |
| 语言 | zh-cn |
| 作者 | Levia（GitHub: Levia808，站点名 "Levia's blog"） |

**git 凭证**：`~/.git-credentials`（token 形式，可用 python 提取做 API 调用）。
**网络**：github/workers 等需代理 `http://127.0.0.1:7897`（仓库级 git 代理已配）。

---

## 1. 技术架构

```
┌─ 前端: Hugo 静态站 (themes/brutalism 独立主题)
│   ├─ 首页 100vh 终端欢迎页 + 3:2 封面卡片
│   ├─ 文章页: 全页底图 (fixed 背景纹) + sticky TOC + 归档徽章
│   ├─ Fuse.js 站内搜索 (Ctrl+K, /search/)
│   └─ 深/浅双主题 (data-theme, 语义变量)
├─ 后台: /admin/ 管理面板 (独立全屏壳层, Supabase + GitHub API)
│   ├─ 仪表盘/文章管理/内容归档/评论审核/用户管理/媒体库/系统设置
│   └─ 发布/下架/归档/删除/编辑 全链路操作
├─ CMS: /admin-cms/ Sveltia CMS (GitHub OAuth 经 Worker)
│   └─ 文章编辑器内嵌视频/音频组件 (registerEditorComponent)
├─ 后端: Supabase (Auth/DB/Storage)
│   └─ https://iyquixzprfwkglaqptxj.supabase.co (anon key 见 static/js/supabase.js)
└─ OAuth: Cloudflare Worker sveltia-cms-auth
    └─ https://sveltia-cms-auth.18013013170.workers.dev
```

---

## 2. 关键服务配置

### 2.1 Supabase
| 项 | 值 |
|----|-----|
| URL | `https://iyquixzprfwkglaqptxj.supabase.co` |
| Anon Key | `sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT`（static/js/supabase.js:2） |
| 数据库 | `supabase-setup.sql`（迁移）+ `supabase-fix2.sql`（修复补丁，幂等） |
| 角色体系 | superadmin（唯一，GitHub levia808 自动持有）/ admin / author / user |
| 前端封装 | `window.Auth/Profile/Admin/CommentService`（static/js/supabase.js） |

**⚠️ 近期必须做**：在 Supabase SQL Editor 运行**最新版** `supabase-fix2.sql`——修复 `admin_list_users` 的 email 类型不匹配（`auth.users.email` 是 varchar(255)，函数 SELECT 需 `::TEXT` 转换）。运行后重新登录站点。

### 2.2 GitHub OAuth（Sveltia CMS）
| 项 | 值 |
|----|-----|
| Worker | `https://sveltia-cms-auth.18013013170.workers.dev` |
| OAuth App | Client ID `Ov23li58Tb5SyzR9x3vg`（Secret 仅在 Worker 环境变量） |
| 回调 | `<worker>/callback` |
| 用途 | Sveltia CMS 登录 + 后台一键发布（scope: repo,user） |
| 管理 | Cloudflare Dashboard → Workers & Pages → `sveltia-cms-auth` → Settings → Variables |

### 2.3 CMS（Sveltia）
- 配置：`static/admin-cms/config.yml`（posts/pages 集合 + archived/cover/background 字段）
- 编辑器组件：`static/admin-cms/index.html` 内注册 video/audio（file widget 上传直接内嵌）
- 登录：admin-cms 页 → Continue with GitHub（管理员 gate 校验 Supabase superadmin）
- 上传目录：`assets/images/`（Hugo 构建时自动压缩：封面 320px / 底图 2K）

### 2.4 部署
- Cloudflare Pages：监听 main push，`hugo` 构建，输出 `public`
- GitHub Pages：`.github/workflows/deploy.yml`（push 触发**当前失效**，需手动 dispatch：API `POST /repos/Levia808/blog/actions/workflows/328430001/dispatches`，body `{"ref":"main"}`，Authorization 用 git 凭证 token）
- GH Pages 构建带 `--baseURL https://levia808.github.io/blog/`（/blog/ 子路径）

---

## 3. 主题 brutalism（v7 设计语言）

**矿物单色 + 单点苔绿 · 零阴影/零渐变/零模糊 · transform-only 动效**

| Token | Dark | Light |
|-------|------|-------|
| --bg | #0C0C0B | #F2F2ED |
| --surface | #161615 | #FFFFFF |
| --border | #2C2C2A | #D8D8D2 |
| --fg / --muted / --faint | #E8E8E3 / #7A7A75 / #3E3E3C | #1A1A18 / #6B6B66 / #B5B5AE |
| --accent | #6B8B6B | #4E6B4E |
| --code-bg / --body-text / --hover-bg | #0A0A09 / #C9C9C4 / #1B1B1A | #F2F2ED / #3A3A38 / #E8E8E2 |
| --overlay / --bg-opacity | rgba(0,0,0,.85) / .22 | rgba(10,10,10,.35) / .14 |

**字体**：Space Grotesk（标题）/ Inter（正文）/ Noto Sans SC（中文）/ JetBrains Mono（代码·标签）
**关键文件**：`assets/css/main.css`（设计系统）+ `assets/css/features.css`（认证/评论/个人中心/管理面板）
**设计稿**：`design-proposal-brutalist.html`（v7 主站）、`design-admin-panel.html`（管理面板）

---

## 4. 已实现功能清单

| 功能 | 位置 | 状态 |
|------|------|------|
| 终端欢迎页（纯 CSS 循环） | layouts/index.html | ✅ |
| 文章卡片 3:2 封面（自动压缩 320px） | partials/post-card.html | ✅ |
| 文章底图（2K 压缩 · 全页 fixed 背景纹 · 底部锚定） | _default/single.html | ✅ |
| 深/浅主题切换（语义变量全组件适配） | main.css | ✅ |
| Fuse.js 搜索（Ctrl+K 浮层 + /search/） | theme.js | ✅ |
| 评论区（Supabase，多外键已修复） | partials/comments.html + comments.js | ✅ |
| 个人中心 /profile/（编辑资料/头像/角色徽章） | _default/profile.html | ✅ |
| 管理面板全屏壳层（左竖导航 7 分区） | _default/admin.html + admin.js | ✅ |
| 文章快捷操作：发布/下架/归档/取消归档/删除/编辑 | admin.js（GitHub API） | ✅ |
| 文章列表操作后自动刷新（3 列表同步） | admin.js | ✅ |
| 内容归档（archived: true，首页/列表/搜索隐藏+徽章） | 主题 + admin | ✅ |
| 媒体库：Supabase + GitHub 仓库真实文件合并 | admin.js | ✅ |
| 视频/音频一键上传内嵌（CMS 编辑器组件） | admin-cms/index.html | ✅ |
| video/audio shortcode（资源解析+中文路径） | layouts/shortcodes/ | ✅ |
| GitHub 昵称显示（user_metadata.user_name） | auth-ui.js / profile.js | ✅ |
| 仪表盘刷新状态 + GitHub 授权状态标签 | admin.js | ✅ |

---

## 5. 工作日志（近期提交摘要）

| 提交 | 内容 |
|------|------|
| `8a5c067` | 修复 admin_list_users email 类型不匹配（varchar(255)→TEXT 转换） |
| `b24e6f9` | supabase-fix2.sql 修正 admin_delete_media 参数类型 + 依赖补建 |
| `b6b17b7` | 错误详情显示增强 + supabase-fix2.sql（表/函数/权限修复） |
| `24aa5d0` | 管理面板数据全部真实化（文章数=GitHub 真实、媒体库合并仓库文件） |
| `1662755` | 深/浅双主题语义变量全组件适配 |
| `36af560` | 修复视频无法播放（assets 输出 + URL 解码） |
| `3f0f0b6` | 文章操作链路确认 + 视频/音频复制嵌入代码 |
| `c525daf` | 管理面板删除/下架入口 + 底图全页铺满 |
| `899d9ea` | 内容归档管理 |
| `bd13226` | 修复卡片比例塌陷（post-card 文字区丢失） |
| `cc69c30` | 恢复被 CMS 误删文章 + 图片位置修复 |
| `884d149` | 修复图片不显示（TrimPrefix 参数顺序） |
| `7fc4dbe` | 修复编辑按钮 404（相对路径→绝对） |
| `b653575` | 管理面板全中文 + 图片自动压缩 + 文章页排版 |

---

## 6. 已知问题与注意

1. **push 不触发 GH Actions**：仓库级问题，GitHub Pages 部署需手动 dispatch（见 §2.4）
2. **Supabase 结构漂移**：数据库与仓库 SQL 版本可能不同步，出错先跑 `supabase-fix2.sql`
3. **CMS 删除文章可能误删多篇**：Sveltia 删除时确认只勾选目标文章
4. **文章 date 必须带秒和时区**：CMS 已配 format，但旧文章若 date 非法会导致**构建失败**
5. **assets/ 文件只有被引用才输出**：视频/音频/图片都需经 shortcode/partial 资源解析
6. **Markdown 正文中 `{{ }}` 不渲染**：模板语法只能在布局文件用
7. **凭证安全**：wrangler 会在 CWD 生成 `sveltia-cms-token` 等文件——**严禁 `git add -A` 提交**，用后即删
8. **浏览器/CF 缓存**：改动后强刷（Ctrl+F5）验证
9. **GitHub OAuth 回调**：改 worker 域名需同步改 GitHub App 回调 + config.yml base_url
10. **测试文章**：`content/posts/2026-08-07-这是一个测试.md`（含视频测试《视频测试》）

---

## 7. 开发命令速查

```bash
cd /home/levia/blog
export PATH="$HOME/.local/bin:$PATH"

hugo new content posts/文章名.md     # 新文章
hugo server -D                       # 本地预览 (默认 :1313)
hugo --minify                        # 构建 (public/)
hugo --minify --baseURL https://levia808.github.io/blog/ -d /tmp/ghbuild   # GH Pages 构建验证

# 推送 (先 pull --rebase 避免冲突)
git add -A && git commit -m "desc" && git pull --rebase origin main && git push

# GH Pages 手动部署 (push 自动触发失效时)
TOKEN=$(python3 -c "
raw = open('/home/levia/.git-credentials').read().strip()
print(raw.split('@github.com')[0].split('https://')[1].rstrip(':'))")
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/Levia808/blog/actions/workflows/328430001/dispatches" \
  -d '{"ref":"main"}'
```

---

## 8. 当前待办 / 下一步

- [ ] 用户运行最新 `supabase-fix2.sql` 后确认管理面板正常
- [ ] 后台管理面板建议持续按需优化（以大厂级成熟度为目标）
- [ ] GH Actions push 自动触发问题（仓库设置需人工检查）
- [ ] Cloudflare Token 曾短暂暴露于本地 git 对象，建议用户 Roll 重建

---

<p align="right"><em>HANDOVER v1.0 · 2026-08-07 · 持续更新中</em></p>
