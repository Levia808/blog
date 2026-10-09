# 音乐系统 - 网易云元数据 + 免费曲库匹配

## 架构概述

```
用户提供网易云歌单元数据
  ↓
导入器 (import.js) → data/music/raw/playlist-{id}.json
  ↓
同步引擎 (sync.js) → 查询 Audius/Internet Archive/Jamendo
  ↓
匹配与置信度评估
  ↓
生成公开目录 → data/music/catalog.json
  ↓
Hugo 构建 → 静态站点
  ↓
访客播放器读取 catalog.json
```

## 数据流

### 输入：网易云歌单元数据

**方式 1：用户自行导出 CSV/JSON**
```csv
title,artist,album,duration,cover,source_url
歌曲名,歌手名,专辑名,240000,https://...,https://music.163.com/#/song?id=123
```

**方式 2：公开歌单 ID**（如果官方 API 可用且允许）
```bash
npm run import -- --playlist-id 3778678
```

### 输出：公开静态目录

`data/music/catalog.json`:
```json
{
  "version": 1,
  "generatedAt": "2026-10-09T10:00:00Z",
  "tracks": [
    {
      "id": "1",
      "title": "歌曲名",
      "artist": "歌手",
      "album": "专辑",
      "duration": 240,
      "cover": "https://...",
      "matches": [
        {
          "provider": "audius",
          "providerTrackId": "abc123",
          "confidence": 0.95,
          "status": "playable",
          "playbackMode": "direct",
          "sourceUrl": "https://audius.co/track/...",
          "streamUrl": "https://discoveryprovider.audius.co/v1/tracks/{id}/stream",
          "attribution": "Licensed by artist on Audius",
          "checkedAt": "2026-10-09T10:00:00Z"
        }
      ],
      "bestMatch": 0,
      "originalSource": "netease",
      "originalId": "123"
    }
  ]
}
```

## 使用方法

### 1. 安装依赖

```bash
cd music-sync
npm install
```

### 2. 配置（可选）

复制 `../.env.example` 到 `../.env`，配置 Jamendo client_id（可选）。

### 3. 导入歌单元数据

**从 CSV 文件导入：**
```bash
npm run import -- --file path/to/playlist.csv
```

CSV 格式：
- 必需字段：`title`, `artist`
- 可选字段：`album`, `duration`, `cover`, `source_url`, `source_id`

**从 JSON 文件导入：**
```bash
npm run import -- --file path/to/playlist.json
```

JSON 格式：
```json
{
  "name": "我的歌单",
  "tracks": [
    {
      "title": "歌曲名",
      "artist": "歌手",
      "album": "专辑",
      "duration": 240000,
      "cover": "https://..."
    }
  ]
}
```

### 4. 同步匹配

```bash
npm run sync
```

选项：
- `--dry-run` - 预览模式，不保存结果
- `--force` - 强制重新匹配已有结果
- `--provider audius|archive|jamendo` - 只使用指定来源

同步过程：
1. 读取 `data/music/raw/*.json`
2. 对每首歌查询各第三方来源
3. 计算匹配置信度
4. 选择最佳匹配
5. 生成 `data/music/catalog.json`

### 5. 验证结果

```bash
npm run validate
```

检查：
- JSON schema 合法性
- 所有 URL 可访问性
- 许可信息完整性
- 播放状态一致性

### 6. 生成报告

```bash
npm run report
```

输出：
- 总曲目数
- 成功匹配数
- 待人工复核数
- 仅外链数
- 不可用数
- 各来源分布

## 第三方来源

### Audius（优先级：高）

- **无需 API Key**
- **直接流媒体 MP3**
- 搜索端点：`/v1/tracks/search?query={term}`
- 流媒体端点：`/v1/tracks/{id}/stream`
- 状态：`playable`

### Internet Archive（优先级：高）

- **无需认证**
- **大量 CC 授权音乐**
- 搜索：`https://archive.org/advancedsearch.php`
- 过滤：`mediatype:audio AND licenseurl:*creative*`
- 流媒体：`https://archive.org/download/{id}/{file}`
- 状态：`playable`（需验证每项许可）

