(function () {
  'use strict';

  function registerGsap() {
    if (!window.gsap) return false;
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (window.MotionPathPlugin) gsap.registerPlugin(MotionPathPlugin);
    return true;
  }

  function initAuthButtons() {
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-auth-open]');
      if (!trigger) return;
      event.preventDefault();
      if (window.BlogAuth && typeof window.BlogAuth.open === 'function') {
        window.BlogAuth.open(trigger.getAttribute('data-auth-open') || 'login');
      }
    });
  }

  function initGlowCards() {
    document.querySelectorAll('[data-glow-card]').forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width) * 100;
        var y = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--glow-x', x.toFixed(2) + '%');
        card.style.setProperty('--glow-y', y.toFixed(2) + '%');
        card.style.setProperty('--glow-opacity', '1');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--glow-opacity', '0.72');
        card.style.setProperty('--glow-x', '52%');
        card.style.setProperty('--glow-y', '38%');
      });
      card.style.setProperty('--glow-x', '52%');
      card.style.setProperty('--glow-y', '38%');
      card.style.setProperty('--glow-opacity', '0.72');
    });
  }

  function initParallax() {
    var stage = document.querySelector('[data-scroll-stage]');
    var dashboard = document.querySelector('[data-parallax-dashboard]');
    var ridge = document.querySelector('.visual-ridge');
    if (!stage || !dashboard || !ridge || !registerGsap() || !window.ScrollTrigger) return;

    var motionTargets = [
      { target: ridge, scale: 1.14, y: 70, opacity: 0.84 },
      { target: dashboard, scale: 0.92, y: -42, opacity: 0.9 },
      { target: stage.querySelector('.dashboard-panel--glow'), scale: 0.96, y: -18, opacity: 0.88 },
      { target: stage.querySelector('.dashboard-panel--network'), scale: 1.05, y: -8, opacity: 0.94 }
    ];

    motionTargets.forEach(function (item) {
      if (!item.target) return;
      gsap.fromTo(item.target, {
        scale: 1,
        y: 0,
        opacity: 1
      }, {
        scale: item.scale,
        y: item.y,
        opacity: item.opacity,
        ease: 'none',
        scrollTrigger: {
          trigger: stage,
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        }
      });
    });

    gsap.fromTo(stage, { rotateX: 14, rotateY: -12 }, {
      rotateX: 0,
      rotateY: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: 'top top',
        end: 'bottom top',
        scrub: 1
      }
    });
  }

  function initNetworkMotion() {
    if (!registerGsap() || !window.MotionPathPlugin || !document.querySelector('#orbitPath')) return;

    var path = document.querySelector('#orbitPath');
    gsap.utils.toArray('.orbit-node').forEach(function (node, index) {
      gsap.to(node, {
        duration: 10 + index * 1.5,
        repeat: -1,
        ease: 'none',
        motionPath: {
          path: path,
          align: path,
          alignOrigin: [0.5, 0.5],
          autoRotate: false
        },
        delay: index * 0.4
      });
    });

    gsap.to('.network-flow', {
      strokeDashoffset: -420,
      duration: 18,
      repeat: -1,
      ease: 'none'
    });
  }

  function boot() {
    initAuthButtons();
    initGlowCards();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    initParallax();
    initNetworkMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
