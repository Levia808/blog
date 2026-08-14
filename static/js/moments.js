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
  /* 发布地点 */
  var mcLocAdd = document.getElementById('mcLocAdd');
  var mcLocChip = document.getElementById('mcLocChip');
  var mcLocName = document.getElementById('mcLocName');
  var mcLocRemove = document.getElementById('mcLocRemove');
  var mcLocPanel = document.getElementById('mcLocPanel');
  var mcLocateBtn = document.getElementById('mcLocateBtn');
  var mcLocStatus = document.getElementById('mcLocStatus');
  var mcLocSearch = document.getElementById('mcLocSearch');
  var mcLocList = document.getElementById('mcLocList');
  var selectedLocation = null;
  var locGps = null;
  var locLocatedOnce = false;
  var locSearchTimer = null;
  var selectedMedia = [];
  var currentUser = null;
  var currentProfile = null;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  /* ── Threads 串文转发: 正文链接识别 → 读静态 JSON 资源 → 复刻官方 embed 卡片 (降级为链接) ──
     卡片 UI 复刻 Threads 官方 text-post-media embed: 白底 / 16px 圆角 / 头像+名字+时间 /
     正文 / 互动数 / 底部 Threads logo + 「在 Threads 查看」 */
  var threadsStorageBase = null;

  /* Threads 官方 logo (blockquote embed 同款) */
  var THREADS_LOGO = '<svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"><path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/></svg>';

  function threadsInfo(url) {
    var u = String(url || '').replace(/[.。]$/, '').trim();
    var m = u.match(/threads\.(?:net|com)\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/i);
    return m ? { url: u, handle: m[1], id: m[2] } : null;
  }

  function createThreadsCard(url) {
    var info = threadsInfo(url);
    if (!info) return null;
    var card = document.createElement('a');
    card.className = 'threads-card th-embed';
    card.href = info.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    /* 加载态: 复刻官方 embed 未渲染时的外观 (logo + 在 Threads 查看) */
    card.innerHTML =
      '<span class="th-foot th-loading">' +
      THREADS_LOGO +
      '<span class="th-foot-text">在 Threads 查看</span></span>';
    loadThreadsData(card, info);
    return card;
  }

  function loadThreadsData(card, info) {
    var base = threadsStorageBase;
    if (!base) {
      try {
        base = window.blogSupabase.storage.from('threads-reposts').getPublicUrl('x.json').data.publicUrl.replace('/x.json', '');
      } catch (e) { base = ''; }
      threadsStorageBase = base;
    }
    var jsonUrl = (base ? base + '/' : '') + info.id + '.json';
    var attempts = 0;
    function fetchJson() {
      return fetch(jsonUrl).then(function (r) {
        if (!r.ok) throw new Error('no resource');
        return r.json();
      });
    }
    function finish(data) { renderThreadsCard(card, data); }
    function fallback() {
      /* 降级: 保留链接文本 */
      var fb = document.createElement('span');
      fb.className = 'th-fallback mono';
      fb.textContent = 'Threads 串文 · ' + info.handle;
      card.replaceWith(fb);
    }
    fetchJson().then(finish).catch(function () {
      /* 资源缺失: 本机 Cookie 桥可达时自动爬取 (无需手动), 完成后轮询渲染 */
      fetch('http://localhost:8788/api/status', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; })
        .then(function (s) {
          if (!s || !s.chrome) { fallback(); return; }
          return fetch('http://localhost:8788/api/fetch?url=' + encodeURIComponent(info.url), { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d || !d.ok) throw new Error((d && d.error) || '抓取失败');
              return window.blogSupabase.functions.invoke('threads-fetch', { body: { json: d.data } });
            })
            .then(function (res) {
              if (res && res.error) throw res.error;
              /* 爬取完成: 轮询资源直到可读 */
              return new Promise(function (resolve, reject) {
                (function poll() {
                  fetchJson().then(finish).then(resolve).catch(function () {
                    attempts++;
                    if (attempts < 10) setTimeout(poll, 2000);
                    else reject(new Error('timeout'));
                  });
                })();
              });
            });
        })
        .catch(function () { fallback(); });
    });
  }

  /* 悬停串文卡片: 禁用浏览器历史手势 (双指左右滑) — 但保留轮播图片的左右浏览手势 */
  document.addEventListener('wheel', function (e) {
    if (e.target.closest('.threads-card')) {
      /* 轮播区域: 横向手势交给轮播原生滚动 (浏览图片), 不拦截 */
      var wrap = e.target.closest('.th-media-wrap');
      if (wrap) {
        var mediaEl = wrap.querySelector('.th-media');
        if (mediaEl && mediaEl.scrollWidth > mediaEl.clientWidth) return;
      }
      /* 卡片其他区域: 横向手势是浏览器历史手势 → 禁用 */
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    }
  }, { passive: false });

  /* Threads CDN 缩略参数 → 原图: 移除 width/height 尺寸限制 (保留编码参数, 避免 403) */
  function originalImageUrl(url) {
    var u = String(url || '');
    if (u.indexOf('width=') < 0 && u.indexOf('height=') < 0) return u;
    return u.replace(/&?(?:width|height|_nc_?[a-z]*|resize)[^&]*/gi, '');
  }

  function renderThreadsCard(card, d) {
    var author = d.display_name || d.author || 'unknown';
    var handle = d.handle || ('@' + String(d.author || ''));
    var timeHtml = d.time
      ? '<span class="th-time">' + escapeHtml(d.time) + '</span>'
      : '';
    var avatarHtml = d.avatar
      ? '<img class="th-avatar-img" src="' + escapeHtml(d.avatar) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">'
      : '';
    var mediaList = d.media || [];
    /* 分页: 视频单独一页, 图片两两一页 (一视窗两张) */
    var pages = [];
    var cur = [];
    mediaList.forEach(function (m) {
      if (m.type === 'video') {
        if (cur.length) { pages.push(cur); cur = []; }
        pages.push([m]);
      } else {
        cur.push(m);
        if (cur.length === 2) { pages.push(cur); cur = []; }
      }
    });
    if (cur.length) pages.push(cur);
    var media = pages.map(function (pg) {
      if (pg.length === 1 && pg[0].type === 'video') {
        /* 视频: 静音自动播放 (浏览器策略) + 循环, 进入视口加载; 附播放/暂停开关 */
        return '<span class="th-media-item is-video"><video src="' + escapeHtml(pg[0].url) + '" muted playsinline autoplay loop preload="auto"></video>' +
          '<button type="button" class="th-video-toggle" aria-label="暂停" aria-pressed="true"><span class="th-video-icon"></span></button></span>';
      }
      return '<span class="th-pair">' + pg.map(function (m) {
        /* 图片: 优先预览图 (低分辨率, 载入快), data-orig 存原图供放大查看; 宽高比备用数据 */
        var orig = originalImageUrl(m.url);
        var disp = m.preview || orig;
        return '<span class="th-media-item"><img src="' + escapeHtml(disp) + '" data-orig="' + escapeHtml(orig) + '" alt="" loading="lazy" decoding="async" data-ratio-w="' + (Number(m.width) || 0) + '" data-ratio-h="' + (Number(m.height) || 0) + '"></span>';
      }).join('') + '</span>';
    }).join('');
    var multi = mediaList.length > 1;
    var mediaHtml = '';
    if (media) {
      mediaHtml =
        '<span class="th-media-wrap">' +
          '<span class="th-media' + (multi ? ' is-carousel' : '') + '">' + media + '</span>' +
          (multi
            ? '<button type="button" class="th-prev" aria-label="上一张">‹</button>' +
              '<button type="button" class="th-next" aria-label="下一张">›</button>' +
              '<span class="th-dots">' + pages.map(function (_, i) {
                return '<i class="' + (i === 0 ? 'on' : '') + '" data-i="' + i + '"></i>';
              }).join('') + '</span>'
            : '') +
        '</span>';
    }
    card.innerHTML =
      '<span class="th-body">' +
        '<span class="th-author">' +
          '<span class="th-avatar">' + avatarHtml + '<span class="th-avatar-fb">' + escapeHtml(String(author).slice(0, 1).toUpperCase()) + '</span></span>' +
          '<span class="th-author-meta">' +
            '<span class="th-aname">' + escapeHtml(author) + '</span>' +
            '<span class="th-meta-line">' + escapeHtml(handle) + (timeHtml ? ' · ' + timeHtml : '') + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="th-post">' + escapeHtml(d.text || '') + '</span>' +
        (d.text ? '<button type="button" class="th-translate">翻译</button>' : '') +
        mediaHtml +
      '</span>' +
      '<span class="th-foot">' +
        THREADS_LOGO +
        '<span class="th-foot-text">在 Threads 查看</span>' +
      '</span>';
    card.style.opacity = '0';
    card.style.transform = 'translateY(8px)';
    card.style.transition = 'opacity 0.4s cubic-bezier(.16,1,.3,1), transform 0.4s cubic-bezier(.16,1,.3,1)';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        card.style.opacity = '1';
        card.style.transform = 'none';
        layoutThreadsMedia(card);
        var thWrap = card.querySelector('.th-media-wrap');
        if (thWrap) syncThreadsNav(thWrap);
        /* 容器宽度可能未稳定 (动画/懒布局): 延迟再排一次 */
        setTimeout(function () { layoutThreadsMedia(card); syncThreadsNav(thWrap); }, 300);
      });
    });
  }

  /* 串文卡片媒体: 统一高度布局 (Google Photos 同款)
     多图分页 (一页两张并排), 全部图片统一一个合适高度:
     按最宽的一页计算 h = (W - gap) / max(页内宽高比之和), 限幅 [180, 520],
     比例不一致时大图自动缩小, 页内居中, 不裁切无灰边 */
  var threadsMediaGap = 8;
  var threadsResizeTimer = null;

  function layoutThreadsMedia(card) {
    var media = card && card.querySelector('.th-media');
    if (!media || !media.classList.contains('is-carousel')) return;
    var W = media.clientWidth;
    if (!W) return;
    var pages = Array.prototype.slice.call(media.children);
    var maxSum = 0;
    pages.forEach(function (page) {
      var imgs = page.querySelectorAll('.th-media-item img');
      if (!imgs.length) return;
      var sum = 0;
      Array.prototype.forEach.call(imgs, function (img) { sum += threadsImageRatio(img); });
      maxSum = Math.max(maxSum, sum);
    });
    if (!maxSum) return;
    var h = Math.round((W - threadsMediaGap) / maxSum);
    h = Math.max(180, Math.min(520, h));
    media.style.setProperty('--th-media-h', h + 'px');
  }

  function threadsImageRatio(img) {
    if (img && img.naturalWidth > 0) return img.naturalWidth / img.naturalHeight;
    var w = parseFloat(img && img.dataset ? (img.dataset.ratioW || '') : '') || 0;
    var h = parseFloat(img && img.dataset ? (img.dataset.ratioH || '') : '') || 0;
    if (w && h) return w / h;
    return 1;
  }

  function layoutAllThreadsMedia() {
    listEl.querySelectorAll('.threads-card').forEach(function (card) { layoutThreadsMedia(card); });
  }

  window.addEventListener('resize', function () {
    if (threadsResizeTimer) clearTimeout(threadsResizeTimer);
    threadsResizeTimer = setTimeout(layoutAllThreadsMedia, 150);
  });

  /* 串文卡片交互: 仅页脚「在 Threads 查看」跳转, 其余点击不跳转 (图片放大/翻译/轮播) */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.threads-card');
    if (card && !e.target.closest('.th-foot')) e.preventDefault();
  }, true);

  /* 串文卡片图片: 点击放大查看原图 (复用动态 GLightbox, 不跳转) */
  function openThreadsLightbox(img) {
    var card = img.closest('.threads-card');
    if (!card) return;
    var urls = Array.prototype.map.call(card.querySelectorAll('.th-media-item img'), function (i) {
      return i.dataset.orig || i.currentSrc || i.src;
    });
    if (!urls.length) return;
    var startAt = Math.max(0, urls.indexOf(img.dataset.orig || img.currentSrc || img.src));
    function open() {
      var lb = getMomentsLightbox();
      if (!lb) return;
      lb.setElements(urls.map(function (u) { return { href: u, type: 'image' }; }));
      lb.openAt(startAt);
    }
    if (window.GLightbox) open();
    else loadGlightboxLib().then(open);
  }

  document.addEventListener('click', function (e) {
    var mediaImg = e.target.closest('.threads-card .th-media-item img');
    if (!mediaImg) return;
    e.preventDefault();
    e.stopPropagation();
    openThreadsLightbox(mediaImg);
  });

  /* 串文卡片翻译: 点「翻译」→ 正文译成中文, 再点切回原文 (复用免费翻译端点) */
  var TRANS_API = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t';
  var transCache = {};
  var transPending = {};

  function translateTo(text, target) {
    if (!text || transCache[text] === target + ':' || transPending[text + target]) {
      return Promise.resolve(transCache[text] === target + ':' ? transCache[text] : text);
    }
    if (transCache[text] === target + ':' + text) return Promise.resolve(text);
    transPending[text + target] = true;
    var ctrl = window.AbortController ? new window.AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    return fetch(TRANS_API + '&sl=auto&tl=' + target + '&q=' + encodeURIComponent(text), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var out = '';
        var segs = d && d[0];
        if (segs) segs.forEach(function (s) { if (s && s[0]) out += s[0]; });
        out = (out || text).trim();
        if (!out) out = text;
        transCache[text] = target + ':' + out;
        return out;
      })
      .catch(function () { return text; })
      .finally(function () {
        delete transPending[text + target];
        if (timer) clearTimeout(timer);
      });
  }

  document.addEventListener('click', function (e) {
    var trBtn = e.target.closest('.th-translate');
    if (!trBtn) return;
    e.preventDefault();
    e.stopPropagation();
    var card = trBtn.closest('.threads-card');
    var postEl = card && card.querySelector('.th-post');
    if (!card || !postEl) return;
    if (card.dataset.thOrig !== undefined) {
      postEl.textContent = card.dataset.thOrig;
      delete card.dataset.thOrig;
      trBtn.textContent = '翻译';
      return;
    }
    var text = postEl.textContent;
    if (!text) return;
    trBtn.textContent = '翻译中…';
    trBtn.disabled = true;
    translateTo(text, 'zh-CN').then(function (zh) {
      if (zh && zh !== text) {
        card.dataset.thOrig = text;
        postEl.textContent = zh;
        trBtn.textContent = '原文';
      } else {
        trBtn.textContent = '翻译';
      }
    }).finally(function () { trBtn.disabled = false; });
  });

  /* 串文卡片轮播: 左右箭头 + 可点圆点 + 键盘方向键 (Threads 官网同款滑动交互)
     边界状态: 首/末页禁用对应箭头 (视觉反馈 + 不可点), 圆点可点跳转对应页 */
  function threadsPageCount(mediaEl) {
    return mediaEl ? mediaEl.children.length : 0;
  }

  function threadsCurrentPage(mediaEl) {
    if (!mediaEl) return 0;
    var max = mediaEl.scrollWidth - mediaEl.clientWidth;
    if (max <= 0) return 0;
    return Math.min(threadsPageCount(mediaEl) - 1, Math.round(mediaEl.scrollLeft / (mediaEl.clientWidth || 1)));
  }

  function scrollThreadsMediaTo(wrap, index) {
    var mediaEl = wrap && wrap.querySelector('.th-media');
    if (!mediaEl) return;
    var count = threadsPageCount(mediaEl);
    if (index < 0) index = 0;
    if (index > count - 1) index = count - 1;
    var max = Math.max(0, mediaEl.scrollWidth - mediaEl.clientWidth);
    mediaEl.scrollTo({ left: Math.min(max, index * (mediaEl.clientWidth || 1)), behavior: 'smooth' });
  }

  function scrollThreadsMedia(wrap, dir) {
    var mediaEl = wrap && wrap.querySelector('.th-media');
    if (!mediaEl) return;
    scrollThreadsMediaTo(wrap, threadsCurrentPage(mediaEl) + dir);
  }

  function syncThreadsNav(wrap) {
    var mediaEl = wrap && wrap.querySelector('.th-media');
    if (!mediaEl) return;
    var idx = threadsCurrentPage(mediaEl);
    var last = Math.max(0, threadsPageCount(mediaEl) - 1);
    var dots = wrap.querySelector('.th-dots');
    if (dots) {
      Array.prototype.forEach.call(dots.children, function (dot, i) {
        dot.classList.toggle('on', i === idx);
      });
    }
    var prev = wrap.querySelector('.th-prev');
    var next = wrap.querySelector('.th-next');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= last;
  }

  document.addEventListener('click', function (e) {
    var wrap = e.target.closest && e.target.closest('.th-media-wrap');
    if (!wrap) return;
    var prevBtn = e.target.closest('.th-prev');
    if (prevBtn) { e.preventDefault(); e.stopPropagation(); scrollThreadsMedia(wrap, -1); return; }
    var nextBtn = e.target.closest('.th-next');
    if (nextBtn) { e.preventDefault(); e.stopPropagation(); scrollThreadsMedia(wrap, 1); return; }
    var dot = e.target.closest('.th-dots i');
    if (dot) {
      e.preventDefault(); e.stopPropagation();
      scrollThreadsMediaTo(wrap, Array.prototype.indexOf.call(dot.parentNode.children, dot));
      return;
    }
    /* 视频: 点击开关静音循环视频的播放/暂停 (autoplay 状态与图标同步) */
    var vt = e.target.closest('.th-video-toggle');
    if (vt) {
      e.preventDefault(); e.stopPropagation();
      var video = wrap.querySelector('video');
      if (video) {
        if (video.paused) {
          video.play();
          vt.setAttribute('aria-pressed', 'true');
          vt.setAttribute('aria-label', '暂停');
          vt.classList.remove('is-paused');
        } else {
          video.pause();
          vt.setAttribute('aria-pressed', 'false');
          vt.setAttribute('aria-label', '播放');
          vt.classList.add('is-paused');
        }
      }
      return;
    }
  });

  document.addEventListener('scroll', function (e) {
    var wrap = e.target && e.target.closest && e.target.closest('.th-media-wrap');
    if (wrap) syncThreadsNav(wrap);
  }, true);

  /* 键盘: 焦点在串文卡片上时, 左右方向键翻页 (与箭头一致, 提升可访问性) */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var card = e.target.closest && e.target.closest('.threads-card');
    if (!card) return;
    var wrap = card.querySelector('.th-media-wrap');
    var mediaEl = wrap && wrap.querySelector('.th-media');
    if (!mediaEl || threadsPageCount(mediaEl) <= 1) return;
    /* 仅当存在横向溢出时拦截 (单页不抢走页面横向滚动手势) */
    if (mediaEl.scrollWidth <= mediaEl.clientWidth + 1) return;
    e.preventDefault();
    scrollThreadsMedia(wrap, e.key === 'ArrowRight' ? 1 : -1);
  });

  /* ── 发布地点: GPS 识别 / 附近地点 / 搜索指定 (Photon·OSM, 免费无 key, © OpenStreetMap)
     注意: lang 参数仅支持 default/de/en/fr — 省略时浏览器自动带 Accept-Language (zh-CN) */
  var LOC_API = 'https://photon.komoot.io';
  /* 附近地点 POI 分类 (include=osm.<key>.<value>, 逗号分隔) */
  var LOC_NEARBY_CATEGORIES = [
    'osm.amenity.cafe', 'osm.amenity.restaurant', 'osm.amenity.place_of_worship',
    'osm.amenity.library', 'osm.amenity.theatre', 'osm.amenity.cinema',
    'osm.amenity.university', 'osm.amenity.hospital', 'osm.amenity.bank',
    'osm.amenity.marketplace', 'osm.amenity.bus_station', 'osm.amenity.pharmacy',
    'osm.amenity.parking', 'osm.amenity.fuel', 'osm.amenity.school', 'osm.amenity.hotel',
    'osm.tourism.attraction', 'osm.tourism.hotel', 'osm.tourism.museum',
    'osm.leisure.park', 'osm.leisure.garden', 'osm.shop.mall', 'osm.shop.supermarket',
    'osm.railway.station'
  ].join(',');


  /* 中文地理编码 (成熟方案): Nominatim 官方实例 accept-language=zh-CN 原生返回中文地名
     失败/无结果时回退 Photon; 附近 POI 用 Photon 分类检索 + 结果中文化 */
  var NOMINATIM = 'https://nominatim.openstreetmap.org';
  var nomLastTs = 0;

  function nominatimHeaders() {
    return { 'User-Agent': 'blog-moments/1.0 (personal blog)', 'Accept-Language': 'zh-CN,zh;q=0.9' };
  }

  function nominatimRequest(url) {
    /* 公共实例限速 1 请求/秒: 串行节流 */
    var wait = Math.max(0, 1100 - (Date.now() - nomLastTs));
    nomLastTs = Date.now() + wait;
    return new Promise(function (resolve) { setTimeout(resolve, wait); })
      .then(function () { return locRequest(url, nominatimHeaders()); });
  }

  function locFromNominatim(f) {
    if (!f || f.lat == null || f.lon == null) return null;
    var a = f.address || {};
    var parts = [];
    if (f.name) parts.push(f.name);
    var ctx = a.city || a.city_district || a.state_district || a.state;
    if (ctx && parts.indexOf(ctx) < 0) parts.push(ctx);
    if (a.country && parts.indexOf(a.country) < 0) parts.push(a.country);
    return { name: parts.length ? parts.join(' · ') : f.display_name, lat: parseFloat(f.lat), lng: parseFloat(f.lon) };
  }

  /* Photon 结果 → 地点对象, 名称翻译为中文 (双语展示: 中文 · 原文) */
  function translateFeatures(d) {
    var items = ((d && d.features) || []).map(locFromFeature).filter(Boolean).slice(0, 12);
    return Promise.all(items.map(function (loc) {
      return translateTo(loc.name, 'zh-CN').then(function (zh) {
        if (zh && zh !== loc.name) loc.name = zh + ' · ' + loc.name;
        return loc;
      });
    })).then(function (list) {
      return { features: list };
    });
  }

  function locSearch(q) {
    return nominatimRequest(NOMINATIM + '/search?q=' + encodeURIComponent(q) +
      '&format=jsonv2&limit=8&addressdetails=1&accept-language=zh-CN')
      .then(function (d) {
        var items = (Array.isArray(d) ? d : []).map(locFromNominatim).filter(Boolean);
        if (items.length) return { features: dedupeLocations(items) };
        throw new Error('no result');
      })
      .catch(function () {
        return locRequest(LOC_API + '/api/?limit=8&q=' + encodeURIComponent(q)).then(translateFeatures);
      });
  }

  function locNearby(lat, lng) {
    return locRequest(LOC_API + '/api/?limit=8&lat=' + lat + '&lon=' + lng +
      '&include=' + encodeURIComponent(LOC_NEARBY_CATEGORIES)).then(translateFeatures);
  }

  function locReverse(lat, lng) {
    return nominatimRequest(NOMINATIM + '/reverse?lat=' + lat + '&lon=' + lng +
      '&format=jsonv2&addressdetails=1&accept-language=zh-CN')
      .then(function (d) {
        var loc = locFromNominatim(d);
        return { features: loc ? [loc] : [] };
      })
      .catch(function () {
        return locRequest(LOC_API + '/reverse?lat=' + lat + '&lon=' + lng).then(translateFeatures);
      });
  }

  function locRequest(url, headers) {
    /* 超时保护: 公共实例慢/不可达时快速降级提示, 不无限等待 */
    var ctrl = window.AbortController ? new window.AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    var opts = {};
    if (ctrl) opts.signal = ctrl.signal;
    if (headers) opts.headers = headers;
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      if (ctrl && e && e.name === 'AbortError') throw new Error('timeout');
      throw e;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function placeLabel(p) {
    var parts = [];
    if (p.name) parts.push(p.name);
    var ctx = p.city || p.district || p.county || p.state || p.country;
    if (ctx && parts.indexOf(ctx) < 0) parts.push(ctx);
    return parts.join(' · ');
  }

  function locFromFeature(f) {
    var g = f && f.geometry && f.geometry.coordinates;
    if (!g || !g.length) return null;
    return { name: placeLabel(f.properties || {}), lat: g[1], lng: g[0] };
  }

  /* 过滤空名 + 同一地点合并: 同名(忽略大小写)且坐标在 ~1km 内视为同一地点 (如 涩谷站的多个站台条目) */
  function dedupeLocations(items) {
    var seen = {};
    return (items || []).filter(function (it) {
      if (!it || !it.name) return false;
      var k = it.lat.toFixed(2) + '|' + it.lng.toFixed(2) + '|' + String(it.name).toLowerCase().replace(/\s+/g, '');
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /* 中文地理编码 (成熟方案): Nominatim 官方实例 accept-language=zh-CN 原生返回中文地名
     失败/无结果时回退 Photon; 附近 POI 用 Photon 分类检索 + 结果中文化 */
  var NOMINATIM = 'https://nominatim.openstreetmap.org';
  var nomLastTs = 0;

  function nominatimHeaders() {
    return { 'User-Agent': 'blog-moments/1.0 (personal blog)', 'Accept-Language': 'zh-CN,zh;q=0.9' };
  }

  function nominatimRequest(url) {
    /* 公共实例限速 1 请求/秒: 串行节流 */
    var wait = Math.max(0, 1100 - (Date.now() - nomLastTs));
    nomLastTs = Date.now() + wait;
    return new Promise(function (resolve) { setTimeout(resolve, wait); })
      .then(function () { return locRequest(url, nominatimHeaders()); });
  }

  function locFromNominatim(f) {
    if (!f || f.lat == null || f.lon == null) return null;
    var a = f.address || {};
    var parts = [];
    if (f.name) parts.push(f.name);
    var ctx = a.city || a.city_district || a.state_district || a.state;
    if (ctx && parts.indexOf(ctx) < 0) parts.push(ctx);
    if (a.country && parts.indexOf(a.country) < 0) parts.push(a.country);
    return { name: parts.length ? parts.join(' · ') : f.display_name, lat: parseFloat(f.lat), lng: parseFloat(f.lon) };
  }

  /* Photon 结果 → 地点对象, 名称翻译为中文 (双语展示: 中文 · 原文) */
  function translateFeatures(d) {
    var items = ((d && d.features) || []).map(locFromFeature).filter(Boolean).slice(0, 12);
    return Promise.all(items.map(function (loc) {
      return translateTo(loc.name, 'zh-CN').then(function (zh) {
        if (zh && zh !== loc.name) loc.name = zh + ' · ' + loc.name;
        return loc;
      });
    })).then(function (list) {
      return { features: list };
    });
  }

  function locSearch(q) {
    return nominatimRequest(NOMINATIM + '/search?q=' + encodeURIComponent(q) +
      '&format=jsonv2&limit=8&addressdetails=1&accept-language=zh-CN')
      .then(function (d) {
        var items = (Array.isArray(d) ? d : []).map(locFromNominatim).filter(Boolean);
        if (items.length) return { features: dedupeLocations(items) };
        throw new Error('no result');
      })
      .catch(function () {
        return locRequest(LOC_API + '/api/?limit=8&q=' + encodeURIComponent(q)).then(translateFeatures);
      });
  }

  function locNearby(lat, lng) {
    return locRequest(LOC_API + '/api/?limit=8&lat=' + lat + '&lon=' + lng +
      '&include=' + encodeURIComponent(LOC_NEARBY_CATEGORIES)).then(translateFeatures);
  }

  function locReverse(lat, lng) {
    return nominatimRequest(NOMINATIM + '/reverse?lat=' + lat + '&lon=' + lng +
      '&format=jsonv2&addressdetails=1&accept-language=zh-CN')
      .then(function (d) {
        var loc = locFromNominatim(d);
        return { features: loc ? [loc] : [] };
      })
      .catch(function () {
        return locRequest(LOC_API + '/reverse?lat=' + lat + '&lon=' + lng).then(translateFeatures);
      });
  }

  function setLocStatus(text) {
    mcLocStatus.textContent = text || '';
  }

  function renderLocList(items, note) {
    if (!items || !items.length) {
      mcLocList.innerHTML = '<div class="mlp-empty">' + (note || '无结果') + '</div>';
      return;
    }
    mcLocList.innerHTML = items.map(function (it) {
      return '<button type="button" class="mlp-item" data-loc-lat="' + it.lat + '" data-loc-lng="' + it.lng + '" data-loc-name="' + escapeHtml(it.name) + '">' +
        '<span class="mlp-item-ico" aria-hidden="true">📍</span>' +
        '<span class="mlp-item-main">' + escapeHtml(it.name) + '</span>' +
        '</button>';
    }).join('');
  }

  function loadNearby() {
    if (!locGps) return;
    locNearby(locGps.lat, locGps.lng).then(function (d) {
      if (!mcLocSearch.value.trim()) {
        renderLocList(dedupeLocations((d.features || [])), '附近没有地点');
      }
    }).catch(function () {
      renderLocList(null, '附近地点加载失败，可手动搜索');
    });
  }

  function gpsLocate() {
    if (!window.navigator || !window.navigator.geolocation) {
      setLocStatus('浏览器不支持定位，请手动搜索');
      return;
    }
    setLocStatus('正在定位…');
    window.navigator.geolocation.getCurrentPosition(function (pos) {
      locGps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locLocatedOnce = true;
      locReverse(locGps.lat, locGps.lng).then(function (d) {
        var loc = ((d && d.features && d.features[0])) || null;
        setLocStatus(loc ? '当前位置：' + loc.name : '已定位（无地点名称）');
      }).catch(function () {
        setLocStatus('已定位 ' + locGps.lat.toFixed(4) + ', ' + locGps.lng.toFixed(4));
      });
      loadNearby();
    }, function (err) {
      locGps = null;
      setLocStatus(err && err.code === 1 ? '定位被拒绝，可手动搜索' : '定位失败，可手动搜索');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }

  function selectLocation(loc) {
    if (!loc || !loc.name) return;
    selectedLocation = loc;
    mcLocName.textContent = loc.name;
    mcLocChip.hidden = false;
    mcLocAdd.hidden = true;
    closeLocPanel();
  }

  function clearLocation() {
    selectedLocation = null;
    mcLocChip.hidden = true;
    mcLocAdd.hidden = false;
  }

  function openLocPanel() {
    mcLocPanel.hidden = false;
    if (!locLocatedOnce) gpsLocate();
    mcLocSearch.focus();
  }

  function closeLocPanel() {
    mcLocPanel.hidden = true;
    /* 清空搜索状态: 下次打开从附近地点重新开始 */
    mcLocSearch.value = '';
    mcLocList.innerHTML = '';
  }

  function resetLocState() {
    selectedLocation = null;
    locGps = null;
    mcLocChip.hidden = true;
    mcLocAdd.hidden = false;
    mcLocPanel.hidden = true;
    mcLocSearch.value = '';
    mcLocList.innerHTML = '';
    setLocStatus('');
  }

  mcLocAdd.addEventListener('click', function () { openLocPanel(); });
  mcLocRemove.addEventListener('click', function () { clearLocation(); });
  mcLocateBtn.addEventListener('click', function () { gpsLocate(); });
  mcLocList.addEventListener('click', function (e) {
    var item = e.target.closest('.mlp-item');
    if (!item) return;
    selectLocation({
      name: item.dataset.locName,
      lat: parseFloat(item.dataset.locLat),
      lng: parseFloat(item.dataset.locLng)
    });
  });
  mcLocSearch.addEventListener('input', function () {
    clearTimeout(locSearchTimer);
    var q = this.value.trim();
    locSearchTimer = setTimeout(function () {
      if (!q) {
        if (locGps) loadNearby();
        else renderLocList(null, '输入关键词搜索地点');
        return;
      }
      setLocStatus('搜索中…');
      locSearch(q).then(function (d) {
        setLocStatus('');
        renderLocList(dedupeLocations((d.features || [])), '未找到相关地点');
      }).catch(function () {
        setLocStatus('搜索失败');
        renderLocList(null, '搜索失败，请重试');
      });
    }, 300);
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.mc-loc-panel') || e.target.closest('#mcLocAdd') ||
        e.target.closest('#mcLocChip') || e.target.closest('.mlp-item')) return;
    closeLocPanel();
  }, true);

  /* ── 滚轮隔离 (document 捕获, 覆盖发布器+编辑面板所有地点面板):
     ① data-lenis-prevent-wheel 属性 → Lenis 官方放行该区域
     ② 捕获阶段 preventDefault + stopPropagation → 彻底阻断传播到 Lenis/页面
     ③ 手动驱动列表滚动 (scrollTop += deltaY, 边界自动 clamp, 无滚动链外溢) */
  document.addEventListener('wheel', function (e) {
    var panel = e.target.closest('.mc-loc-panel');
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    var list = panel.querySelector('.mlp-list');
    if (!list || list.scrollHeight <= list.clientHeight) return;
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= list.clientHeight;
    list.scrollTop += dy;
  }, { capture: true, passive: false });

  /* ── 编辑面板地点 (每卡独立状态):
     规则: 自定义地点选择完全使用所选条目的 {name,lat,lng}, 不混入 GPS 定位数据;
     GPS 仅用于反向编码显示当前位置 + 生成附近列表 */
  var editLocState = {};
  var editLocTimer = null;

  function editLocSetStatus(panel, text, tone) {
    var s = panel && panel.querySelector('[data-edit-loc-status]');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'mlp-status mono' + (tone === 'ok' ? ' ok' : tone === 'err' ? ' err' : '');
  }

  function editLocRenderList(panel, items, note) {
    var list = panel && panel.querySelector('[data-edit-loc-list]');
    if (!list) return;
    if (!items || !items.length) {
      list.innerHTML = '<div class="mlp-empty">' + (note || '无结果') + '</div>';
      return;
    }
    list.innerHTML = items.map(function (it) {
      return '<button type="button" class="mlp-item" data-loc-lat="' + it.lat + '" data-loc-lng="' + it.lng + '" data-loc-name="' + escapeHtml(it.name) + '">' +
        '<span class="mlp-item-ico" aria-hidden="true">📍</span>' +
        '<span class="mlp-item-main">' + escapeHtml(it.name) + '</span>' +
        '</button>';
    }).join('');
  }

  function editLocLoadNearby(panel, st) {
    if (!panel || !st || !st.gps) return;
    locNearby(st.gps.lat, st.gps.lng).then(function (d) {
      var search = panel.querySelector('[data-edit-loc-search]');
      if (!search.value.trim()) {
        editLocRenderList(panel, dedupeLocations((d.features || [])), '附近没有地点');
      }
    }).catch(function () {
      editLocRenderList(panel, null, '附近地点加载失败，可手动搜索');
    });
  }

  function editLocGpsLocate(panel, st) {
    if (!window.navigator || !window.navigator.geolocation) {
      editLocSetStatus(panel, '浏览器不支持定位，请手动搜索');
      return;
    }
    editLocSetStatus(panel, '正在定位…');
    window.navigator.geolocation.getCurrentPosition(function (pos) {
      st.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      st.locatedOnce = true;
      locReverse(st.gps.lat, st.gps.lng).then(function (d) {
        var loc = ((d && d.features && d.features[0])) || null;
        editLocSetStatus(panel, loc ? '当前位置：' + loc.name : '已定位（无地点名称）', 'ok');
      }).catch(function () {
        editLocSetStatus(panel, '已定位 ' + st.gps.lat.toFixed(4) + ', ' + st.gps.lng.toFixed(4), 'ok');
      });
      editLocLoadNearby(panel, st);
    }, function (err) {
      st.gps = null;
      editLocSetStatus(panel, err && err.code === 1 ? '定位被拒绝，可手动搜索' : '定位失败，可手动搜索', 'err');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }

  function editLocOpenPanel(panel, st) {
    closeAllEditLocPanels(panel);
    panel.hidden = false;
    if (!st.locatedOnce) editLocGpsLocate(panel, st);
    var inp = panel.querySelector('[data-edit-loc-search]');
    if (inp) inp.focus();
  }

  function closeAllEditLocPanels(exceptPanel) {
    listEl.querySelectorAll('[data-edit-loc-panel]').forEach(function (p) {
      if (p === exceptPanel) return;
      p.hidden = true;
      var search = p.querySelector('[data-edit-loc-search]');
      if (search) search.value = '';
      var list = p.querySelector('[data-edit-loc-list]');
      if (list) list.innerHTML = '';
    });
  }

  function editLocSelect(panel, st, loc) {
    if (!loc || !loc.name) return;
    st.selected = { name: loc.name, lat: loc.lat, lng: loc.lng };
    st.dirty = true;
    var chip = panel.parentNode.querySelector('[data-edit-loc-chip]');
    var add = panel.parentNode.querySelector('[data-edit-loc-add]');
    var nameEl = panel.parentNode.querySelector('[data-edit-loc-name]');
    if (chip) chip.hidden = false;
    if (add) add.hidden = true;
    if (nameEl) nameEl.textContent = loc.name;
    panel.hidden = true;
  }

  function editLocInitState(momentId, moment) {
    var loc = (moment && moment.location) || null;
    editLocState[momentId] = {
      selected: loc && loc.name ? { name: loc.name, lat: loc.lat, lng: loc.lng } : null,
      gps: null,
      locatedOnce: false,
      dirty: false
    };
  }

  function editLocRenderChip(card, st) {
    var chip = card.querySelector('[data-edit-loc-chip]');
    var add = card.querySelector('[data-edit-loc-add]');
    var nameEl = card.querySelector('[data-edit-loc-name]');
    var has = st && st.selected && st.selected.name;
    if (chip) chip.hidden = !has;
    if (add) add.hidden = !!has;
    if (nameEl) nameEl.textContent = has ? st.selected.name : '';
  }

  function editLocDiscard(momentId) {
    delete editLocState[momentId];
    var card = listEl.querySelector('[data-moment-id="' + momentId + '"]');
    if (card) {
      var panel = card.querySelector('[data-edit-loc-panel]');
      if (panel) panel.hidden = true;
      var search = card.querySelector('[data-edit-loc-search]');
      if (search) search.value = '';
      var list = card.querySelector('[data-edit-loc-list]');
      if (list) list.innerHTML = '';
    }
  }

  /* 正文扫描: threads.net / threads.com 链接 → 转发卡片 (content 编辑保存后重渲染自动重建)
     注意: 必须跳过表单控件 (textarea/input) 内的文本节点 — 否则编辑面板里的链接文本会被替换成卡片 */
  function transformThreadsLinks(container) {
    if (!container) return;
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var parent = node.parentNode;
      if (parent && (parent.tagName === 'TEXTAREA' || parent.tagName === 'INPUT' || parent.tagName === 'SELECT')) return;
      var text = node.nodeValue;
      if (!text || text.indexOf('threads.') < 0) return;
      var parts = text.split(/(https?:\/\/www\.threads\.(?:net|com)\/@[^\s]+)/gi);
      if (parts.length <= 1) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part, i) {
        if (i % 2 === 1 && /threads\.(?:net|com)/i.test(part)) {
          var card = createThreadsCard(part.trim());
          if (card) frag.appendChild(card);
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode.replaceChild(frag, node);
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
      return '<img class="' + cls + '" src="' + escapeHtml(profile.avatar_url) + '" alt="" loading="lazy" decoding="async" data-fb="' + escapeHtml(name.slice(0, 1).toUpperCase()) + '">';
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
      /* 1-3 张: 原图显示 (不压缩); ≥4 张: 预览图压缩显示 */
      var useOriginal = media.length <= 3;
      var imgUrl = useOriginal ? url : mediaPreviewUrl(url);
      var imgAttrs = isGrid
        ? 'src="' + escapeHtml(imgUrl) + '" loading="lazy"'
        : 'data-src="' + escapeHtml(imgUrl) + '"';
      var item = isVideo
        ? '<video src="' + escapeHtml(url) + '" controls preload="metadata"></video>'
        : '<img data-gallery="moment-' + momentId + '" ' + imgAttrs + ' data-orig="' + escapeHtml(url) + '" alt="" decoding="async">';
      if (extra > 0 && i === displayMedia.length - 1) {
        item = '<div class="moment-media-more">' + item +
          '<span class="mm-more-badge">+' + extra + '</span></div>';
      }
      /* 等大占位 + 加载动画 */
      item = '<div class="media-frame' + (isGrid ? ' media-frame--grid' : '') + '" data-frame>' +
        '<span class="media-spinner" aria-hidden="true"><i></i></span>' + item + '</div>';
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

  function renderComment(c, momentId, byParent) {
    var p = c.profiles || {};
    var name = p.display_name || p.username || '读者';
    var kids = (byParent[c.id] || []).map(function (k) { return renderComment(k, momentId, byParent); }).join('');
    return '<div class="moment-comment" data-cmt-node="' + c.id + '">' +
      avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
      '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
      '<span class="mcc-text">' + escapeHtml(c.content) + '</span>' +
      '<div class="mcc-time">' + fmtTime(c.created_at) + '</div>' +
      commentActions(c, momentId) +
      (kids ? '<div class="mc-replies">' + kids + '</div>' : '') +
      '</div></div>';
  }

  function renderComments(moment) {
    var all = moment.moment_comments || [];
    if (!all.length) return '';
    /* 树构建: 顶层评论 + 每条的回复子树 (回复的回复递归嵌套, 不再丢失) */
    var byParent = {};
    var tops = [];
    all.forEach(function (c) {
      if (c.parent_id) { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); }
      else tops.push(c);
    });
    var html = '<div class="moment-comments">';
    tops.forEach(function (c) { html += renderComment(c, moment.id, byParent); });
    html += '</div>';
    return html;
  }

  function canManageMoment(moment) {
    if (!currentUser || !moment) return false;
    return currentUser.id === moment.user_id || (currentProfile && currentProfile.role === 'superadmin');
  }

  /* ── 内联回复输入条: 展开于目标评论下方, 发送/取消/Esc/点击外部自动收起隐藏 ── */
  function closeReplyBar(wrap) {
    if (!wrap || wrap.dataset.closing) return;
    wrap.dataset.closing = '1';
    wrap.classList.add('closing');
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 400);
  }

  function closeAllReplyBars(except) {
    listEl.querySelectorAll('.mc-reply-bar-wrap').forEach(function (wrap) {
      if (wrap !== except) closeReplyBar(wrap);
    });
  }

  function openReplyBar(replyBtn) {
    var comment = replyBtn.closest('.moment-comment');
    var momentId = replyBtn.dataset.cmtMoment;
    var parentId = replyBtn.dataset.cmtReply;
    if (!comment || !momentId || !parentId) return;
    closeAllReplyBars();
    var body = comment.querySelector('.mcc-body');
    var existing = body && body.querySelector(':scope > .mc-reply-bar-wrap');
    if (existing) {
      delete existing.dataset.closing;
      existing.classList.remove('closing');
      var inp0 = existing.querySelector('input');
      if (inp0) inp0.focus();
      return;
    }
    var author = replyBtn.dataset.cmtAuthor || '';
    var wrap = document.createElement('div');
    wrap.className = 'mc-reply-bar-wrap';
    wrap.innerHTML =
      '<div class="mc-reply-bar">' +
        '<input type="text" maxlength="2000" placeholder="回复 @' + escapeHtml(author) + '…" autocomplete="off">' +
        '<button type="button" class="rbar-send" data-cmt-reply-send="' + parentId + '" data-cmt-reply-moment="' + momentId + '">回复</button>' +
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

  function submitReplyComment(momentId, parentId, text, bar, btn) {
    window.blogSupabase.from('moment_comments')
      .insert({ moment_id: momentId, user_id: currentUser.id, content: text, parent_id: parentId })
      .select('id, content, created_at, parent_id, profiles(display_name, username, avatar_url)')
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        var comment = result.data;
        /* Realtime 事件可能先于本回调到达 → 已存在则跳过 */
        if (commentNode(comment.moment_id, comment.id)) return;
        var panel = listEl.querySelector('[data-moment-comments="' + momentId + '"]');
        if (!panel) { loadMoments(); return; }
        appendCommentNode(momentId, comment);
        closeReplyBar(bar); /* 发送成功 → 输入条自动收起隐藏 */
      })
      .catch(function (error) {
        var msg = (error && error.message) || String(error);
        if (/permission|RLS|policy|row.?level|not allowed/i.test(msg)) {
          flashNotice('回复失败：评论权限未配置（数据库 RLS）');
        } else {
          flashNotice('回复失败：' + msg);
        }
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ── 编辑面板媒体编辑: 新增/替换/删除/排序 ── */
  var editMediaFiles = {};
  var editMediaSeq = 0;

  function editMediaItemHtml(url) {
    var ext = String(url).split('.').pop().toLowerCase();
    var isVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext);
    var preview = isVideo
      ? '<video src="' + escapeHtml(url) + '" muted playsinline preload="metadata"></video>'
      : '<img src="' + escapeHtml(mediaPreviewUrl(url)) + '" data-orig="' + escapeHtml(url) + '" alt="" decoding="async">';
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

  /* 编辑面板地点栏 (复用发布器 mlp-* 结构; 自定义选择仅用条目字段, 不混 GPS 数据) */
  function renderEditLoc(moment) {
    return '<div class="mem-loc" data-edit-loc>' +
      '<button type="button" class="btn mem-loc-add" data-edit-loc-add style="font-size:12px;">📍 地点</button>' +
      '<span class="mc-loc-chip" data-edit-loc-chip hidden>' +
      '<span>📍</span><b data-edit-loc-name></b>' +
      '<button type="button" class="mc-loc-remove" data-edit-loc-remove aria-label="移除地点">✕</button></span>' +
      '<div class="mc-loc-panel" data-edit-loc-panel data-lenis-prevent-wheel hidden>' +
      '<div class="mlp-row">' +
      '<button type="button" class="mlp-locate" data-edit-locate>◎ 使用当前位置</button>' +
      '<span class="mlp-status mono" data-edit-loc-status></span></div>' +
      '<input type="text" class="mlp-search" data-edit-loc-search placeholder="搜索地点…" autocomplete="off">' +
      '<div class="mlp-list" data-edit-loc-list></div>' +
      '<div class="mlp-attr mono">地点数据 © OpenStreetMap</div>' +
      '</div></div>';
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
      (moment.location && moment.location.name
        ? '<div class="moment-loc">📍 ' + escapeHtml(moment.location.name) + '</div>'
        : '') +
      renderMedia(moment) +
      (canManage ? '<div class="moment-edit-panel" data-moment-edit-panel="' + moment.id + '" hidden>' +
      '<textarea class="moment-edit-input" rows="4" maxlength="2000" data-moment-edit-input="' + moment.id + '">' + escapeHtml(moment.content || '') + '</textarea>' +
      renderEditMedia(moment) +
      renderEditLoc(moment) +
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
      (currentProfile && currentProfile.role === 'superadmin' ? '<button type="button" class="moment-action-btn" data-moment-visibility="' + moment.id + '">可见性</button>' : '') +
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
      momentDataCache = {};
      moments.forEach(function (m) { momentMediaCache[m.id] = m.media || []; momentDataCache[m.id] = m; });
      diffRenderMoments(moments);
      if (window.__blogLightbox && typeof window.__blogLightbox.reload === 'function') {
        window.__blogLightbox.reload();
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

  function releaseSelectedMedia() {
    selectedMedia.forEach(function (item) {
      if (item.file && item.url) URL.revokeObjectURL(item.url);
    });
    selectedMedia = [];
  }

  /* ── Diff 渲染: 只重渲染数据变化的卡片, 未变卡片保持原 DOM (图片/头像不重新加载, 杜绝闪烁) ── */
  function momentKey(m) {
    var p = m.profiles || {};
    /* 用户上下文纳入 key: 登录/登出后点赞态与操作按钮需重新渲染 */
    var uid = currentUser ? currentUser.id : '';
    var role = currentProfile ? currentProfile.role : '';
    return JSON.stringify({
      u: uid + '|' + role,
      c: m.content,
      m: m.media,
      l: m.location || null,
      v: m.visibility || 'public',
      vt: m.visible_to || [],
      hf: m.hidden_from || [],
      a: p.avatar_url || '',
      n: p.display_name || p.username || '',
      t: m.created_at
    });
  }

  function diffRenderMoments(moments) {
    if (!moments.length) {
      listEl.innerHTML = '<div class="moments-empty">还没有动态，发布第一条吧。</div>';
      return;
    }
    var nextIds = {};
    moments.forEach(function (m) { nextIds[m.id] = true; });
    /* 1. 移除已不存在的卡片 (删除/可见性过滤) */
    listEl.querySelectorAll('.moment-card').forEach(function (card) {
      var id = card.dataset.momentId;
      if (!nextIds[id]) {
        destroyEditSortable(id);
        revokeEditMediaBlobs(card);
        card.remove();
      }
    });
    /* 2. 逐条对比: key 相同 → 复用 DOM; key 不同 → 重渲染; 不存在 → 插入 (保持 desc 顺序) */
    var prevSibling = null;
    var fresh = [];
    moments.forEach(function (m) {
      var id = m.id;
      var key = momentKey(m);
      var existing = listEl.querySelector('[data-moment-id="' + id + '"]');
      if (existing && existing.dataset.ck === key) {
        syncCardCounts(m, existing);
        prevSibling = existing;
        return;
      }
      var holder = document.createElement('div');
      holder.innerHTML = renderMoment(m);
      var node = holder.firstElementChild;
      node.dataset.ck = key;
      if (existing) {
        destroyEditSortable(id);
        revokeEditMediaBlobs(existing);
        existing.replaceWith(node);
      } else if (prevSibling) {
        prevSibling.after(node);
      } else {
        listEl.prepend(node);
      }
      prevSibling = node;
      fresh.push(node);
    });
    if (fresh.length) {
      fresh.forEach(function (card) {
        transformThreadsLinks(card);
        preloadSingleImages(card);
        markLongImages(card);
      });
      animateCardsIn(fresh);
    }
  }

  /* 复用卡片: 仅同步点赞/评论数字与点赞态 (不重渲染, 图片零重载) */
  function syncCardCounts(m, card) {
    var liked = false;
    if (currentUser && Array.isArray(m.moment_likes)) {
      liked = m.moment_likes.some(function (l) { return l.user_id === currentUser.id; });
    }
    var likeCount = (m.moment_likes && m.moment_likes.length) || 0;
    var commentCount = (m.moment_comments && m.moment_comments.length) || 0;
    var likeBtn = card.querySelector('[data-moment-like]');
    if (likeBtn) {
      var countEl = likeBtn.querySelector('.ma-count');
      if (countEl && (parseInt(countEl.textContent, 10) || 0) !== likeCount) countEl.textContent = likeCount;
      if (likeBtn.classList.contains('is-liked') !== liked) {
        likeBtn.classList.toggle('is-liked', liked);
        var label = Array.prototype.find.call(likeBtn.childNodes, function (n) { return n.nodeType === 3; });
        if (label) label.textContent = liked ? '已赞 ' : '点赞 ';
      }
    }
    var toggle = card.querySelector('[data-moment-toggle-comments]');
    if (toggle) {
      var cc = toggle.querySelector('.ma-count');
      if (cc && (parseInt(cc.textContent, 10) || 0) !== commentCount) cc.textContent = commentCount;
    }
  }
  function showComposer(show) {
    composer.hidden = !show;
    if (show) loginWall.hidden = true;
    if (!show) {
      mcInput.value = '';
      releaseSelectedMedia();
      mcMediaList.innerHTML = '';
      mcError.hidden = true;
      resetLocState();
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
      } catch (e) {
        /* 网络抖动兜底: 重试一次 — 仍失败则不强制隐藏发送框 (修复输入框偶尔消失) */
        try {
          currentProfile = await window.Profile.get(currentUser.id);
        } catch (e2) {
          currentProfile = null;
        }
      }
      var canPublish = currentProfile && (currentProfile.role === 'superadmin' || currentProfile.role === 'author');
      if (canPublish) showComposer(true);
      else if (currentProfile !== null) composer.hidden = true;
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
        .insert({ user_id: currentUser.id, content: content, media: media, location: selectedLocation })
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

  var momentDataCache = {};

  /* ── 动态可见性 (管理员): 公开 / 只让谁看 / 不让谁看 ──
     成熟模式: 服务端 RLS 强制过滤 (moments_select 策略), 前端仅选择用户 */
  function openMomentVisibility(moment) {
    var vis = moment.visibility || 'public';
    var visibleTo = Array.isArray(moment.visible_to) ? moment.visible_to : [];
    var hiddenFrom = Array.isArray(moment.hidden_from) ? moment.hidden_from : [];
    var overlay = document.createElement('div');
    overlay.className = 'moment-vis-overlay';
    overlay.innerHTML =
      '<div class="moment-vis-panel">' +
        '<div class="mv-head"><span class="mono mv-title">[ 动态可见性 ]</span>' +
        '<button type="button" class="mv-close" aria-label="关闭">×</button></div>' +
        '<div class="mv-mode">' +
          '<label class="mv-mode-opt' + (vis === 'public' ? ' on' : '') + '"><input type="radio" name="mv-mode" value="public"' + (vis === 'public' ? ' checked' : '') + '>公开</label>' +
          '<label class="mv-mode-opt' + (vis === 'whitelist' ? ' on' : '') + '"><input type="radio" name="mv-mode" value="whitelist"' + (vis === 'whitelist' ? ' checked' : '') + '>只让谁看</label>' +
          '<label class="mv-mode-opt' + (vis === 'blacklist' ? ' on' : '') + '"><input type="radio" name="mv-mode" value="blacklist"' + (vis === 'blacklist' ? ' checked' : '') + '>不让谁看</label>' +
        '</div>' +
        '<div class="mv-hint mono">公开 = 所有人可见 · 只让谁看 = 仅选中用户 · 不让谁看 = 除选中用户外</div>' +
        '<div class="mv-list" data-mv-list><div class="mv-loading mono">加载用户列表…</div></div>' +
        '<div class="mv-foot"><button type="button" class="mv-save">保存</button><button type="button" class="mv-cancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var listEl = overlay.querySelector('[data-mv-list]');
    var saveBtn = overlay.querySelector('.mv-save');

    function renderUsers(users) {
      listEl.innerHTML = users.map(function (u) {
        var id = u.id;
        var name = u.display_name || u.username || u.email || '用户';
        var onV = visibleTo.indexOf(id) >= 0;
        var onH = hiddenFrom.indexOf(id) >= 0;
        return '<div class="mv-user' + (onV ? ' v-on' : '') + (onH ? ' h-on' : '') + '" data-uid="' + escapeHtml(id) + '">' +
          '<div class="mv-uin"><span class="mv-name">' + escapeHtml(name) + '</span>' +
          '<span class="mv-mail mono">' + escapeHtml(u.email || '') + '</span></div>' +
          '<div class="mv-acts">' +
          '<button type="button" class="mv-act mv-act-v" data-mv-allow title="只让此用户看">只让</button>' +
          '<button type="button" class="mv-act mv-act-h" data-mv-block title="不让此用户看">不让</button>' +
          '</div></div>';
      }).join('') || '<div class="mv-empty mono">无用户</div>';
      /* 用户行 stagger 入场 */
      var rows = listEl.querySelectorAll('.mv-user');
      rows.forEach(function (row, i) {
        row.style.transitionDelay = (i * 26) + 'ms';
        requestAnimationFrame(function () { row.classList.add('in'); });
      });
      setTimeout(function () {
        rows.forEach(function (row) { row.style.transitionDelay = ''; });
      }, rows.length * 26 + 400);
    }
    window.Admin.getAllUsers().then(function (users) {
      renderUsers(users || []);
    }).catch(function (e) {
      listEl.innerHTML = '<div class="mv-empty mono">用户列表加载失败：' + escapeHtml(e.message || e) + '</div>';
    });

    function toggleUser(row, kind) {
      if (kind === 'v') {
        row.classList.toggle('v-on');
        row.classList.toggle('h-on', false);
      } else {
        row.classList.toggle('h-on');
        row.classList.toggle('v-on', false);
      }
    }
    function close() {
      overlay.classList.remove('show');
      setTimeout(function () { overlay.remove(); }, 240);
    }
    function save() {
      if (saveBtn.disabled) return;
      var modeEl = overlay.querySelector('input[name="mv-mode"]:checked');
      var mode = modeEl ? modeEl.value : 'public';
      var vUsers = [], hUsers = [];
      listEl.querySelectorAll('.mv-user').forEach(function (row) {
        if (row.classList.contains('v-on')) vUsers.push(row.dataset.uid);
        if (row.classList.contains('h-on')) hUsers.push(row.dataset.uid);
      });
      var payload = {
        visibility: mode,
        visible_to: vUsers,
        hidden_from: hUsers,
        updated_at: new Date().toISOString()
      };
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      window.blogSupabase.from('moments').update(payload).eq('id', moment.id)
        .then(function (r) {
          if (r.error) throw r.error;
          flashNotice('可见性已更新', 'success');
          close();
          loadMoments();
        })
        .catch(function (err) {
          flashNotice('保存失败：' + (err.message || err));
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
        });
    }
    /* 入场: 双 rAF 保证过渡触发 */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('show'); });
    });
    /* 模式切换: 高亮跟随 */
    overlay.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'mv-mode') {
        overlay.querySelectorAll('.mv-mode-opt').forEach(function (l) {
          l.classList.toggle('on', !!l.querySelector('input').checked);
        });
      }
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { close(); return; }
      if (e.target.closest('.mv-close') || e.target.closest('.mv-cancel')) { close(); return; }
      var allowBtn = e.target.closest('[data-mv-allow]');
      if (allowBtn) { toggleUser(allowBtn.closest('.mv-user'), 'v'); return; }
      var blockBtn = e.target.closest('[data-mv-block]');
      if (blockBtn) { toggleUser(blockBtn.closest('.mv-user'), 'h'); return; }
      if (e.target.closest('.mv-save')) { save(); return; }
    });
  }

  /* ── 动态图片放大: 独立 GLightbox 实例 (selector: null, 纯 JS API 驱动)
     官方文档模式: setElements([{href,type}]) + openAt(index)
     该动态全部图片 (含收起的 +N) 构成画廊 → 左右键浏览完整, 与文章图实例完全隔离
     关键: 原生 glightbox 把 click 监听直接绑定在 img 元素上 (目标阶段先执行),
     必须在 document 捕获阶段拦截 (stopPropagation) 才能阻止原生 9 张画廊抢先打开 */
  var momentsLightbox = null;
  var momentMediaCache = {};
  var glightboxLibPromise = null;
  var loaderTimer = null;
      var trackpadSwipeCleanup = null;

  /* ── 触控板手势 (lightbox 打开时启用):
     横向: 手指左滑下一张/右滑上一张 (与触摸一致) + preventDefault 禁用浏览器历史手势 */
  function enableTrackpadSwipe(lightbox) {
    var lastSwipe = 0;
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
      }
    }
    document.addEventListener('wheel', onWheel, { passive: false });
    return function () { document.removeEventListener('wheel', onWheel); };
  }



  function isVideoUrl(url) {
    var path = String(url).split('?')[0].split('#')[0];
    var ext = path.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v'].indexOf(ext) >= 0;
  }

  /* 预览图 URL: 上传时约定 preview- 前缀 (旧数据无预览文件时 404 回退原图) */
  function mediaPreviewUrl(url) {
    var u = String(url);
    var i = u.lastIndexOf('/');
    if (i < 0) return u;
    return u.slice(0, i + 1) + 'preview-' + u.slice(i + 1);
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

  /* 放大查看页码计数 (1 / N): 注入到 glightbox 容器左上角, 随翻页更新 */
  function updateLightboxCounter() {
    var body = document.getElementById('glightbox-body');
    if (!body) return;
    var total = momentsLightbox && momentsLightbox.elements ? momentsLightbox.elements.length : 0;
    var c = body.querySelector('.gcounter');
    if (total <= 1) {
      if (c) c.style.display = 'none';
      return;
    }
    if (!c) {
      c = document.createElement('div');
      c.className = 'gcounter';
      var g = body.querySelector('.gcontainer');
      (g || body).appendChild(c);
    }
    var idx = (typeof momentsLightbox.getActiveSlideIndex === 'function'
      ? momentsLightbox.getActiveSlideIndex() : 0) + 1;
    c.textContent = idx + ' / ' + total;
    c.style.display = '';
  }

  function hideLightboxCounter() {
    var body = document.getElementById('glightbox-body');
    var c = body && body.querySelector('.gcounter');
    if (c) c.style.display = 'none';
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
        preload: true,
        openEffect: 'zoom',
        closeEffect: 'zoom'
      });
      /* 触控板横滑: 打开时启用, 关闭时移除 */
      momentsLightbox.on('open', function () {
        if (!trackpadSwipeCleanup) trackpadSwipeCleanup = enableTrackpadSwipe(momentsLightbox);
        updateLightboxCounter();
      });
      momentsLightbox.on('close', function () {
        if (trackpadSwipeCleanup) { trackpadSwipeCleanup(); trackpadSwipeCleanup = null; }
        hideLightboxCounter();
      });
      /* 翻页: 同步右下角页码计数 (1 / N) */
      momentsLightbox.on('slide_changed', function () {
        updateLightboxCounter();
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
        return '<video src="' + escapeHtml(url) + '" controls preload="metadata"></video>';
      }
      var useOriginal2 = allMedia.length <= 3;
      return '<img data-gallery="moment-' + card.dataset.momentId + '" src="' + escapeHtml(useOriginal2 ? url : mediaPreviewUrl(url)) + '" data-orig="' + escapeHtml(url) + '" alt="" loading="lazy" decoding="async">';
    }).map(function (item) {
      return '<div class="media-frame media-frame--grid" data-frame>' +
        '<span class="media-spinner" aria-hidden="true"><i></i></span>' + item + '</div>';
    }).join('');
    wrap.insertAdjacentHTML('beforeend', extraHtml);
    var more = wrap.querySelector('.moment-media-more');
    if (more) {
      var badge = more.querySelector('.mm-more-badge');
      if (badge) badge.remove();
    }
    markLongImages();
    flashNotice('已展开全部图片', 'success');
    return true;
  }

  function openMomentLightbox(img) {
    var card = img.closest('.moment-card');
    if (!card) return false;
    var allMedia = momentMediaCache[card.dataset.momentId] || [];
    var images = allMedia.filter(function (url) { return !isVideoUrl(url); });
    if (!images.length) return false;
    /* 点击哪张预览就放大哪张: preview URL 与原图文件名归一化匹配
       (多图预览 src 是 preview-xxx, 画廊元素是原图 xxx — indexOf 直接匹配会失败) */
    function fileKey(url) {
      var u = String(url || '').split('?')[0];
      var name = u.slice(u.lastIndexOf('/') + 1);
      if (name.indexOf('preview-') === 0) name = name.slice(8);
      return name;
    }
    var clickedKey = fileKey(img.getAttribute('src') || img.getAttribute('data-src'));
    var startAt = 0;
    images.forEach(function (u, i) { if (fileKey(u) === clickedKey) startAt = i; });
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

  /* 媒体加载状态: 隐藏 spinner (等大占位完成) + 单图锁定真实比例 + preview 404 回退原图
     load/error 不冒泡 → 捕获阶段委托 */
  listEl.addEventListener('load', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    /* 串文卡片媒体: 加载完成后标记已载 (淡入) 并重排等高校对 */
    if (el.closest('.threads-card')) {
      el.classList.add('is-loaded');
      layoutThreadsMedia(el.closest('.threads-card'));
      return;
    }
    /* 头像: 加载完成淡入 (尺寸固定, 零跳变) */
    if (el.classList.contains('moment-avatar') || el.classList.contains('mc-avatar')) {
      el.classList.add('is-loaded');
      return;
    }
    var frame = el.closest('.media-frame');
    if (frame) frame.classList.add('loaded');
    /* 持久化缓存: 加载完成后的预览图存入 Cache API */
    if (!el.src || el.src.indexOf('blob:') === 0) return;
    cachePreviewImage(el);
    /* 旧数据补建: 当前是原图(非 preview)且无 preview 文件 → 后台压缩上传 */
    if (el.src.indexOf('/preview-') < 0) {
      buildPreviewForLegacy(el);
    }
    /* 单图 (非网格): 加载完成锁定真实宽高比 — 占位与最终等大 */
    if (frame && !frame.classList.contains('media-frame--grid') && el.naturalWidth) {
      sizeFrame(frame, el.naturalWidth, el.naturalHeight);
    }
    markLongImages();
  }, true);

  /* 串文卡片图片加载失败兜底: 结束骨架脉动 (fbcdn 签名 URL 过期属已知情况), 不无限闪烁 */
  listEl.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    if (el.closest('.threads-card')) {
      el.classList.add('is-loaded', 'is-broken');
    }
  }, true);
  /* ── 预览图缓存: 加载完成后持久化 (Cache API), 滚动经过/刷新不再重复下载卡顿 ── */
  var previewCacheName = 'media-previews-v1';

  function getPreviewCache() {
    if (!('caches' in window)) return null;
    return caches.open(previewCacheName);
  }

  /* 图片加载完成后存入缓存 */
  function cachePreviewImage(img) {
    var url = img.currentSrc || img.src;
    /* 仅缓存预览图 (1-3 张原图体积大, 不入缓存) */
    if (!url || url.indexOf('blob:') === 0 || url.indexOf('/preview-') < 0 || !('caches' in window)) return;
    getPreviewCache().then(function (cache) {
      cache.match(url).then(function (hit) {
        if (hit) return;
        fetch(url).then(function (res) {
          if (res.ok) cache.put(url, res);
        }).catch(function () {});
      });
    }).catch(function () {});
  }

  /* 加载前先查缓存: 命中则用 blob URL 直接显示 (零网络) */
  function servePreviewFromCache(img, done) {
    var url = img.dataset.src || img.src;
    if (!url || url.indexOf('blob:') === 0 || !('caches' in window)) {
      if (done) done(false);
      return;
    }
    getPreviewCache().then(function (cache) {
      cache.match(url).then(function (hit) {
        if (!hit) { if (done) done(false); return; }
        hit.blob().then(function (blob) {
          var objUrl = URL.createObjectURL(blob);
          img.src = objUrl;
          /* 缓存命中同样锁定真实比例 (blob 本地解码, 零网络零跳变) */
          var probe = new Image();
          probe.onload = function () {
            var frame = img.closest('.media-frame');
            sizeFrame(frame, probe.naturalWidth, probe.naturalHeight);
          };
          probe.src = objUrl;
          img.addEventListener('load', function () {
            setTimeout(function () { URL.revokeObjectURL(objUrl); }, 1000);
          }, { once: true });
          var frame = img.closest('.media-frame');
          if (frame) frame.classList.add('loaded');
          if (done) done(true);
        }).catch(function () { if (done) done(false); });
      }).catch(function () { if (done) done(false); });
    }).catch(function () { if (done) done(false); });
  }

  /* 单图准确占位: 预读真实宽高比 → frame 占位准确 → 缓存命中立即显示 (零跳变)
     sizeFrame: aspect-ratio 不可动画, 显式 height(px) 参与过渡 → 120px 占位平滑展开到真实高度 */
  function sizeFrame(frame, w, h) {
    if (!frame || !w || !h || frame.classList.contains('media-frame--grid')) return;
    var targetH = Math.max(1, Math.round(frame.clientWidth * h / w));
    frame.style.aspectRatio = w + ' / ' + h;
    frame.style.height = targetH + 'px';
    frame.style.minHeight = '0';
    frame.classList.add('sized');
  }

  function preloadSingleImages(root) {
    (root || listEl).querySelectorAll('.media-frame:not(.media-frame--grid) img[data-src]').forEach(function (img) {
      function probe(url, done) {
        var p = new Image();
        p.onload = function () {
          var frame = img.closest('.media-frame');
          sizeFrame(frame, p.naturalWidth, p.naturalHeight);
          img.src = url;
          delete img.dataset.src;
          delete img.dataset.orig;
          if (done) done(true);
        };
        p.onerror = function () { if (done) done(false); };
        p.src = url;
      }
      var previewUrl = img.dataset.src;
      /* 缓存优先: 命中则零网络显示, 否则正常预读 */
      servePreviewFromCache(img, function (cached) {
        if (cached) return;
        probeChain();
      });
      function probeChain() {
      if (img.dataset.orig) {
        probe(previewUrl, function (ok) {
          if (!ok) probe(img.dataset.orig, function (ok2) {
            /* 预读全部失败兜底: 直接显示原图 (无准确占位但保证显示) */
            if (!ok2 && img.dataset.orig) {
              img.src = img.dataset.orig;
              delete img.dataset.src;
              delete img.dataset.orig;
            }
          });
        });
      } else {
        probe(previewUrl, function (ok) {
          if (!ok && img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
        });
      }
      }
    });
  }

  /* ── 旧数据自动补建预览图 ──
     历史动态无 preview 文件 → 原图(6MB+)回退导致滚动卡顿。
     管理员浏览时后台压缩原图并上传 preview (600px webp), 一次性, 之后全部优化生效 */
  function buildPreviewForLegacy(img) {
    if (!window.blogSupabase || !currentProfile || currentProfile.role !== 'superadmin') return;
    /* 仅 ≥4 张的动态补建 (1-3 张保持原图不压缩) */
    var card = img.closest('.moment-card');
    var mediaLen = card ? (momentMediaCache[card.dataset.momentId] || []).length : 0;
    if (mediaLen <= 3) return;
    var url = img.currentSrc || img.src;
    if (!url || url.indexOf('blob:') === 0 || url.indexOf('/preview-') >= 0) return;
    if (img.dataset.previewBuilt) return;
    img.dataset.previewBuilt = '1';
    var previewUrl = mediaPreviewUrl(url);
    /* 已有 preview 则跳过 */
    fetch(previewUrl, { method: 'HEAD' }).then(function (res) {
      if (res.ok) return;
      /* 后台压缩: fetch(有 CORS) → createImageBitmap → canvas → webp 600px */
      fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
        return (window.createImageBitmap ? createImageBitmap(blob) : Promise.reject());
      }).then(function (bmp) {
        var maxW = 600;
        var scale = Math.min(1, maxW / bmp.width);
        var w = Math.max(1, Math.round(bmp.width * scale));
        var h = Math.max(1, Math.round(bmp.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
        canvas.toBlob(function (out) {
          if (!out) return;
          var marker = '/object/public/media/';
          var i = url.indexOf(marker);
          if (i < 0) return;
          var pathPart = url.slice(i + marker.length).split('?')[0];
          var slash = pathPart.lastIndexOf('/');
          var previewPath = pathPart.slice(0, slash + 1) + 'preview-' + pathPart.slice(slash + 1);
          var file = new File([out], previewPath.split('/').pop(), { type: 'image/webp' });
          window.blogSupabase.storage.from('media').upload(previewPath, file, {
            upsert: true,
            contentType: 'image/webp',
            cacheControl: '3600'
          }).then(function (r) {
            if (!r.error && img.isConnected) {
              /* 补建成功: 立即切换预览图 (当前帧已加载原图, 下一轮起生效) */
              img.src = previewUrl;
              img.dataset.previewBuilt = '2';
            }
          }).catch(function () {});
        }, 'image/webp', 0.7);
      }).catch(function () {});
    }).catch(function () {});
  }

  /* 视频元数据就绪 → 隐藏 spinner */
  listEl.addEventListener('loadeddata', function (e) {
    var el = e.target;
    if (el && el.tagName === 'VIDEO') {
      var frame = el.closest('.media-frame');
      if (frame) frame.classList.add('loaded');
    }
  }, true);
  listEl.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    /* 头像加载失败 → 回退字母占位 (破图图标替换为同尺寸字母块) */
    if (el.dataset.fb && !el.dataset.fbDone) {
      el.dataset.fbDone = '1';
      var span = document.createElement('span');
      span.className = el.className + (el.classList.contains('moment-avatar') ? ' moment-avatar-fallback' : ' mc-avatar-fallback');
      span.textContent = el.dataset.fb;
      el.replaceWith(span);
      return;
    }
    var frame = el.closest('.media-frame');
    if (frame) frame.classList.add('loaded');
    /* 预览图 404 (旧数据无 preview 文件) → 回退原图 */
    if (el.dataset.orig && (!el.src || el.src.indexOf('/preview-') >= 0)) {
      el.src = el.dataset.orig;
      delete el.dataset.orig;
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
        /* 地点: 重新打开 = 丢弃未保存修改, 按当前数据重建状态 */
        var momentData = momentDataCache[editId];
        editLocInitState(editId, momentData || {});
        editLocRenderChip(editCard, editLocState[editId]);
        editPanel.hidden = false;
        editInput.focus();
        initEditSortable(editPanel);
      }
      return;
    }

    /* 编辑面板地点: 打开面板 / 定位 / 选择 / 移除 */
    var editLocAddBtn = e.target.closest('[data-edit-loc-add]');
    if (editLocAddBtn) {
      var editLocCard = editLocAddBtn.closest('.moment-card');
      var editLocId = editLocCard && editLocCard.dataset.momentId;
      var editLocPanel = editLocCard && editLocCard.querySelector('[data-edit-loc-panel]');
      var editLocSt = editLocState[editLocId];
      if (editLocCard && editLocPanel && editLocSt) {
        editLocOpenPanel(editLocPanel, editLocSt);
      }
      return;
    }
    var editLocateBtn = e.target.closest('[data-edit-locate]');
    if (editLocateBtn) {
      var elc = editLocateBtn.closest('.moment-card');
      var elId = elc && elc.dataset.momentId;
      var elPanel = elc && elc.querySelector('[data-edit-loc-panel]');
      if (elPanel && editLocState[elId]) editLocGpsLocate(elPanel, editLocState[elId]);
      return;
    }
    var editLocRemoveBtn = e.target.closest('[data-edit-loc-remove]');
    if (editLocRemoveBtn) {
      var elrc = editLocRemoveBtn.closest('.moment-card');
      var elrId = elrc && elrc.dataset.momentId;
      var elrSt = editLocState[elrId];
      if (elrSt) {
        elrSt.selected = null;
        elrSt.dirty = true;
        editLocRenderChip(elrc, elrSt);
      }
      return;
    }
    var editLocItem = e.target.closest('[data-edit-loc-panel] .mlp-item');
    if (editLocItem) {
      var elp = editLocItem.closest('[data-edit-loc-panel]');
      var elpc = elp && elp.closest('.moment-card');
      var elpId = elpc && elpc.dataset.momentId;
      if (elp && editLocState[elpId]) {
        editLocSelect(elp, editLocState[elpId], {
          name: editLocItem.dataset.locName,
          lat: parseFloat(editLocItem.dataset.locLat),
          lng: parseFloat(editLocItem.dataset.locLng)
        });
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
      editLocDiscard(cancelId);
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
          var updatePayload = { content: nextContent, media: media, updated_at: new Date().toISOString() };
          /* 地点: 仅当用户操作过 (dirty) 才写入; 移除 → location 置 null */
          var locSt = editLocState[saveId];
          if (locSt && locSt.dirty) {
            updatePayload.location = locSt.selected || null;
          }
          return window.blogSupabase.from('moments')
            .update(updatePayload)
            .eq('id', saveId)
            .select('id, content, updated_at');
        })
        .then(function (result) {
          if (result.error) throw result.error;
          revokeEditMediaBlobs(saveCard);
          resetEditMediaState();
          editLocDiscard(saveId);
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

    var visBtn = e.target.closest('[data-moment-visibility]');
    if (visBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var visId = visBtn.dataset.momentVisibility;
      var visMoment = momentDataCache[visId];
      if (visMoment) openMomentVisibility(visMoment);
      return;
    }

    var deleteBtn = e.target.closest('[data-moment-delete]');
    if (deleteBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      /* 瑞士风确认弹窗 (原生 confirm 在某些环境被禁用导致删除失效) */
      window.Admin.confirmDialog({
        title: '[ 删除动态 ]',
        message: '确认删除这条动态？此操作不可恢复。',
        confirmText: '删除',
        danger: true
      }).then(function (ok) {
        if (!ok) { deleteBtn.disabled = false; return; }
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
            var msg = (error && error.message) || String(error);
            if (/permission|RLS|policy|row.?level|not allowed|relation/i.test(msg)) {
              flashNotice('删除失败：数据库权限未配置，请在 Supabase SQL Editor 执行 supabase-moments-visibility.sql');
            } else {
              flashNotice('删除失败：' + msg);
            }
          }).finally(function () {
            deleteBtn.disabled = false;
          });
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
      /* 树状回复: 在目标评论下方展开内联输入条 */
      openReplyBar(cmtReplyBtn);
      return;
    }

    var replySendBtn = e.target.closest('[data-cmt-reply-send]');
    if (replySendBtn) {
      if (!currentUser) { window.BlogAuth.open('login'); return; }
      var parentId = replySendBtn.dataset.cmtReplySend;
      var replyMomentId = replySendBtn.dataset.cmtReplyMoment;
      var bar = replySendBtn.closest('.mc-reply-bar-wrap');
      var rInput = bar && bar.querySelector('input');
      var text = rInput ? rInput.value.trim() : '';
      if (!text) return;
      replySendBtn.disabled = true;
      submitReplyComment(replyMomentId, parentId, text, bar, replySendBtn);
      return;
    }

    var replyCancelBtn = e.target.closest('.rbar-cancel');
    if (replyCancelBtn) {
      closeReplyBar(replyCancelBtn.closest('.mc-reply-bar-wrap'));
      return;
    }

    var cmtDeleteBtn = e.target.closest('[data-cmt-delete]');
    if (cmtDeleteBtn) {
      window.Admin.confirmDialog({
        title: '[ 删除评论 ]',
        message: '确认删除这条评论？此操作不可恢复。',
        confirmText: '删除',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
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
      /* 底部常驻输入条仅发新评论 (顶层); 回复走各评论下方内联输入条 */
      var payload = { moment_id: momentId2, user_id: currentUser.id, content: text };
      window.blogSupabase.from('moment_comments')
        .insert(payload)
        .select('id, content, created_at, parent_id, profiles(display_name, username, avatar_url)')
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          // 本地追加评论 DOM + 评论数字 +1, 不重渲染 (树状插入)
          var comment = result.data;
          /* Realtime 事件可能先于本回调到达 → 已存在则跳过 */
          if (commentNode(comment.moment_id, comment.id)) { cleanupCommentInput(input); return; }
          var panel = listEl.querySelector('[data-moment-comments="' + momentId2 + '"]');
          if (!panel) {
            /* 容器缺失 (UI 重构/未渲染) → 重载列表兜底 */
            loadMoments();
            return;
          }
          appendCommentNode(momentId2, comment);
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

  /* 编辑面板地点: 搜索输入 (防抖 300ms) */
  listEl.addEventListener('input', function (e) {
    var search = e.target.closest('[data-edit-loc-search]');
    if (!search) return;
    var panel = search.closest('[data-edit-loc-panel]');
    var card = panel && panel.closest('.moment-card');
    var st = card && editLocState[card.dataset.momentId];
    if (!panel || !st) return;
    clearTimeout(editLocTimer);
    var q = search.value.trim();
    editLocTimer = setTimeout(function () {
      if (!q) {
        if (st.gps) editLocLoadNearby(panel, st);
        else editLocRenderList(panel, null, '输入关键词搜索地点');
        return;
      }
      editLocSetStatus(panel, '搜索中…');
      locSearch(q).then(function (d) {
        editLocSetStatus(panel, '');
        editLocRenderList(panel, dedupeLocations((d.features || [])), '未找到相关地点');
      }).catch(function () {
        editLocSetStatus(panel, '搜索失败', 'err');
        editLocRenderList(panel, null, '搜索失败，请重试');
      });
    }, 300);
  });

  /* 编辑面板地点: 点击面板以外 → 收起 */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-edit-loc-panel]') || e.target.closest('[data-edit-loc-add]') ||
        e.target.closest('[data-edit-loc-chip]') || e.target.closest('.mlp-item')) return;
    closeAllEditLocPanels(null);
  }, true);

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

  /* ── 长图处理: 高/宽 > 2.35:1 时包裹容器 + 顶部裁切预览 + "长图"角标
     滚动性能: 滚动中加载完成的图不立即 wrap (布局跳动→卡顿), 滚动停止 150ms 后统一处理
     平滑收拢: 先按原比例全高渲染, 下一帧过渡到 280px — 消除 wrap 瞬间的高度跳变 */
  var pendingLongImages = [];
  var scrollIdleTimer = null;

  function wrapLongImage(img) {
    var frame = img.closest('.media-frame');
    var wrap = document.createElement('div');
    wrap.className = 'moment-media-long';
    var tag = document.createElement('span');
    tag.className = 'moment-media-long-tag';
    tag.textContent = '长图';
    if (frame) frame.replaceWith(wrap);
    else img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    wrap.appendChild(tag);
    /* 平滑收拢: 先设原比例全高 → 双 rAF 后回落 CSS 280px (transition 接管) */
    var fullH = 280;
    if (img.naturalWidth) {
      fullH = Math.max(1, Math.round(wrap.clientWidth * img.naturalHeight / img.naturalWidth));
    }
    wrap.style.height = fullH + 'px';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        wrap.style.height = '';
      });
    });
  }

  function flushPendingLongImages() {
    if (!pendingLongImages.length) return;
    var imgs = pendingLongImages;
    pendingLongImages = [];
    imgs.forEach(wrapLongImage);
  }

  function markLongImages(root) {
    (root || listEl).querySelectorAll('.moment-media img').forEach(function (img) {
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
  }

  function commentNode(momentId, commentId) {
    var card = listEl.querySelector('[data-moment-id="' + momentId + '"]');
    if (!card) return null;
    return card.querySelector('[data-cmt-node="' + commentId + '"]');
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
    node.className = 'moment-comment mc-new';
    node.dataset.cmtNode = comment.id;
    node.innerHTML = avatarHtml(p, 'mc-avatar', 'mc-avatar-fallback') +
      '<div class="mcc-body"><span class="mcc-author">' + escapeHtml(name) + '</span> ' +
      '<span class="mcc-text">' + escapeHtml(comment.content) + '</span>' +
      '<div class="mcc-time">' + fmtTime(comment.created_at) + '</div>' +
      commentActions(comment, momentId) + '</div>';
    var inputRow = panel.querySelector('.moment-comment-input');
    if (comment.parent_id) {
      /* 树状插入: 挂入父评论的回复子树 (容器不存在时自动创建) */
      var parentNode = panel.querySelector('[data-cmt-node="' + comment.parent_id + '"]');
      if (parentNode) {
        var body = parentNode.querySelector('.mcc-body');
        var replies = body && body.querySelector(':scope > .mc-replies');
        if (!replies) {
          replies = document.createElement('div');
          replies.className = 'mc-replies';
          if (body) body.appendChild(replies);
        }
        if (replies) { replies.appendChild(node); bumpCommentCount(momentId, 1); return true; }
      }
      /* 父评论不在当前渲染 (兜底) */
    }
    panel.insertBefore(node, inputRow);
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
      var parentComment = node.closest('.moment-comment');
      node.remove();
      /* 清理空回复容器 */
      if (parentComment) {
        var body = parentComment.querySelector('.mcc-body');
        var replies = body && body.querySelector(':scope > .mc-replies');
        if (replies && !replies.children.length) replies.remove();
      }
      bumpCommentCount(row.moment_id, -1);
    }
  }

  /* 回复输入条自动收起: Esc / 点击评论区域以外 */
  listEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var bar = e.target.closest('.mc-reply-bar-wrap');
    if (bar) closeReplyBar(bar);
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.mc-reply-bar-wrap') || e.target.closest('[data-cmt-reply]')) return;
    closeAllReplyBars();
  }, true);

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

  /* ── 发动态悬浮按键: 滚动弹性回弹动效 (复用文章页目录悬浮面板 rAF lerp 模式)
     滚动超过 260px 显示; 点击 → 平滑滚回顶部 + 发送框显现 + 聚焦 */
  var fabEl = document.getElementById('momentsFab');
  if (fabEl) {
    var fabCur = 0, fabTarget = 0, fabLastY = window.scrollY, fabRaf = null;
    function fabFrame() {
      fabCur += (fabTarget - fabCur) * 0.16;
      fabTarget *= 0.86;
      fabEl.style.transform = 'translateY(' + fabCur + 'px)';
      if (Math.abs(fabCur) < 0.1 && Math.abs(fabTarget) < 0.1 && Math.abs(window.scrollY - fabLastY) < 0.5) {
        fabEl.style.transform = '';
        fabRaf = null;
        return;
      }
      fabRaf = requestAnimationFrame(fabFrame);
    }
    function fabKick() {
      var dy = window.scrollY - fabLastY;
      fabLastY = window.scrollY;
      var speed = Math.max(-1, Math.min(1, dy / 10));
      fabTarget = Math.max(-18, Math.min(18, speed * 18));
      if (!fabRaf) fabRaf = requestAnimationFrame(fabFrame);
      fabEl.classList.toggle('is-visible', window.scrollY > 260);
    }
    window.addEventListener('scroll', fabKick, { passive: true });
    fabEl.addEventListener('click', function () {
      /* 平滑滚回顶部 (Lenis 优先, 原生兜底) */
      if (window.__lenis && typeof window.__lenis.scrollTo === 'function') {
        window.__lenis.scrollTo(0, { duration: 1.2 });
      } else {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      }
      /* 发送框显现 + 聚焦 */
      showComposer(true);
      setTimeout(function () {
        try { mcInput.focus(); } catch (e) {}
      }, 520);
    });
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
