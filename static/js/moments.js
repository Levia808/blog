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
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    /* 半小时内: 具体分钟前 */
    if (diff < 60) return '刚刚';
    if (diff < 1800) return Math.floor(diff / 60) + ' 分钟前';
    /* 半小时后: 具体 yy/mm/dd hh:mm */
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getFullYear() % 100) + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function avatarHtml(profile, cls, fallbackCls) {
    var name = (profile && (profile.display_name || profile.username)) || '?';
    if (profile && profile.avatar_url) {
      return '<img class="' + cls + '" src="' + escapeHtml(profile.avatar_url) + '" alt="" loading="lazy">';
    }
    return '<span class="' + cls + ' ' + fallbackCls + '">' + escapeHtml(name.slice(0, 1)) + '</span>';
  }

  function renderMedia(moment) {
    var media = moment.media || [];
    var single = media.length === 1;
    var momentId = moment.id;
    /* 单图: 原比例完整显示; 多图: 方形网格裁切
       列数策略: 2张/4张 → 2列 (1×2 / 2×2), 3张 → 3列 (1×3), ≥5张 → 3列优先
       超过 3×3 (>9张): 只渲染前 9 张, 最后一张叠加半透明层显示 "+多余数"
       放大查看: 点击图片拦截 glightbox 原生行为, 用 JS API (setElements+openAt)
       构建该动态全部图片的画廊 → 收起图同样可浏览 (momentMediaCache 存全量) */
    var isGrid = media.length > 1;
    var gridCls = '';
    if (isGrid) {
      var n = media.length;
      gridCls = (n === 2 || n === 4) ? ' moment-media-grid-2' : ' moment-media-grid-3';
    }
    var cls = 'moment-media' + (single ? ' single' : '') + (isGrid ? ' moment-media-grid' + gridCls : '');
    var displayMedia = media;
    var extra = 0;
    if (media.length > 9) {
      displayMedia = media.slice(0, 9);
      extra = media.length - 9;
    }
    var items = displayMedia.map(function (url, i) {
      var ext = String(url).split('?')[0].split('#')[0].split('.').pop().toLowerCase();
      var isVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v'].indexOf(ext) >= 0;
      var item = isVideo
        ? '<video data-src="' + escapeHtml(url) + '" controls preload="metadata"></video>'
        : '<img data-gallery="moment-' + momentId + '" data-src="' + escapeHtml(url) + '" alt="" decoding="async">';
      if (extra > 0 && i === displayMedia.length - 1) {
        item = '<div class="moment-media-more">' + item +
          '<span class="mm-more-badge">+' + extra + '</span></div>';
      }
      return item;
    }).join('');
    return '<div class="' + cls + '">' + items + '</div>';
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

  /* ── 编辑面板媒体编辑: 新增/替换/删除/排序 ── */
  var editMediaFiles = {};
  var editMediaSeq = 0;

  function editMediaItemHtml(url) {
    var ext = String(url).split('.').pop().toLowerCase();
    var isVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext);
    var preview = isVideo
      ? '<video src="' + escapeHtml(url) + '" muted playsinline preload="metadata"></video>'
      : '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" decoding="async">';
    return '<div class="mem-item" data-url="' + escapeHtml(url) + '">' +
      '<div class="mem-preview">' + preview +
      '<button type="button" class="mem-remove" data-edit-media-remove title="删除">×</button>' +
      '</div></div>';
  }

  function renderEditMedia(moment) {
    var media = moment.media || [];
    return '<div class="mem-hint mono">拖动缩略图调整顺序 · 右上角 × 删除</div>' +
      '<div class="mem-list" data-edit-media-list>' +
      media.map(editMediaItemHtml).join('') +
      '</div>' +
      '<label class="mem-add">+ 添加图片 / 视频' +
      '<input type="file" accept="image/*,video/*" multiple data-edit-media-add hidden></label>';
  }

  function editMediaPreviewHtml(file, url) {
    var isVideo = file.type.startsWith('video');
    return isVideo
      ? '<video src="' + url + '" muted playsinline preload="metadata"></video>'
      : '<img src="' + url + '" alt="" loading="lazy" decoding="async">';
  }

  function appendEditMediaItem(listEl, file) {
    var uid = 'e' + (++editMediaSeq);
    editMediaFiles[uid] = file;
    var url = URL.createObjectURL(file);
    var html = '<div class="mem-item is-new" data-file-uid="' + uid + '">' +
      '<div class="mem-preview">' + editMediaPreviewHtml(file, url) +
      '<button type="button" class="mem-remove" data-edit-media-remove title="删除">×</button>' +
      '</div></div>';
    listEl.insertAdjacentHTML('beforeend', html);
  }

  function revokeEditMediaBlobs(card) {
    if (!card) return;
    card.querySelectorAll('.mem-item.is-new').forEach(function (item) {
      var el = item.querySelector('.mem-preview img, .mem-preview video');
      if (el && el.src && el.src.indexOf('blob:') === 0) URL.revokeObjectURL(el.src);
    });
  }

  function resetEditMediaState() {
    editMediaFiles = {};
    editMediaSeq = 0;
  }

  /* ── 拖拽排序: SortableJS 按需加载 (仅打开编辑面板时, 省带宽) ── */
  var sortableLibPromise = null;
  var activeSortables = {};

  function loadSortableLib() {
    if (window.Sortable) return Promise.resolve(window.Sortable);
    if (sortableLibPromise) return sortableLibPromise;
    sortableLibPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js';
      s.onload = function () { resolve(window.Sortable); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return sortableLibPromise;
  }

  function destroyEditSortable(momentId) {
    var inst = activeSortables[momentId];
    if (inst) {
      inst.destroy();
      delete activeSortables[momentId];
    }
  }

  function destroyAllSortables() {
    Object.keys(activeSortables).forEach(function (k) { activeSortables[k].destroy(); });
    activeSortables = {};
  }

  function refreshEditSortable(panel) {
    var card = panel && panel.closest('.moment-card');
    var inst = card && activeSortables[card.dataset.momentId];
    if (inst) inst.refresh();
  }

  function initEditSortable(panel) {
    var memList = panel && panel.querySelector('[data-edit-media-list]');
    if (!memList) return;
    var card = panel.closest('.moment-card');
    var momentId = card && card.dataset.momentId;
    if (!momentId) return;
    loadSortableLib().then(function (Sortable) {
      if (!Sortable || !panel.isConnected) return;
      destroyEditSortable(momentId);
      activeSortables[momentId] = Sortable.create(memList, {
        animation: 220,
        easing: 'cubic-bezier(.22, .61, .36, 1)',
        ghostClass: 'mem-item-ghost',
        chosenClass: 'mem-item-chosen',
        dragClass: 'mem-item-drag',
        delay: 100,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        swapThreshold: 0.65,
        filter: 'button, label, input',
        preventOnFilter: true
      });
    });
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
      renderMedia(moment) +
      (canManage ? '<div class="moment-edit-panel" data-moment-edit-panel="' + moment.id + '" hidden>' +
      '<textarea class="moment-edit-input" rows="4" maxlength="2000" data-moment-edit-input="' + moment.id + '">' + escapeHtml(moment.content || '') + '</textarea>' +
      renderEditMedia(moment) +
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
    destroyAllSortables();
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
      /* 媒体缓存: JS 内存传递 (避免 HTML 属性编码风险) */
      momentMediaCache = {};
      moments.forEach(function (m) { momentMediaCache[m.id] = m.media || []; });
      listEl.innerHTML = moments.length
        ? moments.map(renderMoment).join('')
        : '<div class="moments-empty">还没有动态，发布第一条吧。</div>';
      markLongImages();
      lazyLoadImages();
      lazyLoadMedia();
      if (window.__blogLightbox && typeof window.__blogLightbox.reload === 'function') {
        window.__blogLightbox.reload();
      }
      animateCardsIn(listEl.querySelectorAll('.moment-card'));
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

  function releaseSelectedMedia() {
    selectedMedia.forEach(function (item) {
      if (item.file && item.url) URL.revokeObjectURL(item.url);
    });
    selectedMedia = [];
  }

  function showComposer(show) {
    composer.hidden = !show;
    if (show) loginWall.hidden = true;
    if (!show) {
      mcInput.value = '';
      releaseSelectedMedia();
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
      var removed = selectedMedia.splice(Number(btn.dataset.removeMedia), 1)[0];
      if (removed && removed.file && removed.url) URL.revokeObjectURL(removed.url);
      renderSelectedMedia();
    }
  });

  /* ── 动态图片放大: 独立 GLightbox 实例 (selector: null, 纯 JS API 驱动)
     官方文档模式: setElements([{href,type}]) + openAt(index)
     该动态全部图片 (含收起的 +N) 构成画廊 → 左右键浏览完整, 与文章图实例完全隔离
     关键: 原生 glightbox 把 click 监听直接绑定在 img 元素上 (目标阶段先执行),
     必须在 document 捕获阶段拦截 (stopPropagation) 才能阻止原生 9 张画廊抢先打开 */
  var momentsLightbox = null;
  var momentMediaCache = {};
  var glightboxLibPromise = null;
  var loaderTimer = null;

  function isVideoUrl(url) {
    var path = String(url).split('?')[0].split('#')[0];
    var ext = path.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v'].indexOf(ext) >= 0;
  }

  function loadGlightboxLib() {
    if (window.GLightbox) return Promise.resolve(window.GLightbox);
    if (glightboxLibPromise) return glightboxLibPromise;
    glightboxLibPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/glightbox@3.3.0/dist/js/glightbox.min.js';
      s.onload = function () { resolve(window.GLightbox); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return glightboxLibPromise;
  }

  function hideMomentsLoader() {
    var loader = document.querySelector('.gloader');
    if (loader) loader.style.display = 'none';
  }

  function scheduleLoaderTimeout() {
    if (loaderTimer) clearTimeout(loaderTimer);
    loaderTimer = setTimeout(hideMomentsLoader, 12000);
  }

  function getMomentsLightbox() {
    if (window.GLightbox && !momentsLightbox) {
      momentsLightbox = window.GLightbox({
        selector: null,
        keyboardNavigation: true,
        touchNavigation: true,
        loop: false,
        zoomable: true,
        draggable: true,
        preload: true
      });
      /* 加载动画条件控制: 仅在放大查看且图片未加载完成时显示, 否则强制关闭 */
      momentsLightbox.on('slide_before_load', function () {
        scheduleLoaderTimeout();
      });
      momentsLightbox.on('slide_after_load', function () {
        if (loaderTimer) clearTimeout(loaderTimer);
        hideMomentsLoader();
      });
      /* 图片加载失败兜底: glightbox 无 onerror 处理, loader 会永远显示 */
      momentsLightbox.on('slide_before_load', function (data) {
        setTimeout(function () {
          var slideNode = data && data.slideNode;
          var img = slideNode && slideNode.querySelector('.gslide-media img');
          if (!img) return;
          img.addEventListener('error', function () {
            if (loaderTimer) clearTimeout(loaderTimer);
            hideMomentsLoader();
            var media = slideNode.querySelector('.gslide-media');
            if (media) {
              media.innerHTML = '<div class="gslide-error">图片加载失败</div>';
            }
          }, { once: true });
        }, 0);
      });
    }
    return momentsLightbox;
  }

  /* 终极兜底: glightbox 不可用时, 把收起图展开渲染进预览 */
  function expandMomentMedia(card) {
    var allMedia = momentMediaCache[card.dataset.momentId] || [];
    var wrap = card.querySelector('.moment-media');
    if (!wrap || allMedia.length <= 9) return false;
    var extraHtml = allMedia.slice(9).map(function (url) {
      if (isVideoUrl(url)) {
        return '<video data-src="' + escapeHtml(url) + '" controls preload="metadata"></video>';
      }
      return '<img data-gallery="moment-' + card.dataset.momentId + '" data-src="' + escapeHtml(url) + '" alt="" decoding="async">';
    }).join('');
    wrap.insertAdjacentHTML('beforeend', extraHtml);
    var more = wrap.querySelector('.moment-media-more');
    if (more) {
      var badge = more.querySelector('.mm-more-badge');
      if (badge) badge.remove();
    }
    markLongImages();
    lazyLoadImages();
    lazyLoadMedia();
    flashNotice('已展开全部图片', 'success');
    return true;
  }

  function openMomentLightbox(img) {
    var card = img.closest('.moment-card');
    if (!card) return false;
    var allMedia = momentMediaCache[card.dataset.momentId] || [];
    var images = allMedia.filter(function (url) { return !isVideoUrl(url); });
    if (!images.length) return false;
    var startAt = Math.max(0, images.indexOf(img.getAttribute('src') || img.getAttribute('data-src')));
    var lb = getMomentsLightbox();
    if (lb) {
      lb.setElements(images.map(function (url) {
        return { href: url, type: 'image' };
      }));
      lb.openAt(startAt);
      return true;
    }
    /* glightbox 未就绪: 按需加载, 失败则展开预览兜底 */
    loadGlightboxLib().then(function () {
      var loaded = getMomentsLightbox();
      if (loaded) {
        loaded.setElements(images.map(function (url) {
          return { href: url, type: 'image' };
        }));
        loaded.openAt(startAt);
      } else {
        expandMomentMedia(card);
      }
    });
    return true;
  }

  /* 动态图片点击: document 捕获阶段拦截 (先于 img 元素上的 glightbox 原生监听)
     stopPropagation 阻止事件到达目标阶段 → 原生 9 张画廊不会抢先打开 */
  document.addEventListener('click', function (e) {
    var mediaImg = e.target.closest('.moment-media img');
    if (!mediaImg) {
      var moreBox = e.target.closest('.moment-media-more');
      if (moreBox) mediaImg = moreBox.querySelector('img');
    }
    if (mediaImg) {
      e.stopPropagation();
      e.preventDefault();
      openMomentLightbox(mediaImg);
    }
  }, true);

  listEl.addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-moment-edit]');
    if (editBtn) {
      var editId = editBtn.dataset.momentEdit;
      var editCard = listEl.querySelector('[data-moment-id="' + editId + '"]');
      var editPanel = editCard && editCard.querySelector('[data-moment-edit-panel="' + editId + '"]');
      var editInput = editCard && editCard.querySelector('[data-moment-edit-input="' + editId + '"]');
      if (editPanel && editInput) {
        /* 同时只允许一个编辑面板 (全局 editMediaFiles 状态一致) */
        listEl.querySelectorAll('.moment-edit-panel:not([hidden])').forEach(function (p) {
          if (p !== editPanel) {
            var closedCard = p.closest('.moment-card');
            if (closedCard) destroyEditSortable(closedCard.dataset.momentId);
            revokeEditMediaBlobs(closedCard);
            p.hidden = true;
          }
        });
        resetEditMediaState();
        /* 重新打开 = 放弃上次未保存的媒体改动 (map 已清空, is-new 项失效) */
        revokeEditMediaBlobs(editCard);
        editCard.querySelectorAll('.mem-item.is-new').forEach(function (item) { item.remove(); });
        editPanel.hidden = false;
        editInput.focus();
        initEditSortable(editPanel);
      }
      return;
    }

    /* 编辑媒体: 删除 (右上角圆形 ×) */
    var mediaRemoveBtn = e.target.closest('[data-edit-media-remove]');
    if (mediaRemoveBtn) {
      var removeItem = mediaRemoveBtn.closest('.mem-item');
      if (removeItem) {
        if (removeItem.classList.contains('is-new')) {
          var blobEl = removeItem.querySelector('.mem-preview img, .mem-preview video');
          if (blobEl && blobEl.src && blobEl.src.indexOf('blob:') === 0) URL.revokeObjectURL(blobEl.src);
        }
        removeItem.remove();
        refreshEditSortable(mediaRemoveBtn.closest('.moment-edit-panel'));
      }
      return;
    }

    var cancelEditBtn = e.target.closest('[data-moment-cancel-edit]');
    if (cancelEditBtn) {
      var cancelId = cancelEditBtn.dataset.momentCancelEdit;
      var cancelCard = listEl.querySelector('[data-moment-id="' + cancelId + '"]');
      var cancelPanel = cancelCard && cancelCard.querySelector('[data-moment-edit-panel="' + cancelId + '"]');
      var cancelError = cancelCard && cancelCard.querySelector('[data-moment-edit-error="' + cancelId + '"]');
      destroyEditSortable(cancelId);
      revokeEditMediaBlobs(cancelCard);
      resetEditMediaState();
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
      /* 按 DOM 顺序收集媒体 (排序/替换/删除/新增均已反映) */
      var pendingMedia = [];
      saveCard.querySelectorAll('.mem-item').forEach(function (item) {
        var uid = item.dataset.fileUid;
        if (uid && editMediaFiles[uid]) pendingMedia.push({ file: editMediaFiles[uid] });
        else pendingMedia.push(item.dataset.url || '');
      });
      if (!nextContent && !pendingMedia.length) {
        if (saveError) {
          saveError.textContent = '内容不能为空';
          saveError.hidden = false;
        }
        return;
      }
      saveBtn.disabled = true;
      if (saveError) saveError.hidden = true;
      var uploads = pendingMedia.map(function (m) {
        if (m && m.file) return window.Admin.uploadMedia(m.file).then(function (r) { return r.public_url || r; });
        return null;
      });
      Promise.all(uploads.map(function (p) { return p || Promise.resolve(null); }))
        .then(function (uploaded) {
          var media = pendingMedia.map(function (m, i) {
            if (m && m.file) return uploaded[i];
            return m;
          }).filter(function (m) { return typeof m === 'string' ? m !== '' : true; });
          return window.blogSupabase.from('moments')
            .update({ content: nextContent, media: media, updated_at: new Date().toISOString() })
            .eq('id', saveId)
            .select('id, content, updated_at');
        })
        .then(function (result) {
          if (result.error) throw result.error;
          revokeEditMediaBlobs(saveCard);
          resetEditMediaState();
          flashNotice('动态已更新', 'success');
          return loadMoments();
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

  /* 编辑媒体: 新增 / 替换 (文件选择) */
  listEl.addEventListener('change', function (e) {
    var input = e.target;
    if (!input.files || !input.files.length) return;
    var files = Array.prototype.slice.call(input.files);
    if (input.hasAttribute('data-edit-media-add')) {
      var addList = input.closest('.moment-edit-panel');
      var listWrap = addList && addList.querySelector('[data-edit-media-list]');
      if (listWrap) {
        files.forEach(function (file) { appendEditMediaItem(listWrap, file); });
        refreshEditSortable(addList);
      }
      input.value = '';
      return;
    }
  });

  document.querySelector('[data-moment-login]').addEventListener('click', function () {
    if (window.BlogAuth) window.BlogAuth.open('login');
  });

  /* ── 卡片依次上浮动效 (CSS transition + stagger delay, 渲染即隐藏无闪烁) ── */
  function animateCardsIn(cards) {
    if (!cards || !cards.length) return;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var list = Array.prototype.slice.call(cards);
    if (reduced) {
      list.forEach(function (c) { c.classList.add('moment-card-in'); });
      return;
    }
    var animated = list.slice(0, 12);
    var rest = list.slice(12);
    animated.forEach(function (c, i) {
      c.style.transitionDelay = (i * 50) + 'ms';
      c.classList.add('moment-card-in');
    });
    rest.forEach(function (c) { c.classList.add('moment-card-in'); });
    setTimeout(function () {
      animated.forEach(function (c) { c.style.transitionDelay = ''; });
    }, 1200);
  }

  /* ── 图片分批懒加载: 同一卡片多图串行下载 (最多 2 张并发)
     避免 9 张大图同时下载+解码导致滚动卡顿
     业界模式 (vanilla-lazyload cancel_on_exit): 滚出视口的图立即取消下载,
     快速滚动经过多图动态时只加载停留的图
     双保险: IntersectionObserver + scroll 兜底 (部分环境 IO 回调不触发) */
  var imageQueue = [];
  var imageLoadingCount = 0;
  var imageIO = null;
  var loadingImages = {};
  var MAX_CONCURRENT_IMAGES = 2;

  function pumpImageQueue() {
    while (imageLoadingCount < MAX_CONCURRENT_IMAGES && imageQueue.length) {
      var img = imageQueue.shift();
      if (!img.dataset.src || img.src) continue;
      imageLoadingCount++;
      loadingImages[img.__lazyId] = img;
      img.src = img.dataset.src;
      img.addEventListener('load', function () {
        if (!loadingImages[this.__lazyId]) return;
        delete loadingImages[this.__lazyId];
        imageLoadingCount--;
        markLongImages();
        pumpImageQueue();
      }, { once: true });
      img.addEventListener('error', function () {
        if (!loadingImages[this.__lazyId]) return;
        delete loadingImages[this.__lazyId];
        imageLoadingCount--;
        pumpImageQueue();
      }, { once: true });
    }
  }

  /* 去重入队: 已在加载/队列中的不入队 (多路径入队防膨胀) */
  function enqueueImage(img) {
    if (!img || img.src || !img.dataset.src) return;
    if (loadingImages[img.__lazyId]) return;
    if (imageQueue.indexOf(img) >= 0) return;
    imageQueue.push(img);
    pumpImageQueue();
  }

  /* IO 兜底: 视口附近未加载的图直接入队 (scroll 时调用, rAF 节流) */
  function loadVisibleImages() {
    var imgs = listEl.querySelectorAll('.moment-media img[data-src]');
    if (!imgs.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    imgs.forEach(function (img) {
      if (img.src || !img.dataset.src) return;
      var r = img.getBoundingClientRect();
      if (r.top < vh + 300 && r.bottom > -300) {
        enqueueImage(img);
      }
    });
  }

  var scrollRafPending = false;
  window.addEventListener('scroll', function () {
    if (scrollRafPending) return;
    scrollRafPending = true;
    requestAnimationFrame(function () {
      scrollRafPending = false;
      loadVisibleImages();
    });
  }, { passive: true });

  function lazyLoadImages() {
    imageQueue = [];
    loadingImages = {};
    if (imageIO) { imageIO.disconnect(); imageIO = null; }
    var imgs = listEl.querySelectorAll('.moment-media img[data-src]');
    if (!imgs.length) return;
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(function (img) { if (img.dataset.src) img.src = img.dataset.src; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var img = en.target;
        if (en.isIntersecting) {
          enqueueImage(img);
        } else {
          /* 滚出视口取消下载: 仅当确实验证滚出很远 (600px 余量防误取消) */
          var r2 = img.getBoundingClientRect();
          var vh2 = window.innerHeight || document.documentElement.clientHeight;
          if (r2.top > vh2 + 600 || r2.bottom < -600) {
            if (loadingImages[img.__lazyId]) {
              img.removeAttribute('src');
              delete loadingImages[img.__lazyId];
              imageLoadingCount--;
            }
            var qi = imageQueue.indexOf(img);
            if (qi >= 0) imageQueue.splice(qi, 1);
            pumpImageQueue();
          } else {
            /* 实际仍在视口附近: 确保入队加载 (IO 判定异常兜底) */
            enqueueImage(img);
          }
        }
      });
    }, { rootMargin: '300px 0px' });
    imageIO = io;
    imgs.forEach(function (img) {
      img.__lazyId = 'i' + (++editMediaSeq) + '_' + Math.random().toString(36).slice(2, 8);
      io.observe(img);
    });
    /* IO 兜底: 首屏立即加载视口内图片 + 定时复查 (IO 回调不触发时保证图片可显示) */
    loadVisibleImages();
    setTimeout(loadVisibleImages, 500);
    setTimeout(loadVisibleImages, 1500);
  }

  /* ── 视频懒加载: 进入视口附近才加载视频数据 (省带宽/内存) ── */
  var mediaObserver = null;
  function lazyLoadMedia() {
    if (mediaObserver) { mediaObserver.disconnect(); mediaObserver = null; }
    var videos = listEl.querySelectorAll('video[data-src]');
    if (!videos.length) return;
    /* play 兜底: 未进入视口被点击也立即加载 */
    videos.forEach(function (v) {
      v.addEventListener('play', function () {
        if (v.dataset.src && !v.src) {
          v.src = v.dataset.src;
          delete v.dataset.src;
        }
      }, { once: true });
    });
    if (!('IntersectionObserver' in window)) {
      videos.forEach(function (v) {
        if (v.dataset.src) { v.src = v.dataset.src; delete v.dataset.src; }
      });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var v = en.target;
        if (v.dataset.src && !v.src) {
          v.src = v.dataset.src;
          delete v.dataset.src;
        }
        obs.unobserve(v);
      });
    }, { rootMargin: '200px 0px' });
    mediaObserver = obs;
    videos.forEach(function (v) { obs.observe(v); });
  }

  /* ── 长图处理: 高/宽 > 2.35:1 时包裹容器 + 顶部裁切预览 + "长图"角标
     滚动性能: 滚动中加载完成的图不立即 wrap (布局跳动→卡顿), 滚动停止 150ms 后统一处理 */
  var pendingLongImages = [];
  var scrollIdleTimer = null;

  function wrapLongImage(img) {
    var wrap = document.createElement('div');
    wrap.className = 'moment-media-long';
    var tag = document.createElement('span');
    tag.className = 'moment-media-long-tag';
    tag.textContent = '长图';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    wrap.appendChild(tag);
  }

  function flushPendingLongImages() {
    if (!pendingLongImages.length) return;
    var imgs = pendingLongImages;
    pendingLongImages = [];
    imgs.forEach(wrapLongImage);
  }

  function markLongImages() {
    listEl.querySelectorAll('.moment-media img').forEach(function (img) {
      /* 多图正方形网格不处理长图; 已包裹/已检查跳过 */
      if (img.closest('.moment-media-long') || img.closest('.moment-media-grid') || img.dataset.longChecked) return;
      function check() {
        if (!img.naturalWidth) return;
        img.dataset.longChecked = '1';
        if (img.naturalHeight / img.naturalWidth <= 2.35) return;
        if (scrollIdleTimer) pendingLongImages.push(img);
        else wrapLongImage(img);
      }
      if (img.complete) check();
      else img.addEventListener('load', check);
    });
  }

  window.addEventListener('scroll', function () {
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(function () {
      scrollIdleTimer = null;
      flushPendingLongImages();
    }, 150);
  }, { passive: true });

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
