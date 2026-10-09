# 音乐系统完整实施文档

## 概述

博客现在支持**双来源音乐播放系统**：

1. **自有音频上传**（你自己的音频文件）
2. **免费 API 来源**（Audius、Internet Archive、Jamendo）

## 架构

```
用户上传音频 → Supabase Storage (user-audio bucket)
    ↓
记录到 music_library 表
    ↓
生成用户专属 catalog
    ↓
悬浮播放器加载并播放
```

或

```
导入网易云歌单元数据
    ↓
music-sync 匹配免费来源
    ↓
生成公共 catalog
    ↓
悬浮播放器加载并播放
```

## 功能特性

### ✅ 自有音频上传

- 上传个人音频文件（MP3, WAV, OGG, M4A, FLAC）
- 存储在 Supabase Storage `user-audio` bucket
- 每个用户独立的音乐库
- 文件大小限制：50MB
- 自动提取基本元数据

### ✅ 免费 API 来源

- **Audius**：去中心化音乐平台，无需 API Key
- **Internet Archive**：Creative Commons 音乐，无需认证
- **Jamendo**：CC 音乐，需要 client_id（可选）

### ✅ 统一播放器

- 复用现有悬浮轮盘播放器
- 单一全局 `<audio>` 元素
- 支持自有音频和免费来源混合播放
- 播放失败自动回退到候选来源
- PWA Media Session 集成

## 新增文件

### 1. 数据库脚本

**`supabase-music-library.sql`**
- 创建 `music_library` 表
- 配置 RLS 策略（用户只能访问自己的音乐）
- 创建 `user-audio` storage bucket
- 提供 `get_user_music_catalog()` 函数

### 2. 上传管理页面

**`content/my-music.md`** + **`themes/brutalism/layouts/_default/music-upload.html`**
- 音频文件上传界面
- 我的音乐库列表
- 播放/删除功能
- 需要登录访问

### 3. 菜单导航

**`hugo.yaml`**
- 添加"我的音乐库"菜单项（weight: 8）

## 使用流程

### 方式 A：上传自己的音频

1. 访问 `/my-music/`
2. 登录你的账号
3. 点击"选择音频文件"
4. 选择 MP3/WAV/OGG 等音频文件
5. 等待上传完成
6. 音频自动添加到你的音乐库
7. 在悬浮播放器中播放

### 方式 B：使用免费 API

1. 准备歌单元数据（CSV/JSON）
2. 运行导入：
   ```bash
   cd music-sync
   npm run import -- --file your-playlist.csv
   ```
3. 运行同步匹配：
   ```bash
   npm run sync
   ```
4. 自动生成到 `static/data/music/catalog.json`
5. Hugo 构建时包含到站点
6. 悬浮播放器自动加载

## 数据库设置

### 必需步骤

在 Supabase SQL Editor 中运行：

```sql
-- 执行完整的 supabase-music-library.sql
```

这将创建：
- `music_library` 表
- `user-audio` storage bucket（需要在 Supabase 仪表板手动创建 bucket）
- RLS 安全策略
- 辅助函数

### Storage Bucket 配置

在 Supabase Dashboard → Storage：

1. 创建新 bucket：`user-audio`
2. 设置为 **Private**（不公开）
3. RLS 策略已在 SQL 中定义

## 安全与隐私

### ✅ 完全合规

1. **不使用网易云播放 API**
   - 仅作元数据来源（歌名、歌手、专辑）
   - 不获取网易云音频 URL
   - 不使用 Cookie/Token

2. **自有音频授权**
   - 仅上传你拥有的音频
   - 用户间完全隔离（RLS）
   - 可随时删除

3. **免费来源合规**
   - 仅使用官方公开 API
   - 遵循各平台使用条款
   - 显示来源署名

### 🔒 数据隔离

- 每个用户只能访问自己的音乐库
- Storage 路径：`user-audio/{user_id}/{timestamp}-{filename}`
- RLS 策略确保数据安全

## 播放器集成

### 数据格式统一

无论是自有音频还是免费 API，都转换为统一格式：

```json
{
  "version": 1,
  "generatedAt": "2026-10-09T...",
  "tracks": [
    {
      "id": "uuid",
      "title": "歌曲名",
      "artist": "艺术家",
      "matches": [
        {
          "provider": "upload",  // 或 "audius", "archive"
          "streamUrl": "https://...",
          "status": "playable",
          "playbackMode": "direct"
        }
      ],
      "bestMatch": 0
    }
  ]
}
```

