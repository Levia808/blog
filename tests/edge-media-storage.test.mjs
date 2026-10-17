import assert from 'node:assert/strict';
import { mediaStorage } from '../threads-repost/supabase/functions/_shared/media-storage.ts';

const config = {};
globalThis.Deno = { env: { get: (key) => config[key] } };
const fallback = {};
assert.equal(mediaStorage(fallback), fallback);
config.BLOG_MEDIA_TOKEN = 'synthetic-secret';
for (const origin of ['http://media.test', 'https://user:secret@media.test', 'https://media.test/path', 'https://media.test?x=1']) {
  config.BLOG_MEDIA_ORIGIN = origin;
  assert.throws(() => mediaStorage(fallback));
}
config.BLOG_MEDIA_ORIGIN = 'https://media.test/';
const storage = mediaStorage(fallback).from('threads-reposts');
assert.equal(storage.getPublicUrl('a b.json').data.publicUrl, 'https://media.test/object/public/threads-reposts/a%20b.json');
let fail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://media.test/object/threads-reposts/a%20b.json');
  assert.equal(options.redirect, 'error', 'Service tokens must never follow a redirect');
  assert.equal(options.headers['X-Blog-Internal-Token'], 'synthetic-secret');
  if (fail) throw new Error('synthetic unavailable');
  return Response.json({ path: 'a b.json' });
};
assert.equal((await storage.upload('a b.json', '{}', { contentType: 'application/json' })).error, null);
fail = true;
assert.ok((await storage.upload('a b.json', '{}', { contentType: 'application/json' })).error);
console.log('Edge storage: opt-in routing, validated origin, URL encoding and redirect protection passed');
