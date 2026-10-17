import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker.js';

const uid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let role = 'superadmin', status = 'active', authStatus = 200;
globalThis.fetch = async (url) => new Response(JSON.stringify(url.includes('/auth/') ? { id: uid } : [{ role, account_status: status }]), { status: authStatus });
globalThis.FixedLengthStream = class extends TransformStream {
  constructor(length) {
    let bytes = 0;
    super({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > length) throw Error('length'); controller.enqueue(chunk); },
      flush() { if (bytes !== length) throw Error('length'); } });
  }
};
const objects = new Map();
const env = {
  SUPABASE_URL: 'https://supabase.test', SUPABASE_PUBLISHABLE_KEY: 'public',
  ALLOWED_ORIGINS: 'https://blog.test', INTERNAL_TOKEN: 'test-only-service-secret',
  MEDIA: {
    async put(key, stream, options) {
      if (options.onlyIf && objects.has(key)) return null;
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      objects.set(key, { bytes, type: options.httpMetadata.contentType });
      return { key };
    },
    async get(key, options = {}) {
      const value = objects.get(key);
      if (!value) return null;
      const range = options.range || { offset: 0, length: value.bytes.length };
      return { size: value.bytes.length, etag: 'etag', httpEtag: '"etag"', range,
        body: new Response(range ? value.bytes.slice(range.offset, range.offset + range.length) : value.bytes).body,
        writeHttpMetadata(headers) { headers.set('Content-Type', value.type); } };
    },
    async head(key) { return this.get(key); },
    async delete(keys) { keys.forEach((key) => objects.delete(key)); }
  }
};
function request(path, method = 'GET', body, extra = {}) {
  return worker.fetch(new Request('https://media.test' + path, { method, body, headers: {
    Origin: 'https://blog.test', Authorization: 'Bearer test', 'Content-Type': 'image/webp',
    ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}), ...extra
  } }), env);
}

test('server checks identity, active role, ownership and size before storing', async () => {
  const path = '/object/media/' + uid + '/photo.webp';
  assert.equal((await request(path, 'PUT', 'abcdef', { Authorization: '' })).status, 401);
  role = 'user';
  assert.equal((await request(path, 'PUT', 'abcdef')).status, 403);
  assert.equal((await request('/object/avatars/' + other + '/avatar.webp', 'PUT', 'abc')).status, 403);
  role = 'superadmin'; status = 'suspended';
  assert.equal((await request(path, 'PUT', 'abcdef')).status, 403);
  status = 'active'; authStatus = 402;
  assert.equal((await request(path, 'PUT', 'abcdef')).status, 503);
  authStatus = 200;
  assert.equal((await request(path, 'PUT', 'abcdef', { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request(path, 'PUT', 'abcdef', { 'Content-Length': String(100 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await request('/object/media/' + uid + '/a%5Cb.webp', 'PUT', 'abc')).status, 400);
  assert.equal(objects.size, 0);
  assert.equal((await request(path, 'PUT', 'abcdef')).status, 200);
  assert.equal((await request(path, 'PUT', '123456')).status, 409);
  assert.equal((await request(path, 'PUT', '123456', { 'X-Upsert': 'true' })).status, 200);
  assert.equal((await request(path + '-bad', 'PUT', 'abcdef', { 'Content-Length': '2' })).status, 503);
  assert.equal(objects.size, 1);
});

test('public reads support video seeking, conditional requests and missing files', async () => {
  const path = '/object/public/media/' + uid + '/photo.webp';
  const partial = await request(path, 'GET', undefined, { Range: 'bytes=1-3' });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Range'), 'bytes 1-3/6');
  assert.equal(await partial.text(), '234');
  assert.equal((await request(path, 'GET', undefined, { 'If-None-Match': '"etag"' })).status, 304);
  assert.equal((await request(path, 'HEAD')).headers.get('Content-Length'), '6');
  const full = await request(path);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('Content-Range'), null);
  assert.equal(await full.text(), '123456');
  assert.equal((await request(path + '-missing')).status, 404);
  for (const [range, body] of [['bytes=2-', '3456'], ['bytes=-2', '56'], ['bytes=3-999', '456']]) {
    const response = await request(path, 'GET', undefined, { Range: range });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), body);
  }
  const unsatisfiable = await request(path, 'GET', undefined, { Range: 'bytes=999-' });
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers.get('Content-Range'), 'bytes */6');
  assert.equal((await request(path, 'GET', undefined, { Range: 'bytes=-0' })).status, 416);
  assert.equal((await request(path, 'GET', undefined, { Range: 'bytes=4-2' })).status, 200);
  assert.equal((await request(path, 'GET', undefined, { Range: 'bytes=1-2', 'If-Range': '"old"' })).status, 200);
  assert.equal((await request(path, 'GET', undefined, { Range: 'bytes=1-2', 'If-Range': '"etag"' })).status, 206);
  assert.equal((await request(path, 'GET', undefined, { Range: 'bytes=999-', 'If-None-Match': '"old", W/"etag"' })).status, 304);
  const get = env.MEDIA.get;
  try {
    env.MEDIA.get = async function (key, options) {
      if (options?.onlyIf) return { size: 6, httpEtag: '"changed"' };
      return get.call(this, key, options);
    };
    const changed = await request(path, 'GET', undefined, { Range: 'bytes=1-2' });
    assert.equal(changed.status, 200, 'An object changed after HEAD must fall back to a complete read');
    assert.equal(changed.headers.get('Content-Range'), null);
    assert.equal(await changed.text(), '123456');
  } finally { env.MEDIA.get = get; }
});

test('service writes require a valid secret, and batches authorize every object', async () => {
  const path = '/object/threads-reposts/post.json';
  assert.equal((await request(path, 'PUT', '{}', { 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await request(path, 'PUT', '{}', { 'Content-Type': 'application/json', 'X-Blog-Internal-Token': 'wrong' })).status, 401);
  assert.equal((await request(path, 'PUT', '{}', { 'Content-Type': 'application/json', 'X-Blog-Internal-Token': env.INTERNAL_TOKEN })).status, 200);
  role = 'user';
  const body = JSON.stringify({ prefixes: [uid + '/avatar.webp', other + '/avatar.webp'] });
  assert.equal((await request('/object/avatars', 'DELETE', body, { 'Content-Type': 'application/json' })).status, 403);
});
