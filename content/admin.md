---
title: 管理后台
layout: admin
url: /admin/
sitemap:
  priority: 0.1
---

<div class="admin-page" id="adminPage">
  <div id="adminLoading" class="page-state"><p>加载中…</p></div>
  <div id="adminUnauthorized" class="page-state" hidden><h2>无访问权限</h2><p>此页面仅管理员可访问。</p><a href="{{ "" | relLangURL }}" class="auth-btn auth-btn-primary">返回首页</a></div>
  <div id="adminContent" hidden>
    <div class="dashboard-heading">
      <div><p class="eyebrow">ADMIN / CONTROL</p><h2>管理后台</h2><p class="admin-subtitle" id="adminIdentity"></p></div>
      <a href="{{ "admin-cms/" | relURL }}" class="auth-btn auth-btn-primary">写文章</a>
    </div>

    <section class="dashboard-stats" aria-label="运营统计">
      <div class="admin-stat"><div class="admin-stat-num" id="adminUserCount">—</div><div class="admin-stat-label">注册用户</div></div>
      <div class="admin-stat"><div class="admin-stat-num" id="adminActiveUserCount">—</div><div class="admin-stat-label">活跃用户</div></div>
      <div class="admin-stat"><div class="admin-stat-num" id="adminCommentCount">—</div><div class="admin-stat-label">评论</div></div>
      <div class="admin-stat"><div class="admin-stat-num" id="adminPendingCommentCount">—</div><div class="admin-stat-label">待审核评论</div></div>
      <div class="admin-stat"><div class="admin-stat-num" id="adminReportCount">—</div><div class="admin-stat-label">未处理举报</div></div>
      <div class="admin-stat"><div class="admin-stat-num" id="adminMediaCount">—</div><div class="admin-stat-label">媒体资产</div></div>
    </section>

    <section class="dashboard-section">
      <div class="admin-section-heading"><h3>内容</h3><a href="{{ "admin-cms/" | relURL }}" class="admin-inline-link">打开文章编辑器 →</a></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>标题</th><th>路径</th><th>状态</th><th>更新时间</th></tr></thead><tbody id="adminContentTable"></tbody></table></div>
    </section>

    <section class="dashboard-section">
      <div class="admin-section-heading"><h3>用户</h3><button type="button" class="admin-refresh" data-admin-refresh="users">刷新</button></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>头像</th><th>名称</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody id="adminUserTable"></tbody></table></div>
    </section>

    <section class="dashboard-section">
      <div class="admin-section-heading"><h3>评论审核</h3><button type="button" class="admin-refresh" data-admin-refresh="comments">刷新</button></div>
      <div class="admin-filter-row"><label>状态<select id="adminCommentFilter"><option value="">全部</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已拒绝</option><option value="hidden">已隐藏</option></select></label></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>评论</th><th>文章</th><th>作者</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody id="adminCommentTable"></tbody></table></div>
    </section>

    <section class="dashboard-section">
      <div class="admin-section-heading"><h3>媒体库</h3><button type="button" class="admin-refresh" data-admin-refresh="media">刷新</button></div>
      <div class="media-upload-row"><input type="file" id="adminMediaInput" accept="image/*,video/*,audio/*"><button type="button" class="auth-btn auth-btn-primary" id="adminMediaUpload">上传媒体</button></div>
      <p class="auth-error" id="adminMediaError" hidden></p>
      <div class="admin-media-grid" id="adminMediaGrid"></div>
    </section>

    <div class="auth-error" id="adminError" hidden></div>
  </div>
</div>
<script src="{{ "js/admin.js" | relURL }}"></script>
