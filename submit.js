const MAX_FILE_SIZE = 8 * 1024 * 1024;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }});
}
export async function onRequestPost({ request, env }) {
  const webhookUrl = env.WEBHOOK_SECRET_APLK;
  if (!webhookUrl) return json({ error: "Server is not configured yet." }, 500);
  let target;
  try { target = new URL(webhookUrl); } catch { return json({ error: "Server webhook configuration is invalid." }, 500); }
  if (target.protocol !== "https:" ||
      !["discord.com","discordapp.com","canary.discord.com","ptb.discord.com"].includes(target.hostname) ||
      !target.pathname.startsWith("/api/webhooks/")) {
    return json({ error: "Server webhook configuration is invalid." }, 500);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_FILE_SIZE + 200000) return json({ error: "Maximum file size is 8 MB." }, 413);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Invalid form submission." }, 400); }
  const discord = String(form.get("discord") || "").trim().slice(0,100);
  const player = String(form.get("player") || "").trim().slice(0,80);
  const clipUrl = String(form.get("clipUrl") || "").trim().slice(0,1000);
  const file = form.get("clipFile");
  if (!discord || !player) return json({ error: "Fill in both username fields." }, 400);
  const hasFile = file instanceof File && file.size > 0;
  if (!clipUrl && !hasFile) return json({ error: "Add a clip link or upload a video file." }, 400);
  if (clipUrl) {
    try { const u = new URL(clipUrl); if (!["http:","https:"].includes(u.protocol)) throw 0; }
    catch { return json({ error: "Clip link must be a valid http(s) URL." }, 400); }
  }
  if (hasFile) {
    if (file.size > MAX_FILE_SIZE) return json({ error: "Video file is over the 8 MB limit." }, 413);
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name))
      return json({ error: "Please upload a video file." }, 400);
  }
  const message = [
    "**AppleKour Community — Hard Tricks submission**",
    `**Discord username / ID:** ${discord.replace(/@/g, "@​")}`,
    `**Username / nickname:** ${player.replace(/@/g, "@​")}`,
    `**Clip link:** ${clipUrl || "Not provided"}`,
    `**Uploaded file:** ${hasFile ? file.name.slice(0,150) : "Not provided"}`
  ].join("\n").slice(0,1900);
  const outgoing = new FormData();
  outgoing.set("payload_json", JSON.stringify({ content: message, allowed_mentions: { parse: [] } }));
  if (hasFile) outgoing.set("files[0]", file, file.name.replace(/[^\w.\- ()]/g, "_").slice(0,100) || "clip.mp4");
  let response;
  try { response = await fetch(webhookUrl, { method: "POST", body: outgoing }); }
  catch { return json({ error: "Could not reach the submission service. Try again later." }, 502); }
  if (!response.ok) return json({ error: "The submission service rejected the upload. Try a smaller file or contact the site owner." }, 502);
  return json({ ok: true });
}
