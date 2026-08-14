/* ── Threads 串文卡片视频/图片预览统一样式修改 ──
   修改要点：
   1. 视频和图片预览样式完全一样
   2. 鼠标悬停时自动播放视频（首帧+居中播放图标）
   3. 鼠标移开时显示第一帧 + 居中播放图标
   4. 原点击播放功能（带声音/再点暂停）保留
   5. 兼容所有浏览器（Safari 等） */

// 确保只执行一次
if (!window.threadsVideoInitialized) {
  window.threadsVideoInitialized = true;

  // 添加视频/图片统一预览样式（CSS 已在 features.css 完成）
  // 以下是 JS 增强交互

  // 视频自动播放 + 鼠标移开显示第一帧 + 播放图标
  function initThreadsVideoPlay(card) {
    var videos = card.querySelectorAll('.th-media-item.is-video video');
    videos.forEach(function(video) {
      var item = video.closest('.th-media-item');
      var playBtn = item.querySelector('.th-video-play');

      // 鼠标移入时自动播放（muted + loop）
      item.addEventListener('mouseenter', function() {
        if (!video.paused) return;
        video.muted = true;
        video.loop = true;
        video.play().then(function() {
          item.classList.add('video-playing');
          if (playBtn) playBtn.classList.add('is-playing');
        }).catch(function() {});
      });

      // 鼠标移开时停止并显示第一帧 + 播放图标
      item.addEventListener('mouseleave', function() {
        video.pause();
        item.classList.remove('video-playing');
        if (playBtn) {
          playBtn.classList.remove('is-playing');
          playBtn.setAttribute('aria-label', '播放');
        }
      });

      // 初始状态：静音第一帧 + 播放图标
      video.muted = true;
      video.loop = true;
      video.currentTime = 0;
    });
  }

  // 页面加载和动态卡片渲染后初始化
  function initAllThreadsVideos() {
    document.querySelectorAll('.threads-card').forEach(function(card) {
      initThreadsVideoPlay(card);
    });
  }

  // 初始初始化
  document.addEventListener('DOMContentLoaded', function() {
    initAllThreadsVideos();
  });

  // 动态卡片渲染后初始化（renderThreadsCard 函数内部已调用）
  var originalRenderThreadsCard = window.renderThreadsCard || function() {};
  window.renderThreadsCard = function(card, d) {
    // 旧代码
    originalRenderThreadsCard(card, d);
    // 新代码：等待布局后初始化视频
    setTimeout(function() {
      initAllThreadsVideos();
    }, 100);
  };

  // 补充：当轮播或布局变化后重新初始化
  var originalLayoutThreadsMedia = window.layoutThreadsMedia || function() {};
  window.layoutThreadsMedia = function(card) {
    originalLayoutThreadsMedia(card);
    setTimeout(function() {
      initAllThreadsVideos();
    }, 100);
  };
}