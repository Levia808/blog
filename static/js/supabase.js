const SUPABASE_URL = 'https://iyquixzprfwkglaqptxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qaeQu7qThhK4ASwtivmyyQ_8AQG-QcT';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  window.Auth = {
    async user() { return null; },
    async session() { return null; },
    async signUp() { throw new Error('登录服务暂不可用'); },
    async signIn() { throw new Error('登录服务暂不可用'); },
    async signInWithGitHub() { throw new Error('登录服务暂不可用'); },
    async signOut() {},
    async resetPassword() { throw new Error('登录服务暂不可用'); },
    onAuthChange() { return { data: { subscription: { unsubscribe: function () {} } } }; }
  };
  window.Profile = null;
  window.Admin = null;
  window.MediaService = null;
  window.CommentService = null;
} else {

var blogSupabase = window.blogSupabase || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

var Auth = window.Auth = {
  async user() {
    const { data: { user } } = await blogSupabase.auth.getUser();
    return user;
  },

  async session() {
    const { data: { session } } = await blogSupabase.auth.getSession();
    return session;
  },

  async signUp(email, password, displayName) {
    const { data, error } = await blogSupabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await blogSupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithGitHub() {
    var profileUrl = window.location.origin + '/profile/';
    // GitHub Pages 需要 /blog/ 前缀
    if (window.location.hostname === 'levia808.github.io') {
      profileUrl = window.location.origin + '/blog/profile/';
    }
    const { data, error } = await blogSupabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'read:user user:email',
        redirectTo: profileUrl
      }
    });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await blogSupabase.auth.signOut();
    if (error) throw error;
  },

  async resetPassword(email) {
    var profileUrl = window.location.origin + '/profile/';
    if (window.location.hostname === 'levia808.github.io') {
      profileUrl = window.location.origin + '/blog/profile/';
    }
    const { error } = await blogSupabase.auth.sendPasswordResetEmail(email, {
      redirectTo: profileUrl
    });
    if (error) throw error;
  },

  onAuthChange(callback) {
    return blogSupabase.auth.onAuthStateChange(callback);
  }
};

}
var Profile = window.Profile = {
  publicFields: 'id, username, display_name, bio, avatar_url, github_username, github_avatar_url, website, created_at, updated_at',

  async get(userId) {
    var currentUser = await Auth.user().catch(function () { return null; });
    if (currentUser && currentUser.id === userId) {
      var own = await blogSupabase.rpc('get_my_profile');
      if (!own.error && own.data && own.data[0]) return own.data[0];
    }
    const { data, error } = await blogSupabase
      .from('profiles')
      .select(this.publicFields)
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async getByUsername(username) {
    const { data, error } = await blogSupabase
      .from('profiles')
      .select(this.publicFields)
      .eq('username', username)
      .single();
    if (error) return null;
    return data;
  },

  async update(userId, updates) {
    var allowed = [
      'username',
      'display_name',
      'bio',
      'avatar_url',
      'github_username',
      'github_avatar_url',
      'website'
    ];
    var payload = {};
    allowed.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) payload[field] = updates[field];
    });
    const { data, error } = await blogSupabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select(this.publicFields)
      .single();
    if (error) throw error;
    return data;
  },

  async uploadAvatar(userId, file) {
    if (!file || !/^image\//i.test(file.type)) {
      throw new Error('请选择图片文件（jpg/png/webp 等）');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('头像图片不能超过 5 MB');
    }
    const fileExt = file.name.split('.').pop() || 'png';
    const filePath = `${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await blogSupabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      if (/permission|policy|RLS|row.?level|not allowed/i.test(uploadError.message || '')) {
        throw new Error('头像上传被拒绝：avatars 存储桶缺少上传权限（RLS），请联系管理员配置');
      }
      throw uploadError;
    }

    const { data: { publicUrl } } = blogSupabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    /* 同名文件覆盖上传, URL 不变 → 浏览器缓存旧图 → 加时间戳强制刷新 */
    const bustUrl = publicUrl + (publicUrl.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
    await this.update(userId, { avatar_url: bustUrl });
    return bustUrl;
  },

  async fetchGitHubAvatar(username) {
    try {
      const res = await fetch(`https://api.github.com/users/${username}`);
      if (!res.ok) return null;
      const gh = await res.json();
      return {
        avatar_url: gh.avatar_url,
        github_username: username
      };
    } catch {
      return null;
    }
  },

  async linkGitHub(userId, githubUsername) {
    const gh = await this.fetchGitHubAvatar(githubUsername);
    if (gh) {
      return this.update(userId, {
        github_username: gh.github_username,
        github_avatar_url: gh.avatar_url,
        avatar_url: gh.avatar_url
      });
    }
    return null;
  }
};

