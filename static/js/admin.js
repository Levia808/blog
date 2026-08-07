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

  function renderStats(stats, mediaCount) {
    document.getElementById('adminUserCount').textContent = stats.totalUsers;
    document.getElementById('adminActiveUserCount').textContent = stats.activeUsers;
    document.getElementById('adminCommentCount').textContent = stats.totalComments;
    document.getElementById('adminPendingCommentCount').textContent = stats.pendingComments;
    document.getElementById('adminReportCount').textContent = stats.openReports;
    document.getElementById('adminMediaCount').textContent = mediaCount;
  }

  function renderContent(items) {
    var table = document.getElementById('adminContentTable');
    if (!items.length) {
      table.innerHTML = '<tr><td colspan="4" class="admin-empty">暂无内容记录。文章通过编辑器写入 Hugo 仓库后，可在这里登记审核状态。</td></tr>';
      return;
    }
    table.innerHTML = items.map(function (item) {
      return '<tr><td>' + escapeHtml(item.title) + '</td><td><code>' + escapeHtml(item.post_path) + '</code></td><td><span class="admin-status admin-status-' + escapeHtml(item.status) + '">' + escapeHtml(item.status) + '</span></td><td>' + formatDate(item.updated_at) + '</td></tr>';
    }).join('');
  }

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
        '<td><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(user.username || '') + '</small></td>' +
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
        '<td class="admin-comment-cell">' + escapeHtml(excerpt) + '</td>' +
        '<td><code>' + escapeHtml(comment.post_path) + '</code></td>' +
        '<td>' + escapeHtml(author) + '</td>' +
        '<td><span class="admin-status admin-status-' + escapeHtml(comment.moderation_status) + '">' + escapeHtml(comment.moderation_status) + '</span></td>' +
        '<td>' + formatDate(comment.created_at) + '</td>' +
        '<td><div class="admin-action-group">' +
          '<button type="button" class="admin-row-action" data-comment-action="approved" data-comment-id="' + comment.id + '">通过</button>' +
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
      Admin.getContent().catch(function (error) { showError(error.message); return []; }),
      Admin.getComments().catch(function (error) { showError(error.message); return []; }),
      Admin.getMedia().catch(function (error) { showError(error.message); return []; })
    ]);
    renderStats(results[0] || {
      totalUsers: '—',
      activeUsers: '—',
      totalComments: '—',
      pendingComments: '—',
      openReports: '—'
    }, results[4].length);
    renderUsers(results[1]);
    renderContent(results[2]);
    renderComments(results[3]);
    renderMedia(results[4]);
    document.getElementById('adminIdentity').textContent = (adminProfile.display_name || adminProfile.username || '管理员') + ' · ' + adminProfile.role;
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
        if (refresh.dataset.adminRefresh === 'users') await loadUsers();
        if (refresh.dataset.adminRefresh === 'comments') await loadComments();
        if (refresh.dataset.adminRefresh === 'media') {
          var count = await loadMedia();
          document.getElementById('adminMediaCount').textContent = count;
        }
      } catch (error) {
        showError(error.message);
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
        var count = await Admin.getMedia();
        document.getElementById('adminMediaCount').textContent = count.length;
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
      var count = await loadMedia();
      document.getElementById('adminMediaCount').textContent = count;
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
        await loadDashboard();
      } catch (error) {
        showError(error.message);
        show(content);
      }
    }).catch(function () {
      show(unauthorized);
    });
  });
})();
