/* Movies client logic — search, play, and the shared flip-fullscreen player */

(function () {
  'use strict';

  const searchInput = document.getElementById('mv-search');
  const searchBtn = document.getElementById('mv-search-btn');
  const resultsEl = document.getElementById('mv-results');
  const noteEl = document.getElementById('mv-note');
  const placeholder = document.getElementById('mv-placeholder');
  const videoBox = document.getElementById('mv-video-box');
  const iframe = document.getElementById('mv-iframe');
  const fullscreenBtn = document.getElementById('mv-fullscreen');
  const resetBtn = document.getElementById('mv-reset');
  const sourceLink = document.getElementById('mv-source');
  const resizeHandle = document.getElementById('mv-resize-handle');
  const container = document.getElementById('mv-player-container');
  const titleEl = document.getElementById('mv-title');
  const metaEl = document.getElementById('mv-meta');

  let currentMovie = null;
  let currentPlayerPage = '';

  const isPhone = () =>
    window.matchMedia('(max-width: 820px)').matches ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  };

  /* ---------------- Search ---------------- */

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching…';
    noteEl.textContent = '';
    resultsEl.innerHTML = '<div class="yv-empty">Looking through the shelves…</div>';

    try {
      const res = await fetch('/api/movies?q=' + encodeURIComponent(q));
      const data = await res.json();

      if (!data.items || data.items.length === 0) {
        noteEl.textContent = 'Nothing found. Try a shorter or different title.';
        resultsEl.innerHTML = '<div class="yv-empty">No movies found.</div>';
        return;
      }

      noteEl.textContent = data.exact
        ? data.items.length + ' result' + (data.items.length === 1 ? '' : 's')
        : 'No exact match — showing similar movies';

      renderResults(data.items);
    } catch (e) {
      noteEl.textContent = 'Search failed. Try again in a moment.';
      resultsEl.innerHTML = '<div class="yv-empty">Could not search right now.</div>';
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  }

  function renderResults(items) {
    resultsEl.innerHTML = '';
    items.forEach((item) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mv-item';

      const poster = item.poster
        ? '<img class="mv-poster" loading="lazy" src="' + escapeHtml(item.poster) + '" alt="" onerror="this.style.display=\'none\'">'
        : '<span class="mv-poster-empty">&#127916;</span>';

      const sub = [item.year, item.genre, item.quality].filter(Boolean).join(' · ');
      const badge = item.exact
        ? '<span class="mv-badge exact">MATCH</span>'
        : '<span class="mv-badge">SIMILAR</span>';

      el.innerHTML =
        poster +
        '<span class="mv-info">' +
          '<span class="mv-name">' + escapeHtml(item.title) + '</span>' +
          '<span class="mv-sub">' + escapeHtml(sub) + '</span><br>' +
          badge +
        '</span>';

      el.addEventListener('click', () => selectMovie(item, el));
      resultsEl.appendChild(el);
    });
  }

  /* ---------------- Load a movie ---------------- */

  async function selectMovie(item, el) {
    currentMovie = item;
    currentPlayerPage = item.url;

    document.querySelectorAll('.mv-item').forEach((n) => n.classList.remove('active'));
    if (el) el.classList.add('active');

    closeFS();
    placeholder.classList.remove('hidden');
    placeholder.innerHTML =
      '<div class="yv-placeholder-icon">&#127916;</div><p>Loading ' + escapeHtml(item.title) + '…</p>';
    videoBox.classList.add('hidden');

    titleEl.textContent = item.title || 'Movie';
    metaEl.textContent = [item.year, item.genre, item.quality].filter(Boolean).join(' · ');

    try {
      const res = await fetch('/api/movies?url=' + encodeURIComponent(item.url));
      const data = await res.json();
      if (!data.player) throw new Error(data.error || 'No player found for this movie');

      iframe.src = data.player;
      placeholder.classList.add('hidden');
      videoBox.classList.remove('hidden');

      titleEl.textContent = data.title || item.title;

      if (data.poster) {
        // Nothing visual needed — the player covers the frame.
      }

      currentPlayerPage = data.source || item.url;

      if (data.description) {
        metaEl.textContent = data.description;
      }

      sourceLink.href = currentPlayerPage;
      sourceLink.style.display = 'inline-flex';

      if (!isPhone()) {
        videoBox.style.width = '720px';
        videoBox.style.height = '405px';
      }
    } catch (e) {
      placeholder.innerHTML =
        '<div class="yv-placeholder-icon">&#9888;</div><p>Could not load this movie.</p>' +
        '<p class="yv-hint">' + escapeHtml(e.message) + '</p>';
      placeholder.classList.remove('hidden');
      videoBox.classList.add('hidden');
    }
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

  /* ---------------- Flip-fullscreen ---------------- */

  const fsUI = document.createElement('div');
  fsUI.className = 'yv-fs-ui';
  fsUI.innerHTML =
    '<button type="button" class="yv-fs-btn" id="mv-fs-play" aria-label="Pause">&#10074;&#10074;</button>' +
    '<button type="button" class="yv-fs-btn yv-fs-close" id="mv-fs-close" aria-label="Exit fullscreen">&#10005;</button>';

  const fsHint = document.createElement('div');
  fsHint.className = 'yv-fs-hint';
  fsHint.textContent = 'Drag the white handle to move · tap ✕ to close';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'yv-fs-drag';
  dragHandle.innerHTML = '<span>&#10495;</span>';

  document.body.appendChild(fsUI);
  document.body.appendChild(fsHint);
  videoBox.appendChild(dragHandle);

  const playBtn = fsUI.querySelector('#mv-fs-play');
  const closeBtn = fsUI.querySelector('#mv-fs-close');

  let fsOpen = false;
  let playing = true;
  let prevW = '';
  let prevH = '';

  function setPlayIcon() {
    playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function playerCommand(func) {
    const messages = [
      { event: 'command', func: func, args: [] },
      { method: func === 'playVideo' ? 'play' : 'pause' },
      { api: 'playerjs', method: func === 'playVideo' ? 'play' : 'pause' }
    ];
    messages.forEach((m) => {
      try {
        iframe.contentWindow.postMessage(typeof m === 'string' ? m : JSON.stringify(m), '*');
      } catch (e) { /* not ready */ }
    });
  }

  const isPortrait = () => window.innerHeight > window.innerWidth;

  function layoutFS() {
    if (!fsOpen) return;
    videoBox.classList.toggle('portrait', isPortrait());
  }

  function openFS() {
    if (!currentMovie) return;
    fsOpen = true;

    prevW = videoBox.style.width;
    prevH = videoBox.style.height;
    videoBox.style.width = '';
    videoBox.style.height = '';

    videoBox.classList.add('yv-fs');
    container.classList.add('fs-open');
    document.body.classList.add('yv-fs-lock');
    fsUI.classList.add('open');

    fsHint.classList.remove('open');
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

    if (isPhone()) { openFS(); return; }

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
      videoBox.style.width = '720px';
      videoBox.style.height = '405px';
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
  });

  window.addEventListener('resize', layoutFS);
  window.addEventListener('orientationchange', () => window.setTimeout(layoutFS, 200));

  /* ---------------- Drag ---------------- */

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
    videoBox.style.width = isPhone() ? '' : '720px';
    videoBox.style.height = isPhone() ? '' : '405px';
  });

  /* ---------------- Init ---------------- */

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  setPlayIcon();
  searchInput.value = 'Matrix';
  doSearch();
})();
