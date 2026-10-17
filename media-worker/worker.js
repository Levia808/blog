const buckets = new Set(['media', 'avatars', 'threads-reposts', 'user-audio']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function identity(request, env) {
  const internal = request.headers.get('X-Blog-Internal-Token');
  if (internal && env.INTERNAL_TOKEN) {
    const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    const [a, b] = await Promise.all([digest(internal), digest(env.INTERNAL_TOKEN)]);
    if (a.reduce((different, n, i) => different | (n ^ b[i]), 0) === 0) return { internal: true };
    fail(401, 'Invalid service token');
  }
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) fail(401, 'Authentication required');
  const headers = { Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY };
  const userResponse = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers });
  if (!userResponse.ok) fail(userResponse.status === 401 || userResponse.status === 403 ? 401 : 503, 'Authentication service unavailable');
  const user = await userResponse.json();
  if (!uuid.test(user.id || '')) fail(401, 'Invalid user');
  const profileResponse = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/get_my_profile', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}'
  });
  if (!profileResponse.ok) fail(503, 'Permission service unavailable');
  const profile = (await profileResponse.json())[0];
  if (!profile || profile.account_status !== 'active') fail(403, 'Active account required');
  return { id: user.id, admin: profile.role === 'superadmin' };
}

function validPath(path) {
  return path && path.length <= 1024 && !/[\x00-\x1f\x7f\\]/.test(path) && path.split('/').every((s) => s && s !== '.' && s !== '..');
}

function authorize(user, bucket, path) {
  if (!validPath(path)) fail(400, 'Invalid object path');
  if (user.internal) return;
  if (bucket === 'avatars' && (path.split('/')[0] === user.id || user.admin)) return;
  if (bucket === 'media' || bucket === 'user-audio') {
    if (user.admin && uuid.test(path.split('/')[0]) && (bucket === 'media' || path.split('/')[0] === user.id)) return;
  }
  fail(403, 'Object access denied');
}

