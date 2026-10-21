export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API submissions locally
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      try {
        const form = await request.formData();
        const discord = (form.get('discord') || '').toString().trim();
        const player = (form.get('player') || '').toString().trim();
        const clipUrl = (form.get('clipUrl') || '').toString().trim();
        const file = form.get('clipFile');
        if (!discord || !player) {
          return new Response(JSON.stringify({ error: 'Discord username and player name are required.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!clipUrl && !file) {
          return new Response(JSON.stringify({ error: 'Provide a clip link or a video file.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
          });
        }
        const record = {
          discord, player, clipUrl,
          fileName: file ? file.name : null,
          fileSize: file ? file.size : 0,
          submittedAt: new Date().toISOString(),
        };
        // Send to Discord webhook if configured (attach file if present)
        const webhook = (env && env.DISCORD_WEBHOOK_APLK) || '';
        if (webhook) {
          try {
            const embed = {
              title: 'New AppleKour clip submission',
              color: 0x7b8cff,
              fields: [
                { name: 'Discord', value: discord, inline: true },
                { name: 'Player', value: player, inline: true },
                { name: 'Clip link', value: clipUrl || '(none)', inline: false },
                { name: 'File', value: (file ? file.name + ' (' + file.size + ' bytes)' : '(none)'), inline: false },
              ],
              timestamp: record.submittedAt,
            };
            if (file) {
              // Send as multipart/form-data with the file attached
              const fd = new FormData();
              fd.append('file', file, file.name);
              fd.append('payload_json', JSON.stringify({ username: 'AppleKour Submissions', embeds: [embed] }));
              await fetch(webhook, { method: 'POST', body: fd });
            } else {
              await fetch(webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'AppleKour Submissions', embeds: [embed] }),
              });
            }
          } catch (e) { /* webhook failure should not block submission */ }
        }
        return new Response(JSON.stringify({ ok: true, message: 'Submission received.' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Submission failed: ' + (e && e.message) }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Serve static assets
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
