// 超管: 修改用户头像/昵称 (service role 上传 avatars 桶 + 更新 profiles)
// 部署: supabase functions deploy admin-update-profile --no-verify-jwt
// 调用: supabase.functions.invoke('admin-update-profile', { body: { user_id, display_name?, avatar_base64? } })
// 权限: 仅 superadmin (JWT → get_my_profile RPC)
// 行为: avatar_base64 (webp ≤1MB) → 上传 avatars/{user_id}/avatar.webp (upsert) → profiles.avatar_url 带 ?v= 缓存破坏
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Max-Age': '86400'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    /* 1. 校验调用者超管 (与 admin-create-user 同路径) */
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: '未登录' }, 401);

    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !user) return json({ error: '登录态无效' }, 401);
    const { data: rpcRows } = await caller.rpc('get_my_profile');
    const profile = rpcRows && rpcRows[0] ? rpcRows[0] : null;
    if (!profile || profile.role !== 'superadmin' || profile.account_status !== 'active') {
      return json({ error: '需要超级管理员权限' }, 403);
    }

    /* 2. 参数 */
    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id || '');
    if (!targetId) return json({ error: '缺少用户 ID' }, 400);
    const displayName = body.display_name !== undefined
      ? String(body.display_name).trim().slice(0, 40)
      : undefined;
    const avatarBase64 = typeof body.avatar_base64 === 'string' ? body.avatar_base64 : '';
    const avatarUrl = typeof body.avatar_url === 'string' ? String(body.avatar_url).trim().slice(0, 500) : '';

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    /* 3. 目标用户存在性 */
    const { data: target } = await admin.from('profiles').select('id').eq('id', targetId).maybeSingle();
    if (!target) return json({ error: '用户不存在' }, 404);

    const update: Record<string, unknown> = {};
    if (displayName !== undefined) update.display_name = displayName || null;

    /* 4. 头像: base64 (webp) → 上传 avatars 桶 */
    if (avatarBase64) {
      const m = avatarBase64.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      const b64 = m ? m[1] : avatarBase64;
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch (e) {
        return json({ error: '头像数据无效' }, 400);
      }
      if (!bytes.length || bytes.length > 1024 * 1024) {
        return json({ error: '头像需为 1MB 以内的图片' }, 400);
      }
      const path = targetId + '/avatar.webp';
      const { error: upErr } = await admin.storage.from('avatars').upload(path, bytes, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '3600'
      });
      if (upErr) {
        console.error('admin-update-profile: avatar upload failed', upErr.message);
        return json({ error: '头像上传失败: ' + upErr.message }, 500);
      }
      const { data: pub } = admin.storage.from('avatars').getPublicUrl(path);
      update.avatar_url = pub.publicUrl + '?v=' + Date.now();
    } else if (avatarUrl) {
      update.avatar_url = avatarUrl;
    }

    if (Object.keys(update).length === 0) {
      return json({ error: '没有可更新的字段' }, 400);
    }

    const { data: updated, error: updErr } = await admin
      .from('profiles')
      .update(update)
      .eq('id', targetId)
      .select('id, username, display_name, avatar_url, role, account_status')
      .maybeSingle();
    if (updErr) return json({ error: '更新失败: ' + updErr.message }, 500);

    return json({ profile: updated, message: '已更新' });
  } catch (e) {
    return json({ error: '服务异常: ' + String((e && e.message) || e) }, 500);
  }
});
