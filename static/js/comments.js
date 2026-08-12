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
    var isAdmin = false;
    var commentsCache = [];

    function showNotice(message, type) {
      notice.hidden = !message;
      notice.className = 'comments-notice' + (type ? ' is-' + type : '');
      notice.textContent = message || '';
    }

    /* ── 树状渲染 (复用动态评论区结构与样式: moment-comment + mc-replies) ── */
    function avatarHtml(p) {
      var name = (p && (p.display_name || p.username)) || '?';
      if (p && p.avatar_url) {
        return '<img class="mc-avatar" src="' + escapeHtml(p.avatar_url) + '" alt="" loading="lazy" decoding="async">';
      }
      return '<span class="mc-avatar mc-avatar-fallback">' + escapeHtml(name.slice(0, 1)) + '</span>';
    }

    function commentActions(c) {
      var mine = currentUserId === c.user_id;
      var canManage = mine || isAdmin;
      var actions = '<button type="button" class="mcc-act" data-cmt-reply="' + c.id + '">回复</button>';
      if (canManage) {
        actions += '<button type="button" class="mcc-act" data-cmt-edit="' + c.id + '">编辑</button>' +
          '<button type="button" class="mcc-act is-danger" data-cmt-delete="' + c.id + '">删除</button>';
      } else {
        actions += '<button type="button" class="mcc-act" data-cmt-report="' + c.id + '">举报</button>';
      }
      return '<div class="mcc-actions">' + actions + '</div>';
    }

    function renderComment(c, byParent) {
      var p = c.profiles || {};
      var name = p.display_name || p.username || '博客读者';
      var kids = (byParent[c.id] || []).map(function (k) { return renderComment(k, byParent); }).join('');
      return '<div class="moment-comment" data-cmt-node="' + c.id + '">' +
        avatarHtml(p) +
        '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
        '<span class="mcc-text">' + renderMarkdown(c.content) + '</span>' +
        '<div class="mcc-time">' + formatDate(c.created_at) + '</div>' +
        commentActions(c) +
        (kids ? '<div class="mc-replies">' + kids + '</div>' : '') +
        '</div></div>';
    }

    function renderList(comments) {
      commentsCache = comments;
      count.textContent = comments.length;
      if (!comments.length) {
        list.innerHTML = '<div class="comments-empty"><span>—</span><p>还没有评论，来留下第一条。</p></div>';
        return;
      }
      var byParent = {};
      var tops = [];
      comments.forEach(function (c) {
        if (c.parent_id) { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); }
        else tops.push(c);
      });
      list.innerHTML = tops.map(function (c) { return renderComment(c, byParent); }).join('');
      list.classList.remove('is-updated');
      window.requestAnimationFrame(function () { list.classList.add('is-updated'); });
    }

    /* ── 平滑出场: 删除时先收拢动画再移除 ── */
    function animateRemove(node) {
      if (!node) return;
      node.classList.add('mc-leave');
      setTimeout(function () {
        node.remove();
        /* 空子树容器清理 */
        var parent = node.parentNode;
        if (parent && parent.classList.contains('mc-replies') && !parent.children.length) parent.remove();
      }, 360);
    }

    /* ── 内联回复输入条 (复用动态评论区模式: 展开/发送/取消/Esc/外部收起) ── */
    function closeReplyBars(except) {
      list.querySelectorAll('.mc-reply-bar-wrap').forEach(function (wrap) {
        if (wrap !== except && !wrap.dataset.closing) {
          wrap.dataset.closing = '1';
          wrap.classList.add('closing');
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 400);
        }
      });
    }

    function openReplyBar(btn) {
      var comment = btn.closest('.moment-comment');
      var parentId = Number(btn.dataset.cmtReply);
      if (!comment) return;
      closeReplyBars();
      var body = comment.querySelector('.mcc-body');
      var existing = body && body.querySelector(':scope > .mc-reply-bar-wrap');
      if (existing) {
        delete existing.dataset.closing;
        existing.classList.remove('closing');
        var inp0 = existing.querySelector('input');
        if (inp0) inp0.focus();
        return;
      }
      var author = comment.querySelector('.mcc-author');
      var authorName = author ? author.textContent.trim() : '对方';
      var wrap = document.createElement('div');
      wrap.className = 'mc-reply-bar-wrap';
      wrap.innerHTML =
        '<div class="mc-reply-bar">' +
          '<input type="text" maxlength="2000" placeholder="回复 @' + escapeHtml(authorName) + '…" autocomplete="off">' +
          '<button type="button" class="rbar-send" data-cmt-reply-send="' + parentId + '">回复</button>' +
          '<button type="button" class="rbar-cancel" aria-label="取消">×</button>' +
        '</div>';
      var replies = body && body.querySelector(':scope > .mc-replies');
      if (body) {
        if (replies) body.insertBefore(wrap, replies);
        else body.appendChild(wrap);
      }
      var input = wrap.querySelector('input');
      if (input) {
        input.focus();
        try { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }
    }

    function submitReply(wrap) {
      var rInput = wrap && wrap.querySelector('input');
      var text = rInput ? rInput.value.trim() : '';
      var parentId = wrap.querySelector('[data-cmt-reply-send]');
      if (!text || !parentId) return;
      var sendBtn = parentId;
      sendBtn.disabled = true;
      window.CommentService.create(path, text, Number(sendBtn.dataset.cmtReplySend))
        .then(function (comment) {
          /* 树状插入: 挂入父评论子树 */
          var parentNode = list.querySelector('[data-cmt-node="' + sendBtn.dataset.cmtReplySend + '"]');
          if (parentNode) {
            var body = parentNode.querySelector('.mcc-body');
            var replies = body && body.querySelector(':scope > .mc-replies');
            if (!replies) {
              replies = document.createElement('div');
              replies.className = 'mc-replies';
              if (body) body.appendChild(replies);
            }
            var p = comment.profiles || {};
            var name = p.display_name || p.username || '博客读者';
            var node = document.createElement('div');
            node.className = 'moment-comment mc-new';
            node.dataset.cmtNode = comment.id;
            node.innerHTML = avatarHtml(p) +
              '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
              '<span class="mcc-text">' + renderMarkdown(comment.content) + '</span>' +
              '<div class="mcc-time">刚刚</div>' + commentActions(comment) + '</div>';
            if (replies) replies.appendChild(node);
            count.textContent = (parseInt(count.textContent, 10) || 0) + 1;
          }
          closeReplyBars(wrap);
          showNotice('回复已发布。', 'success');
        })
        .catch(function (error) {
          showNotice(error.message || '回复失败，请稍后重试。', 'error');
        })
        .finally(function () { sendBtn.disabled = false; });
    }

    /* ── 行内编辑: 文本区替换为 textarea ── */
    function openEdit(node, commentId) {
      var textEl = node.querySelector('.mcc-text');
      if (!textEl || node.querySelector('.mc-edit-box')) return;
      var original = commentsCache.filter(function (c) { return c.id === commentId; })[0];
      var content = original ? original.content : textEl.textContent;
      var box = document.createElement('div');
      box.className = 'mc-edit-box';
      box.innerHTML =
        '<textarea rows="3" maxlength="2000">' + escapeHtml(content) + '</textarea>' +
        '<div class="mc-edit-actions">' +
          '<button type="button" class="rbar-send" data-cmt-edit-save="' + commentId + '">保存</button>' +
          '<button type="button" class="rbar-cancel" data-cmt-edit-cancel>取消</button>' +
        '</div>';
      textEl.replaceWith(box);
      var ta = box.querySelector('textarea');
      if (ta) ta.focus();
    }

    function saveEdit(box, commentId) {
      var ta = box.querySelector('textarea');
      var text = ta ? ta.value.trim() : '';
      if (!text) return;
      var saveBtn = box.querySelector('[data-cmt-edit-save]');
      saveBtn.disabled = true;
      window.CommentService.update(commentId, text)
        .then(function (updated) {
          var textEl = document.createElement('span');
          textEl.className = 'mcc-text';
          textEl.innerHTML = renderMarkdown((updated && updated.content) || text);
          box.replaceWith(textEl);
          showNotice('评论已更新。', 'success');
        })
        .catch(function (error) {
          showNotice(error.message || '更新失败，请稍后重试。', 'error');
        })
        .finally(function () { saveBtn.disabled = false; });
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
      isAdmin = false;
      if (user) {
        try {
          var profile = await window.Profile.get(user.id);
          isAdmin = profile && (profile.role === 'superadmin' || profile.role === 'admin');
        } catch (e) { isAdmin = false; }
      }
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

    /* 委托: 回复/编辑/删除/举报 + 回复条 */
    list.addEventListener('click', async function (event) {
      var replyBtn = event.target.closest('[data-cmt-reply]');
      if (replyBtn) {
        if (!currentUserId) { if (window.BlogAuth) window.BlogAuth.open('login'); return; }
        openReplyBar(replyBtn);
        return;
      }
      var replySend = event.target.closest('[data-cmt-reply-send]');
      if (replySend) { submitReply(replySend.closest('.mc-reply-bar-wrap')); return; }
      var replyCancel = event.target.closest('.rbar-cancel');
      if (replyCancel) {
        var wrap = replyCancel.closest('.mc-reply-bar-wrap');
        if (wrap) {
          wrap.classList.add('closing');
          wrap.dataset.closing = '1';
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 400);
        }
        return;
      }
      var editBtn = event.target.closest('[data-cmt-edit]');
      if (editBtn) {
        var node = editBtn.closest('.moment-comment');
        if (node) openEdit(node, Number(editBtn.dataset.cmtEdit));
        return;
      }
      var editSave = event.target.closest('[data-cmt-edit-save]');
      if (editSave) { saveEdit(editSave.closest('.mc-edit-box'), Number(editSave.dataset.cmtEditSave)); return; }
      var editCancel = event.target.closest('[data-cmt-edit-cancel]');
      if (editCancel) {
        var box = editCancel.closest('.mc-edit-box');
        var commentId = box && box.querySelector('[data-cmt-edit-save]');
        if (box && commentId) {
          var original = commentsCache.filter(function (c) { return c.id === Number(commentId.dataset.cmtEditSave); })[0];
          var textEl = document.createElement('span');
          textEl.className = 'mcc-text';
          textEl.innerHTML = original ? renderMarkdown(original.content) : '';
          box.replaceWith(textEl);
        }
        return;
      }
      var deleteBtn = event.target.closest('[data-cmt-delete]');
      if (deleteBtn) {
        var confirmFn = (window.Admin && window.Admin.confirmDialog) || function (opts) {
          return Promise.resolve(window.confirm(opts && opts.message));
        };
        confirmFn({
          title: '[ 删除评论 ]',
          message: '确认删除这条评论？此操作不可恢复。',
          confirmText: '删除',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          var delNode = deleteBtn.closest('.moment-comment');
          window.CommentService.remove(Number(deleteBtn.dataset.cmtDelete))
            .then(function () {
              animateRemove(delNode);
              count.textContent = Math.max(0, (parseInt(count.textContent, 10) || 0) - 1);
              showNotice('评论已删除。', 'success');
            })
            .catch(function (error) {
              showNotice(error.message || '删除失败，请稍后重试。', 'error');
            });
        });
        return;
      }
      var reportBtn = event.target.closest('[data-cmt-report]');
      if (reportBtn) {
        var reason = window.prompt('请简要说明举报原因：');
        if (!reason || !reason.trim()) return;
        try {
          reportBtn.disabled = true;
          await window.CommentService.report(Number(reportBtn.dataset.cmtReport), reason.trim());
          showNotice('举报已提交，感谢你的反馈。', 'success');
        } catch (error) {
          showNotice(error.message || '举报失败，请稍后重试。', 'error');
        } finally {
          reportBtn.disabled = false;
        }
      }
    });

    /* 回复条收起: Esc + 点击外部 */
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var wrap = e.target.closest('.mc-reply-bar-wrap');
      if (wrap) {
        wrap.classList.add('closing');
        wrap.dataset.closing = '1';
        setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 400);
      }
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('.mc-reply-bar-wrap') || e.target.closest('[data-cmt-reply]')) return;
      closeReplyBars(null);
    }, true);

    root.classList.add('is-ready');
    updateCharCount();
    syncAuth();
    if (window.Auth.onAuthChange) window.Auth.onAuthChange(syncAuth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
