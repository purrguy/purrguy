/* purrguy.me — server-side web search (datacenter-friendly fallbacks) */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT = 15000;

const ENGINES = [
  {
    name: 'duckduckgo',
    url: (q) => 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)
  },
  {
    name: 'bing',
    url: (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&count=20'
  },
  {
    name: 'google',
    url: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q) + '&num=20'
  }
];

function clean(html) {
  return html
    /* DuckDuckGo wraps results in /l/?uddg= redirects — unwrap them */
    .replace(/(?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=([^"'&<>\s]+)[^"'<>]*/gi, (m, enc) => {
      try {
        return decodeURIComponent(enc);
      } catch {
        return m;
      }
    })
    /* strip DDG's own tracking pixel scripts that would 404 through the iframe */
    .replace(/<script[^>]+src="[^"]*duckduckgo[^"]*"[^>]*><\/script>/gi, '');
}

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return new Response('Missing q', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }
  if (q.length > 300) {
    return new Response('Query too long', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  let last = '';

  for (const engine of ENGINES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(engine.url(q), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await res.text();

      const blocked = /Just a moment|cf-chl|challenge-platform|unusual traffic|not a robot|429/i.test(html.slice(0, 4000));
      if (res.ok && html.length > 1200 && !blocked) {
        return new Response(clean(html), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
            'X-Search-Engine': engine.name
          }
        });
      }
      last = engine.name + ' ' + res.status + (blocked ? ' (blocked)' : '');
    } catch (e) {
      last = engine.name + ': ' + String(e).slice(0, 100);
    } finally {
      clearTimeout(timer);
    }
  }

  return new Response('All search engines refused the request: ' + last, {
    status: 502,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
  });
};