### 播放优先级

1. 检查 `bestMatch` 索引
2. 选择 `status === 'playable'` 的 match
3. 播放失败时尝试下一个 match
4. 所有来源失败则跳过

## 文件大小限制

### 音频上传

- 最大文件大小：**50MB**
- 推荐格式：MP3（最佳兼容性）
- 高质量设置：320kbps MP3 或 FLAC

### Storage 配额

- Supabase 免费层：**1GB storage**
- 约 20-30 首高质量 MP3
- 付费计划可扩展

## 维护与管理

### 查看音乐库

```sql
SELECT 
  title, artist, source, 
  pg_size_pretty(file_size) as size,
  created_at
FROM music_library
WHERE user_id = auth.uid()
ORDER BY created_at DESC;
```

### 清理未使用的文件

```sql
-- 查找孤立文件（数据库中无记录）
SELECT * FROM storage.objects
WHERE bucket_id = 'user-audio'
AND name NOT IN (
  SELECT audio_path FROM music_library
);
```

### 导出音乐库

```sql
SELECT 
  jsonb_pretty(get_user_music_catalog(auth.uid()))
AS my_catalog;
```

## 故障排查

### 上传失败

**问题**: "Failed to upload"

**解决**:
1. 检查文件大小 < 50MB
2. 确认文件格式支持
3. 检查 Storage bucket 是否创建
4. 验证 RLS 策略

### 播放失败

**问题**: 歌曲无法播放

**解决**:
1. 检查 `audio_url` 是否可访问
2. 确认浏览器支持音频格式
3. 查看浏览器控制台错误
4. 验证 Storage 权限

### 权限错误

**问题**: "Permission denied"

**解决**:
1. 确认已登录
2. 检查 RLS 策略是否正确应用
3. 验证 `user_id` 匹配

## 扩展功能（未来）

- [ ] 批量上传
- [ ] 音频元数据编辑
- [ ] 封面图片上传
- [ ] 播放列表管理
- [ ] 歌词显示
- [ ] 分享功能
- [ ] 导入 Spotify/Apple Music 歌单
- [ ] 自动匹配封面
- [ ] 音频转码优化

## API 参考

### Supabase 客户端

```javascript
// 上传音频
const { data, error } = await supabase.storage
  .from('user-audio')
  .upload(path, file, options);

// 获取公开 URL
const { data } = supabase.storage
  .from('user-audio')
  .getPublicUrl(path);

// 查询音乐库
const { data, error } = await supabase
  .from('music_library')
  .select('*')
  .eq('user_id', userId);

// 插入新记录
const { data, error } = await supabase
  .from('music_library')
  .insert({ ...trackData })
  .select()
  .single();

// 删除记录
const { error } = await supabase
  .from('music_library')
  .delete()
  .eq('id', trackId);
```

## 成本估算

### Supabase 免费层

- Storage: 1GB（约 20-30 首歌）
- Database: 500MB
- Bandwidth: 2GB/月

### 付费层（Pro - $25/月）

- Storage: 100GB（约 2000-3000 首歌）
- Database: 8GB
- Bandwidth: 250GB/月

## 性能优化

### CDN 缓存

在 Supabase Storage 设置中：
- Cache-Control: `3600` (1 小时)
- 适合音频文件缓存

### 流式播放

浏览器原生支持 HTTP Range 请求：
- 无需完整下载即可播放
- 拖动进度条自动加载对应片段

## 合规检查清单

- [x] 不使用网易云 Cookie/Token
- [x] 不获取网易云音频 URL
- [x] 仅上传自己拥有的音频
- [x] 遵循免费 API 使用条款
- [x] 显示来源署名
- [x] 用户数据隔离
- [x] 支持随时删除
- [x] 无密钥泄露

## 许可与版权

### 自有音频

- 确保你拥有音频的版权或使用权
- 不要上传盗版或未授权音频
- 个人使用为主，避免公开分享未授权内容

### 免费 API 来源

- **Audius**: 去中心化平台，遵循各歌曲许可
- **Internet Archive**: Creative Commons，验证每项许可
- **Jamendo**: Creative Commons，仅限非商业使用

---

**总结**: 现在你可以上传自己的音频文件，也可以使用免费 API 来源。两种方式都通过统一的悬浮播放器播放，完全合规且易于使用。
