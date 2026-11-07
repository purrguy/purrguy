/* Private View client logic */

(function() {
  const input = document.getElementById('pv-input');
  const goBtn = document.getElementById('pv-go');
  const frame = document.getElementById('pv-frame');
  const loading = document.getElementById('pv-loading');
  const errorEl = document.getElementById('pv-error');
  const errorMsg = document.getElementById('pv-error-msg');
  const emptyEl = document.getElementById('pv-empty');
  const retryBtn = document.getElementById('pv-retry');
  const proxySelect = document.getElementById('proxy-select');
  const proxyTestBtn = document.getElementById('proxy-test');
  const proxyStatus = document.getElementById('proxy-status');

  let selectedProxy = null; // { url, label }
  let proxies = [];

  // ---------- Load proxy list ----------
  async function loadProxies() {
    try {
      const res = await fetch('/api/proxies');
      if (res.ok) {
        proxies = await res.json();
        renderProxies();
      }
    } catch (e) {
      console.warn('Could not load proxy list', e);
    }
  }

  function renderProxies() {
    proxySelect.innerHTML = '<option value="none">Direct connection (no proxy)</option>';
    proxies.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.url;
      opt.textContent = p.label || p.url;
      proxySelect.appendChild(opt);
    });
  }

  // ---------- Test proxy ----------
  proxyTestBtn.addEventListener('click', async () => {
    const val = proxySelect.value;
    if (val === 'none') {
      proxyStatus.textContent = 'No proxy selected.';
      proxyStatus.className = 'proxy-status';
      selectedProxy = null;
      goBtn.disabled = false;
      return;
    }

    proxyStatus.textContent = 'Testing proxy...';
    proxyStatus.className = 'proxy-status checking';
    goBtn.disabled = true;

    try {
      const res = await fetch('/api/proxy-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: val })
      });
      const data = await res.json();
      if (data.ok) {
        proxyStatus.textContent = 'Proxy OK (' + data.ms + 'ms)';
        proxyStatus.className = 'proxy-status ok';
        selectedProxy = { url: val, label: proxySelect.options[proxySelect.selectedIndex].text };
        goBtn.disabled = false;
      } else {
        proxyStatus.textContent = 'Proxy failed: ' + (data.error || 'no response');
        proxyStatus.className = 'proxy-status bad';
        selectedProxy = null;
        goBtn.disabled = true;
      }
    } catch (e) {
      proxyStatus.textContent = 'Proxy test error.';
      proxyStatus.className = 'proxy-status bad';
      selectedProxy = null;
      goBtn.disabled = true;
    }
  });

  proxySelect.addEventListener('change', () => {
    if (proxySelect.value === 'none') {
      proxyStatus.textContent = '';
      proxyStatus.className = 'proxy-status';
      selectedProxy = null;
      goBtn.disabled = false;
      return;
    }
    // Auto-test on select
    proxyTestBtn.click();
  });

  // ---------- Detect if input is URL or search ----------
  function isUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function ensureHttp(value) {
    if (!/^https?:\/\//i.test(value)) return 'https://' + value;
    return value;
  }

  // ---------- Navigate ----------
  function setLoading(show) {
    loading.hidden = !show;
    loading.classList.toggle('hidden', !show);
    errorEl.classList.add('hidden');
    frame.hidden = show;
  }

  async function navigate(value) {
    if (!value || !value.trim()) return;
    value = value.trim();
    if (emptyEl) emptyEl.hidden = true;

    const isSearch = !isUrl(value);
    const url = isSearch ? null : ensureHttp(value);

    setLoading(true);
    goBtn.disabled = true;

    try {
      let res;
      if (isSearch) {
        res = await fetch('/api/search?q=' + encodeURIComponent(value), {
          headers: { 'Accept': 'text/html' },
          cache: 'no-store'
        });
      } else {
        const params = new URLSearchParams({ target: url });
        if (selectedProxy) params.set('proxy', selectedProxy.url);
        res = await fetch('/api/browse?' + params.toString(), {
          headers: { 'Accept': 'text/html' }
        });
      }

      if (!res.ok) throw new Error('Server returned ' + res.status);

      const html = await res.text();
      const baseOrigin = isSearch
        ? (res.headers.get('X-Search-Origin') || 'https://html.duckduckgo.com')
        : new URL(url).origin;
      const rewritten = rewriteUrls(html, baseOrigin);

      // Load into iframe
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write(rewritten);
      doc.close();

      setupFrameLinks(frame);

      if (!isSearch && res.headers.get('X-Browse-Direct') === '1' && selectedProxy) {
        proxyStatus.textContent = 'Proxy blocked — loaded directly through Cloudflare instead.';
        proxyStatus.className = 'proxy-status';
      }

      input.value = isSearch ? value : url;
      setLoading(false);
      goBtn.disabled = false;
    } catch (e) {
      console.error(e);
      setLoading(false);
      errorMsg.textContent = 'Unable to load page: ' + e.message;
      errorEl.classList.remove('hidden');
      goBtn.disabled = false;
    }
  }

  // Rewrite links so clicks stay within the proxy
  function rewriteUrls(html, origin) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Remove existing base tag
      const existingBase = doc.querySelector('base');
      if (existingBase) existingBase.remove();

      // Inject base tag so relative URLs resolve against the original site
      const head = doc.querySelector('head');
      if (head) {
        const base = doc.createElement('base');
        base.href = origin + '/';
        head.insertBefore(base, head.firstChild);
      }

      // Rewrite every absolute link to route through the private proxy
      doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || !/^https?:\/\//i.test(href)) return;
        a.setAttribute('href', '/api/browse?target=' + encodeURIComponent(href));
      });

      return doc.documentElement.outerHTML;
    } catch {
      return html;
    }
  }

  // ---------- Keep navigation inside the private browser ----------
  function setupFrameLinks(frameEl) {
    const doc = frameEl.contentDocument || frameEl.contentWindow.document;
    if (!doc) return;

    // Clicking a link → open it through the proxy, not the live site
    doc.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.download) return;
      e.preventDefault();
      e.stopPropagation();

      let target = a.href;
      // Links rewritten by rewriteUrls are already proxy URLs — extract the original target
      try {
        const orig = new URL(target).searchParams.get('target');
        if (orig) target = orig;
      } catch {}

      navigate(target);
    }, true);

    // GET form submission → submit through the proxy
    doc.addEventListener('submit', (e) => {
      const form = e.target.closest('form');
      if (!form) return;
      if ((form.method || 'GET').toUpperCase() !== 'GET') return;
      e.preventDefault();
      e.stopPropagation();
      if (!form.action) return;
      const params = new URLSearchParams();
      try {
        new FormData(form).forEach((v, k) => params.append(k, v));
      } catch {}
      navigate(form.action + (form.action.includes('?') ? '&' : '?') + params.toString());
    }, true);
  }

  // ---------- Events ----------
  goBtn.addEventListener('click', () => navigate(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(input.value);
  });

  retryBtn.addEventListener('click', () => navigate(input.value));

  // Shortcut buttons
  document.querySelectorAll('.shortcut').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.q;
      navigate(btn.dataset.q);
    });
  });

  // ---------- Init ----------
  loadProxies();
  goBtn.disabled = false;
  setLoading(false);
  if (emptyEl) emptyEl.hidden = false;
})();