/* YouTube View client logic */

(function() {
  const searchInput = document.getElementById('yv-search');
  const searchBtn = document.getElementById('yv-search-btn');
  const resultsEl = document.getElementById('yv-results');
  const hideShorts = document.getElementById('yv-hide-shorts');
  const placeholder = document.getElementById('yv-player-placeholder');
  const videoBox = document.getElementById('yv-video-box');
  const iframe = document.getElementById('yv-iframe');
  const videoInner = document.getElementById('yv-video-inner');
  const fullscreenBtn = document.getElementById('yv-fullscreen');
  const resetBtn = document.getElementById('yv-reset');
  const openYtBtn = document.getElementById('yv-open-yt');
  const resizeHandle = document.getElementById('yv-resize-handle');
  const container = document.getElementById('yv-player-container');

  let currentVideo = null;

  // ---------- Search YouTube ----------
  async function searchYouTube(q) {
    try {
      const res = await fetch('/api/yt-search?q=' + encodeURIComponent(q));
      if (!res.ok) throw new Error('Search failed');
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  function renderVideos(videos) {
    resultsEl.innerHTML = '';
    if (!videos || videos.length === 0) {
      resultsEl.innerHTML = '<div class="yv-empty">No videos found.</div>';
      return;
    }
    videos.forEach(v => {
      const el = document.createElement('div');
      el.className = 'yv-video';
      el.innerHTML = `
        <div class="yv-thumb">
          <img src="${escapeHtml(v.thumbnail || 'https://via.placeholder.com/120x68?text=Video')}" alt="">
        </div>
        <div class="yv-info">
          <div class="yv-title">${escapeHtml(v.title || 'Untitled')}</div>
          <div class="yv-channel">${escapeHtml(v.channel || 'Unknown')}</div>
          <div class="yv-meta">${escapeHtml(v.views || '')} ${v.views && v.age ? '·' : ''} ${escapeHtml(v.age || '')}</div>
        </div>
      `;
      el.addEventListener('click', () => loadVideo(v));
      resultsEl.appendChild(el);
    });
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---------- Load video ----------
  function loadVideo(v) {
    currentVideo = v;
    const videoId = v.id;
    const src = 'https://www.youtube-nocookie.com/embed/' + videoId;

    iframe.src = src;
    placeholder.classList.add('hidden');
    videoBox.classList.remove('hidden');
    videoBox.style.width = '640px';
    videoBox.style.height = '360px';

    openYtBtn.href = 'https://www.youtube.com/watch?v=' + videoId;
    openYtBtn.style.display = 'inline-flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Resize handle ----------
  let isResizing = false;
  let startX, startY, startW, startH;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    container.classList.add('resizing');
    startX = e.clientX;
    startY = e.clientY;
    startW = videoBox.offsetWidth;
    startH = videoBox.offsetHeight;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let w = Math.max(320, Math.min(1200, startW + dx));
    let h = Math.max(180, Math.min(720, startH + dy));
    videoBox.style.width = w + 'px';
    videoBox.style.height = h + 'px';
  }

  function onMouseUp() {
    isResizing = false;
    container.classList.remove('resizing');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  // Touch resize for mobile
  resizeHandle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isResizing = true;
    container.classList.add('resizing');
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startW = videoBox.offsetWidth;
    startH = videoBox.offsetHeight;
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });

  function onTouchMove(e) {
    if (!isResizing) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    let w = Math.max(320, Math.min(1200, startW + dx));
    let h = Math.max(180, Math.min(720, startH + dy));
    videoBox.style.width = w + 'px';
    videoBox.style.height = h + 'px';
  }

  function onTouchEnd() {
    isResizing = false;
    container.classList.remove('resizing');
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }
  // ---------- Fullscreen (mobile: rotate 90deg) ----------
  fullscreenBtn.addEventListener('click', () => {
    const box = videoBox;
    if (!box.requestFullscreen) {
      box.classList.toggle('yv-fullscreen');
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      box.requestFullscreen().then(() => {
        if (window.innerWidth < 768) {
          box.style.transform = 'rotate(90deg)';
          box.style.transformOrigin = 'center';
          box.style.width = '100vh';
          box.style.height = '100vw';
        }
      });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      videoBox.style.transform = '';
      videoBox.style.transformOrigin = '';
      videoBox.style.width = '640px';
      videoBox.style.height = '360px';
    }
  });

  // ---------- Reset size ----------
  resetBtn.addEventListener('click', () => {
    videoBox.style.width = '640px';
    videoBox.style.height = '360px';
    videoBox.style.transform = '';
  });

  // ---------- Search events ----------
  searchBtn.addEventListener('click', () => doSearch());
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching…';
    try {
      const videos = await searchYouTube(q);
      const filtered = hideShorts.checked ? videos.filter(v => !v.isShort) : videos;
      renderVideos(filtered);
    } catch (e) {
      resultsEl.innerHTML = '<div class="yv-empty">Could not search. Try again.</div>';
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  }

  // ---------- Mobile: rotate on orientation change ----------
  window.addEventListener('orientationchange', () => {
    if (window.innerWidth < 768 && document.fullscreenElement) {
      setTimeout(() => {
        videoBox.style.transform = 'rotate(90deg)';
        videoBox.style.transformOrigin = 'center';
        videoBox.style.width = '100vh';
        videoBox.style.height = '100vw';
      }, 100);
    }
  });

  // ---------- Init ----------
  doSearch();
})();