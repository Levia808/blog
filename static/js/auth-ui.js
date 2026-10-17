(function () {
  'use strict';

  if (!window.Auth || !window.Profile) return;

  var overlay = document.getElementById('authOverlay');
  var modal = document.getElementById('authModal');
  var closeBtn = document.getElementById('authClose');
  var navLoginBtn = document.getElementById('navLoginBtn');
  var userMenuContainer = document.getElementById('userMenuContainer');
  var userDropdown = document.getElementById('userDropdown');
  var userMenuTrigger = document.getElementById('userMenuTrigger');
  var logoutBtn = document.getElementById('logoutBtn');
  var githubLoginBtns = document.querySelectorAll('#githubLogin, #githubSignIn');
  var adminLink = document.getElementById('adminLink');
  var cmsLink = document.getElementById('cmsLink');
  var mobileAdminLink = document.getElementById('mobileAdminLink');
  var mobileCmsLink = document.getElementById('mobileCmsLink');
  var mobileLoginBtn = document.getElementById('mobileLoginBtn');
  var mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
  var userMenuCloseTimer = null;
  var navAuthTimers = new WeakMap();
  var authMotionSequence = 0;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateAuth(target, keyframes) {
    var motion = window.MotionDock;
    if (prefersReducedMotion() || !motion || typeof motion.animate !== 'function' || typeof motion.spring !== 'function') {
      return Promise.resolve();
    }
    try {
      return motion.animate(target, keyframes, { type: motion.spring, stiffness: 430, damping: 34, mass: 0.82 }).finished.catch(function () {});
    } catch (_) {
      return Promise.resolve();
    }
  }

  var panels = {
    login: document.getElementById('authLogin'),
    register: document.getElementById('authRegister'),
    reset: document.getElementById('authReset')
  };

  function normalizePanel(name) {
    if (name === 'authRegister' || name === 'register') return 'register';
    if (name === 'authReset' || name === 'reset') return 'reset';
    return 'login';
  }

  // ====== Panel Switching ======
  function showPanel(name) {
    var active = normalizePanel(name);
    Object.keys(panels).forEach(function (k) {
      panels[k].hidden = k !== active;
      var title = panels[k].querySelector('.auth-title');
      if (title) {
        if (k === active) title.id = 'authTitle';
        else title.removeAttribute('id');
      }
    });
    animateAuth(panels[active], { opacity: [0, 1], y: [8, 0] });
  }

  document.querySelectorAll('.auth-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPanel(this.dataset.panel);
    });
  });

  // ====== Modal Open/Close ======
  function openAuth(panel) {
    showPanel(panel || 'login');
    authMotionSequence += 1;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    animateAuth(modal, { opacity: [0, 1], y: [14, 0], scale: [0.985, 1] });
  }

  function closeAuth() {
    var sequence = ++authMotionSequence;
    if (prefersReducedMotion()) {
      overlay.hidden = true;
      document.body.style.overflow = '';
      return;
    }
    animateAuth(modal, { opacity: [1, 0], y: [0, 10], scale: [1, 0.99] }).then(function () {
      if (sequence !== authMotionSequence) return;
      overlay.hidden = true;
      document.body.style.overflow = '';
    });
  }

  function smoothNavigate(href) {
    if (!href || window.location.href === href) return;
    if (document.startViewTransition) {
      document.startViewTransition(function () {
        window.location.href = href;
      });
      return;
    }
    document.documentElement.classList.add('page-transitioning');
    document.body.classList.add('page-leave');
    window.setTimeout(function () {
      window.location.href = href;
    }, 180);
  }

  function showNavAuthControl(el) {
    if (!el) return;
    var timer = navAuthTimers.get(el);
    if (timer) {
      window.clearTimeout(timer);
      navAuthTimers.delete(el);
    }
    el.hidden = false;
    window.requestAnimationFrame(function () {
      el.classList.remove('nav-auth-leaving');
      el.classList.add('nav-auth-visible');
    });
  }

  function hideNavAuthControl(el) {
    if (!el || el.hidden) return;
    var timer = navAuthTimers.get(el);
    if (timer) {
      window.clearTimeout(timer);
      navAuthTimers.delete(el);
    }
    el.classList.remove('nav-auth-visible');
    el.classList.add('nav-auth-leaving');
    navAuthTimers.set(el, window.setTimeout(function () {
      if (!el.classList.contains('nav-auth-visible')) {
        el.hidden = true;
        el.classList.remove('nav-auth-leaving');
      }
      navAuthTimers.delete(el);
    }, 280));
  }

  function openUserMenu() {
    if (!userMenuContainer || !userDropdown) return;
    clearTimeout(userMenuCloseTimer);
    userMenuContainer.hidden = false;
    userDropdown.hidden = false;
    window.requestAnimationFrame(function () {
      userDropdown.classList.add('is-open');
    });
    if (userMenuTrigger) userMenuTrigger.setAttribute('aria-expanded', 'true');
  }

  function closeUserMenu(delay) {
    if (!userMenuContainer || !userDropdown) return;
    clearTimeout(userMenuCloseTimer);
    var sync = function () {
      userDropdown.classList.remove('is-open');
      // 等待退出过渡(120ms)完成后再隐藏，期间可被打断重新打开
      window.setTimeout(function () {
        if (!userDropdown.classList.contains('is-open')) userDropdown.hidden = true;
      }, 140);
      if (userMenuTrigger) userMenuTrigger.setAttribute('aria-expanded', 'false');
    };
    if (delay) userMenuCloseTimer = window.setTimeout(sync, delay);
    else sync();
  }

  if (closeBtn) closeBtn.addEventListener('click', closeAuth);
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeAuth(); });
  if (navLoginBtn) {
    navLoginBtn.addEventListener('click', function (event) {
      event.preventDefault();
      smoothNavigate(navLoginBtn.href || navLoginBtn.getAttribute('href'));
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeAuth();
  });

  // ====== User Menu ======
  if (userMenuTrigger) {
    userMenuTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (userDropdown.hidden) openUserMenu();
      else closeUserMenu();
    });
  }
  if (userMenuContainer) {
    userMenuContainer.addEventListener('mouseenter', function () { openUserMenu(); });
    userMenuContainer.addEventListener('mouseleave', function () { closeUserMenu(120); });
    userMenuContainer.addEventListener('focusin', function () { openUserMenu(); });
    userMenuContainer.addEventListener('focusout', function (event) {
      if (!userMenuContainer.contains(event.relatedTarget)) closeUserMenu(120);
    });
  }
  document.addEventListener('click', function () {
    closeUserMenu();
  });
  if (userDropdown) {
    userDropdown.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  // ====== Forms ======
  function handleError(formId, err) {
    var el = document.getElementById(formId);
    if (el) { el.textContent = err.message || '操作失败，请重试'; el.hidden = false; }
  }

  function clearErrors() {
    ['loginError', 'registerError', 'resetError'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var el = document.getElementById('resetSuccess');
    if (el) el.hidden = true;
  }

  // Login
  document.querySelectorAll('#loginForm, #signInForm').forEach(function (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();
      var fd = new FormData(this);
      var standalone = loginForm.id === 'signInForm';
      var submit = loginForm.querySelector('[type=submit]');
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      Auth.signIn(fd.get('email'), fd.get('password'))
        .then(function () {
          if (standalone) {
            if (fd.get('rememberMe')) localStorage.setItem('blog_login_email', String(fd.get('email')));
            else localStorage.removeItem('blog_login_email');
            var redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
            // Accept only same-origin absolute paths; prevent open redirects.
            if (redirect.charAt(0) !== '/' || redirect.indexOf('//') === 0 || redirect.indexOf('\\') !== -1) redirect = '/';
            window.location.assign(redirect);
            return;
          }
          closeAuth();
          updateAuthUI();
        })
        .catch(function (err) {
          if (standalone) showStandaloneAuthMessage(err.message || '登录失败，请检查邮箱和密码后重试。', true);
          else handleError('loginError', err);
        })
        .finally(function () { if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } });
    });
  });

  // Register
  document.querySelectorAll('#registerForm, #signUpForm').forEach(function (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();
      var fd = new FormData(this);
      var standalone = registerForm.id === 'signUpForm';
      var submit = registerForm.querySelector('[type=submit]');
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      Auth.signUp(fd.get('email'), fd.get('password'), fd.get('displayName') || fd.get('username'))
        .then(function (result) {
          if (standalone) {
            var needsEmailConfirmation = result && result.user && !result.session;
            showStandaloneAuthMessage(needsEmailConfirmation ? '注册成功，请查收邮箱并完成验证后登录。' : '注册成功，正在进入博客…', false);
            if (!needsEmailConfirmation) window.setTimeout(function () { window.location.assign('/'); }, 700);
            else showPanel('login');
            return;
          }
          document.getElementById('registerSuccess') ||
            (function () {
              var p = document.createElement('p');
              p.className = 'auth-success';
              p.id = 'registerSuccess';
              p.textContent = '注册成功！请查收邮箱确认链接。';
              registerForm.parentNode.insertBefore(p, registerForm.nextSibling);
            })();
          showPanel('login');
        })
        .catch(function (err) {
          if (standalone) showStandaloneAuthMessage(err.message || '注册失败，请稍后重试。', true);
          else handleError('registerError', err);
        })
        .finally(function () { if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } });
    });
  });

  // Standalone /login/ page controls (separate from the header auth modal).
  var standaloneLogin = document.getElementById('signInForm');
  var standaloneRegister = document.getElementById('signUpForm');
  if (standaloneLogin && standaloneRegister) {
    document.querySelectorAll('#loginPage [data-action="reset"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        clearErrors();
        openAuth('reset');
      });
    });
    document.querySelectorAll('#loginPage [data-action="signup"], #loginPage [data-action="signin"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        var registering = link.dataset.action === 'signup';
        standaloneLogin.classList.toggle('is-hidden', registering);
        standaloneRegister.classList.toggle('is-hidden', !registering);
        document.querySelectorAll('#loginPage [data-mode]').forEach(function (item) {
          item.classList.toggle('is-hidden', item.dataset.mode === (registering ? 'signin' : 'signup'));
        });
        var title = document.querySelector('#loginPage .login-title');
        if (title) title.textContent = registering ? '创建账户' : '登录';
        clearStandaloneAuthMessage();
      });
    });
  }

  function showStandaloneAuthMessage(message, isError) {
    var node = document.getElementById('standaloneAuthMessage');
    if (!node) {
      node = document.createElement('p');
      node.id = 'standaloneAuthMessage';
      node.className = isError ? 'auth-error' : 'auth-success';
      node.setAttribute('role', isError ? 'alert' : 'status');
      var page = document.getElementById('loginPage');
      var inner = page && page.querySelector('.login-form-inner');
      var form = document.getElementById('signInForm');
      if (inner && form) inner.insertBefore(node, form.nextSibling);
    }
    node.className = isError ? 'auth-error' : 'auth-success';
    node.textContent = message;
    node.hidden = false;
  }

  function clearStandaloneAuthMessage() {
    var node = document.getElementById('standaloneAuthMessage');
    if (node) { node.hidden = true; node.textContent = ''; }
  }

  // Reset Password
  var resetForm = document.getElementById('resetForm');
  if (resetForm) {
    resetForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();
      var fd = new FormData(this);
      Auth.resetPassword(fd.get('email'))
        .then(function () {
          document.getElementById('resetSuccess').hidden = false;
        })
        .catch(function (err) { handleError('resetError', err); });
    });
  }

  // GitHub OAuth must be initiated through Supabase so its state/PKCE data
  // and session exchange remain intact. A direct GitHub fallback bypasses that flow.
  githubLoginBtns.forEach(function (githubLoginBtn) {
    githubLoginBtn.addEventListener('click', function () {
      githubLoginBtn.disabled = true;
      var originalLabel = githubLoginBtn.textContent;
      githubLoginBtn.textContent = '正在连接 GitHub…';
      clearStandaloneAuthMessage();
      clearErrors();

      Promise.resolve()
        .then(function () {
          if (!window.Auth || typeof Auth.signInWithGitHub !== 'function') {
            throw new Error('登录服务未能加载，请刷新页面后重试。');
          }
          return Auth.signInWithGitHub();
        })
        .catch(function (err) {
          githubLoginBtn.disabled = false;
          githubLoginBtn.textContent = originalLabel;
          var message = err && err.message ? err.message : '暂时无法连接 GitHub，请检查网络后重试。';
          if (document.getElementById('loginPage')) showStandaloneAuthMessage(message, true);
          else handleError('loginError', { message: message });
          console.error('GitHub OAuth 启动失败:', err);
        });
    });
  });

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      Auth.signOut().then(function () { updateAuthUI(); });
    });
  }
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', function () {
      Auth.signOut().then(function () { updateAuthUI(); });
    });
  }

  // ====== Auth UI Update ======
  function updateAuthUI() {
    Auth.user().then(function (user) {
      if (user) {
        hideNavAuthControl(navLoginBtn);
        showNavAuthControl(userMenuContainer);
        mobileLoginBtn && (mobileLoginBtn.hidden = true);
        mobileLogoutBtn && (mobileLogoutBtn.hidden = false);
        var claimPromise = window.Admin && typeof window.Admin.claimPrimarySuperadmin === 'function'
          ? window.Admin.claimPrimarySuperadmin().catch(function () { return false; })
          : Promise.resolve(false);
        claimPromise.then(function () { return Profile.get(user.id); }).then(function (profile) {
          var avatar = profile?.avatar_url || profile?.github_avatar_url || '';
          var meta = user.user_metadata || {};
          var ghName = meta.user_name || meta.preferred_username || '';
          var name = ghName || profile?.github_username || profile?.display_name || user.email;
          updateUserDisplay(avatar, name, user.email);
          if (profile && profile.role === 'superadmin' && profile.account_status === 'active') {
            adminLink && (adminLink.hidden = false);
            cmsLink && (cmsLink.hidden = false);
            mobileAdminLink && (mobileAdminLink.hidden = false);
            mobileCmsLink && (mobileCmsLink.hidden = false);
          } else if (adminLink) {
            adminLink.hidden = true;
            cmsLink && (cmsLink.hidden = true);
            mobileAdminLink && (mobileAdminLink.hidden = true);
            mobileCmsLink && (mobileCmsLink.hidden = true);
          }
        }).catch(function () {
          var meta = user.user_metadata || {};
          updateUserDisplay('', meta.user_name || user.email, user.email);
          adminLink && (adminLink.hidden = true);
          cmsLink && (cmsLink.hidden = true);
          mobileAdminLink && (mobileAdminLink.hidden = true);
          mobileCmsLink && (mobileCmsLink.hidden = true);
        });
      } else {
        showNavAuthControl(navLoginBtn);
        hideNavAuthControl(userMenuContainer);
        mobileLoginBtn && (mobileLoginBtn.hidden = false);
        mobileLogoutBtn && (mobileLogoutBtn.hidden = true);
        if (userDropdown) {
          userDropdown.classList.remove('is-open');
          userDropdown.hidden = true;
        }
        if (adminLink) adminLink.hidden = true;
        if (cmsLink) cmsLink.hidden = true;
        if (mobileAdminLink) mobileAdminLink.hidden = true;
        if (mobileCmsLink) mobileCmsLink.hidden = true;
      }
    });
  }

  function updateUserDisplay(avatar, name, email) {
    var els = {
      userAvatar: document.getElementById('userAvatar'),
      userMenuAvatar: document.getElementById('userMenuAvatar'),
      userMenuName: document.getElementById('userMenuName'),
      userMenuEmail: document.getElementById('userMenuEmail')
    };
    if (avatar) {
      els.userAvatar && (els.userAvatar.src = avatar);
      els.userMenuAvatar && (els.userMenuAvatar.src = avatar);
    }
    if (els.userMenuName) els.userMenuName.textContent = name || '';
    if (els.userMenuEmail) els.userMenuEmail.textContent = email || '';
  }

  // ====== Init ======
  Auth.onAuthChange(function () { updateAuthUI(); });
  updateAuthUI();

  // ====== Expose ======
  window.BlogAuth = {
    open: openAuth,
    close: closeAuth,
    getUser: function () { return Auth.user(); },
    getProfile: function (id) { return Profile.get(id); },
    updateUI: updateAuthUI
  };
})();
