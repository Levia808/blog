(function () {
  'use strict';

  // Disable the floating player on mobile to keep the reading surface clear.
  if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return;

  var defaults = {
    enabled: true,
    autoLoad: false,
    playlistId: '',
    proxyBase: 'https://blog-music-api.onrender.com',
    limit: 30,
    level: 'exhigh',
    side: 'left',
    fontSize: 3,
    spacing: 1.4,
    tilt: 6,
    curve: 1,
    fade: 0.25,
    minOpacity: 0.05,
    blur: 2,
    smoothing: 190,
    inset: 80,
    playlistTimeout: 9000,
    initialLimit: 18,
    cacheTtl: 7 * 24 * 60 * 60 * 1000
  };
  function parseConfigScalar(raw) {
    var value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (value === 'true' || value === 'false') return value === 'true';
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
  }

  function parseSimpleYaml(text) {
    var out = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
      if (!match || match[2][0] === '#') return;
      out[match[1]] = parseConfigScalar(match[2]);
    });
    return out;
  }

  function loadRuntimeConfig() {
    var url = window.__FLOAT_PLAYER_CONFIG_URL;
    if (!url || url === false) return Promise.resolve({});
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 1600) : 0;
    var requestUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
    return fetch(requestUrl, {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('Float player config HTTP ' + response.status);
      return response.text();
    }).then(parseSimpleYaml).catch(function () {
      return {};
    }).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  var bootConfig = Object.assign({}, defaults, window.__FLOAT_PLAYER_CONFIG || {});

  function initPlayer(runtimeConfig) {
    var cfg = Object.assign({}, bootConfig, runtimeConfig || {});
    window.__FLOAT_PLAYER_RUNTIME_CONFIG = cfg;
    if (cfg.enabled === false || document.querySelector('.fp-wheel-player')) return;

  var fallbackTracks = [
    { name: 'Prism Drift', artist: 'Night Tape Unit', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { name: 'Chrome Afterimage', artist: 'Sora Frequency', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { name: 'Slow Orbit', artist: 'Velvet Switch', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }
  ];
  var tracks = (window.__FLOAT_PLAYER_TRACKS && window.__FLOAT_PLAYER_TRACKS.length)
    ? window.__FLOAT_PLAYER_TRACKS.slice()
    : (cfg.playlistId ? [] : fallbackTracks.slice());

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function safeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      var url = new URL(value, location.href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function createPlayerDom() {
    var root = document.createElement('section');
    root.className = 'fp-wheel-player is-collapsed is-' + (cfg.side === 'right' ? 'right' : 'left');
    root.id = 'floatPlayer';
    root.setAttribute('aria-label', 'Floating music selector');
    root.setAttribute('data-lenis-prevent-wheel', '');
    root.setAttribute('aria-expanded', 'false');
    root.innerHTML = [
      '<button class="fp-wheel-anchor" id="fpWheelAnchor" type="button" aria-label="展开音乐列表">',
      '<span class="fp-wheel-arrow" aria-hidden="true"></span>',
      '<span class="fp-anchor-loader fp-geometric-loader" aria-hidden="true"></span>',
      '</button>',
      '<div class="fp-wheel-panel" id="fpWheelPanel" role="listbox" tabindex="0" aria-label="歌曲列表" data-lenis-prevent-wheel>',
      '<div class="fp-song-wheel" id="fpSongWheel"></div>',
      '<div class="fp-song-status" id="fpSongStatus" aria-live="polite" hidden></div>',
      '</div>',
      '<media-controller class="fp-media-controller" audio>',
      '<media-control-bar class="fp-transport">',
      '<span class="fp-transport-cover-shell" id="fpTransportCoverShell" hidden>',
      '<i class="fp-geometric-loader fp-geometric-loader--cover" aria-hidden="true"></i>',
      '<img class="fp-transport-cover" id="fpTransportCover" alt="" loading="eager" fetchpriority="high" decoding="async" draggable="false">',
      '</span>',
      '<div class="fp-transport-meta">',
      '<span class="fp-transport-title" id="fpTransportTitle"></span>',
      '<span class="fp-transport-artist" id="fpTransportArtist"></span>',
      '</div>',
      '<div class="fp-transport-progress">',
      '<media-time-display class="fp-transport-time" showduration></media-time-display>',
      '<media-time-range class="fp-transport-range"></media-time-range>',
      '</div>',
      '<media-play-button class="fp-transport-play"></media-play-button>',
      '<media-volume-range class="fp-transport-volume" aria-label="音量"></media-volume-range>',
      '</media-control-bar>',
      '<audio id="fpAudio" slot="media" preload="none"></audio>',
      '</media-controller>'
    ].join('');
    document.body.appendChild(root);
    return root;
  }

  var player = createPlayerDom();
  var anchor = player.querySelector('#fpWheelAnchor');
  var wheel = player.querySelector('#fpWheelPanel');
  var songWheel = player.querySelector('#fpSongWheel');
  var songStatus = player.querySelector('#fpSongStatus');
  var transport = player.querySelector('.fp-transport');
  var transportCoverShell = player.querySelector('#fpTransportCoverShell');
  var transportCover = player.querySelector('#fpTransportCover');
  var transportTitle = player.querySelector('#fpTransportTitle');
  var transportArtist = player.querySelector('#fpTransportArtist');
  var audio = player.querySelector('#fpAudio');

  transportCover.addEventListener('load', function () {
    transportCoverShell.classList.remove('is-loading', 'is-error');
  });
  transportCover.addEventListener('error', function () {
    transportCoverShell.classList.remove('is-loading');
    transportCoverShell.classList.add('is-error');
  });

  songWheel.style.setProperty('--ow-font-size', Number(cfg.fontSize || defaults.fontSize) + 'rem');
  songWheel.style.setProperty('--ow-inset', Number(cfg.inset || defaults.inset) + 'px');

  var state = {
    expanded: false,
    anchorDrag: null,
    suppressAnchorClick: false,
    blockNextPageClick: false,
    selected: 0,
    current: 0,
    pos: 0,
    target: 0,
    raf: 0,
    last: 0,
    wheelTimer: 0,
    drag: null,
    dragMoved: false,
    playing: false,
    playlistStatus: 'idle',
    playlistPromise: null,
    playlistRequestId: '',
    playlistRequestSeq: 0,
    playlistRequestToken: 0,
    playlistRequestLimit: 0,
    loadedPlaylistId: '',
    loadedPlaylistLimit: 0,
    uiRafs: [],
    failedTracks: {}
  };
  var pageOverflowBeforeExpand = null;

  function lockPageScroll() {
    var body = document.body;
    var root = document.documentElement;
    pageOverflowBeforeExpand = {
      body: {
        value: body.style.getPropertyValue('overflow'),
        priority: body.style.getPropertyPriority('overflow')
      },
      root: {
        value: root.style.getPropertyValue('overflow'),
        priority: root.style.getPropertyPriority('overflow')
      }
    };
    body.style.setProperty('overflow', 'hidden');
    root.style.setProperty('overflow', 'hidden');
  }

  function restorePageScroll() {
    if (pageOverflowBeforeExpand === null) return;
    [
      { node: document.body, style: pageOverflowBeforeExpand.body },
      { node: document.documentElement, style: pageOverflowBeforeExpand.root }
    ].forEach(function (entry) {
      if (entry.style.value) {
        entry.node.style.setProperty('overflow', entry.style.value, entry.style.priority);
      } else {
        entry.node.style.removeProperty('overflow');
      }
    });
    pageOverflowBeforeExpand = null;
  }

  function setVar(node, name, value) {
    node.style.setProperty(name, value);
  }

  function setUI(values) {
    if (values.anchorX != null) setVar(anchor, '--anchor-x', values.anchorX.toFixed(2) + 'px');
    if (values.anchorOpacity != null) setVar(anchor, '--anchor-opacity', values.anchorOpacity.toFixed(3));
    if (values.anchorScale != null) setVar(anchor, '--anchor-scale', values.anchorScale.toFixed(3));
    if (values.wheelX != null) setVar(wheel, '--wheel-x', values.wheelX.toFixed(2) + 'px');
    if (values.wheelOpacity != null) setVar(wheel, '--wheel-opacity', values.wheelOpacity.toFixed(3));
  }

  function readNumber(node, name, fallback) {
    var value = parseFloat(getComputedStyle(node).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function getRowH() {
    var sample = songWheel.querySelector('.fp-song-title');
    var fontPx = sample ? parseFloat(getComputedStyle(sample).fontSize) : 0;
    var remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.max((fontPx || cfg.fontSize * remPx) * cfg.spacing, 1);
  }

  function stopUI() {
    state.uiRafs.forEach(cancelAnimationFrame);
    state.uiRafs = [];
  }

  function tween(from, to, duration, update) {
    var start = performance.now();
    function ease(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function tick(now) {
      var p = clamp((now - start) / duration, 0, 1);
      update(from + (to - from) * ease(p));
      if (p < 1) state.uiRafs.push(requestAnimationFrame(tick));
    }
    state.uiRafs.push(requestAnimationFrame(tick));
  }

  function sideSign() {
    return cfg.side === 'right' ? -1 : 1;
  }

  function animateUI(expanded) {
    stopUI();
    var sign = sideSign();
    var current = {
      anchorX: readNumber(anchor, '--anchor-x', 0),
      anchorOpacity: readNumber(anchor, '--anchor-opacity', expanded ? 1 : 0),
      anchorScale: readNumber(anchor, '--anchor-scale', 1),
      wheelX: readNumber(wheel, '--wheel-x', expanded ? -28 * sign : 0),
      wheelOpacity: readNumber(wheel, '--wheel-opacity', expanded ? 0 : 1)
    };

    anchor.style.pointerEvents = 'auto';
    tween(current.wheelX, expanded ? 0 : -28 * sign, expanded ? 420 : 280, function (v) { setUI({ wheelX: v }); });
    tween(current.wheelOpacity, expanded ? 1 : 0, expanded ? 260 : 220, function (v) { setUI({ wheelOpacity: v }); });
    tween(current.anchorX, expanded ? 18 * sign : 0, expanded ? 260 : 300, function (v) { setUI({ anchorX: v }); });
    tween(current.anchorOpacity, expanded ? 0 : 1, expanded ? 180 : 260, function (v) { setUI({ anchorOpacity: v }); });
    tween(current.anchorScale, expanded ? 0.82 : 1, expanded ? 180 : 260, function (v) { setUI({ anchorScale: v }); });

    if (expanded) {
      window.setTimeout(function () {
        if (state.expanded) anchor.style.pointerEvents = 'none';
      }, 220);
    }
  }

  function normalizeTracks(nextTracks) {
    return (Array.isArray(nextTracks) ? nextTracks : []).map(function (track) {
      return {
        id: String(track.id || track.songId || track.url || ''),
        name: track.name || 'Untitled',
        artist: track.artist || 'Unknown Artist',
        cover: track.cover || '',
        url: track.url || ''
      };
    }).filter(function (track) {
      return track.url;
    });
  }

  function playlistCacheKey(id, options) {
    var proxy = String(cfg.proxyBase || defaults.proxyBase);
    try {
      proxy = new URL(proxy, location.href).origin;
    } catch (error) {
      // Keep a stable fallback key if an older browser rejects URL parsing.
    }
    return 'levia:float-player:playlist:v4:' + encodeURIComponent(proxy) + ':' + String(id) + ':' + String((options && options.level) || cfg.level || 'exhigh');
  }

  function readPlaylistCache(id, options) {
    try {
      var raw = window.localStorage.getItem(playlistCacheKey(id, options));
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || !Array.isArray(cached.tracks) || !cached.savedAt) return null;
      if (Date.now() - Number(cached.savedAt) > Number(cfg.cacheTtl || defaults.cacheTtl)) return null;
      var cachedTracks = normalizeTracks(cached.tracks);
      return cachedTracks.length
        ? { limit: Number(cached.limit || cachedTracks.length), tracks: cachedTracks }
        : null;
    } catch (error) {
      return null;
    }
  }

  function writePlaylistCache(id, options, nextTracks, requestedLimit) {
    try {
      var key = playlistCacheKey(id, options);
      var existing = JSON.parse(window.localStorage.getItem(key) || 'null');
      var cacheIsFresh = existing && existing.savedAt
        && Date.now() - Number(existing.savedAt) <= Number(cfg.cacheTtl || defaults.cacheTtl);
      if (cacheIsFresh && Number(existing.limit || 0) > Number(requestedLimit || 0)) return;
      window.localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        limit: Number(requestedLimit || nextTracks.length),
        tracks: normalizeTracks(nextTracks)
      }));
    } catch (error) {
      // Storage is an optimization only. A full or disabled store must not break playback.
    }
  }

  function render() {
    songWheel.innerHTML = tracks.map(function (track, index) {
      var cover = safeImageUrl(track.cover);
      var coverMarkup = cover
        ? '<img class="fp-song-cover" src="' + escapeText(cover) + '" alt="" draggable="false" loading="lazy" decoding="async">'
        : '<span class="fp-song-cover fp-song-cover-placeholder" aria-hidden="true"><i class="fp-geometric-loader fp-geometric-loader--thumb"></i></span>';
      return [
        '<button class="fp-song" type="button" role="option" data-index="', index, '" aria-label="', escapeText(track.name), ' ', escapeText(track.artist), '">',
        coverMarkup,
        '<span class="fp-song-meta">',
        '<span class="fp-song-title"><span class="fp-song-marquee"><span>', escapeText(track.name), '</span></span></span>',
        '<span class="fp-song-artist"><span class="fp-song-marquee"><span>', escapeText(track.artist), '</span></span></span>',
        '</span>',
        '</button>'
      ].join('');
    }).join('');
    updateTitleOverflow();
    syncTransport();
    syncAudio();
    layout();
  }

  function updateTitleOverflow() {
    songWheel.querySelectorAll('.fp-song-title, .fp-song-artist').forEach(function (textNode) {
      var text = textNode.querySelector('.fp-song-marquee > span');
      var overflowing = text && text.scrollWidth > textNode.clientWidth + 1;
      textNode.dataset.overflow = overflowing ? 'true' : 'false';
      var duplicate = textNode.querySelector('.fp-song-marquee > span[aria-hidden="true"]');
      if (overflowing && !duplicate) {
        duplicate = text.cloneNode(true);
        duplicate.setAttribute('aria-hidden', 'true');
        textNode.querySelector('.fp-song-marquee').appendChild(duplicate);
      } else if (!overflowing && duplicate) {
        duplicate.remove();
      }
    });
  }

  function syncTransport() {
    var track = tracks[state.current];
    if (!track) {
      player.classList.remove('has-tracks');
      transportCoverShell.hidden = true;
      transportCoverShell.classList.remove('is-loading');
      transportTitle.textContent = '';
      transportArtist.textContent = '';
      return;
    }
    player.classList.add('has-tracks');
    transportTitle.textContent = track.name;
    transportArtist.textContent = track.artist;
    var cover = safeImageUrl(track.cover);
    transportCoverShell.hidden = !cover;
    if (cover) {
      if (transportCover.src !== cover) {
        transportCoverShell.classList.remove('is-error');
        transportCoverShell.classList.add('is-loading');
        transportCover.src = cover;
      }
    } else {
      transportCoverShell.classList.remove('is-loading');
      transportCover.removeAttribute('src');
    }
  }

  function syncAudio() {
    var track = tracks[state.current];
    if (!track) return;
    var next = new URL(track.url, location.href).href;
    if (audio.currentSrc !== next && audio.src !== next) {
      audio.src = track.url;
      // Keep metadata/network work behind an explicit user play action.
      if (state.playing) audio.load();
    }
  }

  function buildPlaylistEndpoint(id, options) {
    var params = new URLSearchParams();
    params.set('id', id);
    params.set('limit', String((options && options.limit) || cfg.limit || 30));
    params.set('level', (options && options.level) || cfg.level || 'exhigh');
    return String(cfg.proxyBase || defaults.proxyBase).replace(/\/$/, '') + '/api/netease/playlist?' + params.toString();
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () {
      controller.abort();
    }, timeoutMs) : 0;
    var requestOptions = Object.assign({}, options || {});
    if (controller) requestOptions.signal = controller.signal;
    return fetch(url, requestOptions).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function fetchPlaylist(url, timeoutMs) {
    var bootstrap = window.__FLOAT_PLAYER_BOOTSTRAP;
    if (bootstrap && !bootstrap.used && bootstrap.url === url && bootstrap.promise) {
      bootstrap.used = true;
      return bootstrap.promise;
    }
    return fetchWithTimeout(url, { cache: 'no-store', mode: 'cors', credentials: 'omit' }, timeoutMs);
  }

  function setPlaylistStatus(message, retry) {
    songStatus.hidden = !message;
    songStatus.innerHTML = message
      ? (message === 'loading'
        ? '<span class="fp-loading-indicator" role="status" aria-label="正在加载歌单"><i class="fp-geometric-loader" aria-hidden="true"></i><span class="fp-visually-hidden">正在加载播放列表</span></span>'
        : (retry
          ? '<button class="fp-song-retry" type="button">歌单加载失败，点击重试</button>'
          : '<span>' + escapeText(message) + '</span>'))
      : '';
    player.classList.toggle('is-playlist-loading', message === 'loading');
    player.setAttribute('aria-busy', message === 'loading' ? 'true' : 'false');
  }

  function replaceTracks(nextTracks, options) {
    options = options || {};
    var previousTracks = tracks;
    var previous = previousTracks[state.current];
    var previousId = previous && previous.id;
    var selectedTrack = previousTracks[state.selected];
    var selectedId = selectedTrack && selectedTrack.id;
    var wasPlaying = state.playing;
    var previousTime = audio.currentTime || 0;
    var normalized = normalizeTracks(nextTracks);
    if (!normalized.length) return false;
    tracks = normalized;
    var nextIndex = options.preservePlayback && previousId
      ? tracks.findIndex(function (track) { return track.id === previousId; })
      : -1;
    var nextSelected = options.preservePlayback && selectedId
      ? tracks.findIndex(function (track) { return track.id === selectedId; })
      : -1;
    state.current = nextIndex >= 0 ? nextIndex : 0;
    state.selected = nextSelected >= 0 ? nextSelected : state.current;
    state.pos = state.selected;
    state.target = state.selected;
    state.failedTracks = {};
    if (!options.preservePlayback || nextIndex < 0) {
      state.playing = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    render();
    if (options.preservePlayback && nextIndex >= 0 && wasPlaying) {
      state.playing = true;
      syncAudio();
      if (previousTime > 0) audio.currentTime = previousTime;
      audio.play().catch(function () {
        state.playing = false;
        syncTransport();
        layout();
      });
    }
    return true;
  }

  function schedulePlaylistRefresh(id) {
    var initialLimit = Number(cfg.initialLimit || 0);
    var fullLimit = Number(cfg.limit || 0);
    if (!id || !initialLimit || !fullLimit || fullLimit <= initialLimit) return;
    var refresh = function () {
      if (state.playlistRequestId !== String(id) || state.playlistStatus === 'error') return;
      loadPlaylist(id, { limit: fullLimit, level: cfg.level, background: true, force: true }).catch(function () {});
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(refresh, { timeout: 1800 });
    } else {
      window.setTimeout(refresh, 1200);
    }
  }

  function loadPlaylist(id, options) {
    options = options || {};
    if (!id) return Promise.reject(new Error('Playlist id is required.'));
    id = String(id);
    var requestedLimit = Number(options.limit || cfg.limit || 30);
    if (state.playlistStatus === 'loading' && state.playlistPromise && state.playlistRequestId === id && state.playlistRequestLimit >= requestedLimit) return state.playlistPromise;
    if (!options.force && state.playlistStatus === 'loaded' && state.loadedPlaylistId === id && state.loadedPlaylistLimit >= requestedLimit) return Promise.resolve({ tracks: tracks });

    if (!tracks.length) {
      var cached = readPlaylistCache(id, options);
      if (cached) {
        replaceTracks(cached.tracks, { preservePlayback: false });
        state.loadedPlaylistId = id;
        state.loadedPlaylistLimit = cached.limit;
      }
    }

    var requestToken = ++state.playlistRequestSeq;
    state.playlistRequestToken = requestToken;
    state.playlistStatus = 'loading';
    state.playlistRequestId = id;
    state.playlistRequestLimit = requestedLimit;
    if (!tracks.length) setPlaylistStatus('loading');
    state.playlistPromise = fetchPlaylist(
      buildPlaylistEndpoint(id, options),
      Number(cfg.playlistTimeout || defaults.playlistTimeout)
    )
      .then(function (response) {
        if (!response.ok) throw new Error('Playlist proxy HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (state.playlistRequestToken !== requestToken) return payload;
        if (!payload || !payload.ok) throw new Error((payload && payload.error) || 'Playlist proxy returned an error.');
        var playableTracks = Array.isArray(payload.tracks)
          ? payload.tracks.filter(function (track) {
            return track && typeof track.url === 'string' && /^https?:\/\//i.test(track.url);
          })
          : [];
        if (!playableTracks.length) throw new Error('No playable tracks returned for playlist ' + id + '.');
        var hasMoreCompleteLoadedTracks = state.loadedPlaylistId === id
          && state.loadedPlaylistLimit > requestedLimit
          && tracks.length > playableTracks.length;
        if (!hasMoreCompleteLoadedTracks) {
          replaceTracks(playableTracks, { preservePlayback: true });
        }
        writePlaylistCache(id, options, playableTracks, requestedLimit);
        state.playlistStatus = 'loaded';
        state.playlistPromise = null;
        state.loadedPlaylistId = id;
        state.loadedPlaylistLimit = Math.max(state.loadedPlaylistLimit, requestedLimit);
        setPlaylistStatus('');
        return payload;
      }).catch(function (error) {
        if (state.playlistRequestToken !== requestToken) return { stale: true };
        state.playlistStatus = tracks.length ? 'loaded' : 'error';
        state.playlistPromise = null;
        if (!tracks.length) setPlaylistStatus('歌单加载失败，点击重试', true);
        else setPlaylistStatus('');
        throw error;
      });
    return state.playlistPromise;
  }

  function loadPlaylistWithRetry(id, options) {
    return loadPlaylist(id, options).catch(function (error) {
      if (state.playlistRequestId !== String(id) || tracks.length) throw error;
      return new Promise(function (resolve) {
        window.setTimeout(resolve, 900);
      }).then(function () {
        state.playlistStatus = 'idle';
        return loadPlaylist(id, options);
      });
    });
  }

  function startLoop() {
    if (state.raf) return;
    state.last = performance.now();
    state.raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    var dt = Math.min((now - state.last) / 1000, 0.05);
    var k = 1 - Math.exp(-dt / (cfg.smoothing / 1000));
    state.last = now;
    state.pos += (state.target - state.pos) * k;
    if (Math.abs(state.target - state.pos) < 0.001) {
      state.pos = state.target;
      state.raf = 0;
    } else {
      state.raf = requestAnimationFrame(frame);
    }
    layout();
  }

  function applyTarget(value, snap) {
    var max = tracks.length - 1;
    state.target = clamp(snap ? Math.round(value) : value, 0, max);
    state.selected = clamp(Math.round(state.target), 0, max);
    startLoop();
  }

  function layout() {
    var nodes = songWheel.querySelectorAll('.fp-song');
    var rowH = getRowH();
    var tiltRad = cfg.tilt * Math.PI / 180;
    var radius = tiltRad > 0.0005 ? rowH / tiltRad : 0;
    var mirror = cfg.side === 'right' ? -1 : 1;
    nodes.forEach(function (node, index) {
      var d = index - state.pos;
      var dist = Math.abs(d);
      var angle = clamp(d * tiltRad, -Math.PI / 2, Math.PI / 2);
      var y = radius ? radius * Math.sin(angle) : d * rowH;
      var x = radius ? -mirror * radius * (1 - Math.cos(angle)) * cfg.curve : 0;
      var rot = mirror * angle * 180 / Math.PI;
      var proximity = Math.max(0, 1 - Math.min(dist, 1));
      node.style.setProperty('--x', x.toFixed(2) + 'px');
      node.style.setProperty('--y', y.toFixed(2) + 'px');
      node.style.setProperty('--rot', rot.toFixed(3) + 'deg');
      node.style.setProperty('--op', Math.max(cfg.minOpacity, 1 - dist * cfg.fade).toFixed(3));
      node.style.setProperty('--blur', Math.max(0, dist * cfg.blur).toFixed(2) + 'px');
      node.style.setProperty('--scale', Math.max(0.9, 1 - Math.min(dist, 5) * 0.025).toFixed(3));
      node.style.setProperty('--pop', index === state.current && state.playing ? '1' : '0');
      node.style.setProperty('--p', proximity.toFixed(4));
      node.style.zIndex = String(1000 - Math.round(dist * 10));
      node.classList.toggle('is-active', index === state.selected);
      node.classList.toggle('is-playing', index === state.current && state.playing);
      node.setAttribute('aria-selected', index === state.selected ? 'true' : 'false');
      node.hidden = dist > 5;
    });
  }

  function expand() {
    if (state.expanded) return;
    state.expanded = true;
    lockPageScroll();
    player.classList.add('is-expanded');
    player.classList.remove('is-collapsed');
    player.setAttribute('aria-expanded', 'true');
    animateUI(true);
    window.setTimeout(function () {
      wheel.focus({ preventScroll: true });
    }, 80);
    if (cfg.playlistId && state.playlistStatus === 'idle') {
      loadPlaylistWithRetry(cfg.playlistId, { limit: cfg.limit, level: cfg.level }).catch(function () {});
    }
  }

  function collapse() {
    if (!state.expanded) return;
    state.expanded = false;
    restorePageScroll();
    anchor.style.pointerEvents = 'auto';
    player.classList.add('is-collapsed');
    player.classList.remove('is-expanded');
    player.setAttribute('aria-expanded', 'false');
    animateUI(false);
  }

  function playTrack(index) {
    state.current = clamp(index, 0, tracks.length - 1);
    state.selected = state.current;
    state.target = state.current;
    state.playing = true;
    syncTransport();
    syncAudio();
    startLoop();
    layout();
    audio.play().catch(function () {
      state.playing = false;
      setPlaylistStatus('播放失败，请重新选择歌曲');
      layout();
    });
  }

  function pauseTrack() {
    state.playing = false;
    syncTransport();
    audio.pause();
    layout();
  }

  function changeTrack(direction) {
    if (!tracks.length) return;
    var next = clamp(state.current + direction, 0, tracks.length - 1);
    if (next === state.current) return;
    playTrack(next);
  }

  anchor.addEventListener('pointerdown', function (event) {
    if (state.expanded || (event.pointerType === 'mouse' && event.button !== 0)) return;
    var rect = anchor.getBoundingClientRect();
    state.anchorDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    anchor.setPointerCapture(event.pointerId);
  });

  anchor.addEventListener('pointermove', function (event) {
    var drag = state.anchorDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    var deltaX = event.clientX - drag.startX;
    var deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 7) {
      drag.moved = true;
      player.classList.add('is-dragging');
      anchor.style.setProperty('--anchor-x', '0px');
      anchor.style.setProperty('--anchor-scale', '1');
    }
    if (!drag.moved) return;
    event.preventDefault();
    var left = clamp(event.clientX - drag.offsetX, 0, Math.max(0, window.innerWidth - drag.width));
    var top = clamp(event.clientY - drag.offsetY, 0, Math.max(0, window.innerHeight - drag.height));
    anchor.style.left = left + 'px';
    anchor.style.right = 'auto';
    anchor.style.top = top + 'px';
  });

  function finishAnchorDrag(event, canceled) {
    var drag = state.anchorDrag;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    state.anchorDrag = null;
    if (!drag.moved) return;

    if (event) event.preventDefault();
    state.suppressAnchorClick = !canceled;
    var rect = anchor.getBoundingClientRect();
    var currentLeft = clamp(rect.left, 0, Math.max(0, window.innerWidth - drag.width));
    var currentTop = clamp(rect.top, 0, Math.max(0, window.innerHeight - drag.height));
    cfg.side = currentLeft + drag.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    var edgeLeft = cfg.side === 'right' ? Math.max(0, window.innerWidth - drag.width) : 0;

    player.classList.remove('is-left', 'is-right');
    player.classList.add('is-' + cfg.side);
    anchor.style.right = 'auto';
    anchor.style.left = currentLeft + 'px';
    anchor.style.top = currentTop + drag.height / 2 + 'px';
    player.classList.remove('is-dragging');
    layout();
    requestAnimationFrame(function () {
      anchor.style.left = edgeLeft + 'px';
    });
    if (state.suppressAnchorClick) {
      window.setTimeout(function () { state.suppressAnchorClick = false; }, 0);
    }
  }

  anchor.addEventListener('pointerup', function (event) {
    finishAnchorDrag(event, false);
  });
  anchor.addEventListener('pointercancel', function (event) {
    finishAnchorDrag(event, true);
  });
  anchor.addEventListener('transitionend', function (event) {
    if (event.propertyName !== 'left' || state.anchorDrag || player.classList.contains('is-dragging')) return;
    anchor.style.removeProperty('left');
    anchor.style.removeProperty('right');
  });

  anchor.addEventListener('click', function (event) {
    if (state.suppressAnchorClick) {
      state.suppressAnchorClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    expand();
  });

  function isPlayerControl(target) {
    return wheel.contains(target) || anchor.contains(target) || transport.contains(target);
  }

  function blockPageInput(event) {
    if (event.type === 'click' && state.blockNextPageClick) {
      state.blockNextPageClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!state.expanded || isPlayerControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'pointerdown') {
      state.blockNextPageClick = true;
      collapse();
    }
  }

  document.addEventListener('pointerdown', blockPageInput, { capture: true, passive: false });
  document.addEventListener('click', blockPageInput, true);
  document.addEventListener('wheel', function (event) {
    if (!state.expanded) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!wheel.contains(event.target)) return;
    var delta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
    var rowH = getRowH();
    applyTarget(state.target + clamp(delta / rowH, -1, 1), false);
    window.clearTimeout(state.wheelTimer);
    state.wheelTimer = window.setTimeout(function () {
      applyTarget(state.target, true);
    }, 140);
  }, { capture: true, passive: false });

  player.addEventListener('dragstart', function (event) {
    event.preventDefault();
  }, true);
  player.addEventListener('selectstart', function (event) {
    event.preventDefault();
  }, true);
  ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'click', 'dblclick', 'contextmenu'].forEach(function (eventName) {
    player.addEventListener(eventName, function (event) {
      if (state.expanded) event.stopPropagation();
    });
  });

  wheel.addEventListener('click', function (event) {
    event.stopPropagation();
    if (event.target.closest('.fp-song-retry')) {
      state.playlistStatus = 'idle';
      loadPlaylistWithRetry(cfg.playlistId, { limit: cfg.limit, level: cfg.level }).catch(function () {});
      return;
    }
    var song = event.target.closest('.fp-song');
    if (!song || state.dragMoved) return;
    var index = Number(song.dataset.index || 0);
    if (index === state.current && state.playing) {
      pauseTrack();
      return;
    }
    playTrack(index);
  });

  wheel.addEventListener('pointerdown', function (event) {
    if (!state.expanded) return;
    state.drag = { y: event.clientY, start: state.target, id: event.pointerId };
    state.dragMoved = false;
  });

  wheel.addEventListener('pointermove', function (event) {
    if (!state.drag) return;
    var dy = event.clientY - state.drag.y;
    if (!state.dragMoved && Math.abs(dy) > 4) {
      state.dragMoved = true;
      wheel.setPointerCapture(state.drag.id);
    }
    if (state.dragMoved) {
      var rowH = getRowH();
      applyTarget(state.drag.start - dy / rowH, false);
    }
  });

  function endDrag() {
    if (!state.drag) return;
    state.drag = null;
    if (state.dragMoved) applyTarget(state.target, true);
    setTimeout(function () { state.dragMoved = false; }, 0);
  }

  wheel.addEventListener('pointerup', endDrag);
  wheel.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    var isEditable = target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
    if (event.isComposing || isEditable) return;

    if (event.key === 'Escape') {
      collapse();
    } else if (state.expanded && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowLeft') {
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      changeTrack(-1);
    } else if (state.expanded && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowRight') {
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      changeTrack(1);
    } else if (state.expanded && (event.key === 'ArrowUp' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      applyTarget(state.target - 1, true);
    } else if (state.expanded && (event.key === 'ArrowDown' || event.key === 'ArrowRight')) {
      event.preventDefault();
      applyTarget(state.target + 1, true);
    } else if (state.expanded && !event.ctrlKey && !event.altKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ' || event.code === 'Space')) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === ' ' || event.code === 'Space') {
        if (event.repeat) return;
        if (state.playing) pauseTrack();
        else if (tracks.length) playTrack(state.current);
        return;
      }
      if (state.selected === state.current && state.playing) {
        pauseTrack();
        return;
      }
      playTrack(state.selected);
    }
  }, true);

  audio.addEventListener('play', function () {
    state.playing = true;
    setPlaylistStatus('');
    syncTransport();
    layout();
  });
  audio.addEventListener('pause', function () {
    state.playing = false;
    syncTransport();
    layout();
  });
  audio.addEventListener('error', function () {
    var track = tracks[state.current];
    if (!track || !track.url) return;
    state.playing = false;
    state.failedTracks[track.url] = true;
    var next = -1;
    for (var index = state.current + 1; index < tracks.length; index += 1) {
      if (!state.failedTracks[tracks[index].url]) {
        next = index;
        break;
      }
    }
    if (next >= 0) {
      setPlaylistStatus('当前歌曲不可用，已切换下一首');
      window.setTimeout(function () {
        if (state.failedTracks[track.url]) playTrack(next);
      }, 360);
    } else {
      setPlaylistStatus('没有可播放的歌曲，请重试歌单');
    }
    syncTransport();
    layout();
  });
  audio.addEventListener('ended', function () {
    if (state.current < tracks.length - 1) playTrack(state.current + 1);
    else pauseTrack();
  });
  window.addEventListener('resize', layout);
  window.addEventListener('resize', updateTitleOverflow);

  window.FloatPlayer = {
    audio: audio,
    expand: expand,
    collapse: collapse,
    loadPlaylist: loadPlaylist,
    playUrl: function (name, artist, url) {
      tracks.push({ name: name || 'Untitled', artist: artist || 'Unknown Artist', url: url || '' });
      render();
      expand();
      playTrack(tracks.length - 1);
    }
  };

  setUI({ anchorX: 0, anchorOpacity: 1, anchorScale: 1, wheelX: -28 * sideSign(), wheelOpacity: 0 });
  render();
  if (cfg.autoLoad && cfg.playlistId) {
    loadPlaylistWithRetry(cfg.playlistId, { limit: cfg.initialLimit || cfg.limit, level: cfg.level }).then(function () {
      schedulePlaylistRefresh(cfg.playlistId);
    }).catch(function () {});
  }
  }

  // Inline Hugo config is the fast path. An explicitly supplied URL keeps the
  // legacy override semantics without making the normal blog page wait for it.
  if (window.__FLOAT_PLAYER_CONFIG_URL) {
    loadRuntimeConfig().then(function (runtimeConfig) {
      initPlayer(runtimeConfig);
    });
  } else {
    initPlayer({});
  }
})();
