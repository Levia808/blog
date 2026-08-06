(function () {
  'use strict';

  var loading = document.getElementById('profileLoading');
  var loggedOut = document.getElementById('profileLoggedOut');
  var content = document.getElementById('profileContent');

  function show(el) { loading.hidden = true; loggedOut.hidden = true; content.hidden = true; el.hidden = false; }

  function loadProfile(user) {
    Profile.get(user.id).then(function (p) {
      var profile = p || {};
      document.getElementById('profileAvatar').src = profile.avatar_url || profile.github_avatar_url || '';
      document.getElementById('profileDisplayName').textContent = profile.display_name || user.email;
      document.getElementById('profileEmail').textContent = user.email;
      document.getElementById('editUsername').value = profile.username || '';
      document.getElementById('editDisplayName').value = profile.display_name || '';
      document.getElementById('editBio').value = profile.bio || '';
      document.getElementById('editWebsite').value = profile.website || '';

      if (profile.github_username) {
        document.getElementById('profileGithub').innerHTML =
          '<a href="https://github.com/' + profile.github_username + '" target="_blank" rel="noopener">GitHub: @' + profile.github_username + '</a>';
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
