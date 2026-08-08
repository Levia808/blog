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
    var targets = document.querySelectorAll('.pc-title[data-scramble="1"], .pcf-title[data-scramble="1"], .article-title[data-scramble="1"], .archive-link, .nf-link, .nm-menu a');
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
      var zone = el.closest('.post-card-cover, .post-card-fullscreen, .blog-section__head, .pagination, .article-toc');
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
    var videos = document.querySelectorAll('.post-card-fullscreen.pcf-video-card video.pcf-video');
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

    /* Google (演示) */
    var g = document.getElementById('googleSignIn');
    if (g) g.addEventListener('click', function () { toast('Google 登录（演示）'); });

    /* 记住我预填 */
    var saved = localStorage.getItem('blog_login_email');
    if (saved) { signInForm.querySelector('[name="email"]').value = saved; signInForm.querySelector('[name="rememberMe"]').checked = true; }
  }

  /* ── 文章右侧目录: 固定于文章容器右侧, 滚动时弹性惯性偏移, 减速后回弹原位 ── */
  function initTocFloat() {
    var toc = document.querySelector('.article-toc--side');
    if (!toc || reducedMotion) return;
    var layoutEl = document.querySelector('.article-layout');
    var baseTop = layoutEl ? Math.max(96, (window.innerHeight - toc.offsetHeight) / 2) : 96;
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
      baseTop = layoutEl ? Math.max(96, (window.innerHeight - toc.offsetHeight) / 2) : 96;
    });
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
    initShapeBlur();
    initClickSparks();
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
    initSearchOverlay();
    initSearchPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
