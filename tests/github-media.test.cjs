const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHash, webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../static/js/github-media.js'), 'utf8');
let credential = 'synthetic-owner', canPush = true, head = 'head-0', refWrites = 0, race = false;
let tree = [], publishedStatus = 404, publishedType = 'text/html';
const requests = [], trees = new Map(), commits = new Map(), blobs = new Map(), listeners = {};
class XHR {
  upload = {}; headers = {};
  open(method, url) { this.method = method; this.path = new URL(url).pathname + new URL(url).search; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(raw) {
    const body = raw && JSON.parse(raw);
    requests.push({ method: this.method, path: this.path, body });
    assert.equal(this.headers.Authorization, 'Bearer ' + credential);
    let value = {}, status = 200;
    const route = this.path.replace('/repos/Levia808/blog', '');
    if (this.path === '/user') value = { id: credential === 'synthetic-owner' ? 1 : 2, login: 'synthetic-collaborator' };
    else if (!route) value = { permissions: { push: canPush } };
    else if (route === '/git/blobs') {
      const data = Buffer.from(body.content, 'base64');
      const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      blobs.set(sha, data); value = { sha };
      this.upload.onprogress?.({ loaded: raw.length, total: raw.length });
    } else if (route === '/git/ref/heads/main') value = { object: { sha: head } };
    else if (route.startsWith('/git/commits/') && this.method === 'GET') value = { tree: { sha: head } };
    else if (route.startsWith('/git/trees/') && this.method === 'GET') value = { tree, truncated: false };
    else if (route === '/git/trees') { const sha = 'tree-' + trees.size; trees.set(sha, body.tree); value = { sha }; }
    else if (route === '/git/commits') { const sha = 'commit-' + commits.size; commits.set(sha, body); value = { sha }; }
    else if (route === '/git/refs/heads/main') {
      assert.equal(body.force, false, 'publishing never force pushes');
      if (race) { race = false; status = 422; tree.push({ path: 'content/concurrent.md', sha: 'unrelated' }); head = 'concurrent-head'; }
      else {
        const commit = commits.get(body.sha);
        assert.deepEqual(commit.parents, [head], 'concurrent changes must be retained');
        for (const change of trees.get(commit.tree)) {
          tree = tree.filter((entry) => entry.path !== change.path);
          if (change.sha) tree.push({ ...change, size: blobs.get(change.sha).length });
        }
        head = body.sha; refWrites++; value = { object: { sha: head } };
      }
    } else throw new Error('Unexpected synthetic route: ' + route);
    this.status = status; this.responseText = JSON.stringify(value); queueMicrotask(() => this.onload());
  }
}
const popup = { closed: false, postMessage() {}, close() { this.closed = true; } };
const window = {
  localStorage: { getItem: () => credential, setItem: (_key, value) => { credential = value; } },
  BLOG_PAGES_MEDIA_ORIGIN: 'https://pages.test', crypto: webcrypto,
  addEventListener(name, callback) { listeners[name] = callback; }, dispatchEvent() {}, open() { popup.closed = false; return popup; }
};
vm.runInNewContext(source, {
  window, XMLHttpRequest: XHR, URL, Blob, File, Uint8Array, btoa,
  location: { hostname: 'blog.test' }, CustomEvent: class {},
  setInterval: () => 1, clearInterval() {},
  fetch: async () => ({ status: publishedStatus, headers: { get: () => publishedType } })
});
const media = window.GitHubMedia;
(async () => {
  assert.equal((await media.session()).user.id, 'github:1');
  const storage = media.from('media');
  const file = new File(['synthetic-media'], 'a.webp', { type: 'image/webp' });
  const preview = new File(['synthetic-preview'], 'preview-a.webp', { type: 'image/webp' });
  const batch = [{ path: 'user/a.webp', file, options: {} }, { path: 'user/preview-a.webp', file: preview, options: {} }];
  let progress = 0;
  assert.equal((await storage.uploadBatch(batch, { expectedUserId: 'github:1', onUploadProgress: () => progress++ })).error, null);
  assert.equal(refWrites, 1, 'original and preview publish in one atomic commit');
  assert.ok(progress >= 2);
  assert.equal((await storage.uploadBatch(batch)).error, null);
  assert.equal(refWrites, 1, 'a retried upload does not create another deployment');
  const conflict = await storage.upload('user/a.webp', new File(['different'], 'a.webp', { type: 'image/webp' }));
  assert.equal(conflict.error.status, 409);
  assert.equal(refWrites, 1, 'conflicts do not replace an existing file');
  race = true;
  assert.equal((await storage.upload('user/b.webp', file)).error, null);
  assert.ok(tree.some((item) => item.path === 'content/concurrent.md'));
  assert.equal(refWrites, 2);
  for (const name of ['../x', 'a//b', '/x', 'a\\b', 'x?token=bad']) assert.throws(() => storage.getPublicUrl(name), /路径/);
  assert.equal(storage.getPublicUrl('a b.webp').data.publicUrl, 'https://pages.test/media/media/a%20b.webp');
  assert.throws(() => media.validateFile(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' })), /25 MiB/);
  assert.throws(() => media.validateFile(new File(['script'], 'unsafe.svg', { type: 'image/svg+xml' })), /SVG/);
  assert.throws(() => media.validateFile(new File(['script'], 'unsafe.js', { type: 'image/png' })), /文件类型/);
  await assert.rejects(media.published('https://pages.test/media/media/new.webp'), (e) => e.status === 425);
  publishedStatus = 200;
  await assert.rejects(media.published('https://pages.test/media/media/new.webp'), (e) => e.status === 425, 'SPA HTML is not a published asset');
  publishedType = 'image/webp';
  await media.published('https://pages.test/media/media/new.webp');
  const pendingAuth = media.authorize();
  const beforeSpoof = credential;
  listeners.message({ origin: 'https://evil.test', source: popup, data: 'authorization:github:success:{"token":"spoofed"}' });
  listeners.message({ origin: 'https://sveltia-cms-auth.18013013170.workers.dev', source: {}, data: 'authorization:github:success:{"token":"spoofed"}' });
  assert.equal(credential, beforeSpoof, 'authorization requires both the trusted origin and the opened popup');
  listeners.message({ origin: 'https://sveltia-cms-auth.18013013170.workers.dev', source: popup, data: 'authorization:github:success:{"token":"synthetic-owner"}' });
  await pendingAuth;
  credential = 'synthetic-reader'; canPush = false;
  const beforeDenied = refWrites;
  assert.equal((await storage.upload('no.webp', file)).error.status, 403);
  assert.equal(refWrites, beforeDenied);
  assert.ok(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/commits')).length >= 2);
  console.log('GitHub media: atomic batches, idempotency, branch races, limits, permissions, deployment readiness and OAuth isolation passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
