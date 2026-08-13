#!/usr/bin/env node
/**
 * Threads 串文爬虫 — 后端直接爬取 → 静态 JSON 资源 (媒体高质量版)
 *
 * 用法:
 *   THREADS_COOKIE="sessionid=...; ds_user_id=..." node fetch.mjs <threads_url> [输出路径]
 *   输出: JSON { url, id, author, handle, time, text, media[], replies[], stats, fetchedAt }
 *
 * 媒体质量策略:
 *   - 图片: 取 image_versions2.candidates 最大分辨率 + 去除 CDN 尺寸参数 (原图)
 *   - 视频: 取 video_versions 最大码率版本 (宽高最大), 附 poster 封面
 *   - 说明: Threads 无登录环境(embed/页面)均为 JS 渲染 + 登录墙, 必须携带登录 Cookie
 *   - Cookie 获取: 浏览器登录 Threads 后复制 cookie (F12 → Network → 请求头)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COOKIE = process.env.THREADS_COOKIE || '';
const URL = process.argv[2];
const OUT = process.argv[3];

if (!URL) {
  console.error('用法: THREADS_COOKIE="..." node fetch.mjs <threads_url> [输出路径]');
  process.exit(1);
}

function parseUrl(u) {
  const m = String(u).match(/threads\.net\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/i);
  if (!m) throw new Error('无效的 Threads 串文链接');
  return { handle: m[1], id: m[2] };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Cookie': COOKIE,
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('请求失败: HTTP ' + res.status);
  return res.text();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '');
}

function extractMeta(html) {
  const pick = (prop) => {
    const m = html.match(new RegExp('<meta[^>]+property="' + prop + '"[^>]+content="([^"]*)"', 'i'))
      || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+property="' + prop + '"', 'i'));
    return m ? decodeEntities(m[1]) : '';
  };
  return {
    title: pick('og:title'),
    description: pick('og:description'),
    image: pick('og:image')
  };
}

/* 从页面内嵌 JSON 提取媒体 (原图/最高码率视频) */
function extractMedia(html) {
  const media = [];
  /* 取 HTML 中所有 JSON 对象片段, 查找关键键 */
  const keys = ['carousel_media', 'video_versions', 'image_versions2'];
  const seen = new Set();

  function collectJsonAfter(key) {
    const idx = html.indexOf('"' + key + '"');
    if (idx < 0) return;
    /* 跳到冒号后, 括号匹配提取 JSON 片段 */
    let i = html.indexOf(':', idx) + 1;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== '[' && html[i] !== '{') return;
    const open = html[i];
    const close = open === '[' ? ']' : '}';
    let depth = 0, j = i;
    for (; j < html.length; j++) {
      if (html[j] === '\\') { j++; continue; }
      if (html[j] === open) depth++;
      else if (html[j] === close) { depth--; if (depth === 0) break; }
    }
    const raw = html.slice(i, j + 1);
    try {
      const obj = JSON.parse(raw);
      /* 视频版本 (质量排序取最大) */
      if (key === 'video_versions' && Array.isArray(obj)) {
        const best = obj.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
        if (best && best.url && !seen.has(best.url)) {
          seen.add(best.url);
          media.push({
            type: 'video',
            url: best.url,
            width: best.width || 0,
            height: best.height || 0
          });
        }
      }
      /* 图片候选 */
      if (key === 'image_versions2' && obj && Array.isArray(obj.candidates)) {
        const best = obj.candidates.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
        if (best && best.url && !seen.has(best.url)) {
          seen.add(best.url);
          media.push({
            type: 'image',
            url: cleanImageUrl(best.url),
            width: best.width || 0,
            height: best.height || 0
          });
        }
      }
      /* 轮播: 每项可能是图片或视频 (url 级去重, 防止与全局 video_versions 重复) */
      if (key === 'carousel_media' && Array.isArray(obj)) {
        obj.forEach(function (item) {
          if (!item) return;
          if (item.media_type === 2 && Array.isArray(item.video_versions) && item.video_versions.length) {
            const best = item.video_versions.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
            if (best && best.url && !seen.has(best.url)) {
              seen.add(best.url);
              media.push({ type: 'video', url: best.url, width: best.width || 0, height: best.height || 0 });
            }
          } else if (item.image_versions2 && Array.isArray(item.image_versions2.candidates)) {
            const best = item.image_versions2.candidates.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
            if (best && best.url && !seen.has(best.url)) {
              seen.add(best.url);
              media.push({ type: 'image', url: cleanImageUrl(best.url), width: best.width || 0, height: best.height || 0 });
            }
          }
        });
      }
    } catch (e) { /* 片段解析失败则跳过 */ }
  }

  keys.forEach(collectJsonAfter);
  return media;
}

/* IG CDN 图片: 去除尺寸参数 (width/height/resize) → 原图 */
function cleanImageUrl(url) {
  let u = String(url || '');
  if (u.indexOf('width=') < 0 && u.indexOf('height=') < 0 && u.indexOf('resize') < 0) return u;
  u = u.replace(/&?(?:width|height|resize|_nc_?[a-z]*)[^&]*/gi, '');
  /* 清理参数后残留的 ?& */
  u = u.replace(/\?&/, '?');
  return u;
}

function parseThread(html, meta) {
  /* 优先 og:description (带 Cookie 时含帖子文本) */
  let text = meta.description || meta.title || '';
  text = text.replace(/\s*-\s*Threads\s*$/i, '').trim();
  if (!text) {
    const m = html.match(/"text":"((?:[^"\\]|\\.)*)"/g);
    if (m && m.length) text = decodeEntities(m[0].slice(8, -1));
  }
  /* 时间: 内嵌 JSON 的 taken_at (Unix 秒) */
  let time = '';
  const tm = html.match(/"taken_at":\s*(\d{10,})/);
  if (tm) time = new Date(Number(tm[1]) * 1000).toISOString();
  return {
    text: text.slice(0, 2000),
    time,
    media: extractMedia(html),
    replies: [], /* 回复链需扩展解析 */
    stats: { likes: 0, replies: 0, reposts: 0 }
  };
}

async function main() {
  const { handle, id } = parseUrl(URL);
  const html = await fetchHtml('https://www.threads.net/@' + handle + '/post/' + id);
  const meta = extractMeta(html);
  const thread = parseThread(html, meta);

  const result = {
    url: 'https://www.threads.net/@' + handle + '/post/' + id,
    id,
    author: handle,
    handle: '@' + handle,
    time: thread.time,
    text: thread.text,
    media: thread.media,
    replies: thread.replies,
    stats: thread.stats,
    fetchedAt: new Date().toISOString()
  };

  const out = OUT || (id + '.json');
  writeFileSync(resolve(out), JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log('✓ 已爬取并写入:', out);
  console.log('  作者:', result.author, '· 媒体:', result.media.length, '项 · 文本:', (result.text || '').slice(0, 60) + '…');
  result.media.forEach(function (m) {
    console.log('   -', m.type, (m.width || '?') + 'x' + (m.height || '?'), m.url.slice(0, 80) + '…');
  });
}

main().catch((e) => {
  console.error('✗ 爬取失败:', e.message);
  console.error('  提示: Threads 需登录 Cookie; 无 Cookie 时无法获取内容 (登录墙)');
  process.exit(1);
});
