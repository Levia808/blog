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
  var githubLoginBtn = document.getElementById('githubLogin');
  var adminLink = document.getElementById('adminLink');
  var cmsLink = document.getElementById('cmsLink');
  var mobileAdminLink = document.getElementById('mobileAdminLink');
  var mobileCmsLink = document.getElementById('mobileCmsLink');
  var mobileLoginBtn = document.getElementById('mobileLoginBtn');
  var mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
  var userMenuCloseTimer = null;

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
    });
  }

  document.querySelectorAll('.auth-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPanel(this.dataset.panel);
    });
  });

  // ====== Modal Open/Close ======
  function openAuth(panel) {
    showPanel(panel || 'login');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeAuth() {
    overlay.hidden = true;
    document.body.style.overflow = '';
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
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();
      var fd = new FormData(this);
      Auth.signIn(fd.get('email'), fd.get('password'))
        .then(function () { closeAuth(); updateAuthUI(); })
        .catch(function (err) { handleError('loginError', err); });
    });
  }

  // Register
  var registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();
      var fd = new FormData(this);
      Auth.signUp(fd.get('email'), fd.get('password'), fd.get('displayName'))
        .then(function () {
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
        .catch(function (err) { handleError('registerError', err); });
    });
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

  // GitHub Login
  if (githubLoginBtn) {
    githubLoginBtn.addEventListener('click', function () {
      githubLoginBtn.disabled = true;
      githubLoginBtn.textContent = '跳转中...';
      var fallbackTimer = setTimeout(function() {
        // 如果 Supabase 没反应，直接打开发 GitHub OAuth
        var params = new URLSearchParams({
          client_id: 'Ov23lij9x9gnpRXSOY8w',
          redirect_uri: 'https://iyquixzprfwkglaqptxj.supabase.co/auth/v1/callback',
          scope: 'read:user user:email'
        });
        window.location.href = 'https://github.com/login/oauth/authorize?' + params.toString();
      }, 3000);
      Auth.signInWithGitHub().then(function() {
        clearTimeout(fallbackTimer);
      }).catch(function(err) {
        clearTimeout(fallbackTimer);
        githubLoginBtn.disabled = false;
        githubLoginBtn.textContent = 'GitHub 登录';
        alert('登录失败: ' + (err.message || err));
        console.error('GitHub 登录失败:', err);
        handleError('loginError', err);
      });
    });
  }

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
        navLoginBtn && (navLoginBtn.hidden = true);
        userMenuContainer && (userMenuContainer.hidden = false);
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
        navLoginBtn && (navLoginBtn.hidden = false);
        userMenuContainer && (userMenuContainer.hidden = true);
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
