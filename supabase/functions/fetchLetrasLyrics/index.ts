// Explicit, authenticated, on-demand Letras.com importer. It returns only
// cleaned lyric lines; callers choose whether to save them with a lesson.
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { extractLetrasLyrics, isLetrasUrl } from "../_shared/lyrics/letras.ts";

const MAX_HTML_BYTES = 1_500_000;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const { url } = await req.json().catch(() => ({}));
  if (!isLetrasUrl(String(url || ""))) {
    return json({ error: "Only HTTPS Letras.com song URLs are accepted." }, 400);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const response = await fetch(String(url), {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Backpack academic lyric importer/1.0",
      },
      redirect: "error",
      signal: ctrl.signal,
    });
    if (!response.ok) return json({ error: `Letras.com returned ${response.status}.` }, 502);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_BYTES) return json({ error: "Lyrics page is too large to import." }, 413);
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) return json({ error: "Lyrics page is too large to import." }, 413);

    const lines = extractLetrasLyrics(html);
    if (!lines.length) return json({ error: "No original lyrics were found on that Letras.com page." }, 422);
    return json({ data: { source_url: String(url), lines, text: lines.join("\n") } });
  } catch (error: any) {
    const message = error?.name === "AbortError" ? "Letras.com did not respond in time." : "Could not fetch lyrics from Letras.com.";
    return json({ error: message }, 502);
  } finally {
    clearTimeout(timer);
  }
});
