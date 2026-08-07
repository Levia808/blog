(function () {
  'use strict';

  var loading = document.getElementById('profileLoading');
  var loggedOut = document.getElementById('profileLoggedOut');
  var content = document.getElementById('profileContent');

  function show(el) { loading.hidden = true; loggedOut.hidden = true; content.hidden = true; el.hidden = false; }

  function loadProfile(user) {
    Profile.get(user.id).then(function (p) {
      var profile = p || {};
      var meta = user.user_metadata || {};
      var ghName = meta.user_name || meta.preferred_username || '';

      // 旧数据回填：GitHub OAuth 用户首次进入个人中心时补齐 github_username
      if (ghName && !profile.github_username) {
        Profile.update(user.id, {
          github_username: ghName,
          github_avatar_url: meta.avatar_url || profile.github_avatar_url || null
        }).then(function (updated) {
          profile.github_username = updated.github_username;
          profile.github_avatar_url = updated.github_avatar_url;
        }).catch(function () {});
      }

      document.getElementById('profileAvatar').src = profile.avatar_url || profile.github_avatar_url || meta.avatar_url || '';
      document.getElementById('profileDisplayName').textContent = profile.display_name || ghName || profile.github_username || user.email;
      document.getElementById('profileEmail').textContent = user.email;
      document.getElementById('editUsername').value = profile.username || '';
      document.getElementById('editDisplayName').value = profile.display_name || '';
      document.getElementById('editBio').value = profile.bio || '';
      document.getElementById('editWebsite').value = profile.website || '';

      if (profile.github_username || ghName) {
        var ghUser = profile.github_username || ghName;
        document.getElementById('profileGithub').innerHTML =
          '<a href="https://github.com/' + ghUser + '" target="_blank" rel="noopener">GitHub: @' + ghUser + '</a>';
      }

      show(content);
    }).catch(function () {
      show(content);
    });
  }

  // Save
  document.getElementById('saveProfileBtn').addEventListener('click', function () {
    Auth.user().then(function (user) {
      if (!user) return;
      Profile.update(user.id, {
        username: document.getElementById('editUsername').value || null,
        display_name: document.getElementById('editDisplayName').value,
        bio: document.getElementById('editBio').value,
        website: document.getElementById('editWebsite').value
      }).then(function () {
        var el = document.getElementById('profileSuccess');
        el.hidden = false;
        setTimeout(function () { el.hidden = true; }, 2500);
      }).catch(function (err) {
        var el = document.getElementById('profileError');
        el.textContent = err.message;
        el.hidden = false;
      });
    });
  });

  // Avatar upload
  document.getElementById('avatarUpload').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    Auth.user().then(function (user) {
      Profile.uploadAvatar(user.id, file).then(function (url) {
        document.getElementById('profileAvatar').src = url;
      }).catch(function (err) {
        var el = document.getElementById('profileError');
        el.textContent = err.message;
        el.hidden = false;
      });
    });
  });

  // Sync GitHub
  document.getElementById('syncGithubBtn').addEventListener('click', function () {
    Auth.user().then(function (user) {
      Profile.get(user.id).then(function (p) {
        var gh = p.github_username || prompt('输入你的 GitHub 用户名：');
        if (!gh) return;
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

  // Init
  Auth.user().then(function (user) {
    if (user) {
      loadProfile(user);
    } else {
      show(loggedOut);
    }
  });
})();
