/* purrguy.me — movies API (search + details), sourced from the Kinogo mirror network */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASES = ['https://kinogo.la', 'https://kinogo.mn', 'https://kinogo.film'];
const TIMEOUT = 9000;
const DEADLINE = 22000;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=600'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function decode(s) {
  return String(s)
    .replace(/&#0*58;/g, ':')
    .replace(/&#0*47;/g, '/')
    .replace(/&#0*38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…');
}

function text(html) {
  return decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'u', я: 'ya'
};

function normalise(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.replace(/[а-яё]/g, (c) => (c in TRANSLIT ? TRANSLIT[c] : c)))
    .join(' ')
    .trim();
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

function tokenMatch(queryToken, titleToken) {
  if (!queryToken || !titleToken) return false;
  if (titleToken === queryToken) return true;
  if (queryToken.length >= 3 && titleToken.startsWith(queryToken)) return true;
  if (titleToken.length >= 3 && queryToken.startsWith(titleToken)) return true;
  if (commonPrefix(queryToken, titleToken) >= Math.min(4, queryToken.length)) return true;
  if (queryToken.length >= 3 && titleToken.length >= 3 && distance(queryToken, titleToken) <= 1) return true;
  return false;
}

function scoreItem(query, item, index) {
  const qn = normalise(query);
  const tn = normalise(item.title);
  const qTokens = qn.split(' ').filter(Boolean);
  const tTokens = tn.split(' ').filter(Boolean);

  let hits = 0;
  for (const qt of qTokens) {
    if (tTokens.some((tt) => tokenMatch(qt, tt))) {
      hits++;
    }
  }

  let score = hits * 20 + index * 0.1;
  if (tn === qn) score += 100;
  else if (tn.startsWith(qn)) score += 50;
  else if (qn && tn.includes(qn)) score += 30;

  // A single-word query that opens the title ("Матрица (1999)") beats a title that merely contains it.
  if (qTokens.length === 1 && tTokens[0] && tokenMatch(qTokens[0], tTokens[0])) score += 25;

  const yearMatch = qn.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && String(item.year) === yearMatch[0]) score += 40;

  const needed = Math.max(1, Math.ceil(qTokens.length * 0.6));
  return { score, exact: hits >= needed };
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        Referer: 'https://kinogo.la/'
      }
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function absolute(base, href) {
  if (!href) return '';
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return base + href;
  return base + '/' + href;
}

function parseResults(html, base, query, rankQuery) {
  const rank = rankQuery || query;
  const marker = /<div\s+class="movie"[^>]*id="(\d+)"/gi;
  const starts = [];
  let m;
  while ((m = marker.exec(html))) {
    starts.push({ index: m.index, id: m[1] });
  }

  const items = [];
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i].index, starts[i + 1] ? starts[i + 1].index : starts[i].index + 9000);

    const linkMatch = block.match(/<h2[^>]*class="[^"]*zagolovki[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href="([^"]+\/\d+-[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = absolute(base, decode(linkMatch[1]));
    if (!/\/\d+-[^/]+\.html$/i.test(url)) continue;

    const title = text(linkMatch[2]);
    if (!title) continue;

    const posterMatch = block.match(/data-src="([^"]*(?:uploads|\/posts\/)[^"]+)"/i)
      || block.match(/<img[^>]+src="(\/uploads\/[^"]+)"/i);
    const yearMatch = block.match(/Год выпуска:\s*(?:<[^>]+>\s*)*(\d{4})/i) || title.match(/\((\d{4})\)\s*$/);

    const fields = {};
    const fieldRe = /<div class="movie__info-item">([\s\S]*?)<\/div>/gi;
    let fm;
    while ((fm = fieldRe.exec(block))) {
      const raw = text(fm[1]);
      const split = raw.match(/^([^:]{2,26}):\s*(.*)$/);
      if (split) fields[split[1].trim()] = split[2].trim();
    }
    const descMatch = block.match(/<div class="movie__info-desc">([\s\S]*?)<\/div>/i);
    const description = descMatch ? text(descMatch[1]) : '';

    items.push({
      id: starts[i].id,
      title,
      url,
      year: yearMatch ? yearMatch[1] : '',
      poster: posterMatch ? absolute(base, decode(posterMatch[1])) : '',
      genre: fields['Жанр'] || '',
      quality: fields['Качество'] || '',
      country: fields['Страна'] || '',
      duration: fields['Продолжительность'] || '',
      description: description || '',
      kp: (block.match(/KP\s*([\d.]+)/i) || [])[1] || '',
      imdb: (block.match(/IMDB\s*([\d.]+)/i) || [])[1] || '',
      _index: i
    });
  }

  const scored = items.map((item) => {
    const s = scoreItem(rank, item, item._index);
    delete item._index;
    return { ...item, score: Math.round(s.score), exact: s.exact };
  });

  scored.sort((a, b) => b.score - a.score);

  // Prefer genuine title matches; only pad with the site's own list when very few match.
  const strong = scored.filter((item) => item.score >= 20);
  const final = strong.length > 0 ? strong : scored;

  const top = final[0];
  const exact = Boolean(top && top.exact && final.length > 0);
  return { items: final.slice(0, 18), exact };
}

