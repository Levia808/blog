#!/usr/bin/env node
/**
 * Threads 串文爬虫 — 后端直接爬取 → 静态 JSON 资源
 *
 * 用法:
 *   THREADS_COOKIE="sessionid=...; ds_user_id=..." node fetch.mjs <threads_url> [输出路径]
 *   输出: JSON { url, id, author, handle, time, text, replies[], stats, fetchedAt }
 *
 * 说明:
 *   - Threads 无登录环境(embed/页面)均为 JS 渲染 + 登录墙, 必须携带登录 Cookie
 *   - Cookie 获取: 浏览器登录 Threads 后复制 cookie (F12 → Network → 请求头)
 *   - 输出 JSON 即"静态动态资源", 存放于站点可访问路径供前端渲染
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

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '');
}

function parseThread(html, meta) {
  /* 优先 og:description (带 Cookie 时含帖子文本) */
  let text = meta.description || meta.title || '';
  text = text.replace(/\s*-\s*Threads\s*$/i, '').trim();
  /* 兜底: HTML 内嵌 JSON 提取 */
  if (!text) {
    const m = html.match(/"text":"((?:[^"\\]|\\.)*)"/g);
    if (m && m.length) text = decodeEntities(m[0].slice(8, -1));
  }
  return {
    text: text.slice(0, 2000),
    replies: [], /* 回复链需扩展解析 (GraphQL/页面结构) */
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
    time: '',
    text: thread.text,
    replies: thread.replies,
    stats: thread.stats,
    fetchedAt: new Date().toISOString()
  };

  const out = OUT || (id + '.json');
  writeFileSync(resolve(out), JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log('✓ 已爬取并写入:', out);
  console.log('  作者:', result.author, '· 文本:', (result.text || '').slice(0, 60) + '…');
}

main().catch((e) => {
  console.error('✗ 爬取失败:', e.message);
  console.error('  提示: Threads 需登录 Cookie; 无 Cookie 时无法获取内容 (登录墙)');
  process.exit(1);
});
