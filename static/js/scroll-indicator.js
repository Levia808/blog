(function () {
  'use strict';

  function isDesktopPointer() {
    return window.matchMedia &&
      window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches;
  }

  function initScrollIndicator() {
    var indicator = document.querySelector('[data-scroll-indicator]');
    var root = document.documentElement;
    var hideTimer = 0;
    var frame = 0;

    if (!indicator || !isDesktopPointer()) return;

    function update() {
      frame = 0;

      var viewportHeight = window.innerHeight || 1;
      var contentHeight = Math.max(root.scrollHeight || viewportHeight, viewportHeight);
      var maxScroll = Math.max(contentHeight - viewportHeight, 0);

      if (!maxScroll) {
        indicator.hidden = true;
        indicator.classList.remove('is-visible');
        return;
      }

      var thumbHeight = Math.max(32, Math.round(viewportHeight * viewportHeight / contentHeight));
      var maxThumbOffset = Math.max(viewportHeight - thumbHeight, 0);
      var thumbOffset = Math.round((window.scrollY / maxScroll) * maxThumbOffset);

      indicator.style.setProperty('--scrollbar-thumb-size', thumbHeight + 'px');
      indicator.style.setProperty('--scrollbar-thumb-offset', thumbOffset + 'px');
      indicator.hidden = false;
    }

    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    function showWhileScrolling() {
      scheduleUpdate();
      indicator.hidden = false;
      indicator.classList.add('is-visible');
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () {
        indicator.classList.remove('is-visible');
      }, 1000);
    }

    function handleResize() {
      if (!isDesktopPointer()) {
        indicator.hidden = true;
        indicator.classList.remove('is-visible');
        return;
      }
      scheduleUpdate();
    }

    update();
    window.addEventListener('scroll', showWhileScrolling, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollIndicator, { once: true });
  } else {
    initScrollIndicator();
  }
}());