var Admin = window.Admin = {
  async profile() {
    const user = await Auth.user();
    if (!user) return null;
    const { data, error } = await blogSupabase.rpc('get_my_profile');
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  },

  async isAdmin() {
    const profile = await this.profile();
    return Boolean(profile && profile.role === 'superadmin' && profile.account_status === 'active');
  },

  async claimPrimarySuperadmin() {
    const { data, error } = await blogSupabase.rpc('try_claim_primary_superadmin');
    if (error) throw error;
    return Boolean(data);
  },

  async getAllUsers() {
    const { data, error } = await blogSupabase.rpc('admin_list_users');
    if (error) throw error;
    return data || [];
  },

  async getContent(status) {
    const { data, error } = await blogSupabase.rpc('admin_list_content', { p_status: status || null });
    if (error) throw error;
    return data || [];
  },

  async getAllPosts() {
    return this.getContent();
  },

  async getStats() {
    const { data, error } = await blogSupabase.rpc('admin_dashboard_stats');
    if (error) throw error;
    var stats = data || {};
    return {
      totalUsers: Number(stats.total_users || 0),
      activeUsers: Number(stats.active_users || 0),
      totalComments: Number(stats.total_comments || 0),
      pendingComments: Number(stats.pending_comments || 0),
      openReports: Number(stats.open_reports || 0),
      publishedContent: Number(stats.published_content || 0),
      pendingContent: Number(stats.pending_content || 0)
    };
  },

  async getComments(status) {
    const { data, error } = await blogSupabase.rpc('admin_list_comments', { p_status: status || null });
    if (error) throw error;
    return data || [];
  },

  async getReports(status) {
    const { data, error } = await blogSupabase.rpc('admin_list_reports', { p_status: status || null });
    if (error) throw error;
    return data || [];
  },

  async moderateComment(commentId, status, reason) {
    const { data, error } = await blogSupabase.rpc('moderate_comment', {
      p_comment_id: commentId,
      p_status: status,
      p_reason: reason || null
    });
    if (error) throw error;
    return data;
  },

  async updateAccountStatus(userId, status) {
    const { data, error } = await blogSupabase.rpc('admin_update_account_status', {
      p_user_id: userId,
      p_status: status
    });
    if (error) throw error;
    return data;
  },

  async updateRole(userId, role) {
    const { data, error } = await blogSupabase.rpc('superadmin_update_role', {
      p_user_id: userId,
      p_role: role
    });
    if (error) throw error;
    return data;
  },

  async getAuditLogs(limit) {
    const { data, error } = await blogSupabase.rpc('admin_list_audit_logs', { p_limit: limit || 100 });
    if (error) throw error;
    return data || [];
  },

  async getMedia() {
    const { data, error } = await blogSupabase.rpc('admin_list_media');
    if (error) throw error;
    return data || [];
  },

  async registerMedia(filePath, file, publicUrl, metadata) {
    const { data, error } = await blogSupabase.rpc('register_media_asset', {
      p_storage_path: filePath,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_public_url: publicUrl,
      p_metadata: metadata || {}
    });
    if (error) throw error;
    return data;
  },

  async deleteMedia(mediaId) {
    // 1. 查记录取 storage 路径
    const { data: rec, error: e1 } = await blogSupabase
      .from('media')
      .select('id, storage_path')
      .eq('id', mediaId)
      .maybeSingle();
    if (e1) throw e1;
    // 2. 用 Storage API 删除文件 (禁止直接删 storage 表)
    if (rec && rec.storage_path) {
      const { error: e2 } = await blogSupabase.storage.from('media').remove([rec.storage_path]);
      if (e2) throw e2;
    }
    // 3. 删除媒体记录 (storage 文件已删, RPC 无副作用)
    const { data, error } = await blogSupabase.rpc('admin_delete_media', { p_media_id: mediaId });
    if (error) throw error;
    return Boolean(data);
  },

  /* 图片上传前压缩: canvas → webp ≤1600px, 大图体积降 80%+ (预览加载提速)
     GIF/SVG/其他格式保留原文件 */
  compressImage(file) {
    if (!file || !file.type.startsWith('image/')) return Promise.resolve(file);
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return Promise.resolve(file);
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var maxW = 1600;
        var scale = Math.min(1, maxW / img.naturalWidth);
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { resolve(file); return; }
          var name = file.name.replace(/\.[^.]+$/, '.webp');
          resolve(new File([blob], name, { type: 'image/webp' }));
        }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  },

  async uploadMedia(file, onProgress) {
    var user = await Auth.user();
    if (!user) throw new Error('请先登录');
    if (!file || !(/^((image|video|audio|font)\/)/i.test(file.type) || /\.(ttf|otf|woff2?|eot)$/i.test(file.name))) {
      throw new Error('仅支持图片、视频、音频或字体文件（ttf/otf/woff/woff2）');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('媒体文件不能超过 100 MB');
    }
    /* 图片压缩 (仅在可压缩时, 保持原类型判断基于压缩后文件) */
    var uploadFile = file;
    var isImage = file.type.startsWith('image/');
    if (isImage) {
      uploadFile = await this.compressImage(file);
    }
    var safeName = uploadFile.name.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '');
    var filePath = user.id + '/' + Date.now() + '-' + safeName;
    var upload = await blogSupabase.storage.from('media').upload(filePath, uploadFile, {
      upsert: false,
      contentType: uploadFile.type,
      cacheControl: '3600',
      onUploadProgress: onProgress || undefined
    });
    if (upload.error) throw upload.error;
    var publicUrl = blogSupabase.storage.from('media').getPublicUrl(filePath).data.publicUrl;
    try {
      return await this.registerMedia(filePath, uploadFile, publicUrl);
    } catch (error) {
      await blogSupabase.storage.from('media').remove([filePath]).catch(function () {});
      throw error;
    }
  }
};

