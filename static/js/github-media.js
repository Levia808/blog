(function () {
  'use strict';
  var REPO = 'Levia808/blog';
  var ROOT = 'static/media/';
  var OAUTH = 'https://sveltia-cms-auth.18013013170.workers.dev';
  var MAX_BYTES = 25 * 1024 * 1024;
  var cachedIdentity = null;
  var cachedToken = null;
  var authPopup = null;
  var authResolve = null;
  var authReject = null;
  var authTimer = null;

  function token() {
    try { return window.localStorage.getItem('blog_gh_publish_token') || ''; } catch (_) { return ''; }
  }
  function error(message, status) {
    var e = new Error(message); e.status = status || 0; return e;
  }
  async function api(path, method, body, onProgress, expectedToken) {
    var credential = expectedToken || token();
    if (!credential || credential !== token()) throw error('请先授权 GitHub 仓库发布。', 401);
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method || 'GET', 'https://api.github.com' + path);
      xhr.timeout = 120000;
      xhr.setRequestHeader('Authorization', 'Bearer ' + credential);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      if (onProgress) xhr.upload.onprogress = onProgress;
      xhr.onerror = function () { reject(error('GitHub 暂时无法连接，文件仍保存在此设备。')); };
      xhr.ontimeout = function () { reject(error('GitHub 请求超时，稍后自动重试。', 408)); };
      xhr.onabort = function () { reject(error('上传已中断，稍后自动重试。', 408)); };
      xhr.onload = function () {
        var value;
        try { value = JSON.parse(xhr.responseText || '{}'); } catch (_) { value = {}; }
        if (xhr.status < 200 || xhr.status >= 300) reject(error(value.message || 'GitHub 操作失败', xhr.status));
        else resolve(value);
      };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  async function session() {
    var credential = token();
    if (!credential) return null;
    if (cachedToken === credential && cachedIdentity) return { user: cachedIdentity };
    var results = await Promise.all([api('/user'), api('/repos/' + REPO)]);
    if (credential !== token()) throw error('GitHub 账号已变化，请重试。', 401);
    if (!results[1].permissions || !results[1].permissions.push) throw error('该 GitHub 账号没有此仓库的发布权限。', 403);
    cachedToken = credential;
    cachedIdentity = { id: 'github:' + results[0].id, login: results[0].login };
    return { user: cachedIdentity };
  }
  async function owner(expectedUserId) {
    var current = await session();
    if (!current || expectedUserId && current.user.id !== expectedUserId) {
      var e = error('请使用创建此任务的 GitHub 账号重新授权。', 401); e.pwaDefer = true; throw e;
    }
    return current.user;
  }
  function pathFor(bucket, name) {
    if (!/^(media|avatars|threads-reposts|user-audio)$/.test(bucket) || !name ||
        /[\x00-\x1f\\?#]/.test(name) || name.split('/').some(function (part) { return !part || part === '.' || part === '..'; })) {
      throw error('无效的媒体路径。', 400);
    }
    return ROOT + bucket + '/' + name;
  }
  function publicUrl(bucket, name) {
    var value = window.BLOG_PAGES_MEDIA_ORIGIN || 'https://blog-go3.pages.dev';
    var parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw error('媒体发布地址必须是 HTTPS 域名。', 400);
    return parsed.origin + '/' + pathFor(bucket, name).slice(7).split('/').map(encodeURIComponent).join('/');
  }
  function validateFile(file) {
    if (!file || !file.size || file.size > MAX_BYTES) throw error('Pages 单个文件不能超过 25 MiB；请先压缩视频或缩小尺寸。', 413);
    if (!/^(image|video|audio|font)\//i.test(file.type || '') && !/\.(ttf|otf|woff2?|eot)$/i.test(file.name || '')) throw error('仅支持图片、视频、音频和字体。', 415);
    if (/\.(?:html?|m?js|css|json|xml|wasm)$/i.test(file.name || '')) throw error('该文件类型不能作为公开媒体发布。', 415);
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '')) throw error('请将 SVG 转为 PNG 或 WebP 后上传。', 415);
  }
  async function base64(file) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var chunks = [];
    for (var i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)));
    return btoa(chunks.join(''));
  }
  async function commit(entries, expectedUserId, onProgress, assertActive) {
    await owner(expectedUserId);
    var credential = token();
    var uploadedBytes = 0;
    var totalBytes = entries.reduce(function (sum, item) { return sum + (item.file ? item.file.size : 0); }, 0);
    entries.forEach(function (item) { if (item.file) validateFile(item.file); });
    var blobs = [];
    for (var item of entries) {
      var sha = null;
      if (item.file) {
        var blob = await api('/repos/' + REPO + '/git/blobs', 'POST', { content: await base64(item.file), encoding: 'base64' }, function (event) {
          if (onProgress && event.total) onProgress({ loaded: uploadedBytes + Math.min(item.file.size, item.file.size * event.loaded / event.total), total: totalBytes });
        }, credential);
        sha = blob.sha;
        uploadedBytes += item.file.size;
      }
      blobs.push({ path: item.path, mode: '100644', type: 'blob', sha: sha, upsert: item.upsert });
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      await owner(expectedUserId);
      var head = await api('/repos/' + REPO + '/git/ref/heads/main', 'GET', null, null, credential);
      var parent = await api('/repos/' + REPO + '/git/commits/' + head.object.sha, 'GET', null, null, credential);
      var tree = await api('/repos/' + REPO + '/git/trees/' + parent.tree.sha + '?recursive=1', 'GET', null, null, credential);
      if (tree.truncated) throw error('仓库文件清单不完整，上传已停止。', 422);
      var changed = blobs.filter(function (item) {
        var existing = tree.tree.find(function (node) { return node.path === item.path; });
        if (existing && item.sha && existing.sha !== item.sha && !item.upsert) throw error('同名文件已存在，未覆盖原文件。', 409);
        return item.sha ? !existing || existing.sha !== item.sha : !!existing;
      });
      if (!changed.length) return { commit: head.object.sha, unchanged: true };
      var nextTree = await api('/repos/' + REPO + '/git/trees', 'POST', {
        base_tree: parent.tree.sha,
        tree: changed.map(function (item) { return { path: item.path, mode: item.mode, type: item.type, sha: item.sha }; })
      }, null, credential);
      var next = await api('/repos/' + REPO + '/git/commits', 'POST', { message: 'Publish blog media', tree: nextTree.sha, parents: [head.object.sha] }, null, credential);
      try {
        if (assertActive) await assertActive();
        await owner(expectedUserId);
        await api('/repos/' + REPO + '/git/refs/heads/main', 'PATCH', { sha: next.sha, force: false }, null, credential);
        return { commit: next.sha };
      } catch (e) { if ((e.status !== 409 && e.status !== 422) || attempt === 2) throw e; }
    }
  }
  function from(bucket) {
    return {
      provider: 'github-pages',
      getPublicUrl: function (name) { return { data: { publicUrl: publicUrl(bucket, name) } }; },
      upload: function (name, file, options) { return this.uploadBatch([{ path: name, file: file, options: options || {} }]); },
      uploadBatch: async function (items, options) {
        try {
          var entries = items.map(function (item) { return { path: pathFor(bucket, item.path), file: item.file, upsert: !!(item.options && item.options.upsert) }; });
          var result = await commit(entries, options && options.expectedUserId, options && options.onUploadProgress || items[0].options && items[0].options.onUploadProgress, options && options.assertActive);
          return { data: result, error: null };
        } catch (e) { return { data: null, error: e }; }
      },
      remove: async function (names) {
        try { return { data: await commit(names.map(function (name) { return { path: pathFor(bucket, name), file: null }; })), error: null }; }
        catch (e) { return { data: null, error: e }; }
      }
    };
  }
  async function list() {
    await owner();
    var head = await api('/repos/' + REPO + '/git/trees/main?recursive=1');
    if (head.truncated) throw error('仓库文件清单不完整。', 422);
    return head.tree.filter(function (item) { return item.type === 'blob' && item.path.startsWith(ROOT) && !/(?:^|\/)preview-/.test(item.path); }).map(function (item) {
      var parts = item.path.slice(ROOT.length).split('/');
      var bucket = parts.shift();
      return { name: parts[parts.length - 1], gh_path: item.path, sha: item.sha, size: item.size, url: publicUrl(bucket, parts.join('/')), source: 'github' };
    });
  }
  async function upload(file, options) {
    options = options || {};
    var user = await owner(options.expectedUserId);
    var pair = /^image\//.test(file.type) && window.PwaSync ? await window.PwaSync.prepareImage(file) : null;
    if (!pair && /^image\//.test(file.type) && window.Admin) pair = await window.Admin.compressImage(file);
    var original = pair && pair.original || file;
    var name = original.name.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
    if (!/^[a-zA-Z0-9_-]+$/.test(options.operationId || '')) throw error('缺少稳定的上传任务编号。', 400);
    var path = user.id.replace(':', '-') + '/' + options.operationId + '-' + name;
    var items = [{ path: path, file: original, options: { upsert: false } }];
    if (pair && pair.preview) items.push({ path: path.slice(0, path.lastIndexOf('/') + 1) + 'preview-' + path.slice(path.lastIndexOf('/') + 1), file: pair.preview, options: { upsert: false } });
    var result = await from('media').uploadBatch(items, options);
    if (result.error) throw result.error;
    return { public_url: publicUrl('media', path), commit: result.data.commit, file_name: original.name };
  }
  async function published(url) {
    var origin = new URL(window.BLOG_PAGES_MEDIA_ORIGIN || 'https://blog-go3.pages.dev').origin;
    var parsed = new URL(url);
    if (parsed.origin !== origin || !parsed.pathname.startsWith('/media/')) return;
    var response;
    try { response = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'error' }); } catch (_) {}
    if (!response || response.status !== 200 || /text\/html/i.test(response.headers.get('Content-Type') || '')) throw error('媒体已提交，正在等待 Pages 部署；稍后自动检查。', 425);
  }
  function finishAuth(e, credential) {
    clearInterval(authTimer);
    var resolve = authResolve, reject = authReject;
    authResolve = authReject = null;
    if (authPopup && !authPopup.closed) authPopup.close();
    authPopup = null;
    if (e) { if (reject) reject(e); return; }
    try { window.localStorage.setItem('blog_gh_publish_token', credential); }
    catch (_) { if (reject) reject(error('浏览器无法保存授权，请允许此站点存储后重试。')); return; }
    cachedIdentity = cachedToken = null;
    session().then(function (value) { window.dispatchEvent(new CustomEvent('github-publish:auth')); if (resolve) resolve(value); }).catch(function (e) { if (reject) reject(e); });
  }
  function authorize() {
    if (authResolve) return Promise.reject(error('授权窗口已打开，请先完成授权。'));
    authPopup = window.open(OAUTH + '/auth?provider=github&scope=repo&site_id=' + encodeURIComponent(location.hostname) + '&state=' + encodeURIComponent(window.crypto.randomUUID()), 'sveltia_oauth', 'width=560,height=720');
    if (!authPopup) return Promise.reject(error('请允许授权弹窗后重试。'));
    return new Promise(function (resolve, reject) {
      authResolve = resolve; authReject = reject;
      authTimer = setInterval(function () { if (!authPopup || authPopup.closed) finishAuth(error('GitHub 授权已取消。')); }, 1000);
    });
  }
  window.addEventListener('message', function (event) {
    if (!authPopup || event.source !== authPopup || event.origin !== OAUTH || typeof event.data !== 'string') return;
    if (event.data === 'authorizing:github') authPopup.postMessage('authorizing:github', OAUTH);
    else if (event.data.startsWith('authorization:github:')) {
      try {
        var result = JSON.parse(event.data.slice(event.data.indexOf('{')));
        if (!event.data.startsWith('authorization:github:success:') || !result.token) finishAuth(error(result.error || 'GitHub 授权失败。'));
        else finishAuth(null, result.token);
      } catch (_) { finishAuth(error('GitHub 授权回包无效。')); }
    }
  });
  window.GitHubMedia = { from: from, list: list, upload: upload, session: session, authorize: authorize, validateFile: validateFile, published: published };
})();
