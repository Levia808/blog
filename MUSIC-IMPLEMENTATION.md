# 音乐功能实现文档

## 概述

本项目实现了一个完全合规的音乐播放功能：
- **网易云歌单仅作元数据来源**（歌名、歌手、专辑等）
- **匹配到免费合法的第三方曲库**（Audius、Internet Archive、Jamendo）
- **访客可在博客内播放**经官方允许的歌曲
- **不使用网易云 Cookie、Token、会员权限或私有接口**

## 架构

```
用户提供歌单元数据 (CSV/JSON)
    ↓
导入器 (music-sync/src/import.js)
    ↓
同步引擎查询第三方 API (music-sync/src/sync.js)
    ↓
生成静态目录 (data/music/catalog.json)
    ↓
Hugo 构建
    ↓
访客播放器 (themes/brutalism/layouts/_default/music.html)
```

## 第三方来源

### 1. Audius（优先级：高）
- **无需 API Key**
- 去中心化音乐平台
- 直接流媒体播放
- API: https://docs.audius.co/developers
- 状态：已实现并测试

### 2. Internet Archive（优先级：高）
- **无需认证**
- Creative Commons 音乐集合
- 直接下载播放
- API: https://archive.org/services/docs/api/
- 状态：已实现并测试

### 3. Jamendo（优先级：中）
- **需要 client_id**（在 https://devportal.jamendo.com 注册）
- 仅限非商业使用
- Creative Commons 音乐
- API: https://developer.jamendo.com/v3.0
- 状态：已实现，需配置

## 使用流程

### 1. 准备歌单元数据

**方式 A：导出 CSV**
```csv
title,artist,album,duration,cover,source_url,source_id
Shape of You,Ed Sheeran,÷ (Divide),233,https://...,https://music.163.com/#/song?id=123,123
```

**方式 B：导出 JSON**
```json
{
  "name": "我的歌单",
  "tracks": [
    {
      "title": "歌曲名",
      "artist": "歌手",
      "album": "专辑",
      "duration": 240
    }
  ]
}
```

### 2. 导入元数据

```bash
cd music-sync
npm install
npm run import -- --file path/to/playlist.csv
```

### 3. 同步匹配

```bash
npm run sync
```

这会：
- 查询 Audius、Internet Archive（和 Jamendo 如果已配置）
- 计算匹配置信度
- 生成 `data/music/catalog.json`

### 4. 验证和报告

```bash
npm run validate  # 验证 JSON 和 URL
npm run report    # 查看匹配统计
```

### 5. 构建和部署

```bash
cd ..
hugo --minify
```

生成的站点包含 `/music/` 页面。

### 6. 访问播放器

访问 `https://your-site.com/music/`

## 匹配算法

### 置信度计算

```
confidence = (
  titleSimilarity * 0.4 +
  artistSimilarity * 0.3 +
  albumSimilarity * 0.2 +
  durationMatch * 0.1
) * versionPenalty
```

- **≥ 0.85**: 高置信度，自动选用
- **0.70 - 0.84**: 中等置信度，标记 `needs-review`
- **< 0.70**: 低置信度，不使用

### 版本识别

自动检测以下变体并降低置信度：
- Live / 现场版
- Remix / 混音
- Cover / 翻唱
- Acoustic / 原声
- Instrumental / 伴奏
- Sped up / Slowed

## 播放器功能

- ✅ 播放/暂停
- ✅ 上一首/下一首
- ✅ 进度条拖动
- ✅ 播放队列
- ✅ 封面显示
- ✅ 来源标注和跳转
- ✅ Media Session（锁屏控制）
- ✅ 响应式设计
- ✅ 错误回退

## 状态定义

| 状态 | 说明 | 处理方式 |
|------|------|----------|
| `playable` | 可直接播放 | 直接使用 `<audio>` 播放 |
| `needs-review` | 待人工复核 | 不自动添加到播放队列 |
| `external-only` | 仅提供外链 | 显示跳转按钮 |
| `unavailable` | 无可用来源 | 仅显示元数据 |

## 文件结构

```
blog/
├── music-sync/                    # 同步系统
│   ├── src/
│   │   ├── import.js             # 导入器
│   │   ├── sync.js               # 同步引擎
│   │   ├── validate.js           # 验证工具
│   │   └── report.js             # 报告生成
│   ├── test/
│   │   └── sample-playlist.csv   # 测试数据
│   ├── package.json
│   └── README.md
├── data/music/
│   ├── raw/                      # 原始导入数据
│   │   └── playlist-*.json
│   └── catalog.json              # 公开静态目录
├── content/
│   └── music.md                  # 音乐页面
├── themes/brutalism/layouts/_default/
│   └── music.html                # 播放器模板
└── .env.example                  # 配置示例
```

## 配置

### 环境变量（可选）

复制 `.env.example` 到 `.env`：

