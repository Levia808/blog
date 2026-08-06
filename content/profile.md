---
title: 个人主页
layout: profile
url: /profile/
sitemap:
  priority: 0.5
---

<div class="profile-page" id="profilePage">
  <div id="profileLoading" class="page-state"><p>加载中…</p></div>
  <div id="profileLoggedOut" class="page-state" hidden>
    <h2>需要登录</h2><p>登录后可查看和编辑你的个人主页。</p>
    <button class="auth-btn auth-btn-primary" onclick="BlogAuth.open('login')">登录</button>
  </div>
  <div id="profileContent" hidden>
    <div class="profile-header"><img class="profile-avatar profile-avatar-lg" id="profileAvatar" src="" alt=""><div class="profile-info"><h2 id="profileDisplayName"></h2><p class="label" id="profileEmail"></p><p class="label" id="profileGithub"></p></div></div>
    <div class="profile-form-grid">
      <label class="profile-field" for="editUsername">用户名<input id="editUsername" placeholder="设置唯一用户名"></label>
      <label class="profile-field" for="editDisplayName">显示名称<input id="editDisplayName" placeholder="你的名称"></label>
      <label class="profile-field profile-field-wide" for="editBio">个人简介<textarea id="editBio" placeholder="介绍一下你自己"></textarea></label>
      <label class="profile-field profile-field-wide" for="editWebsite">网站<input id="editWebsite" placeholder="https://example.com" type="url"></label>
    </div>
    <div class="profile-actions"><button class="auth-btn auth-btn-primary" id="saveProfileBtn">保存</button><label class="auth-btn profile-upload">上传头像<input type="file" id="avatarUpload" accept="image/*" hidden></label><button class="auth-btn" id="syncGithubBtn">同步 GitHub 头像</button></div>
    <p class="auth-success" id="profileSuccess" hidden>已保存。</p><p class="auth-error" id="profileError" hidden></p>
  </div>
</div>
<script src="{{ "js/profile.js" | relURL }}"></script>
