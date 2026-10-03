/* Levia blog shared Lottie icon enhancement (local assets/player, graceful SVG fallback). */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-lottie-src]'));
  if (!nodes.length) return;

  var initScript = document.currentScript;
  var playerURL = initScript ? new URL('../vendor/lottie-light.min.js', initScript.src).href : '/vendor/lottie-light.min.js';
  var playerPromise = null;
  var payloads = new Map();
  var instances = new WeakMap();
  var loading = new WeakMap();

  function ensurePlayer() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (playerPromise) return playerPromise;
    playerPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = playerURL;
      script.async = true;
      script.onload = function () {
        if (window.lottie) resolve(window.lottie);
        else reject(new Error('Lottie player did not initialize'));
      };
      script.onerror = function () { playerPromise = null; reject(new Error('Lottie player failed to load')); };
      document.head.appendChild(script);
    });
    return playerPromise;
  }

  function dataFor(node) {
    var path = node.getAttribute('data-lottie-src');
    if (!path) return Promise.reject(new Error('Missing Lottie source'));
    if (!payloads.has(path)) {
      payloads.set(path, fetch(path, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Lottie asset request failed');
        return response.json();
      }).catch(function (error) {
        payloads.delete(path);
        throw error;
      }));
    }
    return payloads.get(path);
  }

  function mount(node) {
    if (instances.has(node)) return Promise.resolve(instances.get(node));
    if (loading.has(node)) return loading.get(node);
    var task = Promise.all([ensurePlayer(), dataFor(node)]).then(function (loaded) {
      var lottie = loaded[0];
      var animationData = loaded[1];
      if (!node.isConnected || !lottie) return null;
      var fallback = node.querySelector('.lottie-fallback');
      var animation = lottie.loadAnimation({
        container: node,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: animationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
      });
      instances.set(node, animation);
      animation.addEventListener('DOMLoaded', function () {
        node.classList.add('is-ready');
        if (fallback) fallback.setAttribute('hidden', 'hidden');
      });
      animation.addEventListener('data_failed', function () {
        node.classList.remove('is-ready');
        if (fallback) fallback.removeAttribute('hidden');
      });
      return animation;
    }).catch(function () { return null; }).finally(function () { loading.delete(node); });
    loading.set(node, task);
    return task;
  }

  function play(node, direction) {
    if (reducedMotion || !node) return;
    mount(node).then(function (animation) {
      if (!animation) return;
      animation.setDirection(direction < 0 ? -1 : 1);
      var lastFrame = Math.max(1, Math.min(animation.totalFrames - 1, 32));
      animation.playSegments([0, lastFrame], true);
    });
  }

  function setState(node, state, animate) {
    if (!node || reducedMotion) return;
    var direction = state === 'dark' ? 1 : -1;
    if (animate) {
      play(node, direction);
      return;
    }
    /* Keep initial theme sync cheap; only seek an icon that has already been mounted. */
    var animation = instances.get(node);
    if (animation) animation.goToAndStop(direction > 0 ? animation.totalFrames - 1 : 0, true);
  }

  if (!reducedMotion) {
    nodes.forEach(function (node) {
      if (node.getAttribute('data-lottie-trigger') === 'manual') return;
      var target = node.closest('button, a') || node;
      var lastPlayed = 0;
      function onInteract(event) {
        if (event.type === 'pointerdown' && event.isPrimary === false) return;
        if (event.type === 'pointerdown' && event.pointerType === 'mouse' && event.button !== 0) return;
        var now = performance.now();
        if (now - lastPlayed < 180) return;
        lastPlayed = now;
        play(node);
      }
      target.addEventListener('pointerenter', onInteract, { passive: true });
      target.addEventListener('pointerdown', onInteract, { passive: true });
      target.addEventListener('focusin', onInteract);
      if (node.closest('.dock-item.is-active') && node.closest('.dock-item.is-active').getClientRects().length) play(node);
    });
  } else {
    nodes.forEach(function (node) {
      var fallback = node.querySelector('.lottie-fallback');
      if (fallback) fallback.removeAttribute('hidden');
    });
  }

  window.LeviaLottie = { play: play, setState: setState };
}());