```bash
# Jamendo（可选）
JAMENDO_CLIENT_ID=your_client_id_here
```

### Hugo 菜单

已自动添加到 `hugo.yaml`：

```yaml
menu:
  main:
    - name: 音乐
      url: music/
      weight: 7
```

## 安全与合规

### 严格禁止

1. ❌ 使用网易云 Cookie、Token、会员权限
2. ❌ 调用网易云私有接口获取音频
3. ❌ 抓取、破解、代理受限音频
4. ❌ 使用来历不明的"解析 API"
5. ❌ 上传第三方音频到自有存储
6. ❌ 在前端暴露 API Secret
7. ❌ 声称"所有歌曲都能播放"

### 必须遵守

1. ✅ 网易云仅作元数据来源
2. ✅ 只使用第三方官方 API
3. ✅ 遵循各平台播放方式
4. ✅ 显示来源署名和许可
5. ✅ 不可播放标记清晰
6. ✅ 保留原平台跳转入口

## API 配额

| 来源 | 配额 | 认证 |
|------|------|------|
| Audius | 无明确限制 | 不需要 |
| Internet Archive | 无明确限制 | 不需要 |
| Jamendo | 35,000/月 | 需要 client_id |

## 限制与已知问题

### 匹配覆盖率

- 商业流行歌曲在免费平台覆盖较低
- 可能匹配到翻唱、现场版等变体
- 同名歌曲可能误匹配

### 解决方案

1. 使用高质量元数据（完整的歌手、专辑信息）
2. 人工复核低置信度结果
3. 编辑 `data/music/catalog.json` 调整匹配
4. 考虑添加更多免费来源

### 测试结果

使用示例歌单（3首流行歌曲）：
- Audius 找到 2 首可播放版本
- Internet Archive 找到 1 首样本资源
- 置信度较低（0.31 - 0.42），需人工复核
- URL 验证：2/3 可访问

## 故障排查

### 导入失败

```bash
# 检查文件格式
head -5 playlist.csv

# 检查编码
file -i playlist.csv  # 应为 UTF-8

# 查看错误详情
npm run import -- --file playlist.csv 2>&1 | tee import.log
```

### 同步失败

```bash
# 检查网络连接
curl -I https://discoveryprovider.audius.co/v1/tracks/trending

# 预览模式调试
npm run sync -- --dry-run

# 只使用特定来源
npm run sync -- --provider audius
```

### 播放失败

1. 检查浏览器控制台错误
2. 验证 `catalog.json` 生成正确
3. 测试流媒体 URL：
   ```bash
   curl -I "https://discoveryprovider.audius.co/v1/tracks/{id}/stream"
   ```
4. 检查 Hugo 构建警告

### Hugo 构建问题

```bash
# 清理缓存
rm -rf public/ resources/

# 重新构建
hugo --minify --verbose
```

## 维护

### 定期更新

```bash
# 重新同步以更新失效链接
cd music-sync
npm run sync -- --force

# 验证结果
npm run validate
npm run report
```

### 添加新歌单

```bash
# 导入新歌单
npm run import -- --file new-playlist.csv

# 增量同步
npm run sync
```

### 人工复核

编辑 `data/music/catalog.json`：

```json
{
  "tracks": [
    {
      "bestMatch": 1  // 改为其他候选索引
    }
  ]
}
```

## 开发与测试

### 语法检查

```bash
cd music-sync
npm run check
```

### 测试样例

```bash
npm run import -- --file test/sample-playlist.csv --dry-run
npm run sync -- --dry-run
```

### 本地预览

```bash
cd ..
hugo server --port 1450
# 访问 http://localhost:1450/music/
```

## 部署检查清单

- [ ] 导入歌单元数据
- [ ] 运行同步匹配
- [ ] 查看报告和验证结果
- [ ] 人工复核低置信度匹配
- [ ] 测试 Hugo 构建
- [ ] 本地预览播放器
- [ ] 检查 `.gitignore` 排除敏感文件
- [ ] 确认无 Secret 泄露
- [ ] 提交到 Git
- [ ] 等待 CI/CD 部署
- [ ] 验证生产环境

## 扩展功能（未来）

- [ ] 更多免费来源（SoundCloud CC、ccMixter 等）
- [ ] ISRC 精确匹配
- [ ] 自动更新失效链接
- [ ] 播放历史和收藏
- [ ] 歌词显示
- [ ] 分享功能
- [ ] PWA 离线播放

## 参考资料

- [Audius API](https://docs.audius.co/developers)
- [Internet Archive API](https://archive.org/services/docs/api/)
- [Jamendo API](https://developer.jamendo.com/v3.0)
- [Hugo Data Templates](https://gohugo.io/templates/data-templates/)
- [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)

## 许可

本项目：MIT License

第三方来源：
- Audius: 各歌曲独立许可
- Internet Archive: 各项目独立许可
- Jamendo: Creative Commons，非商业使用
