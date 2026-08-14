// Threads 串文爬取 Edge Function
// 部署: supabase functions deploy threads-fetch --no-verify-jwt
// 调用: supabase.functions.invoke('threads-fetch', { body: { json: 帖子数据 } })  ← 桥渲染提取模式 (推荐)
//      supabase.functions.invoke('threads-fetch', { body: { url, cookie } })     ← 服务端直爬模式 (og 已废弃, 兜底)
// 行为: 写入 storage (threads-reposts/<id>.json) → 返回 publicUrl
//      图片: 服务端代拉原图转存 (解决 fbcdn 签名 URL 过期) + 用 Storage 图像转换生成低分辨率预览 URL
//      卡片显示预览图 (render/image 按需缩放, CDN 缓存), 放大查看用原图 (media[].url=原图, media[].preview=预览)
import { createClient } from 'jsr:@supabase/supabase-js@2';
Deno.serve(async (req) => {
  // CORS 预检: 浏览器跨域调用必须 (否则 FunctionsFetchError)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  const body = await req.json().catch(() => ({}));

  // 模式一: 桥已用真实浏览器渲染提取好的帖子 JSON → 直接入库
  if (body.json && typeof body.json === 'object') {
    try {
      const d = body.json;
      if (!d.url || !d.id) return json({ error: '缺少帖子数据 (url/id)' }, 400);
      const result = {
        url: d.url,
        id: d.id,
        author: d.author || d.handle || '',
        handle: d.handle || '',
        display_name: d.display_name || '',
        avatar: String(d.avatar || ''),
        time: d.time || '',
        text: String(d.text || '').slice(0, 2000),
        media: Array.isArray(d.media) ? d.media.map((m: any) => {
          /* 图片: 去除 CDN 尺寸参数 → 原图 (与 fetch.mjs 一致) */
          let url = String(m.url || '');
          if (m.type !== 'video' && /[?&](?:width|height|resize)=/.test(url)) {
            url = url.replace(/&?(?:width|height|resize|_nc_?[a-z]*)[^&]*/gi, '').replace(/\?&/, '?');
          }
          return {
            type: m.type === 'video' ? 'video' : 'image',
            url,
            width: Number(m.width) || 0,
            height: Number(m.height) || 0
          };
        }).slice(0, 10) : [],
        replies: Array.isArray(d.replies) ? d.replies : [],
        stats: {
          likes: (d.stats && d.stats.likes) || 0,
          replies: (d.stats && d.stats.replies) || 0,
          reposts: (d.stats && d.stats.reposts) || 0
        },
        fetchedAt: d.fetchedAt || new Date().toISOString()
      };
      return await saveToStorage(result);
    } catch (e) {
      return json({ error: 'json 模式异常: ' + String((e && e.message) || e) }, 500);
    }
  }

  // 模式二: 服务端直爬 (旧方案, og 元数据解析 — Threads 已改为客户端渲染, 基本不可用)
  const { url, cookie } = body;

  const m = String(url).match(/threads\.(net|com)\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/i);
  if (!m) return json({ error: '无效的 Threads 链接' }, 400);
  const [, , handle, id] = m;

  if (!cookie) return json({ error: '缺少 Threads Cookie（后台设置中配置）' }, 400);

  try {
    // threads.net 已迁移至 threads.com; 直连 threads.com (带无效 sessionid 时 threads.net 会 500 且不跳转)
    const fetchUrl = 'https://www.threads.com/@' + handle + '/post/' + id;
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookie,
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      redirect: 'follow'
    });
    if (res.status === 500) return json({ error: 'Threads 返回 500：Cookie 无效或已过期，请重新浏览器登录' }, 502);
    if (!res.ok) return json({ error: 'Threads 请求失败: HTTP ' + res.status }, 502);
    const html = await res.text();

    const pick = (prop: string) => {
      const a = html.match(new RegExp('<meta[^>]+property="' + prop + '"[^>]+content="([^"]*)"', 'i'));
      const b = html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+property="' + prop + '"', 'i'));
      return decode((a || b || [])[1] || '');
    };
    const text = (pick('og:description') || pick('og:title') || '')
      .replace(/\s*-\s*Threads\s*$/i, '').trim();

    if (!text) return json({ error: '未能提取串文内容（Cookie 可能失效，请重新获取）' }, 422);

    const result = {
      url: 'https://www.threads.com/@' + handle + '/post/' + id,
      id,
      author: handle,
      handle: '@' + handle,
      display_name: '',
      time: '',
      text: text.slice(0, 2000),
      replies: [], // 回复链解析为扩展点 (需 GraphQL/页面结构)
      stats: { likes: 0, replies: 0, reposts: 0 },
      fetchedAt: new Date().toISOString()
    };
    return saveToStorage(result);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
});

