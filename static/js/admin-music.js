// Music Management Extension for Admin Panel
// Requires: audio-metadata.js, music_library table, user-audio storage bucket

(function() {
  'use strict';

  if (!window.Admin || !window.blogSupabase || !window.AudioMetadata) {
    console.warn('Music management requires Admin, Supabase and AudioMetadata');
    return;
  }

  var supabase = window.blogSupabase;
  var musicUploadBtn = document.getElementById('adminMusicUploadBtn');
  var musicInput = document.getElementById('adminMusicInput');
  var musicUploadQueue = document.getElementById('adminMusicUploadQueue');
  var musicTable = document.getElementById('adminMusicTable');
  var musicError = document.getElementById('adminMusicError');
  var musicHint = document.getElementById('adminMusicHint');
  var musicCount = document.getElementById('adminMusicCount');
  var musicTotalSize = document.getElementById('adminMusicTotalSize');
  var musicTotalDuration = document.getElementById('adminMusicTotalDuration');

  var uploadingFiles = [];

  // Initialize music management
  function initMusicManagement() {
    if (!musicUploadBtn) return;

    musicUploadBtn.addEventListener('click', function() {
      musicInput.click();
    });

    musicInput.addEventListener('change', handleFileSelect);

    // Refresh button
    var refreshBtn = document.querySelector('[data-admin-refresh="music"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadMusicLibrary);
    }
  }

  // Handle file selection
  function handleFileSelect(e) {
    var files = Array.from(e.target.files);
    if (files.length === 0) return;

    musicError.hidden = true;

    files.forEach(function(file) {
      if (!validateAudioFile(file)) return;
      uploadAudioFile(file);
    });

    musicInput.value = '';
  }

  // Validate audio file
  function validateAudioFile(file) {
    var maxSize = 50 * 1024 * 1024; // 50MB
    var allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/flac'];

    if (file.size > maxSize) {
      showMusicError('文件 "' + file.name + '" 超过 50MB 限制');
      return false;
    }

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
      showMusicError('不支持的音频格式: ' + file.name);
      return false;
    }

    return true;
  }

  // Upload audio file
  async function uploadAudioFile(file) {
    var uploadId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Create upload item UI
    var uploadItem = createUploadItemUI(uploadId, file.name);
    musicUploadQueue.appendChild(uploadItem);

    var progressBar = uploadItem.querySelector('.music-upload-progress-fill');
    var progressText = uploadItem.querySelector('.music-upload-progress-text');
    var statusText = uploadItem.querySelector('.music-upload-status');
    var metaDisplay = uploadItem.querySelector('.music-upload-meta');

    try {
      // Step 1: Extract metadata
      statusText.textContent = '正在提取元信息...';
      var metadata = await window.AudioMetadata.extract(file);

      // Display extracted metadata
      metaDisplay.innerHTML = '<strong>' + escapeHtml(metadata.title || file.name) + '</strong><br>' +
        '<span class="music-meta-artist">' + escapeHtml(metadata.artist || 'Unknown Artist') + '</span>' +
        (metadata.album ? ' · ' + escapeHtml(metadata.album) : '') +
        (metadata.duration ? ' · ' + formatDuration(metadata.duration) : '');
      metaDisplay.hidden = false;

      // Step 2: Upload to storage
      statusText.textContent = '正在上传音频文件...';
      var timestamp = Date.now();
      var safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      var storagePath = Admin.currentUser.id + '/' + timestamp + '-' + safeName;

      var uploadResult = await supabase.storage
        .from('user-audio')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: function(progress) {
            var percent = Math.round((progress.loaded / progress.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = percent + '%';
          }
        });

      if (uploadResult.error) throw uploadResult.error;

      // Step 3: Get public URL
      var publicUrlResult = supabase.storage
        .from('user-audio')
        .getPublicUrl(storagePath);

      var publicUrl = publicUrlResult.data.publicUrl;

      // Step 4: Save to database
      statusText.textContent = '正在保存元数据...';
      var dbResult = await supabase
        .from('music_library')
        .insert({
          user_id: Admin.currentUser.id,
          title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.album || null,
          year: metadata.year || null,
          genre: metadata.genre || null,
          duration: metadata.duration || null,
          cover_url: metadata.cover || null,
          audio_path: storagePath,
          audio_url: publicUrl,
          file_size: file.size,
          mime_type: file.type,
          source: 'upload',
          metadata: {
            fileName: file.name,
            uploadedAt: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (dbResult.error) throw dbResult.error;

      // Success
      statusText.textContent = '✓ 上传完成';
      uploadItem.classList.add('music-upload-success');

      setTimeout(function() {
        uploadItem.remove();
        loadMusicLibrary();
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);
      statusText.textContent = '✗ ' + (error.message || '上传失败');
      uploadItem.classList.add('music-upload-error');
    }
  }

  // Create upload item UI
  function createUploadItemUI(id, fileName) {
    var div = document.createElement('div');
    div.className = 'music-upload-item';
    div.id = id;
    div.innerHTML = [
      '<div class="music-upload-header">',
      '<span class="music-upload-filename">' + escapeHtml(fileName) + '</span>',
      '</div>',
      '<div class="music-upload-meta" hidden></div>',
      '<div class="music-upload-progress-wrap">',
      '<div class="music-upload-progress-bar">',
      '<div class="music-upload-progress-fill" style="width: 0%"></div>',
      '</div>',
      '<span class="music-upload-progress-text">0%</span>',
      '</div>',
      '<div class="music-upload-status">等待中...</div>'
    ].join('');
    return div;
  }

  // Load music library
  async function loadMusicLibrary() {
    if (!musicTable || !Admin.currentUser) return;

    musicHint.textContent = '加载中...';
    musicHint.hidden = false;
    musicError.hidden = true;

    try {
      var result = await supabase
        .from('music_library')
        .select('*')
        .eq('user_id', Admin.currentUser.id)
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      var tracks = result.data || [];

      // Update stats
      musicCount.textContent = tracks.length;
      var totalSize = tracks.reduce(function(sum, t) { return sum + (t.file_size || 0); }, 0);
      var totalDuration = tracks.reduce(function(sum, t) { return sum + (t.duration || 0); }, 0);
      musicTotalSize.textContent = formatBytes(totalSize);
      musicTotalDuration.textContent = formatDuration(totalDuration);

      // Render table
      if (tracks.length === 0) {
        musicTable.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--secondary-text);">还没有上传音乐</td></tr>';
        musicHint.hidden = true;
        return;
      }

      musicTable.innerHTML = tracks.map(function(track) {
        var coverImg = track.cover_url
          ? '<img src="' + escapeHtml(track.cover_url) + '" alt="" class="music-cover-thumb">'
          : '<div class="music-cover-placeholder">♪</div>';

        return [
          '<tr data-music-id="' + track.id + '">',
          '<td>' + coverImg + '</td>',
          '<td><strong>' + escapeHtml(track.title) + '</strong></td>',
          '<td>' + escapeHtml(track.artist) + '</td>',
          '<td>' + escapeHtml(track.album || '—') + '</td>',
          '<td>' + (track.duration ? formatDuration(track.duration) : '—') + '</td>',
          '<td>' + formatBytes(track.file_size) + '</td>',
          '<td><span class="music-source-badge">' + track.source + '</span></td>',
          '<td>',
          '<button type="button" class="admin-row-action" onclick="AdminMusic.playTrack(\'' + track.id + '\')">播放</button>',
          '<button type="button" class="admin-row-action" onclick="AdminMusic.editTrack(\'' + track.id + '\')">编辑</button>',
          '<button type="button" class="admin-row-action admin-row-danger" onclick="AdminMusic.deleteTrack(\'' + track.id + '\')">删除</button>',
          '</td>',
          '</tr>'
        ].join('');
      }).join('');

      musicHint.hidden = true;

    } catch (error) {
      console.error('Load music error:', error);
      showMusicError('加载失败: ' + error.message);
      musicHint.hidden = true;
    }
  }

  // Play track
  function playTrack(trackId) {
    supabase
      .from('music_library')
      .select('*')
      .eq('id', trackId)
      .single()
      .then(function(result) {
        if (result.error) throw result.error;
        var track = result.data;

        if (window.FloatPlayer) {
          window.FloatPlayer.expand();
          // Would need to integrate with float player to add this track
          console.log('Play track:', track);
        } else {
          // Fallback: open in new audio element
          var audio = new Audio(track.audio_url);
          audio.play();
        }
      })
      .catch(function(error) {
        showMusicError('播放失败: ' + error.message);
      });
  }

  // Edit track metadata
  function editTrack(trackId) {
    supabase
      .from('music_library')
      .select('*')
      .eq('id', trackId)
      .single()
      .then(function(result) {
        if (result.error) throw result.error;
        var track = result.data;

        var newTitle = prompt('标题:', track.title);
        if (newTitle === null) return;

        var newArtist = prompt('艺术家:', track.artist);
        if (newArtist === null) return;

        var newAlbum = prompt('专辑:', track.album || '');

        return supabase
          .from('music_library')
          .update({
            title: newTitle || track.title,
            artist: newArtist || track.artist,
            album: newAlbum || null
          })
          .eq('id', trackId);
      })
      .then(function(updateResult) {
        if (updateResult && updateResult.error) throw updateResult.error;
        loadMusicLibrary();
      })
      .catch(function(error) {
        showMusicError('编辑失败: ' + error.message);
      });
  }

  // Delete track
  function deleteTrack(trackId) {
    if (!confirm('确定要删除这首歌曲吗？此操作无法撤销。')) return;

    supabase
      .from('music_library')
      .select('audio_path')
      .eq('id', trackId)
      .single()
      .then(function(result) {
        if (result.error) throw result.error;
        var track = result.data;

        // Delete from storage
        return supabase.storage
          .from('user-audio')
          .remove([track.audio_path])
          .then(function() {
            // Delete from database
            return supabase
              .from('music_library')
              .delete()
              .eq('id', trackId);
          });
      })
      .then(function(deleteResult) {
        if (deleteResult.error) throw deleteResult.error;
        loadMusicLibrary();
      })
      .catch(function(error) {
        showMusicError('删除失败: ' + error.message);
      });
  }

  // Utility functions
  function showMusicError(message) {
    musicError.textContent = message;
    musicError.hidden = false;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDuration(seconds) {
    if (!seconds) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Export public API
  window.AdminMusic = {
    init: initMusicManagement,
    load: loadMusicLibrary,
    playTrack: playTrack,
    editTrack: editTrack,
    deleteTrack: deleteTrack
  };

  // Auto-initialize when admin panel loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicManagement);
  } else {
    initMusicManagement();
  }

  // Also hook into existing admin panel section switching
  var originalSwitchSection = window.Admin && window.Admin.switchSection;
  if (originalSwitchSection) {
    window.Admin.switchSection = function(section) {
      originalSwitchSection.call(window.Admin, section);
      if (section === 'music') {
        loadMusicLibrary();
      }
    };
  }

})();
