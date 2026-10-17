# Supabase + R2 媒体接入

当前完成的是代码与本地验证。尚未创建云端 R2 桶、部署 Worker/Edge Functions、启用网站配置或迁移真实文件。Cloudflare 登录回调未完成，用户已选择先完成本地工作；Supabase Storage 的 402 问题仍需官方恢复通道。

## 存储与权限

- Supabase 保留账号、PostgreSQL、角色/RLS、评论、动态与媒体登记。
- 一个私有 R2 Standard 桶 `levia-blog-media`，使用 `media/`、`avatars/`、`threads-reposts/`、`user-audio/` 四个逻辑前缀。
- Worker 校验 Supabase 用户及 `get_my_profile` 返回的 active 状态。媒体写入仍限 superadmin；普通用户仅可操作自己的头像。文件大小、类型、路径与批量删除逐项在服务端校验。
- Edge Functions 与迁移脚本使用独立的 `INTERNAL_TOKEN`。该密钥可操作四个媒体前缀，不能放到网页、Git、命令行参数或聊天中；不要复用 Supabase service role key。
- R2 桶保持私有，由 Worker 提供读取与 Range 请求。`/object/public/` 与原 Supabase public 桶一样，持有 URL 即可读取；它不提供私有动态附件的单独鉴权。不要将此前非公开的文件混入本清单。
- 未设置 `params.mediaOrigin` 时沿用 Supabase。启用 R2 后，R2 写入出错不会静默回写 Supabase，避免继续增加旧存储用量。删除旧媒体时按记录中的旧 URL 选择旧存储。
- 前端、Edge 与迁移工具只接受不含账号、路径或查询参数的 HTTPS origin。带服务密钥的上传拒绝重定向，避免将密钥转发给其他站点。
- 完整 GET 返回 200；单段 Range 支持起止、开放结尾、后缀和结尾截断，越界返回 416。支持 ETag 列表、弱 ETag、If-Range；不匹配时读取完整对象，避免将旧缓存片段与新文件混合。

## 压缩规则与 HDR 边界

| 类型 | 处理 |
|---|---|
| 普通 JPEG/PNG/WebP | 原图长边最多 2560px、WebP 质量 0.86–0.88；预览长边 600px、质量 0.70–0.72；不放大图片，仅在更小时采用压缩原图 |
| JPEG HDR 增益图、多图 MPF、AVIF/HEIC/JXL、高位深或 HDR PNG、动画 | 原字节保留，避免 Canvas/WebP 丢失 HDR、增益图或动画；当前不会缩小这些图片的尺寸 |
| 普通视频 | 离线生成长边最多 1920px 的 H.264/AAC 副本，仅采用更小的结果 |
| PQ/HLG 视频 | 离线缩到长边最多 1920px，HEVC 10-bit、hvc1；检查传递函数、色域、矩阵及源中存在的 mastering/CLL 元数据 |
| Dolby Vision、HDR10+、HDR 信号不完整 | 原字节保留，避免丢失动态元数据；当前不缩放这些视频 |

浏览器与免费 Worker **不会自动转码视频**。网页视频上传保留源文件；现有文件迁移时由本机 FFmpeg 执行优化，新视频可先运行下列离线命令再上传。普通图片的网页/PWA 压缩已接通，历史预览补建复用同一 HDR/长边策略，仅在源图所属的当前存储补建、确认 404 后才上传，不能覆盖已有预览。Canvas 不可用或不能输出 WebP 时保留输入。Threads Edge Function 暂不转码，R2 下没有 Supabase 的按需图片转换，暂用源图读取。

```bash
python3 scripts/media_optimize.py /private/input.mov /private/output.mp4
```

工具拒绝覆盖输入或已有输出。若编码后没有变小，会将原字节复制到指定输出；此时文件实际格式以源文件为准，不应仅凭 `.mp4`/`.webp` 扩展名判断编码。迁移工具会据处理结果设置正确的 Content-Type。已经变成 SDR 的旧 WebP 无法恢复被丢弃的 HDR 信息。实际 HDR 观感还依赖浏览器、解码器和显示器，本轮只验证编码及元数据。

## 云端接入步骤（尚未执行）