/** 写入 storage (公共桶 threads-reposts, 不存在则自动创建); 头像 fbcdn URL 浏览器端被 CORP 拦截 → 服务端代拉转存 */
async function saveToStorage(result: any) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  async function putJson() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    let { error: upErr } = await supabase.storage
      .from('threads-reposts')
      .upload(result.id + '.json', blob, { upsert: true, contentType: 'application/json' });
    if (upErr && /not found|不存在|bucket/i.test(upErr.message)) {
      // 桶缺失或未公开 → 自动创建/设为公开后重试 (service role 权限足够)
      await supabase.storage.createBucket('threads-reposts', { public: true, upsert: true })
        .catch(() => {});
      await supabase.storage.updateBucket('threads-reposts', { public: true })
        .catch(() => {});
      ({ error: upErr } = await supabase.storage
        .from('threads-reposts')
        .upload(result.id + '.json', blob, { upsert: true, contentType: 'application/json' }));
    }
    return upErr;
  }

  const upErr = await putJson();
  if (upErr) return json({ error: '存储失败: ' + upErr.message }, 500);

  // 头像转存: fbcdn 头像带 CORP: same-origin, 浏览器跨站加载被拦 → 服务端代拉后存桶 (公开可读)
  if (result.avatar && /fbcdn/.test(result.avatar)) {
    try {
      const avRes = await fetch(result.avatar, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36' }
      });
      if (avRes.ok) {
        const avBuf = await avRes.arrayBuffer();
        const avName = result.id + '-avatar.jpg';
        const avBlob = new Blob([avBuf], { type: avRes.headers.get('content-type') || 'image/jpeg' });
        const { error: avErr } = await supabase.storage
          .from('threads-reposts')
          .upload(avName, avBlob, { upsert: true, contentType: 'image/jpeg' });
        if (!avErr) {
          result.avatar = supabase.storage.from('threads-reposts').getPublicUrl(avName).data.publicUrl;
          await putJson();
        }
      }
    } catch (e) { /* 头像代拉失败则保留原 URL */ }
  }

  // 图片转存 + 预览 URL: 下载原图持久化 (解决 fbcdn 签名 URL 过期), 预览用 Storage 图像转换按需生成
  const imgRes = await processMediaImages(supabase, result);
  // 视频落地: CDN 签名链接时效短 → 下载转存 storage 永久 URL (自动播放/放大均走自有链接)
  const vidRes = await processMediaVideos(supabase, result);
  if (imgRes.changed || vidRes.changed) await putJson();
  /* 重新爬取覆盖: 清理该帖下已不存在的旧媒体文件 (序号/数量/类型漂移的孤儿) */
  const kept = (imgRes.paths || []).concat(vidRes.paths || []);
  await cleanupStaleMedia(supabase, result, kept);

  const publicUrl = supabase.storage.from('threads-reposts').getPublicUrl(result.id + '.json').data.publicUrl;
  return json({ ok: true, id: result.id, publicUrl, result });
}

/* Threads/fbcdn 原图 URL: 移除 width/height/resize/_nc_* 尺寸参数 (与前端 originalImageUrl 同规则) */
function originalImageUrl(url: string): string {
  const u = String(url || '');
  if (u.indexOf('width=') < 0 && u.indexOf('height=') < 0) return u;
  return u.replace(/&?(?:width|height|_nc_?[a-z]*|resize)[^&]*/gi, '');
}

function ctToExt(ct: string): string {
  const c = String(ct || '').toLowerCase();
  if (c.includes('webp')) return '.webp';
  if (c.includes('png')) return '.png';
  if (c.includes('gif')) return '.gif';
  return '.jpg';
}

/* 预览 URL: Storage 图像转换 (object/public → render/image/public + 缩放参数), 按需生成并 CDN 缓存 */
function renderPreviewUrl(originalPublicUrl: string, width = 640): string {
  return String(originalPublicUrl).replace('/object/public/', '/render/image/public/')
    + '?width=' + width + '&quality=80&resize=contain';
}

/* 从图片字节解析尺寸 (JPEG SOF / PNG IHDR / WebP VP8X/VP8L/VP8) — 转存后回填真实分辨率 */
function imageSizeFromBytes(buf: ArrayBuffer): { w: number; h: number } {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (u8.length < 24) return { w: 0, h: 0 };
  /* PNG */
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    return { w: dv.getUint32(16, false), h: dv.getUint32(20, false) };
  }
  /* WebP: RIFF....WEBP */
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57) {
    const fourcc = String.fromCharCode(u8[12], u8[13], u8[14], u8[15]);
    if (fourcc === 'VP8X' && u8.length >= 30) {
      const w = 1 + ((u8[24] | (u8[25] << 8) | (u8[26] << 16)));
      const h = 1 + ((u8[27] | (u8[28] << 8) | (u8[29] << 16)));
      return { w, h };
    }
    if (fourcc === 'VP8L' && u8.length >= 25) {
      const b = (u8[21] | (u8[22] << 8) | (u8[23] << 16) | (u8[24] << 24)) >>> 0;
      return { w: (b & 0x3FFF) + 1, h: ((b >> 14) & 0x3FFF) + 1 };
    }
    if (fourcc === 'VP8 ') {
      return { w: dv.getUint16(26, true) & 0x3FFF, h: dv.getUint16(28, true) & 0x3FFF };
    }
  }
  /* JPEG */
  if (u8[0] === 0xFF && u8[1] === 0xD8) {
    let j = 2;
    while (j + 9 < u8.length) {
      if (u8[j] !== 0xFF) { j++; continue; }
      const m = u8[j + 1];
      if (m === 0xD8 || m === 0xFF || (m >= 0xD0 && m <= 0xD9)) { j += 2; continue; }
      const segLen = dv.getUint16(j + 2, false);
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { w: dv.getUint16(j + 7, false), h: dv.getUint16(j + 5, false) };
      }
      j += 2 + segLen;
    }
  }
  return { w: 0, h: 0 };
}

