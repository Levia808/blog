(function () {
  var FONT_OPTIONS = [
    { value: 'display', label: 'Playfair Display', detail: '杂志衬线，默认', font: "'Playfair Display', Georgia, serif" },
    { value: 'grotesk', label: 'Space Grotesk', detail: '几何无衬线', font: "'Space Grotesk', system-ui, sans-serif" },
    { value: 'mono', label: 'JetBrains Mono', detail: '等宽标题', font: "'JetBrains Mono', ui-monospace, monospace", weight: 700 },
    { value: 'serif', label: 'Georgia', detail: '系统衬线', font: "Georgia, 'Times New Roman', serif" },
    { value: 'sans', label: '系统无衬线', detail: '苹方/雅黑', font: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
    { value: 'song', label: '宋体', detail: 'Songti/SimSun', font: "'Songti SC', 'Noto Serif SC', 'SimSun', serif" },
    { value: 'kai', label: '楷体', detail: 'Kaiti/KaiTi', font: "'Kaiti SC', 'KaiTi', 'STKaiti', serif" },
    { value: 'black', label: '特粗黑体', detail: '900 字重', font: "'Space Grotesk', system-ui, sans-serif", weight: 900 },
    { value: 'custom', label: '自定义字体', detail: '读取下方字体文件', font: "Georgia, serif" }
  ];

  var FONT_EXT = /\.(ttf|otf|woff2?|eot)$/i;
  var assetRoot = new URL('../', window.location.href);
  var state = {
    registered: false,
    observing: false,
    fonts: null,
    fontsPromise: null,
    fontFaces: new Map(),
    localPreviews: Object.create(null),
    remoteVersions: Object.create(null),
    raf: 0
  };

  function isFontPath(value) {
    return FONT_EXT.test(String(value || '').split('?')[0]);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function fontFormat(path) {
    path = String(path || '').split('?')[0];
    if (/\.woff2$/i.test(path)) return 'woff2';
    if (/\.woff$/i.test(path)) return 'woff';
    if (/\.otf$/i.test(path)) return 'opentype';
    if (/\.eot$/i.test(path)) return 'embedded-opentype';
    return 'truetype';
  }

  function assetUrl(path, version) {
    if (!path) return '';
    if (/^(blob:|data:|https?:\/\/)/i.test(path)) return path;
    var url = new URL(String(path).replace(/^\/+/, ''), assetRoot).href;
    if (version) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(version);
    return url;
  }

  function hash(value) {
    var text = String(value || '');
    var out = 5381;
    for (var i = 0; i < text.length; i++) out = ((out << 5) + out) ^ text.charCodeAt(i);
    return (out >>> 0).toString(36);
  }

  function ensureFontFace(path, family, version, formatPath) {
    if (!path || !window.FontFace || !document.fonts) return Promise.resolve(false);
    var url = assetUrl(path, version);
    var key = family + '|' + url;
    if (state.fontFaces.has(key)) return state.fontFaces.get(key);

    var source = 'url("' + url.replace(/"/g, '\\"') + '") format("' + fontFormat(formatPath || path) + '")';
    var promise = new FontFace(family, source).load().then(function (face) {
      document.fonts.add(face);
      return true;
    }).catch(function () {
      return false;
    });
    state.fontFaces.set(key, promise);
    return promise;
  }

  function optionFor(value) {
    for (var i = 0; i < FONT_OPTIONS.length; i++) {
      if (FONT_OPTIONS[i].value === value) return FONT_OPTIONS[i];
    }
    return null;
  }

  function readField(keyPath) {
    var root = document.querySelector('[data-key-path="' + keyPath + '"]');
    if (!root) return '';
    var input = root.querySelector('input:not([type="file"]), textarea, select');
    if (!input) return '';
    if (input.type === 'checkbox') return input.checked ? 'true' : 'false';
    return String(input.value || '').trim();
  }

  function readBool(keyPath) {
    var root = document.querySelector('[data-key-path="' + keyPath + '"]');
    var input = root && root.querySelector('input[type="checkbox"]');
    return !!(input && input.checked);
  }

  function readSavedFontFile() {
    var root = document.querySelector('[data-key-path="entry_title_font_file"]');
    if (!root) return '';
    var textInput = root.querySelector('input:not([type="file"]), textarea');
    if (textInput && isFontPath(textInput.value)) return textInput.value.trim();
    var matches = root.textContent.match(/[^\s"'()]+?\.(?:ttf|otf|woff2?|eot)/gi);
    if (!matches || !matches.length) return '';
    var value = matches[matches.length - 1].trim();
    return value.indexOf('/') >= 0 ? value : '/images/' + value;
  }

  function setTextFieldIfEmpty(keyPath, value) {
    var root = document.querySelector('[data-key-path="' + keyPath + '"]');
    var input = root && root.querySelector('input:not([type="file"]), textarea');
    if (!input || input.value) return;
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectedPath(value) {
    if (isFontPath(value)) return value;
    if (value === 'custom') return readSavedFontFile();
    return '';
  }

  function labelOf(value) {
    var option = optionFor(value);
    if (option) return option.label + ' - ' + option.detail;
    if (isFontPath(value)) return '自定义字体 - ' + String(value).split('/').pop();
    return String(value || 'display');
  }

  function optionValues(value) {
    var values = FONT_OPTIONS.map(function (item) { return item.value; });
    var saved = readSavedFontFile();
    if (saved && values.indexOf(saved) < 0) values.push(saved);
    if (value && values.indexOf(value) < 0) values.push(value);
    Object.keys(state.localPreviews).forEach(function (path) {
      if (values.indexOf(path) < 0) values.push(path);
    });
    return values;
  }

  function ensureSelectOption(select, value, label) {
    if (!select || !value) return;
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return;
    }
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label || labelOf(value);
    select.appendChild(option);
  }

  function commitSelectValue(select, value) {
    if (!select) return;
    ensureSelectOption(select, value);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function titleText() {
    var raw = readField('title');
    var lines = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\|/g, '\n')
      .split(/\n+/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .slice(0, 5);
    return lines.join('\n') || '未设置标题';
  }

  function formatDate(value) {
    if (!value) return '';
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + ' · ' + match[2] + ' · ' + match[3] : String(value).slice(0, 16);
  }

  function clampOpacity(value) {
    if (value === '') return 1;
    var number = Number(value);
    if (!isFinite(number)) return 1;
    return Math.max(0, Math.min(100, number)) / 100;
  }

  function setState(root, tone, text) {
    var pill = root && root.querySelector('.fp-state');
    if (!pill) return;
    pill.dataset.tone = tone || 'ready';
    pill.textContent = text || '就绪';
  }

  function setNote(root, tone, text) {
    var note = root && root.querySelector('.fp-note');
    if (!note) return;
    note.hidden = !text;
    note.dataset.tone = tone || '';
    note.textContent = text || '';
  }

  function setProgress(root, value) {
    var progress = root && root.querySelector('.fp-progress');
    var fill = root && root.querySelector('.fp-progress-fill');
    var label = root && root.querySelector('.fp-progress-value');
    if (!progress || !fill || !label) return;
    if (value == null) {
      progress.hidden = true;
      fill.style.width = '0%';
      label.textContent = '0%';
      return;
    }
    var pct = Math.max(0, Math.min(100, Math.round(value * 100)));
    progress.hidden = false;
    fill.style.width = pct + '%';
    label.textContent = pct + '%';
  }

  function applyBuiltin(preview, value) {
    var option = optionFor(value) || optionFor('display');
    preview.style.fontFamily = option.font;
    preview.style.fontWeight = option.weight ? String(option.weight) : '400';
    return option.label;
  }

  function updatePreview(root) {
    if (!root || !root.isConnected) return;
    var select = root.querySelector('.fp-select');
    var stage = root.querySelector('.fp-stage');
    var preview = root.querySelector('.fp-live-preview');
    var quote = root.querySelector('.fp-stage-quote');
    var date = root.querySelector('.fp-stage-date');
    var meta = root.querySelector('.fp-preview-meta');
    if (!select || !stage || !preview) return;

    var value = select.value || 'display';
    var path = selectedPath(value);
    var color = readField('entry_title_color') || '#f2f5f1';
    var opacity = clampOpacity(readField('entry_title_opacity'));
    var align = readField('entry_align') || 'left-bottom';
    var hiddenTitle = readBool('entry_hide_title');
    var description = readField('description');
    var local = path && state.localPreviews[path];

    stage.dataset.align = align;
    stage.dataset.titleHidden = hiddenTitle ? 'true' : 'false';
    stage.classList.remove('is-error', 'is-loading');
    preview.textContent = titleText();
    preview.style.color = color;
    preview.style.opacity = opacity;
    if (date) {
      date.textContent = formatDate(readField('date'));
      date.hidden = !date.textContent;
    }
    if (quote) {
      quote.textContent = description || '';
      quote.hidden = !description;
    }
    if (meta) {
      meta.textContent = (hiddenTitle ? '隐藏标题模式' : '显示标题模式') + ' / ' + align;
    }

    if (path) {
      var family = 'fpTitle_' + hash(path);
      var version = local ? local.version : state.remoteVersions[path];
      var source = local ? local.url : path;
      preview.style.fontFamily = "'" + family + "', Georgia, serif";
      preview.style.fontWeight = '400';
      stage.classList.add('is-loading');
      setState(root, 'loading', local ? '本地预览' : '加载字体');
      ensureFontFace(source, family, version, local ? local.name : path).then(function (ok) {
        if (!root.isConnected || select.value !== value) return;
        stage.classList.remove('is-loading');
        if (ok) {
          setState(root, 'ready', '已预览');
        } else {
          stage.classList.add('is-error');
          setState(root, 'error', '字体加载失败');
        }
      });
      return;
    }

    var label = applyBuiltin(preview, value);
    setState(root, 'ready', label);
  }

  function scheduleUpdate() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(function () {
      state.raf = 0;
      document.querySelectorAll('.fp-root').forEach(function (root) {
        bindRoot(root);
        updatePreview(root);
      });
    });
  }

  function utf8Base64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64Utf8(base64) {
    var binary = atob(String(base64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getGithubToken() {
    try {
      return window.localStorage.getItem('blog_gh_publish_token') || '';
    } catch (error) {
      return '';
    }
  }

  function githubHeaders(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(',')[1]);
      };
      reader.onerror = function () {
        reject(new Error('读取字体文件失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  function putJsonWithProgress(url, headers, body, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      Object.keys(headers).forEach(function (key) { xhr.setRequestHeader(key, headers[key]); });
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText || 'null'); } catch (error) {}
        if (xhr.status === 200 || xhr.status === 201) resolve(data);
        else reject(new Error((data && data.message) || ('GitHub 返回 ' + xhr.status)));
      };
      xhr.onerror = function () { reject(new Error('网络错误，上传失败')); };
      xhr.send(JSON.stringify(body));
    });
  }

  function getContentMeta(apiUrl, token) {
    return fetch(apiUrl, { headers: githubHeaders(token), cache: 'no-store' }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('读取 GitHub 文件信息失败 ' + response.status);
      return response.json();
    });
  }

  function uploadFontToGitHub(file, onProgress) {
    var token = getGithubToken();
    if (!token) return Promise.reject(new Error('未找到 GitHub 授权，请先在管理后台完成授权'));
    var apiUrl = 'https://api.github.com/repos/Levia808/blog/contents/assets/images/' + encodeURIComponent(file.name);
    return Promise.all([readFileAsBase64(file), getContentMeta(apiUrl, token)]).then(function (parts) {
      var body = {
        message: '上传字体: ' + file.name,
        content: parts[0]
      };
      if (parts[1] && parts[1].sha) body.sha = parts[1].sha;
      return putJsonWithProgress(apiUrl, githubHeaders(token), body, onProgress);
    }).then(function () {
      return updateFontList('/images/' + file.name, token).catch(function () {
        return { warning: true };
      });
    }).then(function (result) {
      return { path: '/images/' + file.name, warning: result && result.warning };
    });
  }

  function updateFontList(entry, token) {
    var apiUrl = 'https://api.github.com/repos/Levia808/blog/contents/static/fonts.json';
    return getContentMeta(apiUrl, token).then(function (meta) {
      var list = [];
      if (meta && meta.content) {
        try { list = JSON.parse(base64Utf8(meta.content)); } catch (error) { list = []; }
      }
      if (!Array.isArray(list)) list = [];
      if (list.indexOf(entry) < 0) list.push(entry);
      var body = {
        message: '更新字体库: ' + entry.split('/').pop(),
        content: utf8Base64(JSON.stringify(list, null, 2) + '\n')
      };
      if (meta && meta.sha) body.sha = meta.sha;
      return fetch(apiUrl, {
        method: 'PUT',
        headers: Object.assign(githubHeaders(token), { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      }).then(function (response) {
        if (!response.ok) throw new Error('字体清单更新失败 ' + response.status);
        state.fonts = list.map(function (url) {
          return { name: String(url).split('/').pop(), url: url };
        });
        return true;
      });
    });
  }

  function loadFonts(force) {
    if (!force && state.fonts) return Promise.resolve(state.fonts);
    if (!force && state.fontsPromise) return state.fontsPromise;
    state.fontsPromise = fetch(new URL('fonts.json', assetRoot), { cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        var seen = Object.create(null);
        state.fonts = Array.isArray(list) ? list.filter(function (url) {
          if (typeof url !== 'string' || !isFontPath(url) || seen[url]) return false;
          seen[url] = true;
          return true;
        }).map(function (url) {
          return { name: url.split('/').pop() || url, url: url };
        }) : [];
        return state.fonts;
      });
    return state.fontsPromise;
  }

  function renderLibrary(root, fonts) {
    var panel = root.querySelector('.fp-panel');
    var count = root.querySelector('.fp-library-count');
    var search = root.querySelector('.fp-library-search');
    if (!panel) return;
    var query = (search && search.value || '').toLowerCase().trim();
    var title = titleText().replace(/\n/g, ' ');
    var filtered = fonts.filter(function (font) {
      return !query || font.name.toLowerCase().indexOf(query) >= 0 || font.url.toLowerCase().indexOf(query) >= 0;
    });
    panel.innerHTML = '';
    if (count) count.textContent = filtered.length + ' / ' + fonts.length;
    if (!filtered.length) {
      panel.innerHTML = '<div class="fp-empty">没有匹配的字体</div>';
      return;
    }
    filtered.forEach(function (font, index) {
      var item = document.createElement('button');
      var family = 'fpLib_' + hash(font.url);
      item.type = 'button';
      item.className = 'fp-lib-item';
      item.dataset.url = font.url;
      item.dataset.family = family;
      item.innerHTML = '<span class="fp-lib-sample">' + escapeHtml(title) + '</span><small class="fp-lib-name">' + escapeHtml(font.name) + '</small>';
      panel.appendChild(item);
      ensureFontFace(font.url, family).then(function (ok) {
        var sample = item.querySelector('.fp-lib-sample');
        if (ok && sample) sample.style.fontFamily = "'" + family + "', serif";
      });
    });
  }

  function showLibrary(root, force) {
    var library = root.querySelector('.fp-library');
    var panel = root.querySelector('.fp-panel');
    if (!library || !panel) return;
    library.hidden = false;
    panel.innerHTML = '<div class="fp-empty">正在读取字体库</div>';
    loadFonts(force).then(function (fonts) {
      if (!root.isConnected) return;
      renderLibrary(root, fonts);
    });
  }

  function handleUpload(root, file) {
    var select = root.querySelector('.fp-select');
    var previous = select && select.value;
    if (!file || !select) return;
    if (!isFontPath(file.name)) {
      setState(root, 'error', '格式不支持');
      setNote(root, 'error', '请选择 .ttf、.otf、.woff、.woff2 或 .eot 字体文件');
      return;
    }

    var path = '/images/' + file.name;
    var url = URL.createObjectURL(file);
    state.localPreviews[path] = { url: url, name: file.name, version: Date.now() };
    ensureSelectOption(select, path, '上传中 - ' + file.name);
    commitSelectValue(select, path);
    setTextFieldIfEmpty('entry_title_font_name', 'Custom Title');
    setState(root, 'loading', '正在上传');
    setNote(root, '', '已使用本地文件即时预览，上传完成后保存文章即可生效');
    setProgress(root, 0.02);
    scheduleUpdate();

    uploadFontToGitHub(file, function (progress) { setProgress(root, progress); }).then(function (result) {
      state.remoteVersions[result.path] = Date.now();
      setProgress(root, 1);
      setTimeout(function () { setProgress(root, null); }, 450);
      ensureSelectOption(select, result.path);
      commitSelectValue(select, result.path);
      setState(root, 'ready', '已上传');
      setNote(root, result.warning ? 'error' : 'success', result.warning ? '字体已上传，但字体库清单同步失败；当前文章仍可使用该字体路径' : '字体已上传并加入资源库：' + file.name);
      scheduleUpdate();
    }).catch(function (error) {
      setProgress(root, null);
      delete state.localPreviews[path];
      if (previous) commitSelectValue(select, previous);
      setState(root, 'error', '上传失败');
      setNote(root, 'error', (error && error.message) || '上传失败');
      scheduleUpdate();
    });
  }

  function bindRoot(root) {
    if (!root || root.dataset.fpBound) return;
    root.dataset.fpBound = '1';

    var select = root.querySelector('.fp-select');
    var upload = root.querySelector('.fp-upload');
    var libraryToggle = root.querySelector('.fp-library-toggle');
    var library = root.querySelector('.fp-library');
    var panel = root.querySelector('.fp-panel');
    var search = root.querySelector('.fp-library-search');
    var refresh = root.querySelector('.fp-refresh');

    if (select) {
      select.addEventListener('change', function () {
        root.dataset.fpValue = select.value;
        scheduleUpdate();
      });
    }
    if (upload) {
      upload.addEventListener('change', function (event) {
        handleUpload(root, event.target.files && event.target.files[0]);
        upload.value = '';
      });
    }
    if (libraryToggle) {
      libraryToggle.addEventListener('click', function () {
        if (!library) return;
        if (!library.hidden) {
          library.hidden = true;
          return;
        }
        showLibrary(root, false);
      });
    }
    if (panel) {
      panel.addEventListener('click', function (event) {
        var item = event.target.closest('.fp-lib-item');
        if (!item || !select) return;
        commitSelectValue(select, item.dataset.url);
        if (library) library.hidden = true;
        setState(root, 'ready', '已选择');
        setNote(root, 'success', '已选择资源库字体：' + (item.querySelector('.fp-lib-name') || {}).textContent);
      });
    }
    if (search) {
      search.addEventListener('input', function () {
        loadFonts(false).then(function (fonts) { renderLibrary(root, fonts); });
      });
    }
    if (refresh) {
      refresh.addEventListener('click', function () {
        state.fonts = null;
        state.fontsPromise = null;
        showLibrary(root, true);
      });
    }
    updatePreview(root);
  }

  function initDomController() {
    if (state.observing) return;
    state.observing = true;
    ['input', 'change'].forEach(function (eventName) {
      document.addEventListener(eventName, function (event) {
        if (event.target.closest('.fp-root')) return;
        if (event.target.closest('[data-key-path="title"], [data-key-path="description"], [data-key-path="date"], [data-key-path="entry_title_color"], [data-key-path="entry_title_opacity"], [data-key-path="entry_align"], [data-key-path="entry_hide_title"], [data-key-path="entry_title_font_file"], [data-key-path="entry_title_font_name"]')) {
          scheduleUpdate();
        }
      }, true);
    });

    new MutationObserver(function () { scheduleUpdate(); }).observe(document.body, { childList: true, subtree: true });
    scheduleUpdate();
  }

  function FontSelectControl(props) {
    var R = window.createElement;
    var value = props.value || 'display';
    var options = optionValues(value).map(function (optionValue) {
      return R('option', { key: optionValue, value: optionValue }, labelOf(optionValue));
    });
    return R('div', { className: 'fp-root', 'data-fp-value': value },
      R('div', { className: 'fp-head' },
        R('div', null,
          R('div', { className: 'fp-kicker' }, 'Fullscreen Cover'),
          R('div', { className: 'fp-title' }, '全屏标题字体'),
          R('div', { className: 'fp-subtitle' }, '切换字体后立即预览当前文章的封面标题')
        ),
        R('div', { className: 'fp-state', 'data-tone': 'ready' }, '就绪')
      ),
      R('div', { className: 'fp-picker' },
        R('select', {
          className: 'fp-select',
          value: value,
          onChange: function (event) {
            props.onChange(event.target.value);
            scheduleUpdate();
          }
        }, options),
        R('label', { className: 'fp-action fp-action-primary' },
          '上传字体',
          R('input', { className: 'fp-upload', type: 'file', accept: '.ttf,.otf,.woff,.woff2,.eot' })
        ),
        R('button', { className: 'fp-action fp-library-toggle', type: 'button' }, '资源库')
      ),
      R('div', { className: 'fp-library', hidden: true },
        R('div', { className: 'fp-library-head' },
          R('input', { className: 'fp-library-search', type: 'search', placeholder: '搜索字体文件' }),
          R('span', { className: 'fp-library-count' }, '0 / 0'),
          R('button', { className: 'fp-action fp-action-icon fp-refresh', type: 'button' }, '刷新')
        ),
        R('div', { className: 'fp-panel' })
      ),
      R('div', { className: 'fp-note', hidden: true }),
      R('div', { className: 'fp-progress', hidden: true },
        R('div', { className: 'fp-progress-track' },
          R('div', { className: 'fp-progress-fill' })
        ),
        R('div', { className: 'fp-progress-value' }, '0%')
      ),
      R('div', { className: 'fp-preview' },
        R('div', { className: 'fp-preview-head' },
          R('div', { className: 'fp-label' }, '实时封面预览'),
          R('div', { className: 'fp-preview-meta' })
        ),
        R('div', { className: 'fp-stage', 'data-align': 'left-bottom' },
          R('div', { className: 'fp-stage-content' },
            R('div', { className: 'fp-stage-date' }),
            R('div', { className: 'fp-live-preview' }, '未设置标题'),
            R('div', { className: 'fp-stage-quote', hidden: true })
          )
        )
      )
    );
  }

  function FontSelectPreview(props) {
    return window.createElement('span', null, labelOf(props.value || 'display'));
  }

  function register() {
    var CMS = window.CMS;
    if (!CMS || typeof CMS.registerWidget !== 'function' || !window.createElement) {
      setTimeout(register, 200);
      return;
    }
    if (state.registered) {
      initDomController();
      return;
    }
    CMS.registerWidget('fontPreviewSelect', FontSelectControl, FontSelectPreview);
    state.registered = true;
    initDomController();
  }

  window.FontPreviewWidget = {
    register: register,
    scheduleUpdate: scheduleUpdate
  };
})();
