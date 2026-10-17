(function () {
  function endpoint() {
    var value = String(window.BLOG_MEDIA_ORIGIN || '').replace(/\/$/, '');
    if (!value) return '';
    var parsed;
    try { parsed = new URL(value); } catch (_) {}
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('媒体服务必须配置为 HTTPS 域名');
    return parsed.origin;
  }
  function encoded(path) { return String(path).split('/').map(encodeURIComponent).join('/'); }
  window.BlogStorage = {
    from: function (bucket) {
      if (!endpoint()) return window.blogSupabase.storage.from(bucket);
      var base = endpoint() + '/object/';
      async function request(path, method, body, headers, onProgress) {
        try {
          var session = await window.Auth.session();
          if (!session) throw new Error('请先登录');
          headers = Object.assign({ Authorization: 'Bearer ' + session.access_token }, headers);
          // XHR supplies actual upload progress, unlike the Supabase Storage fetch API.
          return await new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, base + path);
            Object.keys(headers).forEach(function (key) { xhr.setRequestHeader(key, headers[key]); });
            if (onProgress) xhr.upload.onprogress = onProgress;
            xhr.onerror = function () { reject(new Error('媒体服务暂时无法连接')); };
            xhr.onload = function () {
              var value;
              try { value = JSON.parse(xhr.responseText || '{}'); } catch (_) { value = {}; }
              if (xhr.status < 200 || xhr.status >= 300) {
                var error = new Error(value.error || '媒体操作失败 (' + xhr.status + ')');
                error.status = xhr.status;
                reject(error);
              } else resolve({ data: value, error: null });
            };
            xhr.send(body);
          });
        } catch (error) { return { data: null, error: error }; }
      }
      return {
        getPublicUrl: function (path) { return { data: { publicUrl: base + 'public/' + bucket + '/' + encoded(path) } }; },
        upload: function (path, file, options) {
          options = options || {};
          return request(bucket + '/' + encoded(path), 'PUT', file, {
            'Content-Type': options.contentType || file.type || 'application/octet-stream',
            'X-Upsert': options.upsert ? 'true' : 'false'
          }, options.onUploadProgress);
        },
        remove: function (paths) { return request(bucket, 'DELETE', JSON.stringify({ prefixes: paths }), { 'Content-Type': 'application/json' }); },
        list: function (prefix, options) { return request('list/' + bucket, 'POST', JSON.stringify(Object.assign({}, options, { prefix: prefix })), { 'Content-Type': 'application/json' }); }
      };
    }
  };
})();