/* 逐张图片: 下载原图 → 存桶(public, upsert 覆盖) → 生成预览 URL; 单张失败不影响其余
   返回 { changed, paths }: paths = 本次有效媒体文件路径 (供孤儿清理) */
async function processMediaImages(supabase: any, result: any): Promise<{ changed: boolean; paths: string[] }> {
  const media = Array.isArray(result.media) ? result.media : [];
  const paths: string[] = [];
  if (!media.length) return { changed: false, paths };
  let changed = false;
  const ts = Date.now();
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (!m || m.type === 'video' || !m.url) continue;
    try {
      const origUrl = originalImageUrl(m.url);
      const res = await fetch(origUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36' }
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength === 0) continue;
      const ct = res.headers.get('content-type') || 'image/jpeg';
      const base = 'media/' + result.id + '/' + i;
      const origName = base + ctToExt(ct);
      paths.push(origName);
      const { error: oErr } = await supabase.storage
        .from('threads-reposts')
        .upload(origName, new Blob([buf], { type: ct }), { upsert: true, contentType: ct });
      if (oErr) continue;
      const pub = supabase.storage.from('threads-reposts').getPublicUrl(origName).data.publicUrl;
      /* 回填真实分辨率 (桥未传/传错时前端比例失效) */
      const size = imageSizeFromBytes(buf);
      if (size.w && size.h) { m.width = size.w; m.height = size.h; }
      /* 覆盖后缓存破坏: 原图 + ?v, 预览 + &t (CDN/浏览器按 URL 缓存); 预览 1080 高清 */
      m.url = pub + '?v=' + ts;
      m.preview = renderPreviewUrl(pub, 1080) + '&t=' + ts;
      changed = true;
    } catch (e) { /* 单图失败不影响其余 */ }
  }
  return { changed, paths };
}

/* 视频落地: Threads CDN 签名链接时效短 (~1-2h) → 下载转存 storage 永久 URL (upsert 覆盖 + ?v 缓存破坏)
   失败降级保留原 CDN 链接; 单视频失败不影响其余; 返回 { changed, paths } 供孤儿清理 */
async function processMediaVideos(supabase: any, result: any): Promise<{ changed: boolean; paths: string[] }> {
  const media = Array.isArray(result.media) ? result.media : [];
  const paths: string[] = [];
  if (!media.length) return { changed: false, paths };
  let changed = false;
  const ts = Date.now();
  const MAX = 40 * 1024 * 1024; /* storage 默认单文件 50MB, 保守限 40MB */
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (!m || m.type !== 'video' || !m.url) continue;
    if (/supabase\.co\/storage/.test(m.url)) { paths.push('media/' + result.id + '/' + i + '.mp4'); continue; } /* 已转存 */
    try {
      const res = await fetch(m.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength === 0) throw new Error('empty body');
      if (buf.byteLength > MAX) throw new Error('size ' + buf.byteLength + ' > 40MB');
      const ct = res.headers.get('content-type') || 'video/mp4';
      const name = 'media/' + result.id + '/' + i + '.mp4';
      paths.push(name);
      const { error: vErr } = await supabase.storage
        .from('threads-reposts')
        .upload(name, new Blob([buf], { type: ct }), { upsert: true, contentType: ct });
      if (vErr) throw vErr;
      const pub = supabase.storage.from('threads-reposts').getPublicUrl(name).data.publicUrl;
      m.url = pub + '?v=' + ts;
      m.local = true;
      changed = true;
      console.log('threads-fetch: video saved', name, buf.byteLength, 'bytes');
    } catch (e) {
      console.error('threads-fetch: video download failed', String((e && e.message) || e));
    }
  }
  return { changed, paths };
}

/* 重新爬取覆盖: 删除该帖下不在新媒体清单中的旧文件 (孤儿清理) */
async function cleanupStaleMedia(supabase: any, result: any, keptPaths: string[]): Promise<void> {
  const prefix = 'media/' + result.id + '/';
  const { data, error } = await supabase.storage
    .from('threads-reposts')
    .list(prefix, { limit: 200 });
  if (error || !data || !data.length) return;
  const stale = data
    .map((f: any) => prefix + f.name)
    .filter((p: string) => keptPaths.indexOf(p) < 0);
  if (!stale.length) return;
  const { error: rmErr } = await supabase.storage.from('threads-reposts').remove(stale);
  if (!rmErr) console.log('threads-fetch: cleaned stale media', stale.join(', '));
}

function decode(s: string) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '');
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
