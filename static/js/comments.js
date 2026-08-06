(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function renderMarkdown(value) {
    var html = escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    return html.split(/\n{2,}/).map(function (block) {
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
  }

  function boot() {
    var root = document.querySelector('.native-comments');
    if (!root) return;
    if (!window.CommentService || !window.Auth) {
      root.hidden = true;
      return;
    }

    var path = root.dataset.postPath;
    var form = document.getElementById('commentForm');
    var authWall = document.getElementById('commentsAuthWall');
    var input = document.getElementById('commentInput');
    var preview = document.getElementById('commentPreview');
    var list = document.getElementById('commentsList');
    var notice = document.getElementById('commentsNotice');
    var count = document.getElementById('commentsCount');
    var charCount = document.getElementById('commentCharCount');
    var submit = document.getElementById('commentSubmit');
    var activeTab = 'write';
    var currentUserId = null;

    function showNotice(message, type) {
      notice.hidden = !message;
      notice.className = 'comments-notice' + (type ? ' is-' + type : '');
      notice.textContent = message || '';
    }

    function renderList(comments) {
      count.textContent = comments.length;
      if (!comments.length) {
        list.innerHTML = '<div class="comments-empty"><span>—</span><p>还没有评论，来留下第一条。</p></div>';
        return;
      }
      list.innerHTML = comments.map(function (comment) {
        var profile = comment.profiles || {};
        var name = profile.display_name || profile.username || '博客读者';
        var avatar = profile.avatar_url || '';
        return '<article class="comment-card">' +
          '<div class="comment-card-head">' +
            (avatar ? '<img class="comment-avatar" src="' + escapeHtml(avatar) + '" alt="" loading="lazy">' : '<span class="comment-avatar comment-avatar-fallback">' + escapeHtml(name.slice(0, 1)) + '</span>') +
            '<div><strong>' + escapeHtml(name) + '</strong><time datetime="' + escapeHtml(comment.created_at) + '">' + formatDate(comment.created_at) + '</time></div>' +
          '</div>' +
          '<div class="comment-body">' + renderMarkdown(comment.content) + '</div>' +
          '<div class="comment-card-actions">' +
            (currentUserId === comment.user_id ? '<button type="button" class="comment-action" data-comment-delete="' + comment.id + '">删除</button>' : '<button type="button" class="comment-action" data-comment-report="' + comment.id + '">举报</button>') +
          '</div>' +
        '</article>';
      }).join('');
      list.classList.remove('is-updated');
      window.requestAnimationFrame(function () { list.classList.add('is-updated'); });
    }

    async function loadComments() {
      try {
        renderList(await window.CommentService.list(path));
      } catch (error) {
        renderList([]);
        showNotice('评论暂时无法加载，请确认 Supabase comments 表和 RLS 已执行。', 'error');
      }
    }

    function setEditorMode(mode) {
      activeTab = mode;
      document.querySelectorAll('[data-editor-tab]').forEach(function (tab) {
        var active = tab.dataset.editorTab === mode;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      preview.hidden = mode !== 'preview';
      input.hidden = mode === 'preview';
      if (mode === 'preview') preview.innerHTML = input.value.trim() ? renderMarkdown(input.value) : '<p class="comment-preview-empty">还没有可预览的内容。</p>';
    }

    function updateCharCount() {
      charCount.textContent = input.value.length + ' / 2000';
    }

    async function syncAuth() {
      var user = await window.Auth.user().catch(function () { return null; });
      currentUserId = user ? user.id : null;
      form.hidden = !user;
      authWall.hidden = Boolean(user);
      loadComments();
    }

    document.querySelectorAll('[data-editor-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { setEditorMode(tab.dataset.editorTab); });
    });
    input.addEventListener('input', updateCharCount);
    document.querySelector('[data-comment-login]').addEventListener('click', function () {
      if (window.BlogAuth && typeof window.BlogAuth.open === 'function') window.BlogAuth.open('login');
    });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var content = input.value.trim();
      if (!content || submit.disabled) return;
      submit.disabled = true;
      submit.textContent = '发送中…';
      showNotice('', '');
      try {
        await window.CommentService.create(path, content);
        input.value = '';
        updateCharCount();
        setEditorMode('write');
        showNotice('评论已发布。', 'success');
        await loadComments();
      } catch (error) {
        showNotice(error.message || '发送失败，请稍后重试。', 'error');
      } finally {
        submit.disabled = false;
        submit.textContent = '发送评论';
      }
    });

    list.addEventListener('click', async function (event) {
      var reportButton = event.target.closest('[data-comment-report]');
      var deleteButton = event.target.closest('[data-comment-delete]');
      if (reportButton) {
        var reason = window.prompt('请简要说明举报原因：');
        if (!reason || !reason.trim()) return;
        try {
          reportButton.disabled = true;
          await window.CommentService.report(Number(reportButton.dataset.commentReport), reason.trim());
          showNotice('举报已提交，感谢你的反馈。', 'success');
        } catch (error) {
          showNotice(error.message || '举报失败，请稍后重试。', 'error');
        } finally {
          reportButton.disabled = false;
        }
      }
      if (deleteButton) {
        if (!window.confirm('确认删除这条评论？')) return;
        try {
          deleteButton.disabled = true;
          await window.CommentService.remove(Number(deleteButton.dataset.commentDelete));
          await loadComments();
        } catch (error) {
          showNotice(error.message || '删除失败，请稍后重试。', 'error');
        }
      }
    });

    root.classList.add('is-ready');
    updateCharCount();
    syncAuth();
    if (window.Auth.onAuthChange) window.Auth.onAuthChange(syncAuth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
