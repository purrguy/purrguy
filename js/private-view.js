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
  async function navigate(value) {
    if (!value || !value.trim()) return;
    value = value.trim();
    if (emptyEl) emptyEl.hidden = true;

    const isSearch = !isUrl(value);
    const url = isSearch ? null : ensureHttp(value);

    const apiUrl = isSearch
      ? '/api/search?q=' + encodeURIComponent(value)
      : '/api/browse?target=' + encodeURIComponent(url) + (selectedProxy ? '&proxy=' + encodeURIComponent(selectedProxy.url) : '');

    /* Remove the iframe's initial src="about:blank" so srcdoc takes effect */
    frame.removeAttribute('src');

    try {
      const res = await fetch(apiUrl, { cache: 'no-store', headers: { 'Accept': 'text/html' } });
      if (!res.ok) throw new Error('Server returned ' + res.status);

      const html = await res.text();

      /* The browse/search APIs already rewrite every absolute link to route
         through /api/browse, so clicking keeps navigation inside the proxy.
         Use srcdoc (not document.write, which leaves an empty iframe body). */
      frame.srcdoc = html;

      input.value = isSearch ? value : url;
    } catch (e) {
      console.error(e);
      errorMsg.textContent = 'Unable to load page: ' + e.message;
      errorEl.classList.remove('hidden');
      errorEl.removeAttribute('hidden');
    }
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