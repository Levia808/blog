(function () {
  'use strict';
  if (!window.PwaSync || !window.PwaSync.enabled) return;
  var root = null, body = null, summary = null, generation = 0;
  var liveProgress = Object.create(null);
  var labels = { 'repository.media': '媒体发布', 'moment.create': '发布动态', 'moment.update': '编辑动态', 'moment.delete': '删除动态', 'moment.visibility': '可见性', 'moment.like': '点赞', 'comment.create': '发布评论', 'comment.delete': '删除评论', 'comment.like': '评论点赞', 'profile.update': '个人资料', 'profile.avatar': '更新头像', 'profile.github': 'GitHub 资料' };
  function element(tag, text, className) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function ensurePanel() {
    if (root) return;
    root = element('details', '', 'upload-status');
    root.id = 'uploadStatus';
    summary = element('summary');
    summary.setAttribute('aria-live', 'polite');
    body = element('div', '', 'upload-status-body');
    body.appendChild(element('p', '已保存到此设备。可切换站内页面；浏览器被系统暂停后，返回时继续。', 'upload-status-hint'));
    root.appendChild(summary); root.appendChild(body); document.body.appendChild(root);
  }
  async function render() {
    var current = ++generation;
    var tasks;
    try { tasks = await window.PwaSync.status(); } catch (_) { return; }
    if (current !== generation) return;
    if (!tasks.length) { if (root) root.hidden = true; return; }
    ensurePanel(); root.hidden = false;
    var failed = tasks.filter(function (task) { return task.status === 'failed'; }).length;
    var summaryText = '上传与同步 · ' + tasks.length + ' 项' + (failed ? '，' + failed + ' 项待处理' : '');
    if (summary.textContent !== summaryText) summary.textContent = summaryText;
    body.querySelectorAll('.upload-status-task').forEach(function (node) { node.remove(); });
    tasks.forEach(function (task) {
      var row = element('div', '', 'upload-status-task');
      row.dataset.taskId = task.id;
      row.dataset.status = task.status;
      var payload = task.payload || {};
      row.appendChild(element('strong', payload.fileName || labels[task.type] || '同步任务'));
      var live = liveProgress[task.id];
      var text = task.status === 'failed' ? task.lastError || '未完成，可重试' :
        !navigator.onLine ? '已存本机，等待网络' :
          task.status === 'processing' ? live && live.stage || '正在同步' :
            task.nextAttemptAt > Date.now() ? task.lastError || '已存本机，稍后重试' : '已存本机，等待上传';
      if (task.status === 'processing' && live && live.progress !== null) text += ' · ' + Math.round(live.progress * 100) + '%';
      row.appendChild(element('span', text, 'upload-status-state'));
      if (task.status === 'processing' && live && live.progress !== null) {
        var bar = element('progress', '', 'upload-status-bar'); bar.max = 1; bar.value = live.progress;
        bar.setAttribute('aria-label', '当前文件上传进度'); row.appendChild(bar);
      }
      if (task.status === 'failed') {
        var actions = element('div', '', 'upload-status-actions');
        var retry = element('button', '重试'); retry.type = 'button';
        retry.addEventListener('click', function () { retry.disabled = true; window.PwaSync.retry(task.id).then(render).catch(function (e) { retry.disabled = false; row.querySelector('.upload-status-state').textContent = e.message; }); });
        var discard = element('button', '撤销本机待办'); discard.type = 'button';
        discard.addEventListener('click', function () {
          if (!window.confirm('撤销这项本机待办？未同步的修改将丢弃。')) return;
          discard.disabled = true;
          window.PwaSync.discard(task.id).then(render).catch(function (e) { discard.disabled = false; row.querySelector('.upload-status-state').textContent = e.message; });
        });
        actions.appendChild(retry); actions.appendChild(discard); row.appendChild(actions);
      }
      body.appendChild(row);
    });
  }
  ['queued', 'processing', 'retrying', 'failure', 'discarded', 'changed', 'synced', 'progress'].forEach(function (name) {
    window.PwaSync.on(name, function (detail) {
      if (name === 'progress' && detail.task) {
        liveProgress[detail.task.id] = detail;
        if (body) body.querySelectorAll('.upload-status-task').forEach(function (row) {
          if (row.dataset.taskId !== detail.task.id || row.dataset.status !== 'processing') return;
          row.querySelector('.upload-status-state').textContent = detail.stage + (detail.progress !== null ? ' · ' + Math.round(detail.progress * 100) + '%' : '');
          var bar = row.querySelector('.upload-status-bar');
          if (!bar && detail.progress !== null) { bar = element('progress', '', 'upload-status-bar'); bar.max = 1; bar.setAttribute('aria-label', '当前文件上传进度'); row.appendChild(bar); }
          if (bar) { bar.hidden = detail.progress === null; if (detail.progress !== null) bar.value = detail.progress; }
        });
        return;
      }
      if (name === 'synced' && detail.task) {
        delete liveProgress[detail.task.id];
        if (detail.task.type === 'repository.media') {
          ensurePanel();
          var receipt = document.getElementById('uploadPublishReceipt');
          if (!receipt) { receipt = element('p', '', 'upload-publish-receipt'); receipt.id = 'uploadPublishReceipt'; document.body.appendChild(receipt); }
          receipt.replaceChildren(element('span', '媒体已发布，可在其他设备查看。'));
          var link = element('a', '打开文件'); link.href = detail.result.public_url; link.target = '_blank'; link.rel = 'noopener'; receipt.appendChild(link);
          setTimeout(function () { receipt.remove(); }, 15000);
        }
      }
      render();
    });
  });
  window.addEventListener('online', render); window.addEventListener('offline', render);
  render();
})();
