# GitHub + Cloudflare Pages 媒体发布

当前默认存储由 `hugo.yaml` 的 `params.mediaBackend: github-pages` 启用。新媒体进入 `Levia808/blog` 的 `static/media/<bucket>/`，由现有构建发布到 `https://blog-go3.pages.dev/media/`。不需要 R2 订阅、服务器管理密钥或 Pages Functions。

## 使用

打开主站 `/admin/`，点击「GitHub 媒体发布」，使用有仓库写权限的账号授权。此入口只开放仓库媒体，不授予 Supabase 管理员角色；数据库账号、评论审核等仍由原有后端鉴权。

选择文件并上传后，文件先持久保存到当前设备。媒体库立即显示本机预览，右下角显示压缩、上传、等待部署和失败恢复状态。原图与预览合并为一次 Git 提交；服务器校验 GitHub 权限，分支更新不使用 force。路径和内容相同的重试不重复提交，其他人的并行提交会保留。

文件提交后继续保留原文件和回执，直到 Pages 上该 URL 返回实际媒体，才显示完成。部署失败或等待过久不会删除本机内容；可查看仓库的构建状态、等待自动检查。失败时可重试，或明确撤销本机待办。

## 移动端与同步

- 普通浏览器和安装后的 PWA 均使用原有 IndexedDB 队列；动态、编辑、评论、点赞、可见性、资料与头像复用原有任务契约。
- 站内切页后从新页面继续；意外关闭、断网、重启后，下次以原账号打开同一域名恢复。已完成上传的文件不因等待部署再次上传。
- 手机系统可能暂停或关闭后台网页，不能保证锁屏或关闭浏览器后持续执行。这里没有后台常驻服务，也没有把认证令牌复制到 IndexedDB。
- 本机预览只属于当前设备和账号。其他设备须等待云端同步/部署完成；主域名和备用域名的本机存储相互独立。
- 多窗口通过队列租约和广播协调，同一账号的任务按顺序执行，防止编辑越过未完成的新建操作。

## 文件与历史数据边界

- Pages 单文件最多 25 MiB；Free 每月 500 次构建。每个媒体任务的原图和预览只提交一次，部署检查不触发新构建。
- 普通图片限制长边 2560px，预览 600px；沿用 HDR/动画保护规则。不安全转换的 HDR 图像保留原文件，因此可能需要在本机先处理尺寸。视频不会在手机浏览器中自动转码，应先用现有离线工具压缩到 25 MiB 内，保留 HDR 的限制见 `media-worker/README.md`。
- 只上传公开素材。文件会进入 Git 历史；普通删除只从当前版本移除，不能清除仓库历史。SVG 需先转为 PNG/WebP，媒体路径在 Pages 上另设 sandbox/nosniff 响应头。
- 原有 Supabase URL 保留，历史文件未迁移或删除。`threads-reposts` 的读写仍使用原后端，以免把历史串文重定向到空目录；Edge Functions 未切换至 GitHub。
- Supabase 402 仍阻断博客账号登录、动态和评论等云端操作。仓库媒体入口可单独使用；本机待办不等于数据库已经写入。
- R2 代码作为可选方案保留，当前不启用；切换回旧默认需去掉 `mediaBackend`。已发布的 GitHub URL 不应随切换改写或删除。

## 验证

`node tests/github-media.test.cjs` 覆盖批量原子提交、重复重试、并行分支变更、文件限制、仓库权限、OAuth 消息隔离和真实媒体就绪判断。

安装 `tests/pwa-sync/package.json` 中的依赖后，运行 `npm --prefix tests/pwa-sync test`，覆盖浏览器/PWA 持久化、账号隔离、切页释放/接管、上传回执恢复、进度、操作顺序及 402 提示。

浏览器合成测试仅保存在 `/tmp`，不进入仓库或线上；手机系统的实际后台保活、锁屏及大文件内存表现仍需真实手机验证。

参考：[Pages 文件和构建限制](https://developers.cloudflare.com/pages/platform/limits/)、[Pages 绑定存储](https://developers.cloudflare.com/pages/functions/bindings/)。