### Jamendo（优先级：中）

- **需要 client_id**（在 https://devportal.jamendo.com 注册）
- **仅限非商业使用**
- 搜索端点：`/v3.0/tracks?namesearch={term}`
- 流媒体：API 返回 `audio` 字段
- 状态：`playable`（带 CC 许可信息）

## 匹配算法

### 置信度计算

```javascript
confidence = (
  titleSimilarity * 0.4 +
  artistSimilarity * 0.3 +
  albumSimilarity * 0.2 +
  durationMatch * 0.1
) * versionPenalty
```

- **标题相似度**：Levenshtein 距离
- **歌手匹配**：完全匹配或包含关系
- **专辑匹配**：可选加分
- **时长匹配**：差值 < 5 秒为满分
- **版本惩罚**：识别 Live/Remix/Cover 等变体

### 置信度阈值

- `>= 0.85` - 高置信度，自动选取
- `0.70 - 0.84` - 中等置信度，标记 `needs-review`
- `< 0.70` - 低置信度，不使用

### 状态定义

- `playable` - 可直接播放
- `official-embed` - 需使用官方嵌入（未来扩展）
- `preview` - 仅试听片段
- `external-only` - 仅提供外链
- `needs-review` - 待人工确认
- `unavailable` - 未找到可用来源

## 播放器集成

### Hugo 数据文件

生成的 `data/music/catalog.json` 自动被 Hugo 加载为 `.Site.Data.music.catalog`。

### 播放器页面

创建 `content/music.md`:
```yaml
---
title: 音乐
layout: music
---
```

### 模板示例

`themes/brutalism/layouts/_default/music.html`:
```html
<div id="musicPlayer"></div>
<script>
  const catalog = {{ .Site.Data.music.catalog | jsonify }};
  // 初始化播放器
</script>
```

## 限制与注意事项

1. **网易云仅作元数据来源**
   - 不使用网易云 Cookie、Token、会员权限
   - 不获取网易云音频 URL
   - 不读取私有接口

2. **第三方匹配不保证完整**
   - 商业流行歌曲可能无免费来源
   - 匹配依赖元数据准确性
   - 同名歌曲可能误匹配

3. **许可与署名**
   - Audius：按平台和歌手要求
   - Internet Archive：遵循各项目许可
   - Jamendo：必须署名，仅非商业使用

4. **API 配额**
   - Audius/Archive：无明确限制
   - Jamendo：35,000 请求/月（非商业）

5. **缓存与更新**
   - 同步结果缓存在 `catalog.json`
   - 第三方服务故障时使用缓存
   - 定期重新同步以更新失效链接

## 故障排查

### 导入失败
- 检查 CSV/JSON 格式
- 确认必需字段存在
- 检查文件编码（UTF-8）

### 匹配失败
- 检查网络连接
- 查看同步日志中的错误信息
- 使用 `--dry-run` 预览匹配结果

### 播放失败
- 检查 `catalog.json` 是否生成
- 验证流媒体 URL 可访问性
- 查看浏览器控制台错误

### 许可问题
- Jamendo 商业使用需联系 licensing@jamendo.com
- Internet Archive 验证每项 `licenseurl`
- Audius 检查每首歌曲的许可信息

## 安全与隐私

- 不在前端暴露 API Secret
- 不收集用户听歌数据
- 不上传音频到自有存储
- 不伪装或代理受限音频
- 所有播放遵循第三方官方方式

## 开发与测试

### 语法检查
```bash
npm run check
```

### 测试导入器
```bash
npm run import -- --file music-sync/test/sample-playlist.csv --dry-run
```

### 测试同步
```bash
npm run sync -- --dry-run
```

### 测试验证
```bash
npm run validate
```

## 许可声明

本项目：MIT License

第三方来源：
- Audius: 去中心化平台，具体许可见各歌曲
- Internet Archive: 各项目独立许可，需验证
- Jamendo: Creative Commons，非商业使用
