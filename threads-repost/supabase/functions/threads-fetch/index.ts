// Threads 串文爬取 Edge Function
// 部署: supabase functions deploy threads-fetch --no-verify-jwt
// 调用: supabase.functions.invoke('threads-fetch', { body: { json: 帖子数据 } })  ← 桥渲染提取模式 (推荐)
//      supabase.functions.invoke('threads-fetch', { body: { url, cookie } })     ← 服务端直爬模式 (og 已废弃, 兜底)
// 行为: 写入 storage (threads-reposts/<id>.json) → 返回 publicUrl
import { createClient } from 'jsr:@supabase/supabase-js@2';
Deno.serve(async (req) => {
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
        time: d.time || '',
        text: String(d.text || '').slice(0, 2000),
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

/** 写入 storage (公共桶 threads-reposts, 不存在则自动创建) */
async function saveToStorage(result: any) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
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
  if (upErr) return json({ error: '存储失败: ' + upErr.message }, 500);
  const publicUrl = supabase.storage.from('threads-reposts').getPublicUrl(result.id + '.json').data.publicUrl;
  return json({ ok: true, id: result.id, publicUrl, result });
}

function decode(s: string) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '');
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
