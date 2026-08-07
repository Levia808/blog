(function () {
  'use strict';

  var loading = document.getElementById('adminLoading');
  var unauthorized = document.getElementById('adminUnauthorized');
  var content = document.getElementById('adminContent');
  var adminProfile = null;

  function show(element) {
    loading.hidden = true;
    unauthorized.hidden = true;
    content.hidden = true;
    element.hidden = false;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  function commentStatusName(status) {
    return { pending: '待审核', approved: '已通过', rejected: '已拒绝', hidden: '已隐藏' }[status] || status;
  }

  function showError(message, targetId) {
    var target = document.getElementById(targetId || 'adminError');
    if (!target) return;
    var text = '';
    if (message && typeof message === 'object') {
      text = message.message || '操作失败，请稍后重试。';
      if (message.details) text += '\n详情: ' + message.details;
      if (message.hint) text += '\n提示: ' + message.hint;
    } else {
      text = message || '操作失败，请稍后重试。';
    }
    target.textContent = text;
    target.hidden = false;
  }

  function errorText(error) {
    if (!error) return '操作失败，请稍后重试。';
    var text = error.message || String(error);
    if (error.details) text += ' — ' + error.details;
    return text;
  }

  function showToast(message, type) {
    var wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    var toast = document.createElement('div');
    toast.className = 'toast is-' + (type || 'info');
    toast.innerHTML = '<span class="toast-dot"></span><span>' + escapeHtml(message) + '</span>';
    wrap.appendChild(toast);
    window.requestAnimationFrame(function () { toast.classList.add('is-show'); });
    window.setTimeout(function () {
      toast.classList.remove('is-show');
      window.setTimeout(function () { toast.remove(); }, 250);
    }, 2600);
  }

  function renderSkeleton(tableId, cols, rows) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var html = '';
    for (var r = 0; r < rows; r++) {
      html += '<tr class="skel-row">';
      for (var cIdx = 0; cIdx < cols; cIdx++) {
        html += '<td><span class="skel ' + (cIdx === 0 ? 'w60' : cIdx === 1 ? 'w40' : '') + '"></span></td>';
      }
      html += '</tr>';
    }
    table.innerHTML = html;
  }

  function clearError(targetId) {
    var target = document.getElementById(targetId || 'adminError');
    if (target) {
      target.hidden = true;
      target.textContent = '';
    }
  }

  /* ── 面板切换 ── */
  var sections = ['dashboard', 'posts', 'archive', 'comments', 'users', 'media', 'settings'];

  function switchSection(name) {
    sections.forEach(function (section) {
      var panel = document.querySelector('[data-admin-panel="' + section + '"]');
      if (panel) panel.hidden = section !== name;
      document.querySelectorAll('[data-admin-section="' + section + '"]').forEach(function (link) {
        link.classList.toggle('active', section === name);
      });
    });
  }

  document.querySelectorAll('[data-admin-section]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      switchSection(link.dataset.adminSection);
      closeAdminDrawer();
    });
  });

  /* ── 移动端左侧抽屉 (与主站同款) ── */
  var adminDrawer = document.getElementById('adminDrawer');
  var adminMask = document.getElementById('adminDrawerMask');
  var adminToggle = document.getElementById('adminDrawerToggle');
  var adminClose = document.getElementById('adminDrawerClose');

  function openAdminDrawer() {
    if (!adminDrawer) return;
    adminMask.hidden = false;
    adminDrawer.hidden = false;
    adminDrawer.setAttribute('aria-hidden', 'false');
    adminToggle && adminToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(function () {
      adminDrawer.classList.add('is-open');
      adminMask.classList.add('is-show');
    });
  }

  function closeAdminDrawer() {
    if (!adminDrawer) return;
    adminDrawer.classList.remove('is-open');
    adminMask.classList.remove('is-show');
    adminToggle && adminToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    window.setTimeout(function () {
      if (!adminDrawer.classList.contains('is-open')) {
        adminDrawer.hidden = true;
        adminMask.hidden = true;
        adminDrawer.setAttribute('aria-hidden', 'true');
      }
    }, 180);
  }

  if (adminToggle) adminToggle.addEventListener('click', function () {
    if (adminDrawer.hidden || !adminDrawer.classList.contains('is-open')) openAdminDrawer();
    else closeAdminDrawer();
  });
  if (adminClose) adminClose.addEventListener('click', closeAdminDrawer);
  if (adminMask) adminMask.addEventListener('click', closeAdminDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && adminDrawer && !adminDrawer.hidden) closeAdminDrawer();
  });
  if (adminDrawer) adminDrawer.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeAdminDrawer();
  });

  /* ── 统计 (设计稿 4 卡) ── */
  function renderStats(stats) {
    document.getElementById('adminPostCount').textContent = stats.posts;
    document.getElementById('adminCommentCount').textContent = stats.comments;
    document.getElementById('adminUserCount').textContent = stats.users;
    document.getElementById('adminPendingCommentCount').textContent = stats.pending;
  }

  async function loadStats() {
    var stats = await Admin.getStats();
    renderStats({
      posts: document.getElementById('adminPostCount').textContent,
      comments: stats.totalComments,
      users: stats.totalUsers,
      pending: stats.pendingComments
    });
  }

  /* ── GitHub 发布模块 ── */
  var GH_REPO = 'Levia808/blog';
  var GH_OAUTH_URL = 'https://sveltia-cms-auth.18013013170.workers.dev';
  var ghToken = null;
  var ghPostsCache = [];

  function getGhToken() {
    if (ghToken) return ghToken;
    try { ghToken = window.localStorage.getItem('blog_gh_publish_token') || null; } catch (e) {}
    return ghToken;
  }

  function base64Encode(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function ghFetch(path, options) {
    options = options || {};
    options.headers = Object.assign({
      Authorization: 'Bearer ' + getGhToken(),
      Accept: 'application/vnd.github+json'
    }, options.headers || {});
    return fetch('https://api.github.com' + path, options).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw new Error(data.message || ('GitHub API ' + res.status));
        });
      }
      return res.json();
    });
  }

  function parseFrontMatter(text) {
    var meta = { title: '', draft: true, archived: false, date: '' };
    var m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return meta;
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (!kv) return;
      var key = kv[1];
      var value = kv[2].trim();
      if (key === 'title') meta.title = value.replace(/^['"]|['"]$/g, '');
      else if (key === 'draft') meta.draft = value !== 'false';
      else if (key === 'archived') meta.archived = value === 'true';
      else if (key === 'date') meta.date = value.replace(/^['"]|['"]$/g, '');
    });
    return meta;
  }

  function setDraft(text, draft) {
    var flag = draft ? 'true' : 'false';
    if (/^draft:\s*true\s*$/m.test(text)) {
      return text.replace(/^draft:\s*true\s*$/m, 'draft: ' + flag);
    }
    if (/^draft:\s*false\s*$/m.test(text)) {
      return text.replace(/^draft:\s*false\s*$/m, 'draft: ' + flag);
    }
    return text.replace(/^---\r?\n/, '---\ndraft: ' + flag + '\n');
  }

  function setArchived(text, archived) {
    var flag = archived ? 'true' : 'false';
    if (/^archived:\s*true\s*$/m.test(text)) {
      return text.replace(/^archived:\s*true\s*$/m, 'archived: ' + flag);
    }
    if (/^archived:\s*false\s*$/m.test(text)) {
      return text.replace(/^archived:\s*false\s*$/m, 'archived: ' + flag);
    }
    if (archived) {
      return text.replace(/^(draft:\s*\S+\s*)$/m, '$1\narchived: true');
    }
    return text.replace(/^archived:\s*true\s*$/m, '');
  }

  async function loadGhPosts() {
    var files = await ghFetch('/repos/' + GH_REPO + '/contents/content/posts');
    if (!Array.isArray(files)) files = [];
    var posts = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!/\.md$/.test(file.name)) continue;
      try {
        var raw = await fetch(file.download_url).then(function (r) { return r.text(); });
        var meta = parseFrontMatter(raw);
        posts.push({ name: file.name, sha: file.sha, title: meta.title || file.name, draft: meta.draft, archived: meta.archived, date: meta.date });
      } catch (e) {
        posts.push({ name: file.name, sha: file.sha, title: file.name, draft: true, date: '' });
      }
    }
    posts.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    ghPostsCache = posts;
    return posts;
  }

  function renderPostRows(posts, tableId, showActions) {
    var table = document.getElementById(tableId);
    if (!posts.length) {
      table.innerHTML = '<tr><td colspan="4"><div class="empty-state"><span class="es-glyph">▤</span><span class="es-title">暂无文章</span><span class="es-desc">点击右上角「+ 新建文章」开始写作</span></div></td></tr>';
      return;
    }
    table.innerHTML = posts.map(function (post) {
      var status = post.archived
        ? '<span class="admin-status"><span class="status-dot status-draft"></span>已归档</span>'
        : (post.draft
          ? '<span class="admin-status"><span class="status-dot status-draft"></span>草稿</span>'
          : '<span class="admin-status"><span class="status-dot status-published"></span>已发布</span>');
      var date = post.date ? post.date.slice(0, 10) : '—';
      var cmsBaseEl = document.getElementById('cmsNewPost');
      var cmsBase = cmsBaseEl ? cmsBaseEl.getAttribute('href') : 'admin-cms/';
      var cmsEntry = cmsBase + '#/collections/posts/entries/' + encodeURIComponent(post.name.replace(/\.md$/, ''));
      var actions = showActions
        ? '<div class="admin-action-group">' +
          (post.archived
            ? '<button type="button" class="admin-row-action is-primary" data-post-unarchive="' + escapeHtml(post.name) + '">取消归档</button>'
            : (post.draft
              ? '<button type="button" class="admin-row-action is-primary" data-post-publish="' + escapeHtml(post.name) + '">发布</button>'
              : '<button type="button" class="admin-row-action" data-post-draft="' + escapeHtml(post.name) + '">下架</button>' +
                '<button type="button" class="admin-row-action" data-post-archive="' + escapeHtml(post.name) + '">归档</button>')) +
          '<button type="button" class="admin-row-action is-danger" data-post-delete="' + escapeHtml(post.name) + '">删除</button>' +
          '<a class="admin-row-action" href="' + cmsEntry + '">编辑</a>' +
          '</div>'
        : '';
      return '<tr>' +
        '<td><strong>' + escapeHtml(post.title) + '</strong><br><code>' + escapeHtml(post.name) + '</code></td>' +
        '<td>' + status + '</td>' +
        '<td>' + date + '</td>' +
        '<td>' + (showActions ? actions : '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  async function refreshPosts() {
    if (!getGhToken()) {
      var hint = document.getElementById('adminPublishHint');
      var note = document.getElementById('ghPublishNote');
      var postCountEl = document.getElementById('adminPostCount');
      if (postCountEl) postCountEl.textContent = '—';
      renderPostRows([], 'adminPostTable', true);
      renderPostRows([], 'adminPublishTable', true);
      if (hint) hint.textContent = '';
      if (note) note.textContent = '尚未授权 GitHub。点击右上角「GitHub 授权」后即可管理并一键发布文章。';
      return;
    }
    var posts = await loadGhPosts();
    var postCountEl = document.getElementById('adminPostCount');
    if (postCountEl) postCountEl.textContent = posts.length;
    renderPostRows(posts.slice(0, 8), 'adminPostTable', true);
    document.getElementById('adminPostHint').textContent = '共 ' + posts.length + ' 篇文章 · 显示最近 ' + Math.min(8, posts.length) + ' 篇';
    renderPostRows(posts, 'adminPublishTable', true);
    document.getElementById('adminPublishHint').textContent = '共 ' + posts.length + ' 篇文章';
    var archived = posts.filter(function (p) { return p.archived; });
    renderPostRows(archived, 'adminArchiveTable', true);
    document.getElementById('adminArchiveHint').textContent = '已归档 ' + archived.length + ' 篇 · 归档后从首页与列表隐藏';
  }

  async function commitPost(name, transform, message) {
    var post = ghPostsCache.find(function (p) { return p.name === name; });
    if (!post) throw new Error('未找到文章 ' + name);
    var raw = await fetch('https://raw.githubusercontent.com/' + GH_REPO + '/main/content/posts/' + encodeURIComponent(name))
      .then(function (r) { return r.text(); });
    var updated = transform(raw);
    await ghFetch('/repos/' + GH_REPO + '/contents/content/posts/' + name, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, content: base64Encode(updated), sha: post.sha })
    });
    showToast(message, 'success');
    await refreshPosts();
  }

  async function setPostPublished(name, published) {
    await commitPost(name, function (raw) { return setDraft(raw, !published); },
      (published ? '发布: ' : '转为草稿: ') + name);
  }

  async function setPostArchived(name, archived) {
    await commitPost(name, function (raw) { return setArchived(raw, archived); },
      (archived ? '归档: ' : '取消归档: ') + name);
  }

  function updateGhAuthStatus() {
    var authorized = Boolean(getGhToken());
    var statusEl = document.getElementById('ghAuthStatus');
    if (statusEl) statusEl.textContent = authorized ? '已授权' : '未授权';
    var dashStatus = document.getElementById('dashboardGhStatus');
    if (dashStatus) {
      dashStatus.innerHTML = '<span class="status-dot ' + (authorized ? 'status-published' : 'status-draft') + '"></span>GitHub: ' + (authorized ? '已授权' : '未授权');
    }
    var authBtn = document.getElementById('ghAuthBtn');
    if (authBtn) authBtn.textContent = authorized ? '重新授权' : 'GitHub 授权';
    if (authorized) {
      refreshPosts().catch(function (error) { showError(errorText(error)); });
    } else {
      renderPostRows([], 'adminPostTable', true);
      renderPostRows([], 'adminPublishTable', true);
    }
  }

  function authorizeGitHub() {
    var authBtn = document.getElementById('ghAuthBtn');
    if (authBtn) { authBtn.classList.add('is-loading'); authBtn.disabled = true; }
    var state = Date.now().toString(36) + Math.random().toString(36).slice(2);
    var url = GH_OAUTH_URL + '/auth?provider=github&scope=repo&state=' + state;
    var popup = window.open(url, 'sveltia_oauth', 'width=560,height=720');
    if (!popup) {
      if (authBtn) { authBtn.classList.remove('is-loading'); authBtn.disabled = false; }
      showError('浏览器拦截了授权窗口，请允许弹出窗口后重试。');
      return;
    }
    window.__ghAuthResolve = function (token) {
      try { window.localStorage.setItem('blog_gh_publish_token', token); } catch (e) {}
      ghToken = token;
      updateGhAuthStatus();
    };
  }

  window.addEventListener('message', function (event) {
    if (typeof event.data !== 'string' || !event.data.startsWith('authorizing:github')) return;
    event.source.postMessage('authorizing:github', event.origin);
  });

  window.addEventListener('message', function (event) {
    if (typeof event.data !== 'string' || !event.data.startsWith('authorization:github:')) return;
    var parts = event.data.split(':');
    var state = parts[2];
    var payload = event.data.slice(event.data.indexOf('{'));
    try {
      var data = JSON.parse(payload);
      var authBtn = document.getElementById('ghAuthBtn');
      if (authBtn) { authBtn.classList.remove('is-loading'); authBtn.disabled = false; }
      if (state === 'success' && data.token) {
        window.__ghAuthResolve && window.__ghAuthResolve(data.token);
        showError('');
        showToast('GitHub 授权成功', 'success');
      } else if (data.error) {
        showToast(data.error, 'error');
      }
    } catch (e) {}
  });

  var ghAuthBtn = document.getElementById('ghAuthBtn');
  if (ghAuthBtn) ghAuthBtn.addEventListener('click', authorizeGitHub);
  var ghAuthBtn2 = document.getElementById('ghAuthBtn2');
  if (ghAuthBtn2) ghAuthBtn2.addEventListener('click', authorizeGitHub);

  /* ── 用户 / 评论 / 媒体 ── */
  function renderUsers(users) {
    var table = document.getElementById('adminUserTable');
    if (!users.length) {
      table.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="es-glyph">👥</span><span class="es-title">暂无用户</span><span class="es-desc">用户注册后会显示在这里</span></div></td></tr>';
      return;
    }
    table.innerHTML = users.map(function (user) {
      var avatar = user.avatar_url || '';
      var name = user.display_name || user.username || '—';
      var roleNames = { user: '用户', author: '作者', admin: '管理员', superadmin: '超级管理员' };
      var statusNames = { active: '正常', suspended: '停用', deleted: '已删除' };
      var canChangeRole = adminProfile && adminProfile.role === 'superadmin';
      var roleControl = canChangeRole
        ? '<select class="admin-row-select" data-user-role="' + escapeHtml(user.id) + '">' +
          ['user', 'author', 'admin', 'superadmin'].map(function (role) {
            return '<option value="' + role + '"' + (user.role === role ? ' selected' : '') + '>' + (roleNames[role] || role) + '</option>';
          }).join('') + '</select>'
        : '<span class="admin-role">' + escapeHtml(roleNames[user.role] || user.role) + '</span>';
      var statusControl = '<select class="admin-row-select" data-user-status="' + escapeHtml(user.id) + '">' +
        ['active', 'suspended', 'deleted'].map(function (status) {
          return '<option value="' + status + '"' + (user.account_status === status ? ' selected' : '') + '>' + (statusNames[status] || status) + '</option>';
        }).join('') + '</select>';
      return '<tr>' +
        '<td>' + (avatar ? '<img class="admin-avatar" src="' + escapeHtml(avatar) + '" alt="" loading="lazy">' : '—') + '</td>' +
        '<td><strong>' + escapeHtml(name) + '</strong><br><code>' + escapeHtml(user.username || '') + '</code></td>' +
        '<td>' + escapeHtml(user.email || '—') + '</td>' +
        '<td>' + roleControl + '</td><td>' + statusControl + '</td>' +
        '<td><button type="button" class="admin-row-action" data-user-save="' + escapeHtml(user.id) + '">保存</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderComments(comments) {
    var table = document.getElementById('adminCommentTable');
    if (!comments.length) {
      table.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="es-glyph">💬</span><span class="es-title">暂无评论</span><span class="es-desc">有读者评论后会显示在这里</span></div></td></tr>';
      return;
    }
    table.innerHTML = comments.map(function (comment) {
      var author = comment.display_name || comment.username || '读者';
      var excerpt = String(comment.content || '').slice(0, 140);
      return '<tr>' +
        '<td>' + escapeHtml(excerpt) + '</td>' +
        '<td><code>' + escapeHtml(comment.post_path) + '</code></td>' +
        '<td>' + escapeHtml(author) + '</td>' +
        '<td><span class="admin-status admin-status-' + escapeHtml(comment.moderation_status) + '">' + escapeHtml(comment.moderation_status) + '</span></td>' +
        '<td>' + formatDate(comment.created_at) + '</td>' +
        '<td><div class="admin-action-group">' +
          '<button type="button" class="admin-row-action is-primary" data-comment-action="approved" data-comment-id="' + comment.id + '">通过</button>' +
          '<button type="button" class="admin-row-action is-danger" data-comment-action="hidden" data-comment-id="' + comment.id + '">隐藏</button>' +
          '<button type="button" class="admin-row-action is-danger" data-comment-action="rejected" data-comment-id="' + comment.id + '">拒绝</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  function guessMime(name) {
    var ext = String(name).split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    if (ext === 'mp4') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) return 'audio/' + ext;
    return 'application/octet-stream';
  }

  function renderMedia(assets) {
    var grid = document.getElementById('adminMediaGrid');
    if (!assets.length) {
      grid.innerHTML = '<div class="empty-state"><span class="es-glyph">▦</span><span class="es-title">媒体库为空</span><span class="es-desc">点击「上传媒体」添加图片 / 视频 / 音频</span></div>';
      return;
    }
    grid.innerHTML = assets.map(function (asset) {
      var mime = asset.mime_type || guessMime(asset.file_name || asset.name || '');
      var url = asset.public_url || asset.url || '';
      var size = asset.size_bytes != null ? asset.size_bytes : (asset.size != null ? asset.size : 0);
      var preview;
      var embedBtn = '';
      if (/^image\//i.test(mime)) {
        preview = '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(asset.file_name || asset.name) + '" loading="lazy">';
      } else if (/^video\//i.test(mime)) {
        preview = '<video src="' + escapeHtml(url) + '" controls preload="metadata"></video>';
        embedBtn = '<button type="button" class="admin-row-action is-primary" data-copy-embed="video" data-url="' + escapeHtml(url) + '">复制视频代码</button>';
      } else if (/^audio\//i.test(mime)) {
        preview = '<div class="admin-media-audio">AUDIO</div>';
        embedBtn = '<button type="button" class="admin-row-action is-primary" data-copy-embed="audio" data-url="' + escapeHtml(url) + '">复制音频代码</button>';
      } else {
        preview = '<div class="admin-media-audio">FILE</div>';
      }
      var delBtn = asset.source === 'github'
        ? '<button type="button" class="admin-row-action is-danger" data-gh-media-delete="' + escapeHtml(asset.name) + '" data-gh-sha="' + escapeHtml(asset.sha) + '" data-gh-path="' + escapeHtml(asset.gh_path) + '">删除</button>'
        : '<button type="button" class="admin-row-action is-danger" data-media-delete="' + escapeHtml(asset.id) + '">删除</button>';
      var sourceTag = asset.source === 'github' ? ' · 仓库' : '';
      return '<article class="admin-media-item">' + preview +
        '<div class="admin-media-meta"><strong title="' + escapeHtml(asset.file_name || asset.name) + '">' + escapeHtml(asset.file_name || asset.name) + '</strong>' +
        '<small>' + escapeHtml(mime) + ' · ' + Math.ceil(size / 1024) + ' KB' + sourceTag + '</small>' +
        '<div class="admin-action-group">' + embedBtn +
        '<a class="admin-row-action" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">打开</a>' + delBtn + '</div></div></article>';
    }).join('');
  }

  async function loadGhMedia() {
    if (!getGhToken()) return [];
    var files = [];
    try {
      for (var dir of ['assets/images', 'static/images']) {
        var list = await ghFetch('/repos/' + GH_REPO + '/contents/' + dir);
        if (!Array.isArray(list)) continue;
        list.forEach(function (f) {
          if (f.type !== 'file') return;
          files.push({ name: f.name, sha: f.sha, size: f.size, url: '/' + dir + '/' + encodeURIComponent(f.name), source: 'github', gh_path: dir + '/' + f.name });
        });
      }
    } catch (e) { /* 目录不存在或未授权时忽略 */ }
    return files;
  }

  async function loadUsers() {
    renderUsers(await Admin.getAllUsers());
  }

  async function loadComments() {
    var filter = document.getElementById('adminCommentFilter').value || null;
    renderComments(await Admin.getComments(filter));
  }

  async function loadMedia() {
    var results = await Promise.all([
      Admin.getMedia().catch(function () { return []; }),
      loadGhMedia()
    ]);
    var assets = results[0].concat(results[1]);
    renderMedia(assets);
    return assets.length;
  }

  async function loadDashboard() {
    clearError();
    renderSkeleton('adminPostTable', 4, 3);
    renderSkeleton('adminUserTable', 6, 3);
    renderSkeleton('adminCommentTable', 6, 3);
    var results = await Promise.all([
      Admin.getStats().catch(function (error) { showError(errorText(error)); return null; }),
      Admin.getAllUsers().catch(function (error) { showError(errorText(error)); return []; }),
      Admin.getComments().catch(function (error) { showError(errorText(error)); return []; }),
      Admin.getMedia().catch(function (error) { showError(errorText(error)); return []; })
    ]);
    renderStats(results[0] || { posts: '—', comments: '—', users: '—', pending: '—' });
    renderUsers(results[1]);
    renderComments(results[2]);
    renderMedia(results[3]);
    document.getElementById('adminIdentity').textContent =
      (adminProfile.display_name || adminProfile.username || '管理员') + ' · ' + adminProfile.role;
    show(content);
  }

  document.addEventListener('change', async function (event) {
    var roleUserId = event.target.dataset.userRole;
    var statusUserId = event.target.dataset.userStatus;
    if (roleUserId || statusUserId) {
      event.target.dataset.changed = 'true';
    }
    if (event.target.id === 'adminCommentFilter') {
      try { await loadComments(); } catch (error) { showError(errorText(error)); }
    }
  });

  document.addEventListener('click', async function (event) {
    var refresh = event.target.closest('[data-admin-refresh]');
    if (refresh) {
      var btn = document.getElementById('adminRefreshBtn');
      try {
        if (btn) { btn.classList.add('is-loading'); btn.disabled = true; }
        if (refresh.dataset.adminRefresh === 'stats') {
          await Promise.all([
            loadStats().catch(function (e) { showError(e.message); }),
            refreshPosts().catch(function (e) { showError(e.message); })
          ]);
          updateGhAuthStatus();
          showToast('仪表盘状态已刷新', 'success');
        }
        if (refresh.dataset.adminRefresh === 'users') await loadUsers();
        if (refresh.dataset.adminRefresh === 'comments') await loadComments();
        if (refresh.dataset.adminRefresh === 'media') {
          var count = await loadMedia();
        }
        if (refresh.dataset.adminRefresh === 'archive') await refreshPosts();
      } catch (error) {
        showError(errorText(error));
      } finally {
        if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; }
      }
      return;
    }

    var publishBtn = event.target.closest('[data-post-publish]');
    if (publishBtn) {
      try {
        publishBtn.disabled = true;
        await setPostPublished(publishBtn.dataset.postPublish, true);
      } catch (error) {
        showError(errorText(error));
      } finally {
        publishBtn.disabled = false;
      }
      return;
    }

    var draftBtn = event.target.closest('[data-post-draft]');
    if (draftBtn) {
      try {
        draftBtn.disabled = true;
        await setPostPublished(draftBtn.dataset.postDraft, false);
      } catch (error) {
        showError(errorText(error));
      } finally {
        draftBtn.disabled = false;
      }
      return;
    }

    var archiveBtn = event.target.closest('[data-post-archive]');
    if (archiveBtn) {
      try {
        archiveBtn.disabled = true;
        await setPostArchived(archiveBtn.dataset.postArchive, true);
      } catch (error) {
        showError(errorText(error));
      } finally {
        archiveBtn.disabled = false;
      }
      return;
    }

    var unarchiveBtn = event.target.closest('[data-post-unarchive]');
    if (unarchiveBtn) {
      try {
        unarchiveBtn.disabled = true;
        await setPostArchived(unarchiveBtn.dataset.postUnarchive, false);
      } catch (error) {
        showError(errorText(error));
      } finally {
        unarchiveBtn.disabled = false;
      }
      return;
    }

    var deleteBtn = event.target.closest('[data-post-delete]');
    if (deleteBtn) {
      var postName = deleteBtn.dataset.postDelete;
      var post = ghPostsCache.find(function (p) { return p.name === postName; });
      if (!window.confirm('确认删除文章「' + (post ? post.title : postName) + '」？此操作会从仓库删除文件，不可恢复。')) return;
      try {
        deleteBtn.disabled = true;
        var target = ghPostsCache.find(function (p) { return p.name === postName; });
        if (!target) throw new Error('未找到文章 ' + postName);
        await ghFetch('/repos/' + GH_REPO + '/contents/content/posts/' + postName, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '删除: ' + (target.title || postName), sha: target.sha })
        });
        showToast('已删除：' + (target.title || postName), 'success');
        await refreshPosts();
      } catch (error) {
        showError(errorText(error));
      } finally {
        deleteBtn.disabled = false;
      }
      return;
    }

    var saveUser = event.target.closest('[data-user-save]');
    if (saveUser) {
      var userId = saveUser.dataset.userSave;
      var statusSelect = document.querySelector('[data-user-status="' + userId + '"]');
      var roleSelect = document.querySelector('[data-user-role="' + userId + '"]');
      try {
        saveUser.disabled = true;
        await Admin.updateAccountStatus(userId, statusSelect.value);
        if (roleSelect && adminProfile.role === 'superadmin') await Admin.updateRole(userId, roleSelect.value);
        await loadUsers();
      } catch (error) {
        showError(errorText(error));
      } finally {
        saveUser.disabled = false;
      }
      return;
    }

    var moderationButton = event.target.closest('[data-comment-action]');
    if (moderationButton) {
      try {
        moderationButton.disabled = true;
        await Admin.moderateComment(Number(moderationButton.dataset.commentId), moderationButton.dataset.commentAction);
        await loadComments();
      } catch (error) {
        showError(errorText(error));
      } finally {
        moderationButton.disabled = false;
      }
      return;
    }

    var copyEmbed = event.target.closest('[data-copy-embed]');
    if (copyEmbed) {
      var code = '{{< ' + copyEmbed.dataset.copyEmbed + ' src="' + copyEmbed.dataset.url + '" >}}';
      var done = function () {
        showToast('已复制嵌入代码，粘贴到文章正文即可', 'success');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(function () {
          window.prompt('复制以下代码到文章正文：', code);
        });
      } else {
        window.prompt('复制以下代码到文章正文：', code);
      }
      return;
    }

    var ghDeleteMedia = event.target.closest('[data-gh-media-delete]');
    if (ghDeleteMedia) {
      if (!window.confirm('确认删除仓库文件「' + ghDeleteMedia.dataset.ghMediaDelete + '」？此操作会提交删除，不可恢复。')) return;
      try {
        ghDeleteMedia.disabled = true;
        await ghFetch('/repos/' + GH_REPO + '/contents/' + ghDeleteMedia.dataset.ghPath, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '删除媒体: ' + ghDeleteMedia.dataset.ghMediaDelete, sha: ghDeleteMedia.dataset.ghSha })
        });
        showToast('已删除：' + ghDeleteMedia.dataset.ghMediaDelete, 'success');
        await loadMedia();
      } catch (error) {
        showError(errorText(error));
      } finally {
        ghDeleteMedia.disabled = false;
      }
      return;
    }

    var deleteMedia = event.target.closest('[data-media-delete]');
    if (deleteMedia) {
      if (!window.confirm('确认删除这个媒体资产？')) return;
      try {
        deleteMedia.disabled = true;
        await Admin.deleteMedia(deleteMedia.dataset.mediaDelete);
        await loadMedia();
      } catch (error) {
        showError(errorText(error));
      }
    }
  });

  var uploadButton = document.getElementById('adminMediaUpload');
  if (uploadButton) uploadButton.addEventListener('click', async function () {
    var input = document.getElementById('adminMediaInput');
    var file = input.files[0];
    clearError('adminMediaError');
    if (!file) {
      showError('请选择一个媒体文件。', 'adminMediaError');
      return;
    }
    try {
      uploadButton.disabled = true;
      uploadButton.textContent = '上传中…';
      await Admin.uploadMedia(file);
      input.value = '';
      await loadMedia();
    } catch (error) {
      showError(error.message, 'adminMediaError');
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = '上传媒体';
    }
  });

  function whenAuthReady(cb) {
    if (window.Auth) { cb(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.Auth || tries > 30) { clearInterval(timer); cb(); }
    }, 100);
  }

  whenAuthReady(function () {
    Auth.user().then(async function (user) {
      if (!user) {
        show(unauthorized);
        return;
      }
      try {
        adminProfile = await Admin.profile();
        if (!adminProfile || adminProfile.role !== 'superadmin' || adminProfile.account_status !== 'active') {
          show(unauthorized);
          return;
        }
        var meta = user.user_metadata || {};
        var ghName = meta.user_name || meta.preferred_username || '';
        var name = ghName || adminProfile.github_username || adminProfile.display_name || user.email;
        var avatar = adminProfile.avatar_url || adminProfile.github_avatar_url || meta.avatar_url || '';
        var nameEl = document.getElementById('adminUserName');
        var emailEl = document.getElementById('adminUserEmail');
        var avatarEl = document.getElementById('adminUserAvatar');
        var roleEl = document.getElementById('adminRole');
        if (nameEl) nameEl.textContent = name;
        if (emailEl) emailEl.textContent = user.email;
        if (avatarEl && avatar) avatarEl.src = avatar;
        if (roleEl) roleEl.textContent = String(adminProfile.role || 'user').toUpperCase();
        var logoutBtn = document.getElementById('adminLogoutBtn');
        var drawerLogout = document.getElementById('adminDrawerLogout');
        var doLogout = function () {
          Auth.signOut().then(function () { window.location.reload(); });
        };
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
        if (drawerLogout) drawerLogout.addEventListener('click', doLogout);
        await loadDashboard();
        updateGhAuthStatus();
      } catch (error) {
        showError(errorText(error));
        show(content);
      }
    }).catch(function () {
      show(unauthorized);
    });
  });
})();
