const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function testOAuth() {
  const calls = [];
  let status = 200, message = '', offline = false, hang = false, oauthError = null;
  const window = { location: { origin: 'https://blog-go3.pages.dev', hostname: 'blog-go3.pages.dev' },
    localStorage: {}, supabase: { createClient: () => ({ auth: { signInWithOAuth: async (options) => {
      calls.push(options); return { data: {}, error: oauthError };
    } } }) } };
  const context = vm.createContext({ window, AbortController, setTimeout: (fn) => setTimeout(fn, 5), clearTimeout,
    fetch: async (url, options) => {
      assert.equal(url, 'https://iyquixzprfwkglaqptxj.supabase.co/auth/v1/health');
      assert.equal(options.cache, 'no-store');
      assert.ok(options.headers.apikey);
      if (offline) throw new Error('synthetic offline');
      if (hang) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('synthetic timeout'))));
      return Response.json({ message }, { status });
    } });
  vm.runInContext(read('static/js/supabase.js'), context);
  await window.Auth.signInWithGitHub();
  assert.equal(calls[0].provider, 'github');
  assert.equal(calls[0].options.redirectTo, 'https://blog-go3.pages.dev/profile/');
  window.location = { origin: 'https://levia808.github.io', hostname: 'levia808.github.io' };
  await window.Auth.signInWithGitHub();
  assert.equal(calls[1].options.redirectTo, 'https://levia808.github.io/blog/profile/');
  status = 402; message = 'exceed_storage_size_quota';
  await assert.rejects(window.Auth.signInWithGitHub(), /存储超出.*认证服务已受限/);
  message = 'overdue_payment';
  await assert.rejects(window.Auth.signInWithGitHub(), /HTTP 402/);
  status = 503;
  await assert.rejects(window.Auth.signInWithGitHub(), /HTTP 503/);
  offline = true;
  await assert.rejects(window.Auth.signInWithGitHub(), /无法连接登录服务/);
  offline = false; hang = true;
  await assert.rejects(window.Auth.signInWithGitHub(), /无法连接登录服务/);
  assert.equal(calls.length, 2, 'A restricted/unavailable service never starts OAuth or bypasses Supabase');
  hang = false; status = 200; oauthError = new Error('synthetic provider error');
  await assert.rejects(window.Auth.signInWithGitHub(), /synthetic provider error/);
}

async function testBindings() {
  function element(id) {
    return { id, textContent: id, hidden: false, disabled: false, listeners: {}, values: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(event, handler) { (this.listeners[event] ||= []).push(handler); },
      querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {}, removeAttribute() {},
      fire(event) { for (const handler of this.listeners[event] || []) handler.call(this, { preventDefault() {} }); }
    };
  }
  const ids = ['githubLogin', 'githubSignIn', 'loginForm', 'signInForm', 'registerForm', 'signUpForm',
    'loginPage', 'standaloneAuthMessage', 'authOverlay', 'authModal', 'authLogin', 'authRegister', 'authReset'];
  const nodes = Object.fromEntries(ids.map((id) => [id, element(id)]));
  let oauthCalls = 0, passwordCalls = 0, signupCalls = 0, navigations = 0;
  const auth = { user: async () => null, onAuthChange() {},
    signInWithGitHub: async () => { oauthCalls++; throw new Error('synthetic restricted'); },
    signIn: async () => { passwordCalls++; throw new Error('synthetic denied'); },
    signUp: async () => { signupCalls++; throw new Error('synthetic denied'); }
  };
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const document = { body: { style: {} }, addEventListener() {},
    getElementById: (id) => nodes[id] || null, querySelector: () => null,
    querySelectorAll: (selector) => /^#[\w]+, #[\w]+$/.test(selector) ? selector.split(', ').map((id) => nodes[id.slice(1)]) : []
  };
  const window = { Auth: auth, Profile: {}, localStorage, location: { search: '', assign() { navigations++; } } };
  const context = vm.createContext({ window, document, Auth: auth, Profile: window.Profile, localStorage,
    console: { error() {} }, WeakMap, clearTimeout, setTimeout, URLSearchParams,
    FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } }
  });
  vm.runInContext(read('static/js/auth-ui.js'), context);
  const theme = read('themes/brutalism/static/js/theme.js');
  const a = theme.indexOf('  function initLoginPage()');
  const b = theme.indexOf('  /* ── 文章右侧目录', a);
  vm.runInContext(theme.slice(a, b) + '\ninitLoginPage();', context);
  const settle = () => new Promise(setImmediate);
  for (const id of ['githubLogin', 'githubSignIn']) {
    assert.equal(nodes[id].listeners.click.length, 1);
    nodes[id].fire('click'); await settle();
    assert.equal(nodes[id].disabled, false);
    assert.equal(nodes[id].textContent, id);
    assert.equal(nodes.standaloneAuthMessage.textContent, 'synthetic restricted');
  }
  assert.equal(oauthCalls, 2, 'Each click starts exactly one authentication request');
  for (const id of ['loginForm', 'signInForm', 'registerForm', 'signUpForm']) {
    assert.equal(nodes[id].listeners.submit.length, 1);
    nodes[id].fire('submit'); await settle();
  }
  assert.equal(passwordCalls, 2);
  assert.equal(signupCalls, 2);
  assert.equal(navigations, 0, 'Failed authentication never shows demo success or redirects');
}

(async () => {
  await testOAuth();
  await testBindings();
  console.log('authentication: OAuth preflight, quota/network/timeout errors, mirror callback, single handlers and no demo login passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
