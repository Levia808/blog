// Threads 自动登录 Edge Function — 登录获取 sessionid cookie, 供爬取使用
// 部署: supabase functions deploy threads-login --no-verify-jwt
// 调用: supabase.functions.invoke('threads-login', { body: { username, password } })
// 返回: { ok, cookie } → cookie = "sessionid=...; ds_user_id=..." 后台自动保存后即可爬取
//
// 原理: Threads 与 Instagram 共用账号体系, 浏览器端登录 Threads 走的也是 IG 登录接口,
//       IG session 可直接用于 threads.net/threads.com 爬取 (所有主流 threads 爬虫均如此)。
// 流程: ① GET instagram.com/accounts/login/ 取 csrftoken
//       ② POST /api/v1/web/accounts/login/ajax/ (密码加密: 明文格式 → 失败自动降级 AES-GCM+NaCL sealedbox 加密格式)
//       ③ 从 Set-Cookie 提取 sessionid / ds_user_id
// 注: 若账号触发验证码/双因素/检查点, 返回明确错误, 提示在浏览器登录后手动粘贴 Cookie。

import nacl from 'npm:tweetnacl@1.0.3';
import blake from 'npm:blakejs@1.2.1';

const APP_ID = '936619743392459'; // IG Web App ID (Threads 共用)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const LOGIN_URL = 'https://www.instagram.com/api/v1/web/accounts/login/ajax/';
const CONFIG_URL = 'https://www.instagram.com/accounts/login/';

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
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return json({ error: '缺少用户名或密码' }, 400);

  try {
    // 1. 获取 csrftoken (登录页 cookie)
    const pageRes = await fetch(CONFIG_URL, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow'
    });
    const csrf = extractCookie(getSetCookies(pageRes), 'csrftoken');
    if (!csrf) return json({ error: '无法获取 CSRF Token (instagram.com 暂时无法访问)' }, 502);

    // 2. 尝试登录 (优先明文格式, 兼容性最好; 被拒则降级为加密格式)
    let result = await attemptLogin(username, password, csrf, plainEncPassword);
    if (result.retryable) {
      result = await attemptLogin(username, password, csrf, encryptedEncPassword);
    }
    if (result.retryable) return json({ error: '登录接口拒绝了密码加密格式 (IG 可能已更新加密协议)' }, 502);

    // 3. 提取登录态
    const sessionid = extractCookie(result.setCookies, 'sessionid');
    const dsUserId = extractCookie(result.setCookies, 'ds_user_id');
    if (!sessionid) return json({ error: friendlyError(result.body) }, 401);

    const data = result.body || {};
    return json({
      ok: true,
      cookie: 'sessionid=' + sessionid + '; ds_user_id=' + (dsUserId || ''),
      userId: data.userId || '',
      user: data.user ? true : false,
      status: data.status || 'ok'
    });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});

interface LoginResult {
  retryable: boolean;
  status: number;
  setCookies: string[];
  body: any;
}

async function attemptLogin(
  username: string, password: string, csrf: string,
  makeEnc: (password: string) => Promise<string>
): Promise<LoginResult> {
  const encPassword = await makeEnc(password);
  const form = new URLSearchParams({
    username,
    enc_password: encPassword,
    queryParams: '{}',
    optIntoOneTap: 'false',
    stopDeletionNonce: '',
    trustedDeviceRecords: '{}',
    phone_id: '',
    _csrftoken: csrf
  }).toString();

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrf,
      'X-IG-App-ID': APP_ID,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': CONFIG_URL,
      'Origin': 'https://www.instagram.com',
      'Cookie': 'csrftoken=' + csrf
    },
    body: form
  });
  const setCookies = getSetCookies(res);
  const bodyText = await res.text();
  let body: any = {};
  try { body = JSON.parse(bodyText); } catch { /* HTML 错误页 */ }

  // 400/500 且无 JSON 状态 → 格式可能被拒, 尝试降级
  const retryable = (res.status === 400 || res.status === 500) && !body.status;
  return { retryable, status: res.status, setCookies, body };
}

