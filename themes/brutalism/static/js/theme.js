(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* ── 导航：下滑隐藏 / 上滑显示 ── */
  function initNavScroll() {
    var headers = [document.getElementById('siteHeader'), document.getElementById('siteHeaderMobile')].filter(Boolean);
    if (!headers.length) return;

    var lastY = window.scrollY;
    var ticking = false;
    var NAV_HIDE_THRESHOLD = 60;

    function update() {
      var y = window.scrollY;
      if (y < NAV_HIDE_THRESHOLD) {
        headers.forEach(function (h) { h.classList.remove('nav-hidden'); });
      } else if (y > lastY && y - lastY > NAV_HIDE_THRESHOLD) {
        headers.forEach(function (h) { h.classList.add('nav-hidden'); });
      } else if (y < lastY) {
        headers.forEach(function (h) { h.classList.remove('nav-hidden'); });
      }
      lastY = y;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
  }

  /* ── 移动端菜单 ── */
  /* ── 移动端左侧抽屉导航 ── */
  function initMobileMenu() {
    var toggle = document.getElementById('mobileMenuToggle');
    var drawer = document.getElementById('mobileDrawer');
    var mask = document.getElementById('drawerMask');
    var closeBtn = document.getElementById('drawerClose');
    if (!toggle || !drawer) return;

    function openDrawer() {
      mask.hidden = false;
      drawer.hidden = false;
      drawer.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      window.requestAnimationFrame(function () {
        drawer.classList.add('is-open');
        mask.classList.add('is-show');
      });
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      mask.classList.remove('is-show');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      window.setTimeout(function () {
        if (!drawer.classList.contains('is-open')) {
          drawer.hidden = true;
          mask.hidden = true;
          drawer.setAttribute('aria-hidden', 'true');
        }
      }, 180);
    }

    toggle.addEventListener('click', function () {
      if (drawer.hidden || !drawer.classList.contains('is-open')) openDrawer();
      else closeDrawer();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    mask.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeDrawer();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden && drawer.classList.contains('is-open')) closeDrawer();
    });

    var mobileLoginBtn = document.getElementById('mobileLoginBtn');
    if (mobileLoginBtn) {
      mobileLoginBtn.addEventListener('click', function () {
        closeDrawer();
        if (window.BlogAuth) window.BlogAuth.open('login');
        else if (document.getElementById('navLoginBtn')) document.getElementById('navLoginBtn').click();
      });
    }
  }

  /* ── 主题切换 ── */
  function initThemeToggle() {
    var toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    var stored = null;
    try { stored = window.localStorage.getItem('theme'); } catch (e) {}

    function apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
      try { window.localStorage.setItem('theme', theme); } catch (e) {}
    }
    if (stored === 'light' || stored === 'dark') apply(stored);

    toggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      apply(current === 'light' ? 'dark' : 'light');
    });
  }

  /* ── 滚动入场 ── */
  function initReveal() {
    var elements = document.querySelectorAll('[data-reveal]');
    if (!elements.length) return;

    if (!('IntersectionObserver' in window) || reducedMotion) {
      elements.forEach(function (el) { el.classList.add('reveal-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    elements.forEach(function (el, index) {
      el.style.setProperty('--reveal-delay', Math.min(index * 50, 300) + 'ms');
      observer.observe(el);
    });
  }

  /* ── TOC 滚动高亮 ── */
  function initTocScrollspy() {
    var toc = document.querySelector('.article-toc nav');
    if (!toc || reducedMotion) return;
    var links = toc.querySelectorAll('a');
    if (!links.length) return;

    var targets = Array.prototype.map.call(links, function (link) {
      var id = decodeURIComponent((link.getAttribute('href') || '').replace(/^#/, ''));
      return id ? document.getElementById(id) : null;
    });

    function highlight() {
      var current = null;
      targets.forEach(function (target, index) {
        if (!target) return;
        var rect = target.getBoundingClientRect();
        if (rect.top <= 90) current = links[index];
      });
      links.forEach(function (link) { link.classList.toggle('active', link === current); });
      if (current && 'scrollIntoView' in current.parentElement) {
        var container = toc.parentElement;
        var linkTop = current.getBoundingClientRect().top - container.getBoundingClientRect().top;
        if (linkTop < 0 || linkTop > container.clientHeight - 32) {
          container.scrollTop += linkTop - container.clientHeight / 2;
        }
      }
    }

    highlight();
    window.addEventListener('scroll', highlight, { passive: true });
  }

  /* ── 图片点击放大 (GLightbox 开源库: 缩放/淡入淡出动效 + 触摸手势) ── */
  var glightboxInstance = null;
  function initLightbox() {
    if (typeof window.GLightbox !== 'function') return;
    try {
      glightboxInstance = window.GLightbox({
        selector: '.article-body img, .moment-media img',
        touchNavigation: true,
        loop: false,
        zoomable: true,
        draggable: true,
        openEffect: 'zoom',
        closeEffect: 'zoom'
      });
      window.__blogLightbox = glightboxInstance;
    } catch (e) { /* GLightbox 未就绪时忽略 */ }
  }

  /* ── 欢迎页: ScrambleText 指针乱码标题 (GSAP SplitText + ScrambleTextPlugin, 与 Vue Bits 组件同源) + 页脚打字机 ── */
  function initWelcomeEffects() {
    var cfg = window.welcomeCfg || {};
    var reduced = reducedMotion;

    /* VariableProximity: 指针靠近 → 可变字体字重/opsz 插值 (与 Vue Bits 组件逻辑一致) */
    var titleEl = document.getElementById('welcomeTitle');
    if (titleEl) {
      var fromStr = cfg.titleVariationFrom || "'wght' 400, 'opsz' 9";
      var toStr = cfg.titleVariationTo || "'wght' 1000, 'opsz' 40";
      var radius = cfg.proximityRadius || 140;
      var falloff = cfg.proximityFalloff || 'linear';

      function parseSettings(str) {
        var map = {};
        String(str).split(',').forEach(function (s) {
          var p = s.trim().split(' ');
          if (p.length === 2) map[p[0].replace(/['"]/g, '')] = parseFloat(p[1]);
        });
        return map;
      }
      var from = parseSettings(fromStr);
      var to = parseSettings(toStr);
      var axes = Object.keys(from);

      /* 按词拆分字符 (空格保留) */
      var words = titleEl.textContent.split(' ');
      titleEl.textContent = '';
      var letters = [];
      words.forEach(function (word, wi) {
        var wSpan = document.createElement('span');
        wSpan.style.display = 'inline-block';
        wSpan.style.whiteSpace = 'nowrap';
        word.split('').forEach(function (ch) {
          var s = document.createElement('span');
          s.style.display = 'inline-block';
          s.style.fontVariationSettings = fromStr;
          s.textContent = ch;
          wSpan.appendChild(s);
          letters.push(s);
        });
        titleEl.appendChild(wSpan);
        if (wi < words.length - 1) titleEl.appendChild(document.createTextNode(' '));
      });
      if (reduced) return;

      function calcFalloff(distance) {
        var norm = Math.min(Math.max(1 - distance / radius, 0), 1);
        if (falloff === 'exponential') return norm * norm;
        if (falloff === 'gaussian') return Math.exp(-Math.pow(distance / (radius / 2), 2) / 2);
        return norm;
      }

      var mx = 0, my = 0, lx = null, ly = null;
      function loop() {
        if (mx !== lx || my !== ly) {
          lx = mx; ly = my;
          letters.forEach(function (s) {
            var r = s.getBoundingClientRect();
            var cx = r.left + r.width / 2;
            var cy = r.top + r.height / 2;
            var d = Math.sqrt((mx - cx) * (mx - cx) + (my - cy) * (my - cy));
            if (d >= radius) {
              if (s.style.fontVariationSettings !== fromStr) s.style.fontVariationSettings = fromStr;
              return;
            }
            var f = calcFalloff(d);
            var settings = axes.map(function (a) {
              return "'" + a + "' " + (from[a] + (to[a] - from[a]) * f);
            }).join(', ');
            s.style.fontVariationSettings = settings;
          });
        }
        requestAnimationFrame(loop);
      }
      window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
      window.addEventListener('touchmove', function (e) {
        var t = e.touches[0];
        if (t) { mx = t.clientX; my = t.clientY; }
      }, { passive: true });
      requestAnimationFrame(loop);
    }

    /* 页脚打字机 (data 配置循环) */
    var typeEl = document.getElementById('welcomeType');
    if (typeEl) {
      var text2 = cfg.typewriterText || '写代码，也写生活。记录学习与思考。';
      var typeMs = cfg.typeSpeed || 70;
      var delMs = cfg.deleteSpeed || 38;
      var pauseMs = cfg.pause || 1800;
      if (reduced) {
        typeEl.textContent = text2;
      } else {
        var ci = 0, deleting = false;
        (function tick() {
          if (deleting) {
            ci--;
            typeEl.textContent = text2.slice(0, Math.max(0, ci));
            if (ci <= 0) { deleting = false; setTimeout(tick, 400); return; }
            setTimeout(tick, delMs);
          } else {
            if (ci < text2.length) {
              ci++;
              typeEl.textContent = text2.slice(0, ci);
              setTimeout(tick, typeMs);
            } else {
              setTimeout(function () { deleting = true; tick(); }, pauseMs);
            }
          }
        })();
      }
    }
  }

  /* ── 搜索 (Fuse.js + index.json) ── */
  var fuseCache = null;
  var fuseIndexData = [];
  var fusePromise = null;
  var inputIndexUrl = null;

  function loadFuse() {
    if (fusePromise) return fusePromise;
    fusePromise = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.basic.min.js';
      script.onload = function () { resolve(window.Fuse); };
      script.onerror = function () { resolve(null); };
      document.head.appendChild(script);
    });
    return fusePromise;
  }

  function getFuse() {
    if (fuseCache) return Promise.resolve(fuseCache);
    var indexUrl = inputIndexUrl || new URL('index.json', window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/')).toString();
    return Promise.all([loadFuse(), fetch(indexUrl).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })])
      .then(function (results) {
        var Fuse = results[0];
        var data = results[1];
        fuseIndexData = data;
        if (!Fuse || !data.length) return null;
        fuseCache = new Fuse(data, {
          isCaseSensitive: false,
          shouldSort: true,
          includeScore: false,
          threshold: 0.4,
          minMatchCharLength: 0,
          keys: ['title', 'content', 'summary', 'tags']
        });
        return fuseCache;
      });
  }

  function renderResults(container, results) {
    container.innerHTML = '';
    if (!results || !results.length) {
      var empty = document.createElement('div');
      empty.className = 'sr-empty mono';
      empty.style.cssText = 'font-size:11px;color:var(--faint);padding:10px 4px;';
      empty.textContent = '[ NO MATCH ]';
      container.appendChild(empty);
      return;
    }
    results.forEach(function (result, index) {
      var item = result.item || result;
      var el = document.createElement('a');
      el.className = 'sr-item' + (index === 0 ? ' selected' : '');
      el.href = item.permalink || item.link || item.uri || '#';
      var title = document.createElement('span');
      title.className = 'sr-title';
      title.textContent = item.title || '(untitled)';
      var meta = document.createElement('span');
      meta.className = 'sr-meta';
      var date = item.date ? item.date.slice(0, 10).replace(/-/g, ' · ') : '';
      meta.textContent = [date, item.section].filter(Boolean).join(' — ');
      el.appendChild(title);
      el.appendChild(meta);
      container.appendChild(el);
    });
  }

  function initSearchController(overlayInputId, resultsId, statusId, closeOnEnter) {
    var input = document.getElementById(overlayInputId);
    if (!input) return null;
    if (input.dataset.index) inputIndexUrl = input.dataset.index;
    var results = document.getElementById(resultsId);
    var status = document.getElementById(statusId);
    if (!results) return null;

    var selectedIndex = 0;
    var items = [];

    function doSearch(query) {
      getFuse().then(function (fuse) {
        if (!fuse) {
          if (status) { status.hidden = false; status.textContent = '索引不可用：请确认已配置 outputs.home 的 JSON 输出。'; }
          renderResults(results, []);
          return;
        }
        var found;
        if (query.trim()) {
          found = fuse.search(query).slice(0, 8);
        } else {
          found = fuseIndexData.slice(0, 8);
        }
        items = found.map(function (r) { return r.item || r; });
        selectedIndex = 0;
        renderResults(results, found);
        updateSelection();
      });
    }

    function updateSelection() {
      Array.prototype.forEach.call(results.children, function (child, index) {
        child.classList.toggle('selected', index === selectedIndex);
      });
    }

    function move(delta) {
      if (!items.length) return;
      selectedIndex = (selectedIndex + delta + items.length) % items.length;
      updateSelection();
    }

    function go() {
      if (!items.length) return;
      var item = items[selectedIndex];
      window.location.href = item.permalink || item.link || item.uri || '#';
    }

    input.addEventListener('input', function () { doSearch(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
      else if (e.key === 'Escape' && closeOnEnter) { closeOverlay(); }
    });
    results.addEventListener('click', function (e) {
      var item = e.target.closest('.sr-item');
      if (item) window.location.href = item.href;
    });

    doSearch('');
    return { focus: function () { input.focus(); }, clear: function () { input.value = ''; doSearch(''); } };
  }

  /* ── 搜索浮层 (Ctrl+K) ── */
  var overlayController = null;
  function initSearchOverlay() {
    var overlay = document.getElementById('searchOverlay');
    var trigger = document.getElementById('searchTrigger');
    if (!overlay || !trigger) return;
    overlayController = initSearchController('searchInput', 'searchResults', 'searchStatus', true);

    function openOverlay() {
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      if (overlayController) overlayController.focus();
    }
    window.closeOverlay = function () {
      overlay.hidden = true;
      document.body.style.overflow = '';
    };

    trigger.addEventListener('click', openOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    document.getElementById('searchClose').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.hidden) openOverlay();
        else closeOverlay();
      }
      if (e.key === 'Escape' && !overlay.hidden) closeOverlay();
    });
  }

  /* ── 搜索页 ── */
  function initSearchPage() {
    initSearchController('searchInputPage', 'searchResultsPage', 'searchStatusPage', false);
  }

  function boot() {
    initLightbox();
    initWelcomeEffects();
    initNavScroll();
    initMobileMenu();
    initThemeToggle();
    initReveal();
    initTocScrollspy();
    initSearchOverlay();
    initSearchPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
