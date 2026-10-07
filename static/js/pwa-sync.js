/* Durable PWA-only outbox. Authentication tokens are never copied into IndexedDB. */
(function () {
  'use strict';

  var standalone = false;
  try {
    standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  } catch (_) {}
  if (!standalone) return;

  // Recovery UI is injected only in the installed/standalone app.
  var recoveryStyles = document.createElement('link');
  recoveryStyles.rel = 'stylesheet';
  recoveryStyles.href = new URL('../css/pwa-sync.css', document.currentScript && document.currentScript.src || location.href).href;
  document.head.appendChild(recoveryStyles);

  var DB_NAME = 'levia-blog-pwa-outbox';
  var DB_VERSION = 1;
  var STORE = 'tasks';
  var LEASE_MS = 60000;
  var dbPromise = null;
  var activeUserId = null;
  var draining = false;
  var retryTimer = null;
  var workerURL = null;
  var shownFailures = Object.create(null);
  var tabId = uuid();

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function emit(name, detail) {
    var event;
    try { event = new CustomEvent(name, { detail: detail }); }
    catch (_) { event = document.createEvent('CustomEvent'); event.initCustomEvent(name, false, false, detail); }
    window.dispatchEvent(event);
  }

  function openDb() {
    if (!window.indexedDB) return Promise.reject(new Error('此设备不支持本地任务保存；内容未提交，请保持页面并重试。'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function () {
        req.result.onversionchange = function () { req.result.close(); dbPromise = null; };
        resolve(req.result);
      };
      req.onerror = function () { reject(req.error || new Error('无法打开本地同步队列；内容未提交。')); };
      req.onblocked = function () { reject(new Error('请关闭其他博客窗口后重试；内容尚未提交。')); };
    }).catch(function (error) { dbPromise = null; throw error; });
    return dbPromise;
  }

  function transact(mode, action) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var value;
        try { value = action(store, tx); }
        catch (error) { try { tx.abort(); } catch (_) {} reject(error); return; }
        tx.oncomplete = function () { resolve(value); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('本地任务保存失败；内容未提交。')); };
      });
    });
  }

  function allTasks() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error || new Error('读取本地待办失败。')); };
      });
    });
  }

  function getTask(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('读取本地任务失败。')); };
      });
    });
  }

  function putTask(task) { return transact('readwrite', function (store) { store.put(task); }); }

  function updateTask(id, patch) {
    return getTask(id).then(function (task) {
      if (!task) return null;
      Object.assign(task, patch);
      return putTask(task).then(function () { return task; });
    });
  }

  function userNow() {
    if (!window.Auth || typeof window.Auth.user !== 'function') return Promise.resolve(null);
    return window.Auth.user().catch(function () { return null; });
  }

  function sessionNow() {
    if (!window.Auth || typeof window.Auth.session !== 'function') return Promise.resolve(null);
    return window.Auth.session().catch(function () { return null; });
  }

  function defer(message) {
    var error = new Error(message || '等待原账号登录后继续同步。');
    error.pwaDefer = true;
    return error;
  }

  async function assertOwner(task) {
    var user = await userNow();
    if (!user || user.id !== task.userId) throw defer('请使用创建此任务的原账号登录后继续同步。');
    return user;
  }

  function isTransient(error) {
    var status = Number(error && (error.status || error.statusCode));
    if (status) return status === 408 || status === 425 || status === 429 || status >= 500;

    // Supabase/PostgreSQL errors often have a SQLSTATE code but no HTTP status.
    // Treat validation, authorization, and constraint errors as permanent instead
    // of retrying them forever; connection/resource SQLSTATE classes can recover.
    var code = String(error && error.code || '').toUpperCase();
    if (code) {
      if (/^(08|53|57|58)/.test(code) || /^PGRST00[0-3]$/.test(code)) return true;
      return false;
    }

    if (!navigator.onLine) return true;
    // Fetch TypeErrors, DNS failures, aborted connections, and status-less
    // transport errors are retryable. Unknown status-less errors are kept too.
    return true;
  }

  function restoreFile(file, metadata) {
    metadata = metadata || {};
    if (!file) return file;
    if (typeof File !== 'undefined' && file instanceof File) return file;
    if (typeof File === 'undefined') return file;
    try {
      return new File([file], metadata.fileName || file.name || 'upload.bin', {
        type: metadata.fileType || file.type || 'application/octet-stream',
        lastModified: metadata.lastModified || Date.now()
      });
    } catch (_) { return file; }
  }

  function messageOf(error) {
    var text = error && (error.message || error.error_description || error.details);
    text = String(text || '同步失败');
    if (/quota|storage|disk|space/i.test(text)) return '设备空间不足；内容仍保存在待办中，请释放空间后重试。';
    if (/permission|rls|row.level|not allowed|forbidden|42501/i.test(text)) return '当前账号没有此操作权限；原内容保留，可重试或撤销。';
    if (/invalid|malformed|22023|validation/i.test(text)) return '服务端未接受这项内容；原内容保留，可修改后重试或撤销。';
    return text.length > 140 ? text.slice(0, 137) + '…' : text;
  }

  function isDuplicate(error) {
    return String(error && (error.code || error.status || '')).indexOf('23505') >= 0 ||
      /duplicate key|already exists/i.test(String(error && error.message || ''));
  }

  async function insertIdempotent(table, payload, select) {
    var inserted = await blogSupabase.from(table).insert(payload).select(select || '*').single();
    if (!inserted.error) return inserted.data;
    if (!isDuplicate(inserted.error) || !payload.id) throw inserted.error;
    var existing = await blogSupabase.from(table).select(select || '*').eq('id', payload.id).single();
    if (existing.error) throw inserted.error;
    return existing.data;
  }

  function workerScriptURL() {
    if (workerURL) return workerURL;
    var script = Array.prototype.find.call(document.scripts, function (s) { return /\/pwa-sync\.js(?:\?|$)/.test(s.src); });
    workerURL = script ? new URL('image-compress.worker.js', script.src).href : new URL('/js/image-compress.worker.js', location.origin).href;
    return workerURL;
  }

  function prepareImage(file) {
    if (!file || !/^image\//i.test(file.type) || /image\/(?:gif|svg\+xml)/i.test(file.type) ||
        !window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var worker;
      try { worker = new Worker(workerScriptURL()); } catch (_) { resolve(null); return; }
      var done = false;
      var timer = setTimeout(function () { if (done) return; done = true; worker.terminate(); resolve(null); }, 45000);
      worker.onmessage = function (event) {
        if (done) return;
        done = true; clearTimeout(timer); worker.terminate();
        var data = event.data || {};
        if (!data.original && !data.preview) { resolve(null); return; }
        try {
          var name = String(file.name || 'image').replace(/\.[^.]+$/, '.webp');
          resolve({
            original: data.original ? new File([data.original], name, { type: 'image/webp', lastModified: file.lastModified || Date.now() }) : file,
            preview: data.preview ? new File([data.preview], 'preview-' + name, { type: 'image/webp' }) : null
          });
        } catch (_) { resolve(null); }
      };
      worker.onerror = function () { if (done) return; done = true; clearTimeout(timer); worker.terminate(); resolve(null); };
      try { worker.postMessage({ file: file }); } catch (_) { done = true; clearTimeout(timer); worker.terminate(); resolve(null); }
    });
  }

  async function uploadMedia(file, operationId, task) {
    await assertOwner(task);
    var pair = await prepareImage(file);
    if (!pair && file && /^image\//i.test(file.type) && !/image\/(?:gif|svg\+xml)/i.test(file.type) &&
        window.Admin && typeof window.Admin.compressImage === 'function') {
      try { pair = await window.Admin.compressImage(file); } catch (_) { pair = null; }
    }
    await assertOwner(task);
    return window.Admin.uploadMedia(file, null, {
      operationId: operationId,
      expectedUserId: task.userId,
      compressedPair: pair || undefined,
      skipCompression: true
    });
  }

  async function uploadEntries(task, entries) {
    var urls = [];
    for (var i = 0; i < entries.length; i++) {
      var item = entries[i];
      if (typeof item === 'string') { urls.push(item); continue; }
      if (!item || !item.file) { if (item && item.url) urls.push(item.url); continue; }
      var operationId = item.operationId || (task.id + '-' + i);
      var file = restoreFile(item.file, item);
      var uploaded = await uploadMedia(file, operationId, task);
      var url = uploaded && (uploaded.public_url || uploaded.publicUrl) || uploaded;
      urls.push(url);
      entries[i] = { url: url, operationId: operationId };
      // Save URLs into the exact nested media array before attempting the next upload.
      var mediaPath = task.type === 'moment.create' ? task.payload.moment.media : task.payload.media;
      if (mediaPath) mediaPath[i] = entries[i];
      await putTask(task);
    }
    return urls;
  }

  async function execute(task) {
    await assertOwner(task);
    var p = task.payload || {};
    var result;
    switch (task.type) {
      case 'moment.create': {
        var draft = p.moment;
        var media = await uploadEntries(task, draft.media || []);
        await assertOwner(task);
        result = await insertIdempotent('moments', {
          id: draft.id, user_id: task.userId, content: draft.content || '', media: media,
          location: draft.location || null, created_at: draft.created_at
        }, '*');
        break;
      }
      case 'moment.update': {
        var updateMedia = await uploadEntries(task, p.media || []);
        await assertOwner(task);
        var changes = { content: p.content || '', media: updateMedia, updated_at: p.updated_at };
        if (p.locationDirty) changes.location = p.location || null;
        var update = await blogSupabase.from('moments').update(changes).eq('id', p.id).select('*').single();
        if (update.error) throw update.error;
        result = update.data;
        break;
      }
      case 'moment.delete': {
        await assertOwner(task);
        var deleted = await blogSupabase.from('moments').delete().eq('id', p.id);
        if (deleted.error) throw deleted.error;
        result = true;
        break;
      }
      case 'moment.visibility': {
        await assertOwner(task);
        var visibility = await blogSupabase.from('moments').update(p.values).eq('id', p.id);
        if (visibility.error) throw visibility.error;
        result = true;
        break;
      }
      case 'moment.like':
      case 'comment.like': {
        var isComment = task.type === 'comment.like';
        var table = isComment ? 'moment_comment_likes' : 'moment_likes';
        var col = isComment ? 'comment_id' : 'moment_id';
        var targetId = isComment ? p.commentId : p.momentId;
        await assertOwner(task);
        var like = p.liked
          ? await blogSupabase.from(table).upsert((function () { var row = { user_id: task.userId }; row[col] = targetId; return row; })(), { onConflict: col + ',user_id' })
          : await blogSupabase.from(table).delete().eq(col, targetId).eq('user_id', task.userId);
        if (like.error) throw like.error;
        result = true;
        break;
      }
      case 'comment.create': {
        await assertOwner(task);
        result = await insertIdempotent('moment_comments', p.comment,
          'id, moment_id, content, created_at, user_id, parent_id, profiles(display_name, username, avatar_url)');
        break;
      }
      case 'comment.delete': {
        await assertOwner(task);
        var commentDelete = await blogSupabase.from('moment_comments').delete().eq('id', p.id);
        if (commentDelete.error) throw commentDelete.error;
        result = true;
        break;
      }
      case 'profile.update':
        await assertOwner(task);
        result = await window.Profile.update(task.userId, p.values);
        break;
      case 'profile.avatar': {
        var avatarFile = restoreFile(p.file, p);
        var avatarPair = await prepareImage(avatarFile);
        if (!avatarPair && avatarFile && /^image\//i.test(avatarFile.type) && !/image\/(?:gif|svg\+xml)/i.test(avatarFile.type) &&
            window.Admin && typeof window.Admin.compressImage === 'function') {
          try { avatarPair = await window.Admin.compressImage(avatarFile); } catch (_) { avatarPair = null; }
        }
        await assertOwner(task);
        result = await window.Profile.uploadAvatar(task.userId, avatarPair && (avatarPair.original || avatarPair.preview) || avatarFile, {
          operationId: task.id, cacheVersion: task.id, skipCompression: true, expectedUserId: task.userId
        });
        break;
      }
      case 'profile.github': {
        var response = await fetch('https://api.github.com/users/' + encodeURIComponent(p.username));
        if (!response.ok) {
          var ghError = new Error(response.status === 404 ? '没有找到该 GitHub 用户。' : 'GitHub 暂时无法响应。');
          ghError.status = response.status;
          throw ghError;
        }
        var gh = await response.json();
        await assertOwner(task);
        result = await window.Profile.update(task.userId, {
          github_username: p.username, github_avatar_url: gh.avatar_url || null, avatar_url: gh.avatar_url || null
        });
        break;
      }
      default: throw new Error('不支持的本地同步任务：' + task.type);
    }
    return result;
  }

  function schedule(delay) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { flush(); }, Math.max(300, delay || 500));
  }

  function claimNext(userId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var now = Date.now();
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.getAll();
        var claimed = null;
        var nextAt = 0;
        req.onsuccess = function () {
          var tasks = (req.result || []).filter(function (task) { return task.userId === userId; })
            .sort(function (a, b) { return a.createdAt - b.createdAt; });
          tasks.forEach(function (task) {
            if (task.status === 'processing' && Number(task.leaseUntil || 0) <= now) {
              task.status = 'queued'; task.lockId = null; task.leaseUntil = 0; store.put(task);
            }
          });
          for (var i = 0; i < tasks.length; i++) {
            var task = tasks[i];
            if (task.status === 'failed') continue;
            if (task.status === 'processing' && task.leaseUntil > now) {
              if (!nextAt || task.leaseUntil < nextAt) nextAt = task.leaseUntil;
              continue;
            }
            if (task.status !== 'queued') continue;
            if (task.nextAttemptAt > now) {
              if (!nextAt || task.nextAttemptAt < nextAt) nextAt = task.nextAttemptAt;
              continue;
            }
            task.status = 'processing';
            task.lockId = tabId;
            task.leaseUntil = now + LEASE_MS;
            task.lastError = null;
            store.put(task);
            claimed = task;
            break;
          }
        };
        tx.oncomplete = function () { resolve({ task: claimed, nextAt: nextAt }); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('领取同步任务失败。')); };
      });
    });
  }

  function removeClaimed(task) {
    return transact('readwrite', function (store) {
      var req = store.get(task.id);
      req.onsuccess = function () {
        var current = req.result;
        if (current && current.lockId === tabId) store.delete(task.id);
      };
    });
  }

  function failTask(task, error) {
    var transient = isTransient(error);
    if (error && error.pwaDefer) {
      return updateTask(task.id, { status: 'queued', lockId: null, leaseUntil: 0, nextAttemptAt: 0, lastError: null });
    }
    if (transient) {
      var attempts = (task.attempts || 0) + 1;
      var delay = Math.min(5 * 60 * 1000, 1500 * Math.pow(2, Math.min(attempts - 1, 8)));
      var nextAttemptAt = Date.now() + delay;
      return updateTask(task.id, {
        status: 'queued', lockId: null, leaseUntil: 0, attempts: attempts,
        nextAttemptAt: nextAttemptAt, lastError: messageOf(error)
      }).then(function () {
        emit('pwa-sync:retrying', { task: task, retryAt: nextAttemptAt });
        return nextAttemptAt;
      });
    }
    return updateTask(task.id, {
      status: 'failed', lockId: null, leaseUntil: 0, attempts: (task.attempts || 0) + 1,
      lastError: messageOf(error), failedAt: Date.now()
    }).then(function (failed) {
      if (failed) {
        emit('pwa-sync:failure', { task: failed, error: failed.lastError });
        notifyFailure(failed, failed.lastError);
      }
      return 0;
    });
  }

  async function flushUnlocked() {
    while (activeUserId && navigator.onLine) {
      var userId = activeUserId;
      var claimed = await claimNext(userId);
      if (!claimed.task) {
        if (claimed.nextAt) schedule(claimed.nextAt - Date.now());
        return;
      }
      var task = claimed.task;
      try {
        var result = await execute(task);
        await removeClaimed(task);
        emit('pwa-sync:synced', { task: task, result: result });
      } catch (error) {
        var retryAt = await failTask(task, error);
        if (error && error.pwaDefer) return;
        if (retryAt) { schedule(retryAt - Date.now()); return; }
      }
      if (activeUserId !== userId) return;
    }
  }

  async function flush() {
    if (!activeUserId || !navigator.onLine || draining) return;
    draining = true;
    try {
      if (navigator.locks && navigator.locks.request) {
        await navigator.locks.request('levia-blog-pwa-outbox:' + activeUserId, { ifAvailable: true }, function (lock) {
          if (lock) return flushUnlocked();
        });
      } else {
        await flushUnlocked(); // IDB leases provide the fallback cross-tab claim.
      }
    } catch (error) {
      emit('pwa-sync:queue-error', { error: messageOf(error) });
    } finally { draining = false; }
  }

  function enqueue(userId, type, payload, coalesceKey) {
    if (!userId) return Promise.reject(new Error('请先登录；内容未提交。'));
    return sessionNow().then(function (session) {
      if (!session || !session.user || session.user.id !== userId) {
        throw new Error('当前登录账号已变化；为保护数据，本次操作未保存。');
      }
      return enqueueOwned(userId, type, payload, coalesceKey);
    });
  }

  function enqueueOwned(userId, type, payload, coalesceKey) {
    var id = uuid();
    var now = Date.now();
    var task = {
      id: id, userId: userId, type: type, payload: payload,
      coalesceKey: coalesceKey || null, status: 'queued', attempts: 0,
      createdAt: now, updatedAt: now, nextAttemptAt: 0, lastError: null,
      lockId: null, leaseUntil: 0
    };
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.getAll();
        var saved = task;
        req.onsuccess = function () {
          if (coalesceKey) {
            var existing = (req.result || []).filter(function (candidate) {
              return candidate.userId === userId && candidate.type === type && candidate.coalesceKey === coalesceKey && candidate.status !== 'processing';
            }).sort(function (a, b) { return b.createdAt - a.createdAt; })[0];
            if (existing) {
              existing.payload = payload;
              existing.status = 'queued';
              existing.attempts = 0;
              existing.nextAttemptAt = 0;
              existing.lastError = null;
              existing.updatedAt = now;
              existing.lockId = null;
              existing.leaseUntil = 0;
              saved = existing;
            }
          }
          store.put(saved);
        };
        tx.oncomplete = function () {
          emit('pwa-sync:queued', { task: saved });
          schedule(200);
          resolve(saved);
        };
        tx.onerror = tx.onabort = function () {
          var error = tx.error || new Error('本机无法保存待办（可能是存储空间不足）；内容仍留在编辑框中，尚未提交。');
          if (error.name === 'QuotaExceededError') error = new Error('设备本地空间不足；内容仍留在编辑框中，尚未提交。');
          reject(error);
        };
      });
    });
  }

  async function ownsCurrentSession(userId) {
    var session = await sessionNow();
    return !!(session && session.user && session.user.id === userId);
  }

  async function pending(userId) {
    if (!userId || !await ownsCurrentSession(userId)) return [];
    var tasks = await allTasks();
    var now = Date.now();
    var own = tasks.filter(function (task) { return task.userId === userId; });
    for (var i = 0; i < own.length; i++) {
      if (own[i].status === 'processing' && Number(own[i].leaseUntil || 0) <= now) {
        own[i].status = 'queued'; own[i].lockId = null; own[i].leaseUntil = 0; own[i].nextAttemptAt = 0;
        await putTask(own[i]);
      }
    }
    return own.filter(function (task) { return task.status === 'queued' || task.status === 'processing'; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
  }

  async function failed(userId) {
    if (!userId || !await ownsCurrentSession(userId)) return [];
    return (await allTasks()).filter(function (task) { return task.userId === userId && task.status === 'failed'; });
  }

  async function retry(id) {
    var task = await getTask(id);
    if (!task || task.userId !== activeUserId || !await ownsCurrentSession(task.userId)) {
      throw new Error('只能恢复当前账号自己的待办。');
    }
    task.status = 'queued'; task.attempts = 0; task.nextAttemptAt = 0; task.lastError = null;
    task.failedAt = null; task.lockId = null; task.leaseUntil = 0;
    await putTask(task);
    delete shownFailures[id]; schedule(100);
    return task;
  }

  async function discard(id) {
    var task = await getTask(id);
    if (!task || task.userId !== activeUserId || !await ownsCurrentSession(task.userId)) {
      throw new Error('只能清理当前账号自己的待办。');
    }
    await transact('readwrite', function (store) { store.delete(id); });
    delete shownFailures[id]; emit('pwa-sync:discarded', { id: id, task: task });
    return task;
  }

  function notifyFailure(task, message) {
    if (!task || shownFailures[task.id]) return;
    shownFailures[task.id] = true;
    var root = document.getElementById('pwaSyncRecoveries');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pwaSyncRecoveries';
      root.className = 'pwa-sync-recoveries';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    var box = document.createElement('aside');
    box.className = 'pwa-sync-recovery';
    box.dataset.taskId = task.id;
    box.setAttribute('role', 'alert');
    var copy = document.createElement('div');
    copy.className = 'pwa-sync-recovery-copy';
    copy.textContent = (message || task.lastError || '同步未完成') + ' 内容仍保存在此设备。';
    var actions = document.createElement('div');
    actions.className = 'pwa-sync-recovery-actions';
    var retryButton = document.createElement('button');
    retryButton.type = 'button'; retryButton.textContent = '重试';
    retryButton.addEventListener('click', function () {
      retryButton.disabled = true;
      retry(task.id).then(function () { box.remove(); }).catch(function () { retryButton.disabled = false; });
    });
    var discardButton = document.createElement('button');
    discardButton.type = 'button'; discardButton.textContent = '撤销';
    discardButton.addEventListener('click', function () {
      discardButton.disabled = true;
      if (window.confirm && !window.confirm('撤销此本地待办？此内容将从本机队列删除。')) { discardButton.disabled = false; return; }
      discard(task.id).then(function () { box.remove(); }).catch(function () { discardButton.disabled = false; });
    });
    var closeButton = document.createElement('button');
    closeButton.type = 'button'; closeButton.className = 'pwa-sync-dismiss';
    closeButton.setAttribute('aria-label', '关闭提示'); closeButton.textContent = '×';
    closeButton.addEventListener('click', function () { box.remove(); });
    actions.appendChild(retryButton); actions.appendChild(discardButton); actions.appendChild(closeButton);
    box.appendChild(copy); box.appendChild(actions); root.appendChild(box);
  }

  function resume(userId) {
    clearTimeout(retryTimer);
    var nextUserId = userId || null;
    if (activeUserId !== nextUserId) {
      shownFailures = Object.create(null);
      var oldRecoveries = document.getElementById('pwaSyncRecoveries');
      if (oldRecoveries) oldRecoveries.remove();
    }
    activeUserId = nextUserId;
    if (!activeUserId) return;
    userNow().then(function (user) {
      if (!user || user.id !== activeUserId) return;
      failed(user.id).then(function (tasks) {
        tasks.forEach(function (task) { notifyFailure(task, task.lastError); });
      }).catch(function () {});
      pending(user.id).then(function () { schedule(100); }).catch(function (error) {
        emit('pwa-sync:queue-error', { error: messageOf(error) });
      });
    });
  }

  window.addEventListener('online', function () { schedule(100); });
  window.addEventListener('focus', function () { if (activeUserId) schedule(150); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && activeUserId) schedule(100); });
  if (window.Auth && typeof window.Auth.onAuthChange === 'function') {
    window.Auth.onAuthChange(function (_, session) { resume(session && session.user ? session.user.id : null); });
  }

  window.PwaSync = {
    enabled: true,
    enqueue: enqueue,
    pending: pending,
    failed: failed,
    retry: retry,
    discard: discard,
    update: updateTask,
    resume: resume,
    flush: flush,
    prepareImage: prepareImage,
    notifyFailure: notifyFailure,
    on: function (name, callback) { window.addEventListener('pwa-sync:' + name, function (event) { callback(event.detail || {}); }); },
    uuid: uuid
  };
})();
