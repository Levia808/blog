const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
let fallback = 0, sent = 0, responseStatus = 200, session = { access_token: 'synthetic-user-token' };
class XHR {
  upload = {};
  headers = {};
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  send(body) {
    sent++;
    assert.equal(this.headers.Authorization, 'Bearer synthetic-user-token');
    if (this.upload.onprogress) this.upload.onprogress({ loaded: 2, total: 2 });
    this.status = responseStatus;
    this.responseText = responseStatus === 200 ? '{"path":"ok"}' : '{"error":"quota unavailable"}';
    queueMicrotask(() => this.onload());
  }
}
const window = { blogSupabase: { storage: { from() { fallback++; return { legacy: true }; } } }, Auth: { session: async () => session } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/js/media-storage.js'), 'utf8'), { window, URL, XMLHttpRequest: XHR });
(async () => {
  assert.equal(window.BlogStorage.from('media').legacy, true);
  for (const origin of ['http://media.test', 'https://user:secret@media.test', 'https://media.test/path', 'https://media.test?x=1']) {
    window.BLOG_MEDIA_ORIGIN = origin;
    assert.throws(() => window.BlogStorage.from('media'), /HTTPS/);
  }
  window.BLOG_MEDIA_ORIGIN = 'https://media.test/';
  const storage = window.BlogStorage.from('media');
  assert.equal(storage.getPublicUrl('user/a b.webp').data.publicUrl, 'https://media.test/object/public/media/user/a%20b.webp');
  let progress = 0;
  assert.equal((await storage.upload('user/photo.webp', new Blob(['ok'], { type: 'image/webp' }), { onUploadProgress: () => progress++ })).error, null);
  assert.equal(progress, 1);
  responseStatus = 503;
  assert.equal((await storage.remove(['user/photo.webp'])).error.status, 503);
  assert.equal(fallback, 1, 'R2 errors never silently write back to Supabase');
  session = null;
  const before = sent;
  assert.ok((await storage.upload('user/photo.webp', new Blob(['ok']))).error);
  assert.equal(sent, before, 'No request is sent after the local session disappears');
  window.BLOG_MEDIA_BACKEND = 'github-pages';
  window.BLOG_MEDIA_ORIGIN = '';
  window.GitHubMedia = { from: (bucket) => ({ provider: 'github-pages', bucket }) };
  assert.equal(window.BlogStorage.from('media').provider, 'github-pages');
  assert.equal(window.BlogStorage.from('avatars').provider, 'github-pages');
  assert.equal(window.BlogStorage.from('threads-reposts').legacy, true, 'existing Threads data stays on its original backend');
  console.log('media storage: opt-in routing, URL encoding, progress and failure isolation passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