async function readJson(request) {
  if (!request.body) fail(400, 'JSON body required');
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); fail(413, 'JSON body too large'); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const value = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'JSON object required');
    return value;
  } catch (_) { fail(400, 'Invalid JSON body'); }
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true });
  let parts;
  try { parts = url.pathname.split('/').slice(1).map(decodeURIComponent); } catch (_) { fail(400, 'Invalid URL encoding'); }
  if (parts.shift() !== 'object') fail(404, 'Not found');
  const mode = parts[0] === 'public' || parts[0] === 'list' ? parts.shift() : '';
  const bucket = parts.shift();
  if (!buckets.has(bucket)) fail(404, 'Unknown bucket');
  const path = parts.join('/');
  if (mode === 'public' && ['GET', 'HEAD'].includes(request.method)) {
    if (!validPath(path)) fail(400, 'Invalid object path');
    const key = bucket + '/' + path;
    const matchesEtag = (etag) => (request.headers.get('If-None-Match') || '').split(',').some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
    const requested = request.method === 'GET' && request.headers.get('Range');
    let object = request.method === 'HEAD' || requested ? await env.MEDIA.head(key) : await env.MEDIA.get(key);
    if (!object) fail(404, 'Object not found');
    let unsatisfiable = false, partial = false;
    if (requested && !matchesEtag(object.httpEtag)) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(requested.trim());
      let range;
      if (match && (match[1] || match[2]) && (!request.headers.has('If-Range') || request.headers.get('If-Range') === object.httpEtag)) {
        const start = match[1] ? Number(match[1]) : Math.max(0, object.size - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1;
        if (!(match[1] && match[2] && Number(match[2]) < start)) {
          unsatisfiable = start >= object.size || end < start;
          if (!unsatisfiable) range = { offset: start, length: end - start + 1 };
        }
      }
      if (!unsatisfiable) {
        partial = !!range;
        object = await env.MEDIA.get(key, { range, onlyIf: range ? { etagMatches: object.etag } : undefined });
        // An overwrite between HEAD and GET must not mix sizes or serve a stale byte range.
        if (object && !object.body) { object = await env.MEDIA.get(key); partial = false; }
        if (!object) fail(404, 'Object not found');
      }
    }
    const headers = new Headers({ 'ETag': object.httpEtag, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox" });
    object.writeHttpMetadata(headers);
    if (matchesEtag(object.httpEtag)) {
      if (object.body) await object.body.cancel();
      return new Response(null, { status: 304, headers });
    }
    if (unsatisfiable) {
      headers.set('Content-Range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    let status = 200;
    if (partial && object.range) {
      const start = object.range.offset ?? Math.max(0, object.size - object.range.suffix);
      const length = object.range.length ?? object.range.suffix;
      headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
      headers.set('Content-Length', String(length));
      status = 206;
    } else headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
  }
  const user = await identity(request, env);
  if (mode === 'list' && request.method === 'POST') {
    const body = await readJson(request);
    const prefix = String(body.prefix || '').replace(/\/$/, '');
    authorize(user, bucket, prefix);
    const result = await env.MEDIA.list({ prefix: bucket + '/' + prefix + '/', delimiter: '/', limit: Math.min(200, Math.max(1, Number(body.limit) || 100)), cursor: body.cursor || undefined });
    if (result.truncated) fail(409, 'Listing exceeds limit; use the migration manifest for complete inventory');
    return json(result.objects.map((o) => ({ name: o.key.slice((bucket + '/' + prefix + '/').length), metadata: { size: o.size } })));
  }
  if (mode) fail(405, 'Method not allowed');
  if (request.method === 'PUT') {
    authorize(user, bucket, path);
    const type = (request.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
    const limit = bucket === 'avatars' ? 5 * 1024 * 1024 : 100 * 1024 * 1024;
    if (bucket === 'avatars' ? !/^image\//.test(type) :
        !/^((image|video|audio|font)\/|application\/(json|font-woff|vnd.ms-fontobject)$)/.test(type)) fail(415, 'Unsupported media type');
    const size = Number(request.headers.get('Content-Length'));
    if (!Number.isSafeInteger(size) || size <= 0) fail(411, 'Content-Length required');
    if (size > limit) fail(413, 'File too large');
    if (!request.body) fail(400, 'Empty body');
    const stream = new FixedLengthStream(size);
    const controller = new AbortController();
    const [object] = await Promise.all([
      env.MEDIA.put(bucket + '/' + path, stream.readable, {
        httpMetadata: { contentType: type },
        onlyIf: request.headers.get('X-Upsert') === 'true' ? undefined : { etagDoesNotMatch: '*' }
      }).then((result) => {
        if (!result) { controller.abort(); stream.readable.cancel().catch(() => {}); }
        return result;
      }, (error) => { controller.abort(); stream.readable.cancel().catch(() => {}); throw error; }),
      request.body.pipeTo(stream.writable, { signal: controller.signal }).catch((error) => { if (!controller.signal.aborted) throw error; })
    ]);
    if (!object) fail(409, 'Object already exists');
    return json({ path });
  }
  if (request.method === 'DELETE' && !path) {
    const body = await readJson(request);
    if (!Array.isArray(body.prefixes) || !body.prefixes.length || body.prefixes.length > 100) fail(400, 'Invalid object list');
    body.prefixes.forEach((p) => authorize(user, bucket, p));
    await env.MEDIA.delete(body.prefixes.map((p) => bucket + '/' + p));
    return json(body.prefixes.map((name) => ({ name })));
  }
  fail(405, 'Method not allowed');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin denied' }, 403);
    let response;
    try {
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env);
    } catch (error) {
      response = json({ error: error.status ? error.message : 'Media service unavailable' }, error.status || 503);
    }
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin || '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Upsert, Range, If-Range, If-None-Match');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
  }
};
