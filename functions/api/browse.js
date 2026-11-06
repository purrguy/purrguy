export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  const proxy = url.searchParams.get('proxy');

  if (!target) {
    return new Response('Missing target', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  // Validate target is http/https
  let targetUrl;
  try {
    targetUrl = new URL(target);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return new Response('Only http/https targets allowed', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }
  } catch {
    return new Response('Invalid target URL', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const timeout = 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let fetchUrl = target;
    let init = { method: 'GET', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; purrguy-private-view/1.0)' } };

    if (proxy) {
      // Route through HTTP proxy using proxy-URL format
      const proxyHost = proxy.replace(/^http:\/\//, '');
      fetchUrl = `http://${proxyHost}/${target}`;
    }

    const res = await fetch(fetchUrl, init);
    const contentType = res.headers.get('content-type') || 'text/html';
    const body = await res.text();

    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return new Response('Failed to fetch through proxy: ' + e.message, { status: 502, headers: { 'Content-Type': 'text/plain' } });
  } finally {
    clearTimeout(timer);
  }
};