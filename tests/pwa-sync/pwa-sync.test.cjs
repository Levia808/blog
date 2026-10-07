const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { indexedDB } = require('fake-indexeddb');

const source = fs.readFileSync(path.join(__dirname, '../../static/js/pwa-sync.js'), 'utf8');
let activeUser = { id: 'user-a' };
const navigatorState = { onLine: false, standalone: true };
const serverTables = new Map();
const timers = new Map();
const profileUpdates = [];
const compressedFiles = [];
const uploadOperations = [];
let forcedError = null;
let insertBarrier = null;
let insertCalls = 0;
let supabase = null;
let timerId = 0;

function rowsFor(table) {
  if (!serverTables.has(table)) serverTables.set(table, new Map());
  return serverTables.get(table);
}
function fakeTimeout(callback, delay) {
  const id = ++timerId;
  timers.set(id, { callback, delay });
  return id;
}
function fakeClearTimeout(id) { timers.delete(id); }
function matches(row, filters) {
  return Object.keys(filters).every((column) => row && row[column] === filters[column]);
}
function queryTable(table) {
  let operation = 'select';
  let value = null;
  let filters = {};
  let conflictColumns = '';
  const rows = rowsFor(table);
  const builder = {
    insert(payload) { operation = 'insert'; value = payload; insertCalls += 1; return builder; },
    update(payload) { operation = 'update'; value = payload; return builder; },
    delete() { operation = 'delete'; return builder; },
    upsert(payload, options = {}) { operation = 'upsert'; value = payload; conflictColumns = options.onConflict || ''; return builder; },
    select() { return builder; },
    eq(column, val) { filters[column] = val; return builder; },
    single() { return execute().then((result) => {
      if (result.error || !result.data || !result.data.length) {
        return { data: null, error: result.error || { status: 404, message: 'not found' } };
      }
      return { data: result.data[0], error: null };
    }); },
    then(resolve, reject) { return execute().then(resolve, reject); }
  };
  async function execute() {
    if (operation === 'insert' && insertBarrier) await insertBarrier;
    if (forcedError) {
      const error = forcedError;
      forcedError = null;
      return Promise.resolve({ data: null, error });
    }
    if (operation === 'insert') {
      const key = String(value.id || `${table}:${rows.size + 1}`);
      if (rows.has(key)) return Promise.resolve({ data: null, error: { code: '23505', status: 409, message: 'duplicate key' } });
      rows.set(key, { ...value });
      return Promise.resolve({ data: [rows.get(key)], error: null });
    }
    if (operation === 'upsert') {
      const columns = conflictColumns.split(',').filter(Boolean);
      const existing = Array.from(rows.entries()).find(([, row]) => columns.length && columns.every((column) => row[column] === value[column]));
      const key = existing ? existing[0] : String(value.id || `${table}:${rows.size + 1}`);
      rows.set(key, { ...(existing ? existing[1] : {}), ...value });
      return Promise.resolve({ data: [rows.get(key)], error: null });
    }
    if (operation === 'update') {
      const updated = [];
      rows.forEach((row, key) => {
        if (matches(row, filters)) {
          const next = { ...row, ...value };
          rows.set(key, next);
          updated.push(next);
        }
      });
      return Promise.resolve({ data: updated, error: null });
    }
    if (operation === 'delete') {
      const deleted = [];
      rows.forEach((row, key) => {
        if (matches(row, filters)) { deleted.push(row); rows.delete(key); }
      });
      return Promise.resolve({ data: deleted, error: null });
    }
    return Promise.resolve({ data: Array.from(rows.values()).filter((row) => matches(row, filters)), error: null });
  }
  return builder;
}
function makeSupabase() {
  return { from: queryTable };
}
function makeWindow() {
  const listeners = Object.create(null);
  const win = {
    matchMedia: () => ({ matches: true }),
    navigator: navigatorState,
    indexedDB,
    crypto: webcrypto,
    Auth: {
      session: async () => ({ user: activeUser }),
      user: async () => activeUser,
      onAuthChange(callback) { listeners.auth = callback; return {}; }
    },
    Admin: {
      async compressImage(file) {
        compressedFiles.push(file);
        return { original: file, preview: null };
      },
      async uploadMedia(file, _onProgress, options) {
        uploadOperations.push(options.operationId);
        return { public_url: `https://media.test/${options.expectedUserId}/${options.operationId}` };
      }
    },
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((callback) => callback(event)); return true; },
    confirm: () => true
  };
  win.Profile = {
    async update(userId, values) { profileUpdates.push({ userId, values }); return { id: userId, ...values }; },
    async uploadAvatar(userId) { return `https://media.test/${userId}/avatar.webp`; }
  };
  return win;
}
function makeDocument() {
  const elements = new Map();
  function element() {
    return {
      dataset: {}, classList: { add() {}, remove() {} },
      setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}
    };
  }
  const document = {
    currentScript: { src: 'https://blog.test/js/pwa-sync.js' },
    scripts: [], hidden: false,
    head: { appendChild() {} },
    body: { appendChild(node) { if (node.id) elements.set(node.id, node); } },
    createElement: element,
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {}
  };
  return document;
}
function boot({ withIndexedDB = true } = {}) {
  const window = makeWindow();
  const document = makeDocument();
  const Auth = window.Auth;
  const Profile = window.Profile;
  supabase = supabase || makeSupabase();
  window.blogSupabase = supabase;
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const context = vm.createContext({
    window, document, navigator: navigatorState,
    indexedDB: withIndexedDB ? indexedDB : undefined,
    crypto: webcrypto, Auth, Profile, Admin: window.Admin, blogSupabase: supabase,
    CustomEvent, URL, Blob, File: global.File,
    location: { origin: 'https://blog.test', href: 'https://blog.test/moments/' },
    setTimeout: fakeTimeout, clearTimeout: fakeClearTimeout,
    Promise, Date, Math, Object, Array, String, Number, Error, RegExp, JSON,
    fetch: async () => { throw new Error('unexpected fetch'); }
  });
  if (!withIndexedDB) delete window.indexedDB;
  vm.runInContext(source, context, { filename: 'pwa-sync.js' });
  return { window, context };
}
async function flush(app) { await app.window.PwaSync.flush(); }

