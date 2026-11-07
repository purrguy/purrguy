/* Movies client logic — search, native HLS playback, and the shared flip-fullscreen player */

(function () {
  'use strict';

  const searchInput = document.getElementById('mv-search');
  const searchBtn = document.getElementById('mv-search-btn');
  const resultsEl = document.getElementById('mv-results');
  const noteEl = document.getElementById('mv-note');
  const placeholder = document.getElementById('mv-placeholder');
  const videoBox = document.getElementById('mv-video-box');
  const video = document.getElementById('mv-video');
  const fullscreenBtn = document.getElementById('mv-fullscreen');
  const resetBtn = document.getElementById('mv-reset');
  const sourceLink = document.getElementById('mv-source');
  const resizeHandle = document.getElementById('mv-resize-handle');
  const container = document.getElementById('mv-player-container');
  const titleEl = document.getElementById('mv-title');
  const metaEl = document.getElementById('mv-meta');

  let currentMovie = null;
  let currentPlayerPage = '';
  let currentStream = '';
  let hls = null;

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

      const posterSrc = item.poster ? '/api/img?u=' + encodeURIComponent(item.poster) : '';
      const poster = posterSrc
        ? '<img class="mv-poster" loading="lazy" src="' + escapeHtml(posterSrc) + '" alt="" onerror="this.style.display=\'none\'">'
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

  /* ---------------- Player ---------------- */

  function teardownVideo() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    currentStream = '';
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
  }

  function showPlaybackError(message) {
    placeholder.innerHTML =
      '<div class="yv-placeholder-icon">&#9888;</div><p>Could not play this movie.</p>' +
      '<p class="yv-hint">' + escapeHtml(message) + '</p>';
    placeholder.classList.remove('hidden');
    videoBox.classList.add('hidden');
  }

  function playStream(url) {
    teardownVideo();
    currentStream = url;

    let ready = false;
    const onReady = () => {
      if (ready) return;
      ready = true;
      placeholder.classList.add('hidden');
      video.play().catch(() => { /* autoplay may need a tap — the controls are right there */ });
    };

    video.addEventListener('loadedmetadata', onReady);

    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ maxBufferLength: 30, enableWorker: true });
      hls.on(window.Hls.Events.MANIFEST_PARSED, onReady);
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (!data || !data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        showPlaybackError('The video stream stopped responding.');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      showPlaybackError('This browser does not support HLS video.');
    }
  }

  /* The embedding player refuses requests that carry a Cloudflare Worker header
     (HTTP 422), but it does allow cross-origin reads from purrguy.me. So pull the
     player page straight from the browser; fall back to the server extractor. */
  async function resolveStream(playerUrl) {
    try {
      const r = await fetch(playerUrl, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      if (r.ok) {
        const html = await r.text();
        const m = html.match(/hls\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)
          || html.match(/["']((?:https?:)?\\?\/\\?\/[^"']+\.m3u8[^"']*)["']/i);
        if (m) return m[1].replace(/\\\//g, '/');
      }
    } catch (e) {
      /* fall through to the server-side extractor */
    }

    try {
      const res = await fetch('/api/movies?stream=' + encodeURIComponent(playerUrl));
      const data = await res.json();
      if (data.stream) return data.stream;
    } catch (e) {}

    return '';
  }

  async function selectMovie(item, el) {
    currentMovie = item;
    currentPlayerPage = item.url;

    document.querySelectorAll('.mv-item').forEach((n) => n.classList.remove('active'));
    if (el) el.classList.add('active');

    closeFS();
    teardownVideo();
    videoBox.classList.add('hidden');
    placeholder.classList.remove('hidden');
    placeholder.innerHTML =
      '<div class="yv-placeholder-icon">&#127916;</div><p>Loading ' + escapeHtml(item.title) + '…</p>';

    titleEl.textContent = item.title || 'Movie';
    metaEl.textContent = [item.year, item.genre, item.quality].filter(Boolean).join(' · ');

    try {
      const res = await fetch('/api/movies?url=' + encodeURIComponent(item.url));
      const data = await res.json();
      if (!data.player) throw new Error(data.error || 'No player found for this movie');

      const stream = await resolveStream(data.player);
      if (!stream) throw new Error('No video stream found for this movie');

      titleEl.textContent = data.title || item.title;
      if (data.description) metaEl.textContent = data.description;

      currentPlayerPage = data.source || item.url;
      sourceLink.href = currentPlayerPage;
      sourceLink.style.display = 'inline-flex';

      video.poster = data.poster ? '/api/img?u=' + encodeURIComponent(data.poster) : '';

      videoBox.classList.remove('hidden');
      if (!isPhone()) {
        videoBox.style.width = '720px';
        videoBox.style.height = '405px';
      }

      placeholder.innerHTML =
        '<div class="yv-placeholder-icon">&#127916;</div><p>Buffering ' + escapeHtml(data.title || item.title) + '…</p>';

      playStream(sdata.stream);
    } catch (e) {
      showPlaybackError(e.message);
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
  let prevW = '';
  let prevH = '';

  function setPlayIcon() {
    const playing = !video.paused && !video.ended;
    playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  video.addEventListener('play', setPlayIcon);
  video.addEventListener('pause', setPlayIcon);
  video.addEventListener('ended', setPlayIcon);

  playBtn.addEventListener('click', () => {
    if (video.paused || video.ended) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  const isPortrait = () => window.innerHeight > window.innerWidth;

  function layoutFS() {
    if (!fsOpen) return;
    videoBox.classList.toggle('portrait', isPortrait());
  }

  function openFS() {
    if (!currentMovie || !currentStream) return;
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
    setPlayIcon();
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
