/* purrguy.me — tiny image proxy so Kinogo posters aren't blocked by hotlink protection */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*kinogo\.[a-z.]+$/i;

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get('u');
  if (!raw) return new Response('Missing u', { status: 400 });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Invalid u', { status: 400 });
  }
  if (!ALLOWED.test(target.origin)) {
    return new Response('Host not allowed', { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(target.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        Referer: target.origin + '/'
      }
    });

    if (!res.ok) {
      return new Response('Upstream ' + res.status, {
        status: 502,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    const type = res.headers.get('content-type') || 'image/webp';
    if (!/^image\//i.test(type)) {
      return new Response('Not an image', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response('Image fetch failed: ' + e.message, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' }
    });
  } finally {
    clearTimeout(timer);
  }
};
