export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  if (!q) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // Fetch YouTube search results page and parse ytInitialData
    const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!res.ok) throw new Error('YouTube fetch failed');

    const html = await res.text();

    // Extract ytInitialData JSON
    const match = html.match(/ytInitialData\s*=\s*(\{.*?\});/);
    if (!match) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

    const data = JSON.parse(match[1]);
    const videos = [];

    // Navigate the complex YouTube JSON structure to find video results
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

    for (const section of contents) {
      const itemSection = section?.itemSectionRenderer;
      if (!itemSection) continue;

      for (const item of itemSection.contents || []) {
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;

        // Skip shorts (shorts have different renderer or shortViewModel)
        if (videoRenderer.shortViewModel) continue;

        const videoId = videoRenderer.videoId;
        const title = videoRenderer.title?.runs?.[0]?.text || 'Untitled';
        const channel = videoRenderer.ownerText?.runs?.[0]?.text || 'Unknown';
        const viewCount = videoRenderer.viewCountText?.simpleText || '';
        const published = videoRenderer.publishedTimeText?.simpleText || '';
        const thumbnail = videoRenderer.thumbnail?.thumbnails?.[videoRenderer.thumbnail.thumbnails.length - 1]?.url || '';

        if (videoId) {
          videos.push({
            id: videoId,
            title,
            channel,
            views: viewCount,
            age: published,
            thumbnail: thumbnail.replace('&amp;', '&'),
            isShort: false
          });
        }

        if (videos.length >= 12) break;
      }
      if (videos.length >= 12) break;
    }

    return new Response(JSON.stringify(videos), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
    });
  } catch (e) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
};