(async () => {
  let app = boot();

  // Persist offline work and isolate it to the account that authored it.
  await app.window.PwaSync.enqueue('user-a', 'moment.create', {
    moment: { id: 'draft-a', user_id: 'user-a', content: 'saved locally', media: [], created_at: new Date().toISOString() }
  });
  assert.equal((await app.window.PwaSync.pending('user-a')).length, 1);
  activeUser = { id: 'user-b' };
  app.window.PwaSync.resume('user-b');
  assert.equal((await app.window.PwaSync.pending('user-a')).length, 0, 'another account cannot read queued work');
  await app.window.PwaSync.enqueue('user-b', 'profile.update', { values: { display_name: 'B' } });
  assert.equal((await app.window.PwaSync.pending('user-b')).length, 1);

  // Simulate closing/reopening the PWA: the IndexedDB outbox survives module reload.
  app = boot();
  assert.equal((await app.window.PwaSync.pending('user-b')).length, 1, 'queue survives app restart');
  activeUser = { id: 'user-a' };
  app.window.PwaSync.resume('user-a');
  assert.equal((await app.window.PwaSync.pending('user-a')).length, 1);

  navigatorState.onLine = true;
  const repeated = { id: 'stable-draft', user_id: 'user-a', content: 'idempotent', media: [], created_at: new Date().toISOString() };
  await app.window.PwaSync.enqueue('user-a', 'moment.create', { moment: repeated });
  await app.window.PwaSync.enqueue('user-a', 'moment.create', { moment: repeated });
  await flush(app);
  assert.equal(rowsFor('moments').size, 2, 'replayed create yields only one server row');
  assert.ok(insertCalls >= 3);

  // Worker-unavailable image compression falls back after enqueue, during background sync.
  const image = new Blob(['small-image-payload'], { type: 'image/png' });
  await app.window.PwaSync.enqueue('user-a', 'moment.create', {
    moment: { id: 'image-draft', user_id: 'user-a', content: 'with image', media: [{ file: image, operationId: 'image-op-1' }], created_at: new Date().toISOString() }
  });
  assert.equal(compressedFiles.length, 0, 'compression does not run in the foreground enqueue path');
  await flush(app);
  assert.equal(compressedFiles.length, 1, 'fallback compression runs in the sync worker stage');
  assert.deepEqual(uploadOperations, ['image-op-1'], 'uploads use a stable idempotency key');
  assert.equal(JSON.stringify(rowsFor('moments').get('image-draft').media), JSON.stringify(['https://media.test/user-a/image-op-1']));

  // Create/edit/delete/visibility/comment/like/profile executors reach the backend.
  await app.window.PwaSync.enqueue('user-a', 'moment.update', {
    id: 'draft-a', content: 'edited', media: [], updated_at: new Date().toISOString(), locationDirty: true, location: 'Shanghai'
  }, 'moment-update:draft-a');
  await app.window.PwaSync.enqueue('user-a', 'moment.visibility', {
    id: 'draft-a', values: { visibility: 'private', updated_at: new Date().toISOString() }
  }, 'visibility:draft-a');
  await app.window.PwaSync.enqueue('user-a', 'moment.like', { momentId: 'draft-a', liked: true }, 'like:moment:draft-a');
  await app.window.PwaSync.enqueue('user-a', 'comment.create', {
    comment: { id: 'comment-a', moment_id: 'draft-a', user_id: 'user-a', content: 'hello', parent_id: null, created_at: new Date().toISOString() }
  });
  await app.window.PwaSync.enqueue('user-a', 'comment.like', { commentId: 'comment-a', liked: true }, 'like:comment:comment-a');
  await app.window.PwaSync.enqueue('user-a', 'profile.update', { values: { display_name: 'A' } }, 'profile:update');
  await flush(app);
  assert.equal(rowsFor('moments').get('draft-a').content, 'edited');
  assert.equal(rowsFor('moments').get('draft-a').visibility, 'private');
  assert.equal(rowsFor('moment_comments').has('comment-a'), true);
  assert.equal(rowsFor('moment_likes').size, 1);
  assert.equal(rowsFor('moment_comment_likes').size, 1);
  assert.equal(profileUpdates.some((entry) => entry.userId === 'user-a' && entry.values.display_name === 'A'), true);

  await app.window.PwaSync.enqueue('user-a', 'comment.delete', { id: 'comment-a' });
  await app.window.PwaSync.enqueue('user-a', 'moment.delete', { id: 'draft-a' });
  await flush(app);
  assert.equal(rowsFor('moment_comments').has('comment-a'), false);
  assert.equal(rowsFor('moments').has('draft-a'), false);


  // Two standalone windows share the IndexedDB outbox. The second tab must not
  // submit a task while the first still owns a live lease.
  let releaseInsert;
  insertBarrier = new Promise((resolve) => { releaseInsert = resolve; });
  const crossTabId = 'cross-tab-claim';
  await app.window.PwaSync.enqueue('user-a', 'moment.create', {
    moment: { id: crossTabId, user_id: 'user-a', content: 'single worker', media: [], created_at: new Date().toISOString() }
  });
  const insertCallsBeforeClaim = insertCalls;
  const firstTabFlush = app.window.PwaSync.flush();
  for (let i = 0; i < 20 && insertCalls === insertCallsBeforeClaim; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(insertCalls, insertCallsBeforeClaim + 1, 'the first tab has started the write');
  const secondTab = boot();
  secondTab.window.PwaSync.resume('user-a');
  await secondTab.window.PwaSync.flush();
  assert.equal(insertCalls, insertCallsBeforeClaim + 1, 'a second tab cannot claim an active task');
  releaseInsert();
  insertBarrier = null;
  await firstTabFlush;
  assert.equal(rowsFor('moments').has(crossTabId), true, 'the live claim completes exactly once');

  // SQL validation / permission errors with a SQLSTATE but no HTTP status are permanent.
  forcedError = { code: '23514', message: 'check constraint violation' };
  await app.window.PwaSync.enqueue('user-a', 'moment.create', {
    moment: { id: 'invalid-draft', user_id: 'user-a', content: 'invalid', media: [], created_at: new Date().toISOString() }
  });
  await flush(app);
  const permanent = await app.window.PwaSync.failed('user-a');
  assert.equal(permanent.some((task) => task.payload.moment.id === 'invalid-draft'), true);

  // Status-less connection errors remain queued for automatic exponential retry.
  forcedError = { message: 'connection reset by peer' };
  await app.window.PwaSync.enqueue('user-a', 'moment.create', {
    moment: { id: 'network-draft', user_id: 'user-a', content: 'retry', media: [], created_at: new Date().toISOString() }
  });
  await flush(app);
  assert.equal((await app.window.PwaSync.pending('user-a')).some((task) => task.payload.moment.id === 'network-draft' && task.nextAttemptAt > Date.now()), true);

  // Missing IndexedDB must be reported to the caller rather than silently dropping data.
  const noStorageApp = boot({ withIndexedDB: false });
  await assert.rejects(noStorageApp.window.PwaSync.enqueue('user-a', 'profile.update', { values: { bio: 'x' } }), /不支持本地任务保存/);

  // Reject writes submitted under a stale account.
  activeUser = { id: 'user-b' };
  await assert.rejects(app.window.PwaSync.enqueue('user-a', 'profile.update', { values: { display_name: 'wrong' } }), /账号已变化/);

  timers.clear();
  console.log('PWA sync tests passed: persistence/restart, account isolation, media fallback, CRUD executors, idempotency, cross-tab leases, retry classification, storage errors.');
})().catch((error) => {
  timers.clear();
  console.error(error);
  process.exitCode = 1;
});
