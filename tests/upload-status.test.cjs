const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const listeners = {};
class Element {
  children = []; dataset = {}; attributes = {}; textContent = ''; hidden = false;
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  replaceChildren(...children) { this.children = []; children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { (this.listeners ||= {})[name] = callback; }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [(selector.startsWith('.') ? child.className === selector.slice(1) : child.id === selector.slice(1)) ? child : null, ...child.querySelectorAll(selector)].filter(Boolean));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const body = new Element();
const document = { body, createElement: () => new Element(), getElementById: (id) => body.querySelector('#' + id) };
let tasks = [{ id: 'synthetic-job', userId: 'github:1', type: 'repository.media', payload: { fileName: '合成测试.webp' }, status: 'queued' }];
let retries = 0, discards = 0;
const window = {
  PwaSync: { enabled: true, status: async () => tasks, on: (name, cb) => { listeners[name] = cb; }, retry: async () => { retries++; }, discard: async () => { discards++; } },
  confirm: () => false, addEventListener() {}
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/js/upload-status.js'), 'utf8'), { window, document, navigator: { onLine: true }, setTimeout() {} });
const settle = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  await settle();
  let panel = document.getElementById('uploadStatus');
  assert.match(panel.children[0].textContent, /1 项/);
  assert.equal(panel.hidden, false);
  tasks[0].status = 'processing';
  listeners.processing({ task: tasks[0] }); await settle();
  listeners.progress({ task: tasks[0], stage: '正在上传', progress: .42 });
  await settle();
  assert.match(panel.querySelector('.upload-status-state').textContent, /42%/);
  tasks[0].status = 'failed'; tasks[0].lastError = '合成测试：服务暂不可用'; listeners.failure({ task: tasks[0] });
  await settle();
  const buttons = panel.querySelector('.upload-status-actions').children;
  await buttons[0].listeners.click(); await settle(); assert.equal(retries, 1);
  await buttons[1].listeners.click(); assert.equal(discards, 0, 'discard needs an explicit user decision');
  tasks = []; listeners.changed({}); await settle(); assert.equal(panel.hidden, true, 'no previous account files remain visible');
  console.log('Upload status: persistent task display, honest progress, recovery controls and account-change clearing passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