window.MediaService = Admin;

var Comments = window.CommentService = {
  async list(postPath) {
    var result = await blogSupabase
      .from('comments')
      .select('id, content, created_at, updated_at, user_id, moderation_status, profiles!comments_user_id_fkey(display_name, username, avatar_url)')
      .eq('post_path', postPath)
      .order('created_at', { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  },

  async create(postPath, content) {
    var user = await Auth.user();
    if (!user) throw new Error('请先登录后再发表评论');
    var result = await blogSupabase
      .from('comments')
      .insert({ post_path: postPath, content: content, user_id: user.id })
      .select('id, content, created_at, updated_at, user_id, moderation_status, profiles!comments_user_id_fkey(display_name, username, avatar_url)')
      .single();
    if (result.error) throw result.error;
    return result.data;
  },

  async update(commentId, content) {
    var result = await blogSupabase
      .from('comments')
      .update({ content: content })
      .eq('id', commentId)
      .select('id, content, created_at, updated_at, user_id, moderation_status, profiles!comments_user_id_fkey(display_name, username, avatar_url)')
      .single();
    if (result.error) throw result.error;
    return result.data;
  },

  async remove(commentId) {
    var result = await blogSupabase
      .from('comments')
      .delete()
      .eq('id', commentId);
    if (result.error) throw result.error;
    return true;
  },

  async report(commentId, reason) {
    var result = await blogSupabase.rpc('report_comment', {
      p_comment_id: commentId,
      p_reason: reason
    });
    if (result.error) throw result.error;
    return Boolean(result.data);
  }
};
