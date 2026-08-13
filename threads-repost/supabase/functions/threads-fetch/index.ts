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
  const mediaChanged = await processMediaImages(supabase, result);
  if (mediaChanged) await putJson();

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

/* 逐张图片: 下载原图 → 存桶(public) → 生成预览 URL; 单张失败不影响其余 */
async function processMediaImages(supabase: any, result: any): Promise<boolean> {
  const media = Array.isArray(result.media) ? result.media : [];
  if (!media.length) return false;
  let changed = false;
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
      const { error: oErr } = await supabase.storage
        .from('threads-reposts')
        .upload(origName, new Blob([buf], { type: ct }), { upsert: true, contentType: ct });
      if (oErr) continue;
      const pub = supabase.storage.from('threads-reposts').getPublicUrl(origName).data.publicUrl;
      m.url = pub;
      m.preview = renderPreviewUrl(pub);
      changed = true;
    } catch (e) { /* 单图失败不影响其余 */ }
  }
  return changed;
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
