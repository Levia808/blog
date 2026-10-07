(function () {
  'use strict';

  var loading = document.getElementById('profileLoading');
  var loggedOut = document.getElementById('profileLoggedOut');
  var content = document.getElementById('profileContent');

  function show(el) { loading.hidden = true; loggedOut.hidden = true; content.hidden = true; el.hidden = false; }

  var pendingAvatarPreviewUrl = null;

  function currentUserForAction() {
    if (window.PwaSync && window.PwaSync.enabled) {
      return Auth.session().then(function (session) { return session && session.user || null; });
    }
    return Auth.user();
  }

  function avatarPreview(file, taskId) {
    if (pendingAvatarPreviewUrl) return pendingAvatarPreviewUrl;
    try { pendingAvatarPreviewUrl = URL.createObjectURL(file); }
    catch (_) { return ''; }
    return pendingAvatarPreviewUrl;
  }

  async function loadProfile(user) {
    if (window.PwaSync && window.PwaSync.enabled) window.PwaSync.resume(user.id);
    var profile = {};
    try { profile = await Profile.get(user.id) || {}; } catch (_) {}

    var meta = user.user_metadata || {};
    var ghName = meta.user_name || meta.preferred_username || '';
    if (ghName && !profile.github_username) {
      var githubPatch = {
        github_username: ghName,
        github_avatar_url: meta.avatar_url || profile.github_avatar_url || null
      };
      if (window.PwaSync && window.PwaSync.enabled) {
        window.PwaSync.enqueue(user.id, 'profile.update', { values: githubPatch }, 'profile:oauth-backfill').catch(function () {});
        Object.assign(profile, githubPatch);
      } else {
        Profile.update(user.id, githubPatch).catch(function () {});
      }
    }

    if (window.PwaSync && window.PwaSync.enabled) {
      try {
        var pending = await window.PwaSync.pending(user.id);
        pending.forEach(function (task) {
          var payload = task.payload || {};
          if (task.type === 'profile.update') Object.assign(profile, payload.values || {});
          if (task.type === 'profile.avatar' && payload.file) {
            profile.avatar_url = avatarPreview(payload.file, task.id) || profile.avatar_url;
          }
          if (task.type === 'profile.github' && payload.username) profile.github_username = payload.username;
        });
      } catch (_) {}
    }

    window.__profileData = profile;
    var avatar = document.getElementById('profileAvatar');
    avatar.src = profile.avatar_url || profile.github_avatar_url || meta.avatar_url || '';
    if (pendingAvatarPreviewUrl && avatar.src !== pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
      pendingAvatarPreviewUrl = null;
    }
    document.getElementById('profileDisplayName').textContent = profile.display_name || ghName || profile.github_username || user.email;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('editUsername').value = profile.username || '';
    document.getElementById('editDisplayName').value = profile.display_name || '';
    document.getElementById('editBio').value = profile.bio || '';
    document.getElementById('editWebsite').value = profile.website || '';

    var roleText = profile.role || 'user';
    var roleLabel = { superadmin: 'SUPERADMIN', admin: 'ADMIN', author: 'AUTHOR', user: 'USER' }[roleText] || String(roleText).toUpperCase();
    document.getElementById('profileRole').textContent = roleLabel;
    document.getElementById('profileJoined').textContent = profile.created_at
      ? new Date(profile.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    document.getElementById('profileAccountStatus').textContent = profile.account_status || 'active';

    if (profile.github_username || ghName) {
      var ghUser = profile.github_username || ghName;
      document.getElementById('profileGithub').innerHTML =
        '<a href="https://github.com/' + encodeURIComponent(ghUser) + '" target="_blank" rel="noopener">GitHub: @' + ghUser.replace(/[&<>"']/g, '') + '</a>';
    }
    show(content);
  }

  // Save
  document.getElementById('saveProfileBtn').addEventListener('click', function () {
    currentUserForAction().then(async function (user) {
      if (!user) return;
      var values = {
        username: document.getElementById('editUsername').value || null,
        display_name: document.getElementById('editDisplayName').value,
        bio: document.getElementById('editBio').value,
        website: document.getElementById('editWebsite').value
      };
      try {
        if (window.PwaSync && window.PwaSync.enabled) {
          await window.PwaSync.enqueue(user.id, 'profile.update', { values: values }, 'profile:update');
          Object.assign(window.__profileData || (window.__profileData = {}), values);
          document.getElementById('profileDisplayName').textContent = values.display_name || values.username || user.email;
        } else {
          await Profile.update(user.id, values);
        }
        var success = document.getElementById('profileSuccess');
        success.hidden = false;
        setTimeout(function () { success.hidden = true; }, 2500);
      } catch (err) {
        var error = document.getElementById('profileError');
        error.textContent = err.message || '保存失败';
        error.hidden = false;
      }
    });
  });

  // Avatar upload
  document.getElementById('avatarUpload').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var input = this;
    currentUserForAction().then(async function (user) {
      if (!user) return;
      var img = document.getElementById('profileAvatar');
      var previous = img.src;
      var preview = URL.createObjectURL(file);
      if (window.PwaSync && window.PwaSync.enabled) {
        try {
          await window.PwaSync.enqueue(user.id, 'profile.avatar', {
            file: file, fileName: file.name, fileType: file.type, lastModified: file.lastModified || Date.now()
          }, 'profile:avatar');
          pendingAvatarPreviewUrl = preview;
          img.src = preview;
          img.onerror = function () { img.src = previous; };
        } catch (err) {
          URL.revokeObjectURL(preview);
          var error = document.getElementById('profileError');
          error.textContent = err.message || '无法在本机保存头像待办；请保持当前页面并重试。';
          error.hidden = false;
        }
        return;
      }
      try {
        var url = await Profile.uploadAvatar(user.id, file);
        img.src = url;
        img.style.opacity = '0.3';
        img.onload = function () { img.style.opacity = '1'; URL.revokeObjectURL(preview); };
        img.onerror = function () {
          URL.revokeObjectURL(preview);
          var letter = document.createElement('div');
          letter.className = 'profile-avatar profile-avatar-lg profile-avatar-fallback';
          letter.textContent = (url || '?').charAt(0);
          this.parentNode.replaceChild(letter, this);
        };
      } catch (err) {
        URL.revokeObjectURL(preview);
        var error = document.getElementById('profileError');
        error.textContent = err.message || '头像上传失败';
        error.hidden = false;
      }
    });
  });

  // Sync GitHub
  document.getElementById('syncGithubBtn').addEventListener('click', function () {
    currentUserForAction().then(function (user) {
      if (!user) return;
      var profilePromise = window.PwaSync && window.PwaSync.enabled
        ? Promise.resolve(window.__profileData || {})
        : Profile.get(user.id);
      profilePromise.then(function (p) {
        var gh = p.github_username || prompt('输入你的 GitHub 用户名：');
        if (!gh) return;
        if (window.PwaSync && window.PwaSync.enabled) {
          window.PwaSync.enqueue(user.id, 'profile.github', { username: gh }, 'profile:github')
            .then(function () {
              (window.__profileData || (window.__profileData = {})).github_username = gh;
              document.getElementById('profileGithub').innerHTML =
                '<a href="https://github.com/' + encodeURIComponent(gh) + '" target="_blank" rel="noopener">GitHub: @' + gh.replace(/[&<>"']/g, '') + '</a>';
            }).catch(function (err) {
              var el = document.getElementById('profileError');
              el.textContent = err.message || '无法在本机保存 GitHub 同步待办';
              el.hidden = false;
            });
          return;
        }
        Profile.linkGitHub(user.id, gh).then(function (updated) {
          document.getElementById('profileAvatar').src = updated.avatar_url;
          document.getElementById('profileGithub').innerHTML =
            '<a href="https://github.com/' + updated.github_username + '" target="_blank" rel="noopener">GitHub: @' + updated.github_username + '</a>';
        }).catch(function (err) {
          var el = document.getElementById('profileError');
          el.textContent = err.message;
          el.hidden = false;
        });
      });
    });
  });

  if (window.PwaSync && window.PwaSync.enabled) {
    ['synced', 'failure'].forEach(function (eventName) {
      window.PwaSync.on(eventName, function (detail) {
        if (!detail.task || detail.task.userId !== (window.__profileUserId || '')) return;
        Auth.user().then(function (user) { if (user && user.id === detail.task.userId) loadProfile(user); });
      });
    });
  }

  // Init
  function whenAuthReady(cb) {
    if (window.Auth) { cb(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.Auth || tries > 30) { clearInterval(timer); cb(); }
    }, 100);
  }
  whenAuthReady(function () {
    Auth.user().then(function (user) {
      if (user) {
        window.__profileUserId = user.id;
        loadProfile(user);
      } else {
        show(loggedOut);
      }
    });
  });
})();
