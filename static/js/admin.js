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

  function showError(message, targetId) {
    var target = document.getElementById(targetId || 'adminError');
    if (!target) return;
    target.textContent = message || '操作失败，请稍后重试。';
    target.hidden = false;
  }

  function clearError(targetId) {
    var target = document.getElementById(targetId || 'adminError');
    if (target) {
      target.hidden = true;
      target.textContent = '';
    }
  }

  /* ── 面板切换 ── */
  var sections = ['dashboard', 'posts', 'comments', 'users', 'media', 'settings'];

  function switchSection(name) {
    sections.forEach(function (section) {
      var panel = document.querySelector('[data-admin-panel="' + section + '"]');
      if (panel) panel.hidden = section !== name;
      var link = document.querySelector('[data-admin-section="' + section + '"]');
      if (link) link.classList.toggle('active', section === name);
    });
  }

  document.querySelectorAll('[data-admin-section]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      switchSection(link.dataset.adminSection);
    });
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
      posts: stats.publishedContent,
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
    var meta = { title: '', draft: true, date: '' };
    var m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return meta;
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (!kv) return;
      var key = kv[1];
      var value = kv[2].trim();
      if (key === 'title') meta.title = value.replace(/^['"]|['"]$/g, '');
      else if (key === 'draft') meta.draft = value !== 'false';
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
        posts.push({ name: file.name, sha: file.sha, title: meta.title || file.name, draft: meta.draft, date: meta.date });
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
      table.innerHTML = '<tr><td colspan="4" class="admin-empty">暂无文章。点击 + New Post 创建。</td></tr>';
      return;
    }
    table.innerHTML = posts.map(function (post) {
      var status = post.draft
        ? '<span class="admin-status"><span class="status-dot status-draft"></span>draft</span>'
        : '<span class="admin-status"><span class="status-dot status-published"></span>published</span>';
      var date = post.date ? post.date.slice(0, 10) : '—';
      var actions = showActions
        ? '<div class="admin-action-group">' +
          (post.draft
            ? '<button type="button" class="admin-row-action is-primary" data-post-publish="' + escapeHtml(post.name) + '">发布</button>'
            : '<button type="button" class="admin-row-action" data-post-draft="' + escapeHtml(post.name) + '">转草稿</button>') +
          '<a class="admin-row-action" href="admin-cms/">编辑</a>' +
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
    var posts = await loadGhPosts();
    renderPostRows(posts.slice(0, 8), 'adminPostTable', true);
    document.getElementById('adminPostHint').textContent = 'showing ' + Math.min(8, posts.length) + ' of ' + posts.length + ' posts';
    renderPostRows(posts, 'adminPublishTable', true);
    document.getElementById('adminPublishHint').textContent = 'showing ' + posts.length + ' of ' + posts.length + ' posts';
  }

  async function setPostPublished(name, published) {
    var post = ghPostsCache.find(function (p) { return p.name === name; });
    if (!post) throw new Error('未找到文章 ' + name);
    var raw = await fetch('https://raw.githubusercontent.com/' + GH_REPO + '/main/content/posts/' + encodeURIComponent(name))
      .then(function (r) { return r.text(); });
    var updated = setDraft(raw, !published);
    var path = 'content/posts/' + name;
    var message = published ? 'publish: ' + post.title : 'draft: ' + post.title;
    await ghFetch('/repos/' + GH_REPO + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, content: base64Encode(updated), sha: post.sha })
    });
    await refreshPosts();
  }

  function updateGhAuthStatus() {
    var authorized = Boolean(getGhToken());
    var statusEl = document.getElementById('ghAuthStatus');
    if (statusEl) statusEl.textContent = authorized ? '已授权' : '未授权';
    var authBtn = document.getElementById('ghAuthBtn');
    if (authBtn) authBtn.textContent = authorized ? '重新授权' : 'GitHub 授权发布';
    if (authorized) {
      refreshPosts().catch(function (error) { showError(error.message); });
    }
  }

  function authorizeGitHub() {
    var state = Date.now().toString(36) + Math.random().toString(36).slice(2);
    var url = GH_OAUTH_URL + '/auth?provider=github&scope=repo&state=' + state;
    var popup = window.open(url, 'sveltia_oauth', 'width=560,height=720');
    if (!popup) {
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
      if (state === 'success' && data.token) {
        window.__ghAuthResolve && window.__ghAuthResolve(data.token);
        showError('');
      } else if (data.error) {
        showError(data.error);
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
      table.innerHTML = '<tr><td colspan="6" class="admin-empty">暂无用户数据</td></tr>';
      return;
    }
    table.innerHTML = users.map(function (user) {
      var avatar = user.avatar_url || '';
      var name = user.display_name || user.username || '—';
      var canChangeRole = adminProfile && adminProfile.role === 'superadmin';
      var roleControl = canChangeRole
        ? '<select class="admin-row-select" data-user-role="' + escapeHtml(user.id) + '">' +
          ['user', 'author', 'admin', 'superadmin'].map(function (role) {
            return '<option value="' + role + '"' + (user.role === role ? ' selected' : '') + '>' + role + '</option>';
          }).join('') + '</select>'
        : '<span class="admin-role">' + escapeHtml(user.role) + '</span>';
      var statusControl = '<select class="admin-row-select" data-user-status="' + escapeHtml(user.id) + '">' +
        ['active', 'suspended', 'deleted'].map(function (status) {
          return '<option value="' + status + '"' + (user.account_status === status ? ' selected' : '') + '>' + status + '</option>';
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
      table.innerHTML = '<tr><td colspan="6" class="admin-empty">暂无评论记录</td></tr>';
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

  function renderMedia(assets) {
    var grid = document.getElementById('adminMediaGrid');
    if (!assets.length) {
      grid.innerHTML = '<div class="admin-empty">媒体库为空</div>';
      return;
    }
    grid.innerHTML = assets.map(function (asset) {
      var preview;
      if (/^image\//i.test(asset.mime_type)) {
        preview = '<img src="' + escapeHtml(asset.public_url) + '" alt="' + escapeHtml(asset.file_name) + '" loading="lazy">';
      } else if (/^video\//i.test(asset.mime_type)) {
        preview = '<video src="' + escapeHtml(asset.public_url) + '" controls preload="metadata"></video>';
      } else {
        preview = '<div class="admin-media-audio">AUDIO</div>';
      }
      return '<article class="admin-media-item">' + preview +
        '<div class="admin-media-meta"><strong title="' + escapeHtml(asset.file_name) + '">' + escapeHtml(asset.file_name) + '</strong>' +
        '<small>' + escapeHtml(asset.mime_type) + ' · ' + Math.ceil(asset.size_bytes / 1024) + ' KB</small>' +
        '<div class="admin-action-group"><a class="admin-row-action" href="' + escapeHtml(asset.public_url) + '" target="_blank" rel="noopener">打开</a><button type="button" class="admin-row-action is-danger" data-media-delete="' + escapeHtml(asset.id) + '">删除</button></div></div></article>';
    }).join('');
  }

  async function loadUsers() {
    renderUsers(await Admin.getAllUsers());
  }

  async function loadComments() {
    var filter = document.getElementById('adminCommentFilter').value || null;
    renderComments(await Admin.getComments(filter));
  }

  async function loadMedia() {
    var assets = await Admin.getMedia();
    renderMedia(assets);
    return assets.length;
  }

  async function loadDashboard() {
    clearError();
    var results = await Promise.all([
      Admin.getStats().catch(function (error) { showError(error.message); return null; }),
      Admin.getAllUsers().catch(function (error) { showError(error.message); return []; }),
      Admin.getComments().catch(function (error) { showError(error.message); return []; }),
      Admin.getMedia().catch(function (error) { showError(error.message); return []; })
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
      try { await loadComments(); } catch (error) { showError(error.message); }
    }
  });

  document.addEventListener('click', async function (event) {
    var refresh = event.target.closest('[data-admin-refresh]');
    if (refresh) {
      try {
        if (refresh.dataset.adminRefresh === 'stats') await loadStats();
        if (refresh.dataset.adminRefresh === 'users') await loadUsers();
        if (refresh.dataset.adminRefresh === 'comments') await loadComments();
        if (refresh.dataset.adminRefresh === 'media') {
          var count = await loadMedia();
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    var publishBtn = event.target.closest('[data-post-publish]');
    if (publishBtn) {
      try {
        publishBtn.disabled = true;
        await setPostPublished(publishBtn.dataset.postPublish, true);
      } catch (error) {
        showError(error.message || '发布失败，请确认已授权 GitHub。');
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
        showError(error.message || '操作失败。');
      } finally {
        draftBtn.disabled = false;
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
        showError(error.message);
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
        showError(error.message);
      } finally {
        moderationButton.disabled = false;
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
        showError(error.message);
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
        if (logoutBtn) logoutBtn.addEventListener('click', function () {
          Auth.signOut().then(function () { window.location.reload(); });
        });
        await loadDashboard();
        updateGhAuthStatus();
      } catch (error) {
        showError(error.message);
        show(content);
      }
    }).catch(function () {
      show(unauthorized);
    });
  });
})();