/** 明文格式: #PWD_INSTAGRAM_BROWSER:0:<ts>:<password> (instaloader 等主流工具当前使用) */
function plainEncPassword(password: string): Promise<string> {
  return Promise.resolve('#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now() / 1000) + ':' + password);
}

/** 加密格式: #PWD_INSTAGRAM_BROWSER:<version>:<ts>:<b64> — AES-256-GCM + NaCL sealed box (IG Web 官方方案) */
async function encryptedEncPassword(password: string): Promise<string> {
  const config = await fetchPasswordConfig();
  const ts = Math.floor(Date.now() / 1000);
  const tsBytes = new TextEncoder().encode(String(ts));

  // AES-256-GCM: iv = 12 零字节, additionalData = 时间戳, 加密密码本体
  const key = crypto.getRandomValues(new Uint8Array(32));
  const rawKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: tsBytes, tagLength: 128 },
    rawKey,
    new TextEncoder().encode(password)
  );
  const ct = new Uint8Array(ctBuf);

  // NaCL sealed box: 临时密钥对, nonce = blake2b(epk || recipientPk, 24 字节)
  const sealedKey = naclSeal(key, config.publicKey);

  // 载荷布局 (逆向自 IG Web bundle): [1][keyId][len_lo][len_hi][sealedKey][tag16][ciphertext]
  const payload = new Uint8Array(2 + 2 + sealedKey.length + 16 + ct.length);
  let c = 0;
  payload[c++] = 1;
  payload[c++] = config.keyId & 0xff;
  payload[c++] = sealedKey.length & 0xff;
  payload[c++] = (sealedKey.length >> 8) & 0xff;
  payload.set(sealedKey, c); c += sealedKey.length;
  payload.set(ct.slice(-16), c); c += 16; // GCM tag
  payload.set(ct.slice(0, -16), c);

  return '#PWD_INSTAGRAM_BROWSER:' + config.version + ':' + ts + ':' + btoa(bytesToString(payload));
}

async function fetchPasswordConfig(): Promise<{ keyId: number; publicKey: Uint8Array; version: number }> {
  const res = await fetch(CONFIG_URL, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  const html = await res.text();
  const m = html.match(/InstagramPasswordEncryption",\[\],\{"key_id":"(\d+)","public_key":"([0-9a-f]+)","version":"(\d+)"\}/);
  if (!m) throw new Error('未能从登录页提取加密配置');
  return {
    keyId: Number(m[1]),
    publicKey: hexToBytes(m[2]),
    version: Number(m[3])
  };
}

/** tweetnacl sealed box 方案 (与 IG Web bundle 一致, 非 libsodium 新版): nonce = blake2b(epk || pk) */
function naclSeal(message: Uint8Array, recipientPk: Uint8Array): Uint8Array {
  const kp = nacl.box.keyPair();
  const nonce = blake.blake2b(kp.publicKey, recipientPk, 24);
  const boxed = nacl.box(message, nonce, recipientPk, kp.secretKey);
  const out = new Uint8Array(32 + boxed.length);
  out.set(kp.publicKey);
  out.set(boxed, 32);
  return out;
}

/** 将服务器错误响应转成人话 */
function friendlyError(body: any): string {
  const msg = body && (body.message || body.error_type || body.error);
  const text = String(msg || '登录失败: 未返回 sessionid').slice(0, 200);
  if (/two_factor|2fa/i.test(text)) return '需要双因素验证码: 请在浏览器登录后手动粘贴 Cookie (平台管理 → Cookie)';
  if (/checkpoint|suspicious/i.test(text)) return '账号触发安全检查 (Checkpoint): 请用浏览器登录后手动粘贴 Cookie';
  if (/incorrect|wrong|password/i.test(text)) return '用户名或密码错误';
  if (/rate|too many|throttl/i.test(text)) return '登录尝试过于频繁, 请稍后再试';
  return '登录失败: ' + text;
}

function getSetCookies(res: Response): string[] {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function extractCookie(setCookies: string[], name: string): string {
  for (const c of setCookies) {
    const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    if (m) return m[1];
  }
  return '';
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToString(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
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
