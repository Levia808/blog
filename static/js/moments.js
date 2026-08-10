(function () {
  'use strict';

  var root = document.querySelector('.moments-wrap');
  if (!root) return;

  var composer = document.getElementById('momentsComposer');
  var loginWall = document.getElementById('momentsLoginWall');
  var listEl = document.getElementById('momentsList');
  var hintEl = document.getElementById('momentsHint');
  var mcInput = document.getElementById('mcInput');
  var mcMediaList = document.getElementById('mcMediaList');
  var mcFileInput = document.getElementById('mcFileInput');
  var mcPublishBtn = document.getElementById('mcPublishBtn');
  var mcCancelBtn = document.getElementById('mcCancelBtn');
  var mcError = document.getElementById('mcError');
  var selectedMedia = [];
  var currentUser = null;
  var currentProfile = null;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  function renderMarkdown(value) {
    var html = escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return html.split(/\n{2,}/).map(function (block) {
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  var noticeTimer = null;
  function flashNotice(text, tone) {
    hintEl.hidden = false;
    hintEl.textContent = text;
    hintEl.style.color = tone === 'success' ? 'var(--accent)' : 'var(--danger)';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      hintEl.hidden = true;
      hintEl.textContent = '';
      hintEl.style.color = '';
    }, 3000);
  }

  /* ── 开源动画: Anime.js 点赞 heart-burst + 粒子迸发 (Twitter 风格) ── */
  function likeBurst(btn) {
    if (!window.anime) return;
    var icon = btn.querySelector('.heart-icon');
    if (icon) {
      anime({
        targets: icon,
        scale: [1, 1.7, 0.85, 1.25, 1],
        rotate: [0, -12, 8, 0],
        duration: 620,
        easing: 'easeOutCubic'
      });
    }
    var rect = btn.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    for (var i = 0; i < 7; i++) {
      var dot = document.createElement('span');
      dot.className = 'like-particle';
      dot.style.left = cx + 'px';
      dot.style.top = cy + 'px';
      document.body.appendChild(dot);
      var angle = (Math.PI * 2 / 7) * i + Math.random() * 0.6;
      var dist = 24 + Math.random() * 16;
      anime({
        targets: dot,
        translateX: Math.cos(angle) * dist,
        translateY: Math.sin(angle) * dist,
        scale: [1, 0.15],
        opacity: [1, 0],
        duration: 560,
        easing: 'easeOutCubic',
        complete: function () { dot.remove(); }
      });
    }
  }

  function animateIn(el) {
    if (!window.anime) { el.classList.add('animate__animated', 'animate__fadeInUp'); return; }
    anime({
      targets: el,
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 280,
      easing: 'easeOutCubic'
    });
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function avatarHtml(profile, cls, fallbackCls) {
    var name = (profile && (profile.display_name || profile.username)) || '?';
    if (profile && profile.avatar_url) {
      return '<img class="' + cls + '" src="' + escapeHtml(profile.avatar_url) + '" alt="" loading="lazy">';
    }
    return '<span class="' + cls + ' ' + fallbackCls + '">' + escapeHtml(name.slice(0, 1)) + '</span>';
  }

  function renderMedia(media, single) {
    if (!media || !media.length) return '';
    var cls = single ? 'moment-media single' : 'moment-media';
    return '<div class="' + cls + '">' + media.map(function (url) {
      var ext = String(url).split('.').pop().toLowerCase();
      if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext)) {
        return '<video src="' + escapeHtml(url) + '" controls preload="metadata"></video>';
      }
      return '<img src="' + escapeHtml(url) + '" alt="" loading="lazy">';
    }).join('') + '</div>';
  }

  function commentActions(c, momentId) {
    var liked = false;
    if (currentUser && Array.isArray(c.moment_comment_likes)) {
      liked = c.moment_comment_likes.some(function (l) { return l.user_id === currentUser.id; });
    }
    var likeCount = (c.moment_comment_likes && c.moment_comment_likes.length) || 0;
    var isMine = currentUser && currentUser.id === c.user_id;
    var isAdmin = currentProfile && currentProfile.role === 'superadmin';
    return '<div class="mcc-actions">' +
      '<button type="button" class="mcc-act' + (liked ? ' is-liked' : '') + '" data-cmt-like="' + c.id + '" data-cmt-moment="' + momentId + '">' +
      (liked ? '已赞' : '赞') + ' <span class="ma-count">' + likeCount + '</span></button>' +
      '<button type="button" class="mcc-act" data-cmt-reply="' + c.id + '" data-cmt-moment="' + momentId + '" data-cmt-author="' + escapeHtml(c.profiles ? (c.profiles.display_name || c.profiles.username || '') : '') + '">回复</button>' +
      ((isMine || isAdmin) ? '<button type="button" class="mcc-act is-danger" data-cmt-delete="' + c.id + '" data-cmt-moment="' + momentId + '">删除</button>' : '') +
      '</div>';
  }

  function renderComment(c, momentId, isReply) {
    var p = c.profiles || {};
    var name = p.display_name || p.username || '读者';
    return '<div class="moment-comment' + (isReply ? ' is-reply' : '') + '">' +
      avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
      '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
      '<span class="mcc-text">' + escapeHtml(c.content) + '</span>' +
      '<div class="mcc-time">' + fmtTime(c.created_at) + '</div>' +
      commentActions(c, momentId) +
      '</div></div>';
  }

  function renderComments(moment) {
    var all = moment.moment_comments || [];
    if (!all.length) return '';
    var tops = all.filter(function (c) { return !c.parent_id; });
    var byParent = {};
    all.forEach(function (c) { if (c.parent_id) { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); } });
    var html = '<div class="moment-comments">';
    tops.forEach(function (c) {
      html += renderComment(c, moment.id, false);
      (byParent[c.id] || []).forEach(function (r) { html += renderComment(r, moment.id, true); });
    });
    html += '</div>';
    return html;
  }

  function canManageMoment(moment) {
    if (!currentUser || !moment) return false;
    return currentUser.id === moment.user_id || (currentProfile && currentProfile.role === 'superadmin');
  }

  function renderMoment(moment) {
    var p = moment.profiles || {};
    var name = p.display_name || p.username || '博客读者';
    var liked = false;
    if (currentUser && Array.isArray(moment.moment_likes)) {
      liked = moment.moment_likes.some(function (l) { return l.user_id === currentUser.id; });
    }
    var likeCount = (moment.moment_likes && moment.moment_likes.length) || 0;
    var commentCount = (moment.moment_comments && moment.moment_comments.length) || 0;
    var canManage = canManageMoment(moment);
    return '<article class="moment-card" data-moment-id="' + moment.id + '">' +
      '<div class="moment-head">' + avatarHtml(p, 'moment-avatar', 'moment-avatar-fallback') +
      '<div><div class="moment-author">' + escapeHtml(name) + '</div>' +
      '<div class="moment-time">' + fmtTime(moment.created_at) + '</div></div></div>' +
      (moment.content ? '<div class="moment-content">' + renderMarkdown(moment.content) + '</div>' : '') +
      renderMedia(moment.media, (moment.media || []).length === 1) +
      (canManage ? '<div class="moment-edit-panel" data-moment-edit-panel="' + moment.id + '" hidden>' +
      '<textarea class="moment-edit-input" rows="4" maxlength="2000" data-moment-edit-input="' + moment.id + '">' + escapeHtml(moment.content || '') + '</textarea>' +
      '<div class="moment-edit-actions">' +
      '<button type="button" class="moment-action-btn is-primary" data-moment-save="' + moment.id + '">保存</button>' +
      '<button type="button" class="moment-action-btn" data-moment-cancel-edit="' + moment.id + '">取消</button>' +
      '</div><p class="auth-error moment-edit-error" data-moment-edit-error="' + moment.id + '" hidden></p></div>' : '') +
      '<div class="moment-actions">' +
      '<button type="button" class="moment-action-btn' + (liked ? ' is-liked' : '') + '" data-moment-like="' + moment.id + '">' +
      '<svg class="heart-icon" viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M16 29s-13-8.2-13-17.5C3 6.9 6.7 3.5 10.5 3.5c2.3 0 4.5 1.1 5.5 2.9 1-1.8 3.2-2.9 5.5-2.9C25.3 3.5 29 6.9 29 11.5 29 20.8 16 29 16 29z"/></svg>' +
      (liked ? '已赞' : '点赞') + ' <span class="ma-count">' + likeCount + '</span></button>' +
      '<button type="button" class="moment-action-btn" data-moment-toggle-comments="' + moment.id + '">评论 <span class="ma-count">' + commentCount + '</span></button>' +
      (canManage ? '<button type="button" class="moment-action-btn" data-moment-edit="' + moment.id + '">编辑</button>' +
      '<button type="button" class="moment-action-btn is-danger" data-moment-delete="' + moment.id + '">删除</button>' : '') +
      '</div>' +
      '<div class="moment-comments" data-moment-comments="' + moment.id + '">' +
      renderComments(moment) +
      '<div class="moment-comment-input"><input type="text" placeholder="写下你的评论…" data-moment-comment-input="' + moment.id + '">' +
      '<button type="button" data-moment-comment-submit="' + moment.id + '">发送</button></div>' +
      '</div></article>';
  }

  // 查询降级链: 新版表(回复+评论赞) → 无评论赞 → 旧表(无回复) → 无关系(裸表)
  // 兼容未更新 SQL 的数据库 (外层关系缺失返回 400 时逐级降级)
  var commentQueries = [
    'id, content, created_at, user_id, parent_id, profiles(display_name, username, avatar_url), moment_comment_likes(user_id)',
    'id, content, created_at, user_id, parent_id, profiles(display_name, username, avatar_url)',
    'id, content, created_at, user_id, profiles(display_name, username, avatar_url)'
  ];
  var momentQueries = [
    '*, profiles(display_name, username, avatar_url), moment_likes(user_id), moment_comments(%CQ%)',
    '*, profiles(display_name, username, avatar_url), moment_comments(%CQ%)',
    '*, profiles(display_name, username, avatar_url)',
    '*'
  ];

  async function loadMoments() {
    showMomentsLoading(true);
    try {
      var result = null;
      var lastError = null;
      for (var mi = 0; mi < momentQueries.length && !result; mi++) {
        for (var qi = 0; qi < commentQueries.length; qi++) {
          var sel = momentQueries[mi].replace('%CQ%', commentQueries[qi]);
          if (sel.indexOf('%CQ%') >= 0) break;
          var attempt = await window.blogSupabase
            .from('moments')
            .select(sel)
            .order('created_at', { ascending: false })
            .limit(50);
          if (!attempt.error) { result = attempt; break; }
          lastError = attempt.error;
        }
      }
      if (!result) throw lastError;
      var moments = result.data || [];
      listEl.innerHTML = moments.length
        ? moments.map(renderMoment).join('')
        : '<div class="moments-empty">还没有动态，发布第一条吧。</div>';
      markLongImages();
      if (window.__blogLightbox && typeof window.__blogLightbox.reload === 'function') {
        window.__blogLightbox.reload();
      }
      if (window.anime && moments.length) {
        anime({
          targets: listEl.querySelectorAll('.moment-card'),
          opacity: [0, 1],
          translateY: [14, 0],
          delay: anime.stagger(45),
          duration: 380,
          easing: 'easeOutCubic'
        });
      }
      hintEl.textContent = moments.length ? '共 ' + moments.length + ' 条动态' : '';
      hintEl.hidden = Boolean(moments.length);
    } catch (error) {
      var msg = error.message || String(error);
      if (msg.indexOf('PGRST205') >= 0 || msg.indexOf('Could not find the table') >= 0) {
        listEl.innerHTML = '<div class="moments-empty"><strong>动态功能未初始化</strong><br>' +
          '<span style="font-size:12px;color:var(--muted);">请在 Supabase SQL Editor 运行仓库中的 <code>supabase-moments.sql</code> 创建动态数据表，然后刷新本页。</span></div>';
      } else {
        listEl.innerHTML = '<div class="moments-empty">动态加载失败：' + escapeHtml(msg) + '</div>';
      }
    } finally {
      showMomentsLoading(false);
    }
  }

  function showComposer(show) {
    composer.hidden = !show;
    if (show) loginWall.hidden = true;
    if (!show) {
      mcInput.value = '';
      selectedMedia = [];
      mcMediaList.innerHTML = '';
      mcError.hidden = true;
    }
  }

  function renderSelectedMedia() {
    mcMediaList.innerHTML = selectedMedia.map(function (item, index) {
      var preview = item.type.startsWith('video')
        ? '<video src="' + escapeHtml(item.url) + '" muted></video>'
        : '<img src="' + escapeHtml(item.url) + '" alt="">';
      return '<div class="mc-media-item">' + preview +
        '<button type="button" class="mm-remove" data-remove-media="' + index + '">×</button></div>';
    }).join('');
  }

  function showMomentsLoading(show) {
    if (show) {
      hintEl.hidden = false;
      hintEl.innerHTML = '<span class="moments-loading"><i></i>LOADING…</span>';
    } else {
      if (hintEl.querySelector('.moments-loading')) {
        hintEl.hidden = true;
        hintEl.innerHTML = '';
        hintEl.style.color = '';
      }
    }
  }

  async function syncAuth() {
    /* 优先读本地 session (纯本地, 无网络往返): 已登录用户刷新页面不闪登录窗 */
    var localUser = null;
    try {
      var session = await window.Auth.session();
      if (session && session.user) localUser = session.user;
    } catch (e) {}
    if (localUser) {
      currentUser = localUser;
      loginWall.hidden = true;
      try {
        currentProfile = await window.Profile.get(currentUser.id);
      } catch (e) { currentProfile = null; }
      var canPublish = currentProfile && (currentProfile.role === 'superadmin' || currentProfile.role === 'author');
      if (canPublish) showComposer(true);
      else composer.hidden = true;
    } else {
      currentUser = null;
      currentProfile = null;
      loginWall.hidden = false;
      composer.hidden = true;
    }
    await loadMoments();
  }

  mcPublishBtn.addEventListener('click', async function () {
    var content = mcInput.value.trim();
    if (!content && !selectedMedia.length) {
      mcError.textContent = '写点什么或添加媒体后再发布。';
      mcError.hidden = false;
      return;
    }
    mcPublishBtn.disabled = true;
    mcPublishBtn.textContent = '发布中…';
    mcError.hidden = true;
    try {
      var media = [];
      for (var i = 0; i < selectedMedia.length; i++) {
        var item = selectedMedia[i];
        if (item.file) {
          var uploaded = await window.Admin.uploadMedia(item.file);
          media.push(uploaded.public_url || uploaded);
        } else {
          media.push(item.url);
        }
      }
      var result = await window.blogSupabase
        .from('moments')
        .insert({ user_id: currentUser.id, content: content, media: media })
        .select();
      if (result.error) throw result.error;
      showComposer(false);
      await loadMoments();
    } catch (error) {
      mcError.textContent = error.message || '发布失败，请重试。';
      mcError.hidden = false;
    } finally {
      mcPublishBtn.disabled = false;
      mcPublishBtn.textContent = '发布';
    }
  });

  mcCancelBtn.addEventListener('click', function () { showComposer(false); });

  mcFileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    files.forEach(function (file) {
      var url = URL.createObjectURL(file);
      selectedMedia.push({ file: file, url: url, type: file.type });
    });
    renderSelectedMedia();
    this.value = '';
  });

  mcMediaList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-remove-media]');
    if (btn) {
      selectedMedia.splice(Number(btn.dataset.removeMedia), 1);
      renderSelectedMedia();
    }
  });

  listEl.addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-moment-edit]');
    if (editBtn) {
      var editId = editBtn.dataset.momentEdit;
      var editCard = listEl.querySelector('[data-moment-id="' + editId + '"]');
      var editPanel = editCard && editCard.querySelector('[data-moment-edit-panel="' + editId + '"]');
      var editInput = editCard && editCard.querySelector('[data-moment-edit-input="' + editId + '"]');
      if (editPanel && editInput) {
        editPanel.hidden = false;
        editInput.focus();
      }
      return;
    }

    var cancelEditBtn = e.target.closest('[data-moment-cancel-edit]');
    if (cancelEditBtn) {
      var cancelId = cancelEditBtn.dataset.momentCancelEdit;
      var cancelCard = listEl.querySelector('[data-moment-id="' + cancelId + '"]');
      var cancelPanel = cancelCard && cancelCard.querySelector('[data-moment-edit-panel="' + cancelId + '"]');
      var cancelError = cancelCard && cancelCard.querySelector('[data-moment-edit-error="' + cancelId + '"]');
      if (cancelPanel) cancelPanel.hidden = true;
      if (cancelError) cancelError.hidden = true;
      return;
    }

    var saveBtn = e.target.closest('[data-moment-save]');
    if (saveBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var saveId = saveBtn.dataset.momentSave;
      var saveCard = listEl.querySelector('[data-moment-id="' + saveId + '"]');
      var saveInput = saveCard && saveCard.querySelector('[data-moment-edit-input="' + saveId + '"]');
      var savePanel = saveCard && saveCard.querySelector('[data-moment-edit-panel="' + saveId + '"]');
      var saveError = saveCard && saveCard.querySelector('[data-moment-edit-error="' + saveId + '"]');
      if (!saveInput || !saveCard) return;
      var nextContent = saveInput.value.trim();
      if (!nextContent && !saveCard.querySelector('.moment-media')) {
        if (saveError) {
          saveError.textContent = '内容不能为空';
          saveError.hidden = false;
        }
        return;
      }
      saveBtn.disabled = true;
      if (saveError) saveError.hidden = true;
      window.blogSupabase.from('moments')
        .update({ content: nextContent, updated_at: new Date().toISOString() })
        .eq('id', saveId)
        .select('id, content, updated_at')
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          var contentEl = saveCard.querySelector('.moment-content');
          if (nextContent) {
            if (!contentEl) {
              saveCard.querySelector('.moment-head').insertAdjacentHTML('afterend', '<div class="moment-content"></div>');
              contentEl = saveCard.querySelector('.moment-content');
            }
            contentEl.innerHTML = renderMarkdown(nextContent);
          } else if (contentEl) {
            contentEl.remove();
          }
          if (savePanel) savePanel.hidden = true;
          flashNotice('动态已更新', 'success');
        }).catch(function (error) {
          if (saveError) {
            saveError.textContent = '保存失败：' + (error.message || error);
            saveError.hidden = false;
          } else {
            flashNotice('保存失败：' + (error.message || error));
          }
        }).finally(function () {
          saveBtn.disabled = false;
        });
      return;
    }

    var deleteBtn = e.target.closest('[data-moment-delete]');
    if (deleteBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      if (!window.confirm('确认删除这条动态？')) return;
      var deleteId = deleteBtn.dataset.momentDelete;
      var deleteCard = listEl.querySelector('[data-moment-id="' + deleteId + '"]');
      deleteBtn.disabled = true;
      window.blogSupabase.from('moments').delete().eq('id', deleteId)
        .then(function (result) {
          if (result.error) throw result.error;
          if (deleteCard) deleteCard.remove();
          flashNotice('动态已删除', 'success');
          if (!listEl.querySelector('.moment-card')) {
            listEl.innerHTML = '<div class="moments-empty">还没有动态，发布第一条吧。</div>';
          }
        }).catch(function (error) {
          flashNotice('删除失败：' + (error.message || error));
        }).finally(function () {
          deleteBtn.disabled = false;
        });
      return;
    }

    var likeBtn = e.target.closest('[data-moment-like]');
    if (likeBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var momentId = likeBtn.dataset.momentLike;
      var liked = likeBtn.classList.contains('is-liked');
      var countEl = likeBtn.querySelector('.ma-count');
      var count = countEl ? parseInt(countEl.textContent, 10) || 0 : 0;
      likeBtn.disabled = true;
      if (!liked) likeBurst(likeBtn);
      // 乐观更新: 状态 + 文案 + 数字同步 ±1 (即时刷新)
      likeBtn.classList.toggle('is-liked', !liked);
      var labelNode = Array.prototype.find.call(likeBtn.childNodes, function (n) { return n.nodeType === 3; });
      if (labelNode) labelNode.textContent = liked ? '点赞 ' : '已赞 ';
      if (countEl) countEl.textContent = Math.max(0, count + (liked ? -1 : 1));
      var op = liked
        ? window.blogSupabase.from('moment_likes').delete().eq('moment_id', momentId).eq('user_id', currentUser.id)
        : window.blogSupabase.from('moment_likes')
            .upsert({ moment_id: momentId, user_id: currentUser.id }, { onConflict: 'moment_id,user_id' });
      op.then(function (result) {
        if (result.error) throw result.error;
      }).catch(function (error) {
        // 失败回滚: 状态/文案/数字全部还原
        likeBtn.classList.toggle('is-liked', liked);
        if (labelNode) labelNode.textContent = liked ? '已赞 ' : '点赞 ';
        if (countEl) countEl.textContent = count;
        flashNotice('点赞失败：' + (error.message || error));
      }).finally(function () {
        likeBtn.disabled = false;
      });
      return;
    }

    var toggleBtn = e.target.closest('[data-moment-toggle-comments]');
    if (toggleBtn) {
      var panel = listEl.querySelector('[data-moment-comments="' + toggleBtn.dataset.momentToggleComments + '"]');
      if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) animateIn(panel);
      }
      return;
    }

    var cmtLikeBtn = e.target.closest('[data-cmt-like]');
    if (cmtLikeBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var commentId = cmtLikeBtn.dataset.cmtLike;
      var liked = cmtLikeBtn.classList.contains('is-liked');
      var countEl = cmtLikeBtn.querySelector('.ma-count');
      var count = countEl ? parseInt(countEl.textContent, 10) || 0 : 0;
      cmtLikeBtn.disabled = true;
      cmtLikeBtn.classList.toggle('is-liked', !liked);
      var labelNode = Array.prototype.find.call(cmtLikeBtn.childNodes, function (n) { return n.nodeType === 3; });
      if (labelNode) labelNode.textContent = liked ? '赞 ' : '已赞 ';
      if (countEl) countEl.textContent = Math.max(0, count + (liked ? -1 : 1));
      var op = liked
        ? window.blogSupabase.from('moment_comment_likes').delete().eq('comment_id', commentId).eq('user_id', currentUser.id)
        : window.blogSupabase.from('moment_comment_likes')
            .upsert({ comment_id: commentId, user_id: currentUser.id }, { onConflict: 'comment_id,user_id' });
      op.then(function (result) {
        if (result.error) throw result.error;
      }).catch(function (error) {
        cmtLikeBtn.classList.toggle('is-liked', liked);
        if (labelNode) labelNode.textContent = liked ? '已赞 ' : '赞 ';
        if (countEl) countEl.textContent = count;
        flashNotice('点赞失败：' + (error.message || error));
      }).finally(function () {
        cmtLikeBtn.disabled = false;
      });
      return;
    }

    var cmtReplyBtn = e.target.closest('[data-cmt-reply]');
    if (cmtReplyBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var replyCommentId = cmtReplyBtn.dataset.cmtReply;
      var replyMomentId = cmtReplyBtn.dataset.cmtMoment;
      var replyAuthor = cmtReplyBtn.dataset.cmtAuthor || '';
      var input = listEl.querySelector('[data-moment-comment-input="' + replyMomentId + '"]');
      if (!input) return;
      input.focus();
      input.placeholder = '回复 @' + replyAuthor + '…';
      input.dataset.parentId = replyCommentId;
      input.dataset.replyMode = '1';
      return;
    }

    var cmtDeleteBtn = e.target.closest('[data-cmt-delete]');
    if (cmtDeleteBtn) {
      if (!window.confirm('确认删除这条评论？')) return;
      var delCommentId = cmtDeleteBtn.dataset.cmtDelete;
      cmtDeleteBtn.disabled = true;
      window.blogSupabase.from('moment_comments').delete().eq('id', delCommentId)
        .then(function (result) {
          if (result.error) throw result.error;
          flashNotice('评论已删除', 'success');
          return loadMoments();
        }).catch(function (error) {
          flashNotice('删除失败：' + (error.message || error));
        }).finally(function () {
          cmtDeleteBtn.disabled = false;
        });
      return;
    }

    var submitBtn = e.target.closest('[data-moment-comment-submit]');
    if (submitBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var momentId2 = submitBtn.dataset.momentCommentSubmit;
      var input = listEl.querySelector('[data-moment-comment-input="' + momentId2 + '"]');
      var text = input.value.trim();
      if (!text) return;
      submitBtn.disabled = true;
      var parentId = input.dataset.parentId || null;
      var payload = { moment_id: momentId2, user_id: currentUser.id, content: text };
      if (parentId) payload.parent_id = parentId;
      window.blogSupabase.from('moment_comments')
        .insert(payload)
        .select('id, content, created_at, parent_id, profiles(display_name, username, avatar_url)')
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          // 本地追加评论 DOM + 评论数字 +1, 不重渲染
          var comment = result.data;
          /* Realtime 事件可能先于本回调到达 → 已存在则跳过 */
          if (commentNode(comment.moment_id, comment.id)) { cleanupCommentInput(input); return; }
          var panel = listEl.querySelector('[data-moment-comments="' + momentId2 + '"]');
          if (!panel) {
            /* 容器缺失 (UI 重构/未渲染) → 重载列表兜底 */
            loadMoments();
            return;
          }
          if (panel) {
            var p = comment.profiles || {};
            var name = p.display_name || p.username || '读者';
            var node = document.createElement('div');
            node.className = 'moment-comment' + (comment.parent_id ? ' is-reply' : '');
            node.innerHTML = avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
              '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
              '<span class="mcc-text">' + escapeHtml(comment.content) + '</span>' +
              '<div class="mcc-time">刚刚</div>' + commentActions(comment, momentId2) + '</div>';
            var inputRow = panel.querySelector('.moment-comment-input');
            if (comment.parent_id) {
              // 回复: 插入到对应父评论后面
              var parentNode = panel.querySelector('[data-cmt-like="' + comment.parent_id + '"]');
              var anchor = parentNode ? parentNode.closest('.moment-comment').nextSibling : inputRow;
              panel.insertBefore(node, anchor);
            } else {
              panel.insertBefore(node, inputRow);
            }
          }
          var card = listEl.querySelector('[data-moment-id="' + momentId2 + '"]');
          if (card) {
            var toggle = card.querySelector('[data-moment-toggle-comments]');
            var cc = toggle ? toggle.querySelector('.ma-count') : null;
            if (cc) cc.textContent = (parseInt(cc.textContent, 10) || 0) + 1;
          }
          cleanupCommentInput(input);
        }).catch(function (error) {
          var msg = (error && error.message) || String(error);
          if (/permission|permission denied|RLS|policy|row.?level|not allowed/i.test(msg)) {
            flashNotice('评论失败：评论权限未配置（数据库 RLS），请联系管理员执行修复 SQL');
          } else {
            flashNotice('评论失败：' + msg);
          }
        }).finally(function () {
          submitBtn.disabled = false;
        });
      return;
    }
  });

  document.querySelector('[data-moment-login]').addEventListener('click', function () {
    if (window.BlogAuth) window.BlogAuth.open('login');
  });

  /* ── 长图处理: 高/宽 > 2.35:1 时包裹容器 + 顶部裁切预览 + "长图"角标 ── */
  function markLongImages() {
    listEl.querySelectorAll('.moment-media img').forEach(function (img) {
      if (img.closest('.moment-media-long') || img.dataset.longChecked) return;
      function check() {
        if (!img.naturalWidth) return;
        img.dataset.longChecked = '1';
        if (img.naturalHeight / img.naturalWidth <= 2.35) return;
        var wrap = document.createElement('div');
        wrap.className = 'moment-media-long';
        var tag = document.createElement('span');
        tag.className = 'moment-media-long-tag';
        tag.textContent = '长图';
        img.parentNode.insertBefore(wrap, img);
        wrap.appendChild(img);
        wrap.appendChild(tag);
      }
      if (img.complete) check();
      else img.addEventListener('load', check);
    });
  }

  /* ── 评论实时同步: Supabase Realtime (postgres_changes) ──
     其他访客发布/删除评论时, 评论实时出现在对应动态下方 */
  var realtimeChannel = null;

  function cleanupCommentInput(input) {
    if (!input) return;
    input.value = '';
    input.placeholder = '写下你的评论…';
    delete input.dataset.parentId;
    delete input.dataset.replyMode;
  }

  function commentNode(momentId, commentId) {
    var card = listEl.querySelector('[data-moment-id="' + momentId + '"]');
    if (!card) return null;
    return card.querySelector('[data-cmt-like="' + commentId + '"]');
  }

  function bumpCommentCount(momentId, delta) {
    var card = listEl.querySelector('[data-moment-id="' + momentId + '"]');
    var toggle = card && card.querySelector('[data-moment-toggle-comments]');
    var cc = toggle ? toggle.querySelector('.ma-count') : null;
    if (cc) cc.textContent = Math.max(0, (parseInt(cc.textContent, 10) || 0) + delta);
  }

  function appendCommentNode(momentId, comment) {
    var panel = listEl.querySelector('[data-moment-comments="' + momentId + '"]');
    if (!panel) return false;
    var p = comment.profiles || {};
    var name = p.display_name || p.username || '读者';
    var node = document.createElement('div');
    node.className = 'moment-comment' + (comment.parent_id ? ' is-reply' : '');
    node.innerHTML = avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
      '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
      '<span class="mcc-text">' + escapeHtml(comment.content) + '</span>' +
      '<div class="mcc-time">' + fmtTime(comment.created_at) + '</div>' +
      commentActions(comment, momentId) + '</div>';
    var inputRow = panel.querySelector('.moment-comment-input');
    if (comment.parent_id) {
      var parentNode = panel.querySelector('[data-cmt-like="' + comment.parent_id + '"]');
      var anchor = parentNode ? parentNode.closest('.moment-comment').nextSibling : inputRow;
      panel.insertBefore(node, anchor);
    } else {
      panel.insertBefore(node, inputRow);
    }
    bumpCommentCount(momentId, 1);
    return true;
  }

  function onRealtimeComment(row) {
    if (!row || !row.moment_id) return;
    /* 自己的评论已本地追加 → 去重 */
    if (commentNode(row.moment_id, row.id)) return;
    /* 目标动态未在列表中渲染 → 刷新列表兜底 */
    if (!listEl.querySelector('[data-moment-id="' + row.moment_id + '"]')) {
      loadMoments();
      return;
    }
    var comment = {
      id: row.id,
      content: row.content,
      parent_id: row.parent_id,
      created_at: row.created_at,
      user_id: row.user_id,
      moment_id: row.moment_id
    };
    window.Profile.get(row.user_id)
      .then(function (profile) {
        comment.profiles = profile || {};
        appendCommentNode(row.moment_id, comment);
      })
      .catch(function () {
        comment.profiles = {};
        appendCommentNode(row.moment_id, comment);
      });
  }

  function onRealtimeCommentDelete(row) {
    if (!row || !row.id) return;
    var node = commentNode(row.moment_id, row.id);
    if (node) {
      node.remove();
      bumpCommentCount(row.moment_id, -1);
    }
  }

  function subscribeRealtime() {
    if (!window.blogSupabase || typeof window.blogSupabase.channel !== 'function') return;
    if (realtimeChannel) {
      window.blogSupabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = window.blogSupabase
      .channel('moments-comments-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moment_comments' }, function (payload) {
        onRealtimeComment(payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'moment_comments' }, function (payload) {
        onRealtimeCommentDelete(payload.old);
      })
      .subscribe();
  }

  function whenAuthReady(cb) {
    if (window.Auth) { cb(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.Auth || tries > 30) { clearInterval(timer); cb(); }
    }, 100);
  }

  whenAuthReady(function () {
    subscribeRealtime();
    syncAuth();
    if (window.Auth.onAuthChange) window.Auth.onAuthChange(function () { syncAuth(); });
  });
})();
