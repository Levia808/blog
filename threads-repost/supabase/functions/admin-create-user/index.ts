// 超级管理员: 新增账号 (Auth Admin API + profiles role)
// 部署: supabase functions deploy admin-create-user --no-verify-jwt
// 调用: supabase.functions.invoke('admin-create-user', { body: { email, password, display_name, username, role } })
// 权限: 仅 superadmin (JWT 校验 → profiles.role)
// 行为: auth.admin.createUser (email_confirm: true 免验证) → 触发器自动建 profiles → 按需设置 role
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

const VALID_ROLES = ['user', 'author', 'admin', 'superadmin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    /* 1. 校验调用者: JWT → superadmin 且 active */
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: '未登录' }, 401);

    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !user) return json({ error: '登录态无效' }, 401);

    const { data: profile } = await caller
      .from('profiles')
      .select('role, account_status')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'superadmin' || profile.account_status !== 'active') {
      return json({ error: '需要超级管理员权限' }, 403);
    }

    /* 2. 参数校验 */
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim().slice(0, 40);
    const username = String(body.username || '').trim().slice(0, 30);
    const role = String(body.role || 'user').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式无效' }, 400);
    if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: '角色无效' }, 400);

    /* 3. service role 创建用户 (email_confirm: true → 免邮箱验证) */
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName || username || email.split('@')[0],
        user_name: username || null
      }
    });
    if (createErr) return json({ error: createErr.message }, 400);
    if (!created.user) return json({ error: '创建失败' }, 500);

    /* 4. 设置角色 (触发器已建 profiles, role 默认 user) */
    if (role !== 'user') {
      const { error: roleErr } = await admin
        .from('profiles')
        .update({ role })
        .eq('id', created.user.id);
      if (roleErr) return json({ error: '用户已创建但角色设置失败: ' + roleErr.message }, 500);
    }

    return json({
      id: created.user.id,
      email: created.user.email,
      role,
      message: '账号创建成功'
    });
  } catch (e) {
    return json({ error: '服务异常: ' + String((e && e.message) || e) }, 500);
  }
});
