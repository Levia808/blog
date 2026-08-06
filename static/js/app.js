(function () {
  'use strict';

  function initPageTransitions() {
    document.documentElement.classList.add('app-ready');
    window.addEventListener('pageshow', function () {
      document.documentElement.classList.remove('is-leaving');
    });
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      var url;
      try { url = new URL(link.href, window.location.href); } catch (error) { return; }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      document.documentElement.classList.add('is-leaving');
    });
  }

  function initHeaderState() {
    var header = document.getElementById('siteHeader');
    if (!header) return;

    function syncHeaderState() {
      header.classList.toggle('header-scrolled', window.scrollY > 8);
    }

    syncHeaderState();
    window.addEventListener('scroll', syncHeaderState, { passive: true });
  }

  function initThemeToggle() {
    function syncColorScheme() {
      var theme = document.documentElement.getAttribute('data-theme');
      document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    }

    syncColorScheme();
    var observer = new MutationObserver(function () {
      syncColorScheme();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function initReveal() {
    var elements = document.querySelectorAll([
      '[data-reveal]',
      '.post-entry',
      '.archive-entry',
      '.page-state',
      '.profile-page',
      '.admin-page',
      '.native-comments',
      '.post-header',
      '.post-footer',
      '.post-content > *',
      '.terms-tags li'
    ].join(', '));
    if (!elements.length) return;

    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (element) {
        element.classList.add('reveal-visible');
      });
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

    elements.forEach(function (element, index) {
      element.classList.add('reveal');
      element.style.setProperty('--reveal-delay', Math.min(index * 40, 240) + 'ms');
      observer.observe(element);
    });
  }

  function initLazyImages() {
    document.querySelectorAll('img[loading="lazy"]').forEach(function (image) {
      image.style.transition = 'opacity 0.4s ease';
      if (image.complete) image.style.opacity = '1';
      else {
        image.style.opacity = '0';
        image.addEventListener('load', function () { image.style.opacity = '1'; }, { once: true });
      }
    });
  }

  function boot() {
    initPageTransitions();
    initHeaderState();
    initThemeToggle();
    initLazyImages();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      initReveal();
    } else {
      document.querySelectorAll('[data-reveal], .post-entry, .archive-entry, .page-state, .profile-page, .admin-page, .native-comments, .post-header, .post-footer, .post-content > *, .terms-tags li').forEach(function (element) {
        element.classList.add('reveal-visible');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