function unwrapImages(html) {
  return html
    .replace(/<img([^>]+)src="\/templates\/Kinogo\/images\/lazy-[^"]*"([^>]*)>/gi, '<img$1src=""$2>')
    .replace(/data-src="([^"]+)"/gi, 'src="$1"');
}

export const onRequestGet = async ({ request }) => {
  try {
    return await handle(request);
  } catch (e) {
    return json({ error: 'Movies service error', detail: String(e).slice(0, 160), items: [], exact: false }, 200);
  }
};

async function handle(request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const filmUrl = (url.searchParams.get('url') || '').trim();

  /* ---------- details + player ---------- */
  if (filmUrl) {
    let target;
    try {
      target = new URL(filmUrl);
    } catch {
      return json({ error: 'Invalid film url' }, 400);
    }
    if (!/^https?:$/.test(target.protocol)) return json({ error: 'Invalid film url' }, 400);

    let page;
    try {
      page = await fetchPage(target.href);
    } catch (e) {
      return json({ error: 'Could not reach the movie page', detail: String(e).slice(0, 120) }, 502);
    }
    if (!page.ok) return json({ error: 'Movie page returned ' + page.status }, 502);

    const html = page.body;
    const base = 'https://' + target.host;

    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    const ogTitle = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1];
    const title = text(h1 || ogTitle || '');

    const ogImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1];
    const poster = ogImage ? absolute(base, decode(ogImage)) : '';

    const ogDesc = (html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i) || [])[1];
    const description = text(ogDesc || '');

    const iframes = [];
    const iframeRe = /<iframe[^>]+(?:data-)?src="([^"]+)"/gi;
    let im;
    while ((im = iframeRe.exec(html))) iframes.push(decode(im[1]));
    const dataEmbeds = [];
    const dataRe = /data-src="([^"]*(?:embed|player|kodik|nextembed)[^"]*)"/gi;
    while ((im = dataRe.exec(html))) dataEmbeds.push(decode(im[1]));

    const candidates = [...iframes, ...dataEmbeds]
      .map((src) => absolute(base, src))
      .filter((src) => /^https?:\/\//i.test(src))
      .filter((src) => !/trailer|allarknow|luxembd|yandex|vk\.com|ok\.ru|youtube|youtu\.be/i.test(src));

    const player = candidates.find((src) => /nextembed|kodik|videocdn|alloha|embed/i.test(src)) || candidates[0] || '';

    return json({
      title,
      poster,
      description,
      player,
      players: [...new Set(candidates)].slice(0, 6),
      source: page.url
    });
  }

  /* ---------- search ---------- */
  if (!q) return json({ error: 'Missing q' }, 400);
  if (q.length > 160) return json({ error: 'Query too long' }, 400);

  const deadline = Date.now() + DEADLINE;
  const first = await runSearch(q, q, deadline, BASES);
  if (first.items.length) {
    return json({ query: q, exact: first.exact, items: first.items, source: first.source });
  }

  /* Typo fallback: the site's search needs a real substring, so try trimming the tail
     ("Intersteler" -> "Interstel" matches "Interstellar") and rank against the original. */
  const compact = q.replace(/\s+/g, ' ').trim();
  const variants = [];
  if (/^[a-z0-9 ]{7,}$/i.test(compact)) {
    for (const cut of [1, 2, 3]) {
      const v = compact.slice(0, compact.length - cut).trim();
      if (v.length >= 6 && !variants.includes(v)) variants.push(v);
    }
  }

  for (const v of variants) {
    if (Date.now() > deadline) break;
    const alt = await runSearch(v, q, deadline, BASES.slice(0, 1));
    if (alt.items.length) {
      return json({ query: q, exact: false, similar: true, items: alt.items, source: alt.source });
    }
  }

  // No results is not a server failure — answer 200 so the client can show "similar movies".
  return json({ query: q, exact: false, items: [], error: 'Search failed: ' + first.lastError }, 200);
}

async function runSearch(query, rankQuery, deadline, bases) {
  const attempts = [];
  for (const base of bases) {
    attempts.push(base + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query));
  }
  for (const base of bases) {
    attempts.push(base + '/search/' + encodeURIComponent(query));
  }

  let lastError = '';
  for (const attempt of attempts) {
    if (Date.now() > deadline) return { items: [], exact: false, lastError: 'timed out' };
    try {
      const page = await fetchPage(attempt);
      if (!page.ok) { lastError = 'HTTP ' + page.status; continue; }
      if (/Just a moment|cf-chl|challenge-platform/i.test(page.body)) { lastError = 'challenge'; continue; }

      const origin = new URL(page.url).origin;
      const parsed = parseResults(page.body, origin, query, rankQuery);
      if (parsed.items.length) {
        return { items: parsed.items, exact: parsed.exact, source: page.url };
      }
      lastError = 'no results';
    } catch (e) {
      lastError = String(e).slice(0, 120);
    }
  }
  return { items: [], exact: false, lastError };
};
