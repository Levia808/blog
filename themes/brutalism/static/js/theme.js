(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var themeScriptSrc = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  document.documentElement.classList.add('js');

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function setNavAuthProgress(progress) {
    var header = document.getElementById('siteHeader');
    if (!header) return;
    var actions = header.querySelector('.nf-actions');
    if (!actions || actions.offsetWidth === 0) return;

    var p = clamp01(progress);
    var rect = actions.getBoundingClientRect();
    var offscreenX = Math.max(96, window.innerWidth - rect.left + 24);
    var alpha = clamp01((p - 0.08) / 0.34);
    alpha = alpha * alpha * (3 - 2 * alpha);

    header.style.setProperty('--nav-auth-track-x', Math.round(offscreenX * (1 - p)) + 'px');
    header.style.setProperty('--nav-auth-track-opacity', alpha.toFixed(3));
  }

  function forceInitialScrollTop() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    window.requestAnimationFrame(function () { window.scrollTo(0, 0); });
  }
  forceInitialScrollTop();
  [40, 120, 280, 600, 1000].forEach(function (delay) {
    window.setTimeout(forceInitialScrollTop, delay);
  });
  document.addEventListener('DOMContentLoaded', forceInitialScrollTop, { once: true });
  window.addEventListener('load', forceInitialScrollTop, { once: true });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      forceInitialScrollTop();
      window.setTimeout(forceInitialScrollTop, 120);
    }
  });

  /* ── 导航：下滑隐藏 / 上滑显示 ── */
  function initNavScroll() {
    var headers = [document.getElementById('siteHeader'), document.getElementById('siteHeaderMobile')].filter(Boolean);
    if (!headers.length) return;
    var behavior = document.body.dataset.navBehavior || 'auto';
    if (behavior === 'fixed') {
      headers.forEach(function (h) { h.classList.remove('nav-hidden'); });
      document.body.classList.remove('nav-is-hidden');
      if (!document.body.classList.contains('home-page')) setNavAuthProgress(1);
      return;
    }

    var lastY = window.scrollY;
    var ticking = false;
    var NAV_HIDE_THRESHOLD = 60;
    var SCROLL_DELTA = 4;

    function update() {
      var y = window.scrollY;
      if (y < NAV_HIDE_THRESHOLD) {
        headers.forEach(function (h) { h.classList.remove('nav-hidden'); });
        document.body.classList.remove('nav-is-hidden');
        if (!document.body.classList.contains('home-page')) setNavAuthProgress(1);
      } else if (y > lastY + SCROLL_DELTA) {
        headers.forEach(function (h) { h.classList.add('nav-hidden'); });
        document.body.classList.add('nav-is-hidden');
        if (!document.body.classList.contains('home-page')) setNavAuthProgress(0);
      } else if (y < lastY - SCROLL_DELTA) {
        headers.forEach(function (h) { h.classList.remove('nav-hidden'); });
        document.body.classList.remove('nav-is-hidden');
        if (!document.body.classList.contains('home-page')) setNavAuthProgress(1);
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
    if (mobileLoginBtn && mobileLoginBtn.tagName !== 'A') {
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

  /* Fullscreen card paging + title entrance effects */
  function initFullscreenCards() {
    var list = document.querySelector('.card-list--fullscreen');
    var cards = list ? Array.prototype.slice.call(list.querySelectorAll('.post-card-fullscreen')) : [];
    var effectCards = Array.prototype.slice.call(document.querySelectorAll('.post-card-fullscreen, .post-card-feature'));
    if (!cards.length && !effectCards.length) return;
    if (list && cards.length) document.documentElement.classList.add('fullscreen-snap-enabled');

    function wrapTitleUnits(title) {
      if (!title || title.dataset.unitsReady === '1') return;
      var textNodes = [];
      var walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) textNodes.push(node);

      var index = 0;
      textNodes.forEach(function (textNode) {
        var text = textNode.nodeValue || '';
        if (!text.trim()) return;
        var fragment = document.createDocumentFragment();
        text.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
            return;
          }
          var units = /[\u3400-\u9fff]/.test(part) ? Array.from(part) : [part];
          units.forEach(function (unit) {
            var span = document.createElement('span');
            span.className = 'pcf-title-unit';
            span.style.setProperty('--pcf-title-index', String(index++));
            span.textContent = unit;
            fragment.appendChild(span);
          });
        });
        textNode.parentNode.replaceChild(fragment, textNode);
      });
      title.dataset.unitsReady = '1';
    }

    effectCards.forEach(function (card) {
      var title = card.querySelector('.pcf-title[data-title-effect]');
      if (title) wrapTitleUnits(title);
    });

    var activeIndex = 0;
    var locked = false;
    var shufflePool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    function runShuffle(title) {
      if (!title || title.dataset.shufflePlayed === '1' || reducedMotion) return;
      var units = title.querySelectorAll('.pcf-title-unit');
      if (!units.length) return;
      title.dataset.shufflePlayed = '1';
      var originals = Array.prototype.map.call(units, function (unit) { return unit.textContent; });
      var frame = 0;
      var total = 14;
      var interval = window.setInterval(function () {
        frame++;
        units.forEach(function (unit, index) {
          var revealAt = Math.floor((index / Math.max(units.length, 1)) * total);
          if (frame >= revealAt + 3 || frame >= total) {
            unit.textContent = originals[index];
          } else {
            unit.textContent = shufflePool[Math.floor(Math.random() * shufflePool.length)];
          }
        });
        if (frame >= total) window.clearInterval(interval);
      }, 34);
    }

    function setActive(index) {
      if (index < 0 || index >= effectCards.length) return;
      activeIndex = index;
      effectCards.forEach(function (card, cardIndex) {
        var active = cardIndex === index;
        card.classList.toggle('is-card-active', active);
        if (!active) {
          var inactiveTitle = card.querySelector('.pcf-title[data-title-effect="shuffle"]');
          if (inactiveTitle) inactiveTitle.dataset.shufflePlayed = '';
        }
      });
      var title = effectCards[index].querySelector('.pcf-title[data-title-effect="shuffle"]');
      runShuffle(title);
    }

    setActive(0);

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var best = null;
        entries.forEach(function (entry) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) best = entry;
        });
        if (best) {
          var index = effectCards.indexOf(best.target);
          if (index >= 0) setActive(index);
        }
      }, { threshold: [0.25, 0.55, 0.75], rootMargin: '-8% 0px -8% 0px' });
      effectCards.forEach(function (card) { observer.observe(card); });
    }

    if (!list || !cards.length) return;

    function inCardViewport() {
      var rect = list.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    function nearestCardIndex() {
      var bestIndex = activeIndex;
      var bestDistance = Infinity;
      cards.forEach(function (card, index) {
        var distance = Math.abs(card.getBoundingClientRect().top);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    }

    function moveCard(direction) {
      var current = nearestCardIndex();
      var next = Math.max(0, Math.min(cards.length - 1, current + direction));
      if (next === current) return false;
      cards[next].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      locked = true;
      window.setTimeout(function () { locked = false; }, reducedMotion ? 80 : 680);
      return true;
    }

    list.addEventListener('wheel', function (event) {
      /* Lenis 平滑滚动接管时禁用卡片级 wheel 导航 (避免双滚动源冲突) */
      if (window.__lenis) return;
      if (Math.abs(event.deltaY) < 18 || Math.abs(event.deltaY) < Math.abs(event.deltaX) || !inCardViewport()) return;
      var direction = event.deltaY > 0 ? 1 : -1;
      var current = nearestCardIndex();
      var atBoundary = (current === 0 && direction < 0) || (current === cards.length - 1 && direction > 0);
      if (atBoundary) return;
      event.preventDefault();
      if (!locked) moveCard(direction);
    }, { passive: false });

    var touchStartY = null;
    list.addEventListener('touchstart', function (event) {
      if (event.touches[0]) touchStartY = event.touches[0].clientY;
    }, { passive: true });
    list.addEventListener('touchend', function (event) {
      if (touchStartY == null || !event.changedTouches[0] || !inCardViewport()) return;
      var delta = touchStartY - event.changedTouches[0].clientY;
      touchStartY = null;
      if (Math.abs(delta) < 42) return;
      var direction = delta > 0 ? 1 : -1;
      var current = nearestCardIndex();
      var atBoundary = (current === 0 && direction < 0) || (current === cards.length - 1 && direction > 0);
      if (!atBoundary && !locked) moveCard(direction);
    }, { passive: true });

    document.addEventListener('keydown', function (event) {
      if (!inCardViewport() || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      var direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1
        : event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 0;
      if (!direction) return;
      var current = nearestCardIndex();
      var atBoundary = (current === 0 && direction < 0) || (current === cards.length - 1 && direction > 0);
      if (atBoundary) return;
      event.preventDefault();
      if (!locked) moveCard(direction);
    });
  }

  /* ── TOC 滚动高亮 ── */
  function initTocScrollspy() {
    var tocs = document.querySelectorAll('.article-toc nav');
    if (!tocs.length || reducedMotion) return;
    var entries = [];
    tocs.forEach(function (toc) {
      var links = toc.querySelectorAll('a');
      if (!links.length) return;
      var targets = Array.prototype.map.call(links, function (link) {
        var id = decodeURIComponent((link.getAttribute('href') || '').replace(/^#/, ''));
        return id ? document.getElementById(id) : null;
      });
      entries.push({ links: links, targets: targets, toc: toc });
    });
    if (!entries.length) return;

    function highlight() {
      entries.forEach(function (entry) {
        var current = null;
        entry.targets.forEach(function (target, index) {
          if (!target) return;
          var rect = target.getBoundingClientRect();
          if (rect.top <= 90) current = entry.links[index];
        });
        entry.links.forEach(function (link) { link.classList.toggle('active', link === current); });
        if (current && 'scrollIntoView' in current.parentElement) {
          var container = entry.toc.parentElement;
          var linkTop = current.getBoundingClientRect().top - container.getBoundingClientRect().top;
          if (linkTop < 0 || linkTop > container.clientHeight - 32) {
            container.scrollTop += linkTop - container.clientHeight / 2;
          }
        }
      });
    }

    highlight();
    window.addEventListener('scroll', highlight, { passive: true });
  }

  /* ── 触控板横向手势: 图片 lightbox 打开时, 双指左滑下一张/右滑上一张 (wheel deltaX) ── */
    var trackpadSwipeCleanup = null;

  /* ── 触控板手势 (lightbox 打开时启用):
     横向: 手指左滑下一张/右滑上一张 (与触摸一致) + preventDefault 禁用浏览器历史手势
     纵向下滑: 跟手下拉 (图片跟随 + 遮罩变亮) → 松手超过阈值飞离关闭 / 否则平滑回弹 */
  function enableTrackpadSwipe(lightbox) {
    var lastSwipe = 0;
    var drag = null;

    function slideEl() {
      var cur = document.querySelector('.gslide.current .gslide-inner-content');
      return cur || document.querySelector('.gslide-inner-content');
    }
    function overlayEl() {
      return document.querySelector('.goverlay');
    }
    function release() {
      if (!drag) return;
      var total = drag.total;
      var slide = drag.slide;
      var overlay = drag.overlay;
      drag = null;
      var close = total > 140;
      var dur = close ? 0.3 : 0.38;
      var ease = 'cubic-bezier(.16,1,.3,1)';
      if (slide) { slide.style.transition = 'transform ' + dur + 's ' + ease; slide.style.transform = close ? 'translateY(120vh)' : 'translateY(0)'; }
      if (overlay) { overlay.style.transition = 'opacity ' + dur + 's ' + ease; overlay.style.opacity = close ? '0' : ''; }
      if (close) {
        setTimeout(function () {
          if (slide) { slide.style.transition = ''; slide.style.transform = ''; }
          if (overlay) { overlay.style.transition = ''; overlay.style.opacity = ''; }
          lightbox.close();
        }, dur * 1000);
      }
    }

    function onWheel(e) {
      e.preventDefault();
      var dx = e.deltaX;
      var dy = e.deltaY;
      var now = Date.now();
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        if (now - lastSwipe > 320) {
          lastSwipe = now;
          /* 手指左滑(dx>0, 自然滚动内容右移) → 下一张 — 与触摸手势方向一致 */
          if (dx > 0) lightbox.nextSlide();
          else lightbox.prevSlide();
        }
        return;
      }
      if (dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
        if (!drag) {
          var slide = slideEl();
          var overlay = overlayEl();
          drag = { total: 0, slide: slide, overlay: overlay };
          if (slide) slide.style.transition = 'none';
          if (overlay) overlay.style.transition = 'none';
        }
        drag.total += dy;
        var off = Math.min(drag.total, 480);
        if (drag.slide) drag.slide.style.transform = 'translateY(' + off.toFixed(1) + 'px)';
        if (drag.overlay) drag.overlay.style.opacity = String(Math.max(0.3, 0.85 - off / 700)).slice(0, 4);
        clearTimeout(drag.timer);
        drag.timer = setTimeout(release, 160);
      }
    }

    document.addEventListener('wheel', onWheel, { passive: false });
    return function () {
      document.removeEventListener('wheel', onWheel);
      release();
      var slide = slideEl();
      var overlay = overlayEl();
      if (slide) { slide.style.transition = ''; slide.style.transform = ''; }
      if (overlay) { overlay.style.transition = ''; overlay.style.opacity = ''; }
    };
  }


  /* ── 图片点击放大 (GLightbox 开源库: 缩放/淡入淡出动效 + 触摸手势 + 触控板横滑) ── */
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
      glightboxInstance.on('open', function () {
        if (!trackpadSwipeCleanup) trackpadSwipeCleanup = enableTrackpadSwipe(glightboxInstance);
      });
      glightboxInstance.on('close', function () {
        if (trackpadSwipeCleanup) { trackpadSwipeCleanup(); trackpadSwipeCleanup = null; }
      });
    } catch (e) { /* GLightbox 未就绪时忽略 */ }
  }

  /* ── 欢迎页: ScrambleText 指针乱码标题 (GSAP SplitText + ScrambleTextPlugin, 与 Vue Bits 组件同源) + 页脚打字机 ── */
  function initWelcomeEffects() {
    var cfg = window.welcomeCfg || {};
    var reduced = reducedMotion;

    /* 标题自适应: 字号撑满视口宽度 (占满页面) */
    var titleEl = document.getElementById('welcomeTitle');
    if (titleEl) {
      function fitTitle() {
        var spans = titleEl.querySelectorAll('.st-char');
        if (!spans.length) return;
        var maxW = window.innerWidth * 0.94;
        var maxH = window.innerHeight * 0.72;
        var fs = 240;
        titleEl.style.fontSize = fs + 'px';
        for (var i = 0; i < 20; i++) {
          var w = 0;
          spans.forEach(function (s) { w += s.getBoundingClientRect().width; });
          var h = titleEl.getBoundingClientRect().height;
          if (w <= maxW && h <= maxH) break;
          fs = fs * Math.min(maxW / (w || 1), maxH / (h || 1));
          if (fs < 14) fs = 14;
          titleEl.style.fontSize = fs + 'px';
        }
      }
      /* VariableProximity: 指针靠近 → 可变字体字重/opsz 插值 (与 Vue Bits 组件逻辑一致) */
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

      /* 按词拆分字符 (空格保留), 继承标题字体 (杂志感衬线) */
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
      fitTitle();
      window.addEventListener('resize', fitTitle);
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

  /* ── ShapeBlur 叠加 (three.js shader, Vue Bits 组件移植, 苔绿) ── */
  function initShapeBlur() {
    var mount = document.getElementById('shapeBlur');
    if (!mount || typeof window.THREE === 'undefined') return;
    var THREE = window.THREE;

    var vertexShader = 'varying vec2 v_texcoord; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); v_texcoord = uv; }';

    var fragmentShader = [
      'varying vec2 v_texcoord;',
      'uniform vec2 u_mouse; uniform vec2 u_resolution; uniform float u_pixelRatio;',
      'uniform float u_shapeSize; uniform float u_roundness; uniform float u_borderSize;',
      'uniform float u_circleSize; uniform float u_circleEdge;',
      '#define PI 3.1415926535897932384626433832795',
      '#define TWO_PI 6.2831853071795864769252867665590',
      'vec2 coord(in vec2 p) { p = p / u_resolution.xy; if (u_resolution.x > u_resolution.y) { p.x *= u_resolution.x / u_resolution.y; p.x += (u_resolution.y - u_resolution.x) / u_resolution.y / 2.0; } else { p.y *= u_resolution.y / u_resolution.x; p.y += (u_resolution.x - u_resolution.y) / u_resolution.x / 2.0; } p -= 0.5; p *= vec2(-1.0, 1.0); return p; }',
      '#define st0 coord(gl_FragCoord.xy)',
      '#define mx coord(u_mouse * u_pixelRatio)',
      'float sdRoundRect(vec2 p, vec2 b, float r) { vec2 d = abs(p - 0.5) * 4.2 - b + vec2(r); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r; }',
      'float sdCircle(in vec2 st, in vec2 center) { return length(st - center) * 2.0; }',
      'float sdPoly(in vec2 p, in float w, in int sides) { float a = atan(p.x, p.y) + PI; float r = TWO_PI / float(sides); float d = cos(floor(0.5 + a / r) * r - a) * length(max(abs(p) * 1.0, 0.0)); return d * 2.0 - w; }',
      'float aastep(float threshold, float value) { float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757; return smoothstep(threshold - afwidth, threshold + afwidth, value); }',
      'float fill(in float x) { return 1.0 - aastep(0.0, x); }',
      'float fill(float x, float size, float edge) { return 1.0 - smoothstep(size - edge, size + edge, x); }',
      'float strokeAA(float x, float size, float w, float edge) { float afwidth = length(vec2(dFdx(x), dFdy(x))) * 0.70710678; float d = smoothstep(size - edge - afwidth, size + edge + afwidth, x + w * 0.5) - smoothstep(size - edge - afwidth, size + edge + afwidth, x - w * 0.5); return clamp(d, 0.0, 1.0); }',
      'void main() {',
      '  vec2 st = st0 + 0.5;',
      '  vec2 posMouse = mx * vec2(1., -1.) + 0.5;',
      '  float size = u_shapeSize; float roundness = u_roundness; float circleSize = u_circleSize; float circleEdge = u_circleEdge;',
      '  float sdf = sdRoundRect(st, vec2(size), roundness);',
      '  float shapeMask = 1.0 - smoothstep(0.0, 0.12, sdf);',
      '  float dissolve = fill(sdCircle(st, posMouse), circleSize, circleEdge);',
      '  float alpha = shapeMask * dissolve;',
      '  vec3 color = vec3(0.42, 0.55, 0.42);',
      '  gl_FragColor = vec4(color.rgb, alpha);',
      '}'
    ].join('\n');

    var cfg = window.welcomeCfg || {};
    var variation = 0;

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera();
    camera.position.z = 1;

    var renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    var geo = new THREE.PlaneGeometry(1, 1);
    var material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        u_mouse: { value: new THREE.Vector2() },
        u_resolution: { value: new THREE.Vector2() },
        u_pixelRatio: { value: 1 },
        u_shapeSize: { value: cfg.shapeSize || 1.2 },
        u_roundness: { value: cfg.roundness || 0.4 },
        u_borderSize: { value: cfg.borderSize || 0.05 },
        u_circleSize: { value: cfg.circleSize || 0.3 },
        u_circleEdge: { value: cfg.circleEdge || 0.5 }
      },
      defines: { VAR: variation },
      transparent: true
    });
    var quad = new THREE.Mesh(geo, material);
    scene.add(quad);

    var vMouse = new THREE.Vector2();
    var vMouseDamp = new THREE.Vector2();
    var vResolution = new THREE.Vector2();

    function onPointerMove(e) {
      var rect = mount.getBoundingClientRect();
      vMouse.set(e.clientX - rect.left, e.clientY - rect.top);
    }
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('pointermove', onPointerMove);

    var w, h;
    function resize() {
      w = mount.clientWidth;
      h = mount.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setSize(w, h);
      renderer.setPixelRatio(dpr);
      camera.left = -w / 2; camera.right = w / 2;
      camera.top = h / 2; camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      quad.scale.set(w, h, 1);
      vResolution.set(w, h).multiplyScalar(dpr);
      material.uniforms.u_pixelRatio.value = dpr;
    }
    resize();
    window.addEventListener('resize', resize);

    var active = true;
    var lastTime = 0;
    var rafId;
    function update() {
      if (!active) return;
      var time = performance.now() * 0.001;
      var dt = time - lastTime;
      lastTime = time;
      vMouseDamp.x = THREE.MathUtils.damp(vMouseDamp.x, vMouse.x, 8, dt);
      vMouseDamp.y = THREE.MathUtils.damp(vMouseDamp.y, vMouse.y, 8, dt);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(update);
    }
    update();

    window.__shapeBlurCleanup = function () {
      active = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('pointermove', onPointerMove);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }

  /* ── Sparks 火花 (全局点击迸发, Vue Bits ClickSpark 移植, 苔绿) ── */
  function initClickSparks() {
    if (reducedMotion) return;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var cfg = window.welcomeCfg || {};
    var sparkColor = cfg.sparkColor || '#6B8B6B';
    var sparkSize = cfg.sparkSize || 10;
    var sparkRadius = cfg.sparkRadius || 15;
    var sparkCount = cfg.sparkCount || 8;
    var duration = cfg.sparkDuration || 400;
    var extraScale = cfg.sparkExtraScale || 1.0;
    var easing = cfg.sparkEasing || 'ease-out';

    function easeOut(t) { return t * (2 - t); }
    function easeIn(t) { return t * t; }
    function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    function easeFn(t) {
      if (easing === 'linear') return t;
      if (easing === 'ease-in') return easeIn(t);
      if (easing === 'ease-in-out') return easeInOut(t);
      return easeOut(t);
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    var sparks = [];
    var rafId;
    function draw(timestamp) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparks = sparks.filter(function (spark) {
        var elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;
        var progress = elapsed / duration;
        var eased = easeFn(progress);
        var dist = eased * sparkRadius * extraScale;
        var lineLen = sparkSize * (1 - eased);
        var x1 = spark.x + dist * Math.cos(spark.angle);
        var y1 = spark.y + dist * Math.sin(spark.angle);
        var x2 = spark.x + (dist + lineLen) * Math.cos(spark.angle);
        var y2 = spark.y + (dist + lineLen) * Math.sin(spark.angle);
        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return true;
      });
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    document.addEventListener('click', function (e) {
      for (var i = 0; i < sparkCount; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / sparkCount, startTime: performance.now() });
      }
    });
  }

  /* ── 文本乱码转化 hover (韩/日/西里尔字符池 → 原标题, 参考 noartmusic.com) ── */
  function initScrambleHover() {
    if (reducedMotion) return;
    var SCRAMBLE_POOL = '가나다라마바사아자차카타파하あいうえおかきこさしすせそАБВГДЕЖЗИКЛМНОПР×÷±§#%&$@';
    var targets = document.querySelectorAll('.pc-title[data-scramble="1"], .pcf-title[data-scramble="1"], .article-title[data-scramble="1"], .archive-link');
    if (!targets.length) return;

    function scrambleTo(el, original) {
      var frame = 0;
      var total = 12;
      var iv = setInterval(function () {
        frame++;
        var reveal = Math.floor((frame / total) * original.length);
        var out = '';
        for (var i = 0; i < original.length; i++) {
          var ch = original[i];
          if (ch === ' ') out += ' ';
          else if (i < reveal) out += ch;
          else out += SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
        }
        el.textContent = out;
        if (frame >= total) { clearInterval(iv); el.innerHTML = original; el.dataset.iv = ''; }
      }, 42);
      return iv;
    }

    targets.forEach(function (el) {
      if (el.dataset.original != null) return;
      el.dataset.original = el.innerHTML;
      /* 判定区域扩大: 标题绑定到整个卡片, 导航/归档链接绑定到父容器 */
      var zone = el.closest('.post-card-cover, .post-card-fullscreen, .post-card-feature, .blog-section__head, .pagination, .article-toc');
      if (!zone || zone === el) zone = el.parentElement || el;
      function zoneEnter() {
        if (el.dataset.iv) { clearInterval(Number(el.dataset.iv)); el.dataset.iv = ''; }
        el.dataset.iv = String(scrambleTo(el, el.dataset.original));
      }
      function zoneLeave() {
        if (el.dataset.iv) { clearInterval(Number(el.dataset.iv)); el.dataset.iv = ''; }
        el.innerHTML = el.dataset.original;
      }
      zone.addEventListener('mouseenter', zoneEnter);
      zone.addEventListener('mouseleave', zoneLeave);
      el.addEventListener('mouseenter', zoneEnter);
      el.addEventListener('mouseleave', zoneLeave);
    });
  }

  /* ── 卡片封面图 hover 放大 + 鼠标视差跟随 ── */
  function initCoverParallax() {
    if (reducedMotion) return;
    document.querySelectorAll('.post-card-cover .pc-img').forEach(function (wrap) {
      var img = wrap.querySelector('img');
      if (!img) return;
      var settleTimer = null;
      img.style.transition = 'transform 320ms cubic-bezier(.22,.61,.36,1)';
      wrap.addEventListener('mousemove', function (e) {
        var r = wrap.getBoundingClientRect();
        var dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        var dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
        img.style.transform = 'scale(1.16) translate(' + (dx * 18).toFixed(1) + 'px,' + (dy * 14).toFixed(1) + 'px)';
      });
      wrap.addEventListener('mouseleave', function () {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(function () { img.style.transform = ''; }, 340);
      });
    });
  }

  /* ── 全屏卡背景图懒加载 (首卡立即, 其余进入视口 200px 内加载) ── */
  function initBgLazy() {
    var cards = document.querySelectorAll('.post-card-fullscreen[data-bg]');
    if (!cards.length) return;
    cards.forEach(function (card, i) {
      var set = function () {
        card.style.backgroundImage = "url('" + card.dataset.bg + "')";
        card.dataset.loaded = '1';
      };
      if (i === 0) { set(); return; }
      if (!('IntersectionObserver' in window)) { set(); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { set(); io.disconnect(); }
        });
      }, { rootMargin: '200px 0px' });
      io.observe(card);
    });
  }

  /* ── 视频全屏封面: 自动播放判定 + 细进度条 ── */
  function initPcfVideo() {
    var videos = document.querySelectorAll('.post-card-fullscreen.pcf-video-card video.pcf-video, .post-card-feature.pcf-video-card video.pcf-video');
    if (!videos.length) return;
    videos.forEach(function (video, i) {
      var bar = video.parentElement.querySelector('.pcf-video-bar-fill');
      if (bar) {
        video.addEventListener('timeupdate', function () {
          if (video.duration && !isNaN(video.duration)) {
            bar.style.width = ((video.currentTime / video.duration) * 100).toFixed(2) + '%';
          }
        });
      }
      var tryPlay = function () {
        if (reducedMotion) return;
        var pr = video.play();
        if (pr) pr.catch(function () { /* 自动播放被策略拦截时静默 */ });
      };
      var tryPause = function () {
        if (!video.paused) video.pause();
      };
      var featureCard = video.closest('.post-card-feature');
      if (featureCard) {
        featureCard.addEventListener('mouseenter', tryPlay);
        featureCard.addEventListener('mouseleave', tryPause);
        featureCard.addEventListener('focusin', tryPlay);
        featureCard.addEventListener('focusout', tryPause);
        return;
      }
      if (i === 0) {
        tryPlay();
      } else if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { tryPlay(); } else { tryPause(); }
          });
        }, { rootMargin: '200px 0px' });
        io.observe(video);
      }
      video.addEventListener('loadeddata', function () {
        if (i === 0 || video.dataset.inView === '1') tryPlay();
      });
    });
  }

  /* ── 视频加载动效: 首帧透出 + spinner, canplay 后隐藏 ── */
  function initVideoLoading() {
    document.querySelectorAll('video[data-video-loading], video.pcf-video, video.media-video, video.article-bg-video').forEach(function (video) {
      var loading = video.parentElement.querySelector('[data-video-loading]');
      if (!loading) return;
      var show = function () { loading.classList.remove('hide'); };
      var hide = function () { loading.classList.add('hide'); };
      video.addEventListener('loadstart', show);
      video.addEventListener('canplay', hide);
      video.addEventListener('error', hide);
      video.addEventListener('stalled', hide);
      video.addEventListener('suspend', hide);
      if (video.readyState >= 3) hide();
      /* 8 秒未就绪兜底隐藏, 防止加载层常驻 */
      setTimeout(function () { hide(); }, 8000);
    });
    /* 内嵌视频: 点击视频本体切换播放 (控件栏区域交给原生控件) */
    document.querySelectorAll('video.media-video').forEach(function (video) {
      video.addEventListener('click', function (e) {
        var r = video.getBoundingClientRect();
        if (r.bottom - e.clientY < 44) return;
        if (video.paused) { var pr = video.play(); if (pr) pr.catch(function () {}); }
        else video.pause();
      });
    });
  }

  /* ── 登录 / 注册页 (独立页面, 静态演示) ── */
  function initLoginPage() {
    var page = document.getElementById('loginPage');
    if (!page) return;
    var signInForm = document.getElementById('signInForm');
    var signUpForm = document.getElementById('signUpForm');

    function toast(msg) {
      var t = document.getElementById('loginToast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); }, 2600);
    }

    /* 密码可见切换 */
    page.querySelectorAll('.pw-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('.password-wrap');
        var input = wrap.querySelector('.pw-input');
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        wrap.classList.toggle('pw-visible', !showing);
      });
    });

    /* 登录/注册切换 */
    page.querySelectorAll('[data-action="signup"], [data-action="signin"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var up = a.dataset.action === 'signup';
        signInForm.classList.toggle('is-hidden', up);
        signUpForm.classList.toggle('is-hidden', !up);
        page.querySelectorAll('[data-mode]').forEach(function (s) {
          s.classList.toggle('is-hidden', s.dataset.mode === (up ? 'signin' : 'signup'));
        });
        var t = document.querySelector(up ? '.login-title' : '.login-title');
        if (up) t.innerHTML = 'Join<span class="login-dot">.</span>';
        else t.innerHTML = 'Welcome<span class="login-dot">.</span>';
      });
    });

    /* 重置密码 (演示) */
    page.querySelectorAll('[data-action="reset"]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); toast('重置链接已发送到你的邮箱（演示）'); });
    });

    /* 记住我 + 提交 */
    signInForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = signInForm.querySelector('[name="email"]').value.trim();
      var remember = signInForm.querySelector('[name="rememberMe"]').checked;
      if (!email || !signInForm.querySelector('[name="password"]').value) { toast('请填写邮箱和密码'); return; }
      if (remember) localStorage.setItem('blog_login_email', email);
      toast('登录成功，欢迎回来！');
      setTimeout(function () { window.location.href = '/'; }, 1200);
    });

    signUpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = signUpForm.querySelector('[name="email"]').value.trim();
      var pw = signUpForm.querySelector('[name="password"]').value;
      if (!signUpForm.querySelector('[name="username"]').value.trim() || !email || !pw) { toast('请填写完整信息'); return; }
      if (pw.length < 6) { toast('密码至少 6 位'); return; }
      toast('账户创建成功！');
      setTimeout(function () { window.location.href = '/'; }, 1200);
    });

    /* GitHub 登录 (OAuth) */
    var g = document.getElementById('githubSignIn');
    if (g) g.addEventListener('click', function () {
      if (window.Auth && typeof window.Auth.signInWithGitHub === 'function') {
        g.disabled = true;
        g.textContent = '跳转中…';
        window.Auth.signInWithGitHub().catch(function (e) {
          g.disabled = false;
          g.textContent = '使用 GitHub 继续';
          toast('GitHub 登录失败：' + ((e && e.message) || e));
        });
      } else {
        toast('登录服务未就绪，请稍后重试');
      }
    });

    /* 记住我预填 */
    var saved = localStorage.getItem('blog_login_email');
    if (saved) { signInForm.querySelector('[name="email"]').value = saved; signInForm.querySelector('[name="rememberMe"]').checked = true; }
  }

  /* ── 文章右侧目录: 固定于文章容器右侧, 滚动时弹性惯性偏移, 减速后回弹原位 ── */
  function initTocFloat() {
    var toc = document.querySelector('.article-toc--side');
    if (!toc || reducedMotion) return;
    var layoutEl = document.querySelector('.article-layout');
    var baseTop = layoutEl ? layoutEl.getBoundingClientRect().top : 96;
    toc.style.top = baseTop + 'px';

    var current = 0, target = 0, lastY = window.scrollY;
    var raf = null;
    function frame() {
      current += (target - current) * 0.16;
      target *= 0.86;
      toc.style.top = (baseTop + current) + 'px';
      if (Math.abs(current) < 0.1 && Math.abs(target) < 0.1 && Math.abs(window.scrollY - lastY) < 0.5) {
        toc.style.top = baseTop + 'px';
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      var dy = window.scrollY - lastY;
      lastY = window.scrollY;
      var speed = Math.max(-1, Math.min(1, dy / 10));
      target = Math.max(-26, Math.min(26, speed * 26));
      if (!raf) raf = requestAnimationFrame(frame);
    }
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', function () {
      var layoutEl = document.querySelector('.article-layout');
      baseTop = layoutEl ? layoutEl.getBoundingClientRect().top : 96;
    });
  }

  /* ── 欢迎页头像: Supabase 个人主页头像 (随更改更新) + 磁性吸附 ── */
  function initWelcomeAvatar() {
    var el = document.getElementById('welcomeAvatar');
    if (!el) return;
    /* 动态头像: 个人主页 (profiles) 上传的头像, 每次加载取最新 */
    try {
      if (window.blogSupabase) {
        window.blogSupabase.from('profiles')
          .select('avatar_url')
          .eq('role', 'superadmin')
          .limit(1)
          .then(function (r) {
            if (!r.error && r.data && r.data[0] && r.data[0].avatar_url) {
              var av = r.data[0].avatar_url;
              av += (av.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
              el.style.backgroundImage = "url('" + av + "')";
            }
          })
          .catch(function () {});
      }
    } catch (e) {}

    /* 磁性吸附: 鼠标靠近时轻微偏移跟随, 移开回中 */
    if (reducedMotion) return;
    var zone = document.getElementById('welcome');
    if (!zone) return;
    var MAX = 18;
    var target = { x: 0, y: 0 };
    var cur = { x: 0, y: 0 };
    zone.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var range = 300;
      if (d > range) { target.x = 0; target.y = 0; return; }
      var f = 1 - d / range;
      target.x = Math.max(-MAX, Math.min(MAX, dx * 0.1 * f));
      target.y = Math.max(-MAX, Math.min(MAX, dy * 0.1 * f));
    });
    zone.addEventListener('mouseleave', function () { target.x = 0; target.y = 0; });
    (function loop() {
      cur.x += (target.x - cur.x) * 0.12;
      cur.y += (target.y - cur.y) * 0.12;
      el.style.transform = 'translate(-50%, -50%) translate(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px)';
      requestAnimationFrame(loop);
    })();
  }

  /* ── 首页开屏: 加载动画 + 变形导航 + 标题入场 (瑞士风 hero) ── */
  function initHomeHero() {
    var hero = document.getElementById('heroWrap');
    if (!hero) return;
    var reduced = reducedMotion;
    /* 强制回到顶部 (刷新后不保留滚动位置, 展示初始均分导航) */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (window.scrollY > 0) window.scrollTo(0, 0);
    var title = document.getElementById('heroTitle');
    var wrap = document.getElementById('heroWrap');
    var nav = document.getElementById('heroNav');
    var siteHeader = document.getElementById('siteHeader');
    var links = [];

    /* 首页 hero 只负责开屏均分动画；登录、头像、搜索由全局导航承接。 */
    if (siteHeader) {
      siteHeader.querySelectorAll('.nf-link').forEach(function (a) { links.push(a); });
    }

    /* 加载动画 */
    var loader = document.getElementById('loader');
    var loadNum = document.getElementById('loadNum');
    var loadBar = document.getElementById('loadBar');
    function finishLoad() {
      forceInitialScrollTop();
      if (loadNum) loadNum.textContent = '100';
      if (loadBar) loadBar.style.width = '100%';
      setTimeout(function () {
        if (loader) loader.classList.add('done');
        document.body.classList.add('loaded');
        layoutInit();
      }, 380);
    }
    if (reduced) { if (loadNum) loadNum.textContent = '100'; finishLoad(); }
    else {
      var num = 0;
      var iv = setInterval(function () {
        num += Math.random() * 24 + 8;
        if (num >= 100) { clearInterval(iv); finishLoad(); return; }
        if (loadNum) loadNum.textContent = Math.floor(num);
        if (loadBar) loadBar.style.width = Math.floor(num) + '%';
      }, 100);
    }

    /* 滚动变形 */
    var init = null;
    var curP = 0;
    var heroNavRaf = null;
    function ease(p) { return p < 0 ? 0 : p > 1 ? 1 : 1 - Math.pow(1 - p, 3); }
    function measure() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var pad = vw * 0.04;
      var navPad = Math.max(18, Math.min(36, vw * 0.03));
      var titleFont = parseFloat(getComputedStyle(title).fontSize);
      wrap.style.left = '0px'; wrap.style.top = '0px';
      var th = title.offsetHeight;
      var tX = pad;
      var tY = Math.max(vh - th - vh * 0.42, 96);
      wrap.style.left = tX + 'px'; wrap.style.top = tY + 'px';
      /* 用 JS 定位值 (不受入场动画 transform 影响) */
      var tInit = { x: tX, y: tY };
      var tSize = 28;
      var tScale = tSize / titleFont;
      var tTarget = { x: navPad, y: 21 };
      var items = [];
      var n = links.length || 1;
      links.forEach(function (el, i) {
        el.style.transform = 'none';
        var w = el.offsetWidth || 60;
        var targetLeft = el.getBoundingClientRect().left;
        var initLeft = pad + (n > 1 ? (i / (n - 1)) * (vw - pad * 2) : (vw - w) / 2) - w / 2;
        items.push({
          el: el,
          w: w,
          initX: initLeft - targetLeft
        });
      });
      init = { vh: vh, vw: vw, pad: pad, tInit: tInit, tTarget: tTarget, tScale: tScale, items: items, maxScroll: Math.max(vh - 72, 1) };
    }
    function update() {
      var p = curP;
      var dx = (init.tTarget.x - init.tInit.x) * p;
      var dy = (init.tTarget.y - init.tInit.y) * p;
      var sc = 1 + (init.tScale - 1) * p;
      title.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
      title.style.opacity = 1;
      init.items.forEach(function (g) {
        var x = g.initX * (1 - p);
        g.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px, 0, 0)';
      });
      nav.classList.toggle('solid', p > 0.85);
      nav.classList.toggle('is-collapsed', p > 0.85);
      var isCollapsed = p > 0.85;
      document.body.classList.toggle('home-nav-collapsed', isCollapsed);
      setNavAuthProgress(document.body.classList.contains('nav-is-hidden') ? 0 : p);
    }
    function layoutInit() {
      measure();
      update();
      function syncHeroNavUpdate() {
        if (!init) return;
        curP = ease(window.scrollY / init.maxScroll);
        update();
      }
      function scheduleHeroNavUpdate() {
        if (heroNavRaf) return;
        heroNavRaf = requestAnimationFrame(function () {
          heroNavRaf = null;
          syncHeroNavUpdate();
        });
      }
      window.addEventListener('scroll', function () {
        syncHeroNavUpdate();
        scheduleHeroNavUpdate();
      }, { passive: true });
      window.addEventListener('resize', function () {
        measure();
        scheduleHeroNavUpdate();
      });
      scheduleHeroNavUpdate();
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
  /* ── 搜索页 (瑞士风设计稿): 命令框 + 原文高亮 + stagger + 无选中态 ── */
  function initSearchPage() {
    var input = document.getElementById('searchInputPage');
    if (!input) return;
    if (input.dataset.index) inputIndexUrl = input.dataset.index;
    var results = document.getElementById('searchResultsPage');
    var status = document.getElementById('searchStatusPage');
    var cmd = document.getElementById('searchCmdPage');
    var clearBtn = document.getElementById('searchClearPage');
    var countEl = document.getElementById('searchCountPage');
    var items = [];
    var sel = -1;

    /* 入场: 标题上浮 + 规则线生长 (双 rAF 保证过渡触发) */
    var pageEl = document.querySelector('.search-page');
    if (pageEl) {
      var h1 = pageEl.querySelector('.search-title');
      if (h1) h1.innerHTML = '<span class="ln">' + h1.textContent + '</span>';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { pageEl.classList.add('ready'); });
      });
    }

    function esc(v) {
      return String(v || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + ' · ' + p(d.getMonth() + 1) + ' · ' + p(d.getDate());
    }

    /* 原文选段关键词高亮 (占位符方案防嵌套, 保留原文大小写) */
    function highlightExcerpt(text, query) {
      if (!query || !text) return esc(text);
      var words = query.toLowerCase().split(/\s+/).filter(function (w) { return w; })
        .sort(function (a, b) { return b.length - a.length; });
      if (!words.length) return esc(text);
      var html = esc(text);
      var tokens = [];
      words.forEach(function (w) {
        var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        html = html.replace(re, function (m) {
          tokens.push(m);
          return '\u0001' + (tokens.length - 1) + '\u0002';
        });
      });
      return html.replace(/\u0001(\d+)\u0002/g, function (m, i) {
        return '<mark class="hit-inline">' + tokens[Number(i)] + '</mark>';
      });
    }

    function itemHtml(d, i, query) {
      var section = String(d.section || '').toUpperCase();
      var type = section === 'POST' || !section ? 'POST' : section;
      var excerpt = d.summary || (d.content ? d.content.slice(0, 140) + '…' : '');
      return '<a class="sr-item" data-i="' + i + '" href="' + esc(d.permalink || '#') + '">' +
        '<span class="sr-arrow">→</span>' +
        '<div class="sr-row"><span class="sr-no">[ ' + pad(i + 1) + ' ]</span>' +
        '<span class="sr-title">' + esc(d.title) + '</span></div>' +
        (excerpt ? '<p class="sr-ex">' + highlightExcerpt(excerpt, query) + '</p>' : '') +
        '<div class="sr-meta">' +
        '<span class="sr-type' + (type === 'MOMENT' ? ' is-moment' : '') + '">' + type + '</span>' +
        (d.date ? '<span class="sr-date">' + fmtDate(d.date) + '</span>' : '') +
        (d.tags && d.tags.length ? '<span class="sr-tags">' + d.tags.map(function (t) { return '<span class="sr-tag">' + esc(t) + '</span>'; }).join('') + '</span>' : '') +
        '</div></a>';
    }

    function render(list, query) {
      items = list;
      sel = -1;
      if (countEl) countEl.textContent = pad(list.length);
      if (!list.length) {
        results.innerHTML = '<div class="sr-empty show">[ EMPTY ] — 没有匹配「<b>' + esc(query.trim()) + '</b>」的内容</div>';
        if (status) { status.hidden = false; status.textContent = '0 results · 换个关键词试试'; }
        if (clearBtn) clearBtn.classList.toggle('show', Boolean(query.trim()));
        return;
      }
      results.innerHTML = list.map(function (d, i) { return itemHtml(d, i, query); }).join('');
      var nodes = results.querySelectorAll('.sr-item');
      /* stagger 入场: @keyframes 动画 + delay (浏览器必然播放, 不受初始态渲染影响) */
      nodes.forEach(function (el, i) {
        el.style.animationDelay = (i * 45) + 'ms';
        el.classList.add('in');
      });
      setTimeout(function () {
        nodes.forEach(function (el) { el.style.animationDelay = ''; });
      }, nodes.length * 45 + 600);
      if (status) {
        status.hidden = false;
        status.textContent = list.length + ' results' + (query.trim() ? ' · 关键词「' + query.trim() + '」' : ' · 全部内容');
      }
      if (clearBtn) clearBtn.classList.toggle('show', Boolean(query.trim()));
    }

    function doSearch(query) {
      getFuse().then(function (fuse) {
        if (!fuse) {
          if (status) { status.hidden = false; status.textContent = '索引不可用：请确认已配置 outputs.home 的 JSON 输出。'; }
          render([], query);
          return;
        }
        var found = query.trim() ? fuse.search(query).slice(0, 8) : fuseIndexData.slice(0, 8);
        render(found.map(function (r) { return r.item || r; }), query);
      });
    }

    function move(delta) {
      if (!items.length) return;
      sel = Math.max(0, Math.min(items.length - 1, sel + delta));
      var el = results.querySelector('.sr-item[data-i="' + sel + '"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    function go() {
      if (sel < 0 || !items[sel]) return;
      var href = items[sel].permalink || '#';
      if (href === '#') return;
      window.location.href = href;
    }

    input.addEventListener('input', function () { doSearch(input.value); });
    input.addEventListener('focus', function () { cmd && cmd.classList.add('focused'); });
    input.addEventListener('blur', function () { cmd && cmd.classList.remove('focused'); });
    if (clearBtn) clearBtn.addEventListener('click', function () { input.value = ''; doSearch(''); input.focus(); });
    if (results) results.addEventListener('click', function (e) {
      var item = e.target.closest('.sr-item');
      if (item) {
        var href = item.getAttribute('href');
        if (href && href !== '#') window.location.href = href;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target !== input) return;
      if (e.key === 'Escape') { input.value = ''; doSearch(''); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    });

    doSearch('');
  }

  function initArchivePage() {
    var page = document.querySelector('.archives-page');
    if (!page) return;

    var monthLinks = Array.prototype.slice.call(page.querySelectorAll('[data-archive-month-link]'));
    var monthSections = Array.prototype.slice.call(page.querySelectorAll('[data-archive-month-section]'));

    function setActiveMonth(id) {
      if (!id) return;
      monthLinks.forEach(function (link) {
        link.classList.toggle('is-active', link.dataset.archiveMonthLink === id);
      });
      page.querySelectorAll('.archive-timeline-year').forEach(function (year) {
        year.classList.toggle('is-active', !!year.querySelector('.archive-timeline-months .is-active'));
      });
    }

    if (monthLinks.length && monthSections.length) {
      setActiveMonth(monthSections[0].id);

      monthLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          setActiveMonth(link.dataset.archiveMonthLink);
        });
      });

      if ('IntersectionObserver' in window) {
        var monthObserver = new IntersectionObserver(function (entries) {
          var visible = entries.filter(function (entry) {
            return entry.isIntersecting;
          }).sort(function (a, b) {
            return b.intersectionRatio - a.intersectionRatio;
          })[0];

          if (visible) setActiveMonth(visible.target.id);
        }, {
          rootMargin: '-18% 0px -68% 0px',
          threshold: [0, 0.2, 0.6]
        });

        monthSections.forEach(function (section) { monthObserver.observe(section); });
      }
    }

    page.querySelectorAll('.archive-card--video').forEach(function (card) {
      var video = card.querySelector('video.archive-cover-video');
      if (!video) return;
      var progress = card.querySelector('.archive-cover-progress span');

      function updateProgress() {
        if (!progress) return;
        if (video.duration && !isNaN(video.duration)) {
          progress.style.width = ((video.currentTime / video.duration) * 100).toFixed(2) + '%';
        }
      }

      function playPreview() {
        if (reducedMotion) return;
        /* 优先预览版 (低码率 -preview.mp4): 秒加载; 不存在时 error 回退原视频 */
        if (video.dataset.previewSrc && !video.dataset.previewTried) {
          video.dataset.previewTried = '1';
          video.addEventListener('error', function () {
            if (video.dataset.previewSrc) {
              video.src = video.dataset.origSrc || video.getAttribute('src');
              delete video.dataset.previewSrc;
              video.load();
            }
          }, { once: true });
          video.dataset.origSrc = video.getAttribute('src');
          video.src = video.dataset.previewSrc;
          video.load();
        }
        var promise = video.play();
        if (promise) promise.catch(function () {});
      }

      function pausePreview(reset) {
        if (!video.paused) video.pause();
        if (reset) {
          try { video.currentTime = 0.001; } catch (e) {}
          if (progress) progress.style.width = '0';
        }
      }

      function primeFirstFrame() {
        video.pause();
        if (video.readyState >= 1) {
          try { video.currentTime = 0.001; } catch (e) {}
        }
      }

      video.addEventListener('loadedmetadata', primeFirstFrame, { once: true });
      video.addEventListener('loadeddata', primeFirstFrame, { once: true });
      if (video.readyState >= 1) primeFirstFrame();
      video.load();
      video.addEventListener('timeupdate', updateProgress);
      card.addEventListener('pointerenter', playPreview);
      card.addEventListener('pointerleave', function () { pausePreview(true); });
      card.addEventListener('focusin', playPreview);
      card.addEventListener('focusout', function () { pausePreview(true); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pausePreview(true);
      });
    });
  }

  /* ── 桌面端全局滚动缓动 (Lenis) ──
     仅鼠标设备 (hover:hover + pointer:fine); reduced-motion 跳过
     兼容: 原生 scroll 事件 (scrollspy/导航变形/TOC 回弹均不受影响) */
  function initSmoothScroll() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (!window.Lenis) return;
    /* 移除 CSS smooth, 避免与 Lenis 缓动叠加 */
    document.documentElement.style.scrollBehavior = 'auto';
    var lenis = new Lenis({
      duration: 1.2,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 1
    });
    window.__lenis = lenis;
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    /* 锚点平滑滚动 (接管原生 hash 跳转)
       保持历史: pushState 更新 hash → 后退/刷新锚点定位不失效
       skip-link 排除: 保留其无障碍原生跳转行为 */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains('skip-link')) return;
      var href = a.getAttribute('href');
      if (!href || href === '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      if (window.location.hash !== href) {
        try { history.pushState(null, '', href); } catch (err) {}
      }
      lenis.scrollTo(target, { offset: -80, duration: 1.2 });
    });

    /* 浮层联动: body 锁定滚动 (搜索/弹窗等 overflow:hidden) 时暂停 Lenis */
    var locked = false;
    var mo = new MutationObserver(function () {
      var now = document.body.style.overflow === 'hidden';
      if (now === locked) return;
      locked = now;
      if (now) lenis.stop();
      else lenis.start();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  function boot() {
    initLightbox();
    initWelcomeEffects();
    initHomeHero();
    initWelcomeAvatar();
    initShapeBlur();
    initClickSparks();
    initFullscreenCards();
    initScrambleHover();
    initCoverParallax();
    initLoginPage();
    initBgLazy();
    initPcfVideo();
    initVideoLoading();
    initNavScroll();
    initMobileMenu();
    initThemeToggle();
    initReveal();
    initTocScrollspy();
    initTocFloat();
    initSmoothScroll();
    initSearchOverlay();
    initSearchPage();
    initArchivePage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