1. 由用户在 Cloudflare 账号中完成 R2 开通/计费订阅确认；Standard 免费额度不能视为永远零费用。
2. 在本目录使用官方 Wrangler 创建私有桶并部署 Worker：`npx wrangler r2 bucket create levia-blog-media`，然后 `npx wrangler secret put INTERNAL_TOKEN`、`npx wrangler deploy`。通过隐藏提示输入新服务密钥。
3. 在 Supabase 的函数 secrets 中配置 `BLOG_MEDIA_ORIGIN`（HTTPS Worker 域名）和 `BLOG_MEDIA_TOKEN`（同一服务密钥），重新部署 `threads-fetch` 与 `admin-update-profile`。`threads-fetch` 原有函数内 active superadmin 校验仍保留。
4. 测试 Worker 的认证拒绝、头像归属、上传/删除、视频 Range 以及 Edge 转存。Supabase Auth/RPC 仍受 402 限制时，普通用户的写入会失败关闭，不会绕过账号权限。
5. 完成下列备份、迁移、校验与 SQL 审阅后，才在 `hugo.yaml` 的 `params` 增加 `mediaOrigin: https://实际Worker域名` 并发布站点。需要新增正式站点域名时，同时更新 `ALLOWED_ORIGINS`。

R2 公共开发域名 `r2.dev` 无需启用；这里通过 Worker R2 binding 访问私有桶。不要把任何 R2/Supabase 管理密钥放入 Hugo 配置。

## 现有文件迁移（尚未对真实数据执行）

1. 在 Supabase SQL Editor 运行只读的 `scripts/media_inventory.sql`，导出 CSV 或 JSON 数组，人工核对清单和公开可见性。先恢复原文件的正常下载能力；402 期间本脚本无法替平台取回文件。
2. 备份数据库相关行和仓库内容。将清单与迁移目录放在仓库外的私有目录，保留足够磁盘空间。
3. 下载并优化，默认不上传、不修改数据库、不删除源文件：

   ```bash
   python3 scripts/migrate_media_r2.py /private/inventory.csv /private/blog-media-migration
   ```

4. 在本机安全环境配置 `BLOG_MEDIA_ORIGIN` 和 `BLOG_MEDIA_TOKEN`，再加 `--upload`。上传不覆盖已存在的不同文件；每个对象下载回来核对 SHA-256。可按清单恢复进度；发现备份被改动、源清单版本/大小或目标 origin 变化时停止。整份清单的路径与大小先验证，避免部分下载后才发现非法项。
5. Threads JSON 最后处理，内部媒体 URL 会改为清单中对应的 R2 URL。只有全部对象回读校验通过，才生成 `switch-media.sql` 和反向的 `rollback-media.sql`；两者均**只生成，不执行**。每次重跑先撤下旧 `switch-media.sql`，当前对象重新校验前清除其成功标记；失败时保留上一次成功运行的回滚 SQL。
6. 审阅切换 SQL。它处理媒体登记、头像、动态媒体/正文和内容 metadata；历史版本、仓库 Markdown/YAML、离线待同步任务需要另行引用审计。确认 schema 后，在数据库备份和短暂停写条件下执行事务，再启用网站 R2 配置。回滚需要保留旧文件，且不能把切换后新增的数据当作已自动回滚。
7. 真实账号与浏览器验收后，再单独审核旧 Supabase 对象的清理范围。脚本不生成自动删除指令；禁止直接删除 `storage.objects` 行来清理实际文件。

## 本地验证

测试数据均为合成样本。Worker 的 Node 测试使用内存存储，另通过 Wrangler/真实 workerd 的本地 R2 绑定验证了流式上传、409 防覆盖、Range、列表和测试对象删除；这些不代表云端已部署。

```bash
node --test media-worker/worker.test.mjs
node tests/media-policy.test.cjs
node tests/media-storage.test.cjs
node tests/image-compress.test.cjs
node tests/legacy-preview.test.cjs
# 本轮 Node 22.23.3 可直接执行 Edge 共享 TypeScript 模块：
node tests/edge-media-storage.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 tests/media_optimize_test.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/media_migration_test.py
# tests/pwa-sync/package.json 中已有 fake-indexeddb，安装该开发依赖后执行：
node tests/pwa-sync/pwa-sync.test.cjs
hugo --minify
```

实际 FFmpeg 合成样本：2048×1152 → 1920×1080，PQ 409903 → 205201 bytes，HLG 407256 → 188028 bytes，SDR 472647 → 152556 bytes。另验证了 321×241 → 320×240 的奇数尺寸视频与音轨/时长保留。数值仅表示合成短样本，不能推广为真实媒体的压缩率。

参考：[R2 binding/条件写入](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)、[Ultra HDR 增益图规范](https://developer.android.com/media/platform/hdr-image-format)、[x265 HDR 元数据选项](https://x265.readthedocs.io/en/stable/cli.html)。
