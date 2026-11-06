export const onRequestPost = async ({ request }) => {
  try {
    const { proxy } = await request.json();
    if (!proxy) {
      return new Response(JSON.stringify({ ok: false, error: 'No proxy provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const start = Date.now();
    const timeout = 8000;

    // Test by fetching example.com through the proxy using the proxy-URL format
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let ok = false;
    let error = null;

    try {
      // HTTP proxies often support fetching via: http://PROXY/http://target
      const targetUrl = 'http://example.com';
      const proxyUrl = proxy.replace(/^http:\/\//, '');
      const fetchUrl = `http://${proxyUrl}/${targetUrl}`;

      const res = await fetch(fetchUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Connection': 'close' }
      });
      ok = res.ok;
      if (!ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e.message;
    } finally {
      clearTimeout(timer);
    }

    const ms = Date.now() - start;

    return new Response(JSON.stringify({ ok, ms, error: ok ? null : error }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};