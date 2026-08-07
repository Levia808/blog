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

  function renderComments(moment) {
    if (!moment.comments || !moment.comments.length) return '';
    return '<div class="moment-comments">' + moment.comments.map(function (c) {
      var p = c.profiles || {};
      var name = p.display_name || p.username || '读者';
      return '<div class="moment-comment">' +
        avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
        '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
        '<span class="mcc-text">' + escapeHtml(c.content) + '</span>' +
        '<div class="mcc-time">' + fmtTime(c.created_at) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function renderMoment(moment) {
    var p = moment.profiles || {};
    var name = p.display_name || p.username || '博客读者';
    var liked = false;
    if (currentUser && Array.isArray(moment.likes)) {
      liked = moment.likes.some(function (l) { return l.user_id === currentUser.id; });
    }
    var likeCount = (moment.likes && moment.likes.length) || 0;
    var commentCount = (moment.comments && moment.comments.length) || 0;
    return '<article class="moment-card" data-moment-id="' + moment.id + '">' +
      '<div class="moment-head">' + avatarHtml(p, 'moment-avatar', 'moment-avatar-fallback') +
      '<div><div class="moment-author">' + escapeHtml(name) + '</div>' +
      '<div class="moment-time">' + fmtTime(moment.created_at) + '</div></div></div>' +
      (moment.content ? '<div class="moment-content">' + renderMarkdown(moment.content) + '</div>' : '') +
      renderMedia(moment.media, (moment.media || []).length === 1) +
      '<div class="moment-actions">' +
      '<button type="button" class="moment-action-btn' + (liked ? ' is-liked' : '') + '" data-moment-like="' + moment.id + '">' +
      '<svg class="heart-icon" viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M16 29s-13-8.2-13-17.5C3 6.9 6.7 3.5 10.5 3.5c2.3 0 4.5 1.1 5.5 2.9 1-1.8 3.2-2.9 5.5-2.9C25.3 3.5 29 6.9 29 11.5 29 20.8 16 29 16 29z"/></svg>' +
      (liked ? '已赞' : '点赞') + ' <span class="ma-count">' + likeCount + '</span></button>' +
      '<button type="button" class="moment-action-btn" data-moment-toggle-comments="' + moment.id + '">评论 <span class="ma-count">' + commentCount + '</span></button>' +
      (currentUser && currentUser.id === moment.user_id ? '' : '') +
      '</div>' +
      '<div class="moment-comments" data-moment-comments="' + moment.id + '" hidden>' +
      renderComments(moment) +
      '<div class="moment-comment-input"><input type="text" placeholder="写下你的评论…" data-moment-comment-input="' + moment.id + '">' +
      '<button type="button" data-moment-comment-submit="' + moment.id + '">发送</button></div>' +
      '</div></article>';
  }

  async function loadMoments() {
    try {
      var result = await window.blogSupabase
        .from('moments')
        .select('*, profiles(display_name, username, avatar_url), moment_likes(user_id), moment_comments(id, content, created_at, user_id, profiles(display_name, username, avatar_url))')
        .order('created_at', { ascending: false })
        .limit(50);
      if (result.error) throw result.error;
      var moments = result.data || [];
      listEl.innerHTML = moments.length
        ? moments.map(renderMoment).join('')
        : '<div class="moments-empty">还没有动态，发布第一条吧。</div>';
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
    }
  }

  function showComposer(show) {
    composer.hidden = !show;
    loginWall.hidden = show;
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

  async function syncAuth() {
    try {
      currentUser = await window.Auth.user();
    } catch (e) { currentUser = null; }
    if (currentUser) {
      try {
        currentProfile = await window.Profile.get(currentUser.id);
      } catch (e) { currentProfile = null; }
      var canPublish = currentProfile && (currentProfile.role === 'superadmin');
      loginWall.hidden = true;
      if (canPublish) showComposer(true);
      else composer.hidden = true;
    } else {
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
    var likeBtn = e.target.closest('[data-moment-like]');
    if (likeBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var momentId = likeBtn.dataset.momentLike;
      var card = likeBtn.closest('.moment-card');
      var liked = likeBtn.classList.contains('is-liked');
      likeBtn.disabled = true;
      if (!liked) likeBurst(likeBtn);
      var op = liked
        ? window.blogSupabase.from('moment_likes').delete().eq('moment_id', momentId).eq('user_id', currentUser.id)
        : window.blogSupabase.from('moment_likes').insert({ moment_id: momentId, user_id: currentUser.id });
      op.then(function (result) {
        if (result.error) throw result.error;
        return loadMoments();
      }).catch(function (error) {
        alert('操作失败：' + (error.message || error));
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

    var submitBtn = e.target.closest('[data-moment-comment-submit]');
    if (submitBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var momentId2 = submitBtn.dataset.momentCommentSubmit;
      var input = listEl.querySelector('[data-moment-comment-input="' + momentId2 + '"]');
      var text = input.value.trim();
      if (!text) return;
      submitBtn.disabled = true;
      window.blogSupabase.from('moment_comments').insert({ moment_id: momentId2, user_id: currentUser.id, content: text })
        .then(function (result) {
          if (result.error) throw result.error;
          return loadMoments();
        }).catch(function (error) {
          alert('评论失败：' + (error.message || error));
        }).finally(function () {
          submitBtn.disabled = false;
        });
      return;
    }
  });

  document.querySelector('[data-moment-login]').addEventListener('click', function () {
    if (window.BlogAuth) window.BlogAuth.open('login');
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
    syncAuth();
    if (window.Auth.onAuthChange) window.Auth.onAuthChange(function () { syncAuth(); });
  });
})();
