const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function get(target, proxy, signal) {
  let fetchUrl = target;
  if (proxy) {
    const proxyHost = proxy.replace(/^https?:\/\//, '');
    fetchUrl = `http://${proxyHost}/${target}`;
  }

  const res = await fetch(fetchUrl, {
    method: 'GET',
    signal,
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });

  const contentType = res.headers.get('content-type') || 'text/html';
  const body = await res.text();
  return { res, body, contentType };
}

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  const proxy = url.searchParams.get('proxy');

  if (!target) {
    return new Response('Missing target', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return new Response('Only http/https targets allowed', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }
  } catch {
    return new Response('Invalid target URL', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);

  try {
    let result;
    let usedDirect = false;

    if (proxy) {
      try {
        result = await get(target, proxy, controller.signal);
      } catch {
        result = null;
      }
      // Many public proxies answer 403/429 to datacenter traffic. Retry direct before giving up.
      if (!result || result.res.status === 403 || result.res.status === 429) {
        result = await get(target, null, controller.signal);
        usedDirect = true;
      }
    } else {
      result = await get(target, null, controller.signal);
    }

    if (!result) throw new Error('No response');

    return new Response(result.body, {
      status: result.res.status,
      headers: {
        'Content-Type': result.contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-Browse-Direct': usedDirect ? '1' : '0'
      }
    });
  } catch (e) {
    return new Response('Failed to fetch: ' + e.message, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    });
  } finally {
    clearTimeout(timer);
  }
};
