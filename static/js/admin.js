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
  var sections = ['dashboard', 'posts', 'archive', 'comments', 'users', 'media', 'settings', 'platform'];

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
    stats = stats || {};
    document.getElementById('adminPostCount').textContent = stats.posts == null ? '—' : stats.posts;
    var homeCardCount = document.getElementById('adminHomeCardCount');
    if (homeCardCount) homeCardCount.textContent = stats.homeCards == null ? '—' : stats.homeCards;
    document.getElementById('adminCommentCount').textContent = stats.comments == null ? '—' : stats.comments;
    document.getElementById('adminUserCount').textContent = stats.users == null ? '—' : stats.users;
    document.getElementById('adminPendingCommentCount').textContent = stats.pending == null ? '—' : stats.pending;
  }

  async function loadStats() {
    var stats = await Admin.getStats();
    renderStats({
      posts: document.getElementById('adminPostCount').textContent,
      homeCards: document.getElementById('adminHomeCardCount') ? document.getElementById('adminHomeCardCount').textContent : '—',
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

  function base64Decode(str) {
    var binary = atob(String(str || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
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
      else if (key === 'entry_title_font') meta.entryTitleFont = value.replace(/^['"]|['"]$/g, '');
      else if (key === 'entry_title_font_file') meta.entryTitleFontFile = value.replace(/^['"]|['"]$/g, '');
      else if (key === 'entry_title_font_name') meta.entryTitleFontName = value.replace(/^['"]|['"]$/g, '');
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
        posts.push({ name: file.name, sha: file.sha, title: meta.title || file.name, draft: meta.draft, archived: meta.archived, date: meta.date, entryTitleFont: meta.entryTitleFont, entryTitleFontFile: meta.entryTitleFontFile, entryTitleFontName: meta.entryTitleFontName });
      } catch (e) {
        posts.push({ name: file.name, sha: file.sha, title: file.name, draft: true, date: '' });
      }
    }
    posts.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    ghPostsCache = posts;
    return posts;
  }

  function homeCardPosts(posts) {
    return posts.filter(function (post) {
      return !post.archived && post.draft === false;
    }).slice(0, 6);
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
      var homeCardCountEl = document.getElementById('adminHomeCardCount');
      if (postCountEl) postCountEl.textContent = '—';
      if (homeCardCountEl) homeCardCountEl.textContent = '—';
      renderPostRows([], 'adminPostTable', true);
      renderPostRows([], 'adminPublishTable', true);
      if (hint) hint.textContent = '';
      if (note) note.textContent = '尚未授权 GitHub。点击右上角「GitHub 授权」后即可管理并一键发布文章。';
      return;
    }
    var posts = await loadGhPosts();
    var postCountEl = document.getElementById('adminPostCount');
    var homeCardCountEl = document.getElementById('adminHomeCardCount');
    if (postCountEl) postCountEl.textContent = posts.length;
    if (homeCardCountEl) homeCardCountEl.textContent = homeCardPosts(posts).length;
    renderPostRows(posts.slice(0, 8), 'adminPostTable', true);
    document.getElementById('adminPostHint').textContent = '共 ' + posts.length + ' 篇文章 · 显示最近 ' + Math.min(8, posts.length) + ' 篇';
    renderPostRows(posts, 'adminPublishTable', true);
    document.getElementById('adminPublishHint').textContent = '共 ' + posts.length + ' 篇文章';
    renderCardPreview();
    renderFontPreview();
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

  /* ── 欢迎页配置 (data/welcome.yaml 读写) ── */
  var welcomeCfgSha = null;
  var CFG_FIELDS = {
    typewriterText: 'cfgTypewriterText',
    typeSpeed: 'cfgTypeSpeed',
    deleteSpeed: 'cfgDeleteSpeed',
    pause: 'cfgPause',
    titleVariationFrom: 'cfgVariationFrom',
    titleVariationTo: 'cfgVariationTo',
    proximityRadius: 'cfgRadius',
    proximityFalloff: 'cfgFalloff'
  };

  function parseDataSimple(text) {
    var out = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/);
      if (!m) return;
      var key = m[1];
      var raw = m[2].trim();
      if ((raw[0] === '"' && raw[raw.length - 1] === '"') || (raw[0] === "'" && raw[raw.length - 1] === "'")) {
        out[key] = raw.slice(1, -1);
      } else if (raw === 'true' || raw === 'false') {
        out[key] = raw === 'true';
      } else {
        out[key] = Number(raw);
        if (Number.isNaN(out[key])) out[key] = raw;
      }
    });
    return out;
  }

  function tomlQuote(value) {
    var str = String(value == null ? '' : value).trim();
    if (str === 'true' || str === 'false') return str;
    if (str !== '' && !isNaN(Number(str))) return str;
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function loadWelcomeConfig() {
    if (!getGhToken()) {
      showError('请先授权 GitHub 后再编辑欢迎页配置。');
      return;
    }
    ghFetch('/repos/' + GH_REPO + '/contents/data/welcome.yaml')
      .then(function (file) {
        welcomeCfgSha = file.sha;
        var content = atob(String(file.content).replace(/\s/g, ''));
        var cfg = parseDataSimple(content);
        Object.keys(CFG_FIELDS).forEach(function (key) {
          var el = document.getElementById(CFG_FIELDS[key]);
          if (el && cfg[key] != null) el.value = cfg[key];
        });
        showToast('欢迎页配置已加载', 'success');
      })
      .catch(function (error) {
        showError('配置加载失败：' + (error.message || error));
      });
  }

  function saveWelcomeConfig() {
    if (!getGhToken()) {
      showError('请先授权 GitHub 后再保存配置。');
      return;
    }
    var CFG_DEFAULTS = {
      typewriterText: '写代码，也写生活。记录学习与思考。',
      typeSpeed: 70, deleteSpeed: 38, pause: 1800,
      titleVariationFrom: "'wght' 400", titleVariationTo: "'wght' 900",
      proximityRadius: 140, proximityFalloff: 'linear'
    };
    var values = {};
    Object.keys(CFG_FIELDS).forEach(function (key) {
      var el = document.getElementById(CFG_FIELDS[key]);
      var raw = el ? el.value : '';
      if (raw === '' || raw == null) raw = CFG_DEFAULTS[key];
      values[key] = raw;
    });
    var text = [
      '# 欢迎页配置 (管理面板「欢迎页配置」可编辑)',
      'typewriterText: "' + String(values.typewriterText).replace(/"/g, '\\"') + '"',
      'typeSpeed: ' + Number(values.typeSpeed),
      'deleteSpeed: ' + Number(values.deleteSpeed),
      'pause: ' + Number(values.pause),
      '# VariableProximity 大标题 (可变字体字重插值)',
      'titleVariationFrom: "' + String(values.titleVariationFrom).replace(/"/g, '\\"') + '"',
      'titleVariationTo: "' + String(values.titleVariationTo).replace(/"/g, '\\"') + '"',
      'proximityRadius: ' + Number(values.proximityRadius),
      'proximityFalloff: ' + tomlQuote(values.proximityFalloff),
      '# ShapeBlur 叠加效果',
      'shapeSize: 1.2',
      'roundness: 0.4',
      'borderSize: 0.05',
      'circleSize: 0.55',
      'circleEdge: 0.35',
      '# Sparks 火花',
      'sparkColor: "#6B8B6B"',
      'sparkSize: 10',
      'sparkRadius: 15',
      'sparkCount: 8',
      'sparkDuration: 400',
      'sparkEasing: "ease-out"',
      'sparkExtraScale: 1.0'
    ].join('\n') + '\n';

    var btn = document.getElementById('cfgSaveBtn');
    btn.disabled = true;
    btn.textContent = '保存中…';
    // 保存前强制获取最新 sha, 避免过期/未加载导致 nil
    ghFetch('/repos/' + GH_REPO + '/contents/data/welcome.yaml')
      .then(function (file) {
        welcomeCfgSha = file.sha;
        return ghFetch('/repos/' + GH_REPO + '/contents/data/welcome.yaml', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '更新欢迎页配置', content: base64Encode(text), sha: welcomeCfgSha })
        });
      })
      .then(function () {
        showToast('配置已保存，站点重建后生效', 'success');
      })
      .catch(function (error) {
        showError('保存失败：' + (error.message || error));
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = '保存配置';
      });
  }

  /* ── 导航栏行为 (data/site.yaml 读写) ── */
  var siteConfigSha = null;

  function readNavBehavior(text) {
    var match = String(text || '').match(/^navBehavior\s*:\s*["']?([A-Za-z-]+)["']?\s*$/m);
    return match && match[1] === 'fixed' ? 'fixed' : 'auto';
  }

  function writeNavBehavior(text, value) {
    var behavior = value === 'fixed' ? 'fixed' : 'auto';
    var line = 'navBehavior: ' + behavior;
    if (/^navBehavior\s*:/m.test(text)) return text.replace(/^navBehavior\s*:.*$/m, line);
    if (/^navLogo\s*:.*$/m.test(text)) return text.replace(/^(navLogo\s*:.*)$/m, '$1\n' + line);
    return line + '\n' + text;
  }

  function loadNavBehaviorConfig() {
    var select = document.getElementById('cfgNavBehavior');
    if (!select || !getGhToken()) return;
    clearError('cfgNavError');
    ghFetch('/repos/' + GH_REPO + '/contents/data/site.yaml')
      .then(function (file) {
        siteConfigSha = file.sha;
        select.value = readNavBehavior(base64Decode(file.content));
      })
      .catch(function (error) {
        showError('导航设置加载失败：' + (error.message || error), 'cfgNavError');
      });
  }

  function saveNavBehaviorConfig() {
    if (!getGhToken()) {
      showError('请先授权 GitHub 后再保存导航设置。', 'cfgNavError');
      return;
    }
    var select = document.getElementById('cfgNavBehavior');
    var btn = document.getElementById('cfgNavSaveBtn');
    var value = select ? select.value : 'auto';
    clearError('cfgNavError');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    ghFetch('/repos/' + GH_REPO + '/contents/data/site.yaml')
      .then(function (file) {
        siteConfigSha = file.sha;
        var next = writeNavBehavior(base64Decode(file.content), value);
        return ghFetch('/repos/' + GH_REPO + '/contents/data/site.yaml', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '更新导航栏行为: ' + value, content: base64Encode(next), sha: siteConfigSha })
        });
      })
      .then(function () {
        showToast('导航栏行为已保存，站点重建后生效', 'success');
      })
      .catch(function (error) {
        showError('导航设置保存失败：' + (error.message || error), 'cfgNavError');
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = '保存导航设置'; }
      });
  }

  /* ── 文章卡片样式 (data/cards.yaml 读写) ── */
  var cardsSha = null;
  function loadCardStyle() {
    var select = document.getElementById('cfgCardStyle');
    if (!select || !getGhToken()) return;
    ghFetch('/repos/' + GH_REPO + '/contents/data/cards.yaml')
      .then(function (file) {
        cardsSha = file.sha;
        var m = atob(String(file.content).replace(/\s/g, '')).match(/^style\s*[:=]\s*["']?([\w]+)["']?/m);
        if (m && ['grid', 'horizontal', 'fullscreen', 'feature'].includes(m[1])) select.value = m[1];
        syncCardPreviewSelect();
        renderCardPreview();
      renderFontPreview();
      })
      .catch(function () { /* 文件缺失时保持默认 */ });
  }

  function renderCardPreview() {
    var posts = ghPostsCache.slice(0, 3);
    if (!posts.length) {
      posts = [
        { title: '构建现代化个人博客', date: '2026-08-06' },
        { title: 'Rust 所有权模型', date: '2025-06-15' },
        { title: 'Container Queries 指南', date: '2025-04-10' }
      ];
    }
    var glyphs = ['构', 'R', 'C'];
    var gridEl = document.getElementById('cpGridPreview');
    var listEl = document.getElementById('cpHListPreview');
    var featureEl = document.getElementById('cpFeaturePreview');
    if (gridEl) {
      gridEl.innerHTML = posts.map(function (p, i) {
        return '<div class="cp-card"><div class="cp-thumb">' + (glyphs[i] || '▦') + '</div>' +
          '<div class="cp-title">' + escapeHtml(p.title) + '</div>' +
          '<div class="cp-date">' + escapeHtml(String(p.date || p.created_at || '').slice(0, 10)) + '</div></div>';
      }).join('');
    }
    if (listEl) {
      listEl.innerHTML = posts.map(function (p, i) {
        return '<div class="cp-hcard"><div class="cp-thumb">' + (glyphs[i] || '▦') + '</div>' +
          '<div class="cp-body"><div class="cp-title">' + escapeHtml(p.title) + '</div>' +
          '<div class="cp-date">' + escapeHtml(String(p.date || p.created_at || '').slice(0, 10)) + ' · 5 min read</div></div></div>';
      }).join('');
    }
    if (featureEl) {
      var first = posts[0] || { title: '构建现代化个人博客', date: '2026-08-06' };
      featureEl.innerHTML = '<div class="cp-feature-inner">' +
        '<div class="cp-fs-date">' + escapeHtml(String(first.date || first.created_at || '').slice(0, 10)) + ' · 5 min</div>' +
        '<div class="cp-fs-title">' + escapeHtml(first.title) + '</div>' +
        '<div class="cp-fs-quote">2:1 横向标题封面，用于突出单篇文章。</div>' +
      '</div>';
    }
  }

  function syncCardPreviewSelect() {
    var select = document.getElementById('cfgCardStyle');
    var selected = select ? select.value : 'grid';
    document.querySelectorAll('.cp-col').forEach(function (col) {
      col.classList.toggle('is-selected', col.dataset.cp === selected);
    });
  }
  /* ── 标题字体预览 (设置面板) ── */
  var FONT_PREVIEWS = [
    { value: 'display', label: 'Playfair Display（杂志衬线·默认）', font: "'Playfair Display', Georgia, serif" },
    { value: 'grotesk', label: 'Space Grotesk（几何无衬线）', font: "'Space Grotesk', sans-serif" },
    { value: 'mono', label: 'JetBrains Mono（等宽）', font: "'JetBrains Mono', monospace" },
    { value: 'serif', label: 'Georgia 衬线', font: "Georgia, 'Times New Roman', serif" },
    { value: 'sans', label: '系统无衬线（苹方/雅黑）', font: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
    { value: 'song', label: '宋体（Songti/SimSun）', font: "'Songti SC', 'Noto Serif SC', 'SimSun', serif" },
    { value: 'kai', label: '楷体（Kaiti/KaiTi）', font: "'Kaiti SC', 'KaiTi', 'STKaiti', serif" },
    { value: 'black', label: '特粗黑体（900）', font: "'Space Grotesk', sans-serif", weight: 900 },
    { value: 'custom', label: '自定义字体（上传文件）', font: "serif", custom: true }
  ];
  function renderFontPreview() {
    var list = document.getElementById('fontPreviewList');
    if (!list) return;
    /* 自定义字体: 从文章 front matter 提取真实字体文件动态加载 */
    var customFont = null;
    var customFontName = 'CustomFontPreview';
    var i;
    for (i = 0; i < (ghPostsCache || []).length; i++) {
      var p = ghPostsCache[i];
      if (p.entryTitleFont === 'custom' && p.entryTitleFontFile) { customFont = p.entryTitleFontFile; customFontName = p.entryTitleFontName || customFontName; break; }
    }
    var customFontCss = '';
    if (customFont) {
      var format = 'truetype';
      if (/\.woff2$/i.test(customFont)) format = 'woff2';
      else if (/\.woff$/i.test(customFont)) format = 'woff';
      else if (/\.otf$/i.test(customFont)) format = 'opentype';
      customFontCss = "@font-face { font-family: '" + customFontName + "'; src: url('" + customFont + "?v=" + Date.now() + "') format('" + format + "'); font-display: swap; }";
      var st = document.createElement('style');
      st.id = 'fontPreviewCustomFace';
      st.textContent = customFontCss;
      var old = document.getElementById('fontPreviewCustomFace');
      if (old) old.remove();
      document.head.appendChild(st);
    }
    list.innerHTML = FONT_PREVIEWS.map(function (f) {
      var weight = f.weight ? 'font-weight:' + f.weight + ';' : '';
      var font = f.font;
      if (f.custom && customFont) font = "'" + customFontName + "', serif";
      var note = (f.custom && customFont) ? '（' + customFont.split('/').pop() + '）' : '';
      return '<div class="fp-item"><span class="fp-name">' + f.label + note + '</span>' +
        '<span class="fp-sample" style="font-family:' + font + ';' + weight + '">构建现代化博客｜Hello World</span></div>';
    }).join('');
  }

  var cardStyleSelect = document.getElementById('cfgCardStyle');
  if (cardStyleSelect) cardStyleSelect.addEventListener('change', syncCardPreviewSelect);

  var cardSaveBtn = document.getElementById('cfgCardSaveBtn');
  if (cardSaveBtn) cardSaveBtn.addEventListener('click', function () {
    var select = document.getElementById('cfgCardStyle');
    var style = select ? select.value : 'grid';
    var content = '# 卡片样式 (管理面板「卡片样式」可编辑)\n# grid = 网格 | horizontal = 横向长条 | fullscreen = 全屏杂志封面 | feature = 2:1 精选横幅\nstyle: "' + style + '"\n';
    var btn = cardSaveBtn;
    btn.disabled = true;
    btn.textContent = '保存中…';
    ghFetch('/repos/' + GH_REPO + '/contents/data/cards.yaml')
      .then(function (file) {
        cardsSha = file.sha;
        return ghFetch('/repos/' + GH_REPO + '/contents/data/cards.yaml', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '更新卡片样式: ' + style, content: base64Encode(content), sha: cardsSha })
        });
      })
      .then(function () {
        var styleLabel = style === 'horizontal' ? '横向长条' : style === 'fullscreen' ? '全屏杂志封面' : style === 'feature' ? '精选横幅' : '当前网格';
        showToast('卡片样式已保存：' + styleLabel + '，站点约 1 分钟重建生效', 'success');
        var hint = document.getElementById('cfgCardHint');
        if (hint) hint.textContent = '已提交，Cloudflare 重建中…';
      })
      .catch(function (error) {
        var errEl = document.getElementById('cfgCardError');
        if (errEl) { errEl.textContent = error.message || '保存失败'; errEl.hidden = false; }
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = '保存卡片样式';
      });
  });

  /* ── 浏览器登录 (本地 Cookie 桥: Chrome CDP 打开真实登录页 → 自动读取 HttpOnly Cookie) ──
     桥端点: http://localhost:8788 (GET /api/status, /api/open?url=, /api/cookies, /api/close)
     一键启动器: threads-repost/bridge/chrome-debug.sh / .bat */
  var browserBridgeBase = 'http://localhost:8788';
  var browserLoginBtn = document.getElementById('cfgThreadsBrowserLogin');
  var browserCancelBtn = document.getElementById('cfgThreadsBrowserCancel');
  var browserHintEl = document.getElementById('cfgThreadsBrowserHint');
  var browserErrorEl = document.getElementById('cfgThreadsBrowserError');
  var browserPollTimer = null;

  function setBrowserHint(msg) {
    if (browserHintEl) browserHintEl.textContent = msg || '';
  }
  function setBrowserError(msg) {
    if (browserErrorEl) { browserErrorEl.textContent = msg || ''; browserErrorEl.hidden = !msg; }
  }
  function browserBridgeFetch(path) {
    return fetch(browserBridgeBase + path, { cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { throw new Error('桥响应异常 (HTTP ' + r.status + ')'); });
    });
  }

  function stopBrowserPolling() {
    if (browserPollTimer) { clearInterval(browserPollTimer); browserPollTimer = null; }
    if (browserCancelBtn) browserCancelBtn.hidden = true;
    if (browserLoginBtn) { browserLoginBtn.disabled = false; browserLoginBtn.textContent = '打开浏览器登录'; }
  }

  function startBrowserLogin() {
    setBrowserError('');
    setBrowserHint('');
    browserBridgeFetch('/api/status').then(function (status) {
      if (!status.chrome) {
        setBrowserError('未检测到 Cookie 桥。请先运行一键启动器（threads-repost/bridge/chrome-debug.sh，Windows: chrome-debug.bat），启动后点「重试」。');
        return;
      }
      browserLoginBtn.disabled = true;
      browserLoginBtn.textContent = '等待登录…';
      if (browserCancelBtn) browserCancelBtn.hidden = false;
      return browserBridgeFetch('/api/open?url=' + encodeURIComponent('https://www.threads.com/'))
        .then(function (open) {
          if (!open.ok) throw new Error(open.error || '打开浏览器窗口失败');
          setBrowserHint('浏览器已弹出，请在弹出的窗口中登录 Threads（登录完成后自动获取）');
        });
    }).then(function () {
      var waited = 0;
      browserPollTimer = setInterval(function () {
        browserBridgeFetch('/api/cookies').then(function (r) {
          if (!r.ok) return;
          var c = r.cookies || {};
          var sessionid = c.sessionid;
          if (!sessionid) return;
          stopBrowserPolling();
          var cookie = 'sessionid=' + sessionid +
            (c.ds_user_id ? '; ds_user_id=' + c.ds_user_id : '') +
            (c.csrftoken ? '; csrftoken=' + c.csrftoken : '');
          try { localStorage.setItem(threadsCookieKey, cookie); } catch (e) {}
          if (threadsCookieInput) threadsCookieInput.value = cookie;
          updatePlatformStatus();
          setBrowserHint('登录成功 · Cookie 已自动保存');
          showToast('浏览器登录成功，Cookie 已保存', 'success');
          browserBridgeFetch('/api/close').catch(function () {});
        }).catch(function () {});
        waited += 2500;
        if (waited > 300000) {
          stopBrowserPolling();
          setBrowserError('等待登录超时（5 分钟）。请在弹出的浏览器中完成登录后重新点击按钮。');
        }
      }, 2500);
    }).catch(function (e) {
      stopBrowserPolling();
      setBrowserError((e && e.message) || '浏览器登录失败');
    });
  }

  if (browserLoginBtn) browserLoginBtn.addEventListener('click', function () {
    if (browserPollTimer) { stopBrowserPolling(); }
    startBrowserLogin();
  });
  if (browserCancelBtn) browserCancelBtn.addEventListener('click', function () {
    stopBrowserPolling();
    browserBridgeFetch('/api/close').catch(function () {});
    setBrowserHint('已取消');
  });

  /* ── Threads 串文转发 (平台管理面板: 自动登录 + Cookie + 爬取) ── */
  var threadsCookieKey = 'blog_threads_cookie';
  var threadsSaveBtn = document.getElementById('cfgThreadsSave');
  var threadsTestBtn = document.getElementById('cfgThreadsTest');
  var threadsFetchBtn = document.getElementById('cfgThreadsFetch');
  var threadsCookieInput = document.getElementById('cfgThreadsCookie');
  var threadsUrlInput = document.getElementById('cfgThreadsUrl');
  var threadsErrorEl = document.getElementById('cfgThreadsError');
  var threadsFetchErrorEl = document.getElementById('cfgThreadsFetchError');
  var threadsHintEl = document.getElementById('cfgThreadsHint');
  var threadsLoginBtn = document.getElementById('cfgThreadsLogin');
  var threadsLoginUser = document.getElementById('cfgThreadsUser');
  var threadsLoginPass = document.getElementById('cfgThreadsPass');
  var threadsLoginHintEl = document.getElementById('cfgThreadsLoginHint');
  var threadsLoginErrorEl = document.getElementById('cfgThreadsLoginError');
  var threadsClearBtn = document.getElementById('cfgThreadsClear');
  var platformStatusEl = document.getElementById('pltStatus');

  function setThreadsError(msg) {
    if (threadsErrorEl) { threadsErrorEl.textContent = msg || ''; threadsErrorEl.hidden = !msg; }
  }
  function setThreadsFetchError(msg) {
    if (threadsFetchErrorEl) { threadsFetchErrorEl.textContent = msg || ''; threadsFetchErrorEl.hidden = !msg; }
  }
  function setThreadsHint(msg) {
    if (threadsHintEl) threadsHintEl.textContent = msg || '';
  }
  function setThreadsLoginHint(msg) {
    if (threadsLoginHintEl) threadsLoginHintEl.textContent = msg || '';
  }
  function setThreadsLoginError(msg) {
    if (threadsLoginErrorEl) { threadsLoginErrorEl.textContent = msg || ''; threadsLoginErrorEl.hidden = !msg; }
  }
  function updatePlatformStatus() {
    if (!platformStatusEl) return;
    var cookie = '';
    try { cookie = localStorage.getItem(threadsCookieKey) || ''; } catch (e) {}
    if (!cookie) { platformStatusEl.textContent = ''; return; }
    var sid = (cookie.match(/sessionid=([^;\s]+)/) || [])[1] || '';
    platformStatusEl.innerHTML = '<span class="status-dot status-published"></span>Cookie 已配置' +
      (sid ? ' · sessionid ' + sid.slice(0, 8) + '…' : '');
  }
  if (threadsCookieInput) {
    try { threadsCookieInput.value = localStorage.getItem(threadsCookieKey) || ''; } catch (e) {}
  }
  updatePlatformStatus();
  if (threadsSaveBtn) threadsSaveBtn.addEventListener('click', function () {
    try { localStorage.setItem(threadsCookieKey, threadsCookieInput.value.trim()); } catch (e) {}
    setThreadsError('');
    updatePlatformStatus();
    showToast('Threads Cookie 已保存（存于本机浏览器）', 'success');
  });
  if (threadsClearBtn) threadsClearBtn.addEventListener('click', function () {
    try { localStorage.removeItem(threadsCookieKey); } catch (e) {}
    if (threadsCookieInput) threadsCookieInput.value = '';
    setThreadsError('');
    updatePlatformStatus();
    showToast('Cookie 已清除', 'success');
  });
  if (threadsLoginBtn) threadsLoginBtn.addEventListener('click', function () {
    var username = (threadsLoginUser.value || '').trim();
    var password = threadsLoginPass.value;
    if (!username || !password) { setThreadsLoginError('请输入账号和密码'); return; }
    setThreadsLoginError('');
    setThreadsLoginHint('');
    threadsLoginBtn.disabled = true;
    threadsLoginBtn.textContent = '登录中…';
    blogSupabase.functions.invoke('threads-login', { body: { username: username, password: password } })
      .then(function (res) {
        var data = res && res.data;
        if (!data || data.error) throw new Error((data && data.error) || '调用失败');
        try { localStorage.setItem(threadsCookieKey, data.cookie); } catch (e) {}
        if (threadsCookieInput) threadsCookieInput.value = data.cookie;
        updatePlatformStatus();
        setThreadsLoginHint('登录成功 · 已自动保存 Cookie');
        showToast('登录成功，Cookie 已自动保存', 'success');
        threadsLoginPass.value = '';
      })
      .catch(function (e) {
        var msg = (e && e.message) || String(e);
        setThreadsLoginError(msg + '（如需验证码/双因素，请用浏览器登录后手动粘贴 Cookie）');
      })
      .finally(function () {
        threadsLoginBtn.disabled = false;
        threadsLoginBtn.textContent = '自动登录';
      });
  });
  if (threadsTestBtn) threadsTestBtn.addEventListener('click', function () {
    var cookie = threadsCookieInput.value.trim();
    if (!cookie) { setThreadsError('请先填写 Cookie'); return; }
    setThreadsError('');
    threadsTestBtn.disabled = true;
    var url = 'https://www.threads.net/@zuck/post/C6S6o1sx7Rn';
    blogSupabase.functions.invoke('threads-fetch', { body: { url: url, cookie: cookie } })
      .then(function (res) {
        var data = res && res.data;
        if (!data || data.error) throw new Error((data && data.error) || '调用失败');
        setThreadsHint('连接成功 · 已生成资源: ' + (data.id || ''));
        showToast('Threads 连接成功', 'success');
      })
      .catch(function (e) {
        var msg = (e && e.message) || String(e);
        if (/Cookie|无效|过期/i.test(msg)) setThreadsError('Cookie 无效或已过期：' + msg);
        else setThreadsError('测试失败：' + msg + '（请确认已部署 Edge Function: supabase functions deploy threads-fetch）');
      })
      .finally(function () { threadsTestBtn.disabled = false; });
  });
  if (threadsFetchBtn) threadsFetchBtn.addEventListener('click', function () {
    var url = (threadsUrlInput.value || '').trim();
    var cookie = threadsCookieInput.value.trim();
    if (!url) { setThreadsFetchError('请输入 Threads 链接'); return; }
    if (!cookie) { setThreadsFetchError('请先保存 Cookie'); return; }
    if (!/threads\.(net|com)\/@[^/]+\/post\/[A-Za-z0-9_-]+/i.test(url)) { setThreadsFetchError('无效的 Threads 串文链接'); return; }
    setThreadsFetchError('');
    setThreadsHint('');
    threadsFetchBtn.disabled = true;
    threadsFetchBtn.textContent = '爬取中…';
    blogSupabase.functions.invoke('threads-fetch', { body: { url: url, cookie: cookie } })
      .then(function (res) {
        var data = res && res.data;
        if (!data || data.error) throw new Error((data && data.error) || '调用失败');
        setThreadsHint('已生成静态资源: ' + (data.publicUrl || ''));
        showToast('串文资源已生成', 'success');
      })
      .catch(function (e) {
        var msg = (e && e.message) || String(e);
        setThreadsFetchError('爬取失败：' + msg + '（Cookie 失效请重新自动登录；确认已部署 Edge Function 与 threads-reposts 桶）');
      })
      .finally(function () {
        threadsFetchBtn.disabled = false;
        threadsFetchBtn.textContent = '爬取并生成资源';
      });
  });

  renderFontPreview();
  var cfgSaveBtn = document.getElementById('cfgSaveBtn');
  if (cfgSaveBtn) cfgSaveBtn.addEventListener('click', saveWelcomeConfig);
  var cfgReloadBtn = document.getElementById('cfgReloadBtn');
  if (cfgReloadBtn) cfgReloadBtn.addEventListener('click', loadWelcomeConfig);
  var cfgNavSaveBtn = document.getElementById('cfgNavSaveBtn');
  if (cfgNavSaveBtn) cfgNavSaveBtn.addEventListener('click', saveNavBehaviorConfig);
  var cfgNavReloadBtn = document.getElementById('cfgNavReloadBtn');
  if (cfgNavReloadBtn) cfgNavReloadBtn.addEventListener('click', loadNavBehaviorConfig);

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
        if (refresh.dataset.adminRefresh === 'platform') updatePlatformStatus();
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
      window.Admin.confirmDialog({
        title: '[ 删除文章 ]',
        message: '确认删除文章「' + (post ? post.title : postName) + '」？此操作会从仓库删除文件，不可恢复。',
        confirmText: '删除',
        danger: true
      }).then(async function (ok) {
        if (!ok) return;
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
      });
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
      window.Admin.confirmDialog({
        title: '[ 删除仓库文件 ]',
        message: '确认删除仓库文件「' + ghDeleteMedia.dataset.ghMediaDelete + '」？此操作会提交删除，不可恢复。',
        confirmText: '删除',
        danger: true
      }).then(async function (ok) {
        if (!ok) return;
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
      });
      return;
    }

    var deleteMedia = event.target.closest('[data-media-delete]');
    if (deleteMedia) {
      window.Admin.confirmDialog({
        title: '[ 删除媒体 ]',
        message: '确认删除这个媒体资产？存储文件与记录将一并删除。',
        confirmText: '删除',
        danger: true
      }).then(async function (ok) {
        if (!ok) return;
      try {
        deleteMedia.disabled = true;
        await Admin.deleteMedia(deleteMedia.dataset.mediaDelete);
        await loadMedia();
      } catch (error) {
        showError(errorText(error));
      }
      });
    }
  });

  async function syncFontToGitHub(file) {
    var dataUrl = await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    var b64 = dataUrl.split(',')[1] || '';
    var fileName = file.name;
    var fontPath = '/repos/' + GH_REPO + '/contents/assets/images/' + encodeURIComponent(fileName);
    var ghHeaders = { 'Content-Type': 'application/json' };
    try {
      await ghFetch(fontPath, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({ message: '上传字体: ' + fileName, content: b64 })
      });
    } catch (error) {
      throw new Error('字体同步仓库失败（确认已授权 GitHub）：' + (error.message || error));
    }
    var list = [];
    var fs = null;
    try {
      fs = await ghFetch('/repos/' + GH_REPO + '/contents/static/fonts.json');
      list = JSON.parse(atob(String(fs.content).replace(/\s/g, '')));
    } catch (error) { /* 首次创建 */ }
    var entry = '/images/' + fileName;
    if (list.indexOf(entry) < 0) list.push(entry);
    try {
      await ghFetch('/repos/' + GH_REPO + '/contents/static/fonts.json', {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({
          message: '字体库更新: ' + fileName,
          content: base64Encode(JSON.stringify(list)),
          sha: fs ? fs.sha : undefined
        })
      });
    } catch (error) {
      throw new Error('字体清单更新失败：' + (error.message || error));
    }
  }

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
      var isFont = /^\.(ttf|otf|woff2?|eot)$/i.test('.' + (file.name.split('.').pop() || ''));
      if (isFont && getGhToken()) {
        await syncFontToGitHub(file);
        uploadButton.disabled = false;
        uploadButton.textContent = '上传媒体';
        showToast('字体已同步仓库，构建部署后编辑器下拉自动收录（约1分钟）', 'success');
        return;
      }
      var progressEl = document.getElementById('adminUploadProgress');
      var progressFill = document.getElementById('adminUploadProgressFill');
      var progressText = document.getElementById('adminUploadProgressText');
      if (progressEl) progressEl.hidden = false;
      await Admin.uploadMedia(file, function (event) {
        if (!progressFill || !progressText || !event) return;
        var pct = 0;
        if (event.total > 0) pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        else if (typeof event.progress === 'number') pct = Math.min(100, Math.round(event.progress * 100));
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      });
      if (progressEl) progressEl.hidden = true;
      if (progressFill) progressFill.style.width = '0%';
      input.value = '';
      await loadMedia();
    } catch (error) {
      var progressEl = document.getElementById('adminUploadProgress');
      if (progressEl) progressEl.hidden = true;
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
        loadNavBehaviorConfig();
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
