/* YouTube View client logic */

(function () {
  'use strict';

  const searchInput = document.getElementById('yv-search');
  const searchBtn = document.getElementById('yv-search-btn');
  const resultsEl = document.getElementById('yv-results');
  const hideShorts = document.getElementById('yv-hide-shorts');
  const placeholder = document.getElementById('yv-player-placeholder');
  const videoBox = document.getElementById('yv-video-box');
  const iframe = document.getElementById('yv-iframe');
  const fullscreenBtn = document.getElementById('yv-fullscreen');
  const resetBtn = document.getElementById('yv-reset');
  const openYtBtn = document.getElementById('yv-open-yt');
  const resizeHandle = document.getElementById('yv-resize-handle');
  const container = document.getElementById('yv-player-container');

  let currentVideo = null;

  const isPhone = () =>
    window.matchMedia('(max-width: 820px)').matches ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

  /* ---------------- Search ---------------- */

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

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function renderVideos(videos) {
    resultsEl.innerHTML = '';
    if (!videos || videos.length === 0) {
      resultsEl.innerHTML = '<div class="yv-empty">No videos found.</div>';
      return;
    }
    videos.forEach((v) => {
      const el = document.createElement('div');
      el.className = 'yv-video';
      el.innerHTML =
        '<div class="yv-thumb">' +
          '<img loading="lazy" src="' + escapeHtml(v.thumbnail || '') + '" alt="">' +
        '</div>' +
        '<div class="yv-info">' +
          '<div class="yv-title">' + escapeHtml(v.title || 'Untitled') + '</div>' +
          '<div class="yv-channel">' + escapeHtml(v.channel || 'Unknown') + '</div>' +
          '<div class="yv-meta">' + escapeHtml(v.views || '') +
            (v.views && v.age ? ' · ' : '') + escapeHtml(v.age || '') + '</div>' +
        '</div>';
      el.addEventListener('click', () => loadVideo(v));
      resultsEl.appendChild(el);
    });
  }

  /* ---------------- Load video ---------------- */

  function loadVideo(v) {
    currentVideo = v;
    const videoId = v.id;
    const params = new URLSearchParams({
      enablejsapi: '1',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      origin: window.location.origin
    });

    iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?' + params.toString();
    placeholder.classList.add('hidden');
    videoBox.classList.remove('hidden');

    if (!isPhone()) {
      videoBox.style.width = '640px';
      videoBox.style.height = '360px';
    } else {
      videoBox.style.width = '';
      videoBox.style.height = '';
    }

    openYtBtn.href = 'https://www.youtube.com/watch?v=' + videoId;
    openYtBtn.style.display = 'inline-flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Resize (desktop) ---------------- */

  let isResizing = false;
  let startX = 0, startY = 0, startW = 0, startH = 0;

  function beginResize(clientX, clientY) {
    isResizing = true;
    container.classList.add('resizing');
    startX = clientX;
    startY = clientY;
    startW = videoBox.offsetWidth;
    startH = videoBox.offsetHeight;
  }

  function moveResize(clientX, clientY) {
    if (!isResizing) return;
    const w = Math.max(240, Math.min(1200, startW + (clientX - startX)));
    const h = Math.max(140, Math.min(720, startH + (clientY - startY)));
    videoBox.style.width = w + 'px';
    videoBox.style.height = h + 'px';
  }

  function endResize() {
    isResizing = false;
    container.classList.remove('resizing');
  }

  resizeHandle.addEventListener('mousedown', (e) => {
    if (fsOpen) return;
    e.preventDefault();
    beginResize(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e) => moveResize(e.clientX, e.clientY));
  document.addEventListener('mouseup', endResize);

  resizeHandle.addEventListener('touchstart', (e) => {
    if (fsOpen) return;
    e.preventDefault();
    const t = e.touches[0];
    beginResize(t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    e.preventDefault();
    const t = e.touches[0];
    moveResize(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener('touchend', endResize);

  /* ---------------- Mobile flip-fullscreen ---------------- */

  const fsUI = document.createElement('div');
  fsUI.className = 'yv-fs-ui';
  fsUI.innerHTML =
    '<button type="button" class="yv-fs-btn" id="yv-fs-play" aria-label="Pause">&#10074;&#10074;</button>' +
    '<button type="button" class="yv-fs-btn yv-fs-close" id="yv-fs-close" aria-label="Exit fullscreen">&#10005;</button>';

  const fsHint = document.createElement('div');
  fsHint.className = 'yv-fs-hint';
  fsHint.textContent = 'Drag the yellow handle to move · tap ✕ to close';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'yv-fs-drag';
  dragHandle.innerHTML = '<span>&#10495;</span>';

  document.body.appendChild(fsUI);
  document.body.appendChild(fsHint);
  videoBox.appendChild(dragHandle);

  const playBtn = fsUI.querySelector('#yv-fs-play');
  const closeBtn = fsUI.querySelector('#yv-fs-close');

  let fsOpen = false;
  let playing = true;
  let prevW = '';
  let prevH = '';

  function setPlayIcon() {
    playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function playerCommand(func) {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: func, args: [] }),
        '*'
      );
    } catch (e) {
      /* iframe not ready yet */
    }
  }

  function isPortrait() {
    return window.innerHeight > window.innerWidth;
  }

  function layoutFS() {
    if (!fsOpen) return;
    videoBox.classList.toggle('portrait', isPortrait());
  }

  function openFS() {
    if (!currentVideo) return;
    fsOpen = true;

    // Inline sizes (set on desktop) would beat the fullscreen CSS — stash and clear them.
    prevW = videoBox.style.width;
    prevH = videoBox.style.height;
    videoBox.style.width = '';
    videoBox.style.height = '';

    videoBox.classList.add('yv-fs');
    container.classList.add('fs-open');
    document.body.classList.add('yv-fs-lock');
    fsUI.classList.add('open');

    fsHint.classList.remove('open');
    // restart the hint animation
    void fsHint.offsetWidth;
    fsHint.classList.add('open');

    videoBox.style.setProperty('--fsx', '0px');
    videoBox.style.setProperty('--fsy', '0px');

    layoutFS();
    playing = true;
    setPlayIcon();
    playerCommand('playVideo');
  }

  function closeFS() {
    if (!fsOpen) return;
    fsOpen = false;
    videoBox.classList.remove('yv-fs', 'portrait');
    container.classList.remove('fs-open');
    document.body.classList.remove('yv-fs-lock');
    fsUI.classList.remove('open');
    fsHint.classList.remove('open');
    videoBox.style.removeProperty('--fsx');
    videoBox.style.removeProperty('--fsy');

    videoBox.style.width = prevW;
    videoBox.style.height = prevH;
  }

  fullscreenBtn.addEventListener('click', () => {
    if (fsOpen) { closeFS(); return; }

    if (isPhone()) {
      openFS();
      return;
    }

    // Desktop: native fullscreen
    if (!document.fullscreenElement) {
      if (videoBox.requestFullscreen) {
        videoBox.requestFullscreen().catch(() => openFS());
      } else {
        openFS();
      }
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !fsOpen && !isPhone()) {
      videoBox.style.width = '640px';
      videoBox.style.height = '360px';
    }
  });

  closeBtn.addEventListener('click', closeFS);

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playerCommand(playing ? 'playVideo' : 'pauseVideo');
    setPlayIcon();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fsOpen) closeFS();
    if (e.key === ' ' && fsOpen && e.target === document.body) {
      e.preventDefault();
      playBtn.click();
    }
  });

  window.addEventListener('resize', layoutFS);
  window.addEventListener('orientationchange', () => window.setTimeout(layoutFS, 200));

  // Keep the play/pause icon in sync with the player
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    let data = e.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (data && data.event === 'infoDelivery' && data.info && typeof data.info.playerState === 'number') {
      playing = data.info.playerState === 1;
      setPlayIcon();
    }
  });

  /* ---------------- Drag the flipped video ---------------- */

  let dragging = false;
  let dragId = null;
  let dragStartX = 0, dragStartY = 0, baseX = 0, baseY = 0;

  function currentOffset(name) {
    return parseFloat(videoBox.style.getPropertyValue(name)) || 0;
  }

  dragHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    dragId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    baseX = currentOffset('--fsx');
    baseY = currentOffset('--fsy');
    try { dragHandle.setPointerCapture(e.pointerId); } catch (err) {}
  });

  dragHandle.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragId) return;
    e.preventDefault();
    videoBox.style.setProperty('--fsx', (baseX + e.clientX - dragStartX) + 'px');
    videoBox.style.setProperty('--fsy', (baseY + e.clientY - dragStartY) + 'px');
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { dragHandle.releasePointerCapture(e.pointerId); } catch (err) {}
    dragId = null;
  }

  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);

  /* ---------------- Reset ---------------- */

  resetBtn.addEventListener('click', () => {
    closeFS();
    videoBox.style.width = isPhone() ? '' : '640px';
    videoBox.style.height = isPhone() ? '' : '360px';
  });

  /* ---------------- Search events ---------------- */

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching…';
    try {
      const videos = await searchYouTube(q);
      const filtered = hideShorts.checked ? videos.filter((v) => !v.isShort) : videos;
      renderVideos(filtered);
    } catch (e) {
      resultsEl.innerHTML = '<div class="yv-empty">Could not search. Try again.</div>';
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  }

  /* ---------------- Init ---------------- */

  setPlayIcon();
  doSearch();
})();
